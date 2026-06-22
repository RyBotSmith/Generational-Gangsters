// ─────────────────────────────────────────────
//  panels/renderers/adminRenderer.js
//  Rule: No game logic. No DB access. Embeds + components only.
// ─────────────────────────────────────────────

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, EmbedBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');
const { RANKS, CARS, WEAPONS, ARMOUR, UPGRADES, LEADERBOARD_CATEGORIES } = require('../../data/constants');
const { LEADERBOARD_CATEGORIES: LB_CATS } = require('../../services/adminService');

// ── Colour palette ────────────────────────────
const ADMIN_COLOUR  = 0xE74C3C; // red
const LB_COLOUR     = 0xF1C40F; // gold

// ── Hub ───────────────────────────────────────

function renderAdminHub() {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('⚙️ Admin Panel')
    .setDescription(
      'Select a category below to manage players or view leaderboards.\n\n' +
      '**Categories:**\n' +
      '• 💰 **Economy** — cash, bank, bullets\n' +
      '• ⬆️ **Progression** — XP, rank, prestige\n' +
      '• ⚔️ **Combat** — health, revive, bodyguards\n' +
      '• 🔒 **Moderation** — jail, ban, reset\n' +
      '• 🎒 **Inventory** — weapons, armour, cars, upgrades\n' +
      '• 🏆 **Leaderboard** — top 10 by category\n' +
      '• 🔍 **View Player** — full profile snapshot'
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap2_hub_economy').setLabel('💰 Economy').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_hub_progression').setLabel('⬆️ Progression').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_hub_combat').setLabel('⚔️ Combat').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ap2_hub_moderation').setLabel('🔒 Moderation').setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap2_hub_inventory').setLabel('🎒 Inventory').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ap2_hub_leaderboard').setLabel('🏆 Leaderboard').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ap2_hub_view').setLabel('🔍 View Player').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Category sub-hubs ─────────────────────────

function renderEconomyHub() {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('💰 Economy Controls')
    .setDescription('Modify a player\'s cash, bank balance, or bullets.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap2_modal_give_cash').setLabel('Give/Take Cash').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_modal_give_bank').setLabel('Give/Take Bank').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_modal_give_bullets').setLabel('Give/Take Bullets').setStyle(ButtonStyle.Primary),
  );
  const back = _backRow('ap2_hub_main');
  return { embeds: [embed], components: [row, back] };
}

function renderProgressionHub() {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('⬆️ Progression Controls')
    .setDescription('Modify XP, rank, prestige, or upgrades.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap2_modal_give_xp').setLabel('Give/Take XP').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_modal_set_rank').setLabel('Set Rank').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_modal_set_prestige').setLabel('Set Prestige').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_modal_set_upgrade').setLabel('Set Upgrade Level').setStyle(ButtonStyle.Secondary),
  );
  const back = _backRow('ap2_hub_main');
  return { embeds: [embed], components: [row, back] };
}

function renderCombatHub() {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('⚔️ Combat Controls')
    .setDescription('Set health, revive players, or manage bodyguards.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap2_modal_set_health').setLabel('Set Health').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_modal_revive').setLabel('Revive Player').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ap2_modal_set_bg').setLabel('Set BG Slot').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ap2_modal_clear_bgs').setLabel('Clear All BGs').setStyle(ButtonStyle.Danger),
  );
  const back = _backRow('ap2_hub_main');
  return { embeds: [embed], components: [row, back] };
}

function renderModerationHub() {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('🔒 Moderation Controls')
    .setDescription('Jail, ban, or fully reset a player.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap2_modal_jail').setLabel('Jail').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ap2_modal_unjail').setLabel('Unjail').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ap2_modal_ban').setLabel('Ban').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ap2_modal_unban').setLabel('Unban').setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap2_modal_reset').setLabel('⚠️ Reset Player').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ap2_modal_remove_business').setLabel('Remove Business').setStyle(ButtonStyle.Secondary),
  );
  const back = _backRow('ap2_hub_main');
  return { embeds: [embed], components: [row, row2, back] };
}

function renderInventoryHub() {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('🎒 Inventory Controls')
    .setDescription('Give or remove weapons, armour, and cars.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap2_modal_give_weapon').setLabel('Give Weapon').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_modal_give_armour').setLabel('Give Armour').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_modal_give_car').setLabel('Give Car').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap2_modal_take_car').setLabel('Take Car').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ap2_modal_clear_garage').setLabel('Clear Garage').setStyle(ButtonStyle.Danger),
  );
  const back = _backRow('ap2_hub_main');
  return { embeds: [embed], components: [row, back] };
}

function renderLeaderboardHub() {
  const embed = new EmbedBuilder()
    .setColor(LB_COLOUR)
    .setTitle('🏆 Leaderboards')
    .setDescription('Select a category to view the top 10 players.');

  const options = Object.entries(LB_CATS).map(([id, cat]) => ({
    label: cat.label,
    value: id,
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ap2_select_leaderboard')
      .setPlaceholder('Choose a leaderboard...')
      .addOptions(options)
  );
  const back = _backRow('ap2_hub_main');
  return { embeds: [embed], components: [row, back] };
}

function renderViewPlayerHub() {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('🔍 View Player')
    .setDescription('Enter a player Discord ID or @mention to see their full profile snapshot.');

  const back = _backRow('ap2_hub_main');
  const row  = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap2_modal_view_player').setLabel('🔍 Lookup Player').setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row, back] };
}

// ── Action result ─────────────────────────────

function renderActionResult(result, backTo = 'ap2_hub_main') {
  const embed = result.success
    ? new EmbedBuilder().setColor(0x2ECC71).setDescription(result.message)
    : new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ ${result.message}`);

  const back = _backRow(backTo);
  return { embeds: [embed], components: [back] };
}

// ── View player snapshot ──────────────────────

function renderPlayerSnapshot(result) {
  if (!result.success) return renderActionResult(result, 'ap2_hub_view');

  const { player, rankName, jailed, hospitalized, travelling } = result.data;
  const p = player;

  const statusFlags = [];
  if (jailed)       statusFlags.push('🔒 Jailed');
  if (hospitalized) statusFlags.push('🏥 Hospitalized');
  if (travelling)   statusFlags.push('✈️ Travelling');
  if (p.banned)     statusFlags.push('🚫 Banned');
  if (!p.alive)     statusFlags.push('💀 Dead');

  const bgAlive = [1,2,3,4].filter(s => p.bodyguards?.[s]?.alive).map(s => `Slot ${s}`).join(', ') || 'None';

  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle(`🔍 ${p.characterName ?? p.username}`)
    .setDescription(statusFlags.length ? statusFlags.join(' · ') : '✅ Active')
    .addFields(
      { name: 'Identity',    value: `ID: \`${p.discordId}\`\nUsername: ${p.username}\nSex: ${p.sex ?? 'N/A'}`, inline: true },
      { name: 'Progression', value: `XP: **${(p.xp ?? 0).toLocaleString()}**\nRank: **${rankName}**\nPrestige: **${p.prestige ?? 0}**`, inline: true },
      { name: 'Economy',     value: `Cash: **${formatCash(p.cash ?? 0)}**\nBank: **${formatCash(p.bank ?? 0)}**\nBullets: **${(p.bullets ?? 0).toLocaleString()}**`, inline: true },
      { name: 'Combat',      value: `Health: **${p.health ?? 0}/100**\nKills: **${p.stats?.kills ?? 0}** / Deaths: **${p.stats?.deaths ?? 0}**\nBGs alive: **${bgAlive}**`, inline: true },
      { name: 'Location',    value: `State: **${p.state}**\nJailed until: ${p.jailedUntil ? `<t:${Math.floor(p.jailedUntil/1000)}:R>` : 'N/A'}`, inline: true },
      { name: 'Inventory',   value: `Weapon: **${p.inventory?.equippedWeapon?.id ?? 'None'}**\nArmour: **${p.inventory?.equippedArmour?.id ?? 'None'}**\nGarage: **${(p.inventory?.garage ?? []).length} cars**`, inline: true },
    );

  const back = _backRow('ap2_hub_view');
  return { embeds: [embed], components: [back] };
}

// ── Leaderboard result ────────────────────────

function renderLeaderboard(result) {
  if (!result.success) return renderActionResult(result, 'ap2_hub_leaderboard');

  const { label, players } = result.data;

  const lines = players.map((p, i) => {
    const name  = p.characterName ?? p.username ?? 'Unknown';
    const field = result.data.field;
    // Navigate nested field path for display
    const parts = field.split('.');
    let val = p;
    for (const part of parts) val = val?.[part];
    const display = typeof val === 'number'
      ? (field.includes('cash') || field.includes('bank') || field.includes('net') || field.includes('profit')
          ? formatCash(val)
          : val.toLocaleString())
      : (val ?? 0);
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
    return `${medal} **${name}** — ${display}`;
  });

  const embed = new EmbedBuilder()
    .setColor(LB_COLOUR)
    .setTitle(`🏆 Top 10 — ${label}`)
    .setDescription(lines.length ? lines.join('\n') : 'No data yet.');

  const back = _backRow('ap2_hub_leaderboard');
  return { embeds: [embed], components: [back] };
}

// ── Back button helper ────────────────────────

function _backRow(customId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary)
  );
}

module.exports = {
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
};
