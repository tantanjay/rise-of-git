/**
 * World disasters (GAME_GUIDE §10 *World Disasters*): the rules, with no database. 1–3 four-hour disasters strike the
 * realm each week; every civilization copes with one of them and suffers from another. The harvest (db.ts), births
 * and deaths (demographics.ts), march launch and battle rounds (warEngine.ts) read the disaster in force from here;
 * disasters.ts keeps the table, raises the notices and hands the calendar to setDisasterCalendar. The client mirror is
 * src/utils/disasters.ts.
 */
import { seededRandom, type BattleOmen } from "./combat.js";
import type { CivilizationType, DisasterKind } from "./types.js";

export type { DisasterKind };

export const DISASTER_KINDS: DisasterKind[] = ["blight", "tempest", "blood_moon", "plague", "barren"];

/** How the schedule rolls (GAME_GUIDE §10 *World Disasters*) */
export const DISASTER_SCHEDULE = {
  /** Each disaster lasts this long */
  DURATION_MS: 4 * 60 * 60 * 1000,
  /** The herald warns this long before one strikes */
  WARNING_MS: 60 * 60 * 1000,
  /** Chance of a disaster on a day, before the pity below */
  BASE_CHANCE: 0.35,
  /** Each day without one adds this to the next day's chance (it carries over) */
  MISS_STEP: 0.15,
  /** The day after a disaster rolls at this share of the base chance */
  AFTER_HIT: 0.5,
  /** At most this many a week (Sunday 00:00 UTC to Sunday); none by Saturday makes Saturday's certain */
  MAX_PER_WEEK: 3,
  /** Disasters start between these realm hours (REALM_TIMEZONE): a 22:00 start ends at 02:00 */
  START_FROM: 6,
  START_TO: 22,
  /** …and this share of them in the morning, START_FROM to MORNING_TO, when people commit */
  MORNING_TO: 12,
  MORNING_SHARE: 0.6
} as const;

/** Each disaster's effect while it lasts */
export const DISASTER_EFFECTS = {
  /** 🌾 Great Blight: the harvest pool pays this share (buildings still pay in full) */
  BLIGHT_POOL: 0,
  /** …the civilization that suffers it also loses this share of its building harvest */
  BLIGHT_SUFFER_BUILDINGS: 0.5,
  /** 🌪️ Tempest Roads: every army that sets off loses this share of its marchers on the road (seeded per march) */
  TEMPEST_LOSS: [0.03, 0.08] as [number, number],
  /** 🩸 Blood Moon: mobs, bandits and bosses fight with +this HP, ATK and DEF */
  BLOOD_MOON_NPC: 0.3,
  /** …and these civilizations' soldiers fight with this much more (or less) ATK */
  BLOOD_MOON_ATK: { orc: 0.1, elf: -0.1 } as Partial<Record<CivilizationType, number>>,
  /** ☠️ Wasting Plague: this share of a kingdom's civilians die at each harvest */
  PLAGUE_RATE: 0.01,
  /** 🥀 Barren Spell: births × this */
  BARREN_BIRTHS: 0.5,
  /** …and the Void Well returns only this share of its fallen (Nethergarde suffers it) */
  BARREN_VOID_WELL: 0.5,
  /** A civilization that copes feels this share of the effect, one that suffers this many times it (unless noted) */
  COPE: 0.5,
  SUFFER: 2
} as const;

export interface DisasterInfo {
  kind: DisasterKind;
  name: string;
  emblem: string;
  /** What it does, for the notices and the Guide */
  effect: string;
  copes: CivilizationType;
  suffers: CivilizationType;
  /** Why and how much the coping and suffering civilization feel it */
  copeText: string;
  sufferText: string;
  /** The herald's warning, an hour before */
  omen: string;
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const E = DISASTER_EFFECTS;

export const DISASTERS: Record<DisasterKind, DisasterInfo> = {
  blight: {
    kind: "blight",
    name: "Great Blight",
    emblem: "🌾",
    effect: "The fields wilt: no harvest pool payouts (buildings, the workforce and the gem drop still pay).",
    copes: "dwarf",
    suffers: "human",
    copeText: `Dwarves live off mushroom caverns and stone granaries: they still get ${pct(1 - (1 - E.BLIGHT_POOL) * E.COPE)} of their pool share.`,
    sufferText: `Humans feed grain-fed hosts: no pool share, and their buildings pay only ${pct(1 - E.BLIGHT_SUFFER_BUILDINGS)}.`,
    omen: "A grey rot creeps along the furrows, and the wheat bows its heads."
  },
  tempest: {
    kind: "tempest",
    name: "Tempest Roads",
    emblem: "🌪️",
    effect: `Gales scour the roads: every army that sets off loses ${pct(E.TEMPEST_LOSS[0])}–${pct(E.TEMPEST_LOSS[1])} of its marchers on the way.`,
    copes: "elf",
    suffers: "dwarf",
    copeText: `Elven rangers are sure-footed: they lose only ${pct(E.TEMPEST_LOSS[0] * E.COPE)}–${pct(E.TEMPEST_LOSS[1] * E.COPE)}.`,
    sufferText: `Dwarves march in heavy armour on mud roads: they lose ${pct(E.TEMPEST_LOSS[0] * E.SUFFER)}–${pct(E.TEMPEST_LOSS[1] * E.SUFFER)}.`,
    omen: "The wind howls down from the passes and the roads turn to dust and mud."
  },
  blood_moon: {
    kind: "blood_moon",
    name: "Blood Moon",
    emblem: "🩸",
    effect: `A red moon maddens the wilds: mobs, bandits and bosses fight with +${pct(E.BLOOD_MOON_NPC)} HP, ATK and DEF (every battle round fought under it).`,
    copes: "orc",
    suffers: "elf",
    copeText: `Orcs love a Blood Moon: their soldiers fight with +${pct(E.BLOOD_MOON_ATK.orc ?? 0)} ATK under it.`,
    sufferText: `The glades fear it: Elven soldiers fight with ${pct(E.BLOOD_MOON_ATK.elf ?? 0).replace("-", "−")} ATK under it.`,
    omen: "The moon rises the colour of rust, and the wolves will not stop howling."
  },
  plague: {
    kind: "plague",
    name: "Wasting Plague",
    emblem: "☠️",
    effect: `A green miasma hangs over the cities: ${pct(E.PLAGUE_RATE)} of every kingdom's civilians die at each harvest.`,
    copes: "arcane",
    suffers: "orc",
    copeText: "Nethergarde's constructs are immune.",
    sufferText: `Orc war camps are crowded: ${pct(E.PLAGUE_RATE * E.SUFFER)} of their civilians die at each harvest.`,
    omen: "A sickly green haze rises from the gutters of the crowded cities."
  },
  barren: {
    kind: "barren",
    name: "Barren Spell",
    emblem: "🥀",
    effect: `The flowers grey and the streets empty: births ×${E.BARREN_BIRTHS}.`,
    copes: "human",
    suffers: "arcane",
    copeText: `The Dawn Banner's blessing: Human births are only ×${1 - (1 - E.BARREN_BIRTHS) * E.COPE}.`,
    sufferText: `The Void Well returns only ${pct(E.BARREN_VOID_WELL)} of Nethergarde's fallen.`,
    omen: "The blossoms turn ash-grey on the branch, and no cradle rocks tonight."
  }
};

/** Whether `civ` copes with, suffers from, or simply bears this disaster */
export function disasterSide(kind: DisasterKind, civ: CivilizationType): "copes" | "suffers" | null {
  const d = DISASTERS[kind];
  return civ === d.copes ? "copes" : civ === d.suffers ? "suffers" : null;
}

/** How strongly `civ` feels a disaster: ×0.5 copes, ×2 suffers, ×1 otherwise */
const strength = (kind: DisasterKind, civ: CivilizationType) => {
  const side = disasterSide(kind, civ);
  return side === "copes" ? E.COPE : side === "suffers" ? E.SUFFER : 1;
};

/* ------------------------------------------------------------------------- */
/* The calendar (filled by disasters.ts)                                      */
/* ------------------------------------------------------------------------- */

export interface DisasterSpan {
  id: number;
  kind: DisasterKind;
  startsAt: number;
  endsAt: number;
}

let calendar: DisasterSpan[] = [];
let tallyHook: ((id: number, civ: CivilizationType, key: string, n: number) => void) | null = null;

/** disasters.ts hands over the disasters that are on or coming (from the table) */
export function setDisasterCalendar(spans: DisasterSpan[]) {
  calendar = [...spans].sort((a, b) => a.startsAt - b.startsAt);
}

/** disasters.ts keeps a tally of what each disaster did, for its closing notice and the weekly story */
export function setDisasterTallyHook(fn: (id: number, civ: CivilizationType, key: string, n: number) => void) {
  tallyHook = fn;
}

/** Count something a disaster did to a civilization (soldiers lost on the road, civilians to the plague…) */
export function tallyDisaster(d: DisasterSpan | null, civ: CivilizationType, key: string, n: number) {
  if (!d || n <= 0) return;
  try {
    tallyHook?.(d.id, civ, key, n);
  } catch (err) {
    console.error("[Disasters] Failed to tally:", err);
  }
}

/** The disaster in force at `now`, if any */
export function disasterAt(now = Date.now()): DisasterSpan | null {
  return calendar.find((d) => now >= d.startsAt && now < d.endsAt) ?? null;
}

/** The next disaster to start after `now` (whether or not it has been announced) */
export function nextDisasterAfter(now = Date.now()): DisasterSpan | null {
  return calendar.find((d) => d.startsAt > now) ?? null;
}

/* ------------------------------------------------------------------------- */
/* Effects                                                                    */
/* ------------------------------------------------------------------------- */

/** 🌾 Great Blight: the share of its harvest pool share a civilization still gets (1 without a blight) */
export function blightPoolMult(d: DisasterSpan | null, civ: CivilizationType): number {
  if (d?.kind !== "blight") return 1;
  return Math.max(0, 1 - (1 - E.BLIGHT_POOL) * strength("blight", civ));
}

/** 🌾 Great Blight: the share of its building harvest a civilization still gets (only the one that suffers loses any) */
export function blightBuildingMult(d: DisasterSpan | null, civ: CivilizationType): number {
  return d?.kind === "blight" && disasterSide("blight", civ) === "suffers" ? 1 - E.BLIGHT_SUFFER_BUILDINGS : 1;
}

/** 🌪️ Tempest Roads: the share of a march lost on the road as it sets off (0 without a tempest; seeded by the march) */
export function tempestLossShare(d: DisasterSpan | null, civ: CivilizationType, seed: string): number {
  if (d?.kind !== "tempest") return 0;
  const [lo, hi] = E.TEMPEST_LOSS;
  const roll = lo + (hi - lo) * seededRandom(`tempest:${seed}`)();
  return Math.min(0.5, roll * strength("tempest", civ));
}

/** 🌪️ Marchers lost from an army of `count` setting off now (rounded down: a handful of scouts slips through) */
export function tempestLosses(d: DisasterSpan | null, civ: CivilizationType, count: number, seed: string): number {
  return Math.min(count, Math.floor(count * tempestLossShare(d, civ, seed)));
}

/** 🩸 Blood Moon: what a battle round fought at `now` is changed by (null without one) */
export function battleOmenAt(now = Date.now()): BattleOmen | null {
  const d = disasterAt(now);
  if (d?.kind !== "blood_moon") return null;
  return {
    npcStatMult: 1 + E.BLOOD_MOON_NPC,
    civAtkMult: Object.fromEntries(Object.entries(E.BLOOD_MOON_ATK).map(([civ, v]) => [civ, 1 + (v ?? 0)]))
  };
}

/** ☠️ Wasting Plague: the share of a kingdom's civilians that die at this harvest (0 without one, and for Nethergarde) */
export function plagueRate(d: DisasterSpan | null, civ: CivilizationType): number {
  if (d?.kind !== "plague") return 0;
  // Nethergarde copes by being immune (not half)
  if (disasterSide("plague", civ) === "copes") return 0;
  return E.PLAGUE_RATE * strength("plague", civ);
}

/** 🥀 Barren Spell: births × this (1 without one) */
export function barrenBirthMult(d: DisasterSpan | null, civ: CivilizationType): number {
  if (d?.kind !== "barren") return 1;
  return Math.max(0, 1 - (1 - E.BARREN_BIRTHS) * Math.min(1, strength("barren", civ)));
}

/** 🥀 Barren Spell: the Void Well returns × this of its fallen (Nethergarde suffers it; 1 otherwise) */
export function barrenVoidWellMult(d: DisasterSpan | null, civ: CivilizationType): number {
  return d?.kind === "barren" && disasterSide("barren", civ) === "suffers" ? E.BARREN_VOID_WELL : 1;
}

/* ------------------------------------------------------------------------- */
/* The schedule: rolled day by day, seeded by the date                        */
/* ------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;
/** The schedule's first day, a Sunday (the first season's week); the roll runs forward from it */
export const DISASTER_EPOCH_DAY = "2026-10-04";

/** The calendar date (YYYY-MM-DD) at `ms` in time zone `tz` */
export function dateKeyIn(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** How far `tz` is ahead of UTC at `ms` (ms) */
function tzOffsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(ms));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second")) - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms of `hour` (may be fractional) on calendar date `day` in time zone `tz` */
export function zonedTime(day: string, hour: number, tz: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d) + Math.round(hour * 60) * 60 * 1000;
  const first = guess - tzOffsetMs(guess, tz);
  const second = guess - tzOffsetMs(first, tz);
  return second;
}

/** Sunday 00:00 UTC of the week `ms` falls in */
const utcWeekOf = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay());
};
const dayIndexOf = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${DISASTER_EPOCH_DAY}T00:00:00Z`)) / DAY_MS);
const dayAt = (index: number) => new Date(Date.parse(`${DISASTER_EPOCH_DAY}T00:00:00Z`) + index * DAY_MS).toISOString().slice(0, 10);

export interface ScheduledDisaster {
  /** The realm date it was rolled for (REALM_TIMEZONE) */
  day: string;
  kind: DisasterKind;
  startsAt: number;
  endsAt: number;
  /** The day's chance it was rolled at (1 on a certain Saturday) */
  chance: number;
}

/** All five kinds in a seeded random order, never opening with the kind that closed the bag before it */
function shuffledBag(seed: string, lastKind: DisasterKind | null): DisasterKind[] {
  const rng = seededRandom(seed);
  const bag = [...DISASTER_KINDS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  if (bag[0] === lastKind) [bag[0], bag[1]] = [bag[1], bag[0]];
  return bag;
}

/**
 * Every disaster the schedule rolls from its first day through `lastDay` (inclusive), in order. Pure and seeded by
 * the date, so a restart rolls the same; the week of a day is its UTC calendar week (Sunday to Saturday), the same
 * as the Sunday 00:00 UTC resets. Kinds come from a shuffled bag: all five strike before any strikes again, and an
 * unfinished bag carries over the weekly reset.
 */
export function rollDisasterSchedule(lastDay: string, tz: string): ScheduledDisaster[] {
  const S = DISASTER_SCHEDULE;
  const out: ScheduledDisaster[] = [];
  let chance: number = S.BASE_CHANCE;
  let thisWeek = 0;
  let lastKind: DisasterKind | null = null;
  let bag: DisasterKind[] = [];
  const perUtcWeek = new Map<number, number>();
  const last = dayIndexOf(lastDay);
  for (let i = 0; i <= last; i++) {
    const day = dayAt(i);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (weekday === 0) thisWeek = 0;
    // After three this week, none until Sunday (the chance waits as it is)
    if (thisWeek >= S.MAX_PER_WEEK) continue;
    const rng = seededRandom(`disaster:${day}`);
    const roll = rng();
    rng(); // Unused, so each day's start time rolls from the same place in its seed
    const slotRoll = rng();
    const hourRoll = rng();
    const certain = weekday === 6 && thisWeek === 0;
    if (!certain && roll >= chance) {
      chance = Math.min(1, chance + S.MISS_STEP);
      continue;
    }
    // Weighted to the morning; quarter-hour starts
    const [from, to] = slotRoll < S.MORNING_SHARE ? [S.START_FROM, S.MORNING_TO] : [S.MORNING_TO, S.START_TO];
    const hour = Math.min(S.START_TO, from + Math.round(hourRoll * (to - from) * 4) / 4);
    const startsAt = zonedTime(day, hour, tz);
    // The cap holds for the week a disaster starts in (Sunday 00:00 UTC, as the other weekly resets): a realm day's early
    // start can fall in the UTC week before, which may already have its three (the chance waits as it is)
    const utcWeek = utcWeekOf(startsAt);
    if ((perUtcWeek.get(utcWeek) ?? 0) >= S.MAX_PER_WEEK) continue;
    perUtcWeek.set(utcWeek, (perUtcWeek.get(utcWeek) ?? 0) + 1);
    if (!bag.length) bag = shuffledBag(`disaster-bag:${day}`, lastKind);
    const kind = bag.shift()!;
    out.push({ day, kind, startsAt, endsAt: startsAt + S.DURATION_MS, chance: certain ? 1 : chance });
    thisWeek++;
    lastKind = kind;
    chance = S.BASE_CHANCE * S.AFTER_HIT;
  }
  return out;
}
