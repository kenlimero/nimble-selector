import { DataProvider } from '../data/DataProvider.mjs';
import { CompendiumBrowser } from './CompendiumBrowser.mjs';
import { SelectorPanel } from '../apps/SelectorPanel.mjs';
import { ClassFeatureSelector } from '../apps/ClassFeatureSelector.mjs';
import { SpellSelector } from '../apps/SpellSelector.mjs';
import { EquipmentSelector } from '../apps/EquipmentSelector.mjs';

/**
 * Coordinates the initialization and opening of the selector UI.
 * Acts as the main entry point for module interactions.
 */
class SelectorOrchestrator {
	#dataProvider;
	#compendiumBrowser;

	constructor() {
		this.#dataProvider = DataProvider.instance;
		this.#compendiumBrowser = CompendiumBrowser.instance;
	}

	/**
	 * Ensure data is loaded and ready.
	 * @returns {Promise<boolean>} true if ready
	 */
	async ensureReady() {
		if (!this.#dataProvider.loaded) {
			await this.#dataProvider.load();
		}
		if (!this.#compendiumBrowser.initialized) {
			await this.#compendiumBrowser.initialize();
		}
		return true;
	}

	/**
	 * Extract class information from an actor.
	 * Uses the Nimble system's native `item.identifier` getter which returns
	 * `system.identifier || name.slugify({ strict: true })`.
	 * @param {Actor} actor
	 * @returns {{ classIdentifier: string, subclassIdentifier: string|null, level: number }|null}
	 */
	getActorClassInfo(actor) {
		if (actor.type !== 'character') return null;

		// Find the class item on the actor
		const classItem = actor.items.find((i) => i.type === 'class');
		if (!classItem) return null;

		// Use the Nimble system's native identifier getter
		const classIdentifier = classItem.identifier ?? classItem.name?.toLowerCase().trim().replace(/\s+/g, '-');
		const level = classItem.system?.classLevel ?? 1;

		// Find subclass
		const subclassItem = actor.items.find((i) => i.type === 'subclass');
		const subclassIdentifier = subclassItem
			? (subclassItem.identifier ?? subclassItem.name?.toLowerCase().trim().replace(/\s+/g, '-'))
			: null;

		return { classIdentifier, subclassIdentifier, level };
	}

	/**
	 * Open the main selector panel for an actor.
	 * @param {Actor} actor
	 */
	async openForActor(actor) {
		await this.ensureReady();

		const info = this.getActorClassInfo(actor);
		if (!info) {
			ui.notifications.warn('This character has no class assigned.');
			return;
		}

		const panel = new SelectorPanel(
			actor,
			info.classIdentifier,
			info.level,
			1,
			info.subclassIdentifier,
		);
		panel.render(true);
	}

	/**
	 * Open the selector panel for a specific level-up range.
	 * @param {Actor} actor
	 * @param {number} fromLevel
	 * @param {number} toLevel
	 */
	async openForLevelUp(actor, fromLevel, toLevel) {
		await this.ensureReady();

		const info = this.getActorClassInfo(actor);
		if (!info) {
			ui.notifications.warn('This character has no class assigned.');
			return;
		}

		const panel = new SelectorPanel(
			actor,
			info.classIdentifier,
			toLevel,
			fromLevel,
			info.subclassIdentifier,
		);
		panel.render(true);
	}

	/**
	 * Open only the feature selector.
	 * @param {Actor} actor
	 */
	async openFeatureSelector(actor) {
		await this.ensureReady();
		const info = this.getActorClassInfo(actor);
		if (!info) return;

		const selector = new ClassFeatureSelector(
			actor,
			info.classIdentifier,
			1,
			info.level,
			info.subclassIdentifier,
		);
		selector.render(true);
	}

	/**
	 * Open only the spell selector.
	 * @param {Actor} actor
	 */
	async openSpellSelector(actor) {
		await this.ensureReady();
		const info = this.getActorClassInfo(actor);
		if (!info) return;

		const selector = new SpellSelector(
			actor,
			info.classIdentifier,
			info.level,
			info.subclassIdentifier,
		);
		selector.render(true);
	}

	/**
	 * Open only the equipment selector.
	 * @param {Actor} actor
	 */
	async openEquipmentSelector(actor) {
		await this.ensureReady();
		const info = this.getActorClassInfo(actor);
		if (!info) return;

		const selector = new EquipmentSelector(actor, info.classIdentifier);
		selector.render(true);
	}

}

export { SelectorOrchestrator };
