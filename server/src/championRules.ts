import type { ChampionLooks, ChampionSlot, CivilizationType } from "./types.js";
import { ARTS, FINALES, INSTINCTS, UnitKit } from "./battleArts.js";
import { hash } from "./kingdomUtils.js";

export type { ChampionLooks, ChampionSlot };

/**
 * 🦸 Champions (GAME_GUIDE §13 *Champions*): the pure rules, no database. Every kingdom has one rolled legendary hero.
 * It leads one soldier march at a time (an attack or a rally, by the ruler's choice) and leads the home garrison's
 * defence while it is home. The army it leads fights with its Battle Arts (2 Instincts, 2 Arts and a Finale, unlocked by
 * level) and a flat stat bonus by level. It levels on Renown from the battles it leads (an XP ledger), up to its
 * kingdom's City Hall level, and when the army it leads is wiped out it falls, wounded, and heals by itself.
 *
 * A champion is one hero in an army: its Arts strike with its own arm, CHAMPION_ART_SHARE of the army's blow, never the
 * whole army's (the same Arts on a mercenary band strike with the band's). `npm run sim:balance` holds a max-level
 * champion's march at most CHAMPION_MAX_GAIN over the same march without it, kit included, for every civilization and
 * the strongest kit it can roll.
 */

/** Highest level; a champion is never above its kingdom's City Hall level */
export const CHAMPION_MAX_LEVEL = 30;

/** Renown (XP) needed to reach `level` from level 1 */
export const xpForLevel = (level: number) => 20 * Math.max(0, Math.floor(level) - 1) ** 2;

/** Level from total Renown, before the City Hall cap */
export function levelForXp(xp: number): number {
  let l = 1;
  while (l < CHAMPION_MAX_LEVEL && xpForLevel(l + 1) <= xp) l++;
  return l;
}

/**
 * A champion's level, Renown banked above its City Hall cap, and progress to the next level. Its Renown is never lost:
 * what it earns past the cap waits and counts once the City Hall rises
 */
export function championLevelOf(xp: number, cityHallLevel: number): { level: number; banked: number; into: number; need: number | null } {
  const cap = Math.max(1, Math.min(CHAMPION_MAX_LEVEL, Math.floor(cityHallLevel)));
  const level = Math.min(levelForXp(Math.max(0, xp)), cap);
  const into = Math.max(0, xp - xpForLevel(level));
  if (level >= CHAMPION_MAX_LEVEL) return { level, banked: 0, into, need: null };
  // At the City Hall's cap: what it earns waits for the next City Hall level
  if (level >= cap) return { level, banked: into, into, need: null };
  return { level, banked: 0, into, need: xpForLevel(level + 1) - xpForLevel(level) };
}

/** Level each part of the kit unlocks at: 1 Instinct, the first Art, the second Art, the second Instinct, the Finale */
export const KIT_UNLOCKS = { instinct1: 1, art1: 5, art2: 10, instinct2: 15, finale: 20 } as const;

/** Stat shares the army a champion leads gains per champion level (HP, ATK and DEF alike); tuned with `npm run sim:balance` */
export const CHAMPION_STAT_PER_LEVEL = 0.003;
/** Share of its army's blow a champion's Arts and Instincts carry (it is one hero, not a band); tuned with `npm run sim:balance` */
export const CHAMPION_ART_SHARE = 0.13;
/** A max-level champion's march scores at most this much over the same march without it (sim:balance checks it) */
export const CHAMPION_MAX_GAIN = 0.25;

/** Kinds of target a champion's worth counts less against (CHAMPION_TARGET_SHARE) */
export type ChampionTarget = "gate" | "epic_pack";

/**
 * Share of a champion's worth (its stat bonus and its Arts' share) that counts against a kind of target (1 when
 * missing), like the Armory's Murder Holes and the bosses' Colossus Hide. sim:balance holds every PvE ceiling with a
 * champion of the ruler's City Hall level at the head of their march: a full frontier gate that holds against a lone
 * ruler still holds, and an epic pack still beats a lone City Hall 5 march as often as it did without one
 */
export const CHAMPION_TARGET_SHARE: Record<ChampionTarget, { share: number; name: string; emblem: string; description: string }> = {
  gate: {
    share: 0.1,
    name: "Marked from the Gatehouse",
    emblem: "🏯",
    description: "a champion counts a tenth of its worth against a frontier gate (every crossbow on the walls looks for the hero under the banner)"
  },
  epic_pack: {
    share: 0.3,
    name: "Legends of the Wild",
    emblem: "🐉",
    description: "a champion counts 30% of its worth against an epic or legendary roving pack (beasts and outlaws of legend don't break before a hero's banner)"
  }
};
/** The share of a champion's worth that counts against `target` */
export const championShareVs = (target: ChampionTarget | null | undefined) => (target ? CHAMPION_TARGET_SHARE[target].share : 1);

/** The flat stat bonus a champion of `level` gives the army it leads */
export const championStats = (level: number) => {
  const s = Math.round(CHAMPION_STAT_PER_LEVEL * Math.max(1, Math.min(CHAMPION_MAX_LEVEL, level)) * 10000) / 10000;
  return { hp: s, atk: s, def: s };
};

/* ------------------------------------------------------------------------- */
/* Battle Arts: rolled from a pool every civilization shares                  */
/* ------------------------------------------------------------------------- */

/** Instincts a champion may carry (stat Instincts: a champion lifts its army, it never culls) */
export const CHAMPION_INSTINCTS = ["thick_hide", "bloodlust", "stoneskin"] as const;
/** Arts a champion may carry (no Freeze: a hero's arm can't hold a whole army frozen) */
export const CHAMPION_ARTS = ["fireball", "frost_lance", "venom_volley", "rending_blow", "thunderclap", "shield_wall", "war_cry", "armor_break", "second_wind", "ambush", "blackpowder"] as const;
/** Finales a champion may carry */
export const CHAMPION_FINALES = ["dawnbreaker", "cataclysm", "sirens_requiem", "stinger_storm", "grasping_roots", "fae_glamour", "avalanche", "maelstrom", "sandstorm", "wild_hunt", "dragonfire"] as const;

/** The Arts a champion knows (carried over every civilization change): ids into battleArts */
export interface ChampionArts {
  instincts: [string, string];
  arts: [string, string];
  finale: string;
}

/** A champion's kit at `level`: what its level has unlocked, named for the reports */
export function championKit(name: string, a: ChampionArts, level: number): UnitKit {
  const instincts = [a.instincts[0], ...(level >= KIT_UNLOCKS.instinct2 ? [a.instincts[1]] : [])];
  const arts = [...(level >= KIT_UNLOCKS.art1 ? [a.arts[0]] : []), ...(level >= KIT_UNLOCKS.art2 ? [a.arts[1]] : [])];
  return { name, rarity: "legendary", instincts, arts, ...(level >= KIT_UNLOCKS.finale ? { finale: a.finale } : {}) };
}

/** Which slot of a champion's kit a Retraining may change, and what it may learn there */
export type KitSlot = "instinct1" | "instinct2" | "art1" | "art2" | "finale";
export const KIT_SLOTS: KitSlot[] = ["instinct1", "art1", "art2", "instinct2", "finale"];
export const poolFor = (slot: KitSlot): readonly string[] => (slot.startsWith("instinct") ? CHAMPION_INSTINCTS : slot === "finale" ? CHAMPION_FINALES : CHAMPION_ARTS);
export const kitSlotId = (a: ChampionArts, slot: KitSlot) =>
  slot === "instinct1" ? a.instincts[0] : slot === "instinct2" ? a.instincts[1] : slot === "art1" ? a.arts[0] : slot === "art2" ? a.arts[1] : a.finale;

/** Why `a` can't learn `id` in `slot` (null = it can): from the slot's pool, never twice the same */
export function retrainBlock(a: ChampionArts, slot: KitSlot, id: string): string | null {
  if (!poolFor(slot).includes(id)) return "A champion can't learn that there.";
  if (kitSlotId(a, slot) === id) return "It already knows that.";
  const twin: KitSlot | null = slot === "instinct1" ? "instinct2" : slot === "instinct2" ? "instinct1" : slot === "art1" ? "art2" : slot === "art2" ? "art1" : null;
  if (twin && kitSlotId(a, twin) === id) return "It already knows that in its other slot.";
  return null;
}

/** `a` with `slot` retrained to `id` */
export function retrained(a: ChampionArts, slot: KitSlot, id: string): ChampionArts {
  const n: ChampionArts = { instincts: [...a.instincts] as [string, string], arts: [...a.arts] as [string, string], finale: a.finale };
  if (slot === "instinct1") n.instincts[0] = id;
  else if (slot === "instinct2") n.instincts[1] = id;
  else if (slot === "art1") n.arts[0] = id;
  else if (slot === "art2") n.arts[1] = id;
  else n.finale = id;
  return n;
}

/** Every kit slot's name, for the books and the card */
export const KIT_SLOT_NAMES: Record<KitSlot, string> = { instinct1: "First Instinct", art1: "First Art", art2: "Second Art", instinct2: "Second Instinct", finale: "Finale" };
export const kitSlotLevel = (slot: KitSlot) => KIT_UNLOCKS[slot];
/** A kit id's name and emblem */
export const kitEntry = (id: string) => INSTINCTS[id] ?? ARTS[id] ?? FINALES[id];

/* ------------------------------------------------------------------------- */
/* Rolled looks                                                              */
/* ------------------------------------------------------------------------- */

/**
 * A champion's look, slot by slot, as indices into its civilization's part library (the client's champion kit): a
 * civilization change re-dresses the same champion in the new civilization's parts at the same indices
 */
export const CHAMPION_SLOTS: ChampionSlot[] = ["head", "face", "body", "armour", "cloak", "weapon", "aura", "mark"];
/** Options in every slot of every civilization's part library */
export const LOOK_OPTIONS = 4;

/** A seeded roll: the same seed always rolls the same champion */
function rng(seed: string) {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollLooks(seed: string): ChampionLooks {
  const r = rng(`looks:${seed}`);
  return Object.fromEntries(CHAMPION_SLOTS.map((s) => [s, Math.floor(r() * LOOK_OPTIONS)])) as ChampionLooks;
}

/** A champion's Arts, rolled once: two different Instincts, two different Arts and a Finale */
export function rollArts(seed: string): ChampionArts {
  const r = rng(`arts:${seed}`);
  const two = (pool: readonly string[]): [string, string] => {
    const a = Math.floor(r() * pool.length);
    let b = Math.floor(r() * (pool.length - 1));
    if (b >= a) b++;
    return [pool[a], pool[b]];
  };
  return { instincts: two(CHAMPION_INSTINCTS), arts: two(CHAMPION_ARTS), finale: CHAMPION_FINALES[Math.floor(r() * CHAMPION_FINALES.length)] };
}

/** Names a champion is rolled with, by its civilization at birth (it keeps its name through every civilization change) */
const NAMES: Record<CivilizationType, { first: string[]; epithet: string[] }> = {
  human: { first: ["Ser Corwin", "Dame Elowen", "Ser Bryce", "Dame Isolde", "Ser Gareth", "Dame Rowena", "Ser Tobin", "Dame Maelis"], epithet: ["the Dawnward", "of the Seven Bells", "Lionheart", "the Unbowed", "Brightshield", "of the Long Road"] },
  elf: { first: ["Aelindra", "Thalorien", "Sylvaris", "Neriel", "Caelith", "Ilyrath", "Mirethil", "Faelan"], epithet: ["Moonstep", "of the Silver Bough", "Starwhisper", "the Evergreen", "Leafsong", "of the Deep Glade"] },
  dwarf: { first: ["Thrain", "Brunhilde", "Durgan", "Helga", "Korvin", "Sigrun", "Baldrek", "Ingra"], epithet: ["Ironbeard", "Anvilborn", "Stonefist", "of the Deep Halls", "Runekeeper", "the Unbroken"] },
  orc: { first: ["Gorzag", "Urzula", "Krothak", "Mogra", "Thrugg", "Shagra", "Volgar", "Grisha"], epithet: ["Skullsplitter", "the Bloodied", "Bonecrusher", "of the Red Tusk", "Warbringer", "the Unchained"] },
  arcane: { first: ["Vaelith", "Morrigan", "Xandros", "Seraphine", "Kaelvor", "Nyxara", "Orlenth", "Isvara"], epithet: ["the Riftborn", "of the Hollow Star", "Voidcaller", "the Eclipsed", "Starless", "of the Last Light"] }
};

export function rollName(seed: string, civ: CivilizationType): string {
  const r = rng(`name:${seed}`);
  const p = NAMES[civ] ?? NAMES.human;
  return `${p.first[Math.floor(r() * p.first.length)]} ${p.epithet[Math.floor(r() * p.epithet.length)]}`;
}

/* ------------------------------------------------------------------------- */
/* Renown: XP from the battles it leads                                      */
/* ------------------------------------------------------------------------- */

export type ChampionXpReason = "battle_damage" | "battle_kills" | "battle_win" | "boss_felled" | "realm_felled" | "finale_kill" | "daily_diminish" | "admin_adjust" | "capped_by_city_hall";
export const CHAMPION_XP_REASONS: ChampionXpReason[] = ["battle_damage", "battle_kills", "battle_win", "boss_felled", "realm_felled", "finale_kill", "daily_diminish", "admin_adjust", "capped_by_city_hall"];

/** Renown a battle the champion led brings, before the day's diminishing */
export const RENOWN = {
  /** Per round its army fought */
  perRound: 2,
  /** × √(enemies its army killed), at most `killsCap` */
  perSqrtKill: 2,
  killsCap: 30,
  win: 15,
  bossFelled: 60,
  realmFelled: 40,
  /** Per enemy army its Finale broke */
  finaleKill: 20
} as const;

/** What one battle brings, line by line (only the lines that brought something) */
export function battleRenown(o: { rounds: number; kills: number; won: boolean; bossFelled?: boolean; realmFelled?: boolean; finaleKills?: number }): Array<{ reason: ChampionXpReason; delta: number }> {
  const lines: Array<{ reason: ChampionXpReason; delta: number }> = [
    { reason: "battle_damage", delta: Math.max(0, Math.round(o.rounds)) * RENOWN.perRound },
    { reason: "battle_kills", delta: Math.min(RENOWN.killsCap, Math.round(RENOWN.perSqrtKill * Math.sqrt(Math.max(0, o.kills)))) },
    { reason: "battle_win", delta: o.won ? RENOWN.win : 0 },
    { reason: "boss_felled", delta: o.bossFelled ? RENOWN.bossFelled : 0 },
    { reason: "realm_felled", delta: o.realmFelled ? RENOWN.realmFelled : 0 },
    { reason: "finale_kill", delta: Math.max(0, o.finaleKills ?? 0) * RENOWN.finaleKill }
  ];
  return lines.filter((l) => l.delta > 0);
}

/**
 * Renown diminishes through a realm day: the first `full` counts whole, up to `half` counts half, past it a quarter.
 * Returns how much of `gain` counts, given `earned` already counted today (raw, before the cut)
 */
export const DAILY_RENOWN = { full: 200, half: 500 } as const;
export function diminished(earnedRawToday: number, gain: number): number {
  let left = Math.max(0, gain);
  let at = Math.max(0, earnedRawToday);
  let out = 0;
  for (const [upTo, k] of [
    [DAILY_RENOWN.full, 1],
    [DAILY_RENOWN.half, 0.5],
    [Infinity, 0.25]
  ] as const) {
    if (left <= 0) break;
    const room = Math.max(0, upTo - at);
    const take = Math.min(left, room);
    out += take * k;
    at += take;
    left -= take;
  }
  return Math.round(out);
}

/* ------------------------------------------------------------------------- */
/* Wounds, hastening, re-rolls and retraining                                */
/* ------------------------------------------------------------------------- */

const MIN = 60_000;
/** A fallen champion heals by itself in 2 h + 10 min per level */
export const healMsFor = (level: number) => 2 * 60 * MIN + 10 * MIN * Math.max(1, level);

/** Resources a champion's actions cost */
export type ChampionCost = Partial<Record<"gold" | "iron" | "stone" | "lumber" | "food", number>>;

/** Level from which hastening a champion's healing also takes one of its civilization's gems */
export const HASTEN_GEM_LEVEL = 20;
/** Hastening heals it at once: gold and food for every hour (begun) still to heal, and from HASTEN_GEM_LEVEL one gem */
export function hastenCost(level: number, msLeft: number, gemKey: string): { cost: ChampionCost; gems: Record<string, number> } {
  const hours = Math.max(1, Math.ceil(msLeft / (60 * MIN)));
  return { cost: { gold: 150 * hours, food: 4_000 * hours }, gems: level >= HASTEN_GEM_LEVEL ? { [gemKey]: 1 } : {} };
}

/** A re-roll of its looks (its name, Arts and level stay): one of its civilization's gems */
export const rerollCost = (gemKey: string): Record<string, number> => ({ [gemKey]: 1 });

/** Retraining one slot of its kit: gold and iron */
export const RETRAIN_COST: ChampionCost = { gold: 3_000, iron: 20_000 };

/** "2h 10m" */
export function championDurationText(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
}
