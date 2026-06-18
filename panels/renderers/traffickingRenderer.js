// ─────────────────────────────────────────────
//  traffickingRenderer.js  —  Embed builders for trafficking.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds     = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');

const BUY_PRESETS = [1, 5, 10, 25];

// ── Trafficking home ──────────────────────────

function renderTraffickingHome() {
  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🚬 Trafficking')
    .setDescription(
      `Move product between states for serious profit.\n\n` +
      `**How it works:**\n` +
      `• **Buy** product in one state\n` +
      `• **Travel** to a different state\n` +
      `• **Sell** for profit — prices vary daily\n\n` +
      `⚠️ **Never sell where you bought** — instant bust, stock seized, 5 min jail.\n\n` +
      `Capacity increases with upgrades and businesses.`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_traffic_booze')
      .setLabel('🍺 Booze')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_traffic_drugs')
      .setLabel('💊 Drugs')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Booze panel ───────────────────────────────

function renderBoozePanel(data) {
  const { player, statePrices, unlockedBooze, boozeCapacity, boozeCarried, inventory } = data;
  const booze = inventory.booze ?? {};
  const boughtInState = booze.boughtInState;
  const sameState = boughtInState && boughtInState === player.state;
  const boozeCooldownUntil = player.cooldowns?.booze_buy ?? 0;
  const onBuyCooldown = Date.now() < boozeCooldownUntil;

  // Calculate current sell value of held stock
  let stockValue = 0;
  unlockedBooze.forEach(p => {
    const owned = booze[p.id] ?? 0;
    const sellPrice = statePrices?.booze?.[p.id]?.sell ?? 0;
    stockValue += owned * sellPrice;
  });

  const lines = unlockedBooze.map(p => {
    const prices = statePrices?.booze?.[p.id];
    const owned  = booze[p.id] ?? 0;
    return `**${p.name}** — Buy: **${formatCash(prices?.buy ?? '?')}** | Sell: **${formatCash(prices?.sell ?? '?')}** | Owned: **${owned}**`;
  });

  let desc = `📍 **${player.state}** — Today's prices\n\n${lines.join('\n')}\n\n`;
  desc += `🧳 Capacity: **${boozeCarried}/${boozeCapacity}**`;
  if (boughtInState) desc += ` | Bought in: **${boughtInState}**`;
  if (boozeCarried > 0) desc += ` | Stock value here: **${formatCash(stockValue)}**`;
  if (sameState) desc += `\n⚠️ **Selling here will get you busted!** Travel first.`;
  if (onBuyCooldown) desc += `\n⏳ Buy cooldown active — can buy again <t:${Math.floor(boozeCooldownUntil / 1000)}:R>`;

  const embed = embeds.base(embeds.COLOURS.info)
    .setTitle('🍺 Booze Trafficking')
    .setDescription(desc);

  const rows = [];

  // Buy buttons for each product
  for (const product of unlockedBooze) {
    const prices  = statePrices?.booze?.[product.id];
    const space   = boozeCapacity - boozeCarried;
    const canBuy  = space > 0 && (player.cash ?? 0) >= (prices?.buy ?? 0);
    const row     = new ActionRowBuilder();

    BUY_PRESETS.forEach(qty => {
      const cost = (prices?.buy ?? 0) * qty;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`panel_traffic_buy_${product.id}_${qty}`)
          .setLabel(`Buy ${qty} ${product.name} (${formatCash(cost)})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(onBuyCooldown || !canBuy || qty > space || (player.cash ?? 0) < cost)
      );
    });

    rows.push(row);
  }

  // Sell + back row
  const sellRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_traffic_sell_booze')
      .setLabel(`💰 Sell All Booze (${boozeCarried} units)`)
      .setStyle(sameState ? ButtonStyle.Danger : ButtonStyle.Primary)
      .setDisabled(boozeCarried <= 0),
    new ButtonBuilder()
      .setCustomId('panel_traffic')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(sellRow);

  return { embeds: [embed], components: rows };
}

// ── Drugs panel ───────────────────────────────

function renderDrugsPanel(data) {
  const { player, statePrices, unlockedDrugs, drugCapacity, drugsCarried, inventory } = data;
  const drugs = inventory.drugs ?? {};
  const boughtInState = drugs.boughtInState;
  const sameState = boughtInState && boughtInState === player.state;
  const drugCooldownUntil = player.cooldowns?.drug_buy ?? 0;
  const onBuyCooldown = Date.now() < drugCooldownUntil;

  // No unlocks yet
  if (unlockedDrugs.length === 0) {
    const embed = embeds.base(embeds.COLOURS.warning)
      .setTitle('💊 Drug Trafficking')
      .setDescription(
        `*The back-alley contacts won't even look at you yet.*\n\n` +
        `Keep your head down, pull jobs, build a rep.\n` +
        `When the time is right, the right doors will open.`
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_traffic').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  // Calculate stock value at current state prices
  let stockValue = 0;
  unlockedDrugs.forEach(p => {
    const owned = drugs[p.id] ?? 0;
    const sellPrice = statePrices?.drugs?.[p.id]?.sell ?? 0;
    stockValue += owned * sellPrice;
  });

  const lines = unlockedDrugs.map(p => {
    const prices = statePrices?.drugs?.[p.id];
    const owned  = drugs[p.id] ?? 0;
    return `**${p.name}** — Buy: **${formatCash(prices?.buy ?? '?')}** | Sell: **${formatCash(prices?.sell ?? '?')}** | Owned: **${owned}**`;
  });

  let desc = `📍 **${player.state}** — Today's prices\n\n${lines.join('\n')}\n\n`;
  desc += `🧳 Capacity: **${drugsCarried}/${drugCapacity}**`;
  if (boughtInState) desc += ` | Bought in: **${boughtInState}**`;
  if (drugsCarried > 0) desc += ` | Stock value here: **${formatCash(stockValue)}**`;
  if (sameState) desc += `\n⚠️ **Selling here will get you busted!** Travel first.`;
  if (onBuyCooldown) desc += `\n⏳ Buy cooldown active — can buy again <t:${Math.floor(drugCooldownUntil / 1000)}:R>`;

  const embed = embeds.base(embeds.COLOURS.warning)
    .setTitle('💊 Drug Trafficking')
    .setDescription(desc);

  const rows = [];

  for (const product of unlockedDrugs) {
    const prices  = statePrices?.drugs?.[product.id];
    const space   = drugCapacity - drugsCarried;
    const row     = new ActionRowBuilder();

    BUY_PRESETS.forEach(qty => {
      const cost = (prices?.buy ?? 0) * qty;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`panel_traffic_buy_${product.id}_${qty}`)
          .setLabel(`Buy ${qty} ${product.name} (${formatCash(cost)})`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(onBuyCooldown || qty > space || (player.cash ?? 0) < cost)
      );
    });

    rows.push(row);
  }

  const sellRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_traffic_sell_drugs')
      .setLabel(`💰 Sell All Drugs (${drugsCarried} units)`)
      .setStyle(sameState ? ButtonStyle.Danger : ButtonStyle.Primary)
      .setDisabled(drugsCarried <= 0),
    new ButtonBuilder()
      .setCustomId('panel_traffic')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(sellRow);

  return { embeds: [embed], components: rows };
}

// ── Result renderer ───────────────────────────

function renderTraffickingResult(result, backTo = 'panel_traffic') {
  const embed = result.success
    ? embeds.success('Trafficking', result.message)
    : embeds.failure('Trafficking', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(backTo)
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  renderTraffickingHome,
  renderBoozePanel,
  renderDrugsPanel,
  renderTraffickingResult,
};
