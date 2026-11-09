import * as THREE from "three";
import { MOVE, V3 } from "./heroKit";
import { SPARK } from "./heroMaterials";
import { BonePose, BossAction, BossCtx, BossHeroDef, IdleCtx, Pose } from "./heroRig";
import { blob, merge, pathBones, seg, spike } from "./bossParts";
import { aura, sideOf } from "./heroCreatures";
import { BROOD_SIZES, vgType } from "./voidCreatures";
import { VOID, VOID_HOT, circle, crystal, crystalCrown, frameOf, orbiting, tierOf, voidActions } from "./heroVoidKit";

/* ------------------------------------------------------------------------- */
/* The Crystal Broodmother's brood in high graphics (Void Gate, coming soon)  */
/* ------------------------------------------------------------------------- */

/*
 * One shard spider grown up the ladder: a body bone (the head and thorax) with eight legs of three bones each, an
 * abdomen on its own bone that bobs and sways, fangs that open and strike, and the crystal it grows on its back. The
 * shardling carries one dull shard; the shard spider a violet cluster and an egg of crystal; the weaver's crystals and
 * eyes glow and pulse; the prism stalker is long-legged and spined with lit crystal, shards orbiting it; the Broodmother
 * is the size of a house, her abdomen a burning geode, a crown of crystal spines and shards turning round her. It walks
 * in the spider's gait (four legs at a time, alternating), rears and strikes with its fangs, and the Broodmother shrieks.
 */

const CARAPACE = ["#857a96", "#7d7290", "#746988", "#6a5f80", "#5f5476"];
const CARAPACE2 = ["#655b74", "#5f556f", "#584e68", "#514761", "#493f59"];
const FANG = "#e9e3f1";

const UNIT = 0.6;
const SHARDS = 6;
/** The legs from front to back on each side: where they leave the body, and where the foot lands (unit size) */
const LEGS: Array<{ root: V3; knee: V3; foot: V3 }> = [
  { root: [0.12, 0.34, 0.16], knee: [0.38, 0.55, 0.42], foot: [0.48, 0.0, 0.62] },
  { root: [0.14, 0.34, 0.06], knee: [0.48, 0.55, 0.18], foot: [0.68, 0.0, 0.26] },
  { root: [0.14, 0.34, -0.04], knee: [0.48, 0.55, -0.12], foot: [0.68, 0.0, -0.2] },
  { root: [0.12, 0.34, -0.12], knee: [0.38, 0.55, -0.36], foot: [0.5, 0.0, -0.58] }
];

function spiderBuild(size: number) {
  const T = tierOf(size);
  const S = BROOD_SIZES.spider.height[size] / UNIT;
  const col = CARAPACE[size];
  const col2 = CARAPACE2[size];
  // The prism stalker and the Broodmother stand on longer legs
  const reach = [1, 1, 1, 1.15, 1.1][size];
  return (c: BossCtx) =>
    c.k.frame([0, 0, 0], [0, 0, 0], S, () => {
      if (T.orbit) orbiting(c, "shard", SHARDS, 0.55, (i, at) => crystal(c, [at[0], at[1] - 0.05, at[2]], [0.3, 1, 0.1 * i], 0.03, 0.12, { lit: true, color: i % 2 ? VOID : VOID_HOT }));
      c.bone("body", [0, 0.34, 0], () => {
        // The thorax and the head, eight eyes, fangs on their own bones
        blob(c, "chitin", [0, 0.34, 0.05], [0.16, 0.1, 0.18], { color: col, wd: 14, hd: 10 });
        blob(c, "chitin", [0, 0.33, 0.22], [0.1, 0.08, 0.09], { color: col2, wd: 12, hd: 8 });
        for (let i = 0; i < 8; i++) {
          const x = (i % 4 - 1.5) * 0.028 * (i < 4 ? 1 : 1.4);
          const y = 0.37 + (i < 4 ? 0 : 0.025);
          const at: V3 = [x, y, 0.29 - (i < 4 ? 0 : 0.015)];
          if (T.glow) c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 2, phase: i }, () => c.k.add("glow", new THREE.SphereGeometry(i % 4 === 1 || i % 4 === 2 ? 0.014 : 0.01, 6, 5), at, undefined, { color: VOID_HOT, bright: 2.2 }));
          else blob(c, "gloss", at, [0.011, 0.011, 0.008], { color: "#1a1424", wd: 6, hd: 4 });
        }
        for (const s of [1, -1])
          c.bone(`fang${sideOf(s)}`, [s * 0.035, 0.3, 0.28], () => {
            seg(c, "chitin", [s * 0.035, 0.3, 0.28], [s * 0.03, 0.24, 0.31], 0.022, 0.018, { color: col2, seg: 7 });
            spike(c, "matte", [s * 0.03, 0.245, 0.31], [-s * 0.3, -1, 0.2], 0.012, 0.06, { color: T.glow ? VOID_HOT : FANG, seg: 5 });
          });
        // Eight legs: hip, knee, foot (the foot rides the last bone)
        for (const s of [1, -1])
          LEGS.forEach((L, i) => {
            const m = (v: V3, k = 1): V3 => [s * v[0] * k, v[1] * (k > 1 ? 1 + (k - 1) * 0.6 : 1), v[2] * k];
            const root = m(L.root);
            const knee = m(L.knee, reach);
            const foot = m(L.foot, reach);
            const shin: V3 = [(knee[0] + foot[0]) / 2 + s * 0.04, 0.22, (knee[2] + foot[2]) / 2];
            pathBones(c, `leg${sideOf(s)}${i}`, [root, knee, shin, foot], [0.035, 0.03, 0.022, 0.012], { bucket: "chitin", color: i % 2 ? col : col2, seg: 7 }, (j, from, to) => {
              if (T.orbit && j === 0) crystal(c, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.02, (from[2] + to[2]) / 2], [s * 0.2, 1, 0], 0.012, 0.06, { lit: true, pulse: 0.3, phase: i });
            });
          });
        c.bone("abdomen", [0, 0.36, -0.1], () => {
          // The abdomen, swelling behind; the crystal growing from it (lit from the weaver; a burning geode on the Broodmother)
          blob(c, "chitin", [0, 0.42, -0.32], [0.22, 0.19, 0.26], { color: col, wd: 16, hd: 12 });
          blob(c, "chitin", [0, 0.36, -0.32], [0.16, 0.12, 0.2], { color: col2, wd: 12, hd: 8 });
          for (let i = 0; i < 3; i++) seg(c, "chitin", [-0.15, 0.5 - i * 0.04, -0.2 - i * 0.1], [0.15, 0.5 - i * 0.04, -0.2 - i * 0.1], 0.012, 0.012, { color: col2, seg: 5 });
          if (size === 0) crystal(c, [0, 0.58, -0.32], [0, 1, -0.2], 0.04, 0.14, { color: "#9b95a6" });
          else {
            const n = [0, 3, 4, 6, 9][size];
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2;
              crystal(c, [Math.sin(a) * 0.1, 0.56 + (i % 2) * 0.02, -0.32 + Math.cos(a) * 0.12], [Math.sin(a) * 0.4, 1, Math.cos(a) * 0.3 - 0.2], 0.035 + 0.008 * size, 0.14 + 0.03 * size + (i % 3) * 0.04, { lit: T.glow, pulse: 0.35, phase: i });
            }
          }
          if (size === 1)
            // An egg of crystal carried on its back
            blob(c, "gloss", [0.0, 0.62, -0.16], [0.06, 0.07, 0.06], { color: "#b9a6d9", wd: 10, hd: 8 });
          if (T.crown) {
            // The geode: the abdomen split open, burning inside
            c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 1.2 }, () => blob(c, "glow", [0, 0.44, -0.55], [0.12, 0.1, 0.06], { color: VOID_HOT, bright: 2.3, wd: 12, hd: 8 }));
            for (let i = 0; i < 7; i++) {
              const a = (i / 7) * Math.PI * 2;
              crystal(c, [Math.sin(a) * 0.1, 0.44 + Math.cos(a) * 0.08, -0.56], [Math.sin(a) * 0.4, Math.cos(a) * 0.4, -1], 0.018, 0.08, { lit: true, color: VOID_HOT });
            }
          }
          // Silk spinnerets
          spike(c, "chitin", [0, 0.36, -0.57], [0, -0.3, -1], 0.025, 0.05, { color: col2, seg: 6 });
        });
        if (T.crown) crystalCrown(c, [0, 0.42, 0.12], 0.1, 5, 0.18);
      });
    });
}

/* ------------------------------ motion ------------------------------ */

/** A pose for every leg: `f(i, s, j)` for leg i (0 front … 3 back), side s, bone j */
function legs(f: (i: number, s: number, j: number) => BonePose | null): Pose {
  const out: Pose = {};
  for (const [S, s] of [["R", 1], ["L", -1]] as const)
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) {
        const p = f(i, s, j);
        if (p) out[`leg${S}${i}${j}`] = p;
      }
  return out;
}
/** The two sets of four legs that step together (right 0 and 2 with left 1 and 3) */
const setOf = (i: number, s: number) => ((i % 2 === 0) === s > 0 ? 1 : -1);

function spiderIdle(size: number) {
  const T = tierOf(size);
  return (c: IdleCtx) => {
    // Breathing in the abdomen, the body shifting on its legs, the fangs working, now and then a foreleg tasting the air
    const breath = c.sin(1.6);
    c.add("body", [0.03 * c.drift(0.4), 0.06 * c.glance(1, 3.8, 0.25), 0.02 * c.drift(0.3, 1)], [0, 0.01 * breath, 0]);
    c.add("abdomen", [0.05 * c.drift(0.5, 2) + 0.03 * breath, 0.05 * c.drift(0.35, 3), 0], null, 0.03 * breath);
    const chew = 0.15 * Math.max(0, c.sin(5, 1));
    c.add("fangR", [0, 0, -chew]);
    c.add("fangL", [0, 0, chew]);
    const taste = c.event(4, 5, 1.2);
    const leg = taste.k > 0.5 ? "legR0" : "legL0";
    c.add(`${leg}0`, [-0.5 * taste.e, 0, 0]);
    c.add(`${leg}1`, [0.4 * taste.e * Math.sin(c.t * 6), 0, 0]);
    if (T.orbit) circle(c, "shard", SHARDS, 0.7, 0.6, 0.4);
  };
}

/** The spider's gait: four legs lift and reach while the other four push, alternating, the body gliding level */
function scuttle(size: number): BossAction {
  const len = [0.45, 0.55, 0.65, 0.75, 1.0][size];
  const step = (sg: number): Pose =>
    merge(
      { body: { r: [0, 0.03 * sg, 0.02 * sg] }, abdomen: { r: [0, -0.06 * sg, 0] } },
      legs((i, s, j) => {
        const lift = setOf(i, s) * sg > 0;
        const fwd = s * (i < 2 ? 1 : 0.7);
        if (j === 0) return { r: [0, (lift ? -0.35 : 0.3) * fwd, lift ? -0.25 * s : 0] };
        if (j === 1) return lift ? { r: [0, 0, 0.3 * s] } : null;
        return null;
      })
    );
  return {
    len,
    idle: 0.2,
    keys: [
      { t: 0, pose: step(1) },
      { t: 0.5, pose: step(-1) },
      { t: 1, pose: step(1) }
    ]
  };
}

/** Rearing, the hind legs swing down and back under it so its feet keep the ground */
const rear = (k: number) => (i: number): BonePose | null => (i === 3 ? { r: [0.42 * k, 0, 0] } : i === 2 ? { r: [0.22 * k, 0, 0] } : null);

/** The strike: it rears on its hind legs, the forelegs raised and spread, then lunges down with its fangs */
function strike(size: number): BossAction {
  return {
    len: 2.0 + size * 0.1,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.32, pose: merge({ body: { r: [-0.3, 0, 0], p: [0, 0.08, -0.06] }, abdomen: { r: [0.3, 0, 0] }, fangR: { r: [0, 0, -0.4] }, fangL: { r: [0, 0, 0.4] } }, legs((i, s, j) => (j !== 0 ? null : i === 0 ? { r: [-0.8, 0, -0.5 * s] } : i === 1 ? { r: [-0.4, 0, -0.25 * s] } : rear(0.8)(i)))) },
      { t: 0.46, hold: true, pose: merge({ body: { r: [-0.38, 0, 0], p: [0, 0.12, -0.08] }, abdomen: { r: [0.36, 0, 0] }, fangR: { r: [0, 0, -0.5] }, fangL: { r: [0, 0, 0.5] } }, legs((i, s, j) => (j !== 0 ? null : i === 0 ? { r: [-0.95, 0, -0.6 * s] } : i === 1 ? { r: [-0.5, 0, -0.3 * s] } : rear(1)(i)))) },
      { t: 0.56, pose: merge({ body: { r: [0.3, 0, 0], p: [0, -0.06, 0.18] }, abdomen: { r: [-0.25, 0, 0] }, fangR: { r: [0, 0, 0.35] }, fangL: { r: [0, 0, -0.35] } }, legs((i, s, j) => (i === 0 && j === 0 ? { r: [0.4, 0, 0.2 * s] } : null))) },
      { t: 0.7, pose: merge({ body: { r: [0.22, 0.12, 0], p: [0, -0.04, 0.14] }, abdomen: { r: [-0.15, -0.1, 0] } }, legs((i, s, j) => (i === 0 && j === 0 ? { r: [0.25, 0, 0.1 * s] } : null))) },
      { t: 0.88, hold: true, pose: { body: { p: [0, 0, 0.04] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: { quake: 0.04 + size * 0.03, stop: 0.05, flash: size >= 2 ? 0.3 : 0.1, flashCol: "#ddd6fe", lines: size >= 2 ? 0.4 + size * 0.1 : 0, vig: size === 4 ? 0.35 : 0, vigCol: "#1e1b4b" } }]
  };
}

const SHRIEK: BossAction = {
  len: 3.0,
  idle: 0.25,
  keys: [
    { t: 0, pose: {} },
    { t: 0.22, hold: true, pose: merge({ body: { r: [0.15, 0, 0], p: [0, -0.04, 0] }, abdomen: { r: [-0.2, 0, 0] } }, legs((i, s, j) => (j === 1 ? { r: [0, 0, 0.2 * s] } : null))) },
    { t: 0.42, pose: merge({ body: { r: [-0.4, 0, 0], p: [0, 0.14, -0.08], g: 1.2 }, abdomen: { r: [0.45, 0, 0], g: 1.6, s: 0.08 }, fangR: { r: [0, 0, -0.6] }, fangL: { r: [0, 0, 0.6] } }, legs((i, s, j) => (j !== 0 ? null : i < 2 ? { r: [-0.9 + i * 0.3, 0, -0.7 * s] } : rear(1.05)(i)))) },
    { t: 0.76, hold: true, pose: merge({ body: { r: [-0.36, 0, 0], p: [0, 0.12, -0.07], g: 0.9 }, abdomen: { r: [0.4, 0, 0], g: 1.2 }, fangR: { r: [0, 0, -0.5] }, fangL: { r: [0, 0, 0.5] } }, legs((i, s, j) => (j !== 0 ? null : i < 2 ? { r: [-0.8 + i * 0.3, 0, -0.6 * s] } : rear(0.95)(i)))) },
    { t: 1, pose: {} }
  ],
  hits: [{ u: 0.42, cine: { quake: 0.12, vig: 0.6, vigCol: "#1e1b4b", lines: 0.9, flash: 0.25, flashCol: "#ddd6fe" } }]
};

function spiderDef(size: number): BossHeroDef {
  const T = tierOf(size);
  const S = BROOD_SIZES.spider.height[size] / UNIT;
  const boss = size === 4;
  const lag: Record<string, number> = { abdomen: 0.06, fangR: 0.03, fangL: 0.03 };
  for (const s of ["R", "L"]) for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) lag[`leg${s}${i}${j}`] = 0.01 + j * 0.02 + i * 0.008;
  return {
    build: spiderBuild(size),
    rest: { body: { r: [0.04, 0.05, 0] }, abdomen: { r: [-0.06, -0.05, 0] }, legR00: { r: [0, 0.06, 0] }, legL20: { r: [0, -0.05, 0] } },
    idle: spiderIdle(size),
    walk: scuttle(size),
    attack: strike(size),
    roar: boss ? SHRIEK : { len: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: {} }] },
    actions: voidActions("Fang strike", boss ? "Shriek" : undefined),
    lag,
    springs: { abdomen: 45 },
    burst: { at: [0, 0.05 * S, 0.5 * S], color: T.glow ? "#c4b5fd" : "#a8a29e", count: 20 + size * 10, speed: 1.2 * S, spread: 0.4 * S, size: 0.06 * S, gravity: 5 },
    aura: T.orbit ? aura(VOID, VOID_HOT, 0.4 * S, 1.1 * S, (boss ? 1.6 : 1.2) * S) : undefined,
    height: UNIT * S,
    frame: frameOf([2.4, 1.2, 0.3], S),
    sparks: boss
      ? (c) => {
          c.spark(SPARK.ember, [0, 0.6 * S, -0.3 * S], 12, { color: VOID, size: 0.04 * S, speed: 0.3, rise: 1.0 * S, reach: 0.6 * S, spread: 0.8 * S });
          c.spark(SPARK.mote, [0, 0.6 * S, 0], 8, { color: VOID_HOT, size: 0.04 * S, speed: 0.3, rise: 0.5 * S, reach: 0.6 * S, spread: 0.8 * S });
        }
      : undefined
  };
}

/** The Crystal Broodmother's brood, by size (rigged heroes, every copy in the same draws) */
export const SPIDER_HEROES: Record<string, BossHeroDef> = Object.fromEntries([0, 1, 2, 3, 4].map((i) => [vgType("spider", i), spiderDef(i)]));
