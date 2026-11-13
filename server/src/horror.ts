import { db, getKingdomResources, spendResources, xpOnRealmDay } from "./db.js";
import { config } from "./env.js";
import { createBroadcast, markBroadcastsRead, recordRealmEvent } from "./broadcasts.js";
import { dateKeyIn } from "./disasterRules.js";
import { HORROR, clearestSpot, horrorDaysFor, horrorGateSpots, horrorStartSpots, type MapSpot, horrorPosition, horrorRewardMult, horrorStatsFor, validHorrorLevel, isHorrorId } from "./horrorRules.js";
import { PROTECTED_TREASURY_PER_LEVEL } from "./warConfig.js";
import { getOrGenerateFlatWorldMap, mapOccupancy, registerMapOccupants } from "./worldMapGenerator.js";
import { weekWindow } from "./realmTime.js";
import type { DeveloperKingdom, HorrorStatus, MapNPC } from "./types.js";

/**
 * Xal'Vorath, the Overseers' Wrath (GAME_GUIDE §15 *Wrath*, §13 *The Horror*): its table, the Wrath decree, the clock
 * that brings it to the gates (a minute at a time) and the notices. On the map it is a world boss that walks: the war
 * engine fights it through the same boss battles, and worldNpcs.ts reads its HP and stats from here. The numbers and
 * pure rules are in horrorRules.ts.
 */

const NAME = "Xal'Vorath";
const FULL_NAME = "Xal'Vorath, the Devouring Singularity";
const EMBLEM = "🌑";
export const HORROR_TYPE = "mythic-singularity";

db.exec(`
  -- 🌑 Xal'Vorath: one row per horror sent; phase approach → siege → repelled | slain | burned | called_off
  CREATE TABLE IF NOT EXISTS overseer_horrors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_name TEXT NOT NULL,
    level INTEGER NOT NULL,
    -- How many kingdoms the Wrath named: its stats and rewards are shared out among them
    split INTEGER NOT NULL DEFAULT 1,
    started_at INTEGER NOT NULL,
    arrives_at INTEGER NOT NULL,
    siege_ends_at INTEGER NOT NULL,
    from_x REAL NOT NULL,
    from_z REAL NOT NULL,
    gate_x REAL NOT NULL,
    gate_z REAL NOT NULL,
    -- The three realm-time days whose work can drive it back
    days_json TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'approach',
    hp INTEGER NOT NULL,
    max_hp INTEGER NOT NULL,
    atk INTEGER NOT NULL,
    def INTEGER NOT NULL,
    ended_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_overseer_horrors_phase ON overseer_horrors(phase);
  CREATE INDEX IF NOT EXISTS idx_overseer_horrors_sender ON overseer_horrors(sender_id, started_at);
`);

// The castle it came for, so at the gates it faces the walls wherever it had to stop
// …and when the horror clock last looked at it, so a server that slept through part of the siege hour gives it back
for (const col of ["castle_x", "castle_z", "checked_at"]) {
  try {
    db.exec(`ALTER TABLE overseer_horrors ADD COLUMN ${col} REAL`);
  } catch {
    /* already there */
  }
}

interface HorrorRow {
  id: number;
  sender_id: string;
  target_id: string;
  target_name: string;
  level: number;
  split: number;
  started_at: number;
  arrives_at: number;
  siege_ends_at: number;
  from_x: number;
  from_z: number;
  gate_x: number;
  gate_z: number;
  days_json: string;
  phase: "approach" | "siege" | "repelled" | "slain" | "burned" | "called_off";
  hp: number;
  max_hp: number;
  atk: number;
  def: number;
  ended_at: number | null;
  castle_x: number | null;
  castle_z: number | null;
  checked_at: number | null;
}

const npcIdOf = (id: number) => `${HORROR.NPC_PREFIX}${id}`;
const rowIdOf = (npcId: string) => Number(npcId.slice(HORROR.NPC_PREFIX.length));
const rowById = (id: number) => db.prepare(`SELECT * FROM overseer_horrors WHERE id = ?`).get(id) as HorrorRow | undefined;
const rowOf = (npcId: string) => rowById(rowIdOf(npcId));
const activeRows = () => db.prepare(`SELECT * FROM overseer_horrors WHERE phase IN ('approach', 'siege') ORDER BY id`).all() as HorrorRow[];
const isOut = (r: HorrorRow) => r.phase === "approach" || r.phase === "siege";

const fmt = (n: number) => n.toLocaleString("en-US");

function waitLabel(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.ceil(min / 60);
  return h < 48 ? `${h} h` : `${Math.ceil(h / 24)} days`;
}

/** The kingdom's XP on each of its three days, as /status tells it */
function daysOf(r: HorrorRow) {
  return (JSON.parse(r.days_json) as string[]).map((day) => {
    const xp = xpOnRealmDay(r.target_id, day);
    return { day, xp: Math.round(xp * 10) / 10, met: xp >= HORROR.XP_PER_DAY };
  });
}

function npcOf(r: HorrorRow, now: number): MapNPC {
  const at = horrorPosition({ x: r.from_x, z: r.from_z }, { x: r.gate_x, z: r.gate_z }, r.started_at, r.arrives_at, now, r.id);
  // It marches at the city, so it looks at the city the whole way
  const heading = r.castle_x !== null && r.castle_z !== null ? Math.atan2(r.castle_x - at.x, r.castle_z - at.z) : at.heading;
  return {
    id: npcIdOf(r.id),
    name: FULL_NAME,
    type: HORROR_TYPE,
    category: "boss",
    rarity: "mythical",
    emblem: EMBLEM,
    subtitle: `The Overseers' Wrath · Level ${r.level}`,
    description:
      r.phase === "siege"
        ? `It waits at the gates of ${r.target_name}'s kingdom. Bring it down before the hour is out, or it burns the city.`
        : `It crawls toward the gates of ${r.target_name}'s kingdom. Only a kingdom that works every day can drive it back.`,
    x: Math.round(at.x * 100) / 100,
    z: Math.round(at.z * 100) / 100,
    region: r.phase === "siege" ? `At the gates of ${r.target_name}'s kingdom` : `On the road to ${r.target_name}'s kingdom`,
    horrorPhase: r.phase === "siege" ? "siege" : "approach",
    horrorHeading: Math.round(heading * 100) / 100
  };
}

/* ------------------------------------------------------------------------- */
/* What the map, the boss code and /status read                               */
/* ------------------------------------------------------------------------- */

/** Every horror out in the realm, as map NPCs */
export const horrorNpcs = (now = Date.now()): MapNPC[] => activeRows().map((r) => npcOf(r, now));

/** A horror by NPC id, whatever became of it: an army on the road finds it gone and turns back through the boss code */
export function findHorrorNpc(npcId: string, now = Date.now()): MapNPC | null {
  const r = rowOf(npcId);
  return r ? npcOf(r, now) : null;
}

/** The boss code's view of it: its HP carries over between battles, and once its story is over it can't be fought */
export function horrorBossState(npcId: string) {
  const r = rowOf(npcId);
  const lifeKey = `horror:${rowIdOf(npcId)}`;
  if (!r) return { hp: 0, maxHp: 1, dead: true, respawnAt: null, weekKey: "horror", lifeKey };
  return { hp: isOut(r) ? Math.max(1, Math.min(r.max_hp, r.hp)) : 0, maxHp: r.max_hp, dead: !isOut(r), respawnAt: null, weekKey: "horror", lifeKey };
}

export function horrorStats(npcId: string) {
  const r = rowOf(npcId);
  return { hp: r?.max_hp ?? 1, atk: r?.atk ?? 0, def: r?.def ?? 0 };
}

/** Called after each round of a battle on it */
export function setHorrorHp(npcId: string, hp: number) {
  db.prepare(`UPDATE overseer_horrors SET hp = ? WHERE id = ? AND phase IN ('approach', 'siege')`).run(Math.max(1, Math.round(hp)), rowIdOf(npcId));
}

/** It has fallen: its story is over */
export function markHorrorSlain(npcId: string, now = Date.now()) {
  db.prepare(`UPDATE overseer_horrors SET hp = 0, phase = 'slain', ended_at = ? WHERE id = ?`).run(now, rowIdOf(npcId));
}

/** × a world boss's hoard and bounty */
export function horrorRewards(npcId: string): { mult: number; level: number; targetName: string; targetId: string } {
  const r = rowOf(npcId);
  return { mult: r ? horrorRewardMult(r.level, r.split) : 1, level: r?.level ?? 1, targetName: r?.target_name ?? "", targetId: r?.target_id ?? "" };
}

/**
 * Why this ruler can't march on it now (null: they can). Only in the siege hour, and only the kingdom it came for and
 * rulers of that kingdom's civilization: an attack or a rally alike
 */
export function horrorAttackBlock(npcId: string, attacker: Pick<DeveloperKingdom, "id" | "civilization">, kingdoms: DeveloperKingdom[], now = Date.now()): string | null {
  const r = rowOf(npcId);
  if (!r || !isOut(r)) return `${NAME} is gone.`;
  if (r.phase === "approach") return `${NAME} is still on the road. It can be fought once it reaches the gates of ${r.target_name}'s kingdom, in about ${waitLabel(r.arrives_at - now)}.`;
  const target = kingdoms.find((k) => k.id === r.target_id);
  if (attacker.id !== r.target_id && attacker.civilization !== target?.civilization) return `${NAME} came for ${r.target_name}'s kingdom: only that kingdom and rulers of its civilization can march on it.`;
  return null;
}

/** /status → `horrors`: every horror out in the realm, with the target's work so far */
export function horrorStatuses(now = Date.now()): HorrorStatus[] {
  const today = dateKeyIn(now, config.realmTimezone);
  return activeRows().map((r) => {
    const days = daysOf(r);
    const dayIndex = days.findIndex((d) => d.day === today);
    return {
      id: r.id,
      npcId: npcIdOf(r.id),
      targetId: r.target_id,
      targetName: r.target_name,
      level: r.level,
      split: r.split,
      phase: r.phase as HorrorStatus["phase"],
      startedAt: r.started_at,
      arrivesAt: r.arrives_at,
      siegeEndsAt: r.siege_ends_at,
      hp: r.hp,
      maxHp: r.max_hp,
      days,
      // Before its first day -1, past its last the number of days
      dayIndex: dayIndex >= 0 ? dayIndex : today < days[0].day ? -1 : days.length
    };
  });
}

/** Part of the roving key: clients refetch the map's NPCs when a horror comes, moves a step or goes */
export const horrorKey = (now = Date.now()) => activeRows().map((r) => `${r.id}:${r.phase}:${Math.floor(now / HORROR.MOVE_STEP_MS)}`).join(",");

/* ------------------------------------------------------------------------- */
/* 🌑 Wrath: sending it                                                        */
/* ------------------------------------------------------------------------- */

const namesList = (names: string[]) => (names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** When this sender may send Xal'Vorath again (0: now): once a week, the Sunday 00:00 UTC week */
export function wrathReadyAt(senderId: string, now = Date.now()): number {
  const { startsAt, resetsAt } = weekWindow(now);
  const sent = db.prepare(`SELECT 1 FROM overseer_horrors WHERE sender_id = ? AND started_at >= ? LIMIT 1`).get(senderId, startsAt);
  return sent ? resetsAt : 0;
}

/**
 * Footprints a titan shouldn't stand on: what stays on the map (castles, free realms, fixed NPCs, walls, landmarks, the
 * scenery sites, the Void Gate, the Voidrift slots) and other horrors unless left out. Resource nodes and roving spawns
 * come and go within its 3-day road, so they keep clear of it instead.
 */
export function horrorBlockers(kingdoms: DeveloperKingdom[], opts: { horrors?: boolean } = {}, now = Date.now()): MapSpot[] {
  const horrors = opts.horrors === false ? horrorSpots(now) : [];
  const isHorror = (o: MapSpot) => horrors.some((h) => h.x === o.x && h.z === o.z && h.r === o.r);
  // What passes (the window's packs and nodes, the day's nodes) is left out: they make way for the titan, not it for them
  const map = getOrGenerateFlatWorldMap(kingdoms);
  const passing = new Set(map.npcs.filter((n) => n.category === "resource").map((n) => `${n.x},${n.z}`));
  return mapOccupancy(kingdoms, now, now, map).filter((o) => !isHorror(o) && !passing.has(`${o.x},${o.z}`));
}

/** Where every horror out in the realm stands at `at`, and the gate spot it is walking to */
function horrorSpots(at: number): MapSpot[] {
  return activeRows().flatMap((r) => {
    const p = npcOf(r, at);
    return [
      { x: p.x, z: p.z, r: HORROR.FOOTPRINT },
      { x: r.gate_x, z: r.gate_z, r: HORROR.FOOTPRINT }
    ];
  });
}

// Xal'Vorath stands on the map: the window's spawns keep clear of where it was when their window began, and of its gate
registerMapOccupants(false, (at) => {
  try {
    return horrorSpots(at);
  } catch {
    return [];
  }
});

/** A clear start and a clear stop for one horror; both are added to `blockers`, so the next one stands apart */
export function placeHorror(castle: { x: number; z: number }, blockers: MapSpot[]) {
  const from = clearestSpot(horrorStartSpots(castle), blockers);
  // Its own castle (and a Voidrift citadel on the same spot) is what it comes to stand beside
  const gate = clearestSpot(horrorGateSpots(castle), blockers.filter((b) => Math.hypot(b.x - castle.x, b.z - castle.z) > 0.5));
  blockers.push({ ...from, r: HORROR.FOOTPRINT }, { ...gate, r: HORROR.FOOTPRINT });
  return { from, gate };
}

/**
 * The horrors themselves, one per target, each at the stats ÷ the number of targets, and the notices. `sendWrath` is
 * the decree; the dev script comes in here (`approachMs` shortens the road)
 */
export function launchHorrors(params: { senderId: string; targets: DeveloperKingdom[]; level: number; kingdoms: DeveloperKingdom[]; approachMs?: number; now?: number }) {
  const { senderId, targets, level, kingdoms } = params;
  const now = params.now ?? Date.now();
  const placements = getOrGenerateFlatWorldMap(kingdoms).kingdomPlacements;
  const approachMs = params.approachMs ?? HORROR.APPROACH_MS;
  const stats = horrorStatsFor(level, targets.length);
  const days = horrorDaysFor(now, config.realmTimezone);
  const insert = db.prepare(`
    INSERT INTO overseer_horrors (sender_id, target_id, target_name, level, split, started_at, arrives_at, siege_ends_at, from_x, from_z, gate_x, gate_z, days_json, hp, max_hp, atk, def, castle_x, castle_z)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const blockers = horrorBlockers(kingdoms, {}, now);
  db.transaction(() => {
    for (const k of targets) {
      const at = placements[k.id];
      if (!at) throw new Error(`${k.name}'s kingdom has no place on the world map yet.`);
      const { from, gate } = placeHorror(at, blockers);
      insert.run(senderId, k.id, k.name, level, targets.length, now, now + approachMs, now + approachMs + HORROR.SIEGE_MS, from.x, from.z, gate.x, gate.z, JSON.stringify(days), stats.hp, stats.hp, stats.atk, stats.def, at.x, at.z);
    }
  })();

  const names = targets.map((k) => k.name);
  const when = new Date(now);
  const eventId = recordRealmEvent("decree_wrath", senderId, targets.length === 1 ? targets[0].id : null, { level, targets: names, split: targets.length, arrivesAt: now + approachMs }, when);
  const publicId = createBroadcast({
    kind: "horror_event",
    title: `${NAME} stirs: it turns toward ${namesList(names)}`,
    body: [
      `The Overseers have loosed their wrath. Level ${level}${targets.length > 1 ? `, split among ${targets.length} kingdoms` : ""}, it crawls across the realm and reaches the gates in ${waitLabel(approachMs)}.`,
      "",
      "Only a kingdom that works every day can drive it back. If it arrives, that kingdom and its civilization have one hour to bring it down."
    ].join("\n"),
    emblem: EMBLEM,
    audience: "all",
    eventId,
    now: when
  });
  createBroadcast({
    kind: "horror_event",
    title: `${NAME} is coming for your kingdom`,
    body: [
      `It reaches your gates in ${waitLabel(approachMs)}. Earn at least ${HORROR.XP_PER_DAY} XP on each of these days and it is driven back when it arrives (commits, pull requests, reviews and sealed deeds all count):`,
      ...days.map((d, i) => `• Day ${i + 1}: ${d}`),
      "",
      `Miss a day and it waits at your gates for one hour. You and the rulers of your civilization can attack it or rally on it. If it still stands when the hour is out, your walls fall to nothing and it devours ${Math.round(HORROR.TREASURY_DEVOURED * 100)}% of your treasury above the vault.`
    ].join("\n"),
    emblem: EMBLEM,
    audience: "users",
    recipients: targets.map((k) => k.id),
    eventId,
    now: when
  });
  for (const k of targets) markBroadcastsRead(k.id, [publicId]);
}

/** ⛈️ The Wrath decree: admins, Special Overseers and the Archon (the route checks), once a week each, at one or more kingdoms */
export function sendWrath(params: { actorId: string; targetIds: unknown; level: unknown; kingdoms: DeveloperKingdom[] }) {
  const { actorId, kingdoms } = params;
  const readyAt = wrathReadyAt(actorId);
  if (readyAt) throw new Error(`You have sent Xal'Vorath already this week. You can send it again in about ${waitLabel(readyAt - Date.now())}.`);
  const level = validHorrorLevel(params.level);
  const ids = [...new Set(Array.isArray(params.targetIds) ? params.targetIds.map(String) : [])];
  if (ids.length === 0) throw new Error("Pick at least one kingdom.");
  if (ids.length > HORROR.MAX_TARGETS) throw new Error(`One Wrath can name at most ${HORROR.MAX_TARGETS} kingdoms.`);
  const out = activeRows();
  if (out.length + ids.length > HORROR.MAX_TARGETS) throw new Error(`The realm can bear only ${HORROR.MAX_TARGETS} of them at once, and ${out.length} ${out.length === 1 ? "is" : "are"} out already.`);
  const hunted = new Set(out.map((r) => r.target_id));
  const targets = ids.map((id) => {
    const k = kingdoms.find((x) => x.id === id);
    if (!k) throw new Error("Kingdom not found.");
    if (k.isSpecial || k.isArchon) throw new Error(`${k.name} is beyond the Overseers' wrath.`);
    if (hunted.has(k.id)) throw new Error(`${NAME} is already coming for ${k.name}'s kingdom.`);
    return k;
  });
  launchHorrors({ senderId: actorId, targets, level, kingdoms });
  return { message: `${NAME} (Level ${level}) turns toward ${namesList(targets.map((k) => k.name))}.` };
}

/** Called off: it sinks back into the rift, and the sender's week stays spent */
export function liftWrath(actorId: string, horrorId: unknown) {
  const r = rowById(Number(horrorId));
  if (!r || !isOut(r)) throw new Error(`That ${NAME} is not out in the realm.`);
  const now = Date.now();
  db.prepare(`UPDATE overseer_horrors SET phase = 'called_off', ended_at = ? WHERE id = ?`).run(now, r.id);
  const eventId = recordRealmEvent("decree_lift_wrath", actorId, r.target_id, { level: r.level, targetName: r.target_name }, new Date(now));
  createBroadcast({
    kind: "horror",
    title: `${NAME} is called back from ${r.target_name}'s kingdom`,
    body: "By the Overseers' word it sinks back into the rift.",
    emblem: EMBLEM,
    audience: "all",
    createdBy: actorId,
    eventId,
    now: new Date(now)
  });
  return { message: `${NAME} was called back from ${r.target_name}'s kingdom.` };
}

/** The Wrath panel: when this sender may send it again, and who it is coming for */
export function wrathOverview(actorId: string, now = Date.now()) {
  return { readyAt: wrathReadyAt(actorId, now), maxTargets: HORROR.MAX_TARGETS, active: horrorStatuses(now) };
}

/* ------------------------------------------------------------------------- */
/* The clock                                                                  */
/* ------------------------------------------------------------------------- */

function repel(r: HorrorRow, now: number) {
  db.prepare(`UPDATE overseer_horrors SET phase = 'repelled', ended_at = ? WHERE id = ?`).run(now, r.id);
  const eventId = recordRealmEvent("horror_repelled", null, r.target_id, { targetName: r.target_name, level: r.level }, new Date(now));
  createBroadcast({
    kind: "horror",
    title: `${NAME} is driven back from ${r.target_name}'s kingdom`,
    body: `It reached the gates and found a kingdom that had not stopped working for three days. Driven back by the kingdom's diligence, it comes apart on the wind.`,
    emblem: EMBLEM,
    audience: "all",
    eventId,
    now: new Date(now)
  });
}

function arrive(r: HorrorRow, now: number) {
  // The server slept through its arrival: the kingdom still gets its whole hour
  const siegeEndsAt = now - r.arrives_at > 5 * 60_000 ? now + HORROR.SIEGE_MS : r.siege_ends_at;
  db.prepare(`UPDATE overseer_horrors SET phase = 'siege', siege_ends_at = ? WHERE id = ?`).run(siegeEndsAt, r.id);
  const eventId = recordRealmEvent("horror_arrived", null, r.target_id, { targetName: r.target_name, level: r.level, siegeEndsAt }, new Date(now));
  createBroadcast({
    kind: "horror_event",
    title: `${NAME} stands at the gates of ${r.target_name}'s kingdom`,
    body: `It burns the city in one hour unless it is brought down. ${r.target_name} and the rulers of their civilization can march on it or raise a rally. It keeps its wounds from one battle to the next.`,
    emblem: EMBLEM,
    audience: "all",
    expiresAt: new Date(siegeEndsAt),
    eventId,
    now: new Date(now)
  });
}

/** Walls to nothing (burning, so the usual protection follows) and a share of the treasury above the vault floor */
function burn(r: HorrorRow, kingdoms: DeveloperKingdom[], now: number) {
  const k = kingdoms.find((x) => x.id === r.target_id);
  const devoured: Record<string, number> = {};
  if (k) {
    const floor = PROTECTED_TREASURY_PER_LEVEL * Math.max(1, k.cityHallLevel);
    const res = getKingdomResources(k.id);
    for (const key of ["gold", "iron", "stone", "lumber", "food"] as const) {
      const take = Math.floor(Math.max(0, (res[key] ?? 0) - floor) * HORROR.TREASURY_DEVOURED);
      if (take > 0) devoured[key] = take;
    }
    if (Object.keys(devoured).length) spendResources(k.id, devoured, "horror_devoured", `${NAME} devoured the treasury`);
    db.prepare(`UPDATE users SET wall_hp = 0, wall_updated_at = ? WHERE id = ?`).run(now, k.id);
  }
  db.prepare(`UPDATE overseer_horrors SET phase = 'burned', ended_at = ? WHERE id = ?`).run(now, r.id);
  const lost = Object.entries(devoured).map(([key, n]) => `${fmt(n)} ${key}`).join(", ");
  const eventId = recordRealmEvent("horror_burned", null, r.target_id, { targetName: r.target_name, level: r.level, devoured }, new Date(now));
  createBroadcast({
    kind: "horror",
    title: `${NAME} burns ${r.target_name}'s kingdom`,
    body: [`The hour ran out and it still stood at the gates. The walls are gone and the city burns.`, lost ? `It devoured ${lost}.` : "", "Then it sank back into the rift."].filter(Boolean).join("\n"),
    emblem: EMBLEM,
    audience: "all",
    eventId,
    now: new Date(now)
  });
}

/** True when a road's start no longer stands on the rift's start ring (laid out under older rules or at another world scale) */
const offStartRing = (r: HorrorRow) => !HORROR.START_RADII.some((radius) => Math.abs(Math.hypot(r.from_x - HORROR.HEART.x, r.from_z - HORROR.HEART.z) - radius) < 0.6);

/**
 * A horror whose castle moved (the map grew, or the castles were laid out afresh), or whose start is off the rift's start
 * ring, gets its road laid again by today's rules: a fresh start on the Nethergarde side and a gate beside the castle where
 * it stands now. Its clock stays, so it walks on from the same share of its road. On the road both ends move; at the gates
 * only the gate, and only if the castle moved. True when a road changed.
 */
function relayHorrorRoads(kingdoms: DeveloperKingdom[], now: number): boolean {
  const placements = getOrGenerateFlatWorldMap(kingdoms).kingdomPlacements;
  const stale = activeRows().filter((r) => {
    const at = placements[r.target_id];
    if (!at) return false;
    const moved = r.castle_x === null || r.castle_z === null || Math.hypot(at.x - r.castle_x, at.z - r.castle_z) > 0.5;
    return moved || (r.phase === "approach" && offStartRing(r));
  });
  if (!stale.length) return false;
  const blockers = horrorBlockers(kingdoms, { horrors: false }, now);
  const update = db.prepare(`UPDATE overseer_horrors SET from_x = ?, from_z = ?, gate_x = ?, gate_z = ?, castle_x = ?, castle_z = ? WHERE id = ?`);
  db.transaction(() => {
    for (const r of stale) {
      const at = placements[r.target_id];
      const { from, gate } = placeHorror(at, blockers);
      const keepStart = r.phase !== "approach";
      update.run(keepStart ? r.from_x : from.x, keepStart ? r.from_z : from.z, gate.x, gate.z, at.x, at.z, r.id);
    }
  })();
  console.log(`🌑 Xal'Vorath's road laid again for ${stale.length} horror${stale.length === 1 ? "" : "s"} (the map changed under it)`);
  return true;
}

/** A gap this long between two looks of the clock means the server was down in between */
const SLEPT_MS = 5 * 60_000;

/**
 * Every minute (and on start): a horror whose road is over is repelled or stands at the gates; one whose hour is out
 * burns the kingdom, once the battles still being fought on it are done. True when something changed.
 * `judgeArrivals: false` (after a start, until the first Git sync has read the work done while the server was down)
 * leaves arrivals waiting, so a kingdom is never judged on work the realm hasn't read yet.
 */
export function tickHorrors(kingdoms: DeveloperKingdom[], now = Date.now(), opts: { judgeArrivals?: boolean } = {}): boolean {
  let changed = relayHorrorRoads(kingdoms, now);
  const judgeArrivals = opts.judgeArrivals ?? true;
  const checked = db.prepare(`UPDATE overseer_horrors SET checked_at = ? WHERE id = ?`);
  for (const r of activeRows()) {
    if (!kingdoms.some((k) => k.id === r.target_id)) {
      db.prepare(`UPDATE overseer_horrors SET phase = 'called_off', ended_at = ? WHERE id = ?`).run(now, r.id);
      changed = true;
      continue;
    }
    if (r.phase === "approach" && now >= r.arrives_at) {
      if (!judgeArrivals) continue;
      if (daysOf(r).every((d) => d.met)) repel(r, now);
      else arrive(r, now);
      changed = true;
    } else if (r.phase === "siege" && now >= r.siege_ends_at && r.checked_at !== null && now - r.checked_at > SLEPT_MS && r.siege_ends_at - r.checked_at > 0) {
      // The server slept through the end of the hour: the time that was left when it last looked is given back
      const siegeEndsAt = now + Math.min(HORROR.SIEGE_MS, r.siege_ends_at - r.checked_at);
      db.prepare(`UPDATE overseer_horrors SET siege_ends_at = ? WHERE id = ?`).run(siegeEndsAt, r.id);
      console.log(`🌑 ${NAME} at ${r.target_name}'s gates: the server slept through the siege hour, ${Math.round((siegeEndsAt - now) / 60_000)} min of it given back`);
      changed = true;
    } else if (r.phase === "siege" && now >= r.siege_ends_at) {
      const fighting = db.prepare(`SELECT 1 FROM battles WHERE target_id = ? AND status = 'fighting' LIMIT 1`).get(npcIdOf(r.id));
      if (fighting) {
        checked.run(now, r.id);
        continue;
      }
      burn(r, kingdoms, now);
      changed = true;
      continue;
    }
    checked.run(now, r.id);
  }
  return changed;
}

/** Dev script: bring a horror's arrival or the end of its hour forward to now (the running server's clock acts on it) */
export function hurryHorror(now = Date.now()) {
  const rows = activeRows();
  for (const r of rows) {
    if (r.phase === "approach") db.prepare(`UPDATE overseer_horrors SET arrives_at = ?, siege_ends_at = ?, checked_at = ? WHERE id = ?`).run(now, now + HORROR.SIEGE_MS, now, r.id);
    else db.prepare(`UPDATE overseer_horrors SET siege_ends_at = ?, checked_at = ? WHERE id = ?`).run(now, now, r.id);
  }
  return rows.length;
}

export { isHorrorId };
