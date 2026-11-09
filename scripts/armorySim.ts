/**
 * 🗡️ The Armory on the live engine (combat.stepBattleRound), for `npm run sim:balance`: a set's power (a march wearing it
 * against the same march in standard gear, the mercenaries' yardstick in mercSim.ts) and the scale on a set's gains that
 * puts it on its rarity's power.
 */
import { ARMORY_RULES, ARMORY_SETS, ArmoryRarity, gearOf } from "../server/src/armoryRules";
import type { CivilizationType } from "../server/src/types";
import { armyRatio, soldierMarches } from "./mercSim";

/** `n` soldier marches of `each`, wearing `rarity` (or standard gear) */
export const armedMarches = (civ: CivilizationType, n: number, each: number, rarity: ArmoryRarity | null) =>
  soldierMarches(civ, n, each).map((s) => (rarity ? { ...s, gear: gearOf(civ, rarity), armory: { rarity, name: "", emblem: "" } } : s));

/** A set's power: one march of `cap` soldiers in it against the same march in standard gear (1 = no better) */
export const setPower = (civ: CivilizationType, rarity: ArmoryRarity, cap: number) => armyRatio(civ, () => armedMarches(civ, 1, cap, rarity), () => armedMarches(civ, 1, cap, null));

/** Every gain of a set × k, in this process only (the calibration tries scales) */
function scaled<T>(civ: CivilizationType, rarity: ArmoryRarity, k: number, run: () => T): T {
  const s = ARMORY_SETS[civ][rarity];
  const keep = { ...s, edge: s.edge ? { ...s.edge } : undefined };
  s.hp *= k;
  s.atk *= k;
  s.def *= k;
  if (s.edge) {
    const e = s.edge;
    if (e.pierce) e.pierce *= k;
    if (e.outnumber) e.outnumber *= k;
    for (const key of ["taken", "firstAtk", "firstTaken"] as const) if (e[key]) e[key] = 1 + (e[key]! - 1) * k;
  }
  try {
    return run();
  } finally {
    Object.assign(s, keep);
    if (!keep.edge) delete s.edge;
  }
}

/** The scale on a set's gains that puts it on its rarity's power (a few secant steps) */
export function calibrateSet(civ: CivilizationType, rarity: ArmoryRarity, cap: number): number {
  const target = ARMORY_RULES[rarity].power - 1;
  let k = 1;
  for (let i = 0; i < 4; i++) {
    const p = scaled(civ, rarity, k, () => setPower(civ, rarity, cap)) - 1;
    if (p <= 0) return k;
    k *= target / p;
  }
  return Math.round(k * 100) / 100;
}
