// ─────────────────────────────────────────────
//  travelPanel.js  —  Routes panel_travel_* interactions.
//  Rule: NO game logic. NO DB calls.
//  Defer → call service → render result.
// ─────────────────────────────────────────────

const travelService    = require('../services/travelService');
const playerRepository = require('../repositories/playerRepository');
const {
  renderTravelHome,
  renderTierPicker,
  renderTravelStartResult,
  renderTravelArriveResult,
  renderTravelBlocked,
} = require('./renderers/travelRenderer');
const embeds = require('../utils/embeds');
const { STATES } = require('../data/constants');

// ── Helpers ───────────────────────────────────

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId      = interaction.guildId;
  const discordId     = interaction.user.id;

  // ── panel_travel (root — show travel home) ──
  if (customId === 'panel_travel' || customId === 'panelm_travel') {
    await interaction.deferUpdate();

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }

    const blocked = travelService.checkBlocked(player);
    if (blocked) {
      const payload = renderTravelBlocked(blocked);
      return interaction.editReply(payload);
    }

    const premiumState = travelService.getPremiumUses(player);
    const payload = renderTravelHome(player, premiumState);
    return interaction.editReply(payload);
  }

  // ── panel_travel_arrive ────────────────────
  if (customId === 'panel_travel_arrive') {
    await interaction.deferUpdate();

    const result  = await travelService.resolve(serverId, discordId);
    const payload = renderTravelArriveResult(result);
    return interaction.editReply(payload);
  }

  // ── panel_travel_go_{tierId}_{destination} ─
  if (customId.startsWith('panel_travel_go_')) {
    await interaction.deferUpdate();

    const rest = customId.replace('panel_travel_go_', '');
    // tierId is always one of: hitchhike, standard, upgraded, premium (no underscores)
    const tierId = rest.split('_')[0];
    const destination = rest.slice(tierId.length + 1);

    const result  = await travelService.start(serverId, discordId, destination, tierId);
    const payload = renderTravelStartResult(result);
    return interaction.editReply(payload);
  }

  console.warn('[travelPanel] Unhandled customId:', customId);
}

// ── Select menu handler ────────────────────────

async function handleSelect(interaction) {
  const { customId } = interaction;
  const serverId      = interaction.guildId;
  const discordId     = interaction.user.id;

  // ── panel_travel_destination (StringSelectMenu) ──
  if (customId === 'panel_travel_destination') {
    await interaction.deferUpdate();

    const destination = interaction.values?.[0];
    if (!destination || !STATES.includes(destination)) {
      return safeFollowUp(interaction, { embeds: [embeds.error('Unknown destination.')] });
    }

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    }

    const blocked = travelService.checkBlocked(player);
    if (blocked) {
      const payload = renderTravelBlocked(blocked);
      return interaction.editReply(payload);
    }

    const premiumState = travelService.getPremiumUses(player);
    const payload = renderTierPicker(destination, player, premiumState);
    return interaction.editReply(payload);
  }

  console.warn('[travelPanel] Unexpected select:', customId);
}

// No modals in travel panel
async function handleModal(interaction) {
  console.warn('[travelPanel] Unexpected modal:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
