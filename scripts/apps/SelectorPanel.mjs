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
	/** @type {Actor} */
	#actor;
	/** @type {string} */
	#classIdentifier;
	/** @type {string|null} */
	#subclassIdentifier;
	/** @type {number} */
	#level;
	/** @type {number} */
	#fromLevel;

	#featureResolver = new ClassFeatureResolver();
	#schoolResolver = new SpellSchoolResolver();
	#tierResolver = new SpellTierResolver();
	#proficiencyResolver = new EquipmentProficiencyResolver();
	#compendiumBrowser = CompendiumBrowser.instance;

	/** @type {ClassFeatureSelector|null} */
	#featureSelector = null;
	/** @type {SpellSelector|null} */
	#spellSelector = null;
	/** @type {EquipmentSelector|null} */
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

	/**
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {number|null} [fromLevel=null]
	 * @param {string|null} [subclassIdentifier=null]
	 * @param {object} [options={}]
	 */
	constructor(actor, classIdentifier, level, fromLevel = null, subclassIdentifier = null, options = {}) {
		super(options);
		this.#actor = actor;
		this.#classIdentifier = classIdentifier;
		this.#subclassIdentifier = subclassIdentifier;
		this.#level = level;
		this.#fromLevel = fromLevel ?? level;
	}

	/** @override */
	async _prepareContext() {
		const features = this.#prepareFeatures();
		const spellData = this.#prepareSpellSummary();
		const equipmentData = this.#prepareEquipmentSummary();
		const showFeaturesInPanel = game.settings.get(MODULE_ID, 'showFeaturesInPanel');

		return {
			actorName: this.#actor.name,
			className: capitalize(this.#classIdentifier),
			level: this.#level,
			features,
			showFeaturesInPanel,
			...spellData,
			...equipmentData,
		};
	}

	/**
	 * Resolve and mark owned features for the panel display.
	 * @returns {Array<import('../data/ClassFeatureResolver.mjs').ResolvedFeature & {alreadyOwned: boolean}>}
	 */
	#prepareFeatures() {
		const features = this.#featureResolver.resolveRange(
			this.#classIdentifier,
			this.#fromLevel,
			this.#level,
			this.#subclassIdentifier,
		);
		return this.#featureResolver.markOwnedFeatures(this.#actor, features);
	}

	/**
	 * Build spell summary data for the panel.
	 * @returns {object}
	 */
	#prepareSpellSummary() {
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

		const spellCount = hasSpellcasting && maxTier >= 0
			? this.#compendiumBrowser.countSpellsBySchoolAndTier(realSchools, maxTier, hasUtility)
			: 0;

		return { hasSpellcasting, spellSchools, spellCount, maxTier };
	}

	/**
	 * Build equipment summary data for the panel.
	 * @returns {object}
	 */
	#prepareEquipmentSummary() {
		const proficiencies = this.#proficiencyResolver.resolve(this.#classIdentifier);
		const equipment = this.#proficiencyResolver.findAvailableEquipment(this.#classIdentifier);

		const none = game.i18n.localize('NIMBLE_SELECTOR.panel.none');

		return {
			equipmentCount: equipment.length,
			proficiencySummary: {
				armor: proficiencies.armor.length ? proficiencies.armor.join(', ') : none,
				weapons: proficiencies.weapons.length ? proficiencies.weapons.join(', ') : none,
			},
		};
	}

	/* ---------------------------------------- */
	/*  Action Handlers                         */
	/* ---------------------------------------- */

	/** @this {SelectorPanel} */
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

	/** @this {SelectorPanel} */
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

	/** @this {SelectorPanel} */
	static #onOpenEquipment() {
		this.#equipmentSelector?.close();
		this.#equipmentSelector = new EquipmentSelector(
			this.#actor,
			this.#classIdentifier,
		);
		this.#equipmentSelector.render(true);
	}

	/** @this {SelectorPanel} */
	static #onClose() {
		this.#featureSelector?.close();
		this.#spellSelector?.close();
		this.#equipmentSelector?.close();
		this.close();
	}
}

export { SelectorPanel };
