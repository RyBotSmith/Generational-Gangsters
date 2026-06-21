// ─────────────────────────────────────────────
//  gamblingService.js  —  All gambling game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
//
//  Games:
//    coinFlip    — pick heads/tails, 49% win, 2x payout
//    numberGuess — pick 1-N, win pays N×bet (capped at GAMBLE_MAX_RETURN)
//    diceRoll    — pick over/under/seven on 2d6, varying payouts
//    slots       — 3-reel pull, multiple winning combos
//    blackjack   — player vs dealer, stand/hit flow via multi-step state
// ─────────────────────────────────────────────

const {
  GAMBLE_MIN_BET,
  GAMBLE_MAX_BET,
  GAMBLE_NUMBER_MAX,
  GAMBLE_MAX_RETURN,
  GAMBLE_COIN_WIN_PCT,
  ACTION_TYPES,
} = require('../data/constants');

const playerRepository = require('../repositories/playerRepository');
const logger           = require('../utils/logger');
const { randInt }      = require('../utils/helpers');

// ── Shared validation ─────────────────────────

function validateBet(player, bet) {
  if (isNaN(bet) || bet < GAMBLE_MIN_BET) {
    return { valid: false, message: `Minimum bet is **$${GAMBLE_MIN_BET.toLocaleString('en-US')}**.` };
  }
  if (bet > GAMBLE_MAX_BET) {
    return { valid: false, message: `Maximum bet is **$${GAMBLE_MAX_BET.toLocaleString('en-US')}**.` };
  }
  if ((player.cash ?? 0) < bet) {
    return { valid: false, message: `You don't have enough cash. You have **$${(player.cash ?? 0).toLocaleString('en-US')}**.` };
  }
  return { valid: true };
}

async function applyResult(serverId, discordId, player, bet, netChange, won) {
  const newCash    = (player.cash ?? 0) + netChange;
  const newWagered = (player.stats?.totalWagered ?? 0) + bet;
  const newNet     = (player.stats?.netGambling  ?? 0) + netChange;
  const newBiggest = won ? Math.max(player.stats?.biggestWin ?? 0, netChange) : (player.stats?.biggestWin ?? 0);

  const updates = {
    cash:                        newCash,
    'stats.gamesPlayed':         (player.stats?.gamesPlayed ?? 0) + 1,
    'stats.gamesWon':            (player.stats?.gamesWon    ?? 0) + (won ? 1 : 0),
    'stats.totalWagered':        newWagered,
    'stats.netGambling':         newNet,
    'stats.biggestWin':          newBiggest,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);
  return updates;
}

// ── 1. Coin Flip ──────────────────────────────

/**
 * @param {string} serverId
 * @param {string} discordId
 * @param {number} bet
 * @param {'heads'|'tails'} choice
 */
async function coinFlip(serverId, discordId, bet, choice) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const v = validateBet(player, bet);
  if (!v.valid) return { success: false, message: v.message, data: {} };

  const normalised = choice?.toLowerCase();
  if (normalised !== 'heads' && normalised !== 'tails') {
    return { success: false, message: 'Choose **heads** or **tails**.', data: {} };
  }

  const roll   = Math.random();
  const result = roll < 0.5 ? 'heads' : 'tails';
  const won    = result === normalised;
  const payout = won ? bet : 0;          // win = 2× (get bet back + equal profit)
  const net    = won ? bet : -bet;

  const updates = await applyResult(serverId, discordId, player, bet, net, won);

  logger.log(serverId, {
    discordId,
    actionType: ACTION_TYPES.GAMBLE,
    actionName: 'coin_flip',
    location:   player.state,
    payload:    { bet, choice: normalised, result, won, net },
  });

  return {
    success: true,
    message: won
      ? `The coin landed **${result}** — you win **$${payout.toLocaleString('en-US')}**!`
      : `The coin landed **${result}** — you lose **$${bet.toLocaleString('en-US')}**.`,
    data: { game: 'coin_flip', bet, choice: normalised, result, won, net, newCash: updates.cash },
  };
}

// ── 2. Number Guess ───────────────────────────

/**
 * Pick a number 1–GAMBLE_NUMBER_MAX. Win = bet × N (capped at GAMBLE_MAX_RETURN).
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {number} bet
 * @param {number} guess   1–GAMBLE_NUMBER_MAX
 */
async function numberGuess(serverId, discordId, bet, guess) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const v = validateBet(player, bet);
  if (!v.valid) return { success: false, message: v.message, data: {} };

  const parsedGuess = parseInt(guess);
  if (isNaN(parsedGuess) || parsedGuess < 1 || parsedGuess > GAMBLE_NUMBER_MAX) {
    return { success: false, message: `Pick a number between **1** and **${GAMBLE_NUMBER_MAX}**.`, data: {} };
  }

  const result = randInt(1, GAMBLE_NUMBER_MAX);
  const won    = result === parsedGuess;
  const gross  = won ? Math.min(bet * GAMBLE_NUMBER_MAX, GAMBLE_MAX_RETURN) : 0;
  const net    = won ? gross - bet : -bet;

  const updates = await applyResult(serverId, discordId, player, bet, net, won);

  logger.log(serverId, {
    discordId,
    actionType: ACTION_TYPES.GAMBLE,
    actionName: 'number_guess',
    location:   player.state,
    payload:    { bet, guess: parsedGuess, result, won, net },
  });

  return {
    success: true,
    message: won
      ? `🎯 The number was **${result}** — you guessed it! You win **$${gross.toLocaleString('en-US')}**!`
      : `The number was **${result}** — you guessed ${parsedGuess}. You lose **$${bet.toLocaleString('en-US')}**.`,
    data: { game: 'number_guess', bet, guess: parsedGuess, result, won, gross, net, newCash: updates.cash },
  };
}

// ── 3. Dice Roll ──────────────────────────────

// 2d6 outcomes and payouts:
//   over 7  (8–12) — 1.8× net win (nearly even)
//   under 7 (2–6)  — 1.8× net win
//   seven           — 4× net win (hardest to hit)
const DICE_PAYOUTS = { over: 1.8, under: 1.8, seven: 4 };

/**
 * @param {string} serverId
 * @param {string} discordId
 * @param {number} bet
 * @param {'over'|'under'|'seven'} choice
 */
async function diceRoll(serverId, discordId, bet, choice) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const v = validateBet(player, bet);
  if (!v.valid) return { success: false, message: v.message, data: {} };

  const normalised = choice?.toLowerCase();
  if (!['over', 'under', 'seven'].includes(normalised)) {
    return { success: false, message: 'Choose **over**, **under**, or **seven**.', data: {} };
  }

  const d1     = randInt(1, 6);
  const d2     = randInt(1, 6);
  const total  = d1 + d2;

  let won = false;
  if (normalised === 'over')  won = total > 7;
  if (normalised === 'under') won = total < 7;
  if (normalised === 'seven') won = total === 7;

  const multiplier = DICE_PAYOUTS[normalised];
  const gross      = won ? Math.floor(bet * multiplier) : 0;
  const net        = won ? gross - bet : -bet;

  const updates = await applyResult(serverId, discordId, player, bet, net, won);

  logger.log(serverId, {
    discordId,
    actionType: ACTION_TYPES.GAMBLE,
    actionName: 'dice_roll',
    location:   player.state,
    payload:    { bet, choice: normalised, d1, d2, total, won, net },
  });

  return {
    success: true,
    message: won
      ? `🎲 Rolled **${d1} + ${d2} = ${total}** — you win **$${gross.toLocaleString('en-US')}**!`
      : `🎲 Rolled **${d1} + ${d2} = ${total}** — you lose **$${bet.toLocaleString('en-US')}**.`,
    data: { game: 'dice_roll', bet, choice: normalised, d1, d2, total, won, gross, net, multiplier, newCash: updates.cash },
  };
}

// ── 4. Slots ──────────────────────────────────

const SLOT_SYMBOLS  = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
const SLOT_WEIGHTS  = [35, 25, 18, 12, 7, 3]; // out of 100 total

// Payout multipliers for 3-of-a-kind
const SLOT_PAYOUTS = {
  '🍒': 2,
  '🍋': 3,
  '🔔': 5,
  '⭐': 8,
  '💎': 15,
  '7️⃣': 50,
};

// Also pay out for 2× cherry
const SLOT_TWO_CHERRY_MULT = 1.5;

function spinReel() {
  const roll = randInt(1, 100);
  let cumulative = 0;
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    cumulative += SLOT_WEIGHTS[i];
    if (roll <= cumulative) return SLOT_SYMBOLS[i];
  }
  return SLOT_SYMBOLS[0];
}

/**
 * @param {string} serverId
 * @param {string} discordId
 * @param {number} bet
 */
async function slots(serverId, discordId, bet) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const v = validateBet(player, bet);
  if (!v.valid) return { success: false, message: v.message, data: {} };

  const reels  = [spinReel(), spinReel(), spinReel()];
  const [a, b, c] = reels;

  let multiplier = 0;
  let winType    = null;

  if (a === b && b === c) {
    multiplier = SLOT_PAYOUTS[a];
    winType    = 'three_of_a_kind';
  } else if (a === '🍒' && b === '🍒') {
    multiplier = SLOT_TWO_CHERRY_MULT;
    winType    = 'two_cherry';
  }

  const won   = multiplier > 0;
  const gross = won ? Math.min(Math.floor(bet * multiplier), GAMBLE_MAX_RETURN) : 0;
  const net   = won ? gross - bet : -bet;

  const updates = await applyResult(serverId, discordId, player, bet, net, won);

  logger.log(serverId, {
    discordId,
    actionType: ACTION_TYPES.GAMBLE,
    actionName: 'slots',
    location:   player.state,
    payload:    { bet, reels, won, winType, multiplier, net },
  });

  return {
    success: true,
    message: won
      ? `You win **$${gross.toLocaleString('en-US')}**! (${multiplier}×)`
      : `No match. You lose **$${bet.toLocaleString('en-US')}**.`,
    data: { game: 'slots', bet, reels, won, winType, multiplier, gross, net, newCash: updates.cash },
  };
}

// ── 5. Blackjack ──────────────────────────────

// Blackjack is a two-step game (deal → stand/hit).
// State is stored in the player doc under a temporary key
// and cleared on stand/bust/blackjack.
// State shape: { bet, playerHand: [card,...], dealerHand: [card,...], startedAt }

const CARD_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
  '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 10, 'Q': 10, 'K': 10, 'A': 11,
};
const CARD_RANKS  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const CARD_SUITS  = ['♠','♥','♦','♣'];

function drawCard() {
  const rank = CARD_RANKS[randInt(0, CARD_RANKS.length - 1)];
  const suit = CARD_SUITS[randInt(0, CARD_SUITS.length - 1)];
  return { rank, suit, display: `${rank}${suit}` };
}

function handValue(hand) {
  let total = 0;
  let aces  = 0;
  for (const card of hand) {
    total += CARD_VALUES[card.rank];
    if (card.rank === 'A') aces++;
  }
  // Reduce aces from 11 to 1 as needed
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

/**
 * Deal the initial blackjack hand. Stores state on the player doc.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {number} bet
 */
async function blackjackDeal(serverId, discordId, bet) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  // Clear any stale blackjack state
  if (player.blackjackState) {
    await playerRepository.updatePlayer(serverId, discordId, { blackjackState: null });
  }

  const v = validateBet(player, bet);
  if (!v.valid) return { success: false, message: v.message, data: {} };

  const playerHand = [drawCard(), drawCard()];
  const dealerHand = [drawCard(), drawCard()];
  const playerVal  = handValue(playerHand);
  const dealerVal  = handValue(dealerHand);

  // Deduct bet immediately on deal — returned/doubled on resolution
  await playerRepository.updatePlayer(serverId, discordId, {
    cash: (player.cash ?? 0) - bet,
    blackjackState: { bet, playerHand, dealerHand, startedAt: Date.now() },
  });

  // Natural blackjack check (21 on deal)
  if (playerVal === 21) {
    return await blackjackResolve(serverId, discordId, 'blackjack', playerHand, dealerHand, bet, player);
  }

  return {
    success: true,
    message: 'Cards dealt. Hit or stand?',
    data: {
      game:        'blackjack',
      phase:       'deal',
      playerHand,
      dealerHand:  [dealerHand[0], { rank: '?', suit: '?', display: '??' }], // hide dealer's second card
      playerValue: playerVal,
      bet,
    },
  };
}

/**
 * Player hits — draw another card.
 */
async function blackjackHit(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const state = player.blackjackState;
  if (!state) return { success: false, message: 'No active blackjack game. Start a new one.', data: {} };

  const newCard    = drawCard();
  const playerHand = [...state.playerHand, newCard];
  const playerVal  = handValue(playerHand);

  if (playerVal > 21) {
    // Bust — lose bet (already deducted)
    return await blackjackResolve(serverId, discordId, 'bust', playerHand, state.dealerHand, state.bet, player);
  }

  if (playerVal === 21) {
    // Auto-stand on 21
    return await blackjackResolve(serverId, discordId, 'stand', playerHand, state.dealerHand, state.bet, player);
  }

  // Update state
  await playerRepository.updatePlayer(serverId, discordId, {
    'blackjackState.playerHand': playerHand,
  });

  return {
    success: true,
    message: `You drew **${newCard.display}**. Total: ${playerVal}`,
    data: {
      game:        'blackjack',
      phase:       'hit',
      playerHand,
      dealerHand:  [state.dealerHand[0], { rank: '?', suit: '?', display: '??' }],
      playerValue: playerVal,
      bet:         state.bet,
      newCard,
    },
  };
}

/**
 * Player stands — dealer plays out, determine winner.
 */
async function blackjackStand(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const state = player.blackjackState;
  if (!state) return { success: false, message: 'No active blackjack game.', data: {} };

  return await blackjackResolve(serverId, discordId, 'stand', state.playerHand, state.dealerHand, state.bet, player);
}

/**
 * Internal — resolve a blackjack game given the final hands.
 * Clears blackjackState and applies cash delta.
 */
async function blackjackResolve(serverId, discordId, trigger, playerHand, dealerHand, bet, player) {
  const playerVal = handValue(playerHand);

  // Dealer plays out (hits until 17+)
  let finalDealerHand = [...dealerHand];
  if (trigger !== 'bust') {
    while (handValue(finalDealerHand) < 17) {
      finalDealerHand.push(drawCard());
    }
  }

  const dealerVal = handValue(finalDealerHand);

  let outcome;
  let payout = 0; // how much cash returns to player (bet already deducted)

  if (trigger === 'blackjack') {
    outcome = 'blackjack';
    payout  = Math.floor(bet * 2.5); // 3:2 blackjack pays 1.5× profit + stake back
  } else if (trigger === 'bust') {
    outcome = 'bust';
    payout  = 0;
  } else if (dealerVal > 21) {
    outcome = 'dealer_bust';
    payout  = bet * 2;
  } else if (playerVal > dealerVal) {
    outcome = 'win';
    payout  = bet * 2;
  } else if (playerVal === dealerVal) {
    outcome = 'push';
    payout  = bet; // return stake
  } else {
    outcome = 'loss';
    payout  = 0;
  }

  const won    = ['blackjack', 'dealer_bust', 'win'].includes(outcome);
  const net    = payout - bet; // net change from original cash (bet already deducted)

  // Cash was already deducted on deal — just add payout back
  const freshPlayer = await playerRepository.getPlayer(serverId, discordId);
  const newCash     = (freshPlayer?.cash ?? 0) + payout;

  const statUpdates = {
    cash:                 newCash,
    blackjackState:       null,
    'stats.gamesPlayed':  (freshPlayer?.stats?.gamesPlayed ?? 0) + 1,
    'stats.gamesWon':     (freshPlayer?.stats?.gamesWon    ?? 0) + (won ? 1 : 0),
    'stats.totalWagered': (freshPlayer?.stats?.totalWagered ?? 0) + bet,
    'stats.netGambling':  (freshPlayer?.stats?.netGambling  ?? 0) + net,
    'stats.biggestWin':   won
      ? Math.max(freshPlayer?.stats?.biggestWin ?? 0, net)
      : (freshPlayer?.stats?.biggestWin ?? 0),
  };

  await playerRepository.updatePlayer(serverId, discordId, statUpdates);

  logger.log(serverId, {
    discordId,
    actionType: ACTION_TYPES.GAMBLE,
    actionName: 'blackjack',
    location:   player.state,
    payload:    { bet, outcome, playerVal, dealerVal, net },
  });

  const outcomeMessages = {
    blackjack:   `🃏 Blackjack! You win **$${(payout - bet).toLocaleString('en-US')}** profit!`,
    bust:        `💥 Bust! (${playerVal}) You lose **$${bet.toLocaleString('en-US')}**.`,
    dealer_bust: `Dealer busts (${dealerVal})! You win **$${bet.toLocaleString('en-US')}**!`,
    win:         `You win! (${playerVal} vs ${dealerVal}) +**$${bet.toLocaleString('en-US')}**`,
    push:        `Push (${playerVal} vs ${dealerVal}) — bet returned.`,
    loss:        `You lose (${playerVal} vs ${dealerVal}). -**$${bet.toLocaleString('en-US')}**`,
  };

  return {
    success: true,
    message: outcomeMessages[outcome],
    data: {
      game:        'blackjack',
      phase:       'resolve',
      outcome,
      playerHand,
      dealerHand:  finalDealerHand,
      playerValue: playerVal,
      dealerValue: dealerVal,
      bet,
      payout,
      net,
      won,
      newCash,
    },
  };
}

/**
 * Forfeit an active blackjack hand (lose bet, clear state).
 */
async function blackjackForfeit(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const state = player.blackjackState;
  if (!state) return { success: false, message: 'No active blackjack game.', data: {} };

  await playerRepository.updatePlayer(serverId, discordId, {
    blackjackState: null,
    'stats.gamesPlayed': (player.stats?.gamesPlayed ?? 0) + 1,
    'stats.totalWagered': (player.stats?.totalWagered ?? 0) + state.bet,
    'stats.netGambling':  (player.stats?.netGambling  ?? 0) - state.bet,
  });

  return {
    success: true,
    message: `You forfeited. **$${state.bet.toLocaleString('en-US')}** lost.`,
    data: { game: 'blackjack', phase: 'forfeit', bet: state.bet },
  };
}

module.exports = {
  coinFlip,
  numberGuess,
  diceRoll,
  slots,
  blackjackDeal,
  blackjackHit,
  blackjackStand,
  blackjackForfeit,
};
