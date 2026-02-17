import { DATA_PATH } from '../utils/constants.mjs';

/**
 * Singleton that loads and caches the JSON data files.
 * Provides lookup methods for class features, spell schools, spell tiers,
 * and equipment proficiencies.
 */
class DataProvider {
	static #instance = null;

	#classFeatures = null;
	#spellSchools = null;
	#spellTiers = null;
	#equipmentProficiencies = null;
	#loaded = false;

	constructor() {
		if (DataProvider.#instance) {
			throw new Error('DataProvider is a singleton. Use DataProvider.instance instead.');
		}
	}

	static get instance() {
		if (!DataProvider.#instance) {
			DataProvider.#instance = new DataProvider();
		}
		return DataProvider.#instance;
	}

	get loaded() {
		return this.#loaded;
	}

	async load() {
		if (this.#loaded) return;

		const [classFeatures, spellSchools, spellTiers, equipmentProficiencies] = await Promise.all([
			this.#fetchJSON('class-features.json'),
			this.#fetchJSON('spell-schools.json'),
			this.#fetchJSON('spell-tiers.json'),
			this.#fetchJSON('equipment-proficiencies.json'),
		]);

		this.#classFeatures = classFeatures;
		this.#spellSchools = spellSchools;
		this.#spellTiers = spellTiers;
		this.#equipmentProficiencies = equipmentProficiencies;
		this.#loaded = true;
	}

	async #fetchJSON(filename) {
		const response = await fetch(`${DATA_PATH}/${filename}`);
		if (!response.ok) {
			console.error(`nimble-levelling | Failed to load ${filename}: ${response.statusText}`);
			return {};
		}
		return response.json();
	}

	/**
	 * Get feature names for a specific class at a specific level.
	 * @param {string} classIdentifier - e.g. "berserker", "mage"
	 * @param {number} level - Character level (1-20)
	 * @param {string|null} subclassIdentifier - e.g. "path-of-the-mountainheart"
	 * @returns {string[]} Array of feature names
	 */
	getFeaturesForLevel(classIdentifier, level, subclassIdentifier = null) {
		const classData = this.#classFeatures?.[classIdentifier];
		if (!classData) return [];

		const features = [];
		const baseFeatures = classData.base?.[String(level)];
		if (baseFeatures) features.push(...baseFeatures);

		if (subclassIdentifier) {
			const subFeatures = classData.subclasses?.[subclassIdentifier]?.[String(level)];
			if (subFeatures) features.push(...subFeatures);
		}

		return features;
	}

	/**
	 * Get feature names for a class across a range of levels (inclusive).
	 * @param {string} classIdentifier
	 * @param {number} fromLevel
	 * @param {number} toLevel
	 * @param {string|null} subclassIdentifier
	 * @returns {Map<number, string[]>} Map of level -> feature names
	 */
	getFeaturesForRange(classIdentifier, fromLevel, toLevel, subclassIdentifier = null) {
		const result = new Map();
		for (let level = fromLevel; level <= toLevel; level++) {
			const features = this.getFeaturesForLevel(classIdentifier, level, subclassIdentifier);
			if (features.length > 0) {
				result.set(level, features);
			}
		}
		return result;
	}

	/**
	 * Get spell schools accessible to a class at a given level.
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {{ granted: string[], choices: Array<{ schools: string[] }> }}
	 */
	getSpellSchools(classIdentifier, level, subclassIdentifier = null) {
		const classData = this.#spellSchools?.[classIdentifier];
		if (!classData) return { granted: [], choices: [] };

		const granted = new Set();
		const choices = [];

		// Accumulate base schools up to the given level
		if (classData.base) {
			for (const [lvl, schools] of Object.entries(classData.base)) {
				if (Number.isNaN(Number(lvl)) || Number(lvl) > level) continue;
				if (!Array.isArray(schools)) continue;

				for (const school of schools) {
					if (typeof school === 'string') {
						granted.add(school.replace('+', ''));
					}
				}
			}
		}

		// Top-level choices (e.g. Songweaver picks 1 school at level 1)
		if (classData.choices) {
			for (const [lvl, choiceData] of Object.entries(classData.choices)) {
				if (Number(lvl) > level) continue;
				choices.push(choiceData);
			}
		}

		// Accumulate subclass schools
		if (subclassIdentifier && classData.subclasses?.[subclassIdentifier]) {
			const subData = classData.subclasses[subclassIdentifier];
			for (const [lvl, value] of Object.entries(subData)) {
				if (Number.isNaN(Number(lvl)) || Number(lvl) > level) continue;

				if (Array.isArray(value)) {
					// Standard school list: ["+wind"]
					for (const school of value) {
						if (typeof school === 'string') {
							granted.add(school.replace('+', ''));
						}
					}
				} else if (value && typeof value === 'object' && value.choices) {
					// Choice at this level: { choices: { count: 1, options: [...] } }
					choices.push(value.choices);
				}
			}
		}

		return { granted: [...granted], choices };
	}

	/**
	 * Get the maximum spell tier accessible to a class at a given level.
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {number} Max tier (0 = cantrips only, -1 = no spellcasting)
	 */
	getMaxSpellTier(classIdentifier, level, subclassIdentifier = null) {
		const classData = this.#spellTiers?.[classIdentifier];

		// Check subclass tiers first (e.g., Spellblade for Commander)
		if (subclassIdentifier) {
			const subTiers = classData?.subclasses?.[subclassIdentifier];
			if (subTiers) {
				return this.#findMaxTierAtLevel(subTiers, level);
			}
		}

		if (!classData?.base) return -1;
		return this.#findMaxTierAtLevel(classData.base, level);
	}

	#findMaxTierAtLevel(tierMap, level) {
		let maxTier = 0;
		for (const [lvl, tier] of Object.entries(tierMap)) {
			if (Number(lvl) <= level) {
				maxTier = Math.max(maxTier, tier);
			}
		}
		return maxTier;
	}

	/**
	 * Get equipment proficiencies for a class.
	 * @param {string} classIdentifier
	 * @returns {{ armor: string[], weapons: string[] }}
	 */
	getEquipmentProficiencies(classIdentifier) {
		return this.#equipmentProficiencies?.[classIdentifier] ?? { armor: [], weapons: [] };
	}
}

export { DataProvider };
