import { MODULE_ID, TEMPLATE_PATH, SCHOOL_ICONS, LOG_PREFIX, capitalize } from '../utils/constants.mjs';
import { ClassFeatureResolver } from '../data/ClassFeatureResolver.mjs';
import { DataProvider } from '../data/DataProvider.mjs';
import { EquipmentProficiencyResolver } from '../data/EquipmentProficiencyResolver.mjs';
import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';
import { ClassFeatureSelector } from './ClassFeatureSelector.mjs';
import { SpellSelector } from './SpellSelector.mjs';
import { EquipmentSelector } from './EquipmentSelector.mjs';
import { SchoolChoiceResolver } from '../data/SchoolChoiceResolver.mjs';
import { AutoGranter } from '../core/AutoGranter.mjs';

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
	/** @type {DataProvider} */
	#dataProvider = DataProvider.instance;
	/** @type {EquipmentProficiencyResolver} */
	#proficiencyResolver = new EquipmentProficiencyResolver();
	/** @type {CompendiumBrowser} */
	#compendiumBrowser = CompendiumBrowser.instance;
	/** @type {SchoolChoiceResolver} */
	#choiceResolver = new SchoolChoiceResolver();
	/** @type {AutoGranter} */
	#autoGranter = new AutoGranter();
	/**
	 * Transient UI state: choice key → selected schools (before confirm).
	 * @type {Map<string, Set<string>>}
	 */
	#pendingSelections = new Map();
	/**
	 * Cached choice counts from the last prepareContext, keyed by choice key.
	 * Avoids re-calling getPendingChoices in action handlers.
	 * @type {Map<string, number>}
	 */
	#choiceCounts = new Map();

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
		const hasSpellcasting = this.#dataProvider.hasCasting(this.#classIdentifier, this.#subclassIdentifier);
		const resolvedSchools = this.#choiceResolver.resolveAllSchools(
			this.#actor, this.#classIdentifier, this.#level, this.#subclassIdentifier,
		);
		const maxTier = this.#dataProvider.getMaxSpellTier(
			this.#classIdentifier,
			this.#level,
			this.#subclassIdentifier,
		);
		const minTier = this.#dataProvider.getMinSpellTier(
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
			? this.#compendiumBrowser.countSpells({ schools: realSchools, maxTier, minTier, includeUtility: hasUtility, classIdentifier: this.#classIdentifier })
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
	 * Also caches choice counts for use in action handlers.
	 * @returns {{ pendingChoices: import('../data/SchoolChoiceResolver.mjs').PendingChoice[], confirmedChoices: import('../data/SchoolChoiceResolver.mjs').ConfirmedChoice[], schoolIcons: Record<string, string> }}
	 */
	#prepareSchoolChoices() {
		const pendingChoices = this.#choiceResolver.getPendingChoices(
			this.#actor, this.#classIdentifier, this.#level, this.#subclassIdentifier,
		);
		const confirmedChoices = this.#choiceResolver.getConfirmedChoices(
			this.#actor, this.#classIdentifier, this.#level, this.#subclassIdentifier,
		);

		// Cache counts and enrich pending choices with UI state
		this.#choiceCounts.clear();
		for (const choice of pendingChoices) {
			this.#choiceCounts.set(choice.key, choice.count);
			const selections = this.#pendingSelections.get(choice.key);
			choice.isReady = selections?.size === choice.count;
			choice.label = game.i18n.format('NIMBLE_SELECTOR.schoolChoice.title', { count: choice.count });
			choice.availableOptions = choice.availableOptions.map((s) => ({
				id: s,
				selected: selections?.has(s) ?? false,
			}));
		}

		return {
			pendingChoices,
			confirmedChoices,
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
		const { choiceKey: key, school } = target.dataset;
		if (!key || !school) return;

		const maxCount = this.#choiceCounts.get(key);
		if (maxCount == null) return;

		let selections = this.#pendingSelections.get(key);
		if (!selections) {
			selections = new Set();
			this.#pendingSelections.set(key, selections);
		}

		if (selections.has(school)) {
			selections.delete(school);
		} else {
			if (maxCount === 1) selections.clear();
			if (selections.size < maxCount) selections.add(school);
		}

		this.render();
	}

	/** @this {SelectorPanel} */
	static async #onConfirmSchoolChoice(_event, target) {
		const key = target.dataset.choiceKey;
		if (!key) return;

		const selections = this.#pendingSelections.get(key);
		if (!selections?.size) return;

		const expectedCount = this.#choiceCounts.get(key);
		if (expectedCount == null || selections.size !== expectedCount) return;

		try {
			await this.#choiceResolver.saveChoice(this.#actor, key, [...selections]);
		} catch (err) {
			console.error(`${LOG_PREFIX} Failed to save school choice "${key}":`, err);
			return;
		}
		this.#pendingSelections.delete(key);

		// Close SpellSelector so it reloads with updated schools
		this.#spellSelector?.close();
		this.#spellSelector = null;

		// If auto-grant is active and all school choices are now resolved, grant spells and close panel
		if (this.#autoGranter.shouldAutoGrant(this.#actor)) {
			const remainingChoices = this.#choiceResolver.getPendingChoices(
				this.#actor, this.#classIdentifier, this.#level, this.#subclassIdentifier,
			);
			if (remainingChoices.length === 0) {
				await this.#autoGranter.grantSpellsAfterChoice(
					this.#actor, this.#classIdentifier, this.#level, this.#subclassIdentifier,
				);
				await this.close();
				return;
			}
		}

		this.render();
	}

	/** @this {SelectorPanel} */
	static async #onEditSchoolChoice(_event, target) {
		const key = target.dataset.choiceKey;
		if (!key) return;

		try {
			await this.#choiceResolver.removeChoice(this.#actor, key);
		} catch (err) {
			console.error(`${LOG_PREFIX} Failed to remove school choice "${key}":`, err);
			return;
		}
		this.#pendingSelections.delete(key);

		// Close SpellSelector so it reloads without the removed school
		this.#spellSelector?.close();
		this.#spellSelector = null;

		this.render();
	}
}

export { SelectorPanel };
