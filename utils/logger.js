// ─────────────────────────────────────────────
//  logger.js  —  Thin wrapper around logRepository.
//  Always fire-and-forget. Never throws.
//  Services call logger, not logRepository directly.
// ─────────────────────────────────────────────

const logRepository = require('../repositories/logRepository');

/**
 * Log an action. NEVER awaited — always fire-and-forget.
 *
 * @param {string} serverId
 * @param {object} entry  { discordId, actionType, actionName, location, payload }
 */
function log(serverId, entry) {
  logRepository.write(serverId, entry).catch(() => {
    // Intentionally swallowed — logs must never break gameplay
  });
}

module.exports = { log };
