import * as THREE from "three";
import { MOVE, TAU, V3 } from "./heroKit";
import { SPARK, cloth } from "./heroMaterials";
import { BossAction, BossCtx, BossHeroDef, IdleCtx } from "./heroRig";
import { blob, chainBones, chainLag, chainPose, chainSprings, hook, merge, seg, spike } from "./bossParts";
import { aura, cloak, sideOf } from "./heroCreatures";
import { march, personIdle, personLag, warCry } from "./heroMercKit";
import { BROOD_SIZES, vgType } from "./voidCreatures";
import { VOID, VOID_HOT, VOID_MATTE, circle, crack, crystalCrown, frameOf, orbiting, tierOf, voidActions } from "./heroVoidKit";

/* ------------------------------------------------------------------------- */
/* The Hollow Wraith's brood in high graphics (Void Gate, coming soon)        */
/* ------------------------------------------------------------------------- */

/*
 * One shroud of pale void smoke grown up the ladder: a hood over a dark face with two eyes, a body that tapers into a
 * trailing tail of smoke (a chain of bones that lags and whips), sleeves that grow hands, and a ragged hem on its own
 * bone. The wisp is all hood and tail with stubs for arms; the shade wisp ragged, a violet sash knotted round it and a
 * cracked bell hanging from it; the wraithling has bony hands, eyes and a heart-light that pulse, an old chain trailing;
 * the void wraith is tall with runes lit along its hem and souls circling it; the Hollow Wraith towers, crowned with
 * shards, its claws long and its chest hollow, the void burning behind its ribs. It floats (a person's bones that never
 * touch the ground), reaches to grasp a soul, and the boss wails.
 */

/** The shroud: deep void-grey, its tattered edges pale as smoke */
const SHROUD = ["#5d5476", "#51486b", "#463c5f", "#3a3053", "#2d2445"];
const MIST = ["#d6cdee", "#cbc0e8", "#bfb2e2", "#b2a3da", "#a493d1"];
const FACE = "#07050c";
const BONE = "#e8e1d4";

const UNIT = 2.0;
const TAIL = 3;
const SOULS = 4;
const FLOAT = 0.3;

/** The shroud's bands, shoulders to the trailing tip: half-width R, centre depth zc */
const VEIL = (k: number) => [
  { y: 1.44, R: 0.25 * k, zc: 0.02 },
  { y: 1.05, R: 0.34 * k, zc: -0.02 },
  { y: 0.58, R: 0.42 * k, zc: -0.1 },
  { y: 0.02, R: 0.3 * k, zc: -0.32 }
];

function wraithBuild(size: number) {
  const T = tierOf(size);
  const S = BROOD_SIZES.wraith.height[size] / UNIT;
  const sh = SHROUD[size];
  const mist = MIST[size];
  // A wisp is all hood and tail; arms grow with it, the shroud widens
  const armK = [0.4, 0.7, 1, 1.1, 1.25][size];
  const wide = [0.85, 0.92, 1, 1.06, 1.12][size];
  return (c: BossCtx) =>
    c.k.frame([0, FLOAT, 0], [0, 0, 0], S, () => {
      if (T.orbit)
        orbiting(c, "soul", SOULS, 1.2, (i, at) => {
          // A soul: a little wisp of light (a lantern of souls on the boss)
          if (T.crown) {
            seg(c, "iron", [at[0], at[1] + 0.12, at[2]], [at[0], at[1] - 0.1, at[2]], 0.05, 0.06, { color: "#3b3350", seg: 6 });
            c.k.add("glow", new THREE.SphereGeometry(0.05, 8, 6), at, undefined, { color: i % 2 ? VOID_HOT : "#a5f3fc", bright: 2.2 });
          } else c.k.add("glow", new THREE.SphereGeometry(0.045, 8, 6), at, undefined, { color: i % 2 ? VOID_HOT : "#a5f3fc", bright: 2, scale: [1, 1.5, 1] });
        });
      c.bone("hips", [0, 0.9, 0], () => {
        // A dark core under the shroud, so no gap shows between its folds
        blob(c, "matte", [0, 0.95, -0.02], [0.2 * wide, 0.4, 0.17], { color: FACE, wd: 12, hd: 8 });
        // The shroud: tattered bands down the back and round the front (each its own bone, so it trails and ripples)
        cloak(c, "veil", VEIL(wide), sh, true, 1.65, 11);
        c.k.frame([0, 0, 0], [0, Math.PI, 0], 1, () => cloak(c, "front", VEIL(wide * 0.92).map((r, j) => ({ ...r, zc: j === 3 ? -0.05 : r.zc * 0.4, y: j === 3 ? 0.18 : r.y })), sh, true, 1.5, 9));
        // Ribbons of smoke trailing from it, lagging and whipping
        chainBones(c, "tail", [0, 0.4, -0.18], [0.24, 0.22, 0.2], [1.25, 1.05, 0.75], [0.02, 0.02, 0.015, 0.01], { bucket: "cloth", color: sh, seg: 4, yaw: [Math.PI, Math.PI, Math.PI] }, (j, from, to) => {
          for (const s of [1, -1]) c.k.along("cloth", [from[0] + s * 0.06, from[1], from[2]], [to[0] + s * 0.04 * (1 - j * 0.3), to[1], to[2]], [0.09 - j * 0.02, 0.006], { color: j % 2 ? mist : sh, surf: cloth(0.1, 0.24, true) });
        });
        if (T.accent) {
          // A violet sash knotted round it, a little cracked bell hanging from it
          c.k.add("cloth", new THREE.TorusGeometry(0.3 * wide, 0.035, 5, 20), [0, 0.86, 0.03], [Math.PI / 2 + 0.12, 0, 0], { color: VOID_MATTE });
          c.bone("bell", [0.18, 0.84, 0.24], () => {
            seg(c, "matte", [0.18, 0.84, 0.24], [0.19, 0.74, 0.26], 0.006, 0.006, { color: "#3b3350", seg: 4 });
            c.k.add("iron", new THREE.CylinderGeometry(0.025, 0.05, 0.07, 10, 1, true), [0.19, 0.7, 0.26], undefined, { color: "#8a7f6a" });
          });
        }
        if (T.glow && !T.crown)
          // An old chain trailing from the waist
          c.bone("chain", [-0.2, 0.82, -0.12], () => {
            for (let i = 0; i < 7; i++) c.k.add("iron", new THREE.TorusGeometry(0.035, 0.009, 4, 10), [-0.22 - i * 0.03, 0.76 - i * 0.075, -0.16 - i * 0.04], [0, i % 2 ? Math.PI / 2 : 0, 0.4], { color: "#6b6573" });
          });
        if (T.orbit)
          // Runes lit down the shroud's front
          crack(c, [[0.04, 1.32, 0.27], [-0.03, 1.15, 0.31], [0.03, 0.98, 0.33], [-0.02, 0.8, 0.33], [0.03, 0.62, 0.3]], 0.012, VOID, { amp: 0.5 });
        c.bone("chest", [0, 1.0, 0], () => {
          // Hunched shoulders under the shroud, a mantle of tatters over them
          blob(c, "cloth", [0, 1.5, -0.03], [0.3 * wide, 0.12, 0.22], { color: sh, wd: 14, hd: 6 });
          for (let i = 0; i < 9; i++) {
            const a = ((i - 4) / 4) * 1.9;
            const len = 0.22 + (i % 3) * 0.06;
            c.k.add("cloth", new THREE.PlaneGeometry(0.12, len, 1, 2), [Math.sin(a) * 0.3 * wide, 1.48 - len / 2, Math.cos(a) * 0.2 - 0.02], [0.2, a, 0], { color: i % 2 ? mist : sh, surf: cloth(0.12, len, true) });
          }
          if (T.glow) {
            // A heart-light, pulsing (on the boss a hollow chest, the void burning behind its ribs)
            c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 1.4 }, () => blob(c, "glow", [0, 1.28, 0.2], [0.06, 0.07, 0.04], { color: VOID_HOT, bright: 2.2, wd: 8, hd: 6 }));
            if (T.crown) {
              blob(c, "glow", [0, 1.28, 0.17], [0.15, 0.19, 0.06], { color: VOID, bright: 1.3, wd: 10, hd: 8 });
              for (let i = 0; i < 4; i++) for (const s of [1, -1]) hook(c, "matte", [0, 1.42 - i * 0.07, 0.23], [s, -0.1, -0.1], [0, -0.05, -0.1], 0.012, 0.17, 3, { color: BONE });
            }
          }
          for (const s of [1, -1]) wraithArm(c, s, armK, size, sh, mist);
          c.bone("head", [0, 1.55, 0.04], () => {
            // A deep, peaked hood with a pale rim, the face a hollow of void (lit from within from the wraithling up)
            c.k.add("cloth", new THREE.SphereGeometry(0.22, 16, 12, 0, TAU, 0, Math.PI * 0.64), [0, 1.67, 0.0], [-0.3, 0, 0], { color: sh, scale: [1, 1.3, 1.1] });
            c.k.add("cloth", new THREE.ConeGeometry(0.12, 0.34, 10), [0, 1.93, -0.14], [-0.95, 0, 0], { color: sh, scale: [1, 1, 0.6] });
            c.k.add("cloth", new THREE.TorusGeometry(0.17, 0.022, 5, 18, Math.PI * 1.25), [0, 1.66, 0.18], [0, 0, -Math.PI * 0.125 + Math.PI], { color: mist, scale: [1, 1.2, 1] });
            blob(c, "matte", [0, 1.63, 0.1], [0.14, 0.16, 0.1], { color: FACE, wd: 12, hd: 8 });
            if (T.glow) c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 0.9 }, () => blob(c, "glow", [0, 1.62, 0.12], [0.09, 0.1, 0.05], { color: "#4c1d95", bright: 1.2, wd: 10, hd: 7 }));
            for (const s of [1, -1]) {
              if (T.glow) c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.8, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.026, 8, 6), [s * 0.05, 1.66, 0.19], undefined, { color: VOID_HOT, bright: 2.6, scale: [1.1, 1.5, 0.6] }));
              else blob(c, "gloss", [s * 0.05, 1.66, 0.185], [0.024, 0.032, 0.012], { color: "#3a2d52", wd: 8, hd: 5 });
            }
            if (T.crown) crystalCrown(c, [0, 1.86, 0.02], 0.16, 5, 0.3);
          });
        });
      });
    });
}

function wraithArm(c: BossCtx, s: number, k: number, size: number, sh: string, mist: string) {
  const S_ = sideOf(s);
  const shd: V3 = [s * 0.26, 1.48, 0];
  const el: V3 = [s * (0.3 + 0.04 * k), 1.48 - 0.3 * k, 0.06];
  const wr: V3 = [s * (0.32 + 0.05 * k), 1.48 - 0.58 * k, 0.16];
  c.bone(`arm${S_}`, shd, () => {
    seg(c, "cloth", shd, el, 0.08, 0.075, { color: sh, seg: 9 });
    c.bone(`fore${S_}`, el, () => {
      // A long bell sleeve, tatters hanging from its cuff
      c.k.along("cloth", el, wr, 0, { geo: new THREE.CylinderGeometry(0.12 + 0.03 * k, 0.07, 1, 12, 1, true), color: sh });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        c.k.along("cloth", [wr[0] + Math.cos(a) * 0.1 * k, wr[1] + 0.02, wr[2] + Math.sin(a) * 0.1 * k], [wr[0] + Math.cos(a) * 0.12 * k, wr[1] - 0.2 - (i % 2) * 0.08, wr[2] + Math.sin(a) * 0.12 * k - 0.05], [0.07, 0.006], { color: i % 2 ? mist : sh, surf: cloth(0.07, 0.24, true) });
      }
      c.bone(`hand${S_}`, wr, () => {
        if (size < 2) return blob(c, "cloth", wr, [0.05, 0.06, 0.05], { color: "#2a2238", wd: 8, hd: 6 });
        // Bony hands, the fingers long and hooked (claws on the boss)
        blob(c, "matte", wr, [0.035, 0.045, 0.04], { color: BONE, wd: 8, hd: 6 });
        for (let i = 0; i < 4; i++) hook(c, "matte", [wr[0] + s * (i - 1.5) * 0.018, wr[1] - 0.03, wr[2] + 0.02], [0, -1, 0.35], [0, 0, 0.14], 0.008, size >= 4 ? 0.24 : 0.13, 3, { color: BONE });
        if (size >= 4) for (let i = 0; i < 4; i++) spike(c, "gloss", [wr[0] + s * (i - 1.5) * 0.018, wr[1] - 0.24, wr[2] + 0.11], [0, -0.7, 0.7], 0.008, 0.09, { color: VOID, seg: 4 });
      });
    });
  });
}

/** The grasp: drawn back, then both hands thrown forward to seize, the body surging after them, the tail lashing */
function grasp(size: number): BossAction {
  return {
    len: 2.3,
    idle: 0.35,
    keys: [
      { t: 0, pose: {} },
      { t: 0.32, pose: merge({ hips: { p: [0, 0.05, -0.12], r: [-0.12, 0, 0] }, chest: { r: [-0.2, 0, 0] }, head: { r: [-0.1, 0, 0] }, armR: { r: [0.2, 0, 0.5] }, armL: { r: [0.2, 0, -0.5] }, foreR: { r: [-0.6, 0, 0] }, foreL: { r: [-0.6, 0, 0] }, veil0: { r: [0.2, 0, 0] } }, chainPose("tail", TAIL, () => ({ r: [-0.2, 0, 0] }))) },
      { t: 0.46, hold: true, pose: merge({ hips: { p: [0, 0.08, -0.16], r: [-0.16, 0, 0] }, chest: { r: [-0.26, 0, 0] }, head: { r: [-0.14, 0, 0] }, armR: { r: [0.3, 0, 0.6] }, armL: { r: [0.3, 0, -0.6] }, foreR: { r: [-0.7, 0, 0] }, foreL: { r: [-0.7, 0, 0] }, veil0: { r: [0.25, 0, 0] } }, chainPose("tail", TAIL, () => ({ r: [-0.25, 0, 0] }))) },
      { t: 0.56, pose: merge({ hips: { p: [0, -0.04, 0.4], r: [0.25, 0, 0] }, chest: { r: [0.25, 0, 0] }, head: { r: [0.1, 0, 0] }, armR: { r: [-1.45, 0, 0.12] }, armL: { r: [-1.45, 0, -0.12] }, foreR: { r: [-0.05, 0, 0] }, foreL: { r: [-0.05, 0, 0] }, handR: { r: [0.4, 0, 0] }, handL: { r: [0.4, 0, 0] }, veil0: { r: [-0.35, 0, 0] }, veil1: { r: [-0.2, 0, 0] }, front0: { r: [0.3, 0, 0] } }, chainPose("tail", TAIL, (j) => ({ r: [0.3 + j * 0.1, 0, 0] }))) },
      { t: 0.68, pose: merge({ hips: { p: [0, -0.04, 0.42], r: [0.28, 0.1, 0] }, chest: { r: [0.3, 0.1, 0] }, armR: { r: [-1.3, 0, 0.05] }, armL: { r: [-1.3, 0, -0.05] }, foreR: { r: [-0.5, 0, 0] }, foreL: { r: [-0.5, 0, 0] }, handR: { r: [0.9, 0, 0] }, handL: { r: [0.9, 0, 0] } }, chainPose("tail", TAIL, (j) => ({ r: [0.2, 0.2 * (j + 1), 0] }))) },
      { t: 0.86, hold: true, pose: { hips: { p: [0, 0, 0.1] }, chest: { r: [0.06, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: { quake: 0.04 + size * 0.02, stop: 0.04, flash: size >= 2 ? 0.3 : 0.1, flashCol: "#ddd6fe", lines: size >= 2 ? 0.4 + size * 0.1 : 0, vig: 0.2 + size * 0.06, vigCol: "#1e1b4b" } }]
  };
}

function wraithDef(size: number): BossHeroDef {
  const T = tierOf(size);
  const S = BROOD_SIZES.wraith.height[size] / UNIT;
  const boss = size === 4;
  return {
    build: wraithBuild(size),
    // Hunched over, the head thrust forward, the claws held out before it: never mirrored
    rest: { hips: { r: [0.12, 0.06, 0.02] }, chest: { r: [0.28, -0.05, 0] }, head: { r: [-0.12, 0.1, 0.04] }, armR: { r: [-0.6, 0, 0.32] }, foreR: { r: [-0.45, 0, 0] }, handR: { r: [0.3, 0, 0] }, armL: { r: [-0.4, 0, -0.42] }, foreL: { r: [-0.6, 0, 0] }, handL: { r: [0.4, 0, 0.1] }, tail0: { r: [0.05, 0.1, 0] } },
    idle: personIdle({
      life: 0.7,
      more: (c: IdleCtx) => {
        // It drifts: a slow rise and fall, the hem and the tail trailing, the hands reaching now and then
        c.add("hips", [0, 0, 0.04 * c.drift(0.4)], [0.04 * c.drift(0.3, 1), 0.07 * c.sin(1.1), 0]);
        // The shroud ripples, each band a beat behind the last
        for (let j = 0; j < 3; j++) {
          c.add(`veil${j}`, [0.07 * Math.sin(c.t * 1.3 - j * 0.9) + 0.03 * c.drift(0.6, j), 0, 0.05 * Math.sin(c.t * 0.9 - j * 0.7 + 1)]);
          c.add(`front${j}`, [0.05 * Math.sin(c.t * 1.1 - j * 0.8 + 2), 0, 0.04 * Math.sin(c.t * 0.8 - j * 0.6)]);
        }
        for (let j = 0; j < TAIL; j++) c.add(`tail${j}`, [0.12 * Math.sin(c.t * 1.2 - j * 0.7), 0.18 * Math.sin(c.t * 0.9 - j * 0.6 + 1), 0]);
        const reach = c.event(8, 9, 1.6);
        c.add(reach.k > 0.5 ? "armR" : "armL", [-0.6 * reach.e, 0, 0]);
        if (T.accent) c.add("bell", [0.2 * Math.sin(c.t * 2.1), 0, 0.15 * Math.sin(c.t * 1.7)]);
        if (T.glow && !T.crown) c.add("chain", [0.06 * c.drift(0.8), 0, 0.08 * c.drift(0.7, 1)]);
        if (T.orbit) circle(c, "soul", SOULS, 0.75, 0.5, 0.45);
      }
    }),
    walk: march({ float: true, swingR: 0.35, swingL: 0.35, lean: 0.15, len: 2.2 }),
    attack: grasp(size),
    roar: boss ? warCry({ arm: "both", cine: { quake: 0.1, vig: 0.65, vigCol: "#0f0a1e", lines: 0.9, flash: 0.3, flashCol: "#ddd6fe" } }) : { len: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: {} }] },
    actions: voidActions("Soul grasp", boss ? "Wail" : undefined),
    ...personLag({ extra: { bell: 0.12, chain: 0.1, ...chainLag("tail", TAIL, 0.08, 0.08), ...chainLag("veil", 3, 0.06, 0.05), ...chainLag("front", 3, 0.05, 0.04) } }),
    springs: { bell: 40, chain: 30, ...chainSprings("tail", TAIL, 30), ...chainSprings("veil", 3, 32), ...chainSprings("front", 3, 38) },
    burst: { at: [0, 1.2 * S, 0.8 * S], color: "#c4b5fd", count: 24 + size * 8, speed: 1.2 * S, spread: 0.4 * S, size: 0.09 * S, gravity: -0.5 },
    aura: T.orbit ? aura(VOID, VOID_HOT, 0.4 * S, 1.1 * S, 2.2 * S) : undefined,
    height: (UNIT + FLOAT) * S,
    frame: frameOf([4.6, 2.0, 1.1], S),
    sparks: (c) => {
      // It dissolves into smoke below the hem at every size, dark smoke curling up round it; cold wisps from the wraithling up
      c.spark(SPARK.smoke, [0, 0.35 * S, -0.1 * S], 10 + size * 3, { color: "#2a2238", size: 0.7 * S, speed: 0.1, rise: 1.2 * S, reach: 0.45 * S, spread: 0.6 * S });
      c.spark(SPARK.smoke, [0, 0.2 * S, -0.2 * S], 6 + size * 2, { color: "#8f82b8", size: 0.5 * S, speed: 0.08, rise: 0.6 * S, reach: 0.5 * S, spread: 0.5 * S });
      if (T.glow) c.spark(SPARK.wisp, [0, 1.2 * S, 0], 6 + size * 3, { color: size >= 4 ? "#a5f3fc" : "#c4b5fd", size: 0.05 * S, speed: 0.14, rise: 0.8 * S, reach: 0.9 * S, spread: 0.9 * S });
    }
  };
}

/** The Hollow Wraith's brood, by size (rigged heroes, every copy in the same draws) */
export const WRAITH_HEROES: Record<string, BossHeroDef> = Object.fromEntries([0, 1, 2, 3, 4].map((i) => [vgType("wraith", i), wraithDef(i)]));
