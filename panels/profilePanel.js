// ─────────────────────────────────────────────
//  profilePanel.js  —  Routes panel_home + panel_profile.
//  Rule: NO game logic. NO DB calls except via repository.
// ─────────────────────────────────────────────

const playerRepository = require('../repositories/playerRepository');
const { renderHome }   = require('./renderers/homeRenderer');
const embeds           = require('../utils/embeds');

async function handle(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  if (customId === 'panel_home' || customId === 'panelm_home' ||
      customId === 'panel_profile' || customId === 'panelm_profile') {
    await interaction.deferUpdate();

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return interaction.editReply({
        embeds: [embeds.error('No player found. Use /start to create your character.')],
        components: [],
      });
    }

    const payload = renderHome(player);
    return interaction.editReply(payload);
  }

  console.warn('[profilePanel] Unhandled customId:', customId);
}

async function handleModal(interaction) {
  console.warn('[profilePanel] Unexpected modal:', interaction.customId);
}

module.exports = { handle, handleModal };
