// ─────────────────────────────────────────────
//  ocRenderer.js  —  Embed builders for OC panels.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, formatDuration, relativeTimestamp } = require('../../utils/helpers');
const { OC_TYPES, RANKS } = require('../../data/constants');

function backRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_oc').setLabel('⬅ OC').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
}

// ── OC hub ────────────────────────────────────

/**
 * @param {object} player
 * @param {{ [ocTypeId]: { onCooldown, nextAvailableMs } }} cooldowns
 * @param {object|null} activeLobby  — player's current open lobby if any
 */
function renderOcHub(player, cooldowns, activeLobby = null) {
  const { getRankIndex } = require('../../utils/helpers');
  const rIdx = getRankIndex(player.xp ?? 0, RANKS);

  const lines = Object.values(OC_TYPES).map(oc => {
    const locked = rIdx < oc.minRank;
    const cd     = cooldowns[oc.id];
    if (locked)         return `🔒 **${oc.name}** — requires rank **${RANKS[oc.minRank].name}**`;
    if (cd?.onCooldown) return `⏳ **${oc.name}** — ready ${relativeTimestamp(cd.nextAvailableMs)}`;
    return `✅ **${oc.name}** — ${oc.minPlayers}–${oc.maxPlayers} players · ${formatCash(oc.cashRange[0])}–${formatCash(oc.cashRange[1])}`;
  });

  let description = 'Co-op missions. Split the payout equally.\n\n' + lines.join('\n');

  // If player has an active lobby, surface it prominently
  if (activeLobby) {
    const ocType      = OC_TYPES[activeLobby.ocTypeId];
    const memberCount = Object.keys(activeLobby.members ?? {}).length;
    description = `⚠️ **You have an active lobby** — ${ocType?.name} (${memberCount}/${ocType?.maxPlayers} players)\n` +
      `Expires ${relativeTimestamp(activeLobby.expiresAt)}\n\n` + description;
  }

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🎯 Organised Crime')
    .setDescription(description);

  const available = Object.values(OC_TYPES).filter(oc =>
    rIdx >= oc.minRank && !cooldowns[oc.id]?.onCooldown
  );

  const rows = [];

  // If active lobby — show resume button first
  if (activeLobby) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`panel_oc_lobby_${activeLobby.lobbyId}`)
        .setLabel('👁 Resume My Lobby')
        .setStyle(ButtonStyle.Success)
    ));
  }

  if (available.length > 0 && !activeLobby) {
    rows.push(new ActionRowBuilder().addComponents(
      ...available.slice(0, 5).map(oc =>
        new ButtonBuilder()
          .setCustomId(`panel_oc_create_${oc.id}`)
          .setLabel(`🎯 ${oc.name}`)
          .setStyle(ButtonStyle.Primary)
      )
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_oc_join').setLabel('🔑 Join with Code').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  ));

  return { embeds: [embed], components: rows };
}

// ── Lobby created ─────────────────────────────

/**
 * Shown right after creating a lobby.
 * Gives the leader the join code and share options.
 */
function renderLobbyCreated(result) {
  const { lobby, ocType } = result.data;

  const embed = embeds.base(embeds.COLOURS.purple)
    .setTitle(`🎯 ${ocType.name} — Lobby Ready`)
    .setDescription(
      `Share this code with players:\n\n` +
      `\`\`\`${lobby.lobbyId}\`\`\`\n` +
      `**${ocType.minPlayers}–${ocType.maxPlayers} players** · ` +
      `**${Math.round(ocType.successRate * 100)}%** success\n` +
      `💰 **${formatCash(ocType.cashRange[0])}–${formatCash(ocType.cashRange[1])}** split equally\n` +
      `⏳ Expires ${relativeTimestamp(lobby.expiresAt)}\n\n` +
      `Post the link publicly so players can join with one click, or DM your crew.`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel_oc_post_${lobby.lobbyId}`)
      .setLabel('📢 Post Join Link')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`panel_oc_dmcrew_${lobby.lobbyId}`)
      .setLabel('📨 DM My Crew')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`panel_oc_lobby_${lobby.lobbyId}`)
      .setLabel('👁 View Lobby')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Public join embed (posted to channel, NOT ephemeral) ──

/**
 * Non-ephemeral embed posted to the channel.
 * Players click Join directly from here.
 */
function renderPublicJoinEmbed(lobby, ocType, leaderName) {
  const memberCount = Object.keys(lobby.members ?? {}).length;

  const embed = embeds.base(embeds.COLOURS.purple)
    .setTitle(`🎯 ${ocType.name} — Looking for Players`)
    .setDescription(
      `**${leaderName}** is organising a **${ocType.name}**.\n\n` +
      `👥 **${memberCount}/${ocType.maxPlayers}** joined\n` +
      `💰 **${formatCash(ocType.cashRange[0])}–${formatCash(ocType.cashRange[1])}** split equally\n` +
      `📊 **${Math.round(ocType.successRate * 100)}%** success rate\n` +
      `⏳ Expires ${relativeTimestamp(lobby.expiresAt)}\n\n` +
      `Join code: \`${lobby.lobbyId}\`\n` +
      `Click **Join** if you're free (not jailed, dead, or travelling).`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel_oc_quickjoin_${lobby.lobbyId}`)
      .setLabel('🎯 Join')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`panel_oc_lobby_${lobby.lobbyId}`)
      .setLabel('👁 View Lobby')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Lobby view ────────────────────────────────

function renderLobbyView(lobby, viewerId) {
  const ocType    = OC_TYPES[lobby.ocTypeId];
  const members   = Object.values(lobby.members ?? {});
  const isLeader  = lobby.leaderId === viewerId;
  const viewer    = lobby.members[viewerId];
  const isExpired = Date.now() > lobby.expiresAt;

  const memberLines = members.map(m => {
    const ready = m.ready ? '✅' : '🔴';
    const crown = m.discordId === lobby.leaderId ? ' 👑' : '';
    return `${ready} **${m.username}**${crown}`;
  });

  const embed = embeds.base(embeds.COLOURS.purple)
    .setTitle(`🎯 ${ocType.name}`)
    .setDescription(isExpired ? '⚠️ This lobby has expired.' : memberLines.join('\n') || 'No members yet.')
    .addFields(
      { name: '👥 Players', value: `${members.length}/${ocType.maxPlayers}`, inline: true },
      { name: '💰 Payout',  value: `${formatCash(ocType.cashRange[0])}–${formatCash(ocType.cashRange[1])}`, inline: true },
      { name: '📊 Success', value: `${Math.round(ocType.successRate * 100)}%`, inline: true },
      { name: '⏳ Expires', value: relativeTimestamp(lobby.expiresAt), inline: true },
      { name: '🔑 Code',    value: `\`${lobby.lobbyId}\``, inline: true }
    );

  if (isExpired) return { embeds: [embed], components: [backRow()] };

  const allReady    = members.every(m => m.discordId === lobby.leaderId || m.ready);
  const canStart    = isLeader && members.length >= ocType.minPlayers && allReady;
  const viewerReady = viewer?.ready ?? false;
  const rows        = [];

  if (isLeader) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`panel_oc_start_${lobby.lobbyId}`)
        .setLabel('🚀 Start OC')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canStart),
      new ButtonBuilder()
        .setCustomId(`panel_oc_post_${lobby.lobbyId}`)
        .setLabel('📢 Post Link Again')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`panel_oc_dmcrew_${lobby.lobbyId}`)
        .setLabel('📨 DM Crew')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`panel_oc_cancel_${lobby.lobbyId}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Danger)
    ));

    const nonLeaders = members.filter(m => m.discordId !== lobby.leaderId);
    if (nonLeaders.length > 0) {
      rows.push(new ActionRowBuilder().addComponents(
        ...nonLeaders.slice(0, 4).map(m =>
          new ButtonBuilder()
            .setCustomId(`panel_oc_kick_${lobby.lobbyId}_${m.discordId}`)
            .setLabel(`Kick ${m.username}`)
            .setStyle(ButtonStyle.Secondary)
        )
      ));
    }
  } else {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`panel_oc_ready_${lobby.lobbyId}`)
        .setLabel(viewerReady ? '🔴 Unready' : '✅ Ready Up')
        .setStyle(viewerReady ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`panel_oc_leave_${lobby.lobbyId}`)
        .setLabel('🚪 Leave')
        .setStyle(ButtonStyle.Danger)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`panel_oc_refresh_${lobby.lobbyId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_oc').setLabel('⬅ OC').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  ));

  return { embeds: [embed], components: rows };
}

// ── Join prompt ───────────────────────────────

function renderJoinPrompt() {
  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🔑 Join OC Lobby')
    .setDescription('Enter the lobby code, or click **Join** on the public post in the channel.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('modal_oc_join').setLabel('🔑 Enter Code').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_oc').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── OC result ─────────────────────────────────

function renderOcResult(result) {
  const { outcome, ocType, memberResults, perCash, perXp, jailSeconds } = result.data;
  let embed;

  if (outcome === 'success') {
    const lines = memberResults.map(m => `✅ **${m.username}** — ${formatCash(m.cashEarned)} | ${m.xpGained} XP`);
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
      .setDescription(`The whole crew got caught.\n\n${lines.join('\n')}`)
      .addFields({ name: '⏳ Jail Time', value: formatDuration(jailSeconds), inline: true });
  } else {
    const lines = memberResults.map(m => `❌ **${m.username}**`);
    embed = embeds.base(embeds.COLOURS.neutral)
      .setTitle(`🎯 ${ocType.name} — Failed`)
      .setDescription(`Escaped empty-handed.\n\n${lines.join('\n')}`);
  }

  return { embeds: [embed], components: [backRow()] };
}

function renderOcError(message) {
  return { embeds: [embeds.failure('OC', message)], components: [backRow()] };
}

module.exports = {
  renderOcHub,
  renderLobbyCreated,
  renderPublicJoinEmbed,
  renderLobbyView,
  renderJoinPrompt,
  renderOcResult,
  renderOcError,
};
