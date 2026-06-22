// ─────────────────────────────────────────────
//  index.js  —  Discord client bootstrap + interaction router.
//  Rule: NO game logic. Route to the correct panel. That's it.
//
//  Prefix conventions (from GDD §21):
//    panel_    → standard button / select menu panels
//    panelm_   → mobile-variant button / select panels
//    ap2_      → admin panel buttons
//    apm2_     → admin panel mobile buttons
//
//  Pipeline rule: ALL modal customIds must be intercepted
//  in this router BEFORE any deferUpdate / deferReply is called.
// ─────────────────────────────────────────────

require('dotenv').config();

const { Client, GatewayIntentBits, Collection, InteractionType } = require('discord.js');

// ── Panel handlers ────────────────────────────
const crimePanel    = require('./panels/crimePanel');
const gtaPanel      = require('./panels/gtaPanel');
const crewPanel     = require('./panels/crewPanel');
const combatPanel   = require('./panels/combatPanel');
const travelPanel   = require('./panels/travelPanel');
const traffickingPanel = require('./panels/traffickingPanel');
const bankPanel     = require('./panels/bankPanel');
const shopPanel     = require('./panels/shopPanel');
const businessPanel = require('./panels/businessPanel');
const gamblingPanel = require('./panels/gamblingPanel');
const profilePanel  = require('./panels/profilePanel');
const adminPanel    = require('./panels/adminPanel');
const ocPanel       = require('./panels/ocPanel');
const startPanel    = require('./panels/startPanel');
const homePanel     = require('./panels/homePanel');
const jailbreakPanel = require("./panels/jailbreakPanel");

// ── Command handlers ──────────────────────────
const homeCommand     = require('./commands/home');
const crimeCommand    = require('./commands/crime');
const gtaCommand      = require('./commands/gta');
const crewCommand     = require('./commands/crew');
const combatCommand   = require('./commands/combat');
const searchCommand   = require('./commands/search');
const shootCommand    = require('./commands/shoot');
const travelCommand   = require('./commands/travel');
const businessCommand = require('./commands/business');
const gamblingCommand = require('./commands/gambling');
const adminCommand    = require('./commands/admin');
const startCommand    = require('./commands/start');
const gadminCommand   = require('./commands/gadmin');
const dmtestCommand   = require('./commands/dmtest');


// ── Client setup ──────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

// Slash command registry
client.commands = new Collection();
const commandModules = [
  startCommand, homeCommand,
  crimeCommand, gtaCommand, crewCommand, combatCommand, searchCommand, shootCommand,
  travelCommand, businessCommand, gamblingCommand, adminCommand, gadminCommand, dmtestCommand,
];
for (const mod of commandModules) {
  if (mod.data) client.commands.set(mod.data.name, mod);
}

// ── Route maps ────────────────────────────────
// Maps customId prefix → panel handler function.
// Handler signature: async (interaction) => void

const BUTTON_SELECT_ROUTES = {
  // ── Standard panels (panel_) ──────────────
  'panel_crime':        (i) => crimePanel.handle(i),
  'panel_gta':          (i) => gtaPanel.handle(i),
  'panel_crew':         (i) => crewPanel.handle(i),
  'panel_combat':       (i) => combatPanel.handle(i),
  'panel_travel':       (i) => travelPanel.handle(i),
  'panel_traffic':      (i) => traffickingPanel.handle(i),
  'panelm_traffic':     (i) => traffickingPanel.handle(i),
  'panel_bank':         (i) => bankPanel.handle(i),
  'panelm_bank':        (i) => bankPanel.handle(i),
  'panel_jailbreak':    (i) => jailbreakPanel.handle(i),
  "panel_jailbreak_set_reward":   (i) => jailbreakPanel.handle(i),   // opens modal — no defer
  "panel_jailbreak_bust_select":  (i) => jailbreakPanel.handle(i),
  'panel_shop':         (i) => shopPanel.handle(i),
  'panelm_shop':        (i) => shopPanel.handle(i),
  'panel_business':     (i) => businessPanel.handle(i),
  'panel_gamble':       (i) => gamblingPanel.handle(i),
  'modal_gamble_':               (i) => gamblingPanel.handle(i),
  'panel_gamble_coinflip_again_': (i) => gamblingPanel.handle(i),
  'panel_gamble_number_again_':   (i) => gamblingPanel.handle(i),
  'panel_gamble_dice_again_':     (i) => gamblingPanel.handle(i),
  'panel_gamble_slots_again_':    (i) => gamblingPanel.handle(i),
  'panel_profile':      (i) => profilePanel.handle(i),
  'panel_upgrades':     (i) => profilePanel.handle(i),
  'panel_upgrade_buy_': (i) => profilePanel.handle(i),
  'panel_stats':        (i) => profilePanel.handle(i),
  'panel_leaderboard':  (i) => profilePanel.handle(i),
  'panel_inventory':    (i) => profilePanel.handle(i),
  'panel_inv_equip_':   (i) => profilePanel.handle(i),
  'panel_inv_unequip_': (i) => profilePanel.handle(i),
  'panel_prestige':     (i) => profilePanel.handle(i),
  "modal_submit_jailbreak_reward": (i) => jailbreakPanel.handleModal(i),
  

  // ── Mobile panels (panelm_) ───────────────
  'panelm_crime':    (i) => crimePanel.handle(i),
  'panelm_gta':      (i) => gtaPanel.handle(i),
  'panelm_crew':     (i) => crewPanel.handle(i),
  'panelm_combat':   (i) => combatPanel.handle(i),
  'panelm_travel':   (i) => travelPanel.handle(i),
  'panelm_business': (i) => businessPanel.handle(i),
  'panelm_gamble':   (i) => gamblingPanel.handle(i),
  'panelm_profile':  (i) => profilePanel.handle(i),
  'panelm_upgrades': (i) => profilePanel.handle(i),

  // ── OC panels ─────────────────────────────
  'panel_oc':        (i) => ocPanel.handle(i),
  'panelm_oc':       (i) => ocPanel.handle(i),
  'modal_oc_':       (i) => ocPanel.handle(i),

  // Crew modal opener buttons (trigger showModal, must NOT defer)
  'modal_crew_':     (i) => crewPanel.handle(i),

  // ── Admin panels (ap2_ / apm2_) ───────────
  'ap2_':  (i) => adminPanel.handle(i),
  'apm2_': (i) => adminPanel.handle(i),

  // ── Onboarding (panel_start_*) ────────────
  'panel_start': (i) => startPanel.handle(i),

  // ── Home dashboard ─────────────────────────
  'panel_home':  (i) => homePanel.handle(i),
  'panelm_home': (i) => homePanel.handle(i),
};

// Modal customId prefix → handler
// MUST be resolved before any deferUpdate / deferReply
const MODAL_ROUTES = {
  'modal_bank':     (i) => bankPanel.handleModal(i),
  'modal_crime':    (i) => crimePanel.handleModal(i),
  'modal_gta':      (i) => gtaPanel.handleModal(i),
  'modal_crew':     (i) => crewPanel.handleModal(i),
  'modal_submit_crew': (i) => crewPanel.handleModal(i),
  'modal_combat':   (i) => combatPanel.handleModal(i),
  'modal_travel':   (i) => travelPanel.handleModal(i),
  'modal_business': (i) => businessPanel.handleModal(i),
  'modal_gamble':        (i) => gamblingPanel.handleModal(i),
  'modal_submit_gamble': (i) => gamblingPanel.handleModal(i),
  'modal_oc':           (i) => ocPanel.handleModal(i),
  'modal_submit_oc':    (i) => ocPanel.handleModal(i),
  'modal_profile':  (i) => profilePanel.handleModal(i),
  'modal_admin':    (i) => adminPanel.handleModal(i),
  'modal_start':    (i) => startPanel.handleModal(i),
  'ap2_submit_':    (i) => adminPanel.handleModal(i),
};

// Select menu routes (if different from button prefix — extend as needed)
const SELECT_ROUTES = {
  'select_crime':                (i) => crimePanel.handleSelect(i),
  'select_travel':               (i) => travelPanel.handleSelect(i),
  'panel_travel_destination':    (i) => travelPanel.handleSelect(i),
  'select_crew':                 (i) => crewPanel.handleSelect(i),
  'select_crew_kick':            (i) => crewPanel.handleSelect(i),
  'select_gamble':               (i) => gamblingPanel.handleSelect(i),
  'select_business':             (i) => businessPanel.handleSelect(i),
  'select_combat_search':        (i) => combatPanel.handleSelect(i),
  'select_combat_shoot':         (i) => combatPanel.handleSelect(i),
  'select_bank_transfer_target': (i) => bankPanel.handleSelect(i),
  'select_garage_car':           (i) => gtaPanel.handleSelect(i),
  'ap2_select_player':            (i) => adminPanel.handleSelect(i),
  'ap2_select_leaderboard':      (i) => adminPanel.handleSelect(i),
};

// ── Router helpers ────────────────────────────

/**
 * Find the matching route handler for a given customId.
 * Uses longest-prefix match so 'panel_upgrade_buy_' beats 'panel_upgrades'.
 */
function resolveRoute(customId, routes) {
  let bestMatch = null;
  let bestLength = 0;
  for (const prefix of Object.keys(routes)) {
    if (customId.startsWith(prefix) && prefix.length > bestLength) {
      bestMatch = routes[prefix];
      bestLength = prefix.length;
    }
  }
  return bestMatch;
}

// ── Interaction handler ───────────────────────

client.on('interactionCreate', async (interaction) => {
  try {
    // ── 1. Slash commands ────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    // ── 2. Modals — MUST run before any defer ─
    // Rule: modal submissions are intercepted here, routed immediately.
    // Panel handlers must showModal() BEFORE deferUpdate/deferReply.
    if (interaction.type === InteractionType.ModalSubmit) {
      const handler = resolveRoute(interaction.customId, MODAL_ROUTES);
      if (handler) {
        await handler(interaction);
      } else {
        console.warn('[Router] Unhandled modal:', interaction.customId);
      }
      return;
    }

    // ── 3. Buttons ───────────────────────────
    if (interaction.isButton()) {
      const handler = resolveRoute(interaction.customId, BUTTON_SELECT_ROUTES);
      if (handler) {
        await handler(interaction);
      } else {
        console.warn('[Router] Unhandled button:', interaction.customId);
      }
      return;
    }

    // ── 4. Select menus ──────────────────────
    if (interaction.isAnySelectMenu()) {
      // Try dedicated select routes first, then fall back to button routes
      const handler =
        resolveRoute(interaction.customId, SELECT_ROUTES) ||
        resolveRoute(interaction.customId, BUTTON_SELECT_ROUTES);
      if (handler) {
        await handler(interaction);
      } else {
        console.warn('[Router] Unhandled select menu:', interaction.customId);
      }
      return;
    }

    // ── 5. Autocomplete ──────────────────────
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        await command.autocomplete(interaction);
      }
      return;
    }

  } catch (err) {
    console.error('[Router] Unhandled error:', err);

    // Best-effort error reply — don't crash the bot
    try {
      const payload = {
        content: '⚠️ Something went wrong. Please try again.',
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch {
      // Reply failed too — nothing left to do
    }
  }
});

// ── Lifecycle ─────────────────────────────────

client.once('ready', () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  console.log(`[Bot] Serving ${client.guilds.cache.size} server(s)`);
});

client.login(process.env.DISCORD_TOKEN);
