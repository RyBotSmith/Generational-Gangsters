// ─────────────────────────────────────────────
//  gtaPanel.js  —  Routes panel_gta_* interactions.
//  Rule: NO game logic. NO DB calls.
//  Defer → call service → render result.
// ─────────────────────────────────────────────

const gtaService       = require('../services/gtaService');
const crewRepository   = require('../repositories/crewRepository');
const playerRepository = require('../repositories/playerRepository');
const {
  renderGtaHome,
  renderGtaAttemptResult,
  renderGtaMelted,
  renderGtaSold,
} = require('./renderers/gtaRenderer');
const embeds = require('../utils/embeds');

// ── Helpers ───────────────────────────────────

async function getPlayerAndCrew(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { player: null, crew: null };
  const crew = player.crewId
    ? await crewRepository.getCrew(serverId, player.crewId)
    : null;
  return { player, crew };
}

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

// ── Cooldown state helper (pure read — no DB needed beyond player doc) ──

function buildCdState(player) {
  const lastUsed    = player.cooldowns?.gta ?? null;
  const cooldownMs  = 300 * 1000; // GTA_COOLDOWN from constants, hardcoded here to avoid import
  const nextMs      = lastUsed ? lastUsed + cooldownMs : 0;
  const remainingMs = Math.max(0, nextMs - Date.now());
  return { onCooldown: remainingMs > 0, cooldownRemainingMs: remainingMs, nextAvailableMs: nextMs };
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── panel_gta (root — show GTA home) ──────
  if (customId === 'panel_gta' || customId === 'panelm_gta') {
    await interaction.deferUpdate();
    const { player } = await getPlayerAndCrew(serverId, discordId);

    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }

    const cdState      = buildCdState(player);
    const unlockedCars = gtaService.getUnlockedCars(player);
    const payload      = renderGtaHome(cdState, unlockedCars);
    return interaction.editReply(payload);
  }

  // ── panel_gta_steal ───────────────────────
  if (customId === 'panel_gta_steal') {
    await interaction.deferUpdate();
    const { player, crew } = await getPlayerAndCrew(serverId, discordId);

    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    }

    const result  = await gtaService.attemptGTA(serverId, discordId, crew);
    const payload = renderGtaAttemptResult(result);
    return interaction.editReply(payload);
  }

  // ── panel_gta_melt_{carId} ────────────────
  if (customId.startsWith('panel_gta_melt_')) {
    const carId = customId.replace('panel_gta_melt_', '');
    await interaction.deferUpdate();

    const result  = await gtaService.meltCar(serverId, discordId, carId);
    const payload = result.success
      ? renderGtaMelted(result)
      : { embeds: [embeds.error(result.message)], components: [] };
    return interaction.editReply(payload);
  }

  // ── panel_gta_sell_{carId} ────────────────
  if (customId.startsWith('panel_gta_sell_')) {
    const carId = customId.replace('panel_gta_sell_', '');
    await interaction.deferUpdate();

    const result  = await gtaService.sellCar(serverId, discordId, carId);
    const payload = result.success
      ? renderGtaSold(result)
      : { embeds: [embeds.error(result.message)], components: [] };
    return interaction.editReply(payload);
  }

  console.warn('[gtaPanel] Unhandled customId:', customId);
}

async function handleModal(interaction) {
  console.warn('[gtaPanel] Unexpected modal:', interaction.customId);
}

async function handleSelect(interaction) {
  console.warn('[gtaPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
