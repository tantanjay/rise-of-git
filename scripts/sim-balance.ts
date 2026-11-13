/**
 * npm run sim:balance
 *
 * One-stop balance check for the war game. It prints every civilization's base stats, traits and
 * buffs/debuffs (read live from server/src/demographics.ts and warConfig.ts), runs fair battles with
 * the real combat simulation, and ends with ⚖️ BALANCED or ⚠️ UNBALANCED (exit code 1).
 *
 * To experiment, fill in TWEAKS below and run again — nothing in the game changes. When you like the
 * result, copy the numbers into the real files (the TWEAKS comment says where each one lives).
 *
 * Checks that decide the verdict:
 * Every battle runs on the game's live engine (combat.stepBattleRound) with real armies: march capacity, march
 * slots and the soldier cap (warConfig.ts), walls by tier.
 *
 *   1. Voidrift: at MID_LEVEL every mortal civ, filling every march slot, needs TARGET_ASSAULTS to break an NPC void kingdom.
 *   2. Voidrift: elves are the fastest ("top contender" against Nethergarde, GAME_GUIDE §13 matchups).
 *   3. PvP: every matchup lands on DESIGN_CHART (GAME_GUIDE §13) in equal-City-Hall raids: the attacker fills every
 *      march slot, the defender holds DEFENDER_HOME_SHARE of its soldier cap behind tier-PVP_WALL_TIER walls.
 *   4. The client's copy of CIV_MODIFIERS (src/utils/civDemographics.ts) matches the server's.
 *   6. Rallies: the same armies breach a City Hall 25 castle with fewer losses as a rally (+5% ATK per
 *      joiner) than arriving together as a swarm, and far fewer than trickling in one per round. A rally's armies fight
 *      COMBAT.RALLY_MAX_ROUNDS rounds (8), every other battle COMBAT.MAX_ROUNDS (6).
 *   7. World bosses (their skills are Battle Arts kits, battleArts.ts): a lone City Hall 12 march takes under 20% of a
 *      boss's HP; a rally of 4 kills it in 1–6 attempts, and in no more than the same 4 marches attacking it apart.
 *   8. NPC kingdoms: higher levels take at least as many rallies of 4 City Hall 15 rulers as City Hall 10.
 *   9. Special Overseers: a full City Hall 25 rally stops winning after 2–40 Resolve stacks.
 *   5. Gathering: one City Hall 10 march working common nodes back to back hauls GATHER_SHARE of
 *      an average kingdom's harvest income per hour — generous, so young kingdoms can grind — and no civ
 *      out-gathers another by more than 2×.
 *  10. Seasons (server/src/realmTime.ts) change only harvest, births and march speed, never combat, and the client copy matches.
 *  11. World disasters (server/src/disasterRules.ts): under a Blood Moon (+30% boss HP / ATK / DEF, every round) the rally
 *      of 4 that kills each boss today still kills it, in at most twice its tries (+2); Tempest Roads never costs a march
 *      more than a fifth of its soldiers, nor more (at mobilization cost) than its round-trip rations; the schedule rolls
 *      1–3 a week, never two a day, all starting 06:00–22:00 realm time; the client copy of the rules matches.
 *  12. Mercenaries (server/src/mercenaryRules.ts): every civilization's band of every rarity lands on its power (0.9× …
 *      1.4× a full march, Arts included) within MERC_POWER_TOLERANCE at City Hall 25 and 12; a City Hall 25 ruler's
 *      soldiers fill the marches they can (soldier cap at full population, each march up to its capacity) and its two best
 *      bands take the slots left over: that army scores at most MERC_ARMY_SLACK × the same soldiers plus plain marches
 *      worth the bands' power (each band = its power × a full march of soldiers), so a band adds its power and no
 *      more; a lone City Hall 25 ruler never kills a world boss in one battle, with their bands (landing BAND_BOSS_DAMAGE
 *      of their blows) or without (orcs land CIV_BOSS_DAMAGE of theirs); the client copy and the
 *      model pools match; every kit fits.
 *  13. The Armory (server/src/armoryRules.ts): every set lands on its power; forging and upkeep cost what the same power
 *      would in soldiers; the matchup chart holds fully equipped; every PvE ceiling holds in a ruler's best set.
 *  14. Titan's Endurance and Colossus's Wrath: no battle takes more than its share of a boss; Wrath costs a lone ruler.
 *  15. Champions (server/src/championRules.ts): a max-level champion with the strongest kit it can roll lifts the march it
 *      leads at most CHAMPION_MAX_GAIN over the same march without it (City Hall 25 and 12 marches, every civilization);
 *      and every PvE ceiling still holds with a champion of the ruler's City Hall level leading their first march, in
 *      their best set, beside their bands: packs still cost their tier's army its losses, epic packs still beat a lone
 *      City Hall 5 march, free realms and full frontier gates a lone ruler can't take still hold, and no lone City Hall 25
 *      ruler kills a world boss in one battle unless their titles alone already do; the client copy matches.
 */
import { CIV_DEMOGRAPHICS, calculateMaxPopulation, effectiveUnit, estimateNaturalBirths } from "../server/src/demographics";
import { DYNAMIC_15M_TEMPLATES } from "../server/src/worldMapGenerator";
import { ARTS, FINALES, INSTINCTS, kitProblems, type UnitRarity } from "../server/src/battleArts";
import { CIV_MODIFIERS as CLIENT_MODIFIERS, PACK_GEAR as CLIENT_PACK_GEAR, REALM_CONQUEST_HOARD as CLIENT_REALM_HOARD, REALM_TREASURY_TIER_MULT as CLIENT_REALM_TREASURY_MULT } from "@/utils/civDemographics";
import { HORROR as CLIENT_HORROR, HORROR_GEM as CLIENT_HORROR_GEM, HORROR_LEVELS as CLIENT_HORROR_LEVELS } from "../src/utils/horror";
import { horrorStatsFor, HORROR, HORROR_LEVELS } from "../server/src/horrorRules";
import { HORROR_NPC_TYPE,
  COMBAT,
  COMBAT_TRAITS,
  CIV_MODIFIERS,
  VOID_NPC,
  StatModifier,
  CIV_LOAD_MULT,
  LOAD_PER_SOLDIER,
  PVE_LOAD_MULT,
  gatherRateFor,
  marchCapacityFor,
  marchSlotsForLevel,
  WALL_DMG_PER_ATTACKER,
  WALL_BURN_THRESHOLD,
  WALL_BURN_REPAIR_MS,
  WALL_UNBURN_SHARE,
  wallMaxHpFor,
  worldNpcUnitFor,
  worldNpcPackSize,
  npcKitFor,
  npcKingdomKitFor,
  kitTrimFor,
  realmRarityAt,
  GATE,
  gateReinforceCap,
  NPC_KINGDOM_KITS,
  wallDefMultForTier,
  NPC_ART_WORTH,
  NPC_OPENER_WORTH,
  NPC_GUARD_WORTH,
  NPC_ENRAGE_WORTH,
  RALLY_COORDINATION_ATK,
  BOSS_UNITS,
  BOSS_BATTLE_CAP,
  BOSS_WRATH,
  bossUnitFor,
  bossKitFor,
  vengefulBossUnit,
  bossHideMult,
  bossDamageMult,
  PACK_GEAR,
  REALM_CONQUEST_HOARD,
  BOSS_HOARD,
  REALM_TREASURY_TIER_MULT,
  CIV_BOSS_DAMAGE,
  maxSoldiersFor,
  npcWallTierFor,
  OVERSEER_GRUDGE_PER_DEFEAT,
  OVERSEER_GARRISON_SHARE
} from "../server/src/warConfig";
import { seededRandom, stepBattleRound, maxRoundsOf, LiveAttackerStack, LiveDefenderState, totalDefenders, type BattleOmen } from "../server/src/combat";
import { DISASTER_EFFECTS, DISASTER_SCHEDULE, DISASTERS, battleOmenAt, rollDisasterSchedule, setDisasterCalendar, tempestLossShare, dateKeyIn } from "../server/src/disasterRules";
import { DISASTER_EFFECTS as CLIENT_DISASTER_EFFECTS, DISASTERS as CLIENT_DISASTERS } from "@/utils/disasters";
import { MARCH, MARCH_RATION_MULT, MOBILIZATION_COST, MOONWELL, SETTLERS, hastenCostFor, woundedHealPerHarvest, woundedOf, woundedShareOf } from "../server/src/warConfig";
import type { CivilizationType, NPCRarity, TitleBuffs } from "../server/src/types";
import { SEASON_MODS } from "../server/src/realmTime";
import { SEASON_MODS as CLIENT_SEASON_MODS } from "@/utils/realmTime";
import { BAND_BOSS_DAMAGE, BATTLE_PAY, MERC_POOLS, MERC_RARITIES, MERC_RULES, HEAL_PRICE_SHARE, bandCapForSlots, battlePayFor, fullMarchFor, mercKitFor, type MercRarity } from "../server/src/mercenaryRules";
import { MERC_RULES as CLIENT_MERC_RULES, HEAL_PRICE_SHARE as CLIENT_HEAL_PRICE_SHARE, BAND_BOSS_DAMAGE as CLIENT_BAND_BOSS_DAMAGE, BATTLE_PAY as CLIENT_BATTLE_PAY, bandCapForSlots as clientBandCap, battlePayFor as clientBattlePay } from "@/utils/mercenaries";
import { MOONWELL as CLIENT_MOONWELL, hastenCostFor as clientHastenCostFor, BOSS_BATTLE_CAP as CLIENT_BOSS_BATTLE_CAP, BOSS_WRATH as CLIENT_BOSS_WRATH, CIV_BOSS_DAMAGE as CLIENT_CIV_BOSS_DAMAGE } from "@/utils/war";
import { MERCENARY_BAND_SIZE, MERCENARY_POOLS } from "@/components/3d/world/mercenaryRigs";
import { armyRatio, bandPower, bandStack, calibrateBand, fightArmy, soldierMarches, wallPower } from "./mercSim";
import { ARMORY_RARITIES, ARMORY_RULES, ARMORY_SETS, ARMORY_TARGET_SHARE, EPIC_GEM, SOLDIER_WORTH, armoryShareVs, bestSetAt, costWorth, garrisonGear, gearOf, gemWorth, setText, type ArmoryRarity } from "../server/src/armoryRules";
import { calibrateSet, setPower } from "./armorySim";
import { championFields, championPower, strongestKit } from "./championSim";
import { CHAMPION_TARGET_SHARE, championShareVs, CHAMPION_ART_SHARE, CHAMPION_MAX_GAIN, CHAMPION_MAX_LEVEL, CHAMPION_STAT_PER_LEVEL, CHAMPION_ARTS, CHAMPION_FINALES, CHAMPION_INSTINCTS, KIT_UNLOCKS, RENOWN, DAILY_RENOWN, type ChampionArts } from "../server/src/championRules";
import * as CLIENT_CHAMPION from "@/utils/champion";
import * as CLIENT_MUSTER from "@/utils/muster";
import * as MUSTER from "../server/src/musterRules";
import { ARMORY_RULES as CLIENT_ARMORY_RULES, ARMORY_SETS as CLIENT_ARMORY_SETS, ARMORY_TARGET_SHARE as CLIENT_ARMORY_TARGET_SHARE, EPIC_GEM as CLIENT_EPIC_GEM } from "@/utils/armory";
import { WORLD_SCALE } from "../server/src/worldGeometry";

/* ------------------------------------------------------------------------- */
/* TWEAKS — try changes here, then copy them into the game files             */
/* ------------------------------------------------------------------------- */

const TWEAKS: {
  /** Base soldier stats → CIV_DEMOGRAPHICS[civ].soldierUnit in server/src/demographics.ts */
  units?: Partial<Record<CivilizationType, Partial<{ hp: number; atk: number; def: number }>>>;
  /** Population multiplier → CIV_DEMOGRAPHICS[civ].popMultiplier in server/src/demographics.ts */
  popMultiplier?: Partial<Record<CivilizationType, number>>;
  /** Replace a civ's buffs/debuffs → CIV_MODIFIERS in server/src/warConfig.ts */
  modifiers?: Partial<Record<CivilizationType, StatModifier[]>>;
  /** NPC void kingdom City Hall level → VOID_NPC.CITY_HALL_LEVEL in server/src/warConfig.ts */
  npcLevel?: number;
  /** Stat buffs on every attacking army (milestone titles + Dragon Statue / Mana Spire / Plaza Fountain); default none */
  titles?: TitleBuffs;
} = {
  // Examples (uncomment to try):
  // units: { human: { atk: 6 } },
  // popMultiplier: { elf: 0.4 },
  // modifiers: { orc: [{ id: "test", name: "Test", kind: "debuff", atk: -0.3, vs: ["arcane"], description: "−30% ATK vs Nethergarde" }] },
  // npcLevel: 14,
  // titles: { hpBonus: 0.1, atkBonus: 0.1, defBonus: 0.1 },
};

/**
 * Ruler stat buffs the boss table is also run with: titles plus the three landmark improvements. "veteran" is a
 * ruler with a few mid titles; "maxed" is every combat title at tier 3 plus all three landmarks at tier 5 (+37%).
 */
const TITLE_PROFILES: Array<{ name: string; buffs: TitleBuffs | undefined }> = [
  { name: "no titles", buffs: undefined },
  { name: "veteran +10%", buffs: { hpBonus: 0.1, atkBonus: 0.1, defBonus: 0.1 } },
  { name: "maxed +37%", buffs: { hpBonus: 0.37, atkBonus: 0.37, defBonus: 0.37 } }
];

/* ------------------------------------------------------------------------- */
/* Targets                                                                   */
/* ------------------------------------------------------------------------- */

/** A "mid-level" developer's City Hall */
const MID_LEVEL = 10;
/** Assaults a mid-level developer should need to break an NPC void kingdom */
const TARGET_ASSAULTS: [number, number] = [2, 6];
/** Defenders in PvP keep this share of their soldier cap at home (the rest away or never mobilised) */
const DEFENDER_HOME_SHARE = 0.5;
/** Wall tier of a PvP defender at MID_LEVEL */
const PVP_WALL_TIER = 0;
/** City Hall levels shown in the Voidrift table */
const LEVELS = [5, 8, 10, 12, 15, 20];
type Outcome = "win" | "even" | "loss";
/**
 * How each attacker (row) should fare against each defender (column) — the matchup chart in
 * GAME_GUIDE §13. Classified per matchup: win = attacker wins ≥ WIN_RATE of the wars; loss =
 * attacker wins ≤ 1 − WIN_RATE and its losses (as a share of its army) exceed the defender's by
 * LOSS_MARGIN; anything else is even (a close, bloody fight).
 */
const DESIGN_CHART: Record<string, Record<string, Outcome>> = {
  human: { orc: "even", dwarf: "loss", elf: "win" },
  orc: { human: "win", dwarf: "loss", elf: "even" },
  dwarf: { human: "even", orc: "win", elf: "loss" },
  elf: { human: "win", orc: "win", dwarf: "win" }
};
const WIN_RATE = 0.6;
const LOSS_MARGIN = 0.2;
/** Battles averaged per number */
const SEEDS = 30;
const MAX_ASSAULTS = 500;

const MORTALS: CivilizationType[] = ["human", "orc", "dwarf", "elf"];
const ALL: CivilizationType[] = [...MORTALS, "arcane"];
const NAME: Record<CivilizationType, string> = { human: "Human", orc: "Orc", dwarf: "Dwarf", elf: "Elf", arcane: "Nethergarde" };

/* ------------------------------------------------------------------------- */
/* Apply tweaks to the live config (in this process only)                    */
/* ------------------------------------------------------------------------- */

const applied: string[] = [];
for (const [civ, stats] of Object.entries(TWEAKS.units ?? {}) as Array<[CivilizationType, Record<string, number>]>) {
  Object.assign(CIV_DEMOGRAPHICS[civ].soldierUnit, stats);
  applied.push(`${NAME[civ]} unit ${JSON.stringify(stats)}`);
}
for (const [civ, mult] of Object.entries(TWEAKS.popMultiplier ?? {}) as Array<[CivilizationType, number]>) {
  CIV_DEMOGRAPHICS[civ].popMultiplier = mult;
  applied.push(`${NAME[civ]} population ×${mult}`);
}
for (const [civ, mods] of Object.entries(TWEAKS.modifiers ?? {}) as Array<[CivilizationType, StatModifier[]]>) {
  CIV_MODIFIERS[civ] = mods;
  applied.push(`${NAME[civ]} modifiers → ${mods.map((m) => m.name).join(", ") || "none"}`);
}
const npcLevel = TWEAKS.npcLevel ?? VOID_NPC.CITY_HALL_LEVEL;
if (TWEAKS.npcLevel !== undefined) applied.push(`NPC City Hall ${npcLevel}`);

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

const pad = (v: string | number, n: number) => String(v).padStart(n);
const padR = (v: string | number, n: number) => String(v).padEnd(n);
const pct = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
const line = (title: string) => console.log(`\n── ${title} ${"─".repeat(Math.max(0, 78 - title.length))}`);

function describeTraits(civ: CivilizationType): string {
  const t = COMBAT_TRAITS[civ];
  const parts: string[] = [];
  if (t.firstRoundAtkMult !== 1) parts.push(`${pct(t.firstRoundAtkMult - 1)} ATK round 1`);
  if (t.armorPierce) parts.push(`ignores ${Math.round(t.armorPierce * 100)}% armor`);
  if (t.damageTakenMult !== 1) parts.push(`${pct(t.damageTakenMult - 1)} damage taken`);
  if (t.firstRoundDamageTakenMult !== 1) parts.push(`${pct(t.firstRoundDamageTakenMult - 1)} damage taken round 1`);
  if (t.outnumberAtkBonus) parts.push(`up to ${pct(t.outnumberAtkBonus)} ATK when outnumbering`);
  return parts.join(", ") || "—";
}

function describeModifier(m: StatModifier): string {
  const stats = (["hp", "atk", "def"] as const).filter((k) => m[k]).map((k) => `${k.toUpperCase()} ${pct(m[k]!)}`);
  const scope = `${m.vs ? ` vs ${m.vs.map((c) => NAME[c]).join("/")}` : ""}${m.when ? ` when ${m.when}` : ""}`;
  return `${m.kind === "buff" ? "▲" : "▼"} ${m.name}: ${stats.join(" ")}${scope || " (always)"}`;
}

/** March capacity, slots and soldier cap of a ruler at full population (warConfig.ts) */
const capOf = (civ: CivilizationType, level: number) => marchCapacityFor(calculateMaxPopulation(level, civ), civ);
const soldierCapOf = (civ: CivilizationType, level: number) => maxSoldiersFor(calculateMaxPopulation(level, civ), civ);
/** Every march slot filled at once, capped by the soldier cap and split evenly across the slots */
function allSlots(civ: CivilizationType, level: number): number[] {
  const slots = marchSlotsForLevel(level);
  const total = Math.min(slots * capOf(civ, level), soldierCapOf(civ, level));
  const each = Math.floor(total / slots);
  return Array(slots).fill(each).filter((n) => n > 0);
}
const npcGarrison = () => Math.round(calculateMaxPopulation(npcLevel, "arcane") * VOID_NPC.GARRISON_SHARE);

/**
 * One live battle as the game fights it (combat.stepBattleRound, 10-second rounds): every army arrives together,
 * fights up to COMBAT.MAX_ROUNDS rounds, then the survivors fall back. Mutates `def`.
 */
/** 🗡️ While set, every attacking army `liveFight` builds wears its civilization's set of this rarity (the Armory checks) */
let ARMED: ArmoryRarity | null = null;
/** The gear an army of `civ` wears against `def` while ARMED (a world boss or a frontier gate counts its ARMORY_TARGET_SHARE of it) */
const armedGear = (civ: CivilizationType, def: Pick<LiveDefenderState, "kit" | "name">) => (ARMED ? gearOf(civ, ARMED, armoryShareVs(def.kit?.boss ? "boss" : def.name === GATE_NAME ? "gate" : null)) : undefined);
/** How the sim names a frontier gate's garrison, so its fights wear the gate's share of a set */
const GATE_NAME = "Gate garrison";
/** Runs `f` with every attacking army in the best set a City Hall `level` forges (epic when no level is given) */
function inBestSet<T>(f: () => T, level = 25): T {
  ARMED = bestSetAt(level);
  try {
    return f();
  } finally {
    ARMED = null;
  }
}

/** 🦸 While set, the first army `liveFight` builds is led by this champion (the Champions checks) */
let CHAMPION: { level: number; arts: ChampionArts } | null = null;
/** Runs `f` with a champion of `level` (capped at CHAMPION_MAX_LEVEL) and `arts` leading the first army of every fight */
function ledBy<T>(f: () => T, level: number, arts: ChampionArts): T {
  CHAMPION = { level: Math.min(CHAMPION_MAX_LEVEL, level), arts };
  try {
    return f();
  } finally {
    CHAMPION = null;
  }
}

function liveFight(civ: CivilizationType, armies: number[], def: LiveDefenderState, bonus: number, seed: string, titles: TitleBuffs | undefined = TWEAKS.titles, damageMult = 1, omen: BattleOmen | null = null, rally = false) {
  const rng = seededRandom(seed);
  // A rally's armies fight COMBAT.RALLY_MAX_ROUNDS rounds; any other battle COMBAT.MAX_ROUNDS
  const maxRounds = rally ? COMBAT.RALLY_MAX_ROUNDS : COMBAT.MAX_ROUNDS;
  const gear = armedGear(civ, def);
  // A rally's armies are different rulers' (Colossus's Wrath wakes only for one ruler's armies); any other fight is one ruler's
  const stacks: LiveAttackerStack[] = armies.map((n, i) => ({ marchId: `a${i}`, attackerId: rally ? `x${i}` : "x", attackerName: "x", civ, count: n, initialCount: n, joinedRound: 1, roundsFought: 0, carryDamageTaken: 0, totalDamageDealt: 0, totalLosses: 0, atkBonusMult: bonus, titleBuffs: titles, damageMult, maxRounds, ...(gear ? { gear } : {}) }));
  if (CHAMPION && stacks.length) {
    // A champion counts its CHAMPION_TARGET_SHARE against a frontier gate or an epic pack
    const target = def.name === GATE_NAME ? "gate" : def.npc && (def.npc.rarity === "epic" || def.npc.rarity === "legendary") && def.npc.category !== "kingdom" ? "epic_pack" : null;
    Object.assign(stacks[0], championFields(CHAMPION.level, CHAMPION.arts, championShareVs(target)));
  }
  let wallDamage = 0;
  for (let round = 1; round <= maxRounds; round++) {
    if (!stacks.some((s) => s.count > 0) || totalDefenders(def) <= 0) break;
    wallDamage += stepBattleRound(round, stacks.filter((s) => s.count > 0), def, rng, omen, seed).wallDamage;
  }
  const survivors = stacks.reduce((sum, s) => sum + s.count, 0);
  const won = totalDefenders(def) <= 0 && survivors > 0;
  if (won) wallDamage += survivors * WALL_DMG_PER_ATTACKER;
  // 🌙 Moonwell Healers: only the dead count as losses (an elf army's wounded come home); `wounded` are the rest
  const fallen = armies.reduce((a, b) => a + b, 0) - survivors;
  const wounded = stacks.reduce((sum, s) => sum + woundedOf(civ, Math.max(0, s.initialCount - s.count)), 0);
  return { stacks, def, won, survivors, lost: fallen - wounded, wounded, wallDamage };
}

/** 🌙 Of `lost` soldiers of `civ` fallen in a battle, the dead (elves carry a share home wounded) */
const deadOf = (civ: CivilizationType, lost: number) => lost - woundedOf(civ, lost);

const fortress = (civ: CivilizationType, count: number, wallTier: number): LiveDefenderState => ({
  civ,
  count,
  initialCount: count,
  fortified: true,
  wallTier,
  roundsFought: 0,
  carryDamageTaken: 0,
  totalLosses: 0
});

function assaultsToBreak(civ: CivilizationType, level: number, armies = allSlots(civ, level)): number {
  let total = 0;
  for (let seed = 0; seed < SEEDS; seed++) {
    let garrison = npcGarrison();
    let n = 1;
    for (; n <= MAX_ASSAULTS; n++) {
      const d = fortress("arcane", garrison, VOID_NPC.WALL_TIER);
      liveFight(civ, armies, d, 1, `bal-${civ}-${level}-${armies.length}-${seed}-${n}`);
      garrison = d.count;
      if (garrison <= 0) break;
    }
    total += n;
  }
  return total / SEEDS;
}

/** Attacker win rate, and the average loss gap (defender's losses minus attacker's, as shares of each army) */
function war(att: CivilizationType, def: CivilizationType, armies: number[], defCount: number, fortified: boolean, wallTier = PVP_WALL_TIER): { w: number; gap: number } {
  let wins = 0;
  let gap = 0;
  const attTotal = armies.reduce((a, b) => a + b, 0);
  for (let seed = 0; seed < SEEDS; seed++) {
    const d: LiveDefenderState = { ...fortress(def, defCount, wallTier), fortified };
    const r = liveFight(att, armies, d, 1, `pvp-${att}-${def}-${attTotal}-${defCount}-${seed}`);
    if (r.won) wins++;
    gap += deadOf(def, defCount - d.count) / defCount - r.lost / attTotal;
  }
  return { w: wins / SEEDS, gap: gap / SEEDS };
}
const winRate = (att: CivilizationType, def: CivilizationType, attCount: number, defCount: number, fortified: boolean) => war(att, def, [attCount], defCount, fortified).w;
const classify = ({ w, gap }: { w: number; gap: number }): Outcome => (w >= WIN_RATE ? "win" : w <= 1 - WIN_RATE && gap <= -LOSS_MARGIN ? "loss" : "even");

/* ------------------------------------------------------------------------- */
/* 1. Stat sheet                                                             */
/* ------------------------------------------------------------------------- */

console.log("⚔️  Rise of Git — balance simulation");
if (applied.length) console.log(`\n🧪 TWEAKS active (not in the game yet):\n${applied.map((a) => `   • ${a}`).join("\n")}`);

line("Base stats (server/src/demographics.ts → CIV_DEMOGRAPHICS)");
console.log(`${padR("civ", 12)}${pad("pop×", 5)}${pad(`max@${MID_LEVEL}`, 8)}${pad("HP", 5)}${pad("ATK", 5)}${pad("DEF", 5)}  ${padR("speed", 6)} trait`);
for (const civ of ALL) {
  const p = CIV_DEMOGRAPHICS[civ];
  const u = p.soldierUnit;
  console.log(`${padR(NAME[civ], 12)}${pad(p.popMultiplier, 5)}${pad(calculateMaxPopulation(MID_LEVEL, civ), 8)}${pad(u.hp, 5)}${pad(u.atk, 5)}${pad(u.def, 5)}  ${padR(`${p.marchSpeedMultiplier}×`, 6)} ${u.trait}`);
}

line("Traits (warConfig.ts → COMBAT_TRAITS)");
for (const civ of ALL) console.log(`${padR(NAME[civ], 12)}${describeTraits(civ)}`);

line("Buffs & debuffs (warConfig.ts → CIV_MODIFIERS)");
for (const civ of ALL) {
  const mods = CIV_MODIFIERS[civ];
  console.log(`${padR(NAME[civ], 12)}${mods.length ? mods.map(describeModifier).join("\n" + " ".repeat(12)) : "—"}`);
}

line("Effective HP/ATK/DEF when attacking (row attacks column, after buffs/debuffs)");
console.log(`${padR("civ \\ vs", 12)}${ALL.map((c) => pad(NAME[c], 14)).join("")}`);
for (const civ of ALL) {
  const cells = ALL.map((opp) => {
    if (opp === civ) return pad("·", 14);
    const e = effectiveUnit(civ, opp, "attacking");
    return pad(`${Math.round(e.hp)}/${Math.round(e.atk)}/${Math.round(e.def)}`, 14);
  });
  console.log(`${padR(NAME[civ], 12)}${cells.join("")}`);
}
console.log(`Combat: armor = DEF/(DEF+${COMBAT.ARMOR_K}), defenders DEF ×${COMBAT.FORTIFICATION_DEF_MULT}, ±${COMBAT.VARIANCE * 100}% rolls, max ${COMBAT.MAX_ROUNDS} rounds`);

/* ------------------------------------------------------------------------- */
/* 2. Voidrift assaults                                                      */
/* ------------------------------------------------------------------------- */

line(`Voidrift: assaults to break an NPC void kingdom (City Hall ${npcLevel}, ${npcGarrison()} Void Weavers, walls tier ${VOID_NPC.WALL_TIER})`);
console.log(`Live battles; each assault fills every march slot (at mid level: all slots / one march); average of ${SEEDS} sieges.`);
console.log(`${padR("City Hall", 12)}${MORTALS.map((c) => pad(NAME[c], 14)).join("")}`);
const midAssaults = {} as Record<CivilizationType, number>;
for (const level of LEVELS) {
  const row = MORTALS.map((civ) => {
    const v = assaultsToBreak(civ, level);
    if (level !== MID_LEVEL) return pad(v.toFixed(1), 14);
    midAssaults[civ] = v;
    // One march alone, for comparison (mid level only: it is slow)
    const one = assaultsToBreak(civ, level, [capOf(civ, level)]);
    return pad(`${v.toFixed(1)} / ${one > MAX_ASSAULTS ? ">" + MAX_ASSAULTS : one.toFixed(0)}`, 14);
  });
  console.log(`${padR(level === MID_LEVEL ? `${level} ◀ mid` : level, 12)}${row.join("")}`);
}

/* ------------------------------------------------------------------------- */
/* 3. Fair duels                                                             */
/* ------------------------------------------------------------------------- */

line("Duel: 100 vs 100 soldiers in the open (per-soldier strength, info only)");
console.log(`${padR("att \\ def", 12)}${ALL.map((c) => pad(NAME[c], 13)).join("")}`);
for (const att of ALL) {
  console.log(`${padR(NAME[att], 12)}${ALL.map((def) => pad(att === def ? "·" : `${Math.round(winRate(att, def, 100, 100, false) * 100)}%`, 13)).join("")}`);
}

line(`PvP: equal City Hall ${MID_LEVEL}, attacker fills every march slot, defender holds ${DEFENDER_HOME_SHARE * 100}% of its soldier cap behind tier-${PVP_WALL_TIER} walls`);
console.log(`Attacker win rate · loss gap · outcome vs design (live battles). Armies: ${MORTALS.map((c) => `${NAME[c]} ${allSlots(c, MID_LEVEL).join("+")} vs ${Math.round(soldierCapOf(c, MID_LEVEL) * DEFENDER_HOME_SHARE)}`).join(" · ")}`);
console.log(`${padR("att \\ def", 12)}${MORTALS.map((c) => pad(NAME[c], 22)).join("")}`);
const pvpChecks: Array<{ ok: boolean; text: string }> = [];
for (const att of MORTALS) {
  const cells = MORTALS.map((def) => {
    if (att === def) return pad("·", 22);
    const r = war(att, def, allSlots(att, MID_LEVEL), Math.round(soldierCapOf(def, MID_LEVEL) * DEFENDER_HOME_SHARE), true);
    const got = classify(r);
    const want = DESIGN_CHART[att][def];
    pvpChecks.push({ ok: got === want, text: `${NAME[att]} attacking ${NAME[def]}: ${got} (design: ${want}) — wins ${Math.round(r.w * 100)}%, loss gap ${r.gap >= 0 ? "+" : ""}${r.gap.toFixed(2)}` });
    return pad(`${Math.round(r.w * 100)}% ${r.gap >= 0 ? "+" : ""}${r.gap.toFixed(2)} ${got === want ? "✓" : "✗"}${got.padStart(5)}`, 22);
  });
  console.log(`${padR(NAME[att], 12)}${cells.join("")}`);
}

/* ------------------------------------------------------------------------- */
/* Verdict                                                                   */
/* ------------------------------------------------------------------------- */

interface Check {
  ok: boolean;
  text: string;
}
const checks: Check[] = MORTALS.map((civ) => {
  const v = midAssaults[civ];
  const [lo, hi] = TARGET_ASSAULTS;
  return {
    ok: v >= lo && v <= hi,
    text: `${NAME[civ]} needs ${v.toFixed(1)} assaults at City Hall ${MID_LEVEL} (target ${lo}–${hi})${v < lo ? " — too easy" : v > hi ? " — too hard" : ""}`
  };
});
const fastest = MORTALS.reduce((a, b) => (midAssaults[a] <= midAssaults[b] ? a : b));
checks.push({
  ok: fastest === "elf",
  text: `Elves are the fastest Voidrift attackers (GAME_GUIDE §13 matchups) — fastest now: ${NAME[fastest]} (${midAssaults[fastest].toFixed(1)})`
});

/* ------------------------------------------------------------------------- */
/* Gathering                                                                 */
/* ------------------------------------------------------------------------- */

/** Common daily nodes (worldMapGenerator DAILY_RESOURCE_TEMPLATES) */
const COMMON_NODES: Array<Record<string, number>> = [{ lumber: 9000 }, { food: 10000 }, { stone: 7000 }];
/** Harvest pool per 15 min (GAME_GUIDE §7) shared by a realm of REALM_KINGDOMS kingdoms */
const HARVEST_BULK_POOL = 1_000 + 25_000 + 50_000 + 100_000 + 250_000;
const REALM_KINGDOMS = 45;
/** Walk out + walk home per trip */
const GATHER_TRIP_MS = 2 * 2 * 60_000;
const GATHER_SHARE: [number, number] = [0.5, 2.5];

const harvestPerHour = (HARVEST_BULK_POOL / REALM_KINGDOMS) * 4;
const gatherPerHour: Record<string, number> = {};
line(`Gathering at City Hall ${MID_LEVEL} — one march on common nodes, back to back (harvest ≈ ${Math.round(harvestPerHour).toLocaleString()}/h)`);
for (const civ of MORTALS) {
  const cap = marchCapacityFor(calculateMaxPopulation(MID_LEVEL, civ), civ);
  const load = Math.floor(cap * LOAD_PER_SOLDIER * (CIV_LOAD_MULT[civ] ?? 1) * PVE_LOAD_MULT);
  let perHour = 0;
  for (const node of COMMON_NODES) {
    const total = Object.values(node).reduce((a, b) => a + b, 0);
    const haul = Math.min(load, total);
    const ms = (haul / gatherRateFor(civ, node)) * 1000 + GATHER_TRIP_MS;
    perHour += (haul / ms) * 3_600_000;
  }
  gatherPerHour[civ] = perHour / COMMON_NODES.length;
  console.log(`  ${NAME[civ].padEnd(8)} cap ${String(cap).padStart(4)} · load ${String(load).padStart(5)} · ${Math.round(gatherPerHour[civ]).toLocaleString().padStart(7)}/h (${Math.round((gatherPerHour[civ] / harvestPerHour) * 100)}% of the harvest)`);
}
const gatherChecks: Check[] = MORTALS.map((civ) => {
  const share = gatherPerHour[civ] / harvestPerHour;
  return {
    ok: share >= GATHER_SHARE[0] && share <= GATHER_SHARE[1],
    text: `${NAME[civ]} gathers ${Math.round(share * 100)}% of the harvest income per hour (target ${GATHER_SHARE[0] * 100}–${GATHER_SHARE[1] * 100}%)`
  };
});
const gMax = Math.max(...MORTALS.map((c) => gatherPerHour[c]));
const gMin = Math.min(...MORTALS.map((c) => gatherPerHour[c]));
gatherChecks.push({ ok: gMax <= 2 * gMin, text: `No civ out-gathers another by more than 2× (${(gMax / gMin).toFixed(2)}×)` });

/* ------------------------------------------------------------------------- */
/* Rallies vs swarms                                                         */
/* ------------------------------------------------------------------------- */

/** 5 orc armies of 350 (City Hall 10) against a City Hall 25 human castle with 2,500 footmen behind tier-0 walls */
const SWARM = { civ: "orc" as CivilizationType, armies: 5, size: 350, defCiv: "human" as CivilizationType, garrison: 2500, wallTier: 0 };

/** Live battle until breach or everyone exhausted; armies join every `gap` rounds; returns [breached share, avg losses] */
function liveSwarm(gap: number, bonus: number, runs = 200, rally = false): { breach: number; losses: number } {
  let breaches = 0;
  let losses = 0;
  for (let run = 0; run < runs; run++) {
    const rng = seededRandom(`swarm-${gap}-${bonus}-${run}`);
    const def: LiveDefenderState = { civ: SWARM.defCiv, count: SWARM.garrison, initialCount: SWARM.garrison, fortified: true, wallTier: SWARM.wallTier, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0 };
    const stacks: LiveAttackerStack[] = [];
    for (let round = 1; round <= 60; round++) {
      if (gap === 0 ? round === 1 : (round - 1) % gap === 0 && stacks.length < SWARM.armies) {
        const n = gap === 0 ? SWARM.armies : 1;
        for (let i = 0; i < n; i++) {
          stacks.push({ marchId: `a${stacks.length}`, attackerId: "x", attackerName: "x", civ: SWARM.civ, count: SWARM.size, initialCount: SWARM.size, joinedRound: round, roundsFought: 0, carryDamageTaken: 0, totalDamageDealt: 0, totalLosses: 0, atkBonusMult: bonus, maxRounds: rally ? COMBAT.RALLY_MAX_ROUNDS : undefined });
        }
      }
      const present = stacks.filter((st) => st.count > 0 && st.roundsFought < maxRoundsOf(st));
      if (present.length === 0 && stacks.length >= SWARM.armies) break;
      if (present.length === 0) continue;
      stepBattleRound(round, present, def, rng);
      if (totalDefenders(def) <= 0) {
        breaches++;
        break;
      }
    }
    losses += stacks.reduce((sum, st) => sum + st.totalLosses, 0);
  }
  return { breach: breaches / runs, losses: losses / runs };
}

const rallyBonus = 1 + RALLY_COORDINATION_ATK * (SWARM.armies - 1);
const together = liveSwarm(0, 1);
const asRally = liveSwarm(0, rallyBonus, 200, true);
const trickle = liveSwarm(1, 1);
line(`Rallies vs swarms — ${SWARM.armies} ${NAME[SWARM.civ]} armies of ${SWARM.size} vs ${SWARM.garrison.toLocaleString()} ${NAME[SWARM.defCiv]}s (walls tier ${SWARM.wallTier})`);
console.log(`  one per round      breach ${Math.round(trickle.breach * 100)}% · lost ${Math.round(trickle.losses).toLocaleString()}`);
console.log(`  all together       breach ${Math.round(together.breach * 100)}% · lost ${Math.round(together.losses).toLocaleString()}`);
console.log(`  as a rally (+${Math.round((rallyBonus - 1) * 100)}%)  breach ${Math.round(asRally.breach * 100)}% · lost ${Math.round(asRally.losses).toLocaleString()}`);
const rallyChecks: Check[] = [
  { ok: asRally.breach >= together.breach && asRally.losses < together.losses, text: `A rally breaches with fewer losses than the same armies arriving together (${Math.round(asRally.losses)} vs ${Math.round(together.losses)})` },
  { ok: together.losses < trickle.losses, text: `Arriving together beats trickling in (${Math.round(together.losses)} vs ${Math.round(trickle.losses)} lost)` }
];

/* ------------------------------------------------------------------------- */
/* World bosses, NPC kingdoms & Special Overseers                            */
/* ------------------------------------------------------------------------- */

const BOSS_LEVEL = 20;
const marchOf = capOf;

const bossDefender = (type: string, hp: number, vengeance = 0): LiveDefenderState => {
  const u = vengefulBossUnit(bossUnitFor(type), vengeance);
  return { civ: "human", count: 1, initialCount: 1, fortified: false, roundsFought: 0, carryDamageTaken: 1 - hp / u.hp, totalLosses: 0, unit: { hp: u.hp, atk: u.atk, def: u.def }, kit: bossKitFor(type, type), boss: { maxHp: u.hp, hpAtStart: hp, lifeKey: "sim", weekKey: "sim" } };
};

/** Attempts (fresh armies each time, the boss keeps its wounds) until the boss falls; plus the share of HP one attempt takes */
function bossAttempts(civ: CivilizationType, members: number, type: string, level = BOSS_LEVEL, vengeance = 0, omen: BattleOmen | null = null): { attempts: number; firstShare: number; lossShare: number; woundShare: number } {
  const u = vengefulBossUnit(bossUnitFor(type), vengeance);
  let hp = u.hp;
  let firstShare = 0;
  let lossShare = 0;
  let woundShare = 0;
  const army = marchOf(civ, level);
  for (let attempt = 1; attempt <= 60; attempt++) {
    // Under a Blood Moon the boss is a world NPC the omen reaches (combat reads its `npc` bookkeeping)
    const def = omen ? { ...bossDefender(type, hp, vengeance), npc: { type, category: "boss" as const, emblem: "", unitName: type, expiresAt: null } } : bossDefender(type, hp, vengeance);
    const r = liveFight(civ, Array(members).fill(army), def, 1 + RALLY_COORDINATION_ATK * (members - 1), `boss-${civ}-${members}-${type}-${vengeance}-${attempt}`, TWEAKS.titles, bossDamageMult(level, civ), omen, members > 1);
    const after = r.def.count <= 0 ? 0 : u.hp * (r.def.count - r.def.carryDamageTaken);
    if (attempt === 1) {
      firstShare = (hp - after) / u.hp;
      lossShare = r.lost / (army * members);
      woundShare = r.wounded / (army * members);
    }
    hp = after;
    if (hp <= 0) return { attempts: attempt, firstShare, lossShare, woundShare };
  }
  return { attempts: 61, firstShare, lossShare, woundShare };
}

line(`World bosses — City Hall ${BOSS_LEVEL} armies (one march each) against a fresh boss`);
console.log(`  ${padR("boss", 16)}${MORTALS.map((c) => pad(NAME[c], 22)).join("")}`);
console.log(`  ${padR("", 16)}${MORTALS.map(() => pad("solo hp% · rally of 4", 22)).join("")}`);
const bossRows: Array<{ type: string; solo: Record<string, ReturnType<typeof bossAttempts>>; rally: Record<string, ReturnType<typeof bossAttempts>> }> = [];
for (const type of Object.keys(BOSS_UNITS)) {
  const solo = {} as Record<string, ReturnType<typeof bossAttempts>>;
  const rally = {} as Record<string, ReturnType<typeof bossAttempts>>;
  for (const civ of MORTALS) {
    solo[civ] = bossAttempts(civ, 1, type);
    rally[civ] = bossAttempts(civ, 4, type);
  }
  bossRows.push({ type, solo, rally });
  console.log(
    `  ${padR(type.replace("boss-", ""), 16)}${MORTALS.map((c) => pad(`${Math.round(solo[c].firstShare * 100)}% · ${rally[c].attempts} tries (−${Math.round(rally[c].lossShare * 100)}%)`, 22)).join("")}`
  );
}
// Vengeance: every kill this week makes the next boss in the zone +10% HP / ATK / DEF
const VENGEANCE_STACKS = [0, 1, 3, 5, 7];
line(`World bosses — Vengeance: rally of 4 City Hall ${BOSS_LEVEL} rulers, tries to kill (avg over all bosses) by kills this week`);
console.log(`  ${padR("stacks", 16)}${MORTALS.map((c) => pad(NAME[c], 14)).join("")}`);
for (const v of VENGEANCE_STACKS) {
  const cells = MORTALS.map((civ) => {
    const runs = Object.keys(BOSS_UNITS).map((t) => bossAttempts(civ, 4, t, BOSS_LEVEL, v));
    const tries = runs.reduce((a, r) => a + r.attempts, 0) / runs.length;
    return pad(tries > 60 ? ">60" : tries.toFixed(1), 14);
  });
  console.log(`  ${padR(`×${v} (+${v * 10}%)`, 16)}${cells.join("")}`);
}

/** One ruler sending every march slot at once (they don't get the rally bonus), with a stat-buff profile */
function bossSolo(civ: CivilizationType, level: number, type: string, titles: TitleBuffs | undefined): { attempts: number; firstShare: number } {
  const u = bossUnitFor(type);
  let hp = u.hp;
  let firstShare = 0;
  for (let attempt = 1; attempt <= 40; attempt++) {
    const r = liveFight(civ, allSlots(civ, level), bossDefender(type, hp), 1, `boss-solo-${civ}-${level}-${type}-${attempt}`, titles, bossDamageMult(level, civ));
    const after = r.def.count <= 0 ? 0 : u.hp * (r.def.count - r.def.carryDamageTaken);
    if (attempt === 1) firstShare = (hp - after) / u.hp;
    hp = after;
    if (hp <= 0) return { attempts: attempt, firstShare };
  }
  return { attempts: 41, firstShare };
}
const BOSS_SOLO_LEVELS = [15, 25];
/** Colossus Hide target: a City Hall 15 ruler with a veteran's titles and every slot takes at most this share per battle */
const BOSS_SOLO_MAX_SHARE = { level: 15, profile: "veteran +10%", share: 0.3 };
const bossSoloShares: Record<string, number> = {};
line("World bosses — one ruler with every march slot, by stat buffs (HP share of the first battle · battles to kill, averaged over all bosses)");
console.log(`  ${padR("", 22)}${ALL.map((c) => pad(NAME[c], 16)).join("")}`);
for (const level of BOSS_SOLO_LEVELS) {
  for (const prof of TITLE_PROFILES) {
    const cells = ALL.map((civ) => {
      const runs = Object.keys(BOSS_UNITS).map((t) => bossSolo(civ, level, t, prof.buffs));
      const share = runs.reduce((a, r) => a + r.firstShare, 0) / runs.length;
      if (level === BOSS_SOLO_MAX_SHARE.level && prof.name === BOSS_SOLO_MAX_SHARE.profile) bossSoloShares[civ] = share;
      const tries = runs.reduce((a, r) => a + r.attempts, 0) / runs.length;
      return pad(`${Math.round(share * 100)}% · ${tries > 40 ? ">40" : tries.toFixed(1)}×`, 16);
    });
    console.log(`  ${padR(`CH${level} ${prof.name}`, 22)}${cells.join("")}`);
  }
}

/** The same 4 marches as a rally (one battle, +15% ATK, COMBAT.RALLY_MAX_ROUNDS) vs each in its own battle (COMBAT.MAX_ROUNDS): battles until the boss falls */
function bossSeparate(civ: CivilizationType, type: string, members = 4, level = BOSS_LEVEL): number {
  const u = bossUnitFor(type);
  let hp = u.hp;
  for (let battle = 1; battle <= 240; battle++) {
    const r = liveFight(civ, [marchOf(civ, level)], bossDefender(type, hp), 1, `boss-sep-${civ}-${type}-${battle}`, TWEAKS.titles, bossDamageMult(level, civ));
    hp = r.def.count <= 0 ? 0 : u.hp * (r.def.count - r.def.carryDamageTaken);
    if (hp <= 0) return battle / members;
  }
  return 61;
}
const separateWorse: string[] = [];
for (const row of bossRows) {
  for (const civ of MORTALS) {
    const apart = bossSeparate(civ, row.type);
    // A try is all 4 marches: 7 lone battles are 2 tries' worth
    if (Math.ceil(apart) < row.rally[civ].attempts) separateWorse.push(`${row.type.replace("boss-", "")} ${NAME[civ]}: rally ${row.rally[civ].attempts} vs apart ${apart.toFixed(1)}`);
  }
}
line(`World bosses — rally of 4 (${COMBAT.RALLY_MAX_ROUNDS} rounds, +${Math.round(RALLY_COORDINATION_ATK * 300)}% ATK) vs the same 4 marches each in its own battle (${COMBAT.MAX_ROUNDS} rounds)`);
console.log(`  ${separateWorse.length ? `apart is faster: ${separateWorse.join("; ")}` : "the rally kills every boss in no more tries than the same marches attacking apart (4 lone battles = 1 try)"}`);

const BOSS_RALLY_ATTEMPTS: [number, number] = [1, 6];
const bossChecks: Check[] = [
  {
    ok: bossRows.every((r) => MORTALS.every((c) => r.solo[c].firstShare < 0.25)),
    text: `A lone City Hall ${BOSS_LEVEL} march takes under 25% of a boss's HP (worst: ${Math.round(Math.max(...bossRows.flatMap((r) => MORTALS.map((c) => r.solo[c].firstShare))) * 100)}%)`
  },
  {
    ok: ALL.every((c) => bossSoloShares[c] <= BOSS_SOLO_MAX_SHARE.share),
    text: `Colossus Hide: a City Hall ${BOSS_SOLO_MAX_SHARE.level} ruler (${BOSS_SOLO_MAX_SHARE.profile}) sending every march slot takes at most ${BOSS_SOLO_MAX_SHARE.share * 100}% of a boss's HP per battle (${ALL.map((c) => `${NAME[c]} ${Math.round(bossSoloShares[c] * 100)}%`).join(", ")})`
  },
  {
    ok: separateWorse.length === 0,
    text: `A rally of 4 (${COMBAT.RALLY_MAX_ROUNDS} rounds) kills every boss in no more tries than the same 4 marches attacking it apart${separateWorse.length ? ` — off: ${separateWorse.slice(0, 4).join("; ")}` : ""}`
  },
  {
    ok: bossRows.every((r) => MORTALS.every((c) => r.rally[c].attempts >= BOSS_RALLY_ATTEMPTS[0] && r.rally[c].attempts <= BOSS_RALLY_ATTEMPTS[1])),
    text: `A rally of 4 City Hall ${BOSS_LEVEL} rulers kills any boss within ${BOSS_RALLY_ATTEMPTS[0]}–${BOSS_RALLY_ATTEMPTS[1]} attempts (range ${Math.min(...bossRows.flatMap((r) => MORTALS.map((c) => r.rally[c].attempts)))}–${Math.max(...bossRows.flatMap((r) => MORTALS.map((c) => r.rally[c].attempts)))})`
  }
];

/* ------------------------------------------------------------------------- */
/* 🌙 Moonwell Healers: elves' wounded                                       */
/* ------------------------------------------------------------------------- */

/**
 * What hastening one wounded elf costs, as a share of raising a new soldier from nothing (a Paid Settler, then arming them);
 * the Sylvan Emerald on top isn't counted. An elf army's effective losses are its dead plus its wounded at this weight.
 */
const HASTEN_WEIGHT =
  (MOONWELL.HASTEN_PER_SOLDIER.food + MOONWELL.HASTEN_PER_SOLDIER.gold) / (SETTLERS.COST.food + SETTLERS.COST.gold + MOBILIZATION_COST.food + MOBILIZATION_COST.iron);
/**
 * The design: the Moonwell makes an elf's losses sting less than before, never cheaper than the civilization that loses
 * least in the same fight. An elf rally's effective losses may fall at most this share below the cheapest other civ's.
 */
const MOONWELL_MAX_EDGE = 0;
const moonwellOff: string[] = [];
line(`Moonwell Healers — rally of 4 City Hall ${BOSS_LEVEL} elves per try: losses before (all dead) → dead + wounded now → effective (wounded ×${HASTEN_WEIGHT.toFixed(2)}, the hasten)`);
console.log(`  ${padR("boss", 16)}${pad("before", 9)}${pad("dead", 7)}${pad("wounded", 9)}${pad("effective", 11)}   cheapest other civ`);
for (const row of bossRows) {
  const e = row.rally.elf;
  const effective = e.lossShare + e.woundShare * HASTEN_WEIGHT;
  const cheapest = MORTALS.filter((c) => c !== "elf").reduce((a, b) => (row.rally[a].lossShare <= row.rally[b].lossShare ? a : b));
  const floor = row.rally[cheapest].lossShare * (1 - MOONWELL_MAX_EDGE);
  if (effective < floor) moonwellOff.push(`${row.type.replace("boss-", "")}: elf ${Math.round(effective * 100)}% vs ${NAME[cheapest]} ${Math.round(row.rally[cheapest].lossShare * 100)}%`);
  const p = (v: number) => `−${Math.round(v * 100)}%`;
  console.log(`  ${padR(row.type.replace("boss-", ""), 16)}${pad(p(e.lossShare + e.woundShare), 9)}${pad(p(e.lossShare), 7)}${pad(p(e.woundShare), 9)}${pad(p(effective), 11)}   ${NAME[cheapest]} ${p(row.rally[cheapest].lossShare)}`);
}
const hastenOne = hastenCostFor(MOONWELL.HASTEN_SOLDIERS_PER_EMERALD);
/**
 * Healing: a few wounded rejoin at every harvest. Target: a whole march wiped out (half of it wounded) is back in the
 * garrison within MOONWELL_HEAL_HOURS at every City Hall — far sooner than births would replace the dead, never instantly.
 */
const MOONWELL_HEAL_HOURS: [number, number] = [2, 6];
const HARVEST_H = 0.25;
const healH = (wounded: number, perHarvest: number) => Math.ceil(wounded / perHarvest) * HARVEST_H;
const healOff: string[] = [];
line(`Moonwell Healers — healing at ${MOONWELL.HEAL_SHARE_PER_HARVEST * 100}% of the soldier cap a harvest (at least ${MOONWELL.HEAL_MIN_PER_HARVEST}): hours until the wounded are all back`);
console.log(`  ${padR("City Hall", 11)}${pad("cap", 6)}${pad("/harvest", 10)}${pad("rally try", 11)}${pad("march wiped", 13)}${pad("army wiped", 12)}${pad("births for the dead of a wiped march", 39)}`);
for (const level of [3, 5, 10, 15, 20, 25]) {
  const maxPop = calculateMaxPopulation(level, "elf");
  const per = woundedHealPerHarvest(maxPop, "elf");
  const march = capOf("elf", level);
  const cap = soldierCapOf("elf", level);
  // A boss rally try at City Hall 20 wounds about this share of a march (the table above)
  const tryShare = bossRows.reduce((a, r) => a + r.rally.elf.woundShare, 0) / bossRows.length;
  const wipedMarch = woundedOf("elf", march);
  const regrow = harvestsToRegrow("elf", level, march - wipedMarch) * HARVEST_H;
  const h = healH(wipedMarch, per);
  if (h < MOONWELL_HEAL_HOURS[0] || h > MOONWELL_HEAL_HOURS[1] || h >= regrow) healOff.push(`City Hall ${level}: ${h} h (births ${regrow.toFixed(1)} h)`);
  console.log(`  ${padR(level, 11)}${pad(cap, 6)}${pad(per, 10)}${pad(`${healH(Math.round(march * tryShare), per)} h`, 11)}${pad(`${h} h`, 13)}${pad(`${healH(woundedOf("elf", cap), per)} h`, 12)}${pad(`${regrow.toFixed(1)} h`, 39)}`);
}
console.log(`  ${MOONWELL.WOUNDED_SHARE * 100}% of an elf army's battle losses come home wounded, ${MOONWELL.HEAL_SHARE_PER_HARVEST * 100}% of the soldier cap back each harvest; hastening ${MOONWELL.HASTEN_SOLDIERS_PER_EMERALD} costs ${hastenOne.food} food, ${hastenOne.gold} gold and ${Object.values(hastenOne.gems)[0]} ${MOONWELL.HASTEN_GEM}`);
const moonwellMirrorOk = JSON.stringify(CLIENT_MOONWELL) === JSON.stringify(MOONWELL) && [0, 1, 25, 26, 180].every((n) => JSON.stringify(clientHastenCostFor(n)) === JSON.stringify(hastenCostFor(n)));
const moonwellChecks: Check[] = [
  {
    ok: moonwellOff.length === 0,
    text: `Moonwell Healers: an elf rally's effective losses (dead + wounded × the hasten's ${HASTEN_WEIGHT.toFixed(2)}) are never below the civ that loses least against the same boss${moonwellOff.length ? ` — off: ${moonwellOff.slice(0, 4).join("; ")}` : ""}`
  },
  {
    ok: HASTEN_WEIGHT > 0.1 && HASTEN_WEIGHT < 0.6,
    text: `Moonwell Healers: hastening a wounded elf costs a fair share of raising a new soldier (${Math.round(HASTEN_WEIGHT * 100)}%, wanted 10–60%), so waiting for the harvests is a real choice`
  },
  {
    ok: healOff.length === 0,
    text: `Moonwell Healers: a wiped-out march's wounded are back in ${MOONWELL_HEAL_HOURS[0]}–${MOONWELL_HEAL_HOURS[1]} h at every City Hall, sooner than births replace its dead${healOff.length ? ` — off: ${healOff.join("; ")}` : ""}`
  },
  {
    ok: MORTALS.every((c) => (c === "elf") === woundedShareOf(c) > 0),
    text: `Moonwell Healers belong to the elves alone (${MORTALS.filter((c) => woundedShareOf(c) > 0).map((c) => NAME[c]).join(", ") || "nobody"})`
  },
  { ok: moonwellMirrorOk, text: `Client copy of MOONWELL (src/utils/war.ts) matches the server${moonwellMirrorOk ? "" : " — copy warConfig.ts's MOONWELL over"}` }
];

/** NPC kingdoms: rallies of 4 City Hall 15 rulers needed to beat the garrison (it keeps its losses between attempts) */
const NPCK_RALLY_LEVEL = 15;
/** Rallies to beat a free realm's garrison at `level`: with its Battle Arts (its stage's kit, paid for by `kitTrimFor`) or `kitless` as before kits */
function npcKingdomRallies(att: CivilizationType, def: CivilizationType, level: number, kitless = false): number {
  let garrison = maxSoldiersFor(calculateMaxPopulation(level, def), def);
  const army = marchOf(att, NPCK_RALLY_LEVEL);
  const tier = npcWallTierFor(level);
  const kit = kitless ? undefined : npcKingdomKitFor(def, realmRarityAt(level), "Realm garrison");
  const kitTrim = kit ? kitTrimFor(effectiveUnit(def, att, "defending").def * wallDefMultForTier(tier), kit) : undefined;
  for (let attempt = 1; attempt <= 30; attempt++) {
    const d: LiveDefenderState = { civ: def, count: garrison, initialCount: garrison, fortified: true, wallTier: tier, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0, kit: kit && { ...kit }, kitTrim };
    const r = liveFight(att, Array(4).fill(army), d, 1 + RALLY_COORDINATION_ATK * 3, `npck-${att}-${def}-${level}-${attempt}`, TWEAKS.titles, 1, null, true);
    if (r.won) return attempt;
    garrison = r.def.count;
  }
  return 31;
}
line(`NPC kingdoms — rallies of 4 City Hall ${NPCK_RALLY_LEVEL} rulers needed to beat the garrison, before kits → with its stage's kit (attacker ↓ / donor civ →)`);
const npckLevels = [10, 15, 20, 25];
const npckTable: Record<string, Record<number, number>> = {};
const npckHarder: string[] = [];
for (const att of ALL) {
  const cells: string[] = [];
  npckTable[att] = {};
  for (const level of npckLevels) {
    const donors = MORTALS.filter((d) => d !== att);
    const before = donors.map((d) => npcKingdomRallies(att, d, level, true));
    const now = donors.map((d) => npcKingdomRallies(att, d, level));
    donors.forEach((d, i) => {
      if (now[i] > before[i]) npckHarder.push(`${NAME[att]} vs ${NAME[d]} CH${level} ${before[i]} → ${now[i]}`);
    });
    const worst = Math.max(...now);
    npckTable[att][level] = worst;
    const was = Math.max(...before);
    cells.push(pad(`CH${level}: ${was > 30 ? ">30" : was}→${worst > 30 ? ">30" : worst}`, 14));
  }
  console.log(`  ${padR(NAME[att], 8)}${cells.join("")}  (worst donor civ)`);
}
console.log(`  Kits by stage (CH6–10 common … 21–25 epic): ${MORTALS.map((c) => `${NAME[c]} ${[...NPC_KINGDOM_KITS[c].instincts, ...NPC_KINGDOM_KITS[c].arts].map((id) => INSTINCTS[id]?.name ?? ARTS[id]?.name ?? id).join(", ")}`).join(" · ")}`);
const npckChecks: Check[] = [
  {
    ok: MORTALS.every((a) => npckTable[a][25] >= npckTable[a][10]),
    text: "Higher-level NPC kingdoms take at least as many rallies as City Hall 10 ones"
  },
  {
    ok: npckHarder.length === 0,
    text: `An NPC kingdom's Battle Arts kit never takes a rally more tries to beat than its garrison without one${npckHarder.length ? ` — off: ${npckHarder.slice(0, 6).join("; ")}` : ""}`
  }
];

/** Special Overseers: a full City Hall 25 rally (leader + 5) against a fresh Overseer, by Resolve stacks */
function overseerWinRate(att: CivilizationType, grudge: number, runs = 20): number {
  const pop = calculateMaxPopulation(25, "arcane");
  const garrison = Math.round(maxSoldiersFor(pop, "arcane") * OVERSEER_GARRISON_SHARE);
  const army = marchOf(att, 25);
  let wins = 0;
  for (let run = 0; run < runs; run++) {
    const d: LiveDefenderState = { civ: "arcane", count: garrison, initialCount: garrison, fortified: true, wallTier: 5, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0, statMult: 1 + OVERSEER_GRUDGE_PER_DEFEAT * grudge };
    if (liveFight(att, Array(6).fill(army), d, 1 + RALLY_COORDINATION_ATK * 5, `ovs-${att}-${grudge}-${run}`, TWEAKS.titles, 1, null, true).won) wins++;
  }
  return wins / runs;
}
line("Special Overseers — Resolve stacks until a full City Hall 25 rally (leader + 5) stops winning");
const overseerStops: Record<string, number> = {};
for (const att of MORTALS) {
  let k = 0;
  while (k < 60 && overseerWinRate(att, k) >= 0.5) k++;
  overseerStops[att] = k;
  console.log(`  ${padR(NAME[att], 8)} wins up to ×${Math.max(0, k - 1)} Resolve → ${k} defeats a week before it holds`);
}
const overseerChecks: Check[] = [
  {
    ok: MORTALS.every((c) => overseerStops[c] >= 2 && overseerStops[c] <= 40),
    text: `Overseers hold against a full rally after 2–40 defeats a week (${MORTALS.map((c) => `${NAME[c]} ${overseerStops[c]}`).join(", ")})`
  }
];

/* ------------------------------------------------------------------------- */
/* Armies: slots × capacity vs the soldier cap, rebuilding a lost march      */
/* ------------------------------------------------------------------------- */

/** Harvests until a full-population kingdom that lost `lost` people is full again, by births alone (15-minute harvests) */
function harvestsToRegrow(civ: CivilizationType, level: number, lost: number): number {
  const max = calculateMaxPopulation(level, civ);
  let pop = Math.max(1, max - lost);
  let n = 0;
  while (pop < max && n < 5000) {
    const births = Math.min(max - pop, estimateNaturalBirths(pop, civ, pop / max));
    if (births <= 0) return Infinity;
    pop += births;
    n++;
  }
  return n;
}
const hoursOf = (harvests: number) => (Number.isFinite(harvests) ? `${((harvests * 15) / 60).toFixed(1)} h` : "never (no births)");

line("Armies — one march · march slots · soldier cap (full population), and the time births need to replace a lost march");
console.log(`  ${padR("civ", 8)}${[5, 10, 15, 20, 25].map((l) => pad(`CH${l}`, 21)).join("")}   rebuild a CH10 march`);
for (const civ of MORTALS) {
  const cells = [5, 10, 15, 20, 25].map((l) => pad(`${capOf(civ, l)}×${marchSlotsForLevel(l)} / ${soldierCapOf(civ, l)}`, 21));
  console.log(`  ${padR(NAME[civ], 8)}${cells.join("")}   ${hoursOf(harvestsToRegrow(civ, 10, capOf(civ, 10)))}`);
}
const armyChecks: Check[] = [
  {
    ok: MORTALS.every((c) => [5, 10, 15, 20, 25].every((l) => soldierCapOf(c, l) >= capOf(c, l))),
    text: "Every civ's soldier cap fills at least one full march at every City Hall (the server enforces the cap on top)"
  }
];

/* ------------------------------------------------------------------------- */
/* Plunder by load                                                           */
/* ------------------------------------------------------------------------- */

line(`Plunder — what a City Hall ${MID_LEVEL} army carries home after its PvP wins (survivors × load per soldier)`);
const haul: Record<string, number> = {};
for (const att of MORTALS) {
  const armies = allSlots(att, MID_LEVEL);
  const load = LOAD_PER_SOLDIER * (CIV_LOAD_MULT[att] ?? 1);
  let total = 0;
  let wins = 0;
  for (const def of MORTALS.filter((d) => d !== att)) {
    for (let seed = 0; seed < 10; seed++) {
      const d = fortress(def, Math.round(soldierCapOf(def, MID_LEVEL) * DEFENDER_HOME_SHARE), PVP_WALL_TIER);
      const r = liveFight(att, armies, d, 1, `loot-${att}-${def}-${seed}`);
      if (r.won) {
        total += r.survivors * load;
        wins++;
      }
    }
  }
  haul[att] = wins ? total / wins : 0;
  console.log(`  ${padR(NAME[att], 8)} army ${armies.reduce((a, b) => a + b, 0)} × ${load} load → ~${Math.round(haul[att]).toLocaleString()} per win`);
}
const plunderChecks: Check[] = [
  {
    ok: haul.human / Math.max(1, haul.dwarf) >= 0.67 && haul.human / Math.max(1, haul.dwarf) <= 1.5,
    text: `Humans' swarm haul is comparable to dwarves' heavy haul (${Math.round(haul.human).toLocaleString()} vs ${Math.round(haul.dwarf).toLocaleString()}, within 1.5×)`
  }
];

/* ------------------------------------------------------------------------- */
/* Walls & sieges: waves to breach a City Hall 25 castle                     */
/* ------------------------------------------------------------------------- */

/** A City Hall 25 human castle with its whole soldier cap home; waves = one City Hall 15 orc march each */
const SIEGE = { defCiv: "human" as CivilizationType, attCiv: "orc" as CivilizationType, attLevel: 15 };
function wavesToBreach(wallTier: number, reinforcements: number, gap: number, runs = 10): number {
  let total = 0;
  for (let run = 0; run < runs; run++) {
    const g = soldierCapOf(SIEGE.defCiv, 25);
    const d = fortress(SIEGE.defCiv, g, wallTier);
    d.reinforcements = reinforcements
      ? [{ marchId: "r1", ownerId: "ally", ownerName: "ally", civ: SIEGE.defCiv, count: reinforcements, initialCount: reinforcements, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0 }]
      : [];
    let waves = 0;
    const army = [capOf(SIEGE.attCiv, SIEGE.attLevel)];
    while (totalDefenders(d) > 0 && waves < 200) {
      waves++;
      // Each wave is one live battle; `gap` > 0 = its marches trickle in one per `gap` rounds instead of together
      const rng = seededRandom(`siege-${wallTier}-${reinforcements}-${gap}-${run}-${waves}`);
      const stacks: LiveAttackerStack[] = [];
      d.roundsFought = 0;
      for (let round = 1; round <= COMBAT.MAX_ROUNDS + gap * army.length && totalDefenders(d) > 0; round++) {
        if (gap === 0 ? round === 1 : (round - 1) % gap === 0 && stacks.length < army.length) {
          for (const n of gap === 0 ? army : [army[stacks.length]]) {
            stacks.push({ marchId: `w${stacks.length}`, attackerId: "x", attackerName: "x", civ: SIEGE.attCiv, count: n, initialCount: n, joinedRound: round, roundsFought: 0, carryDamageTaken: 0, totalDamageDealt: 0, totalLosses: 0 });
          }
        }
        const present = stacks.filter((st) => st.count > 0 && st.roundsFought < COMBAT.MAX_ROUNDS);
        if (present.length === 0) {
          if (stacks.length >= army.length) break;
          continue;
        }
        stepBattleRound(round, present, d, rng);
      }
    }
    total += waves;
  }
  return total / runs;
}
const reinf = capOf(SIEGE.defCiv, 25) * 2;
line(`Sieges — waves of one City Hall ${SIEGE.attLevel} ${NAME[SIEGE.attCiv]} march (${capOf(SIEGE.attCiv, SIEGE.attLevel)}) to breach a City Hall 25 ${NAME[SIEGE.defCiv]} castle (${soldierCapOf(SIEGE.defCiv, 25)} home)`);
console.log(`  ${padR("walls", 10)}${pad("waves", 11)}${pad("+2 allied marches", 19)}`);
const siege: Record<number, number> = {};
for (const tier of [0, 3, 5]) {
  siege[tier] = wavesToBreach(tier, 0, 0);
  console.log(`  ${padR(`tier ${tier}`, 10)}${pad(siege[tier].toFixed(1), 11)}${pad(wavesToBreach(tier, reinf, 0).toFixed(1), 19)}`);
}

/** The civ each attacker beats in the design chart (its "win" defender) */
const RALLY_VICTIM: Record<string, CivilizationType> = { human: "elf", orc: "human", dwarf: "orc", elf: "human" };
const fullRallyWins: Record<string, number> = {};
for (const att of MORTALS) {
  const def = RALLY_VICTIM[att];
  let wins = 0;
  for (let seed = 0; seed < 10; seed++) {
    const d = fortress(def, Math.round(soldierCapOf(def, 25) * DEFENDER_HOME_SHARE), 5);
    if (liveFight(att, Array(6).fill(capOf(att, 20)), d, 1 + RALLY_COORDINATION_ATK * 5, `fullrally-${att}-${seed}`, TWEAKS.titles, 1, null, true).won) wins++;
  }
  fullRallyWins[att] = wins / 10;
}
console.log(`  Full City Hall 20 rally (leader + 5) vs a City Hall 25 tier-5 castle (${DEFENDER_HOME_SHARE * 100}% of its soldier cap home): ${MORTALS.map((a) => `${NAME[a]}→${NAME[RALLY_VICTIM[a]]} ${Math.round(fullRallyWins[a] * 100)}%`).join(" · ")}`);
const wallChecks: Check[] = [
  {
    ok: siege[5] / siege[0] >= 1.5 && siege[5] / siege[0] <= 3,
    text: `Tier-5 walls roughly double the waves a swarm needs (${siege[0].toFixed(1)} → ${siege[5].toFixed(1)}, ×${(siege[5] / siege[0]).toFixed(2)}; target ×1.5–3)`
  },
  {
    ok: MORTALS.every((a) => fullRallyWins[a] >= 0.5),
    text: `A full City Hall 20 rally breaches a tier-5 City Hall 25 castle of the civ it beats (${MORTALS.map((a) => `${NAME[a]} ${Math.round(fullRallyWins[a] * 100)}%`).join(", ")})`
  }
];

/* ------------------------------------------------------------------------- */
/* Wall HP & burning                                                         */
/* ------------------------------------------------------------------------- */

/** Waves of one City Hall 10 march until a castle (half its soldier cap home) burns */
function wavesToBurn(attCiv: CivilizationType, defCiv: CivilizationType, defLevel: number, wallTier: number): number {
  const maxHp = wallMaxHpFor(defLevel, wallTier);
  let hp = maxHp;
  const d = fortress(defCiv, Math.round(soldierCapOf(defCiv, defLevel) * DEFENDER_HOME_SHARE), wallTier);
  for (let wave = 1; wave <= 60; wave++) {
    d.roundsFought = 0;
    hp -= liveFight(attCiv, [capOf(attCiv, 10)], d, 1, `burn-${attCiv}-${defCiv}-${defLevel}-${wallTier}-${wave}`).wallDamage;
    if (hp <= maxHp * WALL_BURN_THRESHOLD) return wave;
  }
  return 61;
}
line("Burning — waves of one City Hall 10 march until a castle's walls burn (≤ 25% HP)");
const burnSmall: Record<string, number> = {};
for (const att of ["human", "orc"] as CivilizationType[]) {
  const cells = [1, 3, 5].map((l) => {
    const w = wavesToBurn(att, att === "human" ? "elf" : "human", l, 0);
    burnSmall[`${att}-${l}`] = w;
    return `CH${l}: ${w}`;
  });
  console.log(`  ${padR(NAME[att], 8)} vs ${NAME[att === "human" ? "elf" : "human"]} tier 0 → ${cells.join(" · ")} · CH25 tier 5: ${wavesToBurn(att, att === "human" ? "elf" : "human", 25, 5)}`);
}
const burnProtectionH = WALL_BURN_REPAIR_MS / 3_600_000;
console.log(`  A castle burned to 0% is protected for ${burnProtectionH} h (repair to ${WALL_UNBURN_SHARE * 100}%); a swarm camping it can burn it again right after → at most ${Math.ceil(24 / burnProtectionH)} burns a day.`);
const burnChecks: Check[] = [
  {
    ok: Object.values(burnSmall).every((w) => w <= 2),
    text: `City Hall 1–5 castles burn within 1–2 medium waves (${Object.entries(burnSmall).map(([k, w]) => `${k} ${w}`).join(", ")})`
  },
  { ok: burnProtectionH >= 8, text: `Burning protects a castle for at least 8 h (${burnProtectionH} h)` }
];

/* ------------------------------------------------------------------------- */
/* NPC kingdoms: recovery after a failed rally (births of the donor civ)     */
/* ------------------------------------------------------------------------- */

line("NPC kingdoms — time to regrow the garrison a failed rally of 4 City Hall 15 rulers killed (City Hall 15 kingdom)");
const recovery: Record<string, number> = {};
for (const donor of MORTALS) {
  const g = maxSoldiersFor(calculateMaxPopulation(15, donor), donor);
  const attacker = MORTALS.find((a) => a !== donor && DESIGN_CHART[a][donor] !== "win") ?? "human";
  const d = fortress(donor, g, npcWallTierFor(15));
  liveFight(attacker, Array(4).fill(capOf(attacker, 15)), d, 1 + RALLY_COORDINATION_ATK * 3, `recover-${donor}`, TWEAKS.titles, 1, null, true);
  const lost = g - d.count;
  recovery[donor] = harvestsToRegrow(donor, 15, lost);
  console.log(`  ${padR(NAME[donor], 8)} lost ${lost.toLocaleString()} of ${g.toLocaleString()} to a ${NAME[attacker]} rally → back in ${hoursOf(recovery[donor])}`);
}
const recoveryChecks: Check[] = [
  {
    ok: MORTALS.every((c) => Number.isFinite(recovery[c]) && (recovery[c] * 15) / 60 <= 7 * 24),
    text: `Every NPC kingdom regrows a lost garrison within a week (slowest ${hoursOf(Math.max(...MORTALS.map((c) => recovery[c])))})`
  }
];

// 🩸 The Blood Moon's omen: every round fought under it (mobs and bandits below, bosses with the disasters)
setDisasterCalendar([{ id: 1, kind: "blood_moon", startsAt: 0, endsAt: Number.MAX_SAFE_INTEGER }]);
const bloodOmen = battleOmenAt(1)!;
setDisasterCalendar([]);

/* ------------------------------------------------------------------------- */
/* Mobs & bandits (roving spawns)                                            */
/* ------------------------------------------------------------------------- */

/**
 * Win rate and average losses of `armies` of `civ` against a full pack of `type` (its template tier): as it fights
 * today (its kit, its HP and ATK trimmed by the kit's worth) or `kitless` (the table's stats and no kit, as every pack
 * fought before kits). The same seeds either way, so the two are compared fight for fight.
 */
function packFight(civ: CivilizationType, armies: number[], type: string, rarity: string, runs = 6, opts: { kitless?: boolean; omen?: BattleOmen | null } = {}) {
  const u = worldNpcUnitFor(type, opts.kitless);
  const size = worldNpcPackSize(type, rarity);
  const kit = opts.kitless ? undefined : npcKitFor(type, rarity as UnitRarity);
  let wins = 0;
  let lossShare = 0;
  const total = armies.reduce((a, b) => a + b, 0);
  for (let run = 0; run < runs; run++) {
    const d: LiveDefenderState = {
      civ,
      count: size,
      initialCount: size,
      fortified: false,
      roundsFought: 0,
      carryDamageTaken: 0,
      totalLosses: 0,
      unit: { hp: u.hp, atk: u.atk, def: u.def },
      traits: u.traits,
      kit,
      npc: { type, category: type.startsWith("bandit-") ? "bandit" : "mob", rarity: rarity as NPCRarity, emblem: "", unitName: u.name, expiresAt: null }
    };
    const r = liveFight(civ, armies, d, 1, `pack-${civ}-${type}-${total}-${run}`, TWEAKS.titles, 1, opts.omen ?? null);
    if (r.won) wins++;
    lossShare += r.lost / total;
  }
  return { w: wins / runs, loss: lossShare / runs };
}
const PACK_TARGETS: Record<string, { level: number; slots: "one" | "all"; minWin: number; maxLoss: number; text: string }> = {
  common: { level: 5, slots: "one", minWin: 1, maxLoss: 0.35, text: "one City Hall 5 march wins, losing < 35%" },
  uncommon: { level: 8, slots: "one", minWin: 1, maxLoss: 0.5, text: "one City Hall 8 march wins, losing < 50%" },
  rare: { level: 12, slots: "all", minWin: 1, maxLoss: 0.5, text: "a City Hall 12 ruler with every slot wins, losing < 50%" },
  epic: { level: 15, slots: "all", minWin: 1, maxLoss: 0.6, text: "a City Hall 15 ruler with every slot wins, losing < 60%" }
};
const EPIC_TOO_STRONG_FOR = { level: 5 };
line("Mobs & bandits — each spawn's full pack against the army its tier is meant for (win% / losses, per civ)");
console.log(`  ${padR("", 32)}${ALL.map((c) => pad(NAME[c], 13)).join("")}`);
const packFails: string[] = [];
const epicSoloLosses: string[] = [];
for (const t of DYNAMIC_15M_TEMPLATES.filter((x) => x.category === "mob" || x.category === "bandit")) {
  const tier = t.rarity === "legendary" ? "epic" : t.rarity ?? "common";
  const target = PACK_TARGETS[tier];
  const cells = ALL.map((civ) => {
    // Elves field tiny elite armies: from rare up their target counts two rulers (a rally of two)
    const base = target.slots === "one" ? [capOf(civ, target.level)] : allSlots(civ, target.level);
    const armies = civ === "elf" && (tier === "rare" || tier === "epic") ? [...base, ...base] : base;
    const r = packFight(civ, armies, t.type, t.rarity ?? "common");
    const ok = r.w >= target.minWin && r.loss <= target.maxLoss;
    if (!ok) packFails.push(`${t.type} (${tier}) vs ${NAME[civ]}: ${Math.round(r.w * 100)}% / −${Math.round(r.loss * 100)}%`);
    if (tier === "epic") {
      const solo = packFight(civ, [capOf(civ, EPIC_TOO_STRONG_FOR.level)], t.type, t.rarity ?? "epic", 3);
      if (solo.w > 0) epicSoloLosses.push(`${t.type} vs ${NAME[civ]}`);
    }
    return pad(`${Math.round(r.w * 100)}% −${Math.round(r.loss * 100)}%${ok ? "" : " ✗"}`, 13);
  });
  console.log(`  ${padR(`${t.type} (${tier}, ${worldNpcPackSize(t.type, t.rarity)})`, 32)}${cells.join("")}`);
}
console.log(`  Targets: ${Object.entries(PACK_TARGETS).map(([k, v]) => `${k} — ${v.text}`).join("; ")} (elves: two rulers for rare and epic); epic packs beat a lone City Hall ${EPIC_TOO_STRONG_FOR.level} march.`);

// Battle Arts on packs: a kit reshapes a pack, it never makes it harder to beat. Every pack against the army its tier is
// meant for and against half of it (a march that only just wins), as it fights today and as it fought before kits; and
// both again under the Blood Moon (+${Math.round((bloodOmen.npcStatMult - 1) * 100)}% HP, ATK and DEF for the wild)
/** Losses may come out this much higher with a kit and still count as the same (the noise of 6 seeded fights) */
const KIT_LOSS_SLACK = 0.02;
line("Mobs & bandits — Battle Arts kits: armies' losses before kits → with them (worst civ; target army · half of it · Blood Moon)");
console.log(`  ${padR("", 22)}${padR("kit (Instincts · Arts)", 46)}${pad("target", 12)}${pad("half", 12)}${pad("Blood Moon", 14)}`);
const kitHarder: string[] = [];
const moonLost: string[] = [];
// Packs the Blood Moon already made too strong for their target army before kits (said, not the kit's doing)
const moonAlready: string[] = [];
const kitProblemsSeen: string[] = [];
for (const t of DYNAMIC_15M_TEMPLATES.filter((x) => x.category === "mob" || x.category === "bandit")) {
  const tier = t.rarity === "legendary" ? "epic" : t.rarity ?? "common";
  const target = PACK_TARGETS[tier];
  const kit = npcKitFor(t.type, (t.rarity ?? "common") as UnitRarity);
  if (!kit) kitProblemsSeen.push(`${t.type}: no kit`);
  else kitProblemsSeen.push(...kitProblems(kit), ...(kit.boss ? [`${t.type}: a boss kit`] : []));
  const worst: Record<"target" | "half" | "moon", number[] | null> = { target: null, half: null, moon: null };
  for (const civ of ALL) {
    const base = target.slots === "one" ? [capOf(civ, target.level)] : allSlots(civ, target.level);
    const armies = civ === "elf" && (tier === "rare" || tier === "epic") ? [...base, ...base] : base;
    const half = armies.map((n) => Math.max(1, Math.floor(n / 2)));
    const cases = [
      { key: "target" as const, armies, omen: null },
      { key: "half" as const, armies: half, omen: null },
      { key: "moon" as const, armies, omen: bloodOmen }
    ];
    for (const c of cases) {
      const before = packFight(civ, c.armies, t.type, t.rarity ?? "common", 6, { kitless: true, omen: c.omen });
      const now = packFight(civ, c.armies, t.type, t.rarity ?? "common", 6, { omen: c.omen });
      const w = worst[c.key];
      if (!w || now.loss - before.loss > w[1] - w[0]) worst[c.key] = [before.loss, now.loss];
      if (now.w < before.w || now.loss > before.loss + KIT_LOSS_SLACK) kitHarder.push(`${t.type} vs ${NAME[civ]} (${c.key}): ${Math.round(before.w * 100)}% −${Math.round(before.loss * 100)}% → ${Math.round(now.w * 100)}% −${Math.round(now.loss * 100)}%`);
      if (c.key === "moon" && now.w < target.minWin) (before.w >= target.minWin ? moonLost : moonAlready).push(`${t.type} vs ${NAME[civ]} ${Math.round(now.w * 100)}%`);
    }
  }
  const cell = (w: number[] | null) => (w ? `${Math.round(w[0] * 100)}→${Math.round(w[1] * 100)}%` : "—");
  const kitText = kit ? [...kit.instincts.map((id) => INSTINCTS[id]?.name ?? id), "·", ...kit.arts.map((id) => ARTS[id]?.name ?? id)].join(" ") : "—";
  console.log(`  ${padR(`${t.type} (${tier})`, 22)}${padR(kitText.slice(0, 44), 46)}${pad(cell(worst.target), 12)}${pad(cell(worst.half), 12)}${pad(cell(worst.moon), 14)}`);
}
console.log(`  Each kit's worth comes off the pack's HP and ATK (warConfig npcKitWorth: offence off ATK, defence off HP; an Art ×${1 + NPC_ART_WORTH}, a first-round opener ×${1 + NPC_OPENER_WORTH}, a guard ×${1 + NPC_GUARD_WORTH}, Enrage ×${1 + NPC_ENRAGE_WORTH}). "Worst civ": the civ whose losses rose most (or fell least).`);
if (moonAlready.length) console.log(`  Under the Blood Moon, before kits and with them alike, the target army falls short against: ${moonAlready.join(", ")}.`);
const mobChecks: Check[] = [
  { ok: packFails.length === 0, text: `Every mob / bandit pack falls to the army its tier is meant for${packFails.length ? ` — off: ${packFails.slice(0, 6).join("; ")}${packFails.length > 6 ? ` (+${packFails.length - 6})` : ""}` : ""}` },
  { ok: kitProblemsSeen.length === 0, text: `Every mob and bandit carries a kit sized by its spawn's rarity, and none is a boss's${kitProblemsSeen.length ? ` — ${kitProblemsSeen.join("; ")}` : ""}` },
  { ok: kitHarder.length === 0, text: `A Battle Arts kit makes no pack harder to beat: no army wins less or loses more than ${Math.round(KIT_LOSS_SLACK * 100)} points over the pack without it (target army, half of it, Blood Moon)${kitHarder.length ? ` — off: ${kitHarder.slice(0, 6).join("; ")}${kitHarder.length > 6 ? ` (+${kitHarder.length - 6})` : ""}` : ""}` },
  { ok: moonLost.length === 0, text: `Under the Blood Moon every pack with its kit falls to the army its tier is meant for wherever it fell before kits${moonLost.length ? ` — off: ${moonLost.join("; ")}` : ""}` },
  { ok: epicSoloLosses.length === 0, text: `Epic packs beat a lone City Hall ${EPIC_TOO_STRONG_FOR.level} march${epicSoloLosses.length ? ` — too weak: ${epicSoloLosses.join(", ")}` : ""}` }
];

/* ------------------------------------------------------------------------- */
/* World disasters                                                            */
/* ------------------------------------------------------------------------- */

// 🩸 Blood Moon: every round of the rally's battles fought under it
line(`World disasters — Blood Moon: rally of 4 City Hall ${BOSS_LEVEL} rulers, tries to kill (today → under the Blood Moon)`);
console.log(`  ${padR("boss", 16)}${MORTALS.map((c) => pad(NAME[c], 14)).join("")}`);
const bloodFails: string[] = [];
let bloodWorst = 0;
for (const row of bossRows) {
  const cells = MORTALS.map((civ) => {
    const today = row.rally[civ].attempts;
    const moon = bossAttempts(civ, 4, row.type, BOSS_LEVEL, 0, bloodOmen).attempts;
    bloodWorst = Math.max(bloodWorst, moon);
    const ok = moon <= 60 && moon <= today * 2 + 2;
    if (!ok) bloodFails.push(`${row.type.replace("boss-", "")} vs ${NAME[civ]} ${today} → ${moon > 60 ? "never" : moon}`);
    return pad(`${today} → ${moon > 60 ? "never" : moon}${ok ? "" : " ✗"}`, 14);
  });
  console.log(`  ${padR(row.type.replace("boss-", ""), 16)}${cells.join("")}`);
}
console.log(`  Orcs fight with ×${bloodOmen.civAtkMult.orc} ATK and Elves ×${bloodOmen.civAtkMult.elf} under it; NPC realms and rulers' castles are untouched.`);

// 🌪️ Tempest Roads against what a march spends on round-trip rations (City Hall 12, one full march)
line("World disasters — Tempest Roads: marchers lost setting off vs. round-trip rations (City Hall 12, one full march)");
const TEMPEST_LEVEL = 12;
/** Typical march lengths (map units, at today's world scale: the same trips as 60 / 120 / 200 before the realm grew) */
const DISTANCES = [60, 120, 200].map((d) => Math.round(d * WORLD_SCALE));
console.log(`  ${padR("civ", 12)}${pad("march", 8)}${pad("lost (avg, max)", 20)}${pad("lost at mob. cost", 20)}${DISTANCES.map((d) => pad(`rations ${d}u`, 14)).join("")}`);
const tempestFails: string[] = [];
let tempestMax = 0;
for (const civ of ALL) {
  const army = capOf(civ, TEMPEST_LEVEL);
  const shares = Array.from({ length: 400 }, (_, i) => tempestLossShare({ id: 1, kind: "tempest", startsAt: 0, endsAt: 1 }, civ, `sim-${civ}-${i}`));
  const avg = shares.reduce((a, b) => a + b, 0) / shares.length;
  const max = Math.max(...shares);
  tempestMax = Math.max(tempestMax, max);
  const lostFood = Math.round(army * avg * (MOBILIZATION_COST.food + MOBILIZATION_COST.iron));
  const rations = DISTANCES.map((d) => Math.round(army * 2 * Math.max(1, Math.round(d / MARCH.UNITS_PER_RATION_TICK)) * MARCH.FOOD_PER_SOLDIER_PER_TICK * MARCH_RATION_MULT[civ]));
  if (max > 0.2) tempestFails.push(`${NAME[civ]} loses up to ${Math.round(max * 100)}%`);
  if (lostFood > rations[1]) tempestFails.push(`${NAME[civ]}: ${lostFood} at mobilization cost > ${rations[1]} rations at ${DISTANCES[1]}u`);
  console.log(
    `  ${padR(NAME[civ], 12)}${pad(army, 8)}${pad(`${Math.round(army * avg)} (${(avg * 100).toFixed(1)}%), ${Math.floor(army * max)}`, 20)}${pad(lostFood, 20)}${rations.map((r) => pad(r, 14)).join("")}`
  );
}
console.log(`  Elves cope (½), Dwarves suffer (×2). Mobilization cost: ${MOBILIZATION_COST.food} food + ${MOBILIZATION_COST.iron} iron a soldier.`);

// The schedule over a year of realm days
const YEAR_FROM = Date.parse("2026-10-04T00:00:00Z");
const yearEnd = new Date(YEAR_FROM + 364 * 86_400_000).toISOString().slice(0, 10);
const year = rollDisasterSchedule(yearEnd, "Asia/Manila");
const perWeek = new Map<number, number>();
for (const d of year) {
  const week = Math.floor((Date.parse(`${d.day}T00:00:00Z`) - YEAR_FROM) / (7 * 86_400_000));
  perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
}
const weekCounts = Array.from({ length: 52 }, (_, w) => perWeek.get(w) ?? 0);
const hourOf = (ms: number) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms)).split(":").map(Number);
  return h + m / 60;
};
const hours = year.map((d) => hourOf(d.startsAt));
const sameDay = new Set(year.map((d) => dateKeyIn(d.startsAt, "Asia/Manila"))).size !== year.length;
const morning = hours.filter((h) => h < DISASTER_SCHEDULE.MORNING_TO).length / Math.max(1, hours.length);
const byKind = Object.keys(DISASTERS).map((k) => `${k} ${year.filter((d) => d.kind === k).length}`);
line("World disasters — the schedule over a year (REALM_TIMEZONE Asia/Manila)");
console.log(`  ${year.length} disasters in 52 weeks (${(year.length / 52).toFixed(2)} a week); weeks with 1 / 2 / 3: ${[1, 2, 3].map((n) => weekCounts.filter((c) => c === n).length).join(" / ")}`);
console.log(`  Starts ${Math.min(...hours).toFixed(2)}–${Math.max(...hours).toFixed(2)} h realm time, ${Math.round(morning * 100)}% before ${DISASTER_SCHEDULE.MORNING_TO}:00; by kind: ${byKind.join(", ")}`);
const scheduleOk =
  weekCounts.every((c) => c >= 1 && c <= DISASTER_SCHEDULE.MAX_PER_WEEK) && !sameDay && Math.min(...hours) >= DISASTER_SCHEDULE.START_FROM && Math.max(...hours) <= DISASTER_SCHEDULE.START_TO;
const disasterMirrorOk =
  JSON.stringify(CLIENT_DISASTER_EFFECTS) === JSON.stringify(DISASTER_EFFECTS) &&
  Object.values(DISASTERS).every((d) => {
    const c = CLIENT_DISASTERS[d.kind];
    return c && c.name === d.name && c.copes === d.copes && c.suffers === d.suffers && c.effect === d.effect && c.copeText === d.copeText && c.sufferText === d.sufferText;
  });
const disasterChecks: Check[] = [
  { ok: bloodFails.length === 0, text: `Blood Moon: the rally of 4 that kills each boss today still kills it, in at most twice its tries +2 (worst ${bloodWorst})${bloodFails.length ? ` — off: ${bloodFails.join("; ")}` : ""}` },
  { ok: tempestFails.length === 0, text: `Tempest Roads: a march loses at most a fifth (worst ${Math.round(tempestMax * 100)}%), and less at mobilization cost than its round-trip rations${tempestFails.length ? ` — off: ${tempestFails.join("; ")}` : ""}` },
  { ok: scheduleOk, text: `Disaster schedule: 1–${DISASTER_SCHEDULE.MAX_PER_WEEK} every week, never two a day, starts ${DISASTER_SCHEDULE.START_FROM}:00–${DISASTER_SCHEDULE.START_TO}:00 realm time` },
  { ok: disasterMirrorOk, text: `Client copy of the disaster rules (src/utils/disasters.ts) matches the server${disasterMirrorOk ? "" : " — copy disasterRules.ts over"}` }
];

/* ------------------------------------------------------------------------- */
/* 12. Mercenaries                                                           */
/* ------------------------------------------------------------------------- */

/** A band lands on its rarity's power within this share */
const MERC_POWER_TOLERANCE = 0.06;
/**
 * Bands take the march slots a ruler's soldiers can't fill: the army with them may score at most this much more than
 * the same soldiers plus plain marches worth the bands' power (a band adds its power and no more). The margin is for
 * Arts that weaken the enemy (Sunder, Paralyze): they spare the soldiers beside the band too
 */
const MERC_ARMY_SLACK = 1.1;
const MERC_LEVELS = [25, 12];
/** A ruler's full march (what a band's power counts from): their soldier cap over their slots, at most their capacity */
const fullOf = (civ: CivilizationType, level: number) => fullMarchFor(calculateMaxPopulation(level, civ), civ, marchSlotsForLevel(level));
line(`Mercenaries — each band's power (× its hirer's full march, Arts included; target ±${MERC_POWER_TOLERANCE * 100}%)`);
console.log(`  ${padR("", 14)}${MERC_RARITIES.map((r) => pad(`${r} ${MERC_RULES[r].power}×`, 18)).join("")}`);
const mercOff: string[] = [];
for (const level of MERC_LEVELS) {
  for (const civ of ALL) {
    const cap = fullOf(civ, level);
    const cells = MERC_RARITIES.map((r) => {
      // Only what a ruler at this City Hall may hire
      if (MERC_RULES[r].minSlots > marchSlotsForLevel(level)) return pad("—", 18);
      const p = bandPower(civ, r, cap).power;
      const ok = Math.abs(p / MERC_RULES[r].power - 1) <= MERC_POWER_TOLERANCE;
      if (!ok) mercOff.push(`${NAME[civ]} ${r} CH${level} ${p.toFixed(2)}× (BAND_COUNT_MULT ${civ}.${r} → ${calibrateBand(civ, r, cap)})`);
      return pad(`${p.toFixed(2)}× ${ok ? "✓" : "✗"}`, 18);
    });
    console.log(`  ${padR(`${NAME[civ]} CH${level}`, 14)}${cells.join("")}`);
  }
}

/**
 * The soldiers a ruler actually has (their soldier cap at full population) in as few marches as hold them, each up to its
 * capacity: at City Hall 25 no civilization fills all 5 slots
 */
const ownSoldiers = (civ: CivilizationType, level: number) => {
  const soldiers = soldierCapOf(civ, level);
  const n = Math.min(marchSlotsForLevel(level), Math.ceil(soldiers / capOf(civ, level)));
  return soldierMarches(civ, n, Math.floor(soldiers / n));
};
/** The best bands a ruler holds in the slots their soldiers leave free (legendary first, then epic; at most their band cap) */
const freeSlotBands = (civ: CivilizationType, level: number): MercRarity[] => {
  const slots = marchSlotsForLevel(level);
  const free = slots - ownSoldiers(civ, level).length;
  const best = (["legendary", "epic", "rare", "uncommon", "common"] as MercRarity[]).filter((r) => MERC_RULES[r].minSlots <= slots);
  const n = Math.max(0, Math.min(free, bandCapForSlots(slots)));
  // Two of the best rarity a ruler can hire (a legendary + an epic, or two epics at 4 slots)
  return [best[0], best[1] ?? best[0]].slice(0, n);
};
/** A ruler's army: their own soldiers, and their best bands in the slots the soldiers can't fill */
const bandArmy = (civ: CivilizationType, level: number) => {
  const full = fullOf(civ, level);
  return [...ownSoldiers(civ, level), ...freeSlotBands(civ, level).map((r, i) => ({ ...bandStack(civ, r, full), marchId: `b${i}` }))];
};
line(`Mercenaries — City Hall 25: the ruler's own soldiers in the marches they fill, the 2 best bands in the slots left over (at most ×${MERC_ARMY_SLACK} what the same soldiers + plain marches worth the bands' power score)`);
const armyRatios = {} as Record<CivilizationType, number>;
const armyPlain = {} as Record<CivilizationType, number>;
for (const civ of ALL) {
  const full = fullOf(civ, 25);
  const bands = freeSlotBands(civ, 25);
  const soldiers = () => ownSoldiers(civ, 25);
  armyRatios[civ] = armyRatio(civ, () => bandArmy(civ, 25), soldiers);
  // The yardstick: each band replaced by plain soldiers worth its power (its power × a full march)
  armyPlain[civ] = armyRatio(civ, () => [...soldiers(), ...bands.map((r, i) => ({ ...soldierMarches(civ, 1, Math.round(full * MERC_RULES[r].power))[0], marchId: `p${i}` }))], soldiers);
  const filled = soldierCapOf(civ, 25) / capOf(civ, 25);
  console.log(
    `  ${padR(NAME[civ], 14)}soldiers fill ${filled.toFixed(1)} of ${marchSlotsForLevel(25)} marches (${ownSoldiers(civ, 25).map((m) => m.count).join(" / ")}) · bands ${bands.join(" + ")} at ${full} a full march: ${pct(armyRatios[civ] - 1)} over the soldiers alone (plain marches worth them: ${pct(armyPlain[civ] - 1)})`
  );
}

/** Battles one City Hall 25 ruler needs to kill a fresh boss (fresh armies each battle, the boss keeps its wounds), and the first battle's share */
function bossSoloArmy(civ: CivilizationType, type: string, army: () => LiveAttackerStack[]): { battles: number; first: number } {
  const u = bossUnitFor(type);
  let hp = u.hp;
  let first = 0;
  for (let battle = 1; battle <= 40; battle++) {
    const def = bossDefender(type, hp);
    fightArmy(army(), def, `merc-boss-${civ}-${type}-${battle}`, bossDamageMult(25, civ), BAND_BOSS_DAMAGE);
    const after = def.count <= 0 ? 0 : u.hp * (def.count - def.carryDamageTaken);
    if (battle === 1) first = (hp - after) / u.hp;
    hp = after;
    if (hp <= 0) return { battles: battle, first };
  }
  return { battles: 41, first };
}
line(`Mercenaries — world bosses: a lone City Hall 25 ruler's soldiers at best (every slot, or in the marches they fill) vs the same soldiers + the 2 best bands in the free slots, landing ${BAND_BOSS_DAMAGE * 100}% of their blows (first battle's share · battles to kill, avg)`);
const bossOneShots: string[] = [];
const soldierOneShots: string[] = [];
for (const civ of ALL) {
  // The ruler's best without bands: every slot, or the same soldiers in the marches they fill
  const best = (a: ReturnType<typeof bossSoloArmy>, b: ReturnType<typeof bossSoloArmy>) => (a.battles < b.battles || (a.battles === b.battles && a.first >= b.first) ? a : b);
  const runs = Object.keys(BOSS_UNITS).map((t) => ({
    t,
    plain: best(bossSoloArmy(civ, t, () => allSlots(civ, 25).map((n, i) => ({ ...soldierMarches(civ, 1, n)[0], marchId: `a${i}` }))), bossSoloArmy(civ, t, () => ownSoldiers(civ, 25))),
    bands: bossSoloArmy(civ, t, () => bandArmy(civ, 25))
  }));
  for (const r of runs) {
    if (r.bands.battles <= 1) bossOneShots.push(`${NAME[civ]} ${r.t.replace("boss-", "")}`);
    if (r.plain.battles <= 1) soldierOneShots.push(`${NAME[civ]} ${r.t.replace("boss-", "")}`);
  }
  const avg = (f: (x: (typeof runs)[number]) => number) => runs.reduce((a, x) => a + f(x), 0) / runs.length;
  console.log(
    `  ${padR(NAME[civ], 14)}soldiers ${pad(`${Math.round(avg((x) => x.plain.first) * 100)}% · ${avg((x) => x.plain.battles).toFixed(1)}`, 12)}   with bands ${pad(`${Math.round(avg((x) => x.bands.first) * 100)}% · ${avg((x) => x.bands.battles).toFixed(1)}`, 12)}   (worst first battle ${Math.round(Math.max(...runs.map((x) => x.bands.first)) * 100)}%)`
  );
}

/** A band on its hirer's walls lands on its rarity's power within this share (it adds what it is worth to the castle, no more) */
const WALL_POWER_TOLERANCE = 0.1;
line(`Mercenaries — on the walls: each band defending its hirer's castle (× the same full march of soldiers on the same walls, Arts included; target ±${WALL_POWER_TOLERANCE * 100}%)`);
const wallOff: string[] = [];
for (const level of MERC_LEVELS) {
  for (const civ of ALL) {
    const cap = fullOf(civ, level);
    const cells = MERC_RARITIES.map((r) => {
      if (MERC_RULES[r].minSlots > marchSlotsForLevel(level)) return pad("—", 18);
      const p = wallPower(civ, r, cap);
      const ok = Math.abs(p / MERC_RULES[r].power - 1) <= WALL_POWER_TOLERANCE;
      if (!ok) wallOff.push(`${NAME[civ]} ${r} CH${level} ${p.toFixed(2)}×`);
      return pad(`${p.toFixed(2)}× ${ok ? "✓" : "✗"}`, 18);
    });
    console.log(`  ${padR(`${NAME[civ]} CH${level}`, 14)}${cells.join("")}`);
  }
}

line("Mercenaries — prices, upkeep and kits");
for (const r of MERC_RARITIES) {
  const rule = MERC_RULES[r];
  const cost = (c: Record<string, number | undefined>) => Object.entries(c).map(([k, v]) => `${(v ?? 0).toLocaleString()} ${k}`).join(", ");
  console.log(`  ${padR(r, 10)} ${rule.models} models · ${rule.power}× · ${rule.minSlots}+ slots · hire ${cost(rule.price)} · upkeep ${cost(rule.upkeep)} a harvest · ${BATTLE_PAY.name.toLowerCase()} ${cost(battlePayFor(r))} a fight · heals in ${rule.healFullMs / 3_600_000} h from 0%`);
}
const kitOff = ALL.flatMap((civ) => MERC_RARITIES.flatMap((r) => kitProblems(mercKitFor(civ, r)).map((p) => `${NAME[civ]} ${r}: ${p}`)));
const poolOff = ALL.flatMap((civ) =>
  MERC_RARITIES.flatMap((r: MercRarity) => {
    const sv = MERC_POOLS[civ].find((d) => d.rarity === r);
    const cl = (MERCENARY_POOLS[civ] ?? []).find((d) => d.rarity === r);
    return sv && cl && sv.type === cl.type && sv.name === cl.name && sv.emblem === cl.emblem && MERCENARY_BAND_SIZE[r] === MERC_RULES[r].models ? [] : [`${NAME[civ]} ${r}`];
  })
);
const mercMirrorOk = JSON.stringify(CLIENT_MERC_RULES) === JSON.stringify(MERC_RULES) && CLIENT_HEAL_PRICE_SHARE === HEAL_PRICE_SHARE && CLIENT_BAND_BOSS_DAMAGE === BAND_BOSS_DAMAGE && JSON.stringify(CLIENT_CIV_BOSS_DAMAGE) === JSON.stringify(CIV_BOSS_DAMAGE) && [1, 2, 3, 4, 5].every((n) => clientBandCap(n) === bandCapForSlots(n)) && JSON.stringify(CLIENT_BATTLE_PAY) === JSON.stringify(BATTLE_PAY) && MERC_RARITIES.every((r) => JSON.stringify(clientBattlePay(r)) === JSON.stringify(battlePayFor(r)));
const mercChecks: Check[] = [
  { ok: mercOff.length === 0, text: `Mercenaries: every band lands on its power (${MERC_RARITIES.map((r) => `${MERC_RULES[r].power}×`).join(" / ")}) within ±${MERC_POWER_TOLERANCE * 100}%, Arts included${mercOff.length ? ` — off: ${mercOff.join(", ")}` : ""}` },
  { ok: wallOff.length === 0, text: `Mercenaries: a band defending its hirer's walls adds its power (${MERC_RARITIES.map((r) => `${MERC_RULES[r].power}×`).join(" / ")} a full march) within ±${WALL_POWER_TOLERANCE * 100}%, Arts included${wallOff.length ? ` — off: ${wallOff.join(", ")}` : ""}` },
  {
    ok: ALL.every((c) => armyRatios[c] <= armyPlain[c] * MERC_ARMY_SLACK),
    text: `Mercenaries: bands in the slots a City Hall 25 ruler's soldiers can't fill add their power and no more (${ALL.map((c) => `${NAME[c]} ${pct(armyRatios[c] - 1)} vs ${pct(armyPlain[c] - 1)} plain`).join(", ")})`
  },
  {
    ok: bossOneShots.length === 0 && soldierOneShots.length === 0,
    text: `World bosses: a lone City Hall 25 ruler never kills a boss in one battle, with their bands (${BAND_BOSS_DAMAGE * 100}% of their blows) or without${CIV_BOSS_DAMAGE.orc ? ` (orcs ${CIV_BOSS_DAMAGE.orc.mult * 100}%: ${CIV_BOSS_DAMAGE.orc.name})` : ""}${[...soldierOneShots, ...bossOneShots].length ? ` — one-shots: soldiers ${soldierOneShots.join(", ") || "none"}; with bands ${bossOneShots.join(", ") || "none"}` : ""}`
  },
  { ok: kitOff.length === 0 && poolOff.length === 0, text: `Mercenaries: every band's kit fits its rarity, and the server's pools match the models (MERCENARY_POOLS, band sizes)${[...kitOff, ...poolOff].length ? ` — off: ${[...kitOff, ...poolOff].join("; ")}` : ""}` },
  { ok: mercMirrorOk, text: `Client copy of the mercenary rules (src/utils/mercenaries.ts) and the civilizations' boss shares (src/utils/war.ts) match the server${mercMirrorOk ? "" : " — copy mercenaryRules.ts's MERC_RULES over"}` }
];

/* ------------------------------------------------------------------------- */
/* 13. The Armory                                                            */
/* ------------------------------------------------------------------------- */

/** A set lands on its rarity's power within this share */
const ARMORY_POWER_TOLERANCE = 0.06;
/** A set's forging cost is worth what its power would cost in extra soldiers, within this share (its upkeep likewise) */
const ARMORY_WORTH_TOLERANCE = 0.15;
const ARMORY_UPKEEP_TOLERANCE = 0.25;
const ARMORY_LEVELS = [25, 12];
line(`Armory — each set's power (a march in it vs the same march in standard gear; target ±${ARMORY_POWER_TOLERANCE * 100}%)`);
console.log(`  ${padR("", 14)}${ARMORY_RARITIES.map((r) => pad(`${r} ${ARMORY_RULES[r].power}×`, 18)).join("")}`);
const armoryOff: string[] = [];
for (const level of ARMORY_LEVELS) {
  for (const civ of ALL) {
    const cap = capOf(civ, level);
    const cells = ARMORY_RARITIES.map((r) => {
      const p = setPower(civ, r, cap);
      const ok = Math.abs(p / ARMORY_RULES[r].power - 1) <= ARMORY_POWER_TOLERANCE;
      if (!ok) armoryOff.push(`${NAME[civ]} ${r} CH${level} ${p.toFixed(3)}× (scale its gains ×${calibrateSet(civ, r, cap)})`);
      return pad(`${p.toFixed(3)}× ${ok ? "✓" : "✗"}`, 18);
    });
    console.log(`  ${padR(`${NAME[civ]} CH${level}`, 14)}${cells.join("")}`);
  }
}
for (const civ of ALL) console.log(`  ${padR(NAME[civ], 12)}${ARMORY_RARITIES.map((r) => `${ARMORY_SETS[civ][r].emblem} ${ARMORY_SETS[civ][r].name} (${setText(ARMORY_SETS[civ][r])})`).join(" · ")}`);

// Worth: forging a set costs what its power would cost in soldiers (a Paid Settler armed), its upkeep what they'd eat
line(`Armory — worth per set: forging vs its power in extra soldiers (${SOLDIER_WORTH.price} food-worth a soldier) · upkeep vs what they'd eat (${SOLDIER_WORTH.upkeep} a harvest)`);
const worthOff: string[] = [];
for (const civ of ALL) {
  const cells = ARMORY_RARITIES.map((r) => {
    const rule = ARMORY_RULES[r];
    const gem = r === "epic" ? EPIC_GEM[civ].per100 * gemWorth(EPIC_GEM[civ].key) : 0;
    const forge = (costWorth(rule.forge) + gem) / 100;
    const soldiers = (rule.power - 1) * SOLDIER_WORTH.price;
    const upkeep = costWorth(rule.upkeep) / 100;
    const eat = (rule.power - 1) * SOLDIER_WORTH.upkeep;
    const f = forge / soldiers;
    const u = upkeep / eat;
    const ok = Math.abs(f - 1) <= ARMORY_WORTH_TOLERANCE && Math.abs(u - 1) <= ARMORY_UPKEEP_TOLERANCE;
    if (!ok) worthOff.push(`${NAME[civ]} ${r}: forge ×${f.toFixed(2)}, upkeep ×${u.toFixed(2)}`);
    return pad(`${Math.round(forge)} vs ${Math.round(soldiers)} · ${upkeep.toFixed(2)} vs ${eat.toFixed(2)} ${ok ? "✓" : "✗"}`, 28);
  });
  console.log(`  ${padR(NAME[civ], 12)}${cells.join("")}`);
}

// The matchup chart with every civilization fully equipped: the attacker's marches in its epic set, the defender's
// garrison in its own (a garrison defends in the sets at home)
const armedPvp: Array<{ ok: boolean; text: string }> = [];
for (const worn of [...new Set([bestSetAt(MID_LEVEL)!, "epic" as ArmoryRarity])]) {
line(`Armory — PvP chart with every civilization fully equipped in its ${worn} set (the attacker's marches and the garrison alike)`);
console.log(`${padR("att \\ def", 12)}${MORTALS.map((c) => pad(NAME[c], 22)).join("")}`);
for (const att of MORTALS) {
  const cells = MORTALS.map((def) => {
    if (att === def) return pad("·", 22);
    const defCount = Math.round(soldierCapOf(def, MID_LEVEL) * DEFENDER_HOME_SHARE);
    const armies = allSlots(att, MID_LEVEL);
    const attTotal = armies.reduce((a, b) => a + b, 0);
    let wins = 0;
    let gap = 0;
    inBestSet(() => {
      for (let seed = 0; seed < SEEDS; seed++) {
        const d: LiveDefenderState = { ...fortress(def, defCount, PVP_WALL_TIER), gear: garrisonGear(def, { [worn]: defCount }, defCount) };
        const r = liveFight(att, armies, d, 1, `pvp-${att}-${def}-${attTotal}-${defCount}-${seed}`);
        if (r.won) wins++;
        gap += deadOf(def, defCount - d.count) / defCount - r.lost / attTotal;
      }
    }, worn === "epic" ? 25 : MID_LEVEL);
    const res = { w: wins / SEEDS, gap: gap / SEEDS };
    const got = classify(res);
    const want = DESIGN_CHART[att][def];
    armedPvp.push({ ok: got === want, text: `${NAME[att]} → ${NAME[def]} ${got} in ${worn} (design: ${want})` });
    return pad(`${Math.round(res.w * 100)}% ${res.gap >= 0 ? "+" : ""}${res.gap.toFixed(2)} ${got === want ? "✓" : "✗"}${got.padStart(5)}`, 22);
  });
  console.log(`${padR(NAME[att], 12)}${cells.join("")}`);
}
}

// PvE with a ruler in their best set: every pack, free realm, boss and gate stays under today's ceilings
line("Armory — mobs & bandits: the army each tier is meant for, in its best set (losses: standard → epic set, the civ whose losses fall most)");
/** An army in its best set still loses at least this share of what it loses in standard gear to a pack of its tier */
const PACK_LOSS_FLOOR = 0.6;
/** Losses this small are noise either way (a march that barely bleeds) */
const PACK_LOSS_NOISE = 0.05;
const armedPackFails: string[] = [];
const armedEpicSolo: string[] = [];
for (const t of DYNAMIC_15M_TEMPLATES.filter((x) => x.category === "mob" || x.category === "bandit")) {
  const tier = t.rarity === "legendary" ? "epic" : (t.rarity ?? "common");
  const target = PACK_TARGETS[tier];
  let worst: { civ: CivilizationType; before: number; after: number; w: number } | null = null;
  for (const civ of ALL) {
    const base = target.slots === "one" ? [capOf(civ, target.level)] : allSlots(civ, target.level);
    const armies = civ === "elf" && (tier === "rare" || tier === "epic") ? [...base, ...base] : base;
    const before = packFight(civ, armies, t.type, t.rarity ?? "common");
    const after = inBestSet(() => packFight(civ, armies, t.type, t.rarity ?? "common"), target.level);
    if (before.loss >= PACK_LOSS_NOISE && after.loss < before.loss * PACK_LOSS_FLOOR) armedPackFails.push(`${t.type} vs ${NAME[civ]}: −${Math.round(before.loss * 100)}% → −${Math.round(after.loss * 100)}%`);
    const ratio = after.loss / Math.max(1e-3, before.loss);
    if (before.loss >= PACK_LOSS_NOISE && (!worst || ratio < worst.after / Math.max(1e-3, worst.before))) worst = { civ, before: before.loss, after: after.loss, w: after.w };
    if (tier === "epic" && inBestSet(() => packFight(civ, [capOf(civ, EPIC_TOO_STRONG_FOR.level)], t.type, t.rarity ?? "epic", 3), EPIC_TOO_STRONG_FOR.level).w > 0) armedEpicSolo.push(`${t.type} vs ${NAME[civ]}`);
  }
  console.log(`  ${padR(`${t.type} (${tier})`, 32)}${worst ? `${padR(NAME[worst.civ], 12)} −${Math.round(worst.before * 100)}% → −${Math.round(worst.after * 100)}% (wins ${Math.round(worst.w * 100)}%)` : "every army loses under 5% either way"}`);
}

line("Armory — free realms and frontier gates: one ruler with every march slot, one battle (win% standard → epic set)");
/** A realm or gate a lone ruler loses to in standard gear (win rate under this) must still beat them in their best set */
const LOST = 0.5;
const REALM_LEVELS = [15, 20, 25];
const realmFlips: string[] = [];
const realmBattle = (att: CivilizationType, def: CivilizationType, level: number, seed: number) => {
  const garrison = maxSoldiersFor(calculateMaxPopulation(level, def), def);
  const tier = npcWallTierFor(level);
  const kit = npcKingdomKitFor(def, realmRarityAt(level), "Realm garrison");
  const kitTrim = kitTrimFor(effectiveUnit(def, att, "defending").def * wallDefMultForTier(tier), kit);
  const d: LiveDefenderState = { civ: def, count: garrison, initialCount: garrison, fortified: true, wallTier: tier, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0, kit: { ...kit }, kitTrim };
  return liveFight(att, allSlots(att, level), d, 1, `realm-solo-${att}-${def}-${level}-${seed}`).won;
};
const winShare = (f: (seed: number) => boolean, runs = 10) => Array.from({ length: runs }, (_, s) => f(s)).filter(Boolean).length / runs;
console.log(`  ${padR("", 14)}${ALL.map((c) => pad(NAME[c], 16)).join("")}  (each attacker against its toughest realm of its own City Hall)`);
for (const level of REALM_LEVELS) {
  const cells = ALL.map((att) => {
    let shown = "";
    let top = -1;
    for (const def of MORTALS.filter((d) => d !== att)) {
      const before = winShare((s) => realmBattle(att, def, level, s));
      const after = inBestSet(() => winShare((s) => realmBattle(att, def, level, s)), level);
      if (before < LOST && after >= LOST) realmFlips.push(`CH${level} ${NAME[att]} vs ${NAME[def]} realm ${Math.round(before * 100)}% → ${Math.round(after * 100)}%`);
      // The toughest realm: the one the attacker beats least often in its best set
      if (top < 0 || after < top) {
        top = after;
        shown = `${Math.round(before * 100)}% → ${Math.round(after * 100)}%`;
      }
    }
    return pad(shown, 16);
  });
  console.log(`  ${padR(`realm CH${level}`, 14)}${cells.join("")}`);
}
const gateFlips: string[] = [];
const fullGate = (att: CivilizationType, gate: CivilizationType, level: number, seed: number) => {
  const garrison = gateReinforceCap(gate);
  const kit = npcKingdomKitFor(gate, "rare", "Gate garrison");
  const kitTrim = kitTrimFor(effectiveUnit(gate, att, "defending").def * wallDefMultForTier(GATE.WALL_TIER), kit);
  const d: LiveDefenderState = { civ: gate, count: garrison, initialCount: garrison, fortified: true, wallTier: GATE.WALL_TIER, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0, kit, kitTrim, name: GATE_NAME };
  return liveFight(att, allSlots(att, level), d, 1, `gate-${att}-${gate}-${level}-${seed}`, undefined).won;
};
/** Every City Hall a lone ruler may break a full gate from: the gate rule must hold at each one, not only the ends */
const GATE_CHECK_LEVELS = Array.from({ length: 11 }, (_, i) => 15 + i);
let gatesHeld = 0;
for (const level of GATE_CHECK_LEVELS) {
  for (const gate of MORTALS) {
    for (const att of ALL.filter((a) => a !== gate)) {
      const before = winShare((s) => fullGate(att, gate, level, s));
      if (before >= LOST) continue;
      gatesHeld++;
      const after = inBestSet(() => winShare((s) => fullGate(att, gate, level, s)), level);
      if (after >= LOST) gateFlips.push(`CH${level} ${NAME[att]} vs a full ${NAME[gate]} gate ${Math.round(before * 100)}% → ${Math.round(after * 100)}%`);
    }
  }
}
console.log(`  full frontier gates, a lone ruler at City Hall ${GATE_CHECK_LEVELS[0]}–${GATE_CHECK_LEVELS[GATE_CHECK_LEVELS.length - 1]}: ${gateFlips.length ? gateFlips.join("; ") : `all ${gatesHeld} gates that hold against a ruler in standard gear still hold in their best set`}`);

line("Armory — world bosses: a lone ruler in their best set (first battle's share · battles to kill, averaged over all bosses)");
const ARMED_PROFILE = TITLE_PROFILES[TITLE_PROFILES.length - 1];
const armedBossShares: Record<string, number> = {};
const armedOneShots: string[] = [];
const titlesOneShots: string[] = [];
let armedMarchShare = 0;
for (const civ of ALL) {
  // Colossus Hide's yardstick (City Hall 15, a veteran's titles, every slot) and a lone City Hall 20 march
  const veteran = TITLE_PROFILES.find((p) => p.name === BOSS_SOLO_MAX_SHARE.profile)!.buffs;
  const runs15 = inBestSet(() => Object.keys(BOSS_UNITS).map((t) => bossSolo(civ, BOSS_SOLO_MAX_SHARE.level, t, veteran)), BOSS_SOLO_MAX_SHARE.level);
  armedBossShares[civ] = runs15.reduce((a, r) => a + r.firstShare, 0) / runs15.length;
  if (civ !== "arcane") for (const t of Object.keys(BOSS_UNITS)) armedMarchShare = Math.max(armedMarchShare, inBestSet(() => bossAttempts(civ, 1, t), BOSS_LEVEL).firstShare);
  // The worst a lone City Hall 25 ruler can do: their best set, their own soldiers and their 2 best bands (or every slot
  // of soldiers); without titles, and with every combat title maxed
  const cells: string[] = [];
  for (const prof of [TITLE_PROFILES[0], ARMED_PROFILE]) {
    const gear = gearOf(civ, "epic", armoryShareVs("boss"));
    const withBands = (g = true) => () => bandArmy(civ, 25).map((s) => (s.band ? s : { ...s, gear: g ? gear : undefined, titleBuffs: prof.buffs }));
    const everySlot = (g = true) => () => allSlots(civ, 25).map((n, i) => ({ ...soldierMarches(civ, 1, n)[0], marchId: `a${i}`, gear: g ? gear : undefined, titleBuffs: prof.buffs }));
    const runs = Object.keys(BOSS_UNITS).map((t) => {
      const armed = [bossSoloArmy(civ, t, withBands()), bossSoloArmy(civ, t, everySlot())];
      const plain = [bossSoloArmy(civ, t, withBands(false)), bossSoloArmy(civ, t, everySlot(false))];
      return { t, first: Math.max(...armed.map((x) => x.first)), battles: Math.min(...armed.map((x) => x.battles)), plainShot: plain.some((x) => x.battles <= 1) };
    });
    // A one-shot the ruler's titles already make in standard gear is the titles' doing, not the armory's (said below)
    for (const r of runs) {
      if (r.battles > 1) continue;
      if (r.plainShot) titlesOneShots.push(`${NAME[civ]} ${r.t.replace("boss-", "")} (${prof.name})`);
      else armedOneShots.push(`${NAME[civ]} ${r.t.replace("boss-", "")} (${prof.name})`);
    }
    const avg = (f: (x: (typeof runs)[number]) => number) => runs.reduce((a, x) => a + f(x), 0) / runs.length;
    cells.push(`CH25 ${prof.name}: ${pad(`${Math.round(avg((x) => x.first) * 100)}% · ${avg((x) => x.battles).toFixed(1)}`, 11)} (worst ${pad(`${Math.round(Math.max(...runs.map((x) => x.first)) * 100)}%`, 4)})`);
  }
  console.log(`  ${padR(NAME[civ], 13)}CH${BOSS_SOLO_MAX_SHARE.level} veteran: ${pad(`${Math.round(armedBossShares[civ] * 100)}%`, 4)}   ${cells.join("   ")}`);
}
if (titlesOneShots.length) console.log(`  In standard gear, maxed titles alone already one-shot: ${titlesOneShots.join(", ")} (milestone titles, not the armory)`);
for (const [k, v] of Object.entries(ARMORY_TARGET_SHARE)) console.log(`  ${v.emblem} ${v.name} (${k}): ${v.description}`);

/* ------------------------------------------------------------------------- */
/* 14. Titan's Endurance and Colossus's Wrath                               */
/* ------------------------------------------------------------------------- */

// The strongest lone ruler there is (City Hall 25, every combat title maxed, their epic set, every slot of soldiers)
// against a fresh boss, once as one ruler (Wrath can wake) and once with the same armies split between rulers (it can't)
line(`World bosses — ${BOSS_BATTLE_CAP.emblem} ${BOSS_BATTLE_CAP.name} (at most ${pct(BOSS_BATTLE_CAP.share).slice(1)} of a boss's HP a battle) and ${BOSS_WRATH.emblem} ${BOSS_WRATH.name} (one ruler past ${pct(BOSS_WRATH.trigger).slice(1)}: ATK ×${BOSS_WRATH.atkMult})`);
console.log(`  A lone City Hall 25 ruler, every combat title maxed, epic set, every slot: first battle's share · their losses as one ruler (Wrath) vs the same armies as a rally (no Wrath) · bosses whose Wrath woke`);
let worstShare = 0;
const wrathCosts: Record<string, number> = {};
for (const civ of ALL) {
  let share = 0;
  let lostWrath = 0;
  let lostPlain = 0;
  let woke = 0;
  const types = Object.keys(BOSS_UNITS);
  for (const t of types) {
    const fightAs = (oneRuler: boolean) => {
      const def = bossDefender(t, bossUnitFor(t).hp);
      const gear = gearOf(civ, "epic", armoryShareVs("boss"));
      const st = allSlots(civ, 25).map((n, i) => ({ ...soldierMarches(civ, 1, n)[0], marchId: `a${i}`, attackerId: oneRuler ? "x" : `x${i}`, gear, titleBuffs: ARMED_PROFILE.buffs }));
      fightArmy(st, def, `wrath-${civ}-${t}`, bossDamageMult(25, civ));
      const sent = st.reduce((a, s) => a + s.initialCount, 0);
      return { share: def.count <= 0 ? 1 : def.carryDamageTaken, lost: 1 - st.reduce((a, s) => a + s.count, 0) / sent, woke: Boolean(def.wrath) };
    };
    const a = fightAs(true);
    const b = fightAs(false);
    share += a.share;
    worstShare = Math.max(worstShare, a.share, b.share);
    lostWrath += a.lost;
    lostPlain += b.lost;
    if (a.woke) woke++;
  }
  wrathCosts[civ] = (lostWrath - lostPlain) / types.length;
  console.log(`  ${padR(NAME[civ], 13)}${pad(`${Math.round((share / types.length) * 100)}%`, 5)} · losses −${Math.round((lostPlain / types.length) * 100)}% → −${Math.round((lostWrath / types.length) * 100)}% with Wrath · woke against ${woke} of ${types.length}`);
}
const enduranceChecks: Check[] = [
  { ok: worstShare <= BOSS_BATTLE_CAP.share + 1e-9, text: `${BOSS_BATTLE_CAP.name}: no battle takes more than ${pct(BOSS_BATTLE_CAP.share).slice(1)} of a boss's max HP, even the strongest lone ruler's (worst ${Math.round(worstShare * 100)}%)` },
  {
    ok: JSON.stringify(CLIENT_BOSS_BATTLE_CAP) === JSON.stringify(BOSS_BATTLE_CAP) && JSON.stringify(CLIENT_BOSS_WRATH) === JSON.stringify(BOSS_WRATH),
    text: "Client copy of Titan's Endurance and Colossus's Wrath (src/utils/war.ts) matches the server"
  },
  { ok: ALL.every((c) => wrathCosts[c] >= 0), text: `${BOSS_WRATH.name}: a lone ruler who wakes it loses at least as much as the same armies would without it (${ALL.map((c) => `${NAME[c]} +${Math.round(wrathCosts[c] * 100)} pts`).join(", ")})` }
];

const armoryMirrorOk =
  JSON.stringify(CLIENT_ARMORY_SETS) === JSON.stringify(ARMORY_SETS) &&
  JSON.stringify(CLIENT_ARMORY_RULES) === JSON.stringify(ARMORY_RULES) &&
  JSON.stringify(CLIENT_EPIC_GEM) === JSON.stringify(EPIC_GEM) &&
  JSON.stringify(CLIENT_ARMORY_TARGET_SHARE) === JSON.stringify(ARMORY_TARGET_SHARE);
const armoryChecks: Check[] = [
  { ok: armoryMirrorOk, text: `Client copy of the Armory rules (src/utils/armory.ts) matches the server${armoryMirrorOk ? "" : " — copy server/src/armoryRules.ts over"}` },
  { ok: armoryOff.length === 0, text: `Armory: every set lands on its power (${ARMORY_RARITIES.map((r) => `${ARMORY_RULES[r].power}×`).join(" / ")}) within ±${ARMORY_POWER_TOLERANCE * 100}%${armoryOff.length ? ` — off: ${armoryOff.join(", ")}` : ""}` },
  { ok: worthOff.length === 0, text: `Armory: forging a set costs what its power would in extra soldiers (±${ARMORY_WORTH_TOLERANCE * 100}%), its upkeep what they would eat (±${ARMORY_UPKEEP_TOLERANCE * 100}%)${worthOff.length ? ` — off: ${worthOff.join(", ")}` : ""}` },
  { ok: armedPvp.every((c) => c.ok), text: `Armory: the matchup chart holds with every civilization fully equipped${armedPvp.some((c) => !c.ok) ? ` — off: ${armedPvp.filter((c) => !c.ok).map((c) => c.text).join(", ")}` : ""}` },
  { ok: armedPackFails.length === 0, text: `Armory: every pack still costs the army its tier is meant for at least ${PACK_LOSS_FLOOR * 100}% of its losses when it wears its best set${armedPackFails.length ? ` — off: ${armedPackFails.slice(0, 6).join("; ")}` : ""}` },
  { ok: armedEpicSolo.length === 0, text: `Armory: epic packs still beat a lone City Hall ${EPIC_TOO_STRONG_FOR.level} march in its best set${armedEpicSolo.length ? ` — off: ${armedEpicSolo.join(", ")}` : ""}` },
  { ok: realmFlips.length === 0, text: `Armory: a free realm a lone ruler can't take in one battle (City Hall ${REALM_LEVELS.join(" / ")}) still needs a rally in their best set${realmFlips.length ? ` — off: ${realmFlips.join("; ")}` : ""}` },
  { ok: gateFlips.length === 0, text: `Armory: a full frontier gate a lone ruler can't break still holds in their best set${gateFlips.length ? ` — off: ${gateFlips.join("; ")}` : ""}` },
  { ok: armedMarchShare < 0.25, text: `Armory: a lone City Hall ${BOSS_LEVEL} march in its best set takes under 25% of a boss's HP (worst ${Math.round(armedMarchShare * 100)}%)` },
  { ok: ALL.every((c) => armedBossShares[c] <= BOSS_SOLO_MAX_SHARE.share), text: `Armory: Colossus Hide holds in the best set: a City Hall ${BOSS_SOLO_MAX_SHARE.level} ruler (${BOSS_SOLO_MAX_SHARE.profile}) takes at most ${BOSS_SOLO_MAX_SHARE.share * 100}% of a boss per battle (${ALL.map((c) => `${NAME[c]} ${Math.round(armedBossShares[c] * 100)}%`).join(", ")})` },
  { ok: armedOneShots.length === 0, text: `Armory: no lone City Hall 25 ruler kills a world boss in one battle in their best set (with their 2 best bands or every slot of soldiers, without titles or with every combat title maxed) unless their titles alone already do${armedOneShots.length ? ` — one-shots: ${armedOneShots.join(", ")}` : ""}` }
];

/* ------------------------------------------------------------------------- */
/* 15. Champions                                                             */
/* ------------------------------------------------------------------------- */

const CHAMPION_LEVELS = [25, 12];
line(`Champions — a max-level champion's march vs the same march without it (the strongest kit it can roll; at most +${CHAMPION_MAX_GAIN * 100}%)`);
console.log(`  Level ${CHAMPION_MAX_LEVEL}: +${Math.round(CHAMPION_STAT_PER_LEVEL * CHAMPION_MAX_LEVEL * 1000) / 10}% HP / ATK / DEF, its Arts and Instincts at ${CHAMPION_ART_SHARE * 100}% of its army's blow; kit unlocks at ${Object.entries(KIT_UNLOCKS).map(([k, v]) => `${k} Lv${v}`).join(", ")}`);
const championOff: string[] = [];
/** Each civilization's strongest kit (measured on its City Hall 25 march), used by every PvE check below */
const strongest = {} as Record<CivilizationType, ChampionArts>;
for (const civ of ALL) {
  const cap25 = capOf(civ, 25);
  const top = strongestKit(civ, cap25);
  strongest[civ] = top.arts;
  const cells = CHAMPION_LEVELS.map((level) => {
    const p = level === 25 ? top.power : championPower(civ, capOf(civ, level), CHAMPION_MAX_LEVEL, top.arts);
    const ok = p <= 1 + CHAMPION_MAX_GAIN;
    if (!ok) championOff.push(`${NAME[civ]} CH${level} ${pct(p - 1)}`);
    return `CH${level} march ${pad(pct(p - 1), 5)} ${ok ? "✓" : "✗"}`;
  });
  const lv20 = championPower(civ, cap25, 20, top.arts);
  const lv10 = championPower(civ, cap25, 10, top.arts);
  console.log(`  ${padR(NAME[civ], 13)}${cells.join("   ")}   (Lv10 ${pct(lv10 - 1)}, Lv20 ${pct(lv20 - 1)})   strongest: ${[...top.arts.instincts, ...top.arts.arts, top.arts.finale].join(", ")}`);
}

// PvE: every ceiling with a champion of the ruler's City Hall level at the head of their first march
line("Champions — mobs & bandits: the army each tier is meant for, in its best set, led by a champion of its City Hall level (losses: standard → set + champion)");
const champPackFails: string[] = [];
const champEpicSolo: string[] = [];
for (const t of DYNAMIC_15M_TEMPLATES.filter((x) => x.category === "mob" || x.category === "bandit")) {
  const tier = t.rarity === "legendary" ? "epic" : (t.rarity ?? "common");
  const target = PACK_TARGETS[tier];
  let worst: { civ: CivilizationType; before: number; after: number; w: number } | null = null;
  for (const civ of ALL) {
    const base = target.slots === "one" ? [capOf(civ, target.level)] : allSlots(civ, target.level);
    const armies = civ === "elf" && (tier === "rare" || tier === "epic") ? [...base, ...base] : base;
    const before = packFight(civ, armies, t.type, t.rarity ?? "common");
    const after = ledBy(() => inBestSet(() => packFight(civ, armies, t.type, t.rarity ?? "common"), target.level), target.level, strongest[civ]);
    if (before.loss >= PACK_LOSS_NOISE && after.loss < before.loss * PACK_LOSS_FLOOR) champPackFails.push(`${t.type} vs ${NAME[civ]}: −${Math.round(before.loss * 100)}% → −${Math.round(after.loss * 100)}%`);
    const ratio = after.loss / Math.max(1e-3, before.loss);
    if (before.loss >= PACK_LOSS_NOISE && (!worst || ratio < worst.after / Math.max(1e-3, worst.before))) worst = { civ, before: before.loss, after: after.loss, w: after.w };
    if (tier === "epic" && ledBy(() => inBestSet(() => packFight(civ, [capOf(civ, EPIC_TOO_STRONG_FOR.level)], t.type, t.rarity ?? "epic", 3), EPIC_TOO_STRONG_FOR.level), EPIC_TOO_STRONG_FOR.level, strongest[civ]).w > 0)
      champEpicSolo.push(`${t.type} vs ${NAME[civ]}`);
  }
  console.log(`  ${padR(`${t.type} (${tier})`, 32)}${worst ? `${padR(NAME[worst.civ], 12)} −${Math.round(worst.before * 100)}% → −${Math.round(worst.after * 100)}% (wins ${Math.round(worst.w * 100)}%)` : "every army loses under 5% either way"}`);
}

line("Champions — free realms and frontier gates: one ruler with every march slot, in their best set, led by a champion of their City Hall level (win% standard → set + champion)");
const champRealmFlips: string[] = [];
console.log(`  ${padR("", 14)}${ALL.map((c) => pad(NAME[c], 16)).join("")}  (each attacker against its toughest realm of its own City Hall)`);
for (const level of REALM_LEVELS) {
  const cells = ALL.map((att) => {
    let shown = "";
    let top = -1;
    for (const def of MORTALS.filter((d) => d !== att)) {
      const before = winShare((s) => realmBattle(att, def, level, s));
      const after = ledBy(() => inBestSet(() => winShare((s) => realmBattle(att, def, level, s)), level), level, strongest[att]);
      if (before < LOST && after >= LOST) champRealmFlips.push(`CH${level} ${NAME[att]} vs ${NAME[def]} realm ${Math.round(before * 100)}% → ${Math.round(after * 100)}%`);
      if (top < 0 || after < top) {
        top = after;
        shown = `${Math.round(before * 100)}% → ${Math.round(after * 100)}%`;
      }
    }
    return pad(shown, 16);
  });
  console.log(`  ${padR(`realm CH${level}`, 14)}${cells.join("")}`);
}
const champGateFlips: string[] = [];
let champGatesHeld = 0;
for (const level of GATE_CHECK_LEVELS) {
  for (const gate of MORTALS) {
    for (const att of ALL.filter((a) => a !== gate)) {
      const before = winShare((s) => fullGate(att, gate, level, s));
      if (before >= LOST) continue;
      champGatesHeld++;
      const after = ledBy(() => inBestSet(() => winShare((s) => fullGate(att, gate, level, s)), level), level, strongest[att]);
      if (after >= LOST) champGateFlips.push(`CH${level} ${NAME[att]} vs a full ${NAME[gate]} gate ${Math.round(before * 100)}% → ${Math.round(after * 100)}%`);
    }
  }
}
console.log(`  full frontier gates, a lone ruler at City Hall ${GATE_CHECK_LEVELS[0]}–${GATE_CHECK_LEVELS[GATE_CHECK_LEVELS.length - 1]}: ${champGateFlips.length ? champGateFlips.join("; ") : `all ${champGatesHeld} gates that hold against a ruler in standard gear still hold against their best set and their champion`}`);

line("Champions — world bosses: a lone City Hall 25 ruler, best set, a level-25 champion leading their first march, beside their 2 best bands or with every slot (first battle's share · battles to kill)");
const champOneShots: string[] = [];
const champTitleShots: string[] = [];
for (const civ of ALL) {
  const cells: string[] = [];
  for (const prof of [TITLE_PROFILES[0], ARMED_PROFILE]) {
    const gear = gearOf(civ, "epic", armoryShareVs("boss"));
    const lead = (list: LiveAttackerStack[]) => {
      const first = list.find((s) => !s.band);
      if (first) Object.assign(first, championFields(25, strongest[civ]));
      return list;
    };
    const withBands = (champ: boolean) => () => {
      const list = bandArmy(civ, 25).map((s) => (s.band ? s : { ...s, gear, titleBuffs: prof.buffs }));
      return champ ? lead(list) : list;
    };
    const everySlot = (champ: boolean) => () => {
      const list = allSlots(civ, 25).map((n, i) => ({ ...soldierMarches(civ, 1, n)[0], marchId: `a${i}`, gear, titleBuffs: prof.buffs }));
      return champ ? lead(list) : list;
    };
    const runs = Object.keys(BOSS_UNITS).map((t) => {
      const led = [bossSoloArmy(civ, t, withBands(true)), bossSoloArmy(civ, t, everySlot(true))];
      const plain = [bossSoloArmy(civ, t, withBands(false)), bossSoloArmy(civ, t, everySlot(false))];
      return { t, first: Math.max(...led.map((x) => x.first)), battles: Math.min(...led.map((x) => x.battles)), plainShot: plain.some((x) => x.battles <= 1) };
    });
    for (const r of runs) {
      if (r.battles > 1) continue;
      if (r.plainShot) champTitleShots.push(`${NAME[civ]} ${r.t.replace("boss-", "")} (${prof.name})`);
      else champOneShots.push(`${NAME[civ]} ${r.t.replace("boss-", "")} (${prof.name})`);
    }
    const avg = (f: (x: (typeof runs)[number]) => number) => runs.reduce((a, x) => a + f(x), 0) / runs.length;
    cells.push(`${prof.name}: ${pad(`${Math.round(avg((x) => x.first) * 100)}% · ${avg((x) => x.battles).toFixed(1)}`, 11)} (worst ${pad(`${Math.round(Math.max(...runs.map((x) => x.first)) * 100)}%`, 4)})`);
  }
  console.log(`  ${padR(NAME[civ], 13)}${cells.join("   ")}`);
}
if (champTitleShots.length) console.log(`  Without the champion, the same army already one-shots: ${champTitleShots.join(", ")} (titles and sets, not the champion)`);

line("Champions — Renown");
console.log(`  ${RENOWN.perRound} a round fought, ${RENOWN.perSqrtKill}×√kills (≤ ${RENOWN.killsCap}), ${RENOWN.win} a win, ${RENOWN.bossFelled} a boss felled, ${RENOWN.realmFelled} a realm felled, ${RENOWN.finaleKill} an army a Finale broke; full to ${DAILY_RENOWN.full} a day, half to ${DAILY_RENOWN.half}, then a quarter`);

for (const [k, v] of Object.entries(CHAMPION_TARGET_SHARE)) console.log(`  ${v.emblem} ${v.name} (${k}): ${v.description}`);
const championMirrorOk =
  JSON.stringify(CLIENT_CHAMPION.CHAMPION_TARGET_SHARE) === JSON.stringify(CHAMPION_TARGET_SHARE) &&
  CLIENT_CHAMPION.CHAMPION_MAX_LEVEL === CHAMPION_MAX_LEVEL &&
  CLIENT_CHAMPION.CHAMPION_STAT_PER_LEVEL === CHAMPION_STAT_PER_LEVEL &&
  CLIENT_CHAMPION.CHAMPION_ART_SHARE === CHAMPION_ART_SHARE &&
  CLIENT_CHAMPION.CHAMPION_MAX_GAIN === CHAMPION_MAX_GAIN &&
  JSON.stringify(CLIENT_CHAMPION.KIT_UNLOCKS) === JSON.stringify(KIT_UNLOCKS) &&
  JSON.stringify(CLIENT_CHAMPION.RENOWN) === JSON.stringify(RENOWN) &&
  JSON.stringify(CLIENT_CHAMPION.DAILY_RENOWN) === JSON.stringify(DAILY_RENOWN);
const championPoolOff = [...CHAMPION_INSTINCTS.filter((id) => !INSTINCTS[id]), ...CHAMPION_ARTS.filter((id) => !ARTS[id]), ...CHAMPION_FINALES.filter((id) => !FINALES[id])];
const championChecks: Check[] = [
  { ok: championOff.length === 0, text: `Champions: a max-level champion with the strongest kit lifts its march at most +${CHAMPION_MAX_GAIN * 100}% (City Hall ${CHAMPION_LEVELS.join(" / ")})${championOff.length ? ` — off: ${championOff.join(", ")}` : ""}` },
  { ok: champPackFails.length === 0, text: `Champions: every pack still costs the army its tier is meant for at least ${PACK_LOSS_FLOOR * 100}% of its losses, in its best set and led by its champion${champPackFails.length ? ` — off: ${champPackFails.slice(0, 6).join("; ")}` : ""}` },
  { ok: champEpicSolo.length === 0, text: `Champions: epic packs still beat a lone City Hall ${EPIC_TOO_STRONG_FOR.level} march in its best set led by its champion${champEpicSolo.length ? ` — off: ${champEpicSolo.join(", ")}` : ""}` },
  { ok: champRealmFlips.length === 0, text: `Champions: a free realm a lone ruler can't take still needs a rally with their best set and their champion${champRealmFlips.length ? ` — off: ${champRealmFlips.join("; ")}` : ""}` },
  { ok: champGateFlips.length === 0, text: `Champions: a full frontier gate a lone ruler can't break still holds against their best set and their champion${champGateFlips.length ? ` — off: ${champGateFlips.join("; ")}` : ""}` },
  { ok: champOneShots.length === 0, text: `Champions: no lone City Hall 25 ruler kills a world boss in one battle with their champion, best set and bands (or every slot), unless the same army already does without it${champOneShots.length ? ` — one-shots: ${champOneShots.join(", ")}` : ""}` },
  { ok: championMirrorOk && championPoolOff.length === 0, text: `Client copy of the champion rules (src/utils/champion.ts) matches the server, and every Art in the champion pools exists${championMirrorOk ? "" : " — copy server/src/championRules.ts over"}${championPoolOff.length ? ` — unknown: ${championPoolOff.join(", ")}` : ""}` }
];

// ⚔️ The Muster: the client builds the same boxes and order as the server
const musterCases: Array<[number, number, number, number]> = [[1, 900, 264, 4], [0.25, 700, 264, 3], [0.1, 50, 400, 5], [0.5, 0, 264, 4], [1, 500, 264, 0]];
const musterMirrorOk =
  JSON.stringify(CLIENT_MUSTER.MUSTER_SPLITS) === JSON.stringify(MUSTER.MUSTER_SPLITS) &&
  musterCases.every((c) => JSON.stringify(CLIENT_MUSTER.musterBoxes(...c)) === JSON.stringify(MUSTER.musterBoxes(...c))) &&
  ["standard", ...ARMORY_RARITIES].every((r) => CLIENT_MUSTER.boxPower(240, MUSTER.setPowerOf(r), 1.1) === MUSTER.boxPower(240, r, 1.1));
line("Muster");
console.log(`  Splits ${MUSTER.MUSTER_SPLITS.map((x) => `${x * 100}%`).join(" / ")}; champion worth ×${MUSTER.championPowerAt(1)} at level 1 → ×${MUSTER.championPowerAt(CHAMPION_MAX_LEVEL)} at ${CHAMPION_MAX_LEVEL}`);
checks.push({ ok: musterMirrorOk && MUSTER.championPowerAt(CHAMPION_MAX_LEVEL) <= 1 + CHAMPION_MAX_GAIN, text: `Client copy of the muster rules (src/utils/muster.ts) matches the server, and a champion's worth stays within +${CHAMPION_MAX_GAIN * 100}%${musterMirrorOk ? "" : " — copy server/src/musterRules.ts over"}` });

// 🛡️ The client copy of the packs' gear (the Guide Book quotes it)
const packGearMirrorOk = JSON.stringify(CLIENT_PACK_GEAR) === JSON.stringify(PACK_GEAR);
// 👑 Free realms: the client copy of the tier treasury and conquest hoards; the hoard rises with every tier and an epic one beats a world boss's
const realmMirrorOk = JSON.stringify(CLIENT_REALM_HOARD) === JSON.stringify(REALM_CONQUEST_HOARD) && JSON.stringify(CLIENT_REALM_TREASURY_MULT) === JSON.stringify(REALM_TREASURY_TIER_MULT);
const hoardWorth = (h: { gold: number; iron: number; stone: number; lumber: number; food: number }) => h.gold + h.iron + h.stone + h.lumber + h.food;
const hoardTiers = (["common", "uncommon", "rare", "epic"] as const).map((t) => hoardWorth(REALM_CONQUEST_HOARD[t]));
const hoardRises = hoardTiers.every((v, i) => i === 0 || v > hoardTiers[i - 1]) && hoardWorth(REALM_CONQUEST_HOARD.epic) > hoardWorth(BOSS_HOARD);
const mirrorOk = JSON.stringify(CLIENT_MODIFIERS) === JSON.stringify(CIV_MODIFIERS);
/* ------------------------------------------------------------------------- */
/* 🌑 Xal'Vorath, the Overseers' Wrath                                        */
/* ------------------------------------------------------------------------- */

/** Tries one rally fits into the hour at the gates: wait, march, fight, march home, about 15 minutes each */
const HORROR_HOUR_TRIES = 4;

function horrorFight(level: number, civ: CivilizationType, members: number, ch: number, split = 1): { tries: number; firstShare: number; lossShare: number } {
  const u = horrorStatsFor(level, split);
  let hp = u.hp;
  let firstShare = 0;
  let lossShare = 0;
  const army = marchOf(civ, ch);
  for (let attempt = 1; attempt <= 60; attempt++) {
    const base = bossDefender(HORROR_NPC_TYPE, 1);
    const def: LiveDefenderState = { ...base, unit: { hp: u.hp, atk: u.atk, def: u.def }, carryDamageTaken: 1 - hp / u.hp, boss: { ...base.boss!, maxHp: u.hp, hpAtStart: hp } };
    const r = liveFight(civ, Array(members).fill(army), def, 1 + RALLY_COORDINATION_ATK * (members - 1), `horror-${level}-${civ}-${members}-${ch}-${split}-${attempt}`, TWEAKS.titles, bossDamageMult(ch, civ), null, members > 1);
    const after = r.def.count <= 0 ? 0 : u.hp * (r.def.count - r.def.carryDamageTaken);
    if (attempt === 1) {
      firstShare = (hp - after) / u.hp;
      lossShare = r.lost / (army * members);
    }
    hp = after;
    if (hp <= 0) return { tries: attempt, firstShare, lossShare };
  }
  return { tries: 61, firstShare, lossShare };
}

/** Battles for a whole civilization's rallies (each one rally of `members` rulers): the number of rallies needed to fit the hour */
const ralliesNeeded = (tries: number) => Math.ceil(tries / HORROR_HOUR_TRIES);

line(`🌑 Xal'Vorath: rallies of 5 rulers against each Level (${HORROR_HOUR_TRIES} tries fit its hour at the gates) · tries to kill (first try's HP share, marchers lost)`);
console.log(`  ${padR("Level", 10)}${[15, 18, 20, 25].map((ch) => pad(`City Hall ${ch}`, 24)).join("")}`);
const horrorTable: Record<number, Record<number, number>> = {};
for (const level of [1, 2, 3, 4, 5]) {
  horrorTable[level] = {};
  const cells = [15, 18, 20, 25].map((ch) => {
    const runs = MORTALS.map((civ) => horrorFight(level, civ, 5, ch));
    const tries = Math.max(...runs.map((r) => r.tries));
    horrorTable[level][ch] = tries;
    const avg = (fn: (r: (typeof runs)[number]) => number) => runs.reduce((a, r) => a + fn(r), 0) / runs.length;
    return pad(`${tries > 60 ? ">60" : tries} tries (${Math.round(avg((r) => r.firstShare) * 100)}%, -${Math.round(avg((r) => r.lossShare) * 100)}%)`, 24);
  });
  console.log(`  ${padR(String(level), 10)}${cells.join("")}`);
}
// Split among 3 kingdoms: a third of the stats each
const splitTries = Math.max(...MORTALS.map((civ) => horrorFight(5, civ, 5, 20, 3).tries));
console.log(`  Level 5 split among 3 kingdoms: ${splitTries} tries for a rally of 5 at City Hall 20`);

const horrorChecks: Check[] = [
  { ok: JSON.stringify(CLIENT_HORROR_LEVELS) === JSON.stringify(HORROR_LEVELS) && CLIENT_HORROR.XP_PER_DAY === HORROR.XP_PER_DAY && CLIENT_HORROR.DAYS === HORROR.DAYS && CLIENT_HORROR.MAX_TARGETS === HORROR.MAX_TARGETS && CLIENT_HORROR.MAX_LEVEL === HORROR.MAX_LEVEL && CLIENT_HORROR.TREASURY_DEVOURED === HORROR.TREASURY_DEVOURED && CLIENT_HORROR.LATE_SEND_HOUR === HORROR.LATE_SEND_HOUR && CLIENT_HORROR_GEM === HORROR.GEM && CLIENT_HORROR.APPROACH_DAYS * 86_400_000 === HORROR.APPROACH_MS && CLIENT_HORROR.SIEGE_HOURS * 3_600_000 === HORROR.SIEGE_MS, text: "Client copy of Xal'Vorath's numbers (src/utils/horror.ts) matches the server" },
  { ok: Object.values(HORROR_LEVELS).every((u, i, all) => i === 0 || (u.hp > all[i - 1].hp && u.atk > all[i - 1].atk && u.def > all[i - 1].def)), text: "Every Level of Xal'Vorath is stronger than the last" },
  { ok: ralliesNeeded(horrorTable[3][20]) <= 2 && ralliesNeeded(horrorTable[3][18]) <= 2 && ralliesNeeded(horrorTable[3][15]) <= 4, text: `Level 3 falls to a whole civilization's rallies in its hour: 2 rallies of City Hall 18–20 rulers (${horrorTable[3][18]} and ${horrorTable[3][20]} tries), at most 4 at City Hall 15 (${horrorTable[3][15]} tries)` },
  { ok: ralliesNeeded(horrorTable[5][20]) >= 3 && ralliesNeeded(horrorTable[5][20]) <= 5, text: `Level 5 needs most of a civilization: 3–5 rallies of City Hall 20 rulers at once in its hour (${horrorTable[5][20]} tries, ${ralliesNeeded(horrorTable[5][20])} rallies)` },
  { ok: horrorTable[1][20] <= HORROR_HOUR_TRIES, text: `Level 1 falls to one rally of City Hall 20 rulers in its hour (${horrorTable[1][20]} tries)` },
  { ok: splitTries < horrorTable[5][20], text: `A split Wrath is weaker on each kingdom (Level 5 ÷ 3: ${splitTries} tries vs ${horrorTable[5][20]})` }
];

line("Checks");
checks.push(...pvpChecks, ...gatherChecks, ...rallyChecks, ...bossChecks, ...horrorChecks, ...moonwellChecks, ...npckChecks, ...overseerChecks, ...armyChecks, ...plunderChecks, ...wallChecks, ...burnChecks, ...recoveryChecks, ...mobChecks, ...disasterChecks, ...mercChecks, ...armoryChecks, ...enduranceChecks, ...championChecks);
if (!applied.some((a) => a.includes("modifiers"))) {
  checks.push({ ok: mirrorOk, text: `Client copy of CIV_MODIFIERS (src/utils/civDemographics.ts) matches the server${mirrorOk ? "" : " — copy warConfig.ts's list over"}` });
  checks.push({ ok: realmMirrorOk, text: `Client copy of the free realms' tier treasury and conquest hoards (src/utils/civDemographics.ts) matches the server${realmMirrorOk ? "" : " — copy warConfig.ts's REALM_CONQUEST_HOARD / REALM_TREASURY_TIER_MULT over"}` });
  checks.push({ ok: hoardRises, text: `Free realms: the conquest hoard rises with every tier (${hoardTiers.map((v) => `${Math.round(v / 1000)}k`).join(" → ")}) and an epic realm's beats a world boss's hoard (${Math.round(hoardWorth(BOSS_HOARD) / 1000)}k)` });
  checks.push({ ok: packGearMirrorOk, text: `Client copy of the packs' gear (PACK_GEAR in src/utils/civDemographics.ts) matches the server${packGearMirrorOk ? "" : " — copy warConfig.ts's PACK_GEAR over"}` });
}
// Seasons (GAME_GUIDE §7) buff harvest, births and march speed only, so this matchup chart stays valid all year
const seasonKeys = Object.keys(SEASON_MODS).sort().join(",");
const seasonsOk = seasonKeys === "births,harvest,march" && JSON.stringify(SEASON_MODS) === JSON.stringify(CLIENT_SEASON_MODS);
checks.push({ ok: seasonsOk, text: `Seasons touch only harvest, births and march speed (no combat stats), client copy matches${seasonsOk ? "" : ` — got ${seasonKeys}`}` });
for (const c of checks) console.log(`${c.ok ? "  ✅ PASS" : "  ❌ FAIL"}  ${c.text}`);

const balanced = checks.every((c) => c.ok);
console.log(`\n${"═".repeat(80)}`);
console.log(balanced ? "  ⚖️   BALANCED" : `  ⚠️   UNBALANCED — ${checks.filter((c) => !c.ok).length} check(s) failed`);
console.log("═".repeat(80));
if (applied.length) console.log("  (with TWEAKS — copy them into the game files to make it real)");
process.exit(balanced ? 0 : 1);
