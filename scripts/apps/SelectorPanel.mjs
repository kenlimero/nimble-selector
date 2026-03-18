import { MODULE_ID, TEMPLATE_PATH, SCHOOL_ICONS, capitalize } from '../utils/constants.mjs';
import { ClassFeatureResolver } from '../data/ClassFeatureResolver.mjs';
import { SpellSchoolResolver } from '../data/SpellSchoolResolver.mjs';
import { SpellTierResolver } from '../data/SpellTierResolver.mjs';
import { EquipmentProficiencyResolver } from '../data/EquipmentProficiencyResolver.mjs';
import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';
import { ClassFeatureSelector } from './ClassFeatureSelector.mjs';
import { SpellSelector } from './SpellSelector.mjs';
import { EquipmentSelector } from './EquipmentSelector.mjs';
import { SchoolChoiceResolver } from '../data/SchoolChoiceResolver.mjs';

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

	/** @type {ClassFeatureResolver} */
	#featureResolver = new ClassFeatureResolver();
	/** @type {SpellSchoolResolver} */
	#schoolResolver = new SpellSchoolResolver();
	/** @type {SpellTierResolver} */
	#tierResolver = new SpellTierResolver();
	/** @type {EquipmentProficiencyResolver} */
	#proficiencyResolver = new EquipmentProficiencyResolver();
	/** @type {CompendiumBrowser} */
	#compendiumBrowser = CompendiumBrowser.instance;
	/** @type {SchoolChoiceResolver} */
	#choiceResolver = new SchoolChoiceResolver();
	/** @type {Map<string, Set<string>>} Transient UI state: key → selected schools (before confirm). */
	#pendingSelections = new Map();

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
			selectSchoolChoice: SelectorPanel.#onSelectSchoolChoice,
			confirmSchoolChoice: SelectorPanel.#onConfirmSchoolChoice,
			editSchoolChoice: SelectorPanel.#onEditSchoolChoice,
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
		const schoolChoiceData = this.#prepareSchoolChoices();
		const spellData = this.#prepareSpellSummary();
		const equipmentData = this.#prepareEquipmentSummary();
		const showFeaturesInPanel = game.settings.get(MODULE_ID, 'showFeaturesInPanel');

		return {
			actorName: this.#actor.name,
			className: capitalize(this.#classIdentifier),
			level: this.#level,
			features,
			showFeaturesInPanel,
			...schoolChoiceData,
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
	 * Uses resolved schools (granted + persisted choices) for accurate counts.
	 * @returns {{ hasSpellcasting: boolean, spellSchools: Array<{id: string, label: string, icon: string}>, spellCount: number, maxTier: number }}
	 */
	#prepareSpellSummary() {
		const hasSpellcasting = this.#schoolResolver.hasCasting(this.#classIdentifier, this.#subclassIdentifier);
		const resolvedSchools = this.#choiceResolver.resolveAllSchools(
			this.#actor, this.#classIdentifier, this.#level, this.#subclassIdentifier,
		);
		const maxTier = this.#tierResolver.resolve(
			this.#classIdentifier,
			this.#level,
			this.#subclassIdentifier,
		);
		const minTier = this.#tierResolver.resolveMin(
			this.#classIdentifier,
			this.#subclassIdentifier,
		);

		const hasUtility = resolvedSchools.includes('utility');
		const realSchools = resolvedSchools.filter((s) => s !== 'utility');

		const spellSchools = resolvedSchools.map((s) => ({
			id: s,
			label: capitalize(s),
			icon: SCHOOL_ICONS[s] ?? 'fa-solid fa-sparkles',
		}));

		const spellCount = hasSpellcasting && maxTier >= 0 && realSchools.length > 0
			? this.#compendiumBrowser.countSpellsBySchoolAndTier(realSchools, maxTier, hasUtility, this.#classIdentifier, minTier)
			: 0;

		return { hasSpellcasting, spellSchools, spellCount, maxTier };
	}

	/**
	 * Build equipment summary data for the panel.
	 * @returns {{ equipmentCount: number, proficiencySummary: {armor: string, weapons: string} }}
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

	/**
	 * Build school choice data for the panel template.
	 * @returns {{ hasSchoolChoices: boolean, pendingChoices: Array, confirmedChoices: Array, totalChoiceCount: number, schoolIcons: Record<string, string> }}
	 */
	#prepareSchoolChoices() {
		const pendingChoices = this.#choiceResolver.getPendingChoices(
			this.#actor, this.#classIdentifier, this.#level, this.#subclassIdentifier,
		);
		const confirmedChoices = this.#choiceResolver.getConfirmedChoices(
			this.#actor, this.#classIdentifier, this.#level, this.#subclassIdentifier,
		);

		// Enrich each pending choice with selection state for the template
		for (const choice of pendingChoices) {
			const selections = this.#pendingSelections.get(choice.key);
			choice.isReady = selections?.size === choice.count;
			choice.label = game.i18n.format('NIMBLE_SELECTOR.schoolChoice.title', { count: choice.count });
			choice.availableOptions = choice.availableOptions.map((s) => ({
				id: s,
				selected: selections?.has(s) ?? false,
			}));
		}

		const totalChoiceCount = pendingChoices.reduce((sum, c) => sum + c.count, 0)
			+ confirmedChoices.reduce((sum, c) => sum + c.count, 0);

		const headerLabel = game.i18n.format('NIMBLE_SELECTOR.schoolChoice.title', { count: totalChoiceCount });

		return {
			hasSchoolChoices: pendingChoices.length > 0 || confirmedChoices.length > 0,
			pendingChoices,
			confirmedChoices,
			totalChoiceCount,
			headerLabel,
			schoolIcons: SCHOOL_ICONS,
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

	/** @this {SelectorPanel} */
	static #onSelectSchoolChoice(_event, target) {
		const key = target.dataset.choiceKey;
		const school = target.dataset.school;
		if (!key || !school) return;

		// Find the choice to know its count
		const pending = this.#choiceResolver.getPendingChoices(
			this.#actor, this.#classIdentifier, this.#level, this.#subclassIdentifier,
		);
		const choice = pending.find((c) => c.key === key);
		if (!choice) return;

		let selections = this.#pendingSelections.get(key);
		if (!selections) {
			selections = new Set();
			this.#pendingSelections.set(key, selections);
		}

		if (selections.has(school)) {
			selections.delete(school);
		} else {
			// If count is 1, replace; otherwise add up to count
			if (choice.count === 1) {
				selections.clear();
			}
			if (selections.size < choice.count) {
				selections.add(school);
			}
		}

		this.render();
	}

	/** @this {SelectorPanel} */
	static async #onConfirmSchoolChoice(_event, target) {
		const key = target.dataset.choiceKey;
		if (!key) return;

		const selections = this.#pendingSelections.get(key);
		if (!selections?.size) return;

		// Validate selection count matches the required count
		const pending = this.#choiceResolver.getPendingChoices(
			this.#actor, this.#classIdentifier, this.#level, this.#subclassIdentifier,
		);
		const choice = pending.find((c) => c.key === key);
		if (!choice || selections.size !== choice.count) return;

		await this.#choiceResolver.saveChoice(this.#actor, key, [...selections]);
		this.#pendingSelections.delete(key);

		// Close SpellSelector so it reloads with updated schools
		this.#spellSelector?.close();
		this.#spellSelector = null;

		this.render();
	}

	/** @this {SelectorPanel} */
	static async #onEditSchoolChoice(_event, target) {
		const key = target.dataset.choiceKey;
		if (!key) return;

		await this.#choiceResolver.removeChoice(this.#actor, key);
		this.#pendingSelections.delete(key);
		this.render();
	}
}

export { SelectorPanel };
