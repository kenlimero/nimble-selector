import { MODULE_ID, TEMPLATE_PATH, SCHOOL_ICONS } from '../utils/constants.mjs';
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
	#actor;
	#classIdentifier;
	#subclassIdentifier;
	#level;
	#allSpells = [];
	#selectedUuids = new Set();
	#ownedSpellKeys = new Set();
	#activeSchool = '';
	#activeTier = null;
	#scrollTop = 0;
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

	constructor(actor, classIdentifier, level, subclassIdentifier = null, options = {}) {
		super(options);
		this.#actor = actor;
		this.#classIdentifier = classIdentifier;
		this.#subclassIdentifier = subclassIdentifier;
		this.#level = level;
	}

	async _prepareContext() {
		const schoolAccess = this.#schoolResolver.resolve(
			this.#classIdentifier,
			this.#level,
			this.#subclassIdentifier,
		);
		const maxTier = this.#tierResolver.resolve(
			this.#classIdentifier,
			this.#level,
			this.#subclassIdentifier,
		);

		const grantedSchools = schoolAccess.granted;
		const hasUtility = grantedSchools.includes('utility');

		// Real schools only (utility is a spell property, not a school in the system)
		const realSchools = grantedSchools.filter((s) => s !== 'utility');

		// Load spells from compendium — utility spells excluded until level grants access
		this.#allSpells = this.#compendiumBrowser.findSpellsBySchoolAndTier(realSchools, maxTier, hasUtility);

		// Build school filter data (only real schools + utility if accessible)
		const schools = grantedSchools.map((s) => ({
			id: s,
			label: s.charAt(0).toUpperCase() + s.slice(1),
			icon: SCHOOL_ICONS[s] ?? 'fa-solid fa-sparkles',
			active: this.#activeSchool === s,
		}));

		// Build tier filter data
		const availableTiers = [];
		for (let t = 1; t <= maxTier; t++) {
			availableTiers.push({ tier: t, active: this.#activeTier === t });
		}

		// Apply filters
		let filteredSpells = [...this.#allSpells];
		if (this.#activeSchool) {
			if (this.#activeSchool === 'utility') {
				filteredSpells = filteredSpells.filter((s) => s.isUtility);
			} else {
				filteredSpells = filteredSpells.filter(
					(s) => s.school.toLowerCase() === this.#activeSchool,
				);
			}
		}
		if (this.#activeTier !== null && this.#activeTier !== undefined) {
			filteredSpells = filteredSpells.filter((s) => s.tier === this.#activeTier);
		}

		// Detect already-owned spells on the actor (cached for toggle checks)
		this.#ownedSpellKeys.clear();
		for (const item of this.#actor.items) {
			if (item.type === 'spell') {
				this.#ownedSpellKeys.add(item.name.toLowerCase().trim());
				const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
				if (source) this.#ownedSpellKeys.add(source);
			}
		}

		// Enrich spell data for display
		filteredSpells = filteredSpells.map((s) => {
			const alreadyOwned =
				this.#ownedSpellKeys.has(s.name.toLowerCase().trim()) ||
				(s.uuid && this.#ownedSpellKeys.has(s.uuid));
			return {
				...s,
				alreadyOwned,
				selected: !alreadyOwned && this.#selectedUuids.has(s.uuid),
				schoolIcon: SCHOOL_ICONS[s.school.toLowerCase()] ?? '',
				schoolLabel: s.school.charAt(0).toUpperCase() + s.school.slice(1),
				tierLabel: s.isUtility ? 'Utility' : (s.tier === 0 ? 'Cantrip' : `Tier ${s.tier}`),
				tierClass: s.isUtility ? 'utility' : (s.tier === 0 ? 'cantrip' : String(s.tier)),
			};
		});

		const selectedCount = this.#selectedUuids.size;

		return {
			className: this.#classIdentifier,
			maxTier,
			schools,
			activeSchool: this.#activeSchool,
			availableTiers,
			activeTier: this.#activeTier,
			filteredSpells,
			selectedCount,
			hasSelection: selectedCount > 0,
		};
	}

	_onRender(context, options) {
		const scrollArea = this.element.querySelector('.nimble-selector__scroll-area');
		if (scrollArea) scrollArea.scrollTop = this.#scrollTop;
	}

	#saveScrollPosition() {
		const scrollArea = this.element?.querySelector('.nimble-selector__scroll-area');
		if (scrollArea) this.#scrollTop = scrollArea.scrollTop;
	}

	static #onFilterSchool(event, target) {
		const school = target.dataset.school;
		this.#activeSchool = this.#activeSchool === school ? '' : school;
		this.#saveScrollPosition();
		this.render();
	}

	static #onFilterTier(event, target) {
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

	static #onToggleSpell(event, target) {
		const uuid = target.dataset.uuid;
		if (!uuid) return;

		// Prevent toggling already-owned spells (uses cached data from _prepareContext)
		if (this.#ownedSpellKeys.has(uuid)) return;
		const spell = this.#allSpells.find((s) => s.uuid === uuid);
		if (spell && this.#ownedSpellKeys.has(spell.name.toLowerCase().trim())) return;

		if (this.#selectedUuids.has(uuid)) {
			this.#selectedUuids.delete(uuid);
		} else {
			this.#selectedUuids.add(uuid);
		}
		this.#saveScrollPosition();
		this.render();
	}

	static async #onConfirm() {
		const uuids = [...this.#selectedUuids].filter(Boolean);
		if (!uuids.length) return;

		await this.#granter.grantItemsByUuid(this.#actor, uuids);
		this.#selectedUuids.clear();
		ui.notifications.info(`Granted ${uuids.length} spell(s) to ${this.#actor.name}.`);
		this.close();
	}

	static #onCancel() {
		this.close();
	}
}

export { SpellSelector };
