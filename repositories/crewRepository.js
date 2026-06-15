// ─────────────────────────────────────────────
//  crewRepository.js  —  Firestore access for crews.
//  Rule: NO game logic. Get / set / delete only.
//  Firestore path: servers/{serverId}/crews/{crewId}
// ─────────────────────────────────────────────

const { db } = require('../utils/firebase');

// ── Helpers ───────────────────────────────────

function crewRef(serverId, crewId) {
  return db.collection('servers').doc(serverId)
           .collection('crews').doc(crewId);
}

function crewsCollection(serverId) {
  return db.collection('servers').doc(serverId).collection('crews');
}

// Default crew document shape (for reference / validation)
function defaultCrew(crewId, serverId, leaderId, leaderName, name) {
  return {
    crewId,
    serverId,
    name,
    leaderId,
    leaderName,
    createdAt: Date.now(),
    memberCount: 1,
    members: {
      [leaderId]: { role: 'leader', joinedAt: Date.now() },
    },
    vault: 0,           // cash deposited by members lifetime
    upgrades: {
      fail_chance:      0,  // level 0–3
      arrest_chance:    0,  // level 0–3
      stop_search:      0,  // level 0–2
      collect_cooldown: 0,  // level 0–3
    },
    // Workers are keyed 1–6 by slot number
    workers: {},
  };
}

// ── Reads ─────────────────────────────────────

async function getCrew(serverId, crewId) {
  const snap = await crewRef(serverId, crewId).get();
  if (!snap.exists) return null;
  return snap.data();
}

/**
 * Find a crew by name (case-sensitive). Returns null if not found.
 */
async function getCrewByName(serverId, name) {
  const snap = await crewsCollection(serverId)
    .where('name', '==', name)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data();
}

/**
 * Get all crews — used for leaderboards / admin views.
 */
async function getAllCrews(serverId) {
  const snap = await crewsCollection(serverId).get();
  return snap.docs.map(d => d.data());
}

// ── Writes ────────────────────────────────────

/**
 * Create a new crew. crewId is caller-supplied (e.g. auto-generated Firestore ID).
 */
async function createCrew(serverId, crewId, leaderId, leaderName, name) {
  const data = defaultCrew(crewId, serverId, leaderId, leaderName, name);
  await crewRef(serverId, crewId).set(data);
  return data;
}

async function updateCrew(serverId, crewId, updates) {
  await crewRef(serverId, crewId).update(updates);
}

/**
 * Atomic increment of vault or other numeric fields.
 */
async function incrementCrewFields(serverId, crewId, increments) {
  const { FieldValue } = require('firebase-admin/firestore');
  const updates = {};
  for (const [field, amount] of Object.entries(increments)) {
    updates[field] = FieldValue.increment(amount);
  }
  await crewRef(serverId, crewId).update(updates);
}

async function deleteCrew(serverId, crewId) {
  await crewRef(serverId, crewId).delete();
}

module.exports = {
  getCrew,
  getCrewByName,
  getAllCrews,
  createCrew,
  updateCrew,
  incrementCrewFields,
  deleteCrew,
};
