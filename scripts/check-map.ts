/**
 * Spacing check for the world map (GAME_GUIDE §10 *Dynamic World Spawns*): loads the saved map (server/data/world_map.json)
 * with the realm's rulers, builds every layer of spawns (today's resource nodes, then a run of wave and roving windows)
 * and fails on any two things standing closer than their footprints (rA + rB), on any spawn off the board, and on any
 * two horrors' spots that overlap. It also tries Xal'Vorath's start and gate spots for every castle and reports the
 * ones that find no clear ground.
 *
 *   npm run check:map          16 roving windows from now
 *   npm run check:map -- 64    64 windows
 */
import "../server/src/env.js";
import { getAllKingdomsFromDB, db } from "../server/src/db.js";
import "../server/src/warEngine.js"; // registers the Voidrift slots on the map's occupancy list
import { horrorBlockers } from "../server/src/horror.js";
import { HORROR, horrorGateSpots, horrorStartSpots } from "../server/src/horrorRules.js";
import { gateWallPoints, getOrGenerateFlatWorldMap, getRovingSpawns, rovingWindowMinutes, skippedSpawns } from "../server/src/worldMapGenerator.js";
import { FOOTPRINT, PLAY_HALF, footprintOf, roomAt } from "../server/src/worldGeometry.js";

type Thing = { id: string; x: number; z: number; r: number; fixed?: boolean };

const windows = Math.max(1, Number(process.argv[2]) || 16);
const kingdoms = getAllKingdomsFromDB();
const map = getOrGenerateFlatWorldMap(kingdoms);
const archon = kingdoms.find((k) => k.isArchon);

const fixed: Thing[] = [
  ...Object.entries(map.kingdomPlacements)
    .filter(([id]) => kingdoms.some((k) => k.id === id))
    .map(([id, p]) => ({ id: `castle:${id}`, ...p, r: FOOTPRINT.castle, fixed: true })),
  ...map.npcs.map((n) => ({ id: n.id, x: n.x, z: n.z, r: footprintOf(n), fixed: n.category !== "resource" })),
  ...gateWallPoints(map.npcs).map((p, i) => ({ id: `wall:${i}`, ...p, r: FOOTPRINT.wall, fixed: true })),
  ...(map.scenery ?? []).map((p, i) => ({ id: `scenery:${i}`, ...p, r: FOOTPRINT.scenery, fixed: true })),
  ...(db.prepare(`SELECT id, coord_x AS x, coord_z AS z FROM nethergarde_spires WHERE occupied_by_dev_id IS NULL`).all() as Array<{ id: string; x: number; z: number }>).map((s) => ({
    id: `slot:${s.id}`,
    x: s.x,
    z: s.z,
    r: FOOTPRINT.voidSlot,
    fixed: true
  }))
];

/** Pairs the map lays out by hand: the Archon's citadel on the Core, a wall's own points, a gate and its own wall */
const exempt = (a: Thing, b: Thing) => {
  const ids = [a.id, b.id];
  if (archon && ids.includes(`castle:${archon.id}`) && ids.includes("npc-void-monolith")) return true;
  if (a.id.startsWith("wall:") && b.id.startsWith("wall:")) return true;
  if ((a.id.startsWith("wall:") && b.id.startsWith("npc-gate-")) || (b.id.startsWith("wall:") && a.id.startsWith("npc-gate-"))) return true;
  return false;
};

const problems = new Set<string>();
function checkPairs(things: Thing[], label: string) {
  for (let i = 0; i < things.length; i++) {
    const a = things[i];
    if (Math.abs(a.x) > PLAY_HALF || Math.abs(a.z) > PLAY_HALF) problems.add(`${label}: ${a.id} stands off the board at (${a.x}, ${a.z})`);
    for (let j = i + 1; j < things.length; j++) {
      const b = things[j];
      // Two fixed things were checked once already (the first window)
      if (a.fixed && b.fixed && label !== "window 0") continue;
      if (exempt(a, b)) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < a.r + b.r - 0.05) problems.add(`${label}: ${a.id} and ${b.id} are ${d.toFixed(1)} apart (need ${(a.r + b.r).toFixed(1)})`);
    }
  }
}

const now = Date.now();
const step = rovingWindowMinutes() * 60_000;
const skipped: Record<string, number> = {};
let spawned = 0;
for (let w = 0; w < windows; w++) {
  const t = now + w * step;
  const roving = getRovingSpawns(kingdoms, t).npcs;
  spawned += roving.length;
  for (const [layer, n] of Object.entries(skippedSpawns)) skipped[layer] = (skipped[layer] ?? 0) + n;
  checkPairs([...fixed, ...roving.map((n) => ({ id: n.id, x: n.x, z: n.z, r: footprintOf(n) }))], `window ${w}`);
}

// Xal'Vorath: a clear start and gate spot for every castle, each on its own (as a lone Wrath would place it)
const crowded: string[] = [];
const blockers = horrorBlockers(kingdoms, {}, now);
const clear = (spots: Array<{ x: number; z: number }>, around: typeof blockers) => spots.some((p) => roomAt(around, p.x, p.z, HORROR.FOOTPRINT) >= 0);
let castles = 0;
for (const k of kingdoms) {
  const at = map.kingdomPlacements[k.id];
  if (!at || k.isArchon) continue;
  castles++;
  // Its own castle (and a Voidrift citadel on the same spot) is what it comes to stand beside
  const around = blockers.filter((b) => Math.hypot(b.x - at.x, b.z - at.z) > 0.5);
  if (!clear(horrorStartSpots(at), blockers) || !clear(horrorGateSpots(at), around)) crowded.push(k.id);
}

// Horrors out in the realm now: none on another's spot
const horrorSpots = (db.prepare(`SELECT id, from_x, from_z, gate_x, gate_z FROM overseer_horrors WHERE phase IN ('approach', 'siege')`).all() as any[]).flatMap((h) => [
  { id: `horror:${h.id}:start`, x: h.from_x, z: h.from_z, r: HORROR.FOOTPRINT },
  { id: `horror:${h.id}:gate`, x: h.gate_x, z: h.gate_z, r: HORROR.FOOTPRINT }
]);
checkPairs(horrorSpots, "horrors");

console.log(`🗺️ ${fixed.length} fixed things, ${spawned} roving spawns over ${windows} windows`);
for (const [layer, n] of Object.entries(skipped)) if (n) console.log(`   ${n} ${layer} skipped for want of room (summed over the windows)`);
if (crowded.length) console.log(`⚠️ Xal'Vorath finds no clear start or gate spot beside ${crowded.length} of ${castles} castles (crowded provinces): it takes the roomiest spot there`);
if (problems.size) {
  for (const p of problems) console.error(`❌ ${p}`);
  console.error(`\n${problems.size} spacing problem(s).`);
  process.exit(1);
}
console.log("✅ Nothing on the map stands on anything else.");
