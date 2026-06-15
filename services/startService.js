// ─────────────────────────────────────────────
//  startService.js  —  Character creation logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const playerRepository = require('../repositories/playerRepository');
const logRepository    = require('../repositories/logRepository');
const { ACTION_TYPES } = require('../data/constants');

// ── Validation ─────────────────────────────────

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 24;
// Letters, numbers, spaces, apostrophes, hyphens only.
const NAME_PATTERN = /^[A-Za-z0-9' -]+$/;

const VALID_SEXES = ['male', 'female'];

function validateCharacterName(name) {
  const trimmed = (name ?? '').trim();

  if (trimmed.length < NAME_MIN_LENGTH || trimmed.length > NAME_MAX_LENGTH) {
    return { valid: false, reason: `Character name must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters.` };
  }

  if (!NAME_PATTERN.test(trimmed)) {
    return { valid: false, reason: 'Character name can only contain letters, numbers, spaces, apostrophes, and hyphens.' };
  }

  return { valid: true, name: trimmed };
}

// ── Public API ─────────────────────────────────

/**
 * Check whether a player document already exists for this Discord user.
 * Used by /start to decide whether to show the creation modal or an
 * "already started" message.
 */
async function hasStarted(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  return player !== null;
}

/**
 * Create a new player and apply their chosen character name + sex.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {string} username        - Discord username (for records/intel display)
 * @param {string} characterName   - raw user input from the modal
 * @param {string} sex             - 'male' | 'female'
 * @returns {object} Result Object
 */
async function createCharacter(serverId, discordId, username, characterName, sex) {
  // ── Already exists? ────────────────────────
  const existing = await playerRepository.getPlayer(serverId, discordId);
  if (existing) {
    return {
      success: false,
      message: 'You already have a character on this server. Use `/profile` to view it.',
      data: { alreadyExists: true },
      updates: {},
      log: null,
    };
  }

  // ── Validate name ──────────────────────────
  const nameCheck = validateCharacterName(characterName);
  if (!nameCheck.valid) {
    return {
      success: false,
      message: nameCheck.reason,
      data: { invalidName: true },
      updates: {},
      log: null,
    };
  }

  // ── Validate sex ───────────────────────────
  const normalizedSex = (sex ?? '').toLowerCase().trim();
  if (!VALID_SEXES.includes(normalizedSex)) {
    return {
      success: false,
      message: `Please choose either "male" or "female".`,
      data: { invalidSex: true },
      updates: {},
      log: null,
    };
  }

  // ── Create the player document ─────────────
  const player = await playerRepository.createPlayer(serverId, discordId, username);

  // Apply onboarding fields on top of the defaults
  const updates = {
    characterName: nameCheck.name,
    sex: normalizedSex,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.SOCIAL,
    actionName: 'character_created',
    location: player.state,
    payload: { characterName: nameCheck.name, sex: normalizedSex },
  }).catch(() => {});

  return {
    success: true,
    message: `Welcome to **Generational Gangsters**, **${nameCheck.name}**! Your story starts now.`,
    data: {
      characterName: nameCheck.name,
      sex: normalizedSex,
      state: player.state,
      cash: player.cash,
    },
    updates,
    log: { actionType: ACTION_TYPES.SOCIAL, actionName: 'character_created' },
  };
}

module.exports = {
  hasStarted,
  createCharacter,
  validateCharacterName,
};
