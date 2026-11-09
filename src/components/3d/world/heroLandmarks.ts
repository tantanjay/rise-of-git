import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Rng } from "@/utils/random";
import { Kit, MOVE, TAU, V3, craggy, dirXZ, facing, gableGeo, hash3, lancetFrameGeo, lancetGeo, rubble } from "./heroKit";
import { ASHLAR, SPARK, STRATA, Sparks, ashlarRound, bark, cloth, grainRound, pane, runeBand, runeColumn, tilesRound, tilesSlab, veins } from "./heroMaterials";

/* ------------------------------------------------------------------------- */
/* The four legendary landmarks as hand-built heroes (high graphics)          */
/* ------------------------------------------------------------------------- */

/*
 * Each builder adds its landmark round the kit's current origin, in map units (the size of its Normal model), facing +z.
 * Parts go into the shared hero materials (`heroMaterials.ts`); what moves carries its motion (`Kit.move`), so on the map
 * every hero is drawn in the same handful of draws. Effects beside the parts (flames, smoke, embers, wisps) go to `fx`.
 */

export interface HeroCtx {
  k: Kit;
  /** A spark emitter at `at` (in the kit's current frame) */
  spark: (kind: (typeof SPARK)[keyof typeof SPARK], at: V3, n: number, o: Parameters<Sparks["add"]>[3]) => void;
  /** The hero's own seeded randomness (never shared with Normal) */
  rng: Rng;
}

const UP: V3 = [0, 1, 0];

/** A segment of a round thing (bough, root, horn, haft) from one point to another, tapering from `r0` to `r1` */
export function limb(c: HeroCtx, bucket: string, from: V3, to: V3, r0: number, r1: number, o: { color: string; surf?: ReturnType<typeof bark>; seg?: number; crag?: number; seed?: number } = { color: "#fff" }) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, o.seg ?? 10, 1, true);
  c.k.along(bucket, from, to, 0, { geo: o.crag ? craggy(g, o.crag, o.seed ?? 1) : g, color: o.color, surf: o.surf });
  // A cap at the joint, so a chain of segments reads as one
  c.k.add(bucket, new THREE.SphereGeometry(r0 * 1.01, Math.max(6, (o.seg ?? 10) - 2), 4), from, undefined, { color: o.color, surf: o.surf });
}

/** A smooth chain of limbs through `pts`, radius easing from `r0` to `r1` */
export function chain(c: HeroCtx, bucket: string, pts: V3[], r0: number, r1: number, o: Parameters<typeof limb>[6]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = r0 + ((r1 - r0) * i) / (pts.length - 1);
    const b = r0 + ((r1 - r0) * (i + 1)) / (pts.length - 1);
    limb(c, bucket, pts[i], pts[i + 1], a, b, o);
  }
  c.k.add(bucket, new THREE.ConeGeometry(r1, r1 * 2.4, o?.seg ?? 10), pts[pts.length - 1], undefined, {
    color: o?.color,
    surf: o?.surf,
    quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...pts[pts.length - 1]).sub(new THREE.Vector3(...pts[pts.length - 2])).normalize())
  });
}

/** A metal band round a limb at `at`, the limb running along `dir` */
function band(c: HeroCtx, at: V3, dir: V3, r: number, color: string) {
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir).normalize());
  c.k.add("iron", new THREE.TorusGeometry(r, r * 0.17, 6, 16), at, undefined, { color, quat });
}

/** A mass of leaves: a round ball, every corner pushed out or in so it reads as tufts */
export function leafMass(radius: number, seed: number): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(radius, 2);
  ico.deleteAttribute("normal");
  ico.deleteAttribute("uv");
  // Shared corners, so the ball is shaded smooth
  const g = mergeVertices(ico);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(0.8 + hash3(v.x, v.y, v.z, seed) * 0.35);
    pos.setXYZ(i, v.x, v.y * 0.82, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A clump of leaves (a lumpy ball), swaying in the wind about a point under it */
function leafClump(c: HeroCtx, at: V3, r: number, color: string, seed: number, amp = 0.035) {
  c.k.move({ kind: MOVE.sway, pivot: [at[0], at[1] - 2.4, at[2]], amp, speed: 0.8 + (seed % 7) * 0.05, phase: seed * 1.37 }, () => {
    c.k.add("leaf", leafMass(r, 400 + seed), at, [0, seed, 0], { color });
  });
}

/** A banner of cloth hanging from a gilt rod (its top centre at `top`, facing +z of the current frame) */
export function hangingBanner(c: HeroCtx, top: V3, w: number, h: number, color: string, o: { trim?: string; tattered?: boolean; emblem?: string; rod?: string; phase?: number } = {}) {
  const [x, y, z] = top;
  c.k.add("gold", new THREE.CylinderGeometry(0.035, 0.035, w + 0.24, 8), [x, y + 0.02, z], [0, 0, Math.PI / 2], { color: o.rod ?? "#e0a93a" });
  for (const s of [-1, 1]) c.k.add("gold", new THREE.SphereGeometry(0.06, 8, 6), [x + s * (w / 2 + 0.14), y + 0.02, z], undefined, { color: o.rod ?? "#e0a93a" });
  c.k.move({ kind: MOVE.flutter, pivot: [x, y, z], axis: [0, 0, 1], amp: 0.05, speed: 2.2, phase: o.phase ?? 0 }, () => {
    c.k.add("cloth", new THREE.PlaneGeometry(w, h, 4, 10), [x, y - h / 2, z + 0.02], undefined, { color, surf: cloth(w, h, o.tattered) });
    if (o.trim) c.k.add("cloth", new THREE.PlaneGeometry(w, 0.08, 4, 1), [x, y - 0.06, z + 0.07], undefined, { color: o.trim });
    if (o.emblem) c.k.add("glow", new THREE.CircleGeometry(Math.min(w, h) * 0.2, 16), [x, y - h * 0.42, z + 0.07], undefined, { color: o.emblem, bright: 1.4 });
  });
}

/** A flag streaming from the top of a pole (pole foot at `foot`), its free edge toward +x */
export function flag(c: HeroCtx, foot: V3, poleH: number, w: number, h: number, color: string, o: { pole?: string; trim?: string; phase?: number; tattered?: boolean } = {}) {
  const [x, y, z] = foot;
  c.k.add("gold", new THREE.CylinderGeometry(0.04, 0.05, poleH, 8), [x, y + poleH / 2, z], undefined, { color: o.pole ?? "#e0a93a" });
  c.k.add("gold", new THREE.SphereGeometry(0.08, 10, 8), [x, y + poleH + 0.05, z], undefined, { color: o.pole ?? "#e0a93a" });
  const top = y + poleH - 0.08;
  c.k.move({ kind: MOVE.flutter, pivot: [x, top - h / 2, z], axis: [0, 0, 1], amp: 0.06, speed: 2.6, phase: o.phase ?? 0 }, () => {
    c.k.add("cloth", new THREE.PlaneGeometry(w, h, 8, 4), [x + w / 2 + 0.04, top - h / 2, z], undefined, { color, surf: cloth(w, h, o.tattered) });
    if (o.trim) c.k.add("cloth", new THREE.PlaneGeometry(w, 0.07, 8, 1), [x + w / 2 + 0.04, top - 0.05, z + 0.05], undefined, { color: o.trim });
  });
}

/** A pinnacle: a slim spike with a gilt knob, standing at (x, y, z) */
function pinnacle(c: HeroCtx, x: number, y: number, z: number, r: number, h: number, stone: string) {
  c.k.add("matte", new THREE.ConeGeometry(r, h, 6), [x, y + h / 2, z], undefined, { color: stone });
  c.k.add("gold", new THREE.OctahedronGeometry(r * 0.55), [x, y + h + r * 0.3, z], undefined, { color: "#e8b440", scale: [1, 1.6, 1] });
}

/** A lancet of stained glass in a stone frame, bottom centre at `at`, facing +z of the frame turned `rotY` */
function lancet(c: HeroCtx, at: V3, rotY: number, w: number, h: number, frame: string, glow = 1.6) {
  c.k.at(at, rotY, () => {
    c.k.add("glow", lancetGeo(w, h, 0.06, 3), [0, 0, 0], undefined, { surf: pane(w, h), bright: glow });
    c.k.add("matte", lancetFrameGeo(w, h, 0.06, 0.12, 3), [0, 0, 0], undefined, { color: frame });
  });
}

/** A brazier on three legs: bowl, glowing coals, flames and smoke */
function brazier(c: HeroCtx, at: V3, s: number, metal: string, flame: string) {
  const [x, y, z] = at;
  for (let l = 0; l < 3; l++) {
    const a = (l / 3) * TAU + 0.4;
    c.k.along("gold", [x + Math.cos(a) * 0.32 * s, y, z + Math.sin(a) * 0.32 * s], [x + Math.cos(a) * 0.12 * s, y + 0.75 * s, z + Math.sin(a) * 0.12 * s], 0.05 * s, { color: metal });
  }
  c.k.add("gold", new THREE.CylinderGeometry(0.42 * s, 0.2 * s, 0.26 * s, 14, 1, true), [x, y + 0.88 * s, z], undefined, { color: metal });
  c.k.add("gold", new THREE.TorusGeometry(0.42 * s, 0.035 * s, 6, 20), [x, y + 1.01 * s, z], [Math.PI / 2, 0, 0], { color: metal });
  c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 3.1, phase: x + z }, () => {
    c.k.add("glow", new THREE.SphereGeometry(0.34 * s, 10, 6, 0, TAU, 0, Math.PI / 2), [x, y + 0.86 * s, z], undefined, { color: flame, bright: 1.7, scale: [1, 0.45, 1] });
  });
  c.spark(SPARK.flame, [x, y + 0.95 * s, z], 12, { color: "#ffd27a", size: 0.32 * s, speed: 1.4, rise: 0.75 * s, spread: 0.36 * s });
  c.spark(SPARK.smoke, [x, y + 1.4 * s, z], 5, { color: "#5b544e", size: 0.7 * s, speed: 0.16, rise: 2.4 * s, reach: 0.5 });
}

/* ================================================================== */
/* Valoria: the Cathedral of the Dawn Banner                           */
/* ================================================================== */

const CATHEDRAL = {
  stone: "#f3efe6",
  stone2: "#ddd5c5",
  slate: "#33549c",
  slate2: "#284789",
  royal: "#2456c9",
  gold: "#e8b440",
  grass: "#4d8f3a",
  hedge: "#2f7d32",
  door: "#1e3a8a"
};
/** Top of the terrace the cathedral stands on */
const CT = 0.66;

/** A gable roof in slates over a box `w` wide running along z from `z0` to `z1`, eaves at `top` */
function slateRoof(c: HeroCtx, w: number, top: number, roofH: number, z0: number, z1: number, x = 0) {
  const hw = w / 2 + 0.12;
  const sl = Math.hypot(hw, roofH);
  const phi = Math.atan2(roofH, hw);
  const len = z1 - z0;
  for (const s of [-1, 1]) c.k.add("matte", new THREE.BoxGeometry(sl, 0.06, len), [x + (s * hw) / 2, top + roofH / 2 + 0.02, (z0 + z1) / 2], [0, 0, -s * phi], { color: CATHEDRAL.slate, surf: tilesSlab(sl, s) });
  // Gilt cresting along the ridge
  c.k.add("gold", new THREE.BoxGeometry(0.06, 0.06, len), [x, top + roofH + 0.05, (z0 + z1) / 2], undefined, { color: CATHEDRAL.gold });
  for (let z = z0 + 0.25; z < z1 - 0.1; z += 0.34) c.k.add("gold", new THREE.OctahedronGeometry(0.06), [x, top + roofH + 0.14, z], undefined, { color: CATHEDRAL.gold, scale: [1, 1.7, 1] });
}

/** A square belfry stage: dark arched openings on four faces with louvres, a cornice, the bell (swinging) when `bell` */
function belfry(c: HeroCtx, x: number, z: number, y0: number, w: number, h: number, bell: boolean) {
  const { stone, stone2, gold } = CATHEDRAL;
  c.k.add("matte", new THREE.BoxGeometry(w, h, w), [x, y0 + h / 2, z], undefined, { color: stone, surf: ASHLAR });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const [dx, dz] = dirXZ(a, w / 2 + 0.005);
    c.k.at([x + dx, y0 + 0.14, z + dz], facing(a), () => {
      c.k.add("matte", lancetGeo(w * 0.42, h * 0.72, 0.05, 3), [0, 0, 0], undefined, { color: "#14161c" });
      c.k.add("matte", lancetFrameGeo(w * 0.42, h * 0.72, 0.06, 0.08, 3), [0, 0, 0], undefined, { color: stone2 });
      for (let l = 0; l < 3; l++) c.k.add("matte", new THREE.BoxGeometry(w * 0.4, 0.035, 0.05), [0, h * (0.18 + l * 0.15), 0.03], [-0.5, 0, 0], { color: "#6b5a43" });
    });
  }
  c.k.add("matte", new THREE.BoxGeometry(w + 0.16, 0.12, w + 0.16), [x, y0 + h + 0.06, z], undefined, { color: stone2 });
  c.k.add("gold", new THREE.BoxGeometry(w + 0.18, 0.05, w + 0.18), [x, y0 + h - 0.06, z], undefined, { color: gold });
  if (!bell) return;
  // The bell rocking in the belfry (seen through the openings)
  const by = y0 + h * 0.62;
  c.k.move({ kind: MOVE.swing, pivot: [x, by + 0.12, z], axis: [1, 0, 0], amp: 0.35, speed: 1.6 }, () => {
    c.k.add("gold", new THREE.CylinderGeometry(0.12, 0.26, 0.36, 14, 1, true), [x, by - 0.1, z], undefined, { color: "#c9902c" });
    c.k.add("gold", new THREE.SphereGeometry(0.12, 12, 6, 0, TAU, 0, Math.PI / 2), [x, by + 0.08, z], undefined, { color: "#c9902c" });
    c.k.add("iron", new THREE.SphereGeometry(0.05, 8, 6), [x, by - 0.26, z], undefined, { color: "#3a3631" });
  });
}

/** A slate spire on a tower: octagonal, gilt collar, finial */
function slateSpire(c: HeroCtx, x: number, z: number, y0: number, r: number, h: number) {
  c.k.add("matte", new THREE.ConeGeometry(r, h, 8, 1, true), [x, y0 + h / 2, z], [0, Math.PI / 8, 0], { color: CATHEDRAL.slate2, surf: tilesRound(r, h) });
  c.k.add("gold", new THREE.TorusGeometry(r * 0.98, 0.03, 6, 24), [x, y0 + 0.02, z], [Math.PI / 2, 0, 0], { color: CATHEDRAL.gold });
  c.k.add("gold", new THREE.TorusGeometry(r * 0.45, 0.025, 6, 20), [x, y0 + h * 0.55, z], [Math.PI / 2, 0, 0], { color: CATHEDRAL.gold });
  c.k.add("gold", new THREE.SphereGeometry(0.07, 10, 8), [x, y0 + h + 0.02, z], undefined, { color: CATHEDRAL.gold });
  c.k.add("gold", new THREE.ConeGeometry(0.03, 0.4, 6), [x, y0 + h + 0.25, z], undefined, { color: CATHEDRAL.gold });
}

function dawnCathedral(c: HeroCtx) {
  const { k } = c;
  const { stone, stone2, gold, grass, royal } = CATHEDRAL;
  // The green hill and the octagonal terrace on it, a balustrade round its edge, steps up to the front
  k.add("matte", new THREE.CylinderGeometry(4.75, 4.95, 0.3, 48), [0, 0.15, 0], undefined, { color: grass });
  k.add("matte", new THREE.CylinderGeometry(4.0, 4.08, 0.36, 8), [0, 0.48, 0], [0, Math.PI / 8, 0], { color: stone2, surf: ashlarRound(4.0) });
  k.add("gold", new THREE.CylinderGeometry(4.03, 4.03, 0.04, 8, 1, true), [0, CT - 0.04, 0], [0, Math.PI / 8, 0], { color: gold });
  const apothem = 4.0 * Math.cos(Math.PI / 8);
  for (let side = 0; side < 8; side++) {
    const a = (side / 8) * TAU;
    const len = 2 * 4.0 * Math.sin(Math.PI / 8) - 0.2;
    k.at([0, CT, 0], facing(a) + Math.PI, () => {
      // Posts and a rail along each side, open at the steps (the front side)
      if (side === 2) return;
      for (let i = 0; i <= 7; i++) k.add("matte", new THREE.CylinderGeometry(0.035, 0.05, 0.3, 6), [-len / 2 + (i / 7) * len, 0.15, -apothem + 0.12], undefined, { color: stone });
      k.add("matte", new THREE.BoxGeometry(len, 0.06, 0.12), [0, 0.32, -apothem + 0.12], undefined, { color: stone2 });
    });
  }
  for (let j = 0; j < 3; j++) k.add("matte", new THREE.BoxGeometry(2.2 - j * 0.1, 0.12 * (3 - j), 0.36), [0, 0.3 + 0.06 * (3 - j), apothem + 0.2 + (2 - j) * 0.34], undefined, { color: stone2, surf: ASHLAR });

  // The nave (z −2.2 … 1.2), its slate roof and the west front between the towers
  k.add("matte", new THREE.BoxGeometry(2.4, 2.6, 3.4), [0, CT + 1.3, -0.5], undefined, { color: stone, surf: ASHLAR });
  slateRoof(c, 2.4, CT + 2.6, 1.4, -2.2, 1.25);
  k.add("matte", gableGeo(2.4, 1.4, 0.1), [0, CT + 2.6, 1.15], undefined, { color: stone, surf: ASHLAR });
  k.add("gold", new THREE.OctahedronGeometry(0.1), [0, CT + 4.15, 1.2], undefined, { color: gold, scale: [1, 1.5, 1] });
  // The portal: blue doors under a gilt pointed arch, the rose window over it
  k.add("matte", lancetGeo(0.66, 1.25, 0.05, 3), [0, CT, 1.2], undefined, { color: CATHEDRAL.door });
  k.add("gold", lancetFrameGeo(0.66, 1.25, 0.07, 0.12, 3), [0, CT, 1.2], undefined, { color: gold });
  k.add("gold", new THREE.BoxGeometry(0.04, 1.0, 0.04), [0, CT + 0.5, 1.27], undefined, { color: gold });
  k.add("glow", new THREE.CircleGeometry(0.44, 32), [0, CT + 2.05, 1.26], undefined, { surf: { fn: (p) => [p.x / 0.9 + 0.5, p.y / 0.9 + 0.5, 6] }, bright: 1.7 });
  k.add("gold", new THREE.TorusGeometry(0.45, 0.035, 6, 32), [0, CT + 2.05, 1.29], undefined, { color: gold });
  k.add("gold", new THREE.TorusGeometry(0.2, 0.025, 6, 24), [0, CT + 2.05, 1.3], undefined, { color: gold });
  for (let i = 0; i < 6; i++) k.add("gold", new THREE.BoxGeometry(0.025, 0.86, 0.03), [0, CT + 2.05, 1.3], [0, 0, (i / 6) * Math.PI], { color: gold });
  k.add("matte", new THREE.TorusGeometry(0.5, 0.06, 6, 32), [0, CT + 2.05, 1.24], undefined, { color: stone2 });
  // Side lancets of the nave (between the towers and the transept, and behind it)
  for (const s of [-1, 1]) for (const z of [0.2, -1.95]) lancet(c, [s * 1.2, CT + 0.55, z], (s * Math.PI) / 2, 0.36, 1.45, stone2);

  // The transept (x ±2.1), a rose over twin lancets at each end
  k.add("matte", new THREE.BoxGeometry(4.2, 2.4, 1.4), [0, CT + 1.2, -1.0], undefined, { color: stone, surf: ASHLAR });
  k.at([0, 0, -1.0], Math.PI / 2, () => slateRoof(c, 1.4, CT + 2.4, 1.0, -2.1, 2.1));
  for (const s of [-1, 1]) {
    k.at([s * 2.1, 0, -1.0], (s * Math.PI) / 2, () => {
      k.add("matte", gableGeo(1.4, 1.0, 0.1), [0, CT + 2.4, -0.06], undefined, { color: stone, surf: ASHLAR });
      for (const x of [-0.3, 0.3]) lancet(c, [x, CT + 0.45, 0], 0, 0.26, 1.15, stone2);
      k.add("glow", new THREE.CircleGeometry(0.3, 24), [0, CT + 1.95, 0.03], undefined, { surf: { fn: (p) => [p.x / 0.6 + 0.5, p.y / 0.6 + 0.5, 6] }, bright: 1.7 });
      k.add("gold", new THREE.TorusGeometry(0.31, 0.03, 6, 24), [0, CT + 1.95, 0.06], undefined, { color: gold });
      k.add("matte", new THREE.TorusGeometry(0.35, 0.05, 6, 24), [0, CT + 1.95, 0.02], undefined, { color: stone2 });
      for (const x of [-0.72, 0.72]) pinnacle(c, x, CT + 2.35, 0.02, 0.07, 0.42, stone);
    });
    // Twin lancets on the transept arms' front and back faces
    for (const z of [-0.3, -1.7]) lancet(c, [s * 1.65, CT + 0.5, z], z > -1 ? 0 : Math.PI, 0.3, 1.3, stone2);
  }

  // The apse behind the nave: a half-round with lancets, its slates in a half cone
  k.add("matte", new THREE.CylinderGeometry(1.2, 1.2, 2.6, 18, 1, true, Math.PI / 2, Math.PI), [0, CT + 1.3, -2.2], undefined, { color: stone, surf: ashlarRound(1.2) });
  k.add("matte", new THREE.ConeGeometry(1.32, 1.4, 18, 1, true, Math.PI / 2, Math.PI), [0, CT + 2.6 + 0.7, -2.2], undefined, { color: CATHEDRAL.slate, surf: tilesRound(1.32, 1.4) });
  for (const th of [-0.8, 0, 0.8]) lancet(c, [Math.sin(th + Math.PI) * 1.2, CT + 0.55, -2.2 + Math.cos(th + Math.PI) * 1.2], th + Math.PI, 0.3, 1.4, stone2);

  // Flying buttresses: piers with pinnacles, arms leaning to the nave's wall top
  for (const s of [-1, 1]) {
    for (const z of [0.2, -1.95]) {
      const px = s * 1.95;
      k.add("matte", new THREE.BoxGeometry(0.3, 2.0, 0.36), [px, CT + 1.0, z], undefined, { color: stone2, surf: ASHLAR });
      pinnacle(c, px, CT + 2.0, z, 0.12, 0.6, stone);
      k.along("matte", [px - s * 0.12, CT + 1.85, z], [s * 1.22, CT + 2.45, z], [0.12, 0.16], { color: stone2 });
    }
  }

  // The west towers: shafts in courses, lancets, gilt band, belfries, slate spires
  for (const s of [-1, 1]) {
    const x = s * 1.32;
    const z = 1.25;
    k.add("matte", new THREE.BoxGeometry(1.06, 4.2, 1.06), [x, CT + 2.1, z], undefined, { color: stone, surf: ASHLAR });
    k.add("matte", new THREE.BoxGeometry(1.16, 0.3, 1.16), [x, CT + 0.15, z], undefined, { color: stone2 });
    for (const y of [1.4, 2.9]) lancet(c, [x, CT + y, z + 0.53], 0, 0.28, 0.9, stone2);
    lancet(c, [x + s * 0.53, CT + 2.9, z], (s * Math.PI) / 2, 0.28, 0.9, stone2);
    k.add("gold", new THREE.BoxGeometry(1.1, 0.07, 1.1), [x, CT + 4.15, z], undefined, { color: gold });
    belfry(c, x, z, CT + 4.2, 0.92, 0.85, false);
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) pinnacle(c, x + cx * 0.5, CT + 5.17, z + cz * 0.5, 0.06, 0.36, stone);
    slateSpire(c, x, z, CT + 5.17, 0.5, 2.2);
  }

  // The crossing tower over the transept, its belfry with the bell, the tall spire and the turning golden sun
  const cz = -1.0;
  k.add("matte", new THREE.BoxGeometry(1.4, 4.75, 1.4), [0, CT + 2.375, cz], undefined, { color: stone, surf: ASHLAR });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const [dx, dz] = dirXZ(a, 0.71);
    lancet(c, [dx, CT + 4.05, cz + dz], facing(a), 0.3, 0.62, stone2);
  }
  k.add("gold", new THREE.BoxGeometry(1.44, 0.08, 1.44), [0, CT + 4.73, cz], undefined, { color: gold });
  belfry(c, 0, cz, CT + 4.75, 1.3, 1.05, true);
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) pinnacle(c, dx * 0.7, CT + 5.92, cz + dz * 0.7, 0.08, 0.55, stone);
  slateSpire(c, 0, cz, CT + 5.92, 0.78, 3.0);
  const sunY = CT + 9.55;
  k.add("gold", new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), [0, sunY - 0.55, cz], undefined, { color: gold });
  k.move({ kind: MOVE.spin, pivot: [0, sunY, cz], axis: [0, 0, 1], speed: 0.6 }, () => {
    k.add("gold", new THREE.TorusGeometry(0.42, 0.06, 8, 32), [0, sunY, cz], undefined, { color: "#f2c14e" });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const r = i % 2 ? 0.66 : 0.8;
      k.along("gold", [Math.cos(a) * 0.46, sunY + Math.sin(a) * 0.46, cz], [Math.cos(a) * r, sunY + Math.sin(a) * r, cz], 0, { geo: new THREE.ConeGeometry(0.07, 1, 4), color: "#f2c14e" });
    }
  });
  k.move({ kind: MOVE.pulse, amp: 0.25, speed: 1.4 }, () => {
    k.add("glow", new THREE.SphereGeometry(0.3, 16, 12), [0, sunY, cz], undefined, { color: "#ffe9a8", bright: 2.2 });
  });
  c.spark(SPARK.wisp, [0, CT + 6.6, cz], 9, { color: "#ffe29a", size: 0.2, speed: 0.06, reach: 2.4, rise: 0.6 });

  // The First King on his plinth before the doors, raising the Dawn Banner
  const kz = 2.45;
  k.add("matte", new THREE.BoxGeometry(0.8, 0.5, 0.8), [0, CT + 0.25, kz], undefined, { color: stone2, surf: ASHLAR });
  k.add("gold", new THREE.BoxGeometry(0.86, 0.05, 0.86), [0, CT + 0.5, kz], undefined, { color: gold });
  const ky = CT + 0.52;
  k.add("matte", new THREE.ConeGeometry(0.36, 1.05, 12), [0, ky + 0.52, kz], undefined, { color: royal });
  k.add("gold", new THREE.TorusGeometry(0.35, 0.025, 6, 20), [0, ky + 0.06, kz], [Math.PI / 2, 0, 0], { color: gold });
  k.add("matte", new THREE.CylinderGeometry(0.17, 0.22, 0.45, 10), [0, ky + 1.12, kz], undefined, { color: "#c7ccd6" });
  k.add("matte", new THREE.SphereGeometry(0.15, 12, 10), [0, ky + 1.47, kz], undefined, { color: "#e7e5e4" });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    k.add("gold", new THREE.ConeGeometry(0.03, 0.1, 4), [Math.cos(a) * 0.1, ky + 1.62, kz + Math.sin(a) * 0.1], undefined, { color: gold });
  }
  k.add("gold", new THREE.TorusGeometry(0.11, 0.02, 6, 14), [0, ky + 1.57, kz], [Math.PI / 2, 0, 0], { color: gold });
  k.along("matte", [-0.18, ky + 1.25, kz], [-0.3, ky + 0.8, kz + 0.12], 0.08, { color: royal });
  k.along("matte", [0.18, ky + 1.27, kz], [0.36, ky + 1.75, kz + 0.04], 0.08, { color: royal });
  flag(c, [0.38, ky + 0.2, kz + 0.05], 2.6, 0.75, 0.6, royal, { trim: gold, phase: 0.4 });
  k.move({ kind: MOVE.flutter, pivot: [0.38, ky + 2.72 - 0.3, kz + 0.05], axis: [0, 0, 1], amp: 0.06, speed: 2.6, phase: 0.4 }, () => {
    k.add("glow", new THREE.CircleGeometry(0.15, 16), [0.795, ky + 2.42, kz + 0.1], undefined, { color: "#ffd56b", bright: 1.5 });
  });

  // Royal banners on the terrace corners, fountains by the steps, hedges and topiary along the sides, lanterns
  [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75].forEach((a, i) => {
    const [x, z] = dirXZ(a + Math.PI / 8, 3.62);
    flag(c, [x, CT, z], 2.6, 0.7, 0.55, i % 2 ? gold : royal, { trim: i % 2 ? royal : gold, phase: i * 1.7 });
  });
  for (const s of [-1, 1]) {
    const fx = s * 2.45;
    const fz = 2.1;
    k.add("matte", new THREE.CylinderGeometry(0.6, 0.64, 0.26, 18, 1, true), [fx, CT + 0.13, fz], undefined, { color: stone2, surf: ashlarRound(0.6) });
    k.add("matte", new THREE.TorusGeometry(0.6, 0.06, 6, 24), [fx, CT + 0.27, fz], [Math.PI / 2, 0, 0], { color: stone });
    k.add("gloss", new THREE.CircleGeometry(0.58, 20), [fx, CT + 0.2, fz], [-Math.PI / 2, 0, 0], { color: "#4aa3d8" });
    k.add("matte", new THREE.CylinderGeometry(0.06, 0.09, 0.55, 8), [fx, CT + 0.45, fz], undefined, { color: stone });
    k.add("matte", new THREE.CylinderGeometry(0.22, 0.08, 0.1, 12), [fx, CT + 0.76, fz], undefined, { color: stone2 });
    k.add("gold", new THREE.SphereGeometry(0.05, 8, 6), [fx, CT + 0.84, fz], undefined, { color: gold });
    c.spark(SPARK.ember, [fx, CT + 0.86, fz], 8, { color: "#bfe6ff", size: 0.08, speed: 0.9, rise: 0.4, reach: 0.25 });
    // Hedges along the transept's flank, topiary at the back
    for (const z of [-2.65, -1.0, 0.55]) {
      k.move({ kind: MOVE.sway, pivot: [s * 2.85, CT, z], amp: 0.02, speed: 0.9, phase: z * 2 + s }, () => {
        k.add("leaf", new THREE.BoxGeometry(0.42, 0.42, 1.0, 2, 2, 3), [s * 2.85, CT + 0.21, z], undefined, { color: CATHEDRAL.hedge });
      });
    }
    for (const z of [-2.85, 1.45]) {
      k.move({ kind: MOVE.sway, pivot: [s * 3.45, CT, z], amp: 0.025, speed: 0.8, phase: z + s * 3 }, () => {
        k.add("leaf", new THREE.ConeGeometry(0.3, 1.0, 8, 2), [s * 3.45, CT + 0.6, z], undefined, { color: "#2a6b2d" });
      });
      k.add("matte", new THREE.CylinderGeometry(0.22, 0.25, 0.14, 10), [s * 3.45, CT + 0.07, z], undefined, { color: stone2 });
    }
    // Lanterns flanking the steps
    const lx = s * 1.35;
    const lz = 3.55;
    k.add("iron", new THREE.CylinderGeometry(0.035, 0.05, 1.2, 6), [lx, CT + 0.6, lz], undefined, { color: "#2b2a28" });
    k.add("gold", new THREE.BoxGeometry(0.2, 0.26, 0.2), [lx, CT + 1.33, lz], undefined, { color: gold });
    k.move({ kind: MOVE.pulse, amp: 0.15, speed: 2.3, phase: s }, () => k.add("glow", new THREE.BoxGeometry(0.15, 0.2, 0.15), [lx, CT + 1.33, lz], undefined, { color: "#ffd98a", bright: 1.6 }));
    k.add("gold", new THREE.ConeGeometry(0.16, 0.14, 4), [lx, CT + 1.53, lz], [0, Math.PI / 4, 0], { color: gold });
  }
  // Gardens on the hill below the terrace: hedges round its foot, rose beds
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.45) continue;
    const [x, z] = dirXZ(a, 4.42);
    leafClump(c, [x, 0.42, z], 0.36, i % 3 ? CATHEDRAL.hedge : "#3d8d3a", i, 0.02);
    if (i % 2) k.add("glow", new THREE.OctahedronGeometry(0.06), [x, 0.66, z], undefined, { color: i % 4 === 1 ? "#ff8fb0" : "#fff1b8", bright: 0.9 });
  }
}

/* ================================================================== */
/* Sylvandale: the Heart-Oak                                           */
/* ================================================================== */

const OAK = { bark: "#5b3b22", bark2: "#6b4a2c", moss: "#2f5d32", heart: "#7dff9a", silver: "#d9dee8" };

function heartOak(c: HeroCtx) {
  const { k, rng } = c;
  // The mossy floor
  k.add("leaf", new THREE.CylinderGeometry(4.75, 4.85, 0.1, 40), [0, 0.05, 0], undefined, { color: OAK.moss });

  // The trunk, twisting as it rises, buttressed at the foot
  const spine: V3[] = [
    [0, -0.1, 0],
    [0.05, 1.3, -0.05],
    [-0.05, 2.7, 0.06],
    [0.12, 4.0, 0.0],
    [0.02, 5.3, -0.12],
    [-0.1, 6.5, 0.0]
  ];
  const radii = [1.75, 1.42, 1.2, 1.05, 0.9, 0.72];
  for (let i = 0; i < spine.length - 1; i++) {
    const a = spine[i];
    const b = spine[i + 1];
    const ext: V3 = [b[0], b[1] + 0.2, b[2]];
    const g = craggy(new THREE.CylinderGeometry(radii[i + 1], radii[i], 1, 18, 3, true), 0.035, 3 + i);
    k.along("matte", a, ext, 0, { geo: g, color: i % 2 ? OAK.bark2 : OAK.bark, surf: bark(radii[i]) });
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.5) continue;
    const [x, z] = dirXZ(a, 1.45);
    k.at([x, 0, z], facing(a), () => {
      k.add("matte", new THREE.CylinderGeometry(0.06, 0.32, 2.3, 6, 2), [0, 1.0, 0], [0.32, 0, 0], { color: OAK.bark, surf: bark(0.3), scale: [0.5, 1, 1.3] });
    });
  }

  // Roots arching over the floor before they dive into it
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.15;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3) continue;
    const r1 = 2.4 + rng() * 0.4;
    const r2 = 3.5 + rng() * 0.7;
    const at = (r: number, y: number, da = 0): V3 => [Math.cos(a + da) * r, y, Math.sin(a + da) * r];
    chain(c, "matte", [at(1.25, 1.25), at(r1, 0.62, 0.05), at(r2, -0.05, 0.12)], 0.42, 0.14, { color: OAK.bark, surf: bark(0.35), seg: 9 });
    if (i % 2) chain(c, "matte", [at(r1, 0.55, 0.05), at(r1 + 0.8, 0.0, -0.32)], 0.18, 0.07, { color: OAK.bark2, surf: bark(0.15), seg: 7 });
  }

  // The hollow heart: a glowing doorway in the trunk, its bark lips curling round, green fire inside
  const hz = 1.8;
  k.add("matte", lancetFrameGeo(0.9, 1.65, 0.2, 0.36, 3), [0, 0.42, hz - 0.12], undefined, { color: OAK.bark2, surf: bark(0.4) });
  k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.3 }, () => {
    k.add("glow", lancetGeo(0.9, 1.65, 0.04, 3), [0, 0.42, hz - 0.05], undefined, { color: "#3dd67a", bright: 1.6 });
  });
  k.add("glow", lancetGeo(0.5, 1.0, 0.04, 3), [0, 0.5, hz], undefined, { color: "#d9ffe4", bright: 1.8 });
  c.spark(SPARK.flame, [0, 0.55, hz + 0.08], 12, { color: "#b6ffc8", size: 0.28, speed: 1.0, rise: 1.1, spread: 0.5 });

  // Boughs splitting into branches, a leader up the middle
  const boughs: Array<{ end: V3; fork: V3 }> = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5 + (rng() - 0.5) * 0.3;
    const y = 5.0 + (i % 3) * 0.55;
    const at = (r: number, h: number, da = 0): V3 => [Math.cos(a + da) * r, h, Math.sin(a + da) * r];
    const mid = at(2.1, y + 1.35);
    const end = at(3.6, y + 2.2, 0.12);
    const fork = at(3.0, y + 3.0, -0.45);
    chain(c, "matte", [at(0.35, y), mid, end], 0.42, 0.13, { color: OAK.bark, surf: bark(0.3), seg: 9 });
    chain(c, "matte", [mid, fork], 0.22, 0.09, { color: OAK.bark2, surf: bark(0.2), seg: 7 });
    boughs.push({ end, fork });
  }
  chain(c, "matte", [[-0.1, 6.4, 0], [0.15, 7.6, 0.1], [0.0, 8.7, -0.1]], 0.55, 0.16, { color: OAK.bark, surf: bark(0.4), seg: 10 });

  // The crown: clumps of leaves over every branch end and across the dome, swaying
  const greens = ["#2f7d3a", "#3f9a3a", "#1f6b2a", "#4caf50", "#2b8a3e", "#6bbf3f"];
  let seed = 0;
  for (const b of boughs) {
    leafClump(c, [b.end[0], b.end[1] + 0.3, b.end[2]], 1.35, greens[seed % greens.length], seed++);
    leafClump(c, [b.fork[0], b.fork[1] + 0.3, b.fork[2]], 1.2, greens[(seed + 2) % greens.length], seed++);
  }
  for (let i = 0; i < 22; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * 3.9;
    const y = 7.3 + (1 - (r / 4.2) ** 2) * 2.8 + rng() * 0.5;
    leafClump(c, [Math.cos(a) * r, y, Math.sin(a) * r], 1.1 + rng() * 0.75, greens[Math.floor(rng() * greens.length)], seed++);
  }
  // Blossom and golden leaves catching the light in the crown
  for (let i = 0; i < 14; i++) {
    const a = rng() * TAU;
    const r = 1.5 + rng() * 2.6;
    const y = 7.6 + (1 - (r / 4.2) ** 2) * 2.6 + 0.5;
    const p: V3 = [Math.cos(a) * r, y, Math.sin(a) * r];
    k.move({ kind: MOVE.sway, pivot: [p[0], p[1] - 2.4, p[2]], amp: 0.035, speed: 0.9, phase: i * 2.1 }, () => {
      k.add("glow", new THREE.OctahedronGeometry(0.11), p, [rng(), rng(), 0], { color: i % 3 ? "#fff3c4" : "#c9ffd0", bright: 1.1 });
    });
  }

  // Silver lanterns hanging from the boughs, swaying
  boughs.slice(0, 4).forEach((b, i) => {
    const t = 0.55;
    const top: V3 = [b.end[0] * t, b.end[1] * 0.9 + 0.2, b.end[2] * t];
    const bottom: V3 = [top[0], top[1] - 1.1, top[2]];
    k.move({ kind: MOVE.sway, pivot: top, amp: -0.08, speed: 1.1, phase: i * 1.9 }, () => {
      k.along("gold", top, [bottom[0], bottom[1] + 0.22, bottom[2]], 0.025, { color: OAK.silver });
      k.add("gold", new THREE.ConeGeometry(0.16, 0.14, 6), [bottom[0], bottom[1] + 0.2, bottom[2]], undefined, { color: OAK.silver });
      k.add("glow", new THREE.SphereGeometry(0.13, 12, 8), [bottom[0], bottom[1], bottom[2]], undefined, { color: "#b9ffcf", bright: 1.6, scale: [1, 1.3, 1] });
      k.add("gold", new THREE.TorusGeometry(0.14, 0.015, 6, 14), bottom, [Math.PI / 2, 0, 0], { color: OAK.silver });
    });
  });

  // The elven wardens' standing stones: moss on their heads, a silver band, runes lit toward the tree
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    const [x, z] = dirXZ(a, 3.95);
    k.at([x, 0, z], facing(a) + Math.PI, () => {
      const h = 1.9 + (i % 2) * 0.35;
      k.add("rock", craggy(new THREE.CylinderGeometry(0.28, 0.36, h, 5, 2), 0.04, 70 + i, h / 2), [0, h / 2, 0], undefined, { color: "#7b7f86", surf: STRATA });
      k.add("leaf", rubble(0.3, 80 + i), [0, h + 0.02, 0], undefined, { color: "#3f8a3a", scale: [1.1, 0.5, 1.1] });
      k.add("gold", new THREE.TorusGeometry(0.33, 0.035, 6, 18), [0, h * 0.62, 0], [Math.PI / 2, 0, 0], { color: OAK.silver });
      k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.2, phase: i * 1.3 }, () => {
        k.add("glow", new THREE.PlaneGeometry(0.22, h * 0.6), [0, h * 0.45, 0.42], [0.08, 0, 0], { color: "#8fffd0", surf: runeColumn(0.22, h * 0.6, 4), bright: 1.5 });
      });
    });
  }

  // Mushrooms in the roots (a few glowing), ferns on the floor
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + rng() * 0.4;
    const r = 2.0 + rng() * 2.2;
    const [x, z] = dirXZ(a, r);
    const glow = i % 3 === 0;
    for (let m = 0; m < 3; m++) {
      const mx = x + (rng() - 0.5) * 0.3;
      const mz = z + (rng() - 0.5) * 0.3;
      const h = 0.12 + rng() * 0.16;
      k.add("matte", new THREE.CylinderGeometry(0.025, 0.035, h, 6), [mx, 0.1 + h / 2, mz], undefined, { color: "#efe6d2" });
      k.add(glow ? "glow" : "matte", new THREE.SphereGeometry(0.07 + rng() * 0.05, 8, 5, 0, TAU, 0, Math.PI / 2), [mx, 0.1 + h, mz], undefined, { color: glow ? "#5ef0ff" : i % 2 ? "#b4432f" : "#c9a36b", bright: glow ? 1.1 : 1, scale: [1, 0.7, 1] });
    }
    if (i % 2 === 0) {
      const fx = x + 0.4;
      k.move({ kind: MOVE.sway, pivot: [fx, 0.1, z], amp: 0.06, speed: 1.3, phase: i }, () => {
        for (let f = 0; f < 5; f++) {
          const fa = (f / 5) * TAU;
          k.along("leaf", [fx, 0.1, z], [fx + Math.cos(fa) * 0.35, 0.42, z + Math.sin(fa) * 0.35], [0.12, 0.03], { color: "#4f9a3f" });
        }
      });
    }
  }

  // Wisps circling the crown and the roots, fireflies over the floor
  c.spark(SPARK.wisp, [0, 6.6, 0], 10, { color: "#c8ffd8", size: 0.24, speed: 0.04, reach: 4.4, rise: 0.8 });
  c.spark(SPARK.wisp, [0, 1.4, 0], 6, { color: "#fff6c2", size: 0.18, speed: 0.07, reach: 2.9, rise: 0.4 });
  c.spark(SPARK.mote, [0, 1.0, 0], 26, { color: "#f5ff9a", size: 0.07, speed: 1, reach: 3.6, rise: 0.6, spread: 7.5 });
}

/* ================================================================== */
/* Ironforge: the Anvil of the Gods                                    */
/* ================================================================== */

const FORGE = { rock: "#3a3946", rock2: "#4b4a57", floor: "#3b3a44", iron: "#2e2e35", steel: "#c4c8d0", brass: "#c99a3c", gold: "#e3ad3a", lava: "#ff6a12" };
/** Top of the forge floor the anvil stands on */
const FF = 1.84;

/** A stout dwarf statue (stone) holding a hammer before it, facing +z of the frame turned `rotY` */
function dwarfStatue(c: HeroCtx, at: V3, rotY: number) {
  const { k } = c;
  const stone = "#8c8a92";
  k.at(at, rotY, () => {
    k.add("matte", new THREE.BoxGeometry(0.7, 0.4, 0.7), [0, 0.2, 0], undefined, { color: "#55545e", surf: ASHLAR });
    k.add("gold", new THREE.BoxGeometry(0.74, 0.05, 0.74), [0, 0.4, 0], undefined, { color: FORGE.gold });
    for (const s of [-1, 1]) k.add("matte", new THREE.BoxGeometry(0.17, 0.36, 0.2), [s * 0.12, 0.6, 0], undefined, { color: stone });
    k.add("matte", new THREE.CylinderGeometry(0.24, 0.27, 0.5, 10), [0, 1.0, 0], undefined, { color: stone });
    k.add("matte", new THREE.SphereGeometry(0.15, 10, 8), [0, 1.38, 0], undefined, { color: stone });
    k.add("matte", new THREE.ConeGeometry(0.15, 0.48, 8), [0, 1.08, 0.12], [Math.PI, 0, 0], { color: "#a3a1a9" });
    k.add("iron", new THREE.SphereGeometry(0.17, 10, 6, 0, TAU, 0, Math.PI / 2), [0, 1.42, 0], undefined, { color: "#6d6c74" });
    for (const s of [-1, 1]) k.along("matte", [s * 0.22, 1.22, 0], [s * 0.1, 0.92, 0.22], 0.09, { color: stone });
    k.along("matte", [0, 0.42, 0.28], [0, 1.0, 0.28], 0.05, { color: "#6d6c74" });
    k.add("matte", new THREE.BoxGeometry(0.3, 0.2, 0.18), [0, 0.42, 0.28], undefined, { color: "#6d6c74" });
  });
}

function anvilOfGods(c: HeroCtx) {
  const { k } = c;
  // The plateau in two craggy tiers, molten veins through its strata, the dressed forge floor on top, steps up the front
  k.add("rock", craggy(new THREE.CylinderGeometry(4.3, 4.85, 1.0, 18, 3), 0.14, 11, 0.5), [0, 0.5, 0], undefined, { color: FORGE.rock, surf: veins(0.75) });
  k.add("rock", craggy(new THREE.CylinderGeometry(3.3, 3.8, 0.72, 16, 2), 0.1, 12, 0.36), [0, 1.0 + 0.36, 0], undefined, { color: FORGE.rock2, surf: veins(0.55) });
  k.add("matte", new THREE.CylinderGeometry(3.05, 3.1, 0.14, 8), [0, FF - 0.07, 0], [0, Math.PI / 8, 0], { color: FORGE.floor, surf: ashlarRound(3.05) });
  k.add("gold", new THREE.CylinderGeometry(3.08, 3.08, 0.04, 8, 1, true), [0, FF - 0.03, 0], [0, Math.PI / 8, 0], { color: FORGE.brass });
  for (let j = 0; j < 3; j++) k.add("matte", new THREE.BoxGeometry(1.4, 0.24 * (j + 1), 0.4), [0, 1.0 + 0.12 * (j + 1), 3.9 - j * 0.38], undefined, { color: FORGE.floor, surf: ASHLAR });

  // The anvil: feet, waist, the body with its heel and horn, a steel face, gold runes down its flanks, a white-hot bar
  const iron = FORGE.iron;
  k.add("iron", new THREE.BoxGeometry(2.6, 0.5, 1.7), [0, FF + 0.25, 0], undefined, { color: iron });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add("iron", new THREE.CylinderGeometry(0.22, 0.4, 0.5, 4), [sx * 1.08, FF + 0.25, sz * 0.62], [0, Math.PI / 4, 0], { color: "#26262c" });
  k.add("iron", new THREE.CylinderGeometry(0.62, 0.86, 1.05, 4), [0, FF + 1.02, 0], [0, Math.PI / 4, 0], { color: iron, scale: [1.2, 1, 0.82] });
  k.add("iron", new THREE.BoxGeometry(3.0, 0.72, 1.32), [-0.2, FF + 1.9, 0], undefined, { color: "#34343c" });
  k.add("iron", new THREE.BoxGeometry(0.6, 0.52, 1.1), [-1.95, FF + 1.8, 0], undefined, { color: "#34343c" });
  k.add("iron", new THREE.ConeGeometry(0.62, 1.9, 18), [2.25, FF + 1.95, 0], [0, 0, -Math.PI / 2], { color: "#34343c", scale: [1, 1, 0.82] });
  k.add("gold", new THREE.BoxGeometry(3.0, 0.07, 1.24), [-0.2, FF + 2.29, 0], undefined, { color: FORGE.steel });
  k.add("matte", new THREE.BoxGeometry(0.16, 0.1, 0.16), [-1.3, FF + 2.33, 0.2], undefined, { color: "#0b0b0d" });
  for (const s of [-1, 1]) {
    k.move({ kind: MOVE.pulse, amp: 0.25, speed: 1.6, phase: s }, () => {
      k.add("glow", new THREE.PlaneGeometry(2.4, 0.34), [-0.2, FF + 1.9, s * 0.72], [0, s > 0 ? 0 : Math.PI, 0], { color: "#ffb84a", surf: runeBand(2.4, 0.34, 8), bright: 1.5 });
    });
  }
  k.move({ kind: MOVE.pulse, amp: 0.2, speed: 2.6 }, () => {
    k.add("glow", new THREE.BoxGeometry(1.5, 0.12, 0.26), [-0.1, FF + 2.39, 0], undefined, { color: "#ffe2a0", bright: 2.2 });
    k.along("glow", [0.6, FF + 2.37, -0.3], [1.9, FF + 2.37, 0.12], [0.16, 0.05], { color: "#ff9a3a", bright: 1.8 });
  });
  c.spark(SPARK.ember, [0, FF + 2.45, 0], 26, { color: "#ffcf6b", size: 0.1, speed: 0.55, rise: 3.6, reach: 1.1, spread: 1.2 });

  // The god's hammer, circling over the anvil and dipping as it goes
  k.move({ kind: MOVE.spin, pivot: [0, 0, 0], axis: UP, speed: 0.38, amp: 0.3 }, () => {
    k.frame([1.6, 6.3, 0], [0, 0, 0.45], 1, () => {
      k.add("iron", new THREE.BoxGeometry(1.0, 0.95, 1.95), [0, 1.25, 0], undefined, { color: "#55555f" });
      for (const z of [-0.6, 0.6]) k.add("gold", new THREE.BoxGeometry(1.12, 1.07, 0.12), [0, 1.25, z], undefined, { color: FORGE.gold });
      for (const z of [-1.0, 1.0]) k.add("gold", new THREE.BoxGeometry(0.9, 0.85, 0.06), [0, 1.25, z], undefined, { color: FORGE.steel });
      for (const s of [-1, 1]) k.add("glow", new THREE.PlaneGeometry(0.9, 0.5), [s * 0.57, 1.25, 0], [0, (s * Math.PI) / 2, 0], { color: "#ffc35a", surf: runeBand(0.9, 0.5, 3), bright: 1.6 });
      k.add("matte", new THREE.CylinderGeometry(0.13, 0.14, 2.9, 10), [0, -0.5, 0], undefined, { color: "#6b3f1d", surf: grainRound(0.13) });
      for (let i = 0; i < 5; i++) k.add("matte", new THREE.TorusGeometry(0.15, 0.03, 6, 12), [0, -1.5 + i * 0.14, 0], [Math.PI / 2, 0.2, 0], { color: "#3b2414" });
      k.add("gold", new THREE.CylinderGeometry(0.18, 0.16, 0.2, 10), [0, 0.68, 0], undefined, { color: FORGE.gold });
      k.add("gold", new THREE.OctahedronGeometry(0.2), [0, -2.0, 0], undefined, { color: FORGE.gold });
    });
  });

  // Rivers of forge-fire in stone channels running off the floor, down the tiers and over the edge in falls
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const at = (r: number, y: number, side = 0): V3 => {
      const [x, z] = dirXZ(a, r);
      const [px, pz] = dirXZ(a + Math.PI / 2, side);
      return [x + px, y, z + pz];
    };
    for (const s of [-0.24, 0.24]) {
      k.along("matte", at(2.85, FF - 0.02, s), at(3.82, 1.06, s), [0.12, 0.2], { color: FORGE.floor });
      k.along("matte", at(3.82, 1.06, s), at(4.3, 1.04, s), [0.12, 0.2], { color: FORGE.floor });
    }
    k.move({ kind: MOVE.pulse, amp: 0.25, speed: 1.8, phase: i * 1.6 }, () => {
      k.along("glow", at(2.85, FF - 0.06, 0), at(3.82, 1.0, 0), [0.34, 0.08], { color: FORGE.lava, bright: 1.7 });
      k.along("glow", at(3.82, 1.0, 0), at(4.32, 0.99, 0), [0.34, 0.08], { color: FORGE.lava, bright: 1.7 });
      k.along("glow", at(4.32, 0.99, 0), at(4.82, 0.02, 0), [0.3, 0.07], { color: "#ff8a24", bright: 1.9 });
      k.add("glow", new THREE.SphereGeometry(0.42, 12, 6, 0, TAU, 0, Math.PI / 2), at(4.86, 0, 0), undefined, { color: "#ff7a1a", bright: 1.6, scale: [1, 0.25, 1] });
    });
    c.spark(SPARK.ember, at(4.86, 0.1, 0), 7, { color: "#ffab4a", size: 0.09, speed: 0.6, rise: 1.6, reach: 0.5 });
    c.spark(SPARK.smoke, at(4.8, 0.3, 0), 3, { color: "#4a4747", size: 0.55, speed: 0.12, rise: 2.2, reach: 0.4 });
  }

  // Brass braziers on the floor between the rivers
  for (let i = 0; i < 4; i++) {
    const [x, z] = dirXZ((i / 4) * TAU + Math.PI / 8, 2.45);
    brazier(c, [x, FF, z], 1.1, FORGE.brass, "#ff8a2a");
  }

  // Rune pillars of the clans round the tier, gold caps, runes lit toward the anvil
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const [x, z] = dirXZ(a, 3.98);
    k.at([x, 1.0, z], facing(a) + Math.PI, () => {
      k.add("matte", new THREE.CylinderGeometry(0.26, 0.34, 2.1, 4), [0, 1.05, 0], [0, Math.PI / 4, 0], { color: "#2f2e36", surf: ASHLAR });
      k.add("gold", new THREE.ConeGeometry(0.3, 0.36, 4), [0, 2.28, 0], [0, Math.PI / 4, 0], { color: FORGE.gold });
      k.add("gold", new THREE.CylinderGeometry(0.32, 0.32, 0.08, 4), [0, 1.5, 0], [0, Math.PI / 4, 0], { color: FORGE.brass });
      k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.4, phase: i * 1.1 }, () => {
        k.add("glow", new THREE.PlaneGeometry(0.22, 1.2), [0, 0.85, 0.28], [-0.04, 0, 0], { color: "#ffb347", surf: runeColumn(0.22, 1.2, 4), bright: 1.5 });
      });
    });
  }

  // Guardians by the steps, gold ingots stacked by the anvil, a quench trough steaming
  for (const s of [-1, 1]) dwarfStatue(c, [s * 1.35, FF, 2.35], s * -0.2);
  for (let l = 0; l < 3; l++) for (let j = 0; j < 3 - l; j++) k.add("gold", new THREE.BoxGeometry(0.34, 0.12, 0.16), [-0.75 + j * 0.2 + l * 0.1, FF + 0.06 + l * 0.12, -1.55], [0, 0.3, 0], { color: "#f0c040" });
  k.add("matte", new THREE.BoxGeometry(1.0, 0.36, 0.5), [1.85, FF + 0.18, -1.05], [0, -0.3, 0], { color: "#55545e", surf: ASHLAR });
  k.add("gloss", new THREE.BoxGeometry(0.86, 0.04, 0.36), [1.85, FF + 0.33, -1.05], [0, -0.3, 0], { color: "#3a6e8c" });
  c.spark(SPARK.smoke, [1.85, FF + 0.4, -1.05], 4, { color: "#d8dde4", size: 0.4, speed: 0.2, rise: 1.4, reach: 0.25 });
}

/* ================================================================== */
/* Drak'mar: the Bloodfire Throne                                      */
/* ================================================================== */

const THRONE = { mesa: "#7c2d12", mesa2: "#9a3412", bone: "#e8dcc0", bone2: "#d4c39e", dark: "#1a0f0a", iron: "#3b3b42", wood: "#6b4426", blood: "#9f1d1d" };
/** Top of the mesa's upper tier */
const TM = 1.5;

/** A small skull: cranium, sockets, jaw (bone), facing +z of the frame turned `rotY` */
function skull(c: HeroCtx, at: V3, s: number, rotY = 0) {
  const { k } = c;
  k.at(at, rotY, () => {
    k.add("matte", new THREE.SphereGeometry(0.2 * s, 8, 6), [0, 0, 0], undefined, { color: THRONE.bone, scale: [1, 1.05, 1.1] });
    k.add("matte", new THREE.BoxGeometry(0.26 * s, 0.1 * s, 0.18 * s), [0, -0.17 * s, 0.07 * s], undefined, { color: THRONE.bone2 });
    for (const sx of [-1, 1]) k.add("matte", new THREE.SphereGeometry(0.055 * s, 6, 5), [sx * 0.075 * s, 0.0, 0.185 * s], undefined, { color: THRONE.dark });
  });
}

function bloodfireThrone(c: HeroCtx) {
  const { k, rng } = c;
  const { bone, bone2, dark, iron } = THRONE;
  // The red mesa in two tiers of strata, fire in its cracks, steps cut up the front
  k.add("rock", craggy(new THREE.CylinderGeometry(4.2, 4.85, 1.0, 18, 3), 0.16, 21, 0.5), [0, 0.5, 0], undefined, { color: THRONE.mesa, surf: veins(0.9) });
  k.add("rock", craggy(new THREE.CylinderGeometry(3.1, 3.55, 0.5, 16, 2), 0.1, 22, 0.25), [0, 1.25, 0], undefined, { color: THRONE.mesa2, surf: veins(0.6) });
  for (let j = 0; j < 3; j++) k.add("rock", new THREE.BoxGeometry(1.3, 0.17 * (j + 1), 0.36), [0, 1.0 + 0.085 * (j + 1), 3.75 - j * 0.33], undefined, { color: THRONE.mesa2, surf: STRATA });
  for (let i = 0; i < 7; i++) {
    let a = (i / 7) * TAU + 0.4;
    let r = 2.0;
    const pts: V3[] = [];
    for (let s = 0; s < 4; s++) {
      pts.push([Math.cos(a) * r, TM + 0.02, Math.sin(a) * r]);
      a += (rng() - 0.5) * 0.35;
      r += 0.3 + rng() * 0.12;
    }
    k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.5, phase: i * 0.9 }, () => {
      for (let s = 0; s < pts.length - 1; s++) k.along("glow", pts[s], pts[s + 1], [0.1, 0.06], { color: "#ff5a1a", bright: 1.7 });
    });
    c.spark(SPARK.ember, pts[2], 4, { color: "#ff7a2a", size: 0.08, speed: 0.5, rise: 1.8, reach: 0.4 });
  }

  // The iron dais, spiked round its edge
  k.add("iron", new THREE.CylinderGeometry(1.7, 1.78, 0.26, 8), [0, TM + 0.13, -0.3], [0, Math.PI / 8, 0], { color: iron });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    if (Math.sin(a) > 0.8) continue;
    const [x, z] = dirXZ(a, 1.66);
    k.add("iron", new THREE.ConeGeometry(0.07, 0.3, 4), [x, TM + 0.38, z - 0.3], undefined, { color: "#55555e" });
  }
  const D = TM + 0.26;

  // The throne: an iron seat, the titan's skull for its back, tusks for armrests, horns sweeping up behind
  k.add("iron", new THREE.BoxGeometry(2.1, 0.7, 1.45), [0, D + 0.35, -0.25], undefined, { color: "#2c2c33" });
  k.add("gold", new THREE.BoxGeometry(2.14, 0.06, 1.49), [0, D + 0.68, -0.25], undefined, { color: "#a8743a" });
  const sz = -1.05;
  k.add("matte", new THREE.SphereGeometry(1, 20, 14), [0, D + 2.35, sz], undefined, { color: bone, scale: [1.55, 1.7, 1.2] });
  k.add("matte", new THREE.CapsuleGeometry(0.2, 2.0, 4, 10), [0, D + 2.55, sz + 1.12], [0, 0, Math.PI / 2], { color: bone2 });
  for (const sx of [-1, 1]) {
    k.add("matte", new THREE.SphereGeometry(0.4, 14, 10), [sx * 0.56, D + 2.15, sz + 1.02], undefined, { color: dark, scale: [1.1, 0.95, 0.5] });
    k.move({ kind: MOVE.pulse, amp: 0.35, speed: 2.1, phase: sx }, () => {
      k.add("glow", new THREE.SphereGeometry(0.17, 10, 8), [sx * 0.56, D + 2.13, sz + 1.12], undefined, { color: "#ff3b1a", bright: 2.2 });
    });
    c.spark(SPARK.flame, [sx * 0.56, D + 2.2, sz + 1.18], 6, { color: "#ffb36b", size: 0.2, speed: 1.3, rise: 0.55, spread: 0.18 });
    k.add("matte", new THREE.BoxGeometry(0.5, 0.36, 0.6), [sx * 0.98, D + 1.72, sz + 0.75], [0, sx * 0.4, sx * 0.2], { color: bone2 });
    // Horns: four segments sweeping out, up and back, iron bands round them
    chain(
      c,
      "matte",
      [
        [sx * 1.25, D + 3.1, sz - 0.1],
        [sx * 1.95, D + 3.6, sz - 0.25],
        [sx * 2.25, D + 4.4, sz - 0.5],
        [sx * 2.05, D + 5.2, sz - 0.85],
        [sx * 1.7, D + 5.65, sz - 1.05]
      ],
      0.34,
      0.08,
      { color: bone2, seg: 10 }
    );
    band(c, [sx * 1.6, D + 3.35, sz - 0.18], [sx * 0.7, 0.5, -0.15], 0.3, iron);
    band(c, [sx * 2.12, D + 4.0, sz - 0.38], [sx * 0.3, 0.8, -0.25], 0.26, iron);
    // Tusk armrests curving forward and up
    chain(
      c,
      "matte",
      [
        [sx * 1.12, D + 0.72, -0.7],
        [sx * 1.32, D + 0.92, 0.2],
        [sx * 1.28, D + 1.25, 0.95],
        [sx * 1.08, D + 1.75, 1.3]
      ],
      0.2,
      0.05,
      { color: bone, seg: 10 }
    );
    band(c, [sx * 1.32, D + 0.93, 0.25], [sx * 0.2, 0.2, 0.9], 0.2, iron);
  }
  k.add("matte", new THREE.ConeGeometry(0.2, 0.42, 3), [0, D + 1.72, sz + 1.12], [Math.PI, 0, 0], { color: dark });
  k.add("matte", new THREE.BoxGeometry(1.5, 0.32, 0.62), [0, D + 1.32, sz + 0.82], undefined, { color: bone2 });
  for (let i = 0; i < 7; i++) k.add("matte", new THREE.ConeGeometry(0.075, 0.3, 5), [-0.6 + i * 0.2, D + 1.05, sz + 1.1], [Math.PI, 0, 0], { color: bone });

  // The first Warchief's bones on the seat: horned helm, iron cuirass and spiked pauldrons, the war-axe raised
  const S = D + 0.7;
  k.add("matte", new THREE.BoxGeometry(0.62, 0.22, 0.36), [0, S + 0.12, -0.35], undefined, { color: bone2 });
  for (const sx of [-1, 1]) {
    limb(c, "matte", [sx * 0.2, S + 0.14, -0.25], [sx * 0.26, S + 0.18, 0.55], 0.085, 0.07, { color: bone });
    k.add("matte", new THREE.SphereGeometry(0.1, 8, 6), [sx * 0.26, S + 0.18, 0.55], undefined, { color: bone2 });
    limb(c, "matte", [sx * 0.26, S + 0.18, 0.55], [sx * 0.3, D + 0.06, 0.72], 0.07, 0.055, { color: bone });
    k.add("matte", new THREE.BoxGeometry(0.16, 0.08, 0.3), [sx * 0.3, D + 0.04, 0.82], undefined, { color: bone2 });
  }
  limb(c, "matte", [0, S + 0.2, -0.42], [0, S + 1.05, -0.45], 0.07, 0.06, { color: bone2 });
  k.add("iron", new THREE.SphereGeometry(0.4, 14, 10, 0, TAU, 0, Math.PI * 0.6), [0, S + 0.58, -0.32], [-Math.PI / 2, 0, 0], { color: "#4a4a52", scale: [1, 1.2, 0.9] });
  for (const sx of [-1, 1]) {
    k.add("iron", new THREE.SphereGeometry(0.2, 10, 6, 0, TAU, 0, Math.PI / 2), [sx * 0.38, S + 1.0, -0.38], [0, 0, -sx * 0.4], { color: "#4a4a52" });
    for (let p = 0; p < 3; p++) k.add("iron", new THREE.ConeGeometry(0.04, 0.2, 4), [sx * (0.38 + p * 0.06), S + 1.15, -0.45 + p * 0.07], [0, 0, -sx * 0.5], { color: "#71717a" });
  }
  skull(c, [0, S + 1.32, -0.38], 1.3);
  k.add("iron", new THREE.SphereGeometry(0.27, 12, 8, 0, TAU, 0, Math.PI / 2), [0, S + 1.38, -0.4], undefined, { color: "#3f3f46" });
  for (const sx of [-1, 1]) chain(c, "matte", [[sx * 0.22, S + 1.5, -0.4], [sx * 0.45, S + 1.75, -0.42], [sx * 0.42, S + 2.05, -0.5]], 0.06, 0.02, { color: bone2, seg: 7 });
  k.move({ kind: MOVE.pulse, amp: 0.4, speed: 2.4 }, () => {
    for (const sx of [-1, 1]) k.add("glow", new THREE.SphereGeometry(0.035, 6, 5), [sx * 0.1, S + 1.33, -0.05], undefined, { color: "#ff3b1a", bright: 2 });
  });
  // The resting arm on the tusk, the raised arm gripping the axe
  limb(c, "matte", [-0.42, S + 0.95, -0.38], [-0.62, S + 0.5, -0.1], 0.06, 0.05, { color: bone });
  limb(c, "matte", [-0.62, S + 0.5, -0.1], [-0.95, S + 0.38, 0.35], 0.05, 0.045, { color: bone });
  limb(c, "matte", [0.42, S + 0.95, -0.38], [0.75, S + 1.3, -0.25], 0.06, 0.05, { color: bone });
  limb(c, "matte", [0.75, S + 1.3, -0.25], [0.8, S + 1.95, -0.18], 0.05, 0.045, { color: bone });
  k.add("matte", new THREE.SphereGeometry(0.08, 8, 6), [0.8, S + 2.0, -0.18], undefined, { color: bone2 });
  k.along("matte", [0.8, S + 0.9, -0.17], [0.82, S + 3.4, -0.2], 0, { geo: new THREE.CylinderGeometry(0.06, 0.06, 1, 8), color: THRONE.wood, surf: grainRound(0.06) });
  const axe = new THREE.Shape();
  axe.moveTo(0, -0.3);
  axe.quadraticCurveTo(0.35, -0.35, 0.7, -0.65);
  axe.quadraticCurveTo(0.55, 0, 0.7, 0.65);
  axe.quadraticCurveTo(0.35, 0.35, 0, 0.3);
  axe.lineTo(0, -0.3);
  for (const s of [-1, 1]) {
    k.at([0.82, S + 3.05, -0.19], s > 0 ? 0 : Math.PI, () => {
      k.add("iron", new THREE.ExtrudeGeometry(axe, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 6 }), [0.04, 0, -0.03], undefined, { color: "#8a8f98" });
      k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.9, phase: s }, () => {
        k.add("glow", new THREE.PlaneGeometry(0.3, 0.3), [0.38, 0, 0.11], undefined, { color: "#ff2a1a", surf: runeBand(0.3, 0.3, 2), bright: 1.6 });
      });
    });
  }
  k.add("iron", new THREE.ConeGeometry(0.06, 0.32, 4), [0.82, S + 3.55, -0.2], undefined, { color: "#8a8f98" });

  // War drums before the throne: hide skins thrumming, iron rims, crossed sticks
  for (const sx of [-1, 1]) {
    const [x, z] = [sx * 2.05, 1.35];
    k.add("matte", new THREE.CylinderGeometry(0.45, 0.4, 0.85, 16, 1, true), [x, TM + 0.43, z], undefined, { color: "#7c4a24", surf: grainRound(0.45) });
    k.add("iron", new THREE.TorusGeometry(0.45, 0.04, 6, 20), [x, TM + 0.84, z], [Math.PI / 2, 0, 0], { color: iron });
    k.add("iron", new THREE.TorusGeometry(0.4, 0.04, 6, 20), [x, TM + 0.04, z], [Math.PI / 2, 0, 0], { color: iron });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      k.along("matte", [x + Math.cos(a) * 0.47, TM + 0.82, z + Math.sin(a) * 0.47], [x + Math.cos(a + 0.4) * 0.43, TM + 0.08, z + Math.sin(a + 0.4) * 0.43], 0.025, { color: "#c9b48a" });
    }
    k.move({ kind: MOVE.bob, amp: 0.012, speed: 9, phase: sx }, () => {
      k.add("matte", new THREE.CircleGeometry(0.44, 18), [x, TM + 0.865, z], [-Math.PI / 2, 0, 0], { color: "#e7d3b0" });
    });
    k.along("matte", [x - 0.3, TM + 0.92, z - 0.15], [x + 0.2, TM + 1.05, z + 0.3], 0.04, { color: THRONE.wood });
    k.add("matte", new THREE.SphereGeometry(0.06, 6, 5), [x + 0.2, TM + 1.05, z + 0.3], undefined, { color: bone });
  }

  // Bone totems ringing the mesa: stacked skulls, horns, fire bowls burning and smoking, war banners on every other
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const [x, z] = dirXZ(a, 3.85);
    k.add("matte", new THREE.CylinderGeometry(0.12, 0.16, 3.1, 8), [x, 1.0 + 1.55, z], undefined, { color: "#4a3322", surf: grainRound(0.14) });
    for (let s = 0; s < 3; s++) skull(c, [x, 2.15 + s * 0.52, z], 1.05 - s * 0.1, facing(a) + Math.PI);
    k.add("matte", new THREE.ConeGeometry(0.06, 0.45, 6), [x + 0.18, 3.35, z], [0, 0, -0.7], { color: bone2 });
    k.add("matte", new THREE.ConeGeometry(0.06, 0.45, 6), [x - 0.18, 3.35, z], [0, 0, 0.7], { color: bone2 });
    k.add("iron", new THREE.CylinderGeometry(0.34, 0.16, 0.24, 10, 1, true), [x, 4.15, z], undefined, { color: iron });
    k.move({ kind: MOVE.pulse, amp: 0.3, speed: 2.8, phase: i }, () => {
      k.add("glow", new THREE.SphereGeometry(0.28, 10, 5, 0, TAU, 0, Math.PI / 2), [x, 4.13, z], undefined, { color: "#ff6a1a", bright: 1.8, scale: [1, 0.4, 1] });
    });
    c.spark(SPARK.flame, [x, 4.22, z], 10, { color: "#ffc070", size: 0.3, speed: 1.4, rise: 0.75, spread: 0.3 });
    c.spark(SPARK.smoke, [x, 4.7, z], 5, { color: "#3f3a36", size: 0.75, speed: 0.15, rise: 2.8, reach: 0.6 });
    if (i % 2 === 0) {
      k.at([x, 0, z], facing(a) + Math.PI, () => {
        k.add("iron", new THREE.BoxGeometry(0.9, 0.06, 0.06), [0, 3.75, 0.2], undefined, { color: iron });
        hangingBanner(c, [0, 3.72, 0.22], 0.75, 1.4, THRONE.blood, { tattered: true, rod: "#5a5a62", phase: i });
        k.move({ kind: MOVE.flutter, pivot: [0, 3.72, 0.22], axis: [0, 0, 1], amp: 0.05, speed: 2.2, phase: i }, () => {
          k.add("cloth", new THREE.PlaneGeometry(0.75, 0.12, 4, 1), [0, 3.38, 0.29], undefined, { color: "#1a1414" });
        });
      });
    }
  }

  // A palisade of bone stakes round the mesa's edge, open at the steps; bones strewn on the ground
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3) continue;
    const [x, z] = dirXZ(a, 4.02);
    const h = 0.55 + hash3(i, 1, 2, 3) * 0.4;
    k.add("matte", new THREE.ConeGeometry(0.08, h, 5), [x, 1.0 + h / 2 - 0.08, z], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], { color: i % 3 ? bone : bone2 });
  }
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU;
    const r = 2.0 + rng() * 0.8;
    const [x, z] = dirXZ(a, r);
    if ((z > 1.8 && Math.abs(x) < 1) || Math.hypot(x, z + 0.3) < 1.9 || Math.hypot(Math.abs(x) - 2.05, z - 1.35) < 0.6) continue;
    k.along("matte", [x - 0.2, TM + 0.04, z], [x + 0.2, TM + 0.04, z + 0.1], 0.06, { color: bone2 });
    if (i % 2) skull(c, [x, TM + 0.12, z + 0.25], 0.8, a);
  }
}

/* ------------------------------ the registry ------------------------------ */

export const HERO_LANDMARK_BUILDERS: Record<string, (c: HeroCtx) => void> = {
  "lm-dawn-cathedral": dawnCathedral,
  "lm-heart-oak": heartOak,
  "lm-anvil-of-gods": anvilOfGods,
  "lm-bloodfire-throne": bloodfireThrone
};

