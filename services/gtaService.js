// ─────────────────────────────────────────────
//  gtaService.js  —  All GTA game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const {
  CARS,
  RANKS,
  WEAPONS,
  VEHICLES,
  GTA_COOLDOWN,
  GTA_BASE_RATE,
  GTA_MAX_RATE,
  GTA_JAIL_CHANCE,
  GTA_JAIL_TIME,
  GTA_XP_RANGE,
  CREW_UPGRADES,
  ACTION_TYPES,
  PRESTIGE_CRIME_BONUS,
  UPGRADES,
} = require('../data/constants');

const playerRepository = require('../repositories/playerRepository');
const logRepository    = require('../repositories/logRepository');
const { randInt, getRankIndex } = require('../utils/helpers');

// ── Internal helpers ──────────────────────────

function rankIndex(player) {
  return getRankIndex(player.xp ?? 0, RANKS);
}

function getCrewBonuses(crew) {
  if (!crew) return { crewFailBonus: 0, crewArrestReduction: 0 };
  const upgrades = crew.upgrades ?? {};
  const crewFailBonus       = (upgrades.fail_chance   ?? 0) * CREW_UPGRADES.fail_chance.bonusPerLevel;
  const crewArrestReduction = (upgrades.arrest_chance ?? 0) * CREW_UPGRADES.arrest_chance.bonusPerLevel;
  return { crewFailBonus, crewArrestReduction };
}

function getGtaItemBonus(player) {
  let bonus = 0;
  const weaponEntry  = player.inventory?.equippedWeapon;
  const vehicleEntry = player.inventory?.equippedVehicle;
  const weaponDef    = weaponEntry  ? WEAPONS[weaponEntry.id]   : null;
  const vehicleDef   = vehicleEntry ? VEHICLES[vehicleEntry.id] : null;
  if (weaponDef?.gtaBonus)  bonus += weaponDef.gtaBonus;
  if (vehicleDef?.gtaBonus) bonus += vehicleDef.gtaBonus;
  return bonus;
}

/**
 * Pick a random car from the player's unlocked pool.
 */
function pickRandomCar(rIdx) {
  const pool = Object.values(CARS).filter(c => c.rankRequired <= rIdx);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getGtaCooldownMs() {
  return GTA_COOLDOWN * 1000;
}

function gtaCooldownState(player) {
  const lastUsed    = player.cooldowns?.gta ?? null;
  const nextMs      = lastUsed ? lastUsed + getGtaCooldownMs() : 0;
  const remainingMs = Math.max(0, nextMs - Date.now());
  return { onCooldown: remainingMs > 0, cooldownRemainingMs: remainingMs, nextAvailableMs: nextMs };
}

// ── Public API ────────────────────────────────

/**
 * Return cars unlocked at the player's current rank.
 */
function getUnlockedCars(player) {
  const rIdx = rankIndex(player);
  return Object.values(CARS)
    .filter(c => c.rankRequired <= rIdx)
    .sort((a, b) => a.rankRequired - b.rankRequired);
}

/**
 * Attempt a GTA steal.  Returns a Result Object including the stolen car in data
 * so the panel can offer melt / sell choice.
 */
async function attemptGTA(serverId, discordId, crew = null) {
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

  // ── Cooldown check ────────────────────────
  const cdState = gtaCooldownState(player);
  if (cdState.onCooldown) {
    return {
      success: false,
      message: 'GTA is on cooldown.',
      data: { onCooldown: true, nextAvailableMs: cdState.nextAvailableMs },
      updates: {},
      log: null,
    };
  }

  const rIdx = rankIndex(player);
  const { crewFailBonus, crewArrestReduction } = getCrewBonuses(crew);
  const gtaItemBonus  = getGtaItemBonus(player);
  const prestigeBonus = (player.prestige ?? 0) * PRESTIGE_CRIME_BONUS;

  const finalRate = Math.min(
    GTA_MAX_RATE,
    GTA_BASE_RATE + gtaItemBonus + crewFailBonus + prestigeBonus
  );

  const roll    = Math.random();
  const success = roll < finalRate;

  const now            = Date.now();
  const cooldownUpdate = { 'cooldowns.gta': now };

  if (success) {
    const car      = pickRandomCar(rIdx);
    const xpGained = randInt(GTA_XP_RANGE[0], GTA_XP_RANGE[1]);

    const updates = {
      ...cooldownUpdate,
      xp: (player.xp ?? 0) + xpGained,
      'stats.gtaAttempted':  (player.stats?.gtaAttempted  ?? 0) + 1,
      'stats.gtaSucceeded':  (player.stats?.gtaSucceeded  ?? 0) + 1,
    };

    await playerRepository.updatePlayer(serverId, discordId, updates);

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.GTA,
      actionName: 'gta_attempt',
      location:   player.state,
      payload: {
        success: true,
        carId: car.id, carName: car.name,
        xpGained,
        finalRate: +finalRate.toFixed(3),
      },
    }).catch(() => {});

    const garage     = player.inventory?.garage ?? [];
    const garageMax  = (UPGRADES.garage_size?.baseValue ?? 5) + (player.upgrades?.garage_size ?? 0) * (UPGRADES.garage_size?.valuePerLevel ?? 2);
    const garageFull = garage.length >= garageMax;

    return {
      success: true,
      message: `You stole a **${car.name}**! What do you want to do with it?`,
      data: {
        car,
        xpGained,
        finalRate,
        pendingCar:  car.id,
        garageFull,
        garageCount: garage.length,
        garageMax,
      },
      updates,
      log: { actionType: ACTION_TYPES.GTA, actionName: 'gta_attempt' },
    };

  } else {
    const effectiveJailChance = Math.max(0, GTA_JAIL_CHANCE - crewArrestReduction);
    const jailRoll = Math.random();
    const jailed   = jailRoll < effectiveJailChance;

    let updates = {
      ...cooldownUpdate,
      'stats.gtaAttempted': (player.stats?.gtaAttempted ?? 0) + 1,
    };
    let jailedUntil = null;

    if (jailed) {
      jailedUntil = now + GTA_JAIL_TIME * 1000;
      updates.jailedUntil = jailedUntil;
    }

    await playerRepository.updatePlayer(serverId, discordId, updates);

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.GTA,
      actionName: 'gta_attempt',
      location:   player.state,
      payload: {
        success: false,
        jailed, jailDuration: jailed ? GTA_JAIL_TIME : 0,
        finalRate: +finalRate.toFixed(3),
      },
    }).catch(() => {});

    return {
      success: false,
      message: jailed
        ? 'You were caught stealing a car and arrested!'
        : 'You failed to steal the car but managed to escape.',
      data: { jailed, jailedUntil, finalRate },
      updates,
      log: { actionType: ACTION_TYPES.GTA, actionName: 'gta_attempt' },
    };
  }
}

/**
 * Melt a previously stolen car for bullets.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {string} carId
 */
async function meltCar(serverId, discordId, carId, fromGarage = false) {
  const car = CARS[carId];
  if (!car) {
    return { success: false, message: 'Unknown car.', data: {}, updates: {}, log: null };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  const bulletsEarned = car.meltBullets;
  const updates = {
    bullets: (player.bullets ?? 0) + bulletsEarned,
    'stats.gtaMelted':      (player.stats?.gtaMelted      ?? 0) + 1,
    'stats.bulletsFromGta': (player.stats?.bulletsFromGta ?? 0) + bulletsEarned,
  };

  if (fromGarage) {
    const garage = [...(player.inventory?.garage ?? [])];
    const idx    = garage.indexOf(carId);
    if (idx !== -1) garage.splice(idx, 1);
    updates['inventory.garage'] = garage;
  }

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.GTA,
    actionName: 'gta_melt',
    location:   player.state,
    payload:    { carId, carName: car.name, bulletsEarned },
  }).catch(() => {});

  return {
    success: true,
    message: `You melted the **${car.name}** and got **${bulletsEarned} bullets**!`,
    data: { car, bulletsEarned },
    updates,
    log: { actionType: ACTION_TYPES.GTA, actionName: 'gta_melt' },
  };
}

/**
 * Sell a previously stolen car for cash.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {string} carId
 */
async function sellCar(serverId, discordId, carId, fromGarage = false) {
  const car = CARS[carId];
  if (!car) {
    return { success: false, message: 'Unknown car.', data: {}, updates: {}, log: null };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  const cashEarned = car.value;
  const updates = {
    cash: (player.cash ?? 0) + cashEarned,
    'stats.gtaSold':     (player.stats?.gtaSold     ?? 0) + 1,
    'stats.cashFromGta': (player.stats?.cashFromGta ?? 0) + cashEarned,
  };

  if (fromGarage) {
    const garage = [...(player.inventory?.garage ?? [])];
    const idx    = garage.indexOf(carId);
    if (idx !== -1) garage.splice(idx, 1);
    updates['inventory.garage'] = garage;
  }

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.GTA,
    actionName: 'gta_sell',
    location:   player.state,
    payload:    { carId, carName: car.name, cashEarned },
  }).catch(() => {});

  return {
    success: true,
    message: `You sold the **${car.name}** for **$${cashEarned.toLocaleString('en-US')}**!`,
    data: { car, cashEarned },
    updates,
    log: { actionType: ACTION_TYPES.GTA, actionName: 'gta_sell' },
  };
}

/**
 * Store a stolen car in the garage.
 */
async function storeCar(serverId, discordId, carId) {
  const car = CARS[carId];
  if (!car) return { success: false, message: 'Unknown car.', data: {}, updates: {}, log: null };

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };

  const garage    = [...(player.inventory?.garage ?? [])];
  const garageMax = (UPGRADES.garage_size?.baseValue ?? 5) + (player.upgrades?.garage_size ?? 0) * (UPGRADES.garage_size?.valuePerLevel ?? 2);

  if (garage.length >= garageMax) {
    return {
      success: false,
      message: `Your garage is full (${garage.length}/${garageMax}). Melt or sell a car to make space.`,
      data: { garageFull: true, garageCount: garage.length, garageMax },
      updates: {},
      log: null,
    };
  }

  garage.push(carId);
  const updates = { 'inventory.garage': garage };
  await playerRepository.updatePlayer(serverId, discordId, updates);

  return {
    success: true,
    message: `**${car.name}** stored in your garage. (${garage.length}/${garageMax} slots used)`,
    data: { car, garageCount: garage.length, garageMax },
    updates,
    log: null,
  };
}

/**
 * Get garage summary for a player.
 */
function getGarage(player) {
  const garage    = player.inventory?.garage ?? [];
  const garageMax = (UPGRADES.garage_size?.baseValue ?? 5) + (player.upgrades?.garage_size ?? 0) * (UPGRADES.garage_size?.valuePerLevel ?? 2);
  const cars      = garage.map(id => CARS[id]).filter(Boolean);
  const totalValue   = cars.reduce((sum, c) => sum + c.value, 0);
  const totalBullets = cars.reduce((sum, c) => sum + c.meltBullets, 0);
  return { cars, garage, garageMax, totalValue, totalBullets };
}

/**
 * Melt all cars in garage.
 */
async function meltAll(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };

  const garage = player.inventory?.garage ?? [];
  if (garage.length === 0) return { success: false, message: 'Your garage is empty.', data: {}, updates: {}, log: null };

  const cars          = garage.map(id => CARS[id]).filter(Boolean);
  const totalBullets  = cars.reduce((sum, c) => sum + c.meltBullets, 0);

  const updates = {
    bullets: (player.bullets ?? 0) + totalBullets,
    'inventory.garage':     [],
    'stats.gtaMelted':      (player.stats?.gtaMelted      ?? 0) + cars.length,
    'stats.bulletsFromGta': (player.stats?.bulletsFromGta ?? 0) + totalBullets,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.GTA,
    actionName: 'gta_melt_all',
    location:   player.state,
    payload:    { count: cars.length, totalBullets },
  }).catch(() => {});

  return {
    success: true,
    message: `Melted **${cars.length} cars** for **${totalBullets} bullets**!`,
    data: { count: cars.length, totalBullets },
    updates,
    log: null,
  };
}

/**
 * Sell all cars in garage.
 */
async function sellAll(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };

  const garage = player.inventory?.garage ?? [];
  if (garage.length === 0) return { success: false, message: 'Your garage is empty.', data: {}, updates: {}, log: null };

  const cars       = garage.map(id => CARS[id]).filter(Boolean);
  const totalCash  = cars.reduce((sum, c) => sum + c.value, 0);

  const updates = {
    cash: (player.cash ?? 0) + totalCash,
    'inventory.garage':  [],
    'stats.gtaSold':     (player.stats?.gtaSold     ?? 0) + cars.length,
    'stats.cashFromGta': (player.stats?.cashFromGta ?? 0) + totalCash,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.GTA,
    actionName: 'gta_sell_all',
    location:   player.state,
    payload:    { count: cars.length, totalCash },
  }).catch(() => {});

  return {
    success: true,
    message: `Sold **${cars.length} cars** for **$${totalCash.toLocaleString('en-US')}**!`,
    data: { count: cars.length, totalCash },
    updates,
    log: null,
  };
}

module.exports = { attemptGTA, meltCar, sellCar, storeCar, meltAll, sellAll, getGarage, getUnlockedCars };
