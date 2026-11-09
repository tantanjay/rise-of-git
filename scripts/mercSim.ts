/**
 * Mercenary bands on the live engine (combat.stepBattleRound), for `npm run sim:balance`: a band's power as a share of
 * its hirer's full march of soldiers, Arts included, and the count multiplier (mercenaryRules BAND_COUNT_MULT) that puts
 * each band on its rarity's power.
 *
 * Power: a band (its hirer's soldiers, `cap × mult` of them, with its kit) and a plain march of the same soldiers
 * (march capacity, civ traits, no titles either) each fight the same
 * opponents for COMBAT.MAX_ROUNDS rounds on the same seeds; power = √(damage dealt ratio × share-lost ratio), the
 * geometric mean of how hard it hits and how long it lasts (a plain march k× as big scores ≈ k).
 */
import { COMBAT } from "../server/src/warConfig";
import { effectiveUnit } from "../server/src/demographics";
import { DefenderGroup, LiveAttackerStack, LiveDefenderState, seededRandom, stepBattleRound } from "../server/src/combat";
import { BAND_COUNT_MULT, MERC_RULES, MercRarity, mercKitFor } from "../server/src/mercenaryRules";
import type { CivilizationType } from "../server/src/types";

export const MERC_SEEDS = 24;

/**
 * The opponents: a mirror of the hirer's own soldier (HP × STURDY.hp, ATK × STURDY.atk), behind tier-2 walls and in the
 * open. Fair to every civilization (no matchup buffs), and sturdy so every fight goes the distance: never wiped (which
 * would cap the damage a strong band can deal), never wiping the march (which would hide its losses)
 */
const STURDY = { hp: 6, atk: 0.12 };
const mirror = (civ: CivilizationType, count: number, fortified: boolean): LiveDefenderState => {
  const u = effectiveUnit(civ, undefined, "defending");
  return { civ, count, initialCount: count, fortified, wallTier: fortified ? 2 : undefined, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0, unit: { hp: u.hp * STURDY.hp, atk: u.atk * STURDY.atk, def: u.def } };
};
const OPPONENTS: Array<{ name: string; make: (civ: CivilizationType, cap: number) => LiveDefenderState }> = [
  { name: "walled garrison", make: (civ, cap) => mirror(civ, Math.round(cap * 1.5), true) },
  { name: "army in the open", make: (civ, cap) => mirror(civ, Math.round(cap * 1.5), false) }
];

interface Fight {
  dealt: number;
  lostShare: number;
}

function fight(stack: LiveAttackerStack, def: LiveDefenderState, seed: string): Fight {
  const rng = seededRandom(seed);
  let dealt = 0;
  for (let round = 1; round <= COMBAT.MAX_ROUNDS && stack.count > 0 && def.count > 0; round++) {
    dealt += stepBattleRound(round, [stack], def, rng, null, seed).roundSummary.attackerDamage;
  }
  return { dealt, lostShare: Math.max(1e-3, 1 - stack.count / stack.initialCount) };
}

const base = (civ: CivilizationType, count: number): LiveAttackerStack => ({
  marchId: "m",
  attackerId: "x",
  attackerName: "x",
  civ,
  count,
  initialCount: count,
  joinedRound: 1,
  roundsFought: 0,
  carryDamageTaken: 0,
  totalDamageDealt: 0,
  totalLosses: 0
});

/** A plain march of `count` of the civ's own soldiers */
export const plainStack = (civ: CivilizationType, count: number) => base(civ, count);

/** A band at full strength fielding `cap × mult` soldier-equivalents (mult defaults to BAND_COUNT_MULT) */
export function bandStack(civ: CivilizationType, rarity: MercRarity, cap: number, mult = BAND_COUNT_MULT[civ][rarity]): LiveAttackerStack {
  const n = Math.max(MERC_RULES[rarity].models, Math.round(cap * mult));
  return { ...base(civ, n), kit: mercKitFor(civ, rarity), band: { id: `band-${rarity}`, fullCount: n, rarity, emblem: "" } };
}

/** A band's power (× its hirer's full march) against the opponent panel */
export function bandPower(civ: CivilizationType, rarity: MercRarity, cap: number, mult?: number): { power: number; byOpponent: Record<string, number>; plainLost: Record<string, number>; oppLost: Record<string, number> } {
  const plainLost: Record<string, number> = {};
  const oppLost: Record<string, number> = {};
  let logSum = 0;
  let n = 0;
  const byOpponent: Record<string, number> = {};
  for (const opp of OPPONENTS) {
    let oppLog = 0;
    for (let s = 0; s < MERC_SEEDS; s++) {
      const seed = `merc-${civ}-${rarity}-${opp.name}-${s}`;
      const oppDef = opp.make(civ, cap);
      const plain = fight(plainStack(civ, cap), oppDef, seed);
      plainLost[opp.name] = (plainLost[opp.name] ?? 0) + plain.lostShare / MERC_SEEDS;
      oppLost[opp.name] = (oppLost[opp.name] ?? 0) + (1 - oppDef.count / oppDef.initialCount) / MERC_SEEDS;
      const band = fight(bandStack(civ, rarity, cap, mult), opp.make(civ, cap), seed);
      const l = 0.5 * (Math.log(band.dealt / Math.max(1, plain.dealt)) + Math.log(plain.lostShare / band.lostShare));
      oppLog += l;
      logSum += l;
      n++;
    }
    byOpponent[opp.name] = Math.exp(oppLog / MERC_SEEDS);
  }
  return { power: Math.exp(logSum / n), byOpponent, plainLost, oppLost };
}

/** The count multiplier that puts a band on its rarity's power (a few fixed-point steps; power grows about linearly with count) */
export function calibrateBand(civ: CivilizationType, rarity: MercRarity, cap: number): number {
  const target = MERC_RULES[rarity].power;
  let m = BAND_COUNT_MULT[civ][rarity];
  for (let i = 0; i < 4; i++) m = m * (target / bandPower(civ, rarity, cap, m).power);
  return Math.round(m * 1000) / 1000;
}

/* ------------------------------------------------------------------------- */
/* A ruler's whole army: bands beside soldier marches                        */
/* ------------------------------------------------------------------------- */

/** Every stack of an army fighting one battle together (COMBAT.MAX_ROUNDS rounds); mutates `def`. Bands land `bandShare` more of their blows (a world boss: the Sellsword's Oath) */
export function fightArmy(stacks: LiveAttackerStack[], def: LiveDefenderState, seed: string, damageMult = 1, bandShare = 1): Fight {
  const rng = seededRandom(seed);
  for (const s of stacks) s.damageMult = damageMult * (s.band ? bandShare : 1);
  let dealt = 0;
  for (let round = 1; round <= COMBAT.MAX_ROUNDS; round++) {
    const live = stacks.filter((s) => s.count > 0);
    if (!live.length || def.count <= 0) break;
    dealt += stepBattleRound(round, live, def, rng, null, seed).roundSummary.attackerDamage;
  }
  const initial = stacks.reduce((a, s) => a + s.initialCount, 0);
  const left = stacks.reduce((a, s) => a + s.count, 0);
  return { dealt, lostShare: Math.max(1e-3, 1 - left / Math.max(1, initial)) };
}

/** A whole army's power against another army of the same civilization (both against the sturdy panel, sized to the second) */
export function armyRatio(civ: CivilizationType, make: () => LiveAttackerStack[], against: () => LiveAttackerStack[]): number {
  const size = against().reduce((a, s) => a + s.count, 0);
  let logSum = 0;
  let n = 0;
  for (const opp of OPPONENTS) {
    for (let s = 0; s < MERC_SEEDS; s++) {
      const seed = `army-${civ}-${opp.name}-${s}`;
      const ref = fightArmy(against(), opp.make(civ, size), seed);
      const mine = fightArmy(make(), opp.make(civ, size), seed);
      logSum += 0.5 * (Math.log(mine.dealt / Math.max(1, ref.dealt)) + Math.log(ref.lostShare / mine.lostShare));
      n++;
    }
  }
  return Math.exp(logSum / n);
}

/** Soldier marches of `each` soldiers, `n` of them */
export const soldierMarches = (civ: CivilizationType, n: number, each: number) => Array.from({ length: n }, (_, i) => ({ ...plainStack(civ, each), marchId: `s${i}` }));

/* ------------------------------------------------------------------------- */
/* A band on its hirer's walls                                               */
/* ------------------------------------------------------------------------- */

/** One defender group on tier-2 walls (no home garrison beside it) */
const onTheWalls = (civ: CivilizationType, group: DefenderGroup): LiveDefenderState => ({
  civ,
  count: 0,
  initialCount: 0,
  fortified: true,
  wallTier: 2,
  roundsFought: 0,
  carryDamageTaken: 0,
  totalLosses: 0,
  reinforcements: [group]
});
const wallGroup = (civ: CivilizationType, count: number, extra: Partial<DefenderGroup> = {}): DefenderGroup => ({
  marchId: "g",
  ownerId: "x",
  ownerName: "x",
  civ,
  count,
  initialCount: count,
  roundsFought: 0,
  carryDamageTaken: 0,
  totalLosses: 0,
  ...extra
});
/** The attacker storming the walls: 1.5 full marches of the hirer's sturdy mirror */
const stormers = (civ: CivilizationType, cap: number): LiveAttackerStack => {
  const u = effectiveUnit(civ, undefined, "attacking");
  return { ...base(civ, Math.round(cap * 1.5)), unit: { hp: u.hp * STURDY.hp, atk: u.atk * STURDY.atk, def: u.def } };
};
function holdWalls(civ: CivilizationType, group: DefenderGroup, cap: number, seed: string): Fight {
  const rng = seededRandom(seed);
  const def = onTheWalls(civ, group);
  const att = stormers(civ, cap);
  let dealt = 0;
  for (let round = 1; round <= COMBAT.MAX_ROUNDS && att.count > 0 && group.count > 0; round++) {
    dealt += stepBattleRound(round, [att], def, rng, null, seed).roundSummary.defenderDamage;
  }
  return { dealt, lostShare: Math.max(1e-3, 1 - group.count / group.initialCount) };
}

/**
 * 🪙 A band's power on its hirer's walls (× the same full march of soldiers on the same walls), Arts included: what a
 * defending band adds to a castle, measured like its power in the field
 */
export function wallPower(civ: CivilizationType, rarity: MercRarity, cap: number): number {
  const n = Math.max(MERC_RULES[rarity].models, Math.round(cap * BAND_COUNT_MULT[civ][rarity]));
  let logSum = 0;
  for (let s = 0; s < MERC_SEEDS; s++) {
    const seed = `walls-${civ}-${rarity}-${s}`;
    const plain = holdWalls(civ, wallGroup(civ, cap), cap, seed);
    const band = holdWalls(civ, wallGroup(civ, n, { kit: mercKitFor(civ, rarity), band: { id: "b", fullCount: n, rarity, emblem: "" } }), cap, seed);
    logSum += 0.5 * (Math.log(band.dealt / Math.max(1, plain.dealt)) + Math.log(plain.lostShare / band.lostShare));
  }
  return Math.exp(logSum / MERC_SEEDS);
}
