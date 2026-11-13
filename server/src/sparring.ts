import { BattleRound, CodexEntry, SparringResult, SparringRosterEntry, SparringSide } from "./types.js";
import { UnitKit, UnitRarity, kitLines, kitProblems } from "./battleArts.js";
import { LiveAttackerStack, LiveDefenderState, UnitStats, seededRandom, stepBattleRound, totalDefenders } from "./combat.js";
import { COMBAT, CombatTraits, bossKitFor, bossUnitFor, npcKitFor, worldNpcPackSize, worldNpcUnitFor } from "./warConfig.js";
import { getCodexCatalog } from "./worldMapGenerator.js";

/**
 * 🤺 The Sparring Grounds (Royal Codex → Sparring Grounds, GAME_GUIDE §13 *Battle Arts*): pick two units and watch a
 * 6-round fight on the real engine (`combat.stepBattleRound`). The roster is every world boss and every mob and bandit
 * pack as it fights, plus one drill band per rarity carrying a full kit of that rarity on the same plain soldiers, so
 * the only difference between them is their Battle Arts. `npm run sim:arts` measures the same drill kits.
 */

/** The drill bands' plain soldier: every drill band fields these, only their kits differ */
export const DRILL_UNIT: UnitStats = { hp: 10, atk: 2, def: 20 };
/** Soldiers in a drill band, and when facing a world boss (a rally's worth) */
export const DRILL_BAND = 1_000;
export const DRILL_BAND_VS_BOSS = 20_000;
/** A mob or bandit pack facing a world boss takes the field this many packs strong (a drill band's rally share) */
export const PACKS_VS_BOSS = DRILL_BAND_VS_BOSS / DRILL_BAND;

/**
 * A full kit of every rarity (the sizes of KIT_SIZES), each the one below it plus the slots its rarity adds, so the
 * steps between them measure what a rarity is worth rather than which Arts were picked
 */
export const DRILL_KITS: Record<UnitRarity, Omit<UnitKit, "rarity">> = {
  common: { name: "Militia Captain", instincts: ["bloodlust"], arts: [] },
  uncommon: { name: "Ember Adept", instincts: ["bloodlust"], arts: ["fireball"] },
  rare: { name: "Flame Warden", instincts: ["bloodlust", "stoneskin"], arts: ["fireball"] },
  epic: { name: "Siege Marshal", instincts: ["bloodlust", "stoneskin"], arts: ["fireball", "armor_break"] },
  legendary: { name: "Dawn Paladin", instincts: ["bloodlust", "stoneskin"], arts: ["fireball", "armor_break"], finale: "dawnbreaker" },
  mythic: { name: "Eclipse Shade", instincts: ["bloodlust", "stoneskin", "thick_hide"], arts: ["fireball", "armor_break", "war_cry"], finale: "cataclysm" }
};

const DRILL_EMBLEM: Record<UnitRarity, string> = { common: "🗡️", uncommon: "🔥", rare: "🪨", epic: "💔", legendary: "🌅", mythic: "☄️" };

/** A roster unit as the engine fights it */
export interface SparringUnit extends SparringRosterEntry {
  kit: UnitKit;
  /** A pack's traits (Pounce, Venom…) and its full size at its spawn's rarity */
  traits?: Partial<CombatTraits>;
  pack?: number;
}

export const drillKit = (rarity: UnitRarity): UnitKit => ({ ...DRILL_KITS[rarity], rarity });

let roster: SparringUnit[] | null = null;
/** Every unit that may spar: the drill bands, every world boss, then every mob and bandit pack */
export function sparringRoster(): SparringUnit[] {
  if (roster) return roster;
  const drills: SparringUnit[] = (Object.keys(DRILL_KITS) as UnitRarity[]).map((rarity) => ({
    id: `drill-${rarity}`,
    name: DRILL_KITS[rarity].name,
    emblem: DRILL_EMBLEM[rarity],
    rarity,
    kind: "drill",
    subtitle: `Drill band · a full ${rarity} kit`,
    kit: drillKit(rarity),
    kitLines: kitLines(DRILL_KITS[rarity]),
    unit: DRILL_UNIT
  }));
  const bosses: SparringUnit[] = getCodexCatalog()
    .entries.filter((e: CodexEntry) => e.category === "boss" && !e.teaser)
    .map((e) => {
      const u = bossUnitFor(e.type);
      return { id: e.type, name: e.name, emblem: e.emblem, rarity: e.rarity === "mythical" ? "mythic" : "legendary", kind: "boss", subtitle: e.subtitle, kit: bossKitFor(e.type, e.name), kitLines: kitLines(u.kit), unit: { hp: u.hp, atk: u.atk, def: u.def } };
    });
  const packs: SparringUnit[] = getCodexCatalog()
    .entries.filter((e: CodexEntry) => (e.category === "mob" || e.category === "bandit") && !e.teaser)
    .flatMap((e) => {
      const rarity = (e.rarity === "mythical" ? "mythic" : e.rarity) as UnitRarity;
      const kit = npcKitFor(e.type, rarity);
      if (!kit) return [];
      const u = worldNpcUnitFor(e.type);
      const pack = worldNpcPackSize(e.type, e.rarity);
      return [{ id: e.type, name: u.name, emblem: e.emblem, rarity, kind: "npc" as const, subtitle: `${e.category === "bandit" ? "Bandit" : "Mob"} pack · ${pack} strong`, kit, kitLines: kitLines(kit), unit: { hp: u.hp, atk: u.atk, def: u.def }, traits: u.traits, pack }];
    });
  const problems = [...drills, ...bosses, ...packs].flatMap((u) => kitProblems(u.kit));
  if (problems.length) throw new Error(`Sparring roster: ${problems.join("; ")}`);
  roster = [...drills, ...bosses, ...packs];
  return roster;
}

/** One soldier's blow on `foe` after its armour (DEF / (DEF + ARMOR_K) turned aside) */
const blowOn = (u: SparringUnit, foe: SparringUnit) => u.unit.atk * (1 - foe.unit.def / (foe.unit.def + COMBAT.ARMOR_K));

/**
 * How many of a unit take the field: one boss; a pack at its full size (PACKS_VS_BOSS packs against a boss); a drill
 * band (a rally's worth against a boss; against a pack, an even match: as many soldiers as make soldiers² × HP × blow
 * after armour the same on both sides)
 */
function countOf(u: SparringUnit, foe: SparringUnit): number {
  if (u.kind === "boss") return 1;
  if (u.kind === "npc") return (u.pack ?? 1) * (foe.kind === "boss" ? PACKS_VS_BOSS : 1);
  if (foe.kind === "boss") return DRILL_BAND_VS_BOSS;
  if (foe.kind === "npc") return Math.max(1, Math.round((foe.pack ?? 1) * Math.sqrt((foe.unit.hp * blowOn(foe, u)) / (u.unit.hp * blowOn(u, foe)))));
  return DRILL_BAND;
}

/** Fight `a` (attacking) against `b` (defending, in the open) for COMBAT.MAX_ROUNDS rounds on the live engine */
export function runSparring(aId: string, bId: string, seed = "sparring"): SparringResult | null {
  const all = sparringRoster();
  const a = all.find((u) => u.id === aId);
  const b = all.find((u) => u.id === bId);
  if (!a || !b) return null;
  const aCount = countOf(a, b);
  const bCount = countOf(b, a);
  // A clone of each kit, so the battle's own name ("… (2)") never leaks into the roster
  const stack: LiveAttackerStack = {
    marchId: "a",
    attackerId: a.id,
    attackerName: a.name,
    civ: "human",
    count: aCount,
    initialCount: aCount,
    joinedRound: 1,
    roundsFought: 0,
    carryDamageTaken: 0,
    totalDamageDealt: 0,
    totalLosses: 0,
    unit: a.unit,
    traits: a.traits,
    kit: { ...a.kit, name: a.id === b.id ? `${a.name} (red)` : a.name }
  };
  const defender: LiveDefenderState = {
    civ: "human",
    count: bCount,
    initialCount: bCount,
    fortified: false,
    roundsFought: 0,
    carryDamageTaken: 0,
    totalLosses: 0,
    unit: b.unit,
    traits: b.traits,
    kit: { ...b.kit, name: a.id === b.id ? `${b.name} (blue)` : b.name }
  };
  const battleSeed = `${seed}:${a.id}:${b.id}`;
  const rng = seededRandom(battleSeed);
  const rounds: BattleRound[] = [];
  for (let round = 1; round <= COMBAT.MAX_ROUNDS && stack.count > 0 && totalDefenders(defender) > 0; round++) {
    rounds.push(stepBattleRound(round, [stack], defender, rng, null, battleSeed).roundSummary);
  }
  // A colossal unit's strength is its HP left
  const aLeft = a.kind === "boss" ? Math.max(0, 1 - stack.carryDamageTaken / a.unit.hp) * stack.count : stack.count / aCount;
  const bLeft = Math.max(0, defender.count - defender.carryDamageTaken) / bCount;
  const side = (u: SparringUnit, count: number): SparringSide => ({ id: u.id, name: u.name, emblem: u.emblem, rarity: u.rarity, kind: u.kind, count, hp: u.unit.hp, kitLines: u.kitLines });
  return {
    attacker: side(a, aCount),
    defender: side(b, bCount),
    rounds,
    attackerLeft: aLeft,
    defenderLeft: bLeft,
    winner: Math.abs(aLeft - bLeft) < 0.02 ? "draw" : aLeft > bLeft ? "attacker" : "defender"
  };
}
