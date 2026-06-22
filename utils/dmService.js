// ─────────────────────────────────────────────
//  utils/dmService.js  —  All player DM notifications.
//  Rule: Fire-and-forget only. Never throws. Never awaited by caller.
//  Called from panel layer (has Discord client access).
//
//  Attacker identity is NEVER revealed in victim DMs.
//  Witness statements are the only way to find out who shot you.
//
//  Exports:
//    dmShot(client, victimId, data)           — you were hit / killed
//    dmBodyguardKilled(client, ownerId, data) — your BG was taken out
//    dmRaid(client, ownerId, data)            — your business was raided
// ─────────────────────────────────────────────

const { EmbedBuilder } = require('discord.js');

const COLOURS = {
  danger:  0xE74C3C,
  warning: 0xF39C12,
};

function formatCash(n) {
  return `$${Math.floor(n ?? 0).toLocaleString('en-US')}`;
}

async function sendDM(client, discordId, payload) {
  try {
    const user = await client.users.fetch(discordId);
    await user.send(payload);
  } catch {
    // DMs closed or user not found — silent fail
  }
}

// ── Shot / Kill notification ──────────────────

/**
 * DM the victim after they are shot or killed.
 * Attacker identity is deliberately withheld.
 */
function dmShot(client, victimId, data) {
  const isKill = data.outcome === 'kill_player';

  const extras = [];
  if (data.armourBroke)    extras.push('🛡️ Your armour was destroyed.');
  if (data.headwearBroke)  extras.push('⛑️ Your headwear was destroyed.');

  let desc;

  if (isKill) {
    desc =
      `You were gunned down by an unknown assailant.\n\n` +
      `💸 Lost: **${formatCash(data.cashStolen ?? 0)}** cash · **${(data.bulletsStolen ?? 0).toLocaleString()} bullets**\n` +
      `🏥 Respawn: <t:${Math.floor((data.hospitalizedUntil ?? Date.now()) / 1000)}:R>\n\n` +
      `*Witnesses in the area may know who pulled the trigger.*`;
  } else {
    desc =
      `Someone opened fire on you.\n\n` +
      `❤️ Health: **${data.newHp ?? '?'}/100** (-${data.damage ?? '?'} HP)\n\n` +
      `*You didn't get a clear look at who fired.*`;
  }

  if (extras.length) desc += `\n\n${extras.join('\n')}`;

  const embed = new EmbedBuilder()
    .setColor(isKill ? COLOURS.danger : COLOURS.warning)
    .setTitle(isKill ? '💀 You\'ve Been Killed' : '🔫 You\'ve Been Shot')
    .setDescription(desc);

  sendDM(client, victimId, { embeds: [embed] }).catch(() => {});
}

// ── Bodyguard killed notification ─────────────

/**
 * DM the BG owner after one of their bodyguards is killed.
 * Attacker identity is deliberately withheld.
 */
function dmBodyguardKilled(client, ownerId, data) {
  const bgLabel = data.bgName ?? `Slot ${data.bgSlot} Bodyguard`;

  const desc =
    `**${bgLabel}** has been taken out by an unknown attacker.\n\n` +
    (data.remainingBodyguards
      ? `⚠️ You still have bodyguards protecting you.`
      : `🚨 **You have no bodyguards left. You are exposed.**`) +
    `\n\n*Witnesses in the area may have seen who did it.*`;

  const embed = new EmbedBuilder()
    .setColor(COLOURS.warning)
    .setTitle('🛡️ Bodyguard Down')
    .setDescription(desc);

  sendDM(client, ownerId, { embeds: [embed] }).catch(() => {});
}

// ── Business raid notification ────────────────

/**
 * DM the business owner after their business is raided.
 * Raider identity IS revealed here — raids are not anonymous.
 */
function dmRaid(client, ownerId, data) {
  const raiderName   = data.raiderName ?? 'Someone';
  const businessName = data.businessName ?? 'your business';
  const raidsLeft    = (data.newRaidCountNeeded ?? 5) - (data.newRaidCount ?? 0);

  const desc = data.ownerEvicted
    ? `**${raiderName}** completed their 5th raid on your **${businessName}**.\n\n` +
      `💸 **${formatCash(data.pendingStolen ?? 0)}** stolen · Your business has been seized and relocated.`
    : `**${raiderName}** hit your **${businessName}**.\n\n` +
      `💸 **${formatCash(data.pendingStolen ?? 0)}** stolen\n` +
      `⚠️ Raid count: **${data.newRaidCount ?? '?'}/${data.newRaidCountNeeded ?? 5}** — ` +
      `${raidsLeft} more raid${raidsLeft === 1 ? '' : 's'} until eviction.`;

  const embed = new EmbedBuilder()
    .setColor(data.ownerEvicted ? COLOURS.danger : COLOURS.warning)
    .setTitle(data.ownerEvicted ? '🏢 Business Lost!' : '🚨 Business Raided')
    .setDescription(desc);

  sendDM(client, ownerId, { embeds: [embed] }).catch(() => {});
}

module.exports = { dmShot, dmBodyguardKilled, dmRaid };

// ── Rank up notification ──────────────────────

/**
 * Check if an XP gain crossed a rank boundary.
 * Returns the new rank object if ranked up, null otherwise.
 *
 * @param {number} oldXp
 * @param {number} newXp
 * @param {object[]} ranks  — RANKS array from constants
 * @returns {object|null}   — the new rank if ranked up, else null
 */
function checkRankUp(oldXp, newXp, ranks) {
  let oldRank = 0;
  let newRank = 0;
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (oldXp >= ranks[i].minXP) { oldRank = i; break; }
  }
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (newXp >= ranks[i].minXP) { newRank = i; break; }
  }
  if (newRank > oldRank) return ranks[newRank];
  return null;
}

/**
 * DM a player when they rank up.
 * Fire-and-forget.
 *
 * @param {object} client
 * @param {string} discordId
 * @param {object} newRank    — { index, name, minXP }
 * @param {number} newXp
 * @param {object[]} ranks
 */
function dmRankUp(client, discordId, newRank, newXp, ranks) {
  const nextRank = ranks[newRank.index + 1] ?? null;

  const desc =
    `You've earned your stripes.\n\n` +
    `🏅 New rank: **${newRank.name}**\n` +
    `✨ XP: **${newXp.toLocaleString()}**\n` +
    (nextRank
      ? `📈 Next rank: **${nextRank.name}** at **${nextRank.minXP.toLocaleString()} XP**`
      : `👑 **You've reached the highest rank.** Prestige to continue.`);

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎖️ Rank Up!')
    .setDescription(desc);

  sendDM(client, discordId, { embeds: [embed] }).catch(() => {});
}

module.exports = { dmShot, dmBodyguardKilled, dmRaid, checkRankUp, dmRankUp };
