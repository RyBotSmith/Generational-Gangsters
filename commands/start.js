// ─────────────────────────────────────────────
//  commands/start.js  —  /start slash command.
//  Rule: Parse options → call service → done.
//  NO game logic. NO embed building.
//
//  IMPORTANT: showModal() must be called BEFORE any defer/reply.
//  /start either shows the creation modal immediately, or — if the
//  player already exists — replies with a plain (non-modal) message.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const startService = require('../services/startService');
const {
  renderAlreadyStarted,
  buildCreateCharacterModal,
} = require('../panels/renderers/startRenderer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('Create your character and begin your criminal career'),

  async execute(interaction) {
    const serverId  = interaction.guildId;
    const discordId = interaction.user.id;

    // ── Already started? — quick read before showing the modal ──
    const already = await startService.hasStarted(serverId, discordId);

    if (already) {
      const payload = renderAlreadyStarted();
      return interaction.reply(payload);
    }

    // ── Show creation modal — MUST happen before any defer/reply ──
    const modal = buildCreateCharacterModal();
    return interaction.showModal(modal);
  },
};
