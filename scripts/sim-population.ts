/**
 * npm run sim:population
 *
 * Demographic check (GAME_GUIDE §13 Population): how each civilization grows from its genesis population, and how
 * fast it recovers when a war leaves only 50 survivors (orcs rebuild fastest, elves barely move). No soldiers, plenty of food, 15-minute harvests.
 */
import { simulateDemographicCycle, calculateMaxPopulation, calculateGenesisPopulation } from "../server/src/demographics";
import type { CivilizationType } from "../server/src/types";

const LEVEL = 10;
const SURVIVORS = 50;
const CIVS: CivilizationType[] = ["human", "orc", "dwarf", "elf", "arcane"];
const MARKS: Array<[string, number]> = [["1h", 4], ["2h", 8], ["4h", 16], ["6h", 24], ["1d", 96], ["3d", 288], ["7d", 672]];

function grow(civ: CivilizationType, start: number): number[] {
  let pop = start;
  const out: number[] = [];
  for (let t = 1; t <= MARKS[MARKS.length - 1][1]; t++) {
    pop = simulateDemographicCycle({ currentPop: pop, currentSoldiers: 0, cityHallLevel: LEVEL, civilization: civ, availableFood: 1e9 }).newPopulation;
    if (MARKS.some(([, m]) => m === t)) out.push(pop);
  }
  return out;
}

const header = ["civ".padEnd(7), "max".padStart(5), "start".padStart(6), ...MARKS.map(([l]) => l.padStart(6))].join(" ");
for (const [title, startOf] of [
  [`From genesis (City Hall ${LEVEL})`, (c: CivilizationType) => calculateGenesisPopulation(LEVEL, c)],
  [`After a war: ${SURVIVORS} survivors (City Hall ${LEVEL})`, () => SURVIVORS]
] as const) {
  console.log(`\n${title}\n${header}`);
  for (const civ of CIVS) {
    const start = startOf(civ);
    console.log([civ.padEnd(7), String(calculateMaxPopulation(LEVEL, civ)).padStart(5), String(start).padStart(6), ...grow(civ, start).map((p) => String(p).padStart(6))].join(" "));
  }
}
console.log("\n(arcane doesn't breed: it grows only by summoning and its Void Well)");
