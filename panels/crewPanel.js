// ─────────────────────────────────────────────
//  crewPanel.js  —  Routes panel_crew_* interactions.
//  Rule: NO game logic. NO direct game-rule math.
//  Defer → call service → render result.
//
//  UPDATED: Added crew upgrades route (panel_crew_upgrades, panel_crew_upgrade_{id})
// ─────────────────────────────────────────────

const crewService      = require('../services/crewService');
const crewRepository   = require('../repositories/crewRepository');
const playerRepository = require('../repositories/playerRepository');
const {
  renderNoCrew,
  renderCrewHome,
  renderCrewUpgrades,
  renderUpgradeResult,
  renderHireResult,
  renderCollectResult,
} = require('./renderers/crewRenderer');
const embeds = require('../utils/embeds');

// ── Helpers ───────────────────────────────────

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId      = interaction.guildId;
  const discordId     = interaction.user.id;

  // ── panel_crew (root — show crew home) ────
  if (customId === 'panel_crew' || customId === 'panelm_crew') {
    await interaction.deferUpdate();

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }

    if (!player.crewId) {
      return interaction.editReply(renderNoCrew(player));
    }

    const processResult = await crewService.processThugs(serverId, discordId, { collect: false });
    const crew = processResult.data?.crew ?? await crewRepository.getCrew(serverId, player.crewId);

    if (!crew) {
      return interaction.editReply(renderNoCrew(player));
    }

    const income  = crewService.getThugIncome(crew);
    return interaction.editReply(renderCrewHome(crew, income));
  }

  // ── panel_crew_hire ────────────────────────
  if (customId === 'panel_crew_hire') {
    await interaction.deferUpdate();
    const result = await crewService.hireThug(serverId, discordId);
    return interaction.editReply(renderHireResult(result));
  }

  // ── panel_crew_collect ─────────────────────
  if (customId === 'panel_crew_collect') {
    await interaction.deferUpdate();
    const result = await crewService.processThugs(serverId, discordId, { collect: true });
    return interaction.editReply(renderCollectResult(result));
  }

  // ── panel_crew_upgrades — show upgrades ────
  if (customId === 'panel_crew_upgrades') {
    await interaction.deferUpdate();

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player?.crewId) {
      return safeFollowUp(interaction, { embeds: [embeds.error('You need a crew to view upgrades.')] });
    }

    const crew = await crewRepository.getCrew(serverId, player.crewId);
    if (!crew) {
      return safeFollowUp(interaction, { embeds: [embeds.error('Crew not found.')] });
    }

    return interaction.editReply(renderCrewUpgrades(crew, player.cash ?? 0));
  }

  // ── panel_crew_upgrade_{upgradeId} — buy upgrade ──
  if (customId.startsWith('panel_crew_upgrade_')) {
    const upgradeId = customId.replace('panel_crew_upgrade_', '');
    await interaction.deferUpdate();

    const result = await crewService.purchaseUpgrade(serverId, discordId, upgradeId);
    return interaction.editReply(renderUpgradeResult(result));
  }

  console.warn('[crewPanel] Unhandled customId:', customId);
}

async function handleModal(interaction) {
  console.warn('[crewPanel] Unexpected modal:', interaction.customId);
}

async function handleSelect(interaction) {
  console.warn('[crewPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
