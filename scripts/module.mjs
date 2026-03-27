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
 *
 * Note: The Nimble system uses SvelteApplicationMixin(ActorSheetV2).
 * We patch _getHeaderControls() on character sheet classes to add
 * our buttons as native window header controls (Nimble Selector + auto-grant toggle).
 */

/** @type {SelectorOrchestrator|null} */
let orchestrator = null;

/** Delay (ms) before opening panel after class creation, to let the system finish. */
const CLASS_CREATION_DELAY = 500;

/* ---------------------------------------- */
/*  Helpers                                 */
/* ---------------------------------------- */

/**
 * Open the Nimble Selector panel for the currently controlled token
 * or the user's default character.
 * @returns {void}
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
 * @returns {void}
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
 * @returns {void}
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
		if (!controls.some((c) => c.action === 'nimbleSelectorToggleAutoGrant')) {
			const actor = this.document;
			const actorFlag = actor?.getFlag(MODULE_ID, 'autoGrant');
			const globalSetting = game.settings.get(MODULE_ID, 'autoGrantEnabled');
			const isEnabled = actorFlag !== undefined ? Boolean(actorFlag) : globalSetting;
			controls.push({
				icon: isEnabled ? 'fa-solid fa-bolt' : 'fa-solid fa-bolt-slash',
				label: isEnabled
					? game.i18n.localize('NIMBLE_SELECTOR.settings.autoGrantOn')
					: game.i18n.localize('NIMBLE_SELECTOR.settings.autoGrantOff'),
				action: 'nimbleSelectorToggleAutoGrant',
				ownership: 'OWNER',
			});
		}
		return controls;
	};
}

/**
 * Register the nimbleSelector action handler on the class that owns DEFAULT_OPTIONS.actions.
 * @param {Function} SheetClass
 * @returns {void}
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
			if (!target.DEFAULT_OPTIONS.actions.nimbleSelectorToggleAutoGrant) {
				target.DEFAULT_OPTIONS.actions.nimbleSelectorToggleAutoGrant = async function () {
					const actor = this.document;
					const actorFlag = actor.getFlag(MODULE_ID, 'autoGrant');
					const globalSetting = game.settings.get(MODULE_ID, 'autoGrantEnabled');
					const current = actorFlag !== undefined ? Boolean(actorFlag) : globalSetting;
					await actor.setFlag(MODULE_ID, 'autoGrant', !current);
					this.render();
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

	// ── Handlebars helpers ───────────────────
	Handlebars.registerHelper('capitalize', (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '');

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

	game.settings.register(MODULE_ID, 'hideSecretSpells', {
		name: 'NIMBLE_SELECTOR.settings.hideSecretSpells',
		hint: 'NIMBLE_SELECTOR.settings.hideSecretSpellsHint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(MODULE_ID, 'autoGrantEnabled', {
		name: 'NIMBLE_SELECTOR.settings.autoGrantEnabled',
		hint: 'NIMBLE_SELECTOR.settings.autoGrantEnabledHint',
		scope: 'world',
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
		await DataProvider.instance.load();
		await CompendiumBrowser.instance.initialize();

		orchestrator = new SelectorOrchestrator();

		// Socket listener: display auto-grant notifications forwarded to GM
		game.socket.on(`module.${MODULE_ID}`, (data) => {
			if (data.type !== 'autoGrantNotification') return;
			if (!game.user.isGM) return;
			if (data.senderId === game.userId) return; // Already shown locally
			if (data.isWarning) {
				ui.notifications.warn(data.message);
			} else {
				ui.notifications.info(data.message);
			}
		});

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

	orchestrator.handleLevelUp(actor, newLevel, newLevel);
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

	// Delay to allow the system to finish its own item-creation logic
	// (HP, classData, etc.) before we open the panel.
	setTimeout(() => {
		orchestrator.handleClassCreation(actor);
	}, CLASS_CREATION_DELAY);
});

