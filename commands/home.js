// ─────────────────────────────────────────────
//  commands/home.js  —  /home slash command.
//  Opens the home dashboard panel.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const playerRepository = require('../repositories/playerRepository');
const { renderHome }   = require('../panels/renderers/homeRenderer');
const embeds           = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('home')
    .setDescription('Open your home dashboard.'),

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

    return interaction.editReply(renderHome(player));
  },
};
