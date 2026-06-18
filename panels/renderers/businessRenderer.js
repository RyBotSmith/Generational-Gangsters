// ─────────────────────────────────────────────
//  businessRenderer.js  —  Embed builders for business.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, relativeTimestamp } = require('../../utils/helpers');
const { BUSINESS_TYPES, BUSINESS_RAIDS_TO_LOSE } = require('../../data/constants');

// ── Flavour data per business type ────────────

const FLAVOUR = {
  bar: {
    emoji:    '🍺',
    tagline:  'The Rusty Nail',
    desc:     'A dingy neighbourhood watering hole with a loyal clientele. Cash comes in steady and the locals don\'t ask questions. Low risk, reliable income — perfect for washing small amounts through the till.',
    risk:     '🟢 Low Risk',
    category: 'Legal',
    tip:      'Legal businesses can\'t be raided. Safe money, slow money.',
  },
  drug_lab: {
    emoji:    '💊',
    tagline:  'Underground Lab',
    desc:     'A makeshift chemistry operation tucked inside an industrial unit on the wrong side of town. Produces serious cash but draws serious heat. Keep your head down and collect often.',
    risk:     '🔴 High Risk',
    category: 'Illegal',
    tip:      'Can be raided by other players. Collect regularly to minimise losses.',
  },
  casino: {
    emoji:    '🎰',
    tagline:  'The Back Room',
    desc:     'An unmarked door behind a laundromat. High rollers, no names, no cameras. The most profitable operation available — but everyone wants a piece. Defend it or lose it.',
    risk:     '🔴 High Risk',
    category: 'Illegal',
    tip:      'Highest income but most targeted. Upgrade to reduce raid chance.',
  },
};

// ── Business home ─────────────────────────────

function renderBusinessHome() {
  const embed = embeds.base(embeds.COLOURS.dark)
    .setTitle('🏢 Businesses')
    .setDescription(
      `Run your own criminal enterprise.\n\n` +
      `**How it works:**\n` +
      `• Travel to a state and **claim** an available business\n` +
      `• Businesses generate income over time — **collect** to take it\n` +
      `• **Upgrade** to increase income and reduce raid risk\n` +
      `• Illegal businesses can be **raided** by other players\n` +
      `• Get raided **5 times** and you lose the business\n\n` +
      `You can only own **one business** at a time.\n` +
      `Travel around to discover what's available.`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_business_legal')
      .setLabel('🟢 Legal Businesses')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('panel_business_illegal')
      .setLabel('🔴 Illegal Businesses')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ── Legal business panel ──────────────────────

/**
 * @param {object} player
 * @param {object|null} stateSlot  — slot in player's current state (if legal)
 */
function renderLegalPanel(player, stateSlot) {
  const f    = FLAVOUR.bar;
  const type = BUSINESS_TYPES.bar;
  const now  = Date.now();

  const isOwner   = stateSlot?.ownerId === player.discordId;
  const isOwned   = !!stateSlot?.ownerId;
  const isCooling = stateSlot?.onCooldown && stateSlot?.cooldownUntil > now;
  const level     = stateSlot?.level ?? 1;
  const incomePerHr = type.incomePerHr * level;

  const embed = embeds.base(embeds.COLOURS.info)
    .setTitle(`${f.emoji} ${f.tagline}`)
    .setDescription(f.desc)
    .addFields(
      { name: '📊 Category',     value: f.category,                       inline: true },
      { name: '⚠️ Risk',         value: f.risk,                            inline: true },
      { name: '💵 Income/hr',    value: formatCash(type.incomePerHr),      inline: true },
      { name: '💰 Buy Cost',     value: formatCash(type.buyCost),          inline: true },
      { name: '🏷️ Sell Value',  value: formatCash(Math.floor(type.buyCost * 0.6)), inline: true },
      { name: '📈 Max Level',    value: '5',                               inline: true },
      { name: '💡 Tip',          value: f.tip,                             inline: false },
    );

  // Show current state info if there's a bar here
  if (stateSlot && stateSlot.typeId === 'bar') {
    const pending     = isOwner ? Math.min(
      Math.floor(((now - (stateSlot.lastCollectedAt ?? now)) / 3600000) * incomePerHr),
      incomePerHr
    ) : 0;

    embed.addFields(
      { name: '📍 Here in ' + player.state, value: isOwner
          ? `Level **${level}** • Pending: **${formatCash(pending)}** • Raids: **${stateSlot.raidCount ?? 0}/${BUSINESS_RAIDS_TO_LOSE}**`
          : isOwned ? `Owned by **${stateSlot.ownerName ?? 'someone'}** • Level **${level}**`
          : isCooling ? `On cooldown ${relativeTimestamp(stateSlot.cooldownUntil)}`
          : `Available — **${formatCash(type.buyCost)}** to claim`,
        inline: false }
    );
  }

  const row1 = new ActionRowBuilder();

  if (stateSlot?.typeId === 'bar') {
    if (!isOwned && !isCooling) {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId('panel_business_claim')
          .setLabel(`💰 Claim (${formatCash(type.buyCost)})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled((player.cash ?? 0) < type.buyCost)
      );
    }
    if (isOwner) {
      const nextCollect  = (stateSlot.lastCollectedAt ?? 0) + 1800000;
      const canCollect   = now >= nextCollect;
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId('panel_business_collect')
          .setLabel('💵 Collect')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!canCollect),
        new ButtonBuilder()
          .setCustomId('panel_business_upgrade')
          .setLabel(`⬆️ Upgrade`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(level >= 5),
        new ButtonBuilder()
          .setCustomId('panel_business_sell')
          .setLabel('🏷️ Sell')
          .setStyle(ButtonStyle.Danger)
      );
    }
  }

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_business')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  const rows = [];
  if (row1.components.length > 0) rows.push(row1);
  rows.push(backRow);

  return { embeds: [embed], components: rows };
}

// ── Illegal business panel ────────────────────

/**
 * Shows both illegal business types with flavour.
 * Never reveals which state they're in.
 * If player is in a state with an illegal business, action buttons appear.
 */
function renderIllegalPanel(player, stateSlot) {
  const now = Date.now();

  const embed = embeds.base(embeds.COLOURS.warning)
    .setTitle('🔴 Illegal Businesses')
    .setDescription(
      `Two illegal operations are running somewhere out there.\n` +
      `Travel between states to find them.\n\n` +
      `⚠️ Illegal businesses can be raided by other players.\n` +
      `Get raided **5 times** and you lose everything.`
    )
    .addFields(
      {
        name: `${FLAVOUR.drug_lab.emoji} ${FLAVOUR.drug_lab.tagline}`,
        value: [
          FLAVOUR.drug_lab.desc,
          `\n💵 **${formatCash(BUSINESS_TYPES.drug_lab.incomePerHr)}/hr** base • 💰 **${formatCash(BUSINESS_TYPES.drug_lab.buyCost)}** to claim`,
          `🏷️ Sell: **${formatCash(Math.floor(BUSINESS_TYPES.drug_lab.buyCost * 0.6))}** • 📈 Max Level: 5`,
          `💡 ${FLAVOUR.drug_lab.tip}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: `${FLAVOUR.casino.emoji} ${FLAVOUR.casino.tagline}`,
        value: [
          FLAVOUR.casino.desc,
          `\n💵 **${formatCash(BUSINESS_TYPES.casino.incomePerHr)}/hr** base • 💰 **${formatCash(BUSINESS_TYPES.casino.buyCost)}** to claim`,
          `🏷️ Sell: **${formatCash(Math.floor(BUSINESS_TYPES.casino.buyCost * 0.6))}** • 📈 Max Level: 5`,
          `💡 ${FLAVOUR.casino.tip}`,
        ].join('\n'),
        inline: false,
      }
    );

  const rows = [];

  // Only show action buttons if player is in a state with an illegal business
  if (stateSlot && BUSINESS_TYPES[stateSlot.typeId]?.category === 'illegal') {
    const type      = BUSINESS_TYPES[stateSlot.typeId];
    const f         = FLAVOUR[stateSlot.typeId];
    const isOwner   = stateSlot.ownerId === player.discordId;
    const isOwned   = !!stateSlot.ownerId;
    const isCooling = stateSlot.onCooldown && stateSlot.cooldownUntil > now;
    const level     = stateSlot.level ?? 1;
    const incomePerHr = type.incomePerHr * level;
    const pending   = isOwner ? Math.min(
      Math.floor(((now - (stateSlot.lastCollectedAt ?? now)) / 3600000) * incomePerHr),
      incomePerHr
    ) : 0;

    // Show what's here
    embed.addFields({
      name: `📍 Found in ${player.state} — ${f.emoji} ${f.tagline}`,
      value: isOwner
        ? `Level **${level}** • Pending: **${formatCash(pending)}** • Raids: **${stateSlot.raidCount ?? 0}/${BUSINESS_RAIDS_TO_LOSE}**`
        : isOwned ? `Owned by **${stateSlot.ownerName ?? 'someone'}** • Level **${level}**`
        : isCooling ? `On cooldown ${relativeTimestamp(stateSlot.cooldownUntil)}`
        : `Available — **${formatCash(type.buyCost)}** to claim`,
      inline: false,
    });

    const actionRow = new ActionRowBuilder();

    if (!isOwned && !isCooling) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId('panel_business_claim')
          .setLabel(`💰 Claim (${formatCash(type.buyCost)})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled((player.cash ?? 0) < type.buyCost)
      );
    }

    if (isOwner) {
      const nextCollect = (stateSlot.lastCollectedAt ?? 0) + 1800000;
      const canCollect  = now >= nextCollect;
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId('panel_business_collect')
          .setLabel('💵 Collect')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!canCollect),
        new ButtonBuilder()
          .setCustomId('panel_business_upgrade')
          .setLabel(`⬆️ Upgrade`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(level >= 5),
        new ButtonBuilder()
          .setCustomId('panel_business_sell')
          .setLabel('🏷️ Sell')
          .setStyle(ButtonStyle.Danger)
      );
    }

    if (!isOwner && isOwned) {
      const bulletsNeeded = 200 * level;
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId('panel_business_raid')
          .setLabel(`🔫 Raid (${bulletsNeeded} bullets)`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled((player.bullets ?? 0) < bulletsNeeded)
      );
    }

    if (actionRow.components.length > 0) rows.push(actionRow);
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_business')
        .setLabel('⬅ Back')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('panel_home')
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
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
  renderLegalPanel,
  renderIllegalPanel,
  renderBusinessResult,
};
