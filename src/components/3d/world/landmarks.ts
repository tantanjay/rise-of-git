import { Rng, range, rngFor } from "@/utils/random";
import { Builder, IDLE_KIND, Shape, Surface } from "@/components/3d/city/parts";
import { Add, AddOpts, V3, along, arc, bone, coins, lanternFrame, skull, wheel } from "./kitParts";
import { FigureLook, faceAt, shade } from "./spawnModels";
import { LEGENDARY_LANDMARK_TYPES, buildLegendaryLandmark } from "./legendaryLandmarks";
import { GATE_MODEL_TYPES, buildGateModel } from "./gates";
import { REALM_MODEL_TYPES, WATER_REALM_TYPES } from "./realmTypes";

/**
 * Instanced models for the buffer-zone kingdoms (`bk-*`) and terrain landmarks (`lm-*`).
 * Every entry in the server's BUFFER_POOLS has its own type so no two look alike.
 * Models are ~5 units across, built from a few shapes so each costs only a handful of draw calls.
 */

export const LANDMARK_MODEL_TYPES = new Set<string>([
  // Buffer realms (staged models: realms.ts)
  ...REALM_MODEL_TYPES,
  // Terrain landmarks
  "lm-coral-trench",
  "lm-atlantis-spire",
  "lm-pearl-lagoon",
  "lm-palm-oasis",
  "lm-obsidian-pyramid",
  "lm-titan-skeleton",
  "lm-sandstone-canyon",
  "lm-stonehenge",
  "lm-world-tree",
  "lm-mushroom-megalith",
  "lm-bandit-stockade",
  "lm-ignis-caldera",
  "lm-iron-delve",
  "lm-glacial-peak",
  "lm-basalt-gorge",
  // Epic landmarks added with the weekly rotation (each region's pool of 6)
  "lm-shipwreck",
  "lm-drowned-lighthouse",
  "lm-leviathan-arch",
  "lm-sun-temple",
  "lm-tomb-of-kings",
  "lm-moonwell",
  "lm-spirit-grove",
  "lm-giants-forge",
  "lm-sky-bridge",
  // Legendary landmarks (one per region, always standing)
  ...LEGENDARY_LANDMARK_TYPES,
  // Frontier gates, one per mortal province, in its civilization's style
  ...GATE_MODEL_TYPES
]);

/** Sea-based entries: no land pad under them, they float at sea level */
export const WATER_LANDMARK_TYPES = new Set<string>([
  ...WATER_REALM_TYPES,
  "lm-coral-trench",
  "lm-atlantis-spire",
  "lm-pearl-lagoon",
  "lm-shipwreck",
  "lm-drowned-lighthouse",
  "lm-leviathan-arch",
  // Roving crews afloat (the server rolls them only on the Sunken Fjord's open water)
  "bandit-corsair",
  "bandit-riverpirate"
]);

/**
 * Each buffer region's pool of 6 epic landmarks (1 stands at a time, rotating every Sunday 00:00 UTC), in the
 * region's style. Mirrors the server's BUFFER_POOLS terrains.
 */
export const EPIC_LANDMARK_POOLS: Record<string, string[]> = {
  "buf-sea-fjord": ["lm-shipwreck", "lm-coral-trench", "lm-atlantis-spire", "lm-pearl-lagoon", "lm-drowned-lighthouse", "lm-leviathan-arch"],
  "buf-scorch-desert": ["lm-palm-oasis", "lm-obsidian-pyramid", "lm-titan-skeleton", "lm-sandstone-canyon", "lm-sun-temple", "lm-tomb-of-kings"],
  "buf-whisper-woods": ["lm-stonehenge", "lm-world-tree", "lm-mushroom-megalith", "lm-bandit-stockade", "lm-moonwell", "lm-spirit-grove"],
  "buf-dragon-peaks": ["lm-ignis-caldera", "lm-iron-delve", "lm-glacial-peak", "lm-basalt-gorge", "lm-giants-forge", "lm-sky-bridge"]
};
export const EPIC_LANDMARK_TYPES = new Set(Object.values(EPIC_LANDMARK_POOLS).flat());

/** Magical sites: on a rotation day they are shaped by floating stones instead of built under scaffolding */
export const MAGICAL_LANDMARK_TYPES = new Set([
  "lm-coral-trench",
  "lm-atlantis-spire",
  "lm-pearl-lagoon",
  "lm-leviathan-arch",
  "lm-obsidian-pyramid",
  "lm-stonehenge",
  "lm-mushroom-megalith",
  "lm-moonwell",
  "lm-spirit-grove",
  "lm-glacial-peak"
]);

/**
 * A cylinder (or box) lying along the segment (x0, y0) → (x1, y1) of the upright plane at depth z: bones, arches and
 * leaning towers.
 */
export function strut(b: Builder, shape: "cyl" | "box", x0: number, y0: number, x1: number, y1: number, z: number, thick: number, color: string, o: { glow?: boolean; mat?: Surface; hdShape?: Shape; hd?: boolean } = {}) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  b.add(shape, cx, cy - len / 2, z, thick, len, thick, color, { rz: -Math.atan2(x1 - x0, y1 - y0), glow: o.glow, mat: o.mat, hdShape: o.hdShape, hd: o.hd });
}

export const BONE = "#efe6cf";
export const WATER = "#1d6fa5";
export const SAND = "#d9b36c";
export const BASALT = "#2b2a33";

/* --- helpers --------------------------------------------------------------- */

/** Shallow water disc the sea kingdoms stand in (HD: wet and glossy) */
export function water(b: Builder, r: number, color = WATER) {
  b.add("cyl", 0, 0.02, 0, r * 2, 0.06, r * 2, color, { mat: "gel" });
}

const hdo = (mat: Surface, o: AddOpts = {}): AddOpts => ({ ...o, mat, hd: true });

/** Round tower with a conical roof. HD: masonry, a corbelled ring under the eaves, an arrow slit, a finial */
export function tower(b: Builder, x: number, z: number, r: number, h: number, wall: string, roof: string) {
  b.add("cyl", x, 0, z, r * 2, h, r * 2, wall, { mat: "stone" });
  b.add("cone", x, h, z, r * 2.5, r * 2.2, r * 2.5, roof, { mat: "wood" });
  b.add("cyl", x, h - 0.22, z, r * 2 + 0.1, 0.14, r * 2 + 0.1, shade(wall, 0.85), hdo("stone"));
  b.add("box", x, h * 0.55, z + r - 0.02, 0.07, Math.min(0.4, h * 0.14), 0.1, "#1c1917", hdo("stone"));
  b.add("sphere", x, h + r * 2.2 - 0.04, z, 0.1, 0.1, 0.1, "#a16207", hdo("dull"));
}

/** Tree: trunk + round canopy */
export function tree(b: Builder, x: number, z: number, h: number, leaf: string, trunk = "#5b3b22") {
  b.add("cyl", x, 0, z, 0.3, h, 0.3, trunk);
  b.add("sphere", x, h - 0.3, z, h * 0.65, h * 0.55, h * 0.65, leaf, { idle: IDLE_KIND.sway });
}

/** Groups of a palm's frond parts (`sync`): far above any other group a model numbers, unique within a model */
let palmSync = 1000;

/** Palm: leaning trunk + drooping fronds. HD: a ringed trunk, fronds arching to drooping tips, coconuts under the crown */
export function palm(b: Builder, x: number, z: number, lean: number) {
  b.add("cyl", x, 0, z, 0.18, 2.2, 0.18, "#8b5a2b", { rz: lean, mat: "wood", hdShape: "taper" });
  const tx = x - Math.sin(lean) * 2.1;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const sync = palmSync++;
    b.add("box", tx + Math.cos(a) * 0.45, 2.0, z + Math.sin(a) * 0.45, 1.0, 0.06, 0.3, "#3f9a3a", { ry: -a, rz: 0.4, idle: IDLE_KIND.sway, hd: false, sync });
    // HD: a rib arching up out of the crown and drooping, leaflets along both its sides, swaying with it
    const f = b.child(tx, z, Math.PI / 2 - a);
    const fa = f.add.bind(f);
    const o = hdo("leaf", { idle: IDLE_KIND.sway, sync });
    const rib: V3[] = [
      [0, 2.02, 0.05],
      [0, 2.28, 0.45],
      [0, 2.24, 0.82],
      [0, 2.02, 1.15]
    ];
    for (let k = 0; k < 3; k++) along(fa, "cyl", rib[k], rib[k + 1], 0.045 - k * 0.01, 0.045 - k * 0.01, "#65a30d", { ...o, mat: "wood" });
    for (let k = 0; k < 7; k++) {
      const t = 0.12 + (k / 6) * 0.8;
      const seg = Math.min(2, Math.floor(t * 3));
      const u = t * 3 - seg;
      const p: V3 = [0, rib[seg][1] + (rib[seg + 1][1] - rib[seg][1]) * u, rib[seg][2] + (rib[seg + 1][2] - rib[seg][2]) * u];
      const len = 0.32 * (1 - Math.abs(t - 0.45) * 0.9);
      // Each leaflet lies flat, its outer end dipping
      const dip = 0.03 + t * 0.07;
      for (const side of [-1, 1]) fa("box", (side * len) / 2, p[1] - dip / 2 - 0.0075, p[2] + 0.04, Math.hypot(len, dip), 0.015, 0.09, k % 2 ? "#3f9a3a" : "#4a9f3c", { ...o, rz: -side * Math.atan2(dip, len) });
    }
  }
  // The trunk's rings, laid along its lean
  const up: V3 = [-Math.sin(lean), Math.cos(lean), 0];
  for (const f of [0.2, 0.45, 0.7]) {
    // Points along the trunk, which turns about its middle (x, 1.1)
    const c: V3 = [x + up[0] * 2.2 * (f - 0.5), 1.1 + up[1] * 2.2 * (f - 0.5), z];
    along(b.add.bind(b), "cyl", c, [c[0] + up[0] * 0.06, c[1] + up[1] * 0.06, z], 0.22, 0.22, "#6b4423", hdo("wood"));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    b.add("sphere", x - Math.sin(lean) * 1.1 + Math.cos(a) * 0.1, 1.1 + Math.cos(lean) * 1.1 - 0.16, z + Math.sin(a) * 0.1, 0.14, 0.14, 0.14, "#5b3b22", hdo("wood"));
  }
}

/** Robed figure (druids, sultans, merfolk), ~1 unit tall at s = 1. HD: a mantle, sleeves to hands folded at the waist, a face, a hood of hair */
export function robed(b: Builder, x: number, z: number, robe: string, skin: string, s = 1) {
  b.add("cone", x, 0, z, 0.55 * s, 0.85 * s, 0.55 * s, robe, { mat: "cloth" });
  b.add("sphere", x, 0.78 * s, z, 0.28 * s, 0.28 * s, 0.28 * s, skin, { mat: "skin", hdShape: "egg" });
  const add: Add = (shape, px, y0, pz, w, h, d, color, o) => b.add(shape, x + px, y0, z + pz, w, h, d, color, o);
  add("sphere", 0, 0.5 * s, 0, 0.42 * s, 0.2 * s, 0.36 * s, shade(robe, 0.85), hdo("cloth")); // mantle over the shoulders
  for (const side of [-1, 1]) {
    along(add, "limb", [side * 0.16 * s, 0.66 * s, 0], [side * 0.08 * s, 0.42 * s, 0.13 * s], 0.11 * s, 0.11 * s, robe, hdo("cloth")); // sleeves
    add("sphere", side * 0.035 * s, 0.38 * s, 0.17 * s, 0.08 * s, 0.07 * s, 0.08 * s, skin, hdo("skin")); // hands folded
  }
  add("sphere", 0, 0.82 * s, -0.04 * s, 0.31 * s, 0.26 * s, 0.3 * s, shade(robe, 0.7), hdo("cloth")); // hood
  const look: FigureLook = { skin, tunic: robe, legs: robe, boots: robe, belt: robe, eyes: "#1e293b" };
  faceAt(add, look, {}, 0.92 * s, 0, (0.28 * s) / 0.34);
}

/** Simple flag on a pole. HD: a turned pole with a knob on top */
export function flag(b: Builder, x: number, z: number, h: number, color: string) {
  b.add("cyl", x, 0, z, 0.06, h, 0.06, "#3f2a1a", { mat: "wood" });
  b.add("box", x + 0.28, h - 0.45, z, 0.55, 0.4, 0.03, color, { idle: IDLE_KIND.flutter, mat: "cloth" });
  b.add("sphere", x, h - 0.02, z, 0.1, 0.1, 0.1, "#a16207", hdo("dull"));
}

/** Small ship hull with mast and sail. HD: planked hull with rails and strakes, a bowsprit, yard and boom, stays */
export function ship(b: Builder, x: number, z: number, rot: number, sail: string, s = 1) {
  const sh = b.child(x, z, rot);
  sh.add("box", 0, 0, 0, 0.9 * s, 0.45 * s, 2.2 * s, "#5b3b22", { mat: "wood" });
  sh.add("prism", 0, 0, 1.3 * s, 0.9 * s, 0.45 * s, 0.4 * s, "#5b3b22", { ry: Math.PI / 2, mat: "wood" });
  sh.add("cyl", 0, 0.4 * s, 0, 0.07 * s, 2.0 * s, 0.07 * s, "#3f2a1a", { mat: "wood" });
  sh.add("box", 0, 0.9 * s, 0.03, 1.1 * s, 1.0 * s, 0.04, sail, { idle: IDLE_KIND.flutter, mat: "cloth" });
  const add = sh.add.bind(sh);
  const RAIL = "#3b2414";
  for (const sx of [-1, 1]) {
    add("box", sx * 0.45 * s, 0.4 * s, 0, 0.07, 0.12 * s, 2.2 * s, RAIL, hdo("wood")); // gunwale
    add("box", sx * (0.45 * s + 0.025), 0.15 * s, 0, 0.05, 0.05 * s, 2.1 * s, RAIL, hdo("wood")); // strake
  }
  along(add, "cyl", [0, 0.38 * s, 1.35 * s], [0, 0.62 * s, 1.95 * s], 0.06 * s, 0.06 * s, RAIL, hdo("wood")); // bowsprit
  along(add, "cyl", [-0.6 * s, 1.92 * s, 0.08], [0.6 * s, 1.92 * s, 0.08], 0.05 * s, 0.05 * s, RAIL, hdo("wood")); // yard
  along(add, "cyl", [-0.55 * s, 0.88 * s, 0.08], [0.55 * s, 0.88 * s, 0.08], 0.045 * s, 0.045 * s, RAIL, hdo("wood")); // boom
  const ROPE = "#c8b48a";
  along(add, "cyl", [0, 2.36 * s, 0], [0, 0.6 * s, 1.92 * s], 0.018, 0.018, ROPE, hdo("cloth")); // forestay
  along(add, "cyl", [0, 2.36 * s, 0], [0, 0.48 * s, -1.08 * s], 0.018, 0.018, ROPE, hdo("cloth")); // backstay
  for (const sx of [-1, 1]) along(add, "cyl", [0, 2.0 * s, 0], [sx * 0.46 * s, 0.5 * s, -0.15 * s], 0.016, 0.016, ROPE, hdo("cloth")); // shrouds
}

/*
 * HD (the model kit) for the epic terrain landmarks: the richest kit version on the rarity ladder. Real materials
 * (dressed and raw stone, bone, timber, bark and leaves, wet coral, obsidian glass, iron and gilt), HD-only detail
 * (carvings, fittings, rigging, props), emissive details (runes, embers, lit windows, glowing veins) and secondary
 * motion on many parts (weed and reeds sway, cloth flutters, birds, moths and spirits glide round). Structures stand
 * still; the aura still comes from TierFx. HD randomness takes its own rng (`hr`), never the model's.
 */
const ROPE = "#c8b48a";

/** Rune glyphs as strokes (x, y of the stroke's centre, length, turn) in a cell about 0.4 tall */
const RUNES: Array<Array<[number, number, number, number]>> = [
  [[0, 0, 0.4, 0], [0.07, 0.1, 0.17, -0.8], [0.07, -0.02, 0.17, -0.8]],
  [[0, -0.04, 0.32, 0], [-0.08, 0.15, 0.18, 0.6], [0.08, 0.15, 0.18, -0.6]],
  [[-0.06, 0.06, 0.18, 0.78], [0.06, 0.06, 0.18, -0.78], [-0.06, -0.06, 0.18, -0.78], [0.06, -0.06, 0.18, 0.78]],
  [[-0.06, 0, 0.4, 0], [0.06, 0, 0.4, 0], [0, 0.04, 0.2, 0.9]],
  [[0, 0, 0.4, 0], [0.06, 0.12, 0.14, 0.8], [0.06, 0.02, 0.14, -0.8]]
];

/**
 * HD: a pharaoh statue's carved face on a head centred at local (0, cy, cz) about 0.4 across, facing +z: a brow, almond
 * eyes lit from within and lined in kohl, cheekbones, a straight nose, full lips and a firm chin, all in its stone
 */
function pharaohFace(add: Add, cy: number, cz: number, stone: string) {
  const o = hdo("plain");
  const dark = shade(stone, 0.55);
  const f = (x: number, y: number, z: number): V3 => [x, cy + y, cz + z];
  for (const side of [-1, 1]) {
    along(add, "capsule", f(side * 0.025, 0.075, 0.175), f(side * 0.13, 0.065, 0.14), 0.035, 0.03, shade(stone, 0.9), o); // brow
    add("egg", side * 0.075, cy + 0.02, cz + 0.158, 0.09, 0.04, 0.04, "#22d3ee", hdo("plain", { glow: true, rz: side * 0.12 })); // eye
    along(add, "capsule", f(side * 0.03, 0.045, 0.172), f(side * 0.12, 0.04, 0.16), 0.022, 0.02, stone, o); // upper lid
    along(add, "capsule", f(side * 0.115, 0.03, 0.155), f(side * 0.165, 0.035, 0.125), 0.018, 0.018, dark, o); // kohl line
    add("sphere", side * 0.105, cy - 0.055, cz + 0.12, 0.09, 0.07, 0.07, stone, o); // cheekbone
  }
  along(add, "box", f(0, 0.04, 0.18), f(0, -0.045, 0.205), 0.045, 0.05, stone, o); // nose
  add("egg", 0, cy - 0.065, cz + 0.19, 0.075, 0.04, 0.05, stone, hdo("plain", { rx: Math.PI })); // its tip and wings
  along(add, "capsule", f(-0.05, -0.098, 0.18), f(0.05, -0.098, 0.18), 0.028, 0.026, shade(stone, 0.85), o); // upper lip
  along(add, "capsule", f(-0.04, -0.122, 0.172), f(0.04, -0.122, 0.172), 0.032, 0.028, shade(stone, 0.85), o); // lower lip
  along(add, "capsule", f(-0.035, -0.11, 0.19), f(0.035, -0.11, 0.19), 0.01, 0.01, dark, o); // the mouth's line
  add("egg", 0, cy - 0.19, cz + 0.13, 0.13, 0.07, 0.09, stone, o); // chin
}

/**
 * HD: a stone dwarf guardian's carved face on a head centred at local (0, cy, cz) about 0.36 across, facing +z: a heavy
 * brow over deep-set eyes, a broad bulbous nose, round cheeks and a moustache drooping into the beard
 */
export function dwarfFace(add: Add, cy: number, cz: number, stone: string) {
  const o = hdo("stone");
  const f = (x: number, y: number, z: number): V3 => [x, cy + y, cz + z];
  along(add, "capsule", f(-0.13, 0.075, 0.12), f(0.13, 0.075, 0.12), 0.055, 0.05, shade(stone, 0.95), o); // heavy brow
  for (const side of [-1, 1]) {
    add("sphere", side * 0.06, cy + 0.015, cz + 0.135, 0.065, 0.045, 0.05, shade(stone, 0.5), o); // deep socket
    add("sphere", side * 0.06, cy + 0.022, cz + 0.152, 0.032, 0.028, 0.03, shade(stone, 1.1), o); // the eye in it
    add("sphere", side * 0.095, cy - 0.045, cz + 0.12, 0.085, 0.07, 0.07, stone, o); // cheek
    along(add, "capsule", f(side * 0.02, -0.05, 0.185), f(side * 0.13, -0.1, 0.15), 0.045, 0.038, "#d6d3d1", o); // moustache
  }
  along(add, "capsule", f(0, 0.045, 0.15), f(0, -0.01, 0.18), 0.04, 0.04, stone, o); // nose bridge
  add("sphere", 0, cy - 0.06, cz + 0.17, 0.09, 0.08, 0.085, stone, o); // bulb of the nose
}

/** HD: a thin ring of foam lapping round something standing in the water at (x, z), radii rx × rz */
function foam(add: Add, x: number, z: number, rx: number, rz: number) {
  arc(add, [x, 0.09, z], [1, 0, 0], [0, 0, 1], [rx, rz], 0, Math.PI * 2, Math.max(14, Math.round((rx + rz) * 12)), 0.045, "#bae6fd", hdo("plain"));
}

/** HD: rune `i` on a face whose front stands at local z, centred on (x, y), `s` its size: strokes sticking out of the face, lit unless `lit` is false (carved) */
export function rune(add: Add, i: number, x: number, y: number, z: number, s: number, color = "#67e8f9", o: AddOpts = {}, lit = true) {
  for (const [sx, sy, len, rz] of RUNES[i % RUNES.length]) {
    const h = len * s;
    add("box", x + sx * s, y + sy * s - h / 2, z, 0.05 * s, h, 0.07, color, hdo(lit ? "plain" : "stone", { ...o, glow: lit, rz }));
  }
}
const IRON = "#27272a";

/** HD: a bird gliding round an orbit (it flies toward +z where it is drawn), in place of a Normal octa: body, head, beak, banked wings and a tail */
export function bird(add: Add, x: number, y: number, z: number, s: number, body: string, wing: string, beak: string, spin: AddOpts) {
  const o = hdo("plain", spin);
  along(add, "capsule", [x, y, z - 0.2 * s], [x, y + 0.02 * s, z + 0.16 * s], 0.11 * s, 0.1 * s, body, o);
  add("sphere", x, y - 0.02 * s, z + 0.17 * s, 0.1 * s, 0.09 * s, 0.11 * s, body, o);
  along(add, "cone", [x, y + 0.02 * s, z + 0.21 * s], [x, y, z + 0.31 * s], 0.035 * s, 0.03 * s, beak, o);
  for (const side of [-1, 1]) {
    along(add, "box", [x + side * 0.04 * s, y + 0.02 * s, z], [x + side * 0.28 * s, y + 0.09 * s, z - 0.02 * s], 0.15 * s, 0.02 * s, wing, o);
    along(add, "box", [x + side * 0.27 * s, y + 0.09 * s, z - 0.02 * s], [x + side * 0.48 * s, y + 0.05 * s, z - 0.08 * s], 0.1 * s, 0.018 * s, shade(wing, 0.7), o);
  }
  along(add, "box", [x, y + 0.01 * s, z - 0.18 * s], [x, y + 0.02 * s, z - 0.32 * s], 0.12 * s, 0.015 * s, wing, o);
}

/**
 * HD: an `add` in the frame of a hull tilted by (rx, rz) about local point `c` (Builder's Euler order, ry 0): each part
 * is moved with the tilt and takes the same turn, so detail lies on the hull. For parts without a turn of their own
 */
function tiltAdd(add: Add, c: V3, rx: number, rz: number): { add: Add; at: (p: V3) => V3 } {
  const at = (p: V3): V3 => {
    const [x, y, z] = p;
    const x1 = x * Math.cos(rz) - y * Math.sin(rz);
    const y1 = x * Math.sin(rz) + y * Math.cos(rz);
    return [c[0] + x1, c[1] + y1 * Math.cos(rx) - z * Math.sin(rx), c[2] + y1 * Math.sin(rx) + z * Math.cos(rx)];
  };
  return {
    at,
    add: (shape, x, y0, z, w, h, d, color, o = {}) => {
      const [px, py, pz] = at([x, y0 + h / 2, z]);
      add(shape, px, py - h / 2, pz, w, h, d, color, { ...o, rx, rz });
    }
  };
}

export function buildLandmarkModel(type: string, b: Builder, rng: Rng) {
  if (buildLegendaryLandmark(type, b) || buildGateModel(type, b)) return;
  const add = b.add.bind(b);
  const hr = rngFor(`${type}:hd`);
  switch (type) {
    /* ============================ FJORD ============================ */
    case "lm-coral-trench": {
      water(b, 2.9, "#0c4a6e");
      b.add("box", 0, 0.02, 0, 4.4, 0.05, 1.0, "#020617", { ry: 0.4, mat: "stone" }); // the fissure
      const anemones: Array<[number, number, number, string]> = [];
      for (let i = 0; i < 10; i++) {
        const t = i / 9 - 0.5;
        const side = i % 2 ? 1 : -1;
        const x = t * 4 * Math.cos(0.4) + side * 0.8 * Math.sin(0.4);
        const z = -t * 4 * Math.sin(0.4) + side * 0.8 * Math.cos(0.4);
        const h = range(rng, 0.6, 1.3);
        const c = ["#f472b6", "#22d3ee", "#a3e635"][i % 3];
        b.add("cone", x, 0, z, 0.35, h, 0.35, c, { glow: true }); // anemones
        anemones.push([x, z, h, c]);
      }
      const pearls: Array<[number, number]> = [];
      for (let i = 0; i < 4; i++) {
        const px = range(rng, -1, 1);
        const pz = range(rng, -0.3, 0.3);
        b.add("sphere", px, 0.05, pz, 0.25, 0.25, 0.25, "#f8fafc", { glow: true }); // tide pearls
        pearls.push([px, pz]);
      }
      // HD: rocky lips along the fissure, bubbles rising from its vents, each anemone on a wet foot with a crown of
      // swaying tentacles, brain and branching corals and sea fans between them, weed swaying round the rim, clams
      // holding the pearls
      const [dx, dz, nx, nz] = [Math.cos(0.4), -Math.sin(0.4), Math.sin(0.4), Math.cos(0.4)];
      for (let i = 0; i < 9; i++) {
        const t = (i / 8 - 0.5) * 4.1;
        for (const side of [-1, 1]) {
          const s = 0.3 + hr() * 0.25;
          add("sphere", dx * t + nx * side * (0.56 + hr() * 0.08), -0.06, dz * t + nz * side * (0.56 + hr() * 0.08), s * 1.3, s * 0.55, s, "#1e293b", hdo("hide", { hdShape: "boulder", ry: hr() * 3 }));
        }
      }
      for (const t of [-1.3, 0.2, 1.4]) for (let k = 0; k < 3; k++) add("sphere", dx * t, 0.1, dz * t, 0.16, 0.16, 0.16, "#bae6fd", hdo("gel", { idle: IDLE_KIND.smoke, phase: 0.01 + t + (k * Math.PI * 2) / 3 }));
      for (const [x, z, h, c] of anemones) {
        add("cyl", x, 0, z, 0.44, 0.12, 0.44, shade(c, 0.45), hdo("gel"));
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2 + hr();
          const y = h * (0.62 + (k % 3) * 0.08);
          const r = 0.08 + (h - y) * 0.12;
          along(add, "capsule", [x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(a) * (r + 0.2), y + 0.1 + hr() * 0.06, z + Math.sin(a) * (r + 0.2)], 0.04, 0.04, c, hdo("gel", { glow: true, idle: IDLE_KIND.sway }));
        }
      }
      for (let i = 0; i < 7; i++) {
        const t = (hr() - 0.5) * 3.6;
        const side = i % 2 ? 1 : -1;
        const [x, z] = [dx * t + nx * side * (1.25 + hr() * 0.5), dz * t + nz * side * (1.25 + hr() * 0.5)];
        const c = ["#fb7185", "#f59e0b", "#c084fc"][i % 3];
        if (i % 3 === 0) {
          add("sphere", x, 0, z, 0.5, 0.3, 0.45, c, hdo("hide", { hdShape: "boulder" })); // brain coral
        } else if (i % 3 === 1) {
          for (let k = 0; k < 4; k++) {
            const a = hr() * Math.PI * 2;
            along(add, "taper", [x, 0, z], [x + Math.cos(a) * 0.2, 0.45 + hr() * 0.25, z + Math.sin(a) * 0.2], 0.09, 0.09, c, hdo("bone")); // branching coral
          }
        } else {
          // A sea fan: ribs fanning up from its foot in one plane, swaying as one
          const ry = hr() * 3;
          for (let k = 0; k < 6; k++) {
            const a = -0.9 + (k / 5) * 1.8;
            along(add, "capsule", [x, 0.02, z], [x + Math.cos(ry) * Math.sin(a) * 0.4, 0.1 + Math.cos(a) * 0.45, z - Math.sin(ry) * Math.sin(a) * 0.4], 0.03, 0.03, c, hdo("leaf", { idle: IDLE_KIND.sway, sync: 20 + i }));
          }
        }
      }
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + hr() * 0.3;
        add("cone", Math.cos(a) * 2.55, 0, Math.sin(a) * 2.55, 0.12, 0.7 + hr() * 0.5, 0.12, "#15803d", hdo("leaf", { idle: IDLE_KIND.sway }));
      }
      for (const [px, pz] of pearls) {
        add("sphere", px, 0.0, pz, 0.42, 0.12, 0.36, "#475569", hdo("bone"));
        add("sphere", px, 0.2 - 0.06, pz - 0.2, 0.42, 0.12, 0.36, "#64748b", hdo("bone", { rx: -1.1 }));
      }
      break;
    }
    case "lm-atlantis-spire": {
      water(b, 2.6, "#0369a1");
      b.add("box", 0, 0, 0, 1.1, 4.2, 1.1, BASALT, { mat: "stone", hdShape: "block" }); // obelisk
      b.add("pyramid", 0, 4.2, 0, 1.1, 0.9, 1.1, BASALT, { mat: "stone" });
      for (const y of [0.9, 2.0, 3.1]) b.add("box", 0, y, 0, 1.16, 0.12, 1.16, "#22d3ee", { glow: true }); // rune bands
      for (const [x, z] of [
        [-1.4, 0.6],
        [1.3, -0.9],
        [0.9, 1.3]
      ]) {
        b.add("box", x, 0, z, 0.6, 0.6, 0.6, "#3f3f46", { ry: range(rng, 0, 1), rz: 0.3, mat: "stone", hdShape: "block" }); // fallen blocks
      }
      // HD: a stepped plinth, glyphs lit between the rune bands on every face, barnacles and weed at the waterline, a
      // glowing capstone turning on the tip with motes circling it, a column stump and a drum of it lying in the shallows
      add("box", 0, 0, 0, 1.75, 0.2, 1.75, "#334155", hdo("stone", { hdShape: "block" }));
      add("box", 0, 0.2, 0, 1.4, 0.2, 1.4, "#3b4757", hdo("stone", { hdShape: "block" }));
      for (let k = 0; k < 4; k++) {
        const f = b.child(0, 0, (k * Math.PI) / 2);
        for (const [i, y] of [1.45, 2.55, 3.65].entries()) rune(f.add.bind(f), k + i, 0, y, 0.575, 1);
        for (let i = 0; i < 3; i++) f.add("cone", -0.35 + i * 0.32 + hr() * 0.08, 0.42 + hr() * 0.1, 0.6, 0.1, 0.09, 0.1, "#d6d3d1", hdo("bone", { rx: Math.PI / 2 })); // barnacles
        f.add("cone", 0.42, 0.4, 0.62, 0.08, 0.55, 0.08, "#15803d", hdo("leaf", { idle: IDLE_KIND.sway }));
      }
      add("octa", 0, 5.12, 0, 0.26, 0.42, 0.26, "#a5f3fc", hdo("gem", { glow: true, idle: IDLE_KIND.spin }));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        add("octa", Math.cos(a) * 0.95, 4.5 + (i % 2) * 0.3, Math.sin(a) * 0.95, 0.1, 0.14, 0.1, "#67e8f9", hdo("plain", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 1.57 }));
      }
      add("cyl", 1.75, 0, 0.55, 0.5, 0.7, 0.5, "#52525b", hdo("stone"));
      add("cyl", 1.75, 0.7, 0.55, 0.62, 0.12, 0.62, "#3f3f46", hdo("stone"));
      along(add, "cyl", [-0.9, 0.1, -1.55], [0.35, 0.12, -1.9], 0.5, 0.5, "#52525b", hdo("stone"));
      for (const [x, z] of [
        [-0.5, -1.62],
        [0.1, -1.8]
      ]) {
        add("cone", x, 0.3, z, 0.1, 0.42, 0.1, "#15803d", hdo("leaf", { idle: IDLE_KIND.sway }));
      }
      break;
    }
    case "lm-pearl-lagoon": {
      water(b, 2.8, "#38bdf8");
      b.add("sphere", -0.8, -0.4, -0.6, 2.0, 1.2, 1.6, "#9ca3af", { mat: "hide", hdShape: "boulder" });
      b.add("sphere", 1.2, -0.3, 0.4, 1.2, 0.9, 1.1, "#6b7280", { mat: "hide", hdShape: "boulder" });
      for (const [x, z, r] of [
        [0.2, 1.2, 0.3],
        [-1.6, 0.9, -0.5],
        [1.6, -1.1, 1.2]
      ]) {
        const o = b.child(x, z, r);
        o.add("sphere", 0, 0, 0, 0.9, 0.3, 0.8, "#cbd5e1", { mat: "bone" }); // giant oyster
        o.add("sphere", 0, 0.25, -0.25, 0.9, 0.3, 0.8, "#e2e8f0", { rx: -0.9, mat: "bone" });
        o.add("sphere", 0, 0.18, 0.05, 0.3, 0.3, 0.3, "#fdf4ff", { glow: true });
        // HD: a frilled lip round the lower shell, the hinge, ridges fanning over the open lid
        arc(o.add.bind(o), [0, 0.15, 0], [1, 0, 0], [0, 0, 1], [0.44, 0.39], 0, Math.PI * 2, 14, 0.05, "#94a3b8", hdo("bone"));
        along(o.add.bind(o), "capsule", [-0.22, 0.2, -0.36], [0.22, 0.2, -0.36], 0.08, 0.08, "#94a3b8", hdo("bone"));
        for (let k = 0; k < 5; k++) {
          const sx = (k - 2) * 0.13;
          along(o.add.bind(o), "capsule", [sx * 0.4, 0.27, -0.42], [sx, 0.6, -0.12], 0.035, 0.035, "#cbd5e1", hdo("bone"));
        }
      }
      const m = b.child(-0.8, -0.6, 0.4, 0.75); // siren on the rock
      m.add("cone", 0, 0, 0, 0.4, 0.7, 0.4, "#14b8a6", { rz: 1.0, hd: false });
      m.add("cyl", -0.15, 0.3, 0, 0.3, 0.55, 0.25, "#f1c9a5", { mat: "skin", hdShape: "limb" });
      m.add("sphere", -0.15, 0.85, 0, 0.3, 0.3, 0.3, "#f1c9a5", { mat: "skin", hdShape: "egg" });
      m.add("sphere", -0.2, 0.9, -0.08, 0.36, 0.45, 0.3, "#facc15", { mat: "fur" });
      {
        // HD: in place of the Normal cone, a scaled tail curving from her waist down over the rock and tapering to a
        // fluke, arms (one hand holding out a glowing pearl), a shell top, the kit face, long gold locks swaying down
        // her back; foam round the rocks, starfish and weed
        const ma = m.add.bind(m);
        const spine: V3[] = [
          [-0.15, 0.38, 0],
          [-0.06, 0.16, 0.05],
          [0.16, 0.05, 0.1],
          [0.38, 0.06, 0.14],
          [0.56, 0.16, 0.16]
        ];
        // Each piece reaches back into the last, so the capsules blend into one smooth tail
        for (let i = 0; i < 4; i++) {
          const w = 0.27 - i * 0.05;
          const [p, q] = [spine[i], spine[i + 1]];
          const from: V3 = i ? [p[0] - (q[0] - p[0]) * 0.45, p[1] - (q[1] - p[1]) * 0.45, p[2] - (q[2] - p[2]) * 0.45] : p;
          along(ma, "capsule", from, q, w, w * 0.9, "#0f9488", hdo("gel"));
        }
        const end = spine[4];
        for (const side of [-1, 1]) along(ma, "drop", end, [end[0] + 0.24, end[1] + 0.16, end[2] + side * 0.2], 0.16, 0.04, "#2dd4bf", hdo("gel"));
        const look: FigureLook = { skin: "#f1c9a5", tunic: "#14b8a6", legs: "#14b8a6", boots: "#14b8a6", belt: "#14b8a6", eyes: "#0e7490" };
        const fa: Add = (shape, x, y0, z, w, h, d, color, o) => m.add(shape, x - 0.15, y0, z, w, h, d, color, o);
        faceAt(fa, look, {}, 1.0, 0, 0.3 / 0.34);
        for (const side of [-1, 1]) {
          const sh: V3 = [-0.15 + side * 0.16, 0.78, 0];
          const hand: V3 = side < 0 ? [-0.42, 0.42, 0.12] : [0.12, 0.82, 0.26];
          along(ma, "limb", sh, hand, 0.08, 0.08, "#f1c9a5", hdo("skin"));
          ma("sphere", hand[0], hand[1] - 0.04, hand[2], 0.08, 0.08, 0.08, "#f1c9a5", hdo("skin"));
          ma("sphere", -0.15 + side * 0.07, 0.62, 0.11, 0.12, 0.1, 0.07, "#f9a8d4", hdo("bone"));
        }
        ma("sphere", 0.14, 0.82, 0.3, 0.11, 0.11, 0.11, "#fdf4ff", hdo("gem", { glow: true }));
        for (let k = 0; k < 5; k++) {
          const x = -0.32 + k * 0.06;
          along(ma, "capsule", [x, 1.08, -0.12], [x - 0.04 + hr() * 0.04, 0.5 + hr() * 0.1, -0.2], 0.07, 0.06, k % 2 ? "#facc15" : "#eab308", hdo("fur", { idle: IDLE_KIND.sway }));
        }
      }
      for (const [cx, cz, rx, rz] of [
        [-0.8, -0.6, 1.0, 0.8],
        [1.2, 0.4, 0.6, 0.55]
      ]) {
        foam(add, cx, cz, rx + 0.03, rz + 0.03);
      }
      for (let k = 0; k < 5; k++) add("box", 1.2, 0.55, 0.4, 0.06, 0.03, 0.22, "#f97316", hdo("hide", { ry: (k / 5) * Math.PI * 2 })); // starfish
      add("sphere", 1.2, 0.55, 0.4, 0.09, 0.05, 0.09, "#ea580c", hdo("hide"));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        add("cone", -0.8 + Math.cos(a) * 1.1, 0, -0.6 + Math.sin(a) * 0.9, 0.1, 0.5 + hr() * 0.4, 0.1, "#166534", hdo("leaf", { idle: IDLE_KIND.sway }));
      }
      break;
    }

    /* ============================ DESERT ============================ */
    case "lm-palm-oasis": {
      b.add("cyl", 0, 0, 0, 5.2, 0.05, 5.2, SAND, { mat: "hide" });
      b.add("cyl", 0, 0.02, 0, 2.6, 0.06, 2.2, "#38bdf8", { hd: false });
      b.add("cyl", 0, 0.01, 0, 3.2, 0.05, 2.8, "#65a30d", { hd: false });
      // HD: the pool stands clear of the grass ring round it (in Normal the ring's guard lifts it over the water)
      add("cyl", 0, 0.01, 0, 3.2, 0.09, 2.8, "#65a30d", hdo("leaf"));
      add("cyl", 0, 0.02, 0, 2.6, 0.13, 2.2, "#38bdf8", hdo("gel"));
      palm(b, -1.4, -0.5, 0.3);
      palm(b, 1.3, -0.9, -0.35);
      palm(b, 0.6, 1.5, -0.2);
      for (const [x, z] of [
        [-2.0, 1.2],
        [2.1, 0.9]
      ]) {
        b.add("box", x, 0, z, 0.35, 1.8, 0.35, "#d6b06a", { mat: "stone", hdShape: "block" }); // obelisks
        b.add("pyramid", x, 1.8, z, 0.35, 0.3, 0.35, "#fbbf24", { mat: "gold" });
        // HD: a stepped foot and glyphs cut down its face
        add("box", x, 0, z, 0.55, 0.16, 0.55, "#c9a15a", hdo("stone", { hdShape: "block" }));
        for (let k = 0; k < 3; k++) rune(add, k + (x > 0 ? 2 : 0), x, 0.6 + k * 0.42, z + 0.19, 0.55, "#92400e", {}, false);
      }
      b.add("cone", -0.4, 0, -2.0, 1.1, 0.9, 1.1, "#b91c1c", { mat: "cloth" }); // traveller tent
      // HD: reeds round the pool and lily pads with lotus on it, stones at its edge; the tent's door flap, guy ropes and
      // stakes and a gilt finial, a rug and cushions before it, a clay water jar, and a brass lantern lit on a pole
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + hr() * 0.3;
        const [x, z] = [Math.cos(a) * 1.42, Math.sin(a) * 1.22];
        for (let k = 0; k < 3; k++) add("cone", x + (hr() - 0.5) * 0.14, 0.1, z + (hr() - 0.5) * 0.14, 0.05, 0.4 + hr() * 0.3, 0.05, "#4d7c0f", hdo("leaf", { idle: IDLE_KIND.sway }));
      }
      for (const [x, z] of [
        [-0.5, 0.3],
        [0.3, -0.4],
        [0.55, 0.45]
      ]) {
        add("cyl", x, 0.16, z, 0.36, 0.02, 0.36, "#4ade80", hdo("leaf"));
        add("sphere", x + 0.06, 0.17, z, 0.13, 0.1, 0.13, "#f9a8d4", hdo("plain"));
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        add("sphere", Math.cos(a) * 1.3, -0.04, Math.sin(a) * 1.1, 0.3, 0.18, 0.24, "#a8a29e", hdo("hide", { hdShape: "boulder", ry: hr() * 3 }));
      }
      const tent = b.child(-0.4, -2.0, Math.PI);
      const ta = tent.add.bind(tent);
      along(ta, "box", [0, 0.06, -0.53], [0, 0.55, -0.24], 0.36, 0.03, "#450a0a", hdo("cloth"));
      ta("sphere", 0, 0.88, 0, 0.1, 0.1, 0.1, "#fbbf24", hdo("gold"));
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.6;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        along(ta, "cyl", [c * 0.22, 0.54, s * 0.22], [c * 0.95, 0.05, s * 0.95], 0.015, 0.015, ROPE, hdo("cloth"));
        ta("cyl", c * 0.95, 0.05, s * 0.95, 0.04, 0.14, 0.04, "#78350f", hdo("wood"));
      }
      add("box", -0.4, 0.06, -1.48, 0.7, 0.05, 0.55, "#7f1d1d", hdo("cloth"));
      add("box", -0.4, 0.11, -1.48, 0.6, 0.02, 0.45, "#d97706", hdo("cloth"));
      for (const x of [-0.65, -0.15]) add("sphere", x, 0.12, -1.62, 0.22, 0.12, 0.16, "#b45309", hdo("cloth"));
      add("egg", 0.2, 0.05, -1.75, 0.24, 0.32, 0.24, "#c2410c", hdo("stone"));
      add("cyl", 0.2, 0.36, -1.75, 0.1, 0.06, 0.1, "#9a3412", hdo("stone"));
      add("cyl", 0.55, 0.05, -1.6, 0.06, 1.3, 0.06, "#5b3b22", hdo("wood"));
      along(add, "cyl", [0.55, 1.3, -1.6], [0.75, 1.3, -1.6], 0.04, 0.04, "#5b3b22", hdo("wood"));
      add("cyl", 0.75, 1.08, -1.6, 0.08, 0.12, 0.08, "#fde68a", hdo("plain", { glow: true }));
      lanternFrame(add, 0.75, 1.06, -1.6, 0.14, 0.18, "#a16207", { mat: "gold" });
      break;
    }
    case "lm-obsidian-pyramid": {
      b.add("cyl", 0, 0, 0, 5.6, 0.05, 5.6, SAND, { mat: "hide" });
      b.add("pyramid", 0, 0, 0, 4.4, 3.6, 4.4, "#0b0b12", { mat: "gem" });
      for (const y of [0.9, 1.8, 2.6]) {
        const s = 4.4 * (1 - y / 3.6);
        b.add("box", 0, y, 0, s + 0.05, 0.06, s + 0.05, "#c084fc", { glow: true }); // humming energy seams
      }
      b.add("pyramid", 0, 3.25, 0, 0.6, 0.5, 0.6, "#fde047", { glow: true });
      b.add("sphere", 1.8, -0.3, 1.6, 1.6, 0.8, 1.2, "#e7c27a", { mat: "hide" }); // dunes against the base
      b.add("sphere", -2.0, -0.3, -1.2, 1.8, 0.9, 1.4, "#e7c27a", { mat: "hide" });
      // HD: energy running up its four edges, a sealed portal at its foot (jambs, lintel lit with runes, a dark door,
      // steps), obsidian shards circling the apex with motes between them, shard clusters round it in the sand
      for (const [sx, sz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ]) {
        along(add, "capsule", [sx * 2.2, 0.02, sz * 2.2], [sx * 0.32, 3.1, sz * 0.32], 0.06, 0.06, "#c084fc", hdo("plain", { glow: true }));
      }
      const DARK = "#1e1b2e";
      for (const sx of [-1, 1]) add("box", sx * 0.56, 0, 2.15, 0.26, 1.2, 0.3, DARK, hdo("gem", { hdShape: "block" }));
      add("box", 0, 1.2, 2.15, 1.4, 0.26, 0.36, DARK, hdo("gem", { hdShape: "block" }));
      add("box", 0, 0, 2.1, 0.86, 1.2, 0.1, "#020617", hdo("gem"));
      for (const x of [-0.42, 0, 0.42]) rune(add, Math.round(x * 5) + 5, x, 1.33, 2.34, 0.45, "#c084fc");
      add("box", 0, 0, 2.6, 1.3, 0.12, 0.5, DARK, hdo("gem", { hdShape: "block" }));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spin: AddOpts = { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 1.26 };
        add("octa", Math.cos(a) * 1.25, 2.9 + (i % 2) * 0.45, Math.sin(a) * 1.25, 0.2, 0.42, 0.2, DARK, hdo("gem", { ...spin, rz: 0.3 }));
        add("octa", Math.cos(a + 0.63) * 1.1, 3.25 + (i % 2) * 0.2, Math.sin(a + 0.63) * 1.1, 0.07, 0.1, 0.07, "#e9d5ff", hdo("plain", { glow: true, ...spin }));
      }
      for (const a of [0.4, 1.9, 3.5, 4.9]) {
        const [x, z] = [Math.cos(a) * 2.55, Math.sin(a) * 2.55];
        for (let k = 0; k < 3; k++) add("octa", x + (hr() - 0.5) * 0.3, -0.05, z + (hr() - 0.5) * 0.3, 0.16, 0.4 + hr() * 0.3, 0.16, DARK, hdo("gem", { rx: (hr() - 0.5) * 0.6, rz: (hr() - 0.5) * 0.6 }));
        add("octa", x, 0.05, z, 0.06, 0.12, 0.06, "#c084fc", hdo("plain", { glow: true }));
      }
      break;
    }
    case "lm-titan-skeleton": {
      b.add("sphere", 0, -0.6, 0, 6.0, 1.4, 3.6, "#e7c27a", { mat: "hide" }); // dune it lies half-buried in
      for (let i = 0; i < 6; i++) {
        const x = -2.0 + i * 0.75;
        const h = 3.4 - Math.abs(i - 2.5) * 0.5;
        b.add("cyl", x, 0, 0.9, 0.22, h, 0.22, BONE, { rx: -0.45, mat: "bone", hdShape: "taper" }); // towering ribs
        b.add("cyl", x, 0, -0.9, 0.22, h, 0.22, BONE, { rx: 0.45, mat: "bone", hdShape: "taper" });
        // HD: sand drifted against the feet of the ribs
        for (const z of [0.95, -0.95]) add("sphere", x, -0.12, z, 0.5, 0.3, 0.45, "#e7c27a", hdo("hide"));
      }
      b.add("cyl", 0, 0.85 - 2.5, 0, 0.35, 5.0, 0.35, BONE, { rz: Math.PI / 2, mat: "bone" }); // spine, along the crest of the dune
      const sk = b.child(2.9, 0.2, 0);
      sk.add("box", 0, 0, 0, 1.4, 1.1, 1.2, BONE, { hd: false });
      sk.add("box", 0.5, 0.45, 0.3, 0.3, 0.3, 0.2, "#1c1917", { hd: false });
      sk.add("box", 0.5, 0.45, -0.3, 0.3, 0.3, 0.2, "#1c1917", { hd: false });
      sk.add("cone", -0.1, 0.9, 0.5, 0.25, 1.4, 0.25, BONE, { rx: 0.7, mat: "bone" }); // horns
      sk.add("cone", -0.1, 0.9, -0.5, 0.25, 1.4, 0.25, BONE, { rx: -0.7, mat: "bone" });
      {
        // HD: vertebrae with spurs along the spine, the kit skull in place of the block (embers deep in its sockets),
        // ridges round the horns, a half-buried foreleg with its claws, vultures circling
        for (let i = 0; i < 11; i++) {
          const x = -2.3 + i * 0.46;
          along(add, "cyl", [x - 0.08, 0.85, 0], [x + 0.08, 0.85, 0], 0.52, 0.5, "#e7dcc0", hdo("bone"));
          along(add, "cone", [x, 0.95, 0], [x - 0.08, 1.38 - Math.abs(i - 5) * 0.03, 0], 0.13, 0.1, BONE, hdo("bone"));
        }
        const sa = sk.add.bind(sk);
        skull(sa, 0.15, 0.44, 0, 1.9, BONE, Math.PI / 2, hdo("bone"));
        for (const side of [-1, 1]) sa("sphere", 1.24, 1.05, side * 0.3, 0.1, 0.1, 0.06, "#f59e0b", hdo("plain", { glow: true }));
        for (const side of [-1, 1]) {
          const dir: V3 = [0, Math.cos(0.7), side * Math.sin(0.7)];
          const c: V3 = [-0.1, 1.6, side * 0.5];
          for (const f of [0.18, 0.38, 0.58]) {
            const p: V3 = [c[0], c[1] + dir[1] * (f - 0.5) * 1.4, c[2] + dir[2] * (f - 0.5) * 1.4];
            const w = 0.25 * (1 - f) + 0.05;
            along(sa, "cyl", [p[0], p[1] - dir[1] * 0.03, p[2] - dir[2] * 0.03], [p[0], p[1] + dir[1] * 0.03, p[2] + dir[2] * 0.03], w, w, "#d6ccb0", hdo("bone"));
          }
        }
        bone(add, [-2.7, 0.05, 1.95], [-1.55, 0.1, 2.35], 0.24, BONE, hdo("bone"));
        for (let k = 0; k < 3; k++) along(add, "cone", [-1.4, 0.1, 2.25 + k * 0.12], [-1.05, 0.03, 2.2 + k * 0.2], 0.08, 0.08, "#d6ccb0", hdo("bone"));
        for (let i = 0; i < 2; i++) bird(add, 2.0 + i * 0.3, 4.2 + i * 0.5, 0, 1.6, "#3f3f46", "#27272a", "#d6d3d1", { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 3 });
      }
      break;
    }
    case "lm-sandstone-canyon": {
      const LAYERS = ["#c2410c", "#ea580c", "#d97706", "#b45309"];
      for (const side of [-1, 1]) {
        for (let l = 0; l < 4; l++) {
          b.add("box", 0, l * 0.7, side * (1.3 + l * 0.15), 5.0 - l * 0.4, 0.7, 1.3, ["#c2410c", "#ea580c", "#d97706", "#b45309"][l], { mat: "hide", hdShape: "block" }); // layered walls
          // HD: a darker bed of rock along each layer's face toward the canyon
          add("box", 0, l * 0.7 + 0.28, side * (0.65 + l * 0.15 - 0.03), 4.9 - l * 0.4, 0.07, 0.1, shade(LAYERS[l], 0.78), hdo("hide"));
        }
        b.add("box", 0.4, 1.2, side * 0.7, 2.0, 0.08, 0.05, "#fde047", { glow: true }); // exposed quartz & gold vein
        // HD: gold nuggets and quartz crystals along the vein
        for (let k = 0; k < 6; k++) {
          const x = -0.5 + k * 0.36 + hr() * 0.1;
          if (k % 2) add("sphere", x, 1.2, side * 0.69, 0.09, 0.08, 0.06, "#fbbf24", hdo("gold"));
          else add("octa", x, 1.16, side * 0.67, 0.07, 0.16, 0.07, "#f8fafc", hdo("gem", { rz: (hr() - 0.5) * 0.8 }));
        }
      }
      b.add("box", 0, 0, 0, 5.0, 0.04, 1.2, "#e7c27a", { mat: "hide" }); // dry canyon floor
      b.add("sphere", -1.2, 0, 0.1, 0.6, 0.45, 0.6, "#9a3412", { mat: "hide", hdShape: "boulder" });
      // HD: a rope bridge sagging across the top, rubble at the walls' feet, cacti on the rims, a broken ore cart and a
      // pick left on the floor, vultures circling
      const sagY = (z: number) => 2.86 - 0.28 * (1 - (z / 1.5) ** 2);
      for (let i = 0; i < 11; i++) {
        const z = -1.25 + i * 0.25;
        add("box", -0.8, sagY(z) - 0.02, z, 0.5, 0.04, 0.16, "#92400e", hdo("wood", { rx: Math.atan(0.56 * z / 2.25) }));
      }
      for (const x of [-1.07, -0.53]) {
        for (let i = 0; i < 6; i++) {
          const [z0, z1] = [-1.5 + i * 0.5, -1.5 + (i + 1) * 0.5];
          along(add, "cyl", [x, sagY(z0) + 0.34, z0], [x, sagY(z1) + 0.34, z1], 0.025, 0.025, ROPE, hdo("cloth"));
        }
        for (const z of [-1.52, 1.52]) add("cyl", x, 2.8, z, 0.08, 0.46, 0.08, "#78350f", hdo("wood"));
      }
      for (let i = 0; i < 7; i++) {
        const side = i % 2 ? 1 : -1;
        const s = 0.18 + hr() * 0.18;
        add("sphere", -2.2 + i * 0.7 + hr() * 0.2, -0.04, side * (0.52 + hr() * 0.06), s * 1.4, s, s * 1.1, LAYERS[i % 4], hdo("hide", { hdShape: "boulder" }));
      }
      for (const [x, z] of [
        [1.4, 1.75],
        [-1.6, -1.8],
        [0.9, -1.65]
      ]) {
        add("capsule", x, 2.8, z, 0.18, 0.7, 0.18, "#4d7c0f", hdo("leaf"));
        along(add, "capsule", [x, 3.1, z], [x + 0.22, 3.22, z], 0.1, 0.1, "#4d7c0f", hdo("leaf"));
        add("capsule", x + 0.22, 3.15, z, 0.1, 0.32, 0.1, "#4d7c0f", hdo("leaf"));
      }
      const cart = b.child(1.4, -0.05, 0.3);
      cart.add("box", 0, 0.12, 0, 0.7, 0.36, 0.45, "#57534e", hdo("iron"));
      for (const x of [-0.24, 0.24]) wheel(cart.add.bind(cart), [x, 0.14, 0.25], [1, 0, 0], [0, 1, 0], 0.15, 0.04, "#3f2a1a", hdo("wood"), 5, x > 0 ? 0 : 1.2, x > 0 ? Math.PI * 2 : 4.4);
      cart.add("sphere", 0, 0.42, 0, 0.5, 0.18, 0.32, "#78350f", hdo("hide"));
      along(add, "cyl", [0.5, 0.02, 0.2], [0.8, 0.5, 0.15], 0.04, 0.04, "#5b3b22", hdo("wood"));
      along(add, "horn", [0.66, 0.42, 0.1], [0.98, 0.48, 0.24], 0.06, 0.06, "#57534e", hdo("dull"));
      for (let i = 0; i < 2; i++) bird(add, 2.1 + i * 0.3, 4.0 + i * 0.5, 0, 1.4, "#44403c", "#292524", "#d6d3d1", { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 3 });
      break;
    }

    /* ============================ FOREST ============================ */
    case "lm-stonehenge": {
      b.add("cyl", 0, 0, 0, 5.2, 0.05, 5.2, "#3f6212", { mat: "leaf" });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const t = b.child(Math.cos(a) * 2.0, Math.sin(a) * 2.0, -a + Math.PI / 2);
        t.add("box", -0.4, 0, 0, 0.4, 1.7, 0.35, "#78716c", { mat: "stone", hdShape: "block" });
        t.add("box", 0.4, 0, 0, 0.4, 1.7, 0.35, "#78716c", { mat: "stone", hdShape: "block" });
        t.add("box", 0, 1.7, 0, 1.3, 0.3, 0.4, "#57534e", { mat: "stone", hdShape: "block" }); // lintel
        t.add("box", 0, 0, 0.18, 0.95, 0.6, 0.02, "#4d7c0f", { mat: "leaf" }); // moss
        // HD: a spiral rune lit green on each upright's inner face, lichen on the lintel, ferns at its feet
        for (const x of [-0.4, 0.4]) rune(t.add.bind(t), i + (x > 0 ? 2 : 0), x, 0.95, -0.2, 0.75, "#4ade80");
        for (const x of [-0.35, 0.2]) t.add("sphere", x, 1.98, 0.05, 0.3, 0.06, 0.24, "#6b7f45", hdo("leaf"));
        for (const x of [-0.75, 0.75]) for (let k = 0; k < 3; k++) along(t.add.bind(t), "box", [x, 0.02, 0.25], [x + (k - 1) * 0.18, 0.32, 0.45], 0.1, 0.02, "#4d7c0f", hdo("leaf", { idle: IDLE_KIND.sway, sync: 40 + i * 2 + (x > 0 ? 1 : 0) }));
      }
      b.add("box", 0, 0, 0, 1.0, 0.4, 0.6, "#57534e", { mat: "stone", hdShape: "block" }); // altar
      b.add("cyl", 0, 0.02, 0, 3.4, 0.03, 3.4, "#4ade80", { glow: true }); // leyline glow
      b.add("octa", 0, 0.8, 0, 0.3, 0.5, 0.3, "#86efac", { glow: true, mat: "gem" });
      // HD: ley lines running out from the ring to each stone, small standing stones between the trilithons, candles and
      // an offering bowl on the altar, motes circling the floating crystal, wildflowers
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        along(add, "capsule", [Math.cos(a) * 0.75, 0.11, Math.sin(a) * 0.75], [Math.cos(a) * 1.65, 0.11, Math.sin(a) * 1.65], 0.05, 0.05, "#86efac", hdo("plain", { glow: true }));
        const b2 = (i + 0.5) / 6 * Math.PI * 2;
        add("box", Math.cos(b2) * 2.3, 0, Math.sin(b2) * 2.3, 0.3, 0.45 + hr() * 0.25, 0.24, "#6b6560", hdo("stone", { hdShape: "block", ry: -b2 }));
      }
      for (const x of [-0.35, 0.35]) {
        add("cyl", x, 0.4, 0.18, 0.07, 0.16, 0.07, "#f5f5f4", hdo("plain"));
        add("cone", x, 0.56, 0.18, 0.05, 0.09, 0.05, "#fde68a", hdo("plain", { glow: true }));
      }
      add("cyl", 0, 0.4, -0.12, 0.3, 0.09, 0.3, "#a16207", hdo("gold"));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        add("octa", Math.cos(a) * 0.45, 0.95 + (i % 2) * 0.2, Math.sin(a) * 0.45, 0.07, 0.1, 0.07, "#bbf7d0", hdo("plain", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 1.57 }));
      }
      for (let i = 0; i < 12; i++) {
        const a = hr() * Math.PI * 2;
        const r = 1.0 + hr() * 1.4;
        add("sphere", Math.cos(a) * r, 0.06, Math.sin(a) * r, 0.08, 0.06, 0.08, ["#fef08a", "#f9a8d4", "#e0e7ff"][i % 3], hdo("leaf"));
      }
      break;
    }
    case "lm-world-tree": {
      b.add("cyl", 0, 0.9 - 2.5, 0, 2.2, 5.0, 2.2, "#5b3b22", { rz: Math.PI / 2, mat: "wood" }); // fallen titan trunk, sunk a little into the ground
      b.add("cyl", 2.55, 0.9 - 0.05, 0, 1.7, 0.1, 1.7, "#1c1917", { rz: Math.PI / 2, mat: "wood" }); // hollow opening
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add("cyl", -2.6, 0.9 - 0.8 + Math.sin(a) * 0.6, Math.cos(a) * 0.6, 0.25, 1.6, 0.25, "#4a3322", { rz: 0.6 + Math.sin(a) * 0.4, rx: Math.cos(a) * 0.6, mat: "wood", hdShape: "taper" }); // torn roots
      }
      const shrooms: number[] = [];
      for (let i = 0; i < 6; i++) {
        const x = range(rng, -1.6, 2.4);
        b.add("cyl", x, 0, 1.3, 0.08, 0.35, 0.08, "#f5f5f4", { mat: "bone", hdShape: "taper" });
        b.add("sphere", x, 0.3, 1.3, 0.35, 0.2, 0.35, "#38bdf8", { glow: true }); // glow-shrooms
        shrooms.push(x);
      }
      b.add("sphere", 0.5, 1.7, 0, 3.0, 0.5, 1.8, "#3f6212", { mat: "leaf", hdShape: "canopy" }); // moss on top
      // HD: bark ridges running along the trunk, splinters round the hollow, broken branches, a sapling growing from it,
      // ferns at its foot, gills and pale spots on the shrooms, fireflies drifting round
      for (let k = 0; k < 9; k++) {
        const f = -Math.PI * 0.85 + (k / 8) * Math.PI * 1.25;
        const [y, z] = [0.9 + Math.sin(f) * 1.12, Math.cos(f) * 1.12];
        along(add, "capsule", [-2.35, y, z], [2.35, y + (hr() - 0.5) * 0.1, z], 0.12, 0.1, "#3f2a1a", hdo("wood"));
      }
      for (let k = 0; k < 10; k++) {
        const f = (k / 10) * Math.PI * 2;
        const [y, z] = [0.9 + Math.sin(f) * 0.98, Math.cos(f) * 0.98];
        if (y < 0.05) continue;
        along(add, "cone", [2.48, y, z], [2.7 + hr() * 0.2, y + Math.sin(f) * 0.05, z + Math.cos(f) * 0.05], 0.15, 0.12, "#6b4423", hdo("wood"));
      }
      along(add, "taper", [-1.0, 1.85, 0.4], [-1.35, 2.7, 0.75], 0.24, 0.24, "#4a3322", hdo("wood"));
      along(add, "taper", [1.4, 1.8, -0.45], [1.95, 2.5, -0.8], 0.2, 0.2, "#4a3322", hdo("wood"));
      add("trunk", -0.5, 1.95, -0.35, 0.14, 0.75, 0.14, "#6b4423", hdo("wood"));
      add("canopy", -0.5, 2.5, -0.35, 0.6, 0.55, 0.6, "#65a30d", hdo("leaf", { idle: IDLE_KIND.sway }));
      for (let i = 0; i < 6; i++) {
        const x = -2.0 + i * 0.8;
        const z = (i % 2 ? 1 : -1) * 1.2;
        for (let k = 0; k < 4; k++) along(add, "box", [x, 0.02, z], [x + (k - 1.5) * 0.22, 0.42, z + Math.sign(z) * 0.3], 0.12, 0.02, "#4d7c0f", hdo("leaf", { idle: IDLE_KIND.sway, sync: 40 + i }));
      }
      for (const x of shrooms) {
        add("cyl", x, 0.27, 1.3, 0.3, 0.04, 0.3, "#0c4a6e", hdo("plain", { glow: true }));
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + x;
          add("sphere", x + Math.cos(a) * 0.09, 0.45, 1.3 + Math.sin(a) * 0.09, 0.05, 0.03, 0.05, "#e0f2fe", hdo("plain", { glow: true }));
        }
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = 1.7 + hr() * 0.6;
        add("sphere", Math.cos(a) * r, 0.9 + hr() * 1.6, Math.sin(a) * r, 0.06, 0.06, 0.06, "#d9f99d", hdo("plain", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 0.9 }));
      }
      break;
    }
    case "lm-mushroom-megalith": {
      for (const [x, z, h, c] of [
        [0, 0, 3.2, "#a855f7"],
        [-1.6, 0.8, 2.2, "#38bdf8"],
        [1.5, 0.9, 2.5, "#f472b6"],
        [0.4, -1.6, 1.8, "#22d3ee"],
        [-1.1, -1.2, 1.4, "#c084fc"]
      ] as const) {
        b.add("cyl", x, 0, z, 0.35 * h * 0.5, h, 0.35 * h * 0.5, "#f5f5f4", { mat: "hide", hdShape: "taper" });
        b.add("sphere", x, h - 0.4, z, h * 0.75, h * 0.35, h * 0.75, c, { glow: true });
        // HD: gills glowing under the cap, pale spots on top, a skirt round the stem, roots spreading at its foot,
        // little mushrooms clustered round it
        const sw = 0.35 * h * 0.5;
        add("cyl", x, h - 0.4 + h * 0.035, z, h * 0.52, 0.04, h * 0.52, shade(c, 0.5), hdo("plain", { glow: true }));
        add("cyl", x, h * 0.55, z, sw * 1.9, 0.05, sw * 1.9, "#e7e5e4", hdo("hide"));
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + h;
          add("sphere", x + Math.cos(a) * h * 0.2, h - 0.4 + h * 0.28, z + Math.sin(a) * h * 0.2, h * 0.07, h * 0.04, h * 0.07, "#fdf4ff", hdo("plain", { glow: true }));
        }
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          along(add, "capsule", [x, 0.04, z], [x + Math.cos(a) * sw * 1.6, 0.0, z + Math.sin(a) * sw * 1.6], 0.07, 0.07, "#e7e5e4", hdo("hide"));
          const [mx, mz] = [x + Math.cos(a + 0.5) * (sw + 0.3), z + Math.sin(a + 0.5) * (sw + 0.3)];
          const mh = 0.15 + hr() * 0.15;
          add("cyl", mx, 0, mz, 0.04, mh, 0.04, "#f5f5f4", hdo("hide"));
          add("sphere", mx, mh - 0.04, mz, 0.14, 0.07, 0.14, c, hdo("plain", { glow: true }));
        }
      }
      for (let i = 0; i < 8; i++) {
        b.add("octa", range(rng, -2, 2), range(rng, 1, 4), range(rng, -2, 2), 0.1, 0.14, 0.1, "#fef9c3", { glow: true }); // starry pollen
      }
      // HD: spores drifting round the grove
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add("sphere", Math.cos(a) * (1.2 + hr()), 0.8 + hr() * 2.4, Math.sin(a) * (1.2 + hr()), 0.06, 0.06, 0.06, "#e9d5ff", hdo("plain", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 0.8 }));
      }
      break;
    }
    case "lm-bandit-stockade": {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const cx = Math.cos(a) * 2.0;
        const cz = Math.sin(a) * 2.0;
        b.add("box", cx, 0, cz, Math.abs(Math.sin(a)) > 0.5 ? 4.2 : 0.4, 1.4, Math.abs(Math.sin(a)) > 0.5 ? 0.4 : 4.2, "#4a3322", { hd: false }); // timber walls
      }
      b.add("box", 2.0, 0, 0, 0.5, 1.0, 1.0, "#1c1917", { mat: "wood" }); // gate
      tower(b, -2.0, -2.0, 0.45, 2.6, "#5b3b22", "#3f2a1a");
      b.add("cone", 0, 0, 0, 0.5, 0.6, 0.5, "#f97316", { glow: true }); // campfire
      flag(b.child(-2.0, -2.0, 0, 3.4), 0, 0, 1.0, "#111827");
      for (const [x, z] of [
        [0.8, -0.8],
        [-0.8, 0.9]
      ]) {
        b.add("box", x, 0, z, 0.55, 0.45, 0.55, "#92400e", { mat: "wood" }); // loot crates
        // HD: battens round the crate's faces
        for (const e of [-0.25, 0.25]) {
          add("box", x + e, 0, z, 0.06, 0.45, 0.6, "#5b3b22", hdo("wood"));
          add("box", x, 0, z + e, 0.6, 0.45, 0.06, "#5b3b22", hdo("wood"));
        }
      }
      {
        // HD: in place of the four timber slabs, a palisade of sharpened logs with a rail lashed along the inside and
        // the gate left open between two tall posts topped with skulls and torches; a plank door with battens and iron
        // bands; a stone ring and logs round the fire with a pot on a tripod and smoke; a lean-to with bedrolls, a
        // spear rack, a loot sack spilling coins, lanterns on posts
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const along_ = Math.abs(Math.sin(a)) > 0.5;
          for (let k = 0; k < 15; k++) {
            const t = -2.1 + k * 0.3;
            const [x, z] = along_ ? [t, Math.sin(a) * 2.0] : [Math.cos(a) * 2.0, t];
            if (i === 0 && Math.abs(z) < 0.6) continue; // the gateway
            const h = 1.25 + ((k * 7 + i * 3) % 4) * 0.06;
            add("cyl", x, 0, z, 0.3, h, 0.3, k % 2 ? "#4a3322" : "#5b3b22", hdo("wood"));
            add("cone", x, h, z, 0.3, 0.3, 0.3, "#3f2a1a", hdo("wood"));
          }
          const [rx, rz] = [Math.cos(a) * 1.78, Math.sin(a) * 1.78];
          add("box", rx, 0.95, rz, along_ ? 4.1 : 0.08, 0.1, along_ ? 0.08 : 4.1, "#3f2a1a", hdo("wood"));
        }
        for (const z of [-0.62, 0.62]) {
          add("cyl", 2.0, 0, z, 0.34, 1.9, 0.34, "#3f2a1a", hdo("wood"));
          skull(add, 2.0, 1.97, z, 0.24, BONE, Math.PI / 2, hdo("bone"));
          add("box", 2.2, 1.2, z, 0.08, 0.2, 0.08, IRON, hdo("iron"));
          add("cone", 2.24, 1.4, z, 0.14, 0.24, 0.14, "#fb923c", hdo("plain", { glow: true }));
        }
        for (const y of [0.2, 0.75]) add("box", 2.27, y, 0, 0.06, 0.1, 0.96, "#3f2a1a", hdo("wood"));
        for (const z of [-0.3, 0.3]) add("box", 2.3, 0.05, z, 0.04, 0.9, 0.08, IRON, hdo("iron"));
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          add("sphere", Math.cos(a) * 0.38, -0.04, Math.sin(a) * 0.38, 0.2, 0.14, 0.18, "#57534e", hdo("hide", { hdShape: "boulder" }));
        }
        for (const ry of [0.3, 1.9]) add("cyl", 0, 0.08 - 0.3, 0, 0.12, 0.6, 0.12, "#3f2a1a", hdo("wood", { rz: Math.PI / 2, ry }));
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.5;
          along(add, "cyl", [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], [0, 1.0, 0], 0.04, 0.04, "#3f2a1a", hdo("wood"));
        }
        add("cyl", 0, 0.72, 0, 0.012, 0.28, 0.012, IRON, hdo("iron"));
        add("sphere", 0, 0.62, 0, 0.24, 0.18, 0.24, "#292524", hdo("iron"));
        for (let k = 0; k < 3; k++) add("sphere", 0, 1.0, 0, 0.3, 0.27, 0.3, "#78716c", { idle: IDLE_KIND.smoke, phase: 0.01 + (k * Math.PI * 2) / 3, hd: true });
        add("prism", 1.0, 0, 1.25, 1.2, 0.7, 0.8, "#78350f", hdo("cloth"));
        for (const x of [0.75, 1.25]) add("capsule", x, 0.04, 1.3, 0.18, 0.18, 0.6, "#57534e", hdo("cloth", { rx: Math.PI / 2 }));
        for (const x of [-1.3, -0.9]) add("cyl", x, 0, -0.1, 0.06, 0.9, 0.06, "#5b3b22", hdo("wood"));
        along(add, "cyl", [-1.38, 0.82, -0.1], [-0.82, 0.82, -0.1], 0.05, 0.05, "#5b3b22", hdo("wood"));
        for (let k = 0; k < 3; k++) {
          const x = -1.25 + k * 0.17;
          along(add, "cyl", [x, 0.02, -0.25], [x + 0.04, 1.15, -0.02], 0.035, 0.035, "#78350f", hdo("wood"));
          along(add, "blade", [x + 0.04, 1.13, -0.02], [x + 0.045, 1.3, 0.02], 0.02, 0.07, "#a8a29e", hdo("dull"));
        }
        add("egg", -0.25, 0, 1.0, 0.36, 0.4, 0.32, "#a16207", hdo("cloth"));
        coins(add, hr, -0.15, 0.01, 0.75, 0.25, 5, "#fbbf24", hdo("gold"), 0.1);
        for (const [x, z] of [
          [1.3, -1.3],
          [-1.3, 1.4]
        ]) {
          add("cyl", x, 0, z, 0.07, 1.25, 0.07, "#3f2a1a", hdo("wood"));
          add("cyl", x, 1.27, z, 0.1, 0.14, 0.1, "#fde68a", hdo("plain", { glow: true }));
          lanternFrame(add, x, 1.25, z, 0.16, 0.2, IRON, { mat: "iron" });
        }
      }
      break;
    }

    /* =========================== MOUNTAINS =========================== */
    case "lm-ignis-caldera": {
      b.add("cone", 0, -0.2, 0, 5.4, 4.2, 5.4, "#44282b", { mat: "hide" }); // volcanic peak
      b.add("cyl", 0, 3.85, 0, 1.4, 0.2, 1.4, "#f97316", { glow: true }); // molten crater
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        b.add("box", Math.cos(a) * 1.4, 1.6, Math.sin(a) * 1.4, 0.3, 0.12, 3.2, "#ea580c", { ry: -a + Math.PI / 2, rx: -0.85, glow: true, hd: false }); // lava channels
        // HD: the channel runs down the slope from the crater (in Normal it stands out of the cone), banked with cooled
        // crust either side, into a lava pool at the foot
        const on = (r: number, off: number, lift: number): V3 => [Math.cos(a) * r - Math.sin(a) * off, 4.0 - r * (4.2 / 2.7) + lift, Math.sin(a) * r + Math.cos(a) * off];
        for (let k = 0; k < 4; k++) {
          const [r0, r1] = [0.5 + k * 0.52, 0.5 + (k + 1) * 0.52];
          const wob = (k % 2 ? 1 : -1) * 0.06;
          along(add, "capsule", on(r0, -wob, 0.04), on(r1, wob, 0.04), 0.2, 0.2, "#ea580c", hdo("plain", { glow: true }));
          for (const s of [-1, 1]) along(add, "capsule", on(r0, s * 0.19 - wob, 0.05), on(r1, s * 0.19 + wob, 0.05), 0.13, 0.13, "#292524", hdo("lava"));
        }
        add("sphere", Math.cos(a) * 2.75, -0.06, Math.sin(a) * 2.75, 0.9, 0.16, 0.75, "#7c2d12", hdo("lava", { ry: -a }));
        add("sphere", Math.cos(a) * 2.75, -0.02, Math.sin(a) * 2.75, 0.55, 0.16, 0.45, "#fb923c", hdo("plain", { glow: true, ry: -a }));
      }
      b.add("sphere", 0, 4.3, 0, 1.2, 1.1, 1.2, "#57534e"); // smoke
      b.add("sphere", 0.4, 5.2, 0.2, 0.9, 0.9, 0.9, "#78716c");
      b.add("cyl", 2.0, 0, 1.4, 0.6, 0.4, 0.6, "#facc15", { glow: true }); // sulfur vent
      // HD: crags breaking through the slopes, a ragged crater rim, smoke rolling up out of it with embers whirling, obsidian
      // shards at the foot, sulphur crystals and steam round the vent
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.2;
        const y = 0.3 + (i % 3) * 0.7;
        const r = 2.7 * (1 - (y + 0.2) / 4.2) * 0.96;
        const s = 0.5 + hr() * 0.3;
        add("sphere", Math.cos(a) * r, y - s * 0.3, Math.sin(a) * r, s, s * 0.6, s * 0.8, "#292524", hdo("hide", { hdShape: "boulder", ry: hr() * 3 }));
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add("sphere", Math.cos(a) * 0.72, 3.72, Math.sin(a) * 0.72, 0.36, 0.3, 0.3, "#3b2326", hdo("hide", { hdShape: "boulder", ry: a }));
      }
      for (let k = 0; k < 3; k++) add("sphere", 0, 4.0, 0, 0.7, 0.6, 0.7, "#57534e", { idle: IDLE_KIND.smoke, phase: 0.01 + (k * Math.PI * 2) / 3, hd: true });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add("octa", Math.cos(a) * 0.55, 4.2 + (i % 3) * 0.3, Math.sin(a) * 0.55, 0.08, 0.12, 0.08, "#fdba74", hdo("plain", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 1.26 }));
      }
      for (let i = 0; i < 6; i++) {
        const a = hr() * Math.PI * 2;
        add("octa", Math.cos(a) * 2.75, -0.05, Math.sin(a) * 2.75, 0.18, 0.4, 0.18, "#111018", hdo("gem", { rz: (hr() - 0.5) * 0.7, rx: (hr() - 0.5) * 0.7 }));
      }
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        add("octa", 2.0 + Math.cos(a) * 0.42, 0, 1.4 + Math.sin(a) * 0.42, 0.12, 0.3, 0.12, "#fde047", hdo("gem", { rz: Math.cos(a) * 0.4, rx: Math.sin(a) * 0.4 }));
      }
      for (let k = 0; k < 3; k++) add("sphere", 2.0, 0.4, 1.4, 0.4, 0.36, 0.4, "#fef9c3", { idle: IDLE_KIND.smoke, phase: 0.01 + (k * Math.PI * 2) / 3, hd: true });
      break;
    }
    case "lm-iron-delve": {
      b.add("sphere", 0, -1.0, -0.8, 4.4, 3.4, 3.0, BASALT, { mat: "hide", hdShape: "boulder" });
      b.add("box", 0, 0, 0.6, 1.4, 1.5, 0.3, "#0c0a09"); // tunnel mouth
      b.add("box", 0, 1.5, 0.7, 1.7, 0.25, 0.3, "#78350f", { mat: "wood" });
      b.add("box", 0, 0, 1.8, 0.6, 0.05, 3.0, "#52525b", { mat: "stone" }); // rails
      for (const z of [1.6, 2.6]) {
        b.add("box", 0, 0.08, z, 0.8, 0.45, 0.8, "#3f3f46", { mat: "iron" }); // minecarts
        b.add("sphere", 0, 0.45, z, 0.7, 0.35, 0.7, z > 2 ? "#e0f2fe" : "#292524", { glow: z > 2, mat: "hide" });
        // HD: its wheels, a riveted rim, and ore heaped on it (mithril shards lit on the second)
        const cart = b.child(0, z);
        for (const sx of [-1, 1]) for (const sz of [-0.24, 0.24]) wheel(cart.add.bind(cart), [sx * 0.43, 0.13, sz], [0, 0, 1], [0, 1, 0], 0.13, 0.035, IRON, hdo("iron"), 5);
        arc(cart.add.bind(cart), [0, 0.55, 0], [1, 0, 0], [0, 0, 1], [0.41, 0.41], 0, Math.PI * 2, 8, 0.05, "#57534e", hdo("iron"));
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.5;
          if (z > 2) cart.add("octa", Math.cos(a) * 0.16, 0.58, Math.sin(a) * 0.16, 0.1, 0.24, 0.1, "#bae6fd", hdo("gem", { glow: true, rz: Math.cos(a) * 0.4 }));
          else cart.add("sphere", Math.cos(a) * 0.17, 0.62, Math.sin(a) * 0.17, 0.16, 0.12, 0.14, "#1c1917", hdo("hide", { hdShape: "boulder" }));
        }
      }
      const veins: V3[] = [];
      for (let i = 0; i < 4; i++) {
        const v: V3 = [range(rng, -1.8, 1.8), range(rng, 0.6, 1.8), range(rng, -0.4, 0.3)];
        b.add("octa", v[0], v[1], v[2], 0.25, 0.35, 0.25, "#bae6fd", { glow: true, mat: "gem" }); // mithril veins
        veins.push(v);
      }
      // HD: timber posts framing the tunnel, iron rails on sleepers and a bumper at their end, lanterns hung at the
      // mouth, crystals clustered round each vein, a barrel, crates and a pick by the track
      for (const sx of [-1, 1]) add("box", sx * 0.78, 0, 0.78, 0.16, 1.5, 0.16, "#5b3b22", hdo("wood"));
      for (let k = 0; k < 9; k++) add("box", 0, 0.05, 0.45 + k * 0.38, 0.72, 0.04, 0.12, "#5b3b22", hdo("wood"));
      for (const sx of [-1, 1]) add("box", sx * 0.2, 0.09, 1.8, 0.05, 0.06, 3.0, "#71717a", hdo("steel"));
      add("box", 0, 0.05, 3.36, 0.7, 0.3, 0.16, "#5b3b22", hdo("wood"));
      for (const sx of [-1, 1]) {
        add("cyl", sx * 0.62, 1.3, 0.95, 0.015, 0.2, 0.015, IRON, hdo("iron"));
        add("cyl", sx * 0.62, 1.05, 0.95, 0.08, 0.12, 0.08, "#fde68a", hdo("plain", { glow: true }));
        lanternFrame(add, sx * 0.62, 1.03, 0.95, 0.14, 0.18, IRON, { mat: "iron" });
      }
      for (const [x, y, z] of veins) {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + x;
          add("octa", x + Math.cos(a) * 0.17, y - 0.05, z + Math.sin(a) * 0.12, 0.1, 0.2, 0.1, "#e0f2fe", hdo("gem", { rz: Math.cos(a) * 0.6 }));
        }
        add("sphere", x, y - 0.06, z, 0.4, 0.14, 0.3, "#3f3f46", hdo("hide"));
      }
      add("cyl", -0.95, 0, 1.5, 0.4, 0.55, 0.4, "#78350f", hdo("wood"));
      for (const y of [0.1, 0.42]) add("cyl", -0.95, y, 1.5, 0.43, 0.04, 0.43, IRON, hdo("iron"));
      add("box", 0.95, 0, 1.9, 0.45, 0.4, 0.45, "#92400e", hdo("wood", { ry: 0.3 }));
      add("box", 0.9, 0.4, 1.95, 0.35, 0.3, 0.35, "#a16207", hdo("wood", { ry: 0.7 }));
      along(add, "cyl", [0.7, 0.02, 2.6], [0.85, 0.65, 2.4], 0.04, 0.04, "#5b3b22", hdo("wood"));
      along(add, "horn", [0.68, 0.6, 2.32], [1.0, 0.66, 2.5], 0.06, 0.06, "#57534e", hdo("iron"));
      break;
    }
    case "lm-glacial-peak": {
      b.add("cone", 0, -0.2, 0, 4.8, 4.6, 4.8, "#cbd5e1", { mat: "hide" });
      b.add("cone", 0, 2.6, 0, 2.2, 2.0, 2.2, "#f8fafc", { mat: "hide" }); // permafrost cap
      b.add("cone", 1.6, -0.2, 1.0, 2.4, 2.4, 2.4, "#e2e8f0", { mat: "hide" });
      b.add("sphere", -0.4, 0, 1.6, 1.2, 1.2, 0.5, "#38bdf8", { glow: true }); // blue ice cave
      const crystals: Array<[number, number, number]> = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const h = range(rng, 0.8, 1.5);
        b.add("octa", Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5, 0.4, h, 0.4, "#a5f3fc", { glow: true }); // ice crystals
        crystals.push([Math.cos(a) * 2.5, Math.sin(a) * 2.5, h]);
      }
      // HD: dark rock breaking through the snow, a rock arch round the ice cave hung with icicles, ice shards and rocks
      // at each crystal's foot, snow drifts, a frozen tusk jutting from the snow, snowflakes drifting round the peak
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.7;
        const y = 0.4 + (i % 3) * 0.75;
        const r = 2.4 * (1 - (y + 0.2) / 4.6) * 0.97;
        add("sphere", Math.cos(a) * r, y - 0.15, Math.sin(a) * r, 0.55, 0.32, 0.4, "#475569", hdo("hide", { hdShape: "boulder", ry: a }));
      }
      arc(add, [-0.4, 0.0, 1.78], [1, 0, 0], [0, 1, 0], [0.68, 0.72], 0, Math.PI, 7, 0.26, "#64748b", hdo("hide"), "boulder");
      for (let k = 0; k < 6; k++) {
        const t = 0.35 + (k / 5) * 2.45;
        add("cone", -0.4 + Math.cos(t) * 0.6, Math.sin(t) * 0.62 - 0.32, 1.9, 0.07, 0.3, 0.07, "#e0f2fe", hdo("gem", { rx: Math.PI }));
      }
      for (const [x, z, h] of crystals) {
        for (let k = 0; k < 2; k++) {
          const a = hr() * Math.PI * 2;
          add("octa", x + Math.cos(a) * 0.3, -0.02, z + Math.sin(a) * 0.3, 0.2, h * 0.5, 0.2, "#cffafe", hdo("gem", { rz: Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5 }));
        }
        add("sphere", x, -0.08, z, 0.55, 0.22, 0.5, "#64748b", hdo("hide", { hdShape: "boulder" }));
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        add("sphere", Math.cos(a) * 2.2, -0.15, Math.sin(a) * 2.2, 0.9, 0.35, 0.6, "#f1f5f9", hdo("hide", { ry: -a }));
      }
      along(add, "taper", [-2.0, 0.0, -1.2], [-1.85, 0.75, -1.65], 0.2, 0.2, BONE, hdo("bone"));
      along(add, "taper", [-1.85, 0.74, -1.65], [-1.55, 1.05, -1.75], 0.13, 0.13, BONE, hdo("bone"));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        add("sphere", Math.cos(a) * (1.6 + hr()), 1.0 + hr() * 3, Math.sin(a) * (1.6 + hr()), 0.06, 0.06, 0.06, "#f8fafc", hdo("plain", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 0.7 }));
      }
      break;
    }
    case "lm-basalt-gorge": {
      const pillars: Array<[number, number, number]> = [];
      for (let i = 0; i < 16; i++) {
        const side = i % 2 ? 1 : -1;
        const x = -2.2 + Math.floor(i / 2) * 0.6;
        const z = side * range(rng, 0.9, 1.6);
        const h = range(rng, 1.6, 3.4);
        b.add("cyl", x, 0, z, 0.6, h, 0.6, i % 3 ? BASALT : "#3a3946", { mat: "stone" }); // hexagonal pillars
        pillars.push([x, z, h]);
      }
      b.add("box", 0, 0, 0, 5.2, 0.06, 0.8, "#f97316", { glow: true }); // geothermal river
      b.add("sphere", -0.8, 0.3, 0, 0.8, 0.7, 0.8, "#e2e8f0"); // steam
      b.add("sphere", 1.2, 0.5, 0.1, 0.6, 0.6, 0.6, "#f1f5f9");
      // HD: joints cracking each column into drums, a glowing seam down the columns facing the river, cooled crust
      // floating on it and banks of slag along it, steam rolling off it, a fallen column lying across the rubble
      pillars.forEach(([x, z, h], i) => {
        for (let y = 0.7 + (i % 3) * 0.2; y < h - 0.3; y += 0.75) add("cyl", x, y, z, 0.63, 0.04, 0.63, "#18171d", hdo("stone"));
        if (Math.abs(z) < 1.2) add("box", x, 0.1, z - Math.sign(z) * 0.3, 0.05, Math.min(1.2, h * 0.5), 0.06, "#fb923c", hdo("plain", { glow: true }));
      });
      for (let i = 0; i < 9; i++) add("box", -2.2 + i * 0.55 + hr() * 0.2, 0.07, (hr() - 0.5) * 0.4, 0.3 + hr() * 0.2, 0.03, 0.2 + hr() * 0.15, "#292524", hdo("lava", { ry: hr() * 3 }));
      for (const s of [-1, 1]) for (let i = 0; i < 6; i++) add("sphere", -2.3 + i * 0.9 + hr() * 0.3, -0.05, s * 0.48, 0.45, 0.16, 0.22, "#1c1917", hdo("lava"));
      for (const x of [-1.5, 0.3, 1.9]) for (let k = 0; k < 3; k++) add("sphere", x, 0.1, 0, 0.5, 0.45, 0.5, "#f1f5f9", { idle: IDLE_KIND.smoke, phase: 0.01 + x + (k * Math.PI * 2) / 3, hd: true });
      along(add, "cyl", [1.6, 0.28, 2.0], [2.6, 0.32, 1.3], 0.56, 0.56, "#3a3946", hdo("stone"));
      for (let i = 0; i < 5; i++) add("sphere", 1.6 + hr() * 1.2, -0.05, 1.3 + hr() * 1.0, 0.3, 0.2, 0.25, BASALT, hdo("hide", { hdShape: "boulder" }));
      break;
    }

    /* ==================== FJORD: sea ruins and wrecks ==================== */
    case "lm-shipwreck": {
      water(b, 3.0, "#0c4a6e");
      b.add("sphere", 1.5, -0.5, 1.1, 1.9, 1.3, 1.5, "#57534e", { mat: "hide", hdShape: "boulder" }); // the reef that holed her
      b.add("sphere", -1.7, -0.45, -1.3, 1.4, 1.1, 1.2, "#44403c", { mat: "hide", hdShape: "boulder" });
      const w = b.child(0, -0.1, 0.5);
      w.add("box", 0, -0.3, 0, 1.7, 1.1, 4.0, "#78350f", { rx: 0.12, rz: -0.3, mat: "wood" }); // listing hull
      w.add("box", 0.17, 0.72, -0.4, 1.45, 0.14, 2.6, "#a16207", { rx: 0.12, rz: -0.3, mat: "wood" }); // deck
      w.add("box", 0.33, 0.85, 1.45, 1.25, 0.75, 0.95, "#5b3b22", { rx: 0.12, rz: -0.3, mat: "wood" }); // sterncastle
      w.add("box", 0.62, 1.15, 1.95, 0.32, 0.26, 0.06, "#fde68a", { glow: true }); // a lantern still lit in the stern window
      w.add("cyl", 0.45, 0.7, -0.5, 0.16, 3.0, 0.16, "#451a03", { rz: 0.4, mat: "wood" }); // broken mast
      w.add("box", 1.0, 1.9, -0.5, 0.05, 1.0, 1.4, "#e2e8f0", { ry: 0.5, idle: IDLE_KIND.flutter, mat: "cloth", sync: 1 }); // shredded sail
      for (const z of [-1.0, 0.2]) w.add("cyl", -0.95, 0.2, z, 0.2, 0.75, 0.2, "#1c1917", { rz: Math.PI / 2, mat: "iron" }); // barnacled cannons
      b.add("box", -1.5, 0.15, 1.3, 0.65, 0.42, 0.45, "#92400e", { ry: 0.4, mat: "wood" }); // salvaged chest on the reef
      b.add("sphere", -1.5, 0.45, 1.3, 0.55, 0.28, 0.4, "#fbbf24", { glow: true }); // spilled gold
      const casks: Array<[number, number]> = [
        [2.2, -0.6],
        [-0.6, 2.3],
        [1.0, -2.2]
      ];
      casks.forEach(([x, z], i) => {
        b.add("cyl", x, 0.1 - 0.275, z, 0.42, 0.55, 0.42, "#a16207", { rz: Math.PI / 2, idle: IDLE_KIND.sway, mat: "wood", sync: 2 + i }); // drifting casks, half sunk
        // HD: its iron hoops, bobbing with it
        for (const k of [-0.17, 0.17]) along(add, "cyl", [x + k - 0.02, 0.1, z], [x + k + 0.02, 0.1, z], 0.46, 0.46, IRON, hdo("iron", { idle: IDLE_KIND.sway, sync: 2 + i }));
      });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const spin: AddOpts = { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 2.1 };
        b.add("sphere", Math.cos(a) * 2.6, 0.3, Math.sin(a) * 2.6, 0.24, 0.24, 0.24, "#5eead4", { glow: true, ...spin }); // sea-lanterns drifting round
        lanternFrame(add, Math.cos(a) * 2.6, 0.28, Math.sin(a) * 2.6, 0.28, 0.3, "#a16207", { ...spin, mat: "gold" });
      }
      for (let i = 0; i < 2; i++) {
        const spin: AddOpts = { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 3 };
        b.add("octa", 2.2, 3.4 + i * 0.5, 0, 0.3, 0.1, 0.5, "#f8fafc", { ...spin, hd: false }); // gulls
        bird(add, 2.2, 3.45 + i * 0.5, 0, 1.1, "#f8fafc", "#e2e8f0", "#f59e0b", spin);
      }
      {
        // HD, each piece in the tilted frame of the Normal part it sits on (every Normal part of the wreck turns about
        // its own centre): strakes down her sides and a hole stove in the port bow with broken ribs (the hull), planks
        // and a broken rail (the deck), lit windows and a roof (the sterncastle); splinters on the snapped mast, a yard
        // hanging off it and rigging down to the rails; tatters of sail, cannon muzzles, the chest's bands and lock and
        // the gold in it, barnacles and weed on the reefs, planks floating
        const tilted = (c: V3) => tiltAdd(w.add.bind(w), c, 0.12, -0.3);
        const ha = tilted([0, -0.3 + 0.55, 0]).add; // hull 1.7 x 1.1 x 4.0
        for (const sx of [-1, 1]) for (const y of [-0.32, -0.02, 0.28]) ha("box", sx * 0.88, y - 0.03, 0, 0.06, 0.06, 3.92, "#5b2a0f", hdo("wood"));
        ha("box", -0.9, -0.22, -1.1, 0.06, 0.5, 0.9, "#1c1917", hdo("wood"));
        for (const z of [-1.42, -1.1, -0.78]) ha("box", -0.95, -0.3, z, 0.06, 0.62, 0.08, "#a16207", hdo("wood"));
        const deck = tilted([0.17, 0.72 + 0.07, -0.4]); // deck 1.45 x 0.14 x 2.6
        const da = deck.add;
        for (let i = 0; i < 6; i++) da("box", 0, 0.07, -1.05 + i * 0.42, 1.4, 0.03, 0.03, "#78350f", hdo("wood"));
        for (const sx of [-1, 1]) {
          for (let i = 0; i < 6; i++) {
            if ((i + (sx > 0 ? 1 : 0)) % 3 === 2) continue; // broken out
            da("box", sx * 0.66, 0.07, -1.15 + i * 0.45, 0.06, 0.28, 0.06, "#5b2a0f", hdo("wood"));
          }
          da("box", sx * 0.66, 0.35, -0.5, 0.07, 0.05, 1.3, "#5b2a0f", hdo("wood"));
        }
        const sa = tilted([0.33, 0.85 + 0.375, 1.45]).add; // sterncastle 1.25 x 0.75 x 0.95
        for (const sx of [-0.4, -0.05]) sa("box", sx, -0.12, 0.5, 0.2, 0.22, 0.06, "#f59e0b", hdo("plain", { glow: true }));
        sa("box", 0, 0.375, 0, 1.35, 0.06, 1.05, "#3b2414", hdo("wood"));
        const md: V3 = [-Math.sin(0.4), Math.cos(0.4), 0];
        const mc: V3 = [0.45, 2.2, -0.5];
        const top: V3 = [mc[0] + md[0] * 1.5, mc[1] + md[1] * 1.5, mc[2]];
        const wa = w.add.bind(w);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          const o: V3 = [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.06];
          along(wa, "cone", [top[0] + o[0] - md[0] * 0.12, top[1] - md[1] * 0.12, top[2] + o[2]], [top[0] + o[0] + md[0] * (0.12 + k * 0.05), top[1] + md[1] * (0.12 + k * 0.05), top[2] + o[2]], 0.07, 0.07, "#451a03", hdo("wood"));
        }
        const yardAt: V3 = [mc[0] + md[0] * 0.6, mc[1] + md[1] * 0.6, mc[2]];
        along(wa, "cyl", yardAt, [1.35, 1.55, -0.15], 0.07, 0.07, "#3b2414", hdo("wood"));
        for (const p of [deck.at([0.66, 0.4, -1.2]), deck.at([-0.66, 0.4, -1.0]), deck.at([0.66, 0.4, 1.1])]) along(wa, "cyl", [top[0], top[1] - 0.2, top[2]], p, 0.02, 0.02, ROPE, hdo("cloth"));
        const sd: V3 = [Math.sin(0.5), 0, Math.cos(0.5)];
        for (const k of [-0.45, 0, 0.45]) w.add("box", 1.0 + sd[0] * k, 1.55, -0.5 + sd[2] * k, 0.04, 0.36, 0.14, "#e2e8f0", hdo("cloth", { ry: 0.5, idle: IDLE_KIND.flutter, sync: 1 }));
        for (const z of [-1.0, 0.2]) {
          along(wa, "cyl", [-1.36, 0.575, z], [-1.28, 0.575, z], 0.27, 0.27, "#292524", hdo("iron"));
          wa("sphere", -0.55, 0.52, z, 0.12, 0.12, 0.12, "#292524", hdo("iron"));
          for (let k = 0; k < 3; k++) wa("cone", -1.1 + k * 0.17, 0.66, z + (k - 1) * 0.04, 0.06, 0.06, 0.06, "#d6d3d1", hdo("bone"));
        }
      }
      const ch = b.child(-1.5, 1.3, 0.4);
      for (const x of [-0.2, 0.2]) ch.add("box", x, 0.14, 0, 0.06, 0.44, 0.48, IRON, hdo("iron"));
      ch.add("box", 0, 0.35, 0.235, 0.12, 0.14, 0.04, "#a16207", hdo("gold"));
      coins(ch.add.bind(ch), hr, 0, 0.6, 0, 0.18, 5, "#fbbf24", hdo("gold"), 0.1);
      for (const [cx, cz, r] of [
        [1.5, 1.1, 0.95],
        [-1.7, -1.3, 0.7]
      ]) {
        for (let i = 0; i < 6; i++) {
          const a = hr() * Math.PI * 2;
          add("cone", cx + Math.cos(a) * r * 0.85, 0.08, cz + Math.sin(a) * r * 0.8, 0.09, 0.08, 0.09, "#d6d3d1", hdo("bone"));
        }
        for (let i = 0; i < 3; i++) {
          const a = hr() * Math.PI * 2;
          add("cone", cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r, 0.1, 0.55 + hr() * 0.3, 0.1, "#166534", hdo("leaf", { idle: IDLE_KIND.sway }));
        }
      }
      for (let i = 0; i < 3; i++) add("box", -2.2 + i * 1.6, 0.08, 1.9 - i * 1.8, 0.9, 0.05, 0.18, "#78350f", hdo("wood", { ry: hr() * 3 }));
      break;
    }
    case "lm-drowned-lighthouse": {
      water(b, 3.0, "#0e7490");
      b.add("sphere", -0.6, -0.7, 0.2, 3.0, 1.6, 2.4, "#57534e", { mat: "hide", hdShape: "boulder" }); // the reef it slid onto
      // The tower leans out over the water, ringed red and white
      const lean = 0.42;
      const at = (s: number): [number, number] => [-0.9 + Math.sin(lean) * s, Math.cos(lean) * s];
      for (let i = 0; i < 6; i++) {
        const [x0, y0] = at(-0.4 + i * 0.85);
        const [x1, y1] = at(0.45 + i * 0.85);
        strut(b, "cyl", x0, y0, x1, y1, 0, 1.3 - i * 0.1, i % 2 ? "#b91c1c" : "#f1f5f9", { mat: "plain" });
      }
      const [gx0, gy0] = at(4.7);
      const [gx1, gy1] = at(4.95);
      strut(b, "cyl", gx0, gy0, gx1, gy1, 0, 1.2, "#1f2937", { mat: "iron" }); // gallery
      const [lx, ly] = at(5.3);
      b.add("sphere", lx, ly - 0.35, 0, 0.7, 0.7, 0.7, "#4ade80", { glow: true }); // the green lamp, still burning
      b.add("box", lx, ly - 0.07, 0, 3.6, 0.14, 0.16, "#bbf7d0", { glow: true, idle: IDLE_KIND.spin, hd: false, sync: 1 }); // its sweeping beam
      const [rx, ry] = at(5.65);
      b.add("cone", rx, ry - 0.4, 0, 1.2, 0.8, 1.2, "#7f1d1d", { rz: -lean, mat: "iron" });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add("cone", -0.6 + Math.cos(a) * 1.6, -0.2, 0.2 + Math.sin(a) * 1.3, 0.25, range(rng, 0.7, 1.2), 0.25, "#15803d", { idle: IDLE_KIND.sway, mat: "leaf" }); // kelp
      }
      const boat = b.child(2.0, 1.7, 0.7); // a keeper's rowboat
      boat.add("box", 0, 0, 0, 0.6, 0.3, 1.4, "#7c4a24", { mat: "wood", hdShape: "pod" });
      boat.add("box", 0, 0.2, 0, 1.6, 0.05, 0.08, "#a16207", { rz: 0.15, mat: "wood" });
      for (let i = 0; i < 2; i++) {
        const spin: AddOpts = { idle: IDLE_KIND.spin, pivot: [0.9, 0], phase: 0.01 + i * 3 };
        b.add("octa", 2.4, 4.6 + i * 0.6, 0, 0.3, 0.1, 0.5, "#f8fafc", { ...spin, hd: false }); // gulls round the lamp
        bird(add, 2.4, 4.65 + i * 0.6, 0, 1.1, "#f8fafc", "#e2e8f0", "#f59e0b", spin);
      }
      {
        // HD: in place of the spinning bar, two cones of light spreading from the lamp and riding its turn; a door and
        // windows up the tower, barnacles and foam round its foot, a railed gallery, glazing bars round the lamp, a ball
        // on the cap; the rowboat's rim, thwart and oar blades; more kelp swaying
        for (const k of [-1, 1]) along(add, "cone", [lx + k * 1.85, ly, 0], [lx + k * 0.25, ly, 0], 0.55, 0.55, "#bbf7d0", hdo("plain", { glow: true, idle: IDLE_KIND.spin, sync: 1 }));
        const u: V3 = [Math.sin(lean), Math.cos(lean), 0];
        const n: V3 = [Math.cos(lean), -Math.sin(lean), 0];
        const p3 = (s: number): V3 => [at(s)[0], at(s)[1], 0];
        const radius = (s: number) => (1.3 - Math.min(5, Math.floor((s + 0.4) / 0.85)) * 0.1) / 2;
        for (const [s, door] of [
          [0.35, true],
          [1.55, false],
          [3.2, false]
        ] as const) {
          const c = p3(s);
          const r = radius(s) + 0.02;
          const len = door ? 0.28 : 0.16;
          along(add, "box", [c[0] - u[0] * len, c[1] - u[1] * len, r], [c[0] + u[0] * len, c[1] + u[1] * len, r], door ? 0.32 : 0.14, 0.06, "#1c1917", hdo("wood"));
        }
        const g = p3(4.95);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const off: V3 = [n[0] * Math.cos(a) * 0.56, n[1] * Math.cos(a) * 0.56, Math.sin(a) * 0.56];
          const f: V3 = [g[0] + off[0], g[1] + off[1], off[2]];
          along(add, "cyl", f, [f[0] + u[0] * 0.28, f[1] + u[1] * 0.28, f[2]], 0.03, 0.03, IRON, hdo("iron"));
        }
        const rail = p3(5.23);
        arc(add, rail, n, [0, 0, 1], 0.56, 0, Math.PI * 2, 14, 0.035, IRON, hdo("iron"));
        const lamp = p3(5.3);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          const off: V3 = [n[0] * Math.cos(a) * 0.38, n[1] * Math.cos(a) * 0.38, Math.sin(a) * 0.38];
          along(add, "cyl", [lamp[0] + off[0] - u[0] * 0.32, lamp[1] + off[1] - u[1] * 0.32, off[2]], [lamp[0] + off[0] + u[0] * 0.3, lamp[1] + off[1] + u[1] * 0.3, off[2]], 0.035, 0.035, IRON, hdo("iron"));
        }
        const tip = p3(6.07);
        add("sphere", tip[0], tip[1] - 0.06, 0, 0.13, 0.13, 0.13, "#a16207", hdo("dull"));
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          add("cone", -0.9 + Math.cos(a) * 0.68 + 0.05, 0.02, Math.sin(a) * 0.68, 0.1, 0.09, 0.1, "#d6d3d1", hdo("bone"));
        }
        foam(add, -0.6, 0.2, 1.5, 1.22);
        const ba = boat.add.bind(boat);
        arc(ba, [0, 0.3, 0], [1, 0, 0], [0, 0, 1], [0.3, 0.69], 0, Math.PI * 2, 14, 0.05, "#5b3b22", hdo("wood"));
        ba("box", 0, 0.22, 0.1, 0.56, 0.04, 0.16, "#a16207", hdo("wood"));
        for (const k of [-1, 1]) {
          const ox = k * 0.8 * Math.cos(0.15);
          ba("box", ox, 0.2 + 0.025 + k * 0.8 * Math.sin(0.15) - 0.02, 0, 0.26, 0.03, 0.14, "#a16207", hdo("wood", { rz: 0.15 }));
        }
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.6;
          add("cone", -0.6 + Math.cos(a) * 1.9, -0.2, 0.2 + Math.sin(a) * 1.55, 0.14, 0.7 + hr() * 0.5, 0.14, "#166534", hdo("leaf", { idle: IDLE_KIND.sway }));
        }
      }
      break;
    }
    case "lm-leviathan-arch": {
      water(b, 3.0, "#155e75");
      const arches: Array<Array<[number, number]>> = [];
      for (const z of [-0.85, 0.85]) {
        // Each jawbone rises from the sea in one great arch
        const pts: Array<[number, number]> = [];
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI * (i / 8);
          pts.push([-Math.cos(a) * 2.4, Math.sin(a) * 4.4 - 0.3]);
        }
        for (let i = 0; i < 8; i++) strut(b, "cyl", pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], z, 0.6 - Math.abs(i - 3.5) * 0.04, BONE, { hd: false });
        // HD: the jawbone as one smooth curve, each piece reaching back into the last
        for (let i = 0; i < 8; i++) {
          const [[x0, y0], [x1, y1]] = [pts[i], pts[i + 1]];
          const k = i ? 0.4 : 0;
          along(add, "capsule", [x0 - (x1 - x0) * k, y0 - (y1 - y0) * k, z], [x1, y1, z], 0.6 - Math.abs(i - 3.5) * 0.04, 0.56 - Math.abs(i - 3.5) * 0.04, BONE, hdo("bone"));
        }
        for (let i = 2; i <= 6; i++) b.add("cone", pts[i][0] * 0.86, pts[i][1] - 0.85, z, 0.2, 0.55, 0.2, "#f5f5f4", { rx: Math.PI, mat: "bone" }); // teeth
        for (const s of [-1, 1]) b.add("sphere", s * 2.4, -0.3, z, 1.0, 0.7, 0.9, "#78716c", { mat: "hide", hdShape: "boulder" }); // barnacled roots
        arches.push(pts);
      }
      // Sailors' charms hung from the crown, and sea-lanterns drifting through the arch
      b.add("cyl", 0, 2.9, 0, 0.05, 1.2, 0.05, "#3f2a1a", { mat: "cloth" });
      b.add("box", 0, 2.45, 0, 0.3, 0.45, 0.06, "#fde68a", { glow: true, idle: IDLE_KIND.flutter });
      for (const x of [-1.2, 1.2]) {
        b.add("cyl", x, 2.6, 0, 0.04, 1.0, 0.04, "#3f2a1a", { mat: "cloth" });
        b.add("octa", x, 2.3, 0, 0.22, 0.32, 0.22, "#67e8f9", { glow: true, mat: "gem" });
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const spin: AddOpts = { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 1.6 };
        const [x, y, z] = [Math.cos(a) * 1.9, 0.4 + (i % 2) * 0.7, Math.sin(a) * 1.9];
        b.add("sphere", x, y, z, 0.26, 0.26, 0.26, "#a5f3fc", { glow: true, ...spin });
        lanternFrame(add, x, y - 0.03, z, 0.3, 0.32, "#a16207", { ...spin, mat: "gold" });
      }
      // HD: barnacles crusting the bone near the sea, weed hanging from the arch and swaying, sailors' warding runes lit
      // along both jawbones, a chain slung between them at the crown with shells, bottles and bone tokens hung from it,
      // foam round the roots
      arches.forEach((pts, j) => {
        const z = j ? 0.85 : -0.85;
        for (let i = 0; i < 8; i++) {
          const [x0, y0] = pts[i];
          const [x1, y1] = pts[i + 1];
          const len = Math.hypot(x1 - x0, y1 - y0);
          const [ux, uy] = [(x1 - x0) / len, (y1 - y0) / len];
          const th = (0.6 - Math.abs(i - 3.5) * 0.04) / 2;
          if (i === 0 || i === 7) {
            for (let k = 0; k < 5; k++) {
              const f = 0.1 + hr() * 0.45;
              const side = hr() < 0.5 ? -1 : 1;
              const [px, py] = i === 0 ? [x0 + ux * len * f, y0 + uy * len * f] : [x1 - ux * len * f, y1 - uy * len * f];
              add("cone", px, py - 0.04, z + side * th, 0.1, 0.09, 0.1, "#d6d3d1", hdo("bone", { rx: side * Math.PI / 2 }));
            }
          }
          if (i >= 2 && i <= 5) {
            const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
            for (const side of [-1, 1]) along(add, "capsule", [mx - ux * 0.16, my - uy * 0.16, z + side * (th + 0.02)], [mx + ux * 0.16, my + uy * 0.16, z + side * (th + 0.02)], 0.05, 0.05, "#67e8f9", hdo("plain", { glow: true }));
            add("cone", mx, my - th - 0.65, z, 0.08, 0.65, 0.08, "#166534", hdo("leaf", { rx: Math.PI }));
          }
        }
        for (const s of [-1, 1]) foam(add, s * 2.4, z, 0.52, 0.47);
      });
      const sag = (z: number) => 3.95 - Math.sin(Math.PI * ((z + 0.85) / 1.7)) * 0.35;
      for (let i = 0; i < 9; i++) {
        const [z0, z1] = [-0.85 + (i / 9) * 1.7, -0.85 + ((i + 1) / 9) * 1.7];
        along(add, "capsule", [0, sag(z0), z0], [0, sag(z1), z1], i % 2 ? 0.05 : 0.07, i % 2 ? 0.07 : 0.05, IRON, hdo("iron"));
      }
      for (const [z, kind] of [
        [-0.5, 0],
        [-0.25, 1],
        [0.3, 2],
        [0.55, 1]
      ] as const) {
        const y = sag(z);
        add("cyl", 0, y - 0.4, z, 0.02, 0.38, 0.02, ROPE, hdo("cloth"));
        const o = hdo(kind === 1 ? "gel" : "bone");
        if (kind === 0) add("sphere", 0, y - 0.55, z, 0.16, 0.13, 0.08, "#fbcfe8", o);
        else if (kind === 1) add("egg", 0, y - 0.62, z, 0.1, 0.2, 0.1, "#5eead4", o);
        else add("box", 0, y - 0.55, z, 0.04, 0.14, 0.1, BONE, o);
      }
      break;
    }

    /* ======================== DESERT: temples ======================== */
    case "lm-sun-temple": {
      b.add("cyl", 0, 0, 0, 5.8, 0.05, 5.8, SAND, { mat: "hide" });
      b.add("box", 0, 0, 0, 4.4, 0.35, 3.4, "#d6b06a", { mat: "plain", hdShape: "block" }); // stepped platform
      b.add("box", 0, 0.35, 0, 3.8, 0.35, 2.8, "#e2c287", { mat: "plain", hdShape: "block" });
      b.add("box", 0, 0.7, 0, 3.2, 0.2, 2.2, "#f1d9a8", { mat: "plain", hdShape: "block" });
      b.add("box", 0, 0, 2.05, 1.2, 0.2, 0.6, "#c9a15a", { mat: "plain", hdShape: "block" }); // front steps
      for (const x of [-1.35, -0.45, 0.45, 1.35]) for (const z of [-0.85, 0.85]) b.add("cyl", x, 0.9, z, 0.32, 1.8, 0.32, "#f5e6c4", { mat: "plain" }); // colonnade
      b.add("box", 0, 2.7, 0, 3.4, 0.3, 2.3, "#e6c48a", { mat: "plain" }); // entablature
      b.add("box", 0, 2.78, 0, 3.5, 0.12, 2.4, "#b45309", { mat: "plain" }); // painted frieze band
      b.add("prism", 0, 3.0, 0, 3.4, 0.7, 2.3, "#c9a15a", { mat: "plain" });
      b.add("cyl", 0, 3.45, 0, 0.12, 1.0, 0.12, "#a16207", { mat: "gold" });
      // The sun disc on the roof turns with the day, its rays with it
      b.add("cyl", 0, 4.4, 0, 1.5, 0.14, 1.5, "#fbbf24", { rx: Math.PI / 2, glow: true, idle: IDLE_KIND.spin, phase: 0.01 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.add("box", Math.cos(a) * 1.05, 4.47 + Math.sin(a) * 1.05 - 0.2, 0, 0.12, 0.4, 0.06, "#fde047", { rz: a - Math.PI / 2, glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 });
      }
      for (const x of [-1.9, 1.9]) {
        b.add("cyl", x, 0.35, 1.45, 0.3, 0.7, 0.3, "#78350f", { mat: "gold" }); // braziers
        b.add("cone", x, 1.05, 1.45, 0.4, 0.6, 0.4, "#f97316", { glow: true });
        b.add("box", x * 1.35, 0, -1.2, 0.4, 2.6, 0.4, "#d6b06a", { mat: "plain", hdShape: "block" }); // obelisks
        b.add("pyramid", x * 1.35, 2.6, -1.2, 0.4, 0.35, 0.4, "#fbbf24", { glow: true });
        // HD: the brazier's rim and lion feet, glyphs gilt down the obelisk's face
        add("cyl", x, 1.0, 1.45, 0.4, 0.07, 0.4, "#a16207", hdo("gold"));
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.3;
          add("sphere", x + Math.cos(a) * 0.15, 0.35, 1.45 + Math.sin(a) * 0.15, 0.1, 0.12, 0.1, "#a16207", hdo("gold"));
        }
        for (let k = 0; k < 4; k++) rune(add, k + (x > 0 ? 1 : 0), x * 1.35, 0.5 + k * 0.48, -1.2 + 0.22, 0.5, "#b45309", {}, false);
      }
      b.add("cyl", 0, 0.9, -0.1, 0.9, 0.08, 0.9, "#b45309", { rx: Math.PI / 2, mat: "gold" }); // the priests' gong
      {
        // HD: steps climbing every stage of the platform, a base and a capital on every column, dentils and gilt
        // glyphs on the frieze, gilt acroteria on the roof, a gilt face on the sun disc (both sides) and slender
        // rays between the great ones, all turning with it; the gong's frame and mallet
        add("box", 0, 0.2, 1.92, 1.2, 0.2, 0.34, "#d0ad6a", hdo("plain", { hdShape: "block" }));
        add("box", 0, 0.4, 1.6, 1.1, 0.3, 0.3, "#dcbd80", hdo("plain", { hdShape: "block" }));
        add("box", 0, 0.7, 1.27, 1.0, 0.2, 0.26, "#e8cf9c", hdo("plain", { hdShape: "block" }));
        for (const x of [-1.35, -0.45, 0.45, 1.35])
          for (const z of [-0.85, 0.85]) {
            add("cyl", x, 0.9, z, 0.42, 0.1, 0.42, "#e2c287", hdo("plain"));
            add("cyl", x, 2.56, z, 0.44, 0.14, 0.44, "#e2c287", hdo("plain"));
          }
        for (const z of [-1, 1])
          for (let i = 0; i < 14; i++) add("box", -1.56 + i * 0.24, 2.92, z * 1.19, 0.1, 0.07, 0.08, "#d6b06a", hdo("plain"));
        for (const z of [-1, 1]) for (let i = 0; i < 7; i++) add("box", -1.35 + i * 0.45, 2.81, z * 1.225, i % 2 ? 0.1 : 0.2, 0.06, 0.05, "#fbbf24", hdo("gold"));
        for (const x of [-1.62, 1.62]) add("cone", x, 3.0, 0, 0.18, 0.3, 0.18, "#fbbf24", hdo("gold"));
        const spin: AddOpts = { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 };
        for (const z of [-1, 1]) {
          add("cyl", 0, 4.47 - 0.03, z * 0.1, 0.9, 0.06, 0.9, "#fde68a", hdo("gold", { ...spin, rx: Math.PI / 2, glow: true }));
          for (const sx of [-1, 1]) add("sphere", sx * 0.16, 4.52 + 0.1 - 0.05, z * 0.13, 0.12, 0.1, 0.06, "#b45309", hdo("gold", spin));
          add("box", 0, 4.27 + 0.06, z * 0.13, 0.26, 0.05, 0.05, "#b45309", hdo("gold", spin));
        }
        for (let i = 0; i < 8; i++) {
          const a = ((i + 0.5) / 8) * Math.PI * 2;
          add("box", Math.cos(a) * 0.95, 4.47 + Math.sin(a) * 0.95 - 0.14, 0, 0.05, 0.28, 0.05, "#fde047", hdo("plain", { ...spin, rz: a - Math.PI / 2, glow: true }));
        }
        for (const x of [-0.55, 0.55]) add("cyl", x, 0.9, -0.1, 0.08, 1.05, 0.08, "#78350f", hdo("wood"));
        along(add, "cyl", [-0.6, 1.9, -0.1], [0.6, 1.9, -0.1], 0.09, 0.09, "#78350f", hdo("wood"));
        for (const x of [-0.12, 0.12]) along(add, "cyl", [x, 1.9, -0.1], [x * 0.6, 1.37, -0.1], 0.015, 0.015, ROPE, hdo("cloth"));
        along(add, "cyl", [0.72, 0.92, 0.25], [0.5, 1.4, 0.2], 0.04, 0.04, "#78350f", hdo("wood"));
        add("sphere", 0.5, 1.33, 0.2, 0.14, 0.14, 0.14, "#7f1d1d", hdo("leather"));
      }
      break;
    }
    case "lm-tomb-of-kings": {
      b.add("cyl", 0, 0, 0, 5.8, 0.05, 5.8, SAND, { mat: "hide" });
      b.add("box", 0, 0, -1.2, 5.4, 3.8, 1.6, "#9a3412", { mat: "hide" }); // red cliff
      b.add("pyramid", -1.6, 3.8, -1.2, 2.0, 0.9, 1.6, "#7c2d12", { mat: "hide" });
      b.add("pyramid", 1.4, 3.8, -1.3, 2.4, 1.2, 1.5, "#7c2d12", { mat: "hide" });
      b.add("box", 0, 0, -0.33, 0.9, 1.5, 0.05, "#0c0a09"); // the dark doorway
      b.add("box", 0, 1.55, -0.3, 1.2, 0.25, 0.1, "#fbbf24", { glow: true }); // glyphs over the door
      for (const x of [-2.0, -1.0, 1.0, 2.0]) {
        const k = b.child(x, -0.4);
        k.add("box", 0, 0, 0.2, 0.75, 0.55, 0.4, "#c2410c", { mat: "stone", hdShape: "block" }); // throne
        k.add("box", 0, 0.55, 0.15, 0.6, 1.2, 0.3, "#d97706", { mat: "plain", hdShape: "block" }); // seated king
        k.add("box", 0, 0.55, 0.45, 0.6, 0.18, 0.5, "#d97706", { mat: "plain", hdShape: "block" }); // lap
        k.add("box", 0, 0, 0.6, 0.55, 0.55, 0.2, "#d97706", { mat: "plain", hdShape: "block" }); // shins
        k.add("box", 0, 1.75, 0.15, 0.4, 0.42, 0.36, "#d97706", { mat: "plain", hdShape: "egg" }); // head
        k.add("box", 0, 1.68, 0.06, 0.62, 0.62, 0.3, "#1d4ed8", { mat: "plain", hdShape: "block" }); // striped headdress
        k.add("pyramid", 0, 2.3, 0.06, 0.62, 0.3, 0.3, "#fbbf24", { mat: "gold" });
        k.add("box", 0, 1.88, 0.36, 0.26, 0.06, 0.05, "#22d3ee", { glow: true, hd: false }); // watchful eyes
        k.add("cone", 0.12, 0.73, 0.55, 0.18, 0.35, 0.18, "#f97316", { glow: true }); // torch in its lap
        // HD: a carved royal face (almond eyes lit from within, lined in kohl, a straight nose, full lips), gilt stripes on the headdress and its lappets falling
        // over the chest, a cobra on the brow, a plaited beard, arms resting on the knees (the right hand holding the
        // torch's haft), glyphs on the throne
        const ka = k.add.bind(k);
        const STATUE = "#d97706";
        pharaohFace(ka, 1.96, 0.15, STATUE);
        for (const y of [1.8, 1.97, 2.14]) for (const sx of [-1, 1]) ka("box", sx * 0.33, y, 0.06, 0.04, 0.07, 0.31, "#fbbf24", hdo("gold"));
        for (const sx of [-1, 1]) {
          ka("box", sx * 0.22, 1.36, 0.33, 0.14, 0.38, 0.06, "#1d4ed8", hdo("stone"));
          for (const y of [1.45, 1.6]) ka("box", sx * 0.22, y, 0.38, 0.15, 0.04, 0.05, "#fbbf24", hdo("gold"));
          along(ka, "limb", [sx * 0.33, 1.6, 0.15], [sx * 0.33, 0.98, 0.25], 0.16, 0.16, STATUE, hdo("plain"));
          along(ka, "limb", [sx * 0.32, 0.98, 0.25], [sx * 0.2, 0.8, 0.62], 0.14, 0.13, STATUE, hdo("plain"));
          ka("sphere", sx * 0.19, 0.74, 0.64, 0.14, 0.1, 0.14, STATUE, hdo("plain"));
        }
        ka("capsule", 0, 2.17, 0.27, 0.06, 0.14, 0.06, "#fbbf24", hdo("gold"));
        ka("box", 0, 1.5, 0.3, 0.09, 0.24, 0.08, "#1d4ed8", hdo("stone"));
        along(ka, "cyl", [0.12, 0.58, 0.66], [0.12, 0.82, 0.58], 0.05, 0.05, "#78350f", hdo("wood"));
        for (const sx of [-0.2, 0, 0.2]) ka("box", sx, 0.2, 0.42, 0.08, 0.16, 0.06, "#7c2d12", hdo("stone"));
      }
      for (const [x, z, r] of [
        [-1.6, 1.6, 0.4],
        [1.3, 1.9, -0.7],
        [0.2, 2.3, 1.2]
      ]) {
        b.add("cyl", x, 0.11 - 0.4, z, 0.12, 0.8, 0.12, BONE, { rz: Math.PI / 2, ry: r, hd: false }); // tomb robbers' bones, on the sand
        // HD: a knobbed bone in its place
        bone(add, [x - Math.cos(r) * 0.4, 0.07, z + Math.sin(r) * 0.4], [x + Math.cos(r) * 0.4, 0.09, z - Math.sin(r) * 0.4], 0.11, BONE, hdo("bone"));
      }
      b.add("box", 0.4, 0.06, 1.85, 0.3, 0.25, 0.3, BONE, { hd: false }); // a skull
      b.add("sphere", -2.4, -0.3, 1.0, 1.8, 0.9, 1.4, "#e7c27a", { mat: "hide" }); // drifting sand
      b.add("sphere", 2.5, -0.3, 0.6, 1.4, 0.8, 1.2, "#e7c27a", { mat: "hide" });
      // HD: the kit skull in place of the block, layered strata on the cliff, a carved doorframe and steps, a gilt
      // scarab over the glyphs, the glint of gold inside, a robber's spade and spilled coins
      skull(add, 0.4, 0.1, 1.85, 0.3, BONE, 0.6, hdo("bone"));
      for (let l = 0; l < 4; l++) add("box", 0, 0.6 + l * 0.85, -0.4 + 0.03 - 0.02, 5.3, 0.08, 0.1, l % 2 ? "#7c2d12" : "#b45309", hdo("hide"));
      for (const sx of [-1, 1]) add("box", sx * 0.56, 0, -0.32, 0.24, 1.55, 0.14, "#c2410c", hdo("stone", { hdShape: "block" }));
      add("box", 0, 1.86, -0.32, 1.0, 0.16, 0.16, "#c2410c", hdo("stone", { hdShape: "block" }));
      add("sphere", 0, 1.98, -0.22, 0.26, 0.14, 0.12, "#fbbf24", hdo("gold"));
      for (const sx of [-1, 1]) along(add, "box", [sx * 0.08, 2.06, -0.17], [sx * 0.3, 2.12, -0.17], 0.08, 0.02, "#fbbf24", hdo("gold"));
      add("box", 0, 0, 0.0, 1.1, 0.1, 0.5, "#c2410c", hdo("stone", { hdShape: "block" }));
      coins(add, hr, 0, 0.12, -0.15, 0.3, 4, "#fbbf24", hdo("gold", { glow: true }), 0.09);
      coins(add, hr, 0.9, 0.05, 1.3, 0.35, 5, "#fbbf24", hdo("gold"), 0.1);
      along(add, "cyl", [1.5, 0.04, 1.2], [1.0, 0.75, 0.9], 0.04, 0.04, "#5b3b22", hdo("wood"));
      add("box", 1.56, 0.0, 1.24, 0.2, 0.26, 0.04, "#57534e", hdo("dull", { ry: 0.6 }));
      break;
    }

    /* ======================== FOREST: shrines ======================== */
    case "lm-moonwell": {
      b.add("cyl", 0, 0, 0, 5.6, 0.05, 5.6, "#365314", { mat: "leaf" });
      b.add("cyl", 0, 0, 0, 3.2, 0.3, 3.2, "#cbd5e1", { mat: "plain" }); // white stone rim
      b.add("cyl", 0, 0.05, 0, 2.8, 0.32, 2.8, "#bfdbfe", { glow: true }); // the silver water
      b.add("cyl", 0, 0.37, 0, 0.7, 0.5, 0.7, "#e2e8f0", { mat: "plain" }); // plinth
      const stag = b.child(0, 0, 0.6, 0.87); // the stone stag over the water
      const MARBLE = { mat: "plain" as Surface };
      stag.add("box", 0, 0.38, 0, 0.36, 0.36, 0.9, "#f1f5f9", { ...MARBLE, hdShape: "pod" });
      for (const [lx, lz] of [
        [-0.12, 0.32],
        [0.12, 0.32],
        [-0.12, -0.32],
        [0.12, -0.32]
      ]) {
        stag.add("box", lx, 0, lz, 0.1, 0.38, 0.1, "#f1f5f9", { ...MARBLE, hdShape: "limb" });
        stag.add("cyl", lx, 0, lz, 0.1, 0.05, 0.1, "#cbd5e1", hdo("plain")); // HD: a hoof
      }
      stag.add("box", 0, 0.62, 0.45, 0.18, 0.45, 0.18, "#f1f5f9", { rx: 0.4, ...MARBLE, hdShape: "taper" }); // neck
      stag.add("box", 0, 1.0, 0.6, 0.2, 0.2, 0.34, "#f1f5f9", { ...MARBLE, hdShape: "snout" }); // head
      for (const s of [-1, 1]) {
        stag.add("cyl", s * 0.14, 1.15, 0.55, 0.05, 0.55, 0.05, "#f8fafc", { rz: -s * 0.5, ...MARBLE }); // antlers
        stag.add("cyl", s * 0.3, 1.45, 0.55, 0.04, 0.35, 0.04, "#f8fafc", { rz: s * 0.4, ...MARBLE });
        // HD: tines off the beams, ears, carved eyes
        const sa = stag.add.bind(stag);
        along(sa, "cyl", [s * 0.25, 1.55, 0.55], [s * 0.32, 1.72, 0.68], 0.03, 0.03, "#f8fafc", hdo("plain"));
        along(sa, "cyl", [s * 0.19, 1.35, 0.55], [s * 0.12, 1.55, 0.66], 0.03, 0.03, "#f8fafc", hdo("plain"));
        along(sa, "cyl", [s * 0.27, 1.78, 0.55], [s * 0.4, 1.9, 0.5], 0.025, 0.025, "#f8fafc", hdo("plain"));
        along(sa, "egg", [s * 0.09, 1.12, 0.5], [s * 0.22, 1.2, 0.46], 0.06, 0.03, "#e2e8f0", hdo("plain"));
        sa("sphere", s * 0.09, 1.07, 0.67, 0.04, 0.04, 0.04, "#94a3b8", hdo("plain"));
      }
      stag.add("egg", 0, 0.6, -0.48, 0.08, 0.12, 0.06, "#f8fafc", hdo("plain", { rx: -0.6 }));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const t = b.child(Math.cos(a) * 2.35, Math.sin(a) * 2.35, -a + Math.PI / 2);
        t.add("box", -0.45, 0, 0, 0.22, 1.8, 0.22, "#e2e8f0", { mat: "plain", hdShape: "block" }); // white arches
        t.add("box", 0.45, 0, 0, 0.22, 1.8, 0.22, "#e2e8f0", { mat: "plain", hdShape: "block" });
        t.add("box", 0, 1.8, 0, 1.2, 0.18, 0.28, "#f8fafc", { mat: "plain", hdShape: "block" });
        t.add("prism", 0, 1.98, 0, 1.2, 0.35, 0.28, "#cbd5e1", { mat: "plain" });
        t.add("cyl", 0, 1.45, 0, 0.03, 0.35, 0.03, "#64748b", { mat: "steel" });
        t.add("sphere", 0, 1.2, 0, 0.24, 0.3, 0.24, "#e0f2fe", { glow: true }); // hanging moon-lantern
        // HD: a pointed arch springing between the posts, bases and capitals, a silver cage round the lantern
        const ta = t.add.bind(t);
        arc(ta, [0, 1.42, 0], [1, 0, 0], [0, 1, 0], [0.34, 0.36], 0.15, Math.PI - 0.15, 6, 0.08, "#f1f5f9", hdo("plain"));
        for (const x of [-0.45, 0.45]) {
          ta("box", x, 0, 0, 0.3, 0.12, 0.3, "#cbd5e1", hdo("plain", { hdShape: "block" }));
          ta("box", x, 1.64, 0, 0.3, 0.1, 0.3, "#cbd5e1", hdo("plain", { hdShape: "block" }));
        }
        lanternFrame(ta, 0, 1.03, 0, 0.3, 0.34, "#cbd5e1", { mat: "steel" });
      }
      for (const [x, z] of [
        [-0.8, 0.6],
        [0.7, -0.7],
        [-0.4, -0.9]
      ]) {
        b.add("cyl", x, 0.37, z, 0.4, 0.06, 0.4, "#4ade80", { mat: "leaf" }); // lily pads
        b.add("sphere", x, 0.43, z, 0.16, 0.14, 0.16, "#fdf4ff", { glow: true });
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const [r0, y, r1] = [range(rng, 1.4, 2.2), range(rng, 1.3, 2.6), range(rng, 1.4, 2.2)];
        const spin: AddOpts = { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i };
        const [x, z] = [Math.cos(a) * r0, Math.sin(a) * r1];
        b.add("octa", x, y, z, 0.18, 0.12, 0.18, "#c4b5fd", { glow: true, ...spin }); // moonmoths
        // HD: its two wings spread out from the body, across its flight
        const r = Math.hypot(x, z);
        for (const s of [-1, 1]) add("box", x + (x / r) * s * 0.14, y + 0.04, z + (z / r) * s * 0.14, 0.2, 0.015, 0.14, "#ddd6fe", hdo("plain", { ...spin, glow: true, ry: -Math.atan2(z, x), rz: s * 0.35 }));
      }
      // HD: moon runes lit round the rim, ripples of light on the water
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        add("box", Math.cos(a) * 1.5, 0.3, Math.sin(a) * 1.5, 0.05, 0.05, 0.14, "#e0f2fe", hdo("plain", { glow: true, ry: -a }));
      }
      for (const r of [0.75, 1.05]) arc(add, [0, 0.4, 0], [1, 0, 0], [0, 0, 1], r, 0, Math.PI * 2, 18, 0.025, "#eff6ff", hdo("plain", { glow: true }));
      break;
    }
    case "lm-spirit-grove": {
      b.add("cyl", 0, 0, 0, 5.6, 0.05, 5.6, "#3f6212", { mat: "leaf" });
      for (let i = 0; i < 7; i++) {
        if (i === 2) continue; // the path in
        const a = (i / 7) * Math.PI * 2 - 0.1;
        const x = Math.cos(a) * 2.4;
        const z = Math.sin(a) * 2.4;
        b.add("cyl", x, 0, z, 0.24, 2.8, 0.24, "#f5f5f4", { mat: "wood", hdShape: "trunk" }); // pale birches
        b.add("box", x, 0.9, z, 0.34, 0.07, 0.34, "#292524", { hd: false });
        b.add("box", x, 1.6, z, 0.34, 0.07, 0.34, "#292524", { hd: false });
        b.add("sphere", x, 2.3, z, 1.3, 1.1, 1.3, "#bef264", { idle: IDLE_KIND.sway, mat: "leaf", hdShape: "canopy" });
        b.add("sphere", x * 0.86, 1.55, z * 0.86, 0.24, 0.3, 0.24, "#fb923c", { glow: true, idle: IDLE_KIND.sway, sync: 30 + i }); // paper lantern
        // HD: dark birch marks round the trunk in place of the slabs, branches, the lantern's caps and its cord swaying with it
        for (const y of [0.45, 0.75, 0.95, 1.3, 1.55, 1.8, 2.1]) {
          const a0 = hr() * Math.PI * 2;
          arc(add, [x, y, z], [1, 0, 0], [0, 0, 1], 0.122, a0, a0 + 0.8 + hr() * 1.2, 3, 0.035, "#292524", hdo("wood"));
        }
        along(add, "taper", [x, 1.9, z], [x * 1.12, 2.35, z * 1.12], 0.07, 0.07, "#f5f5f4", hdo("wood"));
        const o = hdo("dull", { idle: IDLE_KIND.sway, sync: 30 + i });
        add("cyl", x * 0.86, 1.83, z * 0.86, 0.12, 0.04, 0.12, "#292524", o);
        add("cyl", x * 0.86, 1.52, z * 0.86, 0.12, 0.04, 0.12, "#292524", o);
        add("cyl", x * 0.86, 1.87, z * 0.86, 0.015, 0.3, 0.015, "#292524", { ...o, mat: "cloth" });
      }
      b.add("box", 0, 0, -0.4, 1.8, 0.3, 1.4, "#78716c", { mat: "stone", hdShape: "block" }); // shrine platform
      for (const [x, z] of [
        [-0.7, -0.95],
        [0.7, -0.95],
        [-0.7, 0.15],
        [0.7, 0.15]
      ]) {
        b.add("cyl", x, 0.3, z, 0.14, 1.1, 0.14, "#b91c1c", { mat: "leather" });
      }
      b.add("box", 0, 1.4, -0.4, 1.7, 0.12, 1.3, "#7f1d1d", { mat: "wood" });
      b.add("prism", 0, 1.52, -0.4, 2.4, 0.7, 1.9, "#14532d", { mat: "plain" }); // sweeping roof
      b.add("box", 0, 0.3, -0.45, 0.5, 0.5, 0.4, "#a8a29e", { mat: "stone", hdShape: "block" }); // offering stone
      b.add("sphere", 0, 0.8, -0.45, 0.3, 0.3, 0.3, "#fde68a", { glow: true }); // the spirit flame
      for (const x of [-0.9, 0.9]) b.add("cyl", x, 0, 1.7, 0.18, 1.9, 0.18, "#dc2626", { mat: "leather" }); // the gate before it
      b.add("box", 0, 1.9, 1.7, 2.4, 0.16, 0.26, "#1c1917", { mat: "wood" });
      b.add("box", 0, 1.55, 1.7, 2.0, 0.12, 0.18, "#dc2626", { mat: "leather" });
      for (const x of [-0.5, 0, 0.5]) b.add("box", x, 1.15, 1.7, 0.08, 0.3, 0.03, "#e2e8f0", { idle: IDLE_KIND.flutter, mat: "cloth" }); // wind-chime papers
      const spirits: Array<[number, number, number]> = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = range(rng, 1.2, 2.0);
        const y = range(rng, 1.0, 2.6);
        b.add("sphere", Math.cos(a) * r, y, Math.sin(a) * r, 0.2, 0.2, 0.2, "#ccfbf1", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 0.9 }); // drifting spirits
        spirits.push([a, r, y]);
      }
      // HD: the roof's ridge with its ends turned up, the gate's upswept ends and post caps, a straw rope with zigzag
      // papers across it, stone lanterns and stepping stones up the path, offerings, and a wisp trailing each spirit
      along(add, "capsule", [-1.05, 2.2, -0.4], [1.05, 2.2, -0.4], 0.12, 0.12, "#0f3d22", hdo("stone"));
      for (const sx of [-1, 1]) {
        along(add, "cone", [sx * 1.0, 2.2, -0.4], [sx * 1.32, 2.42, -0.4], 0.14, 0.14, "#0f3d22", hdo("stone"));
        for (const sz of [-1, 1]) along(add, "cone", [sx * 1.1, 1.55, -0.4 + sz * 0.85], [sx * 1.32, 1.72, -0.4 + sz * 1.05], 0.1, 0.1, "#14532d", hdo("stone"));
        along(add, "cone", [sx * 1.15, 2.0, 1.7], [sx * 1.42, 2.18, 1.7], 0.16, 0.2, "#1c1917", hdo("wood"));
        add("cyl", sx * 0.9, 0, 1.7, 0.26, 0.12, 0.26, "#292524", hdo("stone"));
      }
      along(add, "capsule", [-0.88, 1.38, 1.8], [0.88, 1.38, 1.8], 0.07, 0.07, "#d6c08a", hdo("cloth"));
      for (const x of [-0.6, -0.2, 0.2, 0.6]) add("box", x, 1.1, 1.86, 0.07, 0.24, 0.02, "#f8fafc", hdo("cloth", { idle: IDLE_KIND.flutter }));
      for (const sx of [-1, 1]) {
        const [x, z] = [sx * 0.72, 0.95];
        add("cyl", x, 0, z, 0.3, 0.1, 0.3, "#78716c", hdo("stone"));
        add("cyl", x, 0.1, z, 0.1, 0.4, 0.1, "#78716c", hdo("stone"));
        add("box", x, 0.5, z, 0.22, 0.2, 0.22, "#78716c", hdo("stone", { hdShape: "block" }));
        add("box", x, 0.55, z, 0.24, 0.1, 0.1, "#fde68a", hdo("plain", { glow: true }));
        add("pyramid", x, 0.7, z, 0.34, 0.16, 0.34, "#57534e", hdo("stone"));
      }
      for (const z of [0.55, 1.05, 1.5]) add("box", (hr() - 0.5) * 0.12, 0.0, z, 0.36, 0.08, 0.26, "#a8a29e", hdo("stone", { hdShape: "block", ry: hr() }));
      for (const x of [-0.17, 0.17]) add("cyl", x, 0.8, -0.3, 0.1, 0.06, 0.1, "#fef3c7", hdo("plain"));
      spirits.forEach(([a, r, y], i) => {
        const spin: AddOpts = { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 0.9 };
        const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
        // The spirits drift toward +turn, so the wisp trails behind them
        along(add, "drop", [x + Math.sin(a) * 0.45, y - 0.08, z - Math.cos(a) * 0.45], [x, y, z], 0.12, 0.12, "#99f6e4", hdo("plain", { ...spin, glow: true }));
      });
      break;
    }

    /* ====================== MOUNTAINS: forges ====================== */
    case "lm-giants-forge": {
      b.add("cyl", 0, 0, 0, 5.6, 0.25, 5.6, BASALT, { mat: "stone" });
      b.add("box", -0.9, 0.25, -1.0, 2.6, 2.0, 1.8, "#44403c", { mat: "stone", hdShape: "block" }); // the giants' hearth
      b.add("box", -0.9, 0.45, -0.05, 1.4, 1.0, 0.1, "#f97316", { glow: true }); // its glowing mouth
      b.add("cyl", -1.6, 2.25, -1.3, 0.8, 2.6, 0.8, "#3f3f46", { mat: "stone" }); // chimney
      puffs(b, -1.6, 4.85, -1.3, 1.3, "#57534e");
      for (let i = 0; i < 3; i++) {
        b.add("octa", -1.6 + Math.cos(i * 2.1) * 0.9, 4.2 + i * 0.4, -1.3 + Math.sin(i * 2.1) * 0.9, 0.14, 0.2, 0.14, "#fdba74", { glow: true, idle: IDLE_KIND.spin, pivot: [-1.6, -1.3], phase: 0.01 + i * 2.1 }); // embers whirling up
      }
      const bl = b.child(1.1, -1.2, 0.4); // mountain-sized bellows
      bl.add("box", 0, 0.25, 0, 1.7, 0.12, 1.1, "#5b3b22", { mat: "wood" });
      bl.add("box", -0.1, 0.37, 0, 1.3, 0.32, 0.95, "#7c2d12", { idle: IDLE_KIND.pulse, mat: "leather", sync: 1 });
      bl.add("box", 0, 0.72, 0, 1.7, 0.12, 1.1, "#5b3b22", { rz: 0.12, mat: "wood" });
      bl.add("cone", -1.1, 0.5 - 0.3, 0, 0.3, 0.6, 0.3, "#27272a", { rz: Math.PI / 2, mat: "iron" }); // nozzle
      b.add("box", 1.2, 0.25, 1.0, 0.9, 0.7, 0.7, "#57534e", { mat: "stone", hdShape: "block" }); // anvil block
      b.add("box", 1.2, 0.95, 1.0, 1.5, 0.35, 0.6, "#27272a", { mat: "iron" }); // giant anvil
      b.add("cone", 2.15, 1.12 - 0.225, 1.0, 0.3, 0.45, 0.3, "#27272a", { rz: -Math.PI / 2, mat: "iron" }); // anvil horn
      b.add("box", 1.1, 1.3, 1.0, 1.9, 0.08, 0.3, "#fb923c", { glow: true }); // a half-forged blade, still hot
      b.add("cyl", 0.1, 0.25, 1.6, 0.18, 2.2, 0.18, "#78350f", { rx: -0.5, mat: "wood" }); // the hammer leaning on it
      b.add("box", 0.1, 2.02, 1.07, 0.9, 0.6, 0.6, "#3f3f46", { rx: -0.5, mat: "iron" });
      for (const [x, z, s] of [
        [-2.2, 1.0, 0.9],
        [-1.5, 1.8, 0.6]
      ]) {
        b.add("sphere", x, 0.15, z, s, s * 0.6, s, "#1c1917", { mat: "hide", hdShape: "boulder" }); // coal heaps
        b.add("sphere", x + 0.1, 0.25 + s * 0.3, z, s * 0.35, s * 0.25, s * 0.35, "#f97316", { glow: true });
        // HD: lumps of coal on the heap, some still burning
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + x;
          add("sphere", x + Math.cos(a) * s * 0.3, 0.15 + s * 0.38, z + Math.sin(a) * s * 0.3, s * 0.2, s * 0.15, s * 0.18, k % 2 ? "#292524" : "#3b1d14", hdo("lava", { hdShape: "boulder" }));
        }
      }
      for (const [x, z] of [
        [2.2, -2.0],
        [-2.4, -2.1]
      ]) {
        b.add("box", x, 0.25, z, 0.5, 2.4, 0.5, "#57534e", { mat: "stone", hdShape: "block" }); // rune pillars
        b.add("box", x, 1.6, z, 0.6, 0.18, 0.6, "#fbbf24", { glow: true });
        // HD: runes lit up every face, a capstone
        for (let k = 0; k < 4; k++) {
          const f = b.child(x, z, (k * Math.PI) / 2);
          rune(f.add.bind(f), k, 0, 0.95, 0.265, 0.8, "#fbbf24");
          rune(f.add.bind(f), k + 2, 0, 2.2, 0.265, 0.6, "#fbbf24");
        }
        add("box", x, 2.65, z, 0.62, 0.16, 0.62, "#44403c", hdo("stone", { hdShape: "block" }));
      }
      {
        // HD: a brick arch round the hearth's mouth, courses and a cap on the chimney, the bellows' pleats and handles,
        // the anvil's waist and feet, the hammer's iron bands, tongs and a quench trough, a rack of ingots, chains hung
        // from the hearth with hooks
        arc(add, [-0.9, 0.45, 0.0], [1, 0, 0], [0, 1, 0], [0.82, 1.15], 0, Math.PI, 9, 0.2, "#292524", hdo("stone"), "block");
        for (const y of [2.9, 3.6, 4.3]) add("cyl", -1.6, y, -1.3, 0.86, 0.08, 0.86, "#27272a", hdo("stone"));
        add("cyl", -1.6, 4.85, -1.3, 0.98, 0.14, 0.98, "#292524", hdo("stone"));
        const ba = bl.add.bind(bl);
        for (const y of [0.45, 0.55]) ba("box", -0.1, y, 0, 1.36, 0.04, 1.0, "#5c1a0e", hdo("leather", { idle: IDLE_KIND.pulse, sync: 1 }));
        for (const sz of [-0.3, 0.3]) along(ba, "cyl", [0.85, 0.78, sz], [1.35, 0.95, sz], 0.07, 0.07, "#5b3b22", hdo("wood"));
        along(ba, "cyl", [1.35, 0.95, -0.35], [1.35, 0.95, 0.35], 0.08, 0.08, "#5b3b22", hdo("wood"));
        add("box", 1.2, 0.85, 1.0, 1.1, 0.12, 0.5, "#3f3f46", hdo("iron"));
        for (const x of [0.85, 1.55]) add("box", x, 0.25, 1.0, 0.24, 0.1, 0.76, "#3f3f46", hdo("iron"));
        const hd: V3 = [0, Math.cos(-0.5), Math.sin(-0.5)];
        for (const f of [0.3, 0.75]) {
          const p: V3 = [0.1, 0.25 + 1.1 + hd[1] * (f - 0.5) * 2.2, 1.6 + hd[2] * (f - 0.5) * 2.2];
          along(add, "cyl", [p[0], p[1] - hd[1] * 0.04, p[2] - hd[2] * 0.04], [p[0], p[1] + hd[1] * 0.04, p[2] + hd[2] * 0.04], 0.23, 0.23, IRON, hdo("iron"));
        }
        along(add, "cyl", [1.9, 0.35, 0.3], [1.6, 1.42, 0.95], 0.06, 0.06, IRON, hdo("iron"));
        along(add, "cyl", [2.05, 0.35, 0.35], [1.62, 1.42, 1.05], 0.06, 0.06, IRON, hdo("iron"));
        add("box", 2.1, 0.25, -0.35, 0.6, 0.45, 1.1, "#3b2414", hdo("wood"));
        add("box", 2.1, 0.62, -0.35, 0.48, 0.04, 0.98, "#1e3a5f", hdo("gel"));
        for (const [x, z, k] of [
          [0.2, 2.2, 0],
          [0.45, 2.25, 1],
          [0.32, 2.2, 2]
        ]) add("box", x, 0.25 + (k === 2 ? 0.12 : 0), z, 0.2, 0.12, 0.45, k === 1 ? "#a8a29e" : "#d4a017", hdo(k === 1 ? "steel" : "gold", { ry: 0.2 }));
        for (const x of [-1.8, 0.0]) {
          for (let k = 0; k < 5; k++) add("capsule", x, 1.7 - k * 0.14, -0.02, 0.05, 0.14, 0.09, IRON, hdo("iron", { ry: k % 2 ? Math.PI / 2 : 0 }));
          add("horn", x, 0.95, 0.0, 0.06, 0.18, 0.12, IRON, hdo("iron"));
        }
      }
      break;
    }
    case "lm-sky-bridge": {
      for (const s of [-1, 1]) {
        b.add("cone", s * 2.3, -0.2, 0, 2.4, 4.0, 2.6, "#64748b", { mat: "hide" }); // crags
        b.add("cone", s * 2.3, 2.6, 0, 1.2, 1.2, 1.3, "#e2e8f0", { mat: "hide" }); // snow
      }
      b.add("box", 0, 2.6, 0, 4.2, 0.3, 0.9, "#78716c", { mat: "stone" }); // the deck
      for (let i = 0; i < 6; i++) {
        const a0 = (Math.PI * i) / 6;
        const a1 = (Math.PI * (i + 1)) / 6;
        strut(b, "box", -Math.cos(a0) * 1.7, 1.7 + Math.sin(a0) * 0.9, -Math.cos(a1) * 1.7, 1.7 + Math.sin(a1) * 0.9, 0, 0.5, "#57534e", { mat: "stone", hdShape: "block" }); // carved arch
      }
      for (const z of [-0.33, 0.33]) b.add("box", 0, 2.9, z, 4.0, 0.25, 0.1, "#a8a29e", { mat: "stone" }); // parapets
      for (const x of [-0.9, 0.9]) {
        for (const z of [-0.33, 0.33]) {
          b.add("cyl", x, 3.15, z, 0.08, 0.6, 0.08, "#27272a", { mat: "iron" }); // rune lamps
          b.add("octa", x, 3.75, z, 0.2, 0.3, 0.2, "#67e8f9", { glow: true });
          // HD: iron prongs cradling the rune stone, a foot on the parapet
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2;
            along(add, "cyl", [x, 3.72, z], [x + Math.cos(a) * 0.13, 3.95, z + Math.sin(a) * 0.13], 0.025, 0.025, "#27272a", hdo("iron"));
          }
          add("cyl", x, 3.15, z, 0.16, 0.08, 0.16, "#27272a", hdo("iron"));
        }
      }
      for (const s of [-1, 1]) {
        const g = b.child(s * 1.75, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 2.9); // dwarf guardians at either end
        g.add("box", 0, 0, 0, 0.5, 0.7, 0.36, "#a8a29e", { mat: "stone", hdShape: "block" });
        g.add("sphere", 0, 0.7, 0, 0.36, 0.36, 0.36, "#a8a29e", { mat: "stone", hdShape: "egg" });
        g.add("cone", 0, 0.45, 0.16, 0.34, 0.4, 0.16, "#d6d3d1", { rx: Math.PI, mat: "stone" }); // beard
        g.add("cyl", 0.3, 0.4, 0, 0.08, 0.9, 0.08, "#57534e", { mat: "stone" });
        g.add("box", 0.3, 1.3, 0, 0.36, 0.24, 0.24, "#71717a", { mat: "stone", hdShape: "block" }); // raised hammer
        g.add("box", -0.32, 0.3, 0, 0.03, 0.5, 0.3, "#b45309", { idle: IDLE_KIND.flutter, mat: "cloth" }); // clan banner
        // HD: carved in stone: a dwarf's face (a heavy brow over deep-set eyes, a broad nose, cheeks, a drooping
        // moustache) under a helm with a nose guard and brow band, beard braids, arms to
        // the hammer's haft and the banner's pole, a belt and boots; a crossbar holding the banner
        const ga = g.add.bind(g);
        dwarfFace(ga, 0.88, 0, "#a8a29e");
        ga("sphere", 0, 0.99, -0.03, 0.4, 0.2, 0.4, "#78716c", hdo("stone"));
        ga("cyl", 0, 0.985, -0.03, 0.41, 0.05, 0.41, "#71717a", hdo("stone"));
        ga("box", 0, 0.94, 0.19, 0.035, 0.08, 0.04, "#78716c", hdo("stone"));
        for (const sx of [-1, 1]) {
          ga("cone", sx * 0.09, 0.2, 0.2, 0.07, 0.18, 0.07, "#d6d3d1", hdo("stone", { rx: Math.PI }));
          along(ga, "limb", [sx * 0.26, 0.62, 0], [sx * 0.3, 0.42, 0.08], 0.12, 0.12, "#a8a29e", hdo("stone"));
          ga("sphere", sx * 0.3, 0.36, 0.08, 0.11, 0.1, 0.11, "#a8a29e", hdo("stone"));
          ga("box", sx * 0.12, -0.0, 0.03, 0.18, 0.1, 0.32, "#78716c", hdo("stone", { hdShape: "block" }));
        }
        ga("box", 0, 0.22, 0, 0.54, 0.08, 0.4, "#78716c", hdo("stone"));
        along(ga, "cyl", [-0.32, 0.82, -0.18], [-0.32, 0.82, 0.18], 0.04, 0.04, "#57534e", hdo("stone"));
      }
      b.add("box", 0, 0, -0.55, 0.9, 2.1, 0.12, "#7dd3fc", { mat: "gel" }); // the waterfall pouring out beneath it
      b.add("cyl", 0, 0, -0.5, 2.2, 0.1, 1.6, "#38bdf8", { mat: "gel" });
      puffs(b, 0, 0.1, -0.2, 1.1, "#e0f2fe");
      for (let i = 0; i < 2; i++) {
        const spin: AddOpts = { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 3 };
        b.add("octa", 2.6, 5.0 + i * 0.6, 0, 0.5, 0.1, 0.3, "#1c1917", { ...spin, hd: false }); // eagles
        bird(add, 2.6, 5.05 + i * 0.6, 0, 1.7, "#44403c", "#1c1917", "#f59e0b", spin);
      }
      // HD: paving joints and voussoir lines on the deck and arch, merlons along the parapets, icicles under the deck,
      // streaks of foam down the falls, rocks round the pool, pines clinging to the crags
      for (let i = 0; i < 9; i++) add("box", -1.9 + i * 0.475, 2.9, 0, 0.04, 0.02, 0.56, "#57534e", hdo("stone"));
      for (const z of [-0.33, 0.33]) for (let i = 0; i < 8; i++) add("box", -1.75 + i * 0.5, 3.15, z, 0.18, 0.12, 0.12, "#a8a29e", hdo("stone", { hdShape: "block" }));
      for (let i = 0; i < 9; i++) add("cone", -1.4 + i * 0.35, 2.3 - (i % 3) * 0.1, 0.4 * (i % 2 ? 1 : -1), 0.07, 0.3 + (i % 3) * 0.1, 0.07, "#e0f2fe", hdo("gem", { rx: Math.PI }));
      for (const x of [-0.3, 0, 0.28]) add("box", x, 0.1, -0.47, 0.08, 1.9, 0.03, "#f0f9ff", hdo("plain", { idle: IDLE_KIND.flutter }));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add("sphere", Math.cos(a) * 1.1, -0.06, -0.5 + Math.sin(a) * 0.8, 0.35, 0.22, 0.3, "#64748b", hdo("hide", { hdShape: "boulder" }));
      }
      for (const s of [-1, 1]) for (const [dx, dz] of [
        [0.7, 0.9],
        [1.0, -0.7]
      ]) {
        const [x, z] = [s * (2.3 + dx * 0.6), dz];
        const y = 4.0 * (1 - Math.hypot(dx * 0.6, dz / 1.3 * 1.2) / 1.25) - 0.2;
        if (y < 0) continue;
        add("pine", x, y - 0.1, z, 0.4, 0.75, 0.4, "#14532d", hdo("leaf", { idle: IDLE_KIND.sway }));
      }
      break;
    }
  }
}

/** Smoke, steam or mist: three puffs rising one after another */
function puffs(b: Builder, x: number, y: number, z: number, s: number, color: string) {
  for (let i = 0; i < 3; i++) b.add("sphere", x, y, z, 0.4 * s, 0.36 * s, 0.4 * s, color, { idle: IDLE_KIND.smoke, phase: 0.01 + (i * Math.PI * 2) / 3 });
}
