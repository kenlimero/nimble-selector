import { MODULE_ID, LOG_PREFIX, buildOwnedItemKeys } from '../utils/constants.mjs';
import { ClassFeatureResolver } from '../data/ClassFeatureResolver.mjs';
import { SchoolChoiceResolver } from '../data/SchoolChoiceResolver.mjs';
import { SpellTierResolver } from '../data/SpellTierResolver.mjs';
import { CompendiumBrowser } from './CompendiumBrowser.mjs';
import { ItemGranter } from './ItemGranter.mjs';

/**
 * @typedef {object} AutoGrantResult
 * @property {{ features: string[], spells: string[] }} granted - Names of items granted
 * @property {{ selectableGroups: string[], schoolChoices: import('../data/SchoolChoiceResolver.mjs').PendingChoice[] }} pending
 */

/**
 * Executes auto-grant of features and spells for an actor.
 * Call shouldAutoGrant(actor) before execute() — execute() does not enforce the check internally.
 */
class AutoGranter {
	#featureResolver;
	#schoolChoiceResolver;
	#tierResolver;
	#compendiumBrowser;
	#itemGranter;

	constructor() {
		this.#featureResolver = new ClassFeatureResolver();
		this.#schoolChoiceResolver = new SchoolChoiceResolver();
		this.#tierResolver = new SpellTierResolver();
		this.#compendiumBrowser = CompendiumBrowser.instance;
		this.#itemGranter = new ItemGranter();
	}

	/**
	 * Determine if auto-grant is active for an actor.
	 * Actor flag overrides global setting; undefined flag defers to global.
	 * @param {Actor} actor
	 * @returns {boolean}
	 */
	shouldAutoGrant(actor) {
		const actorFlag = actor.getFlag(MODULE_ID, 'autoGrant');
		if (actorFlag !== undefined) return Boolean(actorFlag);
		return game.settings.get(MODULE_ID, 'autoGrantEnabled');
	}

	/**
	 * Grant all deterministic features and spells. Collect non-deterministic
	 * items for caller to handle via notification.
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {number} fromLevel
	 * @param {number} toLevel
	 * @param {string|null} subclassIdentifier
	 * @returns {Promise<AutoGrantResult>}
	 */
	async execute(actor, classIdentifier, fromLevel, toLevel, subclassIdentifier) {
		/** @type {AutoGrantResult} */
		const result = {
			granted: { features: [], spells: [] },
			pending: { selectableGroups: [], schoolChoices: [] },
		};

		try {
			await this.#grantFeatures(actor, classIdentifier, fromLevel, toLevel, subclassIdentifier, result);
			await this.#grantSpells(actor, classIdentifier, toLevel, subclassIdentifier, result);
		} catch (err) {
			console.error(`${LOG_PREFIX} AutoGranter.execute failed:`, err);
		}

		return result;
	}

	/**
	 * Grant progression features and collect selectable groups.
	 */
	async #grantFeatures(actor, classIdentifier, fromLevel, toLevel, subclassIdentifier, result) {
		const resolved = this.#featureResolver.resolveRange(classIdentifier, fromLevel, toLevel, subclassIdentifier);
		const annotated = this.#featureResolver.markOwnedFeatures(actor, resolved);

		const uuidsToGrant = [];
		const featureNames = [];
		const pendingGroups = new Set();

		for (const f of annotated) {
			if (f.selectableGroup) {
				pendingGroups.add(f.selectableGroup);
				continue;
			}
			if (f.alreadyOwned || !f.matched || !f.uuid) continue;
			uuidsToGrant.push(f.uuid);
			featureNames.push(f.name);
		}

		result.pending.selectableGroups = [...pendingGroups];

		if (uuidsToGrant.length > 0) {
			await this.#itemGranter.grantItemsByUuid(actor, uuidsToGrant);
			result.granted.features.push(...featureNames);
		}
	}

	/**
	 * Grant spells for an actor after all school choices have been resolved.
	 * Called from SelectorPanel when a school choice is confirmed and none remain pending.
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {Promise<string[]>} Names of spells granted
	 */
	async grantSpellsAfterChoice(actor, classIdentifier, level, subclassIdentifier) {
		const result = {
			granted: { features: [], spells: [] },
			pending: { selectableGroups: [], schoolChoices: [] },
		};
		try {
			await this.#grantSpells(actor, classIdentifier, level, subclassIdentifier, result);
		} catch (err) {
			console.error(`${LOG_PREFIX} AutoGranter.grantSpellsAfterChoice failed:`, err);
		}
		return result.granted.spells;
	}

	/**
	 * Grant all available spells if schools are fully resolved.
	 * Skips if school choices are pending or the class has no spellcasting.
	 */
	async #grantSpells(actor, classIdentifier, level, subclassIdentifier, result) {
		const pendingChoices = this.#schoolChoiceResolver.getPendingChoices(
			actor, classIdentifier, level, subclassIdentifier,
		);
		result.pending.schoolChoices = pendingChoices;

		if (pendingChoices.length > 0) return;

		const maxTier = this.#tierResolver.resolve(classIdentifier, level, subclassIdentifier);
		if (maxTier < 0) return; // No spellcasting

		const minTier = this.#tierResolver.resolveMin(classIdentifier, subclassIdentifier);
		const schools = this.#schoolChoiceResolver.resolveAllSchools(
			actor, classIdentifier, level, subclassIdentifier,
		);
		if (schools.length === 0) return;

		const allSpells = this.#compendiumBrowser.findSpells({
			schools,
			maxTier,
			minTier,
			includeUtility: false,
			classIdentifier,
		});

		const ownedKeys = buildOwnedItemKeys(actor, 'spell');
		const newSpells = allSpells.filter(
			(s) => !s.isSecret && !ownedKeys.has(s.uuid) && !ownedKeys.has(s._normalizedName),
		);

		if (newSpells.length === 0) return;

		await this.#itemGranter.grantItemsByUuid(actor, newSpells.map((s) => s.uuid));
		result.granted.spells = newSpells.map((s) => s.name);
	}
}

export { AutoGranter };
