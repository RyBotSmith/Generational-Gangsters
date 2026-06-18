// ─────────────────────────────────────────────
//  crimeRenderer.js  —  Embed builders for crime results.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds   = require('../../utils/embeds');
const { formatCash, formatDuration, relativeTimestamp } = require('../../utils/helpers');
const { WEAPONS, VEHICLES, PRESTIGE_CRIME_BONUS } = require('../../data/constants');

// ── Crime home panel ──────────────────────────

/**
 * @param {object[]} crimeList
 * @param {object[]} allCrimesDefs
 * @param {number}   playerRankIndex
 * @param {object}   player           — for buff display
 */
function renderCrimeList(crimeList, allCrimesDefs = [], playerRankIndex = 0, player = null) {
  const readyCount = crimeList.filter(c => !c.onCooldown).length;

  const unlockedLines = crimeList.map(({ crime, onCooldown, cooldownRemainingMs }) => {
    if (onCooldown) {
      return `⏳ **${crime.name}** — ${formatDuration(Math.ceil(cooldownRemainingMs / 1000))}`;
    }
    return `✅ **${crime.name}**`;
  });

  const unlockedIds = new Set(crimeList.map(c => c.crime.id));
  const lockedLines = allCrimesDefs
    .filter(c => !unlockedIds.has(c.id))
    .map(c => `🔒 **${c.name}**`);

  const allLines = [...unlockedLines, ...lockedLines];

  // ── Buff display ──────────────────────────
  const buffParts = [];
  if (player) {
    const inv        = player.inventory ?? {};
    const weaponDef  = inv.equippedWeapon  ? WEAPONS[inv.equippedWeapon.id]   : null;
    const vehicleDef = inv.equippedVehicle ? VEHICLES[inv.equippedVehicle.id] : null;
    const allocs     = (player.prestigeAllocations ?? []).filter(a => a === 'crime');

    if (weaponDef?.crimeBonus)  buffParts.push(`🔫 +${Math.round(weaponDef.crimeBonus * 100)}% (weapon)`);
    if (vehicleDef?.crimeBonus) buffParts.push(`🚗 +${Math.round(vehicleDef.crimeBonus * 100)}% (vehicle)`);
    if (allocs.length > 0)      buffParts.push(`🌟 +${allocs.length * 10}% (prestige)`);
  }

  const desc = allLines.length ? allLines.join('\n') : 'No crimes available.';

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🕵️ Crimes')
    .setDescription(desc)
    .setFooter({ text: `${readyCount} crime${readyCount !== 1 ? 's' : ''} ready to commit` });

  if (buffParts.length > 0) {
    embed.addFields({ name: '⚡ Active Buffs', value: buffParts.join(' · '), inline: false });
  }

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

  // ── Pre-attempt status blocks (single result, no crimes ran) ──
  const only = results[0];
  if (results.length === 1 && !only.skipped) {
    if (only.data?.jailed === true && !only.data?.crimeName) {
      const secondsRemaining = Math.ceil((only.data.jailedUntil - Date.now()) / 1000);
      const duration = formatDuration(secondsRemaining);
      const embed = embeds.base(embeds.COLOURS.warning)
        .setTitle('🔒 Already in Jail')
        .setDescription(
          `You are already in jail.\n\nYou were previously caught in the act and hauled off by the feds. You've been sentenced to **${duration}** remaining in jail.`
        );
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
    if (only.data?.hospitalized) {
      const embed = embeds.base(embeds.COLOURS.dark)
        .setTitle('💀 You\'re in Hospital')
        .setDescription(only.message);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_home')
          .setLabel('🏠 Home')
          .setStyle(ButtonStyle.Secondary)
      );
      return { embeds: [embed], components: [row] };
    }
    if (only.data?.travelling) {
      const embed = embeds.base(embeds.COLOURS.info)
        .setTitle('✈️ You\'re Travelling')
        .setDescription(only.message);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_home')
          .setLabel('🏠 Home')
          .setStyle(ButtonStyle.Secondary)
      );
      return { embeds: [embed], components: [row] };
    }
  }

  const lines = results.map(result => {
    // Cooldown skip
    if (result.skipped && result.onCooldown) {
      return `⏳ **${result.data.crimeName}** — on cooldown`;
    }

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
