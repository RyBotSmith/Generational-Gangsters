// ─────────────────────────────────────────────
//  commands/crime.js  —  /crime slash command.
//  Rule: Parse options → call service → done.
//  NO game logic. NO embed building.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const crimeService   = require('../services/crimeService');
const crewRepository = require('../repositories/crewRepository');
const playerRepository = require('../repositories/playerRepository');
const { renderCrimeList, renderCrimeResult } = require('../panels/renderers/crimeRenderer');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crime')
    .setDescription('Open the crime panel or commit a specific crime.')
    .addStringOption(opt =>
      opt
        .setName('type')
        .setDescription('Crime to commit (leave blank to browse)')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  /**
   * Autocomplete — suggest unlocked crimes for this player.
   */
  async autocomplete(interaction) {
    const serverId  = interaction.guildId;
    const discordId = interaction.user.id;
    const focused   = interaction.options.getFocused().toLowerCase();

    try {
      const player = await playerRepository.getPlayer(serverId, discordId);
      if (!player) return interaction.respond([]);

      const choices = crimeService.getAllCrimes(player)
        .filter(({ crime }) => crime.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(({ crime, onCooldown }) => ({
          name: `${crime.name}${onCooldown ? ' (cooldown)' : ''}`,
          value: crime.id,
        }));

      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
  },

  /**
   * Execute — open panel or attempt a specific crime.
   */
  async execute(interaction) {
    const serverId  = interaction.guildId;
    const discordId = interaction.user.id;
    const crimeId   = interaction.options.getString('type');

    await interaction.deferReply({ ephemeral: true });

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return interaction.editReply({
        embeds: [embeds.error('No player found. Use /start to create your character.')],
      });
    }

    // No argument — show crime list panel
    if (!crimeId) {
      const crimeList = crimeService.getAllCrimes(player);
      return interaction.editReply(renderCrimeList(crimeList));
    }

    // Specific crime — attempt it
    const crew = player.crewId
      ? await crewRepository.getCrew(serverId, player.crewId)
      : null;

    const result  = await crimeService.attemptCrime(serverId, discordId, crimeId, crew);
    return interaction.editReply(renderCrimeResult(result));
  },
};
