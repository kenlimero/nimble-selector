import { MODULE_ID, TEMPLATE_PATH } from '../utils/constants.mjs';
import { EquipmentProficiencyResolver } from '../data/EquipmentProficiencyResolver.mjs';
import { ItemGranter } from '../core/ItemGranter.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CATEGORY_CONFIG = {
	weapon: { label: 'Weapons', icon: 'fa-solid fa-sword' },
	armor: { label: 'Armor', icon: 'fa-solid fa-shield-halved' },
	shield: { label: 'Shields', icon: 'fa-solid fa-shield' },
	consumable: { label: 'Consumables', icon: 'fa-solid fa-flask' },
	misc: { label: 'Misc', icon: 'fa-solid fa-bag-shopping' },
};

/**
 * Application for selecting and granting equipment to a character.
 * Filters equipment by category (weapons, armor, shields, etc.)
 * based on class proficiencies.
 */
class EquipmentSelector extends HandlebarsApplicationMixin(ApplicationV2) {
	#actor;
	#classIdentifier;
	#allEquipment = [];
	#selectedUuids = new Set();
	#activeCategory = '';
	#proficiencyResolver = new EquipmentProficiencyResolver();
	#granter = new ItemGranter();

	static DEFAULT_OPTIONS = {
		id: `${MODULE_ID}-equipment-selector`,
		classes: [MODULE_ID, 'nimble-levelling'],
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

	async _prepareContext() {
		const proficiencies = this.#proficiencyResolver.resolve(this.#classIdentifier);
		this.#allEquipment = this.#proficiencyResolver.findAvailableEquipment(this.#classIdentifier);

		// Determine available categories
		const availableTypes = new Set(this.#allEquipment.map((e) => e.objectType));
		const categories = [...availableTypes].map((type) => ({
			id: type,
			label: CATEGORY_CONFIG[type]?.label ?? type,
			icon: CATEGORY_CONFIG[type]?.icon ?? 'fa-solid fa-box',
			active: this.#activeCategory === type,
		}));

		// Filter
		let filteredEquipment = [...this.#allEquipment];
		if (this.#activeCategory) {
			filteredEquipment = filteredEquipment.filter(
				(e) => e.objectType === this.#activeCategory,
			);
		}

		filteredEquipment = filteredEquipment.map((e) => ({
			...e,
			selected: this.#selectedUuids.has(e.uuid),
			typeLabel: CATEGORY_CONFIG[e.objectType]?.label ?? e.objectType,
		}));

		const armorSummary = proficiencies.armor.length
			? proficiencies.armor.join(', ')
			: 'None';
		const weaponSummary = proficiencies.weapons.length
			? proficiencies.weapons.join(', ')
			: 'None';

		const selectedCount = this.#selectedUuids.size;

		return {
			className: this.#classIdentifier,
			proficiencySummary: `Armor: ${armorSummary} | Weapons: ${weaponSummary}`,
			categories,
			activeCategory: this.#activeCategory,
			filteredEquipment,
			selectedCount,
			hasSelection: selectedCount > 0,
		};
	}

	static #onFilterCategory(event, target) {
		const category = target.dataset.category;
		this.#activeCategory = this.#activeCategory === category ? '' : category;
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
		this.render();
	}

	static async #onConfirm() {
		const uuids = [...this.#selectedUuids].filter(Boolean);
		if (!uuids.length) return;

		await this.#granter.grantItemsByUuid(this.#actor, uuids);
		this.#selectedUuids.clear();
		ui.notifications.info(`Granted ${uuids.length} equipment item(s) to ${this.#actor.name}.`);
		this.close();
	}

	static #onCancel() {
		this.close();
	}

	get selectedUuids() {
		return new Set(this.#selectedUuids);
	}
}

export { EquipmentSelector };
