/**
 * npm run backfill:leaderboard
 *
 * Replays every developer's stored commits, PRs and reviews into `dev_daily_stats` (the Hall of Renown's daily XP).
 * The server also does this on start, once a day and after new history is stored, so it is never needed on a new
 * database; run it by hand only to rebuild while the server is stopped.
 */
import "../server/src/env";
import { rebuildDevDailyStats } from "../server/src/leaderboard";

const t0 = Date.now();
const { users, rows } = rebuildDevDailyStats();
console.log(`🏆 dev_daily_stats rebuilt: ${rows.toLocaleString()} developer-days for ${users} developers in ${Date.now() - t0} ms`);
