import { DATA_PATH, LOG_PREFIX, normalizeString } from '../utils/constants.mjs';

/**
 * @typedef {object} SpellSchoolChoice
 * @property {number} count - How many schools to choose
 * @property {string} [type] - "school" or "any-school"
 * @property {string[]} [options] - Specific schools to choose from
 * @property {number} level - The level at which this choice is configured
 * @property {'class'|'subclass'} source - Whether this comes from base class or subclass
 * @property {string} sourceIdentifier - The class or subclass identifier
 */

/**
 * @typedef {object} SpellSchoolAccess
 * @property {string[]} granted - Schools automatically available
 * @property {SpellSchoolChoice[]} choices - Schools the player must choose from
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
	/** @type {Map<string, string>} Normalized spell name → exclusive class identifier. */
	#classExclusiveSpells = new Map();
	/** @type {boolean} */
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
	 * Resets the cached promise on failure so future calls can retry.
	 * @returns {Promise<void>}
	 */
	async #doLoad() {
		try {
			const [spellSchools, spellTiers, equipmentProficiencies, secretSpells, classExclusiveSpells] = await Promise.all([
				this.#fetchJSON('spell-schools.json'),
				this.#fetchJSON('spell-tiers.json'),
				this.#fetchJSON('equipment-proficiencies.json'),
				this.#fetchJSON('secret-spells.json'),
				this.#fetchJSON('class-exclusive-spells.json'),
			]);

			this.#spellSchools = spellSchools;
			this.#spellTiers = spellTiers;
			this.#equipmentProficiencies = equipmentProficiencies;
			this.#secretSpellNames = new Set(
				(Array.isArray(secretSpells) ? secretSpells : []).map(normalizeString),
			);
			this.#classExclusiveSpells = new Map(
				Object.entries(classExclusiveSpells ?? {}).map(([name, cls]) => [
					normalizeString(name),
					normalizeString(cls),
				]),
			);
			this.#loaded = true;
		} catch (err) {
			this.#loadPromise = null;
			throw err;
		}
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
		this.#collectChoicesUpToLevel(classData.choices, level, choices, 'class', classIdentifier);

		// Accumulate subclass schools
		if (subclassIdentifier) {
			const subData = classData.subclasses?.[subclassIdentifier];
			if (subData) {
				this.#collectSubclassSchools(subData, level, granted, choices, subclassIdentifier);
			}
		}

		return { granted: [...granted], choices };
	}

	/**
	 * Check if a class (with optional subclass) has any spellcasting ability.
	 * Tests against level 20 to capture all possible unlocks.
	 * @param {string} classIdentifier
	 * @param {string|null} [subclassIdentifier=null]
	 * @returns {boolean}
	 */
	hasCasting(classIdentifier, subclassIdentifier = null) {
		const schools = this.getSpellSchools(classIdentifier, 20, subclassIdentifier);
		return schools.granted.length > 0 || schools.choices.length > 0;
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
	 * @param {'class'|'subclass'} source - Origin of the choice
	 * @param {string} sourceIdentifier - Class or subclass identifier
	 */
	#collectChoicesUpToLevel(choiceMap, maxLevel, choices, source, sourceIdentifier) {
		if (!choiceMap) return;
		for (const [lvl, choiceData] of Object.entries(choiceMap)) {
			if (DataProvider.#isValidLevel(lvl, maxLevel)) {
				choices.push({
					...choiceData,
					level: Number(lvl),
					source,
					sourceIdentifier,
				});
			}
		}
	}

	/**
	 * Collect schools and choices from subclass data up to the given level.
	 * Subclass entries can be either an array of school strings or an object
	 * with a `choices` property for player-driven selection.
	 * @param {object} subData - Subclass level-keyed map
	 * @param {number} maxLevel
	 * @param {Set<string>} granted - Mutated
	 * @param {Array<SpellSchoolChoice>} choices - Mutated
	 * @param {string} subclassIdentifier - Subclass identifier for metadata
	 */
	#collectSubclassSchools(subData, maxLevel, granted, choices, subclassIdentifier) {
		for (const [lvl, value] of Object.entries(subData)) {
			if (!DataProvider.#isValidLevel(lvl, maxLevel)) continue;

			if (Array.isArray(value)) {
				for (const school of value) {
					if (typeof school === 'string') {
						granted.add(school.replace('+', ''));
					}
				}
			} else if (value?.choices) {
				choices.push({
					...value.choices,
					level: Number(lvl),
					source: 'subclass',
					sourceIdentifier: subclassIdentifier,
				});
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
	 * Get the minimum spell tier for a class (i.e. the lowest tier in its table).
	 * Classes that start at tier 0 have cantrips; subclasses like Spellblade start at tier 1.
	 * @param {string} classIdentifier
	 * @param {string|null} [subclassIdentifier=null]
	 * @returns {number} Min tier (0 = has cantrips, 1+ = no cantrips, -1 = no spellcasting)
	 */
	getMinSpellTier(classIdentifier, subclassIdentifier = null) {
		const classData = this.#spellTiers?.[classIdentifier];

		if (subclassIdentifier) {
			const subTiers = classData?.subclasses?.[subclassIdentifier];
			if (subTiers) {
				return DataProvider.#findMinTier(subTiers);
			}
		}

		if (!classData?.base) return -1;
		return DataProvider.#findMinTier(classData.base);
	}

	/**
	 * Find the lowest tier value in a tier map.
	 * @param {Record<string, number>} tierMap
	 * @returns {number} Minimum tier, or -1 if the map is empty
	 */
	static #findMinTier(tierMap) {
		const values = Object.values(tierMap);
		return values.length > 0 ? Math.min(...values) : -1;
	}

	/**
	 * Find the highest tier available at or below the given level.
	 * Uses a sorted array for efficient reverse scan.
	 * @param {object} tierMap - e.g. { "1": 0, "3": 1, "5": 2 }
	 * @param {number} level
	 * @returns {number}
	 */
	static #findMaxTierAtLevel(tierMap, level) {
		let maxTier = -1;
		for (const [lvl, tier] of DataProvider.#toSortedPairs(tierMap)) {
			if (lvl > level) break;
			if (tier > maxTier) maxTier = tier;
		}
		return maxTier;
	}

	/** @type {WeakMap<object, Array<[number, number]>>} */
	static #sortedPairsCache = new WeakMap();

	/**
	 * Convert a tier map to a sorted array of [level, tier] pairs.
	 * Caches the result via WeakMap to avoid polluting the source object.
	 * @param {Record<string, number>} tierMap
	 * @returns {Array<[number, number]>}
	 */
	static #toSortedPairs(tierMap) {
		const cached = DataProvider.#sortedPairsCache.get(tierMap);
		if (cached) return cached;
		const pairs = Object.entries(tierMap)
			.map(([lvl, tier]) => [Number(lvl), tier])
			.sort(([a], [b]) => a - b);
		DataProvider.#sortedPairsCache.set(tierMap, pairs);
		return pairs;
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
	 * Check if a spell is exclusive to a class other than the given one.
	 * @param {string} normalizedSpellName - Lowercased, trimmed spell name
	 * @param {string} classIdentifier - Current class identifier
	 * @returns {boolean} True if the spell is exclusive to another class (should be hidden)
	 */
	isExcludedByClass(normalizedSpellName, classIdentifier) {
		const exclusiveClass = this.#classExclusiveSpells.get(normalizedSpellName);
		if (!exclusiveClass) return false;
		return exclusiveClass !== normalizeString(classIdentifier);
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
