// ─────────────────────────────────────────────
//  profilePanel.js  —  Routes panel_profile_* interactions.
//  Rule: NO game logic. NO DB calls beyond repository.
//  Defer → call service → render result.
// ─────────────────────────────────────────────

const upgradeService   = require('../services/upgradeService');
const inventoryService = require('../services/inventoryService');
const playerRepository = require('../repositories/playerRepository');
const {
  renderProfileHome,
  renderUpgradesPanel,
  renderUpgradePurchaseResult,
  renderStatsPanel,
} = require('./renderers/profileRenderer');
const { renderInventoryHome, renderInventoryActionResult } = require('./renderers/inventoryRenderer');
const embeds = require('../utils/embeds');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

async function handle(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── panel_profile — show profile home (routes to homeRenderer for now) ──
  if (customId === 'panel_profile' || customId === 'panelm_profile') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }
    return interaction.editReply(renderProfileHome(player));
  }

  // ── panel_upgrades — show upgrades panel ──
  if (customId === 'panel_upgrades') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    }
    const upgradeList = upgradeService.getAllUpgrades(player);
    return interaction.editReply(renderUpgradesPanel(player, upgradeList));
  }

  // ── panel_upgrade_buy_{upgradeId} — purchase an upgrade ──
  if (customId.startsWith('panel_upgrade_buy_')) {
    const upgradeId = customId.replace('panel_upgrade_buy_', '');
    await interaction.deferUpdate();
    const result = await upgradeService.purchaseUpgrade(serverId, discordId, upgradeId);
    return interaction.editReply(renderUpgradePurchaseResult(result));
  }

  // ── panel_inventory — show inventory ──────
  if (customId === 'panel_inventory') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    return interaction.editReply(renderInventoryHome(player));
  }

  // ── panel_inv_equip_{category}_{index} ───
  if (customId.startsWith('panel_inv_equip_')) {
    const rest     = customId.replace('panel_inv_equip_', '');
    const parts    = rest.split('_');
    const index    = parseInt(parts[parts.length - 1]);
    const category = parts.slice(0, parts.length - 1).join('_');
    await interaction.deferUpdate();
    const result = await inventoryService.equipItem(serverId, discordId, category, index);
    if (result.updates && Object.keys(result.updates).length > 0) {
      await playerRepository.updatePlayer(serverId, discordId, result.updates);
    }
    const player = await playerRepository.getPlayer(serverId, discordId);
    return interaction.editReply(result.success ? renderInventoryHome(player) : renderInventoryActionResult(result));
  }

  // ── panel_inv_unequip_{category} ─────────
  if (customId.startsWith('panel_inv_unequip_')) {
    const category = customId.replace('panel_inv_unequip_', '');
    await interaction.deferUpdate();
    const result = await inventoryService.unequipItem(serverId, discordId, category);
    if (result.updates && Object.keys(result.updates).length > 0) {
      await playerRepository.updatePlayer(serverId, discordId, result.updates);
    }
    const player = await playerRepository.getPlayer(serverId, discordId);
    return interaction.editReply(result.success ? renderInventoryHome(player) : renderInventoryActionResult(result));
  }

  // ── panel_prestige ────────────────────────
  if (customId === 'panel_prestige') {
    await interaction.deferUpdate();
    return safeFollowUp(interaction, { embeds: [embeds.info('Coming Soon', 'Prestige system is not yet available.')] });
  }

  // ── panel_stats — show stats panel ──
  if (customId === 'panel_stats') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    }
    return interaction.editReply(renderStatsPanel(player));
  }

  console.warn('[profilePanel] Unhandled customId:', customId);
}

async function handleModal(interaction) {
  console.warn('[profilePanel] Unexpected modal:', interaction.customId);
}

async function handleSelect(interaction) {
  console.warn('[profilePanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
