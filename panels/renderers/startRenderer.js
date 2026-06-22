// ─────────────────────────────────────────────
//  startRenderer.js  —  Embed/modal builders for character creation.
//  Rule: No game logic. No DB access. Embeds + components only.
// ─────────────────────────────────────────────

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const embeds = require('../../utils/embeds');
const { formatCash } = require('../../utils/helpers');

// ── "Already started" message ──────────────────

function renderAlreadyStarted() {
  const embed = embeds.info(
    'Already Enlisted',
    'You already have a character on this server. Use `/profile` to view your stats.'
  );

  return { embeds: [embed], components: [], ephemeral: true };
}

// ── Welcome / pre-creation prompt ───────────────

/**
 * Shown briefly before the modal opens (or as a fallback if a modal
 * can't be shown). Includes a button that re-opens the creation modal.
 */
function renderStartPrompt() {
  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle('🌆 Welcome to Generational Gangsters')
    .setDescription(
      'Every empire starts with a name.\n\n' +
      'Click below to create your character — choose a name and pick your character\'s sex.'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_start_create')
      .setLabel('📝 Create Character')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

// ── Character creation modal ────────────────────

/**
 * Build the character creation modal.
 * Sex is collected via a select-style text input (modals don't support
 * select menus), validated server-side against 'male' | 'female'.
 */
function buildCreateCharacterModal() {
  const modal = new ModalBuilder()
    .setCustomId('modal_start_create')
    .setTitle('Create Your Character');

  const nameInput = new TextInputBuilder()
    .setCustomId('characterName')
    .setLabel('Character Name')
    .setPlaceholder('e.g. Tony Marchetti')
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(24)
    .setRequired(true);

  const sexInput = new TextInputBuilder()
    .setCustomId('sex')
    .setLabel('Sex (type: male or female)')
    .setPlaceholder('male or female')
    .setStyle(TextInputStyle.Short)
    .setMinLength(4)
    .setMaxLength(6)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(sexInput)
  );

  return modal;
}

// ── Result rendering ────────────────────────────

/**
 * Render the result of startService.createCharacter().
 */
function renderCreateResult(result) {
  if (!result.success) {
    const embed = embeds.failure('Character Creation Failed', result.message);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_start_create')
        .setLabel('🔄 Try Again')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(result.data?.alreadyExists === true)
    );

    return { embeds: [embed], components: [row], ephemeral: true };
  }

  const { characterName, sex, state, cash } = result.data;
  const sexIcon = sex === 'male' ? '♂' : '♀';

  const embed = embeds.base(embeds.COLOURS.gold)
    .setTitle(`🌆 Welcome, ${characterName}`)
    .setDescription(
      `You're in. **${state}** is your starting ground — and right now, ` +
      `you've got **${formatCash(cash ?? 0)}** to your name and nothing but time.\n\n` +
      `**Generational Gangsters** is a crime RPG built around one idea: ` +
      `build an empire that outlasts you. Commit crimes, traffic product across states, ` +
      `run businesses, take out rivals, and climb the ranks from street rat to legend.\n\n` +
      `**A few things to know:**\n` +
      `• 🗺️ **Travel** between states to traffic booze and drugs for profit\n` +
      `• 💼 **Crimes & GTA** are your bread and butter early on\n` +
      `• 🏦 **Bank your cash** — you lose cash on death, not what's in the bank\n` +
      `• 👥 **Crews & OC** open up as you rank up\n` +
      `• ⬆️ **Upgrades** make everything hit harder\n\n` +
      `Your story starts now, ${sexIcon} **${characterName}**. Don't waste it.`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_home')
      .setLabel("🏠 Let's Go")
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row], ephemeral: true };
}

module.exports = {
  renderAlreadyStarted,
  renderStartPrompt,
  buildCreateCharacterModal,
  renderCreateResult,
};
