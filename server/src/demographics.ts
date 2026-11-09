import { CivilizationType, TitleBuffs } from "./types.js";
import { FAMINE_DESERTION_RATE, SOLDIER_FOOD_UPKEEP, SWAP_DEFEAT_SURVIVAL, VOID_WELL_RESPAWN_RATE } from "./warConfig.js";
import { config } from "./env.js";
import { CIV_MODIFIERS, MIN_STAT_SHARE } from "./warConfig.js";

export interface CivDemographicProfile {
  popMultiplier: number;
  birthFactor: number;
  /** Lifespan as a multiple of BASE_LIFESPAN_HOURS: 1.0 = 24h, 0.6 = 14.4h, 3.0 = 72h, 10.0 = 240h, Infinity = immortal */
  lifespanFactor: number;
  marchSpeedMultiplier: number; // 1.4 = Elves (+40%), 1.2 = Orcs (+20%), 1.0 = Humans, 0.8 = Dwarves (-20%), 1.1 = Nethergarde (+10%)
  soldierUnit: {
    name: string;
    hp: number;
    atk: number;
    def: number;
    trait: string;
  };
  /** Per 100 civilians per harvest; `mana` and `gems` (this harvest's scarce drop) are scarce resources */
  civilianYield: {
    food: number;
    gold: number;
    iron: number;
    stone: number;
    lumber: number;
    mana: number;
    gems: number;
  };
}

export const CIV_DEMOGRAPHICS: Record<CivilizationType, CivDemographicProfile> = {
  human: {
    popMultiplier: 2.0,
    birthFactor: 0.12,
    lifespanFactor: 1.0, // 24 hours (96 ticks)
    marchSpeedMultiplier: 1.0,
    soldierUnit: {
      name: "Royal Footman",
      hp: 12,
      atk: 5,
      def: 3,
      trait: "Swarm Tactics (+Numerical Superiority)"
    },
    civilianYield: {
      food: 150,
      gold: 50,
      lumber: 50,
      stone: 0,
      iron: 0,
      mana: 0,
      gems: 0
    }
  },
  orc: {
    popMultiplier: 1.4,
    birthFactor: 0.15,
    lifespanFactor: 0.6, // 14.4 hours (58 ticks)
    marchSpeedMultiplier: 1.2,
    soldierUnit: {
      name: "Blood Berserker",
      hp: 28,
      atk: 16,
      def: 6,
      trait: "Frenzy Charge (+25% Initial Strike)"
    },
    civilianYield: {
      food: 100,
      iron: 100,
      gold: 0,
      stone: 0,
      lumber: 0,
      mana: 0,
      gems: 0
    }
  },
  dwarf: {
    popMultiplier: 0.8,
    birthFactor: 0.04,
    lifespanFactor: 3.0, // 72 hours (288 ticks)
    marchSpeedMultiplier: 0.8,
    soldierUnit: {
      name: "Ironbreaker Sentinel",
      hp: 42,
      atk: 8,
      def: 24,
      trait: "Shield Wall (-40% Physical Damage)"
    },
    civilianYield: {
      stone: 150,
      iron: 100,
      gold: 40,
      food: 0,
      lumber: 0,
      mana: 0,
      gems: 0
    }
  },
  elf: {
    popMultiplier: 0.35,
    birthFactor: 0.015,
    lifespanFactor: 10.0, // 240 hours (960 ticks)
    marchSpeedMultiplier: 1.4,
    soldierUnit: {
      name: "Sylvan Ranger",
      hp: 24,
      atk: 18,
      def: 8,
      trait: "Arcane Precision (Ignore 30% Armor)"
    },
    // Mystic gatherers: lumber, mana and rare gems. The original design's 80 mana + 30 gems per 100
    // out-gathered the whole realm's drops (~250 mana / ~416 gems per harvest in total), so they
    // are scaled to roughly 1.5–2× an average developer's share of the scarce drops
    civilianYield: {
      lumber: 80,
      food: 0,
      gold: 0,
      stone: 0,
      iron: 0,
      mana: 3,
      gems: 1
    }
  },
  arcane: {
    popMultiplier: 0.6,
    birthFactor: 0.0, // No births: summoned with resources, fallen constructs return through the Void Well
    lifespanFactor: Infinity, // Immortal constructs
    marchSpeedMultiplier: 1.1,
    soldierUnit: {
      name: "Void Weaver",
      hp: 50,
      atk: 14,
      def: 14,
      trait: "Ethereal Shield (Combat Respawn)"
    },
    civilianYield: {
      food: 50,
      gold: 50,
      iron: 50,
      lumber: 50,
      stone: 50,
      mana: 0,
      gems: 0
    }
  }
};

/** Harvest ticks in one lifespan of this civ (24 h of 15-minute harvests = 96 ticks for humans) */
export function lifespanTicks(civ: CivilizationType): number {
  const profile = CIV_DEMOGRAPHICS[civ] || CIV_DEMOGRAPHICS.human;
  return (config.baseLifespanHours * profile.lifespanFactor * 60) / config.syncIntervalMinutes;
}

/**
 * Density-dependent mortality per harvest (GAME_GUIDE §13): base rate × saturation S.
 * Near-empty kingdoms barely die at all; a crowded one loses about 1/lifespan of its people per harvest.
 */
export function calculateDeathRate(civ: CivilizationType, saturation: number): number {
  const ticks = lifespanTicks(civ);
  if (!Number.isFinite(ticks)) return 0; // immortal
  return (1 / ticks) * Math.max(0, Math.min(1, saturation));
}

/** Natural deaths next harvest: ⌊pop × rate⌋, and only civilians die of age */
export function estimateNaturalDeaths(currentPop: number, civ: CivilizationType, saturation: number, civilians = currentPop): number {
  return Math.min(civilians, Math.floor(currentPop * calculateDeathRate(civ, saturation)));
}

/**
 * Births next harvest (GAME_GUIDE §13): max(1, ⌊pop × birth factor × (1 − S)⌋) while there is room.
 * The free room makes it an S-curve: a kingdom gutted by war (S near 0) breeds at its full rate.
 */
export function estimateNaturalBirths(currentPop: number, civ: CivilizationType, saturation: number): number {
  const profile = CIV_DEMOGRAPHICS[civ] || CIV_DEMOGRAPHICS.human;
  if (profile.birthFactor <= 0 || currentPop <= 0 || saturation >= 1) return 0;
  return Math.max(1, Math.floor(currentPop * profile.birthFactor * (1 - saturation)));
}

/** Fallen Nethergarde soldiers re-manifesting from the Void Well this harvest */
export function voidWellRespawn(voidWell: number, room: number): number {
  if (voidWell <= 0 || room <= 0) return 0;
  return Math.min(voidWell, room, Math.max(1, Math.ceil(voidWell * VOID_WELL_RESPAWN_RATE)));
}

/** Calculate maximum population capacity for a kingdom */
export function calculateMaxPopulation(cityHallLevel: number, civ: CivilizationType): number {
  const profile = CIV_DEMOGRAPHICS[civ] || CIV_DEMOGRAPHICS.human;
  return Math.max(20, Math.round(cityHallLevel * 100 * profile.popMultiplier));
}

/** Calculate genesis starting population */
export function calculateGenesisPopulation(cityHallLevel: number, civ: CivilizationType): number {
  const profile = CIV_DEMOGRAPHICS[civ] || CIV_DEMOGRAPHICS.human;
  return Math.max(5, Math.round(cityHallLevel * 10 * profile.popMultiplier));
}

export interface DemographicCycleResult {
  births: number;
  deaths: number;
  foodUpkeep: number;
  famine: boolean;
  desertedSoldiers: number;
  civilianYield: {
    food: number;
    gold: number;
    iron: number;
    stone: number;
    lumber: number;
    mana: number;
    gems: number;
  };
  newPopulation: number;
  newSoldiers: number;
  /** Nethergarde soldiers back from the Void Well (they rejoin the garrison) */
  respawned: number;
  /** ☠️ Wasting Plague: civilians it took this harvest (counted in `deaths` too) */
  plagueDeaths: number;
}

/**
 * Execute a single 15-minute demographic simulation tick for a kingdom.
 * `currentPop` counts everyone, including soldiers away on a march (`deployedSoldiers`); only the
 * remaining civilians work, age and die, and only the home garrison eats from the granary.
 */
export function simulateDemographicCycle(params: {
  currentPop: number;
  currentSoldiers: number;
  deployedSoldiers?: number;
  /** Nethergarde soldiers waiting in the Void Well */
  voidWell?: number;
  /** Own soldiers stationed in allies' castles: they eat from this granary too */
  stationedSoldiers?: number;
  cityHallLevel: number;
  civilization: CivilizationType;
  availableFood: number;
  /** Royal Gardens: births multiplied by this (default 1) */
  birthMult?: number;
  /** Royal Gardens: famine desertion multiplied by this (default 1) */
  famineMult?: number;
  /** Royal Punishment (High death rate): natural deaths multiplied by this (default 1) */
  deathMult?: number;
  /** ☠️ Wasting Plague: this share of the civilians die on top of natural deaths (default 0) */
  plagueRate?: number;
  /** 🥀 Barren Spell: the Void Well returns × this of its fallen (default 1) */
  respawnMult?: number;
}): DemographicCycleResult {
  const { currentPop, currentSoldiers, deployedSoldiers = 0, voidWell = 0, stationedSoldiers = 0, cityHallLevel, civilization, availableFood, birthMult = 1, famineMult = 1, deathMult = 1, plagueRate = 0, respawnMult = 1 } = params;
  const profile = CIV_DEMOGRAPHICS[civilization] || CIV_DEMOGRAPHICS.human;
  const maxCap = calculateMaxPopulation(cityHallLevel, civilization);

  const saturation = Math.min(1, Math.max(0, currentPop / maxCap));
  const military = currentSoldiers + deployedSoldiers;
  const civiliansBefore = Math.max(0, currentPop - military);

  // 1. Births (S-curve, frozen while the granary is empty) and Void Well respawns
  const births = availableFood > 0 ? Math.min(Math.max(0, maxCap - currentPop), Math.floor(estimateNaturalBirths(currentPop, civilization, saturation) * birthMult)) : 0;
  const respawnRoom = maxCap - currentPop - births;
  const respawned = respawnMult < 1 ? Math.min(voidWell, Math.floor(voidWellRespawn(voidWell, respawnRoom) * respawnMult)) : voidWellRespawn(voidWell, respawnRoom);

  // 2. Natural deaths (density-dependent) fall on civilians; soldiers die in battle, not of old age. The Wasting Plague
  // takes its share of the civilians on top
  const natural = Math.min(civiliansBefore, Math.floor(estimateNaturalDeaths(currentPop, civilization, saturation, civiliansBefore) * deathMult));
  const plagueDeaths = plagueRate > 0 ? Math.min(civiliansBefore - natural, Math.floor(civiliansBefore * plagueRate)) : 0;
  const deaths = natural + plagueDeaths;

  // 3. Garrison upkeep & famine desertion
  const foodUpkeep = (currentSoldiers + stationedSoldiers) * SOLDIER_FOOD_UPKEEP;
  const famine = availableFood < foodUpkeep;
  const desertedSoldiers = famine && currentSoldiers > 0 ? Math.ceil(currentSoldiers * FAMINE_DESERTION_RATE * famineMult) : 0;
  const activeSoldiers = currentSoldiers - desertedSoldiers + respawned;

  // 4. Civilian production (deserters join the workforce)
  const civilians = civiliansBefore - deaths + desertedSoldiers;
  const perHundred = (v: number) => Math.floor((civilians / 100) * v);
  const civYield = {
    food: perHundred(profile.civilianYield.food),
    gold: perHundred(profile.civilianYield.gold),
    iron: perHundred(profile.civilianYield.iron),
    stone: perHundred(profile.civilianYield.stone),
    lumber: perHundred(profile.civilianYield.lumber),
    mana: perHundred(profile.civilianYield.mana),
    gems: perHundred(profile.civilianYield.gems)
  };

  // 5. Final population: never below the soldiers who are still alive (home or away)
  const nextPop = Math.max(activeSoldiers + deployedSoldiers, 1, Math.min(maxCap, currentPop + births + respawned - deaths));

  return {
    births,
    deaths,
    foodUpkeep,
    famine,
    desertedSoldiers,
    civilianYield: civYield,
    newPopulation: nextPop,
    newSoldiers: activeSoldiers,
    respawned,
    plagueDeaths
  };
}

/**
 * Proportional Saturation Conversion for Civilization Swaps
 * Scales a player's population percentage smoothly into the new civilization's capacity.
 */
export function convertPopulationOnSwap(params: {
  currentPop: number;
  currentSoldiers: number;
  oldCiv: CivilizationType;
  oldLevel: number;
  newCiv: CivilizationType;
  newLevel: number;
  isCombatDefeat?: boolean;
}): { newPopulation: number; newSoldiers: number } {
  const { currentPop, currentSoldiers, oldCiv, oldLevel, newCiv, newLevel, isCombatDefeat = false } = params;

  const oldMaxCap = calculateMaxPopulation(oldLevel, oldCiv);
  const newMaxCap = calculateMaxPopulation(newLevel, newCiv);

  // Saturation percentage
  let saturation = Math.min(1, Math.max(0.05, currentPop / oldMaxCap));

  // A defender cast out of Nethergarde loses part of its people in the siege
  if (isCombatDefeat) {
    saturation *= SWAP_DEFEAT_SURVIVAL;
  }

  const newPop = Math.min(newMaxCap, Math.max(5, Math.floor(saturation * newMaxCap)));
  // Retain roughly the same proportion of military mobilization
  const soldierRatio = currentPop > 0 ? currentSoldiers / currentPop : 0;
  const newSoldiers = Math.min(newPop, Math.floor(newPop * soldierRatio));

  return {
    newPopulation: newPop,
    newSoldiers
  };
}

/** A civ's soldier after its buffs and debuffs (CIV_MODIFIERS): matchup ones only against `opponent`, role ones only in that `role` */
export function effectiveUnit(
  civ: CivilizationType,
  opponent?: CivilizationType,
  role?: "attacking" | "defending",
  titleBuffs?: TitleBuffs
): { hp: number; atk: number; def: number } {
  const unit = (CIV_DEMOGRAPHICS[civ] || CIV_DEMOGRAPHICS.human).soldierUnit;
  const mods = (CIV_MODIFIERS[civ] ?? []).filter((m) => (!m.vs || (opponent !== undefined && m.vs.includes(opponent))) && (!m.when || m.when === role));
  // Milestone titles multiply on top of the civ buffs/debuffs (GAME_GUIDE §13 → Milestone Titles)
  const title = { hp: titleBuffs?.hpBonus ?? 0, atk: titleBuffs?.atkBonus ?? 0, def: titleBuffs?.defBonus ?? 0 };
  const scaled = (base: number, key: "hp" | "atk" | "def") => base * Math.max(MIN_STAT_SHARE, 1 + mods.reduce((sum, m) => sum + (m[key] ?? 0), 0)) * (1 + title[key]);
  return { hp: scaled(unit.hp, "hp"), atk: scaled(unit.atk, "atk"), def: scaled(unit.def, "def") };
}

