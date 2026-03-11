import { MODULE_ID, TEMPLATE_PATH, capitalize, pushToMapArray } from '../utils/constants.mjs';
import { ClassFeatureResolver } from '../data/ClassFeatureResolver.mjs';
import { ItemGranter } from '../core/ItemGranter.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for selecting and granting class features to a character.
 * Shows progression features organized by level, followed by selectable
 * group sections listed once (not duplicated per level).
 */
class ClassFeatureSelector extends HandlebarsApplicationMixin(ApplicationV2) {
	/** @type {Actor} */
	#actor;
	/** @type {string} */
	#classIdentifier;
	/** @type {string|null} */
	#subclassIdentifier;
	/** @type {number} */
	#fromLevel;
	/** @type {number} */
	#toLevel;
	/** @type {import('../data/ClassFeatureResolver.mjs').ResolvedFeature[]} */
	#features = [];
	/** @type {Set<string>} */
	#selectedUuids = new Set();
	#initialSelectionDone = false;
	#scrollTop = 0;
	/** @type {string} Active selectable group filter (empty = show all). */
	#activeGroup = '';
	#resolver = new ClassFeatureResolver();
	#granter = new ItemGranter();

	static DEFAULT_OPTIONS = {
		id: `${MODULE_ID}-feature-selector`,
		classes: [MODULE_ID, 'nimble-selector'],
		window: {
			title: 'Class Features',
			icon: 'fa-solid fa-scroll',
			resizable: true,
		},
		position: {
			width: 500,
			height: 'auto',
		},
		actions: {
			filterGroup: ClassFeatureSelector.#onFilterGroup,
			toggleFeature: ClassFeatureSelector.#onToggleFeature,
			selectAll: ClassFeatureSelector.#onSelectAll,
			deselectAll: ClassFeatureSelector.#onDeselectAll,
			confirm: ClassFeatureSelector.#onConfirm,
			cancel: ClassFeatureSelector.#onCancel,
		},
	};

	static PARTS = {
		form: {
			template: `${TEMPLATE_PATH}/class-feature-selector.hbs`,
		},
	};

	/**
	 * @param {Actor} actor
	 * @param {string} classIdentifier
	 * @param {number} fromLevel
	 * @param {number} toLevel
	 * @param {string|null} [subclassIdentifier=null]
	 * @param {object} [options={}]
	 */
	constructor(actor, classIdentifier, fromLevel, toLevel, subclassIdentifier = null, options = {}) {
		super(options);
		this.#actor = actor;
		this.#classIdentifier = classIdentifier;
		this.#subclassIdentifier = subclassIdentifier;
		this.#fromLevel = fromLevel;
		this.#toLevel = toLevel;
	}

	/** @override */
	async _prepareContext() {
		this.#features = this.#resolver.resolveRange(
			this.#classIdentifier,
			this.#fromLevel,
			this.#toLevel,
			this.#subclassIdentifier,
		);
		this.#features = this.#resolver.markOwnedFeatures(this.#actor, this.#features);

		this.#autoSelectOnFirstRender();

		const selectableGroupSections = this.#buildSelectableGroupSections();
		const { levelGroups, filteredGroupSections } = this.#buildDisplayGroups(selectableGroupSections);
		const selectedCount = this.#selectedUuids.size;

		return {
			className: capitalize(this.#classIdentifier),
			fromLevel: this.#fromLevel,
			toLevel: this.#toLevel,
			isRange: this.#fromLevel !== this.#toLevel,
			levelGroups,
			selectableGroupSections: filteredGroupSections,
			selectedCount,
			hasSelection: selectedCount > 0,
			hasContent: levelGroups.length > 0 || filteredGroupSections.length > 0,
			hasSelectableGroups: selectableGroupSections.length > 0,
			selectableGroups: selectableGroupSections,
			activeGroup: this.#activeGroup,
		};
	}

	/**
	 * Auto-select progression features on first render (if setting enabled).
	 */
	#autoSelectOnFirstRender() {
		if (this.#initialSelectionDone) return;
		this.#initialSelectionDone = true;
		if (!game.settings.get(MODULE_ID, 'autoSelectFeatures')) return;
		for (const f of this.#features) {
			if (!f.alreadyOwned && f.matched && !f.selectableGroup && f.uuid) {
				this.#selectedUuids.add(f.uuid);
			}
		}
	}

	/**
	 * Build selectable group sections from features (always needed for filter buttons).
	 * @returns {Array<{id: string, label: string, active: boolean, features: object[]}>}
	 */
	#buildSelectableGroupSections() {
		const groupMap = new Map();
		for (const f of this.#features) {
			if (!f.selectableGroupId) continue;
			if (!groupMap.has(f.selectableGroupId)) {
				groupMap.set(f.selectableGroupId, {
					id: f.selectableGroupId,
					label: f.selectableGroup,
					active: this.#activeGroup === f.selectableGroupId,
					features: [],
				});
			}
			groupMap.get(f.selectableGroupId).features.push({
				...f,
				selected: this.#selectedUuids.has(f.uuid),
			});
		}
		return [...groupMap.values()];
	}

	/**
	 * Build the level groups and filtered group sections based on active filter.
	 * @param {Array} selectableGroupSections
	 * @returns {{levelGroups: Array, filteredGroupSections: Array}}
	 */
	#buildDisplayGroups(selectableGroupSections) {
		if (this.#activeGroup) {
			return {
				levelGroups: [],
				filteredGroupSections: selectableGroupSections.filter((g) => g.id === this.#activeGroup),
			};
		}

		// Default mode: progression features by level + all selectable sections
		const levelMap = new Map();
		for (const f of this.#features) {
			if (f.selectableGroupId) continue;
			pushToMapArray(levelMap, f.level, {
				...f,
				selected: this.#selectedUuids.has(f.uuid),
			});
		}

		const levelGroups = [...levelMap.entries()]
			.sort(([a], [b]) => a - b)
			.map(([level, features]) => ({ level, features }));

		return { levelGroups, filteredGroupSections: selectableGroupSections };
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
	/*  Action Handlers                         */
	/* ---------------------------------------- */

	/** @this {ClassFeatureSelector} */
	static #onFilterGroup(_event, target) {
		const group = target.dataset.group;
		this.#activeGroup = this.#activeGroup === group ? '' : group;
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {ClassFeatureSelector} */
	static #onToggleFeature(_event, target) {
		const uuid = target.dataset.uuid;
		if (!uuid) return;

		const feature = this.#features.find((f) => f.uuid === uuid);
		if (feature?.alreadyOwned) return;

		if (this.#selectedUuids.has(uuid)) {
			this.#selectedUuids.delete(uuid);
		} else {
			this.#selectedUuids.add(uuid);
		}
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {ClassFeatureSelector} */
	static #onSelectAll() {
		for (const f of this.#features) {
			if (f.alreadyOwned || !f.matched || !f.uuid) continue;
			this.#selectedUuids.add(f.uuid);
		}
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {ClassFeatureSelector} */
	static #onDeselectAll() {
		this.#selectedUuids.clear();
		this.#saveScrollPosition();
		this.render();
	}

	/** @this {ClassFeatureSelector} */
	static async #onConfirm() {
		const uuids = [...this.#selectedUuids].filter(Boolean);
		if (!uuids.length) return;

		await this.#granter.grantItemsByUuid(this.#actor, uuids);
		this.#selectedUuids.clear();
		ui.notifications.info(
			game.i18n.format('NIMBLE_SELECTOR.notifications.grantedFeatures', {
				count: uuids.length,
				name: this.#actor.name,
			}),
		);
		this.close();
	}

	/** @this {ClassFeatureSelector} */
	static #onCancel() {
		this.close();
	}
}

export { ClassFeatureSelector };
