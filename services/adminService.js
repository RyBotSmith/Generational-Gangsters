// ─────────────────────────────────────────────
//  services/adminService.js  —  Admin action logic.
//  Rule: NO Discord imports. NO embeds.
//  Returns plain Result Objects { success, message, data }.
// ─────────────────────────────────────────────

const playerRepository = require('../repositories/playerRepository');
const logRepository    = require('../repositories/logRepository');
const {
  RANKS, CARS, WEAPONS, ARMOUR, VEHICLES,
  UPGRADES, BUSINESS_TYPES, ACTION_TYPES,
  BODYGUARD_COSTS, PRESTIGE_MAX,
} = require('../data/constants');

const ADMIN_ROLE_ID = '1515717429282471946';

// ── Auth helper ───────────────────────────────

function isAdmin(member) {
  return member?.roles?.cache?.has(ADMIN_ROLE_ID) ?? false;
}

// ── Lookup helper ─────────────────────────────

async function resolveTarget(serverId, rawInput) {
  // Accept a raw Discord ID (digits only) or a <@id> mention
  const id = rawInput.replace(/[<@!>]/g, '').trim();
  if (!/^\d+$/.test(id)) return { player: null, discordId: null, error: 'Invalid player ID or mention.' };
  const player = await playerRepository.getPlayer(serverId, id);
  if (!player) return { player: null, discordId: id, error: 'Player not found in this server.' };
  return { player, discordId: id, error: null };
}

function log(serverId, adminId, actionName, targetId, payload) {
  logRepository.write(serverId, {
    discordId: adminId,
    actionType: ACTION_TYPES.SOCIAL,
    actionName: `admin_${actionName}`,
    location: 'admin',
    payload: { targetId, ...payload },
  }).catch(() => {});
}

// ── Economy ───────────────────────────────────

async function giveCash(serverId, adminId, targetId, amount) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };
  if (!Number.isFinite(amount) || amount === 0) return { success: false, message: 'Amount must be a non-zero number.', data: {} };

  const newCash = Math.max(0, (player.cash ?? 0) + amount);
  await playerRepository.updatePlayer(serverId, player.discordId, { cash: newCash });
  log(serverId, adminId, 'give_cash', player.discordId, { amount, newCash });

  const verb = amount > 0 ? `gave **$${Math.abs(amount).toLocaleString()}** to` : `removed **$${Math.abs(amount).toLocaleString()}** from`;
  return {
    success: true,
    message: `✅ ${verb} **${player.characterName ?? player.username}**. New cash: **$${newCash.toLocaleString()}**.`,
    data: { newCash },
  };
}

async function giveBank(serverId, adminId, targetId, amount) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };
  if (!Number.isFinite(amount) || amount === 0) return { success: false, message: 'Amount must be a non-zero number.', data: {} };

  const newBank = Math.max(0, (player.bank ?? 0) + amount);
  await playerRepository.updatePlayer(serverId, player.discordId, { bank: newBank });
  log(serverId, adminId, 'give_bank', player.discordId, { amount, newBank });

  const verb = amount > 0 ? 'added to bank' : 'removed from bank';
  return {
    success: true,
    message: `✅ **$${Math.abs(amount).toLocaleString()}** ${verb} for **${player.characterName ?? player.username}**. New balance: **$${newBank.toLocaleString()}**.`,
    data: { newBank },
  };
}

// ── XP / Rank ─────────────────────────────────

async function giveXP(serverId, adminId, targetId, amount) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };
  if (!Number.isFinite(amount) || amount === 0) return { success: false, message: 'Amount must be a non-zero number.', data: {} };

  const newXP = Math.max(0, (player.xp ?? 0) + amount);

  // Recalculate rank index
  let newRankIndex = 0;
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (newXP >= RANKS[i].minXP) { newRankIndex = i; break; }
  }

  await playerRepository.updatePlayer(serverId, player.discordId, { xp: newXP, rankIndex: newRankIndex });
  log(serverId, adminId, 'give_xp', player.discordId, { amount, newXP, newRankIndex });

  const rankName = RANKS[newRankIndex]?.name ?? 'Unknown';
  return {
    success: true,
    message: `✅ **${player.characterName ?? player.username}** now has **${newXP.toLocaleString()} XP** — Rank: **${rankName}**.`,
    data: { newXP, newRankIndex, rankName },
  };
}

async function setRank(serverId, adminId, targetId, rankIndex) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const rank = RANKS[rankIndex];
  if (!rank) return { success: false, message: `Invalid rank index (0–${RANKS.length - 1}).`, data: {} };

  await playerRepository.updatePlayer(serverId, player.discordId, { xp: rank.minXP, rankIndex });
  log(serverId, adminId, 'set_rank', player.discordId, { rankIndex, rankName: rank.name });

  return {
    success: true,
    message: `✅ **${player.characterName ?? player.username}** set to rank **${rank.name}** (${rank.minXP.toLocaleString()} XP).`,
    data: { rankIndex, rankName: rank.name, xp: rank.minXP },
  };
}

// ── Bullets ───────────────────────────────────

async function giveBullets(serverId, adminId, targetId, amount) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };
  if (!Number.isFinite(amount) || amount === 0) return { success: false, message: 'Amount must be a non-zero number.', data: {} };

  const newBullets = Math.max(0, (player.bullets ?? 0) + amount);
  await playerRepository.updatePlayer(serverId, player.discordId, { bullets: newBullets });
  log(serverId, adminId, 'give_bullets', player.discordId, { amount, newBullets });

  const verb = amount > 0 ? 'gave' : 'removed';
  return {
    success: true,
    message: `✅ ${verb} **${Math.abs(amount).toLocaleString()} bullets** ${amount > 0 ? 'to' : 'from'} **${player.characterName ?? player.username}**. Total: **${newBullets.toLocaleString()}**.`,
    data: { newBullets },
  };
}

// ── Jail / Unjail ─────────────────────────────

async function jailPlayer(serverId, adminId, targetId, seconds) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };
  if (!Number.isFinite(seconds) || seconds <= 0) return { success: false, message: 'Duration must be a positive number of seconds.', data: {} };

  const jailedUntil = Date.now() + seconds * 1000;
  await playerRepository.updatePlayer(serverId, player.discordId, { jailedUntil });
  log(serverId, adminId, 'jail', player.discordId, { seconds, jailedUntil });

  return {
    success: true,
    message: `🔒 **${player.characterName ?? player.username}** jailed for **${seconds}s** (releases <t:${Math.floor(jailedUntil / 1000)}:R>).`,
    data: { jailedUntil },
  };
}

async function unjailPlayer(serverId, adminId, targetId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  await playerRepository.updatePlayer(serverId, player.discordId, { jailedUntil: null });
  log(serverId, adminId, 'unjail', player.discordId, {});

  return {
    success: true,
    message: `🔓 **${player.characterName ?? player.username}** released from jail.`,
    data: {},
  };
}

// ── Ban / Unban ───────────────────────────────

async function banPlayer(serverId, adminId, targetId, reason) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  await playerRepository.updatePlayer(serverId, player.discordId, {
    banned: true,
    bannedReason: reason ?? 'No reason provided.',
  });
  log(serverId, adminId, 'ban', player.discordId, { reason });

  return {
    success: true,
    message: `🚫 **${player.characterName ?? player.username}** has been banned. Reason: ${reason ?? 'None'}.`,
    data: {},
  };
}

async function unbanPlayer(serverId, adminId, targetId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  await playerRepository.updatePlayer(serverId, player.discordId, {
    banned: false,
    bannedReason: null,
  });
  log(serverId, adminId, 'unban', player.discordId, {});

  return {
    success: true,
    message: `✅ **${player.characterName ?? player.username}** has been unbanned.`,
    data: {},
  };
}

// ── Health ────────────────────────────────────

async function setHealth(serverId, adminId, targetId, hp) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const clamped = Math.max(0, Math.min(100, hp));
  const updates = { health: clamped };
  if (clamped > 0 && !player.alive) {
    updates.alive = true;
    updates.hospitalizedUntil = null;
  }
  await playerRepository.updatePlayer(serverId, player.discordId, updates);
  log(serverId, adminId, 'set_health', player.discordId, { hp: clamped });

  return {
    success: true,
    message: `❤️ **${player.characterName ?? player.username}**'s health set to **${clamped}/100**.`,
    data: { health: clamped },
  };
}

async function revivePlayer(serverId, adminId, targetId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  await playerRepository.updatePlayer(serverId, player.discordId, {
    alive: true,
    health: 100,
    hospitalizedUntil: null,
  });
  log(serverId, adminId, 'revive', player.discordId, {});

  return {
    success: true,
    message: `💚 **${player.characterName ?? player.username}** has been revived with full health.`,
    data: {},
  };
}

// ── Bodyguards ────────────────────────────────

async function setBG(serverId, adminId, targetId, slot, alive) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };
  if (![1, 2, 3, 4].includes(slot)) return { success: false, message: 'Slot must be 1–4.', data: {} };

  await playerRepository.updatePlayer(serverId, player.discordId, {
    [`bodyguards.${slot}.alive`]: alive,
    [`bodyguards.${slot}.hp`]: alive ? 100 : 0,
  });
  log(serverId, adminId, 'set_bg', player.discordId, { slot, alive });

  return {
    success: true,
    message: `🛡️ **${player.characterName ?? player.username}** BG slot ${slot} set to **${alive ? 'alive' : 'dead'}**.`,
    data: {},
  };
}

async function clearAllBGs(serverId, adminId, targetId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const updates = {};
  for (let i = 1; i <= 4; i++) {
    updates[`bodyguards.${i}.alive`] = false;
    updates[`bodyguards.${i}.hp`]    = 0;
  }
  await playerRepository.updatePlayer(serverId, player.discordId, updates);
  log(serverId, adminId, 'clear_bgs', player.discordId, {});

  return {
    success: true,
    message: `🛡️ All bodyguards cleared for **${player.characterName ?? player.username}**.`,
    data: {},
  };
}

// ── Inventory — Cars ──────────────────────────

async function giveCar(serverId, adminId, targetId, carId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const car = CARS[carId];
  if (!car) return { success: false, message: `Unknown car ID: \`${carId}\`.`, data: {} };

  const garage = player.inventory?.garage ?? [];
  await playerRepository.updatePlayer(serverId, player.discordId, {
    'inventory.garage': [...garage, carId],
  });
  log(serverId, adminId, 'give_car', player.discordId, { carId });

  return {
    success: true,
    message: `🚗 **${car.name}** added to **${player.characterName ?? player.username}**'s garage.`,
    data: { carId },
  };
}

async function takeCar(serverId, adminId, targetId, carId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const garage = player.inventory?.garage ?? [];
  const idx    = garage.indexOf(carId);
  if (idx === -1) return { success: false, message: `**${player.characterName ?? player.username}** does not have a \`${carId}\` in their garage.`, data: {} };

  const newGarage = [...garage];
  newGarage.splice(idx, 1);
  await playerRepository.updatePlayer(serverId, player.discordId, { 'inventory.garage': newGarage });
  log(serverId, adminId, 'take_car', player.discordId, { carId });

  const car = CARS[carId];
  return {
    success: true,
    message: `🚗 **${car?.name ?? carId}** removed from **${player.characterName ?? player.username}**'s garage.`,
    data: { carId },
  };
}

async function clearGarage(serverId, adminId, targetId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  await playerRepository.updatePlayer(serverId, player.discordId, { 'inventory.garage': [] });
  log(serverId, adminId, 'clear_garage', player.discordId, {});

  return {
    success: true,
    message: `🚗 Garage cleared for **${player.characterName ?? player.username}**.`,
    data: {},
  };
}

// ── Inventory — Weapons / Armour ──────────────

async function giveWeapon(serverId, adminId, targetId, weaponId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const weapon = WEAPONS[weaponId];
  if (!weapon) return { success: false, message: `Unknown weapon ID: \`${weaponId}\`.`, data: {} };

  const owned = player.inventory?.ownedWeapons ?? [];
  const item  = { id: weaponId, shotsUsed: 0, killsUsed: 0 };
  await playerRepository.updatePlayer(serverId, player.discordId, {
    'inventory.ownedWeapons': [...owned, item],
  });
  log(serverId, adminId, 'give_weapon', player.discordId, { weaponId });

  return {
    success: true,
    message: `🔫 **${weapon.name}** given to **${player.characterName ?? player.username}**.`,
    data: { weaponId },
  };
}

async function giveArmour(serverId, adminId, targetId, armourId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const piece = ARMOUR[armourId];
  if (!piece) return { success: false, message: `Unknown armour ID: \`${armourId}\`.`, data: {} };

  const item = { id: armourId, shotsAbsorbed: 0, deathsSurvived: 0 };
  const slot  = piece.slot === 'headwear' ? 'ownedHeadwear' : 'ownedArmour';
  const owned = player.inventory?.[slot] ?? [];

  await playerRepository.updatePlayer(serverId, player.discordId, {
    [`inventory.${slot}`]: [...owned, item],
  });
  log(serverId, adminId, 'give_armour', player.discordId, { armourId });

  return {
    success: true,
    message: `🛡️ **${piece.name}** given to **${player.characterName ?? player.username}**.`,
    data: { armourId },
  };
}

// ── Upgrades ──────────────────────────────────

async function setUpgrade(serverId, adminId, targetId, upgradeId, level) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const upgrade = UPGRADES[upgradeId];
  if (!upgrade) return { success: false, message: `Unknown upgrade ID: \`${upgradeId}\`.`, data: {} };

  const clamped = Math.max(0, Math.min(upgrade.maxLevel, level));
  await playerRepository.updatePlayer(serverId, player.discordId, {
    [`upgrades.${upgradeId}`]: clamped,
  });
  log(serverId, adminId, 'set_upgrade', player.discordId, { upgradeId, level: clamped });

  return {
    success: true,
    message: `⬆️ **${player.characterName ?? player.username}**'s **${upgrade.name}** set to level **${clamped}/${upgrade.maxLevel}**.`,
    data: { upgradeId, level: clamped },
  };
}

// ── Prestige ──────────────────────────────────

async function setPrestige(serverId, adminId, targetId, level) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const clamped = Math.max(0, Math.min(PRESTIGE_MAX, level));
  await playerRepository.updatePlayer(serverId, player.discordId, { prestige: clamped });
  log(serverId, adminId, 'set_prestige', player.discordId, { level: clamped });

  return {
    success: true,
    message: `⭐ **${player.characterName ?? player.username}**'s prestige set to **${clamped}**.`,
    data: { prestige: clamped },
  };
}

// ── Business ──────────────────────────────────

async function removeBusinessFromPlayer(serverId, adminId, targetId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  if (!player.businessId) return { success: false, message: `**${player.characterName ?? player.username}** does not own a business.`, data: {} };

  const oldId = player.businessId;
  await playerRepository.updatePlayer(serverId, player.discordId, { businessId: null });
  log(serverId, adminId, 'remove_business', player.discordId, { businessId: oldId });

  return {
    success: true,
    message: `🏢 Business (\`${oldId}\`) unlinked from **${player.characterName ?? player.username}**.`,
    data: { businessId: oldId },
  };
}

// ── Reset ─────────────────────────────────────

async function resetPlayer(serverId, adminId, targetId) {
  const { player, discordId, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const name = player.characterName ?? player.username;
  await playerRepository.deletePlayer(serverId, discordId);
  log(serverId, adminId, 'reset_player', discordId, { characterName: name });

  return {
    success: true,
    message: `💀 **${name}**'s character has been fully reset. They can use \`/start\` to create a new one.`,
    data: { discordId },
  };
}

// ── View player ───────────────────────────────

async function viewPlayer(serverId, targetId) {
  const { player, error } = await resolveTarget(serverId, targetId);
  if (error) return { success: false, message: error, data: {} };

  const rankName = RANKS[player.rankIndex ?? 0]?.name ?? 'Unknown';

  return {
    success: true,
    message: '',
    data: {
      player,
      rankName,
      jailed:       !!(player.jailedUntil && Date.now() < player.jailedUntil),
      hospitalized: !!(player.hospitalizedUntil && Date.now() < player.hospitalizedUntil),
      travelling:   !!(player.travelling && player.travelEndTime > Date.now()),
    },
  };
}

// ── Leaderboard ───────────────────────────────

const LEADERBOARD_CATEGORIES = {
  xp:              { label: 'XP',            field: 'xp' },
  cash:            { label: 'Cash on Hand',  field: 'cash' },
  bank:            { label: 'Bank Balance',  field: 'bank' },
  kills:           { label: 'Kills',         field: 'stats.kills' },
  deaths:          { label: 'Deaths',        field: 'stats.deaths' },
  crimes:          { label: 'Crimes Done',   field: 'stats.crimesSucceeded' },
  gta:             { label: 'GTA Steals',    field: 'stats.gtaSucceeded' },
  gamble_won:      { label: 'Games Won',     field: 'stats.gamesWon' },
  net_gambling:    { label: 'Gambling Net',  field: 'stats.netGambling' },
  cash_from_drugs: { label: 'Drug Profit',   field: 'stats.cashFromDrugs' },
  cash_from_booze: { label: 'Booze Profit',  field: 'stats.cashFromBooze' },
  oc_succeeded:    { label: 'OC Completed',  field: 'stats.ocSucceeded' },
  bullets:         { label: 'Bullets',       field: 'bullets' },
  prestige:        { label: 'Prestige',      field: 'prestige' },
};

async function getLeaderboard(serverId, category) {
  const cat = LEADERBOARD_CATEGORIES[category];
  if (!cat) return { success: false, message: `Unknown leaderboard category: \`${category}\`.`, data: {} };

  const players = await playerRepository.getLeaderboard(serverId, cat.field, 10);

  return {
    success: true,
    message: '',
    data: {
      category,
      label: cat.label,
      field: cat.field,
      players,
    },
  };
}

module.exports = {
  isAdmin,
  giveCash,
  giveBank,
  giveXP,
  setRank,
  giveBullets,
  jailPlayer,
  unjailPlayer,
  banPlayer,
  unbanPlayer,
  setHealth,
  revivePlayer,
  setBG,
  clearAllBGs,
  giveCar,
  takeCar,
  clearGarage,
  giveWeapon,
  giveArmour,
  setUpgrade,
  setPrestige,
  removeBusinessFromPlayer,
  resetPlayer,
  viewPlayer,
  getLeaderboard,
  LEADERBOARD_CATEGORIES,
};
