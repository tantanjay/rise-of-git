import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mulberry32 } from "@/utils/random";

/*
 * Crafted shapes for the instanced part kit (`Shape` in parts.ts): a tapered trunk with a root flare, a layered conifer,
 * a lumpy leaf crown, a weathered boulder, a bevelled stone block and a stone arch. Each is one shared geometry (seeded,
 * so the same every load), drawn instanced like the plain primitives; parts.ts normalises it to a 1×1×1 box.
 */

/** A tree trunk: wide root flare at the ground, tapering up, closed at both ends */
export function trunkGeometry(): THREE.BufferGeometry {
  const profile = [
    [0, 0],
    [1, 0],
    [0.8, 0.04],
    [0.66, 0.14],
    [0.58, 0.42],
    [0.5, 1],
    [0, 1]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(profile, 7);
}

/** A conifer's crown: four drooping tiers, each skirt's edge ragged with boughs (the same all round the seam) */
export function pineGeometry(): THREE.BufferGeometry {
  const profile = [
    [0, 0.08],
    [1, 0],
    [0.42, 0.2],
    [0.82, 0.24],
    [0.34, 0.43],
    [0.64, 0.47],
    [0.24, 0.65],
    [0.44, 0.69],
    [0.12, 0.86],
    [0, 1]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(profile, 14);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Only the skirts' rims (the profile's odd points: each tier's reach) carry boughs; lathe vertices run profile-first
    if ((i % profile.length) % 2 === 0 || i % profile.length > 7) continue;
    const a = Math.atan2(z, x);
    // Boughs reach out on every other segment and droop between them
    const bough = Math.cos(a * 7 + y * 11);
    const k = 1 + 0.16 * bough + 0.05 * Math.sin(a * 3 - y * 5);
    pos.setXYZ(i, x * k, y - 0.06 * Math.max(0, bough) - 0.02, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A sphere with seeded bumps pushed out (and dents pressed in), its underside flattened */
function lumpy(seed: number, detail: number, bumps: number, strength: number, floor: number, squash: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  const rng = mulberry32(seed);
  const dirs = Array.from({ length: bumps }, () => {
    const v = new THREE.Vector3(rng() * 2 - 1, rng() * 1.6 - 0.5, rng() * 2 - 1).normalize();
    return { v, s: (rng() * 0.8 + 0.4) * strength * (rng() < 0.25 ? -0.6 : 1) };
  });
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).normalize();
    let r = 1;
    for (const d of dirs) r += d.s * Math.pow(Math.max(0, p.dot(d.v)), 3);
    p.multiplyScalar(r);
    if (p.y < floor) p.y = floor + (p.y - floor) * squash;
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A leafy crown: billowing clumps, flatter underneath */
export const canopyGeometry = () => lumpy(71, 1, 7, 0.35, -0.35, 0.35);

/** A weathered boulder: knobbly, faceted, sitting flat on its base */
export const boulderGeometry = () => lumpy(29, 1, 9, 0.4, -0.3, 0.15);

/** A dressed stone block with bevelled edges */
export const blockGeometry = (): THREE.BufferGeometry => new RoundedBoxGeometry(1, 1, 1, 1, 0.07);

/** A stone arch: a block with a round-headed opening from its base, the span along x, the thickness along z */
export function archGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = 12;
  s.moveTo(-0.5, 0);
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    s.lineTo(Math.cos(a) * 0.38, Math.sin(a) * 0.66);
  }
  s.lineTo(0.5, 0);
  s.lineTo(0.5, 1);
  s.lineTo(-0.5, 1);
  s.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 1 });
  return g;
}

/*
 * The HD model kit's shapes. `hdTwinGeometry` gives a plain primitive its HD twin (bevelled, rounded, more segments),
 * drawn instead of it when a model renders in HD; the organic shapes below are for HD versions (`hdShape`) and new
 * models. All are shared geometries, so a new kind costs one draw where it is used, never one per model.
 */

/** A lathe from (radius, height) points, closed and smooth */
const lathe = (points: number[][], segments: number) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);

/** A cylinder whose rims are rounded off */
const roundCylinder = (segments = 16) =>
  lathe(
    [
      [0, 0],
      [0.9, 0],
      [0.975, 0.02],
      [1, 0.07],
      [1, 0.93],
      [0.975, 0.98],
      [0.9, 1],
      [0, 1]
    ],
    segments
  );

/** Shapes with a lighter HD twin for small or thin parts (`hdTwinGeometry(shape, true)`) */
export const HD_LO_SHAPES = new Set(["cyl", "cone", "sphere", "taper", "egg", "drop", "capsule", "limb", "pod", "snout"]);

/**
 * The HD twin of a plain shape (undefined: it is the same in both). `lo`: a lighter twin for small or thin parts (eyes,
 * lips, whiskers, strands of silk), still smooth but with about a quarter of the vertices, since most kit parts ride a
 * walker and every vertex works out its walk
 */
export function hdTwinGeometry(shape: string, lo = false): THREE.BufferGeometry | undefined {
  if (lo) {
    switch (shape) {
      case "cyl":
        return roundCylinder(8);
      case "cone":
        return new THREE.ConeGeometry(1, 1, 8, 1);
      case "sphere":
        return new THREE.SphereGeometry(1, 10, 7);
      case "taper":
        return taperGeometry(8);
      case "egg":
        return eggGeometry(10);
      case "drop":
        return dropGeometry(10);
      case "capsule":
        return new THREE.CapsuleGeometry(0.5, 1, 2, 8);
      case "limb":
        return limbGeometry(8);
      case "pod":
        return podGeometry(10);
      case "snout":
        return snoutGeometry(10);
    }
  }
  switch (shape) {
    case "box":
      return new RoundedBoxGeometry(1, 1, 1, 1, 0.1);
    case "cyl":
      return roundCylinder();
    case "cone":
      return new THREE.ConeGeometry(1, 1, 16, 2);
    case "sphere":
      return new THREE.SphereGeometry(1, 18, 12);
    case "taper":
      return taperGeometry(18);
    case "egg":
      return eggGeometry(20);
    case "drop":
      return dropGeometry(20);
    case "capsule":
      return new THREE.CapsuleGeometry(0.5, 1, 6, 18);
    case "limb":
      return limbGeometry(18);
    case "pod":
      return podGeometry(18);
    case "snout":
      return snoutGeometry(18);
    default:
      return undefined;
  }
}

/** A limb, neck or post narrowing upward to 0.6 of its foot, rounded at both ends */
export const taperGeometry = (segments = 10) =>
  lathe(
    [
      [0, 0],
      [0.88, 0],
      [0.98, 0.04],
      [1, 0.1],
      [0.64, 0.92],
      [0.56, 0.99],
      [0.4, 1],
      [0, 1]
    ],
    segments
  );

/** A limb (or a chest, a sleeve): full at the top, narrowing to 0.7 toward a rounded foot */
export const limbGeometry = (segments = 10) =>
  lathe(
    [
      [0, 0],
      [0.5, 0],
      [0.66, 0.03],
      [0.72, 0.1],
      [0.9, 0.62],
      [1, 0.9],
      [0.95, 0.98],
      [0.7, 1],
      [0, 1]
    ],
    segments
  );

/** A pod: a capsule lying along z (a beast's body) */
export const podGeometry = (segments = 10) => new THREE.CapsuleGeometry(0.5, 0.9, 5, segments).rotateX(Math.PI / 2);

/** A snout or muzzle: round at its root (-z), narrowing toward its blunt tip at +z */
export const snoutGeometry = (segments = 10) => taperGeometry(segments).rotateX(Math.PI / 2);

/** A capsule: a cylinder with round ends */
export const capsuleGeometry = () => new THREE.CapsuleGeometry(0.5, 1, 3, 10);

/** Round profile points from bottom to top: radius(t) for t in 0…1 */
const profile = (radius: (t: number) => number, n: number) => Array.from({ length: n + 1 }, (_, i) => [Math.max(radius(i / n), 0), i / n]);

/** An egg, wider below (bodies, heads, bellies) */
export const eggGeometry = (segments = 12) => lathe(profile((t) => Math.sin(Math.PI * t) ** 0.85 * (1.05 - 0.3 * t), 10), segments);

/** A teardrop, round below and drawn to a point on top (flames, drops, buds, fat claws) */
export const dropGeometry = (segments = 12) => lathe(profile((t) => Math.sin(Math.PI * t) * Math.pow(1 - t, 0.3), 12), segments);

/** A horn (tusk, claw, tail tip): a cone curling forward toward +z from its round base at y = 0 */
export function hornGeometry(): THREE.BufferGeometry {
  const rings = 10;
  const around = 10;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    // Along a quarter arc rising from the base and bending forward
    const a = t * Math.PI * 0.42;
    const cy = Math.sin(a);
    const cz = 1 - Math.cos(a);
    // The ring is turned with the arc's tangent
    const tz = Math.sin(a);
    const ty = Math.cos(a);
    const r = 0.22 * (1 - t) + 0.004;
    for (let j = 0; j < around; j++) {
      const b = (j / around) * Math.PI * 2;
      const x = Math.cos(b) * r;
      const n = Math.sin(b) * r;
      pos.push(x, cy - tz * n, cz + ty * n);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      idx.push(a, a + around, b, b, a + around, b + around);
    }
  // A cap over the base
  const c = pos.length / 3;
  pos.push(0, 0, 0);
  for (let j = 0; j < around; j++) idx.push(c, j, (j + 1) % around);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A blade (sword, spear point, dagger) standing on its base at y = 0 with its point at the top: a lozenge section
 * (spine along x, edges along z), full width up to 0.78 of its length, then drawn to the point
 */
export function bladeGeometry(): THREE.BufferGeometry {
  const stations: Array<[number, number]> = [
    [0, 1],
    [0.78, 0.86],
    [1, 0]
  ];
  const pos: number[] = [];
  const idx: number[] = [];
  for (const [y, k] of stations) {
    // Spine (±x) and edges (±z) of the section, the spine thinning toward the point
    pos.push(0.5 * k, y, 0, 0, y, 0.5 * k, -0.5 * k, y, 0, 0, y, -0.5 * k);
  }
  for (let s = 0; s < stations.length - 1; s++)
    for (let j = 0; j < 4; j++) {
      const a = s * 4 + j;
      const b = s * 4 + ((j + 1) % 4);
      idx.push(a, a + 4, b, b, a + 4, b + 4);
    }
  // The base, closed where it meets the guard
  idx.push(0, 1, 2, 0, 2, 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // Facets stay crisp: one normal per face
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}
