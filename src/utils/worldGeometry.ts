/**
 * The world map's geometry in one place: how big the realm is, where its zones lie, the wild rim round them, where the
 * land ends, and how much ground each kind of thing on the map covers. The server's map generator and the client's
 * terrain both read it. Server copy: server/src/worldGeometry.ts (keep the two the same).
 */

/** Every zone is spread out by this factor (20% more area each): coordinates scale, footprints don't */
export const WORLD_SCALE = Math.sqrt(1.2);
/** A length on the map before the realm grew, at today's scale (rounded to 0.1) */
export const ws = (v: number) => Math.round(v * WORLD_SCALE * 10) / 10;

/** The province hearts sit this far out along each diagonal (Valoria −x +z, Sylvandale −x −z, Ironforge +x −z, Drak'mar +x +z) */
export const PROVINCE_OFFSET = ws(44);
/** A mortal province's width and depth */
export const PROVINCE_SIZE = ws(62);
/**
 * The Nethergarde Voidrift grows half again on top of the world scale (2.25× its area). Its castles stay on a tight ring
 * round the Core (a civilization's home, not a frontier); the rift's outer band beyond them is open ground: roving spawns
 * and resource nodes, the horror's entry and the Void Gate.
 */
export const VOID_SCALE = 1.5;
/** A length from the Voidrift's heart before the realm grew, at today's scale (rounded to 0.1) */
export const vs = (v: number) => Math.round(v * WORLD_SCALE * VOID_SCALE * 10) / 10;
/** The Nethergarde Voidrift's width and depth (centred on the map), and the rift's radius */
export const VOIDRIFT_SIZE = vs(48);
export const VOIDRIFT_RADIUS = VOIDRIFT_SIZE / 2;
/** Nethergarde castles and the open Voidrift slots stand in this tight band round the Core */
export const VOIDRIFT_BAND = { inner: ws(10), outer: ws(18) };
/** Mortal castles keep this far from the Core: out of the rift */
export const VOIDRIFT_KEEP_OUT = Math.round((VOIDRIFT_RADIUS - 4) * 10) / 10;
/** The rift's outer band, beyond its castles: open ground where roving spawns and nodes land */
export const VOIDRIFT_RIM = { inner: Math.round((VOIDRIFT_BAND.outer + 4) * 10) / 10, outer: Math.round((VOIDRIFT_RADIUS - 2) * 10) / 10 };
/** The Void Gate: one fixed spot in the rift's outer band, due south of the Core (+z, facing the map camera) */
export const VOID_GATE = { x: 0, z: Math.round(((VOIDRIFT_BAND.outer + VOIDRIFT_RADIUS) / 2) * 10) / 10 };
/** The four buffer zones' centres, this far out along each axis, and their radius */
export const BUFFER_OFFSET = ws(48);
export const BUFFER_RADIUS = ws(18);
/** The frontier gates stand this far out along each diagonal */
export const GATE_OFFSET = ws(24);
/** No spawn lands this close to the Nethergarde Core (just outside the rift's castle ring) */
export const CENTRE_CLEAR = Math.round((ws(18) + 4) * 10) / 10;

/** The zones end here (|x| and |z|): beyond it lies the wild rim */
export const ZONE_HALF = ws(66);
/** How deep the wild rim is: new land wrapped round the whole map on every side and round the corners */
export const WILD_FRAME = 9;
/** The farthest out anything spawns (|x| and |z|): the rim's outer edge */
export const PLAY_HALF = Math.round((ZONE_HALF + WILD_FRAME) * 10) / 10;
/** The board (terrain, sea, rim) is this many units across: one terrain segment per unit, so a whole number */
export const WORLD_SIZE = 212;
export const WORLD_HALF = WORLD_SIZE / 2;

/**
 * The coast: a rounded square (superellipse of `power`) of `radius`, its edge wobbling in and out by up to about
 * ±`wobble` / 2 in broad headlands and smaller bays. `coastNorm` is 1 on the shoreline's middle: land is solid inside
 * 0.88 and gone past 1.04.
 */
export const COAST = { radius: 93, wobble: 12, power: 6 } as const;

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Noise round the coast (0–1), 3 octaves */
function coastNoise(x: number, y: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < 3; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Where a point lies against the coast: below 0.88 solid land, above 1.04 open sea (the same on the server and client) */
export function coastNorm(x: number, z: number): number {
  const angle = Math.atan2(z, x);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const R = COAST.radius + ((coastNoise(ca * 2.2 + 11, sa * 2.2 + 5) - 0.5) * 0.7 + (coastNoise(ca * 7 + 3, sa * 7 - 8) - 0.5) * 0.3) * COAST.wobble * 2;
  return Math.pow(Math.pow(Math.abs(x) / R, COAST.power) + Math.pow(Math.abs(z) / R, COAST.power), 1 / COAST.power);
}

/** Valoria's river: where it starts (z) and its centre line, flowing south to the coast */
export const RIVER_FROM_Z = ws(30);
export const riverX = (z: number) => -PROVINCE_OFFSET + Math.sin((z / WORLD_SCALE) * 0.12) * 4 * WORLD_SCALE;

/** The Sunken Fjord's open water: |x| ≤ across, z from −from to −to, all of it deep water (crews afloat rove here) */
export const FJORD_WATER = { across: ws(7), from: ws(33), to: ws(62) };
/** Where the fjord's water runs (inlet and mouth), for keeping land spawns out of it: |x| ≤ across, z ≤ −from */
const FJORD_INLET = { across: ws(9), from: ws(30) };

/** A buffer zone's roving strip: ±across between its two provinces, from `from` to `to` along it */
export const ROVING_STRIP = { across: ws(12), from: CENTRE_CLEAR, to: ws(64) };
/** Where a buffer zone's epic landmark or free realm may stand: ±across, from `from` to `to` along it */
export const LANDMARK_STRIP = { across: ws(11), from: Math.round((VOIDRIFT_RADIUS + 4.5) * 10) / 10, to: ws(62) };

/** True where the ground is dry land for sure: inside the coast with room to spare, out of the fjord and the river */
export function onLand(x: number, z: number): boolean {
  if (Math.abs(x) > PLAY_HALF || Math.abs(z) > PLAY_HALF) return false;
  if (coastNorm(x, z) > 0.9) return false;
  if (z < -FJORD_INLET.from && Math.abs(x) < FJORD_INLET.across) return false;
  if (z > RIVER_FROM_Z + 4 && Math.abs(x - riverX(z)) < 2.6) return false;
  return true;
}

/* ------------------------------------------------------------------------- */
/* The wild rim                                                              */
/* ------------------------------------------------------------------------- */

export interface RimArea {
  id: string;
  name: string;
  /** The rectangle it covers */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The buffer zones beside it (whose roving spawns may wander out here) */
  zones: string[];
}

const Z = ZONE_HALF;
const P = PLAY_HALF;
/** One rim area per side and one per corner. North is −z (the camera looks north), west is −x. */
export const RIM_AREAS: RimArea[] = [
  { id: "rim-north", name: "The Northern Wilds", x0: -Z, x1: Z, z0: -P, z1: -Z, zones: ["buf-sea-fjord"] },
  { id: "rim-south", name: "The Southern Wilds", x0: -Z, x1: Z, z0: Z, z1: P, zones: ["buf-scorch-desert"] },
  { id: "rim-west", name: "The Western Wilds", x0: -P, x1: -Z, z0: -Z, z1: Z, zones: ["buf-whisper-woods"] },
  { id: "rim-east", name: "The Eastern Wilds", x0: Z, x1: P, z0: -Z, z1: Z, zones: ["buf-dragon-peaks"] },
  { id: "rim-northwest", name: "The Mistfen Reach", x0: -P, x1: -Z, z0: -P, z1: -Z, zones: ["buf-sea-fjord", "buf-whisper-woods"] },
  { id: "rim-northeast", name: "The Frostcrag Reach", x0: Z, x1: P, z0: -P, z1: -Z, zones: ["buf-sea-fjord", "buf-dragon-peaks"] },
  { id: "rim-southeast", name: "The Ashen Reach", x0: Z, x1: P, z0: Z, z1: P, zones: ["buf-scorch-desert", "buf-dragon-peaks"] },
  { id: "rim-southwest", name: "The Greenmarch Reach", x0: -P, x1: -Z, z0: Z, z1: P, zones: ["buf-scorch-desert", "buf-whisper-woods"] }
];

/** True in the wild rim (outside every zone, inside the rim's outer edge) */
export const inRim = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) > ZONE_HALF && Math.abs(x) <= PLAY_HALF && Math.abs(z) <= PLAY_HALF;

/* ------------------------------------------------------------------------- */
/* Footprints                                                                */
/* ------------------------------------------------------------------------- */

/**
 * The ground each kind of thing on the map covers (a keep-out radius): two things stand no closer than
 * rA + rB + FOOTPRINT_MARGIN. These don't grow with the map, which is what gives the bigger realm its room.
 */
export const FOOTPRINT = {
  /** A ruler's castle (a Wonder is ~5 across, plus its name badge) */
  castle: 4,
  /** A Voidrift slot's NPC void kingdom */
  voidSlot: 4,
  /** A free realm (buffer zone NPC kingdom) with its palisade, at its widest (epic) stage */
  realm: 6,
  /** A frontier gate's gatehouse, and one point of its border wall */
  gate: 4,
  wall: 1.5,
  /** An epic landmark, a province's legendary landmark, the Nethergarde Core */
  landmark: 5,
  legendary: 6,
  core: 6,
  /** A world boss with the ring its fights stand in */
  boss: 7,
  /** A roving mob or bandit pack, by tier (at least the rarity ring the map draws round its largest model) */
  encounter: { common: 2.9, uncommon: 3.6, rare: 3.6, epic: 4, legendary: 4.2, mythical: 5 },
  /** A treasure chest or hoard, and a resource node with its gatherers' work circle */
  treasure: 3.2,
  resource: 4,
  /** A scenery site (a tavern, a caravan, a wizard tower…), with the folk and beasts about it */
  scenery: 3.6,
  /** Xal'Vorath, where it stands and where it stops */
  horror: 5,
  /** The Void Gate, with the ground its armies will gather on */
  voidGate: 7
} as const;
/** Extra room kept between any two footprints */
export const FOOTPRINT_MARGIN = 1.5;

/** A thing on the map with the ground it covers */
export interface Footprint {
  x: number;
  z: number;
  r: number;
}

type FootprintNpc = { id: string; category?: string; rarity?: string; type?: string };

/** The footprint radius of a map NPC, by what it is */
export function footprintOf(n: FootprintNpc): number {
  if (n.id === "npc-void-monolith") return FOOTPRINT.core;
  if (n.id.startsWith("npc-gate-")) return FOOTPRINT.gate;
  if (n.id.startsWith("legend-")) return FOOTPRINT.legendary;
  switch (n.category) {
    case "boss":
      return FOOTPRINT.boss;
    case "kingdom":
      return FOOTPRINT.realm;
    case "terrain":
      return FOOTPRINT.landmark;
    case "resource":
      return FOOTPRINT.resource;
    case "treasure":
      return FOOTPRINT.treasure;
    case "mob":
    case "bandit":
      return FOOTPRINT.encounter[(n.rarity ?? "common") as keyof typeof FOOTPRINT.encounter] ?? FOOTPRINT.encounter.common;
    default:
      return FOOTPRINT.landmark;
  }
}

/** Room left between a footprint at (x, z) of radius r and the nearest one in `occupied` (≥ 0: it fits) */
export function roomAt(occupied: Footprint[], x: number, z: number, r: number): number {
  let room = Infinity;
  for (const o of occupied) room = Math.min(room, Math.hypot(o.x - x, o.z - z) - o.r - r - FOOTPRINT_MARGIN);
  return room;
}
