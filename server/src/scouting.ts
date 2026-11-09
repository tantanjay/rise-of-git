import { db } from "./db.js";
import { estimateNaturalBirths, estimateNaturalDeaths } from "./demographics.js";
import { CivilizationType, FogRange, MarchTargetKind, MarchTargetType, ScoutDetails, ScoutEstimate, ScoutReport } from "./types.js";
import { computeWallState, maxSoldiersFor, NPC_GATE_CIV, NPC_KINGDOM_REFILL_SHARE, npcTreasuryCapOf, SCOUT_REPORT_TTL_MS, VOID_NPC } from "./warConfig.js";

/**
 * Scout reports (GAME_GUIDE §13): written when scouts reach their target, visible to their ruler
 * once the scouts are home (`available_at`). Only the latest report per ruler and target is kept, plus the latest
 * caught row (`outcome = 'caught'`: the scouts died, nothing came back), which never counts as intel.
 * `deceived` marks a false report; it stays on the server (the report must look normal).
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS scout_reports (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_name TEXT NOT NULL,
    taken_at INTEGER NOT NULL,
    available_at INTEGER NOT NULL,
    details_json TEXT NOT NULL,
    outcome TEXT,
    deceived INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_scout_reports_owner ON scout_reports(owner_id, target_id);
`);

const rowToReport = (r: any, now: number): ScoutReport => withEstimate({
  id: r.id,
  ownerId: r.owner_id,
  targetType: r.target_type,
  targetKind: r.target_kind,
  targetId: r.target_id,
  targetName: r.target_name,
  takenAt: r.taken_at,
  availableAt: r.available_at,
  details: JSON.parse(r.details_json),
  ...(r.outcome === "caught" ? { caught: JSON.parse(r.details_json).caught } : {})
}, now);

export function writeScoutReport(params: {
  ownerId: string;
  targetType: MarchTargetType;
  targetKind: MarchTargetKind;
  targetId: string;
  targetName: string;
  takenAt: number;
  availableAt: number;
  details: ScoutDetails;
  /** A false report (kept server-side only) */
  deceived?: boolean;
}): ScoutReport {
  const { deceived, ...report } = params;
  const id = `scout_${params.takenAt}_${Math.random().toString(36).substring(2, 7)}`;
  db.transaction(() => {
    db.prepare(`DELETE FROM scout_reports WHERE owner_id = ? AND target_id = ?`).run(params.ownerId, params.targetId);
    db.prepare(`
      INSERT INTO scout_reports (id, owner_id, target_type, target_kind, target_id, target_name, taken_at, available_at, details_json, deceived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.ownerId, params.targetType, params.targetKind, params.targetId, params.targetName, params.takenAt, params.availableAt, JSON.stringify(params.details), deceived ? 1 : 0);
  })();
  return { id, ...report };
}

/** Scouts caught on the way: a red row in the War Room. The last true report on that target stays (it's still intel) */
export function writeCaughtScoutRow(params: {
  ownerId: string;
  targetType: MarchTargetType;
  targetKind: MarchTargetKind;
  targetId: string;
  targetName: string;
  at: number;
  scouts: number;
  /** Who caught them: "the watch of <gate>", "<ruler>'s spymasters", "the citadel's wards" */
  by: string;
}) {
  const id = `scout_${params.at}_${Math.random().toString(36).substring(2, 7)}`;
  const details = { emblem: "💀", caught: { scouts: params.scouts, by: params.by } };
  db.transaction(() => {
    db.prepare(`DELETE FROM scout_reports WHERE owner_id = ? AND target_id = ? AND outcome = 'caught'`).run(params.ownerId, params.targetId);
    db.prepare(`
      INSERT INTO scout_reports (id, owner_id, target_type, target_kind, target_id, target_name, taken_at, available_at, details_json, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'caught')
    `).run(id, params.ownerId, params.targetType, params.targetKind, params.targetId, params.targetName, params.at, params.at, JSON.stringify(details));
  })();
}

/** The ruler's delivered reports, newest first (optionally for one target) */
export function getScoutReports(ownerId: string, targetId?: string, now = Date.now()): ScoutReport[] {
  db.prepare(`DELETE FROM scout_reports WHERE taken_at < ?`).run(now - SCOUT_REPORT_TTL_MS);
  const rows = targetId
    ? db.prepare(`SELECT * FROM scout_reports WHERE owner_id = ? AND target_id = ? AND available_at <= ? ORDER BY taken_at DESC`).all(ownerId, targetId, now)
    : db.prepare(`SELECT * FROM scout_reports WHERE owner_id = ? AND available_at <= ? ORDER BY taken_at DESC LIMIT 50`).all(ownerId, now);
  return (rows as any[]).map((r) => rowToReport(r, now));
}

/** Latest delivered report per target id, for fogging lists (caught rows are no intel) */
export function latestScoutReportsByTarget(ownerId: string | null, now = Date.now()): Map<string, ScoutReport> {
  const out = new Map<string, ScoutReport>();
  if (!ownerId) return out;
  for (const r of getScoutReports(ownerId, undefined, now)) if (!r.caught && !out.has(r.targetId)) out.set(r.targetId, r);
  return out;
}

/* ------------------------------------------------------------------------- */
/* Estimates: a report projected to now                                      */
/* ------------------------------------------------------------------------- */

/** Under this age a report still reads as exact (soldiers away can't have come home yet) */
const FRESH_MS = 60_000;
/** Projection steps are capped (a week of 15-minute harvests is 672) */
const MAX_HARVESTS = 1000;
const BULK = ["gold", "iron", "stone", "lumber", "food"] as const;

const harvestsBetween = (from: number, to: number) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM allocation_logs WHERE cycle_timestamp > ? AND cycle_timestamp <= ?`).get(new Date(from).toISOString(), new Date(to).toISOString()) as { n: number }).n;

const range = (seen: number, projected: number): FogRange => ({ lo: Math.max(0, Math.min(seen, projected)), hi: Math.max(0, seen, projected) });

/** Population after `n` harvests of natural births and deaths (no Royal Gardens: the scouts can't count those) */
function projectPopulation(pop: number, soldiers: number, maxPop: number, civ: CivilizationType, n: number): number {
  let p = pop;
  for (let i = 0; i < n && maxPop > 0; i++) {
    const sat = Math.min(1, p / maxPop);
    const births = Math.min(Math.max(0, maxPop - p), estimateNaturalBirths(p, civ, sat));
    const deaths = estimateNaturalDeaths(p, civ, sat, Math.max(0, p - soldiers));
    if (births === 0 && deaths === 0) break;
    p += births - deaths;
  }
  return p;
}

/**
 * Projects a report to now from what the scouts saw and public rules only, never the target's live numbers,
 * so an estimate can't leak anything a scout didn't see. Each number becomes a range from the scouted value
 * to the projected one.
 */
export function estimateReport(report: ScoutReport, now = Date.now()): ScoutEstimate | undefined {
  const d = report.details;
  const kingdom = report.targetType === "dev_kingdom";
  const spire = report.targetType === "spire";
  const npcKingdom = report.targetKind === "npc_kingdom";
  if (!kingdom && !spire && !npcKingdom) return undefined;

  const age = now - report.takenAt;
  const harvests = Math.min(MAX_HARVESTS, harvestsBetween(report.takenAt, now));
  const est: ScoutEstimate = { harvests };
  const civ = d.civilization ?? "human";
  const garrison = d.garrison ?? 0;

  if (d.wallHp !== undefined && d.wallMaxHp) est.wallHp = range(d.wallHp, age < FRESH_MS ? d.wallHp : computeWallState(d.wallHp, report.takenAt, d.wallMaxHp, now).wallHp);

  if (spire) {
    const max = d.maxGarrison ?? garrison;
    const regen = garrison < max ? Math.max(1, Math.round(max * VOID_NPC.REGEN_PER_HARVEST)) : 0;
    est.garrison = range(garrison, Math.min(max, garrison + regen * harvests));
    return est;
  }

  if (npcKingdom) {
    // Like their harvest: births join the garrison, the treasury refills a share of its cap
    let pop = d.population ?? 0;
    let g = garrison;
    const maxPop = d.maxPopulation ?? pop;
    for (let i = 0; i < harvests && pop < maxPop; i++) {
      const births = Math.min(maxPop - pop, estimateNaturalBirths(pop, civ, Math.min(1, pop / maxPop)));
      pop += births;
      g = Math.min(maxSoldiersFor(pop, civ), g + births);
    }
    est.population = range(d.population ?? 0, pop);
    est.garrison = range(garrison, g);
    if (d.treasury) {
      const level = d.cityHallLevel ?? 1;
      est.treasury = {};
      for (const k of BULK) {
        const cap = npcTreasuryCapOf(k, level, Boolean(NPC_GATE_CIV[report.targetId]));
        est.treasury[k] = range(d.treasury[k], Math.min(cap, Math.max(d.treasury[k], d.treasury[k] + cap * NPC_KINGDOM_REFILL_SHARE * harvests)));
      }
    }
    return est;
  }

  // A ruler's kingdom: soldiers away may be home by now; people are born and die; harvests pay what the last one did
  const away = age < FRESH_MS ? 0 : d.soldiersAway ?? 0;
  est.garrison = range(garrison, garrison + away);
  if (d.population !== undefined) est.population = range(d.population, projectPopulation(d.population, garrison, d.maxPopulation ?? d.population, civ, harvests));
  if (d.treasury) {
    const income = d.harvestIncome;
    est.treasury = {};
    for (const k of BULK) est.treasury[k] = range(d.treasury[k], d.treasury[k] + (income?.[k] ?? 0) * harvests);
  }
  if (d.scarce) {
    est.scarce = {};
    // Each harvest drops one gem kind: any of them may have grown by the whole drop
    for (const [k, v] of Object.entries(d.scarce)) est.scarce[k] = range(v, v + (d.harvestIncome?.scarce ?? 0) * harvests);
  }
  return est;
}

function withEstimate(report: ScoutReport, now: number): ScoutReport {
  if (report.caught) return report;
  const estimate = estimateReport(report, now);
  return estimate ? { ...report, estimate } : report;
}
