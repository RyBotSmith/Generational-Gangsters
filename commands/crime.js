// ─────────────────────────────────────────────
//  commands/crime.js  —  /crime slash command.
//  Rule: Parse options → call service → done.
//  NO game logic. NO embed building.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const crimeService     = require('../services/crimeService');
const crewRepository   = require('../repositories/crewRepository');
const playerRepository = require('../repositories/playerRepository');
const { CRIMES, RANKS } = require('../data/constants');
const { getRankIndex }  = require('../utils/helpers');
const { renderCrimeList, renderCommitResult } = require('../panels/renderers/crimeRenderer');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crime')
    .setDescription('Open the crime panel.'),

  async execute(interaction) {
    const serverId  = interaction.guildId;
    const discordId = interaction.user.id;

    await interaction.deferReply({ ephemeral: true });

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return interaction.editReply({
        embeds: [embeds.error('No player found. Use /start to create your character.')],
      });
    }

    const crimeList      = crimeService.getAllCrimes(player);
    const allCrimesDefs  = Object.values(CRIMES).sort((a, b) => a.rankRequired - b.rankRequired);
    const playerRankIndex = getRankIndex(player.xp ?? 0, RANKS);

    return interaction.editReply(renderCrimeList(crimeList, allCrimesDefs, playerRankIndex));
  },
};
