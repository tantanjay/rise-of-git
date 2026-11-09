import * as THREE from "three";
import { MOVE, V3 } from "./heroKit";
import { SPARK } from "./heroMaterials";
import { BonePose, BossAction, BossCtx, BossHeroDef, IdleCtx, Pose } from "./heroRig";
import { blob, chainBones, chainLag, chainPose, chainSprings, hook, merge, pathBones, seg, spike } from "./bossParts";
import { aura, sideOf } from "./heroCreatures";
import { BROOD_SIZES, vgType } from "./voidCreatures";
import { VOID, VOID_HOT, VOID_MATTE, circle, crack, crystal, crystalCrown, frameOf, orbiting, tierOf, voidActions } from "./heroVoidKit";

/* ------------------------------------------------------------------------- */
/* The Void Lion's pride in high graphics (Void Gate, coming soon)            */
/* ------------------------------------------------------------------------- */

/*
 * One lion grown up the ladder, its own rigged hero at every size: a body bone carrying four legs of three bones each
 * (the paw rides the last), a neck and head with a jaw and ears that flick, a mane on its own bone that springs, and a
 * tail of five bones ending in a tuft. A cub has a big head, big paws, short legs and faint spots and no mane; the young
 * lion grows the first ruff, violet at its tips; the maned lion a full dark mane, eyes that glow and a rift of light down
 * its spine; the crystal-maned lion a mane set with lit crystal and motes circling it; the Void Lion a mane of burning
 * shards, a crown of them over its brow and the rift torn open along both flanks. It prowls in a diagonal gait (the
 * shoulders rolling, the head held level), pounces with a swipe of the forepaws, and the boss roars.
 */

const FUR = ["#b9a184", "#b09a80", "#a5917b", "#998777", "#8c7c74"];
const FUR2 = ["#9a8468", "#917d64", "#86745f", "#7a6a5b", "#6d5f59"];
const BELLY = ["#d8c6a8", "#d0bfa3", "#c6b59d", "#bbab96", "#ae9f90"];
const MANE = ["#4a3a3a", "#45343f", "#3f2f42", "#382a44", "#302446"];
const NOSE = "#2a1f24";
const CLAW = "#e7e0d4";

/** Its unit height (the top of its head); a size is `BROOD_SIZES.lion.height` over this */
const UNIT = 1.35;
const TAIL = 5;
const MOTES = 5;

interface Look {
  head: number;
  leg: number;
  mane: number;
}
const LOOK: Look[] = [
  { head: 1.4, leg: 0.8, mane: 0 },
  { head: 1.15, leg: 0.95, mane: 0.45 },
  { head: 1, leg: 1, mane: 1 },
  { head: 1, leg: 1, mane: 1.15 },
  { head: 1, leg: 1, mane: 1.3 }
];

function lionBuild(size: number) {
  const T = tierOf(size);
  const L = LOOK[size];
  const S = BROOD_SIZES.lion.height[size] / UNIT;
  const fur = FUR[size];
  const fur2 = FUR2[size];
  const belly = BELLY[size];
  const mane = MANE[size];
  return (c: BossCtx) => {
    const rng = c.rng;
    c.k.frame([0, 0, 0], [0, 0, 0], S, () => {
      // Short legs lower the whole body (a cub)
      const lift = 1 - (1 - L.leg) * 0.55;
      c.k.frame([0, 0, 0], [0, 0, 0], 1, () =>
        c.bone("body", [0, 0.98 * lift, -0.05], () => {
          const y = (v: number) => v * lift;
          // The deep chest, the barrel, the haunches, a paler belly
          blob(c, "fur", [0, y(1.0), 0.52], [0.3, 0.36, 0.38], { color: fur, wd: 16, hd: 12 });
          seg(c, "fur", [0, y(1.03), 0.4], [0, y(1.04), -0.5], 0.28, 0.26, { color: fur, seg: 14, cap: false });
          blob(c, "fur", [0, y(1.04), -0.6], [0.29, 0.31, 0.32], { color: fur, wd: 16, hd: 10 });
          blob(c, "fur", [0, y(0.84), -0.02], [0.2, 0.13, 0.5], { color: belly, wd: 12, hd: 8 });
          blob(c, "fur", [0, y(0.92), 0.78], [0.2, 0.24, 0.12], { color: belly, wd: 12, hd: 8 });
          if (size === 0)
            // A cub's faint spots
            for (let i = 0; i < 10; i++) {
              const z = 0.45 - i * 0.11;
              const sd = i % 2 ? 1 : -1;
              blob(c, "fur", [sd * (0.24 + 0.03 * (i % 3)), y(1.08 - (i % 3) * 0.06), z], [0.035, 0.045, 0.045], { color: fur2, wd: 6, hd: 4 });
            }
          if (T.glow)
            // The rift down its spine, pulsing (torn open along both flanks on the boss)
            crack(c, Array.from({ length: 6 }, (_, i) => [0.012 * (i % 2 ? 1 : -1), y(1.3) - Math.abs(i - 2) * 0.012, 0.45 - i * 0.2] as V3), 0.02, VOID, { phase: 0 });
          if (T.crown)
            for (const s of [1, -1])
              crack(c, Array.from({ length: 5 }, (_, i) => [s * (0.29 - Math.abs(i - 2) * 0.012), y(1.05 + (i % 2 ? 0.05 : -0.03)), 0.35 - i * 0.2] as V3), 0.024, VOID_HOT, { phase: s, amp: 0.6 });
          for (const s of [1, -1]) {
            lionLeg(c, `legF${sideOf(s)}`, [[s * 0.2, y(0.98), 0.58], [s * 0.23, y(0.55), 0.6], [s * 0.21, 0.17, 0.63], [s * 0.21, 0.07, 0.68]], [0.16, 0.12, 0.09, 0.08], [[s * 0.21, y(0.8), 0.58], [0.16, 0.26, 0.18]], fur, fur2, L.leg);
            lionLeg(c, `legH${sideOf(s)}`, [[s * 0.2, y(1.0), -0.62], [s * 0.24, y(0.6), -0.45], [s * 0.22, 0.28, -0.74], [s * 0.21, 0.07, -0.66]], [0.19, 0.13, 0.095, 0.085], [[s * 0.22, y(0.86), -0.58], [0.18, 0.28, 0.25]], fur, fur2, L.leg);
          }
          // The tail, ending in a tuft (violet from the young lion up, lit on the epic and the boss)
          chainBones(
            c,
            "tail",
            [0, y(1.1), -0.88],
            [0.2, 0.2, 0.2, 0.19, 0.18],
            [0.35, 0.7, 0.95, 0.85, 0.55],
            [0.055, 0.05, 0.045, 0.04, 0.035, 0.03],
            { bucket: "fur", color: fur, seg: 8, yaw: [Math.PI, Math.PI, Math.PI, Math.PI, Math.PI] },
            undefined,
            (at, dir) => {
              blob(c, T.orbit ? "glow" : "fur", [at[0] + dir[0] * 0.06, at[1] + dir[1] * 0.06, at[2] + dir[2] * 0.06], [0.06, 0.06, 0.1], { color: T.orbit ? VOID : T.accent ? VOID_MATTE : mane, bright: T.orbit ? 1.4 : undefined, wd: 8, hd: 6 });
            }
          );
          lionHead(c, size, y, fur, fur2, belly, mane, rng);
        })
      );
      if (T.orbit) orbiting(c, "mote", MOTES, 1.0, (i, at) => crystal(c, [at[0], at[1] - 0.05, at[2]], [0.2, 1, 0.1 * i], 0.03, 0.11, { lit: true, color: i % 2 ? VOID : VOID_HOT }));
    });
  };
}

/** A leg of three bones along `pts`, its paw (a broad pad, toes, hooked claws) on the last */
function lionLeg(c: BossCtx, name: string, pts: V3[], radii: number[], thigh: [V3, V3], fur: string, fur2: string, k: number) {
  pathBones(
    c,
    name,
    pts,
    radii,
    { bucket: "fur", color: fur, seg: 9 },
    (j) => {
      if (j === 0) blob(c, "fur", thigh[0], thigh[1], { color: fur, wd: 12, hd: 8 });
    },
    (at) => {
      // A big paw (bigger still on a cub)
      const p = 1 / Math.max(0.7, k);
      blob(c, "fur", [at[0], 0.055, at[2] + 0.05], [0.085 * p, 0.055, 0.11 * p], { color: fur2, wd: 10, hd: 6 });
      for (let i = 0; i < 4; i++) {
        const x = at[0] + (i - 1.5) * 0.04 * p;
        blob(c, "fur", [x, 0.04, at[2] + 0.13 * p], [0.028 * p, 0.03, 0.035 * p], { color: fur, wd: 6, hd: 4 });
        hook(c, "matte", [x, 0.035, at[2] + 0.16 * p], [0, -0.3, 1], [0, -0.3, 0], 0.01, 0.04, 2, { color: CLAW });
      }
    }
  );
}

function lionHead(c: BossCtx, size: number, y: (v: number) => number, fur: string, fur2: string, belly: string, mane: string, rng: () => number) {
  const T = tierOf(size);
  const L = LOOK[size];
  const h = L.head;
  c.bone("neck", [0, y(1.15), 0.7], () => {
    seg(c, "fur", [0, y(1.1), 0.66], [0, y(1.3), 0.9], 0.19, 0.16, { color: fur, seg: 12 });
    if (L.mane > 0)
      // The mane: a ruff of locks round the neck and the back of the head, on its own bone (it springs)
      c.bone("mane", [0, y(1.3), 0.86], () => {
        const n = Math.round(10 + 10 * L.mane);
        const R = 0.2 + 0.08 * L.mane;
        // The mane's body: a thick ruff round the neck, down the chest and over the withers
        blob(c, "fur", [0, y(1.24), 0.8], [R + 0.06, R + 0.1, 0.24 + 0.05 * L.mane], { color: mane, wd: 16, hd: 12 });
        if (L.mane >= 1) {
          blob(c, "fur", [0, y(1.02), 0.82], [0.24, 0.24, 0.18], { color: mane, wd: 12, hd: 8 });
          blob(c, "fur", [0, y(1.36), 0.6], [0.26, 0.2, 0.26], { color: mane, wd: 12, hd: 8 });
        }
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const base: V3 = [Math.sin(a) * R * 0.95, y(1.3) + Math.cos(a) * R, 0.86 - 0.04];
          const len = (0.16 + 0.14 * L.mane) * (0.8 + rng() * 0.4) * (Math.cos(a) < -0.3 ? 1.25 : 1);
          const tip = T.accent && i % 2 === 0;
          spike(c, "fur", base, [Math.sin(a) * 0.8, Math.cos(a) * 0.7 + 0.05, -0.45], 0.08 + 0.04 * L.mane, len * 0.85, { color: tip && !T.glow ? VOID_MATTE : i % 3 ? mane : fur2, seg: 5 });
        }
        // A second, shorter rank behind it, over the shoulders
        if (L.mane >= 1)
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + 0.2;
            spike(c, "fur", [Math.sin(a) * R * 1.05, y(1.24) + Math.cos(a) * R * 0.9, 0.72], [Math.sin(a) * 0.7, Math.cos(a) * 0.6, -0.8], 0.08, 0.22 + rng() * 0.08, { color: mane, seg: 5 });
          }
        if (T.orbit)
          // The mane set with crystal: lit shards among the locks (a full mane of them on the boss)
          for (let i = 0; i < (T.crown ? 14 : 7); i++) {
            const a = (i / (T.crown ? 14 : 7)) * Math.PI * 2 + 0.3;
            crystal(c, [Math.sin(a) * R * 1.05, y(1.3) + Math.cos(a) * R * 1.05, 0.8], [Math.sin(a), Math.cos(a) + 0.1, -0.5], 0.035 + 0.01 * (i % 2), T.crown ? 0.3 + 0.08 * (i % 3) : 0.2, { lit: true, pulse: 0.3, phase: i });
          }
      });
    c.bone("head", [0, y(1.32), 0.92], () => {
      const h0: V3 = [0, y(1.34), 1.0];
      // The skull, broad cheeks, the long muzzle, a dark nose; a cub's head rounder and bigger
      c.k.frame(h0, [0, 0, 0], h, () => {
        blob(c, "fur", [0, 0, 0], [0.18, 0.17, 0.19], { color: fur, wd: 16, hd: 12 });
        for (const s of [1, -1]) blob(c, "fur", [s * 0.1, -0.06, 0.1], [0.1, 0.09, 0.1], { color: belly, wd: 10, hd: 8 });
        blob(c, "fur", [0, -0.07, 0.18], [0.1, 0.085, 0.12], { color: belly, wd: 12, hd: 8 });
        blob(c, "fur", [0, 0.02, 0.17], [0.075, 0.06, 0.12], { color: fur, wd: 10, hd: 6 });
        blob(c, "gloss", [0, -0.03, 0.29], [0.045, 0.03, 0.025], { color: NOSE, wd: 8, hd: 5 });
        for (const s of [1, -1]) {
          // A heavy brow over the eyes: dark on a cub, glowing from the maned lion up
          blob(c, "fur", [s * 0.075, 0.06, 0.14], [0.06, 0.025, 0.05], { color: fur2, wd: 8, hd: 4 });
          if (T.glow) c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 2.1, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.022, 8, 6), [s * 0.072, 0.03, 0.172], undefined, { color: VOID_HOT, bright: 2.4, scale: [1.3, 0.7, 0.6] }));
          else {
            blob(c, "gloss", [s * 0.072, 0.03, 0.165], [0.026, 0.02, 0.016], { color: "#d6c27a", wd: 8, hd: 5 });
            blob(c, "matte", [s * 0.072, 0.03, 0.178], [0.01, 0.016, 0.006], { color: "#140d0d", wd: 6, hd: 4 });
          }
          // Whisker pads
          blob(c, "fur", [s * 0.04, -0.06, 0.26], [0.04, 0.035, 0.03], { color: belly, wd: 8, hd: 5 });
        }
      });
      for (const s of [1, -1])
        // Round ears, set back on the skull (a cub's bigger), turning
        c.bone(`ear${sideOf(s)}`, [s * 0.12 * h, y(1.34) + 0.13 * h, 0.96], () => {
          c.k.add("fur", new THREE.SphereGeometry(0.06 * h, 10, 7), [s * 0.13 * h, y(1.34) + 0.17 * h, 0.95], [0, 0, -s * 0.3], { color: fur2, scale: [1, 1.05, 0.45] });
          c.k.add("matte", new THREE.SphereGeometry(0.04 * h, 8, 6), [s * 0.13 * h, y(1.34) + 0.165 * h, 0.968], [0, 0, -s * 0.3], { color: "#5a4646", scale: [1, 1.05, 0.3] });
        });
      if (T.crown) crystalCrown(c, [0, y(1.34) + 0.15, 1.02], 0.13, 5, 0.24);
      // The jaw, the fangs of a grown lion, a glow in the throat on the boss
      c.bone("jaw", [0, y(1.34) - 0.1 * h, 1.02], () => {
        seg(c, "fur", [0, y(1.34) - 0.12 * h, 1.04], [0, y(1.34) - 0.13 * h, 1.0 + 0.24 * h], 0.065 * h, 0.05 * h, { color: belly, seg: 9 });
        if (size >= 2) for (const s of [1, -1]) spike(c, "matte", [s * 0.035, y(1.34) - 0.1 * h, 1.0 + 0.23 * h], [0, 1, 0.05], 0.012, 0.05, { color: CLAW, seg: 5 });
        if (T.crown) c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 2.4 }, () => blob(c, "glow", [0, y(1.34) - 0.1 * h, 1.12], [0.04, 0.015, 0.1], { color: VOID, bright: 1.7 }));
      });
      if (size >= 2) for (const s of [1, -1]) spike(c, "matte", [s * 0.035, y(1.34) - 0.075, 1.0 + 0.24], [0, -1, 0.05], 0.013, 0.06, { color: CLAW, seg: 5 });
    });
  });
}

/* ------------------------------ motion ------------------------------ */

const tail = (f: (j: number) => BonePose | null): Pose => chainPose("tail", TAIL, f);
/** Each leg's three bones: `front` and `hind` give a side's pose (s 1 right, -1 left) for a bone index */
function legs(front: (j: number, s: number) => BonePose | null, hind: (j: number, s: number) => BonePose | null): Pose {
  const out: Pose = {};
  for (const [S, s] of [["R", 1], ["L", -1]] as const)
    for (let j = 0; j < 3; j++) {
      const f = front(j, s);
      const h = hind(j, s);
      if (f) out[`legF${S}${j}`] = f;
      if (h) out[`legH${S}${j}`] = h;
    }
  return out;
}

function lionIdle(size: number) {
  const T = tierOf(size);
  const playful = size === 0 ? 1.6 : 1;
  return (c: IdleCtx) => {
    // A deep breath, a pant, weight from paw to paw, the head glancing round, ears flicking, the tail sweeping
    const breath = c.sin(1.4);
    const shift = c.drift(0.27);
    c.add("body", [0.012 * c.drift(0.4), 0.02 * c.drift(0.2, 2), 0.025 * shift], [0.02 * shift, 0.012 * breath, 0], 0.01 * breath);
    c.add("neck", [0.05 * c.drift(0.33, 1), 0.2 * playful * c.glance(1, 4.4, 0.35), 0]);
    c.add("head", [0.07 * c.drift(0.5, 2), 0.12 * c.glance(2, 3.1, 0.25), 0.05 * c.drift(0.4) * playful]);
    c.add("jaw", [0.04 + 0.03 * breath, 0, 0]);
    const flickL = c.event(3, 3.6, 0.3);
    const flickR = c.event(4, 4.1, 0.3);
    c.add("earL", [-0.25 * flickL.e, 0.35 * flickL.e, 0]);
    c.add("earR", [-0.2 * flickR.e, -0.35 * flickR.e, 0]);
    if (LOOK[size].mane > 0) c.add("mane", [0.03 * c.drift(0.6, 3), 0, 0.03 * c.drift(0.5, 1)]);
    // Now and then a yawn (wide on the boss), or a forepaw lifted and set down
    const yawn = c.event(6, 13, 2.2);
    c.add("jaw", [0.5 * yawn.e, 0, 0]);
    c.add("head", [-0.25 * yawn.e, 0, 0]);
    const paw = c.event(5, 7, 0.9);
    const lifted = paw.k > 0.5 ? "legFR" : "legFL";
    c.add(`${lifted}0`, [-0.3 * paw.e, 0, 0]);
    c.add(`${lifted}1`, [0.6 * paw.e, 0, 0]);
    c.add(`${lifted}2`, [-0.35 * paw.e, 0, 0]);
    for (let j = 0; j < TAIL; j++) c.add(`tail${j}`, [0.05 * Math.sin(c.t * 0.9 - j * 0.5), 0.2 * playful * Math.sin(c.t * 0.75 - j * 0.6 + 1), 0]);
    if (T.orbit) circle(c, "mote", MOTES, 0.95, 0.55, 0.4);
  };
}

/** The prowl: a diagonal gait (front right with hind left), the shoulders rolling, the head held level, the tail swaying */
function prowl(size: number): BossAction {
  const len = [0.75, 0.95, 1.1, 1.2, 1.4][size];
  const step = (sg: number): Pose =>
    merge(
      { body: { p: [0, -0.02, 0], r: [0.02, 0.05 * sg, 0.03 * sg] }, neck: { r: [0.04, -0.06 * sg, 0] }, head: { r: [-0.04, 0.04 * sg, 0] } },
      // The leg in front reaches, the other pushes back; front right with hind left
      legs(
        (j, s) => (j === 0 ? { r: [-0.38 * sg * s, 0, 0] } : j === 1 ? { r: [sg * s > 0 ? 0.15 : 0.35, 0, 0] } : { r: [sg * s > 0 ? -0.05 : -0.25, 0, 0] }),
        (j, s) => (j === 0 ? { r: [0.32 * sg * s, 0, 0] } : j === 1 ? { r: [sg * s < 0 ? 0.0 : -0.3, 0, 0] } : { r: [sg * s < 0 ? 0.05 : 0.3, 0, 0] })
      ),
      tail((j) => ({ r: [0.03, 0.12 * sg * (j + 1) * 0.4, 0] }))
    );
  const pass = (sg: number): Pose =>
    merge(
      { body: { p: [0, 0.025, 0], r: [0, 0, 0] } },
      // The swinging legs lift high as they pass
      legs(
        (j, s) => (sg * s < 0 ? (j === 1 ? { r: [0.85, 0, 0] } : j === 2 ? { r: [-0.6, 0, 0] } : null) : null),
        (j, s) => (sg * s > 0 ? (j === 1 ? { r: [-0.6, 0, 0] } : j === 2 ? { r: [0.7, 0, 0] } : null) : null)
      ),
      tail(() => ({ r: [0.05, 0, 0] }))
    );
  return {
    len,
    idle: 0.25,
    keys: [
      { t: 0, pose: step(1) },
      { t: 0.25, pose: pass(1) },
      { t: 0.5, pose: step(-1) },
      { t: 0.75, pose: pass(-1) },
      { t: 1, pose: step(1) }
    ]
  };
}

/** The pounce: a crouch with the haunches wound, the spring, both forepaws raking down, the landing */
function pounce(size: number): BossAction {
  const k = 0.7 + size * 0.1;
  return {
    len: 2.2 + size * 0.1,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.28, pose: merge({ body: { r: [0.1, 0, 0], p: [0, -0.14, -0.12] }, neck: { r: [0.25, 0, 0] }, head: { r: [-0.15, 0, 0] }, earL: { r: [0.5, 0, 0] }, earR: { r: [0.5, 0, 0] } }, legs((j) => (j === 0 ? { r: [-0.3, 0, 0] } : j === 1 ? { r: [0.55, 0, 0] } : { r: [-0.3, 0, 0] }), (j) => (j === 0 ? { r: [-0.4, 0, 0] } : j === 1 ? { r: [0.5, 0, 0] } : { r: [-0.12, 0, 0] })), tail(() => ({ r: [-0.05, 0, 0] }))) },
      { t: 0.42, hold: true, pose: merge({ body: { r: [0.12, 0, 0], p: [0, -0.18, -0.16] }, neck: { r: [0.28, 0, 0] }, head: { r: [-0.18, 0, 0] }, jaw: { r: [0.3, 0, 0] }, earL: { r: [0.55, 0, 0] }, earR: { r: [0.55, 0, 0] } }, legs((j) => (j === 0 ? { r: [-0.35, 0, 0] } : j === 1 ? { r: [0.65, 0, 0] } : { r: [-0.35, 0, 0] }), (j) => (j === 0 ? { r: [-0.48, 0, 0] } : j === 1 ? { r: [0.6, 0, 0] } : { r: [-0.15, 0, 0] }))) },
      // The spring: forequarters up, both forepaws high and wide, claws out
      { t: 0.52, pose: merge({ body: { r: [-0.35, 0, 0], p: [0, 0.28 * k, 0.45 * k] }, neck: { r: [-0.1, 0, 0] }, head: { r: [0.1, 0, 0] }, jaw: { r: [0.6, 0, 0] } }, legs((j, s) => (j === 0 ? { r: [-1.25, 0, 0.25 * s] } : j === 1 ? { r: [-0.3, 0, 0] } : { r: [0.4, 0, 0] }), (j) => (j === 0 ? { r: [0.55, 0, 0] } : j === 1 ? { r: [-0.35, 0, 0] } : null)), tail(() => ({ r: [-0.15, 0, 0] }))) },
      // Down they rake: the impact
      { t: 0.6, pose: merge({ body: { r: [0.12, 0, 0], p: [0, -0.04, 0.75 * k] }, neck: { r: [0.2, 0, 0] }, head: { r: [0.15, 0, 0] }, jaw: { r: [0.1, 0, 0] } }, legs((j) => (j === 0 ? { r: [-0.55, 0, 0] } : j === 1 ? { r: [0.15, 0, 0] } : null), (j) => (j === 0 ? { r: [0.3, 0, 0] } : null))) },
      { t: 0.74, pose: merge({ body: { r: [0.08, 0, 0.04], p: [0, -0.05, 0.6 * k] }, neck: { r: [0.15, 0.15, 0] }, head: { r: [0.2, 0.15, 0.1] } }, legs((j) => (j === 0 ? { r: [-0.25, 0, 0] } : null), (j) => (j === 0 ? { r: [0.18, 0, 0] } : null))) },
      { t: 0.88, hold: true, pose: { body: { p: [0, 0, 0.12] }, neck: { r: [0.05, -0.05, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.6, burst: true, cine: { quake: 0.06 + size * 0.03, stop: 0.05 + size * 0.01, flash: size >= 2 ? 0.3 : 0.1, flashCol: "#ddd6fe", lines: size >= 2 ? 0.6 + size * 0.08 : 0, vig: size === 4 ? 0.3 : 0, vigCol: "#1e1b4b" } }]
  };
}

/** The roar (the boss): head low drawing breath, then thrown up, jaw wide, the mane bristling and blazing */
const LION_ROAR: BossAction = {
  len: 3.2,
  idle: 0.25,
  keys: [
    { t: 0, pose: {} },
    { t: 0.22, hold: true, pose: merge({ body: { r: [0.06, 0, 0], p: [0, -0.05, 0] }, neck: { r: [0.2, 0, 0] }, head: { r: [0.2, 0, 0] }, earL: { r: [0.3, 0, 0] }, earR: { r: [0.3, 0, 0] } }, tail(() => ({ r: [0.05, 0, 0] }))) },
    { t: 0.42, pose: merge({ body: { r: [-0.12, 0, 0], p: [0, 0.05, -0.06], g: 1 }, neck: { r: [-0.5, 0, 0] }, head: { r: [-0.35, 0, 0], g: 1.4 }, jaw: { r: [0.7, 0, 0] }, mane: { s: 0.12, g: 1.8 }, earL: { r: [0.5, 0.2, 0] }, earR: { r: [0.5, -0.2, 0] } }, legs((j) => (j === 0 ? { r: [-0.1, 0, 0] } : j === 1 ? { r: [0.08, 0, 0] } : null), () => null), tail((j) => ({ r: [-0.15 + j * 0.06, 0, 0] }))) },
    { t: 0.76, hold: true, pose: merge({ body: { r: [-0.1, 0, 0], p: [0, 0.04, -0.05], g: 0.8 }, neck: { r: [-0.45, 0.05, 0] }, head: { r: [-0.32, 0, 0.04], g: 1.1 }, jaw: { r: [0.65, 0, 0] }, mane: { s: 0.1, g: 1.4 } }, tail((j) => ({ r: [-0.1 + j * 0.05, 0, 0] }))) },
    { t: 1, pose: {} }
  ],
  hits: [{ u: 0.42, cine: { quake: 0.12, vig: 0.6, vigCol: "#1e1b4b", lines: 0.9, flash: 0.25, flashCol: "#ddd6fe" } }]
};

function lionDef(size: number): BossHeroDef {
  const T = tierOf(size);
  const S = BROOD_SIZES.lion.height[size] / UNIT;
  const boss = size === 4;
  return {
    build: lionBuild(size),
    rest: { neck: { r: [0.04, 0.08, 0] }, head: { r: [0.05, 0.06, 0.04] }, earL: { r: [0, 0.1, 0] }, legFL1: { r: [0.05, 0, 0] }, legHR0: { r: [0.04, 0, 0] }, tail0: { r: [0.05, 0.12, 0] }, tail1: { r: [0.05, 0.08, 0] } },
    idle: lionIdle(size),
    walk: prowl(size),
    attack: pounce(size),
    roar: boss ? LION_ROAR : { len: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: {} }] },
    actions: voidActions(size === 0 ? "Pounce" : "Pounce and rake", boss ? "Roar" : undefined),
    lag: { neck: 0.03, head: 0.06, jaw: 0.04, earL: 0.1, earR: 0.11, mane: 0.07, ...chainLag("tail", TAIL, 0.05, 0.05), legFL1: 0.03, legFR1: 0.03, legFL2: 0.06, legFR2: 0.06, legHL2: 0.05, legHR2: 0.05 },
    springs: { earL: 90, earR: 90, mane: 60, ...chainSprings("tail", TAIL, 55, 1) },
    burst: { at: [0, 0.1 * S, 1.6 * S], color: T.glow ? "#a78bfa" : "#a8a29e", count: 20 + size * 10, speed: 1.4 * S, spread: 0.6 * S, size: 0.08 * S, gravity: 5 },
    aura: T.orbit ? aura(VOID, VOID_HOT, 0.5 * S, 1.3 * S, (boss ? 2.2 : 1.4) * S) : undefined,
    height: UNIT * S,
    frame: frameOf([4.2, 1.9, 0.8], S),
    sparks: boss
      ? (c) => {
          c.spark(SPARK.ember, [0, 1.2 * S, 0.6 * S], 14, { color: VOID, size: 0.05 * S, speed: 0.3, rise: 1.2 * S, reach: 0.8 * S, spread: 1.0 * S });
          c.spark(SPARK.wisp, [0, 1.1 * S, 0], 10, { color: VOID_HOT, size: 0.06 * S, speed: 0.12, rise: 0.8 * S, reach: 1.2 * S, spread: 1.4 * S });
        }
      : undefined
  };
}

/** The Void Lion's pride, by size (rigged heroes, every copy in the same draws) */
export const LION_HEROES: Record<string, BossHeroDef> = Object.fromEntries([0, 1, 2, 3, 4].map((i) => [vgType("lion", i), lionDef(i)]));


