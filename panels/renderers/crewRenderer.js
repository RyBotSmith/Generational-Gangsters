// ─────────────────────────────────────────────
//  crewRenderer.js  —  Embed builders for crew results.
//  Rule: No game logic. No DB access. Embeds only.
//
//  UPDATED: Added OC entry point to crew home, added crew upgrades panel.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');
const {
  CREW_CREATION_COST,
  CREW_WORKER_SLOTS,
  CREW_UPGRADES,
} = require('../../data/constants');

function homeRow(extra = []) {
  return new ActionRowBuilder().addComponents(
    ...extra,
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );
}

// ── No-crew panel ──────────────────────────────

function renderNoCrew(player) {
  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('👥 Crew')
    .setDescription(
      `You don't have a crew yet.\n\n` +
      `Founding a crew costs **${formatCash(CREW_CREATION_COST)}** and lets you hire ` +
      `**thugs** to passively run crimes and GTA jobs for you, plus access to ` +
      `**Organised Crime** missions with other players.\n\n` +
      `Use \`/crew create\` to found your crew.`
    );

  if ((player.cash ?? 0) < CREW_CREATION_COST) {
    embed.addFields({
      name: 'Balance',
      value: `${formatCash(player.cash ?? 0)} — not enough to found a crew yet.`,
    });
  }

  return { embeds: [embed], components: [homeRow()] };
}

// ── Crew home panel ────────────────────────────

/**
 * Render the crew home panel for a player with a crew.
 * @param {object} crew
 * @param {{ pendingCash, pendingXp, pendingBullets, workerCount }} income
 */
function renderCrewHome(crew, income) {
  const workers    = crew.workers ?? {};
  const hiredCount = Object.keys(workers).length;

  const slotIds  = Object.keys(CREW_WORKER_SLOTS).map(Number).sort((a, b) => a - b);
  const nextSlot = slotIds.find(s => !(s in workers) && !(String(s) in workers));

  const lines = [
    `👑 **Leader:** ${crew.leaderName}`,
    `👥 **Workers hired:** ${hiredCount}/${slotIds.length}`,
    '',
    '**Pending thug income:**',
    `💰 ${formatCash(Math.floor(income.pendingCash))}`,
    `✨ ${income.pendingXp} XP`,
    `🔫 ${income.pendingBullets} bullets`,
  ];

  const embed = embeds.base(embeds.COLOURS.purple)
    .setTitle(`👥 ${crew.name}`)
    .setDescription(lines.join('\n'));

  if (hiredCount > 0) {
    const workerLines = Object.entries(workers)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([slot, w]) => {
        const status = w.pausedUntil && w.pausedUntil > Date.now() ? '🚨 Arrested' : '✅ Working';
        return `**Slot ${slot}** — ${status} • Lifetime: ${formatCash(Math.floor(w.lifetimeCash ?? 0))}, ${w.lifetimeXp ?? 0} XP, ${w.lifetimeBullets ?? 0} 🔫`;
      });
    embed.addFields({ name: 'Workers', value: workerLines.join('\n') });
  }

  const hasPending = income.pendingCash > 0 || income.pendingXp > 0 || income.pendingBullets > 0;

  const collectBtn = new ButtonBuilder()
    .setCustomId('panel_crew_collect')
    .setLabel(hasPending ? `📥 Collect (${formatCash(Math.floor(income.pendingCash))})` : '📥 Collect')
    .setStyle(hasPending ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(!hasPending);

  let hireBtn;
  if (nextSlot) {
    const cost = CREW_WORKER_SLOTS[nextSlot].cost;
    hireBtn = new ButtonBuilder()
      .setCustomId('panel_crew_hire')
      .setLabel(`🧤 Hire Thug — Slot ${nextSlot} (${formatCash(cost)})`)
      .setStyle(ButtonStyle.Primary);
  } else {
    hireBtn = new ButtonBuilder()
      .setCustomId('panel_crew_hire')
      .setLabel('🧤 All Slots Hired')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);
  }

  const row1 = new ActionRowBuilder().addComponents(collectBtn, hireBtn);

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_oc')
      .setLabel('🎯 Organised Crime')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('panel_crew_upgrades')
      .setLabel('⬆️ Crew Upgrades')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Crew upgrades panel ────────────────────────

/**
 * Render the crew upgrades panel.
 * @param {object} crew
 * @param {number} playerCash
 */
function renderCrewUpgrades(crew, playerCash) {
  const upgrades = crew.upgrades ?? {};

  const upgradeLines = Object.entries(CREW_UPGRADES).map(([id, def]) => {
    const currentLevel = upgrades[id] ?? 0;
    const maxLevel     = def.maxLevel ?? 3;
    const atMax        = currentLevel >= maxLevel;
    const nextCost     = atMax ? null : def.baseCost * Math.pow(def.costMultiplier ?? 1.5, currentLevel);

    if (atMax) {
      return `✅ **${def.name}** — Lv ${currentLevel}/${maxLevel} (maxed)`;
    }
    return `**${def.name}** — Lv ${currentLevel}/${maxLevel} • Next: ${formatCash(Math.floor(nextCost))}`;
  });

  const embed = embeds.base(embeds.COLOURS.purple)
    .setTitle(`⬆️ ${crew.name} — Upgrades`)
    .setDescription(upgradeLines.join('\n'))
    .setFooter({ text: `Your cash: ${formatCash(playerCash)}` });

  // Build upgrade buttons — one per non-maxed upgrade, up to 5 per row
  const upgradeButtons = Object.entries(CREW_UPGRADES)
    .filter(([id, def]) => (upgrades[id] ?? 0) < (def.maxLevel ?? 3))
    .map(([id, def]) => {
      const currentLevel = upgrades[id] ?? 0;
      const cost = Math.floor(def.baseCost * Math.pow(def.costMultiplier ?? 1.5, currentLevel));
      const canAfford = playerCash >= cost;
      return new ButtonBuilder()
        .setCustomId(`panel_crew_upgrade_${id}`)
        .setLabel(`${def.name} (${formatCash(cost)})`)
        .setStyle(canAfford ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(!canAfford);
    });

  const rows = [];

  // Chunk buttons into rows of 5
  for (let i = 0; i < upgradeButtons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(...upgradeButtons.slice(i, i + 5)));
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Crew').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

// ── Upgrade result ────────────────────────────

function renderUpgradeResult(result) {
  if (!result.success) {
    return {
      embeds: [embeds.failure('Crew Upgrade', result.message)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('panel_crew_upgrades').setLabel('⬅ Upgrades').setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  const embed = embeds.success('Upgrade Purchased!', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew_upgrades').setLabel('⬆️ Upgrades').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_crew').setLabel('👥 Crew').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Result renderers ──────────────────────────

function renderCrewCreateResult(result) {
  if (!result.success) {
    return {
      embeds: [embeds.failure('Crew', result.message)],
      components: [homeRow()],
    };
  }

  const embed = embeds.success('Crew Founded!', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crew')
      .setLabel('👥 View Crew')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderHireResult(result) {
  if (!result.success) {
    return {
      embeds: [embeds.failure('Hire Thug', result.message)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  const embed = embeds.success('Thug Hired!', result.message);
  const row   = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('👥 View Crew').setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

function renderCollectResult(result) {
  if (!result.success) {
    return {
      embeds: [embeds.failure('Collect', result.message)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  if (!result.data?.collected) {
    return {
      embeds: [embeds.info('Nothing to Collect', result.message)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  const embed = embeds.success('Thug Earnings Collected!', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('👥 View Crew').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  renderNoCrew,
  renderCrewHome,
  renderCrewUpgrades,
  renderUpgradeResult,
  renderCrewCreateResult,
  renderHireResult,
  renderCollectResult,
};
