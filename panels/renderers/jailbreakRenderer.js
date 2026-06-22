"use strict";

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");

const JAIL_EMOJI    = "🔒";
const BUST_EMOJI    = "💨";
const REWARD_EMOJI  = "💰";
const CAUGHT_EMOJI  = "🚔";
const SUCCESS_EMOJI = "✅";
const FAIL_EMOJI    = "❌";

/**
 * Main jailbreak panel listing all jailed players.
 */
function renderJailbreakPanel(jailedPlayers, viewerId) {
  const embed = new EmbedBuilder()
    .setTitle(`${JAIL_EMOJI} Jailbreak`)
    .setColor(0x2f3136);

  if (!jailedPlayers || jailedPlayers.length === 0) {
    embed.setDescription("*The cells are empty. No one to break out right now.*");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("panel_home")
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  const now = Date.now();

  const lines = jailedPlayers.map((p) => {
    const remaining = p.jailedUntil - now;
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const rewardStr = p.bustReward > 0
      ? `${REWARD_EMOJI} $${p.bustReward.toLocaleString()}`
      : `${REWARD_EMOJI} No reward set`;
    return `**${p.username || p.discordId}** — ${timeStr} remaining\n${rewardStr}`;
  });

  embed.setDescription(lines.join("\n\n"));
  embed.setFooter({ text: "Select a player below to attempt a bust" });

  const components = [];

  // Select menu to bust someone
  const options = jailedPlayers.map((p) => ({
    label: p.username || p.discordId,
    description: p.bustReward > 0 ? `Reward: $${p.bustReward.toLocaleString()}` : "No reward set",
    value: p.discordId,
    emoji: BUST_EMOJI,
  }));

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("panel_jailbreak_bust_select")
      .setPlaceholder("Choose a prisoner to bust out...")
      .addOptions(options)
  );
  components.push(selectRow);

  // Bottom nav row
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("panel_home")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary)
  );

  // If the viewer is jailed, show "Set Reward" button
  const viewerJailed = jailedPlayers.find((p) => p.discordId === viewerId);
  if (viewerJailed) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId("panel_jailbreak_set_reward")
        .setLabel("Set Bust Reward")
        .setEmoji(REWARD_EMOJI)
        .setStyle(ButtonStyle.Primary)
    );
  }

  components.push(navRow);

  return { embeds: [embed], components };
}

/**
 * Result embed after a bust attempt.
 */
function renderBustResult(result, viewerId) {
  const { outcome, reward, targetName, busterJailUntil } = result.data || {};

  let color, title, description;

  if (outcome === "success") {
    color  = 0x57f287;
    title  = `${SUCCESS_EMOJI} Bust Successful`;
    description = reward > 0
      ? `You broke **${targetName}** out of jail and collected $${reward.toLocaleString()} in reward cash.`
      : `You broke **${targetName}** out of jail.`;
  } else if (outcome === "caught") {
    const until = busterJailUntil ? new Date(busterJailUntil) : null;
    const mins = until ? Math.round((busterJailUntil - Date.now()) / 60000) : 5;
    color  = 0xed4245;
    title  = `${CAUGHT_EMOJI} Caught!`;
    description = `You were caught trying to bust **${targetName}**.\n\n` +
      `• You have been jailed for **${mins} minute${mins !== 1 ? "s" : ""}**\n` +
      `• **${targetName}** received an extra 5 minutes on their sentence`;
  } else {
    color  = 0xfee75c;
    title  = `${FAIL_EMOJI} Bust Failed`;
    description = `You tried to break **${targetName}** out but couldn't pull it off. No one was caught this time.`;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("panel_jailbreak")
      .setLabel("Back to Jailbreak")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("panel_home")
      .setLabel("Home")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Modal for setting bust reward.
 */
function buildSetRewardModal() {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

  return new ModalBuilder()
    .setCustomId("modal_submit_jailbreak_reward")
    .setTitle("Set Bust Reward")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("reward_amount")
          .setLabel("Reward amount ($)")
          .setPlaceholder("e.g. 5000")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(7)
      )
    );
}

/**
 * Simple embed for reward update confirmation / error.
 */
function renderSetRewardResult(result) {
  const embed = new EmbedBuilder()
    .setColor(result.success ? 0x57f287 : 0xed4245)
    .setDescription(result.success ? `${REWARD_EMOJI} ${result.message}` : `${FAIL_EMOJI} ${result.message}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("panel_jailbreak")
      .setLabel("Back to Jailbreak")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  renderJailbreakPanel,
  renderBustResult,
  buildSetRewardModal,
  renderSetRewardResult,
};
