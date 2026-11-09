import { db } from "./db.js";
import { BattleReport, BossKill, BossNext, BossStatus, CivilizationType, DeveloperKingdom, MapNPC, MarchTargetKind, NodeStatus, NpcKingdomStatus, NPCCategory } from "./types.js";
import { getOrGenerateFlatWorldMap, getRovingSpawns, WAVE_NODE_PREFIX } from "./worldMapGenerator.js";
import {
  BOSS_RESPAWN_MS,
  vengefulBossUnit,
  bossUnitFor,
  bulkOf,
  computeWallState,
  fogBand,
  GATE,
  gateBaseGarrison,
  gateScoutCatchChance,
  gateReinforceCap,
  isSafeRegionFor,
  maxSoldiersFor,
  NPC_GATE_CIV,
  NPC_KINGDOM_REFILL_SHARE,
  REALM_HOARD_COOLDOWN_MS,
  npcTreasuryCapOf,
  realmRarityAt,
  npcWallTierFor,
  REALM_CYCLE,
  REGION_SAFE_FOR,
  wallMaxHpFor,
  worldNpcPackSize,
  worldNpcUnitFor,
  type BossUnit
} from "./warConfig.js";
import { calculateMaxPopulation, estimateNaturalBirths } from "./demographics.js";
import { kitLines } from "./battleArts.js";

/**
 * Shared world state of map NPCs (GAME_GUIDE §13): a roving mob / bandit pack keeps its losses
 * for everyone, and once its last unit falls it is gone until the next roving window. A resource node
 * keeps what is left of it (and its gems) and which march is gathering it; a claimed chest is gone.
 * Rows only exist for NPCs that have been touched; absent = untouched (full pack / full node).
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS world_npc_state (
    npc_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    remaining INTEGER,
    dead_until INTEGER,
    updated_at INTEGER NOT NULL,
    gathered_by TEXT,
    gems_left_json TEXT,
    -- World bosses: the week the HP belongs to, and when the current life began (0 = since the week started)
    week_key TEXT,
    life_started INTEGER
  );
`);

/** Bumped whenever a pack loses units or dies, so clients refetch the roving list (GET /status rovingKey) */
let worldStateVersion = 0;
export const getWorldStateVersion = () => worldStateVersion;

export const targetKindOf = (category: NPCCategory | undefined): MarchTargetKind => {
  switch (category) {
    case "mob":
      return "mob";
    case "bandit":
      return "bandit";
    case "treasure":
      return "treasure";
    case "resource":
      return "resource";
    case "boss":
      return "boss";
    case "kingdom":
      return "npc_kingdom";
    default:
      return "landmark";
  }
};

/** A map NPC by id: persistent buffer NPCs, today's resource nodes, or a roving spawn / wave node of the current window */
export function findMapNpc(kingdoms: DeveloperKingdom[], npcId: string): MapNPC | null {
  if (npcId.startsWith("dyn-15m-") || npcId.startsWith(WAVE_NODE_PREFIX)) {
    return getRovingSpawns(kingdoms).npcs.find((n) => n.id === npcId) ?? null;
  }
  const npc = getOrGenerateFlatWorldMap(kingdoms).npcs.find((n) => n.id === npcId) ?? null;
  return npc ? withActiveBoss(npc) : null;
}

/* ------------------------------------------------------------------------- */
/* Weeks (Sunday 00:00 UTC): boss rotation, Overseer's Resolve, War Frenzy   */
/* ------------------------------------------------------------------------- */

const WEEK_MS = 7 * 86_400_000;

/** The week running now: Sunday 00:00 UTC → next Sunday 00:00 UTC */
export function weekWindow(now = Date.now()): { weekKey: string; startsAt: number; resetsAt: number } {
  const d = new Date(now);
  const startsAt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay(), 0, 0, 0, 0);
  return { weekKey: new Date(startsAt).toISOString().slice(0, 10), startsAt, resetsAt: startsAt + WEEK_MS };
}

/* ------------------------------------------------------------------------- */
/* World bosses                                                              */
/* ------------------------------------------------------------------------- */

db.exec(`
  CREATE TABLE IF NOT EXISTS boss_rotation (
    npc_id TEXT PRIMARY KEY,
    kills INTEGER NOT NULL DEFAULT 0,
    -- Kills this week (Vengeance stacks), reset by the weekly rotation
    week_key TEXT,
    week_kills INTEGER NOT NULL DEFAULT 0
  );
`);

/** True while the zone's boss lies fallen at `now` (its row belongs to that week and the respawn is still ahead) */
function bossFallenAt(npcId: string, now: number): boolean {
  const row = db.prepare(`SELECT dead_until, week_key FROM world_npc_state WHERE npc_id = ?`).get(npcId) as { dead_until: number | null; week_key: string | null } | undefined;
  return Boolean(row?.dead_until && row.dead_until > now && row.week_key === weekWindow(now).weekKey);
}

/**
 * Kills that moved the zone's rotation on. A fallen boss lies where it fell until it wakes, so its own kill only
 * counts once the respawn comes: then the next boss of the pool wakes in its place.
 */
function bossRotationKills(npcId: string, now: number): number {
  const kills = (db.prepare(`SELECT kills FROM boss_rotation WHERE npc_id = ?`).get(npcId) as { kills: number } | undefined)?.kills ?? 0;
  return kills > 0 && bossFallenAt(npcId, now) ? kills - 1 : kills;
}

/**
 * Vengeance stacks of the zone's boss at `now`: kills this week, not counting a fallen boss's own kill until the
 * next one wakes. 0 again from the weekly rotation.
 */
export function bossVengeanceAt(npcId: string, now: number): number {
  const row = db.prepare(`SELECT week_key, week_kills FROM boss_rotation WHERE npc_id = ?`).get(npcId) as { week_key: string | null; week_kills: number } | undefined;
  if (!row || row.week_key !== weekWindow(now).weekKey) return 0;
  return Math.max(0, row.week_kills - (bossFallenAt(npcId, now) ? 1 : 0));
}

/** The zone's boss at `now` with its Vengeance applied: stats and stacks */
export function activeBossUnit(npc: MapNPC, now = Date.now()): BossUnit & { vengeance: number } {
  const vengeance = bossVengeanceAt(npc.id, now);
  return { ...vengefulBossUnit(bossUnitFor(withActiveBoss(npc, now).type), vengeance), vengeance };
}

/**
 * The zone's boss at `now`: the pool of 3 moves on one every Sunday 00:00 UTC, whatever its state, and one more
 * every time its boss is felled (the next boss wakes when the fallen one would have respawned)
 */
export function withActiveBoss(npc: MapNPC, now = Date.now()): MapNPC {
  const pool = npc.bossRotationPool;
  if (npc.category !== "boss" || !pool?.length) return npc;
  const weeks = Math.round(weekWindow(now).startsAt / WEEK_MS);
  // Idempotent: a boss that was already rotated keeps its generated index in bossBaseIndex
  const base = npc.bossBaseIndex ?? npc.bossIndex ?? 0;
  const idx = (((base + weeks + bossRotationKills(npc.id, now)) % pool.length) + pool.length) % pool.length;
  const b = pool[idx];
  return { ...npc, name: b.name, type: b.type, emblem: b.emblem, subtitle: b.subtitle, description: b.description, bossIndex: idx, bossBaseIndex: base };
}

export interface BossState {
  hp: number;
  maxHp: number;
  dead: boolean;
  respawnAt: number | null;
  weekKey: string;
  /** Identifies this life of the boss (damage shares for the bounty are per life) */
  lifeKey: string;
}

type BossRow = NpcStateRow & { week_key: string | null; life_started: number | null };

/** Shared HP of a zone's boss this week: no regeneration; dead until its respawn timer; full again on a new week */
export function getBossState(npc: MapNPC, now = Date.now()): BossState {
  const maxHp = activeBossUnit(npc, now).hp;
  const { weekKey } = weekWindow(now);
  const row = db.prepare(`SELECT * FROM world_npc_state WHERE npc_id = ?`).get(npc.id) as BossRow | undefined;
  if (!row || row.week_key !== weekKey) return { hp: maxHp, maxHp, dead: false, respawnAt: null, weekKey, lifeKey: `${weekKey}:0` };
  if (row.dead_until && row.dead_until > now) return { hp: 0, maxHp, dead: true, respawnAt: row.dead_until, weekKey, lifeKey: `${weekKey}:${row.life_started ?? 0}` };
  if (row.dead_until) return { hp: maxHp, maxHp, dead: false, respawnAt: null, weekKey, lifeKey: `${weekKey}:${row.dead_until}` };
  return { hp: Math.max(1, Math.min(maxHp, row.remaining ?? maxHp)), maxHp, dead: false, respawnAt: null, weekKey, lifeKey: `${weekKey}:${row.life_started ?? 0}` };
}

/** Persist the boss's HP after a round (shared by the whole realm) */
export function setBossHp(npcId: string, hp: number, st: Pick<BossState, "weekKey" | "lifeKey">, now = Date.now()) {
  db.prepare(`
    INSERT INTO world_npc_state (npc_id, kind, remaining, dead_until, updated_at, week_key, life_started) VALUES (?, 'boss', ?, NULL, ?, ?, ?)
    ON CONFLICT(npc_id) DO UPDATE SET remaining = excluded.remaining, dead_until = NULL, updated_at = excluded.updated_at, week_key = excluded.week_key, life_started = excluded.life_started
  `).run(npcId, Math.max(1, Math.round(hp)), now, st.weekKey, Number(st.lifeKey.split(":")[1] ?? 0));
  worldStateVersion++;
}

/** The boss falls: gone until BOSS_RESPAWN_MS later (or the weekly rotation, whichever comes first) */
export function markBossDead(npcId: string, st: Pick<BossState, "weekKey" | "lifeKey">, now = Date.now()) {
  db.prepare(`
    INSERT INTO world_npc_state (npc_id, kind, remaining, dead_until, updated_at, week_key, life_started) VALUES (?, 'boss', 0, ?, ?, ?, ?)
    ON CONFLICT(npc_id) DO UPDATE SET remaining = 0, dead_until = excluded.dead_until, updated_at = excluded.updated_at, week_key = excluded.week_key, life_started = excluded.life_started
  `).run(npcId, now + BOSS_RESPAWN_MS, now, st.weekKey, Number(st.lifeKey.split(":")[1] ?? 0));
  // The rotation moves on: the next boss of the pool wakes in its place
  // …and the next boss wakes with one more stack of Vengeance this week
  db.prepare(`
    INSERT INTO boss_rotation (npc_id, kills, week_key, week_kills) VALUES (?, 1, ?, 1)
    ON CONFLICT(npc_id) DO UPDATE SET kills = kills + 1,
      week_kills = CASE WHEN week_key = excluded.week_key THEN week_kills + 1 ELSE 1 END,
      week_key = excluded.week_key
  `).run(npcId, st.weekKey);
  worldStateVersion++;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS boss_damage (
    npc_id TEXT NOT NULL,
    life_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    damage INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (npc_id, life_key, user_id)
  );
`);

/** Damage a ruler's armies dealt to a boss this life (for the bounty) */
export function addBossDamage(npcId: string, lifeKey: string, userId: string, name: string, damage: number) {
  if (damage <= 0) return;
  db.prepare(`
    INSERT INTO boss_damage (npc_id, life_key, user_id, name, damage) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(npc_id, life_key, user_id) DO UPDATE SET damage = damage + excluded.damage, name = excluded.name
  `).run(npcId, lifeKey, userId, name, Math.round(damage));
}

export function getBossDamage(npcId: string, lifeKey: string): Array<{ userId: string; name: string; damage: number }> {
  return db.prepare(`SELECT user_id AS userId, name, damage FROM boss_damage WHERE npc_id = ? AND life_key = ? ORDER BY damage DESC`).all(npcId, lifeKey) as Array<{
    userId: string;
    name: string;
    damage: number;
  }>;
}

/** The battle that felled a boss: who led it, the hoard carried home and the bounty shares */
function lastBossKill(npcId: string): BossKill | null {
  const row = db
    .prepare(`SELECT details_json FROM battle_reports WHERE defender_id = ? AND attacker_won = 1 ORDER BY timestamp DESC LIMIT 1`)
    .get(npcId) as { details_json: string } | undefined;
  if (!row) return null;
  const r = JSON.parse(row.details_json) as BattleReport;
  return {
    at: Date.parse(r.timestamp),
    by: r.attackerName,
    hoard: r.loot ?? null,
    bounty: (r.bossBounty ?? []).map(({ name, damage, loot }) => ({ name, damage, loot }))
  };
}

/** The boss that wakes when a fallen one's slumber ends (its respawn, or the weekly rotation if that comes first) */
function nextBossOf(npc: MapNPC, wakesAt: number): BossNext {
  const b = withActiveBoss(npc, wakesAt);
  return { name: b.name, type: b.type, emblem: b.emblem, bossIndex: b.bossIndex ?? 0, wakesAt, vengeance: bossVengeanceAt(npc.id, wakesAt) };
}

/** Every zone boss as the realm sees it (HP is shared and public; dead ones carry their respawn time and last kill) */
export function bossStatusesFor(npcs: MapNPC[], now = Date.now()): Record<string, BossStatus> {
  const out: Record<string, BossStatus> = {};
  const { resetsAt } = weekWindow(now);
  for (const n of npcs) {
    if (n.category !== "boss") continue;
    const active = withActiveBoss(n, now);
    const st = getBossState(n, now);
    const unit = activeBossUnit(n, now);
    out[n.id] = {
      name: active.name,
      type: active.type,
      emblem: active.emblem,
      subtitle: active.subtitle,
      description: active.description,
      bossIndex: active.bossIndex ?? 0,
      hp: st.hp,
      maxHp: st.maxHp,
      dead: st.dead,
      respawnAt: st.respawnAt,
      rotatesAt: resetsAt,
      stats: { atk: unit.atk, def: unit.def },
      vengeance: unit.vengeance,
      skills: kitLines(unit.kit),
      topDamage: getBossDamage(n.id, st.lifeKey).slice(0, 5),
      lastKill: st.dead ? lastBossKill(n.id) : null,
      next: st.dead ? nextBossOf(n, Math.min(st.respawnAt ?? resetsAt, resetsAt)) : null
    };
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* NPC kingdoms: buffer realms and frontier gates                            */
/* ------------------------------------------------------------------------- */

db.exec(`
  CREATE TABLE IF NOT EXISTS npc_kingdoms (
    npc_id TEXT PRIMARY KEY,
    level INTEGER NOT NULL,
    civ TEXT NOT NULL,
    population INTEGER NOT NULL,
    garrison INTEGER NOT NULL,
    treasury_json TEXT NOT NULL,
    wall_hp INTEGER,
    wall_updated_at INTEGER,
    last_attacked_at INTEGER,
    updated_at INTEGER NOT NULL
  );
`);
// 👑 When a free realm's conquest hoard was last won (it pays once a day)
try {
  db.exec(`ALTER TABLE npc_kingdoms ADD COLUMN hoard_claimed_at INTEGER`);
} catch {
  /* already there */
}

export type BulkTreasury = { gold: number; iron: number; stone: number; lumber: number; food: number };

export interface NpcKingdomState {
  id: string;
  level: number;
  civ: CivilizationType;
  population: number;
  maxPopulation: number;
  garrison: number;
  maxGarrison: number;
  treasury: BulkTreasury;
  wallTier: number;
  wallHp: number;
  wallMaxHp: number;
  burning: boolean;
  burningEndsAt: number | null;
  /** Frontier gates only: its civ's troops stationed there and how many the gate holds in all (garrison + them) */
  gate?: { reinforcements: number; cap: number };
}

/** Soldiers of a civ's rulers stationed at a frontier gate (or a castle) right now */
export function stationedTroopsAt(hostId: string): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(soldiers_count), 0) AS total FROM active_marches WHERE kind = 'reinforce' AND status = 'marching' AND phase = 'stationed' AND target_id = ?`)
    .get(hostId) as { total: number };
  return Number(row.total || 0);
}

/** A treasury's cap: the City Hall rate × its level, × its tier for a free realm (REALM_TREASURY_TIER_MULT; a frontier gate ×1) */
const treasuryCap = (level: number, gate = false): BulkTreasury => ({
  gold: npcTreasuryCapOf("gold", level, gate),
  iron: npcTreasuryCapOf("iron", level, gate),
  stone: npcTreasuryCapOf("stone", level, gate),
  lumber: npcTreasuryCapOf("lumber", level, gate),
  food: npcTreasuryCapOf("food", level, gate)
});

/** 👑 When a free realm's conquest hoard is there to win again (null: it is now; frontier gates hold none) */
export function realmHoardReadyAt(npcId: string, now = Date.now()): number | null {
  const row = db.prepare(`SELECT hoard_claimed_at FROM npc_kingdoms WHERE npc_id = ?`).get(npcId) as { hoard_claimed_at: number | null } | undefined;
  const at = row?.hoard_claimed_at ? row.hoard_claimed_at + REALM_HOARD_COOLDOWN_MS : null;
  return at && at > now ? at : null;
}
/** 👑 The hoard is won: gone until REALM_HOARD_COOLDOWN_MS later */
export function claimRealmHoard(npcId: string, now = Date.now()) {
  db.prepare(`UPDATE npc_kingdoms SET hoard_claimed_at = ? WHERE npc_id = ?`).run(now, npcId);
  worldStateVersion++;
}

/** Demographics donor: a gate's own province civ, otherwise one of the two mortal civs bordering the zone (never Nethergarde) */
function npcKingdomCivFor(npc: MapNPC): CivilizationType {
  if (NPC_GATE_CIV[npc.id]) return NPC_GATE_CIV[npc.id];
  const borders = (REGION_SAFE_FOR[npc.region] ?? []).filter((c) => c !== "arcane");
  return borders.length ? borders[Math.floor(Math.random() * borders.length)] : "human";
}

/**
 * The kingdom's simulated state, created on first sight with full population, garrison and treasury. A buffer realm's
 * City Hall follows its cycle (`npc.realm`): at each new level it is refilled to full, walls mended (good as new).
 * Frontier gates are fixed instead (GATE): City Hall GATE.LEVEL, their civ's base garrison, walls of GATE.WALL_HP.
 */
export function getNpcKingdom(npc: MapNPC, now = Date.now()): NpcKingdomState {
  let row = db.prepare(`SELECT * FROM npc_kingdoms WHERE npc_id = ?`).get(npc.id) as any;
  const gateCiv = NPC_GATE_CIV[npc.id];
  // A gate rolled before gates were fixed: bring it to the gate's level and base garrison once
  if (row && gateCiv && row.level !== GATE.LEVEL) {
    const base = gateBaseGarrison(gateCiv);
    db.prepare(`UPDATE npc_kingdoms SET level = ?, civ = ?, population = ?, garrison = ?, treasury_json = ?, wall_hp = NULL, wall_updated_at = NULL, updated_at = ? WHERE npc_id = ?`).run(
      GATE.LEVEL,
      gateCiv,
      base,
      base,
      JSON.stringify(treasuryCap(GATE.LEVEL, true)),
      now,
      npc.id
    );
    row = db.prepare(`SELECT * FROM npc_kingdoms WHERE npc_id = ?`).get(npc.id);
  }
  // A realm reached a new level of its cycle: rebuilt to full for it
  if (row && !gateCiv && npc.realm && row.level !== npc.realm.level) {
    const level = npc.realm.level;
    const population = calculateMaxPopulation(level, row.civ);
    db.prepare(`UPDATE npc_kingdoms SET level = ?, population = ?, garrison = ?, treasury_json = ?, wall_hp = NULL, wall_updated_at = NULL, updated_at = ? WHERE npc_id = ?`).run(
      level,
      population,
      maxSoldiersFor(population, row.civ),
      JSON.stringify(treasuryCap(level)),
      now,
      npc.id
    );
    row = db.prepare(`SELECT * FROM npc_kingdoms WHERE npc_id = ?`).get(npc.id);
    worldStateVersion++;
  }
  if (!row) {
    const level = gateCiv ? GATE.LEVEL : npc.realm?.level ?? REALM_CYCLE.START_LEVEL + REALM_CYCLE.LEVELS_PER_STAGE;
    const civ = npcKingdomCivFor(npc);
    const population = gateCiv ? gateBaseGarrison(civ) : calculateMaxPopulation(level, civ);
    db.prepare(`
      INSERT INTO npc_kingdoms (npc_id, level, civ, population, garrison, treasury_json, wall_hp, wall_updated_at, last_attacked_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
    `).run(npc.id, level, civ, population, gateCiv ? population : maxSoldiersFor(population, civ), JSON.stringify(treasuryCap(level, Boolean(gateCiv))), now);
    row = db.prepare(`SELECT * FROM npc_kingdoms WHERE npc_id = ?`).get(npc.id);
  }
  const level = row.level as number;
  const civ = row.civ as CivilizationType;
  const isGate = Boolean(NPC_GATE_CIV[row.npc_id]);
  const wallTier = isGate ? GATE.WALL_TIER : npcWallTierFor(level);
  const wallMaxHp = isGate ? GATE.WALL_HP : wallMaxHpFor(level, wallTier);
  const wall = computeWallState(row.wall_hp, row.wall_updated_at, wallMaxHp, now);
  const maxPopulation = isGate ? gateBaseGarrison(civ) : calculateMaxPopulation(level, civ);
  return {
    id: npc.id,
    level,
    civ,
    population: row.population,
    maxPopulation,
    garrison: row.garrison,
    maxGarrison: isGate ? gateBaseGarrison(civ) : maxSoldiersFor(maxPopulation, civ),
    ...(isGate ? { gate: { reinforcements: stationedTroopsAt(row.npc_id), cap: gateReinforceCap(civ) } } : {}),
    treasury: JSON.parse(row.treasury_json),
    wallTier,
    wallHp: wall.wallHp,
    wallMaxHp,
    burning: wall.burning,
    burningEndsAt: wall.burningEndsAt
  };
}

/** Garrison losses in a battle round: the soldiers (and the people they were) are gone until births replace them */
export function applyNpcKingdomLosses(npcId: string, lost: number, now = Date.now()) {
  if (lost <= 0) return;
  db.prepare(`UPDATE npc_kingdoms SET garrison = MAX(0, garrison - ?), population = MAX(1, population - ?), last_attacked_at = ?, updated_at = ? WHERE npc_id = ?`).run(
    lost,
    lost,
    now,
    now,
    npcId
  );
  worldStateVersion++;
}

export function setNpcKingdomWall(npcId: string, wallHp: number, now = Date.now()) {
  db.prepare(`UPDATE npc_kingdoms SET wall_hp = ?, wall_updated_at = ?, updated_at = ? WHERE npc_id = ?`).run(Math.max(0, Math.round(wallHp)), now, now, npcId);
  worldStateVersion++;
}

export function setNpcKingdomTreasury(npcId: string, treasury: BulkTreasury, now = Date.now()) {
  db.prepare(`UPDATE npc_kingdoms SET treasury_json = ?, updated_at = ? WHERE npc_id = ?`).run(JSON.stringify(treasury), now, npcId);
}

/**
 * Harvest: every NPC kingdom regrows with its donor civ's birth formula (S-curve, no deaths of age), the
 * newborn fill the garrison back up to the civ's soldier share, and the treasury refills toward its cap.
 */
export function harvestNpcKingdoms(now = Date.now()) {
  const rows = db.prepare(`SELECT * FROM npc_kingdoms`).all() as any[];
  for (const r of rows) {
    const civ = r.civ as CivilizationType;
    // Frontier gates: the base garrison regrows by a share of itself (no demographics), never above the base
    if (NPC_GATE_CIV[r.npc_id]) {
      const base = gateBaseGarrison(civ);
      const garrison = Math.min(base, r.garrison + Math.ceil(base * GATE.REFILL_SHARE));
      const cap = treasuryCap(r.level, true);
      const t = JSON.parse(r.treasury_json) as BulkTreasury;
      const next = { ...cap };
      for (const k of Object.keys(cap) as Array<keyof BulkTreasury>) next[k] = Math.min(cap[k], Math.round((t[k] ?? 0) + cap[k] * NPC_KINGDOM_REFILL_SHARE));
      db.prepare(`UPDATE npc_kingdoms SET population = ?, garrison = ?, treasury_json = ?, updated_at = ? WHERE npc_id = ?`).run(garrison, garrison, JSON.stringify(next), now, r.npc_id);
      continue;
    }
    const maxPop = calculateMaxPopulation(r.level, civ);
    const births = Math.min(Math.max(0, maxPop - r.population), estimateNaturalBirths(r.population, civ, Math.min(1, r.population / maxPop)));
    const population = r.population + births;
    const garrison = Math.min(maxSoldiersFor(population, civ), r.garrison + births);
    const cap = treasuryCap(r.level);
    const t = JSON.parse(r.treasury_json) as BulkTreasury;
    const next = { ...cap };
    for (const k of Object.keys(cap) as Array<keyof BulkTreasury>) next[k] = Math.min(cap[k], Math.round((t[k] ?? 0) + cap[k] * NPC_KINGDOM_REFILL_SHARE));
    db.prepare(`UPDATE npc_kingdoms SET population = ?, garrison = ?, treasury_json = ?, updated_at = ? WHERE npc_id = ?`).run(population, garrison, JSON.stringify(next), now, r.npc_id);
  }
  if (rows.length) worldStateVersion++;
}

/** Chance that scouts heading into this gate's province are caught (only while it stands; 0 while it burns) */
export function gateCatchChanceFor(k: NpcKingdomState): number {
  if (!k.gate || k.burning) return 0;
  const fill = k.gate.cap > 0 ? (k.garrison + k.gate.reinforcements) / k.gate.cap : 0;
  return Math.round(gateScoutCatchChance(fill) * 100) / 100;
}

/** World reset (map regenerated): NPC kingdoms are rolled again (new level and donor civ) */
export function resetNpcKingdoms() {
  db.prepare(`DELETE FROM npc_kingdoms`).run();
  worldStateVersion++;
}

/**
 * Drops the rows of buffer realms no longer on the map (moved on or left after their crumbling day), unless a battle
 * there is still being fought. Frontier gates are never dropped.
 */
export function pruneNpcKingdoms(kingdoms: DeveloperKingdom[]) {
  const live = getOrGenerateFlatWorldMap(kingdoms).npcs.filter((n) => n.category === "kingdom").map((n) => n.id);
  const gone = (db.prepare(`SELECT npc_id FROM npc_kingdoms WHERE npc_id LIKE 'kingdom-%'`).all() as { npc_id: string }[])
    .map((r) => r.npc_id)
    .filter((id) => !live.includes(id));
  const fighting = db.prepare(`SELECT 1 FROM battles WHERE target_id = ? AND status = 'fighting'`);
  const drop = db.prepare(`DELETE FROM npc_kingdoms WHERE npc_id = ?`);
  let dropped = 0;
  for (const id of gone) if (!fighting.get(id)) dropped += drop.run(id).changes;
  if (dropped) worldStateVersion++;
}

/** NPC kingdoms as one viewer sees them: always fogged (they count as another civilization for everyone); numbers only through scouts */
export function npcKingdomStatusesFor(npcs: MapNPC[], scouted: Map<string, { takenAt: number; details: any }>, now = Date.now()): Record<string, NpcKingdomStatus> {
  const out: Record<string, NpcKingdomStatus> = {};
  for (const n of npcs) {
    if (n.category !== "kingdom") continue;
    const k = getNpcKingdom(n, now);
    const ratio = k.wallMaxHp ? k.wallHp / k.wallMaxHp : 1;
    out[n.id] = {
      level: k.level,
      civ: k.civ,
      wallTier: k.wallTier,
      burning: k.burning,
      burningEndsAt: k.burningEndsAt,
      wall: k.burning ? "burning" : ratio < 0.9 ? "damaged" : "intact",
      scoutedAt: scouted.get(n.id)?.takenAt ?? null,
      // A frontier gate seals its province while it stands (public: everyone sees whether a border has fallen)
      ...(k.gate ? { gate: { sealed: !k.burning, catchChance: gateCatchChanceFor(k) } } : {}),
      // 👑 A free realm's conquest hoard is public, like a boss's HP: whether it is there to win today
      ...(k.gate ? {} : { hoard: { tier: realmRarityAt(k.level) as NonNullable<NpcKingdomStatus["hoard"]>["tier"], readyAt: realmHoardReadyAt(n.id, now) } })
    };
  }
  return out;
}

interface NpcStateRow {
  npc_id: string;
  kind: string;
  remaining: number | null;
  dead_until: number | null;
  updated_at: number;
}

const getRow = (npcId: string) => db.prepare(`SELECT * FROM world_npc_state WHERE npc_id = ?`).get(npcId) as NpcStateRow | undefined;

const expiresAtMs = (npc: MapNPC) => (npc.expiresAt ? Date.parse(npc.expiresAt) : Date.now() + 24 * 60 * 60 * 1000);

/**
 * A mob / bandit pack's health in units, wounds included (11.4 = 11 unharmed units and one at 40% HP; full pack
 * if it was never fought; 0 = dead). Partial damage is kept, so even a march that kills no whole unit of a
 * big-HP pack (drakes, basilisks…) leaves it weaker for the next challenger.
 */
export function packHealth(npc: MapNPC, now = Date.now()): number {
  const row = getRow(npc.id);
  if (row?.dead_until && row.dead_until > now) return 0;
  if (row && row.remaining !== null) return Math.max(0, row.remaining);
  return worldNpcPackSize(npc.type, npc.rarity);
}

/** Units still standing in a mob / bandit pack (a wounded one counts); 0 = dead */
export function packRemaining(npc: MapNPC, now = Date.now()): number {
  return Math.ceil(packHealth(npc, now) - 1e-9);
}

export function isNpcDead(npc: MapNPC, now = Date.now()): boolean {
  const row = getRow(npc.id);
  return Boolean(row?.dead_until && row.dead_until > now);
}

/** Persist the pack's health after a battle round: units left minus the wounded unit's lost share (may be fractional) */
export function setPackRemaining(npc: { id: string; category?: NPCCategory }, remaining: number, now = Date.now()) {
  db.prepare(`
    INSERT INTO world_npc_state (npc_id, kind, remaining, dead_until, updated_at) VALUES (?, ?, ?, NULL, ?)
    ON CONFLICT(npc_id) DO UPDATE SET remaining = excluded.remaining, updated_at = excluded.updated_at
  `).run(npc.id, targetKindOf(npc.category), Math.max(0, remaining), now);
  worldStateVersion++;
}

/** The pack is wiped out: gone for everyone until it would have expired anyway (the next roving window) */
export function markNpcDead(npc: MapNPC, now = Date.now()) {
  db.prepare(`
    INSERT INTO world_npc_state (npc_id, kind, remaining, dead_until, updated_at) VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(npc_id) DO UPDATE SET remaining = 0, dead_until = excluded.dead_until, updated_at = excluded.updated_at
  `).run(npc.id, targetKindOf(npc.category), expiresAtMs(npc), now);
  worldStateVersion++;
}

/** Drop state rows of spawns that expired more than a day ago (a boss keeps its HP all week; old weeks go) */
export function pruneWorldNpcState(now = Date.now()) {
  const { weekKey } = weekWindow(now);
  db.prepare(`DELETE FROM world_npc_state WHERE kind != 'boss' AND updated_at < ? AND (dead_until IS NULL OR dead_until < ?)`).run(now - 86_400_000, now);
  db.prepare(`DELETE FROM world_npc_state WHERE kind = 'boss' AND COALESCE(week_key, '') != ?`).run(weekKey);
  db.prepare(`DELETE FROM boss_damage WHERE life_key NOT LIKE ?`).run(`${weekKey}:%`);
}

/** Roving spawns of the current window, dead ones removed, with fogged (or scouted) pack info for the viewer */
export function getRovingSpawnsFor(kingdoms: DeveloperKingdom[], scoutedAt: Map<string, { takenAt: number; details: any }>, now = Date.now()) {
  const roving = getRovingSpawns(kingdoms);
  const npcs: MapNPC[] = [];
  for (const n of roving.npcs) {
    if (isNpcDead(n, now)) continue;
    const intel = scoutedAt.get(n.id);
    if (n.category === "mob" || n.category === "bandit") {
      const remaining = packRemaining(n, now);
      const health = packHealth(n, now);
      const full = worldNpcPackSize(n.type, n.rarity);
      npcs.push({
        ...n,
        pack: {
          unitName: worldNpcUnitFor(n.type).name,
          band: fogBand(remaining),
          wounded: health < full,
          health: full > 0 ? Math.round((health / full) * 1000) / 1000 : 1,
          // Exact numbers only from a scout report (as they were when the scouts saw them)
          exact: intel ? intel.details.packRemaining ?? null : null,
          scoutedAt: intel?.takenAt ?? null
        }
      });
    } else if (n.category === "treasure") {
      npcs.push({ ...n, chest: { band: treasureChestBand(n.rarity), scoutedAt: intel?.takenAt ?? null } });
    } else {
      npcs.push(n);
    }
  }
  return { ...roving, npcs };
}

export function treasureChestBand(rarity: string | undefined): "small" | "large" | "hoard" {
  if (rarity === "epic" || rarity === "legendary") return "hoard";
  if (rarity === "rare" || rarity === "uncommon") return "large";
  return "small";
}

/* ------------------------------------------------------------------------- */
/* Resource nodes & treasure (gathering)                                     */
/* ------------------------------------------------------------------------- */

/** Next 00:00 UTC: daily resource nodes are replaced then */
export function endOfUtcDay(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Gems a node holds besides its bulk resources (e.g. mithril 2) */
export function nodeGems(npc: Pick<MapNPC, "resourceYield">): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(npc.resourceYield ?? {})) {
    if (!["gold", "iron", "stone", "lumber", "food"].includes(k) && v > 0) out[k] = v;
  }
  return out;
}

export interface NodeState {
  /** Bulk units left (the whole yield when untouched) */
  remaining: number;
  /** March id currently gathering / claiming it */
  gatheredBy: string | null;
  gemsLeft: Record<string, number>;
  emptied: boolean;
}

export function getNodeState(npc: MapNPC, now = Date.now()): NodeState {
  const row = db.prepare(`SELECT * FROM world_npc_state WHERE npc_id = ?`).get(npc.id) as (NpcStateRow & { gathered_by: string | null; gems_left_json: string | null }) | undefined;
  const emptied = Boolean(row?.dead_until && row.dead_until > now);
  const full = npc.category === "treasure" ? 1 : bulkOf(npc.resourceYield);
  return {
    remaining: emptied ? 0 : row && row.remaining !== null ? Math.max(0, row.remaining) : full,
    gatheredBy: row?.gathered_by ?? null,
    gemsLeft: row?.gems_left_json ? JSON.parse(row.gems_left_json) : nodeGems(npc),
    emptied
  };
}

/** A march starts gathering / claiming: the node is exclusive until it lets go */
export function claimNode(npc: MapNPC, marchId: string, now = Date.now()) {
  const st = getNodeState(npc, now);
  db.prepare(`
    INSERT INTO world_npc_state (npc_id, kind, remaining, dead_until, updated_at, gathered_by, gems_left_json) VALUES (?, ?, ?, NULL, ?, ?, ?)
    ON CONFLICT(npc_id) DO UPDATE SET gathered_by = excluded.gathered_by, remaining = excluded.remaining, gems_left_json = excluded.gems_left_json, updated_at = excluded.updated_at
  `).run(npc.id, targetKindOf(npc.category), st.remaining, now, marchId, JSON.stringify(st.gemsLeft));
  worldStateVersion++;
}

/**
 * The gathering march lets go (done, recalled or beaten): store what is left. An emptied node (or a claimed
 * chest) is gone for everyone until `goneUntil` (resource nodes: next UTC midnight; treasure: its window end).
 */
export function releaseNode(npcId: string, remaining: number, gemsLeft: Record<string, number>, goneUntil: number | null, now = Date.now()) {
  db.prepare(`
    UPDATE world_npc_state SET gathered_by = NULL, remaining = ?, gems_left_json = ?, dead_until = ?, updated_at = ? WHERE npc_id = ?
  `).run(Math.max(0, remaining), JSON.stringify(gemsLeft), remaining <= 0 ? goneUntil : null, now, npcId);
  worldStateVersion++;
}

/** Bump the world-state key (e.g. a gathering march paused or resumed) so clients refetch */
export const touchWorldState = () => {
  worldStateVersion++;
};

/**
 * Status of every resource node and chest someone has touched, as one viewer sees it: what's left (band, or
 * exact from their scout report / their own gatherers), who is gathering it (civ, name, band) and whether
 * those gatherers can be attacked (outside their safe territory).
 */
export function nodeStatusesFor(npcs: MapNPC[], viewerId: string | null, scouted: Map<string, { takenAt: number; details: any }>, now = Date.now()): Record<string, NodeStatus> {
  const out: Record<string, NodeStatus> = {};
  const gatherers = new Map(
    (
      db
        .prepare(`SELECT id, attacker_id, attacker_name, attacker_civ, soldiers_count, act_until, target_id, carry_json FROM active_marches WHERE kind = 'gather' AND status = 'marching' AND phase = 'acting'`)
        .all() as Array<{ id: string; attacker_id: string; attacker_name: string; attacker_civ: CivilizationType; soldiers_count: number; act_until: number; target_id: string; carry_json: string | null }>
    ).map((g) => [g.id, g])
  );
  for (const n of npcs) {
    if (n.category !== "resource" && n.category !== "treasure") continue;
    const st = getNodeState(n, now);
    const g = st.gatheredBy ? gatherers.get(st.gatheredBy) : undefined;
    const full = n.category === "treasure" ? 1 : bulkOf(n.resourceYield);
    if (!st.emptied && !g && st.remaining >= full) continue;
    const mine = Boolean(g && viewerId && g.attacker_id === viewerId);
    const intel = scouted.get(n.id);
    out[n.id] = {
      emptied: st.emptied,
      remainingBand: fogBand(st.remaining),
      remaining: mine ? st.remaining : intel?.details.nodeRemaining ?? null,
      total: full,
      left: st.emptied ? 0 : Math.round(Math.max(0, Math.min(1, st.remaining / Math.max(1, full))) * 100) / 100,
      gatherer: g
        ? {
            civ: g.attacker_civ,
            name: g.attacker_name,
            band: mine ? String(g.soldiers_count) : fogBand(g.soldiers_count),
            finishAt: g.act_until,
            exposed: !isSafeRegionFor(g.attacker_civ, n.region),
            mine
          }
        : null
    };
  }
  return out;
}
