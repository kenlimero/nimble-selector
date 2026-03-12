import { DATA_PATH, LOG_PREFIX } from '../utils/constants.mjs';

/**
 * @typedef {object} SpellSchoolAccess
 * @property {string[]} granted - Schools automatically available
 * @property {Array<{count?: number, options?: string[]}>} choices - Schools the player must choose from
 */

/**
 * Singleton that loads and caches the JSON data files.
 * Provides lookup methods for spell schools, spell tiers,
 * and equipment proficiencies.
 */
class DataProvider {
	static #instance = null;

	/** @type {object|null} */
	#spellSchools = null;
	/** @type {object|null} */
	#spellTiers = null;
	/** @type {object|null} */
	#equipmentProficiencies = null;
	/** @type {Set<string>} Normalized names of secret spells. */
	#secretSpellNames = new Set();
	#loaded = false;
	/** @type {Promise<void>|null} */
	#loadPromise = null;

	constructor() {
		if (DataProvider.#instance) {
			throw new Error('DataProvider is a singleton. Use DataProvider.instance instead.');
		}
	}

	/** @returns {DataProvider} */
	static get instance() {
		if (!DataProvider.#instance) {
			DataProvider.#instance = new DataProvider();
		}
		return DataProvider.#instance;
	}

	/** @returns {boolean} */
	get loaded() {
		return this.#loaded;
	}

	/**
	 * Load all data files in parallel. Safe to call multiple times.
	 * @returns {Promise<void>}
	 */
	async load() {
		if (this.#loaded) return;
		if (this.#loadPromise) return this.#loadPromise;
		this.#loadPromise = this.#doLoad();
		return this.#loadPromise;
	}

	/**
	 * Internal load implementation — called only once.
	 * @returns {Promise<void>}
	 */
	async #doLoad() {
		const [spellSchools, spellTiers, equipmentProficiencies, secretSpells] = await Promise.all([
			this.#fetchJSON('spell-schools.json'),
			this.#fetchJSON('spell-tiers.json'),
			this.#fetchJSON('equipment-proficiencies.json'),
			this.#fetchJSON('secret-spells.json'),
		]);

		this.#spellSchools = spellSchools;
		this.#spellTiers = spellTiers;
		this.#equipmentProficiencies = equipmentProficiencies;
		this.#secretSpellNames = new Set(
			(Array.isArray(secretSpells) ? secretSpells : []).map((n) => n.toLowerCase().trim().replace(/['']/g, "'")),
		);
		this.#loaded = true;
	}

	/**
	 * Fetch and parse a JSON file from the module data directory.
	 * @param {string} filename
	 * @returns {Promise<object>} Parsed JSON, or empty object on failure
	 */
	async #fetchJSON(filename) {
		try {
			const response = await fetch(`${DATA_PATH}/${filename}`);
			if (!response.ok) {
				console.error(`${LOG_PREFIX} Failed to load ${filename}: ${response.statusText}`);
				return {};
			}
			return await response.json();
		} catch (err) {
			console.error(`${LOG_PREFIX} Error loading ${filename}:`, err);
			return {};
		}
	}

	/**
	 * Get spell schools accessible to a class at a given level.
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} [subclassIdentifier=null]
	 * @returns {SpellSchoolAccess}
	 */
	getSpellSchools(classIdentifier, level, subclassIdentifier = null) {
		const classData = this.#spellSchools?.[classIdentifier];
		if (!classData) return { granted: [], choices: [] };

		const granted = new Set();
		const choices = [];

		// Accumulate base schools up to the given level
		this.#collectSchoolsUpToLevel(classData.base, level, granted);

		// Top-level choices (e.g. Songweaver picks 1 school at level 1)
		this.#collectChoicesUpToLevel(classData.choices, level, choices);

		// Accumulate subclass schools
		if (subclassIdentifier) {
			const subData = classData.subclasses?.[subclassIdentifier];
			if (subData) {
				this.#collectSubclassSchools(subData, level, granted, choices);
			}
		}

		return { granted: [...granted], choices };
	}

	/**
	 * Collect granted schools from a level-keyed map up to the given level.
	 * @param {object|undefined} levelMap - e.g. { "1": ["+fire"], "5": ["+ice"] }
	 * @param {number} maxLevel
	 * @param {Set<string>} granted - Mutated: schools are added here
	 */
	#collectSchoolsUpToLevel(levelMap, maxLevel, granted) {
		if (!levelMap) return;
		for (const [lvl, schools] of Object.entries(levelMap)) {
			if (!DataProvider.#isValidLevel(lvl, maxLevel)) continue;
			if (!Array.isArray(schools)) continue;
			for (const school of schools) {
				if (typeof school === 'string') {
					granted.add(school.replace('+', ''));
				}
			}
		}
	}

	/**
	 * Collect choice objects from a level-keyed map up to the given level.
	 * @param {object|undefined} choiceMap - e.g. { "1": { count: 1, options: [...] } }
	 * @param {number} maxLevel
	 * @param {Array} choices - Mutated: choice objects are pushed here
	 */
	#collectChoicesUpToLevel(choiceMap, maxLevel, choices) {
		if (!choiceMap) return;
		for (const [lvl, choiceData] of Object.entries(choiceMap)) {
			if (Number(lvl) <= maxLevel) {
				choices.push(choiceData);
			}
		}
	}

	/**
	 * Collect schools and choices from subclass data up to the given level.
	 * Subclass entries can be either an array of schools or a choice object.
	 * @param {object} subData - Subclass level-keyed map
	 * @param {number} maxLevel
	 * @param {Set<string>} granted - Mutated
	 * @param {Array} choices - Mutated
	 */
	#collectSubclassSchools(subData, maxLevel, granted, choices) {
		for (const [lvl, value] of Object.entries(subData)) {
			if (!DataProvider.#isValidLevel(lvl, maxLevel)) continue;

			if (Array.isArray(value)) {
				for (const school of value) {
					if (typeof school === 'string') {
						granted.add(school.replace('+', ''));
					}
				}
			} else if (value?.choices) {
				choices.push(value.choices);
			}
		}
	}

	/**
	 * Check if a level string is a valid number and within the max level.
	 * @param {string} lvl
	 * @param {number} maxLevel
	 * @returns {boolean}
	 */
	static #isValidLevel(lvl, maxLevel) {
		const n = Number(lvl);
		return !Number.isNaN(n) && n <= maxLevel;
	}

	/**
	 * Get the maximum spell tier accessible to a class at a given level.
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} [subclassIdentifier=null]
	 * @returns {number} Max tier (0 = cantrips only, -1 = no spellcasting)
	 */
	getMaxSpellTier(classIdentifier, level, subclassIdentifier = null) {
		const classData = this.#spellTiers?.[classIdentifier];

		// Check subclass tiers first (e.g., Spellblade for Commander)
		if (subclassIdentifier) {
			const subTiers = classData?.subclasses?.[subclassIdentifier];
			if (subTiers) {
				return DataProvider.#findMaxTierAtLevel(subTiers, level);
			}
		}

		if (!classData?.base) return -1;
		return DataProvider.#findMaxTierAtLevel(classData.base, level);
	}

	/**
	 * Find the highest tier available at or below the given level.
	 * @param {object} tierMap - e.g. { "1": 0, "3": 1, "5": 2 }
	 * @param {number} level
	 * @returns {number}
	 */
	static #findMaxTierAtLevel(tierMap, level) {
		let maxTier = -1;
		for (const [lvl, tier] of Object.entries(tierMap)) {
			if (Number(lvl) <= level) {
				maxTier = Math.max(maxTier, tier);
			}
		}
		return maxTier;
	}

	/**
	 * Check if a spell name is in the secret spells list.
	 * @param {string} normalizedName - Lowercased, trimmed spell name
	 * @returns {boolean}
	 */
	isSecretSpell(normalizedName) {
		return this.#secretSpellNames.has(normalizedName);
	}

	/**
	 * Get equipment proficiencies for a class.
	 * @param {string} classIdentifier
	 * @returns {{ armor: string[], weapons: string[] }}
	 */
	getEquipmentProficiencies(classIdentifier) {
		return this.#equipmentProficiencies?.[classIdentifier] ?? { armor: [], weapons: [] };
	}

	/**
	 * Get the weapon category definitions (tag → weapon names).
	 * @returns {Record<string, string[]>}
	 */
	getWeaponCategories() {
		return this.#equipmentProficiencies?.weaponCategories ?? {};
	}
}

export { DataProvider };
