import { MODULE_ID } from '../utils/constants.mjs';
import { DataProvider } from './DataProvider.mjs';

/** @type {string[]} Core schools available for open choices. */
const CORE_SCHOOLS = ['fire', 'ice', 'lightning', 'necrotic', 'radiant', 'wind'];

/**
 * Manages spell school choices persisted as Foundry actor flags.
 * Bridges the DataProvider choice definitions with actor-specific selections.
 */
class SchoolChoiceResolver {
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
	 * @param {string} key - e.g. "class:songweaver:1"
	 * @param {string[]} schools - e.g. ["fire"]
	 */
	async saveChoice(actor, key, schools) {
		await actor.setFlag(MODULE_ID, `schoolChoices.${key}`, schools);
	}

	/**
	 * Remove a single school choice using Foundry dot-notation.
	 * @param {Actor} actor
	 * @param {string} key
	 */
	async removeChoice(actor, key) {
		await actor.unsetFlag(MODULE_ID, `schoolChoices.${key}`);
	}

	/**
	 * Return unresolved choices — configured in JSON but not yet persisted.
	 * Each returned object includes the full choice metadata plus:
	 * - `key`: the flag storage key
	 * - `availableOptions`: schools the player can pick from (granted excluded)
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {Array<import('./DataProvider.mjs').SpellSchoolChoice & {key: string, availableOptions: string[]}>}
	 */
	getPendingChoices(actor, classIdentifier, level, subclassIdentifier) {
		const { granted, choices } = this.#dataProvider.getSpellSchools(
			classIdentifier, level, subclassIdentifier,
		);
		const persisted = this.getChoices(actor);
		const grantedSet = new Set(granted);

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
	 * @returns {Array<import('./DataProvider.mjs').SpellSchoolChoice & {key: string, chosenSchools: string[]}>}
	 */
	getConfirmedChoices(actor, classIdentifier, level, subclassIdentifier) {
		const { choices } = this.#dataProvider.getSpellSchools(
			classIdentifier, level, subclassIdentifier,
		);
		const persisted = this.getChoices(actor);

		const confirmed = [];
		for (const choice of choices) {
			const key = SchoolChoiceResolver.buildKey(choice);
			if (persisted[key]) {
				confirmed.push({ ...choice, key, chosenSchools: persisted[key] });
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
		const { granted, choices } = this.#dataProvider.getSpellSchools(
			classIdentifier, level, subclassIdentifier,
		);
		const persisted = this.getChoices(actor);
		const allSchools = new Set(granted);

		for (const choice of choices) {
			const key = SchoolChoiceResolver.buildKey(choice);
			const chosen = persisted[key];
			if (Array.isArray(chosen)) {
				for (const school of chosen) {
					allSchools.add(school);
				}
			}
		}

		return [...allSchools];
	}
}

export { SchoolChoiceResolver };
