// ─────────────────────────────────────────────
//  commands/dmtest.js  —  DEV ONLY.
//  Fires every DM type at the calling admin so they can
//  verify formatting without needing real game events.
//  Restricted to ADMIN_ROLE_ID.
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const dmService  = require('../utils/dmService');
const { broadcastWitness } = require('../services/witness');

const ADMIN_ROLE_ID = '1515717429282471946';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dmtest')
    .setDescription('DEV: fire all DM types at yourself to test formatting.')
    .setDefaultMemberPermissions(0),

  async execute(interaction) {
    if (!interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID)) {
      return interaction.reply({ content: '🚫 Admin only.', ephemeral: true });
    }

    const userId   = interaction.user.id;
    const client   = interaction.client;
    const serverId = interaction.guildId;

    await interaction.reply({ content: '📨 Sending test DMs...', ephemeral: true });

    // 1. Shot (non-lethal)
    dmService.dmShot(client, userId, {
      outcome:      'damage_player',
      attackerName: 'Tony Marchetti',
      damage:       35,
      newHp:        65,
      armourBroke:  false,
      headwearBroke: false,
    });

    // Small delay so DMs arrive in order
    await new Promise(r => setTimeout(r, 400));

    // 2. Kill
    dmService.dmShot(client, userId, {
      outcome:           'kill_player',
      attackerName:      'Tony Marchetti',
      cashStolen:        42000,
      bulletsStolen:     180,
      hospitalizedUntil: Date.now() + 1800000, // 30 min
      armourBroke:       true,
      headwearBroke:     false,
    });

    await new Promise(r => setTimeout(r, 400));

    // 3. Bodyguard killed
    dmService.dmBodyguardKilled(client, userId, {
      attackerName:          'Tony Marchetti',
      bgName:                'Vinny "Russo"',
      bgSlot:                4,
      remainingBodyguards:   false,
    });

    await new Promise(r => setTimeout(r, 400));

    // 4. Raid (normal — not evicted)
    dmService.dmRaid(client, userId, {
      raiderName:        'Joey Knuckles',
      businessName:      'Drug Lab',
      pendingStolen:     18500,
      newRaidCount:      3,
      ownerEvicted:      false,
      newRaidCountNeeded: 5,
    });

    await new Promise(r => setTimeout(r, 400));

    // 5. Raid (eviction)
    dmService.dmRaid(client, userId, {
      raiderName:        'Joey Knuckles',
      businessName:      'Drug Lab',
      pendingStolen:     22000,
      newRaidCount:      5,
      ownerEvicted:      true,
      newRaidCountNeeded: 5,
    });

    await new Promise(r => setTimeout(r, 400));

    // 6. Witness statement (shoot — non-lethal)
    broadcastWitness(client, serverId, {
      eventType:       'shoot_player',
      attackerId:      userId,   // pretend you're the attacker so the roll is skipped
      attackerName:    'Tony Marchetti',
      victimId:        'FAKE_VICTIM_ID',
      victimName:      'Bobby Diaz',
      state:           'New York',
      attackerRankIdx: 5,
    });

    await new Promise(r => setTimeout(r, 400));

    // 7. Witness statement (kill)
    broadcastWitness(client, serverId, {
      eventType:       'kill_player',
      attackerId:      'FAKE_ATTACKER_ID',
      attackerName:    'Tony Marchetti',
      victimId:        'FAKE_VICTIM_ID',
      victimName:      'Bobby Diaz',
      state:           'New York',
      attackerRankIdx: 5,
    });

    await interaction.editReply({ content: '✅ Sent 7 test DMs — check your DMs.' });
  },
};
