import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/* ------------------------------------------------------------------------- */
/* The part kit hand-built hero models are made with (Empyrean, landmarks)   */
/* ------------------------------------------------------------------------- */

export type V3 = [number, number, number];
export const TAU = Math.PI * 2;

/** A direction on the ground at angle `a` (x = cos, z = sin), and the turn that faces a part's +z that way */
export const dirXZ = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
export const facing = (a: number) => Math.PI / 2 - a;

/** A deterministic hash of a (rounded) position, so the copies of a vertex on a seam move together */
export function hash3(x: number, y: number, z: number, seed: number): number {
  const s = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719 + seed * 4.1) * 43758.5453;
  return s - Math.floor(s);
}

/** Breaks a cylinder or cone into craggy rock: sides pushed in and out, flat facets. A cap at `keepY` stays flat. */
export function craggy(g: THREE.BufferGeometry, amount: number, seed: number, keepY?: number): THREE.BufferGeometry {
  const out = g.toNonIndexed();
  const pos = out.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (keepY !== undefined && Math.abs(y - keepY) < 1e-4) continue;
    const len = Math.hypot(x, z);
    const push = (hash3(x, y, z, seed) - 0.5) * 2 * amount;
    const nx = len > 1e-4 ? x + (x / len) * push : x;
    const nz = len > 1e-4 ? z + (z / len) * push : z;
    pos.setXYZ(i, nx, y + (hash3(x, y, z, seed + 7) - 0.5) * amount * 0.7, nz);
  }
  out.computeVertexNormals();
  return out;
}

/** A lump of rubble: every corner pushed out or in from the centre */
export function rubble(radius: number, seed: number): THREE.BufferGeometry {
  const out = new THREE.IcosahedronGeometry(radius, 1).toNonIndexed();
  const pos = out.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(0.7 + hash3(v.x, v.y, v.z, seed) * 0.6);
    pos.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  out.computeVertexNormals();
  return out;
}

/* ------------------------------ shapes ------------------------------ */

/** A lancet (pointed Gothic arch) outline, bottom centre at (x0, y0): an equilateral arch over straight jambs */
export function lancetPath<T extends THREE.Path>(p: T, w: number, h: number, x0 = 0, y0 = 0): T {
  const spring = y0 + Math.max(0, h - w * 0.866);
  p.moveTo(x0 - w / 2, y0);
  p.lineTo(x0 + w / 2, y0);
  p.lineTo(x0 + w / 2, spring);
  p.absarc(x0 - w / 2, spring, w, 0, Math.PI / 3, false);
  p.absarc(x0 + w / 2, spring, w, (2 * Math.PI) / 3, Math.PI, false);
  p.lineTo(x0 - w / 2, y0);
  return p;
}

/** `curve`: segments per arc (fewer on a model bound by its vertices) */
export const extrude = (shape: THREE.Shape, depth: number, curve = 5) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: curve });

/** A lancet pane (its face toward +z, from z 0 to `depth`) */
export const lancetGeo = (w: number, h: number, depth: number, curve = 5) => extrude(lancetPath(new THREE.Shape(), w, h), depth, curve);

/** A lancet frame: the outline `f` wider than the pane, the pane's shape cut out of it */
export function lancetFrameGeo(w: number, h: number, f: number, depth: number, curve = 5) {
  const s = lancetPath(new THREE.Shape(), w + f * 2, h + f, 0, -0.001);
  s.holes.push(lancetPath(new THREE.Path(), w, h));
  return extrude(s, depth, curve);
}

/** A gable end: a triangle `w` wide and `h` high, `depth` thick (toward +z) */
export function gableGeo(w: number, h: number, depth: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  return extrude(s, depth);
}

/* ------------------------------ the part kit ------------------------------ */

/**
 * What a part's surface is: the per-vertex `aSurf` (u, v, kind) the materials read, worked out in the part's own space
 * before it is placed. `period` is set for u that wraps round a part (a seam's triangles are unwrapped).
 */
export interface Surf {
  fn: (p: THREE.Vector3, n: THREE.Vector3) => V3;
  period?: number;
}
/** Angle round a cylinder's axis as three.js lays its segments (0 on +z, toward +x) */
export const thetaOf = (x: number, z: number) => {
  const t = Math.atan2(x, z);
  return t < 0 ? t + TAU : t;
};

export interface PartOpts {
  surf?: Surf;
  color?: string;
  /** Multiplies the colour (a glow brighter than white) */
  bright?: number;
  scale?: V3;
  quat?: THREE.Quaternion;
}

/**
 * How a group of parts moves on the GPU (a kit made with `motion`): every vertex carries its motion, so moving parts
 * merge into the same draw as the static ones. `pivot` and `axis` are in the frame the motion is declared in.
 *  - spin: turns about `axis` through `pivot` at `speed` rad/s (`amp`: a bob up and down)
 *  - sway: leans in the wind about `pivot`, `amp` per unit above it (below it when negative: a hanging thing)
 *  - flutter: cloth; waves along `axis` (its facing), more the farther from `pivot` (where it is made fast)
 *  - bob: rides up and down `axis` by `amp`
 *  - beat: swells about `pivot` by `amp` on a thump
 *  - pulse: stands still; a glow swells and fades by `amp`
 *  - swing: rocks about `axis` through `pivot` by `amp` rad (a bell)
 */
export const MOVE = { spin: 1, sway: 2, flutter: 3, bob: 4, beat: 5, pulse: 6, swing: 7 } as const;
export interface Move {
  kind: (typeof MOVE)[keyof typeof MOVE];
  speed?: number;
  amp?: number;
  phase?: number;
  pivot?: V3;
  axis?: V3;
}

interface PlacedMove {
  m: [number, number, number, number];
  pivot: THREE.Vector3;
  axis: THREE.Vector3;
}

const KEEP = ["position", "normal", "uv", "aSurf", "color", "aMove", "aPivot", "aAxis", "aBone"];

/** Collects placed parts per material, so every material is one merged draw however much detail it carries */
export class Kit {
  buckets = new Map<string, THREE.BufferGeometry[]>();
  /** Raises and lowers everything added from now on (a floating model; a kit made with `motion`) */
  float = 0;
  /** The bone everything added from now on rides (a kit made with `rigged`: see `heroRig.ts`) */
  bone = 0;
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private moves: PlacedMove[] = [];
  private p = new THREE.Vector3();
  private n = new THREE.Vector3();
  private c = new THREE.Color();

  /**
   * `motion`: every vertex carries a GPU motion (`aMove`, `aPivot`, `aAxis`; see `MOVE`). `indexed`: parts keep their
   * own index, so a corner shared by several triangles is shaded once (what a model bound by its vertices wants).
   * `rigged`: every vertex carries the bone it rides (`aBone`), posed on the CPU (`heroRig.ts`)
   */
  constructor(
    readonly motion = false,
    readonly indexed = false,
    readonly rigged = false
  ) {}

  /** The current frame (the transform `at` / `frame` have set up) */
  current(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  /** Places everything `body` adds at `pos`, turned `rotY` */
  at(pos: V3, rotY: number, body: () => void) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(1, 1, 1));
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m));
    body();
    this.stack.pop();
  }

  /** Places everything `body` adds through a full transform (turned any way, scaled) */
  frame(pos: V3, rot: V3, scale: number, body: () => void) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(scale, scale, scale));
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m));
    body();
    this.stack.pop();
  }

  /** Everything `body` adds moves this way (the innermost motion wins) */
  move(mv: Move, body: () => void) {
    const top = this.stack[this.stack.length - 1];
    const pivot = new THREE.Vector3(...(mv.pivot ?? [0, 0, 0])).applyMatrix4(top);
    const axis = new THREE.Vector3(...(mv.axis ?? [0, 1, 0])).transformDirection(top);
    this.moves.push({ m: [mv.kind, mv.speed ?? 1, mv.amp ?? 0, mv.phase ?? 0], pivot, axis });
    body();
    this.moves.pop();
  }

  /** A point in the kit's space (for effects placed beside the parts: sparks, smoke) */
  point(p: V3): V3 {
    const v = new THREE.Vector3(...p).applyMatrix4(this.stack[this.stack.length - 1]);
    return [v.x, v.y, v.z];
  }

  add(bucket: string, g: THREE.BufferGeometry, pos: V3, rot: V3 = [0, 0, 0], o: PartOpts = {}) {
    // A part whose u wraps round it is unrolled, so its seam's triangles can be lifted by a turn (below)
    const keep = this.indexed && g.index && !o.surf?.period;
    const out = g.index && !keep ? g.toNonIndexed() : g.clone();
    if (!out.attributes.normal) out.computeVertexNormals();
    const count = out.attributes.position.count;
    if (!out.attributes.uv) out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    const pa = out.attributes.position as THREE.BufferAttribute;
    const na = out.attributes.normal as THREE.BufferAttribute;
    const surf = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    this.c.set(o.color ?? "#ffffff").multiplyScalar(o.bright ?? 1);
    for (let i = 0; i < count; i++) {
      if (o.surf) {
        const s = o.surf.fn(this.p.fromBufferAttribute(pa, i), this.n.fromBufferAttribute(na, i));
        surf.set(s, i * 3);
      }
      col[i * 3] = this.c.r;
      col[i * 3 + 1] = this.c.g;
      col[i * 3 + 2] = this.c.b;
    }
    // A triangle across a round part's seam would smear its u over the whole turn: lift its low corners by a turn
    const period = o.surf?.period;
    if (period) {
      for (let t = 0; t < count; t += 3) {
        const us = [surf[t * 3], surf[t * 3 + 3], surf[t * 3 + 6]];
        if (Math.max(...us) - Math.min(...us) > period / 2) for (let k = 0; k < 3; k++) if (us[k] < period / 2) surf[(t + k) * 3] += period;
      }
    }
    out.setAttribute("aSurf", new THREE.BufferAttribute(surf, 3));
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (this.motion) {
      const mv = this.moves[this.moves.length - 1];
      const move = new Float32Array(count * 4);
      const pivot = new Float32Array(count * 3);
      const axis = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        if (mv) {
          move.set(mv.m, i * 4);
          pivot.set([mv.pivot.x, mv.pivot.y, mv.pivot.z], i * 3);
          axis.set([mv.axis.x, mv.axis.y, mv.axis.z], i * 4);
        }
        axis[i * 4 + 3] = this.float;
      }
      out.setAttribute("aMove", new THREE.BufferAttribute(move, 4));
      out.setAttribute("aPivot", new THREE.BufferAttribute(pivot, 3));
      out.setAttribute("aAxis", new THREE.BufferAttribute(axis, 4));
    }
    if (this.rigged) out.setAttribute("aBone", new THREE.BufferAttribute(new Float32Array(count).fill(this.bone), 1));
    for (const name of Object.keys(out.attributes)) if (!KEEP.includes(name)) out.deleteAttribute(name);
    // An indexed kit merges indexed parts only: an unrolled part gets an index of its own corners in order
    if (this.indexed && !out.index) out.setIndex(Array.from({ length: count }, (_, i) => i));
    const q = o.quat ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...(o.scale ?? [1, 1, 1])));
    out.applyMatrix4(this.stack[this.stack.length - 1].clone().multiply(local));
    let list = this.buckets.get(bucket);
    if (!list) this.buckets.set(bucket, (list = []));
    list.push(out);
  }

  /** A box (or another shape along +y) laid from one point to another; `t` as [w, d] lays a flat box (thin on d) */
  along(bucket: string, from: V3, to: V3, t: number | [number, number], o: PartOpts & { geo?: THREE.BufferGeometry } = {}) {
    const a = new THREE.Vector3(...from);
    const d = new THREE.Vector3(...to).sub(a);
    const len = d.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const mid = a.addScaledVector(d, 0.5);
    const [tw, td] = typeof t === "number" ? [t, t] : t;
    this.add(bucket, o.geo ?? new THREE.BoxGeometry(tw, len, td), [mid.x, mid.y, mid.z], undefined, { ...o, quat, scale: o.geo ? [1, len, 1] : undefined });
  }

  /** One merged geometry per material */
  bake(): Record<string, THREE.BufferGeometry> {
    const out: Record<string, THREE.BufferGeometry> = {};
    for (const [k, list] of this.buckets) out[k] = mergeGeometries(list, false)!;
    return out;
  }
}

/* ------------------------------ shared look ------------------------------ */

/** A soft round glow for additive sprites */
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.55)");
  g.addColorStop(0.5, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Lights the gold and marble with a soft studio reflection while the showcase is open */
export function useStudioReflections(intensity: number, enabled = true) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!enabled) return;
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const prev = scene.environment;
    const prevIntensity = scene.environmentIntensity;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = prev;
      scene.environmentIntensity = prevIntensity;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene, intensity, enabled]);
}
