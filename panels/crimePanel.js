// ─────────────────────────────────────────────
//  crimePanel.js  —  Routes panel_crime_* interactions.
//  Rule: NO game logic. NO DB calls.
//  Defer → call service → render result.
// ─────────────────────────────────────────────

const crimeService     = require('../services/crimeService');
const crewRepository   = require('../repositories/crewRepository');
const playerRepository = require('../repositories/playerRepository');
const { CRIMES, RANKS } = require('../data/constants');
const { getRankIndex }  = require('../utils/helpers');
const { renderCrimeList, renderCommitResult } = require('./renderers/crimeRenderer');
const embeds = require('../utils/embeds');
const { checkRankUp, dmRankUp } = require('../utils/dmService');

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

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId }  = interaction;
  const serverId      = interaction.guildId;
  const discordId     = interaction.user.id;

  // ── panel_crime (root — show crime list) ──
  if (customId === 'panel_crime' || customId === 'panelm_crime') {
    await interaction.deferUpdate();
    const { player } = await getPlayerAndCrew(serverId, discordId);

    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }

    const crimeList      = crimeService.getAllCrimes(player);
    const allCrimesDefs  = Object.values(CRIMES).sort((a, b) => a.rankRequired - b.rankRequired);
    const playerRankIndex = getRankIndex(player.xp ?? 0, RANKS);
    const payload        = renderCrimeList(crimeList, allCrimesDefs, playerRankIndex, player);
    return interaction.editReply(payload);
  }

  // ── panel_crime_commit — attempt all eligible crimes ──
  if (customId === 'panel_crime_commit') {
    await interaction.deferUpdate();
    const { player, crew } = await getPlayerAndCrew(serverId, discordId);

    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    }

    const oldXp       = player.xp ?? 0;
    const commitResult = await crimeService.commitAllCrimes(serverId, discordId, crew);

    // Check rank-up across all successful crimes in the batch
    const totalXpGained = (commitResult.results ?? [])
      .filter(r => r.success && r.data?.xpGained)
      .reduce((sum, r) => sum + r.data.xpGained, 0);

    if (totalXpGained > 0) {
      const newXp    = oldXp + totalXpGained;
      const rankedUp = checkRankUp(oldXp, newXp, RANKS);
      if (rankedUp) dmRankUp(interaction.client, discordId, rankedUp, newXp, RANKS);
    }

    const payload = renderCommitResult(commitResult);
    return interaction.editReply(payload);
  }

  console.warn('[crimePanel] Unhandled customId:', customId);
}

// No modals in crime panel
async function handleModal(interaction) {
  console.warn('[crimePanel] Unexpected modal:', interaction.customId);
}

// No select menus in crime panel
async function handleSelect(interaction) {
  console.warn('[crimePanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
