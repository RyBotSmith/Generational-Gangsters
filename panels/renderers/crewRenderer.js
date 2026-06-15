// ─────────────────────────────────────────────
//  crewRenderer.js  —  Embed builders for crew results.
//  Rule: No game logic. No DB access. Embeds only.
//  Scope: solo passive crew system (create + workers only).
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');
const { CREW_CREATION_COST, CREW_WORKER_SLOTS } = require('../../data/constants');

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

/**
 * Render the panel shown to players without a crew — prompts to create one.
 */
function renderNoCrew(player) {
  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('👥 Crew')
    .setDescription(
      `You don't have a crew yet.\n\n` +
      `Founding a crew costs **${formatCash(CREW_CREATION_COST)}** and lets you hire ` +
      `**thugs** to passively run crimes and GTA jobs for you.\n\n` +
      `Use \`/crew create\` to found your crew.`
    );

  if ((player.cash ?? 0) < CREW_CREATION_COST) {
    embed.addFields({ name: 'Balance', value: `${formatCash(player.cash ?? 0)} — not enough to found a crew yet.` });
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
  const workers = crew.workers ?? {};
  const hiredCount = Object.keys(workers).length;

  const slotIds = Object.keys(CREW_WORKER_SLOTS).map(Number).sort((a, b) => a - b);
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

  return { embeds: [embed], components: [row1, homeRow()] };
}

// ── Result renderers ──────────────────────────

/**
 * Render the result of crewService.create().
 */
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

/**
 * Render the result of crewService.hireThug().
 */
function renderHireResult(result) {
  if (!result.success) {
    return {
      embeds: [embeds.failure('Hire Thug', result.message)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panel_crew')
            .setLabel('⬅ Back')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  const embed = embeds.success('Thug Hired!', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crew')
      .setLabel('👥 View Crew')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render the result of crewService.processThugs() with collect=true.
 */
function renderCollectResult(result) {
  if (!result.success) {
    return {
      embeds: [embeds.failure('Collect', result.message)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panel_crew')
            .setLabel('⬅ Back')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  if (!result.data?.collected) {
    const embed = embeds.info('Nothing to Collect', result.message);
    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panel_crew')
            .setLabel('⬅ Back')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  const embed = embeds.success('Thug Earnings Collected!', result.message);

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

module.exports = {
  renderNoCrew,
  renderCrewHome,
  renderCrewCreateResult,
  renderHireResult,
  renderCollectResult,
};
