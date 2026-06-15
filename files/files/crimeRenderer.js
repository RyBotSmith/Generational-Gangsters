// ─────────────────────────────────────────────
//  crimeRenderer.js  —  Embed builders for crime results.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds   = require('../../utils/embeds');
const { formatCash, formatDuration, relativeTimestamp } = require('../../utils/helpers');

// ── Crime list panel ──────────────────────────

/**
 * Render the crime selection panel.
 * @param {object[]} crimeList  — from crimeService.getAllCrimes(player)
 * @returns {{ embeds, components }}
 */
function renderCrimeList(crimeList) {
  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🕵️ Choose Your Crime')
    .setDescription(
      crimeList.map(({ crime, onCooldown, cooldownRemainingMs }) => {
        const cooldownStr = onCooldown
          ? `⏳ ${formatDuration(Math.ceil(cooldownRemainingMs / 1000))}`
          : '✅ Ready';
        return `**${crime.name}** — CD: ${formatDuration(crime.cooldown)} | ${cooldownStr}`;
      }).join('\n') || 'No crimes unlocked yet.'
    );

  // Build buttons in rows of 5
  const rows = [];
  let row = new ActionRowBuilder();
  let count = 0;

  for (const { crime, onCooldown } of crimeList) {
    if (count > 0 && count % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`panel_crime_attempt_${crime.id}`)
        .setLabel(crime.name)
        .setStyle(onCooldown ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(onCooldown)
    );
    count++;
  }
  if (count > 0) rows.push(row);

  // Back to home button in its own row
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_home')
        .setLabel('⬅ Back')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

// ── Crime attempt result ──────────────────────

/**
 * Render a successful crime result.
 */
function renderCrimeSuccess(result) {
  const { crimeName, cashEarned, xpGained, bulletsEarned } = result.data;

  let desc = `💰 **+${formatCash(cashEarned)}**\n✨ **+${xpGained} XP**`;
  if (bulletsEarned > 0) desc += `\n🔫 **+${bulletsEarned} bullets**`;

  const embed = embeds.success(crimeName, desc);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crime')
      .setLabel('🕵️ Crimes')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render a failed crime — jailed.
 */
function renderCrimeJailed(result) {
  const { crimeName, jailedUntil } = result.data;

  const embed = embeds.jailed(jailedUntil)
    .setDescription(
      `Caught attempting **${crimeName}**.\nReleased ${relativeTimestamp(jailedUntil)}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crime')
      .setLabel('🕵️ Crimes')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render a failed crime — escaped without arrest.
 */
function renderCrimeFailed(result) {
  const { crimeName } = result.data;

  const embed = embeds.failure(crimeName, 'You failed, but avoided arrest this time.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crime')
      .setLabel('🔄 Try Again')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render a cooldown block.
 */
function renderCrimeCooldown(result) {
  const { nextAvailableMs } = result.data;

  const embed = embeds.cooldown('commit this crime', nextAvailableMs);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crime')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Route a crime service result to the correct embed.
 */
function renderCrimeResult(result) {
  if (!result.success) {
    if (result.data?.jailed && result.data?.jailedUntil) return renderCrimeJailed(result);
    if (result.data?.onCooldown)                          return renderCrimeCooldown(result);
    if (result.data?.jailed === false)                    return renderCrimeFailed(result);
    // Generic error (status block, unknown crime, etc.)
    return {
      embeds: [embeds.error(result.message)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panel_crime')
            .setLabel('⬅ Back')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }
  return renderCrimeSuccess(result);
}

module.exports = { renderCrimeList, renderCrimeResult };
