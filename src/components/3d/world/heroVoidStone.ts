import * as THREE from "three";
import { V3 } from "./heroKit";
import { SPARK } from "./heroMaterials";
import { BossCtx, BossHeroDef, IdleCtx } from "./heroRig";
import { blob } from "./bossParts";
import { aura, sideOf } from "./heroCreatures";
import { march, personIdle, personLag, slam, warCry } from "./heroMercKit";
import { BROOD_SIZES, vgType } from "./voidCreatures";
import { VOID, VOID_HOT, circle, crack, crystal, crystalCrown, eye, frameOf, orbiting, rock, rockAlong, tierOf, voidActions } from "./heroVoidKit";

/* ------------------------------------------------------------------------- */
/* The Stone Giant's brood in high graphics (Void Gate, coming soon)          */
/* ------------------------------------------------------------------------- */

/*
 * One rock titan grown up the ladder: all shoulders and fists, the small head sunk low between two boulders, legs short
 * and thick, forearms bigger than the upper arms and fists that nearly drag. A person's bones (hips, chest, legs, arms,
 * head), so the march shifts its weight and the slam coils, but tuned heavy: a slow, rolling lumber with the arms
 * swinging wide, a two-fisted smash into the ground. Pebblings are plain grey rock; Rubblekin grow a violet crystal on
 * the back and stud their fists; Rockling Brutes glow through their cracks and eyes; Boulderbacks grow moss and lit
 * crystals, with stones circling them; the Stone Giant wears a crown of crystal, a burning core in its chest.
 */

const STONE = ["#b5adbf", "#aea6b9", "#a69eb1", "#9d95a9", "#938b9f"];
const STONE2 = ["#958d9f", "#8e8699", "#878092", "#7f788b", "#767083"];
const MOSS = "#56752f";
const MOSS2 = "#466226";

/** The titan's unit height (its crown of boulders), grown to each size's */
const UNIT = 1.75;
const STONES = 6;

function titanBuild(size: number) {
  const T = tierOf(size);
  const S = BROOD_SIZES.stone.height[size] / UNIT;
  const col = STONE[size];
  const col2 = STONE2[size];
  return (c: BossCtx) => {
    let n = size * 97 + 11;
    const sd = () => (n += 7);
    c.k.frame([0, 0, 0], [0, 0, 0], S, () => {
      // Short, thick legs of stacked rock, the feet broad slabs
      for (const s of [1, -1]) {
        const S_ = sideOf(s);
        const hip: V3 = [s * 0.22, 0.6, 0];
        const knee: V3 = [s * 0.25, 0.34, 0.04];
        const ankle: V3 = [s * 0.26, 0.11, 0.02];
        c.bone(`thigh${S_}`, hip, () => {
          rockAlong(c, "rock", hip, knee, 0.19, sd(), col2);
          c.bone(`shin${S_}`, knee, () => {
            rock(c, "rock", add3(knee, [0, 0, 0.05]), [0.14, 0.12, 0.13], sd(), col);
            rockAlong(c, "rock", knee, ankle, 0.17, sd(), col2);
            rock(c, "rock", [ankle[0], 0.07, ankle[2] + 0.07], [0.19, 0.08, 0.23], sd(), col);
            for (let i = 0; i < 3; i++) rock(c, "rock", [ankle[0] + (i - 1) * 0.08, 0.05, ankle[2] + 0.24], [0.05, 0.045, 0.05], sd(), col2);
          });
        });
      }
      c.bone("hips", [0, 0.6, 0], () => {
        rock(c, "rock", [0, 0.64, 0], [0.3, 0.17, 0.23], sd(), col2);
        c.bone("chest", [0, 0.72, 0], () => {
          // A boulder of a torso, the belly under it, a hump behind and two great boulders for shoulders, higher than the head
          // Broad as a cliff at the top, narrowing to the waist: the chest, two slabs of pectoral, a hump behind
          rock(c, "rock", [0, 1.1, -0.02], [0.5, 0.38, 0.36], sd(), col);
          rock(c, "rock", [0, 0.84, 0.05], [0.28, 0.2, 0.23], sd(), col2);
          rock(c, "rock", [0, 1.33, -0.17], [0.4, 0.22, 0.26], sd(), col2);
          for (const s of [1, -1]) rock(c, "rock", [s * 0.21, 1.17, 0.2], [0.24, 0.19, 0.16], sd(), s > 0 ? col : col2, [0, 0, s * 0.15]);
          // Two great boulders for shoulders, higher than the head
          for (const s of [1, -1]) rock(c, "rock", [s * 0.53, 1.36, -0.03], [0.34, 0.29, 0.32], sd(), col, [0, 0, s * 0.3]);
          // Flat plates of rock down the belly
          for (const [x, y, z, w] of [[-0.11, 0.93, 0.25, 0.12], [0.12, 0.9, 0.25, 0.11]] as const) rock(c, "rock", [x, y, z], [w, w * 0.75, 0.07], sd(), col2);
          if (T.glow) {
            // Void light through the cracks of its chest, swelling as it breathes
            crack(c, [[-0.02, 1.27, 0.3], [0.03, 1.13, 0.34], [-0.03, 1.0, 0.33], [0.04, 0.86, 0.28]], 0.017, VOID, { phase: 0 });
            crack(c, [[0.3, 1.24, 0.26], [0.2, 1.12, 0.33], [0.25, 1.0, 0.3]], 0.014, VOID, { phase: 1 });
            if (T.orbit) crack(c, [[-0.34, 1.2, 0.24], [-0.22, 1.08, 0.33], [-0.27, 0.95, 0.27]], 0.014, VOID, { phase: 2 });
          }
          if (T.crown)
            // A burning core in the chest, showing between the plates
            c.bone("core", [0, 1.05, 0.25], () => {
              c.k.add("glow", geoSphere(), [0, 1.04, 0.36], undefined, { color: VOID_HOT, bright: 2.3, scale: [0.08, 0.08, 0.05] });
              blob(c, "glow", [0, 1.04, 0.33], [0.13, 0.13, 0.06], { color: VOID, bright: 1.5, wd: 10, hd: 7 });
            });
          if (T.accent) {
            // Crystal grows from its back: a shard (lit from epic), a cluster as it grows
            crystal(c, [0.08, 1.38, -0.3], [0.25, 0.9, -0.5], 0.07, 0.34, { lit: T.orbit, pulse: 0.3 });
            if (T.glow) crystal(c, [-0.14, 1.32, -0.33], [-0.4, 0.8, -0.55], 0.05, 0.24, { lit: T.orbit, pulse: 0.3, phase: 1 });
            if (T.orbit) {
              crystal(c, [0.36, 1.55, -0.18], [0.3, 1, -0.3], 0.05, 0.26, { lit: true, pulse: 0.3, phase: 2 });
              crystal(c, [-0.4, 1.56, -0.15], [-0.25, 1, -0.25], 0.045, 0.22, { lit: true, pulse: 0.3, phase: 3 });
            }
          }
          if (T.orbit)
            // Moss on the shoulders and down the back
            for (const s of [1, -1]) {
              blob(c, "fur", [s * 0.54, 1.6, -0.05], [0.24, 0.07, 0.24], { color: s > 0 ? MOSS : MOSS2, wd: 10, hd: 5 });
              blob(c, "fur", [s * 0.18, 1.45, -0.26], [0.13, 0.05, 0.1], { color: MOSS2, wd: 8, hd: 4 });
            }
          for (const s of [1, -1]) titanArm(c, s, T, col, col2, sd);
          c.bone("head", [0, 1.3, 0.12], () => {
            // A small head, sunk low between the shoulders, under a heavy brow
            const h0: V3 = [0, 1.35, 0.2];
            rock(c, "rock", h0, [0.14, 0.12, 0.14], sd(), col);
            rock(c, "rock", [0, 1.41, 0.3], [0.13, 0.045, 0.06], sd(), col2);
            rock(c, "rock", [0, 1.27, 0.26], [0.1, 0.055, 0.09], sd(), col2);
            for (const s of [1, -1]) eye(c, [s * 0.055, 1.365, 0.325], 0.024, T.glow, VOID_HOT, s);
            if (T.crown) crystalCrown(c, [0, 1.44, 0.18], 0.12, 5, 0.22);
          });
        });
      });
      if (T.orbit)
        // Loose stones circling it
        orbiting(c, "stone", STONES, 0.9, (i, at) => rock(c, "rock", at, [0.06 + (i % 3) * 0.02, 0.05 + (i % 2) * 0.02, 0.06], 500 + i, i % 2 ? col : col2));
    });
  };
}

function titanArm(c: BossCtx, s: number, T: ReturnType<typeof tierOf>, col: string, col2: string, sd: () => number) {
  const S_ = sideOf(s);
  const sh: V3 = [s * 0.62, 1.3, 0];
  const el: V3 = [s * 0.78, 0.94, 0.05];
  const wr: V3 = [s * 0.83, 0.56, 0.18];
  c.bone(`arm${S_}`, sh, () => {
    rockAlong(c, "rock", sh, el, 0.2, sd(), col2);
    c.bone(`fore${S_}`, el, () => {
      // The forearm far bigger than the upper arm, plated in rock
      rock(c, "rock", el, [0.16, 0.15, 0.16], sd(), col);
      rockAlong(c, "rock", el, wr, 0.28, sd(), col);
      rock(c, "rock", [s * 0.88, 0.76, 0.14], [0.13, 0.17, 0.15], sd(), col2);
      c.bone(`hand${S_}`, wr, () => {
        // A fist like a boulder, knuckles of stone along its front
        const f: V3 = [s * 0.85, 0.36, 0.22];
        rock(c, "rock", f, [0.3, 0.27, 0.3], sd(), col);
        for (let i = 0; i < 4; i++) rock(c, "rock", [f[0] + s * (i - 1.5) * 0.11, f[1] - 0.15, f[2] + 0.18], [0.075, 0.065, 0.08], sd(), col2);
        rock(c, "rock", [f[0] - s * 0.22, f[1] + 0.03, f[2] + 0.1], [0.08, 0.1, 0.09], sd(), col2);
        if (T.accent)
          // Pebbles studding the fist (gleaming violet from rare)
          for (let i = 0; i < 3; i++) rock(c, T.glow ? "gloss" : "rock", [f[0] + s * (0.15 - i * 0.13), f[1] + 0.21, f[2] + 0.08 - i * 0.06], [0.045, 0.04, 0.045], sd(), T.glow ? "#8b5cf6" : col2);
      });
    });
  });
}

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
let sphere: THREE.SphereGeometry | null = null;
const geoSphere = () => (sphere ??= new THREE.SphereGeometry(1, 10, 8));

function titanDef(size: number): BossHeroDef {
  const T = tierOf(size);
  const S = BROOD_SIZES.stone.height[size] / UNIT;
  const boss = size === 4;
  const lag = personLag({ extra: boss ? { core: 0.04 } : {} });
  return {
    build: titanBuild(size),
    // Hunched over its fists, the head pushed forward and up, the weight on one leg: never mirrored
    rest: {
      hips: { r: [0.05, 0.06, 0] },
      chest: { r: [0.24, -0.05, 0.02] },
      head: { r: [-0.22, 0.08, 0] },
      thighL: { r: [-0.12, 0, -0.06] },
      shinL: { r: [0.18, 0, 0] },
      thighR: { r: [0.04, 0, 0.05] },
      shinR: { r: [0.08, 0, 0] },
      armR: { r: [0.06, 0, 0.1] },
      foreR: { r: [-0.18, 0, 0] },
      armL: { r: [-0.06, 0, -0.12] },
      foreL: { r: [-0.3, 0, 0] }
    },
    idle: personIdle({
      life: 0.55,
      more: (c: IdleCtx) => {
        // A deep, slow breath that heaves the shoulders, the fists grinding now and then
        const heave = c.sin(0.75);
        c.add("chest", [0.035 * heave, 0, 0], [0, 0.01 * heave, 0]);
        const grind = c.event(7, 8, 1.6);
        c.add(grind.k > 0.5 ? "handR" : "handL", [0.25 * grind.e, 0.3 * grind.e, 0]);
        if (T.orbit) circle(c, "stone", STONES, 1.15, 0.45, 0.45);
        if (boss) c.add("core", null, null, 0.06 * heave, 0.4 + 0.3 * heave);
      }
    }),
    // A slow, rolling lumber: short strides, the weight thrown from foot to foot, the arms swinging wide
    walk: march({ len: 1.5 + size * 0.12, stride: 0.6, weight: 2.4, lean: 0.12, swingR: 1.5, swingL: 1.4 }),
    attack: slam({
      len: 2.6 + size * 0.1,
      cine: { quake: 0.08 + size * 0.04, stop: 0.05 + size * 0.01, flash: T.glow ? 0.25 : 0.08, flashCol: T.glow ? "#ddd6fe" : "#e7e5e4", lines: T.glow ? 0.5 + size * 0.1 : 0, vig: boss ? 0.35 : 0, vigCol: "#1e1b4b" }
    }),
    roar: boss ? warCry({ arm: "both", glow: ["core"], cine: { quake: 0.16, vig: 0.55, vigCol: "#1e1b4b", lines: 0.9, flash: 0.3, flashCol: "#ddd6fe" } }) : { len: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: {} }] },
    actions: voidActions("Ground smash", boss ? "Mountain's roar" : undefined),
    ...lag,
    burst: { at: [0, 0.1 * S, 0.85 * S], color: T.glow ? "#a78bfa" : "#a8a29e", count: 24 + size * 10, speed: 1.4 * S, spread: 0.5 * S, size: 0.1 * S, gravity: 5 },
    aura: T.orbit ? aura(VOID, VOID_HOT, 0.5 * S, 1.4 * S, (boss ? 2.4 : 1.6) * S) : undefined,
    height: UNIT * S,
    frame: frameOf([4.6, 2.1, 0.85], S),
    sparks: boss
      ? (c) => {
          c.spark(SPARK.smoke, [0, 0.15 * S, 0], 10, { color: "#57534e", size: 0.9 * S, speed: 0.08, rise: 0.6 * S, reach: 1.2 * S, spread: 1.6 * S });
          c.spark(SPARK.ember, [0, 1.1 * S, 0], 12, { color: VOID, size: 0.05 * S, speed: 0.3, rise: 1.4 * S, reach: 0.9 * S, spread: 1.0 * S });
          c.spark(SPARK.mote, [0, 1.5 * S, 0], 10, { color: VOID_HOT, size: 0.05 * S, speed: 0.3, rise: 0.6 * S, reach: 0.8 * S, spread: 0.8 * S });
        }
      : undefined
  };
}

/** The Stone Giant's brood, by size (rigged heroes, every copy in the same draws) */
export const STONE_HEROES: Record<string, BossHeroDef> = Object.fromEntries([0, 1, 2, 3, 4].map((i) => [vgType("stone", i), titanDef(i)]));
