import * as THREE from "three";
import { MOVE, TAU, V3, rubble } from "./heroKit";
import { ASHLAR, SPARK, ashlarRound, chitinPlate, chitinRound, nemes, runeBand } from "./heroMaterials";
import { BossCtx, BossHeroDef, BonePose, IdleCtx, Pose } from "./heroRig";
import { blob, chainBones, chainLag, chainPose, chainSprings, hook, merge, orient, pathBones, plate, seg, spike, stud } from "./bossParts";

/* ------------------------------------------------------------------------- */
/* World bosses of the sands: the Sandworm, the Sphinx, the Scorpion         */
/* ------------------------------------------------------------------------- */

/*
 * As the sea bosses: each builder adds its boss round the kit's origin at its Normal rig's size, facing +z, every part
 * inside a bone; the rest of each def is its rest pose, layered idle and keyed roar and attack.
 */

// No beam over a world boss: embers and its own sparks only
const aura = (color: string, hot: string, radius: number): BossHeroDef["aura"] => ({
  embers: { inner: Math.max(0.4, radius - 1.2), outer: radius + 0.3, height: 6.5, count: 90 },
  color,
  hot
});

/** Desert ground round a sand boss: a low drift of rippled sand, mounds piled against it, sandstone rocks */
function sands(c: BossCtx, r: number, sand: string, sand2: string, rock: string, rocks: Array<[number, number, number]>) {
  c.k.add("sand", new THREE.CylinderGeometry(r * 0.96, r, 0.16, 40), [0, 0.08, 0], undefined, { color: sand });
  rocks.forEach(([x, z, s], i) => c.k.add("rock", rubble(s, 41 + i), [x, s * 0.4, z], [0, i * 1.7, 0], { color: rock }));
  const rng = c.rng;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rng() * 0.5;
    const d = r * (0.62 + rng() * 0.25);
    c.k.add("sand", new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2), [Math.sin(a) * d, 0.12, Math.cos(a) * d], [0, a, 0], { color: i % 2 ? sand : sand2, scale: [0.55 + rng() * 0.4, 0.18 + rng() * 0.12, 0.35 + rng() * 0.3] });
  }
}

/** Half-buried ribs of something long dead */
function ribs(c: BossCtx, at: V3, rotY: number, n: number, size: number, color: string) {
  c.k.at(at, rotY, () => {
    for (let i = 0; i < n; i++) c.k.add("matte", new THREE.TorusGeometry(size * (1 - i * 0.08), size * 0.07, 5, 10, Math.PI * 0.8), [0, 0, i * size * 0.32], [0, 0, Math.PI * 0.1], { color });
    seg(c, "matte", [0, -size * 0.05, -size * 0.1], [0, -size * 0.05, n * size * 0.32], size * 0.08, size * 0.06, { color, seg: 6 });
  });
}

/** A turn (as Euler angles) that points +z along `dir` */
function eulerTo(dir: V3): V3 {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}

/* ================================================================== */
/* The Great Sandworm Ouroboros                                        */
/* ================================================================== */

const SW = {
  hide: "#8a4b1c",
  hide2: "#a35d27",
  ring: "#3a1c08",
  plate: "#5a2e10",
  spine: "#d9c19a",
  teeth: "#fbf0d0",
  throat: "#ff7a1a",
  sand: "#d6a85c",
  sand2: "#c99843",
  rock: "#9a6b3a",
  bone: "#e6dcc8"
};
const SW_SEGS = 9;
const SW_PITCH = [-1.55, -1.52, -1.45, -1.32, -1.12, -0.85, -0.5, -0.15, 0.2];
const SW_RADII = [0.82, 0.8, 0.78, 0.75, 0.72, 0.7, 0.68, 0.66, 0.66, 0.7];

function sandwormMaw(c: BossCtx, tip: V3, dir: V3) {
  c.bone("maw", tip, () =>
    c.k.frame(tip, eulerTo(dir), 1, () => {
      // The head: a flared bulb, a ridged lip, a glowing throat
      c.k.add("skin", new THREE.CylinderGeometry(0.92, 0.7, 0.5, 18, 1, true), [0, 0, 0.22], [Math.PI / 2, 0, 0], { color: SW.hide });
      c.k.add("chitin", new THREE.TorusGeometry(0.86, 0.15, 8, 24), [0, 0, 0.46], undefined, { color: SW.ring, surf: chitinRound(0.2) });
      c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 2.4 }, () => c.k.add("glow", new THREE.CircleGeometry(0.55, 18), [0, 0, 0.1], undefined, { color: SW.throat, bright: 1.8 }));
      c.k.add("skin", new THREE.CylinderGeometry(0.62, 0.5, 0.35, 16, 1, true), [0, 0, 0.17], [Math.PI / 2, 0, 0], { color: "#3d1405" });
      // Rings of inward teeth, each ring turning its own way
      const ring = (name: string, n: number, rad: number, z: number, size: number, speed: number) =>
        c.bone(name, [0, 0, z], () =>
          c.k.move({ kind: MOVE.spin, axis: [0, 0, 1], pivot: [0, 0, z], speed }, () => {
            for (let i = 0; i < n; i++) {
              const a = (i / n) * TAU;
              const p: V3 = [Math.cos(a) * rad, Math.sin(a) * rad, z];
              spike(c, "matte", p, [-Math.cos(a), -Math.sin(a), -0.35], size * 0.32, size, { color: SW.teeth, seg: 5 });
            }
          })
        );
      ring("teethA", 14, 0.72, 0.4, 0.34, 0.28);
      ring("teethB", 10, 0.5, 0.28, 0.26, -0.45);
      // Four petals of the maw, hinged at the lip, toothed inside
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        c.k.frame([0, 0, 0], [0, 0, a - Math.PI / 2], 1, () =>
          c.bone(`petal${i}`, [0, 0.86, 0.48], () => {
            plate(c, "chitin", [0, 0.98, 0.84], [0, 1, -0.35], [0, 0.35, 1], 0.42, 0.07, 0.48, { color: SW.plate, surf: chitinPlate(0.12) });
            for (let t = 0; t < 4; t++) spike(c, "matte", [(t - 1.5) * 0.15, 0.9, 0.7 + (t % 2) * 0.18], [0, -1, 0.35], 0.04, 0.2, { color: SW.teeth, seg: 5 });
            spike(c, "matte", [0, 1.05, 1.28], [0, 0.25, 1], 0.07, 0.3, { color: SW.spine, seg: 5 });
          })
        );
      }
      // Two great tusks either side of the maw
      for (const s of [1, -1])
        c.bone(s > 0 ? "tuskR" : "tuskL", [s * 0.88, 0.1, 0.3], () => hook(c, "matte", [s * 0.88, 0.1, 0.3], [s * 0.45, -0.2, 1], [-s * 0.12, 0, 0], 0.11, 1.05, 5, { color: SW.spine }));
    })
  );
}

function sandworm(c: BossCtx) {
  sands(c, 2.95, SW.sand, SW.sand2, SW.rock, [
    [2.15, 0.95, 0.42],
    [-2.2, -0.6, 0.48],
    [1.2, -2.2, 0.3]
  ]);
  // The crater it burst from, sand spilling off its rim; old ribs and a toppled pillar
  c.k.add("sand", new THREE.TorusGeometry(1.2, 0.38, 8, 28), [0, 0.12, -0.55], [Math.PI / 2, 0, 0], { color: SW.sand2, scale: [1, 1, 0.55] });
  ribs(c, [-1.8, 0.05, 0.6], 0.5, 4, 0.55, SW.bone);
  c.k.add("matte", new THREE.CylinderGeometry(0.26, 0.28, 1.6, 12), [1.75, 0.3, -1.2], [Math.PI / 2 - 0.1, 0.6, 0], { color: "#c9a46b", surf: ashlarRound(0.27) });
  c.k.add("matte", new THREE.BoxGeometry(0.7, 0.22, 0.7), [2.3, 0.2, -0.75], [0.3, 0.6, 0.1], { color: "#b8955f", surf: ASHLAR });
  // The worm, ringed and armoured, rising and arching over its maw
  c.bone("worm", [0, 0, -0.55], () =>
    chainBones(
      c,
      "seg",
      [0, -0.1, -0.55],
      Array.from({ length: SW_SEGS }, () => 0.55),
      SW_PITCH,
      SW_RADII,
      { bucket: "skin", color: SW.hide, seg: 14, endCap: false },
      (j, from, to, r0, r1, dir) => {
        const back: V3 = [0, dir[2], -dir[1]];
        const belly: V3 = [-back[0], -back[1], -back[2]];
        const rr = (r0 + r1) / 2;
        const mid: V3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
        // The ring at the joint, armour plates on the back with a spine each, a paler belly
        c.k.add("chitin", new THREE.TorusGeometry(r0 * 1.0, r0 * 0.13, 6, 22), from, undefined, { color: SW.ring, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir)), surf: chitinRound(0.1) });
        plate(c, "chitin", [mid[0] + back[0] * rr * 0.72, mid[1] + back[1] * rr * 0.72, mid[2] + back[2] * rr * 0.72], back, dir, rr * 0.82, rr * 0.36, 0.34, { color: SW.plate, surf: chitinPlate(0.1) });
        if (j > 0) spike(c, "matte", [mid[0] + back[0] * rr * 1.02, mid[1] + back[1] * rr * 1.02, mid[2] + back[2] * rr * 1.02], [back[0] - dir[0] * 0.6, back[1] - dir[1] * 0.6, back[2] - dir[2] * 0.6], 0.09, 0.42 - j * 0.015, { color: SW.spine, seg: 5 });
        plate(c, "skin", [mid[0] + belly[0] * rr * 0.62, mid[1] + belly[1] * rr * 0.62, mid[2] + belly[2] * rr * 0.62], belly, dir, rr * 0.7, rr * 0.4, 0.32, { color: SW.hide2 });
        for (const s of [1, -1]) {
          const side: V3 = [s, 0, 0];
          if (j % 2 === 0) spike(c, "matte", [mid[0] + side[0] * rr * 0.95, mid[1], mid[2]], [s, 0.2, -0.2], 0.05, 0.22, { color: SW.spine, seg: 5 });
        }
      },
      (tip, dir) => sandwormMaw(c, tip, dir)
    )
  );
}

const swSegs = (f: (j: number) => BonePose | null): Pose => chainPose("seg", SW_SEGS, f);
const swPetals = (rx: number): Pose => ({ petal0: { r: [rx, 0, 0] }, petal1: { r: [rx * 0.95, 0, 0] }, petal2: { r: [rx * 1.05, 0, 0] }, petal3: { r: [rx, 0, 0] } });

function sandwormIdle(c: IdleCtx) {
  // The column sways in a slow figure of eight, a wave climbing it; the maw breathes; the tusks twitch
  for (let j = 0; j < SW_SEGS; j++) c.add(`seg${j}`, [0.035 * Math.sin(c.t * 0.55 - j * 0.4 + 1), 0.05 * Math.sin(c.t * 0.7 - j * 0.45 + c.seed * 4), 0.015 * Math.sin(c.t * 0.9 - j * 0.3)], null, j < 3 ? 0.012 * c.sin(1.0) : 0);
  c.add("maw", [0.06 * c.drift(0.5), 0.1 * c.glance(1, 5, 0.6), 0]);
  for (let i = 0; i < 4; i++) c.add(`petal${i}`, [-0.12 - 0.12 * (0.5 + 0.5 * c.sin(1.3, i * 0.6)), 0, 0], null, 0, 0);
  c.add("maw", null, null, 0, 0.3 * c.sin(1.3));
  const tw = c.event(4, 4.5, 0.5);
  c.add("tuskL", [0, -0.15 * tw.e, 0]);
  c.add("tuskR", [0, 0.15 * tw.e, 0]);
}

const SW_DEF: BossHeroDef = {
  build: sandworm,
  rest: { seg2: { r: [0.02, 0.05, 0] }, seg6: { r: [-0.02, -0.06, 0.02] }, maw: { r: [0.08, 0.04, 0.05] }, tuskL: { r: [0, 0.05, 0] } },
  idle: sandwormIdle,
  roar: {
    len: 3.0,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, hold: true, pose: merge(swSegs(() => ({ r: [0.04, 0, 0] })), swPetals(0.15), { maw: { r: [0.2, 0, 0] } }) },
      // Rears tall and back, the maw flung wide on its rings of teeth, the throat blazing
      { t: 0.42, pose: merge(swSegs((j) => ({ r: [-0.07, 0, 0] })), swPetals(-0.75), { maw: { r: [-0.45, 0, 0], g: 1.6 }, teethA: { g: 0.8 }, teethB: { g: 0.8 }, tuskL: { r: [0, -0.4, 0] }, tuskR: { r: [0, 0.4, 0] } }) },
      { t: 0.74, hold: true, pose: merge(swSegs(() => ({ r: [-0.06, 0, 0.01] })), swPetals(-0.65), { maw: { r: [-0.38, 0.06, 0], g: 1.3 }, tuskL: { r: [0, -0.35, 0] }, tuskR: { r: [0, 0.35, 0] } }) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.12, vig: 0.55, vigCol: "#431407", lines: 0.8, flash: 0.25, flashCol: "#fdba74" } }]
  },
  attack: {
    len: 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Draws back, the maw opening
      { t: 0.3, pose: merge(swSegs((j) => ({ r: [j < 5 ? -0.08 : -0.02, 0, 0] })), swPetals(-0.5), { maw: { r: [-0.15, 0, 0] } }) },
      { t: 0.42, hold: true, pose: merge(swSegs((j) => ({ r: [j < 5 ? -0.09 : -0.03, 0, 0] })), swPetals(-0.6), { maw: { r: [-0.2, 0, 0], g: 0.8 }, tuskL: { r: [0, -0.3, 0] }, tuskR: { r: [0, 0.3, 0] } }) },
      // Lunges down and forward; the maw slams shut on the impact
      { t: 0.55, pose: merge(swSegs(() => ({ r: [0.074, 0, 0], g: 0.4 })), swPetals(0.2), { maw: { r: [0.25, 0, 0], g: 1 }, tuskL: { r: [0, 0.2, 0] }, tuskR: { r: [0, -0.2, 0] } }) },
      { t: 0.66, pose: merge(swSegs(() => ({ r: [0.086, 0, 0] })), swPetals(0.25), { maw: { r: [0.3, 0, 0] } }) },
      { t: 0.85, hold: true, pose: merge(swSegs(() => ({ r: [0.025, 0, 0] })), { maw: { r: [0.06, 0, 0] } }) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.55, burst: true, cine: { quake: 0.24, stop: 0.08, flash: 0.45, flashCol: "#fed7aa", lines: 0.85, vig: 0.3, vigCol: "#431407" } }]
  },
  lag: { ...chainLag("seg", SW_SEGS, 0.025), maw: 0.25, petal0: 0.3, petal1: 0.3, petal2: 0.3, petal3: 0.3, tuskL: 0.3, tuskR: 0.3 },
  springs: { petal0: 80, petal1: 80, petal2: 80, petal3: 80 },
  burst: { at: [0, 0.3, 2.4], color: "#e6b56c", count: 90, speed: 3.0, spread: 1.6, size: 0.24, gravity: 6 },
  aura: aura("#ea580c", "#fff1c4", 2.9),
  height: 5,
  frame: [13, 6, 2.4],
  sparks: (c) => {
    // Sand pouring off the worm and blowing across the drift
    c.spark(SPARK.smoke, [0, 0.3, -0.4], 16, { color: "#c9a26a", size: 0.9, speed: 0.12, rise: 1.4, reach: 1.6, spread: 3.6 });
    c.spark(SPARK.ember, [0, 0.4, -0.4], 18, { color: "#e8c58a", size: 0.07, speed: 0.25, rise: 1.2, reach: 1.4, spread: 1.6 });
    c.spark(SPARK.mote, [0, 0.6, 0], 20, { color: "#f5d9a0", size: 0.07, speed: 0.3, rise: 0.5, reach: 2.4, spread: 3.6 });
  }
};

/* ================================================================== */
/* The Anubis Sunken Sphinx                                            */
/* ================================================================== */

const SX = {
  stone: "#c9a46b",
  stone2: "#b08a54",
  dark: "#6b4e2a",
  gold: "#d9a520",
  lapis: "#1e3a8a",
  turq: "#14b8a6",
  eye: "#34d399",
  kohl: "#0b0f19",
  plinth: "#c2a676",
  sand: "#d6a85c",
  sand2: "#c99843",
  rock: "#a07a48",
  tuft: "#3b2a17"
};

function sphinxWing(c: BossCtx, s: number) {
  const root: V3 = [s * 0.62, 1.95, 0.15];
  c.bone(s > 0 ? "wingR" : "wingL", root, () => {
    const e1 = new THREE.Vector3(s * 0.35, 1, -0.5).normalize();
    const e2 = new THREE.Vector3(s * 0.15, -0.25, -1).normalize();
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize().multiplyScalar(s);
    // Three rows of feathers: gold coverts, lapis secondaries, long turquoise primaries tipped in gold
    const rows: Array<{ count: number; len: (i: number) => number; w: number; bucket: string; color: string; off: number; from: number; to: number }> = [
      { count: 7, len: (i) => 1.9 + i * 0.15, w: 0.17, bucket: "gloss", color: SX.turq, off: -0.05, from: 0.05, to: 1.25 },
      { count: 7, len: (i) => 1.25 + i * 0.07, w: 0.17, bucket: "gloss", color: SX.lapis, off: 0.03, from: 0.1, to: 1.2 },
      { count: 6, len: () => 0.7, w: 0.16, bucket: "gold", color: SX.gold, off: 0.1, from: 0.15, to: 1.1 }
    ];
    rows.forEach((row) => {
      for (let i = 0; i < row.count; i++) {
        const th = row.from + (i / (row.count - 1)) * (row.to - row.from);
        const d = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th)).normalize();
        const L = row.len(i);
        const c0 = new THREE.Vector3(...root).addScaledVector(d, L * 0.5 + 0.08).addScaledVector(n, row.off);
        plate(c, row.bucket, c0.toArray() as V3, n.toArray() as V3, d.toArray() as V3, row.w, 0.035, L * 0.5, { color: row.color, wd: 8 });
        if (row.color === SX.turq) {
          const t = new THREE.Vector3(...root).addScaledVector(d, L + 0.02).addScaledVector(n, row.off);
          plate(c, "gold", t.toArray() as V3, n.toArray() as V3, d.toArray() as V3, row.w * 0.8, 0.03, 0.14, { color: SX.gold, wd: 6 });
        }
      }
    });
    // The wing's leading edge: a gilt bone
    const lead = e1.clone();
    seg(c, "gold", root, new THREE.Vector3(...root).addScaledVector(lead, 1.15).toArray() as V3, 0.09, 0.05, { color: SX.gold, seg: 8 });
  });
}

function sphinxLeg(c: BossCtx, s: number) {
  const side = s > 0 ? "R" : "L";
  const sh: V3 = [s * 0.62, 1.4, 0.85];
  const el: V3 = [s * 0.68, 0.74, 1.3];
  const wr: V3 = [s * 0.66, 0.72, 2.0];
  c.bone(`arm${side}`, sh, () => {
    blob(c, "matte", [s * 0.58, 1.25, 0.92], [0.34, 0.42, 0.38], { color: SX.stone });
    seg(c, "matte", sh, el, 0.27, 0.2, { color: SX.stone, seg: 10 });
    c.bone(`fore${side}`, el, () => {
      seg(c, "matte", el, wr, 0.2, 0.17, { color: SX.stone, seg: 10 });
      // A glowing crack down the foreleg
      c.k.move({ kind: MOVE.pulse, amp: 0.5, speed: 1.6, phase: s }, () => c.k.along("glow", [el[0] + s * 0.19, el[1] + 0.02, el[2] + 0.15], [wr[0] + s * 0.16, wr[1] + 0.03, wr[2] - 0.2], 0, { geo: new THREE.CylinderGeometry(0.018, 0.018, 1, 4, 1, true), color: SX.eye, bright: 1.5 }));
      c.bone(`paw${side}`, wr, () => {
        blob(c, "matte", [wr[0], wr[1] - 0.05, wr[2] + 0.18], [0.25, 0.16, 0.3], { color: SX.stone2 });
        for (let i = 0; i < 4; i++) {
          const x = wr[0] + (i - 1.5) * 0.12;
          blob(c, "matte", [x, wr[1] - 0.08, wr[2] + 0.42], [0.065, 0.08, 0.09], { color: SX.stone });
          hook(c, "gold", [x, wr[1] - 0.08, wr[2] + 0.5], [0, -0.3, 1], [0, -0.3, -0.1], 0.04, 0.2, 3, { color: SX.gold });
        }
      });
    });
  });
}

function sphinx(c: BossCtx) {
  sands(c, 2.95, SX.sand, SX.sand2, SX.rock, [
    [2.4, 1.6, 0.3],
    [-2.5, -1.4, 0.35]
  ]);
  // The temple plinth half sunk in the sand: dressed blocks, a cornice, a band of glowing hieroglyphs
  c.k.add("matte", new THREE.BoxGeometry(4.0, 0.52, 4.8), [0, 0.26, -0.1], undefined, { color: SX.plinth, surf: ASHLAR });
  c.k.add("matte", new THREE.BoxGeometry(4.12, 0.1, 4.92), [0, 0.55, -0.1], undefined, { color: SX.stone2 });
  c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.4 }, () => c.k.add("glow", new THREE.PlaneGeometry(3.2, 0.2), [0, 0.28, 2.37], undefined, { color: SX.eye, bright: 1.3, surf: runeBand(3.2, 0.2, 18) }));
  for (const s of [1, -1]) c.k.add("sand", new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2), [s * 1.9, 0.15, -2.3], [0, s * 0.4, 0], { color: SX.sand2, scale: [1.0, 0.45, 0.8] });
  // Broken columns at the back corners
  for (const [x, z, h, broken] of [
    [-1.75, -2.2, 2.4, false],
    [1.75, -2.2, 1.3, true]
  ] as Array<[number, number, number, boolean]>) {
    c.k.add("matte", new THREE.CylinderGeometry(0.24, 0.27, h, 14), [x, 0.6 + h / 2, z], undefined, { color: SX.stone, surf: ashlarRound(0.26) });
    c.k.add("matte", new THREE.CylinderGeometry(0.34, 0.3, 0.14, 14), [x, 0.67, z], undefined, { color: SX.stone2 });
    if (broken) c.k.add("rock", rubble(0.26, 9), [x + 0.05, 0.6 + h + 0.08, z], undefined, { color: SX.stone });
    else {
      c.k.add("matte", new THREE.CylinderGeometry(0.4, 0.24, 0.32, 12), [x, 0.6 + h + 0.16, z], undefined, { color: SX.stone2 });
      c.k.add("matte", new THREE.BoxGeometry(0.85, 0.12, 0.85), [x, 0.6 + h + 0.38, z], undefined, { color: SX.stone, surf: ASHLAR });
    }
  }
  c.bone("body", [0, 0.9, -0.4], () => {
    // A lion of carved sandstone lying on the plinth: deep chest, flank, haunches, folded hind legs
    blob(c, "matte", [0, 1.32, -0.55], [0.92, 0.7, 1.5], { color: SX.stone, wd: 18, hd: 12 });
    blob(c, "matte", [0, 1.55, 0.7], [0.85, 0.82, 0.72], { color: SX.stone, wd: 16, hd: 12 });
    for (const s of [1, -1]) {
      blob(c, "matte", [s * 0.62, 1.08, -1.45], [0.45, 0.55, 0.65], { color: SX.stone2 });
      blob(c, "matte", [s * 0.85, 0.72, -0.75], [0.24, 0.18, 0.55], { color: SX.stone2 });
      for (let i = 0; i < 3; i++) hook(c, "gold", [s * 0.85 + (i - 1) * 0.08, 0.66, -0.25], [0, -0.3, 1], [0, -0.3, 0], 0.03, 0.14, 3, { color: SX.gold });
      // Glowing cracks down the flanks
      const crack: V3[] = [
        [s * 0.9, 1.55, -0.2],
        [s * 0.93, 1.35, -0.5],
        [s * 0.91, 1.2, -0.85],
        [s * 0.88, 1.0, -1.05]
      ];
      for (let i = 0; i < crack.length - 1; i++)
        c.k.move({ kind: MOVE.pulse, amp: 0.55, speed: 1.6, phase: -i * 0.6 + s }, () => c.k.along("glow", crack[i], crack[i + 1], 0, { geo: new THREE.CylinderGeometry(0.02, 0.02, 1, 4, 1, true), color: SX.eye, bright: 1.5 }));
    }
    // The ridge of its spine
    for (let i = 0; i < 5; i++) blob(c, "matte", [0, 2.0 - i * 0.06, 0.1 - i * 0.45], [0.18, 0.1, 0.22], { color: SX.dark });
    // The broad collar of gold and lapis, teardrops hanging from it
    for (let i = 0; i < 3; i++)
      c.k.add(i === 1 ? "gloss" : "gold", new THREE.TorusGeometry(0.62 + i * 0.13, 0.065, 6, 22, Math.PI * 1.1), [0, 2.1 - i * 0.12, 1.05 + i * 0.08], [0.95, 0, -Math.PI * 0.05 - Math.PI], { color: i === 1 ? SX.lapis : SX.gold });
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.12 + (i / 8) * Math.PI * 0.76;
      c.k.add("gold", new THREE.ConeGeometry(0.05, 0.16, 5), [Math.cos(a) * 0.98, 1.72 - Math.sin(a) * 0.12, 1.32 + Math.sin(a) * 0.12], [Math.PI, 0, 0], { color: SX.gold });
    }
    sphinxLeg(c, 1);
    sphinxLeg(c, -1);
    sphinxWing(c, 1);
    sphinxWing(c, -1);
    // The head: the striped nemes, the gold death mask, emerald eyes lined in kohl, the cobra on its brow, the plaited beard
    c.bone("head", [0, 2.15, 1.05], () => {
      blob(c, "gold", [0, 2.78, 1.05], [0.6, 0.55, 0.55], { color: SX.gold, surf: nemes(0.11) });
      for (const s of [1, -1]) {
        c.k.add("gold", new THREE.BoxGeometry(0.3, 0.95, 0.12), [s * 0.44, 2.25, 1.32], [0.05, 0, s * 0.08], { color: SX.gold, surf: nemes(0.11) });
        c.k.add("matte", new THREE.BoxGeometry(0.05, 0.03, 0.04), [s * 0.27, 2.73, 1.72], [0, 0, -s * 0.15], { color: SX.kohl });
        c.k.add("glow", new THREE.SphereGeometry(0.075, 10, 6), [s * 0.14, 2.74, 1.67], undefined, { color: SX.eye, bright: 2, scale: [1.3, 0.6, 0.5] });
        blob(c, "gold", [s * 0.14, 2.86, 1.66], [0.12, 0.025, 0.05], { color: "#b8860b", rot: [0, 0, -s * 0.12] });
      }
      c.k.add("gold", new THREE.BoxGeometry(1.0, 0.85, 0.16), [0, 2.3, 0.62], undefined, { color: SX.gold, surf: nemes(0.11) });
      blob(c, "gold", [0, 2.6, 1.42], [0.36, 0.45, 0.3], { color: SX.gold, wd: 16, hd: 12 });
      blob(c, "gold", [0, 2.58, 1.72], [0.06, 0.12, 0.06], { color: SX.gold });
      blob(c, "gold", [0, 2.38, 1.68], [0.12, 0.04, 0.05], { color: "#b8860b" });
      c.k.add("gold", new THREE.CylinderGeometry(0.07, 0.09, 0.42, 10), [0, 2.07, 1.62], [0.25, 0, 0], { color: SX.gold, surf: nemes(0.06) });
      c.k.add("gold", new THREE.TorusGeometry(0.62, 0.04, 6, 24), [0, 3.02, 1.12], [Math.PI / 2 - 0.1, 0, 0], { color: SX.gold });
      // The uraeus: a cobra rearing from the brow, its hood in lapis, its eyes alight
      seg(c, "gold", [0, 3.02, 1.58], [0, 3.22, 1.66], 0.04, 0.035, { color: SX.gold, seg: 8 });
      blob(c, "gloss", [0, 3.24, 1.66], [0.08, 0.1, 0.03], { color: SX.lapis });
      blob(c, "gold", [0, 3.3, 1.7], [0.045, 0.04, 0.06], { color: SX.gold });
      for (const s of [1, -1]) c.k.add("glow", new THREE.SphereGeometry(0.012, 6, 4), [s * 0.025, 3.32, 1.75], undefined, { color: "#ef4444", bright: 2 });
    });
    // The tail laid round its haunch, tufted
    pathBones(
      c,
      "tail",
      [
        [0, 1.2, -2.0],
        [0.42, 0.88, -2.28],
        [0.98, 0.66, -2.12],
        [1.32, 0.62, -1.62],
        [1.42, 0.64, -1.02]
      ],
      [0.11, 0.09, 0.08, 0.07, 0.06],
      { bucket: "matte", color: SX.stone, seg: 8 },
      undefined,
      (at) => blob(c, "matte", [at[0], at[1] + 0.02, at[2] + 0.1], [0.12, 0.12, 0.2], { color: SX.tuft })
    );
  });
}

function sphinxIdle(c: IdleCtx) {
  const breath = c.sin(1.0);
  c.add("body", [0.01 * c.drift(0.3), 0, 0], [0, 0.03 * breath, 0], 0.012 * breath);
  c.add("head", [0.06 * c.drift(0.4) + 0.12 * c.event(5, 8, 1.5).e, 0.3 * c.glance(1, 5.5, 0.6), 0.04 * c.drift(0.31, 2)]);
  // The tail sways along the plinth and flicks now and then
  const flick = c.event(2, 4.5, 0.6);
  for (let j = 0; j < 4; j++) c.add(`tail${j}`, [0, 0.06 * Math.sin(c.t * 0.9 - j * 0.6) + (j === 3 ? flick.e * 0.45 : 0), 0.05 * flick.e * (j > 1 ? 1 : 0)]);
  // The wings settle and shift, never quite together
  c.add("wingL", [0.03 * c.drift(0.4, 1), 0.04 * c.drift(0.33), -0.04 * c.drift(0.37, 2)]);
  c.add("wingR", [0.03 * c.drift(0.43, 3), -0.04 * c.drift(0.29, 1), 0.04 * c.drift(0.35)]);
  // A paw flexes its claws
  const flex = c.event(6, 7, 0.9);
  c.add("pawR", [-0.22 * flex.e, 0, 0]);
  c.add("pawL", [-0.06 * c.drift(0.5), 0, 0]);
}

const SX_DEF: BossHeroDef = {
  build: sphinx,
  rest: { head: { r: [0.04, 0.1, 0.03] }, pawL: { r: [0, 0.08, 0] }, foreR: { r: [0, -0.04, 0] }, wingL: { r: [0, 0, 0.04] } },
  idle: sphinxIdle,
  roar: {
    len: 3.2,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, hold: true, pose: { body: { r: [0.06, 0, 0], p: [0, -0.06, 0] }, head: { r: [0.15, 0, 0] }, wingL: { r: [0, 0, 0.12] }, wingR: { r: [0, 0, -0.12] } } },
      // Rises on its forelegs, head flung back, eyes and cracks blazing, wings flung up and open
      { t: 0.42, pose: { body: { r: [-0.2, 0, 0], p: [0, 0.32, 0.05], g: 1.2 }, armL: { r: [0.22, 0, 0] }, armR: { r: [0.22, 0, 0] }, foreL: { r: [-0.15, 0, 0] }, foreR: { r: [-0.15, 0, 0] }, head: { r: [-0.35, 0, 0], g: 1.6 }, wingL: { r: [0.15, 0.2, 0.35] }, wingR: { r: [0.15, -0.2, -0.35] } } },
      { t: 0.74, hold: true, pose: { body: { r: [-0.18, 0, 0.02], p: [0, 0.3, 0.05], g: 0.9 }, armL: { r: [0.2, 0, 0] }, armR: { r: [0.2, 0, 0] }, foreL: { r: [-0.13, 0, 0] }, foreR: { r: [-0.13, 0, 0] }, head: { r: [-0.3, 0.06, 0], g: 1.2 }, wingL: { r: [0.12, 0.18, 0.3] }, wingR: { r: [0.12, -0.18, -0.3] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.12, vig: 0.55, vigCol: "#022c22", lines: 0.75, flash: 0.25, flashCol: "#6ee7b7" } }]
  },
  attack: {
    len: 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // The right paw rises high, the body leaning back and away
      { t: 0.3, pose: { body: { r: [-0.08, 0.1, -0.05], p: [0, 0.12, 0] }, armR: { r: [-0.95, 0.1, -0.15] }, foreR: { r: [-0.7, 0, 0] }, pawR: { r: [-0.4, 0, 0] }, head: { r: [0.1, -0.15, 0] }, wingR: { r: [0, 0, -0.15] } } },
      { t: 0.42, hold: true, pose: { body: { r: [-0.1, 0.12, -0.06], p: [0, 0.14, 0] }, armR: { r: [-1.1, 0.12, -0.18] }, foreR: { r: [-0.8, 0, 0] }, pawR: { r: [-0.5, 0, 0] }, head: { r: [0.12, -0.18, 0] }, wingR: { r: [0, 0, -0.2] } } },
      // The swipe: down and across, the body following through
      { t: 0.55, pose: { body: { r: [0.1, -0.15, 0.05], p: [0, 0.02, 0.15], g: 0.6 }, armR: { r: [0.15, -0.35, 0.12] }, foreR: { r: [0.1, 0, 0] }, pawR: { r: [0.35, 0, 0] }, head: { r: [0.15, 0.12, 0] } } },
      { t: 0.66, pose: { body: { r: [0.12, -0.22, 0.06], p: [0, 0, 0.18] }, armR: { r: [0.25, -0.5, 0.15] }, foreR: { r: [0.12, 0, 0] }, pawR: { r: [0.4, 0, 0] }, head: { r: [0.15, 0.18, 0] } } },
      { t: 0.85, hold: true, pose: { body: { r: [0.03, -0.05, 0] }, armR: { r: [0.05, -0.1, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.55, burst: true, cine: { quake: 0.2, stop: 0.08, flash: 0.42, flashCol: "#a7f3d0", lines: 0.85, vig: 0.3, vigCol: "#022c22" } }]
  },
  lag: { foreR: 0.05, pawR: 0.1, foreL: 0.05, pawL: 0.1, head: 0.08, wingL: 0.12, wingR: 0.12, tail0: 0.05, tail1: 0.1, tail2: 0.15, tail3: 0.2 },
  springs: { wingL: 60, wingR: 60, tail2: 50, tail3: 40 },
  burst: { at: [0.7, 0.7, 2.5], color: "#e6b56c", count: 80, speed: 2.8, spread: 1.2, size: 0.22, gravity: 6 },
  aura: aura("#059669", "#d1fae5", 2.9),
  height: 4.6,
  frame: [13, 6, 2.0],
  sparks: (c) => {
    c.spark(SPARK.smoke, [0, 0.3, 0], 14, { color: "#c9a26a", size: 0.9, speed: 0.1, rise: 1.2, reach: 1.8, spread: 4.2 });
    c.spark(SPARK.mote, [0, 1.6, 0.5], 22, { color: "#a7f3d0", size: 0.07, speed: 0.25, rise: 0.8, reach: 2.0, spread: 2.4 });
    c.spark(SPARK.wisp, [0, 2.8, 1.2], 10, { color: "#6ee7b7", size: 0.1, speed: 0.08, rise: 1.0, reach: 1.2, spread: 0.6 });
  }
};

/* ================================================================== */
/* The Dune Colossus Behemoth                                          */
/* ================================================================== */

const SC = {
  shell: "#121826",
  shell2: "#1f2937",
  joint: "#0a0f1a",
  bronze: "#a1702a",
  venom: "#4ade80",
  eye: "#ef4444",
  sand: "#d6a85c",
  sand2: "#c99843",
  rock: "#9a6b3a",
  bone: "#e6dcc8"
};
const SC_LEGS = [0.62, 0.2, -0.22, -0.64];
const SC_TAIL = 5;

function scorpionPincer(c: BossCtx, s: number) {
  const side = s > 0 ? "R" : "L";
  const sh: V3 = [s * 0.52, 1.0, 1.35];
  const el: V3 = [s * 0.98, 1.12, 1.95];
  const wr: V3 = [s * 0.98, 1.06, 2.5];
  c.bone(`palp${side}`, sh, () => {
    seg(c, "chitin", sh, el, 0.15, 0.13, { color: SC.shell2, seg: 10, surf: chitinRound(0.1) });
    c.bone(`fore${side}`, el, () => {
      seg(c, "chitin", el, wr, 0.13, 0.16, { color: SC.shell, seg: 10, surf: chitinRound(0.1) });
      c.bone(`claw${side}`, wr, () => {
        // The palm of the claw, a bronze-banded ridge, the fixed finger and the moving one, toothed along their inner edges
        blob(c, "chitin", [wr[0] + s * 0.04, wr[1], wr[2] + 0.38], [0.3, 0.25, 0.44], { color: SC.shell, surf: chitinPlate(0.12) });
        blob(c, "iron", [wr[0] + s * 0.1, wr[1] + 0.2, wr[2] + 0.36], [0.12, 0.06, 0.36], { color: SC.bronze });
        hook(c, "chitin", [wr[0] + s * 0.14, wr[1], wr[2] + 0.74], [s * 0.1, 0, 1], [-s * 0.12, 0, 0], 0.11, 0.62, 4, { color: SC.shell2 });
        for (let t = 0; t < 3; t++) spike(c, "matte", [wr[0] + s * (0.08 - t * 0.02), wr[1], wr[2] + 0.82 + t * 0.12], [-s, 0, 0.3], 0.025, 0.08, { color: SC.bone, seg: 4 });
        c.bone(`pinch${side}`, [wr[0] - s * 0.1, wr[1], wr[2] + 0.66], () => {
          hook(c, "chitin", [wr[0] - s * 0.1, wr[1], wr[2] + 0.66], [-s * 0.1, 0, 1], [s * 0.13, 0, 0], 0.09, 0.56, 4, { color: SC.shell2 });
          for (let t = 0; t < 3; t++) spike(c, "matte", [wr[0] - s * (0.05 - t * 0.02), wr[1], wr[2] + 0.76 + t * 0.12], [s, 0, 0.3], 0.022, 0.07, { color: SC.bone, seg: 4 });
        });
      });
    });
  });
}

function scorpion(c: BossCtx) {
  sands(c, 2.95, SC.sand, SC.sand2, SC.rock, [
    [-2.4, 1.3, 0.38],
    [2.3, -1.5, 0.42],
    [-1.4, -2.3, 0.28]
  ]);
  ribs(c, [1.9, 0.05, 1.5], -0.8, 3, 0.45, SC.bone);
  c.k.add("matte", new THREE.SphereGeometry(0.2, 10, 8), [2.2, 0.2, 0.9], undefined, { color: SC.bone, scale: [1, 0.8, 1.3] });
  c.bone("body", [0, 0.9, 0], () => {
    // The carapace over the head, the cluster of burning eyes, the mandibles
    blob(c, "chitin", [0, 1.0, 0.92], [0.82, 0.32, 0.72], { color: SC.shell, surf: chitinPlate(0.18), wd: 18, hd: 10 });
    blob(c, "chitin", [0, 1.24, 0.95], [0.16, 0.12, 0.5], { color: SC.shell2 });
    for (const s of [1, -1]) {
      c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.3, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.07, 10, 8), [s * 0.12, 1.34, 1.12], undefined, { color: SC.eye, bright: 2 }));
      for (let i = 0; i < 3; i++) c.k.add("glow", new THREE.SphereGeometry(0.04, 8, 6), [s * (0.48 + i * 0.07), 1.13 - i * 0.02, 1.48 - i * 0.08], undefined, { color: SC.eye, bright: 1.8 });
      c.bone(s > 0 ? "mandR" : "mandL", [s * 0.17, 0.95, 1.55], () => {
        blob(c, "chitin", [s * 0.17, 0.95, 1.66], [0.1, 0.09, 0.16], { color: SC.shell2 });
        hook(c, "matte", [s * 0.17, 0.93, 1.78], [-s * 0.3, -0.3, 1], [-s * 0.1, -0.1, 0], 0.035, 0.18, 3, { color: SC.bone });
      });
    }
    // The armoured back: overlapping plates trimmed in old bronze, venom glowing in the seams
    blob(c, "chitin", [0, 0.82, -0.3], [0.78, 0.3, 1.35], { color: SC.shell2 });
    for (let k = 0; k < 6; k++) {
      const z = 0.5 - k * 0.36;
      const w = 0.86 - Math.abs(k - 2) * 0.06;
      blob(c, "chitin", [0, 1.02 - k * 0.012, z], [w, 0.26, 0.24], { color: SC.shell, surf: chitinPlate(0.08), wd: 16, hd: 8 });
      c.k.add("iron", new THREE.TorusGeometry(w * 0.86, 0.025, 4, 18, Math.PI), [0, 1.0 - k * 0.012, z - 0.2], [0, 0, 0], { color: SC.bronze, scale: [1, 0.36, 1] });
      c.k.move({ kind: MOVE.pulse, amp: 0.6, speed: 2.1, phase: -k * 0.7 }, () => stud(c, "glow", [0, 1.24 - k * 0.012, z - 0.2], [0, 1, -0.3], 0.07, 0.025, { color: SC.venom, bright: 1.6 }));
    }
    // Eight jointed legs
    for (const s of [1, -1])
      SC_LEGS.forEach((z, i) => {
        const spread = (i - 1.5) * 0.25;
        pathBones(
          c,
          `leg${s > 0 ? "R" : "L"}${i}_`,
          [
            [s * 0.6, 0.95, z],
            [s * 1.25, 1.38, z + spread * 0.5],
            [s * 1.85, 0.6, z + spread],
            [s * 2.05, 0.05, z + spread * 1.2]
          ],
          [0.11, 0.09, 0.06, 0.025],
          { bucket: "chitin", color: i % 2 ? SC.shell : SC.shell2, seg: 8, surf: chitinRound(0.12) }
        );
      });
    scorpionPincer(c, 1);
    scorpionPincer(c, -1);
    // The tail: five segments arching over its back, venom glowing at the joints, the bulb and its stinger
    c.k.at([0, 1.05, -1.4], Math.PI, () =>
      chainBones(
        c,
        "tail",
        [0, 0, 0],
        Array.from({ length: SC_TAIL }, () => 0.55),
        [-0.5, -1.1, -1.7, -2.3, -2.8],
        [0.3, 0.27, 0.25, 0.23, 0.21, 0.2],
        { bucket: "chitin", color: SC.shell, seg: 10, surf: chitinRound(0.14) },
        (j, from, to, r0, r1, dir) => {
          const back: V3 = [0, dir[2], -dir[1]];
          const rr = (r0 + r1) / 2;
          const mid: V3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
          plate(c, "iron", [mid[0] + back[0] * rr * 0.9, mid[1] + back[1] * rr * 0.9, mid[2] + back[2] * rr * 0.9], back, dir, rr * 0.25, rr * 0.18, 0.2, { color: SC.bronze });
          c.k.move({ kind: MOVE.pulse, amp: 0.6, speed: 2.4, phase: -j * 0.8 }, () =>
            c.k.add("glow", new THREE.TorusGeometry(r0 * 0.98, 0.03, 4, 16), from, undefined, { color: SC.venom, bright: 1.5, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir)) })
          );
        },
        (tip, dir) =>
          c.bone("telson", tip, () => {
            const d = new THREE.Vector3(...dir);
            const bulb = new THREE.Vector3(...tip).addScaledVector(d, 0.24);
            blob(c, "gloss", bulb.toArray() as V3, [0.22, 0.22, 0.3], { color: "#14532d", quat: orient([0, 1, 0], dir) });
            c.k.move({ kind: MOVE.pulse, amp: 0.5, speed: 2.8 }, () => blob(c, "glow", bulb.clone().addScaledVector(d, 0.02).toArray() as V3, [0.12, 0.12, 0.16], { color: SC.venom, bright: 1.8 }));
            hook(c, "gloss", bulb.clone().addScaledVector(d, 0.25).toArray() as V3, [d.x, d.y - 0.6, d.z], [0, -0.25, 0], 0.08, 0.5, 4, { color: SC.joint });
          })
      )
    );
  });
}

const scTail = (f: (j: number) => BonePose | null): Pose => chainPose("tail", SC_TAIL, f);
const scLegs = (f: (s: number, i: number, j: number) => BonePose | null): Pose => {
  const out: Pose = {};
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const b = f(s, i, j);
    if (b) out[`leg${s > 0 ? "R" : "L"}${i}_${j}`] = b;
  }
  return out;
};

function scorpionIdle(c: IdleCtx) {
  const breath = c.sin(1.6);
  c.add("body", [0.015 * c.drift(0.5), 0.03 * c.drift(0.25), 0.015 * c.drift(0.4, 1)], [0, 0.02 * breath, 0]);
  // The legs shift their footing, one at a time
  for (const s of [1, -1])
    for (let i = 0; i < 4; i++) {
      const step = c.event(20 + i + (s > 0 ? 0 : 4), 3.2 + i * 0.4, 0.45);
      const side = s > 0 ? "R" : "L";
      c.add(`leg${side}${i}_0`, [0, 0.08 * step.e * (step.k - 0.5), s * 0.22 * step.e]);
      c.add(`leg${side}${i}_1`, [0, 0, -s * 0.12 * step.e]);
    }
  // The tail sways and quivers; the pincers clack; the mandibles work
  for (let j = 0; j < SC_TAIL; j++) c.add(`tail${j}`, [0.03 * Math.sin(c.t * 0.9 - j * 0.6), 0.05 * Math.sin(c.t * 0.6 - j * 0.5 + 1), 0]);
  c.add("telson", [0.08 * c.drift(1.3), 0.06 * c.drift(1.1, 2), 0]);
  const clackL = c.event(30, 3.6, 0.35).e;
  const clackR = c.event(31, 4.1, 0.35).e;
  c.add("pinchL", [0, -0.45 * clackL, 0]);
  c.add("pinchR", [0, 0.45 * clackR, 0]);
  c.add("palpL", [0.05 * c.drift(0.5), 0.06 * c.drift(0.4), 0]);
  c.add("palpR", [0.05 * c.drift(0.47, 2), -0.06 * c.drift(0.43, 1), 0]);
  c.add("mandL", [0, -0.2 * Math.max(0, c.sin(4.2)), 0]);
  c.add("mandR", [0, 0.2 * Math.max(0, c.sin(4.2, 1.3)), 0]);
}

const SC_DEF: BossHeroDef = {
  build: scorpion,
  rest: { palpL: { r: [0.04, 0.08, 0] }, palpR: { r: [-0.03, -0.04, 0] }, pinchL: { r: [0, -0.12, 0] }, telson: { r: [0.1, 0, 0.05] }, tail2: { r: [0, 0.04, 0] } },
  idle: scorpionIdle,
  roar: {
    len: 3.0,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, hold: true, pose: merge({ body: { r: [0.06, 0, 0], p: [0, -0.06, 0] } }, scTail(() => ({ r: [0.05, 0, 0] }))) },
      // Rears up, pincers spread wide and open, the tail arched high, venom blazing
      {
        t: 0.42,
        pose: merge(
          { body: { r: [-0.24, 0, 0], p: [0, 0.18, 0], g: 1 }, palpL: { r: [-0.35, 0.5, 0] }, palpR: { r: [-0.35, -0.5, 0] }, foreL: { r: [-0.25, 0.2, 0] }, foreR: { r: [-0.25, -0.2, 0] }, pinchL: { r: [0, -0.6, 0] }, pinchR: { r: [0, 0.6, 0] }, telson: { g: 1.2 } },
          scTail(() => ({ r: [-0.12, 0, 0], g: 1 })),
          scLegs((s, i, j) => (i === 0 && j === 0 ? { r: [0, 0, s * 0.25] } : null))
        )
      },
      {
        t: 0.74,
        hold: true,
        pose: merge(
          { body: { r: [-0.21, 0, 0.02], p: [0, 0.16, 0], g: 0.8 }, palpL: { r: [-0.3, 0.45, 0] }, palpR: { r: [-0.3, -0.45, 0] }, foreL: { r: [-0.22, 0.18, 0] }, foreR: { r: [-0.22, -0.18, 0] }, pinchL: { r: [0, -0.5, 0] }, pinchR: { r: [0, 0.5, 0] } },
          scTail(() => ({ r: [-0.1, 0, 0], g: 0.8 })),
          scLegs((s, i, j) => (i === 0 && j === 0 ? { r: [0, 0, s * 0.2] } : null))
        )
      },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.12, vig: 0.55, vigCol: "#052e16", lines: 0.8, flash: 0.22, flashCol: "#86efac" } }]
  },
  attack: {
    len: 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Pincers draw back and open, the tail coils back over its body
      { t: 0.3, pose: merge({ body: { r: [-0.06, 0, 0], p: [0, 0.05, -0.1] }, palpL: { r: [-0.15, 0.25, 0] }, palpR: { r: [-0.15, -0.25, 0] }, pinchL: { r: [0, -0.55, 0] }, pinchR: { r: [0, 0.55, 0] } }, scTail(() => ({ r: [-0.14, 0, 0] }))) },
      { t: 0.42, hold: true, pose: merge({ body: { r: [-0.08, 0, 0], p: [0, 0.06, -0.12] }, palpL: { r: [-0.18, 0.3, 0] }, palpR: { r: [-0.18, -0.3, 0] }, pinchL: { r: [0, -0.6, 0] }, pinchR: { r: [0, 0.6, 0] }, telson: { r: [-0.3, 0, 0] } }, scTail(() => ({ r: [-0.16, 0, 0] }))) },
      // The strike: the stinger whips over its back and down ahead, the pincers lunge and snap shut
      { t: 0.55, pose: merge({ body: { r: [0.1, 0, 0], p: [0, -0.04, 0.2], g: 0.6 }, palpL: { r: [0.15, -0.15, 0] }, palpR: { r: [0.15, 0.15, 0] }, foreL: { r: [0.1, 0, 0] }, foreR: { r: [0.1, 0, 0] }, pinchL: { r: [0, 0.1, 0] }, pinchR: { r: [0, -0.1, 0] }, telson: { r: [0.35, 0, 0], g: 1 } }, scTail(() => ({ r: [0.17, 0, 0] }))) },
      { t: 0.66, pose: merge({ body: { r: [0.12, 0, 0], p: [0, -0.05, 0.24] }, palpL: { r: [0.2, -0.18, 0] }, palpR: { r: [0.2, 0.18, 0] }, telson: { r: [0.4, 0, 0] } }, scTail(() => ({ r: [0.2, 0, 0] }))) },
      { t: 0.85, hold: true, pose: merge({ body: { r: [0.03, 0, 0], p: [0, 0, 0.06] } }, scTail(() => ({ r: [0.04, 0, 0] }))) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.55, burst: true, cine: { quake: 0.22, stop: 0.08, flash: 0.45, flashCol: "#bbf7d0", lines: 0.85, vig: 0.3, vigCol: "#052e16" } }]
  },
  lag: { ...chainLag("tail", SC_TAIL, 0.035), telson: 0.2, foreL: 0.04, foreR: 0.05, clawL: 0.08, clawR: 0.09, pinchL: 0.1, pinchR: 0.11 },
  springs: { telson: 70, ...chainSprings("tail", SC_TAIL, 90, 2) },
  burst: { at: [0, 0.6, 2.4], color: "#86efac", count: 70, speed: 2.6, spread: 1.0, size: 0.18, gravity: 5 },
  aura: aura("#16a34a", "#dcfce7", 2.9),
  height: 4.2,
  frame: [13, 6, 1.6],
  sparks: (c) => {
    c.spark(SPARK.smoke, [0, 0.25, 0], 14, { color: "#c9a26a", size: 0.9, speed: 0.1, rise: 1.2, reach: 1.8, spread: 4.2 });
    c.spark(SPARK.mote, [0, 0.5, 0], 18, { color: "#f5d9a0", size: 0.07, speed: 0.3, rise: 0.5, reach: 2.4, spread: 3.6 });
    c.spark(SPARK.flame, [0, 2.6, -1.2], 8, { color: "#86efac", size: 0.1, speed: 0.6, rise: -0.5, spread: 0.15 });
  }
};

export const SAND_BOSSES: Record<string, BossHeroDef> = {
  "boss-sandworm": SW_DEF,
  "boss-sphinx": SX_DEF,
  "boss-scorpion": SC_DEF
};
