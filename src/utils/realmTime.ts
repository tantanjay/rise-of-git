/**
 * Client mirror of server/src/realmTime.ts (GAME_GUIDE §7 *Day, night & seasons*): day and night alternate with
 * each harvest (a realm day is two harvests), the season turns every week. The server sends the current harvest
 * window and the season (/status → `realmTime`); the sky's hour is worked out here from how far the window has run,
 * so the light moves on between status polls.
 */
import { useEffect, useState } from "react";
import type { CivilizationType, DayPhase, RealmTime, SeasonKey } from "@/types";

export type DayPart = "day" | "night";

/**
 * The parts of a realm day for the sky, in sun hours: the clock of a day whose sun rises at 05:00 and sets at 19:00.
 * Each season's sunrise and sunset (SEASON_SUN) stretch them onto the realm clock (sunHour)
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

/**
 * Sunrise and sunset on the realm clock, each season (mirrors SEASON_SUN). The harvest windows never move (day
 * 05:00 → 19:00, night 19:00 → 05:00): only the sky does
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

export const SUN_GEMS = ["ruby", "obsidian", "dragon_scale"];
export const MOON_GEMS = ["mana", "aether", "sapphire"];
export const GEM_TILT = 3;

/** What a day or night harvest pays (mirrors DAY_PART_EFFECTS) */
export const DAY_PART_EFFECTS: Record<DayPart, { emblem: string; name: string; harvest: number; scarcePool: number; favoured: string[] }> = {
  day: { emblem: "☀️", name: "Day", harvest: 1, scarcePool: 1, favoured: SUN_GEMS },
  night: { emblem: "🌙", name: "Night", harvest: 0.85, scarcePool: 1.25, favoured: MOON_GEMS }
};
export const NIGHT_HARVEST_MULT = DAY_PART_EFFECTS.night.harvest;
/** Mirrors HARVEST_WEIGHT_SCALE / HARVEST_SHARE_CAP in server/src/kingdomUtils.ts: pool weight = scale × √score + 1, at most this share of a pool */
export const HARVEST_WEIGHT_SCALE = 10;
export const HARVEST_SHARE_CAP = 0.1;
export const NIGHT_SCARCE_POOL_MULT = DAY_PART_EFFECTS.night.scarcePool;

export const SEASONS: Array<{ key: SeasonKey; name: string; title: string; emblem: string; buffed: CivilizationType; debuffed: CivilizationType; story: string; weather: string; color: string }> = [
  { key: "spring", name: "Spring", title: "Bloom", emblem: "🌸", buffed: "elf", debuffed: "orc", story: "The glades wake under the spring rains; the Badlands flood.", weather: "Rain showers come and go under passing clouds; the grass is at its greenest.", color: "#f472b6" },
  { key: "summer", name: "Summer", title: "Blaze", emblem: "☀️", buffed: "orc", debuffed: "dwarf", story: "War season: the warbands ride, while the forges and halls swelter.", weather: "Clear skies, a few white clouds, sun-yellowed grass; fireflies after dark.", color: "#facc15" },
  { key: "autumn", name: "Autumn", title: "Harvest", emblem: "🍂", buffed: "human", debuffed: "elf", story: "The granaries fill; the glades fall asleep.", weather: "Leaves turn gold and red and drift down on the wind.", color: "#f97316" },
  { key: "winter", name: "Winter", title: "Frost", emblem: "❄️", buffed: "dwarf", debuffed: "human", story: "The mountain halls are warm; the fields lie bare.", weather: "Snow falls and frosts the land white.", color: "#7dd3fc" }
];
export const SEASON_MODS = { harvest: 0.1, births: 0.1, march: 0.05 } as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Sunday 4 October 2026, 00:00 UTC: a spring began */
const SEASON_EPOCH_MS = Date.UTC(2026, 9, 4);

export const seasonOf = (key: SeasonKey) => SEASONS.find((s) => s.key === key) ?? SEASONS[0];

/** A realm hour as 05:30 */
export const hhmm = (h: number) => {
  const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** The part of the day at a sun hour (see sunHour) */
export function phaseAtHour(sun: number) {
  return DAY_PHASES.find((p) => (p.from < p.to ? sun >= p.from && sun < p.to : sun >= p.from || sun < p.to)) ?? DAY_PHASES[DAY_PHASES.length - 1];
}

/** The realm clock's hour at a fraction `u` (0…1) of a window: day 05:00 → 19:00, night 19:00 → 05:00 */
export function windowHour(part: DayPart, u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return part === "day" ? 5 + 14 * t : (19 + 10 * t) % 24;
}

/* ------------------------------------------------------------------------- */
/* The realm clock (a tiny store outside React)                              */
/* ------------------------------------------------------------------------- */

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const initialWeek = Math.floor((Date.now() - SEASON_EPOCH_MS) / WEEK_MS);

let server: { part: DayPart; windowStart: number; windowMs: number; season: SeasonKey; seasonEndsAt: number } = {
  // Until the first /status: the middle of a day
  part: "day",
  windowStart: Date.now() - DEFAULT_WINDOW_MS / 2,
  windowMs: DEFAULT_WINDOW_MS,
  season: SEASONS[((initialWeek % 4) + 4) % 4].key,
  seasonEndsAt: SEASON_EPOCH_MS + (initialWeek + 1) * WEEK_MS
};
/** Dev tools: pin the hour, the season or a shower to look at them (window.realmClock in dev) */
const pinned: { hour: number | null; season: SeasonKey | null; shower: number | null } = { hour: null, season: null, shower: null };
/** A pinned spring shower strength (0…1), or null to follow the clock */
export const pinnedShower = () => pinned.shower;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Called with each /status: the harvest window (moved onto this browser's clock) and the season */
export function setRealmTime(rt: RealmTime | undefined, serverNow?: number) {
  if (!rt) return;
  const skew = serverNow ? serverNow - Date.now() : 0;
  const next = { part: rt.dayPart, windowStart: rt.windowStartedAt - skew, windowMs: rt.windowMs || DEFAULT_WINDOW_MS, season: rt.season, seasonEndsAt: rt.seasonEndsAt - skew };
  const changed = next.part !== server.part || Math.abs(next.windowStart - server.windowStart) > 2000 || next.season !== server.season;
  server = next;
  if (changed) notify();
}

export interface RealmClock {
  /** The harvest window running now (pays as day or night) */
  part: DayPart;
  /** The realm clock's hour, 0 ≤ h < 24 (the windows: day 05:00 → 19:00, night 19:00 → 05:00) */
  hour: number;
  /** Where the sun is: the hour on DAY_PHASES' clock (sunrise 05:00, sunset 19:00) after the season's sunrise and sunset */
  sun: number;
  phase: (typeof DAY_PHASES)[number];
  season: (typeof SEASONS)[number];
  seasonEndsAt: number;
  /** Epoch ms the window ends (the next harvest, when day turns to night or night to day) */
  windowEndsAt: number;
  /** Length of a harvest window (SYNC_INTERVAL_MINUTES) */
  windowMs: number;
  /** Changes every half realm hour: the sky moves (and shadows redraw) in these steps */
  step: number;
  /** Epoch ms the clock was read */
  now: number;
}

export function readRealmClock(now = Date.now()): RealmClock {
  const u = (now - server.windowStart) / server.windowMs;
  const hour = pinned.hour ?? windowHour(server.part, u);
  const part: DayPart = pinned.hour === null ? server.part : hour >= 5 && hour < 19 ? "day" : "night";
  const season = seasonOf(pinned.season ?? server.season);
  const sun = sunHour(hour, season.key);
  return {
    part,
    hour,
    sun,
    phase: phaseAtHour(sun),
    season,
    seasonEndsAt: server.seasonEndsAt,
    windowEndsAt: server.windowStart + server.windowMs,
    windowMs: server.windowMs,
    step: Math.floor(hour * 2),
    now
  };
}

/** The realm clock, re-read every few seconds (re-renders when the step, the window or the season changes) */
export function useRealmClock(): RealmClock {
  const [clock, setClock] = useState(() => readRealmClock());
  useEffect(() => {
    const tick = () =>
      setClock((prev) => {
        const next = readRealmClock();
        return next.step === prev.step && next.part === prev.part && next.windowEndsAt === prev.windowEndsAt && next.season.key === prev.season.key ? prev : next;
      });
    listeners.add(tick);
    const id = setInterval(tick, 4_000);
    return () => {
      listeners.delete(tick);
      clearInterval(id);
    };
  }, []);
  return clock;
}

/**
 * True after dark: from the last stretch of dusk (18:30 on the sun's clock, so earlier in winter and later in summer)
 * to the first of dawn, so lights come out as the sky darkens. Re-renders only when it flips
 */
export function useRealmNight(): boolean {
  const isNight = () => {
    const c = readRealmClock();
    return c.sun >= 18.5 || c.sun < 5.5;
  };
  const [night, setNight] = useState(isNight);
  useEffect(() => {
    const tick = () => setNight(isNight());
    listeners.add(tick);
    const id = setInterval(tick, 3_000);
    return () => {
      listeners.delete(tick);
      clearInterval(id);
    };
  }, []);
  return night;
}

/** Only the season (re-renders once a week, not with the sky) */
export function useRealmSeason(): SeasonKey {
  const [season, setSeason] = useState(() => readRealmClock().season.key);
  useEffect(() => {
    const tick = () => setSeason(readRealmClock().season.key);
    listeners.add(tick);
    const id = setInterval(tick, 60_000);
    return () => {
      listeners.delete(tick);
      clearInterval(id);
    };
  }, []);
  return season;
}

if (typeof window !== "undefined" && import.meta.env?.DEV) {
  (window as unknown as { realmClock: unknown }).realmClock = {
    /** realmClock.setHour(21.5) — null to follow the harvest windows again */
    setHour(h: number | null) {
      pinned.hour = h === null ? null : ((h % 24) + 24) % 24;
      notify();
      const c = readRealmClock();
      return h === null ? `Following the harvest windows again: ${c.phase.emblem} ${c.phase.name}` : `Hour pinned to ${c.hour.toFixed(1)}: ${c.phase.emblem} ${c.phase.name}`;
    },
    /** realmClock.setSeason("winter") — null for the server's season */
    setSeason(s: SeasonKey | null) {
      if (s !== null && !SEASONS.some((x) => x.key === s)) return `Unknown season "${s}": use ${SEASONS.map((x) => `"${x.key}"`).join(", ")} or null`;
      pinned.season = s;
      notify();
      const c = readRealmClock();
      return `${s === null ? "Following the server's season" : "Season pinned"}: ${c.season.emblem} ${c.season.name}`;
    },
    /** realmClock.setShower(1) — a spring shower now (0…1), null to follow the clock */
    setShower(k: number | null) {
      pinned.shower = k;
      const c = readRealmClock();
      if (k === null) return "Showers follow the clock again";
      return c.season.key === "spring" ? `Shower pinned at ${k}` : `Shower pinned at ${k}, but it only rains in spring (now ${c.season.name}): realmClock.setSeason("spring")`;
    },
    read: () => readRealmClock()
  };
}
