// ─────────────────────────────────────────────
//  inventoryRenderer.js  —  Embed builders for inventory.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');
const { WEAPONS, ARMOUR, VEHICLES, MEDICAL_ITEMS } = require('../../data/constants');

// ── Inventory home ────────────────────────────

/**
 * Render the inventory panel showing all owned items.
 * @param {object} player
 */
function renderInventoryHome(player) {
  const inv = player.inventory ?? {};

  // ── Equipped ──────────────────────────────
  const eqWeapon   = inv.equippedWeapon   ? WEAPONS[inv.equippedWeapon.id]   : null;
  const eqArmour   = inv.equippedArmour   ? ARMOUR[inv.equippedArmour.id]    : null;
  const eqHeadwear = inv.equippedHeadwear ? ARMOUR[inv.equippedHeadwear.id]  : null;
  const eqVehicle  = inv.equippedVehicle  ? VEHICLES[inv.equippedVehicle.id] : null;

  const equippedLines = [
    `🔫 **Weapon:** ${eqWeapon   ? `${eqWeapon.name} (${inv.equippedWeapon.shotsUsed}/${eqWeapon.durabilityShots} shots)`     : '*None*'}`,
    `🛡️ **Armour:** ${eqArmour   ? `${eqArmour.name} (${inv.equippedArmour.shotsAbsorbed}/${eqArmour.durabilityShots} shots)` : '*None*'}`,
    `🪖 **Headwear:** ${eqHeadwear ? `${eqHeadwear.name} (${inv.equippedHeadwear.shotsAbsorbed}/${eqHeadwear.durabilityShots} shots)` : '*None*'}`,
    `🚗 **Vehicle:** ${eqVehicle  ? eqVehicle.name : '*None*'}`,
  ];

  // ── Owned (unequipped) ────────────────────
  const ownedWeapons   = (inv.ownedWeapons   ?? []).map((w, i) => {
    const def = WEAPONS[w.id];
    return def ? `${i + 1}. ${def.name} (${w.shotsUsed}/${def.durabilityShots} shots) — ${formatCash(Math.floor(def.cost * 0.5))} sell` : null;
  }).filter(Boolean);

  const ownedArmour    = (inv.ownedArmour    ?? []).map((a, i) => {
    const def = ARMOUR[a.id];
    return def ? `${i + 1}. ${def.name} (${a.shotsAbsorbed}/${def.durabilityShots} shots) — ${formatCash(Math.floor(def.cost * 0.5))} sell` : null;
  }).filter(Boolean);

  const ownedHeadwear  = (inv.ownedHeadwear  ?? []).map((h, i) => {
    const def = ARMOUR[h.id];
    return def ? `${i + 1}. ${def.name} (${h.shotsAbsorbed}/${def.durabilityShots} shots) — ${formatCash(Math.floor(def.cost * 0.5))} sell` : null;
  }).filter(Boolean);

  const ownedVehicles  = (inv.ownedVehicles  ?? []).map((v, i) => {
    const def = VEHICLES[v.id];
    return def ? `${i + 1}. ${def.name} — ${formatCash(Math.floor(def.cost * 0.5))} sell` : null;
  }).filter(Boolean);

  // ── Consumables ───────────────────────────
  const consumableLines = [
    `💊 Med Kits: **${inv.medKits ?? 0}**`,
    `🩹 First Aid Kits: **${inv.firstAidKits ?? 0}**`,
  ];

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🎒 Inventory')
    .addFields(
      { name: '⚡ Equipped', value: equippedLines.join('\n'), inline: false },
      { name: '🔫 Weapons (unequipped)',   value: ownedWeapons.length   ? ownedWeapons.join('\n')   : '*None*', inline: true },
      { name: '🛡️ Armour (unequipped)',   value: ownedArmour.length    ? ownedArmour.join('\n')    : '*None*', inline: true },
      { name: '🪖 Headwear (unequipped)', value: ownedHeadwear.length  ? ownedHeadwear.join('\n')  : '*None*', inline: true },
      { name: '🚗 Vehicles (unequipped)', value: ownedVehicles.length  ? ownedVehicles.join('\n')  : '*None*', inline: true },
      { name: '💊 Consumables',           value: consumableLines.join('\n'),                                   inline: true },
    );

  // ── Action buttons ─────────────────────────
  const rows = [];

  // Equip buttons for owned weapons
  if (ownedWeapons.length > 0) {
    const row = new ActionRowBuilder();
    (inv.ownedWeapons ?? []).slice(0, 4).forEach((w, i) => {
      const def = WEAPONS[w.id];
      if (!def) return;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`panel_inv_equip_weapon_${i}`)
          .setLabel(`Equip ${def.name}`)
          .setStyle(ButtonStyle.Primary)
      );
    });
    if (row.components.length > 0) rows.push(row);
  }

  // Equip buttons for owned armour
  if (ownedArmour.length > 0 || ownedHeadwear.length > 0) {
    const row = new ActionRowBuilder();
    (inv.ownedArmour ?? []).slice(0, 2).forEach((a, i) => {
      const def = ARMOUR[a.id];
      if (!def) return;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`panel_inv_equip_armour_${i}`)
          .setLabel(`Equip ${def.name}`)
          .setStyle(ButtonStyle.Primary)
      );
    });
    (inv.ownedHeadwear ?? []).slice(0, 2).forEach((h, i) => {
      const def = ARMOUR[h.id];
      if (!def) return;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`panel_inv_equip_headwear_${i}`)
          .setLabel(`Equip ${def.name}`)
          .setStyle(ButtonStyle.Primary)
      );
    });
    if (row.components.length > 0) rows.push(row);
  }

  // Equip buttons for owned vehicles
  if (ownedVehicles.length > 0) {
    const row = new ActionRowBuilder();
    (inv.ownedVehicles ?? []).slice(0, 4).forEach((v, i) => {
      const def = VEHICLES[v.id];
      if (!def) return;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`panel_inv_equip_vehicle_${i}`)
          .setLabel(`Equip ${def.name}`)
          .setStyle(ButtonStyle.Primary)
      );
    });
    if (row.components.length > 0) rows.push(row);
  }

  // Unequip / sell equipped row
  const manageRow = new ActionRowBuilder();
  if (eqWeapon)   manageRow.addComponents(new ButtonBuilder().setCustomId('panel_inv_unequip_weapon').setLabel('Unequip Weapon').setStyle(ButtonStyle.Secondary));
  if (eqArmour)   manageRow.addComponents(new ButtonBuilder().setCustomId('panel_inv_unequip_armour').setLabel('Unequip Armour').setStyle(ButtonStyle.Secondary));
  if (eqHeadwear) manageRow.addComponents(new ButtonBuilder().setCustomId('panel_inv_unequip_headwear').setLabel('Unequip Headwear').setStyle(ButtonStyle.Secondary));
  if (eqVehicle)  manageRow.addComponents(new ButtonBuilder().setCustomId('panel_inv_unequip_vehicle').setLabel('Unequip Vehicle').setStyle(ButtonStyle.Secondary));
  if (manageRow.components.length > 0) rows.push(manageRow);

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_profile').setLabel('⬅ Profile').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

/**
 * Render result of equip/unequip action.
 */
function renderInventoryActionResult(result) {
  const embed = result.success
    ? embeds.success('Inventory Updated', result.message)
    : embeds.failure('Failed', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_inventory').setLabel('🎒 Inventory').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { renderInventoryHome, renderInventoryActionResult };
