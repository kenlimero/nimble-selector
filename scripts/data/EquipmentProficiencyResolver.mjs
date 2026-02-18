import { DataProvider } from './DataProvider.mjs';
import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';

/**
 * Resolves available equipment for a character based on their
 * class proficiencies.
 */
class EquipmentProficiencyResolver {
	#dataProvider;
	#compendiumBrowser;

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
		if (proficiencies.armor.includes('shield')) objectTypes.add('shield');
		if (proficiencies.weapons.length > 0) objectTypes.add('weapon');

		return this.#compendiumBrowser.findEquipmentByType([...objectTypes]);
	}

}

export { EquipmentProficiencyResolver };
