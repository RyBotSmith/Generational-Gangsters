"use strict";

// ─────────────────────────────────────────────
//  jailbreakPanel.js  —  Routes panel_jailbreak_* interactions.
//  Rule: NO game logic. NO DB calls.
//  Defer → call service → render result.
// ─────────────────────────────────────────────

const jailbreakService  = require("../services/jailbreakService");
const jailbreakRenderer = require("./renderers/jailbreakRenderer");
const embeds            = require("../utils/embeds"); // Matches gtaPanel's setup if needed later

// ── Helpers ───────────────────────────────────

// Local helper to match the exact pattern used in gtaPanel.js
// This fixes your "MODULE_NOT_FOUND" error entirely!
function safeFollowUp(interaction, message) {
  return interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
}

// ── Main handler ──────────────────────────────

async function handle(interaction) {
  const { customId, guildId, user } = interaction;

  // ── panel_jailbreak (root — show jailbreak panel) ──────
  if (customId === "panel_jailbreak") {
    await interaction.deferUpdate();

    const result = await jailbreakService.getJailedPlayers(guildId);
    if (!result.success) {
      return safeFollowUp(interaction, result.message);
    }

    const payload = jailbreakRenderer.renderJailbreakPanel(result.data.players, user.id);
    return interaction.editReply(payload);
  }

  // ── panel_jailbreak_set_reward ───────────────────────
  if (customId === "panel_jailbreak_set_reward") {
    // Open modal — rule: do not call deferUpdate before showing a modal!
    return interaction.showModal(jailbreakRenderer.buildSetRewardModal());
  }

  // ── panel_jailbreak_bust_select (Dropdown selection) ──
  if (customId === "panel_jailbreak_bust_select") {
    await interaction.deferUpdate();
    const targetId = interaction.values[0];

    const result = await jailbreakService.attemptBust(guildId, user.id, targetId);
    if (!result.success) {
      return safeFollowUp(interaction, result.message);
    }

    const payload = jailbreakRenderer.renderBustResult(result, user.id);
    return interaction.editReply(payload);
  }

  // Fallback fallback handling to prevent frozen components
  console.warn('[jailbreakPanel] Unhandled customId:', customId);
}

async function handleModal(interaction) {
  const { customId, guildId, user } = interaction;

  // ── modal_submit_jailbreak_reward ────────────────────
  if (customId === "modal_submit_jailbreak_reward" || customId.includes("jailbreak_reward")) {
    await interaction.deferUpdate();
    const rewardAmount = interaction.fields.getTextInputValue("reward_amount");

    const result = await jailbreakService.setBustReward(guildId, user.id, rewardAmount);
    const payload = jailbreakRenderer.renderSetRewardResult(result);
    return interaction.editReply(payload);
  }

  console.warn('[jailbreakPanel] Unexpected modal:', customId);
}

// Included to match gtaPanel export contract precisely
async function handleSelect(interaction) {
  // If your selection menu routes through a global selection handler rather than handle(),
  // you can move the "panel_jailbreak_bust_select" logic down here.
  return handle(interaction); 
}

module.exports = { handle, handleModal, handleSelect };