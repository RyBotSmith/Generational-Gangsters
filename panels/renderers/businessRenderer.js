// ─────────────────────────────────────────────
//  businessRenderer.js  —  Embed builders for business results.
//  Rule: No game logic. No DB access. Embeds only.
//
//  KEY BUG NOTE: the "back" button on business panels uses
//  panel_back_state, NOT panel_state — panel_state collides with
//  state-travel navigation elsewhere.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, relativeTimestamp, formatDuration } = require('../../utils/helpers');

// ── Helpers ────────────────────────────────────

function backRow(extra = []) {
  return new ActionRowBuilder().addComponents(
    ...extra,
    new ButtonBuilder()
      .setCustomId('panel_back_state')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary)
  );
}

function homeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );
}

// ── Business list panel (slots in a state) ────

/**
 * Render the businesses available in the player's current state.
 * @param {object[]} slots  — from businessService.getBusinessesInState(), enriched
 * @param {object} player
 */
function renderBusinessList(slots, player) {
  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle(`🏢 Businesses — ${player.state}`);

  if (slots.length === 0) {
    embed.setDescription('There are no business slots in this state.');
    return { embeds: [embed], components: [backRow()] };
  }

  const lines = slots.map(slot => {
    const { type } = slot;
    if (slot.ownerId) {
      const ownerLine = slot.ownerId === player.discordId
        ? '👑 **You** own this'
        : `Owned by another player`;
      return `**${type.name}** (Lv ${slot.level}/${type.maxLevel})\n${ownerLine} • Income: ${formatCash(slot.incomePerHr)}/hr`;
    }
    return `**${type.name}** — *Unowned*\nBuy: ${formatCash(type.buyCost)} • Income: ${formatCash(type.incomePerHr)}/hr at Lv1`;
  });

  embed.setDescription(lines.join('\n\n'));

  const rows = [];
  let row = new ActionRowBuilder();
  let count = 0;

  for (const slot of slots) {
    const { type } = slot;
    let btn;

    if (!slot.ownerId) {
      btn = new ButtonBuilder()
        .setCustomId(`panel_business_claim_${type.id}`)
        .setLabel(`Claim ${type.name} (${formatCash(type.buyCost)})`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(!!player.businessId);
    } else if (slot.ownerId === player.discordId) {
      btn = new ButtonBuilder()
        .setCustomId('panel_business_manage')
        .setLabel(`Manage ${type.name}`)
        .setStyle(ButtonStyle.Primary);
    } else if (slot.raidChance != null) {
      btn = new ButtonBuilder()
        .setCustomId(`panel_business_raid_${slot.businessId}`)
        .setLabel(`Raid ${type.name} (${slot.raidBulletsRequired} 🔫)`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(slot.raidCooldown?.onCooldown ?? false);
    } else {
      btn = new ButtonBuilder()
        .setCustomId(`panel_business_view_${type.id}`)
        .setLabel(`${type.name} (owned)`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);
    }

    if (count > 0 && count % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(btn);
    count++;
  }
  if (count > 0) rows.push(row);

  rows.push(backRow());

  return { embeds: [embed], components: rows };
}

// ── Manage panel (owner view) ─────────────────

/**
 * Render the management panel for the player's owned business.
 * @param {object} slot  — enriched slot from businessService
 */
function renderBusinessManage(slot) {
  const { type } = slot;

  const desc = [
    `**${type.name}** — Level ${slot.level}/${type.maxLevel}`,
    `📍 ${slot.state}`,
    `💰 Income: ${formatCash(slot.incomePerHr)}/hr`,
    `💵 Pending: ${formatCash(Math.floor(slot.pendingCash))}`,
    '',
    slot.collectCooldown.onCooldown
      ? `⏳ Next collect: ${relativeTimestamp(slot.collectCooldown.nextAvailableMs)}`
      : '✅ Ready to collect',
  ];

  if (slot.nextUpgradeCost != null) {
    desc.push(`⬆️ Next upgrade: ${formatCash(slot.nextUpgradeCost)} (Lv ${slot.level + 1})`);
  } else {
    desc.push('⬆️ Max level reached.');
  }

  if (slot.raidChance != null) {
    desc.push(
      slot.raidCooldown.onCooldown
        ? `🛡️ Raid cooldown: ${relativeTimestamp(slot.raidCooldown.nextAvailableMs)}`
        : `🛡️ Raid risk: ${(slot.raidChance * 100).toFixed(0)}% • Cost to raid: ${slot.raidBulletsRequired} 🔫`,
      `⚠️ ${slot.raidCount}/5 successful raids against this business`
    );
  }

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle(`🏢 ${type.name}`)
    .setDescription(desc.join('\n'));

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_business_collect')
      .setLabel(`💰 Collect (${formatCash(Math.floor(slot.pendingCash))})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(slot.collectCooldown.onCooldown || slot.pendingCash <= 0),
    new ButtonBuilder()
      .setCustomId('panel_business_upgrade')
      .setLabel(slot.nextUpgradeCost != null ? `⬆️ Upgrade (${formatCash(slot.nextUpgradeCost)})` : '⬆️ Max Level')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(slot.nextUpgradeCost == null)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_business_sell')
      .setLabel('🚪 Sell Business')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row1, row2, backRow()] };
}

// ── Result renderers ──────────────────────────

/**
 * Route a generic business Result Object to a success/failure embed
 * with a sensible back button. Used for claim/upgrade/sell/raid/collect.
 */
function renderBusinessResult(result) {
  if (!result.success) {
    if (result.data?.jailed && result.data?.jailedUntil) {
      const embed = embeds.jailed(result.data.jailedUntil);
      return { embeds: [embed], components: [backRow()] };
    }
    if (result.data?.hospitalized && result.data?.hospitalizedUntil) {
      const embed = embeds.dead(result.data.hospitalizedUntil);
      return { embeds: [embed], components: [backRow()] };
    }
    if (result.data?.onCooldown) {
      const embed = embeds.cooldown('do that', result.data.nextAvailableMs);
      return { embeds: [embed], components: [backRow()] };
    }
    return { embeds: [embeds.failure('Business', result.message)], components: [backRow()] };
  }

  const embed = embeds.success('Business', result.message);
  return { embeds: [embed], components: [backRow([
    new ButtonBuilder()
      .setCustomId('panel_business_manage')
      .setLabel('🏢 Manage')
      .setStyle(ButtonStyle.Primary),
  ])] };
}

/**
 * Render a raid result with a bit more flavour (success/failure/slot lost).
 */
function renderRaidResult(result) {
  if (!result.success) {
    return renderBusinessResult(result);
  }

  const { type, slotLost, raidCount, bulletsSpent } = result.data;

  let desc = `🔫 Spent **${bulletsSpent} bullets**.\n${result.message}`;

  const embed = slotLost
    ? embeds.success(`${type.name} Raided!`, desc)
    : embeds.success(`${type.name} Raided`, `${desc}\n\n(${raidCount}/5 raids)`);

  return { embeds: [embed], components: [backRow()] };
}

module.exports = {
  renderBusinessList,
  renderBusinessManage,
  renderBusinessResult,
  renderRaidResult,
};
