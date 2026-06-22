// ─────────────────────────────────────────────
//  gamblingRenderer.js  —  Embed builders for gambling results.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');
const { GAMBLE_MIN_BET, GAMBLE_MAX_BET, GAMBLE_NUMBER_MAX } = require('../../data/constants');

// ── Shared nav ────────────────────────────────

function backRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('🎰 Games').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
}

// ── Gambling hub ──────────────────────────────

function renderGambleHub(player) {
  const stats = player.stats ?? {};
  const net   = stats.netGambling ?? 0;
  const netStr = net >= 0 ? `+${formatCash(net)}` : `-${formatCash(Math.abs(net))}`;

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🎰 The Casino')
    .setDescription(
      `**Bets:** ${formatCash(GAMBLE_MIN_BET)} – ${formatCash(GAMBLE_MAX_BET)}\n\n` +
      `🪙 **Coin Flip** — 49% to double your bet\n` +
      `🔢 **Number Guess** — pick 1-${GAMBLE_NUMBER_MAX}, win ${GAMBLE_NUMBER_MAX}×\n` +
      `🎲 **Dice Roll** — over/under/seven on 2d6\n` +
      `🎰 **Slots** — 3-reel, up to 50× jackpot\n` +
      `🃏 **Blackjack** — beat the dealer`
    )
    .addFields(
      { name: '🎮 Games Played', value: `${stats.gamesPlayed ?? 0}`,       inline: true },
      { name: '🏆 Wins',         value: `${stats.gamesWon ?? 0}`,          inline: true },
      { name: '📈 Net',          value: netStr,                             inline: true },
      { name: '💰 Biggest Win',  value: formatCash(stats.biggestWin ?? 0), inline: true }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble_coinflip').setLabel('🪙 Coin Flip').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_gamble_number').setLabel('🔢 Number').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_gamble_dice').setLabel('🎲 Dice').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_gamble_slots').setLabel('🎰 Slots').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_gamble_blackjack').setLabel('🃏 Blackjack').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Prompts ───────────────────────────────────

function renderCoinFlipPrompt() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🪙 Coin Flip')
    .setDescription(`**49% chance to double your bet.**\n\nWin: **2×** · Loss: lose bet\n\nBet range: ${formatCash(GAMBLE_MIN_BET)} – ${formatCash(GAMBLE_MAX_BET)}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('modal_gamble_coinflip').setLabel('🪙 Place Bet').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function renderNumberPrompt() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🔢 Number Guess')
    .setDescription(`**Pick the right number, win ${GAMBLE_NUMBER_MAX}× your bet.**\n\nBet range: ${formatCash(GAMBLE_MIN_BET)} – ${formatCash(GAMBLE_MAX_BET)}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('modal_gamble_number').setLabel('🔢 Place Bet').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function renderDicePrompt() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🎲 Dice Roll')
    .setDescription(
      `**Roll 2d6 and bet on the outcome.**\n\n` +
      `🔼 **Over 7** — **1.8×** · 🔽 **Under 7** — **1.8×** · 7️⃣ **Seven** — **4×**\n\n` +
      `Bet range: ${formatCash(GAMBLE_MIN_BET)} – ${formatCash(GAMBLE_MAX_BET)}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('modal_gamble_dice').setLabel('🎲 Place Bet').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function renderSlotsPrompt() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🎰 Slots')
    .setDescription(
      `**Spin 3 reels — match symbols to win.**\n\n` +
      `🍒🍒🍒 **2×** · 🍋🍋🍋 **3×** · 🔔🔔🔔 **5×**\n` +
      `⭐⭐⭐ **8×** · 💎💎💎 **15×** · 7️⃣7️⃣7️⃣ **50×**\n` +
      `🍒🍒 (first 2) **1.5×**\n\n` +
      `Bet range: ${formatCash(GAMBLE_MIN_BET)} – ${formatCash(GAMBLE_MAX_BET)}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('modal_gamble_slots').setLabel('🎰 Spin').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function renderBlackjackPrompt(hasActiveGame) {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🃏 Blackjack')
    .setDescription(
      hasActiveGame
        ? '⚠️ You have an active hand — resume or forfeit it.'
        : `**Beat the dealer to 21 without going bust.**\n\n🃏 Blackjack **2.5×** · Win **2×** · Push returns bet\n\nBet range: ${formatCash(GAMBLE_MIN_BET)} – ${formatCash(GAMBLE_MAX_BET)}`
    );

  const row = new ActionRowBuilder().addComponents(
    hasActiveGame
      ? new ButtonBuilder().setCustomId('panel_gamble_bj_resume').setLabel('🃏 Resume').setStyle(ButtonStyle.Primary)
      : new ButtonBuilder().setCustomId('modal_gamble_blackjack').setLabel('🃏 Deal').setStyle(ButtonStyle.Success),
    hasActiveGame
      ? new ButtonBuilder().setCustomId('panel_gamble_bj_forfeit').setLabel('❌ Forfeit').setStyle(ButtonStyle.Danger)
      : new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Spinning animation frame ──────────────────

// Used by panel to show "spinning" before result
const SPIN_SYMBOLS = ['🎰', '🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
function randomSpin() { return SPIN_SYMBOLS[Math.floor(Math.random() * SPIN_SYMBOLS.length)]; }

function renderSlotsSpinning() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🎰 Spinning...')
    .setDescription(`**${randomSpin()} | ${randomSpin()} | ${randomSpin()}**\n\n*Reels spinning...*`);
  return { embeds: [embed], components: [] };
}

function renderCoinSpinning() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🪙 Flipping...')
    .setDescription('*The coin is in the air...*');
  return { embeds: [embed], components: [] };
}

function renderDiceRolling() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🎲 Rolling...')
    .setDescription('*Dice tumbling across the table...*');
  return { embeds: [embed], components: [] };
}

// ── Result action rows (reuse bet encoded in customId) ────────────────

/**
 * Build the post-result action row.
 * againId   — customId for "play again with same bet" button
 * changeId  — customId for "change bet" (goes back to prompt)
 * gameLabel — emoji + label for the again button
 */
function resultRow(againId, changeId, gameLabel) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(againId).setLabel(`${gameLabel} Again`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(changeId).setLabel('💵 Change Bet').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Games').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
}

// ── Game result renderers ─────────────────────

function renderCoinFlipResult(result) {
  const { won, choice, result: outcome, bet, net, newCash } = result.data;
  const colour = won ? embeds.COLOURS.success : embeds.COLOURS.failure;
  const coinEmoji = outcome === 'heads' ? '🪙' : '🟡';

  const embed = embeds.base(colour)
    .setTitle(won ? '🪙 You Win!' : '🪙 You Lose')
    .setDescription(
      `${coinEmoji} Landed **${outcome}** — you picked **${choice}**\n\n` +
      (won ? `**+${formatCash(Math.abs(net))}** profit` : `**-${formatCash(bet)}** lost`)
    )
    .addFields({ name: '💰 Balance', value: formatCash(newCash), inline: true });

  // Encode bet+choice in customId for spin again
  const againId = `panel_gamble_coinflip_again_${bet}_${choice}`;

  return { embeds: [embed], components: [resultRow(againId, 'panel_gamble_coinflip', '🪙')] };
}

function renderNumberResult(result) {
  const { won, guess, result: rolled, bet, gross, net, newCash } = result.data;
  const colour = won ? embeds.COLOURS.gold : embeds.COLOURS.failure;

  const embed = embeds.base(colour)
    .setTitle(won ? '🎯 Correct!' : '🔢 Wrong Number')
    .setDescription(
      `You guessed **${guess}** — the number was **${rolled}**\n\n` +
      (won ? `**+${formatCash(gross)}** won!` : `**-${formatCash(bet)}** lost`)
    )
    .addFields({ name: '💰 Balance', value: formatCash(newCash), inline: true });

  const againId = `panel_gamble_number_again_${bet}_${guess}`;

  return { embeds: [embed], components: [resultRow(againId, 'panel_gamble_number', '🔢')] };
}

function renderDiceResult(result) {
  const { won, choice, d1, d2, total, bet, gross, net, multiplier, newCash } = result.data;
  const colour = won ? embeds.COLOURS.success : embeds.COLOURS.failure;
  const labels = { over: 'Over 7', under: 'Under 7', seven: 'Seven' };

  const embed = embeds.base(colour)
    .setTitle(`🎲 ${won ? 'Winner!' : 'No Luck'}`)
    .setDescription(
      `Rolled **${d1} + ${d2} = ${total}** — you bet **${labels[choice]}**\n\n` +
      (won ? `**+${formatCash(gross - bet)}** profit (${multiplier}×)` : `**-${formatCash(bet)}** lost`)
    )
    .addFields({ name: '💰 Balance', value: formatCash(newCash), inline: true });

  const againId = `panel_gamble_dice_again_${bet}_${choice}`;

  return { embeds: [embed], components: [resultRow(againId, 'panel_gamble_dice', '🎲')] };
}

function renderSlotsResult(result) {
  const { won, reels, winType, multiplier, bet, gross, net, newCash } = result.data;
  const colour = won
    ? (multiplier >= 50 ? embeds.COLOURS.gold : embeds.COLOURS.success)
    : embeds.COLOURS.failure;

  const reelDisplay = reels.join(' | ');
  const winLabels = {
    three_of_a_kind: `Three of a kind! **${multiplier}×**`,
    two_cherry:      `Two cherries! **${multiplier}×**`,
  };

  const embed = embeds.base(colour)
    .setTitle(won ? (multiplier >= 50 ? '🎰 JACKPOT!' : '🎰 Winner!') : '🎰 No Match')
    .setDescription(
      `**${reelDisplay}**\n\n` +
      (won ? `${winLabels[winType]} — **+${formatCash(gross - bet)}** profit` : `**-${formatCash(bet)}** lost`)
    )
    .addFields({ name: '💰 Balance', value: formatCash(newCash), inline: true });

  const againId = `panel_gamble_slots_again_${bet}`;

  return { embeds: [embed], components: [resultRow(againId, 'panel_gamble_slots', '🎰')] };
}

// ── Blackjack ─────────────────────────────────

function handDisplay(hand) {
  return hand.map(c => c.display).join(' ');
}

function renderBlackjackDeal(result) {
  const { playerHand, dealerHand, playerValue, bet } = result.data;

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🃏 Blackjack')
    .setDescription(
      `**Your hand:** ${handDisplay(playerHand)} **(${playerValue})**\n` +
      `**Dealer:** ${dealerHand[0].display} ??`
    )
    .addFields({ name: '💰 Bet', value: formatCash(bet), inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble_bj_hit').setLabel('👊 Hit').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_gamble_bj_stand').setLabel('✋ Stand').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_gamble_bj_forfeit').setLabel('❌ Forfeit').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderBlackjackHit(result) {
  const { playerHand, dealerHand, playerValue, bet, newCard } = result.data;

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🃏 Blackjack — Hit')
    .setDescription(
      `Drew **${newCard.display}**\n\n` +
      `**Your hand:** ${handDisplay(playerHand)} **(${playerValue})**\n` +
      `**Dealer:** ${dealerHand[0].display} ??`
    )
    .addFields({ name: '💰 Bet', value: formatCash(bet), inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble_bj_hit').setLabel('👊 Hit').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_gamble_bj_stand').setLabel('✋ Stand').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_gamble_bj_forfeit').setLabel('❌ Forfeit').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderBlackjackResolve(result) {
  const { outcome, playerHand, dealerHand, playerValue, dealerValue, bet, payout, net, newCash } = result.data;

  const colours = {
    blackjack: embeds.COLOURS.gold, dealer_bust: embeds.COLOURS.success,
    win: embeds.COLOURS.success, push: embeds.COLOURS.neutral,
    bust: embeds.COLOURS.failure, loss: embeds.COLOURS.failure,
  };
  const titles = {
    blackjack: '🃏 Blackjack!', dealer_bust: '🎉 Dealer Busts!',
    win: '✅ You Win!', push: '🤝 Push',
    bust: '💥 Bust!', loss: '❌ You Lose',
  };

  const embed = embeds.base(colours[outcome] ?? embeds.COLOURS.neutral)
    .setTitle(titles[outcome] ?? 'Blackjack')
    .setDescription(
      `**Your hand:** ${handDisplay(playerHand)} **(${playerValue})**\n` +
      `**Dealer:** ${handDisplay(dealerHand)} **(${dealerValue})**\n\n` +
      result.message
    )
    .addFields({ name: '💰 Balance', value: formatCash(newCash), inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble_blackjack').setLabel('🃏 Play Again').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Games').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderBlackjackForfeit(result) {
  const { bet } = result.data;

  const embed = embeds.base(embeds.COLOURS.neutral)
    .setTitle('❌ Hand Forfeited')
    .setDescription(`You walked away. **${formatCash(bet)}** lost.`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble_blackjack').setLabel('🃏 New Hand').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Games').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Router ────────────────────────────────────

function renderGameResult(result) {
  if (!result.success) {
    return { embeds: [embeds.failure('Casino', result.message)], components: [backRow()] };
  }

  const { game, phase } = result.data;
  if (game === 'coin_flip')    return renderCoinFlipResult(result);
  if (game === 'number_guess') return renderNumberResult(result);
  if (game === 'dice_roll')    return renderDiceResult(result);
  if (game === 'slots')        return renderSlotsResult(result);
  if (game === 'blackjack') {
    if (phase === 'deal')    return renderBlackjackDeal(result);
    if (phase === 'hit')     return renderBlackjackHit(result);
    if (phase === 'resolve') return renderBlackjackResolve(result);
    if (phase === 'forfeit') return renderBlackjackForfeit(result);
  }

  return { embeds: [embeds.error('Unknown game result.')], components: [backRow()] };
}

module.exports = {
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
};
