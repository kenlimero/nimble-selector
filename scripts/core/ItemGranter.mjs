import { CompendiumBrowser } from './CompendiumBrowser.mjs';

/**
 * Grants items from compendium packs to an actor.
 * Follows the same pattern as the Nimble system's ItemGrantRule:
 * resolve UUID → clone → set compendiumSource → createEmbeddedDocuments.
 */
class ItemGranter {
	#compendiumBrowser;

	constructor() {
		this.#compendiumBrowser = CompendiumBrowser.instance;
	}

	/**
	 * Grant multiple items to an actor by UUID.
	 * @param {Actor} actor - The target actor
	 * @param {string[]} uuids - Array of compendium UUIDs
	 * @returns {Promise<Item[]>} The created embedded items
	 */
	async grantItemsByUuid(actor, uuids) {
		if (!uuids.length) return [];

		const itemDataArray = [];

		for (const uuid of uuids) {
			const itemData = await this.#prepareItemFromUuid(uuid);
			if (itemData) {
				itemDataArray.push(itemData);
			}
		}

		if (!itemDataArray.length) return [];

		return actor.createEmbeddedDocuments('Item', itemDataArray, { keepId: true });
	}

	/**
	 * Grant a single item to an actor by UUID.
	 * @param {Actor} actor
	 * @param {string} uuid
	 * @returns {Promise<Item|null>}
	 */
	async grantItemByUuid(actor, uuid) {
		const results = await this.grantItemsByUuid(actor, [uuid]);
		return results?.[0] ?? null;
	}

	/**
	 * Check if an actor already has an item from a given compendium source.
	 * @param {Actor} actor
	 * @param {string} uuid - Compendium source UUID
	 * @returns {boolean}
	 */
	actorHasItemFromSource(actor, uuid) {
		return actor.items.some((item) => {
			const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
			return source === uuid;
		});
	}

	async #prepareItemFromUuid(uuid) {
		const sourceItem = await this.#compendiumBrowser.getFullDocument(uuid);
		if (!sourceItem) {
			console.warn(`nimble-selector | Could not resolve item: ${uuid}`);
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
