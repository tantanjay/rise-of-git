import type { LeaderboardPeriod } from "./types.js";

/**
 * Hall of Renown fairness rules (GAME_GUIDE §16). Pure functions only (no database), so `npm run sim:leaderboard`
 * can check them. Every axis is a rate or a quality, never a raw total, so a one-year developer can rank with a
 * three-year one.
 */

/** Axis weights of the fairness score (each axis is first turned into a 0–100 percentile) */
export const FAIRNESS_WEIGHTS = { activeness: 0.4, repoActivity: 0.3, quality: 0.3 } as const;
/** All time: a tenure this short is pulled toward the realm's average activeness, as if it had this many extra working days */
export const ACTIVENESS_PRIOR_DAYS = 20;
/** Repos below this building level don't count for quality */
export const QUALITY_MIN_LEVEL = 3;
/** All time: tenures shorter than this count as this long when dividing by tenure (a two-week newcomer can't top it) */
export const TENURE_FLOOR_YEARS = 0.5;

const DAY_MS = 86_400_000;

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
export const parseDay = (key: string) => new Date(`${key}T00:00:00Z`);
export const addDays = (key: string, n: number) => dayKey(new Date(parseDay(key).getTime() + n * DAY_MS));

/** Mon–Fri between two UTC days, both included (0 when `to` is before `from`) */
export function workdaysBetween(from: string, to: string): number {
  if (to < from) return 0;
  const start = parseDay(from).getTime();
  const days = Math.round((parseDay(to).getTime() - start) / DAY_MS) + 1;
  const startDow = (parseDay(from).getUTCDay() + 6) % 7; // Mon = 0
  const full = Math.floor(days / 7);
  let count = full * 5;
  for (let i = 0; i < days % 7; i++) if ((startDow + i) % 7 < 5) count++;
  return count;
}

/** Years between two UTC days (both included) */
export function tenureYears(from: string, to: string): number {
  return Math.max(0, (parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS + 1) / 365.25;
}

export interface PeriodWindow {
  period: LeaderboardPeriod;
  /** First day covered (all time: the earliest commit day in the realm; each developer starts at their own) */
  from: string;
  /** Last day covered */
  to: string;
  label: string;
  /** When the ranking is next recomputed (epoch ms): the next week / month, or the next day for live tabs */
  rollsOverAt: number;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shortDay = (key: string) => {
  const d = parseDay(key);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
};

/**
 * The window a tab covers on `today` (UTC). Weekly and Monthly are the last finished week (Mon–Sun) and calendar
 * month; Year is the fiscal year so far and All time runs to yesterday, the last complete day. `back` = 1 gives the
 * window before it (the week / month before; for the live tabs, the same window ending a week earlier) for ▲▼.
 */
export function periodWindow(period: LeaderboardPeriod, today: string, fiscalStartMonth: number, back = 0): PeriodWindow | null {
  const t = parseDay(today);
  const tomorrow = addDays(today, 1);
  if (period === "week") {
    const monday = addDays(today, -((t.getUTCDay() + 6) % 7));
    const from = addDays(monday, -7 * (1 + back));
    const to = addDays(from, 6);
    return { period, from, to, label: `${shortDay(from)} – ${shortDay(to)}`, rollsOverAt: parseDay(addDays(monday, 7)).getTime() };
  }
  if (period === "month") {
    const y = t.getUTCFullYear();
    const m = t.getUTCMonth() - 1 - back;
    const from = dayKey(new Date(Date.UTC(y, m, 1)));
    const to = dayKey(new Date(Date.UTC(y, m + 1, 0)));
    const fromD = parseDay(from);
    return { period, from, to, label: `${MONTHS[fromD.getUTCMonth()]} ${fromD.getUTCFullYear()}`, rollsOverAt: Date.UTC(y, t.getUTCMonth() + 1, 1) };
  }
  const to = addDays(today, -1 - 7 * back);
  if (period === "year") {
    const startMonth = Math.min(12, Math.max(1, Math.round(fiscalStartMonth))) - 1;
    const fyYear = t.getUTCMonth() >= startMonth ? t.getUTCFullYear() : t.getUTCFullYear() - 1;
    const from = dayKey(new Date(Date.UTC(fyYear, startMonth, 1)));
    if (back > 0 && to < from) return null;
    const fy = startMonth === 0 ? `${fyYear}` : `FY ${fyYear}–${String((fyYear + 1) % 100).padStart(2, "0")}`;
    return { period, from, to, label: `${fy} so far`, rollsOverAt: parseDay(tomorrow).getTime() };
  }
  return { period, from: "0000-01-01", to, label: "From each developer's first commit", rollsOverAt: parseDay(tomorrow).getTime() };
}

/** Activeness for a period: active days ÷ working days, capped at 1 (weekend work can make up a missed weekday) */
export function activenessRate(activeDays: number, workdays: number): number {
  if (workdays <= 0) return activeDays > 0 ? 1 : 0;
  return Math.min(1, activeDays / workdays);
}

/** All time: very short tenures are pulled toward the realm's average rate */
export function shrunkActiveness(activeDays: number, workdays: number, realmRate: number): number {
  return Math.min(1, (activeDays + ACTIVENESS_PRIOR_DAYS * realmRate) / (workdays + ACTIVENESS_PRIOR_DAYS));
}

/** Repo activeness: Σ √(XP per repo), so spreading real work over repos counts and hammering one flattens out */
export function repoActivity(xpByRepo: Iterable<number>): number {
  let sum = 0;
  for (const xp of xpByRepo) if (xp > 0) sum += Math.sqrt(xp);
  return sum;
}

/** Worth of one repo for quality: Lv3 = 1.0, Lv5 ≈ 1.5, Lv10 ≈ 2.2, Lv25 ≈ 3.1; 0 below Lv3 */
export function repoQualityWeight(level: number): number {
  return level >= QUALITY_MIN_LEVEL ? 1 + Math.log(level / QUALITY_MIN_LEVEL) : 0;
}

export function repoQuality(levels: Iterable<number>): number {
  let sum = 0;
  for (const l of levels) sum += repoQualityWeight(l);
  return sum;
}

/** Percentile (0–100) of every value among the others; ties share the average position. One developer = 100. */
export function percentiles(values: number[]): number[] {
  const n = values.length;
  if (n === 1) return [100];
  const sorted = [...values].sort((a, b) => a - b);
  const lowerBound = (v: number) => {
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return values.map((v) => {
    const below = lowerBound(v);
    let equal = 0;
    for (let i = below; i < n && sorted[i] === v; i++) equal++;
    return ((below + (equal - 1) / 2) / (n - 1)) * 100;
  });
}

/** Competition rank (1 = best, ties share a rank) of every value, highest first */
export function ranksDesc(values: number[]): number[] {
  return values.map((v) => 1 + values.filter((o) => o > v).length);
}

export function fairnessScore(activenessPct: number, repoActivityPct: number, qualityPct: number): number {
  return FAIRNESS_WEIGHTS.activeness * activenessPct + FAIRNESS_WEIGHTS.repoActivity * repoActivityPct + FAIRNESS_WEIGHTS.quality * qualityPct;
}
