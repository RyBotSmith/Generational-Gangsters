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
    .setName('start')
    .setDescription('Create your character and begin your criminal career'),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your profile and stats'),

  new SlashCommandBuilder()
    .setName('crime')
    .setDescription('Commit a crime to earn cash and XP'),

  new SlashCommandBuilder()
    .setName('gta')
    .setDescription('Steal a car — melt it for bullets or sell it for cash'),

  new SlashCommandBuilder()
    .setName('travel')
    .setDescription('Travel to another state'),

  new SlashCommandBuilder()
    .setName('crew')
    .setDescription('Manage your crew'),

  new SlashCommandBuilder()
    .setName('attack')
    .setDescription('Search for and attack another player')
    .addUserOption(opt =>
      opt.setName('target')
         .setDescription('The player you want to attack')
         .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('business')
    .setDescription('View, buy, or manage your business'),

  new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Head to the casino'),

  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Buy weapons, armour, vehicles, and items'),

  new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Deposit, withdraw, or transfer money'),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the top players on this server'),

  // ── Admin commands ────────────────────────
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin tools')
    .setDefaultMemberPermissions(0) // hides from non-admins in Discord UI
    .addSubcommand(sub =>
      sub.setName('jail')
         .setDescription('Jail a player')
         .addUserOption(opt =>
           opt.setName('target').setDescription('Player to jail').setRequired(true)
         )
         .addIntegerOption(opt =>
           opt.setName('seconds').setDescription('Jail duration in seconds').setRequired(true)
         )
    )
    .addSubcommand(sub =>
      sub.setName('unjail')
         .setDescription('Release a player from jail')
         .addUserOption(opt =>
           opt.setName('target').setDescription('Player to release').setRequired(true)
         )
    )
    .addSubcommand(sub =>
      sub.setName('givecash')
         .setDescription('Give cash to a player')
         .addUserOption(opt =>
           opt.setName('target').setDescription('Player to give cash to').setRequired(true)
         )
         .addIntegerOption(opt =>
           opt.setName('amount').setDescription('Amount of cash').setRequired(true)
         )
    )
    .addSubcommand(sub =>
      sub.setName('resetplayer')
         .setDescription('Wipe a player\'s data entirely')
         .addUserOption(opt =>
           opt.setName('target').setDescription('Player to reset').setRequired(true)
         )
    )
    .addSubcommand(sub =>
      sub.setName('ban')
         .setDescription('Ban a player from the game')
         .addUserOption(opt =>
           opt.setName('target').setDescription('Player to ban').setRequired(true)
         )
         .addStringOption(opt =>
           opt.setName('reason').setDescription('Reason for ban').setRequired(false)
         )
    ),

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
