import { DataProvider } from './DataProvider.mjs';
import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';

/**
 * @typedef {object} Proficiencies
 * @property {string[]} armor
 * @property {string[]} weapons
 */

/**
 * Resolves available equipment for a character based on their
 * class proficiencies.
 */
class EquipmentProficiencyResolver {
	/** @type {DataProvider} */
	#dataProvider;
	/** @type {CompendiumBrowser} */
	#compendiumBrowser;
	/** @type {Map<string, Set<string>>|null} Lazily built weapon category index. */
	#weaponCategoryIndex = null;
	/** @type {Map<string, import('../core/CompendiumBrowser.mjs').ItemData[]>} Cached equipment lists by class. */
	#equipmentCache = new Map();

	constructor() {
		this.#dataProvider = DataProvider.instance;
		this.#compendiumBrowser = CompendiumBrowser.instance;
	}

	/**
	 * Get the proficiency data for a class.
	 * @param {string} classIdentifier
	 * @returns {Proficiencies}
	 */
	resolve(classIdentifier) {
		return this.#dataProvider.getEquipmentProficiencies(classIdentifier);
	}

	/**
	 * Find all equipment items from the compendium that match the class proficiencies.
	 * Always includes consumables and misc items regardless of class.
	 * Results are cached per class identifier for the session lifetime.
	 * @param {string} classIdentifier
	 * @returns {import('../core/CompendiumBrowser.mjs').ItemData[]}
	 */
	findAvailableEquipment(classIdentifier) {
		const cached = this.#equipmentCache.get(classIdentifier);
		if (cached) return cached;

		const proficiencies = this.resolve(classIdentifier);
		const objectTypes = new Set(['consumable', 'misc']);

		if (proficiencies.armor.length > 0) objectTypes.add('armor');
		if (proficiencies.armor.includes('shields') || proficiencies.armor.includes('all')) {
			objectTypes.add('shield');
		}
		if (proficiencies.weapons.length > 0) objectTypes.add('weapon');

		const result = this.#compendiumBrowser.findEquipmentByType([...objectTypes]);
		this.#equipmentCache.set(classIdentifier, result);
		return result;
	}

	/**
	 * Check if an item matches the class proficiencies.
	 * Consumables and misc are always allowed.
	 * @param {import('../core/CompendiumBrowser.mjs').ItemData} item
	 * @param {Proficiencies} proficiencies
	 * @returns {boolean}
	 */
	matchesProficiency(item, proficiencies) {
		const { objectType } = item;

		if (objectType === 'consumable' || objectType === 'misc') return true;

		if (objectType === 'shield') {
			return proficiencies.armor.includes('shields') || proficiencies.armor.includes('all');
		}

		if (objectType === 'armor') {
			return proficiencies.armor.includes('all')
				|| (item.armorType != null && proficiencies.armor.includes(item.armorType));
		}

		if (objectType === 'weapon') {
			return this.#matchesWeaponProficiency(item, proficiencies.weapons);
		}

		return true;
	}

	/**
	 * Check if a weapon matches any of the given proficiency tags.
	 * Tags can be broad categories ("all-martial", "all-str") or
	 * specific named weapon groups from the category index.
	 * @param {import('../core/CompendiumBrowser.mjs').ItemData} item
	 * @param {string[]} weaponTags
	 * @returns {boolean}
	 */
	#matchesWeaponProficiency(item, weaponTags) {
		if (!weaponTags?.length) return false;
		for (const tag of weaponTags) {
			switch (tag) {
				case 'all-martial':
					return true;
				case 'str':
				case 'all-str':
					if (item.weaponAttr === 'strength') return true;
					break;
				case 'dex':
					if (item.weaponAttr === 'dexterity') return true;
					break;
				case 'melee':
					if (!item.isRanged) return true;
					break;
				default: {
					const categoryNames = this.#getWeaponCategoryIndex().get(tag);
					if (categoryNames?.has(item.name)) return true;
					break;
				}
			}
		}
		return false;
	}

	/**
	 * Lazily build and cache the weapon category index.
	 * @returns {Map<string, Set<string>>}
	 */
	#getWeaponCategoryIndex() {
		if (!this.#weaponCategoryIndex) {
			this.#weaponCategoryIndex = new Map();
			const categories = this.#dataProvider.getWeaponCategories();
			for (const [tag, names] of Object.entries(categories)) {
				this.#weaponCategoryIndex.set(tag, new Set(names));
			}
		}
		return this.#weaponCategoryIndex;
	}
}

export { EquipmentProficiencyResolver };
