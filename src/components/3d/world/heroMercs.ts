import * as THREE from "three";
import { MOVE, TAU, V3, thetaOf } from "./heroKit";
import { SPARK, cloth, grainRound } from "./heroMaterials";
import { BossAction, BossCtx, BossHeroDef, IdleCtx, Pose } from "./heroRig";
import { blob, chainBones, chainLag, chainPose, chainSprings, hook, merge, onBlob, plate, seg, spike, stud } from "./bossParts";
import { across, add, cloak, cross, glide, mid, norm, sideOf, sub } from "./heroCreatures";
import { march } from "./heroMercKit";

/* ------------------------------------------------------------------------- */
/* Nethergarde Voidrift's mercenaries, common → epic, in high graphics        */
/* ------------------------------------------------------------------------- */

/*
 * Rigged heroes on the world bosses' framework (`heroRig.ts`, drawn by `BossBatch`), like the legendary Archmage of their
 * pool, so any number of copies share the same draws. Each stands on the rarity ladder below him: the common Acolyte matte
 * and unlit, the uncommon Riftguard with one accent (violet cloth and paint) and a small prop, the rare Seer with steel
 * trim and one looping effect (her star-orbs), the epic Reaver bigger, glowing and orbited. Built at its Normal rig's
 * size round the kit's origin, facing +z; each plays its idle and the strike its Normal rig plays.
 */

/** Ashen lavender: the Voidrift's folk (the Normal rigs' skin) */
const ASH = "#a094b4";

/** A strike is all these play; the roar slot is never shown (no button names it) */
const STILL: BossAction = { len: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: {} }] };

/** A face at `c0` (the head's centre) on a head of `r` (x, y, z radii): brow, eyes under lids, a nose, a mouth */
function face(c: BossCtx, c0: V3, r: V3, skin: string, o: { eyes?: boolean } = {}) {
  const at = (x: number, y: number) => onBlob(c0, r, [0, 0, 0], [x, y, 1]).p;
  blob(c, "matte", add(at(0, 0.32), [0, 0, -0.012]), [r[0] * 0.78, r[1] * 0.14, r[2] * 0.26], { color: skin, wd: 10, hd: 5 });
  if (o.eyes !== false)
    for (const s of [1, -1]) {
      const e = at(s * 0.36, 0.12);
      blob(c, "gloss", add(e, [0, 0, -0.012]), [r[0] * 0.17, r[1] * 0.12, r[2] * 0.12], { color: "#e7e2ee", wd: 8, hd: 5 });
      blob(c, "matte", add(e, [0, 0, 0.0]), [r[0] * 0.08, r[1] * 0.08, r[2] * 0.06], { color: "#2a2238", wd: 6, hd: 4 });
      // The upper lid, heavy and calm
      blob(c, "matte", add(e, [0, r[1] * 0.08, -0.006]), [r[0] * 0.2, r[1] * 0.07, r[2] * 0.13], { color: skin, wd: 8, hd: 4 });
    }
  spike(c, "matte", add(at(0, 0.02), [0, 0, -0.01]), [0, -0.55, 1], r[0] * 0.15, r[2] * 0.36, { color: skin, seg: 5 });
  blob(c, "matte", add(at(0, -0.42), [0, 0, -0.008]), [r[0] * 0.3, r[1] * 0.045, r[2] * 0.07], { color: "#4a3a52", wd: 8, hd: 4 });
  for (const s of [1, -1]) blob(c, "matte", [c0[0] + s * r[0] * 0.98, c0[1] + 0.01, c0[2] - 0.01], [r[0] * 0.14, r[1] * 0.26, r[2] * 0.2], { color: skin, wd: 6, hd: 5 });
}

/** A fist round a grip running along `d` (the grip passes through it): the hand, its knuckles, a thumb over the grip */
function fist(c: BossCtx, bucket: string, at: V3, d: V3, s: number, color: string, size = 1) {
  blob(c, bucket, at, [0.055 * size, 0.06 * size, 0.06 * size], { color, wd: 9, hd: 7 });
  const side = norm(cross(d, [0, 0, 1]));
  for (let i = 0; i < 4; i++) blob(c, bucket, add(add(at, d, (i - 1.5) * 0.026 * size), [0, 0, 0.045 * size]), [0.02 * size, 0.018 * size, 0.022 * size], { color, wd: 6, hd: 4 });
  seg(c, bucket, add(at, side, -s * 0.04 * size), add(add(at, d, 0.05 * size), [0, 0, 0.04 * size]), 0.017 * size, 0.014 * size, { color, seg: 6 });
}

/** An open hand at `at`, palm turned toward `up`, fingers reaching along `along` and curling by `curl` */
function openHand(c: BossCtx, bucket: string, at: V3, up: V3, along: V3, s: number, color: string, curl = 0.35, claw?: string) {
  plate(c, bucket, at, up, along, 0.05, 0.022, 0.06, { color, wd: 9 });
  const side = norm(cross(up, along));
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.024;
    const root = add(add(at, along, 0.05), side, x);
    const dir = norm(add(along, side, x * 1.5));
    hook(c, bucket, root, dir, [up[0] * curl, up[1] * curl, up[2] * curl], 0.012, 0.085 - Math.abs(i - 1.5) * 0.012, 3, { color });
    if (claw) spike(c, "matte", add(root, dir, 0.075), add(dir, up, curl * 1.5), 0.008, 0.035, { color: claw, seg: 4 });
  }
  hook(c, bucket, add(add(at, side, s * 0.045), along, 0.01), norm(add(side, along, -0.6 * s)).map((v) => v * s) as V3, [0, 0.1, 0.1], 0.013, 0.065, 2, { color });
}

/** A bell sleeve from the elbow to the wrist with a turned-back cuff */
function sleeve(c: BossCtx, el: V3, wr: V3, r0: number, r1: number, color: string, cuff: string, cuffBucket = "cloth") {
  c.k.along("cloth", el, wr, 0, { geo: new THREE.CylinderGeometry(r1, r0, 1, 12, 1, true), color });
  c.k.add(cuffBucket, new THREE.TorusGeometry(r1, 0.012, 4, 14), wr, undefined, { color: cuff, quat: across(sub(wr, el)) });
}

/* ================================================================== */
/* Rift Acolyte (common)                                               */
/* ================================================================== */

const AC = {
  robe: "#5d5752",
  robe2: "#48423d",
  hood: "#423c37",
  sash: "#5b4a73",
  sandal: "#3b2f26",
  wood: "#6e5841",
  wood2: "#56432f",
  iron: "#5a5a5e",
  stone: "#4c1d95"
};
const AC_TAILS = 2;

function acolyteArm(c: BossCtx, s: number) {
  const S = sideOf(s);
  const sh: V3 = [s * 0.25, 1.62, 0];
  const el: V3 = s > 0 ? [0.31, 1.35, 0.08] : [-0.3, 1.36, 0.07];
  const wr: V3 = s > 0 ? [0.35, 1.13, 0.27] : [-0.13, 1.17, 0.27];
  c.bone(`arm${S}`, sh, () => {
    seg(c, "cloth", sh, el, 0.075, 0.068, { color: AC.robe, seg: 9 });
    c.bone(`fore${S}`, el, () => {
      sleeve(c, el, wr, 0.07, 0.105, AC.robe, AC.robe2);
      c.bone(`hand${S}`, wr, () => {
        if (s > 0) {
          // His right fist round the staff: a plain grained shaft, an iron ferrule and a wooden claw holding the stone
          const d: V3 = [0, 1, 0];
          fist(c, "matte", add(wr, [0, -0.01, 0.01]), d, s, ASH, 0.9);
          const foot = add(wr, [0, -1.12, 0]);
          const top = add(wr, [0, 0.96, 0]);
          // The shaft stops under the ferrule and starts again above it (never a sleeve over it)
          seg(c, "matte", foot, add(top, [0, -0.095, 0]), 0.026, 0.03, { color: AC.wood, seg: 8, cap: false, surf: grainRound(0.03) });
          seg(c, "matte", add(top, [0, -0.045, 0]), top, 0.03, 0.03, { color: AC.wood, seg: 8, cap: false, surf: grainRound(0.03) });
          c.k.add("iron", new THREE.ConeGeometry(0.03, 0.08, 7), add(foot, [0, 0.03, 0]), [Math.PI, 0, 0], { color: AC.iron });
          blob(c, "matte", add(top, [0, 0.02, 0]), [0.045, 0.05, 0.045], { color: AC.wood2, wd: 8, hd: 6 });
          c.k.add("iron", new THREE.CylinderGeometry(0.036, 0.036, 0.05, 10), add(top, [0, -0.07, 0]), undefined, { color: AC.iron });
          const stone = add(top, [0, 0.14, 0]);
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU + 0.4;
            hook(c, "matte", add(top, [Math.cos(a) * 0.03, 0.04, Math.sin(a) * 0.03]), [Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6], [-Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35], 0.014, 0.13, 3, { color: AC.wood2 });
          }
          // A polished violet stone, unlit: a novice's
          c.k.add("gloss", new THREE.IcosahedronGeometry(0.06, 1), stone, [0.3, 0.5, 0], { color: AC.stone, scale: [1, 1.3, 1] });
        } else {
          // His free hand, loose before his belly
          openHand(c, "matte", add(wr, [0.01, -0.01, 0.03]), [0.5, 0.2, 0.2], [0.35, -0.7, 0.5], s, ASH, 0.6);
        }
      });
    });
  });
}

function acolyteHead(c: BossCtx) {
  c.bone("head", [0, 1.76, 0], () => {
    seg(c, "matte", [0, 1.72, 0], [0, 1.84, 0.01], 0.055, 0.05, { color: ASH, seg: 8 });
    const h: V3 = [0, 1.92, 0.02];
    blob(c, "matte", h, [0.1, 0.12, 0.105], { color: ASH, wd: 14, hd: 10 });
    face(c, h, [0.1, 0.12, 0.105], ASH);
    // The deep hood, open at the face, its point drooping down his back
    c.k.add("cloth", new THREE.SphereGeometry(1, 16, 10, Math.PI / 2 + 0.62, TAU - 1.24, 0, Math.PI * 0.74), [0, 1.93, -0.01], undefined, { color: AC.hood, scale: [0.165, 0.19, 0.18] });
    c.bone("hoodTip", [0, 2.04, -0.13], () => {
      seg(c, "cloth", [0, 2.04, -0.13], [0, 1.97, -0.34], 0.085, 0.016, { color: AC.hood, seg: 8 });
    });
  });
}

function acolyte(c: BossCtx) {
  // Sandalled feet under the hem (a bone of their own: nothing of the creature stays on the root, which never turns)
  c.bone("feet", [0, 0, 0], () => {
    for (const s of [1, -1]) {
      blob(c, "matte", [s * 0.12, 0.045, s > 0 ? 0.3 : 0.36], [0.06, 0.04, 0.1], { color: ASH, wd: 8, hd: 5 });
      c.k.add("matte", new THREE.BoxGeometry(0.14, 0.02, 0.24), [s * 0.12, 0.01, s > 0 ? 0.3 : 0.36], undefined, { color: AC.sandal });
    }
  });
  c.bone("hips", [0, 0.95, 0], () => {
    // The coarse wool robe to the ground, a darker band at the hem
    c.k.add("cloth", new THREE.CylinderGeometry(0.25, 0.47, 1.18, 22, 3, true), [0, 0.63, 0], undefined, { color: AC.robe, surf: cloth(1, 1.18) });
    c.k.add("cloth", new THREE.TorusGeometry(0.465, 0.03, 5, 26), [0, 0.06, 0], [Math.PI / 2, 0, 0], { color: AC.robe2 });
    // A plum sash, knotted at his left hip, its tails hanging
    c.k.add("cloth", new THREE.TorusGeometry(0.255, 0.045, 5, 22), [0, 1.2, 0], [Math.PI / 2, 0, 0], { color: AC.sash, scale: [1, 0.9, 1.25] });
    blob(c, "cloth", [-0.16, 1.18, 0.2], [0.05, 0.045, 0.04], { color: AC.sash, wd: 8, hd: 6 });
    for (let t = 0; t < AC_TAILS; t++) {
      c.k.frame([-0.16 - t * 0.03, 1.16, 0.22 - t * 0.01], [0, 0, 0], 1, () =>
        chainBones(c, `tail${t}`, [0, 0, 0], [0.18, 0.17], [1.45, 1.5], [0.034, 0.03, 0.02], { bucket: "cloth", color: t ? AC.sash : "#4f3f66", seg: 6, yaw: [0.15 * t, 0.1] })
      );
    }
    c.bone("chest", [0, 1.22, 0], () => {
      seg(c, "cloth", [0, 1.18, 0], [0, 1.62, 0], 0.24, 0.235, { color: AC.robe, seg: 16, cap: false });
      blob(c, "cloth", [0, 1.6, 0], [0.235, 0.1, 0.19], { color: AC.robe, wd: 14, hd: 6 });
      // The hood's cowl falling over the shoulders
      c.k.add("cloth", new THREE.CylinderGeometry(0.11, 0.29, 0.3, 20, 2, true), [0, 1.68, -0.01], undefined, { color: AC.hood, scale: [1, 1, 0.85] });
      c.k.add("cloth", new THREE.TorusGeometry(0.29, 0.018, 4, 24), [0, 1.53, -0.01], [Math.PI / 2, 0, 0], { color: AC.robe2, scale: [1, 0.85, 1] });
      acolyteArm(c, 1);
      acolyteArm(c, -1);
      acolyteHead(c);
    });
  });
}

function acolyteIdle(c: IdleCtx) {
  // He leans on his staff and breathes, shifts his weight, glances round; now and then he looks up at the stone or rubs his hand
  const breath = c.sin(1.15);
  const shift = c.drift(0.3);
  c.add("hips", [0.015 * c.drift(0.25, 1), 0.04 * c.drift(0.2, 2), -0.025 * shift]);
  c.add("chest", [0.02 * breath + 0.02 * c.drift(0.35, 2), 0.05 * c.drift(0.22, 3), 0.025 * shift], null, 0.012 * breath);
  c.add("head", [0.05 * c.drift(0.4), 0.3 * c.glance(1, 4.4, 0.35), 0.05 * c.drift(0.3, 1)]);
  c.add("armR", [0.03 * c.drift(0.4, 1), 0, 0.02 * c.drift(0.33)]);
  c.add("armL", [0.04 * c.drift(0.45, 3), 0, -0.03 * c.drift(0.37, 2)]);
  const look = c.event(2, 9, 2.4).e;
  c.add("head", [-0.4 * look, 0.35 * look, 0.1 * look]);
  c.add("chest", [-0.06 * look, 0.08 * look, 0]);
  const rub = c.event(3, 7, 1.8).e;
  c.add("foreL", [-0.25 * rub, 0, 0]);
  c.add("handL", [0.25 * rub * Math.sin(c.t * 7), 0, 0.3 * rub * Math.sin(c.t * 5)]);
  c.add("hoodTip", [0.06 * c.drift(0.6), 0, 0.08 * c.drift(0.5, 1)]);
  for (let t = 0; t < AC_TAILS; t++) for (let j = 0; j < 2; j++) c.add(`tail${t}${j}`, [0.05 * Math.sin(c.t * 1.4 - j * 0.8 + t), 0, 0.06 * Math.sin(c.t * 1.1 - j * 0.6 + t * 2)]);
}

const AC_DEF: BossHeroDef = {
  build: acolyte,
  // Leaning a little on the staff, head bowed, the free hand lower: never mirrored
  rest: {
    hips: { r: [0.02, 0.08, -0.025] },
    chest: { r: [0.05, -0.06, 0.02] },
    head: { r: [0.14, 0.12, -0.06] },
    armR: { r: [-0.05, 0, 0.04] },
    armL: { r: [-0.08, 0, -0.06] },
    foreL: { r: [-0.1, 0, 0] }
  },
  idle: acolyteIdle,
  roar: STILL,
  attack: {
    len: 2.3,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // The staff lifted high, held upright, leaning back
      { t: 0.3, pose: { hips: { p: [0, 0.02, -0.04] }, chest: { r: [-0.12, 0.1, 0] }, head: { r: [-0.2, 0, 0] }, armR: { r: [-0.85, 0, 0.15] }, foreR: { r: [-0.8, 0, 0] }, handR: { r: [1.35, 0, 0] }, armL: { r: [-0.35, 0, -0.25] }, foreL: { r: [-0.3, 0, 0] } } },
      { t: 0.44, hold: true, pose: { hips: { p: [0, 0.03, -0.05] }, chest: { r: [-0.18, 0.12, 0] }, head: { r: [-0.26, 0, 0] }, armR: { r: [-1.05, 0, 0.18] }, foreR: { r: [-0.95, 0, 0] }, handR: { r: [1.6, 0, 0] }, armL: { r: [-0.4, 0, -0.3] }, foreL: { r: [-0.35, 0, 0] } } },
      // Slammed down ahead of him, its foot striking the ground
      { t: 0.56, pose: { hips: { p: [0, -0.06, 0.06] }, chest: { r: [0.32, -0.05, 0] }, head: { r: [0.2, 0, 0] }, armR: { r: [-0.55, 0, 0.05] }, foreR: { r: [-0.35, 0, 0] }, handR: { r: [0.45, 0, 0] }, armL: { r: [-0.15, 0, -0.1] } } },
      { t: 0.66, pose: { hips: { p: [0, -0.07, 0.07] }, chest: { r: [0.36, -0.06, 0] }, head: { r: [0.24, 0, 0] }, armR: { r: [-0.5, 0, 0.05] }, foreR: { r: [-0.3, 0, 0] }, handR: { r: [0.42, 0, 0] } } },
      { t: 0.86, hold: true, pose: { hips: { p: [0, -0.02, 0.02] }, chest: { r: [0.1, 0, 0] }, armR: { r: [-0.2, 0, 0] }, handR: { r: [0.15, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: { quake: 0.05, stop: 0.04, flash: 0.1, flashCol: "#e7e5e4" } }]
  },
  lag: { chest: 0.03, head: 0.06, armR: 0.03, foreR: 0.05, handR: 0.07, armL: 0.05, foreL: 0.07, handL: 0.09, hoodTip: 0.1, ...chainLag("tail0", 2, 0.05, 0.08), ...chainLag("tail1", 2, 0.05, 0.1) },
  springs: { hoodTip: 50, ...chainSprings("tail0", 2, 45), ...chainSprings("tail1", 2, 40) },
  burst: { at: [0.36, 0.08, 0.72], color: "#a8a29e", count: 30, speed: 1.2, spread: 0.3, size: 0.14, gravity: 4 },
  height: 2.3,
  frame: [5.0, 2.4, 1.15],
  walk: march({ float: true, swingR: 0.2, swingL: 0.6 }),
  actions: [
    { id: "idle", label: "Idle" },
    { id: "walk", label: "March" },
    { id: "attack", label: "Staff slam" }
  ]
};

/* ================================================================== */
/* Riftguard Sentinel (uncommon)                                       */
/* ================================================================== */

const RG = {
  iron: "#5e636c",
  iron2: "#4a4e57",
  steel: "#767b84",
  leather: "#2b2430",
  leather2: "#3a2d24",
  violet: "#4a2785",
  violet2: "#3b1f69",
  wood: "#4a3523",
  glass: "#d9cfae",
  slit: "#0c0a12"
};

function riftguardArm(c: BossCtx, s: number) {
  const S = sideOf(s);
  const sh: V3 = [s * 0.4, 1.68, 0];
  const el: V3 = s > 0 ? [0.47, 1.36, 0.05] : [-0.46, 1.37, 0.09];
  const wr: V3 = s > 0 ? [0.5, 1.1, 0.24] : [-0.42, 1.17, 0.31];
  c.bone(`arm${S}`, sh, () => {
    seg(c, "matte", sh, el, 0.085, 0.078, { color: RG.leather, seg: 9 });
    c.k.add("iron", new THREE.SphereGeometry(1, 10, 7), mid(sh, el, 0.55), undefined, { color: RG.iron2, scale: [0.11, 0.13, 0.11], quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...sub(sh, el)).normalize()) });
    blob(c, "iron", el, [0.09, 0.08, 0.095], { color: RG.iron, wd: 9, hd: 6 });
    c.bone(`fore${S}`, el, () => {
      seg(c, "iron", el, wr, 0.08, 0.07, { color: RG.iron, seg: 9 });
      c.bone(`hand${S}`, wr, () => {
        if (s > 0) {
          // An arming sword of dull steel, its leather grip through the gauntlet
          const d = norm([0.05, 0.75, 0.66]);
          fist(c, "iron", wr, d, s, RG.iron, 1.15);
          seg(c, "matte", add(wr, d, -0.11), add(wr, d, 0.1), 0.02, 0.02, { color: RG.leather2, seg: 6, cap: false });
          blob(c, "iron", add(wr, d, -0.13), [0.035, 0.035, 0.035], { color: RG.steel, wd: 8, hd: 6 });
          const side = norm(cross(d, [0, 0, 1]));
          const g = add(wr, d, 0.12);
          seg(c, "iron", add(g, side, -0.13), add(g, side, 0.13), 0.018, 0.018, { color: RG.steel, seg: 6 });
          const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...d), new THREE.Vector3(...side), new THREE.Vector3(...norm(cross(d, side)))));
          const L = 0.86;
          const blade = new THREE.Shape();
          blade.moveTo(0, -0.04);
          blade.lineTo(L * 0.82, -0.032);
          blade.lineTo(L, 0);
          blade.lineTo(L * 0.82, 0.032);
          blade.lineTo(0, 0.04);
          const geo = new THREE.ExtrudeGeometry(blade, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 1 }).translate(0, 0, -0.006);
          c.k.add("iron", geo, add(g, d, 0.01), undefined, { color: RG.steel, quat: q });
        } else {
          // His shield strapped to the forearm: violet-painted boards, an iron rim and boss, rivets and iron bands
          blob(c, "iron", wr, [0.06, 0.065, 0.065], { color: RG.iron, wd: 8, hd: 6 });
          const o: V3 = [-0.5, 1.25, 0.44];
          const n: V3 = norm([-0.3, 0, 1]);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
          c.k.add("matte", new THREE.CylinderGeometry(0.38, 0.38, 0.05, 28), o, undefined, { color: RG.violet, quat: q });
          c.k.add("iron", new THREE.TorusGeometry(0.38, 0.032, 5, 32), o, undefined, { color: RG.iron2, quat: across(n) });
          blob(c, "iron", add(o, n, 0.03), [0.1, 0.1, 0.1], { color: RG.steel, wd: 12, hd: 8, rot: [0, 0, 0] });
          const u = norm(cross(n, [0, 1, 0]));
          for (const dir of [u, [0, 1, 0] as V3]) seg(c, "iron", add(add(o, n, 0.025), dir, -0.33), add(add(o, n, 0.025), dir, 0.33), 0.018, 0.018, { color: RG.iron2, seg: 6, cap: false });
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + 0.39;
            const p = add(add(o, n, 0.026), add(u.map((v) => v * Math.cos(a) * 0.28) as V3, [0, Math.sin(a) * 0.28, 0]));
            stud(c, "iron", p, n, 0.02, 0.014, { color: RG.steel });
          }
        }
      });
    });
  });
}

function riftguardHead(c: BossCtx) {
  c.bone("head", [0, 1.8, 0], () => {
    // A great helm of dull iron: a dark visor slit, breaths pierced in the cheek, a ridge over the crown
    c.k.add("iron", new THREE.CylinderGeometry(0.165, 0.175, 0.3, 18), [0, 1.98, 0.01], undefined, { color: RG.iron });
    c.k.add("iron", new THREE.SphereGeometry(0.165, 18, 8, 0, TAU, 0, Math.PI / 2), [0, 2.13, 0.01], undefined, { color: RG.iron, scale: [1, 0.7, 1] });
    c.k.add("iron", new THREE.TorusGeometry(0.176, 0.02, 4, 22), [0, 1.84, 0.01], [Math.PI / 2, 0, 0], { color: RG.iron2 });
    c.k.add("iron", new THREE.TorusGeometry(0.168, 0.016, 4, 22), [0, 2.12, 0.01], [Math.PI / 2, 0, 0], { color: RG.iron2 });
    c.k.add("matte", new THREE.BoxGeometry(0.24, 0.028, 0.06), [0, 2.02, 0.17], undefined, { color: RG.slit });
    c.k.add("matte", new THREE.BoxGeometry(0.026, 0.1, 0.05), [0, 1.95, 0.175], undefined, { color: RG.slit });
    for (let i = 0; i < 5; i++) blob(c, "matte", [0.07 + (i % 2) * 0.03, 1.94 - Math.floor(i / 2) * 0.03, 0.16], [0.009, 0.009, 0.02], { color: RG.slit, wd: 5, hd: 3 });
    c.k.add("iron", new THREE.TorusGeometry(0.16, 0.022, 5, 18, Math.PI), [0, 2.13, 0.01], [0, Math.PI / 2, 0], { color: RG.iron2, scale: [1, 0.72, 1] });
  });
}

/** His lantern at the belt, unlit: an iron cage, a cap and ring, panes of horn */
function beltLantern(c: BossCtx) {
  const top: V3 = [0.3, 0.99, 0.12];
  c.bone("lantern", top, () => {
    c.k.add("iron", new THREE.TorusGeometry(0.025, 0.006, 4, 8), add(top, [0, -0.02, 0]), [0, 0, 0], { color: RG.iron2 });
    const o = add(top, [0, -0.15, 0]);
    c.k.add("iron", new THREE.ConeGeometry(0.055, 0.06, 6), add(o, [0, 0.1, 0]), undefined, { color: RG.iron2 });
    c.k.add("gloss", new THREE.CylinderGeometry(0.042, 0.042, 0.12, 6), o, undefined, { color: RG.glass });
    c.k.add("iron", new THREE.CylinderGeometry(0.052, 0.052, 0.02, 6), add(o, [0, -0.07, 0]), undefined, { color: RG.iron2 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const p: V3 = [o[0] + Math.sin(a) * 0.046, o[1], o[2] + Math.cos(a) * 0.046];
      seg(c, "iron", add(p, [0, -0.065, 0]), add(p, [0, 0.07, 0]), 0.006, 0.006, { color: RG.iron2, seg: 4, cap: false });
    }
  });
}

function riftguard(c: BossCtx) {
  // Legs: thighs in leather under iron cuisses, poleyns, greaves, sabatons; the left foot forward
  for (const s of [1, -1]) {
    const S = sideOf(s);
    const fz = s > 0 ? -0.04 : 0.12;
    const hip: V3 = [s * 0.15, 0.93, 0];
    const knee: V3 = [s * 0.17, 0.52, 0.04 + fz * 0.5];
    const ankle: V3 = [s * 0.18, 0.13, fz];
    c.bone(`thigh${S}`, hip, () => {
      seg(c, "matte", hip, knee, 0.115, 0.09, { color: RG.leather, seg: 9 });
      plate(c, "iron", add(mid(hip, knee, 0.45), [0, 0, 0.06]), [0, 0.1, 1], sub(knee, hip), 0.09, 0.03, 0.17, { color: RG.iron2 });
      c.bone(`shin${S}`, knee, () => {
        blob(c, "iron", add(knee, [0, 0.01, 0.05]), [0.075, 0.07, 0.055], { color: RG.iron, wd: 9, hd: 6 });
        seg(c, "iron", knee, ankle, 0.08, 0.068, { color: RG.iron, seg: 10 });
        blob(c, "iron", [ankle[0], 0.07, ankle[2] + 0.07], [0.08, 0.065, 0.15], { color: RG.iron2, wd: 10, hd: 6 });
      });
    });
  }
  c.bone("hips", [0, 0.95, 0], () => {
    blob(c, "matte", [0, 0.98, 0], [0.25, 0.15, 0.19], { color: RG.leather, wd: 12, hd: 7 });
    c.k.add("matte", new THREE.TorusGeometry(0.25, 0.035, 5, 20), [0, 1.06, 0], [Math.PI / 2, 0, 0], { color: RG.leather2, scale: [1, 0.78, 1] });
    c.k.add("iron", new THREE.BoxGeometry(0.08, 0.07, 0.03), [0, 1.06, 0.215], undefined, { color: RG.steel });
    // Tassets over the hips
    for (const s of [1, -1]) plate(c, "iron", [s * 0.23, 0.92, 0.05], [s, 0.25, 0.25], [0, -1, 0.05], 0.12, 0.025, 0.14, { color: RG.iron });
    // The violet tabard, front and back, hanging from the belt to the knees
    for (const [name, z, ry] of [
      ["tabF", 0.205, 0],
      ["tabB", -0.205, Math.PI]
    ] as const) {
      c.bone(name, [0, 1.03, z], () => {
        c.k.add("cloth", new THREE.PlaneGeometry(0.3, 0.58, 1, 4), [0, 0.74, z + Math.sign(z) * 0.015], [Math.sign(z) * 0.06, ry, 0], { color: RG.violet, surf: cloth(0.3, 0.58) });
        seg(c, "cloth", [-0.15, 0.47, z + Math.sign(z) * 0.03], [0.15, 0.47, z + Math.sign(z) * 0.03], 0.016, 0.016, { color: RG.violet2, seg: 6, cap: false });
      });
    }
    beltLantern(c);
    // The scabbard at his left hip, a pouch behind
    c.k.along("matte", [-0.26, 1.0, -0.06], [-0.37, 0.36, -0.27], [0.06, 0.1], { color: RG.leather2 });
    c.k.add("iron", new THREE.ConeGeometry(0.045, 0.1, 6), [-0.375, 0.32, -0.28], [Math.PI - 0.17, 0, -0.17], { color: RG.iron2 });
    c.k.add("iron", new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), [-0.27, 0.95, -0.075], [0.3, 0, 0.17], { color: RG.iron2 });
    blob(c, "matte", [0.19, 0.96, -0.19], [0.07, 0.08, 0.05], { color: RG.leather2, wd: 8, hd: 6 });
    c.k.add("iron", new THREE.BoxGeometry(0.03, 0.03, 0.02), [0.19, 0.99, -0.245], undefined, { color: RG.steel });
    c.bone("chest", [0, 1.1, 0], () => {
      seg(c, "matte", [0, 1.04, 0], [0, 1.24, 0.01], 0.22, 0.26, { color: RG.leather, seg: 12, cap: false });
      blob(c, "iron", [0, 1.44, 0.01], [0.31, 0.33, 0.23], { color: RG.iron, wd: 16, hd: 10 });
      seg(c, "iron", [0, 1.2, 0.225], [0, 1.66, 0.215], 0.02, 0.018, { color: RG.steel, seg: 6 });
      // Rivets along the breastplate's edge
      for (let i = 0; i < 7; i++) {
        const { p, n } = onBlob([0, 1.44, 0.01], [0.31, 0.33, 0.23], [0, 0, 0], [(i - 3) * 0.32, -0.62, 1]);
        stud(c, "iron", p, n, 0.016, 0.01, { color: RG.steel });
      }
      c.k.add("iron", new THREE.CylinderGeometry(0.15, 0.19, 0.12, 14), [0, 1.76, 0], undefined, { color: RG.iron2 });
      // Layered pauldrons
      for (const s of [1, -1]) {
        blob(c, "iron", [s * 0.38, 1.73, 0], [0.16, 0.11, 0.17], { color: RG.iron, wd: 12, hd: 7, rot: [0, 0, -s * 0.35] });
        plate(c, "iron", [s * 0.44, 1.6, 0], [s, 0.6, 0], [0, 0, 1], 0.11, 0.03, 0.15, { color: RG.iron2 });
        stud(c, "iron", [s * 0.43, 1.8, 0.08], [s * 0.4, 1, 0.3], 0.018, 0.012, { color: RG.steel });
      }
      riftguardArm(c, 1);
      riftguardArm(c, -1);
      riftguardHead(c);
    });
  });
}

function riftguardIdle(c: IdleCtx) {
  // He stands his post: breath, weight from foot to foot, glances; the sword tip loose; now and then he hitches the shield up
  const breath = c.sin(1.05);
  const shift = c.drift(0.28);
  c.add("hips", [0.015 * c.drift(0.25, 1), 0.04 * c.drift(0.2, 2), -0.03 * shift], [0.025 * shift, 0.008 * breath, 0]);
  for (const S of ["L", "R"]) {
    c.add(`thigh${S}`, [0, 0, 0.03 * shift]);
    c.add(`shin${S}`, [0, 0, -0.03 * shift]);
  }
  c.add("chest", [0.02 * breath, 0.06 * c.drift(0.22, 3), 0.03 * shift], null, 0.01 * breath);
  c.add("head", [0.04 * c.drift(0.4), 0.35 * c.glance(1, 4.0, 0.3), 0.04 * c.drift(0.3, 1)]);
  c.add("armR", [0.04 * c.drift(0.4, 1), 0, 0.02 * c.drift(0.33)]);
  c.add("handR", [0.08 * c.drift(0.5, 2), 0, 0.06 * c.drift(0.45)]);
  c.add("armL", [0.03 * c.drift(0.38, 3), 0, -0.02 * c.drift(0.3, 2)]);
  const hitch = c.event(2, 8, 1.4).e;
  c.add("armL", [-0.25 * hitch, 0, 0]);
  c.add("foreL", [-0.15 * hitch, 0, 0]);
  c.add("handL", [0.35 * hitch, 0, 0]);
  const roll = c.event(3, 11, 1.8).e;
  c.add("handR", [0, 0.6 * roll * Math.sin(c.t * 4), 0]);
  c.add("tabF", [0.04 * c.drift(0.6) + 0.02 * shift, 0, 0.03 * c.drift(0.5, 1)]);
  c.add("tabB", [0.04 * c.drift(0.55, 2), 0, 0.03 * c.drift(0.45, 3)]);
  c.add("lantern", [0.08 * Math.sin(c.t * 1.9), 0, 0.06 * Math.sin(c.t * 1.4 + 1)]);
}

const RG_DEF: BossHeroDef = {
  build: riftguard,
  // Weight on the right foot, the sword low and forward, the shield carried before him: never mirrored
  rest: {
    hips: { r: [0, 0.1, 0.02] },
    chest: { r: [0.03, -0.1, -0.01] },
    head: { r: [0.06, 0.08, 0.03] },
    thighL: { r: [-0.06, 0, 0] },
    shinL: { r: [0.08, 0, 0] },
    armR: { r: [-0.15, 0, 0.06] },
    foreR: { r: [-0.25, 0, 0] },
    handR: { r: [0.15, 0, 0] },
    armL: { r: [-0.2, 0, -0.04] },
    foreL: { r: [-0.15, 0, 0] },
    handL: { r: [0.3, 0, 0] }
  },
  idle: riftguardIdle,
  roar: STILL,
  attack: {
    len: 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // The sword drawn up over his right shoulder behind the shield, weight back
      { t: 0.3, pose: { hips: { p: [0, -0.04, -0.08], r: [0, 0.2, 0] }, thighR: { r: [-0.12, 0, 0] }, shinR: { r: [0.22, 0, 0] }, chest: { r: [-0.1, 0.25, 0] }, head: { r: [0.05, -0.2, 0] }, armR: { r: [-2.5, 0, 0.35] }, foreR: { r: [-0.9, 0, 0] }, handR: { r: [-0.35, 0, 0] }, armL: { r: [-0.65, 0, 0.1] }, foreL: { r: [-0.35, 0, 0] }, handL: { r: [0.9, 0, 0] } } },
      { t: 0.44, hold: true, pose: { hips: { p: [0, -0.06, -0.1], r: [0, 0.24, 0] }, thighR: { r: [-0.15, 0, 0] }, shinR: { r: [0.28, 0, 0] }, chest: { r: [-0.14, 0.3, 0] }, head: { r: [0.06, -0.24, 0] }, armR: { r: [-2.65, 0, 0.38] }, foreR: { r: [-1.0, 0, 0] }, handR: { r: [-0.45, 0, 0] }, armL: { r: [-0.7, 0, 0.12] }, foreL: { r: [-0.4, 0, 0] }, handL: { r: [1.0, 0, 0] } } },
      // A step in and a cut down across, the impact mid-swing
      { t: 0.56, pose: { hips: { p: [0, -0.08, 0.18], r: [0, -0.12, 0] }, thighL: { r: [-0.5, 0, 0] }, shinL: { r: [0.42, 0, 0] }, thighR: { r: [0.25, 0, 0] }, shinR: { r: [0.12, 0, 0] }, chest: { r: [0.3, -0.25, 0] }, head: { r: [0.05, 0.1, 0] }, armR: { r: [-0.8, 0, -0.35] }, foreR: { r: [-0.05, 0, 0] }, handR: { r: [1.55, 0, 0] }, armL: { r: [-0.45, 0, 0.15] }, foreL: { r: [-0.3, 0, 0] }, handL: { r: [0.65, 0, 0] } } },
      { t: 0.68, pose: { hips: { p: [0, -0.09, 0.2], r: [0, -0.16, 0] }, thighL: { r: [-0.52, 0, 0] }, shinL: { r: [0.45, 0, 0] }, thighR: { r: [0.27, 0, 0] }, shinR: { r: [0.14, 0, 0] }, chest: { r: [0.38, -0.32, 0] }, head: { r: [0.08, 0.12, 0] }, armR: { r: [-0.4, 0, -0.55] }, foreR: { r: [-0.05, 0, 0] }, handR: { r: [1.9, 0, 0] } } },
      { t: 0.86, hold: true, pose: { hips: { p: [0, -0.02, 0.05] }, thighL: { r: [-0.12, 0, 0] }, shinL: { r: [0.1, 0, 0] }, chest: { r: [0.08, 0, 0] }, armR: { r: [-0.25, 0, -0.1] }, handR: { r: [0.5, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: { quake: 0.08, stop: 0.05, flash: 0.18, flashCol: "#e5e7eb", vig: 0.15, vigCol: "#1e1b4b" } }]
  },
  lag: { hips: 0.02, chest: 0.035, head: 0.06, armR: 0.04, foreR: 0.05, handR: 0.07, armL: 0.06, foreL: 0.07, tabF: 0.08, tabB: 0.1, lantern: 0.12 },
  springs: { tabF: 55, tabB: 50, lantern: 35 },
  burst: { at: [0.05, 0.25, 1.05], color: "#d6d3d1", count: 36, speed: 1.6, spread: 0.4, size: 0.1, gravity: 5 },
  height: 2.4,
  frame: [5.2, 2.5, 1.2],
  walk: march({ swingL: 0.15, swingR: 0.5 }),
  actions: [
    { id: "idle", label: "Idle" },
    { id: "walk", label: "March" },
    { id: "attack", label: "Strike" }
  ]
};

/* ================================================================== */
/* Astral Seer (rare)                                                  */
/* ================================================================== */

const SE = {
  robe: "#1e1b4b",
  robe2: "#272363",
  mantle: "#312e81",
  hood: "#2a2672",
  steel: "#c7ccd6",
  steel2: "#9aa1ae",
  band: "#e0e7ff",
  star: "#38bdf8",
  starHot: "#bae6fd",
  tome: "#4c1d95",
  page: "#f1ead6",
  gem: "#7dd3fc"
};
const SE_ORBS = 5;
/** She hovers this far off the ground */
const SE_FLOAT = 0.35;

/** The robe: an open cone to the ground whose hem trails into five long points */
function seerRobe(): THREE.BufferGeometry {
  const h = 0.95;
  const g = new THREE.CylinderGeometry(0.24, 0.44, h, 30, 5, true);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const low = Math.max(0, -y / h + 0.5);
    const th = thetaOf(p.getX(i), p.getZ(i));
    const point = Math.max(0, Math.cos(th * 5 + 0.3)) ** 2;
    p.setY(i, y - low * low * point * 0.34);
    // The points tuck in a little as they trail
    const k = 1 - low * low * point * 0.18;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function seerArm(c: BossCtx, s: number) {
  const S = sideOf(s);
  const sh: V3 = [s * 0.24, 1.6, 0];
  const el: V3 = s > 0 ? [0.33, 1.37, 0.15] : [-0.32, 1.38, 0.13];
  const wr: V3 = s > 0 ? [0.25, 1.27, 0.43] : [-0.24, 1.29, 0.42];
  c.bone(`arm${S}`, sh, () => {
    seg(c, "cloth", sh, el, 0.07, 0.065, { color: SE.mantle, seg: 9 });
    c.bone(`fore${S}`, el, () => {
      sleeve(c, el, wr, 0.065, 0.078, SE.mantle, SE.steel, "iron");
      c.bone(`hand${S}`, wr, () => {
        // Open palms turned to the tome, fingers lightly curled
        openHand(c, "matte", add(wr, [0, -0.01, 0.04]), [-s * 0.6, -0.5, 0.1], [s * 0.15, -0.25, 1], s, ASH, 0.25);
      });
    });
  });
}

function seerHead(c: BossCtx) {
  c.bone("head", [0, 1.7, 0], () => {
    seg(c, "matte", [0, 1.68, 0], [0, 1.78, 0.02], 0.05, 0.046, { color: ASH, seg: 8 });
    const h: V3 = [0, 1.85, 0.03];
    const r: V3 = [0.095, 0.115, 0.1];
    blob(c, "matte", h, r, { color: ASH, wd: 14, hd: 10 });
    face(c, h, r, ASH, { eyes: false });
    // The blindfold wound round her eyes, its ends trailing; a steel circlet with a star stone over it
    c.k.add("cloth", new THREE.TorusGeometry(0.1, 0.024, 6, 22), [0, 1.865, 0.03], [Math.PI / 2, 0, 0], { color: SE.band, scale: [1.02, 1.08, 0.9] });
    blob(c, "cloth", [0, 1.87, -0.08], [0.035, 0.03, 0.025], { color: SE.band, wd: 6, hd: 5 });
    c.bone("bandTail", [0, 1.87, -0.09], () => {
      for (const s of [1, -1]) c.k.add("cloth", new THREE.PlaneGeometry(0.035, 0.24, 1, 3), [s * 0.025, 1.76, -0.11], [0.15, 0, s * 0.12], { color: SE.band, surf: cloth(0.035, 0.24, true) });
    });
    c.k.add("iron", new THREE.TorusGeometry(0.102, 0.009, 4, 22), [0, 1.925, 0.025], [Math.PI / 2 - 0.12, 0, 0], { color: SE.steel });
    c.k.add("gloss", new THREE.OctahedronGeometry(0.026), [0, 1.95, 0.135], undefined, { color: SE.gem, scale: [1, 1.4, 0.6] });
    // A deep hood
    c.k.add("cloth", new THREE.SphereGeometry(1, 16, 9, Math.PI / 2 + 0.7, TAU - 1.4, 0, Math.PI * 0.68), [0, 1.87, 0.0], undefined, { color: SE.hood, scale: [0.15, 0.18, 0.165] });
    spike(c, "cloth", [0, 1.98, -0.1], [0, 0.4, -1], 0.07, 0.2, { color: SE.hood, seg: 8 });
    // Two silver locks falling from the hood
    for (const s of [1, -1]) seg(c, "matte", [s * 0.085, 1.86, 0.05], [s * 0.115, 1.62, 0.1], 0.022, 0.01, { color: "#d9d4e8", seg: 6 });
  });
}

/** The tome floating before her: covers with steel corner bosses, pages that riffle, a faint star over them */
function tome(c: BossCtx) {
  const o: V3 = [0, 1.12, 0.6];
  c.bone("tome", o, () =>
    c.k.frame(o, [0.45, 0, 0], 1, () => {
      for (const s of [1, -1]) {
        c.k.add("matte", new THREE.BoxGeometry(0.25, 0.02, 0.36), [s * 0.13, 0, 0], [0, 0, -s * 0.12], { color: SE.tome });
        c.k.add("matte", new THREE.BoxGeometry(0.2, 0.04, 0.28), [s * 0.115, 0.035, 0], [0, 0, -s * 0.12], { color: SE.page });
        for (const z of [-0.16, 0.16]) c.k.add("iron", new THREE.OctahedronGeometry(0.022), [s * 0.235, 0.0 + s * 0.0, z], [0, 0, -s * 0.12], { color: SE.steel });
      }
      seg(c, "matte", [0, -0.01, -0.18], [0, -0.01, 0.18], 0.022, 0.022, { color: SE.tome, seg: 8, cap: false });
      c.bone("page", [0, 0.06, 0], () => {
        c.k.add("cloth", new THREE.PlaneGeometry(0.19, 0.27, 2, 1), [0.105, 0.075, 0], [-Math.PI / 2, 0, -0.12], { color: SE.page });
      });
      c.k.move({ kind: MOVE.bob, axis: [0, 1, 0], amp: 0.02, speed: 1.3 }, () =>
        c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.6 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.035), [0, 0.18, 0], undefined, { color: SE.star, bright: 1.6, scale: [1, 1.3, 1] }))
      );
    })
  );
}

function seer(c: BossCtx) {
  // The star-orbs circling her, each on its own tilted path (built at the middle; the idle carries them round)
  for (let i = 0; i < SE_ORBS; i++) {
    c.bone(`orb${i}`, [0, 1.45, 0], () => {
      if (i % 2) c.k.add("glow", new THREE.OctahedronGeometry(0.05), [0, 1.45, 0], undefined, { color: "#e0e7ff", bright: 1.5, scale: [0.8, 1.3, 0.8] });
      else c.k.add("glow", new THREE.IcosahedronGeometry(0.055, 1), [0, 1.45, 0], undefined, { color: "#93c5fd", bright: 1.4 });
    });
  }
  c.k.frame([0, SE_FLOAT, 0], [0, 0, 0], 1, () =>
    c.bone("fly", [0, 1.2, 0], () => {
      c.bone("hem", [0, 1.18, 0], () => {
        c.k.add("cloth", seerRobe(), [0, 0.7, 0], undefined, { color: SE.robe, surf: cloth(1, 0.95) });
        // Steel weights at the five points, stars stitched in silver over the skirt
        for (let i = 0; i < 5; i++) {
          const th = (i * TAU - 0.3) / 5;
          c.k.add("iron", new THREE.OctahedronGeometry(0.03), [Math.sin(th) * 0.365, -0.09, Math.cos(th) * 0.365], undefined, { color: SE.steel, scale: [1, 1.7, 1] });
        }
        for (let i = 0; i < 9; i++) {
          const th = i * 2.39 + 0.5;
          const y = 0.35 + ((i * 0.37) % 0.7);
          const r = 0.24 + (0.2 * (1.175 - y)) / 0.95 + 0.006;
          c.k.add("iron", new THREE.OctahedronGeometry(0.016), [Math.sin(th) * r, y, Math.cos(th) * r], [0, th, 0], { color: SE.steel, scale: [1, 1, 0.5] });
        }
      });
      c.k.add("iron", new THREE.TorusGeometry(0.245, 0.02, 4, 22), [0, 1.18, 0], [Math.PI / 2, 0, 0], { color: SE.steel2 });
      c.k.add("iron", new THREE.OctahedronGeometry(0.03), [0, 1.18, 0.265], undefined, { color: SE.steel, scale: [1, 1.3, 0.6] });
      c.bone("chest", [0, 1.2, 0], () => {
        blob(c, "cloth", [0, 1.42, 0], [0.22, 0.27, 0.17], { color: SE.robe2, wd: 14, hd: 10 });
        // A mantle edged in steel, clasped at the throat with a star stone
        c.k.add("cloth", new THREE.CylinderGeometry(0.15, 0.35, 0.3, 22, 1, true), [0, 1.58, 0], undefined, { color: SE.mantle });
        c.k.add("iron", new THREE.TorusGeometry(0.35, 0.014, 4, 28), [0, 1.43, 0], [Math.PI / 2, 0, 0], { color: SE.steel });
        c.k.add("iron", new THREE.TorusGeometry(0.152, 0.012, 4, 20), [0, 1.73, 0], [Math.PI / 2, 0, 0], { color: SE.steel2 });
        blob(c, "iron", [0, 1.68, 0.17], [0.04, 0.04, 0.025], { color: SE.steel, wd: 8, hd: 6 });
        c.k.add("gloss", new THREE.OctahedronGeometry(0.022), [0, 1.68, 0.2], undefined, { color: SE.gem });
        for (const s of [1, -1]) seg(c, "iron", [s * 0.04, 1.68, 0.18], [s * 0.15, 1.55, 0.25], 0.006, 0.006, { color: SE.steel2, seg: 4, cap: false });
        seerArm(c, 1);
        seerArm(c, -1);
        seerHead(c);
      });
      tome(c);
    })
  );
}

function seerIdle(c: IdleCtx) {
  // She hovers and drifts, breathing; tilts her head to listen; her hands hover over the tome; the pages riffle; the orbs circle
  c.carry("fly", [0.02 * c.drift(0.3, 1) * (1 - c.busy), 0.08 * c.drift(0.18, 2) * (1 - c.busy), 0.02 * c.drift(0.25)], [0.04 * c.drift(0.2) * (1 - c.busy), 0.06 * Math.sin(c.t * 1.1 + c.seed * 5), 0.03 * c.drift(0.17, 3) * (1 - c.busy)]);
  const breath = c.sin(0.95);
  c.add("chest", [0.02 * breath, 0.04 * c.drift(0.25, 4), 0.015 * c.drift(0.3)], null, 0.012 * breath);
  c.add("hem", [0.04 * c.drift(0.55, 1) - 0.02, 0, 0.04 * c.drift(0.45)]);
  c.add("head", [0.05 * c.drift(0.35, 2), 0.25 * c.glance(1, 5.2, 0.5), 0.12 * c.drift(0.25, 1)]);
  c.add("bandTail", [0.08 * c.drift(0.6) + 0.05, 0, 0.06 * c.drift(0.5, 1)]);
  c.add("armR", [0.04 * c.drift(0.4, 3), 0, 0.03 * c.drift(0.33, 2)]);
  c.add("armL", [0.04 * c.drift(0.37, 1), 0, -0.03 * c.drift(0.3)]);
  c.add("handR", [0.08 * c.drift(0.6, 2), 0, 0.06 * c.drift(0.5)]);
  c.add("handL", [0.08 * c.drift(0.55, 4), 0, 0.06 * c.drift(0.45, 1)]);
  c.carry("tome", [0.04 * c.drift(0.5), 0.06 * c.drift(0.3, 2), 0.03 * c.drift(0.4, 1)], [0, 0.04 * Math.sin(c.t * 1.5 + 1), 0]);
  const riffle = c.event(2, 6, 1.6).e;
  c.add("page", [0, 0, 2.6 * riffle]);
  for (let i = 0; i < SE_ORBS; i++) {
    const a = c.t * (0.6 + i * 0.06) + (i * TAU) / SE_ORBS + c.seed * 2;
    const R = 0.85 + 0.08 * Math.sin(c.t * 0.5 + i) + 0.25 * c.busy;
    const tilt = 0.3 * Math.sin(i * 2.1 + 0.4);
    c.carry(`orb${i}`, [0, c.t * 0.8 + i, 0], [Math.cos(a) * R, Math.sin(a) * R * tilt + 0.15 * Math.sin(a * 2 + i) + 0.25 * c.busy, Math.sin(a) * R]);
  }
}

const orbs = (g: number): Pose => chainPose("orb", SE_ORBS, () => ({ g, s: g * 0.25 }));

const SE_DEF: BossHeroDef = {
  build: seer,
  // Head tilted as if listening, the right hand a little higher than the left: never mirrored
  rest: {
    head: { r: [0.1, -0.08, 0.1] },
    chest: { r: [0.03, 0.05, 0] },
    armR: { r: [-0.08, 0, 0.03] },
    foreR: { r: [-0.12, 0, 0] },
    armL: { r: [0.04, 0, -0.04] },
    handL: { r: [0.12, 0, 0] }
  },
  idle: seerIdle,
  roar: STILL,
  attack: {
    len: 2.8,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Her hands gather over the tome, head bowed, sinking a little
      { t: 0.24, hold: true, pose: merge({ fly: { p: [0, -0.06, 0] }, chest: { r: [0.12, 0, 0] }, head: { r: [0.25, 0, 0] }, armR: { r: [0.1, 0, -0.12] }, armL: { r: [0.1, 0, 0.12] }, foreR: { r: [-0.15, 0, 0] }, foreL: { r: [-0.15, 0, 0] }, tome: { p: [0, -0.04, -0.05] } }, orbs(0.6)) },
      // The vision: arms flung up and out, face raised, the tome rising, the orbs flaring
      {
        t: 0.44,
        pose: merge(
          { fly: { p: [0, 0.22, 0] }, hem: { r: [-0.1, 0, 0] }, chest: { r: [-0.2, 0, 0] }, head: { r: [-0.4, 0, 0] }, armR: { r: [-2.4, 0, 0.5] }, foreR: { r: [-0.2, 0, 0] }, handR: { r: [0.3, 0, 0] }, armL: { r: [-2.3, 0, -0.5] }, foreL: { r: [-0.25, 0, 0] }, handL: { r: [0.3, 0, 0] }, tome: { p: [0, 0.38, 0.05], r: [-0.3, 0, 0], g: 1 }, page: { r: [0, 0, 1.6] }, bandTail: { r: [-0.4, 0, 0] } },
          orbs(2.2)
        )
      },
      { t: 0.74, hold: true, pose: merge({ fly: { p: [0, 0.18, 0] }, chest: { r: [-0.16, 0.03, 0] }, head: { r: [-0.34, 0.05, 0] }, armR: { r: [-2.3, 0, 0.46] }, foreR: { r: [-0.25, 0, 0] }, armL: { r: [-2.2, 0, -0.48] }, foreL: { r: [-0.3, 0, 0] }, tome: { p: [0, 0.32, 0.05], r: [-0.25, 0, 0] } }, orbs(1.4)) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.44, burst: true, cine: { quake: 0.04, flash: 0.3, flashCol: "#bae6fd", lines: 0.3, vig: 0.3, vigCol: "#172554" } }]
  },
  lag: { chest: 0.03, head: 0.06, foreR: 0.05, foreL: 0.06, handR: 0.08, handL: 0.09, tome: 0.1, hem: 0.08, bandTail: 0.12 },
  springs: { hem: 80, bandTail: 40 },
  burst: { at: [0, 1.75, 0.65], color: "#7dd3fc", count: 50, speed: 1.6, spread: 0.3, size: 0.1, gravity: 0.6 },
  height: 2.6,
  frame: [5.4, 2.6, 1.35],
  sparks: (c) => {
    // A few faint star motes drifting round her
    c.spark(SPARK.mote, [0, 1.3, 0], 10, { color: "#bfdbfe", size: 0.04, speed: 0.3, rise: 0.5, reach: 0.7, spread: 0.9 });
  },
  walk: glide({ hem: "hem", swingR: 0.2, swingL: 0.2 }),
  actions: [
    { id: "idle", label: "Idle" },
    { id: "walk", label: "March" },
    { id: "attack", label: "Divine" }
  ]
};

/* ================================================================== */
/* Eclipse Reaver (epic)                                               */
/* ================================================================== */

const RV = {
  obs: "#251b36",
  obs2: "#33284a",
  trim: "#4a4458",
  leather: "#211a2b",
  cloak: "#3b0764",
  flame: "#d946ef",
  hot: "#f5d0fe",
  bone: "#e9d5ff",
  bone2: "#c4b5d9",
  eye: "#f0abfc",
  haft: "#1c1917",
  blade: "#2d2640",
  edge: "#e879f9",
  seam: "#a855f7"
};
const RV_SHARDS = 3;

/** A seam of violet light laid over a plate's surface (`dirs` round the ellipsoid, a little proud of it) */
function seam(c: BossCtx, at: V3, radii: V3, dirs: V3[]) {
  const pts = dirs.map((d) => {
    const { p, n } = onBlob(at, radii, [0, 0, 0], d);
    return add(p, n, 0.004);
  });
  for (let i = 0; i + 1 < pts.length; i++) seg(c, "glow", pts[i], pts[i + 1], 0.009, 0.009, { color: RV.seam, bright: 1.6, seg: 4 });
}

/** Violet flame licking up from `at`: a few tongues breathing out of step */
function flames(c: BossCtx, at: V3, size: number, n = 3) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.5;
    const p = add(at, [Math.cos(a) * size * 0.25, 0, Math.sin(a) * size * 0.25]);
    c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 5 + i * 1.3, phase: i * 2.1 }, () => {
      c.k.add("glow", new THREE.ConeGeometry(size * 0.3, size * (1.1 - i * 0.15), 6), add(p, [0, size * 0.5, 0]), [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15], { color: RV.flame, bright: 1.7 });
    });
  }
  c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 6.5 }, () => c.k.add("glow", new THREE.ConeGeometry(size * 0.15, size * 0.6, 5), add(at, [0, size * 0.3, 0]), undefined, { color: RV.hot, bright: 2.2 }));
}

/** His scythe in the right fist: a black grained haft through it, iron bands, a bone knob, a crescent blade with a glowing edge */
function scythe(c: BossCtx, wr: V3) {
  const d = norm([-0.04, 1, 0.1]);
  const foot = add(wr, d, -1.05);
  const top = add(wr, d, 1.3);
  seg(c, "matte", foot, top, 0.03, 0.034, { color: RV.haft, seg: 8, cap: false, surf: grainRound(0.034) });
  for (const f of [0.15, 0.62, 0.9]) c.k.add("iron", new THREE.TorusGeometry(0.036, 0.013, 5, 12), mid(foot, top, f), undefined, { color: RV.trim, quat: across(d) });
  spike(c, "iron", foot, d.map((v) => -v) as V3, 0.032, 0.14, { color: RV.trim, seg: 6 });
  blob(c, "matte", add(top, d, 0.04), [0.06, 0.065, 0.06], { color: RV.bone, wd: 9, hd: 7 });
  for (const s of [1, -1]) blob(c, "matte", add(add(top, d, 0.04), [s * 0.025, 0.0, 0.05]), [0.016, 0.02, 0.012], { color: "#120d1c", wd: 6, hd: 4 });
  // The blade: one crescent profile reaching forward and in from the top of the haft, its cutting edge underneath
  const out = norm(sub([-0.55, 0, 0.85], d.map((v) => v * (-0.55 * d[0] + 0.85 * d[2])) as V3));
  const side = norm(cross(out, d));
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...out), new THREE.Vector3(...d), new THREE.Vector3(...side)));
  const L = 0.95;
  const N = 12;
  const spine = (t: number) => 0.08 + 0.06 * t - 0.36 * t * t;
  const width = (t: number) => 0.15 * Math.pow(1 - t, 0.8) + 0.004;
  const shape = (w: (t: number) => number) => {
    const s = new THREE.Shape();
    s.moveTo(0, spine(0));
    for (let i = 1; i <= N; i++) s.lineTo(L * (i / N), spine(i / N));
    for (let i = N; i >= 0; i--) s.lineTo(L * (i / N), spine(i / N) - w(i / N));
    return s;
  };
  const slab = (s: THREE.Shape, depth: number) => new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -depth / 2);
  const at = add(top, d, -0.05);
  c.k.add("iron", slab(shape(width), 0.022), at, undefined, { color: RV.blade, quat: q });
  // The edge: a strip of violet light just under the cutting edge
  const edge = new THREE.Shape();
  edge.moveTo(0, spine(0) - width(0));
  for (let i = 1; i <= N; i++) edge.lineTo(L * (i / N), spine(i / N) - width(i / N));
  for (let i = N; i >= 0; i--) edge.lineTo(L * (i / N), spine(i / N) - width(i / N) + 0.022 * (1 - i / (N + 3)));
  c.k.add("glow", slab(edge, 0.012), add(at, [0, -0.004, 0]), undefined, { color: RV.edge, bright: 1.8, quat: q });
  // A collar where the blade meets the haft, a bone spur behind it
  blob(c, "iron", add(top, d, -0.06), [0.055, 0.075, 0.055], { color: RV.trim, wd: 10, hd: 7 });
  hook(c, "matte", add(top, d, -0.06), norm(add(out.map((v) => -v) as V3, d, 0.4)), [0, -0.15, 0], 0.025, 0.2, 3, { color: RV.bone2 });
}

function reaverArm(c: BossCtx, s: number) {
  const S = sideOf(s);
  const sh: V3 = [s * 0.5, 1.88, 0];
  const el: V3 = s > 0 ? [0.6, 1.5, 0.04] : [-0.6, 1.52, 0.1];
  const wr: V3 = s > 0 ? [0.63, 1.2, 0.24] : [-0.52, 1.27, 0.4];
  c.bone(`arm${S}`, sh, () => {
    seg(c, "matte", sh, el, 0.1, 0.09, { color: RV.leather, seg: 9 });
    c.k.add("gloss", new THREE.SphereGeometry(1, 10, 7), mid(sh, el, 0.6), undefined, { color: RV.obs, scale: [0.125, 0.14, 0.125], quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...sub(sh, el)).normalize()) });
    blob(c, "gloss", el, [0.1, 0.09, 0.1], { color: RV.obs2, wd: 9, hd: 6 });
    spike(c, "matte", add(el, [s * 0.04, 0, -0.06]), [s * 0.4, -0.1, -1], 0.03, 0.16, { color: RV.bone, seg: 6 });
    c.bone(`fore${S}`, el, () => {
      seg(c, "gloss", el, wr, 0.09, 0.075, { color: RV.obs, seg: 10 });
      seam(c, mid(el, wr), [0.092, 0.17, 0.092], [
        [s, 0.6, 0.4],
        [s, 0, 0.6],
        [s, -0.6, 0.4]
      ]);
      c.bone(`hand${S}`, wr, () => {
        if (s > 0) {
          fist(c, "gloss", wr, norm([-0.04, 1, 0.1]), s, RV.obs2, 1.2);
          scythe(c, wr);
        } else {
          // His open left hand, clawed, cupping violet flame with cinders circling it
          openHand(c, "gloss", add(wr, [0, -0.02, 0.04]), [0.15, 1, 0.1], [0.2, 0.1, 1], s, RV.obs2, 0.7, RV.bone);
          const o = add(wr, [0.0, 0.14, 0.1]);
          c.bone("flame", o, () => {
            c.k.add("glow", new THREE.IcosahedronGeometry(0.085, 1), o, undefined, { color: RV.flame, bright: 1.5 });
            flames(c, add(o, [0, 0.02, 0]), 0.22, 3);
            c.k.move({ kind: MOVE.spin, pivot: o, axis: [0.25, 1, 0.1], speed: 2.2 }, () => {
              for (let i = 0; i < 3; i++) c.k.add("glow", new THREE.OctahedronGeometry(0.02), add(o, [Math.cos((i * TAU) / 3) * 0.17, 0.02 * i, Math.sin((i * TAU) / 3) * 0.17]), undefined, { color: RV.hot, bright: 2 });
            });
          });
        }
      });
    });
  });
}

function reaverHead(c: BossCtx) {
  c.bone("head", [0, 2.02, 0.02], () => {
    seg(c, "matte", [0, 1.98, 0], [0, 2.1, 0.02], 0.09, 0.085, { color: RV.leather, seg: 8 });
    // A horned helm of obsidian, a skull's faceplate of bone with burning eyes, a crest of violet flame
    const h: V3 = [0, 2.24, 0.0];
    blob(c, "gloss", h, [0.17, 0.2, 0.19], { color: RV.obs, wd: 14, hd: 10 });
    blob(c, "matte", [0, 2.21, 0.09], [0.135, 0.15, 0.11], { color: RV.bone, wd: 14, hd: 10 });
    blob(c, "matte", [0, 2.29, 0.17], [0.12, 0.03, 0.04], { color: RV.bone2, wd: 10, hd: 5 });
    for (const s of [1, -1]) {
      blob(c, "matte", [s * 0.055, 2.24, 0.185], [0.04, 0.032, 0.025], { color: "#0c0814", wd: 8, hd: 5 });
      c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 2.3, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.02, 7, 5), [s * 0.055, 2.24, 0.205], undefined, { color: RV.eye, bright: 2.6, scale: [1.4, 0.75, 0.6] }));
      // Great horns curving back from the brow
      hook(c, "matte", [s * 0.12, 2.36, 0.02], [s * 0.75, 0.75, -0.15], [-s * 0.08, 0.06, -0.12], 0.05, 0.62, 5, { color: RV.bone });
      blob(c, "gloss", [s * 0.17, 2.21, 0.03], [0.04, 0.09, 0.08], { color: RV.obs2, wd: 8, hd: 6 });
    }
    spike(c, "matte", [0, 2.2, 0.2], [0, -0.7, 1], 0.02, 0.05, { color: RV.bone2, seg: 4 });
    for (let i = 0; i < 6; i++) c.k.add("matte", new THREE.BoxGeometry(0.016, 0.03, 0.02), [(i - 2.5) * 0.02, 2.12, 0.175 - Math.abs(i - 2.5) * 0.006], undefined, { color: RV.bone });
    seam(c, h, [0.17, 0.2, 0.19], [
      [0, 1, 0.7],
      [0, 1, -0.2],
      [0, 0.6, -1]
    ]);
    flames(c, [0, 2.4, -0.04], 0.24, 3);
  });
}

function reaver(c: BossCtx) {
  // Eclipse shards orbiting him: slivers of obsidian rimmed in violet (built at the middle; the idle carries them round)
  for (let i = 0; i < RV_SHARDS; i++) {
    c.bone(`shard${i}`, [0, 1.6, 0], () => {
      c.k.add("gloss", new THREE.OctahedronGeometry(0.07), [0, 1.6, 0], undefined, { color: "#0f0a1a", scale: [0.7, 1.8, 0.5] });
      c.k.add("glow", new THREE.OctahedronGeometry(0.035), [0.03, 1.63, 0.02], undefined, { color: RV.flame, bright: 1.8, scale: [0.8, 2.2, 0.8] });
    });
  }
  // Legs: armoured in obsidian, bone spikes on the knees, pointed sabatons; set wide, the left foot forward
  for (const s of [1, -1]) {
    const S = sideOf(s);
    const fz = s > 0 ? -0.08 : 0.14;
    const hip: V3 = [s * 0.19, 1.0, 0];
    const knee: V3 = [s * 0.24, 0.56, 0.05 + fz * 0.5];
    const ankle: V3 = [s * 0.27, 0.13, fz];
    c.bone(`thigh${S}`, hip, () => {
      seg(c, "matte", hip, knee, 0.135, 0.11, { color: RV.leather, seg: 9 });
      plate(c, "gloss", add(mid(hip, knee, 0.45), [0, 0, 0.07]), [0, 0.1, 1], sub(knee, hip), 0.11, 0.035, 0.19, { color: RV.obs });
      c.bone(`shin${S}`, knee, () => {
        blob(c, "gloss", add(knee, [0, 0.01, 0.06]), [0.085, 0.08, 0.065], { color: RV.obs2, wd: 9, hd: 6 });
        spike(c, "matte", add(knee, [0, 0.03, 0.1]), [0, 0.5, 1], 0.03, 0.14, { color: RV.bone, seg: 6 });
        seg(c, "gloss", knee, ankle, 0.095, 0.078, { color: RV.obs, seg: 10 });
        seam(c, mid(knee, ankle), [0.097, 0.2, 0.097], [
          [0, 0.7, 1],
          [0, 0, 1],
          [0, -0.7, 1]
        ]);
        blob(c, "gloss", [ankle[0], 0.075, ankle[2] + 0.08], [0.095, 0.07, 0.17], { color: RV.obs2, wd: 10, hd: 6 });
        spike(c, "gloss", [ankle[0], 0.05, ankle[2] + 0.22], [0, 0.1, 1], 0.04, 0.12, { color: RV.obs2, seg: 6 });
      });
    });
  }
  c.bone("hips", [0, 1.02, 0], () => {
    blob(c, "matte", [0, 1.04, 0], [0.3, 0.16, 0.22], { color: RV.leather, wd: 12, hd: 7 });
    c.k.add("iron", new THREE.TorusGeometry(0.3, 0.035, 5, 20), [0, 1.12, 0], [Math.PI / 2, 0, 0], { color: RV.trim, scale: [1, 0.76, 1] });
    c.k.add("glow", new THREE.OctahedronGeometry(0.04), [0, 1.12, 0.25], undefined, { color: RV.flame, bright: 1.8, scale: [1, 1.3, 0.6] });
    // A skirt of obsidian tassets, bone-tipped
    for (const a of [-1.1, -0.55, 0, 0.55, 1.1]) {
      const o: V3 = [Math.sin(a), 0.15, Math.cos(a)];
      const at: V3 = [Math.sin(a) * 0.31, 0.88, Math.cos(a) * 0.24];
      plate(c, "gloss", at, o, [0, -1, 0.08], 0.11, 0.025, 0.18, { color: a === 0 ? RV.obs2 : RV.obs });
      stud(c, "matte", add(add(at, o, 0.026), [0, -0.12, 0]), o, 0.02, 0.012, { color: RV.bone2 });
    }
    c.bone("chest", [0, 1.18, 0], () => {
      seg(c, "matte", [0, 1.12, 0], [0, 1.32, 0.01], 0.26, 0.31, { color: RV.leather, seg: 12, cap: false });
      // A breastplate broad at the chest over a waisted belly of ridged plates
      const ch: V3 = [0, 1.66, 0.01];
      const cr: V3 = [0.39, 0.3, 0.26];
      blob(c, "gloss", ch, cr, { color: RV.obs, wd: 16, hd: 10 });
      const bc: V3 = [0, 1.36, 0.02];
      const br: V3 = [0.27, 0.2, 0.2];
      blob(c, "gloss", bc, br, { color: RV.obs2, wd: 14, hd: 8 });
      for (let i = 0; i < 3; i++) {
        const { p, n } = onBlob(bc, br, [0, 0, 0], [0, -0.5 + i * 0.38, 1]);
        plate(c, "matte", add(p, n, 0.01), n, [0, 1, 0], 0.15 - i * 0.012, 0.02, 0.045, { color: RV.bone2 });
      }
      seam(c, ch, cr, [
        [-0.8, 0.7, 1],
        [-0.35, 0.15, 1],
        [0, -0.25, 1],
        [0.35, 0.15, 1],
        [0.8, 0.7, 1]
      ]);
      c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.8 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.07), add(ch, [0, 0.02, 0.27]), undefined, { color: RV.flame, bright: 2, scale: [1, 1.35, 0.55] }));
      c.k.add("iron", new THREE.TorusGeometry(0.075, 0.014, 4, 14), add(ch, [0, 0.02, 0.252]), undefined, { color: RV.trim });
      c.k.add("gloss", new THREE.CylinderGeometry(0.16, 0.2, 0.14, 14), [0, 1.98, 0], undefined, { color: RV.obs2 });
      // Great pauldrons with bone spikes and violet flame licking off them
      for (const s of [1, -1]) {
        blob(c, "gloss", [s * 0.48, 1.94, 0], [0.22, 0.15, 0.24], { color: RV.obs, wd: 12, hd: 8, rot: [0, 0, -s * 0.3] });
        plate(c, "gloss", [s * 0.56, 1.8, 0.0], [s, 0.6, 0], [0, 0, 1], 0.14, 0.035, 0.2, { color: RV.obs2 });
        seam(c, [s * 0.48, 1.94, 0], [0.22, 0.15, 0.24], [
          [s * 0.2, 0.3, 1],
          [s * 1, 0.25, 0.6],
          [s * 1, 0.2, -0.6],
          [s * 0.2, 0.3, -1]
        ]);
        hook(c, "matte", [s * 0.54, 2.04, 0.05], [s * 0.5, 1, 0.1], [-s * 0.05, 0, -0.08], 0.045, 0.34, 4, { color: RV.bone });
        hook(c, "matte", [s * 0.5, 2.02, -0.1], [s * 0.4, 1, -0.3], [-s * 0.05, 0, -0.06], 0.035, 0.24, 3, { color: RV.bone2 });
        flames(c, [s * 0.44, 2.02, -0.08], 0.16, 2);
      }
      cloak(
        c,
        "cloak",
        [
          { y: 1.96, R: 0.44, zc: 0.0 },
          { y: 1.35, R: 0.52, zc: -0.08 },
          { y: 0.75, R: 0.64, zc: -0.18 },
          { y: 0.12, R: 0.76, zc: -0.3 }
        ],
        RV.cloak,
        true
      );
      reaverArm(c, 1);
      reaverArm(c, -1);
      reaverHead(c);
    });
  });
}

function reaverIdle(c: IdleCtx) {
  // A heavy breath, the weight shifting, glances; the flame breathing in his palm; now and then he rests the blade on his
  // shoulder or turns his head to stare
  const breath = c.sin(0.9);
  const shift = c.drift(0.26);
  c.add("hips", [0.02 * c.drift(0.25, 1), 0.05 * c.drift(0.2, 2), -0.035 * shift], [0.03 * shift, 0.012 * breath, 0]);
  for (const S of ["L", "R"]) {
    c.add(`thigh${S}`, [0, 0, 0.035 * shift]);
    c.add(`shin${S}`, [0, 0, -0.035 * shift]);
  }
  c.add("chest", [0.025 * breath + 0.02 * c.drift(0.3, 2), 0.07 * c.drift(0.22, 3), 0.035 * shift], null, 0.016 * breath);
  c.add("head", [0.05 * c.drift(0.4), 0.35 * c.glance(1, 4.6, 0.25), 0.07 * c.drift(0.3, 1)]);
  c.add("armR", [0.04 * c.drift(0.45, 1), 0, 0.03 * c.drift(0.37)]);
  c.add("handR", [0.07 * c.drift(0.6, 2), 0, 0.05 * c.drift(0.5)]);
  c.add("armL", [0.05 * c.drift(0.4, 3), 0, -0.03 * c.drift(0.33, 2)]);
  c.add("handL", [0.08 * c.drift(0.55, 4), 0, 0.05 * c.drift(0.45, 1)]);
  c.add("flame", [0, c.t * 0.6, 0], [0, 0.03 * Math.sin(c.t * 2.3), 0], 0.12 * c.sin(3.1) + 0.06 * c.sin(7.3, 1), 0.3 * c.sin(2.2));
  const rest = c.event(2, 11, 3).e;
  c.add("armR", [-1.3 * rest, 0, 0.35 * rest]);
  c.add("foreR", [-1.2 * rest, 0, 0]);
  c.add("handR", [-0.5 * rest, 0, -0.3 * rest]);
  const stare = c.event(3, 8, 2).e;
  c.add("head", [0.15 * stare, 0, 0.2 * stare]);
  for (let j = 0; j < 3; j++) c.add(`cloak${j}`, [0.05 * Math.sin(c.t * 1.2 - j * 0.9) + 0.03 * c.drift(0.6, j) - 0.03 * (j + 1), 0, 0.04 * Math.sin(c.t * 0.85 - j * 0.7 + 1)]);
  for (let i = 0; i < RV_SHARDS; i++) {
    const a = c.t * (0.7 + i * 0.11) + (i * TAU) / RV_SHARDS + c.seed * 2;
    const R = 1.0 + 0.1 * Math.sin(c.t * 0.45 + i) + 0.35 * c.busy;
    const tilt = 0.4 * Math.sin(i * 2.7 + 0.8);
    c.carry(`shard${i}`, [c.t * 1.1 + i, c.t * 0.7 + i * 2, 0], [Math.cos(a) * R, Math.sin(a) * R * tilt + 0.25 * Math.sin(a * 2 + i) + 0.2 * c.busy, Math.sin(a) * R]);
  }
}

const RV_DEF: BossHeroDef = {
  build: reaver,
  // Set wide, head lowered, the scythe loose at his side, the flame hand forward: never mirrored
  rest: {
    hips: { r: [0, -0.12, 0] },
    chest: { r: [0.05, 0.14, 0.02] },
    head: { r: [0.14, -0.08, 0.05] },
    thighL: { r: [-0.06, 0, -0.04] },
    shinL: { r: [0.08, 0, 0] },
    thighR: { r: [0.04, 0, 0.04] },
    armR: { r: [-0.08, 0, 0.1] },
    foreR: { r: [-0.2, 0, 0] },
    armL: { r: [-0.3, 0, -0.12] },
    foreL: { r: [-0.3, 0, 0] },
    handL: { r: [0.15, 0, 0] }
  },
  idle: reaverIdle,
  roar: STILL,
  attack: {
    len: 3.0,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // The scythe drawn back high over his right shoulder, the flame hand drawn back, twisting away
      { t: 0.28, pose: { hips: { p: [0, -0.05, -0.1], r: [0, 0.3, 0] }, thighR: { r: [-0.15, 0, 0] }, shinR: { r: [0.28, 0, 0] }, chest: { r: [-0.12, 0.4, 0] }, head: { r: [0.1, -0.35, 0] }, armR: { r: [-2.3, 0, 0.55] }, foreR: { r: [-0.85, 0, 0] }, handR: { r: [-0.5, 0, 0] }, armL: { r: [0.35, 0, -0.35] }, foreL: { r: [-1.1, 0, 0] }, flame: { s: 0.3, g: 0.8 } } },
      { t: 0.42, hold: true, pose: { hips: { p: [0, -0.08, -0.13], r: [0, 0.36, 0] }, thighR: { r: [-0.2, 0, 0] }, shinR: { r: [0.34, 0, 0] }, chest: { r: [-0.16, 0.48, 0] }, head: { r: [0.12, -0.4, 0] }, armR: { r: [-2.45, 0, 0.6] }, foreR: { r: [-0.95, 0, 0] }, handR: { r: [-0.6, 0, 0] }, armL: { r: [0.4, 0, -0.4] }, foreL: { r: [-1.2, 0, 0] }, flame: { s: 0.45, g: 1.4 } } },
      // A step in and the reap: the blade sweeps across before him, the impact mid-swing
      {
        t: 0.54,
        pose: merge(
          { hips: { p: [0, -0.12, 0.22], r: [0, -0.25, 0] }, thighL: { r: [-0.55, 0, 0] }, shinL: { r: [0.48, 0, 0] }, thighR: { r: [0.3, 0, 0] }, shinR: { r: [0.15, 0, 0] }, chest: { r: [0.3, -0.45, 0] }, head: { r: [0.0, 0.2, 0] }, armR: { r: [-1.2, 0, -0.75] }, foreR: { r: [-0.2, 0, 0] }, handR: { r: [0.35, -1.4, -0.5] }, armL: { r: [0.2, 0, -0.3] }, foreL: { r: [-1.0, 0, 0] }, flame: { s: 0.5, g: 1.5 } },
          chainPose("cloak", 3, () => ({ r: [-0.2, 0, 0] }))
        )
      },
      // The flame thrust after it, flung into a burst
      { t: 0.68, pose: { hips: { p: [0, -0.12, 0.26], r: [0, -0.1, 0] }, thighL: { r: [-0.58, 0, 0] }, shinL: { r: [0.5, 0, 0] }, thighR: { r: [0.32, 0, 0] }, shinR: { r: [0.17, 0, 0] }, chest: { r: [0.25, -0.15, 0] }, head: { r: [0.05, 0.1, 0] }, armR: { r: [-0.7, 0, -0.95] }, foreR: { r: [-0.15, 0, 0] }, handR: { r: [0.5, -1.5, -0.6] }, armL: { r: [-1.45, 0, 0.15] }, foreL: { r: [0.0, 0, 0] }, handL: { r: [-0.4, 0, 0] }, flame: { p: [0, 0.05, 0.1], s: 0.7, g: 2.5 } } },
      { t: 0.86, hold: true, pose: { hips: { p: [0, -0.03, 0.06] }, thighL: { r: [-0.15, 0, 0] }, shinL: { r: [0.12, 0, 0] }, chest: { r: [0.08, 0, 0] }, armR: { r: [-0.25, 0, -0.15] }, armL: { r: [-0.4, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [
      { u: 0.54, cine: { quake: 0.12, stop: 0.06, flash: 0.3, flashCol: "#f5d0fe", lines: 0.6, vig: 0.3, vigCol: "#2e1065" } },
      { u: 0.68, burst: true, cine: { quake: 0.06, flash: 0.35, flashCol: "#f0abfc", lines: 0.5, vig: 0.25, vigCol: "#2e1065" } }
    ]
  },
  lag: { hips: 0.02, chest: 0.035, head: 0.07, armR: 0.04, foreR: 0.06, handR: 0.08, armL: 0.06, foreL: 0.07, handL: 0.09, flame: 0.1, ...chainLag("cloak", 3, 0.06, 0.06) },
  springs: { ...chainSprings("cloak", 3, 45) },
  burst: { at: [-0.3, 1.55, 1.25], color: "#e879f9", count: 60, speed: 2.2, spread: 0.4, size: 0.13, gravity: 1.2 },
  // Fewer embers than the legendary Archmage's
  aura: { embers: { inner: 0.45, outer: 1.3, height: 3.4, count: 30 }, color: "#a855f7", hot: "#f0abfc" },
  height: 3.1,
  frame: [6.0, 2.9, 1.5],
  sparks: (c) => {
    // Violet cinders rising off his flames and plate
    c.spark(SPARK.ember, [0, 1.6, 0], 10, { color: "#e879f9", size: 0.05, speed: 0.3, rise: 1.6, reach: 0.5, spread: 0.8 });
  },
  walk: march({ swingR: 0.3, swingL: 0.5, weight: 1.2, carry: chainPose("cloak", 3, (j) => ({ r: [-0.1 - j * 0.04, 0, 0] })) }),
  actions: [
    { id: "idle", label: "Idle" },
    { id: "walk", label: "March" },
    { id: "attack", label: "Reap" }
  ]
};

/** Voidrift's mercenaries below the legendary, by mercenary type (rigged heroes, drawn with the Archmage) */
export const VOIDRIFT_MERCS: Record<string, BossHeroDef> = {
  "merc-void-acolyte": AC_DEF,
  "merc-void-riftguard": RG_DEF,
  "merc-void-seer": SE_DEF,
  "merc-void-reaver": RV_DEF
};
