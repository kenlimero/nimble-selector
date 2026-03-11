import { MODULE_ID, TEMPLATE_PATH, SCHOOL_ICONS, capitalize, buildOwnedItemKeys } from '../utils/constants.mjs';
import { SpellSchoolResolver } from '../data/SpellSchoolResolver.mjs';
import { SpellTierResolver } from '../data/SpellTierResolver.mjs';
import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';
import { ItemGranter } from '../core/ItemGranter.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for selecting and granting spells to a character.
 * Filters spells by school and tier based on class/subclass access.
 */
class SpellSelector extends HandlebarsApplicationMixin(ApplicationV2) {
	/** @type {Actor} */
	#actor;
	/** @type {string} */
	#classIdentifier;
	/** @type {string|null} */
	#subclassIdentifier;
	/** @type {number} */
	#level;
	/** @type {import('../core/CompendiumBrowser.mjs').SpellData[]} */
	#allSpells = [];
	/** @type {Map<string, import('../core/CompendiumBrowser.mjs').SpellData>} UUID-keyed lookup. */
	#spellsByUuid = new Map();
	/** @type {Set<string>} */
	#selectedUuids = new Set();
	/** @type {Set<string>} */
	#ownedSpellKeys = new Set();
	/** @type {string} Active school filter (empty = show all). */
	#activeSchool = '';
	/** @type {number|null} Active tier filter (null = show all). */
	#activeTier = null;
	#scrollTop = 0;
	#dataLoaded = false;
	/** @type {string[]} */
	#grantedSchools = [];
	/** @type {number} */
	#maxTier = 0;
	#schoolResolver = new SpellSchoolResolver();
	#tierResolver = new SpellTierResolver();
	#compendiumBrowser = CompendiumBrowser.instance;
	#granter = new ItemGranter();

	static DEFAULT_OPTIONS = {
		id: `${MODULE_ID}-spell-selector`,
		classes: [MODULE_ID, 'nimble-selector'],
		window: {
			title: 'Spell Selection',
			icon: 'fa-solid fa-hat-wizard',
			resizable: true,
		},
		position: {
			width: 550,
			height: 'auto',
		},
		actions: {
			filterSchool: SpellSelector.#onFilterSchool,
			filterTier: SpellSelector.#onFilterTier,
			toggleSpell: SpellSelector.#onToggleSpell,
			confirm: SpellSelector.#onConfirm,
			cancel: SpellSelector.#onCancel,
		},
	};

	static PARTS = {
		form: {
			template: `${TEMPLATE_PATH}/spell-selector.hbs`,
		},
	};

	/**
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} [subclassIdentifier=null]
	 * @param {object} [options={}]
	 */
	constructor(actor, classIdentifier, level, subclassIdentifier = null, options = {}) {
		super(options);
		this.#actor = actor;
		this.#classIdentifier = classIdentifier;
		this.#subclassIdentifier = subclassIdentifier;
		this.#level = level;
	}

	/**
	 * Load spell data once (schools, tiers, spell list, owned keys).
	 */
	#loadSpellData() {
		if (this.#dataLoaded) return;

		const schoolAccess = this.#schoolResolver.resolve(
			this.#classIdentifier,
			this.#level,
			this.#subclassIdentifier,
		);
		this.#maxTier = this.#tierResolver.resolve(
			this.#classIdentifier,
			this.#level,
			this.#subclassIdentifier,
		);

		this.#grantedSchools = schoolAccess.granted;

		// No spellcasting at this level — skip compendium query
		if (this.#maxTier < 0 || this.#grantedSchools.length === 0) {
			this.#allSpells = [];
			this.#spellsByUuid = new Map();
			this.#dataLoaded = true;
			return;
		}

		const hasUtility = this.#grantedSchools.includes('utility');
		const realSchools = this.#grantedSchools.filter((s) => s !== 'utility');

		this.#allSpells = this.#compendiumBrowser.findSpellsBySchoolAndTier(realSchools, this.#maxTier, hasUtility);
		this.#spellsByUuid = new Map(this.#allSpells.map((s) => [s.uuid, s]));
		this.#ownedSpellKeys = buildOwnedItemKeys(this.#actor, 'spell');
		this.#dataLoaded = true;
	}

	/** @override */
	async _prepareContext() {
		this.#loadSpellData();

		const schools = this.#grantedSchools.map((s) => ({
			id: s,
			label: capitalize(s),
			icon: SCHOOL_ICONS[s] ?? 'fa-solid fa-sparkles',
			active: this.#activeSchool === s,
		}));

		const availableTiers = this.#buildTierFilters();
		const filteredSpells = this.#getFilteredSpells().map((s) => this.#enrichSpellForDisplay(s));
		const selectedCount = this.#selectedUuids.size;

		return {
			className: capitalize(this.#classIdentifier),
			maxTier: this.#maxTier,
			schools,
			activeSchool: this.#activeSchool,
			availableTiers,
			activeTier: this.#activeTier,
			filteredSpells,
			selectedCount,
			hasSelection: selectedCount > 0,
		};
	}

	/**
	 * Build tier filter buttons from 0 (cantrips) to maxTier.
	 * @returns {Array<{tier: number, label: string, active: boolean}>}
	 */
	#buildTierFilters() {
		const tiers = [];
		for (let t = 0; t <= this.#maxTier; t++) {
			tiers.push({
				tier: t,
				label: SpellSelector.#getTierLabel(t),
				active: this.#activeTier === t,
			});
		}
		return tiers;
	}

	/**
	 * Apply active school and tier filters to the spell list.
	 * @returns {import('../core/CompendiumBrowser.mjs').SpellData[]}
	 */
	#getFilteredSpells() {
		let spells = this.#allSpells;

		if (this.#activeSchool) {
			spells = this.#activeSchool === 'utility'
				? spells.filter((s) => s.isUtility)
				: spells.filter((s) => s._normalizedSchool === this.#activeSchool);
		}

		if (this.#activeTier != null) {
			spells = spells.filter((s) => s.tier === this.#activeTier);
		}

		return spells;
	}

	/**
	 * Enrich a spell with display-specific properties (ownership, labels, selection state).
	 * @param {import('../core/CompendiumBrowser.mjs').SpellData} spell
	 * @returns {object}
	 */
	#enrichSpellForDisplay(spell) {
		const alreadyOwned =
			this.#ownedSpellKeys.has(spell._normalizedName) ||
			(spell.uuid && this.#ownedSpellKeys.has(spell.uuid));

		return {
			...spell,
			alreadyOwned,
			selected: !alreadyOwned && this.#selectedUuids.has(spell.uuid),
			schoolIcon: SCHOOL_ICONS[spell._normalizedSchool] ?? '',
			schoolLabel: capitalize(spell.school),
			tierLabel: spell.isUtility
				? game.i18n.localize('NIMBLE_SELECTOR.spells.utility')
				: SpellSelector.#getTierLabel(spell.tier),
			tierClass: spell.isUtility ? 'utility' : (spell.tier === 0 ? 'cantrip' : String(spell.tier)),
		};
	}

	/**
	 * Get a human-readable label for a spell tier.
	 * @param {number} tier
	 * @returns {string}
	 */
	static #getTierLabel(tier) {
		if (tier === 0) return game.i18n.localize('NIMBLE_SELECTOR.spells.cantrip');
		return `${game.i18n.localize('NIMBLE_SELECTOR.spells.tier')} ${tier}`;
	}

	/** @override */
	_onRender(_context, _options) {
		const scrollArea = this.element?.querySelector('.nimble-selector__scroll-area');
		if (scrollArea) scrollArea.scrollTop = this.#scrollTop;
	}

	/**
	 * Save current scroll position before re-render.
	 */
	#saveScrollPosition() {
		const scrollArea = this.element?.querySelector('.nimble-selector__scroll-area');
		if (scrollArea) this.#scrollTop = scrollArea.scrollTop;
	}

	/* ---------------------------------------- */
	/*  Action Handlers                         */
	/* ---------------------------------------- */

	/** @this {SpellSelector} */
	static #onFilterSchool(_event, target) {
		const school = target.dataset.school;
		this.#activeSchool = this.#activeSchool === school ? '' : school;
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {SpellSelector} */
	static #onFilterTier(_event, target) {
		const tier = target.dataset.tier;
		if (tier === '') {
			this.#activeTier = null;
		} else {
			const parsed = Number(tier);
			this.#activeTier = this.#activeTier === parsed ? null : parsed;
		}
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {SpellSelector} */
	static #onToggleSpell(_event, target) {
		const uuid = target.dataset.uuid;
		if (!uuid) return;

		// Prevent toggling already-owned spells
		if (this.#ownedSpellKeys.has(uuid)) return;
		const spell = this.#spellsByUuid.get(uuid);
		if (spell && this.#ownedSpellKeys.has(spell._normalizedName)) return;

		if (this.#selectedUuids.has(uuid)) {
			this.#selectedUuids.delete(uuid);
		} else {
			this.#selectedUuids.add(uuid);
		}
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {SpellSelector} */
	static async #onConfirm() {
		const uuids = [...this.#selectedUuids].filter(Boolean);
		if (!uuids.length) return;

		await this.#granter.grantItemsByUuid(this.#actor, uuids);
		this.#selectedUuids.clear();
		ui.notifications.info(
			game.i18n.format('NIMBLE_SELECTOR.notifications.grantedSpells', {
				count: uuids.length,
				name: this.#actor.name,
			}),
		);
		this.close();
	}

	/** @this {SpellSelector} */
	static #onCancel() {
		this.close();
	}
}

export { SpellSelector };
