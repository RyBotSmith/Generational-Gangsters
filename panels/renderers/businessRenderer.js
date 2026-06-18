// ─────────────────────────────────────────────
//  businessRenderer.js  —  Embed builders for business.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, relativeTimestamp } = require('../../utils/helpers');
const { BUSINESS_TYPES, BUSINESS_RAIDS_TO_LOSE } = require('../../data/constants');

// ── Business home ─────────────────────────────

/**
 * Render the business home panel.
 * Shows all slots, highlights current state slot and player's owned business.
 */
function renderBusinessHome(data) {
  const { player, allSlots, playerSlot, stateSlot } = data;
  const now = Date.now();

  // Overview of all slots
  const slotLines = allSlots.map(slot => {
    const type     = BUSINESS_TYPES[slot.typeId];
    const isOwned  = slot.ownerId === player.discordId;
    const isState  = slot.state === player.state;

    let status = '🔓 Available';
    if (slot.onCooldown && slot.cooldownUntil > now) {
      status = `⏳ On cooldown ${relativeTimestamp(slot.cooldownUntil)}`;
    } else if (slot.ownerId) {
      status = isOwned ? '✅ **Yours**' : `🔒 Owned by ${slot.ownerName ?? 'someone'}`;
    }

    const marker = isState ? '📍 ' : '';
    return `${marker}**${slot.state}** — ${type?.name ?? slot.typeId} L${slot.level ?? 1} — ${status}`;
  });

  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🏢 Businesses')
    .setDescription(
      `📍 **You are in:** ${player.state}\n\n` +
      slotLines.join('\n')
    );

  const rows = [];
  const actionRow = new ActionRowBuilder();

  // Actions based on current state slot
  if (stateSlot) {
    const type = BUSINESS_TYPES[stateSlot.typeId];
    const isOwner = stateSlot.ownerId === player.discordId;
    const isCooling = stateSlot.onCooldown && stateSlot.cooldownUntil > now;
    const isOwned = !!stateSlot.ownerId;

    if (!isOwned && !isCooling) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId('panel_business_claim')
          .setLabel(`💰 Claim ${type?.name} ($${type?.buyCost?.toLocaleString('en-US')})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled((player.cash ?? 0) < (type?.buyCost ?? 0))
      );
    }

    if (isOwner) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId('panel_business_collect')
          .setLabel('💵 Collect')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('panel_business_upgrade')
          .setLabel(`⬆️ Upgrade (L${stateSlot.level ?? 1}→${(stateSlot.level ?? 1) + 1})`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled((stateSlot.level ?? 1) >= 5),
        new ButtonBuilder()
          .setCustomId('panel_business_sell')
          .setLabel('🏷️ Sell')
          .setStyle(ButtonStyle.Danger)
      );
    }

    if (!isOwner && isOwned && type?.category === 'illegal') {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId('panel_business_raid')
          .setLabel(`🔫 Raid (${200 * (stateSlot.level ?? 1)} bullets)`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled((player.bullets ?? 0) < 200 * (stateSlot.level ?? 1))
      );
    }
  }

  if (actionRow.components.length > 0) rows.push(actionRow);

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_home')
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

// ── Detail view for owned business ───────────

function renderBusinessDetail(slot, pending, upgradeCost, raidChance) {
  const type = BUSINESS_TYPES[slot.typeId];
  const now  = Date.now();

  const nextCollect = slot.lastCollectedAt
    ? slot.lastCollectedAt + 1800000
    : null;
  const onCooldown = nextCollect && now < nextCollect;

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle(`🏢 ${type?.name ?? slot.typeId} — ${slot.state}`)
    .addFields(
      { name: '📊 Level',       value: `${slot.level ?? 1}/5`,                                inline: true },
      { name: '💰 Pending',     value: formatCash(pending),                                   inline: true },
      { name: '⏰ Next Collect', value: onCooldown ? relativeTimestamp(nextCollect) : '✅ Now', inline: true },
      { name: '💵 Income/hr',   value: formatCash((type?.incomePerHr ?? 0) * (slot.level ?? 1)), inline: true },
      { name: '🔫 Raids',       value: `${slot.raidCount ?? 0}/${BUSINESS_RAIDS_TO_LOSE}`,   inline: true },
      { name: '⬆️ Upgrade Cost', value: upgradeCost ? formatCash(upgradeCost) : 'MAX',        inline: true },
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_business_collect')
      .setLabel('💵 Collect')
      .setStyle(ButtonStyle.Success)
      .setDisabled(onCooldown || pending <= 0),
    new ButtonBuilder()
      .setCustomId('panel_business_upgrade')
      .setLabel('⬆️ Upgrade')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!upgradeCost),
    new ButtonBuilder()
      .setCustomId('panel_business_sell')
      .setLabel('🏷️ Sell')
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_business')
      .setLabel('⬅ Business')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Result renderer ───────────────────────────

function renderBusinessResult(result) {
  const embed = result.success
    ? embeds.success('Business', result.message)
    : embeds.failure('Business', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_business')
      .setLabel('⬅ Business')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  renderBusinessHome,
  renderBusinessDetail,
  renderBusinessResult,
};
