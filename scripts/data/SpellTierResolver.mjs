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
	 * @param {string|null} subclassIdentifier
	 * @returns {number} Max tier (0 = cantrips only, -1 = no spellcasting)
	 */
	resolve(classIdentifier, level, subclassIdentifier = null) {
		return this.#dataProvider.getMaxSpellTier(classIdentifier, level, subclassIdentifier);
	}

}

export { SpellTierResolver };
