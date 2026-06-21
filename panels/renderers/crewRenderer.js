// ─────────────────────────────────────────────
//  crewRenderer.js  —  Embed builders for crew.
//  Rule: No game logic. No DB access. Embeds only.
//
//  Crew is a social grouping system only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');
const { CREW_CREATION_COST } = require('../../data/constants');

// ── No crew ───────────────────────────────────

function renderNoCrew(player) {
  const canAfford = (player.cash ?? 0) >= CREW_CREATION_COST;

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('👥 Crew')
    .setDescription(
      `You're not in a crew.\n\n` +
      `**Create your own** — costs **${formatCash(CREW_CREATION_COST)}**.\n` +
      `**Join one** — enter the crew name.\n\n` +
      (!canAfford ? `You have **${formatCash(player.cash ?? 0)}** — not enough to create a crew.\n` : '')
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

function renderCrewHome(crew, player) {
  const isLeader    = crew.leaderId === player.discordId;
  const memberList  = Object.entries(crew.members ?? {});

  const memberLines = memberList.map(([id, m]) => {
    const crown = id === crew.leaderId ? ' 👑' : '';
    return `• **${m.username ?? id}**${crown}`;
  });

  const embed = embeds.base(embeds.COLOURS.purple)
    .setTitle(`👥 ${crew.name}`)
    .setDescription(memberLines.join('\n') || 'No members.')
    .addFields(
      { name: '👑 Leader',  value: crew.leaderName ?? 'Unknown', inline: true },
      { name: '👥 Members', value: `${memberList.length}`,        inline: true }
    );

  const rows = [];

  if (isLeader) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_crew_kick')
        .setLabel('👢 Kick Member')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(memberList.length <= 1),
      new ButtonBuilder()
        .setCustomId('panel_crew_disband')
        .setLabel('💀 Disband Crew')
        .setStyle(ButtonStyle.Danger)
    ));
  } else {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_crew_leave')
        .setLabel('🚪 Leave Crew')
        .setStyle(ButtonStyle.Danger)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  ));

  return { embeds: [embed], components: rows };
}

// ── Kick select ───────────────────────────────

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

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_crew_kick')
      .setPlaceholder('Select member to kick...')
      .addOptions(nonLeaders.slice(0, 25).map(([id, m]) => ({
        label: m.username ?? id,
        value: id,
      })))
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Disband confirmation (leader only) ───────────

function renderDisbandConfirm(crew) {
  const embed = embeds.base(embeds.COLOURS.warning)
    .setTitle('💀 Disband Crew')
    .setDescription(
      `Are you sure you want to disband **${crew.name}**?

` +
      `All members will be removed. This cannot be undone.`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew_disband_confirm').setLabel('💀 Yes, Disband').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_crew').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Leave confirmation ────────────────────────

function renderLeaveConfirm(crew) {
  const embed = embeds.base(embeds.COLOURS.warning)
    .setTitle('🚪 Leave Crew')
    .setDescription(`Are you sure you want to leave **${crew.name}**?`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew_leave_confirm').setLabel('✅ Yes, Leave').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_crew').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Result renderers ──────────────────────────

function renderCrewCreateResult(result) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('👥 View Crew').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
  if (!result.success) return { embeds: [embeds.failure('Create Crew', result.message)], components: [row] };
  return { embeds: [embeds.success('Crew Founded!', result.message)], components: [row] };
}

function renderCrewJoinResult(result) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_crew').setLabel('👥 View Crew').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
  if (!result.success) return { embeds: [embeds.failure('Join Crew', result.message)], components: [row] };
  return { embeds: [embeds.success('Joined!', result.message)], components: [row] };
}

function renderLeaveResult(result) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
  if (!result.success) return { embeds: [embeds.failure('Leave Crew', result.message)], components: [row] };
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
  renderKickPanel,
  renderDisbandConfirm,
  renderLeaveConfirm,
  renderCrewCreateResult,
  renderCrewJoinResult,
  renderLeaveResult,
  renderKickResult,
};
