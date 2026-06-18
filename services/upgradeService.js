// ─────────────────────────────────────────────
//  upgradeService.js  —  All upgrade game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const { UPGRADES, ACTION_TYPES } = require('../data/constants');
const playerRepository = require('../repositories/playerRepository');
const logRepository    = require('../repositories/logRepository');

// ── Helpers ───────────────────────────────────

/**
 * Cost of the next level for a given upgrade.
 */
function getUpgradeCost(upgradeId, currentLevel) {
  const upg = UPGRADES[upgradeId];
  if (!upg) return null;
  return Math.floor(upg.baseCost * Math.pow(upg.costMultiplier, currentLevel));
}

/**
 * Current value description for an upgrade at a given level.
 */
function getUpgradeValue(upgradeId, level) {
  const upg = UPGRADES[upgradeId];
  if (!upg) return null;

  switch (upgradeId) {
    case 'bank_vault':
      return `$${(100000 * Math.pow(2, level)).toLocaleString('en-US')} limit`;
    case 'booze_capacity':
      return `${upg.baseValue + level * upg.valuePerLevel} cases`;
    case 'drug_capacity':
      return `${upg.baseValue + level * upg.valuePerLevel} units`;
    case 'garage_size':
      return `${upg.baseValue + level * upg.valuePerLevel} slots`;
    case 'crime_cooldown':
      return level === 0 ? 'No reduction' : `-${Math.round(level * upg.valuePerLevel * 100)}%`;
    case 'gta_cooldown':
      return level === 0 ? 'No reduction' : `-${level * upg.valuePerLevel}s`;
    default:
      return `Level ${level}`;
  }
}

/**
 * Get full upgrade state for a player — all upgrades with cost, level, value.
 */
// Upgrades shown in the panel — cooldown upgrades are shown on their respective panels
const PANEL_UPGRADES = ['bank_vault', 'booze_capacity', 'drug_capacity', 'garage_size'];

function getAllUpgrades(player) {
  return Object.values(UPGRADES)
    .filter(upg => PANEL_UPGRADES.includes(upg.id))
    .map(upg => {
    const currentLevel = player.upgrades?.[upg.id] ?? 0;
    const maxed        = currentLevel >= upg.maxLevel;
    const nextCost     = maxed ? null : getUpgradeCost(upg.id, currentLevel);
    const currentValue = getUpgradeValue(upg.id, currentLevel);
    const nextValue    = maxed ? null : getUpgradeValue(upg.id, currentLevel + 1);

    return {
      id:           upg.id,
      name:         upg.name,
      description:  upg.description,
      currentLevel,
      maxLevel:     upg.maxLevel,
      maxed,
      nextCost,
      currentValue,
      nextValue,
    };
  });
}

// ── Public API ────────────────────────────────

/**
 * Purchase the next level of an upgrade.
 */
async function purchaseUpgrade(serverId, discordId, upgradeId) {
  const upg = UPGRADES[upgradeId];
  if (!upg) {
    return { success: false, message: 'Unknown upgrade.', data: {}, updates: {}, log: null };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  // ── Status checks ─────────────────────────
  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot buy upgrades while in jail.', data: { jailed: true }, updates: {}, log: null };
  }
  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return { success: false, message: 'You cannot buy upgrades while in hospital.', data: { hospitalized: true }, updates: {}, log: null };
  }

  const currentLevel = player.upgrades?.[upgradeId] ?? 0;

  if (currentLevel >= upg.maxLevel) {
    return {
      success: false,
      message: `**${upg.name}** is already at max level (${upg.maxLevel}).`,
      data: { maxed: true },
      updates: {},
      log: null,
    };
  }

  const cost = getUpgradeCost(upgradeId, currentLevel);

  if ((player.cash ?? 0) < cost) {
    return {
      success: false,
      message: `You need **$${cost.toLocaleString('en-US')}** to upgrade **${upg.name}**. You have **$${(player.cash ?? 0).toLocaleString('en-US')}**.`,
      data: { insufficientFunds: true, required: cost, have: player.cash ?? 0 },
      updates: {},
      log: null,
    };
  }

  const newLevel = currentLevel + 1;
  const updates  = {
    cash: (player.cash ?? 0) - cost,
    [`upgrades.${upgradeId}`]: newLevel,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'upgrade_purchase',
    location:   player.state,
    payload:    { upgradeId, newLevel, cost },
  }).catch(() => {});

  return {
    success: true,
    message: `**${upg.name}** upgraded to level **${newLevel}**! Now: ${getUpgradeValue(upgradeId, newLevel)}.`,
    data: {
      upgradeId,
      upgradeName:  upg.name,
      newLevel,
      maxLevel:     upg.maxLevel,
      cost,
      newValue:     getUpgradeValue(upgradeId, newLevel),
      nextCost:     newLevel >= upg.maxLevel ? null : getUpgradeCost(upgradeId, newLevel),
    },
    updates,
    log: { actionType: ACTION_TYPES.ECONOMY, actionName: 'upgrade_purchase' },
  };
}

module.exports = { purchaseUpgrade, getAllUpgrades, getUpgradeCost, getUpgradeValue };
