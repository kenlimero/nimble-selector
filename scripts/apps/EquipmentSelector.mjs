import { MODULE_ID, TEMPLATE_PATH, LOG_PREFIX, capitalize } from '../utils/constants.mjs';
import { EquipmentProficiencyResolver } from '../data/EquipmentProficiencyResolver.mjs';
import { ItemGranter } from '../core/ItemGranter.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @type {Record<string, {label: string, icon: string}>} Equipment category display config. */
const CATEGORY_CONFIG = {
	armor: { label: 'Armor', icon: 'fa-solid fa-shield-halved' },
	shield: { label: 'Shields', icon: 'fa-solid fa-shield' },
	weapon: { label: 'Weapons', icon: 'fa-solid fa-sword' },
	consumable: { label: 'Consumables', icon: 'fa-solid fa-flask' },
	misc: { label: 'Misc', icon: 'fa-solid fa-bag-shopping' },
};

/** @type {Record<string, number>} Copper piece equivalents for each denomination. */
const DENOMINATION_TO_CP = { gp: 100, sp: 10, cp: 1 };

/**
 * Application for selecting and granting equipment to a character.
 * Filters equipment by category (weapons, armor, shields, etc.)
 * based on class proficiencies.
 */
class EquipmentSelector extends HandlebarsApplicationMixin(ApplicationV2) {
	/** @type {Actor} */
	#actor;
	/** @type {string} */
	#classIdentifier;
	/** @type {import('../core/CompendiumBrowser.mjs').ItemData[]} */
	#allEquipment = [];
	/** @type {Map<string, import('../core/CompendiumBrowser.mjs').ItemData>} UUID-keyed lookup. */
	#equipmentByUuid = new Map();
	/** @type {import('../data/EquipmentProficiencyResolver.mjs').Proficiencies} */
	#proficiencies = { armor: [], weapons: [] };
	/** @type {Set<string>} */
	#selectedUuids = new Set();
	/** @type {string} Active category tab filter (empty = show all). */
	#activeCategory = '';
	#showOnlyProficient = true;
	#payTheBill = false;
	#scrollTop = 0;
	#dataLoaded = false;
	#proficiencyResolver = new EquipmentProficiencyResolver();
	#granter = new ItemGranter();

	static DEFAULT_OPTIONS = {
		id: `${MODULE_ID}-equipment-selector`,
		classes: [MODULE_ID, 'nimble-selector'],
		window: {
			title: 'Equipment Selection',
			icon: 'fa-solid fa-shield-halved',
			resizable: true,
		},
		position: {
			width: 500,
			height: 'auto',
		},
		actions: {
			filterCategory: EquipmentSelector.#onFilterCategory,
			toggleEquipment: EquipmentSelector.#onToggleEquipment,
			toggleProficiencyFilter: EquipmentSelector.#onToggleProficiencyFilter,
			togglePayTheBill: EquipmentSelector.#onTogglePayTheBill,
			confirm: EquipmentSelector.#onConfirm,
			cancel: EquipmentSelector.#onCancel,
		},
	};

	static PARTS = {
		form: {
			template: `${TEMPLATE_PATH}/equipment-selector.hbs`,
		},
	};

	/**
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {object} [options={}]
	 */
	constructor(actor, classIdentifier, options = {}) {
		super(options);
		this.#actor = actor;
		this.#classIdentifier = classIdentifier;
	}

	/* ---------------------------------------- */
	/*  Currency Helpers                        */
	/* ---------------------------------------- */

	/**
	 * Load equipment data once (proficiencies, equipment list).
	 */
	#loadEquipmentData() {
		if (this.#dataLoaded) return;
		this.#proficiencies = this.#proficiencyResolver.resolve(this.#classIdentifier);
		this.#allEquipment = this.#proficiencyResolver.findAvailableEquipment(this.#classIdentifier);
		this.#equipmentByUuid = new Map(this.#allEquipment.map((e) => [e.uuid, e]));
		this.#dataLoaded = true;
	}

	/**
	 * Read the actor's current currency as { gp, sp, cp }.
	 * @returns {{gp: number, sp: number, cp: number}}
	 */
	#getActorWealth() {
		const currency = this.#actor.system?.currency ?? {};
		return {
			gp: currency.gp?.value ?? 0,
			sp: currency.sp?.value ?? 0,
			cp: currency.cp?.value ?? 0,
		};
	}

	/**
	 * Convert the actor's total wealth to copper pieces.
	 * @returns {number}
	 */
	#getActorWealthInCp() {
		const w = this.#getActorWealth();
		return w.gp * DENOMINATION_TO_CP.gp + w.sp * DENOMINATION_TO_CP.sp + w.cp;
	}

	/**
	 * Convert an item's price to copper pieces.
	 * @param {import('../core/CompendiumBrowser.mjs').ItemData} item
	 * @returns {number}
	 */
	#getItemPriceInCp(item) {
		const value = item.priceValue ?? 0;
		const denom = item.priceDenomination ?? 'gp';
		return value * (DENOMINATION_TO_CP[denom] ?? DENOMINATION_TO_CP.gp);
	}

	/**
	 * Format an item's price for display (e.g. "10 GP").
	 * @param {import('../core/CompendiumBrowser.mjs').ItemData} item
	 * @returns {string}
	 */
	#formatPrice(item) {
		const value = item.priceValue ?? 0;
		if (value === 0) return '';
		const denom = item.priceDenomination ?? 'gp';
		return `${value} ${denom.toUpperCase()}`;
	}

	/**
	 * Calculate total price in CP for all selected items.
	 * @returns {number}
	 */
	#getSelectionTotalCp() {
		let total = 0;
		for (const uuid of this.#selectedUuids) {
			const item = this.#equipmentByUuid.get(uuid);
			if (item) total += this.#getItemPriceInCp(item);
		}
		return total;
	}

	/**
	 * Convert a copper piece amount to { gp, sp, cp } coin breakdown.
	 * @param {number} totalCp
	 * @returns {{gp: number, sp: number, cp: number}}
	 */
	static #formatCpToCoins(totalCp) {
		const gp = Math.floor(totalCp / DENOMINATION_TO_CP.gp);
		const sp = Math.floor((totalCp % DENOMINATION_TO_CP.gp) / DENOMINATION_TO_CP.sp);
		const cp = totalCp % DENOMINATION_TO_CP.sp;
		return { gp, sp, cp };
	}

	/* ---------------------------------------- */
	/*  Context Preparation                     */
	/* ---------------------------------------- */

	/** @override */
	async _prepareContext() {
		this.#loadEquipmentData();

		let filteredEquipment = this.#showOnlyProficient
			? this.#allEquipment.filter((e) => this.#proficiencyResolver.matchesProficiency(e, this.#proficiencies))
			: this.#allEquipment;

		// Build category tabs in fixed order, only showing those with items
		const availableTypes = new Set(filteredEquipment.map((e) => e.objectType));
		const categories = Object.keys(CATEGORY_CONFIG)
			.filter((type) => availableTypes.has(type))
			.map((type) => ({
				id: type,
				label: CATEGORY_CONFIG[type].label,
				icon: CATEGORY_CONFIG[type].icon,
				active: this.#activeCategory === type,
			}));

		if (this.#activeCategory) {
			filteredEquipment = filteredEquipment.filter((e) => e.objectType === this.#activeCategory);
		}

		const wealthCp = this.#getActorWealthInCp();
		const displayWealthCp = this.#payTheBill ? wealthCp : 0;
		filteredEquipment = filteredEquipment.map((e) => this.#enrichEquipmentForDisplay(e, displayWealthCp));

		const none = game.i18n.localize('NIMBLE_SELECTOR.panel.none');
		const armorSummary = this.#proficiencies.armor.length ? this.#proficiencies.armor.join(', ') : none;
		const weaponSummary = this.#proficiencies.weapons.length ? this.#proficiencies.weapons.join(', ') : none;

		const selectedCount = this.#selectedUuids.size;
		const selectionTotalCp = this.#getSelectionTotalCp();
		const canAfford = selectionTotalCp <= wealthCp;

		return {
			className: capitalize(this.#classIdentifier),
			proficiencySummary: `${game.i18n.localize('NIMBLE_SELECTOR.panel.armor')}: ${armorSummary} | ${game.i18n.localize('NIMBLE_SELECTOR.panel.weapons')}: ${weaponSummary}`,
			categories,
			activeCategory: this.#activeCategory,
			showOnlyProficient: this.#showOnlyProficient,
			payTheBill: this.#payTheBill,
			filteredEquipment,
			selectedCount,
			hasSelection: selectedCount > 0,
			canConfirm: selectedCount > 0 && (!this.#payTheBill || canAfford),
			wealth: this.#getActorWealth(),
			selectionTotal: EquipmentSelector.#formatCpToCoins(selectionTotalCp),
			hasSelectionCost: selectionTotalCp > 0,
			canAfford,
		};
	}

	/**
	 * Enrich an equipment item with display-specific properties.
	 * @param {import('../core/CompendiumBrowser.mjs').ItemData} item
	 * @param {number} wealthCp - Actor's wealth in CP (0 if payTheBill disabled)
	 * @returns {object}
	 */
	#enrichEquipmentForDisplay(item, wealthCp) {
		return {
			...item,
			selected: this.#selectedUuids.has(item.uuid),
			typeLabel: CATEGORY_CONFIG[item.objectType]?.label ?? item.objectType,
			priceLabel: this.#formatPrice(item),
			tooExpensive: this.#payTheBill && this.#getItemPriceInCp(item) > wealthCp,
		};
	}

	/** @override */
	_onRender(_context, _options) {
		const scrollArea = this.element?.querySelector('.nimble-selector__scroll-area');
		if (scrollArea) scrollArea.scrollTop = this.#scrollTop;
	}

	/**
	 * Save current scroll position before re-render.
	 */
	#saveScrollPosition() {
		const scrollArea = this.element?.querySelector('.nimble-selector__scroll-area');
		if (scrollArea) this.#scrollTop = scrollArea.scrollTop;
	}

	/* ---------------------------------------- */
	/*  Currency Deduction                      */
	/* ---------------------------------------- */

	/**
	 * Deduct a total cost in copper pieces from the actor's currency.
	 * Converts the remaining amount back to optimal gp/sp/cp breakdown.
	 * @param {number} totalCp
	 * @returns {Promise<boolean>} false if the actor cannot afford it
	 */
	async #deductCurrency(totalCp) {
		const remainingCp = this.#getActorWealthInCp() - totalCp;
		if (remainingCp < 0) return false;

		const newCoins = EquipmentSelector.#formatCpToCoins(remainingCp);
		try {
			await this.#actor.update({
				'system.currency.gp.value': newCoins.gp,
				'system.currency.sp.value': newCoins.sp,
				'system.currency.cp.value': newCoins.cp,
			});
			return true;
		} catch (err) {
			console.error(`${LOG_PREFIX} Failed to deduct currency from ${this.#actor.name}:`, err);
			return false;
		}
	}

	/* ---------------------------------------- */
	/*  Action Handlers                         */
	/* ---------------------------------------- */

	/** @this {EquipmentSelector} */
	static #onFilterCategory(_event, target) {
		const category = target.dataset.category;
		this.#activeCategory = this.#activeCategory === category ? '' : category;
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {EquipmentSelector} */
	static #onToggleEquipment(_event, target) {
		const uuid = target.dataset.uuid;
		if (!uuid) return;

		if (this.#selectedUuids.has(uuid)) {
			this.#selectedUuids.delete(uuid);
		} else {
			this.#selectedUuids.add(uuid);
		}
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {EquipmentSelector} */
	static #onToggleProficiencyFilter() {
		this.#showOnlyProficient = !this.#showOnlyProficient;
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {EquipmentSelector} */
	static #onTogglePayTheBill() {
		this.#payTheBill = !this.#payTheBill;
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {EquipmentSelector} */
	static async #onConfirm() {
		const uuids = [...this.#selectedUuids].filter(Boolean);
		if (!uuids.length) return;

		if (this.#payTheBill) {
			const totalCp = this.#getSelectionTotalCp();
			if (totalCp > this.#getActorWealthInCp()) {
				ui.notifications.warn(game.i18n.localize('NIMBLE_SELECTOR.equipment.cannotAfford'));
				return;
			}

			// Grant items first, then deduct currency — if granting fails,
			// the actor keeps their money.
			const granted = await this.#granter.grantItemsByUuid(this.#actor, uuids);
			if (!granted.length) return;

			await this.#deductCurrency(totalCp);
		} else {
			await this.#granter.grantItemsByUuid(this.#actor, uuids);
		}

		this.#selectedUuids.clear();
		ui.notifications.info(
			game.i18n.format('NIMBLE_SELECTOR.notifications.grantedEquipment', {
				count: uuids.length,
				name: this.#actor.name,
			}),
		);
		this.close();
	}

	/** @this {EquipmentSelector} */
	static #onCancel() {
		this.close();
	}
}

export { EquipmentSelector };
