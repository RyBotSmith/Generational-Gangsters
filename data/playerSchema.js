// ─────────────────────────────────────────────
//  playerSchema.js  —  Default player document.
//  All fields must be present on every new player.
//  No functions — data shape only.
// ─────────────────────────────────────────────

/**
 * Returns a fresh default player object.
 * Call this when creating a new player; spread + override identity fields.
 *
 * @param {string} discordId
 * @param {string} username
 * @param {string} serverId
 * @returns {object}
 */
function defaultPlayer(discordId, username, serverId) {
  const now = Date.now();

  return {
    // ── Identity ──────────────────────────────
    discordId,
    username,
    serverId,
    characterName: null,        // set during /start onboarding
    sex: null,                  // 'male' | 'female'
    createdAt: now,
    lastSeen: now,

    // ── Progression ───────────────────────────
    xp: 0,
    rankIndex: 0,               // 0–9, derived from XP but cached for reads
    prestige: 0,                // 0–5

    // ── Economy ───────────────────────────────
    cash: 0,                    // on-hand, lootable on death
    bank: 0,                    // protected, subject to vault limit
    // netWorth is calculated at read time — not stored

    // ── Combat ────────────────────────────────
    health: 100,
    bullets: 0,
    // Slots are independent — dead slots stay empty until specifically rebought.
    // Attack order: highest slot first (4 → 3 → 2 → 1 → Player).
    // Slot 4 (Legendary Hitman) is the first line of defence.
    // alive: false = slot never bought OR bought and killed.
    // hp is always 100 when alive, 0 when dead.
    bodyguards: {
      1: { alive: false, hp: 0 },  // $5,000   — Basic Protection (last shield)
      2: { alive: false, hp: 0 },  // $25,000  — Trained Enforcer
      3: { alive: false, hp: 0 },  // $75,000  — Elite Soldier
      4: { alive: false, hp: 0 },  // $200,000 — Legendary Hitman (first shield)
    },

    // ── Location ──────────────────────────────
    state: 'New York',          // one of STATES
    country: 'US',
    travelling: false,
    travelEndTime: null,        // epoch ms
    travelDestination: null,
    travelPremiumUsedToday: 0,  // resets daily — for premium 5/day limit
    travelPremiumResetAt: null, // epoch ms of the 24hr window start

    // ── Status ────────────────────────────────
    alive: true,
    jailedUntil: null,          // epoch ms
    hospitalizedUntil: null,    // epoch ms (death respawn)
    witnessProtectionUntil: null, // epoch ms

    // ── Cooldowns (epoch ms of last use) ──────
    cooldowns: {
      // per-crime cooldowns stored flat: crime_${id} → epoch ms
      // e.g. crime_pickpocket: 1234567890000
      gta: null,
      medKit: null,
      firstAidKit: null,
    },

    // ── Upgrades ──────────────────────────────
    // Each key matches an UPGRADES id. Value = current level (0 = not purchased).
    upgrades: {
      bank_vault:     0,
      booze_capacity: 0,
      drug_capacity:  0,
      garage_size:    0,
      crime_cooldown: 0,
      gta_cooldown:   0,
    },

    // ── Lifetime stats ────────────────────────
    stats: {
      // Crimes
      crimesAttempted:  0,
      crimesSucceeded:  0,
      crimesJailed:     0,
      cashFromCrimes:   0,

      // GTA
      gtaAttempted:     0,
      gtaSucceeded:     0,
      gtaSold:          0,
      gtaMelted:        0,
      cashFromGta:      0,
      bulletsFromGta:   0,

      // Combat
      kills:            0,
      deaths:           0,
      bulletsFired:     0,
      cashLooted:       0,
      bgKills:          0,
      bgDeaths:         0,

      // Gambling
      gamesPlayed:      0,
      gamesWon:         0,
      totalWagered:     0,
      netGambling:      0,
      biggestWin:       0,

      // Booze trafficking
      boozeBought:      0,
      boozeSold:        0,
      boozeSeized:      0,
      cashFromBooze:    0,

      // Drug trafficking
      drugsBought:      0,
      drugsSold:        0,
      drugsSeized:      0,
      cashFromDrugs:    0,

      // OC
      ocAttempted:      0,
      ocSucceeded:      0,
      cashFromOc:       0,
    },

    // ── Inventory ─────────────────────────────
    inventory: {
      // ── Equipped (active — used for bonuses/combat) ──
      equippedWeapon:   null,   // { id, shotsUsed, killsUsed }
      equippedArmour:   null,   // { id, shotsAbsorbed, deathsSurvived }
      equippedHeadwear: null,   // { id, shotsAbsorbed, deathsSurvived }
      equippedVehicle:  null,   // { id }

      // ── Owned but unequipped ─────────────────
      ownedWeapons:     [],     // [{ id, shotsUsed, killsUsed }]
      ownedArmour:      [],     // [{ id, shotsAbsorbed, deathsSurvived }]
      ownedHeadwear:    [],     // [{ id, shotsAbsorbed, deathsSurvived }]
      ownedVehicles:    [],     // [{ id }]

      // ── GTA Garage ───────────────────────────
      garage: [],               // array of carIds from GTA steals
      firstAidKits: 0,

      // ── Trafficking ──────────────────────────
      booze: {
        beer: 0,                // cases
        spirits: 0,             // cases
        boughtInState: null,    // must sell in different state
      },
      drugs: {
        weed: 0,
        cocaine: 0,
        ecstasy: 0,
        heroin: 0,
        boughtInState: null,
      },
    },

    // ── Combat: Intel System ───────────────────
    // activeSearches: searches in progress, removed (stripped) on collect.
    //   { searchId, targetId, targetName, type: 'player'|'bodyguard',
    //     bgSlot: 1-4|null, startedAt, completesAt, cost }
    // searchHistory: collected intel, expires SEARCH_INTEL_EXPIRY (3hrs) after collection.
    //   { searchId, targetId, targetName, type, bgSlot, intel: {...}, collectedAt, expiresAt }
    activeSearches: [],
    searchHistory: [],

    // ── Crew ──────────────────────────────────
    crewId: null,
    crewRole: null,             // 'leader' | 'member' | null
    crewContributions: 0,       // lifetime cash deposited to crew vault

    // ── Business ──────────────────────────────
    businessId: null,           // Firestore doc ID in servers/{serverId}/businesses/

    // ── Daily / Weekly challenges ─────────────
    dailyChallenges: {
      completedAt: null,        // epoch ms of last daily reset
      progress: {},             // { challengeId: count }
      claimed: false,
    },
    weeklyChallenges: {
      completedAt: null,
      progress: {},
      claimed: false,
    },

    // ── OC cooldowns (per OC type) ────────────
    ocCooldowns: {},            // { ocTypeId: epoch ms }

    // ── Admin flags ───────────────────────────
    banned: false,
    bannedReason: null,
    adminNotes: '',
  };
}

module.exports = { defaultPlayer };
