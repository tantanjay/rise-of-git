import { FlatWorldMapData, MapNPC } from "@/types";
import { mulberry32, range } from "@/utils/random";
import { Builder, IDLE_KIND, SceneOut, emptyScene } from "@/components/3d/city/parts";
import { FORGE_VENTS, LAVA_FISSURES, RIVER_FROM_Z, RegionKind, SEA_LEVEL, Terrain, riverX } from "./terrain";
import { GATE_MODEL_TYPES, GATE_WALL_SPAN, gateCiv, gateWallArc, gateWallPoints } from "./gates";

/** How likely a vegetation/rock prop is per sample, by dominant region */
const DENSITY: Record<RegionKind, number> = {
  forest: 0.85,
  elf: 0.35,
  dwarf: 0.22,
  mountains: 0.22,
  human: 0.08,
  orc: 0.07,
  desert: 0.05,
  arcane: 0.06,
  sea: 0
};

/** The two strongest regions at a point, and how strong the second is (a region's edge) */
function dominant(w: Record<RegionKind, number>): { kind: RegionKind; edge: number } {
  let best: RegionKind = "human";
  let bestW = -1;
  let second = 0;
  for (const k in w) {
    const v = w[k as RegionKind];
    if (v > bestW) {
      second = Math.max(second, bestW);
      bestW = v;
      best = k as RegionKind;
    } else second = Math.max(second, v);
  }
  return { kind: best, edge: bestW > 0 ? second / bestW : 0 };
}

// Bark and wood
const BARK = "#4a3322";
const OAK_BARK = "#5b3b25";
const BIRCH_BARK = "#e5e2da";
const WILLOW_BARK = "#5b4a35";
const CHARRED = "#2a1d15";
const PALM_BARK = "#8a6f4a";
const CACTUS = "#3f7d3a";
// Leaves (the season tints these: seasonTint WORLD_FOLIAGE)
const PINE_DARK = "#1f5f2a";
const PINE_DEEP = "#2d7a36";
const PINE_HIGH = "#2f5d3a";
const PINE_HIGH_LIGHT = "#3f6f45";
const OAK_LEAF = "#3f8f3a";
const BIRCH_LEAF = "#5a9e3c";
const WILLOW_LEAF = "#5d8a3a";
const ELF_LEAF = "#2fa37a";
// Evergreen fronds keep their colour
const PALM_FROND = "#4d8c2a";

/** A part laid at tilt `a` (radians, leaning toward local +x) from its foot at (x, y): Builder places by the unrotated
 * height, so its y0 is worked out from where its centre must be */
function leaning(b: Builder, shape: "trunk", x: number, y: number, a: number, w: number, len: number, color: string) {
  b.add(shape, x + (Math.sin(a) * len) / 2, y + (Math.cos(a) * len) / 2 - len / 2, 0, w, len, w, color, { rz: -a });
  return { x: x + Math.sin(a) * len, y: y + Math.cos(a) * len };
}

/** Every part added since `from` sways as one tree, bending from its foot (and with the wind's gusts in HD) */
function swaying(out: SceneOut, from: number, b: Builder, v: () => number) {
  const phase = v() * Math.PI * 2;
  for (let i = from; i < out.parts.length; i++) out.parts[i].idle = { x: b.ox, y: b.oy, z: b.oz, kind: IDLE_KIND.sway, phase };
}

/** A conifer: a short flared trunk under three drooping tiers */
function pine(b: Builder, s: number, leaf: string, v: () => number, wide = 1) {
  b.add("trunk", 0, 0, 0, 0.34 * s, 0.9 * s, 0.34 * s, BARK);
  b.add("pine", 0, 0.42 * s, 0, 1.45 * s * wide, 2.3 * s * range(v, 0.9, 1.15), 1.45 * s * wide, leaf, { ry: v() * 6.28 });
}

/** A broad oak: a stout trunk under a billowing crown of three or four clumps */
function oak(b: Builder, k: number, leaf: string, v: () => number) {
  b.add("trunk", 0, 0, 0, 0.42 * k, 1.2 * k, 0.42 * k, OAK_BARK);
  b.add("canopy", 0, 0.75 * k, 0, 1.8 * k, 1.45 * k, 1.7 * k, leaf, { ry: v() * 6.28 });
  const n = v() < 0.5 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const a = v() * Math.PI * 2;
    b.add("canopy", Math.cos(a) * 0.6 * k, (0.6 + v() * 0.5) * k, Math.sin(a) * 0.6 * k, 1.1 * k, 0.95 * k, 1.05 * k, leaf, { ry: v() * 6.28 });
  }
}

/** A birch: a slim pale trunk, a light narrow crown */
function birch(b: Builder, k: number, v: () => number) {
  b.add("trunk", 0, 0, 0, 0.2 * k, 1.9 * k, 0.2 * k, BIRCH_BARK);
  b.add("canopy", 0, 0.95 * k, 0, 1.0 * k, 1.6 * k, 1.0 * k, BIRCH_LEAF, { ry: v() * 6.28 });
  b.add("canopy", 0.25 * k, 1.75 * k, -0.1 * k, 0.7 * k, 0.75 * k, 0.65 * k, BIRCH_LEAF, { ry: v() * 6.28 });
}

/** A weeping willow by the water: a leaning trunk under a dome of leaves that hangs almost to the ground */
function willow(b: Builder, k: number, v: () => number) {
  const top = leaning(b, "trunk", 0, 0, range(v, 0.12, 0.28), 0.44 * k, 1.35 * k, WILLOW_BARK);
  b.add("canopy", top.x * 0.85, 0.3 * k, 0, 2.3 * k, 2.0 * k, 2.1 * k, WILLOW_LEAF, { ry: v() * 6.28 });
}

/** One to three boulders lying together, the first the biggest */
function boulders(b: Builder, k: number, colors: [string, string], v: () => number) {
  const n = 1 + Math.floor(v() * 3);
  for (let i = 0; i < n; i++) {
    const a = v() * Math.PI * 2;
    const r = i ? 0.75 * k : 0;
    const s = i ? range(v, 0.4, 0.65) : 1;
    b.add("boulder", Math.cos(a) * r, -0.12 * k * s, Math.sin(a) * r, 1.15 * k * s, 0.8 * k * s, 0.95 * k * s, colors[i % 2], { ry: v() * 6.28 });
  }
}

/** A badlands tree burnt dead: a charred trunk with two or three bare branches */
function deadTree(b: Builder, k: number, v: () => number) {
  const h = 1.7 * k;
  b.add("trunk", 0, 0, 0, 0.3 * k, h, 0.3 * k, CHARRED, { ry: v() * 6.28 });
  const n = v() < 0.5 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const c = b.child(0, 0, v() * Math.PI * 2);
    leaning(c, "trunk", 0, (0.5 + i * 0.22 + v() * 0.08) * h, range(v, 0.55, 0.95), 0.11 * k, range(v, 0.55, 0.9) * k, CHARRED);
  }
}

/** A saguaro: a ribbed column with rounded tops and an arm or two bent upward */
function cactus(b: Builder, k: number, v: () => number) {
  b.add("trunk", 0, 0, 0, 0.34 * k, 1.7 * k, 0.34 * k, CACTUS);
  b.add("canopy", 0, 1.6 * k, 0, 0.2 * k, 0.2 * k, 0.2 * k, CACTUS);
  for (const side of [-1, 1]) {
    if (v() < 0.25) continue;
    const ey = (0.55 + v() * 0.35) * k;
    // The elbow lies along x, its flared end against the column; the arm rises from its far end
    b.add("trunk", side * 0.21 * k, ey - 0.21 * k, 0, 0.17 * k, 0.42 * k, 0.17 * k, CACTUS, { rz: -side * Math.PI / 2 });
    const len = (0.5 + v() * 0.3) * k;
    b.add("trunk", side * 0.38 * k, ey - 0.06 * k, 0, 0.17 * k, len, 0.17 * k, CACTUS);
    b.add("canopy", side * 0.38 * k, ey - 0.06 * k + len - 0.07 * k, 0, 0.11 * k, 0.12 * k, 0.11 * k, CACTUS);
  }
}

/** A palm at the desert's edge: a curving trunk in two leaning lengths under a drooping crown of fronds */
function palm(b: Builder, k: number, v: () => number) {
  const low = leaning(b, "trunk", 0, 0, range(v, 0.08, 0.16), 0.26 * k, 1.2 * k, PALM_BARK);
  const top = leaning(b, "trunk", low.x, low.y - 0.05 * k, range(v, 0.25, 0.4), 0.17 * k, 1.1 * k, PALM_BARK);
  b.add("canopy", top.x, top.y - 0.12 * k, 0, 0.36 * k, 0.3 * k, 0.36 * k, PALM_FROND);
  // Fronds radiating from the crown, arching out and drooping at their tips
  const n = 7;
  const turn = v() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const c = b.child(top.x, 0, turn + (i * Math.PI * 2) / n + range(v, -0.2, 0.2));
    const droop = range(v, 0.3, 0.6);
    const len = range(v, 1.1, 1.4) * k;
    // Centre half a frond out along its droop; y0 from that centre (the part is placed by its unrotated height)
    c.add("canopy", (Math.cos(droop) * len) / 2, top.y - (Math.sin(droop) * len) / 2 - 0.06 * k, 0, len, 0.12 * k, 0.34 * k, PALM_FROND, { rz: -droop });
  }
}

/**
 * Trees, rocks, cacti and crystals scattered over the continent, fixed by the map seed: a species per region (layered
 * pines in Deepwood and the highlands, oaks, birches and willows by the water in Valoria, pale crystal-leaf trees in
 * Sylvandale, charred dead trees in the badlands, cacti and palms in the desert), each tree swaying as one from its foot.
 * Everything is instanced, so a thousand props cost a few draw calls.
 */
export function buildWorldScatter(terrain: Terrain, worldMap: FlatWorldMapData | null, extraNPCs: MapNPC[] = []): SceneOut {
  const out = emptyScene();
  const rng = mulberry32((worldMap?.seed ?? 1337) + 7);

  const avoid: Array<{ x: number; z: number; r: number }> = [];
  if (worldMap) {
    for (const p of Object.values(worldMap.kingdomPlacements)) avoid.push({ x: p.x, z: p.z, r: 4.8 });
    for (const n of [...worldMap.npcs, ...extraNPCs]) avoid.push({ x: n.x, z: n.z, r: 4.2 });
  }

  // The frontier gates' border walls: no tree or rock grows on them
  const gates = (worldMap?.npcs ?? []).filter((n) => GATE_MODEL_TYPES.has(n.type));
  for (const g of gates) for (const p of gateWallPoints(g.type, g.x, g.z)) avoid.push({ x: p.x, z: p.z, r: 2.2 });

  // Stone bridges where Valoria's river runs between two dry banks (decided first, so no tree grows on them)
  const bridges: Array<{ z: number; x: number; deck: number }> = [];
  // Walk down the river and take up to three crossings at least 8 apart
  for (let z = 34; z <= 76 && bridges.length < 3; z += 0.5) {
    if (bridges.some((b) => Math.abs(b.z - z) < 8)) continue;
    const x = riverX(z);
    const west = terrain.height(x - 3.2, z);
    const east = terrain.height(x + 3.2, z);
    // …and well clear of castles and NPCs
    const clear = avoid.every((a) => Math.hypot(a.x - x, a.z - z) > a.r + 2);
    if (clear && terrain.height(x, z) < SEA_LEVEL && west > SEA_LEVEL + 0.2 && east > SEA_LEVEL + 0.2) {
      bridges.push({ z, x, deck: Math.max(west, east) + 0.25 });
      avoid.push({ x, z, r: 4.2 });
    }
  }

  const blocked = (x: number, z: number) => avoid.some((a) => Math.abs(a.x - x) < a.r && Math.abs(a.z - z) < a.r);
  // No tree or rock stands in or beside a lava fissure or a forge vent (they are built after the scatter, so kept apart)
  const hot: Array<{ x: number; z: number; r: number }> = FORGE_VENTS.map((v) => ({ ...v, r: 2.4 }));
  for (const f of LAVA_FISSURES) {
    for (let t = -f.len / 2; t <= f.len / 2; t += 1) hot.push({ x: f.x + Math.sin(f.rot) * t, z: f.z + Math.cos(f.rot) * t, r: 2 });
  }
  const scorched = (x: number, z: number) => hot.some((a) => Math.hypot(a.x - x, a.z - z) < a.r);

  const step = 2.2;
  for (let gx = -78; gx <= 78; gx += step) {
    for (let gz = -78; gz <= 78; gz += step) {
      const x = gx + range(rng, -0.9, 0.9);
      const z = gz + range(rng, -0.9, 0.9);
      const roll = rng();
      const h = terrain.height(x, z);
      if (h < SEA_LEVEL + 0.25) continue;
      if (blocked(x, z) || scorched(x, z)) continue;
      const { kind, edge } = dominant(terrain.weights(x, z));
      if (roll > DENSITY[kind]) continue;
      if ((kind === "dwarf" || kind === "mountains") && h > 6.2) continue; // above the tree line

      const b = new Builder(out, x, h - 0.05, z, rng() * Math.PI * 2);
      const k = range(rng, 0.8, 1.3);
      // The prop's own details come from its own stream, so they never shift the rest of the scatter
      const v = mulberry32(Math.round(x * 997) * 31 + Math.round(z * 991));
      const pick = v();
      const from = out.parts.length;

      switch (kind) {
        case "forest": {
          const s = k * 1.25;
          if (pick < 0.1) boulders(b, k * 0.8, ["#7a756e", "#625d57"], v);
          else if (pick < 0.28) {
            oak(b, k * 1.1, PINE_DEEP, v);
            swaying(out, from, b, v);
          } else {
            pine(b, s, pick < 0.6 ? PINE_DARK : PINE_DEEP, v);
            if (v() < 0.3) pine(b.child(0.9 * s, 0.3 * s, 0), s * 0.65, PINE_DARK, v);
            swaying(out, from, b, v);
          }
          break;
        }
        case "elf":
          if (pick < 0.15) {
            b.add("trunk", 0, 0, 0, 0.2 * k, 1.4 * k, 0.2 * k, "#334155");
            b.add("sphere", 0, 1.2 * k, 0, 1.3 * k, 1.1 * k, 1.3 * k, "#34d399", { glow: true });
          } else {
            // A crystal-leaf tree: silver bark, a pale crown with crystals glinting among the leaves
            b.add("trunk", 0, 0, 0, 0.22 * k, 1.7 * k, 0.22 * k, "#e7e5e4");
            b.add("canopy", 0, 0.95 * k, 0, 1.15 * k, 1.9 * k, 1.15 * k, ELF_LEAF, { ry: v() * 6.28 });
            for (let i = 0; i < 2; i++) {
              const a = v() * Math.PI * 2;
              b.add("octa", Math.cos(a) * 0.62 * k, (1.4 + v() * 0.6) * k, Math.sin(a) * 0.62 * k, 0.16 * k, 0.26 * k, 0.16 * k, "#a5f3fc", { glow: true });
            }
            swaying(out, from, b, v);
          }
          break;
        case "dwarf":
        case "mountains":
          if (pick < 0.35) boulders(b, k, ["#7a756e", "#86807a"], v);
          else {
            pine(b, k, pick < 0.7 ? PINE_HIGH : PINE_HIGH_LIGHT, v, 0.85);
            swaying(out, from, b, v);
          }
          break;
        case "human": {
          const byWater = h < SEA_LEVEL + 0.7 || (z > RIVER_FROM_Z && Math.abs(x - riverX(z)) < 4.5);
          if (pick < 0.1) boulders(b, k * 0.6, ["#8a8580", "#78716c"], v);
          else {
            if (byWater && pick < 0.75) willow(b, k, v);
            else if (pick < 0.65) oak(b, k, OAK_LEAF, v);
            else birch(b, k, v);
            swaying(out, from, b, v);
          }
          break;
        }
        case "orc":
          if (pick < 0.45) deadTree(b, k, v);
          else if (pick < 0.8) boulders(b, k, ["#7c4a32", "#5c3a2a"], v);
          else b.add("trunk", 0, 0, 0, 0.45 * k, 0.45 * k, 0.45 * k, CHARRED); // a burnt stump
          break;
        case "desert":
          if (edge > 0.25 && pick < 0.6) {
            palm(b, k, v);
            swaying(out, from, b, v);
          } else if (pick < 0.55) cactus(b, k, v);
          else boulders(b, k, ["#b07a3a", "#c08a4a"], v);
          break;
        case "arcane":
          b.add("boulder", 0, -0.15, 0, 0.9 * k, 0.5 * k, 0.8 * k, "#3b2f4a", { ry: v() * 6.28 });
          b.add("octa", 0, 0, 0, 0.6 * k, 1.4 * k, 0.6 * k, "#c084fc", { glow: true });
          if (v() < 0.4) b.add("octa", 0.4 * k, -0.05, 0.1 * k, 0.32 * k, 0.75 * k, 0.32 * k, "#c084fc", { glow: true });
          break;
      }
    }
  }

  // Province flavour: dwarven forge vents (a stone stack with a glowing throat, smoke rising in layers) and orcish
  // lava fissures
  const vent = (x: number, z: number) => {
    if (blocked(x, z)) return;
    const h = terrain.height(x, z);
    const b = new Builder(out, x, h - 0.1, z);
    b.add("boulder", 0, -0.15, 0, 1.9, 0.75, 1.7, "#1e293b");
    b.add("cyl", 0, 0.3, 0, 1.1, 1.7, 1.1, "#0f172a");
    b.add("cyl", 0, 2.0, 0, 1.3, 0.25, 1.3, "#334155");
    b.add("sphere", 0, 1.95, 0, 0.7, 0.55, 0.7, "#f97316", { glow: true, idle: IDLE_KIND.pulse });
    for (let i = 0; i < 5; i++) {
      const s = 0.45 + (i % 3) * 0.15;
      b.add("sphere", 0, 2.3, 0, s, s * 0.85, s, i % 2 ? "#64748b" : "#475569", { idle: IDLE_KIND.smoke, phase: 0.01 + (i * Math.PI * 2) / 5 });
    }
  };
  for (const v of FORGE_VENTS) vent(v.x, v.z);

  // A lava fissure: a jagged crack that follows the ground, charred rocks along both lips, lava (a crust drifting over
  // glowing cracks, in HD) pulsing in it, smoke rising
  const fissure = (x: number, z: number, rot: number, len: number) => {
    if (blocked(x, z)) return;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const crack = mulberry32(Math.round(x * 31 + z * 17));
    const n = Math.round(len / 0.9);
    let side = 0;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * len;
      side += range(crack, -0.35, 0.35);
      side = Math.max(-0.7, Math.min(0.7, side));
      const px = x + s * t + c * side;
      const pz = z + c * t - s * side;
      const h = terrain.height(px, pz);
      const width = 0.35 + Math.sin((i / (n - 1)) * Math.PI) * 0.45; // widest in the middle, closing at the ends
      const b = new Builder(out, px, h - 0.12, pz, rot + range(crack, -0.25, 0.25));
      b.add("block", 0, 0, 0, width, 0.2, 1.05, "#ea580c", { glow: true, idle: IDLE_KIND.pulse });
      for (const sx of [-1, 1]) b.add("boulder", sx * (width / 2 + 0.24), -0.02, 0, 0.5, 0.34, 1.05, "#292524", { rz: sx * 0.3, ry: range(crack, -0.4, 0.4) });
      if (i % 4 === 2) for (let k = 0; k < 2; k++) b.add("sphere", 0, 0.2, 0, 0.45, 0.4, 0.45, "#57534e", { idle: IDLE_KIND.smoke, phase: 0.01 + k * Math.PI + i });
    }
  };
  for (const f of LAVA_FISSURES) fissure(f.x, f.z, f.rot, f.len);

  // Border walls: from each frontier gate a wall curves away both ways round its province's heart, in the
  // civilization's style, each segment standing on its own ground (the gatehouse itself is the gate's NPC model)
  for (const g of gates) buildGateWall(out, terrain, g.type, g.x, g.z);

  // The bridges: Valoria's pale stone, one arch springing from abutments on both banks, a ring of voussoirs round
  // the opening, a timber deck between coped parapets, a lamp at each corner
  for (const br of bridges) buildBridge(out, terrain, br.x, br.z, br.deck);

  return out;
}

function buildBridge(out: SceneOut, terrain: Terrain, x: number, z: number, deck: number) {
  const b = new Builder(out, x, 0, z);
  const span = 6.4;
  const bed = SEA_LEVEL - 0.6;
  for (const sx of [-1, 1]) {
    const bank = terrain.height(x + sx * 3.0, z);
    b.add("block", sx * 3.0, bank - 0.6, 0, 1.4, deck - 0.35 - (bank - 0.6), 2.0, "#9a948c"); // abutment, under the deck
  }
  // The arch: its springers bury into the abutments, its crown just under the deck
  const archW = 4.8;
  const archH = deck - 0.3 - bed;
  b.add("arch", 0, bed, 0, archW, archH, 1.8, "#a8a29e");
  // Voussoirs round the opening (opening: half-width 0.38, height 0.66 of the arch), standing proud of both faces
  const rx = 0.38 * archW;
  const ry = 0.66 * archH;
  for (let i = 1; i < 10; i++) {
    const a = (Math.PI * i) / 10;
    // Inner end 0.05 back from the opening's edge, so the ring shows on the faces and never fights the soffit
    const cx = Math.cos(a) * (rx + 0.3);
    const cy = bed + Math.sin(a) * (ry + 0.3);
    b.add("block", cx, cy - 0.25, 0, 0.56, 0.5, 1.92, "#8f8a84", { rz: a - Math.PI / 2 }); // wide enough to close the ring
  }
  b.add("block", 0, deck - 0.3, 0, span, 0.3, 1.8, "#8b5a2b"); // timber deck
  for (let i = 0; i < 9; i++) b.add("block", -span / 2 + 0.36 + i * 0.71, deck, 0, 0.08, 0.06, 1.6, "#6b4423"); // plank seams
  for (const sz of [-1, 1]) {
    b.add("block", 0, deck, sz * 0.84, span, 0.45, 0.16, "#a8a29e"); // parapets
    b.add("block", 0, deck + 0.45, sz * 0.84, span + 0.1, 0.08, 0.28, "#c9c3b8"); // coping
    for (const sx of [-1, 1]) b.add("cyl", sx * 3.0, deck + 0.53, sz * 0.84, 0.12, 0.3, 0.12, "#fde68a", { glow: true }); // lamps
  }
}

/** Length of one wall segment along the arc */
const WALL_SEGMENT = 1.6;
/** A tower every this many segments, and at both ends */
const WALL_TOWER_EVERY = 4;
/** The gatehouse gap in the wall (matches gates.ts) */
const WALL_GAP = 3.4;

/**
 * One gate's border wall: segments along the arc round its province's heart, each sunk into its own ground so the
 * wall follows the land, with towers along it. Styled per civilization: Valoria's crenellated pale stone with
 * blue-roofed towers, Drak'mar's sharpened log palisade with skull-topped watch posts, Sylvandale's living hedge on
 * a white stone footing with trees and moonstones, Ironforge's dark rune-banded stone with brazier towers.
 */
function buildGateWall(out: SceneOut, terrain: Terrain, type: string, gx: number, gz: number) {
  const { cx, cz, r, a0 } = gateWallArc(type, gx, gz);
  const civ = gateCiv(type);
  const n = Math.ceil((r * GATE_WALL_SPAN) / WALL_SEGMENT);
  const da = WALL_SEGMENT / r;
  for (const side of [-1, 1]) {
    let seg = 0;
    for (let i = 0; i < n; i++) {
      const a = a0 + side * (i + 0.5) * da;
      if (Math.abs(a - a0) * r < WALL_GAP) continue;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const ends = [-0.5, 0, 0.5].map((f) => terrain.height(cx + Math.cos(a + f * da) * r, cz + Math.sin(a + f * da) * r));
      const ground = Math.max(...ends);
      const base = Math.min(...ends) - 0.4;
      // Local x runs along the wall, local z across it (front: toward the Voidrift)
      const b = new Builder(out, x, 0, z, Math.atan2(-Math.cos(a), -Math.sin(a)));
      const last = i === n - 1;
      const tower = seg % WALL_TOWER_EVERY === 0 || last;
      wallSegment(b, civ, base, ground, seg, tower);
      seg++;
    }
  }
}

function wallSegment(b: Builder, civ: string, base: number, ground: number, seg: number, tower: boolean) {
  const L = WALL_SEGMENT * 1.04;
  switch (civ) {
    case "human": {
      const top = ground + 2.0;
      b.add("block", 0, base, 0, L, top - base, 0.9, "#e7e2d6");
      for (const dx of [-0.4, 0.4]) b.add("block", dx, top, 0, 0.36, 0.35, 0.9, "#c9c1b0"); // merlons
      if (tower) {
        b.add("cyl", 0, base, 0, 1.6, top + 1.0 - base, 1.6, "#e7e2d6");
        b.add("cyl", 0, top + 1.0, 0, 1.8, 0.25, 1.8, "#c9c1b0");
        b.add("cone", 0, top + 1.25, 0, 1.9, 1.5, 1.9, "#1d4ed8");
        b.add("box", 0, top + 0.1, 0.81, 0.22, 0.45, 0.06, "#fde68a", { glow: true }); // lit arrow slit
      }
      break;
    }
    case "orc": {
      for (let k = 0; k < 3; k++) {
        const h = ground + 2.0 + ((seg * 3 + k) % 4) * 0.22 - base;
        const dx = -0.53 + k * 0.53;
        b.add("trunk", dx, base, 0, 0.46, h, 0.46, k % 2 ? "#5b3b22" : "#4a3322", { ry: seg + k });
        b.add("cone", dx, base + h, 0, 0.25, 0.5, 0.25, "#3f2a1a"); // sharpened tips
      }
      b.add("block", 0, ground + 0.9, 0.2, L, 0.16, 0.12, "#7f1d1d"); // lashing
      if (tower) {
        b.add("trunk", 0, base, -0.2, 0.55, ground + 3.6 - base, 0.55, "#4a3322");
        b.add("canopy", 0, ground + 3.55, -0.2, 0.5, 0.5, 0.45, "#efe6cf"); // skull
        b.add("block", 0.3, ground + 2.6, -0.2, 0.55, 0.8, 0.04, "#b91c1c", { idle: IDLE_KIND.flutter });
      }
      break;
    }
    case "elf": {
      // White stone that stands out against the forest, crowned with a living hedge
      const top = ground + 1.5;
      b.add("block", 0, base, 0, L, top - base, 0.8, "#f5f5f4");
      b.add("block", 0, top, 0, L, 0.12, 0.9, "#cbd5e1"); // silver coping
      b.add("canopy", 0, top + 0.02, 0, L * 1.1, 0.9, 0.75, seg % 2 ? "#2f8a3a" : "#4caf50", { idle: IDLE_KIND.sway, ry: seg }); // living hedge
      if (tower) {
        b.add("cyl", 0, base, 0, 1.1, top + 1.6 - base, 1.1, "#f5f5f4"); // slim white spire
        b.add("cone", 0, top + 1.6, 0, 1.3, 1.9, 1.3, "#0d9488");
        b.add("octa", 0, top + 0.6, 0.62, 0.22, 0.34, 0.22, "#a5f3fc", { glow: true, idle: IDLE_KIND.pulse }); // moonstone
      }
      break;
    }
    case "dwarf": {
      const top = ground + 2.5;
      b.add("block", 0, base, 0, L, top - base, 1.2, "#44403c");
      b.add("block", 0, top, 0, L, 0.3, 1.4, "#57534e"); // capstones
      if (seg % 2 === 0) b.add("box", 0, ground + 1.1, 0, 0.9, 0.22, 1.32, "#f59e0b", { glow: true, idle: IDLE_KIND.pulse }); // rune band
      if (tower) {
        b.add("block", 0, base, 0, 1.9, top + 1.1 - base, 1.9, "#3f3a36");
        b.add("block", 0, top + 1.1, 0, 2.2, 0.3, 2.2, "#57534e");
        b.add("cone", 0, top + 1.4, 0, 0.7, 0.6, 0.7, "#f97316", { glow: true, idle: IDLE_KIND.pulse }); // brazier
        for (let k = 0; k < 2; k++) b.add("sphere", 0, top + 2.0, 0, 0.5, 0.45, 0.5, "#57534e", { idle: IDLE_KIND.smoke, phase: 0.01 + k * Math.PI });
      }
      break;
    }
  }
}
