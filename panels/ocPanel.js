// ─────────────────────────────────────────────
//  ocPanel.js  —  Routes panel_oc_* interactions.
//  Rule: NO game logic. NO direct game-rule math.
//  Defer → call service → render result.
//
//  customId conventions:
//    panel_oc                            — hub
//    panel_oc_create_{ocTypeId}          — create lobby
//    panel_oc_lobby_{lobbyId}            — view lobby
//    panel_oc_refresh_{lobbyId}          — refresh lobby
//    panel_oc_join                       — join prompt
//    panel_oc_quickjoin_{lobbyId}        — one-click join from public embed
//    panel_oc_ready_{lobbyId}            — toggle ready
//    panel_oc_leave_{lobbyId}            — leave lobby
//    panel_oc_cancel_{lobbyId}           — leader cancel
//    panel_oc_kick_{lobbyId}_{targetId}  — leader kick
//    panel_oc_start_{lobbyId}            — leader start
//    panel_oc_post_{lobbyId}             — post public join embed to channel
//    panel_oc_dmcrew_{lobbyId}           — DM all crew members the join embed
//    modal_oc_join                       — open code entry modal
// ─────────────────────────────────────────────

const ocService        = require('../services/ocService');
const crewRepository   = require('../repositories/crewRepository');
const playerRepository = require('../repositories/playerRepository');
const {
  renderOcHub,
  renderLobbyCreated,
  renderPublicJoinEmbed,
  renderLobbyView,
  renderJoinPrompt,
  renderOcResult,
  renderOcError,
} = require('./renderers/ocRenderer');
const embeds = require('../utils/embeds');
const { OC_TYPES } = require('../data/constants');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  // ── panel_oc — hub ────────────────────────
  if (customId === 'panel_oc' || customId === 'panelm_oc') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    const cooldowns    = ocService.getOcCooldowns(player);
    const activeLobby  = await ocService.getOpenLobbyForPlayer(serverId, discordId);
    return interaction.editReply(renderOcHub(player, cooldowns, activeLobby));
  }

  // ── panel_oc_create_{ocTypeId} ────────────
  if (customId.startsWith('panel_oc_create_')) {
    const ocTypeId = customId.replace('panel_oc_create_', '');
    await interaction.deferUpdate();
    const result = await ocService.createLobby(serverId, discordId, ocTypeId);
    if (!result.success) return interaction.editReply(renderOcError(result.message));
    return interaction.editReply(renderLobbyCreated(result));
  }

  // ── panel_oc_post_{lobbyId} — post public join embed to channel ──
  if (customId.startsWith('panel_oc_post_')) {
    const lobbyId = customId.replace('panel_oc_post_', '');
    await interaction.deferUpdate();

    const lobby = await ocService.getLobby(serverId, lobbyId);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found.'));
    if (lobby.leaderId !== discordId) return interaction.editReply(renderOcError('Only the leader can post the link.'));

    const ocType     = OC_TYPES[lobby.ocTypeId];
    const player     = await playerRepository.getPlayer(serverId, discordId);
    const leaderName = player?.username ?? interaction.user.username;

    // Post the public embed to the same channel — NOT ephemeral
    await interaction.channel.send(renderPublicJoinEmbed(lobby, ocType, leaderName));

    // Confirm to the leader (update their ephemeral panel)
    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  // ── panel_oc_dmcrew_{lobbyId} — DM all crew members ──
  if (customId.startsWith('panel_oc_dmcrew_')) {
    const lobbyId = customId.replace('panel_oc_dmcrew_', '');
    await interaction.deferUpdate();

    const lobby = await ocService.getLobby(serverId, lobbyId);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found.'));
    if (lobby.leaderId !== discordId) return interaction.editReply(renderOcError('Only the leader can DM the crew.'));

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player?.crewId) {
      return interaction.editReply(renderOcError('You\'re not in a crew — use **Post Public Link** instead.'));
    }

    const crew = await crewRepository.getCrew(serverId, player.crewId);
    if (!crew) return interaction.editReply(renderOcError('Crew not found.'));

    const ocType     = OC_TYPES[lobby.ocTypeId];
    const leaderName = player?.username ?? interaction.user.username;
    const joinEmbed  = renderPublicJoinEmbed(lobby, ocType, leaderName);

    // DM every crew member except the leader
    const memberIds = Object.keys(crew.members ?? {}).filter(id => id !== discordId);
    let sent = 0;

    for (const memberId of memberIds) {
      try {
        const user = await interaction.client.users.fetch(memberId);
        await user.send({ ...joinEmbed, content: `**${leaderName}** is running an OC — join here:` });
        sent++;
      } catch {
        // Member has DMs closed — skip silently
      }
    }

    await safeFollowUp(interaction, {
      embeds: [embeds.base(embeds.COLOURS.success)
        .setTitle('📨 DMs Sent')
        .setDescription(`Sent the lobby link to **${sent}** crew member${sent !== 1 ? 's' : ''}.`)],
    });

    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  // ── panel_oc_quickjoin_{lobbyId} — one-click join from public embed ──
  if (customId.startsWith('panel_oc_quickjoin_')) {
    const lobbyId = customId.replace('panel_oc_quickjoin_', '');
    await interaction.deferUpdate();

    const result = await ocService.joinLobby(serverId, discordId, lobbyId);
    if (!result.success) return interaction.editReply(renderOcError(result.message));

    const lobby = await ocService.getLobby(serverId, lobbyId);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found after joining.'));

    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  // ── panel_oc_join — manual code entry prompt ──
  if (customId === 'panel_oc_join') {
    await interaction.deferUpdate();
    return interaction.editReply(renderJoinPrompt());
  }

  // ── modal_oc_join — open code modal (NO defer before showModal) ──
  if (customId === 'modal_oc_join') {
    const modal = new ModalBuilder()
      .setCustomId('modal_submit_oc_join')
      .setTitle('Join OC Lobby');

    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('oc_lobby_code')
        .setLabel('Lobby Code')
        .setStyle(TextInputStyle.Short)
        .setMinLength(6)
        .setMaxLength(20)
        .setPlaceholder('Paste the code from the leader')
        .setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  // ── panel_oc_lobby_{lobbyId} ──────────────
  if (customId.startsWith('panel_oc_lobby_')) {
    const lobbyId = customId.replace('panel_oc_lobby_', '');
    await interaction.deferUpdate();
    const lobby = await ocService.getLobby(serverId, lobbyId);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found.'));
    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  // ── panel_oc_refresh_{lobbyId} ───────────
  if (customId.startsWith('panel_oc_refresh_')) {
    const lobbyId = customId.replace('panel_oc_refresh_', '');
    await interaction.deferUpdate();
    const lobby = await ocService.getLobby(serverId, lobbyId);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found or expired.'));
    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  // ── panel_oc_ready_{lobbyId} ─────────────
  if (customId.startsWith('panel_oc_ready_')) {
    const lobbyId = customId.replace('panel_oc_ready_', '');
    await interaction.deferUpdate();
    const result = await ocService.readyUp(serverId, discordId, lobbyId);
    if (!result.success) return interaction.editReply(renderOcError(result.message));
    const lobby = await ocService.getLobby(serverId, lobbyId);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found.'));
    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  // ── panel_oc_leave_{lobbyId} ─────────────
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

  // ── panel_oc_kick_{lobbyId}_{targetId} ───
  if (customId.startsWith('panel_oc_kick_')) {
    const rest           = customId.replace('panel_oc_kick_', '');
    const lastUnderscore = rest.lastIndexOf('_');
    const lobbyId        = rest.slice(0, lastUnderscore);
    const targetId       = rest.slice(lastUnderscore + 1);
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

  if (customId === 'modal_submit_oc_join') {
    await interaction.deferUpdate();
    const code   = interaction.fields.getTextInputValue('oc_lobby_code').trim();
    const result = await ocService.joinLobby(serverId, discordId, code);
    if (!result.success) return interaction.editReply(renderOcError(result.message));
    const lobby = await ocService.getLobby(serverId, code);
    if (!lobby) return interaction.editReply(renderOcError('Lobby not found after joining.'));
    return interaction.editReply(renderLobbyView(lobby, discordId));
  }

  console.warn('[ocPanel] Unexpected modal:', customId);
}

async function handleSelect(interaction) {
  console.warn('[ocPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
