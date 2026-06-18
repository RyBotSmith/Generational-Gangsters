// ─────────────────────────────────────────────
//  traffickingPanel.js  —  Routes panel_traffic_* interactions.
//  Rule: NO game logic. NO DB calls beyond repository.
//  Defer → call service → render result.
// ─────────────────────────────────────────────

const traffickingService = require('../services/traffickingService');
const {
  renderTraffickingHome,
  renderBoozePanel,
  renderDrugsPanel,
  renderTraffickingResult,
} = require('./renderers/traffickingRenderer');
const embeds = require('../utils/embeds');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

async function handle(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── panel_traffic (root) ──────────────────
  if (customId === 'panel_traffic' || customId === 'panelm_traffic') {
    await interaction.deferUpdate();
    return interaction.editReply(renderTraffickingHome());
  }

  // ── panel_traffic_booze ───────────────────
  if (customId === 'panel_traffic_booze') {
    await interaction.deferUpdate();
    const result = await traffickingService.getTraffickingState(serverId, discordId);
    if (!result.success) return safeFollowUp(interaction, { embeds: [embeds.error(result.message)] });
    return interaction.editReply(renderBoozePanel(result.data));
  }

  // ── panel_traffic_drugs ───────────────────
  if (customId === 'panel_traffic_drugs') {
    await interaction.deferUpdate();
    const result = await traffickingService.getTraffickingState(serverId, discordId);
    if (!result.success) return safeFollowUp(interaction, { embeds: [embeds.error(result.message)] });
    return interaction.editReply(renderDrugsPanel(result.data));
  }

  // ── panel_traffic_buy_{productId}_{qty} ───
  if (customId.startsWith('panel_traffic_buy_')) {
    const rest      = customId.replace('panel_traffic_buy_', '');
    const parts     = rest.split('_');
    const qty       = parseInt(parts[parts.length - 1], 10);
    const productId = parts.slice(0, parts.length - 1).join('_');
    await interaction.deferUpdate();

    const result = await traffickingService.buy(serverId, discordId, productId, qty);

    // Determine which panel to go back to
    const { PRODUCTS } = traffickingService;
    const isBooze = !!PRODUCTS.booze[productId];

    if (result.success) {
      const state = await traffickingService.getTraffickingState(serverId, discordId);
      return interaction.editReply(
        isBooze ? renderBoozePanel(state.data) : renderDrugsPanel(state.data)
      );
    }
    return interaction.editReply(
      renderTraffickingResult(result, isBooze ? 'panel_traffic_booze' : 'panel_traffic_drugs')
    );
  }

  // ── panel_traffic_sell_booze ──────────────
  if (customId === 'panel_traffic_sell_booze') {
    await interaction.deferUpdate();
    const result = await traffickingService.sell(serverId, discordId, 'booze');
    return interaction.editReply(renderTraffickingResult(result, 'panel_traffic_booze'));
  }

  // ── panel_traffic_sell_drugs ──────────────
  if (customId === 'panel_traffic_sell_drugs') {
    await interaction.deferUpdate();
    const result = await traffickingService.sell(serverId, discordId, 'drugs');
    return interaction.editReply(renderTraffickingResult(result, 'panel_traffic_drugs'));
  }

  console.warn('[traffickingPanel] Unhandled customId:', customId);
}

async function handleModal(interaction) {
  console.warn('[traffickingPanel] Unexpected modal:', interaction.customId);
}

async function handleSelect(interaction) {
  console.warn('[traffickingPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
