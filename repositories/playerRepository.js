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

// ── Reads ─────────────────────────────────────

/**
 * Get a single player. Returns null if not found.
 */
async function getPlayer(serverId, discordId) {
  const snap = await playerRef(serverId, discordId).get();
  if (!snap.exists) return null;
  return snap.data();
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
};
