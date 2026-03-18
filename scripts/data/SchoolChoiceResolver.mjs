import { MODULE_ID, LOG_PREFIX } from '../utils/constants.mjs';
import { DataProvider } from './DataProvider.mjs';

/** @type {readonly string[]} Core schools available for open choices. */
const CORE_SCHOOLS = Object.freeze(['fire', 'ice', 'lightning', 'necrotic', 'radiant', 'wind']);

/**
 * @typedef {object} PendingChoice
 * @property {string} key - Flag storage key (e.g. "class__songweaver__1")
 * @property {string[]} availableOptions - Schools the player can pick from
 * @property {number} count - How many schools to choose
 * @property {string} [type] - "school" or "any-school"
 * @property {number} level - Level at which this choice is configured
 * @property {'class'|'subclass'} source
 * @property {string} sourceIdentifier
 */

/**
 * @typedef {object} ConfirmedChoice
 * @property {string} key - Flag storage key
 * @property {string[]} chosenSchools - Schools the player has chosen
 * @property {number} count
 * @property {number} level
 * @property {'class'|'subclass'} source
 * @property {string} sourceIdentifier
 */

/**
 * Manages spell school choices persisted as Foundry actor flags.
 * Bridges the DataProvider choice definitions with actor-specific selections.
 */
class SchoolChoiceResolver {
	/** @type {DataProvider} */
	#dataProvider;

	constructor() {
		this.#dataProvider = DataProvider.instance;
	}

	/**
	 * Build the flag key for a choice.
	 * Uses `__` separator (colons are unsafe in Foundry flag dot-notation paths).
	 * @param {import('./DataProvider.mjs').SpellSchoolChoice} choice
	 * @returns {string} e.g. "class__songweaver__1"
	 */
	static buildKey(choice) {
		return `${choice.source}__${choice.sourceIdentifier}__${choice.level}`;
	}

	/**
	 * Read all persisted school choices for an actor.
	 * @param {Actor} actor
	 * @returns {Record<string, string[]>} key → chosen schools
	 */
	getChoices(actor) {
		return actor.getFlag(MODULE_ID, 'schoolChoices') ?? {};
	}

	/**
	 * Persist a single school choice using Foundry dot-notation.
	 * @param {Actor} actor
	 * @param {string} key - e.g. "class__songweaver__1"
	 * @param {string[]} schools - e.g. ["fire"]
	 */
	async saveChoice(actor, key, schools) {
		if (!key || !Array.isArray(schools) || schools.length === 0) {
			console.warn(`${LOG_PREFIX} saveChoice called with invalid arguments:`, { key, schools });
			return;
		}
		await actor.setFlag(MODULE_ID, `schoolChoices.${key}`, schools);
	}

	/**
	 * Remove a single school choice using Foundry dot-notation.
	 * @param {Actor} actor
	 * @param {string} key
	 */
	async removeChoice(actor, key) {
		if (!key) return;
		await actor.unsetFlag(MODULE_ID, `schoolChoices.${key}`);
	}

	/**
	 * Return unresolved choices — configured in JSON but not yet persisted.
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {PendingChoice[]}
	 */
	getPendingChoices(actor, classIdentifier, level, subclassIdentifier) {
		const { choices, granted, persisted } = this.#getChoiceState(actor, classIdentifier, level, subclassIdentifier);
		const grantedSet = new Set(granted);

		/** @type {PendingChoice[]} */
		const pending = [];
		for (const choice of choices) {
			const key = SchoolChoiceResolver.buildKey(choice);
			if (persisted[key]) continue;

			const availableOptions = choice.options
				? [...choice.options]
				: CORE_SCHOOLS.filter((s) => !grantedSet.has(s));

			pending.push({ ...choice, key, availableOptions });
		}
		return pending;
	}

	/**
	 * Return already-confirmed choices with their metadata.
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {ConfirmedChoice[]}
	 */
	getConfirmedChoices(actor, classIdentifier, level, subclassIdentifier) {
		const { choices, persisted } = this.#getChoiceState(actor, classIdentifier, level, subclassIdentifier);

		/** @type {ConfirmedChoice[]} */
		const confirmed = [];
		for (const choice of choices) {
			const key = SchoolChoiceResolver.buildKey(choice);
			const chosenSchools = persisted[key];
			if (Array.isArray(chosenSchools)) {
				confirmed.push({ ...choice, key, chosenSchools });
			}
		}
		return confirmed;
	}

	/**
	 * Merge granted schools + persisted choices into a single list.
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {string[]}
	 */
	resolveAllSchools(actor, classIdentifier, level, subclassIdentifier) {
		const { choices, granted, persisted } = this.#getChoiceState(actor, classIdentifier, level, subclassIdentifier);
		const allSchools = new Set(granted);

		for (const choice of choices) {
			const key = SchoolChoiceResolver.buildKey(choice);
			const chosen = persisted[key];
			if (Array.isArray(chosen)) {
				for (const school of chosen) allSchools.add(school);
			}
		}

		return [...allSchools];
	}

	/**
	 * Fetch DataProvider schools and actor-persisted choices in one call.
	 * Shared by getPendingChoices, getConfirmedChoices, and resolveAllSchools
	 * to avoid redundant DataProvider + flag lookups.
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {{ granted: string[], choices: import('./DataProvider.mjs').SpellSchoolChoice[], persisted: Record<string, string[]> }}
	 */
	#getChoiceState(actor, classIdentifier, level, subclassIdentifier) {
		const { granted, choices } = this.#dataProvider.getSpellSchools(
			classIdentifier, level, subclassIdentifier,
		);
		const persisted = this.getChoices(actor);
		return { granted, choices, persisted };
	}
}

export { SchoolChoiceResolver, CORE_SCHOOLS };
