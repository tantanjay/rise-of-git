import * as THREE from "three";
import { MOVE, PartOpts, TAU, V3, dirXZ, facing, hash3 } from "./heroKit";
import { ASHLAR, SPARK, ashlarRound, grainRound, ore, runeBand, runeColumn, veins } from "./heroMaterials";
import { HeroCtx, chain, flag } from "./heroLandmarks";

/* ------------------------------------------------------------------------- */
/* The three legendary sites as hand-built heroes (high graphics)             */
/* ------------------------------------------------------------------------- */

/*
 * The legendary resource nodes and the legendary treasure, each built round the kit's current origin at the size of
 * its Normal model (the map places it at the legendary rarity scale), facing +z. Structures don't breathe: they live
 * through their parts (lava, crystals, wheels, lids, banners), every motion on the GPU (`Kit.move`).
 */

const UP = new THREE.Vector3(0, 1, 0);

/** A jagged lump of rock: a dodecahedron with every corner pushed out or in */
function crag(radius: number, seed: number): THREE.BufferGeometry {
  // A polyhedron comes unindexed: every face its own corners, so the facets stay flat
  const g = new THREE.DodecahedronGeometry(radius, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(0.72 + hash3(v.x, v.y, v.z, seed) * 0.5);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A craggy cone of rock (sides pushed in and out, flat facets), its foot kept flat on the ground */
function craggyCone(rTop: number, rBottom: number, h: number, seg: number, rows: number, amount: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, rows).toNonIndexed();
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.abs(y + h / 2) < 1e-4) continue;
    const len = Math.hypot(x, z);
    const push = (hash3(x, y, z, seed) - 0.5) * 2 * amount;
    const k = len > 1e-4 ? (len + push) / len : 1;
    pos.setXYZ(i, x * k, Math.abs(y - h / 2) < 1e-4 ? y : y + (hash3(x, y, z, seed + 7) - 0.5) * amount * 0.7, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A crystal: a six-sided prism with a pointed tip, from `base` along `dir` */
function crystal(c: HeroCtx, bucket: string, base: V3, dir: V3, r: number, len: number, o: PartOpts) {
  const d = new THREE.Vector3(...dir).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, d);
  const body = len * 0.72;
  const tip = len - body;
  const at = (s: number): V3 => [base[0] + d.x * s, base[1] + d.y * s, base[2] + d.z * s];
  c.k.add(bucket, new THREE.CylinderGeometry(r, r * 1.08, body, 6), at(body / 2), undefined, { ...o, quat });
  c.k.add(bucket, new THREE.ConeGeometry(r, tip, 6), at(body + tip / 2), undefined, { ...o, quat });
}

/** A flat strip laid from one point to another, `w` wide across `side`, `d` thick (lava on a slope, a plank) */
function strip(c: HeroCtx, bucket: string, from: V3, to: V3, w: number, d: number, side: V3, o: PartOpts) {
  const a = new THREE.Vector3(...from);
  const y = new THREE.Vector3(...to).sub(a);
  const len = y.length();
  y.normalize();
  const x = new THREE.Vector3(...side);
  x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const mid = a.addScaledVector(y, len / 2);
  c.k.add(bucket, new THREE.BoxGeometry(w, len, d), [mid.x, mid.y, mid.z], undefined, { ...o, quat });
}

/** A chain of iron links hanging from one point to another, sagging `sag` in the middle */
function links(c: HeroCtx, from: V3, to: V3, n: number, r: number, sag: number, color: string) {
  const p = (t: number) => new THREE.Vector3(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t - sag * 4 * t * (1 - t), from[2] + (to[2] - from[2]) * t);
  const link = new THREE.TorusGeometry(r, r * 0.3, 4, 8);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const dir = p(Math.min(1, t + 0.01)).sub(p(Math.max(0, t - 0.01))).normalize();
    // Each link lies along the chain, every other one turned a quarter about it
    const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i % 2) * (Math.PI / 2), 0)));
    const at = p(t);
    c.k.add("iron", link, [at.x, at.y, at.z], undefined, { color, quat, scale: [1, 1.7, 1] });
  }
}

/** A coin lying flat (tilted a little) */
export function coin(c: HeroCtx, at: V3, tilt: number, spin: number, color = "#f2c14e") {
  c.k.add("gold", new THREE.CylinderGeometry(0.065, 0.065, 0.02, 10), at, [tilt, spin, tilt * 0.6], { color });
}

/** A cut gem (glossy) */
export function gem(c: HeroCtx, at: V3, r: number, color: string, rot: V3 = [0, 0, 0]) {
  c.k.add("gloss", new THREE.OctahedronGeometry(r, 0), at, rot, { color, scale: [1, 1.3, 1] });
}

/** A royal crown, its band's foot at `at`, `s` its size (a band 0.67 across at 1): points with pearls, gems, a velvet cap and a cross */
export function crown(c: HeroCtx, at: V3, s: number, gold: string, velvet: string) {
  const { k } = c;
  k.frame(at, [0, 0, 0], s, () => {
    const band = [new THREE.Vector2(0.3, 0), new THREE.Vector2(0.335, 0), new THREE.Vector2(0.335, 0.16), new THREE.Vector2(0.3, 0.16), new THREE.Vector2(0.3, 0)];
    k.add("gold", new THREE.LatheGeometry(band, 20), [0, 0, 0], undefined, { color: gold });
    for (let i = 0; i < 8; i++) {
      const [x, z] = dirXZ((i / 8) * TAU, 0.318);
      k.add("gold", new THREE.ConeGeometry(0.055, 0.22, 4), [x, 0.27, z], [0, -(i / 8) * TAU, 0], { color: gold });
      k.add("glow", new THREE.OctahedronGeometry(0.035, 0), [x, 0.4, z], undefined, { color: "#fff7e6", bright: 1.3 });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + TAU / 16;
      const [x, z] = dirXZ(a, 0.36);
      gem(c, [x, 0.08, z], 0.05, i % 2 ? "#2563eb" : "#dc2626", [0, -a, Math.PI / 2]);
    }
    k.add("cloth", new THREE.SphereGeometry(0.3, 12, 5, 0, TAU, 0, Math.PI / 2), [0, 0.12, 0], undefined, { color: velvet, scale: [1, 0.75, 1] });
    k.add("gold", new THREE.SphereGeometry(0.05, 8, 6), [0, 0.4, 0], undefined, { color: gold });
    k.add("gold", new THREE.BoxGeometry(0.03, 0.14, 0.03), [0, 0.5, 0], undefined, { color: gold });
    k.add("gold", new THREE.BoxGeometry(0.1, 0.03, 0.03), [0, 0.52, 0], undefined, { color: gold });
  });
}

/* ================================================================== */
/* The Volcanic Dragonstone Core                                       */
/* ================================================================== */

const DS = { rock: "#2b2420", rock2: "#3b302a", crust: "#1c1512", lava: "#ff6a12", ruby: "#7f1d1d", ruby2: "#991b1b", bone: "#e6dcc8", bone2: "#cbbd9f", dark: "#140c08", iron: "#2f2d33" };
/** The crater floor (the lava lake) */
const LAKE = 2.0;

/** The volcano's radius at height `y` (the lower slope, then the cone) */
const slopeR = (y: number) => Math.max(y <= 1.1 ? 2.55 - 0.95 * (y / 1.1) : 0, y >= 1.0 ? 1.72 - 0.74 * ((y - 1.0) / 0.95) : 0);
/** The height of the slope at radius `r` from the vent */
const slopeY = (r: number) => (r >= 1.65 ? Math.max(0, ((2.55 - r) * 1.1) / 0.95) : Math.min(1.95, 1.0 + ((1.72 - r) * 0.95) / 0.74));

/** A dragon's skull, half buried: cranium, brows, a long snout full of teeth, the jaw dropped open, horns sweeping back, fire in its sockets */
function dragonSkull(c: HeroCtx) {
  const { k } = c;
  k.add("matte", new THREE.SphereGeometry(0.42, 12, 8), [0, 0.12, -0.15], undefined, { color: DS.bone, scale: [1, 0.8, 1.15] });
  for (const s of [-1, 1]) {
    k.add("matte", new THREE.BoxGeometry(0.3, 0.1, 0.2), [s * 0.17, 0.33, 0.18], [0.15, 0, s * 0.28], { color: DS.bone2 });
    k.add("matte", new THREE.BoxGeometry(0.12, 0.16, 0.32), [s * 0.34, 0.02, 0.04], [0, s * 0.2, 0], { color: DS.bone2 });
    // The socket, a fire still burning in it
    k.add("matte", new THREE.SphereGeometry(0.11, 8, 6), [s * 0.18, 0.19, 0.25], undefined, { color: DS.dark });
    k.move({ kind: MOVE.pulse, amp: 0.35, speed: 2.8, phase: s }, () => {
      k.add("glow", new THREE.SphereGeometry(0.065, 8, 6), [s * 0.18, 0.19, 0.31], undefined, { color: "#ff7a1a", bright: 2.0 });
    });
    k.add("matte", new THREE.SphereGeometry(0.03, 5, 4), [s * 0.05, 0.08, 0.93], undefined, { color: DS.dark });
    // Upper teeth down the snout, the lower jaw dropped open with its own
    for (let t = 0; t < 5; t++) {
      const z = 0.3 + t * 0.12;
      k.add("matte", new THREE.ConeGeometry(0.03, 0.15 - t * 0.012, 5), [s * (0.19 - t * 0.022), -0.12, z], [Math.PI, 0, 0], { color: "#f4ede0" });
    }
    k.along("matte", [s * 0.27, -0.05, -0.08], [s * 0.12, -0.3, 0.72], 0.07, { color: DS.bone2 });
    for (let t = 0; t < 3; t++) k.add("matte", new THREE.ConeGeometry(0.025, 0.1, 5), [s * (0.21 - t * 0.04), -0.2 - t * 0.04, 0.25 + t * 0.16], undefined, { color: "#f4ede0" });
    // Horns sweeping back off the crown
    chain(c, "matte", [[s * 0.26, 0.36, -0.28], [s * 0.42, 0.52, -0.66], [s * 0.47, 0.6, -1.06], [s * 0.4, 0.5, -1.38]], 0.1, 0.03, { color: DS.bone2, seg: 7 });
  }
  // The snout, tapering to the nose
  k.add("matte", new THREE.CylinderGeometry(0.12, 0.27, 0.92, 6), [0, 0.02, 0.5], [Math.PI / 2, 0, 0], { color: DS.bone, scale: [1, 1, 0.65] });
}

/** The volcano a size down from the slopes it is laid out on, so it stands inside its ground ring */
function dragonstoneCore(c: HeroCtx) {
  c.k.frame([0, 0, 0], [0, 0, 0], 0.92, () => dragonstoneSlopes(c));
}

function dragonstoneSlopes(c: HeroCtx) {
  const { k, rng } = c;
  // The volcano: craggy basalt in strata with molten veins, the lower slope and the cone over it, a jagged rim round the lake
  k.add("rock", craggyCone(1.6, 2.55, 1.1, 22, 3, 0.09, 31), [0, 0.55, 0], undefined, { color: DS.rock, surf: veins(0.6) });
  k.add("rock", craggyCone(0.98, 1.72, 0.95, 20, 3, 0.08, 32), [0, 1.475, 0], undefined, { color: DS.rock2, surf: veins(0.95) });
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * TAU + rng() * 0.2;
    const [x, z] = dirXZ(a, 0.98 + rng() * 0.08);
    k.add("rock", crag(0.22 + rng() * 0.12, 60 + i), [x, LAKE - 0.02 + rng() * 0.08, z], [0, rng() * TAU, 0], { color: i % 2 ? DS.rock : DS.rock2, surf: veins(0.5), scale: [1, 1.25 + rng() * 0.5, 1] });
  }

  // The lava lake, dark plates of crust drifting round on it
  k.move({ kind: MOVE.pulse, amp: 0.2, speed: 1.4 }, () => {
    k.add("glow", new THREE.CircleGeometry(0.92, 24), [0, LAKE, 0], [-Math.PI / 2, 0, 0], { color: DS.lava, bright: 1.5 });
  });
  k.move({ kind: MOVE.spin, pivot: [0, 0, 0], axis: [0, 1, 0], speed: 0.12, amp: 0.012 }, () => {
    for (let i = 0; i < 5; i++) {
      const [x, z] = dirXZ((i / 5) * TAU + 0.4, 0.62 + (i % 2) * 0.1);
      k.add("matte", new THREE.CylinderGeometry(0.13 + rng() * 0.07, 0.15 + rng() * 0.07, 0.05, 6), [x, LAKE + 0.03, z], [0, rng() * TAU, 0], { color: DS.crust });
    }
  });

  // The dragonstone heart: a glowing crystal out of the lake in a cluster of dark ruby shards, beating; a white-hot well at its foot
  k.move({ kind: MOVE.beat, pivot: [0, LAKE, 0], amp: 0.07, speed: 2.4 }, () => {
    crystal(c, "glow", [0, LAKE - 0.1, 0], [0, 1, 0], 0.3, 2.2, { color: "#ff3b2f", bright: 1.6 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3;
      const [x, z] = dirXZ(a, 0.22 + (i % 3) * 0.08);
      const lean = 0.25 + (i % 3) * 0.12;
      const [dx, dz] = dirXZ(a, Math.sin(lean));
      const glow = i % 3 === 1;
      crystal(c, glow ? "glow" : "gloss", [x, LAKE - 0.05, z], [dx, Math.cos(lean), dz], 0.12 + (i % 2) * 0.06, 0.7 + ((i * 5) % 7) * 0.09, glow ? { color: "#f87171", bright: 1.5 } : { color: i % 2 ? DS.ruby : DS.ruby2 });
    }
    k.add("iron", new THREE.TorusGeometry(0.34, 0.05, 6, 16), [0, LAKE + 0.85, 0], [Math.PI / 2, 0, 0], { color: DS.iron });
  });
  k.add("glow", new THREE.SphereGeometry(0.52, 14, 4, 0, TAU, 0, Math.PI / 2), [0, LAKE, 0], undefined, { color: "#ffe2a0", bright: 2.0, scale: [1, 0.3, 1] });
  c.spark(SPARK.flame, [0, LAKE + 0.05, 0], 14, { color: "#ffd27a", size: 0.3, speed: 1.3, rise: 0.6, spread: 1.0 });

  // The miners' claim: iron stakes on the rim, chains running up to a collar on the heart
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const [x, z] = dirXZ(a, 1.08);
    const [tx, tz] = dirXZ(a, 1.25);
    k.along("iron", [x, LAKE - 0.15, z], [tx, LAKE + 0.5, tz], 0.07, { color: DS.iron });
    k.add("iron", new THREE.TorusGeometry(0.07, 0.022, 4, 10), [tx, LAKE + 0.55, tz], [0, -a, 0], { color: "#4a4850" });
    const [cx, cz] = dirXZ(a, 0.38);
    links(c, [tx, LAKE + 0.55, tz], [cx, LAKE + 0.85, cz], 9, 0.05, 0.14, "#3d3b42");
  }

  // Shards wheeling round the heart, bobbing as they go
  k.move({ kind: MOVE.spin, pivot: [0, 0, 0], axis: [0, 1, 0], speed: 0.55, amp: 0.2 }, () => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const [x, z] = dirXZ(a, 1.8);
      crystal(c, "glow", [x, LAKE + 0.9 + (i % 2) * 0.5, z], [Math.cos(a + 1) * 0.3, 1, Math.sin(a + 1) * 0.3], 0.07, 0.45, { color: "#f87171", bright: 1.5 });
    }
  });

  // Lava flows winding down the slopes in channels of rock, pooling at the foot
  const flows = [1.0, 2.85, 4.05, 5.45];
  flows.forEach((a0, f) => {
    const pts: V3[] = [];
    const n = 7;
    for (let s = 0; s <= n; s++) {
      const y = LAKE - 0.08 - (s / n) * (LAKE - 0.08);
      const a = a0 + Math.sin(s * 1.7 + f * 2.3) * 0.12 * (s / n);
      const [x, z] = dirXZ(a, slopeR(y) + 0.08);
      pts.push([x, y, z]);
    }
    for (let s = 0; s < n; s++) {
      const am = a0 + Math.sin((s + 0.5) * 1.7 + f * 2.3) * 0.12 * ((s + 0.5) / n);
      const side: V3 = [-Math.sin(am), 0, Math.cos(am)];
      k.move({ kind: MOVE.pulse, amp: 0.22, speed: 1.8, phase: f * 1.6 + s * 0.5 }, () => {
        strip(c, "glow", pts[s], pts[s + 1], 0.24 - s * 0.008, 0.08, side, { color: s < 3 ? "#ff8a24" : DS.lava, bright: 1.7 });
      });
      // The channel's banks either side
      for (const sd of [-1, 1]) {
        const off = (p: V3): V3 => [p[0] + side[0] * sd * 0.18, p[1] + 0.02, p[2] + side[2] * sd * 0.18];
        k.along("rock", off(pts[s]), off(pts[s + 1]), 0, { geo: new THREE.CylinderGeometry(0.055, 0.07, 1, 5), color: DS.crust });
      }
    }
    const end = pts[n];
    k.move({ kind: MOVE.pulse, amp: 0.25, speed: 1.6, phase: f }, () => {
      k.add("glow", new THREE.SphereGeometry(0.42, 12, 4, 0, TAU, 0, Math.PI / 2), [end[0], 0, end[2]], undefined, { color: "#ff7a1a", bright: 1.6, scale: [1, 0.22, 1] });
    });
    for (let r = 0; r < 3; r++) {
      const [ox, oz] = dirXZ(rng() * TAU, 0.42);
      k.add("rock", crag(0.12 + rng() * 0.06, 80 + f * 3 + r), [end[0] + ox, 0.05, end[2] + oz], undefined, { color: DS.crust });
    }
    c.spark(SPARK.ember, [end[0], 0.1, end[2]], 6, { color: "#ffab4a", size: 0.09, speed: 0.6, rise: 1.4, reach: 0.4 });
  });

  // Basalt columns in clusters round the foot, between the flows
  const clusters = [0.25, 1.5, 3.45, 4.75];
  clusters.forEach((a0, cl) => {
    for (let i = 0; i < 5; i++) {
      const a = a0 + (i - 2) * 0.11;
      const [x, z] = dirXZ(a, 2.55 + (i % 2) * 0.22);
      const h = 0.34 + ((i * 3 + cl) % 5) * 0.12;
      k.add("matte", new THREE.CylinderGeometry(0.15 + (i % 3) * 0.03, 0.17 + (i % 3) * 0.03, h, 6), [x, h / 2, z], [0, a, 0], { color: i % 2 ? "#2e2724" : "#3a312c" });
    }
  });
  for (let i = 0; i < 9; i++) {
    const [x, z] = dirXZ(clusters[i % 4] + (rng() - 0.5) * 0.7, 2.4 + rng() * 0.45);
    k.add("rock", crag(0.1 + rng() * 0.1, 120 + i), [x, 0.05, z], [0, rng() * TAU, 0], { color: DS.rock2 });
  }

  // A dragon's skull half buried in the ash on the slope, its ribs arching out of the slope behind it
  const sa = 2.0;
  const [sx, sz] = dirXZ(sa, 2.05);
  k.at([sx, slopeY(2.05) - 0.08, sz], facing(sa), () => k.frame([0, 0, 0], [0.42, 0, 0.12], 1.15, () => dragonSkull(c)));
  // The beast's back breaking the ash: rib hoops arching across the slope, vertebrae along their crown
  const tangent: V3 = [-Math.sin(sa), 0, Math.cos(sa)];
  [1.66, 1.42, 1.2].forEach((r, i) => {
    const [bx, bz] = dirXZ(sa, r);
    const p = (off: number, up: number): V3 => {
      const x = bx + tangent[0] * off;
      const z = bz + tangent[2] * off;
      return [x, slopeY(Math.hypot(x, z)) + up, z];
    };
    const w = 0.5 - i * 0.07;
    const h = 0.5 - i * 0.08;
    for (const s of [-1, 1]) chain(c, "matte", [p(s * w, -0.08), p(s * w * 0.9, h * 0.62), p(s * w * 0.5, h * 0.98), p(s * 0.04, h * 1.04)], 0.05, 0.035, { color: DS.bone, seg: 6 });
    k.add("matte", new THREE.SphereGeometry(0.075, 7, 5), p(0, h * 1.08), undefined, { color: DS.bone2, scale: [1, 0.8, 1.3] });
  });

  // Smoke pouring from the crater, embers whirling up through it
  c.spark(SPARK.smoke, [0, LAKE + 0.3, 0], 10, { color: "#4b4542", size: 1.1, speed: 0.1, rise: 4.2, reach: 0.9, spread: 1.0 });
  c.spark(SPARK.ember, [0, LAKE + 0.2, 0], 30, { color: "#ffb347", size: 0.1, speed: 0.5, rise: 4.0, reach: 1.4, spread: 1.4 });
}

/* ================================================================== */
/* The King's Motherlode                                               */
/* ================================================================== */

const ML = { rock: "#5f5750", rock2: "#4d4640", stone: "#d6ccb8", stone2: "#bfb39b", gold: "#f2c14e", gilt: "#e3ad3a", iron: "#34343a", wood: "#6b4426", wood2: "#7a5230", dark: "#09070a", crimson: "#8f1d1d", quartz: "#e0f2fe" };
/** The portal's front face, its half-width, height and depth into the hill; its arch: half-width and the springing height */
const FRONT = 0.75;
const FW = 0.98;
const FH = 1.8;
const FD = 1.0;
const ARCH_W = 0.53;
const SPRING = 1.0;

/** The mountain's peaks: centre, foot and top radius, height, how deep it is (z scale) */
const PEAKS: Array<{ x: number; z: number; r0: number; r1: number; h: number; sz: number; color: string }> = [
  { x: 0, z: -1.2, r0: 2.2, r1: 0.55, h: 3.3, sz: 0.8, color: ML.rock },
  { x: -1.45, z: -0.45, r0: 1.15, r1: 0.45, h: 2.0, sz: 0.85, color: ML.rock2 },
  { x: 1.45, z: -0.8, r0: 1.05, r1: 0.4, h: 1.7, sz: 0.85, color: ML.rock2 }
];

/** A point on a peak's slope (angle `a`, height `y`) and the way out of it */
function onPeak(p: (typeof PEAKS)[number], a: number, y: number): { at: V3; out: V3 } {
  const r = p.r0 - ((p.r0 - p.r1) * y) / p.h;
  const out = new THREE.Vector3(Math.cos(a), (p.r0 - p.r1) / p.h, Math.sin(a) / p.sz).normalize();
  return { at: [p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r * p.sz], out: [out.x, out.y, out.z] };
}

/** A round arch over straight jambs, `w` wide, springing at `spring` (bottom centre at the origin) */
function archPath<T extends THREE.Path>(p: T, w: number, spring: number): T {
  p.moveTo(-w, 0);
  p.lineTo(w, 0);
  p.lineTo(w, spring);
  p.absarc(0, spring, w, 0, Math.PI, false);
  p.lineTo(-w, 0);
  return p;
}

function motherlode(c: HeroCtx) {
  const { k, rng } = c;
  // The mountain in strata, laced with gold veins
  PEAKS.forEach((p, i) => k.add("rock", craggyCone(p.r1, p.r0, p.h, 16, 4, 0.15, 51 + i), [p.x, p.h / 2, p.z], undefined, { color: p.color, surf: ore(0.85), scale: [1, 1, p.sz] }));

  // The royal portal cut into the rock face: dressed stone with the arch through it, voussoirs round it and a gilt keystone
  const wall = new THREE.Shape();
  wall.moveTo(-FW, 0);
  wall.lineTo(FW, 0);
  wall.lineTo(FW, FH);
  wall.lineTo(-FW, FH);
  wall.lineTo(-FW, 0);
  wall.holes.push(archPath(new THREE.Path(), ARCH_W, SPRING));
  k.add("matte", new THREE.ExtrudeGeometry(wall, { depth: FD, bevelEnabled: false, curveSegments: 8 }), [0, 0, FRONT - FD], undefined, { color: ML.stone, surf: ASHLAR });
  // The deep end of the drift, dark, a glow of gold far inside
  k.add("matte", new THREE.ShapeGeometry(archPath(new THREE.Shape(), ARCH_W, SPRING), 8), [0, 0, FRONT - FD + 0.12], undefined, { color: ML.dark });
  k.move({ kind: MOVE.pulse, amp: 0.25, speed: 0.9 }, () => {
    k.add("glow", new THREE.ShapeGeometry(archPath(new THREE.Shape(), 0.26, 0.45), 6), [0, 0, FRONT - FD + 0.17], undefined, { color: "#ffb347", bright: 0.9 });
  });
  // Timber props inside the mouth
  for (const s of [-1, 1]) k.add("matte", new THREE.BoxGeometry(0.1, 1.15, 0.1), [s * 0.4, 0.575, FRONT - 0.6], undefined, { color: ML.wood, surf: grainRound(0.05) });
  k.add("matte", new THREE.BoxGeometry(0.95, 0.12, 0.12), [0, 1.21, FRONT - 0.6], undefined, { color: ML.wood2 });
  for (let i = 0; i < 11; i++) {
    const t = (i / 10) * Math.PI;
    const r = ARCH_W + 0.09;
    const keystone = i === 5;
    k.add(keystone ? "gold" : "matte", new THREE.BoxGeometry(keystone ? 0.2 : 0.16, keystone ? 0.26 : 0.18, 0.12), [Math.cos(t) * r, SPRING + Math.sin(t) * r, FRONT + 0.06], [0, 0, t - Math.PI / 2], { color: keystone ? ML.gilt : ML.stone2 });
  }
  // Pilasters with gilt capitals, a cornice with a gilt band
  for (const s of [-1, 1]) {
    k.add("matte", new THREE.BoxGeometry(0.24, FH - 0.18, 0.16), [s * (FW - 0.14), (FH - 0.18) / 2, FRONT + 0.08], undefined, { color: ML.stone2, surf: ASHLAR });
    k.add("gold", new THREE.BoxGeometry(0.36, 0.12, 0.26), [s * (FW - 0.14), FH - 0.12, FRONT + 0.08], undefined, { color: ML.gilt });
    k.add("matte", new THREE.BoxGeometry(0.34, 0.14, 0.26), [s * (FW - 0.14), 0.07, FRONT + 0.08], undefined, { color: ML.stone });
  }
  k.add("matte", new THREE.BoxGeometry(FW * 2 + 0.16, 0.12, FD + 0.15), [0, FH + 0.06, FRONT - FD / 2 + 0.05], undefined, { color: ML.stone2 });
  k.add("gold", new THREE.BoxGeometry(FW * 2 + 0.2, 0.06, 0.06), [0, FH + 0.03, FRONT + 0.15], undefined, { color: ML.gilt });
  // The rock face it is cut into: crags heaped over the cornice and against its sides
  const brow: Array<[number, number, number, number]> = [
    [-0.55, 2.05, 0.12, 0.5],
    [0.22, 2.15, 0.02, 0.55],
    [0.78, 1.98, 0.18, 0.45],
    [-1.06, 1.5, 0.08, 0.45],
    [1.1, 1.4, 0.08, 0.45],
    [0, 2.55, -0.38, 0.6]
  ];
  brow.forEach(([x, y, z, r], i) => k.add("rock", crag(r, 140 + i), [x, y, z], [0, i * 1.3, 0], { color: i % 2 ? ML.rock : ML.rock2, surf: ore(0.85), scale: [1.15, 0.85, 1] }));

  // The great doors, iron-banded, swung open against the face
  for (const s of [-1, 1]) {
    k.at([s * ARCH_W, 0, FRONT + 0.05], s * 2.0, () => {
      k.add("matte", new THREE.BoxGeometry(0.5, 1.3, 0.06), [-s * 0.26, 0.66, 0], undefined, { color: ML.wood });
      for (const y of [0.25, 0.7, 1.15]) k.add("iron", new THREE.BoxGeometry(0.6, 0.06, 0.16), [-s * 0.26, y, 0], undefined, { color: ML.iron });
    });
    // Lanterns hanging from iron brackets on the pilasters, swinging a little
    const bx = s * (FW - 0.14);
    k.along("iron", [bx, 1.45, FRONT + 0.16], [bx, 1.45, FRONT + 0.46], 0.035, { color: ML.iron });
    k.move({ kind: MOVE.sway, pivot: [bx, 1.45, FRONT + 0.44], amp: -0.08, speed: 1.3, phase: s }, () => {
      k.along("iron", [bx, 1.43, FRONT + 0.44], [bx, 1.3, FRONT + 0.44], 0.015, { color: ML.iron });
      k.add("iron", new THREE.ConeGeometry(0.1, 0.1, 4), [bx, 1.26, FRONT + 0.44], [0, Math.PI / 4, 0], { color: ML.iron });
      k.add("glow", new THREE.BoxGeometry(0.1, 0.16, 0.1), [bx, 1.13, FRONT + 0.44], undefined, { color: "#ffd27a", bright: 1.8 });
      k.add("iron", new THREE.BoxGeometry(0.15, 0.04, 0.15), [bx, 1.03, FRONT + 0.44], undefined, { color: ML.iron });
    });
  }

  // The headframe over the shaft: timber legs and braces, the pulley wheel turning, a bucket riding up and down
  k.at([2.05, 0, 0.75], -0.35, () => {
    const top = 2.3;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) k.along("matte", [sx * 0.45, 0, sz * 0.42], [sx * 0.14, top, sz * 0.14], 0.08, { color: ML.wood, surf: grainRound(0.04) });
    for (const y of [0.75, 1.5]) {
      const w = 0.45 - (0.31 * y) / top;
      for (const sz of [-1, 1]) k.add("matte", new THREE.BoxGeometry(w * 2, 0.07, 0.07), [0, y, sz * (w - 0.03)], undefined, { color: ML.wood2 });
      for (const sx of [-1, 1]) k.add("matte", new THREE.BoxGeometry(0.07, 0.07, w * 2), [sx * (w + 0.02), y + 0.08, 0], undefined, { color: ML.wood2 });
    }
    k.add("matte", new THREE.BoxGeometry(0.42, 0.07, 0.42), [0, top + 0.035, 0], undefined, { color: ML.wood2 });
    for (const sx of [-1, 1]) k.add("iron", new THREE.BoxGeometry(0.05, 0.22, 0.08), [sx * 0.12, top + 0.18, 0], undefined, { color: ML.iron });
    k.move({ kind: MOVE.spin, pivot: [0, top + 0.3, 0], axis: [1, 0, 0], speed: 1.1 }, () => {
      k.add("iron", new THREE.TorusGeometry(0.3, 0.03, 5, 20), [0, top + 0.3, 0], [0, Math.PI / 2, 0], { color: ML.iron });
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * TAU;
        k.along("iron", [0, top + 0.3, 0], [0, top + 0.3 + Math.sin(t) * 0.29, Math.cos(t) * 0.29], 0.025, { color: ML.iron });
      }
      k.add("gold", new THREE.CylinderGeometry(0.05, 0.05, 0.26, 8), [0, top + 0.3, 0], [0, 0, Math.PI / 2], { color: ML.gilt });
    });
    k.move({ kind: MOVE.bob, axis: [0, 1, 0], amp: 0.25, speed: 0.5 }, () => {
      k.along("matte", [0, top + 0.28, 0.3], [0, 1.2, 0.3], 0.02, { color: "#a08660" });
      k.add("matte", new THREE.CylinderGeometry(0.15, 0.12, 0.22, 10), [0, 1.08, 0.3], undefined, { color: ML.wood2, surf: grainRound(0.15) });
      k.add("iron", new THREE.TorusGeometry(0.155, 0.015, 4, 14), [0, 1.14, 0.3], [Math.PI / 2, 0, 0], { color: ML.iron });
      k.add("gold", new THREE.SphereGeometry(0.12, 8, 4, 0, TAU, 0, Math.PI / 2), [0, 1.18, 0.3], undefined, { color: ML.gold, scale: [1, 0.5, 1] });
    });
    // The shaft's timber collar round a dark mouth
    k.add("matte", new THREE.PlaneGeometry(0.4, 0.4), [0, 0.035, 0.3], [-Math.PI / 2, 0, 0], { color: ML.dark });
    for (const s of [-1, 1]) {
      k.add("matte", new THREE.BoxGeometry(0.62, 0.09, 0.11), [0, 0.045, 0.3 + s * 0.255], undefined, { color: ML.wood });
      k.add("matte", new THREE.BoxGeometry(0.11, 0.09, 0.4), [s * 0.255, 0.045, 0.3], undefined, { color: ML.wood });
    }
  });

  // Rails on sleepers out of the drift to a gilded ore cart heaped with gold
  for (let i = 0; i < 9; i++) k.add("matte", new THREE.BoxGeometry(0.85, 0.06, 0.13), [0, 0.03, -0.25 + i * 0.38], [0, (i % 3) * 0.04 - 0.04, 0], { color: i % 2 ? ML.wood : ML.wood2 });
  for (const s of [-1, 1]) k.add("iron", new THREE.BoxGeometry(0.06, 0.06, 3.4), [s * 0.3, 0.09, 1.3], undefined, { color: "#55555c" });
  k.at([0, 0, 2.15], 0, () => {
    k.add("matte", new THREE.CylinderGeometry(0.42, 0.32, 0.4, 4), [0, 0.45, 0], [0, Math.PI / 4, 0], { color: ML.wood, surf: grainRound(0.4) });
    for (const y of [0.32, 0.6]) {
      const r = 0.32 + ((y - 0.25) / 0.4) * 0.1 + 0.08;
      k.add("iron", new THREE.CylinderGeometry(r, r, 0.05, 4), [0, y, 0], [0, Math.PI / 4, 0], { color: ML.iron });
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        k.add("iron", new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10), [sx * 0.3, 0.23, sz * 0.24], [0, 0, Math.PI / 2], { color: "#2a2a30" });
        k.add("gold", new THREE.CylinderGeometry(0.035, 0.035, 0.15, 6), [sx * 0.3, 0.23, sz * 0.24], [0, 0, Math.PI / 2], { color: ML.gilt });
      }
    k.add("gold", new THREE.SphereGeometry(0.36, 12, 5, 0, TAU, 0, Math.PI / 2), [0, 0.62, 0], undefined, { color: ML.gold, scale: [1, 0.55, 1] });
    for (let i = 0; i < 5; i++) k.add("gold", new THREE.OctahedronGeometry(0.06 + rng() * 0.04, 0), [(rng() - 0.5) * 0.4, 0.75 + rng() * 0.06, (rng() - 0.5) * 0.5], [rng(), rng(), 0], { color: "#ffd56a" });
    gem(c, [0.08, 0.83, 0.05], 0.07, ML.quartz, [0.3, 0, 0.2]);
    gem(c, [-0.12, 0.79, -0.12], 0.05, "#dc2626", [0, 0.5, 0.4]);
  });

  // Heaps of gold either side of the rails, coins and gems spilled round them
  for (const s of [-1, 1]) {
    const hx = s * 1.0;
    const hz = 2.15;
    k.add("gold", new THREE.SphereGeometry(0.5, 14, 6, 0, TAU, 0, Math.PI / 2), [hx, 0, hz], undefined, { color: ML.gold, scale: [1, 0.55, 1] });
    k.add("gold", new THREE.SphereGeometry(0.3, 12, 5, 0, TAU, 0, Math.PI / 2), [hx + s * 0.38, 0, hz + 0.32], undefined, { color: "#e9b43c", scale: [1, 0.6, 1] });
    for (let i = 0; i < 9; i++) {
      const [dx, dz] = dirXZ(rng() * TAU, 0.2 + rng() * 0.32);
      const d = Math.hypot(dx, dz);
      coin(c, [hx + dx, 0.275 * Math.sqrt(Math.max(0, 1 - (d / 0.5) ** 2)) + 0.012, hz + dz], (rng() - 0.5) * 0.8, rng() * TAU);
    }
    for (let i = 0; i < 8; i++) {
      const [dx, dz] = dirXZ(rng() * TAU, 0.6 + rng() * 0.5);
      coin(c, [hx + dx, 0.012, hz + dz], (rng() - 0.5) * 0.2, rng() * TAU, i % 3 ? ML.gold : "#e9b43c");
    }
    gem(c, [hx + s * 0.1, 0.33, hz - 0.05], 0.07, s > 0 ? "#2563eb" : "#16a34a");
    gem(c, [hx - s * 0.3, 0.06, hz + 0.45], 0.05, "#dc2626", [0, 0.3, Math.PI / 2]);
    // The king's banners either side of the portal, flying in toward it
    k.at([s * 1.35, 0, 1.6], s > 0 ? Math.PI : 0, () => flag(c, [0, 0, 0], 2.15, 0.6, 0.4, ML.crimson, { pole: ML.gilt, trim: ML.gold, phase: s * 1.3 }));
  }

  // Gold nuggets and diamond geodes bursting from the slopes
  const geodes: Array<[number, number, number]> = [
    [0, Math.PI * 0.15, 1.6],
    [1, Math.PI * 0.6, 0.6],
    [0, Math.PI * 0.85, 1.3],
    [2, Math.PI * 0.35, 0.5],
    [0, Math.PI * 0.3, 2.3]
  ];
  geodes.forEach(([pi, a, y], g) => {
    const { at, out } = onPeak(PEAKS[pi], a, y);
    const n = new THREE.Vector3(...out);
    for (let i = 0; i < 5; i++) {
      const jitter = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.9);
      const dir = n.clone().add(jitter).normalize();
      const base: V3 = [at[0] - n.x * 0.12 + jitter.x * 0.18, at[1] + jitter.y * 0.18, at[2] - n.z * 0.12 + jitter.z * 0.18];
      if (g % 2 === 0) crystal(c, "gloss", base, [dir.x, dir.y, dir.z], 0.06 + rng() * 0.04, 0.4 + rng() * 0.3, { color: ML.quartz });
      else k.add("gold", new THREE.OctahedronGeometry(0.1 + rng() * 0.06, 0), [base[0] + n.x * 0.1, base[1] + n.y * 0.1, base[2] + n.z * 0.1], [rng(), rng(), rng()], { color: "#ffd56a" });
    }
  });

  // The great crown turning over the door, coins circling it, a glint of gold in the air
  k.move({ kind: MOVE.spin, pivot: [0, 0, FRONT + 0.1], axis: [0, 1, 0], speed: 0.7, amp: 0.12 }, () => crown(c, [0, 2.9, FRONT + 0.1], 0.9, ML.gilt, ML.crimson));
  k.move({ kind: MOVE.spin, pivot: [0, 0, FRONT + 0.1], axis: [0, 1, 0], speed: -1.0, amp: 0.08 }, () => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const [x, z] = dirXZ(a, 0.78);
      const quat = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)).normalize());
      k.add("gold", new THREE.CylinderGeometry(0.075, 0.075, 0.02, 12), [x, 3.0 + Math.sin(i * 2.1) * 0.12, FRONT + 0.1 + z], undefined, { color: ML.gold, quat });
    }
  });
  c.spark(SPARK.mote, [0, 3.1, FRONT + 0.1], 12, { color: "#ffd76a", size: 0.07, speed: 1, reach: 0.9, rise: 0.4, spread: 1.4 });
  c.spark(SPARK.mote, [0, 0.6, FRONT - 0.3], 8, { color: "#ffcf5a", size: 0.06, speed: 1, reach: 0.3, rise: 0.3, spread: 0.6 });
}

/* ================================================================== */
/* The Ancient Nethergarde Relic Hoard                                 */
/* ================================================================== */

const RH = { stone: "#2b2553", stone2: "#352e66", obsidian: "#15121c", lacquer: "#1e1b4b", silver: "#d9dee8", violet: "#c084fc", gold: "#e8b440", cream: "#efe6cf" };
/** The chest's foot (it floats over the dais) */
const CHEST_Y = 1.25;

function relicHoard(c: HeroCtx) {
  const { k, rng } = c;
  // The dais: three round steps of dark violet stone in courses, silver lips, runes lit round the middle riser
  const steps: Array<[number, number]> = [
    [1.48, 0.22],
    [1.14, 0.44],
    [0.84, 0.62]
  ];
  steps.forEach(([r, top], i) => {
    const h = i === 2 ? 0.18 : 0.22;
    k.add("matte", new THREE.CylinderGeometry(r, r + 0.04, h, 24), [0, top - h / 2, 0], undefined, { color: i % 2 ? RH.stone2 : RH.stone, surf: ashlarRound(r) });
    k.add("gold", new THREE.TorusGeometry(r + 0.005, 0.028, 4, 32), [0, top, 0], [Math.PI / 2, 0, 0], { color: RH.silver });
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    const [x, z] = dirXZ(a, 1.21);
    k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.3, phase: i * 0.8 }, () => {
      k.add("glow", new THREE.PlaneGeometry(0.52, 0.11), [x, 0.33, z], [0, facing(a), 0], { color: RH.violet, surf: runeBand(0.52, 0.11, 4), bright: 1.4 });
    });
  }

  // Four obsidian pylons on the lowest step: silver bands and caps, runes up their inner faces, a crystal floating over each
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const [x, z] = dirXZ(a, 1.3);
    k.at([x, 0.22, z], facing(a) + Math.PI, () => {
      k.add("gloss", new THREE.CylinderGeometry(0.08, 0.16, 1.5, 4), [0, 0.75, 0], [0, Math.PI / 4, 0], { color: RH.obsidian });
      k.add("gold", new THREE.CylinderGeometry(0.22, 0.23, 0.06, 4), [0, 0.33, 0], [0, Math.PI / 4, 0], { color: RH.silver });
      k.add("gold", new THREE.ConeGeometry(0.115, 0.2, 4), [0, 1.6, 0], [0, Math.PI / 4, 0], { color: RH.silver });
      k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.1, phase: i * 1.2 }, () => {
        k.add("glow", new THREE.PlaneGeometry(0.1, 0.8), [0, 0.95, 0.14], [-0.038, 0, 0], { color: RH.violet, surf: runeColumn(0.1, 0.8, 4), bright: 1.5 });
      });
      k.move({ kind: MOVE.bob, axis: [0, 1, 0], amp: 0.1, speed: 1.3, phase: i * 1.6 }, () => {
        k.add("glow", new THREE.OctahedronGeometry(0.12, 0), [0, 2.0, 0], undefined, { color: "#d8b4fe", bright: 1.6, scale: [1, 1.9, 1] });
      });
    });
    c.spark(SPARK.mote, [x, 2.0, z], 3, { color: "#e9d5ff", size: 0.05, speed: 1, reach: 0.2, rise: 0.25 });
  }

  // The reliquary floating over the dais: lacquered void-wood bound in silver, a lock plate with a burning gem, its lid
  // breathing open on the light inside
  k.float = 0.1;
  const top = CHEST_Y + 0.55;
  k.add("gloss", new THREE.BoxGeometry(1.1, 0.55, 0.72), [0, CHEST_Y + 0.275, 0], undefined, { color: RH.lacquer });
  for (const s of [-1, 1]) {
    k.add("gold", new THREE.BoxGeometry(0.12, 0.55, 0.82), [s * 0.32, CHEST_Y + 0.225, 0], undefined, { color: RH.silver });
    k.add("gold", new THREE.TorusGeometry(0.09, 0.02, 4, 12), [s * 0.6, CHEST_Y + 0.3, 0], [0, Math.PI / 2, 0], { color: RH.silver });
    for (const sz of [-1, 1]) k.add("gold", new THREE.BoxGeometry(0.15, 0.15, 0.15), [s * 0.55, CHEST_Y + 0.025, sz * 0.36], undefined, { color: RH.silver });
  }
  k.add("gold", new THREE.BoxGeometry(0.24, 0.26, 0.06), [0, CHEST_Y + 0.33, 0.39], undefined, { color: RH.silver });
  k.move({ kind: MOVE.pulse, amp: 0.3, speed: 2.2 }, () => {
    k.add("glow", new THREE.OctahedronGeometry(0.07, 0), [0, CHEST_Y + 0.33, 0.45], undefined, { color: "#e879f9", bright: 1.9 });
    k.add("glow", new THREE.BoxGeometry(1.0, 0.04, 0.62), [0, top + 0.02, 0], undefined, { color: "#f5d0fe", bright: 1.8 });
  });
  // The lid, hinged at the back, rocking open and shut
  k.frame([0, top, -0.36], [-0.38, 0, 0], 1, () => {
    k.move({ kind: MOVE.swing, pivot: [0, 0, 0], axis: [1, 0, 0], amp: 0.22, speed: 1.6 }, () => {
      k.add("gloss", new THREE.CylinderGeometry(0.36, 0.36, 1.1, 14, 1, false, 0, Math.PI), [0, 0, 0.36], [0, 0, Math.PI / 2], { color: RH.lacquer });
      k.add("matte", new THREE.BoxGeometry(1.1, 0.03, 0.72), [0, 0.015, 0.36], undefined, { color: "#3b1d5e" });
      for (const x of [-0.32, 0, 0.32]) k.add("gold", new THREE.TorusGeometry(0.37, 0.025, 4, 12, Math.PI), [x, 0, 0.36], [0, Math.PI / 2, 0], { color: RH.silver });
      k.add("gold", new THREE.BoxGeometry(1.14, 0.06, 0.05), [0, 0.03, 0.74], undefined, { color: RH.silver });
    });
  });
  k.float = 0;
  c.spark(SPARK.mote, [0, top + 0.1, 0], 12, { color: "#f5d0fe", size: 0.07, speed: 1, reach: 0.35, rise: 0.6, spread: 0.7 });
  c.spark(SPARK.wisp, [0, CHEST_Y + 0.3, 0], 10, { color: "#d8b4fe", size: 0.16, speed: 0.08, reach: 1.25, rise: 0.5 });

  // Two void rings turning about their own tilted axes round the chest, silver beads riding them
  const rings: Array<{ r: number; tilt: V3; speed: number; color: string }> = [
    { r: 1.18, tilt: [0.5, 0, 0.3], speed: 0.9, color: "#a855f7" },
    { r: 0.98, tilt: [-0.6, 0, -0.2], speed: -0.7, color: "#22d3ee" }
  ];
  for (const ring of rings) {
    k.frame([0, CHEST_Y + 0.3, 0], [ring.tilt[0] + Math.PI / 2, ring.tilt[1], ring.tilt[2]], 1, () => {
      k.move({ kind: MOVE.spin, pivot: [0, 0, 0], axis: [0, 0, 1], speed: ring.speed }, () => {
        k.add("glow", new THREE.TorusGeometry(ring.r, 0.028, 5, 56), [0, 0, 0], undefined, { color: ring.color, bright: 1.4 });
        for (let b = 0; b < 5; b++) {
          const a = (b / 5) * TAU;
          k.add("gold", new THREE.OctahedronGeometry(0.06, 0), [Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0], undefined, { color: RH.silver });
        }
      });
    });
  }

  // Relics of the old court circling high over it: a crown, a goblet, an orb, a sceptre, a tome, a great gem
  k.move({ kind: MOVE.spin, pivot: [0, 0, 0], axis: [0, 1, 0], speed: 0.45, amp: 0.12 }, () => {
    const at = (i: number): V3 => {
      const [x, z] = dirXZ((i / 6) * TAU, 0.95);
      return [x, 2.62 + (i % 2) * 0.2, z];
    };
    crown(c, at(0), 0.32, RH.gold, "#5b21b6");
    k.frame(at(1), [0.3, 0, 0.2], 1, () => {
      const cup = [0.09, 0.09, 0.025, 0.02, 0.02, 0.06, 0.09, 0.095].map((r, j) => new THREE.Vector2(r, [0, 0.02, 0.04, 0.1, 0.16, 0.2, 0.27, 0.32][j]));
      k.add("gold", new THREE.LatheGeometry(cup, 12), [0, -0.16, 0], undefined, { color: RH.gold });
      gem(c, [0, 0.02, 0.07], 0.03, "#dc2626", [Math.PI / 2, 0, 0]);
    });
    k.frame(at(2), [0, 0, 0], 1, () => {
      k.add("gloss", new THREE.SphereGeometry(0.14, 14, 10), [0, 0, 0], undefined, { color: "#6d28d9" });
      k.add("gold", new THREE.TorusGeometry(0.145, 0.018, 4, 20), [0, 0, 0], [Math.PI / 2, 0, 0], { color: RH.gold });
      k.add("gold", new THREE.BoxGeometry(0.03, 0.14, 0.03), [0, 0.2, 0], undefined, { color: RH.gold });
      k.add("gold", new THREE.BoxGeometry(0.1, 0.03, 0.03), [0, 0.21, 0], undefined, { color: RH.gold });
    });
    k.frame(at(3), [0.2, 0, 0.7], 1, () => {
      k.add("gold", new THREE.CylinderGeometry(0.022, 0.026, 0.7, 8), [0, 0, 0], undefined, { color: RH.gold });
      k.add("gold", new THREE.SphereGeometry(0.04, 8, 6), [0, -0.37, 0], undefined, { color: RH.gold });
      k.add("gold", new THREE.TorusGeometry(0.06, 0.015, 4, 12), [0, 0.38, 0], undefined, { color: RH.gold });
      k.add("glow", new THREE.OctahedronGeometry(0.06, 0), [0, 0.38, 0], undefined, { color: "#67e8f9", bright: 1.7, scale: [1, 1.4, 1] });
    });
    k.frame(at(4), [0.25, 0.4, -0.2], 1, () => {
      for (const s of [-1, 1]) k.add("matte", new THREE.BoxGeometry(0.32, 0.016, 0.24), [0, s * 0.038, 0], undefined, { color: "#4c1d95" });
      k.add("matte", new THREE.BoxGeometry(0.26, 0.06, 0.19), [0.02, 0, 0], undefined, { color: RH.cream });
      k.add("matte", new THREE.BoxGeometry(0.016, 0.092, 0.24), [-0.168, 0, 0], undefined, { color: "#4c1d95" });
    });
    crystal(c, "glow", at(5), [0.3, 1, 0.1], 0.07, 0.36, { color: "#a5f3fc", bright: 1.6 });
  });

  // Treasure spilled on the steps: coins, gems, bars of gold, a goblet on its side
  for (let i = 0; i < 22; i++) {
    const [x, z] = dirXZ(rng() * TAU, 0.32 + rng() * 0.44);
    coin(c, [x, 0.632, z], (rng() - 0.5) * 0.3, rng() * TAU, i % 3 ? RH.gold : "#f2c14e");
  }
  for (let i = 0; i < 10; i++) {
    const [x, z] = dirXZ(rng() * TAU, 0.92 + rng() * 0.16);
    coin(c, [x, 0.452, z], (rng() - 0.5) * 0.3, rng() * TAU);
  }
  const gems = ["#e879f9", "#67e8f9", "#a78bfa", "#dc2626", "#16a34a"];
  for (let i = 0; i < 6; i++) {
    const [x, z] = dirXZ(rng() * TAU, 0.42 + rng() * 0.34);
    gem(c, [x, 0.68, z], 0.05 + rng() * 0.02, gems[i % gems.length], [0, rng(), Math.PI / 2]);
  }
  for (let i = 0; i < 3; i++) {
    const [x, z] = dirXZ(0.6 + Math.min(i, 1) * 0.35, 0.66);
    k.add("gold", new THREE.BoxGeometry(0.22, 0.07, 0.1), [x, 0.655 + (i === 2 ? 0.07 : 0), z], [0, 0.6 + i * 0.3, 0], { color: RH.gold });
  }
  k.frame([-0.58, 0.71, 0.32], [0, 0.8, Math.PI / 2], 1, () => {
    const cup = [0.07, 0.07, 0.02, 0.016, 0.05, 0.075, 0.08].map((r, j) => new THREE.Vector2(r, [0, 0.015, 0.03, 0.12, 0.16, 0.22, 0.26][j]));
    k.add("gold", new THREE.LatheGeometry(cup, 10), [0, -0.12, 0], undefined, { color: RH.gold });
  });
}

export const HERO_SITE_BUILDERS: Record<string, (c: HeroCtx) => void> = {
  "res-dragonstone": dragonstoneCore,
  "res-motherlode": motherlode,
  "treasure-relic": relicHoard
};
