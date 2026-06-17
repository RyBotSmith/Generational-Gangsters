// ─────────────────────────────────────────────
//  profileRenderer.js  —  Embed builders for profile, upgrades, stats.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, formatDuration, relativeTimestamp, getRankIndex } = require('../../utils/helpers');
const { RANKS } = require('../../data/constants');

// ── Profile home panel ────────────────────────

/**
 * Render the profile hub — entry point from home, links to sub-panels.
 * @param {object} player
 */
function renderProfileHome(player) {
  const rankIdx  = getRankIndex(player.xp ?? 0, RANKS);
  const rank     = RANKS[rankIdx];
  const bgs      = player.bodyguards ?? {};
  const bgAlive  = Object.values(bgs).filter(b => b.alive).length;

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle(`👤 ${player.characterName ?? player.username ?? 'Profile'}`)
    .addFields(
      { name: '🏅 Rank',       value: rank.name,                              inline: true },
      { name: '✨ XP',          value: (player.xp ?? 0).toLocaleString(),      inline: true },
      { name: '🌟 Prestige',    value: `${player.prestige ?? 0}/5`,            inline: true },
      { name: '💰 Cash',        value: formatCash(player.cash ?? 0),           inline: true },
      { name: '🏦 Bank',        value: formatCash(player.bank ?? 0),           inline: true },
      { name: '🛡️ Bodyguards', value: `${bgAlive}/4 alive`,                   inline: true },
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_stats')
      .setLabel('📊 Stats')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_upgrades')
      .setLabel('⬆️ Upgrades')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_inventory')
      .setLabel('🎒 Inventory')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_prestige')
      .setLabel('🌟 Prestige')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}



/**
 * Render the upgrades panel.
 * @param {object}   player
 * @param {object[]} upgradeList  — from upgradeService.getAllUpgrades(player)
 */
function renderUpgradesPanel(player, upgradeList) {
  const lines = upgradeList.map(u => {
    const levelStr = u.maxed
      ? `**MAX** (${u.maxLevel}/${u.maxLevel})`
      : `${u.currentLevel}/${u.maxLevel}`;

    const valueStr = u.currentValue ? ` — ${u.currentValue}` : '';
    const costStr  = u.maxed
      ? ''
      : ` • Next: **$${u.nextCost.toLocaleString('en-US')}** → ${u.nextValue}`;

    return `**${u.name}** [${levelStr}]${valueStr}${costStr}`;
  });

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('⬆️ Upgrades')
    .setDescription(
      `💰 **Cash:** ${formatCash(player.cash ?? 0)}\n\n` +
      lines.join('\n')
    );

  // Build upgrade buttons — one per upgrade, disabled if maxed or can't afford
  const rows = [];
  let row = new ActionRowBuilder();
  let count = 0;

  for (const u of upgradeList) {
    if (count > 0 && count % 3 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }

    const canAfford = !u.maxed && (player.cash ?? 0) >= u.nextCost;

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`panel_upgrade_buy_${u.id}`)
        .setLabel(u.maxed ? `${u.name} ✓` : `${u.name} ($${u.nextCost?.toLocaleString('en-US')})`)
        .setStyle(u.maxed ? ButtonStyle.Secondary : canAfford ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(u.maxed || !canAfford)
    );
    count++;
  }
  if (count % 3 !== 0 || count === 0) rows.push(row);

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_profile')
        .setLabel('⬅ Profile')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('panel_home')
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

/**
 * Render the result of a purchase.
 */
function renderUpgradePurchaseResult(result) {
  if (!result.success) {
    const embed = embeds.failure('Upgrade Failed', result.message);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_upgrades')
        .setLabel('⬅ Upgrades')
        .setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const { upgradeName, newLevel, maxLevel, newValue, nextCost } = result.data;
  const nextStr = nextCost
    ? `\nNext level: **$${nextCost.toLocaleString('en-US')}**`
    : `\n**MAX LEVEL reached!**`;

  const embed = embeds.success(
    `${upgradeName} — Level ${newLevel}`,
    `Now at: **${newValue}**${nextStr}`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_upgrades')
      .setLabel('⬆️ Upgrades')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Stats panel ───────────────────────────────

/**
 * Render the stats panel.
 * @param {object} player
 */
function renderStatsPanel(player) {
  const s = player.stats ?? {};

  const crimeWinPct = s.crimesAttempted > 0
    ? Math.round((s.crimesSucceeded / s.crimesAttempted) * 100)
    : 0;

  const gtaWinPct = s.gtaAttempted > 0
    ? Math.round((s.gtaSucceeded / s.gtaAttempted) * 100)
    : 0;

  const kd = s.deaths > 0
    ? (s.kills / s.deaths).toFixed(2)
    : s.kills > 0 ? '∞' : '0';

  const gambleWinPct = s.gamesPlayed > 0
    ? Math.round((s.gamesWon / s.gamesPlayed) * 100)
    : 0;

  const netGamble = s.netGambling ?? 0;
  const netGambleStr = netGamble >= 0
    ? `+${formatCash(netGamble)}`
    : `-${formatCash(Math.abs(netGamble))}`;

  const embed = embeds.base(embeds.COLOURS.info)
    .setTitle(`📊 ${player.username ?? 'Stats'}`)
    .addFields(
      {
        name: '💀 Crimes',
        value: [
          `Attempted: **${s.crimesAttempted ?? 0}**`,
          `Succeeded: **${s.crimesSucceeded ?? 0}** (${crimeWinPct}%)`,
          `Jailed: **${s.crimesJailed ?? 0}**`,
          `Earned: **${formatCash(s.cashFromCrimes ?? 0)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🚗 GTA',
        value: [
          `Attempts: **${s.gtaAttempted ?? 0}**`,
          `Stolen: **${s.gtaSucceeded ?? 0}** (${gtaWinPct}%)`,
          `Sold: **${s.gtaSold ?? 0}**`,
          `Melted: **${s.gtaMelted ?? 0}**`,
          `Earned: **${formatCash(s.cashFromGta ?? 0)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🔫 Combat',
        value: [
          `Kills: **${s.kills ?? 0}** | Deaths: **${s.deaths ?? 0}**`,
          `K/D: **${kd}**`,
          `BG Kills: **${s.bgKills ?? 0}** | BG Deaths: **${s.bgDeaths ?? 0}**`,
          `Bullets Fired: **${(s.bulletsFired ?? 0).toLocaleString()}**`,
          `Looted: **${formatCash(s.cashLooted ?? 0)}**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🎰 Gambling',
        value: [
          `Games: **${s.gamesPlayed ?? 0}** (${gambleWinPct}% win)`,
          `Wagered: **${formatCash(s.totalWagered ?? 0)}**`,
          `Net: **${netGambleStr}**`,
          `Biggest Win: **${formatCash(s.biggestWin ?? 0)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🍺 Booze',
        value: [
          `Bought: **${s.boozeBought ?? 0}** cases`,
          `Sold: **${s.boozeSold ?? 0}** cases`,
          `Seized: **${s.boozeSeized ?? 0}**`,
          `Earned: **${formatCash(s.cashFromBooze ?? 0)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '💊 Drugs',
        value: [
          `Bought: **${s.drugsBought ?? 0}** units`,
          `Sold: **${s.drugsSold ?? 0}** units`,
          `Seized: **${s.drugsSeized ?? 0}**`,
          `Earned: **${formatCash(s.cashFromDrugs ?? 0)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🤝 OC',
        value: [
          `Attempted: **${s.ocAttempted ?? 0}**`,
          `Succeeded: **${s.ocSucceeded ?? 0}**`,
          `Earned: **${formatCash(s.cashFromOc ?? 0)}**`,
        ].join('\n'),
        inline: false,
      }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_profile')
      .setLabel('⬅ Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  renderProfileHome,
  renderUpgradesPanel,
  renderUpgradePurchaseResult,
  renderStatsPanel,
};
