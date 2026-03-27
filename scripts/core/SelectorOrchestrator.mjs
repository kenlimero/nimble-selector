import { DataProvider } from '../data/DataProvider.mjs';
import { CompendiumBrowser } from './CompendiumBrowser.mjs';
import { SelectorPanel } from '../apps/SelectorPanel.mjs';
import { ClassFeatureSelector } from '../apps/ClassFeatureSelector.mjs';
import { SpellSelector } from '../apps/SpellSelector.mjs';
import { EquipmentSelector } from '../apps/EquipmentSelector.mjs';
import { AutoGranter } from './AutoGranter.mjs';
import { AutoGrantNotifier } from './AutoGrantNotifier.mjs';

/**
 * @typedef {object} ActorClassInfo
 * @property {string} classIdentifier
 * @property {string|null} subclassIdentifier
 * @property {number} level
 */

/**
 * Coordinates the initialization and opening of the selector UI.
 * Acts as the main entry point for module interactions.
 */
class SelectorOrchestrator {
	/** @type {DataProvider} */
	#dataProvider;
	/** @type {CompendiumBrowser} */
	#compendiumBrowser;
	/** @type {AutoGranter} */
	#autoGranter;
	/** @type {AutoGrantNotifier} */
	#autoGrantNotifier;

	constructor() {
		this.#dataProvider = DataProvider.instance;
		this.#compendiumBrowser = CompendiumBrowser.instance;
		this.#autoGranter = new AutoGranter();
		this.#autoGrantNotifier = new AutoGrantNotifier();
	}

	/**
	 * Ensure data is loaded and ready.
	 * @returns {Promise<void>}
	 */
	async ensureReady() {
		if (!this.#dataProvider.loaded) {
			await this.#dataProvider.load();
		}
		if (!this.#compendiumBrowser.initialized) {
			await this.#compendiumBrowser.initialize();
		}
	}

	/**
	 * Extract class information from an actor.
	 * Uses the Nimble system's native `item.identifier` getter which returns
	 * `system.identifier || name.slugify({ strict: true })`.
	 * @param {Actor} actor
	 * @returns {ActorClassInfo|null}
	 */
	getActorClassInfo(actor) {
		if (actor?.type !== 'character') return null;

		// Single pass over actor.items to find both class and subclass
		let classItem = null;
		let subclassItem = null;
		for (const item of actor.items) {
			if (item.type === 'class') classItem = item;
			else if (item.type === 'subclass') subclassItem = item;
			if (classItem && subclassItem) break;
		}
		if (!classItem) return null;

		return {
			classIdentifier: SelectorOrchestrator.#getIdentifier(classItem),
			subclassIdentifier: subclassItem ? SelectorOrchestrator.#getIdentifier(subclassItem) : null,
			level: classItem.system?.classLevel ?? 1,
		};
	}

	/**
	 * Open the main selector panel for an actor.
	 * @param {Actor} actor
	 * @returns {Promise<void>}
	 */
	async openForActor(actor) {
		const info = await this.#requireClassInfo(actor);
		if (!info) return;

		new SelectorPanel(actor, info.classIdentifier, info.level, 1, info.subclassIdentifier)
			.render(true);
	}

	/**
	 * Open the selector panel for a specific level-up range.
	 * @param {Actor} actor
	 * @param {number} fromLevel
	 * @param {number} toLevel
	 * @returns {Promise<void>}
	 */
	async openForLevelUp(actor, fromLevel, toLevel) {
		const info = await this.#requireClassInfo(actor);
		if (!info) return;

		new SelectorPanel(actor, info.classIdentifier, toLevel, fromLevel, info.subclassIdentifier)
			.render(true);
	}

	/**
	 * Called from the updateItem hook on level-up.
	 * If auto-grant is enabled for the actor, grants items silently and notifies.
	 * Otherwise falls back to opening the selector panel.
	 * @param {Actor} actor
	 * @param {number} fromLevel
	 * @param {number} toLevel
	 * @returns {Promise<void>}
	 */
	async handleLevelUp(actor, fromLevel, toLevel) {
		const info = await this.#requireClassInfo(actor);
		if (!info) return;

		if (this.#autoGranter.shouldAutoGrant(actor)) {
			const result = await this.#autoGranter.execute(
				actor, info.classIdentifier, fromLevel, toLevel, info.subclassIdentifier,
			);
			this.#autoGrantNotifier.notify(actor, result.granted, result.pending);

			const hasPending = result.pending.selectableGroups.length > 0 || result.pending.schoolChoices.length > 0;
			if (hasPending) {
				new SelectorPanel(actor, info.classIdentifier, toLevel, fromLevel, info.subclassIdentifier)
					.render(true);
			}
			return;
		}

		new SelectorPanel(actor, info.classIdentifier, toLevel, fromLevel, info.subclassIdentifier)
			.render(true);
	}

	/**
	 * Called from the createItem hook when a class is added to a character.
	 * If auto-grant is enabled, grants items silently.
	 * Otherwise falls back to opening the selector panel.
	 * @param {Actor} actor
	 * @returns {Promise<void>}
	 */
	async handleClassCreation(actor) {
		const info = await this.#requireClassInfo(actor);
		if (!info) return;

		if (this.#autoGranter.shouldAutoGrant(actor)) {
			const result = await this.#autoGranter.execute(
				actor, info.classIdentifier, 1, info.level, info.subclassIdentifier,
			);
			this.#autoGrantNotifier.notify(actor, result.granted, result.pending);

			const hasPending = result.pending.selectableGroups.length > 0 || result.pending.schoolChoices.length > 0;
			if (hasPending) {
				new SelectorPanel(actor, info.classIdentifier, info.level, 1, info.subclassIdentifier)
					.render(true);
			}
			return;
		}

		new SelectorPanel(actor, info.classIdentifier, info.level, 1, info.subclassIdentifier)
			.render(true);
	}

	/**
	 * Open only the feature selector.
	 * @param {Actor} actor
	 * @returns {Promise<void>}
	 */
	async openFeatureSelector(actor) {
		const info = await this.#requireClassInfo(actor);
		if (!info) return;

		new ClassFeatureSelector(actor, info.classIdentifier, 1, info.level, info.subclassIdentifier)
			.render(true);
	}

	/**
	 * Open only the spell selector.
	 * @param {Actor} actor
	 * @returns {Promise<void>}
	 */
	async openSpellSelector(actor) {
		const info = await this.#requireClassInfo(actor);
		if (!info) return;

		new SpellSelector(actor, info.classIdentifier, info.level, info.subclassIdentifier)
			.render(true);
	}

	/**
	 * Open only the equipment selector.
	 * @param {Actor} actor
	 * @returns {Promise<void>}
	 */
	async openEquipmentSelector(actor) {
		const info = await this.#requireClassInfo(actor);
		if (!info) return;

		new EquipmentSelector(actor, info.classIdentifier)
			.render(true);
	}

	/**
	 * Ensure ready, extract class info, and warn the user if missing.
	 * @param {Actor} actor
	 * @returns {Promise<ActorClassInfo|null>}
	 */
	async #requireClassInfo(actor) {
		await this.ensureReady();
		const info = this.getActorClassInfo(actor);
		if (!info) {
			ui.notifications.warn(game.i18n.localize('NIMBLE_SELECTOR.notifications.noClass'));
		}
		return info;
	}

	/**
	 * Get the identifier for a class/subclass item, with a fallback slugify.
	 * @param {Item} item
	 * @returns {string}
	 */
	static #getIdentifier(item) {
		if (item.identifier) return item.identifier;
		const name = item.name ?? '';
		return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
	}
}

export { SelectorOrchestrator };
