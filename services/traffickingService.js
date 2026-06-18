// ─────────────────────────────────────────────
//  traffickingService.js  —  All trafficking logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const { STATES, RANKS, ACTION_TYPES, UPGRADES } = require('../data/constants');
const playerRepository       = require('../repositories/playerRepository');
const traffickingRepository  = require('../repositories/traffickingRepository');
const logRepository          = require('../repositories/logRepository');

// ── Product definitions ───────────────────────

const PRODUCTS = {
  booze: {
    beer: {
      id: 'beer', name: 'Beer', type: 'booze',
      rankRequired: 0,
      basePrice: { buy: 80, sell: 160 },
    },
    spirits: {
      id: 'spirits', name: 'Spirits', type: 'booze',
      rankRequired: 4,
      basePrice: { buy: 200, sell: 400 },
    },
  },
  drugs: {
    weed: {
      id: 'weed', name: 'Weed', type: 'drugs',
      rankRequired: 1,
      basePrice: { buy: 100, sell: 250 },
    },
    cocaine: {
      id: 'cocaine', name: 'Cocaine', type: 'drugs',
      rankRequired: 4,
      basePrice: { buy: 500, sell: 1200 },
    },
    ecstasy: {
      id: 'ecstasy', name: 'Ecstasy', type: 'drugs',
      rankRequired: 7,
      basePrice: { buy: 800, sell: 2000 },
    },
    heroin: {
      id: 'heroin', name: 'Heroin', type: 'drugs',
      rankRequired: 9,
      basePrice: { buy: 1500, sell: 4000 },
    },
  },
};

// ── Helpers ───────────────────────────────────

function getDayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function seededRng(seed) {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generatePrices(dayKey) {
  const seed = dayKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 99991;
  const rng  = seededRng(seed);
  const prices = {};

  for (const state of STATES) {
    prices[state] = {};
    for (const category of ['booze', 'drugs']) {
      prices[state][category] = {};
      for (const [id, product] of Object.entries(PRODUCTS[category])) {
        const buyVariance  = 0.7 + rng() * 0.6;  // ±30%
        const sellVariance = 0.7 + rng() * 0.6;
        prices[state][category][id] = {
          buy:  Math.round(product.basePrice.buy  * buyVariance),
          sell: Math.round(product.basePrice.sell * sellVariance),
        };
      }
    }
  }

  return { dayKey, generatedAt: Date.now(), prices };
}

async function getPrices(serverId) {
  const dayKey = getDayKey();
  const stored = await traffickingRepository.getPrices(serverId);
  if (stored?.dayKey === dayKey) return stored;
  const fresh = generatePrices(dayKey);
  await traffickingRepository.setPrices(serverId, fresh);
  return fresh;
}

function getRankIndex(player) {
  const { RANKS } = require('../data/constants');
  const xp = player.xp ?? 0;
  let idx = 0;
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXP) { idx = i; break; }
  }
  return idx;
}

function getCapacity(player, type) {
  const upg  = player.upgrades ?? {};
  const base = type === 'booze'
    ? (UPGRADES.booze_capacity?.baseValue ?? 10) + (upg.booze_capacity ?? 0) * (UPGRADES.booze_capacity?.valuePerLevel ?? 5)
    : (UPGRADES.drug_capacity?.baseValue  ?? 10) + (upg.drug_capacity  ?? 0) * (UPGRADES.drug_capacity?.valuePerLevel  ?? 5);

  const prestige4Bonus = player.prestige4Perk === 'capacity' ? 20 : 0;
  return base + prestige4Bonus;
}

function getCarried(player, type) {
  const inv = player.inventory ?? {};
  if (type === 'booze') {
    return (inv.booze?.beer ?? 0) + (inv.booze?.spirits ?? 0);
  }
  return (inv.drugs?.weed ?? 0) + (inv.drugs?.cocaine ?? 0) + (inv.drugs?.ecstasy ?? 0) + (inv.drugs?.heroin ?? 0);
}

// ── Public API ────────────────────────────────

/**
 * Get trafficking state for a player — prices, inventory, capacity.
 */
async function getTraffickingState(serverId, discordId) {
  const player  = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {} };

  const priceData    = await getPrices(serverId);
  const rankIdx      = getRankIndex(player);
  const statePrices  = priceData.prices[player.state];
  const boozeCapacity = getCapacity(player, 'booze');
  const drugCapacity  = getCapacity(player, 'drugs');
  const boozeCarried  = getCarried(player, 'booze');
  const drugsCarried  = getCarried(player, 'drugs');

  // Filter to unlocked products only
  const unlockedBooze = Object.values(PRODUCTS.booze).filter(p => p.rankRequired <= rankIdx);
  const unlockedDrugs = Object.values(PRODUCTS.drugs).filter(p => p.rankRequired <= rankIdx);

  return {
    success: true,
    data: {
      player,
      rankIdx,
      state: player.state,
      statePrices,
      unlockedBooze,
      unlockedDrugs,
      boozeCapacity,
      drugCapacity,
      boozeCarried,
      drugsCarried,
      inventory: player.inventory ?? {},
    },
  };
}

/**
 * Buy units of a product.
 */
async function buy(serverId, discordId, productId, quantity) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {} };

  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot traffic while in jail.', data: {}, updates: {} };
  }
  if (player.hospitalizedUntil && Date.now() < player.hospitalizedUntil) {
    return { success: false, message: 'You cannot traffic while in hospital.', data: {}, updates: {} };
  }
  if (player.travelling && player.travelEndTime > Date.now()) {
    return { success: false, message: 'You cannot traffic while travelling.', data: {}, updates: {} };
  }

  // Find product
  const allProducts = { ...PRODUCTS.booze, ...PRODUCTS.drugs };
  const product = allProducts[productId];
  if (!product) return { success: false, message: 'Unknown product.', data: {}, updates: {} };

  // Rank check
  const rankIdx = getRankIndex(player);
  if (product.rankRequired > rankIdx) {
    return { success: false, message: `You need a higher rank to traffic ${product.name}.`, data: {}, updates: {} };
  }

  // Capacity check — declare type first
  const type     = product.type;
  const capacity = getCapacity(player, type);
  const carried  = getCarried(player, type);
  const space    = capacity - carried;

  // Buy cooldown check (set when player travels with stock)
  const cooldownKey    = type === 'booze' ? 'booze_buy' : 'drug_buy';
  const cooldownUntil  = player.cooldowns?.[cooldownKey] ?? 0;
  if (Date.now() < cooldownUntil) {
    return {
      success: false,
      message: `You recently travelled with ${type}. You can buy again <t:${Math.floor(cooldownUntil / 1000)}:R>.`,
      data: { onCooldown: true, cooldownUntil },
      updates: {},
    };
  }

  if (space <= 0) {
    return { success: false, message: `Your ${type} capacity is full (${carried}/${capacity}).`, data: {}, updates: {} };
  }

  const toBuy = Math.min(quantity, space);

  // Price check
  const priceData  = await getPrices(serverId);
  const price      = priceData.prices[player.state]?.[type]?.[productId]?.buy ?? product.basePrice.buy;
  const totalCost  = price * toBuy;

  if ((player.cash ?? 0) < totalCost) {
    return {
      success: false,
      message: `You need **$${totalCost.toLocaleString('en-US')}** for ${toBuy} units of ${product.name}. You have **$${(player.cash ?? 0).toLocaleString('en-US')}**.`,
      data: {},
      updates: {},
    };
  }

  // Check mixing state — can only buy from one state per type
  const inv = player.inventory ?? {};
  const boughtInState = type === 'booze' ? inv.booze?.boughtInState : inv.drugs?.boughtInState;
  if (boughtInState && boughtInState !== player.state && carried > 0) {
    return {
      success: false,
      message: `You already have ${type} bought in **${boughtInState}**. Sell it before buying more elsewhere.`,
      data: {},
      updates: {},
    };
  }

  // Apply
  const updates = { cash: (player.cash ?? 0) - totalCost };
  if (type === 'booze') {
    updates[`inventory.booze.${productId}`] = (inv.booze?.[productId] ?? 0) + toBuy;
    updates['inventory.booze.boughtInState'] = player.state;
  } else {
    updates[`inventory.drugs.${productId}`] = (inv.drugs?.[productId] ?? 0) + toBuy;
    updates['inventory.drugs.boughtInState'] = player.state;
  }

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'traffic_buy',
    location:   player.state,
    payload:    { productId, quantity: toBuy, totalCost },
  }).catch(() => {});

  return {
    success: true,
    message: `Bought **${toBuy}x ${product.name}** for **$${totalCost.toLocaleString('en-US')}**.${toBuy < quantity ? ` (capped at capacity)` : ''}`,
    data:    { productId, product, quantity: toBuy, totalCost, price },
    updates,
  };
}

/**
 * Sell all of a product type.
 * Auto-jail if selling in same state as purchase.
 * 15% arrest chance, 20% mugging chance even on legal sell.
 */
async function sell(serverId, discordId, type) {
  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {} };

  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot traffic while in jail.', data: {}, updates: {} };
  }

  const inv           = player.inventory ?? {};
  const boughtInState = type === 'booze' ? inv.booze?.boughtInState : inv.drugs?.boughtInState;
  const carried       = getCarried(player, type);

  if (carried <= 0) {
    return { success: false, message: `You have no ${type} to sell.`, data: {}, updates: {} };
  }

  // Same-state auto-jail
  if (boughtInState && boughtInState === player.state) {
    const jailTime    = 300; // 5 mins
    const jailedUntil = Date.now() + jailTime * 1000;
    const updates     = {
      jailedUntil,
      [`inventory.${type}`]: type === 'booze'
        ? { beer: 0, spirits: 0, boughtInState: null }
        : { weed: 0, cocaine: 0, ecstasy: 0, heroin: 0, boughtInState: null },
    };

    await playerRepository.updatePlayer(serverId, discordId, updates);

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.ECONOMY,
      actionName: 'traffic_bust',
      location:   player.state,
      payload:    { type, carried, reason: 'same_state' },
    }).catch(() => {});

    return {
      success: false,
      message: `🚔 Busted! You tried to sell ${type} in the same state you bought it. All stock seized and you've been jailed for 5 minutes.`,
      data:    { jailed: true, jailedUntil, stockSeized: true },
      updates,
    };
  }

  // Calculate earnings
  const priceData = await getPrices(serverId);
  const products  = type === 'booze' ? PRODUCTS.booze : PRODUCTS.drugs;
  let totalEarned = 0;

  for (const [id, product] of Object.entries(products)) {
    const qty   = type === 'booze' ? (inv.booze?.[id] ?? 0) : (inv.drugs?.[id] ?? 0);
    const price = priceData.prices[player.state]?.[type]?.[id]?.sell ?? product.basePrice.sell;
    totalEarned += qty * price;
  }

  // 20% mugging chance — lose 25% of value
  const mugged = Math.random() < 0.20;
  if (mugged) totalEarned = Math.floor(totalEarned * 0.75);

  // 15% arrest chance — jail + stock seized
  const arrested = Math.random() < 0.15;
  if (arrested) {
    const jailedUntil = Date.now() + 300000;
    const updates     = {
      jailedUntil,
      [`inventory.${type}`]: type === 'booze'
        ? { beer: 0, spirits: 0, boughtInState: null }
        : { weed: 0, cocaine: 0, ecstasy: 0, heroin: 0, boughtInState: null },
    };

    await playerRepository.updatePlayer(serverId, discordId, updates);

    logRepository.write(serverId, {
      discordId,
      actionType: ACTION_TYPES.ECONOMY,
      actionName: 'traffic_bust',
      location:   player.state,
      payload:    { type, carried, reason: 'arrested' },
    }).catch(() => {});

    return {
      success: false,
      message: `🚔 Arrested during the deal! All ${type} seized. Jailed for 5 minutes.`,
      data:    { jailed: true, jailedUntil, stockSeized: true, arrested: true },
      updates,
    };
  }

  // Clear stock and pay out
  const updates = {
    cash: (player.cash ?? 0) + totalEarned,
    [`inventory.${type}`]: type === 'booze'
      ? { beer: 0, spirits: 0, boughtInState: null }
      : { weed: 0, cocaine: 0, ecstasy: 0, heroin: 0, boughtInState: null },
  };

  if (type === 'booze') {
    updates['stats.boozeSold']    = (player.stats?.boozeSold    ?? 0) + carried;
    updates['stats.cashFromBooze'] = (player.stats?.cashFromBooze ?? 0) + totalEarned;
  } else {
    updates['stats.drugsSold']    = (player.stats?.drugsSold    ?? 0) + carried;
    updates['stats.cashFromDrugs'] = (player.stats?.cashFromDrugs ?? 0) + totalEarned;
  }

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'traffic_sell',
    location:   player.state,
    payload:    { type, carried, totalEarned, mugged },
  }).catch(() => {});

  const muggedMsg = mugged ? `\n⚠️ You got mugged on the way — lost 25% of the value.` : '';

  return {
    success: true,
    message: `Sold **${carried} units** of ${type} for **$${totalEarned.toLocaleString('en-US')}**.${muggedMsg}`,
    data:    { type, carried, totalEarned, mugged },
    updates,
  };
}

module.exports = { getTraffickingState, buy, sell, PRODUCTS };
