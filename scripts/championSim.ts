/**
 * 🦸 Champions on the live engine (combat.stepBattleRound), for `npm run sim:balance`: a champion's worth (the march it
 * leads against the same march without it, the mercenaries' yardstick in mercSim.ts) and the strongest kit a champion
 * can roll for a civilization (found slot by slot, every pairing of the slot's pool tried against the rest).
 */
import { LiveAttackerStack } from "../server/src/combat";
import { CHAMPION_ARTS, CHAMPION_ART_SHARE, CHAMPION_FINALES, CHAMPION_INSTINCTS, CHAMPION_MAX_LEVEL, ChampionArts, championKit, championStats } from "../server/src/championRules";
import type { CivilizationType } from "../server/src/types";
import { armyRatio, plainStack } from "./mercSim";

/** The champion's fields on a stack: its kit at `level`, its art share and its stat shares */
export function championFields(level: number, arts: ChampionArts, share = 1, name = "Champion"): Partial<LiveAttackerStack> {
  const st = championStats(level);
  return { kit: championKit(name, arts, level), artShare: CHAMPION_ART_SHARE * share, champion: { id: "c", userId: "x", name, level, hp: st.hp * share, atk: st.atk * share, def: st.def * share } };
}

/** A march of `count` led by a champion of `level` with `arts` */
export const championStack = (civ: CivilizationType, count: number, level: number, arts: ChampionArts): LiveAttackerStack => ({ ...plainStack(civ, count), ...championFields(level, arts) });

/** A champion's worth: its march of `cap` soldiers against the same march without it (1 = no better) */
export const championPower = (civ: CivilizationType, cap: number, level: number, arts: ChampionArts) =>
  armyRatio(civ, () => [championStack(civ, cap, level, arts)], () => [plainStack(civ, cap)]);

const pairs = (pool: readonly string[]): Array<[string, string]> => pool.flatMap((a, i) => pool.slice(i + 1).map((b) => [a, b] as [string, string]));

/**
 * The strongest kit a champion of `civ` can roll at max level: each slot's best choice with the others held at the best
 * found so far, two passes (the pools are small and the Arts each sit on one power budget, so this lands on the top)
 */
export function strongestKit(civ: CivilizationType, cap: number): { arts: ChampionArts; power: number } {
  let best: ChampionArts = { instincts: [CHAMPION_INSTINCTS[0], CHAMPION_INSTINCTS[1]], arts: [CHAMPION_ARTS[0], CHAMPION_ARTS[1]], finale: CHAMPION_FINALES[0] };
  let power = championPower(civ, cap, CHAMPION_MAX_LEVEL, best);
  const tryAll = (variants: ChampionArts[]) => {
    for (const v of variants) {
      const p = championPower(civ, cap, CHAMPION_MAX_LEVEL, v);
      if (p > power) {
        power = p;
        best = v;
      }
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    tryAll(pairs(CHAMPION_INSTINCTS).map((instincts) => ({ ...best, instincts })));
    tryAll(pairs(CHAMPION_ARTS).map((arts) => ({ ...best, arts })));
    tryAll(CHAMPION_FINALES.map((finale) => ({ ...best, finale })));
  }
  return { arts: best, power };
}
