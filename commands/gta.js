// ─────────────────────────────────────────────
//  commands/gta.js  —  /gta slash command.
//  Rule: Parse options → call service → done.
//  NO game logic. NO embed building.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const gtaService       = require('../services/gtaService');
const crewRepository   = require('../repositories/crewRepository');
const playerRepository = require('../repositories/playerRepository');
const {
  renderGtaHome,
  renderGtaAttemptResult,
} = require('../panels/renderers/gtaRenderer');
const embeds = require('../utils/embeds');

// Inline cooldown helper — avoids importing from service (would be fine, but keeping clean)
function buildCdState(player) {
  const lastUsed    = player.cooldowns?.gta ?? null;
  const cooldownMs  = 300 * 1000;
  const nextMs      = lastUsed ? lastUsed + cooldownMs : 0;
  const remainingMs = Math.max(0, nextMs - Date.now());
  return { onCooldown: remainingMs > 0, cooldownRemainingMs: remainingMs, nextAvailableMs: nextMs };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gta')
    .setDescription('Steal a car, then melt it for bullets or sell it for cash.')
    .addStringOption(opt =>
      opt
        .setName('action')
        .setDescription('steal (default) — open the GTA panel')
        .addChoices({ name: 'Steal', value: 'steal' })
        .setRequired(false)
    ),

  async execute(interaction) {
    const serverId  = interaction.guildId;
    const discordId = interaction.user.id;
    const action    = interaction.options.getString('action') ?? 'panel';

    await interaction.deferReply({ ephemeral: true });

    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return interaction.editReply({
        embeds: [embeds.error('No player found. Use /start to create your character.')],
      });
    }

    // No specific action — show GTA panel
    if (action === 'panel' || action !== 'steal') {
      const cdState      = buildCdState(player);
      const unlockedCars = gtaService.getUnlockedCars(player);
      return interaction.editReply(renderGtaHome(cdState, unlockedCars));
    }

    // steal action — attempt immediately
    const crew = player.crewId
      ? await crewRepository.getCrew(serverId, player.crewId)
      : null;

    const result = await gtaService.attemptGTA(serverId, discordId, crew);
    return interaction.editReply(renderGtaAttemptResult(result));
  },
};
