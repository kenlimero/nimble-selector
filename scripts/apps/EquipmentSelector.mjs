import { MODULE_ID, TEMPLATE_PATH, LOG_PREFIX, capitalize, ScrollPositionMixin } from '../utils/constants.mjs';
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
class EquipmentSelector extends ScrollPositionMixin(HandlebarsApplicationMixin(ApplicationV2)) {
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
	/** @type {Map<string, number>} UUID → selected quantity. */
	#selectedQuantities = new Map();
	/** @type {string} Active category tab filter (empty = show all). */
	#activeCategory = '';
	/** @type {boolean} Whether to filter equipment to only class-proficient items. */
	#showOnlyProficient = true;
	/** @type {boolean} Whether to deduct currency from the actor on confirm. */
	#payTheBill = false;
	/** @type {boolean} */
	#dataLoaded = false;
	/** @type {boolean} Whether the contextmenu listener has been attached. */
	#contextMenuBound = false;
	/** @type {EquipmentProficiencyResolver} */
	#proficiencyResolver = new EquipmentProficiencyResolver();
	/** @type {ItemGranter} */
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
			addEquipment: EquipmentSelector.#onAddEquipment,
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
	 * Compute the total cost of selected items, both as a per-denomination
	 * breakdown and as a single copper-piece total.
	 * @returns {{ byDenom: {gp: number, sp: number, cp: number}, totalCp: number }}
	 */
	#getSelectionCost() {
		const byDenom = { gp: 0, sp: 0, cp: 0 };
		let totalCp = 0;
		for (const [uuid, qty] of this.#selectedQuantities) {
			const item = this.#equipmentByUuid.get(uuid);
			if (!item) continue;
			const denom = item.priceDenomination ?? 'gp';
			const lineTotal = (item.priceValue ?? 0) * qty;
			byDenom[denom] = (byDenom[denom] ?? 0) + lineTotal;
			totalCp += lineTotal * (DENOMINATION_TO_CP[denom] ?? DENOMINATION_TO_CP.gp);
		}
		return { byDenom, totalCp };
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

		let selectedCount = 0;
		for (const qty of this.#selectedQuantities.values()) selectedCount += qty;
		const { byDenom: selectionTotal, totalCp: selectionTotalCp } = this.#getSelectionCost();
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
			selectionTotal,
			hasSelectionCost: selectionTotalCp > 0,
			canAfford,
		};
	}

	/**
	 * Enrich an equipment item with display-specific properties.
	 * @param {import('../core/CompendiumBrowser.mjs').ItemData} item
	 * @param {number} wealthCp - Actor's wealth in CP (0 if payTheBill disabled)
	 * @returns {import('../core/CompendiumBrowser.mjs').ItemData & {selected: boolean, quantity: number, typeLabel: string, priceLabel: string, tooExpensive: boolean}}
	 */
	#enrichEquipmentForDisplay(item, wealthCp) {
		const quantity = this.#selectedQuantities.get(item.uuid) ?? 0;
		return {
			...item,
			selected: quantity > 0,
			quantity,
			typeLabel: CATEGORY_CONFIG[item.objectType]?.label ?? item.objectType,
			priceLabel: this.#formatPrice(item),
			tooExpensive: this.#payTheBill && this.#getItemPriceInCp(item) > wealthCp,
		};
	}

	/** @override */
	_onRender(_context, _options) {
		super._onRender(_context, _options);

		// Attach right-click listener once via event delegation on the app element
		if (!this.#contextMenuBound && this.element) {
			this.element.addEventListener('contextmenu', (event) => {
				if (event.target.closest('.nimble-selector__card-grid [data-uuid]')) {
					this.#onRemoveEquipment(event);
				}
			});
			this.#contextMenuBound = true;
		}
	}

	/* ---------------------------------------- */
	/*  Currency Deduction                      */
	/* ---------------------------------------- */

	/**
	 * Deduct costs per denomination from the actor's currency.
	 * If a denomination doesn't have enough, the deficit cascades to lower
	 * denominations (GP→SP→CP) without ever consolidating back up.
	 * @param {{gp: number, sp: number, cp: number}} costs
	 * @returns {Promise<boolean>} false if the actor cannot afford it
	 */
	async #deductCurrency(costs) {
		const wallet = this.#getActorWealth();

		// Deduct GP — shortfall cascades to SP
		const gpDeduct = Math.min(costs.gp, wallet.gp);
		const gpShortfall = costs.gp - gpDeduct;
		wallet.gp -= gpDeduct;

		// Convert GP shortfall to SP and add to SP cost
		const spNeeded = costs.sp + gpShortfall * 10;
		const spDeduct = Math.min(spNeeded, wallet.sp);
		const spShortfall = spNeeded - spDeduct;
		wallet.sp -= spDeduct;

		// Convert SP shortfall to CP and add to CP cost
		const cpNeeded = costs.cp + spShortfall * 10;
		if (cpNeeded > wallet.cp) return false;
		wallet.cp -= cpNeeded;

		try {
			await this.#actor.update({
				'system.currency.gp.value': wallet.gp,
				'system.currency.sp.value': wallet.sp,
				'system.currency.cp.value': wallet.cp,
			});
			return true;
		} catch (err) {
			console.error(`${LOG_PREFIX} Failed to deduct currency from ${this.#actor.name}:`, err);
			ui.notifications.error(game.i18n.localize('NIMBLE_SELECTOR.equipment.deductionFailed') || 'Failed to deduct currency. Please try again.');
			return false;
		}
	}

	/* ---------------------------------------- */
	/*  Action Handlers                         */
	/* ---------------------------------------- */

	/**
	 * @this {EquipmentSelector}
	 * @param {PointerEvent} _event
	 * @param {HTMLElement} target
	 */
	static #onFilterCategory(_event, target) {
		const category = target.dataset.category;
		this.#activeCategory = this.#activeCategory === category ? '' : category;
		this._saveScrollPosition();
		this.render();
	}

	/**
	 * @this {EquipmentSelector}
	 * @param {PointerEvent} _event
	 * @param {HTMLElement} target
	 */
	static #onAddEquipment(_event, target) {
		const uuid = target.dataset.uuid;
		if (!uuid) return;

		const current = this.#selectedQuantities.get(uuid) ?? 0;
		this.#selectedQuantities.set(uuid, current + 1);
		this._saveScrollPosition();
		this.render();
	}

	/**
	 * Handle right-click on an equipment card to decrease quantity.
	 * @param {MouseEvent} event
	 */
	#onRemoveEquipment(event) {
		const target = event.target.closest('[data-uuid]');
		if (!target) return;
		event.preventDefault();

		const uuid = target.dataset.uuid;
		const current = this.#selectedQuantities.get(uuid) ?? 0;
		if (current <= 1) {
			this.#selectedQuantities.delete(uuid);
		} else {
			this.#selectedQuantities.set(uuid, current - 1);
		}
		this._saveScrollPosition();
		this.render();
	}

	/** @this {EquipmentSelector} */
	static #onToggleProficiencyFilter() {
		this.#showOnlyProficient = !this.#showOnlyProficient;
		this._saveScrollPosition();
		this.render();
	}

	/** @this {EquipmentSelector} */
	static #onTogglePayTheBill() {
		this.#payTheBill = !this.#payTheBill;
		this._saveScrollPosition();
		this.render();
	}

	/** @this {EquipmentSelector} */
	static async #onConfirm() {
		if (!this.#selectedQuantities.size) return;

		const quantities = new Map(this.#selectedQuantities);

		if (this.#payTheBill) {
			const { byDenom, totalCp } = this.#getSelectionCost();
			if (totalCp > this.#getActorWealthInCp()) {
				ui.notifications.warn(game.i18n.localize('NIMBLE_SELECTOR.equipment.cannotAfford'));
				return;
			}

			const deducted = await this.#deductCurrency(byDenom);
			if (!deducted) return;
		}

		await this.#granter.grantItemsByUuid(this.#actor, quantities);

		let totalCount = 0;
		for (const qty of quantities.values()) totalCount += qty;

		this.#selectedQuantities.clear();
		ui.notifications.info(
			game.i18n.format('NIMBLE_SELECTOR.notifications.grantedEquipment', {
				count: totalCount,
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
