// ─────────────────────────────────────────────
//  commands/gadmin.js  —  /gadmin slash command.
//  Opens the admin panel. Restricted to ADMIN_ROLE_ID.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const { renderAdminHub }      = require('../panels/renderers/adminRenderer');

const ADMIN_ROLE_ID = '1515717429282471946';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gadmin')
    .setDescription('Open the admin panel (staff only).'),

  async execute(interaction) {
    // ── Role gate ────────────────────────────
    const hasRole = interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID);
    if (!hasRole) {
      return interaction.reply({
        content: '🚫 You do not have permission to use this command.',
        ephemeral: true,
      });
    }

    return interaction.reply({
      ...renderAdminHub(),
      ephemeral: true,
    });
  },
};
