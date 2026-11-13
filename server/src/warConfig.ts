import { CivilizationType } from "./types.js";
import { ARTS, INSTINCTS, KIT_SIZES, instinctStats, type UnitKit } from "./battleArts.js";
import { WORLD_SCALE } from "./worldGeometry.js";

/**
 * Every tunable number of the war game in one place: marching, rations, combat, civ traits and
 * the Nethergarde NPC kingdoms that guard open Voidrift slots. GAME_GUIDE §10 documents them.
 */

/**
 * Marching: travel time and food rations scale with the distance on the world map. Both follow the world scale, so a
 * march between the same two places takes as long and eats as much as before the realm grew.
 */
export const MARCH = {
  /** Map units covered per "supply tick" when rations are costed (20 before the realm grew) */
  UNITS_PER_RATION_TICK: 20 * WORLD_SCALE,
  /** Food each soldier eats per supply tick on the road */
  FOOD_PER_SOLDIER_PER_TICK: 2,
  /** Travel time per map unit at 1.0x march speed (2,000 ms before the realm grew: armies move faster by the world scale) */
  MS_PER_MAP_UNIT: 2000 / WORLD_SCALE,
  /** Every march takes between these, whatever the civ's speed (under 5 minutes) */
  MIN_DURATION_MS: 30_000,
  MAX_DURATION_MS: 299_000,
  /** How often arrived marches are resolved */
  RESOLVE_TICK_MS: 2000,
  /**
   * Resolved marches stay in GET /marches this long so every client can play the clash and the
   * victory/defeat animation (the client splits it into FIGHT and OUTCOME phases)
   */
  SHOWCASE_MS: 14_000
} as const;

/** Share of the march rations each civ pays (elves: cheap logistics, 1/4 of the food) */
export const MARCH_RATION_MULT: Record<CivilizationType, number> = { human: 1, orc: 1, dwarf: 1, elf: 0.25, arcane: 1 };

/** Food each home-garrison soldier eats per harvest (marching troops carry their own rations) */
export const SOLDIER_FOOD_UPKEEP = 1;
/** Share of the home garrison that deserts back to civilian life during famine */
export const FAMINE_DESERTION_RATE = 0.1;
/** Food + iron to arm one civilian as a soldier (GAME_GUIDE §13); demobilising is free */
export const MOBILIZATION_COST = { iron: 2, food: 5 } as const;
/** Nethergarde doesn't breed (GAME_GUIDE §13): it summons void constructs with resources… */
export const SUMMON_COST = { food: 20, iron: 10, stone: 10 } as const;
/** …and soldiers it loses in battle fall into the Void Well, this share returning each harvest */
export const VOID_WELL_RESPAWN_RATE = 0.1;

/**
 * 📜 Royal Proclamations (GAME_GUIDE §13), mortal kingdoms only. 🏘️ Paid Settlers refill a kingdom gutted by war,
 * up to MAX_FILL of its capacity, once a day; paid mostly in food (dearer per head than a Nethergarde construct).
 */
export const SETTLERS = { COST: { food: 60, gold: 1 }, MAX_FILL: 0.5, COOLDOWN_MS: 24 * 60 * 60 * 1000 } as const;
/**
 * 🎉 Festival: births ×BIRTH_MULT and the workforce's yield ×YIELD_MULT for a day, once a week (counted from its start).
 * It costs a granary's worth of food per City Hall level and can't be declared while the ruler is Called to Arms.
 */
export const FESTIVAL = {
  FOOD_PER_LEVEL: 10_000,
  GOLD_PER_LEVEL: 100,
  DURATION_MS: 24 * 60 * 60 * 1000,
  COOLDOWN_MS: 7 * 24 * 60 * 60 * 1000,
  BIRTH_MULT: 2,
  YIELD_MULT: 1.1
} as const;
/** ⚔️ Call to Arms: a ruler who attacks another ruler's city or a frontier gate stays at war this long */
export const CALL_TO_ARMS_MS = 60 * 60 * 1000;
/** Food + gold of a Festival at City Hall `level` */
export const festivalCostFor = (level: number) => ({ food: FESTIVAL.FOOD_PER_LEVEL * Math.max(1, level), gold: FESTIVAL.GOLD_PER_LEVEL * Math.max(1, level) });
/** A starving garrison (granary at 0) defends with half its armor (GAME_GUIDE §13) */
export const FAMINE_DEF_MULT = 0.5;
/** Population share kept by a defender cast out of Nethergarde (the rest fell in the siege) */
export const SWAP_DEFEAT_SURVIVAL = 0.75;

/** Round-based battle simulation (warEngine.simulateBattle) */
export const COMBAT = {
  MAX_ROUNDS: 6,
  /** A rally's armies fight this many rounds before falling back (Battle Arts: room for a Finale) */
  RALLY_MAX_ROUNDS: 8,
  /** Armor curve: damage reduction = DEF / (DEF + ARMOR_K) */
  ARMOR_K: 20,
  /** Each side's damage per round is rolled within ±VARIANCE */
  VARIANCE: 0.15,
  /** Defenders behind their walls get this multiplier on DEF */
  FORTIFICATION_DEF_MULT: 1.25
} as const;

/** Combat effect of each civilization's soldier trait (descriptions live in demographics.ts) */
export interface CombatTraits {
  /** Attack multiplier in round 1 only */
  firstRoundAtkMult: number;
  /** Share of the enemy's armor ignored */
  armorPierce: number;
  /** Multiplier on all damage taken */
  damageTakenMult: number;
  /** Multiplier on damage taken in round 1 only */
  firstRoundDamageTakenMult: number;
  /** Attack bonus while outnumbering the enemy (scaled by the ratio, capped at 2:1) */
  outnumberAtkBonus: number;
}

const NO_TRAITS: CombatTraits = { firstRoundAtkMult: 1, armorPierce: 0, damageTakenMult: 1, firstRoundDamageTakenMult: 1, outnumberAtkBonus: 0 };

export const COMBAT_TRAITS: Record<CivilizationType, CombatTraits> = {
  human: { ...NO_TRAITS, outnumberAtkBonus: 0.25 }, // Swarm Tactics
  orc: { ...NO_TRAITS, firstRoundAtkMult: 1.25 }, // Frenzy Charge
  dwarf: { ...NO_TRAITS, damageTakenMult: 0.6 }, // Shield Wall
  elf: { ...NO_TRAITS, armorPierce: 0.3 }, // Arcane Precision
  arcane: { ...NO_TRAITS, firstRoundDamageTakenMult: 0.5 } // Ethereal Shield
};

/**
 * Standing buffs and debuffs on a civilization's soldiers: each one adds its share to HP / ATK /
 * DEF (0.15 = +15%, -0.1 = −10%; they stack additively). With `when` it only applies while
 * attacking or defending (e.g. elves snipe from range when they attack). With `vs` it only applies when fighting
 * those civilizations — use that for matchups (GAME_GUIDE §13 matchups), so a counter doesn't leak into other
 * fights (mortal-vs-mortal wars are planned). Add an entry here to buff or debuff any civ — combat
 * (`effectiveUnit`) and the UI (client `civDemographics.ts` mirror) both read it.
 * Situational effects (famine, fortification, traits) stay in COMBAT / COMBAT_TRAITS.
 */
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

/**
 * 🌙 Moonwell Healers (GAME_GUIDE §9, §13): the elves' trait. Of the soldiers an elf army loses in a battle (attacking,
 * defending or reinforcing), WOUNDED_SHARE come home wounded instead of dying. The wounded keep their place in the
 * population (they can't be replaced by recruits) and rejoin the home garrison a few at every harvest (HEAL_SHARE_PER_HARVEST
 * of the kingdom's full soldier cap, at least HEAL_MIN_PER_HARVEST, longest-wounded first); the ruler can pay to hasten them. Losses on the road (Tempest Roads) and caught scouts stay deaths.
 */
export const MOONWELL = {
  CIVS: ["elf"] as CivilizationType[],
  WOUNDED_SHARE: 0.5,
  /** Wounded who rejoin the garrison at each harvest: this share of the soldier cap at full population… */
  HEAL_SHARE_PER_HARVEST: 0.02,
  /** …and never fewer than this */
  HEAL_MIN_PER_HARVEST: 1,
  /** Hastening every wounded soldier home now: this much per soldier… */
  HASTEN_PER_SOLDIER: { food: 20, gold: 2 },
  /** …plus one Sylvan Emerald per this many soldiers (rounded up) */
  HASTEN_SOLDIERS_PER_EMERALD: 25,
  HASTEN_GEM: "emerald"
} as const;

/** Share of `civ`'s battle losses that come home wounded (0 for every civ without the Moonwell) */
export const woundedShareOf = (civ: CivilizationType): number => (MOONWELL.CIVS.includes(civ) ? MOONWELL.WOUNDED_SHARE : 0);
/** Of `lost` soldiers of `civ` fallen in a battle, how many come home wounded */
export const woundedOf = (civ: CivilizationType, lost: number): number => Math.max(0, Math.min(lost, Math.floor(Math.max(0, lost) * woundedShareOf(civ))));
/** Wounded soldiers who rejoin the garrison at each harvest, for a kingdom of `maxPopulation` (capacity) */
export const woundedHealPerHarvest = (maxPopulation: number, civ: CivilizationType): number =>
  Math.max(MOONWELL.HEAL_MIN_PER_HARVEST, Math.ceil(maxSoldiersFor(maxPopulation, civ) * MOONWELL.HEAL_SHARE_PER_HARVEST));
/** What hastening `count` wounded soldiers costs */
export function hastenCostFor(count: number): { food: number; gold: number; gems: Record<string, number> } {
  const n = Math.max(0, Math.floor(count));
  return {
    food: n * MOONWELL.HASTEN_PER_SOLDIER.food,
    gold: n * MOONWELL.HASTEN_PER_SOLDIER.gold,
    gems: n > 0 ? { [MOONWELL.HASTEN_GEM]: Math.ceil(n / MOONWELL.HASTEN_SOLDIERS_PER_EMERALD) } : {}
  };
}

/** A stat can't be debuffed below this share of its base value */
export const MIN_STAT_SHARE = 0.1;

/**
 * Open Voidrift slots are held by NPC void kingdoms at full population. A mid-level developer
 * (City Hall ~8-12) needs roughly 10-20 assaults to break one; `npm run sim:war` prints the table.
 */
export const VOID_NPC = {
  /** City Hall level of every NPC void kingdom (sets its population and garrison) */
  CITY_HALL_LEVEL: 15,
  /** Wall tier of every NPC void kingdom (Fortress Walls, DEF x1.70) */
  WALL_TIER: 3,
  /** Share of the NPC's (always full) population standing in the garrison (207 of 900: three assaults of 800 Footmen break it) */
  GARRISON_SHARE: 0.23,
  /** Garrison re-manifested per harvest, as a share of the full garrison… */
  REGEN_PER_HARVEST: 0.02,
  /** …but only once nobody has attacked for this long (sieges aren't undone between assaults) */
  REGEN_PAUSE_MS: 6 * 60 * 60 * 1000,
  /** Treasure handed to whoever breaks the garrison; grows with the slot index */
  LOOT_BASE: { gold: 3500, iron: 2500, stone: 2000 },
  LOOT_PER_SLOT: { gold: 400, iron: 300, stone: 250 },
  LOOT_SCARCE_AMOUNT: 2,
  /** Must be keys of SCARCE_RESOURCES in db.ts */
  SCARCE_KEYS: ["obsidian", "aether", "mithril", "diamond", "ancient_rune", "dragon_scale", "titan_tablet", "phoenix_feather"],
  WARDEN_NAMES: [
    "Vael the Hollow",
    "Mordrith Ashveil",
    "Xyr of the Rift",
    "Seraphine Nullbright",
    "Oboros Gloamheart",
    "Ixa Starless",
    "Thessaly Voidcrown",
    "Kelm the Unwritten"
  ]
} as const;

// Marches & slots (GAME_GUIDE §8, §13)
export const MARCH_SLOT_LEVELS = [1, 6, 11, 16, 21] as const; // ceil(cityHall / 5)
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

// Live battles & rallies
export const BATTLE_ROUND_MS = 10_000;
/** Rally lobby wait times the leader can pick (2 / 5 / 10 min) */
export const RALLY_WINDOWS_MS = [120_000, 300_000, 600_000] as const;
/** Every army in a rally gets +5% ATK per joiner besides the leader (up to +25% with 5 joiners) — cooperation pays */
export const RALLY_COORDINATION_ATK = 0.05;
/** Joiners a rally takes besides its leader, by the leader's City Hall */
export const RALLY_JOINER_CAP: Array<{ maxLevel: number; joiners: number }> = [
  { maxLevel: 15, joiners: 3 },
  { maxLevel: 24, joiners: 4 },
  { maxLevel: 25, joiners: 5 }
];
export function rallyJoinerCapFor(cityHallLevel: number): number {
  return (RALLY_JOINER_CAP.find((c) => cityHallLevel <= c.maxLevel) ?? RALLY_JOINER_CAP[RALLY_JOINER_CAP.length - 1]).joiners;
}

// Walls & burning (tiers 0..5)
export const WALL_DEF_MULT = [1.25, 1.40, 1.55, 1.70, 1.85, 2.00] as const;
/**
 * Damage defenders behind the walls take, by tier (−10% per tier: tier 5 halves it). The DEF multiplier alone
 * barely helps low-armor soldiers (armor = DEF / (DEF + ARMOR_K)); this makes every tier count.
 */
export const WALL_DAMAGE_TAKEN_MULT = [1, 0.9, 0.8, 0.7, 0.6, 0.5] as const;
export function wallDamageTakenForTier(wallTier: number): number {
  return WALL_DAMAGE_TAKEN_MULT[Math.max(0, Math.min(5, Math.floor(wallTier || 0)))];
}
export const WALL_HP_PER_LEVEL = 1000;
export const WALL_TIER_HP_MULT = [1, 1.2, 1.4, 1.6, 1.8, 2.0] as const;
export const WALL_DMG_PER_ATTACKER = 6;
export const WALL_DMG_PER_DEFENDER_KILLED = 1;
export const WALL_REPAIR_FULL_MS = 4 * 60 * 60 * 1000;
export const WALL_BURN_REPAIR_MS = 8 * 60 * 60 * 1000; // 0% -> 26% while burning
export const WALL_UNBURN_SHARE = 0.26;
export const WALL_BURN_THRESHOLD = 0.25;
export const NPC_WALL_TIER_BY_LEVEL: Record<number, number> = { 10: 2, 12: 3, 15: 3, 20: 4, 25: 5 };

// Plunder by troop load
export const LOAD_PER_SOLDIER = 20;
export const CIV_LOAD_MULT: Record<CivilizationType, number> = {
  dwarf: 1.5,
  orc: 1.2,
  arcane: 1.0,
  elf: 0.8,
  human: 0.7
};
/** World PvE (bandit stashes, resource nodes) is carried at this × the normal load; raiding rulers and realms is not */
export const PVE_LOAD_MULT = 3;
export const PROTECTED_TREASURY_PER_LEVEL = 1500;

// Scouting (GAME_GUIDE §13)
/** Scouts travel this many times faster than an army (still min MARCH.MIN_DURATION_MS / 3) */
export const SCOUT_SPEED_MULT = 3;
export const SCOUT_MAX_SOLDIERS = 5;
/** Scout reports older than this are dropped */
export const SCOUT_REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Spies & Counterspies (GAME_GUIDE §13): scouting a ruler's city or an NPC kingdom (Voidrift citadel, buffer realm,
 * frontier gate) can end with the scouts caught (they die, no report) or deceived (a false report). Everything else
 * (mobs, nodes, treasure, bosses, landmarks) never fails.
 */
export const SCOUT_ODDS = {
  CAUGHT_BASE: 0.12,
  DECEIVED_BASE: 0.1,
  /** Your side: success per scout sent beyond the first, per Lantern Streets tier, elves, per Spymaster's Tower tier */
  PER_EXTRA_SCOUT: 0.02,
  PER_LANTERN_TIER: 0.02,
  ELF_BONUS: 0.05,
  SPY_SUCCESS_PER_TIER: 0.03,
  /** Their side: per Spymaster's Tower tier of the target */
  SPY_CATCH_PER_TIER: 0.03,
  SPY_DECEIVE_PER_TIER: 0.02,
  /** Success never below / above these */
  MIN_SUCCESS: 0.5,
  MAX_SUCCESS: 0.95,
  /** A false report is off by this share of each number (up or down) */
  LIE_MIN: 0.3,
  LIE_MAX: 0.6,
  /** With a Spymaster's Tower at least as high as the target's, a false report feels doubtful this often */
  DOUBT_CHANCE: 0.5
} as const;

export interface ScoutOddsInput {
  scouts: number;
  attackerCiv: CivilizationType;
  attackerLanterns: number;
  attackerSpymaster: number;
  /** The target ruler's Spymaster's Tower (0 for NPC kingdoms) */
  defenderSpymaster: number;
  /** Watched Borders: extra catch chance of a standing frontier gate (0 outside a sealed province) */
  gateCatch: number;
}

/** Chances (0–1, summing to 1) of a scouting party being caught, deceived or bringing home a true report */
export interface ScoutOdds {
  caught: number;
  deceived: number;
  success: number;
}

/**
 * The target's side sets the danger (base + their Spymaster's Tower + the gate's watch); your side's bonuses take it
 * down, keeping the caught : deceived split. Success is clamped to MIN_SUCCESS–MAX_SUCCESS.
 */
export function scoutOdds(i: ScoutOddsInput): ScoutOdds {
  const O = SCOUT_ODDS;
  const tier = (n: number) => Math.max(0, Math.min(5, n));
  const caught = O.CAUGHT_BASE + tier(i.defenderSpymaster) * O.SPY_CATCH_PER_TIER + Math.max(0, i.gateCatch);
  const deceived = O.DECEIVED_BASE + tier(i.defenderSpymaster) * O.SPY_DECEIVE_PER_TIER;
  const bonus =
    Math.max(0, Math.min(SCOUT_MAX_SOLDIERS, i.scouts) - 1) * O.PER_EXTRA_SCOUT +
    tier(i.attackerLanterns) * O.PER_LANTERN_TIER +
    (i.attackerCiv === "elf" ? O.ELF_BONUS : 0) +
    tier(i.attackerSpymaster) * O.SPY_SUCCESS_PER_TIER;
  const risk = caught + deceived;
  const fail = Math.max(1 - O.MAX_SUCCESS, Math.min(1 - O.MIN_SUCCESS, risk - bonus));
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const c = r((fail * caught) / risk);
  const d = r(fail - c);
  return { caught: c, deceived: d, success: r(1 - c - d) };
}

/**
 * World NPC units (roving mobs and bandits, GAME_GUIDE §13): each spawn is a pack of `count` units with
 * these stats, fighting in the open (no walls). The pack size grows with the spawn's tier
 * (`WORLD_NPC_TIER_COUNT_MULT`), stats stay per unit. Losses persist for everyone until the next
 * roving window; killing the last unit takes the spawn off the map (shared world).
 */
export interface WorldNpcUnit {
  name: string;
  count: number;
  hp: number;
  atk: number;
  def: number;
  /** Optional combat traits (same effects as civ traits) */
  traits?: Partial<CombatTraits>;
  /** Shown in panels and scout reports */
  trait?: string;
  /** Its Battle Arts, sized by its spawn's rarity (`npcKitFor`) */
  kit?: Pick<UnitKit, "instincts" | "arts">;
}

/** A mob's or bandit's Battle Arts: Instincts, then Arts (KIT_SIZES by its spawn's rarity) */
const npcKit = (instincts: string[], arts: string[]) => ({ instincts, arts });

/** Pack size by tier (commons are small, so most City Hall 1 armies win their first fights) */
export const WORLD_NPC_TIER_COUNT_MULT: Record<string, number> = { common: 0.7, uncommon: 1.6, rare: 2.5, epic: 4, legendary: 6 };

export const WORLD_NPC_UNITS: Record<string, WorldNpcUnit> = {
  // Mobs
  "mob-slime": { name: "Slime", count: 60, hp: 10, atk: 3, def: 1, kit: npcKit(["thick_hide"], []) },
  "mob-wolf": { name: "Dire Wolf", count: 40, hp: 20, atk: 7, def: 2, traits: { firstRoundAtkMult: 1.25 }, trait: "Pounce (+25% first strike)", kit: npcKit(["pack_hunter"], []) },
  "mob-bat": { name: "Cave Bat", count: 90, hp: 6, atk: 3, def: 0, kit: npcKit(["swarming"], []) },
  "mob-rat": { name: "Sewer Rat", count: 80, hp: 7, atk: 3, def: 1, kit: npcKit(["swarming"], []) },
  "mob-spider": { name: "Venomweb Spider", count: 45, hp: 14, atk: 6, def: 2, traits: { armorPierce: 0.2 }, trait: "Venom (ignores 20% armor)", kit: npcKit(["bloodlust"], []) },
  "mob-goblin": { name: "Goblin", count: 50, hp: 16, atk: 6, def: 3, kit: npcKit(["cutthroat"], ["ambush"]) },
  "mob-skeleton": { name: "Skeleton", count: 45, hp: 18, atk: 6, def: 5, traits: { damageTakenMult: 0.85 }, trait: "Bone Plating (−15% damage taken)", kit: npcKit(["undying"], ["shield_wall"]) },
  "mob-scorpion": { name: "Dune Scorpion", count: 35, hp: 22, atk: 8, def: 6, traits: { armorPierce: 0.2 }, trait: "Venom Sting (ignores 20% armor)", kit: npcKit(["stoneskin"], ["venom_sting"]) },
  "mob-harpy": { name: "Stormcrag Harpy", count: 40, hp: 16, atk: 9, def: 2, traits: { firstRoundAtkMult: 1.3 }, trait: "Dive (+30% first strike)", kit: npcKit(["bloodlust"], ["thunderclap"]) },
  "mob-lizardfolk": { name: "Lizardfolk", count: 40, hp: 22, atk: 7, def: 5, kit: npcKit(["thick_hide"], ["rending_blow"]) },
  "mob-troll": { name: "Mountain Troll", count: 12, hp: 120, atk: 22, def: 10, traits: { damageTakenMult: 0.85 }, trait: "Regenerating Hide (−15% damage taken)", kit: npcKit(["thick_hide", "enrage"], ["regenerate"]) },
  "mob-chimera": { name: "Shadow Chimera", count: 8, hp: 160, atk: 30, def: 12, traits: { firstRoundAtkMult: 1.3 }, trait: "Triple Maw (+30% first strike)", kit: npcKit(["bloodlust", "thick_hide"], ["fireball"]) },
  "mob-werewolf": { name: "Moonfang Werewolf", count: 16, hp: 90, atk: 20, def: 8, traits: { firstRoundAtkMult: 1.25 }, trait: "Blood Moon (+25% first strike)", kit: npcKit(["pack_hunter", "enrage"], ["rending_blow"]) },
  "mob-ogre": { name: "Ogre Brute", count: 14, hp: 110, atk: 24, def: 8, kit: npcKit(["thick_hide", "bloodlust"], ["armor_break"]) },
  "mob-wraith": { name: "Wailing Wraith", count: 20, hp: 60, atk: 16, def: 6, traits: { firstRoundDamageTakenMult: 0.5 }, trait: "Ethereal (−50% damage taken in round 1)", kit: npcKit(["undying", "bloodlust"], ["dread_wail"]) },
  "mob-drake": { name: "Emberwing Drake", count: 3, hp: 700, atk: 95, def: 18, traits: { armorPierce: 0.3 }, trait: "Dragonfire (ignores 30% armor)", kit: npcKit(["thick_hide", "enrage"], ["fire_breath", "rending_blow"]) },
  "mob-aberration": { name: "Void Aberration", count: 4, hp: 520, atk: 75, def: 14, traits: { firstRoundDamageTakenMult: 0.5 }, trait: "Rift Phase (−50% damage taken in round 1)", kit: npcKit(["stoneskin", "bloodlust"], ["void_lash", "thunderclap"]) },
  "mob-magma": { name: "Magma Elemental", count: 5, hp: 420, atk: 60, def: 20, traits: { damageTakenMult: 0.8 }, trait: "Molten Core (−20% damage taken)", kit: npcKit(["stoneskin", "thick_hide"], ["fireball", "armor_break"]) },
  "mob-basilisk": { name: "Stone-Gaze Basilisk", count: 3, hp: 760, atk: 80, def: 22, traits: { firstRoundAtkMult: 1.5 }, trait: "Petrifying Gaze (+50% first strike)", kit: npcKit(["stoneskin", "thick_hide"], ["stone_gaze", "venom_sting"]) },
  "mob-lich": { name: "Ancient Lich", count: 4, hp: 500, atk: 85, def: 14, traits: { armorPierce: 0.4 }, trait: "Soul Drain (ignores 40% armor)", kit: npcKit(["undying", "bloodlust"], ["frost_lance", "raise_dead"]) },
  // Bandits
  "bandit-highwayman": { name: "Highwayman", count: 35, hp: 18, atk: 7, def: 3, kit: npcKit(["cutthroat"], []) },
  "bandit-pickpocket": { name: "Pickpocket", count: 45, hp: 12, atk: 5, def: 2, kit: npcKit(["light_footed"], []) },
  "bandit-poacher": { name: "Poacher", count: 35, hp: 16, atk: 8, def: 2, traits: { armorPierce: 0.15 }, trait: "Hunting Bows (ignores 15% armor)", kit: npcKit(["keen_eye"], []) },
  "bandit-smuggler": { name: "Smuggler", count: 40, hp: 20, atk: 7, def: 4, kit: npcKit(["cutthroat"], ["poison_blade"]) },
  "bandit-raider": { name: "Sand Raider", count: 40, hp: 20, atk: 9, def: 3, traits: { firstRoundAtkMult: 1.25 }, trait: "Ambush (+25% first strike)", kit: npcKit(["bloodlust"], ["ambush"]) },
  "bandit-riverpirate": { name: "River Pirate", count: 40, hp: 20, atk: 8, def: 4, kit: npcKit(["bloodlust"], ["ambush"]) },
  "bandit-corsair": { name: "Corsair", count: 45, hp: 30, atk: 12, def: 6, kit: npcKit(["cutthroat", "thick_hide"], ["war_cry"]) },
  "bandit-syndicate": { name: "Syndicate Blade", count: 35, hp: 28, atk: 15, def: 6, traits: { armorPierce: 0.25 }, trait: "Assassins (ignores 25% armor)", kit: npcKit(["cutthroat", "keen_eye"], ["poison_blade"]) },
  "bandit-cultist": { name: "Ashen Cultist", count: 45, hp: 26, atk: 13, def: 5, traits: { firstRoundDamageTakenMult: 0.6 }, trait: "Ash Ward (−40% damage taken in round 1)", kit: npcKit(["bloodlust", "stoneskin"], ["fireball"]) },
  "bandit-mercenary": { name: "Dread Mercenary", count: 40, hp: 40, atk: 15, def: 10, traits: { damageTakenMult: 0.85 }, trait: "Plate Armor (−15% damage taken)", kit: npcKit(["stoneskin", "bloodlust"], ["shield_wall", "rending_blow"]) },
  "bandit-warlord": { name: "Iron Horde Warrior", count: 45, hp: 36, atk: 15, def: 9, traits: { outnumberAtkBonus: 0.25 }, trait: "Horde (+ATK while outnumbering)", kit: npcKit(["stoneskin", "enrage"], ["war_cry", "shield_wall"]) },
  "bandit-saboteur": { name: "Blackpowder Saboteur", count: 40, hp: 30, atk: 24, def: 6, traits: { armorPierce: 0.35 }, trait: "Blackpowder (ignores 35% armor)", kit: npcKit(["keen_eye", "thick_hide"], ["blackpowder", "ambush"]) }
};

/** Fallback for a mob/bandit type missing from the table */
export const WORLD_NPC_DEFAULT_UNIT: WorldNpcUnit = { name: "Raider", count: 40, hp: 18, atk: 6, def: 3 };

/**
 * What a cleared spawn gives (carried home by the survivors, credited on return):
 * mobs drop a fixed reward by tier; bandits carry a gold-heavy stash taken by load (survivors × load).
 */
export const MOB_LOOT_BY_TIER: Record<string, { food: number; lumber: number; iron: number; gold: number }> = {
  common: { food: 1600, lumber: 1200, iron: 600, gold: 50 },
  uncommon: { food: 3200, lumber: 2400, iron: 1400, gold: 100 },
  rare: { food: 6400, lumber: 4800, iron: 3200, gold: 200 },
  epic: { food: 12000, lumber: 10000, iron: 7200, gold: 400 },
  legendary: { food: 20000, lumber: 16000, iron: 12000, gold: 800 }
};
export const BANDIT_STASH_BY_TIER: Record<string, { gold: number; iron: number; stone: number; food: number }> = {
  common: { gold: 2400, iron: 900, stone: 600, food: 900 },
  uncommon: { gold: 4800, iron: 2100, stone: 1500, food: 1800 },
  rare: { gold: 9600, iron: 4500, stone: 3000, food: 3600 },
  epic: { gold: 18000, iron: 9000, stone: 6000, food: 6000 },
  legendary: { gold: 30000, iron: 15000, stone: 10500, food: 9000 }
};

/**
 * A kit gives a pack no more strength, only a different shape: what its kit is worth comes off its stats, so an army
 * that beat a pack before kits beats it now with no more losses (`npm run sim:balance` checks it). Its offence (ATK
 * Instincts, Enrage, Arts that strike or wound) comes off its ATK; its defence (HP and DEF Instincts, Arts that ward,
 * heal or hold the enemy back) off its HP, and an Art that does both off both. A pack seldom lives past its second
 * round, so an Art counts by how early it lands: NPC_ART_WORTH, more for one cast in the first round (Ambush); an Art
 * that guards counts NPC_GUARD_WORTH. A unit casts one Art a round, so a second Art mostly fills the rounds the first
 * waits out: it counts NPC_SECOND_ART_SHARE of that.
 */
export const NPC_ART_WORTH = 0.3;
export const NPC_OPENER_WORTH = 0.9;
export const NPC_GUARD_WORTH = 0.4;
export const NPC_ENRAGE_WORTH = 0.15;
export const NPC_SECOND_ART_SHARE = 0.5;
/** Statuses that hurt the enemy (they count as an Art's offence); every other status and every heal guards the caster */
const OFFENCE_STATUSES = new Set<string>(["burn", "poison", "bleed", "sunder", "rally"]);

/** What a pack's kit is worth, as multipliers on its ATK (offence) and HP (defence) */
export function npcKitWorth(unit: Pick<WorldNpcUnit, "def" | "kit">): { atk: number; hp: number } {
  if (!unit.kit) return { atk: 1, hp: 1 };
  const s = instinctStats({ name: "", rarity: "common", ...unit.kit });
  const armor = (d: number) => 1 - d / (d + COMBAT.ARMOR_K);
  let atk = (1 + s.atk) * (unit.kit.instincts.some((id) => INSTINCTS[id]?.effect.kind === "enrage") ? 1 + NPC_ENRAGE_WORTH : 1);
  let hp = (1 + s.hp) * (armor(unit.def) / armor(unit.def * (1 + s.def)));
  for (const [i, id] of unit.kit.arts.entries()) {
    const art = ARTS[id];
    if (!art) continue;
    const share = i === 0 ? 1 : NPC_SECOND_ART_SHARE;
    const offence = art.effect.some((e) => e.kind === "strike" || (e.kind === "status" && OFFENCE_STATUSES.has(e.status)));
    const guard = art.effect.some((e) => e.kind === "heal" || (e.kind === "status" && !OFFENCE_STATUSES.has(e.status)));
    if (offence) atk *= 1 + share * (art.once && art.castRound === 1 ? NPC_OPENER_WORTH : NPC_ART_WORTH);
    if (guard) hp *= 1 + share * NPC_GUARD_WORTH;
  }
  return { atk, hp };
}

/** A mob / bandit unit as it fights: its kit, its HP and ATK trimmed by the kit's worth (`kitless`: the table's stats, no kit) */
export function worldNpcUnitFor(type: string, kitless = false): WorldNpcUnit {
  const u = WORLD_NPC_UNITS[type] ?? WORLD_NPC_DEFAULT_UNIT;
  if (kitless || !u.kit) {
    const { kit: _kit, ...plain } = u;
    return plain;
  }
  const worth = npcKitWorth(u);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { ...u, hp: r1(u.hp / worth.hp), atk: r1(u.atk / worth.atk) };
}

/** What a kit costs a garrison that fights with its civilization's soldiers: multipliers on their HP and ATK (`def`: their DEF behind their walls) */
export function kitTrimFor(def: number, kit: Pick<UnitKit, "instincts" | "arts">): { hp: number; atk: number } {
  const worth = npcKitWorth({ def, kit });
  return { hp: 1 / worth.hp, atk: 1 / worth.atk };
}

/**
 * NPC kingdoms' garrisons (free realms by their cycle stage, frontier gates rare): each civilization's soldiers bring
 * their own Battle Arts, the first N of these by rarity (KIT_SIZES: common 1 Instinct, uncommon + 1 Art, rare + a
 * second Instinct, epic + a second Art). Like a pack's, the kit is paid for out of the garrison's stats (`kitTrimFor`).
 */
export const NPC_KINGDOM_KITS: Record<CivilizationType, { instincts: [string, string]; arts: [string, string] }> = {
  human: { instincts: ["stoneskin", "bloodlust"], arts: ["shield_wall", "war_cry"] },
  orc: { instincts: ["bloodlust", "enrage"], arts: ["war_cry", "armor_break"] },
  elf: { instincts: ["keen_eye", "light_footed"], arts: ["frost_lance", "second_wind"] },
  dwarf: { instincts: ["stoneskin", "thick_hide"], arts: ["armor_break", "shield_wall"] },
  arcane: { instincts: ["undying", "bloodlust"], arts: ["fireball", "thunderclap"] }
};

/** An NPC kingdom garrison's kit at its rarity (the first slots of its civilization's, KIT_SIZES), named for the reports */
export function npcKingdomKitFor(civ: CivilizationType, rarity: UnitKit["rarity"], name: string): UnitKit {
  const all = NPC_KINGDOM_KITS[civ] ?? NPC_KINGDOM_KITS.human;
  const size = KIT_SIZES[rarity] ?? KIT_SIZES.common;
  return { name, rarity, instincts: all.instincts.slice(0, Math.min(2, size.instincts)), arts: all.arts.slice(0, Math.min(2, size.arts)) };
}

/** A free realm's rarity at City Hall `level` (its cycle stage: Lv6–10 common … 21–25 epic) */
export function realmRarityAt(level: number): UnitKit["rarity"] {
  const stage = Math.max(0, Math.min(REALM_CYCLE.STAGES.length - 1, Math.ceil((level - REALM_CYCLE.START_LEVEL) / REALM_CYCLE.LEVELS_PER_STAGE) - 1));
  return REALM_CYCLE.STAGES[stage];
}

/** A mob's or bandit's kit as it fights, named for the reports (its spawn's rarity; never a boss) */
export function npcKitFor(type: string, rarity: UnitKit["rarity"] | undefined): UnitKit | undefined {
  const u = worldNpcUnitFor(type);
  return u.kit ? { name: u.name, rarity: rarity ?? "common", ...u.kit } : undefined;
}

/**
 * 🛡️ A pack's gear, rolled once when it spawns (seeded by its id) and hidden until a scout report shows it: most packs
 * are ragged, some armed, a few war-geared. Better gear is tougher (HP and DEF, a little ATK) and carries more loot,
 * so scouting a pack before attacking pays.
 */
export type PackGear = "ragged" | "armed" | "war_geared";
export const PACK_GEAR: Record<PackGear, { name: string; emblem: string; chance: number; hp: number; atk: number; def: number; loot: number; description: string }> = {
  ragged: { name: "Ragged", emblem: "🪵", chance: 0.6, hp: 1, atk: 1, def: 1, loot: 1, description: "scraps and clubs" },
  armed: { name: "Armed", emblem: "🗡️", chance: 0.3, hp: 1.25, atk: 1.1, def: 1.25, loot: 1.3, description: "+25% HP and DEF, +10% ATK; +30% loot" },
  war_geared: { name: "War-geared", emblem: "🛡️", chance: 0.1, hp: 1.5, atk: 1.25, def: 1.5, loot: 1.75, description: "+50% HP and DEF, +25% ATK; +75% loot" }
};
export const PACK_GEAR_ORDER: PackGear[] = ["ragged", "armed", "war_geared"];

/** A spawn's gear (deterministic from its id: everyone, the scout and the battle agree) */
export function packGearFor(npcId: string): PackGear {
  let h = 2166136261;
  for (let i = 0; i < npcId.length; i++) h = Math.imul(h ^ npcId.charCodeAt(i), 16777619);
  const roll = ((h >>> 0) % 100_000) / 100_000;
  let acc = 0;
  for (const g of PACK_GEAR_ORDER) {
    acc += PACK_GEAR[g].chance;
    if (roll < acc) return g;
  }
  return "ragged";
}

/** A mob / bandit unit in its gear: worldNpcUnitFor with the gear's HP, ATK and DEF */
export function gearedNpcUnitFor(type: string, gear: PackGear): WorldNpcUnit {
  const u = worldNpcUnitFor(type);
  const g = PACK_GEAR[gear];
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { ...u, hp: r1(u.hp * g.hp), atk: r1(u.atk * g.atk), def: r1(u.def * g.def) };
}

/** Full pack size of a mob / bandit spawn of this type and tier */
export function worldNpcPackSize(type: string, rarity: string | undefined): number {
  return Math.max(1, Math.round(worldNpcUnitFor(type).count * (WORLD_NPC_TIER_COUNT_MULT[rarity ?? "common"] ?? 1)));
}

/** Fog bands: an exact number shown as a range without a scout report */
export function fogBand(n: number): string {
  if (n <= 0) return "none";
  if (n < 10) return "a handful";
  const mag = 10 ** Math.floor(Math.log10(n));
  const step = mag >= 100 ? mag / 2 : mag;
  const lo = Math.floor(n / step) * step;
  return `~${lo.toLocaleString("en-US")}–${(lo + step).toLocaleString("en-US")}`;
}

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

export function wallMaxHpFor(cityHallLevel: number, wallTier: number): number {
  const t = Math.max(0, Math.min(5, Math.floor(wallTier || 0)));
  return Math.round(WALL_HP_PER_LEVEL * Math.max(1, cityHallLevel) * WALL_TIER_HP_MULT[t]);
}

export function computeWallState(
  storedHp: number | null | undefined,
  updatedAt: number | null | undefined,
  wallMaxHp: number,
  now = Date.now()
): { wallHp: number; wallMaxHp: number; burning: boolean; burningEndsAt: number | null } {
  if (storedHp === null || storedHp === undefined || updatedAt === null || updatedAt === undefined) {
    return { wallHp: wallMaxHp, wallMaxHp, burning: false, burningEndsAt: null };
  }
  const initialHp = Math.max(0, Math.min(wallMaxHp, storedHp));
  const elapsed = Math.max(0, now - updatedAt);
  const burnCap = WALL_BURN_THRESHOLD * wallMaxHp;
  const unburnTarget = WALL_UNBURN_SHARE * wallMaxHp;
  const rBurn = unburnTarget / WALL_BURN_REPAIR_MS;
  const rNormal = wallMaxHp / WALL_REPAIR_FULL_MS;

  if (initialHp <= burnCap) {
    const msToCrossBurn = Math.max(0, (unburnTarget - initialHp) / rBurn);
    if (elapsed <= msToCrossBurn) {
      const hp = Math.floor(initialHp + rBurn * elapsed);
      const remainingMs = Math.ceil(msToCrossBurn - elapsed) + 1000;
      return {
        wallHp: hp,
        wallMaxHp,
        burning: true,
        burningEndsAt: now + remainingMs
      };
    }
    const remElapsed = elapsed - msToCrossBurn;
    const hp = Math.min(wallMaxHp, Math.floor(unburnTarget + rNormal * remElapsed));
    return { wallHp: hp, wallMaxHp, burning: false, burningEndsAt: null };
  }

  const hp = Math.min(wallMaxHp, Math.floor(initialHp + rNormal * elapsed));
  return { wallHp: hp, wallMaxHp, burning: false, burningEndsAt: null };
}


// Gathering (GAME_GUIDE §13)
/** Bulk resources a march loads and the rate counts; gems in a node ride along without weight */
export const BULK_RESOURCES = ["gold", "iron", "stone", "lumber", "food"] as const;
/** Units gathered per second at 1× (a common 9,000-lumber node in ~10 min) */
export const GATHER_RATE_PER_SEC = 16;
/** Gathering speed by civ and resource (1 when missing); orcs work everything a little faster */
export const CIV_GATHER_MULT: Record<CivilizationType, Partial<Record<string, number>> & { all?: number }> = {
  elf: { lumber: 2, mana: 2 },
  dwarf: { stone: 1.5, iron: 1.5, gold: 1.5 },
  human: { food: 1.5 },
  orc: { all: 1.25 },
  arcane: {}
};
/** Claiming a treasure chest takes this long at the spot, whatever the troops */
export const TREASURE_CLAIM_MS = 30_000;
/** What a chest holds, by tier: taken whole by the claimer (no load cap); epic+ add gems */
export const TREASURE_CONTENTS_BY_TIER: Record<string, { gold: number; iron: number; stone: number; lumber: number; food: number; gems: number }> = {
  common: { gold: 1200, iron: 1000, stone: 800, lumber: 600, food: 400, gems: 0 },
  uncommon: { gold: 2800, iron: 2400, stone: 2000, lumber: 1600, food: 1200, gems: 0 },
  rare: { gold: 6000, iron: 4800, stone: 4000, lumber: 3200, food: 2000, gems: 0 },
  epic: { gold: 10000, iron: 8000, stone: 6000, lumber: 4800, food: 3200, gems: 1 },
  legendary: { gold: 20000, iron: 16000, stone: 12000, lumber: 8000, food: 4000, gems: 2 }
};

/**
 * Safe territory: a civ's own province and the two buffer zones bordering it, by map region name.
 * Nethergarde has none (no node spawns in the Voidrift): its gatherers are always exposed.
 */
export const REGION_SAFE_FOR: Record<string, CivilizationType[]> = {
  "Valorian Heartlands": ["human"],
  "Sylvandale Glades": ["elf"],
  "Ironforge Highlands": ["dwarf"],
  "Badlands of Drak'mar": ["orc"],
  "The Sunken Fjord": ["elf", "dwarf"],
  "The Scorchwind Expanse": ["human", "orc"],
  "The Whispering Deepwood": ["human", "elf"],
  "The Dragonspine Peaks": ["dwarf", "orc"]
};

export function isSafeRegionFor(civ: CivilizationType, region: string | undefined): boolean {
  return Boolean(region && REGION_SAFE_FOR[region]?.includes(civ));
}

/** Gathering speed (units / s) of a civ on a node: rate × the yield-weighted civ multiplier */
export function gatherRateFor(civ: CivilizationType, yieldMix: Record<string, number>): number {
  const m = CIV_GATHER_MULT[civ] ?? {};
  let bulk = 0;
  let weighted = 0;
  for (const k of BULK_RESOURCES) {
    const v = yieldMix[k] ?? 0;
    if (v <= 0) continue;
    bulk += v;
    weighted += v * (m[k] ?? m.all ?? 1);
  }
  return GATHER_RATE_PER_SEC * (bulk > 0 ? weighted / bulk : m.all ?? 1);
}

/** Total bulk (weighted) units of a node's yield */
export function bulkOf(yieldMix: Record<string, number> | undefined): number {
  return BULK_RESOURCES.reduce((sum, k) => sum + (yieldMix?.[k] ?? 0), 0);
}

/* ------------------------------------------------------------------------- */
/* World bosses, NPC kingdoms & Special Overseers (GAME_GUIDE §13)           */
/* ------------------------------------------------------------------------- */

/**
 * A world boss is one unit with a huge HP pool shared by the whole realm: damage stays between battles,
 * there is no regeneration, and only the kill timer or the weekly rotation restores it. Tuned with
 * `npm run sim:balance` so a lone mid-level march barely dents it and a 3–5-member rally of mid-level
 * rulers kills it in a few attempts.
 *
 * Each carries a colossus's Battle Arts kit (battleArts.ts): 3 Instincts, Cleave among them on every boss (it kills a share
 * of every army each round, so a boss's blows reach the whole host, not only its front), 2 Arts and a Finale of its own, so an army
 * that brings no Arts of its own fights it at a disadvantage.
 */
export interface BossUnit {
  hp: number;
  atk: number;
  def: number;
  kit: Pick<UnitKit, "instincts" | "arts" | "finale">;
}

/** A colossus's kit: 3 Instincts (Cleave on every boss), 2 Arts and its own Finale */
const kit = (instincts: [string, string, string], arts: [string, string], finale: string) => ({ instincts, arts, finale });

export const BOSS_BASE = { hp: 120_000, atk: 900, def: 10 } as const;

export const BOSS_UNITS: Record<string, BossUnit> = {
  // The Sunken Fjord: cold water and drowning
  "boss-kraken": { ...BOSS_BASE, kit: kit(["cleave", "thick_hide", "enrage"], ["frost_lance", "glacial_prison"], "abyssal_grasp") },
  "boss-leviathan": { ...BOSS_BASE, hp: 105_000, kit: kit(["cleave", "stoneskin", "bloodlust"], ["ward", "frost_lance"], "maelstrom") },
  "boss-siren": { ...BOSS_BASE, atk: 800, kit: kit(["enrage", "bloodlust", "cleave"], ["ward", "thunderclap"], "sirens_requiem") },
  // The Scorchwind Expanse: sand, sun and venom
  "boss-sandworm": { ...BOSS_BASE, hp: 130_000, kit: kit(["cleave", "thick_hide", "enrage"], ["armor_break", "rending_blow"], "devouring_maw") },
  "boss-sphinx": { ...BOSS_BASE, def: 14, kit: kit(["enrage", "stoneskin", "cleave"], ["ward", "thunderclap"], "sandstorm") },
  "boss-scorpion": { ...BOSS_BASE, atk: 1000, kit: kit(["cleave", "enrage", "bloodlust"], ["venom_volley", "armor_break"], "stinger_storm") },
  // The Whispering Deepwood: the forest hunts
  "boss-treant": { ...BOSS_BASE, hp: 135_000, atk: 750, kit: kit(["stoneskin", "bloodlust", "cleave"], ["ward", "second_wind"], "grasping_roots") },
  "boss-wolf": { ...BOSS_BASE, atk: 1000, kit: kit(["enrage", "bloodlust", "cleave"], ["rending_blow", "war_cry"], "wild_hunt") },
  "boss-fae": { ...BOSS_BASE, hp: 105_000, kit: kit(["cleave", "thick_hide", "stoneskin"], ["ward", "venom_volley"], "fae_glamour") },
  // The Dragonspine Peaks: fire, frost and stone
  "boss-dragon": { ...BOSS_BASE, hp: 125_000, atk: 1000, kit: kit(["cleave", "enrage", "thick_hide"], ["fireball", "war_cry"], "dragonfire") },
  "boss-yeti": { ...BOSS_BASE, def: 14, kit: kit(["enrage", "thick_hide", "cleave"], ["frost_lance", "shield_wall"], "avalanche") },
  "boss-gorgon": { ...BOSS_BASE, kit: kit(["cleave", "stoneskin", "bloodlust"], ["ward", "glacial_prison"], "petrifying_gaze") }
};

export interface HorrorStats {
  hp: number;
  atk: number;
  def: number;
}

/** 🌑 Xal'Vorath's base stats by Level, 1–5 (horrorRules.ts; tuned with `npm run sim:balance`) */
export const HORROR_LEVELS: Record<number, HorrorStats> = {
  1: { hp: 120_000, atk: 1_000, def: 10 },
  2: { hp: 180_000, atk: 1_100, def: 11 },
  3: { hp: 260_000, atk: 1_250, def: 12 },
  4: { hp: 380_000, atk: 1_400, def: 13 },
  5: { hp: 560_000, atk: 1_600, def: 14 }
};

/** Its map model and NPC type */
export const HORROR_NPC_TYPE = "mythic-singularity";

/** The mythic kit, the one unit that carries it in the realm: 3 Instincts, 3 Arts and its own Finale */
export const HORROR_KIT: BossUnit["kit"] = { instincts: ["cleave", "thick_hide", "enrage"], arts: ["thunderclap", "armor_break", "rending_blow"], finale: "the_devouring" };

export function bossUnitFor(type: string): BossUnit {
  // Its stats are each horror's own (horror.ts); this Level 3 is what the Sparring Grounds pits it at
  if (type === HORROR_NPC_TYPE) return { ...HORROR_LEVELS[3], kit: HORROR_KIT };
  return BOSS_UNITS[type] ?? BOSS_UNITS["boss-kraken"];
}

/** A boss's kit as it fights (legendary, one colossal unit), named for the reports */
export function bossKitFor(type: string, name: string): UnitKit {
  return { name, rarity: type === HORROR_NPC_TYPE ? "mythic" : "legendary", boss: true, ...bossUnitFor(type).kit };
}

/**
 * Colossus Hide: armies deal damage to world bosses by their ruler's City Hall, (CH / 25)², so only the
 * highest kingdoms hit at full strength (City Hall 15 → 36%, 20 → 64%, 25 → 100%). Bosses are raid content:
 * a mid-level ruler sending every march slot barely scratches one.
 */
export const BOSS_HIDE_FULL_LEVEL = 25;
export function bossHideMult(cityHallLevel: number): number {
  return Math.min(1, Math.max(1, cityHallLevel) / BOSS_HIDE_FULL_LEVEL) ** 2;
}

/**
 * A civilization's share of its blows that lands on a world boss, on top of Colossus Hide (1 when missing). Orcs'
 * Frenzy Breaks on Colossi: a City Hall 25 horde's soldiers alone would kill some bosses in one battle. Elves'
 * Heartseeker Volleys and dwarves' Giant-Felling Runes: their small armies would otherwise need two or three times the
 * battles of the others, alone and in a rally (sim:balance prints the boss table)
 */
export const CIV_BOSS_DAMAGE: Partial<Record<CivilizationType, { mult: number; emblem: string; name: string; description: string }>> = {
  orc: { mult: 0.5, emblem: "🪓", name: "Frenzy Breaks on Colossi", description: "−50% damage to world bosses (the war-drums can't drown a colossus's roar)" },
  elf: { mult: 2, emblem: "🏹", name: "Heartseeker Volleys", description: "+100% damage to world bosses (an elven arrow finds the one soft seam in a colossus's hide)" },
  dwarf: { mult: 1.8, emblem: "⚒️", name: "Giant-Felling Runes", description: "+80% damage to world bosses (the old runes on dwarven steel were cut for giants)" }
};
/** Share of an army's blows that lands on a world boss: Colossus Hide by City Hall × its civilization's boss share */
export function bossDamageMult(cityHallLevel: number, civ: CivilizationType): number {
  return bossHideMult(cityHallLevel) * (CIV_BOSS_DAMAGE[civ]?.mult ?? 1);
}

/**
 * 🗿 Titan's Endurance: no single battle takes more than this share of a world boss's max HP, whoever fights it (a lone
 * ruler, a rally, a ruler with champions and bands). A boss is never felled in one battle from full HP; one already
 * below this share can be. Blows past it bounce off.
 */
export const BOSS_BATTLE_CAP = { share: 0.6, emblem: "🗿", name: "Titan's Endurance" } as const;
/**
 * 🌋 Colossus's Wrath: when every army fighting a boss belongs to one ruler (their mercenary bands count as theirs) and
 * they take this share of its max HP in one battle, the boss rages for the rest of that battle: ATK × `atkMult`,
 * multiplied with its own Enrage Instinct if that wakes too. A lone burst army pays for it; rallies never wake it.
 */
export const BOSS_WRATH = { trigger: 0.3, atkMult: 2, emblem: "🌋", name: "Colossus's Wrath" } as const;

/** A killed boss comes back at full HP after this long (still rotates on the weekly boundary) */
export const BOSS_RESPAWN_MS = 24 * 60 * 60 * 1000;

/**
 * Vengeance: every time a zone's boss is felled this week, the boss that wakes there next is this much stronger
 * (HP, ATK and DEF), stacking; back to 0 at the weekly rotation. Stops a zone being farmed every 24 h.
 */
export const BOSS_VENGEANCE_PER_KILL = 0.1;
export function bossVengeanceMult(stacks: number): number {
  return 1 + BOSS_VENGEANCE_PER_KILL * Math.max(0, stacks);
}
/** A boss unit with `stacks` of Vengeance */
export function vengefulBossUnit(unit: BossUnit, stacks: number): BossUnit {
  const m = bossVengeanceMult(stacks);
  return { ...unit, hp: Math.round(unit.hp * m), atk: Math.round(unit.atk * m), def: Math.round(unit.def * m * 10) / 10 };
}

/**
 * Boss loot (decided): the **hoard** goes to the armies in the killing battle, taken by load (survivors × load,
 * first-arrived army first; what nobody can carry is left behind) plus its gems split by survivors. The **bounty**
 * is shared by every army that damaged this boss during its current life, in proportion to the damage dealt,
 * and paid straight into their treasuries when it falls.
 */
export const BOSS_HOARD = { gold: 36_000, iron: 60_000, stone: 60_000, lumber: 60_000, food: 90_000 } as const;
export const BOSS_HOARD_GEMS = 6;
/** Gem kinds a boss hoard can hold (picked per boss type, must be keys of SCARCE_RESOURCES in db.ts) */
export const BOSS_GEM_KEYS = ["dragon_scale", "mithril", "obsidian", "aether", "diamond", "ancient_rune"] as const;
export const BOSS_BOUNTY = { gold: 12_000, iron: 24_000, stone: 24_000, lumber: 24_000, food: 36_000 } as const;

/**
 * 👑 Free realms pay by their tier: their treasury is this many times the City Hall rate (frontier gates ×1), and beating
 * the garrison wins its conquest hoard, paid straight into the conquerors' treasuries by damage dealt in that battle,
 * once a day per realm (REALM_HOARD_COOLDOWN_MS). The higher the realm, the far bigger the prize.
 */
export const REALM_TREASURY_TIER_MULT: Record<"common" | "uncommon" | "rare" | "epic", number> = { common: 1, uncommon: 1.5, rare: 2.5, epic: 4 };
export const REALM_CONQUEST_HOARD: Record<"common" | "uncommon" | "rare" | "epic", { gold: number; iron: number; stone: number; lumber: number; food: number; gems: number }> = {
  common: { gold: 3_000, iron: 4_000, stone: 4_000, lumber: 4_000, food: 5_000, gems: 0 },
  uncommon: { gold: 9_000, iron: 12_000, stone: 12_000, lumber: 12_000, food: 15_000, gems: 0 },
  rare: { gold: 22_000, iron: 30_000, stone: 30_000, lumber: 30_000, food: 38_000, gems: 2 },
  epic: { gold: 50_000, iron: 60_000, stone: 60_000, lumber: 60_000, food: 90_000, gems: 5 }
};
export const REALM_HOARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** One resource of an NPC kingdom's treasury cap: the City Hall rate × level × its tier (a frontier gate ×1) */
export function npcTreasuryCapOf(key: keyof typeof NPC_KINGDOM_TREASURY_PER_LEVEL, level: number, gate: boolean): number {
  const m = gate ? 1 : REALM_TREASURY_TIER_MULT[realmRarityAt(level) as keyof typeof REALM_TREASURY_TIER_MULT] ?? 1;
  return Math.round(NPC_KINGDOM_TREASURY_PER_LEVEL[key] * level * m);
}
/** The gem kind a realm's hoard holds (one of the boss gems, fixed per realm) */
export function realmHoardGemFor(realmId: string): (typeof BOSS_GEM_KEYS)[number] {
  let h = 0;
  for (let i = 0; i < realmId.length; i++) h = (h * 31 + realmId.charCodeAt(i)) >>> 0;
  return BOSS_GEM_KEYS[h % BOSS_GEM_KEYS.length];
}

/**
 * NPC kingdoms: the four buffer-zone realms and the four frontier gates are simulated kingdoms with the
 * demographics and soldiers of a bordering mortal civilization, a treasury that refills every harvest and walls by
 * level. Never destroyed.
 *
 * A buffer realm's City Hall follows its 28-day cycle (GAME_GUIDE §13 → NPC kingdoms): four 7-day stages, common →
 * epic. On a stage's day 0 it is built up, shielded, at the previous stage's top level; on days 1–5 it gains a level
 * a day, refilled to full (garrison, people, treasury, walls) at each one; on day 6 it holds the stage's top. After
 * the epic week it leaves, and another realm of the zone's pool rises somewhere else in the region. The four zones
 * are a week apart, so each week shows one realm of every stage.
 */
export const REALM_CYCLE = {
  STAGES: ["common", "uncommon", "rare", "epic"] as const,
  /** City Hall while the first stage is built (day 0 of the common week) */
  START_LEVEL: 5,
  LEVELS_PER_STAGE: 5,
  STAGE_DAYS: 7
} as const;
/** A buffer realm's City Hall on day `day` (0–6) of stage `stage` (0–3): Lv5 building → 6…10, 10 → 11…15, … → 25 */
export function realmLevelOn(stage: number, day: number): number {
  const top = REALM_CYCLE.START_LEVEL + REALM_CYCLE.LEVELS_PER_STAGE * (stage + 1);
  return Math.min(top, top - REALM_CYCLE.LEVELS_PER_STAGE + Math.max(0, day));
}
/** Treasury cap per City Hall level (start full; refills `NPC_KINGDOM_REFILL_SHARE` of it per harvest) */
export const NPC_KINGDOM_TREASURY_PER_LEVEL = { gold: 5_000, iron: 7_000, stone: 7_000, lumber: 8_000, food: 10_000 } as const;
export const NPC_KINGDOM_REFILL_SHARE = 0.1;
/** Frontier gates belong to their province's civilization */
export const NPC_GATE_CIV: Record<string, CivilizationType> = {
  "npc-gate-valoria": "human",
  "npc-gate-drakmar": "orc",
  "npc-gate-sylvandale": "elf",
  "npc-gate-ironforge": "dwarf"
};

/**
 * Frontier gates (GAME_GUIDE §13 → Frontier gates): a fixed City Hall and wall tier, a base garrison of the gate's
 * own civ sized so a lone City Hall 15 ruler of any civ beats a bare gate with 3 marches and no buffs
 * (`npm run sim:gates`), and a reinforce cap (base garrison + stationed reinforcements): the civ's population at
 * City Hall 20, trimmed for dwarves and elves so a rally of 5 City Hall 20 rulers of any civ still breaks a full gate. While a gate isn't burning its province is sealed: no other civ can attack
 * a city there. Troops on gate duty eat `DUTY_UPKEEP` per soldier per harvest on top of the normal upkeep.
 */
export const GATE = {
  LEVEL: 20,
  WALL_TIER: 3,
  /** Fixed wall HP (not by level): small enough that a ruler of a small army can still set it burning in a few waves */
  WALL_HP: 12_000,
  BASE_GARRISON: { human: 430, orc: 490, dwarf: 95, elf: 45, arcane: 0 } as Record<CivilizationType, number>,
  /** Human / orc: their max population at City Hall 20; dwarf / elf trimmed (their soldiers are strong enough that 1,600 / 700 would hold off any rally) */
  REINFORCE_CAP: { human: 4000, orc: 2800, dwarf: 800, elf: 380, arcane: 0 } as Record<CivilizationType, number>,
  /** Each harvest the base garrison regrows by this share of itself (never above the base) */
  REFILL_SHARE: 0.5,
  /** Per soldier per harvest: their rations plus timber, stone and iron to keep the gate and its wall in good shape */
  DUTY_UPKEEP: { food: 1, lumber: 1, stone: 1, iron: 1 },
  /** Chance to catch a scouting party heading into a sealed province: base + fill × (max − base), fill = troops ÷ cap */
  SCOUT_CATCH_BASE: 0.15,
  SCOUT_CATCH_MAX: 0.3
} as const;
export const gateBaseGarrison = (civ: CivilizationType) => GATE.BASE_GARRISON[civ] ?? 0;
export const gateReinforceCap = (civ: CivilizationType) => GATE.REINFORCE_CAP[civ] ?? 0;
/** A mortal civilization's frontier gate id (its province is sealed while the gate stands) */
export const GATE_OF_CIV: Partial<Record<CivilizationType, string>> = Object.fromEntries(Object.entries(NPC_GATE_CIV).map(([id, civ]) => [civ, id]));
/** Catch chance for scouts heading into a sealed province, by how full its gate is (troops ÷ cap, 0–1) */
export const gateScoutCatchChance = (fill: number) => GATE.SCOUT_CATCH_BASE + Math.max(0, Math.min(1, fill)) * (GATE.SCOUT_CATCH_MAX - GATE.SCOUT_CATCH_BASE);

export function npcWallTierFor(level: number): number {
  let tier = 0;
  for (const [lvl, t] of Object.entries(NPC_WALL_TIER_BY_LEVEL)) if (level >= Number(lvl)) tier = t;
  return tier;
}

/**
 * Special Overseers: a loot area. Their treasury, population and garrison reset every harvest; every
 * defeat this week adds a Resolve stack (+20% HP, ATK and DEF each), reset Sunday 00:00 UTC. Uncapped on purpose.
 */
export const OVERSEER_TREASURY = { gold: 50_000, iron: 200_000, stone: 200_000, lumber: 200_000, food: 500_000 } as const;
export const OVERSEER_SCARCE: Record<string, number> = {
  mana: 50,
  aether: 25,
  diamond: 25,
  mithril: 25,
  dragon_scale: 10,
  titan_tablet: 10,
  phoenix_feather: 10
};
export const OVERSEER_GRUDGE_PER_DEFEAT = 0.2;
/** Share of their maximum soldiers standing in an Overseer's garrison after each respawn (a loot run early in the week) */
export const OVERSEER_GARRISON_SHARE = 0.2;
