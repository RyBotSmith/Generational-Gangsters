// ─────────────────────────────────────────────
//  helpers.js  —  Pure utility functions.
//  No DB access. No Discord imports.
// ─────────────────────────────────────────────

/**
 * Random integer between min and max (inclusive).
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Format a number as a USD currency string.
 * e.g. 1234567 → "$1,234,567"
 */
function formatCash(amount) {
  return `$${Math.floor(amount).toLocaleString('en-US')}`;
}

/**
 * Format seconds into a human-readable duration.
 * e.g. 3665 → "1h 1m 5s"
 */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Format a future epoch ms timestamp as a Discord relative timestamp.
 * e.g. <t:1234567890:R>
 */
function relativeTimestamp(epochMs) {
  return `<t:${Math.floor(epochMs / 1000)}:R>`;
}

/**
 * Format a future epoch ms timestamp as a Discord short time.
 * e.g. <t:1234567890:t>
 */
function shortTimestamp(epochMs) {
  return `<t:${Math.floor(epochMs / 1000)}:t>`;
}

/**
 * Derive rank index from XP using the RANKS table.
 */
function getRankIndex(xp, ranks) {
  let rankIndex = 0;
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (xp >= ranks[i].minXP) {
      rankIndex = i;
      break;
    }
  }
  return rankIndex;
}

/**
 * Calculate bail cost from remaining jail seconds.
 * Formula from GDD: max($100, ceil(secondsRemaining × 10))
 */
function calcBailCost(secondsRemaining) {
  return Math.max(100, Math.ceil(secondsRemaining * 10));
}

/**
 * Check if a player is currently jailed.
 */
function isJailed(player) {
  return player.jailedUntil !== null && Date.now() < player.jailedUntil;
}

/**
 * Check if a player is currently in hospital (dead / respawning).
 */
function isHospitalized(player) {
  return player.hospitalizedUntil !== null && Date.now() < player.hospitalizedUntil;
}

/**
 * Check if a player is currently travelling.
 */
function isTravelling(player) {
  return player.travelling === true && player.travelEndTime > Date.now();
}

/**
 * Check if a player is under witness protection.
 */
function isProtected(player) {
  return player.witnessProtectionUntil !== null && Date.now() < player.witnessProtectionUntil;
}

/**
 * Seconds remaining on a cooldown epoch ms. Returns 0 if not on cooldown.
 */
function cooldownRemaining(epochMs) {
  if (!epochMs) return 0;
  const remaining = epochMs - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Clamp a value between min and max.
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a business ID from type and state.
 */
function businessId(typeId, state) {
  return `${typeId}_${state}`;
}

module.exports = {
  randInt,
  formatCash,
  formatDuration,
  relativeTimestamp,
  shortTimestamp,
  getRankIndex,
  calcBailCost,
  isJailed,
  isHospitalized,
  isTravelling,
  isProtected,
  cooldownRemaining,
  clamp,
  businessId,
};
