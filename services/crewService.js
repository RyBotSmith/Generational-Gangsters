// ─────────────────────────────────────────────
//  crewService.js  —  All crew / thug game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
//
//  Scope (this session): solo passive crew system only.
//  No members, no roles, no invite/join/leave, no OC.
//
//  Worker simulation model:
//  Each hired worker (slot 1–6) runs crimes/GTA from the player's
//  unlocked pool at CREW_WORKER_COOLDOWN_MULT (-20%) of the normal
//  cooldown. Rather than scheduling real timers, we lazily simulate
//  completed cycles whenever processThugs() is called (i.e. on panel
//  open), based on elapsed time since the worker's lastProcessedAt.
//  Pending payouts accumulate on the crew doc until the player collects.
// ─────────────────────────────────────────────

const {
  RANKS,
  CRIMES,
  CARS,
  GTA_COOLDOWN,
  GTA_XP_RANGE,
  CREW_CREATION_COST,
  CREW_WORKER_SLOTS,
  CREW_WORKER_COOLDOWN_MULT,
  CREW_WORKER_ARREST_CHANCE,
  CREW_WORKER_FAIL_CHANCE,
  CREW_WORKER_SEIZURE_CHANCE,
  CREW_WORKER_ARREST_PAUSE,
  ACTION_TYPES,
} = require('../data/constants');

const playerRepository = require('../repositories/playerRepository');
const crewRepository    = require('../repositories/crewRepository');
const logRepository     = require('../repositories/logRepository');
const { randInt, getRankIndex } = require('../utils/helpers');

// Cap the number of cycles simulated in a single processThugs() call,
// so a worker that's been idle for days doesn't loop forever.
const MAX_CYCLES_PER_PROCESS = 200;

// ── Internal helpers ──────────────────────────

function rankIndex(player) {
  return getRankIndex(player.xp ?? 0, RANKS);
}

/**
 * Crimes unlocked at the player's current rank.
 */
function unlockedCrimes(player) {
  const rIdx = rankIndex(player);
  return Object.values(CRIMES).filter(c => c.rankRequired <= rIdx);
}

/**
 * Cars unlocked at the player's current rank (worker GTA pool).
 */
function unlockedCars(player) {
  const rIdx = rankIndex(player);
  return Object.values(CARS).filter(c => c.rankRequired <= rIdx);
}

/**
 * Worker cooldown for a crime, in ms, at -20%.
 */
function workerCrimeCooldownMs(crime) {
  return crime.cooldown * 1000 * CREW_WORKER_COOLDOWN_MULT;
}

/**
 * Worker GTA cooldown in ms, at -20%.
 */
function workerGtaCooldownMs() {
  return GTA_COOLDOWN * 1000 * CREW_WORKER_COOLDOWN_MULT;
}

/**
 * Default worker doc shape.
 */
function defaultWorker(now) {
  return {
    hiredAt: now,
    lastProcessedAt: now,
    pausedUntil: null,   // epoch ms — arrest pause
    pendingCash: 0,
    pendingXp: 0,
    pendingBullets: 0,
    lifetimeCash: 0,
    lifetimeXp: 0,
    lifetimeBullets: 0,
    cyclesRun: 0,
  };
}

/**
 * Simulate one worker's idle time since lastProcessedAt, running as many
 * completed cycles as fit (capped). Alternates crime/GTA per cycle.
 * Mutates and returns the worker object plus a summary of this run.
 */
function simulateWorker(worker, player) {
  const now = Date.now();
  let cursor = worker.lastProcessedAt ?? now;

  // If paused, skip ahead to the pause end (no cycles run while paused).
  if (worker.pausedUntil && worker.pausedUntil > cursor) {
    if (worker.pausedUntil >= now) {
      // Still paused — nothing to do.
      return { worker, cyclesRun: 0 };
    }
    cursor = worker.pausedUntil;
  }

  const crimes = unlockedCrimes(player);
  const cars   = unlockedCars(player);

  let cyclesRun  = 0;
  let cashGained = 0;
  let xpGained   = 0;
  let bulletsGained = 0;
  let arrests = 0;
  let fails   = 0;
  let seizures = 0;

  while (cyclesRun < MAX_CYCLES_PER_PROCESS) {
    // Pick a random activity: crime or GTA (50/50), weighted by availability.
    const runGta = cars.length > 0 && (crimes.length === 0 || Math.random() < 0.5);

    let cooldownMs;
    if (runGta) {
      cooldownMs = workerGtaCooldownMs();
    } else if (crimes.length > 0) {
      const crime = crimes[Math.floor(Math.random() * crimes.length)];
      cooldownMs = workerCrimeCooldownMs(crime);
    } else {
      // No crimes or cars unlocked at all — nothing for the worker to do.
      break;
    }

    const cycleEnd = cursor + cooldownMs;
    if (cycleEnd > now) break; // cycle not finished yet

    // ── Resolve this cycle ──────────────────
    const arrestRoll = Math.random();
    if (arrestRoll < CREW_WORKER_ARREST_CHANCE) {
      arrests++;
      cursor = cycleEnd + CREW_WORKER_ARREST_PAUSE * 1000;
      worker.pausedUntil = cursor;
      cyclesRun++;
      // Arrested cycle yields nothing; pause means we stop simulating further.
      break;
    }

    const failRoll = Math.random();
    if (failRoll < CREW_WORKER_FAIL_CHANCE) {
      fails++;
      cursor = cycleEnd;
      cyclesRun++;
      continue;
    }

    // ── Success ─────────────────────────────
    if (runGta) {
      const car = cars[Math.floor(Math.random() * cars.length)];
      const bullets = randInt(10, car.meltBullets > 10 ? Math.max(10, Math.round(car.meltBullets * 1.5)) : 15);
      const xp = randInt(GTA_XP_RANGE[0], GTA_XP_RANGE[1]);

      const seizureRoll = Math.random();
      if (seizureRoll < CREW_WORKER_SEIZURE_CHANCE) {
        seizures++;
        // cash seized — GTA has no cash component, so only xp/bullets stand
        bulletsGained += 0;
        xpGained += xp;
      } else {
        bulletsGained += bullets;
        xpGained += xp;
      }
    } else {
      const crime = crimes[Math.floor(Math.random() * crimes.length)];
      const cash = randInt(crime.baseCash[0], crime.baseCash[1]);
      const xp   = randInt(crime.baseXP[0], crime.baseXP[1]);
      let bullets = 0;
      if (crime.bulletReward && crime.bulletRange) {
        bullets = randInt(crime.bulletRange[0], crime.bulletRange[1]);
      }

      const seizureRoll = Math.random();
      if (seizureRoll < CREW_WORKER_SEIZURE_CHANCE) {
        seizures++;
        xpGained += xp;
        bulletsGained += bullets;
        // cash seized — not added
      } else {
        cashGained += cash;
        xpGained += xp;
        bulletsGained += bullets;
      }
    }

    cursor = cycleEnd;
    cyclesRun++;
  }

  worker.lastProcessedAt = cursor > now ? now : cursor;
  worker.pendingCash     = (worker.pendingCash ?? 0) + cashGained;
  worker.pendingXp       = (worker.pendingXp ?? 0) + xpGained;
  worker.pendingBullets  = (worker.pendingBullets ?? 0) + bulletsGained;
  worker.cyclesRun       = (worker.cyclesRun ?? 0) + cyclesRun;

  return {
    worker,
    cyclesRun,
    cashGained,
    xpGained,
    bulletsGained,
    arrests,
    fails,
    seizures,
  };
}

// ── Public API ────────────────────────────────

/**
 * Create a new crew. Costs CREW_CREATION_COST. Player must not already
 * belong to a crew.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {string} leaderName  - Discord display name (for crew record)
 * @param {string} name        - chosen crew name
 */
async function create(serverId, discordId, leaderName, name) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  if (player.crewId) {
    return {
      success: false,
      message: 'You already belong to a crew.',
      data: { alreadyInCrew: true },
      updates: {},
      log: null,
    };
  }

  const trimmedName = (name ?? '').trim();
  if (trimmedName.length < 3 || trimmedName.length > 32) {
    return {
      success: false,
      message: 'Crew name must be between 3 and 32 characters.',
      data: { invalidName: true },
      updates: {},
      log: null,
    };
  }

  const existing = await crewRepository.getCrewByName(serverId, trimmedName);
  if (existing) {
    return {
      success: false,
      message: `A crew named **${trimmedName}** already exists.`,
      data: { nameTaken: true },
      updates: {},
      log: null,
    };
  }

  if ((player.cash ?? 0) < CREW_CREATION_COST) {
    return {
      success: false,
      message: `You need **$${CREW_CREATION_COST.toLocaleString('en-US')}** to create a crew.`,
      data: { insufficientFunds: true, required: CREW_CREATION_COST },
      updates: {},
      log: null,
    };
  }

  // ── Apply ──────────────────────────────────
  const crewId = `${serverId}_${discordId}_${Date.now()}`;

  const crew = await crewRepository.createCrew(serverId, crewId, discordId, leaderName, trimmedName);

  const playerUpdates = {
    cash: (player.cash ?? 0) - CREW_CREATION_COST,
    crewId,
    crewRole: 'leader',
  };
  await playerRepository.updatePlayer(serverId, discordId, playerUpdates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.SOCIAL,
    actionName: 'crew_create',
    location: player.state,
    payload: { crewId, name: trimmedName, cost: CREW_CREATION_COST },
  }).catch(() => {});

  return {
    success: true,
    message: `You founded **${trimmedName}** for **$${CREW_CREATION_COST.toLocaleString('en-US')}**!`,
    data: { crewId, crew },
    updates: playerUpdates,
    log: { actionType: ACTION_TYPES.SOCIAL, actionName: 'crew_create' },
  };
}

/**
 * Hire a thug into the next available worker slot.
 *
 * @param {string} serverId
 * @param {string} discordId
 */
async function hireThug(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  if (!player.crewId) {
    return {
      success: false,
      message: 'You need a crew to hire workers. Use `/crew create` first.',
      data: { noCrew: true },
      updates: {},
      log: null,
    };
  }

  const crew = await crewRepository.getCrew(serverId, player.crewId);
  if (!crew) {
    return {
      success: false,
      message: 'Your crew could not be found.',
      data: { noCrew: true },
      updates: {},
      log: null,
    };
  }

  const workers = crew.workers ?? {};
  const hiredSlots = Object.keys(workers).map(Number);

  // Find the next slot to hire — lowest numbered slot not yet hired.
  const slotIds = Object.keys(CREW_WORKER_SLOTS).map(Number).sort((a, b) => a - b);
  const nextSlot = slotIds.find(s => !hiredSlots.includes(s));

  if (!nextSlot) {
    return {
      success: false,
      message: `You've hired all ${slotIds.length} worker slots.`,
      data: { allSlotsHired: true },
      updates: {},
      log: null,
    };
  }

  const slotConfig = CREW_WORKER_SLOTS[nextSlot];

  // ── Afford check ───────────────────────────
  if ((player.cash ?? 0) < slotConfig.cost) {
    return {
      success: false,
      message: `You need **$${slotConfig.cost.toLocaleString('en-US')}** to hire Worker Slot ${nextSlot}.`,
      data: { insufficientFunds: true, required: slotConfig.cost, slot: nextSlot },
      updates: {},
      log: null,
    };
  }

  // ── Apply ──────────────────────────────────
  const now = Date.now();
  const worker = defaultWorker(now);

  await crewRepository.updateCrew(serverId, player.crewId, {
    [`workers.${nextSlot}`]: worker,
  });

  const playerUpdates = { cash: (player.cash ?? 0) - slotConfig.cost };
  await playerRepository.updatePlayer(serverId, discordId, playerUpdates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.SOCIAL,
    actionName: 'crew_hire_thug',
    location: player.state,
    payload: { crewId: player.crewId, slot: nextSlot, cost: slotConfig.cost },
  }).catch(() => {});

  return {
    success: true,
    message: `You hired a thug into **Worker Slot ${nextSlot}** for **$${slotConfig.cost.toLocaleString('en-US')}**!`,
    data: { crewId: player.crewId, slot: nextSlot, cost: slotConfig.cost, worker },
    updates: playerUpdates,
    log: { actionType: ACTION_TYPES.SOCIAL, actionName: 'crew_hire_thug' },
  };
}

/**
 * Get a read-only view of total pending thug income (cash, xp, bullets)
 * without mutating anything. Use processThugs() first if you want this
 * to reflect time elapsed since the last process.
 */
function getThugIncome(crew) {
  const workers = crew?.workers ?? {};
  let pendingCash = 0;
  let pendingXp = 0;
  let pendingBullets = 0;

  for (const worker of Object.values(workers)) {
    pendingCash    += worker.pendingCash ?? 0;
    pendingXp      += worker.pendingXp ?? 0;
    pendingBullets += worker.pendingBullets ?? 0;
  }

  return { pendingCash, pendingXp, pendingBullets, workerCount: Object.keys(workers).length };
}

/**
 * Simulate all hired workers up to "now", accumulating pending payouts
 * on the crew doc. Does NOT pay out to the player — call collectThugs()
 * (or pass collect=true) to do that.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {{ collect?: boolean }} [opts]  - if collect=true, also pays out
 *   pending income to the player and clears it (used for "auto-collect on
 *   panel open").
 */
async function processThugs(serverId, discordId, opts = {}) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  if (!player.crewId) {
    return {
      success: true,
      message: 'No crew.',
      data: { noCrew: true, pendingCash: 0, pendingXp: 0, pendingBullets: 0, workerCount: 0 },
      updates: {},
      log: null,
    };
  }

  const crew = await crewRepository.getCrew(serverId, player.crewId);
  if (!crew) {
    return {
      success: true,
      message: 'No crew.',
      data: { noCrew: true, pendingCash: 0, pendingXp: 0, pendingBullets: 0, workerCount: 0 },
      updates: {},
      log: null,
    };
  }

  const workers = crew.workers ?? {};
  const workerEntries = Object.entries(workers);

  if (workerEntries.length === 0) {
    return {
      success: true,
      message: 'No workers hired yet.',
      data: { pendingCash: 0, pendingXp: 0, pendingBullets: 0, workerCount: 0, crew },
      updates: {},
      log: null,
    };
  }

  let totalCycles = 0;
  let totalCash = 0;
  let totalXp = 0;
  let totalBullets = 0;
  let totalArrests = 0;
  let totalFails = 0;
  let totalSeizures = 0;

  const workerUpdates = {};

  for (const [slot, worker] of workerEntries) {
    const result = simulateWorker({ ...worker }, player);
    workerUpdates[`workers.${slot}`] = result.worker;

    totalCycles   += result.cyclesRun;
    totalCash     += result.cashGained;
    totalXp       += result.xpGained;
    totalBullets  += result.bulletsGained;
    totalArrests  += result.arrests;
    totalFails    += result.fails;
    totalSeizures += result.seizures;
  }

  if (Object.keys(workerUpdates).length > 0) {
    await crewRepository.updateCrew(serverId, player.crewId, workerUpdates);
  }

  // Re-fetch (cheap) to compute up-to-date totals across all workers,
  // including any pending amounts accumulated from prior runs.
  const updatedCrew = await crewRepository.getCrew(serverId, player.crewId);
  const income = getThugIncome(updatedCrew);

  if (!opts.collect || (income.pendingCash <= 0 && income.pendingXp <= 0 && income.pendingBullets <= 0)) {
    return {
      success: true,
      message: totalCycles > 0
        ? `Your workers completed **${totalCycles}** job${totalCycles === 1 ? '' : 's'}.`
        : 'Your workers haven\'t finished any jobs yet.',
      data: {
        crew: updatedCrew,
        cyclesRun: totalCycles,
        arrests: totalArrests,
        fails: totalFails,
        seizures: totalSeizures,
        ...income,
      },
      updates: {},
      log: null,
    };
  }

  // ── Collect: pay out and clear pending ─────
  const playerUpdates = {
    cash: (player.cash ?? 0) + income.pendingCash,
    xp:   (player.xp ?? 0) + income.pendingXp,
    bullets: (player.bullets ?? 0) + income.pendingBullets,
  };
  await playerRepository.updatePlayer(serverId, discordId, playerUpdates);

  const clearUpdates = {};
  for (const [slot, worker] of Object.entries(updatedCrew.workers ?? {})) {
    clearUpdates[`workers.${slot}`] = {
      ...worker,
      pendingCash: 0,
      pendingXp: 0,
      pendingBullets: 0,
      lifetimeCash:    (worker.lifetimeCash ?? 0) + (worker.pendingCash ?? 0),
      lifetimeXp:      (worker.lifetimeXp ?? 0) + (worker.pendingXp ?? 0),
      lifetimeBullets: (worker.lifetimeBullets ?? 0) + (worker.pendingBullets ?? 0),
    };
  }
  await crewRepository.updateCrew(serverId, player.crewId, clearUpdates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'crew_collect_thugs',
    location: player.state,
    payload: { crewId: player.crewId, ...income, cyclesRun: totalCycles },
  }).catch(() => {});

  return {
    success: true,
    message: `Your workers earned **$${Math.floor(income.pendingCash).toLocaleString('en-US')}**, **${income.pendingXp} XP**, and **${income.pendingBullets} bullets**!`,
    data: {
      crew: { ...updatedCrew, workers: clearUpdates },
      cyclesRun: totalCycles,
      arrests: totalArrests,
      fails: totalFails,
      seizures: totalSeizures,
      collected: true,
      ...income,
    },
    updates: playerUpdates,
    log: { actionType: ACTION_TYPES.ECONOMY, actionName: 'crew_collect_thugs' },
  };
}

module.exports = {
  create,
  hireThug,
  getThugIncome,
  processThugs,
};
