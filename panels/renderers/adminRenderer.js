// ─────────────────────────────────────────────
//  panels/renderers/adminRenderer.js
//  Rule: No game logic. No DB access. Embeds + components only.
//
//  Flow: /gadmin → player select → per-player hub → category → action
//  Target ID is encoded in customIds: ap2_hub_economy_{discordId}
// ─────────────────────────────────────────────

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, EmbedBuilder,
} = require('discord.js');
const { formatCash } = require('../../utils/helpers');
const { RANKS } = require('../../data/constants');
const { LEADERBOARD_CATEGORIES: LB_CATS } = require('../../services/adminService');

const ADMIN_COLOUR = 0xE74C3C;
const LB_COLOUR    = 0xF1C40F;

// ── Player select ─────────────────────────────

/**
 * Initial screen — dropdown of all server players.
 * @param {object[]} players  — array of player docs, sorted by characterName
 */
function renderPlayerSelect(players) {
  const options = players.slice(0, 25).map(p => ({
    label: p.characterName ?? p.username ?? p.discordId,
    description: `${p.discordId} · ${RANKS[p.rankIndex ?? 0]?.name ?? 'Unknown'}`,
    value: p.discordId,
  }));

  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('⚙️ Admin Panel')
    .setDescription(
      `**${players.length} player(s)** on this server.\nSelect a player to manage them.`
    );

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ap2_select_player')
      .setPlaceholder('Select a player...')
      .addOptions(options.length ? options : [{ label: 'No players found', value: 'none' }])
      .setDisabled(options.length === 0)
  );

  const lbRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ap2_hub_leaderboard')
      .setLabel('🏆 Leaderboards')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row, lbRow] };
}

// ── Per-player hub ────────────────────────────

/**
 * Hub for a specific player — all category buttons encode the target ID.
 * @param {object} player
 * @param {string} rankName
 */
function renderPlayerHub(player, rankName) {
  const id = player.discordId;

  const statusFlags = [];
  if (player.jailedUntil && Date.now() < player.jailedUntil) statusFlags.push('🔒 Jailed');
  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) statusFlags.push('🏥 Hospitalized');
  if (player.banned)  statusFlags.push('🚫 Banned');
  if (!player.alive)  statusFlags.push('💀 Dead');

  const statusStr = statusFlags.length ? `\n${statusFlags.join(' · ')}` : '';

  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle(`⚙️ ${player.characterName ?? player.username}`)
    .setDescription(
      `**${rankName}** · Prestige ${player.prestige ?? 0} · ❤️ ${player.health ?? 100}/100${statusStr}\n\n` +
      `💰 Cash: **${formatCash(player.cash ?? 0)}** · Bank: **${formatCash(player.bank ?? 0)}**\n` +
      `🔫 Bullets: **${(player.bullets ?? 0).toLocaleString()}** · XP: **${(player.xp ?? 0).toLocaleString()}**\n` +
      `📍 ${player.state} · ID: \`${id}\``
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap2_hub_economy_${id}`).setLabel('💰 Economy').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_hub_progression_${id}`).setLabel('⬆️ Progression').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_hub_combat_${id}`).setLabel('⚔️ Combat').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ap2_hub_moderation_${id}`).setLabel('🔒 Moderation').setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap2_hub_inventory_${id}`).setLabel('🎒 Inventory').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ap2_hub_view_${id}`).setLabel('🔍 View Full').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ap2_back_players').setLabel('⬅ Players').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Category sub-hubs — all customIds encode target ID ────────────────

function renderEconomyHub(id) {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('💰 Economy Controls')
    .setDescription('Modify cash, bank balance, or bullets.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap2_modal_give_cash_${id}`).setLabel('Give/Take Cash').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_modal_give_bank_${id}`).setLabel('Give/Take Bank').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_modal_give_bullets_${id}`).setLabel('Give/Take Bullets').setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row, _backRow(`ap2_player_${id}`)] };
}

function renderProgressionHub(id) {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('⬆️ Progression Controls')
    .setDescription('Modify XP, rank, prestige, or upgrades.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap2_modal_give_xp_${id}`).setLabel('Give/Take XP').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_modal_set_rank_${id}`).setLabel('Set Rank').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_modal_set_prestige_${id}`).setLabel('Set Prestige').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_modal_set_upgrade_${id}`).setLabel('Set Upgrade Level').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row, _backRow(`ap2_player_${id}`)] };
}

function renderCombatHub(id) {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('⚔️ Combat Controls')
    .setDescription('Set health, revive, or manage bodyguards.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap2_modal_set_health_${id}`).setLabel('Set Health').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_modal_revive_${id}`).setLabel('Revive Player').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ap2_modal_set_bg_${id}`).setLabel('Set BG Slot').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ap2_modal_clear_bgs_${id}`).setLabel('Clear All BGs').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row, _backRow(`ap2_player_${id}`)] };
}

function renderModerationHub(id) {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('🔒 Moderation Controls')
    .setDescription('Jail, ban, or fully reset this player.');

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap2_modal_jail_${id}`).setLabel('Jail').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ap2_modal_unjail_${id}`).setLabel('Unjail').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ap2_modal_ban_${id}`).setLabel('Ban').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ap2_modal_unban_${id}`).setLabel('Unban').setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap2_modal_reset_${id}`).setLabel('⚠️ Reset Player').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ap2_modal_remove_business_${id}`).setLabel('Remove Business').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row1, row2, _backRow(`ap2_player_${id}`)] };
}

function renderInventoryHub(id) {
  const embed = new EmbedBuilder()
    .setColor(ADMIN_COLOUR)
    .setTitle('🎒 Inventory Controls')
    .setDescription('Give or remove weapons, armour, and cars.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap2_modal_give_weapon_${id}`).setLabel('Give Weapon').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_modal_give_armour_${id}`).setLabel('Give Armour').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_modal_give_car_${id}`).setLabel('Give Car').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap2_modal_take_car_${id}`).setLabel('Take Car').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ap2_modal_clear_garage_${id}`).setLabel('Clear Garage').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row, _backRow(`ap2_player_${id}`)] };
}

// ── Leaderboard (no player context needed) ────

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
  return { embeds: [embed], components: [row, _backRow('ap2_back_players')] };
}

function renderLeaderboard(result) {
  if (!result.success) return renderActionResult(result, 'ap2_hub_leaderboard');

  const { label, players, field } = result.data;

  const lines = players.map((p, i) => {
    const name  = p.characterName ?? p.username ?? 'Unknown';
    const parts = field.split('.');
    let val = p;
    for (const part of parts) val = val?.[part];
    const isCash = field.includes('cash') || field.includes('bank') || field.includes('net') || field.includes('Drugs') || field.includes('Booze');
    const display = typeof val === 'number' ? (isCash ? formatCash(val) : val.toLocaleString()) : (val ?? 0);
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
    return `${medal} **${name}** — ${display}`;
  });

  const embed = new EmbedBuilder()
    .setColor(LB_COLOUR)
    .setTitle(`🏆 Top 10 — ${label}`)
    .setDescription(lines.length ? lines.join('\n') : 'No data yet.');

  // Keep dropdown so admin can switch category
  const options = Object.entries(LB_CATS).map(([id, cat]) => ({
    label: cat.label, value: id,
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ap2_select_leaderboard')
      .setPlaceholder('Switch category...')
      .addOptions(options)
  );
  return { embeds: [embed], components: [row, _backRow('ap2_back_players')] };
}

// ── View player snapshot ──────────────────────

function renderPlayerSnapshot(result, targetId) {
  if (!result.success) return renderActionResult(result, `ap2_player_${targetId}`);

  const { player, rankName, jailed, hospitalized, travelling } = result.data;
  const p  = player;
  const id = p.discordId;

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

  return { embeds: [embed], components: [_backRow(`ap2_player_${id}`)] };
}

// ── Action result ─────────────────────────────

function renderActionResult(result, backTo) {
  const embed = result.success
    ? new EmbedBuilder().setColor(0x2ECC71).setDescription(result.message)
    : new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ ${result.message}`);

  return { embeds: [embed], components: [_backRow(backTo)] };
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
};
