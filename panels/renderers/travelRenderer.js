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
const { formatCash, relativeTimestamp } = require('../../utils/helpers');
const { STATES, TRAVEL_TIERS } = require('../../data/constants');

// ── Travel home panel ─────────────────────────

/**
 * Render the travel home panel — current state, destination picker.
 * @param {object} player
 * @param {{ usesRemaining, used }} premiumState
 */
function renderTravelHome(player, premiumState) {
  // If already travelling, show in-transit state
  if (player.travelling && player.travelEndTime > Date.now()) {
    const embed = embeds.base(embeds.COLOURS.info)
      .setTitle('✈️ Travel')
      .setDescription(
        `✈️ You're travelling to **${player.travelDestination}**.\nArriving ${relativeTimestamp(player.travelEndTime)}`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_home')
        .setLabel('🏠 Home')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  const desc = [
    `📍 **Current location:** ${player.state}`,
    '',
    '**Tiers:**',
    `🚶 Hitchhike — Free • 5 min`,
    `🚗 Standard — ${formatCash(TRAVEL_TIERS.standard.cost)} • 4 min`,
    `🚙 Upgraded — ${formatCash(TRAVEL_TIERS.upgraded.cost)} • 3 min`,
    `✈️ Premium Jet — ${formatCash(TRAVEL_TIERS.premium.cost)} • 10 sec (${premiumState.usesRemaining}/${TRAVEL_TIERS.premium.dailyLimit} left today)`,
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

// ── Tier picker (after destination selected) ──

/**
 * Render the tier picker for a chosen destination.
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
      .setLabel(`✈️ Premium Jet (${formatCash(TRAVEL_TIERS.premium.cost)}, 10s) — ${premiumState.usesRemaining} left`)
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
 * Travel resolves passively — no "check arrival" button needed.
 */
function renderTravelStartResult(result) {
  if (!result.success) {
    return renderTravelBlocked(result);
  }

  const { destination, travelEndTime } = result.data;

  const embed = embeds.base(embeds.COLOURS.info)
    .setTitle('✈️ Travelling')
    .setDescription(`You're on your way to **${destination}**.\nArriving ${relativeTimestamp(travelEndTime)}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Render a blocked-travel response (jailed / dead / already travelling).
 */
function renderTravelBlocked(result) {
  let embed;

  if (result.data?.jailed && result.data?.jailedUntil) {
    embed = embeds.jailed(result.data.jailedUntil);
  } else if (result.data?.hospitalized && result.data?.hospitalizedUntil) {
    embed = embeds.dead(result.data.hospitalizedUntil);
  } else if (result.data?.travelling) {
    embed = embeds.base(embeds.COLOURS.info)
      .setTitle('✈️ Already Travelling')
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
  renderTravelBlocked,
};
