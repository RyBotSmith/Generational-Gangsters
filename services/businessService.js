// ─────────────────────────────────────────────
//  businessService.js  —  All business game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const {
  BUSINESS_TYPES,
  BUSINESS_COLLECT_COOLDOWN,
  BUSINESS_MAX_PENDING_HOURS,
  BUSINESS_RAID_COOLDOWN,
  BUSINESS_RAIDS_TO_LOSE,
  STATES,
  ACTION_TYPES,
} = require('../data/constants');

const playerRepository   = require('../repositories/playerRepository');
const businessRepository = require('../repositories/businessRepository');
const logRepository      = require('../repositories/logRepository');

// ── Helpers ───────────────────────────────────

/**
 * Firestore slot key from state name.
 * e.g. 'New York' → 'slot_New_York'
 */
function slotKey(state) {
  return `slot_${state.replace(/ /g, '_')}`;
}

/**
 * State name from slot key.
 * e.g. 'slot_New_York' → 'New York'
 */
function slotState(key) {
  return key.replace('slot_', '').replace(/_/g, ' ');
}

/**
 * Calculate pending income for a business.
 */
function calcPending(business) {
  const type       = BUSINESS_TYPES[business.typeId];
  if (!type) return 0;
  const incomePerHr = type.incomePerHr * (business.level ?? 1);
  const maxPending  = incomePerHr * 1; // capped at 1hr per GDD clarification
  const elapsed     = (Date.now() - (business.lastCollectedAt ?? business.claimedAt ?? Date.now())) / 3600000;
  return Math.min(Math.floor(elapsed * incomePerHr), maxPending);
}

/**
 * Calculate upgrade cost for next level.
 */
function calcUpgradeCost(business) {
  const type = BUSINESS_TYPES[business.typeId];
  if (!type) return null;
  const nextLevel = (business.level ?? 1) + 1;
  if (nextLevel > 5) return null;
  return Math.floor(type.buyCost * Math.pow(type.upgradeMult, business.level ?? 1));
}

/**
 * Calculate raid bullets required.
 */
function calcRaidBullets(business) {
  return 200 * (business.level ?? 1);
}

/**
 * Calculate raid success chance.
 */
function calcRaidChance(business) {
  const type = BUSINESS_TYPES[business.typeId];
  if (!type?.raidBase) return 0;
  return Math.max(0.15, type.raidBase - ((business.level ?? 1) - 1) * 0.10);
}

/**
 * Pick a random state that has no illegal business currently.
 */
async function pickEmptyIllegalState(serverId, excludeState) {
  const allSlots = await businessRepository.getAllSlots(serverId);
  const occupiedStates = new Set(
    allSlots
      .filter(s => s.ownerId && BUSINESS_TYPES[s.typeId]?.category === 'illegal')
      .map(s => s.state)
  );
  const candidates = STATES.filter(s => s !== excludeState && !occupiedStates.has(s));
  if (candidates.length === 0) return STATES.find(s => s !== excludeState) ?? STATES[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── Public API ────────────────────────────────

/**
 * Initialise the 3 business slots for a server if they don't exist.
 * Called lazily on first business panel open.
 */
async function initSlots(serverId) {
  const defaults = [
    { state: 'New York', typeId: 'bar' },
    { state: 'Miami',    typeId: 'drug_lab' },
    { state: 'Chicago',  typeId: 'casino' },
  ];

  for (const { state, typeId } of defaults) {
    const key      = slotKey(state);
    const existing = await businessRepository.getSlot(serverId, key);
    if (!existing) {
      await businessRepository.setSlot(serverId, key, {
        key,
        state,
        typeId,
        ownerId:         null,
        ownerName:       null,
        level:           1,
        raidCount:       0,
        lastCollectedAt: null,
        lastRaidedAt:    null,
        claimedAt:       null,
        onCooldown:      false,
        cooldownUntil:   null,
        pendingCash:     0,
      });
    }
  }
}

/**
 * Get all business slots and the player's owned business.
 */
async function getBusinessState(serverId, discordId) {
  await initSlots(serverId);

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const allSlots    = await businessRepository.getAllSlots(serverId);
  const playerSlot  = allSlots.find(s => s.ownerId === discordId) ?? null;
  const stateSlot   = allSlots.find(s => s.state === player.state) ?? null;

  return {
    success: true,
    message: '',
    data: {
      player,
      allSlots,
      playerSlot,
      stateSlot,
      playerState: player.state,
    },
  };
}

/**
 * Claim an unowned business slot in the player's current state.
 */
async function claim(serverId, discordId) {
  await initSlots(serverId);

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {} };

  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot claim a business while in jail.', data: {}, updates: {} };
  }
  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return { success: false, message: 'You cannot claim a business while in hospital.', data: {}, updates: {} };
  }

  // Check player doesn't already own one
  const allSlots = await businessRepository.getAllSlots(serverId);
  if (allSlots.some(s => s.ownerId === discordId)) {
    return { success: false, message: 'You already own a business. Sell it before claiming another.', data: {}, updates: {} };
  }

  const key  = slotKey(player.state);
  const slot = await businessRepository.getSlot(serverId, key);

  if (!slot) {
    return { success: false, message: `No business slot in **${player.state}**.`, data: {}, updates: {} };
  }

  if (slot.ownerId) {
    return { success: false, message: `The **${BUSINESS_TYPES[slot.typeId]?.name}** in **${player.state}** is already owned.`, data: {}, updates: {} };
  }

  if (slot.onCooldown && slot.cooldownUntil > Date.now()) {
    return {
      success: false,
      message: `This slot is on cooldown after being raided out. Available <t:${Math.floor(slot.cooldownUntil / 1000)}:R>.`,
      data: {},
      updates: {},
    };
  }

  const type = BUSINESS_TYPES[slot.typeId];
  if (!type) return { success: false, message: 'Unknown business type.', data: {}, updates: {} };

  if ((player.cash ?? 0) < type.buyCost) {
    return {
      success: false,
      message: `You need **$${type.buyCost.toLocaleString('en-US')}** to claim the **${type.name}**.`,
      data: {},
      updates: {},
    };
  }

  const now = Date.now();
  await businessRepository.setSlot(serverId, key, {
    ...slot,
    ownerId:         discordId,
    ownerName:       player.username,
    level:           1,
    raidCount:       0,
    lastCollectedAt: now,
    claimedAt:       now,
    onCooldown:      false,
    cooldownUntil:   null,
  });

  await playerRepository.updatePlayer(serverId, discordId, {
    cash: (player.cash ?? 0) - type.buyCost,
    businessId: key,
  });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'business_purchase',
    location:   player.state,
    payload:    { typeId: slot.typeId, cost: type.buyCost },
  }).catch(() => {});

  return {
    success: true,
    message: `You claimed the **${type.name}** in **${player.state}** for **$${type.buyCost.toLocaleString('en-US')}**!`,
    data:    { slot, type },
    updates: {},
  };
}

/**
 * Collect pending income from a business.
 * Player must be in the same state.
 */
async function collect(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {} };

  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot collect while in jail.', data: {}, updates: {} };
  }

  const key  = slotKey(player.state);
  const slot = await businessRepository.getSlot(serverId, key);

  if (!slot?.ownerId || slot.ownerId !== discordId) {
    return { success: false, message: `You don't own the business in **${player.state}**.`, data: {}, updates: {} };
  }

  // Cooldown check
  const lastCollect = slot.lastCollectedAt ?? 0;
  const cooldownMs  = BUSINESS_COLLECT_COOLDOWN * 1000;
  const nextCollect = lastCollect + cooldownMs;
  if (Date.now() < nextCollect) {
    return {
      success: false,
      message: `Collect on cooldown. Next collect <t:${Math.floor(nextCollect / 1000)}:R>.`,
      data: { onCooldown: true, nextCollect },
      updates: {},
    };
  }

  const pending = calcPending(slot);
  if (pending <= 0) {
    return { success: false, message: 'No income to collect yet.', data: {}, updates: {} };
  }

  const now = Date.now();
  await businessRepository.setSlot(serverId, key, { ...slot, lastCollectedAt: now });
  await playerRepository.updatePlayer(serverId, discordId, {
    cash: (player.cash ?? 0) + pending,
  });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'business_collect',
    location:   player.state,
    payload:    { typeId: slot.typeId, amount: pending, level: slot.level },
  }).catch(() => {});

  return {
    success: true,
    message: `Collected **$${pending.toLocaleString('en-US')}** from your **${BUSINESS_TYPES[slot.typeId]?.name}**!`,
    data:    { pending, slot },
    updates: {},
  };
}

/**
 * Upgrade a business to the next level.
 * Player must be in the same state.
 */
async function upgrade(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {} };

  const key  = slotKey(player.state);
  const slot = await businessRepository.getSlot(serverId, key);

  if (!slot?.ownerId || slot.ownerId !== discordId) {
    return { success: false, message: `You don't own the business in **${player.state}**.`, data: {}, updates: {} };
  }

  if ((slot.level ?? 1) >= 5) {
    return { success: false, message: 'Your business is already at max level (5).', data: {}, updates: {} };
  }

  const cost = calcUpgradeCost(slot);
  if ((player.cash ?? 0) < cost) {
    return {
      success: false,
      message: `You need **$${cost.toLocaleString('en-US')}** to upgrade.`,
      data: {},
      updates: {},
    };
  }

  const newLevel = (slot.level ?? 1) + 1;
  await businessRepository.setSlot(serverId, key, { ...slot, level: newLevel });
  await playerRepository.updatePlayer(serverId, discordId, {
    cash: (player.cash ?? 0) - cost,
  });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'business_upgrade',
    location:   player.state,
    payload:    { typeId: slot.typeId, newLevel, cost },
  }).catch(() => {});

  return {
    success: true,
    message: `Upgraded **${BUSINESS_TYPES[slot.typeId]?.name}** to level **${newLevel}**!`,
    data:    { newLevel, slot },
    updates: {},
  };
}

/**
 * Sell a business back at 60% of buy cost (all upgrade value lost).
 * Player must be in the same state.
 */
async function sell(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {} };

  const key  = slotKey(player.state);
  const slot = await businessRepository.getSlot(serverId, key);

  if (!slot?.ownerId || slot.ownerId !== discordId) {
    return { success: false, message: `You don't own the business in **${player.state}**.`, data: {}, updates: {} };
  }

  const type      = BUSINESS_TYPES[slot.typeId];
  const sellPrice = Math.floor(type.buyCost * 0.60);

  await businessRepository.setSlot(serverId, key, {
    ...slot,
    ownerId:         null,
    ownerName:       null,
    level:           1,
    raidCount:       0,
    lastCollectedAt: null,
    claimedAt:       null,
    onCooldown:      false,
    cooldownUntil:   null,
  });

  await playerRepository.updatePlayer(serverId, discordId, {
    cash:       (player.cash ?? 0) + sellPrice,
    businessId: null,
  });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'business_sell',
    location:   player.state,
    payload:    { typeId: slot.typeId, sellPrice },
  }).catch(() => {});

  return {
    success: true,
    message: `Sold your **${type.name}** for **$${sellPrice.toLocaleString('en-US')}**.`,
    data:    { sellPrice, slot },
    updates: {},
  };
}

/**
 * Raid an illegal business in the player's current state.
 * Bullets always removed. Pending cash stolen on success.
 * 5 successful raids = owner loses business, slot moves to new state on 1hr cooldown.
 */
async function raid(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {} };

  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot raid while in jail.', data: {}, updates: {} };
  }
  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return { success: false, message: 'You cannot raid while in hospital.', data: {}, updates: {} };
  }

  const key  = slotKey(player.state);
  const slot = await businessRepository.getSlot(serverId, key);

  if (!slot?.ownerId) {
    return { success: false, message: `There is no owned business in **${player.state}** to raid.`, data: {}, updates: {} };
  }

  if (slot.ownerId === discordId) {
    return { success: false, message: `You can't raid your own business.`, data: {}, updates: {} };
  }

  const type = BUSINESS_TYPES[slot.typeId];
  if (!type || type.category !== 'illegal') {
    return { success: false, message: `Legal businesses cannot be raided.`, data: {}, updates: {} };
  }

  // Raid cooldown check
  const lastRaided = slot.lastRaidedAt ?? 0;
  const raidCoolMs = BUSINESS_RAID_COOLDOWN * 1000;
  const nextRaid   = lastRaided + raidCoolMs;
  if (Date.now() < nextRaid) {
    return {
      success: false,
      message: `This business was recently raided. Next raid <t:${Math.floor(nextRaid / 1000)}:R>.`,
      data:    { onCooldown: true, nextRaid },
      updates: {},
    };
  }

  const bulletsRequired = calcRaidBullets(slot);
  const playerBullets   = player.bullets ?? 0;

  if (playerBullets < bulletsRequired) {
    return {
      success: false,
      message: `You need **${bulletsRequired} bullets** to raid a level ${slot.level} business. You have **${playerBullets}**.`,
      data:    { bulletsRequired, playerBullets },
      updates: {},
    };
  }

  // Deduct bullets regardless of outcome
  await playerRepository.updatePlayer(serverId, discordId, {
    bullets: playerBullets - bulletsRequired,
  });

  const raidChance = calcRaidChance(slot);
  const success    = Math.random() < raidChance;
  const now        = Date.now();

  if (!success) {
    await businessRepository.setSlot(serverId, key, { ...slot, lastRaidedAt: now });

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.ECONOMY,
      actionName: 'business_raid',
      location:   player.state,
      payload:    { typeId: slot.typeId, success: false, bulletsUsed: bulletsRequired },
    }).catch(() => {});

    return {
      success: false,
      message: `Your raid on the **${type.name}** failed! **${bulletsRequired} bullets** spent.`,
      data:    { raidSuccess: false, bulletsUsed: bulletsRequired },
      updates: {},
    };
  }

  // ── Raid success ──────────────────────────
  const pendingStolen = calcPending(slot);
  const newRaidCount  = (slot.raidCount ?? 0) + 1;

  // Give raider the stolen cash
  await playerRepository.updatePlayer(serverId, discordId, {
    cash: (player.cash ?? 0) + pendingStolen,
  });

  if (newRaidCount >= BUSINESS_RAIDS_TO_LOSE) {
    // Owner loses business — move slot to new empty state on 1hr cooldown
    const newState   = await pickEmptyIllegalState(serverId, player.state);
    const newKey     = slotKey(newState);
    const cooldownUntil = now + 3600000;

    // Reset current slot to unowned
    await businessRepository.setSlot(serverId, key, {
      ...slot,
      ownerId:         null,
      ownerName:       null,
      level:           1,
      raidCount:       0,
      lastCollectedAt: null,
      claimedAt:       null,
      lastRaidedAt:    now,
      onCooldown:      false,
      cooldownUntil:   null,
    });

    // Create the new slot in the new state on cooldown
    await businessRepository.setSlot(serverId, newKey, {
      key:             newKey,
      state:           newState,
      typeId:          slot.typeId,
      ownerId:         null,
      ownerName:       null,
      level:           1,
      raidCount:       0,
      lastCollectedAt: null,
      lastRaidedAt:    now,
      claimedAt:       null,
      onCooldown:      true,
      cooldownUntil,
      pendingCash:     0,
    });

    // Remove business from owner
    const owner = await playerRepository.getPlayer(serverId, slot.ownerId);
    if (owner) {
      await playerRepository.updatePlayer(serverId, slot.ownerId, { businessId: null });
    }

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.ECONOMY,
      actionName: 'business_raid',
      location:   player.state,
      payload:    { typeId: slot.typeId, success: true, bulletsUsed: bulletsRequired, pendingStolen, ownerEvicted: true, newState },
    }).catch(() => {});

    return {
      success: true,
      message: `Raid successful! You stole **$${pendingStolen.toLocaleString('en-US')}** and the owner has been **evicted** after 5 raids! The business has moved to **${newState}**.`,
      data:    { raidSuccess: true, pendingStolen, bulletsUsed: bulletsRequired, ownerEvicted: true, newRaidCount },
      updates: {},
    };
  }

  // Normal successful raid — owner keeps business
  await businessRepository.setSlot(serverId, key, {
    ...slot,
    raidCount:       newRaidCount,
    lastCollectedAt: now, // pending income cleared
    lastRaidedAt:    now,
  });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'business_raid',
    location:   player.state,
    payload:    { typeId: slot.typeId, success: true, bulletsUsed: bulletsRequired, pendingStolen, newRaidCount },
  }).catch(() => {});

  return {
    success: true,
    message: `Raid successful! Stole **$${pendingStolen.toLocaleString('en-US')}** from the **${type.name}**. Owner has been raided **${newRaidCount}/${BUSINESS_RAIDS_TO_LOSE}** times.`,
    data:    { raidSuccess: true, pendingStolen, bulletsUsed: bulletsRequired, ownerEvicted: false, newRaidCount },
    updates: {},
  };
}

async function getAllSlots(serverId) {
  return businessRepository.getAllSlots(serverId);
}

module.exports = {
  initSlots,
  getBusinessState,
  getAllSlots,
  claim,
  collect,
  upgrade,
  sell,
  raid,
  calcPending,
  calcUpgradeCost,
  calcRaidBullets,
  calcRaidChance,
  slotKey,
};
