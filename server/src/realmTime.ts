/**
 * Realm time (GAME_GUIDE §7 *Day, night & seasons*): day and night alternate with the harvest, and the season
 * turns every week. Pure functions, no database: the harvest, births and march speed read them, /status sends the
 * current window to the client (which lights the sky from it). The client mirror is src/utils/realmTime.ts.
 *
 * Every harvest window (from one harvest to the next, SYNC_INTERVAL_MINUTES long) is either ☀️ day or 🌙 night,
 * in turn: a whole realm day is two harvests. The harvest that closes a window pays it as day or night.
 * Within a window the realm clock runs through its hours (a day window 05:00 → 19:00, a night window 19:00 → 05:00);
 * the sun rises and sets on that clock by the season (SEASON_SUN), so summer nights are short and winter days are.
 */
import type { CivilizationType } from "./types.js";

/** The week running now: Sunday 00:00 UTC → next Sunday 00:00 UTC (the boss rotation, Overseer's Resolve, War Frenzy, Wrath) */
export function weekWindow(now = Date.now()): { weekKey: string; startsAt: number; resetsAt: number } {
  const d = new Date(now);
  const startsAt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay(), 0, 0, 0, 0);
  return { weekKey: new Date(startsAt).toISOString().slice(0, 10), startsAt, resetsAt: startsAt + WEEK_MS };
}

/* ------------------------------------------------------------------------- */
/* Day and night                                                              */
/* ------------------------------------------------------------------------- */

export type DayPart = "day" | "night";
export type DayPhase = "dawn" | "morning" | "midday" | "afternoon" | "dusk" | "nightfall" | "midnight" | "small_hours";

/**
 * The parts of a realm day for the sky, in sun hours (`from` inclusive, `to` exclusive; the deep night wraps
 * midnight): the clock of a day whose sun rises at 05:00 and sets at 19:00. Each season's sunrise and sunset
 * (SEASON_SUN) stretch them onto the realm clock (sunHour).
 */
export const DAY_PHASES: Array<{ key: DayPhase; name: string; emblem: string; from: number; to: number }> = [
  { key: "dawn", name: "Dawn", emblem: "🌄", from: 5, to: 6 },
  { key: "morning", name: "Early morning", emblem: "🌅", from: 6, to: 9 },
  { key: "midday", name: "Day", emblem: "☀️", from: 9, to: 15 },
  { key: "afternoon", name: "Late afternoon", emblem: "🌇", from: 15, to: 18 },
  { key: "dusk", name: "Dusk", emblem: "🌆", from: 18, to: 19 },
  { key: "nightfall", name: "Nightfall", emblem: "🌗", from: 19, to: 21 },
  { key: "midnight", name: "Deep night", emblem: "🌙", from: 21, to: 3 },
  { key: "small_hours", name: "Small hours", emblem: "🌠", from: 3, to: 5 }
];

/** Gems the sun favours by day, and the moon by night (each ×GEM_TILT as likely to be the harvest's drop) */
export const SUN_GEMS = ["ruby", "obsidian", "dragon_scale"] as const;
export const MOON_GEMS = ["mana", "aether", "sapphire"] as const;
export const GEM_TILT = 3;

/** What a day or night harvest pays: base harvest (pool share, buildings, workforce) and the scarce drop pool */
export const DAY_PART_EFFECTS: Record<DayPart, { emblem: string; name: string; harvest: number; scarcePool: number; favoured: readonly string[] }> = {
  day: { emblem: "☀️", name: "Day", harvest: 1, scarcePool: 1, favoured: SUN_GEMS },
  night: { emblem: "🌙", name: "Night", harvest: 0.85, scarcePool: 1.25, favoured: MOON_GEMS }
};

/** Harvest windows alternate: an even number of harvests so far → a day window, odd → night */
export const dayPartOfWindow = (harvestsSoFar: number): DayPart => (harvestsSoFar % 2 === 0 ? "day" : "night");

/** The sky's hour at a fraction `u` (0…1) of a window: day 05:00 → 19:00, night 19:00 → 05:00 */
export function windowHour(part: DayPart, u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return part === "day" ? 5 + 14 * t : (19 + 10 * t) % 24;
}

/**
 * Sunrise and sunset on the realm clock, each season. The harvest windows never move (a day window is always
 * 05:00 → 19:00 on the clock, a night window 19:00 → 05:00): only the sky does. Summer light spills into the night
 * window, winter dark into the day window; spring and autumn match the windows.
 */
export const SEASON_SUN: Record<SeasonKey, { rise: number; set: number }> = {
  spring: { rise: 5, set: 19 },
  summer: { rise: 3.5, set: 20.5 },
  autumn: { rise: 5, set: 19 },
  winter: { rise: 7, set: 17 }
};

/** The sun hour (DAY_PHASES' clock: sunrise 05:00, sunset 19:00) at a realm hour in a season */
export function sunHour(hour: number, season: SeasonKey): number {
  const { rise, set } = SEASON_SUN[season];
  const h = ((hour % 24) + 24) % 24;
  if (h >= rise && h < set) return 5 + (14 * (h - rise)) / (set - rise);
  const sinceSet = (h - set + 24) % 24;
  return (19 + (10 * sinceSet) / (24 - (set - rise))) % 24;
}

/** The realm hour of a sun hour in a season (the inverse of sunHour) */
export function realmHourAtSun(sun: number, season: SeasonKey): number {
  const { rise, set } = SEASON_SUN[season];
  const s = ((sun % 24) + 24) % 24;
  if (s >= 5 && s < 19) return rise + ((s - 5) * (set - rise)) / 14;
  return (set + (((s - 19 + 24) % 24) * (24 - (set - rise))) / 10) % 24;
}

/** The part of the day at a sun hour (see sunHour) */
export function phaseAtHour(sun: number): (typeof DAY_PHASES)[number] {
  return DAY_PHASES.find((p) => (p.from < p.to ? sun >= p.from && sun < p.to : sun >= p.from || sun < p.to)) ?? DAY_PHASES[DAY_PHASES.length - 1];
}

/* ------------------------------------------------------------------------- */
/* Seasons                                                                    */
/* ------------------------------------------------------------------------- */

export type SeasonKey = "spring" | "summer" | "autumn" | "winter";

/** One season a week, in this order; each mortal civ is buffed once and debuffed once over the four weeks */
export const SEASONS: Array<{ key: SeasonKey; name: string; title: string; emblem: string; buffed: CivilizationType; debuffed: CivilizationType; story: string }> = [
  { key: "spring", name: "Spring", title: "Bloom", emblem: "🌸", buffed: "elf", debuffed: "orc", story: "The glades wake under the spring rains; the Badlands flood." },
  { key: "summer", name: "Summer", title: "Blaze", emblem: "☀️", buffed: "orc", debuffed: "dwarf", story: "War season: the warbands ride, while the forges and halls swelter." },
  { key: "autumn", name: "Autumn", title: "Harvest", emblem: "🍂", buffed: "human", debuffed: "elf", story: "The granaries fill; the glades fall asleep." },
  { key: "winter", name: "Winter", title: "Frost", emblem: "❄️", buffed: "dwarf", debuffed: "human", story: "The mountain halls are warm; the fields lie bare." }
];

/** A buffed civ gets +, a debuffed civ − these (harvest, births, march speed). Never combat stats */
export const SEASON_MODS = { harvest: 0.1, births: 0.1, march: 0.05 } as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Sunday 4 October 2026, 00:00 UTC: a spring began (seasons turn with the other weekly resets, Sunday 00:00 UTC) */
export const SEASON_EPOCH_MS = Date.UTC(2026, 9, 4);

export function seasonAt(now = Date.now()) {
  const week = Math.floor((now - SEASON_EPOCH_MS) / WEEK_MS);
  const index = ((week % SEASONS.length) + SEASONS.length) % SEASONS.length;
  const startsAt = SEASON_EPOCH_MS + week * WEEK_MS;
  return { ...SEASONS[index], week, startsAt, endsAt: startsAt + WEEK_MS, next: SEASONS[(index + 1) % SEASONS.length] };
}

/** This season's multipliers for a civilization (1 for the two left alone, and always for Nethergarde) */
export function seasonEffects(civ: CivilizationType, now = Date.now()) {
  const s = seasonAt(now);
  const sign = civ === s.buffed ? 1 : civ === s.debuffed ? -1 : 0;
  return {
    sign,
    harvest: 1 + sign * SEASON_MODS.harvest,
    births: 1 + sign * SEASON_MODS.births,
    march: 1 + sign * SEASON_MODS.march
  };
}

/* ------------------------------------------------------------------------- */
/* Now                                                                        */
/* ------------------------------------------------------------------------- */

/** The realm's clock as /status sends it: the current harvest window (day or night) and the season */
export function realmNow(window: { startedAt: number; lengthMs: number; harvestsSoFar: number }, now = Date.now()) {
  const part = dayPartOfWindow(window.harvestsSoFar);
  const season = seasonAt(now);
  return {
    dayPart: part,
    windowStartedAt: window.startedAt,
    windowMs: window.lengthMs,
    phase: phaseAtHour(sunHour(windowHour(part, (now - window.startedAt) / window.lengthMs), season.key)).key,
    season: season.key,
    seasonWeek: season.week,
    seasonEndsAt: season.endsAt
  };
}
