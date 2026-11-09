import { ARMORY_RARITIES, ARMORY_RULES, type ArmoryRarity } from "./armoryRules.js";
import { CHAMPION_MAX_GAIN, CHAMPION_MAX_LEVEL } from "./championRules.js";
import { BAND_COUNT_MULT, MERC_RULES, type MercRarity } from "./mercenaryRules.js";
import type { CivilizationType } from "./types.js";

/**
 * ⚔️ The Muster (GAME_GUIDE §13 *Launching marches: the Muster*): the pure rules, no database. A ruler musters several
 * marches on one target at once (their mercenary bands and boxes of soldiers, each with a loadout and maybe the champion);
 * they set off together, move at the slowest one's pace and reach the target in the same moment, so all of them fight
 * from round 1. The stacks stand in the battle strongest first (by `power`), so the defenders strike the strongest
 * first (a ruler's own soldiers still stand before any band, as always).
 *
 * Power is counted in the ruler's own soldier-equivalents: a box is its soldiers × its set's power × the champion's
 * worth when it leads; a band is the full march it was hired for × its rarity's power × its strength. Client copy:
 * src/utils/muster.ts (`npm run sim:balance` checks the two match).
 */

/** The split chips: each soldier box carries this share of a full march (the ruler's march capacity) */
export const MUSTER_SPLITS = [0.1, 0.25, 0.5, 1] as const;

/**
 * The soldier boxes a split makes: as many boxes of `split` × `capacity` soldiers as the free march slots and the
 * soldiers at home allow, then one smaller box of whoever is left over while a free slot remains
 */
export function musterBoxes(split: number, home: number, capacity: number, freeSlots: number): number[] {
  const size = Math.max(1, Math.floor(Math.max(1, capacity) * split));
  if (home <= 0 || freeSlots <= 0) return [];
  const full = Math.min(freeSlots, Math.floor(home / size));
  const leftover = home - full * size;
  const boxes = Array.from({ length: full }, () => size);
  return full < freeSlots && leftover > 0 ? [...boxes, leftover] : boxes;
}

/** What one soldier is worth in a set, as a share of one in standard gear (the set rarity's power) */
export const setPowerOf = (loadout: string | null | undefined): number => (loadout && ARMORY_RARITIES.includes(loadout as ArmoryRarity) ? ARMORY_RULES[loadout as ArmoryRarity].power : 1);

/** Every loadout's power (standard and each set), for the muster window */
export const setPowers = (): Record<"standard" | ArmoryRarity, number> =>
  ({ standard: 1, ...Object.fromEntries(ARMORY_RARITIES.map((r) => [r, ARMORY_RULES[r].power])) }) as Record<"standard" | ArmoryRarity, number>;

/** About what a champion of `level` makes the march it leads worth, as a share of the same march without it (a max-level one: 1 + CHAMPION_MAX_GAIN) */
export const championPowerAt = (level: number): number => Math.round((1 + (CHAMPION_MAX_GAIN * Math.max(1, Math.min(CHAMPION_MAX_LEVEL, level))) / CHAMPION_MAX_LEVEL) * 1000) / 1000;

/** A soldier box's power: soldiers × set × champion */
export const boxPower = (soldiers: number, loadout: string | null | undefined, championPower: number | null) => Math.round(Math.max(0, soldiers) * setPowerOf(loadout) * (championPower ?? 1));

/** A band's power: the full march it was hired for × its rarity's power × its strength */
export function bandPower(b: { fullCount: number; rarity: MercRarity; civ: CivilizationType; strength: number }): number {
  const fullMarch = b.fullCount / Math.max(1e-9, BAND_COUNT_MULT[b.civ]?.[b.rarity] ?? 1);
  return Math.round(fullMarch * MERC_RULES[b.rarity].power * Math.max(0, Math.min(1, b.strength)));
}

/** The muster's order: strongest first (ties keep the order they were picked in) */
export function strongestFirst<T extends { power: number }>(list: T[]): T[] {
  return list
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.power - a.m.power || a.i - b.i)
    .map((x) => x.m);
}
