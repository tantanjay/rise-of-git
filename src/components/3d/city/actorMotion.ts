import * as THREE from "three";
import { Actor } from "./parts";

/*
 * Where every actor is and how it carries itself at time t (Actors draws it in Normal and HD from the same pose): its
 * path, its body's pitch and roll, a bird's wingbeat, and (for HD) its stride and what its arms are doing.
 */
const VISIT_STAY = 4.5; // seconds spent before the landmark
const VISIT_REST = 2; // seconds resting at the start before setting off again

/**
 * Landmark visit: walk to (x2, z2), stand facing the landmark (`yaw`) and perform the gesture
 * (bow, lean back to look up, or look around admiring), walk back, rest, repeat.
 */
function visitPose(a: Actor, t: number) {
  const dx = (a.x2 ?? a.x) - a.x;
  const dz = (a.z2 ?? a.z) - a.z;
  const len = Math.max(0.5, Math.hypot(dx, dz));
  const walk = len / a.speed;
  const cycle = walk * 2 + VISIT_STAY + VISIT_REST;
  const u = (((t + a.phase * 13) % cycle) + cycle) % cycle;
  const outYaw = Math.atan2(dx, dz);
  const bob = (f: number) => a.y + Math.abs(Math.sin(t * 9 + a.phase * 7)) * 0.05 * (f > 0 && f < 1 ? 1 : 0);
  if (u < walk) {
    const f = u / walk;
    return { x: a.x + dx * f, y: bob(f), z: a.z + dz * f, yaw: outYaw, pitch: 0, roll: 0 };
  }
  if (u < walk + VISIT_STAY) {
    const s = u - walk;
    let pitch = 0;
    let yaw = a.yaw;
    if (a.gesture === "bow") pitch = s > 0.4 && s < 1.8 ? Math.sin((Math.PI * (s - 0.4)) / 1.4) * 0.42 : 0;
    else if (a.gesture === "lookUp") pitch = -0.2 * Math.min(1, s / 0.6, (VISIT_STAY - s) / 0.6);
    else yaw += Math.sin(s * 1.6) * 0.35; // admire: look around
    return { x: a.x + dx, y: a.y, z: a.z + dz, yaw, pitch, roll: 0 };
  }
  if (u < walk * 2 + VISIT_STAY) {
    const f = 1 - (u - walk - VISIT_STAY) / walk;
    return { x: a.x + dx * f, y: bob(f), z: a.z + dz * f, yaw: outYaw + Math.PI, pitch: 0, roll: 0 };
  }
  return { x: a.x, y: a.y, z: a.z, yaw: outYaw, pitch: 0, roll: 0 }; // rest, gazing at the landmark
}

/* ------------------------- Children's pratfalls --------------------------- */

const TUMBLE_S = 1.8; // seconds from tripping to back on their feet
const TUMBLE_CHANCE = 0.35; // chance per 6–12 s stretch of play that a running child trips
const FUMBLE_CHANCE = 0.2; // chance per catch that the child fumbles it and topples over
const hash01 = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
/** Small children on the ground (not birds circling overhead) */
export const isChild = (a: Actor) => (a.scale ?? 1) < 1 && a.y < 0.5;

/**
 * A running child's clock with random tumbles. Play time is cut into stretches of 6–12 s; in some of them the
 * child trips: their path time stands still for TUMBLE_S (they lie where they fell), and stretches without a fall
 * run a touch slower by the same amount, so the path never jumps. `fall` is 0 on their feet, 0…1 while down.
 * Deterministic in t, so every viewer sees the same falls.
 */
function tumbleClock(t: number, seed: number): { te: number; fall: number } {
  const P = 6 + hash01(seed, 1) * 6;
  const w = Math.floor(t / P);
  const lt = t - w * P;
  const kept = P - TUMBLE_S;
  if (hash01(seed * 13.7, w) >= TUMBLE_CHANCE) return { te: w * kept + (lt * kept) / P, fall: 0 };
  const ts = 1 + hash01(seed, w + 0.5) * (kept - 2);
  if (lt < ts) return { te: w * kept + lt, fall: 0 };
  if (lt < ts + TUMBLE_S) return { te: w * kept + ts, fall: (lt - ts) / TUMBLE_S };
  return { te: w * kept + lt - TUMBLE_S, fall: 0 };
}

/** Pitch of a fall: trip (15%), lie there (55%), get back up (30%); negative = onto their back */
function fallPitch(f: number, flat: number): number {
  if (f < 0.15) return flat * (f / 0.15);
  if (f < 0.7) return flat;
  return flat * (1 - (f - 0.7) / 0.3);
}

/** Position + orientation of an actor at time t */
export function pose(a: Actor, t: number): { x: number; y: number; z: number; yaw: number; pitch: number; roll: number } {
  switch (a.motion) {
    case "walk": {
      const dx = (a.x2 ?? a.x) - a.x;
      const dz = (a.z2 ?? a.z) - a.z;
      const len = Math.max(0.5, Math.hypot(dx, dz));
      const u = ((t * a.speed) / len + a.phase) % 2;
      const back = u > 1;
      const f = back ? 2 - u : u;
      return {
        x: a.x + dx * f,
        y: a.y + Math.abs(Math.sin(t * 9 + a.phase * 7)) * 0.05,
        z: a.z + dz * f,
        yaw: Math.atan2(dx, dz) + (back ? Math.PI : 0),
        pitch: 0,
        roll: 0
      };
    }
    case "work":
      return { x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: Math.max(0, Math.sin(t * 2.6 + a.phase * 6)) * 0.5, roll: 0 };
    case "visit":
      return visitPose(a, t);
    case "graze": {
      const ang = t * a.speed * 0.35 + a.phase * 6;
      return {
        x: a.x + Math.cos(ang) * 0.22,
        y: a.y,
        z: a.z + Math.sin(ang) * 0.22,
        yaw: -ang,
        pitch: Math.max(0, Math.sin(t * 0.9 + a.phase)) * 0.25,
        roll: 0
      };
    }
    case "peck": {
      const ang = t * a.speed * 0.6 + a.phase * 6;
      return {
        x: a.x + Math.cos(ang) * 0.15,
        y: a.y,
        z: a.z + Math.sin(ang) * 0.15,
        yaw: -ang,
        pitch: Math.max(0, Math.sin(t * 9 + a.phase * 7)) * 0.6,
        roll: 0
      };
    }
    case "march": {
      // Driven by the wall clock, so every viewer sees the army at the same spot
      const dx = (a.x2 ?? a.x) - a.x;
      const dz = (a.z2 ?? a.z) - a.z;
      const t0 = a.t0 ?? 0;
      const f = Math.min(1, Math.max(0, (Date.now() - t0) / Math.max(1, (a.t1 ?? t0) - t0)));
      const moving = f > 0 && f < 1;
      if (a.arc) {
        const p = arcStep(a.x, a.z, a.x2 ?? a.x, a.z2 ?? a.z, a.arc.x, a.arc.z, f);
        return { x: p.x, y: a.y + (moving ? Math.abs(Math.sin(t * 9 + a.phase * 7)) * 0.08 : 0), z: p.z, yaw: p.yaw, pitch: moving ? 0.08 : 0, roll: 0 };
      }
      return {
        x: a.x + dx * f,
        y: a.y + (moving ? Math.abs(Math.sin(t * 9 + a.phase * 7)) * 0.08 : 0),
        z: a.z + dz * f,
        yaw: Math.atan2(dx, dz),
        pitch: moving ? 0.08 : 0,
        roll: 0
      };
    }
    case "fight": {
      // Lunge towards the enemy (facing `yaw`) and swing
      const s = Math.max(0, Math.sin(t * a.speed + a.phase * 6));
      return { x: a.x + Math.sin(a.yaw) * s * 0.35, y: a.y, z: a.z + Math.cos(a.yaw) * s * 0.35, yaw: a.yaw, pitch: s * 0.4, roll: 0 };
    }
    case "cheer":
      return { x: a.x, y: a.y + Math.abs(Math.sin(t * 6 + a.phase * 5)) * 0.35, z: a.z, yaw: a.yaw + Math.sin(t * 3 + a.phase) * 0.4, pitch: -0.15, roll: 0 };
    case "fallen":
      return { x: a.x, y: a.y + 0.15 * (a.scale ?? 1), z: a.z, yaw: a.yaw, pitch: 0, roll: Math.PI / 2 };
    case "circle": {
      const cx = a.x2 ?? a.x;
      const cz = a.z2 ?? a.z;
      const r = Math.max(0.3, Math.hypot(a.x - cx, a.z - cz));
      const flying = a.y > 0.5;
      if (isChild(a)) {
        // Tag: now and then the chaser trips flat on their face and the others lap them
        const { te, fall } = tumbleClock(t, a.phase);
        const ang = a.phase + (te * a.speed) / r;
        return {
          x: cx + Math.cos(ang) * r,
          y: a.y + (fall ? 0.04 : Math.abs(Math.sin(t * 11 + a.phase * 7)) * 0.07),
          z: cz + Math.sin(ang) * r,
          yaw: Math.atan2(-Math.sin(ang), Math.cos(ang)),
          pitch: fall ? fallPitch(fall, 1.45) : 0.12,
          roll: fall > 0.15 && fall < 0.7 ? Math.sin(t * 22) * 0.15 : 0
        };
      }
      if (flying) {
        // A bird's round is no circle: it surges and eases, swings out and in, climbs and dives, and banks harder
        // into the tighter bends (all seeded by its phase, so no two birds fly alike)
        const at = (tt: number) => {
          const ang = a.phase + (tt * a.speed) / r + 0.3 * Math.sin(tt * 0.4 + a.phase * 3);
          const rr = r * (1 + 0.22 * Math.sin(ang * 2 + a.phase * 5) + 0.1 * Math.sin(tt * 0.7 + a.phase));
          return [cx + Math.cos(ang) * rr, a.y + Math.sin(tt * 0.7 + a.phase) * 0.4 + Math.sin(tt * 0.23 + a.phase * 2) * 0.6, cz + Math.sin(ang) * rr];
        };
        const [x, y, z] = at(t);
        const [nx, ny, nz] = at(t + 0.05);
        const run = Math.max(1e-4, Math.hypot(nx - x, nz - z));
        return { x, y, z, yaw: Math.atan2(nx - x, nz - z), pitch: -Math.atan2(ny - y, run) * 0.6, roll: 0.3 + 0.15 * Math.sin(t * 0.8 + a.phase * 4) };
      }
      const ang = a.phase + (t * a.speed) / r;
      return {
        x: cx + Math.cos(ang) * r,
        y: a.y + Math.abs(Math.sin(t * 11 + a.phase * 7)) * 0.07,
        z: cz + Math.sin(ang) * r,
        // Facing along the circle (counter-clockwise seen from above)
        yaw: Math.atan2(-Math.sin(ang), Math.cos(ang)),
        pitch: 0.12,
        roll: 0
      };
    }
    case "wander": {
      const cx = a.x2 ?? a.x;
      const cz = a.z2 ?? a.z;
      const r = Math.max(0.3, Math.hypot(a.x - cx, a.z - cz));
      // Two sines per axis make a path that never quite repeats; facing follows the way it runs
      const at = (u: number) => [
        cx + r * (0.6 * Math.sin(u * 1.3 + a.phase) + 0.4 * Math.sin(u * 2.1 + a.phase * 1.7)),
        cz + r * (0.6 * Math.cos(u * 1.1 + a.phase * 0.7) + 0.4 * Math.sin(u * 1.9 + a.phase * 2.3))
      ];
      // Running about: now and then a child trips, lies there kicking, gets up and runs on
      const { te, fall } = isChild(a) ? tumbleClock(t, a.phase) : { te: t, fall: 0 };
      const u = te * a.speed * 0.35;
      const [x, z] = at(u);
      const [nx, nz] = at(u + 0.02);
      return {
        x,
        y: a.y + (fall ? 0.04 : Math.abs(Math.sin(t * 11 + a.phase * 7)) * 0.07),
        z,
        yaw: Math.atan2(nx - x, nz - z),
        pitch: fall ? fallPitch(fall, 1.45) : 0.12,
        roll: fall > 0.15 && fall < 0.7 ? Math.sin(t * 22) * 0.15 : 0
      };
    }
    case "toss": {
      const cx = a.x2 ?? a.x;
      const cz = a.z2 ?? a.z;
      const r = Math.hypot(a.x - cx, a.z - cz);
      const n = Math.max(2, a.ring ?? 2);
      const s = t * a.speed;
      const k = Math.floor(s);
      const f = s - k;
      const a0 = a.yaw + ((k % n) / n) * Math.PI * 2;
      const a1 = a.yaw + (((k + 1) % n) / n) * Math.PI * 2;
      return {
        x: cx + (Math.cos(a0) * (1 - f) + Math.cos(a1) * f) * r,
        y: a.y + Math.sin(Math.PI * f) * 1.1,
        z: cz + (Math.sin(a0) * (1 - f) + Math.sin(a1) * f) * r,
        yaw: 0,
        pitch: t * 6,
        roll: t * 4
      };
    }
    case "catch": {
      // The ball reaches stop j whenever t × speed ≡ j (mod ring): hop up to catch it
      const n = Math.max(2, a.ring ?? 2);
      const d = (((t * a.speed - a.phase) % n) + n) % n;
      // Now and then they fumble it and topple over backwards (the ball flies on round the ring)
      const fumbleThrows = TUMBLE_S * a.speed;
      const catchNo = Math.floor((t * a.speed - a.phase) / n);
      if (d < fumbleThrows && hash01(a.x * 3.1 + a.z * 7.7, catchNo) < FUMBLE_CHANCE) {
        const f = d / fumbleThrows;
        return { x: a.x, y: a.y + 0.04, z: a.z, yaw: a.yaw, pitch: fallPitch(f, -1.35), roll: f > 0.15 && f < 0.7 ? Math.sin(t * 22) * 0.15 : 0 };
      }
      const near = Math.min(d, n - d);
      return { x: a.x, y: a.y + 0.2 * Math.max(0, 1 - near * 3), z: a.z, yaw: a.yaw, pitch: near < 0.3 ? -0.2 : 0.05, roll: 0 };
    }
    case "spin":
      return { x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: 0, roll: t * a.speed + a.phase };
    case "float":
      return { x: a.x, y: a.y + (((t * a.speed * 0.4 + a.phase) % 1) * 2.4), z: a.z, yaw: t * 1.5 + a.phase, pitch: 0, roll: 0 };
    default:
      return { x: a.x, y: a.y, z: a.z, yaw: a.yaw + Math.sin(t * 0.4 + a.phase) * 0.6, pitch: 0, roll: 0 };
  }
}

/** A walk `f` (0..1) of the way from one point to another round a centre, the short way: where it is and which way it faces */
export function arcStep(x: number, z: number, x2: number, z2: number, cx: number, cz: number, f: number): { x: number; z: number; yaw: number } {
  const from = Math.atan2(x - cx, z - cz);
  const turn = Math.atan2(Math.sin(Math.atan2(x2 - cx, z2 - cz) - from), Math.cos(Math.atan2(x2 - cx, z2 - cz) - from));
  const a = from + turn * f;
  const r = Math.hypot(x - cx, z - cz) * (1 - f) + Math.hypot(x2 - cx, z2 - cz) * f;
  const way = turn < 0 ? -1 : 1;
  return { x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r, yaw: Math.atan2(Math.cos(a) * way, -Math.sin(a) * way) };
}

/** Motions that move an actor off its (x, z); under the rest the ground never changes */
const MOVES = new Set<Actor["motion"]>(["walk", "visit", "graze", "peck", "march", "fight", "circle", "wander", "toss"]);
export const staysPut = (a: Actor) => !MOVES.has(a.motion);

/**
 * Everywhere `pose` can put an actor, before the ground under it is added: x and z range, and y above the ground
 * (generous, so an actor whose box is out of view is surely out of view)
 */
export function poseBounds(a: Actor): { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number } {
  const x2 = a.x2 ?? a.x;
  const z2 = a.z2 ?? a.z;
  const around = (cx: number, cz: number, r: number, y0: number, y1: number) => ({ x0: cx - r, x1: cx + r, z0: cz - r, z1: cz + r, y0, y1 });
  switch (a.motion) {
    case "walk":
    case "visit":
    case "march":
      if (a.arc) return around(a.arc.x, a.arc.z, Math.max(Math.hypot(a.x - a.arc.x, a.z - a.arc.z), Math.hypot(x2 - a.arc.x, z2 - a.arc.z)), a.y, a.y + 0.1);
      return { x0: Math.min(a.x, x2), x1: Math.max(a.x, x2), z0: Math.min(a.z, z2), z1: Math.max(a.z, z2), y0: a.y, y1: a.y + 0.1 };
    case "circle": {
      const r = Math.max(0.3, Math.hypot(a.x - x2, a.z - z2));
      // A bird's round swings out by up to a third and climbs and dives a metre
      return a.y > 0.5 ? around(x2, z2, r * 1.35, a.y - 1.05, a.y + 1.05) : around(x2, z2, r, a.y, a.y + 0.1);
    }
    case "wander":
      return around(x2, z2, Math.max(0.3, Math.hypot(a.x - x2, a.z - z2)), a.y, a.y + 0.1);
    case "toss":
      return around(x2, z2, Math.hypot(a.x - x2, a.z - z2), a.y, a.y + 1.15);
    case "graze":
    case "peck":
    case "fight":
      return around(a.x, a.z, 0.4, a.y, a.y);
    case "float":
      return around(a.x, a.z, 0, a.y, a.y + 2.4);
    default:
      return around(a.x, a.z, 0, a.y, a.y + 0.4 + 0.15 * (a.scale ?? 1));
  }
}

/**
 * How far a wing is raised (radians, before its side's sign): flying birds beat — a quick downstroke, a slower lift —
 * and now and then glide a while on still wings; at rest the wings lie folded along the body
 */
export function wingLift(a: Actor, t: number): number {
  if (a.motion !== "circle" || a.y <= 0.5) return -1.1;
  const u = t * 10 * (0.8 + (a.speed % 1) * 0.4) + a.phase * 7;
  const glide = THREE.MathUtils.smoothstep(Math.sin(t * 0.5 + a.phase * 3), 0.5, 0.9);
  return (0.15 + 0.65 * (Math.sin(u) + 0.25 * Math.sin(2 * u))) * (1 - glide) + 0.1 * glide;
}

/**
 * HD: what an actor's limbs are doing at time t. `stride` runs 2π per stride (one step each half), in time with the
 * bob of `pose` (highest as the legs pass, lowest as a foot lands); `moving` 0 standing … 1 walking; `act` what its arms
 * do (0 nothing, 1 work: raised and brought down as it bows, 2 fight: the weapon arm strikes as it lunges, 3 cheer:
 * both up, 4 ride: legs astride a mount, hands forward on the reins) and `amount` how far (0–1)
 */
export interface Gait {
  stride: number;
  moving: number;
  act: number;
  amount: number;
}

export function gaitOf(a: Actor, t: number, out: Gait): Gait {
  out.stride = t * 9 + a.phase * 7;
  out.moving = 0;
  out.act = 0;
  out.amount = 0;
  switch (a.motion) {
    case "walk":
      out.moving = 1;
      break;
    case "visit": {
      // Walking out or back (not while standing before the landmark or resting)
      const len = Math.max(0.5, Math.hypot((a.x2 ?? a.x) - a.x, (a.z2 ?? a.z) - a.z));
      const walk = len / a.speed;
      const cycle = walk * 2 + VISIT_STAY + VISIT_REST;
      const u = (((t + a.phase * 13) % cycle) + cycle) % cycle;
      out.moving = u < walk || (u >= walk + VISIT_STAY && u < walk * 2 + VISIT_STAY) ? 1 : 0;
      break;
    }
    case "march": {
      const t0 = a.t0 ?? 0;
      const f = (Date.now() - t0) / Math.max(1, (a.t1 ?? t0) - t0);
      out.moving = f > 0 && f < 1 ? 1 : 0;
      break;
    }
    case "circle":
    case "wander":
      // Running (birds overhead fly: their legs stay tucked); a child lying where it fell doesn't
      out.stride = t * 11 + a.phase * 7;
      out.moving = a.motion === "circle" && a.y > 0.5 && !isChild(a) ? 0 : isChild(a) && tumbleClock(t, a.phase).fall > 0 ? 0 : 1;
      break;
    case "graze":
      out.stride = t * a.speed * 2.2 + a.phase * 6;
      out.moving = 0.3;
      break;
    case "peck":
      out.stride = t * a.speed * 4 + a.phase * 6;
      out.moving = 0.35;
      break;
    case "work":
      out.act = 1;
      out.amount = Math.max(0, Math.sin(t * 2.6 + a.phase * 6));
      break;
    case "fight":
      out.act = 2;
      out.amount = Math.max(0, Math.sin(t * a.speed + a.phase * 6));
      break;
    case "cheer":
      out.act = 3;
      out.amount = 1;
      break;
    case "catch": {
      const n = Math.max(2, a.ring ?? 2);
      const d = (((t * a.speed - a.phase) % n) + n) % n;
      out.act = 3;
      out.amount = Math.max(0, 1 - Math.min(d, n - d) * 3);
      break;
    }
  }
  // A rider sits the saddle: the mount does the walking, the rider holds the reins (4)
  if (a.ride) {
    out.moving = 0;
    out.act = 4;
    out.amount = 1;
  }
  return out;
}
