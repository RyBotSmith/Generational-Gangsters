// ─────────────────────────────────────────────
//  commands/shoot.js  —  /shoot slash command.
//  Rule: Parse options → call service → done.
//  NO game logic. NO embed building.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const combatService    = require('../services/combatService');
const witness          = require('../services/witness');
const playerRepository = require('../repositories/playerRepository');
const {
  renderShootPanel,
  renderShootResult,
} = require('../panels/renderers/combatRenderer');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shoot')
    .setDescription('Shoot a player you have intel on.')
    .addUserOption(opt =>
      opt
        .setName('target')
        .setDescription('Player to shoot (leave blank to browse your intel)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const serverId  = interaction.guildId;
    const discordId = interaction.user.id;
    const targetUser = interaction.options.getUser('target');

    await interaction.deferReply({ ephemeral: true });

    // ALWAYS fetch fresh — never reuse a player object across calls.
    const player = await playerRepository.getPlayer(serverId, discordId);
    if (!player) {
      return interaction.editReply({
        embeds: [embeds.error('No player found. Use /start to create your character.')],
      });
    }

    // No target — show the shoot dropdown panel using fresh intel
    if (!targetUser) {
      const intelHistory = combatService.getIntelHistory(player);
      return interaction.editReply(renderShootPanel(intelHistory, player));
    }

    if (targetUser.id === discordId) {
      return interaction.editReply({ embeds: [embeds.error('You cannot shoot yourself.')] });
    }

    const result = await combatService.shoot(serverId, discordId, targetUser.id);
    await interaction.editReply(renderShootResult(result));

    if (result.success && (result.data.outcome === 'kill_player' || result.data.outcome === 'kill_bodyguard')) {
      const attackerRankIdx = combatService.rankIndex(player);

      witness.broadcastWitness(interaction.client, serverId, {
        eventType: result.data.outcome,
        attackerId: discordId,
        attackerName: player.username,
        victimId: result.data.victimId,
        victimName: result.data.victimName,
        state: player.state,
        attackerRankIdx,
      }); // fire-and-forget — not awaited
    }
  },
};
