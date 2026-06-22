// ─────────────────────────────────────────────
//  playerRepository.js  —  Firestore access for players.
//  Rule: NO game logic. Get / set / delete only.
//  Firestore path: servers/{serverId}/players/{discordId}
// ─────────────────────────────────────────────

const { db }           = require('../utils/firebase');
const { defaultPlayer } = require('../data/playerSchema');

// ── Helpers ───────────────────────────────────

function playerRef(serverId, discordId) {
  return db.collection('servers').doc(serverId)
           .collection('players').doc(discordId);
}

// ── Internal ──────────────────────────────────

/**
 * If a player's travel timer has expired, commit the arrival and return
 * the updated player object. This keeps location accurate for every
 * service that calls getPlayer — no cron required.
 * Pure data operation — no game logic, just correcting stale state.
 */
async function resolveTravelIfArrived(ref, player) {
  if (!player.travelling || !player.travelEndTime) return player;
  if (player.travelEndTime > Date.now()) return player;

  const updates = {
    state:             player.travelDestination,
    travelling:        false,
    travelEndTime:     null,
    travelDestination: null,
    lastSeen:          Date.now(),
  };

  await ref.update(updates);
  return { ...player, ...updates };
}

async function getJailedPlayers(serverId) {
  const snapshot = await db
    .collection("servers")
    .doc(serverId)
    .collection("players")
    .get();

  const now = Date.now();
  const jailed = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.jailedUntil && data.jailedUntil > now) {
      jailed.push({
        discordId:  doc.id,
        username:   data.username   || doc.id,
        jailedUntil: data.jailedUntil,
        bustReward: data.bustReward || 0,
        cash:       data.cash       || 0,
      });
    }
  });

  // Sort by least time remaining first
  jailed.sort((a, b) => a.jailedUntil - b.jailedUntil);
  return jailed;
}

/**
 * If a player's hospital timer has expired, revive them.
 * Pure data correction — no game logic.
 */
async function resolveHospitalIfExpired(ref, player) {
  if (!player.hospitalizedUntil) return player;
  if (player.hospitalizedUntil > Date.now()) return player;

  const updates = {
    alive:             true,
    health:            100,
    hospitalizedUntil: null,
    lastSeen:          Date.now(),
  };

  await ref.update(updates);
  return { ...player, ...updates };
}

// ── Reads ─────────────────────────────────────

/**
 * Get a single player. Returns null if not found.
 * Automatically resolves expired travel and hospital timers before returning.
 */
async function getPlayer(serverId, discordId) {
  const ref  = playerRef(serverId, discordId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  let player = snap.data();
  player = await resolveTravelIfArrived(ref, player);
  player = await resolveHospitalIfExpired(ref, player);
  return player;
}

/**
 * Get multiple players by discordId in one batch.
 * Returns an array of player objects (nulls filtered out).
 */
async function getPlayers(serverId, discordIds) {
  const refs = discordIds.map(id => playerRef(serverId, id));
  const snaps = await db.getAll(...refs);
  return snaps.filter(s => s.exists).map(s => s.data());
}

/**
 * Get all players in a server. Use sparingly — full collection scan.
 */
async function getAllPlayers(serverId) {
  const snap = await db.collection('servers').doc(serverId)
                       .collection('players').get();
  return snap.docs.map(d => d.data());
}

/**
 * Get a leaderboard slice sorted by a numeric field descending.
 * @param {string} field  - e.g. 'xp', 'cash', 'bank'
 * @param {number} limit
 */
async function getLeaderboard(serverId, field, limit = 10) {
  const snap = await db.collection('servers').doc(serverId)
                       .collection('players')
                       .orderBy(field, 'desc')
                       .limit(limit)
                       .get();
  return snap.docs.map(d => d.data());
}

/**
 * Get all alive players in a given state (used for witness dispatch).
 */
async function getAlivePlayersInState(serverId, state) {
  const snap = await db.collection('servers').doc(serverId)
                       .collection('players')
                       .where('alive', '==', true)
                       .where('state', '==', state)
                       .get();
  return snap.docs.map(d => d.data());
}

// ── Writes ────────────────────────────────────

/**
 * Create a new player document with defaults.
 * Throws if the player already exists.
 */
async function createPlayer(serverId, discordId, username) {
  const ref  = playerRef(serverId, discordId);
  const snap = await ref.get();
  if (snap.exists) throw new Error(`Player ${discordId} already exists in server ${serverId}`);

  const data = defaultPlayer(discordId, username, serverId);
  await ref.set(data);
  return data;
}

/**
 * Merge partial updates into a player document.
 * Only the provided fields are written (Firestore merge).
 */
async function updatePlayer(serverId, discordId, updates) {
  await playerRef(serverId, discordId).update({
    ...updates,
    lastSeen: Date.now(),
  });
}

/**
 * Atomic increment of one or more numeric fields.
 * Pass { fieldPath: incrementAmount }.
 * e.g. incrementFields(sid, uid, { cash: 500, xp: 50 })
 */
async function incrementFields(serverId, discordId, increments) {
  const { FieldValue } = require('firebase-admin/firestore');
  const updates = {};
  for (const [field, amount] of Object.entries(increments)) {
    updates[field] = FieldValue.increment(amount);
  }
  await playerRef(serverId, discordId).update(updates);
}

/**
 * Run an arbitrary transaction against the player document.
 * Caller receives (transaction, playerData) and must return update map.
 */
async function transactPlayer(serverId, discordId, txFn) {
  const ref = playerRef(serverId, discordId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`Player ${discordId} not found`);
    const updates = await txFn(tx, snap.data());
    if (updates && Object.keys(updates).length > 0) {
      tx.update(ref, { ...updates, lastSeen: Date.now() });
    }
  });
}

/**
 * Run a transaction involving two players atomically (e.g. combat loot transfer).
 */
async function transactTwoPlayers(serverId, idA, idB, txFn) {
  const refA = playerRef(serverId, idA);
  const refB = playerRef(serverId, idB);
  await db.runTransaction(async (tx) => {
    const [snapA, snapB] = await Promise.all([tx.get(refA), tx.get(refB)]);
    const { updatesA, updatesB } = await txFn(tx, snapA.data(), snapB.data());
    const now = Date.now();
    if (updatesA) tx.update(refA, { ...updatesA, lastSeen: now });
    if (updatesB) tx.update(refB, { ...updatesB, lastSeen: now });
  });
}

// ── Deletes ───────────────────────────────────

/**
 * Hard-delete a player document. Admin / reset use only.
 */
async function deletePlayer(serverId, discordId) {
  await playerRef(serverId, discordId).delete();
}

module.exports = {
  getPlayer,
  getPlayers,
  getAllPlayers,
  getLeaderboard,
  getAlivePlayersInState,
  createPlayer,
  updatePlayer,
  incrementFields,
  transactPlayer,
  transactTwoPlayers,
  deletePlayer,
  getJailedPlayers,
};
