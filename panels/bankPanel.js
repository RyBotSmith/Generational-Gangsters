// ─────────────────────────────────────────────
//  bankPanel.js  —  Routes panel_bank_* interactions.
//  Rule: NO game logic. NO DB calls beyond repository.
//  Modals MUST be shown before deferUpdate.
// ─────────────────────────────────────────────

const bankService      = require('../services/bankService');
const playerRepository = require('../repositories/playerRepository');
const {
  renderBankHome,
  renderBankResult,
  depositModal,
  withdrawModal,
  transferModal,
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

  // ── panel_bank_deposit — show modal ───────
  // Modal must be shown BEFORE any defer
  if (customId === 'panel_bank_deposit') {
    return interaction.showModal(depositModal());
  }

  // ── panel_bank_withdraw — show modal ──────
  if (customId === 'panel_bank_withdraw') {
    return interaction.showModal(withdrawModal());
  }

  // ── panel_bank_transfer — show modal ──────
  if (customId === 'panel_bank_transfer') {
    return interaction.showModal(transferModal());
  }

  console.warn('[bankPanel] Unhandled customId:', customId);
}

async function handleModal(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── modal_bank_deposit ────────────────────
  if (customId === 'modal_bank_deposit') {
    const raw    = interaction.fields.getTextInputValue('amount');
    const amount = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    await interaction.deferReply({ ephemeral: true });
    const result = await bankService.deposit(serverId, discordId, amount);
    return interaction.editReply(renderBankResult(result));
  }

  // ── modal_bank_withdraw ───────────────────
  if (customId === 'modal_bank_withdraw') {
    const raw    = interaction.fields.getTextInputValue('amount');
    const amount = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    await interaction.deferReply({ ephemeral: true });
    const result = await bankService.withdraw(serverId, discordId, amount);
    return interaction.editReply(renderBankResult(result));
  }

  // ── modal_bank_transfer ───────────────────
  if (customId === 'modal_bank_transfer') {
    const targetId = interaction.fields.getTextInputValue('target').trim();
    const raw      = interaction.fields.getTextInputValue('amount');
    const amount   = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    await interaction.deferReply({ ephemeral: true });
    const result = await bankService.transfer(serverId, discordId, targetId, amount);
    return interaction.editReply(renderBankResult(result));
  }

  console.warn('[bankPanel] Unexpected modal:', customId);
}

async function handleSelect(interaction) {
  console.warn('[bankPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
