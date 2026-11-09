import { CivilizationType } from "@/types";

/* Mirrors of server/src/warConfig.ts and env defaults (the server stays the source of truth) */
/** Food per home-garrison soldier per harvest */
export const SOLDIER_FOOD_UPKEEP = 1;
/** Cost to arm one civilian as a soldier */
export const MOBILIZATION_COST = { iron: 2, food: 5 } as const;
/** Cost of one Nethergarde void construct */
export const SUMMON_COST = { food: 20, iron: 10, stone: 10 } as const;
/** Share of the Void Well returning each harvest */
export const VOID_WELL_RESPAWN_RATE = 0.1;
/** 📜 Royal Proclamations: 🏘️ Paid Settlers (cost per settler, refill line as a share of capacity, cooldown) */
export const SETTLERS = { COST: { food: 60, gold: 1 }, MAX_FILL: 0.5, COOLDOWN_MS: 24 * 60 * 60 * 1000 } as const;
/** 🎉 Festival: cost per City Hall level, how long it lasts, how often, and what it does */
export const FESTIVAL = {
  FOOD_PER_LEVEL: 10_000,
  GOLD_PER_LEVEL: 100,
  DURATION_MS: 24 * 60 * 60 * 1000,
  COOLDOWN_MS: 7 * 24 * 60 * 60 * 1000,
  BIRTH_MULT: 2,
  YIELD_MULT: 1.1
} as const;
/** ⚔️ Call to Arms after attacking a ruler's city or a frontier gate */
export const CALL_TO_ARMS_MS = 60 * 60 * 1000;
export const festivalCostFor = (level: number) => ({ food: FESTIVAL.FOOD_PER_LEVEL * Math.max(1, level), gold: FESTIVAL.GOLD_PER_LEVEL * Math.max(1, level) });
/** BASE_LIFESPAN_HOURS default and harvests per hour (15-minute harvests) */
const BASE_LIFESPAN_HOURS = 24;
const HARVESTS_PER_HOUR = 4;

export interface CivDemographicProfile {
  name: string;
  archetype: string;
  popMultiplier: number;
  birthFactor: number;
  lifespanDescription: string;
  /** Lifespan as a multiple of 24 h (Infinity = immortal) */
  lifespanFactor: number;
  marchSpeedMultiplier: number;
  marchSpeedDesc: string;
  soldierUnit: {
    name: string;
    hp: number;
    atk: number;
    def: number;
    trait: string;
    traitDesc: string;
  };
  civilianYieldDesc: string;
}

export const CIV_DEMOGRAPHICS: Record<CivilizationType, CivDemographicProfile> = {
  human: {
    name: "Humans",
    archetype: "The Industrial Swarm",
    popMultiplier: 2.0,
    birthFactor: 0.12,
    lifespanDescription: "Short (24 Hours) • Rapid Churn",
    lifespanFactor: 1.0,
    marchSpeedMultiplier: 1.0,
    marchSpeedDesc: "1.0x (Standard Footman March)",
    soldierUnit: {
      name: "Royal Footman",
      hp: 12,
      atk: 5,
      def: 3,
      trait: "Swarm Tactics",
      traitDesc: "Cheap mobilization, overwhelming numerical superiority"
    },
    civilianYieldDesc: "+150 Food, +50 Gold, +50 Lumber per 100 Civilians"
  },
  orc: {
    name: "Orcs",
    archetype: "The Warband Horde",
    popMultiplier: 1.4,
    birthFactor: 0.15,
    lifespanDescription: "Volatile (14.4 Hours) • Instant Replenishment",
    lifespanFactor: 0.6,
    marchSpeedMultiplier: 1.2,
    marchSpeedDesc: "1.2x (Warband Blood Frenzy, +20% Speed)",
    soldierUnit: {
      name: "Blood Berserker",
      hp: 28,
      atk: 16,
      def: 6,
      trait: "Frenzy Charge",
      traitDesc: "+25% Attack Power on first assault round"
    },
    civilianYieldDesc: "+100 Food, +100 Iron per 100 Civilians"
  },
  dwarf: {
    name: "Dwarves",
    archetype: "The Mountain Clan",
    popMultiplier: 0.8,
    birthFactor: 0.04,
    lifespanDescription: "Enduring (72 Hours) • Sturdy Longevity",
    lifespanFactor: 3.0,
    marchSpeedMultiplier: 0.8,
    marchSpeedDesc: "0.8x (Heavy Plate Armor, -20% Speed)",
    soldierUnit: {
      name: "Ironbreaker Sentinel",
      hp: 42,
      atk: 8,
      def: 24,
      trait: "Shield Wall",
      traitDesc: "Absorbs 40% incoming physical damage"
    },
    civilianYieldDesc: "+150 Stone, +100 Iron, +40 Tools per 100 Civilians"
  },
  elf: {
    name: "Elves",
    archetype: "The Ancients",
    popMultiplier: 0.35,
    birthFactor: 0.015,
    lifespanDescription: "Immortal (240 Hours) • Near-Zero Natural Mortality",
    lifespanFactor: 10.0,
    marchSpeedMultiplier: 1.4,
    marchSpeedDesc: "1.4x (Woodland Swiftness, +40% Speed)",
    soldierUnit: {
      name: "Sylvan Ranger",
      hp: 24,
      atk: 18,
      def: 8,
      trait: "Arcane Precision",
      traitDesc: "Ranged magic strikes bypass 30% enemy armor"
    },
    civilianYieldDesc: "+80 Lumber, +3 Mana, +1 of the harvest's rare gem per 100 Civilians"
  },
  arcane: {
    name: "Nethergarde",
    archetype: "The Timeless Ascendants",
    popMultiplier: 0.6,
    birthFactor: 0.0,
    lifespanDescription: "Eternal constructs • summoned, fallen return via the Void Well",
    lifespanFactor: Infinity,
    marchSpeedMultiplier: 1.1,
    marchSpeedDesc: "1.1x (Void Glider Phase, +10% Speed)",
    soldierUnit: {
      name: "Void Weaver",
      hp: 50,
      atk: 14,
      def: 14,
      trait: "Ethereal Shield",
      traitDesc: "Absorbs initial damage and respawns at Void Core upon defeat"
    },
    civilianYieldDesc: "+50 to All Base Resources + Void Resonance"
  }
};

/** Mortality per harvest: (1 / lifespan in harvests) × saturation (mirrors demographics.ts) */
export function calculateDeathRate(civ: CivilizationType, saturation: number): number {
  const profile = CIV_DEMOGRAPHICS[civ] || CIV_DEMOGRAPHICS.human;
  const ticks = BASE_LIFESPAN_HOURS * profile.lifespanFactor * HARVESTS_PER_HOUR;
  if (!Number.isFinite(ticks)) return 0;
  return Math.max(0, Math.min(1, saturation)) / ticks;
}

/** Natural deaths next harvest: ⌊pop × rate⌋, civilians only */
export function estimateNaturalDeaths(currentPop: number, civ: CivilizationType, saturation: number, civilians = currentPop): number {
  return Math.min(civilians, Math.floor(currentPop * calculateDeathRate(civ, saturation)));
}

/** Births next harvest: max(1, ⌊pop × birth factor × (1 − S)⌋) while there is room */
export function estimateNaturalBirths(currentPop: number, civ: CivilizationType, saturation: number): number {
  const profile = CIV_DEMOGRAPHICS[civ] || CIV_DEMOGRAPHICS.human;
  if (profile.birthFactor <= 0 || currentPop <= 0 || saturation >= 1) return 0;
  return Math.max(1, Math.floor(currentPop * profile.birthFactor * (1 - saturation)));
}

/** Nethergarde soldiers returning from the Void Well next harvest */
export function estimateVoidWellRespawn(voidWell: number, room: number): number {
  if (voidWell <= 0 || room <= 0) return 0;
  return Math.min(voidWell, room, Math.max(1, Math.ceil(voidWell * VOID_WELL_RESPAWN_RATE)));
}

export function getMaxPopulation(cityHallLevel: number, civ: CivilizationType): number {
  const profile = CIV_DEMOGRAPHICS[civ] || CIV_DEMOGRAPHICS.human;
  return Math.max(20, Math.round(cityHallLevel * 100 * profile.popMultiplier));
}

/** Mirror of CIV_MODIFIERS in server/src/warConfig.ts: standing buffs/debuffs on each civ's soldiers */
export interface StatModifier {
  id: string;
  name: string;
  kind: "buff" | "debuff";
  hp?: number;
  atk?: number;
  def?: number;
  /** Only against these civilizations (omit = every fight) */
  vs?: CivilizationType[];
  /** Only while attacking (marching on a citadel) or defending (behind the walls); omit = both */
  when?: "attacking" | "defending";
  description: string;
}

export const CIV_MODIFIERS: Record<CivilizationType, StatModifier[]> = {
  // Matchups (GAME_GUIDE §13 chart), tuned with `npm run sim:balance`. Against Nethergarde elves are the top contenders;
  // between mortals each cell of the design chart has its own `vs` + `when` entry so it doesn't leak into the others.
  human: [
    { id: "massed_levies", name: "Massed Levies", kind: "buff", atk: 0.25, vs: ["arcane"], description: "+25% ATK against Nethergarde (sheer numbers)" },
    { id: "grain_fed_hosts", name: "Grain-Fed Hosts", kind: "buff", atk: 2.3, vs: ["orc"], when: "attacking", description: "+230% ATK attacking orcs (out-produce and swarm them — an even fight)" }
  ],
  orc: [{ id: "frenzy_breaks", name: "Frenzy Breaks on Void Shields", kind: "debuff", atk: -0.7, vs: ["arcane"], description: "−70% ATK against Nethergarde (heavy casualties on Void Shields)" }],
  dwarf: [
    { id: "void_dulled_steel", name: "Void-Dulled Steel", kind: "debuff", atk: -0.2, vs: ["arcane"], description: "−20% ATK against Nethergarde (a tough slugfest)" },
    { id: "anvil_vs_horde", name: "Anvil Against the Horde", kind: "buff", atk: 1, def: 1, vs: ["orc"], description: "+100% ATK and DEF against orcs (hard counter)" },
    { id: "slow_advance", name: "Slow Advance", kind: "debuff", atk: -0.5, vs: ["human"], when: "attacking", description: "−50% ATK attacking humans (they hold their walls)" },
    { id: "stone_ramparts", name: "Stone Ramparts", kind: "buff", atk: 0.3, hp: 0.15, vs: ["human"], when: "defending", description: "+30% ATK, +15% HP defending against humans (their levies break on dwarven walls)" },
    { id: "break_the_charge", name: "Break the Charge", kind: "buff", atk: 1.2, hp: 0.6, vs: ["orc"], when: "defending", description: "+120% ATK, +60% HP defending against orcs (the horde shatters on the shield wall)" }
  ],
  elf: [
    { id: "void_piercing", name: "Void-Piercing Volleys", kind: "buff", atk: 2.5, hp: 1, vs: ["arcane"], description: "+250% ATK, +100% HP against Nethergarde (magic pierces the void)" },
    { id: "treeline_volleys", name: "Volleys From the Treeline", kind: "buff", atk: 2, hp: 1, vs: ["human"], when: "attacking", description: "+200% ATK, +100% HP attacking humans (snipe the levies)" },
    { id: "cull_the_vanguard", name: "Cull the Vanguard", kind: "buff", atk: 5, hp: 2.5, vs: ["orc"], when: "attacking", description: "+500% ATK, +250% HP attacking orcs (wipe their early waves)" },
    { id: "hold_the_glade", name: "Hold the Glade", kind: "buff", atk: 12.7, hp: 6.35, vs: ["orc"], when: "defending", description: "+1270% ATK, +635% HP defending against orcs (a handful of rangers hold the glade — an even fight)" },
    { id: "armor_piercing_runes", name: "Armor-Piercing Runes", kind: "buff", atk: 4, hp: 2, vs: ["dwarf"], when: "attacking", description: "+400% ATK, +200% HP attacking dwarves (hard counter)" },
    { id: "glade_ambush", name: "Glade Ambush", kind: "buff", atk: 9, hp: 4.5, vs: ["dwarf"], when: "defending", description: "+900% ATK, +450% HP defending against dwarves (they struggle marching into elf magic)" }
  ],
  arcane: [{ id: "universal_harmony", name: "Universal Harmony", kind: "buff", hp: 0.15, atk: 0.15, def: 0.15, description: "+15% HP, ATK and DEF" }]
};

const MIN_STAT_SHARE = 0.1;

/** Soldier stats after buffs/debuffs (mirrors effectiveUnit in demographics.ts): matchup ones only vs `opponent`, role ones only in `role` */
export function effectiveUnit(civ: CivilizationType, opponent?: CivilizationType, role?: "attacking" | "defending"): { hp: number; atk: number; def: number } {
  const unit = (CIV_DEMOGRAPHICS[civ] || CIV_DEMOGRAPHICS.human).soldierUnit;
  const mods = (CIV_MODIFIERS[civ] ?? []).filter((m) => (!m.vs || (opponent !== undefined && m.vs.includes(opponent))) && (!m.when || m.when === role));
  const scaled = (base: number, key: "hp" | "atk" | "def") => Math.round(base * Math.max(MIN_STAT_SHARE, 1 + mods.reduce((sum, m) => sum + (m[key] ?? 0), 0)));
  return { hp: scaled(unit.hp, "hp"), atk: scaled(unit.atk, "atk"), def: scaled(unit.def, "def") };
}

// Marches & slots (mirrors server/src/warConfig.ts)
export const MARCH_SLOT_LEVELS = [1, 6, 11, 16, 21] as const;
export const MARCH_CAPACITY_SHARE = 0.2;
export const CIV_MARCH_MULT: Record<CivilizationType, number> = {
  human: 1.0,
  orc: 1.25,
  dwarf: 1.0,
  elf: 1.5,
  arcane: 1.25
};
export const CIV_SOLDIER_SHARE: Record<CivilizationType, number> = {
  human: 0.5,
  orc: 0.7,
  dwarf: 0.5,
  elf: 0.4,
  arcane: 0.75
};

export const BATTLE_ROUND_MS = 10_000;
export const WALL_DEF_MULT = [1.25, 1.40, 1.55, 1.70, 1.85, 2.00] as const;
/** Damage defenders behind the walls take, by tier (mirror of server WALL_DAMAGE_TAKEN_MULT) */
export const WALL_DAMAGE_TAKEN_MULT = [1, 0.9, 0.8, 0.7, 0.6, 0.5] as const;
export const WALL_HP_PER_LEVEL = 1000;
export const WALL_TIER_HP_MULT = [1, 1.2, 1.4, 1.6, 1.8, 2.0] as const;
export const WALL_BURN_THRESHOLD = 0.25;
export const LOAD_PER_SOLDIER = 20;
export const CIV_LOAD_MULT: Record<CivilizationType, number> = {
  dwarf: 1.5,
  orc: 1.2,
  arcane: 1.0,
  elf: 0.8,
  human: 0.7
};
/** World PvE (bandit stashes, resource nodes) is carried at this × the normal load (server: warConfig.PVE_LOAD_MULT) */
export const PVE_LOAD_MULT = 3;
/** Units gathered per second at 1× (server: warConfig.GATHER_RATE_PER_SEC) */
export const GATHER_RATE_PER_SEC = 16;
/** Resource nodes spawned each day (server: worldMapGenerator.DAILY_RESOURCE_NODE_COUNT) */
export const DAILY_RESOURCE_NODE_COUNT = 16;
/** Fresh resource nodes every two harvests, one per mortal province and buffer zone (server: worldMapGenerator.WAVE_RESOURCE_NODE_COUNT) */
export const WAVE_RESOURCE_NODE_COUNT = 8;
/** Mob spoils by tier (server: warConfig.MOB_LOOT_BY_TIER) */
export const MOB_LOOT_BY_TIER: Record<string, { food: number; lumber: number; iron: number; gold: number }> = {
  common: { food: 1600, lumber: 1200, iron: 600, gold: 50 },
  uncommon: { food: 3200, lumber: 2400, iron: 1400, gold: 100 },
  rare: { food: 6400, lumber: 4800, iron: 3200, gold: 200 },
  epic: { food: 12000, lumber: 10000, iron: 7200, gold: 400 },
  legendary: { food: 20000, lumber: 16000, iron: 12000, gold: 800 }
};
/** 🛡️ A pack's hidden gear, rolled when it spawns (server: warConfig.PACK_GEAR; sim:balance checks they match) */
export type PackGear = "ragged" | "armed" | "war_geared";
export const PACK_GEAR: Record<PackGear, { name: string; emblem: string; chance: number; hp: number; atk: number; def: number; loot: number; description: string }> = {
  ragged: { name: "Ragged", emblem: "🪵", chance: 0.6, hp: 1, atk: 1, def: 1, loot: 1, description: "scraps and clubs" },
  armed: { name: "Armed", emblem: "🗡️", chance: 0.3, hp: 1.25, atk: 1.1, def: 1.25, loot: 1.3, description: "+25% HP and DEF, +10% ATK; +30% loot" },
  war_geared: { name: "War-geared", emblem: "🛡️", chance: 0.1, hp: 1.5, atk: 1.25, def: 1.5, loot: 1.75, description: "+50% HP and DEF, +25% ATK; +75% loot" }
};
export const PACK_GEAR_ORDER: PackGear[] = ["ragged", "armed", "war_geared"];
/** Bandit stashes by tier (server: warConfig.BANDIT_STASH_BY_TIER) */
export const BANDIT_STASH_BY_TIER: Record<string, { gold: number; iron: number; stone: number; food: number }> = {
  common: { gold: 2400, iron: 900, stone: 600, food: 900 },
  uncommon: { gold: 4800, iron: 2100, stone: 1500, food: 1800 },
  rare: { gold: 9600, iron: 4500, stone: 3000, food: 3600 },
  epic: { gold: 18000, iron: 9000, stone: 6000, food: 6000 },
  legendary: { gold: 30000, iron: 15000, stone: 10500, food: 9000 }
};
/** Treasure chest contents by tier (server: warConfig.TREASURE_CONTENTS_BY_TIER) */
export const TREASURE_CONTENTS_BY_TIER: Record<string, { gold: number; iron: number; stone: number; lumber: number; food: number; gems: number }> = {
  common: { gold: 1200, iron: 1000, stone: 800, lumber: 600, food: 400, gems: 0 },
  uncommon: { gold: 2800, iron: 2400, stone: 2000, lumber: 1600, food: 1200, gems: 0 },
  rare: { gold: 6000, iron: 4800, stone: 4000, lumber: 3200, food: 2000, gems: 0 },
  epic: { gold: 10000, iron: 8000, stone: 6000, lumber: 4800, food: 3200, gems: 1 },
  legendary: { gold: 20000, iron: 16000, stone: 12000, lumber: 8000, food: 4000, gems: 2 }
};
/** A world boss's hoard, carried home by load by the killing battle's armies, plus its gems split by survivors (server: warConfig.BOSS_HOARD, BOSS_HOARD_GEMS) */
export const BOSS_HOARD = { gold: 36000, iron: 60000, stone: 60000, lumber: 60000, food: 90000 };
export const BOSS_HOARD_GEMS = 6;
/** A world boss's bounty, shared by damage dealt this life (server: warConfig.BOSS_BOUNTY) */
export const BOSS_BOUNTY = { gold: 12000, iron: 24000, stone: 24000, lumber: 24000, food: 36000 };
/** NPC kingdom (buffer realm, frontier gate) treasury per City Hall level (server: warConfig.NPC_KINGDOM_TREASURY_PER_LEVEL) */
export const NPC_KINGDOM_TREASURY_PER_LEVEL = { gold: 5000, iron: 7000, stone: 7000, lumber: 8000, food: 10000 };
/** 👑 A free realm's treasury × its tier, and the conquest hoard its beaten garrison pays once a day (server: warConfig.REALM_TREASURY_TIER_MULT, REALM_CONQUEST_HOARD; sim:balance checks they match) */
export const REALM_TREASURY_TIER_MULT: Record<"common" | "uncommon" | "rare" | "epic", number> = { common: 1, uncommon: 1.5, rare: 2.5, epic: 4 };
export const REALM_CONQUEST_HOARD: Record<"common" | "uncommon" | "rare" | "epic", { gold: number; iron: number; stone: number; lumber: number; food: number; gems: number }> = {
  common: { gold: 3_000, iron: 4_000, stone: 4_000, lumber: 4_000, food: 5_000, gems: 0 },
  uncommon: { gold: 9_000, iron: 12_000, stone: 12_000, lumber: 12_000, food: 15_000, gems: 0 },
  rare: { gold: 22_000, iron: 30_000, stone: 30_000, lumber: 30_000, food: 38_000, gems: 2 },
  epic: { gold: 50_000, iron: 60_000, stone: 60_000, lumber: 60_000, food: 90_000, gems: 5 }
};
/** "300k + 5 gems" */
export const realmHoardText = (tier: keyof typeof REALM_CONQUEST_HOARD) => {
  const h = REALM_CONQUEST_HOARD[tier];
  const total = h.gold + h.iron + h.stone + h.lumber + h.food;
  return `${Math.round(total / 1000)}k resources${h.gems ? ` + ${h.gems} gems` : ""}`;
};
/** Share of that cap an NPC kingdom refills each harvest (server: warConfig.NPC_KINGDOM_REFILL_SHARE) */
export const NPC_KINGDOM_REFILL_SHARE = 0.1;
export const PROTECTED_TREASURY_PER_LEVEL = 1500;

export const WALL_TIER_NAMES = [
  "Unwalled Perimeter",
  "Wooden Palisade",
  "Stone Walls",
  "Fortress Walls",
  "Bastion Walls",
  "Citadel Ramparts"
] as const;

export function marchSlotsForLevel(cityHallLevel: number): number {
  return Math.max(1, Math.min(5, Math.ceil(Math.max(1, cityHallLevel) / 5)));
}

export function marchCapacityFor(maxPopulation: number, civ: CivilizationType): number {
  return Math.max(1, Math.floor(maxPopulation * MARCH_CAPACITY_SHARE * (CIV_MARCH_MULT[civ] ?? 1.0)));
}

export function maxSoldiersFor(population: number, civ: CivilizationType): number {
  return Math.max(0, Math.floor(population * (CIV_SOLDIER_SHARE[civ] ?? 0.5)));
}

export function wallDefMultForTier(wallTier: number): number {
  const t = Math.max(0, Math.min(5, Math.floor(wallTier || 0)));
  return WALL_DEF_MULT[t];
}

/** " · −30% dmg" for a walled tier ("" at tier 0): the damage cut defenders get behind these walls */
export function wallDamageCutText(wallTier: number): string {
  const cut = 1 - WALL_DAMAGE_TAKEN_MULT[Math.max(0, Math.min(5, Math.floor(wallTier || 0)))];
  return cut > 0 ? ` · −${Math.round(cut * 100)}% dmg` : "";
}

export function wallMaxHpFor(cityHallLevel: number, wallTier: number): number {
  const t = Math.max(0, Math.min(5, Math.floor(wallTier || 0)));
  return Math.round(WALL_HP_PER_LEVEL * Math.max(1, cityHallLevel) * WALL_TIER_HP_MULT[t]);
}


