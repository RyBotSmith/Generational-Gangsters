// ─────────────────────────────────────────────
//  crewRenderer.js  —  Embed builders for crew results.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');
const { CREW_CREATION_COST, CREW_WORKER_SLOTS, CREW_UPGRADES } = require('../../data/constants');

function homeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
}

// ── No crew ───────────────────────────────────

function renderNoCrew(player) {
  const canAfford = (player.cash ?? 0) >= CREW_CREATION_COST;

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('👥 Crew')
    .setDescription(
      `You're not in a crew.\n\n` +
      `**Create your own** — costs **${formatCash(CREW_CREATION_COST)}** and makes you the leader.\n` +
      `**Join one** — enter a crew name to request entry.\n\n` +
      (canAfford ? '' : `You have **${formatCash(player.cash ?? 0)}** — not enough to create a crew yet.\n`)
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('modal_crew_create')
      .setLabel('➕ Create Crew')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canAfford),
    new ButtonBuilder()
      .setCustomId('modal_crew_join')
      .setLabel('🔑 Join Crew')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Crew home ─────────────────────────────────

function renderCrewHome(crew, income, player) {
  const workers    = crew.workers ?? {};
  const hiredCount = Object.keys(workers).length;
  const slotIds    = Object.keys(CREW_WORKER_SLOTS).map(Number).sort((a, b) => a - b);
  const nextSlot   = slotIds.find(s => !(s in workers) && !(String(s) in workers));
  const isLeader   = crew.leaderId === player.discordId;

  const memberLines = Object.entries(crew.members ?? {}).map(([id, m]) => {
    const crown = id === crew.leaderId ? ' 👑' : '';
    return `• **${m.username ?? id}**${crown}`;
  });

  const hasPending = income.pendingCash > 0 || income.pendingXp > 0 || income.pendingBullets > 0;

  const embed = embeds.base(embeds.COLOURS.purple)
    .setTitle(`👥 ${crew.name}`)
    .setDescription(memberLines.join('\n') || 'No members.')
    .addFields(
      { name: '🏦 Vault',         value: formatCash(crew.vault ?? 0),      inline: true },
      { name: '👥 Members',       value: `${Object.keys(crew.members ?? {}).length}`, inline: true },
      { name: '🧤 Workers',       value: `${hiredCount}/${slotIds.length}`, inline: true },
      {
        name: '📥 Pending Income',
        value: `💰 ${formatCash(Math.floor(income.pendingCash))} · ✨ ${income.pendingXp} XP · 🔫 ${income.pendingBullets} bullets`,
      }
    );

  if (hiredCount > 0) {
    const workerLines = Object.entries(workers)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([slot, w]) => {
        const status = w.pausedUntil && w.pausedUntil > Date.now() ? '🚨 Arrested' : '✅ Working';
        return `**Slot ${slot}** — ${status} · Lifetime: ${formatCash(Math.floor(w.lifetimeCash ?? 0))}`;
      });
    embed.addFields({ name: '🧤 Worker Detail', value: workerLines.join('\n') });
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crew_collect')
      .setLabel(hasPending ? `📥 Collect (${formatCash(Math.floor(income.pendingCash))})` : '📥 Collect')
      .setStyle(hasPending ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!hasPending),
    new ButtonBuilder()
      .setCustomId('panel_crew_hire')
      .setLabel(nextSlot ? `🧤 Hire (Slot ${nextSlot} — ${formatCash(CREW_WORKER_SLOTS[nextSlot]?.cost)})` : '🧤 All Hired')
      .setStyle(nextSlot ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!nextSlot)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('modal_crew_deposit').setLabel('💰 Deposit').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('modal_crew_withdraw').setLabel('💸 Withdraw').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_crew_upgrades').setLabel('⬆️ Upgrades').setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    ...(isLeader ? [
      new ButtonBuilder().setCustomId('panel_crew_kick').setLabel('👢 Kick Member').setStyle(ButtonStyle.Danger),
    ] : [
      new ButtonBuilder().setCustomId('panel_crew_leave').setLabel('🚪 Leave Crew').setStyle(ButtonStyle.Danger),
    ]),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

// ── Crew upgrades ─────────────────────────────

function renderCrewUpgrades(crew, playerCash) {
  const upgrades = crew.upgrades ?? {};

  const lines = Object.entries(CREW_UPGRADES).map(([id, def]) => {
    const cur   = upgrades[id] ?? 0;
    const max   = def.maxLevel ?? 3;
    const atMax = cur >= max;
    const cost  = atMax ? null : Math.floor(def.baseCost * Math.pow(def.costMultiplier ?? 1.5, cur));
    return atMax
      ? `✅ **${def.name}** — Lv ${cur}/${max} (maxed)`
      : `**${def.name}** — Lv ${cur}/${max} · Next: ${formatCash(cost)}`;
  });

  const embed = embeds.base(embeds.COLOURS.purple)
    .setTitle(`⬆️ ${crew.name} — Upgrades`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Your cash: ${formatCash(playerCash)}` });

  const btns = Object.entries(CREW_UPGRADES)
    .filter(([id, def]) => (upgrades[id] ?? 0) < (def.maxLevel ?? 3))
    .map(([id, def]) => {
      const cur  = upgrades[id] ?? 0;
      const cost = Math.floor(def.baseCost * Math.pow(def.costMultiplier ?? 1.5, cur));
      return new ButtonBuilder()
        .setCustomId(`panel_crew_upgrade_${id}`)
        .setLabel(`${def.name} (${formatCash(cost)})`)
        .setStyle(playerCash >= cost ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(playerCash < cost);
    });

  const rows = [];
  for (let i = 0; i < btns.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(...btns.slice(i, i + 5)));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Crew').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  ));

  return { embeds: [embed], components: rows };
}

// ── Kick select panel ─────────────────────────

function renderKickPanel(crew) {
  const nonLeaders = Object.entries(crew.members ?? {})
    .filter(([id]) => id !== crew.leaderId);

  if (nonLeaders.length === 0) {
    const embed = embeds.base(embeds.COLOURS.dark)
      .setTitle('👢 Kick Member')
      .setDescription('No members to kick.');
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    )] };
  }

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('👢 Kick Member')
    .setDescription('Select a member to remove from the crew.');

  const options = nonLeaders.slice(0, 25).map(([id, m]) => ({
    label: m.username ?? id,
    value: id,
  }));

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_crew_kick')
      .setPlaceholder('Select member to kick...')
      .addOptions(options)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Leave confirmation ────────────────────────

function renderLeaveConfirm(crew) {
  const embed = embeds.base(embeds.COLOURS.warning)
    .setTitle('🚪 Leave Crew')
    .setDescription(`Are you sure you want to leave **${crew.name}**? Any vault contributions stay with the crew.`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew_leave_confirm').setLabel('✅ Yes, Leave').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_crew').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Generic result renderers ──────────────────

function renderCrewCreateResult(result) {
  if (!result.success) return { embeds: [embeds.failure('Create Crew', result.message)], components: [homeRow()] };
  return {
    embeds: [embeds.success('Crew Founded!', result.message)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_crew').setLabel('👥 View Crew').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
    )],
  };
}

function renderCrewJoinResult(result) {
  if (!result.success) return { embeds: [embeds.failure('Join Crew', result.message)], components: [homeRow()] };
  return {
    embeds: [embeds.success('Joined!', result.message)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_crew').setLabel('👥 View Crew').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
    )],
  };
}

function renderHireResult(result) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Crew').setStyle(ButtonStyle.Secondary)
  );
  if (!result.success) return { embeds: [embeds.failure('Hire Thug', result.message)], components: [row] };
  return { embeds: [embeds.success('Thug Hired!', result.message)], components: [row] };
}

function renderCollectResult(result) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Crew').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
  if (!result.success) return { embeds: [embeds.failure('Collect', result.message)], components: [row] };
  if (!result.data?.collected) return { embeds: [embeds.info('Nothing to Collect', result.message)], components: [row] };
  return { embeds: [embeds.success('Earnings Collected!', result.message)], components: [row] };
}

function renderUpgradeResult(result) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew_upgrades').setLabel('⬆️ Upgrades').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Crew').setStyle(ButtonStyle.Secondary)
  );
  if (!result.success) return { embeds: [embeds.failure('Upgrade', result.message)], components: [row] };
  return { embeds: [embeds.success('Upgrade Purchased!', result.message)], components: [row] };
}

function renderDepositResult(result) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Crew').setStyle(ButtonStyle.Secondary)
  );
  if (!result.success) return { embeds: [embeds.failure('Deposit', result.message)], components: [row] };
  return { embeds: [embeds.success('Deposited!', result.message)], components: [row] };
}

function renderWithdrawResult(result) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Crew').setStyle(ButtonStyle.Secondary)
  );
  if (!result.success) return { embeds: [embeds.failure('Withdraw', result.message)], components: [row] };
  return { embeds: [embeds.success('Withdrawn!', result.message)], components: [row] };
}

function renderLeaveResult(result) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
  if (!result.success) return { embeds: [embeds.failure('Leave', result.message)], components: [row] };
  return { embeds: [embeds.success('Left Crew', result.message)], components: [row] };
}

function renderKickResult(result) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Crew').setStyle(ButtonStyle.Secondary)
  );
  if (!result.success) return { embeds: [embeds.failure('Kick', result.message)], components: [row] };
  return { embeds: [embeds.success('Member Kicked', result.message)], components: [row] };
}

module.exports = {
  renderNoCrew,
  renderCrewHome,
  renderCrewUpgrades,
  renderKickPanel,
  renderLeaveConfirm,
  renderCrewCreateResult,
  renderCrewJoinResult,
  renderHireResult,
  renderCollectResult,
  renderUpgradeResult,
  renderDepositResult,
  renderWithdrawResult,
  renderLeaveResult,
  renderKickResult,
};
