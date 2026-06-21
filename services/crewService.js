// ─────────────────────────────────────────────
//  crewService.js  —  Crew game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
//
//  Crew is a social grouping system only.
//  No passive income, no upgrades, no vault.
// ─────────────────────────────────────────────

const { CREW_CREATION_COST, ACTION_TYPES } = require('../data/constants');
const playerRepository = require('../repositories/playerRepository');
const crewRepository   = require('../repositories/crewRepository');
const logRepository    = require('../repositories/logRepository');

// ── create ────────────────────────────────────

async function create(serverId, discordId, username, name) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };
  if (player.crewId) return { success: false, message: 'You are already in a crew. Leave first.', data: {} };

  const trimmed = (name ?? '').trim();
  if (trimmed.length < 3 || trimmed.length > 32) {
    return { success: false, message: 'Crew name must be 3–32 characters.', data: {} };
  }

  const existing = await crewRepository.getCrewByName(serverId, trimmed);
  if (existing) return { success: false, message: `A crew named **${trimmed}** already exists.`, data: {} };

  if ((player.cash ?? 0) < CREW_CREATION_COST) {
    return { success: false, message: `You need **$${CREW_CREATION_COST.toLocaleString('en-US')}** to create a crew.`, data: {} };
  }

  const now    = Date.now();
  const crewId = `${discordId}_${now}`;

  const crew = {
    crewId,
    serverId,
    name:        trimmed,
    leaderId:    discordId,
    leaderName:  username,
    createdAt:   now,
    memberCount: 1,
    members: {
      [discordId]: { username, role: 'leader', joinedAt: now },
    },
  };

  await crewRepository.createCrew(serverId, crewId, discordId, username, trimmed);
  await playerRepository.updatePlayer(serverId, discordId, {
    crewId,
    crewRole: 'leader',
    cash: (player.cash ?? 0) - CREW_CREATION_COST,
  });

  logRepository.write(serverId, {
    discordId, actionType: ACTION_TYPES.SOCIAL, actionName: 'crew_create',
    payload: { crewId, crewName: trimmed },
  }).catch(() => {});

  return { success: true, message: `**${trimmed}** has been founded!`, data: { crewId, crewName: trimmed } };
}

// ── joinCrew ──────────────────────────────────

async function joinCrew(serverId, discordId, crewName) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };
  if (player.crewId) return { success: false, message: 'You are already in a crew. Leave first.', data: {} };

  const crew = await crewRepository.getCrewByName(serverId, crewName);
  if (!crew) return { success: false, message: `No crew named **${crewName}** found.`, data: {} };

  const memberCount = Object.keys(crew.members ?? {}).length;
  if (memberCount >= 20) return { success: false, message: 'That crew is full (20 members max).', data: {} };

  const now = Date.now();
  await crewRepository.updateCrew(serverId, crew.crewId, {
    [`members.${discordId}`]: { username: player.username ?? discordId, role: 'member', joinedAt: now },
    memberCount: memberCount + 1,
  });
  await playerRepository.updatePlayer(serverId, discordId, { crewId: crew.crewId, crewRole: 'member' });

  logRepository.write(serverId, {
    discordId, actionType: ACTION_TYPES.SOCIAL, actionName: 'crew_join',
    payload: { crewId: crew.crewId, crewName: crew.name },
  }).catch(() => {});

  return { success: true, message: `You joined **${crew.name}**!`, data: { crewId: crew.crewId } };
}

// ── leaveCrew ─────────────────────────────────

async function leaveCrew(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };
  if (!player.crewId) return { success: false, message: 'You are not in a crew.', data: {} };

  const crew = await crewRepository.getCrew(serverId, player.crewId);
  if (!crew) return { success: false, message: 'Crew not found.', data: {} };
  if (crew.leaderId === discordId) return { success: false, message: 'Leaders cannot leave — disband or transfer leadership first.', data: {} };

  const updatedMembers = { ...crew.members };
  delete updatedMembers[discordId];

  await crewRepository.updateCrew(serverId, player.crewId, {
    members:     updatedMembers,
    memberCount: Math.max(0, (crew.memberCount ?? 1) - 1),
  });
  await playerRepository.updatePlayer(serverId, discordId, { crewId: null, crewRole: null });

  logRepository.write(serverId, {
    discordId, actionType: ACTION_TYPES.SOCIAL, actionName: 'crew_leave',
    payload: { crewId: player.crewId, crewName: crew.name },
  }).catch(() => {});

  return { success: true, message: `You left **${crew.name}**.`, data: {} };
}

// ── kickMember ────────────────────────────────

async function kickMember(serverId, leaderId, targetId) {
  const leader = await playerRepository.getPlayer(serverId, leaderId);
  if (!leader?.crewId) return { success: false, message: 'You are not in a crew.', data: {} };

  const crew = await crewRepository.getCrew(serverId, leader.crewId);
  if (!crew) return { success: false, message: 'Crew not found.', data: {} };
  if (crew.leaderId !== leaderId) return { success: false, message: 'Only the leader can kick members.', data: {} };
  if (targetId === leaderId) return { success: false, message: 'You cannot kick yourself.', data: {} };
  if (!(targetId in (crew.members ?? {}))) return { success: false, message: 'That player is not in your crew.', data: {} };

  const targetName     = crew.members[targetId]?.username ?? targetId;
  const updatedMembers = { ...crew.members };
  delete updatedMembers[targetId];

  await crewRepository.updateCrew(serverId, leader.crewId, {
    members:     updatedMembers,
    memberCount: Math.max(0, (crew.memberCount ?? 1) - 1),
  });
  await playerRepository.updatePlayer(serverId, targetId, { crewId: null, crewRole: null });

  logRepository.write(serverId, {
    discordId: leaderId, actionType: ACTION_TYPES.SOCIAL, actionName: 'crew_kick',
    payload: { crewId: leader.crewId, targetId, targetName },
  }).catch(() => {});

  return { success: true, message: `**${targetName}** has been kicked.`, data: { targetId } };
}

async function disbandCrew(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player?.crewId) return { success: false, message: 'You are not in a crew.', data: {} };

  const crew = await crewRepository.getCrew(serverId, player.crewId);
  if (!crew) return { success: false, message: 'Crew not found.', data: {} };
  if (crew.leaderId !== discordId) return { success: false, message: 'Only the leader can disband the crew.', data: {} };

  // Clear crewId from all members
  const memberIds = Object.keys(crew.members ?? {});
  await Promise.all(memberIds.map(id =>
    playerRepository.updatePlayer(serverId, id, { crewId: null, crewRole: null })
  ));

  await crewRepository.deleteCrew(serverId, player.crewId);

  logRepository.write(serverId, {
    discordId, actionType: ACTION_TYPES.SOCIAL, actionName: 'crew_disband',
    payload: { crewId: player.crewId, crewName: crew.name, memberCount: memberIds.length },
  }).catch(() => {});

  return { success: true, message: `**${crew.name}** has been disbanded.`, data: {} };
}

module.exports = { create, joinCrew, leaveCrew, kickMember, disbandCrew };
