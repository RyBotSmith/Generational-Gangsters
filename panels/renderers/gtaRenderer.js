// ─────────────────────────────────────────────
//  gtaRenderer.js  —  Embed builders for GTA results.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, relativeTimestamp } = require('../../utils/helpers');

// ── GTA home panel ────────────────────────────

/**
 * Render the GTA home panel — shows cooldown state and steal button.
 * @param {{ onCooldown, nextAvailableMs }} cdState
 * @param {object[]} unlockedCars  — from gtaService.getUnlockedCars(player)
 */
function renderGtaHome(cdState, unlockedCars, garageData = {}) {
  const topCar  = unlockedCars[unlockedCars.length - 1];
  const botCar  = unlockedCars[0];
  const { garage = [], garageMax = 5 } = garageData;

  const desc = cdState.onCooldown
    ? `🕐 Next steal available ${relativeTimestamp(cdState.nextAvailableMs)}`
    : '🚗 Ready to steal! Your unlocked car pool:\n' +
      `• **Lowest:** ${botCar?.name ?? '—'}\n` +
      `• **Highest:** ${topCar?.name ?? '—'}\n` +
      `• **Pool size:** ${unlockedCars.length} cars`;

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🚗 Grand Theft Auto')
    .setDescription(desc)
    .addFields({ name: '🅿️ Garage', value: `${garage.length}/${garageMax} slots used`, inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_gta_steal')
      .setLabel('🔑 Steal a Car')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(cdState.onCooldown),
    new ButtonBuilder()
      .setCustomId('panel_gta_garage')
      .setLabel(`🅿️ Garage (${garage.length})`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── GTA steal result ──────────────────────────

/**
 * Render the "car stolen — choose outcome" panel.
 * carId is encoded in the melt/sell button customIds.
 */
function renderGtaStolen(result) {
  const { car, xpGained, garageFull, garageCount, garageMax } = result.data;

  const garageStr = garageFull
    ? `🚫 Garage full (${garageCount}/${garageMax})`
    : `🅿️ Store (${garageCount}/${garageMax} used)`;

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle(`🚗 ${car.name} Stolen!`)
    .setDescription(
      `You swiped a **${car.name}**!\n✨ **+${xpGained} XP**\n\nWhat do you want to do with it?`
    )
    .addFields(
      { name: '🔫 Melt', value: `**${car.meltBullets} bullets**`, inline: true },
      { name: '💰 Sell', value: `**${formatCash(car.value)}**`,   inline: true },
      { name: '🅿️ Garage', value: garageStr, inline: true }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel_gta_melt_${car.id}`)
      .setLabel(`🔫 Melt (${car.meltBullets} bullets)`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`panel_gta_sell_${car.id}`)
      .setLabel(`💰 Sell (${formatCash(car.value)})`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`panel_gta_store_${car.id}`)
      .setLabel('🅿️ Store')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(garageFull),
    new ButtonBuilder()
      .setCustomId('panel_gta')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render failed GTA — arrested.
 */
function renderGtaJailed(result) {
  const { jailedUntil } = result.data;

  const embed = embeds.jailed(jailedUntil)
    .setDescription(`Caught stealing a car.\nReleased ${relativeTimestamp(jailedUntil)}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_gta')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render failed GTA — escaped.
 */
function renderGtaFailed() {
  const embed = embeds.failure('GTA Failed', 'You failed to steal the car, but managed to escape.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_gta')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render GTA cooldown block.
 */
function renderGtaCooldown(nextAvailableMs) {
  const embed = embeds.cooldown('steal a car', nextAvailableMs);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_gta')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render melt result.
 */
function renderGtaMelted(result) {
  const { car, bulletsEarned } = result.data;

  const embed = embeds.success(
    `${car.name} Melted`,
    `🔫 **+${bulletsEarned} bullets** from scrapping the **${car.name}**.`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_gta')
      .setLabel('⬅ GTA')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render sell result.
 */
function renderGtaSold(result) {
  const { car, cashEarned } = result.data;

  const embed = embeds.success(
    `${car.name} Sold`,
    `💰 **+${formatCash(cashEarned)}** from selling the **${car.name}**.`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_gta')
      .setLabel('⬅ GTA')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Route a GTA steal result to the correct embed.
 */
function renderGtaAttemptResult(result) {
  if (!result.success) {
    if (result.data?.jailed && result.data?.jailedUntil) return renderGtaJailed(result);
    if (result.data?.onCooldown) return renderGtaCooldown(result.data.nextAvailableMs);
    if (result.data?.jailed === false) return renderGtaFailed();
    return {
      embeds: [embeds.error(result.message)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panel_gta')
            .setLabel('⬅ Back')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }
  return renderGtaStolen(result);
}

/**
 * Render store result.
 */
function renderGtaStored(result) {
  const { car, garageCount, garageMax } = result.data;

  const embed = embeds.success(
    `${car.name} Stored`,
    `🅿️ **${car.name}** added to your garage.\n${garageCount}/${garageMax} slots used.`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_gta_garage')
      .setLabel('🅿️ View Garage')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_gta')
      .setLabel('🚗 Steal Again')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render the garage overview panel.
 * @param {{ cars, garage, garageMax, totalValue, totalBullets }} garageData
 */
function renderGarageHome(garageData) {
  const { cars, garage, garageMax, totalValue, totalBullets } = garageData;

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🅿️ Garage')
    .setDescription(
      `**${garage.length}/${garageMax} slots used**\n\n` +
      (cars.length === 0
        ? '*Your garage is empty.*'
        : `📦 **${cars.length} cars** stored\n` +
          `💰 Total sell value: **${formatCash(totalValue)}**\n` +
          `🔫 Total melt bullets: **${totalBullets}**\n\n` +
          `Select a car to view details, or use the bulk actions below.`)
    );

  const rows = [];

  if (cars.length > 0) {
    // Car select dropdown
    const { StringSelectMenuBuilder } = require('discord.js');
    const options = cars.slice(0, 25).map((car, i) => ({
      label: car.name,
      description: `Sell: ${formatCash(car.value)} • Melt: ${car.meltBullets} bullets`,
      value: `garage_car:${car.id}:${i}`,
    }));

    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_garage_car')
          .setPlaceholder('Select a car to manage...')
          .addOptions(options)
      )
    );

    // Bulk actions
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_gta_melt_all')
          .setLabel(`🔫 Melt All (${totalBullets} bullets)`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('panel_gta_sell_all')
          .setLabel(`💰 Sell All (${formatCash(totalValue)})`)
          .setStyle(ButtonStyle.Success)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_gta')
        .setLabel('⬅ Back')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

/**
 * Render single car view in garage (after selecting from dropdown).
 * @param {object} car   — CARS entry
 * @param {number} index — index in garage array for action routing
 */
function renderGarageCarView(car, index) {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle(`🚗 ${car.name}`)
    .setDescription(
      `What do you want to do with your **${car.name}**?`
    )
    .addFields(
      { name: '💰 Sell Price',    value: formatCash(car.value),       inline: true },
      { name: '🔫 Melt Bullets',  value: `${car.meltBullets} bullets`, inline: true }
    );

  // Placeholder image — will be replaced with real URLs later
  // embed.setThumbnail(`https://your-cdn.com/cars/${car.id}.png`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel_gta_garage_melt_${car.id}_${index}`)
      .setLabel(`🔫 Melt (${car.meltBullets} bullets)`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`panel_gta_garage_sell_${car.id}_${index}`)
      .setLabel(`💰 Sell (${formatCash(car.value)})`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('panel_gta_garage')
      .setLabel('⬅ Back to Garage')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  renderGtaHome,
  renderGtaAttemptResult,
  renderGtaMelted,
  renderGtaSold,
  renderGtaStored,
  renderGarageHome,
  renderGarageCarView,
};
