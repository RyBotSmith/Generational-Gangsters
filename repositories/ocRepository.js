// ─────────────────────────────────────────────
//  ocRepository.js  —  Firestore access for OC lobbies.
//  Rule: NO game logic. Get / set / query only.
//  Firestore path: servers/{serverId}/oc_lobbies/{lobbyId}
// ─────────────────────────────────────────────

const { db } = require('../utils/firebase');

function lobbiesCollection(serverId) {
  return db.collection('servers').doc(serverId).collection('oc_lobbies');
}

function lobbyRef(serverId, lobbyId) {
  return lobbiesCollection(serverId).doc(lobbyId);
}

// ── Reads ─────────────────────────────────────

async function getLobby(serverId, lobbyId) {
  const snap = await lobbyRef(serverId, lobbyId).get();
  if (!snap.exists) return null;
  return snap.data();
}

/**
 * Find any open lobby where the player is a member.
 * Used to prevent duplicate lobbies per player.
 */
async function getOpenLobbyForPlayer(serverId, discordId) {
  // Firestore can't query nested map keys directly, so we query by leaderId
  // (cheapest path) and fall back to a broader scan only when needed.
  const snap = await lobbiesCollection(serverId)
    .where('status', '==', 'open')
    .where('leaderId', '==', discordId)
    .limit(1)
    .get();

  if (!snap.empty) return snap.docs[0].data();

  // Not a leader — check if they're a member in any open lobby.
  // Firestore doesn't support map-key queries, so we do a small scan of
  // open lobbies (should always be a small number).
  const allOpen = await lobbiesCollection(serverId)
    .where('status', '==', 'open')
    .limit(50)
    .get();

  for (const doc of allOpen.docs) {
    const lobby = doc.data();
    if (discordId in (lobby.members ?? {})) return lobby;
  }

  return null;
}

// ── Writes ────────────────────────────────────

async function createLobby(serverId, lobbyId, data) {
  await lobbyRef(serverId, lobbyId).set(data);
  return data;
}

async function updateLobby(serverId, lobbyId, updates) {
  await lobbyRef(serverId, lobbyId).update(updates);
}

async function deleteLobby(serverId, lobbyId) {
  await lobbyRef(serverId, lobbyId).delete();
}

// ── Cleanup (admin / cron) ────────────────────

/**
 * Get all lobbies that have expired but not yet been marked as such.
 * Call periodically to clean up stale docs.
 */
async function getExpiredOpenLobbies(serverId) {
  const snap = await lobbiesCollection(serverId)
    .where('status', '==', 'open')
    .where('expiresAt', '<', Date.now())
    .limit(50)
    .get();
  return snap.docs.map(d => d.data());
}

module.exports = {
  getLobby,
  getOpenLobbyForPlayer,
  createLobby,
  updateLobby,
  deleteLobby,
  getExpiredOpenLobbies,
};
