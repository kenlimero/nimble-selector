import { MODULE_ID, TEMPLATE_PATH, SCHOOL_ICONS, capitalize } from '../utils/constants.mjs';
import { ClassFeatureResolver } from '../data/ClassFeatureResolver.mjs';
import { SpellSchoolResolver } from '../data/SpellSchoolResolver.mjs';
import { SpellTierResolver } from '../data/SpellTierResolver.mjs';
import { EquipmentProficiencyResolver } from '../data/EquipmentProficiencyResolver.mjs';
import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';
import { ClassFeatureSelector } from './ClassFeatureSelector.mjs';
import { SpellSelector } from './SpellSelector.mjs';
import { EquipmentSelector } from './EquipmentSelector.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Main selector panel that provides an overview and access to the
 * three sub-selectors: features, spells, and equipment.
 */
class SelectorPanel extends HandlebarsApplicationMixin(ApplicationV2) {
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
		classes: [MODULE_ID, 'nimble-selector'],
		window: {
			title: 'Nimble Selector',
			icon: 'fa-solid fa-arrow-up-right-dots',
			resizable: true,
		},
		position: {
			width: 600,
			height: 'auto',
		},
		actions: {
			openFeatures: SelectorPanel.#onOpenFeatures,
			openSpells: SelectorPanel.#onOpenSpells,
			openEquipment: SelectorPanel.#onOpenEquipment,
			closePanel: SelectorPanel.#onClose,
		},
	};

	static PARTS = {
		panel: {
			template: `${TEMPLATE_PATH}/selector-panel.hbs`,
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
			label: capitalize(s),
			icon: SCHOOL_ICONS[s] ?? 'fa-solid fa-sparkles',
		}));

		const spellCount = hasSpellcasting
			? this.#compendiumBrowser.countSpellsBySchoolAndTier(realSchools, maxTier, hasUtility)
			: 0;

		// Equipment
		const proficiencies = this.#proficiencyResolver.resolve(this.#classIdentifier);
		const equipment = this.#proficiencyResolver.findAvailableEquipment(this.#classIdentifier);

		const none = game.i18n.localize('NIMBLE_SELECTOR.panel.none');
		const armorSummary = proficiencies.armor.length
			? proficiencies.armor.join(', ')
			: none;
		const weaponSummary = proficiencies.weapons.length
			? proficiencies.weapons.join(', ')
			: none;

		return {
			actorName: this.#actor.name,
			className: capitalize(this.#classIdentifier),
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

export { SelectorPanel };
