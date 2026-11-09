import * as THREE from "three";
import { MOVE, TAU, V3 } from "./heroKit";
import { SPARK, cloth } from "./heroMaterials";
import { BossCtx, BossHeroDef, IdleCtx } from "./heroRig";
import { blob, plate, seg, spike } from "./bossParts";
import { aura } from "./heroCreatures";
import { add, arm, basis, belt, blade, cape, cross, cut, face, fist, joints, legs, march, norm, pauldrons, personIdle, personLag, skirt, skull, slam, sword, tallShield, trunk, warCry } from "./heroMercKit";
import { BROOD_SIZES, vgType } from "./voidCreatures";
import { VOID, VOID_HOT, VOID_MATTE, circle, crack, crystalCrown, frameOf, orbiting, tierOf, voidActions } from "./heroVoidKit";

/* ------------------------------------------------------------------------- */
/* The Obsidian Knight's brood in high graphics (Void Gate, coming soon)      */
/* ------------------------------------------------------------------------- */

/*
 * People of the gate's order on the mercenary kit (`heroMercKit.ts`): the shared bones (hips, chest, legs, arms, head,
 * a cape in bands), so they stand, march and fight as soldiers do, never as the stone brood lumbers. A squire in plain
 * dull black plate with an open helm and a short sword, held at the ready; a man-at-arms with a violet heater shield and
 * a pennant; a knight-errant in full plate with steel trim, a longsword and a closed helm whose visor slit glows; a
 * champion caped and horned, runes lit down the plate and shards circling; the Obsidian Knight with a greatsword in both
 * hands, its edge burning, a horned crown and a long cape. One body at unit size (a tall man), grown per size.
 */

const OBS = ["#5c566e", "#555067", "#4e4860", "#474058", "#3e374f"];
const OBS2 = ["#4a4559", "#444054", "#3e394e", "#373146", "#2f293d"];
const TRIM = ["#6e687f", "#7a7390", "#a9afbb", "#b6bcc8", "#c4b5fd"];
const MAIL = "#6b6878";
const ASH = "#a69fb4";
const STEEL = "#cfd4dc";
const CAPE = ["#2a2238", "#2a2238", "#2a2238", "#3b1d5e", "#4c1d75"];
const SHIELD = "#5b2f9a";

/** The unit height (a tall man's, on `joints(1.12, 1.12)`), grown to each size's */
const UNIT = 2.3;
const SHARDS = 5;
/** The greatsword's line: up and out before him, so the left fist closes on the grip under the right */
const GRIP: V3 = norm([0.35, 0.8, 0.45]);

function knightBuild(size: number) {
  const T = tierOf(size);
  const S = BROOD_SIZES.knight.height[size] / UNIT;
  const J = joints(1.12, 1.12);
  const boss = size === 4;
  const pl = OBS[size];
  const pl2 = OBS2[size];
  const trim = TRIM[size];
  // A squire's plate is dull and unpolished; from the man-at-arms up it shines
  const metal = size === 0 ? "matte" : "iron";
  const trimB = size >= 2 ? "iron" : metal;
  return (c: BossCtx) =>
    c.k.frame([0, 0, 0], [0, 0, 0], S, () => {
      legs(c, J, { thigh: MAIL, thighBucket: "iron", boot: pl2, bootBucket: metal, plate: pl, plateBucket: metal, thick: 1.05 });
      if (T.orbit) orbiting(c, "shard", SHARDS, J.chest + 0.4, (i, at) => c.k.add("glow", new THREE.OctahedronGeometry(0.06), at, undefined, { color: i % 2 ? VOID : VOID_HOT, bright: 1.7, scale: [0.8, 1.7, 0.8] }));
      c.bone("hips", [0, J.hip, 0], () => {
        // A fauld of plates over mail, tassets on the thighs
        skirt(c, J, MAIL, J.hip + 0.12, J.hip - 0.26, 0.25, 0.3, { bucket: "iron" });
        skirt(c, J, pl, J.hip + 0.13, J.hip - 0.06, 0.26, 0.29, { bucket: metal, hem: trim, segs: 16 });
        for (const s of [1, -1]) plate(c, metal, [s * 0.24, J.hip - 0.08, 0.07], [s, 0.25, 0.3], [0, -1, 0.05], 0.13, 0.025, 0.17, { color: pl });
        belt(c, J, J.hip + 0.13, 0.27, pl2, trim, trimB);
        c.bone("chest", [0, J.chest, 0], () => {
          trunk(c, J, pl, metal, { broad: 1.1 + 0.04 * size, deep: 1.08 });
          // A ridged breastplate, its gorget, the pauldrons (horned on the champion and the Knight)
          seg(c, trimB, [0, J.chest + 0.06, 0.26], [0, J.chest + 0.6, 0.24], 0.018, 0.016, { color: trim, seg: 6 });
          c.k.add(metal, new THREE.CylinderGeometry(0.14, 0.19, 0.12, 16), [0, J.sh + 0.08, 0], undefined, { color: pl2 });
          pauldrons(c, J, pl, metal, 0.95 + 0.07 * size, size >= 2 ? trim : pl2);
          if (T.orbit)
            for (const s of [1, -1]) spike(c, "gloss", [s * (J.shX + 0.12), J.sh + 0.12, -0.02], [s * 0.5, 1, -0.2], 0.035, 0.22 + 0.06 * size, { color: OBS2[4], seg: 6 });
          if (T.orbit)
            // Runes lit down the plate
            for (const s of [1, -1]) crack(c, [[s * 0.12, J.chest + 0.55, 0.24], [s * 0.16, J.chest + 0.42, 0.26], [s * 0.11, J.chest + 0.3, 0.27], [s * 0.15, J.chest + 0.18, 0.26]], 0.012, VOID, { phase: s, amp: 0.5 });
          if (boss) c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.4 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.06), [0, J.chest + 0.4, 0.28], undefined, { color: VOID_HOT, bright: 2, scale: [1, 1.4, 0.6] }));
          if (size >= 3) cape(c, J, CAPE[size], { y1: boss ? 0.12 : 0.28, R: 0.38, flare: boss ? 1.1 : 0.85 });
          if (size === 1 || size === 2)
            // The order's pennant on a short pole at the back
            c.bone("pennant", [0.14, J.chest + 0.3, -0.26], () => {
              seg(c, "matte", [0.14, J.chest + 0.05, -0.26], [0.14, J.sh + 0.75, -0.3], 0.016, 0.014, { color: "#2a2433", seg: 6 });
              blob(c, trimB, [0.14, J.sh + 0.77, -0.3], [0.025, 0.025, 0.025], { color: trim, wd: 6, hd: 5 });
              c.k.move({ kind: MOVE.flutter, pivot: [0.14, J.sh + 0.6, -0.3], axis: [0, 0, 1], amp: 0.06, speed: 3.1 }, () =>
                c.k.add("cloth", new THREE.PlaneGeometry(0.34, 0.2, 4, 1), [0.31, J.sh + 0.6, -0.3], [0, Math.PI / 2 + 0.3, 0], { color: VOID_MATTE, surf: cloth(0.34, 0.2, true) })
              );
            });
          const armLook = { upper: pl, upperBucket: metal, fore: pl2, foreBucket: metal, cuff: size >= 2 ? trim : undefined, cuffBucket: trimB };
          if (boss) {
            // The greatsword in both hands, held before him, its edge burning
            arm(c, J, 1, { ...armLook, el: [-0.054, 0.047, 0.15], wr: [-0.328, 0.177, 0.18] }, (wr) => {
              const d = GRIP;
              fist(c, metal, wr, d, 1, pl2, 1.15);
              seg(c, "matte", add(wr, d, -0.24), add(wr, d, 0.12), 0.022, 0.022, { color: "#1c1726", seg: 6, cap: false });
              blob(c, "iron", add(wr, d, -0.27), [0.045, 0.045, 0.045], { color: trim, wd: 8, hd: 6 });
              const side = norm(cross(d, [0, 0, 1]));
              const g = add(wr, d, 0.14);
              seg(c, "iron", add(g, side, -0.2), add(g, side, 0.2), 0.024, 0.024, { color: trim, seg: 6 });
              for (const s of [1, -1]) spike(c, "iron", add(g, side, s * 0.2), add(side, d, 0.6).map((v) => v * s) as V3, 0.02, 0.08, { color: trim, seg: 5 });
              c.bone("blade", g, () => {
                blade(c, "iron", add(g, d, 0.01), d, side, 1.3, 0.13, OBS2[2]);
                const fwd = norm(cross(d, side));
                c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.6 }, () => {
                  for (const k of [1, -1]) seg(c, "glow", add(add(g, d, 0.05), side, k * 0.062), add(add(g, d, 1.08), side, k * 0.035), 0.009, 0.006, { color: VOID, bright: 1.9, seg: 4 });
                  for (let i = 0; i < 5; i++) c.k.add("glow", new THREE.BoxGeometry(0.03, 0.06, 0.02), add(add(g, d, 0.15 + i * 0.17), fwd, 0.012), undefined, { color: VOID_HOT, bright: 1.6, quat: basis(d, side) });
                });
              });
            });
            arm(c, J, -1, { ...armLook, el: [0.164, 0.027, 0.17], wr: [0.518, 0.062, 0.065] }, (wr) => fist(c, metal, wr, GRIP, -1, pl2, 1.15));
          } else {
            arm(c, J, 1, armLook, (wr) =>
              // A short sword for the squire, a longsword from the knight-errant up
              sword(c, wr, norm([0.05, 0.75, 0.66]), 1, pl2, { blade: size >= 2 ? STEEL : "#8f8c9a", guard: trim, grip: "#2a2433", metal: trimB, L: [0.55, 0.7, 0.85, 0.95][size], w: 0.075 }, metal)
            );
            arm(c, J, -1, armLook, (wr) => {
              if (size === 0) return fist(c, metal, wr, [0, 1, 0.2], -1, pl2, 1.1);
              // A heater shield strapped to the forearm: violet boards, a rim (steel from the knight-errant up)
              blob(c, metal, wr, [0.06, 0.065, 0.065], { color: pl2, wd: 8, hd: 6 });
              const n: V3 = norm([-0.3, 0, 1]);
              const o = add(wr, [-0.08, 0.06, 0.1]);
              const { up } = tallShield(c, o, n, 0.48, 0.5, 0.28, SHIELD, trim, { rimBucket: trimB });
              if (T.glow) c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.3 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.05), add(add(o, n, 0.05), up, 0.05), undefined, { color: VOID_HOT, bright: 1.8, scale: [1, 1.5, 0.4] }));
            });
          }
          c.bone("head", [0, J.neck, 0], () => {
            const h0 = skull(c, J, ASH, "matte");
            if (size <= 1) {
              // An open helm: the face of a young void-born under a round cap (a nasal on the man-at-arms)
              face(c, h0, J.hr, { skin: ASH, iris: "#4c1d95", ears: "none" });
              c.k.add(metal, new THREE.SphereGeometry(J.hr[0] * 1.2, 16, 8, 0, TAU, 0, Math.PI * 0.55), add(h0, [0, 0.02, -0.01]), undefined, { color: pl, scale: [1, 1.05, 1.08] });
              c.k.add(metal, new THREE.TorusGeometry(J.hr[0] * 1.18, 0.014, 4, 22), add(h0, [0, 0.03, -0.01]), [Math.PI / 2, 0, 0], { color: trim });
              if (size === 1) c.k.add(metal, new THREE.BoxGeometry(0.025, 0.11, 0.02), add(h0, [0, -0.01, J.hr[2] * 1.2]), undefined, { color: trim });
            } else {
              // A closed great helm, its visor slit glowing and fading
              c.k.add(metal, new THREE.SphereGeometry(J.hr[0] * 1.32, 18, 12), h0, undefined, { color: pl, scale: [1, 1.15, 1.05] });
              seg(c, trimB, add(h0, [0, 0.16, J.hr[2] * 0.9]), add(h0, [0, -0.12, J.hr[2] * 1.3]), 0.012, 0.012, { color: trim, seg: 5 });
              c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 1.5 }, () => c.k.add("glow", new THREE.BoxGeometry(0.21, 0.022, 0.04), add(h0, [0, 0.0, J.hr[2] * 1.3]), undefined, { color: VOID_HOT, bright: 1.8 }));
              c.k.add(trimB, new THREE.TorusGeometry(J.hr[0] * 1.33, 0.014, 4, 22), add(h0, [0, 0.05, 0]), [Math.PI / 2, 0, 0], { color: trim });
              if (T.orbit)
                // Horns sweeping back and up
                for (const s of [1, -1]) {
                  const r0 = add(h0, [s * J.hr[0] * 1.1, 0.06, -0.02]);
                  const r1 = add(r0, [s * 0.14, 0.08, -0.06]);
                  seg(c, "gloss", r0, r1, 0.035, 0.026, { color: OBS2[4], seg: 7 });
                  spike(c, "gloss", r1, [s * 0.25, 1, -0.3], 0.026, 0.2 + (boss ? 0.08 : 0), { color: OBS2[4], seg: 6 });
                }
              if (T.crown) crystalCrown(c, add(h0, [0, J.hr[1] * 1.05, -0.01]), J.hr[0] * 0.95, 5, 0.22);
            }
          });
        });
      });
    });
}

function knightDef(size: number): BossHeroDef {
  const T = tierOf(size);
  const S = BROOD_SIZES.knight.height[size] / UNIT;
  const boss = size === 4;
  const cine = { quake: 0.05 + size * 0.03, stop: 0.04 + size * 0.01, flash: T.glow ? 0.3 : 0.12, flashCol: T.glow ? "#ddd6fe" : "#e5e7eb", lines: T.glow ? 0.4 + size * 0.1 : 0, vig: size >= 3 ? 0.25 : 0, vigCol: "#1e1b4b" };
  const lag = personLag({ cape: size >= 3, extra: { ...(size === 1 || size === 2 ? { pennant: 0.1 } : {}), ...(boss ? { armL: 0.04, foreL: 0.055, handL: 0.075, blade: 0.03 } : {}) } });
  return {
    build: knightBuild(size),
    // A guard stance: weight back, the blade held ready (the greatsword before him), the shield up; never mirrored
    rest: boss
      ? { hips: { r: [0, -0.1, 0] }, chest: { r: [0.02, 0.12, 0.01] }, head: { r: [0.04, -0.08, 0.02] }, thighL: { r: [-0.1, 0, -0.04] }, shinL: { r: [0.12, 0, 0] }, thighR: { r: [0.05, 0, 0.04] }, armR: { r: [-0.03, 0, 0] }, armL: { r: [-0.03, 0, 0] } }
      : { hips: { r: [0, 0.12, 0.02] }, chest: { r: [0.04, -0.12, -0.01] }, head: { r: [0.05, 0.1, 0.03] }, thighL: { r: [-0.14, 0, -0.03] }, shinL: { r: [0.14, 0, 0] }, thighR: { r: [0.06, 0, 0.04] }, shinR: { r: [0.04, 0, 0] }, armR: { r: [-0.2, 0, 0.06] }, foreR: { r: [-0.35, 0, 0] }, handR: { r: [0.2, 0, 0] }, armL: { r: [-0.25, 0, -0.05] }, foreL: { r: [-0.2, 0, 0] }, handL: { r: [0.3, 0, 0] } },
    idle: personIdle({
      cape: size >= 3,
      life: [1.2, 1, 0.8, 0.7, 0.55][size],
      twoHand: boss,
      more: (c: IdleCtx) => {
        if (size === 1 || size === 2) c.add("pennant", [0.04 * c.drift(0.7), 0, 0.05 * c.drift(0.6, 1)]);
        if (T.orbit) circle(c, "shard", SHARDS, 0.9, 0.6, 0.35);
      }
    }),
    // A soldier's march: an even, planted stride, the sword arm held, the shield arm barely swinging
    walk: march(boss ? { swingR: 0, swingL: 0, cape: true, weight: 1.3, lean: 0.05 } : { swingR: 0.45, swingL: size === 0 ? 0.8 : 0.15, cape: size >= 3, weight: 1 + size * 0.05, lean: 0.06 }),
    attack: boss ? slam({ locked: true, cine, extra: { hit: { blade: { g: 1.5 } } } }) : cut({ shield: size >= 1, heavy: 1 + size * 0.08, cine }),
    roar: boss ? warCry({ arm: "both", glow: ["blade"], cine: { quake: 0.12, vig: 0.55, vigCol: "#1e1b4b", lines: 0.9, flash: 0.3, flashCol: "#ddd6fe" } }) : { len: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: {} }] },
    actions: voidActions(boss ? "Sunder" : "Strike", boss ? "Oath of the Gate" : undefined),
    ...lag,
    burst: { at: [0.05 * S, 0.25 * S, 1.1 * S], color: T.glow ? "#c4b5fd" : "#d6d3d1", count: 26 + size * 8, speed: 1.5 * S, spread: 0.4 * S, size: 0.1 * S, gravity: 5 },
    aura: T.orbit ? aura(VOID, VOID_HOT, 0.4 * S, 1.1 * S, (boss ? 2.6 : 2.0) * S) : undefined,
    height: UNIT * S,
    frame: frameOf([5.4, 2.4, 1.15], S),
    sparks: boss
      ? (c) => {
          c.spark(SPARK.ember, [0, 1.4 * S, 0.3 * S], 12, { color: VOID, size: 0.05 * S, speed: 0.3, rise: 1.4 * S, reach: 0.7 * S, spread: 0.8 * S });
          c.spark(SPARK.mote, [0, 2.0 * S, 0], 10, { color: VOID_HOT, size: 0.05 * S, speed: 0.3, rise: 0.8 * S, reach: 0.6 * S, spread: 0.8 * S });
        }
      : undefined
  };
}

/** The Obsidian Knight's brood, by size (rigged heroes, every copy in the same draws) */
export const KNIGHT_HEROES: Record<string, BossHeroDef> = Object.fromEntries([0, 1, 2, 3, 4].map((i) => [vgType("knight", i), knightDef(i)]));
