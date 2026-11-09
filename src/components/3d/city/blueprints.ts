import { BuildingType, CivilizationType, DeveloperKingdom } from "@/types";
import { RED_STAR_FROM } from "@/utils/castle";
import { Rng, mulberry32, rngFor, range, pick } from "@/utils/random";
import { Builder, SceneOut, AnimalKind, PersonRole, Motion, Gesture, Part, PlotFx, Shape, Surface, emptyScene, IDLE_KIND } from "./parts";
import { CivPalette, PALETTES, FOLK, CIV_ANIMALS, CIV_FLOWERS } from "./palette";
import { CityLayout, PlotPlacement, Rect, effectiveLevel, PLAZA_HALF, ROAD_HALF } from "./layout";
import { FireSite, FIRE_GLOW } from "@/components/3d/FireFx";
import type { TierFxItem } from "@/components/3d/TierFx";
import { along, arc, coins, lanternFrame, wheel, Add, AddOpts, V3 } from "@/components/3d/world/kitParts";
import { bale, seedPhase } from "./structureKit";
import { shade } from "@/components/3d/world/spawnModels";
import { HUMAN_DRAWERS } from "./humanStructures";
import { ELF_DRAWERS } from "./elfStructures";
import { DWARF_DRAWERS } from "./dwarfStructures";
import { ORC_DRAWERS } from "./orcStructures";
import { ARCANE_DRAWERS } from "./arcaneStructures";

/* ========================================================================= */
/* LEVEL RECIPES                                                             */
/* ========================================================================= */

/**
 * How many structures of each tier a building has at every level.
 * Tier 0 = hut / tent / crop patch / pen, tier 1 = house / barracks / field / stable,
 * tier 2 = manor / watchtower / barn, tier 3 = great hall / keep / windmill / ranch.
 * Lv26–30 (the Archon of the Realm's buildings only) add one Tier 4 "Celestial" structure on top (CELESTIAL_FROM).
 */
const TIER_COUNTS: Array<[number, number, number, number]> = [
  [1, 0, 0, 0], // 1
  [2, 0, 0, 0], // 2
  [3, 0, 0, 0], // 3
  [0, 1, 0, 0], // 4
  [1, 1, 0, 0], // 5
  [2, 1, 0, 0], // 6
  [0, 2, 0, 0], // 7
  [1, 2, 0, 0], // 8
  [2, 2, 0, 0], // 9
  [0, 3, 0, 0], // 10
  [1, 3, 0, 0], // 11
  [0, 1, 1, 0], // 12
  [0, 2, 1, 0], // 13
  [1, 2, 1, 0], // 14
  [0, 3, 1, 0], // 15
  [1, 3, 1, 0], // 16
  [0, 2, 2, 0], // 17
  [0, 3, 2, 0], // 18
  [1, 3, 2, 0], // 19
  [0, 2, 0, 1], // 20
  [0, 3, 0, 1], // 21
  [0, 2, 1, 1], // 22
  [0, 3, 1, 1], // 23
  [0, 2, 2, 1], // 24
  [0, 3, 2, 1], // 25
  [0, 2, 1, 1], // 26 (+ a Celestial structure from here on)
  [0, 2, 2, 1], // 27
  [0, 3, 1, 1], // 28
  [0, 3, 2, 1], // 29
  [0, 3, 2, 1] // 30
];

/** Buildings from this level get a Tier 4 Celestial structure (Sky Palace, Hanging Gardens, Griffin Roost, Seraph Bastion) */
export const CELESTIAL_FROM = 26;

/** Footprint [w, d] of the Celestial structure */
const CELESTIAL_SIZE: [number, number] = [5.6, 5.0];

interface Features {
  fence: boolean;
  path: boolean;
  well: boolean;
  garden: boolean;
  lamps: boolean;
  statue: boolean;
  wall: boolean;
  towers: number;
}

/** Extra land details unlocked as the building levels up (they never disappear once earned) */
function featuresFor(level: number): Features {
  return {
    fence: level >= 8 && level < 20,
    path: level >= 9,
    well: level >= 11,
    garden: level >= 13,
    lamps: level >= 16,
    statue: level >= 19,
    wall: level >= 20,
    towers: level >= 24 ? 4 : level >= 22 ? 2 : 0
  };
}

/** Footprint [w, d] of each tier per building type */
const UNIT_SIZE: Record<BuildingType, Array<[number, number]>> = {
  residential_commercial: [[1.7, 1.7], [2.6, 2.2], [3.4, 2.9], [5, 4.2]],
  food_field: [[2.2, 2.2], [3.2, 2.7], [3.2, 2.6], [3.4, 3.4]],
  animal_field: [[2.4, 2.4], [2.9, 2.4], [3.4, 3.0], [5, 4.2]],
  soldier_building: [[1.7, 1.7], [2.9, 2.1], [2.2, 2.2], [5, 4.2]]
};

/* ========================================================================= */
/* PLOT SPACE (collision-free placement inside a plot)                       */
/* ========================================================================= */

class PlotSpace {
  rects: Rect[] = [];
  structures: Rect[] = [];

  constructor(public half: number, public margin: number) {}

  inBounds(x: number, z: number, w: number, d: number) {
    const lim = this.half - this.margin;
    return Math.abs(x) + w / 2 <= lim && Math.abs(z) + d / 2 <= lim;
  }

  free(x: number, z: number, w: number, d: number, gap: number) {
    if (!this.inBounds(x, z, w, d)) return false;
    for (const r of this.rects) {
      if (Math.abs(x - r.x) * 2 < w + r.w + gap * 2 && Math.abs(z - r.z) * 2 < d + r.d + gap * 2) return false;
    }
    return true;
  }

  reserve(r: Rect, structure = true) {
    this.rects.push(r);
    if (structure) this.structures.push(r);
  }

  /** Deterministic best-scoring spot on a 0.5 grid */
  best(w: number, d: number, score: (x: number, z: number) => number, gap = 0.35): { x: number; z: number } | null {
    const lim = this.half - this.margin;
    let bestSpot: { x: number; z: number } | null = null;
    let bestScore = Infinity;
    for (let x = -lim + w / 2; x <= lim - w / 2 + 1e-6; x += 0.5) {
      for (let z = -lim + d / 2; z <= lim - d / 2 + 1e-6; z += 0.5) {
        if (!this.free(x, z, w, d, gap)) continue;
        const s = score(x, z);
        if (s < bestScore) {
          bestScore = s;
          bestSpot = { x, z };
        }
      }
    }
    return bestSpot;
  }

  random(rng: Rng, w: number, d: number, reserve = true, gap = 0.12, tries = 30): { x: number; z: number } | null {
    const lim = this.half - this.margin;
    for (let i = 0; i < tries; i++) {
      const x = range(rng, -lim + w / 2, lim - w / 2);
      const z = range(rng, -lim + d / 2, lim - d / 2);
      if (this.free(x, z, w, d, gap)) {
        if (reserve) this.reserve({ x, z, w, d }, false);
        return { x, z };
      }
    }
    return null;
  }

  segmentClear(ax: number, az: number, bx: number, bz: number) {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      for (const r of this.structures) {
        if (Math.abs(x - r.x) * 2 < r.w + 0.3 && Math.abs(z - r.z) * 2 < r.d + 0.3) return false;
      }
    }
    return true;
  }
}

/* ========================================================================= */
/* SHARED PIECES                                                             */
/* ========================================================================= */

export interface Ctx {
  civ: CivilizationType;
  pal: CivPalette;
  rng: Rng;
  type: BuildingType;
  species: AnimalKind;
  budget: { people: number; animals: number };
  /** 0–1 from the developer's commit streak: livelier townsfolk walk faster */
  lively: number;
}

/** Commit streak → liveliness, full at a two-week streak */
const livelinessFor = (streakDays: number) => Math.min(1, Math.max(0, streakDays) / 14);

export const DOOR = "#3b2a1a";

function roof(b: Builder, ctx: Ctx, x: number, y0: number, z: number, w: number, d: number, h: number, color: string) {
  const { pal } = ctx;
  switch (ctx.civ) {
    case "human":
      b.add("prism", x, y0, z, w + 0.3, h, d + 0.3, color);
      break;
    case "elf": {
      const r = Math.max(w, d) * 1.2;
      b.add("cone", x, y0, z, r, h * 1.35, r, color);
      break;
    }
    case "dwarf":
      b.add("box", x, y0, z, w + 0.3, 0.22, d + 0.3, pal.stone);
      b.add("pyramid", x, y0 + 0.22, z, w * 0.85, h * 0.55, d * 0.85, color);
      break;
    case "orc":
      b.add("pyramid", x, y0, z, w + 0.35, h * 1.35, d + 0.35, color);
      b.add("cone", x - w / 2, y0 - 0.1, z + d / 2 + 0.1, 0.14, 0.7, 0.14, pal.bone, { rx: 0.5, rz: 0.4 });
      b.add("cone", x + w / 2, y0 - 0.1, z + d / 2 + 0.1, 0.14, 0.7, 0.14, pal.bone, { rx: 0.5, rz: -0.4 });
      break;
    case "arcane":
      b.add("pyramid", x, y0, z, w + 0.2, h * 1.25, d + 0.2, color);
      b.add("octa", x, y0 + h * 1.25 + 0.3, z, 0.3, 0.42, 0.3, pal.accent, { glow: true });
      break;
  }
}

function fenceLine(b: Builder, x1: number, z1: number, x2: number, z2: number, color: string, palisade: boolean) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.2) return;
  const ry = Math.atan2(-dz, dx);
  if (palisade) {
    const n = Math.max(2, Math.round(len / 0.32));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x1 + dx * t;
      const z = z1 + dz * t;
      b.add("cyl", x, 0, z, 0.15, 0.75, 0.15, color, { mat: "wood" });
      b.add("cone", x, 0.75, z, 0.15, 0.25, 0.15, color, { mat: "wood" });
      if (i % 2) b.add("cyl", x, 0.45, z, 0.19, 0.05, 0.19, "#a1784a", hdo("cloth"));
    }
    return;
  }
  const mx = (x1 + x2) / 2;
  const mz = (z1 + z2) / 2;
  b.add("box", mx, 0.2, mz, len, 0.06, 0.06, color, { ry, mat: "wood" });
  b.add("box", mx, 0.42, mz, len, 0.06, 0.06, color, { ry, mat: "wood" });
  const posts = Math.max(1, Math.round(len / 0.9));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    b.add("box", x1 + dx * t, 0, z1 + dz * t, 0.1, 0.55, 0.1, color, { mat: "wood" });
    // HD: a pointed cap on each post
    b.add("pyramid", x1 + dx * t, 0.55, z1 + dz * t, 0.12, 0.08, 0.12, color, hdo("wood", { ry }));
  }
}

/** Square fence of half-size e with an optional gap in the front (+Z) side */
function perimeter(b: Builder, e: number, gap: number, line: (x1: number, z1: number, x2: number, z2: number) => void) {
  line(-e, -e, e, -e);
  line(-e, -e, -e, e);
  line(e, -e, e, e);
  if (gap > 0) {
    line(-e, e, -gap / 2, e);
    line(gap / 2, e, e, e);
  } else {
    line(-e, e, e, e);
  }
}

export function person(b: Builder, ctx: Ctx, role: PersonRole, x: number, z: number, motion: Motion, x2?: number, z2?: number) {
  const { rng, civ } = ctx;
  const f = FOLK[civ];
  const colors =
    role === "soldier"
      ? [pick(rng, f.armour), pick(rng, f.skins), pick(rng, f.helmOrHood), pick(rng, f.accents)]
      : role === "farmer"
        ? [pick(rng, f.clothes), pick(rng, f.skins), pick(rng, f.farmerHats), pick(rng, f.accents)]
        : [pick(rng, f.clothes), pick(rng, f.skins), pick(rng, f.hair), pick(rng, f.accents)];
  b.actor({ kind: `${role}_${civ}`, x, y: 0, z, x2, z2, yaw: rng() * Math.PI * 2, motion, speed: range(rng, 0.45, 0.8) * (0.7 + 0.8 * ctx.lively), phase: rng() * 10, colors });
}

export const ANIMAL_COLORS: Record<AnimalKind, (rng: Rng, civ: CivilizationType) => string[]> = {
  sheep: (rng, civ) =>
    civ === "arcane" ? [pick(rng, ["#c4b5fd", "#a78bfa", "#ddd6fe"]), "#1e1b4b"] : [rng() < 0.12 ? "#3f3f46" : "#f5f5f4", "#27272a"],
  cow: (rng) => (rng() < 0.5 ? ["#f5f5f4", "#3f3f46"] : ["#92400e", "#451a03"]),
  pig: () => ["#f9a8d4", "#f472b6"],
  chicken: (rng) => [rng() < 0.4 ? "#d97706" : "#ffffff", "#ef4444"],
  deer: (rng) => [pick(rng, ["#a16207", "#b45309", "#92400e"]), "#78350f"],
  stag: (rng) => [pick(rng, ["#e0e7ff", "#c7d2fe", "#ddd6fe"]), "#4c1d95", pick(rng, ["#67e8f9", "#e879f9"])],
  horse: (rng) => [pick(rng, ["#f8fafc", "#e5e7eb", "#a16207", "#78350f"]), pick(rng, ["#f5f0d0", "#1c1917"])],
  pony: (rng) => [pick(rng, ["#d6b25e", "#78350f", "#a8a29e"]), "#3f2a1a"],
  rabbit: (rng) => [pick(rng, ["#f5f5f4", "#d6d3d1", "#a8a29e", "#92400e"]), "#ffffff"],
  swan: () => ["#ffffff", "#f97316"],
  goose: (rng) => [pick(rng, ["#d6d3d1", "#9ca3af", "#f5f5f4"]), "#f59e0b"],
  goat: (rng) => [pick(rng, ["#f5f5f4", "#a8a29e", "#78716c", "#57534e"]), "#44403c"],
  boar: (rng) => [pick(rng, ["#57534e", "#44403c", "#78350f"]), "#292524"],
  wolf: (rng) => [pick(rng, ["#6b7280", "#44403c", "#a8a29e", "#1c1917"]), "#292524"],
  lizard: (rng) => [pick(rng, ["#4d7c0f", "#65a30d", "#a16207", "#365314"]), pick(rng, ["#dc2626", "#facc15"])],
  crow: () => ["#1c1917"],
  griffin: (rng) => [pick(rng, ["#fbbf24", "#f5f5f4"])],
  cat: (rng) => [pick(rng, ["#1c1917", "#f5f5f4", "#d97706", "#57534e", "#312e81"])],
  owl: (rng) => [pick(rng, ["#a8a29e", "#78716c", "#f5f5f4", "#d6d3d1"])]
};

const PECKERS = new Set<AnimalKind>(["chicken", "swan", "goose", "crow"]);

export function animal(b: Builder, ctx: Ctx, kind: AnimalKind, x: number, z: number) {
  const { rng, civ } = ctx;
  b.actor({
    kind,
    x,
    y: 0,
    z,
    yaw: rng() * Math.PI * 2,
    motion: PECKERS.has(kind) ? "peck" : kind === "owl" ? "idle" : "graze",
    speed: range(rng, 0.3, 0.6),
    phase: rng() * 10,
    colors: ANIMAL_COLORS[kind](rng, civ)
  });
}

/** A tree in the civilization's style. HD: a trunk with a root flare and a leafy crown (the Nethergarde one's crystal) */
export function tree(b: Builder, ctx: Ctx, x: number, z: number, s = 1) {
  const { pal, rng } = ctx;
  const k = s * range(rng, 0.85, 1.2);
  const bark: AddOpts = { mat: "wood", hdShape: "trunk" };
  const crown: AddOpts = { mat: "leaf", hdShape: "canopy" };
  switch (ctx.civ) {
    case "elf":
      b.add("cyl", x, 0, z, 0.14 * k, 1.0 * k, 0.14 * k, pal.trunk, bark);
      b.add("cone", x, 0.7 * k, z, 0.95 * k, 1.7 * k, 0.95 * k, pal.foliage, { mat: "leaf" });
      break;
    case "dwarf":
      b.add("cyl", x, 0, z, 0.16 * k, 0.4 * k, 0.16 * k, pal.trunk, bark);
      b.add("cone", x, 0.35 * k, z, 1.05 * k, 1.0 * k, 1.05 * k, pal.foliage, { mat: "leaf", hdShape: "pine" });
      b.add("cone", x, 0.95 * k, z, 0.75 * k, 0.8 * k, 0.75 * k, pal.foliage2, { mat: "leaf", hdShape: "pine" });
      break;
    case "orc":
      b.add("cyl", x, 0, z, 0.16 * k, 0.9 * k, 0.16 * k, pal.trunk, bark);
      b.add("cyl", x + 0.18 * k, 0.6 * k, z, 0.07 * k, 0.6 * k, 0.07 * k, pal.trunk, { rz: -0.7, mat: "wood" });
      b.add("sphere", x, 0.8 * k, z, 0.7 * k, 0.5 * k, 0.7 * k, pal.foliage, crown);
      break;
    case "arcane":
      b.add("cyl", x, 0, z, 0.12 * k, 0.8 * k, 0.12 * k, pal.trunk, bark);
      b.add("octa", x, 0.6 * k, z, 0.8 * k, 1.1 * k, 0.8 * k, pal.foliage, { mat: "gem" });
      b.add("octa", x, 1.75 * k, z, 0.22, 0.3, 0.22, pal.accent, { glow: true });
      break;
    default:
      b.add("cyl", x, 0, z, 0.18 * k, 0.7 * k, 0.18 * k, pal.trunk, bark);
      b.add("sphere", x, 0.55 * k, z, 1.05 * k, 0.95 * k, 1.05 * k, pal.foliage, crown);
      b.add("sphere", x + 0.15 * k, 1.1 * k, z - 0.1 * k, 0.7 * k, 0.65 * k, 0.7 * k, pal.foliage2, crown);
  }
}

/** Civilization-styled tower used by manors, great halls and plot corners (bottom at y=0) */
function civTower(b: Builder, ctx: Ctx, x: number, z: number, r: number, h: number) {
  const { pal, civ } = ctx;
  // HD: its materials, a cornice or band under its roof, arrow slits, lashings on the orc posts
  switch (civ) {
    case "elf":
      b.add("cyl", x, 0, z, r * 0.8, h * 1.15, r * 0.8, pal.wall, { mat: "plain" });
      b.add("cone", x, h * 1.15, z, r * 1.05, h * 0.6, r * 1.05, pal.roof, { mat: "leaf" });
      b.add("octa", x, h * 1.75 + 0.05, z, 0.22, 0.3, 0.22, pal.accent, { glow: true });
      for (const y of [h * 0.35, h * 0.95]) b.add("cyl", x, y, z, r * 0.8 + 0.1, 0.07, r * 0.8 + 0.1, "#cbd5e1", hdo("steel"));
      break;
    case "dwarf":
      b.add("box", x, 0, z, r, h * 0.85, r, pal.stone, { mat: "masonry" });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("box", x + sx * r * 0.36, h * 0.85, z + sz * r * 0.36, r * 0.26, 0.3, r * 0.26, pal.stone, { mat: "masonry" });
      b.add("box", x, h * 0.85, z, r * 0.3, 0.2, r * 0.3, pal.accent, { glow: true });
      b.add("box", x, h * 0.85 - 0.22, z, r + 0.12, 0.16, r + 0.12, pal.stone, hdo("masonry"));
      for (const s of [-1, 1]) {
        b.add("box", x + s * (r / 2 + 0.02), h * 0.4, z, 0.1, 0.42, 0.12, "#1c1917", hdo("stone"));
        b.add("box", x, h * 0.4, z + s * (r / 2 + 0.02), 0.12, 0.42, 0.1, "#1c1917", hdo("stone"));
      }
      break;
    case "orc":
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          b.add("box", x + sx * r * 0.36, 0, z + sz * r * 0.36, 0.12, h * 0.9, 0.12, pal.wood, { mat: "wood" });
          for (const y of [h * 0.3, h * 0.56]) b.add("cyl", x + sx * r * 0.36, y, z + sz * r * 0.36, 0.2, 0.06, 0.2, "#a1784a", hdo("cloth"));
        }
      b.add("box", x, h * 0.62, z, r, 0.14, r, pal.wood, { mat: "wood" });
      b.add("pyramid", x, h * 0.9, z, r * 1.2, h * 0.4, r * 1.2, pal.roof, { mat: "hide" });
      b.add("cone", x + r * 0.5, h * 0.9, z + r * 0.5, 0.1, 0.45, 0.1, pal.bone, { rx: 0.6, rz: -0.6, mat: "bone" });
      b.add("cone", x - r * 0.5, h * 0.9, z + r * 0.5, 0.1, 0.45, 0.1, pal.bone, { rx: 0.6, rz: 0.6, mat: "bone" });
      break;
    case "arcane":
      b.add("cyl", x, 0, z, r * 0.85, h, r * 0.7, pal.stone, { mat: "masonry" });
      b.add("cone", x, h, z, r * 0.95, h * 0.35, r * 0.95, pal.roof, { mat: "tiles" });
      b.add("octa", x, h * 1.45, z, r * 0.35, r * 0.6, r * 0.35, pal.accent, { glow: true });
      b.add("cyl", x, h - 0.22, z, r * 0.85 + 0.14, 0.16, r * 0.7 + 0.14, "#a5b4fc", hdo("steel"));
      break;
    default:
      b.add("cyl", x, 0, z, r, h, r, pal.stone, { mat: "masonry" });
      b.add("cone", x, h, z, r * 1.3, h * 0.33, r * 1.3, pal.roof, { mat: "tiles" });
      b.add("cyl", x, h - 0.26, z, r + 0.16, 0.2, r + 0.16, pal.stone, hdo("masonry"));
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.PI / 4;
        b.add("box", x + Math.sin(a) * (r / 2), h * 0.45, z + Math.cos(a) * (r / 2), 0.1, 0.42, 0.1, "#1c1917", hdo("stone", { ry: a }));
      }
      b.add("sphere", x, h + h * 0.33 - 0.06, z, 0.16, 0.16, 0.16, "#3f3f46", hdo("iron"));
  }
}

/* ========================================================================= */
/* SHARED UNIT PIECES (each civilization's structures: humanStructures.ts … arcaneStructures.ts) */
/* ========================================================================= */

type Crop = "wheat" | "cabbage" | "pumpkin" | "berries" | "herbs" | "orchard" | "mushroom" | "potato" | "hops" | "gourd" | "meat" | "crystal" | "lotus";

const CIV_CROPS: Record<CivilizationType, Crop[]> = {
  human: ["wheat", "wheat", "cabbage", "pumpkin"],
  elf: ["berries", "herbs", "orchard"],
  dwarf: ["mushroom", "potato", "hops"],
  orc: ["gourd", "meat", "gourd"],
  arcane: ["crystal", "lotus", "crystal"]
};

/** A crop patch of the civilization's crops; `glow` lights the magical ones (Elf herbs, Nethergarde crystals and lotus) */
export function cropPatch(b: Builder, ctx: Ctx, w: number, d: number, glow = false) {
  const { pal, rng, civ } = ctx;
  const crop = pick(rng, CIV_CROPS[civ]);
  const lotus = crop === "lotus";
  // HD: tilled earth, leafy crops, glossy gourds and pumpkins, a stone pond with wet water
  b.add("box", 0, 0, 0, w, 0.08, d, lotus ? pal.stone : pal.soil, { mat: lotus ? "masonry" : "hide" });
  const rows = Math.max(3, Math.round(d / 0.45));
  const rowZ = (i: number) => -d / 2 + ((i + 0.5) * d) / rows;
  const along = (spacing: number, fn: (x: number, z: number) => void) => {
    const n = Math.max(1, Math.floor((w * 0.86) / spacing));
    for (let i = 0; i < rows; i++) for (let k = 0; k < n; k++) fn(-w * 0.43 + (k + 0.5) * ((w * 0.86) / n), rowZ(i));
  };

  switch (crop) {
    case "wheat": {
      const c = pick(rng, ["#e2b53a", "#cfa93b", "#d4a017"]);
      for (let i = 0; i < rows; i++) b.add("box", 0, 0.08, rowZ(i), w * 0.86, 0.26, 0.2, c, { mat: "leaf" });
      break;
    }
    case "cabbage":
      along(0.38, (x, z) => b.add("sphere", x, 0.06, z, 0.3, 0.24, 0.3, pick(rng, ["#6fb043", "#8fc24a"]), { mat: "leaf" }));
      break;
    case "pumpkin":
      for (let i = 0; i < rows; i++) b.add("box", 0, 0.08, rowZ(i), w * 0.86, 0.06, 0.14, "#4d7c0f", { mat: "leaf" });
      along(0.6, (x, z) => {
        b.add("sphere", x, 0.08, z, 0.34, 0.26, 0.34, "#ea7a1a", { mat: "skin" });
        b.add("cyl", x, 0.32, z, 0.05, 0.08, 0.05, "#4d5e1f", hdo("wood"));
      });
      break;
    case "berries":
      along(0.45, (x, z) => {
        b.add("sphere", x, 0.06, z, 0.38, 0.34, 0.38, "#2f7d4a", { mat: "leaf" });
        b.add("sphere", x + 0.08, 0.32, z + 0.06, 0.09, 0.09, 0.09, pick(rng, ["#dc2626", "#4338ca", "#7c3aed"]), { detail: true, mat: "skin" });
      });
      break;
    case "herbs":
      along(0.3, (x, z) => {
        b.add("cone", x, 0.08, z, 0.16, 0.3, 0.16, "#15803d", { mat: "leaf" });
        b.add("sphere", x, 0.34, z, 0.08, 0.08, 0.08, "#5eead4", { glow, detail: true, mat: "leaf" });
      });
      break;
    case "orchard":
      for (const [x, z] of [
        [-w / 4, -d / 4],
        [w / 4, -d / 4],
        [-w / 4, d / 4],
        [w / 4, d / 4]
      ]) {
        b.add("cyl", x, 0.08, z, 0.1, 0.55, 0.1, pal.trunk, { mat: "wood", hdShape: "trunk" });
        b.add("sphere", x, 0.5, z, 0.62, 0.5, 0.62, pal.foliage, { mat: "leaf", hdShape: "canopy" });
        for (let k = 0; k < 3; k++)
          b.add("sphere", x + range(rng, -0.22, 0.22), 0.6 + range(rng, 0, 0.25), z + 0.25, 0.1, 0.1, 0.1, pick(rng, ["#f59e0b", "#f472b6", "#fde047"]), { detail: true, mat: "skin" });
      }
      break;
    case "mushroom":
      along(0.45, (x, z) => {
        const h = range(rng, 0.2, 0.4);
        b.add("cyl", x, 0.08, z, 0.1, h, 0.1, "#f5f0e1", { mat: "skin", hdShape: "taper" });
        b.add("sphere", x, 0.04 + h, z, 0.34, 0.2, 0.34, pick(rng, ["#b91c1c", "#92400e", "#a16207"]), { mat: "skin" });
      });
      break;
    case "potato":
      for (let i = 0; i < rows; i++) b.add("box", 0, 0.08, rowZ(i), w * 0.86, 0.14, 0.24, "#8b6b4a", { mat: "hide" });
      along(0.32, (x, z) => b.add("sphere", x, 0.2, z, 0.14, 0.1, 0.14, "#65a30d", { detail: true, mat: "leaf" }));
      break;
    case "hops":
      along(0.75, (x, z) => {
        b.add("cyl", x, 0.08, z, 0.05, 1.1, 0.05, pal.wood, { mat: "wood" });
        b.add("cyl", x, 0.3, z, 0.18, 0.75, 0.18, "#84cc16", { mat: "leaf" });
      });
      break;
    case "gourd":
      along(0.48, (x, z) => {
        b.add("sphere", x, 0.08, z, 0.3, 0.26, 0.34, pick(rng, ["#65a30d", "#a3a032", "#4d7c0f"]), { mat: "skin", hdShape: "egg" });
        b.add("cone", x, 0.3, z, 0.05, 0.12, 0.05, pal.bone, { detail: true, mat: "wood" });
      });
      break;
    case "meat":
      // Drying rack hung with meat, beside a cooking fire
      for (const sx of [-1, 1]) b.add("cyl", sx * w * 0.35, 0.08, -d * 0.2, 0.07, 1.2, 0.07, pal.wood, { mat: "wood" });
      b.add("box", 0, 1.2, -d * 0.2, w * 0.74, 0.06, 0.06, pal.wood, { mat: "wood" });
      for (let k = 0; k < 4; k++) {
        b.add("box", -w * 0.27 + k * w * 0.18, 0.75, -d * 0.2, 0.16, 0.42, 0.08, pick(rng, ["#991b1b", "#7f1d1d", "#b45309"]), { mat: "hide", hdShape: "drop" });
        b.add("cyl", -w * 0.27 + k * w * 0.18, 1.0, -d * 0.2, 0.02, 0.22, 0.02, "#a1784a", hdo("cloth"));
      }
      b.add("cone", 0, 0.08, d * 0.22, 0.32, 0.4, 0.32, "#f97316", { glow });
      for (const sx of [-1, 1]) b.add("cyl", sx * 0.35, 0.08, d * 0.22, 0.05, 0.6, 0.05, pal.wood, { mat: "wood" });
      b.add("cyl", 0, 0.66, d * 0.22, 0.04, 0.8, 0.04, pal.wood, { rz: Math.PI / 2, mat: "wood" });
      b.add("sphere", 0, 0.58, d * 0.22, 0.32, 0.18, 0.18, "#92400e", { mat: "skin" });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        b.add("boulder", Math.cos(a) * 0.3, 0.08, d * 0.22 + Math.sin(a) * 0.3, 0.16, 0.1, 0.14, pal.stone, hdo("stone", { ry: a }));
      }
      break;
    case "crystal":
      along(0.42, (x, z) => b.add("octa", x, 0.08, z, 0.14, 0.32, 0.14, pick(rng, ["#c084fc", "#67e8f9", "#e879f9"]), { glow, mat: "gem" }));
      break;
    case "lotus":
      b.add("box", 0, 0.08, 0, w * 0.86, 0.04, d * 0.86, pal.water, { mat: "gel" });
      along(0.55, (x, z) => {
        b.add("cyl", x, 0.1, z, 0.3, 0.03, 0.3, "#15803d", { mat: "leaf" });
        b.add("cone", x, 0.12, z, 0.14, 0.14, 0.14, pick(rng, ["#f0abfc", "#ffffff", "#c4b5fd"]), { glow, mat: "skin" });
      });
      break;
  }
  if (ctx.budget.people > 0) {
    ctx.budget.people--;
    person(b, ctx, "farmer", range(rng, -w / 3, w / 3), range(rng, -d / 3, d / 3), "work");
  }
}


/** A fenced pen with a trough and some of the plot's animals */
export function pen(b: Builder, ctx: Ctx, size = 2.2, animalsInside = 2) {
  const { pal } = ctx;
  perimeter(b, size / 2, 0, (x1, z1, x2, z2) => fenceLine(b, x1, z1, x2, z2, pal.wood, false));
  b.add("box", size / 2 - 0.45, 0, -size / 2 + 0.3, 0.6, 0.2, 0.28, pal.wood, { mat: "wood" });
  b.add("box", size / 2 - 0.45, 0.16, -size / 2 + 0.3, 0.5, 0.05, 0.2, pal.water, { mat: "gel" });
  // HD: the trough on two legs, a bucket by it
  for (const s of [-1, 1]) b.add("box", size / 2 - 0.45 + s * 0.24, 0, -size / 2 + 0.3, 0.06, 0.06, 0.34, pal.wood, hdo("wood"));
  b.add("cyl", size / 2 - 0.92, 0, -size / 2 + 0.32, 0.18, 0.2, 0.18, pal.wood, hdo("wood", { hdShape: "taper", rx: Math.PI }));
  b.add("cyl", size / 2 - 0.92, 0.09, -size / 2 + 0.32, 0.2, 0.03, 0.2, "#3f3f46", hdo("dull"));
  for (let i = 0; i < animalsInside && ctx.budget.animals > 0; i++) {
    ctx.budget.animals--;
    animal(b, ctx, ctx.species, range(ctx.rng, -size / 3, size / 3), range(ctx.rng, -size / 3, size / 3));
  }
}

/* ------------------------- Tier 4: Celestial (Lv26–30) ------------------------- */

const C_MARBLE = "#fafaf9";
const C_MARBLE2 = "#e7e5e4";
const C_GOLD = "#fbbf24";
const C_CRIMSON = "#b91c1c";
const C_BANNER = "#dc2626";
// HD: the Empyrean's palette (gilt fittings, leaded stained glass in crimson and gold, a crimson door)
const C_GILT = "#e0a526";
const C_GILT2 = "#b8860b";
const C_LEAD = "#1c1917";
const C_GLASS = "#dc2626";
const C_GLASS2 = "#fbbf24";
const C_DOOR = "#4c0812";

/**
 * HD: a pointed lancet on a front face at z (its pane 0.07 out of it): leaded stained glass in crimson under a gold
 * head, in a gilt frame whose arms meet over the point, on a marble sill. `leaf`: a door leaf instead of glass, with
 * two gilt bands
 */
function lancet(b: Builder, x: number, y0: number, z: number, w: number, h: number, leaf?: string) {
  const add = b.add.bind(b);
  const pane: AddOpts = leaf ? hdo("wood") : { glow: true, hd: true };
  b.add("box", x, y0, z + 0.03, w, h, 0.08, leaf ?? C_GLASS, pane);
  b.add("cone", x, y0 + h, z + 0.03, w, w * 0.9, 0.08, leaf ?? C_GLASS2, pane);
  // Frames and leading are thin: plain slabs (a bevel would not show, and they are many)
  const g = hdo("gold", { hdShape: "slab" });
  for (const s of [-1, 1]) {
    b.add("box", x + s * (w / 2 + 0.025), y0, z + 0.05, 0.05, h, 0.14, C_GILT, g);
    along(add, "box", [x + s * (w / 2 + 0.025), y0 + h - 0.02, z + 0.05], [x, y0 + h + w * 0.95, z + 0.05], 0.05, 0.14, C_GILT, g);
  }
  if (leaf) {
    for (const k of [0.25, 0.65]) b.add("box", x, y0 + h * k, z + 0.09, w - 0.04, 0.05, 0.04, C_GILT, g);
    return;
  }
  b.add("box", x, y0 - 0.06, z + 0.07, w + 0.16, 0.06, 0.18, C_MARBLE, hdo("masonry", { hdShape: "slab" })); // sill
  // The leading: a mullion and two transoms
  const lead = hdo("iron", { hdShape: "slab" });
  b.add("box", x, y0, z + 0.08, 0.025, h, 0.06, C_LEAD, lead);
  for (const k of [0.36, 0.7]) b.add("box", x, y0 + h * k, z + 0.08, w, 0.025, 0.06, C_LEAD, lead);
}

/**
 * HD: a crimson banner in cloth (hanging from a rod, or streaming from a pole at `pivot`) with a gilt hem along its
 * foot. The hem rides the banner's flutter: the same anchor (the pole, the banner's foot) and phase
 */
function celestialBanner(b: Builder, x: number, y0: number, z: number, w: number, h: number, d: number, pivot: [number, number]) {
  const o: AddOpts = { idle: IDLE_KIND.flutter, pivot, phase: seedPhase(b, pivot[0], pivot[1]) };
  b.add("box", x, y0, z, w, h, d, C_BANNER, hdo("cloth", o));
  b.add("box", x, y0 - 0.02, z, w + (w < d ? 0.03 : 0.04), 0.14, d + (w < d ? 0.04 : 0.02), C_GILT, hdo("cloth", o));
}

/** HD: gilt ribs over a dome (centre c, radius ru round and rv up), in `n` vertical planes of `seg` segments */
function domeRibs(b: Builder, c: V3, ru: number, rv: number, n: number, w: number, seg = 9) {
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI;
    arc(b.add.bind(b), c, [Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [ru, rv], 0.12, Math.PI - 0.12, seg, w, C_GILT2, hdo("gold"));
  }
}

/** Sky Palace: terraces raised on marble pillars, crowned with gold domes */
function skyPalace(b: Builder, ctx: Ctx) {
  b.add("box", 0, 0, 0, 5.2, 0.5, 4.6, C_MARBLE2, { mat: "masonry" });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("cyl", sx * 2.1, 0.5, sz * 1.8, 0.35, 2.2, 0.35, C_MARBLE, { mat: "masonry" });
  b.add("box", 0, 2.7, 0, 4.6, 0.35, 4.0, "#f5f5f4", { mat: "masonry" });
  b.add("box", 0, 2.75, 0, 4.8, 0.12, 4.2, C_GOLD, { mat: "gold" });
  b.add("box", 0, 3.05, 0, 3.0, 1.8, 2.6, C_MARBLE, { mat: "masonry" });
  for (const x of [-0.8, 0.8]) b.add("box", x, 3.6, 1.33, 0.4, 0.6, 0.06, ctx.pal.window, { glow: true, hd: false });
  b.add("box", 0, 4.85, 0, 3.6, 0.3, 3.2, "#f5f5f4", { mat: "masonry" });
  b.add("sphere", 0, 5.15, 0, 1.8, 1.4, 1.8, C_GOLD, { mat: "gold" });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("sphere", sx * 1.3, 5.15, sz * 1.1, 0.7, 0.6, 0.7, C_GOLD, { mat: "gold" });
  b.add("cone", 0, 6.5, 0, 0.3, 1.1, 0.3, C_CRIMSON, { mat: "tiles" });
  b.add("octa", 0, 7.55, 0, 0.3, 0.45, 0.3, C_GOLD, { glow: true });
  skyPalaceHd(b);
}

/**
 * HD: a grand stair up to the base, a colonnade of ten pillars with moulded bases and gilt capitals, a balustrade round
 * the terrace with gilt finials on its corner piers, stained-glass lancets on every face of the hall and a crimson
 * portal in a gilt frame, gilt string courses, ribbed domes with lanterns, gilt ribs up the spire, banners in cloth
 */
function skyPalaceHd(b: Builder) {
  const add = b.add.bind(b);
  const stone = hdo("masonry");
  b.add("box", 0, 0, 2.35, 1.8, 0.34, 0.1, C_MARBLE2, stone);
  b.add("box", 0, 0, 2.45, 1.8, 0.17, 0.1, C_MARBLE2, stone);
  b.add("box", 0, 0.38, 0, 5.3, 0.06, 4.7, C_GILT, hdo("gold"));
  // The colonnade: the four corner pillars and six more between them
  const pillars: Array<[number, number]> = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pillars.push([sx * 2.1, sz * 1.8]);
  for (const sz of [-1, 1]) for (const x of [-0.7, 0.7]) pillars.push([x, sz * 1.8]);
  for (const sx of [-1, 1]) pillars.push([sx * 2.1, 0]);
  pillars.forEach(([x, z], i) => {
    if (i >= 4) b.add("cyl", x, 0.5, z, 0.35, 2.2, 0.35, C_MARBLE, stone);
    b.add("box", x, 0.5, z, 0.5, 0.1, 0.5, C_MARBLE, hdo("plain"));
    b.add("cyl", x, 0.6, z, 0.44, 0.045, 0.44, C_MARBLE, hdo("plain"));
    b.add("cyl", x, 2.495, z, 0.43, 0.045, 0.43, C_GILT, hdo("gold"));
    b.add("box", x, 2.54, z, 0.52, 0.16, 0.52, C_MARBLE, hdo("plain"));
  });
  // The balustrade round the terrace, corner piers with gilt finials
  const top = 3.05;
  const rail = (x1: number, z1: number, x2: number, z2: number) => {
    const n = Math.round(Math.hypot(x2 - x1, z2 - z1) / 0.38);
    for (let k = 1; k < n; k++) b.add("box", x1 + ((x2 - x1) * k) / n, top, z1 + ((z2 - z1) * k) / n, 0.08, 0.24, 0.08, C_MARBLE, hdo("plain", { hdShape: "slab" }));
    b.add("box", (x1 + x2) / 2, top + 0.24, (z1 + z2) / 2, Math.abs(x2 - x1) + 0.12, 0.06, Math.abs(z2 - z1) + 0.12, C_MARBLE, hdo("plain"));
  };
  const [ex, ez] = [2.18, 1.88];
  rail(-ex, ez, ex, ez);
  rail(-ex, -ez, ex, -ez);
  rail(-ex, -ez, -ex, ez);
  rail(ex, -ez, ex, ez);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add("box", sx * ex, top, sz * ez, 0.2, 0.36, 0.2, C_MARBLE, hdo("plain"));
      b.add("sphere", sx * ex, top + 0.36, sz * ez, 0.12, 0.12, 0.12, C_GILT, hdo("gold"));
    }
  }
  // Stained-glass lancets round the hall, a crimson portal in a gilt frame
  for (const x of [-0.8, 0.8]) lancet(b, x, 3.5, 1.3, 0.4, 0.7);
  lancet(b, 0, 3.05, 1.3, 0.56, 0.95, C_DOOR);
  for (const sx of [-1, 1]) {
    const side = b.child(sx * 1.5, 0, (sx * Math.PI) / 2);
    for (const x of [-0.6, 0.6]) lancet(side, x, 3.5, 0, 0.34, 0.7);
  }
  const back = b.child(0, -1.3, Math.PI);
  for (const x of [-0.8, 0, 0.8]) lancet(back, x, 3.5, 0, 0.34, 0.7);
  b.add("box", 0, 4.72, 0, 3.1, 0.06, 2.7, C_GILT, hdo("gold"));
  // Ribbed domes, lanterns on the small ones; a gilt collar and ribs up the crimson spire
  domeRibs(b, [0, 5.85, 0], 0.95, 0.75, 4, 0.05, 7);
  b.add("cyl", 0, 6.46, 0, 0.46, 0.12, 0.46, C_GILT, hdo("gold"));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    along(add, "box", [Math.cos(a) * 0.165, 6.58, Math.sin(a) * 0.165], [Math.cos(a) * 0.035, 7.5, Math.sin(a) * 0.035], 0.03, 0.03, C_GILT, hdo("gold"));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [x, z] = [sx * 1.3, sz * 1.1];
      domeRibs(b, [x, 5.45, z], 0.38, 0.33, 2, 0.035, 5);
      b.add("cyl", x, 5.7, z, 0.16, 0.16, 0.16, C_MARBLE, hdo("plain"));
      b.add("cone", x, 5.86, z, 0.22, 0.16, 0.22, C_GILT, hdo("gold"));
      b.add("sphere", x, 6.0, z, 0.08, 0.08, 0.08, C_GILT, hdo("gold"));
    }
  }
  // Banners hanging from the terrace between the front pillars, on gilt rods
  for (const sx of [-1, 1]) {
    const x = sx * 1.4;
    b.add("box", x, 2.62, 2.16, 0.52, 0.04, 0.04, C_GILT, hdo("gold"));
    celestialBanner(b, x, 1.52, 2.16, 0.42, 1.1, 0.03, [x, 2.16]);
  }
}

/** Hanging Gardens: three planted tiers with vines and waterfalls running down the front */
function hangingGardens(b: Builder, ctx: Ctx) {
  const tiers: Array<[number, number, number]> = [
    [5.2, 4.6, 0],
    [3.8, 3.4, 1.12],
    [2.4, 2.2, 2.24]
  ];
  for (const [w, d, y] of tiers) {
    b.add("box", 0, y, 0, w, 1.0, d, "#d6d3d1", { mat: "masonry" });
    b.add("box", 0, y + 1.0, 0, w - 0.2, 0.12, d - 0.2, ctx.pal.foliage2, { mat: "leaf" });
    // Vines hanging over the front edge
    for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) b.add("box", x, y + 0.25, d / 2 + 0.06, 0.3, 0.7, 0.08, "#15803d", { mat: "leaf" });
    // A waterfall down the middle of each tier
    b.add("box", 0, y, d / 2 + 0.07, 0.6, 1.0, 0.08, "#7dd3fc", { glow: true, hd: false });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("sphere", sx * 1.5, 2.24, sz * 1.3, 0.6, 0.6, 0.6, ctx.pal.foliage, { mat: "leaf", hdShape: "canopy" });
  b.add("sphere", 0, 3.36, 0, 1.2, 0.9, 1.2, C_GOLD, { mat: "gold", hd: false });
  gardensHd(b, ctx, tiers);
}

/**
 * HD: copings and balustrades round each tier, leafy clumps and flowers along the edges, vines hanging down the walls,
 * the falls as water (glossy, moving) pouring over each coping into a basin on the tier below, foam where they land,
 * and a gold pavilion on top: six gilt columns under a ribbed dome with a lantern and a star
 */
function gardensHd(b: Builder, ctx: Ctx, tiers: Array<[number, number, number]>) {
  const add = b.add.bind(b);
  const r = mulberry32(Math.floor(seedPhase(b, 0, 0) * 1e5));
  const WATER = "#5fb4dc";
  const FLOWERS = ["#f472b6", "#fde68a", "#ffffff", "#fb7185"];
  tiers.forEach(([w, d, y], i) => {
    const top = y + 1.12;
    b.add("box", 0, y + 0.94, 0, w + 0.1, 0.12, d + 0.1, C_MARBLE2, hdo("masonry"));
    // A balustrade along the front (open over the fall) and both sides
    const posts = (x1: number, z1: number, x2: number, z2: number) => {
      const n = Math.max(2, Math.round(Math.hypot(x2 - x1, z2 - z1) / 0.42));
      for (let k = 0; k <= n; k++) b.add("box", x1 + ((x2 - x1) * k) / n, y + 1.06, z1 + ((z2 - z1) * k) / n, 0.07, 0.2, 0.07, C_MARBLE, hdo("plain", { hdShape: "slab" }));
      b.add("box", (x1 + x2) / 2, y + 1.26, (z1 + z2) / 2, Math.abs(x2 - x1) + 0.09, 0.05, Math.abs(z2 - z1) + 0.09, C_MARBLE, hdo("plain"));
    };
    const [ex, ez] = [w / 2 - 0.02, d / 2 - 0.02];
    posts(-ex, ez, -0.42, ez);
    posts(0.42, ez, ex, ez);
    for (const s of [-1, 1]) posts(s * ex, -ez + 0.3, s * ex, ez);
    // Leafy clumps along the front edge, flowers among them
    const inner = i < tiers.length - 1 ? tiers[i + 1] : undefined;
    const band = inner ? (d - inner[1]) / 2 : 1.0;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const x = s * (0.75 + k * ((w / 2 - 1.0) / 3));
        const z = d / 2 - 0.1 - Math.min(band, 0.6) * 0.5;
        b.add("canopy", x, top - 0.04, z, 0.42 + r() * 0.12, 0.28 + r() * 0.08, 0.32, shade(ctx.pal.foliage, 0.9 + r() * 0.2), hdo("leaf"));
        if (k !== 1) b.add("sphere", x + 0.06, top + 0.18, z + 0.08, 0.09, 0.08, 0.09, FLOWERS[(i + k) % FLOWERS.length], hdo("leaf"));
      }
      // Vines down the wall: strands of leaves, swaying
      for (let k = 0; k < 4; k++) {
        const x = s * (0.55 + k * ((w / 2 - 0.7) / 4)) + (r() - 0.5) * 0.1;
        const len = 0.45 + r() * 0.4;
        along(add, "capsule", [x, y + 1.0, d / 2 + 0.11], [x + (r() - 0.5) * 0.1, y + 1.0 - len, d / 2 + 0.12], 0.09, 0.05, shade("#15803d", 0.85 + r() * 0.3), hdo("leaf", { idle: IDLE_KIND.sway }));
      }
    }
    // The fall: water pouring over the coping and down the wall, foam where it lands
    b.add("box", 0, y, d / 2 + 0.1, 0.56, 1.1, 0.06, WATER, hdo("gel"));
    b.add("box", 0, y + 1.04, d / 2 - 0.05, 0.56, 0.06, 0.3, WATER, hdo("gel"));
    for (const k of [-1, 0, 1]) b.add("sphere", k * 0.18, y - 0.04, d / 2 + 0.2, 0.2, 0.12, 0.16, "#f0f9ff", hdo("gel", { idle: IDLE_KIND.pulse }));
    if (inner) {
      // …into a basin on this tier, fed by the fall from the tier above
      const zc = (inner[1] / 2 + d / 2 - 0.1) / 2;
      const deep = d / 2 - 0.1 - inner[1] / 2;
      b.add("box", 0, top - 0.02, zc, 0.84, 0.08, deep, WATER, hdo("gel"));
      for (const s of [-1, 1]) b.add("box", s * 0.46, top, zc, 0.08, 0.14, deep, C_MARBLE2, hdo("masonry"));
    } else {
      // The top tier's spring runs from under the pavilion to its edge
      b.add("box", 0, top - 0.02, (0.6 + d / 2 - 0.05) / 2, 0.4, 0.08, d / 2 - 0.65, WATER, hdo("gel"));
    }
  });
  // The basin at the foot of the lowest fall
  b.add("box", 0, 0, 2.4, 1.0, 0.08, 0.18, WATER, hdo("gel"));
  b.add("box", 0, 0, 2.48, 1.12, 0.14, 0.04, C_MARBLE2, hdo("masonry"));
  for (const s of [-1, 1]) b.add("box", s * 0.54, 0, 2.4, 0.04, 0.14, 0.2, C_MARBLE2, hdo("masonry"));
  // The pavilion on the top tier: a marble plinth, six gilt columns, an entablature and a ribbed dome with a lantern
  const py = 3.36;
  b.add("cyl", 0, py, 0, 1.7, 0.12, 1.7, C_MARBLE, hdo("masonry"));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    b.add("cyl", Math.cos(a) * 0.7, py + 0.12, Math.sin(a) * 0.7, 0.09, 0.72, 0.09, C_GILT, hdo("gold"));
  }
  b.add("cyl", 0, py + 0.84, 0, 1.6, 0.12, 1.6, C_GILT, hdo("gold"));
  b.add("sphere", 0, py + 0.96 - 0.45, 0, 1.3, 0.9, 1.3, C_GOLD, hdo("gold"));
  domeRibs(b, [0, py + 0.96, 0], 0.68, 0.48, 3, 0.04, 6);
  b.add("cyl", 0, py + 1.38, 0, 0.18, 0.16, 0.18, C_MARBLE, hdo("plain"));
  b.add("cone", 0, py + 1.54, 0, 0.24, 0.24, 0.24, C_GILT, hdo("gold"));
  b.add("octa", 0, py + 1.78, 0, 0.14, 0.2, 0.14, C_GOLD, { glow: true, hd: true });
}

/** Griffin Roost: a crag with a gilded perch and nest; griffins circle overhead and rest on the perches */
function griffinRoost(b: Builder, ctx: Ctx) {
  const { rng } = ctx;
  b.add("cone", 0, 0, 0, 3.2, 3.6, 3.2, "#57534e", { mat: "hide" });
  b.add("cone", 1.4, 0, -1.0, 2.0, 2.6, 2.0, "#78716c", { mat: "hide" });
  b.add("cyl", 0, 3.3, 0, 1.6, 0.25, 1.6, "#a16207", { mat: "wood" });
  b.add("cyl", 0, 3.55, 0, 1.2, 0.35, 1.2, "#d97706", { mat: "fur" });
  for (const x of [-0.18, 0.18]) b.add("sphere", x, 3.75, 0, 0.3, 0.36, 0.3, C_GOLD, { glow: true });
  const perches: Array<[number, number]> = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * 2.2;
    const z = Math.sin(a) * 2.0;
    b.add("cyl", x, 0, z, 0.12, 2.2, 0.12, ctx.pal.wood, { mat: "wood" });
    b.add("box", x, 2.2, z, 0.9, 0.1, 0.1, ctx.pal.wood, { ry: a, mat: "wood" });
    b.add("octa", x, 2.3, z, 0.16, 0.2, 0.16, C_GOLD, { mat: "gold" });
    perches.push([x, z]);
    perchHd(b, x, z, a);
  }
  roostHd(b);
  // Griffins, two resting on perches and three circling the crag: in Normal the animals' instanced bird, gilded and
  // grown; in HD real griffins (actorHd.ts)
  b.actor({ kind: "griffin", x: perches[0][0], y: 2.3, z: perches[0][1], yaw: rng() * Math.PI * 2, motion: "idle", speed: 0.4, phase: rng() * 10, colors: [C_GOLD], scale: 2.6 });
  b.actor({ kind: "griffin", x: perches[1][0], y: 2.3, z: perches[1][1], yaw: rng() * Math.PI * 2, motion: "idle", speed: 0.4, phase: rng() * 10, colors: ["#f5f5f4"], scale: 2.6 });
  for (let i = 0; i < 3; i++) {
    b.actor({
      kind: "griffin",
      x: range(rng, 2.6, 3.6),
      y: range(rng, 5, 6.5),
      z: 0,
      x2: 0,
      z2: 0,
      yaw: 0,
      motion: "circle",
      speed: range(rng, 1.4, 2.0),
      phase: rng() * Math.PI * 2,
      colors: [i === 1 ? "#f5f5f4" : C_GOLD],
      scale: 3
    });
  }
}

/** HD: a carved perch: a stone at its foot, gilt bands up the post, struts under the bar, gilt knobs on its ends */
function perchHd(b: Builder, x: number, z: number, a: number) {
  b.add("boulder", x, 0, z, 0.5, 0.26, 0.44, "#5f5852", hdo("hide", { ry: a }));
  for (const y of [0.55, 1.35, 2.02]) b.add("cyl", x, y, z, 0.17, 0.045, 0.17, C_GILT, hdo("gold"));
  const bar = b.child(x, z, a);
  for (const s of [-1, 1]) {
    bar.add("sphere", s * 0.47, 2.19, 0, 0.12, 0.12, 0.12, C_GILT, hdo("gold"));
    along(bar.add.bind(bar), "cyl", [0, 1.85, 0], [s * 0.3, 2.21, 0], 0.05, 0.05, "#5b3b22", hdo("wood"));
  }
}

/**
 * HD: strata round the crag (ledges of darker and paler rock), rocks jutting from its sides and heaped at its foot,
 * grass on the ledges, a ledge under the nest; the nest woven of twigs round its rim with sticks poking out and white
 * and gold down caught in it, a third egg in real gold
 */
function roostHd(b: Builder) {
  const add = b.add.bind(b);
  const r = mulberry32(Math.floor(seedPhase(b, 0, 0) * 1e5));
  const ROCK = ["#6b645d", "#4a443f"];
  const crags: Array<[number, number, number, number, number[]]> = [
    [0, 0, 1.6, 3.6, [0.7, 1.45, 2.2, 2.85]],
    [1.4, -1.0, 1.0, 2.6, [0.6, 1.3, 1.95]]
  ];
  for (const [cx, cz, base, h, strata] of crags) {
    const rad = (y: number) => base * (1 - y / h);
    strata.forEach((y, k) => {
      b.add("cyl", cx, y, cz, rad(y) * 2 + 0.12, 0.1, rad(y) * 2 + 0.12, ROCK[k % 2], hdo("hide"));
      const ga = r() * Math.PI * 2;
      b.add("canopy", cx + Math.cos(ga) * rad(y), y + 0.08, cz + Math.sin(ga) * rad(y), 0.26, 0.12, 0.2, "#4d7c0f", hdo("leaf"));
      const ja = ga + 2 + r() * 2;
      b.add("boulder", cx + Math.cos(ja) * (rad(y) - 0.05), y - 0.35, cz + Math.sin(ja) * (rad(y) - 0.05), 0.5, 0.36, 0.42, "#5f5852", hdo("hide", { ry: ja }));
    });
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + r() * 0.5;
    const s = 0.45 + r() * 0.35;
    b.add("boulder", Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55, s, s * 0.6, s * 0.85, ROCK[k % 2], hdo("hide", { ry: a }));
  }
  b.add("boulder", 0, 2.8, 0, 1.3, 0.55, 1.2, "#5f5852", hdo("hide"));
  // The nest: rings of twigs round its rim, sticks poking out, down caught in it
  const TWIG = ["#7c4a1a", "#6b3f17", "#8b5a2b"];
  const rings: Array<[number, number]> = [
    [3.42, 0.84],
    [3.66, 0.64],
    [3.84, 0.62]
  ];
  rings.forEach(([y, rr], k) => arc(add, [0, y, 0], [1, 0, 0], [0, 0, 1], rr, k * 0.5, k * 0.5 + Math.PI * 2, 10, 0.08, TWIG[k % 3], hdo("wood")));
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + r() * 0.4;
    const y = 3.35 + r() * 0.45;
    along(add, "cyl", [Math.cos(a) * 0.55, y, Math.sin(a) * 0.55], [Math.cos(a + 0.3) * 1.05, y - 0.12 + r() * 0.2, Math.sin(a + 0.3) * 1.05], 0.035, 0.035, TWIG[k % 3], hdo("wood"));
  }
  for (const [a, c] of [
    [0.8, "#f5f5f4"],
    [2.9, C_GILT],
    [4.6, "#f5f5f4"]
  ] as const) b.add("capsule", Math.cos(a) * 0.55, 3.86, Math.sin(a) * 0.55, 0.08, 0.16, 0.03, c, hdo("fur", { rx: 1.2, ry: -a }));
  b.add("sphere", 0, 3.72, 0.22, 0.26, 0.32, 0.26, C_GILT, hdo("gold", { hdShape: "egg" }));
}

/** Seraph Bastion: a white fortress with a crimson-roofed tower, winged statues by the gate and red-gold banners */
function seraphBastion(b: Builder, ctx: Ctx) {
  b.add("box", 0, 0, 0, 4.6, 2.4, 3.8, "#f5f5f4", { mat: "masonry" });
  b.add("box", 0, 2.3, 0, 4.8, 0.2, 4.0, C_GOLD, { mat: "gold" });
  for (let i = 0; i < 6; i++) {
    const x = -2.0 + i * 0.8;
    for (const z of [-1.7, 1.7]) b.add("box", x, 2.5, z, 0.4, 0.4, 0.4, "#f5f5f4", { mat: "masonry" });
  }
  b.add("cyl", 0, 2.5, -0.3, 1.4, 3.0, 1.4, C_MARBLE, { mat: "masonry" });
  b.add("cone", 0, 5.5, -0.3, 1.8, 1.6, 1.8, C_CRIMSON, { mat: "tiles" });
  b.add("octa", 0, 7.1, -0.3, 0.3, 0.45, 0.3, C_GOLD, { glow: true });
  b.add("box", 0, 0, 1.95, 1.2, 1.6, 0.1, "#7f1d1d", { mat: "wood" });
  // Winged seraph statues flanking the gate
  for (const sx of [-1, 1]) {
    const st = b.child(sx * 1.6, 2.2);
    st.add("box", 0, 0, 0, 0.6, 0.5, 0.6, C_MARBLE2, { mat: "masonry" });
    st.add("cone", 0, 0.5, 0, 0.4, 1.2, 0.4, C_GOLD, { mat: "gold" });
    st.add("sphere", 0, 1.6, 0, 0.3, 0.3, 0.3, C_GOLD, { mat: "gold" });
    for (const wx of [-1, 1]) st.add("box", wx * 0.32, 0.95, -0.05, 0.06, 0.9, 0.55, "#fef3c7", { rz: wx * 0.5, hd: false });
    seraphHd(st);
  }
  // Red banners with gold hems on both flanks
  for (const sx of [-1, 1]) {
    b.add("cyl", sx * 2.45, 0, 1.2, 0.08, 3.2, 0.08, ctx.pal.wood, { hd: false });
    b.add("box", sx * 2.45, 1.7, 1.55, 0.04, 1.2, 0.6, C_BANNER, { hd: false });
    b.add("box", sx * 2.45, 1.62, 1.55, 0.14, 0.16, 0.7, C_GOLD, { hd: false });
  }
  bastionHd(b);
}

/**
 * HD: a seraph statue: a moulded plinth, wings of long gilt feathers raised from the shoulders under cream coverts,
 * arms resting on a sword held point down, a glowing halo behind the head
 */
function seraphHd(st: Builder) {
  const add = st.add.bind(st);
  for (const y of [0, 0.42]) st.add("box", 0, y, 0, 0.68, 0.08, 0.68, C_MARBLE2, hdo("masonry"));
  // Cream coverts, the long feathers paling from gilt at the wing's edge (they read against the white walls)
  const FEATHER = "#fef3c7";
  const QUILLS = ["#f7d77a", "#f2c75c", "#eab543", C_GILT, C_GILT];
  for (const sx of [-1, 1]) {
    const sh: V3 = [sx * 0.08, 1.32, -0.1];
    for (let k = 0; k < 5; k++) {
      const t = 0.22 + k * 0.24;
      const len = 1.0 - k * 0.12;
      const tip: V3 = [sh[0] + sx * Math.sin(t) * len, sh[1] + Math.cos(t) * len, sh[2] - 0.05 - k * 0.035];
      along(add, "capsule", sh, tip, 0.14, 0.03, QUILLS[k], hdo("gold"));
    }
    // Coverts over the feathers' roots
    for (let k = 0; k < 3; k++) {
      const t = 0.4 + k * 0.32;
      along(add, "capsule", [sx * 0.06, 1.3, -0.04], [sx * (0.06 + Math.sin(t) * 0.42), 1.3 + Math.cos(t) * 0.42, -0.04], 0.12, 0.03, FEATHER, hdo("plain"));
    }
    // Arms down to the sword's hilt
    along(add, "capsule", [sx * 0.09, 1.46, 0.03], [sx * 0.035, 1.28, 0.21], 0.07, 0.07, C_GOLD, hdo("gold"));
    st.add("sphere", sx * 0.03, 1.25, 0.23, 0.07, 0.06, 0.07, C_GOLD, hdo("gold"));
  }
  along(add, "blade", [0, 1.15, 0.24], [0, 0.52, 0.27], 0.07, 0.02, "#e5e7eb", hdo("steel"));
  st.add("box", 0, 1.15, 0.24, 0.28, 0.04, 0.05, C_GILT, hdo("gold"));
  st.add("cyl", 0, 1.19, 0.24, 0.035, 0.14, 0.035, C_GILT2, hdo("gold"));
  st.add("sphere", 0, 1.33, 0.24, 0.06, 0.06, 0.06, C_GILT, hdo("gold"));
  arc(add, [0, 1.78, -0.15], [1, 0, 0], [0, 1, 0], 0.2, 0, Math.PI * 2, 12, 0.025, "#fde68a", { glow: true, hd: true }, "cyl");
}

/**
 * HD: a moulded plinth course, cross-shaped arrow slits on every wall, gilt caps on the merlons, jambs and an arch of
 * voussoirs round the gate with the Archon's star in it and a portcullis of iron with gilt spikes, stained-glass lancets
 * round the tower under a gilt band, four dormers on the tiled roof, a gilt collar under the star; the banners in cloth
 * streaming from gilt poles with finials
 */
function bastionHd(b: Builder) {
  const add = b.add.bind(b);
  const stone = hdo("masonry");
  b.add("box", 0, 0, 0, 4.7, 0.3, 3.9, C_MARBLE2, stone);
  const slit = (f: Builder, x: number) => {
    f.add("box", x, 0.95, 0.02, 0.07, 0.55, 0.04, "#292524", hdo("stone", { hdShape: "slab" }));
    f.add("box", x, 1.17, 0.02, 0.24, 0.07, 0.04, "#292524", hdo("stone", { hdShape: "slab" }));
  };
  const front = b.child(0, 1.9);
  for (const x of [-2.0, -0.95, 0.95, 2.0]) slit(front, x);
  for (const sx of [-1, 1]) {
    const side = b.child(sx * 2.3, 0, (sx * Math.PI) / 2);
    for (const x of [-1.0, 0, 1.0]) slit(side, x);
  }
  const back = b.child(0, -1.9, Math.PI);
  for (const x of [-1.4, 0, 1.4]) slit(back, x);
  for (let i = 0; i < 6; i++) for (const z of [-1.7, 1.7]) b.add("box", -2.0 + i * 0.8, 2.9, z, 0.5, 0.06, 0.5, C_GILT, hdo("gold", { hdShape: "slab" }));
  // The gate: jambs, an arch of voussoirs with the star in it, a portcullis
  for (const s of [-1, 1]) b.add("box", s * 0.67, 0, 1.95, 0.14, 1.6, 0.12, C_MARBLE2, stone);
  arc(add, [0, 1.6, 1.95], [1, 0, 0], [0, 1, 0], 0.67, 0, Math.PI, 7, 0.13, C_MARBLE2, stone, "box");
  b.add("octa", 0, 1.84, 1.96, 0.22, 0.26, 0.1, C_GOLD, { glow: true, hd: true });
  for (let k = 0; k < 6; k++) {
    const x = -0.5 + k * 0.2;
    b.add("box", x, 0.1, 2.04, 0.05, 1.5, 0.05, "#3f3f46", hdo("iron", { hdShape: "slab" }));
    b.add("cone", x, 0, 2.04, 0.06, 0.1, 0.06, C_GILT, hdo("gold", { rx: Math.PI }));
  }
  for (const y of [0.55, 1.15]) b.add("box", 0, y, 2.08, 1.12, 0.05, 0.05, "#3f3f46", hdo("iron", { hdShape: "slab" }));
  // The tower: lancets, a gilt band under the roof, dormers on the roof, a gilt collar under the star
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    lancet(b.child(Math.sin(a) * 0.67, -0.3 + Math.cos(a) * 0.67, a), 0, 3.4, 0, 0.26, 0.62);
  }
  b.add("cyl", 0, 5.38, -0.3, 1.5, 0.1, 1.5, C_GILT, hdo("gold"));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const dm = b.child(Math.sin(a) * 0.62, -0.3 + Math.cos(a) * 0.62, a);
    dm.add("box", 0, 5.8, 0, 0.24, 0.26, 0.36, C_MARBLE, stone);
    dm.add("prism", 0, 6.06, 0, 0.4, 0.16, 0.32, C_CRIMSON, hdo("tiles", { ry: Math.PI / 2 }));
    dm.add("box", 0, 5.86, 0.19, 0.12, 0.14, 0.04, C_GLASS2, { glow: true, hd: true });
  }
  b.add("cyl", 0, 6.98, -0.3, 0.2, 0.1, 0.2, C_GILT, hdo("gold"));
  // Banners on gilt poles with finials
  for (const sx of [-1, 1]) {
    const x = sx * 2.45;
    b.add("cyl", x, 0, 1.2, 0.07, 3.2, 0.07, C_GILT, hdo("gold"));
    b.add("sphere", x, 3.14, 1.2, 0.12, 0.12, 0.12, C_GILT, hdo("gold"));
    b.add("cone", x, 3.25, 1.2, 0.06, 0.22, 0.06, C_GILT, hdo("gold"));
    celestialBanner(b, x, 1.7, 1.55, 0.04, 1.2, 0.6, [x, 1.2]);
  }
}

const CELESTIAL_DRAWERS: Record<BuildingType, (b: Builder, ctx: Ctx) => void> = {
  residential_commercial: skyPalace,
  food_field: hangingGardens,
  animal_field: griffinRoost,
  soldier_building: seraphBastion
};

/** Each civilization's structures per district, tier 0 (common) → tier 3 (epic) on the rarity ladder. Looked up when
 * a plot is built (not at load), since the drawer modules import helpers from this one */
const CIV_DRAWERS: Record<CivilizationType, Record<BuildingType, Array<(b: Builder, ctx: Ctx) => void>>> = {
  get human() {
    return HUMAN_DRAWERS;
  },
  get elf() {
    return ELF_DRAWERS;
  },
  get dwarf() {
    return DWARF_DRAWERS;
  },
  get orc() {
    return ORC_DRAWERS;
  },
  get arcane() {
    return ARCANE_DRAWERS;
  }
};

/* ========================================================================= */
/* FEATURES (unlocked land details)                                          */
/* ========================================================================= */

function centerpiece(b: Builder, ctx: Ctx) {
  const { pal } = ctx;
  switch (ctx.type) {
    case "residential_commercial":
      // A well. HD: a rolled lip, a winch between its posts with a rope down to a bucket
      b.add("cyl", 0, 0, 0, 0.9, 0.5, 0.9, pal.stone, { mat: "masonry" });
      b.add("cyl", 0, 0.42, 0, 0.7, 0.06, 0.7, pal.water, { mat: "gel" });
      for (const sx of [-0.4, 0.4]) b.add("box", sx, 0.5, 0, 0.07, 0.8, 0.07, pal.wood, { mat: "wood" });
      b.add("pyramid", 0, 1.25, 0, 1.0, 0.4, 0.7, pal.roof, { mat: "tiles" });
      b.add("cyl", 0, 0.44, 0, 1.0, 0.1, 1.0, pal.stone, hdo("masonry"));
      b.add("cyl", 0, 1.05 - 0.4, 0, 0.07, 0.8, 0.07, pal.wood, hdo("wood", { rz: Math.PI / 2 }));
      b.add("cyl", 0, 0.75, 0, 0.015, 0.3, 0.015, "#a1784a", hdo("cloth"));
      b.add("cyl", 0, 0.62, 0, 0.13, 0.13, 0.13, pal.wood, hdo("wood", { hdShape: "taper", rx: Math.PI }));
      b.add("box", 0.48, 1.0, 0.1, 0.04, 0.04, 0.22, "#3f3f46", hdo("dull"));
      break;
    case "food_field":
    case "animal_field":
      b.add("cyl", 0, 0, 0, 1.15, 0.12, 0.95, pal.stone, { mat: "masonry" });
      b.add("cyl", 0, 0.05, 0, 1.0, 0.1, 0.8, pal.water, { mat: "gel" });
      for (let k = 0; k < 3; k++) b.add("cyl", -0.25 + k * 0.22, 0.12, 0.12 - k * 0.14, 0.16, 0.02, 0.16, "#15803d", hdo("leaf"));
      break;
    case "soldier_building":
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add("sphere", Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38, 0.2, 0.16, 0.2, pal.stone, { mat: "stone", hdShape: "boulder" });
      }
      for (const a of [0.4, 2.5, 4.4]) along(b.add.bind(b), "cyl", [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * 0.04, 0.22, Math.sin(a) * 0.04], 0.07, 0.07, "#3f2a1a", hdo("wood"));
      b.add("cone", 0, 0, 0, 0.35, 0.55, 0.35, "#f97316", { glow: true });
      b.add("cone", 0, 0, 0, 0.18, 0.75, 0.18, "#fde047", { glow: true });
      break;
  }
}

function garden(b: Builder, ctx: Ctx) {
  const { pal, rng } = ctx;
  switch (ctx.type) {
    case "residential_commercial":
      b.add("box", 0, 0, 0, 1.5, 0.14, 0.9, pal.soil, { mat: "hide" });
      for (const s of [-1, 1]) {
        b.add("box", 0, 0, s * 0.48, 1.6, 0.18, 0.08, pal.wood, hdo("wood"));
        b.add("box", s * 0.78, 0, 0, 0.08, 0.18, 0.88, pal.wood, hdo("wood"));
      }
      for (let i = 0; i < 7; i++) {
        const fl = CIV_FLOWERS[ctx.civ];
        b.add("sphere", -0.6 + i * 0.2, 0.14, range(rng, -0.25, 0.25), 0.17, 0.17, 0.17, pick(rng, fl.colors), { detail: true, glow: fl.glow });
      }
      break;
    case "soldier_building":
      // A rack of spears. HD: wooden shafts, iron heads
      b.add("box", 0, 0, 0, 1.4, 0.1, 0.35, pal.wood, { mat: "wood" });
      for (let i = 0; i < 4; i++) {
        b.add("cyl", -0.5 + i * 0.33, 0, 0, 0.05, 1.1, 0.05, "#9ca3af", { rz: 0.12, hd: false });
        along(b.add.bind(b), "cyl", [-0.5 + i * 0.33 + 0.066, 0, 0], [-0.5 + i * 0.33 - 0.052, 0.98, 0], 0.045, 0.045, pal.wood, hdo("wood"));
        along(b.add.bind(b), "blade", [-0.5 + i * 0.33 - 0.051, 0.97, 0], [-0.5 + i * 0.33 - 0.073, 1.15, 0], 0.07, 0.025, "#9ca3af", hdo("iron"));
      }
      b.add("box", 0, 0.85, 0, 1.4, 0.08, 0.08, pal.wood, { mat: "wood" });
      break;
    default:
      for (let i = 0; i < 3; i++) bale(b, pal.thatch, -0.5 + i * 0.5, 0);
  }
}

function statue(b: Builder, ctx: Ctx) {
  const { pal, civ } = ctx;
  if (ctx.type === "soldier_building") {
    b.add("box", 0, 0, 0, 0.5, 0.3, 0.5, pal.stone, { mat: "masonry" });
    b.add("cyl", 0, 0.3, 0, 0.08, 3.0, 0.08, pal.wood, { mat: "wood" });
    b.add("box", 0.42, 2.5, 0, 0.8, 0.55, 0.04, pal.accent, { mat: "cloth" });
    // HD: the rod it hangs from, a finial, a fringe along its foot
    b.add("box", 0.42, 3.05, 0, 0.86, 0.04, 0.04, pal.wood, hdo("wood"));
    b.add("sphere", 0, 3.26, 0, 0.12, 0.12, 0.12, "#d4a017", hdo("gold"));
    b.add("box", 0.42, 2.44, 0, 0.8, 0.06, 0.1, "#d4a017", hdo("cloth"));
    return;
  }
  // Small monument of the civilization's hero on a plinth (top of plinth at y = 0.7)
  const y = 0.7;
  switch (civ) {
    case "elf": {
      // White-stone archer on a mossy plinth
      const c = "#eef2f7";
      b.add("cyl", 0, 0, 0, 0.8, y, 0.8, pal.stone, { mat: "masonry" });
      b.add("cyl", 0, y - 0.06, 0, 0.84, 0.08, 0.84, pal.foliage, { mat: "leaf" });
      b.add("cone", 0, y, 0, 0.32, 0.8, 0.3, c, { mat: "stone" });
      b.add("sphere", 0, y + 0.76, 0, 0.22, 0.24, 0.22, c, { mat: "stone" });
      b.add("sphere", 0, y + 0.74, -0.05, 0.24, 0.32, 0.18, c, { mat: "stone" });
      b.add("box", 0.24, y + 0.2, 0.04, 0.04, 0.95, 0.05, c, { rz: 0.1, mat: "stone" });
      b.add("cyl", 0, 0, 0, 0.92, 0.1, 0.92, pal.stone, hdo("masonry"));
      for (const a of [0.6, 2.2, 3.9, 5.2]) b.add("canopy", Math.cos(a) * 0.36, y - 0.02, Math.sin(a) * 0.36, 0.18, 0.08, 0.14, pal.foliage, hdo("leaf"));
      b.add("octa", 0, y + 1.2, 0, 0.16, 0.24, 0.16, pal.accent, { glow: true });
      break;
    }
    case "dwarf": {
      // Bronze dwarf raising a hammer on an anvil-shaped plinth
      const c = "#b45309";
      b.add("box", 0, 0, 0, 0.8, 0.3, 0.6, pal.stone, { mat: "masonry" });
      b.add("box", 0, 0.3, 0, 0.45, 0.2, 0.4, pal.stone, { mat: "masonry" });
      b.add("box", 0, 0.5, 0, 0.85, 0.2, 0.6, pal.stone, { mat: "masonry" });
      b.add("cyl", 0, y, 0, 0.44, 0.5, 0.4, c, { mat: "iron" });
      b.add("sphere", 0, y + 0.5, 0, 0.26, 0.26, 0.26, c, { mat: "iron" });
      b.add("cone", 0, y + 0.28, 0.2, 0.24, 0.32, 0.14, "#d97706", { rx: Math.PI, mat: "iron" });
      b.add("cyl", 0.3, y + 0.2, 0, 0.05, 0.85, 0.05, "#78350f", { mat: "iron" });
      b.add("box", 0.3, y + 1.0, 0, 0.36, 0.2, 0.2, "#d97706", { mat: "iron" });
      b.add("box", 0, y + 0.02, 0.21, 0.3, 0.12, 0.02, pal.accent, { glow: true });
      break;
    }
    case "orc": {
      // Dark-stone warlord with bone horns over a rock pile
      const c = "#57534e";
      b.add("sphere", -0.15, 0, 0.05, 0.75, 0.55, 0.7, pal.stone, { mat: "hide", hdShape: "boulder" });
      b.add("sphere", 0.2, 0, -0.1, 0.6, 0.5, 0.6, pal.stone, { mat: "hide", hdShape: "boulder" });
      b.add("box", 0, 0.45, 0, 0.6, 0.25, 0.6, pal.stone, { mat: "stone" });
      b.add("box", 0, y, 0, 0.5, 0.62, 0.34, c, { mat: "stone" });
      for (const sx of [-1, 1]) b.add("cone", sx * 0.26, y + 0.55, 0, 0.1, 0.18, 0.1, pal.bone, { mat: "bone" });
      b.add("sphere", 0, y + 0.62, 0.02, 0.3, 0.28, 0.3, c, { mat: "stone" });
      for (const sx of [-1, 1]) b.add("cone", sx * 0.16, y + 0.82, 0, 0.06, 0.26, 0.06, pal.bone, { rz: -sx * 0.7, mat: "bone" });
      b.add("cyl", 0.36, y, 0.05, 0.05, 1.0, 0.05, pal.wood, { mat: "wood" });
      b.add("box", 0.36, y + 0.82, 0.14, 0.04, 0.3, 0.26, "#a8a29e", { mat: "stone" });
      b.add("sphere", 0, y + 0.66, 0.16, 0.08, 0.04, 0.02, "#ef4444", { glow: true });
      break;
    }
    case "arcane": {
      // Obsidian mage with a glowing orb, floating rune ring under the plinth
      const c = "#312e81";
      b.add("cyl", 0, 0.05, 0, 1.0, 0.04, 1.0, pal.accent, { glow: true });
      b.add("cyl", 0, 0, 0, 0.72, y, 0.72, pal.stone, { mat: "masonry" });
      b.add("cone", 0, y, 0, 0.42, 0.85, 0.38, c, { mat: "stone" });
      b.add("sphere", 0, y + 0.82, 0, 0.22, 0.22, 0.22, c, { mat: "stone" });
      b.add("cyl", 0, y + 0.92, 0, 0.42, 0.03, 0.42, c, { mat: "stone" });
      b.add("cone", 0, y + 0.94, -0.02, 0.26, 0.45, 0.26, c, { rx: -0.12, mat: "stone" });
      b.add("cyl", 0.3, y, 0, 0.04, 1.25, 0.04, "#1e1b4b", { mat: "stone" });
      // HD: a silver ring cradling the orb
      arc(b.add.bind(b), [0.3, y + 1.33, 0], [1, 0, 0], [0, 1, 0], 0.11, 0, Math.PI * 2, 8, 0.025, "#a5b4fc", hdo("steel"), "cyl");
      b.add("sphere", 0.3, y + 1.25, 0, 0.16, 0.16, 0.16, pal.accent, { glow: true });
      break;
    }
    default: {
      // Marble knight with sword and shield
      const c = "#d4d4d8";
      b.add("box", 0, 0, 0, 0.8, y, 0.8, pal.stone, { mat: "masonry" });
      b.add("cyl", 0, y, 0, 0.36, 0.75, 0.36, c, { mat: "stone" });
      b.add("sphere", 0, y + 0.75, 0, 0.3, 0.3, 0.3, c, { mat: "stone" });
      b.add("cyl", 0, y + 0.95, 0, 0.32, 0.14, 0.32, "#a1a1aa", { mat: "stone" });
      b.add("box", 0.27, y + 0.3, 0, 0.06, 0.95, 0.06, "#e5e7eb", { rz: -0.25, mat: "stone" });
      b.add("cyl", -0.22, y + 0.2, 0.05, 0.38, 0.05, 0.38, pal.roof, { rz: Math.PI / 2, mat: "stone" });
      // HD: a moulded foot and cornice on the plinth
      b.add("box", 0, 0, 0, 0.92, 0.1, 0.92, pal.stone, hdo("masonry"));
      b.add("box", 0, y - 0.12, 0, 0.9, 0.08, 0.9, pal.stone, hdo("masonry"));
      b.add("octa", 0, y + 1.3, 0, 0.16, 0.24, 0.16, pal.accent, { glow: true });
    }
  }
}

/** A lamp post, or a torch on soldier plots and for the orcs. HD: an iron lantern frame, or a torch head bound in iron */
function lamp(b: Builder, ctx: Ctx, x: number, z: number) {
  const torch = ctx.type === "soldier_building" || ctx.civ === "orc";
  b.add("cyl", x, 0, z, 0.07, 1.25, 0.07, torch ? ctx.pal.wood : "#3f3f46", { mat: torch ? "wood" : "iron" });
  b.add(torch ? "cone" : "box", x, 1.25, z, 0.2, 0.22, 0.2, torch ? "#fb923c" : ctx.pal.window, { glow: true });
  if (torch) {
    b.add("cyl", x, 1.12, z, 0.13, 0.14, 0.13, "#3f3f46", hdo("iron", { hdShape: "taper", rx: Math.PI }));
    return;
  }
  b.add("cyl", x, 0, z, 0.16, 0.1, 0.16, "#3f3f46", hdo("iron"));
  lanternFrame(b.add.bind(b), x, 1.25, z, 0.2, 0.22, "#3f3f46", { mat: "iron" });
}

/* ========================================================================= */
/* PLOT BUILDER                                                              */
/* ========================================================================= */

const PAD_HEIGHT = 0.12;

function padColor(type: BuildingType, pal: CivPalette) {
  switch (type) {
    case "residential_commercial":
      return pal.yard;
    case "soldier_building":
      return pal.dirt;
    default:
      return pal.grass;
  }
}

function buildVacantPlot(out: SceneOut, plot: PlotPlacement, ctx: Ctx) {
  const root = new Builder(out, plot.x, 0, plot.z, plot.rot);
  root.kit = true;
  const { pal, rng } = ctx;
  root.add("box", 0, 0, 0, plot.size, PAD_HEIGHT, plot.size, pal.dirt, { mat: "hide" });
  const b = root.child(0, 0, 0, PAD_HEIGHT);
  b.add("cyl", 0.6, 0, plot.size / 2 - 0.7, 0.08, 0.9, 0.08, pal.wood, { mat: "wood" });
  b.add("box", 0.6, 0.6, plot.size / 2 - 0.66, 0.75, 0.42, 0.06, pal.canvas, { mat: "wood" });
  // HD: the sign hangs on two short chains from an arm
  b.add("box", 0.6, 1.04, plot.size / 2 - 0.66, 0.8, 0.05, 0.05, pal.wood, hdo("wood"));
  for (const s of [-1, 1]) b.add("cyl", 0.6 + s * 0.3, 1.02, plot.size / 2 - 0.66, 0.02, 0.04, 0.02, "#3f3f46", hdo("dull"));
  for (let i = 0; i < 6; i++) {
    b.add("cone", range(rng, -2, 2), 0, range(rng, -2, 2), 0.14, 0.3, 0.14, "#9a8f4a", { detail: true, mat: "fur" });
  }
}

/** Flame colours of the Active Surge aura */
const SURGE_FLAMES = ["#f97316", "#fbbf24", "#ef4444"];
const SURGE_FLAME_W = 0.16;
/** Embers rising over a surging plot */
const SURGE_EMBERS = 2;

/**
 * Active Surge aura: glowing flames standing on the pad's very edge at the corners and the back/side
 * mid-points (never the front, where the path is), outside the fence/wall (which ends at half − 0.15)
 * and clear of the corner towers (half − 0.25).
 */
function surgeAura(b: Builder, half: number, rng: () => number) {
  const e = half - 0.05;
  const spots: Array<[number, number]> = [[-e, -e], [e, -e], [-e, e], [e, e], [0, -e], [-e, 0], [e, 0]];
  spots.forEach(([x, z], i) => {
    const h = 0.75 + rng() * 0.4;
    b.add("cone", x, 0, z, SURGE_FLAME_W, h, SURGE_FLAME_W, SURGE_FLAMES[i % SURGE_FLAMES.length], { glow: true });
  });
  for (let i = 0; i < SURGE_EMBERS; i++) {
    const [x, z] = spots[Math.floor(rng() * spots.length)];
    b.actor({ kind: "sparkle", x, y: 0.4, z, yaw: 0, motion: "float", speed: 1.2, phase: rng() * 10, colors: ["#fb923c"] });
  }
}

/** What a Royal Punishment (GAME_GUIDE §15) changes on the plots */
interface PlotDecree {
  /** Low birth rate: flowers wilt grey and empty cradles stand by the houses */
  wilted: boolean;
}
const NO_DECREE: PlotDecree = { wilted: false };
const WILTED_FLOWERS = ["#a8a29e", "#9ca3af", "#78716c"];

function buildPlot(out: SceneOut, plot: PlotPlacement, civ: CivilizationType, lively: number, decree: PlotDecree = NO_DECREE) {
  const pal = PALETTES[civ];
  const rng = rngFor(plot.key);
  const building = plot.building;
  const species = pick(rng, CIV_ANIMALS[civ].pen);
  const ctx: Ctx = { civ, pal, rng, type: plot.type, species, budget: { people: 0, animals: 0 }, lively };

  if (!building) {
    buildVacantPlot(out, plot, ctx);
    return;
  }

  const S = plot.size;
  const half = S / 2;
  const level = effectiveLevel(building);
  const active = building.condition !== "idle"; // committed to within the last 90 days
  const feats = featuresFor(level);
  const prestige = building.prestige || 0;
  const stars = building.stars ?? prestige;
  // Red-star plots (5+ stars, below the Celestial levels) are legendary
  const red = stars >= RED_STAR_FROM && level < CELESTIAL_FROM;

  // Activity → how alive the plot is
  const peopleCap = 2 + Math.floor(level / 4);
  ctx.budget.people = Math.max(1, Math.min(peopleCap, Math.ceil(building.commitsPastWeek / 2)));
  ctx.budget.animals = plot.type !== "animal_field" ? 0 : Math.min(12, 1 + Math.floor(level / 2));

  // Every part of a plot has an HD version (the model kit, `kit`): its structures, dressing and pad
  const root = new Builder(out, plot.x, 0, plot.z, plot.rot);
  root.kit = true;
  root.add("box", 0, 0, 0, S, PAD_HEIGHT, S, padColor(plot.type, pal), { mat: plot.type === "soldier_building" ? "hide" : "plain" });
  const b = new Builder(out, plot.x, PAD_HEIGHT, plot.z, plot.rot);
  b.kit = true;

  const enclosed = feats.fence || feats.wall;
  const space = new PlotSpace(half, enclosed ? 0.75 : 0.35);

  // Path from the gate to the heart of the plot
  if (feats.path) {
    space.reserve({ x: 0, z: half / 2, w: 1.3, d: half }, false);
    b.add("box", 0, 0, half / 2, 1.1, 0.03, half, pal.path, { mat: civ === "orc" ? "hide" : "masonry" });
  }

  // Active bonus (commit within 90 days): a banner by the gate and two glowing gate lanterns
  if (active) {
    const gz = half - 0.65;
    const bx = half - 1.0;
    space.reserve({ x: bx, z: gz, w: 0.7, d: 0.7 });
    b.add("cyl", bx, 0, gz, 0.09, 3.0, 0.09, pal.wood, { mat: "wood" });
    b.add("box", bx + 0.33, 2.15, gz, 0.6, 0.8, 0.04, pal.accent, { mat: "cloth" });
    b.add("sphere", bx, 3.0, gz, 0.16, 0.16, 0.16, "#fbbf24", { mat: "gold" });
    // HD: the rod the banner hangs from, a tasselled hem
    b.add("box", bx + 0.33, 2.95, gz, 0.66, 0.04, 0.04, pal.wood, hdo("wood"));
    b.add("box", bx + 0.33, 2.09, gz, 0.6, 0.06, 0.08, "#d4a017", hdo("cloth"));
    for (const sx of [-1, 1]) {
      const lx = sx * 0.95;
      space.reserve({ x: lx, z: gz, w: 0.35, d: 0.35 });
      b.add("box", lx, 0, gz, 0.14, 0.85, 0.14, pal.wood, { mat: "wood" });
      b.add("box", lx, 0.85, gz, 0.26, 0.28, 0.26, ctx.civ === "orc" ? "#fb923c" : pal.window, { glow: true });
      lanternFrame(b.add.bind(b), lx, 0.85, gz, 0.26, 0.28, "#3f3f46", { mat: "iron" });
    }
  }

  // Active Surge (commit or merged PR in the last 48 h): flames along the plot edge and rising embers
  if (building.surging) surgeAura(b, half, rng);

  // Corner towers
  const towerSpots: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];
  for (let i = 0; i < feats.towers; i++) {
    const [sx, sz] = towerSpots[i];
    const tx = sx * (half - 0.9);
    const tz = sz * (half - 0.9);
    space.reserve({ x: tx, z: tz, w: 1.3, d: 1.3 });
    civTower(b, ctx, tx, tz, 1.1, 2.4);
    // HD: a red-star plot's royal pennants
    if (red) towerPennantHd(b, civ, tx, tz, 1.1, 2.4, pal.accent);
  }

  // Lv26+: the Celestial structure takes the heart of the plot
  if (level >= CELESTIAL_FROM) {
    const [w, d] = CELESTIAL_SIZE;
    const spot = space.best(w, d, (x, z) => Math.abs(x) * 1.0 + (z + half) * 1.6);
    if (spot) {
      space.reserve({ x: spot.x, z: spot.z, w, d });
      CELESTIAL_DRAWERS[plot.type](b.child(spot.x, spot.z), ctx);
    }
  }

  // Structures for this level, biggest first
  const counts = TIER_COUNTS[Math.min(level, TIER_COUNTS.length) - 1];
  for (let tier = 3; tier >= 0; tier--) {
    for (let i = 0; i < counts[tier]; i++) {
      const [w, d] = UNIT_SIZE[plot.type][tier];
      const jitter = rng();
      const spot = space.best(w, d, (x, z) =>
        tier >= 2 ? Math.abs(x) * 1.0 + (z + half) * 1.6 : (z + half) * 1.0 + Math.abs(x) * 0.25 + jitter * Math.abs(x + z) * 0.1
      );
      if (!spot) continue;
      space.reserve({ x: spot.x, z: spot.z, w, d });
      const rot = tier === 0 ? range(rng, -0.25, 0.25) : 0;
      // Each civilization's structures on the rarity ladder (humanStructures.ts, elfStructures.ts, …)
      CIV_DRAWERS[civ][plot.type][tier](b.child(spot.x, spot.z, rot), ctx);
    }
  }

  // Unlocked land features
  const frontScore = (x: number, z: number) => (half - z) * 0.8 + Math.abs(x) * 0.3;
  const placeFeature = (w: number, d: number, draw: (fb: Builder) => void) => {
    const spot = space.best(w, d, frontScore, 0.3);
    if (!spot) return;
    space.reserve({ x: spot.x, z: spot.z, w, d });
    draw(b.child(spot.x, spot.z));
  };
  if (feats.well) placeFeature(1.3, 1.3, (fb) => centerpiece(fb, ctx));
  if (feats.garden) placeFeature(1.6, 1.0, (fb) => garden(fb, ctx));
  if (feats.statue) placeFeature(1.0, 1.0, (fb) => statue(fb, ctx));
  if (feats.lamps) {
    // On active plots the gate lanterns stand in for the front pair
    for (const z of active ? [half * 0.35] : [half - 1.0, half * 0.35]) {
      lamp(b, ctx, -0.85, z);
      lamp(b, ctx, 0.85, z);
    }
  }

  // Perimeter: fence (Lv8+) becomes a stone wall at Lv20
  const e = half - 0.3;
  if (feats.wall) {
    perimeter(b, e, 1.8, (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ry = Math.atan2(-(z2 - z1), x2 - x1);
      b.add("box", (x1 + x2) / 2, 0, (z1 + z2) / 2, len + 0.3, 0.75, 0.3, pal.stone, { ry, mat: "masonry" });
      // HD: a coping along its top
      b.add("box", (x1 + x2) / 2, 0.75, (z1 + z2) / 2, len + 0.3, 0.06, 0.38, pal.stone, hdo("masonry", { ry }));
    });
    // HD: piers at the corners, where the courses of two runs would meet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("box", sx * e, 0, sz * e, 0.44, 0.92, 0.44, pal.stone, hdo("masonry"));
    for (const sx of [-1, 1]) {
      b.add("box", sx * 1.1, 0, e, 0.45, 1.15, 0.45, pal.stone, { mat: "masonry" });
      b.add("box", sx * 1.1, 1.15, e, 0.55, 0.08, 0.55, pal.stone, hdo("masonry"));
      b.add("sphere", sx * 1.1, 1.23, e, 0.26, 0.22, 0.26, pal.stone, hdo("masonry"));
    }
  } else if (feats.fence) {
    const palisade = plot.type === "soldier_building";
    perimeter(b, e, 1.6, (x1, z1, x2, z2) => fenceLine(b, x1, z1, x2, z2, pal.wood, palisade));
  }

  // Soldier yard props
  if (plot.type === "soldier_building") {
    if (level >= 2) {
      const s = space.random(rng, 0.6, 0.6, true, 0.3);
      if (s) {
        // A training dummy. HD: a straw body bound with rope
        b.add("cyl", s.x, 0, s.z, 0.12, 0.95, 0.12, pal.wood, { mat: "wood" });
        b.add("box", s.x, 0.6, s.z, 0.7, 0.08, 0.08, pal.wood, { mat: "wood" });
        b.add("sphere", s.x, 0.95, s.z, 0.24, 0.26, 0.24, pal.thatch, { mat: "fur" });
        b.add("cyl", s.x, 0.42, s.z, 0.3, 0.42, 0.3, pal.thatch, hdo("fur", { hdShape: "egg" }));
        for (const y of [0.5, 0.72]) b.add("cyl", s.x, y, s.z, 0.32, 0.03, 0.32, "#8b6b3a", hdo("cloth"));
      }
    }
    if (level >= 6) {
      const s = space.random(rng, 0.8, 0.5, true, 0.3);
      if (s) {
        // An archery butt. HD: straw rings round it, a stand of two legs, arrows in it
        b.add("cyl", s.x, 0.48, s.z, 0.75, 0.08, 0.75, "#ef4444", { rx: Math.PI / 2, mat: "cloth" });
        b.add("cyl", s.x, 0.49, s.z + 0.05, 0.35, 0.06, 0.35, "#f8fafc", { rx: Math.PI / 2, mat: "cloth" });
        b.add("box", s.x, 0, s.z - 0.1, 0.08, 0.55, 0.08, pal.wood, { mat: "wood" });
        arc(b.add.bind(b), [s.x, 0.52, s.z - 0.02], [1, 0, 0], [0, 1, 0], 0.4, 0, Math.PI * 2, 12, 0.07, pal.thatch, hdo("fur"), "cyl");
        for (const sx of [-1, 1]) along(b.add.bind(b), "cyl", [s.x + sx * 0.3, 0, s.z - 0.35], [s.x + sx * 0.12, 0.6, s.z - 0.06], 0.05, 0.05, pal.wood, hdo("wood"));
        for (const [ax, ay] of [[0.08, 0.6], [-0.14, 0.42], [0.18, 0.36]]) along(b.add.bind(b), "cyl", [s.x + ax, ay, s.z + 0.06], [s.x + ax + 0.04, ay + 0.05, s.z + 0.36], 0.02, 0.02, pal.wood, hdo("wood"));
      }
    }
  }

  // Residential plots keep a few chickens once they grow
  if (plot.type === "residential_commercial" && level >= 5) {
    for (let i = 0; i < Math.floor(level / 6) + 1; i++) {
      const s = space.random(rng, 0.3, 0.3, false);
      if (s) animal(b, ctx, CIV_ANIMALS[civ].small, s.x, s.z);
    }
  }

  // Remaining animals roam the open pasture
  while (ctx.budget.animals > 0) {
    ctx.budget.animals--;
    const s = space.random(rng, 0.7, 0.7);
    if (s) animal(b, ctx, ctx.species, s.x, s.z);
  }

  // Trees
  const trees = 1 + Math.floor(rng() * 2) + (level >= 10 ? 1 : 0);
  for (let i = 0; i < trees; i++) {
    const s = space.random(rng, 1.0, 1.0, true, 0.15);
    if (s) tree(b, ctx, s.x, s.z, 0.85);
  }

  // Flowers bloom on healthy (recently committed) repos; weeds take over neglected ones
  const health = building.health ?? 100;
  const flowers = health >= 80 ? Math.min(16, 3 + Math.floor(level / 2)) : health >= 60 ? 1 + Math.floor(level / 4) : 0;
  for (let i = 0; i < flowers; i++) {
    const s = space.random(rng, 0.45, 0.45);
    if (!s) break;
    for (let k = 0; k < 3; k++) {
      const fx = s.x + range(rng, -0.16, 0.16);
      const fz = s.z + range(rng, -0.16, 0.16);
      const color = pick(rng, CIV_FLOWERS[civ].colors);
      if (decree.wilted) {
        // Wilted: grey heads drooping on brown stems
        b.add("cone", fx, 0, fz, 0.1, 0.16, 0.1, "#78716c", { detail: true, rz: 0.35, mat: "leaf" });
        b.add("sphere", fx + 0.05, 0.1, fz, 0.12, 0.1, 0.12, pick(rng, WILTED_FLOWERS), { detail: true, mat: "cloth" });
      } else {
        b.add("cone", fx, 0, fz, 0.1, 0.16, 0.1, pal.foliage2, { detail: true, mat: "leaf" });
        b.add("sphere", fx, 0.14, fz, 0.13, 0.13, 0.13, color, { detail: true, glow: CIV_FLOWERS[civ].glow, mat: "skin" });
        // HD: a yellow heart in the bloom, a leaf on the stem
        if (!CIV_FLOWERS[civ].glow) b.add("sphere", fx, 0.235, fz, 0.06, 0.05, 0.06, "#facc15", hdo("leaf", { detail: true }));
        b.add("box", fx + 0.04, 0.05, fz, 0.07, 0.02, 0.04, pal.foliage2, hdo("leaf", { detail: true, rz: -0.5 }));
      }
    }
  }
  // Low birth rate: empty cradles by the houses (own random stream, so the rest of the plot doesn't move)
  if (decree.wilted && plot.type === "residential_commercial") {
    const crng = rngFor(`${plot.key}-cradles`);
    for (let i = 0; i < 2; i++) {
      const s = space.random(crng, 0.6, 0.5, false);
      if (!s) break;
      const cradle = b.child(s.x, s.z, crng() * Math.PI);
      cradle.add("box", 0, 0.06, 0, 0.5, 0.18, 0.32, pal.wood, { detail: true, mat: "wood" });
      // Rockers below, hood at one end (narrower than the basket and taller, so no faces line up)
      cradle.add("box", 0, 0, 0.1, 0.56, 0.06, 0.05, "#3f2a1a", { detail: true, mat: "wood" });
      cradle.add("box", 0, 0, -0.1, 0.56, 0.06, 0.05, "#3f2a1a", { detail: true, mat: "wood" });
      cradle.add("box", -0.17, 0.24, 0, 0.12, 0.2, 0.24, pal.canvas, { detail: true, mat: "cloth" });
      // HD: an empty blanket folded in the basket
      cradle.add("box", 0.06, 0.2, 0, 0.3, 0.06, 0.24, "#cbd5e1", hdo("cloth", { detail: true }));
    }
  }

  const weeds = health < 60 ? 3 + Math.floor(level / 3) : 0;
  for (let i = 0; i < weeds; i++) {
    const s = space.random(rng, 0.35, 0.35);
    if (!s) break;
    b.add("cone", s.x, 0, s.z, 0.14, 0.32, 0.14, "#8a8040", { detail: true, rz: range(rng, -0.4, 0.4), mat: "fur" });
    b.add("sphere", s.x + 0.12, 0, s.z, 0.28, 0.22, 0.28, "#6b6a35", { detail: true, mat: "leaf" });
  }

  // Props scale with codebase size (lines of code)
  const props = Math.max(0, Math.min(8, Math.floor(Math.log10((building.totalLines || 0) + 1) * 1.4)));
  for (let i = 0; i < props; i++) {
    const s = space.random(rng, 0.6, 0.6);
    if (!s) break;
    const kind = Math.floor(rng() * 4);
    // HD: a crate's battens, a barrel's hoops, a sack tied at its neck, a cart on spoked wheels with its shafts
    if (kind === 0) {
      const ry = rng();
      b.add("box", s.x, 0, s.z, 0.42, 0.42, 0.42, pal.wood, { detail: true, ry, mat: "wood" });
      const crate = b.child(s.x, s.z, ry);
      for (const y of [0.04, 0.33]) crate.add("box", 0, y, 0, 0.44, 0.05, 0.44, pal.wood, hdo("wood", { detail: true }));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) crate.add("box", sx * 0.2, 0, sz * 0.2, 0.1, 0.42, 0.1, "#5b3b22", hdo("wood", { detail: true }));
    } else if (kind === 1) {
      b.add("cyl", s.x, 0, s.z, 0.36, 0.48, 0.36, "#7c4a24", { detail: true, mat: "wood" });
      for (const y of [0.07, 0.38]) b.add("cyl", s.x, y, s.z, 0.37, 0.04, 0.37, "#3f3f46", hdo("dull", { detail: true }));
    } else if (kind === 2) {
      b.add("sphere", s.x, 0, s.z, 0.36, 0.3, 0.32, pal.canvas, { detail: true, mat: "cloth", hdShape: "egg" });
      b.add("cyl", s.x, 0.27, s.z, 0.1, 0.1, 0.1, pal.canvas, hdo("cloth", { detail: true, hdShape: "taper" }));
      b.add("cyl", s.x, 0.28, s.z, 0.12, 0.03, 0.12, "#8b6b3a", hdo("cloth", { detail: true }));
    } else {
      const ry = rng() * Math.PI;
      const cart = b.child(s.x, s.z, ry);
      const add = cart.add.bind(cart);
      cart.add("box", 0, 0.2, 0, 0.55, 0.28, 0.85, pal.wood, { detail: true, mat: "wood" });
      cart.add("cyl", -0.32, 0.16, 0, 0.4, 0.08, 0.4, "#3f2a1a", { detail: true, rz: Math.PI / 2, hd: false });
      cart.add("cyl", 0.32, 0.16, 0, 0.4, 0.08, 0.4, "#3f2a1a", { detail: true, rz: Math.PI / 2, hd: false });
      for (const sx of [-1, 1]) {
        wheel(add, [sx * 0.33, 0.2, 0], [0, 1, 0], [0, 0, 1], 0.2, 0.04, "#3f2a1a", hdo("wood", { detail: true }));
        along(add, "cyl", [sx * 0.18, 0.28, 0.4], [sx * 0.14, 0.12, 0.75], 0.04, 0.04, pal.wood, hdo("wood", { detail: true }));
      }
      for (const z of [-0.36, 0, 0.36]) cart.add("box", 0, 0.48, z, 0.6, 0.04, 0.05, "#5b3b22", hdo("wood", { detail: true }));
    }
  }

  // Remaining people stroll between the plot and its gate (soldiers patrol)
  const walkerKind: PersonRole = plot.type === "soldier_building" ? "soldier" : plot.type === "food_field" ? "farmer" : "villager";
  const gate = { x: 0, z: half - 0.3 };
  while (ctx.budget.people > 0) {
    ctx.budget.people--;
    let placed = false;
    for (let tries = 0; tries < 10 && !placed; tries++) {
      const a = space.random(rng, 0.3, 0.3, false);
      if (!a) break;
      const target = rng() < 0.5 ? gate : space.random(rng, 0.3, 0.3, false);
      if (target && space.segmentClear(a.x, a.z, target.x, target.z)) {
        person(b, ctx, walkerKind, a.x, a.z, "walk", target.x, target.z);
        placed = true;
      }
    }
    if (!placed) {
      const a = space.random(rng, 0.3, 0.3, false);
      if (a) person(b, ctx, walkerKind, a.x, a.z, walkerKind === "soldier" ? "work" : "idle");
    }
  }

  // Prestige effects for commits beyond Lv25. Red-star plots (legendary) in HD: the banners as grand gilt standards, a
  // gilt kerb set with pulsing gems in place of the glowing border
  const grand: AddOpts = red ? { hd: false } : {};
  if (prestige >= 1) {
    for (const sx of [-1, 1]) {
      const x = sx * (half - 0.45);
      b.add("cyl", x, 0, half - 0.45, 0.08, 2.6, 0.08, pal.wood, { mat: "wood", ...grand });
      b.add("box", x + sx * 0.38, 2.0, half - 0.45, 0.7, 0.5, 0.04, pal.accent, { mat: "cloth", ...grand });
      if (red) {
        grandStandardHd(b, x, half - 0.45, sx, pal.accent);
        continue;
      }
      b.add("box", x + sx * 0.38, 2.5, half - 0.45, 0.76, 0.04, 0.04, pal.wood, hdo("wood"));
      b.add("sphere", x, 2.6, half - 0.45, 0.12, 0.12, 0.12, "#d4a017", hdo("gold"));
    }
  }
  if (prestige >= 2) {
    const g = root.child(0, 0, 0, PAD_HEIGHT);
    for (const s of [-1, 1]) {
      g.add("box", 0, 0, s * (half - 0.06), S, 0.05, 0.12, "#fbbf24", { glow: true, ...grand });
      g.add("box", s * (half - 0.06), 0, 0, 0.12, 0.05, S, "#fbbf24", { glow: true, ...grand });
    }
    if (red) gildedKerbHd(g, S, half, pal.accent);
  }
  if (prestige >= 3) {
    for (let i = 0; i < 8; i++) {
      b.actor({
        kind: "sparkle",
        x: range(rng, -half + 1, half - 1),
        y: range(rng, 1, 3),
        z: range(rng, -half + 1, half - 1),
        yaw: 0,
        motion: "float",
        speed: range(rng, 0.3, 0.6),
        phase: rng() * 10,
        colors: [pick(rng, [pal.accent, "#fde047", "#ffffff"])]
      });
    }
  }
  // The plot on the rarity ladder: ★★★★ is epic (a low curtain of light, orbiting motes), red-star plots (5+ stars)
  // legendary, Celestial plots (Lv26+) mythic. The curtain stands round the whole plot, along its edge, so it reads
  // over the buildings inside; no plot gets a pillar of light (only the town hall keeps its beam)
  if (level >= CELESTIAL_FROM) celestialAura(b, root, half, rng);
  else if (red) root.fx(0, 0, half * PLOT_AURA, "legendary", pal.accent);
  else if (prestige >= 4) root.fx(0, 0, half * PLOT_AURA, "epic", pal.accent);
}

/** A plot's curtain of light stands just inside its edge (the kit widens it by 1.1) */
const PLOT_AURA = 0.86;

const SIGIL_MARKS = 16;
const CELESTIAL_EMBERS = 6;

/**
 * Crimson ground sigil (a ring of glowing marks, kept clear of the path; in HD inlaid in marble slabs with gilt studs),
 * slow crimson-gold embers drifting up, and the mythic kit of the rarity ladder (aura, embers, shards; no beam over a
 * plot; instanced over the whole city).
 */
function celestialAura(b: Builder, root: Builder, half: number, rng: Rng) {
  const r = half * 0.78;
  for (let i = 0; i < SIGIL_MARKS; i++) {
    const a = (i / SIGIL_MARKS) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 0.9 && z > 0) continue; // the path to the gate
    const ry = -a + Math.PI / 2;
    b.add("box", x, 0, z, 0.55, 0.09, 0.18, "#dc2626", { glow: true, ry, hd: false });
    // HD: inlaid in the pad, a marble slab with the glowing crimson mark set in it and a gilt stud at each end
    b.add("box", x, 0, z, 0.72, 0.04, 0.32, C_MARBLE2, hdo("masonry", { ry }));
    b.add("box", x, 0, z, 0.5, 0.09, 0.12, "#dc2626", { glow: true, ry, hd: true });
    for (const s of [-1, 1]) b.add("octa", x + s * Math.cos(ry) * 0.31, 0.02, z - s * Math.sin(ry) * 0.31, 0.09, 0.08, 0.09, C_GILT, hdo("gold"));
  }
  for (let i = 0; i < CELESTIAL_EMBERS; i++) {
    b.actor({
      kind: "sparkle",
      x: range(rng, -half + 1, half - 1),
      y: range(rng, 0.6, 4),
      z: range(rng, -half + 1, half - 1),
      yaw: 0,
      motion: "float",
      speed: range(rng, 0.15, 0.3),
      phase: rng() * 10,
      colors: [pick(rng, ["#dc2626", "#f97316", "#fbbf24"])]
    });
  }
  root.fx(0, 0, half * PLOT_AURA, "mythical", "#dc2626", "#fbbf24");
}

/* ========================================================================= */
/* WHOLE CITY                                                                */
/* ========================================================================= */

export function buildCityScene(kingdom: DeveloperKingdom, layout: CityLayout): SceneOut {
  const out = emptyScene();
  const civ = kingdom.civilization;
  const pal = PALETTES[civ];
  const rng = rngFor(`city-${kingdom.id}`);
  const streak = kingdom.streakDays ?? 0;
  const ctx: Ctx = { civ, pal, rng, type: "residential_commercial", species: "sheep", budget: { people: 0, animals: 0 }, lively: livelinessFor(streak) };
  const root = new Builder(out);
  const E = layout.half;
  const up = kingdom.upgrades || {};
  const wallTier = up.walls ?? 0;
  const roadTier = up.roads ?? 0;
  const wallE = E + 0.9; // walls (and the basic fence before any are bought) run just outside the forest ring
  const roadEnd = wallE;

  // The improvements (roads, plaza, fountain, lanterns, gate, walls and the rest) and the forest ring have HD versions
  // (the plots tag their own builders)
  const imp = root.child(0, 0);
  imp.kit = true;

  // Main roads + plaza: packed-earth country roads (0) → gravel (1) → cobblestone (2) → paved (3) → gilded (4) → imperial granite (5)
  const roadColor = ROAD_COLORS[roadTier] ?? pal.road;
  // HD: earth and gravel stay plain; cobbles, paving and granite are laid in flagstones
  const paving: Surface = roadTier >= 2 ? "masonry" : "plain";
  imp.add("box", 0, 0, 0, roadEnd * 2, 0.04, ROAD_HALF * 2, roadColor ?? pal.road, { mat: paving });
  imp.add("box", 0, 0, 0, ROAD_HALF * 2, 0.04, roadEnd * 2, roadColor ?? pal.road, { mat: paving });
  imp.add("box", 0, 0, 0, PLAZA_HALF * 2, 0.06, PLAZA_HALF * 2, roadTier >= 5 ? "#f5f5f4" : roadTier >= 3 ? "#e2dccf" : pal.plaza, { mat: paving });
  for (const lane of layout.lanes) imp.add("box", lane.x, 0, lane.z, lane.w, 0.03, lane.d, roadTier >= 2 ? "#a3a39b" : pal.path, { mat: paving });
  const roadLen = roadEnd - PLAZA_HALF;
  // Along each of the four roads: `fn(along, side)` gets the distance from the centre (signed) and the side of the road
  const alongRoads = (fn: (dir: number, axis: "x" | "z") => void) => {
    for (const dir of [-1, 1]) {
      fn(dir, "x");
      fn(dir, "z");
    }
  };
  if (roadTier === 0) {
    // Gravel shoulders framing the earth road, and stepping cobbles where the roads meet the plaza
    alongRoads((dir, axis) => {
      const mid = dir * (PLAZA_HALF + roadLen / 2);
      for (const s of [-1, 1]) {
        const off = s * (ROAD_HALF + 0.25);
        if (axis === "x") imp.add("box", mid, 0, off, roadLen, 0.09, 0.4, "#b8ad97");
        else imp.add("box", off, 0, mid, 0.4, 0.09, roadLen, "#b8ad97");
      }
      for (let k = 0; k < 3; k++) {
        const along = dir * (PLAZA_HALF + 0.7 + k * 0.9);
        const lateral = (k % 2 ? 0.45 : -0.45) * ROAD_HALF;
        const [x, z] = axis === "x" ? [along, lateral] : [lateral, along];
        imp.add("box", x, 0.04, z, 0.6, 0.06, 0.5, "#a8a29e", { ry: k * 0.5, mat: "stone" });
      }
    });
  } else if (roadTier === 1) {
    // Small stone markers along both edges
    alongRoads((dir, axis) => {
      for (let d = PLAZA_HALF + 2; d < roadEnd - 1; d += 4) {
        for (const s of [-1, 1]) {
          const [x, z] = axis === "x" ? [dir * d, s * (ROAD_HALF + 0.2)] : [s * (ROAD_HALF + 0.2), dir * d];
          imp.add("box", x, 0, z, 0.22, 0.32, 0.22, "#d6d3d1", { mat: "stone" });
          imp.add("sphere", x, 0.32, z, 0.12, 0.08, 0.12, "#d6d3d1", { mat: "stone", hd: true }); // a rounded cap
        }
      }
    });
  }
  if (roadTier >= 2) {
    // Kerbs (gilded from tier 4)
    const kerb = roadTier >= 4 ? GOLD : "#6b6f77";
    const kerbMat: Surface = roadTier >= 4 ? "gold" : "masonry";
    for (const s of [-1, 1]) {
      for (const dir of [-1, 1]) {
        const mid = dir * (PLAZA_HALF + roadLen / 2);
        imp.add("box", mid, 0.04, s * (ROAD_HALF + 0.05), roadLen, 0.1, 0.16, kerb, { mat: kerbMat });
        imp.add("box", s * (ROAD_HALF + 0.05), 0.04, mid, 0.16, 0.1, roadLen, kerb, { mat: kerbMat });
      }
    }
  }
  if (roadTier >= 3) {
    // Centre line: white dashes, glowing speed runes on the Imperial Highway
    for (let d = PLAZA_HALF + 1; d < roadEnd - 0.5; d += 2) {
      for (const dir of [-1, 1]) {
        if (roadTier >= 5) {
          imp.add("box", dir * d, 0.04, 0, 0.5, 0.03, 0.5, "#67e8f9", { glow: true, ry: Math.PI / 4 });
          imp.add("box", 0, 0.04, dir * d, 0.5, 0.03, 0.5, "#67e8f9", { glow: true, ry: Math.PI / 4 });
          runeFrameHd(imp, dir * d, 0);
          runeFrameHd(imp, 0, dir * d);
        } else {
          imp.add("box", dir * d, 0.04, 0, 0.9, 0.02, 0.14, "#f8fafc");
          imp.add("box", 0, 0.04, dir * d, 0.14, 0.02, 0.9, "#f8fafc");
        }
      }
    }
  }
  if (roadTier >= 4) {
    // Ceremonial arches where each road leaves the plaza
    alongRoads((dir, axis) => {
      const along = dir * (PLAZA_HALF + 1.2);
      const pillar = (lat: number) => (axis === "x" ? [along, lat] : [lat, along]) as [number, number];
      for (const s of [-1, 1]) {
        const [x, z] = pillar(s * (ROAD_HALF + 0.45));
        imp.add("box", x, 0, z, 0.5, 3.2, 0.5, roadTier >= 5 ? "#e7e5e4" : pal.stone, { mat: "masonry" });
        imp.add("sphere", x, 3.6, z, 0.3, 0.3, 0.3, GOLD, { glow: roadTier >= 5, mat: "gold" });
        // HD: a moulded base and a capital on each pillar, and a gilt collar under its ball
        imp.add("box", x, 0, z, 0.64, 0.32, 0.64, roadTier >= 5 ? "#e7e5e4" : pal.stone, { mat: "masonry", hd: true });
        imp.add("box", x, 2.92, z, 0.62, 0.22, 0.62, roadTier >= 5 ? "#e7e5e4" : pal.stone, { mat: "masonry", hd: true });
        imp.add("cyl", x, 3.55, z, 0.2, 0.08, 0.2, GOLD, { mat: "gold", hd: true });
      }
      const [lx, lz] = pillar(0);
      const span = ROAD_HALF * 2 + 1.4;
      imp.add("box", lx, 3.2, lz, axis === "x" ? 0.6 : span, 0.4, axis === "x" ? span : 0.6, roadTier >= 5 ? "#e7e5e4" : pal.stone, { mat: "masonry", hdShape: "slab" });
      imp.add("box", lx, 3.25, lz, axis === "x" ? 0.7 : span * 0.5, 0.3, axis === "x" ? span * 0.5 : 0.7, GOLD, { mat: "gold" });
      if (roadTier >= 5) triumphHd(imp, pillar, axis, span, BANNER_CLOTH[civ]);
    });
  }

  // Plaza fountain, well in front of the castle: rustic village well (0) → grand fountain (1) → hero monument (2)
  // → iron-banded Aegis Cascade (3) → rune-ringed Sanctuary Basin (4) → golden Sovereign Spring (5)
  const plazaTier = up.plaza ?? 0;
  if (plazaTier === 0) {
    // Dressed stone lip around a bubbling basin
    imp.add("cyl", 0, 0.06, FOUNTAIN_Z, 3.4, 0.44, 3.4, "#a8a29e", { mat: "masonry" });
    imp.add("cyl", 0, 0.06, FOUNTAIN_Z, 3.2, 0.5, 3.2, pal.stone, { mat: "masonry" });
    imp.add("cyl", 0, 0.56, FOUNTAIN_Z, 2.8, 0.06, 2.8, pal.water, { mat: "gel" });
    imp.add("cyl", 0, 0.56, FOUNTAIN_Z, 0.45, 1.3, 0.45, pal.stone, { mat: "masonry" });
    imp.add("sphere", 0, 1.8, FOUNTAIN_Z, 0.5, 0.4, 0.5, pal.water, { mat: "gel" });
    for (let k = 0; k < 2; k++) {
      root.actor({ kind: "sparkle", x: k ? 0.7 : -0.6, y: 0.75, z: FOUNTAIN_Z + (k ? -0.4 : 0.5), yaw: 0, motion: "float", speed: range(rng, 0.3, 0.5), phase: rng() * 10, colors: ["#e0f2fe"] });
    }
  } else {
    const stone = plazaTier >= 5 ? PALE_GOLD : pal.stone;
    const st: AddOpts = { mat: "masonry" };
    imp.add("cyl", 0, 0.06, FOUNTAIN_Z, 4.6, 0.6, 4.6, stone, st);
    imp.add("cyl", 0, 0.66, FOUNTAIN_Z, 4.1, 0.06, 4.1, pal.water, { mat: "gel" });
    imp.add("cyl", 0, 0.66, FOUNTAIN_Z, 0.8, 0.84, 0.8, stone, st);
    imp.add("cyl", 0, 1.5, FOUNTAIN_Z, 2.4, 0.35, 2.4, stone, st);
    imp.add("cyl", 0, 1.85, FOUNTAIN_Z, 2.0, 0.06, 2.0, pal.water, { mat: "gel" });
    imp.add("cyl", 0, 1.85, FOUNTAIN_Z, 0.45, 0.8, 0.45, stone, st);
    imp.add("cyl", 0, 2.6, FOUNTAIN_Z, 1.1, 0.25, 1.1, stone, st);
    fountainHd(imp, plazaTier, stone, pal.water);
    if (plazaTier >= 2) {
      // Golden hero of the civilization on top
      heroStatue(imp.child(0, FOUNTAIN_Z, 0, 2.85), civ, plazaTier >= 3);
    } else {
      imp.add("sphere", 0, 2.85, FOUNTAIN_Z, 0.5, 0.4, 0.5, pal.water, { mat: "gel" });
    }
    if (plazaTier >= 3) {
      // Iron bands on the basin and a ring of ceremonial bulwark shields
      imp.add("cyl", 0, 0.2, FOUNTAIN_Z, 4.72, 0.14, 4.72, "#3f3f46", { mat: "iron" });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        const r = 3.0;
        const color = plazaTier >= 5 ? GOLD : BANNER_CLOTH[civ];
        imp.add("box", Math.cos(a) * r, 0.06, FOUNTAIN_Z + Math.sin(a) * r, 0.7, 1.0, 0.16, color, { ry: -a + Math.PI / 2, hd: false });
        // HD: a round shield on a post, rimmed and bossed in iron
        const sh = imp.child(Math.cos(a) * r, FOUNTAIN_Z + Math.sin(a) * r, -a + Math.PI / 2);
        sh.add("box", 0, 0.06, -0.06, 0.1, 0.62, 0.08, "#57534e", { mat: "wood", hd: true });
        sh.add("cyl", 0, 0.62 - 0.05, 0.0, 0.74, 0.1, 0.74, color, { rx: Math.PI / 2, mat: plazaTier >= 5 ? "gold" : "wood", hd: true });
        arc(sh.add.bind(sh), [0, 0.62, 0.06], [1, 0, 0], [0, 1, 0], 0.36, 0, Math.PI * 2, 12, 0.05, "#3f3f46", { mat: "iron", hd: true }, "cyl");
        sh.add("sphere", 0, 0.62 - 0.08, 0.06, 0.16, 0.16, 0.12, "#a8a29e", { mat: "iron", hd: true });
      }
    }
    if (plazaTier >= 3) {
      // Spray rising off the top basin (the rare tier's looping effect)
      for (let k = 0; k < 3; k++) imp.add("sphere", 0, 2.4, FOUNTAIN_Z, 0.45, 0.4, 0.45, "#bae6fd", { idle: IDLE_KIND.smoke, phase: 0.01 + (k * Math.PI * 2) / 3 });
    }
    if (plazaTier === 4) {
      // Tranquility orbs of glowing water circling over the basin (epic: orbiting bits, nothing on the ground)
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        imp.add("sphere", Math.cos(a) * 2.6, 3.1 + (k % 2) * 0.35, FOUNTAIN_Z + Math.sin(a) * 2.6, 0.3, 0.3, 0.3, "#a5f3fc", { glow: true, idle: IDLE_KIND.spin, pivot: [0, FOUNTAIN_Z], phase: 0.01 + a });
      }
    }
    if (plazaTier >= 5) {
      // Golden bulwark aura: gold orbs circling above the basin
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        imp.add("octa", Math.cos(a) * 2.4, 3.3 + (k % 2) * 0.4, FOUNTAIN_Z + Math.sin(a) * 2.4, 0.26, 0.4, 0.26, GOLD, { glow: true, idle: IDLE_KIND.spin, pivot: [0, FOUNTAIN_Z], phase: 0.01 + a });
      }
      springHd(imp);
    }
  }

  // Lamp posts every 7 units along the main roads. Lantern Streets: crossroads braziers (1) → twice the brass lamps (2)
  // → mana flames (3) → tall gilded beacons (4) → starlight orbs floating above every lamp (5)
  const lanternTier = up.lanterns ?? 0;
  const lampStep = lanternTier >= 2 ? 3.5 : 7;
  const lampH = lanternTier >= 4 ? 2.4 : 1.6;
  const lampPost = lanternTier >= 4 ? GOLD : lanternTier >= 2 ? "#b08d57" : "#3f3f46";
  const lampLight = lanternTier >= 4 ? "#fbbf24" : lanternTier >= 3 ? "#a5f3fc" : pal.window;
  // HD: plain iron posts, brass from Brass Streetlamps (uncommon), gold on the beacons
  const postMat: Surface = lanternTier >= 4 ? "gold" : lanternTier >= 2 ? "gold" : "dull";
  for (let d = PLAZA_HALF + 3; d < E - 2; d += lampStep) {
    for (const [x, z] of [
      [d, ROAD_HALF + 0.4],
      [-d, -ROAD_HALF - 0.4],
      [ROAD_HALF + 0.4, -d],
      [-ROAD_HALF - 0.4, d]
    ]) {
      imp.add("cyl", x, 0, z, 0.08, lampH, 0.08, lampPost, { mat: postMat });
      if (lanternTier >= 3) imp.add("octa", x, lampH, z, 0.3, 0.42, 0.3, lampLight, { glow: true, idle: IDLE_KIND.pulse });
      else imp.add("box", x, lampH, z, 0.24, 0.26, 0.24, lampLight, { glow: true });
      // HD: a foot and collar on the post, a lantern's frame round the light (a cup under a mana flame)
      imp.add("cyl", x, 0, z, 0.18, 0.12, 0.18, lampPost, { mat: postMat, hd: true });
      if (lanternTier >= 3) imp.add("cyl", x, lampH - 0.06, z, 0.24, 0.08, 0.24, lampPost, { mat: postMat, hd: true });
      else lanternFrame(imp.add.bind(imp), x, lampH, z, 0.24, 0.26, lampPost, { mat: postMat });
      if (lanternTier >= 5) {
        imp.add("sphere", x, lampH + 0.9, z, 0.26, 0.26, 0.26, "#e0f2fe", { glow: true });
        nightlightHd(imp, x, z, lampH);
      }
    }
  }
  if (lanternTier >= 1) {
    // Iron braziers where the four roads meet the plaza
    alongRoads((dir, axis) => {
      for (const s of [-1, 1]) {
        const [x, z] = axis === "x" ? [dir * (PLAZA_HALF + 0.5), s * (ROAD_HALF + 0.9)] : [s * (ROAD_HALF + 0.9), dir * (PLAZA_HALF + 0.5)];
        imp.add("cyl", x, 0, z, 0.14, 0.9, 0.14, "#3f3f46", { mat: "iron" });
        imp.add("cyl", x, 0.9, z, 0.5, 0.22, 0.5, "#3f3f46", { mat: "iron" });
        imp.add("sphere", x, 1.12, z, 0.36, 0.4, 0.36, lanternTier >= 3 ? lampLight : "#f97316", { glow: true });
        // HD: three splayed legs and a ring of coals in the bowl
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          along(imp.add.bind(imp), "cyl", [x + Math.cos(a) * 0.05, 0.6, z + Math.sin(a) * 0.05], [x + Math.cos(a) * 0.3, 0, z + Math.sin(a) * 0.3], 0.05, 0.05, "#3f3f46", { mat: "iron", hd: true });
          imp.add("boulder", x + Math.cos(a + 0.5) * 0.15, 1.08, z + Math.sin(a + 0.5) * 0.15, 0.13, 0.1, 0.12, "#292524", { mat: "stone", hd: true });
        }
        if (lanternTier >= 5) starBowlHd(imp, x, z);
      }
    });
  }

  // Forest ring around the city edge
  const ringTrees = Math.min(110, Math.floor((E * 8) / 2.6));
  for (let i = 0; i < ringTrees; i++) {
    const t = rng() * 4;
    const side = Math.floor(t);
    const u = (t - side) * 2 - 1;
    const depth = E - range(rng, 0.5, 3.5);
    const [x, z] = side === 0 ? [u * E, depth] : side === 1 ? [u * E, -depth] : side === 2 ? [depth, u * E] : [-depth, u * E];
    if (Math.abs(x) < ROAD_HALF + 1 || Math.abs(z) < ROAD_HALF + 1) continue; // keep the roads open
    tree(imp, ctx, x, z, range(rng, 1.0, 1.5));
  }

  // City gate at the end of the front road, set into the fence / wall line
  const gateZ = wallE;
  const gateH = wallTier >= 5 ? 7.6 : wallTier === 4 ? 6.4 : wallTier === 3 ? 5.2 : wallTier === 2 ? 4.2 : 3.4;
  const gatePillarW = wallTier >= 4 ? 1.7 : 1.3;
  imp.add("box", -2.6, 0, gateZ, gatePillarW, gateH, gatePillarW, wallTier >= 5 ? "#1e1b2e" : pal.stone, { mat: "masonry" });
  imp.add("box", 2.6, 0, gateZ, gatePillarW, gateH, gatePillarW, wallTier >= 5 ? "#1e1b2e" : pal.stone, { mat: "masonry" });
  imp.add("box", 0, gateH - 0.7, gateZ, 4.6, 0.8, 1.1, wallTier >= 5 ? "#1e1b2e" : pal.stone, { mat: "masonry", hdShape: "slab" });
  imp.add("box", 0, gateH + 0.1, gateZ, 1.2, 0.8, 0.05, pal.accent, { glow: wallTier >= 5, mat: "wood" });
  gateHd(imp, gateZ, gateH, wallTier);
  if (wallTier >= 4) {
    // Portcullis arch bands and twin gatehouse turrets
    for (const sx of [-2.6, 2.6]) {
      imp.add("box", sx, gateH * 0.5, gateZ, gatePillarW + 0.12, 0.18, gatePillarW + 0.12, "#3f3f46", { mat: "iron" });
      imp.add("cone", sx, gateH, gateZ, gatePillarW * 1.15, 1.4, gatePillarW * 1.15, pal.roof, wallTier >= 5 ? { mat: "tiles" } : {});
    }
  }
  if (wallTier >= 5) {
    // Beacon braziers atop the gatehouse towers
    for (const sx of [-2.6, 2.6]) {
      imp.add("cyl", sx, gateH + 1.3, gateZ, 0.5, 0.25, 0.5, "#3f3f46", { mat: "iron" });
      imp.add("sphere", sx, gateH + 1.55, gateZ, 0.42, 0.48, 0.42, pal.accent, { glow: true });
      beaconHd(imp, sx, gateH + 1.3, gateZ, 0.5, pal.accent);
    }
    // HD: the city's sigil over the gate in a steel frame under a gilt finial
    const sigil = hdo("steel", { hdShape: "slab" });
    imp.add("box", 0, gateH + 0.9, gateZ, 1.36, 0.08, 0.15, SILVER, sigil);
    for (const sx of [-1, 1]) imp.add("box", sx * 0.64, gateH + 0.1, gateZ, 0.08, 0.8, 0.15, SILVER, sigil);
    imp.add("octa", 0, gateH + 0.98, gateZ, 0.2, 0.3, 0.2, C_GILT, hdo("gold"));
  }

  buildImprovements(imp, ctx, up, E, wallE);

  // Townsfolk walking the main roads — busier when the developer committed a lot this week
  // and on a commit streak (one extra walker per two streak days)
  const walkers = Math.max(2, Math.min(32, 2 + Math.floor(kingdom.activity.pastWeekCommits / 3) + Math.floor(streak / 2)));
  const roadFrom = out.actors.length;
  for (let i = 0; i < walkers; i++) {
    const lateral = range(rng, -ROAD_HALF + 0.4, ROAD_HALF - 0.4);
    const start = PLAZA_HALF + range(rng, 0, 2);
    const end = E - range(rng, 2, 5);
    const axis = i % 4;
    const [x1, z1, x2, z2] =
      axis === 0 ? [start, lateral, end, lateral] : axis === 1 ? [-start, lateral, -end, lateral] : axis === 2 ? [lateral, start, lateral, end] : [lateral, -start, lateral, -end];
    person(root, ctx, "villager", x1, z1, "walk", x2, z2);
  }

  // A streak of 3+ days draws a crowd strolling around the plaza fountain
  const plazaCrowd = streak >= 3 ? Math.min(12, streak - 2) : 0;
  const roadPeople = out.actors.slice(roadFrom);
  const crowdFrom = out.actors.length;
  for (let i = 0; i < plazaCrowd; i++) {
    // Short arcs on a ring outside the fountain basin, so the straight walk never crosses it;
    // kept to the front and sides (sin ≥ -0.5) so nobody walks into the castle
    const a = range(rng, -Math.PI / 6 + 0.6, (7 * Math.PI) / 6 - 0.6);
    const b = a + (rng() < 0.5 ? -1 : 1) * range(rng, 0.4, 0.6);
    // Outside the bulwark shields and runes once the fountain has them
    const r = plazaTier >= 3 ? range(rng, 4.2, 4.6) : range(rng, 3.3, 4.2);
    person(root, ctx, "villager", Math.cos(a) * r, FOUNTAIN_Z + Math.sin(a) * r, "walk", Math.cos(b) * r, FOUNTAIN_Z + Math.sin(b) * r);
  }

  // Market Square shoppers (busier on a streak): each one either browses between two stalls on
  // one side, or walks from beside the fountain to a stall counter. Counters face the plaza at
  // x = ±MARKET_FRONT_X; the castle never reaches past x = ±6.8, and fountain trips start below
  // the fountain crowd and only visit the nearer stalls, clear of the statue/spire spots at (±7.5, 9)
  const crowdPeople = out.actors.slice(crowdFrom);
  const shopperFrom = out.actors.length;
  if (up.market) {
    const shoppers = Math.min(10, 3 + Math.floor(streak / 2));
    for (let i = 0; i < shoppers; i++) {
      const sx = rng() < 0.5 ? -1 : 1;
      const counterX = sx * MARKET_FRONT_X;
      if (rng() < 0.5) {
        const [z1, z2] = [pick(rng, MARKET_STALL_Z), pick(rng, MARKET_STALL_Z)];
        const z2b = z1 === z2 ? z1 + (z1 < 0 ? 2.2 : -2.2) : z2; // never a zero-length walk
        person(root, ctx, "villager", counterX, z1, "walk", counterX, z2b);
      } else {
        const stallZ = pick(rng, [MARKET_STALL_Z[1], MARKET_STALL_Z[2]]);
        person(root, ctx, "villager", sx * range(rng, 4.7, 5.3), range(rng, 5.2, 6.4), "walk", counterX, stallZ + range(rng, -0.4, 0.4));
      }
    }
  }

  const shopperPeople = out.actors.slice(shopperFrom);

  // Landmark visitors — no extra people: some of the plaza crowd, shoppers and road walkers go to
  // the Dragon Statue (bow), Mana Spire (look up in awe) or upgraded fountain (bow to the Hero
  // Monument / admire the Grand Fountain), pause there with good manners and walk back
  const landmarks: Landmark[] = [];
  if (up.dragon_statue) landmarks.push({ x: DRAGON_SPOT[0], z: DRAGON_SPOT[1], r: dragonRadius(up.dragon_statue) - 0.2, gesture: "bow" });
  if (up.mana_spire) landmarks.push({ x: SPIRE_SPOT[0], z: SPIRE_SPOT[1], r: 1.4, gesture: "lookUp" });
  if (plazaTier >= 1) landmarks.push({ x: 0, z: FOUNTAIN_Z, r: plazaTier >= 3 ? 3.7 : 2.3, gesture: plazaTier >= 2 ? "bow" : "admire" });
  if (landmarks.length > 0) {
    const pool = [...crowdPeople, ...shopperPeople, ...roadPeople];
    const obstacles = plazaObstacles(up, plazaTier);
    let next = 0;
    for (let round = 0; round < VISITORS_PER_LANDMARK; round++) {
      for (const lm of landmarks) {
        if (next >= pool.length) break;
        const route = visitRoute(rng, lm, obstacles);
        if (!route) continue;
        Object.assign(pool[next++], {
          motion: "visit",
          x: route.from[0],
          z: route.from[1],
          x2: route.to[0],
          z2: route.to[1],
          yaw: Math.atan2(lm.x - route.to[0], lm.z - route.to[1]),
          gesture: lm.gesture
        });
      }
    }
  }

  // ---- Royal Punishment (GAME_GUIDE §15) and the children at play
  const punishment = kingdom.punishment && kingdom.punishment.endsAt > Date.now() ? kingdom.punishment : null;
  const decree: PlotDecree = { wilted: Boolean(punishment?.lowBirth) };
  if (punishment?.highDeath) buildMourning(root, ctx, wallE, plazaTier);
  addChildren(root, ctx, kingdom, up, plazaTier);

  for (const plot of layout.plots) buildPlot(out, plot, civ, ctx.lively, decree);
  if (!punishment?.lowBirth) addCompanions(root, ctx, kingdom);
  return out;
}

/**
 * Children walking beside the grown-ups (GAME_GUIDE §5): every villager or farmer walking back and forth has a
 * COMPANION_CHANCE of a child at their side, on the same path and pace shifted a step sideways (none under a Low
 * birth rate punishment). Own random stream, so the rest of the city doesn't change.
 */
function addCompanions(root: Builder, ctx: Ctx, kingdom: DeveloperKingdom) {
  const rng = rngFor(`companions-${kingdom.id}`);
  const kid: Ctx = { ...ctx, rng };
  const adults = root.out.actors.filter(
    (a) => a.motion === "walk" && a.scale === undefined && (a.kind.startsWith("villager_") || a.kind.startsWith("farmer_")) && a.x2 !== undefined && a.z2 !== undefined
  );
  for (const a of adults) {
    if (rng() >= COMPANION_CHANCE) continue;
    const dx = a.x2! - a.x;
    const dz = a.z2! - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    // Beside the adult, on their right while walking out
    const ox = (dz / len) * 0.4;
    const oz = (-dx / len) * 0.4;
    person(root, kid, "villager", a.x + ox, a.z + oz, "walk", a.x2! + ox, a.z2! + oz);
    const c = root.out.actors[root.out.actors.length - 1];
    Object.assign(c, { y: a.y, speed: a.speed, phase: a.phase, scale: CHILD_SCALE });
  }
}

/* ------------------------- Children and mourning -------------------------- */

const CHILD_SCALE = 0.6;
const CHILDREN_PER_GROUP = 4;
const PLAZA_GAMES = ["tag", "catch", "run"] as const;
/** Chance that a walking villager or farmer has a child walking beside them */
const COMPANION_CHANCE = 0.2;

/**
 * Children at play (GAME_GUIDE §5): the server sends how many (1 + ⌈births last harvest / 5⌉; none under a Low
 * birth rate punishment). They play on the plaza in groups of up to 4, each group at its own random clear spot
 * and playing one of three games: tag round a little ring (each child at its own pace, so they keep catching and
 * overtaking each other), catch (standing round a circle, throwing a ball from child to child) or running about.
 * They are small villagers, so they share the villagers' instanced meshes (no extra draw calls).
 */
function addChildren(root: Builder, ctx: Ctx, kingdom: DeveloperKingdom, up: Record<string, number>, plazaTier: number) {
  const count = Math.max(0, Math.floor(kingdom.childrenAtPlay ?? 0));
  if (count === 0) return;
  const rng = rngFor(`children-${kingdom.id}`);
  const kid: Ctx = { ...ctx, rng };
  const obstacles = plazaObstacles(up, plazaTier);
  const groups = Math.ceil(count / CHILDREN_PER_GROUP);
  const spots: Array<{ x: number; z: number; r: number }> = [];
  // A play ring is clear when its centre and points around it are off every obstacle
  const ringClear = (x: number, z: number, r: number) => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (blocked(x + Math.cos(a) * (r + 0.3), z + Math.sin(a) * (r + 0.3), obstacles)) return false;
    }
    return !blocked(x, z, obstacles);
  };
  for (let g = 0; g < groups; g++) {
    const r = range(rng, 0.9, 1.5);
    let spot: { x: number; z: number; r: number } | null = null;
    // Prefer the front of the plaza (in front of the castle, where the camera looks) and a spot away from the
    // other groups; when that fills up, the back of the plaza, then any clear spot will do
    for (let tries = 0; tries < 90 && !spot; tries++) {
      const x = range(rng, -PLAZA_HALF + 1.5, PLAZA_HALF - 1.5);
      const z = tries < 60 ? range(rng, 2.5, PLAZA_HALF - 1.5) : range(rng, -PLAZA_HALF + 1.5, PLAZA_HALF - 1.5);
      const apart = tries < 40 || (tries >= 60 && tries < 80) ? spots.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r + 0.8) : true;
      if (apart && ringClear(x, z, r)) spot = { x, z, r };
    }
    // No clear spot left: round the fountain, just outside its basin
    spot ??= { x: 0, z: FOUNTAIN_Z, r: (plazaTier >= 3 ? 3.9 : plazaTier >= 1 ? 2.5 : 1.8) + 0.45 };
    spots.push(spot);
    // Even split, so no group is left with a lonely child (5 → 3 + 2, never 4 + 1)
    const inGroup = Math.floor(count / groups) + (g < count % groups ? 1 : 0);
    const start = rng() * Math.PI * 2;
    const at = spot;
    // Three kinds of play: tag round a ring, catch (a ball thrown round a circle), or running about at random.
    // A Special Overseer's plaza shows every game: its groups take them in turn
    const play = inGroup < 2 ? "run" : kingdom.isSpecial ? PLAZA_GAMES[g % PLAZA_GAMES.length] : pick(rng, PLAZA_GAMES);
    const tempo = range(rng, 0.7, 1.0); // catch: throws per second
    const child = (x: number, z: number, motion: Motion) => {
      person(root, kid, "villager", x, z, motion, at.x, at.z);
      const a = root.out.actors[root.out.actors.length - 1];
      a.scale = CHILD_SCALE;
      return a;
    };
    for (let c = 0; c < inGroup; c++) {
      if (play === "tag") {
        const a = child(at.x + at.r - range(rng, 0, Math.min(0.35, at.r * 0.3)), at.z, "circle");
        a.speed = range(rng, 1.2, 2.1);
        a.phase = start + (c / inGroup) * Math.PI * 2 + range(rng, -0.3, 0.3);
      } else if (play === "catch") {
        // Stand round the ring facing its centre
        const ang = start + (c / inGroup) * Math.PI * 2;
        const a = child(at.x + Math.cos(ang) * at.r, at.z + Math.sin(ang) * at.r, "catch");
        a.yaw = Math.atan2(-Math.cos(ang), -Math.sin(ang));
        a.speed = tempo;
        a.phase = c;
        a.ring = inGroup;
      } else {
        const a = child(at.x + at.r, at.z, "wander");
        a.speed = range(rng, 1.2, 2.0);
        a.phase = rng() * 10;
      }
    }
    if (play === "catch") {
      // The ball (a small glowing sparkle: no extra draw call), thrown from child to child round the ring
      root.actor({
        kind: "sparkle",
        x: at.x + at.r,
        y: 0.45,
        z: at.z,
        x2: at.x,
        z2: at.z,
        yaw: start,
        motion: "toss",
        speed: tempo,
        phase: 0,
        ring: inGroup,
        colors: [pick(rng, ["#ef4444", "#f8fafc", "#facc15", "#38bdf8"])]
      });
    }
  }
}

/** High death rate: fresh graves outside the walls, crows over the plaza and a grey-green miasma */
function buildMourning(root: Builder, ctx: Ctx, wallE: number, plazaTier: number) {
  const rng = rngFor(`mourning-${ctx.civ}-${Math.round(wallE)}`);
  // A small graveyard outside the back-left corner of the walls: dirt mounds, each with a headstone
  const gx = -wallE + 1.2;
  const gz = -wallE - 2.6;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const x = gx + col * 1.1 + range(rng, -0.1, 0.1);
      const z = gz - row * 1.6;
      root.add("box", x, 0, z, 0.5, 0.12, 0.9, "#5b4636");
      // Headstone stands 0.08 inside the mound's end, so its back face never lines up with the mound's
      root.add("box", x, 0, z - 0.32, 0.36, 0.55, 0.1, "#9ca3af", { rx: range(rng, -0.08, 0.08) });
      // A wilted wreath on some
      if (rng() < 0.4) root.add("sphere", x, 0.17, z + 0.1, 0.22, 0.08, 0.22, "#57534e", { detail: true });
    }
  }
  // Crows circling high over the plaza (crows use the animals' instanced mesh)
  for (let i = 0; i < 5; i++) {
    root.actor({
      kind: "crow",
      x: range(rng, 3, 5.5),
      y: range(rng, 6, 8.5),
      z: FOUNTAIN_Z,
      x2: 0,
      z2: FOUNTAIN_Z - (plazaTier >= 3 ? 1 : 0),
      yaw: 0,
      motion: "circle",
      speed: range(rng, 1.6, 2.4),
      phase: rng() * Math.PI * 2,
      colors: ["#111827", "#374151"],
      scale: 1.4
    });
  }
  // Miasma: grey-green wisps rising over the graves and through the streets
  for (let i = 0; i < 14; i++) {
    const nearGraves = i < 6;
    root.actor({
      kind: "sparkle",
      x: nearGraves ? gx + range(rng, -0.5, 4) : range(rng, -wallE * 0.8, wallE * 0.8),
      y: range(rng, 0.2, 1.2),
      z: nearGraves ? gz + range(rng, -2, 0.5) : range(rng, -wallE * 0.8, wallE * 0.8),
      yaw: 0,
      motion: "float",
      speed: range(rng, 0.15, 0.3),
      phase: rng() * 10,
      colors: [pick(rng, ["#84a98c", "#6b8f71", "#a3b18a"])]
    });
  }
}

/* ------------------------------ Plaza landmarks --------------------------- */

const FOUNTAIN_Z = 8;
const DRAGON_SPOT: [number, number] = [-7.5, 9];
const SPIRE_SPOT: [number, number] = [7.5, 9];
/** Spymaster's Tower: the back-right corner of the plaza, beside the castle */
const SPY_SPOT: [number, number] = [10.2, -10.4];
const VISITORS_PER_LANDMARK = 2;

interface Landmark {
  x: number;
  z: number;
  r: number; // footprint radius
  gesture: Gesture;
}

type Obstacle = { x: number; z: number; r: number } | { x0: number; x1: number; z0: number; z1: number };

/** Everything a plaza walker must not pass through (circles and rectangles in world x/z) */
function plazaObstacles(up: Record<string, number>, plazaTier: number): Obstacle[] {
  const obs: Obstacle[] = [
    { x0: -7.0, x1: 7.0, z0: -7.6, z1: 1.8 }, // largest castle stage
    { x: 0, z: FOUNTAIN_Z, r: plazaTier >= 3 ? 3.9 : plazaTier >= 1 ? 2.5 : 1.8 },
    // Dragon statue (moss plinth before it is built) and Mana Spire (village bench before it is built)
    { x: DRAGON_SPOT[0], z: DRAGON_SPOT[1], r: dragonRadius(up.dragon_statue ?? 0) },
    { x: SPIRE_SPOT[0], z: SPIRE_SPOT[1], r: (up.mana_spire ?? 0) >= 4 ? 1.8 : 1.6 }
  ];
  if (up.spymaster) obs.push({ x: SPY_SPOT[0], z: SPY_SPOT[1], r: 1.9 });
  if ((up.banners ?? 0) >= 2) for (const sx of [-1, 1]) obs.push({ x: sx * (ROAD_HALF + 1.2), z: PLAZA_HALF - 0.8, r: 0.8 });
  if (up.market)
    for (const sx of [-1, 1]) for (const z of MARKET_STALL_Z) obs.push({ x0: sx > 0 ? 9.4 : -11.8, x1: sx > 0 ? 11.8 : -9.4, z0: z - 1.3, z1: z + 1.3 });
  return obs;
}

const blocked = (x: number, z: number, obs: Obstacle[]) =>
  Math.abs(x) > PLAZA_HALF - 0.6 ||
  Math.abs(z) > PLAZA_HALF - 0.6 ||
  obs.some((o) => ("r" in o ? Math.hypot(x - o.x, z - o.z) < o.r : x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1));

/** A straight approach from 2–3.5 units out to a viewing spot just outside the landmark, clear of every obstacle */
function visitRoute(rng: Rng, lm: Landmark, obs: Obstacle[]): { from: [number, number]; to: [number, number] } | null {
  for (let tries = 0; tries < 24; tries++) {
    const a = rng() * Math.PI * 2;
    const near = lm.r + 1.0;
    const far = near + range(rng, 2, 3.5);
    const to: [number, number] = [lm.x + Math.cos(a) * near, lm.z + Math.sin(a) * near];
    const from: [number, number] = [lm.x + Math.cos(a) * far, lm.z + Math.sin(a) * far];
    let clear = true;
    for (let i = 0; i <= 16 && clear; i++) {
      const f = i / 16;
      clear = !blocked(from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, obs);
    }
    if (clear) return { from, to };
  }
  return null;
}

/* ========================================================================= */
/* CITY IMPROVEMENTS (bought with resources)                                 */
/* ========================================================================= */

/** Market stalls stand at x = ±MARKET_STALL_X facing the plaza; shoppers stand at their counters */
const MARKET_STALL_X = PLAZA_HALF - 2.4;
const MARKET_STALL_Z = [-6, -1.5, 3];
const MARKET_FRONT_X = MARKET_STALL_X - 1.4;

/** Corner towers of stone walls and up (tier 2+): their diameter */
const cornerTowerD = (wallTier: number) => (wallTier >= 5 ? 4.2 : wallTier === 4 ? 3.6 : 2.6);

/**
 * The ground outline the city's outer walls stand on, pushed out past everything on them (corner towers and their
 * roofs), as a closed polygon of [x, z] corners going round. The 🛡️ Royal Shield's aura rises along it. The walls
 * run in a square today, so this is a square; if their line changes shape, trace it here.
 */
export function cityWallFootprint(kingdom: DeveloperKingdom, layout: CityLayout): Array<[number, number]> {
  const wallTier = kingdom.upgrades?.walls ?? 0;
  const wallE = layout.half + 0.9; // as in buildCityScene
  const reach = (wallTier >= 2 ? (cornerTowerD(wallTier) * 1.18) / 2 : 0.3) + 0.6;
  const r = wallE + reach;
  return [
    [-r, -r],
    [r, -r],
    [r, r],
    [-r, r]
  ];
}

function buildImprovements(root: Builder, ctx: Ctx, up: Record<string, number>, E: number, wallE: number) {
  const { pal, rng } = ctx;

  // ---- Walls: basic fence (0) → palisade (1) → stone (2) → fortress (3) → bastion (4) → citadel ramparts (5)
  const wallTier = up.walls ?? 0;
  const gap = (side: "front" | "other") => (side === "front" ? 3.3 : ROAD_HALF + 0.6);
  const sides: Array<{ a: [number, number]; b: [number, number]; front: boolean }> = [
    { a: [-wallE, wallE], b: [wallE, wallE], front: true },
    { a: [-wallE, -wallE], b: [wallE, -wallE], front: false },
    { a: [-wallE, -wallE], b: [-wallE, wallE], front: false },
    { a: [wallE, -wallE], b: [wallE, wallE], front: false }
  ];
  if (wallTier === 0) {
    // Every city starts with a low split-rail fence: posts and two rails
    for (const side of sides) {
      const g = gap(side.front ? "front" : "other");
      const horizontal = side.a[1] === side.b[1];
      for (const [from, to] of [
        [-wallE, -g],
        [g, wallE]
      ]) {
        const len = to - from;
        const mid = (from + to) / 2;
        const [x, z] = horizontal ? [mid, side.a[1]] : [side.a[0], mid];
        for (const y of [0.4, 0.8]) root.add("box", x, y, z, horizontal ? len : 0.08, 0.1, horizontal ? 0.08 : len, pal.wood, { mat: "wood" });
        const n = Math.max(1, Math.round(len / 2.4));
        for (let i = 0; i <= n; i++) {
          const t = from + (len * i) / n;
          const [px, pz] = horizontal ? [t, side.a[1]] : [side.a[0], t];
          root.add("box", px, 0, pz, 0.18, 1.05, 0.18, pal.trunk, { mat: "wood" });
        }
      }
    }
  } else {
    for (const side of sides) {
      const g = gap(side.front ? "front" : "other");
      const horizontal = side.a[1] === side.b[1];
      const segments: Array<[number, number]> = [
        [-wallE, -g],
        [g, wallE]
      ];
      for (const [from, to] of segments) {
        const len = to - from;
        const mid = (from + to) / 2;
        const [x, z] = horizontal ? [mid, side.a[1]] : [side.a[0], mid];
        if (wallTier === 1) {
          const civ = ctx.civ;
          const post = (spacing: number, fn: (px: number, pz: number, i: number) => void) => {
            const n = Math.max(1, Math.round(len / spacing));
            for (let i = 0; i <= n; i++) {
              const t = from + (len * i) / n;
              const [px, pz] = horizontal ? [t, side.a[1]] : [side.a[0], t];
              fn(px, pz, i);
            }
          };
          if (civ === "elf") {
            // Living hedge with white posts and lanterns
            root.add("box", x, 0, z, horizontal ? len : 0.9, 1.6, horizontal ? 0.9 : len, pal.foliage, { mat: "leaf" });
            post(3, (px, pz) => {
              root.add("cyl", px, 0, pz, 0.26, 2.1, 0.26, pal.trunk, { mat: "wood" });
              root.add("sphere", px, 2.1, pz, 0.3, 0.32, 0.3, pal.foliage2); // lanterns, unlit at tier 1
              lanternFrame(root.add.bind(root), px, 2.1, pz, 0.3, 0.34, "#a8a29e", { mat: "dull" });
            });
          } else if (civ === "dwarf") {
            // Dry-stone wall with capstones
            root.add("box", x, 0, z, horizontal ? len : 0.9, 1.5, horizontal ? 0.9 : len, pal.stone, { mat: "masonry" });
            post(1.6, (px, pz) => root.add("box", px, 1.5, pz, 0.7, 0.3, 0.7, pal.wall, { mat: "masonry", hdShape: "block" }));
          } else if (civ === "arcane") {
            // Crystal pylons linked by a faint ward
            root.add("box", x, 1.2, z, horizontal ? len : 0.06, 0.06, horizontal ? 0.06 : len, pal.wood, { mat: "dull" }); // the ward, dark at tier 1
            post(2.5, (px, pz) => {
              root.add("cyl", px, 0, pz, 0.6, 0.4, 0.6, pal.stone, { mat: "masonry" });
              root.add("octa", px, 0.4, pz, 0.36, 1.9, 0.36, pal.foliage, { mat: "gem" }); // pylons, unlit at tier 1
            });
          } else {
            // Log palisade (orcs add spikes and skulls)
            post(0.55, (px, pz, i) => {
              root.add("cyl", px, 0, pz, 0.34, 2.0, 0.34, pal.wood, { mat: "wood" });
              root.add("cone", px, 2.0, pz, 0.34, 0.45, 0.34, pal.wood, { mat: "wood" });
              if (civ === "orc" && i % 5 === 0) {
                root.add("sphere", px, 1.55, pz, 0.36, 0.32, 0.36, pal.bone, { hd: false });
                // HD: a skull nailed to the stake, facing out: cranium, jaw and two dark sockets (shapes the walls
                // already use, so it costs no draw of its own)
                const out = horizontal ? (side.a[1] > 0 ? 0 : Math.PI) : side.a[0] > 0 ? Math.PI / 2 : -Math.PI / 2;
                const sk = root.child(px + Math.sin(out) * 0.2, pz + Math.cos(out) * 0.2, out);
                sk.add("sphere", 0, 1.56, 0, 0.32, 0.3, 0.34, pal.bone, hdo("bone"));
                sk.add("box", 0, 1.5, 0.08, 0.2, 0.1, 0.18, pal.bone, hdo("bone"));
                for (const ex of [-0.07, 0.07]) sk.add("sphere", ex, 1.68, 0.15, 0.08, 0.07, 0.06, "#292524", hdo("bone"));
              }
            });
            // HD: rope lashed along the stakes, twice
            const outward = horizontal ? Math.sign(side.a[1]) : Math.sign(side.a[0]);
            for (const y of [0.55, 1.45]) {
              const [ax, az] = horizontal ? [from, side.a[1] + outward * 0.19] : [side.a[0] + outward * 0.19, from];
              const [bx, bz] = horizontal ? [to, side.a[1] + outward * 0.19] : [side.a[0] + outward * 0.19, to];
              along(root.add.bind(root), "cyl", [ax, y, az], [bx, y, bz], 0.05, 0.05, "#a8a29e", { mat: "cloth", hd: true });
            }
          }
        } else {
          const h = wallTier >= 5 ? 5.6 : wallTier === 4 ? 4.6 : wallTier === 3 ? 3.6 : 2.4;
          const thick = wallTier >= 5 ? 2.0 : wallTier === 4 ? 1.6 : wallTier === 3 ? 1.2 : 0.8;
          const wallColor = wallTier >= 5 ? "#1e1b2e" : pal.stone;
          root.add("box", x, 0, z, horizontal ? len : thick, h, horizontal ? thick : len, wallColor, { mat: "masonry" });
          // HD: arrow slits through the curtain wall
          for (let t = from + 1.6; t < to - 1.0; t += 2.2) {
            const [sx, sz] = horizontal ? [t, side.a[1]] : [side.a[0], t];
            root.add("box", sx, h * 0.45, sz, horizontal ? 0.12 : thick + 0.1, 0.55, horizontal ? thick + 0.1 : 0.12, "#1c1917", { mat: "stone", hd: true });
          }
          if (wallTier === 4) {
            // Iron-banded curtain wall & walkway trim
            for (const by of [h * 0.35, h * 0.75]) {
              root.add("box", x, by, z, horizontal ? len : thick + 0.08, 0.14, horizontal ? thick + 0.08 : len, "#3f3f46", { mat: "iron" });
            }
          } else if (wallTier >= 5) {
            // Mithril-veined obsidian rampart trim
            root.add("box", x, h * 0.45, z, horizontal ? len : thick + 0.08, 0.14, horizontal ? thick + 0.08 : len, "#67e8f9", { glow: true });
            root.add("box", x, h * 0.82, z, horizontal ? len : thick + 0.1, 0.16, horizontal ? thick + 0.1 : len, "#94a3b8", { mat: "steel" });
            rampartHd(root, x, z, horizontal, len, thick, h, from, to, horizontal ? side.a[1] : side.a[0]);
          }
          const n = Math.floor(len / 1.1);
          for (let i = 0; i < n; i++) {
            const t = from + 0.55 + i * 1.1;
            const [cx, cz] = horizontal ? [t, side.a[1]] : [side.a[0], t];
            if (wallTier >= 4) {
              // Twin-crenellated walkway merlons (outer and inner parapets)
              const offset = thick * 0.34;
              for (const s of [-offset, offset]) {
                const [mx, mz] = horizontal ? [cx, cz + s] : [cx + s, cz];
                root.add("box", mx, h, mz, horizontal ? 0.55 : 0.32, 0.5, horizontal ? 0.32 : 0.55, wallColor, { mat: "masonry" });
                // HD: Citadel Ramparts cap every merlon in steel
                if (wallTier >= 5) root.add("box", mx, h + 0.5, mz, horizontal ? 0.63 : 0.4, 0.06, horizontal ? 0.4 : 0.63, "#94a3b8", hdo("steel", { hdShape: "slab" }));
              }
            } else {
              root.add("box", cx, h, cz, horizontal ? 0.55 : thick, 0.45, horizontal ? thick : 0.55, wallColor, { mat: "masonry" });
            }
          }
          if (wallTier >= 3) {
            // Watchtowers along the wall (spacing: tier 3 = 12u, tier 4 = 10u, tier 5 = 8u)
            const spacing = wallTier >= 5 ? 8 : wallTier === 4 ? 10 : 12;
            const towerH = wallTier >= 5 ? 7.6 : wallTier === 4 ? 6.4 : 5.2;
            const towerD = wallTier >= 5 ? 2.5 : wallTier === 4 ? 2.25 : 2.0;
            for (let t = from + 5; t < to - 3; t += spacing) {
              const [tx, tz] = horizontal ? [t, side.a[1]] : [side.a[0], t];
              root.add("cyl", tx, 0, tz, towerD, towerH, towerD, wallColor, { mat: "masonry" });
              root.add("cone", tx, towerH, tz, towerD * 1.25, 1.9, towerD * 1.25, pal.roof, wallTier >= 5 ? { mat: "tiles" } : {});
              root.add("box", tx, towerH * 0.65, tz, towerD + 0.06, 0.4, 0.25, pal.window, { glow: true });
              towerHd(root, tx, tz, towerD, towerH, wallColor, wallTier);
              if (wallTier >= 5) citadelTowerHd(root, tx, tz, towerD, towerH, 1.9, BANNER_CLOTH[ctx.civ]);
            }
          }
        }
      }
    }
    if (wallTier >= 2) {
      const cornerH = wallTier >= 5 ? 8.8 : wallTier === 4 ? 7.4 : wallTier === 3 ? 6.0 : 4.0;
      const cornerD = cornerTowerD(wallTier);
      const cornerColor = wallTier >= 5 ? "#1e1b2e" : pal.stone;
      for (const [x, z] of [
        [-wallE, -wallE],
        [wallE, -wallE],
        [-wallE, wallE],
        [wallE, wallE]
      ]) {
        root.add("cyl", x, 0, z, cornerD, cornerH, cornerD, cornerColor, { mat: "masonry" });
        root.add("cone", x, cornerH, z, cornerD * 1.18, 2.2, cornerD * 1.18, pal.roof, wallTier >= 5 ? { mat: "tiles" } : {});
        // The civilization's flag on every corner tower (uncommon: the accent and a prop), streaming from tier 3
        root.add("cyl", x, cornerH + 2.2, z, 0.08, 1.4, 0.08, "#3f3f46", { mat: wallTier >= 3 ? "iron" : "dull" });
        root.add("box", x + 0.45, cornerH + 3.0, z, 0.8, 0.55, 0.04, BANNER_CLOTH[ctx.civ], wallTier >= 3 ? { idle: IDLE_KIND.flutter, mat: "cloth" } : { mat: "cloth" });
        if (wallTier >= 4) {
          root.add("box", x, cornerH * 0.6, z, cornerD + 0.08, 0.22, cornerD + 0.08, "#3f3f46", { mat: "iron" });
        }
        towerHd(root, x, z, cornerD, cornerH, cornerColor, wallTier, 2.2);
        if (wallTier >= 5) {
          // Glowing beacon brazier crowning each corner keep
          root.add("cyl", x, cornerH + 2.1, z, 0.7, 0.3, 0.7, "#3f3f46", { mat: "iron" });
          root.add("sphere", x, cornerH + 2.45, z, 0.55, 0.65, 0.55, pal.accent, { glow: true });
          citadelTowerHd(root, x, z, cornerD, cornerH, 2.2, null);
          beaconHd(root, x, cornerH + 2.1, z, 0.7, pal.accent);
        }
      }
    }
  }

  // ---- Royal Gardens along the cross road, styled per civilization: country clover (0) → flower beds (1) → fruit trees (2)
  // → glass conservatory domes (3) → crystal irrigation canals (4) → enchanted glowing blossoms (5)
  const gardenTier = up.gardens ?? 0;
  if (gardenTier === 0) {
    // Clover and country lawn tufts framing the road edges
    for (let d = PLAZA_HALF + 2; d < E - 3; d += 2.4) {
      for (const dir of [-1, 1]) {
        for (const s of [-1, 1]) {
          root.add("sphere", dir * (d + range(rng, -0.4, 0.4)), 0, s * (ROAD_HALF + range(rng, 1.0, 1.8)), range(rng, 0.7, 1.1), 0.18, range(rng, 0.5, 0.8), pick(rng, ["#65a30d", "#4d7c0f", "#84cc16"]), { detail: true });
        }
      }
    }
  } else {
    const fl = CIV_FLOWERS[ctx.civ];
    for (let d = PLAZA_HALF + 2; d < E - 3; d += 3.2) {
      for (const dir of [-1, 1]) {
        for (const s of [-1, 1]) {
          const x = dir * d;
          const z = s * (ROAD_HALF + 1.3);
          gardenBed(root, ctx, x, z, { ...fl, glow: fl.glow && gardenTier >= 3 });
          if (gardenTier >= 2) {
            // Fruit tree behind every bed
            const tz = s * (ROAD_HALF + 3.0);
            root.add("cyl", x, 0, tz, 0.18, 1.1, 0.18, pal.trunk, { mat: "wood", hdShape: "trunk" });
            root.add("sphere", x, 0.95, tz, 1.1, 1.0, 1.1, pal.foliage, gardenTier >= 3 ? { idle: IDLE_KIND.sway, mat: "leaf", hdShape: "canopy" } : { mat: "leaf", hdShape: "canopy" });
            for (let k = 0; k < 3; k++) root.add("sphere", x - 0.3 + k * 0.3, 1.3 + (k % 2) * 0.2, tz + s * 0.5, 0.16, 0.16, 0.16, pick(rng, ["#ef4444", "#f97316", "#facc15"]), { detail: true });
          }
          if (gardenTier >= 4) {
            // Crystal irrigation canal between the bed and the tree
            root.add("box", x, 0, s * (ROAD_HALF + 2.15), 2.4, 0.08, 0.32, "#7dd3fc", { glow: true });
            // HD: the canal runs between kerbs of dressed stone
            for (const k of [-1, 1]) root.add("box", x, 0, s * (ROAD_HALF + 2.15) + k * 0.24, 2.5, 0.14, 0.12, pal.stone, { mat: "masonry", hd: true });
          }
          if (gardenTier >= 5) {
            // Enchanted blossoms floating over the bed
            root.add("octa", x, 1.3, z, 0.2, 0.3, 0.2, pick(rng, fl.colors), { glow: true, detail: true });
            paradiseHd(root, x, z, fl.colors, pal.foliage, dir + s + 2);
          }
        }
      }
    }
    if (gardenTier >= 3) {
      // Glass-domed conservatories at both ends of the cross road's garden rows
      for (const dir of [-1, 1]) {
        for (const s of [-1, 1]) {
          const x = dir * (PLAZA_HALF + 1.2);
          const z = s * (ROAD_HALF + 5.2);
          root.add("cyl", x, 0, z, 2.6, 0.4, 2.6, pal.stone, { mat: "masonry" });
          root.add("sphere", x, 0.1, z, 2.3, 2.2, 2.3, "#bae6fd", { glow: true });
          root.add("cone", x, 2.3, z, 0.3, 0.5, 0.3, GOLD, { mat: "gold" });
          if (gardenTier >= 5) domeHd(root, x, z, fl.colors);
          // HD: gilt ribs over the glass dome (rare: its metal)
          for (const [u, v] of [[[1, 0, 0], [0, 1, 0]], [[0, 0, 1], [0, 1, 0]]] as Array<[V3, V3]>) arc(root.add.bind(root), [x, 1.2, z], u, v, 1.17, 0.05, Math.PI - 0.05, 7, 0.05, GOLD, { mat: "gold", hd: true }, "cyl");
          if (gardenTier >= 4) {
            // Butterflies circling the dome
            for (let k = 0; k < 3; k++) {
              const a = (k / 3) * Math.PI * 2;
              root.add("octa", x + Math.cos(a) * 1.7, 1.6 + (k % 2) * 0.4, z + Math.sin(a) * 1.7, 0.26, 0.04, 0.18, pick(rng, fl.colors), { idle: IDLE_KIND.spin, pivot: [x, z], phase: 0.01 + a, detail: true });
            }
          }
        }
      }
    }
  }

  // ---- Market Square: stalls and traders around the plaza (shoppers are added in buildCityScene): bazaar stalls (1)
  // → crates & weighing scales (2) → stone back walls under tiled roofs (3) → gilded strongboxes (4) → glowing trade lanterns (5)
  const marketTier = up.market ?? 0;
  if (marketTier >= 1) {
    let i = 0;
    for (const sx of [-1, 1]) {
      for (const z of MARKET_STALL_Z) {
        const stall = root.child(sx * MARKET_STALL_X, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
        marketStall(stall, ctx, i++, marketTier);
        person(stall, ctx, "villager", 0, -0.1, "idle");
        if (marketTier >= 2) {
          // Stacked crates and a weighing scale beside the counter
          stall.add("box", 1.05, 0.06, 0.3, 0.45, 0.45, 0.45, pal.wood, { mat: "wood" });
          stall.add("box", 1.05, 0.51, 0.3, 0.32, 0.32, 0.32, pal.wood, { ry: 0.4, mat: "wood" });
          stall.add("cyl", -1.05, 0.06, 0.3, 0.06, 0.8, 0.06, "#3f3f46", { mat: "iron" });
          stall.add("box", -1.05, 0.86, 0.3, 0.55, 0.04, 0.06, "#b08d57", { mat: "gold" });
          // HD: battens on the crate, the scale's pans hanging on their cords
          for (const y of [0.12, 0.42]) stall.add("box", 1.05, y, 0.3, 0.5, 0.04, 0.5, "#57391f", { mat: "wood", hd: true });
          for (const sx of [-1, 1]) {
            stall.add("cyl", -1.05 + sx * 0.24, 0.66, 0.3, 0.012, 0.2, 0.012, "#a8a29e", { mat: "cloth", hd: true });
            stall.add("cyl", -1.05 + sx * 0.24, 0.63, 0.3, 0.18, 0.03, 0.18, "#b08d57", { mat: "gold", hd: true });
          }
        }
        if (marketTier >= 3) {
          // Stone back wall under a tiled roof
          stall.add("box", 0, 0.06, -1.2, 2.1, 1.75, 0.16, pal.stone, { mat: "masonry", hdShape: "slab" });
          stall.add("prism", 0, 1.81, -1.2, 2.3, 0.45, 0.5, pal.roof);
          stall.add("cyl", 0.95, 2.1, -1.2, 0.04, 0.8, 0.04, "#3f3f46", { mat: "iron" }); // a trader's pennant streaming over it
          stall.add("box", 1.17, 2.55, -1.2, 0.4, 0.26, 0.03, BANNER_CLOTH[ctx.civ], { idle: IDLE_KIND.flutter, mat: "cloth" });
        }
        if (marketTier >= 4) {
          // Gilded strongbox
          stall.add("box", 1.05, 0.06, -0.45, 0.5, 0.36, 0.36, "#3f3f46", { mat: "iron" });
          stall.add("box", 1.05, 0.18, -0.45, 0.56, 0.1, 0.42, GOLD, { glow: true }); // gilded, gleaming
          // HD: a gold lock and studs on the strongbox (epic: the most detail)
          stall.add("box", 1.05, 0.28, -0.22, 0.12, 0.12, 0.06, GOLD, { mat: "gold", hd: true });
          for (const sx of [-1, 1]) stall.add("sphere", 1.05 + sx * 0.2, 0.36, -0.25, 0.05, 0.05, 0.05, GOLD, { mat: "gold", hd: true });
        }
        if (marketTier >= 5) {
          // Glowing trade lantern on a tall pole
          stall.add("cyl", -1.05, 0.06, -0.45, 0.07, 2.3, 0.07, "#3f3f46", { mat: "iron" });
          stall.add("sphere", -1.05, 2.36, -0.45, 0.34, 0.38, 0.34, "#fde047", { glow: true });
          emporiumHd(stall, BANNER_CLOTH[ctx.civ], 0x5ea1 + i);
        }
      }
    }
  }

  // ---- Kingdom Banners: civilization standards along all four main roads, opposite the lamps (1); two grand standards
  // where the front road meets the plaza and hangings on the city gate (2); gilded finials (3); twice as many
  // standards (4); glowing heraldic sigils above every standard (5)
  const bannerTier = up.banners ?? 0;
  if (bannerTier >= 1) {
    const side = ROAD_HALF + 0.45;
    const crown = (b: Builder) => {
      // Gold rod above every civilization's own top ornament (the tallest ends at 4.45)
      if (bannerTier >= 3) {
        b.add("cyl", 0, 3.6, 0, 0.05, 0.95, 0.05, GOLD, { mat: "gold" });
        b.add("octa", 0, 4.55, 0, 0.24, 0.38, 0.24, GOLD, { glow: bannerTier >= 5, mat: "gold" });
      }
      if (bannerTier >= 5) {
        b.add("box", 0, 5.1, 0, 0.6, 0.6, 0.06, ctx.pal.accent, { glow: true, ry: Math.PI / 4 });
        warStandardHd(b);
      }
    };
    for (let d = PLAZA_HALF + 3; d < E - 2; d += bannerTier >= 4 ? 3 : 6) {
      // Cloth hangs along local +X, pointing away from the road
      for (const b of [root.child(side, d, 0), root.child(d, -side, Math.PI / 2), root.child(-side, -d, Math.PI), root.child(-d, side, -Math.PI / 2)]) {
        civBanner(b, ctx, 3.6, bannerTier);
        crown(b);
      }
    }
  }
  if (bannerTier >= 2) {
    for (const sx of [-1, 1]) {
      const x = sx * (ROAD_HALF + 1.2);
      root.add("box", x, 0, PLAZA_HALF - 0.8, 0.9, 0.35, 0.9, pal.stone, { mat: "masonry" });
      if (bannerTier >= 5) {
        // HD: the grand standards on a step, a gilt band round the plinth's head
        root.add("box", x, 0, PLAZA_HALF - 0.8, 1.3, 0.14, 1.3, pal.stone, hdo("masonry"));
        root.add("box", x, 0.24, PLAZA_HALF - 0.8, 1.0, 0.07, 1.0, C_GILT, hdo("gold"));
      }
      civBanner(root.child(x, PLAZA_HALF - 0.8, sx > 0 ? 0 : Math.PI, 0.35), ctx, 5.6, bannerTier);
    }
    const gateZ = wallE;
    const cloth = BANNER_CLOTH[ctx.civ];
    for (const sx of [-1, 1]) {
      root.add("box", sx * 2.6, 0.9, gateZ + 0.68, 1.0, 2.6, 0.05, cloth, { mat: "cloth" });
      root.add("box", sx * 2.6, 0.78, gateZ + 0.69, 1.04, 0.14, 0.06, pal.accent, { mat: "cloth" });
      root.add("box", sx * 2.6, 1.95, gateZ + 0.71, 0.34, 0.34, 0.04, pal.accent, { glow: ctx.civ === "arcane" || ctx.civ === "dwarf" });
    }
  }

  // ---- Dragon Statue at the front-left of the plaza: a moss-covered runic plinth until it is built
  const dragonTier = up.dragon_statue ?? 0;
  if (dragonTier > 0) dragonStatue(root.child(DRAGON_SPOT[0], DRAGON_SPOT[1], Math.PI / 5), ctx, dragonTier);
  else mossPlinth(root.child(DRAGON_SPOT[0], DRAGON_SPOT[1], Math.PI / 5), ctx);

  // ---- Mana Spire at the front-right of the plaza: a village bench between flowering shrubs until it is built
  const spireTier = up.mana_spire ?? 0;
  if (spireTier > 0) manaSpire(root.child(SPIRE_SPOT[0], SPIRE_SPOT[1]), ctx, spireTier);
  else villageBench(root.child(SPIRE_SPOT[0], SPIRE_SPOT[1], -Math.PI / 5), ctx);

  // ---- Spymaster's Tower at the back-right corner of the plaza, its window turned toward the city gate
  const spyTier = up.spymaster ?? 0;
  if (spyTier > 0) spymasterTower(root.child(SPY_SPOT[0], SPY_SPOT[1], Math.PI / 6), ctx, spyTier);

  // ---- Improvements on the rarity ladder: tier 3 rare, tier 4 epic, tier 5 legendary (the ones that stand as one
  // structure: the city gate, the fountain, the dragon and the spire)
  const improvementFx = (x: number, z: number, size: number, tier: number) => {
    const fx = IMPROVEMENT_FX[tier];
    if (fx) root.fx(x, z, size, fx, tier >= 5 ? GOLD : undefined);
  };
  improvementFx(0, wallE, 3.2, wallTier);
  improvementFx(0, FOUNTAIN_Z, 2.4, up.plaza ?? 0);
  improvementFx(DRAGON_SPOT[0], DRAGON_SPOT[1], dragonRadius(dragonTier), dragonTier);
  improvementFx(SPIRE_SPOT[0], SPIRE_SPOT[1], 1.6, spireTier);
  improvementFx(SPY_SPOT[0], SPY_SPOT[1], 1.6, spyTier);
}

/** Improvement tier → its place on the rarity ladder */
const IMPROVEMENT_FX: Record<number, PlotFx["tier"]> = { 3: "rare", 4: "epic", 5: "legendary" };

/* ---- The improvements' HD versions: detail drawn only with the model kit (`hd: true`), on the improvement ladder ---- */

/** Adds a part by its centre (the Builder adds by its foot) */
const centred =
  (b: Builder): Add =>
  (shape, x, y, z, w, h, d, color, o = {}) =>
    b.add(shape, x, y - h / 2, z, w, h, d, color, o);
const hdo = (mat: Surface, o: AddOpts = {}): AddOpts => ({ ...o, mat, hd: true });

/**
 * The fountain's HD detail: rolled lips round both basins (gilt on the Sovereign Spring), four spouts on the column
 * pouring into the lower basin (their mouths gilt from Aegis Cascade on)
 */
function fountainHd(imp: Builder, tier: number, stone: string, water: string) {
  const add = imp.add.bind(imp);
  // Gilt rims on the Sovereign Spring
  const [rim, rimMat] = tier >= 5 ? [GOLD, hdo("gold")] : [stone, hdo("masonry")];
  arc(add, [0, 0.66, FOUNTAIN_Z], [1, 0, 0], [0, 0, 1], 2.27, 0, Math.PI * 2, 24, 0.12, rim, rimMat, "cyl");
  arc(add, [0, 1.85, FOUNTAIN_Z], [1, 0, 0], [0, 0, 1], 1.17, 0, Math.PI * 2, 16, 0.09, rim, rimMat, "cyl");
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    along(add, "cone", [c * 0.36, 1.26, FOUNTAIN_Z + s * 0.36], [c * 0.62, 1.2, FOUNTAIN_Z + s * 0.62], 0.12, 0.12, tier >= 3 ? GOLD : stone, hdo(tier >= 3 ? "gold" : "masonry"));
    along(add, "cyl", [c * 0.6, 1.18, FOUNTAIN_Z + s * 0.6], [c * 1.25, 0.72, FOUNTAIN_Z + s * 1.25], 0.07, 0.07, water, hdo("gel"));
  }
}

/** The city gate's HD detail: a portcullis drawn up under the lintel (from Stone Walls; iron from Fortress Walls on) */
function gateHd(imp: Builder, gateZ: number, gateH: number, tier: number) {
  if (tier < 2) return;
  const mat: Surface = tier >= 5 ? "steel" : tier >= 3 ? "iron" : "dull";
  const foot = gateH - 0.7;
  for (let k = 0; k < 9; k++) {
    const x = -1.8 + k * 0.45;
    imp.add("box", x, foot - 0.75, gateZ, 0.07, 0.77, 0.07, tier >= 5 ? "#94a3b8" : "#3f3f46", hdo(mat));
    // Citadel Ramparts: gilt spikes
    imp.add("cone", x, foot - 0.9, gateZ, 0.09, 0.16, 0.09, tier >= 5 ? C_GILT : "#52525b", hdo(tier >= 5 ? "gold" : mat, { rx: Math.PI }));
  }
  for (const y of [foot - 0.35, foot - 0.65]) imp.add("box", 0, y, gateZ, 3.7, 0.07, 0.09, "#3f3f46", hdo(mat));
}

/** A wall tower's HD detail: a corbelled cornice under its roof, arrow slits, a finial on its cone (iron, gilt on bastions) */
function towerHd(root: Builder, x: number, z: number, d: number, h: number, stone: string, tier: number, roofH = 1.9) {
  root.add("cyl", x, h - 0.22, z, d + 0.24, 0.22, d + 0.24, stone, hdo("masonry"));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    root.add("box", x + Math.sin(a) * d * 0.5, h * 0.4, z + Math.cos(a) * d * 0.5, 0.12, 0.6, 0.1, "#1c1917", hdo("stone", { ry: a }));
  }
  const finial: Surface = tier >= 4 ? "gold" : tier >= 3 ? "iron" : "dull";
  root.add("sphere", x, h + roofH - 0.06, z, 0.22, 0.22, 0.22, tier >= 4 ? GOLD : "#3f3f46", hdo(finial));
}

/**
 * The dragon's HD detail, in its statue's frame (scaled with it): an open jaw with teeth and fire in its throat,
 * nostrils, two eyes under heavy brows, four legs gripping the plinth (gilt claws from Elder Dragon Statue on), a spade on
 * its tail
 */
function dragonHd(add: Add, y: number, look: { body: string; eye: string }, tier: number) {
  const claw = tier >= 3 ? GOLD : "#e7e5e4";
  const clawMat: Surface = tier >= 3 ? "gold" : "bone";
  for (const sx of [-1, 1]) {
    for (const [lz, pz] of [[0.55, 0.68], [-0.55, -0.42]]) {
      add("limb", sx * 0.44, 0.86 + y, lz, 0.3, 0.55, 0.32, look.body, hdo("plain"));
      add("egg", sx * 0.44, 0.86 + y, pz, 0.32, 0.14, 0.38, look.body, hdo("plain"));
      for (let k = 0; k < 3; k++) add("cone", sx * 0.44 + (k - 1) * 0.09, 0.83 + y, pz + 0.2, 0.05, 0.14, 0.05, claw, hdo(clawMat, { rx: Math.PI / 2 }));
    }
    add("cone", sx * 0.15, 2.4 + y, 1.62, 0.05, 0.1, 0.05, "#f5f5f4", hdo("bone"));
    add("cone", sx * 0.15, 2.4 + y, 1.78, 0.05, 0.1, 0.05, "#f5f5f4", hdo("bone"));
    add("sphere", sx * 0.09, 2.66 + y, 1.86, 0.07, 0.05, 0.05, "#1c1917", hdo("plain"));
    add("sphere", sx * 0.2, 2.68 + y, 1.52, 0.1, 0.08, 0.08, look.eye, hdo("plain", { glow: true }));
    add("box", sx * 0.19, 2.78 + y, 1.5, 0.16, 0.05, 0.12, look.body, hdo("plain", { rz: -sx * 0.3 }));
  }
  add("snout", 0, 2.26 + y, 1.42, 0.42, 0.14, 0.75, look.body, hdo("plain", { rx: 0.12 }));
  add("sphere", 0, 2.36 + y, 1.66, 0.18, 0.08, 0.3, look.eye, hdo("plain", { glow: true }));
  add("octa", 0, 1.71 + y, -2.25, 0.36, 0.06, 0.3, look.body, hdo("plain"));
}

/** The standing stone's HD detail: moss at its foot, small stones round it; pale crystals growing there once it wakes */
function monolithHd(base: Builder, tier: number, stone: string) {
  for (const [x, z] of [[0.38, 0.2], [-0.3, -0.24], [0.05, 0.32]]) base.add("canopy", x, 0.34, z, 0.36, 0.16, 0.3, "#4d7c0f", hdo("leaf"));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.6;
    base.add("boulder", Math.cos(a) * 0.72, 0.34, Math.sin(a) * 0.72, 0.24, 0.16, 0.2, stone, hdo("stone", { ry: a }));
  }
  if (tier < 2) return;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 1.3;
    along(base.add.bind(base), "octa", [Math.cos(a) * 0.45, 0.34, Math.sin(a) * 0.45], [Math.cos(a) * 0.62, 0.78 - (k % 2) * 0.15, Math.sin(a) * 0.62], 0.13, 0.13, "#a5f3fc", hdo("gem"));
  }
}

/** The timber lookout's HD detail: a ladder up its front and braces between its posts */
function lookoutHd(b: Builder, trunk: string) {
  const add = b.add.bind(b);
  for (const sx of [-1, 1]) along(add, "cyl", [sx * 0.18, 0, 1.0], [sx * 0.18, 3.0, 0.86], 0.05, 0.05, trunk, hdo("wood"));
  for (let k = 0; k < 8; k++) b.add("box", 0, 0.32 + k * 0.34, 0.99 - k * 0.016, 0.4, 0.04, 0.04, trunk, hdo("wood"));
  for (const [a, c] of [[[-0.7, -0.7], [0.7, -0.7]], [[-0.7, -0.7], [-0.7, 0.7]], [[0.7, -0.7], [0.7, 0.7]]] as Array<[[number, number], [number, number]]>) {
    along(add, "box", [a[0], 0.3, a[1]], [c[0], 2.7, c[1]], 0.08, 0.06, trunk, hdo("wood"));
    along(add, "box", [c[0], 0.3, c[1]], [a[0], 2.7, a[1]], 0.08, 0.06, trunk, hdo("wood"));
  }
}

/**
 * The stone towers' HD detail: an arch over the door and bands on it (iron from Cipher Tower on), sills under the
 * windows, a finial on the roof (gilt from Cipher Tower on), a brass rim round the lens, caps on the buttresses
 */
function spyTowerHd(b: Builder, tier: number, h: number, stone: string) {
  const add = b.add.bind(b);
  arc(add, [0, 1.5, 1.08], [1, 0, 0], [0, 1, 0], 0.34, 0, Math.PI, 6, 0.09, stone, hdo("masonry"), "box");
  for (const y of [0.7, 1.2]) b.add("box", 0, y, 1.12, 0.56, 0.05, 0.04, "#3f3f46", hdo(tier >= 3 ? "iron" : "dull"));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    b.add("box", Math.cos(a) * 1.08, 0.34 + h * (0.35 + k * 0.15), Math.sin(a) * 1.08, 0.3, 0.06, 0.26, stone, hdo("masonry", { ry: -a }));
  }
  const top = 0.7 + h;
  if (tier === 2) b.add("sphere", 0, top + 1.52, 0, 0.18, 0.18, 0.18, "#3f3f46", hdo("dull"));
  else if (tier < 5) {
    b.add("cone", 0, top + 1.0 + (tier >= 4 ? 2.4 : 1.8) - 0.08, 0, 0.12, 0.5, 0.12, GOLD, hdo("gold"));
    arc(add, [0, top + 0.5, 0.9], [1, 0, 0], [0, 1, 0], 0.37, 0, Math.PI * 2, 12, 0.06, GOLD, hdo("gold"), "cyl");
  }
  if (tier >= 4) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      b.add("box", Math.cos(a) * 1.15, 0.4 + h * 0.55, Math.sin(a) * 1.15, 0.5, 0.12, 0.5, "#52525b", hdo("masonry", { ry: -a }));
    }
  }
}

/* ---- Tier 5 (legendary) HD: the improvements' top tier and red-star plots, a step above the Wonder town hall's gilt ---- */

const SILVER = "#cbd5e1";
/** The Night Court's banners */
const NIGHT_CLOTH = "#2e1065";

/** The rotation that turns a builder's local +z toward the point (tx, tz) from (x, z) */
const facing = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

/**
 * HD: a cloth banner `w` × `h` streaming from its pole at local `pole` (x, z) (or hanging from a rod, its pole its own
 * centre), with a gilt hem along its foot riding its flutter
 */
function bannerHd(b: Builder, x: number, y0: number, z: number, w: number, h: number, d: number, cloth: string, pole: [number, number], hem = C_GILT) {
  b.add("box", x, y0, z, w, h, d, cloth, hdo("cloth", { idle: IDLE_KIND.flutter, pivot: pole, phase: seedPhase(b, pole[0], pole[1]) }));
  ride(b, b.out.parts.at(-1), "box", x, y0 - 0.02, z, w + 0.1, 0.12, d + 0.1, hem, hdo("cloth"));
}

/** Adds a part that moves exactly as `host` does (its idle: anchor, phase and tempo): a hem or a crest on a cloth that flutters */
function ride(b: Builder, host: Part | undefined, shape: Shape, x: number, y0: number, z: number, w: number, h: number, d: number, color: string, o: AddOpts = {}) {
  b.add(shape, x, y0, z, w, h, d, color, o);
  if (host?.idle) (o.detail ? b.out.detail : b.out.parts).at(-1)!.idle = host.idle;
}

/** HD: sparks rising and fading off a fire or a gem (glowing puffs), each on its own phase */
function sparks(b: Builder, x: number, y0: number, z: number, n: number, color: string, size = 0.07) {
  for (let k = 0; k < n; k++) {
    b.add("sphere", x + Math.cos(k * 2.4) * 0.08, y0, z + Math.sin(k * 2.4) * 0.08, size, size, size, color, { glow: true, hd: true, idle: IDLE_KIND.smoke, phase: seedPhase(b, x + k, z) });
  }
}

/** HD: a beacon cauldron's fittings (its Normal bowl `w` wide standing at y0): a gilt rim, iron legs, tongues of flame, sparks */
function beaconHd(b: Builder, x: number, y0: number, z: number, w: number, flame: string) {
  const add = b.add.bind(b);
  const r = w / 2;
  b.add("cyl", x, y0 + w * 0.36, z, w + 0.12, 0.07, w + 0.12, C_GILT, hdo("gold"));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    along(add, "cyl", [x + Math.cos(a) * r * 0.7, y0 + 0.05, z + Math.sin(a) * r * 0.7], [x + Math.cos(a) * (r + 0.28), y0 - 0.45, z + Math.sin(a) * (r + 0.28)], 0.07, 0.07, "#3f3f46", hdo("iron"));
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.add("cone", x + Math.cos(a) * r * 0.45, y0 + w * 0.4, z + Math.sin(a) * r * 0.45, w * 0.32, w * 0.75, w * 0.32, flame, { glow: true, hd: true, idle: IDLE_KIND.pulse, phase: seedPhase(b, x + a, z) });
  }
  sparks(b, x, y0 + w * 0.9, z, 3, "#fde68a");
}

/**
 * Citadel Ramparts, along one wall run (centre x, z; `horizontal` along x): steel mouldings framing the mithril vein and
 * pulsing runes carved in it (between the arrow slits)
 */
function rampartHd(root: Builder, x: number, z: number, horizontal: boolean, len: number, thick: number, h: number, from: number, to: number, line: number) {
  const band = (y: number) =>
    root.add("box", x, y, z, horizontal ? len : thick + 0.12, 0.08, horizontal ? thick + 0.12 : len, SILVER, hdo("steel", { hdShape: "slab" }));
  band(h * 0.45 - 0.1);
  band(h * 0.45 + 0.16);
  for (let t = from + 0.5; t < to - 0.4; t += 2.2) {
    const [rx, rz] = horizontal ? [t, line] : [line, t];
    root.add("box", rx, h * 0.45 + 0.01, rz, horizontal ? 0.12 : thick + 0.2, 0.12, horizontal ? thick + 0.2 : 0.12, "#cffafe", {
      glow: true,
      hd: true,
      idle: IDLE_KIND.pulse,
      phase: seedPhase(root, rx, rz),
      ...(horizontal ? { rz: Math.PI / 4 } : { rx: Math.PI / 4 })
    });
  }
}

/**
 * A Citadel Ramparts tower: machicolation corbels under its cornice, a steel band, and (on the wall towers) a pennant
 * streaming from a steel rod over its finial
 */
function citadelTowerHd(root: Builder, x: number, z: number, d: number, h: number, roofH: number, cloth: string | null) {
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    root.add("box", x + Math.cos(a) * (d / 2 + 0.04), h - 0.62, z + Math.sin(a) * (d / 2 + 0.04), 0.16, 0.4, 0.16, "#3b3654", hdo("masonry", { hdShape: "slab" }));
  }
  root.add("cyl", x, h * 0.3, z, d + 0.12, 0.12, d + 0.12, SILVER, hdo("steel"));
  if (!cloth) return;
  root.add("cyl", x, h + roofH, z, 0.05, 1.0, 0.05, SILVER, hdo("steel"));
  root.add("sphere", x, h + roofH + 0.96, z, 0.1, 0.1, 0.1, C_GILT, hdo("gold"));
  bannerHd(root, x + 0.38, h + roofH + 0.45, z, 0.7, 0.34, 0.03, cloth, [x, z]);
}

/**
 * Imperial Highway: a triumphal arch where a road leaves the plaza (`pillar(lat)` → its pillars' spots, `span` across):
 * fluted pillars with gilt astragals and bands, a cornice with gilt cresting, gilt suns (rays turning round the lit
 * balls) and two banners hanging under the span
 */
function triumphHd(imp: Builder, pillar: (lat: number) => [number, number], axis: "x" | "z", span: number, cloth: string) {
  const add = imp.add.bind(imp);
  const marble = "#f5f5f4";
  for (const s of [-1, 1]) {
    const [x, z] = pillar(s * (ROAD_HALF + 0.45));
    // Fluting: three ribs down each face
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const o of [-0.13, 0, 0.13]) {
        imp.add("box", x + nx * 0.27 + nz * o, 0.42, z + nz * 0.27 + nx * o, nx ? 0.06 : 0.05, 2.36, nx ? 0.05 : 0.06, marble, hdo("masonry", { hdShape: "slab" }));
      }
    }
    imp.add("box", x, 0.32, z, 0.6, 0.06, 0.6, C_GILT, hdo("gold"));
    imp.add("box", x, 2.84, z, 0.6, 0.06, 0.6, C_GILT, hdo("gold"));
    // The lit ball as a sun: rays turning round it
    const ph = seedPhase(imp, x, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      along(add, "cone", [x + Math.cos(a) * 0.2, 3.75, z + Math.sin(a) * 0.2], [x + Math.cos(a) * 0.52, 3.75, z + Math.sin(a) * 0.52], 0.09, 0.09, PALE_GOLD, { glow: true, hd: true, idle: IDLE_KIND.spin, pivot: [x, z], phase: ph });
    }
  }
  const [cx, cz] = pillar(0);
  const across = (lat: number): [number, number] => (axis === "x" ? [cx, cz + lat] : [cx + lat, cz]);
  imp.add("box", cx, 3.6, cz, axis === "x" ? 0.76 : span + 0.2, 0.1, axis === "x" ? span + 0.2 : 0.76, "#e7e5e4", hdo("masonry", { hdShape: "slab" }));
  for (let k = -3; k <= 3; k++) {
    const [x, z] = across((k * ROAD_HALF) / 3.5);
    imp.add("cone", x, 3.7, z, 0.12, 0.24, 0.12, C_GILT, hdo("gold"));
  }
  // Banners under the span, facing down the road, on gilt rods
  for (const s of [-1, 1]) {
    const [x, z] = across(s * 0.62);
    const flat = axis === "x";
    imp.add("box", x, 3.12, z, flat ? 0.06 : 0.6, 0.06, flat ? 0.6 : 0.06, C_GILT, hdo("gold"));
    bannerHd(imp, x, 2.12, z, flat ? 0.04 : 0.5, 0.98, flat ? 0.5 : 0.04, cloth, [x, z]);
  }
}

/** Imperial Highway: a silver frame round one of the centre line's diamond runes (its centre x, z; the rune turned π/4) */
function runeFrameHd(imp: Builder, x: number, z: number) {
  const f = imp.child(x, z, Math.PI / 4);
  const o = hdo("steel", { hdShape: "slab" });
  for (const s of [-1, 1]) {
    f.add("box", 0, 0.04, s * 0.3, 0.65, 0.08, 0.05, SILVER, o);
    f.add("box", s * 0.3, 0.04, 0, 0.05, 0.08, 0.65, SILVER, o);
  }
}

/**
 * Celestial Nightlights, on one lamp (post `lampH` tall): gilt collars up the post, a gilt cradle under the starlight
 * orb, three gilt stars circling it and a glint rising off it
 */
function nightlightHd(imp: Builder, x: number, z: number, lampH: number) {
  const add = imp.add.bind(imp);
  for (const y of [0.8, 1.6]) imp.add("cyl", x, y, z, 0.18, 0.045, 0.18, C_GILT, hdo("gold"));
  imp.add("cyl", x, lampH + 0.42, z, 0.04, 0.1, 0.04, C_GILT, hdo("gold"));
  imp.add("cyl", x, lampH + 0.5, z, 0.24, 0.04, 0.24, C_GILT, hdo("gold"));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    along(add, "box", [x + Math.cos(a) * 0.1, lampH + 0.52, z + Math.sin(a) * 0.1], [x + Math.cos(a) * 0.17, lampH + 1.0, z + Math.sin(a) * 0.17], 0.03, 0.03, C_GILT, hdo("gold"));
  }
  const ph = seedPhase(imp, x, z);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    imp.add("octa", x + Math.cos(a) * 0.34, lampH + 0.94 + k * 0.05, z + Math.sin(a) * 0.34, 0.1, 0.14, 0.1, PALE_GOLD, { glow: true, hd: true, idle: IDLE_KIND.spin, pivot: [x, z], phase: ph });
  }
  sparks(imp, x, lampH + 1.1, z, 1, "#e0f2fe");
}

/** Celestial Nightlights: a crossroads brazier as a gilt star-bowl (a gilt rim set with four points) */
function starBowlHd(imp: Builder, x: number, z: number) {
  arc(imp.add.bind(imp), [x, 1.12, z], [1, 0, 0], [0, 0, 1], 0.28, 0, Math.PI * 2, 10, 0.05, C_GILT, hdo("gold"), "cyl");
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    imp.add("octa", x + Math.cos(a) * 0.3, 1.08, z + Math.sin(a) * 0.3, 0.09, 0.2, 0.09, C_GILT, hdo("gold"));
  }
}

/**
 * Paradise of the Realm, on one garden bed (centre x, z): the floating blossom opens into petals turning round its
 * glowing heart, and a gilt trellis arch with flowering vines stands over the bed
 */
function paradiseHd(root: Builder, x: number, z: number, colors: string[], leaf: string, k: number) {
  const ph = seedPhase(root, x, z);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = root.child(x, z, a);
    p.add("box", 0.15, 1.38, 0, 0.18, 0.025, 0.09, colors[(i + k) % colors.length], hdo("cloth", { rz: 0.45, detail: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: ph }));
  }
  const add = root.add.bind(root);
  for (const s of [-1, 1]) root.add("box", x + s * 1.32, 0, z, 0.07, 1.5, 0.07, C_GILT, hdo("gold"));
  arc(add, [x, 1.5, z], [1, 0, 0], [0, 1, 0], [1.32, 0.5], 0, Math.PI, 5, 0.06, C_GILT, hdo("gold"), "cyl");
  for (const [t, i] of [[0.18, 0], [0.42, 1], [0.6, 2], [0.85, 3]]) {
    const a = t * Math.PI;
    const [vx, vy] = [x + Math.cos(a) * 1.32, 1.5 + Math.sin(a) * 0.5];
    root.add("canopy", vx, vy - 0.12, z, 0.34, 0.24, 0.28, leaf, hdo("leaf", { detail: true }));
    if (i !== 1) root.add("sphere", vx + 0.05, vy + 0.08, z + 0.1, 0.11, 0.11, 0.11, colors[(i + k) % colors.length], hdo("skin", { detail: true }));
  }
}

/** Paradise of the Realm, on a conservatory dome (centre x, z): a gilt lantern on its finial, glowing blossoms circling it */
function domeHd(root: Builder, x: number, z: number, colors: string[]) {
  root.add("box", x, 2.82, z, 0.16, 0.2, 0.16, "#fef3c7", { glow: true, hd: true });
  lanternFrame(root.add.bind(root), x, 2.82, z, 0.16, 0.2, C_GILT, { mat: "gold" });
  const ph = seedPhase(root, x, z);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    root.add("octa", x + Math.cos(a) * 1.5, 1.1 + (k % 2) * 0.35, z + Math.sin(a) * 1.5, 0.14, 0.2, 0.14, colors[k % colors.length], { glow: true, hd: true, idle: IDLE_KIND.spin, pivot: [x, z], phase: ph });
  }
}

/**
 * Sovereign Emporium, on one stall: the trade lantern in a gilt frame on a gilt-collared pole, a painted sign with a
 * gilt coin hanging from a gilt arm, coins heaped on the strongbox, a gilt finial on the pennant's pole
 */
function emporiumHd(stall: Builder, cloth: string, seed: number) {
  const add = stall.add.bind(stall);
  stall.add("cyl", -1.05, 0.06, -0.45, 0.17, 0.12, 0.17, C_GILT, hdo("gold"));
  stall.add("cyl", -1.05, 1.85, -0.45, 0.13, 0.06, 0.13, C_GILT, hdo("gold"));
  lanternFrame(add, -1.05, 2.3, -0.45, 0.44, 0.5, C_GILT, { mat: "gold" });
  stall.add("box", -1.31, 1.92, -0.45, 0.52, 0.05, 0.05, C_GILT, hdo("gold"));
  stall.add("box", -1.4, 1.5, -0.45, 0.36, 0.34, 0.04, cloth, hdo("wood"));
  stall.add("cyl", -1.4, 1.67 - 0.03, -0.41, 0.17, 0.06, 0.17, GOLD, hdo("gold", { rx: Math.PI / 2 }));
  for (const sx of [-1, 1]) stall.add("cyl", -1.4 + sx * 0.14, 1.84, -0.45, 0.015, 0.08, 0.015, C_GILT, hdo("gold"));
  coins(add, mulberry32(seed), 1.05, 0.42, -0.45, 0.12, 6, GOLD, hdo("gold"));
  stall.add("sphere", 0.95, 2.88, -1.2, 0.09, 0.09, 0.09, C_GILT, hdo("gold"));
  // Bunting on a gilt cord from the lantern's pole to the pennant's, sagging between them
  const at = (t: number): V3 => [-1.05 + 2.0 * t, 2.25 + 0.37 * t - 0.3 * Math.sin(t * Math.PI), -0.45 - 0.75 * t];
  for (const [a, b] of [[0, 0.5], [0.5, 1]]) along(add, "cyl", at(a), at(b), 0.02, 0.02, C_GILT, hdo("gold"));
  for (let k = 1; k < 6; k++) {
    const [x, y, z] = at(k / 6);
    stall.add("pyramid", x, y - 0.22, z, 0.18, 0.2, 0.02, k % 2 ? cloth : C_GILT, hdo("cloth", { rz: Math.PI, ry: 0.36 }));
  }
}

/**
 * Legendary War Standards, on one standard (gilt rod and finial from 3.6, the heraldic sigil from 5.1): a stone foot
 * with a gilt band, a gilt crown round the finial, the sigil set in a gilt frame, two motes circling it
 */
function warStandardHd(b: Builder) {
  b.add("box", 0, 0, 0, 0.56, 0.24, 0.56, "#a8a29e", hdo("masonry"));
  b.add("box", 0, 0.24, 0, 0.46, 0.06, 0.46, C_GILT, hdo("gold"));
  b.add("cyl", 0, 4.71, 0, 0.3, 0.045, 0.3, C_GILT, hdo("gold"));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    b.add("cone", Math.cos(a) * 0.13, 4.77, Math.sin(a) * 0.13, 0.06, 0.16, 0.06, C_GILT, hdo("gold"));
  }
  const f = b.child(0, 0, Math.PI / 4);
  const o = hdo("gold", { hdShape: "slab" });
  f.add("box", 0, 5.7, 0, 0.72, 0.06, 0.16, C_GILT, o);
  f.add("box", 0, 5.04, 0, 0.72, 0.06, 0.16, C_GILT, o);
  for (const s of [-1, 1]) f.add("box", s * 0.33, 5.1, 0, 0.06, 0.6, 0.16, C_GILT, o);
  f.add("octa", 0, 5.76, 0, 0.14, 0.22, 0.14, C_GILT, hdo("gold"));
  const ph = seedPhase(b, 0, 0);
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI;
    b.add("octa", Math.cos(a) * 0.55, 5.3 + k * 0.2, Math.sin(a) * 0.55, 0.08, 0.12, 0.08, PALE_GOLD, { glow: true, hd: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: ph });
  }
}

/**
 * Sovereign Spring: gilt lion heads on pedestals round the lower basin pouring arcs of water into it, a gilt crown round
 * the top basin spilling four streams into the basin below, fluting on the column, rays turning round the gold suns
 */
function springHd(imp: Builder) {
  const add = imp.add.bind(imp);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const [x, z] = [Math.cos(a) * 2.6, FOUNTAIN_Z + Math.sin(a) * 2.6];
    const p = imp.child(x, z, facing(x, z, 0, FOUNTAIN_Z));
    p.add("box", 0, 0.06, 0, 0.4, 0.74, 0.4, PALE_GOLD, hdo("masonry"));
    p.add("box", 0, 0.8, 0, 0.46, 0.06, 0.46, PALE_GOLD, hdo("masonry"));
    const pa = p.add.bind(p);
    // A lion's mask: a face with a muzzle in a mane of points
    p.add("sphere", 0, 0.9, 0.06, 0.26, 0.26, 0.2, GOLD, hdo("gold"));
    p.add("box", 0, 0.92, 0.17, 0.14, 0.1, 0.12, GOLD, hdo("gold", { hdShape: "snout" }));
    for (let i = 0; i < 9; i++) {
      const m = (i / 9) * Math.PI * 2;
      along(pa, "cone", [Math.cos(m) * 0.09, 1.03 + Math.sin(m) * 0.09, 0.02], [Math.cos(m) * 0.25, 1.03 + Math.sin(m) * 0.25, -0.02], 0.09, 0.05, C_GILT2, hdo("gold"));
    }
    along(pa, "cyl", [0, 0.96, 0.24], [0, 1.02, 0.42], 0.06, 0.06, "#7dd3fc", hdo("gel"));
    along(pa, "cyl", [0, 1.02, 0.42], [0, 0.72, 0.7], 0.06, 0.06, "#7dd3fc", hdo("gel"));
  }
  arc(add, [0, 2.8, FOUNTAIN_Z], [1, 0, 0], [0, 0, 1], 0.61, 0, Math.PI * 2, 12, 0.06, GOLD, hdo("gold"), "cyl");
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    imp.add("cone", Math.cos(a) * 0.62, 2.82, FOUNTAIN_Z + Math.sin(a) * 0.62, 0.07, 0.2, 0.07, GOLD, hdo("gold"));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    along(add, "cyl", [Math.cos(a) * 0.62, 2.78, FOUNTAIN_Z + Math.sin(a) * 0.62], [Math.cos(a) * 0.86, 1.92, FOUNTAIN_Z + Math.sin(a) * 0.86], 0.05, 0.05, "#7dd3fc", hdo("gel"));
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    imp.add("box", Math.cos(a) * 0.42, 0.72, FOUNTAIN_Z + Math.sin(a) * 0.42, 0.06, 0.66, 0.06, GOLD, hdo("gold", { ry: -a, hdShape: "slab" }));
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const [cx, cy, cz] = [Math.cos(a) * 2.4, 3.5 + (k % 2) * 0.4, FOUNTAIN_Z + Math.sin(a) * 2.4];
    for (let i = 0; i < 4; i++) {
      const r = (i / 4) * Math.PI * 2 + Math.PI / 4;
      along(add, "cone", [cx + Math.cos(r) * 0.1, cy, cz + Math.sin(r) * 0.1], [cx + Math.cos(r) * 0.34, cy, cz + Math.sin(r) * 0.34], 0.07, 0.07, PALE_GOLD, { glow: true, hd: true, idle: IDLE_KIND.spin, pivot: [0, FOUNTAIN_Z], phase: 0.01 + a });
    }
  }
}

/**
 * Mythic Sovereign, in the statue's frame (`d` scales the dragon, `plinth` adds unscaled): a gilt crown on its head, a
 * gilt crest down its spine (where its civilization has none), gilt bones through its wings, gilt runes pulsing on the
 * plinth, a gold hoard round its foot, iron legs, flames and sparks on the braziers
 */
function mythicHd(d: Add, plinth: Builder, y: number, civ: CivilizationType) {
  d("cyl", 0, 2.83 + y, 1.42, 0.3, 0.07, 0.3, GOLD, hdo("gold"));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
    d("cone", Math.cos(a) * 0.12, 2.89 + y, 1.42 + Math.sin(a) * 0.12, 0.06, 0.16, 0.06, GOLD, hdo("gold"));
  }
  d("octa", 0, 2.9 + y, 1.58, 0.08, 0.12, 0.06, "#dc2626", hdo("gem", { glow: true }));
  if (civ !== "human" && civ !== "arcane") for (let k = 0; k < 4; k++) d("cone", 0, 1.88 + y - k * 0.12, 0.5 - k * 0.45, 0.12, 0.26, 0.12, GOLD, hdo("gold"));
  // Wing bones fanning from the shoulder over each wing's upper face
  for (const sx of [-1, 1]) {
    const rz = -sx * 0.5;
    const at = (u: number, v: number): V3 => [sx * 1.3 + u * Math.cos(rz) - 0.07 * Math.sin(rz), 1.63 + y + u * Math.sin(rz) + 0.07 * Math.cos(rz), v];
    for (const v of [0.58, 0.05, -0.5]) along(d, "cyl", at(-sx * 0.92, 0.42), at(sx * 0.95, v), 0.06, 0.06, GOLD, hdo("gold"));
  }
  // Runes on the plinth
  if (civ !== "orc") {
    const [hx, hz, y0, rh] = civ === "dwarf" ? [1.1, 0.8, 0.14, 0.2] : [1.1, 1.1, 0.18, 0.22];
    for (const o of [-0.6, 0, 0.6]) {
      for (const s of [-1, 1]) {
        const glow = { glow: true, hd: true, idle: IDLE_KIND.pulse };
        plinth.add("box", o, y0, s * (hz + 0.02), 0.12, rh, 0.08, GOLD, { ...glow, phase: seedPhase(plinth, o, s) });
        if (civ !== "dwarf") plinth.add("box", s * (hx + 0.02), y0, o, 0.08, rh, 0.12, GOLD, { ...glow, phase: seedPhase(plinth, s, o) });
      }
    }
  }
  // The hoard: a heap of gold before it, coins spilled round the plinth, gems, goblets and a chest at its side
  const add = plinth.add.bind(plinth);
  const r = mulberry32(0x5eed);
  plinth.add("sphere", 0, 0.06, 1.55, 1.0, 0.24, 0.5, GOLD, hdo("gold", { hdShape: "egg" }));
  coins(add, r, 0, 0.06, 1.55, 0.6, 12, GOLD, hdo("gold"));
  coins(add, r, -1.4, 0.06, 0.1, 0.4, 7, GOLD, hdo("gold"));
  coins(add, r, 1.35, 0.06, -0.6, 0.4, 7, GOLD, hdo("gold"));
  for (const [x, z, c] of [[0.35, 1.7, "#dc2626"], [-0.4, 1.6, "#22c55e"], [1.4, -0.4, "#3b82f6"]] as Array<[number, number, string]>) plinth.add("octa", x, 0.2, z, 0.12, 0.16, 0.12, c, hdo("gem"));
  for (const [x, z] of [[0.62, 1.5], [-1.45, 0.4]]) {
    plinth.add("cyl", x, 0.06, z, 0.12, 0.03, 0.12, GOLD, hdo("gold"));
    plinth.add("cyl", x, 0.09, z, 0.03, 0.1, 0.03, GOLD, hdo("gold"));
    plinth.add("cyl", x, 0.19, z, 0.14, 0.12, 0.14, GOLD, hdo("gold", { hdShape: "taper", rx: Math.PI }));
  }
  const chest = plinth.child(-1.45, -0.45, 0.4);
  chest.add("box", 0, 0.06, 0, 0.56, 0.3, 0.36, "#5b3b22", hdo("wood"));
  chest.add("box", 0, 0.36, -0.04, 0.58, 0.1, 0.4, "#5b3b22", hdo("wood", { rx: -0.35 }));
  for (const sx of [-1, 1]) chest.add("box", sx * 0.18, 0.06, 0, 0.06, 0.32, 0.4, GOLD, hdo("gold"));
  // The braziers' iron legs, tongues of flame and sparks
  for (const sx of [-1, 1]) {
    const [bx, bz] = [sx * 1.75, 1.2];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      along(add, "cyl", [bx + Math.cos(a) * 0.08, 1.2, bz + Math.sin(a) * 0.08], [bx + Math.cos(a) * 0.42, 0.06, bz + Math.sin(a) * 0.42], 0.06, 0.06, "#3f3f46", hdo("iron"));
    }
    for (const o of [-0.13, 0.13]) plinth.add("cone", bx + o, 1.7, bz + o * 0.5, 0.18, 0.5, 0.18, "#fbbf24", { glow: true, hd: true, idle: IDLE_KIND.pulse, phase: seedPhase(plinth, bx + o, bz) });
    sparks(plinth, bx, 2.1, bz, 2, "#fdba74");
  }
}

/**
 * Astral Apex Spire (`m` adds in the spire's scaled frame, `base` unscaled): a gilt rim round the pedestal, gilt bands
 * up the civilization's spire, each circling orb in a gilt collar riding its orbit, a turning ring of crystals, motes
 */
function apexHd(base: Builder, m: Add, civ: CivilizationType, crystal: string) {
  arc(base.add.bind(base), [0, 0.52, 0], [1, 0, 0], [0, 0, 1], 1.27, 0, Math.PI * 2, 16, 0.07, C_GILT, hdo("gold"), "cyl");
  switch (civ) {
    case "human":
      for (const y of [1.4, 2.8]) m("box", 0, y, 0, 1.0, 0.08, 1.0, C_GILT, hdo("gold"));
      break;
    case "elf":
      for (const y of [1.5, 2.3]) m("cyl", 0, y, 0, 0.52, 0.07, 0.52, C_GILT, hdo("gold"));
      break;
    case "dwarf":
      // Banded with the menhir's lean (it turns about its own centre, 2.4 up)
      for (const y of [1.55, 3.05]) m("box", -(y + 0.05 - 2.4) * Math.sin(0.04), y, 0, 1.16, 0.1, 0.82, C_GILT, hdo("gold", { rz: 0.04 }));
      break;
    case "orc":
      for (const y of [0.7, 3.3]) m("cyl", 0, y, 0, 0.47, 0.08, 0.47, C_GILT, hdo("gold"));
      break;
    default:
      arc(m, [0, 2.3, 0], [1, 0, 0], [0, 0, 1], 0.5, 0, Math.PI * 2, 10, 0.06, C_GILT, hdo("gold"), "cyl");
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const [x, y, z] = [Math.cos(a) * 1.9, 3.58 + (k % 2) * 0.8, Math.sin(a) * 1.9];
    const ride = { idle: IDLE_KIND.spin, pivot: [0, 0] as [number, number], phase: 0.01 + a };
    base.add("cyl", x, y - 0.02, z, 0.52, 0.04, 0.52, C_GILT, hdo("gold", ride));
    for (const s of [-1, 1]) base.add("octa", x, y + s * 0.24 - 0.06, z, 0.08, 0.12, 0.08, C_GILT, hdo("gold", ride));
  }
  const ph = seedPhase(base, 0.5, 0);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    base.add("octa", Math.cos(a) * 1.5, 2.3 + (k % 2) * 0.25, Math.sin(a) * 1.5, 0.13, 0.26, 0.13, crystal, { glow: true, hd: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: ph });
  }
  for (let k = 0; k < 3; k++) sparks(base, Math.cos(k * 2.1) * 0.95, 0.7, Math.sin(k * 2.1) * 0.95, 1, crystal, 0.08);
}

/**
 * Eye of the Night Court (tower `h` tall, the lens room from `top`): a gilt almond lid round the eye and a slit pupil
 * that narrows and widens, gilt bands up the tower, the Night Court's banners hanging from the walkway, a gilt crescent
 * moon circling the star
 */
function nightCourtHd(b: Builder, h: number, top: number) {
  const add = b.add.bind(b);
  arc(add, [0, top + 0.5, 0.97], [1, 0, 0], [0, 1, 0], [0.46, 0.3], 0, Math.PI, 8, 0.05, GOLD, hdo("gold"));
  arc(add, [0, top + 0.5, 0.97], [1, 0, 0], [0, 1, 0], [0.46, 0.3], Math.PI, Math.PI * 2, 8, 0.05, GOLD, hdo("gold"));
  b.add("box", 0, top + 0.35, 1.07, 0.06, 0.3, 0.06, "#0b0b14", hdo("plain", { idle: IDLE_KIND.pulse }));
  for (const f of [0.75, 0.9]) b.add("cyl", 0, 0.4 + h * f, 0, 2.12, 0.1, 2.12, GOLD, hdo("gold"));
  // Gilt ribs up the cap between its spikes, lit slits either side of the lens room
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    along(add, "box", [Math.cos(a) * 1.1, top + 1.02, Math.sin(a) * 1.1], [Math.cos(a) * 0.05, top + 3.36, Math.sin(a) * 0.05], 0.07, 0.07, GOLD, hdo("gold", { hdShape: "slab" }));
  }
  for (const s of [-1, 1]) b.add("box", s * 0.8, top + 0.25, 0, 0.1, 0.5, 0.14, "#93c5fd", { glow: true, hd: true });
  for (const a of [Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3]) {
    const [x, z] = [Math.cos(a) * 1.3, Math.sin(a) * 1.3];
    const c = b.child(x, z, facing(x, z, 0, 0) + Math.PI);
    c.add("box", 0, h + 0.28, 0, 0.6, 0.05, 0.06, GOLD, hdo("gold"));
    bannerHd(c, 0, h - 1.0, 0, 0.5, 1.3, 0.04, NIGHT_CLOTH, [0, 0], GOLD);
  }
  arc(add, [0, top + 3.8, 0], [1, 0, 0], [0, 1, 0], 0.46, Math.PI * 0.3, Math.PI * 1.7, 8, 0.07, GOLD, hdo("gold", { idle: IDLE_KIND.spin, pivot: [0, 0], phase: seedPhase(b, 0, 0) }));
}

/** A red-star plot's grand standard at (x, z), its cloth streaming toward `sx`: gilt pole on a stone foot, a gilt crown with a gem, sparks */
function grandStandardHd(b: Builder, x: number, z: number, sx: number, cloth: string) {
  b.add("box", x, 0, z, 0.34, 0.2, 0.34, "#a8a29e", hdo("masonry"));
  b.add("cyl", x, 0, z, 0.1, 3.2, 0.1, C_GILT, hdo("gold"));
  b.add("box", x + sx * 0.42, 2.92, z, 0.86, 0.05, 0.05, C_GILT, hdo("gold"));
  bannerHd(b, x + sx * 0.42, 1.92, z, 0.76, 0.96, 0.04, cloth, [x, z]);
  b.add("cyl", x, 3.2, z, 0.24, 0.06, 0.24, C_GILT, hdo("gold"));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    b.add("cone", x + Math.cos(a) * 0.1, 3.26, z + Math.sin(a) * 0.1, 0.05, 0.15, 0.05, C_GILT, hdo("gold"));
  }
  b.add("octa", x, 3.26, z, 0.1, 0.2, 0.1, cloth, { glow: true, hd: true, idle: IDLE_KIND.pulse, phase: seedPhase(b, x, z) });
  sparks(b, x, 3.4, z, 2, "#fde68a", 0.06);
}

/** A red-star plot's border (the builder at the pad's top): a gilt kerb round the edge set with pulsing gems, the path left open */
function gildedKerbHd(g: Builder, S: number, half: number, gem: string) {
  const o = hdo("gold", { hdShape: "slab" });
  for (const s of [-1, 1]) {
    g.add("box", 0, 0, s * (half - 0.06), S, 0.08, 0.12, C_GILT, o);
    g.add("box", s * (half - 0.06), 0, 0, 0.12, 0.08, S, C_GILT, o);
  }
  const n = Math.max(2, Math.round(S / 1.6));
  for (let i = 0; i <= n; i++) {
    const t = -half + 0.3 + ((S - 0.6) * i) / n;
    for (const [x, z] of [[t, half - 0.06], [t, -half + 0.06], [half - 0.06, t], [-half + 0.06, t]]) {
      if (z > 0 && Math.abs(x) < 0.9) continue; // the path through the gate
      g.add("octa", x, 0.08, z, 0.13, 0.14, 0.13, gem, { glow: true, hd: true, idle: IDLE_KIND.pulse, phase: seedPhase(g, x, z) });
    }
  }
}

/** A red-star plot's corner tower (as `civTower` drew it): a royal pennant streaming from a gilt rod on its roof */
function towerPennantHd(b: Builder, civ: CivilizationType, x: number, z: number, r: number, h: number, cloth: string) {
  const tip = civ === "elf" ? h * 1.75 + 0.35 : civ === "dwarf" ? h * 0.85 + 0.2 : civ === "orc" ? h * 1.3 : civ === "arcane" ? h * 1.45 + r * 0.6 : h * 1.33 + 0.1;
  b.add("cyl", x, tip - 0.05, z, 0.045, 0.95, 0.045, C_GILT, hdo("gold"));
  b.add("sphere", x, tip + 0.86, z, 0.09, 0.09, 0.09, C_GILT, hdo("gold"));
  bannerHd(b, x + 0.31, tip + 0.4, z, 0.56, 0.26, 0.03, cloth, [x, z]);
}

/** Road colour per Roads tier (tier 0 = the civilization's own earth road) */
const ROAD_COLORS: Array<string | null> = [null, "#9c9488", "#8e9198", "#d2cbbb", "#d6cfc0", "#e7e5e4"];

/** Tier 0 dragon spot: an ancient moss-covered runic plinth */
function mossPlinth(b: Builder, ctx: Ctx) {
  b.add("box", 0, 0.06, 0, 2.2, 0.8, 2.2, ctx.pal.stone, { mat: "masonry" });
  b.add("box", 0, 0.86, 0, 1.7, 0.1, 1.7, "#4d7c0f", { mat: "leaf" });
  b.add("sphere", 0.7, 0.06, 1.15, 0.6, 0.4, 0.4, "#4d7c0f", { mat: "leaf" });
  b.add("box", 0, 0.3, 1.16, 0.6, 0.3, 0.06, "#a5f3fc", { glow: true });
}

/** Tier 0 spire spot: a wooden village bench flanked by flowering shrubs */
function villageBench(b: Builder, ctx: Ctx) {
  const { pal, rng } = ctx;
  for (const sx of [-0.7, 0.7]) b.add("box", sx, 0.06, 0, 0.12, 0.4, 0.5, pal.trunk, { mat: "wood" });
  b.add("box", 0, 0.46, 0, 1.7, 0.1, 0.55, pal.wood, { mat: "wood" });
  b.add("box", 0, 0.56, -0.24, 1.7, 0.5, 0.08, pal.wood, { mat: "wood" });
  for (const sx of [-1.4, 1.4]) {
    b.add("sphere", sx, 0.06, 0, 0.8, 0.7, 0.8, pal.foliage, { mat: "leaf", hdShape: "canopy" });
    for (let k = 0; k < 3; k++) b.add("sphere", sx + range(rng, -0.25, 0.25), 0.66, range(rng, -0.25, 0.25), 0.16, 0.16, 0.16, pick(rng, ["#f472b6", "#fde047", "#f8fafc"]), { detail: true });
  }
}

/** Banner cloth per civilization, matching the castle's banners */
const BANNER_CLOTH: Record<CivilizationType, string> = {
  human: "#1d4ed8",
  elf: "#059669",
  dwarf: "#b45309",
  orc: "#991b1b",
  arcane: "#7e22ce"
};

/** A civilization standard `h` tall standing at the builder's origin; the cloth hangs along local +X */
/** A civilization's standard; from Kingdom Banners tier 3 (rare) its cloth streams and its rune or orb glows */
function civBanner(bb: Builder, ctx: Ctx, h: number, tier = 1) {
  const { civ, pal } = ctx;
  // HD: the pole and its fittings in wood (stone posts and the dwarves' pillar in stone), the standard in cloth
  const b = bb.child(0, 0);
  b.mat = civ === "dwarf" || civ === "arcane" ? "masonry" : "wood";
  const cloth = BANNER_CLOTH[civ];
  const glow = tier >= 3;
  const wave = tier >= 3 ? { idle: IDLE_KIND.flutter } : {};
  // Legendary War Standards (HD): what is sewn onto the cloth (hem, crest, runes, tatters) rides its flutter, and a gilt
  // hem weights its foot
  let flag: Part | undefined;
  const hang = (x: number, y0: number, w: number, hh: number, d: number) => {
    b.add("box", x, y0, 0, w, hh, d, cloth, { ...wave, mat: "cloth" });
    if (tier < 5) return;
    flag = b.out.parts.at(-1);
    if (civ !== "human") ride(b, flag, "box", x, y0 - 0.02, 0, w + 0.1, 0.12, d + 0.1, C_GILT, hdo("cloth"));
  };
  const on = (shape: Shape, x: number, y0: number, z: number, w: number, hh: number, d: number, color: string, o: AddOpts = {}) => {
    if (tier < 5) return b.add(shape, x, y0, z, w, hh, d, color, o);
    b.add(shape, x, y0, z, w, hh, d, color, { ...o, hd: false });
    ride(b, flag, shape, x, y0, z, w, hh, d, color, { ...o, hd: true });
  };
  switch (civ) {
    case "human":
      // Heraldic banner on a crossbar: gold hem, gold crest and a gold finial
      b.add("cyl", 0, 0, 0, 0.12, h, 0.12, pal.wood);
      b.add("box", 0.42, h - 0.42, 0, 0.95, 0.08, 0.08, pal.wood);
      hang(0.42, h - 1.82, 0.78, 1.4, 0.05);
      on("box", 0.42, h - 1.9, 0, 0.8, 0.12, 0.06, pal.accent, { mat: "cloth" });
      on("box", 0.42, h - 1.3, 0, 0.32, 0.34, 0.07, pal.accent, { mat: "cloth" });
      b.add("sphere", 0, h, 0, 0.22, 0.22, 0.22, pal.accent);
      break;
    case "elf":
      // Slender pale pole, long pennant tapering to a point, glowing orb on top
      b.add("cyl", 0, 0, 0, 0.09, h + 0.4, 0.09, pal.trunk);
      b.add("box", 0.32, h - 0.3, 0, 0.62, 0.06, 0.06, pal.trunk);
      hang(0.32, h - 2.2, 0.5, 1.9, 0.04);
      on("pyramid", 0.32, h - 2.7, 0, 0.5, 0.5, 0.04, cloth, { rz: Math.PI, mat: "cloth" });
      on("octa", 0.32, h - 1.6, 0, 0.2, 0.32, 0.07, pal.foliage2, { glow });
      b.add("sphere", 0, h + 0.4, 0, 0.28, 0.28, 0.28, pal.accent, { glow });
      break;
    case "dwarf":
      // Iron-banded stone pillar, square banner with a glowing forge rune, stone cap
      b.add("box", 0, 0, 0, 0.34, h, 0.34, pal.stone);
      for (const y of [h * 0.3, h * 0.7]) b.add("box", 0, y, 0, 0.4, 0.1, 0.4, "#3f3f46", { mat: "iron" });
      b.add("box", 0.4, h - 0.45, 0, 0.75, 0.1, 0.1, "#3f3f46", { mat: "iron" });
      hang(0.42, h - 1.7, 0.8, 1.25, 0.06);
      on("box", 0.42, h - 1.55, 0, 0.12, 0.62, 0.08, pal.accent, { glow });
      on("box", 0.52, h - 1.2, 0, 0.1, 0.32, 0.08, pal.accent, { glow, rz: -0.7 });
      b.add("pyramid", 0, h, 0, 0.46, 0.32, 0.46, pal.stone);
      break;
    case "orc":
      // Crooked war spear, tattered blood-red banner and a horned skull
      b.add("cyl", 0, 0, 0, 0.11, h, 0.11, pal.wood, { rz: 0.05 });
      b.add("cone", 0, h, 0, 0.17, 0.5, 0.17, "#9ca3af", { mat: "dull" });
      b.add("box", 0.38, h - 0.62, 0, 0.82, 0.08, 0.08, pal.wood);
      hang(0.38, h - 1.7, 0.72, 1.05, 0.05);
      [
        [0.14, 0.38],
        [0.38, 0.2],
        [0.62, 0.45]
      ].forEach(([x, len]) => on("box", x, h - 1.7 - len, 0, 0.2, len, 0.05, cloth, { mat: "cloth" }));
      b.add("sphere", 0, h - 0.55, 0.06, 0.26, 0.24, 0.26, pal.bone, { mat: "bone" });
      for (const sx of [-1, 1]) b.add("cone", sx * 0.18, h - 0.38, 0.06, 0.08, 0.3, 0.08, pal.bone, { rz: -sx * 0.6, mat: "bone" });
      break;
    case "arcane":
      // Dark obelisk post, banner with glowing rune stripes and a crystal floating above
      b.add("box", 0, 0, 0, 0.24, h, 0.24, pal.stone);
      b.add("box", 0.4, h - 0.35, 0, 0.85, 0.07, 0.07, pal.wood);
      hang(0.4, h - 1.8, 0.72, 1.45, 0.04);
      for (const x of [0.22, 0.58]) on("box", x, h - 1.65, 0, 0.06, 1.0, 0.06, pal.accent, { glow });
      on("octa", 0.4, h - 1.25, 0, 0.22, 0.36, 0.07, pal.accent, { glow });
      b.add("octa", 0, h + 0.25, 0, 0.32, 0.6, 0.32, pal.accent, { glow });
      break;
  }
}

/* ========================================================================= */
/* CIVILIZATION LANDMARKS                                                    */
/* ========================================================================= */

const GOLD = "#fbbf24";
const PALE_GOLD = "#fde68a";

/** Gilded hero on the Hero Monument fountain (bottom at the fountain's top tier) */
function heroStatue(hb: Builder, civ: CivilizationType, lit = true) {
  // HD: cast in gilt bronze on a stone drum
  const h = hb.child(0, 0);
  h.mat = "gold";
  h.add("cyl", 0, 0, 0, 0.5, 0.5, 0.5, "#d4d4d8", { mat: "masonry" });
  switch (civ) {
    case "elf": // archer
      h.add("cone", 0, 0.5, 0, 0.42, 1.05, 0.38, GOLD);
      h.add("sphere", 0, 1.45, 0, 0.28, 0.3, 0.28, GOLD);
      h.add("box", 0.3, 0.8, 0.05, 0.05, 1.3, 0.06, PALE_GOLD, { rz: 0.1 });
      for (const sx of [-1, 1]) h.add("cone", sx * 0.15, 1.55, 0, 0.05, 0.16, 0.05, GOLD, { rz: -sx * 1.2 });
      h.add("octa", 0, 1.95, 0, 0.2, 0.28, 0.2, "#a5f3fc", { glow: lit });
      break;
    case "dwarf": // hammer raised high
      h.add("cyl", 0, 0.5, 0, 0.58, 0.7, 0.52, GOLD);
      h.add("sphere", 0, 1.2, 0, 0.32, 0.32, 0.32, GOLD);
      h.add("cone", 0, 0.82, 0.13, 0.3, 0.38, 0.2, GOLD, { rx: Math.PI });
      h.add("cyl", 0.38, 0.8, 0, 0.07, 1.2, 0.07, PALE_GOLD);
      h.add("box", 0.38, 1.95, 0, 0.55, 0.3, 0.3, GOLD);
      h.add("octa", 0, 1.55, 0, 0.18, 0.26, 0.18, "#fdba74", { glow: lit });
      break;
    case "orc": // warlord with a great axe
      h.add("box", 0, 0.5, 0, 0.62, 0.85, 0.42, GOLD);
      for (const sx of [-1, 1]) h.add("cone", sx * 0.32, 1.25, 0, 0.14, 0.25, 0.14, PALE_GOLD);
      h.add("sphere", 0, 1.35, 0.02, 0.38, 0.34, 0.38, GOLD);
      for (const sx of [-1, 1]) h.add("cone", sx * 0.2, 1.6, 0, 0.07, 0.3, 0.07, PALE_GOLD, { rz: -sx * 0.7 });
      h.add("cyl", 0.45, 0.6, 0, 0.07, 1.4, 0.07, PALE_GOLD);
      h.add("box", 0.45, 1.8, 0.14, 0.06, 0.45, 0.38, GOLD);
      break;
    case "arcane": // mage with a staff
      h.add("cone", 0, 0.5, 0, 0.52, 1.15, 0.48, GOLD);
      h.add("sphere", 0, 1.6, 0, 0.28, 0.28, 0.28, GOLD);
      h.add("cyl", 0, 1.72, 0, 0.58, 0.04, 0.58, GOLD);
      h.add("cone", 0, 1.76, 0, 0.34, 0.62, 0.34, GOLD);
      h.add("cyl", 0.38, 0.5, 0, 0.06, 1.65, 0.06, PALE_GOLD);
      h.add("octa", 0.38, 2.15, 0, 0.24, 0.32, 0.24, "#e879f9", { glow: lit });
      break;
    default: // knight with sword and shield
      h.add("cyl", 0, 0.5, 0, 0.42, 0.9, 0.36, GOLD);
      h.add("sphere", 0, 1.4, 0, 0.34, 0.34, 0.34, GOLD);
      h.add("box", 0.32, 1.05, 0, 0.08, 1.3, 0.08, PALE_GOLD, { rz: -0.3 });
      h.add("cyl", -0.26, 0.75, 0.05, 0.45, 0.05, 0.45, GOLD, { rz: Math.PI / 2 });
      h.add("octa", 0, 1.9, 0, 0.22, 0.3, 0.22, "#fde047", { glow: lit });
  }
}

/** One Royal Gardens bed beside the cross road */
function gardenBed(rb: Builder, ctx: Ctx, x: number, z: number, fl: { colors: string[]; glow: boolean }) {
  const { pal, rng, civ } = ctx;
  // HD: hedges and bushes in leaves, rocks in stone
  const root = rb.child(0, 0);
  root.mat = "leaf";
  if (civ !== "dwarf" && civ !== "orc") {
    // HD: a timber edging round the bed
    for (const sz of [-1, 1]) root.add("box", x, 0, z + sz * 0.4, 2.36, 0.14, 0.06, "#6b4a2b", { mat: "wood", hd: true });
    for (const sx of [-1, 1]) root.add("box", x + sx * 1.15, 0, z, 0.06, 0.14, 0.86, "#6b4a2b", { mat: "wood", hd: true });
  }
  switch (civ) {
    case "dwarf": // rock garden with hardy blooms
      root.add("box", x, 0, z, 2.2, 0.12, 0.8, pal.path, { mat: "hide" });
      for (let k = 0; k < 3; k++) root.add("sphere", x - 0.7 + k * 0.7, 0.05, z + range(rng, -0.15, 0.15), 0.5, 0.36, 0.45, pick(rng, ["#6b7280", "#9ca3af", "#57534e"]), { mat: "stone", hdShape: "boulder" });
      for (let k = 0; k < 3; k++) root.add("sphere", x - 0.35 + k * 0.7, 0.12, z + 0.25, 0.16, 0.16, 0.16, pick(rng, fl.colors), { detail: true });
      return;
    case "orc": // thorn bushes with blood-red flowers
      for (let k = 0; k < 3; k++) {
        const bx = x - 0.7 + k * 0.7;
        root.add("sphere", bx, 0, z, 0.65, 0.55, 0.6, "#3f4a1f");
        root.add("cone", bx + 0.2, 0.3, z, 0.06, 0.3, 0.06, pal.bone, { rz: -1.0, mat: "bone" });
        root.add("cone", bx - 0.2, 0.3, z, 0.06, 0.3, 0.06, pal.bone, { rz: 1.0, mat: "bone" });
        root.add("sphere", bx, 0.5, z + 0.15, 0.16, 0.16, 0.16, pick(rng, fl.colors), { detail: true });
      }
      return;
    case "arcane": // crystal clusters on a dark hedge
      root.add("box", x, 0, z, 2.2, 0.45, 0.7, pal.foliage);
      for (let k = 0; k < 4; k++) root.add("octa", x - 0.8 + k * 0.55, 0.4, z + range(rng, -0.12, 0.12), 0.16, 0.42, 0.16, pick(rng, fl.colors), { glow: fl.glow, mat: "gem" });
      return;
    case "elf": // hedge with glowing mushrooms and flowers
      root.add("box", x, 0, z, 2.2, 0.55, 0.7, pal.foliage);
      for (let k = 0; k < 4; k++) root.add("sphere", x - 0.8 + k * 0.55, 0.5, z + range(rng, -0.15, 0.15), 0.2, 0.2, 0.2, pick(rng, fl.colors), { detail: true, glow: fl.glow });
      for (const sx of [-1.25, 1.25]) {
        root.add("cyl", x + sx, 0, z, 0.08, 0.3, 0.08, "#f5f0e1", { mat: "plain" });
        root.add("sphere", x + sx, 0.26, z, 0.32, 0.16, 0.32, "#22d3ee", { glow: fl.glow });
      }
      return;
    default:
      root.add("box", x, 0, z, 2.2, 0.55, 0.7, pal.foliage);
      for (let k = 0; k < 4; k++) root.add("sphere", x - 0.8 + k * 0.55, 0.5, z + range(rng, -0.15, 0.15), 0.22, 0.22, 0.22, pick(rng, fl.colors), { detail: true });
  }
}

/** Market stall facing local +Z, trader stands at the back */
function marketStall(sb: Builder, ctx: Ctx, i: number, tier = 1) {
  const { pal, rng, civ } = ctx;
  // HD: timber stalls and counters (stone for the dwarves, hide for the orcs' tent), awnings in cloth
  const st = sb.child(0, 0);
  st.mat = civ === "dwarf" ? "masonry" : "wood";
  const goods = (colors: string[], shape: "sphere" | "octa" | "cyl" | "box", magical = false) => {
    const glow = magical && tier >= 3;
    for (let k = 0; k < 3; k++) st.add(shape, -0.45 + k * 0.45, 0.76, 0.45, 0.24, shape === "cyl" ? 0.3 : 0.22, 0.24, pick(rng, colors), { detail: true, glow });
  };
  switch (civ) {
    case "elf": // leaf canopy, herbs and flowers
      for (const sx of [-0.8, 0.8]) st.add("cyl", sx, 0.06, -0.4, 0.08, 1.6, 0.08, pal.trunk);
      st.add("cone", 0, 1.45, 0, 2.2, 0.55, 1.8, pal.foliage, { mat: "leaf" });
      st.add("box", 0, 0.06, 0.45, 1.5, 0.7, 0.4, pal.trunk);
      goods(["#86efac", "#a5f3fc", "#f0abfc"], "sphere", true);
      return;
    case "dwarf": // stone counter, tools and gems
      st.add("box", 0, 0.06, 0.45, 1.6, 0.7, 0.45, pal.stone);
      for (const sx of [-0.8, 0.8]) st.add("box", sx, 0.06, -0.45, 0.2, 1.6, 0.2, pal.stone);
      st.add("box", 0, 1.66, 0, 2.0, 0.14, 1.5, pal.roof, { mat: "wood" });
      st.add("box", -0.4, 0.76, 0.45, 0.5, 0.06, 0.12, "#9ca3af", { detail: true });
      st.add("cyl", -0.4, 0.82, 0.45, 0.05, 0.4, 0.05, pal.wood, { detail: true, rz: Math.PI / 2 });
      for (let k = 0; k < 2; k++) st.add("octa", 0.15 + k * 0.4, 0.76, 0.45, 0.16, 0.24, 0.16, pick(rng, ["#ef4444", "#22c55e", "#3b82f6", "#e5e7eb"]), { detail: true, glow: tier >= 3 });
      return;
    case "orc": // hide tent, meat and bones
      st.add("pyramid", 0, 0.06, -0.2, 2.0, 1.8, 1.8, pal.canvas, { mat: "hide" });
      st.add("box", 0, 0.06, 0.55, 1.5, 0.65, 0.4, pal.wood);
      for (let k = 0; k < 3; k++) st.add("sphere", -0.45 + k * 0.45, 0.7, 0.55, 0.3, 0.2, 0.2, pick(rng, ["#991b1b", "#b45309", "#7f1d1d"]), { detail: true });
      st.add("cyl", 0.5, 0.75, 0.62, 0.06, 0.45, 0.06, pal.bone, { detail: true, rz: Math.PI / 2 });
      return;
    case "arcane": // floating counter, potions and scrolls
      st.add("cyl", 0, 0.06, 0.2, 1.8, 0.03, 1.4, pal.accent, { glow: tier >= 3 });
      st.add("box", 0, 0.35, 0.45, 1.5, 0.35, 0.4, pal.wall, { mat: "plain" });
      for (const sx of [-0.8, 0.8]) st.add("octa", sx, 0.06, -0.4, 0.2, 1.7, 0.2, pal.stone, { mat: "gem" });
      st.add("box", 0, 1.6, 0, 1.9, 0.08, 1.4, pal.roof, { rx: 0.18, mat: "cloth" });
      goods(["#e879f9", "#67e8f9", "#a3e635", "#fde047"], "cyl", true);
      return;
    default: {
      const awnings = [pal.accent, "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
      for (const [px, pz] of [
        [-0.75, -0.55],
        [0.75, -0.55],
        [-0.75, 0.55],
        [0.75, 0.55]
      ])
        st.add("box", px, 0.06, pz, 0.08, 1.5, 0.08, pal.wood);
      st.add("box", 0, 1.55, 0, 1.8, 0.08, 1.4, awnings[i % awnings.length], { rx: 0.18, mat: "cloth" });
      st.add("box", 0, 0.06, 0.45, 1.5, 0.7, 0.4, pal.wood);
      goods(["#f97316", "#84cc16", "#facc15", "#ef4444", "#d6b25e"], "sphere");
    }
  }
}

/** Dragon sizes per tier: wyrmling effigy → full dragon → elder → ancient → mythic */
const DRAGON_SCALE = [0, 0.55, 0.85, 1.0, 1.08, 1.15];

/** Footprint radius of the dragon statue at a tier (walkers keep clear of it) */
const dragonRadius = (tier: number) => (tier > 0 ? Math.max(2.4, 2.4 * (DRAGON_SCALE[tier] ?? 1)) : 1.6);

/**
 * Dragon statue sculpted in each civilization's style. The plinth is full size from tier 1; the dragon on it grows
 * with the tier, tier 3 gilds the plinth, tier 4 adds burning braziers, tier 5 bathes it in rising embers.
 */
function dragonStatue(bb: Builder, ctx: Ctx, tier = 3) {
  const { pal, civ, rng } = ctx;
  // HD: the statue is painted (stone's cracks read as paving on its big body); its plinth dressed stone
  const base = bb.child(0, 0);
  base.mat = "plain";
  const sc = DRAGON_SCALE[tier] ?? 1;
  const plinthTop = civ === "dwarf" ? 1.11 : 0.86;
  // Body parts are authored for a plinth top at 0.86 (dwarves: +0.3); scale them about that point
  const d = {
    add: (shape: Parameters<Builder["add"]>[0], x: number, y0: number, z: number, w: number, h: number, dd: number, color: string, o: Parameters<Builder["add"]>[8] = {}) =>
      base.add(shape, x * sc, plinthTop + (y0 - plinthTop) * sc, z * sc, w * sc, h * sc, dd * sc, color, o)
  };
  const plinthB = bb.child(0, 0);
  plinthB.mat = civ === "orc" ? "stone" : "masonry";
  const plinth = {
    add: plinthB.add.bind(plinthB)
  };
  const look = {
    human: { body: "#b91c1c", wing: "#7f1d1d", horn: GOLD, eye: "#f97316", plinth: "#e5e7eb" },
    elf: { body: "#10b981", wing: "#047857", horn: "#ecfccb", eye: "#67e8f9", plinth: pal.stone },
    dwarf: { body: "#b45309", wing: "#92400e", horn: "#fde68a", eye: "#f97316", plinth: "#3f3f46" },
    orc: { body: pal.bone, wing: "#d6c7a8", horn: "#a8a29e", eye: "#ef4444", plinth: pal.stone },
    arcane: { body: "#6d28d9", wing: "#c084fc", horn: "#e9d5ff", eye: "#e879f9", plinth: "#1e1b4b" }
  }[civ];

  // Plinth: dwarves carve an anvil, orcs pile rocks
  if (civ === "dwarf") {
    plinth.add("box", 0, 0.06, 0, 2.2, 0.4, 1.6, look.plinth);
    plinth.add("box", 0, 0.46, 0, 1.2, 0.3, 1.0, look.plinth);
    plinth.add("box", 0, 0.76, 0, 2.4, 0.35, 1.5, look.plinth);
  } else if (civ === "orc") {
    for (let k = 0; k < 5; k++) plinth.add("sphere", -0.8 + k * 0.4, 0.06, (k % 2) * 0.4 - 0.2, 0.8, 0.6, 0.8, look.plinth);
  } else {
    plinth.add("box", 0, 0.06, 0, 2.2, 0.8, 2.2, look.plinth);
  }
  if (tier >= 3 && civ !== "orc") {
    // Gilded band around the plinth
    plinth.add("box", 0, civ === "dwarf" ? 0.86 : 0.5, 0, civ === "dwarf" ? 2.52 : 2.32, 0.14, civ === "dwarf" ? 1.62 : 2.32, GOLD, { mat: "gold" });
  }
  if (tier >= 4) {
    // Burning braziers flanking the statue
    for (const sx of [-1, 1]) {
      plinth.add("cyl", sx * 1.75, 0.06, 1.2, 0.18, 1.3, 0.18, "#3f3f46", { mat: "iron" });
      plinth.add("cyl", sx * 1.75, 1.36, 1.2, 0.55, 0.25, 0.55, "#3f3f46", { mat: "iron" });
      plinth.add("sphere", sx * 1.75, 1.61, 1.2, 0.42, 0.5, 0.42, "#f97316", { glow: true });
    }
  }
  if (tier >= 5) {
    for (let k = 0; k < 6; k++) {
      base.actor({ kind: "sparkle", x: range(rng, -1.6, 1.6), y: range(rng, 1.0, 3.5), z: range(rng, -1.6, 1.6), yaw: 0, motion: "float", speed: range(rng, 0.35, 0.6), phase: rng() * 10, colors: ["#f97316"] });
    }
  }
  const y = civ === "dwarf" ? 0.3 : 0;

  const wingGlow = civ === "arcane";
  d.add("sphere", 0, 0.9 + y, 0, 1.4, 1.1, 2.0, look.body);
  d.add("cyl", 0, 1.5 + y, 0.85, 0.42, 1.3, 0.42, look.body, { rx: 0.55 });
  d.add("box", 0, 2.4 + y, 1.45, 0.55, 0.45, 0.85, look.body, { hdShape: "snout" });
  d.add("cone", -0.18, 2.75 + y, 1.2, 0.1, 0.45, 0.1, look.horn, { rx: -0.5, mat: tier >= 3 ? "gold" : "bone" });
  d.add("cone", 0.18, 2.75 + y, 1.2, 0.1, 0.45, 0.1, look.horn, { rx: -0.5, mat: tier >= 3 ? "gold" : "bone" });
  d.add("box", -1.3, 1.6 + y, 0, 2.0, 0.06, 1.3, look.wing, { rz: 0.5, glow: wingGlow });
  d.add("box", 1.3, 1.6 + y, 0, 2.0, 0.06, 1.3, look.wing, { rz: -0.5, glow: wingGlow });
  d.add("cone", 0, 0.8 + y, -1.4, 0.4, 1.6, 0.4, look.body, { rx: -1.4 });
  d.add("sphere", 0, 2.4 + y, 1.92, 0.22, 0.18, 0.22, look.eye, { glow: true, hd: false });
  dragonHd(d.add, y, look, tier);
  if (tier >= 5) mythicHd(d.add, plinthB, y, civ);

  switch (civ) {
    case "human": // gold crest along the spine
      for (let k = 0; k < 4; k++) d.add("cone", 0, 1.85 + y - k * 0.12, 0.5 - k * 0.45, 0.14, 0.32, 0.14, GOLD);
      break;
    case "elf": // vines winding around the body
      for (let k = 0; k < 4; k++) d.add("cyl", 0, 0.7 + k * 0.32, -0.6 + k * 0.45, 1.5, 0.06, 0.1, "#4ade80", { ry: k * 0.8 });
      d.add("sphere", 0.5, 1.8, 0.6, 0.18, 0.18, 0.18, "#f0abfc", { glow: true, detail: true });
      break;
    case "orc": // exposed ribs
      for (let k = 0; k < 4; k++) d.add("cyl", 0, 0.6, -0.6 + k * 0.4, 1.55, 0.1, 0.1, "#a8a29e", { rx: Math.PI / 2, rz: Math.PI / 2 });
      break;
    case "arcane": // crystals along the spine
      for (let k = 0; k < 4; k++) d.add("octa", 0, 1.8 - k * 0.12, 0.5 - k * 0.45, 0.2, 0.42, 0.2, pal.accent, { glow: true });
      break;
  }
}

/**
 * Mana Spire tiers: a humming standing stone (1), crowned by a glowing crystal (2), the civilization's full spire (3),
 * raised on a runed pedestal (4), circled by celestial orbs (5)
 */
function manaSpire(bb: Builder, ctx: Ctx, tier = 3) {
  const { pal, civ, rng } = ctx;
  // HD: dressed stone, its crystals gems (glowing ones stay as they are)
  const base = bb.child(0, 0);
  base.mat = "masonry";
  if (tier <= 2) {
    base.add("cyl", 0, 0.06, 0, 1.8, 0.3, 1.8, pal.stone);
    base.add("box", 0, 0.36, 0, 0.8, 2.6, 0.6, pal.stone, { rz: 0.05, mat: "hide" });
    monolithHd(base, tier, pal.stone);
    base.add("box", 0, 1.0, 0.33, 0.3, 0.9, 0.06, pal.accent, { glow: tier >= 2 }); // its rune wakes at tier 2
    if (tier === 2) base.add("octa", 0, 3.2, 0, 0.6, 1.0, 0.6, "#a5f3fc", { glow: true });
    for (let k = 0; k < (tier === 2 ? 4 : 2); k++) {
      base.actor({ kind: "sparkle", x: range(rng, -0.9, 0.9), y: range(rng, 0.8, 2.4), z: range(rng, -0.9, 0.9), yaw: 0, motion: "float", speed: range(rng, 0.3, 0.6), phase: rng() * 10, colors: ["#a5f3fc"] });
    }
    return;
  }
  // Tier 4+ stands on a runed pedestal (top at 0.51) and grows taller; the spire's own base starts on top of it
  const pedestal = tier >= 4;
  const sc = tier >= 5 ? 1.25 : tier >= 4 ? 1.12 : 1;
  const lift = pedestal ? 0.51 - 0.06 * sc : 0;
  if (pedestal) {
    base.add("cyl", 0, 0.06, 0, 2.6, 0.45, 2.6, "#44403c");
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      base.add("box", Math.cos(a) * 1.36, 0.1, Math.sin(a) * 1.36, 0.22, 0.25, 0.08, pal.accent, { glow: true, ry: -a + Math.PI / 2 });
    }
  }
  const m = {
    add: (shape: Parameters<Builder["add"]>[0], x: number, y0: number, z: number, w: number, h: number, d: number, color: string, o: Parameters<Builder["add"]>[8] = {}) =>
      base.add(shape, x * sc, lift + y0 * sc, z * sc, w * sc, h * sc, d * sc, color, o),
    actor: (a: Parameters<Builder["actor"]>[0]) => base.actor({ ...a, y: lift + a.y * sc })
  };
  if (tier >= 5) {
    // Celestial orbs circling the spire
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      base.add("sphere", Math.cos(a) * 1.9, 3.4 + (k % 2) * 0.8, Math.sin(a) * 1.9, 0.36, 0.36, 0.36, "#e0f2fe", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + a });
    }
  }
  let sparkle = "#e9d5ff";
  switch (civ) {
    case "human": // white obelisk with a floating sun crystal
      m.add("box", 0, 0.06, 0, 2.0, 0.4, 2.0, "#e5e7eb");
      m.add("box", 0, 0.46, 0, 0.9, 3.4, 0.9, "#f8fafc");
      m.add("pyramid", 0, 3.86, 0, 0.95, 0.6, 0.95, GOLD, { mat: "gold" });
      m.add("sphere", 0, 4.8, 0, 0.6, 0.6, 0.6, "#fde047", { glow: true });
      sparkle = "#fef3c7";
      break;
    case "elf": // crystal tree
      m.add("cyl", 0, 0.06, 0, 1.8, 0.3, 1.8, pal.stone);
      m.add("cyl", 0, 0.36, 0, 0.4, 3.0, 0.4, pal.trunk, { mat: "wood", hdShape: "trunk" });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        m.add("octa", Math.cos(a) * 0.8, 2.6 + (k % 2) * 0.5, Math.sin(a) * 0.8, 0.35, 0.8, 0.35, "#67e8f9", { glow: true });
      }
      m.add("octa", 0, 3.4, 0, 0.6, 1.2, 0.6, "#a5f3fc", { glow: true });
      sparkle = "#a5f3fc";
      break;
    case "dwarf": // rune-carved menhir over a molten core
      m.add("cyl", 0, 0.06, 0, 2.0, 0.4, 2.0, "#3f3f46");
      m.add("sphere", 0, 0.3, 0, 1.0, 0.6, 1.0, "#f97316", { glow: true });
      m.add("box", 0, 0.5, 0, 1.0, 3.8, 0.7, pal.stone, { rz: 0.04, mat: "hide" });
      for (let k = 0; k < 4; k++) m.add("box", 0, 1.1 + k * 0.75, 0.36, 0.35, 0.2, 0.04, "#fb923c", { glow: true });
      sparkle = "#fdba74";
      break;
    case "orc": // skull totem crowned with fire
      m.add("cyl", 0, 0.06, 0, 1.8, 0.4, 1.8, pal.stone);
      m.add("cyl", 0, 0.46, 0, 0.35, 3.2, 0.35, pal.wood, { mat: "wood" });
      for (let k = 0; k < 3; k++) m.add("sphere", 0, 1.0 + k * 0.85, 0.2, 0.5, 0.45, 0.5, pal.bone, { mat: "bone" });
      for (const sx of [-1, 1]) m.add("cone", sx * 0.45, 3.2, 0.1, 0.12, 0.6, 0.12, pal.bone, { rz: -sx * 0.8, mat: "bone" });
      m.add("cone", 0, 3.7, 0, 0.6, 1.0, 0.6, "#f97316", { glow: true });
      m.add("cone", 0, 3.75, 0, 0.3, 1.2, 0.3, "#fde047", { glow: true });
      sparkle = "#fb923c";
      break;
    default: // arcane floating crystal
      m.add("cyl", 0, 0.06, 0, 2.0, 0.5, 2.0, "#1e1b4b");
      m.add("octa", 0, 0.6, 0, 0.9, 3.4, 0.9, "#7c3aed", { mat: "gem" });
      m.add("octa", 0, 4.4, 0, 0.7, 1.4, 0.7, "#c084fc", { glow: true });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        m.add("octa", Math.cos(a) * 1.1, 1.8 + k * 0.6, Math.sin(a) * 1.1, 0.3, 0.55, 0.3, "#a78bfa", { glow: true });
      }
  }
  for (let k = 0; k < 6; k++) {
    m.actor({
      kind: "sparkle",
      x: range(rng, -1.2, 1.2),
      y: range(rng, 0.8, 2.5),
      z: range(rng, -1.2, 1.2),
      yaw: 0,
      motion: "float",
      speed: range(rng, 0.3, 0.6),
      phase: rng() * 10,
      colors: [sparkle]
    });
  }
  if (tier >= 5) apexHd(base, m.add, civ, sparkle);
}

/**
 * Spymaster's Tower (local +z faces the plaza): a timber lookout (1) → a stone owlery (2) → taller with a sapphire
 * scrying lens under a slate cap (3) → a dark buttressed archive with an aether lens (4) → a gold-crowned spire with
 * an ever-open eye (5). Owls (crow actors in owl colours) circle it from tier 2 and perch on it.
 */
function spymasterTower(bb: Builder, ctx: Ctx, tier: number) {
  const { pal, rng } = ctx;
  // HD: the timber lookout in wood, the towers in dressed stone
  const b = bb.child(0, 0);
  b.mat = tier === 1 ? "wood" : "masonry";
  const OWL = ["#a16207", "#d6d3d1", "#78716c"];
  const owls = (n: number, r: number, y: number) => {
    for (let i = 0; i < n; i++) {
      b.actor({ kind: "crow", x: r + range(rng, -0.4, 0.4), y: y + range(rng, -0.5, 0.6), z: 0, x2: 0, z2: 0, yaw: 0, motion: "circle", speed: range(rng, 1.0, 1.6), phase: rng() * Math.PI * 2, colors: [OWL[i % OWL.length]], scale: 1.8 });
    }
  };
  if (tier === 1) {
    // Timber lookout: four posts, a planked loft with a lamp and a brass spyglass, a little shingle roof
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) b.add("cyl", x, 0, z, 0.18, 3.0, 0.18, pal.trunk);
    for (const y of [0.9, 1.9]) b.add("box", 0, y, 0.72, 1.4, 0.08, 0.06, pal.wood);
    b.add("box", 0, 3.0, 0, 1.9, 0.16, 1.9, pal.wood);
    b.add("box", 0, 3.16, 0.9, 1.9, 0.5, 0.08, pal.wood);
    b.add("box", 0.5, 3.16, 0.3, 0.26, 0.3, 0.26, pal.window, { glow: true });
    b.add("cyl", -0.4, 3.5, 0.85, 0.12, 0.6, 0.12, "#b08d57", { rx: Math.PI / 2.4, mat: "gold" });
    for (const sx of [-1, 1]) b.add("cyl", sx * 0.85, 3.16, -0.85, 0.12, 0.9, 0.12, pal.trunk);
    b.add("pyramid", 0, 4.06, 0, 2.2, 0.9, 2.2, pal.roof);
    b.actor({ kind: "crow", x: 0.8, y: 3.66, z: 0.9, yaw: 0, motion: "idle", speed: 0.4, phase: rng() * 10, colors: [OWL[0]], scale: 1.6 });
    lookoutHd(b, pal.trunk);
    return;
  }
  const dark = tier >= 4;
  const h = tier >= 5 ? 6.6 : tier === 4 ? 6.0 : tier === 3 ? 5.0 : 4.0;
  const stone = dark ? "#27272a" : pal.stone;
  const trim = tier >= 5 ? GOLD : dark ? "#52525b" : pal.wall;
  // Footing, round tower and a corbelled walkway near the top
  b.add("cyl", 0, 0, 0, 2.6, 0.4, 2.6, trim);
  b.add("cyl", 0, 0.4, 0, 2.0, h, 2.0, stone);
  b.add("cyl", 0, 0.4 + h, 0, 2.5, 0.3, 2.5, trim);
  // Arrow-slit windows (lit at night-blue for the archive) standing proud of the wall
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    b.add("box", Math.cos(a) * 1.04, 0.4 + h * (0.35 + k * 0.15), Math.sin(a) * 1.04, 0.18, 0.6, 0.18, dark ? "#93c5fd" : pal.window, { glow: true, ry: -a });
  }
  // Door facing the plaza
  b.add("box", 0, 0.4, 1.04, 0.6, 1.1, 0.12, pal.wood, { mat: "wood" });
  spyTowerHd(b, tier, h, pal.stone);
  // Perches round the walkway, an owl on one of them
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    b.add("box", Math.cos(a) * 1.4, 0.55 + h, Math.sin(a) * 1.4, 0.5, 0.08, 0.08, pal.wood, { ry: -a, mat: "wood" });
  }
  b.actor({ kind: "crow", x: Math.cos(Math.PI / 4) * 1.4, y: 0.63 + h, z: Math.sin(Math.PI / 4) * 1.4, yaw: 0, motion: "idle", speed: 0.4, phase: rng() * 10, colors: [OWL[1]], scale: 1.6 });
  if (dark) {
    // Buttresses and sealed ledgers stacked at the foot
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      b.add("box", Math.cos(a) * 1.15, 0.4, Math.sin(a) * 1.15, 0.4, h * 0.55, 0.4, "#3f3f46", { ry: -a });
    }
    for (let k = 0; k < 3; k++) b.add("box", 1.25 + (k % 2) * 0.1, 0.4 + k * 0.22, 0.6, 0.5, 0.2, 0.36, k === 1 ? "#7f1d1d" : "#44403c", { ry: k * 0.3, mat: "leather" });
  }
  const top = 0.7 + h;
  if (tier === 2) {
    b.add("cone", 0, top, 0, 2.3, 1.6, 2.3, pal.roof);
    owls(2, 3.0, top + 1.5);
    return;
  }
  // Lens room under the cap: sapphire (3), aether (4), the ever-open eye (5)
  b.add("cyl", 0, top, 0, 1.6, 1.0, 1.6, stone);
  const lens = tier >= 5 ? "#e0f2fe" : tier === 4 ? "#c4b5fd" : "#3b82f6";
  b.add("sphere", 0, top + 0.15, 0.78, 0.7, 0.7, 0.3, lens, { glow: true });
  if (tier >= 5) b.add("sphere", 0, top + 0.3, 0.98, 0.32, 0.4, 0.14, "#1d4ed8", { glow: true }); // the iris, proud of the eye
  b.add("cone", 0, top + 1.0, 0, 2.2, tier >= 4 ? 2.4 : 1.8, 2.2, dark ? "#18181b" : "#475569", { mat: "plain" });
  if (tier >= 5) {
    // Gold crown of spikes round the cap and a star on its point
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.add("cone", Math.cos(a) * 0.9, top + 1.0, Math.sin(a) * 0.9, 0.2, 0.9, 0.2, GOLD, { mat: "gold" });
    }
    b.add("octa", 0, top + 3.5, 0, 0.4, 0.6, 0.4, PALE_GOLD, { glow: true });
    nightCourtHd(b, h, top);
  }
  owls(tier >= 4 ? 3 : 2, 3.2, top + 2);
  for (let k = 0; k < (tier >= 4 ? 4 : 2); k++) {
    b.actor({ kind: "sparkle", x: range(rng, -0.9, 0.9), y: range(rng, top - 0.4, top + 1.2), z: range(rng, 0.6, 1.4), yaw: 0, motion: "float", speed: range(rng, 0.3, 0.6), phase: rng() * 10, colors: [lens] });
  }
}

/* ========================================================================= */
/* BURNING WALLS                                                             */
/* ========================================================================= */

/** Height of the city wall by tier (fence, palisade, stone, fortress, bastion, citadel) */
const WALL_HEIGHTS = [1.0, 1.6, 2.4, 3.6, 4.6, 5.6];

/**
 * A city whose walls burn (≤ 25% HP): fire all along the walls either side of the gates, a share of the houses
 * alight (each in a curtain of fire-light, epic class) and the town hall smoking. Seeded by the kingdom, so the same
 * houses burn on every visit. Drawn by FireFx (flames, smoke, embers) and TierFx (the curtains).
 */
export function cityFire(kingdom: DeveloperKingdom, layout: CityLayout, hallTop: number): { sites: FireSite[]; glow: TierFxItem[] } {
  const sites: FireSite[] = [];
  const glow: TierFxItem[] = [];
  const rng = rngFor(`fire-${kingdom.id}`);
  const wallE = layout.half + 0.9;
  const wallH = WALL_HEIGHTS[kingdom.upgrades?.walls ?? 0] ?? 2.4;
  // Along the four walls, every few paces, leaving the gate gaps (the road runs through them)
  const sides: Array<(t: number) => [number, number]> = [(t) => [t, wallE], (t) => [t, -wallE], (t) => [-wallE, t], (t) => [wallE, t]];
  sides.forEach((at, s) => {
    for (let t = -wallE + 1.5, i = 0; t < wallE - 1; t += 3.2, i++) {
      if (Math.abs(t) < ROAD_HALF + 1.6 || rng() < 0.2) continue;
      const [x, z] = at(t + range(rng, -0.6, 0.6));
      sites.push({ id: `${kingdom.id}:wall${s}-${i}`, x, y: 0, z, r: 1.0, h: wallH, flames: 3, size: 1.1 + wallH * 0.12, plumes: i % 3 === 0 ? 1 : 0 });
    }
  });
  // A share of the houses: a third of the plots, at least 3 and at most 10
  const plots = layout.plots.filter((p) => p.building);
  const want = Math.min(10, Math.max(3, Math.round(plots.length / 3)));
  const burning = [...plots].sort((a, b) => rngFor(`${kingdom.id}:${a.key}`)() - rngFor(`${kingdom.id}:${b.key}`)()).slice(0, want);
  for (const p of burning) {
    const r = p.size * 0.36;
    sites.push({ id: `${kingdom.id}:${p.key}`, x: p.x, y: 0, z: p.z, r, h: Math.max(1.5, p.size * 0.55), flames: 6, size: Math.max(0.9, r * 0.5) });
    glow.push({ id: `${kingdom.id}:${p.key}:fire`, x: p.x, y: 0, z: p.z, size: r * 1.25, ...FIRE_GLOW });
  }
  // The town hall: fire on its walls, a column of smoke from its roof
  sites.push({ id: `${kingdom.id}:hall`, x: 0, y: 0, z: -3, r: 3.2, h: hallTop * 0.7, flames: 9, size: 1.2, plumes: 2 });
  return { sites, glow };
}

/* ------------------------------------------------------------------------- */
/* The city after dark (GAME_GUIDE §7 Day, night & seasons)                   */
/* ------------------------------------------------------------------------- */

/** 🥀 Barren Spell (GAME_GUIDE §10 *World Disasters*): share of the grown-up townsfolk still about; no child plays */
const BARREN_OUT_SHARE = 0.35;

/** 🥀 The streets empty under the Barren Spell: the children stay in and most grown-ups too (seeded per person) */
export function barrenActors(actors: SceneOut["actors"]): SceneOut["actors"] {
  return actors.filter((a) => {
    if (!PERSON_KIND.test(a.kind)) return true;
    if ((a.scale ?? 1) < 1 || a.motion === "toss" || a.motion === "catch") return false;
    const v = Math.sin(a.phase * 53.3 + a.x * 9.7 + a.z * 13.1) * 43758.5453;
    return v - Math.floor(v) < BARREN_OUT_SHARE;
  });
}

/** Share of the day's townsfolk still out after dark (the rest are indoors) */
const NIGHT_OUT_SHARE = 0.2;
const PERSON_KIND = /^(villager|farmer|soldier)_/;

/**
 * The townsfolk at night: the children are in bed (no play, no ball), most people are indoors and the few still
 * about (on the roads, at the plots) walk a little slower and each carries their civilization's light (a lantern,
 * wisp, miner's lamp, torch or void orb). Animals settle down, and the watch walks the main roads and the front of
 * the plaza in pairs with lights. Same meshes as by day plus one batch of lights, so a handful of draw calls.
 * Deterministic: who stays out is seeded per person.
 */
export function cityNightActors(kingdom: DeveloperKingdom, layout: CityLayout, dayActors: SceneOut["actors"]): SceneOut["actors"] {
  const civ = kingdom.civilization;
  const out = emptyScene();
  const root = new Builder(out);
  const rng = rngFor(`night-watch-${kingdom.id}`);
  const ctx: Ctx = { civ, pal: PALETTES[civ], rng, type: "residential_commercial", species: "sheep", budget: { people: 0, animals: 0 }, lively: 0.3 };

  for (const a of dayActors) {
    if (a.motion === "toss" || a.motion === "catch") continue; // the ball games end at dusk
    if (!PERSON_KIND.test(a.kind)) {
      // Grazing and pecking animals settle down for the night
      out.actors.push(a.motion === "graze" || a.motion === "peck" ? { ...a, motion: "idle", speed: a.speed * 0.3 } : a);
      continue;
    }
    if ((a.scale ?? 1) < 1) continue; // children are asleep
    const v = Math.sin(a.phase * 91.7 + a.x * 12.3 + a.z * 7.1) * 43758.5453;
    if (v - Math.floor(v) >= NIGHT_OUT_SHARE) continue;
    out.actors.push({ ...a, speed: a.speed * 0.75 });
  }

  // The night watch: two soldiers up and down each main road, one on each side, and two along the front of the plaza
  const E = layout.half;
  const start = PLAZA_HALF + 1;
  const end = Math.max(start + 4, E - 2);
  for (let axis = 0; axis < 4; axis++) {
    for (const side of [-1, 1]) {
      const lateral = side * (ROAD_HALF - 0.55);
      const [x1, z1, x2, z2] =
        axis === 0 ? [start, lateral, end, lateral] : axis === 1 ? [-start, lateral, -end, lateral] : axis === 2 ? [lateral, start, lateral, end] : [lateral, -start, lateral, -end];
      person(root, ctx, "soldier", x1, z1, "walk", x2, z2);
      const g = out.actors[out.actors.length - 1];
      g.speed = range(rng, 0.45, 0.55);
    }
  }
  for (const side of [-1, 1]) {
    person(root, ctx, "soldier", side * 2.5, PLAZA_HALF - 0.8, "walk", side * (PLAZA_HALF - 1.5), PLAZA_HALF - 0.8);
    out.actors[out.actors.length - 1].speed = 0.4;
  }

  // Everyone out carries a light: an actor posed exactly like its bearer
  const lights = out.actors.filter((a) => PERSON_KIND.test(a.kind)).map((a) => ({ ...a, kind: `light_${civ}` as const, colors: undefined }));
  return [...out.actors, ...lights];
}

/** 🎉 Festival poles round the fountain, clear of the castle, the dragon statue, the mana spire and the dance */
const FESTIVAL_POLES: Array<[number, number]> = [
  [-4.6, 3],
  [4.6, 3],
  [4.6, 12.3],
  [-4.6, 12.3]
];
const FESTIVAL_POLE_H = 4.4;
/** Pennant colours besides the civilization's own cloth and accent */
const FESTIVAL_CLOTH = ["#f43f5e", "#facc15", "#38bdf8", "#4ade80", "#f8fafc"];

/**
 * 🎉 A Festival in the city (GAME_GUIDE §13): bunting and paper lanterns strung between four poles over the plaza
 * (round it and across the fountain), a ring of dancers round the fountain and townsfolk cheering. The props are their
 * own batch (drawn through the HD model kit in HD); the dancers are townsfolk, so they take the HD actors too.
 */
export function cityFestival(kingdom: DeveloperKingdom): SceneOut {
  const civ = kingdom.civilization;
  const out = emptyScene();
  const root = new Builder(out);
  const rng = rngFor(`festival-${kingdom.id}`);
  const pal = PALETTES[civ];
  const ctx: Ctx = { civ, pal, rng, type: "residential_commercial", species: "sheep", budget: { people: 0, animals: 0 }, lively: 0.6 };
  const add: Add = (...args) => root.add(...args);
  const cloth = [BANNER_CLOTH[civ], pal.accent, ...FESTIVAL_CLOTH];

  for (const [x, z] of FESTIVAL_POLES) {
    add("cyl", x, 0, z, 0.16, FESTIVAL_POLE_H, 0.16, pal.wood, { mat: "wood" });
    add("sphere", x, FESTIVAL_POLE_H, z, 0.26, 0.26, 0.26, pal.accent, { mat: "gold" });
    // HD: a stone foot and an iron collar where the strings are tied
    add("cyl", x, 0, z, 0.36, 0.22, 0.36, pal.stone, { mat: "stone", hd: true });
    add("cyl", x, FESTIVAL_POLE_H - 0.34, z, 0.28, 0.12, 0.28, "#52525b", { mat: "iron", hd: true });
  }

  // Strings: round the four sides and both diagonals (across the fountain), each sagging in the middle
  const strings: Array<[number, number, boolean]> = [
    [0, 1, false],
    [1, 2, false],
    [2, 3, false],
    [3, 0, false],
    [0, 2, true],
    [1, 3, true]
  ];
  let flag = 0;
  for (const [i, j, lanterns] of strings) {
    const [ax, az] = FESTIVAL_POLES[i];
    const [bx, bz] = FESTIVAL_POLES[j];
    const len = Math.hypot(bx - ax, bz - az);
    const top = FESTIVAL_POLE_H - 0.3;
    const sag = 0.06 * len;
    const at = (f: number): V3 => [ax + (bx - ax) * f, top - sag * 4 * f * (1 - f), az + (bz - az) * f];
    const segs = Math.max(4, Math.round(len / 1.4));
    for (let s = 0; s < segs; s++) along(add, "box", at(s / segs), at((s + 1) / segs), 0.04, 0.04, "#e7e5e4", { mat: "cloth" });
    const ry = -Math.atan2(bz - az, bx - ax);
    const step = lanterns ? 1.1 : 0.55;
    for (let d = step; d < len - step * 0.5; d += step) {
      const [x, y, z] = at(d / len);
      if (lanterns) {
        // Paper lanterns: they glow day and night; in HD a wooden cap and foot and a tassel
        const color = pick(rng, ["#fb923c", "#fbbf24", "#f87171"]);
        add("sphere", x, y - 0.62, z, 0.34, 0.4, 0.34, color, { glow: true, idle: IDLE_KIND.pulse, phase: rng() * 6, mat: "cloth" });
        add("cyl", x, y - 0.26, z, 0.18, 0.06, 0.18, pal.wood, { mat: "wood", hd: true });
        add("cyl", x, y - 0.7, z, 0.16, 0.06, 0.16, pal.wood, { mat: "wood", hd: true });
        add("box", x, y - 0.95, z, 0.04, 0.24, 0.04, "#dc2626", { mat: "cloth", hd: true });
      } else {
        // Pennants hang point-down and flutter, colours in turn
        add("pyramid", x, y - 0.46, z, 0.34, 0.42, 0.03, cloth[flag++ % cloth.length], { ry, rz: Math.PI, idle: IDLE_KIND.flutter, mat: "cloth" });
      }
    }
  }

  // The dance: a ring of townsfolk running round the fountain, and townsfolk cheering at the edge of it
  const fountainR = (kingdom.upgrades?.plaza ?? 0) >= 3 ? 3.9 : (kingdom.upgrades?.plaza ?? 0) >= 1 ? 2.5 : 1.8;
  const ring = Math.min(fountainR + 1.1, 4.2);
  const dancers = 10;
  for (let k = 0; k < dancers; k++) {
    const a = (k / dancers) * Math.PI * 2;
    person(root, ctx, "villager", Math.cos(a) * ring, FOUNTAIN_Z + Math.sin(a) * ring, "circle", 0, FOUNTAIN_Z);
    const g = out.actors[out.actors.length - 1];
    g.phase = a;
    g.speed = 0.55;
  }
  for (const [x, z] of [
    [-5.8, 4.6],
    [5.8, 4.6],
    [-2.8, 2.6],
    [2.8, 2.6]
  ] as Array<[number, number]>) {
    person(root, ctx, "villager", x, z, "cheer");
    out.actors[out.actors.length - 1].yaw = Math.atan2(-x, FOUNTAIN_Z - z);
  }
  return out;
}
