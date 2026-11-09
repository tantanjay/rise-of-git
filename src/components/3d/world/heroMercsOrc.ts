import * as THREE from "three";
import { MOVE, TAU, V3 } from "./heroKit";
import { SPARK, cloth } from "./heroMaterials";
import { BossCtx, BossHeroDef } from "./heroRig";
import { blob, plate, seg, spike, stud } from "./bossParts";
import { aura } from "./heroCreatures";
import {
  Joints,
  add,
  arm,
  belt,
  blade,
  cape,
  cut,
  face,
  fist,
  invoke,
  joints,
  legs,
  march,
  mercDef,
  norm,
  orbit,
  orbiters,
  pauldrons,
  personIdle,
  roundShield,
  shaft,
  skirt,
  skull,
  slam,
  tabard,
  trunk,
  warCry,
  whirl
} from "./heroMercKit";

/* ------------------------------------------------------------------------- */
/* Drak'mar's mercenaries in high graphics, common → legendary                 */
/* ------------------------------------------------------------------------- */

/*
 * Big, hunched folk on the mercenary kit (`heroMercKit.ts`) with tusks and ragged ears, each on its rung: the Raider in
 * hides with a club, the Brute's one accent (blood-red war paint) and his skull totem, the Shaman's iron rings and the
 * blood wisps looping round him, the Ravager's burning scars and circling embers, the Warlord of the Hero Monument in
 * dark stone and gold with bone horns, his great axe and a blood-red cape.
 */

const SKIN = "#6b8e23";
const SKIN2 = "#556b2f";
const BONE = "#efe4cc";
const RED = "#b91c1c";
const BLOOD = "#ef4444";
const HIDE = "#8a6a3d";
const HIDE2 = "#6e5230";
const IRON = "#8a8f98";

/** An orc: broad, long-armed, a little stooped */
const orcJoints = (h = 1.1, w = 1.3) => joints(h, w, 0.95, 1.3);

/** An orc's head: a heavy brow, tusks up from the jaw, ragged ears, a topknot of black hair */
function orcHead(c: BossCtx, J: Joints, o: { iris?: string; eyes?: boolean; topknot?: boolean } = {}) {
  const h0 = skull(c, J, SKIN, "matte", 1.35);
  // A jaw that juts
  blob(c, "matte", add(h0, [0, -J.hr[1] * 0.5, J.hr[2] * 0.35]), [J.hr[0] * 0.85, J.hr[1] * 0.42, J.hr[2] * 0.7], { color: SKIN2, wd: 12, hd: 8 });
  face(c, h0, J.hr, { skin: SKIN, ears: "orc", tusks: BONE, brow: 1.8, nose: 1.3, iris: o.iris ?? "#7f1d1d", eyes: o.eyes });
  if (o.topknot !== false) {
    c.k.add("fur", new THREE.SphereGeometry(J.hr[0] * 1.02, 12, 6, 0, TAU, 0, Math.PI * 0.35), add(h0, [0, 0.02, -0.02]), undefined, { color: "#1c1917" });
    c.bone("topknot", add(h0, [0, J.hr[1] * 0.95, -0.04]), () => seg(c, "fur", add(h0, [0, J.hr[1] * 0.95, -0.04]), add(h0, [0, J.hr[1] * 0.6, -0.32]), 0.04, 0.012, { color: "#1c1917", seg: 6 }));
  }
  return h0;
}

/** A hide loincloth and its belt of rope */
function loincloth(c: BossCtx, J: Joints, color: string, belt0: string) {
  tabard(c, J, J.hip + 0.08, 0.2, 0.3, 0.42, color);
  c.k.add("matte", new THREE.TorusGeometry(0.27 * J.w, 0.03, 5, 22), [0, J.hip + 0.08, 0], [Math.PI / 2, 0, 0], { color: belt0, scale: [1, 0.8, 1] });
}

/* ================================================================== */
/* Grunt Raider (common)                                               */
/* ================================================================== */

const GR = { hide: HIDE, hide2: HIDE2, club: "#5c4030", club2: "#4a3226", strap: "#3f2a1a", fur: "#7c5a3a" };

function raider(c: BossCtx) {
  const J = orcJoints();
  legs(c, J, { thigh: SKIN2, thighBucket: "matte", boot: GR.strap, bare: SKIN, wraps: GR.hide2, thick: 1.1 });
  c.bone("hips", [0, J.hip, 0], () => {
    loincloth(c, J, GR.hide, GR.strap);
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, SKIN, "matte", { broad: 1.12, belly: 0.7, deep: 1.1 });
      // A hide mantle over one shoulder, a strap across the chest
      c.k.add("fur", new THREE.SphereGeometry(0.2, 12, 8), [0.3, J.sh + 0.03, 0], undefined, { color: GR.fur, scale: [1.2, 0.6, 1.1] });
      c.k.along("matte", [0.3, J.sh, 0.14], [-0.2, J.chest + 0.05, 0.22], [0.05, 0.015], { color: GR.strap });
      arm(c, J, 1, { upper: SKIN, upperBucket: "matte", fore: SKIN, foreBucket: "matte", thick: 1.3 }, (wr) => {
        // A crude club: a knotted branch, thicker at the end
        const d: V3 = norm([0, 0.6, 0.8]);
        fist(c, "matte", wr, d, 1, SKIN, 1.35);
        seg(c, "matte", add(wr, d, -0.12), add(wr, d, 0.75), 0.03, 0.08, { color: GR.club, seg: 8 });
        for (let i = 0; i < 3; i++) blob(c, "matte", add(add(wr, d, 0.45 + i * 0.12), [i % 2 ? 0.05 : -0.05, 0, 0]), [0.045, 0.04, 0.045], { color: GR.club2, wd: 8, hd: 6 });
      });
      arm(c, J, -1, { upper: SKIN, upperBucket: "matte", fore: SKIN, foreBucket: "matte", thick: 1.3 }, (wr) => fist(c, "matte", wr, [0, 1, 0.2], -1, SKIN, 1.35));
      c.bone("head", [0, J.neck, 0], () => orcHead(c, J));
    });
  });
}

const GR_DEF = mercDef({
  build: raider,
  // Stooped, the club hanging ready, the free fist clenched: never mirrored
  rest: {
    hips: { r: [0.06, 0.1, 0] },
    chest: { r: [0.22, -0.1, 0.03] },
    head: { r: [-0.2, 0.1, 0] },
    thighL: { r: [-0.15, 0, -0.04] },
    shinL: { r: [0.2, 0, 0] },
    thighR: { r: [0.05, 0, 0.05] },
    shinR: { r: [0.1, 0, 0] },
    armR: { r: [0.05, 0, 0.12] },
    foreR: { r: [-0.25, 0, 0] },
    armL: { r: [-0.1, 0, -0.15] },
    foreL: { r: [-0.3, 0, 0] }
  },
  idle: personIdle({ tabard: true, life: 1.3 }),
  walk: march({ swingR: 0.6, swingL: 0.7, lean: 0.12, weight: 1.3 }),
  attack: cut({ heavy: 1.3, cine: { quake: 0.06, stop: 0.04, flash: 0.08, flashCol: "#e7e5e4" } }),
  attackLabel: "Club",
  trail: { tabard: true, extra: { topknot: 0.1 } },
  burst: { at: [0.05, 0.25, 1.1], color: "#a8a29e", count: 30, speed: 1.4, spread: 0.4, size: 0.12, gravity: 5 },
  height: 2.6,
  frame: [5.4, 2.5, 1.3]
});
GR_DEF.springs = { ...GR_DEF.springs, topknot: 50 };

/* ================================================================== */
/* Bonewall Brute (uncommon)                                           */
/* ================================================================== */

const BB = { hide: "#7c4a2d", hide2: "#5a3520", strap: "#3f2a1a", shield: "#a1784a", haft: "#5c4030" };

function brute(c: BossCtx) {
  const J = orcJoints(1.1, 1.35);
  legs(c, J, { thigh: BB.hide2, thighBucket: "matte", boot: BB.strap, wraps: BB.hide, thick: 1.15 });
  c.bone("hips", [0, J.hip, 0], () => {
    loincloth(c, J, BB.hide, BB.strap);
    c.bone("chest", [0, J.chest, 0], () => {
      const t = trunk(c, J, SKIN, "matte", { broad: 1.15, belly: 0.8, deep: 1.1 });
      // Red war paint: a hand's three stripes down his chest
      for (let i = 0; i < 3; i++) c.k.add("cloth", new THREE.BoxGeometry(0.035, 0.22, 0.01), [(i - 1) * 0.07, J.chest + 0.35, t.front + 0.02], [0, 0, (i - 1) * 0.12], { color: RED });
      pauldrons(c, J, BB.hide, "matte", 1.0, BB.hide2);
      // The skull totem on a pole at his back
      c.bone("totem", [0.16, J.chest + 0.3, -0.26], () => {
        seg(c, "matte", [0.16, J.chest, -0.27], [0.18, J.sh + 0.7, -0.33], 0.02, 0.018, { color: BB.haft, seg: 6 });
        const sk: V3 = [0.18, J.sh + 0.78, -0.33];
        blob(c, "matte", sk, [0.09, 0.085, 0.095], { color: BONE, wd: 12, hd: 8 });
        blob(c, "matte", add(sk, [0, -0.06, 0.04]), [0.06, 0.04, 0.06], { color: BONE, wd: 10, hd: 6 });
        for (const s of [1, -1]) blob(c, "matte", add(sk, [s * 0.035, 0.0, 0.08]), [0.025, 0.025, 0.015], { color: "#1c1917", wd: 6, hd: 4 });
        for (const s of [1, -1]) spike(c, "matte", add(sk, [s * 0.07, 0.04, 0]), [s, 0.8, -0.2], 0.022, 0.12, { color: BONE, seg: 5 });
        c.k.add("cloth", new THREE.TorusGeometry(0.022, 0.008, 4, 10), add(sk, [0, -0.11, 0]), [Math.PI / 2, 0, 0], { color: RED });
      });
      arm(c, J, 1, { upper: SKIN, upperBucket: "matte", fore: SKIN, foreBucket: "matte", thick: 1.35 }, (wr) => {
        // A bone-headed mace
        const d: V3 = norm([0.05, 0.75, 0.66]);
        fist(c, "matte", wr, d, 1, SKIN, 1.35);
        shaft(c, wr, d, 0.12, 0.55, 0.026, BB.haft);
        const top = add(wr, d, 0.6);
        blob(c, "matte", top, [0.11, 0.1, 0.11], { color: BONE, wd: 12, hd: 8 });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          spike(c, "matte", add(top, [Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08]), [Math.cos(a), 0.3, Math.sin(a)], 0.025, 0.08, { color: BONE, seg: 5 });
        }
      });
      arm(c, J, -1, { upper: SKIN, upperBucket: "matte", fore: SKIN, foreBucket: "matte", thick: 1.35 }, (wr) => {
        blob(c, "matte", wr, [0.07, 0.075, 0.075], { color: SKIN, wd: 8, hd: 6 });
        // The shield of lashed bones: a hide face, long bones bound across it, a red-painted rim
        const n: V3 = norm([-0.25, 0, 1]);
        const o = add(wr, [-0.07, 0.04, 0.13]);
        roundShield(c, o, n, 0.4, BB.shield, RED, BONE, { rimBucket: "matte" });
        const up: V3 = [0, 1, 0];
        const side = norm([n[2], 0, -n[0]]);
        for (const k of [-0.18, 0, 0.18]) seg(c, "matte", add(add(add(o, n, 0.045), side, k), up, -0.32), add(add(add(o, n, 0.045), side, k), up, 0.32), 0.024, 0.024, { color: BONE, seg: 6 });
      });
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = orcHead(c, J);
        // Red war paint across his eyes
        c.k.add("cloth", new THREE.BoxGeometry(J.hr[0] * 1.7, 0.035, 0.01), add(h0, [0, J.hr[1] * 0.12, J.hr[2] * 1.02]), undefined, { color: RED });
      });
    });
  });
}

const BB_DEF = mercDef({
  build: brute,
  rest: {
    hips: { r: [0.04, 0.1, 0.02] },
    chest: { r: [0.15, -0.1, -0.01] },
    head: { r: [-0.12, 0.08, 0.03] },
    thighL: { r: [-0.12, 0, 0] },
    shinL: { r: [0.14, 0, 0] },
    armR: { r: [-0.15, 0, 0.1] },
    foreR: { r: [-0.25, 0, 0] },
    handR: { r: [0.15, 0, 0] },
    armL: { r: [-0.25, 0, -0.04] },
    foreL: { r: [-0.25, 0, 0] },
    handL: { r: [0.3, 0, 0] }
  },
  idle: personIdle({ tabard: true, more: (c) => c.add("totem", [0.04 * c.drift(0.7), 0, 0.05 * c.drift(0.6, 1)]) }),
  walk: march({ swingL: 0.15, swingR: 0.5, lean: 0.1, weight: 1.4 }),
  attack: cut({ shield: true, heavy: 1.2, cine: { quake: 0.08, stop: 0.05, flash: 0.14, flashCol: "#fecaca", vig: 0.12, vigCol: "#7f1d1d" } }),
  attackLabel: "Bash",
  trail: { tabard: true, extra: { totem: 0.1, topknot: 0.1 } },
  burst: { at: [0.05, 0.25, 1.1], color: "#d6d3d1", count: 32, speed: 1.5, spread: 0.4, size: 0.12, gravity: 5 },
  height: 2.7,
  frame: [5.4, 2.6, 1.3]
});
BB_DEF.springs = { ...BB_DEF.springs, totem: 40, topknot: 50 };

/* ================================================================== */
/* Blood Shaman (rare)                                                 */
/* ================================================================== */

const BL = { robe: "#57534e", robe2: "#44403c", skirt: "#7f1d1d", drum: "#a1784a", haft: "#4a2a16", ring: "#a3a8b0" };
const BL_WISPS = 5;

function shaman(c: BossCtx) {
  const J = orcJoints(1.1, 1.25);
  legs(c, J, { thigh: BL.robe2, boot: "#3f2a1a", bare: SKIN, wraps: BL.skirt, thick: 1.05 });
  orbiters(c, "wisp", BL_WISPS, J.chest + 0.4, (i, at) => {
    c.k.add("glow", new THREE.IcosahedronGeometry(0.045, 1), at, undefined, { color: i % 2 ? "#fca5a5" : BLOOD, bright: 1.5, scale: [0.8, 1.5, 0.8] });
  });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, BL.skirt, J.hip + 0.12, J.hip - 0.42, 0.26, 0.36, { hem: BL.robe2 });
    belt(c, J, J.hip + 0.12, 0.27, "#3f2a1a", BL.ring);
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, BL.robe, "cloth", { broad: 1.05 });
      // Iron rings strung on a cord round his neck, a bone fetish among them
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.25 + (i / 4) * 0.5);
        c.k.add("iron", new THREE.TorusGeometry(0.035, 0.009, 4, 12), [Math.cos(a) * 0.2, J.sh - 0.06 - Math.sin(a) * 0.04, Math.sin(a) * 0.17], [0.3, 0, 0], { color: BL.ring });
      }
      pauldrons(c, J, BONE, "matte", 0.7);
      arm(c, J, 1, { upper: BL.robe, fore: SKIN, foreBucket: "matte", cuff: BL.ring, cuffBucket: "iron", thick: 1.2 }, (wr) => {
        // The totem staff: a dark haft, the spirit drum lashed below a bone crown, iron rings
        const d: V3 = norm([0, 1, 0.05]);
        fist(c, "matte", wr, d, 1, SKIN, 1.25);
        shaft(c, wr, d, 1.05, 1.3, 0.024, BL.haft);
        const dr = add(wr, d, 1.05);
        c.bone("drum", dr, () => {
          c.k.add("matte", new THREE.CylinderGeometry(0.17, 0.17, 0.12, 20), dr, [Math.PI / 2, 0, 0], { color: BL.drum });
          for (const z of [-0.065, 0.065]) c.k.add("iron", new THREE.TorusGeometry(0.17, 0.012, 4, 20), add(dr, [0, 0, z]), undefined, { color: BL.ring });
          c.k.add("matte", new THREE.CylinderGeometry(0.15, 0.15, 0.005, 20), add(dr, [0, 0, 0.065]), [Math.PI / 2, 0, 0], { color: "#d6c3a0" });
          blob(c, "glow", add(dr, [0, 0, 0.07]), [0.04, 0.04, 0.01], { color: BLOOD, bright: 1.4, wd: 8, hd: 4 });
        });
        const top = add(wr, d, 1.3);
        blob(c, "matte", top, [0.07, 0.065, 0.075], { color: BONE, wd: 10, hd: 8 });
        for (let i = 0; i < 4; i++) spike(c, "matte", add(top, [0, 0.03, 0]), [Math.cos(i * 1.57) * 0.6, 1, Math.sin(i * 1.57) * 0.6], 0.016, 0.14, { color: BONE, seg: 5 });
      });
      arm(c, J, -1, { upper: BL.robe, fore: SKIN, foreBucket: "matte", cuff: BL.ring, cuffBucket: "iron", thick: 1.2 }, (wr) => {
        fist(c, "matte", wr, [0, 1, 0.3], -1, SKIN, 1.25);
        c.k.move({ kind: MOVE.pulse, amp: 0.5, speed: 2.6 }, () => c.k.add("glow", new THREE.IcosahedronGeometry(0.06, 1), add(wr, [0, 0.08, 0.06]), undefined, { color: BLOOD, bright: 1.6 }));
      });
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = orcHead(c, J, { eyes: false, topknot: false });
        // The bone mask over his face, dark eye holes, a crest of black feathers
        c.k.add("matte", new THREE.SphereGeometry(J.hr[0] * 1.15, 16, 10, -Math.PI / 2 + 0.5, Math.PI - 1.0, 0.3, Math.PI * 0.6), add(h0, [0, -0.01, 0.025]), undefined, { color: BONE, scale: [1, 1.1, 1.05] });
        for (const s of [1, -1]) blob(c, "matte", add(h0, [s * J.hr[0] * 0.36, J.hr[1] * 0.12, J.hr[2] * 1.18]), [0.03, 0.022, 0.01], { color: "#1c1917", wd: 8, hd: 4 });
        c.k.add("cloth", new THREE.BoxGeometry(0.02, J.hr[1] * 0.9, 0.01), add(h0, [0, -J.hr[1] * 0.1, J.hr[2] * 1.2]), undefined, { color: RED });
        for (let i = 0; i < 5; i++) spike(c, "fur", add(h0, [0, J.hr[1] * 0.9, -0.04 + i * 0.0]), norm([(i - 2) * 0.35, 1, -0.4]), 0.02, 0.22, { color: "#1c1917", seg: 5 });
      });
    });
  });
}

const BL_DEF = mercDef({
  build: shaman,
  rest: {
    hips: { r: [0.03, -0.06, 0] },
    chest: { r: [0.12, 0.08, 0.02] },
    head: { r: [-0.05, -0.12, 0.04] },
    armR: { r: [-0.12, 0, 0.08] },
    foreR: { r: [-0.25, 0, 0] },
    armL: { r: [-0.45, 0, -0.1] },
    foreL: { r: [-0.6, 0, 0] }
  },
  idle: personIdle({ more: (c) => orbit(c, "wisp", BL_WISPS, 0.85, 0.8, 0.4) }),
  walk: march({ swingR: 0.2, swingL: 0.5, lean: 0.08 }),
  attack: invoke({ staff: "R", glow: ["drum"], cine: { quake: 0.05, flash: 0.25, flashCol: "#fecaca", vig: 0.2, vigCol: "#7f1d1d" } }),
  attackLabel: "Blood frenzy",
  trail: { extra: { drum: 0.08 } },
  burst: { at: [0, 1.5, 1.0], color: "#ef4444", count: 40, speed: 1.5, spread: 0.4, size: 0.1, gravity: 0.5 },
  height: 2.9,
  frame: [5.6, 2.7, 1.35],
  sparks: (c) => c.spark(SPARK.wisp, [0, 1.5, 0], 8, { color: "#fca5a5", size: 0.06, speed: 0.2, rise: 0.4, reach: 0.6, spread: 0.3 })
});

/* ================================================================== */
/* Ravager Berserker (epic)                                            */
/* ================================================================== */

const RV = { hide: "#3f2a1a", plate: "#44403c", plate2: "#57534e", cleaver: "#78716c", cleaver2: "#57534e", haft: "#3f2a1a" };
const RV_EMBERS = 7;

function cleaver(c: BossCtx, wr: V3, d: V3, s: number) {
  fist(c, "matte", wr, d, s, SKIN, 1.45);
  seg(c, "matte", add(wr, d, -0.14), add(wr, d, 0.12), 0.026, 0.026, { color: RV.haft, seg: 6, cap: false });
  const side = norm([s, 0, 0.2]);
  blade(c, "iron", add(wr, d, 0.12), d, side, 0.62, 0.26, RV.cleaver, { shape: "cleaver", t: 0.02 });
  c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 2.4, phase: s }, () => blade(c, "glow", add(add(wr, d, 0.14), side, 0.11), d, side, 0.58, 0.04, BLOOD, { shape: "sword", t: 0.024, bright: 1.6 }));
}

function ravager(c: BossCtx) {
  const J = orcJoints(1.2, 1.5);
  legs(c, J, { thigh: RV.hide, thighBucket: "matte", boot: "#292524", plate: RV.plate, plateBucket: "iron", thick: 1.2 });
  orbiters(c, "ember", RV_EMBERS, J.chest + 0.3, (i, at) => {
    c.k.add("glow", new THREE.OctahedronGeometry(0.05), at, undefined, { color: i % 2 ? "#fca5a5" : BLOOD, bright: 1.8, scale: [0.9, 1.5, 0.9] });
  });
  c.bone("hips", [0, J.hip, 0], () => {
    loincloth(c, J, RV.hide, RV.plate);
    c.bone("chest", [0, J.chest, 0], () => {
      const t = trunk(c, J, SKIN, "matte", { broad: 1.2, belly: 0.6, deep: 1.15 });
      // Scars glowing like coals across his chest
      c.k.move({ kind: MOVE.pulse, amp: 0.5, speed: 1.9 }, () => {
        for (let i = 0; i < 3; i++) c.k.add("glow", new THREE.BoxGeometry(0.03, 0.26, 0.01), [(i - 1) * 0.1, J.chest + 0.3 + (i % 2) * 0.05, t.front + 0.02], [0, 0, 0.5], { color: BLOOD, bright: 1.6 });
      });
      pauldrons(c, J, RV.plate, "iron", 1.25, RV.plate2);
      for (const s of [1, -1]) {
        spike(c, "matte", [s * (J.shX + 0.08), J.sh + 0.1, 0], [s * 0.6, 1, -0.1], 0.04, 0.3, { color: BONE, seg: 6 });
        spike(c, "matte", [s * (J.shX + 0.15), J.sh + 0.02, -0.06], [s, 0.6, -0.2], 0.035, 0.22, { color: BONE, seg: 6 });
      }
      arm(c, J, 1, { upper: SKIN, upperBucket: "matte", fore: SKIN, foreBucket: "matte", cuff: RV.plate, cuffBucket: "iron", thick: 1.45 }, (wr) => cleaver(c, wr, norm([0.2, 0.3, 0.95]), 1));
      arm(c, J, -1, { upper: SKIN, upperBucket: "matte", fore: SKIN, foreBucket: "matte", cuff: RV.plate, cuffBucket: "iron", thick: 1.45 }, (wr) => cleaver(c, wr, norm([-0.2, 0.3, 0.95]), -1));
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = orcHead(c, J, { eyes: false });
        // Eyes burning under the brow, bone horns lashed to his skull
        for (const s of [1, -1]) c.k.add("glow", new THREE.SphereGeometry(0.02, 8, 5), add(h0, [s * J.hr[0] * 0.36, J.hr[1] * 0.1, J.hr[2] * 0.95]), undefined, { color: BLOOD, bright: 2.4, scale: [1.3, 0.7, 0.6] });
        for (const s of [1, -1]) spike(c, "matte", add(h0, [s * J.hr[0] * 0.7, J.hr[1] * 0.6, -0.02]), [s * 0.8, 1, -0.3], 0.035, 0.28, { color: BONE, seg: 6 });
      });
    });
  });
}

const RV_DEF = mercDef({
  build: ravager,
  rest: {
    hips: { p: [0, -0.05, 0], r: [0.08, -0.12, 0] },
    chest: { r: [0.25, 0.14, 0.02] },
    head: { r: [-0.2, -0.08, 0.05] },
    thighL: { r: [-0.25, 0, -0.06] },
    shinL: { r: [0.3, 0, 0] },
    thighR: { r: [0.1, 0, 0.06] },
    shinR: { r: [0.2, 0, 0] },
    armR: { r: [-0.2, 0, 0.25] },
    foreR: { r: [-0.4, 0, 0] },
    armL: { r: [-0.3, 0, -0.25] },
    foreL: { r: [-0.45, 0, 0] }
  },
  idle: personIdle({ tabard: true, life: 1.4, more: (c) => orbit(c, "ember", RV_EMBERS, 1.1, 0.9) }),
  walk: march({ swingR: 0.6, swingL: 0.6, lean: 0.14, weight: 1.5 }),
  attack: whirl({ cine: { quake: 0.1, stop: 0.06, flash: 0.3, flashCol: "#fecaca", lines: 0.7, vig: 0.3, vigCol: "#7f1d1d" } }),
  attackLabel: "Whirlwind",
  trail: { tabard: true, extra: { topknot: 0.1 } },
  burst: { at: [0, 1.0, 0], color: "#ef4444", count: 60, speed: 2.4, spread: 0.6, size: 0.12, gravity: 2 },
  aura: { embers: { inner: 0.45, outer: 1.3, height: 3.4, count: 30 }, color: "#a855f7", hot: "#fca5a5" },
  height: 3.0,
  frame: [6.0, 2.9, 1.45],
  sparks: (c) => c.spark(SPARK.ember, [0, 1.6, 0], 10, { color: "#ef4444", size: 0.05, speed: 0.3, rise: 1.6, reach: 0.5, spread: 0.8 })
});
RV_DEF.springs = { ...RV_DEF.springs, topknot: 50 };

/* ================================================================== */
/* Warlord of Drak'mar (legendary)                                     */
/* ================================================================== */

const WL = { stone: "#44403c", stone2: "#292524", gold: "#d4a017", gold2: "#a87a10", pale: "#fde68a", cape: "#991b1b", cape2: "#7f1d1d", axe: "#a8a29e", hot: "#fecaca" };
const WL_EMBERS = 8;

function warlord(c: BossCtx) {
  const J = orcJoints(1.3, 1.45);
  legs(c, J, { thigh: WL.stone2, thighBucket: "matte", boot: WL.gold2, bootBucket: "gold", plate: WL.gold, plateBucket: "gold", thick: 1.2 });
  orbiters(c, "ember", WL_EMBERS, J.chest + 0.5, (i, at) => {
    c.k.add("glow", new THREE.OctahedronGeometry(0.06), at, undefined, { color: i % 2 ? WL.hot : BLOOD, bright: 2, scale: [0.9, 1.6, 0.9] });
  });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, WL.stone, J.hip + 0.14, J.hip - 0.4, 0.28, 0.38, { bucket: "gloss", hem: WL.gold });
    // Gold plates hanging over the war skirt, each with a bone stud
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      const p: V3 = [Math.sin(a) * 0.4 * J.w * 0.95, J.hip - 0.12, Math.cos(a) * 0.33];
      plate(c, "gold", p, [Math.sin(a), 0.15, Math.cos(a)], [0, -1, 0], 0.13, 0.025, 0.2, { color: i % 2 ? WL.gold : WL.gold2 });
      stud(c, "matte", add(p, [Math.sin(a) * 0.03, 0.06, Math.cos(a) * 0.03]), [Math.sin(a), 0, Math.cos(a)], 0.025, 0.02, { color: BONE });
    }
    belt(c, J, J.hip + 0.13, 0.29, WL.gold2, WL.pale, "gold");
    c.bone("chest", [0, J.chest, 0], () => {
      const t = trunk(c, J, WL.stone, "gloss", { broad: 1.2, belly: 0.6, deep: 1.15 });
      // A gold skull boss on his breastplate, its eyes burning
      const b: V3 = [0, J.chest + 0.38, t.front + 0.04];
      blob(c, "gold", b, [0.09, 0.085, 0.05], { color: WL.gold, wd: 12, hd: 8 });
      for (const s of [1, -1]) c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.6, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.018, 6, 4), add(b, [s * 0.032, 0.01, 0.045]), undefined, { color: BLOOD, bright: 2.2 }));
      for (let i = 0; i < 6; i++) stud(c, "gold", [(i - 2.5) * 0.09, J.chest + 0.12, t.front * 0.95], [0, 0, 1], 0.02, 0.012, { color: WL.gold });
      // Gold ribs over the dark stone of his breastplate
      for (const s of [1, -1])
        for (let k = 0; k < 3; k++) {
          const y = J.chest + 0.22 + k * 0.1;
          seg(c, "gold", [s * 0.07, y, t.front + 0.01], [s * (0.24 - k * 0.02), y + 0.05, t.front * 0.7], 0.02, 0.014, { color: WL.gold, seg: 6 });
        }
      pauldrons(c, J, WL.gold, "gold", 1.5, WL.gold2);
      for (const s of [1, -1]) {
        spike(c, "matte", [s * (J.shX + 0.1), J.sh + 0.12, 0], [s * 0.55, 1, -0.1], 0.05, 0.4, { color: BONE, seg: 6 });
        c.k.add("gold", new THREE.TorusGeometry(0.17, 0.016, 4, 18, Math.PI), [s * (J.shX + 0.05), J.sh + 0.05, 0], [0, Math.PI / 2, s * 0.35], { color: WL.gold });
      }
      cape(c, J, WL.cape, { y1: 0.15, R: 0.44, flare: 1.1, tattered: true });
      // The war banner of Drak'mar on a pole at his back: a crossbar of bone, the blood-red banner with a gold skull, a horned skull at the top
      c.bone("banner", [0, J.sh, -0.36], () => {
        const foot: V3 = [0, J.chest, -0.36];
        const top: V3 = [0, J.sh + 1.35, -0.42];
        seg(c, "matte", foot, top, 0.032, 0.028, { color: "#3f2a1a", seg: 8 });
        for (let i = 0; i < 3; i++) c.k.add("gold", new THREE.TorusGeometry(0.036, 0.01, 4, 12), mid2(foot, top).map((v, j) => v + (j === 1 ? (i - 1) * 0.4 : 0)) as V3, [Math.PI / 2, 0, 0], { color: WL.gold });
        const bar: V3 = [0, J.sh + 1.2, -0.42];
        seg(c, "matte", add(bar, [-0.42, 0, 0]), add(bar, [0.42, 0, 0]), 0.026, 0.026, { color: BONE, seg: 6 });
        for (const s of [1, -1]) spike(c, "gold", add(bar, [s * 0.42, 0, 0]), [s, 0.2, 0], 0.03, 0.12, { color: WL.gold, seg: 5 });
        c.k.move({ kind: MOVE.flutter, pivot: bar, axis: [0, 0, 1], amp: 0.05, speed: 2.2 }, () => {
          c.k.add("cloth", new THREE.PlaneGeometry(0.8, 1.05, 4, 6), add(bar, [0, -0.54, -0.02]), [0, Math.PI, 0], { color: WL.cape, surf: cloth(0.8, 1.05, true) });
          blob(c, "gold", add(bar, [0, -0.45, -0.045]), [0.13, 0.12, 0.03], { color: WL.gold, wd: 12, hd: 8 });
          for (const s of [1, -1]) c.k.add("glow", new THREE.SphereGeometry(0.03, 8, 5), add(bar, [s * 0.05, -0.43, -0.075]), undefined, { color: BLOOD, bright: 2 });
        });
        const sk = add(top, [0, 0.08, 0]);
        blob(c, "matte", sk, [0.11, 0.1, 0.12], { color: BONE, wd: 12, hd: 8 });
        for (const s of [1, -1]) {
          seg(c, "gold", add(sk, [s * 0.08, 0.05, 0]), add(sk, [s * 0.24, 0.2, -0.02]), 0.03, 0.012, { color: WL.gold, seg: 6 });
          c.k.add("glow", new THREE.SphereGeometry(0.022, 8, 5), add(sk, [s * 0.04, 0.0, 0.1]), undefined, { color: BLOOD, bright: 2.2 });
        }
      });
      arm(c, J, 1, { upper: WL.stone, upperBucket: "gloss", fore: SKIN, foreBucket: "matte", cuff: WL.gold, cuffBucket: "gold", thick: 1.45 }, (wr) => {
        // The great axe: a long haft bound in gold, a broad crescent blade with a blood-red edge, a spike behind
        const d: V3 = norm([0, 1, 0.08]);
        fist(c, "matte", wr, d, 1, SKIN, 1.45);
        shaft(c, wr, d, 0.85, 1.3, 0.034, "#3f2a1a");
        for (let i = 0; i < 3; i++) c.k.add("gold", new THREE.TorusGeometry(0.04, 0.011, 4, 12), add(wr, d, 0.6 + i * 0.22), [Math.PI / 2, 0, 0], { color: WL.gold });
        const top = add(wr, d, 1.2);
        const side = norm([1, 0, 0]);
        c.bone("axe", top, () => {
          // The crescent head, bearded below, and its cutting edge glowing blood-red
          blade(c, "iron", add(top, side, 0.02), side, d, 0.5, 0.66, WL.axe, { shape: "axe", t: 0.028 });
          const edge: V3[] = Array.from({ length: 7 }, (_, i) => {
            const a = -0.9 + (i / 6) * 1.8;
            return add(add(top, side, 0.02 + 0.5 * (0.93 + 0.1 * Math.cos(a))), d, 0.33 * Math.sin(a) * 1.0);
          });
          c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 1.8 }, () => {
            for (let i = 0; i < 6; i++) seg(c, "glow", edge[i], edge[i + 1], 0.02, 0.02, { color: BLOOD, bright: 1.7, seg: 5 });
          });
          spike(c, "gold", top, [-1, 0.1, 0], 0.035, 0.22, { color: WL.gold, seg: 6 });
          spike(c, "gold", add(top, d, 0.1), d, 0.03, 0.22, { color: WL.gold, seg: 6 });
        });
      });
      arm(c, J, -1, { upper: WL.stone, upperBucket: "gloss", fore: SKIN, foreBucket: "matte", cuff: WL.gold, cuffBucket: "gold", thick: 1.45 }, (wr) => fist(c, "matte", wr, [0, 1, 0.3], -1, SKIN, 1.45));
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = orcHead(c, J, { eyes: false, topknot: false });
        // A helm of gold, the great bone horns curving up and out, a crown of gold spikes between them, eyes burning
        c.k.add("gold", new THREE.SphereGeometry(J.hr[0] * 1.14, 18, 10, 0, TAU, 0, Math.PI * 0.55), add(h0, [0, 0.02, -0.01]), undefined, { color: WL.gold2, scale: [1, 1.05, 1.04] });
        for (let i = 0; i < 5; i++) {
          const a = ((i - 2) / 2) * 0.7;
          spike(c, "gold", add(h0, [Math.sin(a) * J.hr[0] * 0.95, J.hr[1] * 0.9, Math.cos(a) * J.hr[2] * 0.6]), [Math.sin(a) * 0.3, 1, 0.1], 0.03, i === 2 ? 0.24 : 0.15, { color: WL.pale, seg: 5 });
        }
        c.k.add("gold", new THREE.TorusGeometry(J.hr[0] * 1.13, 0.022, 4, 22), add(h0, [0, 0.0, -0.01]), [Math.PI / 2, 0, 0], { color: WL.gold });
        for (const s of [1, -1]) {
          const r0 = add(h0, [s * J.hr[0] * 0.85, J.hr[1] * 0.45, -0.02]);
          const r1 = add(r0, [s * 0.18, 0.12, -0.04]);
          const r2 = add(r1, [s * 0.1, 0.2, -0.02]);
          seg(c, "matte", r0, r1, 0.06, 0.045, { color: BONE, seg: 8 });
          seg(c, "matte", r1, r2, 0.045, 0.022, { color: BONE, seg: 8 });
          spike(c, "matte", r2, [s * 0.1, 1, 0.15], 0.022, 0.1, { color: BONE, seg: 6 });
          c.k.add("gold", new THREE.TorusGeometry(0.055, 0.012, 4, 12), mid2(r0, r1), undefined, { color: WL.gold, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...norm([r1[0] - r0[0], r1[1] - r0[1], r1[2] - r0[2]]))) });
          c.k.add("glow", new THREE.SphereGeometry(0.02, 8, 5), add(h0, [s * J.hr[0] * 0.36, J.hr[1] * 0.1, J.hr[2] * 0.97]), undefined, { color: BLOOD, bright: 2.4, scale: [1.3, 0.7, 0.6] });
        }
      });
    });
  });
}

const mid2 = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

const WL_DEF = mercDef({
  build: warlord,
  // The axe grounded beside him, chest out, chin raised: never mirrored
  rest: {
    hips: { r: [0, 0.08, 0.02] },
    chest: { r: [0.04, -0.1, -0.01] },
    head: { r: [-0.08, 0.12, 0.03] },
    thighL: { r: [-0.1, 0, -0.04] },
    shinL: { r: [0.08, 0, 0] },
    thighR: { r: [0.04, 0, 0.05] },
    armR: { r: [-0.1, 0, 0.12] },
    foreR: { r: [-0.2, 0, 0] },
    armL: { r: [-0.15, 0, -0.2] },
    foreL: { r: [-0.4, 0, 0] }
  },
  idle: personIdle({ cape: true, life: 0.8, more: (c) => {
    orbit(c, "ember", WL_EMBERS, 1.35, 0.5);
    c.add("banner", [0.03 * c.drift(0.5), 0, 0.04 * c.drift(0.45, 1)]);
  } }),
  walk: march({ swingR: 0.15, swingL: 0.5, cape: true, weight: 1.4, lean: 0.06 }),
  roar: warCry({ arm: "both", glow: ["axe", "banner"], cine: { quake: 0.1, vig: 0.55, vigCol: "#450a0a", lines: 0.9, flash: 0.3, flashCol: "#fecaca" } }),
  roarLabel: "Warcry of Drak'mar",
  attack: slam({ cine: { quake: 0.18, stop: 0.08, flash: 0.45, flashCol: "#fecaca", lines: 0.85, vig: 0.35, vigCol: "#450a0a" }, extra: { hit: { axe: { g: 1.6 } } } }),
  attackLabel: "Cleave",
  trail: { cape: true, extra: { axe: 0.06, banner: 0.1 } },
  burst: { at: [0, 0.2, 1.4], color: "#ef4444", count: 70, speed: 2.6, spread: 0.6, size: 0.14, gravity: 2 },
  aura: aura("#f59e0b", "#fecaca", 0.5, 1.7, 4.4),
  height: 3.5,
  frame: [6.8, 3.3, 1.7],
  sparks: (c) => {
    c.spark(SPARK.ember, [0, 0.4, 0], 14, { color: "#ef4444", size: 0.05, speed: 0.3, rise: 2.6, reach: 1.0, spread: 1.4 });
    c.spark(SPARK.mote, [0, 1.3, 0], 14, { color: "#fde68a", size: 0.05, speed: 0.35, rise: 0.9, reach: 0.9, spread: 1.2 });
    c.spark(SPARK.smoke, [0, 0.2, 0], 6, { color: "#292524", size: 0.8, speed: 0.08, rise: 1.2, reach: 0.8, spread: 1.0 });
  }
});

WL_DEF.springs = { ...WL_DEF.springs, banner: 40 };

/** Drak'mar's mercenaries, common → legendary (rigged heroes, every copy in the same draws) */
export const DRAKMAR_MERCS: Record<string, BossHeroDef> = {
  "merc-orc-raider": GR_DEF,
  "merc-orc-brute": BB_DEF,
  "merc-orc-shaman": BL_DEF,
  "merc-orc-berserker": RV_DEF,
  "merc-orc-warlord": WL_DEF
};
