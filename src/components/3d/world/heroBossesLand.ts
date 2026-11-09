import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MOVE, TAU, V3, craggy, rubble } from "./heroKit";
import { ASHLAR, SPARK, STRATA, ashlarRound, bark, scalesRound } from "./heroMaterials";
import { BossCtx, BossHeroDef, BonePose, IdleCtx, Pose } from "./heroRig";
import { blob, chainBones, chainLag, chainPose, chainSprings, hook, merge, pathBones, plate, seg, spike, stud } from "./bossParts";
import { leafMass } from "./heroLandmarks";

/* ------------------------------------------------------------------------- */
/* World bosses of the land: the Treant, the Wolf, the Yeti, the Gorgon        */
/* ------------------------------------------------------------------------- */

/*
 * As the sea and sand bosses: each builder adds its boss round the kit's origin at its Normal rig's size (inside a frame
 * of the Normal rig's own scale where it has one), facing +z, every part inside a bone; the rest of each def is its rest
 * pose, layered idle and keyed roar and attack.
 */

// No beam over a world boss: embers and its own sparks only
const aura = (color: string, hot: string, radius: number): BossHeroDef["aura"] => ({
  embers: { inner: Math.max(0.4, radius - 1.2), outer: radius + 0.3, height: 6.5, count: 90 },
  color,
  hot
});

/**
 * A bough of bark from one point to another (light on vertices: the bark is on the open cylinder only, its joint cap
 * plain); `boughs` lays a tapering run of them through points, ending in a point
 */
function bough(c: BossCtx, from: V3, to: V3, r0: number, r1: number, color: string, n = 8, cap = true, crag = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, n, crag ? 3 : 1, true);
  c.k.along("matte", from, to, 0, { geo: crag ? craggy(g, crag, Math.round(r0 * 100)) : g, color, surf: bark(Math.max(r0, 0.08)) });
  if (cap) c.k.add("matte", new THREE.SphereGeometry(r0 * 1.01, Math.max(5, n - 2), 3), from, undefined, { color });
}
function boughs(c: BossCtx, pts: V3[], r0: number, r1: number, color: string, n = 7) {
  for (let i = 0; i < pts.length - 1; i++) bough(c, pts[i], pts[i + 1], r0 + ((r1 - r0) * i) / (pts.length - 1), r0 + ((r1 - r0) * (i + 1)) / (pts.length - 1), color, n);
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  spike(c, "matte", b, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], r1, r1 * 2.4, { color, seg: n });
}

/** A blob light on vertices (for the many small round parts of a big boss) */
const lblob = (c: BossCtx, bucket: string, at: V3, radii: V3, o: Parameters<typeof blob>[4] = {}) => blob(c, bucket, at, radii, { wd: 9, hd: 6, ...o });

/** A small clump of leaves (a lumpy ball of few corners) */
function smallLeaves(radius: number, seed: number): THREE.BufferGeometry {
  const g = mergeVertices(new THREE.IcosahedronGeometry(radius, 1).deleteAttribute("normal").deleteAttribute("uv"));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).multiplyScalar(0.8 + ((Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.35);
    pos.setXYZ(i, v.x, v.y * 0.85, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const mid = (a: V3, b: V3, f = 0.5): V3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const sideOf = (s: number) => (s > 0 ? "R" : "L");

/** A low mound of ground round a boss: earth in strata, patches of moss or snow on it, rocks */
function mound(c: BossCtx, r: number, earth: string, patch: { bucket: string; color: string; n: number }, rocks: Array<[number, number, number]>, rock: string) {
  c.k.add("matte", new THREE.SphereGeometry(1, 28, 5, 0, TAU, 0, Math.PI / 2), [0, 0, 0], undefined, { color: earth, scale: [r, 0.3, r * 0.95], surf: STRATA });
  const rng = c.rng;
  for (let i = 0; i < patch.n; i++) {
    const a = (i / patch.n) * TAU + rng() * 0.6;
    const d = r * (0.35 + rng() * 0.45);
    c.k.add(patch.bucket, new THREE.SphereGeometry(1, 12, 4, 0, TAU, 0, Math.PI / 2), [Math.sin(a) * d, 0.3 * Math.sqrt(Math.max(0, 1 - (d / r) ** 2)) - 0.05, Math.cos(a) * d], [0, a, 0], {
      color: patch.color,
      scale: [0.45 + rng() * 0.35, 0.1 + rng() * 0.06, 0.3 + rng() * 0.3]
    });
  }
  rocks.forEach(([x, z, s], i) => c.k.add("rock", rubble(s, 61 + i), [x, s * 0.35 + 0.05, z], [0, i * 1.9, 0], { color: rock }));
}

/* ================================================================== */
/* Elder Treant Heartwood                                              */
/* ================================================================== */

const TR = {
  bark: "#4a3222",
  bark2: "#5e4029",
  bark3: "#2e1f15",
  socket: "#0c0806",
  moss: "#56702a",
  moss2: "#3f5a1a",
  leaf: "#1d5a2f",
  leaf2: "#24703a",
  leaf3: "#2f7d3c",
  autumn: "#4a6b22",
  dead: "#3a302a",
  thorn: "#1c1917",
  ember: "#fbbf24",
  fire: "#f97316",
  sap: "#dc2626",
  earth: "#4a3a28",
  fungus: "#c9a56c",
  rock: "#5b5650"
};

/** A strand of twisting bark round the trunk, from height y0 to y1 */
function strand(c: BossCtx, i: number, y0: number, y1: number, r: number, rad0: number, rad1: number) {
  const pts: V3[] = [];
  for (let k = 0; k <= 3; k++) {
    const f = k / 3;
    const y = y0 + (y1 - y0) * f;
    const a = i * 2.1 + y * 0.55;
    const rr = rad0 + (rad1 - rad0) * f;
    pts.push([Math.sin(a) * rr, y, Math.cos(a) * rr * 0.9]);
  }
  for (let k = 0; k < 3; k++) bough(c, pts[k], pts[k + 1], r * (1 - k * 0.1), r * (1 - (k + 1) * 0.1), i % 2 ? TR.bark2 : TR.bark, 7, k > 0);
}

function treantArm(c: BossCtx, s: number) {
  const side = sideOf(s);
  const sh: V3 = [s * 0.78, 3.42, 0];
  const el: V3 = [s * 1.32, 2.48, 0.22];
  const wr: V3 = [s * 1.55, 1.3, 0.62];
  c.bone(`arm${side}`, sh, () => {
    lblob(c, "matte", sh, [0.42, 0.4, 0.42], { color: TR.bark2, surf: bark(0.4) });
    bough(c, sh, el, 0.36, 0.29, TR.bark, 10);
    // Moss draped over the shoulder, thorns down the bough
    lblob(c, "leaf", [s * 0.82, 3.72, -0.02], [0.4, 0.14, 0.36], { color: TR.moss, rot: [0, 0, s * 0.35] });
    for (let i = 0; i < 3; i++) spike(c, "matte", mid(sh, el, 0.25 + i * 0.25), [s * 0.4, 0.3, i % 2 ? -0.8 : 0.8], 0.05, 0.22, { color: TR.thorn, seg: 5 });
    // A twig sprouting off the bough, in leaf
    const tw0 = mid(sh, el, 0.45);
    const tw1: V3 = [tw0[0] + s * 0.55, tw0[1] + 0.55, tw0[2] - 0.25];
    boughs(c, [tw0, mid(tw0, tw1, 0.5), tw1], 0.1, 0.04, TR.bark2, 6);
    c.k.move({ kind: MOVE.sway, pivot: tw0, amp: 0.05, speed: 1.1, phase: s * 1.3 }, () => c.k.add("leaf", smallLeaves(0.34, 580 + s), [tw1[0], tw1[1] + 0.12, tw1[2]], undefined, { color: TR.leaf2 }));
    c.bone(`fore${side}`, el, () => {
      lblob(c, "matte", el, [0.33, 0.33, 0.33], { color: TR.bark3, surf: bark(0.33) });
      bough(c, el, wr, 0.29, 0.21, TR.bark2, 10);
      c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 1.5, phase: s * 2 }, () => lblob(c, "glow", mid(el, wr, 0.4), [0.09, 0.07, 0.06], { color: TR.sap, bright: 1.6, rot: [0, 0, s] }));
      const mh = mid(el, wr, 0.3);
      c.k.move({ kind: MOVE.sway, pivot: mh, amp: -0.15, speed: 1.3, phase: s }, () => seg(c, "leaf", mh, [mh[0] + s * 0.05, mh[1] - 0.6, mh[2] - 0.1], 0.06, 0.02, { color: TR.moss2, seg: 5 }));
      const tw0 = mid(el, wr, 0.55);
      const tw1: V3 = [tw0[0] + s * 0.45, tw0[1] + 0.15, tw0[2] - 0.3];
      bough(c, tw0, tw1, 0.07, 0.03, TR.bark3, 6);
      c.k.add("leaf", smallLeaves(0.22, 590 + s), tw1, undefined, { color: TR.leaf });
      c.bone(`hand${side}`, wr, () => {
        lblob(c, "matte", [wr[0], wr[1] - 0.08, wr[2] + 0.05], [0.25, 0.22, 0.22], { color: TR.bark, surf: bark(0.22) });
        // Four twig fingers, half curled, thorn-tipped; a thumb
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * 0.11;
          hook(c, "matte", [wr[0] + s * (0.05 + x * 0.3), wr[1] - 0.2, wr[2] + 0.08 + x], [s * 0.2 + x * 0.5, -1, 0.35], [0, 0.05, 0.16], 0.07, 0.62 - Math.abs(i - 1.5) * 0.07, 3, { color: i % 2 ? TR.bark2 : TR.bark });
        }
        hook(c, "matte", [wr[0] - s * 0.15, wr[1] - 0.12, wr[2] + 0.18], [-s * 0.5, -0.7, 0.6], [s * 0.1, 0.05, 0], 0.06, 0.42, 3, { color: TR.bark2 });
      });
    });
  });
}

function treantFace(c: BossCtx) {
  // A brow of gnarled bark over deep sockets with ember eyes, a knot of a nose, a cracked mouth with fire in it
  for (const s of [1, -1]) {
    boughs(c, [[0, 3.3, 0.79], [s * 0.3, 3.24, 0.74], [s * 0.55, 3.1, 0.58]], 0.13, 0.07, TR.bark3, 7);
    lblob(c, "matte", [s * 0.27, 2.99, 0.7], [0.16, 0.12, 0.09], { color: TR.socket });
    c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 2.1, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.075, 10, 6), [s * 0.27, 2.99, 0.76], undefined, { color: TR.ember, bright: 2.3, scale: [1.2, 0.8, 0.6] }));
    lblob(c, "matte", [s * 0.36, 2.72, 0.7], [0.14, 0.11, 0.1], { color: TR.bark2, surf: bark(0.1) });
  }
  lblob(c, "matte", [0, 2.8, 0.8], [0.12, 0.2, 0.12], { color: TR.bark2, surf: bark(0.1) });
  lblob(c, "matte", [0, 2.5, 0.72], [0.38, 0.17, 0.1], { color: TR.socket });
  c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.7 }, () => lblob(c, "glow", [0, 2.49, 0.75], [0.3, 0.09, 0.08], { color: TR.fire, bright: 1.8 }));
  for (let i = 0; i < 5; i++) spike(c, "matte", [(i - 2) * 0.13, 2.6, 0.79], [0, -1, 0.15], 0.035, 0.13, { color: TR.dead, seg: 4 });
  c.bone("jaw", [0, 2.52, 0.5], () => {
    lblob(c, "matte", [0, 2.35, 0.75], [0.42, 0.11, 0.14], { color: TR.bark2, surf: bark(0.12) });
    for (let i = 0; i < 4; i++) spike(c, "matte", [(i - 1.5) * 0.14, 2.4, 0.81], [0, 1, 0.1], 0.03, 0.12, { color: TR.dead, seg: 4 });
    // A beard of moss hanging off the chin, swaying
    for (let i = 0; i < 3; i++) {
      const top: V3 = [(i - 1) * 0.18, 2.28, 0.8];
      c.k.move({ kind: MOVE.sway, pivot: top, amp: -0.12, speed: 1.2, phase: i * 1.9 }, () => seg(c, "leaf", top, [top[0] + (i - 1) * 0.05, 1.8 + (i % 2) * 0.15, 0.82], 0.06, 0.02, { color: TR.moss, seg: 5 }));
    }
  });
}

function treantCrown(c: BossCtx, rng: () => number) {
  c.bone("crown", [0, 3.85, -0.05], () => {
    // Boughs forking up and out, each under its leaf masses; dead snags reaching out of the top
    const arms: Array<[number, number, number]> = [
      [0.3, 1.55, 5.0],
      [1.35, 1.7, 5.25],
      [2.5, 1.5, 5.05],
      [3.6, 1.65, 5.3],
      [4.7, 1.55, 5.1],
      [5.6, 1.25, 5.55]
    ];
    arms.forEach(([a, d, y], i) => {
      const end: V3 = [Math.sin(a) * d, y, Math.cos(a) * d * 0.85 - 0.25];
      const elbow: V3 = [Math.sin(a + 0.25) * d * 0.5, y - 0.75, Math.cos(a + 0.25) * d * 0.45 - 0.15];
      boughs(c, [[Math.sin(a) * 0.25, 3.8, Math.cos(a) * 0.25 - 0.05], elbow, end], 0.26, 0.07, i % 2 ? TR.bark : TR.bark2, 7);
      const r = 0.62 + rng() * 0.25;
      const at: V3 = [end[0] * 1.04, end[1] + r * 0.35, end[2] * 1.04];
      c.k.move({ kind: MOVE.sway, pivot: [at[0], at[1] - 2.2, at[2]], amp: 0.03, speed: 0.75 + i * 0.07, phase: i * 1.37 }, () =>
        c.k.add("leaf", leafMass(r, 520 + i), at, [0, i, 0], { color: i === 4 ? TR.autumn : i % 2 ? TR.leaf2 : TR.leaf })
      );
      // A smaller clump on the bough's elbow
      if (i % 2 === 0)
        c.k.move({ kind: MOVE.sway, pivot: [elbow[0], elbow[1] - 2, elbow[2]], amp: 0.03, speed: 0.9 + i * 0.05, phase: i * 2.3 }, () =>
          c.k.add("leaf", smallLeaves(0.42, 560 + i), [elbow[0] * 1.3, elbow[1] + 0.25, elbow[2] * 1.3], [0, i, 0], { color: TR.leaf3 })
        );
    });
    // The heart of the crown: great masses of leaves over the trunk
    const cores: Array<[V3, number, string]> = [
      [[0, 5.95, -0.35], 1.1, TR.leaf],
      [[0.7, 6.35, 0.05], 0.8, TR.leaf3],
      [[-0.75, 6.2, -0.2], 0.85, TR.leaf2],
      [[0.1, 6.75, -0.45], 0.7, TR.leaf3]
    ];
    cores.forEach(([at, r, color], i) =>
      c.k.move({ kind: MOVE.sway, pivot: [at[0], at[1] - 2.6, at[2]], amp: 0.022, speed: 0.6 + i * 0.05, phase: i * 2.1 + 0.4 }, () => c.k.add("leaf", leafMass(r, 540 + i), at, [0, i * 0.7, 0], { color }))
    );
    for (const [x, z, h, lean] of [
      [0.55, -0.2, 1.5, -0.4],
      [-0.75, -0.55, 1.3, 0.55],
      [0.15, 0.55, 1.1, 0.35]
    ] as Array<[number, number, number, number]>)
      hook(c, "matte", [x, 6.2, z], [-lean, 1, z * 0.4], [lean * 0.15, 0, 0], 0.09, h, 4, { color: TR.dead });
  });
}

function treant(c: BossCtx) {
  const rng = c.rng;
  c.k.frame([0, 0, 0], [0, 0, 0], 1.2, () => {
    mound(c, 2.45, TR.earth, { bucket: "leaf", color: TR.moss, n: 7 }, [
      [1.85, -1.0, 0.36],
      [-1.95, 0.6, 0.3],
      [1.4, 1.5, 0.22]
    ], TR.rock);
    // Roots arching out of the trunk into the ground; pools of glowing sap; mushrooms in the moss
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.35 + rng() * 0.3;
      const out = 1.85 + rng() * 0.45;
      const P = (d: number, y: number, w = 0): V3 => [Math.sin(a + w) * d, y, Math.cos(a + w) * d];
      const pts = [P(0.62, 0.95), P(1.05, 0.82, 0.04), P(1.45, 0.6, -0.05), P(out, 0.28, 0.06), P(out + 0.4, -0.12, 0.02)];
      for (let k = 0; k < pts.length - 1; k++) bough(c, pts[k], pts[k + 1], 0.36 - k * 0.07, 0.36 - (k + 1) * 0.07, i % 2 ? TR.bark : TR.bark2, 8);
      if (i % 2) bough(c, pts[2], [pts[2][0] * 1.1 + Math.cos(a) * 0.5, -0.1, pts[2][2] * 1.1 - Math.sin(a) * 0.5], 0.12, 0.05, TR.bark3, 6);
    }
    for (const [x, z] of [
      [1.55, 1.2],
      [-1.6, -0.85]
    ])
      c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.3, phase: x }, () => stud(c, "glow", [x, 0.24, z], [0, 1, 0], 0.2, 0.03, { color: TR.sap, bright: 1.4, wd: 10 }));
    for (let i = 0; i < 5; i++) {
      const a = 1.2 + i * 1.25 + rng() * 0.4;
      const d = 1.5 + rng() * 0.6;
      const base: V3 = [Math.sin(a) * d, 0.18, Math.cos(a) * d];
      const h = 0.14 + rng() * 0.12;
      seg(c, "matte", base, [base[0], base[1] + h, base[2]], 0.035, 0.03, { color: "#e7dcc4", seg: 5 });
      c.k.add("matte", new THREE.SphereGeometry(0.11 + h * 0.3, 8, 4, 0, TAU, 0, Math.PI / 2), [base[0], base[1] + h - 0.01, base[2]], undefined, { color: TR.fungus, scale: [1, 0.55, 1] });
    }
    c.bone("trunk", [0, 0.3, 0], () => {
      bough(c, [0, 0.35, 0], [0, 2.02, 0.02], 0.98, 0.8, TR.bark, 14, true, 0.06);
      for (let i = 0; i < 3; i++) strand(c, i, 0.4, 2.0, 0.42, 0.62, 0.52);
      c.k.move({ kind: MOVE.pulse, amp: 0.5, speed: 1.4 }, () => lblob(c, "glow", [0.6, 1.1, 0.55], [0.1, 0.08, 0.06], { color: TR.sap, bright: 1.6, rot: [0, 0.8, 0] }));
      // Shelf fungus stepping up the trunk
      for (let i = 0; i < 3; i++) c.k.add("matte", new THREE.CylinderGeometry(0.22 - i * 0.04, 0.24 - i * 0.04, 0.06, 10, 1, false, 0, Math.PI), [-0.82, 0.9 + i * 0.28, -0.25 + i * 0.05], [0, -Math.PI / 2 - 0.4, 0], { color: TR.fungus });
      c.bone("chest", [0, 1.98, 0], () => {
        lblob(c, "matte", [0, 2.0, 0], [0.88, 0.36, 0.8], { color: TR.bark3, surf: bark(0.8) });
        bough(c, [0, 1.95, 0], [0, 3.95, -0.06], 0.8, 0.6, TR.bark, 14, true, 0.05);
        for (let i = 0; i < 3; i++) strand(c, i + 3, 2.0, 3.8, 0.36, 0.52, 0.38);
        treantFace(c);
        // Blisters of sap glowing in the bark, moss in the cracks
        for (const [x, y, z, ph] of [
          [-0.55, 2.4, 0.42, 0.3],
          [0.6, 3.5, -0.3, 2.1],
          [-0.3, 3.6, -0.55, 4.0]
        ])
          c.k.move({ kind: MOVE.pulse, amp: 0.5, speed: 1.6, phase: ph }, () => lblob(c, "glow", [x, y, z], [0.08, 0.07, 0.06], { color: TR.sap, bright: 1.6 }));
        lblob(c, "leaf", [-0.45, 3.85, 0.4], [0.35, 0.12, 0.3], { color: TR.moss2 });
        treantArm(c, 1);
        treantArm(c, -1);
        treantCrown(c, rng);
      });
    });
  });
}

function treantIdle(c: IdleCtx) {
  // The trunk creaks and sways; the crown on its own slower tempo; fingers curl; the face turns slowly, grinding its jaw
  const breath = c.sin(0.65);
  const creak = c.event(1, 6.5, 1.6);
  c.add("trunk", [0.012 * c.drift(0.3), 0, 0.016 * c.drift(0.24, 1)], null, 0.006 * breath);
  c.add("chest", [0.025 * c.drift(0.33, 2) + 0.05 * creak.e * (creak.k - 0.5), 0.12 * c.glance(1, 7, 1.0), 0.03 * c.drift(0.27)], null, 0.01 * breath, 0.25 * c.sin(1.1));
  c.add("crown", [0.04 * c.drift(0.21, 3), 0.03 * c.drift(0.18), 0.05 * c.drift(0.16, 1)]);
  c.add("armL", [0.06 * c.drift(0.4, 1), 0, -0.05 * c.drift(0.32)]);
  c.add("armR", [0.05 * c.drift(0.37, 4), 0, 0.06 * c.drift(0.29, 2)]);
  c.add("foreL", [0.08 * c.drift(0.45, 2), 0, 0]);
  c.add("foreR", [0.07 * c.drift(0.41), 0, 0]);
  const curl = c.event(3, 6, 1.2);
  c.add("handL", [0.35 * curl.e, 0, 0]);
  c.add("handR", [0.12 * c.drift(0.6, 1) + 0.3 * c.event(4, 7.5, 1.0).e, 0, 0]);
  c.add("jaw", [0.06 * Math.max(0, c.sin(0.55)) + 0.12 * c.event(5, 8, 1.4).e, 0.04 * c.drift(0.9), 0]);
}

const TR_DEF: BossHeroDef = {
  build: treant,
  rest: { chest: { r: [0.04, 0.06, -0.02] }, armL: { r: [-0.08, 0, -0.22] }, armR: { r: [-0.16, 0, 0.3] }, foreL: { r: [-0.35, 0, -0.1] }, foreR: { r: [-0.5, 0, 0.12] }, handL: { r: [0.3, 0, 0] }, handR: { r: [0.1, 0, 0.1] }, crown: { r: [0, 0, 0.03] } },
  idle: treantIdle,
  roar: {
    len: 3.2,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      // Draws in, hunched over, arms coiling
      { t: 0.22, hold: true, pose: { chest: { r: [0.14, 0, 0] }, armL: { r: [0.25, 0, 0.25] }, armR: { r: [0.25, 0, -0.25] }, foreL: { r: [0.4, 0, 0] }, foreR: { r: [0.4, 0, 0] }, jaw: { r: [0.1, 0, 0] } } },
      // Rears back, arms flung wide, the mouth gaping on its fire, the eyes and sap blazing, the crown thrashing
      { t: 0.42, pose: { trunk: { r: [-0.05, 0, 0] }, chest: { r: [-0.2, 0, 0], g: 1.6 }, armL: { r: [-0.5, 0, -1.25] }, armR: { r: [-0.5, 0, 1.25] }, foreL: { r: [-0.3, 0, 0] }, foreR: { r: [-0.3, 0, 0] }, handL: { r: [-0.4, 0, 0] }, handR: { r: [-0.4, 0, 0] }, jaw: { r: [0.55, 0, 0] }, crown: { r: [-0.1, 0, 0.08] } } },
      { t: 0.74, hold: true, pose: { trunk: { r: [-0.04, 0, 0] }, chest: { r: [-0.18, 0.04, 0], g: 1.2 }, armL: { r: [-0.45, 0, -1.15] }, armR: { r: [-0.45, 0, 1.15] }, foreL: { r: [-0.25, 0, 0] }, foreR: { r: [-0.25, 0, 0] }, handL: { r: [-0.3, 0, 0] }, handR: { r: [-0.3, 0, 0] }, jaw: { r: [0.5, 0, 0] }, crown: { r: [-0.08, 0, -0.04] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.14, vig: 0.55, vigCol: "#1c1208", lines: 0.8, flash: 0.22, flashCol: "#fbbf24" } }]
  },
  attack: {
    len: 2.6,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Both great arms haul up and out in front of its face, the trunk rearing back
      { t: 0.32, pose: { trunk: { r: [-0.03, 0, 0] }, chest: { r: [-0.16, 0, 0] }, armL: { r: [-1.85, 0, -0.35] }, armR: { r: [-1.9, 0, 0.35] }, foreL: { r: [0.35, 0, 0] }, foreR: { r: [0.45, 0, 0] }, handL: { r: [-0.4, 0, 0] }, handR: { r: [-0.4, 0, 0] }, jaw: { r: [0.2, 0, 0] } } },
      { t: 0.44, hold: true, pose: { trunk: { r: [-0.05, 0, 0] }, chest: { r: [-0.2, 0, 0], g: 0.6 }, armL: { r: [-2.0, 0, -0.3] }, armR: { r: [-2.05, 0, 0.3] }, foreL: { r: [0.3, 0, 0] }, foreR: { r: [0.4, 0, 0] }, handL: { r: [-0.5, 0, 0] }, handR: { r: [-0.5, 0, 0] }, jaw: { r: [0.3, 0, 0] } } },
      // The blow: down through the ground ahead, the trunk bowing after it
      { t: 0.56, pose: { trunk: { r: [0.14, 0, 0] }, chest: { r: [0.5, 0, 0], g: 1 }, armL: { r: [-1.1, 0, 0.12] }, armR: { r: [-1.05, 0, -0.18] }, foreL: { r: [0.55, 0, 0] }, foreR: { r: [0.6, 0, 0] }, handL: { r: [0.3, 0, 0] }, handR: { r: [0.3, 0, 0] }, jaw: { r: [0.35, 0, 0] } } },
      { t: 0.68, pose: { trunk: { r: [0.16, 0, 0] }, chest: { r: [0.55, 0, 0] }, armL: { r: [-0.95, 0, 0.15] }, armR: { r: [-0.9, 0, -0.2] }, foreL: { r: [0.6, 0, 0] }, foreR: { r: [0.65, 0, 0] }, handL: { r: [0.4, 0, 0] }, handR: { r: [0.4, 0, 0] }, crown: { r: [0.14, 0, 0] } } },
      { t: 0.86, hold: true, pose: { trunk: { r: [0.04, 0, 0] }, chest: { r: [0.14, 0, 0] }, armL: { r: [-0.15, 0, 0] }, armR: { r: [-0.15, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: { quake: 0.26, stop: 0.09, flash: 0.4, flashCol: "#fde68a", lines: 0.85, vig: 0.32, vigCol: "#1c1208" } }]
  },
  lag: { foreL: 0.05, foreR: 0.06, handL: 0.1, handR: 0.11, armL: 0.02, crown: 0.16, jaw: 0.05 },
  springs: { crown: 35, handL: 80, handR: 80 },
  burst: { at: [0, 0.3, 2.7], color: "#7c5a33", count: 90, speed: 3.0, spread: 2.0, size: 0.26, gravity: 6 },
  aura: aura("#d97706", "#fef3c7", 3.0),
  height: 8,
  frame: [17, 7, 3.6],
  sparks: (c) => {
    // Fireflies round the crown, embers off the mouth's fire, a low mist in the moss
    c.spark(SPARK.mote, [0, 5.6, 0], 26, { color: "#fcd34d", size: 0.08, speed: 0.3, rise: 0.6, reach: 2.2, spread: 3.2 });
    c.spark(SPARK.ember, [0, 3.0, 0.95], 12, { color: "#fb923c", size: 0.06, speed: 0.35, rise: 1.6, reach: 0.4, spread: 0.4 });
    c.spark(SPARK.smoke, [0, 0.25, 0], 12, { color: "#3f4a2e", size: 1.0, speed: 0.08, rise: 0.8, reach: 1.8, spread: 4.0 });
  }
};

/* ================================================================== */
/* Fenrir Shadow Wolf Packlord                                         */
/* ================================================================== */

const WF = {
  fur: "#2c2c34",
  fur2: "#383840",
  mane: "#16161b",
  belly: "#45424a",
  spine: "#0b0b0e",
  claw: "#d6d3cd",
  fang: "#f5f3ec",
  eye: "#ef4444",
  maw: "#dc2626",
  nose: "#0a0a0a",
  earth: "#2c2a25",
  grass: "#334a24",
  rock: "#46443f",
  bone: "#bdb4a2"
};

function wolfLeg(c: BossCtx, name: string, pts: V3[], radii: number[], thigh: [V3, V3]) {
  pathBones(
    c,
    name,
    pts,
    radii,
    { bucket: "fur", color: WF.fur, seg: 9 },
    (j) => {
      if (j === 0) blob(c, "fur", thigh[0], thigh[1], { color: WF.fur2 });
    },
    (at) => {
      // The paw: a broad pad, four toes, hooked claws
      blob(c, "fur", [at[0], at[1] - 0.01, at[2] + 0.08], [0.17, 0.1, 0.22], { color: WF.fur });
      for (let i = 0; i < 4; i++) {
        const x = at[0] + (i - 1.5) * 0.085;
        blob(c, "fur", [x, at[1] - 0.03, at[2] + 0.25], [0.05, 0.055, 0.07], { color: WF.fur2 });
        hook(c, "matte", [x, at[1] - 0.04, at[2] + 0.3], [0, -0.4, 1], [0, -0.3, 0], 0.025, 0.12, 3, { color: WF.claw });
      }
    }
  );
}

function wolfHead(c: BossCtx) {
  c.bone("neck", [0, 2.15, 1.2], () => {
    seg(c, "fur", [0, 2.12, 1.2], [0, 2.38, 1.72], 0.38, 0.3, { color: WF.fur, seg: 12 });
    c.bone("head", [0, 2.4, 1.72], () => {
      blob(c, "fur", [0, 2.5, 1.9], [0.36, 0.33, 0.42], { color: WF.fur, wd: 16, hd: 10 });
      // Cheek ruff swept back
      for (const s of [1, -1]) for (let i = 0; i < 3; i++) spike(c, "fur", [s * 0.27, 2.38 + i * 0.1, 1.85], [s * 0.7, -0.2 + i * 0.15, -0.6], 0.09, 0.34, { color: WF.mane, seg: 5 });
      // The long muzzle, its bridge, the nose
      seg(c, "fur", [0, 2.42, 2.08], [0, 2.27, 2.72], 0.2, 0.12, { color: WF.fur2, seg: 10 });
      blob(c, "fur", [0, 2.5, 2.3], [0.12, 0.08, 0.32], { color: WF.fur });
      blob(c, "gloss", [0, 2.31, 2.79], [0.08, 0.065, 0.07], { color: WF.nose });
      for (const s of [1, -1]) {
        // Heavy brows over red eyes, sunk in dark sockets
        blob(c, "fur", [s * 0.17, 2.66, 2.12], [0.13, 0.05, 0.1], { color: WF.mane, rot: [0, 0, s * 0.3] });
        blob(c, "matte", [s * 0.17, 2.57, 2.17], [0.08, 0.05, 0.05], { color: "#050505" });
        c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 2.3, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.05, 8, 6), [s * 0.17, 2.57, 2.21], undefined, { color: WF.eye, bright: 2.4, scale: [1.3, 0.75, 0.6] }));
        // Fangs in the upper jaw, lips drawn back
        spike(c, "matte", [s * 0.1, 2.2, 2.62], [0, -1, 0.1], 0.025, 0.17, { color: WF.fang, seg: 5 });
        for (let i = 0; i < 3; i++) spike(c, "matte", [s * 0.12, 2.2, 2.25 + i * 0.12], [0, -1, 0], 0.014, 0.06, { color: WF.fang, seg: 4 });
        // Ears, turning
        c.bone(`ear${sideOf(s)}`, [s * 0.2, 2.75, 1.82], () => {
          c.k.add("fur", new THREE.ConeGeometry(0.12, 0.38, 7), [s * 0.25, 2.92, 1.78], [-0.25, 0, -s * 0.3], { color: WF.fur, scale: [1, 1, 0.55] });
          c.k.add("matte", new THREE.ConeGeometry(0.07, 0.26, 6), [s * 0.245, 2.9, 1.84], [-0.25, 0, -s * 0.3], { color: "#3a2a2a", scale: [1, 1, 0.4] });
        });
      }
      // A red glow in the throat, between the jaws
      c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 2.6 }, () => blob(c, "glow", [0, 2.18, 2.3], [0.1, 0.035, 0.28], { color: WF.maw, bright: 1.7 }));
      c.bone("jaw", [0, 2.24, 2.0], () => {
        seg(c, "fur", [0, 2.15, 2.03], [0, 2.1, 2.62], 0.12, 0.08, { color: WF.fur2, seg: 9 });
        blob(c, "matte", [0, 2.15, 2.35], [0.07, 0.025, 0.22], { color: "#5a1a1a" });
        for (const s of [1, -1]) {
          spike(c, "matte", [s * 0.08, 2.14, 2.56], [0, 1, 0.05], 0.022, 0.13, { color: WF.fang, seg: 5 });
          for (let i = 0; i < 2; i++) spike(c, "matte", [s * 0.09, 2.16, 2.25 + i * 0.13], [0, 1, 0], 0.013, 0.05, { color: WF.fang, seg: 4 });
        }
        for (const s of [1, -1]) spike(c, "fur", [s * 0.1, 2.06, 2.2], [s * 0.3, -0.8, -0.3], 0.06, 0.2, { color: WF.mane, seg: 5 });
      });
    });
  });
}

const WF_TAIL = 5;

function wolf(c: BossCtx) {
  const rng = c.rng;
  c.k.frame([0, 0, 0], [0, 0, 0], 1.1, () => {
    mound(c, 2.5, WF.earth, { bucket: "leaf", color: WF.grass, n: 8 }, [
      [-1.9, 1.2, 0.36],
      [2.0, -0.9, 0.42],
      [1.3, 1.7, 0.24]
    ], WF.rock);
    // A fallen log and the bones of its last kill
    bough(c, [-1.4, 0.2, -1.4], [0.2, 0.25, -2.1], 0.2, 0.17, "#3d2c1e", 9);
    c.k.add("matte", new THREE.SphereGeometry(0.16, 10, 8), [1.65, 0.28, 0.55], [0.3, 0.6, 0], { color: WF.bone, scale: [1, 0.85, 1.25] });
    for (let i = 0; i < 4; i++) c.k.add("matte", new THREE.TorusGeometry(0.22 - i * 0.02, 0.02, 4, 10, Math.PI * 0.9), [1.2 + i * 0.12, 0.24, 1.15], [0, 0.9, 0.2], { color: WF.bone });
    c.k.along("matte", [-0.9, 0.24, 1.5], [-0.3, 0.26, 1.85], 0.035, { color: WF.bone });
    c.bone("body", [0, 1.78, -0.1], () => {
      // The deep chest, lean belly and haunch, a great ruff of mane over the shoulders
      blob(c, "fur", [0, 1.8, 0.72], [0.6, 0.76, 0.76], { color: WF.fur, wd: 16, hd: 12 });
      blob(c, "fur", [0, 1.9, -0.2], [0.58, 0.56, 0.95], { color: WF.fur2, wd: 16, hd: 10 });
      blob(c, "fur", [0, 1.62, -0.15], [0.42, 0.3, 0.7], { color: WF.belly });
      seg(c, "fur", [0, 1.98, 0.55], [0, 1.95, -1.0], 0.54, 0.55, { color: WF.fur, seg: 12, cap: false });
      blob(c, "fur", [0, 1.92, -1.0], [0.6, 0.62, 0.6], { color: WF.fur, wd: 14, hd: 10 });
      blob(c, "fur", [0, 2.3, 0.92], [0.72, 0.66, 0.62], { color: WF.mane, wd: 16, hd: 12 });
      // A paler, grizzled chest
      blob(c, "fur", [0, 1.62, 1.18], [0.42, 0.5, 0.36], { color: WF.belly });
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI * 0.85 + (i / 13) * Math.PI * 1.7;
        const base: V3 = [Math.sin(a) * 0.64, 2.28 + Math.cos(a) * 0.56, 0.85];
        spike(c, "fur", base, [Math.sin(a) * 0.6, Math.cos(a) * 0.5 + 0.1, -0.8], 0.15, 0.5 + rng() * 0.2, { color: i % 2 ? WF.mane : WF.fur, seg: 5 });
      }
      // Spines of black bone bristling down the back, smaller on the flanks
      for (let i = 0; i < 7; i++) {
        const z = 1.25 - i * 0.36;
        const y = 2.88 - Math.abs(i - 1.5) * 0.08 - (i > 3 ? (i - 3) * 0.1 : 0);
        spike(c, "gloss", [0, y - 0.25, z], [0, 1, -0.55], 0.11 - i * 0.008, 0.72 - i * 0.07, { color: WF.spine, seg: 6 });
      }
      for (const s of [1, -1]) {
        spike(c, "gloss", [s * 0.62, 2.35, 1.0], [s * 0.6, 0.7, -0.5], 0.08, 0.5, { color: WF.spine, seg: 5 });
        spike(c, "gloss", [s * 0.58, 2.2, 0.4], [s * 0.6, 0.6, -0.6], 0.07, 0.4, { color: WF.spine, seg: 5 });
        // Shaggy tufts under the belly
        for (let i = 0; i < 3; i++) spike(c, "fur", [s * 0.25, 1.45, 0.4 - i * 0.4], [s * 0.2, -1, -0.3], 0.1, 0.28, { color: WF.fur, seg: 5 });
      }
      for (const s of [1, -1]) {
        wolfLeg(c, `legF${sideOf(s)}`, [[s * 0.4, 1.8, 0.95], [s * 0.5, 1.05, 0.78], [s * 0.46, 0.42, 0.98], [s * 0.46, 0.12, 1.1]], [0.3, 0.23, 0.16, 0.14], [[s * 0.43, 1.55, 0.92], [0.3, 0.5, 0.38]]);
        wolfLeg(c, `legH${sideOf(s)}`, [[s * 0.42, 1.88, -1.02], [s * 0.5, 1.15, -0.68], [s * 0.47, 0.62, -1.28], [s * 0.45, 0.12, -1.12]], [0.32, 0.22, 0.15, 0.13], [[s * 0.44, 1.58, -0.92], [0.34, 0.52, 0.46]]);
      }
      // The brush of its tail, sweeping
      chainBones(
        c,
        "tail",
        [0, 2.08, -1.48],
        [0.42, 0.42, 0.4, 0.38, 0.36],
        [0.35, 0.6, 0.85, 0.9, 0.75],
        [0.15, 0.17, 0.19, 0.18, 0.15, 0.06],
        { bucket: "fur", color: WF.fur, seg: 9, yaw: [Math.PI, Math.PI, Math.PI, Math.PI, Math.PI] },
        (j, from, to, r0, r1, dir) => {
          // A brush of long hair: a lock round the bone, tufts flaring off it
          blob(c, "fur", mid(from, to, 0.55), [r0 * 1.35, r0 * 1.25, 0.34], { color: WF.fur, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir)) });
          for (const sx of [1, -1]) spike(c, "fur", mid(from, to, 0.7), [dir[0] + sx * 0.6, dir[1] - 0.2, dir[2]], r0 * 0.55, r0 * 2.2, { color: WF.mane, seg: 5 });
        },
        (at, dir) => spike(c, "fur", at, dir, 0.12, 0.35, { color: WF.mane, seg: 6 })
      );
      wolfHead(c);
    });
  });
}

const wfTail = (f: (j: number) => BonePose | null): Pose => chainPose("tail", WF_TAIL, f);
const wfLegs = (front: (j: number) => BonePose | null, hind: (j: number) => BonePose | null): Pose => {
  const out: Pose = {};
  for (const s of ["L", "R"])
    for (let j = 0; j < 3; j++) {
      const f = front(j);
      const h = hind(j);
      if (f) out[`legF${s}${j}`] = f;
      if (h) out[`legH${s}${j}`] = h;
    }
  return out;
};

function wolfIdle(c: IdleCtx) {
  // Breathing deep, a pant with it; weight shifting from paw to paw; ears flicking; the head glancing round; the tail sweeping
  const breath = c.sin(1.5);
  const shift = c.drift(0.28);
  c.add("body", [0.015 * c.drift(0.4), 0.025 * c.drift(0.2, 2), 0.03 * shift], [0.03 * shift, 0.015 * breath, 0], 0.012 * breath);
  c.add("neck", [0.05 * c.drift(0.35, 1), 0.18 * c.glance(1, 4.5, 0.35), 0]);
  c.add("head", [0.08 * c.drift(0.5, 2) + 0.1 * c.event(2, 6, 0.8).e, 0.12 * c.glance(2, 3.2, 0.25), 0.06 * c.drift(0.4)]);
  c.add("jaw", [0.06 + 0.05 * breath, 0, 0]);
  const flickL = c.event(3, 3.5, 0.3);
  const flickR = c.event(4, 4.2, 0.3);
  c.add("earL", [-0.25 * flickL.e, 0.3 * flickL.e, 0]);
  c.add("earR", [-0.2 * flickR.e, -0.3 * flickR.e, 0]);
  // A forepaw lifts and sets down again
  const paw = c.event(5, 7, 0.9);
  const lifted = paw.k > 0.5 ? "legFR" : "legFL";
  c.add(`${lifted}0`, [-0.25 * paw.e, 0, 0]);
  c.add(`${lifted}1`, [0.55 * paw.e, 0, 0]);
  c.add(`${lifted}2`, [-0.35 * paw.e, 0, 0]);
  for (let j = 0; j < WF_TAIL; j++) c.add(`tail${j}`, [0.04 * Math.sin(c.t * 0.9 - j * 0.5), 0.16 * Math.sin(c.t * 0.7 - j * 0.6 + 1), 0]);
}

const WF_DEF: BossHeroDef = {
  build: wolf,
  rest: { neck: { r: [0.05, 0.06, 0] }, head: { r: [0.1, 0.08, 0.04] }, earL: { r: [0, 0.1, 0] }, legFL1: { r: [0.06, 0, 0] }, legHR0: { r: [0.04, 0, 0] }, tail0: { r: [0.1, 0.1, 0] } },
  idle: wolfIdle,
  roar: {
    len: 3.4,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      // Head low, drawing breath
      { t: 0.22, hold: true, pose: merge({ body: { r: [0.06, 0, 0], p: [0, -0.04, 0] }, neck: { r: [0.15, 0, 0] }, head: { r: [0.2, 0, 0] }, earL: { r: [0.3, 0, 0] }, earR: { r: [0.3, 0, 0] } }, wfTail(() => ({ r: [0.05, 0, 0] }))) },
      // The howl: forequarters up, head thrown back, jaw wide, mane bristling, eyes blazing
      {
        t: 0.42,
        pose: merge(
          { body: { r: [-0.14, 0, 0], p: [0, 0.05, -0.08], g: 1 }, neck: { r: [-0.55, 0, 0] }, head: { r: [-0.6, 0, 0], g: 1.6 }, jaw: { r: [0.45, 0, 0] }, earL: { r: [0.5, 0.2, 0] }, earR: { r: [0.5, -0.2, 0] } },
          wfLegs((j) => (j === 0 ? { r: [-0.12, 0, 0] } : j === 1 ? { r: [0.1, 0, 0] } : null), (j) => (j === 0 ? { r: [0.15, 0, 0] } : null)),
          wfTail(() => ({ r: [0.1, 0, 0] }))
        )
      },
      { t: 0.76, hold: true, pose: merge({ body: { r: [-0.12, 0, 0], p: [0, 0.04, -0.07], g: 0.8 }, neck: { r: [-0.5, 0.05, 0] }, head: { r: [-0.55, 0, 0.04], g: 1.2 }, jaw: { r: [0.42, 0, 0] }, earL: { r: [0.45, 0.2, 0] }, earR: { r: [0.45, -0.2, 0] } }, wfLegs((j) => (j === 0 ? { r: [-0.1, 0, 0] } : j === 1 ? { r: [0.08, 0, 0] } : null), (j) => (j === 0 ? { r: [0.12, 0, 0] } : null))) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.08, vig: 0.6, vigCol: "#1a0505", lines: 0.85, flash: 0.2, flashCol: "#fca5a5" } }]
  },
  attack: {
    len: 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Crouches low, head down, jaw parting, ears flat
      { t: 0.3, pose: merge({ body: { r: [0.08, 0, 0], p: [0, -0.14, -0.15] }, neck: { r: [0.2, 0, 0] }, head: { r: [-0.1, 0, 0] }, jaw: { r: [0.25, 0, 0] }, earL: { r: [0.5, 0, 0] }, earR: { r: [0.5, 0, 0] } }, wfLegs((j) => (j === 0 ? { r: [-0.25, 0, 0] } : j === 1 ? { r: [0.5, 0, 0] } : { r: [-0.25, 0, 0] }), (j) => (j === 0 ? { r: [-0.35, 0, 0] } : j === 1 ? { r: [0.45, 0, 0] } : { r: [-0.1, 0, 0] }))) },
      { t: 0.42, hold: true, pose: merge({ body: { r: [0.1, 0, 0], p: [0, -0.17, -0.2] }, neck: { r: [0.22, 0, 0] }, head: { r: [-0.15, 0, 0] }, jaw: { r: [0.55, 0, 0] }, earL: { r: [0.55, 0, 0] }, earR: { r: [0.55, 0, 0] } }, wfLegs((j) => (j === 0 ? { r: [-0.3, 0, 0] } : j === 1 ? { r: [0.6, 0, 0] } : { r: [-0.3, 0, 0] }), (j) => (j === 0 ? { r: [-0.42, 0, 0] } : j === 1 ? { r: [0.55, 0, 0] } : { r: [-0.12, 0, 0] }))) },
      // The lunge: forelegs reaching, hind legs driving, the jaws snapping shut on the impact
      { t: 0.52, pose: merge({ body: { r: [-0.06, 0, 0], p: [0, 0.12, 0.65], g: 0.6 }, neck: { r: [0.05, 0, 0] }, head: { r: [0.2, 0, 0], g: 1 }, jaw: { r: [0.7, 0, 0] } }, wfLegs((j) => (j === 0 ? { r: [-0.8, 0, 0] } : j === 1 ? { r: [-0.2, 0, 0] } : null), (j) => (j === 0 ? { r: [0.45, 0, 0] } : j === 1 ? { r: [-0.25, 0, 0] } : null))) },
      { t: 0.57, pose: merge({ body: { r: [0.04, 0, 0], p: [0, 0.02, 0.78] }, neck: { r: [0.15, 0, 0] }, head: { r: [0.28, 0, 0] }, jaw: { r: [-0.04, 0, 0] } }, wfLegs((j) => (j === 0 ? { r: [-0.55, 0, 0] } : null), (j) => (j === 0 ? { r: [0.35, 0, 0] } : null))) },
      // Shakes its catch
      { t: 0.7, pose: merge({ body: { r: [0.05, 0, 0.04], p: [0, -0.02, 0.6] }, neck: { r: [0.15, 0.18, 0] }, head: { r: [0.25, 0.2, 0.15] }, jaw: { r: [0, 0, 0] } }, wfLegs((j) => (j === 0 ? { r: [-0.3, 0, 0] } : null), (j) => (j === 0 ? { r: [0.2, 0, 0] } : null))) },
      { t: 0.86, hold: true, pose: { body: { p: [0, 0, 0.12] }, neck: { r: [0.05, -0.05, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.57, burst: true, cine: { quake: 0.18, stop: 0.08, flash: 0.42, flashCol: "#fecaca", lines: 0.9, vig: 0.32, vigCol: "#1a0505" } }]
  },
  lag: { neck: 0.03, head: 0.07, jaw: 0.04, earL: 0.1, earR: 0.11, ...chainLag("tail", WF_TAIL, 0.05, 0.05), legFL1: 0.03, legFR1: 0.03, legFL2: 0.06, legFR2: 0.06 },
  springs: { earL: 90, earR: 90, ...chainSprings("tail", WF_TAIL, 55, 1) },
  burst: { at: [0, 1.6, 3.6], color: "#f87171", count: 70, speed: 2.4, spread: 1.0, size: 0.18, gravity: 4 },
  aura: aura("#b91c1c", "#fecaca", 2.8),
  height: 3.8,
  frame: [12, 5, 2.0],
  sparks: (c) => {
    // Shadow curling off its back and paws, red sparks of its eyes' fire
    c.spark(SPARK.smoke, [0, 2.4, -0.2], 16, { color: "#1a1224", size: 1.0, speed: 0.12, rise: 1.6, reach: 0.9, spread: 1.6 });
    c.spark(SPARK.smoke, [0, 0.2, 0], 12, { color: "#140e1c", size: 1.1, speed: 0.08, rise: 0.6, reach: 1.8, spread: 3.6 });
    c.spark(SPARK.wisp, [0, 2.5, 0.4], 12, { color: "#f87171", size: 0.09, speed: 0.1, rise: 1.2, reach: 1.4, spread: 1.2 });
  }
};

/* ================================================================== */
/* Frost Titan Yeti Chieftain                                          */
/* ================================================================== */

const YT = {
  fur: "#e6ebf1",
  fur2: "#cfd8e3",
  fur3: "#b8c4d2",
  skin: "#5a6676",
  skin2: "#47515f",
  horn: "#8a8178",
  horn2: "#6b635c",
  tusk: "#f4f1e8",
  ice: "#bae6fd",
  ice2: "#7dd3fc",
  ice3: "#38bdf8",
  eye: "#22d3ee",
  snow: "#f1f5f9",
  snow2: "#e2e8f0",
  rock: "#64748b"
};

/** A cluster of ice crystals growing out of a surface at `at`, along `n` */
function iceCluster(c: BossCtx, at: V3, n: V3, size: number, rng: () => number, count = 4) {
  for (let i = 0; i < count; i++) {
    const d: V3 = [n[0] + (rng() - 0.5) * 0.9, n[1] + (rng() - 0.5) * 0.6, n[2] + (rng() - 0.5) * 0.9];
    const len = size * (0.6 + rng() * 0.7);
    c.k.add("gloss", new THREE.ConeGeometry(len * 0.22, len, 5), [at[0] + d[0] * len * 0.42, at[1] + d[1] * len * 0.42, at[2] + d[2] * len * 0.42], undefined, {
      color: i % 3 === 0 ? YT.ice2 : i % 3 === 1 ? YT.ice : "#e0f2fe",
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d).normalize())
    });
  }
}

function yetiArm(c: BossCtx, s: number, rng: () => number) {
  const side = sideOf(s);
  const sh: V3 = [s * 1.45, 3.55, 0.2];
  const el: V3 = [s * 1.78, 2.5, 0.42];
  const wr: V3 = [s * 1.95, 1.4, 0.78];
  c.bone(`arm${side}`, sh, () => {
    blob(c, "fur", sh, [0.6, 0.55, 0.58], { color: YT.fur });
    seg(c, "fur", sh, el, 0.48, 0.38, { color: YT.fur, seg: 12 });
    // Shaggy locks hanging off the arm
    for (let i = 0; i < 4; i++) spike(c, "fur", mid(sh, el, 0.2 + i * 0.2), [s * 0.5, -1, i % 2 ? -0.4 : 0.3], 0.16, 0.45, { color: i % 2 ? YT.fur2 : YT.fur, seg: 5 });
    c.bone(`fore${side}`, el, () => {
      blob(c, "fur", el, [0.4, 0.4, 0.4], { color: YT.fur2 });
      seg(c, "fur", el, wr, 0.42, 0.34, { color: YT.fur, seg: 12 });
      for (let i = 0; i < 3; i++) spike(c, "fur", mid(el, wr, 0.3 + i * 0.25), [s * 0.6, -0.8, i % 2 ? -0.5 : 0.2], 0.15, 0.4, { color: YT.fur3, seg: 5 });
      iceCluster(c, mid(el, wr, 0.35), [s * 0.4, 0.3, -0.8], 0.45, rng, 3);
      c.bone(`fist${side}`, wr, () => {
        // A fist of grey hide: knuckles, a thumb across, ice grown over the knuckles
        blob(c, "matte", [wr[0], wr[1] - 0.25, wr[2] + 0.12], [0.38, 0.36, 0.4], { color: YT.skin });
        for (let i = 0; i < 4; i++) {
          blob(c, "matte", [wr[0] + s * 0.04 + (i - 1.5) * 0.16, wr[1] - 0.52, wr[2] + 0.36], [0.1, 0.11, 0.11], { color: YT.skin2 });
          c.k.add("gloss", new THREE.ConeGeometry(0.06, 0.28, 5), [wr[0] + (i - 1.5) * 0.17, wr[1] - 0.52, wr[2] + 0.55], [Math.PI / 2, 0, 0], { color: i % 2 ? YT.ice2 : YT.ice });
        }
        blob(c, "matte", [wr[0] - s * 0.22, wr[1] - 0.35, wr[2] + 0.35], [0.1, 0.1, 0.17], { color: YT.skin2, rot: [0, s * 0.6, 0] });
        // Fur cuff over the wrist
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          spike(c, "fur", [wr[0] + Math.cos(a) * 0.3, wr[1] + 0.02, wr[2] + Math.sin(a) * 0.3], [Math.cos(a) * 0.5, -1, Math.sin(a) * 0.5], 0.12, 0.32, { color: YT.fur, seg: 5 });
        }
      });
    });
  });
}

function yetiHead(c: BossCtx) {
  c.bone("head", [0, 3.6, 0.95], () => {
    blob(c, "fur", [0, 3.95, 1.05], [0.58, 0.52, 0.52], { color: YT.fur, wd: 16, hd: 12 });
    // A bare grey face: heavy brow, deep sockets with burning cyan eyes, a flat nose
    blob(c, "matte", [0, 3.78, 1.42], [0.36, 0.33, 0.2], { color: YT.skin });
    blob(c, "matte", [0, 4.05, 1.5], [0.4, 0.1, 0.14], { color: YT.skin2 });
    blob(c, "matte", [0, 3.82, 1.6], [0.1, 0.09, 0.08], { color: YT.skin2 });
    for (const s of [1, -1]) {
      blob(c, "matte", [s * 0.16, 3.94, 1.55], [0.08, 0.05, 0.04], { color: "#1e2530" });
      c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.9, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.045, 8, 6), [s * 0.16, 3.94, 1.58], undefined, { color: YT.eye, bright: 2.4, scale: [1.4, 0.8, 0.6] }));
      // Great ram's horns curling round the ears
      hook(c, "matte", [s * 0.38, 4.2, 0.95], [s * 0.6, 0.6, -0.5], [s * 0.05, -0.32, 0.25], 0.13, 1.3, 7, { color: s > 0 ? YT.horn : YT.horn2 });
      // Brow fur and a mane of shag round the face
      for (let i = 0; i < 4; i++) spike(c, "fur", [s * (0.3 + i * 0.08), 3.6 + i * 0.15, 1.3 - i * 0.12], [s * 0.6, -0.6, -0.3], 0.14, 0.42, { color: i % 2 ? YT.fur2 : YT.fur, seg: 5 });
    }
    for (let i = 0; i < 4; i++) spike(c, "fur", [(i - 1.5) * 0.14, 4.35, 1.05], [(i - 1.5) * 0.3, 0.6, 0.8], 0.11, 0.3, { color: YT.fur, seg: 5 });
    // Upper teeth under the lip
    for (let i = 0; i < 4; i++) spike(c, "matte", [(i - 1.5) * 0.07, 3.6, 1.6], [0, -1, 0], 0.02, 0.07, { color: YT.tusk, seg: 4 });
    c.bone("jaw", [0, 3.62, 1.25], () => {
      blob(c, "matte", [0, 3.48, 1.48], [0.3, 0.13, 0.18], { color: YT.skin2 });
      // Tusks curving up out of the lower jaw; a beard of shag
      for (const s of [1, -1]) hook(c, "matte", [s * 0.18, 3.48, 1.6], [s * 0.2, 1, 0.3], [0, -0.05, 0.12], 0.045, 0.32, 3, { color: YT.tusk });
      for (let i = 0; i < 5; i++) spike(c, "fur", [(i - 2) * 0.1, 3.38, 1.48], [(i - 2) * 0.1, -1, 0.2], 0.1, 0.35 + (i % 2) * 0.1, { color: i % 2 ? YT.fur2 : YT.fur, seg: 5 });
      c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 2.2 }, () => blob(c, "glow", [0, 3.57, 1.52], [0.16, 0.03, 0.1], { color: YT.ice3, bright: 1.3 }));
    });
  });
}

function yeti(c: BossCtx) {
  const rng = c.rng;
  mound(c, 2.6, YT.snow, { bucket: "matte", color: YT.snow2, n: 6 }, [
    [2.0, -1.2, 0.4],
    [-2.1, 0.8, 0.34]
  ], YT.rock);
  // Ice spikes thrust up through the drift
  for (const [x, z, h, lean] of [
    [1.9, -0.95, 1.5, -0.3],
    [-1.95, 0.6, 1.25, 0.4],
    [1.5, 1.55, 0.85, -0.2],
    [-1.2, -1.6, 0.9, 0.25]
  ] as Array<[number, number, number, number]>) {
    c.k.add("gloss", new THREE.ConeGeometry(h * 0.22, h, 6), [x, h * 0.42, z], [0.15, 0, lean], { color: YT.ice2 });
    c.k.add("gloss", new THREE.ConeGeometry(h * 0.12, h * 0.55, 5), [x + 0.28, h * 0.22, z + 0.12], [-0.2, 0, lean - 0.4], { color: YT.ice });
  }
  // Legs planted in the drift: huge thighs, shaggy shins, broad grey feet (a bone of their own, so they turn with it
  // while the drift stays put)
  c.bone("legs", [0, 0, 0], () => {
    for (const s of [1, -1]) {
      seg(c, "fur", [s * 0.7, 1.55, -0.15], [s * 0.82, 0.75, 0.05], 0.55, 0.45, { color: YT.fur2, seg: 12 });
      seg(c, "fur", [s * 0.82, 0.75, 0.05], [s * 0.85, 0.25, 0.1], 0.45, 0.42, { color: YT.fur, seg: 12 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.3;
        spike(c, "fur", [s * 0.85 + Math.cos(a) * 0.38, 0.5, 0.1 + Math.sin(a) * 0.38], [Math.cos(a) * 0.5, -1, Math.sin(a) * 0.5], 0.14, 0.34, { color: YT.fur3, seg: 5 });
      }
      blob(c, "matte", [s * 0.88, 0.22, 0.32], [0.38, 0.16, 0.5], { color: YT.skin });
    }
    blob(c, "fur", [0, 1.6, -0.15], [1.0, 0.6, 0.75], { color: YT.fur2 });
  });
  c.bone("chest", [0, 1.85, -0.1], () => {
    // The barrel of its hunched torso, the humps of its shoulders, ice crystals grown over shoulders and back
    blob(c, "fur", [0, 2.95, 0.1], [1.35, 1.1, 1.0], { color: YT.fur, rot: [0.25, 0, 0], wd: 18, hd: 12 });
    blob(c, "fur", [0, 2.45, 0.55], [0.9, 0.75, 0.6], { color: YT.fur2 });
    blob(c, "fur", [0, 2.7, 1.0], [0.6, 0.55, 0.25], { color: YT.fur3 });
    for (const s of [1, -1]) {
      blob(c, "fur", [s * 1.1, 3.6, 0.05], [0.75, 0.62, 0.75], { color: YT.fur });
      iceCluster(c, [s * 1.15, 4.05, -0.25], [s * 0.4, 1, -0.5], 0.9, rng, 4);
      for (let i = 0; i < 4; i++) spike(c, "fur", [s * (0.5 + i * 0.25), 2.2 + (i % 2) * 0.3, -0.6 + i * 0.1], [s * 0.4, -1, -0.5], 0.18, 0.5, { color: i % 2 ? YT.fur3 : YT.fur2, seg: 5 });
    }
    iceCluster(c, [0, 3.9, -0.7], [0, 0.6, -1], 1.1, rng, 5);
    iceCluster(c, [0.4, 3.3, -0.95], [0.3, 0.2, -1], 0.6, rng, 3);
    yetiArm(c, 1, rng);
    yetiArm(c, -1, rng);
    yetiHead(c);
  });
}

function yetiIdle(c: IdleCtx) {
  // Heavy breathing that heaves its shoulders; shoulders rolling; knuckles flexing; the head glancing; a snort
  const breath = c.sin(1.1);
  c.add("chest", [0.03 * c.drift(0.3) + 0.02 * breath, 0.08 * c.drift(0.2, 1), 0.04 * c.drift(0.26, 2)], [0, 0.04 * breath, 0], 0.02 * breath);
  c.add("head", [0.06 * c.drift(0.45, 1) + 0.12 * c.event(1, 7, 1.2).e, 0.3 * c.glance(1, 5, 0.45), 0.06 * c.drift(0.32)]);
  c.add("jaw", [0.05 + 0.04 * breath + 0.2 * c.event(2, 6.5, 0.6).e, 0, 0]);
  c.add("armL", [0.06 * c.drift(0.4, 2) - 0.03 * breath, 0, -0.04 * c.drift(0.35)]);
  c.add("armR", [0.05 * c.drift(0.37) - 0.03 * breath, 0, 0.05 * c.drift(0.31, 1)]);
  c.add("foreL", [0.06 * c.drift(0.5, 3), 0, 0]);
  c.add("foreR", [0.05 * c.drift(0.46, 1), 0, 0]);
  const flex = c.event(3, 5.5, 0.7);
  c.add("fistR", [0.3 * flex.e, 0, 0.1 * flex.e]);
  c.add("fistL", [0.1 * c.drift(0.7), 0, -0.2 * c.event(4, 6.5, 0.6).e]);
}

const YT_DEF: BossHeroDef = {
  build: yeti,
  rest: { chest: { r: [0.05, 0.05, -0.02] }, head: { r: [-0.05, -0.08, 0.04] }, armL: { r: [0.1, 0, -0.06] }, armR: { r: [-0.04, 0, 0.08] }, foreL: { r: [0.3, 0, 0] }, foreR: { r: [0.15, 0, 0] }, fistL: { r: [0.15, 0, 0] } },
  idle: yetiIdle,
  roar: {
    len: 3.6,
    idle: 0.2,
    keys: [
      { t: 0, pose: {} },
      // Rears up and pounds its chest, left, right, then roars at the sky
      { t: 0.16, pose: { chest: { r: [-0.12, 0, 0] }, head: { r: [-0.2, 0, 0] }, armL: { r: [-1.1, 0, 0.35] }, armR: { r: [-1.25, 0, -0.45] }, foreL: { r: [-1.6, 0, 0] }, foreR: { r: [-1.1, 0, 0] } } },
      { t: 0.26, pose: { chest: { r: [-0.15, 0.06, 0] }, armL: { r: [-0.55, 0, 0.55] }, armR: { r: [-1.4, 0, -0.35] }, foreL: { r: [-1.9, 0, 0] }, foreR: { r: [-1.0, 0, 0] } } },
      { t: 0.36, pose: { chest: { r: [-0.15, -0.06, 0] }, armL: { r: [-1.4, 0, 0.35] }, armR: { r: [-0.55, 0, -0.55] }, foreL: { r: [-1.0, 0, 0] }, foreR: { r: [-1.9, 0, 0] } } },
      { t: 0.5, pose: { chest: { r: [-0.25, 0, 0], g: 1 }, head: { r: [-0.55, 0, 0], g: 1.5 }, jaw: { r: [0.6, 0, 0] }, armL: { r: [-0.4, 0, -0.9] }, armR: { r: [-0.4, 0, 0.9] }, foreL: { r: [-0.6, 0, 0] }, foreR: { r: [-0.6, 0, 0] } } },
      { t: 0.8, hold: true, pose: { chest: { r: [-0.22, 0.03, 0], g: 0.8 }, head: { r: [-0.5, 0.05, 0], g: 1.2 }, jaw: { r: [0.55, 0, 0] }, armL: { r: [-0.35, 0, -0.8] }, armR: { r: [-0.35, 0, 0.8] }, foreL: { r: [-0.5, 0, 0] }, foreR: { r: [-0.5, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [
      { u: 0.26, cine: { quake: 0.07, flash: 0.1, flashCol: "#e0f2fe" } },
      { u: 0.36, cine: { quake: 0.08, flash: 0.1, flashCol: "#e0f2fe" } },
      { u: 0.5, cine: { quake: 0.12, vig: 0.55, vigCol: "#082f49", lines: 0.8, flash: 0.22, flashCol: "#a5f3fc" } }
    ]
  },
  attack: {
    len: 2.6,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Both fists high over its head, leaning back
      { t: 0.32, pose: { chest: { r: [-0.2, 0, 0], p: [0, 0.1, 0] }, head: { r: [-0.1, 0, 0] }, jaw: { r: [0.3, 0, 0] }, armL: { r: [-2.7, 0, 0.35] }, armR: { r: [-2.75, 0, -0.35] }, foreL: { r: [-0.7, 0, 0] }, foreR: { r: [-0.7, 0, 0] } } },
      { t: 0.44, hold: true, pose: { chest: { r: [-0.24, 0, 0], p: [0, 0.12, 0] }, head: { r: [-0.15, 0, 0] }, jaw: { r: [0.45, 0, 0] }, armL: { r: [-2.9, 0, 0.3] }, armR: { r: [-2.95, 0, -0.3] }, foreL: { r: [-0.8, 0, 0] }, foreR: { r: [-0.8, 0, 0] } } },
      // The double hammer-blow down onto the ground ahead, ice bursting
      { t: 0.56, pose: { chest: { r: [0.45, 0, 0], p: [0, -0.15, 0.1], g: 0.8 }, head: { r: [0.1, 0, 0] }, jaw: { r: [0.5, 0, 0] }, armL: { r: [-0.6, 0, -0.15] }, armR: { r: [-0.6, 0, 0.15] }, foreL: { r: [0, 0, 0] }, foreR: { r: [0, 0, 0] }, fistL: { r: [0.3, 0, 0] }, fistR: { r: [0.3, 0, 0] } } },
      { t: 0.68, pose: { chest: { r: [0.5, 0, 0], p: [0, -0.18, 0.12] }, head: { r: [0.15, 0, 0] }, armL: { r: [-0.5, 0, -0.18] }, armR: { r: [-0.5, 0, 0.18] }, fistL: { r: [0.35, 0, 0] }, fistR: { r: [0.35, 0, 0] } } },
      { t: 0.86, hold: true, pose: { chest: { r: [0.12, 0, 0] }, armL: { r: [-0.15, 0, 0] }, armR: { r: [-0.15, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: { quake: 0.26, stop: 0.09, flash: 0.45, flashCol: "#e0f2fe", lines: 0.85, vig: 0.3, vigCol: "#082f49" } }]
  },
  lag: { foreL: 0.05, foreR: 0.05, fistL: 0.1, fistR: 0.1, head: 0.06, jaw: 0.04 },
  springs: { fistL: 90, fistR: 90 },
  burst: { at: [0, 0.4, 2.6], color: "#e0f2fe", count: 90, speed: 3.0, spread: 1.8, size: 0.24, gravity: 6 },
  aura: aura("#0284c7", "#e0f2fe", 2.9),
  height: 5,
  frame: [13, 6, 2.6],
  sparks: (c) => {
    // Snow blowing off the drift, frost glittering, its breath steaming
    c.spark(SPARK.smoke, [0, 0.3, 0], 10, { color: "#94a3b8", size: 0.7, speed: 0.12, rise: 1.2, reach: 1.8, spread: 4.2 });
    c.spark(SPARK.mote, [0, 1.0, 0], 26, { color: "#f0f9ff", size: 0.07, speed: 0.35, rise: 0.6, reach: 2.4, spread: 3.8 });
    c.spark(SPARK.smoke, [0, 3.55, 1.7], 6, { color: "#f1f5f9", size: 0.4, speed: 0.3, rise: 0.6, reach: 0.4, spread: 0.2 });
  }
};

/* ================================================================== */
/* Gorgon Stonecrusher                                                 */
/* ================================================================== */

const GG = {
  tail: "#2a4410",
  tail2: "#365314",
  belly: "#a3a07a",
  skin: "#7d8a6c",
  skin2: "#68745a",
  bronze: "#9a7330",
  bronze2: "#6f5222",
  snake: "#65a30d",
  snake2: "#4d7c0f",
  eye: "#a3e635",
  fang: "#f5f5f4",
  claw: "#1c1917",
  stone: "#8f8984",
  stone2: "#77716c",
  floor: "#57534e",
  floor2: "#44403c",
  maul: "#6b6560",
  haft: "#3b2a1e",
  rune: "#84cc16"
};

/** Where her tail lies coiled on the floor and rises to her waist */
const GG_TAIL: V3[] = [
  [1.65, 0.12, -1.15],
  [1.1, 0.2, -1.6],
  [0.15, 0.27, -1.55],
  [-0.85, 0.32, -0.95],
  [-1.2, 0.36, 0.15],
  [-0.65, 0.42, 0.95],
  [0.35, 0.48, 1.0],
  [0.8, 0.62, 0.2],
  [0.45, 1.05, -0.2],
  [0.05, 1.55, -0.05],
  [0, 2.0, 0.02]
];
const GG_RADII = [0.05, 0.12, 0.2, 0.27, 0.33, 0.37, 0.4, 0.4, 0.38, 0.35, 0.32];
const GG_SNAKES = 7;

/** A man turned to stone where he stood, shield up, sword half drawn */
function statue(c: BossCtx, at: V3, rotY: number, pose: number) {
  c.k.at(at, rotY, () => {
    const st = { color: GG.stone };
    c.k.add("matte", new THREE.CylinderGeometry(0.3, 0.34, 0.12, 10), [0, 0.06, 0], undefined, { color: GG.stone2 });
    for (const s of [1, -1]) seg(c, "matte", [s * 0.09, 0.12, 0], [s * 0.1, 0.68, 0.02], 0.065, 0.075, { ...st, seg: 7 });
    blob(c, "matte", [0, 0.8, 0], [0.17, 0.2, 0.12], st);
    blob(c, "matte", [0, 1.06, 0], [0.2, 0.17, 0.13], st);
    blob(c, "matte", [0, 1.32, 0.02], [0.1, 0.12, 0.11], st);
    c.k.add("matte", new THREE.SphereGeometry(0.12, 10, 6, 0, TAU, 0, Math.PI / 2), [0, 1.36, 0.02], undefined, { color: GG.stone2 });
    // Shield arm raised against her gaze, sword arm cocked
    seg(c, "matte", [-0.22, 1.12, 0], [-0.3, 1.0 + pose * 0.15, 0.2], 0.05, 0.045, { ...st, seg: 6 });
    c.k.add("matte", new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), [-0.32, 1.05 + pose * 0.15, 0.27], [Math.PI / 2 - 0.2, 0, 0.2], { color: GG.stone2 });
    seg(c, "matte", [0.22, 1.12, 0], [0.28, 0.85, 0.12], 0.05, 0.045, { ...st, seg: 6 });
    c.k.along("matte", [0.28, 0.8, 0.12], [0.3, 1.45 - pose * 0.2, 0.32], [0.05, 0.015], { color: GG.stone2 });
  });
}

function gorgonHead(c: BossCtx, rng: () => number) {
  c.bone("neck", [0, 3.45, 0.04], () => {
    seg(c, "skin", [0, 3.4, 0.04], [0, 3.72, 0.07], 0.13, 0.11, { color: GG.skin, seg: 9 });
    c.bone("head", [0, 3.7, 0.07], () => {
      blob(c, "skin", [0, 3.97, 0.08], [0.25, 0.3, 0.27], { color: GG.skin, wd: 16, hd: 12 });
      // A face of cold grey-green: high cheekbones, a brow ridge, burning eyes, a serpent's fangs
      for (const s of [1, -1]) {
        blob(c, "skin", [s * 0.13, 3.9, 0.24], [0.08, 0.05, 0.07], { color: GG.skin2 });
        blob(c, "skin", [s * 0.1, 4.04, 0.29], [0.08, 0.022, 0.04], { color: GG.skin2, rot: [0, 0, s * 0.3] });
        blob(c, "matte", [s * 0.095, 3.99, 0.28], [0.06, 0.04, 0.035], { color: "#141a10" });
        c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 2.4, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.034, 8, 6), [s * 0.095, 3.99, 0.31], undefined, { color: GG.eye, bright: 2.6, scale: [1.3, 0.7, 0.5] }));
        spike(c, "matte", [s * 0.05, 3.81, 0.29], [0, -1, 0.1], 0.012, 0.07, { color: GG.fang, seg: 4 });
      }
      spike(c, "skin", [0, 3.95, 0.33], [0, -0.4, 1], 0.03, 0.06, { color: GG.skin2, seg: 5 });
      c.bone("jaw", [0, 3.84, 0.15], () => blob(c, "skin", [0, 3.77, 0.23], [0.12, 0.06, 0.1], { color: GG.skin2 }));
      // A bronze diadem
      c.k.add("iron", new THREE.TorusGeometry(0.255, 0.025, 5, 20), [0, 4.12, 0.06], [Math.PI / 2 - 0.12, 0, 0], { color: GG.bronze });
      c.k.add("glow", new THREE.OctahedronGeometry(0.045), [0, 4.16, 0.32], undefined, { color: GG.eye, bright: 1.8, scale: [1, 1.4, 0.6] });
      // The crown of living snakes
      for (let k = 0; k < GG_SNAKES; k++) {
        const phi = -1.25 + (k / (GG_SNAKES - 1)) * 2.5;
        const base: V3 = [Math.sin(phi) * 0.2, 4.17 + Math.cos(phi) * 0.05, -0.04 - Math.cos(phi) * 0.08];
        c.k.frame(base, [-0.55 - Math.cos(phi) * 0.35, phi * 0.85 + Math.PI, 0], 1, () =>
          chainBones(
            c,
            `snake${k}_`,
            [0, 0, 0],
            [0.3, 0.28, 0.26],
            [-0.6 - rng() * 0.3, 0.05, 0.6],
            [0.07, 0.062, 0.052, 0.044],
            { bucket: "scales", color: k % 2 ? GG.snake : GG.snake2, seg: 6, surf: scalesRound(0.05, 0.05) },
            undefined,
            (at, dir) => {
              // Its head: a flattened wedge, glowing eyes, a forked tongue
              const d = new THREE.Vector3(...dir);
              const h = new THREE.Vector3(...at).addScaledVector(d, 0.06);
              blob(c, "scales", h.toArray() as V3, [0.085, 0.055, 0.12], { color: GG.snake2, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d) });
              for (const s of [1, -1]) c.k.add("glow", new THREE.SphereGeometry(0.014, 6, 4), [h.x + s * 0.04, h.y + 0.025, h.z + d.z * 0.03], undefined, { color: "#facc15", bright: 2 });
              c.k.along("glow", h.clone().addScaledVector(d, 0.08).toArray() as V3, h.clone().addScaledVector(d, 0.17).toArray() as V3, 0.008, { color: "#dc2626", bright: 1.2 });
            }
          )
        );
      }
    });
  });
}

function gorgon(c: BossCtx) {
  const rng = c.rng;
  c.k.frame([0, 0, 0], [0, 0, 0], 1.25, () => {
    // A floor of cracked flagstones, rubble, a broken column, men turned to stone
    c.k.add("matte", new THREE.CylinderGeometry(2.2, 2.28, 0.2, 32), [0, 0.1, 0], undefined, { color: GG.floor, surf: ASHLAR });
    c.k.add("rock", rubble(0.28, 3), [-1.6, 0.25, 1.2], undefined, { color: GG.floor2 });
    c.k.add("rock", rubble(0.22, 4), [1.75, 0.22, 0.6], undefined, { color: GG.stone2 });
    c.k.add("matte", new THREE.CylinderGeometry(0.2, 0.22, 1.3, 12), [-1.55, 0.85, -1.2], undefined, { color: GG.stone, surf: ashlarRound(0.21) });
    c.k.add("rock", rubble(0.24, 8), [-1.52, 1.56, -1.2], undefined, { color: GG.stone });
    c.k.add("matte", new THREE.CylinderGeometry(0.2, 0.2, 0.8, 12), [-0.9, 0.38, -1.75], [Math.PI / 2, 0.8, 0], { color: GG.stone, surf: ashlarRound(0.2) });
    statue(c, [1.55, 0.2, 1.15], -0.6, 1);
    statue(c, [-1.7, 0.2, 0.35], 0.9, -1);
    // The tip of her tail, flicking on the floor
    pathBones(c, "tip", [GG_TAIL[2], GG_TAIL[1], GG_TAIL[0]], [GG_RADII[2], GG_RADII[1], GG_RADII[0]], { bucket: "scales", color: GG.tail, seg: 10, surf: scalesRound(0.2, 0.09) });
    // Her tail coiled on the floor, rising to her waist
    pathBones(
      c,
      "tail",
      GG_TAIL.slice(2),
      GG_RADII.slice(2),
      { bucket: "scales", color: GG.tail, seg: 12, surf: scalesRound(0.3, 0.09) },
      (j, from, to, r0) => {
        // A paler belly along the underside, a ridge of scales down the back
        const m = mid(from, to);
        if (j < GG_N - 3) plate(c, "scales", [m[0], m[1] - r0 * 0.55, m[2]], [0, -1, 0], [to[0] - from[0], to[1] - from[1], to[2] - from[2]], r0 * 0.75, r0 * 0.3, Math.hypot(to[0] - from[0], to[2] - from[2]) * 0.5, { color: GG.belly });
        spike(c, "scales", [m[0], m[1] + r0 * 0.85, m[2]], [0, 1, 0], r0 * 0.18, r0 * 0.5, { color: GG.tail2, seg: 4 });
      },
      () => {
        c.bone("chest", [0, 2.05, 0.02], () => {
          // Hips in scales, a woman's torso of grey-green skin under bronze
          blob(c, "scales", [0, 2.08, 0.02], [0.36, 0.26, 0.3], { color: GG.tail2, surf: scalesRound(0.35, 0.08) });
          seg(c, "skin", [0, 2.1, 0.02], [0, 2.75, 0.05], 0.3, 0.27, { color: GG.skin, seg: 12 });
          blob(c, "skin", [0, 2.95, 0.05], [0.42, 0.42, 0.3], { color: GG.skin, wd: 16, hd: 12 });
          c.k.add("iron", new THREE.TorusGeometry(0.3, 0.05, 6, 20), [0, 2.32, 0.02], [Math.PI / 2, 0, 0], { color: GG.bronze });
          // A bronze cuirass over her breast, a green stone set in it
          blob(c, "iron", [0, 2.92, 0.12], [0.44, 0.38, 0.28], { color: GG.bronze, wd: 16, hd: 10 });
          c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.8 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.07), [0, 3.0, 0.36], undefined, { color: GG.eye, bright: 1.8, scale: [1, 1.3, 0.6] }));
          for (const s of [1, -1]) {
            // Pauldrons with a spike each
            blob(c, "iron", [s * 0.52, 3.3, 0.02], [0.24, 0.17, 0.24], { color: GG.bronze2 });
            spike(c, "iron", [s * 0.6, 3.42, 0.02], [s * 0.5, 1, 0], 0.05, 0.28, { color: GG.bronze, seg: 6 });
          }
          gorgonMaulArm(c);
          gorgonClawArm(c);
          gorgonHead(c, rng);
        });
      }
    );
  });
}

function gorgonMaulArm(c: BossCtx) {
  const sh: V3 = [0.55, 3.25, 0.03];
  const el: V3 = [0.8, 2.68, 0.3];
  const wr: V3 = [0.88, 2.28, 0.82];
  c.bone("armR", sh, () => {
    seg(c, "skin", sh, el, 0.13, 0.11, { color: GG.skin, seg: 9 });
    c.bone("foreR", el, () => {
      seg(c, "skin", el, wr, 0.11, 0.09, { color: GG.skin, seg: 9 });
      c.k.add("iron", new THREE.CylinderGeometry(0.11, 0.12, 0.22, 10), mid(el, wr, 0.6), undefined, { color: GG.bronze, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]).normalize()) });
      c.bone("handR", wr, () => {
        blob(c, "skin", [wr[0], wr[1] - 0.02, wr[2] + 0.03], [0.1, 0.11, 0.1], { color: GG.skin2 });
        // The stone maul: a bound haft through her fist, a head of dressed stone banded in bronze, a rune glowing on its face
        // The haft leans out from her side, so the head stands clear of her crown
        const tilt = 0.42;
        const bottom: V3 = [wr[0] - 0.3, wr[1] - 0.62, wr[2] - 0.04];
        const top: V3 = [wr[0] + Math.sin(tilt) * 1.75, wr[1] + Math.cos(tilt) * 1.75, wr[2] + 0.12];
        c.k.along("matte", bottom, top, 0.075, { color: GG.haft });
        for (let i = 0; i < 3; i++) c.k.add("iron", new THREE.TorusGeometry(0.085, 0.02, 4, 10), mid(bottom, top, 0.1 + i * 0.035), [Math.PI / 2, 0, -tilt], { color: GG.bronze2 });
        c.k.frame(top, [0, 0, -tilt], 1, () => {
          c.k.add("matte", new THREE.BoxGeometry(0.62, 0.55, 1.0), [0, 0.2, 0], undefined, { color: GG.maul, surf: ASHLAR });
          for (const z of [-0.34, 0.34]) c.k.add("iron", new THREE.BoxGeometry(0.7, 0.63, 0.08), [0, 0.2, z], undefined, { color: GG.bronze });
          c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 2.0 }, () => c.k.add("glow", new THREE.BoxGeometry(0.3, 0.3, 0.04), [0, 0.2, 0.53], [0, 0, Math.PI / 4], { color: GG.rune, bright: 1.7 }));
        });
      });
    });
  });
}

function gorgonClawArm(c: BossCtx) {
  const sh: V3 = [-0.55, 3.25, 0.03];
  const el: V3 = [-0.88, 2.82, 0.36];
  const wr: V3 = [-1.0, 2.58, 0.86];
  c.bone("armL", sh, () => {
    seg(c, "skin", sh, el, 0.13, 0.11, { color: GG.skin, seg: 9 });
    c.bone("foreL", el, () => {
      seg(c, "skin", el, wr, 0.11, 0.08, { color: GG.skin, seg: 9 });
      c.k.add("iron", new THREE.CylinderGeometry(0.105, 0.115, 0.2, 10), mid(el, wr, 0.6), undefined, { color: GG.bronze, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]).normalize()) });
      c.bone("handL", wr, () => {
        blob(c, "skin", [wr[0], wr[1], wr[2] + 0.06], [0.09, 0.06, 0.11], { color: GG.skin2 });
        // Long black claws, half curled
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * 0.05;
          hook(c, "gloss", [wr[0] + x, wr[1] - 0.03, wr[2] + 0.15], [x * 2, -0.3, 1], [0, -0.25, -0.05], 0.025, 0.3 - Math.abs(i - 1.5) * 0.04, 4, { color: GG.claw });
        }
        hook(c, "gloss", [wr[0] + 0.08, wr[1], wr[2] + 0.06], [0.6, -0.3, 0.6], [0, -0.15, 0], 0.022, 0.18, 3, { color: GG.claw });
      });
    });
  });
}

const GG_N = GG_TAIL.length - 3;
const ggSnakes = (f: (k: number, j: number) => BonePose | null): Pose => merge(...Array.from({ length: GG_SNAKES }, (_, k) => chainPose(`snake${k}_`, 3, (j) => f(k, j))));
const ggRise = (f: (j: number) => BonePose | null): Pose => chainPose("tail", GG_N, (j) => (j >= GG_N - 3 ? f(j) : null));

function gorgonIdle(c: IdleCtx) {
  // The snakes writhe, each on its own; she sways on her coils in a slow S; the head glances; the claws flex
  const breath = c.sin(1.2);
  for (let j = GG_N - 3; j < GG_N; j++) c.add(`tail${j}`, [0.03 * Math.sin(c.t * 0.6 - j * 0.6), 0.04 * Math.sin(c.t * 0.45 - j * 0.7 + 1), 0.035 * Math.sin(c.t * 0.5 - j * 0.8)]);
  const flick = c.event(1, 5, 0.6);
  c.add("tip0", [0, 0.12 * c.drift(0.8) + 0.25 * flick.e, 0]);
  c.add("tip1", [0, 0.18 * c.drift(0.7, 1) + 0.4 * flick.e, 0]);
  c.add("chest", [0.03 * c.drift(0.4), 0.06 * c.drift(0.3, 2), 0.03 * c.drift(0.35, 1)], [0, 0.02 * breath, 0], 0.015 * breath);
  c.add("neck", [0.04 * c.drift(0.5), 0.12 * c.glance(1, 4.5, 0.35), 0]);
  c.add("head", [0.06 * c.drift(0.45, 2), 0.18 * c.glance(2, 3.8, 0.3), 0.1 * c.drift(0.3)]);
  c.add("jaw", [0.08 * Math.max(0, c.sin(0.7)), 0, 0]);
  for (let k = 0; k < GG_SNAKES; k++)
    for (let j = 0; j < 3; j++) c.add(`snake${k}_${j}`, [0.25 * Math.sin(c.t * (1.6 + k * 0.17) - j * 1.1 + k * 2.3), 0.3 * Math.sin(c.t * (1.3 + k * 0.13) - j * 0.9 + k * 1.1), 0]);
  const flex = c.event(3, 5, 0.8);
  c.add("handL", [0.3 * flex.e, 0, 0]);
  c.add("armL", [0.06 * c.drift(0.5, 1), 0, -0.05 * c.drift(0.4)]);
  c.add("armR", [0.04 * c.drift(0.45, 3), 0, 0.03 * c.drift(0.36)]);
}

const GG_DEF: BossHeroDef = {
  build: gorgon,
  rest: { chest: { r: [0.04, -0.08, 0.04] }, head: { r: [0.06, 0.1, -0.06] }, armL: { r: [0.1, 0, -0.1] }, foreL: { r: [0.2, 0, 0] }, handL: { r: [0.15, 0, 0.1] }, armR: { r: [0.05, 0, 0.04] } },
  idle: gorgonIdle,
  roar: {
    len: 3.2,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, hold: true, pose: merge(ggRise(() => ({ r: [0.04, 0, 0] })), { chest: { r: [0.15, 0, 0] }, head: { r: [0.15, 0, 0] } }, ggSnakes(() => ({ r: [0.2, 0, 0] }))) },
      // The hiss: she rears high on her coils, the snakes flaring out round her head, the jaw dropped, eyes blazing
      {
        t: 0.42,
        pose: merge(
          ggRise(() => ({ r: [-0.08, 0, 0], g: 0.6 })),
          { chest: { r: [-0.22, 0, 0], g: 1 }, neck: { r: [-0.1, 0, 0] }, head: { r: [-0.25, 0, 0], g: 1.6 }, jaw: { r: [0.6, 0, 0] }, armL: { r: [-0.6, 0, -0.9] }, foreL: { r: [-0.4, 0, 0] }, handL: { r: [-0.5, 0, 0] }, armR: { r: [-0.3, 0, 0.4] } },
          ggSnakes((k, j) => ({ r: [j === 0 ? -0.5 : -0.2, 0, 0], g: 1 }))
        )
      },
      { t: 0.74, hold: true, pose: merge(ggRise(() => ({ r: [-0.07, 0, 0] })), { chest: { r: [-0.2, 0.04, 0], g: 0.8 }, neck: { r: [-0.08, 0, 0] }, head: { r: [-0.22, 0, 0], g: 1.2 }, jaw: { r: [0.55, 0, 0] }, armL: { r: [-0.55, 0, -0.8] }, foreL: { r: [-0.35, 0, 0] }, handL: { r: [-0.45, 0, 0] }, armR: { r: [-0.25, 0, 0.35] } }, ggSnakes((k, j) => ({ r: [j === 0 ? -0.45 : -0.15, 0, 0] }))) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.08, vig: 0.6, vigCol: "#1a2e05", lines: 0.85, flash: 0.25, flashCol: "#d9f99d" } }]
  },
  attack: {
    len: 2.6,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // The maul swings up and back over her shoulder, her body coiling back on the tail
      { t: 0.32, pose: merge(ggRise(() => ({ r: [-0.07, 0.03, 0] })), { chest: { r: [-0.2, 0.25, 0] }, head: { r: [0.1, -0.2, 0] }, armR: { r: [-1.1, 0, 0.3] }, foreR: { r: [-0.5, 0, 0] }, handR: { r: [1.3, 0, 0] }, armL: { r: [0.3, 0, -0.3] } }) },
      { t: 0.44, hold: true, pose: merge(ggRise(() => ({ r: [-0.08, 0.04, 0] })), { chest: { r: [-0.24, 0.3, 0] }, head: { r: [0.12, -0.25, 0] }, jaw: { r: [0.3, 0, 0] }, armR: { r: [-1.3, 0, 0.35] }, foreR: { r: [-0.6, 0, 0] }, handR: { r: [1.55, 0, 0] }, armL: { r: [0.35, 0, -0.35] } }) },
      // The blow: the maul comes over and down on the ground ahead, her whole body following it
      { t: 0.56, pose: merge(ggRise(() => ({ r: [0.17, -0.02, 0] })), { chest: { r: [0.52, -0.1, 0], g: 0.6 }, head: { r: [-0.15, 0.1, 0] }, armR: { r: [-1.4, 0, -0.05] }, foreR: { r: [0.75, 0, 0] }, handR: { r: [2.6, 0, 0] }, armL: { r: [-0.3, 0, -0.5] } }) },
      { t: 0.68, pose: merge(ggRise(() => ({ r: [0.19, -0.02, 0] })), { chest: { r: [0.56, -0.12, 0] }, head: { r: [-0.18, 0.1, 0] }, armR: { r: [-1.3, 0, -0.05] }, foreR: { r: [0.8, 0, 0] }, handR: { r: [2.75, 0, 0] }, armL: { r: [-0.35, 0, -0.5] } }) },
      { t: 0.86, hold: true, pose: merge(ggRise(() => ({ r: [0.04, 0, 0] })), { chest: { r: [0.12, 0, 0] }, armR: { r: [-0.2, 0, 0] }, foreR: { r: [0.1, 0, 0] }, handR: { r: [0.3, 0, 0] } }) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: { quake: 0.24, stop: 0.09, flash: 0.42, flashCol: "#ecfccb", lines: 0.85, vig: 0.3, vigCol: "#1a2e05" } }]
  },
  lag: { ...chainLag("tail", GG_N, 0.012), chest: 0.03, armR: 0.03, foreR: 0.05, handR: 0.07, foreL: 0.05, handL: 0.09, neck: 0.05, head: 0.08, ...Object.assign({}, ...Array.from({ length: GG_SNAKES }, (_, k) => chainLag(`snake${k}_`, 3, 0.05, 0.1))) },
  springs: { ...Object.assign({}, ...Array.from({ length: GG_SNAKES }, (_, k) => chainSprings(`snake${k}_`, 3, 60, 1))), handL: 90 },
  burst: { at: [1.2, 0.4, 2.6], color: "#d6d3d1", count: 90, speed: 3.0, spread: 1.6, size: 0.24, gravity: 6 },
  aura: aura("#65a30d", "#ecfccb", 2.9),
  height: 5.6,
  frame: [14, 6.5, 2.8],
  sparks: (c) => {
    // Stone dust settling over the floor, green motes of her gaze, a mist round the coils
    c.spark(SPARK.smoke, [0, 0.3, 0], 10, { color: "#78716c", size: 0.7, speed: 0.1, rise: 1.0, reach: 1.8, spread: 4.0 });
    c.spark(SPARK.mote, [0, 1.2, 0], 20, { color: "#bef264", size: 0.07, speed: 0.3, rise: 0.6, reach: 2.2, spread: 3.4 });
    c.spark(SPARK.wisp, [0, 5.3, 0.1], 12, { color: "#a3e635", size: 0.1, speed: 0.1, rise: 0.8, reach: 0.9, spread: 0.6 });
  }
};

export const LAND_BOSSES: Record<string, BossHeroDef> = {
  "boss-treant": TR_DEF,
  "boss-wolf": WF_DEF,
  "boss-yeti": YT_DEF,
  "boss-gorgon": GG_DEF
};

