// ─────────────────────────────────────────────
//  homeRenderer.js  —  Home panel embed builder.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, isJailed, isHospitalized, isTravelling, relativeTimestamp, displayName } = require('../../utils/helpers');
const { RANKS } = require('../../data/constants');
const { getRankIndex } = require('../../utils/helpers');

// ── Rank colours ──────────────────────────────
const RANK_COLOURS = [
  0x808080,  // 0  Hobo — grey
  0x8B4513,  // 1  Petty Criminal — brown
  0xFFA500,  // 2  Street Thug — orange
  0xFFD700,  // 3  Gangster — gold
  0xFF4500,  // 4  Hitman — red-orange
  0xDC143C,  // 5  Assassin — crimson
  0x9400D3,  // 6  Underboss — purple
  0x0000FF,  // 7  Boss — blue
  0x00CED1,  // 8  Godfather — teal
  0xFFD700,  // 9  Infamous Gangster — bright gold
];

// Prestige overrides rank colour when prestiged
const PRESTIGE_COLOURS = [
  null,      // 0  no prestige — use rank colour
  0xf39c12,  // 1  gold
  0xe67e22,  // 2  orange
  0xe74c3c,  // 3  red
  0x9b59b6,  // 4  purple
  0x00d4ff,  // 5  electric blue
];

const PRESTIGE_BADGES = ['', '⭐', '⭐⭐', '⭐⭐⭐', '💜', '💠'];

/**
 * Build the home panel embed + nav buttons.
 * @param {object} player  — full player document
 */
function renderHome(player) {
  const rankIdx  = getRankIndex(player.xp ?? 0, RANKS);
  const rank     = RANKS[rankIdx];
  const nextRank = RANKS[rankIdx + 1] ?? null;
  const prestige = player.prestige ?? 0;

  // Colour — prestige overrides rank
  const colour = PRESTIGE_COLOURS[prestige] ?? RANK_COLOURS[rankIdx] ?? embeds.COLOURS.dark;

  // Title — no badge, just home icon
  const title = `🏠 ${displayName(player)}'s HQ`;

  // Status line
  let statusLine = '🟢 Active';
  if (isJailed(player))             statusLine = `🔒 In Jail — free ${relativeTimestamp(player.jailedUntil)}`;
  else if (isHospitalized(player))  statusLine = `💀 In Hospital — back ${relativeTimestamp(player.hospitalizedUntil)}`;
  else if (isTravelling(player))    statusLine = `✈️ Travelling — arrives ${relativeTimestamp(player.travelEndTime)}`;

  // Prestige banner — text only, no stars
  const prestigeBanner = prestige > 0
    ? `\n✨ **PRESTIGE ${prestige}**`
    : '';

  // Footer — rank removed, stars scale 1-5
  const footerStars = '⭐'.repeat(prestige);
  const footerText = prestige > 0
    ? `${footerStars} Prestige ${prestige} · Generational Gangsters`
    : `Generational Gangsters`;

  // XP progress bar with numbers
  let progressStr = '';
  if (nextRank) {
    const xpIntoRank = (player.xp ?? 0) - rank.minXP;
    const xpNeeded   = nextRank.minXP - rank.minXP;
    const progress   = xpIntoRank / xpNeeded;
    const filled     = Math.round(progress * 10);
    progressStr = `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${Math.floor(progress * 100)}%\n${xpIntoRank.toLocaleString()} / ${xpNeeded.toLocaleString()} XP to **${nextRank.name}**`;
  } else {
    progressStr = '**MAX RANK** — Prestige to continue';
  }

  // Bodyguard count
  const bgs    = player.bodyguards ?? {};
  const bgAlive = Object.values(bgs).filter(b => b.alive).length;
  const bgTotal = Object.keys(bgs).length;

  const embed = embeds.base(colour)
    .setTitle(title)
    .setDescription(statusLine + prestigeBanner)
    .addFields(
      { name: '📍 Location', value: player.state ?? 'Unknown', inline: true },
      { name: '🏅 Rank',     value: `${rank.name} (#${rankIdx})`, inline: true },
      { name: '✨ XP',          value: `${(player.xp ?? 0).toLocaleString()}`, inline: true },
      { name: '💰 Cash',        value: formatCash(player.cash ?? 0),           inline: true },
      { name: '🏦 Bank',        value: formatCash(player.bank ?? 0),           inline: true },
      { name: '🔫 Bullets',     value: (player.bullets ?? 0).toLocaleString(), inline: true },
      { name: '❤️ Health',      value: `${player.health ?? 100}/100`,          inline: true },
      { name: '🛡️ Bodyguards', value: `${bgAlive}/${bgTotal} alive`,          inline: true },
      { name: '📈 Progress', value: progressStr }
    )
    .setFooter({ text: footerText });

  // Nav buttons — row 1: core actions
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crime')
      .setLabel('🕵️ Crimes')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_gta')
      .setLabel('🚗 GTA')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('panel_travel')
      .setLabel('✈️ Travel')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_combat')
      .setLabel('⚔️ Combat')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('panel_shop')
      .setLabel('🛒 Shop')
      .setStyle(ButtonStyle.Success)
  );

  // Row 2: trafficking, bank, business, profile, gamble
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_traffic')
      .setLabel('🚬 Trafficking')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_bank')
      .setLabel('🏦 Bank')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_business')
      .setLabel('🏢 Business')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_profile')
      .setLabel('👤 Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_gamble')
      .setLabel('🎰 Gamble')
      .setStyle(ButtonStyle.Secondary)
  );

  // Row 3: crew
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crew')
      .setLabel('👥 Crew')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { renderHome };
