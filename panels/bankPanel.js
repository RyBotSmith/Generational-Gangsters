// ─────────────────────────────────────────────
//  bankPanel.js  —  Routes panel_bank_* interactions.
//  Rule: NO game logic. NO DB calls beyond repository.
//  Modals MUST be shown before any defer.
// ─────────────────────────────────────────────

const bankService      = require('../services/bankService');
const playerRepository = require('../repositories/playerRepository');
const {
  renderBankHome,
  renderTransferSelect,
  renderBankResult,
  customModal,
  transferAmountModal,
} = require('./renderers/bankRenderer');
const embeds = require('../utils/embeds');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

async function handle(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── panel_bank (root) ─────────────────────
  if (customId === 'panel_bank' || customId === 'panelm_bank') {
    await interaction.deferUpdate();
    const player    = await playerRepository.getPlayer(serverId, discordId);
    if (!player) return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    const bankLimit = bankService.getBankLimit(player);
    return interaction.editReply(renderBankHome(player, bankLimit));
  }

  // ── panel_bank_custom — show modal ────────
  // Modal MUST fire before any defer
  if (customId === 'panel_bank_custom') {
    return interaction.showModal(customModal());
  }

  // ── panel_bank_withdraw_{amount} ──────────
  if (customId.startsWith('panel_bank_withdraw_') && customId !== 'panel_bank_withdraw_all') {
    const amount = parseInt(customId.replace('panel_bank_withdraw_', ''), 10);
    await interaction.deferUpdate();
    const result = await bankService.withdraw(serverId, discordId, amount);
    if (result.success) {
      // Refresh bank home
      const player = await playerRepository.getPlayer(serverId, discordId);
      return interaction.editReply(renderBankHome(player, bankService.getBankLimit(player)));
    }
    return interaction.editReply(renderBankResult(result));
  }

  // ── panel_bank_withdraw_all ───────────────
  if (customId === 'panel_bank_withdraw_all') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    const result = await bankService.withdraw(serverId, discordId, player.bank ?? 0);
    if (result.success) {
      const fresh = await playerRepository.getPlayer(serverId, discordId);
      return interaction.editReply(renderBankHome(fresh, bankService.getBankLimit(fresh)));
    }
    return interaction.editReply(renderBankResult(result));
  }

  // ── panel_bank_deposit_{amount} ───────────
  if (customId.startsWith('panel_bank_deposit_') && customId !== 'panel_bank_deposit_all') {
    const amount = parseInt(customId.replace('panel_bank_deposit_', ''), 10);
    await interaction.deferUpdate();
    const result = await bankService.deposit(serverId, discordId, amount);
    if (result.success) {
      const player = await playerRepository.getPlayer(serverId, discordId);
      return interaction.editReply(renderBankHome(player, bankService.getBankLimit(player)));
    }
    return interaction.editReply(renderBankResult(result));
  }

  // ── panel_bank_deposit_all ────────────────
  if (customId === 'panel_bank_deposit_all') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    const result = await bankService.deposit(serverId, discordId, player.cash ?? 0);
    if (result.success) {
      const fresh = await playerRepository.getPlayer(serverId, discordId);
      return interaction.editReply(renderBankHome(fresh, bankService.getBankLimit(fresh)));
    }
    return interaction.editReply(renderBankResult(result));
  }

  // ── panel_bank_transfer — show player list ─
  if (customId === 'panel_bank_transfer') {
    await interaction.deferUpdate();
    const player      = await playerRepository.getPlayer(serverId, discordId);
    const allPlayers  = await playerRepository.getLeaderboard(serverId, 'xp', 25);
    const alivePlayers = allPlayers.filter(p => p.discordId !== discordId && p.alive !== false);
    if (alivePlayers.length === 0) {
      return interaction.editReply(renderBankResult({
        success: false,
        message: 'No other alive players found to transfer to.',
      }));
    }
    return interaction.editReply(renderTransferSelect(alivePlayers, player.cash ?? 0));
  }

  console.warn('[bankPanel] Unhandled customId:', customId);
}

// ── Select handler ────────────────────────────

async function handleSelect(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── select_bank_transfer_target ───────────
  // Show modal to enter amount — must fire before defer
  if (customId === 'select_bank_transfer_target') {
    const targetId = interaction.values[0];
    const allPlayers = await playerRepository.getLeaderboard(serverId, 'xp', 25);
    const target   = allPlayers.find(p => p.discordId === targetId);
    const targetName = displayName(target) !== 'Unknown' ? displayName(target) : targetId;
    return interaction.showModal(transferAmountModal(targetId, targetName));
  }

  console.warn('[bankPanel] Unexpected select:', customId);
}

// ── Modal handler ─────────────────────────────

async function handleModal(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── modal_bank_custom ─────────────────────
  if (customId === 'modal_bank_custom') {
    const action = interaction.fields.getTextInputValue('action').trim().toLowerCase();
    const amount = parseInt(interaction.fields.getTextInputValue('amount').replace(/[^0-9]/g, ''), 10);
    await interaction.deferUpdate();

    let result;
    if (action === 'withdraw') {
      result = await bankService.withdraw(serverId, discordId, amount);
    } else if (action === 'deposit') {
      result = await bankService.deposit(serverId, discordId, amount);
    } else {
      result = { success: false, message: 'Type **deposit** or **withdraw**.' };
    }

    if (result.success) {
      const player = await playerRepository.getPlayer(serverId, discordId);
      return interaction.editReply(renderBankHome(player, bankService.getBankLimit(player)));
    }
    return interaction.editReply(renderBankResult(result));
  }

  // ── modal_bank_transfer_{targetId} ────────
  if (customId.startsWith('modal_bank_transfer_')) {
    const targetId = customId.replace('modal_bank_transfer_', '');
    const amount   = parseInt(interaction.fields.getTextInputValue('amount').replace(/[^0-9]/g, ''), 10);
    await interaction.deferUpdate();
    const result = await bankService.transfer(serverId, discordId, targetId, amount);
    return interaction.editReply(renderBankResult(result));
  }

  console.warn('[bankPanel] Unexpected modal:', customId);
}

module.exports = { handle, handleModal, handleSelect };
