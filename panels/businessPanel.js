// ─────────────────────────────────────────────
//  businessPanel.js  —  Routes panel_business_* interactions.
//  Rule: NO game logic. NO DB calls beyond repository.
//  Defer → call service → render result.
// ─────────────────────────────────────────────

const businessService = require('../services/businessService');
const playerRepository = require('../repositories/playerRepository');
const { BUSINESS_TYPES } = require('../data/constants');
const {
  renderBusinessHome,
  renderLegalPanel,
  renderIllegalPanel,
  renderBusinessResult,
} = require('./renderers/businessRenderer');
const embeds     = require('../utils/embeds');
const dmService  = require('../utils/dmService');
const { BUSINESS_RAIDS_TO_LOSE } = require('../data/constants');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

// ── Helper — get state slot filtered by category ──

async function getStateSlotForCategory(serverId, playerState, category) {
  const allSlots = await businessService.getAllSlots(serverId);
  return allSlots.find(s => s.state === playerState && BUSINESS_TYPES[s.typeId]?.category === category) ?? null;
}

async function handle(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── panel_business (root — how it works) ──
  if (customId === 'panel_business' || customId === 'panelm_business') {
    await interaction.deferUpdate();
    await businessService.initSlots(serverId);
    return interaction.editReply(renderBusinessHome());
  }

  // ── panel_business_legal ──────────────────
  if (customId === 'panel_business_legal') {
    await interaction.deferUpdate();
    const result = await businessService.getBusinessState(serverId, discordId);
    if (!result.success) return safeFollowUp(interaction, { embeds: [embeds.error(result.message)] });
    const { player, stateSlot } = result.data;
    const legalSlot = stateSlot?.typeId && BUSINESS_TYPES[stateSlot.typeId]?.category === 'legal' ? stateSlot : null;
    return interaction.editReply(renderLegalPanel(player, legalSlot));
  }

  // ── panel_business_illegal ────────────────
  if (customId === 'panel_business_illegal') {
    await interaction.deferUpdate();
    const result = await businessService.getBusinessState(serverId, discordId);
    if (!result.success) return safeFollowUp(interaction, { embeds: [embeds.error(result.message)] });
    const { player, stateSlot } = result.data;
    const illegalSlot = stateSlot?.typeId && BUSINESS_TYPES[stateSlot.typeId]?.category === 'illegal' ? stateSlot : null;
    return interaction.editReply(renderIllegalPanel(player, illegalSlot));
  }

  // ── panel_business_claim ──────────────────
  if (customId === 'panel_business_claim') {
    await interaction.deferUpdate();
    const result = await businessService.claim(serverId, discordId);
    if (result.success) {
      const state = await businessService.getBusinessState(serverId, discordId);
      const { player, stateSlot } = state.data;
      const type = BUSINESS_TYPES[stateSlot?.typeId];
      if (type?.category === 'legal') return interaction.editReply(renderLegalPanel(player, stateSlot));
      return interaction.editReply(renderIllegalPanel(player, stateSlot));
    }
    return interaction.editReply(renderBusinessResult(result));
  }

  // ── panel_business_collect ────────────────
  if (customId === 'panel_business_collect') {
    await interaction.deferUpdate();
    const result = await businessService.collect(serverId, discordId);
    return interaction.editReply(renderBusinessResult(result));
  }

  // ── panel_business_upgrade ────────────────
  if (customId === 'panel_business_upgrade') {
    await interaction.deferUpdate();
    const result = await businessService.upgrade(serverId, discordId);
    if (result.success) {
      const state = await businessService.getBusinessState(serverId, discordId);
      const { player, stateSlot } = state.data;
      const type = BUSINESS_TYPES[stateSlot?.typeId];
      if (type?.category === 'legal') return interaction.editReply(renderLegalPanel(player, stateSlot));
      return interaction.editReply(renderIllegalPanel(player, stateSlot));
    }
    return interaction.editReply(renderBusinessResult(result));
  }

  // ── panel_business_sell ───────────────────
  if (customId === 'panel_business_sell') {
    await interaction.deferUpdate();
    const result = await businessService.sell(serverId, discordId);
    return interaction.editReply(renderBusinessResult(result));
  }

  // ── panel_business_raid ───────────────────
  if (customId === 'panel_business_raid') {
    await interaction.deferUpdate();

    // Fetch raider + pre-raid slot BEFORE calling raid() so we have
    // the owner ID even if they get evicted (slot.ownerId → null after eviction).
    const raider     = await playerRepository.getPlayer(serverId, discordId);
    const allSlots   = await businessService.getAllSlots(serverId);
    const preRaidSlot = allSlots.find(s => s.state === raider?.state) ?? null;
    const ownerId    = preRaidSlot?.ownerId ?? null;

    const result = await businessService.raid(serverId, discordId);

    // ── DM the business owner ─────────────
    if (result.success && result.data?.raidSuccess && ownerId) {
      const { BUSINESS_TYPES: BT } = require('../data/constants');
      dmService.dmRaid(interaction.client, ownerId, {
        raiderName:        raider ? (raider.characterName ?? raider.username) : 'Someone',
        businessName:      BT[preRaidSlot?.typeId]?.name ?? 'your business',
        pendingStolen:     result.data.pendingStolen ?? 0,
        newRaidCount:      result.data.newRaidCount ?? 1,
        ownerEvicted:      result.data.ownerEvicted ?? false,
        newRaidCountNeeded: BUSINESS_RAIDS_TO_LOSE,
      }); // fire-and-forget
    }

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
