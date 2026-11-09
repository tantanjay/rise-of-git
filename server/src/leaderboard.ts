import { db } from "./db.js";
import { config } from "./env.js";
import { scoreCommits, prXp, XP_RULES, isMeaningfulCommit, round1 } from "./scoring.js";
import { calculateBuildingLevel, loginListed } from "./kingdomUtils.js";
import {
  periodWindow,
  workdaysBetween,
  tenureYears,
  activenessRate,
  shrunkActiveness,
  repoActivity,
  repoQuality,
  QUALITY_MIN_LEVEL,
  TENURE_FLOOR_YEARS,
  percentiles,
  ranksDesc,
  fairnessScore,
  dayKey,
  PeriodWindow
} from "./leaderboardRules.js";
import { CivilizationType, Leaderboard, LeaderboardEntry, LeaderboardPeriod, RenownPodium } from "./types.js";

/**
 * The Hall of Renown (GAME_GUIDE §16). `dev_daily_stats` holds every developer's contribution XP per day and per
 * repo, replayed from the stored commits, PRs and reviews (scoring is deterministic per day, so a rebuild always
 * gives the same numbers). It is rebuilt on start, once a day, and after new history arrives (live Git sync, backfill
 * progress), at most once a minute; rankings are cached until their period rolls over or the stats rebuild.
 */

db.exec(`
  -- Contribution XP per developer per day (commit day, PR merge/open day, first review day); active = a meaningful commit that day
  CREATE TABLE IF NOT EXISTS dev_daily_stats (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    xp REAL NOT NULL DEFAULT 0,
    xp_by_repo_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (user_id, day)
  );
`);

interface DayStats {
  day: string;
  active: boolean;
  xp: number;
  byRepo: Record<string, number>;
}

const stmtUsers = db.prepare("SELECT id, username, full_name, civilization, city_hall_level FROM users");
const stmtUserCommits = db.prepare(`
  SELECT c.hash, c.repo_id, c.committed_at, c.message, c.lines_added, c.lines_deleted, c.meaningful_lines
  FROM commits c
  WHERE c.author_login = ?
     OR c.author_email = ?
     OR c.author_email IN (SELECT email FROM user_emails WHERE user_id = ?)
`);
const stmtUserEmail = db.prepare("SELECT email FROM users WHERE id = ?");
const stmtOwnedRepos = db.prepare("SELECT id FROM repositories WHERE owner_login = ?");
const stmtUserPRs = db.prepare("SELECT repo_id, state, merged_at, created_at FROM pull_requests WHERE author_login = ?");
const stmtUserReviews = db.prepare(`
  SELECT repo_id, MIN(submitted_at) AS submitted_at FROM pull_reviews WHERE reviewer_login = ? GROUP BY repo_id, pr_id
`);

/** Replays one developer's history into per-day XP. PR and review XP count only on repos the developer committed to or owns (as for buildings). */
function replayUser(userId: string): DayStats[] {
  const email = (stmtUserEmail.get(userId) as { email?: string } | undefined)?.email || "";
  const commits = stmtUserCommits.all(userId, email, userId) as Array<any>;
  const xpByHash = scoreCommits(commits);
  const days = new Map<string, DayStats>();
  const at = (day: string) => {
    let d = days.get(day);
    if (!d) days.set(day, (d = { day, active: false, xp: 0, byRepo: {} }));
    return d;
  };
  const add = (day: string, repoId: string, xp: number) => {
    if (!day || xp <= 0) return;
    const d = at(day);
    d.xp += xp;
    d.byRepo[repoId] = (d.byRepo[repoId] ?? 0) + xp;
  };

  const repos = new Set<string>((stmtOwnedRepos.all(userId) as Array<{ id: string }>).map((r) => r.id));
  for (const c of commits) {
    const day = (c.committed_at || "").slice(0, 10);
    if (!day) continue;
    repos.add(c.repo_id);
    if (isMeaningfulCommit(c)) at(day).active = true;
    add(day, c.repo_id, xpByHash.get(c.hash) ?? 0);
  }
  for (const pr of stmtUserPRs.all(userId) as Array<any>) {
    if (!repos.has(pr.repo_id)) continue;
    const when = pr.state === "merged" ? pr.merged_at || pr.created_at : pr.created_at;
    add((when || "").slice(0, 10), pr.repo_id, prXp(pr.state));
  }
  for (const rv of stmtUserReviews.all(userId) as Array<{ repo_id: string; submitted_at: string }>) {
    if (repos.has(rv.repo_id)) add((rv.submitted_at || "").slice(0, 10), rv.repo_id, XP_RULES.review);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

let statsVersion = 0;
let statsBuiltDay = "";
let statsBuiltAt = 0;
/** New commits / PRs / reviews were stored since the last rebuild */
let statsDirty = true;
let statsCache: Map<string, DayStats[]> | null = null;
const boardCache = new Map<LeaderboardPeriod, { version: number; board: Leaderboard }>();

/** Rebuilds `dev_daily_stats` for every developer from the stored history (also the one-time backfill). */
export function rebuildDevDailyStats(): { users: number; rows: number } {
  const users = stmtUsers.all() as Array<{ id: string }>;
  const insert = db.prepare("INSERT INTO dev_daily_stats (user_id, day, active, xp, xp_by_repo_json) VALUES (?, ?, ?, ?, ?)");
  let rows = 0;
  const all = new Map<string, DayStats[]>();
  for (const u of users) all.set(u.id, replayUser(u.id));
  db.transaction(() => {
    db.prepare("DELETE FROM dev_daily_stats").run();
    for (const [userId, days] of all) {
      for (const d of days) {
        const byRepo = Object.fromEntries(Object.entries(d.byRepo).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
        insert.run(userId, d.day, d.active ? 1 : 0, Math.round(d.xp * 1000) / 1000, JSON.stringify(byRepo));
        rows++;
      }
    }
  })();
  statsCache = all;
  statsBuiltDay = dayKey(new Date());
  statsBuiltAt = Date.now();
  statsDirty = false;
  statsVersion++;
  return { users: users.length, rows };
}

function loadStats(): Map<string, DayStats[]> {
  if (statsCache) return statsCache;
  const rows = db.prepare("SELECT user_id, day, active, xp, xp_by_repo_json FROM dev_daily_stats ORDER BY day").all() as Array<{
    user_id: string;
    day: string;
    active: number;
    xp: number;
    xp_by_repo_json: string;
  }>;
  const map = new Map<string, DayStats[]>();
  for (const r of rows) {
    let list = map.get(r.user_id);
    if (!list) map.set(r.user_id, (list = []));
    list.push({ day: r.day, active: r.active === 1, xp: r.xp, byRepo: JSON.parse(r.xp_by_repo_json || "{}") });
  }
  statsCache = map;
  return map;
}

/** New history was stored (live sync, backfill): the next refresh rebuilds the daily stats */
export function markDevDailyStatsStale(): void {
  statsDirty = true;
}

/** Minimum time between rebuilds triggered by new history (a day change always rebuilds) */
const DIRTY_REBUILD_MIN_MS = 60_000;

/** Rebuilds the daily stats on a new UTC day, or when new history arrived (at most once a minute); cheap to call often */
export function refreshDevDailyStatsIfStale(): void {
  const newDay = statsBuiltDay !== dayKey(new Date());
  if (!newDay && !(statsDirty && Date.now() - statsBuiltAt >= DIRTY_REBUILD_MIN_MS)) return;
  try {
    const t0 = Date.now();
    const { users, rows } = rebuildDevDailyStats();
    console.log(`[Renown] 🏆 Rebuilt daily stats: ${rows.toLocaleString()} developer-days for ${users} developers in ${Date.now() - t0} ms`);
  } catch (err: any) {
    console.error("[Renown] ❌ Failed to rebuild daily stats:", err.message);
  }
}

interface Raw {
  userId: string;
  activeDays: number;
  workdays: number;
  activeness: number;
  repoActivity: number;
  quality: number;
  repos: number;
  qualityRepos: number;
}

/** Raw axis values of every ranked developer in a window */
function rawAxes(win: PeriodWindow, users: Array<{ id: string; username: string }>, stats: Map<string, DayStats[]>): Raw[] {
  const all = win.period === "all";
  const out: Raw[] = [];
  for (const u of users) {
    if (loginListed(config.specialUsers, u)) continue; // overseers and Archons aren't ranked
    const days = stats.get(u.id) ?? [];
    const firstActive = days.find((d) => d.active)?.day;
    if (!firstActive) continue;
    const from = all ? firstActive : win.from;
    let activeDays = 0;
    const periodXp = new Map<string, number>();
    const cumXp = new Map<string, number>();
    for (const d of days) {
      if (d.day > win.to) break;
      for (const [repo, xp] of Object.entries(d.byRepo)) cumXp.set(repo, (cumXp.get(repo) ?? 0) + xp);
      if (d.day < from) continue;
      if (d.active) activeDays++;
      for (const [repo, xp] of Object.entries(d.byRepo)) periodXp.set(repo, (periodXp.get(repo) ?? 0) + xp);
    }
    if (activeDays === 0) continue; // no meaningful commit in the period: not listed

    // Quality: repos worked on in the period, at their level at the end of the period
    const levels = [...periodXp.keys()].map((repo) => calculateBuildingLevel(cumXp.get(repo) ?? 0).level);
    const workdays = workdaysBetween(from, win.to);
    const years = Math.max(TENURE_FLOOR_YEARS, tenureYears(from, win.to));
    out.push({
      userId: u.id,
      activeDays,
      workdays,
      activeness: activenessRate(activeDays, workdays),
      repoActivity: repoActivity(periodXp.values()) / (all ? years : 1),
      quality: repoQuality(levels) / (all ? Math.sqrt(years) : 1),
      repos: periodXp.size,
      qualityRepos: levels.filter((l) => l >= QUALITY_MIN_LEVEL).length
    });
  }
  if (all && out.length) {
    // Short tenures are pulled toward the realm's average activeness
    const realmRate = Math.min(1, out.reduce((s, r) => s + r.activeDays, 0) / Math.max(1, out.reduce((s, r) => s + r.workdays, 0)));
    for (const r of out) r.activeness = shrunkActiveness(r.activeDays, r.workdays, realmRate);
  }
  return out;
}

function rank(raws: Raw[]) {
  const aPct = percentiles(raws.map((r) => r.activeness));
  const rPct = percentiles(raws.map((r) => r.repoActivity));
  const qPct = percentiles(raws.map((r) => r.quality));
  const aRank = ranksDesc(raws.map((r) => r.activeness));
  const rRank = ranksDesc(raws.map((r) => r.repoActivity));
  const qRank = ranksDesc(raws.map((r) => r.quality));
  return raws
    .map((r, i) => ({
      raw: r,
      score: fairnessScore(aPct[i], rPct[i], qPct[i]),
      activeness: { value: round3(r.activeness), pct: round1(aPct[i]), rank: aRank[i] },
      repoActivity: { value: round1(r.repoActivity), pct: round1(rPct[i]), rank: rRank[i] },
      quality: { value: round1(r.quality), pct: round1(qPct[i]), rank: qRank[i] }
    }))
    .sort((a, b) => b.score - a.score || b.activeness.pct - a.activeness.pct || b.raw.activeness - a.raw.activeness || a.raw.userId.localeCompare(b.raw.userId));
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

const CHANGE_SINCE: Record<LeaderboardPeriod, string> = {
  week: "the week before",
  month: "the month before",
  year: "a week ago",
  all: "a week ago"
};

export function getLeaderboard(period: LeaderboardPeriod, now = new Date()): Leaderboard {
  refreshDevDailyStatsIfStale();
  const cached = boardCache.get(period);
  if (cached && cached.version === statsVersion && Date.now() < cached.board.nextRefreshAt) return cached.board;

  const today = dayKey(now);
  const win = periodWindow(period, today, config.fiscalYearStartMonth)!;
  const prevWin = periodWindow(period, today, config.fiscalYearStartMonth, 1);
  const users = stmtUsers.all() as Array<{ id: string; username: string; full_name: string | null; civilization: CivilizationType | null; city_hall_level: number | null }>;
  const stats = loadStats();

  const ranked = rank(rawAxes(win, users, stats));
  const prevRank = new Map<string, number>();
  if (prevWin) rank(rawAxes(prevWin, users, stats)).forEach((r, i) => prevRank.set(r.raw.userId, i + 1));
  const byId = new Map(users.map((u) => [u.id, u]));

  const entries: LeaderboardEntry[] = ranked.map((r, i) => {
    const u = byId.get(r.raw.userId)!;
    const before = prevRank.get(r.raw.userId);
    return {
      rank: i + 1,
      userId: u.id,
      name: u.full_name || u.username,
      username: u.username,
      civilization: u.civilization || "human",
      castleLevel: u.city_hall_level ?? 1,
      score: round1(r.score),
      activeness: r.activeness,
      repoActivity: r.repoActivity,
      quality: r.quality,
      activeDays: r.raw.activeDays,
      workdays: r.raw.workdays,
      repos: r.raw.repos,
      qualityRepos: r.raw.qualityRepos,
      change: before === undefined ? null : before - (i + 1)
    };
  });

  const board: Leaderboard = {
    period,
    label: win.label,
    from: period === "all" ? (entries.length ? firstDay(stats) : win.to) : win.from,
    to: win.to,
    workdays: period === "all" ? 0 : workdaysBetween(win.from, win.to),
    changeSince: CHANGE_SINCE[period],
    entries,
    computedAt: now.toISOString(),
    nextRefreshAt: win.rollsOverAt
  };
  boardCache.set(period, { version: statsVersion, board });
  return board;
}

function firstDay(stats: Map<string, DayStats[]>): string {
  let first = "9999-12-31";
  for (const days of stats.values()) for (const d of days) if (d.active && d.day < first) { first = d.day; break; }
  return first;
}

/** Top 3 of every tab: Weekly / Monthly / Year marks in the kingdom picker, All time on the crowned civ frames */
export function getRenownPodium(): RenownPodium {
  const top = (period: LeaderboardPeriod) => getLeaderboard(period).entries.slice(0, 3).map((e) => e.userId);
  return { week: top("week"), month: top("month"), year: top("year"), all: top("all") };
}
