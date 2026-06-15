// ─────────────────────────────────────────────
//  combatRenderer.js  —  Embed builders for combat.
//  Rule: No game logic. No DB access. Embeds + components only.
// ─────────────────────────────────────────────

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const embeds = require('../../utils/embeds');
const { formatCash, formatDuration, relativeTimestamp } = require('../../utils/helpers');
const { BODYGUARD_COSTS, BODYGUARD_ATTACK_ORDER } = require('../../data/constants');

const BG_LABELS = {
  1: 'Basic Protection',
  2: 'Trained Enforcer',
  3: 'Elite Soldier',
  4: 'Legendary Hitman',
};

// ── Combat home panel ─────────────────────────

/**
 * Render the Combat home panel.
 * @param {object} player
 * @param {object[]} intelHistory  — from combatService.getIntelHistory(player)
 * @param {object[]} activeSearches — from combatService.getActiveSearchesView(player)
 */
function renderCombatHome(player, intelHistory = [], activeSearches = []) {
  const readyCount   = activeSearches.filter(s => s.ready).length;
  const pendingCount = activeSearches.length - readyCount;

  const desc = [
    `🔫 **Bullets:** ${(player.bullets ?? 0).toLocaleString('en-US')}`,
    `❤️ **Health:** ${player.health ?? 100}/100`,
    `📍 **State:** ${player.state ?? 'Unknown'}`,
    '',
    `🕵️ **Intel on file:** ${intelHistory.length}`,
    `📡 **Searches running:** ${pendingCount}` + (readyCount > 0 ? ` (**${readyCount} ready to collect!**)` : ''),
  ].join('\n');

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🔫 Combat')
    .setDescription(desc);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_combat_search')
      .setLabel('🕵️ Search')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_combat_shoot')
      .setLabel('🔫 Shoot')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(intelHistory.length === 0),
    new ButtonBuilder()
      .setCustomId('panel_combat_collect')
      .setLabel(`📥 Collect${readyCount > 0 ? ` (${readyCount})` : ''}`)
      .setStyle(readyCount > 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(activeSearches.length === 0)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_combat_intel')
      .setLabel('📋 Intel History')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_combat_bodyguards')
      .setLabel('🛡️ Bodyguards')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Search panel ───────────────────────────────

/**
 * Render the search dropdown panel.
 * Players are searchable directly; bodyguards are searchable via sub-options
 * using the `search_bg:` prefix to avoid collisions with shoot dropdowns.
 *
 * @param {object[]} candidates  — [{ discordId, username, bodyguards }]
 * @param {object[]} activeSearches
 */
function renderSearchPanel(candidates = [], activeSearches = []) {
  const embed = embeds.base(embeds.COLOURS.info)
    .setTitle('🕵️ Search for Intel')
    .setDescription(
      `**Player search:** $5,000 — 5 min — 100% success\n` +
      `**Bodyguard search:** $10,000 — 10 min — 100% success\n\n` +
      `Choose a target below. Intel expires **3 hours** after collection.`
    );

  if (candidates.length === 0) {
    embed.addFields({ name: 'No targets found', value: 'No other players are available to search right now.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const activeKeys = new Set(
    activeSearches.map(s => s.type === 'bodyguard' ? `bg:${s.targetId}:${s.bgSlot}` : `player:${s.targetId}`)
  );

  const options = [];

  for (const c of candidates.slice(0, 25)) {
    // Player search option
    const playerKey = `player:${c.discordId}`;
    if (!activeKeys.has(playerKey) && options.length < 25) {
      options.push({
        label: `${c.username}`.slice(0, 100),
        description: 'Search this player ($5,000 / 5 min)'.slice(0, 100),
        value: `search_player:${c.discordId}`,
      });
    }
  }

  // Bodyguard sub-options — use search_bg: prefix to avoid collision with shoot dropdown
  for (const c of candidates.slice(0, 25)) {
    for (const slot of BODYGUARD_ATTACK_ORDER) {
      const bgKey = `bg:${c.discordId}:${slot}`;
      if (activeKeys.has(bgKey)) continue;
      const has = c.bodyguards?.[slot];
      if (!has) continue; // only allow searching slots that exist (alive or dead — intel either way)
      if (options.length >= 25) break;
      options.push({
        label: `${c.username} — Slot ${slot} BG`.slice(0, 100),
        description: 'Search this bodyguard ($10,000 / 10 min)'.slice(0, 100),
        value: `search_bg:${c.discordId}:${slot}`,
      });
    }
    if (options.length >= 25) break;
  }

  const components = [];

  if (options.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('select_combat_search')
      .setPlaceholder('Choose a target to search...')
      .addOptions(options);

    components.push(new ActionRowBuilder().addComponents(select));
  } else {
    embed.addFields({ name: 'No new targets', value: 'You already have active searches on every available target.' });
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components };
}

// ── Search dispatched confirmation ────────────

function renderSearchDispatched(result) {
  const embed = embeds.success('Search Dispatched', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_combat_search').setLabel('🕵️ Search Another').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Shoot panel ────────────────────────────────

/**
 * Render the shoot dropdown panel.
 * Intel must be FRESHLY fetched (combatService.getIntelHistory) immediately
 * before calling this — never pass a stale player object's cached intel.
 *
 * @param {object[]} intelHistory  — fresh, non-expired intel entries
 * @param {object} player          — attacking player (for state comparison)
 */
function renderShootPanel(intelHistory = [], player) {
  const embed = embeds.base(embeds.COLOURS.failure)
    .setTitle('🔫 Choose a Target')
    .setDescription(
      `You must be in the **same state** as your target (or their bodyguard) to shoot.\n` +
      `Your location: **${player.state ?? 'Unknown'}**\n\n` +
      `Only targets with non-expired intel are shown.`
    );

  // Filter to players in the same state per their last-known intel
  const sameState = intelHistory.filter(h => {
    if (h.type === 'player') return h.intel?.state === player.state;
    return h.intel?.ownerState === player.state;
  });

  const usable = sameState.length > 0 ? sameState : intelHistory;

  if (usable.length === 0) {
    embed.addFields({ name: 'No Intel', value: 'Run a search first to gather intel on a target.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_combat_search').setLabel('🕵️ Search').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const options = [];

  for (const h of usable.slice(0, 25)) {
    if (h.type === 'player') {
      if (options.length >= 25) break;
      const status = h.intel?.alive === false ? '💀 Hospitalized' : `❤️ ${h.intel?.health ?? '?'} HP`;
      const inState = h.intel?.state === player.state ? '' : ' ⚠️ different state';
      options.push({
        label: `${h.targetName}`.slice(0, 100),
        description: `${status} • ${h.intel?.state ?? 'Unknown'}${inState}`.slice(0, 100),
        value: `shoot_player:${h.targetId}`,
      });
    } else if (h.type === 'bodyguard') {
      if (options.length >= 25) break;
      // Bodyguard option uses shoot_bg: prefix to avoid collision with player options.
      // Shooting still routes through shoot(targetId) — the service resolves the
      // current BG order itself, so this option is informational/navigational.
      const status = h.intel?.bgAlive ? `🛡️ Alive (${h.intel?.bgHp ?? 100} HP)` : '☠️ Dead';
      options.push({
        label: `${h.targetName} — Slot ${h.bgSlot} BG`.slice(0, 100),
        description: `${status} • ${h.intel?.ownerState ?? 'Unknown'}`.slice(0, 100),
        value: `shoot_bg:${h.targetId}:${h.bgSlot}`,
      });
    }
  }

  const components = [];

  if (options.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('select_combat_shoot')
      .setPlaceholder('Choose a target to shoot...')
      .addOptions(options);

    components.push(new ActionRowBuilder().addComponents(select));
  } else {
    embed.addFields({ name: 'No Targets', value: 'No usable intel — try searching again.' });
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_combat_search').setLabel('🕵️ Search').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components };
}

// ── Shoot results ──────────────────────────────

function renderDamageResult(result) {
  const { victimName, damage, newHp, bulletsUsed, bulletsRemaining, weaponBroke, armourBroke, headwearBroke } = result.data;

  let desc = `🎯 Hit **${victimName}** for **${damage} HP**.\n` +
             `❤️ Their HP: **${newHp}/100**\n` +
             `🔫 Bullets used: **${bulletsUsed}** (${bulletsRemaining} remaining)`;

  const notes = [];
  if (weaponBroke)   notes.push('⚠️ Your weapon broke from overuse!');
  if (armourBroke)   notes.push(`🛡️ ${victimName}'s armour was destroyed!`);
  if (headwearBroke) notes.push(`🪖 ${victimName}'s headwear was destroyed!`);
  if (notes.length) desc += `\n\n${notes.join('\n')}`;

  const embed = embeds.base(embeds.COLOURS.warning)
    .setTitle('🔫 Shot Fired')
    .setDescription(desc);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_combat_shoot').setLabel('🔫 Shoot Again').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderKillResult(result) {
  const {
    victimName, bulletsUsed, bulletsRemaining,
    cashStolen, bulletsStolen, hospitalizedUntil,
    weaponBroke, armourBroke, headwearBroke,
  } = result.data;

  let desc = `☠️ You **killed ${victimName}**!\n\n` +
             `💰 Looted: **${formatCash(cashStolen)}**\n` +
             `🔫 Looted: **${bulletsStolen} bullets**\n` +
             `🔫 Bullets used: **${bulletsUsed}** (${bulletsRemaining} remaining)\n\n` +
             `🏥 ${victimName} will be in hospital ${relativeTimestamp(hospitalizedUntil)}.`;

  const notes = [];
  if (weaponBroke)   notes.push('⚠️ Your weapon broke from overuse!');
  if (armourBroke)   notes.push(`🛡️ ${victimName}'s armour was destroyed!`);
  if (headwearBroke) notes.push(`🪖 ${victimName}'s headwear was destroyed!`);
  if (notes.length) desc += `\n\n${notes.join('\n')}`;

  const embed = embeds.base(embeds.COLOURS.success)
    .setTitle('💀 Target Eliminated')
    .setDescription(desc);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_combat_shoot').setLabel('🔫 Shoot Again').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function renderKillBodyguardResult(result) {
  const { bgName, bgSlot, victimName, bulletsUsed, bulletsRemaining, weaponBroke, remainingBodyguards } = result.data;

  let desc = `🛡️ You took down **${bgName}** (Slot ${bgSlot}) — one of **${victimName}**'s bodyguards!\n\n` +
             `🔫 Bullets used: **${bulletsUsed}** (${bulletsRemaining} remaining)`;

  desc += remainingBodyguards
    ? `\n\n${victimName} still has bodyguards protecting them.`
    : `\n\n${victimName} has no bodyguards left — they're exposed!`;

  if (weaponBroke) desc += '\n\n⚠️ Your weapon broke from overuse!';

  const embed = embeds.base(embeds.COLOURS.warning)
    .setTitle('🛡️ Bodyguard Down')
    .setDescription(desc);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_combat_shoot').setLabel('🔫 Shoot Again').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Route a shoot() result to the correct embed.
 */
function renderShootResult(result) {
  if (!result.success) {
    let desc = result.message;
    const embed = embeds.failure('Shot Failed', desc);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_combat_shoot').setLabel('⬅ Choose Another Target').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  switch (result.data.outcome) {
    case 'kill_player':    return renderKillResult(result);
    case 'kill_bodyguard': return renderKillBodyguardResult(result);
    case 'damage_player':  return renderDamageResult(result);
    default:
      return { embeds: [embeds.success('Shot Fired', result.message)], components: [] };
  }
}

// ── Collect results ────────────────────────────

function renderCollectResults(result) {
  const { collected, pending } = result.data;

  if (collected.length === 0) {
    const embed = embeds.info('Nothing to Collect', 'No completed searches are ready yet.');
    const desc = pending.length > 0
      ? `\n\n📡 **${pending.length}** search${pending.length === 1 ? '' : 'es'} still running.`
      : '';
    if (desc) embed.setDescription(embed.data.description + desc);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const lines = collected.map(c => {
    if (c.type === 'bodyguard') {
      const status = c.intel?.bgAlive ? `🛡️ Alive (${c.intel?.bgHp ?? 100} HP)` : '☠️ Dead';
      return `**${c.targetName}** — Slot ${c.bgSlot} Bodyguard: ${status}`;
    }
    const status = c.intel?.alive === false ? '💀 Hospitalized' : `❤️ ${c.intel?.health ?? '?'} HP`;
    return `**${c.targetName}** — ${c.intel?.rank ?? '?'} • ${status} • 📍 ${c.intel?.state ?? 'Unknown'}`;
  });

  const embed = embeds.success(
    `Collected ${collected.length} Report${collected.length === 1 ? '' : 's'}`,
    lines.join('\n')
  );

  if (pending.length > 0) {
    embed.addFields({ name: 'Still Running', value: `${pending.length} search${pending.length === 1 ? '' : 'es'} in progress.` });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_combat_shoot').setLabel('🔫 Shoot').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_combat_intel').setLabel('📋 Intel History').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Intel history ──────────────────────────────

function renderIntelHistory(intelHistory = []) {
  const embed = embeds.base(embeds.COLOURS.info).setTitle('📋 Intel History');

  if (intelHistory.length === 0) {
    embed.setDescription('No intel on file. Run a search to gather information on a target.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_combat_search').setLabel('🕵️ Search').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const lines = intelHistory
    .sort((a, b) => b.collectedAt - a.collectedAt)
    .map(h => {
      const expires = relativeTimestamp(h.expiresAt);
      if (h.type === 'bodyguard') {
        const status = h.intel?.bgAlive ? `🛡️ Alive (${h.intel?.bgHp ?? 100} HP)` : '☠️ Dead';
        return `**${h.targetName}** — Slot ${h.bgSlot} BG: ${status} • expires ${expires}`;
      }
      const status = h.intel?.alive === false ? '💀 Hospitalized' : `❤️ ${h.intel?.health ?? '?'} HP`;
      return `**${h.targetName}** — ${h.intel?.rank ?? '?'} • ${status} • 📍 ${h.intel?.state ?? 'Unknown'} • expires ${expires}`;
    });

  // Discord embed description limit ~4096 — chunk if needed (rare)
  let description = lines.join('\n');
  if (description.length > 4000) description = description.slice(0, 4000) + '\n…';

  embed.setDescription(description);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_combat_shoot').setLabel('🔫 Shoot').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('panel_combat_search').setLabel('🕵️ Search More').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Bodyguards panel ────────────────────────────

/**
 * Render the bodyguards management panel.
 * @param {object} player
 */
function renderBodyguardsPanel(player) {
  const bodyguards = player.bodyguards ?? {};

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🛡️ Your Bodyguards')
    .setDescription(
      'Bodyguards defend you in attack order: **Slot 4 → 3 → 2 → 1 → You**.\n' +
      'Attackers must kill them in that order before they can hit you.\n' +
      `You have **${formatCash(player.cash ?? 0)}** on hand.`
    );

  for (const slot of [4, 3, 2, 1]) {
    const bg = bodyguards[slot];
    const cost = BODYGUARD_COSTS[slot];
    const label = BG_LABELS[slot];

    let value;
    if (bg && bg.alive) {
      value = `**${bg.name}** — ❤️ ${bg.hp ?? 100}/100 HP\nStatus: ✅ Active`;
    } else if (bg && !bg.alive) {
      value = `**${bg.name}** — ☠️ Killed\nRebuy for **${formatCash(cost)}**`;
    } else {
      value = `*Empty slot*\nHire for **${formatCash(cost)}**`;
    }

    embed.addFields({ name: `Slot ${slot} — ${label}`, value, inline: false });
  }

  const rows = [];
  let row = new ActionRowBuilder();
  let count = 0;

  for (const slot of [1, 2, 3, 4]) {
    const bg = bodyguards[slot];
    const needsPurchase = !bg || !bg.alive;
    if (count > 0 && count % 4 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`panel_combat_bg_buy_${slot}`)
        .setLabel(`${needsPurchase ? 'Hire' : 'Rebuy'} Slot ${slot} (${formatCash(BODYGUARD_COSTS[slot])})`)
        .setStyle(needsPurchase ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!needsPurchase && bg?.alive)
    );
    count++;
  }
  rows.push(row);

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

function renderBodyguardPurchaseResult(result) {
  if (!result.success) {
    const embed = embeds.failure('Hire Failed', result.message);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_combat_bodyguards').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const { slot, bgName, cost } = result.data;
  const embed = embeds.success(
    'Bodyguard Hired',
    `You hired **${bgName}** for Slot ${slot} (${formatCash(cost)}). Full HP, ready to defend you.`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_combat_bodyguards').setLabel('🛡️ Bodyguards').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_combat').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  renderCombatHome,
  renderSearchPanel,
  renderSearchDispatched,
  renderShootPanel,
  renderShootResult,
  renderCollectResults,
  renderIntelHistory,
  renderBodyguardsPanel,
  renderBodyguardPurchaseResult,
};
