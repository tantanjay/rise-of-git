/**
 * npm run sim:war
 *
 * Balance check for the Nethergarde NPC void kingdoms: how many assaults it takes a developer of a
 * given City Hall level to break one garrison. Each assault is a live battle (combat.stepBattleRound,
 * up to COMBAT.MAX_ROUNDS rounds) in which the attacker fills every march slot (capacity per march,
 * capped by the soldier cap) against the garrison behind its walls (VOID_NPC.WALL_TIER). The army is
 * rebuilt between assaults and the garrison does not regenerate (assaults closer together than
 * VOID_NPC.REGEN_PAUSE_MS). Averaged over SEEDS sieges.
 * Target (warConfig.VOID_NPC): a City Hall 10 developer needs about 2-6 assaults; three assaults of 800 Footmen break one.
 */
import { seededRandom, stepBattleRound, LiveAttackerStack, LiveDefenderState, totalDefenders } from "../server/src/combat";
import { calculateMaxPopulation } from "../server/src/demographics";
import { COMBAT, VOID_NPC, marchCapacityFor, marchSlotsForLevel, maxSoldiersFor } from "../server/src/warConfig";
import type { CivilizationType } from "../server/src/types";

const SEEDS = 20;
const MAX_ASSAULTS = 500;
const LEVELS = [3, 5, 8, 10, 12, 15, 20];
const CIVS: CivilizationType[] = ["human", "orc", "dwarf", "elf"];

const garrisonMax = Math.round(calculateMaxPopulation(VOID_NPC.CITY_HALL_LEVEL, "arcane") * VOID_NPC.GARRISON_SHARE);

/** Every march slot filled, capped by the soldier cap */
function allSlots(civ: CivilizationType, level: number): number[] {
  const maxPop = calculateMaxPopulation(level, civ);
  const slots = marchSlotsForLevel(level);
  const total = Math.min(slots * marchCapacityFor(maxPop, civ), maxSoldiersFor(maxPop, civ));
  return Array(slots).fill(Math.floor(total / slots)).filter((n) => n > 0);
}

function assaultsToBreak(civ: CivilizationType, level: number, seed: number): number {
  const armies = allSlots(civ, level);
  let garrison = garrisonMax;
  for (let n = 1; n <= MAX_ASSAULTS; n++) {
    const def: LiveDefenderState = { civ: "arcane", count: garrison, initialCount: garrison, fortified: true, wallTier: VOID_NPC.WALL_TIER, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0 };
    const stacks: LiveAttackerStack[] = armies.map((c, i) => ({ marchId: `a${i}`, attackerId: "x", attackerName: "x", civ, count: c, initialCount: c, joinedRound: 1, roundsFought: 0, carryDamageTaken: 0, totalDamageDealt: 0, totalLosses: 0 }));
    const rng = seededRandom(`${civ}-${level}-${seed}-${n}`);
    for (let r = 1; r <= COMBAT.MAX_ROUNDS && totalDefenders(def) > 0 && stacks.some((s) => s.count > 0); r++) stepBattleRound(r, stacks.filter((s) => s.count > 0), def, rng);
    garrison = def.count;
    if (garrison <= 0) return n;
  }
  return Infinity;
}

console.log(`NPC void kingdom: City Hall ${VOID_NPC.CITY_HALL_LEVEL}, garrison ${garrisonMax} Void Weavers, walls tier ${VOID_NPC.WALL_TIER}; attacker fills every march slot\n`);
console.log(["City Hall", ...CIVS.map((c) => c.padStart(8))].join("  "));
for (const level of LEVELS) {
  const cells = CIVS.map((civ) => {
    const runs = Array.from({ length: SEEDS }, (_, s) => assaultsToBreak(civ, level, s));
    const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
    return (Number.isFinite(avg) ? avg.toFixed(1) : `>${MAX_ASSAULTS}`).padStart(8);
  });
  console.log([String(level).padStart(9), ...cells].join("  "));
}
