// ─────────────────────────────────────────────
//  ocPanel.js  —  Routes panel_oc_* interactions.
//  Rule: NO game logic. NO direct game-rule math.
//  Defer → call service → render result.
//
//  customId conventions:
//    panel_oc                          — OC hub (mission picker)
//    panel_oc_create_{ocTypeId}        — create lobby for that type
//    panel_oc_lobby_{lobbyId}          — view a specific lobby
//    panel_oc_refresh_{lobbyId}        — re-render lobby (poll)
//    panel_oc_join                     — show join prompt
//    panel_oc_ready_{lobbyId}          — toggle ready
//    panel_oc_leave_{lobbyId}          — non-leader leave
//    panel_oc_cancel_{lobbyId}         — leader cancel
//    panel_oc_kick_{lobbyId}_{targetId} — leader kick member
//    panel_oc_start_{lobbyId}          — leader start OC
//    modal_oc_join                     — open "enter code" modal
// ─────────────────────────────────────────────

const ocService        = require('../services/ocService');
const playerRepository = require('../repositories/playerRepository');
const {
  renderOcHub,
  renderLobbyView,
  renderJoinPrompt,
  renderLobbyCreated,
  renderOcResult,
  renderOcError,
} = require('./renderers/ocRenderer');
const embeds = require('../utils/embeds');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

// ── Helpers ───────────────────────────────────

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  // ── panel_oc — OC hub ─────────────────────
  if (customId === 'panel_oc' || customId === 'panelm_oc') {
    await interaction.deferUpdate();

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }

    const cooldowns = ocService.getOcCooldowns(player);
    return interaction.editReply(renderOcHub(player, cooldowns));
  }

  // ── panel_oc_create_{ocTypeId} ────────────
  if (customId.startsWith('panel_oc_create_')) {
    const ocTypeId = customId.replace('panel_oc_create_', '');
    await interaction.deferUpdate();

    const result = await ocService.createLobby(serverId, discordId, ocTypeId);

    if (!result.success) {
      return interaction.editReply(renderOcError(result.message));
    }

    return interaction.editReply(renderLobbyCreated(result));
  }

  // ── panel_oc_join — show join prompt ──────
  if (customId === 'panel_oc_join') {
    await interaction.deferUpdate();
    return interaction.editReply(renderJoinPrompt());
  }

  // ── modal_oc_join — open the code input modal ──
  // NOTE: showModal must NOT be preceded by deferUpdate/deferReply.
  if (customId === 'modal_oc_join') {
    const modal = new ModalBuilder()
      .setCustomId('modal_submit_oc_join')
      .setTitle('Join OC Lobby');

    const codeInput = new TextInputBuilder()
      .setCustomId('oc_lobby_code')
      .setLabel('Lobby Code')
      .setStyle(TextInputStyle.Short)
      .setMinLength(6)
      .setMaxLength(20)
      .setPlaceholder('Enter the code from the lobby leader')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
    return interaction.showModal(modal);
  }

  // ── panel_oc_lobby_{lobbyId} — view lobby ─
  if (customId.startsWith('panel_oc_lobby_')) {
    const lobbyId = customId.replace('panel_oc_lobby_', '');
    await interaction.deferUpdate();

    const lobby = await ocService.getLobby(serverId, lobbyId);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found.'));

    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  // ── panel_oc_refresh_{lobbyId} ────────────
  if (customId.startsWith('panel_oc_refresh_')) {
    const lobbyId = customId.replace('panel_oc_refresh_', '');
    await interaction.deferUpdate();

    const lobby = await ocService.getLobby(serverId, lobbyId);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found or expired.'));

    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  // ── panel_oc_ready_{lobbyId} ──────────────
  if (customId.startsWith('panel_oc_ready_')) {
    const lobbyId = customId.replace('panel_oc_ready_', '');
    await interaction.deferUpdate();

    const result = await ocService.readyUp(serverId, discordId, lobbyId);
    if (!result.success) return interaction.editReply(renderOcError(result.message));

    // Re-fetch and re-render lobby
    const lobby = await ocService.getLobby(serverId, lobbyId);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found.'));

    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  // ── panel_oc_leave_{lobbyId} ──────────────
  if (customId.startsWith('panel_oc_leave_')) {
    const lobbyId = customId.replace('panel_oc_leave_', '');
    await interaction.deferUpdate();

    const result = await ocService.leaveLobby(serverId, discordId, lobbyId);
    if (!result.success) return interaction.editReply(renderOcError(result.message));

    const player    = await playerRepository.getPlayer(serverId, discordId);
    const cooldowns = ocService.getOcCooldowns(player);
    return interaction.editReply(renderOcHub(player, cooldowns));
  }

  // ── panel_oc_cancel_{lobbyId} ────────────
  if (customId.startsWith('panel_oc_cancel_')) {
    const lobbyId = customId.replace('panel_oc_cancel_', '');
    await interaction.deferUpdate();

    const result = await ocService.cancelLobby(serverId, discordId, lobbyId);
    if (!result.success) return interaction.editReply(renderOcError(result.message));

    const player    = await playerRepository.getPlayer(serverId, discordId);
    const cooldowns = ocService.getOcCooldowns(player);
    return interaction.editReply(renderOcHub(player, cooldowns));
  }

  // ── panel_oc_kick_{lobbyId}_{targetId} ────
  if (customId.startsWith('panel_oc_kick_')) {
    const rest     = customId.replace('panel_oc_kick_', '');
    // lobbyId has no underscores (alphanumeric), targetId is a Discord snowflake
    // Format: {lobbyId}_{targetId}  — split on last underscore-delimited segment that looks like a snowflake
    const lastUnderscore = rest.lastIndexOf('_');
    const lobbyId  = rest.slice(0, lastUnderscore);
    const targetId = rest.slice(lastUnderscore + 1);

    await interaction.deferUpdate();

    const result = await ocService.kickMember(serverId, discordId, lobbyId, targetId);
    if (!result.success) return interaction.editReply(renderOcError(result.message));

    const lobby = await ocService.getLobby(serverId, lobbyId);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found.'));

    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  // ── panel_oc_start_{lobbyId} ─────────────
  if (customId.startsWith('panel_oc_start_')) {
    const lobbyId = customId.replace('panel_oc_start_', '');
    await interaction.deferUpdate();

    const result = await ocService.startOC(serverId, discordId, lobbyId);
    return interaction.editReply(renderOcResult(result));
  }

  console.warn('[ocPanel] Unhandled customId:', customId);
}

// ── Modal handler ─────────────────────────────

async function handleModal(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  // ── modal_submit_oc_join — player entered lobby code ──
  if (customId === 'modal_submit_oc_join') {
    await interaction.deferUpdate();

    const code = interaction.fields.getTextInputValue('oc_lobby_code').trim();
    const result = await ocService.joinLobby(serverId, discordId, code);

    if (!result.success) {
      return interaction.editReply(renderOcError(result.message));
    }

    const lobby = await ocService.getLobby(serverId, code);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found after joining.'));

    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  console.warn('[ocPanel] Unexpected modal:', customId);
}

// No select menus in OC panel
async function handleSelect(interaction) {
  console.warn('[ocPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
