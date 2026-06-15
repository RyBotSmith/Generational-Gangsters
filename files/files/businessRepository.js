// ─────────────────────────────────────────────
//  businessRepository.js  —  Firestore access for businesses.
//  Rule: NO game logic. Get / set / delete only.
//  Firestore path: servers/{serverId}/businesses/{businessId}
//
//  businessId convention: "{businessTypeId}_{state}"
//  e.g. "bar_New York", "drug_lab_Miami", "casino_Chicago"
//  One slot per type per state — fixed locations from the GDD.
// ─────────────────────────────────────────────

const { db } = require('../utils/firebase');

// ── Helpers ───────────────────────────────────

function businessRef(serverId, businessId) {
  return db.collection('servers').doc(serverId)
           .collection('businesses').doc(businessId);
}

function businessesCollection(serverId) {
  return db.collection('servers').doc(serverId).collection('businesses');
}

/**
 * Default business slot document (unowned state).
 */
function defaultBusiness(businessId, serverId, typeId, state) {
  return {
    businessId,
    serverId,
    typeId,        // e.g. 'bar', 'drug_lab', 'casino'
    state,
    ownerId: null, // discordId of owner, null = unowned
    level: 0,      // 0 = unowned, 1–5 = owned + upgraded
    lastCollect: null,    // epoch ms
    lastRaidedAt: null,   // epoch ms
    raidCount: 0,         // successful raids against this business
    purchasedAt: null,    // epoch ms
  };
}

// ── Reads ─────────────────────────────────────

/**
 * Get a single business slot by ID.
 */
async function getSlot(serverId, businessId) {
  const snap = await businessRef(serverId, businessId).get();
  if (!snap.exists) return null;
  return snap.data();
}

/**
 * Get the business owned by a specific player (if any).
 */
async function getPlayerBusiness(serverId, ownerId) {
  const snap = await businessesCollection(serverId)
    .where('ownerId', '==', ownerId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data();
}

/**
 * Get all business slots in the server (for admin views / state panels).
 */
async function getAllSlots(serverId) {
  const snap = await businessesCollection(serverId).get();
  return snap.docs.map(d => d.data());
}

/**
 * Get all slots of a given type (e.g. all bars across states).
 */
async function getSlotsByType(serverId, typeId) {
  const snap = await businessesCollection(serverId)
    .where('typeId', '==', typeId)
    .get();
  return snap.docs.map(d => d.data());
}

// ── Writes ────────────────────────────────────

/**
 * Initialise a business slot if it doesn't exist yet.
 * Safe to call on every startup (idempotent).
 */
async function initSlot(serverId, typeId, state) {
  const businessId = `${typeId}_${state}`;
  const ref  = businessRef(serverId, businessId);
  const snap = await ref.get();
  if (!snap.exists) {
    const data = defaultBusiness(businessId, serverId, typeId, state);
    await ref.set(data);
    return data;
  }
  return snap.data();
}

async function updateSlot(serverId, businessId, updates) {
  await businessRef(serverId, businessId).update(updates);
}

/**
 * Atomic field increments (e.g. raidCount: 1).
 */
async function incrementSlotFields(serverId, businessId, increments) {
  const { FieldValue } = require('firebase-admin/firestore');
  const updates = {};
  for (const [field, amount] of Object.entries(increments)) {
    updates[field] = FieldValue.increment(amount);
  }
  await businessRef(serverId, businessId).update(updates);
}

/**
 * Reset slot to unowned state (after losing 5 raids).
 */
async function resetSlot(serverId, businessId) {
  const snap = await businessRef(serverId, businessId).get();
  if (!snap.exists) return;
  const { typeId, state } = snap.data();
  await businessRef(serverId, businessId).update({
    ownerId: null,
    level: 0,
    lastCollect: null,
    lastRaidedAt: null,
    raidCount: 0,
    purchasedAt: null,
  });
}

module.exports = {
  getSlot,
  getPlayerBusiness,
  getAllSlots,
  getSlotsByType,
  initSlot,
  updateSlot,
  incrementSlotFields,
  resetSlot,
};
