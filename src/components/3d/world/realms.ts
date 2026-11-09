import { Rng, range, rngFor } from "@/utils/random";
import { Builder, IDLE_KIND, Surface } from "@/components/3d/city/parts";
import { Add, AddOpts, V3, along, arc, lanternFrame, skull, tail } from "./kitParts";
import { BASALT, SAND, flag, palm, robed, ship, tower, water } from "./landmarks";
import { WATER_REALM_TYPES } from "./realmTypes";
import { FigureLook, faceAt, shade } from "./spawnModels";

/**
 * The buffer realms (the NPC kingdoms of the buffer zones), staged on the rarity ladder as they grow through their
 * 28-day cycle. Each design keeps its signature core; a settlement grows round it, each stage adding to the last (so
 * a stage's model starts with the whole of the one before it, and a building day raises only the new parts):
 *   common   — the core alone, plain and matte;
 *   uncommon — houses round it and a banner in the realm's colour;
 *   rare     — more houses, a wall ring with four towers, metal caps and glowing braziers;
 *   epic     — the full settlement, a great tower with lit windows, banners on every tower and motes orbiting the core.
 * The map also scales the whole realm by stage (REALM_STAGE_SCALE), and epic realms get the tier aura (TierFx).
 * Sea realms stand on a plank jetty ring their soldiers walk, with houses on stilts and a stone breakwater.
 *
 * HD (the model kit): every part in its real material (masonry, timber, canvas, brass, wet coral, leaves), and each
 * stage adds its HD-only detail on the same ladder: houses get corner posts, lintels, windows, ridges and chimneys,
 * tents their door flaps and guy ropes; walls their merlons, the gateway a beam and the realm's banner, towers their
 * corbels, slits and iron brazier bowls; the great tower its string courses, window arches and corbelled crown. Metal
 * shines from rare up (common and uncommon keep it dull). HD-only randomness has its own seeded rng (never the model's).
 */

type HutKind = "house" | "tent" | "dome";

interface RealmStyle {
  wall: string;
  roof: string;
  /** The realm's banner colour (uncommon) */
  accent: string;
  /** Tower caps and trim (rare) */
  metal: string;
  /** Braziers, windows and motes */
  glow: string;
  hut: HutKind;
  /** HD: what its walls and roofs are made of, and its metal */
  wallMat: Surface;
  roofMat: Surface;
  metalMat: Surface;
}

const STYLES: Record<string, RealmStyle> = {
  "bk-corsair-citadel": { wall: "#44403c", roof: "#111827", accent: "#b91c1c", metal: "#fbbf24", glow: "#fb923c", hut: "house", wallMat: "stone", roofMat: "wood", metalMat: "gold" },
  "bk-port-royale": { wall: "#8b5a2b", roof: "#7f1d1d", accent: "#f8fafc", metal: "#d4a017", glow: "#fde68a", hut: "house", wallMat: "wood", roofMat: "wood", metalMat: "gold" },
  "bk-merfolk-enclave": { wall: "#155e75", roof: "#2dd4bf", accent: "#f472b6", metal: "#e2e8f0", glow: "#22d3ee", hut: "dome", wallMat: "stone", roofMat: "gel", metalMat: "steel" },
  "bk-nomad-pavilions": { wall: "#e7c9a0", roof: "#c2410c", accent: "#0ea5e9", metal: "#fbbf24", glow: "#f97316", hut: "tent", wallMat: "plain", roofMat: "cloth", metalMat: "gold" },
  "bk-brass-sultanate": { wall: "#f1d9a8", roof: "#d4a017", accent: "#7c2d12", metal: "#fbbf24", glow: "#fde047", hut: "dome", wallMat: "plain", roofMat: "gold", metalMat: "gold" },
  "bk-sandstrider": { wall: "#d6b06a", roof: "#a16207", accent: "#c2410c", metal: "#fbbf24", glow: "#38bdf8", hut: "tent", wallMat: "plain", roofMat: "cloth", metalMat: "gold" },
  "bk-ranger-barony": { wall: "#7c4a24", roof: "#166534", accent: "#15803d", metal: "#d4a017", glow: "#fde68a", hut: "house", wallMat: "wood", roofMat: "leaf", metalMat: "gold" },
  "bk-dryad-court": { wall: "#6b4423", roof: "#86efac", accent: "#f9a8d4", metal: "#fde047", glow: "#fbcfe8", hut: "dome", wallMat: "wood", roofMat: "leaf", metalMat: "gold" },
  "bk-greenwood-bastion": { wall: "#6b4423", roof: "#3f6212", accent: "#a16207", metal: "#94a3b8", glow: "#fbbf24", hut: "house", wallMat: "wood", roofMat: "leaf", metalMat: "iron" },
  "bk-forgehold": { wall: "#3f3f46", roof: "#1c1b22", accent: "#b91c1c", metal: "#fbbf24", glow: "#fb923c", hut: "house", wallMat: "stone", roofMat: "stone", metalMat: "gold" },
  "bk-thunderpeak": { wall: "#475569", roof: "#334155", accent: "#0891b2", metal: "#cbd5e1", glow: "#67e8f9", hut: "house", wallMat: "stone", roofMat: "stone", metalMat: "steel" },
  "bk-rider-eyrie": { wall: "#78716c", roof: "#0f766e", accent: "#0d9488", metal: "#fbbf24", glow: "#5eead4", hut: "house", wallMat: "stone", roofMat: "wood", metalMat: "gold" }
};

/** Houses stand on this ring round the core (sea realms: just outside the jetty) */
const HUT_R = 3.5;
const WATER_HUT_R = 4.35;
/** The jetty ring a sea realm's soldiers walk */
export const REALM_JETTY_R = 3.5;
/** Wall ring (rare and up); sea realms: a breakwater further out */
const WALL_R = 4.4;
const WATER_WALL_R = 5.1;
/** Front (+z, the gate) and back (the epic great tower) stay clear of houses */
const HUT_SLOTS: number[][] = [[], [0.95, 2.2, 3.6], [0.15, 3.0], [4.1, 5.3, 5.85]];
const FRONT = Math.PI / 2;
const BACK = -Math.PI / 2;

const hdo = (mat: Surface, o: AddOpts = {}): AddOpts => ({ ...o, mat, hd: true });
const DARK_WOOD = "#3b2414";
const ROPE = "#c8b48a";
const STAKE = "#5b3b22";
const IRON = "#27272a";
/** Metals that shine: dull below rare (docs/MODEL_STYLE.md Visual rarity ladder) */
const SHINY = new Set<Surface>(["iron", "steel", "gold"]);

/** HD: guy ropes from a tent's flank at height `y` (radius `r0`) down to stakes on a ring `r1` out, `n` of them from angle `a0` */
function guyRopes(add: Add, x: number, z: number, y: number, r0: number, r1: number, n: number, a0 = 0.4) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    along(add, "cyl", [x + c * r0, y, z + s * r0], [x + c * r1, 0.06, z + s * r1], 0.018, 0.018, ROPE, hdo("cloth"));
    add("cyl", x + c * r1, 0, z + s * r1, 0.045, 0.16, 0.045, STAKE, hdo("wood"));
  }
}

/** HD: a door flap laid on the slope of a cone `w` across and `h` tall standing at (x, y0, z), facing +z */
function coneDoor(add: Add, x: number, y0: number, z: number, w: number, h: number, color: string) {
  const tilt = Math.atan2(w / 2, h);
  const dh = h * 0.5;
  const mid = dh / 2 + 0.02;
  add("box", x, y0 + mid - dh / 2, z + (w / 2) * (1 - mid / h) + 0.03, w * 0.26, dh, 0.03, color, hdo("cloth", { rx: -tilt }));
}

/** HD: rope rails along a plank bridge from (ax, az) to (bx, bz) whose deck is at `y`: posts at the ends, ropes sagging between */
function bridgeRails(add: Add, ax: number, az: number, bx: number, bz: number, y: number, half: number, sag = 0.08) {
  const len = Math.hypot(bx - ax, bz - az);
  const [px, pz] = [(-(bz - az) / len) * half, ((bx - ax) / len) * half];
  for (const k of [-1, 1]) {
    const a: V3 = [ax + px * k, y + 0.3, az + pz * k];
    const b: V3 = [bx + px * k, y + 0.3, bz + pz * k];
    const m: V3 = [(a[0] + b[0]) / 2, y + 0.3 - sag, (a[2] + b[2]) / 2];
    along(add, "cyl", a, m, 0.025, 0.025, ROPE, hdo("cloth"));
    along(add, "cyl", m, b, 0.025, 0.025, ROPE, hdo("cloth"));
    for (const e of [a, b]) add("cyl", e[0], y, e[2], 0.05, 0.32, 0.05, DARK_WOOD, hdo("wood"));
  }
}

/** HD: a ring of fire stones and crossed logs under a camp fire at (x, z) */
function fireRing(add: Add, rng: Rng, x: number, z: number, r: number, y0 = 0) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng() * 0.4;
    const s = 0.1 + rng() * 0.05;
    add("boulder", x + Math.cos(a) * r, y0 - 0.02, z + Math.sin(a) * r, s, s * 0.8, s, "#57534e", hdo("stone", { ry: rng() * 6 }));
  }
  for (const k of [-1, 1]) along(add, "cyl", [x - r * 0.6, y0 + 0.05, z - k * r * 0.4], [x + r * 0.6, y0 + 0.05, z + k * r * 0.4], 0.07, 0.07, "#3b2414", hdo("wood"));
}

/** HD: a statue's face carved on a head centred at (x, cy, cz) `w` across, all of `stone` */
function stoneFace(add: Add, x: number, cy: number, cz: number, w: number, color: string) {
  const carve: Add = (shape, px, y0, pz, sw, sh, sd, _c, o) => add(shape, x + px, y0, pz, sw, sh, sd, color, { ...o, mat: "stone" });
  const look: FigureLook = { skin: color, tunic: color, legs: color, boots: color, belt: color, eyes: color, sclera: color };
  faceAt(carve, look, {}, cy, cz, w / 0.34);
}

function hut(b: Builder, x: number, z: number, a: number, st: RealmStyle, sea: boolean, rng: Rng) {
  const h = b.child(x, z, -a + Math.PI / 2, sea ? 0.45 : 0);
  if (sea) for (const [sx, sz] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) b.child(x, z, -a + Math.PI / 2).add("cyl", sx, 0, sz, 0.1, 0.5, 0.1, "#5b3b22", { mat: "wood" }); // stilts
  const s = range(rng, 0.85, 1.05);
  const add = h.add.bind(h);
  if (st.hut === "tent") {
    h.add("cone", 0, 0, 0, 1.0 * s, 0.95 * s, 1.0 * s, st.roof, { mat: "cloth" });
    h.add("cyl", 0, 0.9 * s, 0, 0.04, 0.3, 0.04, "#3f2a1a", { mat: "wood" });
    // HD: a door flap, guy ropes to stakes, a knob on the pole
    coneDoor(add, 0, 0, 0, 1.0 * s, 0.95 * s, shade(st.roof, 0.55));
    guyRopes(add, 0, 0, 0.5 * s, 0.24 * s, 0.78 * s, 3, 1.0);
    add("sphere", 0, 0.9 * s + 0.27, 0, 0.08, 0.08, 0.08, st.metal, hdo(st.metalMat));
  } else if (st.hut === "dome") {
    h.add("cyl", 0, 0, 0, 0.85 * s, 0.45 * s, 0.85 * s, st.wall, { mat: st.wallMat });
    h.add("sphere", 0, 0.45 * s - 0.1, 0, 0.85 * s, 0.6 * s, 0.85 * s, st.roof, { mat: st.roofMat });
    // HD: a round-headed door, a band round the eaves, a finial
    add("box", 0, 0, 0.4 * s, 0.24, 0.3 * s, 0.08, "#2a1d12", hdo("wood"));
    add("cyl", 0, 0.3 * s - 0.12, 0.4 * s, 0.24, 0.08, 0.24, "#2a1d12", hdo("wood", { rx: Math.PI / 2 }));
    add("cyl", 0, 0.45 * s - 0.17, 0, 0.85 * s + 0.08, 0.07, 0.85 * s + 0.08, shade(st.wall, 0.8), hdo(st.wallMat));
    add("cone", 0, 1.05 * s - 0.14, 0, 0.1, 0.2, 0.1, st.metal, hdo(st.metalMat));
  } else {
    h.add("box", 0, 0, 0, 0.8 * s, 0.6 * s, 0.7 * s, st.wall, { mat: st.wallMat });
    h.add("prism", 0, 0.6 * s, 0, 0.95 * s, 0.45 * s, 0.85 * s, st.roof, { mat: st.roofMat });
    h.add("box", 0, 0, 0.36 * s, 0.22, 0.38 * s, 0.05, "#3b2a1a", { mat: "wood" }); // door
    // HD: corner posts (or quoins), a lintel over the door, a window each side, the roof's ridge, a chimney
    const timber = st.wallMat === "wood";
    const post = timber ? DARK_WOOD : shade(st.wall, 1.25);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add("box", sx * 0.4 * s, 0, sz * 0.35 * s, 0.11, 0.6 * s, 0.11, post, hdo(timber ? "wood" : "stone"));
    add("box", 0, 0.38 * s + 0.01, 0.36 * s, 0.32, 0.06, 0.13, post, hdo(timber ? "wood" : "stone"));
    for (const sx of [-1, 1]) {
      add("box", sx * (0.4 * s + 0.01), 0.27 * s, 0, 0.06, 0.16, 0.18, "#1e293b", hdo("gem"));
      add("box", sx * (0.4 * s + 0.03), 0.27 * s - 0.04, 0, 0.08, 0.04, 0.26, post, hdo(timber ? "wood" : "stone"));
    }
    along(add, "capsule", [-0.48 * s, 1.05 * s - 0.03, 0], [0.48 * s, 1.05 * s - 0.03, 0], 0.07, 0.07, shade(st.roof, 0.7), hdo(st.roofMat));
    add("box", 0.22 * s, 0.75 * s, -0.2 * s, 0.14, 0.42 * s, 0.14, "#6b6259", hdo("stone", { hdShape: "block" }));
  }
}

/** Ring of plank decks a sea realm's soldiers walk. HD: mooring bollards and coiled ropes */
function jetty(b: Builder) {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * REALM_JETTY_R;
    const z = Math.sin(a) * REALM_JETTY_R;
    b.add("cyl", x, 0, z, 0.1, 0.3, 0.1, "#5b3b22", { mat: "wood" }); // piling
    b.add("box", x, 0.3, z, 0.6, 0.08, ((2 * Math.PI * REALM_JETTY_R) / n) * 1.04, "#8b5a2b", { ry: -a, mat: "wood" });
    if (i % 4 === 1) {
      const [ox, oz] = [Math.cos(a) * (REALM_JETTY_R + 0.22), Math.sin(a) * (REALM_JETTY_R + 0.22)];
      b.add("cyl", ox, 0.38, oz, 0.12, 0.2, 0.12, DARK_WOOD, hdo("wood"));
      b.add("cyl", ox, 0.58, oz, 0.16, 0.05, 0.16, DARK_WOOD, hdo("wood"));
    }
    if (i % 4 === 3) b.add("cyl", x, 0.38, z, 0.22, 0.06, 0.22, ROPE, hdo("cloth"));
  }
}

/**
 * Wall ring with a gate gap at the front and four towers (rare); a stone breakwater for sea realms. HD: merlons on the
 * wall (boulders heaped along the breakwater), a beam over the gateway with the realm's banner, corbels, arrow slits,
 * iron brazier bowls on brackets and knobbed metal caps
 */
function walls(b: Builder, st: RealmStyle, sea: boolean, hr: Rng) {
  const r = sea ? WATER_WALL_R : WALL_R;
  const n = 16;
  const len = ((2 * Math.PI * r) / n) * 1.02;
  const wh = sea ? 0.55 : 0.85;
  const add = b.add.bind(b);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - FRONT), Math.cos(a - FRONT))) < 0.3) continue; // the gate
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    b.add("box", x, 0, z, 0.32, wh, len, sea ? BASALT : st.wall, { ry: -a, mat: sea ? "hide" : st.wallMat, hdShape: sea ? undefined : "block" });
    for (const f of [-0.27, 0.27]) {
      const [tx, tz] = [-Math.sin(a) * f * len, Math.cos(a) * f * len];
      if (sea) {
        // Boulders heaped against the breakwater's sea side
        const sz = 0.35 + hr() * 0.2;
        add("boulder", x + Math.cos(a) * 0.24 + tx, -0.05, z + Math.sin(a) * 0.24 + tz, sz, sz * 0.8, sz, "#3a3944", hdo("hide", { ry: hr() * 6 }));
      } else add("box", x + tx, wh, z + tz, 0.32, 0.18, len * 0.26, st.wall, hdo(st.wallMat, { ry: -a, hdShape: "block" })); // merlons
    }
  }
  for (const a of [FRONT - 0.42, FRONT + 0.42]) {
    // Gatehouse posts with the realm's colour hung between them
    b.add("box", Math.cos(a) * r, 0, Math.sin(a) * r, 0.5, 1.35, 0.5, st.wall, { mat: st.wallMat, hdShape: "block" });
    add("box", Math.cos(a) * r, 1.35, Math.sin(a) * r, 0.6, 0.1, 0.6, shade(st.wall, 0.8), hdo(st.wallMat, { hdShape: "block" }));
  }
  // HD: a beam across the gateway and the realm's banner hung from it
  const [gx, gz] = [Math.cos(FRONT - 0.42) * r, Math.sin(FRONT - 0.42) * r];
  along(add, "cyl", [gx - 0.2, 1.2, gz], [-gx + 0.2, 1.2, gz], 0.14, 0.14, DARK_WOOD, hdo("wood"));
  add("box", 0, 0.6, gz + 0.1, 0.55, 0.53, 0.03, st.accent, hdo("cloth", { idle: IDLE_KIND.flutter }));
  for (const a of towerAngles()) {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    b.add("cyl", x, 0, z, 0.75, 1.9, 0.75, st.wall, { mat: st.wallMat });
    b.add("cone", x, 1.9, z, 0.95, 0.75, 0.95, st.metal, { mat: st.metalMat }); // metal cap
    b.add("sphere", x + Math.cos(a) * 0.48, 1.25, z + Math.sin(a) * 0.48, 0.24, 0.24, 0.24, st.glow, { glow: true, idle: IDLE_KIND.pulse }); // brazier
    const [ox, oz] = [Math.cos(a), Math.sin(a)];
    add("cyl", x, 1.62, z, 0.85, 0.14, 0.85, shade(st.wall, 0.8), hdo(st.wallMat)); // corbelled ring
    add("sphere", x, 2.6, z, 0.12, 0.12, 0.12, st.metal, hdo(st.metalMat)); // knob on the cap
    add("box", x + ox * 0.36, 0.7, z + oz * 0.36, 0.08, 0.34, 0.08, "#1c1917", hdo("stone", { ry: -a })); // arrow slit
    add("cyl", x + ox * 0.48, 1.06, z + oz * 0.48, 0.3, 0.12, 0.3, IRON, hdo("iron")); // the brazier's bowl
    along(add, "cyl", [x + ox * 0.3, 1.0, z + oz * 0.3], [x + ox * 0.46, 1.08, z + oz * 0.46], 0.04, 0.04, IRON, hdo("iron")); // its bracket
  }
}

const towerAngles = () => [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];

/**
 * Epic: the great tower behind the core, banners on every tower, motes orbiting over the core. HD: string courses,
 * sills and arches round the lit windows, corbels under the crown ring, a spike on the roof
 */
function grandeur(b: Builder, st: RealmStyle, sea: boolean, top: number) {
  const gz = -3.55;
  const y0 = sea ? 0.38 : 0;
  b.add("cyl", 0, y0, gz, 1.3, 5.2, 1.3, st.wall, { mat: st.wallMat });
  b.add("cyl", 0, y0 + 5.2, gz, 1.6, 0.35, 1.6, st.metal, { mat: st.metalMat }); // crown ring
  b.add("cone", 0, y0 + 5.55, gz, 1.3, 1.5, 1.3, st.roof, { mat: st.roofMat === "gel" || st.roofMat === "leaf" ? "stone" : st.roofMat });
  b.add("sphere", 0, y0 + 7.0, gz, 0.4, 0.4, 0.4, st.glow, { glow: true, idle: IDLE_KIND.pulse });
  for (const y of [1.6, 2.8, 4.0]) b.add("box", 0, y0 + y, gz + 0.62, 0.22, 0.42, 0.1, st.glow, { glow: true }); // lit windows
  if (sea) for (const [sx, sz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) b.add("cyl", sx, 0, gz + sz, 0.14, 0.4, 0.14, "#5b3b22", { mat: "wood" });
  const add = b.add.bind(b);
  const trim = shade(st.wall, 0.8);
  const trimMat = st.wallMat;
  for (const y of [1.15, 3.45]) add("cyl", 0, y0 + y, gz, 1.4, 0.1, 1.4, trim, hdo(trimMat));
  for (const y of [1.6, 2.8, 4.0]) {
    add("box", 0, y0 + y - 0.07, gz + 0.66, 0.34, 0.05, 0.14, trim, hdo(trimMat));
    add("cyl", 0, y0 + y + 0.32, gz + 0.69, 0.3, 0.07, 0.3, trim, hdo(trimMat, { rx: Math.PI / 2 }));
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    add("box", Math.cos(a) * 0.7, y0 + 4.92, gz + Math.sin(a) * 0.7, 0.14, 0.2, 0.14, trim, hdo(trimMat, { ry: -a }));
  }
  flag(b.child(0, gz, 0, y0 + 7.4), 0, 0, 1.2, st.accent);
  const r = sea ? WATER_WALL_R : WALL_R;
  for (const a of towerAngles()) flag(b.child(Math.cos(a) * r, Math.sin(a) * r, 0, 2.6), 0, 0, 0.9, st.accent);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.add("octa", Math.cos(a) * 1.9, top + 0.9 + i * 0.25, Math.sin(a) * 1.9, 0.22, 0.32, 0.22, st.glow, { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 2.1, mat: "gem" });
  }
}

/** A realm's signature core: `rng` is the model's own (Normal), `hr` the HD-only one */
type Core = (b: Builder, rng: Rng, hr: Rng) => void;

const CORES: Record<string, Core> = {
  "bk-corsair-citadel": (b, rng, hr) => {
    // HD: surf round the sea pillars, merlons, gun ports with iron barrels run out
    const add = b.add.bind(b);
    water(b, 2.9);
    for (const [x, z, h] of [
      [-1.2, -0.6, 1.6],
      [1.1, -0.8, 2.0],
      [0, 0.9, 1.3]
    ]) {
      b.add("cyl", x, 0, z, 1.5, h, 1.5, BASALT, { mat: "hide" }); // volcanic sea pillars
      add("cyl", x, 0.06, z, 1.62, 0.08, 1.62, "#dbeafe", hdo("plain"));
    }
    b.add("box", 0, 1.6, -0.3, 2.6, 0.9, 1.6, "#57534e", { mat: "stone", hdShape: "block" }); // citadel bridging the pillars
    for (const x of [-1.2, 1.2]) tower(b, x, -0.6, 0.35, 3.3, "#44403c", "#111827");
    b.add("box", 0, 2.5, -0.3, 0.8, 0.9, 0.8, "#44403c", { mat: "stone", hdShape: "block" });
    flag(b.child(0, -0.3, 0, 3.4), 0, 0, 1.2, "#111827");
    b.add("box", 0.28, 4.05, -0.29, 0.22, 0.2, 0.04, "#f8fafc"); // skull on the flag
    ship(b, 2.0, 1.4, 0.4, "#111827", 0.8);
    for (const x of [-0.62, 0.62]) for (const z of [0.4, -1.0]) add("box", x, 2.5, z, 0.24, 0.2, 0.2, "#57534e", hdo("stone", { hdShape: "block" }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add("box", sx * 0.31, 3.4, -0.3 + sz * 0.31, 0.18, 0.16, 0.18, "#44403c", hdo("stone", { hdShape: "block" }));
    for (const x of [-0.6, 0, 0.6]) {
      add("box", x, 1.85, 0.52, 0.2, 0.18, 0.1, "#0c0a09", hdo("stone"));
      along(add, "cyl", [x, 1.94, 0.5], [x, 1.94, 0.78], 0.09, 0.09, IRON, hdo("iron"));
    }
  },
  "bk-port-royale": (b, rng, hr) => {
    // HD: rope rails on the bridges, the tavern on a raft with corner posts, its sign on a bracket and a lantern
    const add = b.add.bind(b);
    water(b, 3.0);
    ship(b, -1.3, 0, 0.2, "#f8fafc", 1.2);
    ship(b, 1.3, 0.2, -0.3, "#fde68a", 1.2);
    ship(b, 0, -1.6, 1.5, "#fca5a5", 1.0);
    b.add("box", 0, 0.35, 0, 2.0, 0.05, 0.25, "#a16207", { mat: "wood" }); // rope bridges between hulls
    b.add("box", -0.6, 0.35, -0.8, 0.25, 0.05, 1.4, "#a16207", { ry: 0.6, mat: "wood" });
    b.add("box", 0.1, 0, 0.9, 1.0, 0.8, 0.8, "#8b5a2b", { mat: "wood" }); // floating tavern
    b.add("prism", 0.1, 0.8, 0.9, 1.2, 0.5, 1.0, "#7f1d1d", { mat: "wood" });
    b.add("box", 0.1, 0.35, 1.31, 0.3, 0.25, 0.03, "#fde68a", { glow: true });
    bridgeRails(add, -1.0, 0, 1.0, 0, 0.4, 0.11);
    const [dx, dz] = [Math.sin(0.6) * 0.7, Math.cos(0.6) * 0.7];
    bridgeRails(add, -0.6 - dx, -0.8 - dz, -0.6 + dx, -0.8 + dz, 0.4, 0.11);
    add("box", 0.1, 0, 0.9, 1.3, 0.16, 1.1, DARK_WOOD, hdo("wood")); // the raft
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add("box", 0.1 + sx * 0.5, 0.16, 0.9 + sz * 0.4, 0.1, 0.6, 0.1, DARK_WOOD, hdo("wood"));
    along(add, "capsule", [-0.52, 1.28, 0.9], [0.72, 1.28, 0.9], 0.08, 0.08, "#5f1515", hdo("wood")); // ridge
    along(add, "cyl", [0.55, 0.72, 1.3], [0.55, 0.72, 1.56], 0.04, 0.04, DARK_WOOD, hdo("wood"));
    add("box", 0.55, 0.38, 1.52, 0.04, 0.28, 0.3, "#a16207", hdo("wood"));
    add("box", -0.3, 0.68, 1.31, 0.03, 0.03, 0.14, IRON, hdo("iron"));
    lanternFrame(add, -0.3, 0.42, 1.4, 0.11, 0.18, IRON, { mat: "iron" });
    add("sphere", -0.3, 0.45, 1.4, 0.08, 0.11, 0.08, "#fde68a", hdo("plain", { glow: true }));
  },
  "bk-merfolk-enclave": (b, rng, hr) => {
    // HD: branching coral, the tide pearl held in a trident's prongs, the merfolk's tail fins on the water
    const add = b.add.bind(b);
    water(b, 2.9, "#0e7490");
    b.add("sphere", 0, -0.6, 0, 3.0, 2.2, 3.0, "#22d3ee", { glow: true }); // glowing reef dome
    b.add("sphere", 0, -0.55, 0, 2.6, 2.0, 2.6, "#155e75", { mat: "gel" });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const [x, z] = [Math.cos(a) * 2.0, Math.sin(a) * 2.0];
      const h = range(rng, 1.2, 2.2);
      const c = i % 2 ? "#f472b6" : "#2dd4bf";
      b.add("cone", x, 0, z, 0.45, h, 0.45, c, { glow: true }); // coral spires
      for (const k of [-1, 1]) {
        const [tx, tz] = [-Math.sin(a) * k, Math.cos(a) * k];
        along(add, "cone", [x + tx * 0.08, h * 0.3, z + tz * 0.08], [x + tx * 0.36, h * 0.62 + k * 0.08, z + tz * 0.36], 0.16, 0.16, c, hdo("plain", { glow: true }));
      }
    }
    b.add("cyl", 0, 1.3, 0, 0.12, 1.0, 0.12, "#e2e8f0", { mat: "steel" });
    b.add("sphere", 0, 2.2, 0, 0.5, 0.5, 0.5, "#f0f9ff", { glow: true }); // tide pearl
    robed(b, 0.9, 0.9, "#0d9488", "#a5f3fc", 0.9);
    add("cyl", 0, 2.14, 0, 0.2, 0.08, 0.2, "#e2e8f0", hdo("steel"));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      along(add, "capsule", [c * 0.08, 2.2, s * 0.08], [c * 0.3, 2.55, s * 0.3], 0.05, 0.05, "#e2e8f0", hdo("steel"));
      along(add, "cone", [c * 0.3, 2.55, s * 0.3], [c * 0.2, 2.85, s * 0.2], 0.06, 0.06, "#e2e8f0", hdo("steel"));
    }
    for (const k of [-1, 1]) add("egg", 0.9 + k * 0.14, 0.09, 0.62, 0.28, 0.05, 0.2, "#0f766e", hdo("skin", { ry: k * 0.5 }));
  },
  "bk-nomad-pavilions": (b, rng, hr) => {
    // HD: silk door flaps, guy ropes and stakes, gilt finials, rugs and cushions by a fire ringed with stones
    const add = b.add.bind(b);
    b.add("cyl", 0, 0, 0, 5.2, 0.05, 5.2, SAND, { mat: "hide" });
    for (const [x, z, c, s] of [
      [0, 0, "#7c3aed", 1.6],
      [-1.6, 0.7, "#dc2626", 1.1],
      [1.5, 0.8, "#f59e0b", 1.1],
      [-0.9, -1.5, "#0ea5e9", 1.0],
      [1.1, -1.4, "#16a34a", 1.0]
    ] as const) {
      b.add("cone", x, 0, z, 1.6 * s, 1.3 * s, 1.6 * s, c, { mat: "cloth" }); // silk pavilions
      b.add("cyl", x, 1.25 * s, z, 0.05, 0.5, 0.05, "#fbbf24", { mat: "gold" });
      coneDoor(add, x, 0, z, 1.6 * s, 1.3 * s, shade(c, 0.5));
      guyRopes(add, x, z, 0.62 * s, 0.42 * s, 1.15 * s, 4, 0.8 + x);
      add("sphere", x, 1.25 * s + 0.46, z, 0.11, 0.11, 0.11, "#fbbf24", hdo("gold"));
    }
    b.add("cone", 0, 0, 1.9, 0.4, 0.5, 0.4, "#f97316", { glow: true });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      b.add("octa", Math.cos(a) * 2.3, 2.6, Math.sin(a) * 2.3, 0.14, 0.18, 0.14, "#fef9c3", { glow: true }); // star lanterns
    }
    fireRing(add, hr, 0, 1.9, 0.3, 0.05);
    add("box", -0.75, 0.05, 2.25, 0.8, 0.03, 0.55, "#991b1b", hdo("cloth", { ry: 0.3 }));
    add("box", 0.75, 0.05, 2.3, 0.8, 0.03, 0.55, "#1e3a8a", hdo("cloth", { ry: -0.4 }));
    for (const [x, z, c] of [[-0.8, 2.3, "#fbbf24"], [0.8, 2.35, "#a21caf"]] as const) add("egg", x, 0.08, z, 0.3, 0.14, 0.24, c, hdo("cloth"));
  },
  "bk-brass-sultanate": (b, rng, hr) => {
    // HD: dressed sandstone with stepped merlons, a horseshoe arch of brass over the gate, arched palace windows, a drum
    // and crescent on the dome, balconies and finials on the minarets, a stone-rimmed fountain
    const add = b.add.bind(b);
    b.add("cyl", 0, 0, 0, 5.4, 0.05, 5.4, SAND, { mat: "hide" });
    for (const [x, z, w, d] of [
      [0, -1.9, 4.0, 0.3],
      [0, 1.9, 4.0, 0.3],
      [-1.9, 0, 0.3, 4.0],
      [1.9, 0, 0.3, 4.0]
    ]) {
      b.add("box", x, 0, z, w, 0.9, d, "#e6c48a", { mat: "plain", hdShape: "block" }); // sandstone walls
      for (const t of [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5]) {
        if (z > 1 && Math.abs(t) < 0.6) continue; // the gate
        const [mx, mz] = w > d ? [x + t, z] : [x, z + t];
        add("box", mx, 0.9, mz, w > d ? 0.2 : 0.32, 0.18, w > d ? 0.32 : 0.2, "#e6c48a", hdo("plain", { hdShape: "block" }));
      }
    }
    b.add("box", 0, 0, 1.9, 0.8, 0.7, 0.35, "#7c2d12", { mat: "wood" }); // gate
    b.add("box", 0, 0, -0.3, 1.8, 1.2, 1.6, "#f1d9a8", { mat: "plain", hdShape: "block" });
    b.add("sphere", 0, 1.0, -0.3, 1.4, 1.3, 1.4, "#d4a017", { mat: "gold" }); // brass dome
    b.add("cone", 0, 2.25, -0.3, 0.2, 0.5, 0.2, "#fbbf24", { glow: true });
    for (const [x, z] of [
      [-1.9, -1.9],
      [1.9, -1.9],
      [-1.9, 1.9],
      [1.9, 1.9]
    ]) {
      b.add("cyl", x, 0, z, 0.45, 2.4, 0.45, "#f1d9a8", { mat: "plain" }); // minarets
      b.add("sphere", x, 2.3, z, 0.6, 0.55, 0.6, "#d4a017", { mat: "gold" });
      add("cyl", x, 1.66, z, 0.62, 0.08, 0.62, "#e6c48a", hdo("plain"));
      add("cone", x, 2.8, z, 0.08, 0.24, 0.08, "#d4a017", hdo("gold"));
    }
    b.add("cyl", 0.6, 0.02, 1.0, 1.0, 0.05, 0.6, "#38bdf8", { mat: "gel" }); // fountain pool
    palm(b, -0.9, 1.0, 0.25);
    arc(add, [0, 0.42, 2.12], [1, 0, 0], [0, 1, 0], 0.36, -0.4, Math.PI + 0.4, 9, 0.07, "#d4a017", hdo("gold"));
    for (const x of [-0.55, 0.55]) {
      add("box", x, 0.35, 0.52, 0.2, 0.4, 0.06, "#3b1d0e", hdo("wood"));
      add("cyl", x, 0.75 - 0.03, 0.52, 0.2, 0.06, 0.2, "#3b1d0e", hdo("wood", { rx: Math.PI / 2 }));
    }
    add("cyl", 0, 1.16, -0.3, 1.5, 0.12, 1.5, "#e6c48a", hdo("plain"));
    along(add, "cyl", [0, 2.7, -0.3], [0, 2.96, -0.3], 0.04, 0.04, "#d4a017", hdo("gold"));
    arc(add, [0, 3.08, -0.3], [1, 0, 0], [0, 1, 0], 0.12, Math.PI * 0.95, Math.PI * 2.05, 6, 0.045, "#d4a017", hdo("gold"));
    arc(add, [0.6, 0.075, 1.0], [1, 0, 0], [0, 0, 1], [0.53, 0.33], 0, Math.PI * 2, 14, 0.08, "#e6c48a", hdo("plain"));
    add("cyl", 0.6, 0.07, 1.0, 0.05, 0.28, 0.05, "#bae6fd", hdo("gel"));
    add("sphere", 0.6, 0.3, 1.0, 0.14, 0.1, 0.14, "#e0f2fe", hdo("gel"));
  },
  "bk-sandstrider": (b, rng, hr) => {
    // HD: planked skiffs with gunwales, a pointed bow, boom, yard and stays; posts and a bucket at the well; poles,
    // guy ropes and clay jars at the tarp shelters
    const add = b.add.bind(b);
    b.add("cyl", 0, 0, 0, 5.2, 0.05, 5.2, SAND, { mat: "hide" });
    for (const [x, z, r] of [
      [-1.3, 0.6, 0.4],
      [1.2, 0.9, -0.5]
    ]) {
      const sk = b.child(x, z, r);
      sk.add("box", 0, 0.1, 0, 0.6, 0.25, 1.8, "#92400e", { mat: "wood" }); // sand skiff
      sk.add("box", 0.4, 0, 0, 0.1, 0.12, 1.9, "#78350f", { mat: "wood" }); // runner
      sk.add("box", -0.4, 0, 0, 0.1, 0.12, 1.9, "#78350f", { mat: "wood" });
      sk.add("cyl", 0, 0.35, 0.1, 0.05, 1.5, 0.05, "#3f2a1a", { mat: "wood" });
      sk.add("box", 0, 0.75, 0.1, 0.04, 1.0, 1.0, "#fef3c7", { rx: 0.15, mat: "cloth" });
      const s = sk.add.bind(sk);
      for (const sx of [-1, 1]) s("box", sx * 0.31, 0.3, 0, 0.08, 0.08, 1.8, DARK_WOOD, hdo("wood"));
      along(s, "cone", [0, 0.225, 0.88], [0, 0.25, 1.22], 0.58, 0.22, "#92400e", hdo("wood"));
      along(s, "cyl", [0, 0.83, -0.47], [0, 0.68, 0.52], 0.04, 0.04, DARK_WOOD, hdo("wood")); // boom
      along(s, "cyl", [0, 1.82, -0.32], [0, 1.67, 0.67], 0.035, 0.035, DARK_WOOD, hdo("wood")); // yard
      along(s, "cyl", [0, 1.84, 0.1], [0, 0.37, 0.95], 0.016, 0.016, ROPE, hdo("cloth"));
      along(s, "cyl", [0, 1.84, 0.1], [0, 0.37, -0.88], 0.016, 0.016, ROPE, hdo("cloth"));
    }
    b.add("cyl", 0, 0, -1.1, 1.6, 0.6, 1.6, "#a8a29e", { mat: "stone" }); // well into the hidden waterways
    b.add("cyl", 0, 0.02, -1.1, 1.1, 0.6, 1.1, "#0c4a6e", { mat: "gel" });
    b.add("box", 0, 0.6, -1.1, 1.7, 0.08, 0.08, "#78350f", { mat: "wood" });
    b.add("prism", -1.6, 0, -1.2, 1.2, 0.9, 1.0, "#c2410c", { mat: "cloth" }); // tarp shelters
    b.add("prism", 1.6, 0, -1.2, 1.2, 0.9, 1.0, "#a16207", { mat: "cloth" });
    for (const sx of [-1, 1]) add("cyl", sx * 0.88, 0, -1.1, 0.1, 0.8, 0.1, DARK_WOOD, hdo("wood"));
    add("cyl", 0.36, 0.6, -0.42, 0.2, 0.18, 0.2, "#78350f", hdo("wood"));
    add("cyl", 0.36, 0.68, -0.42, 0.22, 0.04, 0.22, IRON, hdo("dull"));
    for (const sx of [-1, 1]) {
      for (const e of [-0.64, 0.64]) {
        add("cyl", sx * 1.6 + e, 0, -1.2, 0.06, 0.96, 0.06, DARK_WOOD, hdo("wood"));
        along(add, "cyl", [sx * 1.6 + e, 0.94, -1.2], [sx * 1.6 + e * 1.7, 0.06, -1.2], 0.016, 0.016, ROPE, hdo("cloth"));
        add("cyl", sx * 1.6 + e * 1.7, 0, -1.2, 0.045, 0.14, 0.045, STAKE, hdo("wood"));
      }
      add("egg", sx * 1.4, 0.05, -0.5, 0.24, 0.32, 0.24, "#b45309", hdo("stone"));
    }
  },
  "bk-ranger-barony": (b, rng, hr) => {
    // HD: trunks with root flares under leafy crowns, railed platforms, rope rails on the bridges, a ladder up the
    // front trunk, a door on each hut, a lantern hung under a platform
    const add = b.add.bind(b);
    const trunks: Array<[number, number]> = [
      [-1.4, -0.6],
      [1.4, -0.8],
      [0.1, 1.3]
    ];
    for (const [x, z] of trunks) {
      b.add("cyl", x, 0, z, 0.6, 4.6, 0.6, "#5b3b22", { mat: "wood", hdShape: "trunk" });
      b.add("sphere", x, 3.8, z, 2.2, 1.8, 2.2, "#166534", { mat: "leaf", hdShape: "canopy" });
      b.add("box", x, 2.3, z, 1.5, 0.12, 1.5, "#8b5a2b", { mat: "wood" }); // treehouse platforms
      b.add("prism", x, 2.42, z, 1.1, 0.6, 1.0, "#7c4a24", { mat: "wood" });
      const corners: V3[] = [[x - 0.68, 2.42, z - 0.68], [x + 0.68, 2.42, z - 0.68], [x + 0.68, 2.42, z + 0.68], [x - 0.68, 2.42, z + 0.68]];
      for (const c of corners) add("cyl", c[0], 2.42, c[2], 0.06, 0.36, 0.06, DARK_WOOD, hdo("wood"));
      for (let k = 0; k < 3; k++) along(add, "cyl", [corners[k][0], 2.74, corners[k][2]], [corners[k + 1][0], 2.74, corners[k + 1][2]], 0.04, 0.04, DARK_WOOD, hdo("wood"));
      add("box", x + 0.57, 2.42, z, 0.04, 0.36, 0.22, "#2a1d12", hdo("wood"));
    }
    for (let i = 0; i < 3; i++) {
      const [ax, az] = trunks[i];
      const [bx, bz] = trunks[(i + 1) % 3];
      const len = Math.hypot(bx - ax, bz - az);
      b.add("box", (ax + bx) / 2, 2.35, (az + bz) / 2, 0.25, 0.05, len, "#a16207", { ry: Math.atan2(bx - ax, bz - az), mat: "wood" }); // rope bridges
      // Rope rails from platform edge to platform edge
      const [ux, uz] = [(bx - ax) / len, (bz - az) / len];
      bridgeRails(add, ax + ux * 0.8, az + uz * 0.8, bx - ux * 0.8, bz - uz * 0.8, 2.4, 0.13, 0.12);
    }
    flag(b.child(1.4, -0.8, 0, 2.4), 0, 0, 1.0, "#15803d");
    // A ladder up the front trunk
    const [lx, lz] = [0.1, 1.3 + 0.36];
    for (const sx of [-1, 1]) add("box", lx + sx * 0.15, 0, lz, 0.05, 2.3, 0.05, DARK_WOOD, hdo("wood"));
    for (let k = 0; k < 7; k++) add("box", lx, 0.25 + k * 0.3, lz, 0.32, 0.04, 0.04, DARK_WOOD, hdo("wood"));
    add("cyl", -1.4 + 0.6, 2.18, -0.6 + 0.6, 0.02, 0.12, 0.02, IRON, hdo("iron"));
    lanternFrame(add, -0.8, 1.98, 0.0, 0.11, 0.16, IRON, { mat: "iron" });
    add("sphere", -0.8, 2.0, 0.0, 0.08, 0.1, 0.08, "#fde68a", hdo("plain", { glow: true }));
  },
  "bk-dryad-court": (b, rng, hr) => {
    // HD: bark and leafy crowns, roots flaring from each trunk, vines hanging; a living throne with armrests, roots
    // and an arching bough hung with leaves; leaves round every flower
    const add = b.add.bind(b);
    const LEAF = "#4d7c0f";
    b.add("cyl", 0, 0, 0, 5.0, 0.05, 5.0, LEAF, { mat: "leaf" });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * 2.0;
      const z = Math.sin(a) * 2.0;
      b.add("cyl", x, 0, z, 0.4, 2.6, 0.4, "#6b4423", { rx: Math.sin(a) * 0.25, rz: -Math.cos(a) * 0.25, mat: "wood" }); // trees arching inward
      b.add("sphere", x * 0.8, 2.2, z * 0.8, 1.4, 1.1, 1.4, i % 2 ? "#f9a8d4" : "#86efac", { mat: "leaf", hdShape: "canopy" }); // blossom canopy
      for (const k of [-0.5, 0.5, Math.PI]) {
        const r = a + k;
        along(add, "capsule", [x * 0.84, 0.12, z * 0.84], [x * 0.84 + Math.cos(r) * 0.42, 0.03, z * 0.84 + Math.sin(r) * 0.42], 0.12, 0.12, "#5b3a1e", hdo("wood"));
      }
      for (const k of [-1, 1]) {
        const [vx, vz] = [x * 0.8 - Math.sin(a) * k * 0.45, z * 0.8 + Math.cos(a) * k * 0.45];
        along(add, "capsule", [vx, 2.35, vz], [vx, 1.45 + hr() * 0.3, vz], 0.04, 0.04, "#3f6212", hdo("leaf"));
      }
    }
    b.add("box", 0, 0, -0.4, 1.0, 1.5, 0.3, "#3f6212", { mat: "wood" }); // living throne
    b.add("box", 0, 0, -0.1, 1.0, 0.6, 0.6, LEAF, { mat: "leaf" });
    b.add("sphere", 0, 1.5, -0.4, 0.4, 0.4, 0.2, "#fbcfe8", { glow: true });
    for (let i = 0; i < 6; i++) {
      const fx = range(rng, -1.2, 1.2);
      const fz = range(rng, 0.3, 1.4);
      b.add("sphere", fx, 0, fz, 0.25, 0.2, 0.25, "#fde047", { glow: true }); // flowers
      for (let k = 0; k < 3; k++) {
        const r = (k / 3) * Math.PI * 2 + hr() * 2;
        add("egg", fx + Math.cos(r) * 0.17, 0.06, fz + Math.sin(r) * 0.17, 0.16, 0.03, 0.09, "#3f6212", hdo("leaf", { ry: -r }));
      }
    }
    for (const sx of [-1, 1]) {
      along(add, "capsule", [sx * 0.56, 0.66, -0.4], [sx * 0.56, 0.64, 0.2], 0.12, 0.12, "#3f6212", hdo("wood"));
      add("sphere", sx * 0.56, 0.55, 0.22, 0.17, 0.17, 0.17, "#3f6212", hdo("wood"));
      along(add, "capsule", [sx * 0.42, 0.1, -0.5], [sx * 0.85, 0.02, -0.75], 0.11, 0.11, "#5b3a1e", hdo("wood"));
    }
    arc(add, [0, 1.5, -0.42], [1, 0, 0], [0, 1, 0], 0.62, 0, Math.PI, 8, 0.09, "#3f6212", hdo("wood"));
    for (let k = 1; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      add("egg", Math.cos(a) * 0.62, 1.5 + Math.sin(a) * 0.62 - 0.02, -0.34, 0.16, 0.08, 0.12, k % 2 ? "#86efac" : "#f9a8d4", hdo("leaf", { rz: a }));
    }
  },
  "bk-greenwood-bastion": (b, rng, hr) => {
    // HD: rope lashings round the palisade, a lintel and a hunting skull over its gate, log courses on the hall, a
    // framed door
    const add = b.add.bind(b);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (i === 4) continue; // gate gap
      b.add("cyl", Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4, 0.35, range(rng, 1.3, 1.6), 0.35, "#6b4423", { mat: "wood" }); // log palisade
      b.add("cone", Math.cos(a) * 2.4, 1.5, Math.sin(a) * 2.4, 0.35, 0.3, 0.35, "#4d7c0f", { mat: "leaf" }); // moss caps
      add("cyl", Math.cos(a) * 2.4, 0.85, Math.sin(a) * 2.4, 0.4, 0.06, 0.4, ROPE, hdo("cloth"));
    }
    b.add("box", 0, 0, 0, 2.0, 1.1, 1.4, "#7c4a24", { mat: "wood" }); // log hall
    b.add("prism", 0, 1.1, 0, 2.3, 0.9, 1.7, "#3f6212", { mat: "leaf" }); // mossy roof
    b.add("box", 0, 0, 0.71, 0.4, 0.7, 0.04, "#3b2a1a", { mat: "wood" });
    tower(b, -1.6, -1.2, 0.35, 2.4, "#6b4423", "#3f6212");
    const LOG = "#5f3a1d";
    for (const y of [0.2, 0.5, 0.8]) {
      for (const [x0, x1] of [[-1.0, -0.22], [0.22, 1.0]]) along(add, "capsule", [x0, y, 0.71], [x1, y, 0.71], 0.1, 0.1, LOG, hdo("wood"));
      along(add, "capsule", [-1.0, y, -0.71], [1.0, y, -0.71], 0.1, 0.1, LOG, hdo("wood"));
      for (const sx of [-1, 1]) along(add, "capsule", [sx * 1.01, y, -0.7], [sx * 1.01, y, 0.7], 0.1, 0.1, LOG, hdo("wood"));
    }
    for (const sx of [-1, 1]) add("cyl", sx * 0.24, 0, 0.74, 0.08, 0.76, 0.08, DARK_WOOD, hdo("wood"));
    along(add, "cyl", [-0.3, 0.78, 0.74], [0.3, 0.78, 0.74], 0.09, 0.09, DARK_WOOD, hdo("wood"));
    const [a3, a5] = [(3 / 18) * Math.PI * 2, (5 / 18) * Math.PI * 2];
    const [p, q]: V3[] = [[Math.cos(a3) * 2.4, 1.28, Math.sin(a3) * 2.4], [Math.cos(a5) * 2.4, 1.28, Math.sin(a5) * 2.4]];
    along(add, "cyl", p, q, 0.18, 0.18, LOG, hdo("wood"));
    const ag = (4 / 18) * Math.PI * 2;
    skull(add, Math.cos(ag) * 2.55, 0.92, Math.sin(ag) * 2.55, 0.28, "#efe6cf", Math.atan2(Math.cos(ag), Math.sin(ag)), hdo("bone"));
  },
  "bk-forgehold": (b, rng, hr) => {
    // HD: an iron-banded door between dressed jambs under a lintel, carved dwarf faces with beards on the guardian
    // pillars, an anvil with its horn, a hammer and a glowing bar, a quench tub
    const add = b.add.bind(b);
    b.add("box", 0, 0, -0.8, 4.6, 3.6, 2.0, BASALT, { mat: "hide" }); // cliff face
    b.add("pyramid", 0, 3.6, -0.8, 4.6, 1.4, 2.0, "#1c1b22", { mat: "hide" });
    b.add("box", 0, 0, 0.22, 1.2, 1.6, 0.05, "#7c2d12", { mat: "wood" }); // great door
    for (const x of [-1.5, -0.8, 0.8, 1.5]) b.add("box", x, 1.9, 0.22, 0.35, 0.5, 0.05, "#fb923c", { glow: true }); // forge-lit windows
    for (const x of [-1.6, 1.6]) {
      b.add("box", x, 0, 0.4, 0.6, 2.4, 0.6, "#3f3f46", { mat: "stone", hdShape: "block" }); // carved guardian pillars
      b.add("pyramid", x, 2.4, 0.4, 0.7, 0.4, 0.7, "#fbbf24", { mat: "gold" });
      add("egg", x, 1.75, 0.68, 0.38, 0.42, 0.2, "#4b4b53", hdo("stone"));
      stoneFace(add, x, 1.96, 0.62, 0.38, "#4b4b53");
      add("cone", x, 1.2, 0.74, 0.34, 0.6, 0.14, "#4b4b53", hdo("stone", { rx: Math.PI }));
      along(add, "capsule", [x - 0.2, 2.13, 0.74], [x + 0.2, 2.13, 0.74], 0.07, 0.07, "#4b4b53", hdo("stone"));
    }
    b.add("cyl", 1.2, 3.6, -1.2, 0.5, 1.2, 0.5, "#3f3f46", { mat: "stone" }); // chimney
    b.add("sphere", 1.2, 4.8, -1.2, 0.8, 0.8, 0.8, "#71717a");
    b.add("box", -0.9, 0, 1.3, 0.7, 0.45, 0.35, "#27272a", { mat: "iron" }); // anvil
    b.add("box", -0.9, 0.45, 1.3, 0.9, 0.15, 0.35, "#3f3f46", { mat: "iron" });
    for (const y of [0.3, 0.8, 1.3]) add("box", 0, y, 0.27, 1.26, 0.08, 0.06, "#18181b", hdo("iron"));
    for (const sx of [-1, 1]) add("box", sx * 0.68, 0, 0.28, 0.16, 1.6, 0.16, "#52525b", hdo("stone", { hdShape: "block" }));
    add("box", 0, 1.6, 0.28, 1.6, 0.22, 0.16, "#52525b", hdo("stone", { hdShape: "block" }));
    for (const x of [-0.8, 0.8]) add("box", x, 2.42, 0.26, 0.45, 0.07, 0.1, "#52525b", hdo("stone"));
    along(add, "cone", [-0.45, 0.53, 1.3], [-0.18, 0.55, 1.3], 0.15, 0.15, "#3f3f46", hdo("iron"));
    add("box", -1.05, 0.6, 1.25, 0.12, 0.1, 0.22, "#52525b", hdo("iron"));
    along(add, "cyl", [-1.05, 0.65, 1.36], [-1.1, 0.67, 1.72], 0.04, 0.04, "#5b3b22", hdo("wood"));
    add("box", -0.72, 0.6, 1.3, 0.3, 0.05, 0.06, "#f97316", hdo("plain", { glow: true }));
    add("cyl", -0.25, 0, 1.6, 0.36, 0.4, 0.36, "#5b3b22", hdo("wood"));
    add("cyl", -0.25, 0.28, 1.6, 0.39, 0.05, 0.39, IRON, hdo("dull"));
    add("cyl", -0.25, 0.37, 1.6, 0.3, 0.02, 0.3, "#1e3a5f", hdo("gel"));
  },
  "bk-thunderpeak": (b, rng, hr) => {
    // HD: a door and windows in the clan hall, copper coils round the lightning rods, stone caps on the towers, iron
    // hoops on the runic battery and cables from it to every tower
    const add = b.add.bind(b);
    b.add("cone", 0, -0.2, 0, 5.0, 1.6, 5.0, "#64748b", { mat: "hide" }); // high plateau
    b.add("box", 0, 1.1, 0, 2.4, 1.2, 1.8, "#475569", { mat: "stone", hdShape: "block" }); // clan hall
    b.add("prism", 0, 2.3, 0, 2.6, 0.8, 2.0, "#334155", { mat: "stone" });
    const towers: Array<[number, number]> = [
      [-1.6, -1.1],
      [1.6, -1.1],
      [0, 1.6]
    ];
    for (const [x, z] of towers) {
      b.add("cyl", x, 0.6, z, 0.5, 2.6, 0.5, "#475569", { mat: "stone" }); // lightning-rod towers
      b.add("cyl", x, 3.2, z, 0.08, 1.4, 0.08, "#cbd5e1", { mat: "steel" });
      b.add("octa", x, 4.5, z, 0.35, 0.55, 0.35, "#67e8f9", { glow: true });
      add("cyl", x, 3.04, z, 0.62, 0.12, 0.62, "#3a4658", hdo("stone"));
      for (const y of [3.45, 3.75, 4.05]) add("cyl", x, y, z, 0.22, 0.04, 0.22, "#b45309", hdo("gold"));
      along(add, "cyl", [1.2, 1.88, 0.9], [x, 3.0, z], 0.035, 0.035, "#1f2937", hdo("iron"));
    }
    b.add("cyl", 1.2, 1.1, 0.9, 0.5, 0.8, 0.5, "#22d3ee", { glow: true }); // runic battery
    for (const y of [1.2, 1.68]) add("cyl", 1.2, y, 0.9, 0.56, 0.06, 0.56, IRON, hdo("iron"));
    add("box", -0.35, 1.1, 0.93, 0.5, 0.7, 0.06, "#1e293b", hdo("wood"));
    add("box", -0.35, 1.82, 0.95, 0.7, 0.1, 0.12, "#3a4658", hdo("stone"));
    for (const x of [-0.95, 0.35]) add("box", x, 1.5, 0.92, 0.18, 0.26, 0.06, "#0f172a", hdo("gem"));
  },
  "bk-rider-eyrie": (b, rng, hr) => {
    // HD: rock at the spire's foot, a rim of woven twigs and two eggs in the nest; the perched drake with a saddle,
    // horns, eyes under a brow, a jaw, back spines, legs gripping the nest, finger bones along its wings and a tail
    const add = b.add.bind(b);
    b.add("cone", 0, 0, 0, 2.6, 5.0, 2.6, "#78716c", { mat: "hide" }); // precipitous spire
    b.add("cone", 0.9, 0, 0.5, 1.6, 2.6, 1.6, "#a8a29e", { mat: "hide" });
    b.add("cyl", 0, 3.4, 0, 2.2, 0.2, 2.2, "#57534e", { mat: "stone" }); // nest platform
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add("cyl", Math.cos(a) * 1.0, 3.55, Math.sin(a) * 1.0, 0.12, 0.25, 0.9, "#78350f", { ry: -a, mat: "wood" }); // nest twigs
    }
    const SCALE = "#0f766e";
    const d = b.child(0, 0, 0.6, 3.6); // perched drake
    d.add("sphere", 0, 0, 0, 0.7, 0.55, 1.0, SCALE, { mat: "hide", hdShape: "pod" });
    d.add("cyl", 0, 0.35, 0.45, 0.2, 0.6, 0.2, SCALE, { rx: 0.5, mat: "hide" });
    d.add("box", 0, 0.8, 0.7, 0.28, 0.24, 0.42, "#115e59", { mat: "hide" });
    d.add("box", -0.7, 0.4, -0.1, 1.1, 0.04, 0.6, "#134e4a", { rz: 0.5, mat: "hide" });
    d.add("box", 0.7, 0.4, -0.1, 1.1, 0.04, 0.6, "#134e4a", { rz: -0.5, mat: "hide" });
    flag(b.child(-0.8, 0.5, 0, 3.6), 0, 0, 0.9, "#0d9488");
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const s = 0.5 + hr() * 0.3;
      add("boulder", Math.cos(a) * 1.25, -0.1, Math.sin(a) * 1.25, s, s * 0.7, s, "#6b6560", hdo("hide", { ry: hr() * 6 }));
    }
    arc(add, [0, 3.7, 0], [1, 0, 0], [0, 0, 1], 0.98, 0, Math.PI * 2, 12, 0.1, "#5b3a1e", hdo("wood"));
    for (const [x, z] of [[0.62, -0.5], [0.42, -0.74]]) add("egg", x, 3.6, z, 0.22, 0.3, 0.22, "#99f6e4", hdo("bone"));
    const da = d.add.bind(d);
    const BONE = "#0b3b37";
    for (const sx of [-1, 1]) {
      along(da, "horn", [sx * 0.09, 1.0, 0.6], [sx * 0.2, 1.18, 0.34], 0.07, 0.07, "#e7e0d2", hdo("bone"));
      da("sphere", sx * 0.13, 0.94, 0.8, 0.07, 0.07, 0.07, "#fbbf24", hdo("plain", { glow: true }));
      along(da, "capsule", [sx * 0.16, 1.02, 0.72], [sx * 0.05, 1.04, 0.86], 0.05, 0.05, "#0b4f4a", hdo("hide"));
      // Legs gripping the nest, talons forward
      for (const sz of [0.3, -0.28]) {
        along(da, "limb", [sx * 0.22, 0.2, sz], [sx * 0.27, 0.0, sz + 0.06], 0.13, 0.13, SCALE, hdo("hide"));
        for (const k of [-1, 1]) along(da, "cone", [sx * 0.27 + k * 0.04, 0.02, sz + 0.08], [sx * 0.27 + k * 0.06, 0.01, sz + 0.2], 0.04, 0.04, "#e7e0d2", hdo("bone"));
      }
      // Finger bones along the folded wing, from the shoulder to its tip and back to its trailing edge
      const [nx, ny] = [sx * 0.479 * 0.04, 0.878 * 0.04];
      const inner: V3 = [sx * 0.217 + nx, 0.683 + ny, 0.2];
      const tip: V3 = [sx * 1.183 + nx, 0.157 + ny, 0.2];
      along(da, "capsule", inner, tip, 0.05, 0.05, BONE, hdo("bone"));
      for (const f of [0.6, 0.3]) along(da, "capsule", inner, [sx * (0.217 + 0.966 * f) + nx, 0.683 - 0.526 * f + ny, -0.4], 0.035, 0.035, BONE, hdo("bone"));
      along(da, "cone", tip, [tip[0] + sx * 0.08, tip[1] - 0.06, tip[2] + 0.04], 0.05, 0.05, "#e7e0d2", hdo("bone"));
      da("box", sx * 0.36, 0.14, -0.05, 0.04, 0.12, 0.08, IRON, hdo("iron")); // stirrup
    }
    da("box", 0, 0.78, 0.76, 0.24, 0.06, 0.34, "#0b3b37", hdo("hide", { rx: 0.12 })); // jaw
    for (const z of [0.22, 0, -0.22]) da("cone", 0, 0.5, z, 0.08, 0.16, 0.08, "#0b4f4a", hdo("bone"));
    da("box", 0, 0.5, -0.05, 0.38, 0.08, 0.32, "#7c2d12", hdo("leather")); // saddle
    da("box", 0, 0.58, 0.1, 0.1, 0.1, 0.06, "#7c2d12", hdo("leather"));
    tail(da, [0, 0.22, -0.46], { len: 1.4, w0: 0.2, w1: 0.05, color: SCALE, n: 5, pitch: 0.25, curl: -0.2, yaw: 0.5 }, hdo("hide"));
  }
};

/** Highest point of the parts built so far (the motes orbit over it; HD detail never moves them) */
const topOf = (b: Builder) => Math.max(2, ...b.out.parts.filter((p) => p.hd !== true).map((p) => p.y + p.h / 2));

/**
 * A realm of `type` at `stage` (0 common … 3 epic), every stage on top of the one before. Common is matte: its
 * core's lights come on from uncommon up; metal shines from rare up.
 */
export function buildRealmModel(type: string, b: Builder, rng: Rng, stage: number) {
  const st = STYLES[type];
  const core = CORES[type];
  if (!st || !core) return;
  const sea = WATER_REALM_TYPES.has(type);
  const start = b.out.parts.length;
  // HD detail's own randomness: the same for every copy and stage, so a stage's model starts with the whole one before
  const hr = rngFor(`${type}:hd`);
  core(b, rng, hr);
  if (stage <= 0) for (let i = start; i < b.out.parts.length; i++) b.out.parts[i] = { ...b.out.parts[i], glow: false };
  if (sea) jetty(b);
  const coreTop = topOf(b);
  for (let s = 1; s <= Math.min(3, stage); s++) {
    for (const a of HUT_SLOTS[s]) {
      const r = sea ? WATER_HUT_R : HUT_R;
      hut(b, Math.cos(a) * r, Math.sin(a) * r, a, st, sea, rng);
    }
    if (s === 1) flag(b.child(0.9, sea ? REALM_JETTY_R : HUT_R - 0.2, 0, sea ? 0.38 : 0), 0, 0, 1.8, st.accent);
    if (s === 2) walls(b, st, sea, hr);
    if (s === 3) grandeur(b, st, sea, coreTop);
  }
  if (stage <= 1) for (let i = start; i < b.out.parts.length; i++) if (SHINY.has(b.out.parts[i].mat!)) b.out.parts[i] = { ...b.out.parts[i], mat: "dull" };
}
