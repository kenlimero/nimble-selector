import { LOG_PREFIX, normalizeString } from '../utils/constants.mjs';
import { CompendiumBrowser } from './CompendiumBrowser.mjs';

/** @type {Set<string>} objectSizeType values that support quantity stacking. */
const STACKABLE_SIZE_TYPES = new Set(['stackable', 'smallSized']);

/**
 * Grants items from compendium packs to an actor.
 * Follows the same pattern as the Nimble system's ItemGrantRule:
 * resolve UUID → clone → set compendiumSource → createEmbeddedDocuments.
 *
 * For stackable / smallSized items that the actor already owns,
 * the existing item's quantity is incremented instead of creating a duplicate.
 */
class ItemGranter {
	#compendiumBrowser;

	constructor() {
		this.#compendiumBrowser = CompendiumBrowser.instance;
	}

	/**
	 * Grant multiple items to an actor by UUID.
	 * Stackable items already owned get their quantity incremented;
	 * all other items are created as new embedded documents.
	 * @param {Actor} actor - The target actor
	 * @param {string[]} uuids - Array of compendium UUIDs
	 * @returns {Promise<Item[]>} The created embedded items (does not include stacked ones)
	 */
	async grantItemsByUuid(actor, uuids) {
		if (!uuids.length) return [];

		const prepared = await Promise.all(uuids.map((uuid) => this.#prepareItemFromUuid(uuid)));
		const itemDataArray = prepared.filter(Boolean);

		if (!itemDataArray.length) return [];

		// Separate items that should be stacked from those that need creation
		const toCreate = [];
		const stackUpdates = [];

		for (const itemData of itemDataArray) {
			const existing = this.#findStackTarget(actor, itemData);
			if (existing) {
				stackUpdates.push({ item: existing, qty: existing.system.quantity + 1 });
			} else {
				toCreate.push(itemData);
			}
		}

		// Apply quantity increments for stacked items
		for (const { item, qty } of stackUpdates) {
			try {
				await item.update({ 'system.quantity': qty });
			} catch (err) {
				console.error(`${LOG_PREFIX} Failed to update quantity for ${item.name}:`, err);
			}
		}

		// Create genuinely new items
		if (!toCreate.length) return [];

		try {
			return await actor.createEmbeddedDocuments('Item', toCreate, { keepId: true });
		} catch (err) {
			console.error(`${LOG_PREFIX} Failed to grant items to ${actor.name}:`, err);
			return [];
		}
	}

	/**
	 * Find an existing item on the actor that should be stacked with the new item.
	 * Mirrors the Nimble system's _preCreate logic: only stackable/smallSized
	 * object items are eligible, matched by name.
	 * @param {Actor} actor
	 * @param {object} itemData - Prepared item data
	 * @returns {Item|null} The existing item to stack onto, or null
	 */
	#findStackTarget(actor, itemData) {
		if (itemData.type !== 'object') return null;
		if (!STACKABLE_SIZE_TYPES.has(itemData.system?.objectSizeType)) return null;

		const newName = normalizeString(itemData.name);

		for (const existing of actor.items) {
			if (
				existing.type === 'object' &&
				STACKABLE_SIZE_TYPES.has(existing.system?.objectSizeType) &&
				normalizeString(existing.name) === newName
			) {
				return existing;
			}
		}
		return null;
	}

	/**
	 * Resolve a UUID and prepare item data for embedding.
	 * @param {string} uuid
	 * @returns {Promise<object|null>} Item data ready for createEmbeddedDocuments, or null
	 */
	async #prepareItemFromUuid(uuid) {
		const sourceItem = await this.#compendiumBrowser.getFullDocument(uuid);
		if (!sourceItem) {
			console.warn(`${LOG_PREFIX} Could not resolve item: ${uuid}`);
			return null;
		}

		const itemData = sourceItem.toObject();
		itemData._id = foundry.utils.randomID();
		itemData._stats = itemData._stats ?? {};
		itemData._stats.compendiumSource = uuid;

		return itemData;
	}
}

export { ItemGranter };
