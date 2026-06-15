// ─────────────────────────────────────────────
//  homePanel.js  —  Routes panel_home / panelm_home interactions.
//  Rule: NO game logic. NO DB calls beyond a single player read.
//  Defer → read player → render home.
// ─────────────────────────────────────────────

const playerRepository = require('../repositories/playerRepository');
const { renderHome } = require('./renderers/homeRenderer');
const embeds = require('../utils/embeds');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  // ── panel_home / panelm_home — show home dashboard ──
  if (customId === 'panel_home' || customId === 'panelm_home') {
    await interaction.deferUpdate();

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }

    return interaction.editReply(renderHome(player));
  }

  console.warn('[homePanel] Unhandled customId:', customId);
}

// No modals in home panel
async function handleModal(interaction) {
  console.warn('[homePanel] Unexpected modal:', interaction.customId);
}

// No select menus in home panel
async function handleSelect(interaction) {
  console.warn('[homePanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
