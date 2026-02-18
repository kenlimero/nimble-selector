import { MODULE_ID, TEMPLATE_PATH, SPELL_SCHOOL_COLORS } from '../utils/constants.mjs';
import { SpellSchoolResolver } from '../data/SpellSchoolResolver.mjs';
import { SpellTierResolver } from '../data/SpellTierResolver.mjs';
import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';
import { ItemGranter } from '../core/ItemGranter.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SCHOOL_ICONS = {
	fire: 'fa-solid fa-fire-flame-curved',
	ice: 'fa-solid fa-snowflake',
	lightning: 'fa-solid fa-bolt-lightning',
	necrotic: 'fa-solid fa-skull',
	radiant: 'fa-solid fa-sun',
	wind: 'fa-solid fa-wind',
	secret: 'fa-solid fa-eye-slash',
	utility: 'fa-solid fa-toolbox',
};

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
	#activeSchool = '';
	#activeTier = null;
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

		// Detect already-owned spells on the actor
		const ownedSpellNames = new Set();
		const ownedSpellSources = new Set();
		for (const item of this.#actor.items) {
			if (item.type === 'spell') {
				ownedSpellNames.add(item.name.toLowerCase().trim());
				const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
				if (source) ownedSpellSources.add(source);
			}
		}

		// Enrich spell data for display
		filteredSpells = filteredSpells.map((s) => {
			const alreadyOwned =
				ownedSpellNames.has(s.name.toLowerCase().trim()) ||
				(s.uuid && ownedSpellSources.has(s.uuid));
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

	static #onFilterSchool(event, target) {
		const school = target.dataset.school;
		this.#activeSchool = this.#activeSchool === school ? '' : school;
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
		this.render();
	}

	static #onToggleSpell(event, target) {
		const uuid = target.dataset.uuid;
		if (!uuid) return;

		// Prevent toggling already-owned spells
		const spell = this.#allSpells.find((s) => s.uuid === uuid);
		if (spell) {
			const ownedNames = new Set();
			const ownedSources = new Set();
			for (const item of this.#actor.items) {
				if (item.type === 'spell') {
					ownedNames.add(item.name.toLowerCase().trim());
					const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
					if (source) ownedSources.add(source);
				}
			}
			if (ownedNames.has(spell.name.toLowerCase().trim()) || ownedSources.has(uuid)) return;
		}

		if (this.#selectedUuids.has(uuid)) {
			this.#selectedUuids.delete(uuid);
		} else {
			this.#selectedUuids.add(uuid);
		}
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

	get selectedUuids() {
		return new Set(this.#selectedUuids);
	}
}

export { SpellSelector };
