// ─────────────────────────────────────────────
//  crimeRenderer.js  —  Embed builders for crime results.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds   = require('../../utils/embeds');
const { formatCash, formatDuration, relativeTimestamp } = require('../../utils/helpers');

// ── Crime home panel ──────────────────────────

/**
 * Render the crime home panel.
 * Shows all crimes with their status (locked / cooldown / ready),
 * a single Commit button, and a Home button.
 *
 * @param {object[]} crimeList        — from crimeService.getAllCrimes(player)
 * @param {object[]} allCrimesDefs    — full CRIMES list including rank-locked ones
 * @param {number}   playerRankIndex  — current rank index for lock display
 */
function renderCrimeList(crimeList, allCrimesDefs = [], playerRankIndex = 0) {
  const readyCount = crimeList.filter(c => !c.onCooldown).length;

  // Build status lines for unlocked crimes
  const unlockedLines = crimeList.map(({ crime, onCooldown, cooldownRemainingMs }) => {
    if (onCooldown) {
      return `⏳ **${crime.name}** — ${formatDuration(Math.ceil(cooldownRemainingMs / 1000))}`;
    }
    return `✅ **${crime.name}**`;
  });

  // Rank-locked crimes (not in crimeList)
  const unlockedIds = new Set(crimeList.map(c => c.crime.id));
  const lockedLines = allCrimesDefs
    .filter(c => !unlockedIds.has(c.id))
    .map(c => `🔒 **${c.name}**`);

  const allLines = [...unlockedLines, ...lockedLines];

  const desc = allLines.length
    ? allLines.join('\n')
    : 'No crimes available.';

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🕵️ Crimes')
    .setDescription(desc)
    .setFooter({ text: `${readyCount} crime${readyCount !== 1 ? 's' : ''} ready to commit` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_crime_commit')
      .setLabel('⚡ Commit Crimes')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(readyCount === 0),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Commit all crimes result ──────────────────

/**
 * Render the combined result of commitAllCrimes().
 *
 * @param {{ results: object[], jailed: boolean }} commitResult
 */
function renderCommitResult(commitResult) {
  const { results, jailed } = commitResult;

  const lines = results.map(result => {
    // Cooldown skip
    if (result.skipped && result.onCooldown) {
      return `⏳ **${result.data.crimeName}** — on cooldown`;
    }

    // Status blocks (jail / hospital / travelling)
    if (result.data?.jailed === true && !result.data?.crimeName) {
      return `🔒 ${result.message}`;
    }
    if (result.data?.hospitalized) return `💀 ${result.message}`;
    if (result.data?.travelling)   return `✈️ ${result.message}`;

    const name = result.data?.crimeName ?? '?';

    if (result.success) {
      const { cashEarned, xpGained, bulletsEarned } = result.data;
      let line = `✅ **${name}** — 💰 ${formatCash(cashEarned)} | ✨ ${xpGained} XP`;
      if (bulletsEarned > 0) line += ` | 🔫 ${bulletsEarned} bullets`;
      return line;
    }

    // Failed — jailed
    if (result.data?.jailed && result.data?.jailedUntil) {
      return `🚔 **${name}** — Arrested`;
    }

    // Failed — escaped
    if (result.data?.jailed === false) {
      return `❌ **${name}** — Failed, escaped arrest`;
    }

    return `❌ **${name}** — ${result.message}`;
  });

  // If jailed, find the arrest result and build the flavour paragraph
  let arrestBlurb = null;
  if (jailed) {
    const arrestResult = results.find(r => r.data?.jailed && r.data?.jailedUntil);
    if (arrestResult) {
      const secondsRemaining = Math.ceil((arrestResult.data.jailedUntil - Date.now()) / 1000);
      const duration = formatDuration(secondsRemaining);
      arrestBlurb = `You were caught in the act and hauled off by the feds. You've been sentenced to **${duration}** in jail.`;
    }
  }

  const description = [
    lines.join('\n') || 'Nothing to report.',
    arrestBlurb,
  ].filter(Boolean).join('\n\n');

  const colour = jailed
    ? embeds.COLOURS.warning
    : results.some(r => r.success)
      ? embeds.COLOURS.success
      : embeds.COLOURS.neutral;

  const title = jailed
    ? '🚔 Busted!'
    : results.some(r => r.success)
      ? '🕵️ Crime Spree'
      : '🕵️ Nothing Doing';

  const embed = embeds.base(colour)
    .setTitle(title)
    .setDescription(description);

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

module.exports = { renderCrimeList, renderCommitResult };
