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
function renderGtaHome(cdState, unlockedCars) {
  const topCar  = unlockedCars[unlockedCars.length - 1];
  const botCar  = unlockedCars[0];

  const desc = cdState.onCooldown
    ? `🕐 Next steal available ${relativeTimestamp(cdState.nextAvailableMs)}`
    : '🚗 Ready to steal! Your unlocked car pool:\n' +
      `• **Lowest:** ${botCar?.name ?? '—'}\n` +
      `• **Highest:** ${topCar?.name ?? '—'}\n` +
      `• **Pool size:** ${unlockedCars.length} cars`;

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🚗 Grand Theft Auto')
    .setDescription(desc);

  const stealBtn = new ButtonBuilder()
    .setCustomId('panel_gta_steal')
    .setLabel('🔑 Steal a Car')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(cdState.onCooldown);

  const row = new ActionRowBuilder().addComponents(
    stealBtn,
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
  const { car, xpGained } = result.data;

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle(`🚗 ${car.name} Stolen!`)
    .setDescription(
      `You swiped a **${car.name}**!\n✨ **+${xpGained} XP**\n\nWhat do you want to do with it?`
    )
    .addFields(
      { name: '🔫 Melt', value: `**${car.meltBullets} bullets**`, inline: true },
      { name: '💰 Sell', value: `**${formatCash(car.value)}**`, inline: true }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel_gta_melt_${car.id}`)
      .setLabel(`🔫 Melt (${car.meltBullets} bullets)`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`panel_gta_sell_${car.id}`)
      .setLabel(`💰 Sell (${formatCash(car.value)})`)
      .setStyle(ButtonStyle.Success)
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
      .setCustomId('panel_gta_steal')
      .setLabel('🔄 Try Again')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true), // on cooldown now
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
      .setLabel('🚗 Steal Again')
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
      .setLabel('🚗 Steal Again')
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

module.exports = {
  renderGtaHome,
  renderGtaAttemptResult,
  renderGtaMelted,
  renderGtaSold,
};
