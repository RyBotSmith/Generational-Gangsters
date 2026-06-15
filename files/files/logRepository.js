// ─────────────────────────────────────────────
//  logRepository.js  —  Firestore access for action logs.
//  Rule: NO game logic. Write / query only.
//  Firestore path: servers/{serverId}/logs/{auto-id}
//
//  ALL WRITES are fire-and-forget.
//  NEVER await a write from game code — call write() and discard.
// ─────────────────────────────────────────────

const { db } = require('../utils/firebase');

function logsCollection(serverId) {
  return db.collection('servers').doc(serverId).collection('logs');
}

// ── Write (fire-and-forget) ───────────────────

/**
 * Append a log entry.
 * Returns the Promise — callers should NOT await this.
 * Usage: logRepository.write(serverId, entry).catch(() => {});
 *
 * @param {string} serverId
 * @param {object} entry  - see log format in constants / GDD §20A
 *   { discordId, actionType, actionName, location, payload }
 * @returns {Promise<void>}
 */
function write(serverId, entry) {
  const doc = {
    serverId,
    discordId:  entry.discordId  ?? null,
    actionType: entry.actionType ?? 'UNKNOWN',
    actionName: entry.actionName ?? 'unknown',
    timestamp:  Date.now(),
    location:   entry.location   ?? null,
    payload:    entry.payload    ?? {},
  };
  return logsCollection(serverId).add(doc);
}

// ── Reads (admin / analytics only — never during gameplay) ──

/**
 * Get recent logs for a player.
 */
async function getPlayerLogs(serverId, discordId, limit = 50) {
  const snap = await logsCollection(serverId)
    .where('discordId', '==', discordId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ logId: d.id, ...d.data() }));
}

/**
 * Get recent logs by action type.
 */
async function getLogsByType(serverId, actionType, limit = 100) {
  const snap = await logsCollection(serverId)
    .where('actionType', '==', actionType)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ logId: d.id, ...d.data() }));
}

/**
 * Get logs for a player within a time window.
 * @param {number} fromMs  - epoch ms start
 * @param {number} toMs    - epoch ms end
 */
async function getPlayerLogsInWindow(serverId, discordId, fromMs, toMs, limit = 200) {
  const snap = await logsCollection(serverId)
    .where('discordId', '==', discordId)
    .where('timestamp', '>=', fromMs)
    .where('timestamp', '<=', toMs)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ logId: d.id, ...d.data() }));
}

/**
 * Get all combat logs for a specific attacker/victim pair (anti-cheat).
 */
async function getCombatLogsBetween(serverId, attackerId, victimId, fromMs, limit = 50) {
  const snap = await logsCollection(serverId)
    .where('actionType', '==', 'COMBAT')
    .where('payload.attackerId', '==', attackerId)
    .where('payload.victimId',   '==', victimId)
    .where('timestamp', '>=', fromMs)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ logId: d.id, ...d.data() }));
}

module.exports = {
  write,
  getPlayerLogs,
  getLogsByType,
  getPlayerLogsInWindow,
  getCombatLogsBetween,
};
