// ─────────────────────────────────────────────
//  commands/crew.js  —  /crew slash command.
//  Rule: Parse options → call service → done.
//  NO game logic. NO embed building.
//
//  Scope (this session): create only. No invite/join/leave/disband.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const crewService      = require('../services/crewService');
const playerRepository = require('../repositories/playerRepository');
const {
  renderCrewCreateResult,
  renderCrewHome,
  renderNoCrew,
} = require('../panels/renderers/crewRenderer');
const crewRepository = require('../repositories/crewRepository');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crew')
    .setDescription('Manage your crew.')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Found a new crew.')
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('Name for your crew (3-32 characters)')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const serverId  = interaction.guildId;
    const discordId = interaction.user.id;
    const sub       = interaction.options.getSubcommand();

    await interaction.deferReply({ ephemeral: true });

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return interaction.editReply({
        embeds: [embeds.error('No player found. Use /start to create your character.')],
      });
    }

    if (sub === 'create') {
      const name = interaction.options.getString('name');
      const leaderName = interaction.user.username;

      const result = await crewService.create(serverId, discordId, leaderName, name);
      return interaction.editReply(renderCrewCreateResult(result));
    }

    return interaction.editReply({ embeds: [embeds.error('Unknown subcommand.')] });
  },
};
