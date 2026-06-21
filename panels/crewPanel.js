// ─────────────────────────────────────────────
//  crewPanel.js  —  Routes panel_crew_* interactions.
//  Rule: NO game logic. NO direct game-rule math.
//  Defer → call service → render result.
//
//  Crew is a social grouping system only.
//
//  customId conventions:
//    panel_crew              — crew home (or no-crew screen)
//    panel_crew_kick         — show kick select menu
//    panel_crew_leave        — show leave confirmation
//    panel_crew_leave_confirm — confirmed leave
//    modal_crew_create       — open create modal (no defer)
//    modal_crew_join         — open join modal (no defer)
//    select_crew_kick        — kick selected member
// ─────────────────────────────────────────────

const crewService      = require('../services/crewService');
const crewRepository   = require('../repositories/crewRepository');
const playerRepository = require('../repositories/playerRepository');
const {
  renderNoCrew,
  renderCrewHome,
  renderKickPanel,
  renderDisbandConfirm,
  renderLeaveConfirm,
  renderCrewCreateResult,
  renderCrewJoinResult,
  renderLeaveResult,
  renderKickResult,
} = require('./renderers/crewRenderer');
const embeds = require('../utils/embeds');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  // ── panel_crew — home ─────────────────────
  if (customId === 'panel_crew' || customId === 'panelm_crew') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    if (!player.crewId) return interaction.editReply(renderNoCrew(player));
    const crew = await crewRepository.getCrew(serverId, player.crewId);
    if (!crew) return interaction.editReply(renderNoCrew(player));
    return interaction.editReply(renderCrewHome(crew, player));
  }

  // ── panel_crew_kick — show kick menu ──────
  if (customId === 'panel_crew_kick') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player?.crewId) return safeFollowUp(interaction, { embeds: [embeds.error('You need a crew.')] });
    const crew = await crewRepository.getCrew(serverId, player.crewId);
    if (!crew) return safeFollowUp(interaction, { embeds: [embeds.error('Crew not found.')] });
    if (crew.leaderId !== discordId) return safeFollowUp(interaction, { embeds: [embeds.error('Only the leader can kick members.')] });
    return interaction.editReply(renderKickPanel(crew));
  }

  // ── panel_crew_leave — confirmation ───────
  if (customId === 'panel_crew_leave') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player?.crewId) return safeFollowUp(interaction, { embeds: [embeds.error('You are not in a crew.')] });
    const crew = await crewRepository.getCrew(serverId, player.crewId);
    if (!crew) return safeFollowUp(interaction, { embeds: [embeds.error('Crew not found.')] });
    return interaction.editReply(renderLeaveConfirm(crew));
  }

  // ── panel_crew_leave_confirm ──────────────
  if (customId === 'panel_crew_leave_confirm') {
    await interaction.deferUpdate();
    const result = await crewService.leaveCrew(serverId, discordId);
    return interaction.editReply(renderLeaveResult(result));
  }

  // ── panel_crew_disband — confirmation ────
  if (customId === 'panel_crew_disband') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player?.crewId) return safeFollowUp(interaction, { embeds: [embeds.error('You are not in a crew.')] });
    const crew = await crewRepository.getCrew(serverId, player.crewId);
    if (!crew) return safeFollowUp(interaction, { embeds: [embeds.error('Crew not found.')] });
    if (crew.leaderId !== discordId) return safeFollowUp(interaction, { embeds: [embeds.error('Only the leader can disband the crew.')] });
    return interaction.editReply(renderDisbandConfirm(crew));
  }

  // ── panel_crew_disband_confirm ────────────
  if (customId === 'panel_crew_disband_confirm') {
    await interaction.deferUpdate();
    const result = await crewService.disbandCrew(serverId, discordId);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
    );
    if (!result.success) return interaction.editReply({ embeds: [embeds.failure('Disband', result.message)], components: [row] });
    return interaction.editReply({ embeds: [embeds.success('Crew Disbanded', result.message)], components: [row] });
  }

  // ── Modal openers — NO defer before showModal ──

  if (customId === 'modal_crew_create') {
    const modal = new ModalBuilder().setCustomId('modal_submit_crew_create').setTitle('Create a Crew');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('crew_name')
        .setLabel('Crew Name (3–32 characters)')
        .setStyle(TextInputStyle.Short)
        .setMinLength(3).setMaxLength(32)
        .setPlaceholder('e.g. The Outfit')
        .setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  if (customId === 'modal_crew_join') {
    const modal = new ModalBuilder().setCustomId('modal_submit_crew_join').setTitle('Join a Crew');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('crew_name')
        .setLabel('Crew Name (exact)')
        .setStyle(TextInputStyle.Short)
        .setMinLength(3).setMaxLength(32)
        .setPlaceholder('e.g. The Outfit')
        .setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  console.warn('[crewPanel] Unhandled customId:', customId);
}

// ── Modal submissions ─────────────────────────

async function handleModal(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  if (customId === 'modal_submit_crew_create') {
    await interaction.deferUpdate();
    const name   = interaction.fields.getTextInputValue('crew_name').trim();
    const player = await playerRepository.getPlayer(serverId, discordId);
    const result = await crewService.create(serverId, discordId, player?.username ?? interaction.user.username, name);
    return interaction.editReply(renderCrewCreateResult(result));
  }

  if (customId === 'modal_submit_crew_join') {
    await interaction.deferUpdate();
    const name   = interaction.fields.getTextInputValue('crew_name').trim();
    const result = await crewService.joinCrew(serverId, discordId, name);
    return interaction.editReply(renderCrewJoinResult(result));
  }

  console.warn('[crewPanel] Unexpected modal:', customId);
}

// ── Select menus ──────────────────────────────

async function handleSelect(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  if (customId === 'select_crew_kick') {
    await interaction.deferUpdate();
    const targetId = interaction.values[0];
    const result   = await crewService.kickMember(serverId, discordId, targetId);
    return interaction.editReply(renderKickResult(result));
  }

  console.warn('[crewPanel] Unexpected select:', customId);
}

module.exports = { handle, handleModal, handleSelect };
