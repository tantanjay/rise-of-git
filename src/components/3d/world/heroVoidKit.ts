import * as THREE from "three";
import { MOVE, TAU, V3, rubble } from "./heroKit";
import { BossCtx, BossHeroDef, IdleCtx, Pose } from "./heroRig";
import { blob, merge, seg, toward } from "./bossParts";
import { add, mid, norm, sub } from "./heroCreatures";

/* ------------------------------------------------------------------------- */
/* The Void Gate's creatures in high graphics: what every family shares       */
/* ------------------------------------------------------------------------- */

/*
 * Every size of every family is a rigged hero (`heroRig.ts`, drawn by `BossBatch`), built at a unit size and grown by
 * `S` inside its build (bone pivots, poses and shifts grow with the frame), climbing the ladder by its tier: 0 common
 * (matte, no glow), 1 uncommon (one accent in a real material, a small prop), 2 rare (one looping glow), 3 epic (more
 * glow, orbiting bits, an aura of embers), 4 legendary (a crown, a burning core, sparks). No beam, no ground disc.
 */

export const VOID = "#a855f7";
export const VOID_HOT = "#e9d5ff";
export const VOID_DEEP = "#7c3aed";
/** The uncommon accent: violet in a real material, unlit */
export const VOID_MATTE = "#7e4fc4";
export const CRIMSON = "#e11d48";
export const PRISM = ["#f0abfc", "#67e8f9", "#fde68a", "#fb7185", "#a5b4fc"];

/** What each tier adds, so every family reads the same rung the same way */
export interface Tier {
  t: number;
  accent: boolean;
  glow: boolean;
  orbit: boolean;
  crown: boolean;
}
export const tierOf = (t: number): Tier => ({ t, accent: t >= 1, glow: t >= 2, orbit: t >= 3, crown: t >= 4 });

/** A lump of rock (an icosphere with every corner pushed in or out), `r` its radii */
export function rock(c: BossCtx, bucket: string, at: V3, r: V3, seed: number, color: string, rot: V3 = [0, 0, 0]) {
  c.k.add(bucket, rubble(1, seed), at, rot, { color, scale: r });
}

/** A lump of rock laid from `a` to `b` (a stone limb), `r` thick */
export function rockAlong(c: BossCtx, bucket: string, a: V3, b: V3, r: number, seed: number, color: string, flat = 1) {
  const d = sub(b, a);
  const len = Math.hypot(...d);
  c.k.add(bucket, rubble(1, seed), mid(a, b), undefined, { color, quat: toward(norm(d)), scale: [r, (len / 2) * 1.2, r * flat] });
}

/** A crystal growing from `at` along `dir`: a six-sided prism capped with a point; lit ones glow (and pulse with `pulse`) */
export function crystal(c: BossCtx, at: V3, dir: V3, r: number, len: number, o: { lit?: boolean; color?: string; pulse?: number; phase?: number; bright?: number } = {}) {
  const q = toward(norm(dir));
  const bucket = o.lit ? "glow" : "gloss";
  const color = o.color ?? (o.lit ? VOID : VOID_MATTE);
  const body = () => {
    c.k.add(bucket, new THREE.CylinderGeometry(r * 0.78, r, len * 0.68, 6), add(at, norm(dir), len * 0.34), undefined, { color, quat: q, bright: o.lit ? (o.bright ?? 1.5) : undefined });
    c.k.add(bucket, new THREE.ConeGeometry(r * 0.78, len * 0.32, 6), add(at, norm(dir), len * 0.84), undefined, { color: o.lit ? VOID_HOT : color, quat: q, bright: o.lit ? (o.bright ?? 1.5) * 1.1 : undefined });
  };
  if (o.lit && o.pulse) c.k.move({ kind: MOVE.pulse, amp: o.pulse, speed: 1.6, phase: o.phase ?? 0 }, body);
  else body();
}

/** A glowing crack along a path (rare up: void light through stone, a rift down a spine), pulsing */
export function crack(c: BossCtx, pts: V3[], r: number, color = VOID, o: { amp?: number; speed?: number; phase?: number; bright?: number } = {}) {
  c.k.move({ kind: MOVE.pulse, amp: o.amp ?? 0.45, speed: o.speed ?? 1.3, phase: o.phase ?? 0 }, () => {
    for (let i = 0; i < pts.length - 1; i++) seg(c, "glow", pts[i], pts[i + 1], r, r * 0.8, { color, bright: o.bright ?? 1.7, seg: 5 });
  });
}

/** An eye that glows (rare up) and swells with the breath, or a dark pit (below) */
export function eye(c: BossCtx, at: V3, r: number, lit: boolean, color = VOID_HOT, phase = 0) {
  if (!lit) return blob(c, "matte", at, [r, r * 0.75, r * 0.6], { color: "#0b0712", wd: 7, hd: 5 });
  c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.9, phase }, () => c.k.add("glow", new THREE.SphereGeometry(r, 8, 6), at, undefined, { color, bright: 2.2, scale: [1.2, 0.75, 0.6] }));
}

/** Bits circling a body (`${name}0…`), each its own bone the idle carries round (`circle`) */
export function orbiting(c: BossCtx, name: string, n: number, y: number, body: (i: number, at: V3) => void) {
  for (let i = 0; i < n; i++) c.bone(`${name}${i}`, [0, y, 0], () => body(i, [0, y, 0]));
}

/** Carries `${name}0…` round at radius `R` (unit size: the bones grow it), each on its own tilted path, wider while it acts */
export function circle(c: IdleCtx, name: string, n: number, R: number, speed = 0.6, tilt = 0.3) {
  for (let i = 0; i < n; i++) {
    const a = c.t * (speed + i * 0.07) + (i * TAU) / n + c.seed * 2;
    const r = R + 0.08 * Math.sin(c.t * 0.4 + i) + 0.25 * c.busy;
    const tl = tilt * Math.sin(i * 2.3 + 0.5);
    c.carry(`${name}${i}`, [c.t * 1.1 + i, c.t * 0.7 + i * 2, 0], [Math.cos(a) * r, Math.sin(a) * tl * R + 0.12 * Math.sin(a * 2 + i), Math.sin(a) * r]);
  }
}

/** A crown of crystal points round a head at `h0` (radius `r`): the legendary's */
export function crystalCrown(c: BossCtx, h0: V3, r: number, n: number, len: number, o: { lit?: boolean; color?: string } = {}) {
  for (let i = 0; i < n; i++) {
    const a = ((i - (n - 1) / 2) / Math.max(1, n - 1)) * 2.4;
    const at: V3 = [h0[0] + Math.sin(a) * r, h0[1], h0[2] + Math.cos(a) * r * 0.8];
    crystal(c, at, [Math.sin(a) * 0.35, 1, Math.cos(a) * 0.15 - 0.1], len * 0.18, len * (i === Math.floor(n / 2) ? 1.3 : 0.8 + 0.25 * Math.cos(a * 2)), { lit: o.lit ?? true, color: o.color, pulse: 0.3, phase: i });
  }
}

/** A def's Codex frame grown by `S`: camera distance, camera height, look-at height */
export const frameOf = (f: [number, number, number], S: number): [number, number, number] => [f[0] * S, f[1] * S, f[2] * S];

/** A pose for both sides at once */
export const both = (name: (s: "L" | "R") => string, r: V3): Pose => ({ [name("L")]: { r }, [name("R")]: { r: [r[0], -r[1], -r[2]] } });

export { merge };

/** The Codex buttons for a family's creature: idle, walk, its strike, and the boss's roar */
export function voidActions(attack: string, roar?: string): BossHeroDef["actions"] {
  return [{ id: "idle", label: "Idle" }, { id: "walk", label: "Walk" }, ...(roar ? [{ id: "roar" as const, label: roar }] : []), { id: "attack", label: attack }];
}
