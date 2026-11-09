import * as THREE from "three";
import { MOVE, TAU, V3, thetaOf } from "./heroKit";
import { SPARK, SURF } from "./heroMaterials";
import { BossCtx, BossHeroDef } from "./heroRig";
import { blob, seg, spike } from "./bossParts";
import { aura } from "./heroCreatures";
import {
  Joints,
  add,
  arm,
  belt,
  blade,
  cape,
  face,
  fist,
  invoke,
  joints,
  legs,
  loose,
  march,
  mercDef,
  norm,
  openHand,
  orbit,
  orbiters,
  pauldrons,
  personIdle,
  roundShield,
  shaft,
  skirt,
  skull,
  thrust,
  trunk,
  warCry,
  whirl
} from "./heroMercKit";

/* ------------------------------------------------------------------------- */
/* Sylvandale's mercenaries in high graphics, common → legendary               */
/* ------------------------------------------------------------------------- */

/*
 * Tall, slim folk on the mercenary kit (`heroMercKit.ts`), each on its rung: the Initiate in plain undyed green, the
 * Warden's one accent (glade teal) and his lantern, the Oracle's silver and the moon-motes drifting round her bowl, the
 * Bladesinger's glowing leaf and twin moon-blades with leaves of light circling, the White Archer of the Hero Monument
 * in white stone and gilt with her bow of light, antlered circlet and cape.
 */

const SKIN = "#f3dccb";
const TEAL = "#1f9e8f";
const TEAL2 = "#17806f";
const CYAN = "#67e8f9";
const MOON = "#cffafe";
const SILVER = "#d1d9e0";
const SILVER2 = "#a9b4bf";

/** An elf's head: the face with long pointed ears, and long hair falling down the back (a bone of its own, `hair`) */
function elfHead(c: BossCtx, J: Joints, hair: string | null, o: { iris?: string; eyes?: boolean } = {}) {
  const h0 = skull(c, J, SKIN, "matte", 0.9);
  face(c, h0, J.hr, { skin: SKIN, ears: "elf", iris: o.iris ?? "#14532d", nose: 0.8, eyes: o.eyes });
  if (hair) {
    blob(c, "fur", add(h0, [0, 0.03, -0.025]), [J.hr[0] * 1.06, J.hr[1] * 0.98, J.hr[2] * 1.02], { color: hair, wd: 12, hd: 8 });
    c.bone("hair", add(h0, [0, -0.02, -0.08]), () => {
      for (const x of [-0.05, 0, 0.05]) seg(c, "fur", add(h0, [x, 0.0, -0.08]), add(h0, [x * 1.4, -0.36, -0.12 - Math.abs(x)]), 0.035, 0.012, { color: hair, seg: 6 });
    });
  }
  return h0;
}

/* ================================================================== */
/* Grove Initiate (common)                                             */
/* ================================================================== */

const GI = { robe: "#3f6b45", robe2: "#33583a", hood: "#2f5434", sash: "#6b5a3e", staff: "#7a6346", leaf: "#4d7c3a", sandal: "#5a4a2e" };

function initiate(c: BossCtx) {
  const J = joints(1.06, 0.85);
  legs(c, J, { thigh: GI.robe2, boot: GI.sandal, thick: 0.8 });
  c.bone("hips", [0, J.hip, 0], () => {
    c.bone("habit", [0, J.hip, 0], () => skirt(c, J, GI.robe, J.hip + 0.16, 0.05, 0.26, 0.46, { hem: GI.robe2 }));
    c.k.add("cloth", new THREE.TorusGeometry(0.235, 0.025, 5, 20), [0, J.hip + 0.13, 0], [Math.PI / 2, 0, 0], { color: GI.sash, scale: [1, 0.85, 1] });
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, GI.robe, "cloth", { broad: 0.9 });
      c.k.add("cloth", new THREE.CylinderGeometry(0.11, 0.28, 0.28, 20, 2, true), [0, J.sh + 0.03, -0.01], undefined, { color: GI.hood, scale: [1, 1, 0.86] });
      arm(c, J, 1, { upper: GI.robe, fore: GI.robe, bell: 0.1, cuff: GI.robe2, thick: 0.85 }, (wr) => {
        // A staff cut from a sapling, its crown still putting out leaves
        const d: V3 = norm([0, 1, 0.04]);
        fist(c, "matte", wr, d, 1, SKIN, 0.9);
        shaft(c, wr, d, 1.05, 1.15, 0.022, GI.staff);
        const top = add(wr, d, 1.15);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + 0.4;
          const dir = norm([Math.cos(a), 0.9, Math.sin(a)]);
          seg(c, "matte", top, add(top, dir, 0.08), 0.008, 0.006, { color: GI.staff, seg: 4, cap: false });
          blade(c, "leaf", add(top, dir, 0.07), dir, norm([-Math.sin(a), 0, Math.cos(a)]), 0.12, 0.06, i % 2 ? GI.leaf : "#5a8a44", { shape: "leaf", t: 0.006 });
        }
      });
      arm(c, J, -1, { upper: GI.robe, fore: GI.robe, bell: 0.1, cuff: GI.robe2, thick: 0.85 }, (wr) => openHand(c, "matte", add(wr, [0, -0.01, 0.02]), [0.6, 0.2, 0.2], [0.25, -0.8, 0.4], -1, SKIN, 0.55, 0.9));
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = elfHead(c, J, null);
        // A plain deep hood, its point falling down the back
        c.k.add("cloth", new THREE.SphereGeometry(1, 16, 9, Math.PI / 2 + 0.7, TAU - 1.4, 0, Math.PI * 0.72), add(h0, [0, 0.01, -0.025]), undefined, { color: GI.hood, scale: [0.155, 0.185, 0.17] });
        spike(c, "cloth", add(h0, [0, 0.1, -0.1]), [0, 0.2, -1], 0.07, 0.2, { color: GI.hood, seg: 8 });
      });
    });
  });
}

const GI_DEF = mercDef({
  build: initiate,
  rest: {
    hips: { r: [0, 0.06, -0.02] },
    chest: { r: [0.05, -0.06, 0.02] },
    head: { r: [0.12, 0.1, -0.05] },
    armR: { r: [-0.05, 0, 0.05] },
    foreR: { r: [-0.2, 0, 0] },
    armL: { r: [-0.08, 0, -0.06] },
    foreL: { r: [-0.1, 0, 0] }
  },
  idle: personIdle({ more: (c) => c.add("habit", [0.03 * c.drift(0.5), 0, 0.03 * c.drift(0.45, 1)]) }),
  walk: march({ swingR: 0.2, stride: 0.8, lean: 0.03 }),
  attack: invoke({ staff: "R", cine: { quake: 0.03, flash: 0.1, flashCol: "#d9f99d" } }),
  attackLabel: "Thorn darts",
  trail: { extra: { habit: 0.08 } },
  burst: { at: [0, 1.4, 1.3], color: "#a3e635", count: 26, speed: 1.4, spread: 0.3, size: 0.08, gravity: 2 },
  height: 2.6,
  frame: [5.2, 2.5, 1.3]
});
GI_DEF.springs = { ...GI_DEF.springs, habit: 70 };

/* ================================================================== */
/* Leafward Warden (uncommon)                                          */
/* ================================================================== */

const LW = { jerkin: "#365314", jerkin2: "#2b4310", leather: "#5a4a2e", leather2: "#463a24", bark: "#6b4f2e", bark2: "#4a3523", glaive: "#a3a8b0", haft: "#6b5a3e", lantern: "#d9f99d", hair: "#e5e7eb" };

function warden(c: BossCtx) {
  const J = joints(1.06, 0.9);
  legs(c, J, { thigh: "#3f6212", boot: LW.leather, shin: LW.leather2, shinBucket: "matte", thick: 0.9 });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, LW.jerkin2, J.hip + 0.12, J.hip - 0.22, 0.22, 0.27);
    belt(c, J, J.hip + 0.12, 0.23, LW.leather, "#8a8f98");
    // The firefly lantern at his hip: a cage of bent wood, pale glass, unlit by day
    c.bone("lantern", [0.27, J.hip + 0.08, 0.1], () => {
      const o: V3 = [0.27, J.hip - 0.06, 0.1];
      c.k.add("gloss", new THREE.SphereGeometry(0.05, 10, 8), o, undefined, { color: LW.lantern, scale: [1, 1.3, 1] });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        seg(c, "matte", add(o, [Math.cos(a) * 0.05, 0.09, Math.sin(a) * 0.05]), add(o, [Math.cos(a) * 0.05, -0.07, Math.sin(a) * 0.05]), 0.006, 0.006, { color: LW.haft, seg: 4, cap: false });
      }
      seg(c, "matte", add(o, [0, 0.08, 0]), [0.27, J.hip + 0.08, 0.1], 0.006, 0.006, { color: LW.leather, seg: 4, cap: false });
    });
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, LW.jerkin, "cloth", { broad: 0.95 });
      // Leather straps across his chest
      c.k.along("matte", [0.2, J.sh, 0.12], [-0.18, J.chest + 0.05, 0.18], [0.04, 0.012], { color: LW.leather });
      pauldrons(c, J, LW.leather, "matte", 0.7);
      cape(c, J, TEAL, { y1: 0.45, R: 0.32, flare: 0.8 });
      arm(c, J, 1, { upper: LW.jerkin, fore: LW.leather2, foreBucket: "matte", thick: 0.9 }, (wr) => {
        // The glaive: a long haft and a leaf-shaped blade of dull steel
        const d: V3 = norm([0, 1, 0.08]);
        fist(c, "matte", wr, d, 1, SKIN, 0.95);
        shaft(c, wr, d, 0.9, 1.15, 0.022, LW.haft);
        const top = add(wr, d, 1.15);
        c.k.add("iron", new THREE.CylinderGeometry(0.026, 0.03, 0.07, 8), top, undefined, { color: "#6b7280" });
        blade(c, "iron", add(top, d, 0.03), d, [1, 0, 0], 0.42, 0.13, LW.glaive, { shape: "leaf", t: 0.014 });
      });
      arm(c, J, -1, { upper: LW.jerkin, fore: LW.leather2, foreBucket: "matte", thick: 0.9 }, (wr) => {
        blob(c, "matte", wr, [0.055, 0.06, 0.06], { color: LW.leather, wd: 8, hd: 6 });
        // A round shield of living bark, a boss of knotted wood
        roundShield(c, add(wr, [-0.07, 0.05, 0.12]), norm([-0.3, 0, 1]), 0.33, LW.bark, LW.bark2, LW.bark2, { rimBucket: "matte" });
      });
      c.bone("head", [0, J.neck, 0], () => elfHead(c, J, LW.hair));
    });
  });
}

const LW_DEF = mercDef({
  build: warden,
  rest: {
    hips: { r: [0, 0.1, 0.02] },
    chest: { r: [0.02, -0.08, -0.01] },
    head: { r: [0.04, 0.12, 0.02] },
    thighL: { r: [-0.06, 0, 0] },
    shinL: { r: [0.08, 0, 0] },
    armR: { r: [-0.08, 0, 0.04] },
    foreR: { r: [-0.25, 0, 0] },
    armL: { r: [-0.2, 0, -0.04] },
    foreL: { r: [-0.2, 0, 0] },
    handL: { r: [0.2, 0, 0] }
  },
  idle: personIdle({ cape: true, more: (c) => c.add("lantern", [0.08 * Math.sin(c.t * 1.9), 0, 0.06 * Math.sin(c.t * 1.4 + 1)]) }),
  walk: march({ swingR: 0.3, swingL: 0.2, cape: true }),
  attack: thrust({ shield: true, cine: { quake: 0.06, stop: 0.04, flash: 0.14, flashCol: "#ecfccb", vig: 0.1, vigCol: "#14532d" } }),
  attackLabel: "Glaive thrust",
  trail: { cape: true, extra: { lantern: 0.12, hair: 0.1 } },
  burst: { at: [0.3, 1.5, 1.4], color: "#bbf7d0", count: 30, speed: 1.5, spread: 0.4, size: 0.1, gravity: 4 },
  height: 2.7,
  frame: [5.4, 2.6, 1.3]
});
LW_DEF.springs = { ...LW_DEF.springs, lantern: 35, hair: 50 };

/* ================================================================== */
/* Moonwell Oracle (rare)                                              */
/* ================================================================== */

const MO = { robe: "#e7efe9", robe2: "#cfdcd4", sash: "#a9b4bf", hair: "#f8fafc", water: CYAN };
const MO_MOTES = 5;

function oracle(c: BossCtx) {
  const J = joints(1.08, 0.85);
  legs(c, J, { thigh: MO.robe2, boot: "#c3cfc9", thick: 0.8 });
  orbiters(c, "mote", MO_MOTES, J.chest + 0.45, (i, at) => {
    c.k.add("glow", new THREE.IcosahedronGeometry(0.045, 1), at, undefined, { color: i % 2 ? MOON : CYAN, bright: 1.4 });
  });
  c.bone("hips", [0, J.hip, 0], () => {
    c.bone("habit", [0, J.hip, 0], () => skirt(c, J, MO.robe, J.hip + 0.16, 0.04, 0.25, 0.5, { hem: SILVER }));
    c.k.add("iron", new THREE.TorusGeometry(0.235, 0.02, 5, 22), [0, J.hip + 0.13, 0], [Math.PI / 2, 0, 0], { color: SILVER, scale: [1, 0.85, 1] });
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, MO.robe, "cloth", { broad: 0.9 });
      // A silver collar of leaves at her throat
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.15 + (i / 8) * 0.7);
        const p: V3 = [Math.cos(a) * 0.17, J.sh + 0.02, Math.sin(a) * 0.13];
        blade(c, "iron", p, norm([Math.cos(a), -0.6, Math.sin(a)]), norm([-Math.sin(a), 0, Math.cos(a)]), 0.09, 0.045, i % 2 ? SILVER : SILVER2, { shape: "leaf", t: 0.006 });
      }
      const wristIn: V3 = [-0.18, 0.1, 0.12];
      arm(c, J, 1, { upper: MO.robe, fore: MO.robe, cuff: SILVER, cuffBucket: "iron", thick: 0.85, wr: wristIn }, (wr) => openHand(c, "matte", add(wr, [0, 0.01, 0.03]), [-0.5, 1, 0.1], [-0.4, 0, 1], 1, SKIN, 0.3, 0.9));
      arm(c, J, -1, { upper: MO.robe, fore: MO.robe, cuff: SILVER, cuffBucket: "iron", thick: 0.85, wr: [0.18, 0.1, 0.07] }, (wr) => openHand(c, "matte", add(wr, [0, 0.01, 0.03]), [0.5, 1, 0.1], [0.4, 0, 1], -1, SKIN, 0.3, 0.9));
      // The scrying bowl of silver held up between her hands, moonlit water glowing in it
      c.bone("bowl", [0, J.sh - 0.52 * J.h, 0.44], () => {
        const o: V3 = [0, J.sh - 0.52 * J.h, 0.44];
        c.k.add("iron", new THREE.SphereGeometry(0.15, 18, 8, 0, TAU, Math.PI / 2, Math.PI / 2), add(o, [0, 0.07, 0]), undefined, { color: SILVER });
        c.k.add("iron", new THREE.TorusGeometry(0.15, 0.012, 4, 24), add(o, [0, 0.07, 0]), [Math.PI / 2, 0, 0], { color: SILVER2 });
        c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.3 }, () => c.k.add("glow", new THREE.CylinderGeometry(0.135, 0.135, 0.01, 22), add(o, [0, 0.045, 0]), undefined, { color: MO.water, bright: 1.3 }));
      });
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = elfHead(c, J, MO.hair, { iris: "#0e7490" });
        // The silver circlet with a moonstone over her brow
        c.k.add("iron", new THREE.TorusGeometry(J.hr[0] * 1.06, 0.009, 4, 22), add(h0, [0, 0.05, 0]), [Math.PI / 2 - 0.12, 0, 0], { color: SILVER });
        c.k.add("gloss", new THREE.OctahedronGeometry(0.025), add(h0, [0, 0.075, J.hr[2] * 1.05]), undefined, { color: MOON, scale: [1, 1.4, 0.6] });
      });
    });
  });
}

const MO_DEF = mercDef({
  build: oracle,
  rest: {
    chest: { r: [0.04, 0.05, 0] },
    head: { r: [0.22, -0.05, 0.04] },
    armR: { r: [-0.3, 0, -0.05] },
    foreR: { r: [-0.3, 0, 0] },
    armL: { r: [-0.32, 0, 0.06] },
    foreL: { r: [-0.25, 0, 0] }
  },
  idle: personIdle({
    life: 0.6,
    more: (c) => {
      orbit(c, "mote", MO_MOTES, 0.8, 0.7, 0.3);
      c.add("bowl", [0.03 * c.drift(0.5), 0, 0.03 * c.drift(0.4, 1)], [0, 0.02 * c.sin(1.4), 0]);
      c.add("habit", [0.03 * c.drift(0.5), 0, 0.03 * c.drift(0.45, 1)]);
    }
  }),
  walk: march({ swingR: 0, swingL: 0, stride: 0.7, lean: 0.02 }),
  attack: invoke({ glow: ["bowl"], cine: { quake: 0.03, flash: 0.25, flashCol: "#cffafe", vig: 0.15, vigCol: "#0e7490" } }),
  attackLabel: "Foresight",
  trail: { extra: { bowl: 0.08, habit: 0.08, hair: 0.1 } },
  burst: { at: [0, 1.5, 0.8], color: "#cffafe", count: 40, speed: 1.2, spread: 0.3, size: 0.1, gravity: -0.5 },
  height: 2.7,
  frame: [5.4, 2.6, 1.3],
  sparks: (c) => c.spark(SPARK.mote, [0, 1.4, 0.4], 8, { color: "#cffafe", size: 0.04, speed: 0.3, rise: 0.5, reach: 0.3, spread: 0.3 })
});
MO_DEF.springs = { ...MO_DEF.springs, habit: 70, hair: 50 };

/* ================================================================== */
/* Thousand-Year Bladesinger (epic)                                    */
/* ================================================================== */

const BS = { garb: "#0f766e", garb2: "#115e59", leather: "#3f3a2a", hair: "#f8fafc", edge: MOON };
const BS_LEAVES = 7;

function moonBlade(c: BossCtx, wr: V3, d: V3, s: number) {
  fist(c, "matte", wr, d, s, SKIN, 0.95);
  seg(c, "matte", add(wr, d, -0.1), add(wr, d, 0.09), 0.018, 0.018, { color: BS.leather, seg: 6, cap: false });
  const side = norm([s, 0.1, 0]);
  const g = add(wr, d, 0.1);
  seg(c, "iron", add(g, side, -0.07), add(g, side, 0.07), 0.016, 0.016, { color: SILVER, seg: 6 });
  blade(c, "iron", add(g, d, 0.01), d, side, 0.75, 0.09, "#e5eef2", { shape: "curve", t: 0.012 });
  // The edge's light
  c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 2.2, phase: s }, () => blade(c, "glow", add(add(g, d, 0.02), side, -0.04), d, side, 0.72, 0.02, BS.edge, { shape: "curve", t: 0.016, bright: 1.6 }));
}

function bladesinger(c: BossCtx) {
  const J = joints(1.15, 0.95);
  legs(c, J, { thigh: "#14532d", boot: BS.leather, thick: 0.9 });
  orbiters(c, "leaf", BS_LEAVES, J.chest + 0.35, (i, at) => {
    c.k.add("glow", new THREE.OctahedronGeometry(0.05), at, undefined, { color: i % 2 ? MOON : CYAN, bright: 1.6, scale: [0.5, 1.8, 0.25] });
  });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, BS.garb2, J.hip + 0.12, J.hip - 0.36, 0.22, 0.3, { hem: SILVER });
    belt(c, J, J.hip + 0.12, 0.24, SILVER, MOON, "iron");
    c.bone("chest", [0, J.chest, 0], () => {
      const t = trunk(c, J, BS.garb, "cloth", { broad: 1.0 });
      // The leaf tattoo glowing through his tunic
      c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.2 }, () => blade(c, "glow", [0.06, J.chest + 0.28, t.front + 0.02], norm([0.35, 1, 0]), [0, 0, 1], 0.3, 0.12, CYAN, { shape: "leaf", t: 0.006, bright: 1.5 }));
      pauldrons(c, J, SILVER, "iron", 0.75, SILVER2);
      cape(c, J, BS.garb, { y1: 0.35, R: 0.33, flare: 0.9, tattered: false });
      arm(c, J, 1, { upper: BS.garb, fore: BS.leather, foreBucket: "matte", thick: 0.9 }, (wr) => moonBlade(c, wr, norm([0.15, 0.55, 0.8]), 1));
      arm(c, J, -1, { upper: BS.garb, fore: BS.leather, foreBucket: "matte", thick: 0.9 }, (wr) => moonBlade(c, wr, norm([-0.15, 0.55, 0.8]), -1));
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = elfHead(c, J, BS.hair, { iris: "#0891b2" });
        c.k.add("iron", new THREE.TorusGeometry(J.hr[0] * 1.06, 0.009, 4, 22), add(h0, [0, 0.05, 0]), [Math.PI / 2 - 0.1, 0, 0], { color: SILVER });
        // Eyes lit from within
        for (const s of [1, -1]) c.k.add("glow", new THREE.SphereGeometry(0.012, 6, 4), add(h0, [s * J.hr[0] * 0.36, J.hr[1] * 0.1, J.hr[2] * 0.97]), undefined, { color: CYAN, bright: 2 });
      });
    });
  });
}

const BS_DEF = mercDef({
  build: bladesinger,
  // Low and coiled, blades crossed loosely before him: never mirrored
  rest: {
    hips: { p: [0, -0.04, 0], r: [0, -0.15, 0] },
    chest: { r: [0.08, 0.18, 0] },
    head: { r: [0.05, -0.1, 0.03] },
    thighL: { r: [-0.25, 0, -0.05] },
    shinL: { r: [0.3, 0, 0] },
    thighR: { r: [0.12, 0, 0.06] },
    shinR: { r: [0.15, 0, 0] },
    armR: { r: [-0.35, 0, 0.15] },
    foreR: { r: [-0.4, 0, 0] },
    armL: { r: [-0.55, 0, -0.1] },
    foreL: { r: [-0.5, 0, 0] }
  },
  idle: personIdle({ cape: true, life: 1.1, more: (c) => orbit(c, "leaf", BS_LEAVES, 1.0, 0.9) }),
  walk: march({ swingR: 0.5, swingL: 0.5, cape: true, lean: 0.08 }),
  attack: whirl({ cine: { quake: 0.06, stop: 0.05, flash: 0.3, flashCol: "#cffafe", lines: 0.7, vig: 0.25, vigCol: "#134e4a" } }),
  attackLabel: "Leaf whirlwind",
  trail: { cape: true, extra: { hair: 0.1 } },
  burst: { at: [0, 1.2, 0], color: "#a5f3fc", count: 60, speed: 2.4, spread: 0.6, size: 0.1, gravity: 0.8 },
  aura: { embers: { inner: 0.45, outer: 1.3, height: 3.4, count: 30 }, color: "#a855f7", hot: "#a5f3fc" },
  height: 3.0,
  frame: [6.0, 2.9, 1.5],
  sparks: (c) => c.spark(SPARK.mote, [0, 1.5, 0], 10, { color: "#a5f3fc", size: 0.05, speed: 0.3, rise: 1.2, reach: 0.6, spread: 0.8 })
});
BS_DEF.springs = { ...BS_DEF.springs, hair: 50 };

/* ================================================================== */
/* The White Archer (legendary)                                        */
/* ================================================================== */

const WA = { white: "#eef2f7", white2: "#d4dbe4", gold: "#e8b84a", gold2: "#c9922e", pale: "#fde68a", hair: "#f8fafc" };
const WA_LEAVES = 8;

/** One of her golden leaf-wings: a fan of gilt leaves sweeping up and out from behind the shoulder, a vein of light down each */
function leafWing(c: BossCtx, root: V3, s: number) {
  for (let k = 0; k < 6; k++) {
    const a = 0.02 + k * 0.21;
    const dir = norm([s * Math.cos(a), Math.sin(a), -0.4]);
    const side = norm(cross3([0, 0, 1], dir));
    const L = 0.95 + k * 0.13 - Math.max(0, k - 3) * 0.2;
    blade(c, "gold", root, dir, side, L, 0.21, k % 2 ? WA.gold : WA.gold2, { shape: "leaf", t: 0.012 });
    // Its vein of light: a thin bar down the leaf (a bar costs a few vertices, an extruded leaf hundreds)
    c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.3, phase: k * 0.6 }, () => c.k.along("glow", add(add(root, dir, 0.06), [0, 0, 0.014]), add(add(root, dir, L * 0.82), [0, 0, 0.014]), [0.016, 0.01], { color: MOON, bright: 1.6 }));
  }
}

function whiteArcher(c: BossCtx) {
  const J = joints(1.25, 1.0);
  legs(c, J, { thigh: WA.white, thighBucket: "gloss", boot: WA.gold2, bootBucket: "gold", plate: WA.gold, plateBucket: "gold" });
  orbiters(c, "leaf", WA_LEAVES, J.chest + 0.5, (i, at) => {
    c.k.add("glow", new THREE.OctahedronGeometry(0.055), at, undefined, { color: i % 2 ? MOON : CYAN, bright: 1.8, scale: [0.5, 1.9, 0.25] });
  });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, WA.white, J.hip + 0.14, J.hip - 0.6, 0.24, 0.38, { bucket: "gloss", hem: WA.gold });
    // A band of runes glowing round the hem
    c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.2 }, () =>
      c.k.add("glow", new THREE.CylinderGeometry(0.38 * J.w + 0.004, 0.38 * J.w + 0.004, 0.05, 28, 1, true), [0, J.hip - 0.53, 0], undefined, {
        color: CYAN,
        bright: 1.4,
        surf: { fn: (q) => [(thetaOf(q.x, q.z) / TAU) * 20, q.y / 0.05 + 0.5, SURF.runes] }
      })
    );
    // Gilt leaf tassets hanging round her hips
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const p: V3 = [Math.sin(a) * 0.27 * J.w, J.hip + 0.06, Math.cos(a) * 0.23];
      blade(c, "gold", p, norm([Math.sin(a) * 0.25, -1, Math.cos(a) * 0.25]), norm([Math.cos(a), 0, -Math.sin(a)]), 0.34, 0.12, i % 2 ? WA.gold : WA.gold2, { shape: "leaf", t: 0.012 });
    }
    belt(c, J, J.hip + 0.14, 0.25, WA.gold, WA.pale, "gold");
    c.bone("chest", [0, J.chest, 0], () => {
      const t = trunk(c, J, WA.gold, "gold", { broad: 1.05, deep: 1.05 });
      // A white leaf inlaid over her heart, its gem glowing
      blade(c, "gloss", [0, J.chest + 0.3, t.front + 0.03], [0, 1, 0], [1, 0, 0], 0.3, 0.18, WA.white, { shape: "leaf", t: 0.014 });
      c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.4 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.05), [0, J.chest + 0.43, t.front + 0.06], undefined, { color: CYAN, bright: 2.2, scale: [1, 1.5, 0.6] }));
      pauldrons(c, J, WA.gold, "gold", 1.15, WA.gold2);
      for (const s of [1, -1])
        for (let k = 0; k < 3; k++) blade(c, "gold", [s * (J.shX + 0.04), J.sh + 0.1, -0.02 + k * 0.05], norm([s * (0.5 - k * 0.12), 1, -0.2]), [0, 0, 1], 0.22 - k * 0.04, 0.07, WA.pale, { shape: "leaf", t: 0.01 });
      // The golden leaf-wings, breathing open and shut behind her
      for (const s of [1, -1]) c.bone(`wing${s > 0 ? "R" : "L"}`, [s * 0.16, J.sh - 0.12, -0.22], () => leafWing(c, [s * 0.16, J.sh - 0.12, -0.22], s));
      // The quiver on her back, the heads of its arrows shining
      c.bone("quiver", [0.12, J.chest + 0.3, -0.22], () => {
        const b: V3 = [0.08, J.chest + 0.05, -0.24];
        const tp: V3 = [0.24, J.sh + 0.12, -0.27];
        c.k.along("gold", b, tp, 0, { geo: new THREE.CylinderGeometry(0.075, 0.065, 1, 12, 1, true), color: WA.gold2 });
        for (let i = 0; i < 4; i++) {
          const o = add(tp, [(i - 1.5) * 0.025, 0.02, (i % 2) * 0.02]);
          seg(c, "matte", add(o, [0, -0.1, 0]), add(o, [0.04, 0.15, 0]), 0.006, 0.006, { color: WA.white2, seg: 4, cap: false });
          c.k.add("glow", new THREE.ConeGeometry(0.014, 0.05, 4), add(o, [0.045, 0.18, 0]), [0, 0, -0.16], { color: MOON, bright: 1.6 });
        }
      });
      cape(c, J, TEAL, { y1: 0.15, R: 0.38, flare: 1.2 });
      // The halo of golden leaves turning behind her head
      c.bone("halo", [0, J.head + 0.1, -0.34], () => {
        const o: V3 = [0, J.head + 0.1, -0.34];
        c.k.add("gold", new THREE.TorusGeometry(0.46, 0.02, 5, 40), o, undefined, { color: WA.pale });
        c.k.add("glow", new THREE.TorusGeometry(0.41, 0.011, 4, 36), o, undefined, { color: MOON, bright: 1.5 });
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU;
          const dir: V3 = [Math.cos(a), Math.sin(a), 0];
          blade(c, "gold", add(o, dir, 0.44), dir, [-Math.sin(a), Math.cos(a), 0], i % 2 ? 0.13 : 0.22, 0.07, i % 2 ? WA.pale : WA.gold, { shape: "leaf", t: 0.01 });
        }
      });
      arm(c, J, 1, { upper: WA.white, upperBucket: "gloss", fore: WA.gold, foreBucket: "gold", cuff: WA.pale, cuffBucket: "gold" }, (wr) => {
        // Her drawing hand, an arrow of light between her fingers
        fist(c, "gold", wr, [0, 0, 1], 1, WA.gold2, 0.95);
        c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 2.2 }, () => c.k.along("glow", add(wr, [0, 0.03, -0.25]), add(wr, [0, 0.03, 0.6]), 0, { geo: new THREE.CylinderGeometry(0.01, 0.01, 1, 5, 1, true), color: MOON, bright: 1.8 }));
      });
      arm(c, J, -1, { upper: WA.white, upperBucket: "gloss", fore: WA.gold, foreBucket: "gold", cuff: WA.pale, cuffBucket: "gold" }, (wr) => {
        // The great bow strung with light: gilt limbs sweeping into leaf tips, runes glowing down them
        const d: V3 = [0, 1, 0];
        fist(c, "gold", wr, d, -1, WA.gold2, 1.0);
        const back: V3 = [0, 0, -1];
        const pts: V3[] = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12 - 0.5;
          pts.push(add(add(wr, d, u * 1.9), back, -0.32 * (1 - 4 * u * u) + 0.07));
        }
        for (let i = 0; i < 12; i++) seg(c, "gold", pts[i], pts[i + 1], 0.028 - Math.abs(i - 5.5) * 0.0016, 0.028 - Math.abs(i - 6.5) * 0.0016, { color: i > 4 && i < 7 ? WA.gold2 : WA.gold, seg: 6, cap: i === 0 });
        c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.6, phase: 0.5 }, () => {
          for (const i of [1, 2, 3, 8, 9, 10]) c.k.add("glow", new THREE.OctahedronGeometry(0.018), add(mid3(pts[i], pts[i + 1]), back, -0.022), undefined, { color: CYAN, bright: 2 });
        });
        for (const k of [0, 12]) blade(c, "gold", pts[k], norm(sub3(pts[k], pts[k === 0 ? 1 : 11])), [1, 0, 0], 0.14, 0.07, WA.pale, { shape: "leaf", t: 0.01 });
        c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.6 }, () => c.k.along("glow", pts[0], pts[12], 0, { geo: new THREE.CylinderGeometry(0.006, 0.006, 1, 4, 1, true), color: MOON, bright: 1.9 }));
      });
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = elfHead(c, J, WA.hair, { iris: "#0891b2" });
        // The antlered circlet of gold, its tines branching high, a cyan gem at the brow
        c.k.add("gold", new THREE.TorusGeometry(J.hr[0] * 1.08, 0.014, 4, 22), add(h0, [0, 0.05, 0]), [Math.PI / 2 - 0.1, 0, 0], { color: WA.gold });
        for (const s of [1, -1]) {
          const r0 = add(h0, [s * 0.08, 0.1, -0.02]);
          const r1 = add(r0, [s * 0.13, 0.24, -0.05]);
          const r2 = add(r1, [s * 0.12, 0.18, -0.06]);
          seg(c, "gold", r0, r1, 0.016, 0.012, { color: WA.gold, seg: 6 });
          seg(c, "gold", r1, r2, 0.012, 0.006, { color: WA.gold, seg: 6 });
          seg(c, "gold", r1, add(r1, [-s * 0.03, 0.2, 0.0]), 0.011, 0.005, { color: WA.gold, seg: 6 });
          seg(c, "gold", mid3(r0, r1), add(mid3(r0, r1), [s * 0.11, 0.05, 0.05]), 0.01, 0.005, { color: WA.gold, seg: 6 });
          seg(c, "gold", mid3(r1, r2), add(mid3(r1, r2), [s * 0.02, 0.12, 0.03]), 0.008, 0.004, { color: WA.gold, seg: 6 });
        }
        c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.5 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.03), add(h0, [0, 0.075, J.hr[2] * 1.06]), undefined, { color: CYAN, bright: 2.2, scale: [1, 1.4, 0.6] }));
      });
    });
  });
}

/** Cross product as a tuple */
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mid3 = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

const WA_DEF = mercDef({
  build: whiteArcher,
  // The bow held low at her side, the drawing hand loose, chin up: never mirrored
  rest: {
    hips: { r: [0, 0.12, 0.02] },
    chest: { r: [-0.02, -0.1, -0.01] },
    head: { r: [-0.04, 0.1, 0.03] },
    thighL: { r: [-0.07, 0, 0] },
    shinL: { r: [0.06, 0, 0] },
    armR: { r: [-0.05, 0, 0.06] },
    foreR: { r: [-0.35, 0, 0] },
    armL: { r: [-0.15, 0, -0.08] },
    foreL: { r: [-0.15, 0, 0] }
  },
  idle: personIdle({
    cape: true,
    life: 0.8,
    more: (c) => {
      orbit(c, "leaf", WA_LEAVES, 1.25, 0.55);
      c.carry("halo", [0, 0, c.t * 0.18]);
      // The wings breathe open and shut
      const open = 0.08 * c.sin(0.9);
      c.add("wingR", [0, -open, -open * 0.6]);
      c.add("wingL", [0, open, open * 0.6]);
    }
  }),
  walk: march({ swingR: 0.4, swingL: 0.2, cape: true }),
  roar: warCry({ arm: "L", glow: ["halo", "wingR", "wingL"], cine: { quake: 0.05, vig: 0.5, vigCol: "#134e4a", lines: 0.8, flash: 0.35, flashCol: "#cffafe" } }),
  roarLabel: "Call the glades",
  attack: loose({ cine: { quake: 0.08, stop: 0.06, flash: 0.45, flashCol: "#cffafe", lines: 0.9, vig: 0.3, vigCol: "#134e4a" } }),
  attackLabel: "Starfall arrow",
  trail: { cape: true, extra: { hair: 0.1, quiver: 0.08, wingR: 0.1, wingL: 0.1 } },
  burst: { at: [0, 1.8, 1.6], color: "#cffafe", count: 70, speed: 2.6, spread: 0.5, size: 0.13, gravity: 1.2 },
  aura: aura("#f59e0b", "#cffafe", 0.5, 1.6, 4.2),
  height: 3.4,
  frame: [6.6, 3.2, 1.65],
  sparks: (c) => {
    c.spark(SPARK.mote, [0, 1.2, 0], 18, { color: "#cffafe", size: 0.05, speed: 0.35, rise: 0.9, reach: 0.9, spread: 1.2 });
    c.spark(SPARK.ember, [0, 0.4, 0], 10, { color: "#fde68a", size: 0.05, speed: 0.25, rise: 2.6, reach: 1.0, spread: 1.4 });
    c.spark(SPARK.wisp, [-0.55, 1.4, 0.3], 6, { color: "#a5f3fc", size: 0.08, speed: 0.15, rise: 0.4, reach: 0.3, spread: 0.2 });
  }
});
WA_DEF.springs = { ...WA_DEF.springs, hair: 50, quiver: 70, wingR: 40, wingL: 40 };

/** Sylvandale's mercenaries, common → legendary (rigged heroes, every copy in the same draws) */
export const SYLVANDALE_MERCS: Record<string, BossHeroDef> = {
  "merc-elf-initiate": GI_DEF,
  "merc-elf-warden": LW_DEF,
  "merc-elf-oracle": MO_DEF,
  "merc-elf-bladesinger": BS_DEF,
  "merc-elf-archer": WA_DEF
};
