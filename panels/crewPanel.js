// ─────────────────────────────────────────────
//  crewPanel.js  —  Routes panel_crew_* interactions.
//  Rule: NO game logic. NO direct game-rule math.
//  Defer → call service → render result.
//
//  customId conventions:
//    panel_crew                    — crew home (or no-crew)
//    panel_crew_hire               — hire next thug slot
//    panel_crew_collect            — collect thug income
//    panel_crew_upgrades           — view upgrades
//    panel_crew_upgrade_{id}       — buy an upgrade
//    panel_crew_kick               — show kick select menu
//    panel_crew_leave              — show leave confirmation
//    panel_crew_leave_confirm      — confirmed leave
//    modal_crew_create             — open create modal
//    modal_crew_join               — open join modal
//    modal_crew_deposit            — open deposit modal
//    modal_crew_withdraw           — open withdraw modal
//    select_crew_kick              — kick selected member
// ─────────────────────────────────────────────

const crewService      = require('../services/crewService');
const crewRepository   = require('../repositories/crewRepository');
const playerRepository = require('../repositories/playerRepository');
const {
  renderNoCrew,
  renderCrewHome,
  renderCrewUpgrades,
  renderKickPanel,
  renderLeaveConfirm,
  renderCrewCreateResult,
  renderCrewJoinResult,
  renderHireResult,
  renderCollectResult,
  renderUpgradeResult,
  renderDepositResult,
  renderWithdrawResult,
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

    const processResult = await crewService.processThugs(serverId, discordId, { collect: false });
    const crew = processResult.data?.crew ?? await crewRepository.getCrew(serverId, player.crewId);
    if (!crew) return interaction.editReply(renderNoCrew(player));

    const income = crewService.getThugIncome(crew);
    return interaction.editReply(renderCrewHome(crew, income, player));
  }

  // ── panel_crew_hire ───────────────────────
  if (customId === 'panel_crew_hire') {
    await interaction.deferUpdate();
    const result = await crewService.hireThug(serverId, discordId);
    return interaction.editReply(renderHireResult(result));
  }

  // ── panel_crew_collect ────────────────────
  if (customId === 'panel_crew_collect') {
    await interaction.deferUpdate();
    const result = await crewService.processThugs(serverId, discordId, { collect: true });
    return interaction.editReply(renderCollectResult(result));
  }

  // ── panel_crew_upgrades ───────────────────
  if (customId === 'panel_crew_upgrades') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player?.crewId) return safeFollowUp(interaction, { embeds: [embeds.error('You need a crew to view upgrades.')] });
    const crew = await crewRepository.getCrew(serverId, player.crewId);
    if (!crew) return safeFollowUp(interaction, { embeds: [embeds.error('Crew not found.')] });
    return interaction.editReply(renderCrewUpgrades(crew, player.cash ?? 0));
  }

  // ── panel_crew_upgrade_{upgradeId} ───────
  if (customId.startsWith('panel_crew_upgrade_')) {
    const upgradeId = customId.replace('panel_crew_upgrade_', '');
    await interaction.deferUpdate();
    const result = await crewService.purchaseUpgrade(serverId, discordId, upgradeId);
    return interaction.editReply(renderUpgradeResult(result));
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

  // ── panel_crew_leave — show confirmation ──
  if (customId === 'panel_crew_leave') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player?.crewId) return safeFollowUp(interaction, { embeds: [embeds.error('You\'re not in a crew.')] });
    const crew = await crewRepository.getCrew(serverId, player.crewId);
    if (!crew) return safeFollowUp(interaction, { embeds: [embeds.error('Crew not found.')] });
    return interaction.editReply(renderLeaveConfirm(crew));
  }

  // ── panel_crew_leave_confirm — do leave ───
  if (customId === 'panel_crew_leave_confirm') {
    await interaction.deferUpdate();
    const result = await crewService.leaveCrew(serverId, discordId);
    return interaction.editReply(renderLeaveResult(result));
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
        .setLabel('Crew Name')
        .setStyle(TextInputStyle.Short)
        .setMinLength(3).setMaxLength(32)
        .setPlaceholder('Exact crew name')
        .setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  if (customId === 'modal_crew_deposit') {
    const modal = new ModalBuilder().setCustomId('modal_submit_crew_deposit').setTitle('Deposit to Vault');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Amount to deposit ($)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 5000')
        .setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  if (customId === 'modal_crew_withdraw') {
    const modal = new ModalBuilder().setCustomId('modal_submit_crew_withdraw').setTitle('Withdraw from Vault');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Amount to withdraw ($)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 5000')
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

  if (customId === 'modal_submit_crew_deposit') {
    await interaction.deferUpdate();
    const raw    = interaction.fields.getTextInputValue('amount').replace(/[,$\s]/g, '');
    const amount = parseInt(raw, 10);
    const result = await crewService.depositVault(serverId, discordId, amount);
    return interaction.editReply(renderDepositResult(result));
  }

  if (customId === 'modal_submit_crew_withdraw') {
    await interaction.deferUpdate();
    const raw    = interaction.fields.getTextInputValue('amount').replace(/[,$\s]/g, '');
    const amount = parseInt(raw, 10);
    const result = await crewService.withdrawVault(serverId, discordId, amount);
    return interaction.editReply(renderWithdrawResult(result));
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
