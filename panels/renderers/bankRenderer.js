// ─────────────────────────────────────────────
//  bankRenderer.js  —  Embed builders for bank.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');
const embeds     = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');

const PRESETS = [1000, 5000, 10000, 25000, 50000];

// ── Bank home ─────────────────────────────────

function renderBankHome(player, bankLimit) {
  const cash = player.cash ?? 0;
  const bank = player.bank ?? 0;

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🏦 Bank')
    .addFields(
      { name: '💰 Cash',        value: formatCash(cash),      inline: true },
      { name: '🏦 Bank',        value: formatCash(bank),      inline: true },
      { name: '📊 Vault Limit', value: formatCash(bankLimit), inline: true },
    );

  // Row 1: Withdraw presets (green)
  const row1 = new ActionRowBuilder().addComponents(
    ...PRESETS.map(amount =>
      new ButtonBuilder()
        .setCustomId(`panel_bank_withdraw_${amount}`)
        .setLabel(`-$${amount >= 1000 ? `${amount / 1000}k` : amount}`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(bank < amount)
    )
  );

  // Row 2: Deposit presets (red)
  const row2 = new ActionRowBuilder().addComponents(
    ...PRESETS.map(amount =>
      new ButtonBuilder()
        .setCustomId(`panel_bank_deposit_${amount}`)
        .setLabel(`+$${amount >= 1000 ? `${amount / 1000}k` : amount}`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(cash < amount)
    )
  );

  // Row 3: Bulk + transfer + custom + home
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_bank_withdraw_all')
      .setLabel('💚 Withdraw All')
      .setStyle(ButtonStyle.Success)
      .setDisabled(bank <= 0),
    new ButtonBuilder()
      .setCustomId('panel_bank_deposit_all')
      .setLabel('❤️ Deposit All')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(cash <= 0),
    new ButtonBuilder()
      .setCustomId('panel_bank_transfer')
      .setLabel('💸 Transfer')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(cash <= 0),
    new ButtonBuilder()
      .setCustomId('panel_bank_custom')
      .setLabel('✏️ Custom')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

// ── Transfer player select ────────────────────

function renderTransferSelect(alivePlayers, playerCash) {
  const options = alivePlayers.slice(0, 25).map(p => ({
    label: p.username ?? p.discordId,
    value: p.discordId,
  }));

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('💸 Transfer')
    .setDescription(
      `💰 **Your cash:** ${formatCash(playerCash)}\n\nSelect a player to transfer to.`
    );

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_bank_transfer_target')
      .setPlaceholder('Choose a player...')
      .addOptions(options)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_bank')
      .setLabel('⬅ Bank')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Result panel ──────────────────────────────

function renderBankResult(result) {
  const embed = result.success
    ? embeds.success('Bank', result.message)
    : embeds.failure('Bank', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_bank')
      .setLabel('⬅ Bank')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Modals ────────────────────────────────────

function customModal() {
  return new ModalBuilder()
    .setCustomId('modal_bank_custom')
    .setTitle('Custom Amount')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('action')
          .setLabel('Action (deposit or withdraw)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('deposit')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 75000')
          .setRequired(true)
      )
    );
}

function transferAmountModal(targetId, targetName) {
  return new ModalBuilder()
    .setCustomId(`modal_bank_transfer_${targetId}`)
    .setTitle(`Transfer to ${targetName}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
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
  renderTransferSelect,
  renderBankResult,
  customModal,
  transferAmountModal,
};
