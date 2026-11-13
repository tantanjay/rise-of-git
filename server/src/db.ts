import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { kingdomTitleFor, streakFrom, calculateBuildingLevel, calculateCityHallLevel, assignBuildingDistricts, mostNeededDistrict, timeAgo, DISTRICT_QUOTAS, distributeCivilizations, REPO_HOLDING_MIN_LEVEL, MAX_BUILDING_LEVEL, ARCHON_CASTLE_LEVEL, ARCHON_BUILDING_LEVEL, ARCHON_BUILDING_COUNT, loginListed, PLAY_DAY_MIN_ACTIONS, PLAY_STREAK_BONUS_PER_DAY, PLAY_STREAK_BONUS_MAX, HARVEST_BONUS_CAP_MULT, HARVEST_SHARE_CAP, harvestWeight, cappedShares, playStreakFrom } from "./kingdomUtils.js";
import { scoreCommits, prXp, XP_RULES, round1, isMeaningfulCommit } from "./scoring.js";
import { UPGRADE_BY_ID, BaseResource, MAXED_UPGRADES, improvementEffects } from "./upgrades.js";
import { simulateDemographicCycle, calculateMaxPopulation, calculateGenesisPopulation } from "./demographics.js";
import {
  MOBILIZATION_COST,
  SUMMON_COST,
  SETTLERS,
  FESTIVAL,
  CALL_TO_ARMS_MS,
  festivalCostFor,
  marchSlotsForLevel,
  marchCapacityFor,
  maxSoldiersFor,
  woundedHealPerHarvest,
  wallDefMultForTier,
  wallMaxHpFor,
  computeWallState,
  OVERSEER_TREASURY,
  OVERSEER_SCARCE,
  OVERSEER_GARRISON_SHARE
} from "./warConfig.js";
import crypto from "crypto";
import { config } from "./env.js";
import { DAY_PART_EFFECTS, dayPartOfWindow, seasonEffects, GEM_TILT } from "./realmTime.js";
import { DISASTERS, dateKeyIn, barrenBirthMult, barrenVoidWellMult, blightBuildingMult, blightPoolMult, disasterAt, plagueRate, tallyDisaster } from "./disasterRules.js";
import type {
  CivilizationType,
  BuildingType,
  Commit,
  PullRequest,
  RepoBuilding,
  KingdomResources,
  LedgerEntry,
  PopulationLedgerEntry,
  ScarceResourceDef,
  DeveloperKingdom,
  UnbuiltRepo,
  EarnedTitle,
  TitleBuffs,
  TitleBuffType,
  TitleCategory,
  ActivitySummary,
  RoyalShield,
  RoyalPunishment,
  GiftAmounts,
  ProclamationState,
  DevEmail,
  UnmatchedCommitEmail
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "realm.db");
/** Every building harvests this much per building level each harvest (GAME_GUIDE §7) */
const BUILDING_YIELD_PER_LEVEL = { gold: 0.2, iron: 2, stone: 4, lumber: 4, food: 10 } as const;
/** A repo with a commit or merged PR this recently is in Active Surge (GAME_GUIDE §7)… */
export const ACTIVE_SURGE_WINDOW_HOURS = 48;
/** …which doubles its building's harvest (+100%)… */
const ACTIVE_SURGE_YIELD_MULT = 2;
/** …and doubles the kingdom's weight in the scarce gem split */
const ACTIVE_SURGE_GEM_MULT = 2;

export const db = new Database(DB_PATH);

// High-performance WAL mode
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
// A bigger page cache (64 MB) and in-memory temp sorts keep the long-lived ledgers quick as they grow
db.pragma("cache_size = -64000");
db.pragma("temp_store = MEMORY");
// Keep the query planner's table statistics fresh as tables grow (cheap: SQLite only re-analyses what changed)
db.pragma("analysis_limit = 400");
setTimeout(() => db.pragma("optimize"), 60_000).unref();
setInterval(() => db.pragma("optimize"), 6 * 60 * 60 * 1000).unref();

export const SCARCE_RESOURCES: ScarceResourceDef[] = [
  {
    key: "mana",
    name: "Arcane Mana",
    emblem: "🔮",
    pool: 2500,
    description: "Pure crystallized mana used for mystical enchantments, teleportation spires, and void shielding.",
    rarity: "rare"
  },
  {
    key: "diamond",
    name: "Flawless Diamond",
    emblem: "💎",
    pool: 100,
    description: "Brilliant indestructible gemstone used for citadel throne rooms and legendary architectural monuments.",
    rarity: "epic"
  },
  {
    key: "ruby",
    name: "Blood Ruby",
    emblem: "🔴",
    pool: 100,
    description: "Fiery dragonblood jewel coveted by warlords for crafting devastating siege weapons and flame crests.",
    rarity: "epic"
  },
  {
    key: "emerald",
    name: "Sylvan Emerald",
    emblem: "🟢",
    pool: 100,
    description: "Verdant life-infused gemstone prized by elven rangers for blessing groves and nature elixirs.",
    rarity: "epic"
  },
  {
    key: "sapphire",
    name: "Tide Sapphire",
    emblem: "🔷",
    pool: 100,
    description: "Luminescent oceanic crystal harvested from sunken reefs for sea beacons and tidal barriers.",
    rarity: "epic"
  },
  {
    key: "mithril",
    name: "Dwarven Mithril",
    emblem: "🪙",
    pool: 300,
    description: "Legendary true-silver mined from the deepest mountain chasms, lighter than feather and harder than steel.",
    rarity: "rare"
  },
  {
    key: "obsidian",
    name: "Volcanic Obsidian",
    emblem: "🌌",
    pool: 500,
    description: "Dark razor-sharp volcanic glass forged in the fiery heart of Mount Ignis caldera fissures.",
    rarity: "rare"
  },
  {
    key: "aether",
    name: "Aether Shard",
    emblem: "⚡",
    pool: 250,
    description: "Charged celestial star fragment fallen from the void rift, crackling with raw astral lightning.",
    rarity: "epic"
  },
  {
    key: "dragon_scale",
    name: "Molten Dragon Scale",
    emblem: "🐉",
    pool: 60,
    description: "Impervious scale shed by ancient red dragons, capable of deflecting the fiercest ballistic impacts.",
    rarity: "legendary"
  },
  {
    key: "ancient_rune",
    name: "Titan Rune",
    emblem: "📜",
    pool: 150,
    description: "Relic tablet etched with lost titan hieroglyphs holding the secrets of ancient civilizations.",
    rarity: "rare"
  },
  {
    key: "titan_tablet",
    name: "Titan Tablet",
    emblem: "📜",
    pool: 80,
    description: "Archaic stone tablet etched with forgotten titan hieroglyphs and ancient sovereign laws.",
    rarity: "legendary"
  },
  {
    key: "phoenix_feather",
    name: "Phoenix Feather",
    emblem: "🪶",
    pool: 50,
    description: "Ever-burning celestial plumage radiating the immortal heat of primordial rebirth.",
    rarity: "legendary"
  },
  {
    key: "void_heart",
    name: "Heart of the Void",
    emblem: "🌑",
    // Never in a harvest or a chest: one drops from each Xal'Vorath slain
    pool: 0,
    description: "The black core of a slain Xal'Vorath, still pulling faintly at everything near it. The rarest trophy in the realm.",
    rarity: "mythical"
  }
];

/** The gems harvests and chests can pay (a gem with no pool is won another way) */
export const DROPPED_GEMS = SCARCE_RESOURCES.filter((g) => g.pool > 0);

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      full_name TEXT,
      email TEXT,
      civilization TEXT DEFAULT 'human',
      kingdom_title TEXT,
      city_hall_level INTEGER DEFAULT 1,
      streak_days INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      population INTEGER,
      soldiers INTEGER DEFAULT 0,
      max_population INTEGER,
      last_birth_tick INTEGER DEFAULT 0,
      -- Nethergarde soldiers fallen in battle, waiting to re-manifest (GAME_GUIDE §13)
      void_well INTEGER NOT NULL DEFAULT 0,
      wall_hp INTEGER,
      wall_updated_at INTEGER,
      grudge_stacks INTEGER NOT NULL DEFAULT 0,
      grudge_week_key TEXT,
      -- Built repos at building Lv 3+, saved by each realm build for the Repo Holdings title (titles.ts)
      repo_holdings INTEGER NOT NULL DEFAULT 0,
      -- Buildings at the Lv 25 cap, saved by each realm build for the Legendary Buildings title (titles.ts)
      legendary_buildings INTEGER NOT NULL DEFAULT 0,
      -- Last time the ruler's client polled the realm (drives the "While you were away" notice)
      last_seen_at TEXT
    );

    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      owner_login TEXT NOT NULL,
      default_branch TEXT DEFAULT 'main',
      lines_count INTEGER DEFAULT 0,
      files_count INTEGER DEFAULT 0,
      commits_count INTEGER DEFAULT 0,
      updated_at TEXT,
      backfilled_at TEXT,
      -- Git's own number for the repo: it stays when the repo is renamed or moves owner, so the building follows it
      git_id INTEGER,
      -- Git's updated_at for the repo when a live sync last read it: a repo whose updated_at has moved on since is
      -- read again however long ago it changed (the server may have been down past the sync's lookback window)
      synced_updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS commits (
      hash TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      author_login TEXT,
      author_name TEXT,
      author_email TEXT,
      message TEXT,
      lines_added INTEGER DEFAULT 0,
      lines_deleted INTEGER DEFAULT 0,
      committed_at TEXT NOT NULL,
      -- Meaningful changed lines from the commit's diff (see diffQuality.ts); NULL = not analysed yet
      meaningful_lines INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_commits_repo ON commits(repo_id);
    CREATE INDEX IF NOT EXISTS idx_commits_author_email ON commits(author_email);
    CREATE INDEX IF NOT EXISTS idx_commits_author_login ON commits(author_login);
    CREATE INDEX IF NOT EXISTS idx_commits_time ON commits(committed_at);

    CREATE TABLE IF NOT EXISTS pull_requests (
      id INTEGER PRIMARY KEY,
      repo_id TEXT NOT NULL,
      author_login TEXT,
      title TEXT,
      state TEXT,
      merged_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prs_author ON pull_requests(author_login);
    CREATE INDEX IF NOT EXISTS idx_prs_created ON pull_requests(created_at);

    CREATE TABLE IF NOT EXISTS ignored_repositories (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      owner_login TEXT NOT NULL,
      reason TEXT DEFAULT 'admin_deleted',
      deleted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ignored_repos_full_name ON ignored_repositories(full_name);

    -- Last time an admin asked Git whether an ignored repo has commits now
    CREATE TABLE IF NOT EXISTS ignored_repo_checks (
      repo_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      commit_count INTEGER NOT NULL DEFAULT 0,
      latest_commit_at TEXT,
      error TEXT,
      checked_at TEXT NOT NULL
    );

    -- All users start strictly at 0 resources
    CREATE TABLE IF NOT EXISTS kingdom_resources (
      user_id TEXT PRIMARY KEY,
      gold INTEGER DEFAULT 0,
      iron INTEGER DEFAULT 0,
      stone INTEGER DEFAULT 0,
      lumber INTEGER DEFAULT 0,
      food INTEGER DEFAULT 0,
      updated_at TEXT
    );

    -- Complete double-entry style accounting ledger for user resource history
    CREATE TABLE IF NOT EXISTS resource_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      gold_delta INTEGER NOT NULL DEFAULT 0,
      iron_delta INTEGER NOT NULL DEFAULT 0,
      stone_delta INTEGER NOT NULL DEFAULT 0,
      lumber_delta INTEGER NOT NULL DEFAULT 0,
      food_delta INTEGER NOT NULL DEFAULT 0,
      gold_balance INTEGER NOT NULL DEFAULT 0,
      iron_balance INTEGER NOT NULL DEFAULT 0,
      stone_balance INTEGER NOT NULL DEFAULT 0,
      lumber_balance INTEGER NOT NULL DEFAULT 0,
      food_balance INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      scarce_key TEXT,
      scarce_delta INTEGER DEFAULT 0,
      scarce_balance INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_user ON resource_ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_time ON resource_ledger(timestamp);
    -- Per-ruler totals of one kind of entry (the Gatherer title sums every gathering haul) read only that kind's rows;
    -- the deltas ride in the index so the sum never visits the table (its rows are scattered across years of history)
    CREATE INDEX IF NOT EXISTS idx_ledger_user_type ON resource_ledger(user_id, type, gold_delta, iron_delta, stone_delta, lumber_delta, food_delta);

    -- Maps all alternate and discovered Git commit emails to their corresponding developer account
    CREATE TABLE IF NOT EXISTS user_emails (
      email TEXT PRIMARY KEY,
      user_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_emails_user ON user_emails(user_id);

    -- Admin matches of a shared commit email in one repo: (email, repo) -> developer, checked before user_emails
    CREATE TABLE IF NOT EXISTS repo_emails (
      email TEXT NOT NULL,
      repo_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (email, repo_id)
    );
    CREATE INDEX IF NOT EXISTS idx_repo_emails_user ON repo_emails(user_id);

    CREATE TABLE IF NOT EXISTS allocation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_timestamp TEXT NOT NULL,
      total_gold INTEGER NOT NULL,
      total_iron INTEGER NOT NULL,
      total_stone INTEGER NOT NULL DEFAULT 0,
      total_lumber INTEGER NOT NULL,
      total_food INTEGER NOT NULL,
      round_robin_index INTEGER DEFAULT 0,
      details_json TEXT,
      scarce_key TEXT,
      scarce_pool INTEGER DEFAULT 0
    );
    -- Harvest counts (day / night parity on every status poll), harvests in a window and the first harvest read this
    -- small index instead of every row's details JSON
    CREATE INDEX IF NOT EXISTS idx_alloc_time ON allocation_logs(cycle_timestamp);

    CREATE TABLE IF NOT EXISTS kingdom_scarce_resources (
      user_id TEXT NOT NULL,
      resource_key TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (user_id, resource_key)
    );

    CREATE TABLE IF NOT EXISTS realm_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      user_id TEXT NOT NULL,
      repo_id TEXT NOT NULL,
      PRIMARY KEY (user_id, repo_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_subs_user ON user_subscriptions(user_id);

    -- Code reviews on pull requests (reviewer earns XP; one per PR per reviewer is counted)
    CREATE TABLE IF NOT EXISTS pull_reviews (
      id INTEGER PRIMARY KEY,
      repo_id TEXT NOT NULL,
      pr_id INTEGER NOT NULL,
      reviewer_login TEXT NOT NULL,
      state TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON pull_reviews(reviewer_login);

    -- "Sign in with Git" sessions
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Which Git account first held each login (kingdoms are keyed by login, and Git can give a freed login to someone else)
    CREATE TABLE IF NOT EXISTS git_accounts (
      login TEXT PRIMARY KEY,
      git_id INTEGER NOT NULL,
      first_seen TEXT NOT NULL
    );

    -- City improvements bought with resources (highest tier owned per upgrade)
    CREATE TABLE IF NOT EXISTS kingdom_upgrades (
      user_id TEXT NOT NULL,
      upgrade_id TEXT NOT NULL,
      tier INTEGER NOT NULL,
      purchased_at TEXT NOT NULL,
      PRIMARY KEY (user_id, upgrade_id)
    );

    -- Population Ledger tracks every demographic event (births, deaths, casualties, mobilization)
    CREATE TABLE IF NOT EXISTS population_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      births INTEGER NOT NULL DEFAULT 0,
      deaths INTEGER NOT NULL DEFAULT 0,
      soldiers_delta INTEGER NOT NULL DEFAULT 0,
      population_delta INTEGER NOT NULL DEFAULT 0,
      population_balance INTEGER NOT NULL,
      soldiers_balance INTEGER NOT NULL,
      civilians_balance INTEGER NOT NULL,
      reason TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pop_ledger_user ON population_ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_pop_ledger_time ON population_ledger(timestamp);

    -- Persistent city plan: which district & plot each repo occupies (owners can move repos between districts)
    CREATE TABLE IF NOT EXISTS kingdom_layout (
      user_id TEXT NOT NULL,
      repo_id TEXT NOT NULL,
      building_type TEXT NOT NULL,
      slot INTEGER NOT NULL,
      PRIMARY KEY (user_id, repo_id)
    );

    -- Milestone titles cache (server/src/titles.ts): one row per ruler per category, highest tier reached
    CREATE TABLE IF NOT EXISTS user_earned_titles (
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      tier INTEGER NOT NULL,
      title_name TEXT NOT NULL,
      emblem TEXT NOT NULL DEFAULT '',
      buff_type TEXT NOT NULL,
      buff_pct REAL NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY (user_id, category)
    );

    -- Game actions per ruler per UTC day (marches, rallies, trades, upgrades…): play days, play streak, Game Activity title
    CREATE TABLE IF NOT EXISTS player_activity (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      actions INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );

    -- Minutes with the realm open per ruler per UTC day (one per minute the signed-in client polls): the Watchtower's Game activity
    CREATE TABLE IF NOT EXISTS player_presence (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      minutes INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );

    -- Royal Decrees (GAME_GUIDE §15): one shield and one punishment per kingdom at a time (epoch ms)
    CREATE TABLE IF NOT EXISTS kingdom_shields (
      user_id TEXT PRIMARY KEY,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      breaks_on_attack INTEGER NOT NULL DEFAULT 1,
      granted_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kingdom_punishments (
      user_id TEXT PRIMARY KEY,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      low_birth INTEGER NOT NULL DEFAULT 0,
      high_death INTEGER NOT NULL DEFAULT 0,
      granted_by TEXT NOT NULL
    );

    -- Royal Proclamations (GAME_GUIDE §13): when each ruler last called Paid Settlers, declared a Festival and
    -- attacked a ruler's city or a frontier gate (⚔️ Call to Arms), epoch ms; cooldowns and durations are derived
    CREATE TABLE IF NOT EXISTS proclamations (
      user_id TEXT PRIMARY KEY,
      settlers_at INTEGER NOT NULL DEFAULT 0,
      festival_at INTEGER NOT NULL DEFAULT 0,
      call_to_arms_at INTEGER NOT NULL DEFAULT 0
    );
    -- 🎉 A Festival given by royal decree (GAME_GUIDE §15): free, and apart from the ruler's own weekly cooldown
    CREATE TABLE IF NOT EXISTS royal_festivals (
      user_id TEXT PRIMARY KEY,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      granted_by TEXT NOT NULL
    );

    -- The Scriptorium (GAME_GUIDE §17, scriptorium.ts): Division → Client → Project → repos, and deed reports
    CREATE TABLE IF NOT EXISTS divisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      division_id INTEGER NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (division_id, name)
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      description TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      UNIQUE (client_id, name)
    );
    -- A repo sits in at most one project
    CREATE TABLE IF NOT EXISTS project_repos (
      repo_id TEXT PRIMARY KEY,
      project_id INTEGER NOT NULL,
      assigned_by TEXT NOT NULL,
      assigned_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_project_repos_project ON project_repos(project_id);
    -- 🌙 Moonwell Healers (GAME_GUIDE §13): elf soldiers wounded in a battle, one row per army per battle; each harvest heals a few, oldest first
    CREATE TABLE IF NOT EXISTS wounded_soldiers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      count INTEGER NOT NULL,
      place TEXT NOT NULL,
      wounded_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wounded_user ON wounded_soldiers(user_id);
    -- Deed reports: work that isn't a commit, tied to one repo; status pending | sealed | rejected | revoked
    CREATE TABLE IF NOT EXISTS deeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      repo_id TEXT NOT NULL,
      day TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      xp REAL NOT NULL,
      status TEXT NOT NULL,
      auto INTEGER NOT NULL DEFAULT 0,
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_deeds_user_day ON deeds(user_id, day);
    CREATE INDEX IF NOT EXISTS idx_deeds_status ON deeds(status);
    CREATE INDEX IF NOT EXISTS idx_deeds_repo ON deeds(repo_id);
  `);
}

initDB();

// Columns added after the table first shipped (before the statements below are prepared)
{
  const cols = (db.prepare("PRAGMA table_info(repositories)").all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes("git_id")) db.exec("ALTER TABLE repositories ADD COLUMN git_id INTEGER");
  // A database from before: its repos count as read as they stand (Reset Historical Backfill recovers older gaps)
  if (!cols.includes("synced_updated_at")) db.exec("ALTER TABLE repositories ADD COLUMN synced_updated_at TEXT; UPDATE repositories SET synced_updated_at = updated_at");
  db.exec("CREATE INDEX IF NOT EXISTS idx_repos_git_id ON repositories(git_id)");
}

// Statements
const stmtUpsertUser = db.prepare(`
  INSERT INTO users (id, username, full_name, email, civilization, kingdom_title, city_hall_level, streak_days, updated_at)
  VALUES (@id, @username, @fullName, @email, @civilization, @kingdomTitle, @cityHallLevel, @streakDays, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    username = excluded.username,
    full_name = excluded.full_name,
    email = excluded.email,
    kingdom_title = coalesce(users.kingdom_title, excluded.kingdom_title),
    city_hall_level = max(users.city_hall_level, excluded.city_hall_level),
    streak_days = max(users.streak_days, excluded.streak_days),
    updated_at = datetime('now')
`);

const stmtUpsertRepo = db.prepare(`
  INSERT INTO repositories (id, name, full_name, owner_login, default_branch, lines_count, files_count, commits_count, updated_at, git_id)
  VALUES (@id, @name, @fullName, @ownerLogin, @defaultBranch, @linesCount, @filesCount, @commitsCount, @updatedAt, @gitId)
  ON CONFLICT(id) DO UPDATE SET
    git_id = coalesce(excluded.git_id, repositories.git_id),
    name = excluded.name,
    full_name = excluded.full_name,
    owner_login = excluded.owner_login,
    default_branch = excluded.default_branch,
    lines_count = max(repositories.lines_count, excluded.lines_count),
    files_count = max(repositories.files_count, excluded.files_count),
    commits_count = max(repositories.commits_count, excluded.commits_count),
    updated_at = excluded.updated_at
`);

const stmtUpsertCommit = db.prepare(`
  INSERT INTO commits (hash, repo_id, author_login, author_name, author_email, message, lines_added, lines_deleted, committed_at)
  VALUES (@hash, @repoId, @authorLogin, @authorName, @authorEmail, @message, @linesAdded, @linesDeleted, @committedAt)
  ON CONFLICT(hash) DO UPDATE SET
    lines_added = excluded.lines_added,
    lines_deleted = excluded.lines_deleted
`);

/** Recent commits whose diff hasn't been analysed yet (newest first) */
const stmtCommitsToAnalyse = db.prepare(`
  SELECT c.hash, c.message, c.lines_added + c.lines_deleted AS lines, r.full_name
  FROM commits c JOIN repositories r ON r.id = c.repo_id
  WHERE c.meaningful_lines IS NULL AND c.committed_at >= ?
  ORDER BY c.committed_at DESC
  LIMIT ?
`);
const stmtSetMeaningfulLines = db.prepare(`UPDATE commits SET meaningful_lines = ? WHERE hash = ?`);

export function getCommitsToAnalyse(sinceIso: string, limit: number) {
  return stmtCommitsToAnalyse.all(sinceIso, limit) as Array<{ hash: string; message: string; lines: number; full_name: string }>;
}

export function setMeaningfulLines(hash: string, lines: number) {
  stmtSetMeaningfulLines.run(lines, hash);
}

const stmtUpsertPR = db.prepare(`
  INSERT INTO pull_requests (id, repo_id, author_login, title, state, merged_at, created_at)
  VALUES (@id, @repoId, @authorLogin, @title, @state, @mergedAt, @createdAt)
  ON CONFLICT(id) DO UPDATE SET
    state = excluded.state,
    merged_at = excluded.merged_at
`);

// Starts strictly at 0 resources
const stmtEnsureResources = db.prepare(`
  INSERT INTO kingdom_resources (user_id, gold, iron, stone, lumber, food, updated_at)
  VALUES (?, 0, 0, 0, 0, 0, datetime('now'))
  ON CONFLICT(user_id) DO NOTHING
`);

const stmtSetResources = db.prepare(`
  UPDATE kingdom_resources
  SET gold = @gold,
      iron = @iron,
      stone = @stone,
      lumber = @lumber,
      food = @food,
      updated_at = datetime('now')
  WHERE user_id = @userId
`);

const stmtGetResources = db.prepare(`
  SELECT user_id, gold, iron, stone, lumber, food FROM kingdom_resources WHERE user_id = ?
`);

const stmtInsertLedger = db.prepare(`
  INSERT INTO resource_ledger (
    user_id, timestamp, type,
    gold_delta, iron_delta, stone_delta, lumber_delta, food_delta,
    gold_balance, iron_balance, stone_balance, lumber_balance, food_balance,
    scarce_key, scarce_delta, scarce_balance,
    reason
  )
  VALUES (
    @userId, @timestamp, @type,
    @goldDelta, @ironDelta, @stoneDelta, @lumberDelta, @foodDelta,
    @goldBalance, @ironBalance, @stoneBalance, @lumberBalance, @foodBalance,
    @scarceKey, @scarceDelta, @scarceBalance,
    @reason
  )
`);

/** A developer's treasury: opened at 0 with its genesis ledger line the first time they are seen (every later write is an UPDATE of this row) */
function openTreasury(userId: string, now: string) {
  if (stmtGetResources.get(userId)) return;
  stmtEnsureResources.run(userId);
  stmtInsertLedger.run({
    userId,
    timestamp: now,
    type: "initial_balance",
    goldDelta: 0,
    ironDelta: 0,
    stoneDelta: 0,
    lumberDelta: 0,
    foodDelta: 0,
    goldBalance: 0,
    ironBalance: 0,
    stoneBalance: 0,
    lumberBalance: 0,
    foodBalance: 0,
    scarceKey: null,
    scarceDelta: 0,
    scarceBalance: 0,
    reason: "Genesis treasury account created with zero balance"
  });
}

const stmtGetScarce = db.prepare(`
  SELECT amount FROM kingdom_scarce_resources WHERE user_id = ? AND resource_key = ?
`);

const stmtSetScarce = db.prepare(`
  INSERT INTO kingdom_scarce_resources (user_id, resource_key, amount, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(user_id, resource_key) DO UPDATE SET amount = excluded.amount, updated_at = datetime('now')
`);

const stmtGetUserAllScarce = db.prepare(`
  SELECT resource_key, amount FROM kingdom_scarce_resources WHERE user_id = ?
`);

const stmtGetAllUsers = db.prepare(`
  SELECT * FROM users ORDER BY city_hall_level DESC, username ASC
`);

const stmtUpdateCivilization = db.prepare(`
  UPDATE users SET civilization = ? WHERE id = ?
`);

const stmtUpdateCivilizationAndTitle = db.prepare(`
  UPDATE users SET civilization = ?, kingdom_title = ? WHERE id = ?
`);

/**
 * Reassigns all users in the database using the 4-normal + Nethergarde Voidrift formula:
 * Special users are fixed to Nethergarde Voidrift ('arcane');
 * Non-special users are divided evenly (B each) among human, elf, dwarf, orc;
 * Remaining users go to Nethergarde Voidrift ('arcane').
 */
export function reassignAllCivilizations(): { assigned: Record<CivilizationType, number>; total: number } {
  const users = stmtGetAllUsers.all() as Array<{
    id: string;
    username: string;
    full_name: string;
  }>;

  if (users.length === 0) {
    return { assigned: { human: 0, elf: 0, dwarf: 0, orc: 0, arcane: 0 }, total: 0 };
  }

  const assignments = distributeCivilizations(users, config.specialUsers, config.adminUsers);
  const counts: Record<CivilizationType, number> = { human: 0, elf: 0, dwarf: 0, orc: 0, arcane: 0 };

  const tx = db.transaction(() => {
    for (const u of users) {
      const civ = assignments.get(u.id.toLowerCase()) || "human";
      counts[civ]++;
      const title = kingdomTitleFor(civ, u.full_name || u.username);
      stmtUpdateCivilizationAndTitle.run(civ, title, u.id);
    }
  });
  tx();

  return { assigned: counts, total: users.length };
}

/**
 * Clears all saved kingdom plot layouts so building districts and slots are cleanly regenerated.
 */
export function resetAllKingdomLayouts(): void {
  db.prepare("DELETE FROM kingdom_layout").run();
}

/**
 * Completely resets the treasury ledger and all allocation logs.
 * Active non-special developer accounts are reset to zero balance with a fresh genesis entry,
 * while special overseers keep their high-tier treasury intact.
 */
export const resetLedgerHistory = db.transaction(() => {
  db.prepare("DELETE FROM resource_ledger").run();
  db.prepare("DELETE FROM allocation_logs").run();

  const specialSet = new Set(config.specialUsers.map((s) => s.toLowerCase()));
  const users = stmtGetAllUsers.all() as Array<{ id: string; username: string }>;
  const now = new Date().toISOString();

  for (const u of users) {
    if (specialSet.has(u.username.toLowerCase()) || specialSet.has(u.id.toLowerCase())) {
      continue;
    }
    stmtSetResources.run({
      userId: u.id,
      gold: 0,
      iron: 0,
      stone: 0,
      lumber: 0,
      food: 0
    });
    db.prepare("DELETE FROM kingdom_scarce_resources WHERE user_id = ?").run(u.id);

    stmtInsertLedger.run({
      userId: u.id,
      timestamp: now,
      type: "admin_reset",
      goldDelta: 0,
      ironDelta: 0,
      stoneDelta: 0,
      lumberDelta: 0,
      foodDelta: 0,
      goldBalance: 0,
      ironBalance: 0,
      stoneBalance: 0,
      lumberBalance: 0,
      foodBalance: 0,
      scarceKey: null,
      scarceDelta: 0,
      scarceBalance: 0,
      reason: "Treasury ledger reset by administrator"
    });
  }

  return { resetCount: users.length };
});


const stmtLogAllocation = db.prepare(`
  INSERT INTO allocation_logs (cycle_timestamp, total_gold, total_iron, total_stone, total_lumber, total_food, round_robin_index, details_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtGetLastRRIndex = db.prepare(`
  SELECT round_robin_index FROM allocation_logs ORDER BY id DESC LIMIT 1
`);

const stmtGetLastHarvest = db.prepare(`
  SELECT cycle_timestamp FROM allocation_logs ORDER BY id DESC LIMIT 1
`);

const stmtCountHarvests = db.prepare(`SELECT COUNT(*) AS n FROM allocation_logs`);

/** How many harvests the realm has had: its parity says whether the current harvest window is day or night */
export function countHarvests(): number {
  return (stmtCountHarvests.get() as { n: number }).n;
}

/** Epoch ms of the most recent harvest, or null if the realm has never harvested */
export function getLastHarvestTime(): number | null {
  const row = stmtGetLastHarvest.get() as { cycle_timestamp?: string } | undefined;
  const t = row?.cycle_timestamp ? Date.parse(row.cycle_timestamp) : NaN;
  return Number.isFinite(t) ? t : null;
}

const stmtUpsertUserEmail = db.prepare(`
  INSERT INTO user_emails (email, user_id)
  VALUES (?, ?)
  ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id
`);

export const stmtGetUserById = db.prepare(`
  SELECT * FROM users WHERE id = ?
`);

export const stmtGetAllUserEmails = db.prepare(`
  SELECT email, user_id FROM user_emails
`);

/** Commits whose (email, repo) has an admin per-repo match: the plain email rule leaves them alone */
/**
 * A commit (`c`) no developer holds by login. Only such a commit is credited by its email: once an email passes to
 * another developer, the commits the first one holds stay theirs instead of counting for both.
 */
export const COMMIT_UNCLAIMED = `(c.author_login IS NULL OR c.author_login NOT IN (SELECT id FROM users))`;

const NOT_REPO_MATCHED = `NOT EXISTS (SELECT 1 FROM repo_emails re WHERE re.email = lower(commits.author_email) AND re.repo_id = commits.repo_id)`;

const stmtEmailHasRepoRule = db.prepare(`SELECT 1 FROM repo_emails WHERE email = ? LIMIT 1`);

/** A commit's email joins its author's emails, unless an admin matches that email per repo (a shared email) */
function linkCommitEmail(rawEmail: string, login: string) {
  const email = rawEmail.toLowerCase();
  if (stmtEmailHasRepoRule.get(email)) return;
  stmtUpsertUserEmail.run(email, login.toLowerCase());
}

/**
 * The admin's per-repo matches, for a sync: `rule(email, repoId)` is the developer a commit there belongs to,
 * `shared(email)` says the email is matched per repo and must never be linked to anyone as a whole.
 */
export function loadRepoEmailRules() {
  const rows = db.prepare(`SELECT email, repo_id, user_id FROM repo_emails`).all() as Array<{ email: string; repo_id: string; user_id: string }>;
  const byKey = new Map(rows.map((r) => [`${r.email}|${r.repo_id}`, r.user_id]));
  const emails = new Set(rows.map((r) => r.email));
  return {
    rule: (email: string, repoId: string) => byKey.get(`${email}|${repoId}`) ?? null,
    shared: (email: string) => emails.has(email)
  };
}

/** Every email linked to a developer, with how many commits each one carries */
export function listDevEmails(userId: string): DevEmail[] {
  const id = userId.toLowerCase().trim();
  const user = stmtGetUserById.get(id) as { email?: string } | undefined;
  if (!user) throw new Error(`User "${userId}" not found in database`);
  const primary = (user.email || "").toLowerCase().trim();
  const rows = db.prepare(`
    SELECT e.email, (SELECT count(*) FROM commits WHERE lower(commits.author_email) = e.email AND ${NOT_REPO_MATCHED}) AS commits
    FROM user_emails e WHERE e.user_id = ?
  `).all(id) as Array<{ email: string; commits: number }>;
  if (primary && !rows.some((r) => r.email === primary)) {
    const n = (db.prepare(`SELECT count(*) AS n FROM commits WHERE lower(author_email) = ? AND ${NOT_REPO_MATCHED}`).get(primary) as { n: number }).n;
    rows.push({ email: primary, commits: n });
  }
  const whole: DevEmail[] = rows
    .map((r) => ({ email: r.email, primary: r.email === primary, commits: r.commits }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || b.commits - a.commits || a.email.localeCompare(b.email));
  // Per-repo matches of shared emails come after the whole emails
  const perRepo = db.prepare(`
    SELECT re.email, re.repo_id AS repoId, coalesce(r.full_name, substr(re.repo_id, 6)) AS repo,
           (SELECT count(*) FROM commits c WHERE lower(c.author_email) = re.email AND c.repo_id = re.repo_id) AS commits
    FROM repo_emails re LEFT JOIN repositories r ON r.id = re.repo_id
    WHERE re.user_id = ?
    ORDER BY re.email, repo
  `).all(id) as Array<{ email: string; repoId: string; repo: string; commits: number }>;
  return [...whole, ...perRepo.map((r) => ({ ...r, primary: false }))];
}

/** Commit emails no developer owns, most commits first: what an admin can still assign */
export function listUnmatchedCommitEmails(limit = 200): UnmatchedCommitEmail[] {
  const rows = db.prepare(`
    SELECT lower(author_email) AS email, group_concat(DISTINCT author_name) AS names,
           count(*) AS commits, max(committed_at) AS lastCommit
    FROM commits
    WHERE author_login IS NULL AND author_email IS NOT NULL AND author_email != ''
    GROUP BY lower(author_email)
    ORDER BY commits DESC
    LIMIT ?
  `).all(limit) as Array<Omit<UnmatchedCommitEmail, "repos">>;
  // Which repos each email committed to, most commits first (the row's collapsed repo list)
  const repoRows = db.prepare(`
    SELECT lower(c.author_email) AS email, c.repo_id AS repoId, coalesce(r.full_name, substr(c.repo_id, 6)) AS repo,
           count(*) AS commits, max(c.committed_at) AS lastCommit
    FROM commits c LEFT JOIN repositories r ON r.id = c.repo_id
    WHERE c.author_login IS NULL AND c.author_email IS NOT NULL AND c.author_email != ''
    GROUP BY lower(c.author_email), c.repo_id
    ORDER BY commits DESC
  `).all() as Array<{ email: string } & UnmatchedCommitEmail["repos"][number]>;
  const reposOf = new Map<string, UnmatchedCommitEmail["repos"]>();
  for (const { email, ...repo } of repoRows) {
    const list = reposOf.get(email) ?? [];
    list.push(repo);
    reposOf.set(email, list);
  }
  return rows.map((row) => ({ ...row, repos: reposOf.get(row.email) ?? [] }));
}

/** Something@something, trimmed. Spaces are allowed: a laptop's default Git identity is often `Jane Doe@desktop-1abc` */
const EMAIL_PATTERN = /^[^@]+@[^@]+$/;

/**
 * Admin: link an email to a developer and hand them every commit made under it.
 * An email another developer held moves over (its commits too).
 */
export const assignDevEmail = db.transaction((userId: string, rawEmail: string) => {
  const id = userId.toLowerCase().trim();
  const email = rawEmail.toLowerCase().trim();
  if (!EMAIL_PATTERN.test(email)) throw new Error(`"${rawEmail}" is not an email address`);
  if (!stmtGetUserById.get(id)) throw new Error(`User "${userId}" not found in database`);
  if (stmtEmailHasRepoRule.get(email)) throw new Error(`${email} is matched per repo: tick its remaining repos to match them`);
  const owner = db.prepare(`SELECT user_id FROM user_emails WHERE email = ?`).get(email) as { user_id: string } | undefined;
  const primaryOf = db.prepare(`SELECT id FROM users WHERE lower(email) = ? AND id != ?`).get(email, id) as { id: string } | undefined;
  if (primaryOf) throw new Error(`${email} is the Git email of "${primaryOf.id}" and can't be moved`);
  stmtUpsertUserEmail.run(email, id);
  const reattributedCommits = db.prepare(`
    UPDATE commits SET author_login = ? WHERE lower(author_email) = ? AND (author_login IS NULL OR author_login != ?)
  `).run(id, email, id).changes;
  return { email, previousOwner: owner && owner.user_id !== id ? owner.user_id : null, reattributedCommits };
});

/**
 * Admin: give a developer an email's commits in the chosen repos only (a shared or invalid email).
 * The match lasts: every sync gives that email's commits in those repos to them, and the email is
 * never linked to anyone as a whole. Its other repos stay unmatched.
 */
export const assignDevRepoEmail = db.transaction((userId: string, rawEmail: string, repoIds: string[]) => {
  const id = userId.toLowerCase().trim();
  const email = rawEmail.toLowerCase().trim();
  if (!EMAIL_PATTERN.test(email)) throw new Error(`"${rawEmail}" is not an email address`);
  if (!stmtGetUserById.get(id)) throw new Error(`User "${userId}" not found in database`);
  const repos = [...new Set(repoIds.map((r) => String(r).trim()).filter(Boolean))];
  if (repos.length === 0) throw new Error("Pick at least one repo");
  const owner = db.prepare(`SELECT user_id FROM user_emails WHERE email = ?`).get(email) as { user_id: string } | undefined;
  if (owner) throw new Error(`${email} is linked to "${owner.user_id}" as a whole: unassign it there first`);
  const upsert = db.prepare(`
    INSERT INTO repo_emails (email, repo_id, user_id) VALUES (?, ?, ?)
    ON CONFLICT(email, repo_id) DO UPDATE SET user_id = excluded.user_id
  `);
  const move = db.prepare(`UPDATE commits SET author_login = ? WHERE lower(author_email) = ? AND repo_id = ? AND (author_login IS NULL OR author_login != ?)`);
  let reattributedCommits = 0;
  for (const repoId of repos) {
    if (!stmtCheckRepoExists.get(repoId)) throw new Error(`Repo "${repoId.replace(/^repo-/, "")}" not found in database`);
    upsert.run(email, repoId, id);
    reattributedCommits += move.run(id, email, repoId, id).changes;
  }
  return { email, repos: repos.map((r) => r.replace(/^repo-/, "")), reattributedCommits };
});

/** Admin: unlink an email from a developer; the commits made under it go back to unmatched */
export const unassignDevEmail = db.transaction((userId: string, rawEmail: string) => {
  const id = userId.toLowerCase().trim();
  const email = rawEmail.toLowerCase().trim();
  const user = stmtGetUserById.get(id) as { email?: string } | undefined;
  if (!user) throw new Error(`User "${userId}" not found in database`);
  if ((user.email || "").toLowerCase().trim() === email) throw new Error(`${email} is ${id}'s Git email and can't be unassigned`);
  const removed = db.prepare(`DELETE FROM user_emails WHERE email = ? AND user_id = ?`).run(email, id).changes;
  if (!removed) throw new Error(`${email} is not linked to "${id}"`);
  const unlinkedCommits = db.prepare(`
    UPDATE commits SET author_login = NULL WHERE lower(author_email) = ? AND author_login = ? AND ${NOT_REPO_MATCHED}
  `).run(email, id).changes;
  return { email, unlinkedCommits };
});

/** A developer in the realm backup: who they are, their civilization and every commit email linked to them */
export interface BackupDeveloper {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  civilization: CivilizationType;
  kingdomTitle: string | null;
  emails: string[];
  /** Per-repo matches of shared emails (Developer Emails → ticked repos): the email's commits in that repo are theirs */
  repoEmails?: Array<{ email: string; repo: string }>;
}

const BACKUP_CIVILIZATIONS: CivilizationType[] = ["human", "elf", "dwarf", "orc", "arcane"];
const LOGIN_PATTERN = /^[^\s/]{1,100}$/;

/** Admin backup: every developer, the emails linked to them and their per-repo matches (Admin → Developer Emails) */
export function exportDevelopers(): BackupDeveloper[] {
  const users = db.prepare(`SELECT id, username, full_name, email, civilization, kingdom_title FROM users ORDER BY id`).all() as any[];
  const emailsOf = new Map<string, string[]>();
  for (const { email, user_id } of db.prepare(`SELECT email, user_id FROM user_emails ORDER BY email`).all() as Array<{ email: string; user_id: string }>) {
    const list = emailsOf.get(user_id) ?? [];
    list.push(email);
    emailsOf.set(user_id, list);
  }
  const repoEmailsOf = new Map<string, Array<{ email: string; repo: string }>>();
  for (const { email, repo_id, user_id } of db.prepare(`SELECT email, repo_id, user_id FROM repo_emails ORDER BY email, repo_id`).all() as Array<{ email: string; repo_id: string; user_id: string }>) {
    const list = repoEmailsOf.get(user_id) ?? [];
    list.push({ email, repo: repo_id.replace(/^repo-/, "") });
    repoEmailsOf.set(user_id, list);
  }
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.full_name ?? null,
    email: u.email || null,
    civilization: u.civilization,
    kingdomTitle: u.kingdom_title ?? null,
    emails: emailsOf.get(u.id) ?? [],
    repoEmails: repoEmailsOf.get(u.id) ?? []
  }));
}

/**
 * Admin backup: merges developers and their emails back. A missing developer is added with the file's name,
 * civilization and title (the next harvest keeps that civilization); one already here keeps everything it has and only
 * fills a blank name or Git email. Each listed email is linked to its developer and that developer's commits under it
 * come back to them, as when an admin assigns it by hand; an email that is another developer's Git email, or one matched
 * per repo, stays put. Then each per-repo match is restored, with that email's commits in the repo (the repo need not be
 * synced yet: the next sync honours the match); one whose email is linked to someone as a whole is skipped.
 * Nothing that is not in the file is removed. Run it inside the caller's transaction.
 */
export function importDevelopers(raw: unknown) {
  const added = { developers: 0, updatedDevelopers: 0, emails: 0, movedEmails: 0, repoEmails: 0, movedRepoEmails: 0, reattributedCommits: 0, skippedDevelopers: 0, skippedEmails: 0, skippedRepoEmails: 0 };
  if (raw === undefined) return added;
  if (!Array.isArray(raw)) throw new Error("The backup's developer list is unreadable.");
  const insUser = db.prepare(`
    INSERT INTO users (id, username, full_name, email, civilization, kingdom_title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  const fillUser = db.prepare(`UPDATE users SET full_name = ?, email = ? WHERE id = ?`);
  const ownerOf = db.prepare(`SELECT user_id FROM user_emails WHERE email = ?`);
  const primaryOf = db.prepare(`SELECT id FROM users WHERE lower(email) = ?`);
  const reattribute = db.prepare(`
    UPDATE commits SET author_login = ? WHERE lower(author_email) = ? AND (author_login IS NULL OR author_login != ?) AND ${NOT_REPO_MATCHED}
  `);
  const repoOwnerOf = db.prepare(`SELECT user_id FROM repo_emails WHERE email = ? AND repo_id = ?`);
  const upsertRepoEmail = db.prepare(`
    INSERT INTO repo_emails (email, repo_id, user_id) VALUES (?, ?, ?)
    ON CONFLICT(email, repo_id) DO UPDATE SET user_id = excluded.user_id
  `);
  const reattributeInRepo = db.prepare(`
    UPDATE commits SET author_login = ? WHERE lower(author_email) = ? AND repo_id = ? AND (author_login IS NULL OR author_login != ?)
  `);
  // Per-repo matches wait until every developer is here, then go in after the whole emails
  const repoMatches: Array<{ id: string; raw: unknown }> = [];

  for (const d of raw) {
    const id = typeof d?.id === "string" ? d.id.toLowerCase().trim() : "";
    if (!LOGIN_PATTERN.test(id)) {
      added.skippedDevelopers++;
      continue;
    }
    const username = typeof d.username === "string" && d.username.trim() ? d.username.trim() : id;
    const fullName = typeof d.fullName === "string" && d.fullName.trim() ? d.fullName.trim().slice(0, 200) : null;
    const rawPrimary = typeof d.email === "string" ? d.email.toLowerCase().trim() : "";
    const primary = EMAIL_PATTERN.test(rawPrimary) ? rawPrimary : null;
    const civilization = BACKUP_CIVILIZATIONS.includes(d.civilization) ? (d.civilization as CivilizationType) : "human";
    const kingdomTitle = typeof d.kingdomTitle === "string" && d.kingdomTitle.trim() ? d.kingdomTitle.trim().slice(0, 200) : kingdomTitleFor(civilization, fullName || username);

    // A Git email another developer already carries stays with them
    const freePrimary = primary && !primaryOf.get(primary) ? primary : null;
    const here = stmtGetUserById.get(id) as { full_name?: string | null; email?: string | null } | undefined;
    if (!here) {
      insUser.run(id, username, fullName, freePrimary, civilization, kingdomTitle);
      openTreasury(id, new Date().toISOString());
      added.developers++;
    } else if ((!here.full_name && fullName) || (!here.email && freePrimary)) {
      fillUser.run(here.full_name || fullName, here.email || freePrimary, id);
      added.updatedDevelopers++;
    }

    const emails = new Set<string>();
    for (const e of Array.isArray(d.emails) ? d.emails : []) {
      const email = typeof e === "string" ? e.toLowerCase().trim() : "";
      if (EMAIL_PATTERN.test(email)) emails.add(email);
      else added.skippedEmails++;
    }
    for (const email of emails) {
      const owner = (ownerOf.get(email) as { user_id: string } | undefined)?.user_id;
      if (owner === id) continue;
      const git = (primaryOf.get(email) as { id: string } | undefined)?.id;
      if ((git && git !== id) || stmtEmailHasRepoRule.get(email)) {
        added.skippedEmails++;
        continue;
      }
      stmtUpsertUserEmail.run(email, id);
      if (owner) added.movedEmails++;
      else added.emails++;
      added.reattributedCommits += reattribute.run(id, email, id).changes;
    }
    if (d.repoEmails !== undefined) repoMatches.push({ id, raw: d.repoEmails });
  }

  for (const { id, raw: list } of repoMatches) {
    for (const m of Array.isArray(list) ? list : [null]) {
      const email = typeof m?.email === "string" ? m.email.toLowerCase().trim() : "";
      const repo = typeof m?.repo === "string" ? m.repo.trim() : "";
      if (!EMAIL_PATTERN.test(email) || !repo.includes("/") || ownerOf.get(email)) {
        added.skippedRepoEmails++;
        continue;
      }
      const repoId = `repo-${repo}`;
      const owner = (repoOwnerOf.get(email, repoId) as { user_id: string } | undefined)?.user_id;
      if (owner === id) continue;
      upsertRepoEmail.run(email, repoId, id);
      if (owner) added.movedRepoEmails++;
      else added.repoEmails++;
      added.reattributedCommits += reattributeInRepo.run(id, email, repoId, id).changes;
    }
  }
  return added;
}

/** Admin: undo one per-repo match; that email's commits in the repo go back to unmatched */
export const unassignDevRepoEmail = db.transaction((userId: string, rawEmail: string, repoId: string) => {
  const id = userId.toLowerCase().trim();
  const email = rawEmail.toLowerCase().trim();
  if (!stmtGetUserById.get(id)) throw new Error(`User "${userId}" not found in database`);
  const repo = repoId.replace(/^repo-/, "");
  const removed = db.prepare(`DELETE FROM repo_emails WHERE email = ? AND repo_id = ? AND user_id = ?`).run(email, repoId, id).changes;
  if (!removed) throw new Error(`${email} in ${repo} is not matched to "${id}"`);
  const unlinkedCommits = db.prepare(`
    UPDATE commits SET author_login = NULL WHERE lower(author_email) = ? AND repo_id = ? AND author_login = ?
  `).run(email, repoId, id).changes;
  return { email, repo, unlinkedCommits };
});

/**
 * Re-sync and re-attribute all commits and emails for a specific developer.
 * Links all emails found in Git, existing user_emails, or discovered via author_name matches,
 * updates SQLite user_emails, and reassigns matching commits to this developer.
 */
export const resyncDevCommits = db.transaction((userId: string, newEmails: string[] = []) => {
  const normUserId = userId.toLowerCase().trim();
  const user = stmtGetUserById.get(normUserId) as { id: string; username: string; full_name?: string; email?: string } | undefined;
  if (!user) throw new Error(`User "${userId}" not found in database`);

  // 1. Gather all candidate emails for this user
  const emailSet = new Set<string>();
  if (user.email && user.email.trim()) {
    emailSet.add(user.email.toLowerCase().trim());
  }
  for (const e of newEmails) {
    if (e && e.trim()) {
      emailSet.add(e.toLowerCase().trim());
    }
  }

  // Include existing user_emails mapped to this user
  const existingEmails = db.prepare(`SELECT email FROM user_emails WHERE user_id = ?`).all(normUserId) as Array<{ email: string }>;
  for (const row of existingEmails) {
    if (row.email && row.email.trim()) {
      emailSet.add(row.email.toLowerCase().trim());
    }
  }

  // 2. Name-based discovery: check if any commits have author_name matching this user's name
  const fullName = (user.full_name || "").trim();
  const nameVariants = new Set<string>();
  if (fullName) {
    nameVariants.add(fullName.toLowerCase());
    if (fullName.includes(",")) {
      const parts = fullName.split(",").map((p) => p.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        nameVariants.add(`${parts[1]} ${parts[0]}`.toLowerCase()); // "First Last" from "Last, First"
      }
    } else {
      const parts = fullName.split(/\s+/);
      if (parts.length === 2 && parts[0] && parts[1]) {
        nameVariants.add(`${parts[1]}, ${parts[0]}`.toLowerCase()); // "Last, First" from "First Last"
      }
    }
  }
  if (user.username) {
    nameVariants.add(user.username.toLowerCase().trim());
  }

  if (nameVariants.size > 0) {
    const candidateCommits = db.prepare(`
      SELECT DISTINCT author_name, author_email 
      FROM commits 
      WHERE author_email IS NOT NULL AND author_email != ''
    `).all() as Array<{ author_name: string; author_email: string }>;
    const emailHeldByOther = db.prepare(`
      SELECT 1 FROM users u WHERE u.id != ? AND (
        lower(u.email) = ?
        OR u.id IN (SELECT user_id FROM user_emails WHERE email = ?)
        OR u.id IN (SELECT author_login FROM commits WHERE lower(author_email) = ?)
      ) LIMIT 1
    `);

    for (const c of candidateCommits) {
      const authorLower = (c.author_name || "").toLowerCase().trim();
      if (nameVariants.has(authorLower) && c.author_email) {
        const email = c.author_email.toLowerCase().trim();
        // A shared name proves nothing: an email another developer holds stays theirs
        if (!emailHeldByOther.get(normUserId, email, email, email)) emailSet.add(email);
      }
    }
  }

  // 3. Upsert all discovered emails into user_emails
  const stmtUpsert = db.prepare(`
    INSERT INTO user_emails (email, user_id)
    VALUES (?, ?)
    ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id
  `);

  const linkedEmails: string[] = [];
  for (const email of emailSet) {
    if (stmtEmailHasRepoRule.get(email)) continue; // matched per repo by an admin: never linked as a whole
    stmtUpsert.run(email, normUserId);
    linkedEmails.push(email);
  }

  // 4. Re-attribute commits in SQLite
  let reattributedCommits = 0;
  if (linkedEmails.length > 0) {
    const placeholders = linkedEmails.map(() => "?").join(",");
    const stmtUpdateCommits = db.prepare(`
      UPDATE commits
      SET author_login = ?
      WHERE lower(author_email) IN (${placeholders}) AND ${NOT_REPO_MATCHED}
    `);
    const info = stmtUpdateCommits.run(normUserId, ...linkedEmails);
    reattributedCommits = info.changes;
  }

  const totalUserCommits = (db.prepare(`
    SELECT count(*) as count FROM commits WHERE author_login = ?
  `).get(normUserId) as { count: number }).count;

  return {
    userId: normUserId,
    username: user.username,
    fullName: user.full_name || user.username,
    linkedEmails,
    reattributedCommits,
    totalUserCommits
  };
});


const stmtGetUserLedger = db.prepare(`
  SELECT l.*, u.full_name as user_name
  FROM resource_ledger l
  LEFT JOIN users u ON l.user_id = u.id
  WHERE l.user_id = ?
  ORDER BY l.id DESC
  LIMIT ?
`);

const stmtGetRealmLedger = db.prepare(`
  SELECT l.*, u.full_name as user_name
  FROM resource_ledger l
  LEFT JOIN users u ON l.user_id = u.id
  ORDER BY l.id DESC
  LIMIT ?
`);

const stmtUpsertUserSubscription = db.prepare(`
  INSERT INTO user_subscriptions (user_id, repo_id)
  VALUES (?, ?)
  ON CONFLICT(user_id, repo_id) DO NOTHING
`);

const stmtGetUserSubscribedRepos = db.prepare(`
  SELECT r.*
  FROM repositories r
  JOIN user_subscriptions us ON r.id = us.repo_id
  WHERE us.user_id = ?
`);

const stmtGetLayout = db.prepare(`
  SELECT repo_id, building_type, slot FROM kingdom_layout WHERE user_id = ?
`);

const stmtInsertLayout = db.prepare(`
  INSERT OR REPLACE INTO kingdom_layout (user_id, repo_id, building_type, slot) VALUES (?, ?, ?, ?)
`);

const stmtDeleteLayoutRow = db.prepare(`
  DELETE FROM kingdom_layout WHERE user_id = ? AND repo_id = ?
`);

type LayoutRow = { repo_id: string; building_type: BuildingType; slot: number };

/** Lowest-slot vacant plot (a removed repo's saved plot) in a district, if any */
function vacantRowIn(rows: LayoutRow[], buildingType: BuildingType, activeRepoIds: Set<string>): LayoutRow | undefined {
  return rows.filter((r) => r.building_type === buildingType && !activeRepoIds.has(r.repo_id)).sort((a, b) => a.slot - b.slot)[0];
}

/**
 * Owner swaps the plots of two repos: each takes the other's district and slot, so district
 * sizes never change (e.g. a big house trades places with a small barracks to get a grand barracks).
 * Returns false if either repo has no plot yet.
 */
export const swapRepoPlots = db.transaction((userId: string, repoA: string, repoB: string) => {
  const rows = stmtGetLayout.all(userId) as LayoutRow[];
  const a = rows.find((r) => r.repo_id === repoA);
  const b = rows.find((r) => r.repo_id === repoB);
  if (!a || !b) return false;
  stmtInsertLayout.run(userId, repoA, b.building_type, b.slot);
  stmtInsertLayout.run(userId, repoB, a.building_type, a.slot);
  return true;
});

/**
 * Resolve each repo's district and plot from the saved plan.
 * - No plan yet: assign by rank (35/25/25/15 split) and save it.
 * - Plan exists: keep every saved plot; new repos join the district furthest below quota
 *   and take over a vacant plot there (left by a removed repo) or else its lowest free plot.
 *   Other plots of removed repos stay vacant so the buildings around them never shift.
 */
const resolveKingdomLayout = db.transaction((userId: string, rankedRepoIds: string[]) => {
  const rows = stmtGetLayout.all(userId) as LayoutRow[];
  const placed = new Map(rows.map((r) => [r.repo_id, { buildingType: r.building_type, slot: r.slot }]));

  if (rows.length === 0) {
    // Biggest repos first → houses, then pastures, farms, barracks
    const order = DISTRICT_QUOTAS.map((d) => d.type);
    const types = assignBuildingDistricts(rankedRepoIds.length).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const nextSlot: Partial<Record<BuildingType, number>> = {};
    rankedRepoIds.forEach((repoId, idx) => {
      const buildingType = types[idx] || "residential_commercial";
      const slot = nextSlot[buildingType] ?? 0;
      nextSlot[buildingType] = slot + 1;
      placed.set(repoId, { buildingType, slot });
      stmtInsertLayout.run(userId, repoId, buildingType, slot);
    });
    return { placed, vacant: [] as Array<{ buildingType: BuildingType; slot: number }> };
  }

  const counts: Record<BuildingType, number> = {
    residential_commercial: 0,
    animal_field: 0,
    food_field: 0,
    soldier_building: 0
  };
  const usedSlots: Record<string, Set<number>> = {};
  for (const r of rows) {
    (usedSlots[r.building_type] ||= new Set()).add(r.slot);
  }
  for (const repoId of rankedRepoIds) {
    const p = placed.get(repoId);
    if (p) counts[p.buildingType]++;
  }

  const active = new Set(rankedRepoIds);
  let remaining = rows;
  for (const repoId of rankedRepoIds) {
    if (placed.has(repoId)) continue;
    const buildingType = mostNeededDistrict(counts);
    const used = (usedSlots[buildingType] ||= new Set());
    const reuse = vacantRowIn(remaining, buildingType, active);
    let slot = 0;
    if (reuse) {
      stmtDeleteLayoutRow.run(userId, reuse.repo_id);
      remaining = remaining.filter((r) => r !== reuse);
      slot = reuse.slot;
    } else {
      while (used.has(slot)) slot++;
      used.add(slot);
    }
    counts[buildingType]++;
    placed.set(repoId, { buildingType, slot });
    stmtInsertLayout.run(userId, repoId, buildingType, slot);
  }

  const vacant = remaining
    .filter((r) => !active.has(r.repo_id))
    .map((r) => ({ buildingType: r.building_type, slot: r.slot }));

  return { placed, vacant };
});

const stmtUpsertReview = db.prepare(`
  INSERT INTO pull_reviews (id, repo_id, pr_id, reviewer_login, state, submitted_at)
  VALUES (@id, @repoId, @prId, @reviewerLogin, @state, @submittedAt)
  ON CONFLICT(id) DO UPDATE SET state = excluded.state, submitted_at = excluded.submitted_at
`);

/* ---------------------------- Sessions ----------------------------------  */

const stmtInsertSession = db.prepare(`INSERT INTO auth_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`);
const stmtGetSession = db.prepare(`SELECT user_id, expires_at FROM auth_sessions WHERE token = ?`);
const stmtDeleteSession = db.prepare(`DELETE FROM auth_sessions WHERE token = ?`);
const stmtPurgeSessions = db.prepare(`DELETE FROM auth_sessions WHERE expires_at < ?`);

/** Creates a session for a developer and returns its random token */
export function createSession(userId: string, days: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  stmtPurgeSessions.run(now.toISOString());
  stmtInsertSession.run(token, userId, now.toISOString(), new Date(now.getTime() + days * 86_400_000).toISOString());
  return token;
}

export function getSessionUserId(token: string): string | null {
  const row = stmtGetSession.get(token) as { user_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    stmtDeleteSession.run(token);
    return null;
  }
  return row.user_id;
}

export function deleteSession(token: string) {
  stmtDeleteSession.run(token);
}

const stmtPinGitAccount = db.prepare(`INSERT INTO git_accounts (login, git_id, first_seen) VALUES (?, ?, ?) ON CONFLICT(login) DO NOTHING`);
const stmtGetGitAccount = db.prepare(`SELECT git_id FROM git_accounts WHERE login = ?`);

/** Remembers which Git account holds each login the first time it is seen; a later account under the same login never replaces it */
export const pinGitAccounts = db.transaction((accounts: Array<{ login: string; gitId: number }>) => {
  const now = new Date().toISOString();
  for (const a of accounts) stmtPinGitAccount.run(a.login, a.gitId, now);
});

/** True when this Git account owns the login (pinning it if the login is new) */
export function claimGitLogin(login: string, gitId: number): boolean {
  stmtPinGitAccount.run(login, gitId, new Date().toISOString());
  return (stmtGetGitAccount.get(login) as { git_id: number }).git_id === gitId;
}

/* ---------------------------- City improvements -------------------------  */

const stmtGetUpgrades = db.prepare(`SELECT upgrade_id, tier FROM kingdom_upgrades WHERE user_id = ?`);
const stmtSetUpgrade = db.prepare(`
  INSERT INTO kingdom_upgrades (user_id, upgrade_id, tier, purchased_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, upgrade_id) DO UPDATE SET tier = excluded.tier, purchased_at = excluded.purchased_at
`);

export function getKingdomUpgrades(userId: string): Record<string, number> {
  const rows = stmtGetUpgrades.all(userId) as Array<{ upgrade_id: string; tier: number }>;
  return Object.fromEntries(rows.map((r) => [r.upgrade_id, r.tier]));
}

export const isSpecialUserId = (userId: string) => {
  const u = stmtGetUserById.get(userId) as { id: string; username: string } | undefined;
  const ids = [userId.toLowerCase(), (u?.username ?? "").toLowerCase()];
  return config.specialUsers.some((s) => ids.includes(s.toLowerCase()));
};

/** Improvement tiers that count for game effects: what the ruler bought, or everything maxed for Special Overseers */
export function getEffectiveUpgrades(userId: string): Record<string, number> {
  return isSpecialUserId(userId) ? { ...MAXED_UPGRADES } : getKingdomUpgrades(userId);
}

export function getKingdomResources(userId: string): KingdomResources {
  const row = stmtGetResources.get(userId) as { gold: number; iron: number; stone: number; lumber: number; food: number } | undefined;
  const scarce = (stmtGetUserAllScarce.all(userId) as Array<{ resource_key: string; amount: number }>).reduce(
    (acc, r) => ({ ...acc, [r.resource_key]: r.amount }),
    {} as Record<string, number>
  );
  return { gold: row?.gold ?? 0, iron: row?.iron ?? 0, stone: row?.stone ?? 0, lumber: row?.lumber ?? 0, food: row?.food ?? 0, scarce };
}

/**
 * Buys the next tier of a city improvement. Deducts the cost atomically and writes ledger entries
 * (one for base resources, plus one per rare gem spent). Throws a user-facing message on failure.
 */
export const purchaseUpgrade = db.transaction((userId: string, upgradeId: string) => {
  const def = UPGRADE_BY_ID.get(upgradeId);
  if (!def) throw new Error("Unknown improvement");
  const owned = getKingdomUpgrades(userId)[upgradeId] ?? 0;
  if (owned >= def.tiers.length) throw new Error(`${def.name} is already fully upgraded`);
  const tier = def.tiers[owned];

  const res = getKingdomResources(userId);
  const missing: string[] = [];
  for (const [k, cost] of Object.entries(tier.cost) as Array<[BaseResource, number]>) {
    if ((res[k] ?? 0) < cost) missing.push(`${(cost - (res[k] ?? 0)).toLocaleString()} ${k}`);
  }
  for (const [gem, cost] of Object.entries(tier.gems || {})) {
    if ((res.scarce?.[gem] ?? 0) < cost) missing.push(`${cost - (res.scarce?.[gem] ?? 0)} ${gem.replace(/_/g, " ")}`);
  }
  if (missing.length) throw new Error(`Not enough resources — still need ${missing.join(", ")}`);

  const next = {
    gold: res.gold - (tier.cost.gold ?? 0),
    iron: res.iron - (tier.cost.iron ?? 0),
    stone: res.stone - (tier.cost.stone ?? 0),
    lumber: res.lumber - (tier.cost.lumber ?? 0),
    food: res.food - (tier.cost.food ?? 0)
  };
  stmtSetResources.run({ userId, ...next });

  const now = new Date().toISOString();
  const gems = Object.entries(tier.gems || {});
  const reason = `Built ${tier.name} (${def.name} tier ${owned + 1}/${def.tiers.length})`;
  const ledgerBase = {
    userId,
    timestamp: now,
    type: "upgrade_purchase",
    goldBalance: next.gold,
    ironBalance: next.iron,
    stoneBalance: next.stone,
    lumberBalance: next.lumber,
    foodBalance: next.food,
    reason
  };

  stmtInsertLedger.run({
    ...ledgerBase,
    goldDelta: -(tier.cost.gold ?? 0),
    ironDelta: -(tier.cost.iron ?? 0),
    stoneDelta: -(tier.cost.stone ?? 0),
    lumberDelta: -(tier.cost.lumber ?? 0),
    foodDelta: -(tier.cost.food ?? 0),
    scarceKey: null,
    scarceDelta: 0,
    scarceBalance: 0
  });
  for (const [gem, cost] of gems) {
    const balance = (res.scarce?.[gem] ?? 0) - cost;
    stmtSetScarce.run(userId, gem, balance);
    stmtInsertLedger.run({
      ...ledgerBase,
      goldDelta: 0,
      ironDelta: 0,
      stoneDelta: 0,
      lumberDelta: 0,
      foodDelta: 0,
      scarceKey: gem,
      scarceDelta: -cost,
      scarceBalance: balance
    });
  }

  stmtSetUpgrade.run(userId, upgradeId, owned + 1, now);
  if (upgradeId === "walls") {
    const uRow = db.prepare(`SELECT city_hall_level, wall_hp, wall_updated_at FROM users WHERE id = ?`).get(userId) as any;
    if (uRow && uRow.wall_hp !== null && uRow.wall_hp !== undefined) {
      const lvl = uRow.city_hall_level || 1;
      const oldMax = wallMaxHpFor(lvl, owned);
      const newMax = wallMaxHpFor(lvl, owned + 1);
      const curWall = computeWallState(uRow.wall_hp, uRow.wall_updated_at, oldMax);
      const nextHp = Math.min(newMax, curWall.wallHp + Math.max(0, newMax - oldMax));
      db.prepare(`UPDATE users SET wall_hp = ?, wall_updated_at = ? WHERE id = ?`).run(nextHp, Date.now(), userId);
    }
  }
  return { upgradeId, tier: owned + 1 };
});

export interface UpgradeRefund {
  /** Improvement id → tier that was stripped */
  stripped: Record<string, number>;
  refundedBase: Record<BaseResource, number>;
  refundedGems: Record<string, number>;
}

/**
 * Admin: strips every improvement a ruler owns and credits back 100% of the catalog cost of every tier owned
 * (base resources and rare gems), with one ledger entry for the base resources and one per gem.
 * Walls drop to the basic fence, so wall HP is capped at the fence's maximum.
 */
export const resetAndRefundKingdomUpgrades = db.transaction((userId: string): UpgradeRefund => {
  const owned = getKingdomUpgrades(userId);
  const refundedBase: Record<BaseResource, number> = { gold: 0, iron: 0, stone: 0, lumber: 0, food: 0 };
  const refundedGems: Record<string, number> = {};
  const stripped: Record<string, number> = {};
  for (const [upgradeId, tierCount] of Object.entries(owned)) {
    const def = UPGRADE_BY_ID.get(upgradeId);
    if (!def || tierCount <= 0) continue;
    stripped[upgradeId] = tierCount;
    for (const tier of def.tiers.slice(0, tierCount)) {
      for (const [k, cost] of Object.entries(tier.cost) as Array<[BaseResource, number]>) refundedBase[k] += cost;
      for (const [gem, cost] of Object.entries(tier.gems ?? {})) refundedGems[gem] = (refundedGems[gem] ?? 0) + cost;
    }
  }
  if (Object.keys(stripped).length === 0) return { stripped, refundedBase, refundedGems };

  db.prepare(`DELETE FROM kingdom_upgrades WHERE user_id = ?`).run(userId);

  const res = getKingdomResources(userId);
  const next = {
    gold: res.gold + refundedBase.gold,
    iron: res.iron + refundedBase.iron,
    stone: res.stone + refundedBase.stone,
    lumber: res.lumber + refundedBase.lumber,
    food: res.food + refundedBase.food
  };
  stmtSetResources.run({ userId, ...next });

  const now = new Date().toISOString();
  const reason = `Admin reset all improvements (${Object.entries(stripped).map(([id, t]) => `${UPGRADE_BY_ID.get(id)?.name ?? id} ${t}`).join(", ")}): 100% refund`;
  const ledgerBase = {
    userId,
    timestamp: now,
    type: "admin_refund_improvements",
    goldBalance: next.gold,
    ironBalance: next.iron,
    stoneBalance: next.stone,
    lumberBalance: next.lumber,
    foodBalance: next.food,
    reason
  };
  stmtInsertLedger.run({
    ...ledgerBase,
    goldDelta: refundedBase.gold,
    ironDelta: refundedBase.iron,
    stoneDelta: refundedBase.stone,
    lumberDelta: refundedBase.lumber,
    foodDelta: refundedBase.food,
    scarceKey: null,
    scarceDelta: 0,
    scarceBalance: 0
  });
  for (const [gem, amount] of Object.entries(refundedGems)) {
    if (amount <= 0) continue;
    const balance = (res.scarce?.[gem] ?? 0) + amount;
    stmtSetScarce.run(userId, gem, balance);
    stmtInsertLedger.run({
      ...ledgerBase,
      goldDelta: 0,
      ironDelta: 0,
      stoneDelta: 0,
      lumberDelta: 0,
      foodDelta: 0,
      scarceKey: gem,
      scarceDelta: amount,
      scarceBalance: balance
    });
  }

  if (stripped.walls) {
    const uRow = db.prepare(`SELECT city_hall_level, wall_hp, wall_updated_at FROM users WHERE id = ?`).get(userId) as any;
    if (uRow && uRow.wall_hp !== null && uRow.wall_hp !== undefined) {
      const fenceMax = wallMaxHpFor(uRow.city_hall_level || 1, 0);
      const cur = computeWallState(uRow.wall_hp, uRow.wall_updated_at, wallMaxHpFor(uRow.city_hall_level || 1, stripped.walls));
      db.prepare(`UPDATE users SET wall_hp = ?, wall_updated_at = ? WHERE id = ?`).run(Math.min(fenceMax, cur.wallHp), Date.now(), userId);
    }
  }
  return { stripped, refundedBase, refundedGems };
});

/**
 * Admin: resets and fully refunds the improvements of every ruler who owns any (Special Overseers are skipped:
 * their improvements are fixed at maximum). One transaction; each ruler gets their own ledger entries.
 */
export const resetAndRefundAllKingdomUpgrades = db.transaction(() => {
  const owners = (db.prepare(`SELECT DISTINCT user_id FROM kingdom_upgrades WHERE tier > 0`).all() as Array<{ user_id: string }>)
    .map((r) => r.user_id)
    .filter((id) => !isSpecialUserId(id));
  const refundedBase: Record<BaseResource, number> = { gold: 0, iron: 0, stone: 0, lumber: 0, food: 0 };
  const refundedGems: Record<string, number> = {};
  let tiers = 0;
  const perKingdom: Array<{ userId: string; refund: UpgradeRefund }> = [];
  for (const userId of owners) {
    const r = resetAndRefundKingdomUpgrades(userId);
    perKingdom.push({ userId, refund: r });
    tiers += Object.values(r.stripped).reduce((sum, t) => sum + t, 0);
    for (const k of Object.keys(refundedBase) as BaseResource[]) refundedBase[k] += r.refundedBase[k];
    for (const [gem, n] of Object.entries(r.refundedGems)) refundedGems[gem] = (refundedGems[gem] ?? 0) + n;
  }
  return { kingdoms: owners.length, tiers, refundedBase, refundedGems, perKingdom };
});

/**
 * Dispatches a resource trade caravan from one kingdom to another.
 * Deducts resources from sender, credits recipient, and records ledger entries for both.
 * Only allowed between kingdoms of the same civilization (GAME_GUIDE §13).
 */
export const transferKingdomResources = db.transaction((
  senderId: string,
  recipientId: string,
  transfer: { food?: number; wood?: number; stone?: number; iron?: number; gold?: number }
) => {
  if (senderId.toLowerCase() === recipientId.toLowerCase()) {
    throw new Error("Cannot dispatch caravan to your own realm.");
  }
  if (isSpecialUserId(senderId)) throw new Error("Special Overseers' treasuries are for show: they refill every harvest and send no caravans.");
  const senderUser = db.prepare(`SELECT id, civilization FROM users WHERE LOWER(id) = LOWER(?)`).get(senderId) as { id: string; civilization: string } | undefined;
  const recipUser = db.prepare(`SELECT id, civilization FROM users WHERE LOWER(id) = LOWER(?)`).get(recipientId) as { id: string; civilization: string } | undefined;
  if (!senderUser || !recipUser) {
    throw new Error("Kingdom not found.");
  }
  if ((senderUser.civilization || "human") !== (recipUser.civilization || "human")) {
    throw new Error("Caravans may only be sent to kingdoms of your own civilization.");
  }
  const senderRes = getKingdomResources(senderId);
  const recipRes = getKingdomResources(recipientId);

  const foodAmt = Math.max(0, Math.floor(transfer.food || 0));
  const woodAmt = Math.max(0, Math.floor(transfer.wood || 0));
  const stoneAmt = Math.max(0, Math.floor(transfer.stone || 0));
  const ironAmt = Math.max(0, Math.floor(transfer.iron || 0));
  const goldAmt = Math.max(0, Math.floor(transfer.gold || 0));

  const totalSent = foodAmt + woodAmt + stoneAmt + ironAmt + goldAmt;
  if (totalSent <= 0) throw new Error("Must send at least 1 resource unit.");

  if (senderRes.food < foodAmt) throw new Error(`Insufficient food. Have ${senderRes.food}, need ${foodAmt}.`);
  if (senderRes.lumber < woodAmt) throw new Error(`Insufficient wood. Have ${senderRes.lumber}, need ${woodAmt}.`);
  if (senderRes.stone < stoneAmt) throw new Error(`Insufficient stone. Have ${senderRes.stone}, need ${stoneAmt}.`);
  if (senderRes.iron < ironAmt) throw new Error(`Insufficient iron. Have ${senderRes.iron}, need ${ironAmt}.`);
  if (senderRes.gold < goldAmt) throw new Error(`Insufficient gold. Have ${senderRes.gold}, need ${goldAmt}.`);

  const senderNext = {
    food: senderRes.food - foodAmt,
    lumber: senderRes.lumber - woodAmt,
    stone: senderRes.stone - stoneAmt,
    iron: senderRes.iron - ironAmt,
    gold: senderRes.gold - goldAmt
  };
  stmtSetResources.run({ userId: senderId, ...senderNext });

  const recipNext = {
    food: recipRes.food + foodAmt,
    lumber: recipRes.lumber + woodAmt,
    stone: recipRes.stone + stoneAmt,
    iron: recipRes.iron + ironAmt,
    gold: recipRes.gold + goldAmt
  };
  stmtSetResources.run({ userId: recipientId, ...recipNext });

  const now = new Date().toISOString();
  stmtInsertLedger.run({
    userId: senderId,
    timestamp: now,
    type: "trade_sent",
    goldDelta: -goldAmt,
    ironDelta: -ironAmt,
    stoneDelta: -stoneAmt,
    lumberDelta: -woodAmt,
    foodDelta: -foodAmt,
    goldBalance: senderNext.gold,
    ironBalance: senderNext.iron,
    stoneBalance: senderNext.stone,
    lumberBalance: senderNext.lumber,
    foodBalance: senderNext.food,
    scarceKey: null,
    scarceDelta: 0,
    scarceBalance: 0,
    reason: `Dispatched trade caravan to ${recipientId}`
  });

  stmtInsertLedger.run({
    userId: recipientId,
    timestamp: now,
    type: "trade_received",
    goldDelta: goldAmt,
    ironDelta: ironAmt,
    stoneDelta: stoneAmt,
    lumberDelta: woodAmt,
    foodDelta: foodAmt,
    goldBalance: recipNext.gold,
    ironBalance: recipNext.iron,
    stoneBalance: recipNext.stone,
    lumberBalance: recipNext.lumber,
    foodBalance: recipNext.food,
    scarceKey: null,
    scarceDelta: 0,
    scarceBalance: 0,
    reason: `Received trade caravan from ${senderId}`
  });

  return { senderResources: senderNext, recipResources: recipNext };
});


/**
 * Fast transactional bulk save of Git snapshot into SQLite
 */
export const saveGitSnapshot = db.transaction((
  users: Array<{ id: string; username: string; fullName: string; email: string; civilization: string; kingdomTitle: string; cityHallLevel: number; streakDays: number }>,
  userEmails: Array<{ email: string; userId: string }>,
  repos: Array<{ id: string; name: string; fullName: string; ownerLogin: string; defaultBranch: string; linesCount: number; filesCount: number; commitsCount: number; updatedAt: string; gitId?: number | null }>,
  commits: Array<{ hash: string; repoId: string; authorLogin: string | null; authorName: string; authorEmail: string; message: string; linesAdded: number; linesDeleted: number; committedAt: string }>,
  pulls: Array<{ id: number; repoId: string; authorLogin: string | null; title: string; state: string; mergedAt: string | null; createdAt: string }>,
  userSubscriptions: Array<{ userId: string; repoId: string }> = [],
  reviews: Array<{ id: number; repoId: string; prId: number; reviewerLogin: string; state: string; submittedAt: string }> = []
) => {
  const now = new Date().toISOString();
  for (const u of users) {
    stmtUpsertUser.run(u);
    if (u.email) {
      stmtUpsertUserEmail.run(u.email.toLowerCase(), u.id.toLowerCase());
    }
    openTreasury(u.id, now);
  }
  for (const ue of userEmails) {
    if (ue.email && ue.userId) {
      stmtUpsertUserEmail.run(ue.email.toLowerCase(), ue.userId.toLowerCase());
    }
  }
  for (const r of repos) {
    stmtUpsertRepo.run({ gitId: null, ...r });
  }
  for (const c of commits) {
    stmtUpsertCommit.run(c);
    if (c.authorLogin && c.authorEmail) linkCommitEmail(c.authorEmail, c.authorLogin);
  }
  for (const p of pulls) {
    stmtUpsertPR.run(p);
  }
  for (const s of userSubscriptions) {
    if (s.userId && s.repoId) {
      stmtUpsertUserSubscription.run(s.userId.toLowerCase(), s.repoId);
    }
  }
  for (const r of reviews) {
    stmtUpsertReview.run(r);
  }
});

const stmtCheckUserExists = db.prepare(`SELECT 1 FROM users WHERE id = ?`);
const stmtCheckRepoExists = db.prepare(`SELECT 1 FROM repositories WHERE id = ?`);
const stmtCheckCommitExists = db.prepare(`SELECT 1 FROM commits WHERE hash = ?`);
const stmtCheckPRExists = db.prepare(`SELECT 1 FROM pull_requests WHERE id = ?`);
const stmtRepoBackfilled = db.prepare(`SELECT 1 FROM repositories WHERE id = ? AND backfilled_at IS NOT NULL`);

/** The realm holds this commit already */
export function isCommitStored(hash: string): boolean {
  return !!stmtCheckCommitExists.get(hash);
}

/** Git's `updated_at` for each repo when a live sync last read it */
export function getSyncedRepoVersions(): Map<string, string | null> {
  return new Map((db.prepare(`SELECT id, synced_updated_at FROM repositories`).all() as Array<{ id: string; synced_updated_at: string | null }>).map((r) => [r.id, r.synced_updated_at]));
}

/** The backfill has read this repo's history */
export function isRepoBackfilled(repoId: string): boolean {
  return !!stmtRepoBackfilled.get(repoId);
}

const stmtRepoByGitId = db.prepare(`SELECT id FROM repositories WHERE git_id = ? AND id != ? LIMIT 1`);

/**
 * A repo renamed (or moved to another owner) in Git: moves everything held under its old id to the new one, inside
 * the caller's transaction. When a row under the new name exists already (the sync saw the new name before it knew
 * the repo's Git number), the two are merged: the old row's plot, project and checkpoint win, as the older building.
 */
function renameRepository(oldId: string, newId: string) {
  const fresh = stmtCheckRepoExists.get(newId);
  if (fresh) {
    db.prepare(`DELETE FROM kingdom_layout WHERE repo_id = ? AND user_id IN (SELECT user_id FROM kingdom_layout WHERE repo_id = ?)`).run(newId, oldId);
    db.prepare(`DELETE FROM project_repos WHERE repo_id = ? AND EXISTS (SELECT 1 FROM project_repos WHERE repo_id = ?)`).run(newId, oldId);
    const old = db.prepare(`SELECT lines_count, files_count, commits_count, backfilled_at FROM repositories WHERE id = ?`).get(oldId) as any;
    db.prepare(`UPDATE repositories SET lines_count = max(lines_count, ?), files_count = max(files_count, ?), commits_count = max(commits_count, ?),
      backfilled_at = coalesce(?, backfilled_at) WHERE id = ?`).run(old.lines_count, old.files_count, old.commits_count, old.backfilled_at, newId);
    db.prepare(`DELETE FROM repositories WHERE id = ?`).run(oldId);
  } else {
    db.prepare(`UPDATE repositories SET id = ? WHERE id = ?`).run(newId, oldId);
  }
  for (const table of ["commits", "pull_requests", "pull_reviews", "deeds"]) {
    db.prepare(`UPDATE ${table} SET repo_id = ? WHERE repo_id = ?`).run(newId, oldId);
  }
  // Tables keyed on the repo: a row the new id already has wins over the old one
  for (const table of ["kingdom_layout", "user_subscriptions", "repo_emails", "project_repos"]) {
    db.prepare(`UPDATE OR IGNORE ${table} SET repo_id = ? WHERE repo_id = ?`).run(newId, oldId);
    db.prepare(`DELETE FROM ${table} WHERE repo_id = ?`).run(oldId);
  }
  db.prepare(`DELETE FROM ignored_repo_checks WHERE repo_id = ?`).run(oldId);
  console.log(`[Live Sync] ✏️ ${oldId.replace(/^repo-/, "")} is now ${newId.replace(/^repo-/, "")} in Git: its building and history moved with it.`);
}

/**
 * Instantly registers all users and repositories into SQLite so tables are populated right away
 */
export const registerReposAndUsers = db.transaction((
  users: Array<{ id: string; username: string; fullName: string; email: string; civilization: string; kingdomTitle: string; cityHallLevel: number; streakDays: number }>,
  userEmails: Array<{ email: string; userId: string }>,
  repos: Array<{ id: string; name: string; fullName: string; ownerLogin: string; defaultBranch: string; linesCount: number; filesCount: number; commitsCount: number; updatedAt: string; gitId?: number | null }>
): { newUsers: number; newRepos: number } => {
  const now = new Date().toISOString();
  let newUsers = 0;
  let newRepos = 0;

  for (const u of users) {
    if (!stmtCheckUserExists.get(u.id)) newUsers++;
    stmtUpsertUser.run(u);
    if (u.email) {
      stmtUpsertUserEmail.run(u.email.toLowerCase(), u.id.toLowerCase());
    }
    openTreasury(u.id, now);
  }
  for (const ue of userEmails) {
    if (ue.email && ue.userId) {
      stmtUpsertUserEmail.run(ue.email.toLowerCase(), ue.userId.toLowerCase());
    }
  }
  const ignored = getIgnoredRepoIds();
  for (const r of repos) {
    const fn = (r.fullName || "").toLowerCase();
    const id = (r.id || "").toLowerCase();
    if (ignored.has(id) || ignored.has(fn) || ignored.has(`repo-${fn}`)) {
      continue;
    }
    // Renamed or moved to another owner in Git: the same Git repo under a new name keeps its building and history
    if (typeof r.gitId === "number") {
      const was = stmtRepoByGitId.get(r.gitId, r.id) as { id: string } | undefined;
      if (was) renameRepository(was.id, r.id);
    }
    if (!stmtCheckRepoExists.get(r.id)) newRepos++;
    stmtUpsertRepo.run({ gitId: null, ...r });
  }
  return { newUsers, newRepos };
});

/**
 * Immediately saves a single repository's live commits, pull requests, reviews, and discovered emails
 */
export const saveLiveRepoSync = db.transaction((
  repo: {
    id: string;
    name: string;
    fullName: string;
    ownerLogin: string;
    defaultBranch: string;
    linesCount: number;
    filesCount: number;
    commitsCount: number;
    updatedAt: string;
    gitId?: number | null;
  },
  commits: Array<{
    hash: string;
    repoId: string;
    authorLogin: string | null;
    authorName: string;
    authorEmail: string;
    message: string;
    linesAdded: number;
    linesDeleted: number;
    committedAt: string;
  }>,
  pulls: Array<{
    id: number;
    repoId: string;
    authorLogin: string | null;
    title: string;
    state: string;
    mergedAt: string | null;
    createdAt: string;
  }>,
  reviews: Array<{
    id: number;
    repoId: string;
    prId: number;
    reviewerLogin: string;
    state: string;
    submittedAt: string;
  }> = [],
  userEmails: Array<{ email: string; userId: string }> = []
): { newCommits: number; newPulls: number } => {
  const ignored = getIgnoredRepoIds();
  const fn = (repo.fullName || "").toLowerCase();
  const id = (repo.id || "").toLowerCase();
  if (ignored.has(id) || ignored.has(fn) || ignored.has(`repo-${fn}`)) {
    return { newCommits: 0, newPulls: 0 };
  }
  stmtUpsertRepo.run({ gitId: null, ...repo });
  // Read in full: the next sync reads it again only once Git's updated_at moves on
  db.prepare(`UPDATE repositories SET synced_updated_at = ? WHERE id = ?`).run(repo.updatedAt, repo.id);
  let newCommits = 0;
  let newPulls = 0;

  for (const ue of userEmails) {
    if (ue.email && ue.userId) {
      stmtUpsertUserEmail.run(ue.email.toLowerCase(), ue.userId.toLowerCase());
    }
  }
  for (const c of commits) {
    if (!stmtCheckCommitExists.get(c.hash)) newCommits++;
    stmtUpsertCommit.run(c);
    if (c.authorLogin && c.authorEmail) linkCommitEmail(c.authorEmail, c.authorLogin);
  }
  for (const p of pulls) {
    if (!stmtCheckPRExists.get(p.id)) newPulls++;
    stmtUpsertPR.run(p);
  }
  for (const r of reviews) {
    stmtUpsertReview.run(r);
  }
  return { newCommits, newPulls };
});

export const saveUserSubscriptionsBatch = db.transaction((
  userSubscriptions: Array<{ userId: string; repoId: string }>
) => {
  for (const s of userSubscriptions) {
    if (s.userId && s.repoId) {
      stmtUpsertUserSubscription.run(s.userId.toLowerCase(), s.repoId);
    }
  }
});

const stmtMarkRepoBackfilled = db.prepare(`UPDATE repositories SET backfilled_at = ? WHERE id = ?`);
export function markRepoBackfilled(repoId: string, timestamp: string = new Date().toISOString()) {
  stmtMarkRepoBackfilled.run(timestamp, repoId);
}

const stmtGetUnbackfilledRepos = db.prepare(`
  SELECT id, name, full_name, owner_login, default_branch, updated_at 
  FROM repositories 
  WHERE backfilled_at IS NULL 
    AND id NOT IN (SELECT id FROM ignored_repositories)
    AND full_name NOT IN (SELECT full_name FROM ignored_repositories)
  ORDER BY updated_at DESC
`);
export function getUnbackfilledRepos() {
  return stmtGetUnbackfilledRepos.all() as Array<{
    id: string;
    name: string;
    full_name: string;
    owner_login: string;
    default_branch: string;
    updated_at: string;
  }>;
}

const stmtResetAllRepoBackfills = db.prepare(`UPDATE repositories SET backfilled_at = NULL`);
export function resetAllRepoBackfills() {
  return stmtResetAllRepoBackfills.run();
}

const stmtGetBackfillProgress = db.prepare(`
  SELECT 
    count(*) as total, 
    sum(case when backfilled_at is not null then 1 else 0 end) as backfilled,
    (select count(*) from commits where repo_id not in (select id from ignored_repositories)) as totalCommits
  FROM repositories
  WHERE id NOT IN (SELECT id FROM ignored_repositories)
    AND full_name NOT IN (SELECT full_name FROM ignored_repositories)
`);
export function getBackfillProgress() {
  const res = stmtGetBackfillProgress.get() as { total: number; backfilled: number | null; totalCommits: number };
  const total = res.total || 0;
  const backfilled = res.backfilled || 0;
  return {
    total,
    backfilled,
    totalCommits: res.totalCommits || 0,
    percent: total > 0 ? Math.round((backfilled / total) * 100) : 100
  };
}

export const saveBackfilledRepoCommits = db.transaction((
  repoId: string,
  commits: Array<{
    hash: string;
    repoId: string;
    authorLogin: string | null;
    authorName: string;
    authorEmail: string;
    message: string;
    linesAdded: number;
    linesDeleted: number;
    committedAt: string;
  }>,
  userEmails: Array<{ email: string; userId: string }> = []
): { newCommits: number } => {
  // Renamed in Git while the backfill read it: the sync moved the repo to its new name, whose own backfill brings these
  if (!stmtCheckRepoExists.get(repoId)) return { newCommits: 0 };
  let lines = 0;
  let newCommits = 0;
  for (const c of commits) {
    if (!stmtCheckCommitExists.get(c.hash)) newCommits++;
    stmtUpsertCommit.run(c);
    lines += (c.linesAdded + c.linesDeleted);
    if (c.authorLogin && c.authorEmail) linkCommitEmail(c.authorEmail, c.authorLogin);
  }
  for (const ue of userEmails) {
    if (ue.email && ue.userId) {
      stmtUpsertUserEmail.run(ue.email.toLowerCase(), ue.userId.toLowerCase());
    }
  }
  db.prepare(`
    UPDATE repositories 
    SET lines_count = max(lines_count, ?), 
        commits_count = max(commits_count, ?), 
        backfilled_at = datetime('now') 
    WHERE id = ?
  `).run(lines, commits.length, repoId);
  return { newCommits };
});

export function setCivilization(userId: string, civ: CivilizationType) {
  stmtUpdateCivilization.run(civ, userId);
}

/**
 * Execute 15-Minute Resource Allocation with full accounting ledger:
 * Pool:
 *   Gold: 1,000
 *   Iron: 25,000
 *   Lumber: 100,000
 *   Food: 250,000
 * Plus 5th Randomized Scarce Resource (Mana 2.5k, Diamond 100, Ruby 100, Emerald 100, Sapphire 100, Mithril 300, etc.)
 * Every developer is GUARANTEED a minimum of 1 unit of the scarce resource!
 * The remaining scarce pool is weighted by weekly Git score, with round-robin remainder distribution.
 */
export function executeResourceAllocation(kingdoms: DeveloperKingdom[]) {
  if (kingdoms.length === 0) return null;

  const specialSet = new Set(config.specialUsers.map((s) => s.toLowerCase()));
  const harvestKingdoms = kingdoms.filter(
    (k) => !specialSet.has(k.username?.toLowerCase() ?? "") && !specialSet.has(k.id?.toLowerCase() ?? "")
  );

  if (harvestKingdoms.length === 0) return null;

  // ⛈️ Punished kingdoms (GAME_GUIDE §15) get nothing from the pool, their buildings or their workforce;
  // their people still live (births and deaths, with the punishment's multipliers) and their soldiers still eat
  const punishments = activePunishmentsByUser();
  // 🎉 A Festival doubles births and livens up the workforce for its day
  const festivals = festivalUserIds();
  // 🌪️ A world disaster in force: the Great Blight, Wasting Plague and Barren Spell change this harvest (GAME_GUIDE §10)
  const disaster = disasterAt();
  const poolKingdoms = harvestKingdoms.filter((k) => !punishments.has(k.id));
  const poolCount = Math.max(1, poolKingdoms.length);

  const POOL = {
    gold: 1000,
    iron: 25000,
    stone: 50000,
    lumber: 100000,
    food: 250000
  };

  // 1. Pick 1 random Scarce Resource from the loot table: by day the sun gems are GEM_TILT× as likely, by night the
  // moon gems; at night the drop pool is bigger and the base harvest smaller (GAME_GUIDE §7 Day, night & seasons)
  // The window this harvest closes: harvest windows alternate day / night (a realm day is two harvests)
  const daytime = DAY_PART_EFFECTS[dayPartOfWindow(countHarvests())];
  const gemOdds = DROPPED_GEMS.map((g) => (daytime.favoured.includes(g.key) ? GEM_TILT : 1));
  let gemRoll = Math.random() * gemOdds.reduce((a, b) => a + b, 0);
  const scarceDef = DROPPED_GEMS.find((_, i) => (gemRoll -= gemOdds[i]) < 0) ?? DROPPED_GEMS[DROPPED_GEMS.length - 1];
  const scarcePoolSize = poolKingdoms.length > 0 ? Math.max(Math.round(scarceDef.pool * daytime.scarcePool), poolKingdoms.length) : 0;

  // 2. Calculate weekly activity weights
  const weights = harvestKingdoms.map((k) => {
    const commits = k.activity.pastWeekCommits;
    const prs = k.activity.pastWeekPRs;
    // Weight = 10 × √(past-week contribution XP score) + 1 (commits w/ diminishing returns, merged PRs, reviews):
    // sub-linear so one heavy week can't take the pool; base weight 1 so even peaceful kingdoms receive their share.
    const weight = harvestWeight(k.activity.weightedScore);
    return { kingdomId: k.id, weight, commits, prs };
  });

  const inPool = (kingdomId: string) => !punishments.has(kingdomId);
  const poolWeights = weights.filter((w) => inPool(w.kingdomId));
  // Each kingdom's share of a pool's distributable part, capped so minimum + share stays within HARVEST_SHARE_CAP of the pool
  const sharesOf = (weightOf: (w: (typeof weights)[number]) => number, pool: number, minimum: number) => {
    const distributable = pool - minimum * poolWeights.length;
    const maxShare = distributable > 0 ? (HARVEST_SHARE_CAP * pool - minimum) / distributable : 1;
    const raw = poolWeights.map(weightOf);
    const total = raw.reduce((sum, v) => sum + v, 0);
    const shares = cappedShares(raw, maxShare);
    // Remember who hit the cap, for the ledger line
    shares.forEach((s, i) => s < raw[i] / total - 1e-9 && cappedKingdoms.add(poolWeights[i].kingdomId));
    return new Map(poolWeights.map((w, i) => [w.kingdomId, shares[i]]));
  };
  const cappedKingdoms = new Set<string>();

  // 3. Base Resource Allocation:
  // GUARANTEE: Every developer kingdom receives a guaranteed MINIMUM (NO ONE receives 0 count!)
  //   Gold: minimum 1
  //   Iron: minimum 50
  //   Stone: minimum 100
  //   Lumber: minimum 200
  //   Food: minimum 500
  const MIN_BASE = {
    gold: 1,
    iron: Math.min(50, Math.floor(POOL.iron / (poolCount * 2))),
    stone: Math.min(100, Math.floor(POOL.stone / (poolCount * 2))),
    lumber: Math.min(200, Math.floor(POOL.lumber / (poolCount * 2))),
    food: Math.min(500, Math.floor(POOL.food / (poolCount * 2)))
  };

  const allocation: Record<string, { gold: number; iron: number; stone: number; lumber: number; food: number }> = {};
  for (const k of harvestKingdoms) {
    allocation[k.id] = inPool(k.id)
      ? { gold: MIN_BASE.gold, iron: MIN_BASE.iron, stone: MIN_BASE.stone, lumber: MIN_BASE.lumber, food: MIN_BASE.food }
      : { gold: 0, iron: 0, stone: 0, lumber: 0, food: 0 };
  }

  // The remaining pool is distributed proportionally based on weekly Git activity
  const distributable = {
    gold: Math.max(0, POOL.gold - (MIN_BASE.gold * poolKingdoms.length)),
    iron: Math.max(0, POOL.iron - (MIN_BASE.iron * poolKingdoms.length)),
    stone: Math.max(0, POOL.stone - (MIN_BASE.stone * poolKingdoms.length)),
    lumber: Math.max(0, POOL.lumber - (MIN_BASE.lumber * poolKingdoms.length)),
    food: Math.max(0, POOL.food - (MIN_BASE.food * poolKingdoms.length))
  };

  for (const resKey of ["gold", "iron", "stone", "lumber", "food"] as const) {
    for (const [kingdomId, share] of sharesOf((w) => w.weight, POOL[resKey], MIN_BASE[resKey])) {
      allocation[kingdomId][resKey] += Math.floor(distributable[resKey] * share);
    }
  }

  // 4. Scarce Resource Allocation:
  // GUARANTEE: Every kingdom gets a MINIMUM of 1 (even with 0 activity)
  const scarceAlloc: Record<string, number> = {};
  for (const k of harvestKingdoms) {
    scarceAlloc[k.id] = inPool(k.id) ? 1 : 0;
  }

  // The remaining pool (scarcePoolSize - poolKingdoms.length) is distributed weighted by Git activity
  const distributableScarce = Math.max(0, scarcePoolSize - poolKingdoms.length);
  // Active Surge doubles a kingdom's chance at the gems (GAME_GUIDE §7)
  const gemWeight = (w: (typeof weights)[number]) => w.weight * (surgingCount(harvestKingdoms.find((k) => k.id === w.kingdomId)) > 0 ? ACTIVE_SURGE_GEM_MULT : 1);
  for (const [kingdomId, share] of sharesOf(gemWeight, scarcePoolSize, 1)) {
    scarceAlloc[kingdomId] += Math.floor(distributableScarce * share);
  }

  // 5. Round-robin distribution of remainder units (both standard & scarce)
  const lastRR = stmtGetLastRRIndex.get() as { round_robin_index?: number } | undefined;
  let rrIndex = (lastRR?.round_robin_index ?? 0) % poolCount;

  for (const resKey of ["gold", "iron", "stone", "lumber", "food"] as const) {
    const allocatedSum = Object.values(allocation).reduce((sum, a) => sum + a[resKey], 0);
    let remainder = poolKingdoms.length > 0 ? POOL[resKey] - allocatedSum : 0;
    let idx = rrIndex;
    while (remainder > 0) {
      const kId = poolKingdoms[idx % poolKingdoms.length].id;
      allocation[kId][resKey] += 1;
      remainder--;
      idx++;
    }
  }

  // Round-robin distribution of scarce remainder
  const allocatedScarceSum = Object.values(scarceAlloc).reduce((sum, v) => sum + v, 0);
  let scarceRemainder = scarcePoolSize - allocatedScarceSum;
  let sIdx = rrIndex;
  while (scarceRemainder > 0) {
    const kId = poolKingdoms[sIdx % poolKingdoms.length].id;
    scarceAlloc[kId] += 1;
    scarceRemainder--;
    sIdx++;
  }

  rrIndex = (rrIndex + 1) % poolCount;
  const now = new Date().toISOString();

  // Building harvest by level; repos in Active Surge (commit/merged PR in 48 h) yield double
  const BASE_KEYS = ["gold", "iron", "stone", "lumber", "food"] as const;
  const buildingYields = new Map<string, Record<(typeof BASE_KEYS)[number], number>>();
  for (const k of harvestKingdoms) {
    const y = { gold: 0, iron: 0, stone: 0, lumber: 0, food: 0 };
    if (!inPool(k.id)) {
      buildingYields.set(k.id, y);
      continue;
    }
    for (const b of k.buildings ?? []) {
      const mult = b.surging ? ACTIVE_SURGE_YIELD_MULT : 1;
      for (const key of BASE_KEYS) y[key] += b.level * BUILDING_YIELD_PER_LEVEL[key] * mult;
    }
    for (const key of BASE_KEYS) y[key] = Math.floor(y[key]);
    buildingYields.set(k.id, y);
  }
  // Harvest-bonus titles pay on at most HARVEST_BONUS_CAP_MULT × the realm's average harvest (pool share + buildings)
  const bonusCap = Object.fromEntries(
    BASE_KEYS.map((key) => {
      const total = poolKingdoms.reduce((sum, k) => sum + allocation[k.id][key] + buildingYields.get(k.id)![key], 0);
      return [key, (total / poolCount) * HARVEST_BONUS_CAP_MULT];
    })
  ) as Record<(typeof BASE_KEYS)[number], number>;

  // 6. Commit allocation and write individual ledger transaction entries in a single SQLite transaction
  const applyTx = db.transaction(() => {
    for (const w of weights) {
      const userId = w.kingdomId;
      stmtEnsureResources.run(userId);
      const kingdom = harvestKingdoms.find((k) => k.id === userId);
      const deltas = allocation[userId];
      const cur = (stmtGetResources.get(userId) as { gold: number; iron: number; stone: number; lumber: number; food: number } | undefined) || {
        gold: 0,
        iron: 0,
        stone: 0,
        lumber: 0,
        food: 0
      };

      // 🌾 Great Blight: the pool pays nothing (half to the civ that copes); the civ that suffers loses half its buildings too
      const civ = kingdom?.civilization || "human";
      const poolKept = blightPoolMult(disaster, civ);
      const buildingKept = blightBuildingMult(disaster, civ);
      let blighted = 0;
      if (poolKept < 1) {
        for (const key of BASE_KEYS) {
          const kept = Math.floor(deltas[key] * poolKept);
          blighted += deltas[key] - kept;
          deltas[key] = kept;
        }
      }

      // 1. Building harvest by level (worked out above)
      const activeRepoCount = surgingCount(kingdom);
      const buildingYield = buildingYields.get(userId) ?? { gold: 0, iron: 0, stone: 0, lumber: 0, food: 0 };
      for (const key of BASE_KEYS) {
        const kept = Math.floor(buildingYield[key] * buildingKept);
        blighted += buildingYield[key] - kept;
        deltas[key] += kept;
      }
      tallyDisaster(disaster, civ, "withheld", blighted);
      // Night (×0.85) and the season (±10% for the buffed / debuffed civ) scale pool share, buildings and workforce
      const season = seasonEffects(kingdom?.civilization || "human");
      const harvestMult = daytime.harvest * season.harvest;
      if (harvestMult !== 1) for (const key of BASE_KEYS) deltas[key] = Math.round(deltas[key] * harvestMult);

      // Harvest-bonus title (Game Activity): +X% of this harvest's pool share and buildings, capped
      const bonusPct = kingdom?.titleBuffs?.harvestBonus ?? 0;
      const titleBonus = { gold: 0, iron: 0, stone: 0, lumber: 0, food: 0 };
      if (bonusPct > 0) {
        for (const key of BASE_KEYS) titleBonus[key] = Math.floor(bonusPct * Math.min(deltas[key], bonusCap[key]));
      }

      // 2. Demographic Simulation & Soldier Upkeep & Civilian Harvest
      const userRow = db.prepare(`SELECT population, soldiers, city_hall_level, void_well FROM users WHERE id = ?`).get(userId) as any;
      const cityHallLvl = kingdom?.cityHallLevel || userRow?.city_hall_level || 1;
      // Only a kingdom never settled (no population yet) starts from genesis: one wiped out to 0 is still at 0
      const curPop = userRow?.population ?? calculateGenesisPopulation(cityHallLvl, civ);
      const curSoldiers = userRow?.soldiers || 0;
      const punishment = punishments.get(userId);

      const demo = simulateDemographicCycle({
        currentPop: curPop,
        currentSoldiers: curSoldiers,
        // Civilians away gathering neither work nor die of age, like soldiers away
        // …and so do elf soldiers healing at the Moonwell (they keep their place in the population)
        deployedSoldiers: getDeployedSoldiers(userId) + getAwayCivilians(userId) + getWoundedSoldiers(userId),
        stationedSoldiers: getStationedSoldiers(userId),
        voidWell: userRow?.void_well ?? 0,
        cityHallLevel: cityHallLvl,
        civilization: civ,
        availableFood: cur.food + deltas.food,
        // Royal Gardens: more births, fewer famine deserters; a punishment can cut births and raise deaths
        // …and the season adds or takes 10% of the births for the buffed / debuffed civ
        birthMult:
          improvementEffects(kingdom?.upgrades ?? getKingdomUpgrades(userId)).birthMult *
          (punishment?.lowBirth ? PUNISH_BIRTH_MULT : 1) *
          season.births *
          (festivals.has(userId) ? FESTIVAL.BIRTH_MULT : 1) *
          barrenBirthMult(disaster, civ),
        famineMult: improvementEffects(kingdom?.upgrades ?? getKingdomUpgrades(userId)).famineMult,
        deathMult: punishment?.highDeath ? PUNISH_DEATH_MULT : 1,
        plagueRate: plagueRate(disaster, civ),
        respawnMult: barrenVoidWellMult(disaster, civ)
      });
      tallyDisaster(disaster, civ, "plague", demo.plagueDeaths);
      if (disaster?.kind === "barren") {
        // What the spell cost: births at the multiplier vs. without it (and fallen the Void Well held back)
        const mult = barrenBirthMult(disaster, civ);
        if (mult > 0 && mult < 1) tallyDisaster(disaster, civ, "births", Math.round(demo.births / mult) - demo.births);
        if (barrenVoidWellMult(disaster, civ) < 1) tallyDisaster(disaster, civ, "void_well", Math.max(0, Math.round(demo.respawned / barrenVoidWellMult(disaster, civ)) - demo.respawned));
      }
      // Punished: the workforce brings nothing in (soldiers still eat)
      if (punishment) for (const key of Object.keys(demo.civilianYield) as Array<keyof typeof demo.civilianYield>) demo.civilianYield[key] = 0;
      else if (harvestMult !== 1) for (const key of BASE_KEYS) demo.civilianYield[key] = Math.round(demo.civilianYield[key] * harvestMult);
      if (!punishment && festivals.has(userId)) for (const key of BASE_KEYS) demo.civilianYield[key] = Math.round(demo.civilianYield[key] * FESTIVAL.YIELD_MULT);

      // Apply civilian bonus yields & soldier upkeep
      deltas.gold += demo.civilianYield.gold;
      deltas.iron += demo.civilianYield.iron;
      deltas.stone += demo.civilianYield.stone;
      deltas.lumber += demo.civilianYield.lumber;
      deltas.food += demo.civilianYield.food - demo.foodUpkeep;

      // Update users table with new population & soldiers
      db.prepare(`UPDATE users SET population = ?, soldiers = ?, void_well = MAX(0, void_well - ?) WHERE id = ?`).run(
        demo.newPopulation,
        demo.newSoldiers,
        demo.respawned,
        userId
      );

      // 🌙 Elves' wounded: a few rejoin the garrison at every harvest
      const healed = healWoundedAtHarvest(userId);

      // Record in POPULATION LEDGER!
      recordPopulationLedger({
        userId,
        timestamp: now,
        type: "harvest_growth",
        births: demo.births,
        deaths: demo.deaths,
        soldiersDelta: demo.respawned - demo.desertedSoldiers + healed,
        populationDelta: demo.births + demo.respawned - demo.deaths,
        populationBalance: demo.newPopulation,
        soldiersBalance: demo.newSoldiers + healed + soldiersAwayOf(userId),
        reason: `15m Harvest: +${demo.births} births, -${demo.deaths} deaths${demo.plagueDeaths ? ` (☠️ ${demo.plagueDeaths} to the Wasting Plague)` : ""}${disaster?.kind === "barren" ? " [🥀 Barren Spell]" : ""}${demo.respawned ? `, +${demo.respawned} back from the Void Well` : ""}${healed ? `, 🌙 +${healed} healed at the Moonwell` : ""}${demo.famine ? ` (Famine: -${demo.desertedSoldiers} deserted)` : ""}${activeRepoCount > 0 ? ` [${activeRepoCount} repos in Active Surge]` : ""}`
      });

      let newGold = cur.gold + deltas.gold;
      let newIron = cur.iron + deltas.iron;
      let newStone = cur.stone + deltas.stone;
      let newLumber = cur.lumber + deltas.lumber;
      let newFood = Math.max(0, cur.food + deltas.food);

      stmtSetResources.run({
        userId,
        gold: newGold + titleBonus.gold,
        iron: newIron + titleBonus.iron,
        stone: newStone + titleBonus.stone,
        lumber: newLumber + titleBonus.lumber,
        food: newFood + titleBonus.food
      });

      // Update scarce resource balance in SQLite
      const scarceDelta = scarceAlloc[userId];
      const curScarceRow = stmtGetScarce.get(userId, scarceDef.key) as { amount: number } | undefined;
      const oldScarce = curScarceRow?.amount ?? 0;
      const newScarce = oldScarce + scarceDelta;
      stmtSetScarce.run(userId, scarceDef.key, newScarce);

      stmtInsertLedger.run({
        userId,
        timestamp: now,
        type: "harvest_allocation",
        goldDelta: deltas.gold,
        ironDelta: deltas.iron,
        stoneDelta: deltas.stone,
        lumberDelta: deltas.lumber,
        foodDelta: newFood - cur.food,
        goldBalance: newGold,
        ironBalance: newIron,
        stoneBalance: newStone,
        lumberBalance: newLumber,
        foodBalance: newFood,
        scarceKey: scarceDef.key,
        scarceDelta,
        scarceBalance: newScarce,
        reason: `${punishment ? "⛈️ Punished — no harvest. " : ""}${!punishment && (poolKept < 1 || buildingKept < 1) ? `${DISASTERS.blight.emblem} Great Blight: pool ×${poolKept}${buildingKept < 1 ? `, buildings ×${buildingKept}` : ""}. ` : ""}15m Harvest (Weight: ${w.weight}${cappedKingdoms.has(userId) ? `, capped at ${Math.round(HARVEST_SHARE_CAP * 100)}% of the pool` : ""})${daytime.harvest !== 1 ? ` ${daytime.emblem} ${daytime.name} ×${daytime.harvest}` : ""}${season.sign !== 0 ? ` [Season ${season.sign > 0 ? "▲" : "▼"} ×${season.harvest}]` : ""} + Pop: ${demo.newPopulation} (+${demo.births}/-${demo.deaths})${demo.foodUpkeep > 0 ? ` [Upkeep: -${demo.foodUpkeep.toLocaleString()} food]` : ""}${demo.famine ? " [Famine!]" : ""} + Drop: ${scarceDef.emblem} ${scarceDef.name} (+${scarceDelta})`
      });

      // The title bonus gets its own ledger line so the ruler sees what it paid
      if (BASE_KEYS.some((key) => titleBonus[key] > 0)) {
        newGold += titleBonus.gold;
        newIron += titleBonus.iron;
        newStone += titleBonus.stone;
        newLumber += titleBonus.lumber;
        newFood += titleBonus.food;
        const title = kingdom?.earnedTitles?.find((t) => t.buffType === "harvest");
        stmtInsertLedger.run({
          userId,
          timestamp: now,
          type: "title_harvest_bonus",
          goldDelta: titleBonus.gold,
          ironDelta: titleBonus.iron,
          stoneDelta: titleBonus.stone,
          lumberDelta: titleBonus.lumber,
          foodDelta: titleBonus.food,
          goldBalance: newGold,
          ironBalance: newIron,
          stoneBalance: newStone,
          lumberBalance: newLumber,
          foodBalance: newFood,
          scarceKey: null,
          scarceDelta: 0,
          scarceBalance: 0,
          reason: `${title ? `${title.emblem} ${title.name}` : "Title"}: +${Math.round(bonusPct * 100)}% harvest bonus`
        });
      }

      // Civilians that gather mana and gems (elves): mana, and more of this harvest's scarce drop
      const civScarce: Array<[string, number]> = [
        ["mana", demo.civilianYield.mana],
        [scarceDef.key, demo.civilianYield.gems]
      ];
      for (const [key, amount] of civScarce) {
        if (amount <= 0) continue;
        const balance = ((stmtGetScarce.get(userId, key) as { amount: number } | undefined)?.amount ?? 0) + amount;
        stmtSetScarce.run(userId, key, balance);
        stmtInsertLedger.run({
          userId,
          timestamp: now,
          type: "civilian_yield",
          goldDelta: 0,
          ironDelta: 0,
          stoneDelta: 0,
          lumberDelta: 0,
          foodDelta: 0,
          goldBalance: newGold,
          ironBalance: newIron,
          stoneBalance: newStone,
          lumberBalance: newLumber,
          foodBalance: newFood,
          scarceKey: key,
          scarceDelta: amount,
          scarceBalance: balance,
          reason: `Civilians gathered ${amount} ${key}`
        });
      }
    }

    stmtLogAllocation.run(
      now,
      POOL.gold,
      POOL.iron,
      POOL.stone,
      POOL.lumber,
      POOL.food,
      rrIndex,
      JSON.stringify({ ...allocation, _scarce: { key: scarceDef.key, alloc: scarceAlloc } })
    );
  });

  applyTx();

  // 7. Update in-memory resources of kingdoms (skipping special users so default abundant resources are preserved)
  for (const k of kingdoms) {
    if (specialSet.has(k.username?.toLowerCase() ?? "") || specialSet.has(k.id?.toLowerCase() ?? "")) {
      continue;
    }
    const updated = stmtGetResources.get(k.id) as { gold: number; iron: number; stone: number; lumber: number; food: number } | undefined;
    const allScarce = (stmtGetUserAllScarce.all(k.id) as Array<{ resource_key: string; amount: number }>)
      .reduce((acc, row) => {
        acc[row.resource_key] = row.amount;
        return acc;
      }, {} as Record<string, number>);

    if (updated) {
      k.resources = {
        gold: updated.gold,
        iron: updated.iron,
        stone: updated.stone,
        lumber: updated.lumber,
        food: updated.food,
        scarce: allScarce
      };
    }

    const userRow = db.prepare(`SELECT population, soldiers, max_population FROM users WHERE id = ?`).get(k.id) as any;
    if (userRow) {
      k.population = userRow.population;
      k.soldiers = userRow.soldiers;
      k.maxPopulation = userRow.max_population;
    }
    k.deployedSoldiers = getDeployedSoldiers(k.id);
    k.civiliansAway = getAwayCivilians(k.id);
    k.wounded = woundedFields(k.id).wounded;
  }

  return { pool: POOL, scarceDef, scarceAlloc, allocation };
}

/**
 * Fetch all kingdoms directly from SQLite, linking repositories and commits
 */
/** Cached milestone titles of every ruler (computed by titles.ts), strongest category first */
export function getEarnedTitlesByUser(userId?: string): Map<string, EarnedTitle[]> {
  const order = `ORDER BY buff_pct DESC, tier DESC, category`;
  const rows = (
    userId
      ? db.prepare(`SELECT * FROM user_earned_titles WHERE user_id = ? ${order}`).all(userId)
      : db.prepare(`SELECT * FROM user_earned_titles ${order}`).all()
  ) as Array<{ user_id: string; category: string; tier: number; title_name: string; emblem: string; buff_type: string; buff_pct: number; unlocked_at: string }>;
  const out = new Map<string, EarnedTitle[]>();
  for (const r of rows) {
    const list = out.get(r.user_id) ?? [];
    list.push({
      category: r.category as TitleCategory,
      tier: r.tier,
      name: r.title_name,
      emblem: r.emblem,
      buffType: r.buff_type as TitleBuffType,
      buffPct: r.buff_pct,
      unlockedAt: r.unlocked_at
    });
    out.set(r.user_id, list);
  }
  return out;
}

/** One ruler's cached titles, strongest first */
export function getUserTitles(userId: string): EarnedTitle[] {
  return getEarnedTitlesByUser(userId).get(userId) ?? [];
}

/** Sums title buffs across categories (additive); `all` adds to HP, ATK and DEF */
export function titleBuffsOf(titles: EarnedTitle[]): TitleBuffs {
  const buffs = { hpBonus: 0, atkBonus: 0, defBonus: 0, harvestBonus: 0 };
  for (const t of titles) {
    if (t.buffType === "hp" || t.buffType === "all") buffs.hpBonus += t.buffPct;
    if (t.buffType === "atk" || t.buffType === "all") buffs.atkBonus += t.buffPct;
    if (t.buffType === "def" || t.buffType === "all") buffs.defBonus += t.buffPct;
    if (t.buffType === "harvest") buffs.harvestBonus += t.buffPct;
  }
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const out: TitleBuffs = { hpBonus: round(buffs.hpBonus), atkBonus: round(buffs.atkBonus), defBonus: round(buffs.defBonus) };
  if (buffs.harvestBonus > 0) out.harvestBonus = round(buffs.harvestBonus);
  return out;
}

const stmtRecordPlayerAction = db.prepare(`
  INSERT INTO player_activity (user_id, day, actions) VALUES (?, ?, 1)
  ON CONFLICT(user_id, day) DO UPDATE SET actions = actions + 1
`);
const stmtPlayDays = db.prepare(`SELECT user_id, day FROM player_activity WHERE actions >= ?`);

/** Counts one game action by the signed-in ruler towards today's play day */
export function recordPlayerAction(userId: string, now = new Date()) {
  stmtRecordPlayerAction.run(userId.toLowerCase(), now.toISOString().slice(0, 10));
}

/** Play days (UTC days with at least PLAY_DAY_MIN_ACTIONS game actions) and the current play streak per ruler */
export function playStatsByUser(now = new Date()): Map<string, { days: number; streak: number }> {
  const daysByUser = new Map<string, Set<string>>();
  for (const r of stmtPlayDays.all(PLAY_DAY_MIN_ACTIONS) as Array<{ user_id: string; day: string }>) {
    if (!daysByUser.has(r.user_id)) daysByUser.set(r.user_id, new Set());
    daysByUser.get(r.user_id)!.add(r.day);
  }
  const out = new Map<string, { days: number; streak: number }>();
  for (const [userId, days] of daysByUser) out.set(userId, { days: days.size, streak: playStreakFrom(days, now) });
  return out;
}

/** Set when a realm build changed some ruler's Repo Holdings or Legendary Buildings count, so their titles need a re-check */
let repoHoldingsChanged = false;
export function consumeRepoHoldingsChanged(): boolean {
  const changed = repoHoldingsChanged;
  repoHoldingsChanged = false;
  return changed;
}

/* ------------------------------------------------------------------------- */
/* Royal Decrees: shields and punishments (granted in decrees.ts)             */
/* ------------------------------------------------------------------------- */

/** ⛈️ Punished with Low birth rate: births ×0.25 (GAME_GUIDE §15) */
export const PUNISH_BIRTH_MULT = 0.25;
/** ⛈️ Punished with High death rate: civilian deaths ×3 */
export const PUNISH_DEATH_MULT = 3;

const rowToShield = (r: any): RoyalShield => ({ startsAt: r.starts_at, endsAt: r.ends_at, breaksOnAttack: Boolean(r.breaks_on_attack), grantedBy: r.granted_by });
const rowToPunishment = (r: any): RoyalPunishment => ({
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  lowBirth: Boolean(r.low_birth),
  highDeath: Boolean(r.high_death),
  grantedBy: r.granted_by
});

/** The kingdom's Royal Shield, if one is up right now */
export function getActiveShield(userId: string, now = Date.now()): RoyalShield | null {
  const r = db.prepare(`SELECT * FROM kingdom_shields WHERE user_id = ? AND ends_at > ? AND starts_at <= ?`).get(userId, now, now);
  return r ? rowToShield(r) : null;
}

/** The kingdom's Royal Punishment, if one lasts right now */
export function getActivePunishment(userId: string, now = Date.now()): RoyalPunishment | null {
  const r = db.prepare(`SELECT * FROM kingdom_punishments WHERE user_id = ? AND ends_at > ? AND starts_at <= ?`).get(userId, now, now);
  return r ? rowToPunishment(r) : null;
}

export function activeShieldsByUser(now = Date.now()): Map<string, RoyalShield> {
  const rows = db.prepare(`SELECT * FROM kingdom_shields WHERE ends_at > ? AND starts_at <= ?`).all(now, now) as any[];
  return new Map(rows.map((r) => [r.user_id as string, rowToShield(r)]));
}

export function activePunishmentsByUser(now = Date.now()): Map<string, RoyalPunishment> {
  const rows = db.prepare(`SELECT * FROM kingdom_punishments WHERE ends_at > ? AND starts_at <= ?`).all(now, now) as any[];
  return new Map(rows.map((r) => [r.user_id as string, rowToPunishment(r)]));
}

/* ------------------------------------------------------------------------- */
/* 📜 Royal Proclamations: Paid Settlers, Festival, ⚔️ Call to Arms            */
/* ------------------------------------------------------------------------- */

const NO_PROCLAMATIONS: ProclamationState = { settlersReadyAt: 0, festivalEndsAt: 0, festivalReadyAt: 0, callToArmsUntil: 0 };
const rowToProclamations = (r: any): ProclamationState => ({
  settlersReadyAt: r.settlers_at ? r.settlers_at + SETTLERS.COOLDOWN_MS : 0,
  festivalEndsAt: r.festival_at ? r.festival_at + FESTIVAL.DURATION_MS : 0,
  festivalReadyAt: r.festival_at ? r.festival_at + FESTIVAL.COOLDOWN_MS : 0,
  callToArmsUntil: r.call_to_arms_at ? r.call_to_arms_at + CALL_TO_ARMS_MS : 0
});

/** A Festival given by decree runs until its own end; the kingdom's Festival ends with whichever lasts longer */
const withRoyalFestival = (st: ProclamationState, royalEndsAt: number | undefined): ProclamationState =>
  royalEndsAt && royalEndsAt > st.festivalEndsAt ? { ...st, festivalEndsAt: royalEndsAt } : st;

export function getProclamationState(userId: string): ProclamationState {
  const r = db.prepare(`SELECT * FROM proclamations WHERE user_id = ?`).get(userId);
  const royal = db.prepare(`SELECT ends_at FROM royal_festivals WHERE user_id = ?`).get(userId) as { ends_at: number } | undefined;
  return withRoyalFestival(r ? rowToProclamations(r) : { ...NO_PROCLAMATIONS }, royal?.ends_at);
}

export function proclamationStatesByUser(): Map<string, ProclamationState> {
  const rows = db.prepare(`SELECT * FROM proclamations`).all() as any[];
  const out = new Map(rows.map((r) => [r.user_id as string, rowToProclamations(r)]));
  for (const r of db.prepare(`SELECT user_id, ends_at FROM royal_festivals`).all() as Array<{ user_id: string; ends_at: number }>) {
    out.set(r.user_id, withRoyalFestival(out.get(r.user_id) ?? { ...NO_PROCLAMATIONS }, r.ends_at));
  }
  return out;
}

/** Kingdoms holding a Festival right now (their own or one given by decree) */
export function festivalUserIds(now = Date.now()): Set<string> {
  const own = db.prepare(`SELECT user_id FROM proclamations WHERE festival_at > 0 AND festival_at + ? > ?`).all(FESTIVAL.DURATION_MS, now) as Array<{ user_id: string }>;
  const royal = db.prepare(`SELECT user_id FROM royal_festivals WHERE starts_at <= ? AND ends_at > ?`).all(now, now) as Array<{ user_id: string }>;
  return new Set([...own, ...royal].map((r) => r.user_id));
}

/** ⚔️ Call to Arms: the ruler just marched on another ruler's city or a frontier gate (refreshes the hour) */
export function markCallToArms(userId: string, now = Date.now()) {
  db.prepare(`
    INSERT INTO proclamations (user_id, call_to_arms_at) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET call_to_arms_at = excluded.call_to_arms_at
  `).run(userId, now);
}

/** Proclamations are for mortal kingdoms: Nethergarde summons, Special Overseers respawn to full */
export function proclamationRuler(userId: string): { civilization: string; population: number; max_population: number; soldiers: number; city_hall_level: number } {
  const user = db.prepare(`SELECT civilization, population, max_population, soldiers, city_hall_level FROM users WHERE id = ?`).get(userId) as any;
  if (!user) throw new Error("Kingdom not found");
  if (user.civilization === "arcane") throw new Error("Nethergarde doesn't hold Royal Proclamations: it grows by the void ritual.");
  if (isSpecialUserId(userId)) throw new Error("Special Overseers' people return in full every harvest.");
  return user;
}

const waitLabel = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
};

/** 🏘️ Paid Settlers: refill the kingdom up to SETTLERS.MAX_FILL of its capacity, as many as the treasury pays for */
export const callSettlers = db.transaction((userId: string, now = Date.now()): { settlers: number; population: number } => {
  const user = proclamationRuler(userId);
  const state = getProclamationState(userId);
  if (state.settlersReadyAt > now) throw new Error(`Settlers were called recently: they answer again in ${waitLabel(state.settlersReadyAt - now)}.`);
  const pop = user.population ?? 0;
  const line = Math.floor((user.max_population ?? pop) * SETTLERS.MAX_FILL);
  if (pop >= line) throw new Error(`Settlers only come to a kingdom below ${Math.round(SETTLERS.MAX_FILL * 100)}% of its capacity (${line.toLocaleString()} people).`);
  const res = getKingdomResources(userId);
  const affordable = Math.min(...(Object.entries(SETTLERS.COST) as Array<[keyof Cost, number]>).map(([k, v]) => Math.floor((res[k] ?? 0) / v)));
  const settlers = Math.min(line - pop, affordable);
  if (settlers <= 0) throw new Error(`Not enough to pay a single settler (${SETTLERS.COST.food} food + ${SETTLERS.COST.gold} gold each).`);

  spendResources(userId, scaleCost(SETTLERS.COST, settlers), "settlers", `🏘️ Paid Settlers: ${settlers} newcomers`);
  db.prepare(`UPDATE users SET population = ? WHERE id = ?`).run(pop + settlers, userId);
  db.prepare(`
    INSERT INTO proclamations (user_id, settlers_at) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET settlers_at = excluded.settlers_at
  `).run(userId, now);
  recordPopulationLedger({
    userId,
    type: "settlers",
    births: settlers,
    populationDelta: settlers,
    populationBalance: pop + settlers,
    soldiersBalance: (user.soldiers ?? 0) + soldiersAwayOf(userId),
    reason: `🏘️ Paid Settlers: ${settlers} newcomers settled`
  });
  return { settlers, population: pop + settlers };
});

/** 🎉 Festival: a day of births ×2 and a livelier workforce, once a week, never while Called to Arms */
export const holdFestival = db.transaction((userId: string, now = Date.now()): { endsAt: number; cost: Cost } => {
  const user = proclamationRuler(userId);
  const state = getProclamationState(userId);
  if (state.festivalEndsAt > now) throw new Error("A Festival is already under way.");
  if (state.callToArmsUntil > now) throw new Error(`⚔️ Called to Arms: no Festival while your armies are at war (${waitLabel(state.callToArmsUntil - now)} left).`);
  if (state.festivalReadyAt > now) throw new Error(`The people are still recovering from the last Festival: the next one can be declared in ${waitLabel(state.festivalReadyAt - now)}.`);
  const cost = festivalCostFor(user.city_hall_level ?? 1);
  spendResources(userId, cost, "festival", `🎉 Festival declared`);
  db.prepare(`
    INSERT INTO proclamations (user_id, festival_at) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET festival_at = excluded.festival_at
  `).run(userId, now);
  return { endsAt: now + FESTIVAL.DURATION_MS, cost };
});

/** Special Overseers' plaza always has three full groups of children, one per game (GAME_GUIDE §5) */
export const OVERSEER_CHILDREN = 12;

/** Children at play (GAME_GUIDE §5): 1 + ⌈births last harvest / 5⌉, at least 2 (no cap); none under Low birth rate; overseers a fixed 12 */
export function childrenAtPlayFor(lastBirths: number, punishment?: RoyalPunishment | null, overseer = false): number {
  if (overseer) return OVERSEER_CHILDREN;
  if (punishment?.lowBirth) return 0;
  return Math.max(2, 1 + Math.ceil(Math.max(0, lastBirths) / 5));
}

const stmtLastHarvestBirths = db.prepare(`SELECT births FROM population_ledger WHERE user_id = ? AND type = 'harvest_growth' ORDER BY id DESC LIMIT 1`);

/** Buildings in a Special Overseer's city (honorary halls fill it when they own fewer repos) */
const OVERSEER_BUILDING_COUNT = 20;

type HonoraryHall = { name: string; type: BuildingType; slot: number };

/** Lay a list of names out as honorary halls, slot by slot within each district */
const honoraryHalls = (byType: Array<[BuildingType, string[]]>): HonoraryHall[] =>
  byType.flatMap(([type, names]) => names.map((name, slot) => ({ name, type, slot })));

/** 20 honorary Nethergarde facilities: 7 houses, 5 pastures, 5 fields, 3 garrisons (35/25/25/15) */
const OVERSEER_HONORARY_HALLS = honoraryHalls([
  ["residential_commercial", ["Void Archive", "Aether Spire", "Chrono Matrix", "Astral Observatory", "Nether Council Chamber", "Eclipse Sanctum", "Voidrift Citadel Tower"]],
  ["animal_field", ["Astral Stables", "Nether Beast Pen", "Void Drake Aviary", "Shadow Wyrm Menagerie", "Phase Chimera Paddock"]],
  ["food_field", ["Starlight Hydroponics", "Crystalline Lotus Beds", "Void Mana Orchards", "Luminescent Fungus Caverns", "Arcane Essence Silos"]],
  ["soldier_building", ["Rift Sentinel Bastion", "Netherblade Armory", "Void Vanguard Fortress"]]
]);

/** 50 honorary Celestial halls of the Archon: 18 houses, 12 pastures, 12 fields, 8 garrisons (35/25/25/15) */
const ARCHON_HONORARY_HALLS = honoraryHalls([
  [
    "residential_commercial",
    [
      "Sky Palace of Dawn", "Gilded Empyrean Court", "Terrace of the Thousand Suns", "Hall of the Crimson Seal", "Aureate Archive",
      "Celestial Chancery", "Palace of the Eternal Ledger", "Zenith Observatory", "Halo Basilica", "Sunfire Rotunda",
      "Seraph's Rest", "Golden Dome of Accord", "Empyrean Library", "Sanctum of First Light", "Crown Terrace",
      "Starforge Atelier", "Hall of Radiant Decrees", "Apex Pavilion"
    ]
  ],
  [
    "animal_field",
    [
      "Griffin Roost of the Dawn", "Skyhorn Aerie", "Gilded Hippogriff Perch", "Sunwing Eyrie", "Crimson Roc Roost", "Cloudmane Paddock",
      "Phoenix Nesting Spire", "Halo Griffin Aerie", "Zephyr Stag Meadow", "Starlit Pegasus Loft", "Aureate Wyvern Perch", "Empyrean Menagerie"
    ]
  ],
  [
    "food_field",
    [
      "Hanging Gardens of Ascension", "Cascading Sun Terraces", "Gilded Vineyard Falls", "Celestial Orchard", "Ambrosia Terraces", "Sunwell Rice Steps",
      "Garden of Falling Light", "Golden Lotus Cascade", "Skybloom Arbor", "Radiant Grove", "Honeyed Cloud Fields", "Terraces of Plenty"
    ]
  ],
  [
    "soldier_building",
    ["Seraph Bastion", "Wing of the Crimson Host", "Aegis of the Empyrean", "Halo Guard Keep", "Bastion of Judgment", "Sunspear Barracks", "Gilded Vigil", "Citadel of the Seal"]
  ]
]);

/** Each ruler's XP by realm-time day over the last few days, from the latest realm build (Xal'Vorath's three days) */
const recentXpByDay = new Map<string, Record<string, number>>();
const RECENT_XP_WINDOW_MS = 6 * 86_400_000;
/** XP of every source a ruler earned on a realm-time day (`YYYY-MM-DD`), of the last few days */
export const xpOnRealmDay = (userId: string, day: string) => recentXpByDay.get(userId)?.[day] ?? 0;

export function getAllKingdomsFromDB(): DeveloperKingdom[] {
  const playStats = playStatsByUser();
  const shields = activeShieldsByUser();
  const punishments = activePunishmentsByUser();
  const proclamations = proclamationStatesByUser();
  const users = stmtGetAllUsers.all() as Array<{
    id: string;
    username: string;
    full_name: string;
    email: string;
    civilization: CivilizationType;
    kingdom_title: string;
    city_hall_level: number;
    streak_days: number;
    population?: number;
    soldiers?: number;
    max_population?: number;
    void_well?: number;
    wall_hp?: number | null;
    wall_updated_at?: number | null;
    grudge_stacks?: number | null;
    grudge_week?: string | null;
    repo_holdings?: number;
    legendary_buildings?: number;
  }>;

  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  // Git dates keep their author's UTC offset, so they are compared as instants, never as text
  const since = (date: string | null | undefined, ms: number) => Date.parse(date ?? "") >= ms;
  const inPastWeek = (date: string | null | undefined) => since(date, now - 7 * 86_400_000);
  const inSurge = (date: string | null | undefined) => since(date, now - ACTIVE_SURGE_WINDOW_HOURS * 3_600_000);
  const utcDay = (date: string) => {
    const t = Date.parse(date);
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "";
  };

  const stmtUserCommits = db.prepare(`
    SELECT c.*, r.name as repo_name, r.full_name as repo_full_name, r.default_branch, r.owner_login, r.updated_at as repo_updated_at
    FROM commits c
    JOIN repositories r ON c.repo_id = r.id
    WHERE c.author_login = ?
       OR ((c.author_email = ? OR c.author_email IN (SELECT email FROM user_emails WHERE user_id = ?))
           AND ${COMMIT_UNCLAIMED}
           AND NOT EXISTS (SELECT 1 FROM repo_emails re WHERE re.email = lower(c.author_email) AND re.repo_id = c.repo_id))
    ORDER BY julianday(c.committed_at) DESC
  `);

  const stmtRepoOwner = db.prepare(`
    SELECT r.*
    FROM repositories r
    WHERE r.owner_login = ?
  `);

  const stmtUserPRs = db.prepare(`
    SELECT * FROM pull_requests
    WHERE author_login = ?
    ORDER BY created_at DESC
  `);

  // One review per PR per reviewer counts (the first one submitted)
  const stmtUserReviews = db.prepare(`
    SELECT repo_id, pr_id, MIN(submitted_at) AS submitted_at
    FROM pull_reviews
    WHERE reviewer_login = ?
    GROUP BY repo_id, pr_id
  `);

  // Sealed deed reports (scriptorium.ts): their XP lands on the repo like commit XP
  const stmtUserDeeds = db.prepare(`
    SELECT d.repo_id, d.xp, d.day, d.created_at, r.name, r.full_name, r.default_branch, r.updated_at AS repo_updated_at
    FROM deeds d
    JOIN repositories r ON r.id = d.repo_id
    WHERE d.user_id = ? AND d.status = 'sealed'
  `);

  const titlesByUser = getEarnedTitlesByUser();

  const result: DeveloperKingdom[] = [];

  for (const user of users) {
    const rawCommits = stmtUserCommits.all(user.id, user.email || null, user.id) as Array<any>;
    const rawPRs = stmtUserPRs.all(user.id) as Array<any>;
    const ownedRepos = stmtRepoOwner.all(user.id) as Array<any>;
    const rawReviews = stmtUserReviews.all(user.id) as Array<{ repo_id: string; pr_id: number; submitted_at: string }>;

    // Contribution XP per commit (diminishing returns per day across all repos)
    const commitXp = scoreCommits(rawCommits);

    // Group commits by repository
    const reposMap = new Map<string, {
      id: string;
      name: string;
      fullName: string;
      branch: string;
      commits: any[];
      weekCommits: number;
      weekAdded: number;
      weekDeleted: number;
      totalLines: number;
      xp: number;
      updatedAt?: string;
    }>();

    for (const c of rawCommits) {
      let ra = reposMap.get(c.repo_full_name);
      if (!ra) {
        ra = {
          id: `repo-${c.repo_full_name}`,
          name: c.repo_name,
          fullName: c.repo_full_name,
          branch: c.default_branch || "main",
          commits: [],
          weekCommits: 0,
          weekAdded: 0,
          weekDeleted: 0,
          totalLines: 0,
          xp: 0,
          updatedAt: c.repo_updated_at || c.committed_at
        };
        reposMap.set(c.repo_full_name, ra);
      }
      ra.commits.push(c);
      ra.xp += commitXp.get(c.hash) ?? 0;
      ra.totalLines += (c.lines_added || 0) + (c.lines_deleted || 0);

      if (inPastWeek(c.committed_at)) {
        ra.weekCommits++;
        ra.weekAdded += (c.lines_added || 0);
        ra.weekDeleted += (c.lines_deleted || 0);
      }
    }

    // 🌑 The last few days' XP by realm-time day, every source (Xal'Vorath's three days of work)
    const dayXp: Record<string, number> = {};
    const recentDayFrom = dateKeyIn(now - RECENT_XP_WINDOW_MS, config.realmTimezone);
    const addDayXp = (at: string | null | undefined, xp: number) => {
      const t = at ? Date.parse(at) : NaN;
      if (!(t >= now - RECENT_XP_WINDOW_MS)) return;
      const day = dateKeyIn(t, config.realmTimezone);
      dayXp[day] = (dayXp[day] ?? 0) + xp;
    };
    for (const c of rawCommits) addDayXp(c.committed_at, commitXp.get(c.hash) ?? 0);
    for (const pr of rawPRs) addDayXp(pr.state === "merged" ? pr.merged_at || pr.created_at : pr.created_at, prXp(pr.state));
    for (const rv of rawReviews) addDayXp(rv.submitted_at, XP_RULES.review);

    // Sealed deeds add their XP to their repo; a deed is work in that repo, so it builds it like a commit
    const weekAgoDay = weekAgo.slice(0, 10);
    let deedXpTotal = 0;
    let weekDeedXp = 0;
    // A deed's own day is a UTC day (today or yesterday when written); Xal'Vorath's days are realm-time days, so a
    // deed counts on the realm day it was written in, or the realm day before for one written for yesterday
    const deedRealmDay = (d: { day: string; created_at?: string | null }) => {
      const t = d.created_at ? Date.parse(d.created_at) : NaN;
      if (!Number.isFinite(t)) return d.day;
      const back = Math.round((Date.parse(`${new Date(t).toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${d.day}T00:00:00Z`)) / 86_400_000);
      return Number.isFinite(back) && back >= 0 ? dateKeyIn(t - back * 86_400_000, config.realmTimezone) : d.day;
    };
    for (const d of stmtUserDeeds.all(user.id) as Array<{ repo_id: string; xp: number; day: string; created_at?: string | null; name: string; full_name: string; default_branch?: string; repo_updated_at?: string }>) {
      let ra = reposMap.get(d.full_name);
      if (!ra) {
        ra = { id: d.repo_id, name: d.name, fullName: d.full_name, branch: d.default_branch || "main", commits: [], weekCommits: 0, weekAdded: 0, weekDeleted: 0, totalLines: 0, xp: 0, updatedAt: d.repo_updated_at };
        reposMap.set(d.full_name, ra);
      }
      ra.xp += d.xp;
      deedXpTotal += d.xp;
      if (d.day >= weekAgoDay) weekDeedXp += d.xp;
      const realmDay = deedRealmDay(d);
      if (realmDay >= recentDayFrom) dayXp[realmDay] = (dayXp[realmDay] ?? 0) + d.xp;
    }
    recentXpByDay.set(user.id, dayXp);
    let commitXpTotal = 0;
    for (const v of commitXp.values()) commitXpTotal += v;

    // Merged / opened PRs and code reviews add XP to the repo they belong to
    const repoById = new Map([...reposMap.values()].map((ra) => [ra.id, ra]));
    let prXpTotal = 0;
    let reviewXpTotal = 0;
    for (const pr of rawPRs) {
      const ra = repoById.get(pr.repo_id);
      if (ra) {
        ra.xp += prXp(pr.state);
        prXpTotal += prXp(pr.state);
      }
    }
    for (const rv of rawReviews) {
      const ra = repoById.get(rv.repo_id);
      if (ra) {
        ra.xp += XP_RULES.review;
        reviewXpTotal += XP_RULES.review;
      }
    }

    const unbuiltRepos: UnbuiltRepo[] = [];

    // Owned, subscribed and assigned org repos only become buildings once this developer has a commit credited in them
    const subRepos = stmtGetUserSubscribedRepos.all(user.id) as Array<any>;
    const listedUnbuilt = new Set<string>();
    for (const sr of [...ownedRepos, ...subRepos]) {
      if (!reposMap.has(sr.full_name) && !listedUnbuilt.has(sr.id)) {
        listedUnbuilt.add(sr.id);
        unbuiltRepos.push({ id: sr.id, name: sr.name, reason: "no_commits" });
      }
    }

    // Rank repositories by total lines + commits (largest repos first)
    const rankedRepos = [...reposMap.values()]
      .sort((a, b) => (b.totalLines + b.commits.length * 40) - (a.totalLines + a.commits.length * 40));
    const sortedRepos = rankedRepos.slice(0, config.maxBuildingsPerKingdom);
    for (const ra of rankedRepos.slice(config.maxBuildingsPerKingdom)) {
      unbuiltRepos.push({ id: ra.id, name: ra.name, reason: "over_cap" });
    }

    // Saved city plan: district (35% houses, 25% animal, 25% food, 15% soldier) + plot per repo
    const layout = resolveKingdomLayout(user.id, sortedRepos.map((ra) => ra.id));

    const buildings: RepoBuilding[] = sortedRepos.map((ra) => {
      const plan = layout.placed.get(ra.id)!;
      const lvl = calculateBuildingLevel(ra.xp);
      const latest = ra.commits[0];
      const latestTime = latest
        ? new Date(latest.committed_at).getTime()
        : (ra.updatedAt ? new Date(ra.updatedAt).getTime() : null);
      const daysIdle = latestTime ? (now - latestTime) / 86_400_000 : 999;

      const recentCommits: Commit[] = ra.commits.slice(0, 5).map((c) => ({
        hash: (c.hash || "").slice(0, 7),
        message: (c.message || "").split("\n")[0],
        author: c.author_name || user.full_name,
        lines: `+${c.lines_added || 0}, -${c.lines_deleted || 0}`,
        time: timeAgo(c.committed_at)
      }));

      const repoPRs = rawPRs.filter((pr) => pr.repo_id === ra.id);
      const surging = Boolean((latest && inSurge(latest.committed_at)) || repoPRs.some((pr) => inSurge(pr.merged_at)));
      const recentPRs: PullRequest[] = repoPRs
        .slice(0, 3)
        .map((pr) => ({
          id: pr.id,
          number: `#${pr.id}`,
          title: pr.title,
          author: pr.author_login || user.username,
          status: pr.state === "merged" ? "merged" : pr.state === "closed" ? "closed" : "open",
          time: timeAgo(pr.created_at)
        }));

      return {
        id: ra.id,
        name: ra.name,
        branch: ra.branch,
        buildingType: plan.buildingType,
        slot: plan.slot,
        level: lvl.level,
        prestige: lvl.prestige,
        stars: lvl.stars,
        totalCommits: ra.commits.length,
        xp: round1(ra.xp),
        levelXp: lvl.levelXp,
        nextLevelXp: lvl.nextLevelXp,
        condition: daysIdle > 90 ? "idle" : "active",
        health: Math.round(Math.max(40, Math.min(100, 100 - daysIdle))),
        totalLines: ra.totalLines,
        commitsPastWeek: ra.weekCommits,
        prsPastWeek: repoPRs.filter((pr) => inPastWeek(pr.created_at)).length,
        linesAddedPastWeek: ra.weekAdded,
        linesDeletedPastWeek: ra.weekDeleted,
        lastCommit: latest ? (latest.message || "").split("\n")[0] : (daysIdle > 90 ? "Dormant (no commits)" : "New repository"),
        lastCommitDate: latest ? timeAgo(latest.committed_at) : (ra.updatedAt ? timeAgo(ra.updatedAt) : "—"),
        recentCommits,
        recentPRs,
        surging
      };
    });

    // Resources from SQLite (strictly start from 0)
    const resRow = stmtGetResources.get(user.id) as { gold: number; iron: number; stone: number; lumber: number; food: number } | undefined;
    const allScarce = (stmtGetUserAllScarce.all(user.id) as Array<{ resource_key: string; amount: number }>)
      .reduce((acc, row) => {
        acc[row.resource_key] = row.amount;
        return acc;
      }, {} as Record<string, number>);

    const resources: KingdomResources = {
      gold: resRow?.gold ?? 0,
      iron: resRow?.iron ?? 0,
      stone: resRow?.stone ?? 0,
      lumber: resRow?.lumber ?? 0,
      food: resRow?.food ?? 0,
      scarce: allScarce
    };

    const pastWeekCommits = buildings.reduce((sum, b) => sum + b.commitsPastWeek, 0);
    const pastWeekPRs = rawPRs.filter((pr) => inPastWeek(pr.created_at)).length;
    const pastWeekReviews = rawReviews.filter((r) => inPastWeek(r.submitted_at)).length;

    // Past-week contribution XP (all repos, built or not) drives the harvest share
    const weekCommitXp = rawCommits.filter((c) => inPastWeek(c.committed_at)).reduce((sum, c) => sum + (commitXp.get(c.hash) ?? 0), 0);
    const weekPrXp = rawPRs.reduce((sum, pr) => {
      if (pr.state === "merged" && inPastWeek(pr.merged_at || pr.created_at)) return sum + XP_RULES.mergedPR;
      if (pr.state !== "merged" && inPastWeek(pr.created_at)) return sum + XP_RULES.openPR;
      return sum;
    }, 0);
    // Sealed deed XP pays the harvest like commit XP (its share shows in the Watchtower)
    const weekXp = weekCommitXp + weekPrXp + pastWeekReviews * XP_RULES.review + weekDeedXp;
    // Play streak (consecutive days playing the game) raises the activity score, capped at +20%
    const playStreakDays = playStats.get(user.id.toLowerCase())?.streak ?? 0;
    const playStreakBonus = Math.min(PLAY_STREAK_BONUS_MAX, playStreakDays * PLAY_STREAK_BONUS_PER_DAY);
    const baseScore = Math.round(weekXp * 2);
    const weightedScore = Math.round(weekXp * 2 * (1 + playStreakBonus));

    // Streak days need at least one meaningful commit (not a merge, not empty / whitespace / comment-only)
    const commitDays = new Set(rawCommits.filter(isMeaningfulCommit).map((c) => utcDay(c.committed_at)));
    const streakDays = streakFrom(commitDays);

    // Full year daily commit history for contribution activity heatmap
    const dailyCommits: Record<string, number> = {};
    for (const c of rawCommits) {
      const day = (c.committed_at || "").slice(0, 10);
      if (day) {
        dailyCommits[day] = (dailyCommits[day] || 0) + 1;
      }
    }

    const isSpecial = config.specialUsers.includes(user.id.toLowerCase()) || config.specialUsers.includes(user.username.toLowerCase());
    const isArchon = isSpecial && loginListed(config.archonUsers, user);

    let finalBuildings = buildings;
    let finalUpgrades = getKingdomUpgrades(user.id);
    let finalResources = resources;
    let finalCityHallLevel: number;
    let finalCityHallPrestige: number;
    let finalStreakDays = streakDays;
    let finalActivity: ActivitySummary = {
      pastWeekCommits,
      pastWeekPRs,
      pastWeekReviews,
      weekXp: round1(weekXp),
      weekDeedXp: round1(weekDeedXp),
      weightedScore,
      baseScore,
      playStreakDays,
      playStreakBonus: round1(playStreakBonus * 100) / 100,
      growthMultiplier: 1 + (weightedScore / 100),
      dailyCommits
    };
    let finalCiv = user.civilization || "human";
    let finalVacant = layout.vacant;

    if (isSpecial) {
      // Overseers: Wonder castle and 20 buildings at Lv25; the Archon: Empyrean castle and 50 Celestial buildings at Lv30
      const level = isArchon ? ARCHON_BUILDING_LEVEL : MAX_BUILDING_LEVEL;
      const cityCount = isArchon ? ARCHON_BUILDING_COUNT : OVERSEER_BUILDING_COUNT;
      const directive = isArchon ? "Decree of the Archon Eternal" : "Nethergarde Voidrift Directive";
      finalCiv = "arcane";
      finalCityHallLevel = isArchon ? ARCHON_CASTLE_LEVEL : MAX_BUILDING_LEVEL;
      finalCityHallPrestige = 4;
      finalStreakDays = 365;
      finalActivity = {
        pastWeekCommits: 100,
        pastWeekPRs: 20,
        pastWeekReviews: 20,
        weekXp: 1000,
        weightedScore: 2000,
        growthMultiplier: 21,
        dailyCommits
      };
      finalUpgrades = { ...MAXED_UPGRADES };
      // A real treasury: plundered by raids, reset to the preset every harvest (resetOverseers)
      const stored = resources.gold + resources.iron + resources.stone + resources.lumber + resources.food;
      finalResources = stored > 0 ? resources : { ...OVERSEER_TREASURY, scarce: { ...OVERSEER_SCARCE } };

      // Boost all existing buildings to max
      finalBuildings = finalBuildings.map((b) => ({
        ...b,
        level,
        prestige: 4,
        stars: 4,
        health: 100,
        condition: "active" as const,
        commitsPastWeek: 20,
        totalLines: 50000,
        totalCommits: 100,
        xp: 1266,
        levelXp: 466,
        nextLevelXp: null,
        lastCommit: directive,
        lastCommitDate: "Active"
      }));

      // Fewer buildings than the city holds (or no repos at all): honorary halls fill it, across the 4 districts (35/25/25/15)
      if (finalBuildings.length < cityCount) {
        const honoraryDefs = isArchon ? ARCHON_HONORARY_HALLS : OVERSEER_HONORARY_HALLS;
        const occupied = new Set(finalBuildings.map((b) => `${b.buildingType}-${b.slot}`));
        for (let i = 0; i < honoraryDefs.length && finalBuildings.length < cityCount; i++) {
          const def = honoraryDefs[i];
          let slot = def.slot;
          while (occupied.has(`${def.type}-${slot}`)) slot++;
          occupied.add(`${def.type}-${slot}`);
          finalBuildings.push({
            id: `special-bld-${user.id}-${finalBuildings.length}`,
            name: def.name,
            branch: "main",
            buildingType: def.type,
            slot,
            level,
            prestige: 4,
            totalCommits: 100,
            xp: 1266,
            levelXp: 466,
            nextLevelXp: null,
            condition: "active" as const,
            health: 100,
            totalLines: 50000,
            commitsPastWeek: 20,
            prsPastWeek: 5,
            linesAddedPastWeek: 1000,
            linesDeletedPastWeek: 200,
            lastCommit: isArchon ? "Decree of the Archon Eternal" : "Nethergarde Protocol: Voidrift Overseer",
            lastCommitDate: "Just now",
            recentCommits: [
              {
                hash: isArchon ? "archon01" : "void001",
                message: isArchon ? "Raise the Empyrean over the Voidrift" : "Initialize Nethergarde Voidrift overseer matrix",
                author: user.full_name || user.username,
                lines: "+500, -0",
                time: "Just now"
              }
            ],
            recentPRs: []
          });
        }
      }
      finalVacant = [];
    } else {
      const hall = calculateCityHallLevel(buildings);
      finalCityHallLevel = hall.level;
      finalCityHallPrestige = hall.prestige;
      const holdings = buildings.filter((b) => b.level >= REPO_HOLDING_MIN_LEVEL).length;
      const legendary = buildings.filter((b) => b.level >= MAX_BUILDING_LEVEL).length;
      if ((user.repo_holdings ?? 0) !== holdings || (user.legendary_buildings ?? 0) !== legendary) {
        db.prepare(`UPDATE users SET repo_holdings = ?, legendary_buildings = ? WHERE id = ?`).run(holdings, legendary, user.id);
        repoHoldingsChanged = true;
      }
    }

    const maxPop = calculateMaxPopulation(finalCityHallLevel, finalCiv);
    const genesisPop = calculateGenesisPopulation(finalCityHallLevel, finalCiv);
    let pop = user.population !== null && user.population !== undefined ? user.population : genesisPop;
    let soldiers = user.soldiers ?? 0;

    if (isSpecial) {
      // Battles thin them out; every harvest they respawn to full (resetOverseers)
      pop = user.population ?? maxPop;
      soldiers = user.soldiers ?? Math.round(maxSoldiersFor(maxPop, finalCiv) * OVERSEER_GARRISON_SHARE);
    } else if (user.population === null || user.population === undefined) {
      db.prepare(`UPDATE users SET population = ?, soldiers = 0, max_population = ?, city_hall_level = ? WHERE id = ?`).run(pop, maxPop, finalCityHallLevel, user.id);
      recordPopulationLedger({
        userId: user.id,
        type: "genesis",
        births: genesisPop,
        populationDelta: genesisPop,
        populationBalance: genesisPop,
        soldiersBalance: 0,
        reason: "Genesis colony settlement"
      });
    } else {
      db.prepare(`UPDATE users SET city_hall_level = ?, max_population = ? WHERE id = ?`).run(finalCityHallLevel, maxPop, user.id);
    }

    const wallTier = finalUpgrades.walls ?? 0;
    const wallDefMult = wallDefMultForTier(wallTier);
    const wallMaxHp = wallMaxHpFor(finalCityHallLevel, wallTier);
    const wallState = computeWallState(user.wall_hp, user.wall_updated_at, wallMaxHp);
    const deployed = getDeployedSoldiers(user.id);
    const maxSoldiers = maxSoldiersFor(pop, finalCiv);
    const marchSlots = marchSlotsForLevel(finalCityHallLevel);
    // Kingdom Banners raise the troops one march can carry
    const marchCapacity = Math.floor(marchCapacityFor(maxPop, finalCiv) * improvementEffects(finalUpgrades).marchCapMult);

    result.push({
      id: user.id,
      name: user.full_name || user.username,
      username: user.username,
      kingdomTitle: kingdomTitleFor(finalCiv, user.full_name || user.username),
      civilization: finalCiv,
      mapCoordinates: [0, 0],
      cityHallLevel: finalCityHallLevel,
      cityHallPrestige: finalCityHallPrestige,
      resources: finalResources,
      activity: finalActivity,
      streakDays: finalStreakDays,
      buildings: finalBuildings,
      upgrades: finalUpgrades,
      vacantPlots: finalVacant,
      unbuiltRepos,
      population: pop,
      soldiers,
      deployedSoldiers: deployed,
      civiliansAway: getAwayCivilians(user.id),
      ...woundedFields(user.id),
      voidWell: user.void_well ?? 0,
      maxPopulation: maxPop,
      maxSoldiers,
      marchSlots,
      marchCapacity,
      wallTier,
      wallDefMult,
      wallHp: wallState.wallHp,
      wallMaxHp: wallState.wallMaxHp,
      burning: wallState.burning,
      burningEndsAt: wallState.burningEndsAt,
      grudgeStacks: user.grudge_stacks ?? 0,
      isSpecial,
      isArchon,
      earnedTitles: titlesByUser.get(user.id) ?? [],
      titleBuffs: titleBuffsOf(titlesByUser.get(user.id) ?? []),
      childrenAtPlay: childrenAtPlayFor((stmtLastHarvestBirths.get(user.id) as { births: number } | undefined)?.births ?? 0, punishments.get(user.id), isSpecial),
      shield: shields.get(user.id) ?? null,
      punishment: punishments.get(user.id) ?? null,
      proclamations: proclamations.get(user.id) ?? { ...NO_PROCLAMATIONS },
      xpBySource: { commits: round1(commitXpTotal), prs: round1(prXpTotal), reviews: round1(reviewXpTotal), deeds: round1(deedXpTotal) }
    });
  }

  // Sort by activity and buildings
  result.sort((a, b) => b.activity.pastWeekCommits - a.activity.pastWeekCommits || b.buildings.length - a.buildings.length);

  return result;
}

/**
 * Retrieve accounting ledger history for a specific user kingdom
 */
export function getUserLedger(userId: string, limit: number = 50): LedgerEntry[] {
  const rows = stmtGetUserLedger.all(userId, limit) as Array<any>;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name || r.user_id,
    timestamp: r.timestamp,
    type: r.type,
    goldDelta: r.gold_delta,
    ironDelta: r.iron_delta,
    stoneDelta: r.stone_delta ?? 0,
    lumberDelta: r.lumber_delta,
    foodDelta: r.food_delta,
    goldBalance: r.gold_balance,
    ironBalance: r.iron_balance,
    stoneBalance: r.stone_balance ?? 0,
    lumberBalance: r.lumber_balance,
    foodBalance: r.food_balance,
    scarceKey: r.scarce_key || null,
    scarceDelta: r.scarce_delta ?? 0,
    scarceBalance: r.scarce_balance ?? 0,
    reason: r.reason
  }));
}

/**
 * Retrieve realm-wide accounting ledger stream
 */
export function getRealmLedger(limit: number = 100): LedgerEntry[] {
  const rows = stmtGetRealmLedger.all(limit) as Array<any>;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name || r.user_id,
    timestamp: r.timestamp,
    type: r.type,
    goldDelta: r.gold_delta,
    ironDelta: r.iron_delta,
    stoneDelta: r.stone_delta ?? 0,
    lumberDelta: r.lumber_delta,
    foodDelta: r.food_delta,
    goldBalance: r.gold_balance,
    ironBalance: r.iron_balance,
    stoneBalance: r.stone_balance ?? 0,
    lumberBalance: r.lumber_balance,
    foodBalance: r.food_balance,
    scarceKey: r.scarce_key || null,
    scarceDelta: r.scarce_delta ?? 0,
    scarceBalance: r.scarce_balance ?? 0,
    reason: r.reason
  }));
}

const stmtInsertPopLedger = db.prepare(`
  INSERT INTO population_ledger (
    user_id, timestamp, type, births, deaths, soldiers_delta,
    population_delta, population_balance, soldiers_balance, civilians_balance, reason
  ) VALUES (
    @userId, @timestamp, @type, @births, @deaths, @soldiersDelta,
    @populationDelta, @populationBalance, @soldiersBalance, @civiliansBalance, @reason
  )
`);

export function recordPopulationLedger(entry: {
  userId: string;
  timestamp?: string;
  type: string;
  births?: number;
  deaths?: number;
  soldiersDelta?: number;
  populationDelta?: number;
  populationBalance: number;
  soldiersBalance: number;
  reason: string;
}) {
  const ts = entry.timestamp || new Date().toISOString();
  const civiliansBalance = Math.max(0, entry.populationBalance - entry.soldiersBalance);
  stmtInsertPopLedger.run({
    userId: entry.userId,
    timestamp: ts,
    type: entry.type,
    births: entry.births || 0,
    deaths: entry.deaths || 0,
    soldiersDelta: entry.soldiersDelta || 0,
    populationDelta: entry.populationDelta || 0,
    populationBalance: entry.populationBalance,
    soldiersBalance: entry.soldiersBalance,
    civiliansBalance,
    reason: entry.reason
  });
}

export function getUserPopulationLedger(userId: string, limit: number = 50): PopulationLedgerEntry[] {
  const rows = db.prepare(`
    SELECT p.*, u.full_name as user_name
    FROM population_ledger p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ?
    ORDER BY p.id DESC
    LIMIT ?
  `).all(userId, limit) as any[];

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name || r.user_id,
    timestamp: r.timestamp,
    type: r.type,
    births: r.births,
    deaths: r.deaths,
    soldiersDelta: r.soldiers_delta,
    populationDelta: r.population_delta,
    populationBalance: r.population_balance,
    soldiersBalance: r.soldiers_balance,
    civiliansBalance: r.civilians_balance,
    reason: r.reason
  }));
}

/** Buildings of a kingdom currently in Active Surge */
function surgingCount(k: DeveloperKingdom | undefined): number {
  return (k?.buildings ?? []).filter((b) => b.surging).length;
}

export type Cost = Partial<Record<"gold" | "iron" | "stone" | "lumber" | "food", number>>;

/** Pay `cost` from a kingdom's treasury and write it to the ledger; throws if it can't afford it */
const GIFT_BASE_KEYS = ["gold", "iron", "stone", "lumber", "food"] as const;

/**
 * 🎁 Royal gift (GAME_GUIDE §15): adds base resources and gems to a ruler's treasury, with ledger type
 * `admin_gift` (one line for the base resources, one per gem). Amounts must already be validated.
 */
export const grantAdminGift = db.transaction((userId: string, gift: GiftAmounts, message: string) => {
  stmtEnsureResources.run(userId);
  const cur = stmtGetResources.get(userId) as { gold: number; iron: number; stone: number; lumber: number; food: number };
  const add = Object.fromEntries(GIFT_BASE_KEYS.map((k) => [k, Math.max(0, Math.floor(gift[k] ?? 0))])) as Record<(typeof GIFT_BASE_KEYS)[number], number>;
  const next = Object.fromEntries(GIFT_BASE_KEYS.map((k) => [k, cur[k] + add[k]])) as typeof add;
  const now = new Date().toISOString();
  const line = (scarceKey: string | null, scarceDelta: number, scarceBalance: number, deltas: typeof add) =>
    stmtInsertLedger.run({
      userId,
      timestamp: now,
      type: "admin_gift",
      goldDelta: deltas.gold,
      ironDelta: deltas.iron,
      stoneDelta: deltas.stone,
      lumberDelta: deltas.lumber,
      foodDelta: deltas.food,
      goldBalance: next.gold,
      ironBalance: next.iron,
      stoneBalance: next.stone,
      lumberBalance: next.lumber,
      foodBalance: next.food,
      scarceKey,
      scarceDelta,
      scarceBalance,
      reason: `🎁 Royal gift: ${message}`
    });
  if (GIFT_BASE_KEYS.some((k) => add[k] > 0)) {
    stmtSetResources.run({ userId, ...next });
    line(null, 0, 0, add);
  }
  const zero = { gold: 0, iron: 0, stone: 0, lumber: 0, food: 0 };
  for (const [key, raw] of Object.entries(gift.gems ?? {})) {
    const amount = Math.max(0, Math.floor(raw));
    if (amount <= 0) continue;
    const balance = ((stmtGetScarce.get(userId, key) as { amount: number } | undefined)?.amount ?? 0) + amount;
    stmtSetScarce.run(userId, key, balance);
    line(key, amount, balance, zero);
  }
});

export function spendResources(userId: string, cost: Cost, type: string, reason: string): { gold: number; iron: number; stone: number; lumber: number; food: number } {
  const cur = getKingdomResources(userId);
  for (const [key, amount] of Object.entries(cost) as Array<[keyof Cost, number]>) {
    if ((cur[key] ?? 0) < amount) throw new Error(`Not enough ${key}: need ${amount.toLocaleString()}, have ${(cur[key] ?? 0).toLocaleString()}.`);
  }
  const next = {
    gold: cur.gold - (cost.gold ?? 0),
    iron: cur.iron - (cost.iron ?? 0),
    stone: cur.stone - (cost.stone ?? 0),
    lumber: cur.lumber - (cost.lumber ?? 0),
    food: cur.food - (cost.food ?? 0)
  };
  stmtSetResources.run({ userId, ...next });
  stmtInsertLedger.run({
    userId,
    timestamp: new Date().toISOString(),
    type,
    goldDelta: -(cost.gold ?? 0),
    ironDelta: -(cost.iron ?? 0),
    stoneDelta: -(cost.stone ?? 0),
    lumberDelta: -(cost.lumber ?? 0),
    foodDelta: -(cost.food ?? 0),
    goldBalance: next.gold,
    ironBalance: next.iron,
    stoneBalance: next.stone,
    lumberBalance: next.lumber,
    foodBalance: next.food,
    scarceKey: null,
    scarceDelta: 0,
    scarceBalance: 0,
    reason
  });
  return next;
}

/** Spend scarce gems (one ledger line per gem); throws a player-facing message when any is short */
export function spendGems(userId: string, gems: Record<string, number>, type: string, reason: string) {
  const res = getKingdomResources(userId);
  for (const [key, amount] of Object.entries(gems)) {
    if (((res.scarce ?? {})[key] ?? 0) < amount) throw new Error(`Not enough ${key.replace(/_/g, " ")}: need ${amount.toLocaleString()}, have ${((res.scarce ?? {})[key] ?? 0).toLocaleString()}.`);
  }
  const now = new Date().toISOString();
  for (const [key, amount] of Object.entries(gems)) {
    if (amount <= 0) continue;
    const balance = ((res.scarce ?? {})[key] ?? 0) - amount;
    stmtSetScarce.run(userId, key, balance);
    stmtInsertLedger.run({
      userId,
      timestamp: now,
      type,
      goldDelta: 0,
      ironDelta: 0,
      stoneDelta: 0,
      lumberDelta: 0,
      foodDelta: 0,
      goldBalance: res.gold,
      ironBalance: res.iron,
      stoneBalance: res.stone,
      lumberBalance: res.lumber,
      foodBalance: res.food,
      scarceKey: key,
      scarceDelta: -amount,
      scarceBalance: balance,
      reason
    });
  }
}

const scaleCost = (unit: Cost, n: number): Cost => Object.fromEntries(Object.entries(unit).map(([k, v]) => [k, v * n]));

/**
 * Set the home garrison. Arming civilians costs MOBILIZATION_COST each (GAME_GUIDE §13); sending soldiers
 * back to the fields is free. Soldiers away on a march can't be re-mobilised, and total mobilized soldiers
 * (`soldiers + deployedSoldiers`) cannot exceed `maxSoldiersFor(population, civ)`.
 */
export const setKingdomSoldiers = db.transaction((userId: string, soldiers: number): { population: number; soldiers: number; maxPopulation: number; maxSoldiers: number; changed: boolean } => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
  if (!user) throw new Error("Kingdom not found");

  const pop = user.population ?? 0;
  const civ = (user.civilization || "human") as CivilizationType;
  // 🌙 Wounded elves count as soldiers away: their places can't be filled by recruits
  const deployed = getDeployedSoldiers(userId) + getWoundedSoldiers(userId);
  const maxTotalSoldiers = maxSoldiersFor(pop, civ);
  // Civilians away gathering can't be armed until they're home
  const maxHomeSoldiers = Math.max(0, Math.min(pop - deployed - getAwayCivilians(userId), maxTotalSoldiers - deployed));
  const currentSoldiers = user.soldiers || 0;
  const requested = Math.floor(soldiers);

  if (requested > currentSoldiers && currentSoldiers >= maxHomeSoldiers) {
    throw new Error(`Soldier cap reached (${maxTotalSoldiers.toLocaleString()} max for your civilization at current population).`);
  }

  const targetSoldiers = Math.max(0, Math.min(requested > currentSoldiers ? maxHomeSoldiers : currentSoldiers, requested));
  const delta = targetSoldiers - currentSoldiers;

  if (delta > 0) {
    const cost = scaleCost(MOBILIZATION_COST, delta);
    spendResources(userId, cost, "mobilization", `Armed ${delta} soldiers (${Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(", ")})`);
  }
  db.prepare(`UPDATE users SET soldiers = ? WHERE id = ?`).run(targetSoldiers, userId);

  if (delta !== 0) {
    recordPopulationLedger({
      userId,
      type: delta >= 0 ? "mobilization" : "demobilization",
      soldiersDelta: delta,
      populationBalance: pop,
      soldiersBalance: targetSoldiers + deployed,
      reason: delta >= 0 ? `Mobilized ${delta} soldiers for defense` : `Demobilized ${Math.abs(delta)} soldiers back to civilian workforce`
    });
  }

  return {
    population: pop,
    soldiers: targetSoldiers,
    maxPopulation: user.max_population ?? pop,
    maxSoldiers: maxTotalSoldiers,
    changed: delta !== 0
  };
});

/** Nethergarde summons void constructs with resources (they don't breed); capped by free capacity */
export const summonConstructs = db.transaction((userId: string, count: number): { summoned: number; population: number } => {
  const user = db.prepare(`SELECT civilization, population, max_population, soldiers FROM users WHERE id = ?`).get(userId) as any;
  if (!user) throw new Error("Kingdom not found");
  if (user.civilization !== "arcane") throw new Error("Only Nethergarde summons void constructs — mortal kingdoms grow by births.");
  const pop = user.population ?? 0;
  const room = Math.max(0, (user.max_population ?? pop) - pop);
  const summoned = Math.min(room, Math.max(0, Math.floor(count)));
  if (summoned <= 0) throw new Error(room <= 0 ? "Your kingdom is at full capacity." : "Summon at least one construct.");

  const cost = scaleCost(SUMMON_COST, summoned);
  spendResources(userId, cost, "summon", `Summoned ${summoned} void constructs`);
  db.prepare(`UPDATE users SET population = ? WHERE id = ?`).run(pop + summoned, userId);
  recordPopulationLedger({
    userId,
    type: "summon",
    births: summoned,
    populationDelta: summoned,
    populationBalance: pop + summoned,
    soldiersBalance: (user.soldiers ?? 0) + soldiersAwayOf(userId),
    reason: `Void ritual: summoned ${summoned} constructs`
  });
  return { summoned, population: pop + summoned };
});

/** Soldiers this kingdom has stationed in allies' castles: fed from its own granary every harvest */
export function getStationedSoldiers(userId: string): number {
  try {
    const row = db
      .prepare(`SELECT COALESCE(SUM(soldiers_count), 0) AS total FROM active_marches WHERE attacker_id = ? AND kind = 'reinforce' AND status = 'marching' AND phase = 'stationed'`)
      .get(userId) as { total: number } | undefined;
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

/**
 * Soldiers of a kingdom currently away on a march (outbound, rallying, acting/fighting, stationed, or returning).
 * They stay part of the population (they come back, or die in battle), but they neither work, eat from the granary nor can be re-mobilized.
 * A mercenary band's march holds none of them (its soldier-equivalents are no one's citizens).
 */
export function getDeployedSoldiers(userId: string): number {
  try {
    const row = db
      .prepare(`SELECT COALESCE(SUM(soldiers_count), 0) AS total FROM active_marches WHERE attacker_id = ? AND status = 'marching' AND COALESCE(phase, 'outbound') != 'done' AND COALESCE(civilian, 0) = 0 AND band_id IS NULL`)
      .get(userId) as { total: number } | undefined;
    return Number(row?.total || 0);
  } catch {
    return 0; // active_marches not created yet (warEngine initialises it)
  }
}

/**
 * 🌙 Elf soldiers healing at the Moonwell (GAME_GUIDE §13 Moonwell Healers). They keep their place in the population
 * (no recruit can take it) but neither work, eat, age nor fight until they rejoin the home garrison.
 */
export function getWoundedSoldiers(userId: string): number {
  try {
    const row = db.prepare(`SELECT COALESCE(SUM(count), 0) AS total FROM wounded_soldiers WHERE user_id = ?`).get(userId) as { total: number } | undefined;
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

/** A kingdom's soldiers who aren't at home (on marches or healing): the Population Ledger counts them with the garrison, so its civilians stay right */
export function soldiersAwayOf(userId: string): number {
  return getDeployedSoldiers(userId) + getWoundedSoldiers(userId);
}

/** Wounded who rejoin a kingdom's garrison at each harvest (by its capacity, so the clock doesn't stretch as the war thins it) */
function healPerHarvestOf(userId: string): number {
  const u = db.prepare(`SELECT civilization, city_hall_level, max_population FROM users WHERE id = ?`).get(userId) as
    | { civilization: CivilizationType | null; city_hall_level: number | null; max_population: number | null }
    | undefined;
  const civ = (u?.civilization || "elf") as CivilizationType;
  return woundedHealPerHarvest(u?.max_population ?? calculateMaxPopulation(u?.city_hall_level ?? 1, civ), civ);
}

/** The Moonwell's ward for the kingdom window: wounded soldiers and how many rejoin the garrison at each harvest */
export function woundedFields(userId: string): { wounded?: { count: number; perHarvest: number } } {
  const count = getWoundedSoldiers(userId);
  return count > 0 ? { wounded: { count, perHarvest: healPerHarvestOf(userId) } } : {};
}

/**
 * 🌙 A harvest at the Moonwell: up to `woundedHealPerHarvest` wounded rejoin the home garrison, longest-wounded first
 * (never more than the people at home who aren't soldiers already). Returns how many came back.
 */
function healWoundedAtHarvest(userId: string): number {
  const rows = db.prepare(`SELECT id, count FROM wounded_soldiers WHERE user_id = ? ORDER BY wounded_at, id`).all(userId) as Array<{ id: string; count: number }>;
  if (!rows.length) return 0;
  const u = db.prepare(`SELECT population, soldiers FROM users WHERE id = ?`).get(userId) as { population: number | null; soldiers: number | null } | undefined;
  const ward = rows.reduce((s, r) => s + r.count, 0);
  const room = Math.max(0, (u?.population ?? 0) - (u?.soldiers ?? 0) - getDeployedSoldiers(userId) - getAwayCivilians(userId));
  let left = Math.min(healPerHarvestOf(userId), ward, room);
  const healed = left;
  for (const r of rows) {
    if (left <= 0) break;
    const take = Math.min(left, r.count);
    if (take >= r.count) db.prepare(`DELETE FROM wounded_soldiers WHERE id = ?`).run(r.id);
    else db.prepare(`UPDATE wounded_soldiers SET count = count - ? WHERE id = ?`).run(take, r.id);
    left -= take;
  }
  if (healed > 0) db.prepare(`UPDATE users SET soldiers = COALESCE(soldiers, 0) + ? WHERE id = ?`).run(healed, userId);
  return healed;
}

/**
 * Civilians of a kingdom away gathering in its safe territory or scouting (GAME_GUIDE §13 Gathering, Scouting). They stay part of the
 * population but don't work, don't die of age and can't be armed until they are home.
 */
export function getAwayCivilians(userId: string): number {
  try {
    const row = db
      .prepare(`SELECT COALESCE(SUM(soldiers_count), 0) AS total FROM active_marches WHERE attacker_id = ? AND status = 'marching' AND COALESCE(phase, 'outbound') != 'done' AND civilian = 1`)
      .get(userId) as { total: number } | undefined;
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

export interface DuplicateRepoItem {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  ownerName?: string;
  civilization?: string;
  commitsCount: number;
  level: number;
  canDelete: boolean;
  updatedAt?: string;
}

export interface DuplicateRepoGroup {
  name: string;
  repos: DuplicateRepoItem[];
  hasDeletable: boolean;
}

export interface AdminValidationWarning {
  id: string;
  category: string;
  title: string;
  count: number;
  severity: "warning" | "error" | "info";
  summary: string;
  details: any;
}

/**
 * Extensible Admin Validations engine.
 * Scans the realm database for integrity anomalies (duplicate repos, unmapped identities, etc.)
 */
export function getAdminValidationWarnings(): AdminValidationWarning[] {
  const warnings: AdminValidationWarning[] = [];

  // Check 1: Duplicate Repositories across organizations & personal namespaces
  const kingdoms = getAllKingdomsFromDB();
  const repoBuildingMap = new Map<string, { level: number; kingdomName: string; kingdomCiv: string }>();
  for (const k of kingdoms) {
    for (const b of (k.buildings || [])) {
      repoBuildingMap.set(b.id, { level: b.level, kingdomName: k.name, kingdomCiv: k.civilization });
    }
  }

  const dupRows = db.prepare(`
    SELECT name, COUNT(*) as count
    FROM repositories
    GROUP BY name
    HAVING count > 1
  `).all() as Array<{ name: string; count: number }>;

  const duplicateGroups: DuplicateRepoGroup[] = [];

  for (const row of dupRows) {
    // Most recently updated first: if every copy is empty, the first one is kept
    const allRepos = db.prepare("SELECT * FROM repositories WHERE name = ? ORDER BY updated_at DESC, id").all(row.name) as Array<{
      id: string;
      name: string;
      full_name: string;
      owner_login: string;
      updated_at?: string;
      backfilled_at?: string | null;
    }>;

    const reposWithDetails: DuplicateRepoItem[] = allRepos.map((r) => {
      const commitsCount = (db.prepare("SELECT COUNT(*) as c FROM commits WHERE repo_id = ?").get(r.id) as { c: number }).c;
      const b = repoBuildingMap.get(r.id);
      const level = b ? b.level : 1;
      // Not-yet-backfilled repos may have commits that simply aren't indexed yet
      const canDelete = level === 1 && commitsCount === 0 && Boolean(r.backfilled_at) && deedsOnRepo(r.id) === 0;
      return {
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        ownerLogin: r.owner_login,
        ownerName: b ? b.kingdomName : r.owner_login,
        civilization: b ? b.kingdomCiv : undefined,
        commitsCount,
        level,
        canDelete,
        updatedAt: r.updated_at
      };
    });

    // Never offer every copy of a name for deletion: keep the most recently updated one
    if (reposWithDetails.every((r) => r.canDelete)) {
      reposWithDetails[0].canDelete = false;
    }

    const hasDeletable = reposWithDetails.some((r) => r.canDelete);

    // If every copy has commits or level > 1, none are accidental 0-commit duplicates
    // (e.g. .profile or shared project names across developers). Do not flag as a warning.
    // If at least one copy is an empty Level 1 duplicate (0 commits), flag it so the admin can delete it.
    if (!hasDeletable) {
      continue;
    }

    duplicateGroups.push({
      name: row.name,
      repos: reposWithDetails,
      hasDeletable
    });
  }

  if (duplicateGroups.length > 0) {
    const deletableTotal = duplicateGroups.reduce((sum, g) => sum + g.repos.filter((r) => r.canDelete).length, 0);
    warnings.push({
      id: "duplicate_repos",
      category: "duplicate_repos",
      title: "Duplicate Repositories",
      count: duplicateGroups.length,
      severity: "warning",
      summary: `${duplicateGroups.length} repository name${duplicateGroups.length > 1 ? "s exist" : " exists"} across multiple accounts (${deletableTotal} empty duplicate${deletableTotal === 1 ? "" : "s"} eligible for deletion).`,
      details: {
        groups: duplicateGroups
      }
    });
  }

  return warnings;
}

export interface IgnoredRepoCommitCheck {
  /**
   * has_commits: Git has commits for it that no other repo in the realm holds · shared: it has commits, but
   * all of them are already counted under another copy · empty: no commits · missing: gone from Git · error: Git did not answer
   */
  status: "has_commits" | "shared" | "empty" | "missing" | "error";
  /** Commits the repo has in Git (capped at the check's read limit) */
  commitCount: number;
  /** Of those, commits no repo in the realm holds yet */
  newCommitCount: number;
  /** Newest new commit (has_commits) or newest commit (shared) */
  latestCommitAt: string | null;
  /** The realm repo already holding most of its commits (shared) */
  sharedWith?: string | null;
  error?: string | null;
  checkedAt: string;
}

export interface IgnoredRepoRecord {
  id: string;
  fullName: string;
  name: string;
  ownerLogin: string;
  reason: string;
  deletedAt: string;
  /** The latest commit check, when an admin has run one */
  commitCheck?: IgnoredRepoCommitCheck | null;
}

export function getIgnoredRepoIds(): Set<string> {
  try {
    const rows = db.prepare("SELECT id, full_name FROM ignored_repositories").all() as Array<{ id: string; full_name: string }>;
    const set = new Set<string>();
    for (const r of rows) {
      if (r.id) set.add(r.id.toLowerCase());
      if (r.full_name) {
        set.add(r.full_name.toLowerCase());
        set.add(`repo-${r.full_name.toLowerCase()}`);
      }
    }
    return set;
  } catch {
    return new Set<string>();
  }
}

export function getIgnoredRepositories(): IgnoredRepoRecord[] {
  try {
    const rows = db.prepare(`
      SELECT r.id, r.full_name, r.name, r.owner_login, r.reason, r.deleted_at,
             c.status AS check_status, c.commit_count, c.new_commit_count, c.latest_commit_at, c.shared_with, c.error AS check_error, c.checked_at
      FROM ignored_repositories r LEFT JOIN ignored_repo_checks c ON c.repo_id = r.id
      ORDER BY r.deleted_at DESC
    `).all() as Array<{
      id: string;
      full_name: string;
      name: string;
      owner_login: string;
      reason: string;
      deleted_at: string;
      check_status: IgnoredRepoCommitCheck["status"] | null;
      commit_count: number | null;
      new_commit_count: number | null;
      latest_commit_at: string | null;
      shared_with: string | null;
      check_error: string | null;
      checked_at: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      name: r.name,
      ownerLogin: r.owner_login,
      reason: r.reason,
      deletedAt: r.deleted_at,
      commitCheck: r.check_status && r.checked_at
        ? {
            status: r.check_status,
            commitCount: r.commit_count ?? 0,
            newCommitCount: r.new_commit_count ?? 0,
            latestCommitAt: r.latest_commit_at,
            sharedWith: r.shared_with,
            error: r.check_error,
            checkedAt: r.checked_at
          }
        : null
    }));
  } catch {
    return [];
  }
}

export function restoreIgnoredRepository(repoId: string): { success: boolean; message: string; repo?: IgnoredRepoRecord } {
  const row = db.prepare("SELECT id, full_name, name, owner_login, reason, deleted_at FROM ignored_repositories WHERE LOWER(id) = LOWER(?) OR LOWER(full_name) = LOWER(?)").get(repoId, repoId) as {
    id: string;
    full_name: string;
    name: string;
    owner_login: string;
    reason: string;
    deleted_at: string;
  } | undefined;

  if (!row) {
    throw new Error(`Repository ${repoId} is not in the ignored repositories list`);
  }

  db.prepare("DELETE FROM ignored_repositories WHERE LOWER(id) = LOWER(?) OR LOWER(full_name) = LOWER(?)").run(row.id, row.full_name);
  db.prepare("DELETE FROM ignored_repo_checks WHERE repo_id = ?").run(row.id);

  return {
    success: true,
    message: `Restored ${row.full_name} (${row.name}). It will be re-synchronized from Git on the next sync cycle.`,
    repo: {
      id: row.id,
      fullName: row.full_name,
      name: row.name,
      ownerLogin: row.owner_login,
      reason: row.reason,
      deletedAt: row.deleted_at
    }
  };
}

// Columns added after the table first shipped
{
  const cols = (db.prepare("PRAGMA table_info(ignored_repo_checks)").all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes("new_commit_count")) db.exec("ALTER TABLE ignored_repo_checks ADD COLUMN new_commit_count INTEGER NOT NULL DEFAULT 0");
  if (!cols.includes("shared_with")) db.exec("ALTER TABLE ignored_repo_checks ADD COLUMN shared_with TEXT");
}

/**
 * Which of these commit hashes the realm already holds, mapped to the full name of the repo they are
 * credited to. A commit is stored once, so a copied repo's history sits under whichever copy synced first.
 */
export function realmCommitOwners(hashes: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < hashes.length; i += 500) {
    const chunk = hashes.slice(i, i + 500);
    const rows = db
      .prepare(`SELECT c.hash, COALESCE(r.full_name, c.repo_id) AS repo FROM commits c LEFT JOIN repositories r ON r.id = c.repo_id WHERE c.hash IN (${chunk.map(() => "?").join(",")})`)
      .all(...chunk) as Array<{ hash: string; repo: string }>;
    for (const row of rows) out.set(row.hash, row.repo);
  }
  return out;
}

/** Saves the result of asking Git whether an ignored repo has commits now (one row per repo, latest wins). */
export function saveIgnoredRepoCheck(repoId: string, check: IgnoredRepoCommitCheck) {
  db.prepare(`
    INSERT OR REPLACE INTO ignored_repo_checks (repo_id, status, commit_count, new_commit_count, latest_commit_at, shared_with, error, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(repoId, check.status, check.commitCount, check.newCommitCount, check.latestCommitAt, check.sharedWith ?? null, check.error ?? null, check.checkedAt);
}

type DeletableRepoRow = { id: string; name: string; full_name: string; owner_login: string; backfilled_at: string | null };

/** Deed reports written on a repo, whatever their status (a deed's XP lands on its repo) */
const deedsOnRepo = (repoId: string) => (db.prepare("SELECT COUNT(*) AS c FROM deeds WHERE repo_id = ?").get(repoId) as { c: number }).c;

/**
 * Why a repository may not be deleted as a duplicate, or null when it may. A repo is only deletable when
 * its history is fully indexed (backfilled) and still has 0 commits, and another copy with the same
 * name remains — so a not-yet-backfilled repo or the last copy of a name is never removed.
 */
function duplicateDeleteBlocker(repo: DeletableRepoRow): string | null {
  if (!repo.backfilled_at) {
    return `${repo.full_name} has not finished historical backfill yet; its commits may not be indexed.`;
  }
  const commitsCount = (db.prepare("SELECT COUNT(*) as c FROM commits WHERE repo_id = ?").get(repo.id) as { c: number }).c;
  if (commitsCount > 0) {
    return `${repo.full_name} has ${commitsCount} commits recorded. Only 0-commit duplicate repositories may be deleted.`;
  }
  const deeds = deedsOnRepo(repo.id);
  if (deeds > 0) {
    return `${repo.full_name} has ${deeds} deed report${deeds === 1 ? "" : "s"} written on it.`;
  }
  const others = (db.prepare("SELECT COUNT(*) as c FROM repositories WHERE name = ? AND id <> ?").get(repo.name, repo.id) as { c: number }).c;
  if (others === 0) {
    return `${repo.full_name} is the last repository named "${repo.name}"; it is not a duplicate.`;
  }
  return null;
}

/** Records the repo in ignored_repositories (so Git sync won't re-add it) and removes it with all linked rows. */
function purgeRepository(repo: DeletableRepoRow, deletedAt: string) {
  db.prepare(`
    INSERT OR REPLACE INTO ignored_repositories (id, full_name, name, owner_login, reason, deleted_at)
    VALUES (?, ?, ?, ?, 'admin_deleted', ?)
  `).run(repo.id, repo.full_name, repo.name, repo.owner_login || "unknown", deletedAt);

  db.prepare("DELETE FROM kingdom_layout WHERE repo_id = ?").run(repo.id);
  db.prepare("DELETE FROM user_subscriptions WHERE repo_id = ?").run(repo.id);
  db.prepare("DELETE FROM project_repos WHERE repo_id = ?").run(repo.id);
  db.prepare("DELETE FROM repo_emails WHERE repo_id = ?").run(repo.id);
  db.prepare("DELETE FROM pull_reviews WHERE repo_id = ?").run(repo.id);
  db.prepare("DELETE FROM pull_requests WHERE repo_id = ?").run(repo.id);
  db.prepare("DELETE FROM commits WHERE repo_id = ?").run(repo.id);
  db.prepare("DELETE FROM repositories WHERE id = ?").run(repo.id);
}

const stmtGetRepoForDelete = db.prepare("SELECT id, name, full_name, owner_login, backfilled_at FROM repositories WHERE id = ?");

/**
 * Safely deletes a duplicate 0-commit repository from SQLite (see `duplicateDeleteBlocker`).
 * Records it into ignored_repositories so Git sync will not re-add it.
 */
export const deleteAdminRepository = db.transaction((repoId: string): { success: boolean; message: string } => {
  const repo = stmtGetRepoForDelete.get(repoId) as DeletableRepoRow | undefined;
  if (!repo) {
    throw new Error("Repository not found");
  }
  const blocker = duplicateDeleteBlocker(repo);
  if (blocker) {
    throw new Error(`Safety check failed: ${blocker}`);
  }

  purgeRepository(repo, new Date().toISOString());

  return {
    success: true,
    message: `Repository ${repo.full_name} (${repo.name}) deleted and permanently ignored from Git sync.`
  };
});

/**
 * Safely deletes multiple duplicate 0-commit repositories in a single transaction.
 * Every repo passes `duplicateDeleteBlocker` at the moment it is deleted, so at least one copy
 * of each name always survives; repos that fail the check are skipped.
 */
export const deleteAdminRepositories = db.transaction((repoIds: string[]): { success: boolean; deletedCount: number; skippedCount: number; message: string } => {
  let deletedCount = 0;
  let skippedCount = 0;
  const now = new Date().toISOString();

  for (const repoId of repoIds) {
    const repo = stmtGetRepoForDelete.get(repoId) as DeletableRepoRow | undefined;
    if (!repo || duplicateDeleteBlocker(repo)) {
      skippedCount++;
      continue;
    }
    purgeRepository(repo, now);
    deletedCount++;
  }

  return {
    success: true,
    deletedCount,
    skippedCount,
    message: `Successfully deleted ${deletedCount} duplicate repositories and permanently ignored them from Git sync.` +
      (skippedCount > 0 ? ` ${skippedCount} skipped by safety checks.` : "")
  };
});

