import { CivilizationType } from "@/types";
import { hashString, mulberry32, Rng } from "@/utils/random";
import { ActorKind, AnimalKind, Builder, Part, PersonRole, emptyScene } from "./parts";
import { Add, AddOpts, V3, along, arc, lanternFrame, tail } from "@/components/3d/world/kitParts";
import { shade } from "@/components/3d/world/spawnModels";
import { LIGHT_HALOS, MOUNTS, SubPart, actorTemplate, armsPalette } from "./actorTemplates";

/*
 * HD versions of the actors (people, carried lights, animals, moving building parts), drawn by `ActorsHd.tsx` when
 * Graphics is HD. Normal keeps the templates in `actorTemplates.ts` untouched; each HD model is its own part list built
 * with the Builder and the model kit (shapes, `mat`, rest poses) in the actor's own frame (feet at the origin, facing
 * +z) at the same size and silhouette as its Normal template. Parts take a role from the walker they are built on
 * (`leg`, `arm` with what the hand holds, `head`, `trail`, `torso`, wings with `flap`), which the HD batch animates on
 * the GPU from each agent's stride and action.
 *
 * Colours: a fixed colour, or one of the actor's colour slots written `@slot` (`@slot*f` shaded by f), so one model
 * serves every tunic, skin, hair and accent the townsfolk wear. People's slots: 0 clothes / armour, 1 skin, 2 hair /
 * hat / hood, 3 accent (shield, beard, flower, staff orb); animals': 0 body, 1 legs / accents, 2 special.
 *
 * On the ladder the actors are commons (townsfolk, herds, wildlife): matte, well made, real materials; soldiers carry
 * real steel and iron, the lights and a stag's antlers keep their glow.
 */

export interface HdActorModel {
  parts: Part[];
  /** Two-legged: it leans into its walk, rolls over the supporting leg and turns its shoulders against its hips */
  biped: boolean;
  /** It has wings that beat (`wingLift`) */
  winged: boolean;
}

/** An actor colour slot, shaded by f */
const S = (slot: number, f = 1) => (f === 1 ? `@${slot}` : `@${slot}*${f.toFixed(3)}`);

/** A part colour: fixed, or one of the actor's slots shaded by f */
export function parseTint(color: string): { slot: number; f: number; color: string } {
  if (color[0] !== "@") return { slot: -1, f: 1, color };
  const [slot, f] = color.slice(1).split("*");
  return { slot: Number(slot), f: f ? Number(f) : 1, color: "#ffffff" };
}

/** A slot or fixed colour shaded by f */
const tone = (color: string, f: number) => {
  if (color[0] !== "@") return shade(color, f);
  const t = parseTint(color);
  return S(t.slot, t.f * f);
};

/** A builder for one actor, on a walker so its parts get their roles */
function start(biped: boolean) {
  const out = emptyScene();
  const w = new Builder(out).walker(0, 0, 0, "walk", 0.3, { biped });
  const add: Add = (shape, x, y0, z, wd, h, d, color, o) => w.add(shape, x, y0, z, wd, h, d, color, o);
  return { out, add };
}

/** `add` scaled by s about the actor's feet (pivots, hips, necks and tail roots too) */
function scaled(add: Add, s: number): Add {
  if (s === 1) return add;
  return (shape, x, y0, z, w, h, d, color, o = {}) =>
    add(shape, x * s, y0 * s, z * s, w * s, h * s, d * s, color, {
      ...o,
      hip: o.hip !== undefined ? o.hip * s : undefined,
      pivot: o.pivot ? [o.pivot[0] * s, o.pivot[1] * s] : undefined,
      head: o.head ? { y: o.head.y * s, z: (o.head.z ?? 0) * s } : undefined,
      trail: o.trail ? { ...o.trail, root: o.trail.root && [o.trail.root[0] * s, o.trail.root[1] * s, o.trail.root[2] * s] } : undefined,
      pose: o.pose ? { ...o.pose, at: [o.pose.at[0] * s, o.pose.at[1] * s, o.pose.at[2] * s] } : undefined
    });
}

/* ================================== PEOPLE ================================== */

/** A civilization's build (actor units, matching its Normal template's silhouette) */
interface Body {
  /** Top of the legs, their spread and thickness */
  hip: number;
  legX: number;
  legW: number;
  boot: [number, number, number];
  /** Torso from the waist to the chest (its shoulders) */
  waist: number;
  chest: number;
  torsoW: number;
  torsoD: number;
  /** A broad block of a torso (orcs) */
  box?: boolean;
  /** A robe from near the ground to `top` over the legs (elves, Nethergarde) */
  robe?: { y0: number; top: number; w: number; d: number };
  shoulder: number;
  shoulderX: number;
  armW: number;
  /** Fist height */
  hand: number;
  /** Head centre and size */
  head: number;
  headW: number;
  headH: number;
  ears: "round" | "long" | "point";
  nose: number;
  /** Trousers and boots */
  legs: string;
  boots: string;
}

const BODIES: Record<CivilizationType, Body> = {
  human: { hip: 0.24, legX: 0.055, legW: 0.085, boot: [0.095, 0.075, 0.15], waist: 0.2, chest: 0.52, torsoW: 0.27, torsoD: 0.21, shoulder: 0.48, shoulderX: 0.158, armW: 0.068, hand: 0.27, head: 0.625, headW: 0.2, headH: 0.215, ears: "round", nose: 0.042, legs: "#5b4330", boots: "#3f2a1a" },
  elf: { hip: 0.32, legX: 0.045, legW: 0.07, boot: [0.075, 0.06, 0.13], waist: 0.3, chest: 0.63, torsoW: 0.2, torsoD: 0.16, robe: { y0: 0.07, top: 0.58, w: 0.3, d: 0.26 }, shoulder: 0.6, shoulderX: 0.12, armW: 0.055, hand: 0.36, head: 0.735, headW: 0.18, headH: 0.21, ears: "long", nose: 0.034, legs: "#6b5a3e", boots: "#6b5a3e" },
  dwarf: { hip: 0.14, legX: 0.07, legW: 0.1, boot: [0.12, 0.075, 0.18], waist: 0.13, chest: 0.41, torsoW: 0.36, torsoD: 0.3, shoulder: 0.38, shoulderX: 0.2, armW: 0.088, hand: 0.17, head: 0.505, headW: 0.205, headH: 0.205, ears: "round", nose: 0.062, legs: "#4a3426", boots: "#3f2a1a" },
  orc: { hip: 0.27, legX: 0.085, legW: 0.12, boot: [0.14, 0.085, 0.19], waist: 0.24, chest: 0.64, torsoW: 0.4, torsoD: 0.28, box: true, shoulder: 0.6, shoulderX: 0.235, armW: 0.1, hand: 0.28, head: 0.745, headW: 0.24, headH: 0.225, ears: "point", nose: 0.05, legs: "#3a2f25", boots: "#292524" },
  arcane: { hip: 0.22, legX: 0.05, legW: 0.07, boot: [0.08, 0.05, 0.13], waist: 0.26, chest: 0.6, torsoW: 0.2, torsoD: 0.17, robe: { y0: 0.03, top: 0.56, w: 0.32, d: 0.28 }, shoulder: 0.57, shoulderX: 0.125, armW: 0.062, hand: 0.32, head: 0.70, headW: 0.18, headH: 0.19, ears: "round", nose: 0.036, legs: "#1e1b4b", boots: "#1c1917" }
};

/** A person's frame: `add`, and the options a part takes to ride its head, chest or a hand */
interface Frame {
  add: Add;
  B: Body;
  neck: AddOpts;
  hand: (side: -1 | 1) => AddOpts;
  /** Where a fist closes (before its arm's rest pose, which a held thing shares) */
  fist: (side: -1 | 1) => V3;
}

/**
 * A person of a civilization, as tall and broad as its Normal template: legs that step and boots, a tunic (or robe)
 * whose chest turns against the hips, a belt, arms with closed fists hanging relaxed and a little uneven, a neck and
 * an egg head with a face (eyes, brows in the hair colour, nose, mouth, the civilization's ears)
 */
function personFrame(add: Add, civ: CivilizationType, r: Rng): Frame {
  const B = BODIES[civ];
  const armPose = (side: -1 | 1) => ({ at: [side * B.shoulderX, B.shoulder, 0] as V3, rz: side * (0.06 + r() * 0.07), rx: -(0.04 + r() * 0.12) });
  const poses = { [-1]: armPose(-1), [1]: armPose(1) } as Record<-1 | 1, ReturnType<typeof armPose>>;
  const neckY = B.head - B.headH / 2;
  const neck: AddOpts = { head: { y: neckY }, pose: { at: [0, neckY, 0], rz: (r() - 0.5) * 0.12, ry: (r() - 0.5) * 0.3, rx: (r() - 0.4) * 0.1 } };
  const hand = (side: -1 | 1): AddOpts => ({ arm: side, hip: B.shoulder, pivot: [side * B.shoulderX, 0], pose: poses[side] });
  const fist = (side: -1 | 1): V3 => [side * B.shoulderX, B.hand, 0.01];
  return { add, B, neck, hand, fist };
}

function personBody(f: Frame, o: { tunic?: string; sleeves?: string; belt?: string; robeTrail?: boolean } = {}) {
  const { add, B, neck, hand } = f;
  const tunic = o.tunic ?? S(0);
  for (const side of [-1, 1] as const) {
    const leg = side < 0 ? 1 : -1;
    add("limb", side * B.legX, B.boot[1] * 0.6, 0, B.legW, B.hip - B.boot[1] * 0.6 + 0.03, B.legW * 1.1, B.legs, { leg, hip: B.hip, mat: "cloth" });
    add("egg", side * B.legX, 0, 0.025, B.boot[0], B.boot[1], B.boot[2], B.boots, { leg, hip: B.hip, mat: "leather" });
  }
  const span = B.chest - B.waist;
  if (B.robe) {
    // The robe hangs from the shoulders to the feet and sways back as they walk
    const R = B.robe;
    add("taper", 0, R.y0, 0, R.w, R.top - R.y0, R.d, tunic, { mat: "cloth", trail: o.robeTrail === false ? undefined : { lag: 0.08, damp: 0.75, root: [0, R.top, 0] } });
    add("limb", 0, R.top - 0.06, 0, B.torsoW, B.chest - R.top + 0.06, B.torsoD, tunic, { torso: true, mat: "cloth" });
  } else if (B.box) {
    add("box", 0, B.waist, 0, B.torsoW, span, B.torsoD, tunic, { torso: true, mat: "hide" });
  } else {
    // A skirt flaring to its hem under a chest broad at the shoulders
    add("taper", 0, B.waist - 0.02, 0, B.torsoW * 1.04, span * 0.5, B.torsoD * 1.06, tunic, { mat: "cloth" });
    add("limb", 0, B.waist + span * 0.3, 0, B.torsoW, span * 0.72, B.torsoD, tunic, { torso: true, mat: "cloth" });
  }
  if (!B.robe || o.belt) {
    const by = B.robe ? B.waist + span * 0.25 : B.waist + span * 0.3;
    // A round belt (a band round a block torso)
    const belt = o.belt ?? tone(tunic, 0.45);
    if (B.box) {
      // A wide dark war-belt round a block torso, a flap of darker hide hanging from it over the groin, and a polished
      // bone disc set off to one side (never a bright buckle at the crotch)
      const front = (B.torsoD + 0.1) / 2;
      add("box", 0, by - 0.01, 0, B.torsoW + 0.1, 0.06, B.torsoD + 0.1, belt, { mat: "leather" });
      add("box", 0, by - 0.17, front + 0.002, 0.15, 0.165, 0.02, tone(belt, 0.6), { mat: "hide" });
      add("sphere", -B.torsoW * 0.28, by, front + 0.006, 0.055, 0.045, 0.024, "#d6cfb8", { mat: "bone" });
    } else {
      add("cyl", 0, by, 0, B.torsoW * 1.04, 0.035, B.torsoD * 1.06, belt, { mat: "leather" });
      // The buckle stands proud of the belt
      add("box", 0, by - 0.005, B.torsoD * 0.53, 0.04, 0.045, 0.02, "#a8a29e", { mat: "dull" });
    }
  }
  for (const side of [-1, 1] as const) {
    const h = hand(side);
    const len = B.shoulder - B.hand;
    add("limb", side * B.shoulderX, B.hand + 0.02, 0, B.armW, len, B.armW * 1.1, o.sleeves ?? tunic, { ...h, mat: "cloth" });
    add("sphere", side * B.shoulderX * 0.96, B.shoulder - B.armW * 0.68, 0, B.armW * 1.28, B.armW * 1.28, B.armW * 1.32, o.sleeves ?? tunic, { ...h, mat: "cloth" }); // shoulder
    add("egg", side * B.shoulderX, B.hand - B.armW * 0.55, 0.008, B.armW * 1.05, B.armW * 1.2, B.armW * 1.15, S(1), { ...h, mat: "skin", rx: 0.15 }); // fist
  }
  add("cyl", 0, B.chest - 0.03, 0, B.headW * 0.42, B.head - B.headH / 2 - B.chest + 0.07, B.headW * 0.42, S(1, 0.92), { ...neck, mat: "skin" });
  add("egg", 0, B.head - B.headH / 2, 0, B.headW, B.headH, B.headW * 1.02, S(1), { ...neck, mat: "skin" });
}

/** The face on a person's head: eyes, brows (in the hair's colour), nose, mouth and the civilization's ears */
function personFace(f: Frame, o: { brows?: string; mouth?: boolean; tusks?: boolean; ears?: boolean } = {}) {
  const { add, B, neck } = f;
  const hw = B.headW;
  const hh = B.headH;
  const zf = hw * 0.5;
  const eyeY = B.head + hh * 0.06;
  const p = { ...neck };
  for (const side of [-1, 1] as const) {
    add("sphere", side * hw * 0.2, eyeY - 0.016, zf * 0.83, 0.034, 0.033, 0.03, "#1c1917", { ...p, mat: "gem" });
    along(add, "capsule", [side * hw * 0.34, eyeY + 0.03, zf * 0.66], [side * hw * 0.07, eyeY + 0.036, zf * 0.86], 0.02, 0.015, o.brows ?? S(2, 0.85), { ...p, mat: "fur" });
  }
  add("egg", 0, B.head - hh * 0.2, zf * 0.86, B.nose * 0.75, B.nose * 1.25, B.nose, S(1), { ...p, mat: "skin", rx: -0.2 });
  if (o.mouth !== false) along(add, "capsule", [-0.022, B.head - hh * 0.28, zf * 0.8], [0.022, B.head - hh * 0.28, zf * 0.8], 0.012, 0.01, S(1, 0.55), { ...p, mat: "skin" });
  if (o.tusks)
    for (const side of [-1, 1] as const) along(add, "cone", [side * 0.048, B.head - hh * 0.33, zf * 0.82], [side * 0.058, B.head - hh * 0.08, zf * 0.92], 0.028, 0.024, "#f5ecd6", { ...p, mat: "bone" });
  if (o.ears === false) return;
  for (const side of [-1, 1] as const) {
    if (B.ears === "round") add("egg", side * hw * 0.5, B.head - 0.035, -0.005, 0.03, 0.055, 0.042, S(1), { ...p, mat: "skin", rz: side * 0.15 });
    else if (B.ears === "long") along(add, "cone", [side * hw * 0.42, B.head - 0.01, -0.01], [side * (hw * 0.42 + 0.12), B.head + 0.055, -0.035], 0.04, 0.022, S(1), { ...p, mat: "skin" });
    else along(add, "cone", [side * hw * 0.44, B.head - 0.02, -0.01], [side * (hw * 0.44 + 0.075), B.head + 0.03, -0.03], 0.05, 0.026, S(1), { ...p, mat: "skin" });
  }
}

/** Hair over the crown and down the back of the head (short) */
function hairCap(f: Frame, color = S(2)) {
  const { add, B, neck } = f;
  add("sphere", 0, B.head - B.headH * 0.04, -0.022, B.headW * 1.07, B.headH * 0.6, B.headW * 1.07, color, { ...neck, mat: "fur" });
  add("egg", 0, B.head - B.headH * 0.48, -0.045, B.headW * 0.96, B.headH * 0.75, B.headW * 0.62, color, { ...neck, mat: "fur" });
}

/** A helm's dome over the head, down to the brow */
function helmDome(f: Frame, color: string, mat: NonNullable<AddOpts["mat"]> = "steel") {
  const { add, B, neck } = f;
  add("sphere", 0, B.head - B.headH * 0.02, -0.01, B.headW * 1.16, B.headH * 0.78, B.headW * 1.14, color, { ...neck, mat });
}

/** HD: a round shield strapped to the left forearm, face turned out: board, rim and boss */
function shieldOn(f: Frame, board: string, rim: string, r: number, mat: NonNullable<AddOpts["mat"]>, rimMat: NonNullable<AddOpts["mat"]>) {
  const { add, hand, fist } = f;
  const [x, y, z] = fist(-1);
  const c: V3 = [x - f.B.armW * 0.8, y + 0.08, z + 0.03];
  const o = hand(-1);
  add("cyl", c[0], c[1] - r / 2, c[2], 0.028, r, r, board, { ...o, mat, hdShape: "cyl", rz: 0 });
  arc(add, [c[0] - 0.01, c[1], c[2]], [0, 1, 0], [0, 0, 1], r / 2, 0, Math.PI * 2, 14, 0.026, rim, { ...o, mat: rimMat });
  add("sphere", c[0] - 0.022, c[1] - 0.025, c[2], 0.03, 0.05, 0.05, rim, { ...o, mat: rimMat }); // boss
}

function person(kind: ActorKind, civ: CivilizationType, role: PersonRole, tier: 0 | 1 | 2 | 3 = 0): Part[] {
  const { out, add } = start(true);
  const f = personFrame(add, civ, mulberry32(hashString(civ)));
  const { B, neck, hand, fist } = f;
  const hw = B.headW;
  const hh = B.headH;
  const top = B.head + hh / 2;
  if (civ === "human") {
    personBody(f, role === "soldier" ? { belt: "#3f2a1a" } : {});
    personFace(f);
    if (role === "villager") hairCap(f);
    else if (role === "farmer") {
      hairCap(f);
      // A wide straw hat with a band, and a hoe in the right hand
      add("cone", 0, B.head + hh * 0.18, 0, 0.44, 0.13, 0.44, S(2), { ...neck, mat: "wood" });
      add("cyl", 0, B.head + hh * 0.2, 0, 0.215, 0.03, 0.215, S(3), { ...neck, mat: "cloth" });
      const [x, y, z] = fist(1);
      along(add, "cyl", [x, 0.03, z + 0.16], [x, y + 0.26, z - 0.06], 0.025, 0.025, "#8b5a2b", { ...hand(1), mat: "wood" });
      along(add, "box", [x, 0.03, z + 0.16], [x, 0.0, z + 0.27], 0.09, 0.015, "#71717a", { ...hand(1), mat: "dull" });
    } else {
      // Knight: a kettle helm with a brim, mail on the shoulders, a spear and a heraldic round shield
      helmDome(f, "#9ca3af");
      add("cyl", 0, B.head + hh * 0.12, 0, hw * 1.42, 0.02, hw * 1.42, "#9ca3af", { ...neck, mat: "steel" });
      add("cone", 0, top + 0.03, -0.01, 0.07, 0.07, 0.07, "#9ca3af", { ...neck, mat: "steel" });
      for (const side of [-1, 1] as const) add("sphere", side * B.shoulderX * 0.95, B.shoulder - 0.06, 0, 0.11, 0.08, 0.13, "#a1a1aa", { ...hand(side), mat: "iron" });
      const [x, y, z] = fist(1);
      along(add, "cyl", [x, 0.02, z], [x, 1.0, z + 0.03], 0.03, 0.03, "#a8a29e", { ...hand(1), mat: "wood" });
      along(add, "blade", [x, 0.99, z + 0.03], [x, 1.16, z + 0.035], 0.02, 0.06, "#d4d4d8", { ...hand(1), mat: "steel" });
      along(add, "cyl", [x, 0.95, z + 0.028], [x, 1.0, z + 0.03], 0.04, 0.04, S(3), { ...hand(1), mat: "cloth" });
      void y;
      shieldOn(f, S(3), "#a1a1aa", 0.3, "wood", "iron");
    }
  } else if (civ === "elf") {
    personBody(f, { tunic: S(0), robeTrail: true });
    personFace(f, { brows: S(2, 0.9) });
    if (role !== "soldier") {
      // Long hair falling down the back, trailing as they walk
      add("sphere", 0, B.head - hh * 0.05, -0.025, hw * 1.08, hh * 0.65, hw * 1.08, S(2), { ...neck, mat: "fur" });
      tail(add, [0, B.head + 0.02, -0.06], { len: 0.3, w0: 0.13, w1: 0.08, n: 3, pitch: 1.35, curl: 0.15, lag: 0.08, step: 0.06, damp: 0.45, color: S(2), tip: S(2, 0.9) }, { mat: "fur" });
    }
    if (role === "farmer") {
      // A broad leaf hat with a flower
      add("sphere", 0, top - 0.01, 0, 0.26, 0.04, 0.26, "#4ade80", { ...neck, mat: "leaf" });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add("egg", 0.06 + Math.cos(a) * 0.03, top + 0.02, 0.08 + Math.sin(a) * 0.03, 0.04, 0.025, 0.04, S(3), { ...neck, mat: "cloth" });
      }
      add("sphere", 0.06, top + 0.03, 0.08, 0.025, 0.025, 0.025, "#fde047", { ...neck, mat: "cloth" });
    } else if (role === "soldier") {
      // Hooded archer: a hood with its point trailing, a longbow in the right hand, a quiver on the back
      add("egg", 0, B.head - hh * 0.4, -0.02, hw * 1.25, hh * 1.05, hw * 1.15, S(2), { ...neck, mat: "cloth" });
      add("drop", 0, top - 0.04, -0.07, 0.12, 0.2, 0.1, S(2), { ...neck, mat: "cloth", rx: -0.5 });
      add("egg", 0, B.chest - 0.08, -0.01, B.torsoW * 1.5, 0.12, B.torsoD * 1.5, S(2), { torso: true, mat: "cloth" }); // mantle
      const [x, y, z] = fist(1);
      arc(add, [x + 0.02, y + 0.05, z + 0.03], [0, 1, 0], [0.25, 0, 0.97], [0.42, 0.11], 0, Math.PI, 9, 0.026, "#a16207", { ...hand(1), mat: "wood" });
      along(add, "cyl", [x + 0.02, y - 0.37, z + 0.03], [x + 0.02, y + 0.47, z + 0.03], 0.007, 0.007, "#f5f5f4", { ...hand(1), mat: "cloth" });
      along(add, "cyl", [-0.05, 0.36, -0.1], [-0.05, 0.66, -0.17], 0.075, 0.075, "#78350f", { torso: true, mat: "leather" });
      for (const dx of [-0.02, 0.015]) along(add, "cone", [-0.05 + dx, 0.66, -0.17], [-0.05 + dx, 0.74, -0.19], 0.035, 0.035, S(3), { torso: true, mat: "cloth" });
    }
  } else if (civ === "dwarf") {
    personBody(f, { belt: "#78350f" });
    personFace(f, { mouth: false, brows: S(3, 0.9) });
    // A big beard (and moustache) over the chest, in the beard colour
    add("drop", 0, B.head - hh * 0.3 - 0.24, B.torsoD / 2 + 0.005, 0.21, 0.26, 0.1, S(3), { ...neck, mat: "fur", rx: Math.PI });
    add("egg", 0, B.head - hh * 0.5, hw * 0.3, hw * 0.9, hh * 0.45, hw * 0.55, S(3), { ...neck, mat: "fur" }); // the beard's root round the jaw
    for (const side of [-1, 1] as const) along(add, "capsule", [0, B.head - hh * 0.22, hw * 0.47], [side * 0.075, B.head - hh * 0.36, hw * 0.4], 0.035, 0.03, S(3), { ...neck, mat: "fur" });
    if (role === "villager") hairCap(f);
    else if (role === "farmer") {
      // Miner's cap with its lamp lit, and a pickaxe
      add("cyl", 0, B.head + hh * 0.2, -0.005, hw * 1.1, hh * 0.45, hw * 1.1, S(2), { ...neck, mat: "leather" });
      add("cyl", 0, B.head + hh * 0.2, 0.045, hw * 1.08, 0.018, hw * 1.12, S(2, 0.8), { ...neck, mat: "leather" }); // its peak
      add("sphere", 0, B.head + hh * 0.33, hw * 0.56, 0.06, 0.06, 0.045, "#fde047", { ...neck, glow: true });
      add("cyl", 0, B.head + hh * 0.28, hw * 0.52, 0.075, 0.08, 0.03, "#78350f", { ...neck, mat: "gold", rx: Math.PI / 2 });
      const [x, y, z] = fist(1);
      along(add, "cyl", [x, y - 0.06, z - 0.03], [x, y + 0.3, z + 0.1], 0.025, 0.025, "#8b5a2b", { ...hand(1), mat: "wood" });
      along(add, "horn", [x, y + 0.28, z + 0.08], [x, y + 0.22, z + 0.26], 0.03, 0.03, "#71717a", { ...hand(1), mat: "iron" });
      along(add, "cone", [x, y + 0.3, z + 0.09], [x, y + 0.36, z - 0.06], 0.03, 0.03, "#71717a", { ...hand(1), mat: "iron" });
    } else {
      // Horned helm and a battle axe
      helmDome(f, "#9ca3af");
      add("cyl", 0, B.head + hh * 0.1, 0, hw * 1.2, 0.03, hw * 1.18, "#78716c", { ...neck, mat: "iron" });
      for (const side of [-1, 1] as const) along(add, "horn", [side * hw * 0.48, B.head + hh * 0.25, 0], [side * (hw * 0.48 + 0.12), B.head + hh * 0.62, -0.02], 0.05, 0.05, "#f5ecd6", { ...neck, mat: "bone" });
      for (const side of [-1, 1] as const) add("sphere", side * B.shoulderX * 0.95, B.shoulder - 0.07, 0, 0.12, 0.08, 0.13, "#78716c", { ...hand(side), mat: "iron" });
      const [x, y, z] = fist(1);
      along(add, "cyl", [x, y - 0.06, z], [x, y + 0.36, z + 0.02], 0.03, 0.03, "#78350f", { ...hand(1), mat: "wood" });
      add("box", x, y + 0.22, z + 0.08, 0.02, 0.16, 0.13, "#d4d4d8", { ...hand(1), mat: "steel" });
      add("box", x, y + 0.22, z - 0.05, 0.02, 0.08, 0.06, "#d4d4d8", { ...hand(1), mat: "steel" });
    }
  } else if (civ === "orc") {
    personBody(f);
    personFace(f, { tusks: true });
    const knot = () => {
      add("sphere", 0, top - 0.04, -0.04, 0.1, 0.12, 0.1, S(2), { ...neck, mat: "fur" });
      tail(add, [0, top + 0.03, -0.08], { len: 0.18, w0: 0.06, w1: 0.04, n: 2, pitch: 1.2, lag: 0.08, step: 0.07, damp: 0.4, color: S(2) }, { mat: "fur" });
    };
    if (role === "villager") {
      knot();
      add("taper", 0, B.waist - 0.08, 0.04, B.torsoW * 0.8, 0.14, B.torsoD * 0.6, "#78350f", { mat: "hide", rx: Math.PI }); // loincloth
    } else if (role === "farmer") {
      knot();
      add("cyl", 0, B.head + hh * 0.18, 0.01, hw * 1.08, 0.035, hw * 1.06, "#f5ecd6", { ...neck, mat: "bone" });
      const [x, y, z] = fist(1);
      along(add, "cyl", [x, y - 0.08, z - 0.02], [x, y + 0.3, z + 0.1], 0.03, 0.03, "#5b3b22", { ...hand(1), mat: "wood" });
      add("egg", x, y + 0.26, z + 0.06, 0.1, 0.12, 0.1, "#f5ecd6", { ...hand(1), mat: "bone" }); // a bone club
    } else {
      // Spiked helm, shoulder spikes, a cleaver and a spiked hide shield
      add("cone", 0, B.head + hh * 0.05, 0.005, 0.27, 0.24, 0.27, "#44403c", { ...neck, mat: "iron" });
      for (const side of [-1, 1] as const) {
        add("sphere", side * B.shoulderX, B.shoulder - 0.08, 0, 0.15, 0.1, 0.16, "#57534e", { ...hand(side), mat: "iron" });
        along(add, "cone", [side * B.shoulderX, B.shoulder - 0.02, 0], [side * (B.shoulderX + 0.04), B.shoulder + 0.13, -0.01], 0.06, 0.06, "#d6d3d1", { ...hand(side), mat: "bone" });
      }
      const [x, y, z] = fist(1);
      along(add, "cyl", [x, y - 0.06, z], [x, y + 0.14, z + 0.02], 0.035, 0.035, "#3f2a1a", { ...hand(1), mat: "leather" });
      add("box", x, y + 0.12, z + 0.05, 0.025, 0.26, 0.15, "#a8a29e", { ...hand(1), mat: "iron" });
      shieldOn(f, S(3), "#57534e", 0.36, "hide", "iron");
      const [sx, sy, sz] = fist(-1);
      along(add, "cone", [sx - 0.12, sy + 0.06, sz + 0.03], [sx - 0.22, sy + 0.06, sz + 0.03], 0.05, 0.05, "#d6d3d1", { ...hand(-1), mat: "bone" });
    }
  } else {
    personBody(f, { tunic: S(0) });
    personFace(f);
    if (role === "villager") {
      // A soft hood over the head, open round the face
      add("egg", 0, B.head - hh * 0.42, -0.025, hw * 1.28, hh * 1.1, hw * 1.2, S(2), { ...neck, mat: "cloth" });
      add("egg", 0, B.chest - 0.06, -0.01, B.torsoW * 1.6, 0.1, B.torsoD * 1.6, S(2), { torso: true, mat: "cloth" });
    } else if (role === "farmer") {
      add("egg", 0, B.head - hh * 0.42, -0.025, hw * 1.25, hh * 1.05, hw * 1.18, S(2), { ...neck, mat: "cloth" });
      add("cone", 0, top - 0.02, -0.03, 0.17, 0.2, 0.17, S(2), { ...neck, mat: "cloth", rx: -0.25 });
      // A rod in the right hand with a glowing lamp-stone hanging from it
      const [x, y, z] = fist(1);
      along(add, "cyl", [x, y - 0.02, z], [x, y + 0.05, z + 0.12], 0.015, 0.015, "#27272a", { ...hand(1), mat: "wood" });
      along(add, "cyl", [x, y + 0.05, z + 0.12], [x, y - 0.08, z + 0.13], 0.006, 0.006, "#a8a29e", { ...hand(1), mat: "dull" });
      add("sphere", x, y - 0.16, z + 0.13, 0.075, 0.075, 0.075, S(3), { ...hand(1), glow: true });
    } else {
      // Battle-mage: a broad hat with a tall crooked point, and a staff with a glowing orb in gold prongs
      add("cyl", 0, B.head + hh * 0.3, 0, 0.36, 0.025, 0.36, S(2), { ...neck, mat: "cloth" });
      add("cyl", 0, B.head + hh * 0.3, 0, 0.2, 0.08, 0.2, S(2, 0.85), { ...neck, mat: "cloth" });
      along(add, "taper", [0, B.head + hh * 0.3 + 0.07, -0.01], [0, B.head + hh * 0.3 + 0.26, -0.05], 0.18, 0.18, S(2), { ...neck, mat: "cloth" });
      along(add, "cone", [0, B.head + hh * 0.3 + 0.25, -0.05], [0.02, B.head + hh * 0.3 + 0.38, -0.13], 0.1, 0.1, S(2), { ...neck, mat: "cloth" });
      const [x, y, z] = fist(1);
      along(add, "cyl", [x, 0.02, z], [x, 1.02, z + 0.04], 0.032, 0.032, "#2e1065", { ...hand(1), mat: "wood" });
      add("sphere", x, 1.03, z + 0.04, 0.12, 0.12, 0.12, S(3), { ...hand(1), glow: true });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        along(add, "horn", [x, 0.98, z + 0.04], [x + Math.cos(a) * 0.07, 1.13, z + 0.04 + Math.sin(a) * 0.07], 0.022, 0.022, "#d4a017", { ...hand(1), mat: "gold" });
      }
      void y;
    }
  }
  if (tier) armsHd(f, civ, tier);
  return out.parts;
}

/**
 * 🗡️ An Armory set on a soldier's HD body (GAME_GUIDE §13 *The Armory*), on the rarity ladder like its Normal gear
 * (`armsParts`): uncommon its accent in real cloth (a tabard, or a sash over a robe) and a small prop, rare real metal
 * (pauldrons on the shoulders, a crest), epic a cape that trails the walk and glowing details. Every part rides the body
 * part it sits on (chest, head, a hand), so it moves with the soldier.
 */
function armsHd(f: Frame, civ: CivilizationType, tier: 1 | 2 | 3) {
  const { add, B, neck, hand, fist } = f;
  const L = armsPalette(civ);
  const hh = B.headH;
  const top = B.head + hh / 2;
  const span = B.chest - B.waist;
  const front = (B.robe ? B.robe.d * 0.62 : B.torsoD) / 2;
  const [x, y, z] = fist(1);
  const metal: NonNullable<AddOpts["mat"]> = civ === "orc" ? "iron" : civ === "arcane" ? "gem" : "steel";
  // Uncommon: the accent on the chest (a sash across a robe), and a prop
  if (B.robe) along(add, "capsule", [-B.torsoW * 0.55, B.chest - 0.03, front + 0.02], [B.torsoW * 0.6, B.waist + 0.02, front + 0.03], 0.04, 0.025, L.accent, { torso: true, mat: "cloth" });
  else {
    // A tabard from above the belt to the collar
    const y0 = B.waist + span * 0.3 + (B.box ? 0.065 : 0.04);
    add("box", 0, y0, front + 0.025, B.torsoW * 0.55, B.chest - 0.035 - y0, 0.022, L.accent, { torso: true, mat: "cloth" });
  }
  if (tier === 1) {
    if (civ === "human") add("box", x + 0.07, 0.92, z + 0.03, 0.12, 0.065, 0.008, L.accent, { ...hand(1), mat: "cloth" }); // a pennant on the spear
    else if (civ === "elf") add("drop", B.headW * 0.62, B.head + 0.02, -0.02, 0.035, 0.12, 0.02, L.accent, { ...neck, mat: "leaf", rz: -0.45 }); // a leaf in the hood
    else if (civ === "dwarf") add("drop", 0, top - 0.035, -0.01, 0.05, 0.11, 0.05, L.accent, { ...neck, mat: "cloth" }); // a plume on the helm
    else if (civ === "orc") add("drop", 0, top + 0.07, -0.07, 0.05, 0.13, 0.04, L.accent, { ...neck, mat: "fur", rx: -0.4 }); // a war-tail on the helm
    else add("octa", 0, B.head + hh * 0.3 + 0.03, B.headW * 0.62, 0.05, 0.06, 0.025, L.accent, { ...neck, mat: "gem" }); // a star on the hat
    return;
  }
  // Rare: metal pauldrons and a crest (a comb on a helm, a brooch on an elf's mantle, a shard on a Nethergarde hat's tip)
  for (const side of [-1, 1] as const) add("egg", side * B.shoulderX * 1.02, B.shoulder - 0.01, 0, B.armW * 2.5, B.armW * 1.3, B.armW * 2.6, L.metal, { ...hand(side), mat: metal });
  if (civ === "elf") add("octa", 0, B.chest - 0.09, front + 0.035, 0.05, 0.06, 0.03, L.metal, { torso: true, mat: metal });
  else if (civ === "arcane") add("octa", 0.02, B.head + hh * 0.3 + 0.36, -0.13, 0.045, 0.07, 0.045, L.metal, { ...neck, mat: metal });
  else {
    // A comb rising out of the helm's crown (a part's y is its foot)
    const foot = civ === "human" ? B.head + hh * 0.3 : civ === "dwarf" ? B.head + hh * 0.18 : B.head + hh * 0.5;
    add("box", 0, foot, -0.01, 0.025, 0.075, civ === "orc" ? 0.19 : 0.17, L.metal, { ...neck, mat: metal });
  }
  if (tier === 2) return;
  // Epic: a cape that trails the walk, the weapon's head lit, a gem on the chest
  // Behind the back (an orc's war-belt stands out round its block of a torso)
  const capeZ = -(B.robe ? B.robe.d * 0.5 : B.box ? (B.torsoD + 0.1) / 2 : B.torsoD / 2) - 0.03;
  add("box", 0, B.waist - 0.06, capeZ, B.torsoW * 1.05, span + 0.04, 0.022, L.cape, { trail: { lag: 0.1, damp: 0.85, root: [0, B.chest, capeZ] }, mat: "cloth" });
  add("sphere", 0, B.chest - 0.1, front + 0.05, 0.045, 0.045, 0.03, L.glow, { torso: true, glow: true });
  const h = hand(1);
  if (civ === "human") add("sphere", x, 0.965, z + 0.03, 0.05, 0.05, 0.05, L.glow, { ...h, glow: true }); // a sunstone under the spear's blade
  else if (civ === "elf") add("octa", -0.05, 0.78, -0.2, 0.05, 0.09, 0.05, L.glow, { torso: true, glow: true }); // starlight in the quiver
  else if (civ === "dwarf") add("sphere", x + 0.028, y + 0.22, z + 0.08, 0.03, 0.07, 0.07, L.glow, { ...h, glow: true }); // a rune on the axe
  else if (civ === "orc") add("box", x, y + 0.12, z + 0.145, 0.02, 0.23, 0.02, L.glow, { ...h, glow: true }); // the cleaver's edge, red-hot
  else add("octa", x, 1.2, z + 0.04, 0.045, 0.09, 0.045, L.glow, { ...h, glow: true }); // a shard over the staff's orb
}

/* ============================== CARRIED LIGHTS ============================== */

/**
 * A light carried after dark, made for its bearer's HD body: it rides the same hand (or head), so it swings with their
 * walk. The glowing part stays unlit; the rest takes real metal and wood.
 */
function light(kind: ActorKind, civ: CivilizationType): Part[] {
  const { out, add } = start(true);
  // The same rest pose as its bearer, so it sits in their hand
  const f = personFrame(add, civ, mulberry32(hashString(civ)));
  const { B, neck, hand, fist } = f;
  const [x, y, z] = fist(-1);
  const h = hand(-1);
  if (civ === "human") {
    // A brass hand lantern hanging from its bail: frame, glass with a candle, a cap and a ring
    along(add, "capsule", [x, y + 0.02, z], [x, y - 0.07, z + 0.01], 0.012, 0.012, "#3f3f46", { ...h, mat: "dull" });
    add("box", x, y - 0.21, z + 0.01, 0.1, 0.12, 0.1, "#fde68a", { ...h, glow: true });
    lanternFrame(add, x, y - 0.21, z + 0.01, 0.1, 0.12, "#a16207", { ...h, mat: "gold" });
  } else if (civ === "elf") {
    // A moon-wisp floating over the shoulder, trailing a little behind, with a mote
    add("sphere", -0.24, 0.8, 0.06, 0.18, 0.18, 0.18, "#a5f3fc", { glow: true, trail: { lag: 0.25, damp: 0.2, root: [0, 0.6, 0] } });
    add("sphere", -0.36, 0.95, -0.02, 0.07, 0.07, 0.07, "#ecfeff", { glow: true, trail: { lag: 0.4, damp: 0.1, root: [0, 0.6, 0] } });
  } else if (civ === "dwarf") {
    // A miner's lamp on the brow, and an iron lantern hanging from the hand
    add("cyl", 0, B.head + B.headH * 0.12, B.headW * 0.5, 0.07, 0.06, 0.03, "#fdba74", { ...neck, glow: true, rx: Math.PI / 2 });
    add("cyl", 0, B.head + B.headH * 0.12, B.headW * 0.47, 0.085, 0.07, 0.025, "#27272a", { ...neck, mat: "iron", rx: Math.PI / 2 });
    along(add, "capsule", [x, y + 0.02, z], [x, y - 0.05, z + 0.01], 0.012, 0.012, "#27272a", { ...h, mat: "iron" });
    add("box", x, y - 0.18, z + 0.01, 0.1, 0.11, 0.1, "#fb923c", { ...h, glow: true });
    lanternFrame(add, x, y - 0.18, z + 0.01, 0.1, 0.11, "#27272a", { ...h, mat: "iron" });
  } else if (civ === "orc") {
    // A pitch torch gripped in the fist and held up and out, its flame on top
    const tip: V3 = [x - 0.06, y + 0.42, z + 0.12];
    along(add, "taper", [x + 0.01, y - 0.1, z - 0.03], tip, 0.05, 0.05, "#4a2a16", { ...h, mat: "wood" });
    add("cyl", tip[0], tip[1] - 0.06, tip[2], 0.075, 0.08, 0.075, "#292524", { ...h, mat: "hide" }); // pitch-soaked rags
    add("cone", tip[0], tip[1], tip[2], 0.17, 0.26, 0.17, "#f97316", { ...h, glow: true });
    add("cone", tip[0], tip[1] + 0.02, tip[2], 0.09, 0.27, 0.09, "#fde047", { ...h, glow: true });
  } else {
    // A void orb hovering over the open hand, a spark circling it
    add("sphere", x - 0.01, y + 0.06, z + 0.06, 0.17, 0.17, 0.17, "#c084fc", { ...h, glow: true });
    add("sphere", x - 0.12, y + 0.18, z + 0.0, 0.06, 0.06, 0.06, "#f0abfc", { ...h, glow: true });
  }
  void kind;
  return out.parts;
}

/** Where each civilization's HD light glows (its rest position), for the soft halo round it */
export function hdLightHalo(civ: CivilizationType) {
  const parts = actorHdModel(`light_${civ}`).parts;
  const glow = parts.find((p) => p.glow) ?? parts[0];
  return { ...LIGHT_HALOS[civ], x: glow.x, y: glow.y, z: glow.z };
}

/* ================================== ANIMALS ================================== */

/**
 * A body lying along z, centred at height `cy`: `len` long, `hgt` tall, `w` wide. An egg's narrow end points forward
 * (`narrow` "front") or back (a bird's tail); `tilt` raises the front (negative) or dips it
 */
function lying(add: Add, shape: "egg" | "drop" | "pod", cy: number, z: number, w: number, len: number, hgt: number, color: string, o: AddOpts, narrow: "front" | "back" = "front", tilt = 0) {
  // Turned a quarter about x, the shape's height lies along z: its centre stays where the unturned centre was
  add(shape, 0, cy - len / 2, z, w, len, hgt, color, { ...o, rx: (narrow === "front" ? Math.PI / 2 : -Math.PI / 2) + tilt });
}

/** Four legs from hip height to the ground, stepping in diagonal pairs, each with a hoof or paw */
function legs4(add: Add, o: { x: number; zf: number; zb: number; hip: number; w: number; color: string; foot: string; mat: NonNullable<AddOpts["mat"]>; paw?: boolean; footH?: number }) {
  const fh = o.footH ?? Math.max(0.03, o.w * 0.6);
  for (const [lx, lz, leg] of [
    [-o.x, o.zf, 1],
    [o.x, o.zf, -1],
    [-o.x, o.zb, -1],
    [o.x, o.zb, 1]
  ] as const) {
    add("limb", lx, fh * 0.6, lz, o.w, o.hip - fh * 0.6, o.w * 1.1, o.color, { leg, hip: o.hip, mat: o.mat });
    add(o.paw ? "egg" : "cyl", lx, 0, lz + (o.paw ? o.w * 0.25 : 0), o.w * (o.paw ? 1.15 : 1.05), fh, o.w * (o.paw ? 1.5 : 1.05), o.foot, { leg, hip: o.hip, mat: o.paw ? o.mat : "bone" });
  }
}

/** Eyes on a head, `spread` apart at local height y and depth z */
function eyes(add: Add, neck: AddOpts, y: number, z: number, spread: number, size: number, color = "#1c1917", glow = false) {
  for (const side of [-1, 1]) add("sphere", side * spread, y - size / 2, z, size, size, size * 0.85, color, glow ? { ...neck, glow: true } : { ...neck, mat: "gem" });
}

/** A head's neck options: it turns about (0, y, z) */
const neckAt = (y: number, z: number, r: Rng): AddOpts => ({ head: { y, z }, pose: { at: [0, y, z], ry: (r() - 0.5) * 0.4, rz: (r() - 0.5) * 0.12, rx: (r() - 0.4) * 0.12 } });

function animal(kind: AnimalKind): { parts: Part[]; winged: boolean } {
  const { out, add } = start(false);
  const s = kind === "pony" ? 0.72 : kind === "goose" ? 0.8 : 1;
  const winged = animalBody(scaled(add, s), kind, mulberry32(hashString(kind)));
  return { parts: out.parts, winged };
}

/** An animal's body, built with `add` (scaled as the caller likes); whether it has wings */
function animalBody(add: Add, kind: AnimalKind, r: Rng): boolean {
  let winged = false;
  switch (kind) {
    case "sheep": {
      // A woolly body of curls, a dark face and legs
      add("sphere", 0, 0.13, 0, 0.36, 0.3, 0.46, S(0), { mat: "fur" });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const up = i % 2 ? 0.08 : 0.0;
        add("sphere", Math.cos(a) * 0.15, 0.22 + up + Math.abs(Math.sin(a)) * 0.02, Math.sin(a) * 0.19, 0.13, 0.12, 0.13, S(0, 0.96 + (i % 3) * 0.03), { mat: "fur" });
      }
      add("sphere", 0, 0.37, -0.02, 0.24, 0.1, 0.32, S(0, 1.04), { mat: "fur" }); // the fleece's crown
      legs4(add, { x: 0.09, zf: 0.13, zb: -0.13, hip: 0.18, w: 0.045, color: S(1), foot: "#1c1917", mat: "hide" });
      const n = neckAt(0.32, 0.2, r);
      add("egg", 0, 0.28, 0.27, 0.13, 0.17, 0.17, S(1), { ...n, mat: "hide", rx: 0.7 });
      add("sphere", 0, 0.38, 0.24, 0.15, 0.08, 0.12, S(0), { ...n, mat: "fur" }); // woolly poll
      for (const side of [-1, 1]) add("egg", side * 0.085, 0.33, 0.24, 0.04, 0.035, 0.08, S(1), { ...n, mat: "hide", rz: side * 1.2 });
      eyes(add, n, 0.37, 0.32, 0.045, 0.026, "#78350f");
      add("sphere", 0, 0.24, -0.23, 0.09, 0.08, 0.08, S(0), { mat: "fur", trail: { lag: 0.15, damp: 0.5, root: [0, 0.27, -0.2] } });
      break;
    }
    case "cow": {
      add("pod", 0, 0.28, 0, 0.42, 0.34, 0.74, S(0), { mat: "hide" });
      for (const [px, py, pz, sw] of [
        [0.185, 0.4, 0.1, 0.17],
        [-0.185, 0.37, -0.15, 0.2]
      ])
        add("sphere", px, py, pz, 0.05, sw * 0.8, sw, S(1), { mat: "hide" }); // patches
      legs4(add, { x: 0.13, zf: 0.24, zb: -0.25, hip: 0.32, w: 0.095, color: S(0), foot: "#1c1917", mat: "hide" });
      add("egg", 0, 0.18, -0.16, 0.14, 0.09, 0.12, "#f9a8d4", { mat: "skin" }); // udder
      const n = neckAt(0.56, 0.32, r);
      add("taper", 0, 0.48, 0.34, 0.2, 0.2, 0.22, S(0), { ...n, mat: "hide", rx: 1.0 });
      add("snout", 0, 0.48, 0.38, 0.24, 0.24, 0.3, S(1), { ...n, mat: "hide" });
      add("egg", 0, 0.47, 0.54, 0.17, 0.13, 0.08, "#e7b2a5", { ...n, mat: "skin" }); // muzzle
      for (const side of [-1, 1]) {
        along(add, "horn", [side * 0.08, 0.7, 0.42], [side * 0.18, 0.78, 0.46], 0.045, 0.045, "#f5ecd6", { ...n, mat: "bone" });
        add("egg", side * 0.15, 0.62, 0.38, 0.1, 0.045, 0.06, S(1), { ...n, mat: "hide", rz: side * 0.4 });
      }
      eyes(add, n, 0.67, 0.5, 0.085, 0.03);
      tail(add, [0, 0.58, -0.36], { len: 0.36, w0: 0.035, w1: 0.03, n: 3, pitch: 1.35, lag: 0.12, step: 0.07, damp: 0.4, color: S(0), tip: S(1) }, { mat: "hide" });
      break;
    }
    case "pig": {
      lying(add, "egg", 0.25, 0, 0.38, 0.52, 0.3, S(0), { mat: "skin" }, "front");
      legs4(add, { x: 0.1, zf: 0.13, zb: -0.13, hip: 0.14, w: 0.06, color: S(0), foot: S(1, 0.8), mat: "skin" });
      const n = neckAt(0.26, 0.2, r);
      add("egg", 0, 0.15, 0.24, 0.24, 0.22, 0.18, S(0), { ...n, mat: "skin" });
      add("cyl", 0, 0.21, 0.35, 0.11, 0.08, 0.09, S(1), { ...n, mat: "skin", rx: Math.PI / 2 }); // snout
      for (const side of [-1, 1]) {
        add("sphere", side * 0.022, 0.235, 0.39, 0.022, 0.022, 0.012, "#831843", { ...n, mat: "skin" }); // nostrils
        add("egg", side * 0.075, 0.3, 0.26, 0.06, 0.025, 0.07, S(0), { ...n, mat: "skin", rx: 0.5, rz: side * 0.35 }); // floppy ears
      }
      eyes(add, n, 0.3, 0.32, 0.055, 0.022);
      tail(add, [0, 0.28, -0.25], { len: 0.12, w0: 0.02, w1: 0.016, n: 3, pitch: -0.4, curl: -3.5, lag: 0.12, step: 0.06, damp: 0.3, color: S(0) }, { mat: "skin" });
      break;
    }
    case "chicken": {
      add("egg", 0, 0.05, -0.01, 0.17, 0.15, 0.21, S(0), { mat: "fur", rx: Math.PI / 2 - 0.3 });
      for (const side of [-1, 1]) add("egg", side * 0.08, 0.1, -0.015, 0.04, 0.09, 0.15, S(0, 0.85), { mat: "fur", rx: 0.3 }); // folded wings
      for (let i = 0; i < 3; i++) add("drop", (i - 1) * 0.025, 0.12, -0.11, 0.04, 0.1, 0.03, S(0, 0.8), { mat: "fur", rx: -0.6 + i * 0.05, rz: (i - 1) * 0.3, trail: { lag: 0.1, damp: 0.6, root: [0, 0.14, -0.08] } });
      for (const side of [-1, 1] as const) {
        const leg = side < 0 ? 1 : -1;
        add("cyl", side * 0.035, 0.015, 0, 0.018, 0.07, 0.018, "#f59e0b", { leg, hip: 0.08, mat: "bone" });
        add("box", side * 0.035, 0, 0.015, 0.04, 0.012, 0.05, "#f59e0b", { leg, hip: 0.08, mat: "bone" });
      }
      const n = neckAt(0.16, 0.06, r);
      add("egg", 0, 0.15, 0.065, 0.09, 0.11, 0.09, S(0), { ...n, mat: "fur" });
      for (let i = 0; i < 3; i++) add("sphere", 0, 0.25 + (i === 1 ? 0.012 : 0), 0.05 + i * 0.022, 0.02, 0.035, 0.025, S(1), { ...n, mat: "skin" }); // comb
      add("egg", 0, 0.17, 0.115, 0.02, 0.04, 0.02, S(1), { ...n, mat: "skin" }); // wattle
      along(add, "cone", [0, 0.21, 0.1], [0, 0.205, 0.15], 0.025, 0.02, "#f59e0b", { ...n, mat: "bone" });
      eyes(add, n, 0.225, 0.095, 0.035, 0.016);
      break;
    }
    case "deer":
    case "stag": {
      add("pod", 0, 0.37, 0, 0.22, 0.25, 0.52, S(0), { mat: "hide" });
      add("egg", 0, 0.37, -0.02, 0.16, 0.08, 0.42, S(0, 1.25), { mat: "hide" }); // pale belly
      legs4(add, { x: 0.065, zf: 0.17, zb: -0.17, hip: 0.44, w: 0.045, color: S(1), foot: "#1c1917", mat: "hide" });
      const n = neckAt(0.6, 0.18, r);
      along(add, "taper", [0, 0.56, 0.18], [0, 0.82, 0.3], 0.1, 0.11, S(0), { ...n, mat: "hide" });
      add("snout", 0, 0.76, 0.26, 0.11, 0.12, 0.24, S(0), { ...n, mat: "hide" });
      add("egg", 0, 0.765, 0.47, 0.04, 0.035, 0.03, "#1c1917", { ...n, mat: "leather" }); // nose
      for (const side of [-1, 1]) add("egg", side * 0.07, 0.84, 0.27, 0.08, 0.04, 0.05, S(0), { ...n, mat: "hide", rz: side * 0.7 }); // ears
      eyes(add, n, 0.85, 0.33, 0.045, 0.024);
      // Antlers: two beams with tines (a stag's glow)
      const ant = kind === "stag" ? S(2) : "#e7d7b5";
      const o: AddOpts = kind === "stag" ? { ...n, glow: true } : { ...n, mat: "bone" };
      for (const side of [-1, 1]) {
        const b0: V3 = [side * 0.04, 0.87, 0.27];
        const b1: V3 = [side * 0.11, 1.0, 0.24];
        const b2: V3 = [side * 0.14, 1.1, 0.2];
        along(add, "capsule", b0, b1, 0.022, 0.022, ant, o);
        along(add, "capsule", b1, b2, 0.018, 0.018, ant, o);
        along(add, "cone", b1, [side * 0.07, 1.08, 0.3], 0.018, 0.018, ant, o);
        along(add, "cone", b2, [side * 0.2, 1.16, 0.22], 0.016, 0.016, ant, o);
        along(add, "cone", b2, [side * 0.1, 1.17, 0.15], 0.014, 0.014, ant, o);
      }
      add("egg", 0, 0.42, -0.28, 0.07, 0.09, 0.05, "#ffffff", { mat: "fur", rx: -0.3, trail: { lag: 0.1, damp: 0.6, root: [0, 0.48, -0.25] } }); // white scut
      break;
    }
    case "horse":
    case "pony": {
      add("pod", 0, 0.45, 0, 0.3, 0.33, 0.78, S(0), { mat: "hide" });
      legs4(add, { x: 0.095, zf: 0.27, zb: -0.27, hip: 0.52, w: 0.08, color: S(0), foot: "#1c1917", mat: "hide", footH: 0.06 });
      const n = neckAt(0.74, 0.3, r);
      along(add, "taper", [0, 0.56, 0.27], [0, 1.0, 0.45], 0.2, 0.17, S(0), { ...n, mat: "hide" });
      // The head carried nose-down at the top of the neck
      add("snout", 0, 0.9, 0.45, 0.14, 0.16, 0.36, S(0), { ...n, mat: "hide", rx: 0.6 });
      add("egg", 0, 0.78, 0.66, 0.1, 0.08, 0.08, S(0, 0.7), { ...n, mat: "skin", rx: 0.6 }); // muzzle
      for (const side of [-1, 1]) {
        along(add, "cone", [side * 0.04, 1.06, 0.45], [side * 0.05, 1.15, 0.43], 0.035, 0.025, S(0), { ...n, mat: "hide" });
      }
      eyes(add, n, 1.03, 0.55, 0.065, 0.028);
      // Mane down the neck and a forelock, trailing as it goes
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        add("egg", 0, 0.78 + t * 0.26 - 0.06, 0.32 + t * 0.12 - 0.03, 0.035, 0.14, 0.07, S(1), { mat: "fur", rx: -0.5, trail: { lag: 0.06 + i * 0.04, damp: 0.4, root: [0, 0.8 + t * 0.26, 0.34 + t * 0.12] } });
      }
      tail(add, [0, 0.6, -0.4], { len: 0.48, w0: 0.08, w1: 0.06, n: 4, pitch: 1.1, curl: 0.2, lag: 0.1, step: 0.07, damp: 0.25, color: S(1) }, { mat: "fur" });
      break;
    }
    case "rabbit": {
      lying(add, "egg", 0.12, -0.01, 0.16, 0.23, 0.16, S(0), { mat: "fur" }, "front", -0.25);
      for (const side of [-1, 1]) add("egg", side * 0.06, 0.02, -0.05, 0.06, 0.09, 0.12, S(0), { mat: "fur", leg: side < 0 ? 1 : -1, hip: 0.1 }); // haunches
      for (const side of [-1, 1]) add("egg", side * 0.035, 0, 0.08, 0.035, 0.07, 0.05, S(0), { mat: "fur", leg: side < 0 ? -1 : 1, hip: 0.1 }); // forepaws
      const n = neckAt(0.16, 0.09, r);
      add("egg", 0, 0.14, 0.1, 0.11, 0.11, 0.12, S(0), { ...n, mat: "fur" });
      for (const side of [-1, 1]) {
        add("egg", side * 0.03, 0.23, 0.08, 0.035, 0.15, 0.022, S(0), { ...n, mat: "fur", rz: -side * 0.15, rx: -0.2 });
        add("egg", side * 0.03, 0.25, 0.088, 0.018, 0.1, 0.008, "#f9a8d4", { ...n, mat: "skin", rz: -side * 0.15, rx: -0.2 });
      }
      add("sphere", 0, 0.18, 0.16, 0.022, 0.018, 0.015, "#f472b6", { ...n, mat: "skin" });
      eyes(add, n, 0.225, 0.14, 0.042, 0.022);
      add("sphere", 0, 0.1, -0.13, 0.06, 0.06, 0.06, "#ffffff", { mat: "fur", trail: { lag: 0.08, damp: 0.7, root: [0, 0.13, -0.11] } });
      break;
    }
    case "swan":
    case "goose": {
      lying(add, "egg", 0.13, -0.02, 0.2, 0.34, 0.16, S(0), { mat: "fur" }, "back", -0.15);
      for (const side of [-1, 1]) add("egg", side * 0.085, 0.11, -0.04, 0.05, 0.1, 0.26, S(0, 0.95), { mat: "fur", rx: 0.15 }); // folded wings
      add("drop", 0, 0.12, -0.2, 0.08, 0.1, 0.04, S(0), { mat: "fur", rx: -1.0, trail: { lag: 0.1, damp: 0.6, root: [0, 0.15, -0.16] } });
      // The neck curves up in an S to the head
      const n = neckAt(0.16, 0.1, r);
      // Each segment reaches past the joint, so the curve stays one smooth neck
      along(add, "capsule", [0, 0.14, 0.095], [0, 0.33, 0.152], 0.05, 0.05, S(0), { ...n, mat: "fur" });
      along(add, "capsule", [0, 0.29, 0.155], [0, 0.45, 0.1], 0.044, 0.044, S(0), { ...n, mat: "fur" });
      add("egg", 0, 0.42, 0.1, 0.065, 0.065, 0.09, S(0), { ...n, mat: "fur" });
      along(add, "cone", [0, 0.45, 0.15], [0, 0.43, 0.23], 0.03, 0.025, S(1), { ...n, mat: "bone" });
      add("sphere", 0, 0.445, 0.145, 0.026, 0.026, 0.026, "#1c1917", { ...n, mat: "skin" }); // knob at the bill's base
      eyes(add, n, 0.465, 0.125, 0.028, 0.014);
      break;
    }
    case "goat": {
      add("pod", 0, 0.21, 0, 0.2, 0.21, 0.4, S(0), { mat: "fur" });
      legs4(add, { x: 0.06, zf: 0.13, zb: -0.13, hip: 0.25, w: 0.04, color: S(1), foot: "#1c1917", mat: "hide" });
      const n = neckAt(0.38, 0.16, r);
      along(add, "taper", [0, 0.33, 0.16], [0, 0.47, 0.2], 0.08, 0.08, S(0), { ...n, mat: "fur" });
      add("snout", 0, 0.4, 0.17, 0.1, 0.11, 0.18, S(0), { ...n, mat: "fur", rx: 0.3 });
      add("drop", 0, 0.29, 0.27, 0.04, 0.09, 0.03, S(1), { ...n, mat: "fur", rx: Math.PI }); // beard
      for (const side of [-1, 1]) {
        along(add, "horn", [side * 0.03, 0.5, 0.2], [side * 0.06, 0.6, 0.11], 0.03, 0.03, "#a8a29e", { ...n, mat: "bone" });
        add("egg", side * 0.07, 0.46, 0.18, 0.07, 0.03, 0.04, S(0), { ...n, mat: "fur", rz: side * 1.3 });
      }
      eyes(add, n, 0.48, 0.24, 0.042, 0.022, "#d97706");
      add("drop", 0, 0.37, -0.21, 0.04, 0.08, 0.03, S(0), { mat: "fur", rx: -0.6, trail: { lag: 0.08, damp: 0.6, root: [0, 0.38, -0.19] } });
      break;
    }
    case "boar": {
      add("pod", 0, 0.1, 0, 0.36, 0.32, 0.56, S(0), { mat: "fur" });
      for (let i = 0; i < 5; i++) add("drop", 0, 0.38 - Math.abs(i - 1.5) * 0.015, 0.15 - i * 0.075, 0.05, 0.07, 0.06, S(1), { mat: "fur", rx: -0.4 }); // bristly ridge
      legs4(add, { x: 0.1, zf: 0.15, zb: -0.15, hip: 0.14, w: 0.075, color: S(1), foot: "#1c1917", mat: "fur" });
      const n = neckAt(0.26, 0.22, r);
      add("snout", 0, 0.14, 0.2, 0.22, 0.2, 0.26, S(0), { ...n, mat: "fur", rx: 0.15 });
      add("cyl", 0, 0.18, 0.4, 0.09, 0.06, 0.07, S(1), { ...n, mat: "skin", rx: Math.PI / 2 });
      for (const side of [-1, 1]) {
        along(add, "horn", [side * 0.05, 0.18, 0.36], [side * 0.08, 0.27, 0.4], 0.025, 0.025, "#f5ecd6", { ...n, mat: "bone" });
        add("cone", side * 0.08, 0.3, 0.23, 0.05, 0.08, 0.035, S(0), { ...n, mat: "fur", rz: side * 0.4 });
      }
      eyes(add, n, 0.29, 0.31, 0.06, 0.018);
      tail(add, [0, 0.36, -0.27], { len: 0.12, w0: 0.018, w1: 0.016, n: 2, pitch: 1.2, lag: 0.1, step: 0.06, damp: 0.3, color: S(1) }, { mat: "fur" });
      break;
    }
    case "wolf": {
      add("pod", 0, 0.2, 0, 0.2, 0.2, 0.52, S(0), { mat: "fur" });
      add("egg", 0, 0.19, 0.17, 0.2, 0.21, 0.2, S(0, 1.12), { mat: "fur" }); // deep chest
      legs4(add, { x: 0.06, zf: 0.17, zb: -0.17, hip: 0.24, w: 0.045, color: S(1), foot: S(1), mat: "fur", paw: true });
      const n = neckAt(0.34, 0.24, r);
      add("taper", 0, 0.26, 0.26, 0.13, 0.15, 0.13, S(0), { ...n, mat: "fur", rx: 0.8 });
      add("egg", 0, 0.31, 0.3, 0.15, 0.14, 0.15, S(0), { ...n, mat: "fur" });
      add("snout", 0, 0.32, 0.37, 0.09, 0.08, 0.15, S(0, 0.85), { ...n, mat: "fur", rx: 0.1 });
      add("egg", 0, 0.35, 0.51, 0.04, 0.03, 0.03, "#0c0a09", { ...n, mat: "leather" });
      for (const side of [-1, 1]) add("cone", side * 0.045, 0.42, 0.28, 0.045, 0.08, 0.03, S(0), { ...n, mat: "fur" });
      eyes(add, n, 0.41, 0.37, 0.04, 0.022, "#ca8a04");
      tail(add, [0, 0.36, -0.25], { len: 0.3, w0: 0.06, w1: 0.08, n: 4, pitch: 0.9, curl: -0.6, lag: 0.12, step: 0.07, color: S(0), tip: S(0, 1.25) }, { mat: "fur" });
      break;
    }
    case "lizard": {
      add("pod", 0, 0.07, 0, 0.18, 0.1, 0.46, S(0), { mat: "hide" });
      for (const z of [0.12, 0, -0.12]) along(add, "cone", [0, 0.16, z], [0, 0.22, z - 0.03], 0.03, 0.025, S(1), { mat: "hide" });
      // Splayed legs out to the sides, stepping in diagonal pairs
      for (const [sx, sz, leg] of [
        [-1, 0.12, 1],
        [1, 0.12, -1],
        [-1, -0.12, -1],
        [1, -0.12, 1]
      ] as const) {
        along(add, "limb", [sx * 0.08, 0.1, sz], [sx * 0.17, 0.02, sz + 0.02], 0.04, 0.04, S(0), { leg, hip: 0.1, mat: "hide" });
        add("egg", sx * 0.18, 0, sz + 0.03, 0.06, 0.02, 0.06, S(0, 0.85), { leg, hip: 0.1, mat: "hide" });
      }
      const n = neckAt(0.12, 0.2, r);
      add("snout", 0, 0.08, 0.2, 0.12, 0.08, 0.18, S(0), { ...n, mat: "hide" });
      eyes(add, n, 0.16, 0.26, 0.045, 0.024, "#facc15");
      tail(add, [0, 0.11, -0.22], { len: 0.42, w0: 0.08, w1: 0.03, n: 4, pitch: 0.12, curl: 0.0, lag: 0.08, step: 0.08, damp: 0.2, color: S(0) }, { mat: "hide" });
      break;
    }
    case "crow": {
      winged = true;
      lying(add, "egg", 0.1, -0.01, 0.12, 0.19, 0.12, S(0), { mat: "fur" }, "back", 0.1);
      const n = neckAt(0.15, 0.06, r);
      add("egg", 0, 0.15, 0.06, 0.085, 0.085, 0.09, S(0), { ...n, mat: "fur" });
      along(add, "cone", [0, 0.185, 0.09], [0, 0.175, 0.145], 0.034, 0.026, "#3f3f46", { ...n, mat: "bone" });
      eyes(add, n, 0.205, 0.09, 0.03, 0.014, "#0c0a09");
      // Tail feathers fanned behind, trailing
      for (let i = 0; i < 3; i++) add("drop", (i - 1) * 0.022, 0.08, -0.14, 0.04, 0.11, 0.012, S(0, 0.85), { mat: "fur", rx: -1.3, rz: (i - 1) * 0.25, trail: { lag: 0.08, damp: 0.5, root: [0, 0.1, -0.09] } });
      // Wings of three feather panels each, hinged at the shoulder (they beat in flight and fold at rest)
      for (const side of [-1, 1]) {
        // All from the shoulder (each turns about its inner edge): coverts, then longer flight feathers behind
        add("egg", side * 0.075, 0.13 - 0.01, 0.0, 0.13, 0.022, 0.12, S(0), { flap: 1, mat: "fur" });
        add("egg", side * 0.11, 0.13 - 0.009, -0.03, 0.2, 0.017, 0.1, S(0, 0.9), { flap: 1, mat: "fur" });
        add("egg", side * 0.13, 0.13 - 0.008, -0.055, 0.24, 0.014, 0.07, S(0, 0.82), { flap: 1, mat: "fur" });
      }
      for (const side of [-1, 1]) add("cyl", side * 0.025, 0, 0.0, 0.012, 0.05, 0.012, "#27272a", { mat: "bone" });
      break;
    }
    case "griffin": {
      // The Archon's griffin (mythic, gilt): an eagle's head, breast, wings and forelegs with talons on a lion's
      // body, hind legs and tufted tail; plumage in the slot colour, a gilt beak, collar and primaries
      winged = true;
      const LION = "#c8964e";
      const GILT = "#f2b33d";
      add("pod", 0, 0.075, -0.03, 0.12, 0.12, 0.27, LION, { mat: "fur" });
      add("egg", 0, 0.08, 0.06, 0.125, 0.135, 0.12, S(0), { mat: "fur" }); // feathered breast
      arc(add, [0, 0.165, 0.085], [1, 0, 0], [0, 0, 1], [0.05, 0.045], 0, Math.PI * 2, 8, 0.016, GILT, { mat: "gold" }); // collar
      for (const [lx, lz, leg] of [
        [-0.04, 0.07, 1],
        [0.04, 0.07, -1],
        [-0.04, -0.12, -1],
        [0.04, -0.12, 1]
      ] as const) {
        const front = lz > 0;
        add("limb", lx, 0.02, lz, 0.036, 0.085, 0.04, front ? "#d9a23a" : LION, { leg, hip: 0.105, mat: front ? "skin" : "fur" });
        if (front) for (const dx of [-0.012, 0, 0.012]) along(add, "cone", [lx + dx, 0.012, lz], [lx + dx * 1.6, 0.0, lz + 0.038], 0.012, 0.012, "#292524", { leg, hip: 0.105, mat: "bone" });
        else add("egg", lx, 0, lz + 0.01, 0.042, 0.03, 0.058, LION, { leg, hip: 0.105, mat: "fur" });
      }
      const n = neckAt(0.17, 0.11, r);
      add("egg", 0, 0.15, 0.12, 0.085, 0.09, 0.1, S(0), { ...n, mat: "fur" });
      along(add, "horn", [0, 0.2, 0.162], [0, 0.18, 0.225], 0.034, 0.04, GILT, { ...n, mat: "gold" }); // hooked beak
      eyes(add, n, 0.212, 0.152, 0.03, 0.016, "#f59e0b");
      for (const side of [-1, 1]) along(add, "cone", [side * 0.025, 0.22, 0.1], [side * 0.04, 0.27, 0.07], 0.025, 0.02, S(0, 0.9), { ...n, mat: "fur" }); // ear tufts
      // A lion's tail, tufted at its end, trailing
      tail(add, [0, 0.15, -0.16], { len: 0.22, w0: 0.02, w1: 0.04, n: 4, pitch: 0.5, curl: -1.4, lag: 0.1, step: 0.08, damp: 0.2, color: LION, tip: "#7c4a1a" }, { mat: "fur" });
      // Great wings of four feather panels each from the shoulder, the longest gilt (they beat in flight, fold at rest)
      for (const side of [-1, 1]) {
        add("egg", side * 0.08, 0.17, 0.01, 0.15, 0.024, 0.13, S(0), { flap: 1, mat: "fur" });
        add("egg", side * 0.12, 0.164, -0.02, 0.24, 0.018, 0.11, S(0, 0.92), { flap: 1, mat: "fur" });
        add("egg", side * 0.15, 0.158, -0.05, 0.3, 0.015, 0.09, S(0, 0.84), { flap: 1, mat: "fur" });
        add("egg", side * 0.17, 0.152, -0.075, 0.34, 0.012, 0.06, GILT, { flap: 1, mat: "gold" });
      }
      break;
    }
    case "cat": {
      add("pod", 0, 0.07, 0, 0.12, 0.12, 0.28, S(0), { mat: "fur" });
      legs4(add, { x: 0.035, zf: 0.09, zb: -0.09, hip: 0.1, w: 0.03, color: S(0), foot: S(0), mat: "fur", paw: true });
      const n = neckAt(0.17, 0.12, r);
      add("egg", 0, 0.15, 0.14, 0.11, 0.1, 0.1, S(0), { ...n, mat: "fur" });
      add("egg", 0, 0.165, 0.2, 0.05, 0.04, 0.04, S(0, 1.1), { ...n, mat: "fur" }); // muzzle
      for (const side of [-1, 1]) along(add, "cone", [side * 0.03, 0.235, 0.13], [side * 0.042, 0.29, 0.125], 0.035, 0.018, S(0), { ...n, mat: "fur" });
      for (const side of [-1, 1]) {
        add("sphere", side * 0.026, 0.198, 0.183, 0.024, 0.02, 0.012, "#a3e635", { ...n, glow: true });
        add("box", side * 0.026, 0.198, 0.19, 0.005, 0.017, 0.005, "#0c0a09", { ...n, mat: "gem" });
      }
      tail(add, [0, 0.16, -0.13], { len: 0.26, w0: 0.025, w1: 0.022, n: 4, pitch: -0.6, curl: -1.2, lag: 0.1, step: 0.08, damp: 0.2, color: S(0) }, { mat: "fur" });
      break;
    }
    case "owl": {
      add("egg", 0, 0.02, 0, 0.16, 0.22, 0.15, S(0), { mat: "fur" });
      add("egg", 0, 0.05, 0.035, 0.11, 0.15, 0.09, S(0, 1.2), { mat: "fur" }); // pale breast
      for (const side of [-1, 1]) add("egg", side * 0.075, 0.05, -0.01, 0.04, 0.17, 0.11, S(0, 0.78), { mat: "fur" }); // folded wings
      for (const side of [-1, 1]) for (const dx of [-0.015, 0.015]) along(add, "cone", [side * 0.035 + dx, 0.025, 0.04], [side * 0.035 + dx, 0.0, 0.07], 0.012, 0.012, "#d97706", { mat: "bone" }); // talons
      const n = neckAt(0.22, 0.0, r);
      add("sphere", 0, 0.22, 0, 0.15, 0.12, 0.14, S(0), { ...n, mat: "fur" });
      add("sphere", 0, 0.235, 0.045, 0.13, 0.09, 0.05, S(0, 1.22), { ...n, mat: "fur" }); // facial disc
      for (const side of [-1, 1]) {
        add("sphere", side * 0.035, 0.265, 0.063, 0.04, 0.04, 0.02, "#fde047", { ...n, glow: true });
        add("sphere", side * 0.035, 0.275, 0.074, 0.018, 0.018, 0.008, "#0c0a09", { ...n, mat: "gem" });
        along(add, "cone", [side * 0.045, 0.32, 0.0], [side * 0.06, 0.39, -0.01], 0.03, 0.02, S(0, 0.85), { ...n, mat: "fur" }); // ear tufts
      }
      along(add, "cone", [0, 0.26, 0.07], [0, 0.23, 0.085], 0.022, 0.018, "#57534e", { ...n, mat: "bone" });
      break;
    }
  }
  return winged;
}

/* ================================== SCOUT MOUNTS ================================== */

/**
 * A civilization's scout mount (`MOUNTS` in `actorTemplates.ts`): its animal's HD body scaled up, and the tack as in
 * Normal (saddle cloth, saddle and cantle, saddlebags) in real materials, with HD-only detail: a fringe on the cloth, a
 * girth strap, stirrups, buckles on the bags and a bridle. Uncommon: the cloth is its one accent, the fittings dull
 * metal. The ram gets great curled horns, the Voidmare burning eyes.
 */
function mountModel(civ: CivilizationType): Part[] {
  const { out, add } = start(false);
  const m = MOUNTS[civ];
  // The head's rest pose is the first thing its body draws from this rng: tack on the head draws the same (`neckAt`)
  animalBody(scaled(add, m.scale), m.base, mulberry32(hashString(`mount_${civ}`)));
  const { back, half } = m;
  const z = -0.02;
  // The saddle cloth: a pad over the back and a flap down each flank, a fringe along their hems
  add("box", 0, back, z, half * 2 + 0.08, 0.06, 0.36, S(2), { mat: "cloth" });
  for (const sx of [-1, 1]) {
    add("box", sx * (half + 0.035), back - 0.17, z, 0.03, 0.17, 0.34, S(2), { mat: "cloth" });
    for (let i = 0; i < 5; i++) add("drop", sx * (half + 0.035), back - 0.21, z - 0.14 + i * 0.07, 0.025, 0.05, 0.03, S(2, 0.75), { mat: "cloth", hd: true, rx: Math.PI });
  }
  // A girth strap round the barrel, under the pad and flaps (a band lying along z: centred on the body)
  const cy = (back + m.belly) / 2;
  add("cyl", 0, cy - 0.025, z + 0.08, half * 2 + 0.03, 0.05, back - m.belly + 0.03, "#3f2a1a", { mat: "leather", hd: true, rx: Math.PI / 2 });
  if (m.saddle) {
    const mat = civ === "orc" ? "bone" : "leather";
    add("box", 0, back + 0.06, z, 0.22, 0.08, 0.26, m.saddle, { mat });
    add("box", 0, back + 0.14, z - 0.13, 0.2, 0.06, 0.05, m.saddle, { mat });
    add("egg", 0, back + 0.14, z + 0.12, 0.08, 0.06, 0.05, m.saddle, { mat, hd: true }); // pommel
    // Stirrups on their leathers
    for (const sx of [-1, 1]) {
      add("box", sx * (half + 0.115), back - 0.26, z + 0.02, 0.012, 0.32, 0.03, "#3f2a1a", { mat: "leather", hd: true });
      add("cyl", sx * (half + 0.115), back - 0.3, z + 0.02, 0.05, 0.03, 0.07, "#52525b", { mat: "dull", hd: true });
    }
  }
  // Saddlebags behind the seat, a buckle on each flap
  for (const sx of [-1, 1]) {
    add("box", sx * (half + 0.1), back - 0.185, z - 0.18, 0.08, 0.13, 0.13, "#78350f", { mat: "leather", hdShape: "pod" });
    add("box", sx * (half + 0.145), back - 0.15, z - 0.18, 0.02, 0.025, 0.025, "#a8a29e", { mat: "dull", hd: true });
  }
  if (m.base === "horse") {
    // A bridle round the muzzle and up behind the ears, turning with the head
    const n = neckAt(0.74, 0.3, mulberry32(hashString(`mount_${civ}`)));
    add("cyl", 0, 0.75, 0.6, 0.16, 0.05, 0.11, "#3f2a1a", { ...n, mat: "leather", hd: true, rx: 0.6 });
    for (const sx of [-1, 1]) along(add, "box", [sx * 0.075, 0.8, 0.6], [sx * 0.07, 1.04, 0.44], 0.015, 0.012, "#3f2a1a", { ...n, mat: "leather", hd: true });
  }
  if (civ === "dwarf") {
    // A war ram's great horns, curling back and round past its cheeks
    const n = neckAt(0.38 * m.scale, 0.16 * m.scale, mulberry32(hashString(`mount_${civ}`)));
    for (const sx of [-1, 1]) {
      const p0: V3 = [sx * 0.07, 0.85, 0.36];
      const p1: V3 = [sx * 0.17, 0.92, 0.22];
      const p2: V3 = [sx * 0.22, 0.78, 0.18];
      const p3: V3 = [sx * 0.2, 0.68, 0.3];
      along(add, "horn", p0, p1, 0.07, 0.07, "#d6cfc0", { ...n, mat: "bone" });
      along(add, "capsule", p1, p2, 0.06, 0.06, "#d6cfc0", { ...n, mat: "bone" });
      along(add, "horn", p2, p3, 0.05, 0.05, "#d6cfc0", { ...n, mat: "bone" });
    }
  }
  if (civ === "arcane") {
    // The Voidmare's eyes burn violet, over its dark ones
    const n = neckAt(0.74, 0.3, mulberry32(hashString(`mount_${civ}`)));
    eyes(add, n, 1.035, 0.55, 0.065, 0.034, "#e879f9", true);
  }
  return out.parts;
}

/* ============================ MOVING BUILDING PARTS ============================ */

function mechanism(kind: ActorKind): Part[] {
  const out = emptyScene();
  const b = new Builder(out);
  const add: Add = (shape, x, y0, z, w, h, d, color, o) => b.add(shape, x, y0 - h / 2, z, w, h, d, color, o);
  if (kind === "sails") {
    // Windmill sails: a hub, two crossed stocks, and four cloth sails laced to lattice frames
    add("cyl", 0, 0, 0, 0.22, 0.18, 0.22, "#78350f", { rx: Math.PI / 2, mat: "wood" });
    add("cyl", 0, 0, 0.1, 0.1, 0.06, 0.1, "#3f3f46", { rx: Math.PI / 2, mat: "iron" });
    add("box", 0, 0, 0.04, 0.06, 2.6, 0.06, "#5b3b22", { mat: "wood" });
    add("box", 0, 0, 0.04, 2.6, 0.06, 0.06, "#5b3b22", { mat: "wood" });
    const sails: Array<[number, number, number, number]> = [
      [0.14, 0.75, 0.26, 1.0],
      [-0.14, -0.75, 0.26, 1.0],
      [-0.75, 0.14, 1.0, 0.26],
      [0.75, -0.14, 1.0, 0.26]
    ];
    for (const [x, y, w, h] of sails) {
      add("box", x, y, 0.06, w, h, 0.02, S(0), { mat: "cloth" });
      // The lattice laths over the cloth
      const long = h > w;
      for (const k of [-1, 0, 1]) {
        if (long) add("box", x, y + k * 0.32, 0.085, w + 0.02, 0.025, 0.02, "#5b3b22", { mat: "wood" });
        else add("box", x + k * 0.32, y, 0.085, 0.025, h + 0.02, 0.02, "#5b3b22", { mat: "wood" });
      }
    }
  } else if (kind === "gear") {
    // A bronze forge gear: a rim with spokes, a hub with rivets, and teeth
    add("cyl", 0, 0, 0, 1.3, 0.14, 1.3, "#b45309", { rx: Math.PI / 2, mat: "gold" });
    add("cyl", 0, 0, 0.06, 0.4, 0.1, 0.4, "#78350f", { rx: Math.PI / 2, mat: "iron" });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      add("box", Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0, 0.22, 0.22, 0.14, "#b45309", { rz: a, mat: "gold" });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      add("sphere", Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.12, 0.05, 0.05, 0.04, "#3f3f46", { mat: "iron" });
    }
  } else {
    return [];
  }
  return out.parts;
}

/** A moving part drawn with its Normal template (glowing crystals and sparkles are already light) */
function fromTemplate(tpl: SubPart[]): Part[] {
  return tpl.map((sp) => ({ shape: sp.shape, x: sp.x, y: sp.y, z: sp.z, w: sp.w, h: sp.h, d: sp.d, rx: sp.rx, rz: sp.rz, color: typeof sp.color === "number" ? S(sp.color) : sp.color, glow: sp.glow, mat: "gem" }));
}

/* ================================== CATALOG ================================== */

const cache = new Map<ActorKind, HdActorModel>();

/** The HD model of an actor kind (built once) */
export function actorHdModel(kind: ActorKind): HdActorModel {
  let m = cache.get(kind);
  if (m) return m;
  const sep = kind.indexOf("_");
  if (kind.startsWith("light_")) m = { parts: light(kind, kind.slice(6) as CivilizationType), biped: true, winged: false };
  else if (kind.startsWith("mount_")) m = { parts: mountModel(kind.slice(6) as CivilizationType), biped: false, winged: false };
  else if (sep > 0) {
    // 🗡️ `soldier1` … `soldier3`: a soldier in an Armory set
    const role = kind.slice(0, sep);
    const tier = role === "soldier1" ? 1 : role === "soldier2" ? 2 : role === "soldier3" ? 3 : 0;
    m = { parts: person(kind, kind.slice(sep + 1) as CivilizationType, tier ? "soldier" : (role as PersonRole), tier), biped: true, winged: false };
  }
  else if (kind === "sails" || kind === "gear") m = { parts: mechanism(kind), biped: false, winged: false };
  else if (kind === "rings" || kind === "sparkle") m = { parts: fromTemplate(actorTemplate(kind)), biped: false, winged: false };
  else {
    const a = animal(kind as AnimalKind);
    m = { parts: a.parts, biped: false, winged: a.winged };
  }
  cache.set(kind, m);
  return m;
}
