import * as THREE from "three";
import { MOVE, TAU, V3 } from "./heroKit";
import { SPARK, SURF } from "./heroMaterials";
import { BossCtx, BossHeroDef, IdleCtx } from "./heroRig";
import { blob, chainPose, chainSprings, plate, seg, spike } from "./bossParts";
import { aura, cloak } from "./heroCreatures";
import { add, arm, blade, cut, fist, invoke, joints, march, norm, openHand, pauldrons, personIdle, personLag, skirt, skull, tabard, trunk, warCry } from "./heroMercKit";
import { BROOD_SIZES, VG_WARDEN_TYPE, vgType } from "./voidCreatures";
import { WARDEN_KOI_DEF, WARDEN_KOI_TYPE } from "./heroOathbound";
import { CRIMSON, PRISM, VOID, VOID_HOT, circle, crack, crystalCrown, frameOf, orbiting, tierOf, voidActions } from "./heroVoidKit";

/* ------------------------------------------------------------------------- */
/* The Gate Sentinels and the Gate Warden in high graphics (coming soon)      */
/* ------------------------------------------------------------------------- */

/*
 * The Sentinels: suits of obsidian plate with no one inside, floating, one crimson eye in the helm, a halberd in the
 * right gauntlet and the left gauntlet open; a skirt of long plates where legs would be, on its own bone, trailing as
 * they drift. Epic at the first two levels (runes lit down the plate, shards circling), legendary at the last two
 * (crowned, the halberd's blade burning). They float rather than walk, and chop with the halberd.
 *
 * The Warden: a titan in black-crimson plate over a long robe, masked, a crown of shards turning over his head and a
 * great key-staff in his right hand, every edge of his plate breaking the light into colours (mythic). He paces, his
 * robe and mantle trailing; he strikes by turning the key in the air (the void answers), and his roar is the gate's
 * command. The Oathbound's koi circle his head as his guard (their own rig, placed by the Codex stage).
 */

const OBS = ["#6e6786", "#676080", "#605879", "#5a5173"];
const OBS2 = ["#4c4560", "#463f5a", "#413a55", "#3c3450"];
const EDGE = "#8a7da0";
const SENT_TIER = [3, 3, 4, 4];
const SENT_UNIT = 2.9;
const SHARDS = 6;

/** Carved runes glowing on a flat part `w` × `h` (the glow bucket's rune band) */
const runes = (w: number, h: number) => ({ fn: (p: THREE.Vector3): V3 => [p.x / w + 0.5, p.y / h + 0.5, SURF.runes] });

/** A glowing orb at a joint the plate floats off (the void light holding the empty suit together) */
function jointOrb(c: BossCtx, at: V3, r: number, color: string, phase = 0) {
  c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.5, phase }, () => c.k.add("glow", new THREE.SphereGeometry(r, 10, 8), at, undefined, { color, bright: 2.2 }));
}

/** The Sentinel's skirt of plates where legs would be: bands that trail as it drifts */
function plateSkirt(c: BossCtx, y0: number, y1: number, R: number, col: string, col2: string, lit: boolean) {
  c.bone("hem", [0, y0, 0], () => {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const top: V3 = [Math.sin(a) * R, y0, Math.cos(a) * R];
      const bot: V3 = [Math.sin(a) * R * 0.55, y1 + (i % 2 ? 0.12 : 0), Math.cos(a) * R * 0.55];
      plate(c, "iron", [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2], [Math.sin(a), 0.35, Math.cos(a)], norm([bot[0] - top[0], bot[1] - top[1], bot[2] - top[2]]), 0.2 * R * 1.6, 0.03, Math.hypot(bot[0] - top[0], bot[1] - top[1], bot[2] - top[2]) * 0.5, { color: i % 2 ? col : col2 });
    }
    spike(c, "iron", [0, y1 + 0.1, 0], [0, -1, 0], R * 0.35, 0.35, { color: col2, seg: 8 });
    if (lit) crack(c, [[0, y0 - 0.05, R * 0.95], [0.02, (y0 + y1) / 2, R * 0.75], [0, y1 + 0.15, R * 0.5]], 0.014, VOID, { phase: 2 });
  });
}

function sentinelBuild(size: number) {
  const T = tierOf(SENT_TIER[size]);
  const S = BROOD_SIZES.sentinel.height[size] / SENT_UNIT;
  const J = joints(1.25, 1.3);
  const col = OBS[size];
  const col2 = OBS2[size];
  const FLOAT = 0.35;
  return (c: BossCtx) =>
    c.k.frame([0, FLOAT, 0], [0, 0, 0], S, () => {
      orbiting(c, "shard", SHARDS, J.chest + 0.2, (i, at) => c.k.add("glow", new THREE.OctahedronGeometry(0.07), at, undefined, { color: i % 2 ? VOID : CRIMSON, bright: 1.7, scale: [0.8, 1.8, 0.8] }));
      c.bone("hips", [0, J.hip, 0], () => {
        plateSkirt(c, J.hip + 0.05, J.knee - 0.25, 0.32, col, col2, T.glow);
        blob(c, "iron", [0, J.hip + 0.05, 0], [0.3, 0.12, 0.25], { color: col2, wd: 14, hd: 8 });
        c.bone("chest", [0, J.chest, 0], () => {
          trunk(c, J, col, "iron", { broad: 1.2, deep: 1.1, waist: 0.19 });
          seg(c, "iron", [0, J.chest + 0.05, 0.3], [0, J.sh - 0.02, 0.28], 0.02, 0.018, { color: EDGE, seg: 6 });
          // A ring of void light at the waist, where the chest floats off the skirt
          c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.3 }, () => c.k.add("glow", new THREE.TorusGeometry(0.25 * J.w, 0.02, 5, 26), [0, J.hip + 0.13, 0], [Math.PI / 2, 0, 0], { color: CRIMSON, bright: 1.9 }));
          // Pauldrons floating a hand's breadth off the shoulders over glowing orbs, a tall spike on each
          c.k.frame([0, 0.07, 0], [0, 0, 0], 1, () => pauldrons(c, J, col, "iron", 1.35, col2));
          for (const s of [1, -1]) {
            jointOrb(c, [s * (J.shX + 0.02), J.sh + 0.0, 0], 0.07, CRIMSON, s);
            spike(c, "gloss", [s * (J.shX + 0.16), J.sh + 0.23, -0.02], [s * 0.35, 1, -0.15], 0.045, 0.34 + 0.08 * size, { color: col2, seg: 6 });
          }
          // Carved runes glowing down the breastplate, more of them as it grows
          for (const s of size >= 1 ? [1, -1] : [1]) c.k.add("glow", new THREE.PlaneGeometry(0.1, 0.42), [s * 0.13 * (size >= 1 ? 1 : 0), J.chest + 0.35, 0.305], [-0.08, 0, 0], { color: T.crown ? CRIMSON : VOID, bright: 1.8, surf: runes(0.1, 0.42) });
          // A heart of void behind a grille: the light that moves the empty plate
          c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.2 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.08), [0, J.chest + 0.62, 0.3], undefined, { color: CRIMSON, bright: 2.2, scale: [1, 1.4, 0.5] }));
          for (let i = 0; i < 4; i++) seg(c, "iron", [-0.08, J.chest + 0.55 + i * 0.045, 0.32], [0.08, J.chest + 0.55 + i * 0.045, 0.32], 0.008, 0.008, { color: col2, seg: 4 });
          // A tabard of crimson cloth, tattered, hanging front and back over the plate
          tabard(c, J, J.hip + 0.16, 0.27, 0.32, 0.95, "#5c0f24", T.crown ? "#e11d48" : "#2f293d");
          // Behind the helm a halo of blades turning slowly; on the legendary levels wings of floating blades spread behind
          c.bone("halo", [0, J.head + 0.05, -0.32], () => {
            const o: V3 = [0, J.head + 0.05, -0.32];
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2;
              const dir: V3 = [Math.cos(a), Math.sin(a), 0];
              spike(c, "gloss", add(o, dir, 0.32), dir, 0.035, 0.2 + (i % 2) * 0.1, { color: col2, seg: 4 });
            }
            c.k.add("glow", new THREE.TorusGeometry(0.31, 0.014, 4, 40), o, undefined, { color: T.crown ? CRIMSON : VOID, bright: 1.7 });
          });
          if (T.crown)
            for (const s of [1, -1])
              for (let i = 0; i < 5; i++) {
                const a = -0.1 + i * 0.32;
                const L = 0.9 + (2 - Math.abs(i - 2)) * 0.25 + 0.1 * size;
                const root: V3 = [s * 0.26, J.sh - 0.05 - i * 0.07, -0.32];
                const dir = norm([s * Math.cos(a), Math.sin(a) + 0.2, -0.3]);
                blade(c, "gloss", root, dir, [0, 0, 1], L, 0.11, col2, { t: 0.02 });
                c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.4, phase: i }, () => seg(c, "glow", add(root, dir, 0.05), add(root, dir, L * 0.9), 0.01, 0.006, { color: CRIMSON, bright: 1.9, seg: 4 }));
              }
          // Floating gauntlets: no arm between the shoulder and the hand, only the forearm's plate and the fist
          for (const s of [1, -1]) jointOrb(c, [s * (J.shX + 0.1), J.sh - 0.36, 0.06], 0.045, VOID_HOT, s + 2);
          arm(c, J, 1, { upper: col, upperBucket: "iron", fore: col2, foreBucket: "iron", thick: 1.35 }, (wr) => {
            const d: V3 = norm([0.05, 1, 0.18]);
            fist(c, "iron", wr, d, 1, col2, 1.45);
            seg(c, "matte", add(wr, d, -0.7), add(wr, d, 1.25), 0.03, 0.028, { color: "#2a2433", seg: 8, cap: false });
            const top = add(wr, d, 1.25);
            c.bone("halberd", top, () => {
              // The axe blade, the back spike, the point; its edge burning on the legendary levels
              blade(c, "iron", add(top, [0.02, -0.08, 0], 1), [1, 0, 0.05], d, 0.34, 0.5, "#9aa1ad", { shape: "axe", t: 0.025 });
              spike(c, "iron", add(top, [-0.02, -0.02, 0]), [-1, 0.2, 0], 0.03, 0.18, { color: "#9aa1ad", seg: 6 });
              spike(c, "iron", add(top, d, 0.02), d, 0.035, 0.32, { color: "#b9bfc9", seg: 6 });
              c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.7 }, () => {
                  const e: V3[] = Array.from({ length: 6 }, (_, i) => {
                    const a = -0.9 + (i / 5) * 1.8;
                    return add(add(top, [1, 0, 0.05], 0.02 + 0.34 * (0.93 + 0.1 * Math.cos(a))), d, 0.25 * Math.sin(a) - 0.08);
                  });
                  for (let i = 0; i < 5; i++) seg(c, "glow", e[i], e[i + 1], T.crown ? 0.018 : 0.011, T.crown ? 0.018 : 0.011, { color: T.crown ? VOID_HOT : CRIMSON, bright: 1.8, seg: 5 });
                });
            });
          });
          arm(c, J, -1, { upper: col, upperBucket: "iron", fore: col2, foreBucket: "iron", thick: 1.35 }, (wr) => openHand(c, "iron", wr, [0.6, 0.2, 0.3], [0.2, -0.6, 0.6], -1, col2, 0.4, 1.45));
          c.bone("head", [0, J.neck, 0], () => {
            // The helm floats over the gorget, a ring of void light between them
            c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.6 }, () => c.k.add("glow", new THREE.TorusGeometry(0.1, 0.018, 5, 20), [0, J.neck + 0.04, 0.01], [Math.PI / 2, 0, 0], { color: CRIMSON, bright: 2 }));
            const h0 = add(skull(c, J, "#0b0712", "matte", 0.6), [0, 0.06, 0]);
            // A tall closed helm with one crimson eye, a crest of plate down its crown; crowned on the legendary levels
            c.k.add("iron", new THREE.SphereGeometry(J.hr[0] * 1.35, 18, 12), h0, undefined, { color: col, scale: [1, 1.3, 1.1] });
            c.k.add("iron", new THREE.BoxGeometry(0.03, 0.3, 0.34), add(h0, [0, J.hr[1] * 0.95, -0.03]), [0.2, 0, 0], { color: col2 });
            for (const s of [1, -1]) c.k.add("iron", new THREE.BoxGeometry(0.03, 0.2, 0.26), add(h0, [s * J.hr[0] * 1.3, -0.04, 0.02]), [0, 0, s * 0.12], { color: col2 });
            spike(c, "iron", add(h0, [0, J.hr[1] * 1.2, -0.02]), [0, 1, -0.2], 0.05, 0.18, { color: col2, seg: 6 });
            c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.6 }, () => c.k.add("glow", new THREE.SphereGeometry(0.04, 10, 8), add(h0, [0, 0.02, J.hr[2] * 1.38]), undefined, { color: CRIMSON, bright: 2.6, scale: [1.6, 0.8, 0.5] }));
            if (T.crown) crystalCrown(c, add(h0, [0, J.hr[1] * 1.1, -0.01]), J.hr[0] * 1.1, 5, 0.26 + 0.04 * size, { color: CRIMSON });
          });
        });
      });
    });
}

function sentinelDef(size: number): BossHeroDef {
  const T = tierOf(SENT_TIER[size]);
  const S = BROOD_SIZES.sentinel.height[size] / SENT_UNIT;
  return {
    build: sentinelBuild(size),
    rest: { hips: { r: [0.02, 0.1, 0] }, chest: { r: [0.04, -0.1, 0.01] }, head: { r: [0.05, 0.08, 0] }, armR: { r: [-0.25, 0, 0.12] }, foreR: { r: [-0.3, 0, 0] }, armL: { r: [-0.35, 0, -0.18] }, foreL: { r: [-0.5, 0, 0] }, hem: { r: [0.04, 0, 0] } },
    idle: personIdle({
      life: 0.6,
      tabard: true,
      more: (c: IdleCtx) => {
        // The halo of blades turns slowly behind the helm
        c.carry("halo", [0, 0, (c.t * 0.35) % (Math.PI * 2) - Math.PI]);
        // It floats: a slow rise and fall, the skirt of plates trailing
        c.add("hips", null, [0, 0.06 * c.sin(0.9), 0]);
        c.add("hem", [0.05 * c.drift(0.5), 0, 0.04 * c.drift(0.45, 1)]);
        circle(c, "shard", SHARDS, 1.0, 0.55, 0.35);
      }
    }),
    walk: march({ float: true, swingR: 0.2, swingL: 0.4, lean: 0.1, len: 1.6 }),
    attack: cut({ heavy: 1.3, len: 2.6, cine: { quake: 0.12, stop: 0.07, flash: 0.35, flashCol: "#fecdd3", lines: 0.7, vig: 0.3, vigCol: "#1e1b4b" }, extra: { hit: { halberd: { g: 1.4 } } } }),
    roar: { len: 1, keys: [{ t: 0, pose: {} }, { t: 1, pose: {} }] },
    actions: voidActions("Halberd chop"),
    ...personLag({ tabard: true, extra: { hem: 0.1, halberd: 0.03 } }),
    springs: { hem: 40, tabF: 50, tabB: 45 },
    burst: { at: [0, 0.35 * S, 1.3 * S], color: "#fda4af", count: 40, speed: 1.8 * S, spread: 0.5 * S, size: 0.1 * S, gravity: 3 },
    aura: aura(T.crown ? CRIMSON : VOID, VOID_HOT, 0.5 * S, 1.3 * S, 2.6 * S),
    height: SENT_UNIT * S,
    frame: frameOf([6.8, 3.0, 1.5], S),
    sparks: T.crown
      ? (c) => {
          c.spark(SPARK.ember, [0, 1.6 * S, 0], 12, { color: CRIMSON, size: 0.05 * S, speed: 0.3, rise: 1.3 * S, reach: 0.7 * S, spread: 0.9 * S });
          c.spark(SPARK.mote, [0, 2.4 * S, 0], 8, { color: VOID_HOT, size: 0.05 * S, speed: 0.3, rise: 0.8 * S, reach: 0.6 * S, spread: 0.8 * S });
        }
      : undefined
  };
}

/* ================================================================== */
/* The Gate Warden                                                     */
/* ================================================================== */

const W_PLATE = "#3d3150";
const W_PLATE2 = "#271d35";
const W_CLOTH = "#2a1f38";
const W_CLOTH2 = "#1a1324";
const W_CRIMSON = "#be123c";
const W_GOLD = "#e3c27a";
const CROWN = 9;
/** He hovers this high over the ground, crimson smoke under his hem */
const W_HOVER = 0.35;
/** The Warden's head (its centre): the koi circle it (`VoidBroodStage`) */
export const WARDEN_HEAD_Y = 5.66 + W_HOVER;

/** The gate at his back: a ring of obsidian slabs round a disc of void, prismatic rims, spiral arms of crimson light */
function gateHalo(c: BossCtx, o: V3) {
  const R = 1.95;
  c.k.add("matte", new THREE.CircleGeometry(R * 0.86, 40), add(o, [0, 0, -0.06]), undefined, { color: "#05030a" });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    c.k.add("gloss", new THREE.BoxGeometry(0.46, 0.3, 0.22), add(o, [Math.cos(a) * R, Math.sin(a) * R, 0]), [0, 0, a + Math.PI / 2], { color: i % 2 ? W_PLATE2 : "#120c1a" });
    if (i % 4 === 0) spike(c, "gloss", add(o, [Math.cos(a) * (R + 0.15), Math.sin(a) * (R + 0.15), 0]), [Math.cos(a), Math.sin(a), 0], 0.08, 0.45, { color: "#120c1a", seg: 5 });
  }
  c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.0 }, () => {
    c.k.add("glow", new THREE.TorusGeometry(R - 0.2, 0.035, 5, 64), o, undefined, { color: W_CRIMSON, bright: 2.1 });
    c.k.add("glow", new THREE.TorusGeometry(R + 0.2, 0.018, 4, 64), add(o, [0, 0, 0.04]), undefined, { color: PRISM[1], bright: 1.8 });
    c.k.add("glow", new THREE.TorusGeometry(R - 0.32, 0.012, 4, 64), add(o, [0, 0, 0.02]), undefined, { color: PRISM[0], bright: 1.7 });
    // Four arms of light spiralling into the void at its heart
    for (let k = 0; k < 4; k++)
      for (let i = 0; i < 7; i++) {
        const r0 = 0.25 + i * 0.19;
        const r1 = 0.25 + (i + 1) * 0.19;
        const a0 = (k / 4) * TAU + i * 0.32;
        const a1 = (k / 4) * TAU + (i + 1) * 0.32;
        seg(c, "glow", add(o, [Math.cos(a0) * r0, Math.sin(a0) * r0, 0.01]), add(o, [Math.cos(a1) * r1, Math.sin(a1) * r1, 0.01]), 0.03 - i * 0.003, 0.03 - (i + 1) * 0.003, { color: i % 2 ? W_CRIMSON : PRISM[(k + i) % PRISM.length], bright: 1.8, seg: 4 });
      }
    c.k.add("glow", new THREE.SphereGeometry(0.16, 12, 10), add(o, [0, 0, 0.02]), undefined, { color: "#fecdd3", bright: 2.4, scale: [1, 1, 0.4] });
  });
}

function warden(c: BossCtx) {
  c.k.frame([0, W_HOVER, 0], [0, 0, 0], 1, () => wardenBody(c));
}

function wardenBody(c: BossCtx) {
  const J = joints(2.95, 2.7);
  // Under the robe: legs as plain as boots, so the pace reads in the hem
  for (const s of [1, -1]) {
    const S_ = s > 0 ? "R" : "L";
    const hip: V3 = [s * J.hipX, J.hip, 0];
    const knee: V3 = [s * (J.hipX + 0.04), J.knee, 0.1];
    const ankle: V3 = [s * (J.hipX + 0.06), J.ankle, 0.04];
    c.bone(`thigh${S_}`, hip, () => {
      seg(c, "cloth", hip, knee, 0.3, 0.25, { color: W_CLOTH2, seg: 10 });
      c.bone(`shin${S_}`, knee, () => {
        seg(c, "iron", knee, ankle, 0.24, 0.2, { color: W_PLATE2, seg: 10 });
        blob(c, "iron", [ankle[0], 0.17, ankle[2] + 0.18], [0.22, 0.17, 0.4], { color: W_PLATE, wd: 12, hd: 7 });
      });
    });
  }
  c.k.frame([0, WARDEN_HEAD_Y - W_HOVER + 0.8, 0], [0, 0, 0], 1, () =>
    // The crown of shards turning over his head, each its own bone the idle carries round
    orbiting(c, "crown", CROWN, 0, (i, at) => c.k.add("glow", new THREE.OctahedronGeometry(0.17), at, undefined, { color: i % 3 === 0 ? W_CRIMSON : PRISM[i % PRISM.length], bright: 2, scale: [0.7, 2.1, 0.7] }))
  );
  c.bone("hips", [0, J.hip, 0], () => {
    // The long robe to the ground, a plated skirt over it, a belt with a crimson clasp
    skirt(c, J, W_CLOTH, J.hip + 0.25, 0.12, 0.3, 0.46, { hem: W_CRIMSON, segs: 26 });
    // A hem of crimson light, prismatic seams running down the robe
    c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.2 }, () => c.k.add("glow", new THREE.TorusGeometry(0.46 * J.w, 0.03, 5, 40), [0, 0.14, 0], [Math.PI / 2, 0, 0], { color: W_CRIMSON, bright: 2.2 }));
    for (const [s, k] of [[1, 0], [-1, 1], [0.45, 2], [-0.45, 3]] as const) {
      const a = s * 0.55;
      crack(c, [0, 1, 2, 3].map((i) => { const y = J.hip - 0.75 - i * 0.55; const r = (0.37 + ((J.hip - 0.75 - y) / (J.hip - 0.75)) * 0.09) * J.w + 0.01; return [Math.sin(a) * r, y, Math.cos(a) * r] as V3; }), 0.022, PRISM[k], { phase: k, amp: 0.45 });
    }
    skirt(c, J, W_PLATE, J.hip + 0.27, J.hip - 0.75, 0.31, 0.37, { bucket: "iron", hem: W_GOLD, segs: 18 });
    c.k.add("iron", new THREE.TorusGeometry(0.31 * J.w, 0.06, 6, 26), [0, J.hip + 0.25, 0], [Math.PI / 2, 0, 0], { color: W_PLATE2 });
    c.k.add("glow", new THREE.OctahedronGeometry(0.11), [0, J.hip + 0.25, 0.31 * J.w + 0.05], undefined, { color: W_CRIMSON, bright: 2, scale: [1, 1.3, 0.5] });
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, W_PLATE, "iron", { broad: 1.15, deep: 1.1 });
      // A ridge of gold and the prismatic edge down the breastplate, the crimson heart
      seg(c, "gold", [0, J.chest + 0.2, 0.74], [0, J.sh - 0.1, 0.7], 0.05, 0.045, { color: W_GOLD, seg: 6 });
      for (const s of [1, -1]) crack(c, [[s * 0.35, J.sh - 0.15, 0.62], [s * 0.42, J.chest + 1.2, 0.68], [s * 0.3, J.chest + 0.7, 0.72], [s * 0.36, J.chest + 0.25, 0.68]], 0.025, PRISM[s > 0 ? 1 : 0], { phase: s, amp: 0.5 });
      c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.1 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.17), [0, J.chest + 1.05, 0.76], undefined, { color: W_CRIMSON, bright: 2.2, scale: [1, 1.4, 0.5] }));
      // A mantle round the shoulders, the pauldrons horned, their rims breaking the light
      c.k.add("cloth", new THREE.CylinderGeometry(0.5, 0.95, 0.5, 22, 1, true), [0, J.sh + 0.05, -0.05], undefined, { color: W_CLOTH, scale: [1.05, 1, 0.85] });
      pauldrons(c, J, W_PLATE, "iron", 2.1, W_PLATE2);
      for (const s of [1, -1]) {
        const p0: V3 = [s * (J.shX + 0.25), J.sh + 0.35, -0.05];
        seg(c, "gloss", p0, add(p0, [s * 0.3, 0.25, -0.1]), 0.09, 0.06, { color: W_PLATE2, seg: 8 });
        spike(c, "gloss", add(p0, [s * 0.3, 0.25, -0.1]), [s * 0.3, 1, -0.2], 0.06, 0.45, { color: W_PLATE2, seg: 7 });
        c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.4, phase: s }, () => c.k.add("glow", new THREE.TorusGeometry(0.42, 0.018, 4, 26, Math.PI), [s * (J.shX + 0.1), J.sh + 0.15, 0], [0, Math.PI / 2, s * 0.35], { color: PRISM[s > 0 ? 2 : 4], bright: 1.6 }));
      }
      // The gate at his back, turning slowly
      c.bone("gate", [0, J.sh + 0.25, -1.15], () => gateHalo(c, [0, J.sh + 0.25, -1.15]));
      cloak(c, "cape", [
        { y: J.sh + 0.1, R: 0.95, zc: -0.1 },
        { y: J.sh - 1.3, R: 1.1, zc: -0.25 },
        { y: J.sh - 2.6, R: 1.25, zc: -0.42 },
        { y: 0.35, R: 1.4, zc: -0.6 }
      ], W_CLOTH2, false);
      // The key-staff in his right hand: a tall shaft, a ring for its bow, a crimson gem at its heart and a key's bit below
      arm(c, J, 1, { upper: W_PLATE, upperBucket: "iron", fore: W_PLATE2, foreBucket: "iron", cuff: W_GOLD, cuffBucket: "gold", thick: 1.1 }, (wr) => {
        const d: V3 = norm([0.04, 1, 0.08]);
        fist(c, "iron", wr, d, 1, W_PLATE2, 2.6);
        seg(c, "gold", add(wr, d, -2.0), add(wr, d, 2.3), 0.06, 0.055, { color: W_GOLD, seg: 8, cap: false });
        // The bit at its foot
        for (const k of [0, 1]) c.k.add("gold", new THREE.BoxGeometry(0.28, 0.12, 0.06), add(add(wr, d, -1.75 + k * 0.2), [0.17, 0, 0]), undefined, { color: W_GOLD });
        const top = add(wr, d, 2.3);
        c.bone("staffHead", top, () => {
          c.k.add("gold", new THREE.TorusGeometry(0.42, 0.06, 8, 30), add(top, d, 0.42), [0, 0, 0], { color: W_GOLD });
          c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 1.3 }, () => {
            c.k.add("glow", new THREE.OctahedronGeometry(0.2), add(top, d, 0.42), undefined, { color: W_CRIMSON, bright: 2.4, scale: [1, 1.4, 1] });
            for (let i = 0; i < 5; i++) {
              const a = (i / 5) * TAU;
              c.k.add("glow", new THREE.OctahedronGeometry(0.05), add(add(top, d, 0.42), [Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0]), undefined, { color: PRISM[i], bright: 1.8 });
            }
          });
        });
      });
      arm(c, J, -1, { upper: W_PLATE, upperBucket: "iron", fore: W_PLATE2, foreBucket: "iron", cuff: W_GOLD, cuffBucket: "gold", thick: 1.1 }, (wr) => openHand(c, "iron", wr, [0.6, 0.2, 0.3], [0.2, -0.7, 0.6], -1, W_PLATE2, 0.45, 2.6));
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = skull(c, J, W_PLATE2, "iron");
        // A mask of plate with one crimson slit, a high collar round it
        c.k.add("iron", new THREE.SphereGeometry(J.hr[0] * 1.25, 20, 14), h0, undefined, { color: W_PLATE, scale: [1, 1.2, 1.1] });
        c.k.add("gold", new THREE.TorusGeometry(J.hr[0] * 1.26, 0.03, 5, 26), add(h0, [0, 0.12, 0]), [Math.PI / 2, 0, 0], { color: W_GOLD });
        c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.5 }, () => c.k.add("glow", new THREE.BoxGeometry(0.42, 0.045, 0.06), add(h0, [0, 0.02, J.hr[2] * 1.32]), undefined, { color: W_CRIMSON, bright: 2.4 }));
        // A third eye on the brow, a prism
        c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.1, phase: 1 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.07), add(h0, [0, 0.22, J.hr[2] * 1.2]), undefined, { color: PRISM[1], bright: 2.4, scale: [0.8, 1.5, 0.5] }));
        // Horns of the mask sweeping up past the crown
        for (const s of [1, -1]) {
          const r0 = add(h0, [s * J.hr[0] * 1.05, 0.12, -0.05]);
          const r1 = add(r0, [s * 0.22, 0.28, -0.1]);
          seg(c, "gloss", r0, r1, 0.07, 0.05, { color: "#120c1a", seg: 8 });
          spike(c, "gloss", r1, [s * 0.15, 1, -0.2], 0.05, 0.5, { color: "#120c1a", seg: 7 });
        }
        c.k.add("cloth", new THREE.CylinderGeometry(J.hr[0] * 1.6, J.hr[0] * 1.3, 0.5, 20, 1, true, Math.PI * 0.3, Math.PI * 1.4), add(h0, [0, -0.22, -0.06]), undefined, { color: W_CLOTH });
      });
    });
  });
}

const capeTrail = (k: number) => chainPose("cape", 3, (j) => ({ r: [-0.06 * k - j * 0.03 * k, 0, 0] }));

const WARDEN_DEF: BossHeroDef = {
  build: warden,
  rest: { hips: { r: [0, -0.06, 0] }, chest: { r: [0.02, 0.08, 0] }, head: { r: [0.06, -0.05, 0.02] }, armR: { r: [-0.2, 0, 0.1] }, foreR: { r: [-0.35, 0, 0] }, armL: { r: [-0.25, 0, -0.12] }, foreL: { r: [-0.55, 0, 0] }, thighL: { r: [-0.05, 0, 0] } },
  idle: personIdle({
    cape: true,
    life: 0.45,
    more: (c: IdleCtx) => {
      circle(c, "crown", CROWN, 0.62, 0.5, 0.18);
      // The gate at his back turns slowly (a whole turn is the same ring, so the wrap never shows)
      c.carry("gate", [0, 0, ((c.t * 0.12) % TAU) - Math.PI]);
      c.add("staffHead", [0.02 * c.drift(0.5, 2), 0, 0.03 * c.drift(0.4)]);
    }
  }),
  walk: march({ len: 1.9, stride: 0.6, weight: 1.6, lean: 0.04, swingR: 0, swingL: 0.35, cape: true, carry: capeTrail(1) }),
  attack: invoke({ staff: "R", glow: ["staffHead"], len: 2.8, cine: { quake: 0.14, stop: 0.06, flash: 0.45, flashCol: "#fecdd3", lines: 0.9, vig: 0.5, vigCol: "#2e0614" } }),
  roar: warCry({ arm: "R", glow: ["staffHead"], len: 3.2, cine: { quake: 0.2, vig: 0.7, vigCol: "#2e0614", lines: 1, flash: 0.4, flashCol: "#fecdd3" } }),
  actions: voidActions("Turn the key", "Command of the Gate"),
  ...personLag({ cape: true, extra: { staffHead: 0.05 } }),
  springs: { ...chainSprings("cape", 3, 35) },
  burst: { at: [0, 0.5, 2.6], color: "#fda4af", count: 70, speed: 3.2, spread: 1.2, size: 0.2, gravity: 2 },
  aura: aura(W_CRIMSON, "#fde68a", 1.2, 3.2, 7),
  height: 7.2,
  frame: [16, 7, 3.4],
  sparks: (c) => {
    // Crimson-black void smoke pooling under his hem
    c.spark(SPARK.smoke, [0, 0.15, 0], 16, { color: "#2e0614", size: 1.2, speed: 0.08, rise: 0.9, reach: 1.6, spread: 2.2 });
    c.spark(SPARK.flame, [0, 0.2, 0], 10, { color: W_CRIMSON, size: 0.18, speed: 0.2, rise: 0.8, reach: 1.4, spread: 1.6 });
    c.spark(SPARK.ember, [0, 2.5, 0], 18, { color: W_CRIMSON, size: 0.08, speed: 0.3, rise: 3.2, reach: 1.6, spread: 2.0 });
    c.spark(SPARK.mote, [0, 4.5, 0], 16, { color: PRISM[1], size: 0.08, speed: 0.3, rise: 1.4, reach: 1.4, spread: 1.6 });
    c.spark(SPARK.wisp, [0, 6.2, 0], 10, { color: PRISM[0], size: 0.1, speed: 0.15, rise: 0.8, reach: 1.2, spread: 1.0 });
  }
};

/** The Gate Sentinels by level, and the Gate Warden (rigged heroes, every copy in the same draws) */
export const GATE_HEROES: Record<string, BossHeroDef> = {
  ...Object.fromEntries([0, 1, 2, 3].map((i) => [vgType("sentinel", i), sentinelDef(i)])),
  [VG_WARDEN_TYPE]: WARDEN_DEF,
  [WARDEN_KOI_TYPE]: WARDEN_KOI_DEF
};

