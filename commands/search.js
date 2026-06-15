// ─────────────────────────────────────────────
//  commands/search.js  —  /search slash command.
//  Rule: Parse options → call service → done.
//  NO game logic. NO embed building.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const combatService    = require('../services/combatService');
const playerRepository = require('../repositories/playerRepository');
const {
  renderSearchPanel,
  renderSearchDispatched,
} = require('../panels/renderers/combatRenderer');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for intel on a player or their bodyguards.')
    .addUserOption(opt =>
      opt
        .setName('target')
        .setDescription('Player to search (leave blank to browse)')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt
        .setName('bodyguard_slot')
        .setDescription('Search a specific bodyguard slot (1-4) instead of the player')
        .setRequired(false)
        .addChoices(
          { name: 'Slot 1', value: 1 },
          { name: 'Slot 2', value: 2 },
          { name: 'Slot 3', value: 3 },
          { name: 'Slot 4', value: 4 },
        )
    ),

  async execute(interaction) {
    const serverId  = interaction.guildId;
    const discordId = interaction.user.id;
    const targetUser = interaction.options.getUser('target');
    const bgSlot      = interaction.options.getInteger('bodyguard_slot');

    await interaction.deferReply({ ephemeral: true });

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return interaction.editReply({
        embeds: [embeds.error('No player found. Use /start to create your character.')],
      });
    }

    // No target — show the search dropdown panel
    if (!targetUser) {
      const candidates = await getSearchCandidates(serverId, discordId, player);
      const activeSearches = combatService.getActiveSearchesView(player);
      return interaction.editReply(renderSearchPanel(candidates, activeSearches));
    }

    if (targetUser.id === discordId) {
      return interaction.editReply({ embeds: [embeds.error('You cannot search yourself.')] });
    }

    const type = bgSlot ? 'bodyguard' : 'player';
    const result = await combatService.search(serverId, discordId, targetUser.id, type, bgSlot ?? null);

    if (!result.success) {
      return interaction.editReply({ embeds: [embeds.failure('Search Failed', result.message)] });
    }

    return interaction.editReply(renderSearchDispatched(result));
  },
};

// ── Local helper — mirrors combatPanel's candidate builder ──
async function getSearchCandidates(serverId, discordId, player) {
  const candidates = new Map();

  for (const h of combatService.getIntelHistory(player)) {
    if (h.targetId === discordId) continue;
    if (!candidates.has(h.targetId)) {
      candidates.set(h.targetId, { discordId: h.targetId, username: h.targetName, bodyguards: {} });
    }
  }

  for (const s of combatService.getActiveSearchesView(player)) {
    if (s.targetId === discordId) continue;
    if (!candidates.has(s.targetId)) {
      candidates.set(s.targetId, { discordId: s.targetId, username: s.targetName, bodyguards: {} });
    }
  }

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
      }
    }
  } catch {
    // best-effort
  }

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
