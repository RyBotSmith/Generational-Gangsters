// ─────────────────────────────────────────────
//  prestigeRenderer.js  —  Embed builders for prestige.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { PRESTIGE_MAX } = require('../../data/constants');

const PRESTIGE_COLOURS = [
  0x95a5a6, // 0 — grey
  0xf39c12, // 1 — gold
  0xe67e22, // 2 — orange
  0xe74c3c, // 3 — red
  0x9b59b6, // 4 — purple
  0x00d4ff, // 5 — electric blue
];

const PRESTIGE_STARS = ['', '⭐', '⭐⭐', '⭐⭐⭐', '💜⭐⭐⭐⭐', '💠⭐⭐⭐⭐⭐'];

// ── Prestige home panel ───────────────────────

function renderPrestigeHome(data) {
  const { player, currentPrestige, nextPrestige, eligible, reason, requiresChoice } = data;
  const colour = PRESTIGE_COLOURS[currentPrestige] ?? 0x95a5a6;

  const allocLines = (player.prestigeAllocations ?? []).map((a, i) =>
    `Prestige ${i + 1} — +10% **${a === 'crime' ? 'Crime' : 'GTA'}** success`
  );
  if (player.prestige4Perk) {
    allocLines.push(`Prestige 4 — **${player.prestige4Perk === 'cooldown' ? 'Cooldown Mastery' : 'Storage Empire'}**`);
  }
  if (player.prestige5Perk) {
    allocLines.push(`Prestige 5 — **${player.prestige5Perk === 'bullets' ? '10,000 Bullets' : '$5,000,000 Cash'}**`);
  }

  const embed = embeds.base(colour)
    .setTitle(`${PRESTIGE_STARS[currentPrestige] || '🌟'} Prestige`)
    .setDescription(
      currentPrestige === 0
        ? '*You haven\'t prestiged yet. Reach Rank 9 (Infamous Gangster) to begin.*'
        : `*You have walked this path before. Each reset makes you stronger.*`
    )
    .addFields(
      { name: '🌟 Current Prestige', value: `${currentPrestige}/${PRESTIGE_MAX}`, inline: true },
      { name: '✨ XP Required',      value: `1,000,000`,                          inline: true },
      { name: '✨ Your XP',          value: `${(player.xp ?? 0).toLocaleString()}`, inline: true },
    );

  if (allocLines.length > 0) {
    embed.addFields({ name: '📜 Your Prestige Perks', value: allocLines.join('\n'), inline: false });
  }

  // What resets
  embed.addFields({
    name: '⚠️ On Prestige',
    value: 'XP and rank reset to zero.\nAll upgrades reset (Bank Vault level kept).\nCash, bank, items and bodyguards are preserved.',
    inline: false,
  });

  // Next prestige preview
  if (currentPrestige < PRESTIGE_MAX) {
    let nextDesc = '';
    if (nextPrestige <= 3) {
      nextDesc = `Choose where to apply **+10% success rate** — Crime or GTA.`;
    } else if (nextPrestige === 4) {
      nextDesc = `Choose between:\n• **Cooldown Mastery** — all cooldowns -20% beyond upgrade cap\n• **Storage Empire** — +20 booze and drug capacity beyond upgrade cap`;
    } else {
      nextDesc = `Choose your final reward:\n• **10,000 Bullets**\n• **$5,000,000 Cash**`;
    }
    embed.addFields({ name: `🌟 Prestige ${nextPrestige} Reward`, value: nextDesc, inline: false });
  }

  const rows = [];

  if (!eligible) {
    embed.addFields({ name: '🔒 Not Eligible', value: reason, inline: false });
  } else {
    // Show the choice buttons for the next prestige
    if (requiresChoice === 'allocation') {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panel_prestige_choose_crime')
            .setLabel('🕵️ +10% Crime Success')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('panel_prestige_choose_gta')
            .setLabel('🚗 +10% GTA Success')
            .setStyle(ButtonStyle.Danger)
        )
      );
    } else if (requiresChoice === 'perk4') {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panel_prestige_choose_cooldown')
            .setLabel('⚡ Cooldown Mastery')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('panel_prestige_choose_capacity')
            .setLabel('📦 Storage Empire')
            .setStyle(ButtonStyle.Success)
        )
      );
    } else if (requiresChoice === 'perk5') {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panel_prestige_choose_bullets')
            .setLabel('🔫 10,000 Bullets')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('panel_prestige_choose_cash')
            .setLabel('💰 $5,000,000 Cash')
            .setStyle(ButtonStyle.Success)
        )
      );
    }
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_profile')
        .setLabel('⬅ Profile')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('panel_home')
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

// ── Prestige result ───────────────────────────

function renderPrestigeResult(result) {
  if (!result.success) {
    const embed = embeds.failure('Prestige', result.message);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_prestige').setLabel('⬅ Back').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const { nextPrestige } = result.data;
  const colour = PRESTIGE_COLOURS[nextPrestige] ?? 0x00d4ff;
  const stars  = PRESTIGE_STARS[nextPrestige] ?? '🌟';

  const embed = embeds.base(colour)
    .setTitle(`${stars} Prestige ${nextPrestige} Achieved!`)
    .setDescription(result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Return to Home')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { renderPrestigeHome, renderPrestigeResult };
