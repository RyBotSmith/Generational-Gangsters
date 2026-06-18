// ─────────────────────────────────────────────
//  homeRenderer.js  —  Home panel embed builder.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, isJailed, isHospitalized, isTravelling, relativeTimestamp } = require('../../utils/helpers');
const { RANKS } = require('../../data/constants');
const { getRankIndex } = require('../../utils/helpers');

/**
 * Build the home panel embed + nav buttons.
 * @param {object} player  — full player document
 */
function renderHome(player) {
  const rankIdx  = getRankIndex(player.xp ?? 0, RANKS);
  const rank     = RANKS[rankIdx];
  const nextRank = RANKS[rankIdx + 1] ?? null;

  // Status line
  let statusLine = '🟢 Active';
  if (isJailed(player))        statusLine = `🔒 In Jail — free ${relativeTimestamp(player.jailedUntil)}`;
  else if (isHospitalized(player)) statusLine = `💀 In Hospital — back ${relativeTimestamp(player.hospitalizedUntil)}`;
  else if (isTravelling(player))   statusLine = `✈️ Travelling — arrives ${relativeTimestamp(player.travelEndTime)}`;

  // XP progress bar (10 segments) with numbers
  let progressStr = '';
  if (nextRank) {
    const xpIntoRank  = (player.xp ?? 0) - rank.minXP;
    const xpNeeded    = nextRank.minXP - rank.minXP;
    const progress    = xpIntoRank / xpNeeded;
    const filled      = Math.round(progress * 10);
    progressStr = `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${Math.floor(progress * 100)}%\n${xpIntoRank.toLocaleString()} / ${xpNeeded.toLocaleString()} XP to **${nextRank.name}**`;
  } else {
    progressStr = '**MAX RANK** — Prestige to continue';
  }

  // Bodyguard count
  const bgs = player.bodyguards ?? {};
  const bgAlive = Object.values(bgs).filter(b => b.alive).length;
  const bgTotal = Object.keys(bgs).length;

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle(`🏠 ${player.username ?? 'Gangster'}'s HQ`)
    .setDescription(statusLine)
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
    .setFooter({ text: `Prestige ${player.prestige ?? 0} · Generational Gangsters` });

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

  // Row 2: crew, business, profile, gamble
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crew')
      .setLabel('👥 Crew')
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

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = { renderHome };
