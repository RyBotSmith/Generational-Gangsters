// ─────────────────────────────────────────────
//  utils/dmService.js  —  All player DM notifications.
//  Rule: Fire-and-forget only. Never throws. Never awaited by caller.
//  Called from panel layer (has Discord client access).
//
//  Exports:
//    dmShot(client, victim, data)         — you were hit / killed
//    dmBodyguardKilled(client, owner, data) — your BG was taken out
//    dmRaid(client, owner, data)          — your business was raided
// ─────────────────────────────────────────────

const { EmbedBuilder } = require('discord.js');

// ── Colour palette ────────────────────────────
const COLOURS = {
  danger:  0xE74C3C,
  warning: 0xF39C12,
  info:    0x3498DB,
  dark:    0x2C2F33,
};

// ── Helpers ───────────────────────────────────

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
 * DM the victim after they're shot or killed.
 * @param {object} client      — discord.js Client
 * @param {string} victimId    — Discord ID of the victim
 * @param {object} data        — from combatService result.data
 *   data.outcome              'damage_player' | 'kill_player'
 *   data.attackerName         string
 *   data.damage               number (HP)
 *   data.newHp                number
 *   data.cashStolen           number (kill only)
 *   data.bulletsStolen        number (kill only)
 *   data.hospitalizedUntil    epoch ms (kill only)
 *   data.armourBroke          bool
 *   data.headwearBroke        bool
 */
function dmShot(client, victimId, data) {
  const isKill = data.outcome === 'kill_player';

  const extras = [];
  if (data.armourBroke)   extras.push('🛡️ Your armour was destroyed.');
  if (data.headwearBroke) extras.push('⛑️ Your headwear was destroyed.');

  let embed;

  if (isKill) {
    embed = new EmbedBuilder()
      .setColor(COLOURS.danger)
      .setTitle('💀 You\'ve Been Killed')
      .setDescription(
        `**${data.attackerName ?? 'Someone'}** gunned you down.\n\n` +
        `💸 Lost: **${formatCash(data.cashStolen ?? 0)}** cash · **${(data.bulletsStolen ?? 0).toLocaleString()} bullets**\n` +
        `🏥 Respawn: <t:${Math.floor((data.hospitalizedUntil ?? Date.now()) / 1000)}:R>` +
        (extras.length ? `\n\n${extras.join('\n')}` : '')
      );
  } else {
    embed = new EmbedBuilder()
      .setColor(COLOURS.warning)
      .setTitle('🔫 You\'ve Been Shot')
      .setDescription(
        `**${data.attackerName ?? 'Someone'}** opened fire on you.\n\n` +
        `❤️ Health: **${data.newHp ?? '?'}/100** (-${data.damage ?? '?'} HP)` +
        (extras.length ? `\n\n${extras.join('\n')}` : '')
      );
  }

  sendDM(client, victimId, { embeds: [embed] }).catch(() => {});
}

// ── Bodyguard killed notification ─────────────

/**
 * DM the BG owner after one of their bodyguards is killed.
 * @param {object} client      — discord.js Client
 * @param {string} ownerId     — Discord ID of the BG owner
 * @param {object} data        — from combatService result.data (kill_bodyguard)
 *   data.attackerName         string
 *   data.bgName               string
 *   data.bgSlot               number
 *   data.remainingBodyguards  bool — any BGs still alive?
 */
function dmBodyguardKilled(client, ownerId, data) {
  const embed = new EmbedBuilder()
    .setColor(COLOURS.warning)
    .setTitle('🛡️ Bodyguard Down')
    .setDescription(
      `**${data.attackerName ?? 'Someone'}** just took out **${data.bgName ?? `Slot ${data.bgSlot} Bodyguard`}**.\n\n` +
      `${data.remainingBodyguards
        ? '⚠️ You still have bodyguards protecting you.'
        : '🚨 **You have no bodyguards left. You are exposed.**'}`
    );

  sendDM(client, ownerId, { embeds: [embed] }).catch(() => {});
}

// ── Business raid notification ────────────────

/**
 * DM the business owner after their business is raided.
 * @param {object} client      — discord.js Client
 * @param {string} ownerId     — Discord ID of the business owner
 * @param {object} data        — from businessService result.data
 *   data.raiderName           string
 *   data.businessName         string
 *   data.pendingStolen        number
 *   data.newRaidCount         number
 *   data.ownerEvicted         bool
 *   data.newRaidCountNeeded   number (BUSINESS_RAIDS_TO_LOSE)
 */
function dmRaid(client, ownerId, data) {
  const embed = data.ownerEvicted
    ? new EmbedBuilder()
        .setColor(COLOURS.danger)
        .setTitle('🏢 Business Lost!')
        .setDescription(
          `**${data.raiderName ?? 'Someone'}** completed their 5th raid on your **${data.businessName ?? 'business'}**.\n\n` +
          `💸 **${formatCash(data.pendingStolen ?? 0)}** stolen · Your business has been seized and relocated.`
        )
    : new EmbedBuilder()
        .setColor(COLOURS.warning)
        .setTitle('🚨 Business Raided')
        .setDescription(
          `**${data.raiderName ?? 'Someone'}** hit your **${data.businessName ?? 'business'}**.\n\n` +
          `💸 **${formatCash(data.pendingStolen ?? 0)}** stolen\n` +
          `⚠️ Raid count: **${data.newRaidCount ?? '?'}/${data.newRaidCountNeeded ?? 5}** — ` +
          `${(data.newRaidCountNeeded ?? 5) - (data.newRaidCount ?? 0)} more raid(s) until eviction.`
        );

  sendDM(client, ownerId, { embeds: [embed] }).catch(() => {});
}

module.exports = { dmShot, dmBodyguardKilled, dmRaid };
