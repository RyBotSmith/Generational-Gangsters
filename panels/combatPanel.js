// ─────────────────────────────────────────────
//  combatPanel.js  —  Routes panel_combat_* interactions.
//  Rule: NO game logic (beyond reading values for dispatch). NO direct game-rule math.
//  Defer → call service → render result.
//
//  KEY BUG NOTES (do not regress):
//  - Search dropdown values use `search_player:` / `search_bg:` prefixes.
//  - Shoot dropdown values use `shoot_player:` / `shoot_bg:` prefixes.
//    These prefixes guarantee uniqueness even if both dropdowns ever appear
//    on the same message.
//  - Intel for the shoot dropdown is ALWAYS re-fetched fresh via
//    combatService.getIntelHistory(freshPlayer) right before rendering —
//    never reuse a player object read earlier in the interaction.
//  - collectResults() STRIPS completed activeSearches entries. It is called
//    exactly ONCE per "Collect" click.
// ─────────────────────────────────────────────

const combatService    = require('../services/combatService');
const witness          = require('../services/witness');
const playerRepository = require('../repositories/playerRepository');
const {
  renderCombatHome,
  renderSearchPanel,
  renderSearchDispatched,
  renderShootPanel,
  renderShootResult,
  renderCollectResults,
  renderIntelHistory,
  renderBodyguardsPanel,
  renderBodyguardPurchaseResult,
} = require('./renderers/combatRenderer');
const embeds = require('../utils/embeds');

// ── Helpers ───────────────────────────────────

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

/**
 * Build the "search candidates" list — other alive players the searching
 * player could target, including their known bodyguard slot occupancy.
 *
 * Sourced from search history + a basic leaderboard scan so the dropdown
 * has reasonable options even with no prior intel.
 */
async function getSearchCandidates(serverId, discordId, player) {
  const candidates = new Map();

  // From intel history — players already known
  for (const h of combatService.getIntelHistory(player)) {
    if (h.targetId === discordId) continue;
    if (!candidates.has(h.targetId)) {
      candidates.set(h.targetId, { discordId: h.targetId, username: h.targetName, bodyguards: {} });
    }
  }

  // From active searches — players currently being searched
  for (const s of combatService.getActiveSearchesView(player)) {
    if (s.targetId === discordId) continue;
    if (!candidates.has(s.targetId)) {
      candidates.set(s.targetId, { discordId: s.targetId, username: s.targetName, bodyguards: {} });
    }
  }

  // Broaden with a leaderboard sample so new players have targets too
  try {
    const lb = await playerRepository.getLeaderboard(serverId, 'xp', 25);
    for (const p of lb) {
      if (p.discordId === discordId) continue;
      if (!candidates.has(p.discordId)) {
        candidates.set(p.discordId, {
          discordId: p.discordId,
          username: p.username ?? p.discordId,
          bodyguards: p.bodyguards ?? {},
        });
      } else {
        // Fill in bodyguard data if we now have it from a live read
        const existing = candidates.get(p.discordId);
        if (!existing.bodyguards || Object.keys(existing.bodyguards).length === 0) {
          existing.bodyguards = p.bodyguards ?? {};
        }
      }
    }
  } catch {
    // Leaderboard lookup is best-effort
  }

  // For candidates sourced only from intel/active-searches, fetch live
  // bodyguard slot data so the BG search sub-options are accurate.
  for (const [id, c] of candidates) {
    if (!c.bodyguards || Object.keys(c.bodyguards).length === 0) {
      try {
        const live = await playerRepository.getPlayer(serverId, id);
        if (live) c.bodyguards = live.bodyguards ?? {};
      } catch {
        // ignore
      }
    }
  }

  return Array.from(candidates.values());
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  // ── panel_combat (root) ───────────────────
  if (customId === 'panel_combat' || customId === 'panelm_combat') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found. Use /start to create your character.')] });
    }

    const intelHistory  = combatService.getIntelHistory(player);
    const activeSearches = combatService.getActiveSearchesView(player);
    return interaction.editReply(renderCombatHome(player, intelHistory, activeSearches));
  }

  // ── panel_combat_search — show search dropdown ──
  if (customId === 'panel_combat_search') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    }

    const candidates    = await getSearchCandidates(serverId, discordId, player);
    const activeSearches = combatService.getActiveSearchesView(player);
    return interaction.editReply(renderSearchPanel(candidates, activeSearches));
  }

  // ── panel_combat_shoot — show shoot dropdown ──
  if (customId === 'panel_combat_shoot') {
    await interaction.deferUpdate();

    // CRITICAL: re-fetch the player fresh here — never use a player object
    // that may have been read earlier in this interaction chain.
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    }

    const intelHistory = combatService.getIntelHistory(player);
    return interaction.editReply(renderShootPanel(intelHistory, player));
  }

  // ── panel_combat_collect — collect completed searches ──
  if (customId === 'panel_combat_collect') {
    await interaction.deferUpdate();

    // collectResults() strips completed entries — call exactly once.
    const result = await combatService.collectResults(serverId, discordId);
    return interaction.editReply(renderCollectResults(result));
  }

  // ── panel_combat_intel — show intel history ──
  if (customId === 'panel_combat_intel') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    }

    const intelHistory = combatService.getIntelHistory(player);

    // Persist pruning if expired entries were dropped
    if (intelHistory.length !== (player.searchHistory ?? []).length) {
      await playerRepository.updatePlayer(serverId, discordId, { searchHistory: intelHistory });
    }

    return interaction.editReply(renderIntelHistory(intelHistory));
  }

  // ── panel_combat_bodyguards — show bodyguard management ──
  if (customId === 'panel_combat_bodyguards') {
    await interaction.deferUpdate();
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return safeFollowUp(interaction, { embeds: [embeds.error('No player found.')] });
    }

    return interaction.editReply(renderBodyguardsPanel(player));
  }

  // ── panel_combat_bg_buy_{slot} — hire/rebuy a bodyguard ──
  if (customId.startsWith('panel_combat_bg_buy_')) {
    const slot = customId.replace('panel_combat_bg_buy_', '');
    await interaction.deferUpdate();

    const result = await combatService.hireBodyguard(serverId, discordId, slot);
    return interaction.editReply(renderBodyguardPurchaseResult(result));
  }

  console.warn('[combatPanel] Unhandled customId:', customId);
}

// ── Select menu handler ────────────────────────

async function handleSelect(interaction) {
  const { customId } = interaction;
  const serverId  = interaction.guildId;
  const discordId = interaction.user.id;

  // ── select_combat_search — dispatch a search ──
  if (customId === 'select_combat_search') {
    await interaction.deferUpdate();

    const value = interaction.values[0];

    if (value.startsWith('search_bg:')) {
      // search_bg:{targetId}:{slot}
      const [, targetId, slotStr] = value.split(':');
      const result = await combatService.search(serverId, discordId, targetId, 'bodyguard', Number(slotStr));
      if (!result.success) {
        return interaction.editReply({
          embeds: [embeds.failure('Search Failed', result.message)],
          components: [],
        });
      }
      return interaction.editReply(renderSearchDispatched(result));
    }

    if (value.startsWith('search_player:')) {
      // search_player:{targetId}
      const [, targetId] = value.split(':');
      const result = await combatService.search(serverId, discordId, targetId, 'player');
      if (!result.success) {
        return interaction.editReply({
          embeds: [embeds.failure('Search Failed', result.message)],
          components: [],
        });
      }
      return interaction.editReply(renderSearchDispatched(result));
    }

    console.warn('[combatPanel] Unrecognised search select value:', value);
    return interaction.editReply({ embeds: [embeds.error('Unrecognised selection.')], components: [] });
  }

  // ── select_combat_shoot — fire a shot ──
  if (customId === 'select_combat_shoot') {
    await interaction.deferUpdate();

    const value = interaction.values[0];

    // Both shoot_player: and shoot_bg: route to the same shoot() call —
    // the service resolves bodyguard order itself from current live state.
    // The prefix only distinguishes dropdown option identity (per GDD bug note).
    let targetId;
    if (value.startsWith('shoot_bg:')) {
      [, targetId] = value.split(':'); // shoot_bg:{targetId}:{slot}
    } else if (value.startsWith('shoot_player:')) {
      [, targetId] = value.split(':'); // shoot_player:{targetId}
    } else {
      console.warn('[combatPanel] Unrecognised shoot select value:', value);
      return interaction.editReply({ embeds: [embeds.error('Unrecognised selection.')], components: [] });
    }

    const attackerBefore = await playerRepository.getPlayer(serverId, discordId);
    const result = await combatService.shoot(serverId, discordId, targetId);

    await interaction.editReply(renderShootResult(result));

    // ── Witness broadcast on kills / BG kills ──
    if (result.success && (result.data.outcome === 'kill_player' || result.data.outcome === 'kill_bodyguard')) {
      const attackerName = attackerBefore?.username ?? interaction.user.username;
      const attackerRankIdx = combatService.rankIndex(attackerBefore ?? {});
      const state = attackerBefore?.state;

      witness.broadcastWitness(interaction.client, serverId, {
        eventType: result.data.outcome,
        attackerId: discordId,
        attackerName,
        victimId: result.data.victimId,
        victimName: result.data.victimName,
        state,
        attackerRankIdx,
      }); // fire-and-forget — not awaited
    }

    return;
  }

  console.warn('[combatPanel] Unhandled select:', customId);
}

// No modals in combat panel currently
async function handleModal(interaction) {
  console.warn('[combatPanel] Unexpected modal:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
