// ─────────────────────────────────────────────
//  constants.js  —  ALL game data. No functions.
// ─────────────────────────────────────────────

// ── RANKS ────────────────────────────────────
const RANKS = [
  { index: 0, name: 'Hobo',               minXP: 0       },
  { index: 1, name: 'Petty Criminal',     minXP: 200     },
  { index: 2, name: 'Street Thug',        minXP: 1000    },
  { index: 3, name: 'Gangster',           minXP: 3000    },
  { index: 4, name: 'Hitman',             minXP: 8000    },
  { index: 5, name: 'Assassin',           minXP: 20000   },
  { index: 6, name: 'Underboss',          minXP: 50000   },
  { index: 7, name: 'Boss',               minXP: 120000  },
  { index: 8, name: 'Godfather',          minXP: 300000  },
  { index: 9, name: 'Infamous Gangster',  minXP: 1000000 },
];

// ── STATES ───────────────────────────────────
const STATES = [
  'New York',
  'Miami',
  'Chicago',
  'Detroit',
  'Los Angeles',
  'Las Vegas',
];

// ── CRIMES ───────────────────────────────────
// cooldown in seconds, baseCash [min, max], baseXP [min, max], jailTime in seconds
const CRIMES = {
  pickpocket: {
    id: 'pickpocket',
    name: 'Pickpocket',
    rankRequired: 0,
    cooldown: 60,
    successRate: 0.80,
    baseCash: [50, 200],
    baseXP: [5, 15],
    jailTime: 60,
    bulletReward: false,
  },
  mugging: {
    id: 'mugging',
    name: 'Mugging',
    rankRequired: 1,
    cooldown: 120,
    successRate: 0.75,
    baseCash: [200, 600],
    baseXP: [10, 25],
    jailTime: 120,
    bulletReward: false,
  },
  carjacking: {
    id: 'carjacking',
    name: 'Carjacking',
    rankRequired: 2,
    cooldown: 180,
    successRate: 0.70,
    baseCash: [500, 1500],
    baseXP: [20, 50],
    jailTime: 180,
    bulletReward: false,
  },
  drug_deal: {
    id: 'drug_deal',
    name: 'Drug Deal',
    rankRequired: 2,
    cooldown: 240,
    successRate: 0.70,
    baseCash: [800, 2500],
    baseXP: [25, 60],
    jailTime: 240,
    bulletReward: false,
  },
  arson: {
    id: 'arson',
    name: 'Arson',
    rankRequired: 3,
    cooldown: 480,
    successRate: 0.65,
    baseCash: [2000, 6000],
    baseXP: [50, 120],
    jailTime: 480,
    bulletReward: false,
  },
  bank_robbery: {
    id: 'bank_robbery',
    name: 'Bank Robbery',
    rankRequired: 3,
    cooldown: 600,
    successRate: 0.60,
    baseCash: [5000, 15000],
    baseXP: [80, 180],
    jailTime: 600,
    bulletReward: false,
  },
  assassination: {
    id: 'assassination',
    name: 'Assassination',
    rankRequired: 4,
    cooldown: 900,
    successRate: 0.55,
    baseCash: [10000, 30000],
    baseXP: [150, 300],
    jailTime: 900,
    bulletReward: false,
  },
  casino_heist: {
    id: 'casino_heist',
    name: 'Casino Heist',
    rankRequired: 5,
    cooldown: 1800,
    successRate: 0.50,
    baseCash: [30000, 80000],
    baseXP: [300, 600],
    jailTime: 1200,
    bulletReward: false,
  },
  kidnapping: {
    id: 'kidnapping',
    name: 'Kidnapping',
    rankRequired: 6,
    cooldown: 2400,
    successRate: 0.45,
    baseCash: [50000, 150000],
    baseXP: [500, 1000],
    jailTime: 1800,
    bulletReward: false,
  },
  armoured_robbery: {
    id: 'armoured_robbery',
    name: 'Armoured Robbery',
    rankRequired: 7,
    cooldown: 3600,
    successRate: 0.40,
    baseCash: [100000, 300000],
    baseXP: [800, 1500],
    jailTime: 2400,
    bulletReward: true,
    bulletRange: [250, 500],
  },
  federal_mint: {
    id: 'federal_mint',
    name: 'Federal Mint',
    rankRequired: 8,
    cooldown: 7200,
    successRate: 0.35,
    baseCash: [300000, 800000],
    baseXP: [1500, 3000],
    jailTime: 3600,
    bulletReward: true,
    bulletRange: [250, 500],
  },
  gov_blackmail: {
    id: 'gov_blackmail',
    name: 'Government Blackmail',
    rankRequired: 9,
    cooldown: 14400,
    successRate: 0.30,
    baseCash: [500000, 1500000],
    baseXP: [3000, 6000],
    jailTime: 7200,
    bulletReward: false,
  },
};

// Crime failure → jail probability
const CRIME_JAIL_CHANCE = 0.40;

// ── GTA ──────────────────────────────────────
const GTA_COOLDOWN       = 300;   // seconds
const GTA_BASE_RATE      = 0.60;
const GTA_MAX_RATE       = 0.92;
const GTA_JAIL_CHANCE    = 0.35;
const GTA_JAIL_TIME      = 300;   // seconds
const GTA_XP_RANGE       = [5, 15];

// ── CARS ─────────────────────────────────────
// rankRequired = minimum rank to steal; meltBullets = bullets from melting; value = sell price
const CARS = {
  civic: {
    id: 'civic', name: 'Honda Civic',
    rankRequired: 0, meltBullets: 10, value: 1500,
  },
  van: {
    id: 'van', name: 'Transit Van',
    rankRequired: 0, meltBullets: 15, value: 2000,
  },
  mustang: {
    id: 'mustang', name: 'Ford Mustang',
    rankRequired: 1, meltBullets: 20, value: 4000,
  },
  pickup: {
    id: 'pickup', name: 'Pickup Truck',
    rankRequired: 1, meltBullets: 25, value: 5000,
  },
  bmw: {
    id: 'bmw', name: 'BMW 3 Series',
    rankRequired: 2, meltBullets: 35, value: 9000,
  },
  police: {
    id: 'police', name: 'Police Cruiser',
    rankRequired: 2, meltBullets: 40, value: 10000,
  },
  porsche: {
    id: 'porsche', name: 'Porsche 911',
    rankRequired: 3, meltBullets: 55, value: 22000,
  },
  mercedes: {
    id: 'mercedes', name: 'Mercedes S-Class',
    rankRequired: 3, meltBullets: 60, value: 25000,
  },
  armoured: {
    id: 'armoured', name: 'Armoured SUV',
    rankRequired: 4, meltBullets: 90, value: 50000,
  },
  lambo: {
    id: 'lambo', name: 'Lamborghini Huracán',
    rankRequired: 4, meltBullets: 100, value: 60000,
  },
  ferrari: {
    id: 'ferrari', name: 'Ferrari F8',
    rankRequired: 5, meltBullets: 120, value: 80000,
  },
  mclaren: {
    id: 'mclaren', name: 'McLaren 720S',
    rankRequired: 5, meltBullets: 130, value: 90000,
  },
  rolls: {
    id: 'rolls', name: 'Rolls-Royce Ghost',
    rankRequired: 6, meltBullets: 160, value: 120000,
  },
  bentley: {
    id: 'bentley', name: 'Bentley Continental',
    rankRequired: 6, meltBullets: 180, value: 140000,
  },
  bugatti: {
    id: 'bugatti', name: 'Bugatti Chiron',
    rankRequired: 7, meltBullets: 200, value: 200000,
  },
  pagani: {
    id: 'pagani', name: 'Pagani Huayra',
    rankRequired: 7, meltBullets: 220, value: 220000,
  },
  koenigsegg: {
    id: 'koenigsegg', name: 'Koenigsegg Jesko',
    rankRequired: 8, meltBullets: 260, value: 300000,
  },
  rimac: {
    id: 'rimac', name: 'Rimac Nevera',
    rankRequired: 8, meltBullets: 280, value: 320000,
  },
  hypercar: {
    id: 'hypercar', name: 'Hypercar X',
    rankRequired: 9, meltBullets: 400, value: 500000,
  },
  prototype: {
    id: 'prototype', name: 'Black Prototype',
    rankRequired: 9, meltBullets: 500, value: 650000,
  },
};

// ── WEAPONS ──────────────────────────────────
// reduction = fraction off bullets-to-kill; durabilityShots = uses; durabilityKills = player kills
const WEAPONS = {
  flip_knife: {
    id: 'flip_knife', name: 'Flip Knife',
    cost: 1500,
    reduction: 0.10, crimeBonus: 0.02, gtaBonus: 0,
    durabilityShots: 15, durabilityKills: 5,
  },
  machete: {
    id: 'machete', name: 'Machete',
    cost: 4000,
    reduction: 0.18, crimeBonus: 0.03, gtaBonus: 0,
    durabilityShots: 15, durabilityKills: 5,
  },
  pistol: {
    id: 'pistol', name: 'Pistol',
    cost: 8000,
    reduction: 0.25, crimeBonus: 0.04, gtaBonus: 0.02,
    durabilityShots: 15, durabilityKills: 5,
  },
  uzi: {
    id: 'uzi', name: 'Uzi',
    cost: 25000,
    reduction: 0.40, crimeBonus: 0.05, gtaBonus: 0.03,
    durabilityShots: 15, durabilityKills: 5,
  },
  p90: {
    id: 'p90', name: 'P90',
    cost: 28000,
    reduction: 0.40, crimeBonus: 0.05, gtaBonus: 0.03,
    durabilityShots: 15, durabilityKills: 5,
  },
  thompson: {
    id: 'thompson', name: 'Thompson',
    cost: 35000,
    reduction: 0.47, crimeBonus: 0.06, gtaBonus: 0.04,
    durabilityShots: 15, durabilityKills: 5,
  },
  ak47: {
    id: 'ak47', name: 'AK-47',
    cost: 75000,
    reduction: 0.55, crimeBonus: 0.07, gtaBonus: 0.05,
    durabilityShots: 15, durabilityKills: 5,
  },
  m16: {
    id: 'm16', name: 'M16',
    cost: 78000,
    reduction: 0.55, crimeBonus: 0.07, gtaBonus: 0.05,
    durabilityShots: 15, durabilityKills: 5,
  },
  l115: {
    id: 'l115', name: 'L115 Sniper',
    cost: 400000,
    reduction: 0.70, crimeBonus: 0.08, gtaBonus: 0,
    durabilityShots: 15, durabilityKills: 5,
  },
};

// ── ARMOUR ───────────────────────────────────
// armorBonus = fraction added to bullets-to-kill for attacker; durabilityShots / deaths before break
const ARMOUR = {
  leather_jacket: {
    id: 'leather_jacket', name: 'Leather Jacket',
    cost: 5000,
    slot: 'armour', armorBonus: 0.10,
    durabilityShots: 15, durabilityDeaths: 2,
  },
  vest: {
    id: 'vest', name: 'Bulletproof Vest',
    cost: 18000,
    slot: 'armour', armorBonus: 0.25,
    durabilityShots: 15, durabilityDeaths: 2,
  },
  mil_vest: {
    id: 'mil_vest', name: 'Military Vest',
    cost: 45000,
    slot: 'armour', armorBonus: 0.40,
    durabilityShots: 15, durabilityDeaths: 2,
  },
  specvest: {
    id: 'specvest', name: 'Special Forces Vest',
    cost: 120000,
    slot: 'armour', armorBonus: 0.60,
    durabilityShots: 15, durabilityDeaths: 2,
  },
  baseball_cap: {
    id: 'baseball_cap', name: 'Baseball Cap',
    cost: 3000,
    slot: 'headwear', armorBonus: 0.08,
    durabilityShots: 15, durabilityDeaths: 2,
  },
  helmet: {
    id: 'helmet', name: 'Combat Helmet',
    cost: 80000,
    slot: 'headwear', armorBonus: 0.35,
    durabilityShots: 15, durabilityDeaths: 2,
  },
  ballistic_helmet: {
    id: 'ballistic_helmet', name: 'Ballistic Helmet',
    cost: 22000,
    slot: 'headwear', armorBonus: 0.18,
    durabilityShots: 15, durabilityDeaths: 2,
  },
};

// ── VEHICLES (shop — equip for crime/GTA bonuses) ────────
// Distinct from CARS (GTA steal pool). These are purchased and equipped.
const VEHICLES = {
  bicycle: {
    id: 'bicycle', name: 'Bicycle',
    cost: 500, crimeBonus: 0, gtaBonus: 0.03,
    description: '+3% GTA steal chance.',
  },
  scooter: {
    id: 'scooter', name: 'Scooter',
    cost: 2000, crimeBonus: 0.02, gtaBonus: 0.05,
    description: '+2% crime success. +5% GTA steal chance.',
  },
  getaway_car: {
    id: 'getaway_car', name: 'Getaway Car',
    cost: 8000, crimeBonus: 0.05, gtaBonus: 0.08,
    description: '+5% crime success. +8% GTA steal chance.',
  },
  motorbike: {
    id: 'motorbike', name: 'Motorbike',
    cost: 18000, crimeBonus: 0.08, gtaBonus: 0.12,
    description: '+8% crime success. +12% GTA steal chance.',
  },
  super_motorbike: {
    id: 'super_motorbike', name: 'Super Motorbike',
    cost: 40000, crimeBonus: 0.12, gtaBonus: 0.18,
    description: '+12% crime success. +18% GTA steal chance.',
  },
  armoured_van: {
    id: 'armoured_van', name: 'Armoured Van',
    cost: 120000, crimeBonus: 0.18, gtaBonus: 0.22,
    description: '+18% crime success. +22% GTA steal chance.',
  },
};


// Base bullets required to kill a player at each rank index (0–9)
const RANK_KILL_BULLETS = [200, 300, 450, 650, 900, 1200, 1600, 2100, 2800, 3600];

const BODYGUARD_KILL_BULLETS = 100; // flat, ignores armour/weapon

// Death penalties
const DEATH_CASH_LOSS_PCT  = 0.30; // victim loses 30% cash on hand
const DEATH_BULLET_LOSS_PCT_MIN = 0.15;
const DEATH_BULLET_LOSS_PCT_MAX = 0.25;
const DEATH_RESPAWN_SECONDS = 1800; // 30 minutes

// Bodyguard purchase costs by slot (1-indexed).
// Slot 4 is the most expensive AND the first line of defence.
const BODYGUARD_COSTS = {
  1: 5000,
  2: 25000,
  3: 75000,
  4: 200000,
};

// Attack order: highest slot number is targeted first.
// Attacker resolves slots 4 → 3 → 2 → 1 → Player.
// Dead slots are skipped; positions never collapse.
// Service must iterate [4, 3, 2, 1] and skip slots where alive === false.
const BODYGUARD_ATTACK_ORDER = [4, 3, 2, 1];

// Combat search costs
const SEARCH_PLAYER_COST     = 5000;
const SEARCH_BODYGUARD_COST  = 10000;
const SEARCH_INTEL_EXPIRY    = 10800; // 3 hours in seconds

// ── TRAVEL ───────────────────────────────────
const TRAVEL_TIERS = {
  hitchhike: {
    id: 'hitchhike', name: 'Hitchhike',
    cost: 0, timeSeconds: 300, dailyLimit: null,
  },
  standard: {
    id: 'standard', name: 'Standard Flight',
    cost: 1000, timeSeconds: 240, dailyLimit: null,
  },
  upgraded: {
    id: 'upgraded', name: 'Upgraded Premium',
    cost: 2000, timeSeconds: 180, dailyLimit: null,
  },
  premium: {
    id: 'premium', name: 'Premium Jet',
    cost: 5000, timeSeconds: 10, dailyLimit: 5,
  },
};

// ── BUSINESSES ───────────────────────────────
const BUSINESS_TYPES = {
  bar: {
    id: 'bar',
    name: 'Bar',
    category: 'legal',
    buyCost: 50000,
    incomePerHr: 5000,
    maxLevel: 5,
    upgradeMult: 2,
    raidBase: null,
    homeState: 'New York',
    boozeCapacityBonus: 5,
  },
  drug_lab: {
    id: 'drug_lab',
    name: 'Drug Lab',
    category: 'illegal',
    buyCost: 500000,
    incomePerHr: 50000,
    maxLevel: 5,
    upgradeMult: 2,
    raidBase: 0.50,
    homeState: 'Miami',
    drugCapacityBonus: 5,
  },
  casino: {
    id: 'casino',
    name: 'Back-Door Casino',
    category: 'illegal',
    buyCost: 200000,
    incomePerHr: 20000,
    maxLevel: 5,
    upgradeMult: 2,
    raidBase: 0.60,
    homeState: 'Chicago',
  },
};

// Collect cooldown (seconds), pending cap (hours of income)
const BUSINESS_COLLECT_COOLDOWN = 1800; // 30 minutes
const BUSINESS_MAX_PENDING_HOURS = 24;
const BUSINESS_RAID_COOLDOWN    = 7200; // 2 hours
const BUSINESS_RAIDS_TO_LOSE    = 5;

// ── CREW ─────────────────────────────────────
const CREW_CREATION_COST    = 25000;
const CREW_BASE_CAPACITY    = 2;
const CREW_MAX_CAPACITY     = 6;

const CREW_UPGRADES = {
  fail_chance: {
    id: 'fail_chance', name: 'Reduce Fail Chance',
    maxLevel: 3, bonusPerLevel: 0.02,   // -2% per level
  },
  arrest_chance: {
    id: 'arrest_chance', name: 'Reduce Arrest Chance',
    maxLevel: 3, bonusPerLevel: 0.05,   // -5% per level
  },
  stop_search: {
    id: 'stop_search', name: 'Reduce Stop & Search',
    maxLevel: 2, bonusPerLevel: 0.10,   // -10% per level
  },
  collect_cooldown: {
    id: 'collect_cooldown', name: 'Reduce Collect Cooldown',
    maxLevel: 3, bonusPerLevel: 300,    // -5 min (300s) per level
  },
};

// Crew worker slots
const CREW_WORKER_SLOTS = {
  1: { cost: 10000,  unlocksAtCrewLevel: 1 },
  2: { cost: 25000,  unlocksAtCrewLevel: 2 },
  3: { cost: 50000,  unlocksAtCrewLevel: 3 },
  4: { cost: 100000, unlocksAtCrewLevel: 4 },
  5: { cost: 250000, unlocksAtCrewLevel: 5 },
  6: { cost: 500000, unlocksAtCrewLevel: 6 },
};

const CREW_WORKER_COOLDOWN_MULT = 0.80; // workers run at 80% of player cooldown (-20%)
const CREW_WORKER_ARREST_CHANCE = 0.10;
const CREW_WORKER_FAIL_CHANCE   = 0.20;
const CREW_WORKER_SEIZURE_CHANCE = 0.05;
const CREW_WORKER_ARREST_PAUSE  = 600; // seconds


// ── ORGANISED CRIME (OC) ─────────────────────
const OC_TYPES = {
  drug_run: {
    id: 'drug_run', name: 'Drug Run',
    minPlayers: 2, maxPlayers: 4,
    minRank: 1, cooldown: 7200,
    successRate: 0.65,
    cashRange: [5000, 15000],
    xpRange: [150, 300],
  },
  warehouse_raid: {
    id: 'warehouse_raid', name: 'Warehouse Raid',
    minPlayers: 2, maxPlayers: 4,
    minRank: 3, cooldown: 14400,
    successRate: 0.55,
    cashRange: [20000, 60000],
    xpRange: [400, 700],
  },
  armoured_van: {
    id: 'armoured_van', name: 'Armoured Van',
    minPlayers: 3, maxPlayers: 4,
    minRank: 5, cooldown: 28800,
    successRate: 0.45,
    cashRange: [75000, 200000],
    xpRange: [800, 1500],
  },
  bank_job: {
    id: 'bank_job', name: 'Bank Job',
    minPlayers: 4, maxPlayers: 4,
    minRank: 7, cooldown: 86400,
    successRate: 0.35,
    cashRange: [300000, 1000000],
    xpRange: [2000, 5000],
  },
};

const OC_LINK_EXPIRY       = 21600; // 6 hours in seconds
const OC_CRITICAL_FAIL_PCT = 0.20; // roll below 20% of success rate → all jailed

// ── GAMBLING ─────────────────────────────────
const GAMBLE_MIN_BET       = 10;
const GAMBLE_MAX_BET       = 250000;
const GAMBLE_NUMBER_MAX    = 2000;
const GAMBLE_MAX_RETURN    = 5000000;
const GAMBLE_COIN_WIN_PCT  = 0.49;

// ── ITEMS / MEDICAL ──────────────────────────
const MEDICAL_ITEMS = {
  med_kit: {
    id: 'med_kit', name: 'Med Kit',
    cost: 2000, hpRestore: 20, cooldown: 120,
  },
  first_aid_kit: {
    id: 'first_aid_kit', name: 'First Aid Kit',
    cost: 50000, hpRestore: 80, cooldown: 900,
  },
};

// ── SHOP STATE POOLS ─────────────────────────
// Defines which items CAN appear in each state's weekly rotation.
// Weekly rotation picks from these pools randomly.
// Consumables are available everywhere always.
// Vehicles only in 3 states (randomly rotated weekly).

const SHOP_POOLS = {
  weapons: {
    'New York':    ['flip_knife', 'machete', 'pistol'],
    'Miami':       ['pistol', 'uzi', 'p90'],
    'Chicago':     ['machete', 'thompson', 'ak47'],
    'Detroit':     ['flip_knife', 'uzi', 'thompson'],
    'Los Angeles': ['p90', 'ak47', 'm16'],
    'Las Vegas':   ['pistol', 'm16', 'l115'],
  },
  armour: {
    'New York':    ['leather_jacket', 'vest'],
    'Miami':       ['vest', 'mil_vest'],
    'Chicago':     ['leather_jacket', 'mil_vest'],
    'Detroit':     ['leather_jacket', 'vest'],
    'Los Angeles': ['mil_vest', 'specvest'],
    'Las Vegas':   ['vest', 'specvest'],
  },
  headwear: {
    'New York':    ['baseball_cap', 'helmet'],
    'Miami':       ['baseball_cap', 'ballistic_helmet'],
    'Chicago':     ['helmet', 'ballistic_helmet'],
    'Detroit':     ['baseball_cap', 'helmet'],
    'Los Angeles': ['helmet', 'ballistic_helmet'],
    'Las Vegas':   ['baseball_cap', 'ballistic_helmet'],
  },
  // Vehicles rotate — only 3 states get vehicles each week
  // The weekly generator picks 3 states and assigns vehicle pools
  vehicles: {
    pool: ['bicycle', 'scooter', 'getaway_car', 'motorbike', 'super_motorbike', 'armoured_van'],
    statesCount: 3, // how many states get vehicles each week
    // State with most vehicles gets 2, others get 1
    bonusState: true,
  },
  consumables: ['med_kit', 'first_aid_kit'], // always available everywhere
};

// Shop config Firestore path: servers/{serverId}/config/shop
// Regenerated weekly on Monday midnight UTC.
// Shape: { generatedAt, weekKey, states: { [stateName]: { weapons, armour, headwear, vehicles, consumables } } }


const UPGRADES = {
  bank_vault: {
    id: 'bank_vault',
    name: 'Bank Vault',
    description: 'Doubles your bank deposit limit. Base: $100,000.',
    baseCost: 50000,
    costMultiplier: 2.0,
    maxLevel: 10,
    // value handled by getBankLimit() in helpers — doubles each level
  },
  booze_capacity: {
    id: 'booze_capacity',
    name: 'Booze Storage',
    description: '+5 booze carry capacity per level. Base: 10 cases.',
    baseCost: 2000,
    costMultiplier: 1.5,
    maxLevel: 10,
    valuePerLevel: 5,
    baseValue: 10,
  },
  drug_capacity: {
    id: 'drug_capacity',
    name: 'Drug Storage',
    description: '+5 drug carry capacity per level. Base: 10 units.',
    baseCost: 3000,
    costMultiplier: 1.5,
    maxLevel: 10,
    valuePerLevel: 5,
    baseValue: 10,
  },
  garage_size: {
    id: 'garage_size',
    name: 'Garage Extension',
    description: '+2 garage slots per level. Base: 5 slots.',
    baseCost: 6000,
    costMultiplier: 1.8,
    maxLevel: 5,
    valuePerLevel: 2,
    baseValue: 5,
  },
  crime_cooldown: {
    id: 'crime_cooldown',
    name: 'Hustle Training',
    description: 'Reduces all crime cooldowns by 8% per level.',
    baseCost: 12000,
    costMultiplier: 2.5,
    maxLevel: 5,
    valuePerLevel: 0.08, // multiplier reduction per level
  },
  gta_cooldown: {
    id: 'gta_cooldown',
    name: 'Hot-Wire Pro',
    description: 'Reduces GTA cooldown by 30 seconds per level.',
    baseCost: 8000,
    costMultiplier: 2.0,
    maxLevel: 5,
    valuePerLevel: 30, // seconds reduction per level
  },
};


const PRESTIGE_MAX         = 5;
const PRESTIGE_REQUIRE_XP  = 1000000; // must be rank 9 (Infamous Gangster)
const PRESTIGE_CRIME_BONUS = 0.10;    // +10% success rate per prestige (stacks)

// ── PROTECTION ───────────────────────────────
const WITNESS_PROTECTION_COST     = 100000;
const WITNESS_PROTECTION_DURATION = 10800; // 3 hours

// ── WITNESS STATEMENTS ───────────────────────
const WITNESS_BASE_CHANCE  = 0.10;
const WITNESS_RANK_BONUS   = 0.05; // per rank index
const WITNESS_MAX_CHANCE   = 0.55;

// ── ECONOMY ──────────────────────────────────
const BAIL_MINIMUM         = 100;
const BAIL_PER_SECOND      = 10;

// Marketplace limits
const MARKET_MAX_CASH      = 1000000;
const MARKET_MAX_CARS      = 10;
const MARKET_MAX_BULLETS   = 50000;
const MARKET_LISTING_EXPIRY = 86400; // 24 hours

// ── ACTION TYPES (log categories) ────────────
const ACTION_TYPES = {
  CRIME:   'CRIME',
  COMBAT:  'COMBAT',
  GTA:     'GTA',
  ECONOMY: 'ECONOMY',
  GAMBLE:  'GAMBLE',
  TRAVEL:  'TRAVEL',
  SOCIAL:  'SOCIAL',
  JAILBREAK_SUCCESS: "jailbreak_success",
  JAILBREAK_CAUGHT:  "jailbreak_caught",
  JAILBREAK_FAIL:    "jailbreak_fail",
};

// ── INTERACTION PREFIXES ─────────────────────
// Used by the router in index.js to dispatch interactions
const PREFIXES = {
  PANEL:     'panel_',   // standard button/select panels
  PANEL_MOB: 'panelm_',  // mobile panel variants
  ADMIN:     'ap2_',     // admin panel buttons
  ADMIN_MOB: 'apm2_',    // admin panel mobile buttons
};

module.exports = {
  RANKS,
  STATES,
  CRIMES,
  CRIME_JAIL_CHANCE,
  GTA_COOLDOWN,
  GTA_BASE_RATE,
  GTA_MAX_RATE,
  GTA_JAIL_CHANCE,
  GTA_JAIL_TIME,
  GTA_XP_RANGE,
  CARS,
  WEAPONS,
  ARMOUR,
  VEHICLES,
  UPGRADES,
  SHOP_POOLS,
  RANK_KILL_BULLETS,
  BODYGUARD_KILL_BULLETS,
  DEATH_CASH_LOSS_PCT,
  DEATH_BULLET_LOSS_PCT_MIN,
  DEATH_BULLET_LOSS_PCT_MAX,
  DEATH_RESPAWN_SECONDS,
  BODYGUARD_COSTS,
  BODYGUARD_ATTACK_ORDER,
  SEARCH_PLAYER_COST,
  SEARCH_BODYGUARD_COST,
  SEARCH_INTEL_EXPIRY,
  TRAVEL_TIERS,
  BUSINESS_TYPES,
  BUSINESS_COLLECT_COOLDOWN,
  BUSINESS_MAX_PENDING_HOURS,
  BUSINESS_RAID_COOLDOWN,
  BUSINESS_RAIDS_TO_LOSE,
  CREW_CREATION_COST,
  CREW_BASE_CAPACITY,
  CREW_MAX_CAPACITY,
  CREW_UPGRADES,
  CREW_WORKER_SLOTS,
  CREW_WORKER_COOLDOWN_MULT,
  CREW_WORKER_ARREST_CHANCE,
  CREW_WORKER_FAIL_CHANCE,
  CREW_WORKER_SEIZURE_CHANCE,
  CREW_WORKER_ARREST_PAUSE,
  OC_TYPES,
  OC_LINK_EXPIRY,
  OC_CRITICAL_FAIL_PCT,
  GAMBLE_MIN_BET,
  GAMBLE_MAX_BET,
  GAMBLE_NUMBER_MAX,
  GAMBLE_MAX_RETURN,
  GAMBLE_COIN_WIN_PCT,
  MEDICAL_ITEMS,
  PRESTIGE_MAX,
  PRESTIGE_REQUIRE_XP,
  PRESTIGE_CRIME_BONUS,
  WITNESS_PROTECTION_COST,
  WITNESS_PROTECTION_DURATION,
  WITNESS_BASE_CHANCE,
  WITNESS_RANK_BONUS,
  WITNESS_MAX_CHANCE,
  BAIL_MINIMUM,
  BAIL_PER_SECOND,
  MARKET_MAX_CASH,
  MARKET_MAX_CARS,
  MARKET_MAX_BULLETS,
  MARKET_LISTING_EXPIRY,
  ACTION_TYPES,
  PREFIXES,
};
