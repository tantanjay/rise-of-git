import * as THREE from "three";
import { CivilizationType } from "@/types";
import { HD_LO_SHAPES, archGeometry, bladeGeometry, blockGeometry, boulderGeometry, canopyGeometry, capsuleGeometry, dropGeometry, limbGeometry, podGeometry, snoutGeometry, eggGeometry, hdTwinGeometry, hornGeometry, pineGeometry, taperGeometry, trunkGeometry } from "./shapeKit";

/**
 * Low-poly building blocks. Every shape is normalised to a 1×1×1 bounding box,
 * so a part's (w, h, d) is exactly its world-space size. Parts are drawn with
 * one InstancedMesh per shape, so a 70-building city costs a handful of draw calls.
 */
export type Shape = "box" | "pyramid" | "prism" | "cone" | "cyl" | "sphere" | "octa" | CraftedShape | KitShape;
/** Crafted shapes (shapeKit.ts): a trunk with a root flare, a layered conifer, a leafy crown, a boulder, a bevelled
 * stone block and a stone arch (opening along x, from its base) */
export type CraftedShape = "trunk" | "pine" | "canopy" | "boulder" | "block" | "arch";
/** The model kit's organic shapes (shapeKit.ts), mostly for HD versions (`hdShape`): a neck or post narrowing upward,
 * a limb or chest narrowing downward to a rounded end, a capsule, a pod (a capsule lying along z: bodies), a snout
 * narrowing toward +z, an egg (wider below), a teardrop (point up), a horn curling toward +z from its base and a
 * blade (point up, spine along x, edges along z); a slab is a plain box in HD too (a long wall or road, whose bevel
 * would stretch along it) */
export type KitShape = "taper" | "limb" | "capsule" | "pod" | "snout" | "egg" | "drop" | "horn" | "blade" | "slab";

/**
 * What a part is made of, for the HD model kit (`InstancedParts` with `kit`): its roughness and metalness and the
 * surface drawn on it (fur strands, skin mottling, cloth weave, leather creases, wood grain, bone, stone cracks, worn
 * metal edges, gem glints, cooling lava, wet slime, leaves, dressed stone, roof tiles). Normal quality ignores it.
 */
export type Surface = "plain" | "fur" | "hide" | "skin" | "cloth" | "leather" | "wood" | "bone" | "stone" | "dull" | "iron" | "steel" | "gold" | "gem" | "lava" | "gel" | "leaf" | "masonry" | "tiles";
/** id: the surface the kit's shader draws; rough / metal: the material's roughness and metalness */
export const SURFACES: Record<Surface, { id: number; rough: number; metal: number }> = {
  plain: { id: 0, rough: 0.85, metal: 0 },
  fur: { id: 1, rough: 0.95, metal: 0 },
  hide: { id: 2, rough: 0.8, metal: 0 },
  skin: { id: 3, rough: 0.68, metal: 0 },
  cloth: { id: 4, rough: 0.92, metal: 0 },
  leather: { id: 5, rough: 0.62, metal: 0 },
  wood: { id: 6, rough: 0.82, metal: 0 },
  bone: { id: 7, rough: 0.55, metal: 0 },
  stone: { id: 8, rough: 0.9, metal: 0 },
  // Dull, unpolished metal (a common's blade): worn edges, barely any shine
  dull: { id: 9, rough: 0.78, metal: 0.3 },
  iron: { id: 9, rough: 0.55, metal: 0.75 },
  steel: { id: 9, rough: 0.32, metal: 0.9 },
  gold: { id: 9, rough: 0.3, metal: 1 },
  gem: { id: 10, rough: 0.15, metal: 0.1 },
  lava: { id: 11, rough: 0.9, metal: 0 },
  // Wet slime: glossy, lit through at its rim, denser at its heart, bubbles rising slowly inside
  gel: { id: 12, rough: 0.1, metal: 0 },
  // Foliage and crops: leaves in clumps with dark gaps, darker inside, sunlit on top, a little hue per part
  leaf: { id: 13, rough: 0.75, metal: 0 },
  // Dressed stone: courses and joints round its sides, flagstones on top (walls, roads, plinths, towers)
  masonry: { id: 14, rough: 0.88, metal: 0 },
  // Roof tiles or slates: overlapping rows down a roof, each lip shading the row below (only on faces turned up)
  tiles: { id: 15, rough: 0.72, metal: 0 }
};

/** A part's HD rest pose: turned by quaternion `q` about the world point (x, y, z) before it moves */
export interface PartPose {
  x: number;
  y: number;
  z: number;
  q: [number, number, number, number];
}

export interface Part {
  shape: Shape;
  x: number;
  y: number; // centre
  z: number;
  w: number;
  h: number;
  d: number;
  rx?: number;
  ry?: number;
  rz?: number;
  color: string;
  glow?: boolean; // unlit (windows, lamps, crystals)
  /** GPU idle animation around the model's ground point (InstancedParts): see IDLE_KIND */
  idle?: PartIdle;
  /** Whole-model cycle applied on top of `idle`, so a part with a cycle of its own still moves with its model */
  model?: PartIdle;
  /** HD model kit: what it is made of (default plain) */
  mat?: Surface;
  /** HD model kit: true, drawn only in HD (buckles, straps, trim); false, drawn only in Normal (a part its HD version
   * replaces with a finer one) */
  hd?: boolean;
  /** HD model kit: the shape it is drawn with in HD (a box leg becomes a tapered limb) */
  hdShape?: Shape;
  /** HD model kit: its relaxed rest pose (an arm hanging out a little, a head tilted), applied only in HD */
  pose?: PartPose;
  /** HD model kit: the model's ground height (its soft contact shadow; default the part's own foot) */
  base?: number;
  /** Parts with the same number move as one: each takes the idle of the first part of its group (`Builder.add` `sync`) */
  sync?: number;
  /** Part of a living thing that stands in a site without walking about (a yeti, a cow, a camel): it breathes about
   * this point, its feet (`Builder.alive`); what it stands among stays still */
  breath?: [number, number, number];
  /** Has an HD version in a scene whose other parts have none yet (a city's improvements): `InstancedParts` with
   * `kit="tagged"` draws only these through the model kit (`Builder.kit`) */
  kit?: boolean;
  /** A creature of a mob or bandit pack on the map: its pack's key (`npcFightKey`), so it strikes and casts while the
   * pack fights a live battle (`world/npcStrikes.ts`, moved in the batch's vertex shader) */
  fight?: number;
}

/**
 * Idle cycles drawn in the vertex shader (InstancedParts). Whole-model cycles turn about the model's ground point:
 * 0 breathe + posture sway, 1 float + drift, 2 gentle bob, 9 prowl (a creature shifting its weight, looking round
 * in steps, now and then hunching to lunge), 10 heartbeat (a magical site swells a touch, like a slow heartbeat),
 * 11 rock (a wreck rocking on the swell). Part cycles move one part about its own anchor: 4 sway (trees, crops,
 * masts bend from the base), 5 spin (about the vertical axis), 6 pulse (glows swell and fade), 7 smoke (puffs rise,
 * swell and vanish, then start again), 8 flutter (flags and cloth ripple). 3 is "still".
 * Walkers (`Builder.walker`): one creature of a model wanders a small loop on its own, a quarter turn at a time with a
 * pause to look round in between: 12 walk, 13 hop (slimes), 14 slither (serpents), 15 fly (a wobbly loop in the air,
 * climbing, diving and banking into the turn), 16 hover (drifts about where it floats, swaying and breathing, never
 * circling). For these `phase` is the creature's heading and `amp` its loop radius. Parts of a walker (`speed` the
 * same as its walker's, `phase` its heading): 17 leg, a leg or arm swinging from its hip as it steps (`amp` ±1: which
 * legs step together; ±2: an arm on that side); 18 flap, a wing beating from its shoulder (`amp`: wingbeat rate, its
 * sign the wing's side); 19 head, held steady while the body moves under it, glancing round when it stops; 20 trail,
 * a tail, ear or cloak trailing the body's motion; 21 torso, the shoulders turning against the hips. For 19–21 `amp`
 * is the walker's gait kind, plus 0.5 for a biped and a trail's damping × 0.45 as its fraction. A walking walker's `sub`
 * 0.25 marks a biped (it carries itself upright and plays a person's idle events, never a dog's shake).
 */
export const IDLE_KIND = { breathe: 0, float: 1, bob: 2, sway: 4, spin: 5, pulse: 6, smoke: 7, flutter: 8, prowl: 9, heartbeat: 10, rock: 11, walk: 12, hop: 13, slither: 14, fly: 15, hover: 16, leg: 17, flap: 18, head: 19, trail: 20, torso: 21 } as const;
export type IdleKind = (typeof IDLE_KIND)[keyof typeof IDLE_KIND];

export interface PartIdle {
  /** Anchor: the model's ground point (whole-model cycles) or the part's own pivot (part cycles) */
  x: number;
  y: number;
  z: number;
  kind: IdleKind;
  /** Offset so neighbours don't move in step */
  phase: number;
  /** Tempo and size multipliers (default: derived from `phase`), so two copies of a model never move alike */
  speed?: number;
  amp?: number;
  /** A small value (< 0.45) packed with the kind: a flyer's wingbeat rate / 128, a trailing part's lag in seconds */
  sub?: number;
}

/** Idle cycles that move a single part about its own pivot (the others move the whole model) */
export const PART_IDLES = new Set<IdleKind>([IDLE_KIND.sway, IDLE_KIND.spin, IDLE_KIND.pulse, IDLE_KIND.smoke, IDLE_KIND.flutter, IDLE_KIND.leg, IDLE_KIND.flap, IDLE_KIND.head, IDLE_KIND.trail, IDLE_KIND.torso]);
/** Part cycles that ride a walker and keep its heading and tempo (legs, arms, wings, heads, tails, torsos) */
export const RIDER_IDLES = new Set<IdleKind>([IDLE_KIND.leg, IDLE_KIND.flap, IDLE_KIND.head, IDLE_KIND.trail, IDLE_KIND.torso]);

/** A two-legged walker's mark, packed into its walk cycle (`sub`) */
const BIPED = 0.25;

/** How a walker gets about */
export type Gait = "walk" | "hop" | "slither" | "fly" | "hover";
const GAIT_KIND: Record<Gait, IdleKind> = { walk: IDLE_KIND.walk, hop: IDLE_KIND.hop, slither: IDLE_KIND.slither, fly: IDLE_KIND.fly, hover: IDLE_KIND.hover };
/** A walker's cycle (12–15): it moves about on its own, so the whole model doesn't move with it */
export const isWalkKind = (kind: IdleKind | undefined) => kind !== undefined && kind >= IDLE_KIND.walk && kind <= IDLE_KIND.hover;
/** A part of a walking creature (its body or a stepping leg): it leaves its rest pose, so it casts no shadow */
export const walks = (p: Part) => isWalkKind(p.model?.kind) || (p.idle !== undefined && RIDER_IDLES.has(p.idle.kind));

export type PersonRole = "villager" | "farmer" | "soldier";

export type AnimalKind =
  | "sheep"
  | "cow"
  | "pig"
  | "chicken"
  | "deer"
  | "horse"
  | "rabbit"
  | "swan"
  | "goat"
  | "boar"
  | "pony"
  | "goose"
  | "wolf"
  | "lizard"
  | "crow"
  | "griffin"
  | "stag"
  | "cat"
  | "owl";

/** People are modelled per civilization (e.g. "soldier_elf" is a hooded archer) */
/** `light_<civ>`: the light a person carries after dark (lantern, wisp, miner's lamp, torch, void orb), posed like its bearer */
/** `mount_<civ>`: the beast a civilization's scouts ride (courser, moonstag, war ram, warg, voidmare) */
/** `soldier1_<civ>` … `soldier3_<civ>`: a soldier in an Armory set (uncommon, rare, epic), its gear on */
export type ArmedRole = "soldier1" | "soldier2" | "soldier3";
export type ActorKind = `${PersonRole}_${CivilizationType}` | `${ArmedRole}_${CivilizationType}` | `light_${CivilizationType}` | `mount_${CivilizationType}` | AnimalKind | "sails" | "rings" | "gear" | "sparkle" | `merc-${string}`;

/**
 * "march": (x, z) → (x2, z2) over wall-clock t0…t1; "fight"/"cheer"/"fallen": battle poses on the world map;
 * "circle": run (or fly, when y > 0) round the centre (x2, z2) at the radius of (x, z), starting at angle `phase`;
 * "wander": run about at random within the radius of (x, z) round (x2, z2);
 * "toss": a ball thrown from stop to stop round a ring of `ring` stops (centre (x2, z2), radius of (x, z), first stop
 * at angle `yaw`), one throw per 1 / `speed` s; "catch": a thrower standing at stop number `phase` of such a ring,
 * hopping as the ball reaches them
 */
export type Motion = "walk" | "work" | "graze" | "peck" | "spin" | "float" | "idle" | "visit" | "march" | "fight" | "cheer" | "fallen" | "circle" | "wander" | "toss" | "catch";

/** What a "visit" actor does while standing before a landmark */
export type Gesture = "bow" | "lookUp" | "admire";

export interface Actor {
  kind: ActorKind;
  x: number;
  y: number;
  z: number;
  x2?: number; // walk target
  z2?: number;
  yaw: number;
  motion: Motion;
  speed: number;
  phase: number;
  colors?: string[]; // per-kind colour slots (tunic, skin, hair…)
  gesture?: Gesture; // "visit": walk to (x2, z2), face `yaw`, do this, walk back, rest
  t0?: number; // "march": epoch ms when it sets off from (x, z)…
  t1?: number; // …and when it reaches (x2, z2)
  arc?: { x: number; z: number }; // "march": goes round this centre (the short way) instead of straight
  scale?: number; // uniform size (default 1)
  ring?: number; // "toss" / "catch": stops round the ring
  ride?: boolean; // a rider in the saddle (y up to the seat): legs astride, hands on the reins, no stride of their own
}

/** Something in the city on the rarity ladder (red-star and Celestial plots, tier 3–5 improvements): drawn by TierFx */
export interface PlotFx {
  x: number;
  z: number;
  /** Radius of what it surrounds */
  size: number;
  tier: "rare" | "epic" | "legendary" | "mythical";
  color?: string;
  accent?: string;
}

export interface SceneOut {
  parts: Part[]; // always visible
  detail: Part[]; // flowers, props — hidden when zoomed far out
  actors: Actor[];
  fx: PlotFx[];
}

export const emptyScene = (): SceneOut => ({ parts: [], detail: [], actors: [], fx: [] });

const geometryCache = new Map<string, THREE.BufferGeometry>();

/**
 * The same geometry indexed: vertices equal in every attribute, bit for bit, are shared, so a shared corner runs the
 * vertex shader once instead of once per triangle (a rounded box: 324 → 92). The triangles and their values are exactly
 * as before, so are the pixels. An indexed geometry comes back as it is
 */
export function indexExact(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.index) return g;
  const attrs = Object.entries(g.attributes) as [string, THREE.BufferAttribute][];
  const n = attrs[0][1].count;
  // Every attribute's bits side by side, one row a vertex
  const width = attrs.reduce((w, [, a]) => w + a.itemSize, 0);
  const rows = new Uint32Array(n * width);
  let col = 0;
  for (const [, a] of attrs) {
    const src = new Uint32Array((a.array as Float32Array).buffer, (a.array as Float32Array).byteOffset, a.array.length);
    for (let i = 0; i < n; i++) for (let e = 0; e < a.itemSize; e++) rows[i * width + col + e] = src[i * a.itemSize + e];
    col += a.itemSize;
  }
  // A table of the vertices kept, by a hash of their bits (open addressing); a hit is compared bit for bit
  const mask = (1 << Math.ceil(Math.log2(n * 2 + 2))) - 1;
  const table = new Int32Array(mask + 1).fill(-1);
  const index = new Uint32Array(n);
  const keep: number[] = [];
  for (let i = 0; i < n; i++) {
    const row = i * width;
    let h = 2166136261;
    for (let e = 0; e < width; e++) h = Math.imul(h ^ rows[row + e], 16777619);
    let slot = h & mask;
    let at = -1;
    while (table[slot] >= 0) {
      const other = keep[table[slot]] * width;
      let e = 0;
      while (e < width && rows[other + e] === rows[row + e]) e++;
      if (e === width) {
        at = table[slot];
        break;
      }
      slot = (slot + 1) & mask;
    }
    if (at < 0) {
      at = keep.length;
      table[slot] = at;
      keep.push(i);
    }
    index[i] = at;
  }
  const out = new THREE.BufferGeometry();
  for (const [name, a] of attrs) {
    const data = new Float32Array(keep.length * a.itemSize);
    keep.forEach((src, j) => data.set((a.array as Float32Array).subarray(src * a.itemSize, (src + 1) * a.itemSize), j * a.itemSize));
    out.setAttribute(name, new THREE.BufferAttribute(data, a.itemSize));
  }
  out.setIndex(new THREE.BufferAttribute(keep.length > 65535 ? index : new Uint16Array(index), 1));
  return out;
}

function normalise(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = indexExact(geometry);
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  g.translate(-center.x, -center.y, -center.z);
  g.scale(1 / size.x, 1 / size.y, 1 / size.z);
  return g;
}

/** A kit part this small (its middle size, world units) or this flat (its least) is drawn with its shape's lighter HD twin */
const HD_LO_SIZE = 0.12;
const HD_LO_FLAT = 0.05;
/** Whether a kit part in this shape is drawn with the lighter HD twin (eyes, lips, whiskers, strands, feathers, wing skin) */
export const hdLo = (shape: Shape, p: { w: number; h: number; d: number }) => {
  if (!HD_LO_SHAPES.has(shape)) return false;
  const [a, b] = [p.w, p.h, p.d].sort((x, y) => x - y);
  return b < HD_LO_SIZE || a < HD_LO_FLAT;
};

/**
 * The shared geometry of a shape. `hd`: its HD model kit twin, the same 1×1×1 shape bevelled and rounded with more
 * segments (a box with rounded edges, a cylinder with soft rims, rounder spheres and cones); shapes without a twin
 * are the same in both. `lo`: the HD twin's lighter version for small parts (`hdLo`).
 */
export function getShapeGeometry(shape: Shape, hd = false, lo = false): THREE.BufferGeometry {
  const key = hd ? `${shape}|hd${lo ? "|lo" : ""}` : shape;
  let g = geometryCache.get(key);
  if (g) return g;
  if (hd) {
    const twin = hdTwinGeometry(shape, lo);
    g = twin ? normalise(twin) : getShapeGeometry(shape);
    geometryCache.set(key, g);
    return g;
  }
  switch (shape) {
    case "box":
      g = new THREE.BoxGeometry(1, 1, 1);
      break;
    case "pyramid":
      g = normalise(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4));
      break;
    case "prism":
      // Triangular gable roof, ridge along X, apex up
      g = normalise(new THREE.CylinderGeometry(1, 1, 1, 3, 1, false, Math.PI / 2).rotateZ(Math.PI / 2));
      break;
    case "cone":
      g = normalise(new THREE.ConeGeometry(1, 1, 8, 1));
      break;
    case "cyl":
      g = normalise(new THREE.CylinderGeometry(1, 1, 1, 8, 1));
      break;
    case "sphere":
      g = normalise(new THREE.SphereGeometry(1, 8, 6));
      break;
    case "octa":
      g = normalise(new THREE.OctahedronGeometry(1, 0));
      break;
    case "trunk":
      g = normalise(trunkGeometry());
      break;
    case "pine":
      g = normalise(pineGeometry());
      break;
    case "canopy":
      g = normalise(canopyGeometry());
      break;
    case "boulder":
      g = normalise(boulderGeometry());
      break;
    case "block":
      g = normalise(blockGeometry());
      break;
    case "arch":
      g = normalise(archGeometry());
      break;
    case "taper":
      g = normalise(taperGeometry());
      break;
    case "capsule":
      g = normalise(capsuleGeometry());
      break;
    case "limb":
      g = normalise(limbGeometry());
      break;
    case "pod":
      g = normalise(podGeometry());
      break;
    case "snout":
      g = normalise(snoutGeometry());
      break;
    case "egg":
      g = normalise(eggGeometry());
      break;
    case "drop":
      g = normalise(dropGeometry());
      break;
    case "horn":
      g = normalise(hornGeometry());
      break;
    case "blade":
      g = normalise(bladeGeometry());
      break;
    case "slab":
      g = new THREE.BoxGeometry(1, 1, 1);
      break;
  }
  geometryCache.set(shape, g!);
  return g!;
}

interface AddOptions {
  rx?: number;
  ry?: number;
  rz?: number;
  glow?: boolean;
  detail?: boolean;
  /** A part cycle (sway, spin, pulse, smoke, flutter): about the part's base (sway, smoke, flutter) or centre */
  idle?: IdleKind;
  /** Local (x, z) the cycle turns about instead (a spin round it makes the part orbit; a swinging part swings with the
   * limb standing there) */
  pivot?: [number, number];
  /** Added to the cycle's phase (staggered smoke puffs, motes spread round an orbit) */
  phase?: number;
  /** On a walker: a leg that swings from its top as the walker steps; legs with the same sign step together */
  leg?: 1 | -1;
  /** On a walker: an arm (or what its hand holds, with `pivot` on the arm) on that side (-1 left, +1 right): it swings
   * against the leg on its side, close to the body and a beat behind it, and turns with the shoulders */
  arm?: 1 | -1;
  /** On a walker: part of its head, which turns about the neck at local (0, y, z): it holds steady while the body bobs,
   * leans and twists under it, glances round in snaps when it stops, sniffs and shakes */
  head?: { y: number; z?: number };
  /** On a walker: the upper body, which turns against the hips with each stride (the shoulders' counter-twist) */
  torso?: boolean;
  /** On a walker: a tail, ear, mane or cloak that trails the body's motion from its `root` (local; default the part's
   * centre), `lag` seconds behind (default 0.15, at most 0.45); `damp` 0 swings loosely, 1 barely trails (default 0.5).
   * Off a walker it sways */
  trail?: { lag?: number; damp?: number; root?: [number, number, number] };
  /** A swinging part's hip or shoulder height (local y) when it isn't the part's own top: a boot, a hand, a held blade */
  hip?: number;
  /** On a walker: a wing that beats from its inner edge, this many radians of wingbeat per second of its tempo */
  flap?: number;
  /** HD model kit: what the part is made of (its roughness, metalness and surface in HD) */
  mat?: Surface;
  /** HD model kit: true, drawn only in HD (detail that costs Normal nothing); false, only in Normal (a part the HD
   * version replaces, e.g. with a different size) */
  hd?: boolean;
  /** HD model kit: drawn with this shape in HD (same size) */
  hdShape?: Shape;
  /** HD model kit: a relaxed rest pose in HD, turned by (rx, ry, rz) (local axes, radians) about local point `at` */
  pose?: { at: [number, number, number]; rx?: number; ry?: number; rz?: number };
  /** Moves exactly with the first part given the same number (its anchor, phase, tempo and size): HD detail riding a
   * swaying Normal part (ears on a wheat stalk, grapes on a vine) bends with it instead of drifting apart. Give the
   * riders the same `idle` kind as the part they ride */
  sync?: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Phase from the part's position, so neighbouring parts start apart (models re-seed it per instance) */
function partIdle(kind: IdleKind, x: number, y0: number, z: number, h: number, pivot?: [number, number], offset = 0): PartIdle {
  const v = Math.sin(x * 12.9898 + z * 78.233 + y0 * 37.719) * 43758.5453;
  const centre = kind === IDLE_KIND.pulse || kind === IDLE_KIND.spin;
  const [px, pz] = pivot ?? [x, z];
  // Staggered or spread parts (an offset) keep their spacing: they share one base phase
  const phase = offset ? offset : (v - Math.floor(v)) * Math.PI * 2;
  return { x: px, y: centre ? y0 + h / 2 : y0, z: pz, kind, phase };
}

/**
 * Writes parts in a local frame (x, z rotated by `rot`, then offset) straight into world space.
 * Local +Z is the "front" of whatever is being built.
 */
export class Builder {
  constructor(
    public out: SceneOut,
    public ox = 0,
    public oy = 0,
    public oz = 0,
    public rot = 0,
    public tint?: (color: string) => string
  ) {}

  /** The walking creature this builder's parts belong to (`walker`): they all move with it */
  walk?: PartIdle;
  /** Seeds each walker's tempo, so two copies of a model never walk in step (set per NPC) */
  seed = 0;
  /** The feet of the living thing this builder's parts belong to (`alive`): they breathe about it */
  life?: [number, number, number];
  /** What is added from here on (here and in children) has an HD version in a scene whose other parts don't (`Part.kit`) */
  kit = false;
  /** HD model kit: what parts added here (and in children) are made of when they don't say (`mat`) */
  mat?: Surface;

  /** Marks what is added from here on (here and in children) as a living thing standing at this builder's origin */
  alive(): this {
    this.life = [this.ox, this.oy, this.oz];
    return this;
  }

  /** Local → world (rotation about Y matches THREE's convention) */
  world(x: number, z: number): [number, number] {
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    return [this.ox + x * c + z * s, this.oz - x * s + z * c];
  }

  /** Adds a part whose bottom sits at local height y0 */
  add(shape: Shape, x: number, y0: number, z: number, w: number, h: number, d: number, color: string, o: AddOptions = {}) {
    if (o.flap && this.walk) {
      // A beating wing is laid out level from its shoulder (the inner edge where it was drawn); its beat raises and
      // lowers it from there, and a glide holds it level
      const side = x < 0 ? -1 : 1;
      const inner = (-side * w) / 2;
      const rz = o.rz ?? 0;
      const sx = x + inner * Math.cos(rz);
      const sy = y0 + h / 2 + inner * Math.sin(rz);
      const [hx, hz] = this.world(sx, z);
      // The body heaves with the beat of its wings (the first pair sets it)
      this.walk.sub ??= Math.min(o.flap, 57) / 128;
      const wing: PartIdle = { x: hx, y: this.oy + sy, z: hz, kind: IDLE_KIND.flap, phase: this.walk.phase, speed: this.walk.speed, amp: side * o.flap };
      this.add(shape, sx + (side * w) / 2, sy - h / 2, z, w, h, d, color, { ...o, rz: undefined, flap: undefined, trail: undefined });
      const part = (o.detail ? this.out.detail : this.out.parts).at(-1)!;
      part.idle = wing;
      return;
    }
    const [wx, wz] = this.world(x, z);
    let glow = o.glow;
    let c = color;
    if (this.tint) {
      // Weathered buildings: lights are out
      c = glow ? "#3f3f46" : this.tint(color);
      glow = false;
    }
    (o.detail ? this.out.detail : this.out.parts).push({
      shape,
      x: wx,
      y: this.oy + y0 + h / 2,
      z: wz,
      w,
      h,
      d,
      rx: o.rx,
      ry: (o.ry || 0) + this.rot,
      rz: o.rz,
      color: c,
      glow,
      idle: this.riderIdle(wx, wz, y0, h, o) ?? (o.idle === undefined && !o.trail ? undefined : partIdle(o.idle ?? IDLE_KIND.sway, wx, this.oy + y0, wz, h, o.pivot && this.world(o.pivot[0], o.pivot[1]), o.phase)),
      model: this.walk,
      ...((o.mat ?? this.mat) && { mat: o.mat ?? this.mat }),
      ...(o.hd !== undefined && { hd: o.hd }),
      ...(o.hdShape && { hdShape: o.hdShape }),
      ...(o.pose && { pose: this.poseOf(o.pose) }),
      ...(o.sync !== undefined && { sync: o.sync }),
      ...(this.life && { breath: this.life }),
      ...(this.kit && { kit: true })
    });
  }

  /** A rest pose in this builder's frame → about a world point, turned in world axes */
  private poseOf(o: NonNullable<AddOptions["pose"]>): PartPose {
    const [x, z] = this.world(o.at[0], o.at[2]);
    const turn = new THREE.Quaternion().setFromAxisAngle(UP, this.rot);
    const q = turn.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, "YXZ"))).multiply(turn.invert());
    return { x, y: this.oy + o.at[1], z, q: [q.x, q.y, q.z, q.w] };
  }

  /** The cycle of a part that rides this builder's walker (a leg, arm, head, tail or torso), if it is one */
  private riderIdle(wx: number, wz: number, y0: number, h: number, o: AddOptions): PartIdle | undefined {
    const w = this.walk;
    if (!w) return undefined;
    const ride = { phase: w.phase, speed: w.speed };
    // A head, tail or torso works out its walker's pose, so it carries the gait and the body type
    const body = w.kind + (w.sub === BIPED ? 0.5 : 0);
    if (o.leg || o.arm) return { ...this.limbAt(wx, wz, o.pivot), y: this.oy + (o.hip ?? y0 + h), kind: IDLE_KIND.leg, ...ride, amp: o.arm ? o.arm * 2 : o.leg };
    if (o.head) {
      const [x, z] = this.world(0, o.head.z ?? 0);
      return { x, y: this.oy + o.head.y, z, kind: IDLE_KIND.head, ...ride, amp: body };
    }
    if (o.trail) {
      const [rx, ry, rz] = o.trail.root ?? [undefined, undefined, undefined];
      const [x, z] = rx === undefined ? [wx, wz] : this.world(rx, rz!);
      const damp = Math.min(Math.max(o.trail.damp ?? 0.5, 0), 0.95);
      return { x, y: this.oy + (ry ?? y0 + h / 2), z, kind: IDLE_KIND.trail, ...ride, amp: body + damp * 0.45, sub: Math.min(Math.max(o.trail.lag ?? 0.15, 0), 0.45) };
    }
    if (o.torso) return { x: wx, y: this.oy + y0, z: wz, kind: IDLE_KIND.torso, ...ride, amp: body };
    return undefined;
  }

  /** Where a swinging limb turns: its own centre, or the limb it hangs from (`pivot`: a held blade swings with the arm) */
  private limbAt(wx: number, wz: number, pivot?: [number, number]): { x: number; z: number } {
    if (!pivot) return { x: wx, z: wz };
    const [x, z] = this.world(pivot[0], pivot[1]);
    return { x, z };
  }

  child(x: number, z: number, rot = 0, y = 0): Builder {
    const [wx, wz] = this.world(x, z);
    const c = new Builder(this.out, wx, this.oy + y, wz, this.rot + rot, this.tint);
    c.walk = this.walk;
    c.seed = this.seed;
    c.life = this.life;
    c.kit = this.kit;
    c.mat = this.mat;
    return c;
  }

  /**
   * A creature that walks on its own (`gait`) round a loop of `radius`, starting from where it stands facing its way;
   * everything added to it (or to its children) moves with it. `pace` scales its tempo (a scurrying rat, a slow troll).
   * `biped`: it walks on two legs (people, goblins, trolls), so it carries itself upright and never shakes itself like a dog.
   */
  walker(x: number, z: number, rot: number, gait: Gait, radius: number, { y = 0, pace = 1, biped = false }: { y?: number; pace?: number; biped?: boolean } = {}): Builder {
    const c = this.child(x, z, rot, y);
    const v = Math.sin(this.seed * 0.137 + c.ox * 12.9898 + c.oz * 78.233 + c.oy * 37.719) * 43758.5453;
    c.walk = { x: c.ox, y: c.oy, z: c.oz, kind: GAIT_KIND[gait], phase: c.rot, speed: (0.8 + (v - Math.floor(v)) * 0.45) * pace, amp: radius, sub: biped && gait === "walk" ? BIPED : undefined };
    return c;
  }

  actor(a: Actor) {
    const [wx, wz] = this.world(a.x, a.z);
    const out: Actor = { ...a, x: wx, y: this.oy + a.y, z: wz, yaw: a.yaw + this.rot };
    if (a.x2 !== undefined && a.z2 !== undefined) {
      const [x2, z2] = this.world(a.x2, a.z2);
      out.x2 = x2;
      out.z2 = z2;
    }
    this.out.actors.push(out);
  }

  fx(x: number, z: number, size: number, tier: PlotFx["tier"], color?: string, accent?: string) {
    const [wx, wz] = this.world(x, z);
    this.out.fx.push({ x: wx, z: wz, size, tier, color, accent });
  }
}
