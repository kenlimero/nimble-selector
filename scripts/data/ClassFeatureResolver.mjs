import { CompendiumBrowser } from '../core/CompendiumBrowser.mjs';
import { buildOwnedItemKeys } from '../utils/constants.mjs';

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
	 * @param {string|null} subclassIdentifier
	 * @returns {Array<{uuid: string|null, name: string, img: string, level: number, matched: boolean, selectableGroup: string|null, selectableGroupId: string|null}>}
	 */
	resolveRange(classIdentifier, fromLevel, toLevel, subclassIdentifier = null) {
		const { progression, selectableGroups } = this.#compendiumBrowser.getClassFeatures(
			classIdentifier,
			fromLevel,
			toLevel,
			subclassIdentifier,
		);

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

		// Add selectable group features, repeated at each applicable level in range
		for (const [groupId, features] of selectableGroups) {
			const groupLabel = ClassFeatureResolver.#slugToLabel(groupId);

			// Collect all distinct levels in range across all features of this group
			const groupLevels = new Set();
			for (const f of features) {
				for (const l of f.gainedAtLevels) {
					if (l >= fromLevel && l <= toLevel) groupLevels.add(l);
				}
			}

			// For each applicable level, include all options from this group
			for (const level of groupLevels) {
				for (const f of features) {
					results.push({
						uuid: f.uuid,
						name: f.name,
						img: f.img,
						level,
						matched: true,
						selectableGroup: groupLabel,
						selectableGroupId: groupId,
						description: f.description,
					});
				}
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
		const ownedKeys = buildOwnedItemKeys(actor, 'feature');

		return features.map((f) => ({
			...f,
			alreadyOwned:
				ownedKeys.has(f.name.toLowerCase().trim()) ||
				(f.uuid && ownedKeys.has(f.uuid)),
		}));
	}

	/**
	 * Convert a kebab-case group slug to a human-readable label.
	 * @param {string} slug - e.g. "savage-arsenal"
	 * @returns {string} e.g. "Savage Arsenal"
	 */
	static #slugToLabel(slug) {
		return slug
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}
}

export { ClassFeatureResolver };
