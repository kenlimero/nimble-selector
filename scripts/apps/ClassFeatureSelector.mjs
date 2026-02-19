import { MODULE_ID, TEMPLATE_PATH } from '../utils/constants.mjs';
import { ClassFeatureResolver } from '../data/ClassFeatureResolver.mjs';
import { ItemGranter } from '../core/ItemGranter.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for selecting and granting class features to a character.
 * Shows features organized by level with checkboxes and duplicate detection.
 */
class ClassFeatureSelector extends HandlebarsApplicationMixin(ApplicationV2) {
	#actor;
	#classIdentifier;
	#subclassIdentifier;
	#fromLevel;
	#toLevel;
	#features = [];
	#selectedUuids = new Set();
	#initialSelectionDone = false;
	#scrollTop = 0;
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

	constructor(actor, classIdentifier, fromLevel, toLevel, subclassIdentifier = null, options = {}) {
		super(options);
		this.#actor = actor;
		this.#classIdentifier = classIdentifier;
		this.#subclassIdentifier = subclassIdentifier;
		this.#fromLevel = fromLevel;
		this.#toLevel = toLevel;
	}

	async _prepareContext() {
		this.#features = this.#resolver.resolveRange(
			this.#classIdentifier,
			this.#fromLevel,
			this.#toLevel,
			this.#subclassIdentifier,
		);

		this.#features = this.#resolver.markOwnedFeatures(this.#actor, this.#features);

		// Auto-select only regular features, not selectable options (only on first render)
		if (!this.#initialSelectionDone) {
			for (const f of this.#features) {
				if (!f.alreadyOwned && f.matched && !f.selectableGroup) {
					this.#selectedUuids.add(f.uuid);
				}
			}
			this.#initialSelectionDone = true;
		}

		// Build selectable group filter buttons (merged by groupId)
		const groupIdSet = new Set();
		for (const f of this.#features) {
			if (f.selectableGroupId) groupIdSet.add(f.selectableGroupId);
		}
		const selectableGroups = [...groupIdSet].map((id) => ({
			id,
			label: id,
			active: this.#activeGroup === id,
		}));

		// Apply group filter
		let filteredFeatures = this.#features;
		if (this.#activeGroup === '__class-features__') {
			filteredFeatures = this.#features.filter((f) => !f.selectableGroupId);
		} else if (this.#activeGroup) {
			filteredFeatures = this.#features.filter(
				(f) => f.selectableGroupId === this.#activeGroup,
			);
		}

		// Group by level
		const levelMap = new Map();
		for (const feature of filteredFeatures) {
			if (!levelMap.has(feature.level)) {
				levelMap.set(feature.level, []);
			}
			levelMap.get(feature.level).push({
				...feature,
				selected: this.#selectedUuids.has(feature.uuid),
			});
		}

		const levelGroups = [...levelMap.entries()]
			.sort(([a], [b]) => a - b)
			.map(([level, features]) => ({ level, features }));

		const selectedCount = this.#selectedUuids.size;

		return {
			className: this.#classIdentifier,
			fromLevel: this.#fromLevel,
			toLevel: this.#toLevel,
			isRange: this.#fromLevel !== this.#toLevel,
			levelGroups,
			selectedCount,
			hasSelection: selectedCount > 0,
			selectableGroups,
			activeGroup: this.#activeGroup,
			classFeatureFilterActive: this.#activeGroup === '__class-features__',
			hasSelectableGroups: selectableGroups.length > 0,
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

	static #onFilterGroup(event, target) {
		const group = target.dataset.group;
		this.#activeGroup = this.#activeGroup === group ? '' : group;
		this.#saveScrollPosition();
		this.render();
	}

	static #onToggleFeature(event, target) {
		const uuid = target.dataset.uuid;
		if (!uuid) return;

		// Prevent toggling already-owned features
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

	static #onSelectAll() {
		for (const f of this.#features) {
			if (f.alreadyOwned || !f.matched) continue;
			if (this.#activeGroup && f.selectableGroupId !== this.#activeGroup) continue;
			this.#selectedUuids.add(f.uuid);
		}
		this.#saveScrollPosition();
		this.render();
	}

	static #onDeselectAll() {
		if (this.#activeGroup) {
			for (const f of this.#features) {
				if (f.selectableGroupId === this.#activeGroup) {
					this.#selectedUuids.delete(f.uuid);
				}
			}
		} else {
			this.#selectedUuids.clear();
		}
		this.#saveScrollPosition();
		this.render();
	}

	static async #onConfirm() {
		const uuids = [...this.#selectedUuids].filter(Boolean);
		if (!uuids.length) return;

		await this.#granter.grantItemsByUuid(this.#actor, uuids);
		this.#selectedUuids.clear();
		ui.notifications.info(`Granted ${uuids.length} class feature(s) to ${this.#actor.name}.`);
		this.close();
	}

	static #onCancel() {
		this.close();
	}
}

export { ClassFeatureSelector };
