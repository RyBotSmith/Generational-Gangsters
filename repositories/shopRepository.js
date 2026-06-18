// ─────────────────────────────────────────────
//  shopRepository.js  —  Firestore access for shop config.
//  Generates and caches weekly shop rotation.
//  Path: servers/{serverId}/config/shop
// ─────────────────────────────────────────────

const { db }       = require('../utils/firebase');
const { STATES, SHOP_POOLS, MEDICAL_ITEMS } = require('../data/constants');

function shopRef(serverId) {
  return db.collection('servers').doc(serverId)
           .collection('config').doc('shop');
}

/**
 * Get the ISO week key for a given timestamp.
 * Format: YYYY-WW (e.g. "2026-03")
 */
function getWeekKey(ts = Date.now()) {
  const d    = new Date(ts);
  const day  = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - new Date(Date.UTC(year, 0, 1))) / 86400000 + 1) / 7);
  return `${year}-${String(week).padStart(2, '0')}`;
}

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Deterministic from seed — same week = same shuffle if needed.
 */
function seededRng(seed) {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle array with seeded rng.
 */
function seededShuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generate a fresh weekly shop config.
 * Called on first access of a new week.
 */
function generateShop(weekKey) {
  // Seed from week key string
  const seed = weekKey.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 31337;
  const rng  = seededRng(seed);

  const states = {};

  // Assign weapons, armour, headwear from fixed pools
  for (const state of STATES) {
    states[state] = {
      weapons:      SHOP_POOLS.weapons[state]  ?? [],
      armour:       SHOP_POOLS.armour[state]   ?? [],
      headwear:     SHOP_POOLS.headwear[state] ?? [],
      vehicles:     [],
      consumables:  Object.values(MEDICAL_ITEMS).map(i => i.id),
    };
  }

  // Randomly assign vehicles to 3 states
  const shuffledStates = seededShuffle([...STATES], rng);
  const vehicleStates  = shuffledStates.slice(0, SHOP_POOLS.vehicles.statesCount);
  const shuffledVehicles = seededShuffle([...SHOP_POOLS.vehicles.pool], rng);

  vehicleStates.forEach((state, i) => {
    // First state gets 2 vehicles, others get 1
    const count = i === 0 ? 2 : 1;
    states[state].vehicles = shuffledVehicles.splice(0, count);
  });

  return {
    weekKey,
    generatedAt: Date.now(),
    states,
  };
}

/**
 * Get the current shop config for a server.
 * Generates a new one if stale (new week) or missing.
 */
async function getShop(serverId) {
  const ref       = shopRef(serverId);
  const snap      = await ref.get();
  const weekKey   = getWeekKey();

  if (snap.exists) {
    const data = snap.data();
    if (data.weekKey === weekKey) return data;
  }

  // Generate and persist new shop
  const shop = generateShop(weekKey);
  await ref.set(shop);
  return shop;
}

/**
 * Get the shop inventory for a specific state.
 */
async function getStateShop(serverId, state) {
  const shop = await getShop(serverId);
  return shop.states[state] ?? { weapons: [], armour: [], headwear: [], vehicles: [], consumables: [] };
}

module.exports = { getShop, getStateShop, getWeekKey };
