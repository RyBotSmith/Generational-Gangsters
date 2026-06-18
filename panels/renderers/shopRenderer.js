// ─────────────────────────────────────────────
//  shopRenderer.js  —  Embed builders for shop.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds  = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');
const { WEAPONS, ARMOUR, VEHICLES, MEDICAL_ITEMS } = require('../../data/constants');

// ── Shop home ─────────────────────────────────

/**
 * Render the shop home — category buttons for current state.
 * @param {string}   state
 * @param {object}   stateShop   — from shopRepository.getStateShop()
 * @param {number}   playerCash
 */
function renderShopHome(state, stateShop, playerCash) {
  const hasVehicles = stateShop.vehicles?.length > 0;
  const cash = typeof playerCash === 'number' ? playerCash : 0;

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle(`🛒 ${state} — Black Market`)
    .setDescription(
      `💰 **Your cash:** ${formatCash(cash)}\n\n` +
      `Stock refreshes every Monday. What are you looking for?`
    )
    .addFields(
      { name: '🔫 Weapons',     value: stateShop.weapons?.length  > 0 ? `${stateShop.weapons.length} available`  : 'None this week', inline: true },
      { name: '🚗 Vehicles',    value: hasVehicles ? `${stateShop.vehicles.length} available` : 'Not here this week', inline: true },
      { name: '\u200b',         value: '\u200b', inline: true }, // spacer
      { name: '🛡️ Armour',     value: stateShop.armour?.length   > 0 ? `${stateShop.armour.length} available`   : 'None this week', inline: true },
      { name: '🪖 Headwear',    value: stateShop.headwear?.length > 0 ? `${stateShop.headwear.length} available` : 'None this week', inline: true },
      { name: '💊 Consumables', value: '2 available', inline: true },
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_shop_weapons')
      .setLabel('🔫 Weapons')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!stateShop.weapons?.length),
    new ButtonBuilder()
      .setCustomId('panel_shop_armour')
      .setLabel('🛡️ Armour')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!stateShop.armour?.length),
    new ButtonBuilder()
      .setCustomId('panel_shop_headwear')
      .setLabel('🪖 Headwear')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!stateShop.headwear?.length),
    new ButtonBuilder()
      .setCustomId('panel_shop_vehicles')
      .setLabel('🚗 Vehicles')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasVehicles),
    new ButtonBuilder()
      .setCustomId('panel_shop_consumables')
      .setLabel('💊 Consumables')
      .setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Category panels ───────────────────────────

function renderItemList(category, itemIds, playerCash) {
  const titles = {
    weapons:     '🔫 Weapons',
    armour:      '🛡️ Armour',
    headwear:    '🪖 Headwear',
    vehicles:    '🚗 Vehicles',
    consumables: '💊 Consumables',
  };

  const lines = itemIds.map(id => {
    const def = WEAPONS[id] ?? ARMOUR[id] ?? VEHICLES[id] ?? MEDICAL_ITEMS[id];
    if (!def) return null;

    const cost      = def.cost ?? 0;
    const canAfford = playerCash >= cost;
    const sellPrice = Math.floor(cost * 0.5);

    let bonus = '';
    if (def.reduction)   bonus += ` • -${Math.round(def.reduction * 100)}% bullets`;
    if (def.crimeBonus)  bonus += ` • +${Math.round(def.crimeBonus * 100)}% crime`;
    if (def.gtaBonus)    bonus += ` • +${Math.round(def.gtaBonus   * 100)}% GTA`;
    if (def.armorBonus)  bonus += ` • +${Math.round(def.armorBonus * 100)}% armour`;
    if (def.hpRestore)   bonus += ` • +${def.hpRestore} HP`;

    return `${canAfford ? '✅' : '❌'} **${def.name}** — ${formatCash(def.cost)} (sell: ${formatCash(sellPrice)})${bonus}`;
  }).filter(Boolean);

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle(`🛒 ${titles[category] ?? category}`)
    .setDescription(
      `💰 **Your cash:** ${formatCash(playerCash)}\n\n` +
      (lines.join('\n') || 'Nothing available.')
    );

  // Buy buttons — max 5 per row
  const rows = [];
  let row = new ActionRowBuilder();
  let count = 0;

  for (const id of itemIds) {
    const def = WEAPONS[id] ?? ARMOUR[id] ?? VEHICLES[id] ?? MEDICAL_ITEMS[id];
    if (!def) continue;
    if (count > 0 && count % 4 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`panel_shop_buy_${id}`)
        .setLabel(`Buy ${def.name}`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(playerCash < (def.cost ?? 0))
    );
    count++;
  }
  if (count > 0) rows.push(row);

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_shop')
        .setLabel('⬅ Shop')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('panel_home')
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

// ── Buy / sell results ────────────────────────

function renderBuyResult(result) {
  if (!result.success) {
    const embed = embeds.failure('Purchase Failed', result.message);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_shop').setLabel('⬅ Shop').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const embed = embeds.success('Item Purchased', result.message);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_shop').setLabel('🛒 Keep Shopping').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function renderSellResult(result) {
  if (!result.success) {
    const embed = embeds.failure('Sale Failed', result.message);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_shop').setLabel('⬅ Shop').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const embed = embeds.success('Item Sold', result.message);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_shop').setLabel('🛒 Shop').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

/**
 * Confirm before selling an equipped item.
 */
function renderSellConfirm(itemId, itemName, sellPrice, category) {
  const embed = embeds.warning(
    'Sell Equipped Item?',
    `**${itemName}** is currently equipped. Selling it will unequip it.\n\nSell for **${formatCash(sellPrice)}**?`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel_shop_sell_confirm_${category}_${itemId}`)
      .setLabel(`✅ Sell for ${formatCash(sellPrice)}`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('panel_shop')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  renderShopHome,
  renderItemList,
  renderBuyResult,
  renderSellResult,
  renderSellConfirm,
};
