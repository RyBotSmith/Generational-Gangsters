"use strict";

const playerRepository = require("../repositories/playerRepository");
const logRepository = require("../repositories/logRepository");
const { ACTION_TYPES } = require("../data/constants");

// Outcome weights: 40% success, 35% fail, 25% caught
const BUST_OUTCOMES = [
  { result: "success", weight: 40 },
  { result: "fail",    weight: 35 },
  { result: "caught",  weight: 25 },
];

const CAUGHT_JAIL_MS   = 5 * 60 * 1000;   // 5 min for the busting player
const CAUGHT_EXTEND_MS = 5 * 60 * 1000;   // +5 min added to target sentence
const MAX_BUST_REWARD  = 500_000;
const MIN_BUST_REWARD  = 0;

function rollOutcome() {
  const total = BUST_OUTCOMES.reduce((s, o) => s + o.weight, 0);
  let roll = Math.floor(Math.random() * total);
  for (const o of BUST_OUTCOMES) {
    if (roll < o.weight) return o.result;
    roll -= o.weight;
  }
  return "fail";
}

/**
 * Fetch all jailed players on the server.
 */
async function getJailedPlayers(serverId) {
  try {
    const players = await playerRepository.getJailedPlayers(serverId);
    return { success: true, data: { players } };
  } catch (err) {
    console.error("[jailbreakService.getJailedPlayers]", err);
    return { success: false, message: "Failed to load jailbreak panel." };
  }
}

/**
 * Set or update a jailed player's bust reward.
 */
async function setBustReward(serverId, discordId, rewardAmount) {
  try {
    const amount = parseInt(rewardAmount, 10);

    if (isNaN(amount) || amount < MIN_BUST_REWARD) {
      return { success: false, message: `Reward must be at least $${MIN_BUST_REWARD.toLocaleString()}.` };
    }
    if (amount > MAX_BUST_REWARD) {
      return { success: false, message: `Reward cannot exceed $${MAX_BUST_REWARD.toLocaleString()}.` };
    }

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) return { success: false, message: "Player not found." };

    const now = Date.now();
    if (!player.jailedUntil || player.jailedUntil <= now) {
      return { success: false, message: "You are not currently jailed." };
    }
    if (player.cash < amount) {
      return { success: false, message: `You only have $${(player.cash || 0).toLocaleString()} — you cannot promise more than you have.` };
    }

    await playerRepository.updatePlayer(serverId, discordId, { bustReward: amount });

    return {
      success: true,
      message: `Bust reward set to $${amount.toLocaleString()}. Anyone who breaks you out will receive this.`,
      data: { bustReward: amount },
    };
  } catch (err) {
    console.error("[jailbreakService.setBustReward]", err);
    return { success: false, message: "Failed to update bust reward." };
  }
}

/**
 * Attempt to bust a jailed player.
 * @param {string} serverId
 * @param {string} busterId - the player attempting the bust
 * @param {string} targetId - the jailed player being busted
 */
async function attemptBust(serverId, busterId, targetId) {
  try {
    if (busterId === targetId) {
      return { success: false, message: "You cannot bust yourself out." };
    }

    const [buster, target] = await Promise.all([
      playerRepository.getPlayer(serverId, busterId),
      playerRepository.getPlayer(serverId, targetId),
    ]);

    if (!buster) return { success: false, message: "Your player data was not found." };
    if (!target) return { success: false, message: "That player was not found." };

    const now = Date.now();

    // Buster must not themselves be jailed/hospitalized
    if (buster.jailedUntil && buster.jailedUntil > now) {
      return { success: false, message: "You cannot attempt a bust while you are in jail." };
    }
    if (buster.hospitalizedUntil && buster.hospitalizedUntil > now) {
      return { success: false, message: "You cannot attempt a bust while hospitalised." };
    }
    if (!buster.alive) {
      return { success: false, message: "You cannot attempt a bust while dead." };
    }

    // Target must still be jailed
    if (!target.jailedUntil || target.jailedUntil <= now) {
      return { success: false, message: "That player is no longer in jail." };
    }

    const outcome = rollOutcome();
    const reward  = target.bustReward || 0;

    if (outcome === "success") {
      // Free the target, transfer reward cash
      const updates = { jailedUntil: null, bustReward: 0 };
      if (reward > 0) {
        updates.cash = Math.max(0, (target.cash || 0) - reward);
      }
      await playerRepository.updatePlayer(serverId, targetId, updates);

      if (reward > 0) {
        await playerRepository.incrementCash(serverId, busterId, reward);
      }

      logRepository.write(serverId, {
        type: ACTION_TYPES.JAILBREAK_SUCCESS,
        busterId,
        targetId,
        reward,
        timestamp: now,
      }).catch(() => {});

      return {
        success: true,
        data: {
          outcome: "success",
          reward,
          targetName: target.username || targetId,
        },
        message: reward > 0
          ? `You broke **${target.username || "them"}** out! You received $${reward.toLocaleString()}.`
          : `You broke **${target.username || "them"}** out!`,
      };
    }

    if (outcome === "caught") {
      // Jail the buster for 5 mins, extend target sentence by 5 mins
      const busterJailUntil  = now + CAUGHT_JAIL_MS;
      const targetJailUntil  = (target.jailedUntil || now) + CAUGHT_EXTEND_MS;

      await Promise.all([
        playerRepository.updatePlayer(serverId, busterId, { jailedUntil: busterJailUntil }),
        playerRepository.updatePlayer(serverId, targetId, { jailedUntil: targetJailUntil }),
      ]);

      logRepository.write(serverId, {
        type: ACTION_TYPES.JAILBREAK_CAUGHT,
        busterId,
        targetId,
        timestamp: now,
      }).catch(() => {});

      return {
        success: true,
        data: {
          outcome: "caught",
          targetName: target.username || targetId,
          busterJailUntil,
        },
        message: `You were caught trying to bust **${target.username || "them"}**! You have been jailed for 5 minutes and their sentence was extended.`,
      };
    }

    // fail
    logRepository.write(serverId, {
      type: ACTION_TYPES.JAILBREAK_FAIL,
      busterId,
      targetId,
      timestamp: now,
    }).catch(() => {});

    return {
      success: true,
      data: {
        outcome: "fail",
        targetName: target.username || targetId,
      },
      message: `You attempted to bust **${target.username || "them"}** but failed. Better luck next time.`,
    };
  } catch (err) {
    console.error("[jailbreakService.attemptBust]", err);
    return { success: false, message: "Something went wrong during the bust attempt." };
  }
}

module.exports = { getJailedPlayers, setBustReward, attemptBust };
