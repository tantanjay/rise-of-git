import { Rng } from "@/utils/random";
import { Builder, Shape } from "@/components/3d/city/parts";

/*
 * Small pieces of the HD model kit for Builder models (spawnModels.ts, npcs.ts): parts laid between two points, tails
 * that bend and whip, bones and skulls, rings of parts, lantern frames, spoked wheels and spilled coins. Each takes an `add` (a Builder's own, or a kit's scaled one) and local points,
 * so it works at any scale and rides whatever the caller's options say (a hand, a head, `hd: true`).
 */

export type AddOpts = NonNullable<Parameters<Builder["add"]>[8]>;
export type Add = (shape: Shape, x: number, y0: number, z: number, w: number, h: number, d: number, color: string, o?: AddOpts) => void;
export type V3 = [number, number, number];

/**
 * Adds a part lying from local point `a` to `b` (its +y along a → b; for a taper, cone or blade `a` is its foot and `b`
 * its tip), `w` × `d` thick: grips that pass through a fist, shafts, blades and clubs held at an angle
 */
export function along(add: Add, shape: Shape, a: V3, b: V3, w: number, d: number, color: string, o: AddOpts = {}) {
  const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(dx, dy, dz);
  // Euler YXZ: rz tips +y toward x, then rx toward z
  const rz = -Math.asin(Math.max(-1, Math.min(1, dx / len)));
  const rx = Math.atan2(dz / len, dy / len);
  add(shape, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - len / 2, (a[2] + b[2]) / 2, w, len, d, color, { ...o, rx, rz });
}

export interface TailLook {
  /** Length along its curve, thickness at the root and at the tip */
  len: number;
  w0: number;
  w1: number;
  color: string;
  /** The last segment's colour (a pale brush, a dark tuft); default `color` */
  tip?: string;
  /** Segments (default 4) */
  n?: number;
  /** Angle below level as it leaves the root (radians; negative rises) */
  pitch?: number;
  /** How far it curls along its length (radians; negative curls up) */
  curl?: number;
  /** How far it is turned to one side (radians) */
  yaw?: number;
  /** The first segment's lag (s, default 0.14) and how much more each next one lags (default 0.07) */
  lag?: number;
  step?: number;
  /** Damping of the trail (0 loose … 1 stiff, default 0.25) */
  damp?: number;
  /** Segment shape (default `capsule`: overlapping round ends blend into one smooth tail) */
  shape?: Shape;
}

/**
 * A tail of segments from `root` (local) running backward (−z) and curving along its length. Every segment trails the
 * body from the root, each a little further behind, so the tail bends and whips through a turn and its idle wag
 * ripples down it, instead of swinging as one stiff stick. `o` rides every segment (`hd: true`, `mat`, a `pose`).
 * Returns where it ends (`tip`), the way its last segment points (`dir`) and that segment's trail, so a stinger or a
 * tuft can ride on its end.
 */
export function tail(add: Add, root: V3, look: TailLook, o: AddOpts = {}): { tip: V3; dir: V3; trail: AddOpts["trail"] } {
  const n = look.n ?? 4;
  const seg = look.len / n;
  let pitch = look.pitch ?? 0.4;
  const yaw = look.yaw ?? 0;
  let p = root;
  let dir: V3 = [0, 0, -1];
  let trail: AddOpts["trail"] = undefined;
  const w0Of = (i: number) => look.w0 + (look.w1 - look.w0) * (n > 1 ? i / (n - 1) : 0);
  for (let i = 0; i < n; i++) {
    dir = [-Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
    const q: V3 = [p[0] + dir[0] * seg, p[1] + dir[1] * seg, p[2] + dir[2] * seg];
    // Each segment starts a little inside the last, so the chain stays joined as it bends
    // Each segment reaches half a segment back into the last (a capsule's round ends then blend into one smooth tail)
    const back = i === 0 ? 0 : seg * 0.5 + w0Of(i) * 0.5;
    const from: V3 = [p[0] - dir[0] * back, p[1] - dir[1] * back, p[2] - dir[2] * back];
    const to: V3 = [q[0] + dir[0] * w0Of(i) * 0.3, q[1] + dir[1] * w0Of(i) * 0.3, q[2] + dir[2] * w0Of(i) * 0.3];
    const w = w0Of(i);
    const color = i === n - 1 && look.tip ? look.tip : look.color;
    trail = { lag: Math.min((look.lag ?? 0.14) + i * (look.step ?? 0.07), 0.45), damp: look.damp ?? 0.25, root };
    along(add, look.shape ?? "capsule", from, to, w, w, color, { ...o, trail });
    p = q;
    pitch += (look.curl ?? 0) / n;
  }
  return { tip: p, dir, trail };
}

/** A long bone from `a` to `b`: a shaft with a knobbed head at each end */
export function bone(add: Add, a: V3, b: V3, w: number, color: string, o: AddOpts = {}) {
  along(add, "capsule", a, b, w, w, color, o);
  const [dx, , dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(dx, dz) || 1;
  // The knobs sit side by side across the bone, flat on the ground
  const [px, pz] = [(-dz / l) * w * 0.55, (dx / l) * w * 0.55];
  for (const e of [a, b])
    for (const k of [-1, 1]) {
      const s = w * 1.25;
      add("sphere", e[0] + px * k, e[1] - s / 2, e[2] + pz * k, s, s, s, color, o);
    }
}

/**
 * A skull `size` across at local (x, y0, z), facing `ry`: a long rounded cranium flowing into the face, brow ridge over
 * deep eye sockets, a nose hole, cheekbones and a jaw of teeth
 */
export function skull(add: Add, x: number, y0: number, z: number, size: number, color: string, ry = 0, o: AddOpts = {}) {
  const s = size;
  const at = (f: number, side = 0): [number, number] => [x + Math.sin(ry) * f + Math.cos(ry) * side, z + Math.cos(ry) * f - Math.sin(ry) * side];
  const r = { ...o, ry };
  const [cx, cz] = at(-0.08 * s);
  add("sphere", cx, y0 + 0.14 * s, cz, 0.78 * s, 0.7 * s, 0.98 * s, color, r); // cranium, long front to back
  const [fx, fz] = at(0.3 * s);
  add("egg", fx, y0 + 0.02 * s, fz, 0.66 * s, 0.6 * s, 0.56 * s, color, r); // face
  const [bx, bz] = at(0.42 * s);
  add("capsule", bx, y0 + 0.44 * s, bz, 0.6 * s, 0.1 * s, 0.12 * s, color, r); // brow ridge
  for (const side of [-1, 1]) {
    const [ex, ez] = at(0.52 * s, side * 0.16 * s);
    add("sphere", ex, y0 + 0.3 * s, ez, 0.15 * s, 0.13 * s, 0.1 * s, "#292524", r); // eye socket
    const [kx, kz] = at(0.36 * s, side * 0.3 * s);
    add("sphere", kx, y0 + 0.18 * s, kz, 0.16 * s, 0.14 * s, 0.24 * s, color, r); // cheekbone
  }
  const [nx, nz] = at(0.58 * s);
  add("drop", nx, y0 + 0.16 * s, nz, 0.09 * s, 0.13 * s, 0.06 * s, "#1c1917", r); // nose hole
  const [jx, jz] = at(0.3 * s);
  add("egg", jx, y0 - 0.06 * s, jz, 0.56 * s, 0.16 * s, 0.5 * s, color, r); // jaw
  const [tx, tz] = at(0.55 * s);
  add("box", tx, y0 + 0.04 * s, tz, 0.34 * s, 0.07 * s, 0.05 * s, "#e7e5e4", r); // teeth
}

/**
 * Parts laid end to end round an arc (a snare's noose, a trap's jaw, a ring of web silk): centre `c`, in the plane of
 * the unit axes `u` and `v`, radius `r` (or its two radii along u and v), from angle `a0` to `a1` in `n` segments
 * `w` thick (capsules by default, so the joints stay round)
 */
export function arc(add: Add, c: V3, u: V3, v: V3, r: number | [number, number], a0: number, a1: number, n: number, w: number, color: string, o: AddOpts = {}, shape: Shape = "capsule") {
  const [ru, rv] = typeof r === "number" ? [r, r] : r;
  const at = (a: number): V3 => [0, 1, 2].map((k) => c[k] + u[k] * Math.cos(a) * ru + v[k] * Math.sin(a) * rv) as V3;
  for (let i = 0; i < n; i++) along(add, shape, at(a0 + ((a1 - a0) * i) / n), at(a0 + ((a1 - a0) * (i + 1)) / n), w, w, color, o);
}

/** HD: a lantern's frame round its light (centre x, z; standing from y0, `w` wide and `h` tall): base, corner posts, a cap and a ring */
export function lanternFrame(add: Add, x: number, y0: number, z: number, w: number, h: number, iron: string, o: AddOpts) {
  const p: AddOpts = { ...o, hd: true, mat: o.mat ?? "dull" };
  add("box", x, y0 - 0.02, z, w + 0.04, 0.03, w + 0.04, iron, p);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add("cyl", x + (sx * w) / 2, y0, z + (sz * w) / 2, 0.022, h, 0.022, iron, p);
  add("cone", x, y0 + h, z, w + 0.06, h * 0.45, w + 0.06, iron, p);
  add("sphere", x, y0 + h * 1.42, z, 0.045, 0.045, 0.045, iron, p);
}

/**
 * A spoked wheel centred on `c` in the plane of the unit axes `u` and `v` (its axle across them), `r` to the rim's
 * outside, the rim `w` thick: a rim of segments, a hub and `spokes` spokes. Drawn from angle `a0` to `a1` only, it is a
 * broken wheel (the spokes outside that stretch are gone)
 */
export function wheel(add: Add, c: V3, u: V3, v: V3, r: number, w: number, color: string, o: AddOpts = {}, spokes = 6, a0 = 0, a1 = Math.PI * 2) {
  const n = Math.max(3, Math.round((12 * (a1 - a0)) / (Math.PI * 2)));
  arc(add, c, u, v, r - w / 2, a0, a1, n, w, color, o);
  const ax: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const at = (k: number): V3 => [c[0] + ax[0] * k, c[1] + ax[1] * k, c[2] + ax[2] * k];
  along(add, "cyl", at(-w * 1.1), at(w * 1.1), w * 1.7, w * 1.7, color, o); // hub
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.3;
    if (a < a0 || a > a1) continue;
    const e: V3 = [0, 1, 2].map((k) => c[k] + (u[k] * Math.cos(a) + v[k] * Math.sin(a)) * (r - w * 0.8)) as V3;
    along(add, "cyl", c, e, w * 0.5, w * 0.5, color, o);
  }
}

/**
 * Coins spilled on the ground round (x, z) from height y0, within `spread`: little stacks of thin coins `size` across
 * and strays tipped against them. `rng` is the caller's own (an HD-only rng, never the model's)
 */
export function coins(add: Add, rng: Rng, x: number, y0: number, z: number, spread: number, n: number, color: string, o: AddOpts = {}, size = 0.14) {
  const t = size * 0.17;
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * spread;
    const [cx, cz] = [x + Math.cos(a) * d, z + Math.sin(a) * d];
    const stack = rng() < 0.4 ? 1 + Math.floor(rng() * 4) : 1;
    for (let k = 0; k < stack; k++) add("cyl", cx + (rng() - 0.5) * size * 0.2, y0 + k * t, cz + (rng() - 0.5) * size * 0.2, size, t, size, color, o);
    // One tipped against the stack
    if (rng() < 0.5) add("cyl", cx + size * 0.75, y0 + 0.01, cz, size, t, size, color, { ...o, rx: 0.3, rz: 0.35, ry: rng() * 3 });
  }
}
