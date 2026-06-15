// ─────────────────────────────────────────────
//  crewPanel.js  —  Routes panel_crew_* interactions.
//  Rule: NO game logic. NO direct game-rule math.
//  Defer → call service → render result.
//
//  Scope: solo passive crew system only (no invite/join/leave/roles).
//  /crew create itself is handled in commands/crew.js — this panel
//  handles the crew home view, hiring thugs, and collecting thug income.
// ─────────────────────────────────────────────

const crewService      = require('../services/crewService');
const crewRepository   = require('../repositories/crewRepository');
const playerRepository = require('../repositories/playerRepository');
const {
  renderNoCrew,
  renderCrewHome,
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

  // ── panel_crew (root — show crew home, auto-process thugs) ──
  if (customId === 'panel_crew' || customId === 'panelm_crew') {
    await interaction.deferUpdate();

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }

    if (!player.crewId) {
      const payload = renderNoCrew(player);
      return interaction.editReply(payload);
    }

    // Auto-process (no collect) so pending amounts reflect elapsed time.
    const processResult = await crewService.processThugs(serverId, discordId, { collect: false });
    const crew = processResult.data?.crew ?? await crewRepository.getCrew(serverId, player.crewId);

    if (!crew) {
      const payload = renderNoCrew(player);
      return interaction.editReply(payload);
    }

    const income  = crewService.getThugIncome(crew);
    const payload = renderCrewHome(crew, income);
    return interaction.editReply(payload);
  }

  // ── panel_crew_hire ────────────────────────
  if (customId === 'panel_crew_hire') {
    await interaction.deferUpdate();

    const result  = await crewService.hireThug(serverId, discordId);
    const payload = renderHireResult(result);
    return interaction.editReply(payload);
  }

  // ── panel_crew_collect ─────────────────────
  if (customId === 'panel_crew_collect') {
    await interaction.deferUpdate();

    const result  = await crewService.processThugs(serverId, discordId, { collect: true });
    const payload = renderCollectResult(result);
    return interaction.editReply(payload);
  }

  console.warn('[crewPanel] Unhandled customId:', customId);
}

// No modals in crew panel (creation handled via /crew create command, not modal)
async function handleModal(interaction) {
  console.warn('[crewPanel] Unexpected modal:', interaction.customId);
}

// No select menus in crew panel
async function handleSelect(interaction) {
  console.warn('[crewPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
