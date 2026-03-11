import { MODULE_ID, TEMPLATE_PATH, capitalize } from '../utils/constants.mjs';
import { EquipmentProficiencyResolver } from '../data/EquipmentProficiencyResolver.mjs';
import { ItemGranter } from '../core/ItemGranter.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CATEGORY_CONFIG = {
	armor: { label: 'Armor', icon: 'fa-solid fa-shield-halved' },
	shield: { label: 'Shields', icon: 'fa-solid fa-shield' },
	weapon: { label: 'Weapons', icon: 'fa-solid fa-sword' },
	consumable: { label: 'Consumables', icon: 'fa-solid fa-flask' },
	misc: { label: 'Misc', icon: 'fa-solid fa-bag-shopping' },
};

const DENOMINATION_TO_CP = { gp: 100, sp: 10, cp: 1 };

/**
 * Application for selecting and granting equipment to a character.
 * Filters equipment by category (weapons, armor, shields, etc.)
 * based on class proficiencies.
 */
class EquipmentSelector extends HandlebarsApplicationMixin(ApplicationV2) {
	#actor;
	#classIdentifier;
	#allEquipment = [];
	#proficiencies = null;
	#selectedUuids = new Set();
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

	constructor(actor, classIdentifier, options = {}) {
		super(options);
		this.#actor = actor;
		this.#classIdentifier = classIdentifier;
	}

	#loadEquipmentData() {
		if (this.#dataLoaded) return;
		this.#proficiencies = this.#proficiencyResolver.resolve(this.#classIdentifier);
		this.#allEquipment = this.#proficiencyResolver.findAvailableEquipment(this.#classIdentifier);
		this.#dataLoaded = true;
	}

	#getActorWealth() {
		const currency = this.#actor.system?.currency ?? {};
		return {
			gp: currency.gp?.value ?? 0,
			sp: currency.sp?.value ?? 0,
			cp: currency.cp?.value ?? 0,
		};
	}

	#getActorWealthInCp() {
		const w = this.#getActorWealth();
		return w.gp * 100 + w.sp * 10 + w.cp;
	}

	#getItemPriceInCp(item) {
		const value = item.priceValue ?? 0;
		const denom = item.priceDenomination ?? 'gp';
		return value * (DENOMINATION_TO_CP[denom] ?? 100);
	}

	#formatPrice(item) {
		const value = item.priceValue ?? 0;
		const denom = item.priceDenomination ?? 'gp';
		if (value === 0) return '';
		return `${value} ${denom.toUpperCase()}`;
	}

	#getSelectionTotalCp() {
		let total = 0;
		for (const uuid of this.#selectedUuids) {
			const item = this.#allEquipment.find((e) => e.uuid === uuid);
			if (item) total += this.#getItemPriceInCp(item);
		}
		return total;
	}

	#formatCpToCoins(totalCp) {
		const gp = Math.floor(totalCp / 100);
		const sp = Math.floor((totalCp % 100) / 10);
		const cp = totalCp % 10;
		return { gp, sp, cp };
	}

	async _prepareContext() {
		this.#loadEquipmentData();

		// Filter by proficiency
		let filteredEquipment = this.#allEquipment;
		if (this.#showOnlyProficient) {
			filteredEquipment = filteredEquipment.filter(
				(e) => this.#proficiencyResolver.matchesProficiency(e, this.#proficiencies),
			);
		}

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

		// Filter by category tab
		if (this.#activeCategory) {
			filteredEquipment = filteredEquipment.filter(
				(e) => e.objectType === this.#activeCategory,
			);
		}

		const wealthCp = this.#payTheBill ? this.#getActorWealthInCp() : 0;

		filteredEquipment = filteredEquipment.map((e) => {
			const priceCp = this.#getItemPriceInCp(e);
			return {
				...e,
				selected: this.#selectedUuids.has(e.uuid),
				typeLabel: CATEGORY_CONFIG[e.objectType]?.label ?? e.objectType,
				priceLabel: this.#formatPrice(e),
				tooExpensive: this.#payTheBill && priceCp > wealthCp,
			};
		});

		const armorSummary = this.#proficiencies.armor.length
			? this.#proficiencies.armor.join(', ')
			: game.i18n.localize('NIMBLE_SELECTOR.panel.none');
		const weaponSummary = this.#proficiencies.weapons.length
			? this.#proficiencies.weapons.join(', ')
			: game.i18n.localize('NIMBLE_SELECTOR.panel.none');

		const selectedCount = this.#selectedUuids.size;
		const wealth = this.#getActorWealth();
		const selectionTotalCp = this.#getSelectionTotalCp();
		const selectionTotal = this.#formatCpToCoins(selectionTotalCp);
		const canAfford = selectionTotalCp <= this.#getActorWealthInCp();
		const canConfirm = selectedCount > 0 && (!this.#payTheBill || canAfford);

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
			canConfirm,
			wealth,
			selectionTotal,
			hasSelectionCost: selectionTotalCp > 0,
			canAfford,
		};
	}

	_onRender(context, options) {
		const scrollArea = this.element.querySelector('.nimble-selector__scroll-area');
		if (scrollArea) scrollArea.scrollTop = this.#scrollTop;
	}

	#saveScrollPosition() {
		const scrollArea = this.element?.querySelector('.nimble-selector__scroll-area');
		if (scrollArea) this.#scrollTop = scrollArea.scrollTop;
	}

	static #onFilterCategory(event, target) {
		const category = target.dataset.category;
		this.#activeCategory = this.#activeCategory === category ? '' : category;
		this.#saveScrollPosition();
		this.render();
	}

	static #onToggleEquipment(event, target) {
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

	static #onToggleProficiencyFilter() {
		this.#showOnlyProficient = !this.#showOnlyProficient;
		this.#saveScrollPosition();
		this.render();
	}

	static #onTogglePayTheBill() {
		this.#payTheBill = !this.#payTheBill;
		this.#saveScrollPosition();
		this.render();
	}

	async #deductCurrency(totalCp) {
		const wealth = this.#getActorWealth();
		let remainingCp = wealth.gp * 100 + wealth.sp * 10 + wealth.cp - totalCp;
		if (remainingCp < 0) return false;

		const newGp = Math.floor(remainingCp / 100);
		remainingCp %= 100;
		const newSp = Math.floor(remainingCp / 10);
		const newCp = remainingCp % 10;

		await this.#actor.update({
			'system.currency.gp.value': newGp,
			'system.currency.sp.value': newSp,
			'system.currency.cp.value': newCp,
		});
		return true;
	}

	static async #onConfirm() {
		const uuids = [...this.#selectedUuids].filter(Boolean);
		if (!uuids.length) return;

		if (this.#payTheBill) {
			const totalCp = this.#getSelectionTotalCp();
			if (totalCp > this.#getActorWealthInCp()) {
				ui.notifications.warn(game.i18n.localize('NIMBLE_SELECTOR.equipment.cannotAfford'));
				return;
			}
			await this.#deductCurrency(totalCp);
		}

		await this.#granter.grantItemsByUuid(this.#actor, uuids);
		this.#selectedUuids.clear();
		ui.notifications.info(game.i18n.format('NIMBLE_SELECTOR.notifications.grantedEquipment', { count: uuids.length, name: this.#actor.name }));
		this.close();
	}

	static #onCancel() {
		this.close();
	}
}

export { EquipmentSelector };
