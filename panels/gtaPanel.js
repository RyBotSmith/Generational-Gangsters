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
  renderGtaStored,
  renderGarageHome,
  renderGarageCarView,
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
  const { GTA_COOLDOWN, UPGRADES } = require('../data/constants');
  const upgradeLevel  = player?.upgrades?.gta_cooldown ?? 0;
  const upgradeReduce = upgradeLevel * (UPGRADES.gta_cooldown?.valuePerLevel ?? 30) * 1000;
  const prestige4Mult = player?.prestige4Perk === 'cooldown' ? 0.80 : 1.0;
  const cooldownMs    = Math.max(60000, Math.floor((GTA_COOLDOWN * 1000 - upgradeReduce) * prestige4Mult));
  const lastUsed      = player.cooldowns?.gta ?? null;
  const nextMs        = lastUsed ? lastUsed + cooldownMs : 0;
  const remainingMs   = Math.max(0, nextMs - Date.now());
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
    const garageData   = gtaService.getGarage(player);
    const payload      = renderGtaHome(cdState, unlockedCars, garageData);
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

  // ── panel_gta_store_{carId} ───────────────
  if (customId.startsWith('panel_gta_store_')) {
    const carId = customId.replace('panel_gta_store_', '');
    await interaction.deferUpdate();
    const result  = await gtaService.storeCar(serverId, discordId, carId);
    const payload = result.success
      ? renderGtaStored(result)
      : { embeds: [embeds.error(result.message)], components: [] };
    return interaction.editReply(payload);
  }

  // ── panel_gta_melt_{carId} ────────────────
  if (customId.startsWith('panel_gta_melt_') && !customId.startsWith('panel_gta_melt_all') && !customId.includes('garage')) {
    const carId = customId.replace('panel_gta_melt_', '');
    await interaction.deferUpdate();
    const result  = await gtaService.meltCar(serverId, discordId, carId, false);
    const payload = result.success
      ? renderGtaMelted(result)
      : { embeds: [embeds.error(result.message)], components: [] };
    return interaction.editReply(payload);
  }

  // ── panel_gta_sell_{carId} ────────────────
  if (customId.startsWith('panel_gta_sell_') && !customId.startsWith('panel_gta_sell_all') && !customId.includes('garage')) {
    const carId = customId.replace('panel_gta_sell_', '');
    await interaction.deferUpdate();
    const result  = await gtaService.sellCar(serverId, discordId, carId, false);
    const payload = result.success
      ? renderGtaSold(result)
      : { embeds: [embeds.error(result.message)], components: [] };
    return interaction.editReply(payload);
  }

  // ── panel_gta_garage — show garage ────────
  if (customId === 'panel_gta_garage') {
    await interaction.deferUpdate();
    const { player } = await getPlayerAndCrew(serverId, discordId);
    if (!player) return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    const garageData = gtaService.getGarage(player);
    return interaction.editReply(renderGarageHome(garageData));
  }

  // ── panel_gta_melt_all ────────────────────
  if (customId === 'panel_gta_melt_all') {
    await interaction.deferUpdate();
    const result = await gtaService.meltAll(serverId, discordId);
    return interaction.editReply(renderGtaMelted(result));
  }

  // ── panel_gta_sell_all ────────────────────
  if (customId === 'panel_gta_sell_all') {
    await interaction.deferUpdate();
    const result = await gtaService.sellAll(serverId, discordId);
    return interaction.editReply(renderGtaSold(result));
  }

  // ── panel_gta_garage_melt_{carId}_{index} ─
  if (customId.startsWith('panel_gta_garage_melt_')) {
    const rest  = customId.replace('panel_gta_garage_melt_', '');
    const parts = rest.split('_');
    const index = parseInt(parts[parts.length - 1]);
    const carId = parts.slice(0, parts.length - 1).join('_');
    await interaction.deferUpdate();
    const result = await gtaService.meltCar(serverId, discordId, carId, true);
    if (!result.success) {
      return interaction.editReply({ embeds: [embeds.error(result.message)], components: [] });
    }
    return interaction.editReply(renderGtaMelted(result));
  }

  // ── panel_gta_garage_sell_{carId}_{index} ─
  if (customId.startsWith('panel_gta_garage_sell_')) {
    const rest  = customId.replace('panel_gta_garage_sell_', '');
    const parts = rest.split('_');
    const index = parseInt(parts[parts.length - 1]);
    const carId = parts.slice(0, parts.length - 1).join('_');
    await interaction.deferUpdate();
    const result = await gtaService.sellCar(serverId, discordId, carId, true);
    if (!result.success) {
      return interaction.editReply({ embeds: [embeds.error(result.message)], components: [] });
    }
    return interaction.editReply(renderGtaSold(result));
  }

  console.warn('[gtaPanel] Unhandled customId:', customId);
}

async function handleModal(interaction) {
  console.warn('[gtaPanel] Unexpected modal:', interaction.customId);
}

async function handleSelect(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── select_garage_car — view a specific car ──
  if (customId === 'select_garage_car') {
    await interaction.deferUpdate();
    const value  = interaction.values[0]; // garage_car:{carId}:{index}
    const parts  = value.replace('garage_car:', '').split(':');
    const carId  = parts[0];
    const index  = parseInt(parts[1]);
    const { CARS } = require('../data/constants');
    const car    = CARS[carId];
    if (!car) return interaction.editReply({ embeds: [embeds.error('Car not found.')], components: [] });
    return interaction.editReply(renderGarageCarView(car, index));
  }

  console.warn('[gtaPanel] Unexpected select:', customId);
}

module.exports = { handle, handleModal, handleSelect };
