import { db, isSpecialUserId } from "./db.js";
import { config } from "./env.js";
import { byName } from "./scriptorium.js";
import { scoreCommits, prXp, XP_RULES, isMeaningfulCommit, countedLines, round1 } from "./scoring.js";
import type {
  WatchDevRow,
  WatchGlance,
  WatchImpact,
  WatchImpactMetrics,
  WatchPeriod,
  WatchPeriodKind,
  WatchPerson,
  WatchRepoStat,
  WatchTree,
  WatchTreeNode
} from "./types.js";

/**
 * 🔭 The Watchtower (GAME_GUIDE §18): work analytics for Admins, Special Overseers and the Archon, never for players.
 * Everything is read from SQLite (commits, PRs, reviews, deeds, the Scriptorium tree, play actions) and cached per
 * period. Days are the commits' own dates (the first 10 characters of `committed_at`), as for XP; a week is an ISO
 * week (Monday–Sunday), a month a calendar month.
 *
 * The roster: every developer (Special Overseers and the Archon left out) with any activity (a commit, PR, review or
 * deed) in the 90 days up to the period's end. "Quiet" = on the roster with none of those in the period.
 */

const DAY_MS = 86_400_000;
const ROSTER_DAYS = 90;
/** A commit under this many changed lines is "tiny" */
export const TINY_COMMIT_LINES = 10;
/** Per-dev "splitting work for XP" tell: commits per working day up this much while median lines fall this much */
const SPLIT_COMMITS_UP = 1.25;
const SPLIT_LINES_DOWN = 0.75;

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => dayOf(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 Sunday … 6 Saturday
const isWorkday = (day: string) => {
  const w = weekday(day);
  return w >= 1 && w <= 5;
};
const daysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ------------------------------------------------------------------------- */
/* Periods                                                                     */
/* ------------------------------------------------------------------------- */

/** Monday of the ISO week holding `day` */
function mondayOf(day: string): string {
  const w = weekday(day);
  return addDays(day, -((w + 6) % 7));
}

function isoWeekKey(monday: string): string {
  // The ISO year is the year of the week's Thursday
  const thu = addDays(monday, 3);
  const year = Number(thu.slice(0, 4));
  const jan4 = `${year}-01-04`;
  const week = Math.round((Date.parse(`${monday}T00:00:00Z`) - Date.parse(`${mondayOf(jan4)}T00:00:00Z`)) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function mondayOfWeekKey(key: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return null;
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  return addDays(mondayOf(`${m[1]}-01-04`), (week - 1) * 7);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function periodOf(kind: WatchPeriodKind, key?: string, now = Date.now()): WatchPeriod {
  const today = dayOf(now);
  if (kind === "week") {
    const monday = (key && mondayOfWeekKey(key)) || mondayOf(today);
    const to = addDays(monday, 7);
    const k = isoWeekKey(monday);
    return {
      kind,
      key: k,
      label: `Week ${Number(k.slice(6))} · ${monday} – ${addDays(to, -1)}`,
      from: monday,
      to,
      prevKey: isoWeekKey(addDays(monday, -7)),
      nextKey: to <= today ? isoWeekKey(to) : null,
      workingDays: daysBetween(monday, to < today ? to : addDays(today, 1)).filter(isWorkday).length,
      current: monday <= today && today < to
    };
  }
  const m = key && /^(\d{4})-(\d{2})$/.test(key) ? key : today.slice(0, 7);
  const from = `${m}-01`;
  const [y, mo] = m.split("-").map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
  const to = `${next}-01`;
  return {
    kind,
    key: m,
    label: `${MONTHS[mo - 1]} ${y}`,
    from,
    to,
    prevKey: prev,
    nextKey: to <= today ? next : null,
    workingDays: daysBetween(from, to < today ? to : addDays(today, 1)).filter(isWorkday).length,
    current: from <= today && today < to
  };
}

/* ------------------------------------------------------------------------- */
/* Who is who                                                                  */
/* ------------------------------------------------------------------------- */

interface Dev {
  id: string;
  name: string;
  civ: string;
}

interface Directory {
  devs: Map<string, Dev>;
  /** Commit email → developer id */
  byEmail: Map<string, string>;
}

function directory(): Directory {
  const users = db.prepare(`SELECT id, username, full_name, email, civilization FROM users`).all() as Array<{ id: string; username: string; full_name?: string; email?: string; civilization?: string }>;
  const devs = new Map<string, Dev>();
  const byEmail = new Map<string, string>();
  for (const u of users) {
    if (isSpecialUserId(u.id)) continue;
    devs.set(u.id, { id: u.id, name: u.full_name || u.username, civ: u.civilization || "human" });
    if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
  }
  for (const e of db.prepare(`SELECT email, user_id FROM user_emails`).all() as Array<{ email: string; user_id: string }>) {
    if (devs.has(e.user_id)) byEmail.set(e.email.toLowerCase(), e.user_id);
  }
  return { devs, byEmail };
}

interface CommitRow {
  hash: string;
  repo_id: string;
  author_login: string | null;
  author_email: string | null;
  message: string;
  lines_added: number;
  lines_deleted: number;
  meaningful_lines: number | null;
  committed_at: string;
}

function commitsBetween(dir: Directory, from: string, to: string): Array<CommitRow & { userId: string }> {
  const rows = db
    .prepare(`SELECT hash, repo_id, author_login, author_email, message, lines_added, lines_deleted, meaningful_lines, committed_at FROM commits WHERE committed_at >= ? AND committed_at < ?`)
    .all(from, to) as CommitRow[];
  const out: Array<CommitRow & { userId: string }> = [];
  for (const c of rows) {
    const userId = c.author_login && dir.devs.has(c.author_login) ? c.author_login : c.author_email ? dir.byEmail.get(c.author_email.toLowerCase()) : undefined;
    if (userId) out.push({ ...c, userId });
  }
  return out;
}

const prsBetween = (field: "created_at" | "merged_at", from: string, to: string) =>
  db.prepare(`SELECT id, repo_id, author_login, state, merged_at, created_at FROM pull_requests WHERE ${field} >= ? AND ${field} < ?`).all(from, to) as Array<{
    id: number;
    repo_id: string;
    author_login: string;
    state: string;
    merged_at: string | null;
    created_at: string;
  }>;

/** One review per PR per reviewer (the first), as XP counts it */
const reviewsBetween = (from: string, to: string) =>
  db
    .prepare(`SELECT reviewer_login, repo_id, pr_id, MIN(submitted_at) AS submitted_at FROM pull_reviews GROUP BY reviewer_login, repo_id, pr_id HAVING MIN(submitted_at) >= ? AND MIN(submitted_at) < ?`)
    .all(from, to) as Array<{ reviewer_login: string; repo_id: string; pr_id: number; submitted_at: string }>;

const deedsBetween = (from: string, to: string) =>
  db.prepare(`SELECT id, user_id, repo_id, day, title, xp, status, created_at FROM deeds WHERE day >= ? AND day < ?`).all(from, to) as Array<{
    id: number;
    user_id: string;
    repo_id: string;
    day: string;
    title: string;
    xp: number;
    status: string;
    created_at: string;
  }>;

const repoNames = () => new Map((db.prepare(`SELECT id, name, full_name FROM repositories`).all() as Array<{ id: string; name: string; full_name: string }>).map((r) => [r.id, r]));

/* ------------------------------------------------------------------------- */
/* Cache                                                                       */
/* ------------------------------------------------------------------------- */

const cache = new Map<string, { at: number; value: unknown }>();
function cached<T>(key: string, ttlMs: number, build: () => T): T {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = build();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return value;
}
const ttlFor = (p: WatchPeriod) => (p.current ? 5 * 60_000 : 60 * 60_000);

/** New deeds or a re-sync change the numbers: drop what's cached */
export function invalidateWatchtower() {
  cache.clear();
}

/* ------------------------------------------------------------------------- */
/* Activity per developer                                                      */
/* ------------------------------------------------------------------------- */

interface Activity {
  at: string;
  what: string;
}

function rosterActivity(dir: Directory, p: WatchPeriod) {
  const since = addDays(p.from, -ROSTER_DAYS);
  const names = repoNames();
  const repoName = (id: string) => names.get(id)?.name ?? id.replace(/^repo-/, "");
  const last = new Map<string, Activity>();
  const note = (userId: string | undefined, at: string, what: string) => {
    if (!userId || !dir.devs.has(userId) || at >= p.to) return;
    const cur = last.get(userId);
    if (!cur || at > cur.at) last.set(userId, { at, what });
  };
  for (const c of commitsBetween(dir, since, p.to)) if (isMeaningfulCommit(c)) note(c.userId, c.committed_at, `Commit to ${repoName(c.repo_id)}`);
  for (const pr of prsBetween("created_at", since, p.to)) note(pr.author_login, pr.created_at, `Opened a PR in ${repoName(pr.repo_id)}`);
  for (const pr of prsBetween("merged_at", since, p.to)) note(pr.author_login, pr.merged_at!, `PR merged in ${repoName(pr.repo_id)}`);
  for (const r of reviewsBetween(since, p.to)) note(r.reviewer_login, r.submitted_at, `Reviewed a PR in ${repoName(r.repo_id)}`);
  for (const d of deedsBetween(since, p.to)) if (d.status !== "rejected") note(d.user_id, `${d.day}T23:59:59`, `Deed: ${d.title}`);
  return last;
}

/** Every developer's numbers in the period (only those on the roster) */
function devRows(dir: Directory, p: WatchPeriod): { rows: WatchDevRow[]; hours: number[]; commitsTotal: number } {
  const days = daysBetween(p.from, p.to);
  const dayIdx = new Map(days.map((d, i) => [d, i]));
  const last = rosterActivity(dir, p);
  const rows = new Map<string, WatchDevRow>();
  const row = (id: string): WatchDevRow => {
    let r = rows.get(id);
    if (!r) {
      const d = dir.devs.get(id)!;
      r = {
        userId: id,
        name: d.name,
        civ: d.civ,
        commits: 0,
        lines: 0,
        prsOpened: 0,
        prsMerged: 0,
        reviews: 0,
        deedsSealed: 0,
        deedsPending: 0,
        deedXp: 0,
        gitXp: 0,
        activeDays: 0,
        byDay: days.map(() => 0),
        lastActivityAt: null,
        lastActivity: null,
        daysSince: null,
        quiet: true
      };
      rows.set(id, r);
    }
    return r;
  };
  const hours = Array.from({ length: 24 }, () => 0);
  const hit = (r: WatchDevRow, day: string) => {
    const i = dayIdx.get(day);
    if (i !== undefined) r.byDay[i]++;
    r.quiet = false;
  };

  const commits = commitsBetween(dir, p.from, p.to);
  const byDev = new Map<string, typeof commits>();
  for (const c of commits) byDev.set(c.userId, [...(byDev.get(c.userId) ?? []), c]);
  let commitsTotal = 0;
  for (const [id, list] of byDev) {
    const xp = scoreCommits(list);
    const r = row(id);
    for (const c of list) {
      if (!isMeaningfulCommit(c)) continue;
      r.commits++;
      commitsTotal++;
      r.lines += countedLines(c);
      r.gitXp += xp.get(c.hash) ?? 0;
      hit(r, c.committed_at.slice(0, 10));
      const h = Number(c.committed_at.slice(11, 13));
      if (Number.isFinite(h) && h >= 0 && h < 24) hours[h]++;
    }
  }
  for (const pr of prsBetween("created_at", p.from, p.to)) {
    if (!dir.devs.has(pr.author_login)) continue;
    const r = row(pr.author_login);
    r.prsOpened++;
    if (pr.state !== "merged") r.gitXp += XP_RULES.openPR;
    hit(r, pr.created_at.slice(0, 10));
  }
  for (const pr of prsBetween("merged_at", p.from, p.to)) {
    if (!dir.devs.has(pr.author_login)) continue;
    const r = row(pr.author_login);
    r.prsMerged++;
    r.gitXp += prXp("merged");
    hit(r, pr.merged_at!.slice(0, 10));
  }
  for (const rv of reviewsBetween(p.from, p.to)) {
    if (!dir.devs.has(rv.reviewer_login)) continue;
    const r = row(rv.reviewer_login);
    r.reviews++;
    r.gitXp += XP_RULES.review;
    hit(r, rv.submitted_at.slice(0, 10));
  }
  for (const d of deedsBetween(p.from, p.to)) {
    if (!dir.devs.has(d.user_id) || d.status === "rejected") continue;
    const r = row(d.user_id);
    if (d.status === "sealed") {
      r.deedsSealed++;
      r.deedXp += d.xp;
    } else if (d.status === "pending") r.deedsPending++;
    hit(r, d.day);
  }
  // The rest of the roster: active in the 90 days before but quiet now
  for (const id of last.keys()) row(id);

  const endRef = p.current ? Date.now() : Date.parse(`${p.to}T00:00:00Z`);
  for (const r of rows.values()) {
    r.gitXp = round1(r.gitXp);
    r.deedXp = round1(r.deedXp);
    r.activeDays = r.byDay.filter((n) => n > 0).length;
    const l = last.get(r.userId);
    if (l) {
      r.lastActivityAt = l.at;
      r.lastActivity = l.what;
      r.daysSince = Math.max(0, Math.floor((endRef - Date.parse(l.at.length > 10 ? l.at : `${l.at}T00:00:00Z`)) / DAY_MS));
    }
  }
  return { rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)), hours, commitsTotal };
}

/* ------------------------------------------------------------------------- */
/* 1. At a glance                                                              */
/* ------------------------------------------------------------------------- */

export function getGlance(kind: WatchPeriodKind, key?: string): WatchGlance {
  const p = periodOf(kind, key);
  return cached(`glance:${p.kind}:${p.key}`, ttlFor(p), () => {
    const dir = directory();
    const { rows, hours, commitsTotal } = devRows(dir, p);
    const sum = (f: (r: WatchDevRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    return {
      period: p,
      days: daysBetween(p.from, p.to),
      kpis: {
        roster: rows.length,
        activeDevs: rows.filter((r) => !r.quiet).length,
        quietDevs: rows.filter((r) => r.quiet).length,
        commits: commitsTotal,
        lines: sum((r) => r.lines),
        deedsSealed: sum((r) => r.deedsSealed),
        deedsPending: sum((r) => r.deedsPending),
        deedXp: round1(sum((r) => r.deedXp)),
        gitXp: round1(sum((r) => r.gitXp)),
        prsMerged: sum((r) => r.prsMerged),
        reviews: sum((r) => r.reviews)
      },
      devs: rows,
      hours
    };
  });
}

/* ------------------------------------------------------------------------- */
/* 2. Divisions & projects                                                     */
/* ------------------------------------------------------------------------- */

function repoStats(dir: Directory, from: string, to: string): Map<string, WatchRepoStat & { devSet: Set<string> }> {
  const names = repoNames();
  const out = new Map<string, WatchRepoStat & { devSet: Set<string> }>();
  const stat = (repoId: string) => {
    let s = out.get(repoId);
    if (!s) {
      const n = names.get(repoId);
      s = { repoId, name: n?.name ?? repoId.replace(/^repo-/, ""), fullName: n?.full_name ?? repoId.replace(/^repo-/, ""), commits: 0, lines: 0, deeds: 0, deedXp: 0, prsMerged: 0, devs: 0, prevCommits: 0, devSet: new Set() };
      out.set(repoId, s);
    }
    return s;
  };
  for (const c of commitsBetween(dir, from, to)) {
    if (!isMeaningfulCommit(c)) continue;
    const s = stat(c.repo_id);
    s.commits++;
    s.lines += countedLines(c);
    s.devSet.add(c.userId);
  }
  for (const pr of prsBetween("merged_at", from, to)) {
    const s = stat(pr.repo_id);
    s.prsMerged++;
    if (dir.devs.has(pr.author_login)) s.devSet.add(pr.author_login);
  }
  for (const d of deedsBetween(from, to)) {
    if (d.status !== "sealed") continue;
    const s = stat(d.repo_id);
    s.deeds++;
    s.deedXp += d.xp;
    s.devSet.add(d.user_id);
  }
  for (const s of out.values()) s.devs = s.devSet.size;
  return out;
}

const strip = (s: WatchRepoStat & { devSet?: Set<string> }): WatchRepoStat => {
  const { devSet: _d, ...rest } = s;
  return { ...rest, deedXp: round1(rest.deedXp) };
};

export function getTreeStats(kind: WatchPeriodKind, key?: string): WatchTree {
  const p = periodOf(kind, key);
  return cached(`tree:${p.kind}:${p.key}`, ttlFor(p), () => {
    const dir = directory();
    const prev = periodOf(kind, p.prevKey);
    const now = repoStats(dir, p.from, p.to);
    const before = repoStats(dir, prev.from, prev.to);
    const names = repoNames();
    const empty = (repoId: string): WatchRepoStat => {
      const n = names.get(repoId);
      return { repoId, name: n?.name ?? repoId.replace(/^repo-/, ""), fullName: n?.full_name ?? repoId, commits: 0, lines: 0, deeds: 0, deedXp: 0, prsMerged: 0, devs: 0, prevCommits: 0 };
    };
    const statOf = (repoId: string): WatchRepoStat & { devSet: Set<string> } => {
      const s = now.get(repoId);
      const base = s ? { ...s } : { ...empty(repoId), devSet: new Set<string>() };
      base.prevCommits = before.get(repoId)?.commits ?? 0;
      return base;
    };

    // A–Z at every level, as in the Scriptorium
    const divisions = (db.prepare(`SELECT id, name FROM divisions`).all() as Array<{ id: number; name: string }>).sort(byName);
    const clients = (db.prepare(`SELECT id, division_id, name FROM clients`).all() as Array<{ id: number; division_id: number; name: string }>).sort(byName);
    const projects = (db.prepare(`SELECT id, client_id, name FROM projects`).all() as Array<{ id: number; client_id: number; name: string }>).sort(byName);
    const assigned = db.prepare(`SELECT repo_id, project_id FROM project_repos`).all() as Array<{ repo_id: string; project_id: number }>;
    const inTree = new Set(assigned.map((a) => a.repo_id));

    const rollup = (kindName: WatchTreeNode["kind"], id: string, name: string, children: WatchTreeNode[], stats: Array<WatchRepoStat & { devSet: Set<string> }>): WatchTreeNode => {
      const devs = new Set<string>();
      for (const s of stats) for (const d of s.devSet) devs.add(d);
      const node: WatchTreeNode = {
        kind: kindName,
        id,
        name,
        commits: stats.reduce((t, s) => t + s.commits, 0),
        lines: stats.reduce((t, s) => t + s.lines, 0),
        deeds: stats.reduce((t, s) => t + s.deeds, 0),
        deedXp: round1(stats.reduce((t, s) => t + s.deedXp, 0)),
        prsMerged: stats.reduce((t, s) => t + s.prsMerged, 0),
        prevCommits: stats.reduce((t, s) => t + s.prevCommits, 0),
        devs: devs.size,
        repos: stats.length,
        staleRepos: stats.filter((s) => s.commits === 0 && s.deeds === 0 && s.prsMerged === 0).length,
        children
      };
      if (kindName === "project" || kindName === "unsorted") node.repoStats = stats.map(strip).sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));
      return node;
    };

    const projectStats = new Map<number, Array<WatchRepoStat & { devSet: Set<string> }>>();
    for (const a of assigned) projectStats.set(a.project_id, [...(projectStats.get(a.project_id) ?? []), statOf(a.repo_id)]);

    const roots: WatchTreeNode[] = divisions.map((d) => {
      const allDiv: Array<WatchRepoStat & { devSet: Set<string> }> = [];
      const clientNodes = clients
        .filter((c) => c.division_id === d.id)
        .map((c) => {
          const allClient: Array<WatchRepoStat & { devSet: Set<string> }> = [];
          const projectNodes = projects
            .filter((pr) => pr.client_id === c.id)
            .map((pr) => {
              const stats = projectStats.get(pr.id) ?? [];
              allClient.push(...stats);
              return rollup("project", String(pr.id), pr.name, [], stats);
            });
          allDiv.push(...allClient);
          return rollup("client", String(c.id), c.name, projectNodes, allClient);
        });
      return rollup("division", String(d.id), d.name, clientNodes, allDiv);
    });
    // Repos with activity this period that sit in no project
    const unsortedStats = [...now.keys()].filter((id) => !inTree.has(id)).map(statOf);
    if (unsortedStats.length) roots.push(rollup("unsorted", "unsorted", "Unsorted", [], unsortedStats));

    const treeStats = assigned.map((a) => statOf(a.repo_id));
    const stale = treeStats.filter((s) => s.commits === 0 && s.deeds === 0 && s.prsMerged === 0).map(strip).sort((a, b) => b.prevCommits - a.prevCommits || a.name.localeCompare(b.name));
    const all = new Set([...now.keys(), ...before.keys()]);
    const movers = [...all]
      .map((id) => statOf(id))
      .filter((s) => s.commits !== s.prevCommits)
      .sort((a, b) => Math.abs(b.commits - b.prevCommits) - Math.abs(a.commits - a.prevCommits))
      .slice(0, 10)
      .map(strip);
    return { period: p, roots, stale: stale.slice(0, 50), staleCount: stale.length, movers };
  });
}

/* ------------------------------------------------------------------------- */
/* 3. People                                                                   */
/* ------------------------------------------------------------------------- */

export function getPerson(userId: string, kind: WatchPeriodKind, key?: string): WatchPerson | null {
  const p = periodOf(kind, key);
  return cached(`person:${userId}:${p.kind}:${p.key}`, ttlFor(p), () => {
    const dir = directory();
    const dev = dir.devs.get(userId);
    if (!dev) return null;
    const names = repoNames();
    const repoName = (id: string) => names.get(id)?.name ?? id.replace(/^repo-/, "");

    // XP over the last 12 periods by source
    const series: WatchPerson["xpSeries"] = [];
    let q = p;
    for (let i = 0; i < 12; i++) {
      const commits = commitsBetween(dir, q.from, q.to).filter((c) => c.userId === userId);
      const xp = scoreCommits(commits);
      const prs =
        prsBetween("created_at", q.from, q.to).filter((r) => r.author_login === userId && r.state !== "merged").length * XP_RULES.openPR +
        prsBetween("merged_at", q.from, q.to).filter((r) => r.author_login === userId).length * XP_RULES.mergedPR;
      const reviews = reviewsBetween(q.from, q.to).filter((r) => r.reviewer_login === userId).length * XP_RULES.review;
      const deeds = deedsBetween(q.from, q.to).filter((d) => d.user_id === userId && d.status === "sealed").reduce((s, d) => s + d.xp, 0);
      series.unshift({ key: q.key, label: q.kind === "week" ? q.from.slice(5) : q.label.slice(0, 3) + " " + q.key.slice(2, 4), commits: round1([...xp.values()].reduce((s, v) => s + v, 0)), prs: round1(prs), reviews: round1(reviews), deeds: round1(deeds) });
      q = periodOf(kind, q.prevKey);
    }

    const days = daysBetween(p.from, p.to);
    const commits = commitsBetween(dir, p.from, p.to).filter((c) => c.userId === userId && isMeaningfulCommit(c));
    const perDay = new Map<string, number>();
    const hours = Array.from({ length: 24 }, () => 0);
    let weekend = 0;
    const repoMap = new Map<string, { name: string; commits: number; deedXp: number }>();
    const touch = (id: string) => {
      let r = repoMap.get(id);
      if (!r) repoMap.set(id, (r = { name: repoName(id), commits: 0, deedXp: 0 }));
      return r;
    };
    for (const c of commits) {
      const day = c.committed_at.slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      const h = Number(c.committed_at.slice(11, 13));
      if (Number.isFinite(h) && h >= 0 && h < 24) hours[h]++;
      if (!isWorkday(day)) weekend++;
      touch(c.repo_id).commits++;
    }
    const lines = commits.map(countedLines);
    const deeds = deedsBetween(p.from, p.to).filter((d) => d.user_id === userId);
    for (const d of deeds) if (d.status === "sealed") touch(d.repo_id).deedXp += d.xp;
    const deedCount = (s: string) => deeds.filter((d) => d.status === s).length;
    const projectRows = repoMap.size
      ? (db
          .prepare(`SELECT DISTINCT p.name FROM project_repos pr JOIN projects p ON p.id = pr.project_id WHERE pr.repo_id IN (${[...repoMap.keys()].map(() => "?").join(",")}) ORDER BY p.name`)
          .all(...repoMap.keys()) as Array<{ name: string }>)
      : [];

    return {
      period: p,
      userId,
      name: dev.name,
      civ: dev.civ,
      xpSeries: series,
      commitsPerDay: days.map((day) => ({ day, commits: perDay.get(day) ?? 0 })),
      commits: commits.length,
      medianLines: Math.round(median(lines)),
      tinyShare: lines.length ? lines.filter((l) => l < TINY_COMMIT_LINES).length / lines.length : 0,
      prsOpened: prsBetween("created_at", p.from, p.to).filter((r) => r.author_login === userId).length,
      prsMerged: prsBetween("merged_at", p.from, p.to).filter((r) => r.author_login === userId).length,
      reviews: reviewsBetween(p.from, p.to).filter((r) => r.reviewer_login === userId).length,
      deeds: { sealed: deedCount("sealed"), rejected: deedCount("rejected"), pending: deedCount("pending"), revoked: deedCount("revoked") },
      hours,
      weekendShare: commits.length ? weekend / commits.length : 0,
      activeDays: perDay.size,
      repos: [...repoMap.values()].map((r) => ({ ...r, deedXp: round1(r.deedXp) })).sort((a, b) => b.commits - a.commits || b.deedXp - a.deedXp),
      projects: projectRows.map((r) => r.name)
    };
  });
}

/* ------------------------------------------------------------------------- */
/* 4. Did the game change how we commit?                                       */
/* ------------------------------------------------------------------------- */

/** The day the game started: GAME_LAUNCH_DATE, or the realm's first harvest (kept in realm_meta so it never moves) */
export function gameLaunch(): { day: string; source: WatchImpact["launchSource"] } {
  if (config.gameLaunchDate) return { day: config.gameLaunchDate, source: "env" };
  const stored = (db.prepare(`SELECT value FROM realm_meta WHERE key = 'game_launch_date'`).get() as { value?: string } | undefined)?.value;
  if (stored) return { day: stored, source: "first_harvest" };
  const first = (db.prepare(`SELECT MIN(cycle_timestamp) AS t FROM allocation_logs`).get() as { t?: string | null }).t;
  if (first) {
    const day = first.slice(0, 10);
    db.prepare(`INSERT OR REPLACE INTO realm_meta (key, value) VALUES ('game_launch_date', ?)`).run(day);
    return { day, source: "first_harvest" };
  }
  return { day: dayOf(Date.now()), source: "today" };
}

/** Raw changed lines: diffs are only analysed for the last 30 days, so both sides of the comparison use the same measure */
const rawLines = (c: CommitRow) => (c.lines_added || 0) + (c.lines_deleted || 0);
const isWork = (c: CommitRow) => !/^merge /i.test((c.message || "").trim()) && rawLines(c) > 0;

function metrics(commits: Array<CommitRow & { userId: string }>, prs: number, reviews: number, devCount: number, workingDays: number): WatchImpactMetrics {
  const lines = commits.map(rawLines);
  const activeDays = new Set(commits.map((c) => `${c.userId}|${c.committed_at.slice(0, 10)}`)).size;
  return {
    devs: devCount,
    commits: commits.length,
    commitsPerDevDay: devCount && workingDays ? commits.length / (devCount * workingDays) : 0,
    medianLines: Math.round(median(lines)),
    tinyShare: lines.length ? lines.filter((l) => l < TINY_COMMIT_LINES).length / lines.length : 0,
    commitsPerActiveDay: activeDays ? commits.length / activeDays : 0,
    prsPerDev: devCount ? prs / devCount : 0,
    reviewsPerDev: devCount ? reviews / devCount : 0
  };
}

export function getImpact(): WatchImpact {
  return cached("impact", 30 * 60_000, () => {
    const launch = gameLaunch();
    const today = dayOf(Date.now());
    const end = addDays(today, 1);
    const sinceLaunch = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${launch.day}T00:00:00Z`)) / DAY_MS));
    // Matched windows: the same number of days on both sides of the launch (4 weeks to a year)
    const windowDays = Math.min(365, Math.max(28, sinceLaunch));
    const before = { from: addDays(launch.day, -windowDays), to: launch.day };
    const afterTo = addDays(launch.day, windowDays) < end ? addDays(launch.day, windowDays) : end;
    const after = { from: launch.day, to: afterTo };
    const dir = directory();
    const wd = (w: { from: string; to: string }) => daysBetween(w.from, w.to).filter(isWorkday).length;

    const side = (w: { from: string; to: string }) => {
      const commits = commitsBetween(dir, w.from, w.to).filter(isWork);
      const prs = prsBetween("created_at", w.from, w.to).filter((r) => dir.devs.has(r.author_login));
      const reviews = reviewsBetween(w.from, w.to).filter((r) => dir.devs.has(r.reviewer_login));
      return { commits, prs, reviews };
    };
    const b = side(before);
    const a = side(after);
    const devsOf = (s: ReturnType<typeof side>) => new Set(s.commits.map((c) => c.userId));
    const bDevs = devsOf(b);
    const aDevs = devsOf(a);
    const team = {
      before: metrics(b.commits, b.prs.length, b.reviews.length, bDevs.size, wd(before)),
      after: metrics(a.commits, a.prs.length, a.reviews.length, aDevs.size, wd(after))
    };

    // Per developer: those with at least 5 commits on both sides
    const perDev = (s: ReturnType<typeof side>, id: string, w: { from: string; to: string }) =>
      metrics(
        s.commits.filter((c) => c.userId === id),
        s.prs.filter((r) => r.author_login === id).length,
        s.reviews.filter((r) => r.reviewer_login === id).length,
        1,
        wd(w)
      );
    const devs = [...aDevs]
      .filter((id) => bDevs.has(id))
      .map((id) => {
        const mb = perDev(b, id, before);
        const ma = perDev(a, id, after);
        return {
          userId: id,
          name: dir.devs.get(id)?.name ?? id,
          before: mb,
          after: ma,
          splitting: mb.commits >= 5 && ma.commits >= 5 && ma.commitsPerDevDay >= mb.commitsPerDevDay * SPLIT_COMMITS_UP && ma.medianLines <= mb.medianLines * SPLIT_LINES_DOWN
        };
      })
      .filter((d) => d.before.commits >= 5 && d.after.commits >= 5)
      .sort((x, y) => Number(y.splitting) - Number(x.splitting) || x.name.localeCompare(y.name));

    // Weekly trend across both windows
    const trend: WatchImpact["trend"] = [];
    const all = [...b.commits, ...a.commits];
    const byWeek = new Map<string, typeof all>();
    for (const c of all) {
      const m = mondayOf(c.committed_at.slice(0, 10));
      byWeek.set(m, [...(byWeek.get(m) ?? []), c]);
    }
    for (let m = mondayOf(before.from); m < after.to; m = addDays(m, 7)) {
      const list = byWeek.get(m) ?? [];
      const lines = list.map(rawLines);
      const devCount = new Set(list.map((c) => c.userId)).size;
      trend.push({
        week: m,
        commits: list.length,
        devs: devCount,
        commitsPerDev: devCount ? list.length / devCount : 0,
        medianLines: Math.round(median(lines)),
        tinyShare: lines.length ? lines.filter((l) => l < TINY_COMMIT_LINES).length / lines.length : 0
      });
    }
    return { launch: launch.day, launchSource: launch.source, windowDays, before, after, team, devs, trend, tinyLines: TINY_COMMIT_LINES };
  });
}
