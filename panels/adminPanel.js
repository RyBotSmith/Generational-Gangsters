// ─────────────────────────────────────────────
//  panels/adminPanel.js  —  Routes ap2_* interactions.
//  Rule: NO game logic. NO direct DB calls.
//  Defer → call service → render → reply.
//
//  All actions are modal-driven:
//    ap2_modal_X        → button that opens a modal (no defer)
//    ap2_submit_X       → modal submission (deferUpdate first)
//    ap2_hub_X          → nav buttons (deferUpdate → render sub-hub)
//    ap2_select_leaderboard → select menu (deferUpdate → fetch → render)
// ─────────────────────────────────────────────

const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');

const adminService = require('../services/adminService');
const {
  renderAdminHub,
  renderEconomyHub,
  renderProgressionHub,
  renderCombatHub,
  renderModerationHub,
  renderInventoryHub,
  renderLeaderboardHub,
  renderViewPlayerHub,
  renderActionResult,
  renderPlayerSnapshot,
  renderLeaderboard,
} = require('./renderers/adminRenderer');

const ADMIN_ROLE_ID = '1515717429282471946';

// ── Auth guard ────────────────────────────────

function guardAdmin(interaction) {
  return interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID) ?? false;
}

// ── Modal builder helpers ─────────────────────

function field(customId, label, placeholder, required = true, long = false) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(long ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(required)
  );
}

function modal(customId, title, ...rows) {
  const m = new ModalBuilder().setCustomId(customId).setTitle(title);
  m.addComponents(...rows);
  return m;
}

function targetField() {
  return field('target', 'Player ID or @mention', '123456789012345678');
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;

  if (!guardAdmin(interaction)) {
    return interaction.reply({ content: '🚫 Admin access only.', ephemeral: true });
  }

  // ── Hub nav buttons ───────────────────────
  if (customId === 'ap2_hub_main') {
    await interaction.deferUpdate();
    return interaction.editReply(renderAdminHub());
  }
  if (customId === 'ap2_hub_economy') {
    await interaction.deferUpdate();
    return interaction.editReply(renderEconomyHub());
  }
  if (customId === 'ap2_hub_progression') {
    await interaction.deferUpdate();
    return interaction.editReply(renderProgressionHub());
  }
  if (customId === 'ap2_hub_combat') {
    await interaction.deferUpdate();
    return interaction.editReply(renderCombatHub());
  }
  if (customId === 'ap2_hub_moderation') {
    await interaction.deferUpdate();
    return interaction.editReply(renderModerationHub());
  }
  if (customId === 'ap2_hub_inventory') {
    await interaction.deferUpdate();
    return interaction.editReply(renderInventoryHub());
  }
  if (customId === 'ap2_hub_leaderboard') {
    await interaction.deferUpdate();
    return interaction.editReply(renderLeaderboardHub());
  }
  if (customId === 'ap2_hub_view') {
    await interaction.deferUpdate();
    return interaction.editReply(renderViewPlayerHub());
  }

  // ── Modal openers — NO defer before showModal ──

  if (customId === 'ap2_modal_give_cash') {
    return interaction.showModal(modal('ap2_submit_give_cash', 'Give / Take Cash',
      targetField(),
      field('amount', 'Amount (negative to remove)', '-50000 or 50000'),
    ));
  }
  if (customId === 'ap2_modal_give_bank') {
    return interaction.showModal(modal('ap2_submit_give_bank', 'Give / Take Bank Balance',
      targetField(),
      field('amount', 'Amount (negative to remove)', '-50000 or 50000'),
    ));
  }
  if (customId === 'ap2_modal_give_bullets') {
    return interaction.showModal(modal('ap2_submit_give_bullets', 'Give / Take Bullets',
      targetField(),
      field('amount', 'Amount (negative to remove)', '-500 or 500'),
    ));
  }
  if (customId === 'ap2_modal_give_xp') {
    return interaction.showModal(modal('ap2_submit_give_xp', 'Give / Take XP',
      targetField(),
      field('amount', 'Amount (negative to remove)', '-1000 or 5000'),
    ));
  }
  if (customId === 'ap2_modal_set_rank') {
    return interaction.showModal(modal('ap2_submit_set_rank', 'Set Player Rank',
      targetField(),
      field('rank_index', 'Rank Index (0–9)', '0 = Hobo, 9 = Infamous Gangster'),
    ));
  }
  if (customId === 'ap2_modal_set_prestige') {
    return interaction.showModal(modal('ap2_submit_set_prestige', 'Set Prestige',
      targetField(),
      field('prestige', 'Prestige Level (0–5)', '0–5'),
    ));
  }
  if (customId === 'ap2_modal_set_upgrade') {
    return interaction.showModal(modal('ap2_submit_set_upgrade', 'Set Upgrade Level',
      targetField(),
      field('upgrade_id', 'Upgrade ID', 'bank_vault / booze_capacity / drug_capacity / garage_size / crime_cooldown / gta_cooldown'),
      field('level', 'Level (0 = remove)', '0–10'),
    ));
  }
  if (customId === 'ap2_modal_set_health') {
    return interaction.showModal(modal('ap2_submit_set_health', 'Set Player Health',
      targetField(),
      field('hp', 'HP (0–100)', '100'),
    ));
  }
  if (customId === 'ap2_modal_revive') {
    return interaction.showModal(modal('ap2_submit_revive', 'Revive Player',
      targetField(),
    ));
  }
  if (customId === 'ap2_modal_set_bg') {
    return interaction.showModal(modal('ap2_submit_set_bg', 'Set Bodyguard Slot',
      targetField(),
      field('slot', 'Slot (1–4)', '4'),
      field('alive', 'Alive? (yes / no)', 'yes'),
    ));
  }
  if (customId === 'ap2_modal_clear_bgs') {
    return interaction.showModal(modal('ap2_submit_clear_bgs', 'Clear All Bodyguards',
      targetField(),
    ));
  }
  if (customId === 'ap2_modal_jail') {
    return interaction.showModal(modal('ap2_submit_jail', 'Jail Player',
      targetField(),
      field('seconds', 'Duration (seconds)', '300'),
    ));
  }
  if (customId === 'ap2_modal_unjail') {
    return interaction.showModal(modal('ap2_submit_unjail', 'Unjail Player',
      targetField(),
    ));
  }
  if (customId === 'ap2_modal_ban') {
    return interaction.showModal(modal('ap2_submit_ban', 'Ban Player',
      targetField(),
      field('reason', 'Reason', 'Breaking game rules', false),
    ));
  }
  if (customId === 'ap2_modal_unban') {
    return interaction.showModal(modal('ap2_submit_unban', 'Unban Player',
      targetField(),
    ));
  }
  if (customId === 'ap2_modal_reset') {
    return interaction.showModal(modal('ap2_submit_reset', 'Reset Player (DESTRUCTIVE)',
      targetField(),
      field('confirm', 'Type CONFIRM to proceed', 'CONFIRM'),
    ));
  }
  if (customId === 'ap2_modal_remove_business') {
    return interaction.showModal(modal('ap2_submit_remove_business', 'Remove Business',
      targetField(),
    ));
  }
  if (customId === 'ap2_modal_give_weapon') {
    return interaction.showModal(modal('ap2_submit_give_weapon', 'Give Weapon',
      targetField(),
      field('weapon_id', 'Weapon ID', 'flip_knife / pistol / uzi / ak47 / l115 etc.'),
    ));
  }
  if (customId === 'ap2_modal_give_armour') {
    return interaction.showModal(modal('ap2_submit_give_armour', 'Give Armour / Headwear',
      targetField(),
      field('armour_id', 'Armour ID', 'leather_jacket / vest / mil_vest / helmet etc.'),
    ));
  }
  if (customId === 'ap2_modal_give_car') {
    return interaction.showModal(modal('ap2_submit_give_car', 'Give Car to Garage',
      targetField(),
      field('car_id', 'Car ID', 'civic / lambo / bugatti / prototype etc.'),
    ));
  }
  if (customId === 'ap2_modal_take_car') {
    return interaction.showModal(modal('ap2_submit_take_car', 'Remove Car from Garage',
      targetField(),
      field('car_id', 'Car ID', 'civic / lambo / bugatti etc.'),
    ));
  }
  if (customId === 'ap2_modal_clear_garage') {
    return interaction.showModal(modal('ap2_submit_clear_garage', 'Clear Entire Garage',
      targetField(),
    ));
  }
  if (customId === 'ap2_modal_view_player') {
    return interaction.showModal(modal('ap2_submit_view_player', 'View Player',
      targetField(),
    ));
  }

  console.warn('[adminPanel] Unhandled button:', customId);
}

// ── Modal submissions ─────────────────────────

async function handleModal(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const adminId   = interaction.user.id;

  if (!guardAdmin(interaction)) {
    return interaction.reply({ content: '🚫 Admin access only.', ephemeral: true });
  }

  await interaction.deferUpdate();

  const g = (key) => interaction.fields.getTextInputValue(key).trim();

  // ── Economy ──────────────────────────────

  if (customId === 'ap2_submit_give_cash') {
    const result = await adminService.giveCash(serverId, adminId, g('target'), parseFloat(g('amount')));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_economy'));
  }
  if (customId === 'ap2_submit_give_bank') {
    const result = await adminService.giveBank(serverId, adminId, g('target'), parseFloat(g('amount')));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_economy'));
  }
  if (customId === 'ap2_submit_give_bullets') {
    const result = await adminService.giveBullets(serverId, adminId, g('target'), parseInt(g('amount'), 10));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_economy'));
  }

  // ── Progression ──────────────────────────

  if (customId === 'ap2_submit_give_xp') {
    const result = await adminService.giveXP(serverId, adminId, g('target'), parseInt(g('amount'), 10));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_progression'));
  }
  if (customId === 'ap2_submit_set_rank') {
    const result = await adminService.setRank(serverId, adminId, g('target'), parseInt(g('rank_index'), 10));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_progression'));
  }
  if (customId === 'ap2_submit_set_prestige') {
    const result = await adminService.setPrestige(serverId, adminId, g('target'), parseInt(g('prestige'), 10));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_progression'));
  }
  if (customId === 'ap2_submit_set_upgrade') {
    const result = await adminService.setUpgrade(serverId, adminId, g('target'), g('upgrade_id'), parseInt(g('level'), 10));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_progression'));
  }

  // ── Combat ───────────────────────────────

  if (customId === 'ap2_submit_set_health') {
    const result = await adminService.setHealth(serverId, adminId, g('target'), parseInt(g('hp'), 10));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_combat'));
  }
  if (customId === 'ap2_submit_revive') {
    const result = await adminService.revivePlayer(serverId, adminId, g('target'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_combat'));
  }
  if (customId === 'ap2_submit_set_bg') {
    const alive  = g('alive').toLowerCase().startsWith('y');
    const result = await adminService.setBG(serverId, adminId, g('target'), parseInt(g('slot'), 10), alive);
    return interaction.editReply(renderActionResult(result, 'ap2_hub_combat'));
  }
  if (customId === 'ap2_submit_clear_bgs') {
    const result = await adminService.clearAllBGs(serverId, adminId, g('target'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_combat'));
  }

  // ── Moderation ───────────────────────────

  if (customId === 'ap2_submit_jail') {
    const result = await adminService.jailPlayer(serverId, adminId, g('target'), parseInt(g('seconds'), 10));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_moderation'));
  }
  if (customId === 'ap2_submit_unjail') {
    const result = await adminService.unjailPlayer(serverId, adminId, g('target'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_moderation'));
  }
  if (customId === 'ap2_submit_ban') {
    const result = await adminService.banPlayer(serverId, adminId, g('target'), g('reason'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_moderation'));
  }
  if (customId === 'ap2_submit_unban') {
    const result = await adminService.unbanPlayer(serverId, adminId, g('target'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_moderation'));
  }
  if (customId === 'ap2_submit_reset') {
    if (g('confirm') !== 'CONFIRM') {
      return interaction.editReply(renderActionResult(
        { success: false, message: 'Reset cancelled — you must type CONFIRM exactly.' },
        'ap2_hub_moderation'
      ));
    }
    const result = await adminService.resetPlayer(serverId, adminId, g('target'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_moderation'));
  }
  if (customId === 'ap2_submit_remove_business') {
    const result = await adminService.removeBusinessFromPlayer(serverId, adminId, g('target'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_moderation'));
  }

  // ── Inventory ────────────────────────────

  if (customId === 'ap2_submit_give_weapon') {
    const result = await adminService.giveWeapon(serverId, adminId, g('target'), g('weapon_id'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_inventory'));
  }
  if (customId === 'ap2_submit_give_armour') {
    const result = await adminService.giveArmour(serverId, adminId, g('target'), g('armour_id'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_inventory'));
  }
  if (customId === 'ap2_submit_give_car') {
    const result = await adminService.giveCar(serverId, adminId, g('target'), g('car_id'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_inventory'));
  }
  if (customId === 'ap2_submit_take_car') {
    const result = await adminService.takeCar(serverId, adminId, g('target'), g('car_id'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_inventory'));
  }
  if (customId === 'ap2_submit_clear_garage') {
    const result = await adminService.clearGarage(serverId, adminId, g('target'));
    return interaction.editReply(renderActionResult(result, 'ap2_hub_inventory'));
  }

  // ── View player ──────────────────────────

  if (customId === 'ap2_submit_view_player') {
    const result = await adminService.viewPlayer(serverId, g('target'));
    return interaction.editReply(renderPlayerSnapshot(result));
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

  if (customId === 'ap2_select_leaderboard') {
    const category = interaction.values[0];
    await interaction.deferUpdate();
    const result = await adminService.getLeaderboard(serverId, category);
    return interaction.editReply(renderLeaderboard(result));
  }

  console.warn('[adminPanel] Unexpected select:', customId);
}

module.exports = { handle, handleModal, handleSelect };
