import { DataProvider } from './DataProvider.mjs';

/**
 * Determines the maximum spell tier accessible to a character
 * based on their class, subclass, and level.
 */
class SpellTierResolver {
	#dataProvider;

	constructor() {
		this.#dataProvider = DataProvider.instance;
	}

	/**
	 * Resolve the max spell tier for a class at a given level.
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} [subclassIdentifier=null]
	 * @returns {number} Max tier (0 = cantrips only, -1 = no spellcasting)
	 */
	resolve(classIdentifier, level, subclassIdentifier = null) {
		return this.#dataProvider.getMaxSpellTier(classIdentifier, level, subclassIdentifier);
	}

	/**
	 * Resolve the minimum spell tier for a class.
	 * 0 means the class has cantrips, 1+ means no cantrips.
	 * @param {string} classIdentifier
	 * @param {string|null} [subclassIdentifier=null]
	 * @returns {number}
	 */
	resolveMin(classIdentifier, subclassIdentifier = null) {
		return this.#dataProvider.getMinSpellTier(classIdentifier, subclassIdentifier);
	}
}

export { SpellTierResolver };
