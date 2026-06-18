// ─────────────────────────────────────────────
//  businessPanel.js  —  Routes panel_business_* interactions.
//  Rule: NO game logic. NO DB calls beyond repository.
//  Defer → call service → render result.
// ─────────────────────────────────────────────

const businessService = require('../services/businessService');
const {
  renderBusinessHome,
  renderBusinessDetail,
  renderBusinessResult,
} = require('./renderers/businessRenderer');
const embeds = require('../utils/embeds');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

async function handle(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── panel_business (root) ─────────────────
  if (customId === 'panel_business' || customId === 'panelm_business') {
    await interaction.deferUpdate();
    const result = await businessService.getBusinessState(serverId, discordId);
    if (!result.success) {
      return safeFollowUp(interaction, { embeds: [embeds.error(result.message)] });
    }
    return interaction.editReply(renderBusinessHome(result.data));
  }

  // ── panel_business_detail — owned business detail ──
  if (customId === 'panel_business_detail') {
    await interaction.deferUpdate();
    const result = await businessService.getBusinessState(serverId, discordId);
    if (!result.success || !result.data.playerSlot) {
      return interaction.editReply(renderBusinessResult({ success: false, message: 'You don\'t own a business.' }));
    }
    const { playerSlot } = result.data;
    const pending     = businessService.calcPending(playerSlot);
    const upgradeCost = businessService.calcUpgradeCost(playerSlot);
    const raidChance  = businessService.calcRaidChance(playerSlot);
    return interaction.editReply(renderBusinessDetail(playerSlot, pending, upgradeCost, raidChance));
  }

  // ── panel_business_claim ──────────────────
  if (customId === 'panel_business_claim') {
    await interaction.deferUpdate();
    const result = await businessService.claim(serverId, discordId);
    if (result.success) {
      const state  = await businessService.getBusinessState(serverId, discordId);
      return interaction.editReply(renderBusinessHome(state.data));
    }
    return interaction.editReply(renderBusinessResult(result));
  }

  // ── panel_business_collect ────────────────
  if (customId === 'panel_business_collect') {
    await interaction.deferUpdate();
    const result = await businessService.collect(serverId, discordId);
    if (result.success) {
      const state = await businessService.getBusinessState(serverId, discordId);
      return interaction.editReply(renderBusinessHome(state.data));
    }
    return interaction.editReply(renderBusinessResult(result));
  }

  // ── panel_business_upgrade ────────────────
  if (customId === 'panel_business_upgrade') {
    await interaction.deferUpdate();
    const result = await businessService.upgrade(serverId, discordId);
    if (result.success) {
      const state = await businessService.getBusinessState(serverId, discordId);
      return interaction.editReply(renderBusinessHome(state.data));
    }
    return interaction.editReply(renderBusinessResult(result));
  }

  // ── panel_business_sell ───────────────────
  if (customId === 'panel_business_sell') {
    await interaction.deferUpdate();
    const result = await businessService.sell(serverId, discordId);
    if (result.success) {
      const state = await businessService.getBusinessState(serverId, discordId);
      return interaction.editReply(renderBusinessHome(state.data));
    }
    return interaction.editReply(renderBusinessResult(result));
  }

  // ── panel_business_raid ───────────────────
  if (customId === 'panel_business_raid') {
    await interaction.deferUpdate();
    const result = await businessService.raid(serverId, discordId);
    return interaction.editReply(renderBusinessResult(result));
  }

  console.warn('[businessPanel] Unhandled customId:', customId);
}

async function handleModal(interaction) {
  console.warn('[businessPanel] Unexpected modal:', interaction.customId);
}

async function handleSelect(interaction) {
  console.warn('[businessPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
