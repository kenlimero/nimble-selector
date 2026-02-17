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

	/**
	 * Check if the class has gained a new spell tier at this level.
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {boolean}
	 */
	hasNewTierAtLevel(classIdentifier, level, subclassIdentifier = null) {
		if (level <= 1) return false;
		const currentTier = this.resolve(classIdentifier, level, subclassIdentifier);
		const previousTier = this.resolve(classIdentifier, level - 1, subclassIdentifier);
		return currentTier > previousTier;
	}
}

export { SpellTierResolver };
