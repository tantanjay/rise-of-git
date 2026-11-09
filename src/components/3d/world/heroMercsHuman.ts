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
  basis,
  belt,
  blade,
  cape,
  cut,
  face,
  fist,
  joints,
  legs,
  march,
  mercDef,
  norm,
  openHand,
  orbit,
  orbiters,
  pauldrons,
  personIdle,
  shaft,
  skirt,
  skull,
  slam,
  sword,
  tabard,
  tallShield,
  thrust,
  trunk,
  invoke,
  warCry
} from "./heroMercKit";

/* ------------------------------------------------------------------------- */
/* Valoria's mercenaries in high graphics, common → legendary                  */
/* ------------------------------------------------------------------------- */

/*
 * Rigged heroes on the mercenary kit (`heroMercKit.ts`), each at its Normal rig's size facing +z, strictly on its rung:
 * the Levy matte and plain, the Shieldbearer one accent (Dawn Banner blue) and a pennant, the Friar steel trim and his
 * censer's one looping light, the Paladin bigger, glowing and circled by sun motes, Ser Aldric the gilded knight of the
 * Hero Monument in gold with his cape, sunburst shield and halo of rays.
 */

const SKIN = "#e0ac83";
const SKIN2 = "#c68a5a";
const BLUE = "#2f5bc0";
const BLUE2 = "#1e3f94";
const GOLD = "#e8b84a";
const PALE = "#fde68a";
const STEEL = "#b8bec8";
const STEEL2 = "#8d939c";

/** A man's face with his hair (a short crop under a hat, or loose) */
function headOf(c: BossCtx, J: Joints, skin: string, hair: string | null, o: { eyes?: boolean } = {}) {
  const h0 = skull(c, J, skin);
  face(c, h0, J.hr, { skin, eyes: o.eyes });
  if (hair) blob(c, "fur", add(h0, [0, 0.03, -0.025]), [J.hr[0] * 1.04, J.hr[1] * 0.95, J.hr[2] * 1.0], { color: hair, wd: 12, hd: 8 });
  return h0;
}

/* ================================================================== */
/* Village Levy (common)                                               */
/* ================================================================== */

const LV = { jerkin: "#a89070", jerkin2: "#8a7556", breeches: "#7a6a52", boot: "#4a3b2c", wraps: "#9c8a6c", belt: "#5b4636", straw: "#d6b25e", straw2: "#c49a48", ash: "#9a7a52", head: "#7d8088", hair: "#5a3a22" };

function levy(c: BossCtx) {
  const J = joints(1, 1);
  legs(c, J, { thigh: LV.breeches, boot: LV.boot, wraps: LV.wraps });
  c.bone("hips", [0, J.hip, 0], () => {
    // The padded jerkin's skirt to mid-thigh, belted with a plain leather strap and a pouch
    skirt(c, J, LV.jerkin2, J.hip + 0.14, J.hip - 0.24, 0.24, 0.3);
    belt(c, J, J.hip + 0.12, 0.25, LV.belt, "#6e6a64", "matte");
    blob(c, "matte", [-0.2, J.hip + 0.02, 0.15], [0.06, 0.07, 0.045], { color: LV.belt, wd: 8, hd: 6 });
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, LV.jerkin, "cloth", { belly: 0.6 });
      // The quilting: stitched rows across the padding
      for (let i = 0; i < 4; i++) {
        const y = J.chest + 0.14 + i * 0.11;
        c.k.add("cloth", new THREE.TorusGeometry(0.255 - Math.abs(i - 1.5) * 0.02, 0.008, 3, 22), [0, y, 0.01], [Math.PI / 2, 0, 0], { color: LV.jerkin2, scale: [1, 0.76, 1] });
      }
      c.k.add("cloth", new THREE.TorusGeometry(0.1, 0.03, 5, 16), [0, J.sh + 0.06, 0], [Math.PI / 2, 0, 0], { color: LV.jerkin2 });
      arm(c, J, 1, { upper: LV.jerkin, fore: LV.jerkin }, (wr) => {
        // His spear held upright: a plain ash shaft, a leaf head of dull iron bound with cord
        const d: V3 = norm([0, 1, 0.06]);
        fist(c, "matte", wr, d, 1, SKIN, 1.05);
        shaft(c, wr, d, 0.95, 1.25, 0.024, LV.ash);
        const top = add(wr, d, 1.25);
        c.k.add("matte", new THREE.CylinderGeometry(0.028, 0.03, 0.08, 8), add(top, d, -0.02), undefined, { color: LV.belt });
        blade(c, "matte", add(top, d, 0.01), d, [1, 0, 0], 0.28, 0.08, LV.head, { shape: "leaf", t: 0.016 });
      });
      arm(c, J, -1, { upper: LV.jerkin, fore: LV.jerkin }, (wr) => openHand(c, "matte", add(wr, [0, -0.01, 0.02]), [0.6, 0.2, 0.2], [0.25, -0.8, 0.4], -1, SKIN, 0.55));
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = headOf(c, J, SKIN, LV.hair);
        // A wide straw hat, its brim a little ragged
        c.k.add("fur", new THREE.CylinderGeometry(0.26, 0.27, 0.025, 22), add(h0, [0, 0.1, -0.01]), [-0.08, 0, 0.05], { color: LV.straw });
        c.k.add("fur", new THREE.CylinderGeometry(0.1, 0.13, 0.14, 16), add(h0, [0, 0.18, -0.01]), [-0.08, 0, 0.05], { color: LV.straw2 });
        c.k.add("cloth", new THREE.TorusGeometry(0.13, 0.012, 3, 16), add(h0, [0, 0.13, -0.01]), [Math.PI / 2 - 0.08, 0, 0.05], { color: LV.belt });
      });
    });
  });
}

const LV_DEF = mercDef({
  build: levy,
  // The spear upright before him, weight on his left leg, the free hand loose: never mirrored
  rest: {
    hips: { r: [0, -0.08, 0.02] },
    chest: { r: [0.03, 0.08, -0.01] },
    head: { r: [0.05, -0.1, 0.03] },
    thighR: { r: [-0.04, 0, 0.02] },
    armR: { r: [-0.1, 0, 0.04] },
    foreR: { r: [-0.25, 0, 0] },
    armL: { r: [0.02, 0, -0.05] },
    foreL: { r: [-0.05, 0, 0] }
  },
  idle: personIdle({ life: 1.2 }),
  walk: march({ swingR: 0.25, lean: 0.05 }),
  attack: thrust({ cine: { quake: 0.04, stop: 0.03, flash: 0.08, flashCol: "#e7e5e4" } }),
  attackLabel: "Spear thrust",
  burst: { at: [0.3, 1.5, 1.4], color: "#d6d3d1", count: 26, speed: 1.1, spread: 0.3, size: 0.1, gravity: 4 },
  height: 2.6,
  frame: [5.2, 2.5, 1.25]
});

/* ================================================================== */
/* Dawn Banner Shieldbearer (uncommon)                                 */
/* ================================================================== */

const SB = { mail: "#868c95", mail2: "#6f757e", leather: "#3a2d24", leather2: "#4e3c2c", trousers: "#4b5563", sun: "#efe6d2", wood: "#6b4423" };

function shieldbearer(c: BossCtx) {
  const J = joints(1, 1.02);
  legs(c, J, { thigh: SB.trousers, boot: SB.leather, shin: SB.leather2, shinBucket: "matte" });
  c.bone("hips", [0, J.hip, 0], () => {
    // Mail to the thighs, the blue tabard over it front and back
    skirt(c, J, SB.mail, J.hip + 0.12, J.hip - 0.2, 0.25, 0.29, { bucket: "iron" });
    tabard(c, J, J.hip + 0.13, 0.22, 0.3, 0.52, BLUE, BLUE2);
    belt(c, J, J.hip + 0.13, 0.26, SB.leather, STEEL2);
    // The scabbard at his left hip
    c.k.along("matte", [-0.27, J.hip + 0.08, -0.06], [-0.37, J.hip - 0.55, -0.27], [0.06, 0.1], { color: SB.leather2 });
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, SB.mail, "iron", { broad: 1.05 });
      // The tabard's upper half with the dawn sun on his breast
      c.k.add("cloth", new THREE.CylinderGeometry(0.235, 0.27, 0.5, 18, 1, true, -0.95, 1.9), [0, J.chest + 0.3, 0.02], undefined, { color: BLUE, scale: [1, 1, 0.92] });
      stud(c, "cloth", [0, J.chest + 0.4, 0.27], [0, 0.05, 1], 0.07, 0.012, { color: SB.sun, wd: 10 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        spike(c, "cloth", [Math.cos(a) * 0.075, J.chest + 0.4 + Math.sin(a) * 0.075, 0.268], [Math.cos(a), Math.sin(a), 0.1], 0.016, 0.05, { color: SB.sun, seg: 4 });
      }
      c.k.add("iron", new THREE.CylinderGeometry(0.13, 0.17, 0.1, 14), [0, J.sh + 0.08, 0], undefined, { color: SB.mail2 });
      pauldrons(c, J, SB.mail2, "iron", 0.8);
      // The pennant of the Dawn Banner on a short pole at his back
      c.bone("pennant", [0.14, J.chest + 0.3, -0.26], () => {
        seg(c, "matte", [0.14, J.chest + 0.05, -0.26], [0.14, J.sh + 0.75, -0.3], 0.016, 0.014, { color: SB.wood, seg: 6 });
        blob(c, "iron", [0.14, J.sh + 0.77, -0.3], [0.025, 0.025, 0.025], { color: STEEL2, wd: 6, hd: 5 });
        c.k.move({ kind: MOVE.flutter, pivot: [0.14, J.sh + 0.6, -0.3], axis: [0, 0, 1], amp: 0.06, speed: 3.1 }, () =>
          c.k.add("cloth", new THREE.PlaneGeometry(0.34, 0.2, 4, 1), [0.31, J.sh + 0.6, -0.3], [0, Math.PI / 2 + 0.3, 0], { color: BLUE, surf: cloth(0.34, 0.2, true) })
        );
      });
      arm(c, J, 1, { upper: SB.mail, upperBucket: "iron", fore: SB.leather2, foreBucket: "matte", cuff: SB.leather }, (wr) =>
        sword(c, wr, norm([0.05, 0.75, 0.66]), 1, SB.leather, { blade: STEEL, guard: STEEL2, grip: SB.leather2, L: 0.78 }, "matte")
      );
      arm(c, J, -1, { upper: SB.mail, upperBucket: "iron", fore: SB.leather2, foreBucket: "matte", cuff: SB.leather }, (wr) => {
        // The kite shield strapped to his forearm: blue boards, the dawn sun painted on, an iron rim
        blob(c, "matte", wr, [0.06, 0.065, 0.065], { color: SB.leather, wd: 8, hd: 6 });
        const n: V3 = norm([-0.3, 0, 1]);
        const o = add(wr, [-0.08, 0.06, 0.1]);
        const { up } = tallShield(c, o, n, 0.5, 0.52, 0.3, BLUE, STEEL2);
        const sc = add(add(o, n, 0.045), up, 0.06);
        stud(c, "cloth", sc, n, 0.09, 0.01, { color: SB.sun, wd: 12 });
      });
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = headOf(c, J, SKIN, "#3b2a1c");
        // A kettle helm: a round cap with a broad brim
        c.k.add("iron", new THREE.SphereGeometry(0.128, 16, 8, 0, TAU, 0, Math.PI / 2), add(h0, [0, 0.025, -0.01]), undefined, { color: SB.mail2, scale: [1, 0.9, 1] });
        c.k.add("iron", new THREE.CylinderGeometry(0.2, 0.21, 0.02, 22), add(h0, [0, 0.03, -0.01]), [-0.06, 0, 0], { color: SB.mail });
        seg(c, "matte", add(h0, [-0.1, 0.0, 0.02]), add(h0, [0, -0.13, 0.06]), 0.008, 0.008, { color: SB.leather, seg: 4, cap: false });
      });
    });
  });
}

const SB_DEF = mercDef({
  build: shieldbearer,
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
  idle: personIdle({ tabard: true, more: (c) => c.add("pennant", [0.04 * c.drift(0.7), 0, 0.05 * c.drift(0.6, 1)]) }),
  walk: march({ swingL: 0.15, swingR: 0.5 }),
  attack: cut({ shield: true, cine: { quake: 0.07, stop: 0.05, flash: 0.15, flashCol: "#e5e7eb", vig: 0.12, vigCol: "#1e3a8a" } }),
  attackLabel: "Strike",
  trail: { tabard: true, extra: { pennant: 0.1 } },
  burst: { at: [0.05, 0.25, 1.05], color: "#d6d3d1", count: 32, speed: 1.5, spread: 0.4, size: 0.1, gravity: 5 },
  height: 2.6,
  frame: [5.2, 2.5, 1.25]
});
// The pennant follows through on a spring
SB_DEF.springs = { ...SB_DEF.springs, pennant: 45 };

/* ================================================================== */
/* Lantern Friar (rare)                                                */
/* ================================================================== */

const FR = { robe: "#6b4f3a", robe2: "#5a4130", rope: "#d6c7a8", steel: "#c7ccd6", steel2: "#9aa1ae", book: "#7f1d1d", page: "#efe6d2", light: "#fbbf24", hot: "#fde68a" };

function friar(c: BossCtx) {
  const J = joints(1, 1);
  // Sandalled feet under the habit
  legs(c, J, { thigh: FR.robe2, boot: "#3b2f26", thick: 0.85 });
  c.bone("hips", [0, J.hip, 0], () => {
    // The habit to the ground, a rope belt knotted with its ends hanging
    c.bone("habit", [0, J.hip, 0], () => {
      skirt(c, J, FR.robe, J.hip + 0.16, 0.05, 0.25, 0.46, { hem: FR.robe2 });
    });
    c.k.add("cloth", new THREE.TorusGeometry(0.26, 0.022, 5, 22), [0, J.hip + 0.13, 0], [Math.PI / 2, 0, 0], { color: FR.rope, scale: [1, 0.85, 1] });
    for (const x of [0.06, 0.1]) seg(c, "cloth", [x, J.hip + 0.11, 0.21], [x + 0.02, J.hip - 0.36, 0.25], 0.014, 0.012, { color: FR.rope, seg: 5 });
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, FR.robe, "cloth", { belly: 0.7 });
      // The cowl over his shoulders
      c.k.add("cloth", new THREE.CylinderGeometry(0.12, 0.31, 0.3, 20, 2, true), [0, J.sh + 0.03, -0.01], undefined, { color: FR.robe2, scale: [1, 1, 0.86] });
      // A steel holy sun on a chain over his breast
      seg(c, "iron", [-0.1, J.sh + 0.03, 0.12], [0, J.chest + 0.38, 0.23], 0.006, 0.006, { color: FR.steel2, seg: 4, cap: false });
      seg(c, "iron", [0.1, J.sh + 0.03, 0.12], [0, J.chest + 0.38, 0.23], 0.006, 0.006, { color: FR.steel2, seg: 4, cap: false });
      c.k.add("iron", new THREE.TorusGeometry(0.035, 0.008, 4, 14), [0, J.chest + 0.34, 0.235], undefined, { color: FR.steel });
      arm(c, J, 1, { upper: FR.robe, fore: FR.robe, bell: 0.11, cuff: FR.robe2 }, (wr) => {
        fist(c, "matte", add(wr, [0, -0.01, 0.01]), [0, 1, 0], 1, SKIN2, 0.95);
        // The censer on its chain, swinging from his fist: a steel-bound bowl and its pierced lid, the light breathing inside
        c.bone("censer", add(wr, [0, -0.03, 0.02]), () => {
          const top = add(wr, [0, -0.03, 0.02]);
          const o = add(top, [0, -0.5, 0]);
          for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) seg(c, "iron", top, add(o, [Math.cos(a) * 0.07, 0.08, Math.sin(a) * 0.07]), 0.005, 0.005, { color: FR.steel2, seg: 4, cap: false });
          c.k.add("iron", new THREE.SphereGeometry(0.11, 14, 6, 0, TAU, Math.PI / 2, Math.PI / 2), add(o, [0, 0.01, 0]), undefined, { color: "#6b6f78" });
          c.k.add("iron", new THREE.TorusGeometry(0.11, 0.014, 4, 18), add(o, [0, 0.01, 0]), [Math.PI / 2, 0, 0], { color: FR.steel });
          c.k.add("iron", new THREE.ConeGeometry(0.1, 0.13, 14, 1, true), add(o, [0, 0.08, 0]), undefined, { color: FR.steel2 });
          c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 2.4 }, () => c.k.add("glow", new THREE.IcosahedronGeometry(0.075, 1), add(o, [0, 0.03, 0]), undefined, { color: FR.light, bright: 1.5 }));
        });
      });
      arm(c, J, -1, { upper: FR.robe, fore: FR.robe, bell: 0.11, cuff: FR.robe2 }, (wr) => {
        // His little prayer book, steel at the corners, held open before his chest
        openHand(c, "matte", add(wr, [0, 0, 0.02]), [0.1, 1, 0.3], [0.3, 0, 1], -1, SKIN2, 0.2);
        const o = add(wr, [0.02, 0.05, 0.08]);
        c.k.frame(o, [-0.6, 0.3, 0], 1, () => {
          for (const s of [1, -1]) {
            c.k.add("matte", new THREE.BoxGeometry(0.12, 0.015, 0.17), [s * 0.062, 0, 0], [0, 0, -s * 0.12], { color: FR.book });
            c.k.add("matte", new THREE.BoxGeometry(0.1, 0.025, 0.15), [s * 0.055, 0.016, 0], [0, 0, -s * 0.12], { color: FR.page });
            for (const z of [-0.075, 0.075]) c.k.add("iron", new THREE.BoxGeometry(0.03, 0.02, 0.03), [s * 0.11, 0.0, z], [0, 0, -s * 0.12], { color: FR.steel });
          }
        });
      });
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = skull(c, J, SKIN2);
        face(c, h0, J.hr, { skin: SKIN2 });
        // The tonsure's ring of grey hair, half hidden by the deep hood
        c.k.add("fur", new THREE.TorusGeometry(J.hr[0] * 0.9, 0.022, 5, 18), add(h0, [0, 0.04, -0.01]), [Math.PI / 2 + 0.1, 0, 0], { color: "#8a8a8a" });
        c.k.add("cloth", new THREE.SphereGeometry(1, 16, 9, Math.PI / 2 + 0.75, TAU - 1.5, 0, Math.PI * 0.7), add(h0, [0, 0.01, -0.03]), undefined, { color: FR.robe2, scale: [0.16, 0.19, 0.175] });
      });
    });
  });
}

const FR_DEF = mercDef({
  build: friar,
  rest: {
    hips: { r: [0, 0.06, 0] },
    chest: { r: [0.06, -0.08, 0.01] },
    head: { r: [0.12, 0.1, -0.04] },
    armR: { r: [0.05, 0, 0.12] },
    foreR: { r: [0.05, 0, 0] },
    armL: { r: [-0.45, 0, -0.1] },
    foreL: { r: [-0.6, 0, 0] }
  },
  idle: personIdle({
    life: 0.8,
    more: (c) => {
      // The censer swings on its chain; the habit stirs
      c.add("censer", [0.35 * Math.sin(c.t * 2.0 + c.seed * 3), 0, 0.12 * Math.sin(c.t * 1.3 + c.seed)]);
      c.add("habit", [0.03 * c.drift(0.5), 0, 0.03 * c.drift(0.45, 1)]);
    }
  }),
  walk: march({ swingL: 0.1, swingR: 0.6, stride: 0.75 }),
  attack: invoke({ glow: ["censer"], cine: { quake: 0.04, flash: 0.3, flashCol: "#fef3c7", vig: 0.15, vigCol: "#78350f" } }),
  attackLabel: "Bless",
  trail: { extra: { censer: 0.12, habit: 0.08 } },
  burst: { at: [0.3, 1.0, 1.0], color: "#fde68a", count: 40, speed: 1.4, spread: 0.4, size: 0.1, gravity: -0.6 },
  height: 2.5,
  frame: [5.2, 2.5, 1.2],
  sparks: (c) => {
    // A thread of warm smoke and light curling up from the censer
    c.spark(SPARK.mote, [0.4, 1.1, 0.3], 8, { color: "#fde68a", size: 0.04, speed: 0.3, rise: 0.8, reach: 0.25, spread: 0.2 });
  }
});
FR_DEF.springs = { ...FR_DEF.springs, censer: 30, habit: 70 };

/* ================================================================== */
/* Dawnbreaker Paladin (epic)                                          */
/* ================================================================== */

const PL = { plate: "#d4d8de", plate2: "#aeb5c0", under: "#6b7280", leather: "#3a2d24", sun: "#fde047", hot: "#fef3c7" };
const PL_MOTES = 6;
/** The greatsword's line: up and out before him, so the left fist closes on the grip under the right */
const PL_GRIP: V3 = norm([0.35, 0.8, 0.45]);

function paladin(c: BossCtx) {
  const J = joints(1.12, 1.12);
  legs(c, J, { thigh: PL.under, thighBucket: "iron", boot: PL.plate2, bootBucket: "iron", plate: PL.plate, plateBucket: "iron" });
  orbiters(c, "mote", PL_MOTES, J.chest + 0.3, (i, at) => {
    c.k.add("glow", new THREE.OctahedronGeometry(0.06), at, undefined, { color: i % 2 ? PL.sun : PL.hot, bright: 1.7, scale: [0.9, 1.6, 0.9] });
  });
  c.bone("hips", [0, J.hip, 0], () => {
    // The blue surcoat to the knees over white plate tassets, a gold belt
    skirt(c, J, BLUE, J.hip + 0.14, J.hip - 0.48, 0.25, 0.33, { hem: GOLD });
    for (const s of [1, -1]) plate(c, "iron", [s * 0.24, J.hip - 0.02, 0.06], [s, 0.25, 0.25], [0, -1, 0.05], 0.12, 0.025, 0.15, { color: PL.plate });
    belt(c, J, J.hip + 0.13, 0.26, GOLD, PL.hot, "gold");
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, PL.plate, "iron", { broad: 1.12, deep: 1.1 });
      // Gold trim down the breastplate and the glowing sun-gem at its heart
      seg(c, "gold", [0, J.chest + 0.08, 0.25], [0, J.chest + 0.62, 0.23], 0.022, 0.02, { color: GOLD, seg: 6 });
      c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.6 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.06), [0, J.chest + 0.4, 0.27], undefined, { color: PL.sun, bright: 2, scale: [1, 1.4, 0.6] }));
      c.k.add("iron", new THREE.CylinderGeometry(0.15, 0.2, 0.12, 16), [0, J.sh + 0.08, 0], undefined, { color: PL.plate2 });
      pauldrons(c, J, PL.plate, "iron", 1.05, PL.plate2);
      for (const s of [1, -1]) c.k.add("gold", new THREE.TorusGeometry(0.15, 0.014, 4, 18, Math.PI), [s * (J.shX + 0.05), J.sh + 0.05 * J.h, 0], [0, Math.PI / 2, s * 0.35], { color: GOLD });
      cape(c, J, BLUE, { y1: 0.3, R: 0.36, flare: 0.8 });
      // The greatsword held before him in both hands, the right above the left on the long grip, its runed blade burning
      arm(c, J, 1, { upper: PL.plate, upperBucket: "iron", fore: PL.plate2, foreBucket: "iron", el: [-0.054, 0.047, 0.15], wr: [-0.328, 0.177, 0.18] }, (wr) => {
        const d = PL_GRIP;
        fist(c, "iron", wr, d, 1, PL.plate2, 1.15);
        seg(c, "matte", add(wr, d, -0.22), add(wr, d, 0.12), 0.022, 0.022, { color: PL.leather, seg: 6, cap: false });
        blob(c, "gold", add(wr, d, -0.25), [0.045, 0.045, 0.045], { color: GOLD, wd: 8, hd: 6 });
        const side = norm(cross3(d, [0, 0, 1]));
        const g = add(wr, d, 0.14);
        seg(c, "gold", add(g, side, -0.18), add(g, side, 0.18), 0.022, 0.022, { color: GOLD, seg: 6 });
        blade(c, "iron", add(g, d, 0.01), d, side, 1.15, 0.11, "#e5e7eb");
        c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.8 }, () => {
          for (let i = 0; i < 6; i++) c.k.add("glow", new THREE.BoxGeometry(0.03, 0.06, 0.02), add(add(g, d, 0.12 + i * 0.15), norm(cross3(d, side)), 0.012), undefined, { color: PL.sun, bright: 1.8, quat: basis(d, side) });
        });
      });
      arm(c, J, -1, { upper: PL.plate, upperBucket: "iron", fore: PL.plate2, foreBucket: "iron", el: [0.164, 0.027, 0.17], wr: [0.518, 0.062, 0.065] }, (wr) => fist(c, "iron", wr, PL_GRIP, -1, PL.plate2, 1.15));
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = skull(c, J, SKIN, "matte");
        // A closed helm, its visor slit glowing, gilt wings sweeping back from the temples
        c.k.add("iron", new THREE.SphereGeometry(J.hr[0] * 1.32, 18, 12), h0, undefined, { color: PL.plate, scale: [1, 1.15, 1.05] });
        c.k.add("glow", new THREE.BoxGeometry(0.2, 0.022, 0.04), add(h0, [0, 0.0, J.hr[2] * 1.3]), undefined, { color: PL.sun, bright: 1.6 });
        c.k.add("gold", new THREE.TorusGeometry(J.hr[0] * 1.33, 0.014, 4, 22), add(h0, [0, 0.05, 0]), [Math.PI / 2, 0, 0], { color: GOLD });
        for (const s of [1, -1])
          for (let k = 0; k < 3; k++)
            blade(c, "gold", add(h0, [s * 0.13, 0.05 + k * 0.03, -0.02]), norm([s * 0.4, 0.55 + k * 0.15, -0.7]), [0, 0, 1], 0.26 - k * 0.05, 0.05, GOLD, { shape: "leaf", t: 0.01 });
      });
    });
  });
}

/** Cross product as a tuple (the kit's `cross` takes the same; kept local for the rune strip's facing) */
function cross3(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const PL_DEF = mercDef({
  build: paladin,
  rest: {
    hips: { r: [0, -0.1, 0] },
    chest: { r: [0.02, 0.12, 0.01] },
    head: { r: [0.04, -0.08, 0.02] },
    thighL: { r: [-0.08, 0, -0.03] },
    shinL: { r: [0.1, 0, 0] },
    thighR: { r: [0.03, 0, 0.03] },
    armR: { r: [-0.03, 0, 0] },
    armL: { r: [-0.03, 0, 0] }
  },
  // His hands stay together on the grip: the arms only breathe with the body
  idle: personIdle({ cape: true, life: 0.5, twoHand: true, more: (c) => orbit(c, "mote", PL_MOTES, 1.05, 0.6) }),
  walk: march({ swingR: 0, swingL: 0, cape: true, weight: 1.2 }),
  attack: slam({ locked: true, cine: { quake: 0.12, stop: 0.06, flash: 0.35, flashCol: "#fef3c7", lines: 0.5, vig: 0.25, vigCol: "#78350f" } }),
  attackLabel: "Sunder",
  // Both arms trail alike, so the hands stay together on the grip through the swing
  trail: { cape: true, extra: { armL: 0.04, foreL: 0.055, handL: 0.075 } },
  burst: { at: [0, 0.3, 1.3], color: "#fde68a", count: 55, speed: 2.0, spread: 0.5, size: 0.12, gravity: 1.5 },
  aura: { embers: { inner: 0.45, outer: 1.3, height: 3.4, count: 30 }, color: "#a855f7", hot: "#fde68a" },
  height: 2.9,
  frame: [6.0, 2.9, 1.45],
  sparks: (c) => {
    c.spark(SPARK.mote, [0, 1.6, 0], 10, { color: "#fde68a", size: 0.05, speed: 0.3, rise: 1.2, reach: 0.6, spread: 0.8 });
  }
});

/* ================================================================== */
/* Ser Aldric, Champion of the Dawn Banner (legendary)                 */
/* ================================================================== */

const SA = { gold: GOLD, gold2: "#c9922e", pale: PALE, dark: "#3a2208", plume: "#dc2626", plume2: "#b91c1c", blue: BLUE, blue2: BLUE2, hot: "#fef3c7", sun: "#fde047" };
const SA_MOTES = 8;

function aldric(c: BossCtx) {
  const J = joints(1.25, 1.2);
  legs(c, J, { thigh: SA.gold2, thighBucket: "gold", boot: SA.gold2, bootBucket: "gold", plate: SA.gold, plateBucket: "gold" });
  orbiters(c, "mote", SA_MOTES, J.chest + 0.5, (i, at) => {
    c.k.add("glow", new THREE.OctahedronGeometry(0.07), at, undefined, { color: i % 2 ? SA.sun : SA.hot, bright: 1.9, scale: [0.9, 1.7, 0.9] });
  });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, SA.blue, J.hip + 0.16, J.hip - 0.6, 0.26, 0.36, { hem: SA.pale });
    c.k.add("gold", new THREE.CylinderGeometry(0.27 * J.w, 0.3 * J.w, 0.26, 20, 1, true), [0, J.hip + 0.0, 0], undefined, { color: SA.gold });
    belt(c, J, J.hip + 0.15, 0.27, SA.gold2, SA.hot, "gold");
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, SA.gold, "gold", { broad: 1.15, deep: 1.1 });
      // The sun in relief on his breastplate, its heart glowing
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        spike(c, "gold", [Math.cos(a) * 0.09, J.chest + 0.45 + Math.sin(a) * 0.09, 0.3], [Math.cos(a), Math.sin(a), 0.15], 0.02, i % 2 ? 0.06 : 0.1, { color: SA.pale, seg: 4 });
      }
      c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.4 }, () => c.k.add("glow", new THREE.IcosahedronGeometry(0.07, 1), [0, J.chest + 0.45, 0.3], undefined, { color: SA.hot, bright: 2.2 }));
      c.k.add("gold", new THREE.CylinderGeometry(0.17, 0.22, 0.14, 16), [0, J.sh + 0.09, 0], undefined, { color: SA.gold2 });
      pauldrons(c, J, SA.gold, "gold", 1.15, SA.gold2);
      for (const s of [1, -1]) spike(c, "gold", [s * (J.shX + 0.08), J.sh + 0.12, 0], [s * 0.5, 1, 0], 0.035, 0.18, { color: SA.pale, seg: 6 });
      cape(c, J, SA.blue, { y1: 0.2, R: 0.4, flare: 1.1 });
      // The halo of sun-rays behind his helm, turning slowly
      c.bone("halo", [0, J.head + 0.1, -0.42], () => {
        const o: V3 = [0, J.head + 0.1, -0.42];
        c.k.add("gold", new THREE.TorusGeometry(0.5, 0.022, 5, 40), o, undefined, { color: SA.pale });
        c.k.add("glow", new THREE.TorusGeometry(0.44, 0.012, 4, 36), o, undefined, { color: SA.sun, bright: 1.5 });
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          spike(c, "gold", add(o, [Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0]), [Math.cos(a), Math.sin(a), 0], 0.022, i % 2 ? 0.14 : 0.26, { color: SA.gold, seg: 4 });
        }
      });
      arm(c, J, 1, { upper: SA.gold, upperBucket: "gold", fore: SA.gold2, foreBucket: "gold", thick: 1.05 }, (wr) =>
        sword(c, wr, norm([0.05, 0.85, 0.5]), 1, SA.gold, { blade: "#f5f5f4", guard: SA.gold, grip: "#5a3a22", pommel: SA.pale, metal: "gold", bladeBucket: "iron", L: 1.0, w: 0.1 }, "gold")
      );
      arm(c, J, -1, { upper: SA.gold, upperBucket: "gold", fore: SA.gold2, foreBucket: "gold", thick: 1.05 }, (wr) => {
        // The sunburst shield: blue face, a gold rim, a gilt sun with a glowing heart and long rays
        blob(c, "gold", wr, [0.07, 0.075, 0.075], { color: SA.gold2, wd: 8, hd: 6 });
        const n: V3 = norm([-0.35, 0.05, 1]);
        const o = add(wr, [-0.1, 0.08, 0.13]);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
        c.k.add("matte", new THREE.CylinderGeometry(0.46, 0.46, 0.05, 32), o, undefined, { color: SA.blue, quat: q });
        c.k.add("gold", new THREE.TorusGeometry(0.46, 0.035, 6, 36), o, undefined, { color: SA.gold, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n)) });
        blob(c, "gold", add(o, n, 0.04), [0.13, 0.13, 0.13], { color: SA.gold, wd: 14, hd: 10 });
        const u = norm(cross3(n, [0, 1, 0]));
        const v = norm(cross3(u, n));
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          const dir = add(u.map((x) => x * Math.cos(a)) as V3, v.map((x) => x * Math.sin(a)) as V3);
          spike(c, "gold", add(add(o, n, 0.04), dir, 0.12), dir, 0.025, i % 2 ? 0.14 : 0.27, { color: SA.pale, seg: 4 });
        }
        c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.6, phase: 1 }, () => c.k.add("glow", new THREE.IcosahedronGeometry(0.075, 1), add(o, n, 0.13), undefined, { color: SA.hot, bright: 2.2 }));
      });
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = skull(c, J, SA.gold2, "gold");
        // The great helm of gold, its visor slit dark, a crown of points and a red plume
        c.k.add("gold", new THREE.SphereGeometry(J.hr[0] * 1.32, 20, 12), h0, undefined, { color: SA.gold, scale: [1, 1.15, 1.05] });
        c.k.add("matte", new THREE.BoxGeometry(0.22, 0.024, 0.04), add(h0, [0, 0.0, J.hr[2] * 1.33]), undefined, { color: SA.dark });
        c.k.add("gold", new THREE.CylinderGeometry(J.hr[0] * 1.28, J.hr[0] * 1.32, 0.07, 22, 1, true), add(h0, [0, J.hr[1] * 0.95, 0]), undefined, { color: SA.pale });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          spike(c, "gold", add(h0, [Math.sin(a) * J.hr[0] * 1.28, J.hr[1] * 1.0, Math.cos(a) * J.hr[0] * 1.28]), [0, 1, 0], 0.025, 0.1, { color: SA.pale, seg: 4 });
        }
        c.bone("plume", add(h0, [0, J.hr[1] * 1.2, -0.04]), () => {
          for (let i = 0; i < 4; i++) spike(c, "cloth", add(h0, [0, J.hr[1] * 1.2, -0.04 - i * 0.02]), norm([0, 0.6 - i * 0.25, -1]), 0.04 - i * 0.004, 0.32 - i * 0.03, { color: i % 2 ? SA.plume2 : SA.plume, seg: 6 });
        });
      });
    });
  });
}

const SA_DEF: BossHeroDef = mercDef({
  build: aldric,
  rest: {
    hips: { r: [0, 0.08, 0.02] },
    chest: { r: [0.02, -0.08, -0.01] },
    head: { r: [0.02, 0.1, 0.02] },
    thighL: { r: [-0.08, 0, 0] },
    shinL: { r: [0.08, 0, 0] },
    armR: { r: [-0.2, 0, 0.08] },
    foreR: { r: [-0.35, 0, 0] },
    handR: { r: [0.2, 0, 0] },
    armL: { r: [-0.25, 0, -0.05] },
    foreL: { r: [-0.2, 0, 0] },
    handL: { r: [0.3, 0, 0] }
  },
  idle: personIdle({
    cape: true,
    life: 0.8,
    more: (c) => {
      orbit(c, "mote", SA_MOTES, 1.25, 0.5);
      c.carry("halo", [0, 0, c.t * 0.2]);
      c.add("plume", [0.06 * c.drift(0.8), 0, 0.08 * c.drift(0.7, 1)]);
    }
  }),
  walk: march({ swingL: 0.15, swingR: 0.4, cape: true, weight: 1.1 }),
  roar: warCry({ arm: "R", glow: ["halo"], cine: { quake: 0.06, vig: 0.5, vigCol: "#78350f", lines: 0.8, flash: 0.35, flashCol: "#fef3c7" } }),
  roarLabel: "Rally the host",
  attack: cut({ shield: true, heavy: 1.2, cine: { quake: 0.12, stop: 0.07, flash: 0.45, flashCol: "#fef3c7", lines: 0.8, vig: 0.3, vigCol: "#78350f" } }),
  attackLabel: "Sunburst strike",
  trail: { cape: true, extra: { plume: 0.1 } },
  burst: { at: [0.1, 0.4, 1.5], color: "#fde68a", count: 70, speed: 2.4, spread: 0.6, size: 0.14, gravity: 1.5 },
  aura: aura("#f59e0b", "#fef3c7", 0.5, 1.6, 4.2),
  height: 3.4,
  frame: [6.6, 3.2, 1.65],
  sparks: (c) => {
    c.spark(SPARK.mote, [0, 1.2, 0], 18, { color: "#fde68a", size: 0.05, speed: 0.35, rise: 0.9, reach: 0.9, spread: 1.2 });
    c.spark(SPARK.ember, [0, 0.4, 0], 10, { color: "#fbbf24", size: 0.05, speed: 0.25, rise: 2.6, reach: 1.0, spread: 1.4 });
    c.spark(SPARK.wisp, [-0.5, 1.6, 0.4], 6, { color: "#fef3c7", size: 0.08, speed: 0.15, rise: 0.4, reach: 0.25, spread: 0.2 });
  }
});
SA_DEF.springs = { ...SA_DEF.springs, plume: 50 };

/** Valoria's mercenaries, common → legendary (rigged heroes, every copy in the same draws) */
export const VALORIA_MERCS: Record<string, BossHeroDef> = {
  "merc-human-levy": LV_DEF,
  "merc-human-shieldbearer": SB_DEF,
  "merc-human-friar": FR_DEF,
  "merc-human-paladin": PL_DEF,
  "merc-human-champion": SA_DEF
};
