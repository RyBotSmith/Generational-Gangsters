// ─────────────────────────────────────────────
//  businessService.js  —  All business game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
//
//  KEY BUG NOTES (do not regress):
//  - Slots are keyed by businessId = `${typeId}_${state}` (e.g. "bar_New York"),
//    NEVER by userId. All ops use direct doc update by slot ID via
//    businessRepository — never a "setBusiness(userId, state)" pattern.
//  - getBusinessesInState() filters to slot_* style docs by reading the
//    fixed BUSINESS_TYPES table — there are only 3 slots total.
// ─────────────────────────────────────────────

const {
  BUSINESS_TYPES,
  BUSINESS_COLLECT_COOLDOWN,
  BUSINESS_MAX_PENDING_HOURS,
  BUSINESS_RAID_COOLDOWN,
  BUSINESS_RAIDS_TO_LOSE,
  ACTION_TYPES,
} = require('../data/constants');

const playerRepository   = require('../repositories/playerRepository');
const businessRepository = require('../repositories/businessRepository');
const logRepository      = require('../repositories/logRepository');

// ── Internal helpers ──────────────────────────

/**
 * Build the businessId for a given typeId. Slot location is fixed by type
 * per the GDD (bar → New York, drug_lab → Miami, casino → Chicago).
 */
function slotIdForType(typeId) {
  const type = BUSINESS_TYPES[typeId];
  if (!type) return null;
  return `${typeId}_${type.homeState}`;
}

/**
 * Upgrade cost formula: buyCost × upgradeMult^level
 * level here is the level being purchased (i.e. current level + 1).
 */
function upgradeCost(type, targetLevel) {
  return Math.round(type.buyCost * Math.pow(type.upgradeMult, targetLevel - 1));
}

/**
 * Income per hour at a given level.
 */
function incomePerHour(type, level) {
  return type.incomePerHr * level;
}

/**
 * Pending cash accrued since lastCollect, capped at BUSINESS_MAX_PENDING_HOURS.
 */
function calcPendingCash(slot, type) {
  if (!slot.ownerId || slot.level <= 0) return 0;
  const now      = Date.now();
  const lastTime = slot.lastCollect ?? slot.purchasedAt ?? now;
  const elapsedHours = Math.max(0, (now - lastTime) / (1000 * 60 * 60));

  const perHour    = incomePerHour(type, slot.level);
  const maxPending = perHour * BUSINESS_MAX_PENDING_HOURS;

  return Math.min(elapsedHours * perHour, maxPending);
}

/**
 * Raid chance at a given level: raidBase - (level × 0.05), floored at 0.
 */
function raidChance(type, level) {
  if (type.raidBase == null) return null; // legal businesses (e.g. bar) can't be raided
  return Math.max(0, type.raidBase - (level * 0.05));
}

/**
 * Bullets required to attempt a raid at a given level.
 */
function raidBulletsRequired(level) {
  return 200 * level;
}

/**
 * Collect cooldown state for a slot.
 */
function collectCooldownState(slot) {
  const lastCollect = slot.lastCollect ?? slot.purchasedAt ?? null;
  const nextMs      = lastCollect ? lastCollect + BUSINESS_COLLECT_COOLDOWN * 1000 : 0;
  const remainingMs = Math.max(0, nextMs - Date.now());
  return { onCooldown: remainingMs > 0, cooldownRemainingMs: remainingMs, nextAvailableMs: nextMs };
}

/**
 * Raid cooldown state for a slot.
 */
function raidCooldownState(slot) {
  const lastRaid    = slot.lastRaidedAt ?? null;
  const nextMs      = lastRaid ? lastRaid + BUSINESS_RAID_COOLDOWN * 1000 : 0;
  const remainingMs = Math.max(0, nextMs - Date.now());
  return { onCooldown: remainingMs > 0, cooldownRemainingMs: remainingMs, nextAvailableMs: nextMs };
}

// ── Public API ────────────────────────────────

/**
 * Seed the 3 fixed business slots in Firestore if they don't already exist.
 * Safe to call on every startup (idempotent).
 */
async function initSlots(serverId) {
  const results = [];
  for (const type of Object.values(BUSINESS_TYPES)) {
    const businessId = slotIdForType(type.id);
    if (!businessId) continue;
    const slot = await businessRepository.initSlot(serverId, type.id, type.homeState);
    results.push(slot);
  }
  return results;
}

/**
 * Get all 3 fixed business slots, enriched with view-state (income, pending,
 * cooldowns, raid chance) for rendering.
 */
async function getAllSlotsView(serverId) {
  const slots = await businessRepository.getAllSlots(serverId);
  return slots.map(slot => enrichSlot(slot));
}

/**
 * Get the businesses located in a given state (used by the travel/state panel).
 * Only returns slots whose homeState matches.
 */
async function getBusinessesInState(serverId, state) {
  const slots = await businessRepository.getAllSlots(serverId);
  return slots
    .filter(s => s.state === state)
    .map(slot => enrichSlot(slot));
}

/**
 * Enrich a raw slot doc with derived view fields.
 */
function enrichSlot(slot) {
  const type = BUSINESS_TYPES[slot.typeId];
  if (!type) return { ...slot, type: null };

  const pendingCash = calcPendingCash(slot, type);
  const cdState     = collectCooldownState(slot);
  const raidCd      = raidCooldownState(slot);
  const rChance     = raidChance(type, slot.level);

  return {
    ...slot,
    type,
    pendingCash,
    incomePerHr: slot.level > 0 ? incomePerHour(type, slot.level) : 0,
    nextUpgradeCost: slot.level < type.maxLevel ? upgradeCost(type, slot.level + 1) : null,
    collectCooldown: cdState,
    raidCooldown: raidCd,
    raidChance: rChance,
    raidBulletsRequired: rChance != null ? raidBulletsRequired(slot.level) : null,
  };
}

/**
 * Claim (buy) a business slot.
 * Player must be in the slot's home state, own no other business, and afford buyCost.
 */
async function claim(serverId, discordId, typeId) {
  const type = BUSINESS_TYPES[typeId];
  if (!type) {
    return { success: false, message: 'Unknown business type.', data: {}, updates: {}, log: null };
  }

  const businessId = slotIdForType(typeId);

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  // ── Status checks ─────────────────────────
  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You are in jail.', data: { jailed: true, jailedUntil: player.jailedUntil }, updates: {}, log: null };
  }
  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return { success: false, message: 'You are in hospital.', data: { hospitalized: true, hospitalizedUntil: player.hospitalizedUntil }, updates: {}, log: null };
  }
  if (player.travelling && player.travelEndTime > Date.now()) {
    return { success: false, message: 'You are travelling.', data: { travelling: true }, updates: {}, log: null };
  }

  // ── Location check ────────────────────────
  if (player.state !== type.homeState) {
    return {
      success: false,
      message: `You need to be in **${type.homeState}** to claim the **${type.name}**.`,
      data: { wrongState: true, requiredState: type.homeState },
      updates: {},
      log: null,
    };
  }

  // ── One business per player ───────────────
  if (player.businessId) {
    return {
      success: false,
      message: 'You already own a business. Sell it before claiming another.',
      data: { alreadyOwns: true },
      updates: {},
      log: null,
    };
  }

  // ── Slot must be unowned ───────────────────
  const slot = await businessRepository.getSlot(serverId, businessId);
  if (!slot) {
    return { success: false, message: 'Business slot not found. Contact an admin.', data: {}, updates: {}, log: null };
  }
  if (slot.ownerId) {
    return {
      success: false,
      message: `The **${type.name}** is already owned by someone else.`,
      data: { alreadyOwned: true },
      updates: {},
      log: null,
    };
  }

  // ── Afford check ───────────────────────────
  if ((player.cash ?? 0) < type.buyCost) {
    return {
      success: false,
      message: `You need **$${type.buyCost.toLocaleString('en-US')}** to claim the **${type.name}**.`,
      data: { insufficientFunds: true, required: type.buyCost },
      updates: {},
      log: null,
    };
  }

  // ── Apply ──────────────────────────────────
  const now = Date.now();

  const playerUpdates = {
    cash: (player.cash ?? 0) - type.buyCost,
    businessId,
  };
  await playerRepository.updatePlayer(serverId, discordId, playerUpdates);

  await businessRepository.updateSlot(serverId, businessId, {
    ownerId: discordId,
    level: 1,
    lastCollect: now,
    purchasedAt: now,
    lastRaidedAt: null,
    raidCount: 0,
  });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'business_claim',
    location: player.state,
    payload: { businessId, typeId, cost: type.buyCost },
  }).catch(() => {});

  return {
    success: true,
    message: `You claimed the **${type.name}** for **$${type.buyCost.toLocaleString('en-US')}**!`,
    data: { businessId, typeId, type, level: 1 },
    updates: playerUpdates,
    log: { actionType: ACTION_TYPES.ECONOMY, actionName: 'business_claim' },
  };
}

/**
 * Collect pending income from the player's owned business.
 * Player must be in the business's home state.
 */
async function collect(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  if (!player.businessId) {
    return { success: false, message: 'You don\'t own a business.', data: { noBusiness: true }, updates: {}, log: null };
  }

  const slot = await businessRepository.getSlot(serverId, player.businessId);
  if (!slot || slot.ownerId !== discordId) {
    return { success: false, message: 'You don\'t own a business.', data: { noBusiness: true }, updates: {}, log: null };
  }

  const type = BUSINESS_TYPES[slot.typeId];

  // ── Location check ────────────────────────
  if (player.state !== type.homeState) {
    return {
      success: false,
      message: `You need to be in **${type.homeState}** to collect from the **${type.name}**.`,
      data: { wrongState: true, requiredState: type.homeState },
      updates: {},
      log: null,
    };
  }

  // ── Cooldown check ────────────────────────
  const cdState = collectCooldownState(slot);
  if (cdState.onCooldown) {
    return {
      success: false,
      message: 'Your business income is still building up.',
      data: { onCooldown: true, nextAvailableMs: cdState.nextAvailableMs },
      updates: {},
      log: null,
    };
  }

  const pendingCash = calcPendingCash(slot, type);
  if (pendingCash <= 0) {
    return {
      success: false,
      message: 'There\'s no income to collect yet.',
      data: { noIncome: true },
      updates: {},
      log: null,
    };
  }

  const earned = Math.floor(pendingCash);
  const now    = Date.now();

  const playerUpdates = { cash: (player.cash ?? 0) + earned };
  await playerRepository.updatePlayer(serverId, discordId, playerUpdates);

  await businessRepository.updateSlot(serverId, player.businessId, { lastCollect: now });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'business_collect',
    location: player.state,
    payload: { businessId: player.businessId, typeId: slot.typeId, earned },
  }).catch(() => {});

  return {
    success: true,
    message: `You collected **$${earned.toLocaleString('en-US')}** from your **${type.name}**!`,
    data: { businessId: player.businessId, typeId: slot.typeId, type, earned },
    updates: playerUpdates,
    log: { actionType: ACTION_TYPES.ECONOMY, actionName: 'business_collect' },
  };
}

/**
 * Upgrade the player's owned business by one level.
 */
async function upgrade(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  if (!player.businessId) {
    return { success: false, message: 'You don\'t own a business.', data: { noBusiness: true }, updates: {}, log: null };
  }

  const slot = await businessRepository.getSlot(serverId, player.businessId);
  if (!slot || slot.ownerId !== discordId) {
    return { success: false, message: 'You don\'t own a business.', data: { noBusiness: true }, updates: {}, log: null };
  }

  const type = BUSINESS_TYPES[slot.typeId];

  // ── Location check ────────────────────────
  if (player.state !== type.homeState) {
    return {
      success: false,
      message: `You need to be in **${type.homeState}** to upgrade the **${type.name}**.`,
      data: { wrongState: true, requiredState: type.homeState },
      updates: {},
      log: null,
    };
  }

  // ── Max level check ────────────────────────
  if (slot.level >= type.maxLevel) {
    return {
      success: false,
      message: `Your **${type.name}** is already at max level (${type.maxLevel}).`,
      data: { maxLevel: true },
      updates: {},
      log: null,
    };
  }

  const targetLevel = slot.level + 1;
  const cost        = upgradeCost(type, targetLevel);

  // ── Afford check ───────────────────────────
  if ((player.cash ?? 0) < cost) {
    return {
      success: false,
      message: `You need **$${cost.toLocaleString('en-US')}** to upgrade your **${type.name}** to level ${targetLevel}.`,
      data: { insufficientFunds: true, required: cost },
      updates: {},
      log: null,
    };
  }

  const playerUpdates = { cash: (player.cash ?? 0) - cost };
  await playerRepository.updatePlayer(serverId, discordId, playerUpdates);

  await businessRepository.updateSlot(serverId, player.businessId, { level: targetLevel });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'business_upgrade',
    location: player.state,
    payload: { businessId: player.businessId, typeId: slot.typeId, level: targetLevel, cost },
  }).catch(() => {});

  return {
    success: true,
    message: `You upgraded your **${type.name}** to **Level ${targetLevel}** for **$${cost.toLocaleString('en-US')}**!`,
    data: { businessId: player.businessId, typeId: slot.typeId, type, level: targetLevel, cost },
    updates: playerUpdates,
    log: { actionType: ACTION_TYPES.ECONOMY, actionName: 'business_upgrade' },
  };
}

/**
 * Sell the player's owned business back. Slot resets to unowned.
 * No payout specified by GDD for voluntary sale beyond freeing up the slot;
 * any pending income is forfeited.
 */
async function sell(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  if (!player.businessId) {
    return { success: false, message: 'You don\'t own a business.', data: { noBusiness: true }, updates: {}, log: null };
  }

  const slot = await businessRepository.getSlot(serverId, player.businessId);
  if (!slot || slot.ownerId !== discordId) {
    return { success: false, message: 'You don\'t own a business.', data: { noBusiness: true }, updates: {}, log: null };
  }

  const type = BUSINESS_TYPES[slot.typeId];

  const playerUpdates = { businessId: null };
  await playerRepository.updatePlayer(serverId, discordId, playerUpdates);

  await businessRepository.resetSlot(serverId, player.businessId);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'business_sell',
    location: player.state,
    payload: { businessId: player.businessId, typeId: slot.typeId, level: slot.level },
  }).catch(() => {});

  return {
    success: true,
    message: `You walked away from your **${type.name}**. The slot is now unowned.`,
    data: { businessId: player.businessId, typeId: slot.typeId, type },
    updates: playerUpdates,
    log: { actionType: ACTION_TYPES.ECONOMY, actionName: 'business_sell' },
  };
}

/**
 * Attempt to raid a business slot (illegal businesses only).
 *
 * @param {string} serverId
 * @param {string} discordId  - attacker
 * @param {string} businessId - target slot
 */
async function raid(serverId, discordId, businessId) {
  const attacker = await playerRepository.getPlayer(serverId, discordId);
  if (!attacker) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  // ── Status checks ─────────────────────────
  if (attacker.jailedUntil && Date.now() < attacker.jailedUntil) {
    return { success: false, message: 'You are in jail.', data: { jailed: true, jailedUntil: attacker.jailedUntil }, updates: {}, log: null };
  }
  if (attacker.hospitalizedUntil && Date.now() < attacker.hospitalizedUntil) {
    return { success: false, message: 'You are in hospital.', data: { hospitalized: true, hospitalizedUntil: attacker.hospitalizedUntil }, updates: {}, log: null };
  }
  if (attacker.travelling && attacker.travelEndTime > Date.now()) {
    return { success: false, message: 'You are travelling.', data: { travelling: true }, updates: {}, log: null };
  }

  const slot = await businessRepository.getSlot(serverId, businessId);
  if (!slot) {
    return { success: false, message: 'Business slot not found.', data: {}, updates: {}, log: null };
  }

  const type = BUSINESS_TYPES[slot.typeId];

  // ── Raidable check ─────────────────────────
  const rChance = raidChance(type, slot.level);
  if (rChance == null) {
    return {
      success: false,
      message: `The **${type.name}** can't be raided.`,
      data: { notRaidable: true },
      updates: {},
      log: null,
    };
  }

  // ── Location check ────────────────────────
  if (attacker.state !== type.homeState) {
    return {
      success: false,
      message: `You need to be in **${type.homeState}** to raid the **${type.name}**.`,
      data: { wrongState: true, requiredState: type.homeState },
      updates: {},
      log: null,
    };
  }

  // ── Ownership check ────────────────────────
  if (!slot.ownerId) {
    return {
      success: false,
      message: `The **${type.name}** is unowned — nothing to raid.`,
      data: { unowned: true },
      updates: {},
      log: null,
    };
  }
  if (slot.ownerId === discordId) {
    return {
      success: false,
      message: 'You can\'t raid your own business.',
      data: { ownBusiness: true },
      updates: {},
      log: null,
    };
  }

  // ── Cooldown check ────────────────────────
  const raidCd = raidCooldownState(slot);
  if (raidCd.onCooldown) {
    return {
      success: false,
      message: 'This business was raided recently — it\'s too well-guarded right now.',
      data: { onCooldown: true, nextAvailableMs: raidCd.nextAvailableMs },
      updates: {},
      log: null,
    };
  }

  // ── Bullets check ──────────────────────────
  const bulletsRequired = raidBulletsRequired(slot.level);
  if ((attacker.bullets ?? 0) < bulletsRequired) {
    return {
      success: false,
      message: `You need **${bulletsRequired} bullets** to raid the **${type.name}** at level ${slot.level}.`,
      data: { insufficientBullets: true, required: bulletsRequired },
      updates: {},
      log: null,
    };
  }

  // ── Resolve ────────────────────────────────
  const now  = Date.now();
  const roll = Math.random();
  const success = roll < rChance;

  const attackerUpdates = {
    bullets: (attacker.bullets ?? 0) - bulletsRequired,
  };

  if (!success) {
    // Failed raid — bullets still spent, cooldown still applies to the slot
    await playerRepository.updatePlayer(serverId, discordId, attackerUpdates);
    await businessRepository.updateSlot(serverId, businessId, { lastRaidedAt: now });

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.COMBAT,
      actionName: 'business_raid',
      location: attacker.state,
      payload: { businessId, typeId: slot.typeId, success: false, bulletsSpent: bulletsRequired, raidChance: +rChance.toFixed(3) },
    }).catch(() => {});

    return {
      success: false,
      message: `Your raid on the **${type.name}** failed! You spent **${bulletsRequired} bullets**.`,
      data: { businessId, typeId: slot.typeId, type, bulletsSpent: bulletsRequired, raidChance: rChance },
      updates: attackerUpdates,
      log: { actionType: ACTION_TYPES.COMBAT, actionName: 'business_raid' },
    };
  }

  // ── Successful raid ─────────────────────────
  const newRaidCount = (slot.raidCount ?? 0) + 1;
  const slotLost     = newRaidCount >= BUSINESS_RAIDS_TO_LOSE;

  await playerRepository.updatePlayer(serverId, discordId, attackerUpdates);

  if (slotLost) {
    // Owner loses the business — slot resets to unowned
    const previousOwnerId = slot.ownerId;
    await businessRepository.resetSlot(serverId, businessId);

    const owner = await playerRepository.getPlayer(serverId, previousOwnerId);
    if (owner && owner.businessId === businessId) {
      await playerRepository.updatePlayer(serverId, previousOwnerId, { businessId: null });
    }

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.COMBAT,
      actionName: 'business_raid',
      location: attacker.state,
      payload: { businessId, typeId: slot.typeId, success: true, slotLost: true, bulletsSpent: bulletsRequired, raidChance: +rChance.toFixed(3) },
    }).catch(() => {});

    return {
      success: true,
      message: `You raided the **${type.name}** successfully! It's been raided ${BUSINESS_RAIDS_TO_LOSE} times — the owner has lost the business! The slot is now unowned.`,
      data: { businessId, typeId: slot.typeId, type, bulletsSpent: bulletsRequired, raidChance: rChance, slotLost: true, raidCount: newRaidCount },
      updates: attackerUpdates,
      log: { actionType: ACTION_TYPES.COMBAT, actionName: 'business_raid' },
    };
  }

  // Successful raid, owner keeps the business
  await businessRepository.updateSlot(serverId, businessId, {
    lastRaidedAt: now,
    raidCount: newRaidCount,
  });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.COMBAT,
    actionName: 'business_raid',
    location: attacker.state,
    payload: { businessId, typeId: slot.typeId, success: true, slotLost: false, bulletsSpent: bulletsRequired, raidChance: +rChance.toFixed(3) },
  }).catch(() => {});

  return {
    success: true,
    message: `You raided the **${type.name}** successfully! (${newRaidCount}/${BUSINESS_RAIDS_TO_LOSE} raids against this business)`,
    data: { businessId, typeId: slot.typeId, type, bulletsSpent: bulletsRequired, raidChance: rChance, slotLost: false, raidCount: newRaidCount },
    updates: attackerUpdates,
    log: { actionType: ACTION_TYPES.COMBAT, actionName: 'business_raid' },
  };
}

module.exports = {
  initSlots,
  getAllSlotsView,
  getBusinessesInState,
  claim,
  collect,
  upgrade,
  sell,
  raid,
};
