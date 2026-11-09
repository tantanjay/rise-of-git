import * as THREE from "three";
import { MOVE, PartOpts, TAU, V3, rubble } from "./heroKit";
import { HeroCtx } from "./heroLandmarks";
import { BossCtx, BonePose, Pose } from "./heroRig";

/* ------------------------------------------------------------------------- */
/* Pieces the world bosses are built from (hand-built rigged heroes)          */
/* ------------------------------------------------------------------------- */

const Y = new THREE.Vector3(0, 1, 0);

/** A quaternion turning +y onto `dir` */
export const toward = (dir: V3) => new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(...dir).normalize());

/** An ellipsoid: a ball `radii` across (a round body, a head, a muscle), turned `rot` */
export function blob(c: HeroCtx, bucket: string, at: V3, radii: V3, o: PartOpts & { rot?: V3; wd?: number; hd?: number } = {}) {
  c.k.add(bucket, new THREE.SphereGeometry(1, o.wd ?? 14, o.hd ?? 10), at, o.rot, { ...o, scale: radii });
}

/** A tapered round segment from one point to another (a limb, an arm, a neck), with a ball at its root so a chain reads as one */
export function seg(c: HeroCtx, bucket: string, from: V3, to: V3, r0: number, r1: number, o: PartOpts & { seg?: number; cap?: boolean } = {}) {
  const n = o.seg ?? 10;
  c.k.along(bucket, from, to, 0, { ...o, geo: new THREE.CylinderGeometry(r1, r0, 1, n, 1, true) });
  if (o.cap !== false) c.k.add(bucket, new THREE.SphereGeometry(r0 * 1.01, Math.max(6, n - 2), 4), from, undefined, o);
}

/** A cone from `base` pointing along `dir` (a spike, a claw, a fang, a horn) */
export function spike(c: HeroCtx, bucket: string, base: V3, dir: V3, r: number, len: number, o: PartOpts & { seg?: number } = {}) {
  const d = new THREE.Vector3(...dir).normalize();
  c.k.add(bucket, new THREE.ConeGeometry(r, len, o.seg ?? 6), [base[0] + d.x * len * 0.5, base[1] + d.y * len * 0.5, base[2] + d.z * len * 0.5], undefined, { ...o, quat: toward(dir) });
}

/** A horn or claw that curves: cone segments bending a little more each step */
export function hook(c: HeroCtx, bucket: string, base: V3, dir: V3, bend: V3, r: number, len: number, steps: number, o: PartOpts) {
  let p = new THREE.Vector3(...base);
  const d = new THREE.Vector3(...dir).normalize();
  const b = new THREE.Vector3(...bend);
  for (let i = 0; i < steps; i++) {
    const r0 = r * (1 - i / steps);
    const r1 = r * (1 - (i + 1) / steps);
    const q = p.clone().addScaledVector(d, len / steps);
    if (i === steps - 1) c.k.add(bucket, new THREE.ConeGeometry(r0, len / steps, 6), p.clone().lerp(q, 0.5).toArray() as V3, undefined, { ...o, quat: toward(d.toArray() as V3) });
    else seg(c, bucket, p.toArray() as V3, q.toArray() as V3, r0, r1, { ...o, seg: 6 });
    p = q;
    d.add(b).normalize();
  }
}

/** A point on an ellipsoid (centre, radii, turn) in the direction `dir` of its own frame, and the outward normal there */
export function onBlob(at: V3, radii: V3, rot: V3, dir: V3): { p: V3; n: V3 } {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
  const d = new THREE.Vector3(...dir).normalize();
  const p = new THREE.Vector3(d.x * radii[0], d.y * radii[1], d.z * radii[2]).applyQuaternion(q).add(new THREE.Vector3(...at));
  const n = new THREE.Vector3(d.x / radii[0], d.y / radii[1], d.z / radii[2]).normalize().applyQuaternion(q);
  return { p: p.toArray() as V3, n: n.toArray() as V3 };
}

/** A flat round thing lying on a surface (a sucker, a spot, a scale, a stud): `r` across, `h` thick, facing `n` */
export function stud(c: HeroCtx, bucket: string, at: V3, n: V3, r: number, h: number, o: PartOpts & { wd?: number } = {}) {
  c.k.add(bucket, new THREE.SphereGeometry(1, o.wd ?? 6, 3), at, undefined, { ...o, quat: toward(n), scale: [r, h, r] });
}

/**
 * A chain of bones out along +z of the current frame (a tentacle, a neck, a tail, a worm): segment j is `lens[j]` long,
 * pitched `pitch[j]` (down when positive), `radii[j]` → `radii[j + 1]` thick. Bone `${name}${j}` pivots at its root, so
 * turning it bends everything past it. `deco` adds what rides a segment (suckers, spines, scales), `tip` what rides the last.
 */
export function chainBones(
  c: BossCtx,
  name: string,
  start: V3,
  lens: number[],
  pitch: number[],
  radii: number[],
  o: PartOpts & { bucket: string; seg?: number; yaw?: number[]; endCap?: boolean },
  deco?: (j: number, from: V3, to: V3, r0: number, r1: number, dir: V3) => void,
  tip?: (at: V3, dir: V3, r: number) => void
): V3[] {
  const pts: V3[] = [start];
  const dirs: V3[] = [];
  for (let j = 0; j < lens.length; j++) {
    const th = pitch[j];
    const yw = o.yaw?.[j] ?? 0;
    const d: V3 = [Math.sin(yw) * Math.cos(th), -Math.sin(th), Math.cos(yw) * Math.cos(th)];
    dirs.push(d);
    const p = pts[j];
    pts.push([p[0] + d[0] * lens[j], p[1] + d[1] * lens[j], p[2] + d[2] * lens[j]]);
  }
  const step = (j: number) => {
    c.bone(`${name}${j}`, pts[j], () => {
      seg(c, o.bucket, pts[j], pts[j + 1], radii[j], radii[j + 1], { ...o, seg: o.seg });
      deco?.(j, pts[j], pts[j + 1], radii[j], radii[j + 1], dirs[j]);
      if (j + 1 < lens.length) step(j + 1);
      else {
        if (o.endCap !== false) c.k.add(o.bucket, new THREE.SphereGeometry(radii[j + 1] * 1.01, Math.max(6, (o.seg ?? 10) - 2), 4), pts[j + 1], undefined, o);
        tip?.(pts[j + 1], dirs[j], radii[j + 1]);
      }
    });
  };
  step(0);
  return pts;
}

/**
 * A chain of bones through given points (a tail coiled round a rock, a strand of hair): bone `${name}${j}` pivots at
 * `pts[j]` and carries the segment to `pts[j + 1]`, `radii[j]` → `radii[j + 1]` thick
 */
export function pathBones(
  c: BossCtx,
  name: string,
  pts: V3[],
  radii: number[],
  o: PartOpts & { bucket: string; seg?: number },
  deco?: (j: number, from: V3, to: V3, r0: number, r1: number, dir: V3) => void,
  tip?: (at: V3, dir: V3, r: number) => void
) {
  const step = (j: number) => {
    const from = pts[j];
    const to = pts[j + 1];
    const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize().toArray() as V3;
    c.bone(`${name}${j}`, from, () => {
      seg(c, o.bucket, from, to, radii[j], radii[j + 1], o);
      deco?.(j, from, to, radii[j], radii[j + 1], d);
      if (j + 2 < pts.length) step(j + 1);
      else {
        c.k.add(o.bucket, new THREE.SphereGeometry(radii[j + 1] * 1.01, Math.max(6, (o.seg ?? 10) - 2), 4), to, undefined, o);
        tip?.(to, d, radii[j + 1]);
      }
    });
  };
  step(0);
}

/** A turn whose +y is `up` and +z runs along `along` (a plate lying on a body, a feather along a wing) */
export function orient(up: V3, along: V3): THREE.Quaternion {
  const y = new THREE.Vector3(...up).normalize();
  const z0 = new THREE.Vector3(...along);
  const x = new THREE.Vector3().crossVectors(y, z0).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** A plate lying on a body: `w` across, `h` thick, `l` long, its back toward `up`, running along `along` */
export function plate(c: HeroCtx, bucket: string, at: V3, up: V3, along: V3, w: number, h: number, l: number, o: PartOpts & { wd?: number } = {}) {
  c.k.add(bucket, new THREE.SphereGeometry(1, o.wd ?? 10, 6), at, undefined, { ...o, quat: orient(up, along), scale: [w, h, l] });
}

/**
 * A membrane stretched between a row of roots and a row of tips (a fin, a frill, a webbed wing): one strip of quads,
 * u along the row and v from root (0) to tip (1), so cloth surfaces (and tatters) read on it
 */
export function membrane(c: HeroCtx, bucket: string, roots: V3[], tips: V3[], o: PartOpts & { rows?: number } = {}) {
  const rows = o.rows ?? 3;
  const n = roots.length;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < n; i++)
    for (let r = 0; r <= rows; r++) {
      const f = r / rows;
      pos.push(roots[i][0] + (tips[i][0] - roots[i][0]) * f, roots[i][1] + (tips[i][1] - roots[i][1]) * f, roots[i][2] + (tips[i][2] - roots[i][2]) * f);
      uv.push(i / (n - 1), f);
    }
  const index: number[] = [];
  for (let i = 0; i < n - 1; i++)
    for (let r = 0; r < rows; r++) {
      const a = i * (rows + 1) + r;
      const b = (i + 1) * (rows + 1) + r;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // Cloth reads its weave and ragged edge from u, v (v 1 at the root, as a banner at its pole)
  const surf = o.surf ?? { fn: () => [0, 0, 0] as V3 };
  const uvAttr = g.attributes.uv as THREE.BufferAttribute;
  let k = 0;
  c.k.add(bucket, g, [0, 0, 0], undefined, {
    ...o,
    surf: {
      fn: (p, nn) => {
        const s0 = surf.fn(p, nn);
        const u = uvAttr.getX(k);
        const v = uvAttr.getY(k);
        k++;
        return [u, 1 - v, s0[2]];
      }
    }
  });
}

/** A pool of dark water round a sea boss: the water, foam rings swelling and bobbing, rocks breaking it */
export function seaPool(c: HeroCtx, r: number, water: string, foam: string, rocks: Array<[number, number, number]>) {
  c.k.add("water", new THREE.CylinderGeometry(r, r * 1.02, 0.14, 48), [0, 0.07, 0], undefined, { color: water });
  // Broken arcs of foam swelling round the body and bobbing further out
  for (let i = 0; i < 9; i++) {
    const out = i >= 4;
    const a0 = (i / (out ? 5 : 4)) * TAU + (out ? 0.3 : 0.9);
    const rr = r * (out ? 0.74 + (i % 3) * 0.06 : 0.48 + (i % 2) * 0.07);
    c.k.move(out ? { kind: MOVE.bob, amp: 0.025, speed: 1.4 + i * 0.13, phase: i * 1.7 } : { kind: MOVE.beat, amp: 0.07, speed: 1.1, phase: i * 1.6, pivot: [0, 0.17, 0] }, () => {
      c.k.add("matte", new THREE.TorusGeometry(rr, 0.03, 4, 10, TAU / (out ? 9 : 6)), [0, 0.17, 0], [Math.PI / 2, 0, a0], { color: foam, scale: [1, 1, 0.5] });
    });
  }
  rocks.forEach(([x, z, s], i) => c.k.add("rock", rubble(s, 31 + i), [x, s * 0.45, z], [0, i * 1.3, 0], { color: i % 2 ? "#3f3f46" : "#52525b" }));
}

/* ------------------------------ poses ------------------------------ */

/** A pose for every bone of a chain: `f(j)` for segment j (missing ones left out) */
export function chainPose(name: string, n: number, f: (j: number) => BonePose | null): Pose {
  const p: Pose = {};
  for (let j = 0; j < n; j++) {
    const b = f(j);
    if (b) p[`${name}${j}`] = b;
  }
  return p;
}

/** Several poses into one (later ones win per bone) */
export const merge = (...ps: Pose[]): Pose => Object.assign({}, ...ps);

/** Bone lags for a chain: segment j trails `per` × j seconds */
export function chainLag(name: string, n: number, per: number, from = 0): Record<string, number> {
  const out: Record<string, number> = {};
  for (let j = 0; j < n; j++) out[`${name}${j}`] = from + per * j;
  return out;
}

/** Springs for a chain's segments from `from` on: stiffness `k` (lower is looser) */
export function chainSprings(name: string, n: number, k: number, from = 0): Record<string, number> {
  const out: Record<string, number> = {};
  for (let j = from; j < n; j++) out[`${name}${j}`] = k;
  return out;
}
