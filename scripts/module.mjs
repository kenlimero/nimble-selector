import { MODULE_ID, LOG_PREFIX } from './utils/constants.mjs';
import { DataProvider } from './data/DataProvider.mjs';
import { CompendiumBrowser } from './core/CompendiumBrowser.mjs';
import { SelectorOrchestrator } from './core/SelectorOrchestrator.mjs';

/**
 * Nimble Selector Module Entry Point
 *
 * Integration hooks:
 * - init: register settings + keybinding
 * - ready: load data, create orchestrator, expose API
 * - updateItem: detect level-up (classLevel change)
 * - createItem: detect character creation (class added)
 * - getSceneControlButtons: add button to token controls bar
 * - getActorDirectoryEntryContext: right-click menu on actor directory
 *
 * Note: The Nimble system uses SvelteApplicationMixin(ActorSheetV2).
 * We patch _getHeaderControls() on character sheet classes to add
 * our button as a native window header control.
 */

/** @type {SelectorOrchestrator|null} */
let orchestrator = null;

/** Delay (ms) before opening panel after class creation, to let the system finish. */
const CLASS_CREATION_DELAY = 500;

/* ---------------------------------------- */
/*  Helpers                                 */
/* ---------------------------------------- */

/**
 * Extract a document ID from a context-menu <li> element.
 * FoundryVTT v13 ApplicationV2 sidebars may use data-entry-id
 * instead of the legacy data-document-id.
 * @param {HTMLElement|jQuery} li
 * @returns {string|undefined}
 */
function _getDocumentId(li) {
	if (li instanceof HTMLElement) {
		return (
			li.dataset.entryId ??
			li.dataset.documentId ??
			li.closest?.('[data-entry-id]')?.dataset.entryId ??
			li.closest?.('[data-document-id]')?.dataset.documentId
		);
	}
	// jQuery-wrapped element fallback
	return li.data?.('entryId') ?? li.data?.('documentId');
}

/**
 * Open the Nimble Selector panel for the currently controlled token
 * or the user's default character.
 */
function _openForControlledToken() {
	if (!orchestrator) {
		ui.notifications.warn(game.i18n.localize('NIMBLE_SELECTOR.notifications.loading'));
		return;
	}
	const token = canvas.tokens?.controlled?.[0];
	const actor = token?.actor ?? game.user?.character;
	if (!actor || actor.type !== 'character') {
		ui.notifications.info(game.i18n.localize('NIMBLE_SELECTOR.notifications.selectToken'));
		return;
	}
	orchestrator.openForActor(actor);
}

/**
 * Collect all registered character sheet classes from CONFIG and the Foundry registry.
 * @returns {Function[]} Array of sheet class constructors
 */
function _findCharacterSheetClasses() {
	const classes = new Set();

	// Approach 1: CONFIG.Actor.sheetClasses (standard Foundry structure)
	const byConfig = CONFIG.Actor?.sheetClasses?.character;
	if (byConfig && typeof byConfig === 'object') {
		for (const entry of Object.values(byConfig)) {
			if (entry?.cls) classes.add(entry.cls);
		}
	}

	// Approach 2: v13 DocumentSheetConfig registry
	try {
		const reg = foundry.applications?.sheets?.ActorSheet?.registeredSheets;
		if (reg) {
			for (const cls of reg) {
				if (cls) classes.add(cls);
			}
		}
	} catch { /* not available in all versions */ }

	console.log(`${LOG_PREFIX} Found ${classes.size} character sheet class(es):`,
		[...classes].map((c) => c.name || '(anonymous)'),
	);
	return [...classes];
}

/**
 * Patch character sheet classes so the "Nimble Selector" button appears
 * as a native window header control.
 *
 * Wraps _getHeaderControls() to inject our control at render time,
 * with dedup to guarantee a single entry.
 */
function _patchCharacterSheetControls() {
	const sheetClasses = _findCharacterSheetClasses();
	const patched = new Set();

	for (const SheetClass of sheetClasses) {
		if (!SheetClass?.prototype) continue;

		_patchHeaderControls(SheetClass, patched);
		_registerActionHandler(SheetClass);
	}

	console.log(`${LOG_PREFIX} Patched ${patched.size} prototype(s) with header control`);
}

/**
 * Wrap _getHeaderControls on the prototype that owns it to inject our button.
 * @param {Function} SheetClass
 * @param {Set} patched - Tracks already-patched prototypes to avoid duplicates
 */
function _patchHeaderControls(SheetClass, patched) {
	let owner = SheetClass.prototype;
	while (owner && !Object.hasOwn(owner, '_getHeaderControls')) {
		owner = Object.getPrototypeOf(owner);
	}
	if (!owner || patched.has(owner)) return;
	patched.add(owner);

	const original = owner._getHeaderControls;
	owner._getHeaderControls = function () {
		const controls = original.call(this);
		if (!controls.some((c) => c.action === 'nimbleSelector')) {
			controls.push({
				icon: 'fa-solid fa-arrow-up-right-dots',
				label: 'Nimble Selector',
				action: 'nimbleSelector',
				ownership: 'OWNER',
			});
		}
		return controls;
	};
}

/**
 * Register the nimbleSelector action handler on the class that owns DEFAULT_OPTIONS.actions.
 * @param {Function} SheetClass
 */
function _registerActionHandler(SheetClass) {
	let target = SheetClass;
	while (target) {
		if (Object.hasOwn(target, 'DEFAULT_OPTIONS') && target.DEFAULT_OPTIONS.actions) {
			if (!target.DEFAULT_OPTIONS.actions.nimbleSelector) {
				target.DEFAULT_OPTIONS.actions.nimbleSelector = function () {
					if (!orchestrator) {
						ui.notifications.warn(game.i18n.localize('NIMBLE_SELECTOR.notifications.loading'));
						return;
					}
					orchestrator.openForActor(this.document);
				};
			}
			return;
		}
		target = Object.getPrototypeOf(target);
		if (target === Function.prototype || target === null) return;
	}
}

/* ---------------------------------------- */
/*  Init Hook                               */
/* ---------------------------------------- */

Hooks.once('init', () => {
	console.log(`${LOG_PREFIX} Initializing Nimble Selector module`);

	// ── Settings ──────────────────────────────
	game.settings.register(MODULE_ID, 'autoOpenOnLevelUp', {
		name: 'NIMBLE_SELECTOR.settings.autoOpenOnLevelUp',
		hint: 'NIMBLE_SELECTOR.settings.autoOpenOnLevelUpHint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(MODULE_ID, 'autoSelectFeatures', {
		name: 'NIMBLE_SELECTOR.settings.autoSelectFeatures',
		hint: 'NIMBLE_SELECTOR.settings.autoSelectFeaturesHint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(MODULE_ID, 'showFeaturesInPanel', {
		name: 'NIMBLE_SELECTOR.settings.showFeaturesInPanel',
		hint: 'NIMBLE_SELECTOR.settings.showFeaturesInPanelHint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true,
	});

	// ── Keybinding (Shift+L) ─────────────────
	game.keybindings.register(MODULE_ID, 'openSelector', {
		name: 'NIMBLE_SELECTOR.keybindings.openSelector',
		hint: 'NIMBLE_SELECTOR.keybindings.openSelectorHint',
		editable: [{ key: 'KeyL', modifiers: ['Shift'] }],
		onDown: () => {
			_openForControlledToken();
			return true;
		},
	});
});

/* ---------------------------------------- */
/*  Ready Hook                              */
/* ---------------------------------------- */

Hooks.once('ready', async () => {
	console.log(`${LOG_PREFIX} Loading data and indexing compendiums`);

	try {
		await Promise.all([
			DataProvider.instance.load(),
			CompendiumBrowser.instance.initialize(),
		]);

		orchestrator = new SelectorOrchestrator();

		// Expose the orchestrator globally for macro / API usage
		game.modules.get(MODULE_ID).api = {
			orchestrator,
			openForActor: (actor) => orchestrator.openForActor(actor),
			openFeatureSelector: (actor) => orchestrator.openFeatureSelector(actor),
			openSpellSelector: (actor) => orchestrator.openSpellSelector(actor),
			openEquipmentSelector: (actor) => orchestrator.openEquipmentSelector(actor),
		};

		_patchCharacterSheetControls();

		console.log(`${LOG_PREFIX} Ready`);
	} catch (err) {
		console.error(`${LOG_PREFIX} Failed to initialize:`, err);
		ui.notifications.error('Nimble Selector failed to load. Check the console (F12) for details.');
	}
});

/* ---------------------------------------- */
/*  Scene Control Button (Token Bar)        */
/* ---------------------------------------- */

Hooks.on('getSceneControlButtons', (controls) => {
	const tokenGroup = controls.tokens;
	if (!tokenGroup) return;

	tokenGroup.tools[MODULE_ID] = {
		name: MODULE_ID,
		title: 'Nimble Selector',
		icon: 'fa-solid fa-arrow-up-right-dots',
		button: true,
		onClick: _openForControlledToken,
	};
});

/* ---------------------------------------- */
/*  Level-Up Detection (updateItem)         */
/* ---------------------------------------- */

Hooks.on('updateItem', (item, changes, _options, userId) => {
	if (userId !== game.userId) return;
	if (item.type !== 'class') return;
	if (!foundry.utils.hasProperty(changes, 'system.classLevel')) return;

	const autoOpen = game.settings.get(MODULE_ID, 'autoOpenOnLevelUp');
	if (!autoOpen || !orchestrator) return;

	const actor = item.parent;
	if (!actor || actor.type !== 'character') return;

	const newLevel = changes.system.classLevel;
	if (newLevel < 2) return;

	console.log(`${LOG_PREFIX} Level-up detected: ${actor.name} ${newLevel - 1} → ${newLevel}`);
	orchestrator.openForLevelUp(actor, newLevel, newLevel);
});

/* ---------------------------------------- */
/*  Character Creation (createItem)         */
/* ---------------------------------------- */

Hooks.on('createItem', (item, _options, userId) => {
	if (userId !== game.userId) return;
	if (item.type !== 'class') return;

	const autoOpen = game.settings.get(MODULE_ID, 'autoOpenOnLevelUp');
	if (!autoOpen || !orchestrator) return;

	const actor = item.parent;
	if (!actor || actor.type !== 'character') return;

	console.log(`${LOG_PREFIX} Class added: ${item.name} on ${actor.name}`);

	// Delay to allow the system to finish its own item-creation logic
	// (HP, classData, etc.) before we open the panel.
	setTimeout(() => {
		orchestrator.openForActor(actor);
	}, CLASS_CREATION_DELAY);
});

/* ---------------------------------------- */
/*  Context Menu on Actor Directory         */
/* ---------------------------------------- */

Hooks.on('getActorDirectoryEntryContext', (_html, contextOptions) => {
	contextOptions.push({
		name: 'Nimble Selector',
		icon: '<i class="fa-solid fa-arrow-up-right-dots"></i>',
		condition: (li) => {
			const actor = game.actors.get(_getDocumentId(li));
			return actor?.type === 'character';
		},
		callback: (li) => {
			const actor = game.actors.get(_getDocumentId(li));
			if (actor && orchestrator) {
				orchestrator.openForActor(actor);
			}
		},
	});
});
