// ─────────────────────────────────────────────
//  profileRenderer.js  —  Embed builders for profile, upgrades, stats.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, getRankIndex, displayName } = require('../../utils/helpers');
const { RANKS, WEAPONS, ARMOUR, VEHICLES, UPGRADES, BODYGUARD_COSTS } = require('../../data/constants');

// ── Profile home panel ────────────────────────

/**
 * Render the full profile panel.
 * @param {object} player
 */
function renderProfileHome(player, avatarUrl = null) {
  const rankIdx = getRankIndex(player.xp ?? 0, RANKS);
  const rank    = RANKS[rankIdx];
  const inv     = player.inventory ?? {};
  const upg     = player.upgrades  ?? {};

  // ── Equipped items ────────────────────────
  const weapon   = inv.equippedWeapon   ? WEAPONS[inv.equippedWeapon.id]   ?? null : null;
  const armour   = inv.equippedArmour   ? ARMOUR[inv.equippedArmour.id]    ?? null : null;
  const headwear = inv.equippedHeadwear ? ARMOUR[inv.equippedHeadwear.id]  ?? null : null;
  const vehicle  = inv.equippedVehicle  ? VEHICLES[inv.equippedVehicle.id]  ?? null : null;

  // ── Effective bonuses ─────────────────────
  const weaponReduction  = weapon   ? Math.round(weapon.reduction  * 100) : 0;
  const crimeItemBonus   = ((weapon?.crimeBonus ?? 0) + (vehicle?.crimeBonus ?? 0)) * 100;
  const gtaItemBonus     = ((weapon?.gtaBonus   ?? 0) + (vehicle?.gtaBonus   ?? 0)) * 100;
  const armourTotal      = Math.round(((armour?.armorBonus ?? 0) + (headwear?.armorBonus ?? 0)) * 100);

  // ── Upgrade buffs ─────────────────────────
  const crimeCdReduction = Math.round((upg.crime_cooldown ?? 0) * (UPGRADES.crime_cooldown?.valuePerLevel ?? 0.08) * 100);
  const gtaCdReduction   = (upg.gta_cooldown ?? 0) * (UPGRADES.gta_cooldown?.valuePerLevel ?? 30);
  const bankLimit        = Math.floor(100000 * Math.pow(2, upg.bank_vault ?? 0));
  const boozeCapacity    = (UPGRADES.booze_capacity?.baseValue ?? 10) + (upg.booze_capacity ?? 0) * (UPGRADES.booze_capacity?.valuePerLevel ?? 5);
  const drugCapacity     = (UPGRADES.drug_capacity?.baseValue  ?? 10) + (upg.drug_capacity  ?? 0) * (UPGRADES.drug_capacity?.valuePerLevel  ?? 5);

  // ── Bodyguard status ──────────────────────
  const bgs = player.bodyguards ?? {};
  const bgLines = [4, 3, 2, 1].map(slot => {
    const bg   = bgs[slot];
    const cost = BODYGUARD_COSTS[slot];
    if (!bg || !bg.alive) return `Slot ${slot} — ☠️ Empty (${formatCash(cost)} to hire)`;
    return `Slot ${slot} — ✅ **${bg.name}**`;
  });

  // ── Weapon field ──────────────────────────
  const weaponStr = weapon
    ? `**${weapon.name}** — -${weaponReduction}% bullets to kill` +
      (weapon.crimeBonus ? ` • +${Math.round(weapon.crimeBonus * 100)}% crime` : '') +
      (weapon.gtaBonus   ? ` • +${Math.round(weapon.gtaBonus   * 100)}% GTA`   : '') +
      `\n${inv.equippedWeapon.shotsUsed ?? 0}/${weapon.durabilityShots} shots • ${inv.equippedWeapon.killsUsed ?? 0}/${weapon.durabilityKills} kills`
    : '*None equipped*';

  const armourStr = [
    armour   ? `**${armour.name}** — +${Math.round(armour.armorBonus * 100)}% armour` : null,
    headwear ? `**${headwear.name}** — +${Math.round(headwear.armorBonus * 100)}% armour` : null,
  ].filter(Boolean).join('\n') || '*None equipped*';

  const vehicleStr = vehicle
    ? `**${vehicle.name}**` +
      (vehicle.crimeBonus ? ` • +${Math.round(vehicle.crimeBonus * 100)}% crime` : '') +
      (vehicle.gtaBonus   ? ` • +${Math.round(vehicle.gtaBonus   * 100)}% GTA`   : '')
    : '*None equipped*';

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle(`👤 ${displayName(player)}`)
    .setThumbnail(avatarUrl)
    .setDescription(
      `**${rank.name}** · Prestige ${player.prestige ?? 0}/5 · ❤️ ${player.health ?? 100}/100`
    )
    .addFields(
      // ── Items
      { name: '🔫 Weapon',      value: weaponStr,   inline: false },
      { name: '🛡️ Protection',  value: armourStr,   inline: true  },
      { name: '🚗 Vehicle',     value: vehicleStr,  inline: true  },

      // ── Effective combat stats
      {
        name: '⚡ Combat Effectiveness',
        value: [
          `Weapon reduction: **-${weaponReduction}%** bullets to kill`,
          `Armour bonus: **+${armourTotal}%** bullets required to kill you`,
          `Crime success bonus: **+${Math.round(crimeItemBonus)}%**`,
          `GTA success bonus: **+${Math.round(gtaItemBonus)}%**`,
        ].join('\n'),
        inline: false,
      },

      // ── Upgrade buffs
      {
        name: '⬆️ Upgrade Buffs',
        value: [
          `Crime cooldown: **-${crimeCdReduction}%**${player.prestige4Perk === 'cooldown' ? ' + **-20% (P4)**' : ''}`,
          `GTA cooldown: **-${gtaCdReduction}s**${player.prestige4Perk === 'cooldown' ? ' + **-20% (P4)**' : ''}`,
          `Bank limit: **${formatCash(bankLimit)}**`,
          `Booze capacity: **${boozeCapacity} cases** (+${boozeCapacity - (UPGRADES.booze_capacity?.baseValue ?? 10)} from upgrades${player.prestige4Perk === 'capacity' ? ' +20 P4' : ''})`,
          `Drug capacity: **${drugCapacity} units** (+${drugCapacity - (UPGRADES.drug_capacity?.baseValue ?? 10)} from upgrades${player.prestige4Perk === 'capacity' ? ' +20 P4' : ''})`,
        ].join('\n'),
        inline: false,
      },

      // ── Prestige buffs (only shown if prestiged)
      ...((player.prestige ?? 0) > 0 ? [{
        name: '🌟 Prestige Buffs',
        value: [
          ...((player.prestigeAllocations ?? []).map((a, i) =>
            `P${i + 1}: **+10% ${a === 'crime' ? 'Crime' : 'GTA'} success**`
          )),
          ...(player.prestige4Perk ? [`P4: **${player.prestige4Perk === 'cooldown' ? 'Cooldown Mastery (-20% all cooldowns)' : 'Storage Empire (+20 capacity)'}**`] : []),
          ...(player.prestige5Perk ? [`P5: **${player.prestige5Perk === 'bullets' ? '10,000 Bullets' : '$5,000,000 Cash'}**`] : []),
        ].join('\n') || 'None',
        inline: false,
      }] : []),

      // ── Bodyguards
      { name: '🛡️ Bodyguards', value: bgLines.join('\n'), inline: false },
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
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_leaderboard')
      .setLabel('🏆 Leaderboard')
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
function renderStatsPanel(player, avatarUrl = null) {
  const s   = player.stats ?? {};
  const inv = player.inventory ?? {};

  // Calculate total buffs
  const weaponDef  = inv.equippedWeapon  ? WEAPONS[inv.equippedWeapon.id]   : null;
  const vehicleDef = inv.equippedVehicle ? VEHICLES[inv.equippedVehicle.id] : null;
  const crimeAllocs = (player.prestigeAllocations ?? []).filter(a => a === 'crime').length;
  const gtaAllocs   = (player.prestigeAllocations ?? []).filter(a => a === 'gta').length;

  const crimeTotalBuff = Math.round(
    ((weaponDef?.crimeBonus ?? 0) + (vehicleDef?.crimeBonus ?? 0) + crimeAllocs * 0.10) * 100
  );
  const gtaTotalBuff = Math.round(
    ((weaponDef?.gtaBonus ?? 0) + (vehicleDef?.gtaBonus ?? 0) + gtaAllocs * 0.10) * 100
  );

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
    .setTitle(`📊 ${displayName(player)}`)
    .setThumbnail(avatarUrl);

  // Only show buff summary if player has any buffs
  if (crimeTotalBuff > 0 || gtaTotalBuff > 0) {
    embed.addFields({
      name: '⚡ Total Success Buffs',
      value: [
        crimeTotalBuff > 0 ? `🕵️ Crime: **+${crimeTotalBuff}%**` : null,
        gtaTotalBuff   > 0 ? `🚗 GTA: **+${gtaTotalBuff}%**`     : null,
      ].filter(Boolean).join(' · '),
      inline: false,
    });
  }

  embed.addFields(
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



// ── Leaderboard hub ───────────────────────────

const { StringSelectMenuBuilder } = require('discord.js');

const LEADERBOARD_CATEGORIES = {
  xp:              'XP',
  cash:            'Cash on Hand',
  bank:            'Bank Balance',
  kills:           'Kills',
  deaths:          'Deaths',
  crimes:          'Crimes Completed',
  gta:             'GTA Steals',
  net_gambling:    'Gambling Net',
  cash_from_drugs: 'Drug Profit',
  cash_from_booze: 'Booze Profit',
  oc_succeeded:    'OC Completed',
  bullets:         'Bullets',
  prestige:        'Prestige',
};

// Field path map for display value extraction
const LB_FIELDS = {
  xp:              'xp',
  cash:            'cash',
  bank:            'bank',
  kills:           'stats.kills',
  deaths:          'stats.deaths',
  crimes:          'stats.crimesSucceeded',
  gta:             'stats.gtaSucceeded',
  net_gambling:    'stats.netGambling',
  cash_from_drugs: 'stats.cashFromDrugs',
  cash_from_booze: 'stats.cashFromBooze',
  oc_succeeded:    'stats.ocSucceeded',
  bullets:         'bullets',
  prestige:        'prestige',
};

const CASH_FIELDS = new Set(['cash', 'bank', 'net_gambling', 'cash_from_drugs', 'cash_from_booze']);

function renderLeaderboardHub() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🏆 Leaderboards')
    .setDescription('Select a category to see the top 10 players on this server.');

  const options = Object.entries(LEADERBOARD_CATEGORIES).map(([id, label]) => ({
    label,
    value: id,
  }));

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_leaderboard')
      .setPlaceholder('Choose a category...')
      .addOptions(options)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_profile')
      .setLabel('⬅ Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function renderLeaderboardResult(category, players) {
  const label = LEADERBOARD_CATEGORIES[category] ?? category;
  const field = LB_FIELDS[category] ?? category;
  const isCash = CASH_FIELDS.has(category);

  const lines = players.map((p, i) => {
    const name  = p.characterName ?? p.username ?? 'Unknown';
    const parts = field.split('.');
    let val = p;
    for (const part of parts) val = val?.[part];
    val = val ?? 0;
    const display = isCash ? formatCash(val) : val.toLocaleString();
    const medal   = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
    return `${medal} **${name}** — ${display}`;
  });

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle(`🏆 Top 10 — ${label}`)
    .setDescription(lines.length ? lines.join('\n') : '*No data yet.*');

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_leaderboard')
      .setPlaceholder('Switch category...')
      .addOptions(Object.entries(LEADERBOARD_CATEGORIES).map(([id, lbl]) => ({
        label: lbl, value: id,
      })))
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_leaderboard')
      .setLabel('⬅ Leaderboards')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = {
  renderProfileHome,
  renderUpgradesPanel,
  renderUpgradePurchaseResult,
  renderStatsPanel,
  renderLeaderboardHub,
  renderLeaderboardResult,
  LEADERBOARD_CATEGORIES,
  LB_FIELDS,
};
