/**
 * npm run check:db                         checks server/data/realm.db
 * npm run check:db -- D:/data/realm.db     checks another database file
 * npm run check:db -- <file> --write       also times one harvest's ledger writes (rolled back, nothing is kept)
 *
 * Database health check: how big the realm database is, how fast its history grows (with a projection to one and
 * three years), whether every index the server relies on is there, and how long the game's hot queries take on
 * this data. Each query is rated against a budget for how often it runs. Exits 1 when a query is Slow or an index
 * is missing, so it can run from a scheduled task.
 *
 * The database is opened read-only (safe while the server runs); `--write` opens it for writing inside a
 * transaction that is rolled back. The queries are copies of the server's own SQL (the function each one comes
 * from is named beside it): when one of those changes, change it here too. A new query on a growing table belongs
 * here as well. See "History is kept; reads stay off it" in ARCHITECTURE.md.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const file = path.resolve(args.find((a) => !a.startsWith("--")) ?? "server/data/realm.db");
if (!fs.existsSync(file)) {
  console.error(`No database at ${file}`);
  process.exit(1);
}

const db = new Database(file, { readonly: true, fileMustExist: true });
db.pragma("cache_size = -64000");
db.pragma("temp_store = MEMORY");

const DAY = 86_400_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);
const hasTable = (name: string) => Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;

let problems = 0;

/* ------------------------------------------------------------------------- */
/* Size                                                                      */
/* ------------------------------------------------------------------------- */

const fileBytes = fs.statSync(file).size;
const walBytes = fs.existsSync(`${file}-wal`) ? fs.statSync(`${file}-wal`).size : 0;
console.log(`\nRealm database: ${file}`);
console.log(`File ${mb(fileBytes)}${walBytes ? ` (+ ${mb(walBytes)} write-ahead log)` : ""}\n`);

// Bytes per table, its indexes included (dbstat is compiled into better-sqlite3)
const bytesByTable = new Map<string, number>();
let indexBytes = 0;
try {
  const owner = new Map((db.prepare(`SELECT name, tbl_name FROM sqlite_master WHERE type IN ('table', 'index')`).all() as Array<{ name: string; tbl_name: string }>).map((r) => [r.name, r.tbl_name]));
  const tableNames = new Set((db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map((r) => r.name));
  for (const r of db.prepare(`SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name`).all() as Array<{ name: string; bytes: number }>) {
    const table = owner.get(r.name) ?? r.name;
    bytesByTable.set(table, (bytesByTable.get(table) ?? 0) + r.bytes);
    if (!tableNames.has(r.name)) indexBytes += r.bytes;
  }
} catch {
  console.log("(table sizes unavailable: this SQLite build has no dbstat)\n");
}

/* ------------------------------------------------------------------------- */
/* Growth                                                                    */
/* ------------------------------------------------------------------------- */

// History tables and the column that dates each row; `ms` columns hold epoch milliseconds, the rest ISO text
const HISTORY: Array<{ table: string; at: string; ms?: boolean }> = [
  { table: "resource_ledger", at: "timestamp" },
  { table: "population_ledger", at: "timestamp" },
  { table: "allocation_logs", at: "cycle_timestamp" },
  { table: "active_marches", at: "depart_time", ms: true },
  { table: "battles", at: "started_at", ms: true },
  { table: "battle_reports", at: "timestamp" },
  { table: "commits", at: "committed_at" },
  { table: "realm_events", at: "at" },
  { table: "broadcasts", at: "created_at" },
  { table: "champion_xp_ledger", at: "created_at", ms: true },
  { table: "dev_daily_stats", at: "day" }
];

console.log("History tables (growth from the last 7 days)");
console.log(`${pad("Table", 20)}${lpad("Rows", 11)}${lpad("Size", 10)}${lpad("Rows/day", 10)}${lpad("1 year", 10)}${lpad("3 years", 10)}`);
let perDayBytes = 0;
for (const h of HISTORY) {
  if (!hasTable(h.table)) continue;
  const rows = count(h.table);
  const bytes = bytesByTable.get(h.table) ?? 0;
  const since = h.ms ? now - 7 * DAY : h.table === "dev_daily_stats" ? iso(now - 7 * DAY).slice(0, 10) : iso(now - 7 * DAY);
  const recent = (db.prepare(`SELECT COUNT(*) AS n FROM "${h.table}" WHERE "${h.at}" >= ?`).get(since) as { n: number }).n;
  const perDay = recent / 7;
  const perRow = rows ? bytes / rows : 0;
  perDayBytes += perDay * perRow;
  const later = (days: number) => (bytes ? mb(bytes + perDay * perRow * days) : "-");
  console.log(`${pad(h.table, 20)}${lpad(rows.toLocaleString("en-US"), 11)}${lpad(bytes ? mb(bytes) : "-", 10)}${lpad(Math.round(perDay).toLocaleString("en-US"), 10)}${lpad(later(365), 10)}${lpad(later(3 * 365), 10)}`);
}
if (indexBytes) console.log(`All indexes: ${mb(indexBytes)}`);
console.log(`Whole file at this pace: about ${mb(fileBytes + perDayBytes * 365)} in a year, ${mb(fileBytes + perDayBytes * 3 * 365)} in three\n`);

/* ------------------------------------------------------------------------- */
/* Indexes                                                                   */
/* ------------------------------------------------------------------------- */

// Indexes that keep the hot reads off the history (created by db.ts / warEngine.ts when the server starts)
const EXPECTED_INDEXES = [
  "idx_ledger_user",
  "idx_ledger_user_type",
  "idx_ledger_time",
  "idx_pop_ledger_user",
  "idx_alloc_time",
  "idx_marches_status",
  "idx_marches_shown",
  "idx_battles_status",
  "idx_battles_target",
  "idx_reports_time",
  "idx_reports_defender",
  "idx_reports_attacker",
  "idx_commits_author_login",
  "idx_commits_author_email",
  "idx_user_emails_user"
];
const present = new Set((db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as Array<{ name: string }>).map((r) => r.name));
const missing = EXPECTED_INDEXES.filter((n) => !present.has(n));
// An index whose columns changed keeps its old shape until it is dropped (CREATE INDEX IF NOT EXISTS skips it)
const SHAPES: Record<string, string> = { idx_ledger_user_type: "food_delta", idx_marches_shown: "COALESCE" };
const stale = Object.entries(SHAPES).filter(([name, part]) => {
  const sql = (db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(name) as { sql?: string } | undefined)?.sql;
  return sql && !sql.includes(part);
});
if (stale.length) {
  problems++;
  console.log(`OUTDATED INDEXES: ${stale.map(([n]) => n).join(", ")}`);
  console.log("  With the server stopped, DROP INDEX each one; the server rebuilds it in its current shape on start.\n");
}
if (missing.length) {
  problems++;
  console.log(`MISSING INDEXES: ${missing.join(", ")}`);
  console.log("  The server creates them on start: restart it with the current code, then check again.\n");
} else {
  console.log(`Indexes: all ${EXPECTED_INDEXES.length} present\n`);
}

/* ------------------------------------------------------------------------- */
/* Queries                                                                   */
/* ------------------------------------------------------------------------- */

// Worst case: the ruler with the most history
const ruler =
  (db.prepare(`SELECT user_id AS id FROM resource_ledger GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1`).get() as { id: string } | undefined)?.id ??
  (db.prepare(`SELECT id FROM users LIMIT 1`).get() as { id: string } | undefined)?.id ??
  "";
const rulerEmail = (db.prepare(`SELECT email FROM users WHERE id = ?`).get(ruler) as { email?: string } | undefined)?.email ?? "";
const rulers = db.prepare(`SELECT id, email FROM users`).all() as Array<{ id: string; email: string | null }>;
const civ = (db.prepare(`SELECT civilization FROM users WHERE id = ?`).get(ruler) as { civilization?: string } | undefined)?.civilization ?? "";
const like = `%,${ruler},%`;

/** How often a query runs sets its budget (ms): OK under the first number, Watch under the second, Slow above */
const BUDGET = {
  tick: [5, 20], // every few seconds, per player or for the whole realm
  action: [20, 100], // when a player opens a panel or acts
  rebuild: [250, 1000], // realm rebuilds, harvests, weekly jobs
} as const;
type Cadence = keyof typeof BUDGET;

interface Check {
  name: string;
  often: string;
  cadence: Cadence;
  /** One run of everything the row covers */
  run: () => void;
  /** Statements whose plan is shown when the row isn't OK */
  sql?: Array<[string, unknown]>;
}

const q = (sql: string) => db.prepare(sql);
const all = (sql: string, params: unknown = []) => {
  const stmt = q(sql);
  return () => void (Array.isArray(params) ? stmt.all(...params) : stmt.all(params));
};

// --- SQL copied from the server (function names beside each) ---------------------------------------------------

// titles.ts stmtCommitStats
const COMMIT_STATS = `
  SELECT COUNT(*) AS commits,
         COALESCE(SUM(COALESCE(c.lines_added, 0) + COALESCE(c.lines_deleted, 0)), 0) AS loc,
         COUNT(DISTINCT substr(c.committed_at, 1, 10)) AS active_days
  FROM commits c
  JOIN repositories r ON c.repo_id = r.id
  WHERE c.author_login = @id
     OR c.author_email = @email
     OR c.author_email IN (SELECT email FROM user_emails WHERE user_id = @id)`;
// db.ts getAllKingdomsFromDB stmtUserCommits
const USER_COMMITS = `
  SELECT c.*, r.name as repo_name, r.full_name as repo_full_name, r.default_branch, r.owner_login, r.updated_at as repo_updated_at
  FROM commits c
  JOIN repositories r ON c.repo_id = r.id
  WHERE c.author_login = ?
     OR ((c.author_email = ? OR c.author_email IN (SELECT email FROM user_emails WHERE user_id = ?))
         AND NOT EXISTS (SELECT 1 FROM repo_emails re WHERE re.email = lower(c.author_email) AND re.repo_id = c.repo_id))
  ORDER BY julianday(c.committed_at) DESC`;
// titles.ts stmtGathered
const GATHERED = `
  SELECT COALESCE(SUM(
    MAX(COALESCE(gold_delta, 0), 0) + MAX(COALESCE(iron_delta, 0), 0) + MAX(COALESCE(stone_delta, 0), 0) +
    MAX(COALESCE(lumber_delta, 0), 0) + MAX(COALESCE(food_delta, 0), 0)
  ), 0) AS gathered
  FROM resource_ledger
  WHERE user_id = ? AND type = 'gathering_haul'`;
// titles.ts REPORT_COLUMNS (warStatsFor)
const REPORT_COLUMNS = `
  target_type,
  json_extract(details_json, '$.defenderNpc.category') AS category,
  attacker_id, defender_id, attacker_casualties, defender_casualties,
  defender_initial_soldiers AS defender_initial,
  json_extract(details_json, '$.armies') AS armies,
  json_extract(details_json, '$.bossBounty') AS bounty`;
// broadcasts.ts visibleBroadcasts
const NOTICES = `
  SELECT b.*, (rd.broadcast_id IS NOT NULL) AS read
  FROM broadcasts b
  LEFT JOIN broadcast_reads rd ON rd.broadcast_id = b.id AND rd.user_id = @viewer
  WHERE (b.created_at >= @since OR (b.pinned_until IS NOT NULL AND b.pinned_until > @now)) AND b.expires_at > @now
    AND (b.audience = 'all' OR b.audience = @civAudience
      OR (b.audience = 'users' AND EXISTS (SELECT 1 FROM broadcast_recipients br WHERE br.broadcast_id = b.id AND br.user_id = @viewer)))
  ORDER BY b.id DESC
  LIMIT 100`;
// warEngine.ts getActiveMarches
const MAP_MARCHES = `
  SELECT * FROM active_marches
  WHERE status = 'marching'
     OR (status = 'resolved' AND COALESCE(return_time, arrival_time) > ?)
  ORDER BY arrival_time ASC`;

const noticeParams = { viewer: ruler, since: iso(now - 30 * DAY), now: iso(now), civAudience: `civ:${civ}` };
const inDay: [string, string] = [iso(now - DAY), iso(now)];
const inWeek: [string, string] = [iso(now - 7 * DAY), iso(now)];

const CHECKS: Check[] = [
  // Every few seconds
  { name: "Status poll (harvest count)", often: "every 3 s per player", cadence: "tick", run: all(`SELECT COUNT(*) AS n FROM allocation_logs`), sql: [[`SELECT COUNT(*) FROM allocation_logs`, []]] },
  {
    name: "War tick: live battles / battles due",
    often: "every 2 s",
    cadence: "tick",
    run: (() => {
      const a = all(`SELECT id, round, next_round_at, rounds_json, stacks_json FROM battles WHERE status = 'fighting'`);
      const b = all(`SELECT * FROM battles WHERE status = 'fighting' AND next_round_at <= ? ORDER BY started_at ASC`, [now]);
      return () => (a(), b());
    })(),
    sql: [[`SELECT * FROM battles WHERE status = 'fighting' AND next_round_at <= ? ORDER BY started_at ASC`, [now]]]
  },
  { name: "Map marches", often: "each marches refresh", cadence: "tick", run: all(MAP_MARCHES, [now - 14_000]), sql: [[MAP_MARCHES, [now - 14_000]]] },
  {
    name: "Arriving and returning marches",
    often: "every 2 s",
    cadence: "tick",
    run: (() => {
      const a = all(`SELECT * FROM active_marches WHERE status = 'marching' AND COALESCE(phase, 'outbound') = 'outbound' AND arrival_time <= ? ORDER BY arrival_time ASC, COALESCE(muster_rank, 1000) ASC`, [now]);
      const b = all(`SELECT * FROM active_marches WHERE status = 'marching' AND phase = 'returning' AND return_time IS NOT NULL AND return_time <= ?`, [now]);
      return () => (a(), b());
    })()
  },
  { name: "Herald notices for a ruler", often: "each notices refresh", cadence: "tick", run: all(NOTICES, noticeParams), sql: [[NOTICES, noticeParams]] },

  // When a player opens a panel or acts
  { name: "Resource ledger panel (50)", often: "on open", cadence: "action", run: all(`SELECT l.*, u.full_name as user_name FROM resource_ledger l LEFT JOIN users u ON l.user_id = u.id WHERE l.user_id = ? ORDER BY l.id DESC LIMIT 50`, [ruler]) },
  { name: "Population ledger panel (50)", often: "on open", cadence: "action", run: all(`SELECT p.*, u.full_name as user_name FROM population_ledger p LEFT JOIN users u ON p.user_id = u.id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 50`, [ruler]) },
  { name: "Realm ledger, admin (100)", often: "on open", cadence: "action", run: all(`SELECT l.*, u.full_name as user_name FROM resource_ledger l LEFT JOIN users u ON l.user_id = u.id ORDER BY l.id DESC LIMIT 100`) },
  {
    name: "Battle report feed (50)",
    often: "on open",
    cadence: "action",
    run: all(`SELECT details_json FROM battle_reports WHERE attacker_id = ? OR defender_id = ? OR participants LIKE ? ORDER BY timestamp DESC LIMIT 50`, [ruler, ruler, like]),
    sql: [[`SELECT details_json FROM battle_reports WHERE attacker_id = ? OR defender_id = ? OR participants LIKE ? ORDER BY timestamp DESC LIMIT 50`, [ruler, ruler, like]]]
  },
  { name: "Last defense", often: "scout / status", cadence: "action", run: all(`SELECT timestamp, attacker_name, attacker_won FROM battle_reports WHERE defender_id = ? ORDER BY timestamp DESC LIMIT 1`, [ruler]) },
  {
    name: "Scouting: harvests in window + last income",
    often: "per scout report",
    cadence: "action",
    run: (() => {
      const a = all(`SELECT COUNT(*) AS n FROM allocation_logs WHERE cycle_timestamp > ? AND cycle_timestamp <= ?`, inDay);
      const b = q(`SELECT timestamp FROM resource_ledger WHERE user_id = ? AND type = 'harvest_allocation' ORDER BY id DESC LIMIT 1`);
      const c = q(`SELECT gold_delta FROM resource_ledger WHERE user_id = ? AND timestamp = ? AND type IN ('harvest_allocation', 'title_harvest_bonus')`);
      return () => {
        a();
        const last = b.get(ruler) as { timestamp: string } | undefined;
        if (last) c.all(ruler, last.timestamp);
      };
    })()
  },
  { name: "Marches out for a ruler", often: "per march", cadence: "action", run: all(`SELECT COALESCE(SUM(soldiers_count), 0) AS total FROM active_marches WHERE attacker_id = ? AND status = 'marching' AND COALESCE(phase, 'outbound') != 'done'`, [ruler]) },
  {
    name: "Titles after one battle",
    often: "per battle",
    cadence: "action",
    run: (() => {
      const a = all(`SELECT ${REPORT_COLUMNS} FROM battle_reports WHERE attacker_id = ? OR defender_id = ? OR participants LIKE ?`, [ruler, ruler, like]);
      const b = all(GATHERED, [ruler]);
      return () => (a(), b());
    })()
  },
  { name: "Watchtower: first harvest", often: "Watchtower open", cadence: "action", run: all(`SELECT MIN(cycle_timestamp) AS t FROM allocation_logs`) },

  // Realm rebuilds, harvests and weekly jobs
  {
    name: "Titles: gathered + kills, all rulers",
    often: "each realm rebuild (~15 min)",
    cadence: "rebuild",
    run: (() => {
      const kills = all(`SELECT ${REPORT_COLUMNS} FROM battle_reports`);
      const g = q(GATHERED);
      return () => {
        kills();
        for (const r of rulers) g.get(r.id);
      };
    })()
  },
  {
    name: "Titles: commit stats, all rulers",
    often: "each Git sync",
    cadence: "rebuild",
    run: (() => {
      const s = q(COMMIT_STATS);
      return () => {
        for (const r of rulers) s.get({ id: r.id, email: r.email || "" });
      };
    })()
  },
  {
    name: "Realm rebuild: commits for all rulers",
    often: "each realm rebuild (~15 min)",
    cadence: "rebuild",
    run: (() => {
      const s = q(USER_COMMITS);
      return () => {
        for (const r of rulers) s.all(r.id, r.email || null, r.id);
      };
    })(),
    sql: [[USER_COMMITS, [ruler, rulerEmail || null, ruler]]]
  },
  { name: "Hall of Renown: daily stats", often: "on a new day / sync", cadence: "rebuild", run: all(`SELECT user_id, day, active, xp, xp_by_repo_json FROM dev_daily_stats ORDER BY day`) },
  { name: "Commits awaiting analysis", often: "each Git sync", cadence: "rebuild", run: all(`SELECT c.hash, c.message, c.lines_added + c.lines_deleted AS lines, r.full_name FROM commits c JOIN repositories r ON r.id = c.repo_id WHERE c.meaningful_lines IS NULL AND c.committed_at >= ? ORDER BY c.committed_at DESC LIMIT 200`, [iso(now - 30 * DAY)]) },
  {
    name: "Children at play, all rulers",
    often: "each realm rebuild (~15 min)",
    cadence: "rebuild",
    run: (() => {
      // db.ts stmtLastHarvestBirths, once per ruler in getAllKingdomsFromDB
      const s = q(`SELECT births FROM population_ledger WHERE user_id = ? AND type = 'harvest_growth' ORDER BY id DESC LIMIT 1`);
      return () => {
        for (const r of rulers) s.get(r.id);
      };
    })()
  },
  {
    name: "Chronicle gem check",
    often: "weekly",
    cadence: "rebuild",
    run: all(`SELECT user_id, scarce_key, SUM(scarce_delta) AS n FROM resource_ledger WHERE timestamp >= ? AND timestamp < ? AND scarce_delta > 0 GROUP BY user_id, scarce_key ORDER BY n DESC`, inWeek)
  },
  { name: "Chronicle: week of battle reports", often: "weekly", cadence: "rebuild", run: all(`SELECT * FROM battle_reports WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp ASC`, inWeek) }
];

/** Median of a few runs after one warm-up, in ms */
function time(run: () => void, runs = 5): number {
  run();
  const out: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = process.hrtime.bigint();
    run();
    out.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  return out.sort((a, b) => a - b)[Math.floor(runs / 2)];
}

const fmt = (ms: number) => (ms < 10 ? ms.toFixed(2) : ms < 100 ? ms.toFixed(1) : ms.toFixed(0));
const rate = (ms: number, cadence: Cadence) => (ms <= BUDGET[cadence][0] ? "OK" : ms <= BUDGET[cadence][1] ? "Watch" : "Slow");

console.log(`Query timings (worst-case ruler: the one with the most history, ${rulers.length} rulers)`);
console.log(`${pad("Query", 44)}${pad("How often", 30)}${lpad("Time", 11)}  Status`);
const flagged: Array<{ check: Check; status: string }> = [];
const results: Array<{ check: Check; ms: number }> = [];
for (const check of CHECKS) {
  let ms: number;
  try {
    ms = time(check.run);
  } catch (err: any) {
    console.log(`${pad(check.name, 44)}${pad(check.often, 30)}${lpad("error", 11)}  ${err.message}`);
    problems++;
    continue;
  }
  results.push({ check, ms });
  const status = rate(ms, check.cadence);
  if (status !== "OK") flagged.push({ check, status });
  if (status === "Slow") problems++;
  console.log(`${pad(check.name, 44)}${pad(check.often, 30)}${lpad(`${fmt(ms)} ms`, 11)}  ${status}`);
}

/* ------------------------------------------------------------------------- */
/* Writes (optional)                                                         */
/* ------------------------------------------------------------------------- */

if (WRITE) {
  db.close();
  const rw = new Database(file, { fileMustExist: true });
  rw.pragma("busy_timeout = 2000");
  const ins = rw.prepare(`INSERT INTO resource_ledger (user_id, timestamp, type, reason) VALUES (?, ?, 'harvest_allocation', 'check:db')`);
  const pop = rw.prepare(`INSERT INTO population_ledger (user_id, timestamp, type, population_balance, soldiers_balance, civilians_balance, reason) VALUES (?, ?, 'harvest_growth', 0, 0, 0, 'check:db')`);
  rw.exec("BEGIN");
  const t = process.hrtime.bigint();
  try {
    for (const r of rulers) {
      ins.run(r.id, iso(now));
      pop.run(r.id, iso(now));
    }
  } finally {
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    rw.exec("ROLLBACK");
    const status = rate(ms, "rebuild");
    if (status === "Slow") problems++;
    console.log(`${pad("Writing one harvest's ledger rows", 44)}${pad("every 10 min", 30)}${lpad(`${fmt(ms)} ms`, 11)}  ${status}  (rolled back)`);
  }
  rw.close();
}

console.log(`\nBudgets: every few seconds OK ≤ ${BUDGET.tick[0]} ms, Watch ≤ ${BUDGET.tick[1]} ms · on open ≤ ${BUDGET.action[0]} / ${BUDGET.action[1]} ms · rebuilds and weekly jobs ≤ ${BUDGET.rebuild[0]} / ${BUDGET.rebuild[1]} ms`);

// Plans for the rows over budget: a SCAN of a history table is the usual cause (a missing or unusable index)
if (flagged.length) {
  const planDb = WRITE ? new Database(file, { readonly: true }) : db;
  console.log("\nOver budget:");
  for (const { check, status } of flagged) {
    console.log(`  ${status}: ${check.name}`);
    for (const [sql, params] of check.sql ?? []) {
      const stmt = planDb.prepare(`EXPLAIN QUERY PLAN ${sql}`);
      const plan = (Array.isArray(params) ? stmt.all(...params) : stmt.all(params)) as Array<{ detail: string }>;
      for (const p of plan) console.log(`      ${p.detail}`);
    }
  }
}

const slowest = results.filter((r) => r.check.cadence === "tick").reduce((a, r) => a + r.ms, 0);
console.log(`\nEvery-few-seconds work per poll: ${fmt(slowest)} ms in total`);
console.log(problems ? `\n${problems} problem(s) found.` : "\nAll checks passed.");
process.exit(problems ? 1 : 0);
