import { PACK_NAMES, LOG_PREFIX, normalizeString, pushToMapArray } from '../utils/constants.mjs';

/**
 * @typedef {object} FeatureData
 * @property {string} uuid
 * @property {string} name
 * @property {string} img
 * @property {string} class
 * @property {string} _normalizedClass
 * @property {string} featureType
 * @property {string} group
 * @property {string} description
 * @property {number[]} gainedAtLevels
 * @property {boolean} subclass
 */

/**
 * @typedef {object} SpellData
 * @property {string} uuid
 * @property {string} name
 * @property {string} _normalizedName
 * @property {string} img
 * @property {string} school
 * @property {string} _normalizedSchool
 * @property {number} tier
 * @property {boolean} isUtility
 * @property {string} description
 */

/**
 * @typedef {object} ItemData
 * @property {string} uuid
 * @property {string} name
 * @property {string} img
 * @property {string} objectType
 * @property {string} _normalizedType
 * @property {object} properties
 * @property {string} description
 * @property {string|null} weaponAttr
 * @property {boolean} isRanged
 * @property {string|null} armorType
 * @property {number} priceValue
 * @property {string} priceDenomination
 */

/**
 * Indexes and queries the Nimble system's compendium packs.
 * Provides search methods for features, spells, and equipment items.
 */
class CompendiumBrowser {
	static #instance = null;

	/** @type {Map<string, FeatureData[]>} Name-based feature index. */
	#featureIndex = new Map();
	/** @type {Map<string, FeatureData[]>} Class-based feature index. */
	#featureByClassIndex = new Map();
	/** @type {Map<string, SpellData>} UUID-keyed spell index. */
	#spellIndex = new Map();
	/** @type {Map<string, ItemData>} UUID-keyed item index. */
	#itemIndex = new Map();
	#initialized = false;
	/** @type {Promise<void>|null} */
	#initPromise = null;

	constructor() {
		if (CompendiumBrowser.#instance) {
			throw new Error('CompendiumBrowser is a singleton. Use CompendiumBrowser.instance instead.');
		}
	}

	/** @returns {CompendiumBrowser} */
	static get instance() {
		if (!CompendiumBrowser.#instance) {
			CompendiumBrowser.#instance = new CompendiumBrowser();
		}
		return CompendiumBrowser.#instance;
	}

	/** @returns {boolean} */
	get initialized() {
		return this.#initialized;
	}

	/**
	 * Initialize all compendium indexes in parallel.
	 * Safe to call multiple times — subsequent calls are no-ops.
	 * @returns {Promise<void>}
	 */
	async initialize() {
		if (this.#initialized) return;
		if (this.#initPromise) return this.#initPromise;
		this.#initPromise = this.#doInitialize();
		return this.#initPromise;
	}

	/**
	 * Internal initialization — called only once.
	 * @returns {Promise<void>}
	 */
	async #doInitialize() {
		await Promise.all([
			this.#indexFeatures(),
			this.#indexSpells(),
			this.#indexItems(),
		]);

		this.#initialized = true;
	}

	/* ---------------------------------------- */
	/*  Indexing                                 */
	/* ---------------------------------------- */

	/**
	 * Index all class features from the compendium pack.
	 * Builds both a name-based and class-based index for fast lookups.
	 * @returns {Promise<void>}
	 */
	async #indexFeatures() {
		const pack = game.packs.get(PACK_NAMES.classFeatures);
		if (!pack) {
			console.warn(`${LOG_PREFIX} Pack ${PACK_NAMES.classFeatures} not found`);
			return;
		}

		const index = await pack.getIndex({
			fields: ['system.class', 'system.featureType', 'system.group', 'system.description', 'system.gainedAtLevel', 'system.gainedAtLevels', 'system.subclass'],
		});

		const folderClassMap = this.#buildFolderClassMap(pack);

		for (const entry of index) {
			const featureData = this.#buildFeatureData(entry, folderClassMap);
			const nameKey = normalizeString(entry.name);

			pushToMapArray(this.#featureIndex, nameKey, featureData);
			pushToMapArray(this.#featureByClassIndex, featureData._normalizedClass, featureData);
		}
	}

	/**
	 * Build a FeatureData object from a compendium index entry.
	 * @param {object} entry - Raw compendium index entry
	 * @param {Map<string, string>} folderClassMap - Folder-to-class mapping
	 * @returns {FeatureData}
	 */
	#buildFeatureData(entry, folderClassMap) {
		let cls = entry.system?.class ?? '';
		if (!cls && entry.folder) {
			cls = folderClassMap.get(entry.folder) ?? '';
		}

		let levels = entry.system?.gainedAtLevels;
		if (!Array.isArray(levels) || levels.length === 0) {
			const single = entry.system?.gainedAtLevel;
			levels = single != null ? [single] : [];
		}

		return {
			uuid: entry.uuid,
			name: entry.name,
			img: entry.img,
			class: cls,
			_normalizedClass: normalizeString(cls),
			featureType: entry.system?.featureType ?? '',
			group: entry.system?.group ?? '',
			description: CompendiumBrowser.#extractDescription(entry.system?.description),
			gainedAtLevels: levels,
			subclass: entry.system?.subclass ?? false,
		};
	}

	/**
	 * Build a mapping from compendium folder IDs to class names.
	 * Top-level folders in the class-features pack represent classes;
	 * subfolders inherit the class of their root ancestor.
	 * @param {CompendiumCollection} pack
	 * @returns {Map<string, string>}
	 */
	#buildFolderClassMap(pack) {
		const map = new Map();
		if (!pack.folders?.size) return map;

		// Identify root folders (no parent) → these are the class names
		const rootNames = new Map();
		for (const folder of pack.folders) {
			if (!folder.folder) {
				rootNames.set(folder._id, normalizeString(folder.name));
			}
		}

		// Map every folder to its root ancestor's class name
		for (const folder of pack.folders) {
			let current = folder;
			while (current.folder) {
				const parent = pack.folders.get(current.folder);
				if (!parent) break;
				current = parent;
			}
			const className = rootNames.get(current._id);
			if (className) map.set(folder._id, className);
		}

		return map;
	}

	/**
	 * Index all spells from the compendium pack.
	 * @returns {Promise<void>}
	 */
	async #indexSpells() {
		const pack = game.packs.get(PACK_NAMES.spells);
		if (!pack) {
			console.warn(`${LOG_PREFIX} Pack ${PACK_NAMES.spells} not found`);
			return;
		}

		const index = await pack.getIndex({
			fields: ['system.school', 'system.tier', 'system.properties.selected', 'system.description'],
		});

		for (const entry of index) {
			const school = entry.system?.school ?? '';
			this.#spellIndex.set(entry.uuid, {
				uuid: entry.uuid,
				name: entry.name,
				_normalizedName: normalizeString(entry.name),
				img: entry.img,
				school,
				_normalizedSchool: normalizeString(school),
				tier: entry.system?.tier ?? 0,
				isUtility: CompendiumBrowser.#hasProperty(entry.system?.properties?.selected, 'utilitySpell'),
				description: CompendiumBrowser.#extractDescription(entry.system?.description),
			});
		}
	}

	/**
	 * Index all equipment items from the compendium pack.
	 * @returns {Promise<void>}
	 */
	async #indexItems() {
		const pack = game.packs.get(PACK_NAMES.items);
		if (!pack) {
			console.warn(`${LOG_PREFIX} Pack ${PACK_NAMES.items} not found`);
			return;
		}

		const index = await pack.getIndex({
			fields: ['system.objectType', 'system.properties', 'system.description', 'system.activation', 'system.price'],
		});

		for (const entry of index) {
			const objectType = entry.system?.objectType ?? '';
			const props = entry.system?.properties?.selected ?? [];
			const price = entry.system?.price ?? {};

			this.#itemIndex.set(entry.uuid, {
				uuid: entry.uuid,
				name: entry.name,
				img: entry.img,
				objectType,
				_normalizedType: normalizeString(objectType),
				properties: entry.system?.properties ?? {},
				description: CompendiumBrowser.#extractDescription(entry.system?.description),
				weaponAttr: CompendiumBrowser.#extractWeaponAttr(entry.system?.activation),
				isRanged: Array.isArray(props) && props.includes('range'),
				armorType: CompendiumBrowser.#extractArmorType(entry.system?.description?.public ?? ''),
				priceValue: price.value ?? 0,
				priceDenomination: price.denomination ?? 'gp',
			});
		}
	}

	/* ---------------------------------------- */
	/*  Query Methods                           */
	/* ---------------------------------------- */

	/**
	 * Find compendium features matching the given names and class.
	 * @param {string[]} featureNames - Feature names to search for
	 * @param {string} classIdentifier - Class identifier to filter by
	 * @returns {Array<{uuid: string|null, name: string, img: string, matched: boolean, description: string}>}
	 */
	findFeaturesByName(featureNames, classIdentifier) {
		const normalizedClass = normalizeString(classIdentifier);

		return featureNames.map((name) => {
			const match = this.#findBestFeatureMatch(name, normalizedClass);
			return {
				uuid: match?.uuid ?? null,
				name,
				img: match?.img ?? 'icons/svg/mystery-man.svg',
				matched: !!match,
				description: match?.description ?? '',
			};
		});
	}

	/**
	 * Find the best matching feature for a name, preferring exact class match.
	 * Falls back to base name without numeric suffix (e.g. "Extra Attack (2)").
	 * @param {string} name
	 * @param {string} normalizedClass
	 * @returns {FeatureData|undefined}
	 */
	#findBestFeatureMatch(name, normalizedClass) {
		const key = normalizeString(name);
		let candidates = this.#featureIndex.get(key) ?? [];

		// If no match and name has a numeric suffix like (2), (3), try the base name
		if (candidates.length === 0) {
			const baseKey = key.replace(/\s*\(\d+\)$/, '').trim();
			if (baseKey !== key) {
				candidates = this.#featureIndex.get(baseKey) ?? [];
			}
		}

		// Prefer exact class match, fall back to first candidate
		return candidates.find((c) => c._normalizedClass === normalizedClass)
			?? candidates[0];
	}

	/**
	 * Get class features organized by progression and selectable groups
	 * for a given class and level range.
	 * @param {string} classIdentifier - e.g. "berserker"
	 * @param {number} fromLevel - Start of level range (inclusive)
	 * @param {number} toLevel - End of level range (inclusive)
	 * @param {string|null} [subclassIdentifier=null] - e.g. "path-of-the-mountainheart"
	 * @returns {{ progression: Array<{uuid: string, name: string, img: string, description: string, level: number, group: string}>, selectableGroups: Map<string, FeatureData[]> }}
	 */
	getClassFeatures(classIdentifier, fromLevel, toLevel, subclassIdentifier = null) {
		const normalizedClass = normalizeString(classIdentifier);
		const features = this.#featureByClassIndex.get(normalizedClass) ?? [];

		const progression = [];
		const selectableGroups = new Map();

		for (const f of features) {
			const levelsInRange = f.gainedAtLevels.filter((l) => l >= fromLevel && l <= toLevel);
			if (levelsInRange.length === 0) continue;

			const isProgression = f.group.endsWith('-progression');
			const isSubclass = f.subclass;

			// Skip subclass features that don't match the selected subclass
			if (isSubclass && (!subclassIdentifier || f.group !== subclassIdentifier)) continue;

			if (!isSubclass && !isProgression) {
				// Selectable group feature
				pushToMapArray(selectableGroups, f.group, f);
				continue;
			}

			// Progression or matching subclass feature: add once per level in range
			for (const level of levelsInRange) {
				progression.push({
					uuid: f.uuid,
					name: f.name,
					img: f.img,
					description: f.description,
					level,
					group: f.group,
				});
			}
		}

		return { progression, selectableGroups };
	}

	/**
	 * Find spells matching the given schools and max tier.
	 * Utility spells are only included when includeUtility is true.
	 * @param {string[]} schools - Spell school identifiers (real schools only, not "utility")
	 * @param {number} maxTier - Maximum spell tier (inclusive)
	 * @param {boolean} [includeUtility=false] - Whether to include utility-flagged spells
	 * @returns {SpellData[]}
	 */
	findSpellsBySchoolAndTier(schools, maxTier, includeUtility = false) {
		const normalizedSchools = new Set(
			schools.filter((s) => s !== 'utility').map(normalizeString),
		);

		const results = [];
		for (const spell of this.#spellIndex.values()) {
			if (spell.isUtility && !includeUtility) continue;
			if (normalizedSchools.has(spell._normalizedSchool) && spell.tier <= maxTier) {
				results.push(spell);
			}
		}

		results.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
		return results;
	}

	/**
	 * Count spells matching the given schools and max tier (without allocating a results array).
	 * @param {string[]} schools - Spell school identifiers (real schools only, not "utility")
	 * @param {number} maxTier - Maximum spell tier (inclusive)
	 * @param {boolean} [includeUtility=false] - Whether to include utility-flagged spells
	 * @returns {number}
	 */
	countSpellsBySchoolAndTier(schools, maxTier, includeUtility = false) {
		const normalizedSchools = new Set(
			schools.filter((s) => s !== 'utility').map(normalizeString),
		);
		let count = 0;

		for (const spell of this.#spellIndex.values()) {
			if (spell.isUtility && !includeUtility) continue;
			if (normalizedSchools.has(spell._normalizedSchool) && spell.tier <= maxTier) {
				count++;
			}
		}

		return count;
	}

	/**
	 * Find equipment items by type.
	 * @param {string[]} objectTypes - e.g. ["weapon", "armor", "shield"]
	 * @returns {ItemData[]}
	 */
	findEquipmentByType(objectTypes) {
		const normalizedTypes = new Set(objectTypes.map(normalizeString));
		const results = [];

		for (const item of this.#itemIndex.values()) {
			if (normalizedTypes.has(item._normalizedType)) {
				results.push(item);
			}
		}

		results.sort((a, b) => a.name.localeCompare(b.name));
		return results;
	}

	/**
	 * Get the full document from a UUID.
	 * @param {string} uuid
	 * @returns {Promise<Item|null>}
	 */
	async getFullDocument(uuid) {
		try {
			return await fromUuid(uuid);
		} catch (e) {
			console.error(`${LOG_PREFIX} Failed to resolve UUID: ${uuid}`, e);
			return null;
		}
	}

	/* ---------------------------------------- */
	/*  Static Extraction Helpers               */
	/* ---------------------------------------- */

	/**
	 * Extract the primary weapon attribute from an activation formula.
	 * @param {object|undefined} activation
	 * @returns {'strength'|'dexterity'|null}
	 */
	static #extractWeaponAttr(activation) {
		const formula = activation?.effects?.[0]?.formula ?? '';
		if (formula.includes('@strength')) return 'strength';
		if (formula.includes('@dexterity')) return 'dexterity';
		return null;
	}

	/**
	 * Extract the armor type from an HTML description string.
	 * @param {string} descHtml
	 * @returns {string|null}
	 */
	static #extractArmorType(descHtml) {
		const match = descHtml.match(/<strong>Type:<\/strong>\s*(\w+)/i);
		return match ? match[1].toLowerCase() : null;
	}

	/**
	 * Check if a collection (Array or Set) contains a value.
	 * @param {Array|Set|undefined} collection
	 * @param {string} value
	 * @returns {boolean}
	 */
	static #hasProperty(collection, value) {
		if (Array.isArray(collection)) return collection.includes(value);
		if (collection instanceof Set) return collection.has(value);
		return false;
	}

	/**
	 * Extract a displayable description string from Nimble's various
	 * description formats (string, spell object, item object, FoundryVTT standard).
	 * @param {string|object|undefined} desc
	 * @returns {string}
	 */
	static #extractDescription(desc) {
		if (!desc) return '';
		if (typeof desc === 'string') return desc;
		if (typeof desc === 'object') {
			return String(desc.baseEffect ?? desc.public ?? desc.value ?? '');
		}
		return '';
	}
}

export { CompendiumBrowser };
