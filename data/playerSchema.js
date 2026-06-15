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

    // ── Cooldowns (epoch ms of next allowed action) ────
    cooldowns: {
      // per-crime cooldowns stored as crimeId → epoch ms
      crimes: {},               // e.g. { pickpocket: 1234567890000 }
      gta: null,
      medKit: null,
      firstAidKit: null,
    },

    // ── Inventory ─────────────────────────────
    inventory: {
      weapon: null,             // { id, shotsUsed, killsUsed } or null
      armour: null,             // { id, shotsAbsorbed, deathsSurvived } or null
      headwear: null,           // { id, shotsAbsorbed, deathsSurvived } or null
      vehicle: null,            // carId string or null (active vehicle)
      garage: [],               // array of carId strings (stored cars)
      booze: {
        beer: 0,                // cases
        spirits: 0,             // cases
        boughtInState: null,    // state name — must sell in different state
      },
      drugs: {
        weed: 0,
        cocaine: 0,
        heroin: 0,
        boughtInState: null,
      },
      medKits: 0,
      firstAidKits: 0,
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
