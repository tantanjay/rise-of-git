/**
 * npm run sim:scouting
 *
 * Odds of Spies & Counterspies (warConfig.SCOUT_ODDS, GAME_GUIDE §13) as tables: true report / caught / deceived for a
 * party of 1 and of 5 scouts, by the scouting ruler's Lantern Streets + Spymaster's Tower tiers against the target's
 * Spymaster's Tower tier, for a human scout and an elf scout, then the same behind a full frontier gate. Fails if a
 * success chance leaves MIN_SUCCESS–MAX_SUCCESS or the odds don't add up to 1. No combat effect, so sim:balance
 * doesn't change.
 */
import { GATE, SCOUT_ODDS, scoutOdds } from "../server/src/warConfig";
import type { CivilizationType } from "../server/src/types";

const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);
let failed = false;

function table(title: string, civ: CivilizationType, scouts: number, gateCatch: number) {
  console.log(`\n${title}`);
  console.log(`  own lanterns+spy / their spy  ${[0, 1, 2, 3, 4, 5].map((t) => `T${t}`.padStart(16)).join("")}`);
  for (const own of [0, 1, 3, 5]) {
    const cells = [0, 1, 2, 3, 4, 5].map((their) => {
      const o = scoutOdds({ scouts, attackerCiv: civ, attackerLanterns: own, attackerSpymaster: own, defenderSpymaster: their, gateCatch });
      const sum = Math.round((o.success + o.caught + o.deceived) * 1000) / 1000;
      if (o.success < SCOUT_ODDS.MIN_SUCCESS - 1e-9 || o.success > SCOUT_ODDS.MAX_SUCCESS + 1e-9 || sum !== 1 || o.caught < 0 || o.deceived < 0) failed = true;
      return `${pct(o.success)}/${pct(o.caught)}/${pct(o.deceived)}`.padStart(16);
    });
    console.log(`  T${own} + T${own}`.padEnd(30) + cells.join(""));
  }
}

console.log("Spies & Counterspies — cells are ✅ true report / 💀 caught / 🎭 deceived");
for (const civ of ["human", "elf"] as CivilizationType[]) {
  table(`${civ}, 1 scout`, civ, 1, 0);
  table(`${civ}, 5 scouts`, civ, 5, 0);
}
table(`human, 5 scouts, city behind a full frontier gate (+${pct(GATE.SCOUT_CATCH_MAX).trim()} catch)`, "human", 5, GATE.SCOUT_CATCH_MAX);

if (failed) {
  console.error("\n✗ Some odds fall outside the clamp or don't add up to 100%");
  process.exit(1);
}
console.log(`\n✓ Success always within ${pct(SCOUT_ODDS.MIN_SUCCESS).trim()}–${pct(SCOUT_ODDS.MAX_SUCCESS).trim()}`);
