import { git, GitHttpError } from "./gitService.js";
import { config } from "./env.js";

export interface GitUser {
  /** Git's account number: unlike the login, it never passes to someone else */
  id?: number;
  login: string;
  username?: string;
  full_name: string;
  email: string;
}

export interface GitAdminEmail {
  email: string;
  verified: boolean;
  primary: boolean;
  user_id: number;
  username: string;
}

export interface GitRepo {
  /** Git's own number for the repo: unlike the name, it stays when the repo is renamed or moves owner */
  id?: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  empty?: boolean;
  archived?: boolean;
  updated_at?: string;
}

export interface GitCommit {
  sha: string;
  commit: { message: string; author: { name: string; email: string; date: string } };
  /** Git links a commit to an account when the commit email matches any of the user's emails */
  author?: { login: string } | null;
  stats?: { additions: number; deletions: number };
}

export interface GitPull {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at?: string;
  user?: { login: string };
  merged_by?: { login: string } | null;
}

export interface GitReview {
  id: number;
  user?: { login: string } | null;
  state: string; // APPROVED | REQUEST_CHANGES | COMMENT | PENDING | REQUEST_REVIEW
  submitted_at?: string;
  dismissed?: boolean;
}

/** All users. Admin endpoint returns real emails; falls back to public search. */
export async function fetchAllUsers(): Promise<GitUser[]> {
  try {
    return await git.getAll<GitUser>("/admin/users");
  } catch (err) {
    if (!(err instanceof GitHttpError)) throw err;
    console.warn("⚠️ /admin/users unavailable (token lacks admin:read) — using /users/search");
    return git.getAll<GitUser>("/users/search", {}, { unwrap: (j) => j.data });
  }
}

/**
 * All primary & secondary/personal registered emails across all accounts on Git.
 */
export async function fetchAllAdminEmails(): Promise<GitAdminEmail[]> {
  try {
    return await git.getAll<GitAdminEmail>("/admin/emails");
  } catch (err: any) {
    console.warn("⚠️ /admin/emails unavailable:", err.message);
    return [];
  }
}

/** All repositories in Git, sorted by most recently updated. */
export async function fetchAllRepos(): Promise<GitRepo[]> {
  const repos = await git.getAll<GitRepo>(
    "/repos/search",
    { sort: "updated", order: "desc" },
    {
      unwrap: (j) => j.data
    }
  );
  return repos.filter((r) => !r.empty && !r.archived);
}

/** All repositories a user is watching, subscribed to, or collaborating on in Git */
export async function fetchUserSubscriptions(username: string): Promise<GitRepo[]> {
  try {
    return await git.getAll<GitRepo>(`/users/${encodeURIComponent(username)}/subscriptions`);
  } catch {
    return [];
  }
}

interface GitBranch {
  name: string;
  commit: { timestamp: string };
}

/**
 * Repos whose default branch points at a branch that was never pushed (or was renamed/deleted)
 * make Git answer /commits with HTTP 500. Returns the most recently updated real branch to read
 * instead, or null when the default branch does exist (so the 500 is a genuine server error).
 */
async function fallbackBranch(repo: GitRepo): Promise<string | null> {
  const branches = await git.getAll<GitBranch>(`/repos/${repo.owner.login}/${repo.name}/branches`, {}, { maxItems: 500 });
  if (branches.length === 0 || branches.some((b) => b.name === repo.default_branch)) return null;
  branches.sort((a, b) => Date.parse(b.commit?.timestamp ?? "") - Date.parse(a.commit?.timestamp ?? ""));
  return branches[0].name;
}

export interface CommitReadOptions {
  /** Stop after reading this many commits; 0 reads them all (default `GIT_MAX_COMMITS_PER_REPO`) */
  maxItems?: number;
  /**
   * Commits the realm already holds. With it, an older commit that isn't held yet is kept too (a branch merged
   * late brings commits written long before), and reading goes on until a whole page is old and already held.
   */
  isKnown?: (sha: string) => boolean;
}

/**
 * Git lists a branch's commits in history order, not by author date: a branch merged today brings commits written
 * last week, and a rebased commit keeps its old author date. So one old commit never ends the read; it ends after a
 * whole page of commits older than `since` (and, with `isKnown`, all already held).
 */
async function getCommits(repo: GitRepo, since: Date, branch: string | undefined, opts: CommitReadOptions): Promise<GitCommit[]> {
  // An unreadable date counts as new, so the commit is kept
  const isOld = (c: GitCommit) => Date.parse(c.commit?.author?.date ?? "") < since.getTime();
  const held = (c: GitCommit) => !opts.isKnown || opts.isKnown(c.sha);
  const commits = await git.getAll<GitCommit>(
    `/repos/${repo.owner.login}/${repo.name}/commits`,
    { stat: "true", verification: "false", files: "false", ...(branch ? { sha: branch } : {}) },
    {
      maxItems: opts.maxItems ?? config.maxCommitsPerRepo,
      stopAfterPage: (page) => page.every((c) => isOld(c) && held(c))
    }
  );
  return commits.filter((c) => !isOld(c) || !held(c));
}

/**
 * Default-branch commits newer than `since`, newest first, plus (with `isKnown`) older ones the realm doesn't hold yet.
 * Falls back to the newest branch if the default is missing.
 */
export async function fetchRepoCommits(repo: GitRepo, since: Date, opts: CommitReadOptions = {}): Promise<GitCommit[]> {
  try {
    return await getCommits(repo, since, undefined, opts);
  } catch (err) {
    if (err instanceof GitHttpError && (err.status === 409 || err.status === 404)) return []; // empty repo
    if (err instanceof GitHttpError && err.status === 500) {
      const branch = await fallbackBranch(repo).catch(() => null);
      if (branch) {
        console.warn(`ℹ️ ${repo.full_name}: default branch "${repo.default_branch}" doesn't exist — reading commits from "${branch}" instead`);
        return getCommits(repo, since, branch, opts);
      }
    }
    throw err;
  }
}

export interface CommitPeek {
  missing: boolean;
  /** Newest first; only the pages that were read */
  commits: Array<{ sha: string; date: string }>;
  /** The branch's full commit count (from Git's header; the read count when Git sends none) */
  total: number;
}

/**
 * A repo's newest commits in Git, newest first (default branch, or the newest branch when the default was
 * never pushed), read `pageSize` at a time while `keepReading(page)` says so, up to `maxCommits`.
 * `missing` when the repo no longer exists in Git. Light on the Git server: no stats, no repo lookup unless the read fails.
 */
export async function peekRepoCommits(
  fullName: string,
  keepReading: (page: Array<{ sha: string; date: string }>) => boolean = () => false,
  pageSize = 10,
  maxCommits = 500
): Promise<CommitPeek> {
  const [owner, ...rest] = fullName.split("/");
  const name = rest.join("/");
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const params = { stat: "false", verification: "false", files: "false", limit: pageSize };
  let branch: string | undefined;
  const read = (page: number) => git.getPage<GitCommit>(`${base}/commits`, { ...params, page, ...(branch ? { sha: branch } : {}) });

  let first: { items: GitCommit[]; total: number | null };
  try {
    first = await read(1);
  } catch (err) {
    if (!(err instanceof GitHttpError)) throw err;
    if (err.status === 409) return { missing: false, commits: [], total: 0 }; // empty repo
    if (err.status !== 404 && err.status !== 500) throw err;
    // 404: the repo is gone, or it has no commits; 500: its default branch was never pushed
    let repo: GitRepo;
    try {
      repo = await git.get<GitRepo>(base);
    } catch (e) {
      if (e instanceof GitHttpError && e.status === 404) return { missing: true, commits: [], total: 0 };
      throw e;
    }
    if (err.status === 404 || repo.empty) return { missing: false, commits: [], total: 0 };
    const fallback = await fallbackBranch(repo).catch(() => null);
    if (!fallback) throw err;
    branch = fallback;
    first = await read(1);
  }

  const toPeek = (list: GitCommit[]) => list.map((c) => ({ sha: c.sha, date: c.commit?.author?.date ?? "" }));
  const commits = toPeek(first.items);
  let batch = commits;
  for (let page = 2; batch.length === pageSize && commits.length < maxCommits && keepReading(batch); page++) {
    batch = toPeek((await read(page)).items);
    commits.push(...batch);
  }
  return { missing: false, commits, total: first.total ?? commits.length };
}

/** Most recently updated pull requests (one page is plenty for weekly stats). */
export async function fetchRepoPulls(repo: GitRepo): Promise<GitPull[]> {
  try {
    return await git.get<GitPull[]>(`/repos/${repo.owner.login}/${repo.name}/pulls`, {
      state: "all",
      sort: "recentupdate",
      limit: 50
    });
  } catch {
    return []; // pulls disabled on repo
  }
}

/** Reviews submitted on one pull request */
export async function fetchPullReviews(repo: GitRepo, prNumber: number): Promise<GitReview[]> {
  try {
    return await git.get<GitReview[]>(`/repos/${repo.owner.login}/${repo.name}/pulls/${prNumber}/reviews`, { limit: 50 });
  } catch {
    return [];
  }
}

/** Run async work over items with bounded concurrency (be gentle with the Git server). */
export async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        await fn(item);
      } catch (err: any) {
        console.warn(`⚠️ Skipped item during sync: ${err.message}`);
      }
    }
  });
  await Promise.all(workers);
}
