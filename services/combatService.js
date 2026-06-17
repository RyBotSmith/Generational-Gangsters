// ─────────────────────────────────────────────
//  combatService.js  —  All combat game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const {
  RANKS,
  WEAPONS,
  ARMOUR,
  RANK_KILL_BULLETS,
  BODYGUARD_KILL_BULLETS,
  BODYGUARD_COSTS,
  BODYGUARD_ATTACK_ORDER,
  DEATH_CASH_LOSS_PCT,
  DEATH_BULLET_LOSS_PCT_MIN,
  DEATH_BULLET_LOSS_PCT_MAX,
  DEATH_RESPAWN_SECONDS,
  SEARCH_PLAYER_COST,
  SEARCH_BODYGUARD_COST,
  SEARCH_INTEL_EXPIRY,
  ACTION_TYPES,
} = require('../data/constants');

const playerRepository = require('../repositories/playerRepository');
const logRepository    = require('../repositories/logRepository');
const { randInt, getRankIndex } = require('../utils/helpers');

// Search durations (seconds)
const SEARCH_PLAYER_DURATION    = 300;  // 5 mins
const SEARCH_BODYGUARD_DURATION = 600;  // 10 mins

// ── Internal helpers ──────────────────────────

function rankIndex(player) {
  return getRankIndex(player.xp ?? 0, RANKS);
}

function rankName(player) {
  return RANKS[rankIndex(player)]?.name ?? 'Hobo';
}

/**
 * Sum armour bonuses across vest + headwear slots (additive).
 */
/**
 * Sum armour bonuses across vest + headwear slots (additive).
 * Stored inventory items only carry { id, shotsAbsorbed, deathsSurvived } —
 * the armorBonus value itself lives in the ARMOUR definitions table.
 */
function getArmourBonus(player) {
  let bonus = 0;
  const armour   = player.inventory?.armour;
  const headwear = player.inventory?.headwear;
  if (armour?.id)   bonus += ARMOUR[armour.id]?.armorBonus ?? 0;
  if (headwear?.id) bonus += ARMOUR[headwear.id]?.armorBonus ?? 0;
  return bonus;
}

/**
 * Weapon bullet-reduction fraction (0 if unarmed).
 */
/**
 * Weapon bullet-reduction fraction (0 if unarmed).
 * Stored inventory item only carries { id, shotsUsed, killsUsed } —
 * the reduction value itself lives in the WEAPONS definitions table.
 */
function getWeaponReduction(player) {
  const weapon = player.inventory?.weapon;
  if (!weapon?.id) return 0;
  return WEAPONS[weapon.id]?.reduction ?? 0;
}

/**
 * Bullets required to kill a target player (rank + armour + attacker weapon).
 *
 * baseBullets   = RANK_KILL_BULLETS[defenderRankIdx]
 * armourMult    = 1 + sum(armorBonus of equipped armour + headwear)
 * weaponMult    = 1 - attackerWeapon.reduction (0 if unarmed)
 *
 * bulletsToKill = ceil(baseBullets × (1 - weaponReduction) × (1 + armourBonus))
 */
function calcBulletsToKill(attacker, defender) {
  const rIdx           = rankIndex(defender);
  const baseBullets    = RANK_KILL_BULLETS[rIdx] ?? RANK_KILL_BULLETS[0];
  const armourBonus    = getArmourBonus(defender);
  const weaponReduction = getWeaponReduction(attacker);

  return Math.ceil(baseBullets * (1 - weaponReduction) * (1 + armourBonus));
}

/**
 * Bullets required to kill a bodyguard — always flat, ignores armour/weapons.
 */
function calcBulletsToKillBodyguard() {
  return BODYGUARD_KILL_BULLETS;
}

/**
 * Calculate damage dealt to a target's HP for a given bullet spend,
 * proportional to the bullets-to-kill requirement.
 *
 * A shot that spends exactly `bulletsToKill` bullets deals 100 HP (a kill).
 * Bullets spent are always exactly bulletsToKill (full burst) in this design —
 * but calcDamage is exposed for partial-bullet scenarios / future use.
 *
 * @param {number} bulletsSpent
 * @param {number} bulletsToKill
 * @returns {number} HP damage (0-100), rounded down
 */
function calcDamage(bulletsSpent, bulletsToKill) {
  if (bulletsToKill <= 0) return 100;
  const ratio = bulletsSpent / bulletsToKill;
  return Math.min(100, Math.floor(ratio * 100));
}

/**
 * Get the next bodyguard slot an attacker must target, per BODYGUARD_ATTACK_ORDER.
 * Returns the slot number (1-4) of the first alive BG found, or null if none alive.
 */
function getNextBodyguardSlot(victim) {
  const bodyguards = victim.bodyguards ?? {};
  for (const slot of BODYGUARD_ATTACK_ORDER) {
    const bg = bodyguards[slot];
    if (bg && bg.alive) return slot;
  }
  return null;
}

/**
 * Check whether a victim currently has any living bodyguards.
 */
function hasLivingBodyguard(victim) {
  return getNextBodyguardSlot(victim) !== null;
}

/**
 * Read a dot-notation path from an object.
 */
function getNestedField(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? null;
}

/**
 * Apply weapon durability after a shot. Returns updated inventory.weapon
 * (or null if the weapon broke) plus a flag indicating breakage.
 *
 * Durability: durabilityShots uses, OR durabilityKills player kills — whichever first.
 */
function applyWeaponDurability(player, wasKill) {
  const weapon = player.inventory?.weapon;
  if (!weapon) return { weapon: null, broke: false };

  const shotsUsed = (weapon.shotsUsed ?? 0) + 1;
  const killsUsed = (weapon.killsUsed ?? 0) + (wasKill ? 1 : 0);

  const def = WEAPONS[weapon.id] ?? weapon;
  const maxShots = def.durabilityShots ?? Infinity;
  const maxKills = def.durabilityKills ?? Infinity;

  if (shotsUsed >= maxShots || killsUsed >= maxKills) {
    return { weapon: null, broke: true };
  }

  return { weapon: { ...weapon, shotsUsed, killsUsed }, broke: false };
}

/**
 * Apply armour durability after the wearer is hit/killed.
 * durabilityShots: number of times shot at while equipped.
 * durabilityDeaths: number of player deaths while equipped.
 * Whichever threshold is hit first destroys the item.
 *
 * Schema fields (playerSchema.js): { id, shotsAbsorbed, deathsSurvived }
 *
 * @param {object|null} item  - equipped armour or headwear item (with id)
 * @param {boolean} wasKill
 * @returns {{ item: object|null, broke: boolean }}
 */
function applyArmourDurability(item, wasKill) {
  if (!item) return { item: null, broke: false };

  const shotsAbsorbed   = (item.shotsAbsorbed ?? 0) + 1;
  const deathsSurvived  = (item.deathsSurvived ?? 0) + (wasKill ? 1 : 0);

  const def = ARMOUR[item.id] ?? item;
  const maxShots  = def.durabilityShots ?? Infinity;
  const maxDeaths = def.durabilityDeaths ?? Infinity;

  if (shotsAbsorbed >= maxShots || deathsSurvived >= maxDeaths) {
    return { item: null, broke: true };
  }

  return { item: { ...item, shotsAbsorbed, deathsSurvived }, broke: false };
}

// ── Intel helpers ──────────────────────────────

/**
 * Prune expired entries from a player's searchHistory.
 * Pure function — returns a new array.
 */
function pruneExpiredIntel(searchHistory = []) {
  const now = Date.now();
  return searchHistory.filter(entry => entry.expiresAt > now);
}

/**
 * Prune completed/cancelled entries are NOT removed here —
 * activeSearches are removed only on collect.
 * This just prunes nothing for activeSearches (kept for symmetry / future use).
 */
function pruneActiveSearches(activeSearches = []) {
  return [...activeSearches];
}

/**
 * Build a deduplication key for a search target.
 * type: 'player' | 'bodyguard'
 * bgSlot only relevant for 'bodyguard' type.
 */
function searchKey(targetId, type, bgSlot = null) {
  return type === 'bodyguard' ? `bg:${targetId}:${bgSlot}` : `player:${targetId}`;
}

/**
 * Build fresh intel snapshot data for a target at collection time.
 */
function buildIntel(targetPlayer, type, bgSlot) {
  if (type === 'bodyguard') {
    const bg = targetPlayer.bodyguards?.[bgSlot];
    return {
      type: 'bodyguard',
      bgSlot,
      bgName:  bg?.name ?? `Slot ${bgSlot} Bodyguard`,
      bgAlive: bg?.alive ?? false,
      bgHp:    bg?.hp ?? 0,
      ownerState: targetPlayer.state ?? null,
    };
  }

  return {
    type: 'player',
    state:   targetPlayer.state ?? null,
    alive:   targetPlayer.alive !== false,
    health:  targetPlayer.health ?? 100,
    xp:      targetPlayer.xp ?? 0,
    rank:    rankName(targetPlayer),
    bodyguards: BODYGUARD_ATTACK_ORDER.reduce((acc, slot) => {
      const bg = targetPlayer.bodyguards?.[slot] ?? { alive: false, hp: 0 };
      acc[slot] = {
        alive: bg.alive === true,
        hp: bg.hp ?? 0,
        name: bg.name ?? null,
      };
      return acc;
    }, {}),
    weapon:  targetPlayer.inventory?.weapon?.id  ?? null,
    armour:  targetPlayer.inventory?.armour?.id  ?? null,
    headwear: targetPlayer.inventory?.headwear?.id ?? null,
  };
}

/**
 * After a successful shot, patch the attacker's searchHistory so intel
 * reflects the current state of the target (alive/hp/bodyguard).
 * Fire-and-forget — never awaited, never throws.
 *
 * @param {string} serverId
 * @param {string} attackerId
 * @param {object} attacker        - attacker player object (has searchHistory)
 * @param {string} targetId
 * @param {'player'|'bodyguard'} type
 * @param {number|null} bgSlot
 * @param {object} intelPatch      - fields to merge into the intel object
 */
function patchIntelAfterShot(serverId, attackerId, attacker, targetId, type, bgSlot, intelPatch) {
  const history = attacker.searchHistory ?? [];
  const key = searchKey(targetId, type, bgSlot);
  const idx = history.findIndex(h => searchKey(h.targetId, h.type, h.bgSlot) === key);
  if (idx === -1) return; // no intel to patch

  const updated = history.map((h, i) =>
    i === idx ? { ...h, intel: { ...h.intel, ...intelPatch } } : h
  );

  playerRepository.updatePlayer(serverId, attackerId, { searchHistory: updated }).catch(() => {});
}

/**
 * When a shoot hits a bodyguard, write a lightweight reveal entry into
 * the attacker's searchHistory so that BG slot appears in the search dropdown.
 * If an entry already exists for this slot it is left untouched.
 * Fire-and-forget — never awaited, never throws.
 */
function revealBodyguard(serverId, attacker, victim, bgSlot) {
  const history = attacker.searchHistory ?? [];
  const key = searchKey(victim.discordId, 'bodyguard', bgSlot);
  const alreadyRevealed = history.some(h => searchKey(h.targetId, h.type, h.bgSlot) === key);
  if (alreadyRevealed) return;

  const bg = victim.bodyguards?.[bgSlot];
  const now = Date.now();

  const revealEntry = {
    searchId:    null,
    targetId:    victim.discordId,
    targetName:  victim.username ?? victim.discordId,
    type:        'bodyguard',
    bgSlot,
    intel: {
      bgName:     bg?.name ?? `Slot ${bgSlot} Bodyguard`,
      bgAlive:    bg?.alive ?? true,
      bgHp:       bg?.hp ?? 100,
      revealed:   true,
      ownerState: victim.state ?? null,
    },
    collectedAt: now,
    expiresAt:   now + SEARCH_INTEL_EXPIRY * 1000,
  };

  const updatedHistory = [...history, revealEntry];
  playerRepository.updatePlayer(serverId, attacker.discordId, { searchHistory: updatedHistory }).catch(() => {});
}



/**
 * Get a player's current activeSearches with completion state attached.
 * Does NOT mutate or remove anything (read-only view).
 *
 * @returns {Array<{ ...entry, ready: boolean }>}
 */
function getActiveSearchesView(player) {
  const now = Date.now();
  return (player.activeSearches ?? []).map(s => ({
    ...s,
    ready: now >= s.completesAt,
  }));
}

/**
 * Get a player's current (non-expired) intel history.
 * Pure read — does not mutate the player doc. Callers that need to persist
 * pruning should write back the pruned array separately.
 */
function getIntelHistory(player) {
  return pruneExpiredIntel(player.searchHistory ?? []);
}

/**
 * Resolve any activeSearches that have completed, WITHOUT mutating them.
 * Returns { ready: [...], stillPending: [...] }.
 *
 * NOTE: This is a pure read helper. collectResults() is the only function
 * that should actually move entries from activeSearches → searchHistory,
 * and it must only be called once per collect (it strips entries).
 */
function getResolvedSearches(player) {
  const now = Date.now();
  const all = player.activeSearches ?? [];
  const ready = [];
  const stillPending = [];
  for (const s of all) {
    if (now >= s.completesAt) ready.push(s);
    else stillPending.push(s);
  }
  return { ready, stillPending };
}

/**
 * Dispatch a search on a target (player or one of their bodyguard slots).
 *
 * @param {string} serverId
 * @param {string} discordId   - searching player
 * @param {string} targetId    - target discordId
 * @param {string} type        - 'player' | 'bodyguard'
 * @param {number|null} bgSlot - required if type === 'bodyguard' (1-4)
 * @returns {object} Result Object
 */
async function search(serverId, discordId, targetId, type = 'player', bgSlot = null) {
  if (targetId === discordId) {
    return { success: false, message: 'You cannot search yourself.', data: {}, updates: {}, log: null };
  }

  if (type === 'bodyguard' && (!bgSlot || bgSlot < 1 || bgSlot > 4)) {
    return { success: false, message: 'Invalid bodyguard slot.', data: {}, updates: {}, log: null };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  const target = await playerRepository.getPlayer(serverId, targetId);
  if (!target) {
    return { success: false, message: 'Target not found.', data: {}, updates: {}, log: null };
  }

  // ── Status checks ─────────────────────────
  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You are in jail.', data: { jailed: true, jailedUntil: player.jailedUntil }, updates: {}, log: null };
  }
  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return { success: false, message: 'You are in hospital.', data: { hospitalized: true, hospitalizedUntil: player.hospitalizedUntil }, updates: {}, log: null };
  }

  // ── Cost / duration by type ────────────────
  const cost     = type === 'bodyguard' ? SEARCH_BODYGUARD_COST    : SEARCH_PLAYER_COST;
  const duration = type === 'bodyguard' ? SEARCH_BODYGUARD_DURATION : SEARCH_PLAYER_DURATION;

  if ((player.cash ?? 0) < cost) {
    return {
      success: false,
      message: `You need ${formatCash(cost)} to run this search.`,
      data: { insufficientFunds: true, required: cost, have: player.cash ?? 0 },
      updates: {},
      log: null,
    };
  }

  // ── Deduplication: refuse if an identical search is already active ──
  const key = searchKey(targetId, type, bgSlot);
  const existingActive = (player.activeSearches ?? []).find(
    s => searchKey(s.targetId, s.type, s.bgSlot) === key
  );
  if (existingActive) {
    return {
      success: false,
      message: 'You already have a search running on this target.',
      data: { duplicate: true, existing: existingActive },
      updates: {},
      log: null,
    };
  }

  // ── Build the new search entry ────────────
  const now = Date.now();
  const searchId = `s_${now}_${Math.floor(Math.random() * 1e6)}`;

  const entry = {
    searchId,
    targetId,
    targetName: target.username ?? targetId,
    type,
    bgSlot: type === 'bodyguard' ? bgSlot : null,
    startedAt: now,
    completesAt: now + duration * 1000,
    cost,
  };

  const activeSearches = [...(player.activeSearches ?? []), entry];

  const updates = {
    cash: (player.cash ?? 0) - cost,
    activeSearches,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.COMBAT,
    actionName: 'search_dispatched',
    location: player.state,
    payload: { targetId, targetName: entry.targetName, type, bgSlot, cost },
  }).catch(() => {});

  return {
    success: true,
    message: type === 'bodyguard'
      ? `Search dispatched on **${entry.targetName}**'s Slot ${bgSlot} bodyguard. Results in ${Math.ceil(duration / 60)} minutes.`
      : `Search dispatched on **${entry.targetName}**. Results in ${Math.ceil(duration / 60)} minutes.`,
    data: { entry },
    updates,
    log: { actionType: ACTION_TYPES.COMBAT, actionName: 'search_dispatched' },
  };
}

/**
 * Collect all completed searches: moves them from activeSearches into
 * searchHistory with fresh intel snapshots, and prunes expired intel.
 *
 * IMPORTANT: This function STRIPS completed entries from activeSearches.
 * It must only be called ONCE per collect action — calling it twice will
 * find nothing to collect the second time (not an error, but wasted work).
 * Callers should call this once, persist the result, and use the returned
 * `collected` array for rendering.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @returns {object} Result Object — data.collected = newly resolved intel entries
 */
async function collectResults(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  const { ready, stillPending } = getResolvedSearches(player);

  // Always prune expired intel, even if nothing new is ready.
  const prunedHistory = pruneExpiredIntel(player.searchHistory ?? []);

  if (ready.length === 0) {
    // Nothing to collect — but persist pruning if it changed anything.
    if (prunedHistory.length !== (player.searchHistory ?? []).length) {
      await playerRepository.updatePlayer(serverId, discordId, { searchHistory: prunedHistory });
    }
    return {
      success: true,
      message: 'No completed searches to collect.',
      data: { collected: [], pending: stillPending, history: prunedHistory },
      updates: {},
      log: null,
    };
  }

  const now = Date.now();
  const collected = [];

  for (const entry of ready) {
    const target = await playerRepository.getPlayer(serverId, entry.targetId);

    const intel = target
      ? buildIntel(target, entry.type, entry.bgSlot)
      : { type: entry.type, bgSlot: entry.bgSlot, unavailable: true };

    const historyEntry = {
      searchId: entry.searchId,
      targetId: entry.targetId,
      targetName: entry.targetName,
      type: entry.type,
      bgSlot: entry.bgSlot,
      intel,
      collectedAt: now,
      expiresAt: now + SEARCH_INTEL_EXPIRY * 1000,
    };

    // Deduplicate: replace any existing history entry on the same target/type/slot
    const key = searchKey(entry.targetId, entry.type, entry.bgSlot);
    const filteredHistory = prunedHistory.filter(
      h => searchKey(h.targetId, h.type, h.bgSlot) !== key
    );
    prunedHistory.length = 0;
    prunedHistory.push(...filteredHistory);

    prunedHistory.push(historyEntry);
    collected.push(historyEntry);
  }

  const updates = {
    activeSearches: stillPending,
    searchHistory: prunedHistory,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);

  for (const c of collected) {
    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.COMBAT,
      actionName: 'search_collected',
      location: player.state,
      payload: { targetId: c.targetId, targetName: c.targetName, type: c.type, bgSlot: c.bgSlot },
    }).catch(() => {});
  }

  return {
    success: true,
    message: `Collected ${collected.length} search result${collected.length === 1 ? '' : 's'}.`,
    data: { collected, pending: stillPending, history: prunedHistory },
    updates,
    log: { actionType: ACTION_TYPES.COMBAT, actionName: 'search_collected' },
  };
}

/**
 * Fire a shot at a target player (resolving bodyguards first per attack order).
 *
 * @param {string} serverId
 * @param {string} discordId  - attacker
 * @param {string} targetId   - victim
 * @returns {object} Result Object
 */
async function shoot(serverId, discordId, targetId) {
  if (targetId === discordId) {
    return { success: false, message: 'You cannot shoot yourself.', data: {}, updates: {}, log: null };
  }

  const attacker = await playerRepository.getPlayer(serverId, discordId);
  if (!attacker) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  const victim = await playerRepository.getPlayer(serverId, targetId);
  if (!victim) {
    return { success: false, message: 'Target not found.', data: {}, updates: {}, log: null };
  }

  // ── Status checks (attacker) ──────────────
  if (attacker.jailedUntil && Date.now() < attacker.jailedUntil) {
    return { success: false, message: 'You are in jail.', data: { jailed: true, jailedUntil: attacker.jailedUntil }, updates: {}, log: null };
  }
  if (attacker.hospitalizedUntil && Date.now() < attacker.hospitalizedUntil) {
    return { success: false, message: 'You are in hospital.', data: { hospitalized: true, hospitalizedUntil: attacker.hospitalizedUntil }, updates: {}, log: null };
  }
  if (attacker.travelling && attacker.travelEndTime > Date.now()) {
    return { success: false, message: 'You are travelling.', data: { travelling: true }, updates: {}, log: null };
  }

  // ── Status checks (victim) ────────────────
  if (victim.hospitalizedUntil && Date.now() < victim.hospitalizedUntil) {
    return {
      success: false,
      message: `**${victim.username ?? 'This player'}** is already in hospital and can't be attacked.`,
      data: { victimHospitalized: true, hospitalizedUntil: victim.hospitalizedUntil },
      updates: {},
      log: null,
    };
  }
  if (victim.witnessProtectionUntil && Date.now() < victim.witnessProtectionUntil) {
    return {
      success: false,
      message: `**${victim.username ?? 'This player'}** is under witness protection and cannot be attacked.`,
      data: { victimProtected: true },
      updates: {},
      log: null,
    };
  }

  // ── Location check ─────────────────────────
  if (attacker.state !== victim.state) {
    // Update intel location if attacker has valid intel on this player —
    // the failed attempt reveals where the target actually is.
    patchIntelAfterShot(serverId, attacker.discordId, attacker, victim.discordId, 'player', null, {
      state: victim.state,
    });

    return {
      success: false,
      message: `**${victim.username ?? 'Your target'}** is in **${victim.state}**. Travel there to shoot them.`,
      data: { wrongState: true, attackerState: attacker.state, victimState: victim.state },
      updates: {},
      log: null,
    };
  }

  // ── Resolve target: bodyguard or player ───
  const bgSlot = getNextBodyguardSlot(victim);

  if (bgSlot !== null) {
    // Reveal this BG slot in the attacker's searchHistory so it appears
    // in the search dropdown — fire-and-forget, expiry matches intel window.
    revealBodyguard(serverId, attacker, victim, bgSlot);

    const bg = victim.bodyguards?.[bgSlot];
    const bgName = bg?.name ?? `Slot ${bgSlot} Bodyguard`;

    return {
      success: false,
      message: `**${victim.username ?? 'Your target'}** is protected by **${bgName}**. Search and eliminate their bodyguard first.`,
      data: {
        outcome: 'blocked_by_bodyguard',
        victimId: victim.discordId,
        victimName: victim.username,
        bgSlot,
        bgName,
      },
      updates: {},
      log: null,
    };
  }

  return shootPlayer(serverId, attacker, victim);
}

/**
 * Public: shoot a specific bodyguard slot directly (after intel collected).
 * Called when player selects a BG from the shoot dropdown.
 *
 * @param {string} serverId
 * @param {string} discordId  - attacker
 * @param {string} targetId   - BG owner
 * @param {number} bgSlot     - slot to shoot (1-4)
 */
async function shootBg(serverId, discordId, targetId, bgSlot) {
  if (targetId === discordId) {
    return { success: false, message: 'You cannot shoot yourself.', data: {}, updates: {}, log: null };
  }

  const attacker = await playerRepository.getPlayer(serverId, discordId);
  if (!attacker) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  const victim = await playerRepository.getPlayer(serverId, targetId);
  if (!victim) {
    return { success: false, message: 'Target not found.', data: {}, updates: {}, log: null };
  }

  // ── Status checks (attacker) ──────────────
  if (attacker.jailedUntil && Date.now() < attacker.jailedUntil) {
    return { success: false, message: 'You are in jail.', data: { jailed: true, jailedUntil: attacker.jailedUntil }, updates: {}, log: null };
  }
  if (attacker.hospitalizedUntil && Date.now() < attacker.hospitalizedUntil) {
    return { success: false, message: 'You are in hospital.', data: { hospitalized: true, hospitalizedUntil: attacker.hospitalizedUntil }, updates: {}, log: null };
  }
  if (attacker.travelling && attacker.travelEndTime > Date.now()) {
    return { success: false, message: 'You are travelling.', data: { travelling: true }, updates: {}, log: null };
  }

  // ── Validate BG slot ──────────────────────
  const bg = victim.bodyguards?.[bgSlot];
  if (!bg || !bg.alive) {
    return {
      success: false,
      message: `That bodyguard slot is already dead or doesn't exist.`,
      data: { bgAlreadyDead: true },
      updates: {},
      log: null,
    };
  }

  // ── Location check ────────────────────────
  if (attacker.state !== victim.state) {
    patchIntelAfterShot(serverId, attacker.discordId, attacker, victim.discordId, 'bodyguard', bgSlot, {
      ownerState: victim.state,
    });
    return {
      success: false,
      message: `**${bg.name ?? `Slot ${bgSlot} Bodyguard`}** is in **${victim.state}**. Travel there to shoot them.`,
      data: { wrongState: true, attackerState: attacker.state, victimState: victim.state },
      updates: {},
      log: null,
    };
  }

  return shootBodyguard(serverId, attacker, victim, bgSlot);
}
async function shootBodyguard(serverId, attacker, victim, bgSlot) {
  const bullets = (attacker.bullets ?? 0);
  const bulletsToKill = calcBulletsToKillBodyguard();

  if (bullets < bulletsToKill) {
    return {
      success: false,
      message: `You need **${bulletsToKill} bullets** to take down this bodyguard. You only have **${bullets}**.`,
      data: { insufficientBullets: true, required: bulletsToKill, have: bullets },
      updates: {},
      log: null,
    };
  }

  const bg = victim.bodyguards[bgSlot];
  const bgName = bg?.name ?? `Slot ${bgSlot} Bodyguard`;

  // Bodyguard always dies in one resolved attack (flat cost = full HP pool)
  const updatedBodyguards = {
    ...victim.bodyguards,
    [bgSlot]: { ...bg, alive: false, hp: 0, killedAt: Date.now(), killedBy: attacker.discordId },
  };

  const attackerUpdates = {
    bullets: bullets - bulletsToKill,
  };

  const { weapon, broke } = applyWeaponDurability(attacker, false);
  attackerUpdates['inventory.weapon'] = weapon;

  const victimUpdates = {
    bodyguards: updatedBodyguards,
  };

  await playerRepository.updatePlayer(serverId, attacker.discordId, attackerUpdates);
  await playerRepository.updatePlayer(serverId, victim.discordId, victimUpdates);

  // Patch attacker's intel so the BG shows as dead
  patchIntelAfterShot(serverId, attacker.discordId, attacker, victim.discordId, 'bodyguard', bgSlot, {
    bgAlive: false,
    bgHp: 0,
  });

  logRepository.write(serverId, {
    location: attacker.state,
    payload: {
      attackerId: attacker.discordId,
      victimId: victim.discordId,
      victimName: victim.username,
      bgSlot,
      bgName,
      bulletsUsed: bulletsToKill,
    },
  }).catch(() => {});

  return {
    success: true,
    message: `You gunned down **${bgName}** (Slot ${bgSlot}) protecting **${victim.username ?? 'your target'}**!`,
    data: {
      outcome: 'kill_bodyguard',
      attackerId: attacker.discordId,
      victimId: victim.discordId,
      victimName: victim.username,
      bgSlot,
      bgName,
      bulletsUsed: bulletsToKill,
      bulletsRemaining: attackerUpdates.bullets,
      weaponBroke: broke,
      remainingBodyguards: getNextBodyguardSlot({ ...victim, bodyguards: updatedBodyguards }) !== null,
    },
    updates: attackerUpdates,
    log: { actionType: ACTION_TYPES.COMBAT, actionName: 'kill_bodyguard' },
  };
}

/**
 * Internal: resolve a shot against the player directly (no living BGs).
 */
async function shootPlayer(serverId, attacker, victim) {
  const bullets = (attacker.bullets ?? 0);
  const bulletsToKill = calcBulletsToKill(attacker, victim);

  if (bullets < bulletsToKill) {
    return {
      success: false,
      message: `You need **${bulletsToKill} bullets** to take down **${victim.username ?? 'this target'}**. You only have **${bullets}**.`,
      data: { insufficientBullets: true, required: bulletsToKill, have: bullets },
      updates: {},
      log: null,
    };
  }

  const damage      = calcDamage(bulletsToKill, bulletsToKill); // full burst → always lethal (100)
  const currentHp   = victim.health ?? 100;
  const newHp       = Math.max(0, currentHp - damage);
  const isKill      = newHp <= 0;

  const attackerUpdates = {
    bullets: bullets - bulletsToKill,
  };
  const victimUpdates = {};

  const { weapon: attackerWeapon, broke: weaponBroke } = applyWeaponDurability(attacker, isKill);
  attackerUpdates['inventory.weapon'] = attackerWeapon;

  if (!isKill) {
    // ── Non-lethal hit ───────────────────────
    victimUpdates.health = newHp;

    // Armour durability ticks on every hit (not a kill)
    const { item: newArmour, broke: armourBroke }   = applyArmourDurability(victim.inventory?.armour, false);
    const { item: newHeadwear, broke: headwearBroke } = applyArmourDurability(victim.inventory?.headwear, false);
    victimUpdates['inventory.armour']   = newArmour;
    victimUpdates['inventory.headwear'] = newHeadwear;

    await playerRepository.updatePlayer(serverId, attacker.discordId, attackerUpdates);
    await playerRepository.updatePlayer(serverId, victim.discordId, victimUpdates);

    // Patch attacker's intel so health reflects current state
    patchIntelAfterShot(serverId, attacker.discordId, attacker, victim.discordId, 'player', null, {
      health: newHp,
      alive: true,
    });

    logRepository.write(serverId, {
      discordId: attacker.discordId,
      actionType: ACTION_TYPES.COMBAT,
      actionName: 'damage_player',
      location: attacker.state,
      payload: {
        attackerId: attacker.discordId,
        victimId: victim.discordId,
        victimName: victim.username,
        damage,
        newHp,
        bulletsUsed: bulletsToKill,
      },
    }).catch(() => {});

    return {
      success: true,
      message: `You hit **${victim.username ?? 'your target'}** for **${damage} HP**! They're down to **${newHp} HP**.`,
      data: {
        outcome: 'damage_player',
        attackerId: attacker.discordId,
        victimId: victim.discordId,
        victimName: victim.username,
        damage,
        newHp,
        bulletsUsed: bulletsToKill,
        bulletsRemaining: attackerUpdates.bullets,
        weaponBroke,
        armourBroke,
        headwearBroke,
      },
      updates: attackerUpdates,
      log: { actionType: ACTION_TYPES.COMBAT, actionName: 'damage_player' },
    };
  }

  // ── Kill ─────────────────────────────────
  const victimCash = victim.cash ?? 0;
  const victimBullets = victim.bullets ?? 0;

  const cashStolen = Math.floor(victimCash * DEATH_CASH_LOSS_PCT);
  const bulletLossPct = randInt(
    Math.round(DEATH_BULLET_LOSS_PCT_MIN * 100),
    Math.round(DEATH_BULLET_LOSS_PCT_MAX * 100)
  ) / 100;
  const bulletsStolen = Math.floor(victimBullets * bulletLossPct);

  const hospitalizedUntil = Date.now() + DEATH_RESPAWN_SECONDS * 1000;

  victimUpdates.health = 0;
  victimUpdates.alive = false;
  victimUpdates.hospitalizedUntil = hospitalizedUntil;
  victimUpdates.cash = victimCash - cashStolen;
  victimUpdates.bullets = victimBullets - bulletsStolen;

  // Armour durability ticks as a death for the victim
  const { item: newArmour, broke: armourBroke }     = applyArmourDurability(victim.inventory?.armour, true);
  const { item: newHeadwear, broke: headwearBroke } = applyArmourDurability(victim.inventory?.headwear, true);
  victimUpdates['inventory.armour']   = newArmour;
  victimUpdates['inventory.headwear'] = newHeadwear;

  attackerUpdates.cash    = (attacker.cash ?? 0) + cashStolen;
  attackerUpdates.bullets = attackerUpdates.bullets + bulletsStolen;

  await playerRepository.updatePlayer(serverId, attacker.discordId, attackerUpdates);
  await playerRepository.updatePlayer(serverId, victim.discordId, victimUpdates);

  // Patch attacker's intel so target shows as dead
  patchIntelAfterShot(serverId, attacker.discordId, attacker, victim.discordId, 'player', null, {
    alive: false,
    health: 0,
  });

  logRepository.write(serverId, {
    discordId: attacker.discordId,
    actionType: ACTION_TYPES.COMBAT,
    actionName: 'kill_player',
    location: attacker.state,
    payload: {
      attackerId: attacker.discordId,
      victimId: victim.discordId,
      victimName: victim.username,
      bulletsUsed: bulletsToKill,
      cashStolen,
      bulletsStolen,
    },
  }).catch(() => {});

  return {
    success: true,
    message: `💀 You **killed** **${victim.username ?? 'your target'}**! You took **${formatCash(cashStolen)}** and **${bulletsStolen} bullets**.`,
    data: {
      outcome: 'kill_player',
      attackerId: attacker.discordId,
      attackerName: attacker.username,
      victimId: victim.discordId,
      victimName: victim.username,
      bulletsUsed: bulletsToKill,
      bulletsRemaining: attackerUpdates.bullets,
      cashStolen,
      bulletsStolen,
      hospitalizedUntil,
      weaponBroke,
      armourBroke,
      headwearBroke,
      attackerRankIdx: rankIndex(attacker),
      victimState: victim.state,
    },
    updates: attackerUpdates,
    log: { actionType: ACTION_TYPES.COMBAT, actionName: 'kill_player' },
  };
}

// ── Bodyguard names ─────────────────────────────

const BG_FIRST_NAMES = ['Vinny', 'Tank', 'Bruno', 'Spike', 'Marco', 'Reggie', 'Duke', 'Chuck', 'Ivan', 'Rocco', 'Sal', 'Bones', 'Frankie', 'Hugo', 'Mickey'];
const BG_LAST_NAMES  = ['Russo', 'Petrov', 'Diaz', 'Calloway', 'Marchetti', 'Knuckles', 'Vance', 'O\'Brien', 'Lombardi', 'Tate'];

function generateBodyguardName() {
  const first = BG_FIRST_NAMES[Math.floor(Math.random() * BG_FIRST_NAMES.length)];
  const last  = BG_LAST_NAMES[Math.floor(Math.random() * BG_LAST_NAMES.length)];
  return `${first} "${last}"`;
}

/**
 * Hire or rebuy a bodyguard for a given slot (1-4).
 * Rebuying gives a fresh BG: new name, full 100 HP. Same cost every time.
 */
async function hireBodyguard(serverId, discordId, slot) {
  slot = Number(slot);
  if (![1, 2, 3, 4].includes(slot)) {
    return { success: false, message: 'Invalid bodyguard slot.', data: {}, updates: {}, log: null };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };
  }

  const existing = player.bodyguards?.[slot];
  if (existing && existing.alive) {
    return { success: false, message: 'This bodyguard slot is already filled and alive.', data: {}, updates: {}, log: null };
  }

  const cost = BODYGUARD_COSTS[slot];
  if ((player.cash ?? 0) < cost) {
    return {
      success: false,
      message: `You need ${formatCash(cost)} to hire this bodyguard.`,
      data: { insufficientFunds: true, required: cost, have: player.cash ?? 0 },
      updates: {},
      log: null,
    };
  }

  const bgName = generateBodyguardName();
  const bodyguards = {
    ...(player.bodyguards ?? {}),
    [slot]: { name: bgName, hp: 100, alive: true, hiredAt: Date.now() },
  };

  const updates = {
    cash: (player.cash ?? 0) - cost,
    bodyguards,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.COMBAT,
    actionName: 'hire_bodyguard',
    location: player.state,
    payload: { slot, bgName, cost },
  }).catch(() => {});

  return {
    success: true,
    message: `You hired **${bgName}** for Slot ${slot}.`,
    data: { slot, bgName, cost },
    updates,
    log: { actionType: ACTION_TYPES.COMBAT, actionName: 'hire_bodyguard' },
  };
}

// ── Small local helper (avoid importing embeds into a service) ──
function formatCash(amount) {
  return `$${Math.floor(amount).toLocaleString('en-US')}`;
}

module.exports = {
  search,
  collectResults,
  shoot,
  shootBg,
  calcBulletsToKill,
  calcBulletsToKillBodyguard,
  calcDamage,
  getActiveSearchesView,
  getIntelHistory,
  getResolvedSearches,
  getNextBodyguardSlot,
  hasLivingBodyguard,
  getArmourBonus,
  getWeaponReduction,
  rankIndex,
  // exported for testing / panel use
  searchKey,
  pruneExpiredIntel,
  BODYGUARD_COSTS,
  hireBodyguard,
  generateBodyguardName,
};
