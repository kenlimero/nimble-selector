import { DataProvider } from './DataProvider.mjs';

/**
 * Determines which spell schools are accessible to a character
 * based on their class, subclass, and level.
 */
class SpellSchoolResolver {
	#dataProvider;

	constructor() {
		this.#dataProvider = DataProvider.instance;
	}

	/**
	 * Resolve the spell schools accessible at a given level.
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {{ granted: string[], choices: Array<{ schools: string[] }> }}
	 */
	resolve(classIdentifier, level, subclassIdentifier = null) {
		return this.#dataProvider.getSpellSchools(classIdentifier, level, subclassIdentifier);
	}

	/**
	 * Check if a class (with optional subclass) has any spellcasting ability.
	 * @param {string} classIdentifier
	 * @param {string|null} subclassIdentifier
	 * @returns {boolean}
	 */
	hasCasting(classIdentifier, subclassIdentifier = null) {
		const schools = this.#dataProvider.getSpellSchools(classIdentifier, 20, subclassIdentifier);
		return schools.granted.length > 0 || schools.choices.length > 0;
	}
}

export { SpellSchoolResolver };
