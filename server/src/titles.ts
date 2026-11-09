/**
 * Milestone titles (GAME_GUIDE §13 → Milestone Titles): rulers earn one title per category from their
 * Git history and war record. Each category grants its highest reached tier only; categories stack additively.
 *
 * Titles are cached in `user_earned_titles` and recomputed on Live Sync, after battles and when gatherers return,
 * so war ticks only read the cached rows.
 */
import { db, isSpecialUserId, getAllKingdomsFromDB, consumeRepoHoldingsChanged } from "./db.js";
import { PLAY_DAY_MIN_ACTIONS } from "./kingdomUtils.js";
import { DeveloperKingdom } from "./types.js";
import { EarnedTitle, TitleBuffType, TitleCategory } from "./types.js";

interface TitleTierDef {
  threshold: number;
  name: string;
  emblem: string;
  buffPct: number;
}

interface TitleCategoryDef {
  category: TitleCategory;
  label: string;
  buffType: TitleBuffType;
  tiers: [TitleTierDef, TitleTierDef, TitleTierDef];
}

export const TITLE_CATEGORIES: TitleCategoryDef[] = [
  {
    category: "loc",
    label: "Lines of Code",
    buffType: "hp",
    tiers: [
      { threshold: 5_000_000, name: "Scribe of the Archive", emblem: "📜", buffPct: 0.02 },
      { threshold: 15_000_000, name: "Grand Code-Architect", emblem: "🏛️", buffPct: 0.05 },
      { threshold: 25_000_000, name: "Eternal Chronicler", emblem: "🌌", buffPct: 0.1 }
    ]
  },
  {
    category: "commits",
    label: "Commits",
    buffType: "atk",
    tiers: [
      { threshold: 500, name: "The Diligent Ironforge", emblem: "⚒️", buffPct: 0.02 },
      { threshold: 2_000, name: "The Relentless Vanguard", emblem: "⚔️", buffPct: 0.05 },
      { threshold: 3_500, name: "Mythic Warforger", emblem: "🌋", buffPct: 0.1 }
    ]
  },
  {
    category: "active_days",
    label: "Active Days",
    buffType: "def",
    tiers: [
      // Distinct days with a commit (not calendar time since joining)
      { threshold: 200, name: "Steadfast Sentinel", emblem: "🛡️", buffPct: 0.02 },
      { threshold: 600, name: "Unyielding Bulwark", emblem: "🏰", buffPct: 0.05 },
      { threshold: 1_200, name: "Ancient Aegis of Epochs", emblem: "💠", buffPct: 0.1 }
    ]
  },
  {
    category: "repo_holdings",
    label: "Repo Holdings",
    buffType: "all",
    tiers: [
      // Built repos whose building reached Lv 3 (REPO_HOLDING_MIN_LEVEL), idle ones included
      { threshold: 5, name: "Steward of Five Halls", emblem: "🏘️", buffPct: 0.01 },
      { threshold: 10, name: "Lord of Many Holdings", emblem: "🏙️", buffPct: 0.02 },
      { threshold: 20, name: "Architect of Dominions", emblem: "🗺️", buffPct: 0.03 }
    ]
  },
  {
    category: "legendary_buildings",
    label: "Legendary Buildings",
    buffType: "all",
    tiers: [
      // Buildings at the Lv 25 cap (MAX_BUILDING_LEVEL): the rarest titles in the realm
      { threshold: 1, name: "Keeper of a Wonder", emblem: "🏯", buffPct: 0.02 },
      { threshold: 2, name: "Lord of Twin Wonders", emblem: "🗼", buffPct: 0.04 },
      { threshold: 3, name: "Architect of Legends", emblem: "🌟", buffPct: 0.06 }
    ]
  },
  {
    category: "play_days",
    label: "Game Activity",
    buffType: "harvest",
    tiers: [
      // Days with at least PLAY_DAY_MIN_ACTIONS game actions; the bonus is capped per harvest (executeResourceAllocation)
      { threshold: 30, name: "Herald of the Realm", emblem: "🎺", buffPct: 0.1 },
      { threshold: 90, name: "Steward of the Treasury", emblem: "🪙", buffPct: 0.2 },
      { threshold: 180, name: "Undying Sovereign", emblem: "👑", buffPct: 0.3 }
    ]
  },
  {
    category: "boss_kills",
    label: "World Boss Kills",
    buffType: "all",
    tiers: [
      { threshold: 10, name: "Beastslayer of the Wilds", emblem: "🏹", buffPct: 0.01 },
      { threshold: 50, name: "Colossus Decimator", emblem: "⚡", buffPct: 0.02 },
      { threshold: 100, name: "Apex Worldbreaker", emblem: "🐉", buffPct: 0.03 }
    ]
  },
  {
    category: "pvp_kills",
    label: "Kingdom Kills",
    buffType: "atk",
    tiers: [
      { threshold: 1_000, name: "Bloodbound Raider", emblem: "🩸", buffPct: 0.02 },
      { threshold: 10_000, name: "Conqueror of Realms", emblem: "👑", buffPct: 0.05 },
      { threshold: 100_000, name: "Sovereign Executioner", emblem: "☠️", buffPct: 0.1 }
    ]
  },
  {
    category: "gathering",
    label: "Resources Gathered",
    buffType: "hp",
    tiers: [
      { threshold: 10_000, name: "The Earth Harvester", emblem: "🌾", buffPct: 0.02 },
      { threshold: 100_000, name: "Master of Abundance", emblem: "💎", buffPct: 0.05 },
      { threshold: 1_000_000, name: "Titan of the Endless Vault", emblem: "🪙", buffPct: 0.1 }
    ]
  },
  {
    category: "mob_kills",
    label: "Mob & Bandit Kills",
    buffType: "def",
    tiers: [
      { threshold: 1_000, name: "Shield of the Frontier", emblem: "🌲", buffPct: 0.02 },
      { threshold: 10_000, name: "Scourge of the Lawless", emblem: "⚖️", buffPct: 0.05 },
      { threshold: 100_000, name: "Immortal Peacekeeper", emblem: "🕊️", buffPct: 0.1 }
    ]
  }
];

export type TitleStats = Record<TitleCategory, number>;

const emptyStats = (): TitleStats => ({ loc: 0, commits: 0, active_days: 0, repo_holdings: 0, legendary_buildings: 0, play_days: 0, boss_kills: 0, pvp_kills: 0, gathering: 0, mob_kills: 0 });

/* ------------------------------------------------------------------------- */
/* Telemetry                                                                 */
/* ------------------------------------------------------------------------- */

// Same commit matching as getAllKingdomsFromDB: Git login, primary email or any learned email.
// Active days use the commit's own calendar date (its local timezone), like the contribution calendar.
const stmtCommitStats = db.prepare(`
  SELECT COUNT(*) AS commits,
         COALESCE(SUM(COALESCE(c.lines_added, 0) + COALESCE(c.lines_deleted, 0)), 0) AS loc,
         COUNT(DISTINCT substr(c.committed_at, 1, 10)) AS active_days
  FROM commits c
  JOIN repositories r ON c.repo_id = r.id
  WHERE c.author_login = @id
     OR c.author_email = @email
     OR c.author_email IN (SELECT email FROM user_emails WHERE user_id = @id)
`);

const stmtGathered = db.prepare(`
  SELECT COALESCE(SUM(
    MAX(COALESCE(gold_delta, 0), 0) + MAX(COALESCE(iron_delta, 0), 0) + MAX(COALESCE(stone_delta, 0), 0) +
    MAX(COALESCE(lumber_delta, 0), 0) + MAX(COALESCE(food_delta, 0), 0)
  ), 0) AS gathered
  FROM resource_ledger
  WHERE user_id = ? AND type = 'gathering_haul'
`);

const stmtPlayDays = db.prepare(`SELECT COUNT(*) AS days FROM player_activity WHERE user_id = ? AND actions >= ?`);

interface ReportRow {
  target_type: string;
  category: string | null;
  attacker_id: string;
  defender_id: string;
  attacker_casualties: number;
  defender_casualties: number;
  defender_initial: number;
  armies: string | null;
  bounty: string | null;
}

const REPORT_COLUMNS = `
  target_type,
  json_extract(details_json, '$.defenderNpc.category') AS category,
  attacker_id, defender_id, attacker_casualties, defender_casualties,
  defender_initial_soldiers AS defender_initial,
  json_extract(details_json, '$.armies') AS armies,
  json_extract(details_json, '$.bossBounty') AS bounty
`;

const battleReportsExist = () => Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'battle_reports'`).get());

/**
 * Units each ruler slew in one battle. A side's kills are the other side's losses, split between that side's
 * armies by the troops they brought; the defending ruler's home garrison counts as one army.
 * Old reports without an army list credit everything to the lead attacker / the defender.
 */
function killsByRuler(r: ReportRow, defendedByRuler: boolean): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: string, n: number) => {
    if (id && n > 0) out.set(id, (out.get(id) ?? 0) + n);
  };
  let armies: Array<{ side: "attacker" | "defender"; ownerId: string; initial: number }>;
  try {
    armies = r.armies ? JSON.parse(r.armies) : [];
  } catch {
    armies = [];
  }
  const attackers = armies.filter((a) => a.side === "attacker");
  if (attackers.length === 0) add(r.attacker_id, r.defender_casualties);
  else {
    const total = attackers.reduce((s, a) => s + (a.initial || 0), 0);
    for (const a of attackers) add(a.ownerId, total > 0 ? (r.defender_casualties * (a.initial || 0)) / total : 0);
  }

  // Defending side only counts when a ruler defended (not NPC packs, bosses or open spires)
  if (defendedByRuler) {
    const reinforcements = armies.filter((a) => a.side === "defender");
    const reinforced = reinforcements.reduce((s, a) => s + (a.initial || 0), 0);
    const home = Math.max(0, (r.defender_initial || 0) - reinforced);
    const total = home + reinforced;
    if (total > 0) {
      add(r.defender_id, (r.attacker_casualties * home) / total);
      for (const a of reinforcements) add(a.ownerId, (r.attacker_casualties * (a.initial || 0)) / total);
    }
  }
  return out;
}

/** War tallies for every ruler from battle reports, in one pass */
function warStatsFor(userId?: string): Map<string, Pick<TitleStats, "boss_kills" | "pvp_kills" | "mob_kills">> {
  const out = new Map<string, Pick<TitleStats, "boss_kills" | "pvp_kills" | "mob_kills">>();
  if (!battleReportsExist()) return out;
  const rows = (
    userId
      ? db.prepare(`SELECT ${REPORT_COLUMNS} FROM battle_reports WHERE attacker_id = ? OR defender_id = ? OR participants LIKE ?`).all(userId, userId, `%,${userId},%`)
      : db.prepare(`SELECT ${REPORT_COLUMNS} FROM battle_reports`).all()
  ) as ReportRow[];
  const rulers = new Set((db.prepare(`SELECT id FROM users`).all() as Array<{ id: string }>).map((u) => u.id));
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { boss_kills: 0, pvp_kills: 0, mob_kills: 0 }));
    return s;
  };

  for (const r of rows) {
    // A boss kill counts for everyone who shares its bounty (everyone who wounded it this life)
    if (r.category === "boss" && r.bounty) {
      try {
        for (const b of JSON.parse(r.bounty) as Array<{ userId: string }>) if (b.userId) get(b.userId).boss_kills++;
      } catch {
        // Ignore malformed bounty
      }
      continue;
    }
    // Spires count as PvP only while a ruler holds them (not NPC void garrisons)
    const pvp = r.target_type === "dev_kingdom" || (r.target_type === "spire" && rulers.has(r.defender_id));
    const mob = r.target_type === "npc" && (r.category === "mob" || r.category === "bandit");
    if (!pvp && !mob) continue;
    for (const [id, n] of killsByRuler(r, pvp)) {
      if (pvp) get(id).pvp_kills += n;
      else get(id).mob_kills += n;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Evaluation & cache                                                        */
/* ------------------------------------------------------------------------- */

/** Highest tier reached in each category for these totals */
export function titlesForStats(stats: TitleStats, unlockedAt = new Date().toISOString()): EarnedTitle[] {
  const out: EarnedTitle[] = [];
  for (const def of TITLE_CATEGORIES) {
    const value = Math.floor(stats[def.category] ?? 0);
    let reached = 0;
    def.tiers.forEach((t, i) => {
      if (value >= t.threshold) reached = i + 1;
    });
    if (reached === 0) continue;
    const t = def.tiers[reached - 1];
    out.push({ category: def.category, tier: reached, name: t.name, emblem: t.emblem, buffType: def.buffType, buffPct: t.buffPct, unlockedAt });
  }
  return out;
}

const stmtGetUser = db.prepare(`SELECT id, email, repo_holdings, legendary_buildings FROM users WHERE id = ?`);
const stmtAllUsers = db.prepare(`SELECT id, email, repo_holdings, legendary_buildings FROM users`);
const stmtUserTitles = db.prepare(`SELECT category, tier, unlocked_at FROM user_earned_titles WHERE user_id = ?`);
const stmtUpsertTitle = db.prepare(`
  INSERT INTO user_earned_titles (user_id, category, tier, title_name, emblem, buff_type, buff_pct, unlocked_at)
  VALUES (@userId, @category, @tier, @name, @emblem, @buffType, @buffPct, @unlockedAt)
  ON CONFLICT(user_id, category) DO UPDATE SET
    tier = excluded.tier, title_name = excluded.title_name, emblem = excluded.emblem,
    buff_type = excluded.buff_type, buff_pct = excluded.buff_pct, unlocked_at = excluded.unlocked_at
`);
const stmtDeleteTitle = db.prepare(`DELETE FROM user_earned_titles WHERE user_id = ? AND category = ?`);

interface TitleUser {
  id: string;
  email: string | null;
  /** Built repos at building Lv 3+, saved by the last realm build */
  repo_holdings: number;
  /** Buildings at Lv 25, saved by the last realm build */
  legendary_buildings: number;
}

type CommitStats = Pick<TitleStats, "commits" | "loc" | "active_days">;

/** Commit totals from the last full read; commits only change on sync, so battles reuse them */
const commitStatsCache = new Map<string, CommitStats>();

function commitStatsFor(user: TitleUser, fresh: boolean): CommitStats {
  const cached = commitStatsCache.get(user.id);
  if (cached && !fresh) return cached;
  const c = stmtCommitStats.get({ id: user.id, email: user.email || "" }) as CommitStats;
  commitStatsCache.set(user.id, c);
  return c;
}

function statsFor(user: TitleUser, war: Pick<TitleStats, "boss_kills" | "pvp_kills" | "mob_kills"> | undefined, freshCommits = true): TitleStats {
  const c = commitStatsFor(user, freshCommits);
  const g = stmtGathered.get(user.id) as { gathered: number };
  const play = stmtPlayDays.get(user.id.toLowerCase(), PLAY_DAY_MIN_ACTIONS) as { days: number };
  return { ...emptyStats(), loc: c.loc, commits: c.commits, active_days: c.active_days, repo_holdings: user.repo_holdings ?? 0, legendary_buildings: user.legendary_buildings ?? 0, play_days: play.days, gathering: g.gathered, ...war };
}

/** Writes the user's titles; a category keeps its unlock date until its tier changes. Returns newly reached titles. */
function storeTitles(userId: string, stats: TitleStats): EarnedTitle[] {
  const now = new Date().toISOString();
  // Special Overseers hold their own fixed title instead of the milestone ladder (stored ones are removed)
  const earned = isSpecialUserId(userId) ? [] : titlesForStats(stats, now);
  const previous = new Map((stmtUserTitles.all(userId) as Array<{ category: string; tier: number; unlocked_at: string }>).map((r) => [r.category, r]));
  const promoted: EarnedTitle[] = [];
  for (const t of earned) {
    const prev = previous.get(t.category);
    if (prev && prev.tier === t.tier) t.unlockedAt = prev.unlocked_at;
    else if (!prev || prev.tier < t.tier) promoted.push(t);
    stmtUpsertTitle.run({ userId, ...t });
    previous.delete(t.category);
  }
  // Tier lost (e.g. commits re-attributed to someone else)
  for (const category of previous.keys()) stmtDeleteTitle.run(userId, category);
  return promoted;
}

export type TitlePromotion = { userId: string; title: EarnedTitle };

/**
 * Re-evaluates one ruler's titles. After a battle or a gathering haul the commit totals of the last sync are
 * reused; pass `freshCommits` when their commits changed (admin re-check).
 */
export function recalculateUserTitles(userId: string, freshCommits = false): EarnedTitle[] {
  const user = stmtGetUser.get(userId) as TitleUser | undefined;
  if (!user) return [];
  return db.transaction(() => storeTitles(user.id, statsFor(user, warStatsFor(user.id).get(user.id), freshCommits)))();
}

/** Re-evaluates every ruler's titles (Live Sync); battle reports are scanned once for everyone */
export function recalculateAllTitles(): TitlePromotion[] {
  const users = stmtAllUsers.all() as Array<TitleUser>;
  const war = warStatsFor();
  const promotions: TitlePromotion[] = [];
  db.transaction(() => {
    for (const u of users) for (const title of storeTitles(u.id, statsFor(u, war.get(u.id)))) promotions.push({ userId: u.id, title });
  })();
  return promotions;
}

/**
 * Re-evaluates every ruler's titles and builds the realm. Building levels are not stored: every realm build
 * recalculates each repo's level from all its XP and saves the Lv 3+ count. When that count changed, titles are
 * re-evaluated and the realm rebuilt once more, so a repo reaching Lv 3 counts in the same sync.
 */
export function rebuildRealmWithTitles(): { kingdoms: DeveloperKingdom[]; promotions: TitlePromotion[] } {
  const promotions = recalculateAllTitles();
  let kingdoms = getAllKingdomsFromDB();
  if (consumeRepoHoldingsChanged()) {
    promotions.push(...recalculateAllTitles());
    kingdoms = getAllKingdomsFromDB();
  }
  return { kingdoms, promotions };
}

/** Recalculates several rulers, ignoring failures so a battle never fails over its titles */
export function recalculateTitlesFor(userIds: Iterable<string>): TitlePromotion[] {
  const promotions: TitlePromotion[] = [];
  for (const id of new Set(userIds)) {
    if (!id) continue;
    try {
      for (const title of recalculateUserTitles(id)) promotions.push({ userId: id, title });
    } catch (err: any) {
      console.error(`[Titles] Failed to recalculate titles for ${id}:`, err.message);
    }
  }
  return promotions;
}

/** Raw totals behind a ruler's titles (for progress bars) */
export function getTitleProgress(userId: string): TitleStats | null {
  const user = stmtGetUser.get(userId) as TitleUser | undefined;
  if (!user) return null;
  return statsFor(user, warStatsFor(user.id).get(user.id), false);
}
