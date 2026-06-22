// ─────────────────────────────────────────────
//  commands/gadmin.js  —  /gadmin slash command.
//  Fetches all server players and shows the player select screen.
//  Restricted to ADMIN_ROLE_ID.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const playerRepository = require('../repositories/playerRepository');
const { renderPlayerSelect } = require('../panels/renderers/adminRenderer');

const ADMIN_ROLE_ID = '1515717429282471946';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gadmin')
    .setDescription('Open the admin panel (staff only).')
    .setDefaultMemberPermissions(0),

  async execute(interaction) {
    if (!interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID)) {
      return interaction.reply({
        content: '🚫 You do not have permission to use this command.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const serverId = interaction.guildId;
    const all = await playerRepository.getAllPlayers(serverId);
    const sorted = all
      .filter(p => p.characterName || p.username)
      .sort((a, b) =>
        (a.characterName ?? a.username ?? '').localeCompare(b.characterName ?? b.username ?? '')
      );

    return interaction.editReply(renderPlayerSelect(sorted));
  },
};
