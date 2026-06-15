// ─────────────────────────────────────────────
//  startPanel.js  —  Routes panel_start_* / modal_start_* interactions.
//  Rule: NO game logic. NO DB calls.
//  Defer → call service → render result.
//
//  IMPORTANT: modal_start_create is intercepted by the router BEFORE
//  any deferUpdate/deferReply (see index.js MODAL_ROUTES). The modal
//  submission itself is deferred here via deferReply, since creating
//  a character is a DB write.
//
//  panel_start_create (button) must call showModal() directly —
//  it must NOT be preceded by deferUpdate.
// ─────────────────────────────────────────────

const startService = require('../services/startService');
const {
  buildCreateCharacterModal,
  renderCreateResult,
} = require('./renderers/startRenderer');
const embeds = require('../utils/embeds');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

// ── Button handler ─────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;

  // ── panel_start_create — re-open the creation modal ──
  // MUST showModal() directly, no defer beforehand.
  if (customId === 'panel_start_create') {
    const modal = buildCreateCharacterModal();
    return interaction.showModal(modal);
  }

  console.warn('[startPanel] Unhandled customId:', customId);
}

// ── Modal handler ───────────────────────────────
// Intercepted in index.js BEFORE any defer is called anywhere in the pipeline.

async function handleModal(interaction) {
  const { customId } = interaction;

  if (customId === 'modal_start_create') {
    await interaction.deferReply({ ephemeral: true });

    const serverId  = interaction.guildId;
    const discordId = interaction.user.id;
    const username  = interaction.user.username;

    const characterName = interaction.fields.getTextInputValue('characterName');
    const sex            = interaction.fields.getTextInputValue('sex');

    const result = await startService.createCharacter(serverId, discordId, username, characterName, sex);
    return interaction.editReply(renderCreateResult(result));
  }

  console.warn('[startPanel] Unhandled modal:', customId);
}

// No select menus in start panel
async function handleSelect(interaction) {
  console.warn('[startPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
