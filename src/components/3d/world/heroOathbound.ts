import * as THREE from "three";
import { V3 } from "./heroKit";
import { SPARK } from "./heroMaterials";
import { BossAction, BossCtx, BossHeroDef, IdleCtx, Pose } from "./heroRig";
import { blob, seg } from "./bossParts";
import { aura } from "./heroCreatures";
import { orbit, orbiters } from "./heroMercKit";
import { KOI_LOOK, KoiRole, OATH_FISH as F, koiGlows, koiParts } from "./mercenaryRigs";

/* ------------------------------------------------------------------------- */
/* The Warden's Oathbound (legendary): the Void Gate's familiar, in HD         */
/* ------------------------------------------------------------------------- */

/*
 * The familiar of the Void Gate's Warden, sworn to the ruler who beats the gate's last level (not in the realm yet: the
 * Codex shows it as coming soon). Two void koi chasing each other round a yin-yang that floats at head height and turns
 * slowly: one obsidian, one pale as moonlit pearl, each koi's head carrying the yin-yang's dot in the other's colour.
 * Built from the same part list and bone chain as its Normal rig (`koiParts`, `OATH_FISH`), so both draw the same
 * model; HD adds scaled skin, glassy fins and lit seams that follow the body's curve. A rigged hero; embers and sparks,
 * no beam.
 */

export const OATHBOUND_TYPE = "merc-void-oathbound";

const SHARDS = 7;
const NAME = { 1: "dark", [-1]: "pale" } as const;
const REST_TILT = F.tilt;
const BODY_S = F.body;
const TOTAL_BONES = F.bones;

/** Bucket for each role in HD: scaled skin on the dark koi, pearl-matte on the pale one, glassy fins, lit eyes and wakes */
const BUCKET: Record<1 | -1, Record<KoiRole, string>> = {
  1: { body: "scales", fin: "gloss", seam: "glow", rim: "glow", eye: "glow", pupil: "glow", glow: "glow", wake: "glow" },
  [-1]: { body: "matte", fin: "gloss", seam: "glow", rim: "glow", eye: "gloss", pupil: "glow", glow: "glow", wake: "glow" }
};

/** A point on a fish at s, in the model's rest space (the disc built flat, the tilt is the rest pose) */
const P = (s: number, side: number, y = 0): V3 => {
  const [x, z] = F.at(s, side);
  return [x, F.Y + y, z];
};

/** Joint pivots for bones 0…6 plus the wake tip (7) in rest space */
const restJoints = (side: 1 | -1): V3[] => F.joints(side).map(([x, z]) => [x, F.Y, z]);

/**
 * One koi: the same ellipsoids as its Normal rig (`koiParts`), drawn smooth, plus HD-only detail: lit seams along its
 * back and belly and down its dorsal sail, each laid in short pieces so it follows the curve
 */
function fish(c: BossCtx, side: 1 | -1) {
  const N = NAME[side];
  const L = KOI_LOOK[side];
  const all = koiParts(side);
  const wakes = all.filter((p) => p.role === "wake");
  const joints = restJoints(side);
  const build = (k: number) => {
    c.bone(`${N}${k}`, joints[k], () => {
      for (const p of all) {
        if (p.bone !== k) continue;
        const glow = koiGlows(p.role, side);
        const round = p.role === "body" || p.role === "eye" || p.role === "rim";
        c.k.add(BUCKET[side][p.role], new THREE.SphereGeometry(1, round ? 22 : 14, round ? 12 : 8), [p.at[0], F.Y + p.at[1], p.at[2]], [0, p.yaw, 0], {
          color: L[p.role],
          scale: [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2],
          ...(glow ? { bright: p.role === "wake" ? 2.0 - wakes.indexOf(p) * 0.1 : 1.9 } : {})
        });
      }
      if (k < BODY_S.length) {
        // Lit seams along the back and belly, in short pieces that follow the curve
        const s0 = BODY_S[k];
        const s1 = k + 1 < BODY_S.length ? BODY_S[k + 1] : 1;
        const n = 4;
        for (let i = 0; i < n; i++) {
          const a = s0 + ((s1 - s0) * i) / n;
          const b = s0 + ((s1 - s0) * (i + 1)) / n;
          for (const u of [1, -1]) seg(c, "glow", P(a, side, u * F.thick(a) * 0.93), P(b, side, u * F.thick(b) * 0.93), 0.011, 0.009, { color: L.seam, seg: 5, cap: i === 0 });
        }
      }
      if (k + 1 < TOTAL_BONES) build(k + 1);
    });
  };
  build(0);
}

function oathbound(c: BossCtx) {
  c.bone("root", [0, 0, 0], () => {
    orbiters(c, "shard", SHARDS, F.Y + 0.1, (i, at) => {
      c.k.add(i % 2 ? "glow" : "gloss", new THREE.OctahedronGeometry(0.07), at, undefined, i % 2 ? { color: i % 4 === 1 ? "#e11d48" : "#a855f7", bright: 1.7, scale: [0.7, 1.8, 0.7] } : { color: "#1c1326", scale: [0.8, 2.1, 0.8] });
    });
    c.bone("tilt", [0, F.Y, 0], () => {
      c.bone("pair", [0, F.Y, 0], () => {
        fish(c, 1);
        fish(c, -1);
      });
      // The yin-yang pearl at the ring's heart: two interlocking S-swirl lobes and contrasting eyes
      c.bone("pearl", [0, F.Y, 0], () => {
        const o: V3 = [0, F.Y, 0];
        c.k.add("gloss", new THREE.SphereGeometry(0.18, 24, 14, 0, Math.PI), o, [0, 0, 0], { color: "#1c1326" });
        c.k.add("matte", new THREE.SphereGeometry(0.18, 24, 14, Math.PI, Math.PI), o, [0, 0, 0], { color: "#ffffff" });
        // Swirling lobes so the central pearl reads as a true miniature taijitu
        blob(c, "gloss", [0.055, F.Y, 0.02], [0.095, 0.175, 0.095], { color: "#1c1326", wd: 14, hd: 10 });
        blob(c, "matte", [-0.055, F.Y, -0.02], [0.095, 0.175, 0.095], { color: "#ffffff", wd: 14, hd: 10 });
        for (const u of [1, -1]) {
          blob(c, "glow", [0.06, F.Y + u * 0.155, 0.02], [0.032, 0.02, 0.032], { color: "#f5f1ff", wd: 10, hd: 6 });
          blob(c, "glow", [-0.06, F.Y + u * 0.155, -0.02], [0.032, 0.02, 0.032], { color: "#e11d48", wd: 10, hd: 6 });
        }
        c.k.add("glow", new THREE.TorusGeometry(0.25, 0.011, 4, 40), o, [Math.PI / 2, 0, 0], { color: "#fde68a", bright: 1.8 });
        c.k.add("glow", new THREE.TorusGeometry(0.31, 0.006, 4, 40, Math.PI * 1.3), o, [Math.PI / 2, 0, 0.5], { color: "#e11d48", bright: 1.6 });
      });
    });
  });
}

/* ------------------------------ motion ------------------------------ */

/** Each tail bone of both fish bends by `a`, a beat later down the tail */
const swim = (a: number, ph: number): Pose => {
  const p: Pose = {};
  for (const N of ["dark", "pale"]) for (let k = 1; k < TOTAL_BONES; k++) p[`${N}${k}`] = { r: [0, a * Math.sin(ph - k * 0.65), 0] };
  return p;
};

/**
 * The march: the koi leave their ring and swim forward intertwined in a 3D double-helix braid, crossing over and under
 * each other down their whole length (the path is carried in `idle`)
 */
const BRAID: BossAction = { len: 3.6, idle: 0.35, keys: [{ t: 0, pose: {} }, { t: 1, pose: {} }] };

/** The Oath: the disc rises and turns its face to the foe, the two fish drawing apart and closing again */
const OATH: BossAction = {
  len: 3.2,
  keys: [
    { t: 0, pose: {} },
    // It gathers: the disc dips and draws in
    { t: 0.14, pose: { tilt: { r: [-0.12, 0, 0], p: [0, -0.12, 0] }, pearl: { s: -0.15 } } },
    // It rises and stands upright, facing the foe: the yin-yang as a sigil (the koi spin it, in idle)
    { t: 0.36, pose: { tilt: { r: [Math.PI / 2 - F.tilt, 0, 0], p: [0, 0.55, 0.25] }, pearl: { s: 0.5, g: 1.2 } } },
    // The oath: the pearl swells and flares at its heart
    { t: 0.5, pose: { tilt: { r: [Math.PI / 2 - F.tilt, 0, 0], p: [0, 0.6, 0.3] }, pearl: { s: 0.9, g: 2.4 } }, hold: true },
    { t: 0.7, pose: { tilt: { r: [Math.PI / 2 - F.tilt, 0, 0], p: [0, 0.55, 0.25] }, pearl: { s: 0.45, g: 1.0 } }, hold: true },
    { t: 1, pose: {} }
  ],
  hits: [{ u: 0.5, cine: { quake: 0.02, vig: 0.35, vigCol: "#2e1065", flash: 0.3, flashCol: "#fde68a" }, burst: true }]
};

/**
 * Twin strike, its battle: the koi swim an infinity (figure of eight) facing the foe, half a loop apart, coiling round
 * the outer lobes and slashing across its heart lunging forward where the blow lands (the path is carried in `idle`)
 */
const EIGHT: BossAction = {
  len: 4.4,
  idle: 0.35,
  keys: [{ t: 0, pose: {} }, { t: 1, pose: {} }],
  hits: [{ u: 0.5, cine: { quake: 0.025, flash: 0.22, flashCol: "#f5f1ff", vig: 0.2, vigCol: "#4c1d95" }, burst: true }]
};

const TAU = Math.PI * 2;
const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const KOI = [["dark", 1], ["pale", -1]] as const;
const wrapPi = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** Precomputed rest-space bone pivots, chord lengths, and orthonormal basis matrices for exact 3D curve-following */
interface RestChain {
  pts: V3[];
  lens: number[];
  basisT: THREE.Matrix4[];
}

const REST_CHAINS: Record<1 | -1, RestChain> = {
  1: buildRestChain(1),
  [-1]: buildRestChain(-1)
};

function buildRestChain(side: 1 | -1): RestChain {
  const pts = restJoints(side);
  const lens: number[] = [];
  const basisT: THREE.Matrix4[] = [];
  const uRest = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < TOTAL_BONES; k++) {
    const p0 = pts[k];
    const p1 = pts[k + 1];
    const dx = p0[0] - p1[0];
    const dz = p0[2] - p1[2];
    const len = Math.hypot(dx, dz) || 1;
    lens.push(len);
    const fk = new THREE.Vector3(dx / len, 0, dz / len);
    const sk = new THREE.Vector3().crossVectors(fk, uRest).normalize();
    const bk = new THREE.Matrix4().makeBasis(fk, uRest, sk).transpose();
    basisT.push(bk);
  }
  return { pts, lens, basisT };
}

/**
 * 3D Braid path: at head phase `th` and distance `d` behind the head, the two koi wind round each other in a double helix
 * along +z while weaving over and under in a plait
 */
/** How far the braid winds per unit down a body (rad) */
const BRAID_TWIST = 1.55;

function braidPoint(th: number, d: number, side: 1 | -1, swimWave: number): V3 {
  const phi = th - BRAID_TWIST * d + (side > 0 ? 0 : Math.PI);
  const env = 0.82 + 0.22 * Math.sin(Math.min(1, d / 1.8) * (Math.PI / 2));
  // Wide enough that the two bodies wind round each other without passing through
  const rx = 1.1 * env;
  const ry = 0.85 * env;
  // Subtle lateral swimming undulation riding along the helix
  const wag = (0.015 + 0.012 * Math.min(d, 3)) * Math.sin(swimWave - d * 2.2);
  return [
    (rx + wag) * Math.cos(phi),
    F.Y + 0.08 + (ry + wag) * Math.sin(phi),
    1.38 - 0.62 * d + 0.07 * Math.sin(phi * 2)
  ];
}

/**
 * 3D Infinity (Lemniscate of Gerono) battle path: wide loops on the left and right, lunging forward (+z) as the two koi
 * slash across the central X-intersection
 */
/**
 * The battle's figure of eight, upright before the foe: wide lobes the two koi swim half a loop apart, parting round
 * the pearl at its heart (one over it, one under) so the pearl stays in sight and they swim out of it. A Gerono eight
 * pinched a little at its waist (`EIGHT_PINCH`): a plain one bends to a radius of 0.4 a third of the way round each
 * lobe, tighter than a koi's bones can follow, and its body folded there like a crease; pinched, the tightest bend is
 * about 0.9, at nearly the same size
 */
const EIGHT_A = 2.6;
const EIGHT_B = 2.0;
const EIGHT_PINCH = -0.3;
const EIGHT_PART = 0.55;

function eightPoint(psi: number, swimWave: number, d: number, side: 1 | -1): V3 {
  const s = Math.sin(psi);
  const c = Math.cos(psi);
  // Subtle lateral swimming undulation perpendicular to the loop
  const wag = (0.012 + 0.01 * Math.min(d, 3)) * Math.sin(swimWave - d * 2.1);
  return [
    EIGHT_A * s * (1 + EIGHT_PINCH * c * c) + wag * c,
    F.Y + 0.25 + EIGHT_B * s * c + side * EIGHT_PART * Math.pow(c * c, 4) + wag * s * 0.5,
    0.15 + 0.5 * c * c
  ];
}

const _n0 = new THREE.Vector3();
const _tn = new THREE.Vector3();

/** Signed turn of the eight in its upright plane at psi (+ where it turns as the left lobe does) */
function eightTurn(psi: number): number {
  const e = 0.01;
  const a = eightPoint(psi - e, 0, 0, 1);
  const b = eightPoint(psi, 0, 0, 1);
  const c = eightPoint(psi + e, 0, 0, 1);
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const vx = c[0] - b[0];
  const vy = c[1] - b[1];
  return (ux * vy - uy * vx) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) * e + 1e-9);
}
/** Which way the left lobe turns (it looks right: the koi's curl follows it there) */
const LEFT_TURN = Math.sign(eightTurn((3 * Math.PI) / 2));
/** +1 in a turn like the left lobe's, −1 in the right lobe's, easing through the straight run at the heart */
const eightCurl = (psi: number) => Math.tanh(4 * LEFT_TURN * eightTurn(psi));

const _tk = new THREE.Vector3();
const _uk = new THREE.Vector3();
const _sk = new THREE.Vector3();
const _fk = new THREE.Matrix4();
const _rk = new THREE.Matrix4();
const _prevR = new THREE.Matrix4();
const _prevRT = new THREE.Matrix4();
const _mk = new THREE.Matrix4();
const _eu = new THREE.Euler(0, 0, 0, "YXZ");

/**
 * Places all 7 bones of a fish (head, 4 body segments, veil tail, and comet wake) directly along the 3D Braid or
 * Infinity path by stepping backward by exact rest bone lengths `L_k` and solving `M_k = R_{k-1}^T R_k`
 */
function swimAlong(c: IdleCtx, N: string, side: 1 | -1, th: number, walk: boolean) {
  const chain = REST_CHAINS[side];
  const swimWave = c.t * 6.5 + (side > 0 ? 0 : Math.PI);
  const qs: V3[] = [];
  const params: number[] = [];

  if (walk) {
    // Step backward along the 3D double-helix braid so each chord ||Q_k - Q_{k+1}|| matches L_k
    let d = 0;
    qs.push(braidPoint(th, d, side, swimWave));
    params.push(d);
    for (let k = 0; k < TOTAL_BONES; k++) {
      const targetLen = chain.lens[k];
      const steps = 4;
      const ds = targetLen / steps;
      for (let s = 0; s < steps; s++) {
        const eps = 0.01;
        const a = braidPoint(th, d, side, swimWave);
        const b = braidPoint(th, d + eps, side, swimWave);
        const spd = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / eps || 1;
        d += ds / spd;
      }
      qs.push(braidPoint(th, d, side, swimWave));
      params.push(d);
    }
  } else {
    // Step backward along the 3D Infinity curve by exact arc-length L_k so the body never stretches or bunches
    let psi = th;
    let d = 0;
    qs.push(eightPoint(psi, swimWave, d, side));
    params.push(psi);
    for (let k = 0; k < TOTAL_BONES; k++) {
      const targetLen = chain.lens[k];
      const steps = 4;
      const ds = targetLen / steps;
      for (let s = 0; s < steps; s++) {
        const eps = 0.008;
        const a = eightPoint(psi - eps, swimWave, d, side);
        const b = eightPoint(psi + eps, swimWave, d, side);
        const spd = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (2 * eps) || 1;
        psi -= ds / spd;
        d += ds;
      }
      qs.push(eightPoint(psi, swimWave, d, side));
      params.push(psi);
    }
  }

  for (let k = 0; k < TOTAL_BONES; k++) {
    const q0 = qs[k];
    const q1 = qs[k + 1];
    _tk.set(q0[0] - q1[0], q0[1] - q1[1], q0[2] - q1[2]).normalize();
    if (walk) {
      // Bank outward around the helix axis with a soft upward bias so the dorsal fins and glowing eyes show round the braid
      const phi = th - BRAID_TWIST * params[k] + (side > 0 ? 0 : Math.PI);
      _uk.set(0.55 * Math.cos(phi), 0.65 + 0.55 * Math.sin(phi), 0.25).normalize();
    } else {
      // Face the back toward the foe in the lobe that turns the way the body is built to curl; through the heart each koi
      // rolls smoothly half over, so in the other lobe its curl still bends the way the loop turns (bent against its own
      // curl, every bone of the body zigzagged into a fold there)
      const roll = Math.acos(Math.max(-1, Math.min(1, eightCurl(params[k]))));
      _n0.set(0.18 * Math.cos(params[k]), 0.34, 0.92).normalize();
      _tn.crossVectors(_tk, _n0).normalize();
      _uk.copy(_n0).multiplyScalar(Math.cos(roll)).addScaledVector(_tn, Math.sin(roll));
    }
    _sk.crossVectors(_tk, _uk).normalize();
    _uk.crossVectors(_sk, _tk).normalize();
    _fk.makeBasis(_tk, _uk, _sk);
    _rk.multiplyMatrices(_fk, chain.basisT[k]);

    if (k === 0) {
      _eu.setFromRotationMatrix(_rk, "YXZ");
      const h = chain.pts[0];
      c.carry(`${N}0`, [_eu.x, _eu.y, _eu.z], [q0[0] - h[0], q0[1] - h[1], q0[2] - h[2]]);
    } else {
      _prevRT.copy(_prevR).transpose();
      _mk.multiplyMatrices(_prevRT, _rk);
      _eu.setFromRotationMatrix(_mk, "YXZ");
      c.carry(`${N}${k}`, [_eu.x, _eu.y, _eu.z]);
    }
    _prevR.copy(_rk);
  }
}

/** The march and the battle: the 3D paths the koi swim instead of their ring */
function swimPaths(c: IdleCtx) {
  // The disc lies flat again (its rest tilt undone) and stops turning; the paths are laid out in its own space
  c.carry("tilt", [-REST_TILT, 0, 0]);
  const walk = c.action === "walk";
  // Braid weaves two full helical turns per cycle; Twin strike coils on the outer lobes and slashes fast across the heart
  const a = c.u * TAU;
  const baseTh = walk ? a * 2 : a + 0.22 * Math.sin(2 * a);
  for (const [N, side] of KOI) {
    // The braid sets the half turn between the two koi itself (braidPoint); adding it here too put them on one spot
    // In the eight the koi swim half a loop apart, each in its own lobe, crossing at the heart round the pearl
    const th = baseTh + (walk ? 0 : side > 0 ? Math.PI : 0);
    swimAlong(c, N, side, th, walk);
  }
  // The pearl leads the braid at the front, or spins at the central X-crossing of the infinity loop and surges on the slash
  if (walk) {
    c.carry("pearl", [0, wrapPi(-c.t * 1.4), 0], [0, 0.08 + 0.04 * c.sin(2.0, 1), 1.85]);
  } else {
    const slash = Math.cos(a) ** 4;
    c.carry("pearl", [0.35, wrapPi(-c.t * 1.8), 0], [0, 0.25 + 0.04 * c.sin(1.4, 3), 0.5 + 0.3 * slash]);
  }
}

function idle(c: IdleCtx) {
  const swimming = c.action === "walk" || c.action === "attack";
  // Steady, continuous yin-yang rotation so the two teardrops revolve smoothly round each other
  const turn = c.t * F.spin + 0.05 * Math.sin(c.t * 0.4 + c.seed * 3) + c.seed * TAU;
  // The Oath: while the disc stands upright the koi spin it twice round the pearl, easing in and out (two whole turns, so
  // nothing jumps when it ends)
  const oath = c.action === "roar" ? smooth01((c.u - 0.2) / 0.6) * TAU * 2 : 0;
  c.carry("pair", [0, swimming ? 0 : wrapPi(turn + oath), 0]);
  if (!swimming) {
    // Gentle underwater hover that keeps the yin-yang face clearly visible to the viewer
    c.add("tilt", [0.055 * c.sin(0.45), 0.065 * c.drift(0.22, 1), 0.045 * c.sin(0.38, 2)], [0, 0.075 * c.sin(0.6), 0.04 * c.drift(0.3, 4)]);
    // Balanced swimming wave travelling down each koi's body and wake strictly along the yin-yang track
    for (const [j, N] of ["dark", "pale"].entries()) {
      const w = c.t * 2.8 + j * Math.PI;
      c.add(`${N}0`, [0, -0.025 * Math.sin(w - 0.3), 0]);
      for (let k = 1; k < TOTAL_BONES; k++) {
        const amp = k < BODY_S.length ? 0.042 + k * 0.006 : 0.065;
        c.add(`${N}${k}`, [0, amp * Math.sin(w - k * 0.85), 0]);
      }
    }
  }
  orbit(c, "shard", SHARDS, 2.0, 0.35);
  if (swimming) swimPaths(c);
  // In the ring, the yin-yang pearl stays centered at the heart and turns smoothly against the koi pair
  else c.carry("pearl", [0, wrapPi(-c.t * 0.95), 0], [0, 0.03 * c.sin(1.1, 3), 0]);
}

/** The Warden's Oathbound in high graphics (a rigged hero: every copy in the same draws) */
export const OATHBOUND_DEF: BossHeroDef = {
  build: oathbound,
  rest: { tilt: { r: [REST_TILT, 0, 0] } },
  idle,
  walk: BRAID,
  roar: OATH,
  attack: EIGHT,
  lag: { dark1: 0.03, dark2: 0.06, dark3: 0.09, dark4: 0.12, pale1: 0.03, pale2: 0.06, pale3: 0.09, pale4: 0.12 },
  burst: { at: [0, F.Y + 0.15, 0.8], color: "#f5f1ff", count: 60, speed: 1.2, spread: 0.9, size: 0.12, gravity: 0.2 },
  aura: aura("#be123c", "#e9d5ff", 0.5, 1.5, 3.2),
  height: 2.6,
  frame: [9.0, 4.2, 1.7],
  actions: [
    { id: "idle", label: "Idle" },
    { id: "walk", label: "March" },
    { id: "roar", label: "Oath" },
    { id: "attack", label: "Twin strike" }
  ],
  sparks: (c) => {
    c.spark(SPARK.ember, [0, 0.6, 0], 18, { color: "#fb7185", size: 0.05, speed: 0.25, rise: 2.4, reach: 1.2, spread: 1.6 });
    c.spark(SPARK.ember, [0, 0.6, 0], 12, { color: "#fde68a", size: 0.05, speed: 0.22, rise: 2.4, reach: 1.2, spread: 1.6 });
    c.spark(SPARK.mote, [0, F.Y, 0], 20, { color: "#f5f1ff", size: 0.05, speed: 0.3, rise: 0.8, reach: 1.4, spread: 1.6 });
    c.spark(SPARK.wisp, [0, F.Y, 0], 8, { color: "#c4b5fd", size: 0.07, speed: 0.2, rise: 0.3, reach: 0.5, spread: 0.4 });
  }
};

/* ------------------------------ the Warden's guard ------------------------------ */

/** How wide the koi circle the Warden's head (the rig's own units) and how fast */
const HALO_R = 1.7;
const HALO_SPEED = 0.55;

/** A point on the halo at angle `psi`: a level ring above the head that rises and dips a little, the body's swim wave on it */
function haloPoint(psi: number, swimWave: number, d: number, side: 1 | -1): V3 {
  const wag = (0.012 + 0.012 * Math.min(d, 3)) * Math.sin(swimWave - d * 2.1);
  const r = HALO_R + wag;
  return [r * Math.cos(psi), F.Y + 0.22 * Math.sin(2 * psi + (side > 0 ? 0 : 1.3)), r * Math.sin(psi)];
}

/** Lays a koi's bones along the halo, head at angle `th`, each bone a rest length behind the last (as `swimAlong`) */
function haloAlong(c: IdleCtx, N: string, side: 1 | -1, th: number) {
  const chain = REST_CHAINS[side];
  const swimWave = c.t * 6.5 + (side > 0 ? 0 : Math.PI);
  const qs: V3[] = [];
  const params: number[] = [];
  // It swims the ring the way the angle grows, so its body trails behind at smaller angles
  let psi = th;
  let d = 0;
  qs.push(haloPoint(psi, swimWave, d, side));
  params.push(psi);
  for (let k = 0; k < TOTAL_BONES; k++) {
    const steps = 4;
    const ds = chain.lens[k] / steps;
    for (let s = 0; s < steps; s++) {
      const eps = 0.008;
      const a = haloPoint(psi - eps, swimWave, d, side);
      const b = haloPoint(psi + eps, swimWave, d, side);
      const spd = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (2 * eps) || 1;
      psi -= ds / spd;
      d += ds;
    }
    qs.push(haloPoint(psi, swimWave, d, side));
    params.push(psi);
  }
  for (let k = 0; k < TOTAL_BONES; k++) {
    const q0 = qs[k];
    const q1 = qs[k + 1];
    _tk.set(q0[0] - q1[0], q0[1] - q1[1], q0[2] - q1[2]).normalize();
    // Its back to the sky, banking a little into the turn
    _uk.set(-0.3 * Math.cos(params[k]), 1, -0.3 * Math.sin(params[k])).normalize();
    _sk.crossVectors(_tk, _uk).normalize();
    _uk.crossVectors(_sk, _tk).normalize();
    _fk.makeBasis(_tk, _uk, _sk);
    _rk.multiplyMatrices(_fk, chain.basisT[k]);
    if (k === 0) {
      _eu.setFromRotationMatrix(_rk, "YXZ");
      const h = chain.pts[0];
      c.carry(`${N}0`, [_eu.x, _eu.y, _eu.z], [q0[0] - h[0], q0[1] - h[1], q0[2] - h[2]]);
    } else {
      _prevRT.copy(_prevR).transpose();
      _mk.multiplyMatrices(_prevRT, _rk);
      _eu.setFromRotationMatrix(_mk, "YXZ");
      c.carry(`${N}${k}`, [_eu.x, _eu.y, _eu.z]);
    }
    _prevR.copy(_rk);
  }
}

/** The guard's idle: the disc lies flat and gone, each koi swims its own ring above the head, half a lap apart */
function haloIdle(c: IdleCtx) {
  c.carry("tilt", [-REST_TILT, 0, 0]);
  // The pearl is not shown: the Warden's head is the heart they circle
  c.add("pearl", null, null, -0.98);
  const th = c.t * HALO_SPEED + c.seed * TAU;
  for (const [N, side] of KOI) haloAlong(c, N, side, th + (side > 0 ? 0 : Math.PI));
  orbit(c, "shard", SHARDS, 2.3, 0.35);
}

/**
 * The Oathbound as the Gate Warden's guard (the Void Gate, coming soon): the same koi, swimming a wide ring round his
 * head instead of their yin-yang. The Codex stands it centred on the head (`VoidBroodStage`)
 */
export const WARDEN_KOI_TYPE = "vg-warden-koi";
export const WARDEN_KOI_DEF: BossHeroDef = { ...OATHBOUND_DEF, idle: haloIdle, actions: [{ id: "idle", label: "Idle" }] };
