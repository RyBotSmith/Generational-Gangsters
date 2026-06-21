// ─────────────────────────────────────────────
//  crewService ADDITION  —  purchaseUpgrade()
//
//  Add this function to crewService.js and add
//  'purchaseUpgrade' to the module.exports.
//
//  Requires these imports already present in crewService.js:
//    CREW_UPGRADES from constants
//    playerRepository, crewRepository, logRepository
//    ACTION_TYPES from constants
// ─────────────────────────────────────────────

// ── ADD to top-level destructure of constants ──
// CREW_UPGRADES  ← add this if not already imported

/**
 * Purchase a crew upgrade. Leader-only — deducted from player's cash.
 *
 * Upgrade IDs match CREW_UPGRADES keys:
 *   fail_chance | arrest_chance | stop_search | collect_cooldown
 *
 * @param {string} serverId
 * @param {string} discordId   — must be the crew leader
 * @param {string} upgradeId
 */
async function purchaseUpgrade(serverId, discordId, upgradeId) {
  const { CREW_UPGRADES } = require('../data/constants');

  const upgradeDef = CREW_UPGRADES[upgradeId];
  if (!upgradeDef) {
    return { success: false, message: 'Unknown upgrade.', data: {} };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {} };
  }

  if (!player.crewId) {
    return { success: false, message: 'You need a crew to purchase upgrades.', data: {} };
  }

  const crew = await crewRepository.getCrew(serverId, player.crewId);
  if (!crew) {
    return { success: false, message: 'Crew not found.', data: {} };
  }

  // Leader-only gate
  if (crew.leaderId !== discordId) {
    return { success: false, message: 'Only the crew leader can purchase upgrades.', data: {} };
  }

  const maxLevel     = upgradeDef.maxLevel ?? 3;
  const currentLevel = crew.upgrades?.[upgradeId] ?? 0;

  if (currentLevel >= maxLevel) {
    return {
      success: false,
      message: `**${upgradeDef.name}** is already at max level (${maxLevel}).`,
      data:    { maxed: true },
    };
  }

  const cost = Math.floor(upgradeDef.baseCost * Math.pow(upgradeDef.costMultiplier ?? 1.5, currentLevel));

  if ((player.cash ?? 0) < cost) {
    return {
      success: false,
      message: `You need **${formatCash(cost)}** to upgrade **${upgradeDef.name}** to level ${currentLevel + 1}.`,
      data:    { insufficientFunds: true, cost },
    };
  }

  const newLevel = currentLevel + 1;

  await crewRepository.updateCrew(serverId, player.crewId, {
    [`upgrades.${upgradeId}`]: newLevel,
  });

  await playerRepository.updatePlayer(serverId, discordId, {
    cash: (player.cash ?? 0) - cost,
  });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'crew_upgrade',
    location:   player.state,
    payload:    { crewId: player.crewId, upgradeId, newLevel, cost },
  }).catch(() => {});

  return {
    success: true,
    message: `**${upgradeDef.name}** upgraded to level **${newLevel}/${maxLevel}**!${newLevel === maxLevel ? ' (maxed)' : ''}`,
    data:    { upgradeId, newLevel, maxLevel, cost },
  };
}

// ── Helper used inside purchaseUpgrade ────────
// (already imported in crewService — add formatCash if not present)
const { formatCash } = require('../utils/helpers');

// ── MERGE into module.exports in crewService.js ──
// module.exports = { create, hireThug, getThugIncome, processThugs, purchaseUpgrade };
