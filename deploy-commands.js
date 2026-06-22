// ─────────────────────────────────────────────
//  deploy-commands.js
//  Run once locally whenever you add or change slash commands:
//    node deploy-commands.js
//
//  Uses GUILD_ID if set → instant update (dev/testing)
//  Omit GUILD_ID       → global commands (live, takes ~1hr to propagate)
// ─────────────────────────────────────────────

require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID; // optional — set in .env for instant guild deploy

if (!TOKEN || !CLIENT_ID) {
  console.error('❌  Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env');
  process.exit(1);
}

// ── Command definitions ───────────────────────
// Add every slash command here.
// Keep these minimal — no logic, just name + description + options.

const commands = [
  new SlashCommandBuilder()
    .setName('home')
    .setDescription('Open your home dashboard'),

  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Create your character and begin your criminal career'),

  // ── Admin commands ────────────────────────
  new SlashCommandBuilder()
    .setName('gadmin')
    .setDescription('Open the admin panel (staff only)')
    .setDefaultMemberPermissions(0),
].map(cmd => cmd.toJSON());

// ── Register ──────────────────────────────────

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log(`📡  Registering ${commands.length} slash commands...`);

    let data;

    if (GUILD_ID) {
      // Guild deploy — instant, perfect for development
      data = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );
      console.log(`✅  Registered ${data.length} commands to guild ${GUILD_ID} (instant)`);
    } else {
      // Global deploy — takes up to 1 hour to propagate
      data = await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log(`✅  Registered ${data.length} commands globally (allow ~1hr to propagate)`);
    }

  } catch (err) {
    console.error('❌  Failed to register commands:', err);
    process.exit(1);
  }
})();
