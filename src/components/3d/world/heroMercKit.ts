import * as THREE from "three";
import { TAU, V3 } from "./heroKit";
import { cloth, grainRound } from "./heroMaterials";
import { BossAction, BossCtx, BossHeroDef, Cine, IdleCtx, Pose } from "./heroRig";
import { blob, chainBones, chainLag, chainPose, chainSprings, hook, merge, onBlob, plate, seg, spike, stud } from "./bossParts";
import { across, add, cloak, cross, mid, norm, sideOf, sub } from "./heroCreatures";

/* ------------------------------------------------------------------------- */
/* The mercenary kit: people on the rig, for every civilization's pool       */
/* ------------------------------------------------------------------------- */

/*
 * Valoria's, Sylvandale's, Ironforge's and Drak'mar's bands are people of one build, so they share the bones and the
 * motion: each band is a rigged hero (`heroRig.ts`, drawn by `BossBatch`, every copy in the same draws) whose builder puts
 * its own clothes, armour, head and weapons on the joints below, and whose idle, march and strike come from the
 * generators here, tuned per band. Bones always carry these names: thighR/L, shinR/L (the feet ride the shins), hips,
 * chest, armR/L, foreR/L, handR/L, head, and `cape0`… for a cape, so the march and the idle reach every band alike.
 * Everything a builder adds goes inside a bone (nothing of a person stays on the root, which never turns).
 */

export { add, mid, norm, sub, cross, across, sideOf };

/** Where a person's joints sit: a man of height 1, a stocky dwarf, a tall elf, a hulking orc */
export interface Joints {
  h: number;
  w: number;
  ankle: number;
  knee: number;
  hip: number;
  hipX: number;
  chest: number;
  sh: number;
  shX: number;
  neck: number;
  head: number;
  /** Head radii */
  hr: V3;
}

/** Joints for a person `h` tall (1 = a man, head at about 1.92), `w` broad, legs `leg` as long as a man's */
export function joints(h: number, w: number, leg = 1, head = 1): Joints {
  const ankle = 0.12 * h;
  const knee = ankle + 0.4 * h * leg;
  const hip = knee + 0.41 * h * leg;
  const sh = hip + 0.73 * h;
  const neck = sh + 0.1 * h;
  return {
    h,
    w,
    ankle,
    knee,
    hip,
    hipX: 0.15 * w,
    chest: hip + 0.15 * h,
    sh,
    shX: 0.3 * w,
    neck,
    head: neck + 0.16 * h * head,
    hr: [0.1 * h * head, 0.12 * h * head, 0.105 * h * head]
  };
}

/* ------------------------------ hands ------------------------------ */

/** A fist round a grip running along `d` (the grip passes through it): the hand, its knuckles, a thumb over the grip */
export function fist(c: BossCtx, bucket: string, at: V3, d: V3, s: number, color: string, size = 1) {
  blob(c, bucket, at, [0.055 * size, 0.06 * size, 0.06 * size], { color, wd: 9, hd: 7 });
  const side = norm(cross(d, [0, 0, 1]));
  for (let i = 0; i < 4; i++) blob(c, bucket, add(add(at, d, (i - 1.5) * 0.026 * size), [0, 0, 0.045 * size]), [0.02 * size, 0.018 * size, 0.022 * size], { color, wd: 6, hd: 4 });
  seg(c, bucket, add(at, side, -s * 0.04 * size), add(add(at, d, 0.05 * size), [0, 0, 0.04 * size]), 0.017 * size, 0.014 * size, { color, seg: 6 });
}

/** An open hand at `at`, palm turned toward `up`, fingers reaching along `along` and curling by `curl` */
export function openHand(c: BossCtx, bucket: string, at: V3, up: V3, along: V3, s: number, color: string, curl = 0.35, size = 1) {
  plate(c, bucket, at, up, along, 0.05 * size, 0.022 * size, 0.06 * size, { color, wd: 9 });
  const side = norm(cross(up, along));
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.024 * size;
    const root = add(add(at, along, 0.05 * size), side, x);
    const dir = norm(add(along, side, x * 1.5));
    hook(c, bucket, root, dir, [up[0] * curl, up[1] * curl, up[2] * curl], 0.012 * size, (0.085 - Math.abs(i - 1.5) * 0.012) * size, 3, { color });
  }
  hook(c, bucket, add(add(at, side, s * 0.045 * size), along, 0.01), norm(add(side, along, -0.6 * s)).map((v) => v * s) as V3, [0, 0.1, 0.1], 0.013 * size, 0.065 * size, 2, { color });
}

/** A turn whose +x runs along `d` and +y along `side` (a blade's length and breadth) */
export function basis(d: V3, side: V3): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...d), new THREE.Vector3(...side), new THREE.Vector3(...norm(cross(d, side)))));
}

/** A flat blade `L` long and `w` broad along +x, `t` thick: a sword's (tapering to a point), a cleaver's (square), a leaf's */
export function bladeGeo(L: number, w: number, t = 0.012, shape: BladeShape = "sword"): THREE.BufferGeometry {
  const b = new THREE.Shape();
  if (shape === "axe") {
    // A crescent axe head: narrow at the haft, flaring to a curved edge, bearded below
    b.moveTo(0, -w * 0.12);
    b.lineTo(L * 0.5, -w * 0.2);
    b.quadraticCurveTo(L * 0.75, -w * 0.32, L * 0.93, -w * 0.52);
    b.quadraticCurveTo(L * 1.12, 0, L * 0.93, w * 0.5);
    b.quadraticCurveTo(L * 0.75, w * 0.3, L * 0.5, w * 0.18);
    b.lineTo(0, w * 0.12);
  } else if (shape === "cleaver") {
    b.moveTo(0, -w * 0.5);
    b.lineTo(L * 0.92, -w * 0.75);
    b.lineTo(L, w * 0.3);
    b.lineTo(L * 0.7, w * 0.5);
    b.lineTo(0, w * 0.5);
  } else if (shape === "leaf") {
    b.moveTo(0, -w * 0.3);
    b.quadraticCurveTo(L * 0.45, -w * 0.9, L, 0);
    b.quadraticCurveTo(L * 0.45, w * 0.9, 0, w * 0.3);
  } else if (shape === "curve") {
    b.moveTo(0, -w * 0.5);
    b.quadraticCurveTo(L * 0.6, -w * 0.7, L, w * 0.5);
    b.quadraticCurveTo(L * 0.6, w * 0.1, 0, w * 0.5);
  } else {
    b.moveTo(0, -w * 0.5);
    b.lineTo(L * 0.82, -w * 0.4);
    b.lineTo(L, 0);
    b.lineTo(L * 0.82, w * 0.4);
    b.lineTo(0, w * 0.5);
  }
  // A thin leaf or blade (a centimetre or so) takes no bevel: it can't be seen, and it triples the vertices
  const bevel = t > 0.0125;
  return new THREE.ExtrudeGeometry(b, { depth: t, bevelEnabled: bevel, bevelThickness: t * 0.5, bevelSize: t * 0.5, bevelSegments: 1, curveSegments: 4 }).translate(0, 0, -t / 2);
}

export type BladeShape = "sword" | "leaf" | "cleaver" | "curve" | "axe";

/** A blade laid from `at` along `d`, broad along `side` */
export function blade(c: BossCtx, bucket: string, at: V3, d: V3, side: V3, L: number, w: number, color: string, o: { t?: number; shape?: BladeShape; bright?: number } = {}) {
  c.k.add(bucket, bladeGeo(L, w, o.t ?? 0.012, o.shape), at, undefined, { color, quat: basis(d, side), bright: o.bright });
}

export interface SwordLook {
  blade: string;
  bladeBucket?: string;
  guard: string;
  grip: string;
  pommel?: string;
  metal?: string;
  L?: number;
  w?: number;
  shape?: BladeShape;
  bright?: number;
}

/** A sword gripped in the fist at `wr`, its blade out along `d`: grip, cross-guard, pommel and blade */
export function sword(c: BossCtx, wr: V3, d: V3, s: number, fistColor: string, look: SwordLook, fistBucket = "matte") {
  const m = look.metal ?? "iron";
  fist(c, fistBucket, wr, d, s, fistColor, 1.1);
  seg(c, "matte", add(wr, d, -0.11), add(wr, d, 0.1), 0.02, 0.02, { color: look.grip, seg: 6, cap: false });
  blob(c, m, add(wr, d, -0.13), [0.035, 0.035, 0.035], { color: look.pommel ?? look.guard, wd: 8, hd: 6 });
  const side = norm(cross(d, [0, 0, 1]));
  const g = add(wr, d, 0.12);
  seg(c, m, add(g, side, -0.12), add(g, side, 0.12), 0.018, 0.018, { color: look.guard, seg: 6 });
  blade(c, look.bladeBucket ?? m, add(g, d, 0.01), d, side, look.L ?? 0.8, look.w ?? 0.08, look.blade, { shape: look.shape, bright: look.bright });
}

/** A straight shaft through the fist at `wr` along `d`, `back` behind and `fore` ahead (a spear, a staff, a haft) */
export function shaft(c: BossCtx, wr: V3, d: V3, back: number, fore: number, r: number, color: string, bucket = "matte") {
  seg(c, bucket, add(wr, d, -back), add(wr, d, fore), r, r * 0.92, { color, seg: 8, cap: false, surf: bucket === "matte" ? grainRound(r) : undefined });
}

/** A round shield facing `n` at `o`, `R` across: painted boards, a rim, a boss (and studs from rare up) */
export function roundShield(c: BossCtx, o: V3, n: V3, R: number, face: string, rim: string, boss: string, o2: { bucket?: string; rimBucket?: string; studs?: number; studColor?: string } = {}) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
  c.k.add(o2.bucket ?? "matte", new THREE.CylinderGeometry(R, R, 0.05, 26), o, undefined, { color: face, quat: q });
  c.k.add(o2.rimBucket ?? "iron", new THREE.TorusGeometry(R, 0.03, 5, 30), o, undefined, { color: rim, quat: across(n) });
  blob(c, o2.rimBucket ?? "iron", add(o, n, 0.03), [R * 0.26, R * 0.26, R * 0.26], { color: boss, wd: 12, hd: 8 });
  const u = norm(cross(n, [0, 1, 0]));
  for (let i = 0; i < (o2.studs ?? 0); i++) {
    const a = (i / (o2.studs ?? 1)) * TAU + 0.39;
    const p = add(add(o, n, 0.027), add(u.map((v) => v * Math.cos(a) * R * 0.74) as V3, [0, Math.sin(a) * R * 0.74, 0]));
    stud(c, o2.rimBucket ?? "iron", p, n, 0.02, 0.014, { color: o2.studColor ?? rim });
  }
}

/** A kite or tower shield facing `n` at `o`: `w` wide, `h` tall, its point `point` long below (0 for a tower) */
export function tallShield(c: BossCtx, o: V3, n: V3, w: number, h: number, point: number, face: string, rim: string, o2: { bucket?: string; rimBucket?: string } = {}) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(w / 2, -h / 2 + point * 0.3);
  if (point > 0) s.quadraticCurveTo(w * 0.4, -h / 2 - point * 0.4, 0, -h / 2 - point);
  else s.lineTo(w / 2, -h / 2);
  if (point > 0) s.quadraticCurveTo(-w * 0.4, -h / 2 - point * 0.4, -w / 2, -h / 2 + point * 0.3);
  else s.lineTo(-w / 2, -h / 2);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 1, curveSegments: 6 }).translate(0, 0, -0.025);
  const side = norm(cross([0, 1, 0], n));
  const up = norm(cross(n, side));
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...side), new THREE.Vector3(...up), new THREE.Vector3(...n)));
  c.k.add(o2.bucket ?? "matte", geo, o, undefined, { color: face, quat: q });
  // The rim: a raised edge round the top and down the sides
  const top = add(o, up, h / 2 + 0.01);
  seg(c, o2.rimBucket ?? "iron", add(add(top, side, -w / 2), n, 0.03), add(add(top, side, w / 2), n, 0.03), 0.02, 0.02, { color: rim, seg: 6 });
  for (const k of [1, -1]) seg(c, o2.rimBucket ?? "iron", add(add(top, side, (k * w) / 2), n, 0.03), add(add(add(o, up, -h / 2 + point * 0.3), side, (k * w) / 2), n, 0.03), 0.02, 0.02, { color: rim, seg: 6 });
  return { side, up };
}

/* ------------------------------ the body ------------------------------ */

export interface LegLook {
  /** Thigh (trousers, hose, hide, mail) */
  thigh: string;
  thighBucket?: string;
  /** Shin under the boot top */
  shin?: string;
  shinBucket?: string;
  boot: string;
  bootBucket?: string;
  /** Plate over the knee, the thigh and the shin (rare up) */
  plate?: string;
  plateBucket?: string;
  /** Wrappings round the shin (a levy's puttees, an orc's hide straps) */
  wraps?: string;
  /** Bare feet with toes in the skin colour (orcs) */
  bare?: string;
  /** How thick (1 = a man's) */
  thick?: number;
}

/** Both legs: thigh and shin bones (the foot rides the shin), the left foot a little ahead, never mirrored */
export function legs(c: BossCtx, J: Joints, L: LegLook, o: { stance?: number } = {}) {
  const t = (L.thick ?? 1) * J.w;
  for (const s of [1, -1]) {
    const S = sideOf(s);
    const fz = (s > 0 ? -0.04 : 0.11) * J.h;
    const st = (o.stance ?? 1) * J.hipX;
    const hip: V3 = [s * st, J.hip - 0.02 * J.h, 0];
    const knee: V3 = [s * (st + 0.02), J.knee, 0.04 * J.h + fz * 0.5];
    const ankle: V3 = [s * (st + 0.03), J.ankle, fz];
    c.bone(`thigh${S}`, hip, () => {
      seg(c, L.thighBucket ?? "cloth", hip, knee, 0.115 * t, 0.09 * t, { color: L.thigh, seg: 10 });
      if (L.plate) plate(c, L.plateBucket ?? "iron", add(mid(hip, knee, 0.45), [0, 0, 0.065 * t]), [0, 0.1, 1], sub(knee, hip), 0.09 * t, 0.03, 0.17 * J.h, { color: L.plate });
      c.bone(`shin${S}`, knee, () => {
        if (L.plate) blob(c, L.plateBucket ?? "iron", add(knee, [0, 0.01, 0.055 * t]), [0.075 * t, 0.07 * t, 0.055 * t], { color: L.plate, wd: 9, hd: 6 });
        seg(c, L.shinBucket ?? L.thighBucket ?? "cloth", knee, ankle, 0.085 * t, 0.068 * t, { color: L.shin ?? L.thigh, seg: 10 });
        if (L.wraps)
          for (let i = 0; i < 4; i++) {
            const p = mid(knee, ankle, 0.35 + i * 0.16);
            c.k.add("cloth", new THREE.TorusGeometry((0.083 - i * 0.004) * t, 0.012, 4, 12), p, [Math.PI / 2 + 0.15 * (i % 2 ? 1 : -1), 0, 0.1], { color: L.wraps });
          }
        if (L.plate) seg(c, L.plateBucket ?? "iron", mid(knee, ankle, 0.15), mid(knee, ankle, 0.85), 0.09 * t, 0.075 * t, { color: L.plate, seg: 10, cap: false });
        if (L.bare) {
          blob(c, "matte", [ankle[0], 0.06 * J.h, ankle[2] + 0.06], [0.08 * t, 0.06 * J.h, 0.14 * J.h], { color: L.bare, wd: 10, hd: 6 });
          for (let i = 0; i < 4; i++) blob(c, "matte", [ankle[0] + (i - 1.5) * 0.035 * t, 0.035, ankle[2] + 0.18 * J.h], [0.022 * t, 0.025, 0.03], { color: L.bare, wd: 6, hd: 4 });
        } else {
          blob(c, L.bootBucket ?? "matte", [ankle[0], 0.065 * J.h, ankle[2] + 0.07 * J.h], [0.08 * t, 0.065 * J.h, 0.15 * J.h], { color: L.boot, wd: 10, hd: 6 });
          seg(c, L.bootBucket ?? "matte", add(ankle, [0, 0.12 * J.h, 0]), [ankle[0], 0.07 * J.h, ankle[2]], 0.08 * t, 0.085 * t, { color: L.boot, seg: 10 });
        }
      });
    });
  }
}

export interface ArmLook {
  upper: string;
  upperBucket?: string;
  fore: string;
  foreBucket?: string;
  /** A bell sleeve flaring to the wrist (a robe) */
  bell?: number;
  cuff?: string;
  cuffBucket?: string;
  /** How thick (1 = a man's) */
  thick?: number;
  /** Elbow and wrist offsets from the default (each side its own) */
  el?: V3;
  wr?: V3;
}

/** One arm: shoulder, forearm and hand bones; `hand` puts what the hand holds at the wrist (inside the hand's bone) */
export function arm(c: BossCtx, J: Joints, s: number, A: ArmLook, hand: (wr: V3, el: V3) => void) {
  const S = sideOf(s);
  const t = (A.thick ?? 1) * J.w;
  const sh: V3 = [s * J.shX, J.sh, 0];
  const el = add([s * (J.shX + 0.07 * J.w), J.sh - 0.31 * J.h, s > 0 ? 0.05 : 0.08], A.el ?? [0, 0, 0]);
  const wr = add([s * (J.shX + 0.1 * J.w), J.sh - 0.56 * J.h, s > 0 ? 0.24 : 0.29], A.wr ?? [0, 0, 0]);
  c.bone(`arm${S}`, sh, () => {
    seg(c, A.upperBucket ?? "cloth", sh, el, 0.085 * t, 0.075 * t, { color: A.upper, seg: 9 });
    c.bone(`fore${S}`, el, () => {
      if (A.bell) c.k.along("cloth", el, wr, 0, { geo: new THREE.CylinderGeometry(A.bell, 0.075 * t, 1, 12, 1, true), color: A.fore });
      else seg(c, A.foreBucket ?? "cloth", el, wr, 0.075 * t, 0.062 * t, { color: A.fore, seg: 9 });
      if (A.cuff) c.k.add(A.cuffBucket ?? "cloth", new THREE.TorusGeometry(A.bell ?? 0.066 * t, 0.014, 4, 14), add(wr, sub(el, wr), 0.12), undefined, { color: A.cuff, quat: across(sub(wr, el)) });
      c.bone(`hand${S}`, wr, () => hand(wr, el));
    });
  });
}

export interface FaceLook {
  skin: string;
  bucket?: string;
  eye?: string;
  iris?: string;
  /** No eyes shown (a closed helm, a blindfold) */
  eyes?: boolean;
  /** Long pointed elf ears, an orc's ragged ones, none (under a helm) */
  ears?: "round" | "elf" | "orc" | "none";
  /** Tusks from the lower jaw (orcs) */
  tusks?: string;
  /** A heavy brow (orcs, dwarves) */
  brow?: number;
  nose?: number;
}

/** A face on a head at `h0` of radii `r`: brow, eyes under lids, a nose, a mouth, ears (and tusks) */
export function face(c: BossCtx, h0: V3, r: V3, F: FaceLook) {
  const b = F.bucket ?? "matte";
  const at = (x: number, y: number) => onBlob(h0, r, [0, 0, 0], [x, y, 1]).p;
  blob(c, b, add(at(0, 0.3), [0, 0, -0.012]), [r[0] * 0.8, r[1] * 0.14 * (F.brow ?? 1), r[2] * 0.26], { color: F.skin, wd: 10, hd: 5 });
  if (F.eyes !== false)
    for (const s of [1, -1]) {
      const e = at(s * 0.36, 0.1);
      blob(c, "gloss", add(e, [0, 0, -0.012]), [r[0] * 0.17, r[1] * 0.12, r[2] * 0.12], { color: F.eye ?? "#ece7df", wd: 8, hd: 5 });
      blob(c, "matte", e, [r[0] * 0.08, r[1] * 0.08, r[2] * 0.06], { color: F.iris ?? "#3a2e24", wd: 6, hd: 4 });
      blob(c, b, add(e, [0, r[1] * 0.08, -0.006]), [r[0] * 0.2, r[1] * 0.07, r[2] * 0.13], { color: F.skin, wd: 8, hd: 4 });
    }
  spike(c, b, add(at(0, 0.0), [0, 0, -0.01]), [0, -0.55, 1], r[0] * 0.15 * (F.nose ?? 1), r[2] * 0.36 * (F.nose ?? 1), { color: F.skin, seg: 5 });
  blob(c, "matte", add(at(0, -0.42), [0, 0, -0.008]), [r[0] * 0.3, r[1] * 0.045, r[2] * 0.07], { color: "#5a3a32", wd: 8, hd: 4 });
  if (F.tusks)
    for (const s of [1, -1]) spike(c, "matte", add(at(s * 0.3, -0.5), [0, 0, -0.01]), [s * 0.15, 1, 0.25], r[0] * 0.07, r[1] * 0.4, { color: F.tusks, seg: 5 });
  const ears = F.ears ?? "round";
  for (const s of [1, -1]) {
    const e: V3 = [h0[0] + s * r[0] * 0.96, h0[1] + 0.01, h0[2] - 0.01];
    if (ears === "round") blob(c, b, e, [r[0] * 0.14, r[1] * 0.26, r[2] * 0.2], { color: F.skin, wd: 6, hd: 5 });
    else if (ears === "elf") spike(c, b, e, [s * 0.75, 0.55, -0.3], r[0] * 0.16, r[1] * 0.85, { color: F.skin, seg: 5 });
    else if (ears === "orc") spike(c, b, e, [s * 0.9, 0.2, -0.25], r[0] * 0.2, r[1] * 0.6, { color: F.skin, seg: 5 });
  }
}

/** The neck and the head's skull (no face): what the head bone carries first */
export function skull(c: BossCtx, J: Joints, skin: string, bucket = "matte", neck = 1) {
  seg(c, bucket, [0, J.neck - 0.04 * J.h, 0], [0, J.neck + 0.07 * J.h, 0.01], 0.058 * J.h * neck, 0.052 * J.h * neck, { color: skin, seg: 8 });
  const h0: V3 = [0, J.head, 0.02];
  blob(c, bucket, h0, J.hr, { color: skin, wd: 14, hd: 10 });
  return h0;
}

/** A beard in locks hanging from the chin (a chain of bones `beard0…`) */
export function beard(c: BossCtx, at: V3, w: number, lens: number[], color: string, bucket = "matte") {
  const r = [w, ...lens.map((_, i) => w * (0.85 - (i / lens.length) * 0.7))];
  c.k.frame(at, [0, 0, 0], 1, () => chainBones(c, "beard", [0, 0, 0], lens, lens.map((_, i) => 1.25 + i * 0.08), r, { bucket, color, seg: 9 }));
}

/** A cape on the chest's back in bands (`cape0…`), `R` across the shoulders, to `y1` above the ground */
export function cape(c: BossCtx, J: Joints, color: string, o: { y1?: number; R?: number; tattered?: boolean; flare?: number; z?: number } = {}) {
  const R = (o.R ?? 0.36) * J.w;
  const y0 = J.sh + 0.04 * J.h;
  const y1 = o.y1 ?? 0.25 * J.h;
  const z = o.z ?? 0;
  const f = o.flare ?? 1;
  cloak(
    c,
    "cape",
    [
      { y: y0, R, zc: 0.02 + z },
      { y: y0 + (y1 - y0) * 0.34, R: R * (1 + 0.14 * f), zc: -0.03 + z },
      { y: y0 + (y1 - y0) * 0.68, R: R * (1 + 0.32 * f), zc: -0.1 + z },
      { y: y1, R: R * (1 + 0.45 * f), zc: -0.17 + z }
    ],
    color,
    !!o.tattered
  );
}

/** A tunic or robe skirt hanging from the belt (on the hips), open-ended cylinder from `r0` at the belt to `r1` at the hem */
export function skirt(c: BossCtx, J: Joints, color: string, y0: number, y1: number, r0: number, r1: number, o: { bucket?: string; hem?: string; segs?: number } = {}) {
  c.k.add(o.bucket ?? "cloth", new THREE.CylinderGeometry(r0 * J.w, r1 * J.w, y0 - y1, o.segs ?? 22, 2, true), [0, (y0 + y1) / 2, 0], undefined, { color, surf: cloth(1, y0 - y1) });
  if (o.hem) c.k.add("cloth", new THREE.TorusGeometry(r1 * J.w, 0.022, 4, 24), [0, y1 + 0.012, 0], [Math.PI / 2, 0, 0], { color: o.hem });
}

/** A belt round the waist with a buckle at the front */
export function belt(c: BossCtx, J: Joints, y: number, r: number, color: string, buckle: string, buckleBucket = "iron") {
  c.k.add("matte", new THREE.TorusGeometry(r * J.w, 0.032, 5, 22), [0, y, 0], [Math.PI / 2, 0, 0], { color, scale: [1, 0.8, 1] });
  c.k.add(buckleBucket, new THREE.BoxGeometry(0.08, 0.07, 0.03), [0, y, r * J.w * 0.8 + 0.02], undefined, { color: buckle });
}

/** Two strips of cloth front and back from the belt (a tabard, a loincloth), each its own bone `tabF` / `tabB` */
export function tabard(c: BossCtx, J: Joints, y: number, z: number, w: number, len: number, color: string, hem?: string) {
  for (const [name, zz, ry] of [
    ["tabF", z, 0],
    ["tabB", -z, Math.PI]
  ] as const) {
    c.bone(name, [0, y, zz], () => {
      c.k.add("cloth", new THREE.PlaneGeometry(w, len, 1, 4), [0, y - len / 2, zz + Math.sign(zz) * 0.015], [Math.sign(zz) * 0.06, ry, 0], { color, surf: cloth(w, len) });
      if (hem) seg(c, "cloth", [-w / 2, y - len + 0.01, zz + Math.sign(zz) * 0.03], [w / 2, y - len + 0.01, zz + Math.sign(zz) * 0.03], 0.016, 0.016, { color: hem, seg: 6, cap: false });
    });
  }
}

/** Shoulders: a pauldron on each side (blob plus a lame under it) */
export function pauldrons(c: BossCtx, J: Joints, color: string, bucket = "iron", size = 1, trim?: string) {
  for (const s of [1, -1]) {
    blob(c, bucket, [s * (J.shX + 0.04), J.sh + 0.05 * J.h, 0], [0.16 * size * J.w, 0.11 * size, 0.17 * size], { color, wd: 12, hd: 7, rot: [0, 0, -s * 0.35] });
    plate(c, bucket, [s * (J.shX + 0.09), J.sh - 0.07 * J.h, 0], [s, 0.6, 0], [0, 0, 1], 0.11 * size, 0.03, 0.15 * size, { color: trim ?? color });
  }
}

/* ------------------------------ motion ------------------------------ */

export interface IdleLook {
  /** Cape bands (`cape0…`, three of them when it has one) */
  cape?: boolean;
  tabard?: boolean;
  beard?: number;
  /** How restless (1 = a soldier at his post) */
  life?: number;
  /** The band's own touches over the shared idle (a flame flickering, orbs circling) */
  more?: (c: IdleCtx) => void;
  /** Both hands on one weapon: the arms move together, by the same pitch only, so neither lets go */
  twoHand?: boolean;
}

/** A person's idle: breath, the weight from foot to foot, glances, loose hands, a seeded event (a look round, a hitch of the grip) */
export function personIdle(L: IdleLook = {}): (c: IdleCtx) => void {
  const k = L.life ?? 1;
  return (c) => {
    const breath = c.sin(1.1);
    const shift = c.drift(0.28);
    c.add("hips", [0.015 * k * c.drift(0.25, 1), 0.04 * k * c.drift(0.2, 2), -0.03 * k * shift], [0.025 * k * shift, 0.008 * breath, 0]);
    for (const S of ["L", "R"]) {
      c.add(`thigh${S}`, [0, 0, 0.03 * k * shift]);
      c.add(`shin${S}`, [0, 0, -0.03 * k * shift]);
    }
    c.add("chest", [0.02 * breath + 0.015 * c.drift(0.3, 2), 0.06 * k * c.drift(0.22, 3), 0.03 * k * shift], null, 0.012 * breath);
    c.add("head", [0.045 * c.drift(0.4), 0.33 * k * c.glance(1, 4.2, 0.3), 0.045 * c.drift(0.3, 1)]);
    if (L.twoHand) {
      // Two hands on one grip: the same pitch on both arms keeps the left fist where it closes on the grip
      const lift = 0.04 * c.drift(0.4, 1);
      for (const S of ["R", "L"]) c.add(`arm${S}`, [lift, 0, 0]);
    } else {
      c.add("armR", [0.04 * c.drift(0.4, 1), 0, 0.02 * c.drift(0.33)]);
      c.add("handR", [0.06 * c.drift(0.5, 2), 0, 0.05 * c.drift(0.45)]);
      c.add("armL", [0.035 * c.drift(0.38, 3), 0, -0.02 * c.drift(0.3, 2)]);
      c.add("handL", [0.05 * c.drift(0.47, 4), 0, 0.04 * c.drift(0.41, 1)]);
    }
    // Now and then a look round over the shoulder
    const look = c.event(2, 9, 2.2);
    const side = look.k > 0.5 ? 1 : -1;
    c.add("head", [-0.1 * look.e, 0.55 * side * look.e, 0]);
    c.add("chest", [0, 0.12 * side * look.e, 0]);
    // …or a hitch of the grip
    const hitch = c.event(3, 11, 1.4).e;
    for (const S of L.twoHand ? ["R", "L"] : ["R"]) {
      c.add(`arm${S}`, [-0.18 * hitch, 0, 0]);
      c.add(`hand${S}`, [0.3 * hitch, 0, 0]);
    }
    if (L.cape) for (let j = 0; j < 3; j++) c.add(`cape${j}`, [0.04 * Math.sin(c.t * 1.1 - j * 0.85) + 0.02 * c.drift(0.6, j) - 0.03 * (j + 1) * 0.5, 0, 0.035 * Math.sin(c.t * 0.8 - j * 0.7 + 1)]);
    if (L.tabard) {
      c.add("tabF", [0.04 * c.drift(0.6) + 0.02 * shift, 0, 0.03 * c.drift(0.5, 1)]);
      c.add("tabB", [0.04 * c.drift(0.55, 2), 0, 0.03 * c.drift(0.45, 3)]);
    }
    for (let j = 0; j < (L.beard ?? 0); j++) c.add(`beard${j}`, [0.04 * Math.sin(c.t * 1.1 - j * 0.7), 0.04 * Math.sin(c.t * 0.8 - j * 0.6 + 1), 0]);
    L.more?.(c);
  };
}

export interface MarchLook {
  /** Seconds for two steps */
  len?: number;
  /** How far each arm swings (0 for an arm that holds a shield up or a weapon still) */
  swingR?: number;
  swingL?: number;
  /** Stride (1 = a soldier's) */
  stride?: number;
  /** Lean into the walk */
  lean?: number;
  /** A heavy body dips more on each footfall */
  weight?: number;
  /** Held while marching (a weapon shouldered, a shield carried): offsets on every key */
  carry?: Pose;
  /** Floats instead of walking: the body bobs and the legs trail */
  float?: boolean;
  cape?: boolean;
}

/** The march: two steps on a loop in place, the body dipping on each footfall, swaying over the supporting leg, the shoulders against the hips */
export function march(M: MarchLook = {}): BossAction {
  const st = M.stride ?? 1;
  const sR = M.swingR ?? 1;
  const sL = M.swingL ?? 1;
  const lean = M.lean ?? 0.06;
  const wt = M.weight ?? 1;
  const carry = M.carry ?? {};
  const capeBack = M.cape ? chainPose("cape", 3, (j) => ({ r: [-0.08 - j * 0.03, 0, 0] })) : {};
  const with_ = (p: Pose): Pose => {
    const out: Pose = { ...capeBack, ...p };
    for (const [b, bp] of Object.entries(carry)) {
      const o = out[b] ?? {};
      out[b] = { ...o, r: [(o.r?.[0] ?? 0) + (bp.r?.[0] ?? 0), (o.r?.[1] ?? 0) + (bp.r?.[1] ?? 0), (o.r?.[2] ?? 0) + (bp.r?.[2] ?? 0)], p: o.p || bp.p ? [(o.p?.[0] ?? 0) + (bp.p?.[0] ?? 0), (o.p?.[1] ?? 0) + (bp.p?.[1] ?? 0), (o.p?.[2] ?? 0) + (bp.p?.[2] ?? 0)] : undefined };
    }
    return out;
  };
  // One step: `f` the front leg's side (R or L) at its heel strike, then the passing as the back leg swings through
  const strike = (f: "R" | "L"): Pose => {
    const b = f === "R" ? "L" : "R";
    const sg = f === "R" ? 1 : -1;
    const swing = (side: "R" | "L") => (side === "R" ? sR : sL);
    if (M.float)
      return with_({
        hips: { p: [0, -0.03, 0], r: [lean, 0.05 * sg, 0] },
        [`thigh${f}`]: { r: [-0.12 * st, 0, 0] },
        [`thigh${b}`]: { r: [0.1 * st, 0, 0] },
        [`shin${b}`]: { r: [0.2, 0, 0] },
        chest: { r: [0, -0.06 * sg, 0] },
        [`arm${f}`]: { r: [0.15 * swing(f), 0, 0] },
        [`arm${b}`]: { r: [-0.15 * swing(b), 0, 0] }
      });
    return with_({
      hips: { p: [0, -0.045 * wt, 0], r: [lean, 0.08 * sg, 0] },
      [`thigh${f}`]: { r: [-0.42 * st, 0, 0] },
      [`shin${f}`]: { r: [0.08, 0, 0] },
      [`thigh${b}`]: { r: [0.3 * st, 0, 0] },
      [`shin${b}`]: { r: [0.35 * st, 0, 0] },
      chest: { r: [0.02, -0.13 * sg, 0] },
      head: { r: [-0.02, 0.08 * sg, 0] },
      [`arm${f}`]: { r: [0.32 * swing(f), 0, 0] },
      [`fore${f}`]: { r: [-0.08 * swing(f), 0, 0] },
      [`arm${b}`]: { r: [-0.34 * swing(b), 0, 0] },
      [`fore${b}`]: { r: [-0.3 * swing(b), 0, 0] }
    });
  };
  const pass = (f: "R" | "L"): Pose => {
    const b = f === "R" ? "L" : "R";
    const sg = f === "R" ? 1 : -1;
    if (M.float) return with_({ hips: { p: [0, 0.04, 0], r: [lean, 0, 0] } });
    return with_({
      // The weight over the planted leg, the body at its highest
      hips: { p: [0.025 * sg, 0.015, 0], r: [lean, 0, 0.035 * sg] },
      [`thigh${f}`]: { r: [0.02, 0, 0] },
      [`shin${f}`]: { r: [0.05, 0, 0] },
      [`thigh${b}`]: { r: [-0.12 * st, 0, 0] },
      [`shin${b}`]: { r: [0.75 * st, 0, 0] },
      chest: { r: [0.02, 0, -0.025 * sg] },
      [`fore${f}`]: { r: [-0.15, 0, 0] },
      [`fore${b}`]: { r: [-0.15, 0, 0] }
    });
  };
  return {
    len: M.len ?? 1.15,
    idle: 0.25,
    keys: [
      { t: 0, pose: strike("R") },
      { t: 0.25, pose: pass("R") },
      { t: 0.5, pose: strike("L") },
      { t: 0.75, pose: pass("L") },
      { t: 1, pose: strike("R") }
    ]
  };
}

/** Lag and springs every person shares: the upper body trails the hips, the hands trail the arms, a cape whips */
export function personLag(o: { cape?: boolean; tabard?: boolean; beard?: number; extra?: Record<string, number> } = {}): Pick<BossHeroDef, "lag" | "springs"> {
  return {
    lag: {
      hips: 0.02,
      chest: 0.035,
      head: 0.06,
      armR: 0.04,
      foreR: 0.055,
      handR: 0.075,
      armL: 0.05,
      foreL: 0.065,
      handL: 0.085,
      ...(o.tabard ? { tabF: 0.08, tabB: 0.1 } : {}),
      ...(o.cape ? chainLag("cape", 3, 0.06, 0.06) : {}),
      ...(o.beard ? chainLag("beard", o.beard, 0.05, 0.06) : {}),
      ...o.extra
    },
    springs: {
      ...(o.tabard ? { tabF: 55, tabB: 50 } : {}),
      ...(o.cape ? chainSprings("cape", 3, 45) : {}),
      ...(o.beard ? chainSprings("beard", o.beard, 60) : {})
    }
  };
}

/* ------------------------------ strikes ------------------------------ */

const capeOut = (k: number) => chainPose("cape", 3, () => ({ r: [-0.22 * k, 0, 0] }));

/** A one-handed cut down across from over the right shoulder (a sword, an axe, a club); `shield` raises the left */
export function cut(o: { len?: number; shield?: boolean; heavy?: number; cine: Cine; extra?: { coil?: Pose; hit?: Pose } }): BossAction {
  const h = o.heavy ?? 1;
  return {
    len: o.len ?? 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, pose: merge({ hips: { p: [0, -0.04, -0.08], r: [0, 0.2, 0] }, thighR: { r: [-0.12, 0, 0] }, shinR: { r: [0.22, 0, 0] }, chest: { r: [-0.1, 0.25 * h, 0] }, head: { r: [0.05, -0.2, 0] }, armR: { r: [-2.5, 0, 0.35] }, foreR: { r: [-0.9, 0, 0] }, handR: { r: [-0.35, 0, 0] }, armL: { r: o.shield ? [-0.65, 0, 0.1] : [-0.2, 0, -0.3] }, foreL: { r: [-0.35, 0, 0] }, handL: { r: o.shield ? [0.9, 0, 0] : [0, 0, 0] } }, o.extra?.coil ?? {}) },
      { t: 0.44, hold: true, pose: merge({ hips: { p: [0, -0.06, -0.1], r: [0, 0.24, 0] }, thighR: { r: [-0.15, 0, 0] }, shinR: { r: [0.28, 0, 0] }, chest: { r: [-0.14, 0.3 * h, 0] }, head: { r: [0.06, -0.24, 0] }, armR: { r: [-2.65, 0, 0.38] }, foreR: { r: [-1.0, 0, 0] }, handR: { r: [-0.45, 0, 0] }, armL: { r: o.shield ? [-0.7, 0, 0.12] : [-0.25, 0, -0.35] }, foreL: { r: [-0.4, 0, 0] }, handL: { r: o.shield ? [1.0, 0, 0] : [0, 0, 0] } }, o.extra?.coil ?? {}) },
      { t: 0.56, pose: merge({ hips: { p: [0, -0.08, 0.18], r: [0, -0.12, 0] }, thighL: { r: [-0.5, 0, 0] }, shinL: { r: [0.42, 0, 0] }, thighR: { r: [0.25, 0, 0] }, shinR: { r: [0.12, 0, 0] }, chest: { r: [0.3, -0.25 * h, 0] }, head: { r: [0.05, 0.1, 0] }, armR: { r: [-0.8, 0, -0.35] }, foreR: { r: [-0.05, 0, 0] }, handR: { r: [1.55, 0, 0] }, armL: { r: o.shield ? [-0.45, 0, 0.15] : [0.2, 0, -0.2] }, foreL: { r: [-0.3, 0, 0] }, handL: { r: o.shield ? [0.65, 0, 0] : [0, 0, 0] } }, capeOut(1), o.extra?.hit ?? {}) },
      { t: 0.68, pose: merge({ hips: { p: [0, -0.09, 0.2], r: [0, -0.16, 0] }, thighL: { r: [-0.52, 0, 0] }, shinL: { r: [0.45, 0, 0] }, thighR: { r: [0.27, 0, 0] }, shinR: { r: [0.14, 0, 0] }, chest: { r: [0.38, -0.32 * h, 0] }, head: { r: [0.08, 0.12, 0] }, armR: { r: [-0.4, 0, -0.55] }, foreR: { r: [-0.05, 0, 0] }, handR: { r: [1.9, 0, 0] } }, capeOut(0.8)) },
      { t: 0.86, hold: true, pose: { hips: { p: [0, -0.02, 0.05] }, thighL: { r: [-0.12, 0, 0] }, shinL: { r: [0.1, 0, 0] }, chest: { r: [0.08, 0, 0] }, armR: { r: [-0.25, 0, -0.1] }, handR: { r: [0.5, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: o.cine }]
  };
}

/** A thrust with the right hand (a spear, a pike, a stabbing blade): drawn back, a lunge, the point driven home */
export function thrust(o: { len?: number; twoHand?: boolean; shield?: boolean; cine: Cine }): BossAction {
  const L: Pose = o.twoHand ? { armL: { r: [-0.6, 0, 0.35] }, foreL: { r: [-0.6, 0, 0] } } : o.shield ? { armL: { r: [-0.7, 0, 0.12] }, foreL: { r: [-0.4, 0, 0] }, handL: { r: [0.9, 0, 0] } } : {};
  const L2: Pose = o.twoHand ? { armL: { r: [-1.15, 0, 0.4] }, foreL: { r: [-0.2, 0, 0] } } : o.shield ? { armL: { r: [-0.5, 0, 0.15] }, foreL: { r: [-0.3, 0, 0] }, handL: { r: [0.7, 0, 0] } } : { armL: { r: [0.3, 0, -0.2] } };
  return {
    len: o.len ?? 2.2,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.32, pose: merge({ hips: { p: [0, -0.06, -0.12], r: [0, 0.3, 0] }, thighR: { r: [-0.1, 0, 0] }, shinR: { r: [0.3, 0, 0] }, chest: { r: [-0.08, 0.35, 0] }, head: { r: [0.05, -0.3, 0] }, armR: { r: [0.4, 0, 0.2] }, foreR: { r: [-1.25, 0, 0] }, handR: { r: [0.1, 0, 0] } }, L) },
      { t: 0.46, hold: true, pose: merge({ hips: { p: [0, -0.08, -0.15], r: [0, 0.34, 0] }, thighR: { r: [-0.12, 0, 0] }, shinR: { r: [0.36, 0, 0] }, chest: { r: [-0.1, 0.4, 0] }, head: { r: [0.06, -0.34, 0] }, armR: { r: [0.5, 0, 0.22] }, foreR: { r: [-1.35, 0, 0] }, handR: { r: [0.12, 0, 0] } }, L) },
      { t: 0.56, pose: merge({ hips: { p: [0, -0.12, 0.3], r: [0, -0.2, 0] }, thighL: { r: [-0.6, 0, 0] }, shinL: { r: [0.5, 0, 0] }, thighR: { r: [0.35, 0, 0] }, shinR: { r: [0.15, 0, 0] }, chest: { r: [0.25, -0.3, 0] }, head: { r: [0.0, 0.25, 0] }, armR: { r: [-1.45, 0, 0.05] }, foreR: { r: [-0.05, 0, 0] }, handR: { r: [0.15, 0, 0] } }, L2, capeOut(1)) },
      { t: 0.68, pose: merge({ hips: { p: [0, -0.12, 0.32], r: [0, -0.22, 0] }, thighL: { r: [-0.62, 0, 0] }, shinL: { r: [0.52, 0, 0] }, thighR: { r: [0.37, 0, 0] }, shinR: { r: [0.17, 0, 0] }, chest: { r: [0.28, -0.32, 0] }, armR: { r: [-1.5, 0, 0.02] }, foreR: { r: [0, 0, 0] } }, L2, capeOut(0.8)) },
      { t: 0.86, hold: true, pose: { hips: { p: [0, -0.03, 0.06] }, thighL: { r: [-0.15, 0, 0] }, shinL: { r: [0.12, 0, 0] }, chest: { r: [0.06, 0, 0] }, armR: { r: [-0.3, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: o.cine }]
  };
}

/** A two-handed blow from high overhead straight down (a hammer, a great axe, a maul): up, a hang, down to the ground */
export function slam(o: { len?: number; cine: Cine; extra?: { coil?: Pose; hit?: Pose }; locked?: boolean }): BossAction {
  // Both hands on one grip: no roll on the arms (the same pitch about parallel shoulders keeps the hands together)
  const unroll = (k: BossAction["keys"][number]) => {
    if (!o.locked) return k;
    const pose: Pose = {};
    for (const [b, bp] of Object.entries(k.pose)) pose[b] = /^arm[RL]$/.test(b) && bp.r ? { ...bp, r: [bp.r[0], 0, 0] } : bp;
    return { ...k, pose };
  };
  const act: BossAction = {
    len: o.len ?? 2.6,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, pose: merge({ hips: { p: [0, 0.02, -0.08] }, chest: { r: [-0.25, 0.08, 0] }, head: { r: [-0.15, 0, 0] }, armR: { r: [-2.6, 0, -0.15] }, foreR: { r: [-0.7, 0, 0] }, handR: { r: [-0.2, 0, 0] }, armL: { r: [-2.6, 0, 0.15] }, foreL: { r: [-0.7, 0, 0] }, handL: { r: [-0.2, 0, 0] } }, capeOut(-0.4), o.extra?.coil ?? {}) },
      { t: 0.46, hold: true, pose: merge({ hips: { p: [0, 0.04, -0.1] }, thighR: { r: [-0.05, 0, 0] }, chest: { r: [-0.32, 0.1, 0] }, head: { r: [-0.2, 0, 0] }, armR: { r: [-2.85, 0, -0.18] }, foreR: { r: [-0.9, 0, 0] }, handR: { r: [-0.3, 0, 0] }, armL: { r: [-2.85, 0, 0.18] }, foreL: { r: [-0.9, 0, 0] }, handL: { r: [-0.3, 0, 0] } }, capeOut(-0.5), o.extra?.coil ?? {}) },
      { t: 0.57, pose: merge({ hips: { p: [0, -0.16, 0.16] }, thighL: { r: [-0.55, 0, 0] }, shinL: { r: [0.6, 0, 0] }, thighR: { r: [0.15, 0, 0] }, shinR: { r: [0.45, 0, 0] }, chest: { r: [0.5, -0.05, 0] }, head: { r: [0.15, 0, 0] }, armR: { r: [-0.95, 0, -0.2] }, foreR: { r: [-0.1, 0, 0] }, handR: { r: [0.6, 0, 0] }, armL: { r: [-0.95, 0, 0.2] }, foreL: { r: [-0.1, 0, 0] }, handL: { r: [0.6, 0, 0] } }, capeOut(1), o.extra?.hit ?? {}) },
      { t: 0.7, pose: merge({ hips: { p: [0, -0.18, 0.18] }, thighL: { r: [-0.58, 0, 0] }, shinL: { r: [0.65, 0, 0] }, thighR: { r: [0.17, 0, 0] }, shinR: { r: [0.5, 0, 0] }, chest: { r: [0.55, -0.06, 0] }, head: { r: [0.18, 0, 0] }, armR: { r: [-0.85, 0, -0.2] }, handR: { r: [0.7, 0, 0] }, armL: { r: [-0.85, 0, 0.2] }, handL: { r: [0.7, 0, 0] } }, capeOut(0.7)) },
      { t: 0.88, hold: true, pose: { hips: { p: [0, -0.04, 0.05] }, chest: { r: [0.12, 0, 0] }, armR: { r: [-0.3, 0, 0] }, armL: { r: [-0.3, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.57, burst: true, cine: o.cine }]
  };
  return { ...act, keys: act.keys.map(unroll) };
}

/** A spell: hands (or a staff) raised to gather, then flung toward the foe */
export function invoke(o: { len?: number; staff?: "R" | "L"; cine: Cine; glow?: string[] }): BossAction {
  const g = (k: number): Pose => Object.fromEntries((o.glow ?? []).map((b) => [b, { g: k, s: k * 0.15 }]));
  return {
    len: o.len ?? 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, pose: merge({ hips: { p: [0, 0.02, -0.04] }, chest: { r: [-0.14, 0.1, 0] }, head: { r: [-0.22, 0, 0] }, armR: { r: [-1.0, 0, 0.18] }, foreR: { r: [-0.85, 0, 0] }, handR: { r: [o.staff === "R" ? 1.3 : 0.2, 0, 0] }, armL: { r: [-1.0, 0, -0.2] }, foreL: { r: [-0.7, 0, 0] } }, g(0.8)) },
      { t: 0.44, hold: true, pose: merge({ hips: { p: [0, 0.03, -0.05] }, chest: { r: [-0.2, 0.12, 0] }, head: { r: [-0.28, 0, 0] }, armR: { r: [-1.2, 0, 0.2] }, foreR: { r: [-0.95, 0, 0] }, handR: { r: [o.staff === "R" ? 1.55 : 0.25, 0, 0] }, armL: { r: [-1.15, 0, -0.25] }, foreL: { r: [-0.8, 0, 0] } }, g(1.4)) },
      { t: 0.56, pose: merge({ hips: { p: [0, -0.06, 0.12] }, thighL: { r: [-0.3, 0, 0] }, shinL: { r: [0.28, 0, 0] }, chest: { r: [0.3, -0.06, 0] }, head: { r: [0.18, 0, 0] }, armR: { r: [o.staff === "R" ? -0.7 : -1.45, 0, 0.05] }, foreR: { r: [-0.15, 0, 0] }, handR: { r: [o.staff === "R" ? 0.5 : -0.3, 0, 0] }, armL: { r: [-1.45, 0, -0.05] }, foreL: { r: [-0.1, 0, 0] }, handL: { r: [-0.4, 0, 0] } }, g(2.2), capeOut(0.8)) },
      { t: 0.7, pose: merge({ hips: { p: [0, -0.07, 0.13] }, thighL: { r: [-0.32, 0, 0] }, shinL: { r: [0.3, 0, 0] }, chest: { r: [0.32, -0.08, 0] }, armR: { r: [o.staff === "R" ? -0.6 : -1.4, 0, 0.05] }, armL: { r: [-1.4, 0, -0.05] } }, g(1.2)) },
      { t: 0.88, hold: true, pose: { hips: { p: [0, -0.02, 0.03] }, chest: { r: [0.08, 0, 0] }, armR: { r: [-0.25, 0, 0] }, armL: { r: [-0.25, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: o.cine }]
  };
}

/**
 * A bow: she turns three-quarters to the target, the bow raised at arm's length in the left hand, the string drawn back
 * to the cheek with the right (the elbow high), held while she sights, then loosed (the hand flying back) and recovered
 */
export function loose(o: { len?: number; cine: Cine; extra?: Pose }): BossAction {
  const aim: Pose = { hips: { r: [0, 0.35, 0] }, thighL: { r: [-0.15, 0, -0.05] }, chest: { r: [-0.04, 0.45, 0] }, head: { r: [0.04, -0.75, 0] }, armL: { r: [-1.45, 0, -0.45] }, foreL: { r: [0.05, 0, 0] }, handL: { r: [1.35, 0, 0.42] } };
  // (the bow hand turns back against the raised arm, so the bow stands upright at arm's length)
  return {
    len: o.len ?? 2.8,
    idle: 0.2,
    keys: [
      { t: 0, pose: {} },
      // The bow comes up, the hand to the string
      { t: 0.22, pose: merge(aim, { armR: { r: [-1.25, 0, -0.35] }, foreR: { r: [-0.9, 0, 0] } }) },
      // Drawn to the cheek, the elbow high and back: held while she sights
      { t: 0.42, pose: merge(aim, { armR: { r: [-1.45, 0, -0.62] }, foreR: { r: [-2.15, 0, 0] }, handR: { r: [0.25, 0, 0] } }, o.extra ?? {}) },
      { t: 0.54, hold: true, pose: merge(aim, { chest: { r: [-0.06, 0.48, 0] }, armR: { r: [-1.48, 0, -0.66] }, foreR: { r: [-2.2, 0, 0] }, handR: { r: [0.28, 0, 0] } }, o.extra ?? {}) },
      // Loosed: the drawing hand flies back past the ear, the bow arm kicks
      { t: 0.6, pose: merge(aim, { armL: { r: [-1.55, 0, -0.45] }, handL: { r: [1.45, 0, 0.42] }, armR: { r: [-1.25, 0, -0.15] }, foreR: { r: [-1.0, 0, 0] }, handR: { r: [-0.4, 0, 0] } }, capeOut(0.6)) },
      { t: 0.76, hold: true, pose: merge(aim, { armR: { r: [-0.95, 0, -0.05] }, foreR: { r: [-0.7, 0, 0] } }) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.6, burst: true, cine: o.cine }]
  };
}

/** A whirl: arms out, the body spun round on the hips once, the blades sweeping a circle */
export function whirl(o: { len?: number; cine: Cine; turns?: number }): BossAction {
  const T = (o.turns ?? 1) * TAU;
  const out: Pose = { armR: { r: [-1.3, 0, 0.35] }, foreR: { r: [-0.25, 0, 0] }, armL: { r: [-1.3, 0, -0.35] }, foreL: { r: [-0.25, 0, 0] } };
  return {
    len: o.len ?? 2.6,
    idle: 0.2,
    // Held at both ends: the spin ends a whole turn round, where it started
    keys: [
      { t: 0, hold: true, pose: {} },
      { t: 0.25, hold: true, pose: merge({ hips: { p: [0, -0.1, 0], r: [0, 0.5, 0] }, thighL: { r: [-0.3, 0, 0] }, shinL: { r: [0.4, 0, 0] }, thighR: { r: [-0.1, 0, 0] }, shinR: { r: [0.35, 0, 0] }, chest: { r: [0.15, 0.4, 0] }, armR: { r: [-0.6, 0, 0.6] }, armL: { r: [-0.9, 0, -0.5] } }) },
      { t: 0.45, pose: merge({ hips: { p: [0, -0.06, 0.05], r: [0, -T * 0.45, 0] }, chest: { r: [0.15, -0.2, 0] } }, out, capeOut(1)) },
      { t: 0.62, pose: merge({ hips: { p: [0, -0.08, 0.08], r: [0, -T * 0.85, 0] }, chest: { r: [0.2, -0.3, 0] } }, out, capeOut(1)) },
      { t: 0.74, pose: merge({ hips: { p: [0, -0.1, 0.1], r: [0, -T, 0] }, thighL: { r: [-0.3, 0, 0] }, shinL: { r: [0.3, 0, 0] }, chest: { r: [0.3, -0.15, 0] } }, out) },
      { t: 0.9, hold: true, pose: { hips: { p: [0, -0.03, 0.03], r: [0, -T, 0] }, chest: { r: [0.1, 0, 0] } } },
      { t: 1, hold: true, pose: { hips: { r: [0, -T, 0] } } }
    ],
    hits: [
      { u: 0.45, cine: { ...o.cine, stop: 0 } },
      { u: 0.62, burst: true, cine: o.cine }
    ]
  };
}

/** A war cry (the legendary's roar): drawn in, then up, the weapon raised high, the chest thrown out */
export function warCry(o: { len?: number; cine: Cine; arm?: "R" | "L" | "both"; glow?: string[] }): BossAction {
  const g = (k: number): Pose => Object.fromEntries((o.glow ?? []).map((b) => [b, { g: k, s: k * 0.12 }]));
  const up: Pose =
    o.arm === "both"
      ? { armR: { r: [-2.7, 0, -0.35] }, foreR: { r: [-0.3, 0, 0] }, armL: { r: [-2.7, 0, 0.35] }, foreL: { r: [-0.3, 0, 0] } }
      : o.arm === "L"
        ? { armL: { r: [-2.75, 0, 0.25] }, foreL: { r: [-0.2, 0, 0] }, armR: { r: [-0.3, 0, 0.45] }, foreR: { r: [-0.6, 0, 0] } }
        : { armR: { r: [-2.75, 0, -0.25] }, foreR: { r: [-0.2, 0, 0] }, handR: { r: [-0.4, 0, 0] }, armL: { r: [-0.3, 0, -0.45] }, foreL: { r: [-0.6, 0, 0] } };
  return {
    len: o.len ?? 3.0,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, hold: true, pose: merge({ hips: { p: [0, -0.08, 0] }, thighL: { r: [-0.15, 0, 0] }, shinL: { r: [0.25, 0, 0] }, shinR: { r: [0.25, 0, 0] }, chest: { r: [0.3, 0, 0] }, head: { r: [0.3, 0, 0] }, armR: { r: [0.2, 0, 0.2] }, armL: { r: [0.2, 0, -0.2] } }, g(0.3)) },
      { t: 0.42, pose: merge({ hips: { p: [0, 0.03, 0] }, chest: { r: [-0.3, 0, 0] }, head: { r: [-0.4, 0, 0] } }, up, g(2.2), capeOut(1.2)) },
      { t: 0.74, hold: true, pose: merge({ hips: { p: [0, 0.02, 0] }, chest: { r: [-0.25, 0.05, 0] }, head: { r: [-0.32, 0.05, 0] } }, up, g(1.4), capeOut(0.9)) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, burst: true, cine: o.cine }]
  };
}

/** A part spinning about `axis` through `o` on the GPU while its bone rides the body */
export function ring(c: BossCtx, bucket: string, o: V3, R: number, r: number, color: string, rot: V3, bright?: number) {
  c.k.add(bucket, new THREE.TorusGeometry(R, r, 4, 24), o, rot, { color, bright });
}

/** Bits circling the body on their own tilted paths (`${name}0…`), each a bone the idle carries round */
export function orbiters(c: BossCtx, name: string, n: number, y: number, body: (i: number, at: V3) => void) {
  for (let i = 0; i < n; i++) c.bone(`${name}${i}`, [0, y, 0], () => body(i, [0, y, 0]));
}

/** Carries `${name}0…` round the body: radius `R`, at `speed`, swinging wider while it acts */
export function orbit(c: IdleCtx, name: string, n: number, R: number, speed = 0.6, tiltK = 0.35) {
  for (let i = 0; i < n; i++) {
    const a = c.t * (speed + i * 0.08) + (i * TAU) / n + c.seed * 2;
    const r = R + 0.1 * Math.sin(c.t * 0.4 + i) + 0.35 * c.busy;
    const tilt = tiltK * Math.sin(i * 2.3 + 0.5);
    c.carry(`${name}${i}`, [c.t * 1.2 + i, c.t * 0.8 + i * 2, 0], [Math.cos(a) * r, Math.sin(a) * r * tilt + 0.2 * Math.sin(a * 2 + i) + 0.25 * c.busy, Math.sin(a) * r]);
  }
}

/* ------------------------------ a band's def ------------------------------ */

/** A strike is all a band below the legendary plays; the roar slot never shows (no button names it) */
export const STILL: BossAction = { len: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: {} }] };

/**
 * A mercenary as a rigged hero: its build, rest pose, idle, strike and march, with the person's lag and springs; the
 * Codex buttons are Idle, March and its strike (and its war cry for a legendary, which has one)
 */
export function mercDef(
  o: Omit<BossHeroDef, "roar" | "actions" | "lag" | "springs" | "walk"> & {
    walk: BossAction;
    attackLabel: string;
    roar?: BossAction;
    roarLabel?: string;
    trail?: Parameters<typeof personLag>[0];
  }
): BossHeroDef {
  const { attackLabel, roarLabel, trail, roar, ...def } = o;
  return {
    ...def,
    ...personLag(trail),
    roar: roar ?? STILL,
    actions: [
      { id: "idle", label: "Idle" },
      { id: "walk", label: "March" },
      ...(roar ? [{ id: "roar" as const, label: roarLabel ?? "War cry" }] : []),
      { id: "attack", label: attackLabel }
    ]
  };
}

/**
 * A person's trunk on the chest bone: a waist tapering up into a broad chest, the shoulders rounded over it, never an
 * egg. `broad` widens the shoulders (a soldier 1, a brute more), `belly` rounds the front, `deep` its depth front to back.
 */
export function trunk(c: BossCtx, J: Joints, color: string, bucket = "cloth", o: { broad?: number; belly?: number; deep?: number; waist?: number } = {}) {
  const w = J.w;
  const br = o.broad ?? 1;
  const dp = o.deep ?? 1;
  const y0 = J.hip + 0.04 * J.h;
  const y1 = J.sh - 0.1 * J.h;
  const wr = (o.waist ?? 0.21) * w;
  const cr = 0.255 * w * br;
  const top = J.sh + 0.07 * J.h;
  // One smooth turned profile: the waist, the ribs swelling to the chest, the shoulders rounding in to the neck
  const prof: Array<[number, number]> = [
    [wr * 0.92, y0 - 0.02],
    [wr, y0 + 0.04 * J.h],
    [wr * 1.02, y0 + (y1 - y0) * 0.3],
    [cr * 0.97, y0 + (y1 - y0) * 0.72],
    [cr, y1],
    [cr * 0.96, y1 + (top - y1) * 0.45],
    [cr * 0.78, y1 + (top - y1) * 0.8],
    [cr * 0.42, top],
    [0.06 * J.h, top + 0.01]
  ];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 22);
  c.k.add(bucket, geo, [0, 0, 0.005], undefined, { color, scale: [1, 1, 0.78 * dp] });
  if (o.belly) blob(c, bucket, [0, y0 + (y1 - y0) * 0.28, wr * 0.32], [wr * 0.95, (y1 - y0) * 0.34, wr * 0.75 * o.belly], { color, wd: 14, hd: 8 });
  return { y0, y1, cr, front: cr * 0.8 * dp };
}
