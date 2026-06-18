// ─────────────────────────────────────────────
//  businessRepository.js  —  Firestore access for businesses.
//  Path: servers/{serverId}/businesses/{slotKey}
//  Slots keyed as slot_New_York, slot_Miami, slot_Chicago
//  Rule: NO game logic. Get / set only.
// ─────────────────────────────────────────────

const { db } = require('../utils/firebase');

function col(serverId) {
  return db.collection('servers').doc(serverId).collection('businesses');
}

/**
 * Get a single slot by key (e.g. 'slot_New_York').
 */
async function getSlot(serverId, key) {
  const snap = await col(serverId).doc(key).get();
  if (!snap.exists) return null;
  return snap.data();
}

/**
 * Set (overwrite) a slot document.
 */
async function setSlot(serverId, key, data) {
  await col(serverId).doc(key).set(data);
}

/**
 * Get all slot documents (slot_* keys only).
 */
async function getAllSlots(serverId) {
  const snap = await col(serverId).get();
  return snap.docs
    .filter(d => d.id.startsWith('slot_'))
    .map(d => d.data());
}

module.exports = { getSlot, setSlot, getAllSlots };
