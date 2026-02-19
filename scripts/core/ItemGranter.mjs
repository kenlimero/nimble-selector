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

		const prepared = await Promise.all(uuids.map((uuid) => this.#prepareItemFromUuid(uuid)));
		const itemDataArray = prepared.filter(Boolean);

		if (!itemDataArray.length) return [];

		return actor.createEmbeddedDocuments('Item', itemDataArray, { keepId: true });
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
