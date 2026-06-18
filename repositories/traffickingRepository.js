// ─────────────────────────────────────────────
//  traffickingRepository.js  —  Firestore access for daily prices.
//  Path: servers/{serverId}/config/trafficking
// ─────────────────────────────────────────────

const { db } = require('../utils/firebase');

function ref(serverId) {
  return db.collection('servers').doc(serverId).collection('config').doc('trafficking');
}

async function getPrices(serverId) {
  const snap = await ref(serverId).get();
  if (!snap.exists) return null;
  return snap.data();
}

async function setPrices(serverId, data) {
  await ref(serverId).set(data);
}

module.exports = { getPrices, setPrices };
