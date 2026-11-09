import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CivilizationType } from "@/types";
import { Shape, Surface, getShapeGeometry } from "@/components/3d/city/parts";
import { CASTLE_HD_PARTS } from "./castleHd";

/**
 * World-map castle models as plain data, one list of parts per civilization.
 * `WorldCastles` draws every castle on the map from these lists: per civ, parts sharing opacity,
 * sidedness, shadow flags and animation are merged into one geometry and drawn as one InstancedMesh.
 *
 * Each part can specify minStage and maxStage (0..4) corresponding to the inside-kingdom
 * castle stages: Keep (0), Castle (1), Citadel (2), Palace (3), Wonder (4).
 * The Archon's Empyrean (stage 5) is a model of its own (`EMPYREAN_PARTS`), not a civilization's stage.
 *
 * HD (the model kit, `castleHd.ts`): the same parts drawn through HD twins of their geometry (bevelled boxes, rounder
 * towers and domes), each with the material it is made of (`surf`), dressed-stone courses or roof tiles (`courses`),
 * plus HD-only detail parts built with the Builder kit (`hd: true`); `hd: false` parts are Normal only.
 */

export type CastleAnim =
  | { kind: "bob"; baseY: number } // floating crystal: bobs around baseY and spins
  | { kind: "orbit"; pivot: [number, number, number] } // shards circling a pivot
  | { kind: "windmill"; pivot: [number, number, number] } // sails turning about Z
  | { kind: "float"; baseY: number } // a floating citadel: slow bob, no spin
  | { kind: "spin"; pivot: [number, number, number]; speed: number }; // a halo turning about Y

export interface CastleMaterial {
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number; // < 1 makes it transparent
  doubleSide?: boolean;
}

export interface CastlePart {
  geo: string; // key into the geometry cache, e.g. "cyl:0.26,0.32,1.3,6"
  color: string;
  hoverColor?: string; // foundation lights up while the castle is hovered
  pos: [number, number, number]; // relative to the castle, or to the anim pivot
  rot?: [number, number, number];
  scale?: number;
  mat?: CastleMaterial;
  shadow?: boolean;
  receive?: boolean;
  anim?: CastleAnim;
  minStage?: number; // 0..5 (default 0: visible from Stage 0 Keep)
  maxStage?: number; // 0..5 (default 5: visible through every stage)
  /** HD: the last stage it shows in HD, when a higher stage's HD version replaces it (Normal keeps `maxStage`) */
  hdMaxStage?: number;
  /** HD model kit: what it is made of (its surface, roughness and metalness in HD; Normal keeps `mat`) */
  surf?: Surface;
  /** HD: dressed-stone courses on its upright faces, or rows of overlapping tiles on a roof */
  courses?: "masonry" | "tiles";
  /** HD model kit: true, drawn only in HD; false, drawn only in Normal (a part its HD version replaces) */
  hd?: boolean;
  /** HD: a kit shape (`geo` "kit:<shape>") is 1×1×1, sized by this and turned by `quat` instead of `rot` */
  size?: [number, number, number];
  quat?: [number, number, number, number];
  /**
   * HD: cloth rippling away from its pole (`at`, `n` the cloth's facing), a smoke puff rising from `at`, a part turning
   * round the upright axis through `at` (`speed` radians a second, bobbing `bob` up and down) or a glow pulsing
   */
  wave?: { kind: "flutter" | "smoke" | "turn" | "pulse"; at: [number, number, number]; n?: [number, number, number]; phase?: number; speed?: number; bob?: number };
}

/* ---------------------------- Shared geometry ---------------------------- */

const geoCache = new Map<string, THREE.BufferGeometry>();

/** A cylinder (or cone, top radius 0) with its rims chamfered, centred like THREE's: the HD twin of a castle tower */
export function chamferedCylinder(top: number, bottom: number, h: number, n: number): THREE.BufferGeometry {
  const c = Math.min(0.04, h * 0.15, Math.max(top, bottom) * 0.2);
  const pts = [
    [0, -h / 2],
    [bottom - c, -h / 2],
    [bottom, -h / 2 + c],
    ...(top > 0 ? [[top, h / 2 - c], [top - c, h / 2], [0, h / 2]] : [[0, h / 2]])
  ].map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y));
  return new THREE.LatheGeometry(pts, n);
}

/**
 * Geometry for a key like "cone:1.3,0.8,4"; created once and shared by every castle. `hd`: its HD twin (bevelled box,
 * chamfered round towers with more segments, rounder domes); faceted towers and four-sided roofs keep their facets.
 * "kit:<shape>,<twin>" is a model-kit shape (1×1×1, `getShapeGeometry`): twin 0 its HD twin, 1 the lighter one, 2 and 3 the
 * Normal shape (faceted, smooth).
 */
export function castleGeometry(key: string, hd = false): THREE.BufferGeometry {
  const cacheKey = hd ? `${key}|hd` : key;
  let g = geoCache.get(cacheKey);
  if (g) return g;
  const [kind, argStr] = key.split(":");
  if (kind === "kit") {
    const [shape, lo] = argStr.split(",");
    // "2" and "3": the Normal shape (a faceted puff of smoke; a small box or block, a tiny post, cone or ball)
    g = lo === "2" || lo === "3" ? getShapeGeometry(shape === "block" ? "box" : (shape as Shape)) : getShapeGeometry(shape as Shape, true, lo === "1");
    geoCache.set(cacheKey, g);
    return g;
  }
  const a = argStr.split(",").map(Number);
  if (hd) {
    g = hdTwin(kind, a) ?? castleGeometry(key);
    geoCache.set(cacheKey, g);
    return g;
  }
  switch (kind) {
    case "box":
      g = new THREE.BoxGeometry(a[0], a[1], a[2]);
      break;
    case "cyl":
      g = new THREE.CylinderGeometry(a[0], a[1], a[2], a[3]);
      break;
    case "cone":
      g = new THREE.ConeGeometry(a[0], a[1], a[2]);
      break;
    case "sphere":
      g = new THREE.SphereGeometry(a[0], a[1], a[2]);
      break;
    case "octa":
      g = new THREE.OctahedronGeometry(a[0], 0);
      break;
    case "ring":
      g = new THREE.RingGeometry(a[0], a[1], a[2]);
      break;
    case "torus":
      g = new THREE.TorusGeometry(a[0], a[1], a[2], a[3]);
      break;
    case "circle":
      g = new THREE.CircleGeometry(a[0], a[1]);
      break;
    case "plane":
      g = new THREE.PlaneGeometry(a[0], a[1]);
      break;
    default:
      throw new Error(`Unknown castle geometry ${key}`);
  }
  geoCache.set(key, g);
  return g;
}

/** The HD twin of a castle geometry (undefined: the same in both) */
function hdTwin(kind: string, a: number[]): THREE.BufferGeometry | undefined {
  switch (kind) {
    case "box":
      return new RoundedBoxGeometry(a[0], a[1], a[2], 1, Math.min(0.05, Math.min(a[0], a[1], a[2]) * 0.22));
    case "cyl":
      return chamferedCylinder(a[0], a[1], a[2], a[3] >= 8 ? Math.min(32, a[3] * 3) : a[3]);
    case "cone":
      return a[2] >= 7 ? chamferedCylinder(0, a[0], a[1], Math.min(32, a[2] * 3)) : undefined;
    case "sphere":
      return new THREE.SphereGeometry(a[0], Math.max(18, a[1] * 2), Math.max(12, a[2] * 2));
    case "ring":
      return new THREE.RingGeometry(a[0], a[1], Math.max(48, a[2] * 2));
    case "torus":
      return new THREE.TorusGeometry(a[0], a[1], a[2] * 2, a[3] * 2);
    case "circle":
      return new THREE.CircleGeometry(a[0], Math.max(48, a[1] * 2));
    default:
      return undefined;
  }
}

/* ------------------------------ Castle models ---------------------------- */

const FRONT_CORNERS: Array<[number, number]> = [
  [-1.2, 1.2],
  [1.2, 1.2]
];

const BACK_CORNERS: Array<[number, number]> = [
  [-1.2, -1.2],
  [1.2, -1.2]
];

const ORC: CastlePart[] = [
  // Heavy spiked stone foundation, keep and horned roof (Stage 0+)
  { geo: "box:2.8,0.6,2.8", color: "#1e293b", hoverColor: "#475569", pos: [0, 0.45, 0], mat: { roughness: 0.9 }, shadow: true, receive: true, minStage: 0, surf: "plain", courses: "masonry" },
  { geo: "box:1.7,1.2,1.7", color: "#334155", pos: [0, 1.25, 0], mat: { roughness: 0.8 }, shadow: true, receive: true, minStage: 0, surf: "plain", courses: "masonry" },
  { geo: "cone:1.3,0.8,4", color: "#7f1d1d", pos: [0, 2.0, 0], mat: { roughness: 0.7 }, shadow: true, minStage: 0, hd: false },
  // War tent and spiked barrier (Stage 0+)
  { geo: "cone:0.5,0.8,5", color: "#78350f", pos: [-1.7, 0.4, -0.5], shadow: true, minStage: 0, surf: "hide" },
  { geo: "box:1.2,0.4,0.15", color: "#451a03", pos: [1.7, 0.3, 0.2], rot: [0, 0.4, 0], minStage: 0, surf: "wood" },
  // Front corner palisade watchtowers (Stage 0+)
  ...FRONT_CORNERS.flatMap(([x, z]): CastlePart[] => [
    { geo: "cyl:0.26,0.32,1.3,6", color: "#475569", pos: [x, 0.7, z], shadow: true, minStage: 0, surf: "plain", courses: "masonry" },
    { geo: "cone:0.2,0.6,4", color: "#991b1b", pos: [x, 1.6, z], shadow: true, minStage: 0, surf: "hide" }
  ]),
  // Back corner palisade watchtowers (Stage 1+ Castle)
  ...BACK_CORNERS.flatMap(([x, z]): CastlePart[] => [
    { geo: "cyl:0.26,0.32,1.3,6", color: "#475569", pos: [x, 0.7, z], shadow: true, minStage: 1, surf: "plain", courses: "masonry" },
    { geo: "cone:0.2,0.6,4", color: "#991b1b", pos: [x, 1.6, z], shadow: true, minStage: 1, surf: "hide" }
  ]),
  // Fire braziers (Stage 2+ Citadel)
  ...[-0.8, 0.8].flatMap((x): CastlePart[] => [
    { geo: "cyl:0.16,0.1,0.3,6", color: "#0f172a", pos: [x, 0.5, 1.5], minStage: 2, surf: "iron" },
    { geo: "sphere:0.14,6,6", color: "#ea580c", pos: [x, 0.75, 1.5], mat: { emissive: "#f97316", emissiveIntensity: 2.5 }, minStage: 2, hd: false }
  ]),
  // Rare: a skull totem turning on the roof (Stage 2+ Citadel)
  { geo: "sphere:0.16,6,6", color: "#f3ead7", pos: [0, 0, 0], anim: { kind: "spin", pivot: [0, 2.55, 0], speed: 0.8 }, minStage: 2, hd: false },
  // Spiked battlements on upper roof (Stage 3+ Palace)
  { geo: "box:1.9,0.3,1.9", color: "#1c1917", pos: [0, 1.88, 0], mat: { roughness: 0.9 }, shadow: true, minStage: 3, surf: "plain", courses: "masonry" },
  // Epic: a crow circling the war hall (Stage 3+ Palace)
  { geo: "box:0.3,0.05,0.14", color: "#1c1917", pos: [1.4, 0, 0], anim: { kind: "orbit", pivot: [0, 2.9, 0] }, minStage: 3, hd: false },
  // Giant mammoth tusks framing the entrance (Stage 4 Wonder signature)
  { geo: "cone:0.15,1.5,6", color: "#fef08a", pos: [-0.8, 0.8, 1.4], rot: [0.2, 0, 0.3], mat: { roughness: 0.5 }, shadow: true, minStage: 4 },
  { geo: "cone:0.15,1.5,6", color: "#fef08a", pos: [0.8, 0.8, 1.4], rot: [0.2, 0, -0.3], mat: { roughness: 0.5 }, shadow: true, minStage: 4 }
];

const ELF: CastlePart[] = [
  // Silverwood trunk and leaf canopies (Stage 0+)
  { geo: "cyl:1.3,1.6,0.8,8", color: "#78716c", pos: [0, 0.55, 0], mat: { roughness: 0.7 }, shadow: true, receive: true, minStage: 0, surf: "hide" },
  { geo: "cone:1.6,0.8,7", color: "#059669", pos: [0, 1.6, 0], mat: { roughness: 0.4 }, shadow: true, minStage: 0, surf: "leaf" },
  // Flowering tree (Stage 0+)
  { geo: "cyl:0.08,0.12,0.8,6", color: "#78350f", pos: [1.6, 0.6, -0.9], minStage: 0, surf: "wood" },
  { geo: "sphere:0.45,8,8", color: "#f472b6", pos: [1.6, 1.1, -0.9], shadow: true, minStage: 0, hd: false },
  // Spire trunk and upper canopy (Stage 1+ Castle)
  { geo: "cyl:0.65,1.1,1.4,8", color: "#a8a29e", pos: [0, 1.5, 0], mat: { roughness: 0.6 }, shadow: true, receive: true, minStage: 1, surf: "hide" },
  { geo: "cone:1.1,0.7,6", color: "#10b981", pos: [0, 2.6, 0], mat: { roughness: 0.4 }, shadow: true, minStage: 1, surf: "leaf" },
  // Moonwell with glowing water (Stage 1+ Castle)
  { geo: "cyl:0.55,0.6,0.15,12", color: "#cbd5e1", pos: [-1.7, 0.25, 0.8], minStage: 1, surf: "plain" },
  { geo: "circle:0.4,12", color: "#38bdf8", pos: [-1.7, 0.33, 0.8], rot: [-Math.PI / 2, 0, 0], mat: { emissive: "#0ea5e9", emissiveIntensity: 1.2, doubleSide: true }, minStage: 1 },
  // Three surrounding silver spires (Stage 2+ Citadel)
  ...[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].flatMap((a): CastlePart[] => {
    const x = Math.cos(a) * 1.35;
    const z = Math.sin(a) * 1.35;
    return [
      { geo: "cyl:0.18,0.25,1.2,6", color: "#cbd5e1", pos: [x, 0.7, z], shadow: true, minStage: 2, surf: "plain", courses: "masonry" },
      { geo: "cone:0.35,0.6,6", color: "#06b6d4", pos: [x, 1.5, z], shadow: true, minStage: 2, surf: "gem", hdMaxStage: 3 }
    ];
  }),
  // Rare: a moonstone circling the spire's tip (Stage 2+ Citadel)
  { geo: "octa:0.14", color: "#a5f3fc", pos: [0.35, 0, 0], mat: { emissive: "#22d3ee", emissiveIntensity: 1.8 }, anim: { kind: "spin", pivot: [0, 3.2, 0], speed: 1.0 }, minStage: 2, surf: "gem" },
  // Epic: a wisp orbiting the canopy (Stage 3+ Palace)
  { geo: "octa:0.12", color: "#e0f2fe", pos: [1.6, 0, 0], mat: { emissive: "#67e8f9", emissiveIntensity: 2.0 }, anim: { kind: "orbit", pivot: [0, 2.2, 0] }, minStage: 3 },
  // Sylvan canopy rings (Stage 3+ Palace)
  { geo: "ring:1.4,1.8,16", color: "#a7f3d0", pos: [0, 2.4, 0], rot: [-Math.PI / 2, 0, 0], mat: { emissive: "#22d3ee", emissiveIntensity: 1.2, doubleSide: true }, minStage: 3, hdMaxStage: 3 },
  // Floating mana crystal above the spire (Stage 4 Wonder signature)
  { geo: "octa:0.4", color: "#38bdf8", pos: [0, 0, 0], mat: { emissive: "#06b6d4", emissiveIntensity: 2.2 }, anim: { kind: "bob", baseY: 2.8 }, minStage: 4, hd: false }
];

const DWARF: CastlePart[] = [
  // Basalt foundation, bastion core and reinforced roof (Stage 0+)
  { geo: "box:3,0.5,3", color: "#1e293b", pos: [0, 0.4, 0], mat: { roughness: 0.9 }, shadow: true, receive: true, minStage: 0, surf: "plain", courses: "masonry" },
  { geo: "box:1.9,1.1,1.9", color: "#334155", pos: [0, 1.1, 0], mat: { roughness: 0.8 }, shadow: true, receive: true, minStage: 0, surf: "plain", courses: "masonry" },
  { geo: "cone:1.5,0.7,4", color: "#b45309", pos: [0, 1.9, 0], mat: { roughness: 0.5, metalness: 0.4 }, shadow: true, minStage: 0, hd: false },
  // Ore cart and raw gold ore (Stage 0+)
  { geo: "box:0.5,0.3,0.35", color: "#78350f", pos: [-1.7, 0.3, 0.5], shadow: true, minStage: 0, surf: "wood" },
  { geo: "sphere:0.18,5,5", color: "#f59e0b", pos: [-1.7, 0.48, 0.5], mat: { metalness: 0.9 }, minStage: 0, hd: false },
  // Twin forge chimneys with smoke puffs (Stage 1+ Castle)
  ...[-0.6, 0.6].flatMap((x): CastlePart[] => [
    { geo: "cyl:0.14,0.18,0.8,8", color: "#0f172a", pos: [x, 1.7, -0.6], mat: { metalness: 0.7 }, shadow: true, minStage: 1, surf: "iron" },
    { geo: "sphere:0.16,6,6", color: "#64748b", pos: [x, 2.2, -0.6], mat: { opacity: 0.6 }, minStage: 1, hd: false }
  ]),
  // Molten lava sluice (Stage 2+ Citadel)
  { geo: "plane:1.6,0.25", color: "#ea580c", pos: [0, 0.16, 1.8], rot: [-Math.PI / 2, 0, 0], mat: { emissive: "#f97316", emissiveIntensity: 2.0 }, minStage: 2, hd: false },
  // Rare: a brass gear turning on the bastion's face (Stage 2+ Citadel)
  { geo: "box:0.55,0.1,0.05", color: "#b08d57", pos: [0, 0, 0], mat: { metalness: 0.8, roughness: 0.3 }, anim: { kind: "windmill", pivot: [0.55, 1.15, 0.98] }, minStage: 2, surf: "gold" },
  // Epic: an ember orbiting the forge (Stage 3+ Palace)
  { geo: "octa:0.1", color: "#fb923c", pos: [1.5, 0, 0], mat: { emissive: "#f97316", emissiveIntensity: 2.2 }, anim: { kind: "orbit", pivot: [0, 2.3, 0] }, minStage: 3 },
  // Fortress battlements (Stage 3+ Palace)
  { geo: "box:2.4,0.4,2.4", color: "#475569", pos: [0, 1.6, 0], mat: { roughness: 0.8, metalness: 0.3 }, shadow: true, minStage: 3, surf: "plain", courses: "masonry" },
  // Masterwork anvil monument and hammer (Stage 4 Wonder signature)
  { geo: "box:0.6,0.3,0.5", color: "#64748b", pos: [0, 1.005, 1.2], scale: 0.7, mat: { metalness: 0.8 }, shadow: true, minStage: 4, hd: false },
  { geo: "box:0.9,0.2,0.4", color: "#94a3b8", pos: [0, 1.145, 1.2], scale: 0.7, mat: { metalness: 0.9, roughness: 0.2 }, shadow: true, minStage: 4, hd: false }
];

const ARCANE_SHARDS: Array<[string, string]> = [
  ["#38bdf8", "#0284c7"],
  ["#f43f5e", "#e11d48"],
  ["#a855f7", "#9333ea"]
];

const ARCANE: CastlePart[] = [
  // Obsidian foundation and beacon pedestal (Stage 0+)
  { geo: "cyl:1.5,1.7,0.5,8", color: "#3b0764", pos: [0, 0.35, 0], mat: { roughness: 0.6 }, shadow: true, receive: true, minStage: 0, surf: "gem" },
  { geo: "cyl:0.5,0.7,0.5,8", color: "#581c87", pos: [0, 0.8, 0], mat: { metalness: 0.5 }, shadow: true, minStage: 0, surf: "gem" },
  // Rune ring (Stage 1+ Castle)
  { geo: "ring:0.8,1.4,16", color: "#c084fc", pos: [0, 0.61, 0], rot: [-Math.PI / 2, 0, 0], mat: { emissive: "#a855f7", emissiveIntensity: 1.8, doubleSide: true }, minStage: 1 },
  // Light column beam (Stage 2+ Citadel)
  { geo: "cyl:0.2,0.2,1.3,8", color: "#38bdf8", pos: [0, 1.6, 0], mat: { emissive: "#0284c7", emissiveIntensity: 1.5, opacity: 0.4 }, minStage: 2 },
  // Rare: a crystal circling the light column (Stage 2+ Citadel)
  { geo: "octa:0.14", color: "#e879f9", pos: [0.45, 0, 0], mat: { emissive: "#c026d3", emissiveIntensity: 1.8 }, anim: { kind: "spin", pivot: [0, 1.6, 0], speed: 1.5 }, minStage: 2, surf: "gem" },
  // Epic: a shard orbiting the hovering citadel (Stage 3+ Palace)
  { geo: "octa:0.16", color: "#c084fc", pos: [1.8, 0, 0], mat: { emissive: "#9333ea", emissiveIntensity: 2.0 }, anim: { kind: "orbit", pivot: [0, 2.4, 0] }, minStage: 3 },
  // Hovering upper citadel with crystal crown (Stage 3+ Palace)
  { geo: "octa:0.9", color: "#6b21a8", pos: [0, 0, 0], mat: { roughness: 0.3, metalness: 0.5 }, anim: { kind: "bob", baseY: 2.4 }, minStage: 3, surf: "gem" },
  { geo: "cone:0.3,0.7,6", color: "#38bdf8", pos: [0, 0.9, 0], mat: { emissive: "#0ea5e9", emissiveIntensity: 1.6 }, anim: { kind: "bob", baseY: 2.4 }, minStage: 3 },
  // Crystal obelisks (Stage 3+ Palace)
  ...[-1.6, 1.6].map(
    (x): CastlePart => ({ geo: "octa:0.25", color: "#c084fc", pos: [x, 0.8, -0.6], mat: { emissive: "#9333ea", emissiveIntensity: 1.5 }, shadow: true, minStage: 3 })
  ),
  // Orbiting mana shards (Stage 4 Wonder signature - active for special users at Lv25)
  ...ARCANE_SHARDS.map(([color, emissive], i): CastlePart => {
    const a = (i / 3) * Math.PI * 2;
    return {
      geo: "octa:0.2",
      color,
      pos: [Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5],
      mat: { emissive, emissiveIntensity: 2.0 },
      anim: { kind: "orbit", pivot: [0, 2.5, 0] },
      minStage: 4
    };
  })
];

const SAILS: CastleAnim = { kind: "windmill", pivot: [-1.7, 1.0, 1.5] };

const HUMAN: CastlePart[] = [
  // Dressed stone foundation, keep and slate roof (Stage 0+)
  { geo: "box:2.8,0.5,2.8", color: "#64748b", hoverColor: "#e2e8f0", pos: [0, 0.45, 0], mat: { roughness: 0.7 }, shadow: true, receive: true, minStage: 0, surf: "plain", courses: "masonry" },
  { geo: "box:1.7,1.2,1.7", color: "#f8fafc", pos: [0, 1.15, 0], shadow: true, receive: true, minStage: 0, surf: "plain", courses: "masonry" },
  { geo: "cone:1.4,0.9,4", color: "#1d4ed8", pos: [0, 2.05, 0], mat: { roughness: 0.4 }, shadow: true, minStage: 0, hd: false },
  // Timber-framed cottage (Stage 0+)
  { geo: "box:0.6,0.4,0.5", color: "#fef3c7", pos: [1.6, 0.4, 1.2], shadow: true, minStage: 0, surf: "plain" },
  { geo: "cone:0.45,0.3,4", color: "#78350f", pos: [1.6, 0.65, 1.2], shadow: true, minStage: 0, hd: false },
  // Front 2 corner watchtowers (Stage 0+)
  ...FRONT_CORNERS.flatMap(([x, z]): CastlePart[] => [
    { geo: "cyl:0.28,0.32,1.2,8", color: "#cbd5e1", pos: [x, 0.7, z], shadow: true, minStage: 0, surf: "plain", courses: "masonry" },
    { geo: "cone:0.4,0.5,8", color: "#2563eb", pos: [x, 1.5, z], shadow: true, minStage: 0, surf: "plain", courses: "tiles", hdMaxStage: 3 }
  ]),
  // Back 2 corner watchtowers (Stage 1+ Castle)
  ...BACK_CORNERS.flatMap(([x, z]): CastlePart[] => [
    { geo: "cyl:0.28,0.32,1.2,8", color: "#cbd5e1", pos: [x, 0.7, z], shadow: true, minStage: 1, surf: "plain", courses: "masonry" },
    { geo: "cone:0.4,0.5,8", color: "#2563eb", pos: [x, 1.5, z], shadow: true, minStage: 1, surf: "plain", courses: "tiles", hdMaxStage: 3 }
  ]),
  // Royal flag (Stage 1+ Castle)
  { geo: "cyl:0.03,0.03,2,8", color: "#e2e8f0", pos: [1.1, 2.2, -1.1], mat: { metalness: 0.8 }, minStage: 1, surf: "iron" },
  { geo: "box:0.9,0.5,0.04", color: "#1d4ed8", pos: [1.6, 2.8, -1.1], mat: { roughness: 0.3 }, minStage: 1, hd: false },
  // Bell tower with golden weather vane (Stage 2+ Citadel)
  { geo: "cyl:0.2,0.25,1,8", color: "#e2e8f0", pos: [0.4, 2.1, 0.4], shadow: true, minStage: 2, surf: "plain", courses: "masonry" },
  { geo: "cone:0.3,0.5,8", color: "#1e40af", pos: [0.4, 2.8, 0.4], shadow: true, minStage: 2, surf: "plain", courses: "tiles" },
  { geo: "octa:0.1", color: "#fbbf24", pos: [0.4, 3.15, 0.4], mat: { metalness: 0.9 }, minStage: 2, surf: "gold" },
  // Rare: the keep's windows lit and the bell tower's gold vane turning (Stage 2+ Citadel)
  { geo: "box:0.9,0.28,0.06", color: "#fde68a", pos: [0, 1.25, 0.88], mat: { emissive: "#fbbf24", emissiveIntensity: 1.4 }, minStage: 2, hd: false },
  { geo: "box:0.4,0.04,0.06", color: "#fbbf24", pos: [0, 0, 0], mat: { metalness: 0.9, roughness: 0.2 }, anim: { kind: "spin", pivot: [0.4, 3.3, 0.4], speed: 1.2 }, minStage: 2, surf: "gold" },
  // Windmill with turning sails (Stage 3+ Palace)
  { geo: "cyl:0.25,0.35,0.9,8", color: "#e2e8f0", pos: [-1.7, 0.65, 1.2], shadow: true, minStage: 3, surf: "plain" },
  { geo: "cone:0.32,0.4,8", color: "#78350f", pos: [-1.7, 1.2, 1.2], minStage: 3, surf: "wood", courses: "tiles" },
  { geo: "box:1.2,0.08,0.02", color: "#f8fafc", pos: [0, 0, 0], anim: SAILS, minStage: 3, hd: false },
  { geo: "box:0.08,1.2,0.02", color: "#f8fafc", pos: [0, 0, 0], anim: SAILS, minStage: 3, hd: false },
  // Epic: a tall palace spire rising through the roof, doves circling it (Stage 3+ Palace)
  { geo: "cyl:0.3,0.38,1.7,8", color: "#f8fafc", pos: [0, 2.95, 0], shadow: true, minStage: 3, surf: "plain", courses: "masonry" },
  { geo: "cone:0.45,0.8,8", color: "#1d4ed8", pos: [0, 4.2, 0], shadow: true, minStage: 3, surf: "plain", courses: "tiles" },
  ...[0, Math.PI].map((a): CastlePart => ({ geo: "box:0.3,0.05,0.14", color: "#f8fafc", pos: [Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3], anim: { kind: "orbit", pivot: [0, 3.9, 0] }, minStage: 3, hd: false })),
  // Golden Wonder Spire Crest (Stage 4 Wonder signature)
  { geo: "octa:0.3", color: "#fbbf24", pos: [0, 4.85, 0], mat: { metalness: 0.95, roughness: 0.2, emissive: "#f59e0b", emissiveIntensity: 0.8 }, shadow: true, minStage: 4 }
];

/* ------------------------- The Archon's Empyrean ------------------------- */

const CRIMSON = "#b91c1c";
const DEEP_CRIMSON = "#7f1d1d";
const MARBLE = "#f5f5f4";
const GILT = "#fbbf24";
/** Everything on the floating citadel bobs together */
const FLOAT: CastleAnim = { kind: "float", baseY: 3.0 };
const HALO: CastleAnim = { kind: "spin", pivot: [0, 6.1, 0], speed: 0.45 };
const SPIRE_ANGLES = [0, 1, 2, 3].map((i) => (i / 4) * Math.PI * 2 + Math.PI / 4);

/**
 * Empyrean (castle Lv26–30, the Archon of the Realm only): a floating citadel over a broken rock base,
 * crimson-gold spires and banners, a slowly turning halo and three shards orbiting it. The light beam,
 * pulsing aura and sparks come from the legendary effect drawn with it on the map.
 */
export const EMPYREAN_PARTS: CastlePart[] = [
  // Broken rock base with jagged stones round it and a crimson sigil burnt into the ground
  { geo: "cyl:1.3,1.9,0.9,7", color: "#292524", hoverColor: "#57534e", pos: [0, 0.45, 0], mat: { roughness: 0.95 }, shadow: true, receive: true },
  ...[0, 1, 2, 3, 4].map((i): CastlePart => {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    return { geo: "cone:0.42,1.4,5", color: i % 2 ? "#1c1917" : "#44403c", pos: [Math.cos(a) * 1.75, 0.55, Math.sin(a) * 1.75], rot: [Math.sin(a) * 0.35, a, -Math.cos(a) * 0.35], mat: { roughness: 0.95 }, shadow: true };
  }),
  { geo: "ring:2.25,2.6,32", color: "#dc2626", pos: [0, 0.12, 0], rot: [-Math.PI / 2, 0, 0], mat: { emissive: "#dc2626", emissiveIntensity: 1.8, doubleSide: true } },
  // Molten vent on the rock where the citadel's beam lands
  { geo: "cyl:0.5,0.5,0.1,12", color: "#f97316", pos: [0, 0.95, 0], mat: { emissive: "#ea580c", emissiveIntensity: 2.2 } },

  // The floating citadel: an inverted rock spur under a marble platform ringed in gold
  { geo: "cone:1.3,1.8,6", color: "#3f3f46", pos: [0, -0.9, 0], rot: [Math.PI, 0, 0], mat: { roughness: 0.9 }, anim: FLOAT },
  { geo: "cyl:1.5,1.4,0.35,8", color: MARBLE, pos: [0, 0.17, 0], mat: { roughness: 0.5 }, anim: FLOAT },
  { geo: "cyl:1.56,1.56,0.1,8", color: GILT, pos: [0, 0.38, 0], mat: { metalness: 0.9, roughness: 0.25, emissive: "#f59e0b", emissiveIntensity: 0.4 }, anim: FLOAT },
  // Keep with a gold band, crowned by the great crimson spire and a gold star
  { geo: "cyl:0.7,0.8,1.4,8", color: "#fafaf9", pos: [0, 1.05, 0], mat: { roughness: 0.5 }, anim: FLOAT },
  { geo: "cyl:0.86,0.86,0.12,8", color: GILT, pos: [0, 0.95, 0], mat: { metalness: 0.9, roughness: 0.25 }, anim: FLOAT },
  { geo: "cone:0.55,1.8,8", color: CRIMSON, pos: [0, 2.65, 0], mat: { roughness: 0.35, metalness: 0.3 }, anim: FLOAT },
  { geo: "octa:0.22", color: GILT, pos: [0, 3.75, 0], mat: { metalness: 0.9, roughness: 0.2, emissive: "#fbbf24", emissiveIntensity: 1.6 }, anim: FLOAT },
  // Four crimson-roofed spires, each flying a red banner
  ...SPIRE_ANGLES.flatMap((a): CastlePart[] => {
    const x = Math.cos(a) * 1.05;
    const z = Math.sin(a) * 1.05;
    return [
      { geo: "cyl:0.2,0.24,1.5,6", color: MARBLE, pos: [x, 1.1, z], anim: FLOAT },
      { geo: "cone:0.3,0.9,6", color: DEEP_CRIMSON, pos: [x, 2.3, z], anim: FLOAT },
      { geo: "octa:0.1", color: GILT, pos: [x, 2.82, z], mat: { metalness: 0.9, roughness: 0.2 }, anim: FLOAT },
      { geo: "box:0.04,0.62,0.34", color: "#dc2626", pos: [Math.cos(a) * 1.38, 1.25, Math.sin(a) * 1.38], rot: [0, -a, 0], anim: FLOAT }
    ];
  }),

  // Halo ring turning slowly above the crown
  { geo: "torus:1.25,0.07,8,40", color: "#fde68a", pos: [0, 0, 0], rot: [Math.PI / 2 - 0.22, 0, 0], mat: { emissive: "#f59e0b", emissiveIntensity: 2.2 }, anim: HALO },
  // Three shards orbiting the citadel
  ...[0, 1, 2].map((i): CastlePart => {
    const a = (i / 3) * Math.PI * 2;
    return {
      geo: "octa:0.28",
      color: i === 1 ? GILT : "#ef4444",
      pos: [Math.cos(a) * 2.3, (i - 1) * 0.35, Math.sin(a) * 2.3],
      mat: { emissive: i === 1 ? "#f59e0b" : "#dc2626", emissiveIntensity: 2.0 },
      anim: { kind: "orbit", pivot: [0, 4.2, 0] }
    };
  })
];

/** Every civilization's castle: its parts, then its HD-only detail (`castleHd.ts`) */
export const CASTLE_PARTS: Record<CivilizationType, CastlePart[]> = {
  human: [...HUMAN, ...CASTLE_HD_PARTS.human],
  elf: [...ELF, ...CASTLE_HD_PARTS.elf],
  dwarf: [...DWARF, ...CASTLE_HD_PARTS.dwarf],
  orc: [...ORC, ...CASTLE_HD_PARTS.orc],
  arcane: [...ARCANE, ...CASTLE_HD_PARTS.arcane]
};
