/** @module constants */

export const MODULE_ID = 'nimble-selector';

/** @type {string} Prefix for console log messages. */
export const LOG_PREFIX = `${MODULE_ID} |`;

export const PACK_NAMES = {
	classFeatures: 'nimble.nimble-class-features',
	spells: 'nimble.nimble-spells',
	items: 'nimble.nimble-items',
	classes: 'nimble.nimble-classes',
	subclasses: 'nimble.nimble-subclasses',
};

export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates`;

export const DATA_PATH = `modules/${MODULE_ID}/data`;

/** @type {Record<string, string>} FontAwesome icon class per spell school. */
export const SCHOOL_ICONS = {
	fire: 'fa-solid fa-fire-flame-curved',
	ice: 'fa-solid fa-snowflake',
	lightning: 'fa-solid fa-bolt-lightning',
	necrotic: 'fa-solid fa-skull',
	radiant: 'fa-solid fa-sun',
	wind: 'fa-solid fa-wind',
	secret: 'fa-solid fa-eye-slash',
	utility: 'fa-solid fa-toolbox',
};

/**
 * Capitalize the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
	return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

/**
 * Normalize a string for case-insensitive, whitespace-trimmed comparison.
 * Also normalizes fancy quotes to straight apostrophes.
 * @param {string} str
 * @returns {string}
 */
export function normalizeString(str) {
	return String(str ?? '').toLowerCase().trim().replace(/['']/g, "'");
}

/**
 * Convert a kebab-case slug to a human-readable Title Case label.
 * @param {string} slug - e.g. "savage-arsenal"
 * @returns {string} e.g. "Savage Arsenal"
 */
export function slugToLabel(slug) {
	return slug
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * Build a Set of keys identifying items already owned by an actor.
 * Includes both normalized names and compendium source UUIDs.
 * @param {Actor} actor
 * @param {string} itemType - e.g. 'feature', 'spell'
 * @returns {Set<string>}
 */
export function buildOwnedItemKeys(actor, itemType) {
	const keys = new Set();
	for (const item of actor.items) {
		if (item.type === itemType) {
			keys.add(normalizeString(item.name));
			const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
			if (source) keys.add(source);
		}
	}
	return keys;
}

/**
 * Push a value into a Map of arrays, creating the array if needed.
 * @template K, V
 * @param {Map<K, V[]>} map
 * @param {K} key
 * @param {V} value
 */
export function pushToMapArray(map, key, value) {
	const arr = map.get(key);
	if (arr) {
		arr.push(value);
	} else {
		map.set(key, [value]);
	}
}
