// ─────────────────────────────────────────────
//  panels/adminPanel.js  —  Routes ap2_* interactions.
//  Rule: NO game logic. NO direct DB calls.
//
//  Flow:
//    /gadmin                     → fetch all players → renderPlayerSelect
//    ap2_select_player           → select menu → fetch chosen player → renderPlayerHub
//    ap2_player_{id}             → button → fetch player → renderPlayerHub
//    ap2_back_players            → button → fetch all players → renderPlayerSelect
//    ap2_hub_{category}_{id}     → button → renderCategoryHub(id)
//    ap2_modal_{action}_{id}     → button → showModal (no defer, id baked in title)
//    ap2_submit_{action}_{id}    → modal submit → service call → renderActionResult
//    ap2_hub_leaderboard         → button → renderLeaderboardHub
//    ap2_select_leaderboard      → select → fetch → renderLeaderboard
//    ap2_hub_view_{id}           → button → viewPlayer → renderPlayerSnapshot
// ─────────────────────────────────────────────

const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');

const adminService     = require('../services/adminService');
const playerRepository = require('../repositories/playerRepository');
const { RANKS }        = require('../data/constants');
const {
  renderPlayerSelect,
  renderPlayerHub,
  renderEconomyHub,
  renderProgressionHub,
  renderCombatHub,
  renderModerationHub,
  renderInventoryHub,
  renderLeaderboardHub,
  renderLeaderboard,
  renderPlayerSnapshot,
  renderActionResult,
} = require('./renderers/adminRenderer');

const ADMIN_ROLE_ID = '1515717429282471946';

// ── Auth guard ────────────────────────────────

function guardAdmin(interaction) {
  return interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID) ?? false;
}

// ── Helpers ───────────────────────────────────

function field(customId, label, placeholder, required = true) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(TextInputStyle.Short)
      .setRequired(required)
  );
}

function modal(customId, title, ...rows) {
  const m = new ModalBuilder().setCustomId(customId).setTitle(title);
  m.addComponents(...rows);
  return m;
}

// Extract target ID from the tail of a customId like ap2_modal_give_cash_123456789
function extractId(customId, prefix) {
  return customId.slice(prefix.length);
}

async function fetchHub(serverId, discordId) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return null;
  const rankName = RANKS[player.rankIndex ?? 0]?.name ?? 'Unknown';
  return { player, rankName };
}

async function fetchAllSorted(serverId) {
  const all = await playerRepository.getAllPlayers(serverId);
  return all
    .filter(p => p.characterName || p.username)
    .sort((a, b) => (a.characterName ?? a.username ?? '').localeCompare(b.characterName ?? b.username ?? ''));
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId = interaction.guildId;

  if (!guardAdmin(interaction)) {
    return interaction.reply({ content: '🚫 Admin access only.', ephemeral: true });
  }

  // ── Player select screen (back button or re-open) ──
  if (customId === 'ap2_back_players') {
    await interaction.deferUpdate();
    const players = await fetchAllSorted(serverId);
    return interaction.editReply(renderPlayerSelect(players));
  }

  // ── ap2_player_{id} — go to a player's hub ───
  if (customId.startsWith('ap2_player_')) {
    const targetId = extractId(customId, 'ap2_player_');
    await interaction.deferUpdate();
    const hub = await fetchHub(serverId, targetId);
    if (!hub) return interaction.editReply(renderActionResult(
      { success: false, message: 'Player not found.' }, 'ap2_back_players'
    ));
    return interaction.editReply(renderPlayerHub(hub.player, hub.rankName));
  }

  // ── Category hubs — ap2_hub_{category}_{id} ──
  if (customId.startsWith('ap2_hub_economy_')) {
    await interaction.deferUpdate();
    return interaction.editReply(renderEconomyHub(extractId(customId, 'ap2_hub_economy_')));
  }
  if (customId.startsWith('ap2_hub_progression_')) {
    await interaction.deferUpdate();
    return interaction.editReply(renderProgressionHub(extractId(customId, 'ap2_hub_progression_')));
  }
  if (customId.startsWith('ap2_hub_combat_')) {
    await interaction.deferUpdate();
    return interaction.editReply(renderCombatHub(extractId(customId, 'ap2_hub_combat_')));
  }
  if (customId.startsWith('ap2_hub_moderation_')) {
    await interaction.deferUpdate();
    return interaction.editReply(renderModerationHub(extractId(customId, 'ap2_hub_moderation_')));
  }
  if (customId.startsWith('ap2_hub_inventory_')) {
    await interaction.deferUpdate();
    return interaction.editReply(renderInventoryHub(extractId(customId, 'ap2_hub_inventory_')));
  }
  if (customId.startsWith('ap2_hub_view_')) {
    const targetId = extractId(customId, 'ap2_hub_view_');
    await interaction.deferUpdate();
    const result = await adminService.viewPlayer(serverId, targetId);
    return interaction.editReply(renderPlayerSnapshot(result, targetId));
  }

  // ── Leaderboard hub (no player context) ──────
  if (customId === 'ap2_hub_leaderboard') {
    await interaction.deferUpdate();
    return interaction.editReply(renderLeaderboardHub());
  }

  // ── Modal openers — NO defer before showModal ──
  // Economy
  if (customId.startsWith('ap2_modal_give_cash_')) {
    const id = extractId(customId, 'ap2_modal_give_cash_');
    return interaction.showModal(modal(`ap2_submit_give_cash_${id}`, 'Give / Take Cash',
      field('amount', 'Amount (negative to remove)', '-50000 or 50000'),
    ));
  }
  if (customId.startsWith('ap2_modal_give_bank_')) {
    const id = extractId(customId, 'ap2_modal_give_bank_');
    return interaction.showModal(modal(`ap2_submit_give_bank_${id}`, 'Give / Take Bank',
      field('amount', 'Amount (negative to remove)', '-50000 or 50000'),
    ));
  }
  if (customId.startsWith('ap2_modal_give_bullets_')) {
    const id = extractId(customId, 'ap2_modal_give_bullets_');
    return interaction.showModal(modal(`ap2_submit_give_bullets_${id}`, 'Give / Take Bullets',
      field('amount', 'Amount (negative to remove)', '-500 or 500'),
    ));
  }
  // Progression
  if (customId.startsWith('ap2_modal_give_xp_')) {
    const id = extractId(customId, 'ap2_modal_give_xp_');
    return interaction.showModal(modal(`ap2_submit_give_xp_${id}`, 'Give / Take XP',
      field('amount', 'Amount (negative to remove)', '-1000 or 5000'),
    ));
  }
  if (customId.startsWith('ap2_modal_set_rank_')) {
    const id = extractId(customId, 'ap2_modal_set_rank_');
    return interaction.showModal(modal(`ap2_submit_set_rank_${id}`, 'Set Player Rank',
      field('rank_index', 'Rank Index (0–9)', '0 = Hobo · 9 = Infamous Gangster'),
    ));
  }
  if (customId.startsWith('ap2_modal_set_prestige_')) {
    const id = extractId(customId, 'ap2_modal_set_prestige_');
    return interaction.showModal(modal(`ap2_submit_set_prestige_${id}`, 'Set Prestige',
      field('prestige', 'Prestige Level (0–5)', '0–5'),
    ));
  }
  if (customId.startsWith('ap2_modal_set_upgrade_')) {
    const id = extractId(customId, 'ap2_modal_set_upgrade_');
    return interaction.showModal(modal(`ap2_submit_set_upgrade_${id}`, 'Set Upgrade Level',
      field('upgrade_id', 'Upgrade ID', 'bank_vault / booze_capacity / drug_capacity / garage_size / crime_cooldown / gta_cooldown'),
      field('level', 'Level (0 = remove)', '0–10'),
    ));
  }
  // Combat
  if (customId.startsWith('ap2_modal_set_health_')) {
    const id = extractId(customId, 'ap2_modal_set_health_');
    return interaction.showModal(modal(`ap2_submit_set_health_${id}`, 'Set Player Health',
      field('hp', 'HP (0–100)', '100'),
    ));
  }
  if (customId.startsWith('ap2_modal_revive_')) {
    const id = extractId(customId, 'ap2_modal_revive_');
    return interaction.showModal(modal(`ap2_submit_revive_${id}`, 'Revive Player — Confirm',
      field('confirm', 'Type YES to confirm', 'YES'),
    ));
  }
  if (customId.startsWith('ap2_modal_set_bg_')) {
    const id = extractId(customId, 'ap2_modal_set_bg_');
    return interaction.showModal(modal(`ap2_submit_set_bg_${id}`, 'Set Bodyguard Slot',
      field('slot', 'Slot (1–4)', '4'),
      field('alive', 'Alive? (yes / no)', 'yes'),
    ));
  }
  if (customId.startsWith('ap2_modal_clear_bgs_')) {
    const id = extractId(customId, 'ap2_modal_clear_bgs_');
    return interaction.showModal(modal(`ap2_submit_clear_bgs_${id}`, 'Clear All BGs — Confirm',
      field('confirm', 'Type YES to confirm', 'YES'),
    ));
  }
  // Moderation
  if (customId.startsWith('ap2_modal_jail_')) {
    const id = extractId(customId, 'ap2_modal_jail_');
    return interaction.showModal(modal(`ap2_submit_jail_${id}`, 'Jail Player',
      field('seconds', 'Duration (seconds)', '300'),
    ));
  }
  if (customId.startsWith('ap2_modal_unjail_')) {
    const id = extractId(customId, 'ap2_modal_unjail_');
    return interaction.showModal(modal(`ap2_submit_unjail_${id}`, 'Unjail Player — Confirm',
      field('confirm', 'Type YES to confirm', 'YES'),
    ));
  }
  if (customId.startsWith('ap2_modal_ban_')) {
    const id = extractId(customId, 'ap2_modal_ban_');
    return interaction.showModal(modal(`ap2_submit_ban_${id}`, 'Ban Player',
      field('reason', 'Reason', 'Breaking game rules', false),
    ));
  }
  if (customId.startsWith('ap2_modal_unban_')) {
    const id = extractId(customId, 'ap2_modal_unban_');
    return interaction.showModal(modal(`ap2_submit_unban_${id}`, 'Unban Player — Confirm',
      field('confirm', 'Type YES to confirm', 'YES'),
    ));
  }
  if (customId.startsWith('ap2_modal_reset_')) {
    const id = extractId(customId, 'ap2_modal_reset_');
    return interaction.showModal(modal(`ap2_submit_reset_${id}`, 'Reset Player (DESTRUCTIVE)',
      field('confirm', 'Type CONFIRM to proceed', 'CONFIRM'),
    ));
  }
  if (customId.startsWith('ap2_modal_remove_business_')) {
    const id = extractId(customId, 'ap2_modal_remove_business_');
    return interaction.showModal(modal(`ap2_submit_remove_business_${id}`, 'Remove Business — Confirm',
      field('confirm', 'Type YES to confirm', 'YES'),
    ));
  }
  // Inventory
  if (customId.startsWith('ap2_modal_give_weapon_')) {
    const id = extractId(customId, 'ap2_modal_give_weapon_');
    return interaction.showModal(modal(`ap2_submit_give_weapon_${id}`, 'Give Weapon',
      field('weapon_id', 'Weapon ID', 'flip_knife / pistol / uzi / ak47 / l115'),
    ));
  }
  if (customId.startsWith('ap2_modal_give_armour_')) {
    const id = extractId(customId, 'ap2_modal_give_armour_');
    return interaction.showModal(modal(`ap2_submit_give_armour_${id}`, 'Give Armour / Headwear',
      field('armour_id', 'Armour ID', 'leather_jacket / vest / mil_vest / helmet'),
    ));
  }
  if (customId.startsWith('ap2_modal_give_car_')) {
    const id = extractId(customId, 'ap2_modal_give_car_');
    return interaction.showModal(modal(`ap2_submit_give_car_${id}`, 'Give Car',
      field('car_id', 'Car ID', 'civic / lambo / bugatti / prototype'),
    ));
  }
  if (customId.startsWith('ap2_modal_take_car_')) {
    const id = extractId(customId, 'ap2_modal_take_car_');
    return interaction.showModal(modal(`ap2_submit_take_car_${id}`, 'Remove Car from Garage',
      field('car_id', 'Car ID', 'civic / lambo / bugatti'),
    ));
  }
  if (customId.startsWith('ap2_modal_clear_garage_')) {
    const id = extractId(customId, 'ap2_modal_clear_garage_');
    return interaction.showModal(modal(`ap2_submit_clear_garage_${id}`, 'Clear Entire Garage — Confirm',
      field('confirm', 'Type YES to confirm', 'YES'),
    ));
  }

  console.warn('[adminPanel] Unhandled button:', customId);
}

// ── Modal submissions ─────────────────────────

async function handleModal(interaction) {
  const { customId } = interaction;
  const serverId = interaction.guildId;
  const adminId  = interaction.user.id;

  if (!guardAdmin(interaction)) {
    return interaction.reply({ content: '🚫 Admin access only.', ephemeral: true });
  }

  await interaction.deferUpdate();

  const g = (key) => interaction.fields.getTextInputValue(key).trim();

  // Helper: extract id from submit customId like ap2_submit_give_cash_123456789
  function sid(prefix) { return extractId(customId, prefix); }
  function backTo(id)   { return `ap2_player_${id}`; }

  // ── Economy ──────────────────────────────
  if (customId.startsWith('ap2_submit_give_cash_')) {
    const id = sid('ap2_submit_give_cash_');
    const result = await adminService.giveCash(serverId, adminId, id, parseFloat(g('amount')));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_give_bank_')) {
    const id = sid('ap2_submit_give_bank_');
    const result = await adminService.giveBank(serverId, adminId, id, parseFloat(g('amount')));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_give_bullets_')) {
    const id = sid('ap2_submit_give_bullets_');
    const result = await adminService.giveBullets(serverId, adminId, id, parseInt(g('amount'), 10));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }

  // ── Progression ──────────────────────────
  if (customId.startsWith('ap2_submit_give_xp_')) {
    const id = sid('ap2_submit_give_xp_');
    const result = await adminService.giveXP(serverId, adminId, id, parseInt(g('amount'), 10));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_set_rank_')) {
    const id = sid('ap2_submit_set_rank_');
    const result = await adminService.setRank(serverId, adminId, id, parseInt(g('rank_index'), 10));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_set_prestige_')) {
    const id = sid('ap2_submit_set_prestige_');
    const result = await adminService.setPrestige(serverId, adminId, id, parseInt(g('prestige'), 10));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_set_upgrade_')) {
    const id = sid('ap2_submit_set_upgrade_');
    const result = await adminService.setUpgrade(serverId, adminId, id, g('upgrade_id'), parseInt(g('level'), 10));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }

  // ── Combat ───────────────────────────────
  if (customId.startsWith('ap2_submit_set_health_')) {
    const id = sid('ap2_submit_set_health_');
    const result = await adminService.setHealth(serverId, adminId, id, parseInt(g('hp'), 10));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_revive_')) {
    const id = sid('ap2_submit_revive_');
    if (g('confirm').toUpperCase() !== 'YES') return interaction.editReply(renderActionResult({ success: false, message: 'Cancelled.' }, backTo(id)));
    const result = await adminService.revivePlayer(serverId, adminId, id);
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_set_bg_')) {
    const id = sid('ap2_submit_set_bg_');
    const alive = g('alive').toLowerCase().startsWith('y');
    const result = await adminService.setBG(serverId, adminId, id, parseInt(g('slot'), 10), alive);
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_clear_bgs_')) {
    const id = sid('ap2_submit_clear_bgs_');
    if (g('confirm').toUpperCase() !== 'YES') return interaction.editReply(renderActionResult({ success: false, message: 'Cancelled.' }, backTo(id)));
    const result = await adminService.clearAllBGs(serverId, adminId, id);
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }

  // ── Moderation ───────────────────────────
  if (customId.startsWith('ap2_submit_jail_')) {
    const id = sid('ap2_submit_jail_');
    const result = await adminService.jailPlayer(serverId, adminId, id, parseInt(g('seconds'), 10));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_unjail_')) {
    const id = sid('ap2_submit_unjail_');
    if (g('confirm').toUpperCase() !== 'YES') return interaction.editReply(renderActionResult({ success: false, message: 'Cancelled.' }, backTo(id)));
    const result = await adminService.unjailPlayer(serverId, adminId, id);
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_ban_')) {
    const id = sid('ap2_submit_ban_');
    const result = await adminService.banPlayer(serverId, adminId, id, g('reason'));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_unban_')) {
    const id = sid('ap2_submit_unban_');
    if (g('confirm').toUpperCase() !== 'YES') return interaction.editReply(renderActionResult({ success: false, message: 'Cancelled.' }, backTo(id)));
    const result = await adminService.unbanPlayer(serverId, adminId, id);
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_reset_')) {
    const id = sid('ap2_submit_reset_');
    if (g('confirm') !== 'CONFIRM') return interaction.editReply(renderActionResult({ success: false, message: 'Reset cancelled — type CONFIRM exactly.' }, backTo(id)));
    const result = await adminService.resetPlayer(serverId, adminId, id);
    // After reset, go back to player list since the player doc is gone
    return interaction.editReply(renderActionResult(result, 'ap2_back_players'));
  }
  if (customId.startsWith('ap2_submit_remove_business_')) {
    const id = sid('ap2_submit_remove_business_');
    if (g('confirm').toUpperCase() !== 'YES') return interaction.editReply(renderActionResult({ success: false, message: 'Cancelled.' }, backTo(id)));
    const result = await adminService.removeBusinessFromPlayer(serverId, adminId, id);
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }

  // ── Inventory ────────────────────────────
  if (customId.startsWith('ap2_submit_give_weapon_')) {
    const id = sid('ap2_submit_give_weapon_');
    const result = await adminService.giveWeapon(serverId, adminId, id, g('weapon_id'));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_give_armour_')) {
    const id = sid('ap2_submit_give_armour_');
    const result = await adminService.giveArmour(serverId, adminId, id, g('armour_id'));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_give_car_')) {
    const id = sid('ap2_submit_give_car_');
    const result = await adminService.giveCar(serverId, adminId, id, g('car_id'));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_take_car_')) {
    const id = sid('ap2_submit_take_car_');
    const result = await adminService.takeCar(serverId, adminId, id, g('car_id'));
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }
  if (customId.startsWith('ap2_submit_clear_garage_')) {
    const id = sid('ap2_submit_clear_garage_');
    if (g('confirm').toUpperCase() !== 'YES') return interaction.editReply(renderActionResult({ success: false, message: 'Cancelled.' }, backTo(id)));
    const result = await adminService.clearGarage(serverId, adminId, id);
    return interaction.editReply(renderActionResult(result, backTo(id)));
  }

  console.warn('[adminPanel] Unhandled modal:', customId);
}

// ── Select menus ──────────────────────────────

async function handleSelect(interaction) {
  const { customId } = interaction;
  const serverId = interaction.guildId;

  if (!guardAdmin(interaction)) {
    return interaction.reply({ content: '🚫 Admin access only.', ephemeral: true });
  }

  // ── Player selected from dropdown ─────────
  if (customId === 'ap2_select_player') {
    const targetId = interaction.values[0];
    if (targetId === 'none') return interaction.deferUpdate();
    await interaction.deferUpdate();
    const hub = await fetchHub(serverId, targetId);
    if (!hub) return interaction.editReply(renderActionResult(
      { success: false, message: 'Player not found.' }, 'ap2_back_players'
    ));
    return interaction.editReply(renderPlayerHub(hub.player, hub.rankName));
  }

  // ── Leaderboard category selected ─────────
  if (customId === 'ap2_select_leaderboard') {
    const category = interaction.values[0];
    await interaction.deferUpdate();
    const result = await adminService.getLeaderboard(serverId, category);
    return interaction.editReply(renderLeaderboard(result));
  }

  console.warn('[adminPanel] Unexpected select:', customId);
}

module.exports = { handle, handleModal, handleSelect };
