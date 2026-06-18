// ─────────────────────────────────────────────
//  bankRenderer.js  —  Embed builders for bank.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds     = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');

// ── Bank home ─────────────────────────────────

/**
 * Render the bank home panel.
 */
function renderBankHome(player, bankLimit) {
  const cash = player.cash ?? 0;
  const bank = player.bank ?? 0;

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🏦 Bank')
    .addFields(
      { name: '💰 Cash',       value: formatCash(cash), inline: true },
      { name: '🏦 Bank',       value: formatCash(bank), inline: true },
      { name: '📊 Vault Limit', value: formatCash(bankLimit), inline: true },
    )
    .setDescription('What would you like to do?');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_bank_deposit')
      .setLabel('⬇️ Deposit')
      .setStyle(ButtonStyle.Success)
      .setDisabled(cash <= 0),
    new ButtonBuilder()
      .setCustomId('panel_bank_withdraw')
      .setLabel('⬆️ Withdraw')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(bank <= 0),
    new ButtonBuilder()
      .setCustomId('panel_bank_transfer')
      .setLabel('💸 Transfer')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(cash <= 0),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Result renderers ──────────────────────────

function renderBankResult(result) {
  const embed = result.success
    ? embeds.success('Bank', result.message)
    : embeds.failure('Bank', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_bank')
      .setLabel('🏦 Bank')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Modals ────────────────────────────────────

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder: AR } = require('discord.js');

function depositModal() {
  return new ModalBuilder()
    .setCustomId('modal_bank_deposit')
    .setTitle('Deposit Cash')
    .addComponents(
      new AR().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount to deposit')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 50000')
          .setRequired(true)
      )
    );
}

function withdrawModal() {
  return new ModalBuilder()
    .setCustomId('modal_bank_withdraw')
    .setTitle('Withdraw Cash')
    .addComponents(
      new AR().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount to withdraw')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 50000')
          .setRequired(true)
      )
    );
}

function transferModal() {
  return new ModalBuilder()
    .setCustomId('modal_bank_transfer')
    .setTitle('Transfer Cash')
    .addComponents(
      new AR().addComponents(
        new TextInputBuilder()
          .setCustomId('target')
          .setLabel('Discord ID of recipient')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 123456789012345678')
          .setRequired(true)
      ),
      new AR().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount to transfer (+ 5% fee)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 10000')
          .setRequired(true)
      )
    );
}

module.exports = {
  renderBankHome,
  renderBankResult,
  depositModal,
  withdrawModal,
  transferModal,
};
