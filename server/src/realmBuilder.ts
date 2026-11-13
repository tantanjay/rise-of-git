import { DeveloperKingdom, CivilizationType } from "./types.js";
import { config } from "./env.js";
import {
  fetchAllUsers, fetchAllAdminEmails, fetchAllRepos, fetchRepoCommits, fetchRepoPulls, fetchPullReviews, fetchUserSubscriptions, mapPool
} from "./gitFetch.js";
import { NORMAL_CIVILIZATIONS, kingdomTitleFor } from "./kingdomUtils.js";
import {
  db,
  saveLiveRepoSync,
  saveUserSubscriptionsBatch,
  registerReposAndUsers,
  stmtGetAllUserEmails,
  loadRepoEmailRules,
  getCommitsToAnalyse,
  setMeaningfulLines,
  getIgnoredRepoIds,
  pinGitAccounts,
  isCommitStored,
  isRepoBackfilled,
  getSyncedRepoVersions
} from "./db.js";
import { git } from "./gitService.js";
import { meaningfulLines } from "./diffQuality.js";
import { isMergeCommit } from "./scoring.js";
import { rebuildRealmWithTitles } from "./titles.js";

const DAY_MS = 86_400_000;

/**
 * Builds the realm from Git:
 *   1. Fetches all users, emails, and repositories and registers them in SQLite immediately (< 1s).
 *   2. Notifies the UI right away so all kingdoms and cities appear immediately without waiting for commits.
 *   3. Streams each active repository's commits/PRs directly into SQLite as soon as that repo finishes.
 *   4. Returns all kingdoms loaded directly from SQLite.
 */
export async function buildRealmFromGit(
  _previous: DeveloperKingdom[],
  onRealmProgress?: () => void
) {
  const now = Date.now();
  const since = new Date(now - config.lookbackDays * DAY_MS);

  // 1. Fetch all users, admin registered emails, and repositories concurrently
  const [rawUsers, rawAdminEmails, allFetchedRepos] = await Promise.all([
    fetchAllUsers(),
    fetchAllAdminEmails(),
    fetchAllRepos()
  ]);

  const ignoredRepoIds = getIgnoredRepoIds();
  // Repos an admin deleted stay out of every sync (DB ids are `repo-${full_name}`)
  const rawRepos = allFetchedRepos.filter((r) => {
    const fn = (r.full_name || "").toLowerCase();
    return !ignoredRepoIds.has(fn) && !ignoredRepoIds.has(`repo-${fn}`);
  });

  const activeUsers = rawUsers.filter((u) => u.login && !u.login.startsWith("ghost"));
  pinGitAccounts(activeUsers.flatMap((u) => (typeof u.id === "number" ? [{ login: u.login.toLowerCase(), gitId: u.id }] : [])));

  // Civilization assignment: special users are permanently locked to Nethergarde Voidrift ('arcane');
  // existing users preserve their civilization; brand new developers are assigned to mortal civilizations
  // that have open places (lowest occupancy) to maintain balance. Nethergarde is never randomly assigned.
  const specialSet = new Set(config.specialUsers.map((s) => s.toLowerCase()));

  // Pre-fetch all existing users from SQLite to preserve assignments and tally current mortal headcount
  const existingDbUsers = db.prepare(`SELECT LOWER(id) AS id, civilization FROM users`).all() as Array<{ id: string; civilization: CivilizationType }>;
  const existingCivMap = new Map<string, CivilizationType>(existingDbUsers.map((u) => [u.id, u.civilization]));

  const mortalCounts: Record<CivilizationType, number> = {
    human: 0,
    elf: 0,
    dwarf: 0,
    orc: 0,
    arcane: 0
  };

  for (const [id, civ] of existingCivMap) {
    if (!specialSet.has(id) && NORMAL_CIVILIZATIONS.includes(civ)) {
      mortalCounts[civ] = (mortalCounts[civ] || 0) + 1;
    }
  }

  function assignMortalCivilization(): CivilizationType {
    let minCount = Infinity;
    for (const civ of NORMAL_CIVILIZATIONS) {
      const count = mortalCounts[civ] || 0;
      if (count < minCount) minCount = count;
    }
    const candidates = NORMAL_CIVILIZATIONS.filter((civ) => (mortalCounts[civ] || 0) === minCount);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    mortalCounts[chosen] = (mortalCounts[chosen] || 0) + 1;
    return chosen;
  }

  const dbUsers = activeUsers.map((u) => {
    const login = u.login.toLowerCase();
    const isSpecial = specialSet.has(login) || specialSet.has((u.login || "").toLowerCase());
    let civilization: CivilizationType;
    if (isSpecial) {
      civilization = "arcane";
    } else {
      const existingCiv = existingCivMap.get(login);
      if (existingCiv) {
        civilization = existingCiv;
      } else {
        civilization = assignMortalCivilization();
      }
    }
    const fullName = u.full_name?.trim() || u.login;
    const kingdomTitle = kingdomTitleFor(civilization, fullName);
    return {
      id: login,
      username: u.login,
      fullName,
      email: (u.email || "").toLowerCase(),
      civilization,
      kingdomTitle,
      cityHallLevel: 1,
      streakDays: 1
    };
  });

  const userByLogin = new Map(dbUsers.map((u) => [u.id, u]));

  // Comprehensive multi-email mapping: every developer can have multiple personal and corporate emails
  const userEmails: Array<{ email: string; userId: string }> = [];
  const emailToUserId = new Map<string, string>();

  // 1. Primary user emails
  for (const u of dbUsers) {
    if (u.email) {
      userEmails.push({ email: u.email, userId: u.id });
      emailToUserId.set(u.email, u.id);
    }
  }

  // 2. Every verified email registered in Git. An unverified one could be anybody's address (a colleague's commit
  // email, a laptop default), so it never claims commits: an administrator matches those (Developer Emails)
  for (const ae of rawAdminEmails) {
    if (ae.email && ae.username && ae.verified === true) {
      const email = ae.email.toLowerCase();
      const userId = ae.username.toLowerCase();
      userEmails.push({ email, userId });
      emailToUserId.set(email, userId);
    }
  }

  // What Git itself says (primary and verified emails): each repo below lays the stored links over a copy of it
  const gitEmailOwners = new Map(emailToUserId);

  // 3. Existing discovered emails from SQLite
  try {
    const existingEmails = stmtGetAllUserEmails.all() as Array<{ email: string; user_id: string }>;
    for (const ee of existingEmails) {
      const email = ee.email.toLowerCase();
      const userId = ee.user_id.toLowerCase();
      userEmails.push({ email, userId });
      emailToUserId.set(email, userId);
    }
  } catch {
    // ignore
  }


  // Lookup map for fallback matching by author name (supports "First Last" and "Last, First")
  const userByName = new Map<string, string>();
  for (const u of dbUsers) {
    userByName.set(u.id, u.id);
    if (u.username) userByName.set(u.username.toLowerCase(), u.id);
    if (u.fullName) {
      const fn = u.fullName.toLowerCase().trim();
      userByName.set(fn, u.id);
      if (fn.includes(",")) {
        const parts = fn.split(",").map((s) => s.trim());
        if (parts.length === 2 && parts[0] && parts[1]) {
          userByName.set(`${parts[1]} ${parts[0]}`, u.id); // e.g. "Jane Doe" from "Doe, Jane"
        }
      } else {
        const parts = fn.split(/\s+/);
        if (parts.length === 2 && parts[0] && parts[1]) {
          userByName.set(`${parts[1]}, ${parts[0]}`, u.id); // e.g. "Doe, Jane" from "Jane Doe"
        }
      }
    }
  }

  // 2. Immediately register all users and repositories into SQLite so tables and UI are populated right away
  const initialDbRepos = rawRepos.map((r) => ({
    id: `repo-${r.full_name}`,
    name: r.name,
    fullName: r.full_name,
    ownerLogin: r.owner?.login?.toLowerCase() || "unknown",
    defaultBranch: r.default_branch || "main",
    linesCount: 0,
    filesCount: 0,
    commitsCount: 0,
    updatedAt: r.updated_at || new Date().toISOString(),
    gitId: typeof r.id === "number" ? r.id : null
  }));

  const { newUsers, newRepos } = registerReposAndUsers(dbUsers, userEmails, initialDbRepos);
  console.log(`[Live Sync] 📦 Registered ${dbUsers.length} users (+${newUsers} new) and ${rawRepos.length} repositories (+${newRepos} new) in SQLite.`);

  // Only push initial kingdoms to in-memory state if the realm was empty or new users/repos were added
  if (_previous.length === 0 || newUsers > 0 || newRepos > 0) {
    onRealmProgress?.();
  }

  let lastProgressAt = Date.now();
  const maybeNotifyProgress = () => {
    const t = Date.now();
    if (t - lastProgressAt >= 2500) {
      lastProgressAt = t;
      onRealmProgress?.();
    }
  };

  let commitsScanned = 0;
  let newCommitsSaved = 0;
  let newPullsSaved = 0;
  let unmatchedCommits = 0;

  // Reviews are only fetched for recently active PRs to keep the Git load small
  const reviewSince = Date.now() - 7 * 86_400_000;

  // Only query commits & PRs for repos updated in Git within the live lookback window (e.g. last 3 days)
  // Repos updated in Git within the lookback window, and any repo Git has updated since a live sync last read it,
  // however long ago: after downtime longer than the window, a repo pushed while the server was off is still read
  const syncedVersions = getSyncedRepoVersions();
  const activeRepos = rawRepos.filter((r) => {
    if (!r.updated_at) return true;
    const updated = Date.parse(r.updated_at);
    return Number.isNaN(updated) || updated >= since.getTime() || syncedVersions.get(`repo-${r.full_name}`) !== r.updated_at;
  });

  let liveDoneCount = 0;

  await mapPool(activeRepos, 6, async (repo) => {
    // Once the backfill has read a repo, older commits that only now reach its default branch (a branch merged late,
    // a rebase) are picked up here; before that the backfill brings them
    const backfilled = isRepoBackfilled(`repo-${repo.full_name}`);
    const [commits, pulls] = await Promise.all([
      fetchRepoCommits(repo, since, backfilled ? { isKnown: isCommitStored } : {}),
      fetchRepoPulls(repo)
    ]);

    commitsScanned += commits.length;
    let repoLines = 0;

    // The links as they stand once Git has answered, not when the sync started: an email an administrator matched,
    // moved or unassigned meanwhile is honoured here (a sync takes minutes). Admin per-repo matches come first.
    const emailToUserId = new Map(gitEmailOwners);
    for (const ee of stmtGetAllUserEmails.all() as Array<{ email: string; user_id: string }>) {
      emailToUserId.set(ee.email.toLowerCase(), ee.user_id.toLowerCase());
    }
    const repoEmailRules = loadRepoEmailRules();

    const repoCommits: Array<{
      hash: string;
      repoId: string;
      authorLogin: string | null;
      authorName: string;
      authorEmail: string;
      message: string;
      linesAdded: number;
      linesDeleted: number;
      committedAt: string;
    }> = [];

    const repoPulls: Array<{
      id: number;
      repoId: string;
      authorLogin: string | null;
      title: string;
      state: string;
      mergedAt: string | null;
      createdAt: string;
    }> = [];

    const repoReviews: Array<{
      id: number;
      repoId: string;
      prId: number;
      reviewerLogin: string;
      state: string;
      submittedAt: string;
    }> = [];

    const repoEmails: Array<{ email: string; userId: string }> = [];

    for (const c of commits) {
      const email = (c.commit.author.email || "").toLowerCase();
      const authorLogin = c.author?.login ? c.author.login.toLowerCase() : null;
      const authorName = (c.commit.author.name || "").toLowerCase().trim();

      // Multi-layer email and author resolution: an admin's per-repo match first
      let matchedUserId = email ? repoEmailRules.rule(email, `repo-${repo.full_name}`) : null;

      if (!matchedUserId && authorLogin) {
        matchedUserId = userByLogin.get(authorLogin)?.id || null;
      }

      if (!matchedUserId && email) {
        matchedUserId = emailToUserId.get(email) || null;
      }

      if (!matchedUserId && authorName) {
        matchedUserId = userByName.get(authorName) || null;
      }

      const resolvedLogin = matchedUserId || authorLogin || null;
      if (!resolvedLogin) {
        unmatchedCommits++;
      }

      // If this commit had a resolved login and an email, bind that email to the developer
      // (never a shared email the admin matches per repo)
      if (resolvedLogin && email && !emailToUserId.has(email) && !repoEmailRules.shared(email)) {
        emailToUserId.set(email, resolvedLogin);
        repoEmails.push({ email, userId: resolvedLogin });
      }

      const added = c.stats?.additions || 0;
      const deleted = c.stats?.deletions || 0;
      repoLines += (added + deleted);

      repoCommits.push({
        hash: c.sha,
        repoId: `repo-${repo.full_name}`,
        authorLogin: resolvedLogin,
        authorName: c.commit.author.name || "Developer",
        authorEmail: email,
        message: c.commit.message || "",
        linesAdded: added,
        linesDeleted: deleted,
        committedAt: c.commit.author.date || new Date().toISOString()
      });
    }

    for (const pr of pulls) {
      const updated = Date.parse(pr.updated_at || pr.merged_at || pr.created_at || "");
      if (Number.isFinite(updated) && updated >= reviewSince) {
        const reviews = await fetchPullReviews(repo, pr.number);
        const author = pr.user?.login?.toLowerCase();
        for (const r of reviews) {
          const reviewer = r.user?.login?.toLowerCase();
          if (!reviewer || reviewer === author || r.dismissed) continue;
          if (r.state !== "APPROVED" && r.state !== "REQUEST_CHANGES" && r.state !== "COMMENT") continue;
          repoReviews.push({
            id: r.id,
            repoId: `repo-${repo.full_name}`,
            prId: pr.id,
            reviewerLogin: reviewer,
            state: r.state,
            submittedAt: r.submitted_at || pr.updated_at || new Date().toISOString()
          });
        }
      }

      repoPulls.push({
        id: pr.id,
        repoId: `repo-${repo.full_name}`,
        authorLogin: pr.user?.login ? pr.user.login.toLowerCase() : null,
        title: pr.title || "",
        state: pr.merged ? "merged" : (pr.state || "open"),
        mergedAt: pr.merged_at || null,
        createdAt: pr.created_at || new Date().toISOString()
      });
    }

    // Immediately save this single repository's commits, PRs, and reviews into SQLite
    const { newCommits, newPulls } = saveLiveRepoSync(
      {
        id: `repo-${repo.full_name}`,
        name: repo.name,
        fullName: repo.full_name,
        ownerLogin: repo.owner?.login?.toLowerCase() || "unknown",
        defaultBranch: repo.default_branch || "main",
        linesCount: repoLines,
        filesCount: 0,
        commitsCount: repoCommits.length,
        updatedAt: repo.updated_at || new Date().toISOString(),
        gitId: typeof repo.id === "number" ? repo.id : null
      },
      repoCommits,
      repoPulls,
      repoReviews,
      repoEmails
    );

    newCommitsSaved += newCommits;
    newPullsSaved += newPulls;

    const idx = ++liveDoneCount;
    console.log(
      `[Live Sync] ⚡ [${idx}/${activeRepos.length}] ${repo.full_name}: +${newCommits} new commits (${repoCommits.length} scanned), +${newPulls} new PRs`
    );

    // Only notify UI when NEW commits or PRs were actually inserted into SQLite
    if (newCommits > 0 || newPulls > 0) {
      maybeNotifyProgress();
    }
  });

  // 3. Concurrently fetch all user repository subscriptions (watching & assigned repositories)
  const userSubscriptions: Array<{ userId: string; repoId: string }> = [];
  await mapPool(activeUsers, 8, async (u) => {
    const subs = await fetchUserSubscriptions(u.login);
    for (const s of subs) {
      userSubscriptions.push({
        userId: u.login.toLowerCase(),
        repoId: `repo-${s.full_name}`
      });
    }
  });
  saveUserSubscriptionsBatch(userSubscriptions);

  // 4. Analyse new commits' diffs once (meaningful lines for XP and streaks)
  const analysed = await analyseCommitQuality();

  // 5–6. Re-evaluate milestone titles from the fresh commit history (cached in user_earned_titles) and load the kingdoms
  const titleStarted = Date.now();
  const { kingdoms, promotions: titlePromotions } = rebuildRealmWithTitles();
  console.log(`[Titles] Re-evaluated milestone titles and rebuilt the realm in ${Date.now() - titleStarted}ms (${titlePromotions.length} new)`);

  return {
    kingdoms,
    stats: {
      users: activeUsers.length,
      repos: rawRepos.length,
      commitsScanned,
      newCommitsSaved,
      newPullsSaved,
      unmatchedCommits,
      analysed
    },
    titlePromotions
  };
}

/** Only recent commits are analysed; older ones keep scoring by their raw line count */
const ANALYSE_DAYS = 30;
/** Per sync, so the first backfill is spread over a few syncs instead of hammering Git */
const ANALYSE_PER_SYNC = 600;

/**
 * Fetches each not-yet-analysed recent commit's diff once and stores its meaningful line count.
 * Merges and empty commits are settled without a request; on any fetch error the raw count is kept.
 */
async function analyseCommitQuality(): Promise<number> {
  const since = new Date(Date.now() - ANALYSE_DAYS * DAY_MS).toISOString();
  const pending = getCommitsToAnalyse(since, ANALYSE_PER_SYNC);
  await mapPool(pending, 6, async (c) => {
    if (isMergeCommit(c.message) || c.lines === 0) {
      setMeaningfulLines(c.hash, 0);
      return;
    }
    try {
      const diff = await git.getText(`/repos/${c.full_name}/git/commits/${c.hash}.diff`);
      setMeaningfulLines(c.hash, meaningfulLines(diff));
    } catch {
      setMeaningfulLines(c.hash, c.lines); // too big or unavailable: keep the raw count
    }
  });
  return pending.length;
}
