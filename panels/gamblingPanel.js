// ─────────────────────────────────────────────
//  gamblingPanel.js  —  Routes panel_gamble_* interactions.
//  Rule: NO game logic. NO direct DB calls.
//  Defer → animate → call service → render result.
//
//  customId conventions:
//    panel_gamble                          — hub
//    panel_gamble_coinflip                 — prompt
//    panel_gamble_number                   — prompt
//    panel_gamble_dice                     — prompt
//    panel_gamble_slots                    — prompt
//    panel_gamble_blackjack                — prompt / resume check
//    panel_gamble_bj_resume                — re-render active hand
//    panel_gamble_bj_hit                   — hit
//    panel_gamble_bj_stand                 — stand
//    panel_gamble_bj_forfeit               — forfeit
//    panel_gamble_coinflip_again_{bet}_{choice}  — replay same bet
//    panel_gamble_number_again_{bet}_{guess}     — replay same bet
//    panel_gamble_dice_again_{bet}_{choice}      — replay same bet
//    panel_gamble_slots_again_{bet}              — replay same bet
//    modal_gamble_coinflip / _number / _dice / _slots / _blackjack — open modals
//    modal_submit_gamble_* — modal submitted
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
  renderSlotsSpinning,
  renderCoinSpinning,
  renderDiceRolling,
  renderGameResult,
} = require('./renderers/gamblingRenderer');
const embeds = require('../utils/embeds');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { GAMBLE_MIN_BET, GAMBLE_MAX_BET, GAMBLE_NUMBER_MAX } = require('../data/constants');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

function parseBet(raw) {
  const val = parseInt(String(raw ?? '').replace(/[,$\s]/g, ''), 10);
  return isNaN(val) ? NaN : val;
}

// ── Animation helper ──────────────────────────
// Shows a spinning frame, waits, then resolves with the service result.

async function animateAndRun(interaction, spinPayload, serviceFn) {
  await interaction.editReply(spinPayload);
  await new Promise(r => setTimeout(r, 1500));
  const result = await serviceFn();
  return interaction.editReply(renderGameResult(result));
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  // ── Hub ───────────────────────────────────
  if (customId === 'panel_gamble' || customId === 'panelm_gamble') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    return interaction.editReply(renderGambleHub(player));
  }

  // ── Prompts ───────────────────────────────
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
    return interaction.editReply(renderBlackjackPrompt(!!player?.blackjackState));
  }

  // ── Blackjack actions ─────────────────────
  if (customId === 'panel_gamble_bj_resume') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player?.blackjackState) return interaction.editReply(renderBlackjackPrompt(false));
    const state = player.blackjackState;
    const CARD_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':10,'Q':10,'K':10,'A':11 };
    let val = 0, aces = 0;
    for (const c of state.playerHand) { val += CARD_VALUES[c.rank] ?? 0; if (c.rank === 'A') aces++; }
    while (val > 21 && aces > 0) { val -= 10; aces--; }
    return interaction.editReply(renderGameResult({
      success: true, message: '',
      data: {
        game: 'blackjack', phase: 'deal',
        playerHand: state.playerHand,
        dealerHand: [state.dealerHand[0], { rank: '?', suit: '?', display: '??' }],
        playerValue: val,
        bet: state.bet,
      },
    }));
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

  // ── Spin Again handlers ───────────────────

  // coinflip_again_{bet}_{choice}
  if (customId.startsWith('panel_gamble_coinflip_again_')) {
    const rest   = customId.replace('panel_gamble_coinflip_again_', '');
    const parts  = rest.split('_');
    const choice = parts[parts.length - 1];
    const bet    = parseInt(parts[0]);
    await interaction.deferUpdate();
    return animateAndRun(interaction, renderCoinSpinning(),
      () => gamblingService.coinFlip(serverId, discordId, bet, choice));
  }

  // number_again_{bet}_{guess}
  if (customId.startsWith('panel_gamble_number_again_')) {
    const rest  = customId.replace('panel_gamble_number_again_', '');
    const parts = rest.split('_');
    const guess = parts[parts.length - 1];
    const bet   = parseInt(parts[0]);
    await interaction.deferUpdate();
    return animateAndRun(interaction, renderDiceRolling(),
      () => gamblingService.numberGuess(serverId, discordId, bet, guess));
  }

  // dice_again_{bet}_{choice}
  if (customId.startsWith('panel_gamble_dice_again_')) {
    const rest   = customId.replace('panel_gamble_dice_again_', '');
    const parts  = rest.split('_');
    const choice = parts[parts.length - 1];
    const bet    = parseInt(parts[0]);
    await interaction.deferUpdate();
    return animateAndRun(interaction, renderDiceRolling(),
      () => gamblingService.diceRoll(serverId, discordId, bet, choice));
  }

  // slots_again_{bet}
  if (customId.startsWith('panel_gamble_slots_again_')) {
    const bet = parseInt(customId.replace('panel_gamble_slots_again_', ''));
    await interaction.deferUpdate();
    return animateAndRun(interaction, renderSlotsSpinning(),
      () => gamblingService.slots(serverId, discordId, bet));
  }

  // ── Modal openers — NO defer before showModal ──

  if (customId === 'modal_gamble_coinflip') {
    const modal = new ModalBuilder().setCustomId('modal_submit_gamble_coinflip').setTitle('Coin Flip');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('choice').setLabel('heads or tails')
          .setStyle(TextInputStyle.Short).setPlaceholder('heads').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('bet_amount')
          .setLabel(`Bet ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
          .setStyle(TextInputStyle.Short).setPlaceholder('1000').setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === 'modal_gamble_number') {
    const modal = new ModalBuilder().setCustomId('modal_submit_gamble_number').setTitle('Number Guess');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('guess').setLabel(`Your number (1–${GAMBLE_NUMBER_MAX})`)
          .setStyle(TextInputStyle.Short).setPlaceholder('420').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('bet_amount')
          .setLabel(`Bet ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
          .setStyle(TextInputStyle.Short).setPlaceholder('1000').setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === 'modal_gamble_dice') {
    const modal = new ModalBuilder().setCustomId('modal_submit_gamble_dice').setTitle('Dice Roll');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('choice').setLabel('over, under, or seven')
          .setStyle(TextInputStyle.Short).setPlaceholder('over').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('bet_amount')
          .setLabel(`Bet ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
          .setStyle(TextInputStyle.Short).setPlaceholder('1000').setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === 'modal_gamble_slots') {
    const modal = new ModalBuilder().setCustomId('modal_submit_gamble_slots').setTitle('Slots');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('bet_amount')
          .setLabel(`Bet ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
          .setStyle(TextInputStyle.Short).setPlaceholder('1000').setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === 'modal_gamble_blackjack') {
    const modal = new ModalBuilder().setCustomId('modal_submit_gamble_blackjack').setTitle('Blackjack');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('bet_amount')
          .setLabel(`Bet ($${GAMBLE_MIN_BET.toLocaleString()}–$${GAMBLE_MAX_BET.toLocaleString()})`)
          .setStyle(TextInputStyle.Short).setPlaceholder('1000').setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  console.warn('[gamblingPanel] Unhandled customId:', customId);
}

// ── Modal submissions ─────────────────────────

async function handleModal(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  await interaction.deferUpdate();

  if (customId === 'modal_submit_gamble_coinflip') {
    const bet    = parseBet(interaction.fields.getTextInputValue('bet_amount'));
    const choice = interaction.fields.getTextInputValue('choice').trim().toLowerCase();
    return animateAndRun(interaction, renderCoinSpinning(),
      () => gamblingService.coinFlip(serverId, discordId, bet, choice));
  }

  if (customId === 'modal_submit_gamble_number') {
    const bet   = parseBet(interaction.fields.getTextInputValue('bet_amount'));
    const guess = interaction.fields.getTextInputValue('guess').trim();
    return animateAndRun(interaction, renderDiceRolling(),
      () => gamblingService.numberGuess(serverId, discordId, bet, guess));
  }

  if (customId === 'modal_submit_gamble_dice') {
    const bet    = parseBet(interaction.fields.getTextInputValue('bet_amount'));
    const choice = interaction.fields.getTextInputValue('choice').trim().toLowerCase();
    return animateAndRun(interaction, renderDiceRolling(),
      () => gamblingService.diceRoll(serverId, discordId, bet, choice));
  }

  if (customId === 'modal_submit_gamble_slots') {
    const bet = parseBet(interaction.fields.getTextInputValue('bet_amount'));
    return animateAndRun(interaction, renderSlotsSpinning(),
      () => gamblingService.slots(serverId, discordId, bet));
  }

  if (customId === 'modal_submit_gamble_blackjack') {
    const bet    = parseBet(interaction.fields.getTextInputValue('bet_amount'));
    const result = await gamblingService.blackjackDeal(serverId, discordId, bet);
    return interaction.editReply(renderGameResult(result));
  }

  console.warn('[gamblingPanel] Unhandled modal:', customId);
}

// Add spin_again routes to index.js BUTTON_SELECT_ROUTES:
// 'panel_gamble_coinflip_again_': (i) => gamblingPanel.handle(i),
// 'panel_gamble_number_again_':   (i) => gamblingPanel.handle(i),
// 'panel_gamble_dice_again_':     (i) => gamblingPanel.handle(i),
// 'panel_gamble_slots_again_':    (i) => gamblingPanel.handle(i),

async function handleSelect(interaction) {
  console.warn('[gamblingPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
