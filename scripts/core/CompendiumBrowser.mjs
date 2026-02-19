import { PACK_NAMES } from '../utils/constants.mjs';

/**
 * Indexes and queries the Nimble system's compendium packs.
 * Provides search methods for features, spells, and equipment items.
 */
class CompendiumBrowser {
	static #instance = null;

	#featureIndex = new Map();
	#featureByClassIndex = new Map();
	#spellIndex = new Map();
	#itemIndex = new Map();
	#initialized = false;

	constructor() {
		if (CompendiumBrowser.#instance) {
			throw new Error('CompendiumBrowser is a singleton. Use CompendiumBrowser.instance instead.');
		}
	}

	static get instance() {
		if (!CompendiumBrowser.#instance) {
			CompendiumBrowser.#instance = new CompendiumBrowser();
		}
		return CompendiumBrowser.#instance;
	}

	get initialized() {
		return this.#initialized;
	}

	async initialize() {
		if (this.#initialized) return;

		await Promise.all([
			this.#indexFeatures(),
			this.#indexSpells(),
			this.#indexItems(),
		]);

		this.#initialized = true;
	}

	async #indexFeatures() {
		const pack = game.packs.get(PACK_NAMES.classFeatures);
		if (!pack) {
			console.warn(`nimble-selector | Pack ${PACK_NAMES.classFeatures} not found`);
			return;
		}

		const index = await pack.getIndex({
			fields: ['system.class', 'system.featureType', 'system.group', 'system.description', 'system.gainedAtLevel', 'system.gainedAtLevels', 'system.subclass'],
		});

		// Build a folder ID → class name map so features with empty class
		// (e.g. savage-arsenal) can be resolved via their compendium folder.
		const folderClassMap = this.#buildFolderClassMap(pack);

		for (const entry of index) {
			let cls = entry.system?.class ?? '';
			if (!cls && entry.folder) {
				cls = folderClassMap.get(entry.folder) ?? '';
			}

			const normalizedClass = this.#normalizeString(cls);

			// gainedAtLevels with gainedAtLevel fallback
			let levels = entry.system?.gainedAtLevels;
			if (!Array.isArray(levels) || levels.length === 0) {
				const single = entry.system?.gainedAtLevel;
				levels = single != null ? [single] : [];
			}

			const featureData = {
				uuid: entry.uuid,
				name: entry.name,
				img: entry.img,
				class: cls,
				_normalizedClass: normalizedClass,
				featureType: entry.system?.featureType ?? '',
				group: entry.system?.group ?? '',
				description: this.#extractDescription(entry.system?.description),
				gainedAtLevels: levels,
				subclass: entry.system?.subclass ?? false,
			};

			// Name-based index
			const key = this.#normalizeString(entry.name);
			if (!this.#featureIndex.has(key)) {
				this.#featureIndex.set(key, []);
			}
			this.#featureIndex.get(key).push(featureData);

			// Class-based index
			if (!this.#featureByClassIndex.has(normalizedClass)) {
				this.#featureByClassIndex.set(normalizedClass, []);
			}
			this.#featureByClassIndex.get(normalizedClass).push(featureData);
		}
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
				rootNames.set(folder._id, this.#normalizeString(folder.name));
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

	async #indexSpells() {
		const pack = game.packs.get(PACK_NAMES.spells);
		if (!pack) {
			console.warn(`nimble-selector | Pack ${PACK_NAMES.spells} not found`);
			return;
		}

		// Use getDocuments() instead of getIndex() to reliably access
		// nested fields like system.properties.selected (getIndex may
		// return a cached index missing these fields).
		const documents = await pack.getDocuments();

		for (const doc of documents) {
			const props = doc.system?.properties?.selected;
			const isUtility = Array.isArray(props) && props.includes('utilitySpell');

			const school = doc.system?.school ?? '';
			this.#spellIndex.set(doc.uuid, {
				uuid: doc.uuid,
				name: doc.name,
				_normalizedName: this.#normalizeString(doc.name),
				img: doc.img,
				school,
				_normalizedSchool: this.#normalizeString(school),
				tier: doc.system?.tier ?? 0,
				isUtility,
				description: this.#extractDescription(doc.system?.description),
			});
		}
	}

	async #indexItems() {
		const pack = game.packs.get(PACK_NAMES.items);
		if (!pack) {
			console.warn(`nimble-selector | Pack ${PACK_NAMES.items} not found`);
			return;
		}

		const index = await pack.getIndex({
			fields: ['system.objectType', 'system.properties', 'system.description'],
		});

		for (const entry of index) {
			const objectType = entry.system?.objectType ?? '';
			this.#itemIndex.set(entry.uuid, {
				uuid: entry.uuid,
				name: entry.name,
				img: entry.img,
				objectType,
				_normalizedType: this.#normalizeString(objectType),
				properties: entry.system?.properties ?? {},
				description: this.#extractDescription(entry.system?.description),
			});
		}
	}

	/**
	 * Find compendium features matching the given names and class.
	 * @param {string[]} featureNames - Feature names to search for
	 * @param {string} classIdentifier - Class identifier to filter by
	 * @returns {Array<{uuid: string, name: string, img: string, matched: boolean}>}
	 */
	findFeaturesByName(featureNames, classIdentifier) {
		const results = [];
		const normalizedClass = this.#normalizeString(classIdentifier);

		for (const name of featureNames) {
			const key = this.#normalizeString(name);
			let candidates = this.#featureIndex.get(key) ?? [];

			// If no match and name has a numeric suffix like (2), (3), try the base name
			if (candidates.length === 0) {
				const baseKey = this.#stripNumericSuffix(key);
				if (baseKey !== key) {
					candidates = this.#featureIndex.get(baseKey) ?? [];
				}
			}

			// Prefer exact class match
			let match = candidates.find(
				(c) => c._normalizedClass === normalizedClass,
			);

			// Fall back to any match
			if (!match && candidates.length > 0) {
				match = candidates[0];
			}

			results.push({
				uuid: match?.uuid ?? null,
				name,
				img: match?.img ?? 'icons/svg/mystery-man.svg',
				matched: !!match,
				description: match?.description ?? '',
			});
		}

		return results;
	}

	/**
	 * Get class features organized by progression and selectable groups
	 * for a given class and level range.
	 * @param {string} classIdentifier - e.g. "berserker"
	 * @param {number} fromLevel - Start of level range (inclusive)
	 * @param {number} toLevel - End of level range (inclusive)
	 * @param {string|null} subclassIdentifier - e.g. "path-of-the-mountainheart"
	 * @returns {{ progression: Array<{uuid, name, img, description, level, group}>, selectableGroups: Map<string, Array<{uuid, name, img, description, gainedAtLevels}>> }}
	 */
	getClassFeatures(classIdentifier, fromLevel, toLevel, subclassIdentifier = null) {
		const normalizedClass = this.#normalizeString(classIdentifier);
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

			// Skip non-subclass features from subclass groups
			if (!isSubclass && !isProgression) {
				// This is a selectable group feature
				if (!selectableGroups.has(f.group)) {
					selectableGroups.set(f.group, []);
				}
				selectableGroups.get(f.group).push(f);
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
	 * Utility spells (those with the utilitySpell property) are only included
	 * when includeUtility is true — this gates them behind the level requirement.
	 * @param {string[]} schools - Spell school identifiers (real schools only, not "utility")
	 * @param {number} maxTier - Maximum spell tier (inclusive)
	 * @param {boolean} [includeUtility=false] - Whether to include utility-flagged spells
	 * @returns {Array<{uuid: string, name: string, img: string, school: string, tier: number, isUtility: boolean}>}
	 */
	findSpellsBySchoolAndTier(schools, maxTier, includeUtility = false) {
		const normalizedSchools = new Set(
			schools.filter((s) => s !== 'utility').map((s) => this.#normalizeString(s)),
		);
		const results = [];

		for (const spell of this.#spellIndex.values()) {
			// Skip utility spells unless character has utility access
			if (spell.isUtility && !includeUtility) continue;

			if (normalizedSchools.has(spell._normalizedSchool) && spell.tier <= maxTier) {
				results.push(spell);
			}
		}

		results.sort((a, b) => {
			if (a.tier !== b.tier) return a.tier - b.tier;
			return a.name.localeCompare(b.name);
		});

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
			schools.filter((s) => s !== 'utility').map((s) => this.#normalizeString(s)),
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
	 * @returns {Array<{uuid: string, name: string, img: string, objectType: string}>}
	 */
	findEquipmentByType(objectTypes) {
		const normalizedTypes = new Set(objectTypes.map((t) => this.#normalizeString(t)));
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
			console.error(`nimble-selector | Failed to resolve UUID: ${uuid}`, e);
			return null;
		}
	}

	#normalizeString(str) {
		return String(str ?? '').toLowerCase().trim().replace(/['']/g, "'");
	}

	#stripNumericSuffix(str) {
		return str.replace(/\s*\(\d+\)$/, '').trim();
	}

	#extractDescription(desc) {
		if (!desc) return '';
		if (typeof desc === 'string') return desc;
		if (typeof desc === 'object') {
			// Nimble spells: { baseEffect, higherLevelEffect }
			if (desc.baseEffect) return String(desc.baseEffect);
			// Nimble objects: { public, unidentified, secret }
			if (desc.public) return String(desc.public);
			// Standard FoundryVTT: { value }
			if (desc.value) return String(desc.value);
		}
		return '';
	}
}

export { CompendiumBrowser };
