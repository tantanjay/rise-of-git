import * as THREE from "three";
import { rngFor } from "@/utils/random";
import { Kit, Surf, TAU, V3, hash3 } from "./heroKit";

/* ------------------------------------------------------------------------- */
/* Xal'Vorath in high graphics: the model (skeleton, parts, materials)       */
/* ------------------------------------------------------------------------- */

/*
 * Every part is built on the hero kit in its bone's own space and baked into one merged geometry per material (basalt,
 * obsidian, glow), each vertex carrying the bone it rides (`aBone`), its surface (`aSurf`: x, y, kind) and its colour.
 * The bones are plain groups in a detached hierarchy the component poses every frame; their matrices go into a float
 * texture (three texels a bone) and the materials skin the vertices. So the whole titan, its orbiting ruins and its debris
 * cost three draws however many parts they have.
 */

/** Surface kinds (`aSurf.z`) */
export const XAL_SURF = { rock: 1, stone: 2, frieze: 3, earth: 4, obsidian: 5, seam: 7, eye: 8 } as const;

/** Hides a bone (its vertices collapse to a point, so it draws nothing) */
export const HIDDEN = 1e-4;

const BASALT = "#2a2527";
const BASALT_DARK = "#1e1a1c";
const OBSIDIAN = "#17080c";
const OBSIDIAN_RED = "#250a10";
const STONE = "#4c4852";
const EARTH = "#2a221f";
const SEAM = "#ff1f35";
const ORB = "#e0142c";
const EYE = "#fff1f2";

/* ------------------------------ shapes ------------------------------ */

/** Gives a geometry flat facets (each triangle its own normal) */
function flat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.computeVertexNormals();
  return out;
}

/** A craggy lump of rock: every corner pushed in or out, faceted */
export function crag(w: number, h: number, d: number, seed: number, detail = 1, rough = 0.34): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 - rough / 2 + hash3(x, y, z, seed) * rough;
    pos.setXYZ(i, x * k * w, y * k * h, z * k * d);
  }
  return flat(g);
}

/** A slab of rock or stone with chipped edges and corners */
export function slab(w: number, h: number, d: number, seed: number, rough = 0.12): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 3, 2, 3);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setXYZ(
      i,
      (x + (hash3(x, y, z, seed) - 0.5) * rough) * w,
      (y + (hash3(x, y, z, seed + 1) - 0.5) * rough * 1.6) * h,
      (z + (hash3(x, y, z, seed + 2) - 0.5) * rough) * d
    );
  }
  return flat(g);
}

/**
 * An obsidian shard: a faceted blade widest a little above its foot, each facet a little off true. Centred on its length
 * (along y), or standing on its foot at the origin (`base`); `bend` curls its tip toward +x.
 */
export function shard(w: number, h: number, d: number, seed: number, o: { sides?: number; base?: boolean; bend?: number; waist?: number } = {}): THREE.BufferGeometry {
  const sides = o.sides ?? 6;
  const waist = o.waist ?? 0.3;
  const g = new THREE.ConeGeometry(0.5, 1, sides, 4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = y + 0.5;
    const prof = u < waist ? 0.55 + (u / waist) * 0.45 : Math.max(0, (1 - u) / (1 - waist));
    const j = 0.84 + hash3(x, y, z, seed) * 0.32;
    const keel = 1 + 0.2 * Math.cos(Math.atan2(z, x) * 2);
    const lift = u > 0.01 && u < 0.99 ? (hash3(x, y, z, seed + 3) - 0.5) * 0.08 : 0;
    pos.setXYZ(i, x * w * prof * j * keel + (o.bend ?? 0) * u * u * h, ((o.base ? u : y) + lift) * h, z * d * prof * j);
  }
  return flat(g);
}

/** A curved rib or talon of obsidian along `pts`, tapering from `r0` to `r1`, five-sided and faceted */
export function rib(pts: V3[], r0: number, r1: number, segs = 16): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const radial = 5;
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, c);
    const r = r0 + (r1 - r0) * Math.pow(u, 1.1);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return flat(g);
}

/** A long curved talon hanging from the knuckle (down -y, curling forward then back to its point) */
export function talon(len: number): THREE.BufferGeometry {
  return rib(
    [
      [0, 0, 0],
      [0, -len * 0.42, 0.08],
      [0, -len * 0.82, 0.02],
      [0, -len, -0.12]
    ],
    0.07,
    0.004,
    12
  );
}

/** A fluted column drum, its top (and foot) broken off by `broken` of its height */
export function drum(r: number, h: number, seed: number, brokenTop = 0, brokenFoot = 0, flutes = 16): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, flutes * 4, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    const rad = Math.hypot(x, z);
    const groove = rad > 1e-4 ? 1 - 0.08 * Math.pow(Math.max(0, Math.cos(Math.atan2(z, x) * flutes)), 2) : 1;
    if (brokenTop && y > h / 2 - 1e-4) y -= hash3(x, y, z, seed) * brokenTop * h;
    if (brokenFoot && y < -h / 2 + 1e-4) y += hash3(x, y, z, seed + 5) * brokenFoot * h;
    pos.setXYZ(i, x * groove, y, z * groove);
  }
  return flat(g);
}

/* ------------------------------ surfaces ------------------------------ */

const rockS = (veins: number, seed: number): Surf => ({ fn: () => [veins, seed, XAL_SURF.rock] });
const earthS = (veins: number, seed: number): Surf => ({ fn: () => [veins, seed, XAL_SURF.earth] });
const stoneS = (veins: number, seed: number): Surf => ({ fn: () => [veins, seed, XAL_SURF.stone] });
const obsS = (seed: number): Surf => ({ fn: () => [0, seed, XAL_SURF.obsidian] });
const seamS = (seed: number): Surf => ({ fn: () => [0, seed, XAL_SURF.seam] });
/** A carved frieze along a block `len` long and `h` high (panels along it, the band across its middle) */
const friezeS = (len: number, h: number, cells: number): Surf => ({ fn: (p) => [(p.x / len + 0.5) * cells, p.y / h + 0.5, XAL_SURF.frieze] });

/* ------------------------------ the skeleton ------------------------------ */

type Side = 1 | -1;
export const SIDES: Side[] = [1, -1];
export interface Rest {
  pos: THREE.Vector3;
  rot: THREE.Euler;
}
const restOf = (g: THREE.Object3D): Rest => ({ pos: g.position.clone(), rot: g.rotation.clone() });

/** Every bone the component poses */
export interface XalBones {
  body: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  core: THREE.Group;
  eye: THREE.Vector3;
  crown: Array<{ g: THREE.Group; rest: Rest; tall: number }>;
  satellites: THREE.Group[];
  pauldron: Record<Side, THREE.Group>;
  slabs: Record<Side, Array<{ g: THREE.Group; rest: Rest }>>;
  shoulder: Record<Side, THREE.Group>;
  elbow: Record<Side, THREE.Group>;
  wrist: Record<Side, THREE.Group>;
  /** The floating arm plates by `${side}:${id}` (upper, spike, forearm, crest, hand) */
  plates: Record<string, THREE.Group>;
  talons: Record<Side, THREE.Group[]>;
  chestPlates: THREE.Group[];
  vortex: THREE.Group[];
  ruins: THREE.Group[];
  shards: THREE.Group[];
  debris: THREE.Group[];
  souls: THREE.Group[];
  rubble: Array<{ g: THREE.Group; x: number; z: number; seed: number }>;
  /** The shattered ground, its columns and the rubble (identity at rest) */
  ground: THREE.Group;
}

class Rig {
  k = new Kit(false, false, true);
  root = new THREE.Group();
  bones: THREE.Object3D[] = [this.root];
  private cur: THREE.Object3D = this.root;
  private n = 0;

  /** A bone under the current one; everything `body` adds is in its own space */
  bone(pos: V3, rot: V3 = [0, 0, 0], body?: () => void): THREE.Group {
    const g = new THREE.Group();
    g.position.set(...pos);
    g.rotation.set(...rot);
    this.cur.add(g);
    const prevBone = this.k.bone;
    const prevCur = this.cur;
    this.k.bone = this.bones.length;
    this.bones.push(g);
    this.cur = g;
    body?.();
    this.k.bone = prevBone;
    this.cur = prevCur;
    return g;
  }

  /** A seed per part, so no two parts carry the same pattern */
  seed() {
    this.n++;
    return (this.n * 0.618034) % 1;
  }

  rock(geo: THREE.BufferGeometry, pos: V3, rot: V3, veins: number, color = BASALT) {
    this.k.add("rock", geo, pos, rot, { surf: rockS(veins, this.seed()), color });
  }
  obs(geo: THREE.BufferGeometry, pos: V3, rot: V3 = [0, 0, 0], color = OBSIDIAN, scale?: V3) {
    this.k.add("obsidian", geo, pos, rot, { surf: obsS(this.seed()), color, scale });
  }
  /** An obsidian spike laid from `from` to its point at `to` */
  spike(from: V3, to: V3, w: number, d: number, seedN: number, color = OBSIDIAN) {
    this.k.along("obsidian", from, to, 0, { geo: shard(w, 1, d, seedN, { sides: 5 }), surf: obsS(this.seed()), color });
  }
  glow(geo: THREE.BufferGeometry, pos: V3, color = SEAM, bright = 1.4, rot: V3 = [0, 0, 0]) {
    this.k.add("glow", geo, pos, rot, { surf: seamS(this.seed()), color, bright });
  }
}

/** Builds the titan's skeleton (at its rest pose) and its three merged geometries */
export function buildSingularity() {
  const R = new Rig();
  const rng = rngFor("xal-vorath-hd");
  const rnd = (a: number, b: number) => a + rng() * (b - a);
  const tint = (base: string, spread = 0.25) => "#" + new THREE.Color(base).multiplyScalar(1 - spread / 2 + rng() * spread).getHexString();
  let s = 1;
  const S = () => (s += 7);

  /* ---------- the shattered ground: heaved slabs, standing and fallen columns, rubble lifting ---------- */
  const at = (deg: number, r: number): [number, number] => [Math.sin((deg * Math.PI) / 180) * r, Math.cos((deg * Math.PI) / 180) * r];
  // All on one bone, so the ground can be dragged in after the titan (Emerge); at rest it stays where it lies
  const rubble: XalBones["rubble"] = [];
  const ground = R.bone([0, 0, 0], [0, 0, 0], () => {
    for (const [deg, r, w, d, tx, tz] of [
      [-96, 3.7, 1.7, 1.1, 0.24, -0.3],
      [-122, 3.7, 1.4, 1.0, -0.34, 0.2],
      [162, 3.2, 1.9, 1.2, 0.3, 0.24],
      [-160, 3.5, 1.3, 0.9, -0.2, -0.34],
      [96, 3.8, 1.5, 1.0, 0.38, 0.2],
      [118, 3.1, 1.2, 0.9, -0.3, -0.3]
    ]) {
      const [x, z] = at(deg, r);
      R.k.add("rock", slab(w, 0.34, d, S()), [x, 0.06, z], [tx, (deg * Math.PI) / 180, tz], { surf: earthS(0.5, R.seed()), color: tint(EARTH) });
      for (let i = 0; i < 3; i++) {
        const [rx, rz] = at(deg + rnd(-14, 14), r + rnd(-0.9, 0.9));
        R.k.add("rock", crag(rnd(0.18, 0.34), rnd(0.12, 0.24), rnd(0.18, 0.3), S(), 0), [rx, 0.06, rz], [rnd(0, 3), rnd(0, 3), 0], { surf: earthS(0.2, R.seed()), color: tint(EARTH) });
      }
    }
    // A standing column broken off half way, on its plinth
    {
      const [x, z] = at(215, 4.0);
      R.k.add("rock", slab(0.95, 0.24, 0.95, S(), 0.06), [x, 0.12, z], [0, 0.4, 0], { surf: stoneS(0.1, R.seed()), color: tint(STONE, 0.1) });
      R.k.add("rock", drum(0.32, 0.9, S()), [x, 0.69, z], [0, 0.3, 0], { surf: stoneS(0.15, R.seed()), color: tint(STONE, 0.1) });
      R.k.add("rock", drum(0.31, 0.8, S(), 0.5), [x + 0.02, 1.53, z], [0.03, 1.1, -0.04], { surf: stoneS(0.15, R.seed()), color: tint(STONE, 0.1) });
    }
    // A fallen column: two drums lying where they rolled, the capital beside them
    {
      const [x, z] = at(140, 4.2);
      const dir = 0.9;
      for (let i = 0; i < 2; i++) {
        const off = (i - 0.5) * 1.0;
        R.k.add("rock", drum(0.3, 0.92, S(), i ? 0.3 : 0, i ? 0 : 0.25), [x + Math.cos(dir) * off, 0.27, z - Math.sin(dir) * off + i * 0.1], [0, dir, Math.PI / 2], {
          surf: stoneS(0.12, R.seed()),
          color: tint(STONE, 0.1)
        });
      }
      R.k.add("rock", new THREE.CylinderGeometry(0.42, 0.3, 0.22, 24, 1), [x + 0.7, 0.18, z + 0.75], [0.2, 0.3, 0.12], { surf: stoneS(0.1, R.seed()), color: tint(STONE, 0.1) });
      R.k.add("rock", slab(0.9, 0.13, 0.9, S(), 0.05), [x + 0.72, 0.33, z + 0.72], [0.2, 0.3, 0.12], { surf: stoneS(0.1, R.seed()), color: tint(STONE, 0.1) });
    }
    // A lintel with its carved frieze, cracked across and lying on the slabs
    {
      const [x, z] = at(-118, 4.1);
      R.k.add("rock", slab(1.7, 0.44, 0.5, S(), 0.05), [x, 0.24, z], [0.06, -2.05, 0.05], { surf: friezeS(1.7, 0.44, 5), color: tint(STONE, 0.08) });
    }
    // Rubble the gravity lifts off the ground
    for (let i = 0; i < 8; i++) {
      const [x, z] = at(i * 45 + rnd(-15, 15), rnd(1.6, 2.9));
      const g = R.bone([x, 0, z], [0, 0, 0], () => R.rock(crag(rnd(0.16, 0.3), rnd(0.14, 0.26), rnd(0.16, 0.28), S(), 0), [0, 0, 0], [0, 0, 0], 0.25, tint(EARTH)));
      rubble.push({ g, x, z, seed: rng() });
    }
  });

  /* ---------- the titan ---------- */
  let chest!: THREE.Group;
  let head!: THREE.Group;
  let core!: THREE.Group;
  const crown: XalBones["crown"] = [];
  const satellites: THREE.Group[] = [];
  const pauldron = {} as Record<Side, THREE.Group>;
  const slabs = { 1: [], [-1]: [] } as unknown as Record<Side, Array<{ g: THREE.Group; rest: Rest }>>;
  const shoulder = {} as Record<Side, THREE.Group>;
  const elbow = {} as Record<Side, THREE.Group>;
  const wrist = {} as Record<Side, THREE.Group>;
  const plates: Record<string, THREE.Group> = {};
  const talons = { 1: [], [-1]: [] } as unknown as Record<Side, THREE.Group[]>;
  const chestPlates: THREE.Group[] = [];
  const vortex: THREE.Group[] = [];

  const body = R.bone([0, 3.25, 0], [0, 0, 0], () => {
    chest = R.bone([0, 0, 0], [0, 0, 0], () => {
      // The spine: a column of basalt vertebrae down the back, each with a dorsal spike, held apart by glowing seams
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const y = 0.95 - t * 1.55;
        const z = -0.44 + 0.06 * Math.sin(t * Math.PI);
        const sz = 0.34 - t * 0.08;
        R.rock(crag(sz * 1.35, sz * 0.78, sz, S()), [0, y, z], [0, rnd(-0.2, 0.2), 0], 0.7, tint(BASALT));
        const len = 0.62 * (1 - t * 0.45);
        R.spike([0, y + 0.04, z - sz * 0.3], [0, y + 0.04 + len * 0.42, z - sz * 0.3 - len * 0.9], 0.15 * (1 - t * 0.3), 0.1, S());
        if (i < 5) R.glow(crag(0.18, 0.07, 0.16, S(), 0), [0, y - 0.155, z + 0.02]);
      }
      // Shoulder blades: broad slabs behind the ribs
      for (const sd of SIDES) R.rock(slab(0.72, 0.86, 0.22, S()), [sd * 0.5, 0.42, -0.44], [0.15, sd * -0.45, sd * -0.12], 0.35, tint(BASALT_DARK));
      // The ribcage: obsidian ribs curving round from the spine, open at the front, with the black hole inside it (no rib
      // crosses the accretion disc's height)
      [0.66, 0.4, -0.26, -0.5].forEach((y, li) => {
        const sc = [0.92, 1, 1, 0.86][li];
        for (const sd of SIDES) {
          R.obs(
            rib(
              [
                [sd * 0.14, y + 0.04, -0.46],
                [sd * 0.58 * sc, y + 0.02, -0.38],
                [sd * 0.84 * sc, y - 0.03, -0.02],
                [sd * 0.7 * sc, y - 0.08, 0.36],
                [sd * 0.36 * sc, y - 0.12, 0.54]
              ],
              0.075,
              0.022
            ),
            [0, 0, 0],
            [0, 0, 0],
            tint(OBSIDIAN, 0.3)
          );
        }
      });
      // The collar: a ring of rocks round the neck over a band of light
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + 0.2;
        R.rock(crag(0.28, 0.22, 0.26, S()), [Math.cos(a) * 0.42, 0.9 + rnd(-0.03, 0.05), -0.12 + Math.sin(a) * 0.32], [rnd(0, 2), rnd(0, 2), 0], 0.55, tint(BASALT));
      }
      R.glow(new THREE.TorusGeometry(0.36, 0.035, 6, 24), [0, 0.86, -0.12], SEAM, 1.8, [Math.PI / 2, 0, 0]);
      // The waist: a ring of rocks where the vortex begins, obsidian tassets hanging from it
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        R.rock(crag(0.34, 0.26, 0.3, S()), [Math.cos(a) * 0.5, -0.66 + rnd(-0.04, 0.04), -0.08 + Math.sin(a) * 0.36], [rnd(0, 2), rnd(0, 2), 0], 0.6, tint(BASALT));
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        R.spike([c * 0.56, -0.66, -0.08 + sn * 0.42], [c * 0.74, -1.18 - rnd(0, 0.15), -0.08 + sn * 0.56], 0.2, 0.08, S(), tint(OBSIDIAN));
      }

      // The core: the black hole sits in the chest (its sphere, disc and lensing ring are drawn by the component)
      core = R.bone([0, 0.08, 0.16]);

      // Ten obsidian plates framing the hole, each floating on its own (the component places them)
      for (let i = 0; i < 10; i++) {
        const big = i % 2 === 0;
        chestPlates.push(
          R.bone([0, 0, 0], [0, 0, 0], () => {
            const h = big ? 1.0 : 0.82;
            R.obs(shard(big ? 0.6 : 0.5, h, 0.26, S(), { sides: 5 }), [0, 0, 0], [0, 0, 0], tint(OBSIDIAN_RED, 0.3));
            R.glow(crag(0.11, 0.05, 0.07, S(), 0), [0, -h / 2 - 0.03, 0]);
          })
        );
      }

      // The head: a faceted helm, a mask tapering to a point, brows over one burning eye, under a broken crown of spires
      head = R.bone([0, 1.14, 0.08], [0, 0, 0], () => {
        R.obs(shard(0.66, 0.78, 0.62, S(), { sides: 7, waist: 0.45 }), [0, 0.24, -0.06], [0, 0.2, 0], OBSIDIAN);
        R.rock(crag(0.6, 0.5, 0.55, S()), [0, 0.22, -0.22], [0, 0, 0], 0.5, tint(BASALT_DARK));
        R.spike([0, 0.46, 0.22], [0, -0.24, 0.25], 0.38, 0.16, S(), OBSIDIAN_RED);
        for (const sd of SIDES) {
          R.spike([sd * 0.04, 0.36, 0.34], [sd * 0.38, 0.52, 0.2], 0.13, 0.09, S());
          R.spike([sd * 0.2, 0.1, 0.22], [sd * 0.5, 0.36, -0.02], 0.15, 0.08, S());
        }
        R.glow(crag(0.07, 0.22, 0.05, S(), 1, 0.1), [0, 0.27, 0.4], EYE, 3);
        // The crown: each spire floats a hair over the helm on its own bone (they trail the head on springs)
        const spires: Array<[number, number, number, number, number, number, number]> = [
          // x, y, z, tilt out, tilt back, height, width
          [0, 0.62, -0.1, 0, -0.12, 1.45, 0.3],
          [0.22, 0.56, -0.08, 0.28, -0.1, 1.12, 0.24],
          [0.4, 0.46, -0.05, 0.58, -0.05, 0.88, 0.2],
          [0.55, 0.3, 0, 0.95, 0, 0.62, 0.16],
          [0.16, 0.5, -0.3, 0.2, -0.6, 0.9, 0.18]
        ];
        for (const [x, y, z, out, back, h, w] of spires) {
          for (const sd of x === 0 ? [1 as Side] : SIDES) {
            const g = R.bone([sd * x, y, z], [back, 0, -sd * out], () => {
              R.obs(shard(w, h, w * 0.8, S(), { sides: 5, base: true }), [0, 0.06, 0], [0, rnd(0, 1), 0], tint(OBSIDIAN, 0.3));
            });
            crown.push({ g, rest: restOf(g), tall: h });
          }
        }
        for (let i = 0; i < 4; i++) satellites.push(R.bone([0, 0.9, 0], [0, 0, 0], () => R.obs(shard(0.1, 0.32, 0.09, S(), { sides: 4 }), [0, 0, 0])));
      });

      // Pauldrons: three basalt slabs a side, each with an obsidian blade sweeping up and out, each floating on its own
      for (const sd of SIDES) {
        pauldron[sd] = R.bone([sd * 1.25, 0.95, 0], [0, 0, sd * -0.42], () => {
          const defs: Array<{ pos: V3; rot: V3; slab: V3; blade: V3; bladeAt: V3; bladeRot: V3 }> = [
            { pos: [sd * 0.28, 0.2, 0], rot: [0.08, 0, sd * -0.52], slab: [0.82, 0.36, 0.72], blade: [0.5, 1.55, 0.36], bladeAt: [sd * 0.1, 0.1, 0], bladeRot: [0, 0, sd * -0.15] },
            { pos: [sd * -0.05, 0.5, -0.08], rot: [0.12, 0, sd * -0.22], slab: [0.62, 0.3, 0.56], blade: [0.4, 1.2, 0.3], bladeAt: [0, 0.1, -0.05], bladeRot: [-0.15, 0, 0] },
            { pos: [sd * 0.56, -0.1, 0.06], rot: [0, 0, sd * -0.82], slab: [0.6, 0.3, 0.52], blade: [0.36, 1.0, 0.28], bladeAt: [0, 0.1, 0], bladeRot: [0, 0, 0] }
          ];
          for (const d of defs) {
            const g = R.bone(d.pos, d.rot, () => {
              R.rock(slab(d.slab[0], d.slab[1], d.slab[2], S()), [0, 0, 0], [0, 0, 0], 0.5, tint(BASALT));
              R.obs(shard(d.blade[0], d.blade[1], d.blade[2], S(), { base: true, bend: sd * 0.12 }), d.bladeAt, d.bladeRot, tint(OBSIDIAN, 0.3));
              R.glow(crag(0.14, 0.06, 0.12, S(), 0), [0, -d.slab[1] / 2 - 0.03, 0]);
            });
            slabs[sd].push({ g, rest: restOf(g) });
          }
        });
      }

      // Arms: rock boulders held apart at elbow and wrist by gravity orbs, obsidian gauntlet plates, long glossy talons
      for (const sd of SIDES) {
        shoulder[sd] = R.bone([sd * 1.28, 0.72, 0], [0, 0, 0], () => {
          R.glow(new THREE.IcosahedronGeometry(0.1, 1), [0, 0, 0], ORB, 1.15);
          plates[`${sd}:upper`] = R.bone([sd * 0.1, -0.5, 0], [0, 0, sd * 0.08], () => {
            R.rock(crag(0.5, 1.0, 0.46, S()), [0, 0, 0], [0, 0, 0], 0.55, tint(BASALT));
            R.obs(shard(0.38, 0.84, 0.16, S(), { sides: 4 }), [sd * 0.2, 0.05, 0], [0, sd * 0.2, sd * 0.1], tint(OBSIDIAN, 0.3));
          });
          elbow[sd] = R.bone([sd * 0.14, -1.02, 0.04], [0, 0, 0], () => {
            R.glow(new THREE.IcosahedronGeometry(0.085, 1), [0, 0, 0], ORB, 1.2);
            plates[`${sd}:spike`] = R.bone([sd * 0.18, 0.08, -0.14], [-0.45, 0, sd * -0.4], () => R.obs(shard(0.22, 0.68, 0.22, S()), [0, 0, 0]));
            plates[`${sd}:forearm`] = R.bone([0, -0.55, 0.04], [0, 0, 0], () => {
              R.rock(crag(0.48, 1.06, 0.46, S()), [0, 0, 0], [0, 0, 0], 0.5, tint(BASALT));
              R.obs(shard(0.36, 0.9, 0.12, S(), { sides: 4 }), [0, -0.05, 0.2], [0.05, 0, 0], tint(OBSIDIAN_RED, 0.3));
              R.obs(shard(0.14, 0.86, 0.34, S(), { sides: 4 }), [sd * 0.22, 0, 0], [0, 0, sd * 0.05]);
            });
            plates[`${sd}:crest`] = R.bone([sd * 0.22, -0.4, -0.08], [0.25, 0, sd * -0.32], () => R.obs(shard(0.24, 0.94, 0.26, S()), [0, 0, 0]));
            wrist[sd] = R.bone([0, -1.08, 0.08], [0, 0, 0], () => {
              R.glow(new THREE.IcosahedronGeometry(0.065, 1), [0, 0, 0], ORB, 1.2);
              plates[`${sd}:hand`] = R.bone([0, -0.2, 0.04], [0, 0, 0], () => {
                R.rock(crag(0.46, 0.36, 0.3, S()), [0, 0, 0], [0, 0, 0], 0.6, tint(BASALT));
                R.obs(shard(0.42, 0.24, 0.12, S(), { sides: 4 }), [0, -0.03, 0.13], [0.3, 0, Math.PI / 2], tint(OBSIDIAN, 0.3));
              });
              R.obs(talon(0.56), [sd * -0.24, -0.18, 0.12], [0.28, sd * -0.42, sd * 0.48]);
              for (let idx = 0; idx < 4; idx++) {
                const spread = (idx - 1.5) * 0.135;
                const len = idx === 1 || idx === 2 ? 1.15 : 0.92;
                talons[sd].push(
                  R.bone([spread, -0.32, 0.06], [0, spread * -0.55, sd * spread * -0.32], () => {
                    R.obs(shard(0.13, 0.28, 0.13, S(), { sides: 5 }), [0, 0.08, 0.06], [0.4, 0, 0], tint(OBSIDIAN_RED, 0.3));
                    R.obs(talon(0.84), [0, 0, 0], [0, 0, 0], OBSIDIAN, [1, len, 1]);
                  })
                );
              }
            });
          });
        });
      }
    });

    // The vortex: seven tiers of rock and obsidian spiralling to a point (each tier turns on its own)
    for (let ti = 0; ti < 7; ti++) {
      const u = ti / 6;
      const radius = 0.84 + (0.08 - 0.84) * Math.pow(u, 0.92);
      const count = Math.max(4, Math.round(8 + (4 - 8) * u));
      const sc = 1.05 + (0.36 - 1.05) * u;
      vortex.push(
        R.bone([0, -0.68 - 0.37 * ti, 0], [0, 0, 0], () => {
          for (let p = 0; p < count; p++) {
            const a = (p / count) * TAU + ti * 0.52;
            const pos: V3 = [Math.sin(a) * radius, 0, Math.cos(a) * radius];
            if ((p + ti) % 2 === 0) R.obs(shard(0.46 * sc, 0.95 * sc, 0.32 * sc, S(), { bend: 0.14 * sc }), pos, [0.32, a, 0.72], tint(OBSIDIAN, 0.3));
            else R.rock(crag(0.5 * sc, 0.56 * sc, 0.42 * sc, S()), pos, [0.32, a, 0.72], 0.7, tint(BASALT));
          }
        })
      );
    }
  });

  /* ---------- orbiting ruins, consumed shards, debris and the requiem shards (posed by the component) ---------- */
  const ruins: THREE.Group[] = [];
  for (let i = 0; i < 10; i++) {
    ruins.push(
      R.bone([0, 3, 0], [0, 0, 0], () => {
        if (i < 2) {
          // A rock island with a broken column still standing on it
          R.rock(crag(1.0, 0.52, 0.86, S()), [0, 0, 0], [0, 0, 0], 0.45, tint(BASALT));
          R.rock(crag(0.7, 0.95, 0.6, S()), [0.05, -0.62, 0.02], [0, 0, 0], 0.6, tint(BASALT_DARK));
          R.k.add("rock", drum(0.19, 0.95, S(), 0.45), [0.18, 0.66, -0.05], [0.05, 0, -0.06], { surf: stoneS(0.15, R.seed()), color: tint(STONE, 0.1) });
          R.k.add("rock", slab(0.5, 0.1, 0.5, S(), 0.05), [0.18, 0.2, -0.05], [0, 0.3, 0], { surf: stoneS(0.1, R.seed()), color: tint(STONE, 0.1) });
        } else if (i < 4) R.rock(crag(0.55, 0.9, 0.5, S()), [0, 0, 0], [0, 0, 0], 0.6, tint(BASALT));
        else if (i === 4) R.k.add("rock", drum(0.24, 0.72, S(), 0.3, 0.3), [0, 0, 0], [0, 0, 0], { surf: stoneS(0.15, R.seed()), color: tint(STONE, 0.1) });
        else if (i === 5) {
          R.k.add("rock", new THREE.CylinderGeometry(0.34, 0.24, 0.18, 24, 1), [0, 0, 0], [0, 0, 0], { surf: stoneS(0.1, R.seed()), color: tint(STONE, 0.1) });
          R.k.add("rock", slab(0.74, 0.11, 0.74, S(), 0.05), [0, 0.14, 0], [0, 0, 0], { surf: stoneS(0.1, R.seed()), color: tint(STONE, 0.1) });
        } else if (i < 8) R.rock(crag(0.3, 0.5, 0.28, S()), [0, 0, 0], [0, 0, 0], 0.5, tint(BASALT));
        else if (i === 8) R.k.add("rock", slab(0.66, 0.24, 0.26, S(), 0.06), [0, 0, 0], [0, 0, 0], { surf: friezeS(0.66, 0.24, 2), color: tint(STONE, 0.08) });
        else R.obs(shard(0.22, 0.62, 0.2, S()), [0, 0, 0]);
      })
    );
  }
  const shards = Array.from({ length: 6 }, () => R.bone([0, 3, 0], [0, 0, 0], () => R.obs(shard(0.16, 0.5, 0.14, S()), [0, 0, 0], [0, 0, 0], tint(OBSIDIAN_RED, 0.3))));
  const debris = Array.from({ length: 18 }, () => R.bone([0, -50, 0], [0, 0, 0], () => R.rock(crag(0.26, 0.3, 0.24, S(), 0), [0, 0, 0], [0, 0, 0], 0.3, tint(BASALT))));
  const souls = Array.from({ length: 16 }, () => R.bone([0, -50, 0], [0, 0, 0], () => R.obs(shard(0.14, 0.55, 0.12, S()), [0, 0, 0], [0, 0, 0], tint(OBSIDIAN_RED, 0.3))));

  const B: XalBones = {
    body,
    chest,
    head,
    core,
    eye: new THREE.Vector3(0, 0.27, 0.46),
    crown,
    satellites,
    pauldron,
    slabs,
    shoulder,
    elbow,
    wrist,
    plates,
    talons,
    chestPlates,
    vortex,
    ruins,
    shards,
    debris,
    souls,
    rubble,
    ground
  };
  return { root: R.root, bones: R.bones, B, geos: R.k.bake() as Record<"rock" | "obsidian" | "glow", THREE.BufferGeometry> };
}

/* ------------------------------ skinning and materials ------------------------------ */

/** Uniforms every material of the titan shares */
export interface XalUniforms {
  time: { value: number };
  surge: { value: number };
  /** The core's position in the model's space (veins throb outward from it) */
  core: { value: THREE.Vector3 };
  bones: { value: THREE.DataTexture };
  glow: { value: number };
}

/** The bone texture: one row, three texels (the matrix's rows) a bone */
export function boneTexture(count: number): THREE.DataTexture {
  const t = new THREE.DataTexture(new Float32Array(count * 3 * 4), count * 3, 1, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** Writes each bone's matrix (in the model's space: the detached skeleton's root is the identity) into the texture */
export function writeBones(bones: THREE.Object3D[], tex: THREE.DataTexture) {
  bones[0].updateMatrixWorld(true);
  const d = tex.image.data as Float32Array;
  bones.forEach((b, i) => {
    const e = b.matrixWorld.elements;
    const o = i * 12;
    d[o] = e[0];
    d[o + 1] = e[4];
    d[o + 2] = e[8];
    d[o + 3] = e[12];
    d[o + 4] = e[1];
    d[o + 5] = e[5];
    d[o + 6] = e[9];
    d[o + 7] = e[13];
    d[o + 8] = e[2];
    d[o + 9] = e[6];
    d[o + 10] = e[10];
    d[o + 11] = e[14];
  });
  tex.needsUpdate = true;
}

const SKIN_PARS = `
  uniform highp sampler2D uBones;
  attribute float aBone;
  attribute vec3 aSurf;
  varying vec3 vSurf;
  varying vec3 vObjPos;
  varying vec3 vSkinPos;
  mat4 xalBone() {
    int i = int(aBone + 0.5) * 3;
    vec4 r0 = texelFetch(uBones, ivec2(i, 0), 0);
    vec4 r1 = texelFetch(uBones, ivec2(i + 1, 0), 0);
    vec4 r2 = texelFetch(uBones, ivec2(i + 2, 0), 0);
    return mat4(r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0);
  }
`;

// Shared fragment helpers: value noise, the prismatic edge colour, a bump from a height, the throb of light from the core
const FRAG_PARS = `
  uniform float uTime;
  uniform float uSurge;
  uniform vec3 uCore;
  varying vec3 vSurf;
  varying vec3 vObjPos;
  varying vec3 vSkinPos;
  float xh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float xn(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(xh(i), xh(i + vec3(1.0, 0.0, 0.0)), f.x), mix(xh(i + vec3(0.0, 1.0, 0.0)), xh(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(xh(i + vec3(0.0, 0.0, 1.0)), xh(i + vec3(1.0, 0.0, 1.0)), f.x), mix(xh(i + vec3(0.0, 1.0, 1.0)), xh(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
  vec3 xalPrism(float h) { return 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }
  // Bump from a height field without tangents (surface gradient); never normalizes a zero vector
  vec3 xalBump(vec3 n, vec3 pos, float h, float s) {
    vec3 dpx = dFdx(pos);
    vec3 dpy = dFdy(pos);
    float hx = dFdx(h);
    float hy = dFdy(h);
    vec3 r1 = cross(dpy, n);
    vec3 r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 v = abs(det) * n - s * sign(det) * (hx * r1 + hy * r2);
    return dot(v, v) > 1e-24 ? normalize(v) : n;
  }
  float xalThrob() { return 0.55 + 0.45 * sin(uTime * 2.4 - length(vSkinPos - uCore) * 3.2); }
`;

function skin(sh: THREE.WebGLProgramParametersWithUniforms, u: XalUniforms, normals: boolean) {
  sh.uniforms.uBones = u.bones;
  sh.uniforms.uTime = u.time;
  sh.uniforms.uSurge = u.surge;
  sh.uniforms.uCore = u.core;
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", `#include <common>\n${SKIN_PARS}`)
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vObjPos = position;
      vSurf = aSurf;
      transformed = (xalBone() * vec4(transformed, 1.0)).xyz;
      vSkinPos = transformed;`
    );
  if (normals) sh.vertexShader = sh.vertexShader.replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal = mat3(xalBone()) * objectNormal;");
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${FRAG_PARS}`);
}

/**
 * Basalt (strata, pits, fissures whose crimson light throbs outward from the core), cold temple stone (stains, dark cracks,
 * a carved frieze of panels and rosettes) and heaved earth: all matte, the detail faded out where it gets too small to read.
 */
function rockMaterial(u: XalUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.15 });
  m.onBeforeCompile = (sh) => {
    skin(sh, u, true);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float xk = vSurf.z;
        vec3 xrp = vObjPos * 3.0 + vSurf.y * 37.0;
        float xfade = 1.0 - smoothstep(0.35, 1.1, length(fwidth(xrp)));
        float xn1 = xn(xrp);
        float xht = 0.0;
        float xvein = 0.0;
        if (xk > 2.5 && xk < 3.5) {
          // The frieze: a moulded band of sunk panels, a rosette in each
          vec2 fq = vSurf.xy;
          float band = step(0.28, fq.y) * step(fq.y, 0.82);
          vec2 c = vec2(fract(fq.x), (fq.y - 0.28) / 0.54);
          float panel = band * step(0.12, c.x) * step(c.x, 0.88) * step(0.14, c.y) * step(c.y, 0.86);
          float ros = smoothstep(0.3, 0.26, length((c - 0.5) * vec2(1.0, 1.4)));
          float petal = step(0.5, fract(atan(c.y - 0.5, c.x - 0.5 + 1e-4) * 1.27 + 0.25));
          float mould = exp(-abs(fq.y - 0.28) * 60.0) + exp(-abs(fq.y - 0.82) * 60.0);
          xht = -panel * 0.6 + panel * ros * (0.45 + 0.15 * petal) + mould * 0.3;
          diffuseColor.rgb *= (0.82 + 0.25 * xn1) * (1.0 - panel * (1.0 - ros) * 0.28);
        } else if (xk > 1.5 && xk < 2.5) {
          // Temple stone: weathered, stained in streaks running down, cracked
          float stain = xn(vec3(vObjPos.x * 5.0, vObjPos.y * 0.9, vObjPos.z * 5.0) + vSurf.y * 11.0);
          float cr = 1.0 - abs(xn(xrp * 1.1 + 2.0) * 2.0 - 1.0);
          float crack = smoothstep(0.94, 0.985, cr) * xfade;
          diffuseColor.rgb *= (0.8 + 0.3 * xn1) * mix(1.0, 0.7, smoothstep(0.55, 0.85, stain)) * (1.0 - crack * 0.7);
          xht = xn1 * 0.4 - crack;
          xvein = crack * vSurf.x;
        } else {
          // Basalt (and heaved earth): strata, pits, fissures charred at their lips
          float strata = sin((vObjPos.y * 2.4 + xn1 * 0.9 + vSurf.y) * (xk > 3.5 ? 14.0 : 9.0)) * 0.5 + 0.5;
          float pit = 0.0;
          if (xfade > 0.0) pit = smoothstep(0.6, 0.9, xn(xrp * 14.0)) * xfade;
          // Fissures: thin cracks in patches (a coarse mask lets most of the rock stay whole)
          float ridge = 1.0 - abs(xn(xrp * 2.3 + 5.0) * 2.0 - 1.0);
          float patchy = smoothstep(0.45, 0.75, xn(xrp * 0.55 + 9.0));
          xvein = smoothstep(0.972, 0.994, ridge) * patchy * vSurf.x;
          float lip = smoothstep(0.93, 0.975, ridge) * patchy * step(0.01, vSurf.x);
          diffuseColor.rgb *= (0.74 + 0.36 * xn1) * mix(0.86, 1.1, strata) * (1.0 - pit * 0.08) * (1.0 - lip * 0.45);
          xht = strata * 0.35 + xn1 * 0.6 - pit * 0.25 - lip * 0.4;
        }`
      )
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = xalBump(normal, -vViewPosition, xht, 0.035 * xfade);")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += mix(vec3(0.75, 0.03, 0.07), vec3(1.0, 0.55, 0.42), xvein * xvein) * xvein * (1.4 + max(uSurge, 0.0) * 0.9) * xalThrob();`
      );
  };
  return m;
}

/**
 * Obsidian: black glass with a crimson depth. Each facet carries conchoidal ripples (rings about a few fracture points,
 * fading out from each), a thin film throws a prismatic sheen in its reflections, and crimson light shows through where
 * it turns thin at its edges, with a faint prismatic rim.
 */
function obsidianMaterial(u: XalUniforms): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.16,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    iridescence: 0.45,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [180, 460],
    envMapIntensity: 0.75
  });
  m.onBeforeCompile = (sh) => {
    skin(sh, u, true);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 xc = cross(dFdx(vObjPos), dFdy(vObjPos));
        vec3 xfn = dot(xc, xc) > 1e-30 ? normalize(xc) : vec3(0.0, 1.0, 0.0);
        vec3 xt = normalize(cross(xfn, abs(xfn.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 xb = cross(xfn, xt);
        vec2 xq = vec2(dot(vObjPos, xt), dot(vObjPos, xb)) * 2.6 + vSurf.y * 9.0;
        vec2 xcell = floor(xq);
        float xid = xh(vec3(xcell, floor(xfn.x * 4.0) + floor(xfn.z * 4.0) * 5.0));
        float xd = length(fract(xq) - 0.5 - (vec2(xid, fract(xid * 7.3)) - 0.5) * 0.5);
        float xfade = 1.0 - smoothstep(0.08, 0.35, length(fwidth(xq)));
        // Not every cell holds a scar; where one does, a few soft shells round its point
        float xht = (0.5 + 0.5 * sin(xd * 24.0 - xid * 6.0)) * (1.0 - smoothstep(0.08, 0.38, xd)) * step(0.45, xid);
        diffuseColor.rgb *= 0.85 + 0.3 * xid;`
      )
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = xalBump(normal, -vViewPosition, xht, 0.006 * xfade);")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float edge = 1.0 - ndv;
          totalEmissiveRadiance += vec3(0.5, 0.015, 0.05) * edge * edge * edge * (0.45 + max(uSurge, 0.0) * 0.25) * (0.7 + 0.3 * xalThrob());
          totalEmissiveRadiance += xalPrism(edge * 0.9 + vSurf.y + vObjPos.y * 0.3) * pow(edge, 6.0) * 0.16;
        }`
      );
  };
  return m;
}

/** The light inside it: seams between the rocks, the gravity orbs at its joints (throbbing with the core) and the eye */
function glowMaterial(u: XalUniforms): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: "#ffffff", vertexColors: true, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    skin(sh, u, false);
    sh.uniforms.uGlow = u.glow;
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uGlow;").replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      diffuseColor.rgb *= uGlow * (vSurf.z > 7.5 ? 0.9 + 0.1 * sin(uTime * 13.0) : 0.5 + 0.6 * xalThrob());`
    );
  };
  return m;
}

export function makeBodyMaterials(u: XalUniforms) {
  return { rock: rockMaterial(u), obsidian: obsidianMaterial(u), glow: glowMaterial(u) };
}

/* ------------------------------ the black hole ------------------------------ */

const NOISE2 = `
  float dh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float dn(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = dh(vec2(mod(i.x, period), i.y));
    float b = dh(vec2(mod(i.x + 1.0, period), i.y));
    float c = dh(vec2(mod(i.x, period), i.y + 1.0));
    float d = dh(vec2(mod(i.x + 1.0, period), i.y + 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  vec3 prism(float h) { return 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }
`;

// The accretion disc: bands of matter sheared as they fall in (the inside turns faster), white-hot inside to crimson outside,
// the side turning toward the eye brighter
export const DISC_VERT = `
  varying vec2 vXY;
  varying float vDop;
  void main() {
    vXY = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 tv = (modelViewMatrix * vec4(-position.y, position.x, 0.0, 0.0)).xyz;
    float tl = length(tv);
    float ml = length(mv.xyz);
    vDop = tl > 1e-5 && ml > 1e-5 ? dot(tv / tl, -mv.xyz / ml) : 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;
export const DISC_FRAG = `
  uniform float uTime;
  uniform float uGain;
  uniform float uIn;
  uniform float uOut;
  varying vec2 vXY;
  varying float vDop;
  ${NOISE2}
  void main() {
    float r = length(vXY);
    float u = clamp((r - uIn) / (uOut - uIn), 0.0, 1.0);
    float a = atan(vXY.y, vXY.x) / 6.28318 + 0.5;
    float rot = fract(uTime * 0.32 / max(r * sqrt(r), 0.25));
    float n1 = dn(vec2((a + rot) * 40.0, r * 16.0), 40.0);
    float n2 = dn(vec2((a + rot * 1.2) * 96.0, r * 42.0), 96.0);
    float streak = smoothstep(0.3, 0.95, n1 * 0.62 + n2 * 0.48);
    vec3 col = mix(vec3(1.0, 0.93, 0.86), vec3(0.95, 0.16, 0.12), smoothstep(0.0, 0.42, u));
    col = mix(col, vec3(0.42, 0.0, 0.05), smoothstep(0.45, 1.0, u));
    float dop = 0.3 + 0.7 * (0.5 + 0.5 * vDop);
    float b = (0.3 + streak * 1.15) * smoothstep(0.0, 0.035, u) * (1.0 - smoothstep(0.55, 1.0, u)) * (1.0 - u * 0.6) * dop * dop * uGain * 1.5;
    float glint = pow(dn(vec2(a * 160.0, r * 60.0 - uTime * 0.4), 160.0), 12.0) * (1.0 - smoothstep(0.4, 1.0, u));
    gl_FragColor = vec4(col * b + prism(a * 3.0 + uTime * 0.05) * glint * 0.7 * uGain, 1.0);
  }
`;

// The lensing ring, always facing the eye: the photon ring hugging the shadow, the disc's far side bent round it above and
// below, a prismatic fringe and a crimson halo; brighter on the side the disc turns toward the eye (`uDop`)
export const LENS_VERT = `
  varying vec2 vXY;
  void main() {
    vXY = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const LENS_FRAG = `
  uniform float uTime;
  uniform float uGain;
  uniform float uDop;
  varying vec2 vXY;
  ${NOISE2}
  void main() {
    float r = length(vXY);
    if (r < 0.96) discard;
    float a = atan(vXY.y, vXY.x);
    float d1 = (r - 1.04) * 20.0;
    float photon = exp(-d1 * d1);
    float d2 = (r - 1.2) * 7.0;
    float side = 0.5 + 0.5 * cos(a - uDop);
    float arc = exp(-d2 * d2) * (0.25 + 0.75 * abs(sin(a))) * (0.5 + side);
    float d3 = (r - 1.1) * 16.0;
    float flick = 0.85 + 0.15 * dn(vec2(a * 3.0 + 10.0, uTime * 2.0), 1000.0);
    float halo = exp(-(r - 1.0) * 3.0) * 0.16;
    vec3 col = vec3(1.0, 0.9, 0.86) * photon * (0.5 + 1.5 * side) * flick
      + vec3(0.95, 0.12, 0.15) * arc * 0.9
      + prism(a / 6.28318 * 2.0 + uTime * 0.04) * exp(-d3 * d3) * 0.32
      + vec3(0.6, 0.02, 0.08) * halo;
    gl_FragColor = vec4(col * uGain * (1.0 - smoothstep(2.2, 3.0, r)), 1.0);
  }
`;

// The well of dust: a funnel of dust churning down from the vortex to the ground, following the vortex chain (`uPath`, top to
// ground) and flaring out where it meets the earth; denser at its silhouette, lit crimson from the core above. Premultiplied.
export const FUNNEL_VERT = `
  uniform vec3 uPath[8];
  uniform float uTime;
  varying vec2 vUv;
  varying float vFace;
  vec3 pathAt(float t) {
    float f = t * 7.0;
    int i = int(min(floor(f), 6.0));
    float s = f - float(i);
    vec3 p0 = uPath[max(i - 1, 0)];
    vec3 p1 = uPath[i];
    vec3 p2 = uPath[i + 1];
    vec3 p3 = uPath[min(i + 2, 7)];
    return 0.5 * (2.0 * p1 + (p2 - p0) * s + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * s * s + (3.0 * p1 - p0 - 3.0 * p2 + p3) * s * s * s);
  }
  void main() {
    float t = clamp(0.5 - position.y, 0.0, 1.0);
    float ang = atan(position.z, position.x);
    float rad = mix(1.05, 0.32, pow(t, 0.9)) + smoothstep(0.78, 1.0, t) * 1.5;
    rad *= 1.0 + 0.07 * sin(t * 20.0 - uTime * 3.0 + ang * 3.0);
    vec3 p = pathAt(t) + vec3(position.x, 0.0, position.z) * rad;
    vUv = vec2(ang / 6.28318 + 0.5, t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 nv = (modelViewMatrix * vec4(position.x, 0.0, position.z, 0.0)).xyz;
    float nl = length(nv);
    float ml = length(mv.xyz);
    vFace = nl > 1e-5 && ml > 1e-5 ? abs(dot(nv / nl, -mv.xyz / ml)) : 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;
export const FUNNEL_FRAG = `
  uniform float uTime;
  uniform float uGain;
  varying vec2 vUv;
  varying float vFace;
  ${NOISE2}
  void main() {
    float n = dn(vec2(vUv.x * 20.0 + vUv.y * 6.0 - uTime * 0.9, vUv.y * 10.0 - uTime * 1.6), 20.0) * 0.6
      + dn(vec2(vUv.x * 44.0 + vUv.y * 14.0 - uTime * 1.5, vUv.y * 22.0 - uTime * 2.4), 44.0) * 0.4;
    float dens = 0.18 + smoothstep(0.2, 0.8, n) * 0.82;
    float edge = mix(0.55, 1.0, 1.0 - vFace);
    // Clumps of dust torn along by the spin, so it never reads as a smooth shell
    float clump = smoothstep(0.3, 0.75, dn(vec2(vUv.x * 6.0 + vUv.y * 3.0 - uTime * 0.5, vUv.y * 3.5 - uTime * 0.8), 6.0));
    dens *= 0.2 + 0.8 * clump;
    float vfade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
    float a = clamp(dens * edge * vfade * uGain * 0.55, 0.0, 1.0);
    float top = max(1.0 - vUv.y, 0.0);
    // Pale dust lit from the side, its upper reach crimson from the core, its silhouette catching a cold rim
    vec3 col = mix(vec3(0.3, 0.24, 0.23), vec3(0.5, 0.4, 0.37), n) + vec3(0.6, 0.05, 0.07) * top * top * 0.8 + vec3(0.18, 0.2, 0.28) * (1.0 - vFace) * 0.5;
    gl_FragColor = vec4(col * a, a);
  }
`;
