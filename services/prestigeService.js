// ─────────────────────────────────────────────
//  prestigeService.js  —  Prestige game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const {
  PRESTIGE_MAX,
  PRESTIGE_REQUIRE_XP,
  PRESTIGE_CRIME_BONUS,
  ACTION_TYPES,
} = require('../data/constants');

const playerRepository = require('../repositories/playerRepository');
const logRepository    = require('../repositories/logRepository');

// ── Helpers ───────────────────────────────────

/**
 * Get effective crime bonus from prestige allocations.
 */
function getCrimePrestigeBonus(player) {
  const allocs = player.prestigeAllocations ?? [];
  return allocs.filter(a => a === 'crime').length * PRESTIGE_CRIME_BONUS;
}

/**
 * Get effective GTA bonus from prestige allocations.
 */
function getGtaPrestigeBonus(player) {
  const allocs = player.prestigeAllocations ?? [];
  return allocs.filter(a => a === 'gta').length * PRESTIGE_CRIME_BONUS;
}

/**
 * Check if player is eligible to prestige.
 */
function checkEligible(player) {
  if ((player.prestige ?? 0) >= PRESTIGE_MAX) {
    return { eligible: false, reason: 'You have reached the maximum prestige level (5).' };
  }
  if ((player.xp ?? 0) < PRESTIGE_REQUIRE_XP) {
    return {
      eligible: false,
      reason: `You need **1,000,000 XP** (Infamous Gangster) to prestige. You have **${(player.xp ?? 0).toLocaleString()} XP**.`,
    };
  }
  return { eligible: true };
}

// ── Public API ────────────────────────────────

/**
 * Get prestige panel state.
 */
async function getPrestigeState(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const currentPrestige = player.prestige ?? 0;
  const nextPrestige    = currentPrestige + 1;
  const eligible        = checkEligible(player);

  return {
    success: true,
    data: {
      player,
      currentPrestige,
      nextPrestige,
      eligible: eligible.eligible,
      reason:   eligible.reason ?? null,
      // What the next prestige requires the player to choose
      requiresChoice: nextPrestige <= 3 ? 'allocation' : nextPrestige === 4 ? 'perk4' : 'perk5',
    },
  };
}

/**
 * Attempt prestige with a choice.
 *
 * @param {string} choice
 *   Prestige 1-3: 'crime' | 'gta'
 *   Prestige 4:   'cooldown' | 'capacity'
 *   Prestige 5:   'bullets' | 'cash'
 */
async function prestige(serverId, discordId, choice) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const check = checkEligible(player);
  if (!check.eligible) {
    return { success: false, message: check.reason, data: {} };
  }

  const currentPrestige     = player.prestige ?? 0;
  const nextPrestige        = currentPrestige + 1;
  const prestigeAllocations = [...(player.prestigeAllocations ?? [])];

  // Validate choice for this prestige level
  if (nextPrestige <= 3) {
    if (!['crime', 'gta'].includes(choice)) {
      return { success: false, message: 'Choose **crime** or **gta**.', data: {} };
    }
    prestigeAllocations.push(choice);
  } else if (nextPrestige === 4) {
    if (!['cooldown', 'capacity'].includes(choice)) {
      return { success: false, message: 'Choose **cooldown** or **capacity**.', data: {} };
    }
  } else if (nextPrestige === 5) {
    if (!['bullets', 'cash'].includes(choice)) {
      return { success: false, message: 'Choose **bullets** or **cash**.', data: {} };
    }
  }

  // ── Build reset updates ───────────────────
  const updates = {
    prestige:              nextPrestige,
    prestigeAllocations,
    xp:                    0,
    rankIndex:             0,

    // Reset all upgrades EXCEPT bank_vault
    'upgrades.booze_capacity': 0,
    'upgrades.drug_capacity':  0,
    'upgrades.garage_size':    0,
    'upgrades.crime_cooldown': 0,
    'upgrades.gta_cooldown':   0,
    // bank_vault intentionally preserved
  };

  // ── Apply prestige 4 perk ─────────────────
  if (nextPrestige === 4) {
    updates.prestige4Perk = choice; // 'cooldown' | 'capacity'
  }

  // ── Apply prestige 5 reward ───────────────
  if (nextPrestige === 5) {
    updates.prestige5Perk = choice;
    if (choice === 'bullets') {
      updates.bullets = (player.bullets ?? 0) + 10000;
    } else {
      updates.cash = (player.cash ?? 0) + 5000000;
    }
  }

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'prestige',
    location:   player.state,
    payload:    { nextPrestige, choice },
  }).catch(() => {});

  // Build result message
  let rewardMsg = '';
  if (nextPrestige <= 3) {
    rewardMsg = `+10% **${choice === 'crime' ? 'Crime' : 'GTA'}** success rate applied.`;
  } else if (nextPrestige === 4) {
    rewardMsg = choice === 'cooldown'
      ? '**Cooldown Mastery** — all cooldowns reduced by a further 20% beyond upgrade cap.'
      : '**Storage Empire** — booze and drug capacity increased by 20 beyond upgrade cap.';
  } else {
    rewardMsg = choice === 'bullets'
      ? '**+10,000 bullets** added to your arsenal.'
      : '**+$5,000,000** dropped into your cash.';
  }

  return {
    success: true,
    message: `🌟 **Prestige ${nextPrestige}** achieved!\n\n${rewardMsg}\n\nYour rank and XP have been reset. The grind begins again.`,
    data:    { nextPrestige, choice, prestigeAllocations },
  };
}

module.exports = { getPrestigeState, prestige, getCrimePrestigeBonus, getGtaPrestigeBonus, checkEligible };
