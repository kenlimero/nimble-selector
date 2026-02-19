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
	 * Resolve features across a range of levels (inclusive).
	 * @param {string} classIdentifier
	 * @param {number} fromLevel
	 * @param {number} toLevel
	 * @param {string|null} subclassIdentifier
	 * @returns {Array<{uuid: string|null, name: string, img: string, level: number, matched: boolean, selectableGroup: string|null, selectableGroupId: string|null}>}
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
			// Expand selectable feature groups into their individual options
			const expandedEntries = [];
			for (const name of featureNames) {
				let options = this.#dataProvider.getSelectableOptions(classIdentifier, name);
				let groupLabel = name;
				let groupId = name;

				// Features with numeric suffix like (2) may refer to a selectable group
				if (!options) {
					const baseName = name.replace(/\s*\(\d+\)$/, '');
					if (baseName !== name) {
						options = this.#dataProvider.getSelectableOptions(classIdentifier, baseName);
						if (options) groupId = baseName;
					}
				}

				if (options) {
					for (const optionName of options) {
						expandedEntries.push({ name: optionName, selectableGroup: groupLabel, selectableGroupId: groupId });
					}
				} else {
					expandedEntries.push({ name, selectableGroup: null, selectableGroupId: null });
				}
			}

			const nameStrings = expandedEntries.map((e) => e.name);
			const matches = this.#compendiumBrowser.findFeaturesByName(nameStrings, classIdentifier);
			for (let i = 0; i < matches.length; i++) {
				results.push({
					...matches[i],
					level,
					selectableGroup: expandedEntries[i].selectableGroup,
					selectableGroupId: expandedEntries[i].selectableGroupId,
				});
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
