// ─────────────────────────────────────────────
//  embeds.js  —  Shared embed factory helpers.
//  No game logic. No DB access.
//  Used by panel renderers to keep boilerplate DRY.
// ─────────────────────────────────────────────

const { EmbedBuilder } = require('discord.js');

// Colour palette
const COLOURS = {
  success:  0x2ecc71,  // green
  failure:  0xe74c3c,  // red
  warning:  0xf39c12,  // orange
  info:     0x3498db,  // blue
  neutral:  0x95a5a6,  // grey
  gold:     0xf1c40f,  // yellow/gold
  purple:   0x9b59b6,
  dark:     0x2c3e50,
};

/**
 * Base embed with consistent footer.
 */
function base(colour = COLOURS.neutral) {
  return new EmbedBuilder()
    .setColor(colour)
    .setFooter({ text: 'Generational Gangsters' })
    .setTimestamp();
}

function success(title, description) {
  return base(COLOURS.success).setTitle(`✅ ${title}`).setDescription(description);
}

function failure(title, description) {
  return base(COLOURS.failure).setTitle(`❌ ${title}`).setDescription(description);
}

function warning(title, description) {
  return base(COLOURS.warning).setTitle(`⚠️ ${title}`).setDescription(description);
}

function info(title, description) {
  return base(COLOURS.info).setTitle(`ℹ️ ${title}`).setDescription(description);
}

/**
 * Generic error embed — used when something unexpected goes wrong.
 */
function error(message = 'An unexpected error occurred.') {
  return base(COLOURS.failure)
    .setTitle('Something went wrong')
    .setDescription(message);
}

/**
 * Jailed embed — returned when a player tries to act while in jail.
 */
function jailed(jailedUntil) {
  const { relativeTimestamp } = require('./helpers');
  return base(COLOURS.warning)
    .setTitle('🔒 You\'re in Jail')
    .setDescription(`You can't do that while behind bars.\nReleased ${relativeTimestamp(jailedUntil)}`);
}

/**
 * Dead embed — returned when a player tries to act while in hospital.
 */
function dead(hospitalizedUntil) {
  const { relativeTimestamp } = require('./helpers');
  return base(COLOURS.dark)
    .setTitle('💀 You\'re Dead')
    .setDescription(`You're respawning in the hospital.\nBack ${relativeTimestamp(hospitalizedUntil)}`);
}

/**
 * Cooldown embed — generic "too soon" response.
 */
function cooldown(actionName, epochMs) {
  const { relativeTimestamp } = require('./helpers');
  return base(COLOURS.neutral)
    .setTitle('⏳ Slow Down')
    .setDescription(`You can **${actionName}** again ${relativeTimestamp(epochMs)}`);
}

module.exports = {
  COLOURS,
  base,
  success,
  failure,
  warning,
  info,
  error,
  jailed,
  dead,
  cooldown,
};
