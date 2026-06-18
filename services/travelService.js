// ─────────────────────────────────────────────
//  travelService.js  —  All travel game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const {
  STATES,
  TRAVEL_TIERS,
  ACTION_TYPES,
} = require('../data/constants');

const playerRepository = require('../repositories/playerRepository');
const logRepository    = require('../repositories/logRepository');

const PREMIUM_WINDOW_MS = 24 * 60 * 60 * 1000; // rolling 24hrs

// ── Internal helpers ──────────────────────────

/**
 * Premium daily-use state, resetting the rolling 24hr window if expired.
 * Returns { usesRemaining, used, resetAt } — does NOT persist anything.
 */
function premiumUseState(player) {
  const tier  = TRAVEL_TIERS.premium;
  const now   = Date.now();
  const resetAt = player.travelPremiumResetAt ?? null;

  // Window expired or never started — treat as fresh
  if (!resetAt || now >= resetAt + PREMIUM_WINDOW_MS) {
    return { used: 0, usesRemaining: tier.dailyLimit, resetAt: null, windowExpired: true };
  }

  const used = player.travelPremiumUsedToday ?? 0;
  return {
    used,
    usesRemaining: Math.max(0, tier.dailyLimit - used),
    resetAt,
    windowExpired: false,
  };
}

// ── Public API ────────────────────────────────

/**
 * Check whether the player is blocked from travelling.
 * Returns a Result-Object-shaped block, or null if not blocked.
 */
function checkBlocked(player) {
  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return {
      success: false,
      message: 'You can\'t travel while in jail.',
      data: { jailed: true, jailedUntil: player.jailedUntil },
      updates: {},
      log: null,
    };
  }

  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return {
      success: false,
      message: 'You can\'t travel while dead.',
      data: { hospitalized: true, hospitalizedUntil: player.hospitalizedUntil },
      updates: {},
      log: null,
    };
  }

  if (player.travelling && player.travelEndTime > Date.now()) {
    return {
      success: false,
      message: 'You are already travelling.',
      data: { travelling: true, travelEndTime: player.travelEndTime, travelDestination: player.travelDestination },
      updates: {},
      log: null,
    };
  }

  return null;
}

/**
 * Get the player's current premium daily-use state (read-only view).
 */
function getPremiumUses(player) {
  return premiumUseState(player);
}

/**
 * Start travelling to a destination state via a given tier.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {string} destination - one of STATES
 * @param {string} tierId      - one of TRAVEL_TIERS keys
 */
async function start(serverId, discordId, destination, tierId) {
  const tier = TRAVEL_TIERS[tierId];
  if (!tier) {
    return { success: false, message: 'Unknown travel tier.', data: {}, updates: {}, log: null };
  }

  if (!STATES.includes(destination)) {
    return { success: false, message: 'Unknown destination.', data: {}, updates: {}, log: null };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  // ── Status checks ─────────────────────────
  const blocked = checkBlocked(player);
  if (blocked) return blocked;

  // ── Already there? ─────────────────────────
  if (player.state === destination) {
    return {
      success: false,
      message: `You're already in **${destination}**.`,
      data: { alreadyThere: true },
      updates: {},
      log: null,
    };
  }

  // ── Premium daily-limit check ─────────────
  const now = Date.now();
  let premiumUpdates = {};

  if (tierId === 'premium') {
    const useState = premiumUseState(player);

    if (useState.usesRemaining <= 0) {
      return {
        success: false,
        message: `You've used all **${tier.dailyLimit}** Premium Jet flights for today.`,
        data: { dailyLimitReached: true, resetAt: useState.resetAt },
        updates: {},
        log: null,
      };
    }

    if (useState.windowExpired) {
      premiumUpdates = { travelPremiumUsedToday: 1, travelPremiumResetAt: now };
    } else {
      premiumUpdates = { travelPremiumUsedToday: useState.used + 1 };
    }
  }

  // ── Afford check ───────────────────────────
  if ((player.cash ?? 0) < tier.cost) {
    return {
      success: false,
      message: `You need **$${tier.cost.toLocaleString('en-US')}** for **${tier.name}**.`,
      data: { insufficientFunds: true, required: tier.cost },
      updates: {},
      log: null,
    };
  }

  // ── Apply ──────────────────────────────────
  const travelEndTime = now + tier.timeSeconds * 1000;

  const updates = {
    cash: (player.cash ?? 0) - tier.cost,
    travelling: true,
    travelEndTime,
    travelDestination: destination,
    ...premiumUpdates,
  };

  // If carrying booze or drugs, stamp buy cooldowns so they must wait 1hr after arrival
  const inv = player.inventory ?? {};
  const boozeCarried = (inv.booze?.beer ?? 0) + (inv.booze?.spirits ?? 0);
  const drugsCarried = (inv.drugs?.weed ?? 0) + (inv.drugs?.cocaine ?? 0) + (inv.drugs?.ecstasy ?? 0) + (inv.drugs?.heroin ?? 0);
  if (boozeCarried > 0) updates['cooldowns.booze_buy'] = travelEndTime + 3600000; // arrives + 1hr
  if (drugsCarried > 0) updates['cooldowns.drug_buy']  = travelEndTime + 3600000;

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.TRAVEL,
    actionName: 'travel_start',
    location: player.state,
    payload: { destination, tierId, cost: tier.cost, timeSeconds: tier.timeSeconds },
  }).catch(() => {});

  return {
    success: true,
    message: tier.timeSeconds <= 10
      ? `You took the **${tier.name}** straight to **${destination}**!`
      : `You're travelling to **${destination}** via **${tier.name}**. Arriving in ${tier.timeSeconds < 60 ? `${tier.timeSeconds}s` : `${Math.round(tier.timeSeconds / 60)}m`}.`,
    data: {
      destination,
      tier,
      travelEndTime,
      arrivedImmediately: tier.timeSeconds <= 10,
    },
    updates,
    log: { actionType: ACTION_TYPES.TRAVEL, actionName: 'travel_start' },
  };
}

/**
 * Resolve travel — call when the player interacts and their travel timer
 * has expired. Updates state to the destination and clears travel flags.
 * If still travelling, returns a Result Object indicating so without
 * mutating anything.
 */
async function resolve(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  if (!player.travelling) {
    return {
      success: false,
      message: 'You are not currently travelling.',
      data: { notTravelling: true },
      updates: {},
      log: null,
    };
  }

  const now = Date.now();
  if (player.travelEndTime > now) {
    return {
      success: false,
      message: `You're still travelling to **${player.travelDestination}**.`,
      data: {
        stillTravelling: true,
        travelEndTime: player.travelEndTime,
        travelDestination: player.travelDestination,
      },
      updates: {},
      log: null,
    };
  }

  // ── Arrived ────────────────────────────────
  const destination = player.travelDestination;

  const updates = {
    state: destination,
    travelling: false,
    travelEndTime: null,
    travelDestination: null,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.TRAVEL,
    actionName: 'travel_arrive',
    location: destination,
    payload: { destination },
  }).catch(() => {});

  return {
    success: true,
    message: `You've arrived in **${destination}**!`,
    data: { destination },
    updates,
    log: { actionType: ACTION_TYPES.TRAVEL, actionName: 'travel_arrive' },
  };
}

module.exports = {
  start,
  resolve,
  checkBlocked,
  getPremiumUses,
};
