// ─────────────────────────────────────────────
//  witness.js  —  Witness statement DM broadcasts.
//  Rule: NO game logic beyond chance rolls. Fire-and-forget DMs.
//  Called by combatPanel after kill_player / kill_bodyguard outcomes.
// ─────────────────────────────────────────────

const {
  WITNESS_BASE_CHANCE,
  WITNESS_RANK_BONUS,
  WITNESS_MAX_CHANCE,
} = require('../data/constants');

const playerRepository = require('../repositories/playerRepository');
const logRepository    = require('../repositories/logRepository');
const embeds = require('../utils/embeds');

// ── Message variants ──────────────────────────

const SHOOT_PLAYER_MESSAGES = [
  (a, v, s) => `👀 You see **${a}** open fire on **${v}** in the streets of ${s}, but they stagger away alive.`,
  (a, v, s) => `🔫 Gunfire echoes through ${s} — **${a}** just unloaded on **${v}**, who barely escapes.`,
  (a, v, s) => `😨 You witness **${a}** gun down at **${v}** in ${s}. They're wounded but still standing.`,
  (a, v, s) => `🚨 Word spreads fast: **${a}** shot at **${v}** in ${s} and missed the kill.`,
  (a, v, s) => `💢 **${a}** corners **${v}** in ${s} and opens fire — ${v} survives, for now.`,
];

const KILL_PLAYER_MESSAGES = [
  (a, v, s) => `💀 **${a}** just executed **${v}** in cold blood on the streets of ${s}.`,
  (a, v, s) => `⚰️ Word on the street: **${a}** killed **${v}** in ${s}. Nobody's safe.`,
  (a, v, s) => `🩸 You watch **${a}** gun down **${v}** in ${s} and walk away like nothing happened.`,
  (a, v, s) => `📰 Breaking: **${a}** has taken out **${v}** in ${s}. The body count rises.`,
];

const KILL_BODYGUARD_MESSAGES = [
  (a, v, s) => `🛡️ **${a}** just took down one of **${v}**'s bodyguards in ${s}.`,
  (a, v, s) => `💥 A bodyguard hits the ground — **${a}** is making moves against **${v}** in ${s}.`,
  (a, v, s) => `🔥 **${a}** is tearing through **${v}**'s protection in ${s}. One bodyguard down.`,
];

const MESSAGE_SETS = {
  shoot_player:   SHOOT_PLAYER_MESSAGES,
  kill_player:    KILL_PLAYER_MESSAGES,
  kill_bodyguard: KILL_BODYGUARD_MESSAGES,
};

// ── Helpers ────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Witness chance for a given attacker rank index.
 * witnessChance = min(baseChance + rankIdx * rankBonus, maxChance)
 */
function getWitnessChance(attackerRankIdx) {
  return Math.min(
    WITNESS_BASE_CHANCE + (attackerRankIdx ?? 0) * WITNESS_RANK_BONUS,
    WITNESS_MAX_CHANCE
  );
}

// ── Public API ─────────────────────────────────

/**
 * Broadcast a witness event via DM to a random subset of eligible players.
 * Eligible = alive, in the same state, not the attacker, not the victim.
 *
 * Fire-and-forget — never throws, never blocks the caller.
 *
 * @param {object} client            - discord.js Client (for fetching users to DM)
 * @param {string} serverId
 * @param {object} params
 * @param {string} params.eventType  - 'shoot_player' | 'kill_player' | 'kill_bodyguard'
 * @param {string} params.attackerId
 * @param {string} params.attackerName
 * @param {string} params.victimId
 * @param {string} params.victimName
 * @param {string} params.state
 * @param {number} params.attackerRankIdx
 */
async function broadcastWitness(client, serverId, params) {
  try {
    const {
      eventType,
      attackerId,
      attackerName,
      victimId,
      victimName,
      state,
      attackerRankIdx = 0,
    } = params;

    const messageSet = MESSAGE_SETS[eventType];
    if (!messageSet) return;

    const chance = getWitnessChance(attackerRankIdx);

    const candidates = await playerRepository.getAlivePlayersInState(serverId, state);
    const eligible = candidates.filter(
      p => p.discordId !== attackerId && p.discordId !== victimId
    );

    const witnesses = eligible.filter(() => Math.random() < chance);

    if (witnesses.length === 0) return;

    const messageFn = pick(messageSet);
    const text = messageFn(attackerName ?? 'A gangster', victimName ?? 'someone', state ?? 'the city');

    const embed = embeds.base(embeds.COLOURS.dark)
      .setTitle('👁️ You Witnessed Something')
      .setDescription(text);

    let dmCount = 0;
    for (const witness of witnesses) {
      try {
        const user = await client.users.fetch(witness.discordId);
        await user.send({ embeds: [embed] });
        dmCount++;
      } catch {
        // User has DMs closed or fetch failed — skip silently
      }
    }

    logRepository.write(serverId, {
      discordId: attackerId,
      actionType: 'COMBAT',
      actionName: 'witness_event',
      location: state,
      payload: {
        eventType,
        attackerId,
        victimId,
        eligibleCount: eligible.length,
        witnessCount: witnesses.length,
        dmCount,
        message: text,
      },
    }).catch(() => {});

  } catch (err) {
    console.error('[witness] broadcastWitness failed:', err);
  }
}

module.exports = {
  broadcastWitness,
  getWitnessChance,
};
