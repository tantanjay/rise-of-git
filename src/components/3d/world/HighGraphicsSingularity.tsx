import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MythicAura } from "./MythicAuraHD";
import { useStudioReflections } from "./heroKit";
import {
  DISC_FRAG,
  DISC_VERT,
  FUNNEL_FRAG,
  FUNNEL_VERT,
  HIDDEN,
  LENS_FRAG,
  LENS_VERT,
  SIDES,
  boneTexture,
  buildSingularity,
  makeBodyMaterials,
  writeBones
} from "./singularityModel";

export type SingularityAction = "walking" | "idle" | "emerging" | "attacking" | "casting" | "death" | "taunt";

export const SINGULARITY_ACTIONS: Array<{ id: SingularityAction; label: string }> = [
  { id: "idle", label: "Idle" },
  { id: "emerging", label: "Emerge" },
  { id: "walking", label: "Walk" },
  { id: "attacking", label: "Attack" },
  { id: "casting", label: "Cast" },
  { id: "taunt", label: "Taunt" },
  { id: "death", label: "Death" }
];

/* ------------------------------ math & keyframe interpolation ------------------------------ */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t)
];

interface BossPose {
  bodyPos: [number, number, number];
  bodyRot: [number, number, number];
  chestRot: [number, number, number];
  headRot: [number, number, number];
  plateSpread: number; // 0 = tight armor, 1 = fractured plates pulled apart by gravity surge
  lShoulderPos: [number, number, number];
  rShoulderPos: [number, number, number];
  lShoulderRot: [number, number, number];
  rShoulderRot: [number, number, number];
  lElbowRot: [number, number, number];
  rElbowRot: [number, number, number];
  lWristRot: [number, number, number];
  rWristRot: [number, number, number];
  lClaws: [number, number, number, number]; // 0 = menacing curve, 1 = tight slash curl, -0.35 = splayed wide
  rClaws: [number, number, number, number];
  coreScale: number;
  coreSurge: number;
}

/**
 * Target Reference Silhouette (A-Frame Outstretched Void Titan: / [  ] \):
 * - Massive upward-swept layered pauldrons
 * - Arms outstretched downward & outward at ~40° (imposing / [  ] \ stance, never tucked or crossing)
 * - Note: For a downward-hanging limb (y < 0), positive Z rotation swings +X outward, and negative Z rotation swings -X outward!
 */
const REST_POSE: BossPose = {
  bodyPos: [0, 3.25, 0],
  bodyRot: [0.04, 0, 0],
  chestRot: [0.03, 0, 0],
  headRot: [0.05, 0, 0],
  plateSpread: 0.0,
  lShoulderPos: [1.28, 0.72, 0],
  rShoulderPos: [-1.28, 0.72, 0],
  // Relaxed and a little uneven, never a mirrored puppet: shoulders rolled forward, elbows carried bent,
  // wrists cocked inward and the talons half-curled
  lShoulderRot: [0.02, -0.2, 0.5], // +Z swings the +X arm WIDE OUTWARD (/ [  ] \)
  rShoulderRot: [0.07, 0.16, -0.53], // -Z swings the -X arm WIDE OUTWARD (/ [  ] \)
  lElbowRot: [-0.6, 0.12, 0.08], // Forearm carried forward
  rElbowRot: [-0.5, -0.1, -0.1],
  lWristRot: [0.34, 0.14, -0.3], // Hand drooping, talons turned in
  rWristRot: [0.28, -0.12, 0.26],
  lClaws: [0.34, 0.42, 0.5, 0.58],
  rClaws: [0.3, 0.38, 0.46, 0.54],
  coreScale: 1.0,
  coreSurge: 0.0
};

/** A pose key: `hold` makes the motion settle on it (zero velocity) instead of carrying momentum through */
type PoseKey = { t: number; p: Partial<BossPose>; hold?: boolean };

const POSE_FIELDS = Object.keys(REST_POSE) as Array<keyof BossPose>;

function flattenPose(p: BossPose): number[] {
  const out: number[] = [];
  for (const k of POSE_FIELDS) {
    const v = p[k];
    if (Array.isArray(v)) out.push(...v);
    else out.push(v);
  }
  return out;
}

function unflattenPose(a: number[]): BossPose {
  const o: Record<string, number | number[]> = {};
  let i = 0;
  for (const k of POSE_FIELDS) {
    const ref = REST_POSE[k];
    if (Array.isArray(ref)) o[k] = ref.map(() => a[i++]);
    else o[k] = a[i++];
  }
  return o as unknown as BossPose;
}

/**
 * Cubic Hermite (Catmull-Rom) through the keys, so the body keeps its momentum through a key instead of stopping dead at each one
 * (strikes swing through their target, a leap hangs at its apex). Cycles wrap: a loop starting and ending on t 0 / t 1 flows round.
 */
function splinePose(u: number, keys: Array<{ t: number; v: number[]; hold?: boolean }>): number[] {
  const n = keys.length;
  let i = 0;
  while (i < n - 2 && u > keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const h = Math.max(0.0001, k1.t - k0.t);
  const s = clamp01((u - k0.t) / h);
  const cyclic = keys[0].t === 0 && keys[n - 1].t === 1;
  const neighbour = (j: number): { t: number; v: number[] } => {
    if (j < 0) return cyclic ? { t: keys[n - 2].t - 1, v: keys[n - 2].v } : keys[0];
    if (j >= n) return cyclic ? { t: keys[1].t + 1, v: keys[1].v } : keys[n - 1];
    return keys[j];
  };
  const tangent = (j: number) => {
    const k = keys[j];
    if (k.hold) return null;
    const a = neighbour(j - 1);
    const b = neighbour(j + 1);
    const span = Math.max(0.0001, b.t - a.t);
    return k.v.map((_, d) => (b.v[d] - a.v[d]) / span);
  };
  const m0 = tangent(i);
  const m1 = tangent(i + 1);
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return k0.v.map((v0, d) => h00 * v0 + h01 * k1.v[d] + h10 * h * (m0 ? m0[d] : 0) + h11 * h * (m1 ? m1[d] : 0));
}

/**
 * Samples a keyed action. With its `cycle` length (seconds) the limbs overlap like real ones: elbows trail the shoulders by
 * 0.05 s and the wrists and talons by 0.1 s, so arms drag into a swing and whip through after it.
 */
function sampleKeyframes(u: number, keys: PoseKey[], cycle = 0): BossPose {
  const full = keys.map((k) => ({ t: k.t, hold: k.hold, v: flattenPose({ ...REST_POSE, ...k.p }) }));
  const base = unflattenPose(splinePose(u, full));
  if (!cycle) return base;
  const wrap = (x: number) => ((x % 1) + 1) % 1;
  const el = unflattenPose(splinePose(wrap(u - 0.05 / cycle), full));
  const wr = unflattenPose(splinePose(wrap(u - 0.1 / cycle), full));
  return {
    ...base,
    lElbowRot: el.lElbowRot,
    rElbowRot: el.rElbowRot,
    lWristRot: wr.lWristRot,
    rWristRot: wr.rWristRot,
    lClaws: wr.lClaws,
    rClaws: wr.rClaws
  };
}

/* ------------------------------ effect shaders ------------------------------ */

// A quad's own plane coordinates (flares, shockwaves, the charge)
const XY_VERT = `
  varying vec2 vXY;
  void main() {
    vXY = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// A ribbon's uv (claw slashes)
const UV_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The burning eye: a white-hot core with a slit of light and a faint crimson corona, always facing the viewer
const STAR_FLARE_FRAG = `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec2 vXY;
  void main() {
    float r = length(vXY);
    if (r > 1.0) discard;
    float a = atan(vXY.y, vXY.x);
    float core = exp(-r * r * 68.0);
    float slitV = exp(-abs(vXY.x) * 30.0 - r * 4.6);
    float slitH = exp(-abs(vXY.y) * 40.0 - r * 7.0) * 0.45;
    float rays = (0.5 + 0.5 * sin(a * 7.0 + uTime * 3.2) * cos(a * 5.0 - uTime * 2.3)) * exp(-r * 7.5) * 0.4;
    float halo = exp(-r * 5.5) * 0.35;
    float pulse = 0.92 + 0.08 * sin(uTime * 4.5);
    float brightness = (core * 2.4 + (slitH + slitV) * 1.25 + rays + halo) * pulse * uIntensity * smoothstep(0.95, 0.22, r);
    vec3 col = mix(uColor, vec3(1.0, 0.96, 0.95), clamp(core + (slitH + slitV) * 0.55, 0.0, 1.0));
    gl_FragColor = vec4(col * 1.8, clamp(brightness, 0.0, 1.0));
  }
`;

// Particles (one draw, premultiplied): dust churning round the funnel's foot (drawn over, dark), grit lifting off the ground
// toward the body, matter spiralling into the core in the disc's plane and heating as it falls, and sparse white-hot sparks
const PARTICLE_VERT = `
  attribute vec4 aSeed;  // x: kind (0..1), y: radius seed, z: angle, w: speed
  attribute vec4 aExtra; // x: tilt, y: size, z: colour seed, w: phase
  uniform float uTime;
  uniform float uSurge;
  uniform float uViewH;
  uniform vec3 uCore;
  uniform vec3 uBase;
  uniform vec3 uDiskU;
  uniform vec3 uDiskV;
  varying float vAlpha;
  varying float vHot;
  varying float vClass;
  varying float vCol;
  void main() {
    float kind = aSeed.x;
    float br = aSeed.y;
    float a0 = aSeed.z;
    float spd = aSeed.w;
    vCol = aExtra.z;
    vec3 pos;
    float alpha;
    float hot = 0.0;
    float size = aExtra.y;
    float surge = max(uSurge, 0.0);
    if (kind < 0.3) {
      // Dust rolling out round the funnel's foot
      vClass = 0.0;
      float life = fract(a0 / 6.28318 + uTime * spd * 0.1 + aExtra.w);
      float ang = a0 + life * 4.0 + uTime * (0.5 + spd * 0.3);
      float r = mix(0.3, 2.7, sqrt(life)) * (0.7 + 0.6 * br);
      pos = uBase + vec3(cos(ang) * r, sin(life * 3.14159) * (0.25 + br * 0.6), sin(ang) * r);
      alpha = sin(life * 3.14159) * 0.5;
      size *= 3.2 * (0.6 + life);
    } else if (kind < 0.5) {
      // Grit lifted off the ground, spiralling up toward the body
      vClass = 1.0;
      float life = fract(a0 / 6.28318 + uTime * spd * 0.08 + aExtra.w);
      float k = pow(life, 1.6);
      float r = mix(1.3 + br * 2.0, 0.6, k);
      float ang = a0 + k * 3.0 + uTime * 0.3;
      pos = vec3(uBase.x + cos(ang) * r, mix(0.05, uCore.y - 0.4, k), uBase.z + sin(ang) * r);
      alpha = sin(life * 3.14159) * 0.6;
      hot = 0.15 + k * 0.3;
    } else if (kind < 0.85) {
      // Matter falling into the core along the disc, faster and hotter as it nears the horizon
      vClass = 2.0;
      float cycle = fract(a0 / 6.28318 + uTime * spd * 0.3 + aExtra.w);
      float inv = 1.0 - pow(cycle, 1.65);
      float r = mix(0.5, 3.4, inv) * (0.85 + br * 0.3);
      float ang = a0 + (1.0 - inv) * 9.5 + uTime * 1.2;
      pos = uCore + (uDiskU * cos(ang) + uDiskV * sin(ang)) * r + cross(uDiskU, uDiskV) * sin(ang * 2.0 + aExtra.x) * 0.12 * inv;
      alpha = smoothstep(0.0, 0.16, cycle) * smoothstep(1.0, 0.9, cycle) * 0.9;
      hot = smoothstep(0.45, 0.92, cycle);
      size *= mix(1.0, 0.55, cycle);
    } else {
      // Sparks flung off the ring, curving back in
      vClass = 3.0;
      float c = fract(a0 / 6.28318 + uTime * (0.6 + spd * 0.45) + aExtra.w);
      float win = smoothstep(0.0, 0.06, c) * smoothstep(0.38, 0.14, c);
      float k = clamp(c / 0.38, 0.0, 1.0);
      float r = mix(0.55 + br * 0.9, 0.48, k * k);
      float ang = a0 + k * 2.4;
      pos = uCore + (uDiskU * cos(ang) + uDiskV * sin(ang)) * r + vec3(0.0, sin(k * 3.14159) * 0.22, 0.0);
      alpha = win;
      hot = 0.95;
      size *= 0.7;
    }
    vAlpha = alpha * (0.85 + min(0.5, surge * 0.3));
    vHot = clamp(hot + surge * 0.2, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float scale = length(modelMatrix[0].xyz);
    gl_PointSize = clamp(size * scale * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.01), 1.5, 48.0);
  }
`;
const PARTICLE_FRAG = `
  varying float vAlpha;
  varying float vHot;
  varying float vClass;
  varying float vCol;
  vec3 prism(float h) { return 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }
  void main() {
    if (vAlpha <= 0.01) discard;
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    if (vClass < 0.5) {
      // Dust: a soft dark puff, drawn over
      float a = exp(-r * r * 3.0) * (1.0 - r) * vAlpha;
      vec3 col = mix(vec3(0.24, 0.19, 0.18), vec3(0.42, 0.33, 0.3), vCol);
      gl_FragColor = vec4(col * a, a);
      return;
    }
    float core = exp(-r * r * 22.0);
    float halo = exp(-r * 4.0) * 0.4;
    vec3 base = mix(vec3(0.9, 0.06, 0.14), vec3(1.0, 0.45, 0.4), vCol * 0.6);
    if (vClass > 2.5) base = mix(base, prism(vCol * 3.0), 0.5);
    vec3 col = mix(base, vec3(1.0, 0.95, 0.93), clamp(core * 0.7 + vHot * 0.5, 0.0, 1.0));
    float b = (core * 1.6 + halo) * vAlpha;
    gl_FragColor = vec4(col * b * 1.5, 0.0);
  }
`;

// A claw slash: three tears of light racing along a ribbon
const CLAW_SLASH_FRAG = `
  uniform float uProgress;
  uniform float uAlpha;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    if (uAlpha <= 0.01) discard;
    float head = smoothstep(uProgress + 0.08, uProgress - 0.05, vUv.x);
    float tail = smoothstep(max(0.0, uProgress - 0.65), uProgress - 0.1, vUv.x);
    float arcMask = head * tail * sin(vUv.x * 3.14159);
    float c1 = smoothstep(0.1, 0.0, abs(vUv.y - 0.20));
    float c2 = smoothstep(0.12, 0.0, abs(vUv.y - 0.50));
    float c3 = smoothstep(0.1, 0.0, abs(vUv.y - 0.80));
    float claws = max(c1, max(c2 * 1.25, c3));
    if (claws * arcMask < 0.02) discard;
    vec3 hot = mix(uColor, vec3(1.0, 0.95, 0.94), claws * claws * head);
    gl_FragColor = vec4(hot * 2.4, claws * arcMask * uAlpha);
  }
`;

// A ring of dust kicked up by an impact (drawn over, premultiplied), its leading edge lit
const SHOCKWAVE_FRAG = `
  uniform float uWave;
  uniform vec3 uColor;
  varying vec2 vXY;
  void main() {
    if (uWave <= 0.001 || uWave >= 0.999) discard;
    float r = length(vXY);
    float a = atan(vXY.y, vXY.x);
    float target = uWave * 0.95;
    float lumpy = 0.65 + 0.35 * sin(a * 9.0 + r * 20.0) * sin(a * 5.0 - 1.3);
    float band = smoothstep(0.09, 0.0, abs(r - target)) * lumpy;
    float wake = smoothstep(target, max(0.0, target - 0.3), r) * step(r, target) * 0.3;
    float fade = 1.0 - pow(uWave, 1.35);
    float al = clamp((band * 0.75 + wake) * fade, 0.0, 1.0);
    vec3 col = vec3(0.3, 0.24, 0.23) * al + uColor * band * fade * 0.3;
    gl_FragColor = vec4(col, al * 0.8);
  }
`;

// The charge: void energy streaking in from all round and spiralling down into the core (Cast; the pounce)
const CHARGE_VORTEX_FRAG = `
  uniform float uTime;
  uniform float uCharge;
  varying vec2 vXY;
  float vh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = vh(vec2(mod(i.x, period), i.y));
    float b = vh(vec2(mod(i.x + 1.0, period), i.y));
    float c = vh(vec2(mod(i.x, period), i.y + 1.0));
    float d = vh(vec2(mod(i.x + 1.0, period), i.y + 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  void main() {
    float r = length(vXY);
    if (r > 1.0 || uCharge <= 0.001) discard;
    float a = atan(vXY.y, vXY.x) / 6.28318 + 0.5;
    float lr = log(max(r, 0.02));
    float flowA = vn(vec2(a * 40.0 + lr * 6.0, lr * 3.5 + uTime * 2.6), 40.0);
    float flowB = vn(vec2(a * 24.0 - lr * 4.0 + 7.0, lr * 2.2 + uTime * 1.7), 24.0);
    float streaks = pow(flowA, 5.0) * 2.6 + pow(flowB, 4.0) * 1.2;
    float edge = smoothstep(1.0, 0.55, r);
    float inner = smoothstep(0.06, 0.24, r);
    float hot = exp(-r * 7.0) * (0.6 + uCharge * 1.4);
    float b = (streaks * edge * inner * (0.5 + r * 0.8) + hot) * uCharge;
    vec3 col = mix(vec3(0.62, 0.03, 0.1), vec3(1.0, 0.32, 0.36), smoothstep(0.9, 0.25, r));
    col = mix(col, vec3(1.0, 0.96, 0.95), exp(-r * 9.0));
    gl_FragColor = vec4(col * b * 1.7, clamp(b, 0.0, 1.0));
  }
`;

// The rift it tears its way out of (Emerge; premultiplied): a hairline of white-hot light running up and down from the
// middle, splitting into a ragged lens of void (black, a violet-crimson churn deep in it) with a razor rim, a prismatic
// fringe and crimson light bleeding out; on the break the rim dies and a ring of light races out. Model units in vXY
const RIFT_FRAG = `
  uniform float uTime;
  uniform float uCrack;  // how far the tear has run from the middle to its ends (0–1)
  uniform float uOpen;   // half-width of the hole at its widest
  uniform float uBreak;  // 0 whole … 1 shattered and gone
  uniform float uHalfH;
  varying vec2 vXY;
  float rh(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  float rn(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(rh(i), rh(i + 1.0), f);
  }
  vec3 prism(float h) { return 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }
  void main() {
    if (uCrack <= 0.001) discard;
    vec2 p = vXY;
    float y = p.y / uHalfH;
    float ay = abs(y);
    // The tear's jagged middle line, pulled straighter as it opens
    float kink = (rn(p.y * 3.1 + 4.0) - 0.5) * 0.34 + (rn(p.y * 9.0 + 17.0) - 0.5) * 0.1;
    float cx = kink * (1.0 - 0.55 * clamp(uOpen / 2.5, 0.0, 1.0));
    // Its half-width here: a lens tapering to points, the edges ragged and crawling
    float taper = sqrt(max(1.0 - y * y, 0.0));
    float rag = 1.0 + (rn(p.y * 7.0 + uTime * 0.6) - 0.5) * 0.28 + (rn(p.y * 23.0 - uTime * 1.3) - 0.5) * 0.12;
    float hw = uOpen * taper * rag;
    float d = abs(p.x - cx) - hw;
    float run = step(ay, uCrack);
    // Distance outside the tear (past its running ends too, so its light rounds off there)
    float de = length(vec2(max(d, 0.0), max(ay - uCrack, 0.0) * uHalfH));
    float dr = run > 0.5 ? abs(d) : de;
    float whole = 1.0 - smoothstep(0.0, 0.45, uBreak);
    float flick = 0.85 + 0.15 * sin(uTime * 37.0 + p.y * 5.0);

    // The void through the hole
    float inside = step(d, 0.0) * run;
    float r = length(vec2((p.x - cx) / max(hw, 0.05), y));
    float ang = atan(y, p.x - cx);
    float churn = rn(ang * 3.0 + r * 4.0 - uTime * 0.9) * rn(r * 6.0 + uTime * 0.5 + ang * 2.0);
    vec3 voidCol = mix(vec3(0.01, 0.0, 0.02), vec3(0.24, 0.03, 0.17), churn * smoothstep(1.1, 0.2, r)) + vec3(0.5, 0.05, 0.12) * exp(-r * r * 6.0) * 0.25;
    float voidA = inside * 0.97 * whole;

    // The rim: a razor of white-hot light, then a prismatic crimson glow bleeding out
    float razor = exp(-dr * dr * 900.0);
    float glow = (exp(-de * 2.6) * 0.55 + exp(-de * 9.0) * 0.6) * (1.0 - inside);
    vec3 rim = (vec3(1.0, 0.93, 0.97) * razor * 2.2 + mix(vec3(0.95, 0.07, 0.25), prism(p.y * 0.25 + uTime * 0.15), 0.35) * glow) * flick * whole;

    // The break: a ring of light racing out from the middle
    float br = length(vec2(p.x, p.y * 0.8));
    float ringR = uBreak * 9.0;
    float ring = exp(-(br - ringR) * (br - ringR) * 2.0) * (1.0 - uBreak) * step(0.001, uBreak);

    gl_FragColor = vec4(voidCol * voidA + rim + vec3(1.0, 0.75, 0.85) * ring * 1.6, voidA);
  }
`;

// 13. Cinematic screen FX (a full-screen quad drawn last, premultiplied): tinted flashes with a racing ring, speed lines
// bursting from the core, a pulsing vignette, and the void that swallows the panel and opens again (Casting Spells)
const BLACKOUT_VERT = `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const BLACKOUT_FRAG = `
  uniform vec2 uCenter;
  uniform float uAspect;
  uniform float uTime;
  uniform float uFlash;
  uniform vec3 uFlashCol;
  uniform float uLines;
  uniform float uVignette;
  uniform vec3 uVigCol;
  uniform float uSwallow; // radius of the black void spreading out from the core (-1 = off)
  uniform float uOpen;    // radius of the hole opening in the black again (-1 = off)
  uniform float uHeart;   // faint heartbeat of the core in the dark
  varying vec2 vNdc;
  float bh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float bn(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = bh(vec2(mod(i.x, period), i.y));
    float b = bh(vec2(mod(i.x + 1.0, period), i.y));
    float c = bh(vec2(mod(i.x, period), i.y + 1.0));
    float d = bh(vec2(mod(i.x + 1.0, period), i.y + 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  vec3 prism(float h) { return 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }
  void main() {
    vec2 d = vNdc - uCenter;
    d.x *= uAspect;
    float r = length(d);
    float ang = atan(d.y, d.x) / 6.28318 + 0.5;
    float wob = (bn(vec2(ang * 18.0, uTime * 1.8), 18.0) - 0.5) * 0.16 + (bn(vec2(ang * 44.0, uTime * 3.1), 44.0) - 0.5) * 0.05;

    float black = 0.0;
    float rimD = 10.0;
    if (uSwallow >= 0.0) {
      float e = uSwallow * (1.0 + wob);
      black = 1.0 - smoothstep(e - 0.015, e + 0.015, r);
      rimD = r - e;
    }
    if (uOpen >= 0.0) {
      float e = uOpen * (1.0 + wob);
      black = smoothstep(e - 0.02, e + 0.02, r);
      rimD = e - r;
    }
    // The void's edge: a razor of white-hot light with a prismatic fringe and a crimson glow bleeding outward
    float razor = exp(-rimD * rimD * 3000.0);
    float fringe = exp(-max(rimD, 0.0) * 9.0) * step(0.0, rimD) * 0.85;
    vec3 rimCol = vec3(1.0, 0.92, 1.0) * razor * 1.6 + mix(vec3(0.95, 0.08, 0.28), prism(ang * 3.0 + uTime * 0.2), 0.45) * fringe;
    float rimA = clamp(razor + fringe * 0.8, 0.0, 1.0);

    // Flash: a tinted wash brightest at the core, plus a ring racing outward
    float ringR = (1.0 - uFlash) * 2.2;
    float ring = exp(-pow(abs((r - ringR) * 9.0), 2.0)) * uFlash;
    vec3 flashCol = mix(uFlashCol, vec3(1.0), exp(-r * 1.6)) * (uFlash * (0.55 + 0.45 * exp(-r * 1.2)) + ring * 1.4);
    float flashA = clamp(uFlash * 0.6 + ring * 0.5, 0.0, 1.0);

    // Speed lines bursting out from the core, re-dealt 24 times a second
    float seed = floor(uTime * 24.0);
    float lineN = bn(vec2(ang * 150.0, seed), 150.0);
    float lines = pow(lineN, 10.0) * smoothstep(0.16, 0.95, r) * uLines * 2.4;
    vec3 lineCol = mix(uFlashCol, vec3(1.0), 0.65) * lines;

    // Vignette closing in from the panel's edges, tinted at its inner edge
    vec2 sv = vNdc;
    sv.x *= mix(1.0, uAspect, 0.5);
    float vr = length(sv);
    float vig = smoothstep(0.42, 1.45, vr) * uVignette;
    float vigEdge = exp(-pow(abs((vr - mix(1.45, 0.42, 0.55)) * 3.0), 2.0)) * uVignette;

    // In the dark, the core's heartbeat: a faint crimson pulse where it will reform
    float beat = pow(0.5 + 0.5 * sin(uTime * 7.0), 6.0);
    vec3 heart = vec3(0.9, 0.1, 0.25) * exp(-r * r * 60.0) * uHeart * (0.35 + beat * 0.9) + vec3(0.5, 0.15, 0.8) * exp(-r * 3.0) * uHeart * 0.08;

    float dark = max(black, vig * 0.82);
    vec3 light = heart * black + rimCol + flashCol + lineCol * (1.0 - black) + uVigCol * vigEdge * 0.4;
    float a = max(dark, max(flashA, rimA * 0.6));
    if (a < 0.002 && dot(light, vec3(1.0)) < 0.002) discard;
    gl_FragColor = vec4(light, a);
  }
`;

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** The particles: dust, grit, infalling matter and sparks (kind by index), each with its own seeded path */
function makeParticleGeo(count: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  const extras = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const kind = i / count;
    seeds.set([kind, hash01(i * 1.13 + 0.1), hash01(i * 2.47 + 0.3) * Math.PI * 2, 0.35 + hash01(i * 3.89 + 0.7) * 0.72], i * 4);
    extras.set([hash01(i * 5.17 + 1.1) * 6.28, 0.05 + Math.pow(hash01(i * 8.31 + 2.7), 2.2) * 0.09, hash01(i * 9.97 + 3.3), hash01(i * 6.73 + 1.9)], i * 4);
  }
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  g.setAttribute("aExtra", new THREE.BufferAttribute(extras, 4));
  return g;
}

/* ------------------------------ Physics State Types ------------------------------ */

interface DebrisParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  angVel: THREE.Vector3;
  scale: number;
  active: boolean;
}

interface DetachablePiece {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  angVel: THREE.Vector3;
}

const VORTEX_TIER_COUNT = 7;

/** Each arm's armour plates at rest, per side; they float on their own round the joints (see the arm follow-through) */
const ARM_PLATES: Array<{ id: string; at: (side: 1 | -1) => { pos: [number, number, number]; rot: [number, number, number] } }> = [
  { id: "upper", at: (side) => ({ pos: [side * 0.1, -0.5, 0], rot: [0, 0, side * 0.08] }) },
  { id: "spike", at: (side) => ({ pos: [side * 0.18, 0.08, -0.14], rot: [-0.45, 0, side * -0.4] }) },
  { id: "forearm", at: () => ({ pos: [0, -0.55, 0.04], rot: [0, 0, 0] }) },
  { id: "crest", at: (side) => ({ pos: [side * 0.22, -0.4, -0.08], rot: [0.25, 0, side * -0.32] }) },
  { id: "hand", at: () => ({ pos: [0, -0.2, 0.04], rot: [0, 0, 0] }) }
];
/** Casting Spells: charge, collapse, self-destruct, blackout and reform, in seconds */
const CAST_CYCLE = 7.0;
/**
 * Emerge (seconds; played once, then it idles where it came out): the rift tears open, the talons pierce it, hook round
 * its edges and wrench it wide in two heaves, a coil, then it breaks out at `BURST_T`, its ground dragged through after it
 */
const EMERGE_CYCLE = 6.2;
const BURST_T = 3.9;
/** The rift: a tear standing in front of the titan (its plane, the height of its middle and half its height) */
const RIFT_Z = 0.95;
const RIFT_Y = 3.4;
const RIFT_H = 3.9;
/** Splinters of the rift's rim flung out when it breaks (one instanced draw) */
const RIFT_SHARDS = 40;
/** How far back the ground waits until the body has broken out */
const GROUND_BACK = -7;

/** Piecewise smooth through [seconds, value] keys */
function track(s: number, keys: Array<[number, number]>): number {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (s <= t1) {
      const [t0, v0] = keys[i - 1];
      return lerp(v0, v1, smooth((s - t0) / Math.max(1e-4, t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}
/** The event horizon's radius, and the accretion disc's inner and outer edge (chest units) */
const HORIZON_R = 0.42;
const DISC_IN = 0.5;
const DISC_OUT = 1.15;
/** How the disc lies in the chest (its normal tilted up and toward the viewer, rolled a little) */
const DISC_ROT: [number, number, number] = [-0.88, 0, 0.15];

/**
 * Xal'Vorath, the Devouring Singularity, in high graphics (the Codex, and its cast on the login flyover). A void titan of basalt and obsidian held together
 * by its own gravity: a ribcage of obsidian round a black hole in a blazing accretion disc (a real sphere, a tilted disc and
 * a lensing ring that faces the viewer), a basalt spine with dorsal spikes, a faceted helm with one burning eye under a
 * broken crown of floating spires, pauldrons of floating slabs with upswept blades, arms of rock held apart at the joints by
 * gravity orbs ending in long glossy talons, a vortex of rock and obsidian spiralling down into a funnel of churning dust;
 * shattered ground and fallen temple columns round it, ruins orbiting, rubble lifting off the earth. Every part rides a bone
 * of one skeleton (`singularityModel.ts`), so the whole titan is three draws; the pose code below drives the bones.
 */
export function HighGraphicsSingularity({
  action: requested,
  reflections = true,
  screenFx = true,
  lights = true,
  timeOffset = 0,
  pace = 1
}: {
  action: SingularityAction;
  /** Off where the view brings its own (the login flyover's HD map) */
  reflections?: boolean;
  /** The full-screen flash, speed lines, vignette and void; off while it only stands in a bigger scene (the login flyover's tour) */
  screenFx?: boolean;
  /** Its stage lights; off on the world map, where a light would recompile and slow every material in the realm */
  lights?: boolean;
  /** Seconds into an action it starts at, and how fast it plays them: several on the map never move in step */
  timeOffset?: number;
  pace?: number;
}) {
  useStudioReflections(0.5, reflections);
  const gl = useThree((s) => s.gl);

  const rootRef = useRef<THREE.Group>(null);
  const coreVisRef = useRef<THREE.Group>(null);
  const discRef = useRef<THREE.Mesh>(null);
  const lensRef = useRef<THREE.Mesh>(null);
  const chargeRef = useRef<THREE.Mesh>(null);
  const eyeRef = useRef<THREE.Mesh>(null);
  const slashRightRef = useRef<THREE.Mesh>(null);
  const slashLeftRef = useRef<THREE.Mesh>(null);
  const slashX1Ref = useRef<THREE.Mesh>(null);
  const slashX2Ref = useRef<THREE.Mesh>(null);
  const shock1Ref = useRef<THREE.Mesh>(null);
  const shock2Ref = useRef<THREE.Mesh>(null);
  const novaSphereRef = useRef<THREE.Mesh>(null);
  const blackoutRef = useRef<THREE.Mesh>(null);
  const funnelRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const riftRef = useRef<THREE.Mesh>(null);
  const riftShardsRef = useRef<THREE.InstancedMesh>(null);

  /** `local` is the action's own clock (it stands still during hit-stop); `lastHit` tracks impacts that fire cinematic FX once */
  const stateRef = useRef<{ action: SingularityAction; start: number; lastPhase: number; local: number; hitStop: number; lastHit: number }>({
    action: requested,
    start: 0,
    lastPhase: -1,
    local: timeOffset,
    hitStop: 0,
    lastHit: -1
  });

  // Real-Time Secondary Spring-Damper, Helical Vortex Pendulum & Ballistic Debris Physics
  const physRef = useRef({
    // Cinematic transients that decay on their own: screen quake, flash, speed lines, vignette
    fx: { quake: 0, flash: 0, flashCol: new THREE.Color("#ffffff"), lines: 0, vig: 0, vigCol: new THREE.Color("#450a0a") },
    springPos: new THREE.Vector3(),
    springVel: new THREE.Vector3(),
    springRot: new THREE.Vector3(),
    springRotVel: new THREE.Vector3(),
    prevBodyPos: new THREE.Vector3(0, 3.25, 0),
    vortexLagX: Array.from({ length: VORTEX_TIER_COUNT }, () => 0),
    vortexLagZ: Array.from({ length: VORTEX_TIER_COUNT }, () => 0),
    vortexVelX: Array.from({ length: VORTEX_TIER_COUNT }, () => 0),
    vortexVelZ: Array.from({ length: VORTEX_TIER_COUNT }, () => 0),
    // Arms swinging on a spring against the body's motion (pitch, spread, twist), and the body's last yaw
    armLag: new THREE.Vector3(),
    armLagVel: new THREE.Vector3(),
    prevBodyYaw: 0,
    // The pauldron slabs trail the shoulders on a softer spring; each crown spire trails the head on its own
    slabLag: new THREE.Vector3(),
    slabLagVel: new THREE.Vector3(),
    prevHead: new THREE.Vector2(),
    crownLag: [] as Array<{ x: number; z: number; vx: number; vz: number }>,
    debris: Array.from({ length: 18 }, (): DebrisParticle => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(),
      angVel: new THREE.Vector3(),
      scale: 1,
      active: false
    })),
    // The rift's rim, broken into splinters (Emerge)
    riftShards: Array.from({ length: RIFT_SHARDS }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, size: 1 })),
    pieces: Array.from({ length: 6 }, (): DetachablePiece => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(),
      angVel: new THREE.Vector3()
    }))
  });

  // On death the aura gutters out as the titan falls apart, then flares back as the loop restarts; it surges while casting
  const auraGain = useCallback(() => {
    const st = stateRef.current;
    let k = 1;
    if (st.action === "death") {
      const u = (st.local % 4.2) / 4.2;
      k = u < 0.42 ? 1 - smooth(u / 0.42) * 0.75 : u < 0.9 ? 0.25 : 0.25 + smooth((u - 0.9) / 0.1) * 0.75;
    } else if (st.action === "emerging") {
      // Nothing of it is in this world until it breaks out; then its light flares and settles
      k = st.local < BURST_T ? 0 : 1 + 1.4 * Math.exp(-(st.local - BURST_T) * 3);
    } else if (st.action === "casting") {
      // Light is sucked into the core while it charges, bursts out with the blast, and is gone in the dark
      const u = (st.local % CAST_CYCLE) / CAST_CYCLE;
      if (u < 0.43) k = 1 - smooth(u / 0.43) * 0.7;
      else if (u < 0.49) k = 0.3;
      else if (u < 0.58) k = 0.3 + (1 - smooth((u - 0.49) / 0.09)) * 2.2;
      else if (u < 0.8) k = 0;
      else k = smooth((u - 0.8) / 0.12);
    }
    // A creature's curtain stays faint: the light here is the core's
    return k * 0.75;
  }, []);

  const built = useMemo(() => {
    const rig = buildSingularity();
    const u = {
      time: { value: 0 },
      surge: { value: 0 },
      core: { value: new THREE.Vector3(0, 3.33, 0.16) },
      bones: { value: boneTexture(rig.bones.length) },
      glow: { value: 1 }
    };
    const body = makeBodyMaterials(u);
    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } as const;
    const premultiplied = {
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor
    } as const;
    const slash = (color: string) =>
      new THREE.ShaderMaterial({ ...additive, uniforms: { uProgress: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) } }, vertexShader: UV_VERT, fragmentShader: CLAW_SLASH_FRAG });
    const shock = (color: string) => new THREE.ShaderMaterial({ ...premultiplied, side: THREE.DoubleSide, uniforms: { uWave: { value: 0 }, uColor: { value: new THREE.Color(color) } }, vertexShader: XY_VERT, fragmentShader: SHOCKWAVE_FRAG });
    const mats = {
      ...body,
      horizon: new THREE.MeshBasicMaterial({ color: "#000000" }),
      disc: new THREE.ShaderMaterial({ ...additive, uniforms: { uTime: u.time, uGain: { value: 1 }, uIn: { value: DISC_IN }, uOut: { value: DISC_OUT } }, vertexShader: DISC_VERT, fragmentShader: DISC_FRAG }),
      lens: new THREE.ShaderMaterial({ ...additive, uniforms: { uTime: u.time, uGain: { value: 1 }, uDop: { value: 0 } }, vertexShader: LENS_VERT, fragmentShader: LENS_FRAG }),
      funnel: new THREE.ShaderMaterial({
        ...premultiplied,
        side: THREE.DoubleSide,
        uniforms: { uTime: u.time, uGain: { value: 1 }, uPath: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) } },
        vertexShader: FUNNEL_VERT,
        fragmentShader: FUNNEL_FRAG
      }),
      starFlare: new THREE.ShaderMaterial({ ...additive, uniforms: { uTime: u.time, uIntensity: { value: 1.3 }, uColor: { value: new THREE.Color("#ff4d5e") } }, vertexShader: XY_VERT, fragmentShader: STAR_FLARE_FRAG }),
      particles: new THREE.ShaderMaterial({
        ...premultiplied,
        uniforms: {
          uTime: u.time,
          uSurge: u.surge,
          uViewH: { value: 800 },
          uCore: u.core,
          uBase: { value: new THREE.Vector3(0, 0.05, 0) },
          uDiskU: { value: new THREE.Vector3(1, 0, 0) },
          uDiskV: { value: new THREE.Vector3(0, 1, 0) }
        },
        vertexShader: PARTICLE_VERT,
        fragmentShader: PARTICLE_FRAG
      }),
      slashRight: slash("#fb7185"),
      slashLeft: slash("#f43f5e"),
      slashX: slash("#e11d48"),
      shock1: shock("#fb7185"),
      shock2: shock("#fecaca"),
      novaMat: new THREE.MeshBasicMaterial({ color: "#fb7185", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      chargeVortex: new THREE.ShaderMaterial({ ...additive, uniforms: { uTime: u.time, uCharge: { value: 0 } }, vertexShader: XY_VERT, fragmentShader: CHARGE_VORTEX_FRAG }),
      blackout: new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        // Premultiplied: the shader's alpha darkens what is behind, its colour is added on top
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        uniforms: {
          uCenter: { value: new THREE.Vector2() },
          uAspect: { value: 1 },
          uTime: { value: 0 },
          uFlash: { value: 0 },
          uFlashCol: { value: new THREE.Color("#ffe4e6") },
          uLines: { value: 0 },
          uVignette: { value: 0 },
          uVigCol: { value: new THREE.Color("#450a0a") },
          uSwallow: { value: -1 },
          uOpen: { value: -1 },
          uHeart: { value: 0 }
        },
        vertexShader: BLACKOUT_VERT,
        fragmentShader: BLACKOUT_FRAG
      }),
      rift: new THREE.ShaderMaterial({
        ...premultiplied,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uCrack: { value: 0 }, uOpen: { value: 0 }, uBreak: { value: 0 }, uHalfH: { value: RIFT_H } },
        vertexShader: XY_VERT,
        fragmentShader: RIFT_FRAG
      }),
      // Splinters of white-hot rim (instance colours, bright enough to bloom)
      riftShard: new THREE.MeshBasicMaterial({ toneMapped: false })
    };
    const geos = {
      ...rig.geos,
      horizon: new THREE.SphereGeometry(HORIZON_R, 48, 32),
      disc: new THREE.RingGeometry(DISC_IN, DISC_OUT, 128, 6),
      quad: new THREE.PlaneGeometry(2, 2),
      lens: new THREE.PlaneGeometry(6, 6),
      funnel: new THREE.CylinderGeometry(1, 1, 1, 40, 28, true),
      particles: makeParticleGeo(640),
      slashRibbon: new THREE.RingGeometry(1.5, 2.9, 36, 8, -Math.PI * 0.58, Math.PI * 1.16),
      novaSphere: new THREE.SphereGeometry(1.0, 32, 24),
      riftQuad: new THREE.PlaneGeometry(13, 11),
      riftShard: new THREE.ConeGeometry(0.22, 1, 3, 1).scale(1, 1, 0.35)
    };
    geos.particles.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.5, 0), 8);
    // Emerge: what is still behind the rift is cut away while it comes through (the plane sits far off otherwise)
    const clip = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e6);
    for (const m of [mats.rock, mats.obsidian, mats.glow, mats.horizon]) m.clippingPlanes = [clip];
    return { rig, B: rig.B, u, mats, geos, clip };
  }, []);

  useEffect(
    () => () => {
      Object.values(built.geos).forEach((g) => g.dispose());
      Object.values(built.mats).forEach((m) => m.dispose());
      built.u.bones.value.dispose();
    },
    [built]
  );

  useEffect(() => {
    // The rift's cut (Emerge) is a clipping plane on the titan's own materials
    const prev = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    return () => void (gl.localClippingEnabled = prev);
  }, [gl]);

  useEffect(() => {
    // Each splinter its own heat: white-hot, rose, crimson or violet
    const mesh = riftShardsRef.current;
    if (!mesh) return;
    const c = new THREE.Color();
    const tones = ["#ffffff", "#ffd1dc", "#ff3b5c", "#c084fc"];
    for (let i = 0; i < RIFT_SHARDS; i++) mesh.setColorAt(i, c.set(tones[Math.floor(hash01(i * 13.7 + 0.5) * tones.length)]).multiplyScalar(1.8));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  // Scratch for the frame
  const scratch = useMemo(
    () => ({ v: new THREE.Vector3(), w: new THREE.Vector3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), m: new THREE.Matrix4(), s: new THREE.Vector3(), e: new THREE.Euler(), core: new THREE.Vector3(), arm: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] }),
    []
  );

  const spawnDebrisBurst = (originX: number, originZ: number, power = 1.0) => {
    const p = physRef.current;
    p.debris.forEach((d, i) => {
      const a = (i / p.debris.length) * Math.PI * 2 + (i % 3) * 0.2;
      const speed = (2.2 + (i % 4) * 0.95) * power;
      d.pos.set(originX + Math.cos(a) * 0.4, 0.12, originZ + Math.sin(a) * 0.4);
      d.vel.set(Math.cos(a) * speed, (4.0 + (i % 5) * 1.1) * power, Math.sin(a) * speed);
      d.rot.set(i * 0.7, i * 1.3, 0);
      d.angVel.set((i % 2 ? 1 : -1) * 8, (i % 3 ? 1 : -1) * 6, 5);
      d.scale = 0.5 + (i % 4) * 0.25;
      d.active = true;
    });
  };

  /** The rift breaks: splinters of its rim and rocks flung out from its edges, toward the viewer */
  const breakRift = (open: number) => {
    const p = physRef.current;
    const edge = (i: number, k: number) => {
      const y = (hash01(i * 3.1 + k) * 2 - 1) * 0.92;
      const side = i % 2 ? 1 : -1;
      return { side, x: side * open * Math.sqrt(Math.max(0, 1 - y * y)) * (0.85 + hash01(i * 5.3 + k) * 0.3), y: RIFT_Y + y * RIFT_H };
    };
    p.riftShards.forEach((sh, i) => {
      const e = edge(i, 0.4);
      sh.pos.set(e.x, e.y, RIFT_Z + 0.05);
      sh.vel.set(e.side * (1.5 + hash01(i * 7.7) * 5) + e.x * 0.4, (hash01(i * 2.3) - 0.35) * 5, 1.5 + hash01(i * 4.9) * 5);
      sh.rot.set(hash01(i) * 6, hash01(i * 1.7) * 6, hash01(i * 2.9) * 6);
      sh.spin.set((hash01(i * 6.1) - 0.5) * 14, (hash01(i * 8.3) - 0.5) * 14, (hash01(i * 9.1) - 0.5) * 14);
      sh.life = 1;
      sh.size = 0.35 + hash01(i * 11.3) * 0.7;
    });
    p.debris.forEach((d, i) => {
      const e = edge(i, 7.9);
      d.pos.set(e.x * 0.9, e.y, RIFT_Z);
      d.vel.set(e.side * (2 + hash01(i * 3.3) * 4), 1 + hash01(i * 5.9) * 4, 2 + hash01(i * 7.1) * 4);
      d.rot.set(i * 0.7, i * 1.3, 0);
      d.angVel.set((i % 2 ? 1 : -1) * 8, (i % 3 ? 1 : -1) * 6, 5);
      d.scale = 0.5 + (i % 4) * 0.25;
      d.active = true;
    });
  };

  /** Fires cinematic FX for an impact: screen quake, a tinted flash, speed lines, a vignette, and hit-stop (seconds of frozen time) */
  const cine = (o: { quake?: number; flash?: number; flashCol?: string; lines?: number; vig?: number; vigCol?: string; stop?: number }) => {
    const fx = physRef.current.fx;
    const st = stateRef.current;
    if (o.quake) fx.quake = Math.max(fx.quake, o.quake);
    if (o.flash && o.flash >= fx.flash) {
      fx.flash = o.flash;
      fx.flashCol.set(o.flashCol ?? "#ffffff");
    }
    if (o.lines) fx.lines = Math.max(fx.lines, o.lines);
    if (o.vig && o.vig >= fx.vig) {
      fx.vig = o.vig;
      fx.vigCol.set(o.vigCol ?? "#450a0a");
    }
    if (o.stop) st.hitStop = Math.max(st.hitStop, o.stop);
  };

  const addSpringImpulse = (vy: number, vz: number, rPitch: number, rYaw: number, rRoll: number) => {
    const p = physRef.current;
    p.springVel.y += vy;
    p.springVel.z += vz;
    p.springRotVel.x += rPitch;
    p.springRotVel.y += rYaw;
    p.springRotVel.z += rRoll;
  };

  useFrame(({ clock, camera, size: viewSize }, rawDelta) => {
    const rawDt = Math.min(0.05, rawDelta);
    const t = clock.elapsedTime;
    const st = stateRef.current;
    const phys = physRef.current;
    const { B, mats, u: U } = built;
    // Hit-stop: the action (and its physics) nearly freezes for a beat on a heavy impact
    const dt = rawDt * (st.hitStop > 0 ? 0.05 : 1);
    st.hitStop = Math.max(0, st.hitStop - rawDt);

    if (st.action !== requested) {
      st.action = requested;
      phys.riftShards.forEach((sh) => {
        sh.life = 0;
      });
      st.start = t;
      st.lastPhase = -1;
      st.local = timeOffset;
      st.lastHit = -1;
      st.hitStop = 0;
      Object.assign(phys.fx, { quake: 0, flash: 0, lines: 0, vig: 0 });
      phys.debris.forEach((d) => {
        d.active = false;
      });
    }
    st.local += dt * pace;
    const localT = st.local;
    // Emerge plays once; then it idles where it came out
    const action: SingularityAction = requested === "emerging" && localT >= EMERGE_CYCLE ? "idle" : requested;
    U.time.value = t;

    let pose: BossPose = { ...REST_POSE };
    let slashRightProg = 0;
    let slashRightAlpha = 0;
    let slashLeftProg = 0;
    let slashLeftAlpha = 0;
    let slashXProg = 0;
    let slashXAlpha = 0;
    let shock1 = 0;
    let shock1Col = "#fb7185";
    let shock2 = 0;
    let shock2Col = "#fecaca";
    let soulMode: "none" | "inward" | "requiem" = "none";
    let soulProg = 0;
    let novaScale = 0.001;
    let novaAlpha = 0;
    let charge = 0;
    let tremble = 0;
    let flash = 0;
    let swallow = -1;
    let open = -1;
    let heart = 0;
    // Forward speed the lower vortex trails behind (walking)
    let travel = 0;
    const flashCol = "#ffe4e6";
    let lines = 0;
    let vig = 0;
    let vigCol = "#450a0a";
    let novaCol = "#fb7185";
    let novaPos: [number, number, number] = [0, 3.5, 0];
    // Emerge: the rift (its crack running, its opening, its break), the ground held back, and whether what is still
    // behind the rift is cut away
    let riftCrack = 0;
    let riftOpen = 0;
    let riftBreak = 0;
    let groundZ = 0;
    let clipRift = false;

    if (action === "idle") {
      // A living idle: it hovers and breathes (the breath lifts the shoulders and opens the plates), each arm drifts on its
      // own rhythm, the hands clench and roll their talons at their own times, and the head glances round in small snaps
      const b = Math.sin(t * 1.45); // levitation
      const br = Math.sin(t * 1.15); // breath
      const sway = Math.sin(t * 0.5);
      const la = Math.sin(t * 0.83 + 0.4);
      const lb = Math.sin(t * 1.37 + 2.0);
      const ra = Math.sin(t * 0.91 + 2.6);
      const rb = Math.sin(t * 1.21 + 0.7);
      // A slow clench: a bell over the first third of each period (each finger a little later than the last)
      const clench = (period: number, offset: number) => {
        const u = (((t + offset) % period) + period) % period / period;
        return u < 0.36 ? Math.sin((u / 0.36) * Math.PI) : 0;
      };
      const claw4 = (f: (i: number) => number): [number, number, number, number] => [f(0), f(1), f(2), f(3)];
      // The head picks a new point to watch every 2.6 s and snaps to it
      const look = (k: number) => hash01(Math.floor(t / 2.6) + k);
      const lookU = (t % 2.6) / 2.6;
      const lookBlend = smooth(Math.min(1, lookU / 0.12));
      const lookYaw = lerp((look(-1) - 0.5) * 0.55, (look(0) - 0.5) * 0.55, lookBlend);
      const lookPitch = lerp((look(9) - 0.5) * 0.14, (look(10) - 0.5) * 0.14, lookBlend);

      // Occasional surge every ~6.5s (no ring on the ground: the dust funnel churns harder instead)
      const surgeCycle = (t % 6.5) / 6.5;
      const idleSurge = surgeCycle < 0.24 ? Math.sin((surgeCycle / 0.24) * Math.PI) * 0.65 : 0;
      // Each surge is a breath of the void: energy drawn into the core, a low rumble and the edges of the world dimming
      const surgeIdx = Math.floor(t / 6.5);
      if (surgeIdx !== st.lastHit) {
        if (st.lastHit !== -1) cine({ quake: 0.03, vig: 0.32, vigCol: "#881337", lines: 0.22, flash: 0.08, flashCol: "#fda4af" });
        st.lastHit = surgeIdx;
      }
      charge = idleSurge * 0.6;
      vig = 0.12;

      const R = REST_POSE;
      pose = {
        ...R,
        bodyPos: [sway * 0.06, 3.25 + b * 0.13, Math.sin(t * 0.37) * 0.04],
        bodyRot: [0.05 + b * 0.02 - br * 0.015, sway * 0.08, -sway * 0.025],
        chestRot: [0.03 - br * 0.035, sway * 0.06 + la * 0.02, ra * 0.015],
        headRot: [0.05 + lookPitch + br * 0.02, lookYaw - sway * 0.06, -lookYaw * 0.12],
        plateSpread: 0.05 + 0.05 * (br * 0.5 + 0.5) + idleSurge * 0.14,
        lShoulderPos: [R.lShoulderPos[0], R.lShoulderPos[1] + br * 0.04, R.lShoulderPos[2] + la * 0.03],
        rShoulderPos: [R.rShoulderPos[0], R.rShoulderPos[1] + br * 0.04, R.rShoulderPos[2] + ra * 0.03],
        lShoulderRot: [R.lShoulderRot[0] + la * 0.07 + br * 0.03, R.lShoulderRot[1] + lb * 0.05, R.lShoulderRot[2] + la * 0.04 - br * 0.03 + idleSurge * 0.08],
        rShoulderRot: [R.rShoulderRot[0] + ra * 0.07 + br * 0.03, R.rShoulderRot[1] + rb * 0.05, R.rShoulderRot[2] - ra * 0.04 + br * 0.03 - idleSurge * 0.08],
        lElbowRot: [R.lElbowRot[0] - lb * 0.1 - clench(4.3, 0) * 0.1, R.lElbowRot[1] + la * 0.04, R.lElbowRot[2]],
        rElbowRot: [R.rElbowRot[0] - rb * 0.1 - clench(5.1, 2.2) * 0.1, R.rElbowRot[1] + ra * 0.04, R.rElbowRot[2]],
        lWristRot: [R.lWristRot[0] + Math.sin(t * 1.6 + 0.3) * 0.1 + clench(4.3, 0) * 0.16, R.lWristRot[1] + lb * 0.06, R.lWristRot[2] + la * 0.05],
        rWristRot: [R.rWristRot[0] + Math.sin(t * 1.45 + 1.9) * 0.1 + clench(5.1, 2.2) * 0.16, R.rWristRot[1] + rb * 0.06, R.rWristRot[2] - ra * 0.05],
        lClaws: claw4((i) => R.lClaws[i] + clench(4.3, -i * 0.14) * 0.5 + Math.sin(t * 2.1 + i * 0.6) * 0.04 - idleSurge * 0.3),
        rClaws: claw4((i) => R.rClaws[i] + clench(5.1, 2.2 - i * 0.14) * 0.5 + Math.sin(t * 1.9 + i * 0.6 + 1.0) * 0.04 - idleSurge * 0.3),
        coreScale: 1.0 + (br * 0.5 + 0.5) * 0.05 + idleSurge * 0.08,
        coreSurge: 0.15 + 0.12 * (br * 0.5 + 0.5) + idleSurge
      };
    } else if (action === "walking") {
      // Heavy two-beat stride (1.7 s): the titan dips onto each footfall and rises through the passing, leans into its travel,
      // shifts its weight over the supporting side; the shoulders turn against the hips and the arms swing opposite each other
      // (elbows, wrists and talons each a beat later); the head holds steady on its prey while the body moves under it,
      // and the lower vortex trails behind as if gliding forward
      const STRIDE = 1.7;
      const ph = (t / STRIDE) * Math.PI * 2;
      const sn = Math.sin(ph);
      const lift = Math.abs(sn); // 0 at each footfall, 1 mid-stride
      const plant = Math.pow(1 - lift, 3); // sharp at the footfall
      const sw = (lag: number) => Math.sin(ph - lag);
      const claw4 = (f: (i: number) => number): [number, number, number, number] => [f(0), f(1), f(2), f(3)];
      const yawHips = 0.13 * sn;
      const yawChest = -0.24 * sn;
      const lean = 0.2;

      pose = {
        ...REST_POSE,
        bodyPos: [0.07 * sn, 3.2 + 0.1 * Math.pow(lift, 0.8) - 0.05 * plant, 0.04 * Math.cos(ph * 2)],
        bodyRot: [lean + 0.05 * plant, yawHips, -0.05 * sn],
        chestRot: [0.04 - 0.03 * Math.cos(ph * 2), yawChest, 0.03 * sn],
        headRot: [-lean * 0.55 - 0.03 * plant, -(yawHips + yawChest) * 0.9 + Math.sin(t * 0.4) * 0.08, 0.04 * sn],
        plateSpread: 0.06 + plant * 0.1,
        lShoulderPos: [1.28, 0.74 + 0.03 * sw(0.2), 0.14 * sw(0.2)],
        rShoulderPos: [-1.28, 0.74 - 0.03 * sw(0.2), -0.14 * sw(0.2)],
        // Arms hang close to the body (not the idle's wide A-frame) so they swing forward and back, not on a diagonal
        lShoulderRot: [0.08 - 0.5 * sw(0.25), -0.1 - 0.06 * sw(0.25), 0.18 + 0.04 * Math.abs(sw(0.25))],
        rShoulderRot: [0.08 + 0.5 * sw(0.25), 0.1 - 0.06 * sw(0.25), -0.18 - 0.04 * Math.abs(sw(0.25))],
        lElbowRot: [-0.32 - 0.34 * Math.max(0, sw(0.75)) - 0.06 * plant, 0, 0.05],
        rElbowRot: [-0.32 - 0.34 * Math.max(0, -sw(0.75)) - 0.06 * plant, 0, -0.05],
        lWristRot: [0.15 + 0.22 * sw(1.25), 0, -0.22 + 0.06 * sw(1.25)],
        rWristRot: [0.15 - 0.22 * sw(1.25), 0, 0.22 - 0.06 * sw(1.25)],
        lClaws: claw4((i) => 0.22 + 0.04 * i + 0.12 * sw(1.6 + i * 0.22)),
        rClaws: claw4((i) => 0.22 + 0.04 * i - 0.12 * sw(1.6 + i * 0.22)),
        coreScale: 1.03 + plant * 0.05,
        coreSurge: 0.3 + plant * 0.35
      };
      travel = 2.4;

      // Each footfall shakes the ground, sends out a gravity ripple and kicks up rubble on alternate sides
      const stepPos = ph / Math.PI;
      const stepIdx = Math.floor(stepPos);
      const stepU = stepPos - stepIdx;
      if (stepIdx !== st.lastHit) {
        if (st.lastHit !== -1) {
          cine({ quake: 0.05 });
          spawnDebrisBurst(stepIdx % 2 ? 0.5 : -0.5, 0.6, 0.3);
        }
        st.lastHit = stepIdx;
      }
      if (stepU < 0.6) {
        shock1 = (stepU / 0.6) * 0.5;
        shock1Col = "#5f1218";
      }
      if (stepU < 0.4) {
        shock2 = (stepU / 0.4) * 0.55;
        shock2Col = "#3f0c10";
      }
      vig = 0.2;
      vigCol = "#4c0519";
    } else if (action === "attacking") {
      // 2.8s 3-Part Feral Claw Combo with Physics:
      // 1) Hit 1 (0.00 - 0.28): High Overhead Right Claw Rend across head/chest height + 3-claw slash ribbon + spring whip
      // 2) Hit 2 (0.28 - 0.54): High Overhead Left Claw Counter-Rend across head/chest height + 3-claw slash ribbon + spring whip
      // 3) Hit 3 (0.54 - 1.00): Pounce Double-Claw X-Slam + ballistic debris burst + dual shockwaves
      const cycle = 2.8;
      const u = (localT % cycle) / cycle;

      // Spring kicks as each strike leaves its hang, and on the slam
      const phaseIdx = u < 0.14 ? 0 : u < 0.31 ? 1 : u < 0.755 ? 2 : 3;
      if (phaseIdx !== st.lastPhase) {
        st.lastPhase = phaseIdx;
        if (phaseIdx === 1) {
          addSpringImpulse(-0.35, 0.85, 0.4, 1.7, -0.45);
        } else if (phaseIdx === 2) {
          addSpringImpulse(-0.35, 0.85, 0.4, -1.7, 0.45);
        } else if (phaseIdx === 3) {
          addSpringImpulse(-2.4, 1.35, 1.35, 0, 0);
          spawnDebrisBurst(0, 0.85, 1.15);
        }
      }

      // Every strike: a slow coil that hangs (hold), a fast swing that carries through the target, a follow-through, then recovery
      pose = sampleKeyframes(
        u,
        [
          { t: 0.0, p: {} },
          // Hit 1 coil: right (-X) talons drawn high over the pauldron, torso wound away, left arm thrown back for balance
          {
            t: 0.1,
            p: {
              bodyPos: [-0.18, 3.32, -0.22],
              bodyRot: [-0.04, -0.5, 0.1],
              chestRot: [-0.1, -0.55, 0.1],
              headRot: [0.1, 0.5, 0],
              plateSpread: 0.2,
              rShoulderPos: [-1.42, 1.08, -0.24],
              rShoulderRot: [-1.6, 0.5, -1.1],
              rElbowRot: [-0.5, 0.25, -0.3],
              rWristRot: [-0.4, 0, 0.3],
              rClaws: [-0.4, -0.4, -0.4, -0.4],
              lShoulderRot: [0.25, -0.2, 0.75],
              lClaws: [0.3, 0.3, 0.3, 0.3],
              coreSurge: 0.6
            }
          },
          // The hang before the strike
          {
            t: 0.14,
            hold: true,
            p: {
              bodyPos: [-0.2, 3.36, -0.26],
              bodyRot: [-0.06, -0.56, 0.11],
              chestRot: [-0.12, -0.6, 0.11],
              headRot: [0.12, 0.54, 0],
              plateSpread: 0.22,
              rShoulderPos: [-1.44, 1.1, -0.26],
              rShoulderRot: [-1.7, 0.55, -1.15],
              rElbowRot: [-0.52, 0.26, -0.32],
              rWristRot: [-0.45, 0, 0.32],
              rClaws: [-0.42, -0.42, -0.42, -0.42],
              lShoulderRot: [0.28, -0.22, 0.78],
              lClaws: [0.3, 0.3, 0.3, 0.3],
              coreSurge: 0.7
            }
          },
          // Hit 1 impact: the claw tears across at head height, the body lunging in behind it
          {
            t: 0.205,
            p: {
              bodyPos: [0.05, 3.12, 0.3],
              bodyRot: [0.16, 0.18, -0.06],
              chestRot: [0.14, 0.28, -0.1],
              headRot: [-0.06, -0.15, 0],
              plateSpread: 0.25,
              rShoulderPos: [-1.2, 0.95, 0.42],
              rShoulderRot: [-1.35, -0.35, -0.2],
              rElbowRot: [-0.35, -0.1, 0],
              rWristRot: [0.2, 0, -0.1],
              rClaws: [0.6, 0.65, 0.7, 0.75],
              lShoulderRot: [-0.4, -0.2, 0.9],
              coreSurge: 1.0
            }
          },
          // Follow-through: the right arm sweeps on past, torso over-turned; the left is already rising for Hit 2
          {
            t: 0.255,
            p: {
              bodyPos: [0.18, 3.14, 0.36],
              bodyRot: [0.14, 0.5, -0.12],
              chestRot: [0.12, 0.56, -0.14],
              headRot: [-0.08, -0.36, 0],
              rShoulderPos: [-1.14, 0.98, 0.44],
              rShoulderRot: [-1.28, -0.82, 0.36],
              rElbowRot: [-0.56, -0.26, 0.22],
              rWristRot: [0.38, 0, -0.28],
              rClaws: [0.85, 0.9, 0.95, 1.0],
              lShoulderPos: [1.38, 1.02, -0.18],
              lShoulderRot: [-1.3, -0.4, 1.0],
              lElbowRot: [-0.42, -0.22, 0.24],
              lWristRot: [-0.3, 0, -0.24],
              lClaws: [-0.3, -0.3, -0.3, -0.3],
              coreSurge: 0.95
            }
          },
          // Hit 2 hang: left (+X) talons high, the body still wound from the first swing
          {
            t: 0.31,
            hold: true,
            p: {
              bodyPos: [0.2, 3.3, -0.2],
              bodyRot: [-0.05, 0.56, -0.11],
              chestRot: [-0.11, 0.6, -0.11],
              headRot: [0.12, -0.54, 0],
              plateSpread: 0.24,
              lShoulderPos: [1.44, 1.1, -0.26],
              lShoulderRot: [-1.7, -0.55, 1.15],
              lElbowRot: [-0.52, -0.26, 0.32],
              lWristRot: [-0.45, 0, -0.32],
              lClaws: [-0.42, -0.42, -0.42, -0.42],
              rShoulderRot: [0.22, 0.2, -0.76],
              rElbowRot: [-0.3, 0, -0.14],
              rClaws: [0.4, 0.4, 0.4, 0.4],
              coreSurge: 0.9
            }
          },
          // Hit 2 impact
          {
            t: 0.375,
            p: {
              bodyPos: [-0.05, 3.12, 0.32],
              bodyRot: [0.16, -0.18, 0.06],
              chestRot: [0.14, -0.28, 0.1],
              headRot: [-0.06, 0.15, 0],
              plateSpread: 0.25,
              lShoulderPos: [1.2, 0.95, 0.42],
              lShoulderRot: [-1.35, 0.35, 0.2],
              lElbowRot: [-0.35, 0.1, 0],
              lWristRot: [0.2, 0, 0.1],
              lClaws: [0.6, 0.65, 0.7, 0.75],
              rShoulderRot: [-0.3, 0.2, -0.75],
              coreSurge: 1.1
            }
          },
          // Hit 2 follow-through
          {
            t: 0.425,
            p: {
              bodyPos: [-0.18, 3.14, 0.42],
              bodyRot: [0.14, -0.52, 0.12],
              chestRot: [0.12, -0.58, 0.14],
              headRot: [-0.08, 0.38, 0],
              lShoulderPos: [1.14, 0.98, 0.44],
              lShoulderRot: [-1.28, 0.82, -0.36],
              lElbowRot: [-0.56, 0.26, -0.22],
              lWristRot: [0.38, 0, 0.28],
              lClaws: [0.85, 0.9, 0.95, 1.0],
              rShoulderPos: [-1.34, 0.82, -0.1],
              rShoulderRot: [-0.35, 0.25, -0.78],
              coreSurge: 1.1
            }
          },
          // Sinking into the pounce, arms swinging back
          {
            t: 0.5,
            p: {
              bodyPos: [0, 2.95, -0.2],
              bodyRot: [0.2, 0, 0],
              chestRot: [0.12, 0, 0],
              headRot: [-0.1, 0, 0],
              plateSpread: 0.25,
              lShoulderRot: [0.3, -0.3, 0.85],
              rShoulderRot: [0.3, 0.3, -0.85],
              lElbowRot: [-0.45, 0, 0.2],
              rElbowRot: [-0.45, 0, -0.2],
              lClaws: [-0.1, -0.1, -0.1, -0.1],
              rClaws: [-0.1, -0.1, -0.1, -0.1],
              coreScale: 1.1,
              coreSurge: 1.1
            }
          },
          // Deep crouch, coiled: the hang before the leap
          {
            t: 0.585,
            hold: true,
            p: {
              bodyPos: [0, 2.38, -0.5],
              bodyRot: [0.36, 0, 0],
              chestRot: [0.24, 0, 0],
              headRot: [-0.34, 0, 0],
              plateSpread: 0.4,
              lShoulderRot: [0.6, -0.38, 0.95],
              rShoulderRot: [0.6, 0.38, -0.95],
              lElbowRot: [-0.6, 0, 0.26],
              rElbowRot: [-0.6, 0, -0.26],
              lClaws: [-0.32, -0.32, -0.32, -0.32],
              rClaws: [-0.32, -0.32, -0.32, -0.32],
              coreScale: 1.25,
              coreSurge: 1.3
            }
          },
          // The apex of the leap: it hangs a moment, both claws raised wide and high
          {
            t: 0.68,
            p: {
              bodyPos: [0, 4.25, 0.45],
              bodyRot: [-0.16, 0, 0],
              chestRot: [-0.2, 0, 0],
              headRot: [0.22, 0, 0],
              plateSpread: 0.6,
              lShoulderPos: [1.38, 0.9, 0.15],
              rShoulderPos: [-1.38, 0.9, 0.15],
              lShoulderRot: [-1.35, -0.25, 0.78],
              rShoulderRot: [-1.35, 0.25, -0.78],
              lElbowRot: [-0.25, 0, 0.18],
              rElbowRot: [-0.25, 0, -0.18],
              lClaws: [-0.35, -0.35, -0.35, -0.35],
              rClaws: [-0.35, -0.35, -0.35, -0.35],
              coreScale: 1.35,
              coreSurge: 1.6
            }
          },
          // Double-claw X-slam: falling, both claws rip down and in across the front
          {
            t: 0.755,
            p: {
              bodyPos: [0, 2.35, 0.92],
              bodyRot: [0.38, 0, 0],
              chestRot: [0.34, 0, 0],
              headRot: [-0.28, 0, 0],
              plateSpread: 0.22,
              lShoulderPos: [1.14, 0.62, 0.46],
              rShoulderPos: [-1.14, 0.62, 0.46],
              lShoulderRot: [-0.55, 0.55, -0.32],
              rShoulderRot: [-0.55, -0.55, 0.32],
              lElbowRot: [-0.38, 0, -0.18],
              rElbowRot: [-0.38, 0, 0.18],
              lClaws: [0.95, 1.0, 1.0, 1.0],
              rClaws: [0.95, 1.0, 1.0, 1.0],
              coreScale: 1.15,
              coreSurge: 2.0
            }
          },
          // The weight lands: squashed low over the crater
          {
            t: 0.8,
            hold: true,
            p: {
              bodyPos: [0, 2.22, 0.98],
              bodyRot: [0.44, 0, 0],
              chestRot: [0.38, 0, 0],
              headRot: [-0.32, 0, 0],
              plateSpread: 0.32,
              lShoulderPos: [1.12, 0.6, 0.48],
              rShoulderPos: [-1.12, 0.6, 0.48],
              lShoulderRot: [-0.5, 0.6, -0.36],
              rShoulderRot: [-0.5, -0.6, 0.36],
              lElbowRot: [-0.42, 0, -0.2],
              rElbowRot: [-0.42, 0, 0.2],
              lClaws: [1.0, 1.0, 1.0, 1.0],
              rClaws: [1.0, 1.0, 1.0, 1.0],
              coreScale: 1.1,
              coreSurge: 2.2
            }
          },
          // Rising out of it, arms opening back to the A-frame
          {
            t: 0.9,
            p: {
              bodyPos: [0, 2.85, 0.5],
              bodyRot: [0.18, 0, 0],
              chestRot: [0.12, 0, 0],
              headRot: [-0.1, 0, 0],
              lShoulderRot: [-0.05, 0, 0.45],
              rShoulderRot: [-0.05, 0, -0.45],
              lClaws: [0.45, 0.45, 0.45, 0.45],
              rClaws: [0.45, 0.45, 0.45, 0.45],
              coreSurge: 0.9
            }
          },
          { t: 1.0, p: {} }
        ],
        cycle
      );

      if (u >= 0.12 && u <= 0.29) {
        slashRightProg = clamp01((u - 0.12) / 0.12);
        slashRightAlpha = Math.sin(((u - 0.12) / 0.17) * Math.PI);
      }
      if (u >= 0.30 && u <= 0.47) {
        slashLeftProg = clamp01((u - 0.30) / 0.12);
        slashLeftAlpha = Math.sin(((u - 0.30) / 0.17) * Math.PI);
      }
      if (u >= 0.72 && u <= 0.94) {
        slashXProg = clamp01((u - 0.72) / 0.1);
        slashXAlpha = Math.sin(((u - 0.72) / 0.22) * Math.PI);
      }
      if (u >= 0.74) {
        shock1 = (u - 0.74) / 0.26;
        shock1Col = "#f43f5e";
        shock2 = Math.max(0, (u - 0.78) / 0.22);
        shock2Col = "#fecaca";
      }

      // Each claw lands with hit-stop, a quake and a tinted flash; the slam hits like a meteor
      const hitIdx = u < 0.205 ? 0 : u < 0.375 ? 1 : u < 0.755 ? 2 : 3;
      if (hitIdx !== st.lastHit) {
        if (hitIdx === 1) cine({ quake: 0.09, stop: 0.07, flash: 0.34, flashCol: "#fb7185", lines: 0.5 });
        else if (hitIdx === 2) cine({ quake: 0.09, stop: 0.07, flash: 0.34, flashCol: "#fecdd3", lines: 0.5 });
        else if (hitIdx === 3) cine({ quake: 0.3, stop: 0.12, flash: 0.85, flashCol: "#f43f5e", lines: 1.0, vig: 0.62, vigCol: "#9f1239" });
        st.lastHit = hitIdx;
      }
      // The pounce gathers void into the core and closes in the frame before the slam
      if (u >= 0.5 && u < 0.755) {
        const k = (u - 0.5) / 0.255;
        charge = smooth(k) * 0.75;
        vig = smooth(k) * 0.4;
        vigCol = "#881337";
      }
      // The slam's blast dome bursts from where the claws strike the ground
      if (u >= 0.755 && u < 0.93) {
        const k = (u - 0.755) / 0.175;
        novaScale = 0.3 + smooth(k) * 4.4;
        novaAlpha = (1 - k) * 0.75;
        novaCol = "#f43f5e";
        novaPos = [0, 0.3, 1.4];
      }
    } else if (action === "casting") {
      // 7s Void Self-Destruct:
      // 1) Charge (0.00 - 0.43): claws cradle the chest, the core swells as void energy spirals into it, the titan trembles harder and harder
      // 2) Critical (0.43 - 0.49): the core collapses to a white-hot pinpoint, the body locks and shakes
      // 3) Detonation (0.49): arms flung wide, a blinding flash, shockwaves and a nova; the void spreads from the core and swallows the panel
      // 4) Darkness (0.59 - 0.80): pure black, only the core's faint heartbeat where it will reform
      // 5) Reform (0.80 - 0.92): the black opens again on the titan, whole once more
      const u = (localT % CAST_CYCLE) / CAST_CYCLE;

      const castPhase = u < 0.43 ? 0 : u < 0.493 ? 1 : u < 0.6 ? 2 : 3;
      if (castPhase !== st.lastPhase) {
        st.lastPhase = castPhase;
        if (castPhase === 2) {
          cine({ quake: 0.38, lines: 1.0 });
          addSpringImpulse(1.6, -1.8, -1.2, 0, 0);
          spawnDebrisBurst(0, 0, 1.6);
        }
        if (castPhase === 3) {
          phys.debris.forEach((d) => {
            d.active = false;
          });
        }
      }

      const cradle: Partial<BossPose> = {
        bodyPos: [0, 3.95, -0.1],
        bodyRot: [0.16, 0, 0],
        chestRot: [0.18, 0, 0],
        headRot: [0.3, 0, 0],
        plateSpread: 0.95,
        lShoulderPos: [1.16, 0.78, 0.28],
        rShoulderPos: [-1.16, 0.78, 0.28],
        lShoulderRot: [-0.65, 0.45, -0.18],
        rShoulderRot: [-0.65, -0.45, 0.18],
        lElbowRot: [-0.75, 0, -0.15],
        rElbowRot: [-0.75, 0, 0.15],
        lClaws: [0.65, 0.7, 0.75, 0.8],
        rClaws: [0.65, 0.7, 0.75, 0.8],
        coreScale: 1.9,
        coreSurge: 2.4
      };
      const flung: Partial<BossPose> = {
        bodyPos: [0, 4.15, 0.25],
        bodyRot: [-0.26, 0, 0],
        chestRot: [-0.3, 0, 0],
        headRot: [-0.42, 0, 0],
        plateSpread: 1.35,
        lShoulderPos: [1.46, 0.9, -0.14],
        rShoulderPos: [-1.46, 0.9, -0.14],
        lShoulderRot: [-0.14, -0.3, 1.0],
        rShoulderRot: [-0.14, 0.3, -1.0],
        lElbowRot: [-0.12, 0, 0.28],
        rElbowRot: [-0.12, 0, -0.28],
        lClaws: [-0.38, -0.38, -0.38, -0.38],
        rClaws: [-0.38, -0.38, -0.38, -0.38],
        coreScale: 2.6,
        coreSurge: 3.2
      };
      pose = sampleKeyframes(u, [
        { t: 0.0, p: {} },
        { t: 0.1, p: { bodyPos: [0, 3.45, 0], plateSpread: 0.3, lClaws: [0.4, 0.45, 0.5, 0.55], rClaws: [0.4, 0.45, 0.5, 0.55], coreScale: 1.15, coreSurge: 0.7 } },
        { t: 0.38, p: cradle, hold: true },
        // Critical: hunched tight round a core collapsing to a pinpoint
        {
          t: 0.47,
          p: {
            ...cradle,
            bodyPos: [0, 3.9, -0.16],
            bodyRot: [0.26, 0, 0],
            chestRot: [0.26, 0, 0],
            headRot: [0.4, 0, 0],
            plateSpread: 1.1,
            lShoulderRot: [-0.82, 0.56, -0.24],
            rShoulderRot: [-0.82, -0.56, 0.24],
            lClaws: [0.9, 0.92, 0.94, 0.96],
            rClaws: [0.9, 0.92, 0.94, 0.96],
            coreScale: 0.22,
            coreSurge: 3.4
          }
        },
        { t: 0.505, p: flung },
        { t: 0.6, p: { ...flung, coreScale: 1.8, coreSurge: 2.2 } },
        // Hidden by the dark: the titan is whole again when the black opens
        { t: 0.64, p: { coreSurge: 0.9 } },
        { t: 1.0, p: {} }
      ], CAST_CYCLE);

      if (u < 0.43) {
        const c = u / 0.43;
        charge = smooth(c) * 1.1;
        tremble = c * c * 0.05;
        vig = smooth(c) * 0.55;
        vigCol = "#7f1d1d";
        soulMode = "inward";
        soulProg = (c * 3.0) % 1;
        // Rings of void light collapsing into the chest, faster as the charge builds
        const pulse = (c * (2 + c * 3)) % 1;
        novaScale = 5.5 - pulse * 4.6;
        novaAlpha = pulse * 0.22 * c;
      } else if (u < 0.493) {
        charge = 1.1 + (u - 0.43) * 12;
        tremble = 0.09;
        vig = 0.7;
        vigCol = "#9f1239";
        lines = (u - 0.43) / 0.063 * 0.5;
        soulMode = "inward";
        soulProg = 0.98;
      } else if (u < 0.6) {
        const k = (u - 0.493) / 0.107;
        soulMode = "requiem";
        soulProg = clamp01(k * 1.6);
        novaScale = 0.6 + smooth(clamp01(k * 2.2)) * 13;
        novaAlpha = (1 - smooth(clamp01(k * 2.2))) * 0.9;
        shock1 = clamp01(k * 1.8);
        shock1Col = "#fecdd3";
        shock2 = clamp01(k * 1.3);
        shock2Col = "#f43f5e";
        flash = Math.max(0, 1 - k * 2.6);
        // The void spreads from the core and swallows the whole panel
        swallow = smooth(clamp01((k - 0.04) / 0.76)) * 3.6;
      } else if (u < 0.8) {
        swallow = 6;
        heart = smooth(clamp01((u - 0.66) / 0.1));
      } else if (u < 0.93) {
        const k = (u - 0.8) / 0.13;
        open = smooth(k) * 3.6;
        heart = 1 - k;
      }
    } else if (action === "emerging") {
      // Emerge, once: a hairline of light tears down the air and opens to a slit; the talons pierce it from the other side,
      // hook round its edges and wrench it wide in two heaves while the head pushes at the void and the core gathers; a
      // coil, then it breaks the rift apart and lunges out into the world, its torn-up ground dragged through after it
      const s = localT;
      const u = s / EMERGE_CYCLE;
      riftCrack = track(s, [[0, 0], [0.55, 1]]);
      // A slit until the arms pry it wider (see the skin step), torn wide open by the break
      riftOpen = track(s, [[0.45, 0], [1.0, 0.22], [3.85, 0.3], [4.0, 4.2]]);
      riftBreak = clamp01((s - BURST_T) / 1.0);
      groundZ = s < BURST_T ? GROUND_BACK : GROUND_BACK * (1 - smooth((s - BURST_T) / 0.45));
      clipRift = s < BURST_T + 0.5;

      const phase = s < 1.5 ? 0 : s < 1.85 ? 1 : s < 2.6 ? 2 : s < 3.4 ? 3 : s < BURST_T ? 4 : 5;
      if (phase !== st.lastPhase) {
        st.lastPhase = phase;
        // The talons pierce through; each heave lands; then the break
        if (phase === 1) cine({ quake: 0.06, flash: 0.22, flashCol: "#fecdd3", lines: 0.3 });
        else if (phase === 3) {
          cine({ quake: 0.12, vig: 0.45, vigCol: "#4c0519" });
          addSpringImpulse(0.2, 0.5, -0.2, 0, 0);
        } else if (phase === 4) {
          cine({ quake: 0.16, vig: 0.55, vigCol: "#4c0519", lines: 0.35 });
          addSpringImpulse(0.25, 0.6, -0.25, 0, 0);
        } else if (phase === 5) {
          cine({ quake: 0.5, stop: 0.12, flash: 1.0, flashCol: "#ffe4e6", lines: 1.0, vig: 0.65, vigCol: "#881337" });
          addSpringImpulse(1.4, 2.6, -1.0, 0, 0);
          // As wide as the arms had pried it
          breakRift(Math.max(riftOpen, mats.rift.uniforms.uOpen.value));
        }
      }
      // Strain: it trembles harder with each heave, the dark closes in and the core gathers before the break
      if (s > 1.85 && s < BURST_T) tremble = 0.02 + smooth((s - 1.85) / 2.0) * 0.05;
      if (s > 1.6 && s < BURST_T) {
        vig = 0.2 + smooth((s - 1.6) / 2.3) * 0.4;
        vigCol = "#4c0519";
      }
      if (s > 3.4 && s < BURST_T) charge = smooth((s - 3.4) / 0.5) * 1.1;
      if (s >= BURST_T && s < BURST_T + 0.6) {
        const k = (s - BURST_T) / 0.6;
        novaScale = 0.6 + smooth(k) * 9;
        novaAlpha = (1 - k) * 0.85;
        novaCol = "#fb7185";
        novaPos = [0, RIFT_Y, RIFT_Z];
        flash = Math.max(0, 1 - k * 3);
      }

      const T = (sec: number) => sec / EMERGE_CYCLE;
      const curl = (a: number): [number, number, number, number] => [a, a + 0.04, a + 0.08, a + 0.1];
      // Waiting in the dark beyond, hunched
      const hidden: Partial<BossPose> = { bodyPos: [0, 3.25, -2.4], bodyRot: [0.12, 0, 0], headRot: [0.3, 0, 0], lClaws: curl(0.7), rClaws: curl(0.68) };
      // Reaching through: arms thrust forward, the hands close together, talons straight, piercing the slit
      const reach: Partial<BossPose> = {
        bodyPos: [0, 3.4, -0.95],
        bodyRot: [0.1, 0, 0],
        headRot: [0.35, 0, 0],
        lShoulderRot: [-1.52, 0, -0.5],
        rShoulderRot: [-1.52, 0, 0.5],
        lElbowRot: [-0.22, 0, 0],
        rElbowRot: [-0.22, 0, 0],
        lWristRot: [-0.1, 0, 0],
        rWristRot: [-0.1, 0, 0],
        lClaws: [-0.12, -0.1, -0.08, -0.06],
        rClaws: [-0.1, -0.12, -0.06, -0.08],
        coreSurge: 0.6
      };
      // Hooked round the edges
      const grip: Partial<BossPose> = { ...reach, lShoulderRot: [-1.5, 0, -0.22], rShoulderRot: [-1.5, 0, 0.22], lWristRot: [0.3, 0, -0.55], rWristRot: [0.3, 0, 0.55], lClaws: curl(0.9), rClaws: curl(0.88) };
      // The first heave: the edges dragged apart, the body pressing in behind
      const heave1: Partial<BossPose> = {
        ...grip,
        bodyPos: [0, 3.35, -0.6],
        bodyRot: [0.18, 0, 0],
        headRot: [0.45, 0, 0],
        lShoulderRot: [-1.44, 0, 0.2],
        rShoulderRot: [-1.44, 0, -0.2],
        lElbowRot: [-0.15, 0, 0],
        rElbowRot: [-0.15, 0, 0],
        plateSpread: 0.4,
        coreSurge: 1.2
      };
      // The rift fights back a little
      const slip: Partial<BossPose> = { ...heave1, bodyPos: [0, 3.3, -0.72], lShoulderRot: [-1.46, 0, 0.08], rShoulderRot: [-1.46, 0, -0.08], plateSpread: 0.3 };
      // The second heave: wrenched wide, the head shoving at the void
      const heave2: Partial<BossPose> = {
        ...grip,
        bodyPos: [0, 3.4, -0.2],
        bodyRot: [0.26, 0, 0],
        headRot: [0.55, 0, 0],
        lShoulderRot: [-1.34, 0, 0.62],
        rShoulderRot: [-1.34, 0, -0.62],
        lElbowRot: [-0.1, 0, 0],
        rElbowRot: [-0.1, 0, 0],
        plateSpread: 0.7,
        coreSurge: 1.6
      };
      // The coil: drawn back and down, everything gathering in the core
      const coil: Partial<BossPose> = {
        ...heave2,
        bodyPos: [0, 3.1, -0.45],
        bodyRot: [0.38, 0, 0],
        chestRot: [0.3, 0, 0],
        headRot: [0.6, 0, 0],
        lShoulderRot: [-1.38, 0, 0.55],
        rShoulderRot: [-1.38, 0, -0.55],
        lElbowRot: [-0.7, 0, 0],
        rElbowRot: [-0.7, 0, 0],
        lClaws: curl(0.92),
        rClaws: curl(0.9),
        plateSpread: 0.3,
        coreSurge: 2.4,
        coreScale: 0.7
      };
      // Out: through and past, chest thrown out, arms flung wide, roaring
      const out: Partial<BossPose> = {
        bodyPos: [0, 3.75, 1.5],
        bodyRot: [-0.3, 0, 0],
        chestRot: [-0.32, 0, 0],
        headRot: [-0.5, 0, 0],
        plateSpread: 1.4,
        lShoulderPos: [1.46, 0.9, -0.14],
        rShoulderPos: [-1.46, 0.9, -0.14],
        lShoulderRot: [-0.14, -0.3, 1.05],
        rShoulderRot: [-0.14, 0.3, -1.05],
        lElbowRot: [-0.12, 0, 0.28],
        rElbowRot: [-0.12, 0, -0.28],
        lClaws: curl(-0.38),
        rClaws: curl(-0.38),
        coreScale: 2.2,
        coreSurge: 3.2
      };
      pose = sampleKeyframes(
        u,
        [
          { t: 0, p: hidden },
          { t: T(0.9), p: { ...hidden, bodyPos: [0, 3.3, -2.0] } },
          { t: T(1.55), p: reach },
          { t: T(1.85), p: grip, hold: true },
          { t: T(2.6), p: heave1, hold: true },
          { t: T(2.8), p: slip },
          { t: T(3.4), p: heave2, hold: true },
          { t: T(3.8), p: coil, hold: true },
          // The break lands mid-lunge (BURST_T)
          { t: T(4.02), p: out },
          {
            t: T(4.6),
            p: { bodyPos: [0, 3.45, 0.5], bodyRot: [-0.1, 0, 0], chestRot: [-0.1, 0, 0], headRot: [-0.15, 0, 0], plateSpread: 0.8, coreSurge: 1.4, lShoulderRot: [-0.2, -0.2, 0.75], rShoulderRot: [-0.2, 0.2, -0.75] }
          },
          { t: T(5.3), p: { bodyPos: [0, 3.3, 0.08], plateSpread: 0.15, coreSurge: 0.4 }, hold: true },
          { t: 1, p: {} }
        ],
        EMERGE_CYCLE
      );
    } else if (action === "taunt") {
      // 3.0s Abyssal Dominance Taunt:
      // 1) Scrapes left & right obsidian talons across each other in front of the chest Black Hole, throwing a cross-flare (0.00 - 0.30)
      // 2) Rises into the full / [  ] \ Reference Image A-Frame Power Stance while armor fissures & star-eye flare blindingly (0.30 - 0.56)
      // 3) Leans close toward the camera and curls right talons inward twice ("Come to the Singularity") while left arm stays flared wide (0.56 - 1.00)
      const cycle = 3.0;
      const u = (localT % cycle) / cycle;

      const tauntPhase = u < 0.16 ? 0 : u < 0.36 ? 1 : 2;
      if (tauntPhase !== st.lastPhase) {
        st.lastPhase = tauntPhase;
        if (tauntPhase === 1) {
          addSpringImpulse(0.3, 0.4, -0.28, 0, 0);
        } else if (tauntPhase === 2) {
          addSpringImpulse(0.85, 0.55, -0.65, 0, 0);
        }
      }

      pose = sampleKeyframes(u, [
        { t: 0.0, p: {} },
        // Scrape claws across each other in front of the singularity
        {
          t: 0.16,
          p: {
            bodyPos: [0, 3.2, 0.25],
            bodyRot: [0.1, 0, 0],
            headRot: [0.14, 0, -0.1],
            plateSpread: 0.2,
            lShoulderPos: [1.14, 0.72, 0.3],
            rShoulderPos: [-1.14, 0.72, 0.3],
            lShoulderRot: [-0.58, 0.45, -0.25],
            rShoulderRot: [-0.58, -0.45, 0.25],
            lElbowRot: [-0.68, 0, -0.15],
            rElbowRot: [-0.68, 0, 0.15],
            lClaws: [0.45, 0.5, 0.55, 0.6],
            rClaws: [0.45, 0.5, 0.55, 0.6],
            coreSurge: 0.8
          }
        },
        // Spread into full / [  ] \ Reference Image A-Frame Power Stance!
        {
          t: 0.42,
          hold: true,
          p: {
            bodyPos: [0, 3.68, 0.32],
            bodyRot: [-0.18, 0, 0],
            chestRot: [-0.2, 0, 0],
            headRot: [-0.28, 0, 0],
            plateSpread: 0.75,
            lShoulderPos: [1.42, 0.86, -0.1],
            rShoulderPos: [-1.42, 0.86, -0.1],
            lShoulderRot: [-0.15, -0.25, 0.88],
            rShoulderRot: [-0.15, 0.25, -0.88],
            lElbowRot: [-0.18, 0, 0.22],
            rElbowRot: [-0.18, 0, -0.22],
            lClaws: [-0.35, -0.35, -0.35, -0.35],
            rClaws: [-0.35, -0.35, -0.35, -0.35],
            coreScale: 1.4,
            coreSurge: 1.85
          }
        },
        // Stalk close to camera, right (-X) hand extended palm-up for "Come here" beckon #1, left (+X) arm flared wide
        {
          t: 0.62,
          p: {
            bodyPos: [0, 2.95, 0.65],
            bodyRot: [0.2, 0.2, 0],
            chestRot: [0.16, 0.22, 0],
            headRot: [-0.12, -0.2, 0.12],
            plateSpread: 0.25,
            rShoulderPos: [-1.18, 0.7, 0.35],
            rShoulderRot: [-1.22, -0.18, -0.28],
            rElbowRot: [-0.22, 0, -0.1],
            rWristRot: [-0.42, 0, 3.14],
            rClaws: [-0.2, -0.2, -0.2, -0.2],
            lShoulderRot: [0.2, -0.2, 0.72],
            lElbowRot: [-0.24, 0, 0.16],
            coreScale: 1.15,
            coreSurge: 1.1
          }
        },
        // Curl right razor talons inward ("Come to your doom" beckon #1)
        {
          t: 0.73,
          hold: true,
          p: {
            bodyPos: [0, 2.95, 0.65],
            bodyRot: [0.2, 0.2, 0],
            chestRot: [0.16, 0.22, 0],
            headRot: [-0.1, -0.2, 0.12],
            rShoulderPos: [-1.18, 0.7, 0.35],
            rShoulderRot: [-1.22, -0.18, -0.28],
            rElbowRot: [-0.32, 0, -0.1],
            rWristRot: [-0.22, 0, 3.14],
            rClaws: [0.95, 0.95, 0.95, 0.95],
            lShoulderRot: [0.2, -0.2, 0.72],
            lElbowRot: [-0.24, 0, 0.16],
            coreScale: 1.2,
            coreSurge: 1.3
          }
        },
        // Second curl ("Come here" beckon #2)
        {
          t: 0.85,
          hold: true,
          p: {
            bodyPos: [0, 2.95, 0.65],
            bodyRot: [0.2, 0.2, 0],
            chestRot: [0.16, 0.22, 0],
            headRot: [-0.14, -0.2, 0.16],
            rShoulderPos: [-1.18, 0.7, 0.35],
            rShoulderRot: [-1.22, -0.18, -0.28],
            rElbowRot: [-0.35, 0, -0.1],
            rWristRot: [-0.18, 0, 3.14],
            rClaws: [0.95, 0.95, 0.95, 0.95],
            lShoulderRot: [0.2, -0.2, 0.72],
            lElbowRot: [-0.24, 0, 0.16],
            coreScale: 1.2,
            coreSurge: 1.4
          }
        },
        { t: 1.0, p: {} }
      ], cycle);

      if (u >= 0.12 && u <= 0.28) {
        slashXProg = clamp01((u - 0.12) / 0.12);
        slashXAlpha = Math.sin(((u - 0.12) / 0.16) * Math.PI) * 0.85;
      }
      if (u >= 0.36 && u <= 0.68) {
        shock1 = (u - 0.36) / 0.32;
        shock1Col = "#fb7185";
      }

      // Talons scrape sparks; the power stance is a roar that shakes the world; each beckon tugs at it
      const tHit = u < 0.16 ? 0 : u < 0.36 ? 1 : u < 0.73 ? 2 : u < 0.85 ? 3 : 4;
      if (tHit !== st.lastHit) {
        if (tHit === 1) cine({ flash: 0.3, flashCol: "#ffe4e6", quake: 0.05, stop: 0.05 });
        else if (tHit === 2) cine({ quake: 0.22, lines: 1.0, flash: 0.42, flashCol: "#fda4af", vig: 0.55, vigCol: "#7f1d1d" });
        else if (tHit >= 3) cine({ quake: 0.05, vig: 0.4, vigCol: "#7f1d1d", lines: 0.3 });
        st.lastHit = tHit;
      }
      if (u >= 0.36 && u < 0.62) {
        const k = (u - 0.36) / 0.26;
        tremble = 0.04 * (1 - k);
        soulMode = "requiem";
        soulProg = smooth(k);
        novaScale = 0.5 + smooth(k) * 6;
        novaAlpha = (1 - k) * 0.5;
        novaCol = "#fda4af";
        lines = (1 - k) * 0.55;
      }
      // "Come here": each curl of the talons pulls the void toward him
      if (u >= 0.66) {
        charge = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(((u - 0.66) / 0.12) * Math.PI * 2 - Math.PI / 2));
        vig = 0.3;
        vigCol = "#7f1d1d";
      }
    } else if (action === "death") {
      // 4.2s Multi-Stage Death with Gravity Failure & Floor Bounce Physics
      const cycle = 4.2;
      const u = (localT % cycle) / cycle;

      const deathPhase = u < 0.42 ? 0 : u < 0.82 ? 1 : 2;
      if (deathPhase !== st.lastPhase) {
        st.lastPhase = deathPhase;
        if (deathPhase === 1) {
          spawnDebrisBurst(0, 0, 1.25);
          const dirs: Array<[number, number, number]> = [
            [0.2, 2.2, 1.4],
            [2.1, 2.5, 0.5],
            [-2.1, 2.5, 0.5],
            [1.6, 1.8, 1.2],
            [-1.6, 1.8, 1.2],
            [0, 1.2, -1.5]
          ];
          phys.pieces.forEach((pc, idx) => {
            pc.pos.set(0, 0, 0);
            pc.vel.set(dirs[idx][0], dirs[idx][1], dirs[idx][2]);
            pc.rot.set(0, 0, 0);
            pc.angVel.set((idx % 2 ? 1 : -1) * 4.5, 3.2, (idx % 2 ? -1 : 1) * 5.0);
          });
        }
      }

      const shudder = u < 0.42 ? Math.sin(t * 52) * 0.08 * (u / 0.42) : 0;
      pose = sampleKeyframes(u, [
        { t: 0.0, p: {} },
        // Clutch the unstable chest core
        {
          t: 0.22,
          p: {
            bodyPos: [shudder, 3.05, -0.26],
            bodyRot: [0.22, 0.16, -0.08],
            chestRot: [0.25, -0.14, 0],
            headRot: [0.35, 0.22, -0.14],
            plateSpread: 0.45,
            lShoulderRot: [-0.62, 0.48, -0.22],
            rShoulderRot: [-0.62, -0.48, 0.22],
            lElbowRot: [-0.95, 0, -0.15],
            rElbowRot: [-0.95, 0, 0.15],
            coreScale: 1.45,
            coreSurge: 1.8
          }
        },
        // Violently flung wide outward by core implosion
        {
          t: 0.4,
          p: {
            bodyPos: [shudder, 2.35, -0.1],
            bodyRot: [-0.32, 0, 0],
            chestRot: [-0.38, 0, 0],
            headRot: [-0.58, 0, 0],
            plateSpread: 1.1,
            lShoulderRot: [0.32, -0.35, 0.95],
            rShoulderRot: [0.32, 0.35, -0.95],
            coreScale: 0.16,
            coreSurge: 2.5
          }
        },
        {
          t: 0.56,
          hold: true,
          p: {
            bodyPos: [0, 0.55, 0.25],
            bodyRot: [1.25, 0.08, -0.1],
            chestRot: [0.14, 0, 0],
            headRot: [-0.22, 0.42, 0.22],
            plateSpread: 0.8,
            lShoulderRot: [-0.42, -0.25, 0.82],
            rShoulderRot: [-0.42, 0.25, -0.82],
            coreScale: 0.02,
            coreSurge: -0.9
          }
        },
        {
          t: 0.82,
          hold: true,
          p: {
            bodyPos: [0, 0.55, 0.25],
            bodyRot: [1.25, 0.08, -0.1],
            chestRot: [0.14, 0, 0],
            headRot: [-0.22, 0.42, 0.22],
            plateSpread: 0.8,
            lShoulderRot: [-0.42, -0.25, 0.82],
            rShoulderRot: [-0.42, 0.25, -0.82],
            coreScale: 0.02,
            coreSurge: -0.9
          }
        },
        { t: 1.0, p: {} }
      ], cycle);

      if (u >= 0.4 && u <= 0.72) {
        shock1 = (u - 0.4) / 0.32;
        shock1Col = "#e11d48";
      }

      // The core fails: it flickers and the titan shakes apart, implodes in a blinding crimson flash, crashes down,
      // lies dark while the world dims, then the core re-ignites and draws its pieces home
      const dHit = u < 0.42 ? 0 : u < 0.56 ? 1 : u < 0.95 ? 2 : 3;
      if (dHit !== st.lastHit) {
        if (dHit === 1) cine({ quake: 0.34, stop: 0.13, flash: 0.9, flashCol: "#fda4af", lines: 1.0 });
        else if (dHit === 2) cine({ quake: 0.18 });
        else if (dHit === 3) cine({ flash: 0.38, flashCol: "#fecdd3", quake: 0.06 });
        st.lastHit = dHit;
      }
      if (u < 0.42) {
        const k = u / 0.42;
        tremble = k * k * 0.06;
        vig = k * 0.5;
        vigCol = "#7f1d1d";
        pose.coreSurge += Math.sin(t * 31) * 0.7 * k;
        pose.coreScale *= 1 + Math.sin(t * 23) * 0.12 * k;
      } else if (u < 0.82) {
        vig = 0.8;
        vigCol = "#450a0a";
        const k = (u - 0.42) / 0.14;
        if (k < 1) {
          novaScale = 0.4 + smooth(k) * 7;
          novaAlpha = (1 - k) * 0.8;
          novaCol = "#fb7185";
        }
      } else {
        const k = (u - 0.82) / 0.18;
        vig = 0.8 * (1 - smooth(k));
        vigCol = "#450a0a";
        charge = Math.sin(k * Math.PI) * 0.9;
      }
    }

    // A shudder now and then in the idle (its gap seeded per cycle): every floating part loosens, then snaps back
    let shudder = 0;
    if (action === "idle") {
      const gap = 8;
      const idx = Math.floor(t / gap);
      const k = (t - idx * gap - 1 - hash01(idx + 31) * 4) / 0.8;
      if (k > 0 && k < 1) {
        shudder = Math.sin(k * Math.PI);
        tremble = Math.max(tremble, shudder * 0.012);
      }
    }

    // ---------------- Step Spring-Damper Secondary Physics ----------------
    const stiffness = 135;
    const damping = 11.5;
    phys.springVel.addScaledVector(phys.springPos, -stiffness * dt);
    phys.springVel.multiplyScalar(Math.exp(-damping * dt));
    phys.springPos.addScaledVector(phys.springVel, dt);

    phys.springRotVel.addScaledVector(phys.springRot, -stiffness * dt);
    phys.springRotVel.multiplyScalar(Math.exp(-damping * dt));
    phys.springRot.addScaledVector(phys.springRotVel, dt);

    // ---------------- Step 7-Tier Helical Vortex Chain Physics ----------------
    const vx = (pose.bodyPos[0] - phys.prevBodyPos.x) / Math.max(0.001, dt);
    const vy = (pose.bodyPos[1] - phys.prevBodyPos.y) / Math.max(0.001, dt);
    const vz = (pose.bodyPos[2] - phys.prevBodyPos.z) / Math.max(0.001, dt) + travel;
    const vyaw = (pose.bodyRot[1] + pose.chestRot[1] - phys.prevBodyYaw) / Math.max(0.001, dt);
    phys.prevBodyPos.set(...pose.bodyPos);
    phys.prevBodyYaw = pose.bodyRot[1] + pose.chestRot[1];

    // ---------------- Step Arm Follow-Through ----------------
    // The heavy arms trail the body: thrown back when it lunges, dragged in when it rises, left behind when it turns
    {
      const lagTarget = scratch.v.set(
        THREE.MathUtils.clamp((vz - travel * 0.7) * 0.07, -0.35, 0.35),
        THREE.MathUtils.clamp(-vy * 0.06, -0.25, 0.25),
        THREE.MathUtils.clamp(-vyaw * 0.08, -0.3, 0.3)
      );
      phys.armLagVel.addScaledVector(lagTarget.sub(phys.armLag), 70 * dt);
      phys.armLagVel.multiplyScalar(Math.exp(-7 * dt));
      phys.armLag.addScaledVector(phys.armLagVel, dt);
      phys.armLag.clampScalar(-0.45, 0.45);
      // The pauldron slabs: softer and slower, so they swing on after the shoulders stop
      const slabTarget = scratch.v.set(
        THREE.MathUtils.clamp(-vy * 0.05 + (vz - travel * 0.7) * 0.04, -0.3, 0.3),
        THREE.MathUtils.clamp(-vyaw * 0.06, -0.25, 0.25),
        THREE.MathUtils.clamp(-vx * 0.05, -0.25, 0.25)
      );
      phys.slabLagVel.addScaledVector(slabTarget.sub(phys.slabLag), 34 * dt);
      phys.slabLagVel.multiplyScalar(Math.exp(-4.5 * dt));
      phys.slabLag.addScaledVector(phys.slabLagVel, dt);
      phys.slabLag.clampScalar(-0.4, 0.4);
    }

    for (let i = 0; i < VORTEX_TIER_COUNT; i++) {
      const targetX = i === 0 ? -vx * 0.045 : phys.vortexLagX[i - 1] * 1.12;
      const targetZ = i === 0 ? -vz * 0.045 : phys.vortexLagZ[i - 1] * 1.12;
      const kSpring = 85 - i * 6;
      phys.vortexVelX[i] += (targetX - phys.vortexLagX[i]) * kSpring * dt;
      phys.vortexVelZ[i] += (targetZ - phys.vortexLagZ[i]) * kSpring * dt;
      phys.vortexVelX[i] *= Math.exp(-8.5 * dt);
      phys.vortexVelZ[i] *= Math.exp(-8.5 * dt);
      phys.vortexLagX[i] = THREE.MathUtils.clamp(phys.vortexLagX[i] + phys.vortexVelX[i] * dt, -0.65, 0.65);
      phys.vortexLagZ[i] = THREE.MathUtils.clamp(phys.vortexLagZ[i] + phys.vortexVelZ[i] * dt, -0.65, 0.65);
    }

    // ---------------- Step Death Detachable Piece Gravity & Floor Bounce ----------------
    let shatterBlend = 0;
    if (action === "death") {
      const u = (localT % 4.2) / 4.2;
      if (u >= 0.42 && u < 0.82) {
        shatterBlend = 1;
        phys.pieces.forEach((pc) => {
          pc.vel.y -= 14.5 * dt;
          pc.pos.addScaledVector(pc.vel, dt);
          if (pc.pos.y < -0.55) {
            pc.pos.y = -0.55;
            pc.vel.y = -pc.vel.y * 0.38;
            pc.vel.x *= 0.72;
            pc.vel.z *= 0.72;
            pc.angVel.multiplyScalar(0.65);
          }
          pc.rot.x += pc.angVel.x * dt;
          pc.rot.y += pc.angVel.y * dt;
          pc.rot.z += pc.angVel.z * dt;
        });
      } else if (u >= 0.82) {
        shatterBlend = 1 - smooth((u - 0.82) / 0.16);
      }
    }

    // ---------------- Step Ballistic Debris Shards ----------------
    phys.debris.forEach((d, idx) => {
      const g = B.debris[idx];
      if (!d.active) {
        g.scale.setScalar(HIDDEN);
        return;
      }
      d.vel.y -= 20.0 * dt;
      d.pos.addScaledVector(d.vel, dt);
      if (d.pos.y < 0.08) {
        d.pos.y = 0.08;
        d.vel.y = -d.vel.y * 0.42;
        d.vel.x *= 0.74;
        d.vel.z *= 0.74;
        d.angVel.multiplyScalar(0.7);
      }
      d.rot.x += d.angVel.x * dt;
      d.rot.y += d.angVel.y * dt;
      d.rot.z += d.angVel.z * dt;
      g.position.copy(d.pos);
      g.rotation.copy(d.rot);
      g.scale.setScalar(d.scale);
    });

    // ---------------- Effect uniforms ----------------
    U.surge.value = pose.coreSurge;
    U.glow.value = THREE.MathUtils.clamp(0.9 + pose.coreSurge * 0.3, 0.15, 2.2);
    mats.starFlare.uniforms.uIntensity.value = Math.max(0.05, 1.2 + pose.coreSurge * 0.6);
    mats.slashRight.uniforms.uProgress.value = slashRightProg;
    mats.slashRight.uniforms.uAlpha.value = slashRightAlpha;
    mats.slashLeft.uniforms.uProgress.value = slashLeftProg;
    mats.slashLeft.uniforms.uAlpha.value = slashLeftAlpha;
    mats.slashX.uniforms.uProgress.value = slashXProg;
    mats.slashX.uniforms.uAlpha.value = slashXAlpha;
    mats.shock1.uniforms.uWave.value = shock1;
    mats.shock1.uniforms.uColor.value.set(shock1Col);
    mats.shock2.uniforms.uWave.value = shock2;
    mats.shock2.uniforms.uColor.value.set(shock2Col);
    mats.novaMat.opacity = novaAlpha;
    mats.novaMat.color.set(novaCol);
    // Effects are drawn only while they play
    if (slashRightRef.current) slashRightRef.current.visible = slashRightAlpha > 0.01;
    if (slashLeftRef.current) slashLeftRef.current.visible = slashLeftAlpha > 0.01;
    if (slashX1Ref.current) slashX1Ref.current.visible = slashXAlpha > 0.01;
    if (slashX2Ref.current) slashX2Ref.current.visible = slashXAlpha > 0.01;
    if (shock1Ref.current) shock1Ref.current.visible = shock1 > 0.001 && shock1 < 0.999;
    if (shock2Ref.current) shock2Ref.current.visible = shock2 > 0.001 && shock2 < 0.999;
    if (novaSphereRef.current) {
      novaSphereRef.current.visible = novaAlpha > 0.003;
      novaSphereRef.current.position.set(...novaPos);
      novaSphereRef.current.scale.setScalar(novaScale);
    }
    if (chargeRef.current) chargeRef.current.visible = charge > 0.001;
    // Emerge: the rift, and nothing of the core's light, its dust or its eye in this world before it breaks out (the eye
    // burns in the void once the talons are through)
    const beyond = action === "emerging" && localT < BURST_T;
    if (riftRef.current) {
      riftRef.current.visible = riftCrack > 0.001 && riftBreak < 1;
      const ru = mats.rift.uniforms;
      ru.uTime.value = t;
      ru.uCrack.value = riftCrack;
      ru.uOpen.value = riftOpen;
      ru.uBreak.value = riftBreak;
    }
    for (const r of [discRef, lensRef, funnelRef, particlesRef]) if (r.current) r.current.visible = !beyond;
    if (eyeRef.current) eyeRef.current.visible = !(action === "emerging" && localT < 1.7);
    {
      const mesh = riftShardsRef.current;
      let alive = false;
      phys.riftShards.forEach((sh, i) => {
        if (sh.life > 0) {
          sh.life -= dt / 1.8;
          sh.vel.y -= 6 * dt;
          sh.vel.multiplyScalar(Math.exp(-0.7 * dt));
          sh.pos.addScaledVector(sh.vel, dt);
          sh.rot.set(sh.rot.x + sh.spin.x * dt, sh.rot.y + sh.spin.y * dt, sh.rot.z + sh.spin.z * dt);
        }
        alive ||= sh.life > 0;
        if (!mesh) return;
        const size = sh.life > 0 ? sh.size * smooth(sh.life / 0.5) : HIDDEN;
        mesh.setMatrixAt(i, scratch.m.compose(sh.pos, scratch.q.setFromEuler(sh.rot), scratch.s.setScalar(Math.max(HIDDEN, size))));
      });
      if (mesh) {
        mesh.visible = alive;
        mesh.instanceMatrix.needsUpdate = alive;
      }
    }
    mats.chargeVortex.uniforms.uCharge.value = charge;
    // Screen quake: the whole stage shakes under the camera
    if (rootRef.current) {
      const q = phys.fx.quake;
      rootRef.current.position.set(Math.sin(t * 71) * q, Math.sin(t * 83 + 1.7) * q * 0.7, Math.sin(t * 59 + 0.4) * q * 0.4);
      rootRef.current.rotation.z = Math.sin(t * 67 + 2.3) * q * 0.05;
    }

    // ---------------- Pose the skeleton ----------------
    // How loose the floating parts hang: the breath and surges open them, a shudder shakes them apart
    const loose = 1 + pose.plateSpread * 1.6 + Math.max(0, pose.coreSurge) * 0.25 + shudder * 1.8;
    B.body.position.set(
      pose.bodyPos[0] + phys.springPos.x + Math.sin(t * 53.0) * tremble,
      pose.bodyPos[1] + phys.springPos.y + Math.sin(t * 61.0 + 1.3) * tremble * 0.6,
      pose.bodyPos[2] + phys.springPos.z + Math.sin(t * 47.0 + 2.1) * tremble * 0.5
    );
    B.body.rotation.set(pose.bodyRot[0] + phys.springRot.x, pose.bodyRot[1] + phys.springRot.y, pose.bodyRot[2] + phys.springRot.z);
    B.chest.rotation.set(...pose.chestRot);

    // The ten plates framing the hole, each drifting a little on its own
    B.chestPlates.forEach((g, i) => {
      const a = (i / 10) * Math.PI * 2;
      const r = 0.74 + (i % 2) * 0.08 + pose.plateSpread * 0.35 + Math.sin(t * 1.1 + i * 1.7) * 0.012 * loose;
      g.position.set(Math.sin(a) * r, 0.08 + Math.cos(a) * r, (i % 2) * 0.05 - 0.06 + Math.sin(t * 0.9 + i * 2.3) * 0.01 * loose);
      g.rotation.set(-0.18 - pose.plateSpread * 0.25 + Math.sin(t * 1.3 + i) * 0.03 * loose, 0, -a + Math.sin(t * 0.7 + i * 0.9) * 0.025 * loose);
    });

    B.core.scale.setScalar(Math.max(0.02, pose.coreScale));

    // Head: the shattered pieces fly on death
    {
      const pc = phys.pieces[0];
      B.head.position.set(pc.pos.x * shatterBlend, 1.14 + pose.plateSpread * 0.18 + pc.pos.y * shatterBlend, 0.08 + pc.pos.z * shatterBlend);
      B.head.rotation.set(pose.headRot[0] + pc.rot.x * shatterBlend, pose.headRot[1] + pc.rot.y * shatterBlend, pose.headRot[2] + pc.rot.z * shatterBlend);
    }
    // The crown's spires trail the head's turns on their own springs, float a hair off it and lift as it surges
    {
      const pitch = pose.headRot[0] + pose.chestRot[0] + pose.bodyRot[0];
      const yaw = pose.headRot[1] + pose.chestRot[1] + pose.bodyRot[1];
      const pv = (pitch - phys.prevHead.x) / Math.max(0.001, dt);
      const yv = (yaw - phys.prevHead.y) / Math.max(0.001, dt);
      phys.prevHead.set(pitch, yaw);
      B.crown.forEach((c, i) => {
        const lag = (phys.crownLag[i] ??= { x: 0, z: 0, vx: 0, vz: 0 });
        const k = 55 + (i % 4) * 12;
        lag.vx += (THREE.MathUtils.clamp(-pv * 0.05, -0.3, 0.3) - lag.x) * k * dt;
        lag.vz += (THREE.MathUtils.clamp(yv * 0.04 * (c.rest.pos.x >= 0 ? 1 : -1) + vx * 0.02, -0.3, 0.3) - lag.z) * k * dt;
        lag.vx *= Math.exp(-6 * dt);
        lag.vz *= Math.exp(-6 * dt);
        lag.x += lag.vx * dt;
        lag.z += lag.vz * dt;
        const ph = i * 1.9;
        c.g.position.set(c.rest.pos.x, c.rest.pos.y + (loose - 1) * 0.03 * (1 + (i % 3)) + Math.sin(t * 1.2 + ph) * 0.01 * loose, c.rest.pos.z);
        c.g.rotation.set(
          c.rest.rot.x + lag.x + Math.sin(t * 0.8 + ph) * 0.02 * loose,
          c.rest.rot.y + Math.sin(t * 0.5 + ph) * 0.05,
          c.rest.rot.z + lag.z + Math.sin(t * 1.05 + ph * 1.3) * 0.02 * loose
        );
      });
    }
    // Four small shards circling the crown on tilted paths
    B.satellites.forEach((g, i) => {
      const a = t * (0.55 + i * 0.13) * (i % 2 ? -1 : 1) + i * 1.57;
      g.position.set(Math.cos(a) * (0.8 + i * 0.06), 0.85 + Math.sin(a * 1.3 + i) * 0.18, -0.1 + Math.sin(a) * 0.45);
      g.rotation.set(t * (0.9 + i * 0.2), a, 0.4);
    });

    // Shoulders, pauldrons and their slabs, elbows, plates, wrists and talons
    for (const side of SIDES) {
      const pc = phys.pieces[side > 0 ? 3 : 4];
      const sp = side > 0 ? pose.lShoulderPos : pose.rShoulderPos;
      const sr = side > 0 ? pose.lShoulderRot : pose.rShoulderRot;
      B.shoulder[side].position.set(sp[0] + side * pose.plateSpread * 0.22 + pc.pos.x * shatterBlend, sp[1] + pc.pos.y * shatterBlend, sp[2] + pc.pos.z * shatterBlend);
      B.shoulder[side].rotation.set(sr[0] + phys.armLag.x + pc.rot.x * shatterBlend, sr[1] + phys.armLag.z + pc.rot.y * shatterBlend, sr[2] - side * phys.armLag.y + pc.rot.z * shatterBlend);
      // Pauldrons are mounted on the chest above the shoulders so their blades always flare high and wide
      const pp = phys.pieces[side > 0 ? 1 : 2];
      B.pauldron[side].position.set(side * (1.25 + pose.plateSpread * 0.28) + pp.pos.x * shatterBlend, 0.95 + pose.plateSpread * 0.18 + pp.pos.y * shatterBlend, pp.pos.z * shatterBlend);
      B.pauldron[side].rotation.set(pp.rot.x * shatterBlend, pp.rot.y * shatterBlend, side * (-0.42 - pose.plateSpread * 0.18) + pp.rot.z * shatterBlend);
      B.slabs[side].forEach((sl, i) => {
        const ph = i * 2.1 + (side > 0 ? 0 : 1.3);
        const w = 0.6 + i * 0.35;
        sl.g.position.set(
          sl.rest.pos.x + side * (loose - 1) * 0.03 * (i + 1) + Math.sin(t * 1.15 + ph) * 0.014 * loose,
          sl.rest.pos.y + (loose - 1) * 0.025 * (i + 1) + Math.sin(t * 1.6 + ph * 2) * 0.016 * loose,
          sl.rest.pos.z + Math.sin(t * 0.95 + ph * 3) * 0.012 * loose
        );
        sl.g.rotation.set(
          sl.rest.rot.x + phys.slabLag.x * w + Math.sin(t * 0.9 + ph) * 0.025 * loose,
          sl.rest.rot.y + phys.slabLag.y * w * side,
          sl.rest.rot.z + side * phys.slabLag.z * w + Math.sin(t * 1.1 + ph * 1.5) * 0.025 * loose
        );
      });
      const er = side > 0 ? pose.lElbowRot : pose.rElbowRot;
      B.elbow[side].rotation.set(er[0] + phys.armLag.x * 0.6, er[1], er[2]);
      // Gravity-bound arm plates: each floats on its own a hair off its joint, loosening as the core surges
      ARM_PLATES.forEach((plate, pi) => {
        const g = B.plates[`${side}:${plate.id}`];
        const base = plate.at(side);
        const ph = pi * 1.7 + (side > 0 ? 0 : 3.1);
        g.position.set(
          base.pos[0] + Math.sin(t * 1.3 + ph) * 0.018 * loose * side,
          base.pos[1] + Math.sin(t * 1.7 + ph * 2) * 0.026 * loose,
          base.pos[2] + Math.sin(t * 1.1 + ph * 3) * 0.018 * loose
        );
        g.rotation.set(
          base.rot[0] + Math.sin(t * 0.9 + ph) * 0.035 * loose,
          base.rot[1] + Math.sin(t * 1.2 + ph * 2) * 0.03 * loose,
          base.rot[2] + Math.sin(t * 1.05 + ph * 1.5) * 0.035 * loose
        );
      });
      B.wrist[side].rotation.set(...(side > 0 ? pose.lWristRot : pose.rWristRot));
      const claws = side > 0 ? pose.lClaws : pose.rClaws;
      B.talons[side].forEach((g, i) => {
        g.rotation.x = claws[i] * 1.15;
      });
    }

    // The vortex: each tier turns its own way and swings on the chain
    B.vortex.forEach((g, tIdx) => {
      const pc = phys.pieces[5];
      const waveX = Math.sin(t * 2.4 - tIdx * 0.55) * 0.04 * (tIdx + 1) + phys.vortexLagX[tIdx];
      const waveZ = Math.cos(t * 2.1 - tIdx * 0.55) * 0.04 * (tIdx + 1) + phys.vortexLagZ[tIdx];
      g.position.set(waveX + pc.pos.x * shatterBlend * (0.4 + tIdx * 0.15), -0.68 - 0.37 * tIdx - pose.plateSpread * tIdx * 0.05 + pc.pos.y * shatterBlend, waveZ + pc.pos.z * shatterBlend * (0.4 + tIdx * 0.15));
      g.rotation.set(waveZ * 0.35 + pc.rot.x * shatterBlend, t * (0.35 + tIdx * 0.08) * (tIdx % 2 === 0 ? 1 : -0.6), -waveX * 0.35 + pc.rot.z * shatterBlend);
    });

    // Orbiting ruins: elliptical paths, each tumbling its own way; they fall when the titan does
    B.ruins.forEach((g, i) => {
      const d = RUINS[i];
      const orbAngle = t * (0.28 + (i % 3) * 0.08) * (i % 2 === 0 ? 1 : -1) + d.phase;
      const bob = Math.sin(t * d.speed + d.phase) * 0.24;
      const pull = 1.0 - pose.plateSpread * 0.16;
      g.position.set((d.pos[0] + Math.cos(orbAngle) * d.orbit) * pull, d.pos[1] + bob - shatterBlend * 2.2, (d.pos[2] + Math.sin(orbAngle) * d.orbit * 0.85) * pull + groundZ);
      g.rotation.set(d.rot[0] + Math.sin(t * 0.65 + d.phase) * 0.22, d.rot[1] + t * (0.16 + (i % 4) * 0.05) * (i % 2 ? 1 : -1), d.rot[2] + Math.cos(t * 0.55 + d.phase) * 0.18);
    });

    // Shards pulled into the core: spiralling in faster and faster, stretched as they fall, gone at the horizon
    {
      const coreY = pose.bodyPos[1] + 0.08;
      const coreZ = pose.bodyPos[2] + 0.16;
      B.shards.forEach((g, i) => {
        const cycleDur = 4.6 + (i % 3) * 0.85;
        const u = ((t + i * 1.37) % cycleDur) / cycleDur;
        const p = Math.pow(u, 2.15);
        const r = Math.max(0.08, (1.0 - p) * (2.65 + (i % 3) * 0.55));
        const theta = i * 1.047 + (p * 7.2 + t * 0.35) * (i % 2 === 0 ? 1 : -1);
        const incl = ((i % 3) - 1) * 0.38;
        g.position.set(Math.cos(theta) * r, coreY + Math.sin(theta) * r * 0.58 + Math.cos(theta * 0.5) * r * incl - shatterBlend * 2.0, coreZ + Math.sin(theta) * r * 0.72);
        g.rotation.set(theta * 0.7, -theta, theta * 1.3 + p * 3.0);
        const base = (0.9 + (i % 2) * 0.3) * smooth(clamp01(u / 0.15)) * (1.0 - smooth(clamp01((u - 0.85) / 0.15))) * (1.0 - shatterBlend);
        const stretch = 1.0 + smooth(clamp01((u - 0.52) / 0.42)) * 2.4;
        g.scale.set(Math.max(HIDDEN, base / Math.sqrt(stretch)), Math.max(HIDDEN, base * stretch), Math.max(HIDDEN, base / Math.sqrt(stretch)));
      });
    }

    // Casting: shards spiralling in, then flung out in the requiem
    B.souls.forEach((g, i) => {
      if (soulMode === "none") {
        g.scale.setScalar(HIDDEN);
        return;
      }
      const aBase = (i / 16) * Math.PI * 2;
      if (soulMode === "inward") {
        const p = (soulProg + (i % 4) * 0.2) % 1;
        const r = (1 - p) * 3.8 + 0.2;
        const a = aBase + p * 5.0;
        g.position.set(Math.cos(a) * r, 0.8 + p * 2.9 + Math.sin(a * 2) * 0.4 * (1 - p), Math.sin(a) * r);
        g.rotation.set(0, -a, 0.6);
        g.scale.setScalar(1.1 + (1 - p) * 1.2);
      } else {
        const r = 0.4 + soulProg * 5.2;
        const a = aBase - soulProg * 1.4;
        g.position.set(Math.cos(a) * r, 3.5 + ((i % 3) - 1) * 0.35 * soulProg * 2.5, Math.sin(a) * r);
        g.rotation.set(0, -a, -Math.PI / 2);
        g.scale.setScalar(Math.max(0.01, (1 - soulProg * 0.65) * 2.2));
      }
    });

    // Rubble the gravity lifts off the ground: it rises slowly, tumbling, hangs, then drops
    B.rubble.forEach((r) => {
      const per = 6 + r.seed * 4;
      const u = (((t + r.seed * per) % per) + per) % per / per;
      const height = 0.6 + r.seed * 0.9 + Math.max(0, pose.coreSurge) * 0.15;
      const lift = u < 0.7 ? smooth(u / 0.7) * height : u < 0.8 ? height * (1 - Math.pow((u - 0.7) / 0.1, 2)) : 0;
      const pull = 1 - lift * 0.08;
      r.g.position.set(r.x * pull, 0.08 + lift, r.z * pull);
      r.g.rotation.set(lift * 2.1 + r.seed * 6, lift * 1.3, lift * 0.7);
    });

    // The ground (and the rubble on it) held back beyond the rift until the body is through (Emerge)
    B.ground.position.z = groundZ;

    // ---------------- Skin: the bones into the texture, and what follows them ----------------
    writeBones(built.rig.bones, U.bones.value);
    const corePos = scratch.core.setFromMatrixPosition(B.core.matrixWorld);
    // Emerge: the arms pry the rift open. Wherever an arm passes through the rift's plane the hole is just that wide there
    // (room for the forearm and the rift's ragged edge), so the talons only ever come out of the void and its edges ride
    // the arms as they wrench it apart
    if (action === "emerging" && localT < BURST_T) {
      let need = 0;
      for (const side of SIDES) {
        const [sh, el, wr, tip] = scratch.arm;
        sh.setFromMatrixPosition(B.shoulder[side].matrixWorld);
        el.setFromMatrixPosition(B.elbow[side].matrixWorld);
        wr.setFromMatrixPosition(B.wrist[side].matrixWorld);
        // The hand and talons reach on past the wrist
        tip.copy(wr).sub(el).multiplyScalar(0.5).add(wr);
        for (let i = 0; i < 3; i++) {
          const a = scratch.arm[i];
          const b = scratch.arm[i + 1];
          if ((a.z - RIFT_Z) * (b.z - RIFT_Z) > 0 || a.z === b.z) continue;
          const k = (RIFT_Z - a.z) / (b.z - a.z);
          const x = lerp(a.x, b.x, k);
          const y = (lerp(a.y, b.y, k) - RIFT_Y) / RIFT_H;
          need = Math.max(need, (Math.abs(x) + 0.32) / (0.9 * Math.sqrt(Math.max(0.15, 1 - y * y))));
        }
      }
      mats.rift.uniforms.uOpen.value = Math.max(riftOpen, need);
    }
    U.core.value.copy(corePos);
    const coreScale = Math.max(0.02, pose.coreScale);
    const gain = THREE.MathUtils.clamp(0.85 + pose.coreSurge * 0.4, 0.1, 2.2);
    mats.disc.uniforms.uGain.value = gain;
    mats.lens.uniforms.uGain.value = gain;
    if (coreVisRef.current) coreVisRef.current.matrix.copy(B.core.matrixWorld);
    // Lensing ring, the charge and the eye always face the viewer
    const root = rootRef.current;
    if (root) {
      root.updateMatrixWorld();
      // Emerge: keep only what is in front of the rift's plane (in world space for three)
      if (clipRift) built.clip.set(scratch.w.set(0, 0, 1), -RIFT_Z).applyMatrix4(root.matrixWorld);
      else built.clip.set(scratch.w.set(0, 0, 1), 1e6);
      const face = scratch.q.copy(root.getWorldQuaternion(scratch.q2).invert()).multiply(camera.quaternion);
      if (lensRef.current) {
        lensRef.current.position.copy(corePos);
        lensRef.current.quaternion.copy(face);
        lensRef.current.scale.setScalar(HORIZON_R * coreScale);
      }
      if (chargeRef.current) {
        chargeRef.current.position.copy(corePos);
        chargeRef.current.quaternion.copy(face);
        chargeRef.current.scale.setScalar(1.3);
      }
      if (eyeRef.current) {
        eyeRef.current.position.copy(B.eye).applyMatrix4(B.head.matrixWorld);
        eyeRef.current.quaternion.copy(face);
        eyeRef.current.scale.setScalar(0.44);
      }
      // The ring is brightest on the side the disc turns toward the viewer
      if (discRef.current) {
        discRef.current.updateWorldMatrix(true, false);
        const n = discRef.current.getWorldDirection(scratch.w).transformDirection(camera.matrixWorldInverse);
        mats.lens.uniforms.uDop.value = Math.atan2(n.x, -n.y);
      }
    }
    // The disc's plane in the model's space, for the matter falling into it
    {
      const pu = mats.particles.uniforms;
      scratch.q2.setFromRotationMatrix(scratch.m.extractRotation(B.core.matrixWorld)).multiply(scratch.q.setFromEuler(scratch.e.set(...DISC_ROT)));
      pu.uDiskU.value.set(1, 0, 0).applyQuaternion(scratch.q2);
      pu.uDiskV.value.set(0, 1, 0).applyQuaternion(scratch.q2);
      pu.uViewH.value = viewSize.height * gl.getPixelRatio();
      // The well of dust runs down the vortex chain to the ground under its tip
      const path = mats.funnel.uniforms.uPath.value as THREE.Vector3[];
      B.vortex.forEach((g, i) => path[i].setFromMatrixPosition(g.matrixWorld));
      path[7].set(path[6].x, 0.02, path[6].z);
      pu.uBase.value.set(path[6].x, 0.05, path[6].z);
      mats.funnel.uniforms.uGain.value = 1 - shatterBlend * 0.7;
    }

    // Cinematic transients fade on the wall clock (so a hit-stop doesn't hold them)
    const fx = phys.fx;
    fx.flash *= Math.exp(-rawDt * 7);
    fx.lines *= Math.exp(-rawDt * 4.5);
    fx.vig *= Math.exp(-rawDt * 2.2);
    fx.quake *= Math.exp(-rawDt * 5.5);
    const sFlash = Math.max(flash, fx.flash);
    const sLines = Math.max(lines, fx.lines);
    const sVig = Math.max(vig, fx.vig);
    const blackoutOn = screenFx && (sFlash > 0.003 || sLines > 0.003 || sVig > 0.003 || swallow >= 0 || open >= 0);
    if (blackoutRef.current) blackoutRef.current.visible = blackoutOn;
    if (blackoutOn && root) {
      const bu = mats.blackout.uniforms;
      scratch.v.copy(corePos).applyMatrix4(root.matrixWorld).project(camera);
      bu.uCenter.value.set(scratch.v.x, scratch.v.y);
      bu.uAspect.value = viewSize.width / Math.max(1, viewSize.height);
      bu.uTime.value = t;
      bu.uFlash.value = sFlash;
      if (flash >= fx.flash) bu.uFlashCol.value.set(flashCol);
      else bu.uFlashCol.value.copy(fx.flashCol);
      bu.uLines.value = sLines;
      bu.uVignette.value = sVig;
      if (vig >= fx.vig) bu.uVigCol.value.set(vigCol);
      else bu.uVigCol.value.copy(fx.vigCol);
      bu.uSwallow.value = swallow;
      bu.uOpen.value = open;
      bu.uHeart.value = heart;
    }
  });

  const { mats, geos } = built;
  return (
    <group ref={rootRef} scale={0.86}>
      {/* A cold rim from behind so the black reads against the dark, a pale key, crimson from below */}
      {lights && (
        <>
          <directionalLight position={[-3, 7, -6]} color="#b9c4ff" intensity={1.8} />
          <pointLight position={[2.6, 5.2, 4.2]} color="#ffe1e4" intensity={2.5} distance={14} />
          <pointLight position={[0, 0.7, 1.4]} color="#ff3b4a" intensity={3} distance={6} />
        </>
      )}

      {/* Mythic aura: the curtain of light and the embers (no beam: light falls into this one) */}
      <MythicAura beams={[]} curtainRadius={4.6} curtainHeight={3.6} emberRadii={[1.8, 4.4]} emberHeight={8} embers={200} gain={auraGain} />

      {/* The titan, its ruins, rubble and debris: three skinned draws */}
      <mesh geometry={geos.rock} material={mats.rock} frustumCulled={false} />
      <mesh geometry={geos.obsidian} material={mats.obsidian} frustumCulled={false} />
      <mesh geometry={geos.glow} material={mats.glow} frustumCulled={false} />

      {/* The black hole: the horizon, the tilted accretion disc (its far half hidden by the sphere), the core's light */}
      <group ref={coreVisRef} matrixAutoUpdate={false}>
        <mesh geometry={geos.horizon} material={mats.horizon} />
        <mesh ref={discRef} geometry={geos.disc} material={mats.disc} rotation={DISC_ROT} renderOrder={2} />
        {lights && <pointLight color="#ff2a3a" intensity={5} distance={7} />}
      </group>
      <mesh ref={lensRef} geometry={geos.lens} material={mats.lens} renderOrder={3} />
      <mesh ref={chargeRef} geometry={geos.quad} material={mats.chargeVortex} renderOrder={4} visible={false} />
      <mesh ref={eyeRef} geometry={geos.quad} material={mats.starFlare} renderOrder={5} />

      {/* The well of dust under the vortex, and the dust, grit, infalling matter and sparks */}
      <mesh ref={funnelRef} geometry={geos.funnel} material={mats.funnel} frustumCulled={false} renderOrder={1} />
      <points ref={particlesRef} geometry={geos.particles} material={mats.particles} frustumCulled={false} renderOrder={2} />

      {/* Emerge: the rift it tears its way out of (after the auras and beams round it, which it hides behind its void), and
          the splinters of its rim when it breaks */}
      <mesh ref={riftRef} geometry={geos.riftQuad} material={mats.rift} position={[0, RIFT_Y, RIFT_Z]} renderOrder={4} frustumCulled={false} visible={false} />
      <instancedMesh ref={riftShardsRef} args={[geos.riftShard, mats.riftShard, RIFT_SHARDS]} frustumCulled={false} visible={false} />

      {/* Dust rings kicked up by impacts */}
      <mesh ref={shock1Ref} geometry={geos.quad} material={mats.shock1} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]} scale={5.0} visible={false} />
      <mesh ref={shock2Ref} geometry={geos.quad} material={mats.shock2} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} scale={5.0} visible={false} />

      {/* Casting: the self-destruct flash and the void swallowing the panel (a full-screen quad drawn last) */}
      <mesh ref={blackoutRef} geometry={geos.quad} material={mats.blackout} frustumCulled={false} renderOrder={10000} visible={false} />

      {/* The nova bursting out */}
      <mesh ref={novaSphereRef} geometry={geos.novaSphere} material={mats.novaMat} position={[0, 3.5, 0]} scale={0.001} visible={false} />

      {/* Claw slashes torn through the air (the first two at head height, the X of the slam lower) */}
      <mesh ref={slashRightRef} geometry={geos.slashRibbon} material={mats.slashRight} position={[0, 3.65, 1.18]} rotation={[0.92, 0.22, -0.25]} visible={false} />
      <mesh ref={slashLeftRef} geometry={geos.slashRibbon} material={mats.slashLeft} position={[0, 3.7, 1.22]} rotation={[0.92, -0.25, 2.85]} visible={false} />
      <mesh ref={slashX1Ref} geometry={geos.slashRibbon} material={mats.slashX} position={[0, 2.75, 1.35]} rotation={[0.55, 0.55, -0.65]} visible={false} />
      <mesh ref={slashX2Ref} geometry={geos.slashRibbon} material={mats.slashX} position={[0, 2.75, 1.35]} rotation={[0.55, -0.55, 2.45]} visible={false} />
    </group>
  );
}

/** Where each orbiting ruin circles (two rock islands with columns, rocks, a drum, a capital, a frieze block, a shard) */
const RUINS: Array<{ pos: [number, number, number]; rot: [number, number, number]; speed: number; phase: number; orbit: number }> = [
  { pos: [-3.3, 4.7, -1.3], rot: [0.12, 0.4, -0.12], speed: 1.1, phase: 0.0, orbit: 0.26 },
  { pos: [3.4, 4.3, -1.2], rot: [-0.1, -0.5, 0.15], speed: 0.95, phase: 1.4, orbit: 0.26 },
  { pos: [-1.85, 1.55, 0.45], rot: [0.3, 0.8, 0.35], speed: 1.3, phase: 2.1, orbit: 0.36 },
  { pos: [1.95, 1.45, 0.35], rot: [-0.25, -0.6, -0.3], speed: 1.25, phase: 3.5, orbit: 0.36 },
  { pos: [-2.15, 5.05, -0.65], rot: [0.2, 1.1, 1.0], speed: 1.0, phase: 4.2, orbit: 0.32 },
  { pos: [2.25, 4.95, -0.55], rot: [-0.5, -1.2, 0.4], speed: 1.05, phase: 5.0, orbit: 0.32 },
  { pos: [-1.3, 2.55, 0.75], rot: [0.4, 0.2, -0.4], speed: 1.6, phase: 0.8, orbit: 0.44 },
  { pos: [1.4, 2.45, 0.65], rot: [-0.4, -0.3, 0.4], speed: 1.5, phase: 2.7, orbit: 0.44 },
  { pos: [-3.4, 2.65, 0.15], rot: [0.25, 0.9, 0.2], speed: 1.35, phase: 1.9, orbit: 0.38 },
  { pos: [3.5, 2.75, 0.15], rot: [-0.25, -0.9, -0.2], speed: 1.4, phase: 4.6, orbit: 0.38 }
];
