import { Builder, Gait, IDLE_KIND, Surface } from "@/components/3d/city/parts";
import { Rng, mulberry32, range } from "@/utils/random";
import { Add, AddOpts, V3, along, arc, bone, lanternFrame, skull, tail } from "./kitParts";

/*
 * Roving monsters and bandits on the visual rarity ladder (see docs/MODEL_STYLE.md):
 * - common: plain and matte, no glow at all;
 * - uncommon: one accent colour shared by the band, and a small prop (banner, lantern);
 * - rare: metal or glowing trim, and one small looping effect (smoke, a pulsing charm);
 * - epic: a bigger, armoured silhouette, emissive details and bits orbiting it (TierFx adds the sparkles).
 * Every band has a clearly bigger leader in the middle. Figures walk on the GPU (`Builder.walker`): limbs, boots,
 * hands and whatever they hold swing from the same hip or shoulder.
 *
 * HD versions (the HD model kit, InstancedParts `kit`): the kits give every part what it is made of (`mat`), rounder
 * HD shapes (`hdShape`: tapered limbs, egg heads, a beast's pod body and snout), a few HD-only details (`hd`: buckles,
 * pouches, boot cuffs, paws, fur tufts) and a relaxed, seeded rest pose (`pose`: arms carried a little out and forward,
 * never mirrored; the head tilted and turned a touch). Each model adds its own HD-only detail by tier: a common little
 * (matte, no metal shine), an uncommon its accent in a real material, a rare metal fittings, an epic the most.
 */

/** Every roving monster and bandit band is drawn here */
export const isLadderSpawn = (type: string) => type.startsWith("mob-") || type.startsWith("bandit-");

interface Walk {
  radius: number;
  gait?: Gait;
  pace?: number;
}

const BANDIT_WALK: Walk = { radius: 0.35, pace: 0.6 };
const BONE = "#efe6cf";

const place = (b: Builder, x: number, z: number, rot: number, walk?: Walk, y = 0, biped = false) =>
  walk ? b.walker(x, z, rot, walk.gait ?? "walk", walk.radius, { y, pace: walk.pace, biped }) : b.child(x, z, rot, y);

/** A seeded rng for one creature of a band (its HD rest pose): the same every load, different for each creature */
const restRng = (f: Builder) => mulberry32(Math.floor(Math.abs(f.ox * 73.13 + f.oz * 91.71 + f.oy * 17.3 + f.seed * 13.37 + f.rot * 7.7) * 1000));
type Pose = NonNullable<AddOpts>["pose"];


/** Whether a part brings a motion of its own (then a kit's `auto` role leaves it alone) */
const moves = (o: AddOpts = {}) => !!(o.leg || o.arm || o.head || o.torso || o.trail || o.flap || o.idle !== undefined);

/**
 * Adds parts in units of `s` (hip, pivot, neck and tail root too), so a figure is authored once at s = 1. `auto` gives
 * a part added without a motion of its own a role by where it sits (a hat rides the head, war paint the chest)
 */
function scaler(f: Builder, s: number, auto?: (x: number, y0: number, z: number, d: number) => AddOpts | undefined) {
  return (shape: Parameters<Builder["add"]>[0], x: number, y0: number, z: number, w: number, h: number, d: number, color: string, o: AddOpts = {}) => {
    const role = auto && !moves(o) ? auto(x, y0, z, d) : undefined;
    const r = { ...o, ...role };
    f.add(shape, x * s, y0 * s, z * s, w * s, h * s, d * s, color, {
      ...r,
      hip: r.hip !== undefined ? r.hip * s : undefined,
      pivot: r.pivot ? [r.pivot[0] * s, r.pivot[1] * s] : undefined,
      head: r.head ? { y: r.head.y * s, z: (r.head.z ?? 0) * s } : undefined,
      trail: r.trail ? { ...r.trail, root: r.trail.root && [r.trail.root[0] * s, r.trail.root[1] * s, r.trail.root[2] * s] } : undefined,
      pose: r.pose ? { ...r.pose, at: [r.pose.at[0] * s, r.pose.at[1] * s, r.pose.at[2] * s] } : undefined
    });
  };
}

/** Where a figure's fist closes (figure units): a held grip passes through here */
const fist = (side: -1 | 1): V3 => [side * 0.31, 0.585, 0.02];

export interface FigureLook {
  skin: string;
  tunic: string;
  legs: string;
  boots: string;
  belt: string;
  /** Sleeves (default the tunic) */
  sleeves?: string;
  eyes: string;
  glowEyes?: boolean;
  /**
   * The HD face: "person" (default: eyeballs under lids, a brow, nose, mouth, chin and ears), "beast" (for a snout the
   * model adds: eyes with slit pupils under a heavy brow, no nose, mouth or ears) or "skull" (dark sockets, a nose hole,
   * a row of teeth)
   */
  face?: "person" | "beast" | "skull";
  /** The eye whites (default pale; a statue's are its stone) */
  sclera?: string;
  /** HD: everything made of this (a petrified adventurer is all `stone`) */
  allMat?: Surface;
  /** Leave the HD nose or ears off (the model adds its own: a goblin's long ears and pointed nose) */
  nose?: false;
  ears?: false;
}

const SHOULDER = 1.05;

/** A colour darkened (f < 1) or lightened (f > 1) */
export function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v * f)));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, "0")}`;
}

/**
 * HD: a figure's face on its egg head (figure units, riding the neck): eyeballs set into the head under relaxed upper
 * lids, a brow ridge, a nose, a mouth on a chin, and ears; or a beast's slit-pupilled eyes, or a skull's sockets
 */
function face(add: Add, look: FigureLook, neck: AddOpts) {
  const o: AddOpts = { ...neck, hd: true };
  const kind = look.face ?? "person";
  const skin = look.skin;
  const dark = shade(skin, 0.86);
  if (kind === "skull") {
    for (const side of [-1, 1]) {
      add("sphere", side * 0.068, 1.245, 0.12, 0.09, 0.08, 0.08, "#1c1917", { ...o, mat: "stone" }); // eye sockets
      if (look.glowEyes) add("sphere", side * 0.068, 1.26, 0.14, 0.035, 0.035, 0.035, look.eyes, { ...o, glow: true });
    }
    add("drop", 0, 1.19, 0.15, 0.05, 0.07, 0.04, "#1c1917", { ...o, rx: Math.PI, mat: "stone" }); // nose hole
    along(add, "capsule", [-0.12, 1.325, 0.1], [0, 1.34, 0.15], 0.045, 0.05, skin, { ...o, mat: "bone" }); // brow
    along(add, "capsule", [0.12, 1.325, 0.1], [0, 1.34, 0.15], 0.045, 0.05, skin, { ...o, mat: "bone" });
    add("egg", 0, 1.11, 0.06, 0.2, 0.13, 0.2, skin, { ...o, mat: "bone" }); // jaw
    add("box", 0, 1.155, 0.15, 0.13, 0.04, 0.04, "#e7e5e4", { ...o, mat: "bone" }); // teeth
    return;
  }
  // Eyeballs set into the head, an iris (and pupil) on each; glowing eyes are lit all through, with no whites
  for (const side of [-1, 1]) {
    const x = side * 0.062;
    if (look.glowEyes) add("sphere", x, 1.255, 0.13, 0.058, 0.05, 0.058, look.eyes, { ...o, glow: true });
    else {
      add("sphere", x, 1.251, 0.128, 0.058, 0.058, 0.058, look.sclera ?? "#e7e0d2", { ...o, mat: "gem" });
      add("sphere", x, 1.265, 0.143, 0.03, 0.03, 0.03, look.eyes, { ...o, mat: "gem" }); // iris
      // A dark pupil on a bright iris (a beast's a slit)
      if (kind === "beast") add("box", x, 1.267, 0.157, 0.01, 0.026, 0.01, "#0c0a09", { ...o, mat: "gem" });
      else if (!look.sclera && parseInt(look.eyes.slice(1, 3), 16) + parseInt(look.eyes.slice(3, 5), 16) > 160) add("sphere", x, 1.272, 0.155, 0.016, 0.016, 0.016, "#0c0a09", { ...o, mat: "gem" });
    }
    // An upper lid, relaxed half over the eye
    along(add, "capsule", [side * 0.035, 1.298, 0.142], [side * 0.092, 1.295, 0.128], 0.022, 0.02, skin, { ...o, mat: "skin" });
  }
  // The brow ridge (a heavy one on a beast), flat along the forehead
  const bw = kind === "beast" ? 0.05 : 0.032;
  along(add, "capsule", [-0.12, 1.33, 0.1], [0, 1.338, 0.148], bw, bw * 0.8, dark, { ...o, mat: "skin" });
  along(add, "capsule", [0.12, 1.33, 0.1], [0, 1.338, 0.148], bw, bw * 0.8, dark, { ...o, mat: "skin" });
  if (kind === "beast") return;
  if (look.nose !== false) add("egg", 0, 1.185, 0.17, 0.065, 0.1, 0.07, skin, { ...o, mat: "skin", rx: -0.15 }); // nose
  add("egg", 0, 1.11, 0.06, 0.21, 0.14, 0.2, skin, { ...o, mat: "skin" }); // chin and jaw
  along(add, "capsule", [-0.045, 1.178, 0.158], [0.045, 1.178, 0.158], 0.02, 0.018, shade(skin, 0.6), { ...o, mat: "skin" }); // mouth
  if (look.ears !== false) for (const side of [-1, 1]) add("egg", side * 0.168, 1.22, -0.005, 0.045, 0.1, 0.07, skin, { ...o, mat: "skin", rz: side * 0.15 });
}

/**
 * HD: a figure's face put on another head: the figure head (centre y 1.3, 0.34 across) scaled by `s` and moved so its
 * centre sits at local (0, `cy`, `cz`) (a harpy's head, a rider's)
 */
export function faceAt(add: Add, look: FigureLook, neck: AddOpts, cy: number, cz: number, s: number) {
  const t: Add = (shape, x, y0, z, w, h, d, color, o) => add(shape, x * s, (y0 - 1.3) * s + cy, z * s + cz, w * s, h * s, d * s, color, o);
  face(t, look, neck);
}

/** HD: a round shield strapped to the left forearm, its face turned out: a board `r` across, a rim and a boss */
function roundShield(add: Add, hand: AddOpts, board: string, rim: string, r: number, mat: Surface, rimMat: Surface) {
  const [fx, fy, fz] = fist(-1);
  const c: V3 = [fx - 0.1, fy + 0.12, fz + 0.06];
  const o: AddOpts = { ...hand, hd: true };
  add("cyl", c[0], c[1] - 0.025, c[2], r, 0.05, r, board, { ...o, mat, rz: Math.PI / 2 });
  arc(add, [c[0] - 0.005, c[1], c[2]], [0, 1, 0], [0, 0, 1], r / 2, 0, Math.PI * 2, 12, 0.045, rim, { ...o, mat: rimMat });
  add("sphere", c[0] - 0.045, c[1] - 0.05, c[2], 0.06, 0.1, 0.1, rim, { ...o, mat: rimMat }); // boss
}

/** HD: a curved scimitar gripped in the right fist and held forward and up */
function scimitar(add: Add, hand: AddOpts, steel: string, grip: string) {
  const [x, y, z] = fist(1);
  const o: AddOpts = { ...hand, hd: true };
  along(add, "cyl", [x, y - 0.05, z - 0.08], [x, y + 0.03, z + 0.07], 0.045, 0.045, grip, { ...o, mat: "leather" });
  along(add, "box", [x, y - 0.03, z + 0.09], [x, y + 0.08, z + 0.06], 0.13, 0.03, "#a16207", { ...o, mat: "dull" }); // guard
  along(add, "box", [x, y + 0.03, z + 0.08], [x, y + 0.22, z + 0.36], 0.02, 0.07, steel, { ...o, mat: "dull" });
  along(add, "blade", [x, y + 0.205, z + 0.33], [x, y + 0.46, z + 0.56], 0.02, 0.08, steel, { ...o, mat: "dull" });
}

/** HD: a hood over the head (a shell over its crown and back, open round the face) and a short mantle on the shoulders */
function hood(add: Add, neck: AddOpts, color: string, mantle = true) {
  const o: AddOpts = { ...neck, hd: true, mat: "cloth" };
  add("egg", 0, 1.1, -0.06, 0.44, 0.46, 0.36, color, o); // its back, over the crown
  for (const side of [-1, 1]) along(add, "capsule", [side * 0.17, 1.12, 0.03], [side * 0.15, 1.45, 0.02], 0.085, 0.13, color, o); // its sides, round the face
  along(add, "capsule", [-0.15, 1.46, 0.06], [0.15, 1.46, 0.06], 0.1, 0.1, color, o); // its rim over the brow
  // Its point hangs down the back and trails the head
  add("drop", 0, 1.22, -0.27, 0.14, 0.3, 0.12, color, { ...neck, hd: true, mat: "cloth", rx: -2.4 });
  if (mantle) add("egg", 0, 0.86, -0.02, 0.62, 0.26, 0.4, color, { torso: true, hd: true, mat: "cloth" }); // the mantle
}

/** HD: a drawstring purse hanging from a fist on its cord */
function pouch(add: Add, hand: AddOpts, side: -1 | 1, color: string) {
  const [x, y, z] = fist(side);
  const o: AddOpts = { ...hand, hd: true, mat: "leather" };
  along(add, "capsule", [x, y - 0.04, z + 0.03], [x, y - 0.17, z + 0.04], 0.025, 0.025, "#3f2a1a", o); // the cord, through the fist
  add("taper", x, y - 0.22, z + 0.04, 0.09, 0.07, 0.09, color, { ...o, rx: Math.PI }); // its gathered neck
  add("egg", x, y - 0.44, z + 0.04, 0.24, 0.24, 0.22, color, o); // the purse, heavy with coin
}

/** HD: a crossbow gripped in the right fist and aimed ahead: stock, bow, string, a bolt and the foot stirrup */
function crossbow(add: Add, hand: AddOpts, wood: string, metal: string) {
  const [x, y, z] = fist(1);
  const o: AddOpts = { ...hand, hd: true };
  along(add, "box", [x, y - 0.03, z - 0.16], [x, y + 0.01, z + 0.5], 0.06, 0.08, wood, { ...o, mat: "wood" }); // stock
  const bow: V3 = [x, y + 0.02, z + 0.46];
  for (const s of [-1, 1]) {
    const tip: V3 = [x + s * 0.27, y + 0.02, z + 0.36];
    along(add, "taper", bow, tip, 0.04, 0.035, metal, { ...o, mat: "dull" }); // the bow's arms
    along(add, "cyl", tip, [x, y + 0.045, z + 0.18], 0.012, 0.012, "#d6d3d1", { ...o, mat: "cloth" }); // string, drawn back
  }
  along(add, "cyl", [x, y + 0.05, z + 0.18], [x, y + 0.05, z + 0.56], 0.02, 0.02, wood, { ...o, mat: "wood" }); // bolt in its groove
  along(add, "blade", [x, y + 0.05, z + 0.55], [x, y + 0.05, z + 0.63], 0.012, 0.035, metal, { ...o, mat: "dull" });
  along(add, "capsule", [x - 0.06, y + 0.01, z + 0.52], [x + 0.06, y + 0.01, z + 0.52], 0.025, 0.025, metal, { ...o, mat: "dull" }); // stirrup
}

/** HD: a sword gripped in a fist (default the right) and held forward: pommel, wrapped grip, crossguard and a blade `len` long */
function sword(add: Add, hand: AddOpts, steel: string, grip: string, guard: string, mat: Surface, len: number, side: -1 | 1 = 1) {
  const [x, y, z] = fist(side);
  const o: AddOpts = { ...hand, hd: true };
  add("sphere", x, y - 0.06, z - 0.11, 0.06, 0.06, 0.06, guard, { ...o, mat });
  along(add, "cyl", [x, y - 0.03, z - 0.09], [x, y + 0.01, z + 0.07], 0.045, 0.045, grip, { ...o, mat: "leather" });
  along(add, "box", [x, y - 0.06, z + 0.09], [x, y + 0.09, z + 0.07], 0.05, 0.035, guard, { ...o, mat });
  along(add, "blade", [x, y + 0.01, z + 0.09], [x, y + 0.08, z + 0.09 + len], 0.025, 0.065, steel, { ...o, mat });
}

/** HD: a spear held upright through the right fist: a shaft from the ground to `top`, a leaf point, a binding */
function spear(add: Add, hand: AddOpts, wood: string, steel: string, mat: Surface, top: number, binding: string) {
  const [x, y, z] = fist(1);
  const o: AddOpts = { ...hand, hd: true };
  along(add, "cyl", [x, 0.12, z], [x, top, z + 0.03], 0.045, 0.045, wood, { ...o, mat: "wood" });
  along(add, "blade", [x, top - 0.02, z + 0.03], [x, top + 0.3, z + 0.035], 0.03, 0.11, steel, { ...o, mat });
  along(add, "cyl", [x, top - 0.1, z + 0.028], [x, top + 0.0, z + 0.03], 0.065, 0.065, binding, { ...o, mat: "cloth" });
  void y;
}

/** HD: a great club hanging from the right fist, its head forward and low, banded and studded with iron */
function club(add: Add, hand: AddOpts, wood: string, iron: string) {
  const [x, y, z] = fist(1);
  const o: AddOpts = { ...hand, hd: true };
  const head: V3 = [x, 0.1, z + 0.5];
  const grip: V3 = [x, y + 0.08, z - 0.04];
  along(add, "taper", head, grip, 0.17, 0.17, wood, { ...o, mat: "wood" });
  const at = (t: number): V3 => [head[0] + (grip[0] - head[0]) * t, head[1] + (grip[1] - head[1]) * t, head[2] + (grip[2] - head[2]) * t];
  for (const [t0, t1] of [
    [0.16, 0.24],
    [0.36, 0.44]
  ]) {
    along(add, "cyl", at(t0), at(t1), 0.21 - t0 * 0.12, 0.21 - t0 * 0.12, iron, { ...o, mat: "iron" });
  }
  // Spikes driven through its head, pointing out
  const [cx, cy, cz] = at(0.08);
  for (const [ox, oy, oz] of [
    [0.14, 0, 0],
    [-0.14, 0, 0],
    [0, 0.1, 0.1],
    [0, -0.1, 0.06]
  ]) {
    along(add, "cone", [cx + ox * 0.4, cy + oy * 0.4, cz + oz * 0.4], [cx + ox, cy + oy, cz + oz], 0.05, 0.05, iron, { ...o, mat: "iron" });
  }
}

/**
 * A person or humanoid monster, ~1.5 tall at s = 1, facing +z: boots, legs, belted tunic, arms with hands, head and
 * eyes. Returns its frame (`add` in figure units) and `hand(side)`: options that make a held thing swing with that arm.
 * `seated`: a rider, whose legs don't stride.
 */
function figure(b: Builder, x: number, z: number, rot: number, look: FigureLook, s = 1, walk?: Walk, seated = false) {
  const f = place(b, x, z, rot, walk, 0, true);
  // HD rest pose: arms carried a little out and forward, never mirrored; the head tilted and turned a touch
  const r = restRng(f);
  const armPose = (side: -1 | 1): Pose => ({ at: [side * 0.31, SHOULDER, 0], rz: side * (0.05 + r() * 0.09), rx: -(0.03 + r() * 0.13) });
  const poses = { [-1]: armPose(-1), [1]: armPose(1) } as Record<-1 | 1, Pose>;
  // A figure's neck: its head turns about it
  const neck: AddOpts = { head: { y: 0.96 }, pose: { at: [0, 0.96, 0], rz: (r() - 0.5) * 0.16, ry: (r() - 0.5) * 0.32, rx: (r() - 0.35) * 0.12 } };
  // What a caller adds rides its head (hats, ears, snouts) or its chest (paint, plates), by height
  const add0 = scaler(f, s, (_x, y0) => (y0 >= 0.95 ? neck : y0 >= 0.7 ? { torso: true } : undefined));
  // A figure made all of one thing (a statue) is drawn in that material in HD
  const add: Add = look.allMat ? (shape, x, y0, z, w, h, d, color, o = {}) => add0(shape, x, y0, z, w, h, d, color, { ...o, mat: look.allMat }) : add0;
  for (const side of [-1, 1]) {
    const leg = seated ? undefined : side < 0 ? 1 : -1;
    add("box", side * 0.1, 0.1, 0, 0.15, 0.53, 0.17, look.legs, { leg, hip: 0.63, mat: "cloth", hdShape: "limb" });
    add("box", side * 0.1, 0, 0.04, 0.25, 0.16, 0.34, look.boots, { leg, hip: 0.63, mat: "leather" });
    add("box", side * 0.1, 0.16, 0.04, 0.27, 0.06, 0.36, look.boots, { leg, hip: 0.63, mat: "leather", hd: true }); // boot cuff
  }
  // The tunic turns with the shoulders; the belt stays with the hips
  add("box", 0, 0.6, 0, 0.46, 0.52, 0.28, look.tunic, { torso: true, mat: "cloth", hdShape: "limb" });
  add("box", 0, 0.64, 0, 0.56, 0.09, 0.38, look.belt, { hd: false });
  add("cyl", 0, 0.64, 0, 0.54, 0.1, 0.36, look.belt, { mat: "leather", hd: true }); // HD: a belt round the waist
  add("box", 0, 0.655, 0.19, 0.08, 0.07, 0.025, "#44403c", { mat: "iron", hd: true }); // a flat, dark buckle set on the belt, nothing hanging below it
  add("box", 0.2, 0.5, 0.17, 0.12, 0.14, 0.08, look.belt, { mat: "leather", hd: true }); // pouch
  for (const side of [-1, 1] as const) {
    const arm: AddOpts = { arm: side, hip: SHOULDER, pose: poses[side] };
    add("box", side * 0.31, 0.62, 0, 0.13, 0.44, 0.15, look.sleeves ?? look.tunic, { ...arm, mat: "cloth", hdShape: "limb" });
    add("sphere", side * 0.31, 0.53, 0.01, 0.13, 0.13, 0.13, look.skin, { ...arm, hd: false });
    // HD: a closed fist (knuckles forward) with its thumb wrapped over, in place of the ball hand
    add("egg", side * 0.31, 0.515, 0.02, 0.135, 0.15, 0.15, look.skin, { ...arm, mat: "skin", hd: true, rx: 0.15 });
    along(add, "capsule", [side * 0.27, 0.55, 0.07], [side * 0.3, 0.63, 0.1], 0.05, 0.05, look.skin, { ...arm, mat: "skin", hd: true });
    add("sphere", side * 0.29, 0.94, 0, 0.17, 0.17, 0.18, look.sleeves ?? look.tunic, { ...arm, mat: "cloth", hd: true }); // HD: the shoulder
  }
  add("sphere", 0, 1.13, 0, 0.34, 0.34, 0.34, look.skin, { ...neck, mat: "skin", hdShape: "egg" });
  for (const side of [-1, 1]) add("box", side * 0.07, 1.27, 0.165, 0.06, 0.05, 0.05, look.eyes, { ...neck, glow: look.glowEyes, hd: false });
  face(add, look, neck); // HD: a real face in place of the two square eyes
  const hand = (side: -1 | 1): AddOpts => ({ arm: side, hip: SHOULDER, pivot: [side * 0.31, 0], pose: poses[side] });
  return { add, hand, neck };
}

interface BeastLook {
  fur: string;
  ruff: string;
  dark: string;
  eyes: string;
  glowEyes?: boolean;
}

/** A four-legged beast (wolf, war-boar), ~0.85 tall at s = 1, facing +z; its legs step in diagonal pairs */
function beast(b: Builder, x: number, z: number, rot: number, look: BeastLook, s = 1, walk?: Walk) {
  const q = place(b, x, z, rot, walk);
  // HD rest pose: the head turned and tilted a touch, the tail carried its own way
  const r = restRng(q);
  // Its neck, where its head turns
  const neck: AddOpts = { head: { y: 0.62, z: 0.5 }, pose: { at: [0, 0.62, 0.5], ry: (r() - 0.5) * 0.42, rz: (r() - 0.5) * 0.16, rx: (r() - 0.4) * 0.14 } };
  // What the caller adds in front of the chest at head height rides the head (horns, tusks)
  const add = scaler(q, s, (_x, y0, z, d) => (z - d / 2 >= 0.45 && y0 >= 0.45 ? neck : undefined));
  for (const [lx, lz, leg] of [
    [-0.15, 0.32, 1],
    [0.15, 0.32, -1],
    [-0.15, -0.32, -1],
    [0.15, -0.32, 1]
  ] as const) {
    add("box", lx, 0, lz, 0.12, 0.42, 0.12, look.dark, { leg, mat: "fur", hdShape: "limb" });
    add("egg", lx, 0, lz + 0.03, 0.13, 0.07, 0.16, look.dark, { leg, hip: 0.42, mat: "fur", hd: true }); // paw
  }
  add("box", 0, 0.36, 0, 0.42, 0.36, 0.95, look.fur, { mat: "fur", hdShape: "pod" });
  add("box", 0, 0.34, 0.3, 0.54, 0.46, 0.46, look.ruff, { hd: false }); // shaggy chest
  // HD: a deep chest under a throat that carries the head, in place of the shaggy block
  add("egg", 0, 0.3, 0.34, 0.4, 0.4, 0.38, look.ruff, { mat: "fur", hd: true });
  add("taper", 0, 0.45, 0.5, 0.26, 0.34, 0.26, look.fur, { ...neck, rx: 0.8, mat: "fur", hd: true });
  for (const [tz, tr] of [
    [0.12, -1.25],
    [-0.12, -1.4],
    [-0.34, -1.55]
  ]) {
    add("drop", 0, 0.6, tz, 0.12, 0.18, 0.1, look.fur, { rx: tr, mat: "fur", hd: true }); // tufts along the back
  }
  add("box", 0, 0.6, 0.66, 0.3, 0.28, 0.3, look.fur, { ...neck, mat: "fur", hdShape: "egg" });
  add("box", 0, 0.54, 0.88, 0.16, 0.14, 0.2, look.dark, { ...neck, hd: false }); // muzzle
  add("box", 0, 0.6, 1.0, 0.07, 0.05, 0.06, "#0c0a09", { ...neck, hd: false }); // nose
  // HD: a muzzle growing out of the face (not hung in front of it), its nose on the tip, a lower jaw and the lips' line
  add("snout", 0, 0.555, 0.84, 0.19, 0.16, 0.38, look.dark, { ...neck, mat: "fur", hd: true, rx: 0.12 });
  add("egg", 0, 0.6, 1.005, 0.085, 0.06, 0.07, "#0c0a09", { ...neck, mat: "leather", hd: true });
  along(add, "capsule", [0, 0.555, 0.68], [0, 0.535, 0.93], 0.12, 0.09, look.dark, { ...neck, mat: "fur", hd: true });
  for (const side of [-1, 1]) {
    add("cone", side * 0.09, 0.86, 0.62, 0.09, 0.16, 0.06, look.dark, { ...neck, mat: "fur" }); // ears
    add("box", side * 0.08, 0.76, 0.835, 0.05, 0.04, 0.05, look.eyes, { ...neck, glow: look.glowEyes, hd: false });
    // HD: round eyes set into the head (an amber iris and a dark pupil, or lit all through) under a furred brow
    if (look.glowEyes) add("sphere", side * 0.085, 0.75, 0.77, 0.05, 0.045, 0.05, look.eyes, { ...neck, glow: true, hd: true });
    else {
      add("sphere", side * 0.085, 0.75, 0.765, 0.05, 0.045, 0.05, "#854d0e", { ...neck, mat: "gem", hd: true });
      add("sphere", side * 0.085, 0.758, 0.783, 0.028, 0.028, 0.028, look.eyes, { ...neck, mat: "gem", hd: true });
    }
    along(add, "capsule", [side * 0.13, 0.8, 0.71], [side * 0.03, 0.815, 0.775], 0.05, 0.05, look.fur, { ...neck, mat: "fur", hd: true });
    along(add, "capsule", [side * 0.075, 0.585, 0.72], [side * 0.045, 0.565, 0.95], 0.02, 0.02, "#1c1917", { ...neck, mat: "leather", hd: true }); // lips
    add("egg", side * 0.14, 0.57, 0.63, 0.07, 0.13, 0.15, look.ruff, { ...neck, mat: "fur", hd: true }); // cheek ruff
  }
  add("cyl", 0, 0.5, -0.62, 0.08, 0.5, 0.08, look.dark, { rx: -1.0, trail: { lag: 0.22, damp: 0.25, root: [0, 0.62, -0.45] }, hd: false }); // tail
  // HD: a bushy tail hanging from the rump and curling up toward its pale tip, bending as it trails
  tail(add, [0, 0.62, -0.45], { len: 0.5, w0: 0.12, w1: 0.15, n: 5, pitch: 0.85, curl: -1.0, yaw: (r() - 0.5) * 0.5, lag: 0.12, step: 0.07, color: look.fur, tip: look.ruff }, { mat: "fur", hd: true });
  return { add, frame: q, neck };
}

/** Embers or motes orbiting a point: epic tier's orbiting bits */
function orbit(b: Builder, cx: number, cz: number, r: number, y: number, n: number, color: string, size = 0.14) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.add("octa", cx + Math.cos(a) * r, y + (i % 2) * 0.35, cz + Math.sin(a) * r, size, size * 1.5, size, color, { glow: true, idle: IDLE_KIND.spin, pivot: [cx, cz], phase: 0.01 + a });
  }
}

/** A tentacle arching out of the ground, swaying */
function stackedArc(b: Builder, angle: number, radius: number, color: string, o: AddOpts = {}) {
  const segments = 7;
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const r = radius * (0.4 + t * 0.6);
    const y = Math.sin(t * Math.PI) * 2.2;
    const sz = 0.55 * (1 - t * 0.6);
    b.add("sphere", Math.cos(angle) * r, y - sz / 2, Math.sin(angle) * r, sz, sz, sz, color, { ...o, idle: IDLE_KIND.sway, phase: 0.01 + angle + t * 1.4 });
  }
}

/** A fire's smoke: three puffs rising one after another (rare tier's looping effect) */
function smokeAt(b: Builder, x: number, y: number, z: number, s = 1, color = "#a8a29e") {
  for (let i = 0; i < 3; i++) b.add("sphere", x, y, z, 0.38 * s, 0.34 * s, 0.38 * s, color, { idle: IDLE_KIND.smoke, phase: 0.01 + (i * Math.PI * 2) / 3 });
}

/** Builds one of the LADDER_SPAWNS */
export function buildLadderSpawn(type: string, b: Builder, rng: Rng) {
  switch (type) {
    /* ------------------------------ COMMON ------------------------------ */
    case "mob-wolf": {
      // A plain grey pack: the alpha leads, two packmates follow; nothing glows
      const alpha = { fur: "#57534e", ruff: "#78716c", dark: "#292524", eyes: "#1c1917" };
      const mate = { fur: "#6b7280", ruff: "#9ca3af", dark: "#374151", eyes: "#1c1917" };
      beast(b, 0, 0.2, 0.2, alpha, 2.0, { radius: 0.6, pace: 0.9 });
      beast(b, -1.5, -0.6, 0.7, mate, 1.55, { radius: 0.5, pace: 1.15 });
      beast(b, 1.4, -0.9, -0.5, mate, 1.45, { radius: 0.5, pace: 1.2 });
      for (let i = 0; i < 4; i++) {
        const [x, z, a] = [1.0 + range(rng, -0.3, 0.3), 1.3 + range(rng, -0.25, 0.25), range(rng, 0, Math.PI)];
        b.add("cyl", x, 0.04 - 0.25, z, 0.07, 0.5, 0.07, BONE, { rz: Math.PI / 2, ry: a, hd: false }); // gnawed bones
        // HD: real bones, a shaft with knobbed ends, lying where they were dropped
        const [dx, dz] = [Math.cos(a) * 0.24, -Math.sin(a) * 0.24];
        bone(b.add.bind(b), [x - dx, 0.045, z - dz], [x + dx, 0.045, z + dz], 0.065, BONE, { mat: "bone", hd: true });
      }
      skull(b.add.bind(b), 1.55, 0.08, 0.95, 0.3, BONE, 0.7, { mat: "bone", hd: true }); // HD: what is left of their last kill
      break;
    }
    case "bandit-looters": {
      // The Bandit King's looters running about a plot, spread to its size. Accent: his blood red; prop: what they stole
      const BURLAP = "#a8895a";
      const look: FigureLook = { skin: "#d6a77a", tunic: "#7f1d1d", legs: "#292524", boots: "#3f2a1a", belt: "#57534e", eyes: "#1c1917" };
      const YARD: Walk = { radius: 0.7, pace: 2.2 };
      const RUN: Walk = { radius: 0.85, pace: 2.2 };
      // A plot's fence stands 4.35 from its centre: three in the yard, the rest round the outside of the fence
      const spots: Array<[number, number, Walk]> = [
        [-2.3, 2.1, YARD],
        [2.5, 1.7, YARD],
        [-2.6, -1.3, YARD]
      ];
      const OUTSIDE = 7;
      for (let i = 0; i < OUTSIDE; i++) {
        const a = (i / OUTSIDE) * Math.PI * 2 + range(rng, -0.2, 0.2);
        // Round a square just outside the fence, not a circle that would cut its corners
        const r = 5.6 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
        spots.push([Math.cos(a) * r, Math.sin(a) * r, RUN]);
      }
      for (let i = 0; i < spots.length; i++) {
        const [x, z, walk] = spots[i];
        const lead = i === 0;
        const { add, hand, neck } = figure(b, x, z, range(rng, -Math.PI, Math.PI), look, lead ? 1.05 : range(rng, 0.82, 0.92), walk);
        add("cone", 0, 1.2, -0.03, 0.44, 0.46, 0.44, "#450a0a", { hd: false }); // hood
        hood(add, neck, "#450a0a"); // HD: a real hood open round the face
        if (i % 3 === 2) {
          // A stolen bag swinging from each fist
          for (const side of [-1, 1] as const) {
            add("sphere", side * 0.31, 0.3, 0.12, 0.28, 0.3, 0.28, BURLAP, { ...hand(side), hd: false });
            pouch(add, hand(side), side, BURLAP); // HD: a drawstring bag swinging by its cord
          }
        } else {
          // A fat sack on the back, its neck tied off with a cord
          add("egg", 0, 0.62, -0.36, 0.56, 0.66, 0.46, BURLAP, { torso: true, mat: "cloth" });
          add("cyl", 0, 1.26, -0.36, 0.2, 0.08, 0.2, "#57534e", { torso: true, mat: "leather" });
          add("cone", 0, 1.34, -0.36, 0.24, 0.16, 0.24, BURLAP, { torso: true, mat: "cloth" });
        }
        if (lead) {
          add("box", 0.31, 0.5, 0.3, 0.05, 0.06, 0.62, "#9ca3af", { ...hand(1), hd: false }); // sabre
          sword(add, hand(1), "#9ca3af", "#3f2a1a", "#57534e", "dull", 0.58); // HD: the sabre gripped in the fist
        }
      }
      break;
    }
    case "bandit-highwayman": {
      // Three masked riders-on-foot in dark coats; plain steel, no shine
      const look: FigureLook = { skin: "#e0b48a", tunic: "#374151", legs: "#1f2937", boots: "#3f2a1a", belt: "#57534e", eyes: "#1c1917", nose: false };
      for (const [x, z, r, s] of [
        [0, -0.1, 0.1, 1.15],
        [-0.95, 0.5, 0.35, 0.95],
        [0.85, 0.6, -0.25, 0.95]
      ]) {
        const { add, hand, neck } = figure(b, x, z, r, look, s, BANDIT_WALK);
        add("cyl", 0, 1.36, 0, 0.56, 0.05, 0.56, "#111827", { mat: "cloth" }); // hat brim
        add("cone", 0, 1.41, -0.02, 0.36, 0.26, 0.34, "#111827", { mat: "cloth", hdShape: "taper" }); // its crown (HD: a felt crown)
        add("cyl", 0, 1.41, -0.02, 0.3, 0.06, 0.3, "#3f2a1a", { mat: "leather", hd: true }); // hat band
        add("box", 0, 1.19, 0.17, 0.32, 0.08, 0.06, "#7f1d1d", { hd: false }); // mask
        // HD: the mask tied round the lower face, over the nose, its knot's ends trailing at the back
        add("egg", 0, 1.11, 0.02, 0.35, 0.17, 0.34, "#7f1d1d", { ...neck, mat: "cloth", hd: true });
        for (const side of [-1, 1]) add("box", side * 0.04, 1.08, -0.2, 0.06, 0.14, 0.03, "#7f1d1d", { trail: { lag: 0.2 + side * 0.04, damp: 0.3, root: [0, 1.2, -0.17] }, mat: "cloth", hd: true, rz: side * 0.2 });
        add("box", 0.31, 0.5, 0.3, 0.05, 0.06, 0.62, "#9ca3af", { ...hand(1), hd: false }); // sabre
        sword(add, hand(1), "#9ca3af", "#3f2a1a", "#57534e", "dull", 0.58); // HD: the sabre gripped in the fist
        // HD: the long coat's tails swing behind as they walk
        add("box", 0, 0.32, -0.22, 0.44, 0.7, 0.05, look.tunic, { trail: { lag: 0.2, damp: 0.45, root: [0, 1.02, -0.22] }, mat: "cloth", hd: true });
      }
      b.add("cyl", 0.2, 0.13 - 1.1, 1.7, 0.26, 2.2, 0.26, "#78350f", { rz: Math.PI / 2, ry: 0.3, mat: "wood", hdShape: "trunk" }); // log roadblock, lying on the road
      b.add("cyl", -1.6, 0, -1.0, 0.07, 1.4, 0.07, "#3f2a1a", { mat: "wood" }); // waymark post
      b.add("box", -1.45, 1.0, -1.0, 0.45, 0.22, 0.05, "#78350f", { mat: "wood" });
      // HD: the sign's arrow point, a cap on the post, and the nails holding the sign
      b.add("prism", -1.165, 1.0, -1.0, 0.22, 0.12, 0.05, "#78350f", { mat: "wood", hd: true, rz: -Math.PI / 2 });
      b.add("cone", -1.6, 1.4, -1.0, 0.13, 0.1, 0.13, "#3f2a1a", { mat: "wood", hd: true });
      for (const nx of [-1.62, -1.32]) b.add("sphere", nx, 1.08, -0.95, 0.04, 0.04, 0.04, "#57534e", { mat: "dull", hd: true });
      break;
    }

    /* ----------------------------- UNCOMMON ----------------------------- */
    case "mob-goblin": {
      // Accent: blood-red war paint and bandanas on every goblin; prop: their tattered red banner
      const RED = "#dc2626";
      const look: FigureLook = { skin: "#65a30d", tunic: "#78350f", legs: "#57534e", boots: "#3f2a1a", belt: "#a16207", eyes: "#facc15", nose: false, ears: false };
      for (const [x, z, r, s, boss] of [
        [0, 0, 0.1, 0.95, 1],
        [-1.0, 0.5, 0.4, 0.72, 0],
        [0.9, 0.6, -0.3, 0.72, 0],
        [0.2, -1.0, 3.0, 0.7, 0]
      ]) {
        const { add, hand, neck } = figure(b, x, z, r, look, s, { radius: 0.4, pace: 1.2 });
        for (const side of [-1, 1]) add("cone", side * 0.24, 1.2, 0, 0.09, 0.3, 0.09, look.skin, { rz: side * -1.2, mat: "skin" }); // long ears
        add("cone", 0, 1.18, 0.19, 0.07, 0.14, 0.07, look.skin, { rx: Math.PI / 2, mat: "skin" }); // nose
        add("box", 0, 1.3, 0, 0.38, 0.08, 0.38, RED, { mat: "cloth" }); // bandana
        // HD: the bandana's knot, its two ends trailing behind the head
        for (const side of [-1, 1]) add("box", side * 0.05, 1.18, -0.24, 0.07, 0.16, 0.04, RED, { trail: { lag: 0.18 + side * 0.04, damp: 0.3, root: [0, 1.3, -0.2] }, mat: "cloth", hd: true, rz: side * 0.25 });
        add("box", 0, 0.92, 0.17, 0.3, 0.06, 0.06, RED, { mat: "skin" }); // war-paint stripe
        // HD: a leather baldric across the chest
        add("box", 0, 0.74, 0, 0.09, 0.62, 0.34, "#3f2a1a", { torso: true, rz: 0.7, mat: "leather", hd: true });
        if (boss) {
          add("cone", 0, 1.38, -0.02, 0.36, 0.34, 0.36, RED, { ...neck, mat: "cloth" }); // the boss's red hood
          add("box", 0.31, 0.45, 0.32, 0.06, 0.18, 0.6, "#a8a29e", { ...hand(1), rx: 0.2, hd: false }); // cleaver
          // HD: a wrapped grip through the fist and a broad chopping blade, notched along its edge
          const [gx, gy, gz] = fist(1);
          along(add, "cyl", [gx, gy - 0.07, gz - 0.06], [gx, gy + 0.03, gz + 0.12], 0.05, 0.05, "#3f2a1a", { ...hand(1), mat: "leather", hd: true });
          along(add, "box", [gx, gy + 0.02, gz + 0.1], [gx, gy + 0.14, gz + 0.55], 0.03, 0.2, "#a8a29e", { ...hand(1), mat: "dull", hd: true });
          along(add, "box", [gx, gy - 0.07, gz + 0.14], [gx, gy + 0.03, gz + 0.5], 0.035, 0.03, "#57534e", { ...hand(1), mat: "dull", hd: true }); // its thick spine
        } else {
          add("cyl", 0.31, 0.2, 0.18, 0.05, 1.5, 0.05, "#5b3b22", { ...hand(1), hd: false }); // spear
          add("cone", 0.31, 1.7, 0.18, 0.11, 0.24, 0.11, "#a8a29e", { ...hand(1), hd: false });
          spear(add, hand(1), "#5b3b22", "#a8a29e", "dull", 1.85, RED); // HD: the spear through the fist, a red rag bound under its point
        }
      }
      b.add("cyl", 1.7, 0, -0.8, 0.07, 2.4, 0.07, "#3f2a1a", { mat: "wood" }); // banner pole
      b.add("box", 1.98, 1.6, -0.8, 0.55, 0.7, 0.03, RED, { idle: IDLE_KIND.flutter, mat: "cloth" });
      b.add("box", 1.7, 2.27, -0.8, 0.06, 0.06, 0.66, "#3f2a1a", { mat: "wood", hd: true, rx: Math.PI / 2, ry: Math.PI / 2 }); // crossbar
      b.add("sphere", 1.7, 2.4, -0.8, 0.22, 0.24, 0.22, BONE, { hd: false }); // skull atop
      skull(b.add.bind(b), 1.7, 2.4, -0.8, 0.24, BONE, 0.4, { mat: "bone", hd: true }); // HD: a real skull, staring down the road
      break;
    }
    case "bandit-smuggler": {
      // Accent: sea-teal scarves and tarp; prop: the leader's lantern
      const TEAL = "#0d9488";
      const look: FigureLook = { skin: "#c99a6e", tunic: "#3f3f46", legs: "#292524", boots: "#3f2a1a", belt: TEAL, eyes: "#1c1917" };
      for (const [x, z, r, s, lead] of [
        [-0.2, 0.4, 0.2, 1.1, 1],
        [-1.2, -0.1, 0.6, 0.95, 0],
        [0.9, 0.7, -0.4, 0.95, 0]
      ]) {
        const { add, hand, neck } = figure(b, x, z, r, look, s, BANDIT_WALK);
        add("box", 0, 1.03, 0, 0.42, 0.1, 0.34, TEAL, { hd: false }); // scarf
        // HD: a teal scarf wound round the neck, its ends hanging down the back
        add("egg", 0, 1.0, 0, 0.42, 0.14, 0.38, TEAL, { torso: true, mat: "cloth", hd: true });
        for (const side of [-1, 1]) add("box", side * 0.06, 0.66, -0.2, 0.09, 0.36, 0.03, TEAL, { trail: { lag: 0.18 + side * 0.04, damp: 0.35, root: [0, 1.04, -0.18] }, mat: "cloth", hd: true, rz: side * 0.08 });
        add("cone", 0, 1.22, -0.03, 0.42, 0.4, 0.42, "#1c1917", { hd: false }); // hood
        hood(add, neck, "#1c1917", false); // HD: a dark hood open round the face
        if (lead) {
          add("cyl", -0.31, 0.32, 0.12, 0.02, 0.2, 0.02, "#44403c", { ...hand(-1), hd: false }); // lantern hook
          add("box", -0.31, 0.16, 0.12, 0.16, 0.18, 0.16, "#44403c", { ...hand(-1), hd: false });
          add("sphere", -0.31, 0.19, 0.12, 0.1, 0.12, 0.1, "#fcd34d", { ...hand(-1), glow: true });
          // HD: an iron lantern frame round the flame (it shows now), hanging from the fist on its chain
          lanternFrame(add, -0.31, 0.16, 0.12, 0.15, 0.18, "#44403c", hand(-1));
          along(add, "capsule", [-0.31, 0.53, 0.06], [-0.31, 0.43, 0.12], 0.025, 0.025, "#44403c", { ...hand(-1), mat: "dull", hd: true });
        } else {
          add("box", 0.22, 1.1, -0.05, 0.38, 0.3, 0.32, "#92400e", { ...hand(1), mat: "wood", hdShape: "block" }); // a crate on the shoulder
          for (const dz of [-0.08, 0.08]) add("box", 0.22, 1.08, -0.05 + dz, 0.43, 0.34, 0.03, "#a8a29e", { ...hand(1), mat: "cloth", hd: true }); // HD: rope round it
        }
      }
      b.add("box", 0.9, 0, -0.9, 0.8, 0.7, 0.8, "#92400e", { mat: "wood" });
      b.add("box", 0.9, 0.7, -0.9, 0.6, 0.5, 0.6, "#a16207", { mat: "wood" });
      b.add("box", 0.9, 1.2, -0.9, 0.9, 0.06, 0.9, TEAL, { rz: 0.08, mat: "cloth" }); // tarp
      b.add("cyl", -0.6, 0, -1.2, 0.6, 0.8, 0.6, "#7c4a24", { mat: "wood" });
      b.add("cyl", -1.3, 0, -0.6, 0.5, 0.7, 0.5, "#7c4a24", { mat: "wood" });
      // HD: the crates are boarded, corner battens standing proud; iron hoops round the barrels; ropes over the tarp
      {
        const o: AddOpts = { mat: "wood", hd: true };
        for (const [cx, y0, half, h] of [
          [0.9, 0, 0.42, 0.76],
          [0.9, 0.7, 0.32, 0.56]
        ])
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("box", cx + sx * half, y0, -0.9 + sz * half, 0.08, h, 0.08, "#78350f", o);
        for (const [x, z, w, h] of [
          [-0.6, -1.2, 0.6, 0.8],
          [-1.3, -0.6, 0.5, 0.7]
        ])
          for (const t of [0.12, 0.82]) b.add("cyl", x, h * t - 0.025, z, w + 0.06, 0.05, w + 0.06, "#44403c", { mat: "dull", hd: true });
        for (const dz of [-0.25, 0.25]) b.add("box", 0.9, 1.25, -0.9 + dz, 0.96, 0.03, 0.03, "#a8a29e", { mat: "cloth", hd: true, rz: 0.08 });
      }
      break;
    }

    /* ------------------------------- RARE ------------------------------- */
    case "mob-troll": {
      // Metal: the chief's iron pauldrons, collar and banded club; glowing amber eyes; looping effect: their cook-fire's smoke
      const IRON = "#94a3b8";
      const chief: FigureLook = { skin: "#64748b", tunic: "#57534e", legs: "#475569", boots: "#334155", belt: "#3f3f46", eyes: "#f59e0b", glowEyes: true };
      const grunt: FigureLook = { ...chief, skin: "#78716c", tunic: "#44403c", legs: "#57534e" };
      const troll = (x: number, z: number, r: number, s: number, look: FigureLook, armoured: boolean) => {
        const { add, hand } = figure(b, x, z, r, look, s, { radius: 0.55, pace: 0.7 });
        add("sphere", 0, 0.88, -0.06, 0.62, 0.42, 0.42, look.skin, { torso: true, mat: "hide", hdShape: "egg" }); // hunched back
        for (const side of [-1, 1]) add("cone", side * 0.08, 1.12, 0.17, 0.05, 0.12, 0.05, BONE, { rx: Math.PI, mat: "bone", hdShape: "horn" }); // tusks
        add("box", 0, 1.06, 0, 0.5, 0.08, 0.36, IRON, { mat: "iron" }); // iron collar
        // HD: rivets round the collar, a hide loincloth
        for (const side of [-1, 1]) add("sphere", side * 0.16, 1.07, 0.18, 0.06, 0.06, 0.06, "#64748b", { mat: "iron", hd: true });
        add("box", 0, 0.32, 0.17, 0.3, 0.34, 0.04, "#57534e", { trail: { lag: 0.15, damp: 0.5, root: [0, 0.64, 0.17] }, mat: "hide", hd: true });
        if (armoured) {
          for (const side of [-1, 1] as const) {
            add("box", side * 0.33, 0.99, 0, 0.24, 0.12, 0.25, IRON, { ...hand(side), mat: "iron" }); // pauldrons
            add("sphere", side * 0.33, 1.1, 0.06, 0.06, 0.06, 0.06, "#64748b", { ...hand(side), mat: "iron", hd: true }); // a rivet
          }
          // HD: the leather strap that holds the pauldrons, across the chest
          add("box", 0, 0.74, 0, 0.1, 0.6, 0.33, "#3f2a1a", { torso: true, rz: -0.65, mat: "leather", hd: true });
          add("cyl", 0.31, 0.15, 0.3, 0.13, 0.95, 0.13, "#78350f", { ...hand(1), rx: 0.5, hd: false }); // club…
          add("cyl", 0.31, 0.62, 0.53, 0.19, 0.08, 0.19, IRON, { ...hand(1), rx: 0.5, hd: false }); // …iron bands
          add("cyl", 0.31, 0.82, 0.63, 0.19, 0.08, 0.19, IRON, { ...hand(1), rx: 0.5, hd: false });
          club(add, hand(1), "#78350f", IRON);
        } else {
          add("sphere", 0.31, 0.38, 0.2, 0.28, 0.26, 0.28, "#78716c", { ...hand(1), hd: false }); // a fist-sized rock
          const [rx, ry, rz] = fist(1);
          add("boulder", rx, ry - 0.16, rz + 0.06, 0.28, 0.26, 0.28, "#78716c", { ...hand(1), mat: "stone", hd: true }); // HD: the rock in its fist
        }
      };
      troll(0, 0, 0.3, 2.1, chief, true);
      troll(-1.7, 0.7, 0.6, 1.45, grunt, false);
      troll(1.7, -0.6, -0.5, 1.45, grunt, false);
      b.add("cyl", 1.1, 0, 1.4, 0.75, 0.16, 0.75, "#44403c", { mat: "stone" }); // fire ring
      // HD: the ring is built of stones, with a spit over the fire
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.add("boulder", 1.1 + Math.cos(a) * 0.4, 0.02, 1.4 + Math.sin(a) * 0.4, 0.2, 0.2, 0.18, "#57534e", { mat: "stone", hd: true, ry: a });
      }
      for (const side of [-1, 1]) b.add("cyl", 1.1 + side * 0.48, 0, 1.4, 0.05, 0.75, 0.05, "#3f2a1a", { mat: "wood", hd: true }); // spit posts
      b.add("cyl", 1.1, 0.72 - 0.55, 1.4, 0.04, 1.1, 0.04, "#3f2a1a", { rz: Math.PI / 2, mat: "wood", hd: true }); // the spit
      b.add("cone", 1.1, 0.16, 1.4, 0.48, 0.6, 0.48, "#f97316", { glow: true });
      smokeAt(b, 1.1, 0.7, 1.4, 0.9);
      for (const [x, z, s] of [
        [-1.8, -1.2, 0.8],
        [1.9, 0.9, 0.6]
      ]) {
        b.add("sphere", x, -0.1, z, s, s * 0.8, s, "#78716c", { mat: "stone", hdShape: "boulder" });
      }
      break;
    }
    case "bandit-cultist": {
      // Glow: candles and the priest's skull-orb; gold trim on every robe; looping effect: the burning effigy's smoke
      const GOLD = "#fbbf24";
      const robed = (x: number, z: number, r: number, s: number, priest: boolean) => {
        const c = place(b, x, z, r, { radius: 0.3, pace: 0.5 }, 0, true);
        const add = scaler(c, s);
        const robe = priest ? "#450a0a" : "#991b1b";
        const head: AddOpts = { head: { y: 0.95 } };
        add("cone", 0, 0, 0, 0.62, 1.15, 0.62, robe, { mat: "cloth", hdShape: "taper" }); // robes
        add("cyl", 0, 0.02, 0, 0.72, 0.07, 0.72, GOLD, { mat: "gold" }); // gold hem
        add("cone", 0, 0.95, -0.02, 0.44, 0.55, 0.44, "#7f1d1d", { ...head, mat: "cloth", hdShape: "drop" }); // hood
        add("box", 0, 1.08, 0.17, 0.16, 0.12, 0.06, priest ? GOLD : "#0c0a09", { ...head, mat: priest ? "gold" : "cloth" }); // face in shadow (the priest's gold mask)
        // HD: a shadowed face under the hood (eye slits in the priest's mask), a gold-trimmed stole down the front, and
        // sleeves reaching forward to pale hands holding the candle or staff
        add("egg", 0, 1.0, 0.1, 0.3, 0.3, 0.12, "#0c0a09", { ...head, mat: "cloth", hd: true });
        if (priest) for (const side of [-1, 1]) add("box", side * 0.04, 1.12, 0.22, 0.04, 0.025, 0.06, "#0c0a09", { ...head, mat: "cloth", hd: true });
        for (const side of [-1, 1]) add("box", side * 0.07, 0.08, 0.24, 0.07, 0.82, 0.03, GOLD, { mat: "gold", hd: true, rx: -0.2, rz: side * 0.04 });
        const hands: V3 = priest ? [0.3, 0.88, 0.15] : [0.2, 0.62, 0.22];
        for (const side of [-1, 1]) {
          const hx = priest ? 0.3 - (side < 0 ? 0.08 : 0) : 0.2 + side * 0.06;
          along(add, "taper", [side * 0.22, 0.95, 0.02], [hx, hands[1] + 0.02, hands[2] - 0.06], 0.14, 0.14, robe, { mat: "cloth", hd: true });
          add("egg", hx, hands[1] - 0.04, hands[2] - 0.02, 0.07, 0.08, 0.08, "#e7e5e4", { mat: "skin", hd: true });
        }
        if (priest) {
          add("cyl", 0.3, 0, 0.15, 0.05, 1.7, 0.05, "#3f2a1a", { mat: "wood" }); // staff
          add("sphere", 0.3, 1.7, 0.15, 0.22, 0.24, 0.22, BONE, { hd: false }); // skull…
          skull(add, 0.3, 1.72, 0.15, 0.22, BONE, 0, { mat: "bone", hd: true }); // HD: a real skull in the halo
          add("sphere", 0.3, 1.74, 0.15, 0.32, 0.32, 0.32, "#f97316", { glow: true, idle: IDLE_KIND.pulse }); // …in a burning halo
          for (const side of [-1, 1]) along(add, "horn", [0.3, 1.66, 0.15], [0.3 + side * 0.14, 1.52, 0.15], 0.04, 0.04, GOLD, { mat: "gold", hd: true }); // HD: gold prongs holding it
        } else {
          add("cyl", 0.2, 0.62, 0.22, 0.07, 0.22, 0.07, "#fef3c7", { mat: "bone" }); // candle
          add("cone", 0.2, 0.84, 0.22, 0.06, 0.1, 0.06, "#fde68a", { glow: true, idle: IDLE_KIND.pulse });
          for (const k of [-1, 1]) add("drop", 0.2 + k * 0.03, 0.72, 0.22 + k * 0.025, 0.025, 0.06, 0.025, "#fef3c7", { mat: "bone", hd: true, rx: Math.PI }); // HD: wax drips
        }
      };
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        robed(Math.cos(a) * 1.7, Math.sin(a) * 1.7, -a - Math.PI / 2, 1.0, false);
      }
      robed(0, 1.15, 0, 1.3, true);
      b.add("cyl", 0, 0, -0.2, 0.9, 0.2, 0.9, "#27272a", { mat: "stone" }); // pyre
      b.add("box", 0, 0.2, -0.2, 0.15, 2.4, 0.15, "#3f2a1a", { mat: "wood" }); // effigy
      b.add("box", 0, 1.9, -0.2, 1.0, 0.12, 0.12, "#3f2a1a", { mat: "wood" });
      b.add("cone", 0, 0.2, -0.2, 0.8, 1.4, 0.8, "#f97316", { glow: true, idle: IDLE_KIND.pulse });
      b.add("box", 0, 2.1, -0.2, 0.35, 0.35, 0.05, GOLD, { rz: Math.PI / 4, mat: "gold" }); // gilded sigil
      // HD: a stack of split logs round the pyre's foot, and the straw effigy bound to its post, arms tied along the beam
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        along(b.add.bind(b), "cyl", [Math.cos(a) * 0.55, 0.06, -0.2 + Math.sin(a) * 0.55], [Math.cos(a) * 0.15, 0.32, -0.2 + Math.sin(a) * 0.15], 0.1, 0.1, "#292524", { mat: "wood", hd: true });
      }
      const straw: AddOpts = { mat: "fur", hd: true };
      b.add("egg", 0, 1.15, -0.13, 0.36, 0.6, 0.22, "#a16207", straw);
      b.add("egg", 0, 1.72, -0.13, 0.22, 0.24, 0.2, "#a16207", straw);
      for (const side of [-1, 1]) {
        along(b.add.bind(b), "capsule", [side * 0.12, 1.86, -0.12], [side * 0.48, 1.9, -0.12], 0.1, 0.1, "#a16207", straw);
        b.add("cyl", side * 0.3, 1.92, -0.2, 0.15, 0.04, 0.15, "#57534e", { mat: "cloth", hd: true, rz: Math.PI / 2 }); // rope
      }
      smokeAt(b, 0, 1.5, -0.2, 1.0);
      break;
    }

    /* ------------------------------- EPIC ------------------------------- */
    case "mob-magma": {
      // A towering obsidian golem split by lava seams, a molten crown, embers orbiting it; two lava imps hop at its feet
      const ROCK = "#1c1917";
      const LAVA = "#f97316";
      const HOT = "#fde047";
      const g = place(b, 0, 0, 0.2, { radius: 0.55, pace: 0.6 }, 0, true);
      const add = scaler(g, 1.35);
      // HD rest pose: the arms hang heavy and a little apart, the head sunk and turned
      const r = restRng(g);
      const armPose = (side: -1 | 1): Pose => ({ at: [side * 0.98, 1.9, 0], rz: side * (0.04 + r() * 0.06), rx: -(0.05 + r() * 0.1) });
      const head = { head: { y: 2.15 }, pose: { at: [0, 2.15, 0] as [number, number, number], ry: (r() - 0.5) * 0.3, rx: 0.06 + r() * 0.06, rz: (r() - 0.5) * 0.1 } };
      for (const side of [-1, 1]) {
        const leg = (side < 0 ? 1 : -1) as 1 | -1;
        add("box", side * 0.36, 0, 0, 0.5, 1.0, 0.58, "#292524", { leg, hip: 1.0, mat: "stone", hdShape: "limb" });
        add("box", side * 0.36, 0.4, 0.33, 0.2, 0.36, 0.06, LAVA, { leg, hip: 1.0, glow: true }); // knee seam
        add("box", side * 0.36, 0.62, 0.02, 0.6, 0.3, 0.66, ROCK, { leg, hip: 1.0, mat: "lava", hd: true, rx: -0.12 }); // HD: a thigh plate
      }
      add("box", 0, 0.95, 0, 1.45, 1.25, 0.92, ROCK, { mat: "lava" });
      add("box", 0, 1.25, 0.48, 0.9, 0.62, 0.06, LAVA, { glow: true }); // molten chest seam
      add("box", 0, 1.5, 0.53, 0.36, 0.22, 0.06, HOT, { glow: true, idle: IDLE_KIND.pulse }); // its heart
      add("box", 0, 1.1, -0.48, 0.7, 0.8, 0.06, LAVA, { glow: true }); // back seam
      // HD: obsidian plates riding its chest round the seam, and a row of spines down its back
      for (const side of [-1, 1]) add("block", side * 0.58, 1.05, 0.44, 0.3, 0.75, 0.16, "#0c0a09", { mat: "stone", hd: true, ry: side * 0.25 });
      for (let i = 0; i < 4; i++) {
        add("cone", 0, 1.35 - i * 0.25, -0.5 - i * 0.02, 0.2 - i * 0.03, 0.42 - i * 0.06, 0.2 - i * 0.03, ROCK, { rx: -1.15, mat: "stone", hdShape: "horn", hd: true });
        add("cone", 0, 1.43 - i * 0.25, -0.73 - i * 0.02, 0.08, 0.14, 0.08, LAVA, { rx: -1.15, glow: true, hd: true });
      }
      for (const side of [-1, 1] as const) {
        const arm = { arm: side, hip: 1.9, pose: armPose(side) };
        add("box", side * 0.98, 0.75, 0, 0.48, 1.3, 0.48, "#292524", { ...arm, rz: side * -0.15, mat: "stone", hdShape: "limb" });
        add("box", side * 0.95, 1.72, 0.02, 0.66, 0.46, 0.64, ROCK, { ...arm, rz: side * -0.15, mat: "lava", hd: true }); // HD: a shoulder block capping the arm
        add("sphere", side * 1.02, 0.45, 0, 0.62, 0.55, 0.62, LAVA, { ...arm, glow: true, hd: false }); // lava fists
        // HD: a fist of cracked rock with lava between the knuckles, closing over the arm's end
        add("boulder", side * 1.06, 0.36, 0.02, 0.74, 0.66, 0.72, ROCK, { ...arm, mat: "lava", hd: true });
        for (const k of [-1, 0, 1]) add("box", side * 1.06 + k * 0.17, 0.55, 0.36, 0.13, 0.16, 0.12, "#292524", { ...arm, mat: "stone", hd: true }); // knuckles
        add("cone", side * 0.8, 2.15, 0, 0.32, 0.6, 0.32, ROCK, { rz: side * -0.5, mat: "stone", hdShape: "horn" }); // shoulder spikes…
        add("cone", side * 0.98, 2.62, 0, 0.14, 0.24, 0.14, LAVA, { rz: side * -0.5, glow: true }); // …molten tips
      }
      add("box", 0, 2.2, 0, 0.72, 0.62, 0.62, ROCK, { ...head, mat: "lava" }); // head
      add("box", 0, 2.4, 0.33, 0.5, 0.12, 0.06, HOT, { glow: true, ...head }); // eyes
      add("box", 0, 2.53, 0.3, 0.66, 0.12, 0.1, "#0c0a09", { ...head, mat: "stone", hd: true }); // HD: a heavy brow over the eyes
      add("cone", 0, 2.82, 0, 0.6, 0.8, 0.6, LAVA, { glow: true, ...head }); // molten crown, riding its head
      orbit(g, 0, 0, 1.6, 2.2, 5, LAVA, 0.16);
      // HD: chunks of cooling rock drifting round it with the embers
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        g.add("boulder", Math.cos(a) * 2.05, 1.2 + (i % 2) * 0.6, Math.sin(a) * 2.05, 0.3, 0.26, 0.28, ROCK, { mat: "lava", hd: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + a });
      }
      for (const [x, z] of [
        [-1.9, 1.0],
        [1.8, 1.3]
      ]) {
        const imp = b.walker(x, z, range(rng, -Math.PI, Math.PI), "hop", 0.45, { pace: 1.3 });
        imp.add("sphere", 0, 0, 0, 0.6, 0.55, 0.6, "#292524", { mat: "lava", hdShape: "egg" });
        imp.add("sphere", 0, 0.12, 0.06, 0.42, 0.36, 0.42, LAVA, { glow: true }); // molten core showing through
        imp.add("cone", 0, 0.5, 0, 0.22, 0.3, 0.22, HOT, { glow: true, hdShape: "drop" });
        for (const side of [-1, 1]) imp.add("box", side * 0.1, 0.33, 0.27, 0.08, 0.06, 0.05, HOT, { glow: true, hd: true }); // HD: its eyes
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.6;
        const s = range(rng, 0.45, 0.75);
        b.add("sphere", Math.cos(a) * 2.6, -0.12, Math.sin(a) * 2.4, s, s * 0.6, s, "#292524", { mat: "lava", hdShape: "boulder" }); // cooled lava rocks…
        b.add("box", Math.cos(a) * 2.6, s * 0.3 - 0.08, Math.sin(a) * 2.4, s * 0.55, 0.05, 0.06, LAVA, { glow: true, ry: a }); // …still glowing in the cracks
      }
      break;
    }
    case "bandit-warlord": {
      // The warlord on an armoured war-boar, a glowing rune-axe; orc guards in iron; a skull banner with braziers, crows
      // wheeling round it
      const IRON = "#71717a";
      const BLOOD = "#7f1d1d";
      const boar = beast(b, 0, 0, 0.3, { fur: "#57534e", ruff: "#3f3f46", dark: "#292524", eyes: "#ef4444", glowEyes: true }, 2.6, { radius: 0.6, pace: 0.55 });
      boar.add("box", 0, 0.7, -0.05, 0.56, 0.12, 0.78, IRON, { mat: "iron" }); // barding plates
      boar.add("box", 0, 0.8, 0.28, 0.66, 0.14, 0.22, BLOOD, { mat: "leather" }); // war saddle
      // HD: overlapping riveted plates of barding with blood-runes glowing along their edges; a saddle horn, stirrups and
      // a fringed blanket; great curved tusks bound with iron
      {
        const o: AddOpts = { mat: "iron", hd: true };
        for (let i = 0; i < 3; i++) {
          boar.add("egg", 0, 0.72, -0.35 + i * 0.25, 0.62, 0.14, 0.3, IRON, o);
          for (const side of [-1, 1]) boar.add("sphere", side * 0.27, 0.78, -0.35 + i * 0.25, 0.04, 0.04, 0.04, "#52525b", o);
        }
        for (const side of [-1, 1]) {
          along(boar.add, "capsule", [side * 0.3, 0.74, -0.42], [side * 0.3, 0.74, 0.12], 0.018, 0.018, "#ef4444", { glow: true, idle: IDLE_KIND.pulse, hd: true });
          arc(boar.add, [side * 0.36, 0.5, 0.28], [0, 1, 0], [0, 0, 1], 0.06, Math.PI, Math.PI * 2, 4, 0.02, "#52525b", { mat: "iron", hd: true }); // stirrup
          along(boar.add, "cyl", [side * 0.33, 0.84, 0.28], [side * 0.36, 0.56, 0.28], 0.015, 0.015, "#3f2a1a", { mat: "leather", hd: true });
          boar.add("box", side * 0.3, 0.52, 0.0, 0.03, 0.22, 0.6, BLOOD, { trail: { lag: 0.2, damp: 0.4, root: [side * 0.3, 0.75, 0.0] }, mat: "cloth", hd: true });
          along(boar.add, "horn", [side * 0.08, 0.56, 0.92], [side * 0.2, 0.8, 1.02], 0.08, 0.08, BONE, { ...boar.neck, mat: "bone", hd: true });
          boar.add("cyl", side * 0.11, 0.6, 0.94, 0.11, 0.04, 0.11, "#52525b", { ...boar.neck, mat: "iron", hd: true });
        }
        boar.add("taper", 0, 0.87, 0.38, 0.1, 0.16, 0.1, "#3f2a1a", { mat: "leather", hd: true }); // saddle horn
      }
      boar.add("cone", -0.12, 0.62, 0.95, 0.06, 0.3, 0.06, BONE, { rx: 0.9, hd: false }); // tusks
      boar.add("cone", 0.12, 0.62, 0.95, 0.06, 0.3, 0.06, BONE, { rx: 0.9, hd: false });
      for (let i = 0; i < 3; i++) boar.add("cone", 0, 0.8, -0.25 - i * 0.18, 0.08, 0.18, 0.08, IRON, { mat: "iron", hdShape: "horn" }); // spine spikes
      const lord: FigureLook = { skin: "#4d7c0f", tunic: "#27272a", legs: BLOOD, boots: "#1c1917", belt: IRON, sleeves: IRON, eyes: "#ef4444", glowEyes: true };
      // The rider sits in the boar's frame, so it rides along
      const { add, hand, neck } = figure(boar.frame.child(0, 0.1, 0, 1.55), 0, 0, 0, lord, 1.15, undefined, true);
      for (const side of [-1, 1]) {
        add("box", side * 0.33, 1.0, 0, 0.26, 0.14, 0.28, IRON, { ...hand(side as 1 | -1), mat: "iron" }); // pauldrons
        add("cone", side * 0.2, 1.4, 0, 0.09, 0.36, 0.09, BONE, { rz: side * -0.5, mat: "bone", hdShape: "horn" }); // horned helm
        // HD: spiked pauldrons over the shoulders, tusks up from the jaw
        for (const k of [0, 1]) along(add, "horn", [side * (0.33 + k * 0.05), 1.12, -0.04 + k * 0.08], [side * (0.42 + k * 0.05), 1.3, -0.04 + k * 0.08], 0.06, 0.06, "#52525b", { ...hand(side as 1 | -1), mat: "iron", hd: true });
        along(add, "horn", [side * 0.07, 1.13, 0.15], [side * 0.1, 1.24, 0.19], 0.04, 0.04, BONE, { ...neck, mat: "bone", hd: true });
      }
      add("cyl", 0, 1.32, 0, 0.4, 0.12, 0.4, IRON, { mat: "iron" });
      add("sphere", 0, 1.32, 0, 0.4, 0.26, 0.4, IRON, { ...neck, mat: "iron", hd: true }); // HD: the helm's dome
      add("cyl", 0.31, 0.1, 0.25, 0.06, 1.3, 0.06, "#3f2a1a", { ...hand(1), hd: false }); // great axe…
      add("box", 0.31, 1.1, 0.42, 0.06, 0.45, 0.36, "#cbd5e1", { ...hand(1), hd: false });
      add("box", 0.31, 1.18, 0.62, 0.08, 0.3, 0.06, "#ef4444", { ...hand(1), glow: true, idle: IDLE_KIND.pulse, hd: false }); // …its blood-rune edge
      // HD: the great axe gripped through the fist: an iron-shod haft, a broad crescent blade with its blood-rune edge
      // glowing, a spike behind
      {
        const o: AddOpts = { ...hand(1), hd: true };
        along(add, "cyl", [0.31, 0.0, 0.1], [0.31, 1.55, -0.03], 0.06, 0.06, "#3f2a1a", { ...o, mat: "wood" });
        add("egg", 0.31, 1.1, 0.16, 0.05, 0.52, 0.36, "#cbd5e1", { ...o, mat: "steel" });
        along(add, "capsule", [0.31, 1.16, 0.33], [0.31, 1.56, 0.31], 0.035, 0.03, "#ef4444", { ...o, glow: true, idle: IDLE_KIND.pulse });
        along(add, "horn", [0.31, 1.36, -0.02], [0.31, 1.42, -0.26], 0.06, 0.06, "#52525b", { ...o, mat: "iron" });
        along(add, "cone", [0.31, 1.52, -0.02], [0.31, 1.72, -0.04], 0.06, 0.06, "#52525b", { ...o, mat: "iron" });
      }
      const guard: FigureLook = { skin: "#65a30d", tunic: "#3f3f46", legs: "#27272a", boots: "#1c1917", belt: BLOOD, eyes: "#1c1917" };
      for (const [x, z, r] of [
        [-1.9, 0.9, 0.3],
        [1.9, 1.0, -0.2],
        [-1.6, -1.3, 0.5]
      ]) {
        const o = figure(b, x, z, r, guard, 1.05, { radius: 0.4, pace: 0.8 });
        o.add("cone", 0, 1.28, 0, 0.4, 0.34, 0.4, IRON, { mat: "iron" }); // spiked helm
        o.add("cyl", 0, 1.28, 0, 0.43, 0.04, 0.43, "#52525b", { ...o.neck, mat: "iron", hd: true }); // HD: its rim
        for (const side of [-1, 1]) along(o.add, "horn", [side * 0.07, 1.13, 0.15], [side * 0.1, 1.23, 0.19], 0.035, 0.035, BONE, { ...o.neck, mat: "bone", hd: true }); // HD: tusks
        o.add("box", -0.31, 0.45, 0.2, 0.06, 0.6, 0.5, BLOOD, { ...o.hand(-1), hd: false }); // shield
        roundShield(o.add, o.hand(-1), BLOOD, IRON, 0.55, "wood", "iron"); // HD: a blood-red shield with an iron rim and boss
        o.add("cyl", 0.31, 0.2, 0.12, 0.05, 1.6, 0.05, "#3f2a1a", { ...o.hand(1), hd: false }); // spear
        o.add("cone", 0.31, 1.8, 0.12, 0.12, 0.26, 0.12, IRON, { ...o.hand(1), hd: false });
        spear(o.add, o.hand(1), "#3f2a1a", IRON, "iron", 1.95, BLOOD); // HD: the spear through the fist
      }
      b.add("cyl", 1.6, 0, -1.3, 0.08, 3.4, 0.08, "#292524", { mat: "wood" }); // war banner
      b.add("box", 1.92, 2.0, -1.3, 0.6, 1.1, 0.03, BLOOD, { idle: IDLE_KIND.flutter, mat: "cloth" });
      b.add("sphere", 1.6, 3.4, -1.3, 0.3, 0.32, 0.3, BONE, { hd: false });
      // HD: a real skull atop the banner, its crossbar, chains hanging from it
      skull(b.add.bind(b), 1.6, 3.46, -1.3, 0.3, BONE, 0.3, { mat: "bone", hd: true });
      b.add("box", 1.6, 3.08, -1.3, 0.06, 0.06, 0.7, "#292524", { mat: "wood", hd: true, rx: Math.PI / 2, ry: Math.PI / 2 });
      for (const dx of [-0.3, 0.3])
        for (let k = 0; k < 4; k++) {
          const [w, d] = k % 2 ? [0.05, 0.02] : [0.02, 0.05];
          along(b.add.bind(b), "capsule", [1.6 + dx, 3.06 - k * 0.09, -1.3], [1.6 + dx, 2.98 - k * 0.09, -1.3], w, d, "#52525b", { mat: "iron", hd: true, trail: { lag: 0.1 + k * 0.05, damp: 0.2, root: [1.6 + dx, 3.06, -1.3] } });
        }
      for (const x of [0.9, 2.3]) {
        b.add("cyl", x, 0, -1.3, 0.3, 0.9, 0.3, IRON, { mat: "iron" }); // braziers
        b.add("cone", x, 0.9, -1.3, 0.3, 0.45, 0.3, "#f97316", { glow: true, idle: IDLE_KIND.pulse });
        // HD: a wide iron bowl rim, glowing coals, and splayed feet
        b.add("cyl", x, 0.84, -1.3, 0.44, 0.08, 0.44, "#52525b", { mat: "iron", hd: true });
        b.add("egg", x, 0.86, -1.3, 0.36, 0.1, 0.36, "#f97316", { mat: "lava", hd: true });
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          along(b.add.bind(b), "taper", [x + Math.cos(a) * 0.32, 0, -1.3 + Math.sin(a) * 0.32], [x + Math.cos(a) * 0.12, 0.4, -1.3 + Math.sin(a) * 0.12], 0.06, 0.06, "#52525b", { mat: "iron", hd: true });
        }
      }
      orbit(b, 1.6, -1.3, 1.1, 3.6, 3, "#1c1917", 0.22); // crows wheeling round the banner
      // HD: the crows' spread wings, circling with them (same orbit, phase and axis)
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.add("egg", 1.6 + Math.cos(a) * 1.1, 3.6 + (i % 2) * 0.35 + 0.12, -1.3 + Math.sin(a) * 1.1, 0.6, 0.02, 0.16, "#1c1917", { idle: IDLE_KIND.spin, pivot: [1.6, -1.3], phase: 0.01 + a, mat: "fur", hd: true, ry: -a });
      }
      break;
    }
    /* --------------------------- COMMON (cont.) --------------------------- */
    case "mob-slime": {
      // Plain green blobs hopping about, the big one in the middle; matte, no glowing cores
      for (const [x, z, s] of [
        [0, 0, 1.5],
        [-1.3, 0.8, 0.8],
        [1.2, 0.9, 0.95],
        [0.6, -1.2, 0.65]
      ]) {
        const sl = b.walker(x, z, x * 1.7 + z, "hop", 0.3 + s * 0.25);
        sl.add("sphere", 0, 0, 0, s, s * 0.75, s, "#84cc16", { hd: false });
        sl.add("sphere", 0, s * 0.4, s * 0.05, s * 0.55, s * 0.3, s * 0.55, "#a3e635", { hd: false }); // wet sheen on top
        for (const side of [-1, 1]) sl.add("sphere", side * s * 0.18, s * 0.38, s * 0.43, s * 0.14, s * 0.18, s * 0.08, "#14532d", { hd: false });
        // HD: a sagging blob of wet jelly spreading at its foot, drips running down it, bubbles on its skin and two
        // eyes floating in it
        const r = restRng(sl);
        const gel: AddOpts = { mat: "gel", hd: true };
        sl.add("sphere", 0, 0, 0, s, s * 0.78, s, "#84cc16", gel);
        sl.add("egg", 0, 0, 0, s * 1.16, s * 0.12, s * 1.12, "#65a30d", gel); // its foot, spread on the ground
        for (let i = 0; i < 4; i++) {
          const a = r() * Math.PI * 2;
          const [dx, dz] = [Math.sin(a) * s * 0.42, Math.cos(a) * s * 0.42];
          sl.add("drop", dx, s * (0.12 + r() * 0.12), dz, s * 0.1, s * (0.16 + r() * 0.1), s * 0.1, "#84cc16", gel); // a drip running down
        }
        for (let i = 0; i < 3; i++) {
          const a = r() * Math.PI * 2;
          const y = 0.2 + r() * 0.4;
          const rad = s * 0.5 * Math.sqrt(Math.max(0, 1 - ((y - 0.4) / 0.42) ** 2));
          const k = s * (0.06 + r() * 0.05);
          sl.add("sphere", Math.sin(a) * rad, s * y - k / 2, Math.cos(a) * rad, k, k, k, "#bef264", gel); // a bubble on its skin
        }
        for (const side of [-1, 1]) {
          sl.add("sphere", side * s * 0.18, s * 0.34, s * 0.42, s * 0.16, s * 0.16, s * 0.16, "#ecfccb", { ...gel, mat: "gem" }); // eyes, floating in it
          sl.add("sphere", side * s * 0.18, s * 0.38, s * 0.49, s * 0.08, s * 0.08, s * 0.08, "#14532d", { ...gel, mat: "gem" });
        }
        if (s > 1) {
          // What the big one is digesting: a pickaxe, its handle sticking out, the iron head half sunk in it
          along(sl.add.bind(sl), "cyl", [s * 0.12, s * 0.42, -s * 0.05], [s * 0.42, s * 0.95, -s * 0.18], 0.06, 0.06, "#78350f", { mat: "wood", hd: true });
          along(sl.add.bind(sl), "horn", [-s * 0.05, s * 0.45, -s * 0.02], [s * 0.3, s * 0.58, -s * 0.1], 0.08, 0.06, "#57534e", { mat: "dull", hd: true });
          bone(sl.add.bind(sl), [-s * 0.38, s * 0.32, s * 0.1], [-s * 0.2, s * 0.5, -s * 0.25], 0.05, BONE, { mat: "bone", hd: true });
        }
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.5;
        b.add("sphere", Math.cos(a) * 2.2, -0.08, Math.sin(a) * 1.9, range(rng, 0.4, 0.7), 0.16, range(rng, 0.3, 0.5), "#65a30d", { mat: "gel", hdShape: "egg" }); // slime trails
      }
      // HD: little gobbets of slime spattered along the trails
      const sp = mulberry32(911);
      for (let i = 0; i < 7; i++) {
        const a = sp() * Math.PI * 2;
        const [d, k] = [1.3 + sp() * 1.2, 0.1 + sp() * 0.14];
        b.add("egg", Math.cos(a) * d, 0, Math.sin(a) * d, k, k * 0.5, k * 1.2, "#65a30d", { mat: "gel", hd: true, ry: a });
      }
      break;
    }
    case "mob-bat": {
      // A dark cave mouth and a cloud of plain black bats flapping round it, one big old bat among them
      b.add("sphere", 0, -0.8, -0.4, 3.6, 2.6, 2.8, "#44403c", { mat: "stone", hdShape: "boulder" });
      b.add("sphere", 0, -0.2, 0.75, 1.3, 1.5, 0.6, "#0c0a09", { mat: "stone" });
      b.add("sphere", 1.3, -0.3, 0.3, 1.1, 0.9, 1.0, "#57534e", { mat: "stone", hdShape: "boulder" });
      // HD: a rough lip of rock over the cave mouth with stalactites hanging from it, fallen rocks and pale droppings
      const cv = mulberry32(4471);
      b.add("boulder", 0, 1.0, 0.62, 1.7, 0.42, 0.6, "#44403c", { mat: "stone", hd: true });
      for (let i = 0; i < 5; i++) {
        const h = 0.2 + cv() * 0.22;
        b.add("cone", -0.5 + i * 0.25 + (cv() - 0.5) * 0.08, 1.12 - h, 0.82 + cv() * 0.06, 0.08 + cv() * 0.05, h, 0.08, "#57534e", { mat: "stone", hd: true, rx: Math.PI });
      }
      for (let i = 0; i < 5; i++) {
        const a = -0.6 + cv() * 2.6;
        const k = 0.18 + cv() * 0.3;
        b.add("boulder", Math.sin(a) * (1.6 + cv() * 0.6), -0.04, 0.9 + Math.cos(a) * 0.9, k * 1.2, k, k, "#57534e", { mat: "stone", hd: true, ry: cv() * 3 });
      }
      for (let i = 0; i < 4; i++) b.add("egg", -0.6 + cv() * 1.2, 0, 1.15 + cv() * 0.5, 0.1 + cv() * 0.12, 0.03, 0.08 + cv() * 0.1, "#d6d3d1", { mat: "stone", hd: true }); // droppings
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng() * 0.4;
        const r = range(rng, 1.2, 2.4);
        const s = i === 0 ? 1.7 : 1;
        const bat = b.walker(Math.cos(a) * r, Math.sin(a) * r + 0.6, a + Math.PI / 2, "fly", 0.5 + (i % 3) * 0.2, { y: range(rng, 1.6, 3.2), pace: 1.6 / Math.sqrt(s) });
        const add = scaler(bat, s);
        add("octa", 0, 0, 0, 0.22, 0.3, 0.22, "#1c1917", { hd: false });
        const head: AddOpts = { head: { y: 0.22, z: 0.08 } };
        // HD: a furred body lying along its flight, a head with a pug snout, big ears and beady eyes, feet tucked under
        add("pod", 0, 0.12, -0.02, 0.17, 0.15, 0.3, "#1c1917", { mat: "fur", hd: true });
        add("egg", 0, 0.16, 0.15, 0.15, 0.14, 0.14, "#1c1917", { ...head, mat: "fur", hd: true });
        add("snout", 0, 0.19, 0.23, 0.07, 0.06, 0.06, "#292524", { ...head, mat: "skin", hd: true });
        for (const side of [-1, 1]) {
          add("box", side * 0.32, 0.12, 0, 0.5, 0.03, 0.26, "#292524", { rz: side * -0.4, flap: 14 / s, hd: false });
          add("cone", side * 0.07, 0.3, 0.03, 0.05, 0.1, 0.04, "#1c1917", { hd: false }); // ears
          add("cone", side * 0.045, 0.27, 0.14, 0.06, 0.12, 0.035, "#1c1917", { ...head, mat: "skin", hd: true, rz: side * -0.3 });
          add("sphere", side * 0.035, 0.24, 0.215, 0.02, 0.02, 0.02, "#0c0a09", { ...head, mat: "gem", hd: true });
          add("horn", side * 0.03, 0.08, -0.12, 0.025, 0.06, 0.025, "#292524", { mat: "bone", hd: true, rx: Math.PI }); // tucked feet
          // HD: a wing of skin stretched between long finger bones, its trailing edge cut into scallops. Every piece
          // hinges at the Normal wing's shoulder (x 0.09, y 0.232), so the wing beats as one
          const wing: AddOpts = { flap: 14 / s, hd: true };
          for (const [wz, w, d] of [
            [0.06, 0.52, 0.16],
            [-0.03, 0.44, 0.16],
            [-0.1, 0.32, 0.14],
            [-0.02, 0.2, 0.3]
          ]) {
            add("egg", side * (0.09 + w / 2), 0.232 - 0.006, wz, w, 0.012, d, "#292524", { ...wing, mat: "hide" }); // membrane, each panel's tip a scallop
            if (w > 0.25) add("box", side * (0.09 + (w * 0.9) / 2), 0.232 - 0.012, wz, w * 0.9, 0.024, 0.02, "#292524", { ...wing, mat: "leather" }); // finger bone
          }
        }
      }
      break;
    }
    case "mob-rat": {
      // Plain brown sewer rats scurrying out of a collapsed drain, a fat old one leading
      b.add("cyl", -1.2, 0, -1.0, 1.4, 0.5, 1.4, "#57534e", { mat: "stone" }); // collapsed drain
      b.add("cyl", -1.2, 0.02, -1.0, 0.9, 0.5, 0.9, "#0c0a09", { mat: "stone" });
      // HD: the drain's broken masonry rim (a gap where it fell in), rubble, a dark puddle seeping out, gnawed bones
      const dr = mulberry32(2203);
      for (let i = 0; i < 12; i++) {
        if (i >= 4 && i <= 6) continue;
        const a = (i / 12) * Math.PI * 2;
        b.add("block", -1.2 + Math.cos(a) * 0.62, 0.4 + dr() * 0.04, -1.0 + Math.sin(a) * 0.62, 0.3, 0.16, 0.22, "#78716c", { mat: "stone", hd: true, ry: -a + Math.PI / 2 });
      }
      for (let i = 0; i < 5; i++) {
        const a = (5 / 12) * Math.PI * 2 + (dr() - 0.5) * 0.9;
        const [d, k] = [0.85 + dr() * 0.5, 0.12 + dr() * 0.16];
        b.add("boulder", -1.2 + Math.cos(a) * d, 0, -1.0 + Math.sin(a) * d, k * 1.3, k, k, "#78716c", { mat: "stone", hd: true, ry: dr() * 3 });
      }
      b.add("egg", -0.45, 0, -0.55, 0.9, 0.03, 0.55, "#1c2a22", { mat: "gel", hd: true, ry: 0.6 }); // the puddle
      bone(b.add.bind(b), [0.3, 0.035, -1.2], [0.62, 0.035, -1.05], 0.05, BONE, { mat: "bone", hd: true });
      bone(b.add.bind(b), [-0.1, 0.03, 1.5], [0.15, 0.03, 1.72], 0.04, BONE, { mat: "bone", hd: true });
      for (const [x, z, r, s] of [
        [0.2, 0.3, 0.4, 1.45],
        [1.0, -0.5, -0.8, 1],
        [-0.4, 1.2, 2.0, 1],
        [1.3, 0.9, 1.0, 0.9],
        [-0.2, -0.6, -2.2, 0.9]
      ]) {
        const rat = b.walker(x, z, r, "walk", 0.35, { pace: 1.9 / s }); // scurrying
        const add = scaler(rat, s);
        for (const [lx, lz, leg] of [
          [-0.15, 0.22, 1],
          [0.15, 0.22, -1],
          [-0.15, -0.22, -1],
          [0.15, -0.22, 1]
        ] as const) {
          add("box", lx, 0, lz, 0.08, 0.14, 0.08, "#44403c", { leg, mat: "fur", hdShape: "limb" });
          add("egg", lx, 0, lz + 0.03, 0.07, 0.035, 0.1, "#d6a8a0", { leg, hip: 0.14, mat: "skin", hd: true }); // HD: pink paws
        }
        add("sphere", 0, 0.08, 0, 0.5, 0.4, 0.8, "#6b6259", { mat: "fur", hdShape: "pod" });
        const head: AddOpts = { head: { y: 0.25, z: 0.3 } };
        add("sphere", 0, 0.18, 0.42, 0.3, 0.28, 0.34, "#78716c", { ...head, mat: "fur", hdShape: "egg" });
        add("cone", 0, 0.24, 0.62, 0.1, 0.14, 0.1, "#a8a29e", { ...head, rx: Math.PI / 2, hd: false }); // snout
        // HD: a long furred snout out of the face, a pink nose, yellowed teeth and whiskers
        add("snout", 0, 0.245, 0.62, 0.17, 0.14, 0.26, "#78716c", { ...head, mat: "fur", hd: true });
        add("egg", 0, 0.295, 0.75, 0.05, 0.045, 0.045, "#d6a8a0", { ...head, mat: "skin", hd: true });
        add("box", 0, 0.24, 0.715, 0.035, 0.035, 0.012, "#fde68a", { ...head, mat: "bone", hd: true });
        for (const side of [-1, 1]) {
          add("sphere", side * 0.1, 0.38, 0.38, 0.14, 0.14, 0.06, "#d6a8a0", { ...head, mat: "skin" }); // ears
          add("sphere", side * 0.1, 0.405, 0.405, 0.09, 0.09, 0.03, "#b77f79", { ...head, mat: "skin", hd: true }); // HD: inside the ear
          add("box", side * 0.08, 0.3, 0.58, 0.04, 0.04, 0.04, "#0c0a09", { ...head, hd: false }); // eyes
          add("sphere", side * 0.08, 0.32, 0.55, 0.05, 0.05, 0.05, "#0c0a09", { ...head, mat: "gem", hd: true }); // HD: beady eyes
          for (const k of [-1, 0, 1]) along(add, "cyl", [side * 0.04, 0.315, 0.7], [side * 0.21, 0.32 + k * 0.03, 0.66 + k * 0.03], 0.008, 0.008, "#e7e5e4", { ...head, mat: "bone", hd: true }); // whiskers
        }
        add("cyl", 0, 0.2 - 0.4, -0.75, 0.05, 0.8, 0.05, "#d6a8a0", { rx: Math.PI / 2 + 0.3, trail: { lag: 0.18, damp: 0.15, root: [0, 0.25, -0.38] }, hd: false }); // tail
        tail(add, [0, 0.25, -0.38], { len: 0.85, w0: 0.055, w1: 0.025, n: 5, pitch: 0.3, curl: -0.25, yaw: 0.2, lag: 0.1, step: 0.07, damp: 0.1, color: "#d6a8a0" }, { mat: "skin", hd: true }); // HD: a long whipping tail
      }
      break;
    }
    case "mob-spider": {
      // Plain dark spiders scuttling under a web between dead trees; the brood mother is twice their size
      const tr = mulberry32(5813);
      for (const [x, z] of [
        [-1.6, -0.8],
        [1.5, -1.0],
        [0.2, 1.7]
      ]) {
        b.add("cyl", x, 0, z, 0.25, 2.0, 0.25, "#3f3f46", { mat: "wood", hdShape: "trunk" }); // dead trees holding the web
        // HD: bare, broken branches
        for (let i = 0; i < 3; i++) {
          const a = tr() * Math.PI * 2;
          const y = 1.0 + tr() * 0.8;
          const l = 0.35 + tr() * 0.35;
          along(b.add.bind(b), "taper", [x, y, z], [x + Math.cos(a) * l, y + 0.2 + tr() * 0.3, z + Math.sin(a) * l], 0.08, 0.08, "#3f3f46", { mat: "wood", hd: true });
        }
      }
      b.add("box", 0, 1.2, -0.9, 3.0, 1.4, 0.02, "#e5e7eb", { rx: 0.2, hd: false }); // web sheet
      // HD: the web itself, silk strands strung between the two back trees: spokes from its hub, a spiral of rings
      // round it, anchor threads to the trunks, and two victims wrapped in silk
      {
        const silk: AddOpts = { mat: "bone", hd: true };
        const add = b.add.bind(b);
        const c: V3 = [-0.05, 1.15, -0.95];
        const u: V3 = [1, 0, -0.065];
        const v: V3 = [0, Math.cos(0.2), Math.sin(0.2)];
        const [ru, rv] = [1.5, 0.9];
        const n = 10;
        const at = (a: number, f: number): V3 => [0, 1, 2].map((k) => c[k] + u[k] * Math.cos(a) * ru * f + v[k] * Math.sin(a) * rv * f) as V3;
        for (let i = 0; i < n; i++) along(add, "cyl", c, at((i / n) * Math.PI * 2 + 0.15, 1), 0.014, 0.014, "#e5e7eb", silk);
        for (const f of [0.14, 0.27, 0.4, 0.53, 0.66, 0.79, 0.92]) arc(add, c, u, v, [ru * f, rv * f], 0.15 + f * 0.6, 0.15 + f * 0.6 + Math.PI * 2, n, 0.011, "#e5e7eb", silk, "cyl");
        add("sphere", c[0], c[1] - 0.05, c[2], 0.1, 0.1, 0.04, "#e5e7eb", silk); // the hub
        for (const [p, q] of [
          [at(Math.PI / 2 + 0.3, 1), [-1.6, 1.85, -0.8]],
          [at(Math.PI / 2 - 0.3, 1), [1.5, 1.85, -1.0]],
          [at(-Math.PI / 2 - 0.3, 1), [-1.6, 0.35, -0.8]],
          [at(-Math.PI / 2 + 0.3, 1), [1.5, 0.35, -1.0]]
        ] as [V3, V3][])
          along(add, "cyl", p, q, 0.014, 0.014, "#e5e7eb", silk);
        for (const [x, y0, h, rz] of [
          [-0.75, 0.62, 0.42, 0.3],
          [0.7, 1.3, 0.32, -0.2]
        ]) {
          const z = -0.95 + (y0 + h / 2 - c[1]) * Math.tan(0.2) + 0.1;
          add("egg", x, y0, z, h * 0.48, h, h * 0.45, "#d6d3d1", { mat: "cloth", hd: true, rz }); // a wrapped victim
          for (const t of [0.3, 0.55, 0.78]) add("cyl", x - Math.sin(rz) * h * (t - 0.5), y0 + h * t - 0.012, z, h * 0.5, 0.025, h * 0.47, "#f5f5f4", { mat: "cloth", hd: true, rz }); // bands of silk
        }
      }
      for (const [x, z, r, s] of [
        [0, 0, 0.3, 1.45],
        [-1.0, 0.8, -0.6, 0.8],
        [1.1, 0.6, 1.1, 0.8]
      ]) {
        const sp = b.walker(x, z, r, "walk", 0.4, { pace: 1.4 });
        const add = scaler(sp, s);
        add("sphere", 0, 0.2, -0.3, 0.8, 0.6, 0.9, "#365314", { hd: false }); // abdomen
        add("sphere", 0, 0.2, 0.25, 0.45, 0.4, 0.45, "#1a2e05", { mat: "hide", hdShape: "egg" });
        add("box", 0, 0.62, -0.3, 0.3, 0.08, 0.5, "#3f6212", { hd: false }); // banded back
        // HD: a big hairy abdomen raised behind, chevrons down its back, fangs under eight eyes
        add("egg", 0, 0.03, -0.38, 0.8, 0.95, 0.62, "#365314", { mat: "fur", hd: true, rx: Math.PI / 2 - 0.25 });
        for (let i = 0; i < 3; i++) add("egg", 0, 0.73 - i * 0.07, -0.2 - i * 0.2, 0.34 - i * 0.07, 0.07, 0.12, "#3f6212", { mat: "fur", hd: true, rx: 0.3 });
        for (const side of [-1, 1]) {
          add("horn", side * 0.07, 0.12, 0.44, 0.07, 0.16, 0.07, "#0c0a09", { mat: "bone", hd: true, rx: Math.PI - 0.3 }); // fangs
          for (const [ex, ey, ez, k] of [
            [0.05, 0.5, 0.41, 0.07],
            [0.12, 0.49, 0.37, 0.045],
            [0.08, 0.56, 0.36, 0.04],
            [0.15, 0.44, 0.35, 0.035]
          ])
            add("sphere", side * ex, ey - k / 2, ez, k, k, k, "#0c0a09", { mat: "gem", hd: true }); // eyes
        }
        for (const side of [-1, 1]) {
          for (let l = 0; l < 4; l++) {
            const lz = 0.35 - l * 0.22;
            const leg: AddOpts = { leg: (l % 2 ? side : -side) as 1 | -1, hip: 0.25, pivot: [side * 0.2, lz] };
            add("box", side * 0.45, 0.1, lz, 0.7, 0.05, 0.05, "#1a2e05", { ...leg, rz: side * -0.55, ry: side * (l - 1.5) * 0.25, hd: false });
            // HD: each leg bends at a raised knee: a thick upper leg up and out, a thinner lower leg down to its foot
            const spread = (l - 1.5) * 0.22;
            const knee: V3 = [side * 0.5, 0.58, lz + spread * 0.8];
            along(add, "capsule", [side * 0.17, 0.3, lz], knee, 0.07, 0.07, "#1a2e05", { ...leg, mat: "fur", hd: true });
            along(add, "taper", [side * 0.8, 0.0, lz + spread * 1.5], knee, 0.05, 0.05, "#1a2e05", { ...leg, mat: "fur", hd: true });
          }
        }
      }
      break;
    }
    case "bandit-pickpocket": {
      // Three hooded cutpurses in drab violet; the master thief leads; spilled coins, plain metal
      const look: FigureLook = { skin: "#d6a77a", tunic: "#4c1d95", legs: "#1f2937", boots: "#292524", belt: "#3f3f46", eyes: "#1c1917" };
      for (const [x, z, r, s, lead] of [
        [0, 0.1, 0.1, 1.1, 1],
        [-0.9, 0.3, 0.6, 0.9, 0],
        [0.9, -0.2, -0.8, 0.9, 0]
      ]) {
        const { add, hand, neck } = figure(b, x, z, r, look, s, BANDIT_WALK);
        add("cone", 0, 1.2, -0.03, 0.44, 0.46, 0.44, "#3b0764", { hd: false }); // hood
        hood(add, neck, "#3b0764"); // HD: a real hood open round the face, its point down the back, and a mantle
        add("sphere", -0.31, 0.32, 0.12, 0.26, 0.28, 0.26, "#a16207", { ...hand(-1), hd: false }); // coin purse
        pouch(add, hand(-1), -1, "#a16207"); // HD: a drawstring purse swinging from the fist by its cord
        if (lead) {
          add("box", 0.31, 0.5, 0.25, 0.04, 0.05, 0.4, "#a8a29e", { ...hand(1), hd: false }); // dagger
          sword(add, hand(1), "#a8a29e", "#3f2a1a", "#57534e", "dull", 0.26); // HD: the dagger gripped in the fist
        }
      }
      // Dropped coins (HD: little stacks and strays of thin, worn coins, and the cut purse they spilled from)
      const cn = mulberry32(3307);
      for (let i = 0; i < 6; i++) {
        const [x, z] = [range(rng, -1.2, 1.2), range(rng, 0.8, 1.5)];
        b.add("cyl", x, 0, z, 0.2, 0.05, 0.2, "#ca8a04", { hd: false });
        const n = 1 + Math.floor(cn() * 3);
        for (let k = 0; k < n; k++) b.add("cyl", x + (cn() - 0.5) * 0.03, k * 0.024, z + (cn() - 0.5) * 0.03, 0.14, 0.024, 0.14, "#ca8a04", { mat: "dull", hd: true });
        b.add("cyl", x + 0.12 + cn() * 0.1, 0.01, z - 0.1, 0.14, 0.024, 0.14, "#ca8a04", { mat: "dull", hd: true, rx: 0.25, rz: 0.2 }); // one tipped on its neighbour
      }
      b.add("egg", -0.35, 0, 1.05, 0.24, 0.16, 0.2, "#a16207", { mat: "leather", hd: true, rz: 1.3 }); // the cut purse, on its side
      break;
    }
    case "bandit-poacher": {
      // Poachers in drab green with crossbows, a caged fox, a pelt rack, a snare; all matte
      const look: FigureLook = { skin: "#c99a6e", tunic: "#4d5b2b", legs: "#3f2a1a", boots: "#292524", belt: "#57534e", eyes: "#1c1917" };
      for (const [x, z, r, s] of [
        [0, 0.3, 0.1, 1.1],
        [-0.9, 0.5, 0.4, 0.95],
        [0.9, 0.2, -0.5, 0.95]
      ]) {
        const { add, hand } = figure(b, x, z, r, look, s, BANDIT_WALK);
        add("cyl", 0, 1.36, 0, 0.58, 0.06, 0.58, "#3f2a1a", { mat: "cloth" }); // wide hat
        add("cyl", 0, 1.42, 0, 0.32, 0.18, 0.32, "#3f2a1a", { mat: "cloth" });
        // HD: a band round the felt crown with a feather tucked in it
        add("cyl", 0, 1.42, 0, 0.34, 0.05, 0.34, "#1c1917", { mat: "leather", hd: true });
        along(add, "drop", [0.14, 1.44, -0.06], [0.26, 1.72, -0.2], 0.05, 0.015, "#78350f", { mat: "cloth", hd: true });
        add("box", 0.31, 0.5, 0.3, 0.06, 0.06, 0.62, "#57534e", { ...hand(1), hd: false }); // crossbow
        add("box", 0.31, 0.53, 0.5, 0.5, 0.04, 0.05, "#3f2a1a", { ...hand(1), hd: false });
        crossbow(add, hand(1), "#5b3b22", "#57534e"); // HD: the crossbow gripped in the fist, a bolt laid in it
        // HD: a quiver of bolts slung across the back
        const back: AddOpts = { torso: true, hd: true };
        along(add, "cyl", [0.13, 0.5, -0.21], [-0.07, 1.0, -0.24], 0.11, 0.11, "#3f2a1a", { ...back, mat: "leather" });
        for (const k of [-1, 0, 1]) {
          const [bx, bz] = [-0.06 + k * 0.03, -0.24 + k * 0.015];
          along(add, "cyl", [bx + 0.02, 0.92, bz], [bx - 0.02, 1.13, bz], 0.014, 0.014, "#5b3b22", { ...back, mat: "wood" });
          add("box", bx - 0.02, 1.07, bz, 0.005, 0.06, 0.04, "#d6d3d1", { ...back, mat: "cloth" }); // fletching
        }
      }
      b.add("box", 1.4, 0, -1.0, 0.9, 0.7, 0.7, "#57534e", { hd: false }); // cage
      for (let i = 0; i < 4; i++) b.add("box", 1.05 + i * 0.23, 0, -0.6, 0.04, 0.7, 0.04, "#27272a", { mat: "dull", hdShape: "cyl" });
      // HD: a crate cage of rough planks with iron bars all round, and the fox crouched inside it
      {
        const WOOD = "#5b3b22";
        const BAR = "#27272a";
        const o: AddOpts = { mat: "wood", hd: true };
        for (const x of [0.97, 1.83]) for (const z of [-0.6, -1.33]) b.add("box", x, 0, z, 0.06, 0.7, 0.06, WOOD, o); // corner posts
        b.add("box", 1.4, 0, -0.97, 0.9, 0.04, 0.8, WOOD, o); // floor
        for (const z of [-0.75, -0.97, -1.19]) b.add("box", 1.4, 0.7, z, 0.94, 0.05, 0.2, WOOD, o); // lid planks
        b.add("box", 1.4, 0.69, -0.6, 0.86, 0.06, 0.06, WOOD, o); // front rail, over the bars
        b.add("box", 1.4, 0.64, -1.33, 0.86, 0.06, 0.06, WOOD, o);
        for (const x of [0.97, 1.83]) b.add("box", x, 0.64, -0.97, 0.06, 0.06, 0.67, WOOD, o);
        for (const x of [1.12, 1.28, 1.44, 1.6, 1.74]) b.add("cyl", x, 0.03, -1.33, 0.035, 0.6, 0.035, BAR, { mat: "dull", hd: true });
        for (const x of [0.97, 1.83]) for (const z of [-0.77, -0.95, -1.13]) b.add("cyl", x, 0.03, z, 0.035, 0.6, 0.035, BAR, { mat: "dull", hd: true });
        // The fox, crouched and watching through the bars, its brush curled round its feet
        const FOX = "#a0662d";
        const fur: AddOpts = { mat: "fur", hd: true };
        b.add("egg", 1.4, 0.04, -1.05, 0.2, 0.26, 0.28, FOX, fur);
        b.add("egg", 1.4, 0.1, -0.93, 0.13, 0.16, 0.08, "#f5f5f4", fur); // white chest
        for (const side of [-1, 1]) b.add("limb", 1.4 + side * 0.05, 0.04, -0.9, 0.05, 0.16, 0.05, "#3f2a1a", fur); // forelegs
        b.add("egg", 1.4, 0.24, -0.96, 0.17, 0.15, 0.16, FOX, fur); // head
        b.add("snout", 1.4, 0.27, -0.85, 0.08, 0.07, 0.13, FOX, fur);
        b.add("egg", 1.4, 0.295, -0.785, 0.03, 0.025, 0.025, "#0c0a09", { mat: "leather", hd: true }); // nose
        for (const side of [-1, 1]) {
          b.add("cone", 1.4 + side * 0.05, 0.36, -0.98, 0.055, 0.1, 0.03, "#7c2d12", fur); // ears
          b.add("sphere", 1.4 + side * 0.04, 0.32, -0.89, 0.025, 0.025, 0.025, "#0c0a09", { mat: "gem", hd: true }); // eyes
        }
        tail(b.add.bind(b), [1.4, 0.1, -1.16], { len: 0.42, w0: 0.07, w1: 0.09, n: 4, pitch: 1.0, curl: 1.4, yaw: 1.3, lag: 0.12, step: 0.08, color: FOX, tip: "#f5f5f4" }, fur);
      }
      b.add("box", 1.4, 0.15, -1.0, 0.45, 0.35, 0.35, "#a0662d", { hd: false }); // trapped fox
      b.add("box", -1.3, 0.6, -1.0, 1.2, 0.05, 0.05, "#5b3b22", { mat: "wood" }); // pelt rack
      for (const x of [-1.95, -0.65]) b.add("cyl", x, 0, -1.0, 0.06, 0.72, 0.06, "#5b3b22", { mat: "wood", hd: true }); // HD: its posts
      for (const x of [-1.7, -1.3, -0.9]) b.add("box", x, 0.15, -1.0, 0.3, 0.45, 0.04, "#a16207", { hd: false });
      // HD: pelts stretched out to dry, legs splayed and a tail hanging, each tied to the rack
      for (const [x, col] of [
        [-1.7, "#a16207"],
        [-1.3, "#92400e"],
        [-0.9, "#78716c"]
      ] as const) {
        const o: AddOpts = { mat: "hide", hd: true };
        b.add("egg", x, 0.16, -1.0, 0.27, 0.4, 0.03, col, { ...o, rx: Math.PI });
        for (const side of [-1, 1]) {
          b.add("box", x + side * 0.13, 0.42, -1.0, 0.05, 0.13, 0.02, col, { ...o, rz: side * -0.7 }); // forelegs
          b.add("box", x + side * 0.11, 0.12, -1.0, 0.05, 0.13, 0.02, col, { ...o, rz: side * 0.6 }); // hind legs
        }
        b.add("taper", x, 0.02, -1.0, 0.05, 0.15, 0.025, col, { ...o, rx: Math.PI }); // tail
        b.add("cyl", x, 0.55, -1.0, 0.012, 0.06, 0.012, "#d6d3d1", { mat: "cloth", hd: true }); // twine
      }
      b.add("cyl", -0.2, 0, 1.3, 0.5, 0.05, 0.5, "#71717a", { hd: false }); // snare
      // HD: a set leg-hold trap: its jaws lying open round the pan, teeth up, chained to a stake
      {
        const o: AddOpts = { mat: "dull", hd: true };
        const IRON = "#57534e";
        const c: V3 = [-0.2, 0.03, 1.3];
        b.add("box", -0.2, 0, 1.3, 0.62, 0.03, 0.08, IRON, o); // base bar
        b.add("cyl", -0.2, 0.03, 1.3, 0.12, 0.02, 0.12, IRON, o); // pan
        for (const [a0, a1] of [
          [0, Math.PI],
          [Math.PI, Math.PI * 2]
        ]) {
          arc(b.add.bind(b), c, [1, 0, 0], [0, 0, 1], 0.2, a0, a1, 6, 0.025, IRON, o);
          for (let k = 1; k < 6; k++) {
            const a = a0 + ((a1 - a0) * k) / 6;
            b.add("cone", c[0] + Math.cos(a) * 0.2, 0.035, c[2] + Math.sin(a) * 0.2, 0.025, 0.05, 0.025, IRON, o); // teeth
          }
        }
        for (const side of [-1, 1]) b.add("capsule", -0.2 + side * 0.31, 0.02, 1.3, 0.05, 0.06, 0.05, IRON, o); // springs
        for (let k = 0; k < 4; k++) along(b.add.bind(b), "capsule", [0.13 + k * 0.08, 0.015, 1.31 + k * 0.03], [0.19 + k * 0.08, 0.015, 1.33 + k * 0.03], 0.03, 0.03, IRON, o); // chain
        b.add("cyl", 0.48, 0, 1.43, 0.05, 0.22, 0.05, "#5b3b22", { mat: "wood", hd: true }); // stake
      }
      break;
    }

    /* -------------------------- UNCOMMON (cont.) -------------------------- */
    case "mob-skeleton": {
      // Accent: cold teal shields and a tattered teal banner; the captain wears a rusted helm
      const TEAL = "#0e7490";
      const look: FigureLook = { skin: BONE, tunic: "#d6cfb8", legs: BONE, boots: "#a8a29e", belt: "#57534e", eyes: "#0c0a09", face: "skull" };
      for (const [x, z, r, s, cap] of [
        [0, 0.2, -0.1, 1.2, 1],
        [-1.1, 0.4, 0.3, 1.0, 0],
        [1.1, -0.2, -0.5, 1.0, 0]
      ]) {
        const { add, hand, neck } = figure(b, x, z, r, look, s, { radius: 0.4, pace: 0.85 });
        add("box", 0, 0.78, 0.14, 0.38, 0.05, 0.06, "#57534e", { hd: false }); // ribs
        add("box", 0, 0.92, 0.14, 0.38, 0.05, 0.06, "#57534e", { hd: false });
        // HD: a rib cage showing through the rags: curved ribs round a breastbone
        const chest: AddOpts = { torso: true, hd: true, mat: "bone" };
        for (const [y, rr] of [
          [0.74, 0.22],
          [0.82, 0.24],
          [0.9, 0.25],
          [0.98, 0.24]
        ])
          arc(add, [0, y, 0], [1, 0, 0], [0, 0, 1], [rr, 0.165], 0.35, Math.PI - 0.35, 4, 0.035, BONE, chest);
        along(add, "capsule", [0, 0.71, 0.17], [0, 1.0, 0.165], 0.05, 0.035, BONE, chest);
        add("box", -0.31, 0.4, 0.2, 0.08, 0.52, 0.46, TEAL, { ...hand(-1), hd: false }); // shield
        roundShield(add, hand(-1), TEAL, "#57534e", 0.5, "wood", "dull"); // HD: a round teal-painted shield, iron rim and boss
        add("cyl", 0.31, 0.15, 0.12, 0.05, 1.6, 0.05, "#57534e", { ...hand(1), hd: false }); // spear
        add("cone", 0.31, 1.75, 0.12, 0.11, 0.25, 0.11, "#a8a29e", { ...hand(1), hd: false });
        spear(add, hand(1), "#57534e", "#a8a29e", "dull", 1.8, TEAL); // HD: the spear through the fist, a teal rag under its point
        if (cap) {
          add("cyl", 0, 1.3, 0, 0.4, 0.16, 0.4, "#78716c", { hd: false }); // the captain's rusted helm
          // HD: a rusted dome helm with a rim and a nose guard
          add("sphere", 0, 1.3, 0, 0.42, 0.3, 0.42, "#78716c", { ...neck, mat: "dull", hd: true });
          add("cyl", 0, 1.3, 0, 0.45, 0.04, 0.45, "#57534e", { ...neck, mat: "dull", hd: true });
          add("box", 0, 1.17, 0.215, 0.04, 0.15, 0.03, "#57534e", { ...neck, mat: "dull", hd: true });
        }
      }
      for (const [x, z] of [
        [-1.6, -1.2],
        [0.6, -1.4]
      ]) {
        b.add("box", x, 0, z, 0.5, 0.75, 0.15, "#78716c", { rz: range(rng, -0.25, 0.25), mat: "stone", hdShape: "block" }); // grave markers
      }
      // HD: the graves' scattered bones and a skull, and an open pit
      const gv = mulberry32(6121);
      for (let i = 0; i < 3; i++) {
        const [x, z, a] = [-1.2 + gv() * 2.2, -1.0 - gv() * 0.6, gv() * Math.PI];
        bone(b.add.bind(b), [x - Math.cos(a) * 0.18, 0.04, z + Math.sin(a) * 0.18], [x + Math.cos(a) * 0.18, 0.04, z - Math.sin(a) * 0.18], 0.05, BONE, { mat: "bone", hd: true });
      }
      skull(b.add.bind(b), -0.4, 0.08, -1.55, 0.26, BONE, 0.9, { mat: "bone", hd: true });
      b.add("egg", -0.6, 0, -0.9, 0.8, 0.03, 0.45, "#1c1917", { mat: "stone", hd: true, ry: 0.3 }); // an empty grave
      b.add("cyl", 1.7, 0, 1.1, 0.06, 2.0, 0.06, "#3f2a1a", { mat: "wood" }); // banner pole
      b.add("box", 1.95, 1.3, 1.1, 0.45, 0.6, 0.03, TEAL, { idle: IDLE_KIND.flutter, mat: "cloth" });
      // HD: the crossbar the banner hangs from, and a cap on the pole
      b.add("box", 1.7, 1.93, 1.1, 0.06, 0.06, 0.56, "#3f2a1a", { mat: "wood", hd: true, rx: Math.PI / 2, ry: Math.PI / 2 });
      b.add("cone", 1.7, 2.0, 1.1, 0.1, 0.14, 0.1, "#57534e", { mat: "dull", hd: true });
      break;
    }
    case "mob-scorpion": {
      // Accent: amber stingers and claw tips; prop: a bleached skull on a stake
      const AMBER = "#f59e0b";
      for (const [x, z, r, s] of [
        [-0.4, 0.2, 0.5, 1.4],
        [1.2, -0.5, -0.6, 0.85],
        [-1.4, -0.8, 1.2, 0.8]
      ]) {
        const sc = b.walker(x, z, r, "walk", 0.45, { pace: 1.5 });
        const add = scaler(sc, s);
        add("sphere", 0, 0.1, 0, 0.9, 0.4, 1.2, "#b45309", { mat: "hide", hdShape: "pod" });
        // HD: overlapping plates of its armoured back, beady eyes on its head
        for (let i = 0; i < 4; i++) add("egg", 0, 0.41, 0.36 - i * 0.24, 0.8 - i * 0.07, 0.11, 0.28, "#92400e", { mat: "hide", hd: true });
        for (const side of [-1, 1]) add("sphere", side * 0.08, 0.42, 0.5, 0.05, 0.05, 0.05, "#0c0a09", { mat: "gem", hd: true });
        for (let i = 0; i < 6; i++) {
          // Tail curling up over the back
          const t = i / 5;
          const ty = 0.25 + Math.sin(t * Math.PI * 0.85) * 1.1;
          const tz = -0.6 - Math.sin(t * Math.PI * 0.5) * 0.6 + t * t * 0.8;
          // Each segment a little further behind the body, so the tail whips through
          add("sphere", 0, ty, tz, 0.26 * (1 - t * 0.3), 0.26, 0.26, "#92400e", { trail: { lag: 0.04 + t * 0.2, damp: 0.45, root: [0, 0.3, -0.55] }, hd: false });
        }
        add("cone", 0, 1.25, 0.25, 0.12, 0.35, 0.12, AMBER, { rx: 2.4, trail: { lag: 0.26, damp: 0.45, root: [0, 0.3, -0.55] }, hd: false }); // stinger
        // HD: a segmented tail arching up over its back, its amber stinger on the very end, riding the last segment
        const end = tail(add, [0, 0.3, -0.55], { len: 1.9, w0: 0.24, w1: 0.15, n: 6, pitch: -1.0, curl: -3.4, lag: 0.04, step: 0.04, damp: 0.45, color: "#92400e" }, { mat: "hide", hd: true });
        const sting: AddOpts = { mat: "bone", hd: true, trail: end.trail };
        const [tx, ty, tz] = end.tip;
        const [dx, dy, dz] = end.dir;
        add("egg", tx + dx * 0.06, ty + dy * 0.06 - 0.08, tz + dz * 0.06, 0.16, 0.16, 0.16, AMBER, sting); // venom bulb
        along(add, "horn", [tx + dx * 0.1, ty + dy * 0.1, tz + dz * 0.1], [tx + dx * 0.32, ty + dy * 0.32 - 0.06, tz + dz * 0.32], 0.07, 0.07, AMBER, sting);
        for (const side of [-1, 1]) {
          add("box", side * 0.38, 0.1, 0.75, 0.14, 0.12, 0.5, "#92400e", { ry: side * -0.4, hd: false });
          add("box", side * 0.5, 0.06, 1.05, 0.26, 0.18, 0.3, AMBER, { hd: false }); // claws
          // HD: a jointed arm out to a pincer, its two amber fingers open
          along(add, "capsule", [side * 0.3, 0.2, 0.5], [side * 0.5, 0.26, 0.78], 0.11, 0.1, "#92400e", { mat: "hide", hd: true });
          along(add, "capsule", [side * 0.5, 0.26, 0.78], [side * 0.48, 0.2, 0.98], 0.1, 0.09, "#92400e", { mat: "hide", hd: true });
          add("egg", side * 0.48, 0.12, 1.05, 0.2, 0.16, 0.24, "#b45309", { mat: "hide", hd: true });
          along(add, "horn", [side * 0.5, 0.22, 1.12], [side * 0.47, 0.25, 1.36], 0.07, 0.06, AMBER, { mat: "bone", hd: true });
          along(add, "horn", [side * 0.44, 0.16, 1.12], [side * 0.43, 0.12, 1.32], 0.06, 0.05, AMBER, { mat: "bone", hd: true });
          for (let l = 0; l < 3; l++) {
            const lz = 0.25 - l * 0.3;
            const leg: AddOpts = { leg: (l % 2 ? side : -side) as 1 | -1, hip: 0.15, pivot: [side * 0.35, lz] };
            add("box", side * 0.55, 0, lz, 0.4, 0.06, 0.06, "#78350f", { ...leg, rz: side * -0.5, hd: false });
            // HD: each leg bent at a raised knee down to a pointed foot
            const knee: V3 = [side * 0.58, 0.34, lz + (l - 1) * 0.06];
            along(add, "capsule", [side * 0.3, 0.2, lz], knee, 0.06, 0.06, "#78350f", { ...leg, mat: "hide", hd: true });
            along(add, "taper", [side * 0.82, 0.0, lz + (l - 1) * 0.14], knee, 0.05, 0.05, "#78350f", { ...leg, mat: "hide", hd: true });
          }
        }
      }
      b.add("cyl", 1.4, 0, 1.2, 0.06, 1.3, 0.06, "#78350f", { mat: "wood" }); // stake…
      b.add("sphere", 1.4, 1.3, 1.2, 0.36, 0.3, 0.42, BONE, { hd: false }); // …and its skull
      skull(b.add.bind(b), 1.4, 1.36, 1.2, 0.34, BONE, 0.4, { mat: "bone", hd: true }); // HD: a bleached skull on the stake
      b.add("box", 1.4, 0.95, 1.235, 0.09, 0.3, 0.02, "#78716c", { mat: "cloth", hd: true }); // a rag tied under it
      break;
    }
    case "mob-harpy": {
      // Accent: crimson crests; prop: their twig nest with eggs on the crag
      const CRIMSON = "#dc2626";
      b.add("sphere", 0, -0.6, -0.4, 3.0, 2.2, 2.4, "#78716c", { mat: "stone", hdShape: "boulder" }); // crag perch
      b.add("cyl", 0.2, 0.45, -0.4, 1.0, 0.3, 1.0, "#78350f", { hd: false }); // nest
      for (const x of [0, 0.3]) b.add("sphere", x, 0.6, -0.4, 0.26, 0.32, 0.26, "#e7e5e4", { hd: false });
      // HD: the nest on top of the crag (Normal's sits inside it): rings of woven twigs, three speckled eggs, feathers
      {
        const nr = mulberry32(7717);
        const [nx, ny, nz] = [0.15, 1.42, -0.45];
        b.add("egg", nx, ny - 0.04, nz, 0.95, 0.16, 0.95, "#5b3b22", { mat: "wood", hd: true }); // its bowl
        for (let k = 0; k < 4; k++) {
          const a0 = nr() * Math.PI * 2;
          arc(b.add.bind(b), [nx, ny + 0.03 + k * 0.05, nz], [1, 0, 0], [0, 0, 1], 0.42 + k * 0.035, a0, a0 + Math.PI * 2, 10, 0.06, k % 2 ? "#78350f" : "#5b3b22", { mat: "wood", hd: true });
        }
        for (let i = 0; i < 6; i++) {
          const a = nr() * Math.PI * 2;
          const [r0, r1] = [0.4, 0.62 + nr() * 0.12];
          along(b.add.bind(b), "cyl", [nx + Math.cos(a) * r0, ny + 0.12, nz + Math.sin(a) * r0], [nx + Math.cos(a + 0.3) * r1, ny + 0.1 + nr() * 0.12, nz + Math.sin(a + 0.3) * r1], 0.025, 0.025, "#78350f", { mat: "wood", hd: true }); // stray twigs
        }
        for (const [ex, ez] of [
          [-0.1, -0.05],
          [0.12, 0.08],
          [0.05, -0.15]
        ])
          b.add("egg", nx + ex, ny + 0.02, nz + ez, 0.2, 0.26, 0.2, "#e7e5e4", { mat: "bone", hd: true }); // speckled eggs
        for (let i = 0; i < 3; i++) b.add("drop", nx - 0.7 + nr() * 1.4, 1.2 + nr() * 0.2, nz + 0.6 + nr() * 0.3, 0.06, 0.24, 0.015, i % 2 ? "#92400e" : CRIMSON, { mat: "fur", hd: true, rx: 1.3, ry: nr() * 3 }); // shed feathers
      }
      for (const [x, z, h, r, s] of [
        [0, -0.3, 1.5, 0.3, 1.3],
        [-1.4, 1.0, 2.6, 1.6, 1],
        [1.3, 1.2, 3.2, -1.4, 1]
      ]) {
        const hp = b.walker(x, z, r, "fly", 1.0, { y: h, pace: 1.1 });
        const add = scaler(hp, s);
        add("sphere", 0, 0, 0, 0.45, 0.7, 0.4, "#a16207", { hd: false }); // feathered body
        const head: AddOpts = { head: { y: 0.6 } };
        // HD: a woman's shoulders and neck rising from a feathered body, a face, wild hair trailing behind
        add("egg", 0, -0.05, -0.02, 0.44, 0.6, 0.38, "#a16207", { mat: "fur", hd: true });
        add("limb", 0, 0.32, 0.0, 0.34, 0.28, 0.24, "#e0b48a", { mat: "skin", hd: true });
        add("taper", 0, 0.55, 0.02, 0.12, 0.14, 0.12, "#e0b48a", { mat: "skin", hd: true });
        add("sphere", 0, 0.62, 0.05, 0.3, 0.3, 0.3, "#e0b48a", { ...head, mat: "skin", hdShape: "egg" });
        faceAt(add, { skin: "#e0b48a", tunic: "", legs: "", boots: "", belt: "", eyes: "#a16207", ears: false }, head, 0.77, 0.05, 0.88);
        add("sphere", 0, 0.72, -0.05, 0.36, 0.3, 0.32, "#44403c", { ...head, mat: "fur" }); // wild hair
        for (const k of [-1, 0, 1]) add("drop", k * 0.09, 0.42, -0.22, 0.1, 0.4, 0.06, "#44403c", { trail: { lag: 0.15 + Math.abs(k) * 0.06, damp: 0.25, root: [0, 0.82, -0.15] }, mat: "fur", hd: true, rx: Math.PI - 0.3 });
        add("cone", 0, 0.88, -0.06, 0.12, 0.3, 0.2, CRIMSON, { ...head, rx: -0.4, hd: false }); // crest
        for (const k of [-1, 0, 1]) along(add, "drop", [k * 0.05, 0.92, -0.04], [k * 0.12, 1.24 - Math.abs(k) * 0.08, -0.2], 0.07, 0.04, CRIMSON, { ...head, mat: "fur", hd: true }); // HD: a crest of crimson plumes
        for (const side of [-1, 1]) {
          add("box", side * 0.7, 0.35, 0, 1.1, 0.05, 0.5, "#92400e", { rz: side * -0.6, flap: 8, hd: false });
          // HD: a wing of long flight feathers fanned behind coverts, every feather hinged at the Normal wing's
          // shoulder (x 0.246, y 0.686) so the wing beats as one
          const wing: AddOpts = { flap: 8, hd: true, mat: "fur" };
          for (const [wz, w, d, col] of [
            [0.13, 1.18, 0.16, "#78350f"],
            [0.03, 1.08, 0.17, "#92400e"],
            [-0.07, 0.95, 0.17, "#78350f"],
            [-0.17, 0.78, 0.16, "#92400e"],
            [-0.26, 0.58, 0.14, "#78350f"]
          ] as const)
            add("egg", side * (0.246 + w / 2), 0.686 - 0.01, wz, w, 0.02, d, col, wing);
          add("egg", side * (0.246 + 0.3), 0.686 + 0.005, -0.02, 0.6, 0.03, 0.42, "#a16207", wing); // coverts
          add("cone", side * 0.1, -0.25, 0.05, 0.08, 0.3, 0.08, "#a8a29e", { rx: Math.PI, hd: false }); // talons
          // HD: scaly legs ending in three hooked talons
          along(add, "taper", [side * 0.1, -0.32, 0.08], [side * 0.1, 0.0, 0.03], 0.07, 0.07, "#a8a29e", { mat: "hide", hd: true });
          for (const k of [-1, 0, 1]) along(add, "horn", [side * 0.1 + k * 0.035, -0.31, 0.08], [side * 0.1 + k * 0.06, -0.38, 0.2], 0.03, 0.03, "#1c1917", { mat: "bone", hd: true });
        }
      }
      break;
    }
    case "mob-lizardfolk": {
      // Accent: amber war-paint and the shaman's crest; prop: a reed totem with an amber mask; bog pools, no disc
      const AMBER = "#f59e0b";
      const look: FigureLook = { skin: "#4d7c0f", tunic: "#65a30d", legs: "#3f6212", boots: "#365314", belt: "#78350f", eyes: "#fde047", face: "beast" };
      for (const [x, z, r, s, shaman] of [
        [0, 0.1, 0.2, 1.2, 1],
        [-1.1, 0.5, 0.4, 1.0, 0],
        [1.0, 0.6, -0.3, 1.0, 0]
      ]) {
        const { add, hand } = figure(b, x, z, r, look, s, { radius: 0.4 });
        add("box", 0, 1.1, 0.2, 0.2, 0.16, 0.3, look.skin, { hd: false }); // snout
        // HD: a reptile's long snout with nostrils, a lower jaw and a row of small teeth
        add("snout", 0, 1.1, 0.25, 0.23, 0.15, 0.32, look.skin, { mat: "hide", hd: true });
        add("snout", 0, 1.06, 0.22, 0.2, 0.07, 0.28, "#3f6212", { mat: "hide", hd: true });
        for (const side of [-1, 1]) {
          add("sphere", side * 0.04, 1.19, 0.39, 0.025, 0.02, 0.025, "#1c1917", { mat: "gem", hd: true }); // nostrils
          for (const k of [0, 1, 2]) add("cone", side * (0.05 - k * 0.005), 1.07, 0.34 - k * 0.06, 0.02, 0.035, 0.02, BONE, { mat: "bone", hd: true, rx: Math.PI });
        }
        add("cone", 0, 0.54 - 0.35, -0.25, 0.15, 0.7, 0.15, look.skin, { rx: -2.0, trail: { lag: 0.25, damp: 0.3, root: [0, 0.55, -0.15] }, hd: false }); // tail, from the hips down toward the ground
        tail(add, [0, 0.55, -0.15], { len: 0.8, w0: 0.16, w1: 0.05, n: 4, pitch: 0.95, curl: -0.8, lag: 0.16, step: 0.08, color: look.skin }, { mat: "hide", hd: true }); // HD: a heavy tail sweeping down and back
        add("box", 0, 0.92, 0.17, 0.3, 0.06, 0.06, AMBER, { mat: "skin" }); // war-paint
        if (shaman) {
          add("cone", 0, 1.38, -0.05, 0.12, 0.42, 0.3, AMBER, { rx: -0.3, hd: false }); // crest
          // HD: a fan of amber crest spines down the back of the head
          for (const k of [0, 1, 2, 3]) along(add, "horn", [0, 1.42 - k * 0.04, 0.05 - k * 0.09], [0, 1.68 - k * 0.07, -0.08 - k * 0.12], 0.05, 0.1 - k * 0.012, AMBER, { mat: "bone", hd: true });
          add("cyl", 0.31, 0.1, 0.15, 0.05, 1.8, 0.05, "#78350f", { ...hand(1), hd: false }); // gnarled staff
          add("sphere", 0.31, 1.85, 0.15, 0.2, 0.2, 0.2, BONE, { ...hand(1), hd: false });
          // HD: a crooked staff through the fist, a beast's skull lashed on top and amber feathers hanging from it
          const st: AddOpts = { ...hand(1), hd: true, mat: "wood" };
          const pts: V3[] = [
            [0.3, 0.06, 0.04],
            [0.31, 0.585, 0.02],
            [0.28, 1.2, 0.06],
            [0.33, 1.78, 0.03]
          ];
          for (let i = 0; i < 3; i++) along(add, "taper", pts[i], pts[i + 1], 0.065 - i * 0.005, 0.065 - i * 0.005, "#78350f", st);
          skull(add, 0.33, 1.82, 0.05, 0.22, BONE, 0, { ...hand(1), hd: true, mat: "bone" });
          for (const k of [-1, 1]) add("drop", 0.33 + k * 0.07, 1.55, 0.05, 0.05, 0.2, 0.02, AMBER, { ...hand(1), hd: true, mat: "fur", rx: Math.PI });
        } else {
          add("cyl", 0.31, 0.1, 0.15, 0.04, 1.8, 0.04, "#a8a29e", { ...hand(1), hd: false }); // bone spear
          add("cone", 0.31, 1.9, 0.15, 0.1, 0.25, 0.1, BONE, { ...hand(1), hd: false });
          spear(add, hand(1), "#a8a29e", BONE, "bone", 1.9, AMBER); // HD: the spear through the fist, a bone point bound with amber
          add("cyl", -0.31, 0.45, 0.2, 0.42, 0.05, 0.42, "#a16207", { ...hand(-1), rx: Math.PI / 2, hd: false }); // reed shield
          roundShield(add, hand(-1), "#a16207", "#78350f", 0.44, "wood", "wood"); // HD: a round shield of woven reed on the forearm
        }
      }
      for (const [x, z] of [
        [-1.5, -1.0],
        [-1.1, -1.4]
      ]) {
        b.add("sphere", x, 0, z, 0.45, 0.55, 0.45, "#bef264", { mat: "leather", hdShape: "egg" }); // egg mound
      }
      b.add("egg", -1.3, 0, -1.2, 1.3, 0.14, 1.0, "#3f2a1a", { mat: "stone", hd: true }); // HD: the mud mound under the eggs
      for (const [x, z, w] of [
        [1.4, -1.2, 1.4],
        [-0.3, 1.6, 1.1]
      ]) {
        b.add("sphere", x, -0.08, z, w, 0.16, w * 0.7, "#365314", { mat: "gel", hdShape: "egg" }); // bog pools
      }
      b.add("cyl", 1.8, 0, 0.2, 0.12, 1.8, 0.12, "#a16207", { mat: "wood" }); // reed totem…
      b.add("box", 1.8, 1.4, 0.3, 0.42, 0.5, 0.06, AMBER, { mat: "wood" }); // …with its painted mask
      // HD: the totem is a bound bundle of reeds; the mask has eye holes and a painted grin
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add("cyl", 1.8 + Math.cos(a) * 0.07, 0, 0.2 + Math.sin(a) * 0.07, 0.04, 1.65 + (i % 3) * 0.1, 0.04, "#a16207", { mat: "wood", hd: true });
      }
      for (const y of [0.4, 1.0]) b.add("cyl", 1.8, y, 0.2, 0.2, 0.06, 0.2, "#78350f", { mat: "cloth", hd: true });
      for (const side of [-1, 1]) b.add("box", 1.8 + side * 0.1, 1.68, 0.35, 0.09, 0.07, 0.06, "#1c1917", { mat: "wood", hd: true }); // eye holes
      b.add("box", 1.8, 1.48, 0.35, 0.26, 0.04, 0.06, "#7f1d1d", { mat: "wood", hd: true }); // grin
      break;
    }
    case "bandit-riverpirate": {
      // Accent: red bandanas and patched red sail; prop: the mast lantern. The raft drifts on the fjord's open water
      const RED = "#b91c1c";
      const raft = b.walker(0, 0, 0.3, "hover", 0.25, { y: 0.05, pace: 0.6 });
      for (let i = 0; i < 6; i++) raft.add("cyl", -1.0 + i * 0.4, 0.18 - 1.2, 0, 0.36, 2.4, 0.36, "#8b5a2b", { rx: Math.PI / 2, mat: "wood" }); // logs, floating on the water
      // HD: rope lashings binding the logs
      for (const z of [-0.85, 0.85]) raft.add("cyl", 0, 0.18 - 1.24, z, 0.39, 2.48, 0.06, "#a8a29e", { rz: Math.PI / 2, mat: "cloth", hd: true });
      raft.add("cyl", 0, 0.3, -0.6, 0.06, 1.9, 0.06, "#3f2a1a", { mat: "wood" });
      raft.add("box", 0.3, 1.2, -0.6, 0.7, 0.7, 0.03, RED, { idle: IDLE_KIND.flutter, mat: "cloth" }); // patched sail
      along(raft.add.bind(raft), "cyl", [-0.05, 1.93, -0.6], [0.7, 1.93, -0.6], 0.04, 0.04, "#3f2a1a", { mat: "wood", hd: true }); // HD: the yard the sail hangs from
      raft.add("box", 0, 2.0, -0.6, 0.16, 0.2, 0.16, "#44403c", { hd: false }); // mast lantern
      raft.add("sphere", 0, 2.03, -0.6, 0.1, 0.12, 0.1, "#fcd34d", { glow: true });
      lanternFrame(raft.add.bind(raft), 0, 2.0, -0.6, 0.14, 0.18, "#44403c", {}); // HD: its iron frame, the flame showing
      const look: FigureLook = { skin: "#d6a77a", tunic: "#0f766e", legs: "#1f2937", boots: "#292524", belt: "#3f2a1a", eyes: "#1c1917" };
      for (const [x, z, s] of [
        [-0.5, 0.45, 1.0],
        [0.6, 0.6, 0.85]
      ]) {
        const { add, hand, neck } = figure(raft.child(x, z, 0, 0.36), 0, 0, 0, look, s, undefined, true); // standing on the deck
        add("box", 0, 1.26, 0, 0.38, 0.1, 0.38, RED, { hd: false }); // bandana
        // HD: a red bandana tied over the crown, its knot's ends trailing
        add("egg", 0, 1.3, -0.02, 0.37, 0.2, 0.37, RED, { ...neck, mat: "cloth", hd: true });
        for (const side of [-1, 1]) add("box", side * 0.05, 1.16, -0.22, 0.07, 0.16, 0.04, RED, { trail: { lag: 0.18 + side * 0.04, damp: 0.3, root: [0, 1.3, -0.2] }, mat: "cloth", hd: true, rz: side * 0.25 });
        add("cyl", 0.31, 0.1, 0.12, 0.04, 1.7, 0.04, "#5b3b22", { ...hand(1), rx: 0.3, hd: false }); // pole
        along(add, "cyl", [0.31, -0.3, 0.42], [0.31, 1.6, -0.38], 0.045, 0.045, "#5b3b22", { ...hand(1), mat: "wood", hd: true }); // HD: the punt pole through the fist
      }
      b.add("box", -2.2, 0.05, 0.9, 0.12, 0.7, 2.0, "#78350f", { ry: 0.3, hd: false }); // chain across the river
      // HD: an iron chain sagging across the river between two posts
      {
        const [dx, dz] = [Math.sin(0.3), Math.cos(0.3)];
        const ends: V3[] = [
          [-2.2 - dx, 0.62, 0.9 - dz],
          [-2.2 + dx, 0.62, 0.9 + dz]
        ];
        for (const [x, , z] of ends) b.add("cyl", x, -0.05, z, 0.14, 0.8, 0.14, "#5b3b22", { mat: "wood", hd: true });
        const n = 12;
        for (let i = 0; i < n; i++) {
          const at = (t: number): V3 => [ends[0][0] + (ends[1][0] - ends[0][0]) * t, 0.62 - Math.sin(Math.PI * t) * 0.32, ends[0][2] + (ends[1][2] - ends[0][2]) * t];
          const [w, d] = i % 2 ? [0.05, 0.02] : [0.02, 0.05];
          along(b.add.bind(b), "capsule", at(i / n), at((i + 1) / n), w, d, "#44403c", { mat: "dull", hd: true });
        }
      }
      break;
    }
    case "bandit-raider": {
      // Accent: indigo turbans and saddle cloths; prop: the indigo pennant on their tent
      const INDIGO = "#4338ca";
      const camel = (x: number, z: number, r: number, s: number) => {
        const q = b.walker(x, z, r, "walk", 0.6, { pace: 0.6 });
        const add = scaler(q, s);
        for (const [lx, lz, leg] of [
          [-0.14, 0.34, 1],
          [0.14, 0.34, -1],
          [-0.14, -0.34, -1],
          [0.14, -0.34, 1]
        ] as const) {
          add("box", lx, 0, lz, 0.1, 0.62, 0.1, "#b8925a", { leg, mat: "hide", hdShape: "limb" });
          add("egg", lx, 0, lz + 0.02, 0.15, 0.05, 0.17, "#78716c", { leg, hip: 0.62, mat: "leather", hd: true }); // HD: broad padded feet
          add("egg", lx, 0.28, lz, 0.13, 0.1, 0.13, "#b8925a", { leg, hip: 0.62, mat: "hide", hd: true }); // knobbly knees
        }
        add("box", 0, 0.6, 0, 0.4, 0.36, 1.0, "#c9a15a", { mat: "hide", hdShape: "pod" });
        add("sphere", 0, 0.9, -0.12, 0.42, 0.36, 0.5, "#b8925a", { mat: "fur", hdShape: "egg" }); // hump
        const head: AddOpts = { head: { y: 0.85, z: 0.48 } };
        add("cyl", 0, 0.82, 0.55, 0.16, 0.55, 0.16, "#c9a15a", { ...head, rx: 0.45, mat: "hide", hdShape: "taper" }); // neck
        add("box", 0, 1.25, 0.78, 0.2, 0.2, 0.38, "#c9a15a", { ...head, mat: "hide", hdShape: "snout" }); // head
        // HD: ears, sleepy eyes, a drooping lip, and a tufted tail
        for (const side of [-1, 1]) {
          add("cone", side * 0.08, 1.4, 0.62, 0.05, 0.08, 0.04, "#b8925a", { ...head, mat: "hide", hd: true, rz: side * -0.5 });
          add("sphere", side * 0.095, 1.35, 0.72, 0.04, 0.035, 0.04, "#1c1917", { ...head, mat: "gem", hd: true });
          add("capsule", side * 0.095, 1.37, 0.73, 0.05, 0.02, 0.045, "#b8925a", { ...head, mat: "hide", hd: true, rz: Math.PI / 2 }); // heavy lids
        }
        add("egg", 0, 1.2, 0.93, 0.13, 0.08, 0.1, "#a8875a", { ...head, mat: "skin", hd: true });
        tail(add, [0, 0.82, -0.5], { len: 0.4, w0: 0.05, w1: 0.04, n: 3, pitch: 1.2, curl: 0.2, lag: 0.15, step: 0.07, color: "#b8925a", tip: "#3f2a1a" }, { mat: "fur", hd: true });
        add("box", 0, 0.98, 0.18, 0.5, 0.06, 0.5, INDIGO, { mat: "cloth" }); // saddle cloth
        // HD: tassels swinging from the saddle cloth's corners
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add("drop", sx * 0.25, 0.8, 0.18 + sz * 0.25, 0.05, 0.16, 0.05, "#fbbf24", { trail: { lag: 0.2, damp: 0.3, root: [sx * 0.25, 0.98, 0.18 + sz * 0.25] }, mat: "cloth", hd: true, rx: Math.PI });
        return q;
      };
      const look: FigureLook = { skin: "#a16207", tunic: "#f5f5f4", legs: "#e7e5e4", boots: "#78350f", belt: INDIGO, eyes: "#1c1917" };
      for (const [x, z, r, s] of [
        [-0.7, 0.2, 0.4, 1.7],
        [1.0, -0.3, -0.3, 1.5]
      ]) {
        const q = camel(x, z, r, s);
        const { add, hand, neck } = figure(q.child(0, 0.1, 0, 0.95 * s), 0, 0, 0, look, 0.85, undefined, true);
        add("sphere", 0, 1.3, 0, 0.42, 0.24, 0.42, INDIGO, { mat: "cloth" }); // turban
        // HD: the turban's wound band and the tail of its cloth hanging behind
        add("egg", 0, 1.29, 0, 0.44, 0.11, 0.44, "#3730a3", { ...neck, mat: "cloth", hd: true });
        add("box", 0, 0.98, -0.22, 0.12, 0.32, 0.03, INDIGO, { trail: { lag: 0.2, damp: 0.3, root: [0, 1.3, -0.2] }, mat: "cloth", hd: true });
        add("box", 0.31, 0.6, 0.25, 0.04, 0.06, 0.6, "#a8a29e", { ...hand(1), rx: -0.6, hd: false }); // scimitar
        scimitar(add, hand(1), "#a8a29e", "#3f2a1a"); // HD: a curved scimitar gripped in the fist
      }
      b.add("pyramid", -1.2, 0, -1.3, 1.5, 1.2, 1.5, "#a16207", { mat: "cloth" }); // tent
      b.add("cyl", -1.2, 1.15, -1.3, 0.04, 0.7, 0.04, "#3f2a1a", { mat: "wood" });
      b.add("box", -1.02, 1.6, -1.3, 0.34, 0.22, 0.03, INDIGO, { idle: IDLE_KIND.flutter, mat: "cloth" });
      // HD: guy ropes pegged out round the tent, a dark doorway and a rug laid before it
      for (const [ox, oz] of [
        [1, 0],
        [-1, 0],
        [0, -1]
      ]) {
        along(b.add.bind(b), "cyl", [-1.2 + ox * 0.38, 0.6, -1.3 + oz * 0.38], [-1.2 + ox * 1.15, 0.02, -1.3 + oz * 1.15], 0.015, 0.015, "#d6d3d1", { mat: "cloth", hd: true });
        b.add("cyl", -1.2 + ox * 1.15, 0, -1.3 + oz * 1.15, 0.04, 0.12, 0.04, "#3f2a1a", { mat: "wood", hd: true });
      }
      b.add("prism", -1.2, 0, -0.62, 0.42, 0.5, 0.06, "#1c1917", { mat: "cloth", hd: true, rx: -0.55 }); // doorway
      b.add("box", -1.2, 0, -0.15, 0.9, 0.02, 0.55, INDIGO, { mat: "cloth", hd: true }); // rug
      break;
    }

    /* ---------------------------- RARE (cont.) ---------------------------- */
    case "mob-chimera": {
      // Glow: burning eyes; looping effect: smoke from its lion's nostrils; goat horns, beating bat wings, a serpent tail
      const c = beast(b, 0, 0, 0.4, { fur: "#b7791f", ruff: "#7c2d12", dark: "#78350f", eyes: "#ef4444", glowEyes: true }, 2.0, { radius: 0.7, pace: 0.9 });
      c.add("sphere", 0, 0.62, 0.55, 0.62, 0.55, 0.5, "#7c2d12", { hd: false }); // mane
      // HD: a lion's ruff framing the face from behind, shaggy locks radiating round it and swaying as it prowls
      c.add("egg", 0, 0.5, 0.42, 0.68, 0.62, 0.36, "#7c2d12", { mat: "fur", hd: true });
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * Math.PI * 2 + 0.2;
        const [len, r0] = [0.24 + (k % 3) * 0.04, 0.3];
        const [cx, cy] = [Math.cos(a) * (r0 + len * 0.4), 0.8 + Math.sin(a) * (r0 + len * 0.4)];
        c.add("drop", cx, cy - len / 2, 0.36, 0.14, len, 0.12, k % 2 ? "#7c2d12" : "#92400e", { trail: { lag: 0.08 + (k % 3) * 0.03, damp: 0.4, root: [cx * 0.5, 0.8 + (cy - 0.8) * 0.5, 0.42] }, mat: "fur", hd: true, rz: a - Math.PI / 2, rx: -0.35 });
      }
      for (const side of [-1, 1]) {
        c.add("cone", side * 0.13, 0.88, 0.55, 0.06, 0.26, 0.06, "#e7e5e4", { rx: -0.7, rz: side * -0.4, hd: false }); // goat horns
        // HD: ridged goat horns sweeping back from the brow
        along(c.add, "horn", [side * 0.1, 0.84, 0.62], [side * 0.2, 1.02, 0.42], 0.08, 0.08, "#e7e5e4", { ...c.neck, mat: "bone", hd: true });
        c.add("box", side * 0.55, 0.62, 0, 0.8, 0.03, 0.45, "#3b0764", { rz: side * -0.5, flap: 3, hd: false }); // bat wings
        // HD: bat wings of skin between finger bones, every piece hinged at the Normal wing's shoulder (x 0.199, y 0.827)
        const wing: AddOpts = { flap: 3, hd: true };
        for (const [wz, w, d] of [
          [0.12, 0.85, 0.17],
          [0.0, 0.75, 0.18],
          [-0.12, 0.6, 0.17],
          [-0.03, 0.35, 0.42]
        ]) {
          c.add("egg", side * (0.199 + w / 2), 0.827 - 0.006, wz, w, 0.012, d, "#3b0764", { ...wing, mat: "hide" });
          if (w > 0.4) c.add("box", side * (0.199 + (w * 0.92) / 2), 0.827 - 0.014, wz, w * 0.92, 0.028, 0.025, "#3b0764", { ...wing, mat: "leather" });
        }
      }
      // HD: hooked claws on every paw
      for (const [lx, lz, leg] of [
        [-0.15, 0.32, 1],
        [0.15, 0.32, -1],
        [-0.15, -0.32, -1],
        [0.15, -0.32, 1]
      ] as const)
        for (const k of [-1, 0, 1]) along(c.add, "horn", [lx + k * 0.035, 0.03, lz + 0.08], [lx + k * 0.045, 0.0, lz + 0.15], 0.025, 0.025, "#e7e5e4", { leg, hip: 0.42, mat: "bone", hd: true });
      for (let i = 0; i < 5; i++) {
        c.add("sphere", 0, 0.42 + i * 0.11, -0.55 - i * 0.06 + (i > 2 ? (i - 2) * 0.1 : 0), 0.11, 0.11, 0.11, "#15803d", { trail: { lag: 0.06 + i * 0.06, damp: 0.2, root: [0, 0.45, -0.5] }, hd: false }); // serpent tail
      }
      c.add("box", 0, 0.98, -0.65, 0.1, 0.08, 0.13, "#166534", { trail: { lag: 0.38, damp: 0.2, root: [0, 0.45, -0.5] }, hd: false });
      // HD: the serpent tail rearing up behind, ending in a snake's head with burning eyes and fangs that rides its tip
      const end = tail(c.add, [0, 0.45, -0.5], { len: 1.1, w0: 0.13, w1: 0.08, n: 6, pitch: -0.9, curl: -2.2, lag: 0.06, step: 0.06, damp: 0.2, color: "#15803d" }, { mat: "hide", hd: true });
      {
        const o: AddOpts = { mat: "hide", hd: true, trail: end.trail };
        const [tx, ty, tz] = end.tip;
        const [dx, dy, dz] = end.dir;
        const at = (k: number, up = 0): V3 => [tx + dx * k, ty + dy * k + up, tz + dz * k];
        along(c.add, "egg", at(-0.02), at(0.14), 0.13, 0.11, "#166534", o);
        along(c.add, "snout", at(0.08), at(0.22), 0.1, 0.07, "#166534", o);
        for (const side of [-1, 1]) {
          const [ex, ey, ez] = at(0.1, 0.05);
          c.add("sphere", ex + side * 0.04, ey - 0.015, ez, 0.03, 0.03, 0.03, "#ef4444", { ...o, mat: undefined, glow: true });
          const [fx, fy, fz] = at(0.18, -0.03);
          c.add("cone", fx + side * 0.025, fy - 0.05, fz, 0.015, 0.05, 0.015, BONE, { ...o, mat: "bone", rx: Math.PI });
        }
      }
      smokeAt(c.frame, 0, 1.1, 2.1, 0.5, "#a8a29e");
      break;
    }
    case "mob-werewolf": {
      // Glow: yellow eyes and the full moon's slow pulse; metal: broken silver manacles; standing stones, no ground disc
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        b.add("box", Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3, 0.45, range(rng, 1.0, 1.6), 0.3, "#57534e", { ry: -a, mat: "stone", hdShape: "block" });
        b.add("boulder", Math.cos(a) * 2.3 + 0.2, 0, Math.sin(a) * 2.3, 0.3, 0.16, 0.26, "#57534e", { mat: "stone", hd: true, ry: a }); // HD: fallen chips at its foot
      }
      b.add("sphere", 0, 4.2, -1.6, 0.7, 0.7, 0.2, "#e0f2fe", { glow: true, idle: IDLE_KIND.pulse }); // the full moon
      const look: FigureLook = { skin: "#44403c", tunic: "#57534e", legs: "#44403c", boots: "#292524", belt: "#3f2a1a", eyes: "#fde047", glowEyes: true, face: "beast" };
      for (const [x, z, r, s] of [
        [0, 0.2, 0, 1.6],
        [-1.1, -0.6, 0.6, 1.25],
        [1.1, -0.5, -0.6, 1.25]
      ]) {
        const { add, hand } = figure(b, x, z, r, look, s, { radius: 0.4 });
        add("sphere", 0, 0.82, -0.04, 0.6, 0.48, 0.44, "#57534e", { mat: "fur", hdShape: "egg" }); // hunched fur
        add("box", 0, 1.12, 0.2, 0.18, 0.14, 0.26, "#292524", { hd: false }); // snout
        // HD: a wolf's muzzle out of the face, its nose on the tip, a lower jaw with fangs; a ruff of fur over the shoulders
        add("snout", 0, 1.1, 0.27, 0.2, 0.15, 0.34, "#292524", { mat: "fur", hd: true });
        add("egg", 0, 1.19, 0.44, 0.07, 0.05, 0.06, "#0c0a09", { mat: "leather", hd: true });
        add("snout", 0, 1.05, 0.25, 0.16, 0.07, 0.28, "#1c1917", { mat: "fur", hd: true });
        for (const side of [-1, 1]) add("cone", side * 0.05, 1.07, 0.37, 0.025, 0.06, 0.025, BONE, { mat: "bone", hd: true, rx: Math.PI });
        for (let k = 0; k < 6; k++) add("drop", (k - 2.5) * 0.08, 0.86, -0.18, 0.12, 0.3, 0.08, "#57534e", { trail: { lag: 0.1 + (k % 2) * 0.05, damp: 0.4, root: [0, 1.0, -0.12] }, mat: "fur", hd: true, rx: -2.6 });
        // HD: a bushy tail from the hips
        tail(add, [0, 0.55, -0.18], { len: 0.6, w0: 0.13, w1: 0.15, n: 4, pitch: 0.9, curl: -0.6, lag: 0.14, step: 0.07, color: "#57534e", tip: "#292524" }, { mat: "fur", hd: true });
        for (const side of [-1, 1] as const) {
          add("cone", side * 0.1, 1.38, 0, 0.08, 0.2, 0.06, "#292524", { mat: "fur" }); // ears
          add("cone", side * 0.31, 0.38, 0.06, 0.05, 0.14, 0.05, BONE, { ...hand(side), rx: Math.PI, hd: false }); // claws
          // HD: four long hooked claws curling out of the fist
          const [fx, fy, fz] = fist(side);
          for (const k of [-1.5, -0.5, 0.5, 1.5]) along(add, "horn", [fx + k * 0.03, fy - 0.06, fz + 0.07], [fx + k * 0.035, fy - 0.2, fz + 0.15], 0.025, 0.025, BONE, { ...hand(side), mat: "bone", hd: true });
          add("cyl", side * 0.31, 0.62, 0, 0.2, 0.08, 0.2, "#cbd5e1", { ...hand(side), mat: "steel" }); // silver manacles
          // HD: the broken chain still hanging from each manacle, swinging
          for (let k = 0; k < 3; k++) {
            const [w, d] = k % 2 ? [0.05, 0.02] : [0.02, 0.05];
            along(add, "capsule", [side * 0.33, 0.6 - k * 0.07, 0.02], [side * 0.34, 0.53 - k * 0.07, 0.03], w, d, "#cbd5e1", { ...hand(side), mat: "steel", hd: true });
          }
        }
      }
      break;
    }
    case "mob-ogre": {
      // Metal: iron belly-plates and banded clubs; looping effect: the ox turning on its spit over the fire
      const IRON = "#94a3b8";
      b.add("cone", 0, 0, 0.6, 0.6, 0.8, 0.6, "#f97316", { glow: true }); // fire pit
      for (const x of [-0.9, 0.9]) b.add("box", x, 0, 0.6, 0.08, 1.0, 0.08, "#3f2a1a", { mat: "wood" }); // spit posts
      b.add("cyl", 0, 0.95 - 1.0, 0.6, 0.06, 2.0, 0.06, "#78350f", { rz: Math.PI / 2, mat: "wood" }); // spit, across the posts
      b.add("sphere", 0, 0.68, 0.6, 1.0, 0.5, 0.5, "#92400e", { idle: IDLE_KIND.spin, phase: 0.01, hd: false }); // the roasting ox, turning
      // HD: a ring of fire-blackened stones and split logs under the fire; the roast's browned carcass and legs turning
      // together with it (same spin, phase and axis)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.add("boulder", Math.cos(a) * 0.42, 0, 0.6 + Math.sin(a) * 0.42, 0.22, 0.18, 0.2, "#44403c", { mat: "stone", hd: true, ry: a });
      }
      for (const a of [0.3, 1.9]) along(b.add.bind(b), "cyl", [Math.cos(a) * 0.35, 0.06, 0.6 + Math.sin(a) * 0.35], [-Math.cos(a) * 0.35, 0.06, 0.6 - Math.sin(a) * 0.35], 0.1, 0.1, "#292524", { mat: "wood", hd: true });
      const roast: AddOpts = { idle: IDLE_KIND.spin, phase: 0.01, pivot: [0, 0.6], hd: true, mat: "skin" };
      b.add("pod", 0, 0.7, 0.6, 0.95, 0.46, 0.46, "#7c2d12", { ...roast, ry: Math.PI / 2 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) along(b.add.bind(b), "taper", [sx * 0.3, 0.8, 0.6 + sz * 0.12], [sx * 0.45, 1.05, 0.6 + sz * 0.16], 0.09, 0.09, "#92400e", roast);
      const look: FigureLook = { skin: "#a3a35a", tunic: "#78350f", legs: "#57534e", boots: "#3f2a1a", belt: "#44403c", eyes: "#1c1917" };
      for (const [x, z, r, s] of [
        [-1.4, -0.4, 0.6, 2.0],
        [1.5, -0.3, -0.6, 1.7]
      ]) {
        const { add, hand } = figure(b, x, z, r, look, s, { radius: 0.5, pace: 0.7 });
        add("sphere", 0, 0.7, 0.06, 0.62, 0.56, 0.5, look.skin, { mat: "skin", hdShape: "egg" }); // gut
        add("box", 0, 0.78, 0.25, 0.4, 0.3, 0.06, IRON, { mat: "iron" }); // belly-plate
        // HD: rivets on the plate and the leather straps that hold it round the gut
        for (const [rx, ry] of [
          [-0.15, 0.82],
          [0.15, 0.82],
          [-0.15, 1.02],
          [0.15, 1.02]
        ])
          add("sphere", rx, ry, 0.285, 0.05, 0.05, 0.05, "#64748b", { torso: true, mat: "iron", hd: true });
        for (const y of [0.83, 1.0]) add("cyl", 0, y, 0.06, 0.66, 0.04, 0.54, "#3f2a1a", { torso: true, mat: "leather", hd: true });
        for (const side of [-1, 1]) {
          add("cone", side * 0.07, 1.12, 0.17, 0.04, 0.1, 0.04, BONE, { rx: Math.PI, hd: false }); // tusks
          along(add, "horn", [side * 0.07, 1.13, 0.15], [side * 0.11, 1.27, 0.2], 0.05, 0.05, BONE, { mat: "bone", hd: true }); // HD: tusks jutting up from the jaw
        }
        add("cyl", 0.31, 0.15, 0.3, 0.14, 1.0, 0.14, "#5b3b22", { ...hand(1), rx: 0.5, hd: false }); // club…
        add("cyl", 0.31, 0.75, 0.6, 0.2, 0.08, 0.2, IRON, { ...hand(1), rx: 0.5, hd: false }); // …iron band
        club(add, hand(1), "#5b3b22", IRON); // HD: the club gripped in the fist, iron-banded and spiked
      }
      break;
    }
    case "mob-wraith": {
      // Glow: cold eyes and the shrine's spirit lantern, slowly pulsing; metal: their grave-chains; no ground disc
      b.add("box", 0, 0, -1.1, 2.2, 1.2, 0.4, "#57534e", { mat: "stone", hdShape: "block" }); // ruined shrine wall
      b.add("box", -0.8, 1.2, -1.1, 0.5, 0.6, 0.4, "#57534e", { mat: "stone", hdShape: "block" });
      b.add("box", 0.5, 1.2, -1.1, 0.2, 0.3, 0.2, "#44403c", { mat: "stone" });
      b.add("sphere", 0.5, 1.53, -1.1, 0.26, 0.3, 0.26, "#67e8f9", { glow: true, idle: IDLE_KIND.pulse }); // spirit lantern
      // HD: an iron cage round the spirit light, fallen stones at the wall's foot, two leaning grave slabs
      lanternFrame(b.add.bind(b), 0.5, 1.52, -1.1, 0.3, 0.32, "#44403c", {});
      const wr = mulberry32(8803);
      for (let i = 0; i < 5; i++) b.add("block", -1.0 + wr() * 2.2, 0, -0.7 + wr() * 0.3, 0.22 + wr() * 0.15, 0.14 + wr() * 0.1, 0.2, "#57534e", { mat: "stone", hd: true, ry: wr() * 3 });
      for (const [x, z, rz] of [
        [-1.6, 0.9, 0.2],
        [1.7, 0.6, -0.25]
      ])
        b.add("block", x, 0, z, 0.4, 0.6, 0.12, "#44403c", { mat: "stone", hd: true, rz });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const s = i === 0 ? 1.4 : 1;
        const w = b.walker(Math.cos(a) * 1.3, Math.sin(a) * 1.3, -a, "hover", 0.4, { y: 0.6 + (i % 2) * 0.5, pace: 0.8 });
        const add = scaler(w, s);
        add("cone", 0, 0, 0, 0.7, 1.6, 0.7, "#cbd5e1", { idle: IDLE_KIND.sway, mat: "cloth" }); // drifting shroud
        add("cone", 0, 1.1, 0, 0.5, 0.65, 0.5, "#475569", { mat: "cloth", hdShape: "drop" }); // hood
        add("box", 0, 1.3, 0.2, 0.24, 0.06, 0.06, "#22d3ee", { glow: true });
        // HD: an empty dark face under the hood; tattered strips trailing from the hem; long sleeves reaching out to
        // bony hands
        add("egg", 0, 1.16, 0.12, 0.3, 0.32, 0.12, "#020617", { mat: "cloth", hd: true });
        for (let k = 0; k < 6; k++) {
          const t = (k / 6) * Math.PI * 2;
          add("box", Math.cos(t) * 0.28, -0.32, Math.sin(t) * 0.28, 0.1, 0.4, 0.02, "#cbd5e1", { trail: { lag: 0.15 + (k % 3) * 0.08, damp: 0.2, root: [Math.cos(t) * 0.25, 0.08, Math.sin(t) * 0.25] }, mat: "cloth", hd: true, ry: -t + Math.PI / 2 });
        }
        for (const side of [-1, 1]) {
          const sleeve: AddOpts = { trail: { lag: 0.2, damp: 0.35, root: [side * 0.2, 0.95, 0.05] }, hd: true };
          along(add, "taper", [side * 0.2, 0.95, 0.05], [side * 0.3, 0.55, 0.35], 0.16, 0.16, "#cbd5e1", { ...sleeve, mat: "cloth" });
          for (const k of [-1, 0, 1]) along(add, "capsule", [side * 0.3 + k * 0.025, 0.55, 0.37], [side * 0.3 + k * 0.035, 0.42, 0.45], 0.022, 0.022, BONE, { ...sleeve, mat: "bone" });
        }
        add("cyl", 0.35, 0.3, 0.15, 0.05, 0.9, 0.05, "#94a3b8", { rz: 0.2, hd: false }); // grave-chain
        // HD: a grave-chain of iron links hanging from its wrist, swinging behind it, a broken shackle on its end
        for (let k = 0; k < 7; k++) {
          const [lw, ld] = k % 2 ? [0.06, 0.025] : [0.025, 0.06];
          along(add, "capsule", [0.33, 0.48 - k * 0.08, 0.36 - k * 0.02], [0.34, 0.4 - k * 0.08, 0.34 - k * 0.02], lw, ld, "#94a3b8", { trail: { lag: 0.1 + k * 0.04, damp: 0.2, root: [0.3, 0.55, 0.37] }, mat: "iron", hd: true });
        }
      }
      break;
    }
    case "bandit-corsair": {
      // Brass fittings and a glowing stern lantern; looping effect: the black flag streaming; the skiff rides the swell
      const BRASS = "#d97706";
      // Its keel sits a little under the waterline
      const boat = b.walker(0, 0, 0.6, "hover", 0.2, { y: -0.12, pace: 0.5 });
      boat.add("box", 0, 0, 0, 1.2, 0.5, 3.0, "#5b3b22", { mat: "wood" });
      boat.add("prism", 0, 0, 1.75, 1.2, 0.5, 0.5, "#5b3b22", { ry: Math.PI / 2, mat: "wood" });
      boat.add("box", 0, 0.5, 0, 1.3, 0.08, 3.1, BRASS, { mat: "gold" }); // brass gunwale
      // HD: the hull's planking strakes, a brass-capped stem post at the bow and rigging from the masthead
      for (const side of [-1, 1]) for (const y of [0.1, 0.28]) boat.add("box", side * 0.63, y, 0, 0.04, 0.06, 2.9, "#3f2a1a", { mat: "wood", hd: true });
      along(boat.add.bind(boat), "taper", [0, 0.0, 1.95], [0, 0.85, 2.15], 0.12, 0.12, "#5b3b22", { mat: "wood", hd: true });
      boat.add("sphere", 0, 0.82, 2.13, 0.12, 0.12, 0.12, BRASS, { mat: "gold", hd: true });
      for (const [ex, ez] of [
        [0, 1.95],
        [0, -1.45],
        [-0.6, 0],
        [0.6, 0]
      ])
        along(boat.add.bind(boat), "cyl", [0, 3.15, 0], [ex, 0.58, ez], 0.015, 0.015, "#57534e", { mat: "cloth", hd: true });
      boat.add("cyl", 0, 0.4, 0, 0.08, 2.8, 0.08, "#3f2a1a", { mat: "wood" });
      boat.add("box", 0, 1.3, 0.05, 1.4, 1.2, 0.04, "#111827", { mat: "cloth" });
      boat.add("box", 0, 1.6, 0.1, 0.32, 0.32, 0.04, "#f8fafc", { mat: "cloth" }); // skull patch
      along(boat.add.bind(boat), "cyl", [-0.75, 2.52, 0.05], [0.75, 2.52, 0.05], 0.05, 0.05, "#3f2a1a", { mat: "wood", hd: true }); // HD: the yard
      boat.add("box", 0.3, 3.0, 0, 0.6, 0.35, 0.03, "#0c0a09", { idle: IDLE_KIND.flutter, mat: "cloth" }); // black flag
      boat.add("cyl", 0.4, 0.62 - 0.3, 1.1, 0.16, 0.6, 0.16, BRASS, { rx: Math.PI / 2 - 0.2, mat: "gold" }); // swivel gun
      boat.add("box", 0, 0.6, -1.5, 0.2, 0.25, 0.2, "#44403c", { hd: false }); // stern lantern
      boat.add("sphere", 0, 0.64, -1.5, 0.13, 0.16, 0.13, "#fcd34d", { glow: true, idle: IDLE_KIND.pulse });
      lanternFrame(boat.add.bind(boat), 0, 0.62, -1.5, 0.18, 0.22, BRASS, { mat: "gold" }); // HD: a brass lantern frame, its flame showing
      const look: FigureLook = { skin: "#d6a77a", tunic: "#7f1d1d", legs: "#1f2937", boots: "#1c1917", belt: BRASS, eyes: "#1c1917" };
      for (const [z, s, cap] of [
        [-0.8, 0.95, 1],
        [0.7, 0.8, 0]
      ]) {
        const { add, hand, neck } = figure(boat.child(0.25, z, 0, 0.5), 0, 0, 0, look, s, undefined, true);
        add("sphere", 0.165, 1.16, 0.0, 0.035, 0.05, 0.035, BRASS, { ...neck, mat: "gold", hd: true }); // HD: a brass earring
        if (cap) {
          add("cone", 0, 1.38, 0, 0.62, 0.3, 0.34, "#111827", { rz: Math.PI / 2, mat: "cloth" }); // captain's bicorne
          add("box", 0.31, 0.5, 0.25, 0.04, 0.06, 0.6, "#cbd5e1", { ...hand(1), hd: false }); // cutlass
          sword(add, hand(1), "#cbd5e1", "#3f2a1a", BRASS, "steel", 0.5); // HD: the cutlass gripped in the fist, a brass guard
        } else {
          add("box", 0, 1.26, 0, 0.38, 0.1, 0.38, "#111827", { hd: false }); // bandana
          add("egg", 0, 1.3, -0.02, 0.37, 0.2, 0.37, "#111827", { ...neck, mat: "cloth", hd: true });
          for (const side of [-1, 1]) add("box", side * 0.05, 1.16, -0.22, 0.07, 0.16, 0.04, "#111827", { trail: { lag: 0.18 + side * 0.04, damp: 0.3, root: [0, 1.3, -0.2] }, mat: "cloth", hd: true, rz: side * 0.25 });
        }
      }
      // The plunder rides in the boat, lashed amidships: a crate with a chest on it
      boat.add("box", -0.3, 0.58, 0.2, 0.46, 0.34, 0.46, "#a16207", { mat: "wood" });
      boat.add("box", -0.3, 0.92, 0.2, 0.36, 0.28, 0.36, "#78350f", { mat: "wood" });
      // HD: brass corner caps on the plunder chest and a brass lock
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) boat.add("box", -0.3 + sx * 0.18, 0.92, 0.2 + sz * 0.18, 0.06, 0.33, 0.06, BRASS, { mat: "gold", hd: true });
      boat.add("box", -0.3, 1.04, 0.41, 0.09, 0.1, 0.06, BRASS, { mat: "gold", hd: true });
      break;
    }
    case "bandit-syndicate": {
      // Steel blades and glowing red eye-slits; looping effect: a smoke bomb fuming at their feet; the master is caped
      const look: FigureLook = { skin: "#0f172a", tunic: "#0f172a", legs: "#020617", boots: "#020617", belt: "#dc2626", eyes: "#ef4444", glowEyes: true, nose: false };
      for (const [x, z, r, s, master] of [
        [0, -0.1, 0, 1.2, 1],
        [-0.9, 0.4, 0.5, 1.0, 0],
        [0.9, 0.5, -0.5, 1.0, 0]
      ]) {
        const { add, hand, neck } = figure(b, x, z, r, look, s, BANDIT_WALK);
        add("cone", 0, 1.22, -0.03, 0.42, 0.42, 0.42, "#020617", { hd: false }); // cowl
        // HD: a close black cowl and a mask over the lower face, steel bracers on both forearms
        hood(add, neck, "#020617", false);
        add("egg", 0, 1.11, 0.02, 0.35, 0.17, 0.34, "#020617", { ...neck, mat: "cloth", hd: true });
        for (const side of [-1, 1] as const) {
          add("box", side * 0.31, 0.48, 0.25, 0.04, 0.05, 0.5, "#cbd5e1", { ...hand(side), hd: false }); // twin blades
          sword(add, hand(side), "#cbd5e1", "#020617", "#475569", "steel", 0.36, side); // HD: a long dagger gripped in each fist
          add("cyl", side * 0.31, 0.62, 0.0, 0.17, 0.14, 0.18, "#94a3b8", { ...hand(side), mat: "steel", hd: true });
        }
        if (master) {
          add("box", 0, 0.35, -0.2, 0.5, 0.9, 0.05, "#7f1d1d", { idle: IDLE_KIND.flutter, mat: "cloth" }); // cape
          add("sphere", 0, 1.0, -0.2, 0.08, 0.08, 0.05, "#94a3b8", { torso: true, mat: "steel", hd: true }); // HD: the cape's clasp
        }
      }
      for (let i = 0; i < 4; i++) {
        const s = range(rng, 0.7, 1.2);
        b.add("sphere", range(rng, -1.6, 1.6), 0, range(rng, -1.6, -0.8), s, s * 0.7, s, "#64748b", { mat: "stone", hdShape: "boulder" });
      }
      smokeAt(b, 1.2, 0, 1.2, 0.9, "#6b7280"); // smoke bomb
      // HD: the bomb itself, split open where the smoke pours out, and its burnt fuse
      for (const side of [-1, 1]) b.add("sphere", 1.2 + side * 0.06, 0, 1.2, 0.16, 0.16, 0.2, "#1c1917", { mat: "iron", hd: true, rz: side * 0.5 });
      along(b.add.bind(b), "cyl", [1.2, 0.08, 1.3], [1.3, 0.04, 1.45], 0.015, 0.015, "#3f2a1a", { mat: "cloth", hd: true });
      break;
    }

    /* ---------------------------- EPIC (cont.) ---------------------------- */
    case "mob-drake": {
      // Bigger, with glowing belly scales, eyes and fire breath; embers orbit its nest of smouldering eggs
      b.add("sphere", 0, -0.6, 0, 3.6, 1.6, 3.0, "#44403c", { mat: "stone", hdShape: "boulder" }); // scorched crag
      for (const [x, z] of [
        [-1.0, 0.9],
        [-0.6, 1.25],
        [-1.3, 0.5]
      ]) {
        b.add("sphere", x, 0.75, z, 0.38, 0.5, 0.38, "#f97316", { glow: true, idle: IDLE_KIND.pulse, hd: false }); // smouldering eggs
        b.add("egg", x, 0.75, z, 0.4, 0.52, 0.4, "#f97316", { mat: "lava", hd: true, idle: IDLE_KIND.pulse }); // HD: scaled eggs, fire glowing through their cracks
      }
      // HD: the nest's ring of charred bones and fallen rocks round the eggs
      const nr = mulberry32(9917);
      for (let i = 0; i < 4; i++) {
        const a = nr() * Math.PI * 2;
        const [x, z] = [-0.95 + Math.cos(a) * 0.65, 0.88 + Math.sin(a) * 0.55];
        bone(b.add.bind(b), [x - 0.15, 0.82, z], [x + 0.15, 0.84, z + 0.08], 0.05, "#57534e", { mat: "bone", hd: true });
      }
      for (let i = 0; i < 5; i++) b.add("boulder", -0.95 + (nr() - 0.5) * 1.6, 0.6 + nr() * 0.2, 0.9 + (nr() - 0.5) * 1.2, 0.22, 0.16, 0.2, "#292524", { mat: "lava", hd: true, ry: nr() * 3 });
      orbit(b, -1.0, 0.9, 0.8, 1.4, 4, "#fb923c", 0.14);
      const d = b.walker(0.3, -0.2, 0.5, "fly", 1.0, { y: 1.5, pace: 0.8 });
      const add = scaler(d, 1.15);
      add("sphere", 0, 0, 0, 1.1, 0.9, 1.7, "#b91c1c", { mat: "hide", hdShape: "pod" });
      add("sphere", 0, -0.02, 0.1, 0.8, 0.6, 1.2, "#fbbf24", { glow: true }); // glowing belly scales
      // HD: armoured scutes down its back, and legs tucked under in flight, talons curled
      for (let i = 0; i < 5; i++) add("egg", 0, 0.84, 0.55 - i * 0.3, 0.5 - i * 0.04, 0.12, 0.3, "#7f1d1d", { mat: "hide", hd: true });
      for (const side of [-1, 1]) {
        for (const [hz, fz, len] of [
          [-0.35, -0.2, 0.42],
          [0.5, 0.68, 0.3]
        ]) {
          along(add, "taper", [side * 0.32, 0.18, hz], [side * 0.38, 0.18 - len, fz], 0.18, 0.18, "#991b1b", { mat: "hide", hd: true });
          for (const k of [-1, 0, 1]) along(add, "horn", [side * 0.38 + k * 0.04, 0.16 - len, fz], [side * 0.38 + k * 0.05, 0.08 - len, fz + 0.12], 0.04, 0.04, "#1c1917", { mat: "bone", hd: true });
        }
      }
      add("cyl", 0, 0.6, 0.75, 0.32, 1.0, 0.32, "#b91c1c", { rx: 0.5, mat: "hide", hdShape: "taper" });
      const head: AddOpts = { head: { y: 1.35, z: 1.0 } };
      add("box", 0, 1.45, 1.15, 0.45, 0.38, 0.7, "#991b1b", { ...head, hd: false });
      // HD: a dragon's head: a crested skull, a long snout with smouldering nostrils, a toothed lower jaw hanging a
      // little open, heavy brows over burning eyes, and swept-back horns
      {
        const o: AddOpts = { ...head, hd: true, mat: "hide" };
        add("egg", 0, 1.44, 0.97, 0.44, 0.4, 0.46, "#991b1b", o);
        add("snout", 0, 1.47, 1.32, 0.34, 0.24, 0.52, "#991b1b", o);
        add("snout", 0, 1.38, 1.27, 0.28, 0.11, 0.46, "#7f1d1d", { ...o, rx: 0.12 });
        for (const side of [-1, 1]) {
          for (let k = 0; k < 4; k++) add("cone", side * (0.1 - k * 0.012), 1.43, 1.2 + k * 0.08, 0.03, 0.06, 0.03, BONE, { ...o, mat: "bone", rx: Math.PI });
          add("sphere", side * 0.06, 1.56, 1.55, 0.04, 0.04, 0.04, "#f97316", { ...head, glow: true, hd: true }); // nostrils, glowing
          add("egg", side * 0.15, 1.6, 1.12, 0.07, 0.06, 0.08, "#fde047", { ...head, glow: true, hd: true }); // eyes
          along(add, "capsule", [side * 0.2, 1.7, 1.02], [side * 0.12, 1.69, 1.22], 0.07, 0.06, "#7f1d1d", o); // brow
          along(add, "horn", [side * 0.14, 1.72, 0.92], [side * 0.26, 1.95, 0.55], 0.11, 0.11, BONE, { ...o, mat: "bone" });
          along(add, "horn", [side * 0.2, 1.58, 0.86], [side * 0.34, 1.65, 0.6], 0.06, 0.06, BONE, { ...o, mat: "bone" });
        }
      }
      for (const side of [-1, 1]) {
        add("cone", side * 0.15, 1.75, 0.95, 0.08, 0.35, 0.08, BONE, { ...head, rx: -0.6, hd: false }); // horns
        add("box", side * 0.12, 1.62, 1.45, 0.08, 0.06, 0.05, "#fde047", { ...head, glow: true, hd: false }); // eyes
        add("box", side * 1.2, 0.8, -0.1, 1.9, 0.05, 1.2, "#7f1d1d", { rz: side * -0.55, flap: 5, hd: false }); // great wings
        // HD: great wings of skin between finger bones that smoulder with fire in their cracks, every piece hinged
        // at the Normal wing's shoulder (x 0.391, y 1.322)
        const wing: AddOpts = { flap: 5, hd: true };
        for (const [wz, w, dd] of [
          [0.4, 1.95, 0.38],
          [0.1, 1.8, 0.42],
          [-0.22, 1.55, 0.42],
          [-0.5, 1.15, 0.38],
          [-0.12, 0.65, 1.0]
        ]) {
          add("egg", side * (0.391 + w / 2), 1.322 - 0.01, wz, w, 0.02, dd, "#7f1d1d", { ...wing, mat: "hide" });
          if (w > 1) add("box", side * (0.391 + (w * 0.94) / 2), 1.322 - 0.025, wz + 0.02, w * 0.94, 0.05, 0.05, "#450a0a", { ...wing, mat: "lava" });
        }
      }
      add("cone", 0, 0.54 - 0.75, -1.35, 0.32, 1.5, 0.32, "#b91c1c", { rx: -1.45, trail: { lag: 0.3, damp: 0.3, root: [0, 0.45, -0.75] }, hd: false }); // tail, out of the rump
      const tl = tail(add, [0, 0.45, -0.75], { len: 1.6, w0: 0.32, w1: 0.08, n: 5, pitch: 0.1, curl: 0.5, lag: 0.16, step: 0.07, color: "#b91c1c" }, { mat: "hide", hd: true }); // HD: a long tail that snakes behind it
      // HD: a barbed spade on its tail's tip
      {
        const [tx, ty, tz] = tl.tip;
        const [dx, dy, dz] = tl.dir;
        along(add, "blade", [tx - dx * 0.05, ty - dy * 0.05, tz - dz * 0.05], [tx + dx * 0.32, ty + dy * 0.32, tz + dz * 0.32], 0.04, 0.26, "#7f1d1d", { mat: "hide", hd: true, trail: tl.trail });
      }
      for (let i = 0; i < 4; i++) add("cone", 0, 0.75, 0.5 - i * 0.4, 0.12, 0.25, 0.12, "#fbbf24", { mat: "bone", hdShape: "horn" }); // back spines
      add("sphere", 0, 1.38, 1.65, 0.3, 0.22, 0.34, "#f97316", { ...head, glow: true, hd: false }); // fire breath, at its jaws
      // HD: a tongue of flame licking out of its jaws, a white-hot core inside (riding the head)
      along(add, "cone", [0, 1.44, 1.48], [0, 1.4, 1.95], 0.26, 0.22, "#f97316", { ...head, glow: true, hd: true });
      along(add, "cone", [0, 1.44, 1.5], [0, 1.42, 1.78], 0.12, 0.1, "#fde047", { ...head, glow: true, hd: true });
      break;
    }
    case "mob-aberration": {
      // Bigger: a void-born eye-mass hovering over a rift among jutting void crystals, eyes blinking, a turning crown-shard, void shards orbiting
      const ar = mulberry32(4129);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        b.add("octa", Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5, 0.45, range(rng, 0.9, 1.5), 0.45, "#a855f7", { glow: true, rz: range(rng, -0.3, 0.3) }); // void crystals jutting from the rift
        // HD: smaller shards clustered round each crystal's foot
        for (let k = 0; k < 3; k++) {
          const t = ar() * Math.PI * 2;
          b.add("octa", Math.cos(a) * 2.5 + Math.cos(t) * 0.35, 0, Math.sin(a) * 2.5 + Math.sin(t) * 0.35, 0.2, 0.35 + ar() * 0.3, 0.2, "#7e22ce", { glow: true, hd: true, rz: (ar() - 0.5) * 0.9, rx: (ar() - 0.5) * 0.6 });
        }
      }
      for (let i = 0; i < 5; i++) stackedArc(b, (i / 5) * Math.PI * 2, 2.0, i % 2 ? "#4c1d95" : "#312e81", { mat: "gel" });
      const body = b.walker(0, 0, 0, "hover", 0.7, { y: 2.0, pace: 1.1 }); // drifting and swelling over the rift
      const add = scaler(body, 1.2);
      add("sphere", 0, 0, 0, 1.6, 1.4, 1.6, "#2e1065", { mat: "gel" });
      // HD: glowing veins over its wet void flesh, and tentacles hanging from its underside, trailing as it drifts
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        arc(add, [0, 0.7, 0], [Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [0.82, 0.72], -1.1, 0.9, 4, 0.03, "#c026d3", { glow: true, hd: true });
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        tail(add, [Math.cos(a) * 0.45, 0.15, Math.sin(a) * 0.45], { len: 1.3, w0: 0.16, w1: 0.05, n: 5, pitch: 1.25, curl: -0.6, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), lag: 0.12, step: 0.08, damp: 0.15, color: "#4c1d95", tip: "#c084fc" }, { mat: "gel", hd: true });
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const ey = range(rng, 0.25, 1.0);
        add("sphere", Math.cos(a) * 0.72, ey, Math.sin(a) * 0.72, 0.2, 0.2, 0.2, "#e879f9", { glow: true, idle: IDLE_KIND.pulse, phase: 0.01 + i * 1.7 }); // eyes blinking open
        // HD: a dark socket round each eye, with a heavy lid over it
        add("sphere", Math.cos(a) * 0.7, ey - 0.03, Math.sin(a) * 0.7, 0.26, 0.26, 0.26, "#1e1b4b", { mat: "gel", hd: true });
        add("egg", Math.cos(a) * 0.76, ey + 0.13, Math.sin(a) * 0.76, 0.24, 0.08, 0.16, "#3b0764", { mat: "gel", hd: true, ry: -a + Math.PI / 2 });
      }
      add("sphere", 0, 0.6, 0.72, 0.42, 0.42, 0.2, "#f0abfc", { glow: true, idle: IDLE_KIND.pulse }); // the great eye
      // HD: the great eye's dark slit pupil and the thick lids round it
      add("box", 0, 0.68, 0.84, 0.06, 0.26, 0.04, "#0c0a09", { mat: "gem", hd: true });
      for (const a0 of [0.25, Math.PI + 0.25]) arc(add, [0, 0.81, 0.8], [1, 0, 0], [0, 1, 0], [0.26, 0.24], a0, a0 + Math.PI - 0.5, 4, 0.08, "#3b0764", { mat: "gel", hd: true });
      add("octa", 0, 1.5, 0, 0.4, 0.6, 0.4, "#c084fc", { glow: true, idle: IDLE_KIND.spin });
      orbit(body, 0, 0, 1.6, 0.4, 5, "#c084fc", 0.2);
      break;
    }
    case "mob-basilisk": {
      // Bigger: a long serpent with a glowing crest and eyes; petrifying motes orbit its head; stone statues of its prey
      for (const [x, z, r] of [
        [-1.8, 1.0, 0.3],
        [1.9, 0.7, -0.5]
      ]) {
        const st = figure(b, x, z, r, { skin: "#a8a29e", tunic: "#a8a29e", legs: "#a8a29e", boots: "#a8a29e", belt: "#a8a29e", eyes: "#78716c", sclera: "#a8a29e", allMat: "stone" }, 1.0); // petrified adventurers
        st.add("box", 0.31, 0.6, 0.3, 0.05, 0.05, 0.6, "#a8a29e", { rx: -0.8, hd: false });
        sword(st.add, st.hand(1), "#a8a29e", "#a8a29e", "#a8a29e", "stone", 0.55); // HD: a stone sword still gripped in the fist
      }
      const bs = b.walker(0, -0.2, 0.5, "slither", 0.7, { pace: 0.8 });
      const add = scaler(bs, 1.25);
      for (let i = 0; i < 6; i++) add("sphere", 0, 0, -1.6 + i * 0.5, 0.75 - i * 0.03, 0.6, 0.7, i % 2 ? "#3f6212" : "#4d7c0f", { mat: "hide", hdShape: "egg" }); // long body
      // HD: a pale scaled belly and armoured scutes along its back
      for (let i = 0; i < 6; i++) {
        add("egg", 0, -0.02, -1.6 + i * 0.5, 0.6 - i * 0.03, 0.14, 0.6, "#a3a35a", { mat: "hide", hd: true });
        add("egg", 0, 0.5, -1.6 + i * 0.5, 0.42 - i * 0.02, 0.12, 0.42, "#365314", { mat: "hide", hd: true });
      }
      for (let i = 0; i < 5; i++) add("cone", 0, 0.5, -1.4 + i * 0.5, 0.14, 0.26, 0.14, "#a3e635", { glow: true }); // glowing dorsal ridge
      const head: AddOpts = { head: { y: 0.45, z: 1.1 } };
      add("box", 0, 0.25, 1.4, 0.6, 0.45, 0.7, "#365314", { ...head, hd: false }); // head
      for (const side of [-1, 1]) add("box", side * 0.15, 0.55, 1.68, 0.12, 0.08, 0.06, "#fde047", { glow: true, idle: IDLE_KIND.pulse, hd: false }); // petrifying gaze
      // HD: a serpent's head: a broad skull, a blunt snout, a lower jaw with long fangs, a forked tongue, and burning
      // eyes under scaled brows that turn with the head
      {
        const o: AddOpts = { ...head, hd: true, mat: "hide" };
        add("egg", 0, 0.24, 1.25, 0.6, 0.42, 0.55, "#365314", o);
        add("snout", 0, 0.28, 1.6, 0.5, 0.3, 0.4, "#365314", o);
        add("snout", 0, 0.2, 1.55, 0.44, 0.1, 0.42, "#a3a35a", { ...o, rx: 0.15 });
        for (const side of [-1, 1]) {
          along(add, "horn", [side * 0.14, 0.32, 1.66], [side * 0.13, 0.17, 1.74], 0.05, 0.05, BONE, { ...o, mat: "bone" }); // fangs
          add("egg", side * 0.17, 0.52, 1.5, 0.12, 0.08, 0.1, "#fde047", { ...head, glow: true, hd: true });
          along(add, "capsule", [side * 0.26, 0.6, 1.36], [side * 0.15, 0.6, 1.58], 0.08, 0.07, "#3f6212", o);
          along(add, "capsule", [side * 0.01, 0.27, 1.78], [side * 0.06, 0.25, 1.96], 0.02, 0.015, "#be123c", { ...o, mat: "skin" }); // tongue
        }
      }
      add("cone", 0, 0.65, 1.2, 0.5, 0.6, 0.1, "#dc2626", { glow: true, head: { y: 0.45, z: 1.1 } }); // crest
      for (let i = 0; i < 4; i++) {
        for (const side of [-1, 1]) {
          const lz = -1.2 + i * 0.7;
          const leg: AddOpts = { leg: (i % 2 ? side : -side) as 1 | -1, hip: 0.1, pivot: [side * 0.3, lz] };
          add("box", side * 0.45, 0, lz, 0.45, 0.1, 0.12, "#365314", { ...leg, rz: side * -0.6, hd: false }); // eight legs
          // HD: short splayed lizard legs bent at the knee, three clawed toes each
          const knee: V3 = [side * 0.5, 0.2, lz + 0.05];
          along(add, "capsule", [side * 0.28, 0.2, lz], knee, 0.12, 0.12, "#365314", { ...leg, mat: "hide", hd: true });
          along(add, "taper", [side * 0.62, 0.0, lz + 0.12], knee, 0.1, 0.1, "#365314", { ...leg, mat: "hide", hd: true });
          for (const k of [-1, 0, 1]) along(add, "horn", [side * 0.62, 0.02, lz + 0.12 + k * 0.04], [side * 0.68, 0.0, lz + 0.2 + k * 0.07], 0.03, 0.03, "#1c1917", { ...leg, mat: "bone", hd: true });
        }
      }
      orbit(bs, 0, 1.6, 0.7, 0.9, 4, "#bef264", 0.12);
      break;
    }
    case "mob-lich": {
      // Bigger: robes traced with glowing runes, a gold crown, a throbbing staff orb, soul-wisps orbiting; rune pylons
      // round it (no ground circle); raised skeletons shamble about
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add("octa", Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8, 0.25, 0.7, 0.25, "#4ade80", { glow: true, idle: IDLE_KIND.pulse, phase: 0.01 + i }); // rune pylons
        b.add("block", Math.cos(a) * 1.8, -0.05, Math.sin(a) * 1.8, 0.4, 0.12, 0.4, "#292524", { mat: "stone", hd: true, ry: -a }); // HD: a carved stone footing under each
      }
      const l = b.walker(0, 0, 0, "hover", 0.45, { y: 0.9, pace: 0.6 });
      const add = scaler(l, 1.1);
      add("cone", 0, 0, 0, 1.0, 1.8, 1.0, "#1e1b4b", { idle: IDLE_KIND.sway, mat: "cloth" }); // robes stirring
      add("box", 0, 0.5, 0.33, 0.12, 0.6, 0.06, "#4ade80", { glow: true }); // runes down the robe
      add("cone", 0, 1.15, 0, 0.72, 0.5, 0.72, "#312e81", { mat: "cloth" }); // mantle
      // HD: tattered strips trailing from the hem; a high collar rimmed in gold behind the skull; skulls on its shoulders;
      // sleeves reaching out to bony hands, the right one gripping the staff, the left holding a soul-flame
      for (let k = 0; k < 7; k++) {
        const t = (k / 7) * Math.PI * 2;
        add("box", Math.cos(t) * 0.42, -0.3, Math.sin(t) * 0.42, 0.14, 0.42, 0.02, "#1e1b4b", { trail: { lag: 0.18 + (k % 3) * 0.07, damp: 0.25, root: [Math.cos(t) * 0.4, 0.1, Math.sin(t) * 0.4] }, mat: "cloth", hd: true, ry: -t + Math.PI / 2 });
      }
      add("taper", 0, 1.45, -0.12, 0.62, 0.55, 0.22, "#312e81", { mat: "cloth", hd: true, rx: -0.2 });
      add("cyl", 0, 1.98, -0.17, 0.4, 0.04, 0.16, "#fbbf24", { mat: "gold", hd: true, rx: -0.2 });
      for (const side of [-1, 1]) skull(add, side * 0.36, 1.48, 0, 0.24, BONE, side * 0.5, { mat: "bone", hd: true });
      for (const side of [-1, 1]) {
        const sleeve: AddOpts = { trail: { lag: 0.22, damp: 0.4, root: [side * 0.3, 1.35, 0] }, hd: true };
        const hand: V3 = side > 0 ? [0.6, 1.05, 0.2] : [-0.45, 1.0, 0.35];
        along(add, "taper", [side * 0.3, 1.35, 0], [hand[0] * 0.9, hand[1] + 0.05, hand[2] - 0.05], 0.22, 0.22, "#312e81", { ...sleeve, mat: "cloth" });
        for (const k of [-1, 0, 1]) along(add, "capsule", [hand[0] + k * 0.025, hand[1] + 0.02, hand[2]], [hand[0] + k * 0.03, hand[1] - 0.1, hand[2] + 0.05], 0.025, 0.025, BONE, { ...sleeve, mat: "bone" });
        if (side < 0) add("drop", hand[0], hand[1] - 0.02, hand[2] + 0.1, 0.12, 0.2, 0.12, "#4ade80", { glow: true, idle: IDLE_KIND.pulse, hd: true });
      }
      add("sphere", 0, 1.65, 0, 0.42, 0.45, 0.42, BONE, { hd: false }); // skull
      skull(add, 0, 1.73, 0, 0.42, BONE, 0, { mat: "bone", hd: true }); // HD: its real skull
      for (const side of [-1, 1]) {
        add("box", side * 0.1, 1.82, 0.19, 0.08, 0.08, 0.06, "#4ade80", { glow: true, hd: false });
        add("sphere", side * 0.067, 1.83, 0.235, 0.05, 0.05, 0.04, "#4ade80", { glow: true, hd: true }); // HD: green fire in the sockets
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add("cone", Math.cos(a) * 0.18, 2.0, Math.sin(a) * 0.18, 0.08, 0.25, 0.08, "#fbbf24", { mat: "gold" }); // crown
      }
      add("cyl", 0, 1.96, 0, 0.44, 0.07, 0.44, "#fbbf24", { mat: "gold", hd: true }); // HD: the crown's band, a green gem in front
      add("octa", 0, 1.97, 0.22, 0.07, 0.1, 0.05, "#4ade80", { glow: true, hd: true });
      add("cyl", 0.6, 0.3, 0.2, 0.05, 2.0, 0.05, "#3f3f46", { hd: false }); // staff
      // HD: a dark staff banded in gold, its head a claw of gold prongs round the orb
      along(add, "cyl", [0.6, 0.3, 0.2], [0.6, 2.2, 0.2], 0.06, 0.06, "#27272a", { mat: "wood", hd: true });
      for (const y of [0.8, 1.6, 2.1]) add("cyl", 0.6, y, 0.2, 0.09, 0.05, 0.09, "#fbbf24", { mat: "gold", hd: true });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        along(add, "horn", [0.6 + Math.cos(a) * 0.04, 2.15, 0.2 + Math.sin(a) * 0.04], [0.6 + Math.cos(a) * 0.2, 2.45, 0.2 + Math.sin(a) * 0.2], 0.05, 0.05, "#fbbf24", { mat: "gold", hd: true });
      }
      add("sphere", 0.6, 2.25, 0.2, 0.3, 0.3, 0.3, "#4ade80", { glow: true, idle: IDLE_KIND.pulse }); // its orb throbbing
      orbit(l, 0, 0, 1.1, 1.4, 4, "#bbf7d0", 0.14); // soul-wisps
      for (const [x, z] of [
        [-1.3, 1.0],
        [1.2, 1.1]
      ]) {
        const sk = figure(b, x, z, Math.atan2(-x, -z), { skin: BONE, tunic: "#d6cfb8", legs: BONE, boots: "#a8a29e", belt: "#57534e", eyes: "#4ade80", glowEyes: true, face: "skull" }, 0.85, { radius: 0.3, pace: 0.6 }); // raised servants
        sk.add("box", 0, 0.85, 0.14, 0.38, 0.05, 0.06, "#57534e", { hd: false });
        // HD: their rib cages and a rusted blade dragged in the fist
        for (const y of [0.78, 0.88, 0.98]) arc(sk.add, [0, y, 0], [1, 0, 0], [0, 0, 1], [0.24, 0.165], 0.35, Math.PI - 0.35, 4, 0.035, BONE, { torso: true, hd: true, mat: "bone" });
        sword(sk.add, sk.hand(1), "#78716c", "#3f2a1a", "#57534e", "dull", 0.5);
      }
      break;
    }
    case "bandit-mercenary": {
      // Bigger: a commander in full plate with a glowing visor, rune-lit tower shields, ravens wheeling over the standard
      const STEEL = "#94a3b8";
      const RUNE = "#f59e0b";
      const look: FigureLook = { skin: "#d6a77a", tunic: STEEL, legs: "#475569", boots: "#334155", belt: "#7f1d1d", sleeves: STEEL, eyes: RUNE, glowEyes: true };
      for (const [x, z, r, s, lead] of [
        [0, 0.2, 0, 1.4, 1],
        [-1.1, 0.5, 0.2, 1.1, 0],
        [1.1, 0.5, -0.2, 1.1, 0]
      ]) {
        const { add, hand, neck } = figure(b, x, z, r, look, s, { radius: 0.35, pace: 0.6 });
        add("cyl", 0, 1.08, 0, 0.42, 0.42, 0.42, STEEL, { mat: "steel" }); // great helm
        add("box", 0, 1.26, 0.2, 0.26, 0.05, 0.06, RUNE, { glow: true }); // visor slit
        // HD: full plate: the helm's riveted brow band and breathing holes, a gorget, a breastplate over the chest,
        // faulds over the hips, greaves on the shins; a long cape trailing from the shoulders
        add("cyl", 0, 1.33, 0, 0.45, 0.05, 0.45, "#64748b", { ...neck, mat: "steel", hd: true });
        for (const k of [-1, 0, 1]) add("box", k * 0.05, 1.14, 0.215, 0.025, 0.06, 0.03, "#0f172a", { ...neck, mat: "steel", hd: true });
        add("cyl", 0, 0.96, 0, 0.36, 0.1, 0.32, STEEL, { torso: true, mat: "steel", hd: true });
        add("egg", 0, 0.64, 0.04, 0.5, 0.36, 0.34, STEEL, { torso: true, mat: "steel", hd: true });
        for (let k = 0; k < 3; k++) add("egg", 0, 0.46 - k * 0.07, 0.03, 0.56 - k * 0.03, 0.1, 0.4, "#64748b", { mat: "steel", hd: true });
        for (const side of [-1, 1]) add("egg", side * 0.1, 0.12, 0.03, 0.19, 0.32, 0.21, STEEL, { leg: side < 0 ? 1 : -1, hip: 0.63, mat: "steel", hd: true });
        add("box", 0, 0.2, -0.2, 0.5, 0.82, 0.04, "#7f1d1d", { trail: { lag: 0.22, damp: 0.35, root: [0, 1.02, -0.18] }, mat: "cloth", hd: true });
        for (const side of [-1, 1] as const) {
          add("box", side * 0.33, 1.0, 0, 0.26, 0.14, 0.28, STEEL, { ...hand(side), mat: "steel" }); // pauldrons
          // HD: layered pauldrons with gilt rivets
          add("egg", side * 0.34, 0.86, 0.0, 0.26, 0.14, 0.28, "#64748b", { ...hand(side), mat: "steel", hd: true });
          add("sphere", side * 0.42, 1.08, 0.08, 0.04, 0.04, 0.04, "#fbbf24", { ...hand(side), mat: "gold", hd: true });
        }
        if (lead) {
          add("cone", 0, 1.48, 0, 0.12, 0.3, 0.3, "#7f1d1d", { hd: false }); // crest
          // HD: a crimson plume streaming from the helm
          for (let k = 0; k < 4; k++) add("drop", 0, 1.48 - k * 0.04, -0.04 - k * 0.09, 0.08, 0.32 - k * 0.04, 0.08, "#7f1d1d", { trail: { lag: 0.1 + k * 0.06, damp: 0.25, root: [0, 1.5, 0] }, mat: "fur", hd: true, rx: -0.6 - k * 0.3 });
          add("box", 0.31, 0.2, 0.25, 0.08, 1.3, 0.08, "#cbd5e1", { ...hand(1), hd: false }); // greatsword…
          add("box", 0.31, 0.95, 0.25, 0.1, 0.4, 0.04, RUNE, { ...hand(1), glow: true, idle: IDLE_KIND.pulse, hd: false }); // …its rune-lit fuller
          // HD: the greatsword gripped in the fist, gilt guard, a rune-lit fuller glowing down both faces of the blade
          sword(add, hand(1), "#cbd5e1", "#3f2a1a", "#fbbf24", "steel", 1.0);
          const [fx, fy, fz] = fist(1);
          for (const side of [-1, 1]) along(add, "box", [fx + side * 0.017, fy + 0.03, fz + 0.24], [fx + side * 0.017, fy + 0.07, fz + 0.95], 0.008, 0.025, RUNE, { ...hand(1), glow: true, idle: IDLE_KIND.pulse, hd: true });
        } else {
          add("box", -0.31, 0.35, 0.22, 0.08, 0.8, 0.5, "#7f1d1d", { ...hand(-1), hd: false }); // tower shield…
          add("box", -0.31, 0.55, 0.28, 0.12, 0.35, 0.06, RUNE, { ...hand(-1), glow: true, hd: false }); // …with its rune
          // HD: a tall shield strapped to the forearm, steel-rimmed, its rune glowing on the face
          const [sx, sy, sz] = fist(-1);
          const o: AddOpts = { ...hand(-1), hd: true };
          const cx = sx - 0.1;
          add("box", cx, sy - 0.3, sz + 0.06, 0.05, 0.85, 0.5, "#7f1d1d", { ...o, mat: "wood" });
          for (const dz of [-0.25, 0.25]) add("box", cx, sy - 0.32, sz + 0.06 + dz, 0.15, 0.89, 0.05, "#64748b", { ...o, mat: "steel" });
          for (const dy of [-0.32, 0.55]) add("box", cx, sy + dy, sz + 0.06, 0.15, 0.05, 0.55, "#64748b", { ...o, mat: "steel" });
          add("box", cx - 0.055, sy - 0.08, sz + 0.06, 0.06, 0.34, 0.1, RUNE, { ...o, glow: true, idle: IDLE_KIND.pulse });
          add("cyl", 0.31, 0.1, 0.15, 0.04, 1.9, 0.04, "#3f2a1a", { ...hand(1), hd: false }); // halberd
          add("box", 0.31, 1.75, 0.22, 0.04, 0.3, 0.24, "#cbd5e1", { ...hand(1), hd: false });
          // HD: the halberd through the fist: an axe blade, a spike on top and a hook behind
          const h: AddOpts = { ...hand(1), hd: true };
          along(add, "cyl", [0.31, 0.05, 0.1], [0.31, 2.05, -0.04], 0.045, 0.045, "#3f2a1a", { ...h, mat: "wood" });
          add("egg", 0.31, 1.62, 0.1, 0.03, 0.36, 0.26, "#cbd5e1", { ...h, mat: "steel" });
          along(add, "blade", [0.31, 2.0, -0.035], [0.31, 2.3, -0.05], 0.025, 0.08, "#cbd5e1", { ...h, mat: "steel" });
          along(add, "horn", [0.31, 1.82, -0.03], [0.31, 1.86, -0.24], 0.05, 0.05, "#64748b", { ...h, mat: "steel" });
        }
      }
      b.add("prism", 0, 0, -1.6, 2.4, 1.4, 1.8, "#7f1d1d", { mat: "cloth" }); // war tent
      b.add("cyl", 1.6, 0, -1.2, 0.06, 2.8, 0.06, "#3f2a1a", { mat: "wood" }); // standard
      b.add("box", 1.88, 2.0, -1.2, 0.55, 0.7, 0.03, "#111827", { idle: IDLE_KIND.flutter, mat: "cloth" });
      b.add("box", 1.88, 2.25, -1.17, 0.2, 0.2, 0.06, RUNE, { glow: true });
      // HD: the tent's ridge pole and end poles, guy ropes pegged out; a gilt finial on the standard
      along(b.add.bind(b), "cyl", [-1.3, 1.43, -1.6], [1.3, 1.43, -1.6], 0.06, 0.06, "#3f2a1a", { mat: "wood", hd: true });
      for (const x of [-1.25, 1.25]) {
        b.add("cyl", x, 0, -1.6, 0.06, 1.45, 0.06, "#3f2a1a", { mat: "wood", hd: true });
        along(b.add.bind(b), "cyl", [x, 1.4, -1.6], [x * 1.45, 0.02, -1.6], 0.015, 0.015, "#d6d3d1", { mat: "cloth", hd: true });
      }
      b.add("cone", 1.6, 2.8, -1.2, 0.12, 0.22, 0.12, "#fbbf24", { mat: "gold", hd: true });
      orbit(b, 1.6, -1.2, 1.0, 3.2, 3, "#1c1917", 0.22); // ravens
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.add("egg", 1.6 + Math.cos(a) * 1.0, 3.2 + (i % 2) * 0.35 + 0.12, -1.2 + Math.sin(a) * 1.0, 0.6, 0.02, 0.16, "#1c1917", { idle: IDLE_KIND.spin, pivot: [1.6, -1.2], phase: 0.01 + a, mat: "fur", hd: true, ry: -a }); // HD: the ravens' wings
      }
      break;
    }
    case "bandit-saboteur": {
      // Bigger: a bomb-maker in glowing goggles, lit fuses sparking, sparks orbiting the powder stack
      const BRASS = "#d97706";
      const look: FigureLook = { skin: "#a8a29e", tunic: "#44403c", legs: "#1f2937", boots: "#1c1917", belt: "#78350f", eyes: "#1c1917" };
      for (const [x, z] of [
        [-0.6, -0.8],
        [-0.2, -0.9],
        [-0.4, -0.5]
      ]) {
        b.add("cyl", x, 0, z, 0.5, 0.65, 0.5, "#78350f", { mat: "wood" }); // powder kegs
        b.add("box", x, 0.3, z, 0.58, 0.08, 0.58, "#27272a", { mat: "dull" });
        for (const y of [0.06, 0.55]) b.add("cyl", x, y, z, 0.54, 0.04, 0.54, "#27272a", { mat: "dull", hd: true }); // HD: hoops
      }
      b.add("cyl", -0.4, 0.65, -0.8, 0.5, 0.65, 0.5, "#78350f", { mat: "wood" });
      b.add("box", 0.4, 0.02, -0.4, 2.0, 0.03, 0.05, "#1c1917", { ry: 0.5, hd: false }); // fuse line
      // HD: the fuse snaking over the ground from the kegs to its burning end
      {
        const pts: V3[] = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          pts.push([-0.45 + t * 1.75 + Math.sin(t * 9) * 0.06, 0.025, -0.65 + t * 0.75 + Math.cos(t * 7) * 0.08]);
        }
        for (let i = 0; i < 10; i++) along(b.add.bind(b), "cyl", pts[i], pts[i + 1], 0.025, 0.025, "#1c1917", { mat: "cloth", hd: true });
      }
      b.add("sphere", 1.3, 0.05, 0.1, 0.22, 0.22, 0.22, "#fbbf24", { glow: true, idle: IDLE_KIND.pulse }); // lit fuse
      orbit(b, -0.4, -0.75, 0.9, 1.4, 4, "#fde047", 0.1); // sparks
      for (const [x, z, r, s] of [
        [1.0, 0.8, -0.4, 1.35],
        [-1.2, 0.9, 0.5, 1.05],
        [0.1, 1.5, 0.1, 1.0]
      ]) {
        const { add, hand, neck } = figure(b, x, z, r, look, s, BANDIT_WALK);
        add("cyl", 0, 1.27, 0, 0.38, 0.1, 0.38, "#78350f", { mat: "leather" }); // goggle strap
        add("box", 0, 1.26, 0.18, 0.3, 0.09, 0.06, "#38bdf8", { glow: true, hd: false }); // goggles
        // HD: two glowing goggle lenses in brass rims
        for (const side of [-1, 1]) {
          add("cyl", side * 0.07, 1.28, 0.18, 0.1, 0.05, 0.1, "#38bdf8", { ...neck, glow: true, hd: true, rx: Math.PI / 2 });
          arc(add, [side * 0.07, 1.305, 0.21], [1, 0, 0], [0, 1, 0], 0.055, 0, Math.PI * 2, 8, 0.022, BRASS, { ...neck, mat: "gold", hd: true });
        }
        add("sphere", 0.31, 0.38, 0.12, 0.28, 0.28, 0.28, "#18181b", { ...hand(1), mat: "iron" }); // bomb…
        add("sphere", 0.31, 0.66, 0.12, 0.1, 0.12, 0.1, "#fb923c", { ...hand(1), glow: true, idle: IDLE_KIND.pulse }); // …its fuse alight
        add("cyl", 0.31, 0.62, 0.12, 0.08, 0.06, 0.08, BRASS, { ...hand(1), mat: "gold", hd: true }); // HD: the bomb's brass fuse cap
        // HD: a bandolier of small bombs across the chest, a satchel of powder on the hip
        add("box", 0, 0.74, 0, 0.09, 0.62, 0.34, "#3f2a1a", { torso: true, rz: 0.7, mat: "leather", hd: true });
        for (const t of [-0.7, -0.2, 0.3]) add("sphere", -0.644 * 0.31 * t, 1.05 + 0.765 * 0.31 * t - 0.045, 0.19, 0.09, 0.09, 0.09, "#18181b", { torso: true, mat: "iron", hd: true });
        add("box", -0.24, 0.42, 0.1, 0.17, 0.2, 0.12, "#78350f", { mat: "leather", hd: true });
      }
      break;
    }
  }
}
