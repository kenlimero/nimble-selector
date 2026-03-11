import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';
import { buildOwnedItemKeys, slugToLabel, normalizeString } from '../utils/constants.mjs';

/**
 * @typedef {object} ResolvedFeature
 * @property {string|null} uuid
 * @property {string} name
 * @property {string} img
 * @property {number|null} level
 * @property {boolean} matched
 * @property {string|null} selectableGroup - Human-readable group label
 * @property {string|null} selectableGroupId - Kebab-case group identifier
 * @property {string} description
 */

/**
 * Resolves class features for a given class and level range by querying
 * the compendium browser directly (features carry their own class, group,
 * level and subclass metadata).
 */
class ClassFeatureResolver {
	#compendiumBrowser;

	constructor() {
		this.#compendiumBrowser = CompendiumBrowser.instance;
	}

	/**
	 * Resolve features across a range of levels (inclusive).
	 * @param {string} classIdentifier
	 * @param {number} fromLevel
	 * @param {number} toLevel
	 * @param {string|null} [subclassIdentifier=null]
	 * @returns {ResolvedFeature[]}
	 */
	resolveRange(classIdentifier, fromLevel, toLevel, subclassIdentifier = null) {
		const { progression, selectableGroups } = this.#compendiumBrowser.getClassFeatures(
			classIdentifier,
			fromLevel,
			toLevel,
			subclassIdentifier,
		);

		/** @type {ResolvedFeature[]} */
		const results = [];

		// Add progression / subclass features (already expanded per level)
		for (const f of progression) {
			results.push({
				uuid: f.uuid,
				name: f.name,
				img: f.img,
				level: f.level,
				matched: true,
				selectableGroup: null,
				selectableGroupId: null,
				description: f.description,
			});
		}

		// Add selectable group features (once per feature, not duplicated per level)
		for (const [groupId, features] of selectableGroups) {
			const groupLabel = slugToLabel(groupId);
			for (const f of features) {
				results.push({
					uuid: f.uuid,
					name: f.name,
					img: f.img,
					level: null,
					matched: true,
					selectableGroup: groupLabel,
					selectableGroupId: groupId,
					description: f.description,
				});
			}
		}

		return results;
	}

	/**
	 * Annotate features with ownership status.
	 * @param {Actor} actor
	 * @param {ResolvedFeature[]} features
	 * @returns {Array<ResolvedFeature & {alreadyOwned: boolean}>}
	 */
	markOwnedFeatures(actor, features) {
		const ownedKeys = buildOwnedItemKeys(actor, 'feature');

		return features.map((f) => ({
			...f,
			alreadyOwned:
				ownedKeys.has(normalizeString(f.name)) ||
				(f.uuid != null && ownedKeys.has(f.uuid)),
		}));
	}
}

export { ClassFeatureResolver };
