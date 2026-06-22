"use strict";

const jailbreakService  = require("../services/jailbreakService");
const jailbreakRenderer = require("./renderers/jailbreakRenderer");
const { safeFollowUp }  = require("../utils/interactionUtils");

const JailbreakPanel = {
  /**
   * Main entry point — shows the jailbreak panel listing all jailed players.
   * Handles: panel_jailbreak
   */
  async show(interaction) {
    await interaction.deferUpdate();
    const { guildId, user } = interaction;

    const result = await jailbreakService.getJailedPlayers(guildId);
    if (!result.success) {
      return safeFollowUp(interaction, result.message);
    }

    return interaction.editReply(
      jailbreakRenderer.renderJailbreakPanel(result.data.players, user.id)
    );
  },

  /**
   * Generic handler — routes all panel_jailbreak_* customIds.
   */
  async handle(interaction) {
    const { customId, guildId, user } = interaction;

    // "Set Reward" button — opens modal, no deferUpdate
    if (customId === "panel_jailbreak_set_reward") {
      return interaction.showModal(jailbreakRenderer.buildSetRewardModal());
    }

    // Select menu — player chose a target to bust
    if (customId === "panel_jailbreak_bust_select") {
      await interaction.deferUpdate();
      const targetId = interaction.values[0];

      const result = await jailbreakService.attemptBust(guildId, user.id, targetId);
      if (!result.success) {
        return safeFollowUp(interaction, result.message);
      }

      return interaction.editReply(jailbreakRenderer.renderBustResult(result, user.id));
    }

    // Fallback — treat as main panel load
    return JailbreakPanel.show(interaction);
  },

  /**
   * Modal submission for setting bust reward.
   * Handles: modal_submit_jailbreak_reward
   */
  async handleModal(interaction) {
    await interaction.deferUpdate();
    const { guildId, user } = interaction;
    const rewardAmount = interaction.fields.getTextInputValue("reward_amount");

    const result = await jailbreakService.setBustReward(guildId, user.id, rewardAmount);
    return interaction.editReply(jailbreakRenderer.renderSetRewardResult(result));
  },
};

module.exports = JailbreakPanel;
