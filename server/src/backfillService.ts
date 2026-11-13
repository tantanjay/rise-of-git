import { config } from "./env.js";
import {
  getUnbackfilledRepos,
  saveBackfilledRepoCommits,
  getBackfillProgress,
  resetAllRepoBackfills,
  getAllKingdomsFromDB,
  stmtGetAllUserEmails,
  loadRepoEmailRules,
  db
} from "./db.js";
import { fetchRepoCommits, GitRepo, GitCommit } from "./gitFetch.js";
import { DeveloperKingdom, ActivityEvent } from "./types.js";

/**
 * Who a commit belongs to, read fresh from SQLite. The backfill reads it again for every repo, once Git has answered,
 * so an email an administrator matches (or unassigns) while a long backfill runs is honoured from the next repo on,
 * instead of a name match handing the email back to someone else.
 */
function loadIdentity() {
  const rawUsers = db.prepare("SELECT id, username, full_name, email FROM users").all() as Array<{
    id: string;
    username: string;
    full_name?: string;
    email?: string;
  }>;

  const userByLogin = new Map<string, { id: string }>();
  const userByName = new Map<string, string>();
  const emailToUserId = new Map<string, string>();

  for (const u of rawUsers) {
    userByLogin.set(u.id.toLowerCase(), u);
    if (u.username) userByLogin.set(u.username.toLowerCase(), u);
    if (u.email) emailToUserId.set(u.email.toLowerCase(), u.id);

    if (u.full_name) {
      const fn = u.full_name.toLowerCase().trim();
      userByName.set(fn, u.id);
      if (fn.includes(",")) {
        const parts = fn.split(",").map((s) => s.trim());
        if (parts.length === 2 && parts[0] && parts[1]) {
          userByName.set(`${parts[1]} ${parts[0]}`, u.id);
        }
      } else {
        const parts = fn.split(/\s+/);
        if (parts.length === 2 && parts[0] && parts[1]) {
          userByName.set(`${parts[1]}, ${parts[0]}`, u.id);
        }
      }
    }
  }

  // Load existing secondary/discovered emails
  try {
    const existingEmails = stmtGetAllUserEmails.all() as Array<{ email: string; user_id: string }>;
    for (const ee of existingEmails) {
      emailToUserId.set(ee.email.toLowerCase(), ee.user_id.toLowerCase());
    }
  } catch {
    // ignore
  }

  // Admin per-repo matches of shared emails, checked before every other rule
  const repoEmailRules = loadRepoEmailRules();

  return { userByLogin, userByName, emailToUserId, repoEmailRules };
}

class BackfillService {
  private isRunning = false;
  private shouldStop = false;
  /** The run in progress, so a reset can wait for it to stop */
  private current: Promise<void> | null = null;

  get status() {
    const progress = getBackfillProgress();
    return {
      enabled: config.backfillEnabled,
      isRunning: this.isRunning,
      startYear: config.backfillStartYear,
      delayMs: config.backfillDelayMs,
      ...progress
    };
  }

  stop() {
    if (this.isRunning) {
      this.shouldStop = true;
    }
  }

  /**
   * Clears every checkpoint and re-indexes all repos. A run already going is stopped and waited for first, so it
   * can't mark a repo done after the reset, and the new run isn't turned away as a duplicate.
   */
  async restart(
    kingdomsRef: DeveloperKingdom[],
    logCallback: (text: string, type: ActivityEvent["type"]) => void,
    onRealmProgress?: () => void
  ) {
    this.stop();
    await this.current;
    resetAllRepoBackfills();
    console.log(`[Backfill] 🔄 Reset all repository backfill checkpoints. Re-processing.`);
    await this.start(kingdomsRef, logCallback, onRealmProgress);
  }

  start(
    kingdomsRef: DeveloperKingdom[],
    logCallback: (text: string, type: ActivityEvent["type"]) => void,
    onRealmProgress?: () => void
  ): Promise<void> {
    if (this.current) return this.current;
    this.current = this.run(kingdomsRef, logCallback, onRealmProgress).finally(() => {
      this.current = null;
    });
    return this.current;
  }

  private async run(
    kingdomsRef: DeveloperKingdom[],
    logCallback: (text: string, type: ActivityEvent["type"]) => void,
    onRealmProgress?: () => void
  ) {
    if (!config.backfillEnabled) {
      console.log("[Backfill] ⏸️ Historical backfill is disabled in .env (BACKFILL_ENABLED=false)");
      return;
    }

    if (config.backfillForceReset) {
      console.log(`[Backfill] 🔄 BACKFILL_FORCE_RESET is enabled — clearing checkpoints to re-index all repos...`);
      resetAllRepoBackfills();
    }

    this.isRunning = true;
    this.shouldStop = false;

    try {
      const unbackfilled = getUnbackfilledRepos();
      const initialProgress = getBackfillProgress();

      if (unbackfilled.length === 0) {
        console.log(`[Backfill] ✅ All ${initialProgress.total} repositories are already backfilled down to ${config.backfillStartYear}.`);
        return;
      }

      console.log(`[Backfill] ⏳ Resuming historical backfill: ${unbackfilled.length} repos remaining out of ${initialProgress.total} (target start year: ${config.backfillStartYear})...`);

      const sinceDate = new Date(Date.UTC(config.backfillStartYear, 0, 1, 0, 0, 0));
      let lastProgressAt = Date.now();
      /** Repos Git couldn't be read for: left unmarked, so the next run (the next Git sync) tries them again */
      let failed = 0;

      for (const repo of unbackfilled) {
        if (this.shouldStop) {
          console.log("[Backfill] 🛑 Shutdown requested. Backfill worker paused cleanly. Progress preserved in SQLite.");
          break;
        }

        const gitRepo: GitRepo = {
          name: repo.name,
          full_name: repo.full_name,
          owner: { login: repo.owner_login },
          default_branch: repo.default_branch || "main"
        };

        let commits: GitCommit[];
        try {
          // The whole history back to the start year, however long
          commits = await fetchRepoCommits(gitRepo, sinceDate, { maxItems: 0 });
        } catch (err: any) {
          failed++;
          console.warn(`[Backfill] ⚠️ Could not fetch commits for ${repo.full_name}: ${err.message} (will retry next run)`);
          if (config.backfillDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, config.backfillDelayMs));
          continue;
        }

        // Read after Git answered: the links as they stand now, not when the run started
        const { userByLogin, userByName, emailToUserId, repoEmailRules } = loadIdentity();

        const dbCommits: Array<{
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

        const newEmails: Array<{ email: string; userId: string }> = [];

        for (const c of commits) {
          const email = (c.commit.author.email || "").toLowerCase();
          const authorLogin = c.author?.login ? c.author.login.toLowerCase() : null;
          const authorName = (c.commit.author.name || "").toLowerCase().trim();

          let matchedUserId = email ? repoEmailRules.rule(email, repo.id) : null;
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

          if (resolvedLogin && email && !emailToUserId.has(email) && !repoEmailRules.shared(email)) {
            emailToUserId.set(email, resolvedLogin);
            newEmails.push({ email, userId: resolvedLogin });
          }

          dbCommits.push({
            hash: c.sha,
            repoId: repo.id,
            authorLogin: resolvedLogin,
            authorName: c.commit.author.name || "Developer",
            authorEmail: email,
            message: c.commit.message || "",
            linesAdded: c.stats?.additions || 0,
            linesDeleted: c.stats?.deletions || 0,
            committedAt: c.commit.author.date || new Date().toISOString()
          });
        }

        // Save batch and mark repo as backfilled in SQLite immediately
        saveBackfilledRepoCommits(repo.id, dbCommits, newEmails);

        const progress = getBackfillProgress();
        console.log(
          `[Backfill] 📦 [${progress.backfilled}/${progress.total}] ${repo.full_name}: +${commits.length} commits saved (Total in DB: ${progress.totalCommits.toLocaleString()})`
        );

        // Refresh in-memory kingdoms & notify UI every ~3s when new commits are added
        if (commits.length > 0 && Date.now() - lastProgressAt >= 3000) {
          lastProgressAt = Date.now();
          onRealmProgress?.();
        }

        // Gentle pause to keep Git server and local CPU load minimal
        if (config.backfillDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, config.backfillDelayMs));
        }
      }

      if (!this.shouldStop && failed > 0) {
        console.warn(`[Backfill] ⚠️ ${failed} repositor${failed === 1 ? "y" : "ies"} could not be read from Git; retrying at the next sync.`);
        onRealmProgress?.();
      } else if (!this.shouldStop) {
        const finalProgress = getBackfillProgress();
        console.log(
          `[Backfill] 🎉 Historical backfill complete! All ${finalProgress.total} repos indexed down to ${config.backfillStartYear}.`
        );
        logCallback(
          `🎉 Historical backfill complete! All ${finalProgress.total} repos indexed down to ${config.backfillStartYear}.`,
          "sync"
        );

        // Update in-memory kingdoms so building heights and stats reflect backfilled history
        if (onRealmProgress) {
          onRealmProgress();
        } else {
          const fresh = getAllKingdomsFromDB();
          kingdomsRef.splice(0, kingdomsRef.length, ...fresh);
        }
      }
    } catch (err: any) {
      console.error("[Backfill] ❌ Error during historical backfill:", err);
    } finally {
      this.isRunning = false;
    }
  }
}

export const backfillService = new BackfillService();
