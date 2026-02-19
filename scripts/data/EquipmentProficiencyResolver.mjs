import { DataProvider } from './DataProvider.mjs';
import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';

/**
 * Resolves available equipment for a character based on their
 * class proficiencies.
 */
class EquipmentProficiencyResolver {
	#dataProvider;
	#compendiumBrowser;
	#weaponCategoryIndex = null;

	constructor() {
		this.#dataProvider = DataProvider.instance;
		this.#compendiumBrowser = CompendiumBrowser.instance;
	}

	/**
	 * Get the proficiency data for a class.
	 * @param {string} classIdentifier
	 * @returns {{ armor: string[], weapons: string[] }}
	 */
	resolve(classIdentifier) {
		return this.#dataProvider.getEquipmentProficiencies(classIdentifier);
	}

	/**
	 * Find all equipment items from the compendium that match the class proficiencies.
	 * @param {string} classIdentifier
	 * @returns {Array<{uuid: string, name: string, img: string, objectType: string}>}
	 */
	findAvailableEquipment(classIdentifier) {
		const proficiencies = this.resolve(classIdentifier);
		const objectTypes = new Set();

		if (proficiencies.armor.length > 0) objectTypes.add('armor');
		if (proficiencies.armor.includes('shields') || proficiencies.armor.includes('all')) {
			objectTypes.add('shield');
		}
		if (proficiencies.weapons.length > 0) objectTypes.add('weapon');

		// Consumables and misc items are available to all classes
		objectTypes.add('consumable');
		objectTypes.add('misc');

		return this.#compendiumBrowser.findEquipmentByType([...objectTypes]);
	}

	/**
	 * Check if an item matches the class proficiencies.
	 * Consumables and misc are always allowed.
	 * @param {object} item - Indexed item from CompendiumBrowser
	 * @param {{ armor: string[], weapons: string[] }} proficiencies
	 * @returns {boolean}
	 */
	matchesProficiency(item, proficiencies) {
		const type = item.objectType;

		if (type === 'consumable' || type === 'misc') return true;

		if (type === 'shield') {
			return proficiencies.armor.includes('shields') || proficiencies.armor.includes('all');
		}

		if (type === 'armor') {
			if (proficiencies.armor.includes('all')) return true;
			return item.armorType != null && proficiencies.armor.includes(item.armorType);
		}

		if (type === 'weapon') {
			return this.#matchesWeaponProficiency(item, proficiencies.weapons);
		}

		return true;
	}

	#matchesWeaponProficiency(item, weaponTags) {
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
