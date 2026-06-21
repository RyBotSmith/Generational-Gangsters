// ─────────────────────────────────────────────
//  gamblingRenderer.js  —  Embed builders for gambling results.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, formatDuration } = require('../../utils/helpers');
const { GAMBLE_MIN_BET, GAMBLE_MAX_BET, GAMBLE_NUMBER_MAX } = require('../../data/constants');

// ── Shared nav ────────────────────────────────

function backRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('🎰 Games').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
}

// ── Gambling hub ──────────────────────────────

/**
 * Main gambling menu — lists all games.
 * @param {object} player
 */
function renderGambleHub(player) {
  const stats = player.stats ?? {};
  const net   = stats.netGambling ?? 0;
  const netStr = net >= 0
    ? `+${formatCash(net)}`
    : `-${formatCash(Math.abs(net))}`;

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
      { name: '🎮 Games Played', value: `${stats.gamesPlayed ?? 0}`,         inline: true },
      { name: '🏆 Wins',         value: `${stats.gamesWon ?? 0}`,            inline: true },
      { name: '📈 Net',          value: netStr,                               inline: true },
      { name: '💰 Biggest Win',  value: formatCash(stats.biggestWin ?? 0),   inline: true }
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

// ── Bet prompt panels (shown before modal) ────

function renderCoinFlipPrompt() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🪙 Coin Flip')
    .setDescription(
      `**49% chance to double your bet.**\n\n` +
      `Pick heads or tails and enter your bet.\n` +
      `Win: **2×** your bet\n` +
      `Loss: lose your bet\n\n` +
      `Bet range: ${formatCash(GAMBLE_MIN_BET)} – ${formatCash(GAMBLE_MAX_BET)}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('modal_gamble_coinflip').setLabel('🪙 Place Bet').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderNumberPrompt() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🔢 Number Guess')
    .setDescription(
      `**Pick the right number, win ${GAMBLE_NUMBER_MAX}× your bet.**\n\n` +
      `Choose any number from **1 to ${GAMBLE_NUMBER_MAX}**.\n` +
      `Win: **${GAMBLE_NUMBER_MAX}×** your bet\n` +
      `Loss: lose your bet\n\n` +
      `Bet range: ${formatCash(GAMBLE_MIN_BET)} – ${formatCash(GAMBLE_MAX_BET)}`
    );

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
      `🔼 **Over 7** (8–12) — **1.8×** your bet\n` +
      `🔽 **Under 7** (2–6) — **1.8×** your bet\n` +
      `7️⃣ **Seven** (exactly 7) — **4×** your bet\n\n` +
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
      `🍒🍒🍒 — **2×**\n` +
      `🍋🍋🍋 — **3×**\n` +
      `🔔🔔🔔 — **5×**\n` +
      `⭐⭐⭐ — **8×**\n` +
      `💎💎💎 — **15×**\n` +
      `7️⃣7️⃣7️⃣ — **50× JACKPOT**\n` +
      `🍒🍒 (first 2) — **1.5×**\n\n` +
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
        ? '⚠️ You have an active blackjack hand — resume or forfeit it below.'
        : `**Beat the dealer to 21 without going bust.**\n\n` +
          `🃏 Blackjack pays **2.5×**\n` +
          `✅ Win pays **2×**\n` +
          `🤝 Push returns your bet\n\n` +
          `Bet range: ${formatCash(GAMBLE_MIN_BET)} – ${formatCash(GAMBLE_MAX_BET)}`
    );

  const row = new ActionRowBuilder().addComponents(
    hasActiveGame
      ? new ButtonBuilder().setCustomId('panel_gamble_bj_resume').setLabel('🃏 Resume Hand').setStyle(ButtonStyle.Primary)
      : new ButtonBuilder().setCustomId('modal_gamble_blackjack').setLabel('🃏 Deal').setStyle(ButtonStyle.Success),
    hasActiveGame
      ? new ButtonBuilder().setCustomId('panel_gamble_bj_forfeit').setLabel('❌ Forfeit').setStyle(ButtonStyle.Danger)
      : new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_gamble').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Game result renderers ─────────────────────

function renderCoinFlipResult(result) {
  const { won, choice, result: outcome, bet, net, newCash } = result.data;
  const colour = won ? embeds.COLOURS.success : embeds.COLOURS.failure;

  const embed = embeds.base(colour)
    .setTitle(won ? '🪙 You Win!' : '🪙 You Lose')
    .setDescription(
      `You picked **${choice}** — it landed **${outcome}**.\n\n` +
      (won
        ? `**+${formatCash(Math.abs(net))}** profit`
        : `**-${formatCash(bet)}** lost`)
    )
    .addFields({ name: '💰 Balance', value: formatCash(newCash), inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble_coinflip').setLabel('🪙 Play Again').setStyle(ButtonStyle.Primary),
    ...backRow().components
  );

  return { embeds: [embed], components: [row] };
}

function renderNumberResult(result) {
  const { won, guess, result: rolled, bet, gross, net, newCash } = result.data;
  const colour = won ? embeds.COLOURS.gold : embeds.COLOURS.failure;

  const embed = embeds.base(colour)
    .setTitle(won ? '🎯 Correct!' : '🔢 Wrong Number')
    .setDescription(
      `You guessed **${guess}** — the number was **${rolled}**.\n\n` +
      (won
        ? `**+${formatCash(gross)}** won!`
        : `**-${formatCash(bet)}** lost.`)
    )
    .addFields({ name: '💰 Balance', value: formatCash(newCash), inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble_number').setLabel('🔢 Play Again').setStyle(ButtonStyle.Primary),
    ...backRow().components
  );

  return { embeds: [embed], components: [row] };
}

function renderDiceResult(result) {
  const { won, choice, d1, d2, total, bet, gross, net, multiplier, newCash } = result.data;
  const colour = won ? embeds.COLOURS.success : embeds.COLOURS.failure;

  const choiceLabels = { over: 'Over 7', under: 'Under 7', seven: 'Seven' };

  const embed = embeds.base(colour)
    .setTitle(`🎲 ${won ? 'Winner!' : 'No Luck'}`)
    .setDescription(
      `You bet **${choiceLabels[choice]}** — rolled **${d1} + ${d2} = ${total}**.\n\n` +
      (won
        ? `**+${formatCash(gross - bet)}** profit (${multiplier}×)`
        : `**-${formatCash(bet)}** lost.`)
    )
    .addFields({ name: '💰 Balance', value: formatCash(newCash), inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble_dice').setLabel('🎲 Play Again').setStyle(ButtonStyle.Primary),
    ...backRow().components
  );

  return { embeds: [embed], components: [row] };
}

function renderSlotsResult(result) {
  const { won, reels, winType, multiplier, bet, gross, net, newCash } = result.data;
  const colour = won
    ? (multiplier >= 15 ? embeds.COLOURS.gold : embeds.COLOURS.success)
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
      (won
        ? `${winLabels[winType]} — **+${formatCash(gross - bet)}** profit`
        : `**-${formatCash(bet)}** lost.`)
    )
    .addFields({ name: '💰 Balance', value: formatCash(newCash), inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble_slots').setLabel('🎰 Spin Again').setStyle(ButtonStyle.Primary),
    ...backRow().components
  );

  return { embeds: [embed], components: [row] };
}

// ── Blackjack embed helpers ───────────────────

function handDisplay(hand) {
  return hand.map(c => c.display).join(' ');
}

function renderBlackjackDeal(result) {
  const { playerHand, dealerHand, playerValue, bet } = result.data;

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🃏 Blackjack')
    .setDescription(`**Your hand:** ${handDisplay(playerHand)} (${playerValue})\n**Dealer:** ${dealerHand[0].display} ??`)
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
      `You drew **${newCard.display}**.\n\n` +
      `**Your hand:** ${handDisplay(playerHand)} (${playerValue})\n` +
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
  const { outcome, playerHand, dealerHand, playerValue, dealerValue, bet, payout, net, won, newCash } = result.data;

  const colours = {
    blackjack:   embeds.COLOURS.gold,
    dealer_bust: embeds.COLOURS.success,
    win:         embeds.COLOURS.success,
    push:        embeds.COLOURS.neutral,
    bust:        embeds.COLOURS.failure,
    loss:        embeds.COLOURS.failure,
  };

  const titles = {
    blackjack:   '🃏 Blackjack!',
    dealer_bust: '🎉 Dealer Busts!',
    win:         '✅ You Win!',
    push:        '🤝 Push',
    bust:        '💥 Bust!',
    loss:        '❌ You Lose',
  };

  const embed = embeds.base(colours[outcome] ?? embeds.COLOURS.neutral)
    .setTitle(titles[outcome] ?? 'Blackjack')
    .setDescription(
      `**Your hand:** ${handDisplay(playerHand)} (${playerValue})\n` +
      `**Dealer:**    ${handDisplay(dealerHand)} (${dealerValue})\n\n` +
      result.message
    )
    .addFields({ name: '💰 Balance', value: formatCash(newCash), inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_gamble_blackjack').setLabel('🃏 Play Again').setStyle(ButtonStyle.Primary),
    ...backRow().components
  );

  return { embeds: [embed], components: [row] };
}

function renderBlackjackForfeit(result) {
  const { bet } = result.data;

  const embed = embeds.base(embeds.COLOURS.neutral)
    .setTitle('❌ Hand Forfeited')
    .setDescription(`You walked away. **$${bet.toLocaleString('en-US')}** lost.`);

  return { embeds: [embed], components: [backRow()] };
}

// ── Route result to correct renderer ─────────

/**
 * Route a completed game result to the correct embed builder.
 */
function renderGameResult(result) {
  if (!result.success) {
    return {
      embeds: [embeds.failure('Casino', result.message)],
      components: [backRow()],
    };
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
  renderGameResult,
};
