// ─────────────────────────────────────────────
//  travelRenderer.js  —  Embed builders for travel results.
//  Rule: No game logic. No DB access. Embeds only.
// ─────────────────────────────────────────────

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { formatCash, formatDuration, relativeTimestamp } = require('../../utils/helpers');
const { STATES, TRAVEL_TIERS } = require('../../data/constants');

// ── Travel home panel ─────────────────────────

/**
 * Render the travel home panel — current state, travel status, tier picker.
 * @param {object} player
 * @param {{ usesRemaining, used }} premiumState  — from travelService.getPremiumUses()
 */
function renderTravelHome(player, premiumState) {
  let desc;

  if (player.travelling && player.travelEndTime > Date.now()) {
    desc = `✈️ You're travelling to **${player.travelDestination}**.\nArriving ${relativeTimestamp(player.travelEndTime)}`;

    const embed = embeds.base(embeds.COLOURS.info)
      .setTitle('✈️ Travel')
      .setDescription(desc);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_travel_arrive')
        .setLabel('📍 Check Arrival')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('panel_home')
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  desc = [
    `📍 **Current location:** ${player.state}`,
    '',
    '**Tiers:**',
    `🚶 Hitchhike — Free • 5 min`,
    `🚗 Standard — ${formatCash(TRAVEL_TIERS.standard.cost)} • 4 min`,
    `🚙 Upgraded — ${formatCash(TRAVEL_TIERS.upgraded.cost)} • 3 min`,
    `✈️ Premium — ${formatCash(TRAVEL_TIERS.premium.cost)} • 10 sec (${premiumState.usesRemaining}/${TRAVEL_TIERS.premium.dailyLimit} left today)`,
  ].join('\n');

  const embed = embeds.base(embeds.COLOURS.info)
    .setTitle('✈️ Travel')
    .setDescription(desc);

  const destinations = STATES.filter(s => s !== player.state);

  const destSelect = new StringSelectMenuBuilder()
    .setCustomId('panel_travel_destination')
    .setPlaceholder('Choose a destination')
    .addOptions(
      destinations.slice(0, 25).map(state => ({
        label: state,
        value: state,
      }))
    );

  const row1 = new ActionRowBuilder().addComponents(destSelect);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Tier picker (after destination selected) ─

/**
 * Render the tier picker for a chosen destination. The destination is
 * encoded into each tier button's customId.
 * @param {string} destination
 * @param {object} player
 * @param {{ usesRemaining }} premiumState
 */
function renderTierPicker(destination, player, premiumState) {
  const embed = embeds.base(embeds.COLOURS.info)
    .setTitle(`✈️ Travel to ${destination}`)
    .setDescription('Choose how you want to get there:');

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel_travel_go_hitchhike_${destination}`)
      .setLabel(`🚶 Hitchhike (Free, 5m)`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`panel_travel_go_standard_${destination}`)
      .setLabel(`🚗 Standard (${formatCash(TRAVEL_TIERS.standard.cost)}, 4m)`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled((player.cash ?? 0) < TRAVEL_TIERS.standard.cost)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panel_travel_go_upgraded_${destination}`)
      .setLabel(`🚙 Upgraded (${formatCash(TRAVEL_TIERS.upgraded.cost)}, 3m)`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled((player.cash ?? 0) < TRAVEL_TIERS.upgraded.cost),
    new ButtonBuilder()
      .setCustomId(`panel_travel_go_premium_${destination}`)
      .setLabel(`✈️ Premium (${formatCash(TRAVEL_TIERS.premium.cost)}, 10s) — ${premiumState.usesRemaining} left`)
      .setStyle(ButtonStyle.Success)
      .setDisabled((player.cash ?? 0) < TRAVEL_TIERS.premium.cost || premiumState.usesRemaining <= 0)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_travel')
      .setLabel('⬅ Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

// ── Result renderers ──────────────────────────

/**
 * Render the result of starting travel.
 */
function renderTravelStartResult(result) {
  if (!result.success) {
    return renderTravelBlocked(result);
  }

  const { destination, tier, arrivedImmediately } = result.data;

  const embed = embeds.success(
    arrivedImmediately ? `Arrived in ${destination}!` : 'Travel Started',
    result.message
  );

  const row = new ActionRowBuilder().addComponents(
    arrivedImmediately
      ? new ButtonBuilder()
          .setCustomId('panel_home')
          .setLabel('🏠 Home')
          .setStyle(ButtonStyle.Primary)
      : new ButtonBuilder()
          .setCustomId('panel_travel_arrive')
          .setLabel('📍 Check Arrival')
          .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render the result of resolve() — either arrived, or still travelling.
 */
function renderTravelArriveResult(result) {
  if (!result.success) {
    if (result.data?.stillTravelling) {
      const embed = embeds.info('Still Travelling', result.message)
        .setDescription(`${result.message}\nArriving ${relativeTimestamp(result.data.travelEndTime)}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('panel_travel_arrive')
          .setLabel('📍 Check Again')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('panel_home')
          .setLabel('🏠 Home')
          .setStyle(ButtonStyle.Secondary)
      );

      return { embeds: [embed], components: [row] };
    }

    return {
      embeds: [embeds.error(result.message)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('panel_home')
            .setLabel('🏠 Home')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    };
  }

  const embed = embeds.success('Arrived!', result.message);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('panel_travel')
      .setLabel('✈️ Travel Again')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render a blocked-travel response (jailed/dead/already travelling/etc.).
 */
function renderTravelBlocked(result) {
  let embed;

  if (result.data?.jailed && result.data?.jailedUntil) {
    embed = embeds.jailed(result.data.jailedUntil);
  } else if (result.data?.hospitalized && result.data?.hospitalizedUntil) {
    embed = embeds.dead(result.data.hospitalizedUntil);
  } else if (result.data?.travelling) {
    embed = embeds.info('Already Travelling', result.message)
      .setDescription(`${result.message}\nArriving ${relativeTimestamp(result.data.travelEndTime)}`);
  } else if (result.data?.dailyLimitReached) {
    embed = embeds.failure('Daily Limit Reached', result.message);
  } else {
    embed = embeds.failure('Travel', result.message);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  renderTravelHome,
  renderTierPicker,
  renderTravelStartResult,
  renderTravelArriveResult,
  renderTravelBlocked,
};
