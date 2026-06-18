// ─────────────────────────────────────────────
//  shopService.js  —  All shop game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const { WEAPONS, ARMOUR, VEHICLES, MEDICAL_ITEMS, ACTION_TYPES } = require('../data/constants');
const playerRepository = require('../repositories/playerRepository');
const shopRepository   = require('../repositories/shopRepository');
const logRepository    = require('../repositories/logRepository');

// ── Helpers ───────────────────────────────────

function getItemDef(itemId) {
  return WEAPONS[itemId] ?? ARMOUR[itemId] ?? VEHICLES[itemId] ?? MEDICAL_ITEMS[itemId] ?? null;
}

function freshWeapon(id)   { return { id, shotsUsed: 0, killsUsed: 0 }; }
function freshArmour(id)   { return { id, shotsAbsorbed: 0, deathsSurvived: 0 }; }
function freshVehicle(id)  { return { id }; }

// ── Public API ────────────────────────────────

/**
 * Get the shop inventory for the player's current state.
 */
async function getShopForPlayer(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };

  const stateShop = await shopRepository.getStateShop(serverId, player.state);

  return {
    success: true,
    message: `Shop in **${player.state}**`,
    data: { state: player.state, shop: stateShop, playerCash: player.cash ?? 0 },
    updates: {},
    log: null,
  };
}

/**
 * Buy an item from the shop.
 */
async function buyItem(serverId, discordId, itemId) {
  const item = getItemDef(itemId);
  if (!item) return { success: false, message: 'Unknown item.', data: {}, updates: {}, log: null };

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };

  // Status checks
  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot shop while in jail.', data: { jailed: true }, updates: {}, log: null };
  }
  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return { success: false, message: 'You cannot shop while in hospital.', data: { hospitalized: true }, updates: {}, log: null };
  }

  // Verify item is available in this state
  const stateShop = await shopRepository.getStateShop(serverId, player.state);
  const allAvailable = [
    ...stateShop.weapons, ...stateShop.armour,
    ...stateShop.headwear, ...stateShop.vehicles, ...stateShop.consumables,
  ];
  if (!allAvailable.includes(itemId)) {
    return {
      success: false,
      message: `**${item.name}** is not available in **${player.state}** this week.`,
      data: { notAvailable: true },
      updates: {},
      log: null,
    };
  }

  // Afford check
  const cost = item.cost;
  if ((player.cash ?? 0) < cost) {
    return {
      success: false,
      message: `You need **$${cost.toLocaleString('en-US')}** for **${item.name}**. You have **$${(player.cash ?? 0).toLocaleString('en-US')}**.`,
      data: { insufficientFunds: true, required: cost },
      updates: {},
      log: null,
    };
  }

  const inv     = player.inventory ?? {};
  const updates = { cash: (player.cash ?? 0) - cost };

  // Consumables — just increment count
  if (itemId === 'med_kit') {
    updates['inventory.medKits'] = (inv.medKits ?? 0) + 1;
  } else if (itemId === 'first_aid_kit') {
    updates['inventory.firstAidKits'] = (inv.firstAidKits ?? 0) + 1;
  } else if (WEAPONS[itemId]) {
    const owned = [...(inv.ownedWeapons ?? []), freshWeapon(itemId)];
    updates['inventory.ownedWeapons'] = owned;
  } else if (ARMOUR[itemId]) {
    const slot = ARMOUR[itemId].slot; // 'armour' or 'headwear'
    if (slot === 'headwear') {
      updates['inventory.ownedHeadwear'] = [...(inv.ownedHeadwear ?? []), freshArmour(itemId)];
    } else {
      updates['inventory.ownedArmour'] = [...(inv.ownedArmour ?? []), freshArmour(itemId)];
    }
  } else if (VEHICLES[itemId]) {
    updates['inventory.ownedVehicles'] = [...(inv.ownedVehicles ?? []), freshVehicle(itemId)];
  }

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'shop_purchase',
    location:   player.state,
    payload:    { itemId, itemName: item.name, cost },
  }).catch(() => {});

  return {
    success: true,
    message: `You bought **${item.name}** for **$${cost.toLocaleString('en-US')}**!`,
    data:    { itemId, itemName: item.name, cost },
    updates,
    log: { actionType: ACTION_TYPES.ECONOMY, actionName: 'shop_purchase' },
  };
}

/**
 * Sell an item back to the shop at 50% value.
 * For equipped items, caller must confirm first (panel handles this).
 *
 * @param {string} itemId
 * @param {string} itemCategory  — 'weapon' | 'armour' | 'headwear' | 'vehicle'
 * @param {number} ownedIndex    — index in the owned array, or -1 if selling equipped
 */
async function sellItem(serverId, discordId, itemId, itemCategory, ownedIndex) {
  const item = getItemDef(itemId);
  if (!item) return { success: false, message: 'Unknown item.', data: {}, updates: {}, log: null };

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };

  const sellPrice = Math.floor(item.cost * 0.5);
  const inv       = player.inventory ?? {};
  const updates   = { cash: (player.cash ?? 0) + sellPrice };

  if (itemCategory === 'weapon') {
    if (ownedIndex === -1) {
      updates['inventory.equippedWeapon'] = null;
    } else {
      const owned = [...(inv.ownedWeapons ?? [])];
      owned.splice(ownedIndex, 1);
      updates['inventory.ownedWeapons'] = owned;
    }
  } else if (itemCategory === 'armour') {
    if (ownedIndex === -1) {
      updates['inventory.equippedArmour'] = null;
    } else {
      const owned = [...(inv.ownedArmour ?? [])];
      owned.splice(ownedIndex, 1);
      updates['inventory.ownedArmour'] = owned;
    }
  } else if (itemCategory === 'headwear') {
    if (ownedIndex === -1) {
      updates['inventory.equippedHeadwear'] = null;
    } else {
      const owned = [...(inv.ownedHeadwear ?? [])];
      owned.splice(ownedIndex, 1);
      updates['inventory.ownedHeadwear'] = owned;
    }
  } else if (itemCategory === 'vehicle') {
    if (ownedIndex === -1) {
      updates['inventory.equippedVehicle'] = null;
    } else {
      const owned = [...(inv.ownedVehicles ?? [])];
      owned.splice(ownedIndex, 1);
      updates['inventory.ownedVehicles'] = owned;
    }
  } else if (itemCategory === 'consumable') {
    if (itemId === 'med_kit') {
      updates['inventory.medKits'] = Math.max(0, (inv.medKits ?? 0) - 1);
    } else if (itemId === 'first_aid_kit') {
      updates['inventory.firstAidKits'] = Math.max(0, (inv.firstAidKits ?? 0) - 1);
    }
  }

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'shop_sell',
    location:   player.state,
    payload:    { itemId, itemName: item.name, sellPrice },
  }).catch(() => {});

  return {
    success: true,
    message: `You sold **${item.name}** for **$${sellPrice.toLocaleString('en-US')}**.`,
    data:    { itemId, itemName: item.name, sellPrice },
    updates,
    log: { actionType: ACTION_TYPES.ECONOMY, actionName: 'shop_sell' },
  };
}

module.exports = { getShopForPlayer, buyItem, sellItem };
