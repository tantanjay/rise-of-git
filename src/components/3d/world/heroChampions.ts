import * as THREE from "three";
import { MOVE, TAU, V3 } from "./heroKit";
import { SPARK } from "./heroMaterials";
import { BossCtx, BossHeroDef } from "./heroRig";
import { blob, plate, seg, spike } from "./bossParts";
import { aura } from "./heroCreatures";
import { CHAMPION_SLOTS, type ChampionLooks } from "@/utils/champion";
import type { CivilizationType } from "@/types";
import {
  Joints,
  add,
  arm,
  belt,
  blade,
  cape,
  cross,
  cut,
  face,
  fist,
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
  sword,
  tallShield,
  thrust,
  trunk,
  invoke,
  warCry,
  beard
} from "./heroMercKit";

/* ------------------------------------------------------------------------- */
/* Champions in high graphics: one rigged hero, assembled from a part library */
/* ------------------------------------------------------------------------- */

/*
 * A kingdom's champion (GAME_GUIDE §13 *Champions*) is legendary-class: the top of the ladder, two steps above an epic
 * mercenary. It is built here from its civilization's part library, one option per slot of its rolled look (head, face,
 * body, armour, cloak, weapon, aura, mark), on the mercenary kit's person (`heroMercKit.ts`: the shared bones, idle,
 * march and strikes), so many champions marching at once share `BossBatch`'s draws: a copy costs its vertices and a CPU
 * pose, never a draw. Its model key is `champion:<civ>:<8 digits>` (utils/champion.ts `championModelType`): a
 * civilization change keeps the digits and re-dresses the same champion in the new civilization's parts.
 *
 * Every champion carries what makes legendary read at map distance: gilt or rune-lit armour, a glowing mark over its
 * heart, motes circling it, its embers and aura (no beam over a person). Rare or epic metal alone never would.
 */

interface CivKit {
  /** Build: joints for each body option (a man of height 1, a stocky dwarf, a tall elf, a hulking orc) */
  bodies: Array<() => Joints>;
  /** Skin, hair and iris for each face option */
  faces: Array<{ skin: string; hair: string; iris: string; beard?: number }>;
  ears: "round" | "elf" | "orc";
  tusks?: string;
  brow?: number;
  /** Armour options: the plate's colours and what it is made of, and the cloth under it */
  armours: Array<{ plate: string; plate2: string; bucket: "gold" | "iron" | "gloss"; under: string; trim: string }>;
  /** Cloak colours (the option picks its cut) */
  cloaks: Array<{ color: string; hem: string }>;
  /** What the head options are */
  helms: Array<"open" | "great" | "crown" | "hood" | "horned" | "winged" | "leaf">;
  /** Weapon options */
  weapons: Array<"sword_shield" | "greatsword" | "spear" | "axe" | "hammer" | "staff" | "bow_blade">;
  /** Aura options: its colour and its hot core */
  auras: Array<[string, string]>;
  /** The mark over its heart */
  marks: Array<"sun" | "leaf" | "rune" | "star" | "skull" | "eye">;
}

const KITS: Record<CivilizationType, CivKit> = {
  human: {
    bodies: [() => joints(1.22, 1.15), () => joints(1.28, 1.08), () => joints(1.18, 1.28), () => joints(1.25, 1.2)],
    faces: [
      { skin: "#e0ac83", hair: "#5a3a22", iris: "#3a5a8a" },
      { skin: "#c68a5a", hair: "#1f1a17", iris: "#3a2e24" },
      { skin: "#f0c8a0", hair: "#d6b25e", iris: "#3f7a5a" },
      { skin: "#8d5a3a", hair: "#2a1d14", iris: "#2a1f18" }
    ],
    ears: "round",
    armours: [
      { plate: "#e8b84a", plate2: "#c9922e", bucket: "gold", under: "#2f5bc0", trim: "#fde68a" },
      { plate: "#d4d8de", plate2: "#aeb5c0", bucket: "iron", under: "#7f1d1d", trim: "#e8b84a" },
      { plate: "#f5f5f4", plate2: "#c7ccd6", bucket: "gloss", under: "#1e3f94", trim: "#e8b84a" },
      { plate: "#4b5563", plate2: "#374151", bucket: "iron", under: "#b91c1c", trim: "#fde68a" }
    ],
    cloaks: [
      { color: "#2f5bc0", hem: "#fde68a" },
      { color: "#b91c1c", hem: "#e8b84a" },
      { color: "#f5f5f4", hem: "#e8b84a" },
      { color: "#1e3a8a", hem: "#d4d8de" }
    ],
    helms: ["open", "great", "crown", "winged"],
    weapons: ["sword_shield", "greatsword", "spear", "hammer"],
    auras: [
      ["#f59e0b", "#fef3c7"],
      ["#3b82f6", "#dbeafe"],
      ["#ef4444", "#fee2e2"],
      ["#eab308", "#fffbeb"]
    ],
    marks: ["sun", "star", "rune", "sun"]
  },
  elf: {
    bodies: [() => joints(1.28, 0.95), () => joints(1.34, 0.9), () => joints(1.24, 1.02), () => joints(1.3, 0.98)],
    faces: [
      { skin: "#f2d6c0", hair: "#f5f0dc", iris: "#3fb38a" },
      { skin: "#e8c4a6", hair: "#7a4a22", iris: "#5b9bd5" },
      { skin: "#d9b494", hair: "#1c2a3a", iris: "#8b5cf6" },
      { skin: "#c8a88a", hair: "#c0c8d0", iris: "#a3e635" }
    ],
    ears: "elf",
    armours: [
      { plate: "#e7d39a", plate2: "#c8a95a", bucket: "gold", under: "#2f6f4f", trim: "#f5f5dc" },
      { plate: "#dfe7ee", plate2: "#a9b8c6", bucket: "gloss", under: "#1f4f3a", trim: "#9fe8d8" },
      { plate: "#7fae6a", plate2: "#4f7a45", bucket: "gloss", under: "#e9e4cf", trim: "#e7d39a" },
      { plate: "#b8c2cc", plate2: "#8090a0", bucket: "iron", under: "#3a2a55", trim: "#c4b5fd" }
    ],
    cloaks: [
      { color: "#2f6f4f", hem: "#e7d39a" },
      { color: "#e9e4cf", hem: "#9fe8d8" },
      { color: "#3a2a55", hem: "#c4b5fd" },
      { color: "#7a5a2a", hem: "#a3e635" }
    ],
    helms: ["leaf", "open", "crown", "hood"],
    weapons: ["bow_blade", "spear", "sword_shield", "staff"],
    auras: [
      ["#34d399", "#ecfdf5"],
      ["#67e8f9", "#ecfeff"],
      ["#a78bfa", "#f5f3ff"],
      ["#bef264", "#f7fee7"]
    ],
    marks: ["leaf", "star", "leaf", "eye"]
  },
  dwarf: {
    bodies: [() => joints(0.98, 1.55, 0.72, 1.45), () => joints(0.92, 1.65, 0.7, 1.4), () => joints(1.02, 1.5, 0.74, 1.45), () => joints(0.95, 1.6, 0.72, 1.5)],
    faces: [
      { skin: "#d9a27a", hair: "#b45309", iris: "#3a2e24", beard: 0.9 },
      { skin: "#c48a62", hair: "#e5e7eb", iris: "#4a6a8a", beard: 1.1 },
      { skin: "#e0b08a", hair: "#3f2a1a", iris: "#3a2e24", beard: 0.75 },
      { skin: "#a8724e", hair: "#dc2626", iris: "#5a4a2a", beard: 1.0 }
    ],
    ears: "round",
    brow: 1.4,
    armours: [
      { plate: "#c08a3a", plate2: "#8a5a22", bucket: "gold", under: "#5a3a22", trim: "#fde68a" },
      { plate: "#9aa3ad", plate2: "#6b7480", bucket: "iron", under: "#7c2d12", trim: "#f59e0b" },
      { plate: "#d6b36a", plate2: "#a37a3a", bucket: "gold", under: "#1f2937", trim: "#fb923c" },
      { plate: "#525a66", plate2: "#363c46", bucket: "iron", under: "#78350f", trim: "#fbbf24" }
    ],
    cloaks: [
      { color: "#7c2d12", hem: "#fde68a" },
      { color: "#1f2937", hem: "#f59e0b" },
      { color: "#4a5a2a", hem: "#d6b36a" },
      { color: "#5a1e1e", hem: "#9aa3ad" }
    ],
    helms: ["winged", "great", "crown", "horned"],
    weapons: ["hammer", "axe", "sword_shield", "hammer"],
    auras: [
      ["#f97316", "#ffedd5"],
      ["#f59e0b", "#fef3c7"],
      ["#38bdf8", "#e0f2fe"],
      ["#ef4444", "#fee2e2"]
    ],
    marks: ["rune", "rune", "sun", "star"]
  },
  orc: {
    bodies: [() => joints(1.22, 1.4, 0.95, 1.3), () => joints(1.3, 1.35, 0.95, 1.25), () => joints(1.16, 1.55, 0.92, 1.3), () => joints(1.26, 1.45, 0.95, 1.35)],
    faces: [
      { skin: "#6b8e3a", hair: "#1c1917", iris: "#facc15" },
      { skin: "#4d7a45", hair: "#3f2a1a", iris: "#ef4444" },
      { skin: "#7a8a4a", hair: "#57534e", iris: "#f97316" },
      { skin: "#5a6e3a", hair: "#7f1d1d", iris: "#fde047" }
    ],
    ears: "orc",
    tusks: "#eae3cf",
    brow: 1.5,
    armours: [
      { plate: "#3f3f46", plate2: "#27272a", bucket: "iron", under: "#7f1d1d", trim: "#ef4444" },
      { plate: "#a16207", plate2: "#713f12", bucket: "gold", under: "#3f2a1a", trim: "#fde68a" },
      { plate: "#57534e", plate2: "#3a3634", bucket: "iron", under: "#14532d", trim: "#facc15" },
      { plate: "#1c1917", plate2: "#0c0a09", bucket: "gloss", under: "#991b1b", trim: "#f97316" }
    ],
    cloaks: [
      { color: "#7f1d1d", hem: "#3f3f46" },
      { color: "#3f2a1a", hem: "#a16207" },
      { color: "#1c1917", hem: "#ef4444" },
      { color: "#57534e", hem: "#facc15" }
    ],
    helms: ["horned", "open", "great", "crown"],
    weapons: ["axe", "hammer", "greatsword", "spear"],
    auras: [
      ["#ef4444", "#fecaca"],
      ["#f97316", "#ffedd5"],
      ["#b91c1c", "#fde68a"],
      ["#facc15", "#fef9c3"]
    ],
    marks: ["skull", "skull", "rune", "eye"]
  },
  arcane: {
    bodies: [() => joints(1.26, 1.05), () => joints(1.32, 0.98), () => joints(1.2, 1.15), () => joints(1.28, 1.1)],
    faces: [
      { skin: "#b8a8c8", hair: "#e9d5ff", iris: "#c084fc" },
      { skin: "#8a7a9a", hair: "#111827", iris: "#22d3ee" },
      { skin: "#d6c8e0", hair: "#4c1d95", iris: "#f0abfc" },
      { skin: "#6a5a7a", hair: "#f5f5f5", iris: "#a5f3fc" }
    ],
    ears: "elf",
    armours: [
      { plate: "#1e1b2e", plate2: "#0f0d1a", bucket: "gloss", under: "#4c1d95", trim: "#c084fc" },
      { plate: "#3b2f5a", plate2: "#241c3a", bucket: "iron", under: "#111827", trim: "#22d3ee" },
      { plate: "#c7b9e8", plate2: "#9a8ac0", bucket: "gloss", under: "#312e81", trim: "#f0abfc" },
      { plate: "#0b0a12", plate2: "#05040a", bucket: "gloss", under: "#7e22ce", trim: "#e9d5ff" }
    ],
    cloaks: [
      { color: "#4c1d95", hem: "#c084fc" },
      { color: "#111827", hem: "#22d3ee" },
      { color: "#701a75", hem: "#f0abfc" },
      { color: "#1e1b4b", hem: "#e9d5ff" }
    ],
    helms: ["hood", "crown", "great", "horned"],
    weapons: ["staff", "greatsword", "spear", "sword_shield"],
    auras: [
      ["#a855f7", "#f3e8ff"],
      ["#22d3ee", "#ecfeff"],
      ["#e879f9", "#fdf4ff"],
      ["#818cf8", "#eef2ff"]
    ],
    marks: ["eye", "star", "rune", "eye"]
  }
};

const MOTES = 7;
const kitOf = (civ: CivilizationType) => KITS[civ] ?? KITS.human;
const pick = <T>(list: T[], i: number) => list[((i % list.length) + list.length) % list.length];

/** The mark over its heart: raised in its armour's trim, its heart glowing in the aura's colour */
function mark(c: BossCtx, kind: CivKit["marks"][number], at: V3, trim: string, hot: string, bucket: string) {
  if (kind === "sun") {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      spike(c, bucket, add(at, [Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0]), [Math.cos(a), Math.sin(a), 0.15], 0.018, i % 2 ? 0.05 : 0.09, { color: trim, seg: 4 });
    }
  } else if (kind === "leaf") {
    blade(c, bucket, add(at, [0, -0.12, 0]), [0, 1, 0], [1, 0, 0], 0.28, 0.16, trim, { shape: "leaf", t: 0.014 });
  } else if (kind === "rune") {
    for (const [a, b] of [
      [[0, 0.13, 0], [0, -0.13, 0]],
      [[-0.08, 0.06, 0], [0.08, -0.04, 0]],
      [[0.08, 0.06, 0], [-0.04, 0.12, 0]]
    ] as Array<[V3, V3]>)
      seg(c, bucket, add(at, a), add(at, b), 0.018, 0.018, { color: trim, seg: 5 });
  } else if (kind === "star") {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + Math.PI / 2;
      spike(c, bucket, at, [Math.cos(a), Math.sin(a), 0.1], 0.03, 0.13, { color: trim, seg: 4 });
    }
  } else if (kind === "skull") {
    blob(c, "matte", add(at, [0, 0.02, 0]), [0.08, 0.085, 0.05], { color: "#eae3cf", wd: 9, hd: 6 });
    for (const s of [1, -1]) blob(c, "matte", add(at, [s * 0.03, 0.03, 0.035]), [0.02, 0.022, 0.02], { color: "#1c1917", wd: 5, hd: 4 });
  } else {
    // An eye: an almond of trim round a glowing iris
    c.k.add(bucket, new THREE.TorusGeometry(0.09, 0.016, 4, 20), at, undefined, { color: trim, scale: [1.3, 0.6, 1] });
  }
  c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.4 }, () => c.k.add("glow", new THREE.IcosahedronGeometry(kind === "eye" ? 0.045 : 0.055, 1), add(at, [0, 0, 0.03]), undefined, { color: hot, bright: 2.2 }));
}

/** Its head: skull and face, its hair or beard, then the helm option */
function head(c: BossCtx, J: Joints, K: CivKit, L: ChampionLooks, A: CivKit["armours"][number], col: string, hot: string) {
  const F = pick(K.faces, L.face);
  const helm = pick(K.helms, L.head);
  c.bone("head", [0, J.neck, 0], () => {
    const h0 = skull(c, J, F.skin);
    const closed = helm === "great";
    face(c, h0, J.hr, { skin: F.skin, iris: F.iris, ears: closed || helm === "hood" ? "none" : K.ears, tusks: K.tusks, brow: K.brow, eyes: !closed });
    if (F.beard) beard(c, [0, h0[1] - J.hr[1] * 0.55, h0[2] + J.hr[2] * 0.7], 0.09 * F.beard, [0.12 * F.beard, 0.11 * F.beard, 0.09 * F.beard], F.hair);
    const hairCap = () => blob(c, "fur", add(h0, [0, 0.03, -0.025]), [J.hr[0] * 1.05, J.hr[1] * 0.96, J.hr[2] * 1.02], { color: F.hair, wd: 12, hd: 8 });
    if (helm === "open") {
      hairCap();
      // A long braid down the back
      c.bone("braid", add(h0, [0, -0.02, -J.hr[2] * 0.9]), () => seg(c, "fur", add(h0, [0, -0.02, -J.hr[2] * 0.9]), add(h0, [0, -0.36, -J.hr[2] * 1.2]), 0.04, 0.02, { color: F.hair, seg: 6 }));
    } else if (helm === "great") {
      c.k.add(A.bucket, new THREE.SphereGeometry(J.hr[0] * 1.32, 20, 12), h0, undefined, { color: A.plate, scale: [1, 1.15, 1.05] });
      c.k.add("matte", new THREE.BoxGeometry(0.22, 0.024, 0.04), add(h0, [0, 0.0, J.hr[2] * 1.33]), undefined, { color: "#1c1917" });
      c.k.add(A.bucket, new THREE.CylinderGeometry(J.hr[0] * 1.28, J.hr[0] * 1.32, 0.07, 22, 1, true), add(h0, [0, J.hr[1] * 0.95, 0]), undefined, { color: A.trim });
      c.bone("plume", add(h0, [0, J.hr[1] * 1.2, -0.04]), () => {
        for (let i = 0; i < 4; i++) spike(c, "cloth", add(h0, [0, J.hr[1] * 1.2, -0.04 - i * 0.02]), norm([0, 0.6 - i * 0.25, -1]), 0.04 - i * 0.004, 0.32 - i * 0.03, { color: i % 2 ? col : hot, seg: 6 });
      });
    } else if (helm === "crown") {
      hairCap();
      c.k.add(A.bucket === "iron" ? "gold" : A.bucket, new THREE.CylinderGeometry(J.hr[0] * 1.08, J.hr[0] * 1.1, 0.06, 22, 1, true), add(h0, [0, J.hr[1] * 0.62, 0]), undefined, { color: A.trim });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        spike(c, "gold", add(h0, [Math.sin(a) * J.hr[0] * 1.08, J.hr[1] * 0.66, Math.cos(a) * J.hr[0] * 1.08]), [0, 1, 0], 0.022, i === 0 ? 0.16 : 0.09, { color: A.trim, seg: 4 });
      }
      c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.1, phase: 2 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.035), add(h0, [0, J.hr[1] * 0.68, J.hr[0] * 1.12]), undefined, { color: hot, bright: 2 }));
    } else if (helm === "hood") {
      c.k.add("cloth", new THREE.SphereGeometry(J.hr[0] * 1.35, 18, 12, 0, TAU, 0, Math.PI * 0.62), add(h0, [0, 0.02, -0.03]), undefined, { color: pick(K.cloaks, L.cloak).color, scale: [1, 1.2, 1.15] });
      spike(c, "cloth", add(h0, [0, J.hr[1] * 0.9, -J.hr[2] * 0.9]), norm([0, 0.3, -1]), 0.08, 0.28, { color: pick(K.cloaks, L.cloak).color, seg: 8 });
      c.k.add("glow", new THREE.TorusGeometry(J.hr[0] * 1.2, 0.012, 4, 24), add(h0, [0, 0.02, J.hr[2] * 0.4]), [0.25, 0, 0], { color: hot, bright: 1.5, scale: [1, 1.15, 1] });
    } else if (helm === "horned") {
      c.k.add(A.bucket, new THREE.SphereGeometry(J.hr[0] * 1.2, 18, 10, 0, TAU, 0, Math.PI * 0.42), add(h0, [0, 0.05, 0]), undefined, { color: A.plate, scale: [1, 1.1, 1.05] });
      for (const s of [1, -1]) {
        const root = add(h0, [s * J.hr[0] * 1.05, J.hr[1] * 0.45, 0]);
        seg(c, "matte", root, add(root, [s * 0.14, 0.12, -0.02]), 0.045, 0.035, { color: "#eae3cf", seg: 7 });
        seg(c, "matte", add(root, [s * 0.14, 0.12, -0.02]), add(root, [s * 0.18, 0.32, -0.08]), 0.035, 0.008, { color: "#d6cfb8", seg: 7 });
      }
    } else if (helm === "winged") {
      c.k.add(A.bucket, new THREE.SphereGeometry(J.hr[0] * 1.2, 18, 10, 0, TAU, 0, Math.PI * 0.44), add(h0, [0, 0.05, 0]), undefined, { color: A.plate, scale: [1, 1.12, 1.05] });
      seg(c, A.bucket, add(h0, [0, J.hr[1] * 0.2, J.hr[2] * 1.25]), add(h0, [0, -J.hr[1] * 0.5, J.hr[2] * 1.28]), 0.018, 0.014, { color: A.trim, seg: 5 });
      for (const s of [1, -1])
        for (let k = 0; k < 3; k++) blade(c, A.bucket === "iron" ? "gold" : A.bucket, add(h0, [s * J.hr[0] * 1.15, J.hr[1] * (0.35 - k * 0.12), -0.02]), norm([s * 0.5, 1 - k * 0.15, -0.35]), [0, 0, 1], 0.3 - k * 0.06, 0.09, A.trim, { shape: "leaf", t: 0.012 });
    } else {
      // A circlet of living leaves
      hairCap();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        blade(c, "gold", add(h0, [Math.sin(a) * J.hr[0] * 1.05, J.hr[1] * 0.55, Math.cos(a) * J.hr[0] * 1.05]), norm([Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3]), norm([Math.cos(a), 0, -Math.sin(a)]), 0.16, 0.07, A.trim, { shape: "leaf", t: 0.01 });
      }
    }
  });
}

/** What its sword hand holds, and its off hand (a shield or a free fist) */
function weapons(c: BossCtx, J: Joints, kind: CivKit["weapons"][number], A: CivKit["armours"][number], col: string, hot: string) {
  const metal = A.bucket === "gloss" ? "gloss" : A.bucket;
  const fistCol = A.plate2;
  const right = (wr: V3) => {
    if (kind === "sword_shield" || kind === "bow_blade") sword(c, wr, norm([0.05, 0.85, 0.5]), 1, fistCol, { blade: "#f5f5f4", guard: A.trim, grip: "#3a2a1a", pommel: hot, metal: "gold", bladeBucket: "iron", L: 0.95, w: 0.09, shape: kind === "bow_blade" ? "leaf" : "sword" }, metal);
    else if (kind === "greatsword") {
      sword(c, wr, norm([0.1, 0.95, 0.3]), 1, fistCol, { blade: "#e7e5e4", guard: A.trim, grip: "#3a2a1a", pommel: hot, metal: "gold", bladeBucket: "iron", L: 1.35, w: 0.12 }, metal);
      c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.2, phase: 1 }, () => c.k.along("glow", add(wr, norm([0.1, 0.95, 0.3]), 0.3), add(wr, norm([0.1, 0.95, 0.3]), 1.3), [0.012, 0.012], { color: hot, bright: 1.6 }));
    } else if (kind === "spear") {
      const d = norm([0.02, 1, 0.12]);
      fist(c, metal, wr, d, 1, fistCol, 1.1);
      shaft(c, wr, d, 0.7, 1.15, 0.028, "#5a3a22");
      blade(c, "iron", add(wr, d, 1.13), d, norm(cross(d, [0, 0, 1])), 0.36, 0.11, "#f5f5f4", { shape: "leaf" });
      c.k.add("gold", new THREE.CylinderGeometry(0.04, 0.035, 0.08, 10), add(wr, d, 1.12), undefined, { color: A.trim });
      c.bone("pennon", add(wr, d, 1.0), () => c.k.add("cloth", new THREE.PlaneGeometry(0.3, 0.16, 3, 1), add(add(wr, d, 1.0), [0, 0, -0.16]), [0, Math.PI / 2, 0], { color: col }));
    } else if (kind === "axe" || kind === "hammer") {
      const d = norm([0.05, 1, 0.25]);
      fist(c, metal, wr, d, 1, fistCol, 1.15);
      shaft(c, wr, d, 0.25, 0.95, 0.032, "#4a3420");
      const head0 = add(wr, d, 0.92);
      if (kind === "axe") {
        for (const s of [1, -1]) blade(c, "iron", head0, norm([s, 0, 0.1]), [0, 1, 0], 0.42, 0.42, "#d6d3d1", { shape: "axe", t: 0.03 });
      } else {
        c.k.add(metal, new THREE.BoxGeometry(0.46, 0.24, 0.24), head0, undefined, { color: A.plate });
        for (const s of [1, -1]) c.k.add("gold", new THREE.CylinderGeometry(0.13, 0.13, 0.04, 14), add(head0, [s * 0.24, 0, 0]), [0, 0, Math.PI / 2], { color: A.trim });
      }
      c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.3 }, () => c.k.add("glow", new THREE.IcosahedronGeometry(0.06, 1), add(head0, [0, 0, 0.14]), undefined, { color: hot, bright: 2 }));
    } else {
      // A staff crowned with a floating crystal
      const d = norm([0.03, 1, 0.1]);
      fist(c, metal, wr, d, 1, fistCol, 1.1);
      shaft(c, wr, d, 0.75, 1.0, 0.03, "#3b2f5a");
      const top = add(wr, d, 1.05);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        spike(c, "gold", add(top, [Math.cos(a) * 0.05, -0.05, Math.sin(a) * 0.05]), [Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4], 0.016, 0.18, { color: A.trim, seg: 4 });
      }
      c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 1.5 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.1), add(top, [0, 0.14, 0]), undefined, { color: hot, bright: 2.3, scale: [0.8, 1.4, 0.8] }));
    }
  };
  const left = (wr: V3) => {
    if (kind === "sword_shield") {
      blob(c, metal, wr, [0.07, 0.075, 0.075], { color: fistCol, wd: 8, hd: 6 });
      const n: V3 = norm([-0.35, 0.05, 1]);
      const { side, up } = tallShield(c, add(wr, [-0.1, 0.05, 0.12]), n, 0.5, 0.62, 0.22, col, A.trim, { rimBucket: "gold" });
      void side;
      c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.6, phase: 1 }, () => c.k.add("glow", new THREE.IcosahedronGeometry(0.07, 1), add(add(add(wr, [-0.1, 0.05, 0.12]), n, 0.08), up, 0.05), undefined, { color: hot, bright: 2.1 }));
    } else if (kind === "bow_blade") {
      // A recurve bow carried in the off hand
      blob(c, metal, wr, [0.06, 0.065, 0.065], { color: fistCol, wd: 8, hd: 6 });
      const pts: V3[] = Array.from({ length: 7 }, (_, i) => {
        const t = i / 6 - 0.5;
        return add(wr, [-0.02, t * 1.3, 0.12 - Math.abs(t) * 0.3 + Math.abs(t) ** 3 * 0.9]);
      });
      for (let i = 0; i < 6; i++) seg(c, "gold", pts[i], pts[i + 1], 0.024 - Math.abs(i - 2.5) * 0.003, 0.024 - Math.abs(i - 2.5) * 0.003, { color: A.trim, seg: 6 });
      seg(c, "glow", pts[0], pts[6], 0.005, 0.005, { color: hot, seg: 4 });
    } else if (kind === "spear") {
      roundShield(c, add(wr, [-0.08, 0.05, 0.12]), norm([-0.4, 0.05, 1]), 0.36, col, A.trim, A.plate, { rimBucket: "gold", studs: 8, studColor: A.trim });
    } else {
      fist(c, metal, wr, [0, 1, 0], -1, fistCol, 1.1);
    }
  };
  return { right, left };
}

/** A champion of `civ` wearing `looks`, as a rigged hero */
export function championDef(civ: CivilizationType, looks: ChampionLooks): BossHeroDef {
  const K = kitOf(civ);
  const J = pick(K.bodies, looks.body)();
  const A = pick(K.armours, looks.armour);
  const C = pick(K.cloaks, looks.cloak);
  const cut0 = looks.cloak % 4;
  const [col, hot] = pick(K.auras, looks.aura);
  const weapon = pick(K.weapons, looks.weapon);
  const markKind = pick(K.marks, looks.mark);
  const helm = pick(K.helms, looks.head);
  const tall = J.head + J.hr[1] + 0.3;

  const build = (c: BossCtx) => {
    legs(c, J, { thigh: A.under, thighBucket: "cloth", boot: A.plate2, bootBucket: A.bucket, plate: A.plate, plateBucket: A.bucket, thick: civ === "orc" || civ === "dwarf" ? 1.15 : 1 });
    orbiters(c, "mote", MOTES, J.chest + 0.5, (i, at) => {
      c.k.add("glow", new THREE.OctahedronGeometry(0.065), at, undefined, { color: i % 2 ? col : hot, bright: 1.9, scale: [0.9, 1.7, 0.9] });
    });
    c.bone("hips", [0, J.hip, 0], () => {
      // The skirt ends above the knee on a short-legged dwarf, at mid-thigh's length below it on everyone else
      skirt(c, J, A.under, J.hip + 0.16, Math.max(J.hip - 0.55, J.knee + 0.05 * J.h), 0.26, 0.36, { hem: A.trim });
      c.k.add(A.bucket, new THREE.CylinderGeometry(0.27 * J.w, 0.3 * J.w, 0.24, 20, 1, true), [0, J.hip, 0], undefined, { color: A.plate });
      belt(c, J, J.hip + 0.15, 0.27, A.plate2, A.trim, "gold");
      c.bone("chest", [0, J.chest, 0], () => {
        const t = trunk(c, J, A.plate, A.bucket, { broad: 1.12, deep: 1.08, belly: civ === "dwarf" ? 0.8 : undefined });
        mark(c, markKind, [0, J.chest + 0.42, t.front + 0.04], A.trim, hot, "gold");
        c.k.add("gold", new THREE.CylinderGeometry(0.17, 0.22, 0.14, 16), [0, J.sh + 0.09, 0], undefined, { color: A.trim });
        pauldrons(c, J, A.plate, A.bucket, 1.18, A.trim);
        for (const s of [1, -1]) spike(c, "gold", [s * (J.shX + 0.08), J.sh + 0.12, 0], [s * 0.5, 1, 0], 0.03, 0.16, { color: A.trim, seg: 6 });
        // The cloak's cut: long, short mantle, tattered, or a long one that flares
        if (cut0 === 0) cape(c, J, C.color, { y1: 0.2, R: 0.4, flare: 1.1 });
        else if (cut0 === 1) cape(c, J, C.color, { y1: J.hip - 0.1, R: 0.42, flare: 0.8 });
        else if (cut0 === 2) cape(c, J, C.color, { y1: 0.25, R: 0.4, tattered: true, flare: 1.2 });
        else cape(c, J, C.color, { y1: 0.12, R: 0.44, flare: 1.5 });
        const w = weapons(c, J, weapon, A, col, hot);
        arm(c, J, 1, { upper: A.plate, upperBucket: A.bucket, fore: A.plate2, foreBucket: A.bucket, thick: 1.05 }, (wr) => w.right(wr));
        arm(c, J, -1, { upper: A.plate, upperBucket: A.bucket, fore: A.plate2, foreBucket: A.bucket, thick: 1.05 }, (wr) => w.left(wr));
        head(c, J, K, looks, A, col, hot);
      });
    });
  };

  const extra: Record<string, number> = { ...(helm === "great" ? { plume: 0.1 } : {}), ...(helm === "open" ? { braid: 0.12 } : {}), ...(weapon === "spear" ? { pennon: 0.12 } : {}) };
  const attack =
    weapon === "spear"
      ? thrust({ shield: true, cine: { quake: 0.1, stop: 0.06, flash: 0.4, flashCol: hot, lines: 0.8, vig: 0.3, vigCol: "#1c1917" } })
      : weapon === "axe" || weapon === "hammer"
        ? slam({ cine: { quake: 0.16, stop: 0.08, flash: 0.45, flashCol: hot, lines: 0.85, vig: 0.35, vigCol: "#1c1917" } })
        : weapon === "staff"
          ? invoke({ staff: "R", cine: { quake: 0.08, flash: 0.5, flashCol: hot, lines: 0.7, vig: 0.4, vigCol: "#1e1b4b" } })
          : cut({ shield: weapon === "sword_shield", heavy: weapon === "greatsword" ? 1.35 : 1.15, cine: { quake: 0.12, stop: 0.07, flash: 0.45, flashCol: hot, lines: 0.8, vig: 0.3, vigCol: "#1c1917" } });
  const def = mercDef({
    build,
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
        orbit(c, "mote", MOTES, 1.2 * Math.max(0.9, J.w * 0.85), 0.5);
        if (helm === "great") c.add("plume", [0.06 * c.drift(0.8), 0, 0.08 * c.drift(0.7, 1)]);
        if (weapon === "spear") c.add("pennon", [0, 0.2 * c.drift(0.9), 0]);
      }
    }),
    walk: march({ swingL: weapon === "sword_shield" ? 0.15 : 0.45, swingR: 0.35, cape: true, weight: civ === "dwarf" || civ === "orc" ? 1.3 : 1.05 }),
    roar: warCry({ arm: "R", glow: ["mote"], cine: { quake: 0.06, vig: 0.5, vigCol: "#1c1917", lines: 0.8, flash: 0.35, flashCol: hot } }),
    roarLabel: "Battle cry",
    attack,
    attackLabel: "Champion's strike",
    trail: { cape: true, extra },
    burst: { at: [0.1, 0.4, 1.5], color: hot, count: 70, speed: 2.4, spread: 0.6, size: 0.14, gravity: 1.5 },
    aura: aura(col, hot, 0.5, 1.6, 4.2),
    height: Math.max(2.4, tall),
    frame: [6.4, 3.1, Math.max(1.2, tall * 0.48)],
    sparks: (c) => {
      c.spark(SPARK.mote, [0, 1.2, 0], 16, { color: hot, size: 0.05, speed: 0.35, rise: 0.9, reach: 0.9, spread: 1.2 });
      c.spark(SPARK.ember, [0, 0.4, 0], 10, { color: col, size: 0.05, speed: 0.25, rise: 2.6, reach: 1.0, spread: 1.4 });
    }
  });
  if (helm === "great") def.springs = { ...def.springs, plume: 50 };
  if (helm === "open") def.springs = { ...def.springs, braid: 45 };
  if (weapon === "spear") def.springs = { ...def.springs, pennon: 35 };
  return def;
}

/** "champion:<civ>:<8 digits>" → its civilization and looks (null for any other key) */
export function parseChampionType(type: string): { civ: CivilizationType; looks: ChampionLooks } | null {
  const m = /^champion:(human|elf|dwarf|orc|arcane):(\d{8})$/.exec(type);
  if (!m) return null;
  const looks = Object.fromEntries(CHAMPION_SLOTS.map((s, i) => [s, Number(m[2][i])])) as ChampionLooks;
  return { civ: m[1] as CivilizationType, looks };
}

const cache = new Map<string, BossHeroDef>();
/** The champion's rigged hero for a model key, built once */
export function championHero(type: string): BossHeroDef | undefined {
  if (cache.has(type)) return cache.get(type);
  const p = parseChampionType(type);
  if (!p) return undefined;
  const def = championDef(p.civ, p.looks);
  cache.set(type, def);
  return def;
}

const HELM_NAME: Record<CivKit["helms"][number], string> = { open: "bare head and braid", great: "great helm and plume", crown: "crowned", hood: "hood lit from within", horned: "horned helm", winged: "winged helm", leaf: "circlet of leaves" };
const WEAPON_NAME: Record<CivKit["weapons"][number], string> = { sword_shield: "sword and kite shield", greatsword: "rune-lit greatsword", spear: "spear, pennon and round shield", axe: "double axe", hammer: "war-hammer", staff: "crystal staff", bow_blade: "leaf-blade and bow" };
const CLOAK_CUT = ["long cape", "short mantle", "tattered cape", "flaring cape"];
const BUILD_NAME = ["balanced", "tall and lean", "broad", "towering"];

/** A hair colour in a word, by its hue and lightness */
function hairWord(hex: string): string {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl, THREE.SRGBColorSpace);
  if (hsl.h > 0.68 && hsl.h < 0.9 && hsl.s > 0.3) return hsl.l > 0.75 ? "lilac" : "violet";
  if (hsl.l > 0.75) return hsl.s > 0.4 && hsl.h < 0.2 ? "pale gold" : hsl.s > 0.1 ? "silver" : "white";
  if (hsl.l < 0.15) return "black";
  if (hsl.h > 0.45 && hsl.h < 0.68 && hsl.l < 0.3) return "blue-black";
  if ((hsl.h < 0.03 || hsl.h > 0.95) && hsl.s > 0.5) return "red";
  if (hsl.h < 0.1 && hsl.s > 0.7) return "copper";
  if (hsl.h < 0.18 && hsl.l > 0.45) return "golden";
  return hsl.s < 0.15 ? "grey" : "brown";
}

/** A civilization's part library in words, slot by slot (the Codex lists it) */
export function championLibrary(civ: CivilizationType): Record<(typeof CHAMPION_SLOTS)[number], string[]> {
  const K = kitOf(civ);
  return {
    head: K.helms.map((h) => HELM_NAME[h]),
    face: K.faces.map((f) => `${f.beard ? "bearded, " : ""}${hairWord(f.hair)} hair`),
    body: BUILD_NAME,
    armour: K.armours.map((a) => (a.bucket === "gold" ? "gilt plate" : a.bucket === "gloss" ? "polished plate" : "steel plate")),
    cloak: CLOAK_CUT,
    weapon: K.weapons.map((w) => WEAPON_NAME[w]),
    aura: K.auras.map(([c]) => `aura ${c}`),
    mark: K.marks.map((m) => `${m} mark`)
  };
}
