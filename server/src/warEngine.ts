import { armoryStock, setsHome, takeSets } from "./armory.js";
import { CHAMPION_TARGET_SHARE, championShareVs, type ChampionTarget } from "./championRules.js";
import { awardRenown, championBattleFields, championHome, championLeadBlock, ensureChampion, marchChampionFromJson, recordChampionFinale, takeChampion, woundChampion } from "./champions.js";
import { ARMORY_RARITIES, armorySetFor, armoryShareVs, forgeBlockReason, garrisonGear, garrisonWear, gearOf, setText } from "./armoryRules.js";
import { MUSTER_SPLITS, bandPower, boxPower, championPowerAt, setPowers, strongestFirst } from "./musterRules.js";
import { healAllWounded, hasMoonwell, settleWounds, woundsText } from "./moonwell.js";
import { db, getActiveShield, getAllKingdomsFromDB, getAwayCivilians, getDeployedSoldiers, getWoundedSoldiers, soldiersAwayOf, getEffectiveUpgrades, getKingdomResources, getUserTitles, markCallToArms, recordPopulationLedger, spendResources, titleBuffsOf } from "./db.js";
import { seasonEffects } from "./realmTime.js";
import { DISASTERS, battleOmenAt, disasterAt, tallyDisaster, tempestLosses } from "./disasterRules.js";
import { improvementEffects } from "./upgrades.js";
import { config } from "./env.js";
import {
  CivilizationType,
  DeveloperKingdom,
  NethergardeSpire,
  ActiveMarch,
  BattleReport,
  BattleRound,
  BattleLoot,
  Rally,
  MarchPreview,
  MarchTargetType,
  MarchKind,
  MarchServerPhase,
  CivPlacesResponse,
  CivPlaceInfo,
  WarFrenzyPair,
  MapNPC,
  MarchTargetKind,
  ScoutDetails,
  KingdomFog,
  GatherInfo,
  TitleBuffs,
  MarchBand,
  MarchArmory,
  ArmoryRarity,
  MercBand,
  MercCost,
  MusterMarch,
  MusterResult
} from "./types.js";
import { CIV_DEMOGRAPHICS, convertPopulationOnSwap, calculateMaxPopulation, effectiveUnit } from "./demographics.js";
import { DROPPED_GEMS } from "./db.js";
import { horrorAttackBlock, horrorRewards, isHorrorId } from "./horror.js";
import { HORROR } from "./horrorRules.js";
import { breakShieldOnAttack } from "./decrees.js";
import { VOID_GATE_KEEPOUT, castleKeepout, freeCastlePlots, gateWallPoints, getOrGenerateFlatWorldMap, PROVINCE_CONFIG, registerMapOccupants, rovingWindowMinutes, waveWindowMinutes } from "./worldMapGenerator.js";
import { FOOTPRINT } from "./worldGeometry.js";
import { NORMAL_CIVILIZATIONS, hash, loginListed, ARCHON_CASTLE_LEVEL, MAX_BUILDING_LEVEL } from "./kingdomUtils.js";
import {
  MARCH,
  MARCH_RATION_MULT,
  VOID_NPC,
  COMBAT,
  BATTLE_ROUND_MS,
  WALL_DMG_PER_ATTACKER,
  LOAD_PER_SOLDIER,
  PVE_LOAD_MULT,
  CIV_LOAD_MULT,
  PROTECTED_TREASURY_PER_LEVEL,
  marchSlotsForLevel,
  marchCapacityFor,
  wallDefMultForTier,
  wallMaxHpFor,
  computeWallState,
  CIV_MODIFIERS,
  SCOUT_SPEED_MULT,
  SCOUT_MAX_SOLDIERS,
  SCOUT_ODDS,
  scoutOdds,
  ScoutOdds,
  MOB_LOOT_BY_TIER,
  BANDIT_STASH_BY_TIER,
  worldNpcUnitFor,
  gearedNpcUnitFor,
  packGearFor,
  PACK_GEAR,
  worldNpcPackSize,
  fogBand,
  TREASURE_CLAIM_MS,
  TREASURE_CONTENTS_BY_TIER,
  BULK_RESOURCES,
  isSafeRegionFor,
  gatherRateFor,
  bulkOf,
  RALLY_WINDOWS_MS,
  RALLY_COORDINATION_ATK,
  rallyJoinerCapFor,
  bossKitFor,
  npcKitFor,
  npcKingdomKitFor,
  kitTrimFor,
  BOSS_HOARD,
  BOSS_HOARD_GEMS,
  BOSS_GEM_KEYS,
  BOSS_BOUNTY,
  REALM_CONQUEST_HOARD,
  realmRarityAt,
  realmHoardGemFor,
  bossHideMult,
  bossDamageMult,
  CIV_BOSS_DAMAGE,
  OVERSEER_TREASURY,
  OVERSEER_SCARCE,
  OVERSEER_GRUDGE_PER_DEFEAT,
  OVERSEER_GARRISON_SHARE,
  maxSoldiersFor,
  NPC_GATE_CIV,
  GATE,
  GATE_OF_CIV,
  WALL_BURN_REPAIR_MS
} from "./warConfig.js";
import { announceBossSlain, createBroadcast, recordRealmEvent } from "./broadcasts.js";
import { byFront, seededRandom, stepBattleRound, maxRoundsOf, LiveAttackerStack, LiveDefenderState, DefenderGroup, totalDefenders, totalDefendersInitial, totalDefenderLosses } from "./combat.js";
import { artEventLine, kitLines, type UnitRarity } from "./battleArts.js";
import {
  findMapNpc,
  pinSpawnForMatch,
  isNpcDead,
  markNpcDead,
  packRemaining,
  setPackRemaining,
  packHealth,
  targetKindOf,
  treasureChestBand,
  getNodeState,
  claimNode,
  releaseNode,
  endOfUtcDay,
  touchWorldState,
  weekWindow,
  getBossState,
  activeBossUnit,
  setBossHp,
  markBossDead,
  addBossDamage,
  getBossDamage,
  getNpcKingdom,
  applyNpcKingdomLosses,
  setNpcKingdomWall,
  setNpcKingdomTreasury,
  realmHoardReadyAt,
  claimRealmHoard,
  gateCatchChanceFor,
  BulkTreasury,
  type NpcKingdomState
} from "./worldNpcs.js";
import { writeScoutReport, writeCaughtScoutRow, latestScoutReportsByTarget } from "./scouting.js";
import { recalculateTitlesFor, TitlePromotion } from "./titles.js";
import { BAND_BOSS_DAMAGE, BAND_TARGET_BLOCK, battlePayFor, mercKitFor } from "./mercenaryRules.js";
import { bandHome, bandMarchBlock, bandSetsOff, bandStillServes, bandsLeaveTheWalls, bandsTakeTheWalls, listBands, setBandStrength } from "./mercenaries.js";

/* ------------------------------------------------------------------------- */
/* Tables                                                                    */
/* ------------------------------------------------------------------------- */

export function initWarTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nethergarde_spires (
      id TEXT PRIMARY KEY,
      slot_index INTEGER NOT NULL,
      occupied_by_dev_id TEXT,
      npc_name TEXT,
      npc_level INTEGER,
      garrison INTEGER,
      max_garrison INTEGER,
      last_attacked_at INTEGER,
      wall_hp INTEGER,
      wall_updated_at INTEGER,
      coord_x REAL NOT NULL DEFAULT 0,
      coord_z REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS active_marches (
      id TEXT PRIMARY KEY,
      attacker_id TEXT NOT NULL,
      attacker_name TEXT NOT NULL,
      attacker_username TEXT NOT NULL,
      attacker_civ TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'attack',
      phase TEXT NOT NULL DEFAULT 'outbound',
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      soldiers_count INTEGER NOT NULL,
      initial_soldiers INTEGER,
      start_x REAL NOT NULL,
      start_z REAL NOT NULL,
      target_x REAL NOT NULL,
      target_z REAL NOT NULL,
      depart_time INTEGER NOT NULL,
      arrival_time INTEGER NOT NULL,
      battle_id TEXT,
      joined_round INTEGER,
      act_until INTEGER,
      return_time INTEGER,
      rally_id TEXT,
      carry_json TEXT,
      target_kind TEXT,
      gather_json TEXT,
      home_x REAL,
      home_z REAL,
      atk_bonus REAL,
      civilian INTEGER NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'marching',
      battle_result_json TEXT,
      armory_json TEXT,
      champion_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_marches_status ON active_marches(status, arrival_time);

    CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      defender_civ TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      round INTEGER NOT NULL DEFAULT 0,
      next_round_at INTEGER NOT NULL,
      defender_json TEXT NOT NULL,
      stacks_json TEXT NOT NULL DEFAULT '[]',
      rounds_json TEXT NOT NULL DEFAULT '[]',
      log_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'fighting'
    );
    CREATE INDEX IF NOT EXISTS idx_battles_target ON battles(target_type, target_id, status);
    -- The war tick reads the battles still being fought every 2 s; finished ones are kept but never scanned
    CREATE INDEX IF NOT EXISTS idx_battles_status ON battles(status, next_round_at);

    CREATE TABLE IF NOT EXISTS rallies (
      id TEXT PRIMARY KEY,
      leader_id TEXT NOT NULL,
      leader_name TEXT NOT NULL,
      civilization TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_kind TEXT,
      target_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      launch_at INTEGER NOT NULL,
      wait_ms INTEGER NOT NULL,
      joiner_cap INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      launched_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS civ_frenzy (
      civ_a TEXT NOT NULL,
      civ_b TEXT NOT NULL,
      week_key TEXT NOT NULL,
      last_battle_at INTEGER NOT NULL,
      PRIMARY KEY (civ_a, civ_b, week_key)
    );

    CREATE TABLE IF NOT EXISTS civ_vacated_places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      civ TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      vacated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS battle_reports (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      attacker_id TEXT NOT NULL,
      attacker_name TEXT NOT NULL,
      attacker_civ TEXT NOT NULL,
      defender_id TEXT NOT NULL,
      defender_name TEXT NOT NULL,
      defender_civ TEXT NOT NULL,
      target_type TEXT NOT NULL,
      attacker_initial_soldiers INTEGER NOT NULL,
      attacker_casualties INTEGER NOT NULL,
      defender_initial_soldiers INTEGER NOT NULL,
      defender_casualties INTEGER NOT NULL,
      attacker_won INTEGER NOT NULL,
      usurped_slot INTEGER NOT NULL,
      details_json TEXT,
      participants TEXT
    );
  `);
}

initWarTables();

// 🪙 A march may be a mercenary band (GAME_GUIDE §13 *Mercenaries*): which band, and what it is (for the map and the queue)
{
  const cols = (db.prepare(`PRAGMA table_info(active_marches)`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes("band_id")) db.exec(`ALTER TABLE active_marches ADD COLUMN band_id TEXT`);
  if (!cols.includes("band_json")) db.exec(`ALTER TABLE active_marches ADD COLUMN band_json TEXT`);
  // ⚔️ The Muster (GAME_GUIDE §13): marches sent together share a muster id; the rank is their place in the battle (0 = strongest)
  if (!cols.includes("muster_id")) db.exec(`ALTER TABLE active_marches ADD COLUMN muster_id TEXT`);
  if (!cols.includes("muster_rank")) db.exec(`ALTER TABLE active_marches ADD COLUMN muster_rank INTEGER`);
}

// Marches that came home: the map shows them for MARCH.SHOWCASE_MS after they end (the index holds the same
// COALESCE as getActiveMarches, so that read skips older ones).
// Battle reports: newest first per ruler (the report feed, the last defense) without sorting the whole table.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_marches_shown ON active_marches(status, COALESCE(return_time, arrival_time));
  CREATE INDEX IF NOT EXISTS idx_reports_time ON battle_reports(timestamp);
  CREATE INDEX IF NOT EXISTS idx_reports_defender ON battle_reports(defender_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_reports_attacker ON battle_reports(attacker_id, timestamp);
`);

export const isSpecialUser = (k: { id?: string; username?: string }) => {
  const specialSet = new Set(config.specialUsers.map((s) => s.toLowerCase()));
  return specialSet.has(k.username?.toLowerCase() ?? "") || specialSet.has(k.id?.toLowerCase() ?? "");
};

/** The Archon of the Realm: an overseer who can't be attacked, rallied on or scouted */
export const isArchonUser = (k: { id?: string; username?: string }) => loginListed(config.archonUsers, k);

const ARCHON_UNTOUCHABLE = "The Archon of the Realm is untouchable: their citadel can't be attacked, rallied on or scouted.";

/* ------------------------------------------------------------------------- */
/* War Frenzy & Open Places (GAME_GUIDE §13)                                 */
/* ------------------------------------------------------------------------- */

/** Sunday 00:00 UTC week key and next Sunday 00:00 UTC reset timestamp */
export function getCurrentWeekWindow(now = Date.now()): { weekKey: string; resetsAt: number } {
  const { weekKey, resetsAt } = weekWindow(now);
  return { weekKey, resetsAt };
}

export function recordWarFrenzy(civ1: CivilizationType, civ2: CivilizationType, now = Date.now()) {
  if (civ1 === civ2) return;
  const [civA, civB] = [civ1, civ2].sort() as [CivilizationType, CivilizationType];
  const { weekKey } = getCurrentWeekWindow(now);
  db.prepare(`
    INSERT INTO civ_frenzy (civ_a, civ_b, week_key, last_battle_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(civ_a, civ_b, week_key) DO UPDATE SET last_battle_at = excluded.last_battle_at
  `).run(civA, civB, weekKey, now);
}

export function areCivsInWarFrenzy(civ1: CivilizationType, civ2: CivilizationType, now = Date.now()): boolean {
  if (civ1 === civ2) return false;
  const [civA, civB] = [civ1, civ2].sort() as [CivilizationType, CivilizationType];
  const { weekKey } = getCurrentWeekWindow(now);
  const row = db.prepare(`SELECT 1 FROM civ_frenzy WHERE civ_a = ? AND civ_b = ? AND week_key = ?`).get(civA, civB, weekKey);
  return Boolean(row);
}

export function getCivPlaces(kingdoms?: DeveloperKingdom[], now = Date.now()): CivPlacesResponse {
  const all = kingdoms ?? getAllKingdomsFromDB();
  const mortals = all.filter((k) => !isSpecialUser(k));
  const B = Math.floor(mortals.length / 4);

  const counts: Record<CivilizationType, number> = {
    human: 0,
    elf: 0,
    dwarf: 0,
    orc: 0,
    arcane: 0
  };
  for (const k of mortals) {
    counts[k.civilization] = (counts[k.civilization] || 0) + 1;
  }

  const vacatedRows = db
    .prepare(`SELECT civ, user_id, user_name, vacated_at FROM civ_vacated_places ORDER BY vacated_at DESC LIMIT 40`)
    .all() as Array<{ civ: CivilizationType; user_id: string; user_name: string; vacated_at: number }>;

  const places = {} as Record<CivilizationType, CivPlaceInfo>;
  for (const civ of NORMAL_CIVILIZATIONS) {
    const occupied = counts[civ] || 0;
    const open = Math.max(0, B - occupied);
    const vacatedBy = vacatedRows
      .filter((r) => r.civ === civ)
      .slice(0, Math.max(1, open))
      .map((r) => ({ userId: r.user_id, name: r.user_name, at: r.vacated_at }));
    places[civ] = {
      civ,
      places: B,
      occupied,
      open,
      vacatedBy: open > 0 ? vacatedBy : []
    };
  }

  const arcaneOccupied = counts.arcane || 0;
  const arcanePlaces = config.nethergardePlayerSlots;
  places.arcane = {
    civ: "arcane",
    places: arcanePlaces,
    occupied: arcaneOccupied,
    open: Math.max(0, arcanePlaces - arcaneOccupied),
    vacatedBy: []
  };

  const { weekKey, resetsAt } = getCurrentWeekWindow(now);
  const frenzyRows = db
    .prepare(`SELECT civ_a, civ_b, week_key, last_battle_at FROM civ_frenzy WHERE week_key = ? ORDER BY last_battle_at DESC`)
    .all(weekKey) as Array<{ civ_a: CivilizationType; civ_b: CivilizationType; week_key: string; last_battle_at: number }>;

  const frenzyPairs: WarFrenzyPair[] = frenzyRows.map((r) => ({
    civA: r.civ_a,
    civB: r.civ_b,
    weekKey: r.week_key,
    lastBattleAt: r.last_battle_at
  }));

  return {
    places,
    frenzyPairs,
    weekKey,
    weekResetsAt: resetsAt
  };
}

/* ------------------------------------------------------------------------- */
/* NPC void kingdoms on open Voidrift slots                                  */
/* ------------------------------------------------------------------------- */

export interface VoidNpcProfile {
  name: string;
  level: number;
  population: number;
  maxGarrison: number;
  wallTier: number;
  wallMaxHp: number;
  loot: BattleLoot;
}

/** The NPC void kingdom that holds open slot `slotIndex` (1-based) */
export function voidNpcFor(slotIndex: number): VoidNpcProfile {
  const i = Math.max(0, slotIndex - 1);
  const names = VOID_NPC.WARDEN_NAMES;
  const cycle = Math.floor(i / names.length);
  const population = calculateMaxPopulation(VOID_NPC.CITY_HALL_LEVEL, "arcane");
  const wallTier = VOID_NPC.WALL_TIER;
  const wallMaxHp = wallMaxHpFor(VOID_NPC.CITY_HALL_LEVEL, wallTier);
  return {
    name: cycle > 0 ? `${names[i % names.length]} ${toRoman(cycle + 1)}` : names[i % names.length],
    level: VOID_NPC.CITY_HALL_LEVEL,
    population,
    maxGarrison: Math.round(population * VOID_NPC.GARRISON_SHARE),
    wallTier,
    wallMaxHp,
    loot: {
      gold: VOID_NPC.LOOT_BASE.gold + i * VOID_NPC.LOOT_PER_SLOT.gold,
      iron: VOID_NPC.LOOT_BASE.iron + i * VOID_NPC.LOOT_PER_SLOT.iron,
      stone: VOID_NPC.LOOT_BASE.stone + i * VOID_NPC.LOOT_PER_SLOT.stone,
      scarce: { [VOID_NPC.SCARCE_KEYS[i % VOID_NPC.SCARCE_KEYS.length]]: VOID_NPC.LOOT_SCARCE_AMOUNT }
    }
  };
}

function toRoman(n: number): string {
  const map: Array<[number, string]> = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

/** World-map position of every kingdom (from the persisted map layout) */
function kingdomPlacements(kingdoms: DeveloperKingdom[]): Record<string, { x: number; z: number }> {
  return getOrGenerateFlatWorldMap(kingdoms).kingdomPlacements;
}

function openSlotPlots(kingdoms: DeveloperKingdom[], count: number): Array<[number, number]> {
  if (count <= 0) return [];
  const map = getOrGenerateFlatWorldMap(kingdoms);
  const placements = map.kingdomPlacements;
  // Same spacing as castles: clear of every Nethergarde castle, the landmarks and (with an Archon) the seat
  const taken = kingdoms.filter((k) => k.civilization === "arcane" && !k.isArchon).map((k) => placements[k.id]).filter(Boolean);
  const archon = kingdoms.some((k) => k.isArchon);
  // (Resource nodes go round the slots, not the other way: the slots come first on the map's occupancy list)
  const landmarks = [
    ...map.npcs.filter((n) => n.category !== "resource" && (!archon || n.id !== "npc-void-monolith")).map(castleKeepout),
    // …and off the frontier gates' border walls
    VOID_GATE_KEEPOUT,
    ...gateWallPoints(map.npcs).map((p) => ({ ...p, gap: FOOTPRINT.voidSlot + FOOTPRINT.wall }))
  ];
  return freeCastlePlots(map.provinces.arcane, taken, count, archon, landmarks);
}

let lastSpireSignature = "";

// The open Voidrift slots' void kingdoms stand on the map like castles: every spawn keeps clear of them
registerMapOccupants(true, () => {
  try {
    return (db.prepare(`SELECT coord_x AS x, coord_z AS z FROM nethergarde_spires WHERE occupied_by_dev_id IS NULL`).all() as Array<{ x: number; z: number }>).map((s) => ({ x: s.x, z: s.z, r: FOOTPRINT.voidSlot }));
  } catch {
    return [];
  }
});

export function syncNethergardeSpires(allKingdoms: DeveloperKingdom[], force = false): NethergardeSpire[] {
  const maxSlots = config.nethergardePlayerSlots;
  const mortalArcane = allKingdoms.filter((k) => k.civilization === "arcane" && !isSpecialUser(k));
  const signature = `${maxSlots}|${allKingdoms.filter((k) => k.civilization === "arcane").map((k) => k.id).sort().join(",")}`;
  if (!force && signature === lastSpireSignature) return getNethergardeSpires();

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM nethergarde_spires WHERE slot_index > ?`).run(maxSlots);
    const rows = new Map(
      (db.prepare(`SELECT * FROM nethergarde_spires`).all() as any[]).map((r) => [r.slot_index as number, r])
    );

    const occupant = new Map<number, string>();
    const mortalIds = new Set(mortalArcane.map((k) => k.id));
    for (const [slot, r] of rows) if (r.occupied_by_dev_id && mortalIds.has(r.occupied_by_dev_id)) occupant.set(slot, r.occupied_by_dev_id);
    const seated = new Set(occupant.values());
    const waiting = mortalArcane.filter((k) => !seated.has(k.id));
    for (let slot = 1; slot <= maxSlots && waiting.length > 0; slot++) {
      if (!occupant.has(slot)) occupant.set(slot, waiting.shift()!.id);
    }

    const openSlots = Array.from({ length: maxSlots }, (_, i) => i + 1).filter((s) => !occupant.has(s));
    const plots = openSlotPlots(allKingdoms, openSlots.length);

    const upsert = db.prepare(`
      INSERT INTO nethergarde_spires (id, slot_index, occupied_by_dev_id, npc_name, npc_level, garrison, max_garrison, last_attacked_at, wall_hp, wall_updated_at, coord_x, coord_z, updated_at)
      VALUES (@id, @slot, @occupant, @npcName, @npcLevel, @garrison, @maxGarrison, @lastAttackedAt, @wallHp, @wallUpdatedAt, @x, @z, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        slot_index = excluded.slot_index, occupied_by_dev_id = excluded.occupied_by_dev_id, npc_name = excluded.npc_name,
        npc_level = excluded.npc_level, garrison = excluded.garrison, max_garrison = excluded.max_garrison,
        last_attacked_at = excluded.last_attacked_at, wall_hp = excluded.wall_hp, wall_updated_at = excluded.wall_updated_at,
        coord_x = excluded.coord_x, coord_z = excluded.coord_z, updated_at = datetime('now')
    `);

    for (let slot = 1; slot <= maxSlots; slot++) {
      const prev = rows.get(slot);
      const devId = occupant.get(slot) ?? null;
      if (devId) {
        upsert.run({
          id: `spire_${slot}`,
          slot,
          occupant: devId,
          npcName: null,
          npcLevel: null,
          garrison: null,
          maxGarrison: null,
          lastAttackedAt: null,
          wallHp: null,
          wallUpdatedAt: null,
          x: prev?.coord_x ?? 0,
          z: prev?.coord_z ?? 0
        });
        continue;
      }
      const npc = voidNpcFor(slot);
      const continuing = prev && !prev.occupied_by_dev_id && prev.garrison !== null && prev.garrison !== undefined;
      const garrison = continuing ? Math.min(npc.maxGarrison, prev.garrison) : npc.maxGarrison;
      const [x, z] = plots[openSlots.indexOf(slot)] ?? [PROVINCE_CONFIG.arcane.centerX, PROVINCE_CONFIG.arcane.centerZ];
      upsert.run({
        id: `spire_${slot}`,
        slot,
        occupant: null,
        npcName: npc.name,
        npcLevel: npc.level,
        garrison,
        maxGarrison: npc.maxGarrison,
        lastAttackedAt: continuing ? prev.last_attacked_at ?? null : null,
        wallHp: continuing ? prev.wall_hp ?? null : null,
        wallUpdatedAt: continuing ? prev.wall_updated_at ?? null : null,
        x,
        z
      });
    }
  });
  tx();

  lastSpireSignature = signature;
  return getNethergardeSpires();
}

export function getNethergardeSpires(): NethergardeSpire[] {
  const rows = db.prepare(`SELECT * FROM nethergarde_spires ORDER BY slot_index ASC`).all() as any[];
  const users = new Map(
    (db.prepare(`SELECT id, full_name, username, civilization FROM users`).all() as any[]).map((u) => [u.id as string, u])
  );

  return rows.map((r): NethergardeSpire => {
    const user = r.occupied_by_dev_id ? users.get(r.occupied_by_dev_id) : null;
    const npc = r.occupied_by_dev_id ? null : voidNpcFor(r.slot_index);
    const lastAttackedAt = r.last_attacked_at ?? null;
    const wallState = npc ? computeWallState(r.wall_hp, r.wall_updated_at, npc.wallMaxHp) : null;
    return {
      id: r.id,
      slotIndex: r.slot_index,
      occupiedByDevId: r.occupied_by_dev_id,
      occupiedByDevName: user ? user.full_name || user.username : null,
      occupiedByDevUsername: user?.username ?? null,
      occupiedByCivilization: user?.civilization ?? null,
      npcName: r.npc_name,
      npcLevel: r.npc_level ?? undefined,
      population: npc?.population,
      garrison: r.garrison ?? undefined,
      maxGarrison: r.max_garrison ?? undefined,
      lastAttackedAt,
      regenResumesAt: lastAttackedAt ? lastAttackedAt + VOID_NPC.REGEN_PAUSE_MS : null,
      besieged: Boolean(lastAttackedAt && Date.now() - lastAttackedAt < VOID_NPC.REGEN_PAUSE_MS),
      loot: npc?.loot,
      coordinates: [r.coord_x, r.coord_z],
      wallTier: npc?.wallTier,
      wallHp: wallState?.wallHp,
      wallMaxHp: wallState?.wallMaxHp,
      burning: wallState?.burning ?? false,
      burningEndsAt: wallState?.burningEndsAt ?? null
    };
  });
}

/** Harvest tick: NPC garrisons re-manifest from the Void Well once nobody has attacked them for a while */
export function regenerateSpireGarrisons(now = Date.now()) {
  const rows = db.prepare(`SELECT id, garrison, max_garrison, last_attacked_at FROM nethergarde_spires WHERE occupied_by_dev_id IS NULL`).all() as any[];
  const update = db.prepare(`UPDATE nethergarde_spires SET garrison = ?, updated_at = datetime('now') WHERE id = ?`);
  for (const r of rows) {
    if (r.garrison === null || r.max_garrison === null || r.garrison >= r.max_garrison) continue;
    if (r.last_attacked_at && now - r.last_attacked_at < VOID_NPC.REGEN_PAUSE_MS) continue;
    update.run(Math.min(r.max_garrison, r.garrison + Math.max(1, Math.round(r.max_garrison * VOID_NPC.REGEN_PER_HARVEST))), r.id);
  }
}

/* ------------------------------------------------------------------------- */
/* Marching, Slots, Capacity & Recall                                        */
/* ------------------------------------------------------------------------- */

export function countActiveMarchesForUser(userId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS cnt FROM active_marches WHERE attacker_id = ? AND status = 'marching' AND COALESCE(phase, 'outbound') != 'done'`)
    .get(userId) as { cnt: number } | undefined;
  return Number(row?.cnt || 0);
}

interface MarchPlan {
  startX: number;
  startZ: number;
  targetX: number;
  targetZ: number;
  targetName: string;
  targetKind: MarchTargetKind;
  distance: number;
  durationMs: number;
  oneWayFoodPerSoldier: number;
  foodPerSoldier: number;
  targetWallTier?: number;
  targetWallDefMult?: number;
  targetWallHp?: number;
  targetWallMaxHp?: number;
  targetBurning: boolean;
  /** Wall HP / garrison of a castle of another civilization: hidden from the march form */
  targetFogged: boolean;
  /** Civilians go, not soldiers: every scouting party, and a gather march in the ruler's own safe territory */
  civilianWorkers?: boolean;
}

/** "3d 4h" / "5h 10m" / "12m" */
function timeLeft(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Attacking a ruler (their castle or their gatherers) shatters the attacker's breakable Royal Shield */
const attacksRuler = (kind: MarchKind, targetKind: MarchTargetKind) => kind === "attack" && (targetKind === "kingdom" || targetKind === "gathering");

/** ⚔️ Call to Arms (GAME_GUIDE §13): attacking another ruler's city or a frontier gate keeps the attacker at war for the hour */
const callsToArms = (kind: MarchKind, targetKind: MarchTargetKind, targetType: MarchTargetType, targetId: string) =>
  kind === "attack" && ((targetType === "dev_kingdom" && targetKind === "kingdom") || (targetType === "npc" && Boolean(NPC_GATE_CIV[targetId])));

/**
 * The frontier gate that seals a city's province while it stands (GATE): the gate of the city's civilization.
 * Nethergarde, Special Overseers and the Archon have none. Null when the province is open (gate burning).
 */
function sealingGate(defender: DeveloperKingdom, kingdoms: DeveloperKingdom[]): { id: string; name: string; state: NpcKingdomState } | null {
  if (isSpecialUser(defender) || isArchonUser(defender)) return null;
  const gateId = GATE_OF_CIV[defender.civilization];
  if (!gateId) return null;
  const npc = findMapNpc(kingdoms, gateId);
  const state = getNpcKingdom(npc ?? ({ id: gateId } as MapNPC));
  if (state.burning) return null;
  return { id: gateId, name: npc?.name ?? "its frontier gate", state };
}

/** Walls of a castle target (kingdom or Voidrift NPC); open-field targets have none */
type TargetWalls = Pick<MarchPlan, "targetWallTier" | "targetWallDefMult" | "targetWallHp" | "targetWallMaxHp" | "targetBurning">;

/**
 * Route, travel time, round-trip rations and target wall status; throws if this kind of march can't go there.
 * Attacks: other-civ kingdoms, Voidrift NPC kingdoms, roving mobs and bandits. Scouts: anything fogged
 * to the attacker (other civs, Voidrift NPCs, every world NPC) — never their own civ or a Special Overseer.
 */
function planMarch(attacker: DeveloperKingdom, targetType: MarchTargetType, targetId: string, kingdoms: DeveloperKingdom[], kind: MarchKind = "attack"): MarchPlan {
  const scouting = kind === "scout";
  const gathering = kind === "gather";
  const reinforcing = kind === "reinforce";
  if (kind !== "attack" && kind !== "scout" && kind !== "gather" && kind !== "reinforce") throw new Error("That kind of march can't be sent this way.");
  if (isSpecialUser(attacker)) {
    throw new Error("Special Overseers observe the realm and do not launch marches.");
  }
  // Scouting and gathering are still allowed while burning
  if (attacker.burning && !scouting && !gathering) {
    if (reinforcing) throw new Error("Your city walls are burning — you can't send reinforcements until they repair above 25%.");
    throw new Error("Your city walls are burning (≤ 25% HP) — you cannot launch attacks until your walls repair above 25%.");
  }

  const placements = kingdomPlacements(kingdoms);
  const home = placements[attacker.id];
  if (!home) throw new Error("Your kingdom has no place on the world map yet.");

  let target: { x: number; z: number; name: string };
  let targetKind: MarchTargetKind;
  let walls: TargetWalls = { targetBurning: false };
  let targetFogged = false;
  // Scouts are civilians (GAME_GUIDE §13 Scouting): the garrison stays home
  let civilianWorkers = scouting;

  if (gathering && targetType !== "npc") throw new Error("Only resource nodes and treasure can be gathered.");
  if (reinforcing && targetType === "spire") throw new Error("Reinforcements go to a kingdom of your own civilization or to your civilization's frontier gate.");

  if (targetType === "spire") {
    if (attacker.civilization === "arcane") {
      throw new Error("Nethergarde already holds the Voidrift — march on mortal kingdoms instead.");
    }
    const spire = db.prepare(`SELECT * FROM nethergarde_spires WHERE id = ?`).get(targetId) as any;
    if (!spire) throw new Error("Target spire not found.");
    if (spire.occupied_by_dev_id) throw new Error("This Voidrift slot is held by a developer — march on their kingdom instead.");
    const npc = voidNpcFor(spire.slot_index);
    const wallState = computeWallState(spire.wall_hp, spire.wall_updated_at, npc.wallMaxHp);
    walls = {
      targetWallTier: npc.wallTier,
      targetWallDefMult: wallDefMultForTier(npc.wallTier),
      targetWallHp: wallState.wallHp,
      targetWallMaxHp: wallState.wallMaxHp,
      targetBurning: wallState.burning
    };
    targetFogged = true;
    if (wallState.burning && !scouting) {
      throw new Error("This Voidrift citadel is burning (≤ 25% wall HP) and cannot be attacked until its wards repair above 25%.");
    }
    target = { x: spire.coord_x, z: spire.coord_z, name: spire.npc_name || `Voidrift Slot ${spire.slot_index}` };
    targetKind = "spire";
  } else if (targetType === "npc") {
    const npc = findMapNpc(kingdoms, targetId);
    if (!npc) throw new Error(`That encounter is gone — roving spawns change every ${rovingWindowMinutes()} minutes.`);
    targetKind = targetKindOf(npc.category);
    const isNode = targetKind === "resource" || targetKind === "treasure";
    // Reinforcing a map NPC: only your own civilization's frontier gate takes troops
    if (reinforcing && !(npc.category === "kingdom" && NPC_GATE_CIV[npc.id] === attacker.civilization)) {
      throw new Error("Reinforcements go to a kingdom of your own civilization or to your civilization's frontier gate.");
    }
    if (gathering) {
      if (!isNode) throw new Error("Only resource nodes and treasure can be gathered.");
      const st = getNodeState(npc);
      if (st.emptied || isNpcDead(npc)) {
        throw new Error(
          targetKind === "treasure"
            ? "This chest has already been claimed."
            : `This node is exhausted — a fresh wave of nodes comes every ${waveWindowMinutes()} minutes, and new daily nodes tomorrow (00:00 UTC).`
        );
      }
      const holder = activeGatherer(st.gatheredBy);
      if (holder) throw new Error(`${holder.attacker_name}'s ${holder.civilian ? "workers" : `${CIV_DEMOGRAPHICS[holder.attacker_civ as CivilizationType].soldierUnit.name}s`} are working it — wait until they leave, or attack them if they're exposed.`);
      civilianWorkers = isSafeRegionFor(attacker.civilization, npc.region);
    } else if (!scouting && isNode) {
      // Attacking a node = attacking the gatherers there: another civ's, outside their safe territory
      const holder = activeGatherer(getNodeState(npc).gatheredBy);
      if (!holder) throw new Error("Nobody is gathering here — there is nothing to attack.");
      if (holder.attacker_civ === attacker.civilization) throw new Error("Those gatherers are of your own civilization.");
      if (holder.civilian) throw new Error(`${holder.attacker_name}'s civilian workers set out in their own safe territory and can't be attacked.`);
      if (isSafeRegionFor(holder.attacker_civ as CivilizationType, npc.region)) {
        throw new Error(`${holder.attacker_name}'s gatherers are in their own safe territory (${npc.region}) and can't be attacked.`);
      }
      targetKind = "gathering";
    } else if (!scouting && targetKind !== "mob" && targetKind !== "bandit" && targetKind !== "boss" && targetKind !== "npc_kingdom") {
      throw new Error("This can't be attacked. Scout it instead.");
    }
    if ((targetKind === "mob" || targetKind === "bandit") && isNpcDead(npc)) {
      throw new Error(`${npc.name} has already been wiped out. New encounters appear with the next roving window.`);
    }
    if (targetKind === "boss") {
      // 🌑 Xal'Vorath: only in its hour at the gates, and only the kingdom it came for and that kingdom's civilization
      if (isHorrorId(npc.id) && !scouting) {
        const block = horrorAttackBlock(npc.id, attacker, kingdoms);
        if (block) throw new Error(block);
      }
      const st = getBossState(npc);
      if (st.dead && !scouting && isHorrorId(npc.id)) throw new Error(`${npc.name} is gone.`);
      if (st.dead && !scouting) throw new Error(`${npc.name} has fallen. It returns at full strength ${st.respawnAt ? `in ${Math.ceil((st.respawnAt - Date.now()) / 3_600_000)} h` : "later"} (or with the weekly rotation).`);
    }
    if (targetKind === "npc_kingdom") {
      // A buffer realm being built up (a stage's first day) or crumbling away is shielded: scouts only
      if (!scouting && npc.landmarkState) {
        throw new Error(
          npc.landmarkState.phase === "rising"
            ? `${npc.name} is being built up and is shielded until ${new Date(npc.landmarkState.until).toUTCString().slice(17, 22)} UTC. Attack it once the scaffolding comes down.`
            : `${npc.name} is leaving the realm, crumbling away: there is nothing left to fight for.`
        );
      }
      // A frontier gate guards its own civilization's border: its own rulers can scout it, never attack or rally on it
      if (!scouting && !reinforcing && NPC_GATE_CIV[npc.id] === attacker.civilization) {
        throw new Error(`${npc.name} guards your own civilization's border: it can't be attacked or rallied on by your civilization.`);
      }
      // Fortified like any castle: walls by level, burning protects it
      const k = getNpcKingdom(npc);
      walls = {
        targetWallTier: k.wallTier,
        targetWallDefMult: wallDefMultForTier(k.wallTier),
        targetWallHp: k.wallHp,
        targetWallMaxHp: k.wallMaxHp,
        targetBurning: k.burning
      };
      targetFogged = !reinforcing;
      if (k.burning && reinforcing) throw new Error(`${npc.name} is burning — it can't receive reinforcements until its walls repair above 25%.`);
      if (k.burning && !scouting) throw new Error(`${npc.name} is burning (≤ 25% wall HP) and can't be attacked until its walls repair above 25%.`);
    }
    target = { x: npc.x, z: npc.z, name: npc.name };
  } else {
    const defender = kingdoms.find((k) => k.id === targetId);
    if (!defender) throw new Error("Target kingdom not found.");
    if (defender.id === attacker.id) throw new Error(reinforcing ? "Your own garrison is already home." : "You can't march on your own kingdom.");
    if (reinforcing) {
      if (defender.civilization !== attacker.civilization) throw new Error("You can only reinforce kingdoms of your own civilization.");
      if (isSpecialUser(defender)) throw new Error("Special Overseers can't be reinforced.");
      if (defender.burning) throw new Error(`${defender.name}'s walls are burning — it can't receive reinforcements until they repair above 25%.`);
    } else if (defender.civilization === attacker.civilization) {
      throw new Error(scouting ? "Your own civilization is fully visible — no need to scout it." : "You cannot attack a kingdom of your own civilization.");
    }
    if (isArchonUser(defender) && !reinforcing) throw new Error(ARCHON_UNTOUCHABLE);
    // Special Overseers are a loot area for mortals; they stay fully visible, so there is nothing to scout
    if (isSpecialUser(defender) && scouting) throw new Error("Special Overseers are showcases and always fully visible.");
    // 🛡️ Royal Shield: no attacks, rallies or scouts until it ends
    if (!reinforcing) {
      const shield = getActiveShield(defender.id);
      if (shield) throw new Error(`🛡️ ${defender.name}'s kingdom is under a Royal Shield (${timeLeft(shield.endsAt - Date.now())} left) and can't be ${scouting ? "scouted" : "attacked"}.`);
    }
    // 🚧 Frontier gate seal: a city behind a standing gate can't be attacked (or rallied on) by another civilization
    if (!scouting && !reinforcing) {
      const gate = sealingGate(defender, kingdoms);
      if (gate) {
        throw new Error(`🚧 ${defender.name} lies behind ${gate.name}: its province is sealed while the gate stands. Burn the gate first (walls below 25%) — the province is open while it burns.`);
      }
    }
    const targetWallTier = defender.wallTier ?? (defender.upgrades?.walls ?? 0);
    const targetWallMaxHp = defender.wallMaxHp ?? wallMaxHpFor(defender.cityHallLevel, targetWallTier);
    walls = {
      targetWallTier,
      targetWallDefMult: defender.wallDefMult ?? wallDefMultForTier(targetWallTier),
      targetWallMaxHp,
      targetWallHp: defender.wallHp ?? targetWallMaxHp,
      targetBurning: Boolean(defender.burning)
    };
    targetFogged = !reinforcing && !isSpecialUser(defender);
    if (walls.targetBurning && !scouting && !reinforcing) {
      throw new Error("Target kingdom is burning (≤ 25% wall HP) and under ceasefire protection until its walls repair above 25%.");
    }
    const pos = placements[defender.id];
    if (!pos) throw new Error("Target kingdom has no place on the world map yet.");
    target = { x: pos.x, z: pos.z, name: `${defender.name}'s ${defender.civilization === "arcane" ? "Void Citadel" : "Citadel"}` };
    targetKind = "kingdom";
  }

  const distance = Math.hypot(target.x - home.x, target.z - home.z);
  const supplyTicks = Math.max(1, Math.round(distance / MARCH.UNITS_PER_RATION_TICK));
  // The season speeds the buffed civ up 5% and slows the debuffed one (GAME_GUIDE §7 Day, night & seasons)
  const speed = CIV_DEMOGRAPHICS[attacker.civilization].marchSpeedMultiplier * seasonEffects(attacker.civilization).march * (scouting ? SCOUT_SPEED_MULT : 1);
  const minMs = scouting ? MARCH.MIN_DURATION_MS / SCOUT_SPEED_MULT : MARCH.MIN_DURATION_MS;
  const maxMs = scouting ? MARCH.MAX_DURATION_MS / SCOUT_SPEED_MULT : MARCH.MAX_DURATION_MS;
  // Roads speed every march up and Lantern Streets speed scouts further (after the clamp, so they always count);
  // Lantern Streets also cut the rations
  const fx = improvementEffects(attacker.upgrades);
  const durationMs = Math.round(Math.min(maxMs, Math.max(minMs, (distance * MARCH.MS_PER_MAP_UNIT) / speed)) / (fx.marchSpeedMult * (scouting ? fx.scoutSpeedMult : 1)));
  const oneWayFoodPerSoldier = supplyTicks * MARCH.FOOD_PER_SOLDIER_PER_TICK * MARCH_RATION_MULT[attacker.civilization] * fx.rationMult;
  // Round-trip rations are paid up front
  const foodPerSoldier = 2 * oneWayFoodPerSoldier;

  return {
    startX: home.x,
    startZ: home.z,
    targetX: target.x,
    targetZ: target.z,
    targetName: target.name,
    targetKind,
    distance,
    durationMs,
    oneWayFoodPerSoldier,
    foodPerSoldier,
    ...walls,
    targetFogged,
    civilianWorkers
  };
}

/** What a march would cost, for the attack / scout form (never throws: problems come back as blockedReason) */
export function previewMarch(
  attacker: DeveloperKingdom,
  targetType: MarchTargetType,
  targetId: string,
  kingdoms: DeveloperKingdom[],
  kind: MarchKind = "attack"
): MarchPreview {
  const maxPop = attacker.maxPopulation ?? calculateMaxPopulation(attacker.cityHallLevel, attacker.civilization);
  const marchSlots = attacker.marchSlots ?? marchSlotsForLevel(attacker.cityHallLevel);
  const marchCapacity = attacker.marchCapacity ?? marchCapacityFor(maxPop, attacker.civilization);
  const activeMarchesCount = countActiveMarchesForUser(attacker.id);
  const base = {
    availableSoldiers: attacker.soldiers ?? 0,
    availableFood: attacker.resources.food ?? 0,
    marchSlots,
    marchCapacity,
    maxSoldiers: kind === "scout" ? Math.min(SCOUT_MAX_SOLDIERS, marchCapacity) : marchCapacity,
    activeMarchesCount,
    kind,
    gatherPreview: kind === "gather" && targetType === "npc" ? gatherPreviewFor(attacker, targetId, kingdoms) : null
  };
  try {
    const plan = planMarch(attacker, targetType, targetId, kingdoms, kind);
    const reinforceRoom = kind === "reinforce" ? Math.max(0, reinforceRoomAt(targetId, { inbound: true })) : undefined;
    const odds = kind === "scout" ? scoutOddsPreview(attacker, targetType, targetId, kingdoms, base.maxSoldiers) : null;
    const gateDuty = kind === "reinforce" && targetType === "npc" && NPC_GATE_CIV[targetId] ? { ...GATE.DUTY_UPKEEP } : undefined;
    const slotBlocked =
      activeMarchesCount >= marchSlots
        ? `All march slots are in use (${activeMarchesCount}/${marchSlots}). Wait for an army to return home or upgrade your City Hall.`
        : reinforceRoom === 0
          ? `${plan.targetName} has no room for more troops: its soldiers and reinforcements already fill its max population.`
          : null;
    const bands = kind === "attack" ? listBands(attacker.id).map((b) => ({ ...b, blocked: BAND_TARGET_BLOCK[plan.targetKind] ?? bandMarchBlock(b), power: bandPower(b) })) : [];
    // 🗡️ The sets an attack (or a rally, previewed as one) may wear
    const stock = kind === "attack" ? armoryStock(attacker.id) : null;
    const armory = stock
      ? ARMORY_RARITIES.map((rarity) => ({ rarity, name: armorySetFor(attacker.civilization, rarity).name, emblem: armorySetFor(attacker.civilization, rarity).emblem, home: stock[rarity], forgeBlocked: forgeBlockReason(rarity, attacker.cityHallLevel) }))
      : [];
    // 🦸 The champion may lead an attack (or a rally, previewed as one)
    const champ = kind === "attack" ? ensureChampion(attacker.id) : undefined;
    const champLevel = champ ? championBattleFields(attacker.id)?.champion.level ?? 1 : 1;
    const champion = champ ? { name: champ.name, level: champLevel, blocked: championLeadBlock(attacker.id), power: championPowerAt(champLevel) } : null;
    // ⚔️ The Muster window builds its boxes from the free slots and counts power with the sets' worth
    const muster = kind === "attack" ? { freeSlots: Math.max(0, marchSlots - activeMarchesCount), splits: [...MUSTER_SPLITS], setPower: setPowers() } : null;
    return {
      ...base,
      ...(muster ? { muster } : {}),
      ...(champion ? { champion } : {}),
      ...(bands.length ? { bands } : {}),
      ...(armory.length ? { armory } : {}),
      ...(plan.civilianWorkers ? { civilianWorkers: true, availableSoldiers: freeCivilians(attacker.id) } : {}),
      ...(reinforceRoom !== undefined ? { reinforceRoom, maxSoldiers: Math.min(base.maxSoldiers, reinforceRoom) } : {}),
      ...(odds ? { scoutOdds: odds } : {}),
      ...(gateDuty ? { gateDutyUpkeep: gateDuty } : {}),
      distance: Math.round(plan.distance * 10) / 10,
      durationMs: plan.durationMs,
      oneWayFoodPerSoldier: plan.oneWayFoodPerSoldier,
      foodPerSoldier: plan.foodPerSoldier,
      targetKind: plan.targetKind,
      targetWallTier: plan.targetWallTier,
      targetWallDefMult: plan.targetWallDefMult,
      // Fog: the wall's HP isn't visible from outside (the flames of a burning one are)
      targetWallHp: plan.targetFogged ? undefined : plan.targetWallHp,
      targetWallMaxHp: plan.targetWallMaxHp,
      targetBurning: plan.targetBurning,
      targetFogged: plan.targetFogged,
      breaksOwnShield: attacksRuler(kind, plan.targetKind) && Boolean(getActiveShield(attacker.id)?.breaksOnAttack),
      blockedReason: slotBlocked
    };
  } catch (err: any) {
    return { ...base, distance: 0, durationMs: 0, foodPerSoldier: 0, blockedReason: err.message };
  }
}

/** Civilians at home and free to go (gathering or scouting): population − home garrison − soldiers away − civilians already away */
/**
 * 🌪️ Tempest Roads (GAME_GUIDE §10 *World Disasters*): an army setting off loses its share of marchers on the road.
 * They die (Nethergarde's fallen soldiers go to the Void Well); returns how many
 */
function tempestToll(userId: string, civ: CivilizationType, count: number, civilian: boolean, seed: string, targetName: string, now: number): number {
  const d = disasterAt(now);
  const lost = tempestLosses(d, civ, count, seed);
  if (lost <= 0) return 0;
  if (civ === "arcane" && !civilian) {
    db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?), void_well = COALESCE(void_well, 0) + ? WHERE id = ?`).run(lost, lost, userId);
  } else {
    db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?) WHERE id = ?`).run(lost, userId);
  }
  const u = getUser(userId);
  recordPopulationLedger({
    userId,
    type: "disaster",
    deaths: lost,
    soldiersDelta: civilian ? 0 : -lost,
    populationDelta: -lost,
    populationBalance: u?.population ?? 0,
    soldiersBalance: (u?.soldiers ?? 0) + soldiersAwayOf(userId),
    reason: `${DISASTERS.tempest.emblem} Tempest Roads: ${lost} ${civilian ? "marchers" : "soldiers"} lost on the road to ${targetName}`
  });
  tallyDisaster(d, civ, "road", lost);
  return lost;
}

function freeCivilians(userId: string): number {
  const u = db.prepare(`SELECT population, soldiers FROM users WHERE id = ?`).get(userId) as { population: number; soldiers: number } | undefined;
  if (!u) return 0;
  return Math.max(0, (u.population ?? 0) - (u.soldiers ?? 0) - getDeployedSoldiers(userId) - getAwayCivilians(userId) - getWoundedSoldiers(userId));
}

export function startMarch(params: {
  attackerKingdom: DeveloperKingdom;
  targetType: MarchTargetType;
  targetId: string;
  soldiersCount: number;
  kind?: MarchKind;
  kingdoms: DeveloperKingdom[];
  /** 🪙 March one of the ruler's mercenary bands instead of soldiers (attack marches only; `soldiersCount` is ignored) */
  bandId?: string;
  /** 🗡️ The Armory set every soldier wears ("standard" or a rarity; attack marches only) */
  loadout?: string;
  /** 🦸 The kingdom's champion leads the march (attack marches of soldiers only) */
  champion?: boolean;
  /** ⚔️ Set off as one march of a muster (`launchMuster`): its shared clock and arrival, and its place in the battle */
  muster?: MusterSlot;
}): ActiveMarch {
  const { attackerKingdom, targetType, targetId, kind = "attack", kingdoms, bandId, loadout, muster } = params;
  if (bandId && params.champion) throw new Error("A champion leads its own soldiers, never a mercenary band.");
  if (bandId) return startBandMarch({ attackerKingdom, targetType, targetId, kind, kingdoms, bandId, muster });
  const { soldiersCount } = params;
  if (soldiersCount <= 0) throw new Error(kind === "scout" ? "Must send at least 1 scout." : "Must dispatch at least 1 soldier.");

  const maxPop = attackerKingdom.maxPopulation ?? calculateMaxPopulation(attackerKingdom.cityHallLevel, attackerKingdom.civilization);
  const marchSlots = attackerKingdom.marchSlots ?? marchSlotsForLevel(attackerKingdom.cityHallLevel);
  const marchCapacity = attackerKingdom.marchCapacity ?? marchCapacityFor(maxPop, attackerKingdom.civilization);
  if (kind === "scout" && soldiersCount > SCOUT_MAX_SOLDIERS) {
    throw new Error(`Scouting parties are 1–${SCOUT_MAX_SOLDIERS} civilians.`);
  }
  if (soldiersCount > marchCapacity) {
    throw new Error(`Exceeds single-march capacity (${marchCapacity.toLocaleString()} soldiers max per march).`);
  }

  const plan = planMarch(attackerKingdom, targetType, targetId, kingdoms, kind);

  const now = muster?.now ?? Date.now();
  const march: ActiveMarch = {
    id: `march_${now}_${Math.random().toString(36).substring(2, 7)}`,
    attackerId: attackerKingdom.id,
    attackerName: attackerKingdom.name,
    attackerUsername: attackerKingdom.username,
    attackerCiv: attackerKingdom.civilization,
    kind,
    phase: "outbound",
    targetType,
    targetKind: plan.targetKind,
    targetId,
    targetName: plan.targetName,
    soldiersCount,
    initialSoldiers: soldiersCount,
    startX: plan.startX,
    startZ: plan.startZ,
    targetX: plan.targetX,
    targetZ: plan.targetZ,
    departTime: now,
    arrivalTime: muster?.arrivalTime ?? now + plan.durationMs,
    status: "marching",
    ...(plan.civilianWorkers ? { civilian: true } : {})
  };
  const civilian = Boolean(plan.civilianWorkers);
  const foodCost = Math.ceil(soldiersCount * plan.foodPerSoldier);
  let roadLosses = 0;

  db.transaction(() => {
    const activeCount = countActiveMarchesForUser(attackerKingdom.id);
    if (activeCount >= marchSlots) {
      throw new Error(`All march slots are in use (${activeCount}/${marchSlots}). Wait for an army to return home.`);
    }

    const user = db.prepare(`SELECT soldiers FROM users WHERE id = ?`).get(attackerKingdom.id) as { soldiers: number } | undefined;
    const food = (db.prepare(`SELECT food FROM kingdom_resources WHERE user_id = ?`).get(attackerKingdom.id) as { food: number } | undefined)?.food ?? 0;
    const home = civilian ? freeCivilians(attackerKingdom.id) : user?.soldiers ?? 0;
    if (home < soldiersCount) throw new Error(`Insufficient ${civilian ? "civilians" : "soldiers"}. Available: ${home}, requested: ${soldiersCount}.`);
    if (kind === "reinforce") {
      const room = reinforceRoomAt(targetId, { inbound: true });
      if (room <= 0) throw new Error(`${plan.targetName} has no room for more troops: its soldiers and reinforcements already fill its max population.`);
      if (soldiersCount > room) throw new Error(`Only ${room.toLocaleString()} more soldiers fit in ${plan.targetName}.`);
    }
    if (food < foodCost) throw new Error(`Insufficient round-trip food rations for the expedition. Required: ${foodCost} food, available: ${food} food.`);

    if (foodCost > 0) {
      const marchKindName =
        march.kind === "scout" ? "Scout" :
        march.kind === "gather" ? "Gathering expedition" :
        march.kind === "reinforce" ? "Reinforcement" : "March";
      spendResources(
        attackerKingdom.id,
        { food: foodCost },
        "march_rations",
        `${marchKindName} rations: ${foodCost.toLocaleString()} food for ${soldiersCount.toLocaleString()} ${march.kind === "scout" ? "scouts" : march.kind === "gather" ? "workers" : "soldiers"} to ${plan.targetName}`
      );
    }
    // Civilian workers and scouts leave the fields, not the garrison
    if (!civilian) db.prepare(`UPDATE users SET soldiers = soldiers - ? WHERE id = ?`).run(soldiersCount, attackerKingdom.id);
    // 🗡️ An attack may set off in one of the Armory's sets: one per soldier, taken from the armory
    const armory = kind === "attack" && !civilian ? takeSets(attackerKingdom, loadout, soldiersCount) : null;
    if (armory) march.armory = armory;
    // 🌪️ Tempest Roads: some never get far (the march keeps how many set off as its initial count)
    roadLosses = tempestToll(attackerKingdom.id, attackerKingdom.civilization, soldiersCount, civilian, march.id, plan.targetName, now);
    march.soldiersCount -= roadLosses;
    db.prepare(`
      INSERT INTO active_marches (
        id, attacker_id, attacker_name, attacker_username, attacker_civ, kind, phase, target_type, target_kind, target_id, target_name,
        soldiers_count, initial_soldiers, start_x, start_z, target_x, target_z, depart_time, arrival_time, status, civilian
      ) VALUES (
        @id, @attackerId, @attackerName, @attackerUsername, @attackerCiv, @kind, @phase, @targetType, @targetKind, @targetId, @targetName,
        @soldiersCount, @initialSoldiers, @startX, @startZ, @targetX, @targetZ, @departTime, @arrivalTime, @status, @civilian
      )
    `).run({ ...march, civilian: civilian ? 1 : 0 });
    if (march.armory) db.prepare(`UPDATE active_marches SET armory_json = ? WHERE id = ?`).run(JSON.stringify(march.armory), march.id);
    if (muster) db.prepare(`UPDATE active_marches SET muster_id = ?, muster_rank = ? WHERE id = ?`).run(muster.id, muster.rank, march.id);
    // 🦸 The champion rides at the head of an attack of soldiers, by the ruler's choice
    if (params.champion) {
      if (kind !== "attack" || civilian) throw new Error("A champion leads attacks and rallies only: never scouts, gatherers or reinforcements.");
      march.champion = takeChampion(attackerKingdom.id, march.id, now);
    }
    if (targetType === "npc") {
      const npc = findMapNpc(kingdoms, targetId);
      if (npc) pinSpawnForMatch(npc, now);
    }
  })();
  if (attacksRuler(kind, plan.targetKind)) breakShieldOnAttack(attackerKingdom.id, plan.targetName);
  if (callsToArms(kind, plan.targetKind, targetType, targetId)) markCallToArms(attackerKingdom.id);

  return roadLosses > 0 ? { ...march, roadLosses } : march;
}

/**
 * 🪙 A mercenary band sets off (GAME_GUIDE §13 *Mercenaries*): one march slot, none of the ruler's soldiers, no rations
 * (its upkeep feeds it). It marches at its strength; the Tempest Roads take the same share of it as of soldiers.
 */
function startBandMarch(params: { attackerKingdom: DeveloperKingdom; targetType: MarchTargetType; targetId: string; kind: MarchKind; kingdoms: DeveloperKingdom[]; bandId: string; muster?: MusterSlot }): ActiveMarch {
  const { attackerKingdom, targetType, targetId, kind, kingdoms, bandId, muster } = params;
  if (kind !== "attack") throw new Error("Mercenary bands only march to attack: they don't scout, gather, rally or stand guard.");
  const marchSlots = attackerKingdom.marchSlots ?? marchSlotsForLevel(attackerKingdom.cityHallLevel);
  const plan = planMarch(attackerKingdom, targetType, targetId, kingdoms, kind);
  const targetBlock = BAND_TARGET_BLOCK[plan.targetKind];
  if (targetBlock) throw new Error(`${targetBlock}.`);
  const now = muster?.now ?? Date.now();
  const id = `march_${now}_${Math.random().toString(36).substring(2, 7)}`;
  let march!: ActiveMarch;
  let roadLosses = 0;
  db.transaction(() => {
    const activeCount = countActiveMarchesForUser(attackerKingdom.id);
    if (activeCount >= marchSlots) throw new Error(`All march slots are in use (${activeCount}/${marchSlots}). Wait for an army to return home.`);
    const { band, count, civ } = bandSetsOff(attackerKingdom.id, bandId, id, now);
    const info: Omit<MarchBand, "strength"> = { id: band.id, type: band.type, name: band.name, emblem: band.emblem, rarity: band.rarity, fullCount: band.fullCount, startStrength: band.strength };
    march = {
      id,
      attackerId: attackerKingdom.id,
      attackerName: attackerKingdom.name,
      attackerUsername: attackerKingdom.username,
      attackerCiv: civ,
      kind,
      phase: "outbound",
      targetType,
      targetKind: plan.targetKind,
      targetId,
      targetName: plan.targetName,
      soldiersCount: count,
      initialSoldiers: count,
      startX: plan.startX,
      startZ: plan.startZ,
      targetX: plan.targetX,
      targetZ: plan.targetZ,
      departTime: now,
      arrivalTime: muster?.arrivalTime ?? now + plan.durationMs,
      status: "marching",
      band: { ...info, strength: count / Math.max(1, band.fullCount) }
    };
    // 🌪️ Tempest Roads: the road takes its share of the band's strength (they are not citizens: no ledger, no tally)
    roadLosses = Math.min(count - 1, tempestLosses(disasterAt(now), civ, count, id));
    if (roadLosses > 0) {
      march.soldiersCount -= roadLosses;
      march.band = { ...march.band!, strength: march.soldiersCount / Math.max(1, band.fullCount) };
      setBandStrength(band.id, march.soldiersCount, band.fullCount, { place: `the road to ${plan.targetName}`, now });
    }
    db.prepare(`
      INSERT INTO active_marches (
        id, attacker_id, attacker_name, attacker_username, attacker_civ, kind, phase, target_type, target_kind, target_id, target_name,
        soldiers_count, initial_soldiers, start_x, start_z, target_x, target_z, depart_time, arrival_time, status, civilian, band_id, band_json
      ) VALUES (
        @id, @attackerId, @attackerName, @attackerUsername, @attackerCiv, @kind, @phase, @targetType, @targetKind, @targetId, @targetName,
        @soldiersCount, @initialSoldiers, @startX, @startZ, @targetX, @targetZ, @departTime, @arrivalTime, @status, 0, @bandId, @bandJson
      )
    `).run({ ...march, bandId: band.id, bandJson: JSON.stringify(info) });
    if (muster) db.prepare(`UPDATE active_marches SET muster_id = ?, muster_rank = ? WHERE id = ?`).run(muster.id, muster.rank, id);
    if (targetType === "npc") {
      const npc = findMapNpc(kingdoms, targetId);
      if (npc) pinSpawnForMatch(npc, now);
    }
  })();
  if (attacksRuler(kind, plan.targetKind)) breakShieldOnAttack(attackerKingdom.id, plan.targetName);
  if (callsToArms(kind, plan.targetKind, targetType, targetId)) markCallToArms(attackerKingdom.id);
  return roadLosses > 0 ? { ...march, roadLosses } : march;
}

/* ------------------------------------------------------------------------- */
/* ⚔️ The Muster: several marches launched at once (GAME_GUIDE §13)          */
/* ------------------------------------------------------------------------- */

/** One march of a muster setting off: the muster's shared clock and arrival, its id and the march's rank (0 = strongest) */
interface MusterSlot {
  now: number;
  arrivalTime: number;
  id: string;
  rank: number;
}

/** A muster that can't set off: every reason, so the window can show them all at once */
export class MusterError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(" "));
  }
}

type MusterPick =
  | { kind: "band"; band: MercBand; power: number }
  | { kind: "soldiers"; soldiers: number; loadout: "standard" | ArmoryRarity; champion: boolean; power: number };

const RES_KEYS = ["gold", "iron", "stone", "lumber", "food"] as const;

/**
 * Check a whole muster before anything sets off (`launchMuster`): the target, the free march slots, the soldiers at home,
 * every set the loadouts need, the champion, every band (its own, home and whole or wounded, not healing, a target bands
 * may strike) and the cost of it all together (every march's round-trip rations plus every band's battle pay). Throws a
 * MusterError listing every problem; returns the marches strongest first.
 */
function checkMuster(attacker: DeveloperKingdom, targetType: MarchTargetType, targetId: string, kingdoms: DeveloperKingdom[], marches: MusterMarch[], rallying: boolean): { plan: MarchPlan; picks: MusterPick[] } {
  if (!Array.isArray(marches) || marches.length === 0) throw new MusterError(["Tick at least one march to muster."]);
  if (rallying && targetType === "spire") throw new MusterError(["Voidrift slots can't be rallied on — conquer one with your own army."]);
  // The target itself (a castle that can't be attacked, a fallen boss…) is one clear reason on its own
  const plan = planMarch(attacker, targetType, targetId, kingdoms, "attack");
  const problems: string[] = [];
  const slots = attacker.marchSlots ?? marchSlotsForLevel(attacker.cityHallLevel);
  const free = Math.max(0, slots - countActiveMarchesForUser(attacker.id));
  if (marches.length > free) problems.push(`${marches.length} marches are ticked but only ${free} of your ${slots} march slots ${free === 1 ? "is" : "are"} free.`);
  const maxPop = attacker.maxPopulation ?? calculateMaxPopulation(attacker.cityHallLevel, attacker.civilization);
  const cap = attacker.marchCapacity ?? marchCapacityFor(maxPop, attacker.civilization);
  const home = (db.prepare(`SELECT soldiers FROM users WHERE id = ?`).get(attacker.id) as { soldiers: number } | undefined)?.soldiers ?? 0;
  const stock = armoryStock(attacker.id);
  const bands = listBands(attacker.id);
  const champ = ensureChampion(attacker.id);
  const champPower = championPowerAt(champ ? (championBattleFields(attacker.id)?.champion.level ?? 1) : 1);
  const seen = new Set<string>();
  const needSets = { uncommon: 0, rare: 0, epic: 0 } as Record<ArmoryRarity, number>;
  const pay: MercCost = {};
  let soldiers = 0;
  let rations = 0;
  let leaders = 0;
  const picks: MusterPick[] = [];

  marches.forEach((m, i) => {
    const label = `March ${i + 1}`;
    if (m.bandId) {
      const b = bands.find((x) => x.id === m.bandId);
      if (!b) return void problems.push(`${label}: that band doesn't serve you (any more).`);
      if (rallying) return void problems.push(`${b.name}: mercenary bands don't rally — untick it, or attack instead.`);
      if (m.champion) problems.push(`${b.name}: a champion leads its own soldiers, never a mercenary band.`);
      if (seen.has(b.id)) return void problems.push(`${b.name} is ticked twice.`);
      seen.add(b.id);
      const block = BAND_TARGET_BLOCK[plan.targetKind] ?? bandMarchBlock(b);
      if (block) problems.push(`${b.name}: ${block.charAt(0).toLowerCase()}${block.slice(1)}.`);
      for (const [k, v] of Object.entries(battlePayFor(b.rarity))) pay[k as keyof MercCost] = (pay[k as keyof MercCost] ?? 0) + (v ?? 0);
      picks.push({ kind: "band", band: b, power: bandPower(b) });
      return;
    }
    const n = Math.floor(Number(m.soldiers) || 0);
    if (n <= 0) return void problems.push(`${label}: send at least 1 soldier.`);
    if (n > cap) problems.push(`${label}: ${n.toLocaleString()} soldiers is more than one march carries (${cap.toLocaleString()}).`);
    const loadout = (!m.loadout || m.loadout === "standard" ? "standard" : m.loadout) as "standard" | ArmoryRarity;
    if (loadout !== "standard" && !ARMORY_RARITIES.includes(loadout)) return void problems.push(`${label}: unknown loadout.`);
    if (loadout !== "standard") needSets[loadout] += n;
    if (m.champion) leaders++;
    soldiers += n;
    rations += Math.ceil(n * plan.foodPerSoldier);
    picks.push({ kind: "soldiers", soldiers: n, loadout, champion: m.champion === true, power: boxPower(n, loadout, m.champion ? champPower : null) });
  });

  if (soldiers > home) problems.push(`The muster needs ${soldiers.toLocaleString()} soldiers but ${home.toLocaleString()} are at home.`);
  for (const r of ARMORY_RARITIES) {
    if (needSets[r] > stock[r]) {
      const set = armorySetFor(attacker.civilization, r);
      const gate = forgeBlockReason(r, attacker.cityHallLevel);
      problems.push(
        gate
          ? `${set.name}: ${needSets[r].toLocaleString()} needed, ${stock[r].toLocaleString()} at home, and your City Hall can't forge more yet (${gate}) — send fewer or pick another loadout.`
          : `${set.name}: ${needSets[r].toLocaleString()} needed, ${stock[r].toLocaleString()} at home — forge ${(needSets[r] - stock[r]).toLocaleString()} more, or pick another loadout.`
      );
    }
  }
  if (leaders > 1) problems.push("Your champion can lead only one march.");
  if (leaders === 1) {
    const block = championLeadBlock(attacker.id);
    if (block) problems.push(block);
  }
  // Everything is paid together: rations for every soldier march, battle pay for every band
  const need: MercCost = { ...pay, food: (pay.food ?? 0) + rations };
  const res = getKingdomResources(attacker.id);
  const have = (k: (typeof RES_KEYS)[number]) => Number(res[k] ?? 0);
  const short = RES_KEYS.filter((k) => (need[k] ?? 0) > have(k)).map((k) => `${((need[k] ?? 0) - have(k)).toLocaleString()} ${k}`);
  if (short.length) {
    const what = [rations > 0 ? `${rations.toLocaleString()} food of rations` : "", seen.size ? "the bands' battle pay" : ""].filter(Boolean).join(" and ");
    problems.push(`Not enough in the treasury for ${what}: still need ${short.join(", ")}.`);
  }
  if (problems.length) throw new MusterError(problems);
  return { plan, picks: strongestFirst(picks) };
}

/**
 * ⚔️ Launch a muster (`POST /marches/muster`): every march at once, all or none. They set off in the same moment and all
 * move at the slowest one's pace, so they reach the target together and every one fights from round 1; in the battle
 * they stand strongest first. With `rally` the soldier marches raise a rally instead and wait in its lobby (bands don't
 * rally); when it launches they set off with it, as one.
 *
 * Why the slowest pace rather than holding departures back: the marches leave home and walk the road as one army, no
 * march sits in a hidden "waiting to leave" state (each can be recalled from the road like any march), and a march only
 * ever arrives later than it would alone, never earlier. Every march of one ruler to one target takes the same road
 * time today (their civilization's pace and roads; a band marches at its hirer's), so the shared arrival costs nothing.
 */
export function launchMuster(params: {
  attackerKingdom: DeveloperKingdom;
  targetType: MarchTargetType;
  targetId: string;
  kingdoms: DeveloperKingdom[];
  marches: MusterMarch[];
  rally?: { waitMs: number };
}): MusterResult {
  const { attackerKingdom, targetType, targetId, kingdoms, marches, rally } = params;
  const { plan, picks } = checkMuster(attackerKingdom, targetType, targetId, kingdoms, marches, Boolean(rally));
  const now = Date.now();
  const id = `muster_${now}_${Math.random().toString(36).substring(2, 7)}`;
  if (rally) {
    const armies = picks.flatMap((p) => (p.kind === "soldiers" ? [{ soldiers: p.soldiers, loadout: p.loadout, champion: p.champion }] : []));
    const r = startRally({ leader: attackerKingdom, targetType, targetId, waitMs: rally.waitMs, soldiers: armies[0]?.soldiers ?? 0, kingdoms, armies, musterId: id });
    const rows = db.prepare(`SELECT * FROM active_marches WHERE rally_id = ? AND attacker_id = ? ORDER BY COALESCE(muster_rank, 0) ASC`).all(r.id, attackerKingdom.id);
    return { marches: rows.map((row) => rowToMarch(row)), arrivalTime: r.launchAt, rallyId: r.id };
  }
  // One road time for all (see above): the same arrival to the millisecond, so they reach the target in the same tick
  const arrivalTime = now + plan.durationMs;
  const out: ActiveMarch[] = [];
  db.transaction(() => {
    picks.forEach((p, rank) => {
      const muster: MusterSlot = { now, arrivalTime, id, rank };
      out.push(
        p.kind === "band"
          ? startMarch({ attackerKingdom, targetType, targetId, soldiersCount: 0, kind: "attack", kingdoms, bandId: p.band.id, muster })
          : startMarch({ attackerKingdom, targetType, targetId, soldiersCount: p.soldiers, kind: "attack", kingdoms, loadout: p.loadout, champion: p.champion, muster })
      );
    });
  })();
  return { marches: out, arrivalTime };
}

/**
 * Owner recalls an outbound or acting march (`POST /marches/:id/recall`).
 * Outbound marches turn back from their current interpolated position; acting marches retreat from battle.
 * No food rations are refunded.
 */
export const recallMarch = db.transaction((marchId: string, userId: string, now = Date.now()): ActiveMarch => {
  const row = db.prepare(`SELECT * FROM active_marches WHERE id = ?`).get(marchId) as any;
  if (!row) throw new Error("March not found.");
  if (row.attacker_id !== userId) throw new Error("Only the ruler who launched this march may recall it.");
  const phase = (row.phase || "outbound") as MarchServerPhase;
  if (row.status !== "marching" || phase === "returning" || phase === "done") {
    throw new Error("This army is already marching home.");
  }

  const totalDur = Math.max(1000, row.arrival_time - row.depart_time);
  if (phase === "outbound") {
    turnBackOutbound(row, now);
  } else if (row.kind === "rally" && phase === "rallying" && row.rally_id && !(Number(row.muster_rank) > 0)) {
    // The leader leaving the lobby cancels the rally (a muster's other armies just walk home)
    cancelRallyNow(row.rally_id, now);
  } else if (row.kind === "reinforce" && phase === "stationed" && reinforcementInBattle(row)) {
    throw new Error("These troops are fighting in a defence right now — recall them once the battle is over.");
  } else if (row.kind === "gather" && row.gather_json) {
    const info = JSON.parse(row.gather_json) as GatherInfo;
    if (info.pausedAt) throw new Error("Your gatherers are fighting off an attack — they can't leave until the battle ends.");
    // Gatherers walk home with what they have so far (a chest only counts once fully claimed)
    const carry = finishGathering(row, info, gatheredSoFar(info, now), now);
    sendMarchReturning(marchId, now, carry, null);
  } else {
    // Retreating from target (`acting`, `rallying`, `stationed`): walks home from where it stands
    void totalDur;
    sendMarchReturning(marchId, now, null, null);
  }

  const updated = db.prepare(`SELECT * FROM active_marches WHERE id = ?`).get(marchId);
  return rowToMarch(updated);
});

/**
 * An outbound march turns around where it is now (recall, or the race rule when its target is taken):
 * the walk home takes as long as it has walked so far. No rations are refunded.
 */
function turnBackOutbound(row: { id: string; depart_time: number; arrival_time: number; start_x: number; start_z: number; target_x: number; target_z: number }, now: number) {
  const totalDur = Math.max(1000, row.arrival_time - row.depart_time);
  const elapsed = Math.max(1000, Math.min(totalDur, now - row.depart_time));
  const f = Math.max(0, Math.min(1, elapsed / totalDur));
  const curX = row.start_x + (row.target_x - row.start_x) * f;
  const curZ = row.start_z + (row.target_z - row.start_z) * f;
  db.prepare(`
    UPDATE active_marches
    SET phase = 'returning', target_x = ?, target_z = ?, arrival_time = ?, act_until = ?, return_time = ?
    WHERE id = ?
  `).run(curX, curZ, now, now, now + elapsed, row.id);
}

/** Race rule: once a target is taken, every other march still heading there turns back from where it is */
function turnBackRacers(targetId: string, winnerMarchIds: Set<string>, now: number, kinds: MarchKind[] = ["attack", "gather"]): number {
  const racers = db
    .prepare(`SELECT * FROM active_marches WHERE target_id = ? AND status = 'marching' AND COALESCE(phase, 'outbound') = 'outbound' AND COALESCE(kind, 'attack') != 'scout'`)
    .all(targetId) as any[];
  let n = 0;
  for (const r of racers) {
    if (winnerMarchIds.has(r.id) || !kinds.includes((r.kind || "attack") as MarchKind)) continue;
    turnBackOutbound(r, now);
    n++;
  }
  return n;
}

/**
 * Scouts heading for a kingdom dress as its people (GAME_GUIDE §13 Scouting): its civilization, worked out from the
 * target (a ruler's civ, an NPC kingdom's or frontier gate's, the Voidrift's). Other targets: none (their own look)
 */
function scoutDisguiseCiv(r: { target_type: string; target_kind: string | null; target_id: string }): CivilizationType | undefined {
  if (r.target_type === "spire") return "arcane";
  if (r.target_type === "dev_kingdom") {
    const u = db.prepare(`SELECT civilization FROM users WHERE id = ?`).get(r.target_id) as { civilization?: CivilizationType } | undefined;
    return u?.civilization ?? undefined;
  }
  if (r.target_kind === "npc_kingdom") {
    const row = db.prepare(`SELECT civ FROM npc_kingdoms WHERE npc_id = ?`).get(r.target_id) as { civ?: CivilizationType } | undefined;
    return NPC_GATE_CIV[r.target_id] ?? row?.civ ?? undefined;
  }
  return undefined;
}

/** The round a live battle fought last (soldiers lost and damage dealt per side), for the numbers over the map's battles */
function lastRoundOf(battle: { rounds_json?: string | null }): BattleRound | null {
  const rounds = JSON.parse(battle.rounds_json || "[]") as BattleRound[];
  return rounds.length > 0 ? rounds[rounds.length - 1] : null;
}

/** A band's march: what it is and how much of it is left (strength = soldier-equivalents / full count) */
function bandOf(r: { band_json: string; soldiers_count: number }): MarchBand {
  const b = JSON.parse(r.band_json) as Omit<MarchBand, "strength">;
  return { ...b, strength: Math.max(0, Math.min(1, (r.soldiers_count ?? 0) / Math.max(1, b.fullCount))) };
}

/** How the log names a march's force: "120× Footman", or a band by its name */
const forceOf = (march: Pick<ActiveMarch, "soldiersCount" | "attackerCiv" | "band">) =>
  march.band ? `${march.band.emblem} ${march.band.name} (${Math.round(march.band.strength * 100)}% strength)` : `${march.soldiersCount}× ${CIV_DEMOGRAPHICS[march.attackerCiv].soldierUnit.name}`;
/** A log line told `n` times, as one: "🔥 Eclipse Reaver casts Fireball on Gorgon (×2)." */
const counted = (line: string, n: number) => (n > 1 ? `${line.replace(/[.!]$/, "")} (×${n})${/[.!]$/.test(line) ? line.slice(-1) : ""}` : line);

/** Lines told more than once in a round (two bands alike casting the same Art, ticking the same Bleed) as one line, counted */
function foldRepeats(lines: string[]): string[] {
  const count = new Map<string, number>();
  for (const l of lines) count.set(l, (count.get(l) ?? 0) + 1);
  return [...count.entries()].map(([l, n]) => counted(l, n));
}

/** Push a line, or count it once more when it was already told since the last round (two alike marches arriving together) */
function pushFolded(log: string[], line: string) {
  for (let i = log.length - 1; i >= 0 && !log[i].startsWith("⚔️ Round "); i--) {
    for (let n = 1; n < 100; n++) {
      if (log[i] !== counted(line, n)) continue;
      log[i] = counted(line, n + 1);
      return;
    }
  }
  log.push(line);
}
/** Who marches, for the battle log, with the ruler's name: "Jane Doe's 264× Void Weaver", "Jane Doe's 🌑 Eclipse Reaver (97% strength)" */
const marchersOf = (march: Pick<ActiveMarch, "attackerName" | "soldiersCount" | "attackerCiv" | "band">) => `${march.attackerName}'s ${forceOf(march)}`;
/** Its verb: soldiers are many ("arrive"), a band is one company ("arrives") */
const verbOf = (march: Pick<ActiveMarch, "band">, many: string, one: string) => (march.band ? one : many);

const rowToMarch = (r: any, battleById?: Map<string, any>): ActiveMarch => {
  const battle = r.battle_id && battleById ? battleById.get(r.battle_id) : null;
  return {
    id: r.id,
    attackerId: r.attacker_id,
    attackerName: r.attacker_name,
    attackerUsername: r.attacker_username,
    attackerCiv: r.attacker_civ,
    kind: (r.kind || "attack") as MarchKind,
    phase: (r.phase || (r.status === "resolved" ? "done" : "outbound")) as MarchServerPhase,
    targetType: r.target_type,
    targetKind: r.target_kind ?? (r.target_type === "spire" ? "spire" : r.target_type === "dev_kingdom" ? "kingdom" : null),
    targetId: r.target_id,
    targetName: r.target_name,
    soldiersCount: r.soldiers_count,
    initialSoldiers: r.initial_soldiers ?? r.soldiers_count,
    startX: r.start_x,
    startZ: r.start_z,
    targetX: r.target_x,
    targetZ: r.target_z,
    departTime: r.depart_time,
    arrivalTime: r.arrival_time,
    battleId: r.battle_id ?? null,
    joinedRound: r.joined_round ?? null,
    actUntil: r.act_until ?? null,
    returnTime: r.return_time ?? null,
    rallyId: r.rally_id ?? null,
    carry: r.carry_json ? JSON.parse(r.carry_json) : null,
    gather: r.gather_json ? JSON.parse(r.gather_json) : null,
    civilian: r.civilian === 1,
    ...(r.kind === "scout" ? { disguiseCiv: scoutDisguiseCiv(r) } : {}),
    atkBonus: r.atk_bonus ?? null,
    band: r.band_json ? bandOf(r) : null,
    armory: r.armory_json ? (JSON.parse(r.armory_json) as MarchArmory) : null,
    champion: marchChampionFromJson(r.champion_json),
    currentBattleRound: battle ? battle.round : null,
    battleSlot: battle?.order ? (battle.order.slots.get(r.id) ?? null) : null,
    battleFrontId: battle?.order ? battle.order.front : null,
    lastBattleRound: battle ? lastRoundOf(battle) : null,
    lastRoundAt: battle && battle.round > 0 ? battle.next_round_at - BATTLE_ROUND_MS : null,
    maxBattleRounds: r.rally_id ? COMBAT.RALLY_MAX_ROUNDS : COMBAT.MAX_ROUNDS,
    status: r.status,
    battleResult: r.battle_result_json ? JSON.parse(r.battle_result_json) : null
  };
};

/** Marches on the road (`status = 'marching'`), plus ones finished within MARCH.SHOWCASE_MS */
export function getActiveMarches(now = Date.now()): ActiveMarch[] {
  const rows = db
    .prepare(`
      SELECT * FROM active_marches
      WHERE status = 'marching'
         OR (status = 'resolved' AND COALESCE(return_time, arrival_time) > ?)
      ORDER BY arrival_time ASC
    `)
    .all(now - MARCH.SHOWCASE_MS) as any[];

  const fightingBattles = db.prepare(`SELECT id, round, next_round_at, rounds_json, stacks_json FROM battles WHERE status = 'fighting'`).all() as Array<{
    id: string;
    round: number;
    next_round_at: number;
    rounds_json: string;
    stacks_json: string;
  }>;
  // Each army's place in its battle, and the one the defenders are striking (a stack whose ruler recalled it is not there)
  const acting = new Set(rows.filter((r) => r.status === "marching" && r.phase === "acting").map((r) => r.id as string));
  const battleById = new Map(
    fightingBattles.map((b) => {
      const stacks: LiveAttackerStack[] = JSON.parse(b.stacks_json || "[]");
      const front = byFront(stacks.filter((s) => s.count > 0 && acting.has(s.marchId)))[0]?.marchId ?? null;
      return [b.id, { ...b, order: { slots: new Map(stacks.map((s, i) => [s.marchId, i])), front } }];
    })
  );
  return rows.map((r) => rowToMarch(r, battleById));
}

/* ------------------------------------------------------------------------- */
/* Live Battles, Walls, Plunder by Load & Returning Marches                  */
/* ------------------------------------------------------------------------- */

type UserRow = {
  id: string;
  full_name: string | null;
  username: string;
  civilization: CivilizationType;
  population: number | null;
  soldiers: number | null;
  city_hall_level: number | null;
  wall_hp: number | null;
  wall_updated_at: number | null;
};

const getUser = (id: string) =>
  db
    .prepare(`SELECT id, full_name, username, civilization, population, soldiers, city_hall_level, wall_hp, wall_updated_at FROM users WHERE id = ?`)
    .get(id) as UserRow | undefined;

/** A ruler's civilization now (a march row or a battle stack keeps the one it set off with; a band's is its own) */
const rulerCivOf = (userId: string): CivilizationType | undefined => getUser(userId)?.civilization;

const getUserWallTier = (userId: string): number => {
  const u = getUser(userId);
  if (u && isSpecialUser(u)) return 5;
  const row = db.prepare(`SELECT tier FROM kingdom_upgrades WHERE user_id = ? AND upgrade_id = 'walls'`).get(userId) as { tier: number } | undefined;
  return row?.tier ?? 0;
};

/** Apply structural wall damage to a developer kingdom or NPC spire and return updated wall state */
function applyWallDamage(targetType: MarchTargetType, targetId: string, damage: number, now = Date.now()): {
  wallHpBefore: number;
  wallHpAfter: number;
  wallMaxHp: number;
  burning: boolean;
} {
  // NPC kingdoms (the only map NPCs with walls)
  if (targetType === "npc") {
    const k = db.prepare(`SELECT npc_id FROM npc_kingdoms WHERE npc_id = ?`).get(targetId) as { npc_id: string } | undefined;
    if (!k) return { wallHpBefore: 0, wallHpAfter: 0, wallMaxHp: 0, burning: false };
    // The row exists, so the map NPC itself isn't needed to read it
    const cur = getNpcKingdom({ id: targetId } as MapNPC, now);
    const afterHp = Math.max(0, cur.wallHp - Math.max(0, Math.round(damage)));
    setNpcKingdomWall(targetId, afterHp, now);
    return { wallHpBefore: cur.wallHp, wallHpAfter: afterHp, wallMaxHp: cur.wallMaxHp, burning: computeWallState(afterHp, now, cur.wallMaxHp, now).burning };
  }
  if (targetType === "spire") {
    const spire = db.prepare(`SELECT * FROM nethergarde_spires WHERE id = ?`).get(targetId) as any;
    if (!spire) return { wallHpBefore: 0, wallHpAfter: 0, wallMaxHp: 1000, burning: false };
    const npc = voidNpcFor(spire.slot_index);
    const cur = computeWallState(spire.wall_hp, spire.wall_updated_at, npc.wallMaxHp, now);
    const afterHp = Math.max(0, cur.wallHp - Math.max(0, Math.round(damage)));
    db.prepare(`UPDATE nethergarde_spires SET wall_hp = ?, wall_updated_at = ?, updated_at = datetime('now') WHERE id = ?`).run(afterHp, now, targetId);
    const nextState = computeWallState(afterHp, now, npc.wallMaxHp, now);
    return {
      wallHpBefore: cur.wallHp,
      wallHpAfter: afterHp,
      wallMaxHp: npc.wallMaxHp,
      burning: nextState.burning
    };
  }

  const u = getUser(targetId);
  if (!u) return { wallHpBefore: 0, wallHpAfter: 0, wallMaxHp: 1000, burning: false };
  const wallTier = getUserWallTier(targetId);
  const maxHp = wallMaxHpFor(u.city_hall_level ?? 1, wallTier);
  const cur = computeWallState(u.wall_hp, u.wall_updated_at, maxHp, now);
  const afterHp = Math.max(0, cur.wallHp - Math.max(0, Math.round(damage)));
  db.prepare(`UPDATE users SET wall_hp = ?, wall_updated_at = ? WHERE id = ?`).run(afterHp, now, targetId);
  const nextState = computeWallState(afterHp, now, maxHp, now);
  return {
    wallHpBefore: cur.wallHp,
    wallHpAfter: afterHp,
    wallMaxHp: maxHp,
    burning: nextState.burning
  };
}

/** Deduct unprotected resources from defender treasury up to surviving troop load (`gold -> iron -> stone -> lumber -> food`) */
function plunderDefenderTreasury(defenderId: string, defenderLevel: number, attackerName: string, survivingSoldiers: number, attackerCiv: CivilizationType): BattleLoot | null {
  if (survivingSoldiers <= 0) return null;
  let remainingLoad = Math.floor(survivingSoldiers * LOAD_PER_SOLDIER * (CIV_LOAD_MULT[attackerCiv] ?? 1.0));
  if (remainingLoad <= 0) return null;

  const protectedAmt = PROTECTED_TREASURY_PER_LEVEL * Math.max(1, defenderLevel);
  const defRes = getKingdomResources(defenderId);
  const order: Array<"gold" | "iron" | "stone" | "lumber" | "food"> = ["gold", "iron", "stone", "lumber", "food"];
  const taken: Record<"gold" | "iron" | "stone" | "lumber" | "food", number> = {
    gold: 0,
    iron: 0,
    stone: 0,
    lumber: 0,
    food: 0
  };

  let totalTaken = 0;
  for (const key of order) {
    if (remainingLoad <= 0) break;
    const unprotected = Math.max(0, (defRes[key] ?? 0) - protectedAmt);
    const amt = Math.min(remainingLoad, unprotected);
    if (amt > 0) {
      taken[key] = amt;
      remainingLoad -= amt;
      totalTaken += amt;
    }
  }

  if (totalTaken <= 0) return null;

  const next = {
    gold: defRes.gold - taken.gold,
    iron: defRes.iron - taken.iron,
    stone: defRes.stone - taken.stone,
    lumber: defRes.lumber - taken.lumber,
    food: defRes.food - taken.food
  };
  db.prepare(`
    UPDATE kingdom_resources
    SET gold = @gold, iron = @iron, stone = @stone, lumber = @lumber, food = @food, updated_at = datetime('now')
    WHERE user_id = @userId
  `).run({ userId: defenderId, ...next });

  db.prepare(`
    INSERT INTO resource_ledger (
      user_id, timestamp, type,
      gold_delta, iron_delta, stone_delta, lumber_delta, food_delta,
      gold_balance, iron_balance, stone_balance, lumber_balance, food_balance,
      scarce_key, scarce_delta, scarce_balance, reason
    ) VALUES (
      @userId, @timestamp, 'battle_plundered',
      @goldDelta, @ironDelta, @stoneDelta, @lumberDelta, @foodDelta,
      @goldBalance, @ironBalance, @stoneBalance, @lumberBalance, @foodBalance,
      NULL, 0, 0, @reason
    )
  `).run({
    userId: defenderId,
    timestamp: new Date().toISOString(),
    goldDelta: -taken.gold,
    ironDelta: -taken.iron,
    stoneDelta: -taken.stone,
    lumberDelta: -taken.lumber,
    foodDelta: -taken.food,
    goldBalance: next.gold,
    ironBalance: next.iron,
    stoneBalance: next.stone,
    lumberBalance: next.lumber,
    foodBalance: next.food,
    reason: `Treasury plundered by ${attackerName}'s victorious army`
  });

  return {
    gold: taken.gold || undefined,
    iron: taken.iron || undefined,
    stone: taken.stone || undefined,
    lumber: taken.lumber || undefined,
    food: taken.food || undefined
  };
}

/** Credit carried loot to the attacker's treasury when the returning march reaches home */
function creditCarriedLootOnReturn(userId: string, loot: BattleLoot, targetName: string, reason = `Army returned home with spoils from ${targetName}`, type = "battle_loot") {
  const cur = getKingdomResources(userId);
  const goldDelta = loot.gold ?? 0;
  const ironDelta = loot.iron ?? 0;
  const stoneDelta = loot.stone ?? 0;
  const lumberDelta = loot.lumber ?? 0;
  const foodDelta = loot.food ?? 0;

  const next = {
    gold: cur.gold + goldDelta,
    iron: cur.iron + ironDelta,
    stone: cur.stone + stoneDelta,
    lumber: cur.lumber + lumberDelta,
    food: cur.food + foodDelta
  };

  if (goldDelta + ironDelta + stoneDelta + lumberDelta + foodDelta > 0) {
    db.prepare(`
      UPDATE kingdom_resources
      SET gold = @gold, iron = @iron, stone = @stone, lumber = @lumber, food = @food, updated_at = datetime('now')
      WHERE user_id = @userId
    `).run({ userId, ...next });

    db.prepare(`
      INSERT INTO resource_ledger (
        user_id, timestamp, type,
        gold_delta, iron_delta, stone_delta, lumber_delta, food_delta,
        gold_balance, iron_balance, stone_balance, lumber_balance, food_balance,
        scarce_key, scarce_delta, scarce_balance, reason
      ) VALUES (
        @userId, @timestamp, @type,
        @goldDelta, @ironDelta, @stoneDelta, @lumberDelta, @foodDelta,
        @goldBalance, @ironBalance, @stoneBalance, @lumberBalance, @foodBalance,
        NULL, 0, 0, @reason
      )
    `).run({
      userId,
      timestamp: new Date().toISOString(),
      type,
      goldDelta,
      ironDelta,
      stoneDelta,
      lumberDelta,
      foodDelta,
      goldBalance: next.gold,
      ironBalance: next.iron,
      stoneBalance: next.stone,
      lumberBalance: next.lumber,
      foodBalance: next.food,
      reason
    });
  }

  const addScarce = db.prepare(`
    INSERT INTO kingdom_scarce_resources (user_id, resource_key, amount, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, resource_key) DO UPDATE SET amount = amount + excluded.amount, updated_at = datetime('now')
  `);
  for (const [key, amount] of Object.entries(loot.scarce ?? {})) {
    if (amount > 0) {
      addScarce.run(userId, key, amount);
      const newBal = (cur.scarce?.[key] ?? 0) + amount;
      db.prepare(`
        INSERT INTO resource_ledger (
          user_id, timestamp, type,
          gold_delta, iron_delta, stone_delta, lumber_delta, food_delta,
          gold_balance, iron_balance, stone_balance, lumber_balance, food_balance,
          scarce_key, scarce_delta, scarce_balance, reason
        ) VALUES (
          @userId, @timestamp, @type,
          0, 0, 0, 0, 0,
          @goldBalance, @ironBalance, @stoneBalance, @lumberBalance, @foodBalance,
          @scarceKey, @scarceDelta, @scarceBalance, @reason
        )
      `).run({
        userId,
        timestamp: new Date().toISOString(),
        type,
        goldBalance: next.gold,
        ironBalance: next.iron,
        stoneBalance: next.stone,
        lumberBalance: next.lumber,
        foodBalance: next.food,
        scarceKey: key,
        scarceDelta: amount,
        scarceBalance: newBal,
        reason: `Army returned home with ${amount}× ${key} from ${targetName}`
      });
    }
  }
}

/** Attacker joins Nethergarde: its people (including marching soldiers) convert proportionally to the arcane population scale */
function ascendAttacker(attackerId: string, fromCiv: CivilizationType, recordVacatedPlace = false) {
  if (fromCiv === "arcane") return;
  healAllWounded(attackerId, "the Moonwell lets its wounded go as the castle passes into the Voidrift");
  const u = getUser(attackerId);
  if (!u) return;
  const level = u.city_hall_level ?? 1;
  const converted = convertPopulationOnSwap({
    currentPop: u.population ?? 0,
    currentSoldiers: u.soldiers ?? 0,
    oldCiv: fromCiv,
    oldLevel: level,
    newCiv: "arcane",
    newLevel: level
  });

  // Also scale any active marching soldiers of this ruler so returning soldiers fit the new arcane population scale
  const popRatio = CIV_DEMOGRAPHICS.arcane.popMultiplier / Math.max(0.01, CIV_DEMOGRAPHICS[fromCiv].popMultiplier);
  const activeMarches = db
    .prepare(`SELECT id, soldiers_count FROM active_marches WHERE attacker_id = ? AND status = 'marching' AND COALESCE(phase, 'outbound') != 'done' AND band_id IS NULL`)
    .all(attackerId) as Array<{ id: string; soldiers_count: number }>;
  const scale = (n: number) => (n > 0 ? Math.max(1, Math.round(n * popRatio)) : 0);
  for (const m of activeMarches) {
    db.prepare(`UPDATE active_marches SET soldiers_count = ?, attacker_civ = 'arcane' WHERE id = ?`).run(scale(m.soldiers_count), m.id);
  }
  // …and the same soldiers where they stand in live battles (a battle keeps its own counts and writes them back each
  // round): its stacks, its reinforcements on someone's walls, its home garrison if its own castle is under attack
  const convert = (g: { count: number; initialCount: number; totalLosses: number; civ: CivilizationType }) => {
    g.count = scale(g.count);
    g.initialCount = scale(g.initialCount);
    g.totalLosses = Math.round(g.totalLosses * popRatio);
    g.civ = "arcane";
  };
  const live = db.prepare(`SELECT id, target_type, target_id, stacks_json, defender_json FROM battles WHERE status = 'fighting'`).all() as Array<{ id: string; target_type: string; target_id: string; stacks_json: string; defender_json: string }>;
  for (const b of live) {
    const stacks: LiveAttackerStack[] = JSON.parse(b.stacks_json || "[]");
    const defender: LiveDefenderState = JSON.parse(b.defender_json);
    const mine: Array<{ count: number; initialCount: number; totalLosses: number; civ: CivilizationType }> = [
      ...stacks.filter((s) => s.attackerId === attackerId && !s.band),
      ...(defender.reinforcements ?? []).filter((g) => g.ownerId === attackerId && !g.band)
    ];
    const home = b.target_type === "dev_kingdom" && b.target_id === attackerId;
    if (home) mine.push(defender);
    for (const g of mine) convert(g);
    const changed = mine.length > 0;
    if (changed) {
      db.prepare(`UPDATE battles SET stacks_json = ?, defender_json = ?${home ? `, defender_civ = 'arcane'` : ""} WHERE id = ?`).run(JSON.stringify(stacks), JSON.stringify(defender), b.id);
    }
  }

  db.prepare(`UPDATE users SET civilization = 'arcane', population = ?, soldiers = ?, max_population = ?, updated_at = datetime('now') WHERE id = ?`).run(
    converted.newPopulation,
    converted.newSoldiers,
    calculateMaxPopulation(level, "arcane"),
    attackerId
  );

  if (recordVacatedPlace) {
    db.prepare(`INSERT INTO civ_vacated_places (civ, user_id, user_name, vacated_at) VALUES (?, ?, ?, ?)`).run(
      fromCiv,
      attackerId,
      u.full_name || u.username,
      Date.now()
    );
  }

  recordPopulationLedger({
    userId: attackerId,
    type: "civ_swap",
    populationBalance: converted.newPopulation,
    soldiersBalance: converted.newSoldiers,
    reason: `Ascended to Nethergarde Voidrift (${fromCiv} → arcane)`
  });
}

/**
 * A ruler's castle moved to another province (Voidrift conquest): the armies that won it are pulled through
 * the rift with the castle and are home at once (banked by `completeReturningMarches` this tick); the ruler's
 * other marches are re-homed to the new castle in `rehomeSwappedMarches`.
 */
function teleportMarchHome(marchId: string, now: number, carry: BattleLoot | null, report: BattleReport) {
  sendMarchReturning(marchId, now, carry, report);
  db.prepare(`UPDATE active_marches SET start_x = target_x, start_z = target_z, return_time = ? WHERE id = ? AND phase = 'returning'`).run(now, marchId);
}

/** Rulers whose civilization changed in battle since the last war tick (their castles teleported) */
const pendingRehomes = new Set<string>();

/** Point the marches of rulers whose castle teleported at the new castle (they walk back there) */
function rehomeSwappedMarches(kingdoms: DeveloperKingdom[]) {
  if (pendingRehomes.size === 0) return;
  const placements = kingdomPlacements(kingdoms);
  for (const id of pendingRehomes) {
    const pos = placements[id];
    if (!pos) continue;
    db.prepare(`UPDATE active_marches SET home_x = ?, home_z = ? WHERE attacker_id = ? AND status = 'marching' AND COALESCE(phase, 'outbound') NOT IN ('returning', 'done')`).run(
      pos.x,
      pos.z,
      id
    );
  }
  pendingRehomes.clear();
}

function sendMarchReturning(marchId: string, now: number, carry?: BattleLoot | null, report?: BattleReport | null) {
  const m = db
    .prepare(`SELECT depart_time, arrival_time, soldiers_count, home_x, home_z, start_x, start_z, target_x, target_z, attacker_civ, attacker_id, phase, status FROM active_marches WHERE id = ?`)
    .get(marchId) as
    | { depart_time: number; arrival_time: number; soldiers_count: number; home_x: number | null; home_z: number | null; start_x: number; start_z: number; target_x: number; target_z: number; attacker_civ: CivilizationType; attacker_id: string; phase: string | null; status: string }
    | undefined;
  if (!m) return;
  // Already on its way home (recalled, fallen back) or home: its walk and its haul stay as they are; it only learns
  // how the battle it left ended
  if (m.status !== "marching" || m.phase === "returning" || m.phase === "done") {
    if (report) db.prepare(`UPDATE active_marches SET battle_result_json = COALESCE(battle_result_json, ?) WHERE id = ?`).run(JSON.stringify(report), marchId);
    return;
  }
  let travelDur = Math.max(1000, m.arrival_time - m.depart_time);
  // Rally members set out from the leader's castle but walk back to their own
  if (m.home_x !== null && m.home_z !== null && (m.home_x !== m.start_x || m.home_z !== m.start_z)) {
    travelDur = travelMsFor(Math.hypot(m.target_x - m.home_x, m.target_z - m.home_z), m.attacker_civ, effectsOf(m.attacker_id).marchSpeedMult);
    db.prepare(`UPDATE active_marches SET start_x = ?, start_z = ? WHERE id = ?`).run(m.home_x, m.home_z, marchId);
  }
  // If wiped out (0 survivors), no soldiers walk back — mark done after showcase
  if (m.soldiers_count <= 0) {
    db.prepare(`
      UPDATE active_marches
      SET phase = 'done', status = 'resolved', act_until = ?, return_time = ?,
          carry_json = ?, battle_result_json = COALESCE(?, battle_result_json)
      WHERE id = ?
    `).run(now, now, carry ? JSON.stringify(carry) : null, report ? JSON.stringify(report) : null, marchId);
    return;
  }
  const returnTime = now + travelDur;
  db.prepare(`
    UPDATE active_marches
    SET phase = 'returning', act_until = ?, return_time = ?,
        carry_json = COALESCE(?, carry_json),
        battle_result_json = COALESCE(?, battle_result_json)
    WHERE id = ?
  `).run(now, returnTime, carry ? JSON.stringify(carry) : null, report ? JSON.stringify(report) : null, marchId);
}

/* ------------------------------------------------------------------------- */
/* World NPC battles (mobs / bandits), scouting & fog of war                 */
/* ------------------------------------------------------------------------- */

const LOOT_KEYS = ["gold", "iron", "stone", "lumber", "food"] as const;

function addLoot(into: BattleLoot, add: BattleLoot | null) {
  if (!add) return;
  for (const k of LOOT_KEYS) if (add[k]) into[k] = (into[k] ?? 0) + add[k]!;
}

/**
 * A mob / bandit battle is over. Win: the pack is gone for everyone until the next roving window, the
 * survivors carry the spoils home and every other march still heading there turns back (race rule).
 * Mobs drop a fixed reward by tier, split by surviving troops; bandits' stash is taken by load (survivors × load),
 * first-arrived army first. Loss: the pack keeps its losses for the next challenger.
 */
function finishWorldNpcBattle(
  bRow: any,
  defender: LiveDefenderState,
  stacks: LiveAttackerStack[],
  attackerWon: boolean,
  report: BattleReport,
  log: string[],
  now: number
): BattleReport {
  const info = defender.npc;
  const tier = info?.rarity ?? "common";
  report.defenderNpc = info
    ? { type: info.type, emblem: info.emblem, category: info.category ?? "mob", rarity: info.rarity, unitName: info.unitName }
    : null;
  report.wallHpBefore = undefined;
  report.wallHpAfter = undefined;
  report.wallMaxHp = undefined;
  report.defenderBurning = false;

  if (!attackerWon) {
    log.push(`🛡️ ${bRow.target_name} still holds the field with ${defender.count.toLocaleString()} left. The survivors fall back.`);
    for (const s of stacks) sendMarchReturning(s.marchId, now, null, report);
    return saveReport(report);
  }

  markNpcDead({ id: bRow.target_id, category: info?.category, expiresAt: info?.expiresAt ?? undefined } as MapNPC, now);
  const survivors = stacks.filter((s) => s.count > 0 && !s.left);
  const totalSurvivors = survivors.reduce((sum, s) => sum + s.count, 0);
  const combined: BattleLoot = {};
  const carries = new Map<string, BattleLoot | null>();
  // 🛡️ Better-geared packs carry more
  const gearLoot = PACK_GEAR[packGearFor(bRow.target_id)].loot;

  if (info?.category === "bandit") {
    const stash: Record<string, number> = Object.fromEntries(Object.entries(BANDIT_STASH_BY_TIER[tier] ?? BANDIT_STASH_BY_TIER.common).map(([k, v]) => [k, Math.round(v * gearLoot)]));
    for (const s of survivors) {
      let load = Math.floor(s.count * pveLoadPerSoldierFor(s.civ));
      const carry: BattleLoot = {};
      for (const k of LOOT_KEYS) {
        const amt = Math.min(load, stash[k] ?? 0);
        if (amt > 0) {
          carry[k] = amt;
          stash[k] -= amt;
          load -= amt;
        }
      }
      carries.set(s.marchId, Object.keys(carry).length ? carry : null);
      addLoot(combined, carry);
    }
  } else {
    const base = MOB_LOOT_BY_TIER[tier] ?? MOB_LOOT_BY_TIER.common;
    const reward = { food: base.food * gearLoot, lumber: base.lumber * gearLoot, iron: base.iron * gearLoot, gold: base.gold * gearLoot };
    for (const s of survivors) {
      const share = totalSurvivors > 0 ? s.count / totalSurvivors : 0;
      const carry: BattleLoot = {};
      for (const k of ["food", "lumber", "iron", "gold"] as const) {
        const amt = Math.floor(reward[k] * share);
        if (amt > 0) carry[k] = amt;
      }
      carries.set(s.marchId, Object.keys(carry).length ? carry : null);
      addLoot(combined, carry);
    }
  }

  report.loot = Object.keys(combined).length ? combined : null;
  const summary = Object.entries(combined)
    .map(([k, v]) => `${(v as number).toLocaleString()} ${k}`)
    .join(", ");
  log.push(`🏆 ${bRow.target_name} is wiped out!${summary ? ` Spoils carried home: ${summary}.` : ""}`);
  const turned = turnBackRacers(bRow.target_id, new Set(stacks.map((s) => s.marchId)), now);
  if (turned > 0) log.push(`↩️ ${turned} other ${turned === 1 ? "army" : "armies"} heading there turn back home.`);

  for (const s of stacks) sendMarchReturning(s.marchId, now, carries.get(s.marchId) ?? null, report);
  return saveReport(report);
}

/* ------------------------------------------------------------------------- */
/* World bosses, NPC kingdoms & Special Overseers                            */
/* ------------------------------------------------------------------------- */

/** Rounds a march fights before falling back: a rally's armies fight longer (COMBAT.RALLY_MAX_ROUNDS) */
const marchMaxRounds = (march: Pick<ActiveMarch, "rallyId">) => (march.rallyId ? COMBAT.RALLY_MAX_ROUNDS : COMBAT.MAX_ROUNDS);

/**
 * Soldiers an Art brought back this round (they were counted as fallen when they fell): back into their rulers'
 * populations, and the home garrison's into its ruler's soldiers. Wild NPC garrisons are kept in the battle's own state.
 */
function applyArtHeals(bRow: { target_type: string; target_id: string; target_name: string }, stacks: LiveAttackerStack[], defender: LiveDefenderState, healed: Record<string, number>) {
  for (const [key, n] of Object.entries(healed)) {
    if (n <= 0) continue;
    const stack = stacks.find((s) => s.marchId === key);
    if (stack) {
      db.prepare(`UPDATE active_marches SET soldiers_count = ? WHERE id = ?`).run(stack.count, stack.marchId);
      if (stack.band) setBandStrength(stack.band.id, stack.count, stack.band.fullCount, { place: bRow.target_name });
      // 🌙 An elf army's people are settled by the Moonwell after the round (some of its fallen were only wounded)
      else if (!hasMoonwell(stack.civ)) db.prepare(`UPDATE users SET population = COALESCE(population, 0) + ? WHERE id = ?`).run(n, stack.attackerId);
      continue;
    }
    const group = (defender.reinforcements ?? []).find((g) => g.marchId === key);
    if (group?.band) {
      setBandStrength(group.band.id, group.count, group.band.fullCount, { place: bRow.target_name });
    } else if (group) {
      db.prepare(`UPDATE active_marches SET soldiers_count = ? WHERE id = ?`).run(group.count, group.marchId);
      if (!hasMoonwell(group.civ)) db.prepare(`UPDATE users SET population = COALESCE(population, 0) + ? WHERE id = ?`).run(n, group.ownerId);
    } else if (key === "home" && bRow.target_type === "dev_kingdom") {
      if (hasMoonwell(defender.civ)) db.prepare(`UPDATE users SET soldiers = COALESCE(soldiers, 0) + ? WHERE id = ?`).run(n, bRow.target_id);
      else db.prepare(`UPDATE users SET soldiers = COALESCE(soldiers, 0) + ?, population = COALESCE(population, 0) + ? WHERE id = ?`).run(n, n, bRow.target_id);
    }
  }
}

/**
 * The attacking stack a march brings into a battle (`joinedRound`: the battle round it arrives for). A mercenary band
 * fights as its soldier-equivalents with its kit: its civilization's soldiers, never its ruler's titles or landmarks
 */
function openingStack(march: ActiveMarch, joinedRound = 1): LiveAttackerStack {
  const band = march.band ? bandStackFields(march) : {};
  return {
    marchId: march.id,
    attackerId: march.attackerId,
    attackerName: march.band ? `${march.attackerName}'s ${march.band.name}` : march.attackerName,
    civ: march.attackerCiv,
    count: march.soldiersCount,
    initialCount: march.soldiersCount,
    joinedRound,
    ...band,
    roundsFought: 0,
    carryDamageTaken: 0,
    totalDamageDealt: 0,
    totalLosses: 0,
    atkBonusMult: march.atkBonus ?? undefined,
    maxRounds: marchMaxRounds(march),
    ...(march.armory && !march.band ? { armory: { rarity: march.armory.rarity, name: march.armory.name, emblem: march.armory.emblem } } : {}),
    // 🦸 The champion leading it: its kit at its level (at its art share) and its stat bonus
    ...(march.champion && !march.band ? (championBattleFields(march.attackerId) ?? {}) : {})
  };
}

/** A band's stack fields: its kit (its civilization's mercenary of its rarity) and its bookkeeping */
function bandStackFields(march: ActiveMarch): Partial<LiveAttackerStack> {
  const b = march.band!;
  return { kit: mercKitFor(march.attackerCiv, b.rarity, b.name), band: { id: b.id, fullCount: b.fullCount, rarity: b.rarity, emblem: b.emblem } };
}

/** Open a live battle on a map NPC; round 1 runs on the next tick */
function insertNpcBattle(march: ActiveMarch, targetName: string, defenderCiv: string, defender: LiveDefenderState, log: string[], now: number) {
  const battleId = `battle_${now}_${Math.random().toString(36).substring(2, 7)}`;
  db.prepare(`
    INSERT INTO battles (id, target_type, target_id, target_name, defender_civ, started_at, round, next_round_at, defender_json, stacks_json, rounds_json, log_json, status)
    VALUES (?, 'npc', ?, ?, ?, ?, 0, ?, ?, ?, '[]', ?, 'fighting')
  `).run(battleId, march.targetId, targetName, defenderCiv, now, now, JSON.stringify(defender), JSON.stringify([openingStack(march)]), JSON.stringify(log));
  db.prepare(`UPDATE active_marches SET phase = 'acting', battle_id = ?, joined_round = 1, act_until = ? WHERE id = ?`).run(
    battleId,
    now + marchMaxRounds(march) * BATTLE_ROUND_MS,
    march.id
  );
}

/** Shared HP left on a boss defender: one unit, its carried damage is the share already lost */
const bossHpOf = (d: LiveDefenderState) => Math.max(0, Math.round((d.boss?.maxHp ?? 0) * Math.max(0, d.count - d.carryDamageTaken)));

/** An army reaches a world boss: it fights the boss's shared HP with its skills */
function openBossBattle(march: ActiveMarch, npc: MapNPC, now: number) {
  const st = getBossState(npc, now);
  if (st.dead) {
    sendMarchReturning(march.id, now, null, null);
    return;
  }
  const unit = activeBossUnit(npc, now);
  const defender: LiveDefenderState = {
    civ: march.attackerCiv,
    count: 1,
    initialCount: 1,
    fortified: false,
    roundsFought: 0,
    carryDamageTaken: 1 - st.hp / st.maxHp,
    totalLosses: 0,
    unit: { hp: st.maxHp, atk: unit.atk, def: unit.def },
    kit: bossKitFor(npc.type, npc.name),
    npc: { type: npc.type, category: "boss", rarity: npc.rarity, emblem: npc.emblem, unitName: npc.name, expiresAt: null },
    boss: { maxHp: st.maxHp, hpAtStart: st.hp, lifeKey: st.lifeKey, weekKey: st.weekKey }
  };
  const log = [
    `🚩 ${marchersOf(march)} ${verbOf(march, "challenge", "challenges")} ${npc.emblem} ${npc.name} (${st.hp.toLocaleString()} / ${st.maxHp.toLocaleString()} HP).`,
    ...kitLines(unit.kit).map((l) => `✴️ ${l}.`)
  ];
  insertNpcBattle(march, npc.name, "npc", defender, log, now);
}

/**
 * An NPC kingdom garrison's Battle Arts (its civilization's, sized by the realm's stage or the gate's rarity) and the
 * trim on its soldiers' HP and ATK that pays for them, against `attackerCiv` behind its walls
 */
function npcKingdomArts(npc: MapNPC, k: { civ: CivilizationType; wallTier: number }, attackerCiv: CivilizationType) {
  const rarity = (npc.rarity === "mythical" ? "mythic" : npc.rarity ?? "common") as UnitRarity;
  const kit = npcKingdomKitFor(k.civ, rarity, `${npc.name} garrison`);
  const def = effectiveUnit(k.civ, attackerCiv, "defending").def * wallDefMultForTier(k.wallTier);
  return { kit, kitTrim: kitTrimFor(def, kit) };
}

/** An army reaches an NPC kingdom: its garrison defends behind walls by level, with its donor civ's soldiers */
function openNpcKingdomBattle(march: ActiveMarch, npc: MapNPC, now: number) {
  const k = getNpcKingdom(npc, now);
  // Burning walls, or a realm whose shield went up (building day) or that is crumbling away: turn back, no battle
  if (k.burning || npc.landmarkState) {
    sendMarchReturning(march.id, now, null, null);
    return;
  }
  const defUnit = CIV_DEMOGRAPHICS[k.civ].soldierUnit.name;
  const defender: LiveDefenderState = {
    civ: k.civ,
    count: k.garrison,
    initialCount: k.garrison,
    fortified: true,
    wallTier: k.wallTier,
    wallDefMult: wallDefMultForTier(k.wallTier),
    roundsFought: 0,
    carryDamageTaken: 0,
    totalLosses: 0,
    npc: { type: npc.type, category: "kingdom", rarity: npc.rarity, emblem: npc.emblem, unitName: defUnit, expiresAt: null },
    ...npcKingdomArts(npc, k, march.attackerCiv),
    // A frontier gate: its civilization's troops on gate duty stand beside the garrison
    ...(k.gate ? { reinforcements: stationedGroupsAt(npc.id) } : {})
  };
  const log = [
    `🚩 ${marchersOf(march)} ${verbOf(march, "reach", "reaches")} ${npc.emblem} ${npc.name} (City Hall ${k.level}, ${defUnit}s, Walls Tier ${k.wallTier}, DEF ×${wallDefMultForTier(k.wallTier).toFixed(2)}).`
  ];
  log.push(...kitLines(defender.kit!).map((l) => `✴️ ${l}.`));
  for (const g of defender.reinforcements ?? []) log.push(`🛡️ ${g.count}× ${CIV_DEMOGRAPHICS[g.civ].soldierUnit.name} of ${g.ownerName} hold the gate beside the garrison.`);
  if (k.garrison === 0 && !(defender.reinforcements ?? []).length) log.push("🚪 The city walls stand unguarded!");
  insertNpcBattle(march, npc.name, k.civ, defender, log, now);
}

/** Split `amount` by weights (floored), the remainder going to the heaviest */
function splitByWeight(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || amount <= 0) return weights.map(() => 0);
  const out = weights.map((w) => Math.floor((amount * w) / total));
  const rest = amount - out.reduce((a, b) => a + b, 0);
  if (rest > 0) out[weights.indexOf(Math.max(...weights))] += rest;
  return out;
}

/**
 * A boss battle is over. Still standing: its wounds stay for the next challengers. Killed: it is gone until its
 * respawn timer; the armies of this battle take its hoard by load (first-arrived first, what nobody can carry is
 * left behind) and its gems by survivors; everyone who damaged it this life gets a share of the bounty by damage,
 * paid into their treasury at once; every other army heading there turns back.
 */
function finishBossBattle(bRow: any, defender: LiveDefenderState, stacks: LiveAttackerStack[], report: BattleReport, log: string[], now: number): BattleReport {
  const info = defender.npc!;
  const boss = defender.boss!;
  const hpAfter = bossHpOf(defender);
  report.defenderNpc = { type: info.type, emblem: info.emblem, category: "boss", rarity: info.rarity, unitName: info.unitName };
  report.wallHpBefore = undefined;
  report.wallHpAfter = undefined;
  report.wallMaxHp = undefined;
  report.defenderBurning = false;
  report.bossHp = { before: boss.hpAtStart, after: hpAfter, max: boss.maxHp };

  if (defender.count > 0) {
    log.push(`🐉 ${bRow.target_name} still stands with ${hpAfter.toLocaleString()} / ${boss.maxHp.toLocaleString()} HP — its wounds stay for the next challengers.`);
    for (const s of stacks) sendMarchReturning(s.marchId, now, null, report);
    return saveReport(report);
  }

  markBossDead(bRow.target_id, boss, now);
  log.push(`🏆 ${bRow.target_name} falls!`);

  // 🌑 Xal'Vorath's hoard and bounty are worth more by its Level (shared out as its stats were, if the Wrath was split)
  const horror = isHorrorId(bRow.target_id) ? horrorRewards(bRow.target_id) : null;
  const rewardMult = horror?.mult ?? 1;

  // The hoard: bulk by load, gems by survivors
  const pool: Record<string, number> = Object.fromEntries(Object.entries(BOSS_HOARD).map(([k, v]) => [k, Math.floor(v * rewardMult)]));
  const survivors = stacks.filter((s) => s.count > 0 && !s.left);
  const gemKey = BOSS_GEM_KEYS[Math.abs(hash(info.type)) % BOSS_GEM_KEYS.length];
  const gems = splitByWeight(BOSS_HOARD_GEMS, survivors.map((s) => s.count));
  const carries = new Map<string, BattleLoot | null>();
  const combined: BattleLoot = {};
  survivors.forEach((s, i) => {
    let load = Math.floor(s.count * LOAD_PER_SOLDIER * (CIV_LOAD_MULT[s.civ] ?? 1));
    const carry: BattleLoot = {};
    for (const k of LOOT_KEYS) {
      const amt = Math.min(load, pool[k] ?? 0);
      if (amt > 0) {
        carry[k] = amt;
        pool[k] -= amt;
        load -= amt;
      }
    }
    if (gems[i] > 0) carry.scarce = { [gemKey]: gems[i] };
    carries.set(s.marchId, Object.keys(carry).length ? carry : null);
    addLoot(combined, carry);
    if (gems[i] > 0) combined.scarce = { ...combined.scarce, [gemKey]: (combined.scarce?.[gemKey] ?? 0) + gems[i] };
  });
  report.loot = Object.keys(combined).length ? combined : null;
  if (report.loot) {
    const summary = [...LOOT_KEYS.filter((k) => combined[k]).map((k) => `${combined[k]!.toLocaleString()} ${k}`), ...(combined.scarce?.[gemKey] ? [`${combined.scarce[gemKey]}× ${gemKey}`] : [])].join(", ");
    log.push(`💰 Its hoard is carried home: ${summary}.`);
  }

  // The bounty, by damage dealt this life
  const dealers = getBossDamage(bRow.target_id, boss.lifeKey);
  const totalDamage = dealers.reduce((sum, d) => sum + d.damage, 0);
  report.bossBounty = dealers.map((d) => {
    const share = totalDamage > 0 ? d.damage / totalDamage : 0;
    const loot: BattleLoot = {};
    for (const k of LOOT_KEYS) {
      const amt = Math.floor(BOSS_BOUNTY[k] * rewardMult * share);
      if (amt > 0) loot[k] = amt;
    }
    if (Object.keys(loot).length) creditCarriedLootOnReturn(d.userId, loot, bRow.target_name, `Bounty for ${bRow.target_name}: ${Math.round(share * 100)}% of the damage it took this life`, "boss_bounty");
    return { userId: d.userId, name: d.name, damage: d.damage, loot };
  });
  if (dealers.length) log.push(`🎖️ The bounty is shared by ${dealers.length} ${dealers.length === 1 ? "ruler" : "rulers"} who wounded it, by damage dealt.`);
  // 🌑 One mythical gem, whole however many kingdoms the Wrath was split among, to the ruler who wounded it most
  if (horror && dealers[0]) {
    creditCarriedLootOnReturn(dealers[0].userId, { scarce: { [HORROR.GEM]: 1 } }, bRow.target_name, `The Heart of the Void, from ${bRow.target_name}: the most damage dealt`, "boss_bounty");
    log.push(`🌑 ${dealers[0].name}, who wounded it most, takes the Heart of the Void.`);
    recordRealmEvent("horror_slain", report.attackerId, horror.targetId, { targetName: horror.targetName, level: horror.level, killerName: report.attackerName, topName: dealers[0].name, dealers: dealers.length }, new Date(now));
  }
  report.participants = [...new Set([...(report.participants ?? []), ...dealers.map((d) => d.userId)])];
  announceBossSlain({
    bossId: bRow.target_id,
    bossName: bRow.target_name,
    emblem: info.emblem,
    killerId: report.attackerId,
    killerName: report.attackerName,
    rally: new Set(stacks.map((s) => s.attackerId)).size > 1,
    dealers,
    now: new Date(now)
  });

  const turned = turnBackRacers(bRow.target_id, new Set(stacks.map((s) => s.marchId)), now, ["attack", "rally", "rally_join"]);
  if (turned > 0) log.push(`↩️ ${turned} other ${turned === 1 ? "army" : "armies"} heading there turn back home.`);
  for (const s of stacks) sendMarchReturning(s.marchId, now, carries.get(s.marchId) ?? null, report);
  return saveReport(report);
}

/**
 * An NPC kingdom battle is over (never destroyed). Garrison beaten: every surviving army plunders its treasury
 * by load above the protected vault; the wall damage may set it burning. Otherwise the attackers fall back.
 */
function finishNpcKingdomBattle(
  bRow: any,
  defender: LiveDefenderState,
  stacks: LiveAttackerStack[],
  attackerWon: boolean,
  report: BattleReport,
  log: string[],
  burning: boolean,
  now: number
): BattleReport {
  const info = defender.npc;
  report.defenderNpc = info ? { type: info.type, emblem: info.emblem, category: "kingdom", rarity: info.rarity, unitName: info.unitName } : null;
  if (burning && NPC_GATE_CIV[bRow.target_id]) announceGateFallen(bRow.target_id, bRow.target_name, stacks, now);

  if (!attackerWon) {
    log.push(
      burning
        ? `🔥 ${bRow.target_name}'s walls drop below 25% HP and catch fire — it is protected until they repair; the attackers retreat.`
        : `🛡️ ${bRow.target_name}'s garrison repels the attack.`
    );
    for (const s of stacks) sendMarchReturning(s.marchId, now, null, report);
    return saveReport(report);
  }

  const k = getNpcKingdom({ id: bRow.target_id } as MapNPC, now);
  const protectedAmt = PROTECTED_TREASURY_PER_LEVEL * k.level;
  const treasury: BulkTreasury = { ...k.treasury };
  const combined: BattleLoot = {};
  for (const s of stacks) {
    let carry: BattleLoot | null = null;
    if (s.count > 0 && !s.left) {
      let load = Math.floor(s.count * LOAD_PER_SOLDIER * (CIV_LOAD_MULT[s.civ] ?? 1));
      const c: BattleLoot = {};
      for (const key of LOOT_KEYS) {
        const amt = Math.min(load, Math.max(0, (treasury[key] ?? 0) - protectedAmt));
        if (amt > 0) {
          c[key] = amt;
          treasury[key] -= amt;
          load -= amt;
        }
      }
      carry = Object.keys(c).length ? c : null;
      addLoot(combined, carry);
    }
    sendMarchReturning(s.marchId, now, carry, report);
  }
  setNpcKingdomTreasury(bRow.target_id, treasury, now);
  report.loot = Object.keys(combined).length ? combined : null;
  log.push(
    report.loot
      ? `💰 Plundered ${LOOT_KEYS.filter((key) => combined[key]).map((key) => `${combined[key]!.toLocaleString()} ${key}`).join(", ")} (carried home by surviving troops).`
      : `🛡️ ${bRow.target_name}'s remaining resources were inside the protected vault.`
  );
  if (burning) log.push(`🔥 ${bRow.target_name}'s walls are breached and burning — it is protected until they repair above 25%.`);
  payRealmHoard(bRow, k.level, stacks, report, log, now);
  return saveReport(report);
}

/**
 * 👑 A free realm's garrison is beaten: its conquest hoard (REALM_CONQUEST_HOARD by its tier, gems from rare up) is paid
 * straight into the conquerors' treasuries, split by the damage each ruler's armies dealt in this battle, once a day per
 * realm. Frontier gates hold none.
 */
function payRealmHoard(bRow: any, level: number, stacks: LiveAttackerStack[], report: BattleReport, log: string[], now: number) {
  if (NPC_GATE_CIV[bRow.target_id]) return;
  const readyAt = realmHoardReadyAt(bRow.target_id, now);
  if (readyAt) {
    log.push(`👑 ${bRow.target_name}'s conquest hoard was already won today; it gathers again in about ${Math.ceil((readyAt - now) / 3_600_000)} h.`);
    return;
  }
  const tier = realmRarityAt(level) as keyof typeof REALM_CONQUEST_HOARD;
  const hoard = REALM_CONQUEST_HOARD[tier] ?? REALM_CONQUEST_HOARD.common;
  const gemKey = realmHoardGemFor(bRow.target_id);
  // Damage by ruler (a band or a champion counts for its hirer)
  const byRuler = new Map<string, { name: string; damage: number }>();
  for (const s of stacks) {
    const cur = byRuler.get(s.attackerId) ?? { name: rulerNameOf(s, stacks), damage: 0 };
    cur.damage += s.totalDamageDealt;
    byRuler.set(s.attackerId, cur);
  }
  const rulers = [...byRuler.entries()].map(([userId, v]) => ({ userId, ...v })).sort((a, b) => b.damage - a.damage);
  const total = rulers.reduce((sum, r) => sum + r.damage, 0);
  let gemsLeft = hoard.gems;
  report.realmHoard = rulers.map((r) => {
    const share = total > 0 ? r.damage / total : 1 / rulers.length;
    const loot: BattleLoot = {};
    for (const key of LOOT_KEYS) {
      const amt = Math.floor(hoard[key] * share);
      if (amt > 0) loot[key] = amt;
    }
    // Gems by share, rounded down; what rounding leaves goes to the top dealer (below)
    const gems = Math.floor(hoard.gems * share);
    gemsLeft -= gems;
    if (gems > 0) loot.scarce = { [gemKey]: gems };
    return { userId: r.userId, name: r.name, damage: Math.round(r.damage), loot };
  });
  if (gemsLeft > 0 && report.realmHoard.length) {
    const top = report.realmHoard[0];
    top.loot.scarce = { [gemKey]: (top.loot.scarce?.[gemKey] ?? 0) + gemsLeft };
  }
  for (const h of report.realmHoard) {
    creditCarriedLootOnReturn(h.userId, h.loot, bRow.target_name, `Conquest hoard of ${bRow.target_name} (${tier}): ${total > 0 ? Math.round((h.damage / total) * 100) : 100}% of the damage dealt`, "realm_hoard");
  }
  claimRealmHoard(bRow.target_id, now);
  report.participants = [...new Set([...(report.participants ?? []), ...rulers.map((r) => r.userId)])];
  log.push(`👑 ${bRow.target_name}'s ${tier} conquest hoard is won: ${LOOT_KEYS.filter((key) => hoard[key]).map((key) => `${hoard[key].toLocaleString()} ${key}`).join(", ")}${hoard.gems ? ` and ${hoard.gems}× ${gemKey.replace("_", " ")}` : ""}, paid into ${rulers.length === 1 ? "the conqueror's treasury" : `${rulers.length} treasuries by damage dealt`}.`);
}

/** Overseer's Resolve stacks this week (stacks from an earlier week count as 0) */
function grudgeStacksOf(u: { id: string }, now = Date.now()): number {
  const row = db.prepare(`SELECT grudge_stacks, grudge_week_key FROM users WHERE id = ?`).get(u.id) as { grudge_stacks: number | null; grudge_week_key: string | null } | undefined;
  return row && row.grudge_week_key === weekWindow(now).weekKey ? row.grudge_stacks ?? 0 : 0;
}

/**
 * Every harvest (and on startup) the Special Overseers respawn: City Hall 25 (the Archon 30), full population, a garrison of
 * OVERSEER_GARRISON_SHARE of their maximum soldiers, their treasury back to the preset; their Resolve resets on a new week.
 */
export function resetOverseers(now = Date.now()) {
  const { weekKey } = weekWindow(now);
  const users = (db.prepare(`SELECT id, username FROM users`).all() as Array<{ id: string; username: string }>).filter((u) => isSpecialUser(u));
  db.transaction(() => {
    for (const u of users) {
      const level = isArchonUser(u) ? ARCHON_CASTLE_LEVEL : MAX_BUILDING_LEVEL;
      const pop = calculateMaxPopulation(level, "arcane");
      const soldiers = Math.round(maxSoldiersFor(pop, "arcane") * OVERSEER_GARRISON_SHARE);
      db.prepare(`
        UPDATE users SET population = ?, soldiers = ?, max_population = ?, city_hall_level = ?, void_well = 0,
          grudge_stacks = CASE WHEN grudge_week_key = ? THEN grudge_stacks ELSE 0 END, grudge_week_key = ?
        WHERE id = ?
      `).run(pop, soldiers, pop, level, weekKey, weekKey, u.id);
      db.prepare(`
        INSERT INTO kingdom_resources (user_id, gold, iron, stone, lumber, food, updated_at) VALUES (@id, @gold, @iron, @stone, @lumber, @food, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET gold = @gold, iron = @iron, stone = @stone, lumber = @lumber, food = @food, updated_at = datetime('now')
      `).run({ id: u.id, ...OVERSEER_TREASURY });
      for (const [key, amount] of Object.entries(OVERSEER_SCARCE)) {
        db.prepare(`
          INSERT INTO kingdom_scarce_resources (user_id, resource_key, amount, updated_at) VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, resource_key) DO UPDATE SET amount = excluded.amount, updated_at = datetime('now')
        `).run(u.id, key, amount);
      }
    }
  })();
}

/** Exact intel on the march's target, as the scouts see it right now; null when the target is gone */
/** What a ruler's last harvest paid (allocation + title bonus), so scout estimates can project the treasury */
function lastHarvestIncome(userId: string): NonNullable<ScoutDetails["harvestIncome"]> {
  const out = { gold: 0, iron: 0, stone: 0, lumber: 0, food: 0, scarce: 0 };
  const last = db.prepare(`SELECT timestamp FROM resource_ledger WHERE user_id = ? AND type = 'harvest_allocation' ORDER BY id DESC LIMIT 1`).get(userId) as { timestamp: string } | undefined;
  if (!last) return out;
  const rows = db
    .prepare(
      `SELECT gold_delta, iron_delta, stone_delta, lumber_delta, food_delta, COALESCE(scarce_delta, 0) AS scarce_delta FROM resource_ledger
       WHERE user_id = ? AND timestamp = ? AND type IN ('harvest_allocation', 'title_harvest_bonus')`
    )
    .all(userId, last.timestamp) as Array<{ gold_delta: number; iron_delta: number; stone_delta: number; lumber_delta: number; food_delta: number; scarce_delta: number }>;
  for (const r of rows) {
    out.gold += r.gold_delta;
    out.iron += r.iron_delta;
    out.stone += r.stone_delta;
    out.lumber += r.lumber_delta;
    out.food += r.food_delta;
    out.scarce += r.scarce_delta;
  }
  return out;
}

function scoutDetailsFor(march: ActiveMarch, kingdoms: DeveloperKingdom[], now: number): ScoutDetails | null {
  if (march.targetType === "dev_kingdom") {
    const u = getUser(march.targetId);
    if (!u) return null;
    const level = u.city_hall_level ?? 1;
    const wallTier = getUserWallTier(u.id);
    const wall = computeWallState(u.wall_hp, u.wall_updated_at, wallMaxHpFor(level, wallTier), now);
    const res = getKingdomResources(u.id);
    // Soldiers out on marches (civilians out scouting or gathering are not soldiers)
    const away = getDeployedSoldiers(u.id);
    const last = db
      .prepare(`SELECT timestamp, attacker_name, attacker_won FROM battle_reports WHERE defender_id = ? ORDER BY timestamp DESC LIMIT 1`)
      .get(u.id) as { timestamp: string; attacker_name: string; attacker_won: number } | undefined;
    // What the scouts see includes the ruler's milestone titles and landmark improvements
    const unit = effectiveUnit(u.civilization, march.attackerCiv, "defending", rulerStatBuffs(u.id));
    const round100 = (n: number) => Math.round(n / 100) * 100;
    return {
      harvestIncome: lastHarvestIncome(u.id),
      civilization: u.civilization,
      cityHallLevel: level,
      garrison: u.soldiers ?? 0,
      population: u.population ?? 0,
      maxPopulation: calculateMaxPopulation(level, u.civilization),
      soldiersAway: away,
      unitName: CIV_DEMOGRAPHICS[u.civilization].soldierUnit.name,
      unitStats: { hp: Math.round(unit.hp), atk: Math.round(unit.atk), def: Math.round(unit.def) },
      trait: CIV_DEMOGRAPHICS[u.civilization].soldierUnit.trait,
      modifiers: (CIV_MODIFIERS[u.civilization] ?? []).map((m) => `${m.kind === "buff" ? "▲" : "▼"} ${m.name}: ${m.description}`),
      treasury: { gold: round100(res.gold), iron: round100(res.iron), stone: round100(res.stone), lumber: round100(res.lumber), food: round100(res.food) },
      scarce: res.scarce,
      wallTier,
      wallHp: wall.wallHp,
      wallMaxHp: wall.wallMaxHp,
      burning: wall.burning,
      lastBattle: last ? { at: last.timestamp, attackerName: last.attacker_name, attackerWon: Boolean(last.attacker_won) } : null
    };
  }

  if (march.targetType === "spire") {
    const spire = db.prepare(`SELECT * FROM nethergarde_spires WHERE id = ?`).get(march.targetId) as any;
    if (!spire || spire.occupied_by_dev_id) return null;
    const npc = voidNpcFor(spire.slot_index);
    const wall = computeWallState(spire.wall_hp, spire.wall_updated_at, npc.wallMaxHp, now);
    return {
      emblem: "🔮",
      civilization: "arcane",
      cityHallLevel: npc.level,
      garrison: spire.garrison ?? 0,
      maxGarrison: spire.max_garrison ?? npc.maxGarrison,
      population: npc.population,
      unitName: CIV_DEMOGRAPHICS.arcane.soldierUnit.name,
      trait: CIV_DEMOGRAPHICS.arcane.soldierUnit.trait,
      wallTier: npc.wallTier,
      wallHp: wall.wallHp,
      wallMaxHp: wall.wallMaxHp,
      burning: wall.burning,
      loot: npc.loot
    };
  }

  const npc = findMapNpc(kingdoms, march.targetId);
  if (!npc) return null;
  const lore = [npc.subtitle, npc.description].filter(Boolean);
  // A landmark on its rotation day: the scouts also tell what is happening to it
  if (npc.landmarkState) {
    const hours = Math.max(1, Math.ceil((npc.landmarkState.until - now) / 3_600_000));
    lore.push(
      npc.landmarkState.phase === "rising"
        ? `🏗️ Builders swarm over it: it rises course by course and will stand complete in about ${hours} h.`
        : `🏚️ It is falling to ruin: stones slip from it as the scouts watch, and in about ${hours} h nothing will be left.`
    );
  }
  const base: ScoutDetails = { emblem: npc.emblem, rarity: npc.rarity, region: npc.region };
  switch (npc.category) {
    case "mob":
    case "bandit": {
      const gear = packGearFor(npc.id);
      const unit = gearedNpcUnitFor(npc.type, gear);
      const tier = npc.rarity ?? "common";
      const lootMult = PACK_GEAR[gear].loot;
      const scaled = <T extends Record<string, number>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * lootMult)])) as T;
      return {
        ...base,
        packGear: { id: gear, name: PACK_GEAR[gear].name, emblem: PACK_GEAR[gear].emblem, description: PACK_GEAR[gear].description },
        unitName: unit.name,
        unitStats: { hp: unit.hp, atk: unit.atk, def: unit.def },
        trait: unit.trait,
        skills: kitLines(unit.kit ?? { instincts: [], arts: [] }),
        packRemaining: packRemaining(npc, now),
        packSize: worldNpcPackSize(npc.type, npc.rarity),
        loot: npc.category === "bandit" ? scaled({ ...(BANDIT_STASH_BY_TIER[tier] ?? BANDIT_STASH_BY_TIER.common) }) : scaled({ ...(MOB_LOOT_BY_TIER[tier] ?? MOB_LOOT_BY_TIER.common) })
      };
    }
    case "treasure":
    case "resource": {
      const st = getNodeState(npc, now);
      const holder = activeGatherer(st.gatheredBy);
      const node: ScoutDetails = {
        ...base,
        nodeRemaining: st.remaining,
        nodeTotal: npc.category === "treasure" ? 1 : bulkOf(npc.resourceYield),
        gatheredBy: holder ? { civ: holder.attacker_civ as CivilizationType, name: holder.attacker_name } : null,
        lore
      };
      return npc.category === "treasure"
        ? { ...node, chest: treasureChestBand(npc.rarity), loot: lootOf(treasureContents(npc)) }
        : { ...node, resourceYield: npc.resourceYield };
    }
    case "boss": {
      const st = getBossState(npc, now);
      const unit = activeBossUnit(npc, now);
      return {
        ...base,
        lore,
        bossRotation: (npc.bossRotationPool ?? []).map((b) => `${b.emblem} ${b.name}`),
        bossHp: st.hp,
        bossMaxHp: st.maxHp,
        unitStats: { hp: st.maxHp, atk: unit.atk, def: unit.def },
        skills: kitLines(unit.kit)
      };
    }
    case "kingdom": {
      const k = getNpcKingdom(npc, now);
      const arts = npcKingdomArts(npc, k, march.attackerCiv);
      const plain = effectiveUnit(k.civ, march.attackerCiv, "defending");
      // The garrison as it fights: its soldiers' HP and ATK pay for its Battle Arts
      const unit = { hp: plain.hp * arts.kitTrim.hp, atk: plain.atk * arts.kitTrim.atk, def: plain.def };
      const round100 = (n: number) => Math.round(n / 100) * 100;
      return {
        ...base,
        lore,
        civilization: k.civ,
        cityHallLevel: k.level,
        garrison: k.garrison,
        maxGarrison: k.maxGarrison,
        population: k.population,
        maxPopulation: k.maxPopulation,
        unitName: CIV_DEMOGRAPHICS[k.civ].soldierUnit.name,
        unitStats: { hp: Math.round(unit.hp), atk: Math.round(unit.atk), def: Math.round(unit.def) },
        trait: CIV_DEMOGRAPHICS[k.civ].soldierUnit.trait,
        skills: kitLines(arts.kit),
        treasury: { gold: round100(k.treasury.gold), iron: round100(k.treasury.iron), stone: round100(k.treasury.stone), lumber: round100(k.treasury.lumber), food: round100(k.treasury.food) },
        wallTier: k.wallTier,
        wallHp: k.wallHp,
        wallMaxHp: k.wallMaxHp,
        burning: k.burning
      };
    }
    default:
      return { ...base, lore };
  }
}

/**
 * A false report (GAME_GUIDE §13): garrison, population and treasury each off by 30–60%, up or down (seeded by the
 * march). Everything else is true, so it looks like any other report. Kept within what the target could hold.
 */
function falsifyScoutDetails(d: ScoutDetails, seed: string): ScoutDetails {
  const rng = seededRandom(seed);
  const lie = (n: number) => Math.max(0, Math.round(n * (1 + (rng() < 0.5 ? -1 : 1) * (SCOUT_ODDS.LIE_MIN + rng() * (SCOUT_ODDS.LIE_MAX - SCOUT_ODDS.LIE_MIN)))));
  const round100 = (n: number) => Math.round(n / 100) * 100;
  const out: ScoutDetails = { ...d };
  if (out.population !== undefined) out.population = Math.min(out.maxPopulation ?? Infinity, lie(out.population));
  if (out.garrison !== undefined) out.garrison = Math.min(out.maxGarrison ?? Infinity, out.population ?? Infinity, lie(out.garrison));
  if (out.treasury) {
    const t = out.treasury;
    out.treasury = { gold: round100(lie(t.gold)), iron: round100(lie(t.iron)), stone: round100(lie(t.stone)), lumber: round100(lie(t.lumber)), food: round100(lie(t.food)) };
  }
  if (out.scarce) out.scarce = Object.fromEntries(Object.entries(out.scarce).map(([k, v]) => [k, lie(v)]));
  return out;
}

/** Scouts reached their target: file the report (false when deceived), delivered to their ruler when they get home */
function deliverScoutIntel(march: ActiveMarch, kingdoms: DeveloperKingdom[], now: number, outcome?: ScoutOutcome) {
  const seen = scoutDetailsFor(march, kingdoms, now);
  if (!seen) return;
  const deceived = outcome?.result === "deceived";
  const details = deceived ? { ...falsifyScoutDetails(seen, `${march.id}_lie`), ...(outcome.doubtful ? { doubtful: true } : {}) } : seen;
  if (deceived) announceScoutsDeceived(march, outcome, now);
  const travel = Math.max(1000, march.arrivalTime - march.departTime);
  writeScoutReport({
    deceived,
    ownerId: march.attackerId,
    targetType: march.targetType,
    targetKind: march.targetKind ?? (march.targetType === "spire" ? "spire" : "kingdom"),
    targetId: march.targetId,
    targetName: march.targetName,
    takenAt: now,
    availableAt: now + travel,
    details
  });
}

/** Viewer's civilization (null = not signed in / unknown: everything of a mortal or Voidrift NPC is fogged) */
export function viewerCivOf(viewerId: string | null): CivilizationType | null {
  if (!viewerId) return null;
  return (getUser(viewerId)?.civilization as CivilizationType | undefined) ?? null;
}

/**
 * Fog of war for a list of kingdoms as one viewer sees them: kingdoms of other civilizations lose their
 * population, soldiers, treasury and wall HP and get bands instead (+ the viewer's latest scout report).
 * Own civilization and Special Overseers stay exact. Never mutates the shared in-memory kingdoms.
 */
export function fogKingdomsFor<T extends DeveloperKingdom>(list: T[], viewerId: string | null, now = Date.now()): T[] {
  const viewerCiv = viewerCivOf(viewerId);
  const reports = latestScoutReportsByTarget(viewerId, now);
  return list.map((k) => {
    if (isSpecialUser(k) || (viewerCiv && k.civilization === viewerCiv)) return k;
    const wallRatio = k.wallMaxHp ? (k.wallHp ?? k.wallMaxHp) / k.wallMaxHp : 1;
    // Nothing about their people, soldiers or treasury unless scouted: then the report projected to now
    const fog: KingdomFog = {
      wall: k.burning ? "burning" : wallRatio < 0.9 ? "damaged" : "intact",
      report: reports.get(k.id) ?? null
    };
    return {
      ...k,
      population: undefined,
      soldiers: undefined,
      deployedSoldiers: undefined,
      voidWell: undefined,
      wounded: undefined,
      maxSoldiers: undefined,
      wallHp: undefined,
      civiliansAway: undefined,
      resources: { gold: 0, iron: 0, stone: 0, lumber: 0, food: 0, scarce: {} },
      fog
    };
  });
}

/** The most figures a march shows on the map (MAX_ATTACKER_FIGURES in WarParties.tsx) */
const MARCH_FOG_MAX_FIGURES = 12;
/** A headcount that shows no more than the march's figures on the map already do (figures = √soldiers, capped) */
const foggedMarchCount = (n: number) => (n > 0 ? Math.min(MARCH_FOG_MAX_FIGURES, Math.ceil(Math.sqrt(n))) ** 2 : 0);

/**
 * Fog of war for the marches on the road: their exact size stays with the viewer's civilization and the ruler they are
 * marching on (GAME_GUIDE §13). Everyone else still sees them walk, with the size their figures show.
 */
export function fogMarchesFor(marches: ActiveMarch[], viewerId: string | null, seesAll: boolean): ActiveMarch[] {
  if (seesAll) return marches;
  const viewerCiv = viewerCivOf(viewerId);
  return marches.map((m) => {
    if (m.attackerId === viewerId || m.targetId === viewerId || (viewerCiv && m.attackerCiv === viewerCiv)) return m;
    const count = foggedMarchCount(m.soldiersCount);
    return { ...m, soldiersCount: count, initialSoldiers: count, carry: null, fogged: true };
  });
}

/** Fog of the Voidrift NPC kingdoms: everyone but Nethergarde sees their garrison only through scouts */
export function fogSpiresFor(spires: NethergardeSpire[], viewerId: string | null, now = Date.now()): NethergardeSpire[] {
  const viewerCiv = viewerCivOf(viewerId);
  if (viewerCiv === "arcane") return spires;
  const reports = latestScoutReportsByTarget(viewerId, now);
  return spires.map((s) => {
    if (s.occupiedByDevId) return s;
    const ratio = s.wallMaxHp ? (s.wallHp ?? s.wallMaxHp) / s.wallMaxHp : 1;
    return {
      ...s,
      garrison: undefined,
      wallHp: undefined,
      fog: { wall: s.burning ? "burning" : ratio < 0.9 ? "damaged" : "intact", report: reports.get(s.id) ?? null }
    };
  });
}


/* ------------------------------------------------------------------------- */
/* Gathering & treasure claims                                               */
/* ------------------------------------------------------------------------- */

type GatherRow = { id: string; attacker_id: string; attacker_name: string; attacker_civ: string; soldiers_count: number; gather_json: string | null; civilian: number };

/** The march gathering a node right now (still at it), or null */
function activeGatherer(marchId: string | null): GatherRow | null {
  if (!marchId) return null;
  const row = db
    .prepare(`SELECT id, attacker_id, attacker_name, attacker_civ, soldiers_count, gather_json, civilian FROM active_marches WHERE id = ? AND kind = 'gather' AND status = 'marching' AND phase = 'acting'`)
    .get(marchId) as GatherRow | undefined;
  return row ?? null;
}

const loadPerSoldierFor = (civ: CivilizationType) => LOAD_PER_SOLDIER * (CIV_LOAD_MULT[civ] ?? 1);
/** Carry per soldier from world PvE: bandit stashes and resource nodes */
const pveLoadPerSoldierFor = (civ: CivilizationType) => loadPerSoldierFor(civ) * PVE_LOAD_MULT;

/** A chest's contents by tier (+ gems for epic and up, picked from the chest id so it never changes) */
function treasureContents(npc: Pick<MapNPC, "id" | "rarity">): Record<string, number> {
  const t = TREASURE_CONTENTS_BY_TIER[npc.rarity ?? "common"] ?? TREASURE_CONTENTS_BY_TIER.common;
  const out: Record<string, number> = { gold: t.gold, iron: t.iron, stone: t.stone, lumber: t.lumber, food: t.food };
  if (t.gems > 0) {
    const rng = seededRandom(npc.id);
    const key = DROPPED_GEMS[Math.floor(rng() * DROPPED_GEMS.length)].key;
    out[key] = t.gems;
  }
  return out;
}

/** Split a yield mix into BattleLoot (bulk keys + scarce) */
function lootOf(mix: Record<string, number>): BattleLoot {
  const loot: BattleLoot = {};
  for (const [k, v] of Object.entries(mix)) {
    if (v <= 0) continue;
    if ((BULK_RESOURCES as readonly string[]).includes(k)) (loot as any)[k] = v;
    else loot.scarce = { ...(loot.scarce ?? {}), [k]: v };
  }
  return loot;
}

function gatherPreviewFor(attacker: DeveloperKingdom, npcId: string, kingdoms: DeveloperKingdom[]): MarchPreview["gatherPreview"] {
  const npc = findMapNpc(kingdoms, npcId);
  if (!npc || (npc.category !== "resource" && npc.category !== "treasure")) return null;
  const treasure = npc.category === "treasure";
  const yieldMix = treasure ? treasureContents(npc) : { ...(npc.resourceYield ?? {}) };
  const st = getNodeState(npc);
  const nodeTotal = treasure ? 1 : bulkOf(yieldMix);
  return {
    exposed: !isSafeRegionFor(attacker.civilization, npc.region),
    // Market Square speeds the work up and lets every worker carry more
    rate: gatherRateFor(attacker.civilization, yieldMix) * improvementEffects(attacker.upgrades).gatherMult,
    // Untouched nodes are public knowledge (their full yield); after that it's fogged to a band
    remaining: st.remaining >= nodeTotal ? nodeTotal : null,
    remainingBand: fogBand(st.remaining),
    nodeTotal,
    loadPerSoldier: pveLoadPerSoldierFor(attacker.civilization) * improvementEffects(attacker.upgrades).gatherMult,
    yieldMix,
    treasure,
    claimMs: TREASURE_CLAIM_MS
  };
}

/** Bulk units gathered by now (paused while fighting off an attack); a chest counts only once claimed */
function gatheredSoFar(info: GatherInfo, now: number): number {
  const until = info.pausedAt ?? now;
  if (info.treasure) return until - info.startedAt >= TREASURE_CLAIM_MS ? 1 : 0;
  return Math.max(0, Math.min(info.amount, Math.floor((info.rate * Math.max(0, until - info.startedAt)) / 1000)));
}

/** A gather march reached its node: claim it if free (first come, first served) or turn back */
function startGathering(row: any, march: ActiveMarch, kingdoms: DeveloperKingdom[], now: number) {
  const npc = findMapNpc(kingdoms, march.targetId);
  if (!npc || (npc.category !== "resource" && npc.category !== "treasure")) {
    sendMarchReturning(march.id, now, null, null);
    return;
  }
  const st = getNodeState(npc, now);
  if (st.emptied || st.remaining <= 0 || isNpcDead(npc, now) || activeGatherer(st.gatheredBy)) {
    sendMarchReturning(march.id, now, null, null);
    return;
  }
  const treasure = npc.category === "treasure";
  const yieldMix = treasure ? treasureContents(npc) : { ...(npc.resourceYield ?? {}) };
  const market = effectsOf(march.attackerId).gatherMult;
  const load = Math.floor(march.soldiersCount * pveLoadPerSoldierFor(march.attackerCiv) * market);
  const rate = gatherRateFor(march.attackerCiv, yieldMix) * market;
  const amount = treasure ? 1 : Math.max(1, Math.min(load, st.remaining));
  const durationMs = treasure ? TREASURE_CLAIM_MS : Math.ceil((amount / rate) * 1000);
  const info: GatherInfo = {
    nodeId: npc.id,
    treasure,
    yieldMix,
    totalAtStart: st.remaining,
    nodeTotal: treasure ? 1 : bulkOf(yieldMix),
    amount,
    rate,
    startedAt: now,
    pausedAt: null,
    exposed: !isSafeRegionFor(march.attackerCiv, npc.region),
    region: npc.region,
    name: npc.name,
    rarity: npc.rarity
  };
  claimNode(npc, march.id, now);
  db.prepare(`UPDATE active_marches SET phase = 'acting', act_until = ?, gather_json = ? WHERE id = ?`).run(now + durationMs, JSON.stringify(info), march.id);
  // Race rule: other gatherers heading there turn back at once
  turnBackRacers(npc.id, new Set([march.id]), now, ["gather"]);
  void row;
}

/**
 * Gathering ends (done, recalled, or the gatherers were beaten): what `gathered` bulk units are worth, and the
 * node keeps the rest. Bulk resources split by the node's mix; gems ride along in proportion, and whoever
 * empties the node takes the gems left. An emptied node / claimed chest is gone for everyone.
 */
function finishGathering(row: { id: string; target_id?: string; attacker_id?: string }, info: GatherInfo, gathered: number, now: number): BattleLoot | null {
  const npcLike = { id: info.nodeId, category: info.treasure ? "treasure" : "resource", resourceYield: info.yieldMix } as MapNPC;
  const st = getNodeState(npcLike, now);
  let carry: Record<string, number> = {};
  let remainingAfter = st.remaining;
  let gemsLeft = { ...st.gemsLeft };

  if (info.treasure) {
    if (gathered > 0) {
      carry = { ...info.yieldMix };
      remainingAfter = 0;
      gemsLeft = {};
    }
  } else if (gathered > 0) {
    const share = gathered / Math.max(1, info.nodeTotal);
    for (const k of BULK_RESOURCES) {
      const v = Math.floor((info.yieldMix[k] ?? 0) * share);
      if (v > 0) carry[k] = v;
    }
    remainingAfter = Math.max(0, st.remaining - gathered);
    for (const [k, left] of Object.entries(gemsLeft)) {
      const take = remainingAfter <= 0 ? left : Math.min(left, Math.floor((info.yieldMix[k] ?? 0) * share));
      if (take > 0) {
        carry[k] = take;
        gemsLeft[k] = left - take;
      }
    }
  }

  // A legendary node emptied or a legendary chest claimed: a rare find for the weekly story
  if (gathered > 0 && remainingAfter <= 0 && (info.rarity === "legendary" || info.rarity === "mythical")) {
    recordRealmEvent("rare_find", row.attacker_id ?? null, info.nodeId, { name: info.name, rarity: info.rarity, treasure: info.treasure, haul: carry }, new Date(now));
  }
  const goneUntil = info.treasure ? now + 60 * 60 * 1000 : endOfUtcDay(now);
  releaseNode(info.nodeId, remainingAfter, gemsLeft, goneUntil, now);
  if (remainingAfter <= 0) {
    turnBackRacers(info.nodeId, new Set([row.id]), now, ["gather", "attack"]);
  } else {
    // Nobody left to attack there
    turnBackRacers(info.nodeId, new Set([row.id]), now, ["attack"]);
  }
  return Object.keys(carry).length ? lootOf(carry) : null;
}

/** War tick: gather marches whose work is done walk home with the haul */
function completeGatheringMarches(now: number) {
  const done = db
    .prepare(`SELECT * FROM active_marches WHERE kind = 'gather' AND status = 'marching' AND phase = 'acting' AND act_until IS NOT NULL AND act_until <= ?`)
    .all(now) as any[];
  for (const row of done) {
    if (!row.gather_json) {
      sendMarchReturning(row.id, now, null, null);
      continue;
    }
    const info = JSON.parse(row.gather_json) as GatherInfo;
    if (info.pausedAt) continue; // fighting off an attack: finishes once the battle is over
    db.transaction(() => {
      const carry = finishGathering(row, info, info.amount, now);
      sendMarchReturning(row.id, now, carry, null);
    })();
  }
}

/** An army reached a node to attack its gatherers: start (or join, handled before) a battle, or turn back */
function engageGatherers(march: ActiveMarch, kingdoms: DeveloperKingdom[], now: number) {
  const npc = findMapNpc(kingdoms, march.targetId);
  const holder = npc ? activeGatherer(getNodeState(npc, now).gatheredBy) : null;
  const info = holder?.gather_json ? (JSON.parse(holder.gather_json) as GatherInfo) : null;
  if (!npc || !holder || !info || holder.attacker_civ === march.attackerCiv || !info.exposed || holder.soldiers_count <= 0) {
    sendMarchReturning(march.id, now, null, null);
    return;
  }
  // Gathering pauses while the fight lasts
  info.pausedAt = now;
  db.prepare(`UPDATE active_marches SET gather_json = ? WHERE id = ?`).run(JSON.stringify(info), holder.id);
  touchWorldState();

  const defCiv = holder.attacker_civ as CivilizationType;
  const defenderState: LiveDefenderState = {
    civ: defCiv,
    count: holder.soldiers_count,
    initialCount: holder.soldiers_count,
    fortified: false,
    roundsFought: 0,
    carryDamageTaken: 0,
    totalLosses: 0,
    gather: { marchId: holder.id, ownerId: holder.attacker_id, ownerName: holder.attacker_name }
  };
  const stacks: LiveAttackerStack[] = [openingStack(march)];
  const battleId = `battle_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const targetName = `${holder.attacker_name}'s gatherers at ${npc.name}`;
  const log = [
    `🚩 ${marchersOf(march)} ${verbOf(march, "fall", "falls")} upon ${holder.soldiers_count}× ${CIV_DEMOGRAPHICS[defCiv].soldierUnit.name} gathering at ${npc.emblem} ${npc.name} (${npc.region}, outside their safe territory).`
  ];
  db.prepare(`
    INSERT INTO battles (id, target_type, target_id, target_name, defender_civ, started_at, round, next_round_at, defender_json, stacks_json, rounds_json, log_json, status)
    VALUES (?, 'npc', ?, ?, ?, ?, 0, ?, ?, ?, '[]', ?, 'fighting')
  `).run(battleId, npc.id, targetName, defCiv, now, now, JSON.stringify(defenderState), JSON.stringify(stacks), JSON.stringify(log));
  db.prepare(`UPDATE active_marches SET phase = 'acting', battle_id = ?, joined_round = 1, act_until = ? WHERE id = ?`).run(
    battleId,
    now + marchMaxRounds(march) * BATTLE_ROUND_MS,
    march.id
  );
}

/** Gatherers fell this round: they die out of their ruler's population (Nethergarde: into the Void Well) */
function applyGathererLosses(defender: LiveDefenderState, lost: number, targetName: string, round: number) {
  const g = defender.gather!;
  db.prepare(`UPDATE active_marches SET soldiers_count = ? WHERE id = ?`).run(defender.count, g.marchId);
  if (defender.civ === "arcane") {
    db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?), void_well = COALESCE(void_well, 0) + ? WHERE id = ?`).run(lost, lost, g.ownerId);
  } else {
    db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?) WHERE id = ?`).run(lost, g.ownerId);
  }
  const u = getUser(g.ownerId);
  recordPopulationLedger({
    userId: g.ownerId,
    type: "battle",
    deaths: lost,
    soldiersDelta: -lost,
    populationDelta: -lost,
    populationBalance: u?.population ?? 0,
    soldiersBalance: (u?.soldiers ?? 0) + soldiersAwayOf(g.ownerId),
    reason: `${targetName} (Round ${round}): ${lost} gatherers fell`
  });
}

/** Gatherers whose raid is over (held, or every raider left) go back to work: the pause doesn't count as work time */
function resumeGatherers(marchId: string, now: number) {
  const row = db.prepare(`SELECT phase, gather_json FROM active_marches WHERE id = ? AND status = 'marching'`).get(marchId) as { phase: string; gather_json: string | null } | undefined;
  if (!row?.gather_json || row.phase !== "acting") return;
  const info = JSON.parse(row.gather_json) as GatherInfo;
  if (!info.pausedAt) return;
  const paused = now - info.pausedAt;
  info.startedAt += paused;
  info.pausedAt = null;
  db.prepare(`UPDATE active_marches SET gather_json = ?, act_until = COALESCE(act_until, ?) + ? WHERE id = ?`).run(JSON.stringify(info), now, paused, marchId);
  touchWorldState();
}

/**
 * The fight over a node is over. Attackers won: they carry off what the gatherers had gathered so far (by load,
 * earliest army first; a claimed chest goes whole to the first), the node keeps the rest and is free again.
 * Gatherers held: they resume where they stopped. Counts toward War Frenzy.
 */
function finishGathererBattle(
  bRow: any,
  defender: LiveDefenderState,
  stacks: LiveAttackerStack[],
  attackerWon: boolean,
  report: BattleReport,
  log: string[],
  now: number
): BattleReport {
  const g = defender.gather!;
  report.defenderId = g.ownerId;
  report.defenderName = g.ownerName;
  report.defenderCiv = defender.civ;
  report.wallHpBefore = undefined;
  report.wallHpAfter = undefined;
  report.wallMaxHp = undefined;
  report.defenderBurning = false;
  for (const s of stacks) recordWarFrenzy(s.civ, defender.civ, now);

  const row = db.prepare(`SELECT * FROM active_marches WHERE id = ?`).get(g.marchId) as any;
  const info = row?.gather_json ? (JSON.parse(row.gather_json) as GatherInfo) : null;

  if (!attackerWon || !row || !info) {
    resumeGatherers(g.marchId, now);
    log.push(`🛡️ ${g.ownerName}'s gatherers hold the node and go back to work.`);
    for (const s of stacks) sendMarchReturning(s.marchId, now, null, report);
    return saveReport(report);
  }

  // The gatherers are wiped out: their haul so far changes hands
  const gathered = gatheredSoFar(info, now);
  const haul = finishGathering(row, info, gathered, now);
  sendMarchReturning(g.marchId, now, null, report);

  const pool: Record<string, number> = {};
  for (const k of BULK_RESOURCES) if (haul?.[k]) pool[k] = haul[k]!;
  const combined: BattleLoot = {};
  stacks.forEach((s, i) => {
    let carry: BattleLoot | null = null;
    if (s.count > 0 && !s.left) {
      carry = {};
      if (info.treasure) {
        // A chest is taken whole by the first surviving army
        if (i === stacks.findIndex((x) => x.count > 0 && !x.left) && haul) carry = { ...haul };
      } else {
        let load = Math.floor(s.count * loadPerSoldierFor(s.civ));
        for (const k of BULK_RESOURCES) {
          const amt = Math.min(load, pool[k] ?? 0);
          if (amt > 0) {
            carry[k] = amt;
            pool[k] -= amt;
            load -= amt;
          }
        }
        // Gems are light: the first surviving army takes them
        if (haul?.scarce && i === stacks.findIndex((x) => x.count > 0 && !x.left)) carry.scarce = { ...haul.scarce };
      }
      if (!Object.keys(carry).length) carry = null;
      if (carry) {
        for (const k of BULK_RESOURCES) if (carry[k]) combined[k] = (combined[k] ?? 0) + carry[k]!;
        if (carry.scarce) combined.scarce = { ...(combined.scarce ?? {}), ...carry.scarce };
      }
    }
    sendMarchReturning(s.marchId, now, carry, report);
  });
  report.loot = Object.keys(combined).length ? combined : null;
  const summary = BULK_RESOURCES.filter((k) => combined[k]).map((k) => `${combined[k]!.toLocaleString()} ${k}`).join(", ");
  log.push(`🏆 ${g.ownerName}'s gatherers are wiped out!${summary ? ` Their haul changes hands: ${summary}.` : " They had gathered nothing yet."}`);
  return saveReport(report);
}


/* ------------------------------------------------------------------------- */
/* Reinforcements & rallies                                                  */
/* ------------------------------------------------------------------------- */

/** Travel time over `distance` map units at a civ's march speed (same clamp as planMarch), sped up by the ruler's roads */
function travelMsFor(distance: number, civ: CivilizationType, roadSpeedMult = 1): number {
  const speed = CIV_DEMOGRAPHICS[civ].marchSpeedMultiplier * seasonEffects(civ).march;
  return Math.round(Math.min(MARCH.MAX_DURATION_MS, Math.max(MARCH.MIN_DURATION_MS, (distance * MARCH.MS_PER_MAP_UNIT) / speed)) / roadSpeedMult);
}

/** Food per soldier for one way over `distance` (Lantern Streets cut it via `rationMult`) */
function oneWayRations(distance: number, civ: CivilizationType, rationMult = 1): number {
  return Math.max(1, Math.round(distance / MARCH.UNITS_PER_RATION_TICK)) * MARCH.FOOD_PER_SOLDIER_PER_TICK * MARCH_RATION_MULT[civ] * rationMult;
}

/** A ruler's improvement bonuses by id (Special Overseers count as fully upgraded) */
const effectsOf = (userId: string) => improvementEffects(getEffectiveUpgrades(userId));

/** Troops of other rulers stationed in this castle, as defender groups (famished if their own granary is empty) */
function stationedGroupsAt(hostId: string): DefenderGroup[] {
  const rows = db
    .prepare(`SELECT id, attacker_id, attacker_name, attacker_civ, soldiers_count FROM active_marches WHERE kind = 'reinforce' AND status = 'marching' AND phase = 'stationed' AND target_id = ? AND soldiers_count > 0`)
    .all(hostId) as Array<{ id: string; attacker_id: string; attacker_name: string; attacker_civ: CivilizationType; soldiers_count: number }>;
  return rows.map((r) => ({
    marchId: r.id,
    ownerId: r.attacker_id,
    ownerName: r.attacker_name,
    civ: r.attacker_civ,
    count: r.soldiers_count,
    initialCount: r.soldiers_count,
    famished: ((db.prepare(`SELECT food FROM kingdom_resources WHERE user_id = ?`).get(r.attacker_id) as { food: number } | undefined)?.food ?? 0) <= 0,
    roundsFought: 0,
    carryDamageTaken: 0,
    totalLosses: 0
  }));
}

/**
 * Room for allied troops in a castle: its max population minus every soldier of the host (home and away) and the
 * troops already stationed there — plus, when `inbound`, those still marching there (reserved at send time).
 * So the host's soldiers and its reinforcements together never exceed its max population. Negative = over full.
 */
export function reinforceRoomAt(hostId: string, opts: { inbound: boolean; excludeMarchId?: string }): number {
  // A frontier gate holds its base garrison plus reinforcements up to its cap (GATE.REINFORCE_CAP)
  if (NPC_GATE_CIV[hostId]) {
    const k = getNpcKingdom({ id: hostId } as MapNPC);
    const onDuty = db
      .prepare(`
        SELECT COALESCE(SUM(soldiers_count), 0) AS total FROM active_marches
        WHERE kind = 'reinforce' AND status = 'marching' AND target_id = ? AND id != ?
          AND (phase = 'stationed' OR (? AND COALESCE(phase, 'outbound') = 'outbound'))
      `)
      .get(hostId, opts.excludeMarchId ?? "", opts.inbound ? 1 : 0) as { total: number };
    return (k.gate?.cap ?? 0) - k.garrison - Number(onDuty.total || 0);
  }
  const host = db.prepare(`SELECT soldiers, max_population, city_hall_level, civilization FROM users WHERE id = ?`).get(hostId) as
    | { soldiers: number | null; max_population: number | null; city_hall_level: number | null; civilization: CivilizationType }
    | undefined;
  if (!host) return 0;
  const maxPop = host.max_population ?? calculateMaxPopulation(host.city_hall_level ?? 1, host.civilization);
  const allies = db
    .prepare(`
      SELECT COALESCE(SUM(soldiers_count), 0) AS total FROM active_marches
      WHERE kind = 'reinforce' AND status = 'marching' AND target_id = ? AND id != ?
        AND (phase = 'stationed' OR (? AND COALESCE(phase, 'outbound') = 'outbound'))
    `)
    .get(hostId, opts.excludeMarchId ?? "", opts.inbound ? 1 : 0) as { total: number };
  return maxPop - (host.soldiers ?? 0) - getDeployedSoldiers(hostId) - Number(allies.total || 0);
}

/**
 * Keeps `keep` soldiers of a reinforcement where they are and walks the rest home as their own column
 * (which holds a march slot until it is home). `keep` <= 0 sends the whole march home.
 */
function sendReinforcementOverflowHome(marchId: string, keep: number, now: number) {
  const row = db.prepare(`SELECT * FROM active_marches WHERE id = ?`).get(marchId) as Record<string, any> | undefined;
  if (!row) return;
  const overflow = row.soldiers_count - Math.max(0, keep);
  if (overflow <= 0) return;
  if (keep <= 0) {
    sendMarchReturning(marchId, now, null, null);
    return;
  }
  const cols = Object.keys(row);
  const id = `${marchId}_home${now.toString(36)}`;
  db.prepare(`INSERT INTO active_marches (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})`).run({ ...row, id, soldiers_count: overflow, initial_soldiers: overflow });
  db.prepare(`UPDATE active_marches SET soldiers_count = ?, initial_soldiers = ? WHERE id = ?`).run(keep, keep, marchId);
  sendMarchReturning(id, now, null, null);
}

/** A reinforcement reached the ally: station it, or turn back if the castle changed side or burns */
function stationReinforcement(march: ActiveMarch, now: number) {
  if (march.targetType === "npc") {
    stationAtGate(march, now);
    return;
  }
  const host = getUser(march.targetId);
  if (!host || host.civilization !== march.attackerCiv || isSpecialUser(host)) {
    sendMarchReturning(march.id, now, null, null);
    return;
  }
  const wall = computeWallState(host.wall_hp, host.wall_updated_at, wallMaxHpFor(host.city_hall_level ?? 1, getUserWallTier(host.id)), now);
  if (wall.burning) {
    sendMarchReturning(march.id, now, null, null);
    return;
  }
  // Only what fits stays: the host may have armed more soldiers since this march set out
  const room = reinforceRoomAt(host.id, { inbound: false, excludeMarchId: march.id });
  if (room <= 0) {
    sendMarchReturning(march.id, now, null, null);
    return;
  }
  const count = Math.min(march.soldiersCount, room);
  if (count < march.soldiersCount) sendReinforcementOverflowHome(march.id, count, now);
  db.prepare(`UPDATE active_marches SET phase = 'stationed', act_until = NULL WHERE id = ?`).run(march.id);
  // A defence already going on: they climb onto the walls for the next round
  joinDefenceInProgress(march, count, "dev_kingdom");
}

/** A reinforcement reached its civilization's frontier gate: station what fits, or turn back if it burns or isn't theirs */
function stationAtGate(march: ActiveMarch, now: number) {
  const ruler = getUser(march.attackerId);
  if (!ruler || NPC_GATE_CIV[march.targetId] !== ruler.civilization) {
    sendMarchReturning(march.id, now, null, null);
    return;
  }
  const k = getNpcKingdom({ id: march.targetId } as MapNPC, now);
  const room = reinforceRoomAt(march.targetId, { inbound: false, excludeMarchId: march.id });
  if (k.burning || room <= 0) {
    sendMarchReturning(march.id, now, null, null);
    return;
  }
  const count = Math.min(march.soldiersCount, room);
  if (count < march.soldiersCount) sendReinforcementOverflowHome(march.id, count, now);
  db.prepare(`UPDATE active_marches SET phase = 'stationed', act_until = NULL WHERE id = ?`).run(march.id);
  joinDefenceInProgress(march, count, "npc");
}

/** Reinforcements arriving while their host is under attack climb onto the walls for the next round */
function joinDefenceInProgress(march: ActiveMarch, count: number, targetType: "dev_kingdom" | "npc") {
  const battle = db.prepare(`SELECT id, defender_json, log_json FROM battles WHERE target_type = ? AND target_id = ? AND status = 'fighting'`).get(targetType, march.targetId) as
    | { id: string; defender_json: string; log_json: string }
    | undefined;
  if (!battle) return;
  const defender: LiveDefenderState = JSON.parse(battle.defender_json);
  const log: string[] = JSON.parse(battle.log_json || "[]");
  const famished = ((db.prepare(`SELECT food FROM kingdom_resources WHERE user_id = ?`).get(march.attackerId) as { food: number } | undefined)?.food ?? 0) <= 0;
  defender.reinforcements = [
    ...(defender.reinforcements ?? []),
    { marchId: march.id, ownerId: march.attackerId, ownerName: march.attackerName, civ: march.attackerCiv, count, initialCount: count, famished, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0 }
  ];
  log.push(`🛡️ ${march.attackerName}'s ${count}× ${CIV_DEMOGRAPHICS[march.attackerCiv].soldierUnit.name} arrive and join the defence.`);
  db.prepare(`UPDATE battles SET defender_json = ?, log_json = ? WHERE id = ?`).run(JSON.stringify(defender), JSON.stringify(log), battle.id);
}

/** True while the castle (or gate) these reinforcements guard is fighting off an attack */
function reinforcementInBattle(row: { target_id: string }): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM battles WHERE target_type IN ('dev_kingdom', 'npc') AND target_id = ? AND status = 'fighting'`).get(row.target_id));
}

/** Reinforcements fell this round: they die out of their own ruler's population */
function applyReinforcementLosses(g: DefenderGroup, lost: number, targetName: string, round: number, battleId = "") {
  db.prepare(`UPDATE active_marches SET soldiers_count = ? WHERE id = ?`).run(g.count, g.marchId);
  // 🌙 Elves: a share of the fallen are carried home wounded
  if (hasMoonwell(g.civ)) {
    const r = settleWounds({ userId: g.ownerId, civ: g.civ, rowId: `${battleId}:${g.marchId}`, place: targetName, tally: g, now: Date.now() });
    if (r.died !== 0 || r.wounded !== 0) {
      const u = getUser(g.ownerId);
      recordPopulationLedger({
        userId: g.ownerId,
        type: "battle",
        deaths: Math.max(0, r.died),
        soldiersDelta: -(r.died + r.wounded),
        populationDelta: -r.died,
        populationBalance: u?.population ?? 0,
        soldiersBalance: (u?.soldiers ?? 0) + soldiersAwayOf(g.ownerId),
        reason: `Reinforcing ${targetName} (Round ${round}): ${woundsText(r)}`
      });
    }
    if (g.count <= 0) sendMarchReturning(g.marchId, Date.now(), null, null);
    return;
  }
  if (g.civ === "arcane") {
    db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?), void_well = COALESCE(void_well, 0) + ? WHERE id = ?`).run(lost, lost, g.ownerId);
  } else {
    db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?) WHERE id = ?`).run(lost, g.ownerId);
  }
  const u = getUser(g.ownerId);
  recordPopulationLedger({
    userId: g.ownerId,
    type: "battle",
    deaths: lost,
    soldiersDelta: -lost,
    populationDelta: -lost,
    populationBalance: u?.population ?? 0,
    soldiersBalance: (u?.soldiers ?? 0) + soldiersAwayOf(g.ownerId),
    reason: `Reinforcing ${targetName} (Round ${round}): ${lost} soldiers fell`
  });
  if (g.count <= 0) sendMarchReturning(g.marchId, Date.now(), null, null);
}

/** Every tick: reinforcements whose host (or whose own kingdom) changed civilization go home */
function sendForeignReinforcementsHome(now: number) {
  const rows = db
    .prepare(`
      SELECT m.id FROM active_marches m JOIN users h ON h.id = m.target_id
      WHERE m.kind = 'reinforce' AND m.status = 'marching' AND m.phase = 'stationed' AND h.civilization != m.attacker_civ
    `)
    .all() as Array<{ id: string }>;
  for (const r of rows) sendMarchReturning(r.id, now, null, null);
  // At a frontier gate: troops whose ruler changed civilization leave it
  const atGates = db
    .prepare(`
      SELECT m.id, m.target_id, u.civilization FROM active_marches m JOIN users u ON u.id = m.attacker_id
      WHERE m.kind = 'reinforce' AND m.status = 'marching' AND m.phase = 'stationed' AND m.target_type = 'npc'
    `)
    .all() as Array<{ id: string; target_id: string; civilization: CivilizationType }>;
  for (const r of atGates) if (NPC_GATE_CIV[r.target_id] !== r.civilization) sendMarchReturning(r.id, now, null, null);
}

/**
 * Every tick: a castle holding more allied troops than it has room for (the host armed more soldiers, or its max
 * population fell) sends the newest reinforcements home first. Never during a battle: they leave once it is over.
 */
function sendOverflowReinforcementsHome(now: number) {
  const hosts = db
    .prepare(`SELECT DISTINCT target_id FROM active_marches WHERE kind = 'reinforce' AND status = 'marching' AND phase = 'stationed'`)
    .all() as Array<{ target_id: string }>;
  for (const { target_id } of hosts) {
    let over = -reinforceRoomAt(target_id, { inbound: false });
    if (over <= 0 || reinforcementInBattle({ target_id })) continue;
    const rows = db
      .prepare(`SELECT id, soldiers_count FROM active_marches WHERE kind = 'reinforce' AND status = 'marching' AND phase = 'stationed' AND target_id = ? ORDER BY arrival_time DESC`)
      .all(target_id) as Array<{ id: string; soldiers_count: number }>;
    for (const r of rows) {
      if (over <= 0) break;
      const cut = Math.min(over, r.soldiers_count);
      sendReinforcementOverflowHome(r.id, r.soldiers_count - cut, now);
      over -= cut;
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Frontier gates: the province seal, gate duty and Watched Borders          */
/* ------------------------------------------------------------------------- */

/** Watched Borders: extra chance (0–1) that scouts to this target are caught, only for cities in a province sealed by its gate */
function gateScoutCatchFor(targetType: MarchTargetType, targetId: string, kingdoms: DeveloperKingdom[]): number {
  if (targetType !== "dev_kingdom") return 0;
  const defender = kingdoms.find((k) => k.id === targetId);
  const gate = defender ? sealingGate(defender, kingdoms) : null;
  return gate ? gateCatchChanceFor(gate.state) : 0;
}

/**
 * Spies & Counterspies (GAME_GUIDE §13): only rulers' cities and NPC kingdoms (Voidrift citadels, buffer realms, frontier
 * gates) can catch or deceive scouts; null for everything else. The target ruler's Spymaster's Tower raises the danger;
 * the scouting ruler's party size, Lantern Streets, Spymaster's Tower and elven stealth lower it.
 */
function scoutOddsAgainst(
  attackerId: string,
  attackerCiv: CivilizationType,
  scouts: number,
  targetType: MarchTargetType,
  targetId: string,
  kingdoms: DeveloperKingdom[]
): { odds: ScoutOdds; gateCatch: number; defenderSpymaster: number; attackerSpymaster: number } | null {
  if (targetType === "npc" && findMapNpc(kingdoms, targetId)?.category !== "kingdom") return null;
  if (targetType !== "npc" && targetType !== "dev_kingdom" && targetType !== "spire") return null;
  const own = getEffectiveUpgrades(attackerId);
  const defenderSpymaster = targetType === "dev_kingdom" ? (getEffectiveUpgrades(targetId).spymaster ?? 0) : 0;
  const gateCatch = gateScoutCatchFor(targetType, targetId, kingdoms);
  const odds = scoutOdds({
    scouts,
    attackerCiv,
    attackerLanterns: own.lanterns ?? 0,
    attackerSpymaster: own.spymaster ?? 0,
    defenderSpymaster,
    gateCatch
  });
  return { odds, gateCatch, defenderSpymaster, attackerSpymaster: own.spymaster ?? 0 };
}

/** The scout form: odds for every party size the ruler may send (index = scouts − 1) */
function scoutOddsPreview(attacker: DeveloperKingdom, targetType: MarchTargetType, targetId: string, kingdoms: DeveloperKingdom[], maxScouts: number) {
  const one = scoutOddsAgainst(attacker.id, attacker.civilization, 1, targetType, targetId, kingdoms);
  if (!one) return null;
  const bySize = [one.odds];
  for (let n = 2; n <= maxScouts; n++) bySize.push(scoutOddsAgainst(attacker.id, attacker.civilization, n, targetType, targetId, kingdoms)!.odds);
  return { bySize, gateCatch: one.gateCatch };
}

interface ScoutOutcome {
  result: "success" | "caught" | "deceived";
  /** Caught: by the frontier gate's watch (not the city's own) */
  byGate?: boolean;
  /** Deceived: the report carries ⚠️ doubtful */
  doubtful?: boolean;
  odds?: ScoutOdds;
  defenderSpymaster?: number;
}

/** One roll per march (seeded by it, so the outcome is fixed): caught, deceived or a true report */
function rollScoutOutcome(march: ActiveMarch, kingdoms: DeveloperKingdom[]): ScoutOutcome {
  const risk = scoutOddsAgainst(march.attackerId, march.attackerCiv, march.soldiersCount, march.targetType, march.targetId, kingdoms);
  if (!risk) return { result: "success" };
  const rng = seededRandom(`${march.id}_scout`);
  const roll = rng();
  const { odds, gateCatch, defenderSpymaster, attackerSpymaster } = risk;
  if (roll < odds.caught) {
    // The gate's share of the catch chance: its watch caught them, not the city's own
    const rawCaught = SCOUT_ODDS.CAUGHT_BASE + defenderSpymaster * SCOUT_ODDS.SPY_CATCH_PER_TIER + gateCatch;
    return { result: "caught", byGate: gateCatch > 0 && roll < (odds.caught * gateCatch) / rawCaught, odds, defenderSpymaster };
  }
  if (roll < odds.caught + odds.deceived) {
    const doubtful = attackerSpymaster >= defenderSpymaster && rng() < SCOUT_ODDS.DOUBT_CHANCE;
    return { result: "deceived", doubtful, odds, defenderSpymaster };
  }
  return { result: "success", odds };
}

/** Who caught the scouts, for the notices ("the watch of …", "the spymasters of …") */
function scoutWatchName(march: ActiveMarch, kingdoms: DeveloperKingdom[], outcome: ScoutOutcome): string {
  if (outcome.byGate) {
    const defender = kingdoms.find((k) => k.id === march.targetId);
    return `the watch of ${(defender && sealingGate(defender, kingdoms)?.name) || "the frontier gate"}`;
  }
  if (march.targetType === "spire") return `the void wardens of ${march.targetName}`;
  if (march.targetType === "npc") return `the watch of ${march.targetName}`;
  return (outcome.defenderSpymaster ?? 0) > 0 ? `the spymasters of ${march.targetName}` : `the city watch of ${march.targetName}`;
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Scouts caught at their target: they die, no report comes back (a red row in the War Room), and both rulers hear
 * of it (only the scouting ruler for NPC kingdoms).
 */
function scoutsCaught(march: ActiveMarch, kingdoms: DeveloperKingdom[], outcome: ScoutOutcome, now: number) {
  const lost = march.soldiersCount;
  db.prepare(`UPDATE active_marches SET soldiers_count = 0 WHERE id = ?`).run(march.id);
  if (march.attackerCiv === "arcane") {
    db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?), void_well = COALESCE(void_well, 0) + ? WHERE id = ?`).run(lost, lost, march.attackerId);
  } else {
    db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?) WHERE id = ?`).run(lost, march.attackerId);
  }
  const u = getUser(march.attackerId);
  recordPopulationLedger({
    userId: march.attackerId,
    type: "battle",
    deaths: lost,
    // Scouts are civilians: the garrison is untouched
    soldiersDelta: march.civilian ? 0 : -lost,
    populationDelta: -lost,
    populationBalance: u?.population ?? 0,
    soldiersBalance: (u?.soldiers ?? 0) + soldiersAwayOf(march.attackerId),
    reason: `Scouts caught at ${march.targetName}: ${lost} never returned`
  });
  sendMarchReturning(march.id, now, null, null);
  const by = scoutWatchName(march, kingdoms, outcome);
  writeCaughtScoutRow({
    ownerId: march.attackerId,
    targetType: march.targetType,
    targetKind: march.targetKind ?? (march.targetType === "spire" ? "spire" : "kingdom"),
    targetId: march.targetId,
    targetName: march.targetName,
    at: now,
    scouts: lost,
    by
  });
  const at = new Date(now);
  const chance = outcome.odds?.caught ?? 0;
  const eventId = recordRealmEvent("scouts_caught", march.attackerId, march.targetId, { scouts: lost, by, byGate: Boolean(outcome.byGate), chance }, at);
  const scouts = `${lost} ${lost === 1 ? "scout" : "scouts"}`;
  createBroadcast({
    kind: "scouts_caught",
    title: "Your scouts never returned",
    emblem: "💀",
    body: `${capitalize(by)} caught your ${scouts} at ${march.targetName}. No report comes back.\n\n${
      outcome.byGate
        ? "While a frontier gate stands, its border is watched; while it burns, the border is unwatched."
        : "More scouts in a party, Lantern Streets and a Spymaster's Tower make your scouts harder to catch."
    } They had a ${Math.round(chance * 100)}% chance of being caught.`,
    audience: "users",
    recipients: [march.attackerId],
    eventId,
    now: at
  });
  if (march.targetType !== "dev_kingdom") return;
  createBroadcast({
    kind: "scouts_caught",
    title: `Caught ${scouts} from ${march.attackerName}`,
    emblem: "🦉",
    body: `${capitalize(by)} caught ${lost} ${lost === 1 ? "scout" : "scouts"} of ${march.attackerName} riding toward your city, dressed as your own folk. They learned nothing.`,
    audience: "users",
    recipients: [march.targetId],
    eventId,
    now: at
  });
}

/** Scouts fed false intel: a realm event, and the target ruler hears of it when their own Spymaster's Tower did it */
function announceScoutsDeceived(march: ActiveMarch, outcome: ScoutOutcome, now: number) {
  const at = new Date(now);
  const eventId = recordRealmEvent("scouts_deceived", march.attackerId, march.targetId, { scouts: march.soldiersCount, doubtful: Boolean(outcome.doubtful) }, at);
  if (march.targetType !== "dev_kingdom" || !(outcome.defenderSpymaster ?? 0)) return;
  const n = march.soldiersCount;
  createBroadcast({
    kind: "scouts_deceived",
    title: `False intel for ${march.attackerName}`,
    emblem: "🦉",
    body: `Your Spymaster's Tower spotted ${n} ${n === 1 ? "scout" : "scouts"} of ${march.attackerName} and let them count what it wanted them to see. They carry home a report full of lies about your garrison, people and treasury.`,
    audience: "users",
    recipients: [march.targetId],
    eventId,
    now: at
  });
}

/** A stack's ruler by name: a band marches under its hirer ("Ser Aldric's Ironbreakers" is Ser Aldric's) */
function rulerNameOf(s: LiveAttackerStack, stacks: LiveAttackerStack[]): string {
  const own = stacks.find((o) => o.attackerId === s.attackerId && !o.band);
  if (own) return own.attackerName;
  const cut = s.band ? s.attackerName.lastIndexOf("'s ") : -1;
  return cut > 0 ? s.attackerName.slice(0, cut) : s.attackerName;
}

/** 🔥 A frontier gate catches fire: the whole realm hears that its province lies open while it burns */
function announceGateFallen(gateId: string, gateName: string, stacks: LiveAttackerStack[], now: number) {
  const civ = NPC_GATE_CIV[gateId];
  const province = PROVINCE_CONFIG[civ]?.name ?? "its province";
  const names = [...new Set(stacks.map((s) => rulerNameOf(s, stacks)))];
  const by = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "Raiders";
  // The burn lasts until the walls climb back to 26%: up to WALL_BURN_REPAIR_MS from 0%, less the higher they stood
  const endsAt = getNpcKingdom({ id: gateId } as MapNPC, now).burningEndsAt;
  const hours = endsAt ? (endsAt - now) / 3_600_000 : WALL_BURN_REPAIR_MS / 3_600_000;
  const burnFor = hours < 1 ? `about ${Math.max(1, Math.round(hours * 60))} minutes` : `about ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const at = new Date(now);
  const eventId = recordRealmEvent("gate_fallen", stacks[0]?.attackerId ?? null, gateId, { gateName, civ, attackers: names }, at);
  createBroadcast({
    kind: "gate_fallen",
    title: `${gateName} burns`,
    emblem: "🔥",
    body: `${by} set ${gateName} alight, and its province (${province}) is open: other civilizations can attack its cities until the gate's walls repair to 26% (${burnFor}).\n\nWhile it burns the gate takes no reinforcements and scouts pass it freely.`,
    audience: "all",
    eventId,
    now: at
  });
}

/**
 * Every harvest (after the resource allocation): troops on gate duty cost their ruler GATE.DUTY_UPKEEP per soldier
 * (rations plus timber, stone and iron for the gate and its wall), on top of the normal food upkeep. A ruler who
 * can't pay for them all keeps as many as they can pay for; the newest of the rest leave the gate and walk home
 * (never mid-battle: then they stay and the bill waits).
 */
export function chargeGateDuty(now = Date.now()) {
  const gateIds = Object.keys(NPC_GATE_CIV);
  const rows = db
    .prepare(`
      SELECT id, attacker_id, target_id, target_name, soldiers_count FROM active_marches
      WHERE kind = 'reinforce' AND status = 'marching' AND phase = 'stationed' AND target_type = 'npc' AND soldiers_count > 0
      ORDER BY arrival_time ASC
    `)
    .all() as Array<{ id: string; attacker_id: string; target_id: string; target_name: string; soldiers_count: number }>;
  const byRuler = new Map<string, typeof rows>();
  for (const r of rows) if (gateIds.includes(r.target_id)) byRuler.set(r.attacker_id, [...(byRuler.get(r.attacker_id) ?? []), r]);
  const per = GATE.DUTY_UPKEEP;
  const keys = Object.keys(per) as Array<keyof typeof per>;
  for (const [userId, marches] of byRuler) {
    const res = getKingdomResources(userId);
    const total = marches.reduce((a, m) => a + m.soldiers_count, 0);
    const affordable = Math.min(...keys.map((k) => Math.floor((res[k] ?? 0) / per[k])));
    let keep = total;
    if (affordable < total) {
      // Oldest posts are kept first; the newest leave
      let left = Math.max(0, affordable);
      const sentHome: string[] = [];
      for (const m of marches) {
        if (reinforcementInBattle(m)) {
          left -= m.soldiers_count;
          continue;
        }
        const stay = Math.max(0, Math.min(m.soldiers_count, left));
        left -= stay;
        if (stay < m.soldiers_count) {
          sendReinforcementOverflowHome(m.id, stay, now);
          sentHome.push(`${m.soldiers_count - stay} from ${m.target_name}`);
        }
      }
      keep = Math.min(total, Math.max(0, affordable));
      if (sentHome.length) {
        createBroadcast({
          kind: "gate_duty",
          title: "Troops leave the frontier gate",
          emblem: "🚧",
          body: `Your treasury couldn't pay gate duty (${keys.map((k) => `${per[k]} ${k}`).join(", ")} per soldier each harvest), so ${sentHome.join(", ")} are walking home.`,
          audience: "users",
          recipients: [userId],
          now: new Date(now)
        });
      }
    }
    const cost = Object.fromEntries(keys.map((k) => [k, Math.min(res[k] ?? 0, keep * per[k])]));
    if (keep > 0) {
      spendResources(userId, cost, "gate_duty", `🚧 Gate duty: ${keys.map((k) => `${cost[k].toLocaleString()} ${k}`).join(", ")} for ${keep.toLocaleString()} soldiers keeping the frontier gate and its wall`);
    }
  }
}

/** Host sends a stationed reinforcement home (`POST /marches/:id/send-home`) */
export const sendReinforcementHome = db.transaction((marchId: string, hostId: string, now = Date.now()): ActiveMarch => {
  const row = db.prepare(`SELECT * FROM active_marches WHERE id = ?`).get(marchId) as any;
  if (!row || row.kind !== "reinforce" || row.status !== "marching" || row.phase !== "stationed") throw new Error("Those troops aren't stationed here.");
  if (row.target_id !== hostId) throw new Error("Only the ruler they're guarding can send them home.");
  if (reinforcementInBattle(row)) throw new Error("They're fighting in your defence right now — send them home once the battle is over.");
  sendMarchReturning(marchId, now, null, null);
  return rowToMarch(db.prepare(`SELECT * FROM active_marches WHERE id = ?`).get(marchId));
});

const rallyStatus = (rallyId: string) => (db.prepare(`SELECT status FROM rallies WHERE id = ?`).get(rallyId) as { status: string } | undefined)?.status ?? null;

/** Attack bonus of a rally with `joiners` joiners besides the leader (+5% each) */
export const rallyAtkBonus = (joiners: number) => 1 + RALLY_COORDINATION_ATK * Math.max(0, joiners);

/**
 * A leader opens a rally: their army waits in the lobby (their castle) until `waitMs` passes. A muster (`armies`) leads
 * with several armies at once, each its own march (one slot each, strongest first); the first is the rally's own march,
 * whose recall calls the rally off
 */
export function startRally(params: {
  leader: DeveloperKingdom;
  targetType: MarchTargetType;
  targetId: string;
  waitMs: number;
  soldiers: number;
  kingdoms: DeveloperKingdom[];
  loadout?: string;
  champion?: boolean;
  /** ⚔️ A muster's armies (replace `soldiers` / `loadout` / `champion`), strongest first */
  armies?: Array<{ soldiers: number; loadout?: string; champion?: boolean }>;
  musterId?: string;
}): Rally {
  const { leader, targetType, targetId, waitMs, kingdoms } = params;
  const armies = params.armies?.length ? params.armies : [{ soldiers: params.soldiers, loadout: params.loadout, champion: params.champion }];
  const soldiers = armies.reduce((a, x) => a + x.soldiers, 0);
  if (!(RALLY_WINDOWS_MS as readonly number[]).includes(waitMs)) throw new Error("Pick a rally wait time of 2, 5 or 10 minutes.");
  if (armies.some((x) => !(x.soldiers > 0))) throw new Error("Lead the rally with at least 1 soldier.");
  if (armies.filter((x) => x.champion).length > 1) throw new Error("Your champion can lead only one march.");
  // An open Voidrift slot is claimed by one ruler alone: no rallies on its NPC void kingdom
  if (targetType === "spire") throw new Error("Voidrift slots can't be rallied on — conquer one with your own army.");
  const plan = planMarch(leader, targetType, targetId, kingdoms, "attack");
  const maxPop = leader.maxPopulation ?? calculateMaxPopulation(leader.cityHallLevel, leader.civilization);
  const cap = leader.marchCapacity ?? marchCapacityFor(maxPop, leader.civilization);
  if (armies.some((x) => x.soldiers > cap)) throw new Error(`Exceeds single-march capacity (${cap.toLocaleString()} soldiers max per march).`);
  const slots = leader.marchSlots ?? marchSlotsForLevel(leader.cityHallLevel);
  const now = Date.now();
  const rally: Rally = {
    id: `rally_${now}_${Math.random().toString(36).substring(2, 7)}`,
    leaderId: leader.id,
    leaderName: leader.name,
    civilization: leader.civilization,
    targetType,
    targetKind: plan.targetKind,
    targetId,
    targetName: plan.targetName,
    launchAt: now + waitMs,
    joinerCap: rallyJoinerCapFor(leader.cityHallLevel),
    status: "open",
    members: []
  };
  const foodCost = armies.reduce((a, x) => a + Math.ceil(x.soldiers * plan.foodPerSoldier), 0);
  db.transaction(() => {
    const active = countActiveMarchesForUser(leader.id);
    if (active + armies.length > slots) throw new Error(`All march slots are in use (${active}/${slots}).`);
    const home = (db.prepare(`SELECT soldiers FROM users WHERE id = ?`).get(leader.id) as { soldiers: number } | undefined)?.soldiers ?? 0;
    const food = (db.prepare(`SELECT food FROM kingdom_resources WHERE user_id = ?`).get(leader.id) as { food: number } | undefined)?.food ?? 0;
    if (home < soldiers) throw new Error(`Insufficient soldiers. Available: ${home}, requested: ${soldiers}.`);
    if (food < foodCost) throw new Error(`Insufficient round-trip food rations. Required: ${foodCost} food, available: ${food} food.`);

    if (foodCost > 0) {
      spendResources(
        leader.id,
        { food: foodCost },
        "rally_rations",
        `Rally rations: ${foodCost.toLocaleString()} food for ${soldiers.toLocaleString()} soldiers on ${plan.targetName}`
      );
    }
    db.prepare(`UPDATE users SET soldiers = soldiers - ? WHERE id = ?`).run(soldiers, leader.id);
    db.prepare(`
      INSERT INTO rallies (id, leader_id, leader_name, civilization, target_type, target_kind, target_id, target_name, launch_at, wait_ms, joiner_cap, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(rally.id, leader.id, leader.name, leader.civilization, targetType, plan.targetKind, targetId, plan.targetName, rally.launchAt, waitMs, rally.joinerCap, now);
    armies.forEach((army, rank) => {
      // The leader's army stands in the lobby at home: start = target = their castle until launch
      const leaderMarchId = `march_${now}_${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO active_marches (
          id, attacker_id, attacker_name, attacker_username, attacker_civ, kind, phase, target_type, target_kind, target_id, target_name,
          soldiers_count, initial_soldiers, start_x, start_z, target_x, target_z, home_x, home_z, depart_time, arrival_time, act_until, rally_id, status
        ) VALUES (?, ?, ?, ?, ?, 'rally', 'rallying', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'marching')
      `).run(
        leaderMarchId,
        leader.id,
        leader.name,
        leader.username,
        leader.civilization,
        targetType,
        plan.targetKind,
        targetId,
        `🚩 Rally on ${plan.targetName}`,
        army.soldiers,
        army.soldiers,
        plan.startX,
        plan.startZ,
        plan.startX,
        plan.startZ,
        plan.startX,
        plan.startZ,
        now,
        now,
        rally.launchAt,
        rally.id
      );
      if (params.musterId) db.prepare(`UPDATE active_marches SET muster_id = ?, muster_rank = ? WHERE id = ?`).run(params.musterId, rank, leaderMarchId);
      // 🗡️ The leader's army may wear one of the Armory's sets
      const armory = takeSets(leader, army.loadout, army.soldiers);
      if (armory) db.prepare(`UPDATE active_marches SET armory_json = ? WHERE id = ?`).run(JSON.stringify(armory), leaderMarchId);
      // 🦸 The leader's champion may lead their army in the rally
      if (army.champion) takeChampion(leader.id, leaderMarchId, now);
    });
    if (targetType === "npc") {
      const npc = findMapNpc(kingdoms, targetId);
      if (npc) pinSpawnForMatch(npc, now);
    }
  })();
  if (attacksRuler("attack", plan.targetKind)) breakShieldOnAttack(leader.id, plan.targetName);
  if (callsToArms("attack", plan.targetKind, targetType, targetId)) markCallToArms(leader.id);
  return getRallyById(rally.id)!;
}

/** A ruler of the leader's civilization joins: their march heads for the leader's castle */
export function joinRally(params: { rallyId: string; joiner: DeveloperKingdom; soldiers: number; kingdoms: DeveloperKingdom[]; loadout?: string; champion?: boolean }): ActiveMarch {
  const { rallyId, joiner, soldiers, kingdoms, loadout } = params;
  const r = db.prepare(`SELECT * FROM rallies WHERE id = ?`).get(rallyId) as any;
  const now = Date.now();
  if (!r || r.status !== "open" || r.launch_at <= now) throw new Error("This rally has already launched or been called off.");
  if (r.target_type === "spire") throw new Error("Voidrift slots can't be rallied on — conquer one with your own army.");
  if (r.civilization !== joiner.civilization) throw new Error("Only rulers of the leader's civilization can join this rally.");
  if (r.leader_id === joiner.id) throw new Error("You're leading this rally.");
  if (isSpecialUser(joiner)) throw new Error("Special Overseers don't join rallies.");
  if (joiner.burning) throw new Error("Your city walls are burning — you can't join an attack until they repair above 25%.");
  if (soldiers <= 0) throw new Error("Bring at least 1 soldier.");
  const maxPop = joiner.maxPopulation ?? calculateMaxPopulation(joiner.cityHallLevel, joiner.civilization);
  const cap = joiner.marchCapacity ?? marchCapacityFor(maxPop, joiner.civilization);
  if (soldiers > cap) throw new Error(`Exceeds single-march capacity (${cap.toLocaleString()} soldiers max per march).`);
  const slots = joiner.marchSlots ?? marchSlotsForLevel(joiner.cityHallLevel);

  const placements = kingdomPlacements(kingdoms);
  const home = placements[joiner.id];
  const lobby = placements[r.leader_id];
  if (!home || !lobby) throw new Error("No route to the rally on the map.");
  const leader = kingdoms.find((k) => k.id === r.leader_id);
  const target = leader ? planMarch(leader, r.target_type, r.target_id, kingdoms, "attack") : null;
  if (!target) throw new Error("The rally's target is no longer valid.");
  const toLobby = Math.hypot(lobby.x - home.x, lobby.z - home.z);
  const toTarget = Math.hypot(target.targetX - lobby.x, target.targetZ - lobby.z);
  const joinerFx = improvementEffects(joiner.upgrades);
  const durationMs = travelMsFor(toLobby, joiner.civilization, joinerFx.marchSpeedMult);
  if (now + durationMs > r.launch_at) throw new Error(`Your army can't reach ${r.leader_name}'s castle before the rally launches (${Math.ceil(durationMs / 1000)} s away).`);
  const foodCost = Math.ceil(soldiers * (oneWayRations(toLobby, joiner.civilization, joinerFx.rationMult) + 2 * oneWayRations(toTarget, joiner.civilization, joinerFx.rationMult)));

  const id = `march_${now}_${Math.random().toString(36).substring(2, 7)}`;
  db.transaction(() => {
    // Joiners on the way to the lobby or in it (one who turned back has left the rally)
    const members = (db.prepare(`SELECT attacker_id FROM active_marches WHERE rally_id = ? AND status = 'marching' AND kind = 'rally_join' AND COALESCE(phase, 'outbound') IN ('outbound', 'rallying')`).all(rallyId) as Array<{ attacker_id: string }>).map((m) => m.attacker_id);
    if (members.includes(joiner.id)) throw new Error("You've already joined this rally.");
    if (members.length >= r.joiner_cap) throw new Error(`The rally is full (${r.joiner_cap} joiners besides the leader).`);
    const active = countActiveMarchesForUser(joiner.id);
    if (active >= slots) throw new Error(`All march slots are in use (${active}/${slots}).`);
    const homeSoldiers = (db.prepare(`SELECT soldiers FROM users WHERE id = ?`).get(joiner.id) as { soldiers: number } | undefined)?.soldiers ?? 0;
    const food = (db.prepare(`SELECT food FROM kingdom_resources WHERE user_id = ?`).get(joiner.id) as { food: number } | undefined)?.food ?? 0;
    if (homeSoldiers < soldiers) throw new Error(`Insufficient soldiers. Available: ${homeSoldiers}, requested: ${soldiers}.`);
    if (food < foodCost) throw new Error(`Insufficient food rations. Required: ${foodCost} food, available: ${food} food.`);

    if (foodCost > 0) {
      spendResources(
        joiner.id,
        { food: foodCost },
        "rally_rations",
        `Rally rations: ${foodCost.toLocaleString()} food for ${soldiers.toLocaleString()} soldiers to join ${r.leader_name}'s rally`
      );
    }
    db.prepare(`UPDATE users SET soldiers = soldiers - ? WHERE id = ?`).run(soldiers, joiner.id);
    db.prepare(`
      INSERT INTO active_marches (
        id, attacker_id, attacker_name, attacker_username, attacker_civ, kind, phase, target_type, target_kind, target_id, target_name,
        soldiers_count, initial_soldiers, start_x, start_z, target_x, target_z, home_x, home_z, depart_time, arrival_time, rally_id, status
      ) VALUES (?, ?, ?, ?, ?, 'rally_join', 'outbound', 'dev_kingdom', 'kingdom', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'marching')
    `).run(id, joiner.id, joiner.name, joiner.username, joiner.civilization, r.leader_id, `🚩 ${r.leader_name}'s rally`, soldiers, soldiers, home.x, home.z, lobby.x, lobby.z, home.x, home.z, now, now + durationMs, rallyId);
    // 🗡️ A joiner's army may wear one of the Armory's sets
    const armory = takeSets(joiner, loadout, soldiers);
    if (armory) db.prepare(`UPDATE active_marches SET armory_json = ? WHERE id = ?`).run(JSON.stringify(armory), id);
    // 🦸 …and a joiner's champion may lead it
    if (params.champion) takeChampion(joiner.id, id, now);
  })();
  if (attacksRuler("attack", target.targetKind)) breakShieldOnAttack(joiner.id, target.targetName);
  if (callsToArms("attack", target.targetKind, r.target_type, r.target_id)) markCallToArms(joiner.id);
  return rowToMarch(db.prepare(`SELECT * FROM active_marches WHERE id = ?`).get(id));
}

/** Call a rally off: the lobby walks home, joiners on the road turn back (no rations refunded) */
function cancelRallyNow(rallyId: string, now: number) {
  db.prepare(`UPDATE rallies SET status = 'cancelled' WHERE id = ? AND status = 'open'`).run(rallyId);
  for (const m of db.prepare(`SELECT * FROM active_marches WHERE rally_id = ? AND status = 'marching'`).all(rallyId) as any[]) {
    if (m.phase === "outbound") turnBackOutbound(m, now);
    else if (m.phase === "rallying") sendMarchReturning(m.id, now, null, null);
  }
}

export const cancelRally = db.transaction((rallyId: string, userId: string, now = Date.now()) => {
  const r = db.prepare(`SELECT leader_id, status FROM rallies WHERE id = ?`).get(rallyId) as { leader_id: string; status: string } | undefined;
  if (!r) throw new Error("Rally not found.");
  if (r.leader_id !== userId) throw new Error("Only the rally leader can call it off.");
  if (r.status !== "open") throw new Error("This rally has already launched.");
  cancelRallyNow(rallyId, now);
});

/**
 * Rallies whose wait is over set off: everyone in the lobby marches together from the leader's castle at
 * the slowest member's speed, each army fighting as its own stack with +5% ATK per joiner. Joiners still on the
 * road are sent home. If the target can't be attacked any more, the whole rally goes home.
 */
function launchDueRallies(now: number, kingdoms: DeveloperKingdom[]) {
  const due = db.prepare(`SELECT * FROM rallies WHERE status = 'open' AND launch_at <= ?`).all(now) as any[];
  for (const r of due) {
    db.transaction(() => {
      const members = db.prepare(`SELECT * FROM active_marches WHERE rally_id = ? AND status = 'marching'`).all(r.id) as any[];
      for (const m of members) {
        if (m.phase !== "outbound") continue;
        // A joiner who reached the lobby by the launch is in it, even if no war tick has seen them arrive yet
        if (m.kind === "rally_join" && m.arrival_time <= r.launch_at) {
          db.prepare(`UPDATE active_marches SET phase = 'rallying', act_until = ? WHERE id = ?`).run(r.launch_at, m.id);
          m.phase = "rallying";
        } else turnBackOutbound(m, now);
      }
      const lobby = members.filter((m) => m.phase === "rallying" && m.soldiers_count > 0);
      const leaderMarch = lobby.find((m) => m.kind === "rally");
      const leader = kingdoms.find((k) => k.id === r.leader_id);
      let plan: MarchPlan | null;
      try {
        // Voidrift slots can't be rallied on (rallies raised on one before that rule are called off here)
        plan = leader && leaderMarch && r.target_type !== "spire" ? planMarch(leader, r.target_type, r.target_id, kingdoms, "attack") : null;
      } catch {
        plan = null;
      }
      if (!plan || !leaderMarch) {
        db.prepare(`UPDATE rallies SET status = 'cancelled' WHERE id = ?`).run(r.id);
        for (const m of lobby) sendMarchReturning(m.id, now, null, null);
        return;
      }
      const joiners = lobby.filter((m) => m.kind === "rally_join").length;
      // The leader's Kingdom Banners add to the coordination bonus of every army in the rally
      const bonus = rallyAtkBonus(joiners) + effectsOf(r.leader_id).rallyAtkBonus;
      const distance = Math.hypot(plan.targetX - plan.startX, plan.targetZ - plan.startZ);
      // The rally moves at its slowest member's pace (own civ speed and own roads)
      const durationMs = Math.max(...lobby.map((m) => travelMsFor(distance, m.attacker_civ as CivilizationType, effectsOf(m.attacker_id).marchSpeedMult)));
      for (const m of lobby) {
        // 🌪️ Tempest Roads: the rally loses its share on the road as it sets off
        const lost = tempestToll(m.attacker_id, m.attacker_civ as CivilizationType, m.soldiers_count, false, m.id, plan.targetName, now);
        if (lost > 0) db.prepare(`UPDATE active_marches SET soldiers_count = soldiers_count - ? WHERE id = ?`).run(lost, m.id);
        db.prepare(`
          UPDATE active_marches
          SET phase = 'outbound', start_x = ?, start_z = ?, target_x = ?, target_z = ?, depart_time = ?, arrival_time = ?, act_until = NULL,
              target_type = ?, target_kind = ?, target_id = ?, target_name = ?, atk_bonus = ?,
              home_x = COALESCE(home_x, start_x), home_z = COALESCE(home_z, start_z)
          WHERE id = ?
        `).run(plan.startX, plan.startZ, plan.targetX, plan.targetZ, now, now + durationMs, r.target_type, plan.targetKind, r.target_id, `${plan.targetName} (rally)`, bonus, m.id);
      }
      if (r.target_type === "npc" && plan) {
        const npc = findMapNpc(kingdoms, r.target_id);
        if (npc) pinSpawnForMatch(npc, now);
      }
      db.prepare(`UPDATE rallies SET status = 'launched', launched_at = ? WHERE id = ?`).run(now, r.id);
    })();
  }
}

function getRallyById(id: string): Rally | null {
  const r = db.prepare(`SELECT * FROM rallies WHERE id = ?`).get(id) as any;
  if (!r) return null;
  const members = db
    .prepare(`SELECT id, attacker_id, attacker_name, attacker_civ, soldiers_count, phase, kind, arrival_time FROM active_marches WHERE rally_id = ? AND status = 'marching' ORDER BY depart_time ASC`)
    .all(id) as any[];
  return {
    id: r.id,
    leaderId: r.leader_id,
    leaderName: r.leader_name,
    civilization: r.civilization,
    targetType: r.target_type,
    targetKind: r.target_kind,
    targetId: r.target_id,
    targetName: r.target_name,
    launchAt: r.launch_at,
    joinerCap: r.joiner_cap,
    status: r.status,
    members: members.map((m) => ({
      marchId: m.id,
      userId: m.attacker_id,
      name: m.attacker_name,
      civ: m.attacker_civ,
      soldiers: m.soldiers_count,
      leader: m.kind === "rally",
      arrived: m.phase === "rallying",
      arrivesAt: m.arrival_time
    }))
  };
}

/** Open rallies the viewer can see: their own civilization's, newest first */
export function getOpenRallies(viewerId: string | null): Rally[] {
  if (!viewerId) return [];
  const civ = getUser(viewerId)?.civilization;
  if (!civ) return [];
  const rows = db.prepare(`SELECT id FROM rallies WHERE status = 'open' AND civilization = ? ORDER BY launch_at ASC`).all(civ) as Array<{ id: string }>;
  return rows.map((r) => getRallyById(r.id)!).filter(Boolean);
}

/** Step 1 of war tick: transition arrived `outbound` marches into an active battle (or turn back if target is burning/invalid) */
function handleArrivedOutboundMarches(now: number, kingdoms: DeveloperKingdom[]): BattleReport[] {
  const arrived = db
    // ⚔️ A muster's marches arrive in the same moment and take their places strongest first (rank 0 opens the battle)
    .prepare(`SELECT * FROM active_marches WHERE status = 'marching' AND COALESCE(phase, 'outbound') = 'outbound' AND arrival_time <= ? ORDER BY arrival_time ASC, COALESCE(muster_rank, 1000) ASC`)
    .all(now) as any[];
  const immediateReports: BattleReport[] = [];

  for (const row of arrived) {
    const march = rowToMarch(row);
    // Scouts look, write down what they see and walk home; the report is delivered when they get there
    // 🛡️ A Royal Shield went up while they were on the road: scouts learn nothing, armies turn back
    const shieldedTarget = () => march.targetType === "dev_kingdom" && Boolean(getActiveShield(march.targetId, now));
    if (march.kind === "scout") {
      if (!shieldedTarget()) {
        const outcome = rollScoutOutcome(march, kingdoms);
        if (outcome.result === "caught") {
          scoutsCaught(march, kingdoms, outcome, now);
          continue;
        }
        deliverScoutIntel(march, kingdoms, now, outcome);
      }
      sendMarchReturning(march.id, now, null, null);
      continue;
    }
    // Reinforcements take up station in the ally's castle (and join a defence already going on)
    if (march.kind === "reinforce") {
      stationReinforcement(march, now);
      continue;
    }
    // Rally joiners reach the leader's castle and wait in the lobby
    if (march.kind === "rally_join" && march.rallyId && rallyStatus(march.rallyId) === "open") {
      const rally = db.prepare(`SELECT launch_at FROM rallies WHERE id = ?`).get(march.rallyId) as { launch_at: number };
      db.prepare(`UPDATE active_marches SET phase = 'rallying', act_until = ? WHERE id = ?`).run(rally.launch_at, march.id);
      continue;
    }
    // Gatherers claim the node (first to arrive) and start working, or turn back if it's taken
    if (march.kind === "gather") {
      startGathering(row, march, kingdoms, now);
      continue;
    }
    if (shieldedTarget()) {
      sendMarchReturning(march.id, now, null, null);
      continue;
    }
    // A Voidrift slot is for mortals: a ruler who ascended while this march walked (another slot won) turns back
    if (march.targetType === "spire" && rulerCivOf(march.attackerId) === "arcane") {
      sendMarchReturning(march.id, now, null, null);
      continue;
    }
    // Check if there is already a 'fighting' battle at this target
    const battle = db
      .prepare(`SELECT * FROM battles WHERE target_type = ? AND target_id = ? AND status = 'fighting'`)
      .get(march.targetType, march.targetId) as any;

    if (battle) {
      // Join the ongoing battle!
      const stacks: LiveAttackerStack[] = JSON.parse(battle.stacks_json || "[]");
      const log: string[] = JSON.parse(battle.log_json || "[]");
      pushFolded(
        log,
        battle.round === 0
          ? `⚔️ ${marchersOf(march)} ${verbOf(march, "arrive alongside and fight", "arrives alongside and fights")} from round 1!`
          : `🎺 Reinforcing wave: ${marchersOf(march)} ${verbOf(march, "join", "joins")} the battle at round ${battle.round + 1}!`
      );
      stacks.push(openingStack(march, battle.round + 1));
      db.prepare(`UPDATE battles SET stacks_json = ?, log_json = ? WHERE id = ?`).run(
        JSON.stringify(stacks),
        JSON.stringify(log),
        battle.id
      );
      db.prepare(`
        UPDATE active_marches
        SET phase = 'acting', battle_id = ?, joined_round = ?, act_until = ?
        WHERE id = ?
      `).run(battle.id, battle.round + 1, now + marchMaxRounds(march) * BATTLE_ROUND_MS, march.id);
      continue;
    }

    // No ongoing battle at this target: validate target and check if burning
    if (march.targetType === "npc" && (march.targetKind === "gathering" || march.targetKind === "resource" || march.targetKind === "treasure")) {
      engageGatherers(march, kingdoms, now);
    } else if (march.targetType === "npc" && (march.targetKind === "boss" || march.targetKind === "npc_kingdom")) {
      const npc = findMapNpc(kingdoms, march.targetId);
      if (npc?.category === "boss") openBossBattle(march, npc, now);
      else if (npc?.category === "kingdom") openNpcKingdomBattle(march, npc, now);
      else sendMarchReturning(march.id, now, null, null);
    } else if (march.targetType === "npc") {
      const npc = findMapNpc(kingdoms, march.targetId);
      const remaining = npc ? packRemaining(npc, now) : 0;
      // Earlier battles' partial wounds: the last standing unit starts hurt
      const wound = npc ? Math.max(0, remaining - packHealth(npc, now)) : 0;
      // Gone (killed by someone else, or the roving window rolled over): turn back
      if (!npc || remaining <= 0 || (npc.category !== "mob" && npc.category !== "bandit")) {
        sendMarchReturning(march.id, now, null, null);
        continue;
      }
      // 🛡️ The pack fights in the gear it rolled when it spawned
      const gear = packGearFor(npc.id);
      const unit = gearedNpcUnitFor(npc.type, gear);
      const defenderState: LiveDefenderState = {
        civ: march.attackerCiv,
        count: remaining,
        initialCount: remaining,
        fortified: false,
        roundsFought: 0,
        carryDamageTaken: wound,
        totalLosses: 0,
        unit: { hp: unit.hp, atk: unit.atk, def: unit.def },
        traits: unit.traits,
        kit: npcKitFor(npc.type, npc.rarity as UnitRarity | undefined),
        npc: {
          type: npc.type,
          category: npc.category,
          rarity: npc.rarity,
          emblem: npc.emblem,
          unitName: unit.name,
          expiresAt: npc.expiresAt ?? null
        }
      };
      const stacks: LiveAttackerStack[] = [openingStack(march)];
      const battleId = `battle_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const log = [`🚩 ${marchersOf(march)} ${verbOf(march, "fall", "falls")} upon ${npc.emblem} ${npc.name}: ${remaining.toLocaleString()}× ${unit.name} in the open field.`];
      if (gear !== "ragged") log.push(`${PACK_GEAR[gear].emblem} They are ${PACK_GEAR[gear].name.toLowerCase()}: ${PACK_GEAR[gear].description}.`);
      db.prepare(`
        INSERT INTO battles (id, target_type, target_id, target_name, defender_civ, started_at, round, next_round_at, defender_json, stacks_json, rounds_json, log_json, status)
        VALUES (?, 'npc', ?, ?, 'npc', ?, 0, ?, ?, ?, '[]', ?, 'fighting')
      `).run(battleId, march.targetId, npc.name, now, now, JSON.stringify(defenderState), JSON.stringify(stacks), JSON.stringify(log));
      pinSpawnForMatch(npc, now);
      db.prepare(`
        UPDATE active_marches
        SET phase = 'acting', battle_id = ?, joined_round = 1, act_until = ?
        WHERE id = ?
      `).run(battleId, now + marchMaxRounds(march) * BATTLE_ROUND_MS, march.id);
    } else if (march.targetType === "spire") {
      const spire = db.prepare(`SELECT * FROM nethergarde_spires WHERE id = ?`).get(march.targetId) as any;
      if (!spire || spire.occupied_by_dev_id || spire.garrison === null || spire.garrison === undefined) {
        sendMarchReturning(march.id, now, null, null);
        continue;
      }
      const npc = voidNpcFor(spire.slot_index);
      const wallState = computeWallState(spire.wall_hp, spire.wall_updated_at, npc.wallMaxHp, now);
      if (wallState.burning) {
        sendMarchReturning(march.id, now, null, null);
        continue;
      }

      const defenderState: LiveDefenderState = {
        civ: "arcane",
        count: spire.garrison,
        initialCount: spire.garrison,
        fortified: true,
        wallTier: npc.wallTier,
        wallDefMult: wallDefMultForTier(npc.wallTier),
        roundsFought: 0,
        carryDamageTaken: 0,
        totalLosses: 0
      };
      const stacks: LiveAttackerStack[] = [openingStack(march)];
      const battleId = `battle_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const log = [`🚩 ${marchersOf(march)} ${verbOf(march, "reach", "reaches")} ${spire.npc_name || npc.name} (Walls Tier ${npc.wallTier}, DEF ×${wallDefMultForTier(npc.wallTier).toFixed(2)}).`];
      db.prepare(`
        INSERT INTO battles (id, target_type, target_id, target_name, defender_civ, started_at, round, next_round_at, defender_json, stacks_json, rounds_json, log_json, status)
        VALUES (?, ?, ?, ?, 'arcane', ?, 0, ?, ?, ?, '[]', ?, 'fighting')
      `).run(
        battleId,
        march.targetType,
        march.targetId,
        spire.npc_name || npc.name,
        now,
        now, // Round 1 runs immediately
        JSON.stringify(defenderState),
        JSON.stringify(stacks),
        JSON.stringify(log)
      );
      db.prepare(`
        UPDATE active_marches
        SET phase = 'acting', battle_id = ?, joined_round = 1, act_until = ?
        WHERE id = ?
      `).run(battleId, now + marchMaxRounds(march) * BATTLE_ROUND_MS, march.id);
    } else {
      const defender = getUser(march.targetId);
      if (!defender || defender.civilization === march.attackerCiv) {
        sendMarchReturning(march.id, now, null, null);
        continue;
      }
      const grudge = isSpecialUser(defender) ? grudgeStacksOf(defender, now) : 0;
      const wallTier = getUserWallTier(defender.id);
      const wallMaxHp = wallMaxHpFor(defender.city_hall_level ?? 1, wallTier);
      const wallState = computeWallState(defender.wall_hp, defender.wall_updated_at, wallMaxHp, now);
      if (wallState.burning) {
        sendMarchReturning(march.id, now, null, null);
        continue;
      }

      const garrison = defender.soldiers ?? 0;
      const famished = ((db.prepare(`SELECT food FROM kingdom_resources WHERE user_id = ?`).get(defender.id) as { food: number } | undefined)?.food ?? 0) <= 0;
      const defenderState: LiveDefenderState = {
        civ: defender.civilization,
        count: garrison,
        initialCount: garrison,
        famished,
        fortified: true,
        wallTier,
        wallDefMult: wallDefMultForTier(wallTier),
        roundsFought: 0,
        carryDamageTaken: 0,
        totalLosses: 0,
        reinforcements: stationedGroupsAt(defender.id),
        // Overseer's Resolve: +20% HP, ATK and DEF per defeat this week
        statMult: grudge > 0 ? 1 + OVERSEER_GRUDGE_PER_DEFEAT * grudge : undefined,
        grudgeStacks: grudge || undefined
      };
      const unitName = CIV_DEMOGRAPHICS[march.attackerCiv].soldierUnit.name;
      const defName = defender.full_name || defender.username;
      const battleId = `battle_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const log: string[] = [
        `🚩 ${marchersOf(march)} ${verbOf(march, "reach", "reaches")} ${defName} (Walls Tier ${wallTier}, DEF ×${wallDefMultForTier(wallTier).toFixed(2)}).`
      ];
      for (const g of defenderState.reinforcements ?? []) log.push(`🛡️ ${g.count}× ${CIV_DEMOGRAPHICS[g.civ].soldierUnit.name} of ${g.ownerName} stand on the walls beside the garrison.`);
      // 🪙 The ruler's bands at home take the walls too, each if its battle pay is paid now
      const walls = bandsTakeTheWalls(defender.id, defName, battleId, defName, now);
      defenderState.reinforcements = [...(defenderState.reinforcements ?? []), ...walls.groups];
      log.push(...walls.log);
      if (garrison === 0 && !(defenderState.reinforcements ?? []).length) log.push("🚪 The city walls stand unguarded!");
      if (famished && garrison > 0) log.push("🍂 The garrison is starving: its armor counts half.");
      if (grudge > 0) log.push(`🔱 Overseer's Resolve ×${grudge}: the garrison fights with +${Math.round(OVERSEER_GRUDGE_PER_DEFEAT * grudge * 100)}% HP, ATK and DEF.`);

      const stacks: LiveAttackerStack[] = [openingStack(march)];
      db.prepare(`
        INSERT INTO battles (id, target_type, target_id, target_name, defender_civ, started_at, round, next_round_at, defender_json, stacks_json, rounds_json, log_json, status)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, '[]', ?, 'fighting')
      `).run(
        battleId,
        march.targetType,
        march.targetId,
        defName,
        defender.civilization,
        now,
        now, // Round 1 runs immediately
        JSON.stringify(defenderState),
        JSON.stringify(stacks),
        JSON.stringify(log)
      );
      db.prepare(`
        UPDATE active_marches
        SET phase = 'acting', battle_id = ?, joined_round = 1, act_until = ?
        WHERE id = ?
      `).run(battleId, now + marchMaxRounds(march) * BATTLE_ROUND_MS, march.id);
      // ⚔️ War Frenzy starts with the siege's first round (GAME_GUIDE §9), not only once the battle is over
      if (!isSpecialUser(defender)) recordWarFrenzy(march.attackerCiv, defender.civilization, now);
    }
  }

  return immediateReports;
}

/** "+5% HP, +2% ATK" for the non-zero parts of a ruler's stat buffs */
function titleBuffText(b: TitleBuffs): string {
  const pct = (n: number) => `+${Math.round(n * 1000) / 10}%`;
  return [b.hpBonus ? `${pct(b.hpBonus)} HP` : "", b.atkBonus ? `${pct(b.atkBonus)} ATK` : "", b.defBonus ? `${pct(b.defBonus)} DEF` : ""].filter(Boolean).join(", ");
}

/** A ruler's soldier stat bonuses: milestone titles + Dragon Statue (ATK), Mana Spire (HP), Plaza Fountain (DEF) */
function rulerStatBuffs(userId: string): TitleBuffs {
  const t = titleBuffsOf(getUserTitles(userId));
  const fx = effectsOf(userId);
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return { hpBonus: r(t.hpBonus + fx.hpBonus), atkBonus: r(t.atkBonus + fx.atkBonus), defBonus: r(t.defBonus + fx.defBonus) };
}

const LANDMARK_SOURCES = [
  { id: "dragon_statue", emblem: "🐉", name: "Dragon Statue" },
  { id: "mana_spire", emblem: "🔮", name: "Mana Spire" },
  { id: "plaza", emblem: "⛲", name: "Plaza Fountain" }
] as const;
const ROMAN = ["", "I", "II", "III", "IV", "V"];

/**
 * Ruler stat buffs (GAME_GUIDE §8 & §13): every ruler's soldiers in the battle fight with their owner's milestone
 * titles plus the Dragon Statue (ATK), Mana Spire (HP) and Plaza Fountain (DEF) of their city — attacking stacks,
 * the defending ruler's home garrison (kingdoms, exposed gatherers) and stationed reinforcements. NPC packs, bosses,
 * NPC kingdoms and void garrisons have none. Each army's buffs are announced in the battle log the first round it fights.
 */
function attachRulerBuffs(bRow: { target_type: string; target_id: string; target_name?: string }, stacks: LiveAttackerStack[], defender: LiveDefenderState, log: string[]) {
  const cache = new Map<string, { buffs: TitleBuffs; names: string } | null>();
  const lookup = (userId: string | undefined) => {
    if (!userId) return null;
    if (!cache.has(userId)) {
      const titles = getUserTitles(userId);
      const upgrades = getEffectiveUpgrades(userId);
      const buffs = rulerStatBuffs(userId);
      const names = [
        ...titles.map((x) => `${x.emblem} ${x.name}`),
        ...LANDMARK_SOURCES.filter((l) => (upgrades[l.id] ?? 0) > 0).map((l) => `${l.emblem} ${l.name} ${ROMAN[upgrades[l.id]] ?? upgrades[l.id]}`)
      ];
      cache.set(userId, names.length ? { buffs, names: names.join(", ") } : null);
    }
    return cache.get(userId) ?? null;
  };
  // A ruler's marches share their lines (titles, set, Colossus Hide): each is told once a battle, not once a march (a
  // later wave of the same ruler isn't told them again)
  const said = new Set<string>(log);
  const say = (line: string) => {
    if (said.has(line)) return;
    said.add(line);
    log.push(line);
  };
  const announce = (name: string, t: { buffs: TitleBuffs; names: string }) => {
    const text = titleBuffText(t.buffs);
    if (text) say(`🎖️ ${name}'s troops fight with ${text} (${t.names}).`);
  };

  // 🗡️ A set counts its ARMORY_TARGET_SHARE against a world boss or a frontier gate
  const armoryTarget = defender.boss ? "boss" : bRow.target_type === "npc" && NPC_GATE_CIV[bRow.target_id] ? "gate" : null;
  // 🦸 A champion counts its CHAMPION_TARGET_SHARE against a frontier gate or an epic pack
  const champTarget: ChampionTarget | null =
    bRow.target_type === "npc" && NPC_GATE_CIV[bRow.target_id]
      ? "gate"
      : defender.npc && (defender.npc.category === "mob" || defender.npc.category === "bandit") && (defender.npc.rarity === "epic" || defender.npc.rarity === "legendary")
        ? "epic_pack"
        : null;
  for (const s of stacks) {
    if (s.champion && !s.band) {
      const f = championBattleFields(s.attackerId, championShareVs(champTarget));
      if (f) {
        s.artShare = f.artShare;
        s.champion = f.champion;
        if (s.roundsFought === 0) {
          const t = champTarget ? CHAMPION_TARGET_SHARE[champTarget] : null;
          say(`🦸 ${f.champion.name} (level ${f.champion.level}) leads ${s.attackerName}'s army${t ? `; ${t.emblem} ${t.name}: it counts ${Math.round(t.share * 100)}% of its worth here` : ""}.`);
        }
      }
    }
    // 🪙 Mercenaries aren't the ruler's soldiers: no titles, no landmarks
    const t = s.band ? null : lookup(s.attackerId);
    s.titleBuffs = t?.buffs;
    if (t && s.roundsFought === 0) announce(s.attackerName, t);
    // 🗡️ The march's set, read fresh: unpaid upkeep may have rusted it since the last round
    if (s.armory && !s.band) {
      const row = db.prepare(`SELECT armory_json FROM active_marches WHERE id = ?`).get(s.marchId) as { armory_json: string | null } | undefined;
      const worn = row?.armory_json ? (JSON.parse(row.armory_json) as MarchArmory) : null;
      if (!worn) {
        say(`🗡️ ${s.attackerName}'s ${s.armory.name} have rusted: the troops fight on in standard gear.`);
        s.armory = undefined;
        s.gear = undefined;
      } else {
        const share = armoryShareVs(armoryTarget);
        s.gear = gearOf(s.civ, worn.rarity, share);
        if (s.roundsFought === 0) {
          const set = armorySetFor(s.civ, worn.rarity);
          say(`${set.emblem} ${s.attackerName}'s troops march in ${set.name} (${setText(set)})${share < 1 ? `, ${Math.round(share * 100)}% of it against ${armoryTarget === "boss" ? "the colossus" : "the gate"}` : ""}.`);
        }
      }
    }
    // World bosses: Colossus Hide lets only high City Halls hit at full strength
    if (defender.boss) {
      const level = getUser(s.attackerId)?.city_hall_level ?? 1;
      const hide = bossHideMult(level);
      // A civilization's own boss share (orcs' Frenzy Breaks on Colossi, elves' Heartseeker Volleys, dwarves' Giant-Felling Runes); 🪙 a band keeps the Sellsword's Oath
      const civShare = CIV_BOSS_DAMAGE[s.civ];
      s.damageMult = bossDamageMult(level, s.civ) * (s.band ? BAND_BOSS_DAMAGE : 1);
      if (s.roundsFought === 0) {
        if (s.band) {
          // One line for a band: what lands after Colossus Hide, its civilization's share and the Oath
          const parts = [hide < 1 ? `Colossus Hide ${Math.round(hide * 100)}%` : null, civShare ? `${civShare.name} ${Math.round(civShare.mult * 100)}%` : null, `the Oath ${Math.round(BAND_BOSS_DAMAGE * 100)}%`].filter(Boolean);
          say(`🪙 The Sellsword's Oath: ${s.attackerName} lands ${Math.round(s.damageMult * 100)}% of its blows on the colossus (${parts.join(" × ")}).`);
        } else {
          if (hide < 1) say(`🪨 Colossus Hide: ${s.attackerName}'s troops (City Hall ${level}) land ${Math.round(hide * 100)}% of their blows.`);
          if (civShare) say(`${civShare.emblem} ${civShare.name}: ${s.attackerName}'s troops land ${Math.round(civShare.mult * 100)}% of their blows on the colossus.`);
        }
      }
    }
  }
  for (const g of defender.reinforcements ?? []) {
    // 🪙 A band on the walls: no titles or landmarks; one that deserted over unpaid upkeep has left them
    if (g.band) {
      g.titleBuffs = undefined;
      if (g.count > 0 && !bandStillServes(g.band.id)) {
        log.push(`🏃 ${g.ownerName} deserts the walls: its upkeep went unpaid.`);
        g.count = 0;
      }
      continue;
    }
    const t = lookup(g.ownerId);
    g.titleBuffs = t?.buffs;
    if (t && g.roundsFought === 0 && g.count > 0) announce(g.ownerName, t);
  }
  const homeOwner = defender.unit ? undefined : bRow.target_type === "dev_kingdom" ? bRow.target_id : defender.gather?.ownerId;
  const home = lookup(homeOwner);
  defender.titleBuffs = home?.buffs;
  // 🗡️ A ruler's home garrison defends in the sets hanging in the armory, the best first (gatherers in the field don't)
  if (homeOwner && bRow.target_type === "dev_kingdom" && defender.count > 0) {
    const stock = armoryStock(homeOwner);
    defender.gear = garrisonGear(defender.civ, stock, defender.count);
    const wear = defender.roundsFought === 0 ? garrisonWear(stock, defender.count) : null;
    if (wear) {
      const set = armorySetFor(defender.civ, wear.rarity);
      log.push(`${set.emblem} ${bRow.target_name ?? "The"}'s garrison defends in the armory's sets: ${wear.worn.toLocaleString()} of ${defender.count.toLocaleString()} soldiers, the best in ${set.name}.`);
    }
  } else {
    defender.gear = undefined;
  }
  // 🦸 A ruler's champion at home leads the home garrison's defence; away on a march or wounded, the garrison fights
  // without it, and one that comes home joins the next round
  const fit = homeOwner && bRow.target_type === "dev_kingdom" && defender.count > 0 && championHome(homeOwner) ? championBattleFields(homeOwner) : null;
  if (fit) {
    if (!defender.champion) log.push(`🦸 ${fit.champion.name} (level ${fit.champion.level}) takes the walls at the head of the garrison.`);
    defender.kit = fit.kit;
    defender.artShare = fit.artShare;
    defender.champion = fit.champion;
    defender.championLed ??= { id: fit.champion.id, userId: homeOwner!, name: fit.champion.name, level: fit.champion.level };
    defender.championLed.away = false;
    defender.championLed.roundsLed = (defender.championLed.roundsLed ?? 0) + 1;
  } else if (defender.champion) {
    // Tell the defender why the walls fight on without it (a fall on these walls has its own line)
    if (!defender.championLed?.fell) {
      const r = homeOwner ? ensureChampion(homeOwner) : undefined;
      const wounded = Boolean(r?.wounded_until && r.wounded_until > Date.now());
      log.push(
        wounded
          ? `🦸 ${defender.champion.name} was carried home wounded from another field and can't take the walls: the garrison fights on without it.`
          : `🦸 ${defender.champion.name} rides out at the head of a march: the garrison fights on without it (it takes the walls again if it is home before the battle ends).`
      );
    }
    defender.kit = undefined;
    defender.artShare = undefined;
    defender.champion = undefined;
  }
  // A champion that rode out (or fell elsewhere) no longer stands on these walls: it can't fall with this garrison
  if (!fit && defender.championLed && !defender.championLed.fell) defender.championLed.away = true;
  if (home && defender.roundsFought === 0 && defender.count > 0) {
    const owner = getUser(homeOwner!);
    const name = defender.gather?.ownerName ?? (owner?.full_name || owner?.username || homeOwner!);
    announce(`${name}${defender.gather ? "" : " (garrison)"}`, home);
  }
}

/**
 * 🦸 A battle is over: every champion who led an army in it earns Renown (rounds fought, kills, the win, a boss or a
 * realm felled, armies its Finale broke), and Finales that broke armies go to the realm's events (the weekly story)
 */
function settleChampions(
  bRow: { id: string; target_type: string; target_name: string },
  stacks: LiveAttackerStack[],
  defender: LiveDefenderState,
  rounds: BattleRound[],
  attackerWon: boolean,
  burned: boolean,
  report: BattleReport,
  now: number
) {
  const finaleBreaks = (side: "attacker" | "defender", name: string) =>
    rounds.flatMap((r) => (r.arts ?? []).filter((e) => e.kind === "finale" && e.side === side && e.unit === name && (e.broke?.length ?? 0) > 0));
  const out: NonNullable<BattleReport["championRenown"]> = [];
  const defenderLosses = totalDefenderLosses(defender);
  const totalDealt = stacks.reduce((a, s) => a + Math.max(0, s.totalDamageDealt), 0);
  // A realm felled: an NPC kingdom or a Voidrift garrison broken, or a ruler's castle set burning
  const realmFelled = (attackerWon && (defender.npc?.category === "kingdom" || bRow.target_type === "spire")) || (bRow.target_type === "dev_kingdom" && burned);
  for (const s of stacks) {
    if (!s.champion) continue;
    const breaks = finaleBreaks("attacker", s.champion.name);
    for (const e of breaks) recordChampionFinale(s.attackerId, s.champion.name, e.name ?? e.id, e.broke ?? [], bRow.target_name, now);
    const got = awardRenown(
      s.attackerId,
      bRow.id,
      {
        rounds: s.roundsFought,
        kills: totalDealt > 0 ? (defenderLosses * Math.max(0, s.totalDamageDealt)) / totalDealt : 0,
        won: attackerWon && s.count > 0,
        bossFelled: attackerWon && Boolean(defender.boss),
        realmFelled,
        finaleKills: breaks.reduce((a, e) => a + (e.broke?.length ?? 0), 0)
      },
      bRow.target_name,
      now
    );
    if (got && got.renown > 0) out.push({ userId: s.attackerId, name: got.name, renown: got.renown, levelAfter: got.levelAfter });
  }
  const led = defender.championLed;
  if (led) {
    const breaks = finaleBreaks("defender", led.name);
    for (const e of breaks) recordChampionFinale(led.userId, led.name, e.name ?? e.id, e.broke ?? [], bRow.target_name, now);
    const got = awardRenown(
      led.userId,
      bRow.id,
      {
        // Only the rounds it stood on the walls, and the win only if it was there at the end
        rounds: led.roundsLed ?? defender.roundsFought,
        kills: (stacks.reduce((a, s) => a + s.totalLosses, 0) * (led.roundsLed ?? defender.roundsFought)) / Math.max(1, defender.roundsFought),
        won: !attackerWon && defender.count > 0 && !led.away,
        finaleKills: breaks.reduce((a, e) => a + (e.broke?.length ?? 0), 0)
      },
      `the walls of ${bRow.target_name}`,
      now
    );
    if (got && got.renown > 0) out.push({ userId: led.userId, name: got.name, renown: got.renown, levelAfter: got.levelAfter });
  }
  if (out.length) {
    report.championRenown = out;
    report.combatLog?.push(...out.map((c) => `🦸 ${c.name} earns ${c.renown} Renown (level ${c.levelAfter}).`));
  }
}

/** Step 2 of war tick: advance every active battle whose `next_round_at <= now` */
function tickActiveBattles(now: number): BattleReport[] {
  const battles = db.prepare(`SELECT * FROM battles WHERE status = 'fighting' AND next_round_at <= ? ORDER BY started_at ASC`).all(now) as any[];
  const reports: BattleReport[] = [];

  for (const listed of battles) {
    const report = db.transaction((): BattleReport | null => {
      // Read the battle afresh: an earlier battle this tick may have changed it (a ruler ascending rescales their stacks)
      const bRow = db.prepare(`SELECT * FROM battles WHERE id = ? AND status = 'fighting'`).get(listed.id) as any;
      if (!bRow) return null;
      const stacks: LiveAttackerStack[] = JSON.parse(bRow.stacks_json || "[]");
      const defender: LiveDefenderState = JSON.parse(bRow.defender_json);
      const rounds = JSON.parse(bRow.rounds_json || "[]");
      const log: string[] = JSON.parse(bRow.log_json || "[]");

      // Filter stacks to those still in 'acting' phase (in case a ruler recalled their army)
      const actingMarchIds = new Set(
        (db.prepare(`SELECT id FROM active_marches WHERE battle_id = ? AND status = 'marching' AND phase = 'acting'`).all(bRow.id) as Array<{ id: string }>).map(
          (m) => m.id
        )
      );
      const presentStacks = stacks.filter((s) => actingMarchIds.has(s.marchId) && s.count > 0);
      // A march that left (recalled, fell back, wiped out) is out for good: no plunder, hoard carry or gems at the end
      for (const s of stacks) if (!presentStacks.includes(s)) s.left = true;

      if (presentStacks.length === 0) {
        // Every attacker left: the battle closes, and gatherers it paused go back to work as after a raid they held
        db.prepare(`UPDATE battles SET status = 'done', stacks_json = ? WHERE id = ?`).run(JSON.stringify(stacks), bRow.id);
        bandsLeaveTheWalls(bRow.id);
        if (defender.gather) resumeGatherers(defender.gather.marchId, now);
        return null;
      }

      const nextRound = (bRow.round || 0) + 1;
      const rng = seededRandom(`${bRow.id}_r${nextRound}`);

      let wallDmgThisRound = 0;
      // Where this round's lines start in the log (repeats among them are folded once the round is told)
      let roundFrom = log.length;
      if (totalDefenders(defender) > 0) {
        attachRulerBuffs(bRow, presentStacks, defender, log);
        // 🩸 A Blood Moon touches every round fought inside its window, from the first one in it to its end
        const omen = battleOmenAt(now);
        if (Boolean(omen) !== Boolean(defender.bloodMoon)) {
          const wild = defender.unit && defender.npc && defender.npc.category !== "kingdom" && !defender.gather;
          log.push(
            omen
              ? `${DISASTERS.blood_moon.emblem} The Blood Moon rises over the battle${wild ? `: ${defender.npc!.unitName} fight with +${Math.round((omen.npcStatMult - 1) * 100)}% HP, ATK and DEF` : ""}.`
              : `${DISASTERS.blood_moon.emblem} The Blood Moon sets; the battle fights on under a plain sky.`
          );
          defender.bloodMoon = omen ? true : undefined;
        }
        const step = stepBattleRound(nextRound, presentStacks, defender, rng, omen, bRow.id);
        if (omen) {
          const bm = disasterAt(now);
          for (const s of presentStacks) {
            if (s.band) continue;
            tallyDisaster(bm, s.civ, "rounds", 1);
            tallyDisaster(bm, s.civ, "fallen", step.stackLosses[s.marchId] ?? 0);
          }
        }
        // 🪙 Bands among the attackers: their share of the round's losses, shown as −% of the band
        const bandRows = presentStacks.filter((s) => s.band).map((s) => ({ marchId: s.marchId, name: s.attackerName, lost: step.stackLosses[s.marchId] ?? 0, fullCount: s.band!.fullCount }));
        if (bandRows.length) step.roundSummary.bands = bandRows;
        rounds.push(step.roundSummary);
        wallDmgThisRound += step.wallDamage;

        roundFrom = log.length;
        log.push(
          `⚔️ Round ${nextRound}: attackers deal ${step.roundSummary.attackerDamage.toLocaleString()}${step.defenderLosses > 0 ? ` (−${step.defenderLosses.toLocaleString()} defenders)` : ""}, defenders deal ${step.roundSummary.defenderDamage.toLocaleString()}${step.roundSummary.attackerLosses > 0 ? ` (−${step.roundSummary.attackerLosses.toLocaleString()} attackers)` : ""}.`,
          ...(step.roundSummary.arts ?? []).map(artEventLine)
        );
        applyArtHeals(bRow, presentStacks, defender, step.healed);

        // Persist attacker casualties per stack immediately
        for (const s of presentStacks) {
          const lost = step.stackLosses[s.marchId] ?? 0;
          db.prepare(`UPDATE active_marches SET soldiers_count = ? WHERE id = ?`).run(s.count, s.marchId);
          // 🦸 The army a champion led is wiped out: it falls, wounded, and is carried home
          if (s.champion && s.count <= 0 && !s.championFell) {
            s.championFell = true;
            woundChampion(s.attackerId, bRow.target_name, s.marchId, now);
            log.push(`🦸 ${s.champion.name} falls with the last of ${s.attackerName}'s army and is carried from the field, wounded.`);
          }
          // 🪙 A band loses strength, not citizens: at 0% it is dead
          if (s.band) {
            if (lost > 0) {
              setBandStrength(s.band.id, s.count, s.band.fullCount, { place: bRow.target_name, now });
              const pctLost = Math.max(1, Math.round((lost / s.band.fullCount) * 100));
              log.push(s.count > 0 ? `🪙 ${s.attackerName} loses ${pctLost}% of its strength (${Math.round((s.count / s.band.fullCount) * 100)}% left).` : `💀 ${s.attackerName} is wiped out.`);
            }
            continue;
          }
          // 🌙 Elves: of the fallen so far a share are carried home wounded; only the rest die
          if (hasMoonwell(s.civ)) {
            const r = settleWounds({ userId: s.attackerId, civ: s.civ, rowId: `${bRow.id}:${s.marchId}`, place: bRow.target_name, tally: s, now });
            if (r.died !== 0 || r.wounded !== 0) {
              const u = getUser(s.attackerId);
              recordPopulationLedger({
                userId: s.attackerId,
                type: "battle",
                deaths: Math.max(0, r.died),
                soldiersDelta: -(r.died + r.wounded),
                populationDelta: -r.died,
                populationBalance: u?.population ?? 0,
                soldiersBalance: (u?.soldiers ?? 0) + soldiersAwayOf(s.attackerId),
                reason: `Round ${nextRound} at ${bRow.target_name}: ${woundsText(r)}`
              });
            }
            continue;
          }
          if (lost > 0) {
            if (s.civ === "arcane") {
              db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?), void_well = COALESCE(void_well, 0) + ? WHERE id = ?`).run(
                lost,
                lost,
                s.attackerId
              );
            } else {
              db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?) WHERE id = ?`).run(lost, s.attackerId);
            }
            const u = getUser(s.attackerId);
            recordPopulationLedger({
              userId: s.attackerId,
              type: "battle",
              deaths: lost,
              soldiersDelta: -lost,
              populationDelta: -lost,
              populationBalance: u?.population ?? 0,
              soldiersBalance: (u?.soldiers ?? 0) + soldiersAwayOf(s.attackerId),
              reason: `Round ${nextRound} at ${bRow.target_name}: ${lost} soldiers fell`
            });
          }
        }

        // 🦸 The home garrison a champion led is wiped out: it falls too
        if (defender.championLed && !defender.championLed.fell && !defender.championLed.away && defender.count <= 0 && bRow.target_type === "dev_kingdom") {
          defender.championLed.fell = true;
          woundChampion(defender.championLed.userId, bRow.target_name, null, now);
          log.push(`🦸 ${defender.championLed.name} falls on the walls with the last of the garrison and is carried inside, wounded.`);
        }

        // Reinforcements' losses come out of their own rulers' populations
        for (const g of defender.reinforcements ?? []) {
          const lost = step.groupLosses[g.marchId] ?? 0;
          // 🌙 An elf group settles every round (an Art may have brought some of its fallen back)
          if (!g.band && hasMoonwell(g.civ)) {
            if (lost > 0 || (step.healed[g.marchId] ?? 0) > 0) applyReinforcementLosses(g, lost, bRow.target_name, nextRound, bRow.id);
            continue;
          }
          if (lost <= 0) continue;
          // 🪙 A band's losses are its strength (wiped out, it dies)
          if (g.band) setBandStrength(g.band.id, g.count, g.band.fullCount, { place: bRow.target_name, now });
          else applyReinforcementLosses(g, lost, bRow.target_name, nextRound);
        }

        // Persist home-garrison casualties immediately
        if (step.homeLosses > 0) {
          if (bRow.target_type === "npc" && defender.gather) {
            applyGathererLosses(defender, step.homeLosses, bRow.target_name, nextRound);
          } else if (bRow.target_type === "npc" && defender.boss) {
            // The boss's HP is persisted below, every round
          } else if (bRow.target_type === "npc" && defender.npc?.category === "kingdom") {
            applyNpcKingdomLosses(bRow.target_id, step.homeLosses, now);
          } else if (bRow.target_type === "npc") {
            // A mob / bandit pack is persisted below, every round (partial wounds too)
          } else if (bRow.target_type === "spire") {
            db.prepare(`UPDATE nethergarde_spires SET garrison = MAX(0, COALESCE(garrison, 0) - ?), last_attacked_at = ?, updated_at = datetime('now') WHERE id = ?`).run(
              step.homeLosses,
              now,
              bRow.target_id
            );
          } else if (hasMoonwell(defender.civ)) {
            // 🌙 Elves: the garrison loses them all; the Moonwell settles who died (below)
            db.prepare(`UPDATE users SET soldiers = MAX(0, COALESCE(soldiers, 0) - ?) WHERE id = ?`).run(step.homeLosses, bRow.target_id);
          } else {
            if (defender.civ === "arcane") {
              db.prepare(
                `UPDATE users SET soldiers = MAX(0, COALESCE(soldiers, 0) - ?), population = MAX(0, COALESCE(population, 0) - ?), void_well = COALESCE(void_well, 0) + ? WHERE id = ?`
              ).run(step.homeLosses, step.homeLosses, step.homeLosses, bRow.target_id);
            } else {
              db.prepare(`UPDATE users SET soldiers = MAX(0, COALESCE(soldiers, 0) - ?), population = MAX(0, COALESCE(population, 0) - ?) WHERE id = ?`).run(
                step.homeLosses,
                step.homeLosses,
                bRow.target_id
              );
            }
            const d = getUser(bRow.target_id);
            recordPopulationLedger({
              userId: bRow.target_id,
              type: "battle",
              deaths: step.homeLosses,
              soldiersDelta: -step.homeLosses,
              populationDelta: -step.homeLosses,
              populationBalance: d?.population ?? 0,
              soldiersBalance: (d?.soldiers ?? 0) + soldiersAwayOf(bRow.target_id),
              reason: `Defense of ${bRow.target_name} (Round ${nextRound}): ${step.homeLosses} defenders fell`
            });
          }
        }

        // 🌙 An elf ruler's home garrison: of its fallen so far a share are carried inside wounded; only the rest die
        if (bRow.target_type === "dev_kingdom" && hasMoonwell(defender.civ) && (step.homeLosses > 0 || (step.healed.home ?? 0) > 0)) {
          const r = settleWounds({ userId: bRow.target_id, civ: defender.civ, rowId: `${bRow.id}:home`, place: bRow.target_name, tally: defender, now });
          if (r.died !== 0 || r.wounded !== 0) {
            const d = getUser(bRow.target_id);
            recordPopulationLedger({
              userId: bRow.target_id,
              type: "battle",
              deaths: Math.max(0, r.died),
              soldiersDelta: -(r.died + r.wounded),
              populationDelta: -r.died,
              populationBalance: d?.population ?? 0,
              soldiersBalance: (d?.soldiers ?? 0) + soldiersAwayOf(bRow.target_id),
              reason: `Defense of ${bRow.target_name} (Round ${nextRound}): ${woundsText(r)}`
            });
          }
        }

        // Shared world: a mob / bandit pack stays weakened for everyone, wounds that killed no whole unit included
        if (bRow.target_type === "npc" && defender.npc && !defender.gather && !defender.boss && defender.npc.category !== "kingdom") {
          setPackRemaining({ id: bRow.target_id, category: defender.npc.category }, defender.count - defender.carryDamageTaken, now);
        }

        // World boss: its HP is shared by the realm and every army's damage counts toward the bounty
        if (defender.boss) {
          for (const s of presentStacks) addBossDamage(bRow.target_id, defender.boss.lifeKey, s.attackerId, s.attackerName, step.stackDamageDealt[s.marchId] ?? 0);
          if (defender.count > 0) setBossHp(bRow.target_id, bossHpOf(defender), defender.boss, now);
        }
      } else {
        // Unguarded city (0 defenders, e.g. swarm wave after breach while wall > 25%)
        const totalAtt = presentStacks.reduce((sum, s) => sum + s.count, 0);
        for (const s of presentStacks) s.roundsFought += 1;
        rounds.push({
          round: nextRound,
          attackerDamage: 0,
          defenderDamage: 0,
          attackerLosses: 0,
          defenderLosses: 0,
          attackerRemaining: totalAtt,
          defenderRemaining: 0
        });
      }

      // Check if any stack has reached MAX_ROUNDS (exhausted) and must retreat
      const defendersLeft = totalDefenders(defender);
      const exhaustedStacks = presentStacks.filter((s) => s.count > 0 && s.roundsFought >= maxRoundsOf(s) && defendersLeft > 0);
      // One line per ruler's soldiers and per band ("Jane Doe's 2 armies have fought 6 rounds and fall back.")
      const fallingBack = new Map<string, { name: string; band: boolean; n: number; rounds: number }>();
      for (const ex of exhaustedStacks) {
        const key = `${ex.band ? ex.attackerName : ex.attackerId}|${maxRoundsOf(ex)}`;
        const g = fallingBack.get(key) ?? { name: ex.attackerName, band: Boolean(ex.band), n: 0, rounds: maxRoundsOf(ex) };
        g.n += 1;
        fallingBack.set(key, g);
        sendMarchReturning(ex.marchId, now, null, null);
      }
      for (const g of fallingBack.values()) {
        const who = g.band ? (g.n > 1 ? `${g.name} (${g.n} bands)` : g.name) : g.n > 1 ? `${g.name}'s ${g.n} armies` : `${g.name}'s army`;
        log.push(`⏳ ${who} ${g.n > 1 ? "have" : "has"} fought ${g.rounds} rounds and ${g.n > 1 ? "fall" : "falls"} back.`);
      }
      log.splice(roundFrom, Infinity, ...foldRepeats(log.slice(roundFrom)));

      const remainingActiveStacks = presentStacks.filter((s) => s.count > 0 && (defendersLeft === 0 || s.roundsFought < maxRoundsOf(s)));
      const totalSurvivingAttackers = presentStacks.reduce((sum, s) => sum + s.count, 0);
      const attackerWon = defendersLeft <= 0 && totalSurvivingAttackers > 0;

      // Apply wall damage (round defender kills + end-of-battle attacker breach damage if battle ends)
      const battleEndsSearching = attackerWon || remainingActiveStacks.length === 0;
      if (attackerWon) {
        wallDmgThisRound += totalSurvivingAttackers * WALL_DMG_PER_ATTACKER;
      }
      // NPC kingdoms fight behind walls; packs, bosses and gatherers in the open
      const openField = bRow.target_type === "npc" && defender.npc?.category !== "kingdom";
      const wallUpdate = openField
        ? { wallHpBefore: 0, wallHpAfter: 0, wallMaxHp: 0, burning: false }
        : applyWallDamage(bRow.target_type, bRow.target_id, wallDmgThisRound, now);

      // If wall drops <= 25% mid-battle, city catches fire and battle ends after this round
      const battleEnds = battleEndsSearching || wallUpdate.burning;

      if (!battleEnds) {
        // Battle continues: schedule next round in BATTLE_ROUND_MS (10s)
        db.prepare(`
          UPDATE battles
          SET round = ?, next_round_at = ?, defender_json = ?, stacks_json = ?, rounds_json = ?, log_json = ?
          WHERE id = ?
        `).run(nextRound, now + BATTLE_ROUND_MS, JSON.stringify(defender), JSON.stringify(stacks), JSON.stringify(rounds), JSON.stringify(log), bRow.id);
        return null;
      }

      // Battle has ended! Finalize outcome, War Frenzy, Plunder / Ascension, and send surviving stacks home
      moonwellLogLines(stacks, defender, bRow.target_type, log);
      db.prepare(`UPDATE battles SET round = ?, defender_json = ?, stacks_json = ?, rounds_json = ?, log_json = ?, status = 'done' WHERE id = ?`).run(
        nextRound,
        JSON.stringify(defender),
        JSON.stringify(stacks),
        JSON.stringify(rounds),
        JSON.stringify(log),
        bRow.id
      );
      bandsLeaveTheWalls(bRow.id);

      const leadStack = stacks[0];
      const totalInitialAttackers = stacks.reduce((sum, s) => sum + s.initialCount, 0);
      const totalAttackerLosses = stacks.reduce((sum, s) => sum + s.totalLosses, 0);

      // War Frenzy only between rulers' civilizations (never Special Overseers, NPCs or bosses)
      const overseer = bRow.target_type === "dev_kingdom" && isSpecialUser(getUser(bRow.target_id) ?? {});
      if (bRow.target_type === "dev_kingdom" && !overseer) {
        for (const s of stacks) {
          recordWarFrenzy(s.civ, defender.civ, now);
        }
      }

      const finalReport: BattleReport = {
        id: bRow.id,
        marchId: leadStack?.marchId,
        timestamp: new Date(now).toISOString(),
        attackerId: leadStack?.attackerId ?? "",
        attackerName: stacks.length > 1 ? `${rulerNameOf(leadStack, stacks)} (+${stacks.length - 1})` : leadStack?.attackerName ?? "Attackers",
        attackerCiv: leadStack?.civ ?? "human",
        defenderId: bRow.target_id,
        defenderName: bRow.target_name,
        defenderCiv: defender.civ,
        targetType: bRow.target_type,
        attackerInitialSoldiers: totalInitialAttackers,
        attackerCasualties: totalAttackerLosses,
        defenderInitialSoldiers: totalDefendersInitial(defender),
        defenderCasualties: totalDefenderLosses(defender),
        ...woundedTotals(stacks, defender, bRow.target_type),
        attackerWon,
        usurpedSlot: false,
        armies: [
          ...stacks.map((st) => ({
            side: "attacker" as const,
            ownerId: st.attackerId,
            name: st.attackerName,
            civ: st.civ,
            initial: st.initialCount,
            losses: st.totalLosses,
            ...(st.wounded ? { wounded: st.wounded } : {}),
            joinedRound: st.joinedRound,
            atkBonusPct: st.atkBonusMult ? Math.round((st.atkBonusMult - 1) * 100) : 0,
            ...(st.band ? { band: { rarity: st.band.rarity as MarchBand["rarity"], emblem: st.band.emblem, fullCount: st.band.fullCount, ...(st.count <= 0 ? { dead: true } : {}) } } : {}),
            ...(st.armory ? { armory: { rarity: st.armory.rarity as ArmoryRarity, name: st.armory.name, emblem: st.armory.emblem } } : {}),
            ...(st.champion ? { champion: { name: st.champion.name, level: st.champion.level, ...(st.championFell ? { fell: true } : {}) } } : {})
          })),
          ...(defender.reinforcements ?? []).map((g) => ({
            side: "defender" as const,
            ownerId: g.ownerId,
            name: g.band ? g.ownerName : `${g.ownerName} (reinforcement)`,
            civ: g.civ,
            initial: g.initialCount,
            losses: g.totalLosses,
            ...(g.wounded ? { wounded: g.wounded } : {}),
            ...(g.band ? { band: { rarity: g.band.rarity as MarchBand["rarity"], emblem: g.band.emblem, fullCount: g.band.fullCount, ...(g.count <= 0 ? { dead: true } : {}) } } : {})
          }))
        ],
        participants: [
          ...new Set([...stacks.map((st) => st.attackerId), ...(defender.reinforcements ?? []).map((g) => g.ownerId), ...(defender.gather ? [defender.gather.ownerId] : [])])
        ],
        loot: null,
        rounds,
        combatLog: log,
        wallHpBefore: wallUpdate.wallHpBefore,
        wallHpAfter: wallUpdate.wallHpAfter,
        wallMaxHp: wallUpdate.wallMaxHp,
        defenderBurning: wallUpdate.burning,
        defenderGrudgeStacks: defender.grudgeStacks,
        ...(defender.championLed ? { defenderChampion: { name: defender.championLed.name, level: defender.championLed.level, ...(defender.championLed.fell ? { fell: true } : {}) } } : {})
      };
      settleChampions(bRow, stacks, defender, rounds, attackerWon, wallUpdate.burning, finalReport, now);

      if (openField && defender.gather) {
        return finishGathererBattle(bRow, defender, stacks, attackerWon, finalReport, log, now);
      }
      if (openField && defender.boss) {
        return finishBossBattle(bRow, defender, stacks, finalReport, log, now);
      }
      if (openField) {
        return finishWorldNpcBattle(bRow, defender, stacks, attackerWon, finalReport, log, now);
      }
      if (bRow.target_type === "npc") {
        return finishNpcKingdomBattle(bRow, defender, stacks, attackerWon, finalReport, log, wallUpdate.burning, now);
      }

      if (bRow.target_type === "spire") {
        const spire = db.prepare(`SELECT * FROM nethergarde_spires WHERE id = ?`).get(bRow.target_id) as any;
        const npc = spire ? voidNpcFor(spire.slot_index) : null;
        if (npc) finalReport.defenderMaxGarrison = spire.max_garrison ?? npc.maxGarrison;

        // Only a mortal ruler claims a slot (one who ascended mid-battle by another slot already holds one)
        const winner = attackerWon && spire && npc ? presentStacks.find((s) => s.count > 0 && rulerCivOf(s.attackerId) !== "arcane") : undefined;
        if (attackerWon && spire && npc && !winner) {
          log.push(`🌀 The garrison of ${finalReport.defenderName} is broken, but no mortal ruler is left to claim the slot. The armies fall back.`);
          for (const s of stacks) sendMarchReturning(s.marchId, now, null, finalReport);
        } else if (attackerWon && spire && npc && winner) {
          const winnerCiv = rulerCivOf(winner.attackerId) ?? winner.civ;
          finalReport.usurpedSlot = true;
          finalReport.civilizationSwapped = true;
          finalReport.newAttackerCiv = "arcane";
          finalReport.loot = npc.loot;

          db.prepare(`UPDATE nethergarde_spires SET occupied_by_dev_id = ?, garrison = NULL, wall_hp = NULL, wall_updated_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(
            winner.attackerId,
            spire.id
          );
          ascendAttacker(winner.attackerId, winnerCiv, true);
          pendingRehomes.add(winner.attackerId);
          log.push(`🏆 The garrison of ${finalReport.defenderName} is broken! ${winner.attackerName} claims Voidrift slot ${spire.slot_index} and ascends to Nethergarde.`);
          log.push(`🌀 ${winner.attackerName}'s castle and victorious army are pulled through the rift into the Voidrift.`);

          for (const s of stacks) {
            const carry = s.marchId === winner.marchId ? npc.loot : null;
            if (s.attackerId === winner.attackerId) teleportMarchHome(s.marchId, now, carry, finalReport);
            else sendMarchReturning(s.marchId, now, carry, finalReport);
          }
        } else {
          if (wallUpdate.burning) {
            log.push(`🔥 ${finalReport.defenderName}'s wards catch fire (≤ 25% wall HP); the besieging armies retreat.`);
          } else {
            log.push(`🛡️ ${finalReport.defenderName} holds with ${defender.count.toLocaleString()} void weavers. The survivors fall back.`);
          }
          for (const s of stacks) {
            sendMarchReturning(s.marchId, now, null, finalReport);
          }
        }
        return saveReport(finalReport);
      }

      // Target is a developer kingdom
      const defUser = getUser(bRow.target_id);
      if (attackerWon && defUser) {
        // The usurper: the first surviving army of a mortal ruler (a ruler is judged by their civilization now, not the one their army set off with)
        const winner = presentStacks.find((s) => s.count > 0 && rulerCivOf(s.attackerId) !== "arcane");
        const winnerCiv = winner ? (rulerCivOf(winner.attackerId) ?? winner.civ) : null;

        // Special Overseers hold no Voidrift slot: a defeat only strengthens their Resolve
        if (overseer) {
          const stacksNow = grudgeStacksOf(defUser, now) + 1;
          db.prepare(`UPDATE users SET grudge_stacks = ?, grudge_week_key = ? WHERE id = ?`).run(stacksNow, weekWindow(now).weekKey, defUser.id);
          log.push(`🔱 ${finalReport.defenderName}'s Resolve rises to ×${stacksNow} (+${Math.round(OVERSEER_GRUDGE_PER_DEFEAT * stacksNow * 100)}% HP, ATK and DEF until Sunday).`);
        }

        // If a mortal ruler defeats a Nethergarde developer kingdom, usurp their Voidrift slot!
        if (defender.civ === "arcane" && winner && winnerCiv && !overseer) {
          finalReport.usurpedSlot = true;
          finalReport.civilizationSwapped = true;
          finalReport.newAttackerCiv = "arcane";
          finalReport.newDefenderCiv = winnerCiv;

          const level = defUser.city_hall_level ?? 1;
          const converted = convertPopulationOnSwap({
            currentPop: defUser.population ?? 0,
            currentSoldiers: defUser.soldiers ?? 0,
            oldCiv: "arcane",
            oldLevel: level,
            newCiv: winnerCiv,
            newLevel: level,
            isCombatDefeat: true
          });
          db.prepare(`UPDATE users SET civilization = ?, population = ?, soldiers = ?, max_population = ?, void_well = 0, updated_at = datetime('now') WHERE id = ?`).run(
            winnerCiv,
            converted.newPopulation,
            converted.newSoldiers,
            calculateMaxPopulation(level, winnerCiv),
            defUser.id
          );
          recordPopulationLedger({
            userId: defUser.id,
            type: "civ_swap",
            deaths: defender.totalLosses,
            populationBalance: converted.newPopulation,
            soldiersBalance: converted.newSoldiers,
            reason: `Cast out of Nethergarde by ${winner.attackerName} (arcane → ${winnerCiv})`
          });

          db.prepare(`UPDATE nethergarde_spires SET occupied_by_dev_id = ? WHERE occupied_by_dev_id = ?`).run(winner.attackerId, defUser.id);
          ascendAttacker(winner.attackerId, winnerCiv, false);
          pendingRehomes.add(winner.attackerId);
          pendingRehomes.add(defUser.id);
          log.push(`🔄 ${winner.attackerName} takes the Void throne; ${finalReport.defenderName} is cast down to become ${winnerCiv}.`);
          log.push(`🌀 Both castles teleport: ${winner.attackerName}'s victorious army goes with theirs into the Voidrift.`);
        }
        const teleported = finalReport.civilizationSwapped && winner ? winner.attackerId : null;

        // Plunder by surviving troop load for each surviving attacking stack
        const combinedLoot: BattleLoot = {};
        for (const s of stacks) {
          let carry: BattleLoot | null = null;
          if (s.count > 0 && !s.left) {
            carry = plunderDefenderTreasury(defUser.id, defUser.city_hall_level ?? 1, s.attackerName, s.count, s.civ);
            if (carry) {
              for (const k of ["gold", "iron", "stone", "lumber", "food"] as const) {
                if (carry[k]) combinedLoot[k] = (combinedLoot[k] ?? 0) + carry[k]!;
              }
            }
          }
          if (s.attackerId === teleported) teleportMarchHome(s.marchId, now, carry, finalReport);
          else sendMarchReturning(s.marchId, now, carry, finalReport);
        }
        if (Object.keys(combinedLoot).length > 0) {
          finalReport.loot = combinedLoot;
          const summary = Object.entries(combinedLoot)
            .map(([k, v]) => `${(v as number).toLocaleString()} ${k}`)
            .join(", ");
          log.push(`💰 Plundered ${summary} (carried home by surviving troops).`);
        } else {
          log.push(`🛡️ ${finalReport.defenderName}'s remaining resources were inside the protected vault.`);
        }
        if (wallUpdate.burning) {
          log.push(`🔥 ${finalReport.defenderName}'s walls are breached and burning (${wallUpdate.wallHpAfter.toLocaleString()} / ${wallUpdate.wallMaxHp.toLocaleString()} HP)!`);
        }
      } else {
        if (wallUpdate.burning) {
          log.push(`🔥 ${finalReport.defenderName}'s walls drop below 25% HP and catch fire — ceasefire protection forces the attackers to retreat.`);
        } else {
          log.push(`🛡️ ${finalReport.defenderName}'s garrison repels the siege.`);
        }
        for (const s of stacks) {
          sendMarchReturning(s.marchId, now, null, finalReport);
        }
      }

      return saveReport(finalReport);
    })();

    if (report) reports.push(report);
  }

  return reports;
}

/** 🌙 A battle's wounded per side, for the report (only when some elf army was carried home wounded) */
function woundedTotals(stacks: LiveAttackerStack[], defender: LiveDefenderState, targetType: string): { attackerWounded?: number; defenderWounded?: number } {
  const att = stacks.reduce((sum, s) => sum + (s.band ? 0 : s.wounded ?? 0), 0);
  const def = (targetType === "dev_kingdom" ? defender.wounded ?? 0 : 0) + (defender.reinforcements ?? []).reduce((sum, g) => sum + (g.band ? 0 : g.wounded ?? 0), 0);
  return { ...(att > 0 ? { attackerWounded: att } : {}), ...(def > 0 ? { defenderWounded: def } : {}) };
}

/** 🌙 The battle log's closing word on each elf army's wounded */
function moonwellLogLines(stacks: LiveAttackerStack[], defender: LiveDefenderState, targetType: string, log: string[]) {
  const line = (name: string, n?: number) => n && n > 0 && log.push(`🌙 ${n.toLocaleString()} of ${name}'s fallen are carried home wounded to the Moonwell (a few rejoin the garrison at every harvest).`);
  for (const s of stacks) if (!s.band) line(s.attackerName, s.wounded);
  if (targetType === "dev_kingdom") line(defender.name ?? "the garrison", defender.wounded);
  for (const g of defender.reinforcements ?? []) if (!g.band) line(g.ownerName, g.wounded);
}

/** Step 3 of war tick: complete `returning` marches whose `return_time <= now` */
function completeReturningMarches(now: number): boolean {
  const returning = db
    .prepare(`SELECT * FROM active_marches WHERE status = 'marching' AND phase = 'returning' AND return_time IS NOT NULL AND return_time <= ?`)
    .all(now) as any[];
  if (returning.length === 0) return false;

  db.transaction(() => {
    for (const row of returning) {
      const survivors = Math.max(0, row.soldiers_count || 0);
      // 🪙 A band is home with what is left of it
      if (row.band_id) {
        if (survivors > 0) bandHome(row.band_id, survivors, (JSON.parse(row.band_json) as MarchBand).fullCount);
      } else if (survivors > 0 && row.civilian !== 1) {
        // Civilian workers just go back to the fields
        db.prepare(`UPDATE users SET soldiers = MIN(COALESCE(population, 0), COALESCE(soldiers, 0) + ?) WHERE id = ?`).run(survivors, row.attacker_id);
        // 🗡️ The survivors hang their sets back in the armory (the fallen's were lost on the field)
        setsHome(row.attacker_id, row.armory_json, survivors);
      }
      if (row.carry_json) {
        try {
          const loot = JSON.parse(row.carry_json) as BattleLoot;
          const isGather = row.kind === "gather";
          const type = isGather ? "gathering_haul" : "battle_loot";
          const defaultReason = isGather
            ? `Gatherers returned home with yield from ${row.target_name}`
            : `Army returned home with spoils from ${row.target_name}`;
          creditCarriedLootOnReturn(row.attacker_id, loot, row.target_name, defaultReason, type);
        } catch {
          // Ignore malformed carry_json
        }
      }
      db.prepare(`UPDATE active_marches SET phase = 'done', status = 'resolved' WHERE id = ?`).run(row.id);
    }
  })();

  // Gathering titles move when a haul is banked
  pendingTitlePromotions.push(...recalculateTitlesFor(returning.filter((r) => r.kind === "gather" && r.carry_json).map((r) => r.attacker_id as string)));
  return true;
}

/** Resolve all arrived marches, tick live battle rounds, and complete returning marches */
export function resolvePendingMarches(now = Date.now(), kingdoms: DeveloperKingdom[] = getAllKingdomsFromDB()): { reports: BattleReport[]; changed: boolean } {
  launchDueRallies(now, kingdoms);
  sendForeignReinforcementsHome(now);
  sendOverflowReinforcementsHome(now);
  const arrivedReports = handleArrivedOutboundMarches(now, kingdoms);
  const battleReports = tickActiveBattles(now);
  completeGatheringMarches(now);
  const returned = completeReturningMarches(now);
  const reports = [...arrivedReports, ...battleReports];
  return { reports, changed: reports.length > 0 || returned };
}

/**
 * The war tick (every MARCH.RESOLVE_TICK_MS and on GET /marches): advance marches & live battles,
 * log completed battles, and refresh in-memory kingdoms and spires when state changes.
 */
export function runWarTick(kingdoms: DeveloperKingdom[], log: (text: string, type: "war") => void): BattleReport[] {
  const { reports, changed } = resolvePendingMarches(Date.now(), kingdoms);
  if (!changed) return reports;

  for (const r of reports) {
    const outcome = r.attackerWon ? (r.usurpedSlot ? "Victory — the Voidrift slot falls!" : "Victory!") : "Repelled.";
    const swap = r.civilizationSwapped ? ` 🔄 ${r.attackerName} ascends to Nethergarde${r.newDefenderCiv ? `; ${r.defenderName} is cast down as ${r.newDefenderCiv}` : ""}.` : "";
    const burn = r.defenderBurning ? ` 🔥 ${r.defenderName} is burning!` : "";
    // 🪙 A lone band's losses are strength
    const solo = r.armies?.filter((a) => a.side === "attacker") ?? [];
    const band = solo.length === 1 ? solo[0].band : undefined;
    const attLoss = band ? (r.attackerCasualties > 0 ? `−${Math.max(1, Math.round((r.attackerCasualties / band.fullCount) * 100))}%` : "−0%") : String(r.attackerCasualties);
    log(`⚔️ ${r.attackerName} vs ${r.defenderName}: ${outcome} Losses ${attLoss} / ${r.defenderCasualties}.${swap}${burn}`, "war");
  }
  kingdoms.splice(0, kingdoms.length, ...getAllKingdomsFromDB());
  rehomeSwappedMarches(kingdoms);
  syncNethergardeSpires(kingdoms, true);
  for (const p of pendingTitlePromotions.splice(0)) {
    const name = kingdoms.find((k) => k.id === p.userId)?.name ?? p.userId;
    log(`🎖️ ${name} earns the title ${p.title.emblem} ${p.title.name}!`, "war");
  }
  return reports;
}

/** Titles reached by battles and gathering hauls since the last war tick, announced in the Chronicle */
const pendingTitlePromotions: TitlePromotion[] = [];

function saveReport(report: BattleReport): BattleReport {
  db.prepare(`
    INSERT INTO battle_reports (
      id, timestamp, attacker_id, attacker_name, attacker_civ, defender_id, defender_name, defender_civ, target_type,
      attacker_initial_soldiers, attacker_casualties, defender_initial_soldiers, defender_casualties, attacker_won, usurped_slot, details_json, participants
    ) VALUES (
      @id, @timestamp, @attackerId, @attackerName, @attackerCiv, @defenderId, @defenderName, @defenderCiv, @targetType,
      @attackerInitialSoldiers, @attackerCasualties, @defenderInitialSoldiers, @defenderCasualties, @attackerWon, @usurpedSlot, @detailsJson, @participants
    )
  `).run({
    id: report.id,
    timestamp: report.timestamp,
    attackerId: report.attackerId,
    attackerName: report.attackerName,
    attackerCiv: report.attackerCiv,
    defenderId: report.defenderId,
    defenderName: report.defenderName,
    defenderCiv: report.defenderCiv,
    targetType: report.targetType,
    attackerInitialSoldiers: report.attackerInitialSoldiers,
    attackerCasualties: report.attackerCasualties,
    defenderInitialSoldiers: report.defenderInitialSoldiers,
    defenderCasualties: report.defenderCasualties,
    attackerWon: report.attackerWon ? 1 : 0,
    usurpedSlot: report.usurpedSlot ? 1 : 0,
    detailsJson: JSON.stringify(report),
    participants: `,${[...new Set([report.attackerId, report.defenderId, ...(report.participants ?? [])])].join(",")},`
  });
  // Kill and boss titles move with every battle
  pendingTitlePromotions.push(...recalculateTitlesFor([report.attackerId, report.defenderId, ...(report.participants ?? [])]));
  return report;
}

/** Recent battle reports, newest first; with `userId` only battles that kingdom fought */
export function getRecentBattleReports(limit = 20, userId?: string): BattleReport[] {
  const rows = userId
    ? db
        .prepare(`SELECT details_json FROM battle_reports WHERE attacker_id = ? OR defender_id = ? OR participants LIKE ? ORDER BY timestamp DESC LIMIT ?`)
        .all(userId, userId, `%,${userId},%`, limit)
    : db.prepare(`SELECT details_json FROM battle_reports ORDER BY timestamp DESC LIMIT ?`).all(limit);
  return (rows as Array<{ details_json: string }>).map((r) => JSON.parse(r.details_json));
}
