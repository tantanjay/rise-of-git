import * as THREE from "three";
import { FlatWorldMapData } from "@/types";
import { WATER_LANDMARK_TYPES } from "./landmarks";

/**
 * One continuous continent for the whole realm. Every province and buffer is a
 * "region" with its own height + colour profile; regions are blended by distance,
 * so the valley fades into the forest, the forest into the glades, and the fjord
 * cuts a real inlet down to the sea instead of sitting on top of the land.
 */

export const SEA_LEVEL = 1.0;
export const WORLD_SIZE = 170;

/* ------------------------------------------------------------------------- */
/* Noise                                                                     */
/* ------------------------------------------------------------------------- */

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

export function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function ridged(x: number, y: number): number {
  return 1 - Math.abs(fbm(x, y, 4) * 2 - 1);
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------------- */
/* Regions                                                                   */
/* ------------------------------------------------------------------------- */

/** Centre line of Valoria's river (it runs south from z ≈ 30 to the coast); shared by the terrain, bridges and the water's flow */
export const riverX = (z: number) => -44 + Math.sin(z * 0.12) * 4;
/** Where the river is carved, and how far down it flows (the water shader runs its current over this span) */
export const RIVER_FROM_Z = 30;

/** Drak'mar's lava fissures (centre, heading, length) and Ironforge's forge vents: built in scatter.ts, and no grass grows
 * in or beside them */
export const LAVA_FISSURES = [
  { x: 40, z: 46, rot: 0.4, len: 10 },
  { x: 51, z: 39, rot: -0.7, len: 9 },
  { x: 36, z: 37, rot: 1.1, len: 8 }
];
export const FORGE_VENTS = [[-7, -7], [8, -6], [-5, 8], [9, 7]].map(([ox, oz]) => ({ x: 44 + ox, z: -44 + oz }));

/** 0 in and right beside a lava fissure or forge vent, rising to 1 a little way out */
function hotClear(x: number, z: number): number {
  let d = Infinity;
  for (const f of LAVA_FISSURES) {
    // Distance to the fissure's line (it wanders up to 0.7 either side of it)
    const s = Math.sin(f.rot);
    const c = Math.cos(f.rot);
    const along = Math.max(-f.len / 2, Math.min(f.len / 2, (x - f.x) * s + (z - f.z) * c));
    d = Math.min(d, Math.hypot(x - (f.x + s * along), z - (f.z + c * along)) - 0.7);
  }
  for (const v of FORGE_VENTS) d = Math.min(d, Math.hypot(x - v.x, z - v.z) - 0.6);
  return smoothstep(1.2, 2.4, d);
}

export type RegionKind = "human" | "elf" | "dwarf" | "orc" | "arcane" | "sea" | "desert" | "forest" | "mountains";

interface Region {
  kind: RegionKind;
  x: number;
  z: number;
  sigma: number;
}

const REGIONS: Region[] = [
  { kind: "human", x: -44, z: 44, sigma: 26 },
  { kind: "elf", x: -44, z: -44, sigma: 26 },
  { kind: "dwarf", x: 44, z: -44, sigma: 26 },
  { kind: "orc", x: 44, z: 44, sigma: 26 },
  { kind: "arcane", x: 0, z: 0, sigma: 15 },
  { kind: "sea", x: 0, z: -48, sigma: 13 },
  { kind: "sea", x: 0, z: -66, sigma: 10 }, // fjord mouth opening to the northern ocean
  { kind: "desert", x: 0, z: 48, sigma: 14 },
  { kind: "forest", x: -48, z: 0, sigma: 14 },
  { kind: "mountains", x: 48, z: 0, sigma: 14 }
];

function regionHeight(kind: RegionKind, x: number, z: number, cx: number, cz: number): number {
  const d = Math.hypot(x - cx, z - cz);
  switch (kind) {
    case "human": {
      let h = 1.9 + fbm(x * 0.06, z * 0.06) * 0.7;
      // A river meanders from the valley down to the southern coast
      if (z > RIVER_FROM_Z) {
        const dist = Math.abs(x - riverX(z) - (cx + 44));
        h = THREE.MathUtils.lerp(h, 0.45, smoothstep(1.8, 0.6, dist) * smoothstep(30, 38, z));
      }
      return h;
    }
    case "elf":
      // Emerald islets separated by shallow lagoons
      return 0.5 + fbm(x * 0.085 + 7, z * 0.085) * 2.3;
    case "dwarf": {
      const raw = 2.0 + Math.max(0, 1 - d / 30) * 5.5 + fbm(x * 0.07, z * 0.07) * 0.9;
      const terraced = Math.floor(raw / 0.9) * 0.9;
      return THREE.MathUtils.lerp(raw, terraced, 0.75);
    }
    case "orc": {
      const base = 1.9 + fbm(x * 0.05, z * 0.05) * 0.6;
      const mesa = smoothstep(0.58, 0.64, fbm(x * 0.07 + 31, z * 0.07 - 13)) * 1.9;
      const canyon = smoothstep(0.12, 0.0, Math.abs(fbm(x * 0.04 - 5, z * 0.04 + 9) - 0.5)) * 1.1;
      return base + mesa - canyon;
    }
    case "arcane": {
      // Crater rim around a glowing rift floor (kept above sea level)
      if (d < 9) return 1.4;
      if (d < 15) return THREE.MathUtils.lerp(1.4, 3.2, smoothstep(9, 15, d));
      return THREE.MathUtils.lerp(3.2, 2.2, smoothstep(15, 24, d));
    }
    case "sea":
      return -1.2 + fbm(x * 0.1, z * 0.1) * 0.8;
    case "desert":
      return 1.8 + Math.sin(x * 0.33 + Math.sin(z * 0.21) * 2.2) * 0.35 * fbm(x * 0.05, z * 0.05) * 2 + fbm(x * 0.1, z * 0.1) * 0.3;
    case "forest":
      return 2.0 + fbm(x * 0.07, z * 0.07) * 0.8;
    case "mountains":
      return 2.4 + ridged(x * 0.075, z * 0.075) * 7.5 * Math.max(0, 1 - d / 24) + fbm(x * 0.1, z * 0.1) * 0.8;
  }
}

const REGION_COLOR: Record<RegionKind, string> = {
  human: "#5a9a3c",
  elf: "#3f9a5c",
  dwarf: "#6b7280",
  orc: "#a0522d",
  arcane: "#3b2f6b",
  sea: "#2c5f7a",
  desert: "#ddb460",
  forest: "#2f6b33",
  mountains: "#5b6170"
};

/* ------------------------------------------------------------------------- */
/* Terrain sampler                                                           */
/* ------------------------------------------------------------------------- */

/** Regions weighing less than this at a point (≈3 sigma away) are skipped */
const MIN_REGION_WEIGHT = 1e-4;

/** Parsed colours, so the per-vertex loop never re-parses hex strings */
const rgbCache = new Map<string, THREE.Color>();
const rgb = (hex: string) => {
  let c = rgbCache.get(hex);
  if (!c) rgbCache.set(hex, (c = new THREE.Color(hex)));
  return c;
};

interface Pad {
  x: number;
  z: number;
  r: number;
  minHeight: number;
}

/* ------------------------------------------------------------------------- */
/* Farm fields: noise-warped patches with soft edges and crop rows           */
/* ------------------------------------------------------------------------- */

interface FieldKind {
  /** Colour the field is laid in (none: open pasture) */
  hex?: string;
  /** Ploughed in rows */
  rows?: boolean;
  /** How dry its grass is, how many flowers grow on it */
  dry?: number;
  flowers?: number;
}

const FIELD_KINDS: FieldKind[] = [
  { hex: "#d9b44a", rows: true, dry: 1 }, // wheat
  { hex: "#9cb84a", rows: true }, // young crop
  { hex: "#7a5a32", rows: true }, // ploughed earth
  { hex: "#79b04a", flowers: 1 }, // flower meadow
  {}, // pasture
  {}
];
/** Fields are about this wide */
const FIELD_SIZE = 6.5;

interface Field {
  kind: number;
  /** Distance to the field's edge (world units, roughly) */
  edge: number;
  /** 0 at the edge, 1 inside (soft edges) */
  inside: number;
  /** Direction its rows run (radians) */
  angle: number;
  /** 0–1: this field's own shade, so two fields of the same crop never match */
  shade: number;
}

/** The farm field at a point: a jittered cell grid, warped by noise so no field is square */
function fieldAt(x: number, z: number): Field {
  // Two layers of warp: broad bends so no edge runs straight, and a finer wobble along each edge
  const wx = (x + (fbm(x * 0.045 + 3, z * 0.045 - 7, 2) - 0.5) * 11 + (valueNoise(x * 0.2 + 1, z * 0.2 - 4) - 0.5) * 2.4) / FIELD_SIZE;
  const wz = (z + (fbm(x * 0.045 - 11, z * 0.045 + 5, 2) - 0.5) * 11 + (valueNoise(x * 0.2 - 6, z * 0.2 + 2) - 0.5) * 2.4) / FIELD_SIZE;
  const ix = Math.floor(wx);
  const iz = Math.floor(wz);
  let d1 = Infinity;
  let d2 = Infinity;
  let cx = 0;
  let cz = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const gx = ix + dx;
      const gz = iz + dz;
      const px = gx + 0.05 + 0.9 * hash2(gx, gz + 17);
      const pz = gz + 0.05 + 0.9 * hash2(gx + 31, gz);
      const d = Math.hypot(wx - px, wz - pz);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        cx = gx;
        cz = gz;
      } else if (d < d2) d2 = d;
    }
  }
  const edge = ((d2 - d1) / 2) * FIELD_SIZE;
  const kind = Math.floor(hash2(cx * 1.7 + 5, cz * 1.3 - 2) * FIELD_KINDS.length);
  return { kind, edge, inside: smoothstep(0.3, 1.3, edge), angle: hash2(cx - 9, cz * 2.1 + 4) * Math.PI, shade: hash2(cx + 3.3, cz - 7.7) };
}

export interface Terrain {
  height: (x: number, z: number) => number;
  weights: (x: number, z: number) => Record<RegionKind, number>;
  geometry: () => THREE.BufferGeometry;
}

export function createTerrain(worldMap: FlatWorldMapData | null): Terrain {
  const weights = (x: number, z: number) => {
    const w: Record<RegionKind, number> = { human: 0, elf: 0, dwarf: 0, orc: 0, arcane: 0, sea: 0, desert: 0, forest: 0, mountains: 0 };
    let total = 0;
    for (const r of REGIONS) {
      const d = Math.hypot(x - r.x, z - r.z) / r.sigma;
      const v = Math.exp(-d * d);
      w[r.kind] += v;
      total += v;
    }
    for (const k in w) w[k as RegionKind] /= total || 1;
    return w;
  };

  const rawHeight = (x: number, z: number) => {
    let h = 0;
    let total = 0;
    for (const r of REGIONS) {
      const d = Math.hypot(x - r.x, z - r.z) / r.sigma;
      const v = Math.exp(-d * d);
      // Far-away regions contribute nothing visible; skipping their noise is the big speed-up
      if (v < MIN_REGION_WEIGHT) continue;
      h += regionHeight(r.kind, x, z, r.x, r.z) * v;
      total += v;
    }
    h /= total || 1;

    // Irregular coastline: everything fades into the ocean towards the board edge
    const angle = Math.atan2(z, x);
    const R = 70 + (fbm(Math.cos(angle) * 2.2 + 11, Math.sin(angle) * 2.2 + 5) - 0.5) * 14;
    const c = Math.pow(Math.pow(Math.abs(x) / R, 4) + Math.pow(Math.abs(z) / R, 4), 0.25);
    const land = smoothstep(1.04, 0.88, c);
    // Gentle swells and hollows, so flat land is never perfectly flat
    h += (fbm(x * 0.32 + 17, z * 0.32 - 9, 2) - 0.5) * 0.22 * land;
    return THREE.MathUtils.lerp(-2.6, h, land);
  };

  // Flatten small build pads under castles and landmarks so they never sit in water
  const pads: Pad[] = [];
  if (worldMap) {
    for (const p of Object.values(worldMap.kingdomPlacements)) {
      pads.push({ x: p.x, z: p.z, r: 4, minHeight: SEA_LEVEL + 0.7 });
    }
    for (const npc of worldMap.npcs) {
      if (WATER_LANDMARK_TYPES.has(npc.type)) continue;
      pads.push({ x: npc.x, z: npc.z, r: 3.2, minHeight: SEA_LEVEL + 0.5 });
    }
  }
  const padTargets = pads.map((p) => Math.max(rawHeight(p.x, p.z), p.minHeight));

  const height = (x: number, z: number) => {
    let h = rawHeight(x, z);
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const dx = x - p.x;
      const dz = z - p.z;
      if (Math.abs(dx) > p.r || Math.abs(dz) > p.r) continue;
      const k = smoothstep(p.r, p.r * 0.45, Math.hypot(dx, dz));
      if (k > 0) h = THREE.MathUtils.lerp(h, padTargets[i], k);
    }
    return h;
  };

  /** Base colour of one region at a point: large-scale noise breaks every region into meadows, dry patches, moss, scree */
  const regionColor = (kind: RegionKind, x: number, z: number, h: number, field: Field | null, out: THREE.Color) => {
    out.copy(rgb(REGION_COLOR[kind]));
    switch (kind) {
      case "human": {
        const n = fbm(x * 0.045 + 3, z * 0.045 - 8, 3);
        out.lerp(rgb("#8fa344"), smoothstep(0.56, 0.7, n) * 0.6); // dry meadow
        out.lerp(rgb("#3f7f30"), smoothstep(0.42, 0.3, n) * 0.6); // lush hollows
        if (field) {
          const f = FIELD_KINDS[field.kind];
          if (f.hex) {
            // Each field its own shade, the crop thinner in places (patchy growth, a worn corner), never one flat colour
            const patchy = 0.6 + 0.4 * smoothstep(0.3, 0.6, fbm(x * 0.22 + 9, z * 0.22 - 3, 2));
            out.lerp(tmp2.copy(rgb(f.hex)).multiplyScalar(0.88 + field.shade * 0.22), field.inside * patchy);
          }
          // Hedgerows between crop fields
          if (f.rows) out.multiplyScalar(1 - 0.16 * (1 - smoothstep(0.2, 1.0, field.edge)));
        }
        break;
      }
      case "elf": {
        const n = fbm(x * 0.05 - 4, z * 0.05 + 6, 3);
        out.lerp(rgb("#5cae58"), smoothstep(0.55, 0.7, n) * 0.6);
        out.lerp(rgb("#2c7a4c"), smoothstep(0.42, 0.3, n) * 0.7); // mossy dells
        break;
      }
      case "forest": {
        const n = fbm(x * 0.06 + 9, z * 0.06 + 2, 3);
        out.lerp(rgb("#26553a"), smoothstep(0.45, 0.3, n) * 0.7); // moss under the canopy
        out.lerp(rgb("#5a6e2c"), smoothstep(0.6, 0.72, n) * 0.5); // leaf litter
        break;
      }
      case "dwarf":
      case "mountains": {
        const n = fbm(x * 0.07 - 2, z * 0.07 + 13, 3);
        out.lerp(rgb("#8a8378"), smoothstep(0.55, 0.7, n) * 0.7); // pale scree
        out.lerp(rgb("#4f6b45"), smoothstep(0.45, 0.3, n) * smoothstep(4.5, 2.6, h) * 0.7); // moss low down
        break;
      }
      case "orc": {
        if (h > 3.2) out.copy(rgb("#c2703d"));
        const n = fbm(x * 0.06 + 21, z * 0.06 - 3, 3);
        out.lerp(rgb("#b8763a"), smoothstep(0.55, 0.7, n) * 0.6); // ochre dust
        out.lerp(rgb("#4a2618"), smoothstep(0.4, 0.28, n) * 0.6); // scorched earth
        break;
      }
      case "desert": {
        const n = fbm(x * 0.05 - 7, z * 0.05 + 1, 3);
        out.lerp(rgb("#e9c983"), smoothstep(0.55, 0.7, n) * 0.6);
        out.lerp(rgb("#c49352"), smoothstep(0.42, 0.3, n) * 0.6);
        break;
      }
      case "arcane": {
        if (h < 1.6) out.copy(rgb("#1e1b4b"));
        out.lerp(rgb("#4c2f7a"), smoothstep(0.55, 0.72, fbm(x * 0.08, z * 0.08 + 40, 2)) * 0.5);
        break;
      }
      case "sea":
        break;
    }
  };

  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();
  const colorAt = (x: number, z: number, h: number, w: Record<RegionKind, number>, field: Field | null, out: THREE.Color) => {
    out.setRGB(0, 0, 0);
    for (const k in w) {
      const kind = k as RegionKind;
      if (w[kind] < 0.01) continue;
      regionColor(kind, x, z, h, field, tmp);
      out.r += tmp.r * w[kind];
      out.g += tmp.g * w[kind];
      out.b += tmp.b * w[kind];
    }
    // Slight natural variation
    out.multiplyScalar(0.93 + fbm(x * 0.3, z * 0.3, 2) * 0.14);

    // Snow on high peaks
    if (h > 6.0) out.lerp(rgb("#eef2f7"), smoothstep(6.0, 7.0, h));

    // Beaches where land meets water (not on the arcane rift)
    if (w.arcane < 0.4 && h > SEA_LEVEL - 0.3 && h < SEA_LEVEL + 0.4) {
      out.lerp(rgb(w.desert > 0.3 ? "#e6c47a" : "#e3d3a0"), smoothstep(SEA_LEVEL + 0.4, SEA_LEVEL + 0.1, h));
    }

    // Deeper water reads darker
    if (h < SEA_LEVEL - 0.3) out.lerp(rgb("#1b3f57"), smoothstep(SEA_LEVEL - 0.3, -2.0, h));
  };

  /** 0 on a castle's or landmark's build pad, 1 in the open (no grass grows on pads) */
  const padClear = (x: number, z: number) => {
    let k = 1;
    for (const p of pads) {
      if (Math.abs(x - p.x) > p.r || Math.abs(z - p.z) > p.r) continue;
      k = Math.min(k, smoothstep(p.r * 0.55, p.r, Math.hypot(x - p.x, z - p.z)));
    }
    return k;
  };

  const geometry = () => {
    const segments = WORLD_SIZE;
    const geom = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // What the ground is made of, for the HD ground shader: (grass, desert sand, badlands, rift) and (stone, row angle, crop rows, beach)
    const surf = new Float32Array(pos.count * 4);
    const surf2 = new Float32Array(pos.count * 4);
    // Where grass grows, for the HD grass: (density, dryness, flowers − reeds) per vertex
    const flora = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = height(x, z);
      pos.setY(i, h);
      const w = weights(x, z);
      const field = w.human > 0.05 ? fieldAt(x, z) : null;
      colorAt(x, z, h, w, field, c);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      const land = h > SEA_LEVEL + 0.05 ? 1 : 0;
      const beach = w.arcane < 0.4 ? smoothstep(SEA_LEVEL + 0.45, SEA_LEVEL + 0.1, h) : 0;
      const kind = field ? FIELD_KINDS[field.kind] : null;
      const crop = kind?.rows ? field!.inside * w.human : 0;
      const grass = (w.human + w.elf + w.forest) * (1 - crop) * (1 - beach);
      surf[i * 4] = grass * land;
      surf[i * 4 + 1] = w.desert * land;
      surf[i * 4 + 2] = w.orc * land;
      surf[i * 4 + 3] = w.arcane;
      surf2[i * 4] = w.dwarf + w.mountains;
      surf2[i * 4 + 1] = field ? field.angle : 0;
      surf2[i * 4 + 2] = kind?.rows ? smoothstep(1.0, 2.0, field!.edge) * field!.inside * w.human : 0;
      surf2[i * 4 + 3] = beach * land;

      // Grass: lush in the green lands, sparse and dry on the steppe and badlands, reeds by the water, none on pads or in
      // and beside lava fissures and forge vents
      const clear = padClear(x, z) * hotClear(x, z);
      let density = grass * 1.3 + w.orc * 0.3 + w.desert * 0.12 + (w.dwarf + w.mountains) * smoothstep(5, 3, h) * 0.45;
      density *= smoothstep(SEA_LEVEL + 0.08, SEA_LEVEL + 0.25, h) * smoothstep(6.0, 5.2, h) * Math.max(0, 1 - w.arcane * 1.5) * clear;
      const reeds = smoothstep(SEA_LEVEL + 0.55, SEA_LEVEL + 0.2, h) * smoothstep(SEA_LEVEL + 0.02, SEA_LEVEL + 0.1, h) * Math.max(0, 1 - w.desert * 2 - w.arcane * 2);
      flora[i * 3] = Math.max(0, Math.min(1, density + reeds * 0.7 * clear));
      flora[i * 3 + 1] = Math.min(1, w.orc + w.desert + (w.dwarf + w.mountains) * 0.4 + (kind?.dry ?? 0) * w.human);
      const flowers = (kind?.flowers ?? 0) * w.human + w.elf * 0.3 + smoothstep(0.55, 0.7, fbm(x * 0.09 + 50, z * 0.09, 2)) * (w.human + w.elf) * 0.5;
      flora[i * 3 + 2] = Math.min(1, flowers) - reeds;
    }
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("aSurf", new THREE.BufferAttribute(surf, 4));
    geom.setAttribute("aSurf2", new THREE.BufferAttribute(surf2, 4));
    geom.userData.flora = flora;
    geom.computeVertexNormals();
    return geom;
  };

  return { height, weights, geometry };
}
