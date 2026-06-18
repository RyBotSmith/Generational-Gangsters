// ─────────────────────────────────────────────
//  crimeService.js  —  All crime game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const {
  CRIMES,
  RANKS,
  WEAPONS,
  VEHICLES,
  CRIME_JAIL_CHANCE,
  CREW_UPGRADES,
  ACTION_TYPES,
  PRESTIGE_CRIME_BONUS,
} = require('../data/constants');

const playerRepository = require('../repositories/playerRepository');
const logRepository    = require('../repositories/logRepository');
const { randInt, getRankIndex } = require('../utils/helpers');

// ── Internal helpers ──────────────────────────

/**
 * Get crew bonuses for crime/GTA from a crew document (or null).
 * fail_chance upgrade: -2% per level → adds to finalRate
 * arrest_chance upgrade: -5% per level → reduces jailChance
 */
function getCrewBonuses(crew) {
  if (!crew) return { crewFailBonus: 0, crewArrestReduction: 0 };
  const upgrades = crew.upgrades ?? {};
  const crewFailBonus       = (upgrades.fail_chance    ?? 0) * CREW_UPGRADES.fail_chance.bonusPerLevel;
  const crewArrestReduction = (upgrades.arrest_chance  ?? 0) * CREW_UPGRADES.arrest_chance.bonusPerLevel;
  return { crewFailBonus, crewArrestReduction };
}

/**
 * Sum all crimeBonus values from equipped items.
 */
function getItemBonus(player) {
  let bonus = 0;
  const weaponEntry  = player.inventory?.equippedWeapon;
  const vehicleEntry = player.inventory?.equippedVehicle;
  const weaponDef    = weaponEntry  ? WEAPONS[weaponEntry.id]   : null;
  const vehicleDef   = vehicleEntry ? VEHICLES[vehicleEntry.id] : null;
  if (weaponDef?.crimeBonus)  bonus += weaponDef.crimeBonus;
  if (vehicleDef?.crimeBonus) bonus += vehicleDef.crimeBonus;
  return bonus;
}

/**
 * Derive rank index from a player's XP.
 */
function rankIndex(player) {
  return getRankIndex(player.xp ?? 0, RANKS);
}

/**
 * Effective crime cooldown in ms for a given crime, respecting crew upgrade.
 * collect_cooldown upgrade does NOT apply to crimes — only to businesses.
 */
function effectiveCooldownMs(crime) {
  // No crew reduction on crime cooldowns (only collect_cooldown affects businesses)
  return crime.cooldown * 1000;
}

// ── Public API ────────────────────────────────

/**
 * Return all crimes the player has unlocked, with cooldown state.
 * @returns {{ crime, onCooldown, cooldownRemainingMs }[]}
 */
function getAllCrimes(player) {
  const rank = rankIndex(player);
  const now  = Date.now();

  return Object.values(CRIMES)
    .filter(c => c.rankRequired <= rank)
    .map(c => {
      const lastUsed = getNestedField(player, `cooldowns.crime_${c.id}`);
      const cooldownMs = effectiveCooldownMs(c);
      const nextAvailableMs = lastUsed ? lastUsed + cooldownMs : 0;
      const remainingMs     = Math.max(0, nextAvailableMs - now);

      return {
        crime: c,
        onCooldown:          remainingMs > 0,
        cooldownRemainingMs: remainingMs,
        nextAvailableMs,
      };
    })
    .sort((a, b) => a.crime.rankRequired - b.crime.rankRequired);
}

/**
 * Get cooldown state for a single crime.
 */
function getCrimeCooldown(player, crimeId) {
  const crime = CRIMES[crimeId];
  if (!crime) return null;

  const lastUsed    = getNestedField(player, `cooldowns.crime_${crimeId}`);
  const cooldownMs  = effectiveCooldownMs(crime);
  const nextMs      = lastUsed ? lastUsed + cooldownMs : 0;
  const remainingMs = Math.max(0, nextMs - Date.now());

  return {
    crimeId,
    onCooldown:          remainingMs > 0,
    cooldownRemainingMs: remainingMs,
    nextAvailableMs:     nextMs,
  };
}

/**
 * Attempt a crime.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {string} crimeId
 * @param {object|null} crew  — crew document or null
 * @returns {object} Result Object
 */
async function attemptCrime(serverId, discordId, crimeId, crew = null) {
  const crime = CRIMES[crimeId];
  if (!crime) {
    return { success: false, message: 'Unknown crime.', data: {}, updates: {}, log: null };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  // ── Status checks ─────────────────────────
  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return {
      success: false,
      message: 'You are in jail.',
      data: { jailed: true, jailedUntil: player.jailedUntil },
      updates: {},
      log: null,
    };
  }

  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return {
      success: false,
      message: 'You are in hospital.',
      data: { hospitalized: true, hospitalizedUntil: player.hospitalizedUntil },
      updates: {},
      log: null,
    };
  }

  if (player.travelling && player.travelEndTime > Date.now()) {
    return {
      success: false,
      message: 'You are travelling.',
      data: { travelling: true },
      updates: {},
      log: null,
    };
  }

  // ── Rank check ────────────────────────────
  const rIdx = rankIndex(player);
  if (crime.rankRequired > rIdx) {
    return {
      success: false,
      message: `You need to be rank **${RANKS[crime.rankRequired].name}** to attempt this crime.`,
      data: { rankRequired: crime.rankRequired },
      updates: {},
      log: null,
    };
  }

  // ── Cooldown check ────────────────────────
  const cdState = getCrimeCooldown(player, crimeId);
  if (cdState.onCooldown) {
    return {
      success: false,
      message: 'This crime is on cooldown.',
      data: { onCooldown: true, nextAvailableMs: cdState.nextAvailableMs },
      updates: {},
      log: null,
    };
  }

  // ── Success rate calculation ──────────────
  const itemBonus     = getItemBonus(player);
  const { crewFailBonus, crewArrestReduction } = getCrewBonuses(crew);
  const { getCrimePrestigeBonus } = require('./prestigeService');
  const prestigeBonus = getCrimePrestigeBonus(player);

  const finalRate = Math.min(
    0.95,
    crime.successRate + itemBonus + crewFailBonus + prestigeBonus
  );

  const roll    = Math.random();
  const success = roll < finalRate;

  // ── Cooldown timestamp (always set, win or lose) ──
  const now = Date.now();
  const cooldownUpdate = { [`cooldowns.crime_${crimeId}`]: now };

  if (success) {
    // ── SUCCESS ───────────────────────────
    const cashEarned = randInt(crime.baseCash[0], crime.baseCash[1]);
    const xpGained   = randInt(crime.baseXP[0],  crime.baseXP[1]);
    let bulletsEarned = 0;
    if (crime.bulletReward && crime.bulletRange) {
      bulletsEarned = randInt(crime.bulletRange[0], crime.bulletRange[1]);
    }

    const updates = {
      ...cooldownUpdate,
      cash:    (player.cash ?? 0) + cashEarned,
      xp:      (player.xp  ?? 0) + xpGained,
      bullets: (player.bullets ?? 0) + bulletsEarned,
      'stats.crimesAttempted': (player.stats?.crimesAttempted ?? 0) + 1,
      'stats.crimesSucceeded': (player.stats?.crimesSucceeded ?? 0) + 1,
      'stats.cashFromCrimes':  (player.stats?.cashFromCrimes  ?? 0) + cashEarned,
    };

    await playerRepository.updatePlayer(serverId, discordId, updates);

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.CRIME,
      actionName: 'crime_attempt',
      location:   player.state,
      payload: {
        crimeId, success: true,
        cashEarned, xpGained, bulletsEarned,
        finalRate: +finalRate.toFixed(3),
      },
    }).catch(() => {});

    return {
      success: true,
      message: `You successfully pulled off **${crime.name}**!`,
      data: { crimeId, crimeName: crime.name, cashEarned, xpGained, bulletsEarned, finalRate },
      updates,
      log: { actionType: ACTION_TYPES.CRIME, actionName: 'crime_attempt' },
    };

  } else {
    // ── FAILURE ───────────────────────────
    const effectiveJailChance = Math.max(0, CRIME_JAIL_CHANCE - crewArrestReduction);
    const jailRoll = Math.random();
    const jailed   = jailRoll < effectiveJailChance;

    let updates = {
      ...cooldownUpdate,
      'stats.crimesAttempted': (player.stats?.crimesAttempted ?? 0) + 1,
    };
    let jailedUntil = null;

    if (jailed) {
      jailedUntil = now + crime.jailTime * 1000;
      updates.jailedUntil = jailedUntil;
      updates['stats.crimesJailed'] = (player.stats?.crimesJailed ?? 0) + 1;
    }

    await playerRepository.updatePlayer(serverId, discordId, updates);

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.CRIME,
      actionName: 'crime_attempt',
      location:   player.state,
      payload: {
        crimeId, success: false,
        jailed, jailDuration: jailed ? crime.jailTime : 0,
        finalRate: +finalRate.toFixed(3),
      },
    }).catch(() => {});

    if (jailed) {
      logRepository.write(serverId, {
        discordId,
        actionType: ACTION_TYPES.CRIME,
        actionName: 'crime_jail',
        location:   player.state,
        payload:    { crimeId, jailDuration: crime.jailTime },
      }).catch(() => {});
    }

    return {
      success: false,
      message: jailed
        ? `You were caught attempting **${crime.name}** and thrown in jail!`
        : `You failed to pull off **${crime.name}** but escaped without arrest.`,
      data: { crimeId, crimeName: crime.name, jailed, jailedUntil, finalRate },
      updates,
      log: { actionType: ACTION_TYPES.CRIME, actionName: 'crime_attempt' },
    };
  }
}

// ── Internal util ─────────────────────────────

/**
 * Read a dot-notation path from an object (e.g. 'cooldowns.crime_pickpocket').
 */
function getNestedField(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? null;
}

/**
 * Commit all eligible crimes in rank order.
 * Skips rank-locked and on-cooldown crimes.
 * Stops immediately if a crime results in jail.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {object|null} crew
 * @returns {{ results: object[], jailed: boolean }}
 */
async function commitAllCrimes(serverId, discordId, crew = null) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { results: [{ success: false, message: 'Player not found.', data: {}, skipped: false }], jailed: false };
  }

  // Status checks — bail before attempting anything
  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return {
      results: [{ success: false, message: 'You are in jail.', data: { jailed: true, jailedUntil: player.jailedUntil }, skipped: false }],
      jailed: true,
    };
  }

  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return {
      results: [{ success: false, message: 'You are in hospital.', data: { hospitalized: true, hospitalizedUntil: player.hospitalizedUntil }, skipped: false }],
      jailed: false,
    };
  }

  if (player.travelling && player.travelEndTime > Date.now()) {
    return {
      results: [{ success: false, message: 'You are travelling.', data: { travelling: true }, skipped: false }],
      jailed: false,
    };
  }

  const allCrimes = getAllCrimes(player);

  // Shuffle so high-tier crimes aren't always attempted last
  for (let i = allCrimes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCrimes[i], allCrimes[j]] = [allCrimes[j], allCrimes[i]];
  }
  const results   = [];
  let jailed      = false;

  for (const { crime, onCooldown, cooldownRemainingMs, nextAvailableMs } of allCrimes) {
    // Always include rank-locked crimes as skipped entries (they pass getAllCrimes filter
    // so all here are rank-unlocked — cooldown and jail are the only skip reasons)
    if (onCooldown) {
      results.push({
        success:  false,
        skipped:  true,
        onCooldown: true,
        message:  `**${crime.name}** is on cooldown.`,
        data:     { crimeId: crime.id, crimeName: crime.name, onCooldown: true, nextAvailableMs, cooldownRemainingMs },
      });
      continue;
    }

    // Attempt this crime
    const result = await attemptCrime(serverId, discordId, crime.id, crew);
    results.push({ ...result, skipped: false });

    if (result.data?.jailed) {
      jailed = true;
      break;
    }
  }

  return { results, jailed };
}

module.exports = { attemptCrime, getCrimeCooldown, getAllCrimes, commitAllCrimes };
