import { PACK_NAMES } from '../utils/constants.mjs';

/**
 * Indexes and queries the Nimble system's compendium packs.
 * Provides search methods for features, spells, and equipment items.
 */
class CompendiumBrowser {
	static #instance = null;

	#featureIndex = new Map();
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
			fields: ['system.class', 'system.featureType', 'system.group'],
		});

		for (const entry of index) {
			const key = this.#normalizeString(entry.name);
			if (!this.#featureIndex.has(key)) {
				this.#featureIndex.set(key, []);
			}
			this.#featureIndex.get(key).push({
				uuid: entry.uuid,
				name: entry.name,
				img: entry.img,
				class: entry.system?.class ?? '',
				featureType: entry.system?.featureType ?? '',
				group: entry.system?.group ?? '',
			});
		}
	}

	async #indexSpells() {
		const pack = game.packs.get(PACK_NAMES.spells);
		if (!pack) {
			console.warn(`nimble-selector | Pack ${PACK_NAMES.spells} not found`);
			return;
		}

		const index = await pack.getIndex({
			fields: ['system.school', 'system.tier', 'system.properties.selected'],
		});

		for (const entry of index) {
			const props = entry.system?.properties?.selected;
			const isUtility = Array.isArray(props)
				? props.includes('utilitySpell')
				: (props instanceof Set ? props.has('utilitySpell') : false);

			this.#spellIndex.set(entry.uuid, {
				uuid: entry.uuid,
				name: entry.name,
				img: entry.img,
				school: entry.system?.school ?? '',
				tier: entry.system?.tier ?? 0,
				isUtility,
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
			fields: ['system.objectType', 'system.properties'],
		});

		for (const entry of index) {
			this.#itemIndex.set(entry.uuid, {
				uuid: entry.uuid,
				name: entry.name,
				img: entry.img,
				objectType: entry.system?.objectType ?? '',
				properties: entry.system?.properties ?? {},
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

		for (const name of featureNames) {
			const key = this.#normalizeString(name);
			const candidates = this.#featureIndex.get(key) ?? [];

			// Prefer exact class match
			let match = candidates.find(
				(c) => this.#normalizeString(c.class) === this.#normalizeString(classIdentifier),
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
			});
		}

		return results;
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

			const normalizedSchool = this.#normalizeString(spell.school);
			if (normalizedSchools.has(normalizedSchool) && spell.tier <= maxTier) {
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
	 * Find equipment items by type.
	 * @param {string[]} objectTypes - e.g. ["weapon", "armor", "shield"]
	 * @returns {Array<{uuid: string, name: string, img: string, objectType: string}>}
	 */
	findEquipmentByType(objectTypes) {
		const normalizedTypes = new Set(objectTypes.map((t) => this.#normalizeString(t)));
		const results = [];

		for (const item of this.#itemIndex.values()) {
			if (normalizedTypes.has(this.#normalizeString(item.objectType))) {
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
}

export { CompendiumBrowser };
