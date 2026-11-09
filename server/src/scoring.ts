/**
 * Contribution XP — rewards meaningful work instead of raw commit volume.
 * One ordinary, non-trivial commit is worth ~1 XP, so level thresholds stay in "commit equivalents".
 *
 * - Commits: size = meaningful changed lines from the diff (diffQuality.ts: no blank, whitespace,
 *   comment-only, reformat/move, lockfile or generated lines; raw line count for commits not analysed).
 *   Commits with no meaningful lines and merge commits earn 0 XP and don't use up the daily quota.
 *   Diminishing returns per developer per day (first 5 full, next 5 half, then 0.2), scaled by size
 *   on a log curve (a one-line fix ≈ 0.6 XP, 100+ lines = 1 XP).
 * - Big commits: +0.5 / +1.0 / +1.5 added to the daily multiplier at 500 / 1001 / 2001+ counted lines,
 *   on every commit of the day (a big commit past the daily quota still earns its full bonus). Capped at +1.5.
 * - Pull requests: merged = 3 XP, opened but not (yet) merged = 0.5 XP.
 * - Code reviews on someone else's PR: 1.5 XP, counted once per PR per reviewer.
 */

export const XP_RULES = {
  fullCommitsPerDay: 5,
  halfCommitsPerDay: 5,
  tailMultiplier: 0.2,
  /** [min counted lines, bonus added to the daily multiplier], largest first */
  bigCommitTiers: [[2001, 1.5], [1001, 1.0], [500, 0.5]] as ReadonlyArray<readonly [number, number]>,
  mergedPR: 3,
  openPR: 0.5,
  review: 1.5
} as const;

const MERGE_COMMIT = /^merge (branch|pull request|remote-tracking branch|tag|commit|['"]|[0-9a-f]{7,})/i;

export function isMergeCommit(message: string): boolean {
  return MERGE_COMMIT.test((message || "").trim());
}

/** 0.5 at the bottom of the curve → 1.0 at 100+ changed lines (empty commits never reach this) */
export function commitSizeFactor(linesChanged: number): number {
  return 0.5 + 0.5 * Math.min(1, Math.log10(1 + Math.max(0, linesChanged)) / 2);
}

/** Multiplier for the nth (0-based) commit a developer made on one day */
export function dailyMultiplier(nth: number): number {
  if (nth < XP_RULES.fullCommitsPerDay) return 1;
  if (nth < XP_RULES.fullCommitsPerDay + XP_RULES.halfCommitsPerDay) return 0.5;
  return XP_RULES.tailMultiplier;
}

/** Bonus added to the daily multiplier for big commits (0 below 500 counted lines, at most +1.5) */
export function bigCommitBonus(linesChanged: number): number {
  for (const [min, bonus] of XP_RULES.bigCommitTiers) if (linesChanged >= min) return bonus;
  return 0;
}

export interface ScoredCommit {
  hash: string;
  committed_at: string;
  message: string;
  lines_added: number;
  lines_deleted: number;
  meaningful_lines?: number | null; // from the diff; null/undefined = not analysed, use the raw count
}

/** Changed lines that count: meaningful lines from the diff when analysed, else the raw count */
export function countedLines(c: ScoredCommit): number {
  return c.meaningful_lines ?? (c.lines_added || 0) + (c.lines_deleted || 0);
}

/** Real work: not a merge, and at least one counted line */
export function isMeaningfulCommit(c: ScoredCommit): boolean {
  return !isMergeCommit(c.message) && countedLines(c) > 0;
}

/**
 * XP for each of a developer's commits (across all repos, so spreading spam over repos doesn't help).
 * Returns hash → XP.
 */
export function scoreCommits(commits: ScoredCommit[]): Map<string, number> {
  const byDay = new Map<string, ScoredCommit[]>();
  for (const c of commits) {
    const day = (c.committed_at || "").slice(0, 10);
    const list = byDay.get(day) || [];
    list.push(c);
    byDay.set(day, list);
  }

  const xp = new Map<string, number>();
  for (const list of byDay.values()) {
    list.sort((a, b) => a.committed_at.localeCompare(b.committed_at));
    let nth = 0;
    for (const c of list) {
      if (!isMeaningfulCommit(c)) {
        xp.set(c.hash, 0);
        continue;
      }
      const lines = countedLines(c);
      xp.set(c.hash, (dailyMultiplier(nth) + bigCommitBonus(lines)) * commitSizeFactor(lines));
      nth++;
    }
  }
  return xp;
}

export function prXp(state: string): number {
  return state === "merged" ? XP_RULES.mergedPR : XP_RULES.openPR;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
