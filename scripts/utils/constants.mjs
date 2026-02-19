export const MODULE_ID = 'nimble-selector';

export const PACK_NAMES = {
	classFeatures: 'nimble.nimble-class-features',
	spells: 'nimble.nimble-spells',
	items: 'nimble.nimble-items',
	classes: 'nimble.nimble-classes',
	subclasses: 'nimble.nimble-subclasses',
};

export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates`;

export const DATA_PATH = `modules/${MODULE_ID}/data`;

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
			keys.add(item.name.toLowerCase().trim());
			const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
			if (source) keys.add(source);
		}
	}
	return keys;
}
