import { MODULE_ID, TEMPLATE_PATH } from '../utils/constants.mjs';
import { ClassFeatureResolver } from '../data/ClassFeatureResolver.mjs';
import { SpellSchoolResolver } from '../data/SpellSchoolResolver.mjs';
import { SpellTierResolver } from '../data/SpellTierResolver.mjs';
import { EquipmentProficiencyResolver } from '../data/EquipmentProficiencyResolver.mjs';
import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';
import { ClassFeatureSelector } from './ClassFeatureSelector.mjs';
import { SpellSelector } from './SpellSelector.mjs';
import { EquipmentSelector } from './EquipmentSelector.mjs';

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
 * Main levelling panel that provides an overview and access to the
 * three sub-selectors: features, spells, and equipment.
 */
class LevellingPanel extends HandlebarsApplicationMixin(ApplicationV2) {
	#actor;
	#classIdentifier;
	#subclassIdentifier;
	#level;
	#fromLevel;

	#featureResolver = new ClassFeatureResolver();
	#schoolResolver = new SpellSchoolResolver();
	#tierResolver = new SpellTierResolver();
	#proficiencyResolver = new EquipmentProficiencyResolver();
	#compendiumBrowser = CompendiumBrowser.instance;

	// Sub-applications
	#featureSelector = null;
	#spellSelector = null;
	#equipmentSelector = null;

	static DEFAULT_OPTIONS = {
		id: `${MODULE_ID}-panel`,
		classes: [MODULE_ID, 'nimble-levelling'],
		window: {
			title: 'Nimble Levelling',
			icon: 'fa-solid fa-arrow-up-right-dots',
			resizable: true,
		},
		position: {
			width: 600,
			height: 'auto',
		},
		actions: {
			openFeatures: LevellingPanel.#onOpenFeatures,
			openSpells: LevellingPanel.#onOpenSpells,
			openEquipment: LevellingPanel.#onOpenEquipment,
			closePanel: LevellingPanel.#onClose,
		},
	};

	static PARTS = {
		panel: {
			template: `${TEMPLATE_PATH}/levelling-panel.hbs`,
		},
	};

	constructor(actor, classIdentifier, level, fromLevel = null, subclassIdentifier = null, options = {}) {
		super(options);
		this.#actor = actor;
		this.#classIdentifier = classIdentifier;
		this.#subclassIdentifier = subclassIdentifier;
		this.#level = level;
		this.#fromLevel = fromLevel ?? level;
	}

	async _prepareContext() {
		// Features
		let features = this.#featureResolver.resolveRange(
			this.#classIdentifier,
			this.#fromLevel,
			this.#level,
			this.#subclassIdentifier,
		);
		features = this.#featureResolver.markOwnedFeatures(this.#actor, features);

		// Spells
		const hasSpellcasting = this.#schoolResolver.hasCasting(this.#classIdentifier, this.#subclassIdentifier);
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

		const hasUtility = schoolAccess.granted.includes('utility');
		const realSchools = schoolAccess.granted.filter((s) => s !== 'utility');

		const spellSchools = schoolAccess.granted.map((s) => ({
			id: s,
			label: s.charAt(0).toUpperCase() + s.slice(1),
			icon: SCHOOL_ICONS[s] ?? 'fa-solid fa-sparkles',
		}));

		const spellCount = hasSpellcasting
			? this.#compendiumBrowser.findSpellsBySchoolAndTier(realSchools, maxTier, hasUtility).length
			: 0;

		// Equipment
		const proficiencies = this.#proficiencyResolver.resolve(this.#classIdentifier);
		const equipment = this.#proficiencyResolver.findAvailableEquipment(this.#classIdentifier);

		const armorSummary = proficiencies.armor.length
			? proficiencies.armor.join(', ')
			: 'None';
		const weaponSummary = proficiencies.weapons.length
			? proficiencies.weapons.join(', ')
			: 'None';

		return {
			actorName: this.#actor.name,
			className: this.#classIdentifier.charAt(0).toUpperCase() + this.#classIdentifier.slice(1),
			level: this.#level,
			features,
			hasSpellcasting,
			spellSchools,
			spellCount,
			maxTier,
			equipmentCount: equipment.length,
			proficiencySummary: {
				armor: armorSummary,
				weapons: weaponSummary,
			},
		};
	}

	static #onOpenFeatures() {
		this.#featureSelector?.close();
		this.#featureSelector = new ClassFeatureSelector(
			this.#actor,
			this.#classIdentifier,
			this.#fromLevel,
			this.#level,
			this.#subclassIdentifier,
		);
		this.#featureSelector.render(true);
	}

	static #onOpenSpells() {
		this.#spellSelector?.close();
		this.#spellSelector = new SpellSelector(
			this.#actor,
			this.#classIdentifier,
			this.#level,
			this.#subclassIdentifier,
		);
		this.#spellSelector.render(true);
	}

	static #onOpenEquipment() {
		this.#equipmentSelector?.close();
		this.#equipmentSelector = new EquipmentSelector(
			this.#actor,
			this.#classIdentifier,
		);
		this.#equipmentSelector.render(true);
	}

	static #onClose() {
		this.#featureSelector?.close();
		this.#spellSelector?.close();
		this.#equipmentSelector?.close();
		this.close();
	}
}

export { LevellingPanel };
