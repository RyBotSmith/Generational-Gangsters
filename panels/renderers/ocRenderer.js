// ─────────────────────────────────────────────
//  ocRenderer.js  —  Embed builders for OC panels.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, formatDuration, relativeTimestamp } = require('../../utils/helpers');
const { OC_TYPES, RANKS } = require('../../data/constants');

// ── Shared nav ────────────────────────────────

function backToOcRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_oc').setLabel('⬅ OC').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_crew').setLabel('👥 Crew').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
}

// ── OC hub — pick a mission type ──────────────

/**
 * Show all OC types with cooldown states and rank locks.
 * @param {object} player
 * @param {{ [ocTypeId]: { onCooldown, nextAvailableMs } }} cooldowns
 */
function renderOcHub(player, cooldowns) {
  const { getRankIndex } = require('../../utils/helpers');
  const rIdx = getRankIndex(player.xp ?? 0, RANKS);

  const lines = Object.values(OC_TYPES).map(oc => {
    const locked  = rIdx < oc.minRank;
    const cd      = cooldowns[oc.id];

    if (locked) {
      return `🔒 **${oc.name}** — requires rank **${RANKS[oc.minRank].name}**`;
    }
    if (cd?.onCooldown) {
      return `⏳ **${oc.name}** — ready ${relativeTimestamp(cd.nextAvailableMs)}`;
    }
    return `✅ **${oc.name}** — ${oc.minPlayers}–${oc.maxPlayers} players`;
  });

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🎯 Organised Crime')
    .setDescription(
      'Run co-op missions with your crew for big payouts.\n\n' +
      lines.join('\n')
    )
    .setFooter({ text: 'Create a lobby and share the code with your crew.' });

  const availableOcs = Object.values(OC_TYPES).filter(oc => {
    return rIdx >= oc.minRank && !cooldowns[oc.id]?.onCooldown;
  });

  const rows = [];

  if (availableOcs.length > 0) {
    // Up to 5 buttons per row — OC_TYPES has 4 so one row is fine
    const btns = availableOcs.map(oc =>
      new ButtonBuilder()
        .setCustomId(`panel_oc_create_${oc.id}`)
        .setLabel(`🎯 ${oc.name}`)
        .setStyle(ButtonStyle.Primary)
    );
    rows.push(new ActionRowBuilder().addComponents(...btns.slice(0, 5)));
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_oc_join').setLabel('🔑 Join Lobby').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_crew').setLabel('👥 Crew').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

// ── Lobby view (shown to all members) ─────────

/**
 * Render the live lobby state.
 * @param {object} lobby
 * @param {string} viewerId  — discordId of the person viewing
 */
function renderLobbyView(lobby, viewerId) {
  const ocType    = OC_TYPES[lobby.ocTypeId];
  const members   = Object.values(lobby.members);
  const isLeader  = lobby.leaderId === viewerId;
  const viewer    = lobby.members[viewerId];
  const isExpired = Date.now() > lobby.expiresAt;

  const memberLines = members.map(m => {
    const readyIcon = m.ready ? '✅' : '🔴';
    const crown     = m.discordId === lobby.leaderId ? ' 👑' : '';
    return `${readyIcon} **${m.username}**${crown}`;
  });

  const embed = embeds.base(embeds.COLOURS.purple)
    .setTitle(`🎯 ${ocType.name} — Lobby \`${lobby.lobbyId}\``)
    .setDescription(memberLines.join('\n'))
    .addFields(
      { name: '👥 Players',  value: `${members.length}/${ocType.maxPlayers}`, inline: true },
      { name: '💰 Payout',   value: `${formatCash(ocType.cashRange[0])}–${formatCash(ocType.cashRange[1])}`, inline: true },
      { name: '📊 Success',  value: `${Math.round(ocType.successRate * 100)}%`, inline: true },
      { name: '🕐 Expires',  value: relativeTimestamp(lobby.expiresAt), inline: true }
    )
    .setFooter({ text: `Share code: ${lobby.lobbyId}` });

  if (isExpired) {
    embed.setDescription('⚠️ This lobby has expired.');
    return { embeds: [embed], components: [backToOcRow()] };
  }

  const rows = [];
  const allReady   = members.every(m => m.discordId === lobby.leaderId || m.ready);
  const canStart   = isLeader && members.length >= ocType.minPlayers && allReady;
  const viewerReady = viewer?.ready ?? false;

  if (isLeader) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`panel_oc_start_${lobby.lobbyId}`)
          .setLabel('🚀 Start OC')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!canStart),
        new ButtonBuilder()
          .setCustomId(`panel_oc_cancel_${lobby.lobbyId}`)
          .setLabel('❌ Cancel Lobby')
          .setStyle(ButtonStyle.Danger)
      )
    );

    // Show kick buttons if there are non-leader members (up to 4 buttons per row)
    const nonLeaderMembers = members.filter(m => m.discordId !== lobby.leaderId);
    if (nonLeaderMembers.length > 0) {
      const kickBtns = nonLeaderMembers.slice(0, 4).map(m =>
        new ButtonBuilder()
          .setCustomId(`panel_oc_kick_${lobby.lobbyId}_${m.discordId}`)
          .setLabel(`Kick ${m.username}`)
          .setStyle(ButtonStyle.Secondary)
      );
      rows.push(new ActionRowBuilder().addComponents(...kickBtns));
    }
  } else {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`panel_oc_ready_${lobby.lobbyId}`)
          .setLabel(viewerReady ? '🔴 Unready' : '✅ Ready Up')
          .setStyle(viewerReady ? ButtonStyle.Secondary : ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`panel_oc_leave_${lobby.lobbyId}`)
          .setLabel('🚪 Leave')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`panel_oc_refresh_${lobby.lobbyId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_oc').setLabel('⬅ OC').setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

// ── Join prompt ───────────────────────────────

function renderJoinPrompt() {
  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🔑 Join OC Lobby')
    .setDescription('Enter the 8-character lobby code shared by the leader.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('modal_oc_join')
      .setLabel('🔑 Enter Code')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_oc')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Lobby created ─────────────────────────────

function renderLobbyCreated(result) {
  const { lobby, ocType } = result.data;

  const embed = embeds.success(
    `${ocType.name} Lobby Created`,
    `Share this code with your crew:\n\n# \`${lobby.lobbyId}\`\n\n` +
    `They can join via the OC panel → Join Lobby.\n\n` +
    `**Players needed:** ${ocType.minPlayers}–${ocType.maxPlayers}\n` +
    `**Lobby expires:** ${relativeTimestamp(lobby.expiresAt)}`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel_oc_lobby_${lobby.lobbyId}`)
      .setLabel('👁 View Lobby')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_oc')
      .setLabel('⬅ OC')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── OC result ─────────────────────────────────

/**
 * Render the outcome of a completed OC.
 * @param {object} result  — from ocService.startOC()
 */
function renderOcResult(result) {
  const { outcome, ocType, memberResults, perCash, perXp, jailSeconds } = result.data;

  let embed;

  if (outcome === 'success') {
    const lines = memberResults.map(m =>
      `✅ **${m.username}** — ${formatCash(m.cashEarned)} | ${m.xpGained} XP`
    );
    embed = embeds.base(embeds.COLOURS.success)
      .setTitle(`🎯 ${ocType.name} — Success!`)
      .setDescription(lines.join('\n'))
      .addFields(
        { name: '💰 Per Member', value: formatCash(perCash), inline: true },
        { name: '✨ XP Each',    value: `${perXp} XP`,       inline: true }
      );

  } else if (outcome === 'critical_fail') {
    const lines = memberResults.map(m => `🚔 **${m.username}** — Arrested`);
    embed = embeds.base(embeds.COLOURS.warning)
      .setTitle(`🎯 ${ocType.name} — Critical Failure!`)
      .setDescription(
        `The whole crew got caught.\n\n` + lines.join('\n')
      )
      .addFields({ name: '⏳ Jail Time', value: formatDuration(jailSeconds), inline: true });

  } else {
    const lines = memberResults.map(m => `❌ **${m.username}**`);
    embed = embeds.base(embeds.COLOURS.neutral)
      .setTitle(`🎯 ${ocType.name} — Failed`)
      .setDescription(
        `The crew escaped empty-handed.\n\n` + lines.join('\n')
      );
  }

  return { embeds: [embed], components: [backToOcRow()] };
}

// ── Error / info states ───────────────────────

function renderOcError(message) {
  return {
    embeds: [embeds.failure('OC', message)],
    components: [backToOcRow()],
  };
}

module.exports = {
  renderOcHub,
  renderLobbyView,
  renderJoinPrompt,
  renderLobbyCreated,
  renderOcResult,
  renderOcError,
};
