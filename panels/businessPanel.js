// ─────────────────────────────────────────────
//  businessPanel.js  —  Routes panel_business_* interactions.
//  Rule: NO game logic. NO direct DB calls beyond simple reads
//  needed for routing/display.
//  Defer → call service → render result.
//
//  KEY BUG NOTE: "back" buttons on business screens use
//  panel_back_state (handled by state/navigation panel), NOT
//  panel_state — that customId is reserved for travel/state nav.
// ─────────────────────────────────────────────

const businessService  = require('../services/businessService');
const playerRepository = require('../repositories/playerRepository');
const businessRepository = require('../repositories/businessRepository');
const {
  renderBusinessList,
  renderBusinessManage,
  renderBusinessResult,
  renderRaidResult,
} = require('./renderers/businessRenderer');
const embeds = require('../utils/embeds');

// ── Helpers ───────────────────────────────────

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

async function loadOwnedSlot(serverId, player) {
  if (!player.businessId) return null;
  const slot = await businessRepository.getSlot(serverId, player.businessId);
  if (!slot) return null;
  // Re-use businessService's enrichment via getAllSlotsView, but that's a
  // full scan — for a single slot we can enrich inline by re-fetching the
  // view list and filtering. Simpler: call getBusinessesInState on the
  // slot's own state.
  const slots = await businessService.getBusinessesInState(serverId, slot.state);
  return slots.find(s => s.businessId === slot.businessId) ?? null;
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId      = interaction.guildId;
  const discordId     = interaction.user.id;

  // ── panel_business (root — list slots in current state) ──
  if (customId === 'panel_business' || customId === 'panelm_business') {
    await interaction.deferUpdate();

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }

    const slots   = await businessService.getBusinessesInState(serverId, player.state);
    const payload = renderBusinessList(slots, player);
    return interaction.editReply(payload);
  }

  // ── panel_business_manage (owner's slot) ──
  if (customId === 'panel_business_manage') {
    await interaction.deferUpdate();

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    }

    if (!player.businessId) {
      return safeFollowUp(interaction, { embeds: [embeds.error('You don\'t own a business.')] });
    }

    const slot = await loadOwnedSlot(serverId, player);
    if (!slot) {
      return safeFollowUp(interaction, { embeds: [embeds.error('Your business could not be found.')] });
    }

    const payload = renderBusinessManage(slot);
    return interaction.editReply(payload);
  }

  // ── panel_business_claim_{typeId} ─────────
  if (customId.startsWith('panel_business_claim_')) {
    const typeId = customId.replace('panel_business_claim_', '');
    await interaction.deferUpdate();

    const result  = await businessService.claim(serverId, discordId, typeId);
    const payload = renderBusinessResult(result);
    return interaction.editReply(payload);
  }

  // ── panel_business_collect ────────────────
  if (customId === 'panel_business_collect') {
    await interaction.deferUpdate();

    const result  = await businessService.collect(serverId, discordId);
    const payload = renderBusinessResult(result);
    return interaction.editReply(payload);
  }

  // ── panel_business_upgrade ────────────────
  if (customId === 'panel_business_upgrade') {
    await interaction.deferUpdate();

    const result  = await businessService.upgrade(serverId, discordId);
    const payload = renderBusinessResult(result);
    return interaction.editReply(payload);
  }

  // ── panel_business_sell ───────────────────
  if (customId === 'panel_business_sell') {
    await interaction.deferUpdate();

    const result  = await businessService.sell(serverId, discordId);
    const payload = renderBusinessResult(result);
    return interaction.editReply(payload);
  }

  // ── panel_business_raid_{businessId} ──────
  if (customId.startsWith('panel_business_raid_')) {
    const businessId = customId.replace('panel_business_raid_', '');
    await interaction.deferUpdate();

    const result  = await businessService.raid(serverId, discordId, businessId);
    const payload = renderRaidResult(result);
    return interaction.editReply(payload);
  }

  // ── panel_business_view_{typeId} (disabled button — no-op) ──
  if (customId.startsWith('panel_business_view_')) {
    return; // disabled button, should never fire
  }

  console.warn('[businessPanel] Unhandled customId:', customId);
}

// No modals in business panel
async function handleModal(interaction) {
  console.warn('[businessPanel] Unexpected modal:', interaction.customId);
}

// No select menus in business panel
async function handleSelect(interaction) {
  console.warn('[businessPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
