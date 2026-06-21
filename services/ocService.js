// ─────────────────────────────────────────────
//  ocService.js  —  Organised Crime game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
//
//  Flow:
//  1. Leader calls createLobby()  → lobby doc created, invite link generated
//  2. Members call joinLobby()    → adds them to the lobby
//  3. Any member calls readyUp()  → toggles their ready state
//  4. Leader calls startOC()      → validates all ready, runs the mission
//  5. All participants get results (cash/xp split equally)
//
//  Lobby doc shape (servers/{serverId}/oc_lobbies/{lobbyId}):
//  {
//    lobbyId, serverId, ocTypeId, leaderId, leaderName,
//    createdAt, expiresAt,
//    status: 'open' | 'running' | 'complete' | 'expired',
//    members: {
//      [discordId]: { discordId, username, ready: bool, joinedAt }
//    }
//  }
// ─────────────────────────────────────────────

const {
  OC_TYPES,
  OC_LINK_EXPIRY,
  OC_CRITICAL_FAIL_PCT,
  RANKS,
  ACTION_TYPES,
} = require('../data/constants');

const playerRepository = require('../repositories/playerRepository');
const ocRepository     = require('../repositories/ocRepository');
const logRepository    = require('../repositories/logRepository');
const { randInt, getRankIndex, displayName } = require('../utils/helpers');

// ── Internal helpers ──────────────────────────

function rankIndex(player) {
  return getRankIndex(player.xp ?? 0, RANKS);
}

function generateLobbyId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Public API ────────────────────────────────

/**
 * Create a new OC lobby. Leader must not be in jail/hospital/travelling.
 * One open lobby per player at a time.
 *
 * @param {string} serverId
 * @param {string} discordId   — leader's Discord ID
 * @param {string} ocTypeId    — key from OC_TYPES
 * @returns {object} Result
 */
async function createLobby(serverId, discordId, ocTypeId) {
  const ocType = OC_TYPES[ocTypeId];
  if (!ocType) {
    return { success: false, message: 'Unknown OC type.', data: {} };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {} };
  }

  // Status checks
  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot start an OC from jail.', data: { jailed: true } };
  }
  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return { success: false, message: 'You cannot start an OC from the hospital.', data: { hospitalized: true } };
  }
  if (player.travelling && player.travelEndTime > Date.now()) {
    return { success: false, message: 'You cannot start an OC while travelling.', data: { travelling: true } };
  }

  // Rank check
  if (rankIndex(player) < ocType.minRank) {
    return {
      success: false,
      message: `You need to be rank **${RANKS[ocType.minRank].name}** or higher to run a ${ocType.name}.`,
      data: { rankRequired: ocType.minRank },
    };
  }

  // OC cooldown check
  const lastOc = player.ocCooldowns?.[ocTypeId] ?? null;
  if (lastOc && Date.now() < lastOc + ocType.cooldown * 1000) {
    return {
      success: false,
      message: `**${ocType.name}** is on cooldown.`,
      data: { onCooldown: true, nextAvailableMs: lastOc + ocType.cooldown * 1000 },
    };
  }

  // Check player not already in an open lobby
  const existingLobby = await ocRepository.getOpenLobbyForPlayer(serverId, discordId);
  if (existingLobby) {
    return {
      success: false,
      message: 'You already have an open OC lobby. Close it before creating a new one.',
      data: { existingLobbyId: existingLobby.lobbyId },
    };
  }

  const now     = Date.now();
  const lobbyId = generateLobbyId();
  const lobby   = {
    lobbyId,
    serverId,
    ocTypeId,
    leaderId:    discordId,
    leaderName:  displayName(player),
    createdAt:   now,
    expiresAt:   now + OC_LINK_EXPIRY * 1000,
    status:      'open',
    members: {
      [discordId]: {
        discordId,
        username: displayName(player),
        ready:    false,
        joinedAt: now,
      },
    },
  };

  await ocRepository.createLobby(serverId, lobbyId, lobby);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.SOCIAL,
    actionName: 'oc_create_lobby',
    location:   player.state,
    payload:    { ocTypeId, lobbyId },
  }).catch(() => {});

  return {
    success: true,
    message: `OC lobby created for **${ocType.name}**. Share the lobby ID with your crew: \`${lobbyId}\``,
    data:    { lobby, ocType },
  };
}

/**
 * Join an existing OC lobby by lobbyId.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {string} lobbyId
 */
async function joinLobby(serverId, discordId, lobbyId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) {
    return { success: false, message: 'Player not found.', data: {} };
  }

  // Status checks
  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot join an OC from jail.', data: { jailed: true } };
  }
  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return { success: false, message: 'You cannot join an OC from the hospital.', data: { hospitalized: true } };
  }
  if (player.travelling && player.travelEndTime > Date.now()) {
    return { success: false, message: 'You cannot join an OC while travelling.', data: { travelling: true } };
  }

  const lobby = await ocRepository.getLobby(serverId, lobbyId);
  if (!lobby) {
    return { success: false, message: 'Lobby not found. It may have expired or already run.', data: {} };
  }

  if (lobby.status !== 'open') {
    return { success: false, message: `This lobby is no longer open (status: ${lobby.status}).`, data: {} };
  }

  if (Date.now() > lobby.expiresAt) {
    await ocRepository.updateLobby(serverId, lobbyId, { status: 'expired' });
    return { success: false, message: 'This lobby has expired.', data: { expired: true } };
  }

  const ocType = OC_TYPES[lobby.ocTypeId];
  const memberCount = Object.keys(lobby.members).length;

  if (discordId in lobby.members) {
    return { success: false, message: 'You are already in this lobby.', data: {} };
  }

  if (memberCount >= ocType.maxPlayers) {
    return { success: false, message: `This lobby is full (${ocType.maxPlayers}/${ocType.maxPlayers}).`, data: { full: true } };
  }

  if (rankIndex(player) < ocType.minRank) {
    return {
      success: false,
      message: `You need to be rank **${RANKS[ocType.minRank].name}** or higher to join this OC.`,
      data: { rankRequired: ocType.minRank },
    };
  }

  const memberEntry = {
    discordId,
    username: displayName(player),
    ready:    false,
    joinedAt: Date.now(),
  };

  await ocRepository.updateLobby(serverId, lobbyId, {
    [`members.${discordId}`]: memberEntry,
  });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.SOCIAL,
    actionName: 'oc_join_lobby',
    location:   player.state,
    payload:    { ocTypeId: lobby.ocTypeId, lobbyId },
  }).catch(() => {});

  return {
    success: true,
    message: `You joined the **${ocType.name}** lobby.`,
    data:    { lobby: { ...lobby, members: { ...lobby.members, [discordId]: memberEntry } }, ocType, memberEntry },
  };
}

/**
 * Toggle ready state for a member.
 *
 * @param {string} serverId
 * @param {string} discordId
 * @param {string} lobbyId
 */
async function readyUp(serverId, discordId, lobbyId) {
  const lobby = await ocRepository.getLobby(serverId, lobbyId);
  if (!lobby) {
    return { success: false, message: 'Lobby not found.', data: {} };
  }

  if (lobby.status !== 'open') {
    return { success: false, message: 'This lobby is no longer open.', data: {} };
  }

  if (!(discordId in lobby.members)) {
    return { success: false, message: 'You are not in this lobby.', data: {} };
  }

  if (Date.now() > lobby.expiresAt) {
    await ocRepository.updateLobby(serverId, lobbyId, { status: 'expired' });
    return { success: false, message: 'This lobby has expired.', data: { expired: true } };
  }

  const currentReady = lobby.members[discordId].ready ?? false;
  const newReady     = !currentReady;

  await ocRepository.updateLobby(serverId, lobbyId, {
    [`members.${discordId}.ready`]: newReady,
  });

  return {
    success: true,
    message: newReady ? 'You are now **ready**.' : 'You marked yourself as **not ready**.',
    data:    { ready: newReady, lobbyId },
  };
}

/**
 * Leave a lobby (non-leaders only — leaders must cancel).
 */
async function leaveLobby(serverId, discordId, lobbyId) {
  const lobby = await ocRepository.getLobby(serverId, lobbyId);
  if (!lobby) return { success: false, message: 'Lobby not found.', data: {} };
  if (lobby.status !== 'open') return { success: false, message: 'Lobby is not open.', data: {} };
  if (!(discordId in lobby.members)) return { success: false, message: 'You are not in this lobby.', data: {} };
  if (lobby.leaderId === discordId) return { success: false, message: 'Leaders cannot leave — use Cancel instead.', data: {} };

  const updatedMembers = { ...lobby.members };
  delete updatedMembers[discordId];
  await ocRepository.updateLobby(serverId, lobbyId, { members: updatedMembers });

  return { success: true, message: 'You left the lobby.', data: { lobbyId } };
}

/**
 * Cancel a lobby (leader only).
 */
async function cancelLobby(serverId, discordId, lobbyId) {
  const lobby = await ocRepository.getLobby(serverId, lobbyId);
  if (!lobby) return { success: false, message: 'Lobby not found.', data: {} };
  if (lobby.leaderId !== discordId) return { success: false, message: 'Only the leader can cancel this lobby.', data: {} };
  if (lobby.status !== 'open') return { success: false, message: 'Lobby is not open.', data: {} };

  await ocRepository.updateLobby(serverId, lobbyId, { status: 'expired' });
  return { success: true, message: 'Lobby cancelled.', data: { lobbyId } };
}

/**
 * Kick a member from the lobby (leader only).
 */
async function kickMember(serverId, leaderId, lobbyId, targetId) {
  const lobby = await ocRepository.getLobby(serverId, lobbyId);
  if (!lobby) return { success: false, message: 'Lobby not found.', data: {} };
  if (lobby.leaderId !== leaderId) return { success: false, message: 'Only the leader can kick members.', data: {} };
  if (lobby.status !== 'open') return { success: false, message: 'Lobby is not open.', data: {} };
  if (targetId === leaderId) return { success: false, message: 'You cannot kick yourself.', data: {} };
  if (!(targetId in lobby.members)) return { success: false, message: 'That player is not in this lobby.', data: {} };

  const updatedMembers = { ...lobby.members };
  delete updatedMembers[targetId];
  await ocRepository.updateLobby(serverId, lobbyId, { members: updatedMembers });

  return {
    success: true,
    message: `**${lobby.members[targetId].username}** was kicked from the lobby.`,
    data:    { lobbyId, kickedId: targetId },
  };
}

/**
 * Start the OC — leader only. All members must be ready. Minimum player count met.
 * Resolves the mission outcome and pays all participants.
 *
 * @param {string} serverId
 * @param {string} discordId  — must be the leader
 * @param {string} lobbyId
 * @returns {object} Result with per-member payouts
 */
async function startOC(serverId, discordId, lobbyId) {
  const lobby = await ocRepository.getLobby(serverId, lobbyId);
  if (!lobby) {
    return { success: false, message: 'Lobby not found.', data: {} };
  }

  if (lobby.leaderId !== discordId) {
    return { success: false, message: 'Only the leader can start the OC.', data: {} };
  }

  if (lobby.status !== 'open') {
    return { success: false, message: `Lobby is already ${lobby.status}.`, data: {} };
  }

  if (Date.now() > lobby.expiresAt) {
    await ocRepository.updateLobby(serverId, lobbyId, { status: 'expired' });
    return { success: false, message: 'This lobby has expired.', data: { expired: true } };
  }

  const ocType    = OC_TYPES[lobby.ocTypeId];
  const members   = Object.values(lobby.members);
  const memberCount = members.length;

  if (memberCount < ocType.minPlayers) {
    return {
      success: false,
      message: `Need at least **${ocType.minPlayers} players** to start. Currently ${memberCount}/${ocType.minPlayers}.`,
      data:    { memberCount, required: ocType.minPlayers },
    };
  }

  // All members (except leader) must be ready
  const notReady = members.filter(m => m.discordId !== discordId && !m.ready);
  if (notReady.length > 0) {
    return {
      success: false,
      message: `Waiting for ${notReady.map(m => `**${m.username}**`).join(', ')} to ready up.`,
      data:    { notReady: notReady.map(m => m.discordId) },
    };
  }

  // Mark lobby as running immediately to prevent double-starts
  await ocRepository.updateLobby(serverId, lobbyId, { status: 'running' });

  // ── Resolve outcome ──────────────────────────
  const roll          = Math.random();
  const critFailThres = ocType.successRate * OC_CRITICAL_FAIL_PCT;
  const isCritFail    = roll < critFailThres;
  const isSuccess     = !isCritFail && roll < ocType.successRate;

  const now          = Date.now();
  const memberIds    = members.map(m => m.discordId);
  const players      = await playerRepository.getPlayers(serverId, memberIds);
  const playerMap    = Object.fromEntries(players.map(p => [p.discordId, p]));

  const memberResults = [];

  if (isSuccess) {
    // Split cash and XP equally among members
    const totalCash = randInt(ocType.cashRange[0], ocType.cashRange[1]);
    const totalXp   = randInt(ocType.xpRange[0],   ocType.xpRange[1]);
    const perCash   = Math.floor(totalCash / memberCount);
    const perXp     = Math.floor(totalXp   / memberCount);

    for (const member of members) {
      const p = playerMap[member.discordId];
      if (!p) continue;

      await playerRepository.updatePlayer(serverId, member.discordId, {
        cash:                  (p.cash ?? 0) + perCash,
        xp:                    (p.xp   ?? 0) + perXp,
        [`ocCooldowns.${lobby.ocTypeId}`]: now,
        'stats.ocAttempted':   (p.stats?.ocAttempted ?? 0) + 1,
        'stats.ocSucceeded':   (p.stats?.ocSucceeded ?? 0) + 1,
        'stats.cashFromOc':    (p.stats?.cashFromOc  ?? 0) + perCash,
      });

      memberResults.push({
        discordId: member.discordId,
        username:  member.username,
        cashEarned: perCash,
        xpGained:   perXp,
        jailed:     false,
      });
    }

    await ocRepository.updateLobby(serverId, lobbyId, {
      status: 'complete',
      outcome: 'success',
      completedAt: now,
      totalCash, totalXp, perCash, perXp,
    });

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.CRIME,
      actionName: 'oc_complete',
      payload:    { ocTypeId: lobby.ocTypeId, lobbyId, outcome: 'success', memberIds, totalCash, totalXp },
    }).catch(() => {});

    return {
      success: true,
      message: `**${ocType.name}** succeeded! Each member earned **$${perCash.toLocaleString('en-US')}** and **${perXp} XP**.`,
      data:    { outcome: 'success', ocType, memberResults, totalCash, totalXp, perCash, perXp },
    };

  } else if (isCritFail) {
    // Critical failure — ALL members jailed
    const jailSeconds = Math.floor(ocType.cooldown * 0.5);
    const jailedUntil = now + jailSeconds * 1000;

    for (const member of members) {
      const p = playerMap[member.discordId];
      if (!p) continue;

      await playerRepository.updatePlayer(serverId, member.discordId, {
        jailedUntil,
        [`ocCooldowns.${lobby.ocTypeId}`]: now,
        'stats.ocAttempted': (p.stats?.ocAttempted ?? 0) + 1,
      });

      memberResults.push({
        discordId:  member.discordId,
        username:   member.username,
        cashEarned: 0,
        xpGained:   0,
        jailed:     true,
        jailedUntil,
      });
    }

    await ocRepository.updateLobby(serverId, lobbyId, {
      status: 'complete',
      outcome: 'critical_fail',
      completedAt: now,
      jailSeconds,
    });

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.CRIME,
      actionName: 'oc_complete',
      payload:    { ocTypeId: lobby.ocTypeId, lobbyId, outcome: 'critical_fail', memberIds, jailSeconds },
    }).catch(() => {});

    return {
      success: false,
      message: `**${ocType.name}** — critical failure! The whole crew got busted. Everyone is jailed.`,
      data:    { outcome: 'critical_fail', ocType, memberResults, jailSeconds, jailedUntil },
    };

  } else {
    // Standard failure — no jail, just nothing earned, cooldown still applied
    for (const member of members) {
      const p = playerMap[member.discordId];
      if (!p) continue;

      await playerRepository.updatePlayer(serverId, member.discordId, {
        [`ocCooldowns.${lobby.ocTypeId}`]: now,
        'stats.ocAttempted': (p.stats?.ocAttempted ?? 0) + 1,
      });

      memberResults.push({
        discordId:  member.discordId,
        username:   member.username,
        cashEarned: 0,
        xpGained:   0,
        jailed:     false,
      });
    }

    await ocRepository.updateLobby(serverId, lobbyId, {
      status: 'complete',
      outcome: 'fail',
      completedAt: now,
    });

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.CRIME,
      actionName: 'oc_complete',
      payload:    { ocTypeId: lobby.ocTypeId, lobbyId, outcome: 'fail', memberIds },
    }).catch(() => {});

    return {
      success: false,
      message: `**${ocType.name}** failed — the crew escaped without getting caught, but walked away empty-handed.`,
      data:    { outcome: 'fail', ocType, memberResults },
    };
  }
}

/**
 * Get a fresh lobby for rendering.
 */
async function getLobby(serverId, lobbyId) {
  return ocRepository.getLobby(serverId, lobbyId);
}

/**
 * Get OC cooldown state for a player across all OC types.
 * @returns {{ [ocTypeId]: { onCooldown, nextAvailableMs } }}
 */
function getOcCooldowns(player) {
  const result = {};
  for (const [id, ocType] of Object.entries(OC_TYPES)) {
    const last = player.ocCooldowns?.[id] ?? null;
    const nextMs = last ? last + ocType.cooldown * 1000 : 0;
    result[id] = {
      onCooldown:     Date.now() < nextMs,
      nextAvailableMs: nextMs,
    };
  }
  return result;
}

module.exports = {
  createLobby,
  joinLobby,
  readyUp,
  leaveLobby,
  cancelLobby,
  kickMember,
  startOC,
  getLobby,
  getOcCooldowns,
};
