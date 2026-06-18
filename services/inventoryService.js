// ─────────────────────────────────────────────
//  inventoryService.js  —  Equip/unequip logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const { WEAPONS, ARMOUR, VEHICLES } = require('../data/constants');
const playerRepository = require('../repositories/playerRepository');

/**
 * Equip an item from owned array into the equipped slot.
 * If something is already equipped, it moves to owned array.
 *
 * @param {'weapon'|'armour'|'headwear'|'vehicle'} category
 * @param {number} ownedIndex  — index in the owned array
 */
async function equipItem(serverId, discordId, category, ownedIndex) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {} };

  const inv = player.inventory ?? {};
  const updates = {};

  if (category === 'weapon') {
    const owned = [...(inv.ownedWeapons ?? [])];
    if (ownedIndex < 0 || ownedIndex >= owned.length) {
      return { success: false, message: 'Item not found.', data: {}, updates: {} };
    }
    const toEquip = owned.splice(ownedIndex, 1)[0];
    if (inv.equippedWeapon) owned.push(inv.equippedWeapon); // move current to owned
    updates['inventory.equippedWeapon'] = toEquip;
    updates['inventory.ownedWeapons']   = owned;
    const def = WEAPONS[toEquip.id];
    return { success: true, message: `**${def?.name ?? toEquip.id}** equipped.`, data: {}, updates };

  } else if (category === 'armour') {
    const owned = [...(inv.ownedArmour ?? [])];
    if (ownedIndex < 0 || ownedIndex >= owned.length) {
      return { success: false, message: 'Item not found.', data: {}, updates: {} };
    }
    const toEquip = owned.splice(ownedIndex, 1)[0];
    if (inv.equippedArmour) owned.push(inv.equippedArmour);
    updates['inventory.equippedArmour'] = toEquip;
    updates['inventory.ownedArmour']    = owned;
    const def = ARMOUR[toEquip.id];
    return { success: true, message: `**${def?.name ?? toEquip.id}** equipped.`, data: {}, updates };

  } else if (category === 'headwear') {
    const owned = [...(inv.ownedHeadwear ?? [])];
    if (ownedIndex < 0 || ownedIndex >= owned.length) {
      return { success: false, message: 'Item not found.', data: {}, updates: {} };
    }
    const toEquip = owned.splice(ownedIndex, 1)[0];
    if (inv.equippedHeadwear) owned.push(inv.equippedHeadwear);
    updates['inventory.equippedHeadwear'] = toEquip;
    updates['inventory.ownedHeadwear']    = owned;
    const def = ARMOUR[toEquip.id];
    return { success: true, message: `**${def?.name ?? toEquip.id}** equipped.`, data: {}, updates };

  } else if (category === 'vehicle') {
    const owned = [...(inv.ownedVehicles ?? [])];
    if (ownedIndex < 0 || ownedIndex >= owned.length) {
      return { success: false, message: 'Item not found.', data: {}, updates: {} };
    }
    const toEquip = owned.splice(ownedIndex, 1)[0];
    if (inv.equippedVehicle) owned.push(inv.equippedVehicle);
    updates['inventory.equippedVehicle'] = toEquip;
    updates['inventory.ownedVehicles']   = owned;
    const def = VEHICLES[toEquip.id];
    return { success: true, message: `**${def?.name ?? toEquip.id}** equipped.`, data: {}, updates };
  }

  return { success: false, message: 'Unknown category.', data: {}, updates: {} };
}

/**
 * Unequip an item — moves equipped item to owned array.
 */
async function unequipItem(serverId, discordId, category) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {} };

  const inv = player.inventory ?? {};
  const updates = {};

  if (category === 'weapon') {
    if (!inv.equippedWeapon) return { success: false, message: 'No weapon equipped.', data: {}, updates: {} };
    updates['inventory.ownedWeapons']   = [...(inv.ownedWeapons ?? []), inv.equippedWeapon];
    updates['inventory.equippedWeapon'] = null;
    const def = WEAPONS[inv.equippedWeapon.id];
    return { success: true, message: `**${def?.name ?? inv.equippedWeapon.id}** unequipped.`, data: {}, updates };

  } else if (category === 'armour') {
    if (!inv.equippedArmour) return { success: false, message: 'No armour equipped.', data: {}, updates: {} };
    updates['inventory.ownedArmour']    = [...(inv.ownedArmour ?? []), inv.equippedArmour];
    updates['inventory.equippedArmour'] = null;
    const def = ARMOUR[inv.equippedArmour.id];
    return { success: true, message: `**${def?.name ?? inv.equippedArmour.id}** unequipped.`, data: {}, updates };

  } else if (category === 'headwear') {
    if (!inv.equippedHeadwear) return { success: false, message: 'No headwear equipped.', data: {}, updates: {} };
    updates['inventory.ownedHeadwear']    = [...(inv.ownedHeadwear ?? []), inv.equippedHeadwear];
    updates['inventory.equippedHeadwear'] = null;
    const def = ARMOUR[inv.equippedHeadwear.id];
    return { success: true, message: `**${def?.name ?? inv.equippedHeadwear.id}** unequipped.`, data: {}, updates };

  } else if (category === 'vehicle') {
    if (!inv.equippedVehicle) return { success: false, message: 'No vehicle equipped.', data: {}, updates: {} };
    updates['inventory.ownedVehicles']   = [...(inv.ownedVehicles ?? []), inv.equippedVehicle];
    updates['inventory.equippedVehicle'] = null;
    const def = VEHICLES[inv.equippedVehicle.id];
    return { success: true, message: `**${def?.name ?? inv.equippedVehicle.id}** unequipped.`, data: {}, updates };
  }

  return { success: false, message: 'Unknown category.', data: {}, updates: {} };
}

module.exports = { equipItem, unequipItem };
