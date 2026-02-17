import { DataProvider } from './DataProvider.mjs';
import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';

/**
 * Resolves class features for a given class and level by cross-referencing
 * the JSON data (class+level → feature names) with the compendium browser
 * (feature names → UUIDs).
 */
class ClassFeatureResolver {
	#dataProvider;
	#compendiumBrowser;

	constructor() {
		this.#dataProvider = DataProvider.instance;
		this.#compendiumBrowser = CompendiumBrowser.instance;
	}

	/**
	 * Resolve features for a specific level.
	 * @param {string} classIdentifier
	 * @param {number} level
	 * @param {string|null} subclassIdentifier
	 * @returns {Array<{uuid: string|null, name: string, img: string, level: number, matched: boolean}>}
	 */
	resolve(classIdentifier, level, subclassIdentifier = null) {
		const featureNames = this.#dataProvider.getFeaturesForLevel(
			classIdentifier,
			level,
			subclassIdentifier,
		);

		const matches = this.#compendiumBrowser.findFeaturesByName(featureNames, classIdentifier);
		return matches.map((m) => ({ ...m, level }));
	}

	/**
	 * Resolve features across a range of levels (inclusive).
	 * @param {string} classIdentifier
	 * @param {number} fromLevel
	 * @param {number} toLevel
	 * @param {string|null} subclassIdentifier
	 * @returns {Array<{uuid: string|null, name: string, img: string, level: number, matched: boolean}>}
	 */
	resolveRange(classIdentifier, fromLevel, toLevel, subclassIdentifier = null) {
		const featuresByLevel = this.#dataProvider.getFeaturesForRange(
			classIdentifier,
			fromLevel,
			toLevel,
			subclassIdentifier,
		);

		const results = [];
		for (const [level, featureNames] of featuresByLevel) {
			const matches = this.#compendiumBrowser.findFeaturesByName(featureNames, classIdentifier);
			for (const match of matches) {
				results.push({ ...match, level });
			}
		}

		return results;
	}

	/**
	 * Filter out features the actor already owns.
	 * @param {Actor} actor
	 * @param {Array<{uuid: string|null, name: string}>} features
	 * @returns {Array<{uuid: string|null, name: string, alreadyOwned: boolean}>}
	 */
	markOwnedFeatures(actor, features) {
		const ownedNames = new Set();
		const ownedSources = new Set();

		for (const item of actor.items) {
			if (item.type === 'feature') {
				ownedNames.add(item.name.toLowerCase().trim());
				const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
				if (source) ownedSources.add(source);
			}
		}

		return features.map((f) => ({
			...f,
			alreadyOwned:
				ownedNames.has(f.name.toLowerCase().trim()) ||
				(f.uuid && ownedSources.has(f.uuid)),
		}));
	}
}

export { ClassFeatureResolver };
