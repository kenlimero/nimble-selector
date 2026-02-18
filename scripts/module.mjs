import { MODULE_ID } from './utils/constants.mjs';
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

let orchestrator = null;

/* ---------------------------------------- */
/*  Helpers                                 */
/* ---------------------------------------- */

/**
 * Extract a document ID from a context-menu <li> element.
 * FoundryVTT v13 ApplicationV2 sidebars may use data-entry-id
 * instead of the legacy data-document-id.
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
		ui.notifications.warn('Nimble Selector is still loading…');
		return;
	}
	const token = canvas.tokens?.controlled?.[0];
	const actor = token?.actor ?? game.user?.character;
	if (!actor || actor.type !== 'character') {
		ui.notifications.info('Select a character token or set a default character first.');
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
	} catch { /* not available */ }

	console.log(`${MODULE_ID} | Found ${classes.size} character sheet class(es):`,
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

		// Find the class in the chain that owns _getHeaderControls
		let owner = SheetClass.prototype;
		while (owner && !Object.hasOwn(owner, '_getHeaderControls')) {
			owner = Object.getPrototypeOf(owner);
		}
		if (!owner || patched.has(owner)) continue;
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

		// Register the action handler on the first class that owns DEFAULT_OPTIONS.actions
		let target = SheetClass;
		while (target) {
			if (Object.hasOwn(target, 'DEFAULT_OPTIONS') && target.DEFAULT_OPTIONS.actions) {
				if (!target.DEFAULT_OPTIONS.actions.nimbleSelector) {
					target.DEFAULT_OPTIONS.actions.nimbleSelector = function () {
						if (!orchestrator) {
							ui.notifications.warn('Nimble Selector is still loading…');
							return;
						}
						orchestrator.openForActor(this.document);
					};
				}
				break;
			}
			target = Object.getPrototypeOf(target);
			if (target === Function.prototype || target === null) break;
		}
	}

	console.log(`${MODULE_ID} | Patched ${patched.size} prototype(s) with header control`);
}

/* ---------------------------------------- */
/*  Init Hook                               */
/* ---------------------------------------- */

Hooks.once('init', () => {
	console.log(`${MODULE_ID} | Initializing Nimble Selector module`);

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
	console.log(`${MODULE_ID} | Loading data and indexing compendiums`);

	try {
		const dataProvider = DataProvider.instance;
		const compendiumBrowser = CompendiumBrowser.instance;

		await Promise.all([dataProvider.load(), compendiumBrowser.initialize()]);

		orchestrator = new SelectorOrchestrator();

		// Expose the orchestrator globally for macro / API usage
		game.modules.get(MODULE_ID).api = {
			orchestrator,
			openForActor: (actor) => orchestrator.openForActor(actor),
			openFeatureSelector: (actor) => orchestrator.openFeatureSelector(actor),
			openSpellSelector: (actor) => orchestrator.openSpellSelector(actor),
			openEquipmentSelector: (actor) => orchestrator.openEquipmentSelector(actor),
		};

		// Patch character sheet classes to add header control button
		_patchCharacterSheetControls();

		console.log(`${MODULE_ID} | Ready`);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to initialize:`, err);
		ui.notifications.error('Nimble Selector failed to load. Check the console (F12) for details.');
	}
});

/* ---------------------------------------- */
/*  Scene Control Button (Token Bar)        */
/* ---------------------------------------- */

Hooks.on('getSceneControlButtons', (controls) => {
	// In v13, controls is an array of control groups.
	// We add our button to the "token" group (the default active group).
	const tokenGroup = controls.find((c) => c.name === 'token');
	if (!tokenGroup) return;

	tokenGroup.tools.push({
		name: MODULE_ID,
		title: 'Nimble Selector',
		icon: 'fa-solid fa-arrow-up-right-dots',
		button: true,
		onClick: _openForControlledToken,
	});
});

/* ---------------------------------------- */
/*  Character Sheet Header Control          */
/* ---------------------------------------- */

// Header control is added via _patchCharacterSheetControls() in the ready hook.

/* ---------------------------------------- */
/*  Level-Up Detection (updateItem)         */
/* ---------------------------------------- */

Hooks.on('updateItem', (item, changes, options, userId) => {
	// Only react on our own client
	if (userId !== game.userId) return;
	if (item.type !== 'class') return;
	if (!foundry.utils.hasProperty(changes, 'system.classLevel')) return;

	const autoOpen = game.settings.get(MODULE_ID, 'autoOpenOnLevelUp');
	if (!autoOpen || !orchestrator) return;

	const actor = item.parent;
	if (!actor || actor.type !== 'character') return;

	const newLevel = changes.system.classLevel;
	if (newLevel < 2) return;

	console.log(`${MODULE_ID} | Level-up detected: ${actor.name} ${newLevel - 1} → ${newLevel}`);
	orchestrator.openForLevelUp(actor, newLevel, newLevel);
});

/* ---------------------------------------- */
/*  Character Creation (createItem)         */
/* ---------------------------------------- */

Hooks.on('createItem', (item, options, userId) => {
	if (userId !== game.userId) return;
	if (item.type !== 'class') return;

	const autoOpen = game.settings.get(MODULE_ID, 'autoOpenOnLevelUp');
	if (!autoOpen || !orchestrator) return;

	const actor = item.parent;
	if (!actor || actor.type !== 'character') return;

	console.log(`${MODULE_ID} | Class added: ${item.name} on ${actor.name}`);

	// Small delay to allow the system to finish its own item-creation logic
	// (HP, classData, etc.) before we open the panel.
	setTimeout(() => {
		orchestrator.openForActor(actor);
	}, 500);
});

/* ---------------------------------------- */
/*  Context Menu on Actor Directory         */
/* ---------------------------------------- */

Hooks.on('getActorDirectoryEntryContext', (html, contextOptions) => {
	contextOptions.push({
		name: 'Nimble Selector',
		icon: '<i class="fa-solid fa-arrow-up-right-dots"></i>',
		condition: (li) => {
			const id = _getDocumentId(li);
			const actor = game.actors.get(id);
			return actor?.type === 'character';
		},
		callback: (li) => {
			const id = _getDocumentId(li);
			const actor = game.actors.get(id);
			if (actor && orchestrator) {
				orchestrator.openForActor(actor);
			}
		},
	});
});
