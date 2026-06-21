// ─────────────────────────────────────────────
//  gamblingPanel.js  —  Routes panel_gamble_* interactions.
//  Rule: NO game logic. NO direct DB calls.
//  Defer → call service → render result.
//
//  customId conventions:
//    panel_gamble                — hub
//    panel_gamble_coinflip       — coin flip prompt
//    panel_gamble_number         — number guess prompt
//    panel_gamble_dice           — dice roll prompt
//    panel_gamble_slots          — slots prompt
//    panel_gamble_blackjack      — blackjack prompt / resume check
//    panel_gamble_bj_resume      — re-render active hand
//    panel_gamble_bj_hit         — hit
//    panel_gamble_bj_stand       — stand
//    panel_gamble_bj_forfeit     — forfeit active hand
//
//  Modal submissions (intercepted in router BEFORE defer):
//    modal_gamble_coinflip       — opens coin flip bet modal
//    modal_gamble_number         — opens number guess modal
//    modal_gamble_dice           — opens dice roll modal
//    modal_gamble_slots          — opens slots bet modal
//    modal_gamble_blackjack      — opens blackjack deal modal
//    modal_submit_gamble_*       — modal submitted, call service
// ─────────────────────────────────────────────

const gamblingService  = require('../services/gamblingService');
const playerRepository = require('../repositories/playerRepository');
const {
  renderGambleHub,
  renderCoinFlipPrompt,
  renderNumberPrompt,
  renderDicePrompt,
  renderSlotsPrompt,
  renderBlackjackPrompt,
  renderGameResult,
} = require('./renderers/gamblingRenderer');
const embeds = require('../utils/embeds');
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { GAMBLE_MIN_BET, GAMBLE_MAX_BET, GAMBLE_NUMBER_MAX } = require('../data/constants');

// ── Helpers ───────────────────────────────────

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

function parseBet(raw) {
  const cleaned = String(raw ?? '').replace(/[,$\s]/g, '');
  const val = parseInt(cleaned, 10);
  return isNaN(val) ? NaN : val;
}

// ── Modal builders ────────────────────────────

function betModal(customId, title, extraFields = []) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const betInput = new TextInputBuilder()
    .setCustomId('bet_amount')
    .setLabel(`Bet amount ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 1000')
    .setRequired(true);

  const rows = [new ActionRowBuilder().addComponents(betInput), ...extraFields];
  modal.addComponents(...rows);
  return modal;
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  // ── panel_gamble — hub ────────────────────
  if (customId === 'panel_gamble' || customId === 'panelm_gamble') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }
    return interaction.editReply(renderGambleHub(player));
  }

  // ── Game prompts ──────────────────────────
  if (customId === 'panel_gamble_coinflip') {
    await interaction.deferUpdate();
    return interaction.editReply(renderCoinFlipPrompt());
  }

  if (customId === 'panel_gamble_number') {
    await interaction.deferUpdate();
    return interaction.editReply(renderNumberPrompt());
  }

  if (customId === 'panel_gamble_dice') {
    await interaction.deferUpdate();
    return interaction.editReply(renderDicePrompt());
  }

  if (customId === 'panel_gamble_slots') {
    await interaction.deferUpdate();
    return interaction.editReply(renderSlotsPrompt());
  }

  if (customId === 'panel_gamble_blackjack') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    const hasActive = !!player?.blackjackState;
    return interaction.editReply(renderBlackjackPrompt(hasActive));
  }

  // ── Blackjack action buttons ──────────────
  if (customId === 'panel_gamble_bj_resume') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player?.blackjackState) {
      return interaction.editReply(renderBlackjackPrompt(false));
    }
    // Re-render the deal state
    const state = player.blackjackState;
    const fakeResult = {
      success: true,
      message: 'Resume your hand.',
      data: {
        game:        'blackjack',
        phase:       'deal',
        playerHand:  state.playerHand,
        dealerHand:  [state.dealerHand[0], { rank: '?', suit: '?', display: '??' }],
        playerValue: require('../services/gamblingService').handValue
          ? null // handValue is internal — re-derive in renderer via hand display
          : null,
        bet: state.bet,
      },
    };
    // Simplest approach: just call hit with no card (re-render current state via deal render path)
    const { handValue } = require('../services/gamblingService');
    fakeResult.data.playerValue = state.playerHand.reduce((sum, c) => {
      const vals = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':10,'Q':10,'K':10,'A':11 };
      return sum + (vals[c.rank] ?? 0);
    }, 0);
    return interaction.editReply(renderGameResult(fakeResult));
  }

  if (customId === 'panel_gamble_bj_hit') {
    await interaction.deferUpdate();
    const result = await gamblingService.blackjackHit(serverId, discordId);
    return interaction.editReply(renderGameResult(result));
  }

  if (customId === 'panel_gamble_bj_stand') {
    await interaction.deferUpdate();
    const result = await gamblingService.blackjackStand(serverId, discordId);
    return interaction.editReply(renderGameResult(result));
  }

  if (customId === 'panel_gamble_bj_forfeit') {
    await interaction.deferUpdate();
    const result = await gamblingService.blackjackForfeit(serverId, discordId);
    return interaction.editReply(renderGameResult(result));
  }

  // ── Modal openers — NO defer before showModal ──
  if (customId === 'modal_gamble_coinflip') {
    const modal = new ModalBuilder()
      .setCustomId('modal_submit_gamble_coinflip')
      .setTitle('Coin Flip');

    const choiceInput = new TextInputBuilder()
      .setCustomId('choice')
      .setLabel('heads or tails')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('heads')
      .setRequired(true);

    const betInput = new TextInputBuilder()
      .setCustomId('bet_amount')
      .setLabel(`Bet ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1000')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(choiceInput),
      new ActionRowBuilder().addComponents(betInput)
    );
    return interaction.showModal(modal);
  }

  if (customId === 'modal_gamble_number') {
    const modal = new ModalBuilder()
      .setCustomId('modal_submit_gamble_number')
      .setTitle('Number Guess');

    const guessInput = new TextInputBuilder()
      .setCustomId('guess')
      .setLabel(`Your number (1–${GAMBLE_NUMBER_MAX})`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('420')
      .setRequired(true);

    const betInput = new TextInputBuilder()
      .setCustomId('bet_amount')
      .setLabel(`Bet ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1000')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(guessInput),
      new ActionRowBuilder().addComponents(betInput)
    );
    return interaction.showModal(modal);
  }

  if (customId === 'modal_gamble_dice') {
    const modal = new ModalBuilder()
      .setCustomId('modal_submit_gamble_dice')
      .setTitle('Dice Roll');

    const choiceInput = new TextInputBuilder()
      .setCustomId('choice')
      .setLabel('over, under, or seven')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('over')
      .setRequired(true);

    const betInput = new TextInputBuilder()
      .setCustomId('bet_amount')
      .setLabel(`Bet ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1000')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(choiceInput),
      new ActionRowBuilder().addComponents(betInput)
    );
    return interaction.showModal(modal);
  }

  if (customId === 'modal_gamble_slots') {
    const modal = new ModalBuilder()
      .setCustomId('modal_submit_gamble_slots')
      .setTitle('Slots');

    const betInput = new TextInputBuilder()
      .setCustomId('bet_amount')
      .setLabel(`Bet ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1000')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(betInput));
    return interaction.showModal(modal);
  }

  if (customId === 'modal_gamble_blackjack') {
    const modal = new ModalBuilder()
      .setCustomId('modal_submit_gamble_blackjack')
      .setTitle('Blackjack — Place Bet');

    const betInput = new TextInputBuilder()
      .setCustomId('bet_amount')
      .setLabel(`Bet ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1000')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(betInput));
    return interaction.showModal(modal);
  }

  console.warn('[gamblingPanel] Unhandled customId:', customId);
}

// ── Modal submission handler ──────────────────

async function handleModal(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  await interaction.deferUpdate();

  if (customId === 'modal_submit_gamble_coinflip') {
    const bet    = parseBet(interaction.fields.getTextInputValue('bet_amount'));
    const choice = interaction.fields.getTextInputValue('choice').trim().toLowerCase();
    const result = await gamblingService.coinFlip(serverId, discordId, bet, choice);
    return interaction.editReply(renderGameResult(result));
  }

  if (customId === 'modal_submit_gamble_number') {
    const bet   = parseBet(interaction.fields.getTextInputValue('bet_amount'));
    const guess = interaction.fields.getTextInputValue('guess').trim();
    const result = await gamblingService.numberGuess(serverId, discordId, bet, guess);
    return interaction.editReply(renderGameResult(result));
  }

  if (customId === 'modal_submit_gamble_dice') {
    const bet    = parseBet(interaction.fields.getTextInputValue('bet_amount'));
    const choice = interaction.fields.getTextInputValue('choice').trim().toLowerCase();
    const result = await gamblingService.diceRoll(serverId, discordId, bet, choice);
    return interaction.editReply(renderGameResult(result));
  }

  if (customId === 'modal_submit_gamble_slots') {
    const bet    = parseBet(interaction.fields.getTextInputValue('bet_amount'));
    const result = await gamblingService.slots(serverId, discordId, bet);
    return interaction.editReply(renderGameResult(result));
  }

  if (customId === 'modal_submit_gamble_blackjack') {
    const bet    = parseBet(interaction.fields.getTextInputValue('bet_amount'));
    const result = await gamblingService.blackjackDeal(serverId, discordId, bet);
    return interaction.editReply(renderGameResult(result));
  }

  console.warn('[gamblingPanel] Unhandled modal:', customId);
}

async function handleSelect(interaction) {
  console.warn('[gamblingPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
