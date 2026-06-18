// ─────────────────────────────────────────────
//  shopPanel.js  —  Routes panel_shop_* interactions.
//  Rule: NO game logic. NO DB calls beyond repository.
//  Defer → call service → render result.
// ─────────────────────────────────────────────

const shopService      = require('../services/shopService');
const shopRepository   = require('../repositories/shopRepository');
const playerRepository = require('../repositories/playerRepository');
const { WEAPONS, ARMOUR, VEHICLES, MEDICAL_ITEMS } = require('../data/constants');
const {
  renderShopHome,
  renderItemList,
  renderBuyResult,
  renderSellResult,
  renderSellConfirm,
} = require('./renderers/shopRenderer');
const embeds = require('../utils/embeds');

function safeFollowUp(interaction, payload) {
  return interaction.followUp({ ...payload, ephemeral: true }).catch(() => {});
}

function getItemDef(id) {
  return WEAPONS[id] ?? ARMOUR[id] ?? VEHICLES[id] ?? MEDICAL_ITEMS[id] ?? null;
}

async function handle(interaction) {
  const { customId } = interaction;
  const serverId     = interaction.guildId;
  const discordId    = interaction.user.id;

  // ── panel_shop (root) ─────────────────────
  if (customId === 'panel_shop' || customId === 'panelm_shop') {
    await interaction.deferUpdate();
    const result = await shopService.getShopForPlayer(serverId, discordId);
    if (!result.success) {
      return safeFollowUp(interaction, { embeds: [embeds.error(result.message)] });
    }
    const { state, shop, playerCash } = result.data;
    return interaction.editReply(renderShopHome(state, shop, playerCash));
  }

  // ── panel_shop_weapons ────────────────────
  if (customId === 'panel_shop_weapons') {
    await interaction.deferUpdate();
    const player    = await playerRepository.getPlayer(serverId, discordId);
    const stateShop = await shopRepository.getStateShop(serverId, player.state);
    return interaction.editReply(renderItemList('weapons', stateShop.weapons, player.cash ?? 0));
  }

  // ── panel_shop_armour ─────────────────────
  if (customId === 'panel_shop_armour') {
    await interaction.deferUpdate();
    const player    = await playerRepository.getPlayer(serverId, discordId);
    const stateShop = await shopRepository.getStateShop(serverId, player.state);
    return interaction.editReply(renderItemList('armour', stateShop.armour, player.cash ?? 0));
  }

  // ── panel_shop_headwear ───────────────────
  if (customId === 'panel_shop_headwear') {
    await interaction.deferUpdate();
    const player    = await playerRepository.getPlayer(serverId, discordId);
    const stateShop = await shopRepository.getStateShop(serverId, player.state);
    return interaction.editReply(renderItemList('headwear', stateShop.headwear, player.cash ?? 0));
  }

  // ── panel_shop_vehicles ───────────────────
  if (customId === 'panel_shop_vehicles') {
    await interaction.deferUpdate();
    const player    = await playerRepository.getPlayer(serverId, discordId);
    const stateShop = await shopRepository.getStateShop(serverId, player.state);
    return interaction.editReply(renderItemList('vehicles', stateShop.vehicles, player.cash ?? 0));
  }

  // ── panel_shop_consumables ────────────────
  if (customId === 'panel_shop_consumables') {
    await interaction.deferUpdate();
    const player    = await playerRepository.getPlayer(serverId, discordId);
    const stateShop = await shopRepository.getStateShop(serverId, player.state);
    return interaction.editReply(renderItemList('consumables', stateShop.consumables, player.cash ?? 0));
  }

  // ── panel_shop_buy_{itemId} ───────────────
  if (customId.startsWith('panel_shop_buy_')) {
    const itemId = customId.replace('panel_shop_buy_', '');
    await interaction.deferUpdate();
    const result = await shopService.buyItem(serverId, discordId, itemId);
    return interaction.editReply(renderBuyResult(result));
  }

  // ── panel_shop_sell_{category}_{itemId}_{index} ──
  // index = -1 means equipped, >= 0 means owned array index
  if (customId.startsWith('panel_shop_sell_') && !customId.startsWith('panel_shop_sell_confirm_')) {
    const parts    = customId.replace('panel_shop_sell_', '').split('_');
    const category = parts[0];
    const index    = parseInt(parts[parts.length - 1]);
    const itemId   = parts.slice(1, parts.length - 1).join('_');
    await interaction.deferUpdate();

    // If selling equipped item, show confirmation first
    if (index === -1) {
      const def       = getItemDef(itemId);
      const sellPrice = Math.floor((def?.cost ?? 0) * 0.5);
      return interaction.editReply(renderSellConfirm(itemId, def?.name ?? itemId, sellPrice, category));
    }

    const result = await shopService.sellItem(serverId, discordId, itemId, category, index);
    return interaction.editReply(renderSellResult(result));
  }

  // ── panel_shop_sell_confirm_{category}_{itemId} ──
  if (customId.startsWith('panel_shop_sell_confirm_')) {
    const rest     = customId.replace('panel_shop_sell_confirm_', '');
    const sepIdx   = rest.indexOf('_');
    const category = rest.slice(0, sepIdx);
    const itemId   = rest.slice(sepIdx + 1);
    await interaction.deferUpdate();
    const result = await shopService.sellItem(serverId, discordId, itemId, category, -1);
    return interaction.editReply(renderSellResult(result));
  }

  console.warn('[shopPanel] Unhandled customId:', customId);
}

async function handleModal(interaction) {
  console.warn('[shopPanel] Unexpected modal:', interaction.customId);
}

async function handleSelect(interaction) {
  console.warn('[shopPanel] Unexpected select:', interaction.customId);
}

module.exports = { handle, handleModal, handleSelect };
