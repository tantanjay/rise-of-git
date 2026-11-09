import * as THREE from "three";
import { MOVE, TAU, V3 } from "./heroKit";
import { SPARK } from "./heroMaterials";
import { BossCtx, BossHeroDef } from "./heroRig";
import { blob, spike, stud } from "./bossParts";
import { aura } from "./heroCreatures";
import {
  Joints,
  add,
  arm,
  beard,
  belt,
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
  tallShield,
  trunk,
  warCry
} from "./heroMercKit";

/* ------------------------------------------------------------------------- */
/* Ironforge's mercenaries in high graphics, common → legendary                */
/* ------------------------------------------------------------------------- */

/*
 * Short, broad folk on the mercenary kit (`heroMercKit.ts`) with big heads and beards in locks (`beard0…`, swinging),
 * each on its rung: the Delver in leather with a plain pick, the Hearthguard's one accent (clan orange) and his war horn,
 * the Runesmith's steel and the sparks looping off his hammer, the Ironbreaker's glowing furnace and circling embers, the
 * Bronze Hold-King of the Hero Monument with his molten hammer raised, crown, ringed beard and cape.
 */

const SKIN = "#d9a07a";
const ORANGE = "#f97316";
const EMBER = "#fdba74";
const STEEL = "#a7adb6";
const STEEL2 = "#7d838c";
const BEARD = 3;

/** A dwarf: short legs, a broad trunk, a big head */
const dwarfJoints = (h = 0.85, w = 1.35) => joints(h, w, 0.72, 1.45);

/** A dwarf's head: a broad face under a heavy brow, a nose like a knot, and the beard in locks down the chest */
function dwarfHead(c: BossCtx, J: Joints, beardColor: string, o: { iris?: string; lens?: number[] } = {}) {
  const h0 = skull(c, J, SKIN, "matte", 1.25);
  face(c, h0, J.hr, { skin: SKIN, brow: 1.5, nose: 1.4, iris: o.iris });
  // The moustache over the mouth and the beard hanging from the chin
  for (const s of [1, -1]) blob(c, "fur", add(h0, [s * 0.05, -J.hr[1] * 0.38, J.hr[2] * 0.85]), [0.06, 0.025, 0.035], { color: beardColor, wd: 8, hd: 5, rot: [0, 0, s * 0.35] });
  blob(c, "fur", add(h0, [0, -J.hr[1] * 0.55, J.hr[2] * 0.55]), [J.hr[0] * 0.9, J.hr[1] * 0.45, J.hr[2] * 0.55], { color: beardColor, wd: 12, hd: 8 });
  beard(c, add(h0, [0, -J.hr[1] * 0.85, J.hr[2] * 0.62]), 0.07, o.lens ?? [0.13, 0.12, 0.1], beardColor, "fur");
  return h0;
}

/* ================================================================== */
/* Tunnel Delver (common)                                              */
/* ================================================================== */

const DV = { shirt: "#7c5a3a", apron: "#6b4a2e", apron2: "#5a3c24", trousers: "#4b5563", boot: "#3f2a1a", cap: "#5b3b22", haft: "#6b4423", pick: "#6b7280", beard: "#a0522d" };

function delver(c: BossCtx) {
  const J = dwarfJoints();
  legs(c, J, { thigh: DV.trousers, boot: DV.boot, thick: 1.0 });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, DV.shirt, J.hip + 0.1, J.hip - 0.12, 0.25, 0.28);
    belt(c, J, J.hip + 0.1, 0.26, DV.boot, "#6e6a64", "matte");
    c.bone("chest", [0, J.chest, 0], () => {
      const t = trunk(c, J, DV.shirt, "cloth", { broad: 1.0, belly: 0.9, deep: 1.1 });
      // The leather apron down his front, a bib to the chest
      c.k.add("matte", new THREE.CylinderGeometry(0.3, 0.33, 0.62, 16, 2, true, -0.8, 1.6), [0, J.hip + 0.0, 0.03], undefined, { color: DV.apron, scale: [1, 1, 0.92] });
      c.k.add("matte", new THREE.BoxGeometry(0.28, 0.3, 0.025), [0, t.y1 - 0.08, t.front + 0.02], [-0.08, 0, 0], { color: DV.apron2 });
      arm(c, J, 1, { upper: DV.shirt, fore: SKIN, foreBucket: "matte", thick: 1.15 }, (wr) => {
        // A miner's pick, its plain iron head dulled by the rock
        const d: V3 = norm([0, 1, 0.15]);
        fist(c, "matte", wr, d, 1, SKIN, 1.15);
        shaft(c, wr, d, 0.15, 0.62, 0.028, DV.haft);
        const top = add(wr, d, 0.6);
        c.k.add("matte", new THREE.CylinderGeometry(0.045, 0.045, 0.1, 10), top, undefined, { color: DV.pick });
        spike(c, "matte", add(top, [0, 0, 0.04]), norm([0, -0.15, 1]), 0.035, 0.32, { color: DV.pick, seg: 6 });
        spike(c, "matte", add(top, [0, 0, -0.04]), norm([0, -0.3, -1]), 0.03, 0.22, { color: DV.pick, seg: 6 });
      });
      arm(c, J, -1, { upper: DV.shirt, fore: SKIN, foreBucket: "matte", thick: 1.15 }, (wr) => openHand(c, "matte", add(wr, [0, -0.01, 0.02]), [0.6, 0.2, 0.2], [0.25, -0.8, 0.4], -1, SKIN, 0.6, 1.1));
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = dwarfHead(c, J, DV.beard);
        // A leather cap
        c.k.add("matte", new THREE.SphereGeometry(J.hr[0] * 1.08, 16, 8, 0, TAU, 0, Math.PI / 2), add(h0, [0, 0.02, -0.01]), undefined, { color: DV.cap, scale: [1, 0.85, 1.02] });
        c.k.add("matte", new THREE.TorusGeometry(J.hr[0] * 1.07, 0.018, 4, 20), add(h0, [0, 0.025, -0.01]), [Math.PI / 2, 0, 0], { color: DV.boot });
      });
    });
  });
}

const DV_DEF = mercDef({
  build: delver,
  rest: {
    hips: { r: [0, -0.08, 0.02] },
    chest: { r: [0.05, 0.1, -0.02] },
    head: { r: [0.02, -0.1, 0.03] },
    thighR: { r: [-0.05, 0, 0.03] },
    armR: { r: [-0.1, 0, 0.08] },
    foreR: { r: [-0.4, 0, 0] },
    armL: { r: [0.0, 0, -0.1] },
    foreL: { r: [-0.15, 0, 0] }
  },
  idle: personIdle({ beard: BEARD, life: 1.1 }),
  walk: march({ swingR: 0.3, stride: 0.75, weight: 1.3, len: 0.95 }),
  attack: cut({ heavy: 1.2, cine: { quake: 0.06, stop: 0.04, flash: 0.08, flashCol: "#e7e5e4" } }),
  attackLabel: "Pick strike",
  trail: { beard: BEARD },
  burst: { at: [0.1, 0.1, 0.9], color: "#a8a29e", count: 30, speed: 1.2, spread: 0.4, size: 0.12, gravity: 5 },
  height: 2.1,
  frame: [4.6, 2.0, 1.0]
});

/* ================================================================== */
/* Hearthguard (uncommon)                                              */
/* ================================================================== */

const HG = { mail: "#7a8089", mail2: "#636871", leather: "#3f2a1a", trousers: "#52525b", shield: "#57534e", horn: "#e7e5e4", haft: "#5b3b22", beard: "#7c2d12" };

function hearthguard(c: BossCtx) {
  const J = dwarfJoints();
  legs(c, J, { thigh: HG.trousers, boot: HG.leather });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, HG.mail, J.hip + 0.1, J.hip - 0.16, 0.26, 0.31, { bucket: "iron" });
    belt(c, J, J.hip + 0.1, 0.27, HG.leather, STEEL2);
    // The war horn at his belt
    c.bone("horn", [-0.28, J.hip + 0.08, 0.05], () => {
      c.k.along("matte", [-0.29, J.hip - 0.02, 0.12], [-0.33, J.hip - 0.2, -0.05], 0, { geo: new THREE.CylinderGeometry(0.045, 0.015, 1, 10), color: HG.horn });
      c.k.add("iron", new THREE.TorusGeometry(0.045, 0.01, 4, 12), [-0.29, J.hip - 0.02, 0.12], [0.6, 0, 0.2], { color: STEEL2 });
    });
    c.bone("chest", [0, J.chest, 0], () => {
      trunk(c, J, HG.mail, "iron", { broad: 1.05, belly: 0.8, deep: 1.1 });
      // The clan sash of orange across his chest
      c.k.along("cloth", [0.26, J.sh + 0.02, 0.08], [-0.24, J.hip + 0.12, 0.22], [0.1, 0.02], { color: ORANGE });
      pauldrons(c, J, HG.mail2, "iron", 0.9);
      arm(c, J, 1, { upper: HG.mail, upperBucket: "iron", fore: HG.leather, foreBucket: "matte", thick: 1.15 }, (wr) => {
        // A short war hammer
        const d: V3 = norm([0.05, 0.75, 0.66]);
        fist(c, "matte", wr, d, 1, HG.leather, 1.15);
        shaft(c, wr, d, 0.12, 0.42, 0.024, HG.haft);
        const top = add(wr, d, 0.42);
        c.k.add("iron", new THREE.BoxGeometry(0.12, 0.12, 0.24), top, undefined, { color: HG.mail2, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d)) });
      });
      arm(c, J, -1, { upper: HG.mail, upperBucket: "iron", fore: HG.leather, foreBucket: "matte", thick: 1.15 }, (wr) => {
        blob(c, "matte", wr, [0.065, 0.07, 0.07], { color: HG.leather, wd: 8, hd: 6 });
        // The tower shield: dark boards banded across in clan orange, an iron rim
        const n: V3 = norm([-0.15, 0, 1]);
        const o = add(wr, [0.0, 0.08, 0.13]);
        const { up, side } = tallShield(c, o, n, 0.6, 0.82, 0, HG.shield, STEEL2);
        c.k.add("cloth", new THREE.BoxGeometry(0.58, 0.1, 0.02), add(add(o, n, 0.045), up, 0.1), undefined, { color: ORANGE, quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...side), new THREE.Vector3(...up), new THREE.Vector3(...n))) });
        for (const k of [-1, 1]) for (const v of [-0.3, 0.3]) stud(c, "iron", add(add(add(o, n, 0.04), side, k * 0.22), up, v), n, 0.022, 0.014, { color: STEEL });
      });
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = dwarfHead(c, J, HG.beard);
        // A round helm with a nasal bar
        c.k.add("iron", new THREE.SphereGeometry(J.hr[0] * 1.12, 16, 8, 0, TAU, 0, Math.PI / 2), add(h0, [0, 0.02, -0.01]), undefined, { color: HG.mail2, scale: [1, 1.05, 1.02] });
        c.k.add("iron", new THREE.TorusGeometry(J.hr[0] * 1.11, 0.018, 4, 20), add(h0, [0, 0.025, -0.01]), [Math.PI / 2, 0, 0], { color: HG.mail });
        c.k.add("iron", new THREE.BoxGeometry(0.03, 0.11, 0.02), add(h0, [0, -0.02, J.hr[2] * 1.12]), undefined, { color: HG.mail });
      });
    });
  });
}

const HG_DEF = mercDef({
  build: hearthguard,
  rest: {
    hips: { r: [0, 0.1, 0.02] },
    chest: { r: [0.03, -0.1, -0.01] },
    head: { r: [0.05, 0.08, 0.03] },
    thighL: { r: [-0.06, 0, 0] },
    shinL: { r: [0.08, 0, 0] },
    armR: { r: [-0.15, 0, 0.06] },
    foreR: { r: [-0.25, 0, 0] },
    handR: { r: [0.15, 0, 0] },
    armL: { r: [-0.35, 0, 0.0] },
    foreL: { r: [-0.25, 0, 0] },
    handL: { r: [0.35, 0, 0] }
  },
  idle: personIdle({ beard: BEARD, more: (c) => c.add("horn", [0.06 * Math.sin(c.t * 1.7), 0, 0.05 * Math.sin(c.t * 1.2 + 1)]) }),
  walk: march({ swingL: 0, swingR: 0.4, stride: 0.75, weight: 1.3, len: 0.95 }),
  attack: cut({ shield: true, cine: { quake: 0.07, stop: 0.05, flash: 0.14, flashCol: "#fed7aa", vig: 0.12, vigCol: "#7c2d12" } }),
  attackLabel: "Hammer blow",
  trail: { beard: BEARD, extra: { horn: 0.1 } },
  burst: { at: [0.05, 0.2, 0.95], color: "#d6d3d1", count: 32, speed: 1.5, spread: 0.4, size: 0.1, gravity: 5 },
  height: 2.1,
  frame: [4.6, 2.0, 1.0]
});
HG_DEF.springs = { ...HG_DEF.springs, horn: 40 };

/* ================================================================== */
/* Runesmith (rare)                                                    */
/* ================================================================== */

const RS = { coat: "#1e3a8a", coat2: "#172f6e", apron: "#5b3b22", trousers: "#4b5563", boot: "#3f2a1a", haft: "#5b3b22", head: "#57534e", beard: "#d97706" };
const RS_SPARKS = 4;

function runesmith(c: BossCtx) {
  const J = dwarfJoints();
  legs(c, J, { thigh: RS.trousers, boot: RS.boot, plate: STEEL, plateBucket: "iron" });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, RS.coat2, J.hip + 0.1, J.hip - 0.18, 0.26, 0.31, { hem: STEEL });
    belt(c, J, J.hip + 0.1, 0.27, STEEL2, STEEL);
    c.bone("chest", [0, J.chest, 0], () => {
      const t = trunk(c, J, RS.coat, "cloth", { broad: 1.0, belly: 0.9, deep: 1.1 });
      c.k.add("matte", new THREE.CylinderGeometry(0.3, 0.34, 0.66, 16, 2, true, -0.75, 1.5), [0, J.hip - 0.02, 0.03], undefined, { color: RS.apron, scale: [1, 1, 0.92] });
      // Steel bosses on the apron's bib
      for (const s of [1, -1]) stud(c, "iron", [s * 0.1, t.y1 - 0.02, t.front + 0.03], [0, 0, 1], 0.025, 0.015, { color: STEEL });
      pauldrons(c, J, STEEL, "iron", 0.85, STEEL2);
      arm(c, J, 1, { upper: RS.coat, fore: RS.coat, cuff: STEEL, cuffBucket: "iron", thick: 1.15 }, (wr) => {
        // The rune hammer: a steel-banded haft, an anvil head with runes that pulse, sparks looping round it
        const d: V3 = norm([0, 1, 0.12]);
        fist(c, "matte", wr, d, 1, SKIN, 1.15);
        shaft(c, wr, d, 0.15, 0.58, 0.026, RS.haft);
        for (let i = 0; i < 3; i++) c.k.add("iron", new THREE.TorusGeometry(0.03, 0.008, 4, 10), add(wr, d, 0.15 + i * 0.13), [Math.PI / 2, 0, 0], { color: STEEL });
        const top = add(wr, d, 0.62);
        c.bone("hammer", top, () => {
          c.k.add("matte", new THREE.BoxGeometry(0.3, 0.15, 0.15), top, undefined, { color: RS.head });
          c.k.add("iron", new THREE.BoxGeometry(0.34, 0.035, 0.17), add(top, [0, 0.06, 0]), undefined, { color: STEEL });
          c.k.add("iron", new THREE.BoxGeometry(0.34, 0.035, 0.17), add(top, [0, -0.06, 0]), undefined, { color: STEEL });
          c.k.move({ kind: MOVE.pulse, amp: 0.5, speed: 2.0 }, () => {
            for (let i = 0; i < 3; i++) c.k.add("glow", new THREE.BoxGeometry(0.035, 0.05, 0.01), add(top, [(i - 1) * 0.08, 0, 0.08]), undefined, { color: EMBER, bright: 1.6 });
          });
          c.k.move({ kind: MOVE.spin, pivot: top, axis: [0.2, 1, 0.1], speed: 3.2 }, () => {
            for (let i = 0; i < RS_SPARKS; i++) {
              const a = (i / RS_SPARKS) * TAU;
              c.k.add("glow", new THREE.OctahedronGeometry(0.02), add(top, [Math.cos(a) * 0.26, 0.04 * Math.sin(a * 2), Math.sin(a) * 0.26]), undefined, { color: i % 2 ? EMBER : ORANGE, bright: 1.8 });
            }
          });
        });
      });
      arm(c, J, -1, { upper: RS.coat, fore: RS.coat, cuff: STEEL, cuffBucket: "iron", thick: 1.15 }, (wr) => openHand(c, "matte", add(wr, [0, 0, 0.03]), [0.5, 0.5, 0.2], [0.2, -0.3, 1], -1, SKIN, 0.4, 1.1));
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = dwarfHead(c, J, RS.beard);
        // A leather cap ringed with steel, a rune stone at the brow
        c.k.add("matte", new THREE.SphereGeometry(J.hr[0] * 1.08, 16, 8, 0, TAU, 0, Math.PI / 2), add(h0, [0, 0.02, -0.01]), undefined, { color: "#7c2d12", scale: [1, 0.85, 1.02] });
        c.k.add("iron", new THREE.TorusGeometry(J.hr[0] * 1.08, 0.016, 4, 20), add(h0, [0, 0.025, -0.01]), [Math.PI / 2, 0, 0], { color: STEEL });
        c.k.add("iron", new THREE.BoxGeometry(0.05, 0.05, 0.02), add(h0, [0, 0.05, J.hr[2] * 1.1]), [0, 0, Math.PI / 4], { color: STEEL });
      });
    });
  });
}

const RS_DEF = mercDef({
  build: runesmith,
  rest: {
    hips: { r: [0, -0.08, 0.02] },
    chest: { r: [0.04, 0.1, -0.02] },
    head: { r: [0.06, -0.1, 0.03] },
    armR: { r: [-0.15, 0, 0.08] },
    foreR: { r: [-0.5, 0, 0] },
    armL: { r: [-0.2, 0, -0.08] },
    foreL: { r: [-0.4, 0, 0] }
  },
  idle: personIdle({ beard: BEARD, more: (c) => c.add("hammer", null, null, 0, 0.3 * c.sin(2.0)) }),
  walk: march({ swingR: 0.25, stride: 0.75, weight: 1.3, len: 0.95 }),
  attack: slam({ cine: { quake: 0.08, stop: 0.05, flash: 0.25, flashCol: "#fdba74", vig: 0.15, vigCol: "#7c2d12" }, extra: { hit: { hammer: { g: 1.5, s: 0.15 } } } }),
  attackLabel: "Rune strike",
  trail: { beard: BEARD, extra: { hammer: 0.06 } },
  burst: { at: [0.1, 0.1, 0.9], color: "#fdba74", count: 40, speed: 1.8, spread: 0.4, size: 0.1, gravity: 3 },
  height: 2.2,
  frame: [4.6, 2.0, 1.0],
  sparks: (c) => c.spark(SPARK.ember, [0.3, 1.5, 0.3], 8, { color: "#fdba74", size: 0.04, speed: 0.35, rise: 0.6, reach: 0.25, spread: 0.2 })
});

/* ================================================================== */
/* Ironbreaker in Steam Plate (epic)                                   */
/* ================================================================== */

const IB = { plate: "#57534e", plate2: "#44403c", bronze: "#b45309", bronze2: "#92400e", maul: "#3f3a36", beard: "#9ca3af" };
const IB_EMBERS = 6;

function ironbreaker(c: BossCtx) {
  const J = joints(0.92, 1.6, 0.72, 1.4);
  legs(c, J, { thigh: IB.plate2, thighBucket: "iron", boot: IB.plate, bootBucket: "iron", plate: IB.plate, plateBucket: "iron", thick: 1.1 });
  orbiters(c, "ember", IB_EMBERS, J.chest + 0.25, (i, at) => {
    c.k.add("glow", new THREE.OctahedronGeometry(0.05), at, undefined, { color: i % 2 ? EMBER : ORANGE, bright: 1.8, scale: [0.9, 1.4, 0.9] });
  });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, IB.plate2, J.hip + 0.12, J.hip - 0.16, 0.3, 0.36, { bucket: "iron", hem: IB.bronze });
    belt(c, J, J.hip + 0.12, 0.31, IB.bronze2, IB.bronze, "gold");
    c.bone("chest", [0, J.chest, 0], () => {
      const t = trunk(c, J, IB.plate, "iron", { broad: 1.15, belly: 1.0, deep: 1.15 });
      // The furnace in his chest: a bronze-ringed grate over the glow
      const f: V3 = [0, J.chest + 0.28, t.front + 0.04];
      c.k.add("gold", new THREE.TorusGeometry(0.13, 0.03, 6, 22), f, undefined, { color: IB.bronze });
      c.k.move({ kind: MOVE.pulse, amp: 0.5, speed: 2.4 }, () => c.k.add("glow", new THREE.CylinderGeometry(0.11, 0.11, 0.02, 20), add(f, [0, 0, -0.01]), [Math.PI / 2, 0, 0], { color: ORANGE, bright: 1.8 }));
      for (let i = 0; i < 4; i++) c.k.add("iron", new THREE.BoxGeometry(0.2, 0.018, 0.02), add(f, [0, (i - 1.5) * 0.05, 0.015]), undefined, { color: IB.plate2 });
      pauldrons(c, J, IB.plate, "iron", 1.25, IB.bronze);
      // Vents on his back, breathing glow
      for (const s of [1, -1]) {
        const v: V3 = [s * 0.17, J.sh + 0.05, -t.front + 0.02];
        c.k.add("iron", new THREE.CylinderGeometry(0.05, 0.06, 0.26, 10), add(v, [0, 0.1, 0]), undefined, { color: IB.plate2 });
        c.k.add("gold", new THREE.TorusGeometry(0.055, 0.012, 4, 12), add(v, [0, 0.23, 0]), [Math.PI / 2, 0, 0], { color: IB.bronze });
        c.k.move({ kind: MOVE.pulse, amp: 0.6, speed: 1.7, phase: s }, () => c.k.add("glow", new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10), add(v, [0, 0.235, 0]), undefined, { color: EMBER, bright: 2 }));
      }
      arm(c, J, 1, { upper: IB.plate, upperBucket: "iron", fore: IB.plate2, foreBucket: "iron", thick: 1.35 }, (wr) => {
        // A great maul, its head banded in bronze and glowing at the seams
        const d: V3 = norm([0, 1, 0.15]);
        fist(c, "iron", wr, d, 1, IB.plate2, 1.4);
        shaft(c, wr, d, 0.2, 0.75, 0.032, "#3f2a1a");
        const top = add(wr, d, 0.82);
        c.k.add("iron", new THREE.BoxGeometry(0.42, 0.26, 0.26), top, undefined, { color: IB.maul });
        for (const x of [-0.14, 0.14]) c.k.add("gold", new THREE.BoxGeometry(0.035, 0.28, 0.28), add(top, [x, 0, 0]), undefined, { color: IB.bronze });
        c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 2.0 }, () => c.k.add("glow", new THREE.BoxGeometry(0.24, 0.04, 0.27), top, undefined, { color: ORANGE, bright: 1.6 }));
      });
      arm(c, J, -1, { upper: IB.plate, upperBucket: "iron", fore: IB.plate2, foreBucket: "iron", thick: 1.35 }, (wr) => {
        fist(c, "iron", wr, [0, 1, 0.3], -1, IB.plate2, 1.4);
        c.k.move({ kind: MOVE.pulse, amp: 0.5, speed: 2.6 }, () => c.k.add("glow", new THREE.IcosahedronGeometry(0.035, 1), add(wr, [0, 0.0, 0.08]), undefined, { color: EMBER, bright: 1.8 }));
      });
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = dwarfHead(c, J, IB.beard, { lens: [0.15, 0.13, 0.11] });
        // A closed helm of plate over the brow, the eyes glowing in its slit
        c.k.add("iron", new THREE.SphereGeometry(J.hr[0] * 1.16, 18, 10, 0, TAU, 0, Math.PI * 0.58), add(h0, [0, 0.02, -0.01]), undefined, { color: IB.plate, scale: [1, 1.05, 1.04] });
        c.k.add("gold", new THREE.TorusGeometry(J.hr[0] * 1.15, 0.02, 4, 22), add(h0, [0, -0.005, -0.01]), [Math.PI / 2, 0, 0], { color: IB.bronze });
        for (const s of [1, -1]) c.k.add("glow", new THREE.SphereGeometry(0.016, 6, 4), add(h0, [s * J.hr[0] * 0.36, J.hr[1] * 0.1, J.hr[2] * 0.98]), undefined, { color: EMBER, bright: 2.2 });
      });
    });
  });
}

const IB_DEF = mercDef({
  build: ironbreaker,
  rest: {
    hips: { r: [0, 0.08, 0] },
    chest: { r: [0.06, -0.08, 0] },
    head: { r: [0.08, 0.06, 0] },
    thighL: { r: [-0.08, 0, -0.04] },
    thighR: { r: [0.04, 0, 0.04] },
    armR: { r: [-0.1, 0, 0.12] },
    foreR: { r: [-0.45, 0, 0] },
    armL: { r: [-0.15, 0, -0.15] },
    foreL: { r: [-0.35, 0, 0] }
  },
  idle: personIdle({ beard: BEARD, life: 0.7, more: (c) => orbit(c, "ember", IB_EMBERS, 1.05, 0.7) }),
  walk: march({ swingR: 0.2, swingL: 0.4, stride: 0.7, weight: 1.6, len: 1.1 }),
  attack: slam({ cine: { quake: 0.15, stop: 0.07, flash: 0.35, flashCol: "#fdba74", lines: 0.5, vig: 0.3, vigCol: "#7c2d12" } }),
  attackLabel: "Furnace slam",
  trail: { beard: BEARD },
  burst: { at: [0, 0.1, 1.1], color: "#fb923c", count: 60, speed: 2.2, spread: 0.6, size: 0.13, gravity: 2.5 },
  aura: { embers: { inner: 0.45, outer: 1.3, height: 3.4, count: 30 }, color: "#a855f7", hot: "#fdba74" },
  height: 2.5,
  frame: [5.2, 2.3, 1.1],
  sparks: (c) => {
    c.spark(SPARK.smoke, [0, 1.75, -0.4], 8, { color: "#57534e", size: 0.5, speed: 0.12, rise: 1.4, reach: 0.3, spread: 0.3 });
    c.spark(SPARK.ember, [0, 1.3, 0], 10, { color: "#fdba74", size: 0.05, speed: 0.3, rise: 1.6, reach: 0.5, spread: 0.8 });
  }
});

/* ================================================================== */
/* The Bronze Hold-King (legendary)                                    */
/* ================================================================== */

const HK = { bronze: "#c2772a", bronze2: "#9a5a1e", gold: "#e8b84a", pale: "#fde68a", beard: "#e5e7eb", cape: "#a3472a", cape2: "#7c2d12", molten: "#fb923c", hot: "#fed7aa" };
const HK_MOTES = 8;
const HK_BEARD = 4;

function holdKing(c: BossCtx) {
  const J = joints(0.98, 1.55, 0.72, 1.45);
  legs(c, J, { thigh: HK.bronze2, thighBucket: "gold", boot: HK.bronze2, bootBucket: "gold", plate: HK.bronze, plateBucket: "gold", thick: 1.1 });
  orbiters(c, "mote", HK_MOTES, J.chest + 0.45, (i, at) => {
    c.k.add("glow", new THREE.OctahedronGeometry(0.06), at, undefined, { color: i % 2 ? HK.hot : HK.molten, bright: 1.9, scale: [0.9, 1.5, 0.9] });
  });
  c.bone("hips", [0, J.hip, 0], () => {
    skirt(c, J, HK.bronze, J.hip + 0.12, J.hip - 0.22, 0.3, 0.37, { bucket: "gold", hem: HK.gold });
    belt(c, J, J.hip + 0.12, 0.31, HK.gold, HK.pale, "gold");
    c.bone("chest", [0, J.chest, 0], () => {
      const t = trunk(c, J, HK.bronze, "gold", { broad: 1.12, belly: 1.0, deep: 1.12 });
      // An anvil emblem in gold on his breast, its heart glowing
      c.k.add("gold", new THREE.BoxGeometry(0.22, 0.08, 0.03), [0, J.chest + 0.3, t.front + 0.04], undefined, { color: HK.gold });
      c.k.add("gold", new THREE.BoxGeometry(0.1, 0.08, 0.03), [0, J.chest + 0.23, t.front + 0.03], undefined, { color: HK.gold });
      c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.6 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.045), [0, J.chest + 0.4, t.front + 0.05], undefined, { color: HK.hot, bright: 2, scale: [1, 1.4, 0.6] }));
      pauldrons(c, J, HK.bronze, "gold", 1.25, HK.gold);
      for (const s of [1, -1]) spike(c, "gold", [s * (J.shX + 0.1), J.sh + 0.1, 0], [s * 0.5, 1, 0], 0.04, 0.16, { color: HK.pale, seg: 6 });
      cape(c, J, HK.cape, { y1: 0.12, R: 0.42, flare: 1.0 });
      arm(c, J, 1, { upper: HK.bronze, upperBucket: "gold", fore: HK.bronze2, foreBucket: "gold", thick: 1.35 }, (wr) => {
        // The hammer of the monument: a gold-banded haft and a head of molten bronze
        const d: V3 = norm([0, 1, 0.08]);
        fist(c, "gold", wr, d, 1, HK.bronze2, 1.4);
        shaft(c, wr, d, 0.25, 0.8, 0.034, "#78350f");
        for (let i = 0; i < 3; i++) c.k.add("gold", new THREE.TorusGeometry(0.038, 0.01, 4, 12), add(wr, d, 0.2 + i * 0.18), [Math.PI / 2, 0, 0], { color: HK.gold });
        const top = add(wr, d, 0.88);
        c.bone("hammer", top, () => {
          c.k.add("gold", new THREE.BoxGeometry(0.5, 0.3, 0.3), top, undefined, { color: HK.bronze });
          for (const x of [-0.25, 0.25]) c.k.add("gold", new THREE.BoxGeometry(0.04, 0.34, 0.34), add(top, [x, 0, 0]), undefined, { color: HK.gold });
          c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 1.8 }, () => {
            c.k.add("glow", new THREE.BoxGeometry(0.42, 0.06, 0.31), top, undefined, { color: HK.molten, bright: 1.8 });
            for (const x of [-0.27, 0.27]) c.k.add("glow", new THREE.BoxGeometry(0.02, 0.22, 0.22), add(top, [x, 0, 0]), undefined, { color: HK.hot, bright: 2 });
          });
        });
      });
      arm(c, J, -1, { upper: HK.bronze, upperBucket: "gold", fore: HK.bronze2, foreBucket: "gold", thick: 1.35 }, (wr) => openHand(c, "gold", add(wr, [0, 0, 0.03]), [0.5, 0.5, 0.2], [0.2, -0.3, 1], -1, HK.bronze2, 0.5, 1.3));
      c.bone("head", [0, J.neck, 0], () => {
        const h0 = dwarfHead(c, J, HK.beard, { lens: [0.15, 0.14, 0.12, 0.1] });
        // Gold rings bound into the beard
        c.k.add("gold", new THREE.TorusGeometry(0.05, 0.014, 5, 14), add(h0, [0, -J.hr[1] * 0.95, J.hr[2] * 0.7]), [1.2, 0, 0], { color: HK.gold });
        // The crown: a gold band and its points, a molten gem at the front
        c.k.add("gold", new THREE.CylinderGeometry(J.hr[0] * 1.05, J.hr[0] * 1.1, 0.09, 22, 1, true), add(h0, [0, J.hr[1] * 0.75, 0]), undefined, { color: HK.gold });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          spike(c, "gold", add(h0, [Math.sin(a) * J.hr[0] * 1.05, J.hr[1] * 0.8, Math.cos(a) * J.hr[0] * 1.05]), [0, 1, 0], 0.03, 0.12, { color: HK.pale, seg: 4 });
        }
        c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.4 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.035), add(h0, [0, J.hr[1] * 0.75, J.hr[0] * 1.12]), undefined, { color: HK.molten, bright: 2.2, scale: [1, 1.4, 0.6] }));
        for (const s of [1, -1]) c.k.add("glow", new THREE.SphereGeometry(0.014, 6, 4), add(h0, [s * J.hr[0] * 0.36, J.hr[1] * 0.1, J.hr[2] * 0.98]), undefined, { color: HK.hot, bright: 1.8 });
      });
    });
  });
}

const HK_DEF = mercDef({
  build: holdKing,
  // The hammer raised high as the statue holds it, the other hand open: never mirrored
  rest: {
    hips: { r: [0, -0.06, 0.02] },
    chest: { r: [-0.04, 0.08, -0.02] },
    head: { r: [-0.08, -0.06, 0.02] },
    thighL: { r: [-0.1, 0, -0.03] },
    shinL: { r: [0.08, 0, 0] },
    armR: { r: [-2.5, 0, -0.15] },
    foreR: { r: [-0.35, 0, 0] },
    handR: { r: [-0.2, 0, 0] },
    armL: { r: [-0.25, 0, -0.15] },
    foreL: { r: [-0.35, 0, 0] }
  },
  idle: personIdle({ beard: HK_BEARD, cape: true, life: 0.7, more: (c) => orbit(c, "mote", HK_MOTES, 1.3, 0.5) }),
  walk: march({ swingR: 0, swingL: 0.3, stride: 0.75, weight: 1.4, len: 1.05 }),
  roar: warCry({ arm: "R", glow: ["hammer"], cine: { quake: 0.08, vig: 0.5, vigCol: "#7c2d12", lines: 0.8, flash: 0.35, flashCol: "#fed7aa" } }),
  roarLabel: "Mountain's call",
  attack: slam({ cine: { quake: 0.18, stop: 0.08, flash: 0.5, flashCol: "#fed7aa", lines: 0.8, vig: 0.35, vigCol: "#7c2d12" }, extra: { hit: { hammer: { g: 1.8, s: 0.15 } } } }),
  attackLabel: "Mountain's wrath",
  trail: { cape: true, beard: HK_BEARD, extra: { hammer: 0.06 } },
  burst: { at: [0, 0.1, 1.2], color: "#fb923c", count: 70, speed: 2.5, spread: 0.6, size: 0.14, gravity: 2 },
  aura: aura("#f59e0b", "#fed7aa", 0.5, 1.6, 4.2),
  height: 2.9,
  frame: [6.0, 2.7, 1.3],
  sparks: (c) => {
    c.spark(SPARK.ember, [0.35, 2.6, 0.2], 14, { color: "#fdba74", size: 0.05, speed: 0.4, rise: 1.2, reach: 0.4, spread: 0.4 });
    c.spark(SPARK.mote, [0, 1.0, 0], 16, { color: "#fde68a", size: 0.05, speed: 0.35, rise: 0.9, reach: 0.9, spread: 1.2 });
    c.spark(SPARK.ember, [0, 0.4, 0], 10, { color: "#fb923c", size: 0.05, speed: 0.25, rise: 2.4, reach: 1.0, spread: 1.4 });
  }
});

/** Ironforge's mercenaries, common → legendary (rigged heroes, every copy in the same draws) */
export const IRONFORGE_MERCS: Record<string, BossHeroDef> = {
  "merc-dwarf-delver": DV_DEF,
  "merc-dwarf-hearthguard": HG_DEF,
  "merc-dwarf-runesmith": RS_DEF,
  "merc-dwarf-ironbreaker": IB_DEF,
  "merc-dwarf-holdking": HK_DEF
};
