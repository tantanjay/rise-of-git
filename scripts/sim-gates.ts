/**
 * npm run sim:gates
 *
 * Balance check for the four frontier gates: a lone City Hall 15 ruler of every civilization, every march slot
 * filled (3 at Lv15, capped by the soldier cap), no buffs, against each gate's bare base garrison (no
 * reinforcements) behind its walls. Prints the win rate and losses of the first assault, then how many follow-up
 * waves (unguarded walls, 5 minutes apart while they repair) it takes to set the gate burning. Then the same
 * against a gate filled to its reinforce cap, alone and in a rally (RALLY_RULERS × City Hall RALLY_LEVEL, env vars).
 * Targets (warConfig.GATE): every civ's Lv15 wins the first assault against every bare gate; a rally of 5 City Hall 20
 * rulers of any civ breaks every full gate. The garrison fights with its civilization's rare Battle Arts kit (paid for out of
 * its soldiers' HP and ATK, warConfig `kitTrimFor`); the first assault is also fought without it, as before kits.
 */
import { seededRandom, stepBattleRound, LiveAttackerStack, LiveDefenderState, totalDefenders } from "../server/src/combat";
import { calculateMaxPopulation } from "../server/src/demographics";
import { effectiveUnit } from "../server/src/demographics";
import { COMBAT, GATE, kitTrimFor, npcKingdomKitFor, wallDefMultForTier, WALL_BURN_THRESHOLD, WALL_DMG_PER_ATTACKER, WALL_DMG_PER_DEFENDER_KILLED, WALL_REPAIR_FULL_MS, gateBaseGarrison, gateReinforceCap, marchCapacityFor, marchSlotsForLevel, maxSoldiersFor } from "../server/src/warConfig";
import type { CivilizationType } from "../server/src/types";

const SEEDS = 30;
const LEVEL = Number(process.argv[2] ?? 15);
const CIVS: CivilizationType[] = ["human", "orc", "dwarf", "elf"];
const WAVE_GAP_MS = 5 * 60_000;
/** A rally against a full gate: this many rulers at this City Hall, every march slot each (no +ATK rally bonus counted) */
const RALLY_RULERS = Number(process.env.RALLY_RULERS ?? 5);
const RALLY_LEVEL = Number(process.env.RALLY_LEVEL ?? 20);

function allSlots(civ: CivilizationType, level: number): number[] {
  const maxPop = calculateMaxPopulation(level, civ);
  const slots = marchSlotsForLevel(level);
  const total = Math.min(slots * marchCapacityFor(maxPop, civ), maxSoldiersFor(maxPop, civ));
  return Array(slots).fill(Math.floor(total / slots)).filter((n) => n > 0);
}

function assault(att: CivilizationType, gate: CivilizationType, garrison: number, seed: number, rulers = 1, level = LEVEL, kitless = false) {
  const armies = Array.from({ length: rulers }, () => allSlots(att, level)).flat();
  // A gate is rare: its civilization's rare kit, paid for out of its soldiers' HP and ATK
  const kit = kitless ? undefined : npcKingdomKitFor(gate, "rare", "Gate garrison");
  const kitTrim = kit ? kitTrimFor(effectiveUnit(gate, att, "defending").def * wallDefMultForTier(GATE.WALL_TIER), kit) : undefined;
  const def: LiveDefenderState = { civ: gate, count: garrison, initialCount: garrison, fortified: true, wallTier: GATE.WALL_TIER, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0, kit, kitTrim };
  const stacks: LiveAttackerStack[] = armies.map((c, i) => ({ marchId: `a${i}`, attackerId: "x", attackerName: "x", civ: att, count: c, initialCount: c, joinedRound: 1, roundsFought: 0, carryDamageTaken: 0, totalDamageDealt: 0, totalLosses: 0 }));
  const rng = seededRandom(`${att}-${gate}-${garrison}-${seed}`);
  let wallDmg = 0;
  for (let r = 1; r <= COMBAT.MAX_ROUNDS && totalDefenders(def) > 0 && stacks.some((s) => s.count > 0); r++) {
    wallDmg += stepBattleRound(r, stacks.filter((s) => s.count > 0), def, rng).wallDamage;
  }
  const sent = armies.reduce((a, b) => a + b, 0);
  const left = stacks.reduce((a, s) => a + s.count, 0);
  const won = def.count <= 0 && left > 0;
  if (won) wallDmg += left * WALL_DMG_PER_ATTACKER;
  return { won, lossPct: (1 - left / sent) * 100, wallDmg, sent, left };
}

/** Follow-up waves of the whole army against the unguarded walls until they burn */
function wavesToBurn(att: CivilizationType, firstDmg: number, survivors: number): number {
  const max = GATE.WALL_HP;
  const burnAt = WALL_BURN_THRESHOLD * max;
  const repair = (max / WALL_REPAIR_FULL_MS) * WAVE_GAP_MS;
  const sent = allSlots(att, LEVEL).reduce((a, b) => a + b, 0);
  let hp = max - firstDmg;
  if (hp <= burnAt) return 0;
  // Next waves: the survivors of the first assault plus the soldiers left at home is roughly the whole army again
  void survivors;
  for (let n = 1; n <= 50; n++) {
    hp = Math.min(max, hp + repair) - sent * WALL_DMG_PER_ATTACKER;
    if (hp <= burnAt) return n;
  }
  return Infinity;
}

const wallMax = GATE.WALL_HP;
console.log(`Frontier gates: City Hall ${GATE.LEVEL}, walls tier ${GATE.WALL_TIER} (${wallMax.toLocaleString()} HP, burns below ${Math.round(WALL_BURN_THRESHOLD * 100)}%); attacker City Hall ${LEVEL}, every march slot, no buffs\n`);
console.log("Lv" + LEVEL + " sends: " + CIVS.map((c) => `${c} ${allSlots(c, LEVEL).join("+")}`).join(" · ") + "\n");
for (const gate of CIVS) {
  const base = gateBaseGarrison(gate);
  console.log(`${gate.toUpperCase()} gate — base garrison ${base}, reinforce cap ${gateReinforceCap(gate)}`);
  for (const att of CIVS) {
    if (att === gate) continue;
    const runs = Array.from({ length: SEEDS }, (_, s) => assault(att, gate, base, s));
    const plain = Array.from({ length: SEEDS }, (_, s) => assault(att, gate, base, s, 1, LEVEL, true));
    const plainWins = plain.filter((r) => r.won);
    const plainLoss = plainWins.length ? plainWins.reduce((a, r) => a + r.lossPct, 0) / plainWins.length : 100;
    const wins = runs.filter((r) => r.won);
    const winPct = (wins.length / SEEDS) * 100;
    const loss = wins.length ? wins.reduce((a, r) => a + r.lossPct, 0) / wins.length : 100;
    const dmg = wins.length ? wins.reduce((a, r) => a + r.wallDmg, 0) / wins.length : 0;
    const waves = wins.length ? wavesToBurn(att, dmg, 0) : Infinity;
    const full = Array.from({ length: 10 }, (_, s) => assault(att, gate, gateReinforceCap(gate), s)).filter((r) => r.won).length * 10;
    // A full gate held by its own civ's soldiers (the reinforcements fight like the garrison here; titles left out)
    const rally = Array.from({ length: 10 }, (_, s) => assault(att, gate, gateReinforceCap(gate), s, RALLY_RULERS, RALLY_LEVEL)).filter((r) => r.won).length * 10;
    console.log(`  ${att.padEnd(6)} win ${winPct.toFixed(0).padStart(3)}%  losses ${loss.toFixed(0).padStart(3)}%  wall dmg ${Math.round(dmg).toLocaleString().padStart(6)}  (before kits ${((plainWins.length / SEEDS) * 100).toFixed(0)}% / ${plainLoss.toFixed(0)}%)  +${Number.isFinite(waves) ? waves : "∞"} waves to burn  · vs full gate: solo ${full}%, rally of ${RALLY_RULERS}× Lv${RALLY_LEVEL} ${rally}%`);
  }
}
void WALL_DMG_PER_DEFENDER_KILLED;
