import { CivilizationType, BattleRound, BattleArtEvent, NPCCategory, NPCRarity, TitleBuffs } from "./types.js";
import { effectiveUnit } from "./demographics.js";
import {
  Art,
  ArtsState,
  BLEED_GROWTH,
  STATUS_RULES,
  StatusInstance,
  UnitKit,
  applyStatus,
  artRoll,
  cullShare,
  enrageMult,
  finaleNow,
  instinctStats,
  markCast,
  pickArt,
  statusMods,
  INSTINCTS
} from "./battleArts.js";
import { BOSS_BATTLE_CAP, BOSS_WRATH, COMBAT, COMBAT_TRAITS, CombatTraits, FAMINE_DEF_MULT, WALL_DMG_PER_DEFENDER_KILLED, wallDamageTakenForTier, wallDefMultForTier } from "./warConfig.js";
import { hash } from "./kingdomUtils.js";
import type { GearStats } from "./armoryRules.js";

/**
 * 🩸 What a round fought under a Blood Moon changes (GAME_GUIDE §10 *World Disasters*): disasterRules.battleOmenAt
 * builds it for the round's time, so only rounds fought inside the disaster's window feel it
 */
export interface BattleOmen {
  /** Mobs, bandits and bosses: HP, ATK and DEF × this */
  npcStatMult: number;
  /** Each civilization's soldiers: ATK × this (1 when not listed) */
  civAtkMult: Partial<Record<CivilizationType, number>>;
}

/**
 * Pure battle simulation (no database): both armies strike at the same time each round until one
 * side is wiped out or COMBAT.MAX_ROUNDS pass. The attacker only wins by destroying the garrison;
 * otherwise the survivors retreat. Seeded, so a report can always be replayed from the march id.
 */

export interface ArmySide {
  civ: CivilizationType;
  count: number;
  /** Fighting from behind walls (defenders) */
  fortified?: boolean;
  /** City wall tier (0-5) when fortified; defaults to tier 0 (1.25x DEF) */
  wallTier?: number;
  /** Explicit wall DEF multiplier override */
  wallDefMult?: number;
  /** Empty granary: armor halved (GAME_GUIDE §13) */
  famished?: boolean;
  /** Extra attack bonus multiplier (e.g. rally coordination) */
  atkBonusMult?: number;
  /** World NPC pack (mob / bandit): fights with these stats instead of `civ`'s soldier; no civ buffs either way */
  unit?: UnitStats;
  traits?: Partial<CombatTraits>;
  /** Multiplier on HP, ATK and DEF (Special Overseers' Resolve) */
  statMult?: number;
  /** The ruler's milestone title buffs (fractions, e.g. 0.05 = +5%) */
  titleBuffs?: TitleBuffs;
  /** Battle Arts Instincts: shares added to HP / ATK / DEF (multiplied on top, like titles) */
  kitStats?: { hp: number; atk: number; def: number };
  /** Multipliers on HP and ATK that pay for an NPC garrison's kit, so the kit never makes it stronger (warConfig `kitTrimFor`) */
  kitTrim?: { hp: number; atk: number };
  /** Battle Arts this round (statuses, Enrage on soldiers): ATK, DEF and damage-taken multipliers; frozen deals nothing */
  artMods?: { atk: number; def: number; taken: number; frozen: boolean };
  /** 🗡️ Armory gear the soldiers wear (armoryRules): stat shares multiplied on top, and its trait changes. Ignored with `unit` */
  gear?: GearStats;
  /** 🦸 The champion leading the army: its flat stat shares, multiplied on top (championRules). Ignored with `unit` */
  champion?: { hp: number; atk: number; def: number };
}

/** 🦸 A champion leading an army in a battle (bookkeeping, plus its stat shares; its kit rides the army's `kit`) */
export interface ChampionInBattle {
  id: string;
  userId: string;
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
}

export interface UnitStats {
  hp: number;
  atk: number;
  def: number;
}

export interface BattleSimResult {
  rounds: BattleRound[];
  attackerLosses: number;
  defenderLosses: number;
  attackerWon: boolean;
}

/** Deterministic PRNG (mulberry32) seeded from a string */
export function seededRandom(seed: string): () => number {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Raw damage `from` deals to `to` this round */
export type Role = "attacking" | "defending";
const other = (r: Role): Role => (r === "attacking" ? "defending" : "attacking");

function getFortificationMult(side: ArmySide): number {
  if (!side.fortified) return 1;
  if (side.wallDefMult !== undefined) return side.wallDefMult;
  if (side.wallTier !== undefined) return wallDefMultForTier(side.wallTier);
  return COMBAT.FORTIFICATION_DEF_MULT;
}

const NEUTRAL_TRAITS: CombatTraits = { firstRoundAtkMult: 1, armorPierce: 0, damageTakenMult: 1, firstRoundDamageTakenMult: 1, outnumberAtkBonus: 0 };

/**
 * Stats of `side` fighting `opponent` (civ buffs with `vs` only apply against a civ, never against an NPC pack).
 * A ruler's title buffs scale their soldiers on top (NPC packs and bosses have none).
 */
export function sideUnit(side: Pick<ArmySide, "civ" | "unit" | "statMult" | "titleBuffs" | "kitStats" | "kitTrim" | "gear" | "champion">, opponent: Pick<ArmySide, "civ" | "unit">, role: Role): UnitStats {
  const plain = side.unit ?? effectiveUnit(side.civ, opponent.unit ? undefined : opponent.civ, role, side.titleBuffs);
  // 🗡️ Armory gear multiplies a ruler's soldiers on top of their civilization buffs and titles
  const g = side.unit ? undefined : side.gear;
  const geared = g ? { hp: plain.hp * (1 + g.hp), atk: plain.atk * (1 + g.atk), def: plain.def * (1 + g.def) } : plain;
  // 🦸 …and so does the champion leading them
  const ch = side.unit ? undefined : side.champion;
  const u = ch ? { hp: geared.hp * (1 + ch.hp), atk: geared.atk * (1 + ch.atk), def: geared.def * (1 + ch.def) } : geared;
  const m = side.statMult ?? 1;
  const t = side.kitTrim;
  const s = m === 1 && !t ? u : { hp: u.hp * m * (t?.hp ?? 1), atk: u.atk * m * (t?.atk ?? 1), def: u.def * m };
  const k = side.kitStats;
  return k && (k.hp || k.atk || k.def) ? { hp: s.hp * (1 + k.hp), atk: s.atk * (1 + k.atk), def: s.def * (1 + k.def) } : s;
}

export function sideTraits(side: Pick<ArmySide, "civ" | "unit" | "traits" | "gear">): CombatTraits {
  if (side.unit) return { ...NEUTRAL_TRAITS, ...side.traits };
  const t = COMBAT_TRAITS[side.civ];
  const g = side.gear;
  if (!g) return t;
  // 🗡️ A set's edge sharpens the civilization's own trait
  return {
    firstRoundAtkMult: t.firstRoundAtkMult * g.firstAtk,
    armorPierce: Math.min(0.9, t.armorPierce + g.pierce),
    damageTakenMult: t.damageTakenMult * g.taken,
    firstRoundDamageTakenMult: t.firstRoundDamageTakenMult * g.firstTaken,
    outnumberAtkBonus: t.outnumberAtkBonus + g.outnumber
  };
}

function strike(
  from: ArmySide,
  role: Role,
  fromCount: number,
  to: ArmySide,
  toCount: number,
  fromFirstRound: boolean,
  toFirstRound: boolean,
  roll: number,
  outnumberRatio?: number
): number {
  if (from.artMods?.frozen) return 0;
  const unit = sideUnit(from, to, role);
  const traits = sideTraits(from);
  const targetTraits = sideTraits(to);

  const armor =
    sideUnit(to, from, other(role)).def *
    getFortificationMult(to) *
    (to.famished ? FAMINE_DEF_MULT : 1) *
    (1 - traits.armorPierce) *
    (to.artMods?.def ?? 1);
  const reduction = armor / (armor + COMBAT.ARMOR_K);
  const ratio = outnumberRatio !== undefined ? outnumberRatio : fromCount / Math.max(1, toCount);
  const outnumber = Math.min(1, Math.max(0, ratio - 1));
  const atk =
    unit.atk *
    (fromFirstRound ? traits.firstRoundAtkMult : 1) *
    (1 + traits.outnumberAtkBonus * outnumber) *
    (from.atkBonusMult ?? 1) *
    (from.artMods?.atk ?? 1);
  // Walls by tier also cut the damage defenders take (tier 0 = full damage)
  const walls = to.fortified ? wallDamageTakenForTier(to.wallTier ?? 0) : 1;
  const taken = targetTraits.damageTakenMult * (toFirstRound ? targetTraits.firstRoundDamageTakenMult : 1) * walls * (to.artMods?.taken ?? 1);
  return fromCount * atk * (1 - reduction) * taken * roll;
}

export function simulateBattle(attacker: ArmySide, defender: ArmySide, rng: () => number): BattleSimResult {
  // Standing buffs/debuffs (CIV_MODIFIERS) are already in the effective stats
  const attHp = sideUnit(attacker, defender, "attacking").hp;
  const defHp = sideUnit(defender, attacker, "defending").hp;
  const roll = () => 1 + (rng() * 2 - 1) * COMBAT.VARIANCE;

  let att = attacker.count;
  let def = defender.count;
  // Damage that didn't add up to a whole kill carries over, so small armies still wear a garrison down
  let carryOnDef = 0;
  let carryOnAtt = 0;
  const rounds: BattleRound[] = [];

  for (let round = 1; round <= COMBAT.MAX_ROUNDS && att > 0 && def > 0; round++) {
    const first = round === 1;
    const attackerDamage = strike(attacker, "attacking", att, defender, def, first, first, roll());
    const defenderDamage = strike(defender, "defending", def, attacker, att, first, first, roll());

    carryOnDef += attackerDamage;
    carryOnAtt += defenderDamage;
    const defenderLosses = Math.min(def, Math.floor(carryOnDef / defHp));
    const attackerLosses = Math.min(att, Math.floor(carryOnAtt / attHp));
    carryOnDef -= defenderLosses * defHp;
    carryOnAtt -= attackerLosses * attHp;
    def -= defenderLosses;
    att -= attackerLosses;

    rounds.push({
      round,
      attackerDamage: Math.round(attackerDamage),
      defenderDamage: Math.round(defenderDamage),
      attackerLosses,
      defenderLosses,
      attackerRemaining: att,
      defenderRemaining: def
    });
  }

  return {
    rounds,
    attackerLosses: attacker.count - att,
    defenderLosses: defender.count - def,
    attackerWon: def === 0 && att > 0
  };
}

/** What every fighter in a live battle may carry for Battle Arts (all optional: plain soldiers carry none) */
interface ArtsBearer {
  /** The unit's Battle Arts (a world boss, a mercenary band, a champion, the horror) */
  kit?: UnitKit;
  /** Its casts so far this battle */
  arts?: ArtsState;
  /** Statuses on it (Burn, Ward…) */
  statuses?: StatusInstance[];
  /** Battle round a Paralyze last landed on it (bosses never take two in a row) */
  paralyzedRound?: number;
  /**
   * Share of its army's own blow its kit carries (1 when missing): a champion is one hero in an army, so its Arts strike,
   * its statuses bite and its Instincts lift at this share of what the same kit on a whole band would
   */
  artShare?: number;
}

export interface LiveAttackerStack extends ArtsBearer {
  marchId: string;
  attackerId: string;
  attackerName: string;
  civ: CivilizationType;
  count: number;
  initialCount: number;
  /** The march left the battle before it ended (recalled, fell back or wiped out): it takes no plunder at the end */
  left?: boolean;
  joinedRound: number;
  roundsFought: number;
  carryDamageTaken: number;
  totalDamageDealt: number;
  totalLosses: number;
  atkBonusMult?: number;
  /** The army owner's milestone title buffs (attached each round by the war engine) */
  titleBuffs?: TitleBuffs;
  /** Share of its blow that lands (world bosses' Colossus Hide by the owner's City Hall; attached each round) */
  damageMult?: number;
  /** A named unit fighting with its own stats instead of `civ`'s soldier (the Sparring Grounds), and its traits */
  unit?: UnitStats;
  traits?: Partial<CombatTraits>;
  /** Rounds it fights before falling back (a rally's armies fight COMBAT.RALLY_MAX_ROUNDS; default COMBAT.MAX_ROUNDS) */
  maxRounds?: number;
  /** 🪙 A mercenary band (bookkeeping only, combat ignores it): its losses are strength, its soldier-equivalents of `fullCount` */
  band?: { id: string; fullCount: number; rarity: string; emblem: string };
  /** 🗡️ The armory set the march wears (warEngine attaches its `gear` each round, by the target's share) */
  armory?: { rarity: string; name: string; emblem: string };
  gear?: GearStats;
  /** 🦸 The champion leading the march (its kit is `kit`, at `artShare`) */
  champion?: ChampionInBattle;
  /** 🦸 Its champion fell when the march was wiped out (bookkeeping) */
  championFell?: boolean;
  /** 🌙 Moonwell Healers: of `totalLosses`, how many the war engine settled as dead and as wounded (bookkeeping) */
  dead?: number;
  wounded?: number;
}

/** Rounds a stack fights before it falls back, counted from its own arrival */
export const maxRoundsOf = (s: Pick<LiveAttackerStack, "maxRounds">) => s.maxRounds ?? COMBAT.MAX_ROUNDS;

/** 🪙 Sellswords hang back: the defenders strike a ruler's own soldiers before any mercenary band (each keeps its arrival order) */
export const byFront = (list: LiveAttackerStack[]) => [...list.filter((s) => !s.band), ...list.filter((s) => s.band)];

/** Allied troops stationed in the castle: their own group, own civ stats, the host's walls */
export interface DefenderGroup extends ArtsBearer {
  /** The reinforcement's march id, or `band:<id>` for a mercenary band of the host defending its walls */
  marchId: string;
  ownerId: string;
  ownerName: string;
  civ: CivilizationType;
  count: number;
  initialCount: number;
  famished?: boolean;
  roundsFought: number;
  carryDamageTaken: number;
  totalLosses: number;
  /** The owner's milestone title buffs (attached each round by the war engine; never a band's) */
  titleBuffs?: TitleBuffs;
  /** 🪙 A mercenary band of the host on its walls (bookkeeping only, combat ignores it): its losses are strength, its kit is `kit` */
  band?: { id: string; fullCount: number; rarity: string; emblem: string };
  /** 🌙 Moonwell Healers: of `totalLosses`, how many were settled as dead and as wounded (bookkeeping) */
  dead?: number;
  wounded?: number;
}

export interface LiveDefenderState extends ArtsBearer {
  civ: CivilizationType;
  count: number;
  initialCount: number;
  famished?: boolean;
  fortified?: boolean;
  wallTier?: number;
  wallDefMult?: number;
  roundsFought: number;
  carryDamageTaken: number;
  totalLosses: number;
  /** World NPC pack defending (mobs / bandits fight in the open) */
  unit?: UnitStats;
  traits?: Partial<CombatTraits>;
  /** Which map NPC the pack is (bookkeeping only, combat ignores it) */
  npc?: { type: string; category?: NPCCategory; rarity?: NPCRarity; emblem: string; unitName: string; expiresAt: string | null };
  /** A gathering march defending itself at a node (bookkeeping only, combat ignores it) */
  gather?: { marchId: string; ownerId: string; ownerName: string };
  /** Reinforcements fighting beside the home garrison */
  reinforcements?: DefenderGroup[];
  /** World boss bookkeeping: max HP and HP when this battle started (combat ignores it) */
  boss?: { maxHp: number; hpAtStart: number; lifeKey: string; weekKey: string };
  /** Multiplier on the home garrison's HP, ATK and DEF (Overseer's Resolve) */
  statMult?: number;
  /** Resolve stacks behind `statMult` (bookkeeping for the report) */
  grudgeStacks?: number;
  /** The home garrison's ruler's milestone title buffs (attached each round by the war engine) */
  titleBuffs?: TitleBuffs;
  /** 🩸 The last round was fought under a Blood Moon (bookkeeping for the log, combat ignores it) */
  bloodMoon?: boolean;
  /** 🗿 A world boss hit Titan's Endurance this battle (no more of its HP falls in it) */
  endured?: boolean;
  /** 🌋 A world boss in Colossus's Wrath for the rest of this battle (one ruler took BOSS_WRATH.trigger of its HP) */
  wrath?: boolean;
  /** How reports name the home garrison (defaults to its kit's name, its NPC's unit name, or "the garrison") */
  name?: string;
  /** An NPC kingdom's garrison: HP and ATK multipliers that pay for its kit (warConfig `kitTrimFor`) */
  kitTrim?: { hp: number; atk: number };
  /** 🗡️ The home garrison in the sets at home, blended by the share wearing each (attached each round by the war engine) */
  gear?: GearStats;
  /** 🦸 The ruler's champion leading the home garrison while it is home (attached each round by the war engine; its kit is `kit`) */
  champion?: ChampionInBattle;
  /**
   * 🦸 The champion who led the home garrison in this battle, kept for the report after it left or fell (bookkeeping):
   * `roundsLed` it led the walls, `away` while it is out at the head of a march (it doesn't fall with a garrison it left)
   */
  championLed?: { id: string; userId: string; name: string; level: number; fell?: boolean; away?: boolean; roundsLed?: number };
  /** 🌙 Moonwell Healers: of the home garrison's `totalLosses`, how many were settled as dead and as wounded (bookkeeping) */
  dead?: number;
  wounded?: number;
}

/** Every defender still standing: home garrison + stationed reinforcements */
export const totalDefenders = (d: LiveDefenderState) => d.count + (d.reinforcements ?? []).reduce((sum, g) => sum + g.count, 0);
export const totalDefendersInitial = (d: LiveDefenderState) => d.initialCount + (d.reinforcements ?? []).reduce((sum, g) => sum + g.initialCount, 0);
export const totalDefenderLosses = (d: LiveDefenderState) => d.totalLosses + (d.reinforcements ?? []).reduce((sum, g) => sum + g.totalLosses, 0);

export interface LiveRoundStepResult {
  roundSummary: BattleRound;
  stackLosses: Record<string, number>;
  stackDamageDealt: Record<string, number>;
  /** All defender losses this round (home + reinforcements) */
  defenderLosses: number;
  /** Losses of the home garrison this round */
  homeLosses: number;
  /** Losses per reinforcement group (march id) this round */
  groupLosses: Record<string, number>;
  wallDamage: number;
  /** Soldiers brought back by Arts this round (stack march id, reinforcement march id, or "home"); they were counted as losses before */
  healed: Record<string, number>;
}

type GroupRef = {
  key: string;
  side: ArmySide;
  state: { count: number; carryDamageTaken: number; totalLosses: number; roundsFought: number };
};

/** One fighter as Battle Arts see it: an attacking stack, the home garrison or a reinforcement group */
interface Fighter {
  key: string;
  role: Role;
  name: string;
  st: { count: number; initialCount: number; carryDamageTaken: number; totalLosses: number; roundsFought: number } & ArtsBearer;
  /** Its side as it fights right now (statuses included) */
  side: () => ArmySide;
  /** Carried damage is in whole units (defender groups) rather than HP (attacking stacks) */
  unitCarry: boolean;
  boss: boolean;
  /** Share of its blow that lands (Colossus Hide) */
  dmgMult: number;
}

const strengthOf = (f: Fighter) =>
  f.unitCarry ? Math.max(0, f.st.count - f.st.carryDamageTaken) / Math.max(1, f.st.initialCount) : f.st.count / Math.max(1, f.st.initialCount);

/** Share of a fighter lost in this battle: a colossal unit's HP lost since the battle began, else its fallen */
const lostThisBattle = (f: Fighter) =>
  f.unitCarry && f.st.initialCount === 1 ? Math.max(0, f.st.carryDamageTaken - (f.st.arts?.carryAtStart ?? f.st.carryDamageTaken)) : 1 - strengthOf(f);

/** A kit's Instinct stats at its bearer's art share */
const scaledStats = (b: ArtsBearer) => {
  if (!b.kit) return undefined;
  const k = b.artShare ?? 1;
  const st = instinctStats(b.kit);
  return k === 1 ? st : { hp: st.hp * k, atk: st.atk * k, def: st.def * k };
};
/** An Enrage-like multiplier at its bearer's art share */
const scaledEnrage = (b: ArtsBearer, strength: number) => {
  const m = enrageMult(b.kit, strength);
  const k = b.artShare ?? 1;
  return k === 1 ? m : 1 + (m - 1) * k;
};

const hasArtMods = (m: { atk: number; def: number; taken: number; frozen: boolean }) => m.atk !== 1 || m.def !== 1 || m.taken !== 1 || m.frozen;

/**
 * Step a single 10-second live battle round across 1..N attacking stacks (ordered by arrival time) and
 * the defenders (home garrison + reinforcement groups). Each attacking stack splits its blow across the
 * defender groups by headcount; every defender group strikes back with its own stats, aimed at the
 * earliest-arrived stack first (a ruler's own soldiers before any mercenary band). Mutates `stacks` and `defender` in place.
 *
 * Battle Arts (battleArts.ts) wrap the exchange: every unit with a kit casts first (the garrison, then the stacks in
 * arrival order: its Finale in its own slot, then at most one Art), the statuses on each fighter shape its blow, and
 * damage over time ticks once the blows have landed. `battleSeed` (the battle id) seeds the Arts' tie-breaking roll.
 */
export function stepBattleRound(
  roundNumber: number,
  stacks: LiveAttackerStack[],
  defender: LiveDefenderState,
  rng: () => number,
  omen?: BattleOmen | null,
  battleSeed = "battle"
): LiveRoundStepResult {
  const civAtk = (civ: CivilizationType) => omen?.civAtkMult[civ] ?? 1;
  // A world NPC (mob, bandit pack, boss) fights the Blood Moon's way; NPC realms, gatherers and rulers do not
  const wildNpc = Boolean(omen && defender.unit && defender.npc && defender.npc.category !== "kingdom" && !defender.gather);
  const roll = () => 1 + (rng() * 2 - 1) * COMBAT.VARIANCE;
  const groupLosses: Record<string, number> = {};
  const stackLosses: Record<string, number> = {};
  const stackDamageDealt: Record<string, number> = {};
  const healed: Record<string, number> = {};
  const events: BattleArtEvent[] = [];
  // Kills and damage that Arts and statuses add this round, per fighter key
  const artLosses: Record<string, number> = {};
  const artDealt: Record<string, number> = {};
  let artDamageAtt = 0;
  let artDamageDef = 0;

  const fortified = defender.fortified ?? true;
  const homeName = defender.name ?? defender.kit?.name ?? defender.npc?.unitName ?? "the garrison";

  const homeSide = (): ArmySide => {
    // A boss is one unit: the share of it still standing is its HP fraction (Enrage)
    const hpFrac = Math.max(0, defender.count - defender.carryDamageTaken) / Math.max(1, defender.initialCount);
    // 🌋 Colossus's Wrath multiplies with the boss's own Enrage
    const enraged = scaledEnrage(defender, hpFrac) * (defender.wrath ? BOSS_WRATH.atkMult : 1);
    const mods = statusMods(defender.statuses);
    const art = { atk: mods.atkMult * (defender.unit ? 1 : enraged), def: mods.defMult, taken: mods.takenMult, frozen: mods.frozen };
    return {
      civ: defender.civ,
      count: defender.count,
      fortified,
      wallTier: defender.wallTier,
      wallDefMult: defender.wallDefMult,
      famished: defender.famished,
      unit: enraged !== 1 && defender.unit ? { ...defender.unit, atk: defender.unit.atk * enraged } : defender.unit,
      traits: defender.traits,
      statMult: wildNpc ? (defender.statMult ?? 1) * omen!.npcStatMult : defender.statMult,
      atkBonusMult: defender.unit ? undefined : civAtk(defender.civ) !== 1 ? civAtk(defender.civ) : undefined,
      titleBuffs: defender.unit ? undefined : defender.titleBuffs,
      kitStats: scaledStats(defender),
      kitTrim: defender.kitTrim,
      gear: defender.unit ? undefined : defender.gear,
      champion: defender.unit ? undefined : defender.champion,
      artMods: hasArtMods(art) ? art : undefined
    };
  };
  const reinforcementSide = (g: DefenderGroup): ArmySide => {
    // A band on the walls fights with its kit (Instincts, Enrage) like a band in the field
    const enraged = scaledEnrage(g, g.count / Math.max(1, g.initialCount));
    const mods = statusMods(g.statuses);
    const art = { atk: mods.atkMult * enraged, def: mods.defMult, taken: mods.takenMult, frozen: mods.frozen };
    return {
      civ: g.civ,
      count: g.count,
      fortified,
      wallTier: defender.wallTier,
      wallDefMult: defender.wallDefMult,
      famished: g.famished,
      titleBuffs: g.band ? undefined : g.titleBuffs,
      kitStats: scaledStats(g),
      atkBonusMult: civAtk(g.civ) !== 1 ? civAtk(g.civ) : undefined,
      artMods: hasArtMods(art) ? art : undefined
    };
  };
  const stackSide = (stack: LiveAttackerStack): ArmySide => {
    const enraged = scaledEnrage(stack, stack.count / Math.max(1, stack.initialCount));
    const mods = statusMods(stack.statuses);
    const art = { atk: mods.atkMult * enraged, def: mods.defMult, taken: mods.takenMult, frozen: mods.frozen };
    return {
      civ: stack.civ,
      count: stack.count,
      unit: stack.unit,
      traits: stack.traits,
      atkBonusMult: (stack.atkBonusMult ?? 1) * civAtk(stack.civ),
      titleBuffs: stack.unit ? undefined : stack.titleBuffs,
      kitStats: scaledStats(stack),
      gear: stack.unit || stack.band ? undefined : stack.gear,
      champion: stack.unit || stack.band ? undefined : stack.champion,
      artMods: hasArtMods(art) ? art : undefined
    };
  };

  const stackFighters: Fighter[] = byFront(stacks)
    .filter((s) => s.count > 0)
    .map((s) => ({ key: s.marchId, role: "attacking", name: s.kit?.name ?? s.attackerName, st: s, side: () => stackSide(s), unitCarry: false, boss: Boolean(s.kit?.boss), dmgMult: s.damageMult ?? 1 }));
  const groupFighters: Fighter[] = [];
  if (defender.count > 0) {
    groupFighters.push({ key: "home", role: "defending", name: homeName, st: defender, side: homeSide, unitCarry: true, boss: Boolean(defender.kit?.boss || defender.boss), dmgMult: 1 });
  }
  for (const g of defender.reinforcements ?? []) {
    if (g.count > 0) groupFighters.push({ key: g.marchId, role: "defending", name: g.kit?.name ?? g.ownerName, st: g, side: () => reinforcementSide(g), unitCarry: true, boss: false, dmgMult: 1 });
  }
  const fighters = [...groupFighters, ...stackFighters];
  if (stackFighters.length === 0 || groupFighters.length === 0) {
    return {
      roundSummary: {
        round: roundNumber,
        attackerDamage: 0,
        defenderDamage: 0,
        attackerLosses: 0,
        defenderLosses: 0,
        attackerRemaining: stacks.reduce((sum, s) => sum + Math.max(0, s.count), 0),
        defenderRemaining: totalDefenders(defender)
      },
      stackLosses,
      stackDamageDealt,
      defenderLosses: 0,
      homeLosses: 0,
      groupLosses,
      wallDamage: 0,
      healed
    };
  }

  // 🗿 Titan's Endurance: a world boss (one colossal unit) loses at most BOSS_BATTLE_CAP.share of its max HP in a battle,
  // counted from its HP when the battle began (`carryDamageTaken` is the share of its HP gone)
  const bossStart = defender.initialCount === 1 && defender.boss ? 1 - defender.boss.hpAtStart / Math.max(1, defender.boss.maxHp) : null;
  const bossCap = bossStart !== null ? bossStart + BOSS_BATTLE_CAP.share : Infinity;
  const capBoss = (st: { carryDamageTaken: number }) => {
    if (st !== defender || st.carryDamageTaken <= bossCap) return;
    st.carryDamageTaken = bossCap;
    if (!defender.endured) {
      defender.endured = true;
      events.push({ kind: "instinct", side: "defender", unit: homeName, id: "titans_endurance", name: BOSS_BATTLE_CAP.name, emblem: BOSS_BATTLE_CAP.emblem });
    }
  };

  /** HP of one of `f`'s soldiers against `foe` */
  const hpOf = (f: Fighter, foe: ArmySide) => Math.max(1e-9, sideUnit(f.side(), foe, f.role).hp);
  /** Damage from Arts or statuses: whole soldiers fall as it adds up, the rest carries over */
  const hurt = (f: Fighter, dmg: number, foe: ArmySide): number => {
    if (f.st.count <= 0 || !(dmg > 0)) return 0;
    const hp = hpOf(f, foe);
    let lost: number;
    if (f.unitCarry) {
      f.st.carryDamageTaken += dmg / hp;
      capBoss(f.st);
      lost = Math.min(f.st.count, Math.floor(f.st.carryDamageTaken));
      f.st.carryDamageTaken -= lost;
    } else {
      f.st.carryDamageTaken += dmg;
      lost = Math.min(f.st.count, Math.floor(f.st.carryDamageTaken / hp));
      f.st.carryDamageTaken -= lost * hp;
    }
    f.st.count -= lost;
    f.st.totalLosses += lost;
    if (f.st.count <= 0 && !f.unitCarry) f.st.carryDamageTaken = 0;
    artLosses[f.key] = (artLosses[f.key] ?? 0) + lost;
    return lost;
  };
  /** `from`'s full blow on `to` this round, without the roll */
  const blowOf = (from: Fighter, to: Fighter) =>
    strike(from.side(), from.role, from.st.count, to.side(), Math.max(1, to.st.count), from.st.roundsFought === 0, to.st.roundsFought === 0, 1) * from.dmgMult;
  const enemiesOf = (f: Fighter) => (f.role === "attacking" ? groupFighters : stackFighters).filter((x) => x.st.count > 0);
  const alliesOf = (f: Fighter) => (f.role === "attacking" ? stackFighters : groupFighters).filter((x) => x.st.count > 0);
  const sideOfEvent = (f: Fighter): "attacker" | "defender" => (f.role === "attacking" ? "attacker" : "defender");
  const credit = (from: Fighter | undefined, role: Role, dmg: number) => {
    if (role === "attacking") artDamageAtt += dmg;
    else artDamageDef += dmg;
    if (from) artDealt[from.key] = (artDealt[from.key] ?? 0) + dmg;
  };

  const cast = (c: Fighter, art: Art, finale: boolean, lastStand: boolean) => {
    // 🦸 A champion's Arts carry its own arm's share of its army's blow
    const k = c.st.artShare ?? 1;
    const enemies = enemiesOf(c);
    const targets =
      art.target === "self" ? [c] : art.target === "allies" ? alliesOf(c) : art.target === "enemies" ? enemies : enemies.length ? [enemies.find((e) => e.key === "home") ?? enemies[0]] : [];
    const head = targets.reduce((n, t) => n + t.st.count, 0);
    let losses = 0;
    let damage = 0;
    let back = 0;
    const broke: string[] = [];
    for (const eff of art.effect) {
      for (const t of targets) {
        if (t.st.count <= 0) continue;
        const share = art.target === "enemies" ? t.st.count / Math.max(1, head) : 1;
        if (eff.kind === "strike") {
          const dmg = blowOf(c, t) * eff.power * share * k;
          const lost = hurt(t, dmg, c.side());
          damage += dmg;
          losses += lost;
          credit(c, c.role, dmg);
          if (finale && lost > 0 && t.st.count <= 0) broke.push(t.name);
        } else if (eff.kind === "status") {
          const rule = STATUS_RULES[eff.status];
          const tick = rule.dot ? blowOf(c, t) * eff.value * share * k : undefined;
          applyStatus(t.st, { kind: eff.status, source: c.key, sourceName: c.name, rounds: eff.rounds ?? rule.rounds, value: rule.dot ? eff.value : eff.value * k, tick }, t.boss, roundNumber);
        } else if (t.unitCarry && t.st.initialCount === 1) {
          // One colossal unit: HP it lost in this battle restored (never what earlier battles took)
          t.st.carryDamageTaken -= lostThisBattle(t) * eff.share * k;
        } else {
          const n = Math.floor(t.st.totalLosses * eff.share * k);
          t.st.count += n;
          t.st.totalLosses -= n;
          healed[t.key] = (healed[t.key] ?? 0) + n;
          back += n;
        }
      }
    }
    events.push({
      kind: finale ? "finale" : "cast",
      side: sideOfEvent(c),
      unit: c.name,
      id: art.id,
      name: art.name,
      emblem: art.emblem,
      ...(targets.length === 1 && targets[0] !== c ? { target: targets[0].name } : {}),
      ...(losses ? { losses } : {}),
      ...(damage ? { damage: Math.round(damage) } : {}),
      ...(back ? { healed: back } : {}),
      ...(lastStand ? { lastStand } : {}),
      ...(broke.length ? { broke } : {}),
      fx: art.fx,
      sound: art.sound
    });
  };

  // 0. Battle Arts: every unit with a kit casts before the blows (the garrison first, then the armies by arrival)
  for (const c of fighters) {
    const kit = c.st.kit;
    if (!kit || c.st.count <= 0 || enemiesOf(c).length === 0) continue;
    const state = (c.st.arts ??= { ready: {}, cast: {}, carryAtStart: c.st.carryDamageTaken });
    const ctx = { round: c.st.roundsFought + 1, strength: strengthOf(c), lost: lostThisBattle(c), enemyFront: strengthOf(enemiesOf(c)[0]) };
    const fin = finaleNow(kit, state, ctx);
    if (fin) {
      markCast(state, fin.art, ctx.round, true);
      cast(c, fin.art, true, fin.lastStand);
    }
    if (enemiesOf(c).length === 0) continue;
    const art = pickArt(kit, state, ctx, artRoll(battleSeed, c.key, roundNumber));
    if (art) {
      markCast(state, art, ctx.round, false);
      cast(c, art, false, false);
    }
  }

  const activeStacks = stacks.filter((s) => s.count > 0);
  const totalAttBefore = activeStacks.reduce((sum, s) => sum + s.count, 0);
  const groups: GroupRef[] = [];
  if (defender.count > 0) groups.push({ key: "home", side: homeSide(), state: defender });
  for (const g of defender.reinforcements ?? []) {
    if (g.count <= 0) continue;
    groups.push({ key: g.marchId, side: reinforcementSide(g), state: g });
  }
  const defBefore = groups.reduce((sum, g) => sum + g.state.count, 0);

  let totalAttackerDamage = 0;
  let totalDefenderDamage = 0;
  let totalAttackerLosses = 0;
  const killsByGroup = new Map<string, number>();
  if (totalAttBefore > 0 && defBefore > 0) {
    // 1. Every present attacking army strikes; its blow is split across the defender groups by headcount
    for (const stack of activeStacks) {
      const attSide = stackSide(stack);
      const attFirstRound = stack.roundsFought === 0;
      const r = roll();
      let dealt = 0;
      for (const g of groups) {
        const share = g.state.count / defBefore;
        const dmg =
          strike(attSide, "attacking", stack.count, g.side, defBefore, attFirstRound, g.state.roundsFought === 0, r, totalAttBefore / Math.max(1, defBefore)) * share * (stack.damageMult ?? 1);
        dealt += dmg;
        killsByGroup.set(g.key, (killsByGroup.get(g.key) ?? 0) + dmg / Math.max(1, sideUnit(g.side, attSide, "defending").hp));
      }
      stackDamageDealt[stack.marchId] = Math.round(dealt);
      stack.totalDamageDealt += Math.round(dealt);
      totalAttackerDamage += dealt;
    }

    // 2. Every defender group strikes back, focusing the earliest-arrived stack (soldiers before bands) and spilling overflow onto the next
    let remainingDefForceShare = 1.0;
    const defRoll = roll();

    for (const stack of byFront(activeStacks)) {
      if (remainingDefForceShare <= 0) {
        stackLosses[stack.marchId] = 0;
        continue;
      }
      const attSide = stackSide(stack);
      const attFirstRound = stack.roundsFought === 0;
      let fullDmgVsStack = 0;
      for (const g of groups) {
        fullDmgVsStack += strike(g.side, "defending", g.state.count, attSide, totalAttBefore, g.state.roundsFought === 0, attFirstRound, defRoll, defBefore / Math.max(1, totalAttBefore));
      }
      const dmgAvailable = fullDmgVsStack * remainingDefForceShare;
      // HP per soldier of this stack against the home garrison's civ (or the first group's)
      const attHp = sideUnit(attSide, groups[0].side, "attacking").hp;
      const hpPoolNeededToWipe = Math.max(0, stack.count * attHp - stack.carryDamageTaken);

      if (dmgAvailable >= hpPoolNeededToWipe && stack.count > 0) {
        const usedShare = fullDmgVsStack > 0 ? hpPoolNeededToWipe / fullDmgVsStack : 0;
        remainingDefForceShare = Math.max(0, remainingDefForceShare - usedShare);
        totalDefenderDamage += hpPoolNeededToWipe;
        const lost = stack.count;
        stack.count = 0;
        stack.carryDamageTaken = 0;
        stack.totalLosses += lost;
        stackLosses[stack.marchId] = lost;
        totalAttackerLosses += lost;
      } else {
        totalDefenderDamage += dmgAvailable;
        stack.carryDamageTaken += dmgAvailable;
        const lost = Math.min(stack.count, Math.floor(stack.carryDamageTaken / attHp));
        stack.carryDamageTaken -= lost * attHp;
        stack.count -= lost;
        stack.totalLosses += lost;
        stackLosses[stack.marchId] = lost;
        totalAttackerLosses += lost;
        remainingDefForceShare = 0;
      }
    }

    // 2b. Cull Instincts (a boss's Cleave): every enemy army still standing loses a share of its soldiers on top of the blow
    const homeCull = cullShare(defender.kit) * (defender.artShare ?? 1);
    if (homeCull > 0 && groups.some((g) => g.key === "home")) {
      let cut = 0;
      for (const stack of activeStacks) {
        if (stack.count <= 0) continue;
        let n: number;
        if (stack.kit?.boss && stack.initialCount === 1) {
          // One colossal unit (a boss in the Sparring Grounds) loses that share of its HP, as a defending boss does
          const hp = Math.max(1e-9, sideUnit(stackSide(stack), groups[0].side, "attacking").hp);
          stack.carryDamageTaken += homeCull * hp;
          n = Math.min(stack.count, Math.floor(stack.carryDamageTaken / hp));
          stack.carryDamageTaken -= n * hp;
          if (n <= 0) continue;
        } else {
          n = Math.min(stack.count, Math.max(1, Math.floor(stack.count * homeCull)));
        }
        stack.count -= n;
        stack.totalLosses += n;
        stackLosses[stack.marchId] = (stackLosses[stack.marchId] ?? 0) + n;
        totalAttackerLosses += n;
        cut += n;
      }
      const inst = defender.kit!.instincts.map((id) => INSTINCTS[id]).find((i) => i?.effect.kind === "cull");
      if (inst && cut > 0) events.push({ kind: "instinct", side: "defender", unit: homeName, id: inst.id, name: inst.name, emblem: inst.emblem, losses: cut });
    }
    // An attacking unit's cut lands on every defender group (one colossal unit loses that share of its HP)
    for (const f of stackFighters) {
      const share = cullShare(f.st.kit) * (f.st.artShare ?? 1);
      if (share <= 0 || f.st.count <= 0) continue;
      let cut = 0;
      for (const g of groupFighters) {
        if (g.st.count <= 0) continue;
        const hp = hpOf(g, f.side());
        cut += hurt(g, (g.st.initialCount === 1 ? share : Math.max(1, Math.floor(g.st.count * share))) * hp, f.side());
      }
      const inst = f.st.kit!.instincts.map((id) => INSTINCTS[id]).find((i) => i?.effect.kind === "cull");
      if (inst && cut > 0) events.push({ kind: "instinct", side: "attacker", unit: f.name, id: inst.id, name: inst.name, emblem: inst.emblem, losses: cut });
    }
  }

  // 3. Apply defender losses group by group
  let defenderLosses = 0;
  let homeLosses = 0;
  for (const g of groups) {
    g.state.carryDamageTaken += killsByGroup.get(g.key) ?? 0;
    capBoss(g.state);
    const lost = Math.min(g.state.count, Math.floor(g.state.carryDamageTaken));
    g.state.carryDamageTaken -= lost;
    g.state.count -= lost;
    g.state.totalLosses += lost;
    g.state.roundsFought += 1;
    defenderLosses += lost;
    if (g.key === "home") homeLosses = lost;
    else groupLosses[g.key] = lost;
  }

  // 4. Damage over time ticks on everyone still standing (a wiped caster's ticks still land), then every status counts down.
  // What held on each side this round, before the count-down: the map and the Sparring Grounds show it while the round plays
  const held = { attacker: new Set<StatusInstance["kind"]>(), defender: new Set<StatusInstance["kind"]>() };
  for (const t of fighters) {
    const list = t.st.statuses;
    if (!list?.length) continue;
    if (t.st.count > 0) for (const s of list) if (s.rounds > 0) held[sideOfEvent(t)].add(s.kind);
    const byKind = new Map<string, { losses: number; damage: number }>();
    for (const s of list) {
      if (!s.tick || s.rounds <= 0 || t.st.count <= 0) continue;
      const dmg = s.tick * (s.stacks ?? 1) * (s.kind === "bleed" ? 1 + BLEED_GROWTH * (1 - strengthOf(t)) : 1);
      const source = fighters.find((f) => f.key === s.source);
      const lost = hurt(t, dmg, source ? source.side() : t.side());
      credit(source, t.role === "attacking" ? "defending" : "attacking", dmg);
      const sum = byKind.get(s.kind) ?? { losses: 0, damage: 0 };
      sum.losses += lost;
      sum.damage += dmg;
      byKind.set(s.kind, sum);
    }
    for (const [kind, sum] of byKind) {
      const rule = STATUS_RULES[kind as StatusInstance["kind"]];
      events.push({ kind: "tick", side: sideOfEvent(t), unit: t.name, id: kind, name: rule.name, emblem: rule.emblem, ...(sum.losses ? { losses: sum.losses } : {}), damage: Math.round(sum.damage) });
    }
    for (const s of list) s.rounds -= 1;
    t.st.statuses = t.st.count > 0 ? list.filter((s) => s.rounds > 0) : [];
  }

  // 🌋 Colossus's Wrath: every army in the fight is one ruler's, and they took BOSS_WRATH.trigger of the boss's max HP this battle
  if (bossStart !== null && !defender.wrath && defender.count > 0 && new Set(stacks.map((s) => s.attackerId)).size === 1 && defender.carryDamageTaken - bossStart >= BOSS_WRATH.trigger) {
    defender.wrath = true;
    events.push({ kind: "instinct", side: "defender", unit: homeName, id: "colossus_wrath", name: BOSS_WRATH.name, emblem: BOSS_WRATH.emblem });
  }

  // Enrage wakes: said once, the round it starts
  for (const f of fighters) {
    if (f.st.count <= 0 || !f.st.kit) continue;
    for (const id of f.st.kit.instincts) {
      const e = INSTINCTS[id]?.effect;
      if (e?.kind !== "enrage" || strengthOf(f) >= e.below) continue;
      const state = (f.st.arts ??= { ready: {}, cast: {} });
      if (state.cast[id]) continue;
      state.cast[id] = [f.st.roundsFought];
      events.push({ kind: "instinct", side: sideOfEvent(f), unit: f.name, id, name: INSTINCTS[id].name, emblem: INSTINCTS[id].emblem });
    }
  }

  // Arts' kills and damage join the round's numbers
  for (const f of stackFighters) {
    const lost = artLosses[f.key] ?? 0;
    if (lost) {
      stackLosses[f.key] = (stackLosses[f.key] ?? 0) + lost;
      totalAttackerLosses += lost;
    }
    const dealt = Math.round(artDealt[f.key] ?? 0);
    if (dealt) {
      stackDamageDealt[f.key] = (stackDamageDealt[f.key] ?? 0) + dealt;
      (f.st as LiveAttackerStack).totalDamageDealt += dealt;
    }
  }
  for (const f of groupFighters) {
    const lost = artLosses[f.key] ?? 0;
    if (!lost) continue;
    defenderLosses += lost;
    if (f.key === "home") homeLosses += lost;
    else groupLosses[f.key] = (groupLosses[f.key] ?? 0) + lost;
  }

  if (!groups.some((g) => g.key === "home")) defender.roundsFought += 1;
  // Every army that stood at the start of the round fought it (one wiped by a cast before the blows too)
  for (const f of stackFighters) f.st.roundsFought += 1;

  const totalAttRemaining = stacks.reduce((sum, s) => sum + s.count, 0);
  return {
    roundSummary: {
      round: roundNumber,
      attackerDamage: Math.round(totalAttackerDamage + artDamageAtt),
      defenderDamage: Math.round(totalDefenderDamage + artDamageDef),
      attackerLosses: totalAttackerLosses,
      defenderLosses,
      attackerRemaining: totalAttRemaining,
      defenderRemaining: totalDefenders(defender),
      ...(events.length ? { arts: events } : {}),
      ...(held.attacker.size || held.defender.size
        ? { statuses: { ...(held.attacker.size ? { attacker: [...held.attacker] } : {}), ...(held.defender.size ? { defender: [...held.defender] } : {}) } }
        : {})
    },
    stackLosses,
    stackDamageDealt,
    defenderLosses,
    homeLosses,
    groupLosses,
    wallDamage: defenderLosses * WALL_DMG_PER_DEFENDER_KILLED,
    healed
  };
}
