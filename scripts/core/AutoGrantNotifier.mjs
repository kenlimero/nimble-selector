import { MODULE_ID, hasPendingChoices } from '../utils/constants.mjs';

/**
 * Builds and dispatches auto-grant toast notifications.
 * Shows an info toast when everything is granted, a persistent warning
 * when choices remain. Broadcasts to GM via Foundry socket.
 */
class AutoGrantNotifier {
	/**
	 * Show the appropriate toast for the actor owner and broadcast to GM.
	 * @param {Actor} actor
	 * @param {{ features: string[], spells: string[] }} granted
	 * @param {import('../utils/constants.mjs').PendingResult} pending
	 */
	notify(actor, granted, pending) {
		const hasPending = hasPendingChoices(pending);
		const totalGranted = granted.features.length + granted.spells.length;

		if (totalGranted === 0 && !hasPending) return;

		const message = hasPending
			? this.#buildWarning(actor, granted, pending)
			: this.#buildSummary(actor, granted);

		if (!message) return;

		this.#showLocal(message, hasPending);
		this.#broadcastToGM(actor.id, message, hasPending);
	}

	/**
	 * Build localized parts describing what was granted.
	 * @param {{ features: string[], spells: string[] }} granted
	 * @returns {string[]}
	 */
	#buildGrantedParts(granted) {
		const parts = [];
		if (granted.features.length > 0) {
			parts.push(game.i18n.format('NIMBLE_SELECTOR.autoGrant.grantedFeatures', { count: granted.features.length }));
		}
		if (granted.spells.length > 0) {
			parts.push(game.i18n.format('NIMBLE_SELECTOR.autoGrant.grantedSpells', { count: granted.spells.length }));
		}
		return parts;
	}

	/**
	 * Build a summary message when all items were auto-granted.
	 * @param {Actor} actor
	 * @param {{ features: string[], spells: string[] }} granted
	 * @returns {string|null}
	 */
	#buildSummary(actor, granted) {
		const parts = this.#buildGrantedParts(granted);
		if (parts.length === 0) return null;
		return game.i18n.format('NIMBLE_SELECTOR.autoGrant.summary', {
			name: actor.name,
			items: parts.join(', '),
		});
	}

	/**
	 * Build a warning message when some choices are still required.
	 * @param {Actor} actor
	 * @param {{ features: string[], spells: string[] }} granted
	 * @param {import('../utils/constants.mjs').PendingResult} pending
	 * @returns {string}
	 */
	#buildWarning(actor, granted, pending) {
		const parts = this.#buildGrantedParts(granted);
		const pendingCount = pending.selectableGroups.length + pending.schoolChoices.length;
		return game.i18n.format('NIMBLE_SELECTOR.autoGrant.warning', {
			name: actor.name,
			granted: parts.join(', ') || game.i18n.localize('NIMBLE_SELECTOR.autoGrant.noneGranted'),
			pendingCount,
		});
	}

	/**
	 * Show a local notification to the current user.
	 * @param {string} message
	 * @param {boolean} isWarning
	 */
	#showLocal(message, isWarning) {
		if (isWarning) {
			ui.notifications.warn(message);
		} else {
			ui.notifications.info(message);
		}
	}

	/**
	 * Emit a socket event so GMs who aren't the triggering user also see the notification.
	 * @param {string} actorId
	 * @param {string} message
	 * @param {boolean} isWarning
	 */
	#broadcastToGM(actorId, message, isWarning) {
		game.socket.emit(`module.${MODULE_ID}`, {
			type: 'autoGrantNotification',
			actorId,
			message,
			isWarning,
			senderId: game.userId,
		});
	}
}

export { AutoGrantNotifier };
