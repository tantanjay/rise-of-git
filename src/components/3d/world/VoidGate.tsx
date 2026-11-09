import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mulberry32, hashString, range, Rng } from "@/utils/random";

/* ------------------------------------------------------------------------------------------------------------------ */
/* The Void Gate (mythic): a tall broken arch of floating obsidian round a swirling, depth-warped vortex, void shards  */
/* orbiting it, crackling arcs and embers. Not in the realm yet: the Royal Codex shows it as coming soon.               */
/*                                                                                                                    */
/* One model, two renderings: Normal and HD share the layout, colours and motion (the same seed); HD adds bevelled     */
/* glassy obsidian, finer veins, a second current in the vortex, flakes peeling off the arch, more chips drawn in,     */
/* forked arcs and more embers. Everything repeating is instanced: 7 draws in both (plus the footing's shadow), all    */
/* motion in useFrame / the GPU, nothing that moves casts a shadow, no beam, ground disc or rune ring.                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Its Codex entry's type (GET /api/codex) */
export const VOID_GATE_TYPE = "void-gate";

/** The arch's mid-line: legs at x = ±HALF from LEG_FOOT up to SPRING, then a half circle of radius HALF over the top */
const HALF = 2.0;
const LEG_FOOT = 0.75;
const SPRING = 4.9;
const LEG = SPRING - LEG_FOOT;
const ARCH_LEN = 2 * LEG + Math.PI * HALF;
const BLOCKS = 23;
/** The keystone sits at the apex; the two voussoirs right of it have broken out and drift free */
const KEYSTONE = 11;
const BROKEN = new Set([13, 14]);
/** The vortex fills the opening, a little inside the arch's inner face */
const VORTEX_W = 1.56;
const VORTEX_FOOT = 0.82;
const VORTEX_C = 3.7;
const TUNNEL = 1.05;

const VOID_BLACK = "vec3(0.016, 0.006, 0.03)";

/** A point on the arch's mid-line at arc length s, its outward normal (away from the opening) and its tangent */
function archAt(s: number): { p: THREE.Vector3; n: THREE.Vector3; t: THREE.Vector3 } {
  if (s < LEG) return { p: new THREE.Vector3(-HALF, LEG_FOOT + s, 0), n: new THREE.Vector3(-1, 0, 0), t: new THREE.Vector3(0, 1, 0) };
  if (s > LEG + Math.PI * HALF) {
    const k = s - LEG - Math.PI * HALF;
    return { p: new THREE.Vector3(HALF, SPRING - k, 0), n: new THREE.Vector3(1, 0, 0), t: new THREE.Vector3(0, -1, 0) };
  }
  const a = Math.PI - (s - LEG) / HALF;
  const n = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
  return { p: new THREE.Vector3(0, SPRING, 0).addScaledVector(n, HALF), n, t: new THREE.Vector3(Math.sin(a), -Math.cos(a), 0) };
}

/** How far from the vortex's centre its rim lies in direction (dx, dy): the opening's shape (legs, a round top, a sill) */
function rimDistance(dx: number, dy: number): number {
  let best = Infinity;
  if (Math.abs(dx) > 1e-6) {
    const t = VORTEX_W / Math.abs(dx);
    const y = VORTEX_C + t * dy;
    if (y <= SPRING && y >= VORTEX_FOOT) best = Math.min(best, t);
  }
  if (dy < -1e-6) {
    const t = (VORTEX_FOOT - VORTEX_C) / dy;
    if (Math.abs(t * dx) <= VORTEX_W) best = Math.min(best, t);
  }
  // The round top: |c + t·d − (0, SPRING)| = W, the far root
  const oy = VORTEX_C - SPRING;
  const b = dx * 0 + dy * oy;
  const c = oy * oy - VORTEX_W * VORTEX_W;
  const disc = b * b - c;
  if (disc >= 0) {
    const t = -b + Math.sqrt(disc);
    if (t > 0 && VORTEX_C + t * dy >= SPRING) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : VORTEX_W;
}

interface Block {
  /** Rest place, outward normal, tangent */
  p: THREE.Vector3;
  n: THREE.Vector3;
  t: THREE.Vector3;
  size: THREE.Vector3;
  tilt: number;
  phase: number;
  rate: number;
  broken: boolean;
  /** Along the arch, 0 … 1 (the prismatic edge's hue) */
  u: number;
  /** Which way the block's local +y points: −1 when it points outward, so its inner face is at −y */
  inSign: number;
}

function buildBlocks(rng: Rng): Block[] {
  const spacing = ARCH_LEN / BLOCKS;
  const out: Block[] = [];
  for (let k = 0; k < BLOCKS; k++) {
    const s = (k + 0.5) * spacing;
    const { p, n, t } = archAt(s);
    const key = k === KEYSTONE;
    out.push({
      p,
      n,
      t,
      // Tangent length, thickness (outward), depth (z): the keystone stands proud
      size: new THREE.Vector3(spacing * range(rng, 0.78, 0.88), key ? 0.98 : range(rng, 0.62, 0.84), key ? 1.08 : range(rng, 0.82, 0.98)),
      tilt: range(rng, -0.07, 0.07),
      phase: rng() * Math.PI * 2,
      rate: range(rng, 0.55, 0.95),
      broken: BROKEN.has(k),
      u: k / (BLOCKS - 1),
      // The block's roll turns +x onto the tangent, so +y lands on (−t.y, t.x)
      inSign: -n.x * -t.y + -n.y * t.x > 0 ? 1 : -1
    });
  }
  return out;
}

/* ---------------------------------------------------- shaders ---------------------------------------------------- */

const PRISM = `vec3 prism(float h) { return 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }`;

/** Obsidian: crimson fissures pulsing in its local space (HD: a second, finer set), patched onto a standard material */
function obsidianMaterial(hd: boolean, time: { value: number }, shard = false): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: shard ? "#1d0f33" : "#1b1224",
    roughness: hd ? 0.16 : 0.38,
    metalness: hd ? 0.25 : 0.1,
    emissive: shard ? "#4c1d95" : "#000000",
    emissiveIntensity: shard ? 0.45 : 0,
    flatShading: !hd
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSeed;\nvarying vec3 vLocal;\nvarying float vSeed;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;\nvSeed = aSeed;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;\nvarying vec3 vLocal;\nvarying float vSeed;`)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec3 q = vLocal * 2.6 + vSeed * 9.0;
          // One warped zero line, shown only where a slower field lets it: a few thin cracks a stone, not a pattern
          float f = sin(q.x * 2.1 + sin(q.y * 2.6 + q.z * 1.9) * 1.7 + sin(q.z * 1.3) * 0.8);
          float gate = smoothstep(0.15, 0.55, 0.5 + 0.5 * sin(q.y * 1.1 + q.z * 0.9 + vSeed * 17.0));
          float vein = (1.0 - smoothstep(0.0, 0.08, abs(f))) * gate;
          ${hd ? `float g = sin(q.y * 4.4 + sin(q.x * 3.7 + q.z * 2.9) * 1.2);
          vein = max(vein, (1.0 - smoothstep(0.0, 0.05, abs(g))) * gate * 0.5);` : ""}
          float beat = 0.55 + 0.45 * sin(uTime * 1.3 + vSeed * 6.2832);
          totalEmissiveRadiance += vec3(0.86, 0.1, 0.22) * vein * beat * ${shard ? "0.9" : "1.3"};
          // A crimson-violet sheen at the grazing edges, so the black stone keeps its shape against the dark
          vec3 viewDir = normalize(vViewPosition + vec3(0.0, 0.0, 1e-5));
          float rim = pow(max(1.0 - abs(dot(normal, viewDir)), 0.0), 3.0);
          totalEmissiveRadiance += mix(vec3(0.5, 0.06, 0.16), vec3(0.32, 0.14, 0.62), 0.5 + 0.5 * sin(uTime * 0.4 + vSeed * 6.2832)) * rim * 0.55;
        }`
      );
  };
  m.customProgramCacheKey = () => `void-obsidian-${hd ? 1 : 0}-${shard ? 1 : 0}`;
  return m;
}

/** The prismatic edge: thin strips on the arch's inner face, a wave of light running up one leg and down the other */
function trimMaterial(time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: `
      attribute float aSeed;
      varying float vU;
      void main() {
        vU = aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying float vU;
      ${PRISM}
      void main() {
        float wave = 0.5 + 0.5 * sin(vU * 14.0 - uTime * 2.2);
        vec3 c = mix(vec3(0.85, 0.08, 0.2), prism(vU * 0.9 + uTime * 0.04), 0.35 + 0.3 * wave);
        gl_FragColor = vec4(c * (0.55 + wave * 0.75), 1.0);
      }`,
    toneMapped: false
  });
}

/** The vortex: two funnels (one per face) sinking into the gate, three spiral arms turning inward over a black core */
function vortexMaterial(hd: boolean, time: { value: number }, speed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uSpeed: { value: speed } },
    vertexShader: `
      attribute vec2 aP;
      attribute float aSide;
      uniform float uTime;
      varying vec2 vP;
      varying float vR;
      void main() {
        vP = aP;
        float r = clamp(length(aP), 0.0, 1.0);
        vR = r;
        float ang = r > 1e-4 ? atan(aP.y, aP.x) : 0.0;
        // The funnel breathes and ripples as it turns: deepest in the middle, still at the rim
        vec3 p = position;
        p.z += aSide * sin(ang * 2.0 - uTime * 1.1) * 0.09 * r * (1.0 - r) * 4.0;
        p.z -= aSide * sin(uTime * 0.7) * 0.12 * (1.0 - r) * (1.0 - r);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uSpeed;
      varying vec2 vP;
      varying float vR;
      ${PRISM}
      void main() {
        float r = clamp(vR, 0.0, 1.0);
        float ang = length(vP) > 1e-4 ? atan(vP.y, vP.x) : 0.0;
        float lr = log(max(r, 0.02));
        float t = uTime * uSpeed;
        float a1 = 0.5 + 0.5 * sin(ang * 3.0 + lr * 4.6 + t);
        float arms = a1 * a1 * a1;
        ${hd ? `float a2 = 0.5 + 0.5 * sin(ang * 5.0 + lr * 7.5 + t * 1.7 + sin(r * 9.0 - t) * 0.6);
        float fine = a2 * a2 * a2 * a2;
        float cur = 0.5 + 0.5 * sin(ang * 2.0 - lr * 3.0 - t * 0.6);
        arms = arms * (0.75 + 0.35 * cur) + fine * 0.45;` : ""}
        // Rings sliding down the throat: the tunnel reads as deep even face on
        float rings = 0.5 + 0.5 * sin(lr * 9.0 + uTime * 1.6);
        vec3 col = ${VOID_BLACK};
        col = mix(col, vec3(0.34, 0.1, 0.62), arms * smoothstep(0.08, 0.7, r) * (0.8 + 0.25 * rings));
        col = mix(col, vec3(0.62, 0.06, 0.2), arms * smoothstep(0.55, 0.95, r) * 0.7);
        col += vec3(0.4, 0.04, 0.12) * smoothstep(0.82, 1.0, r) * (0.3 + 0.5 * arms);
        // Down the throat it darkens to the void, with a faint cold light far in
        col *= mix(0.1, 1.0, smoothstep(0.0, 0.55, r));
        col += vec3(0.55, 0.45, 0.85) * exp(-r * 22.0) * (0.25 + 0.12 * sin(uTime * 2.7));
        // The prismatic lip: a thin line where the void meets the stone
        float lip = smoothstep(0.93, 0.98, r) * (1.0 - smoothstep(0.985, 1.0, r));
        col += prism(ang * 0.159 + uTime * 0.05) * lip * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
    toneMapped: false
  });
}

/** Two funnels over the opening's shape: rings from the throat to the rim, the front one sunk towards −z, the back towards +z */
function vortexGeometry(hd: boolean): THREE.BufferGeometry {
  const rings = hd ? 30 : 18;
  const segs = hd ? 80 : 48;
  const pos: number[] = [];
  const pp: number[] = [];
  const side: number[] = [];
  const index: number[] = [];
  for (const sd of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= rings; i++) {
      const r = i / rings;
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const R = rimDistance(dx, dy);
        const depth = TUNNEL * Math.pow(1 - r, 1.6);
        pos.push(dx * R * r, VORTEX_C + dy * R * r, -sd * depth);
        pp.push(dx * r, dy * r);
        side.push(sd);
      }
    }
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < segs; j++) {
        const a = base + i * segs + j;
        const b = base + (i + 1) * segs + j;
        const c = base + (i + 1) * segs + ((j + 1) % segs);
        const d = base + i * segs + ((j + 1) % segs);
        // Front funnel faces +z, the back one −z
        if (sd > 0) index.push(a, b, c, a, c, d);
        else index.push(a, c, b, a, d, c);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aP", new THREE.Float32BufferAttribute(pp, 2));
  g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** Embers rise off the arch; sparks spiral into the vortex on both faces. All on the GPU from one clock */
function emberMaterial(time: { value: number }, scale: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uScale: scale },
    vertexShader: `
      attribute vec4 aA;
      attribute vec4 aB;
      uniform float uTime;
      uniform float uScale;
      varying float vFade;
      varying float vHue;
      void main() {
        float life = max(aA.w, 0.1);
        float u = fract(uTime / life + aB.x);
        vec3 p;
        if (aB.y < 0.5) {
          // Rising: drift up and out, a little sideways wander
          p = position + aA.xyz * (u * life) + vec3(sin(u * 6.0 + aB.x * 20.0) * 0.12, 0.0, cos(u * 5.0 + aB.x * 13.0) * 0.12);
        } else {
          // Drawn in: round and down the funnel on face aA.x
          vec2 rel = position.xy - vec2(0.0, ${VORTEX_C.toFixed(2)});
          float a0 = length(rel) > 1e-4 ? atan(rel.y, rel.x) : 0.0;
          float shrink = pow(max(1.0 - u, 0.0), 1.3);
          float a = a0 - u * aA.y;
          p = vec3(cos(a) * length(rel) * shrink, ${VORTEX_C.toFixed(2)} + sin(a) * length(rel) * shrink, -aA.x * ${TUNNEL.toFixed(2)} * u * u * 0.85 + aA.x * 0.06);
        }
        vFade = sin(u * 3.14159);
        vHue = aB.w;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aB.z * uScale * (0.35 + 0.65 * vFade) / max(-mv.z, 0.1);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vFade;
      varying float vHue;
      ${PRISM}
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = max(1.0 - d, 0.0);
        vec3 c = vHue < 0.0 ? vec3(1.0, 0.25, 0.3) : mix(vec3(0.75, 0.35, 1.0), prism(vHue), 0.45);
        gl_FragColor = vec4(c * a * a * max(vFade, 0.0) * 1.4, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
}

/* ------------------------------------------------------- model ------------------------------------------------------ */

interface Arc {
  /** Its own rng (Normal's arcs strike the same in HD); HD's forks take another */
  rng: Rng;
  forkRng: Rng;
  /** Seconds: lit until `until`, then dark until `next` */
  until: number;
  next: number;
  reroll: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  color: THREE.Color;
  /** HD: a fork off one of its joints */
  forkAt: number;
  forkDir: THREE.Vector3;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const Y_UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const IDENTITY_Q = new THREE.Quaternion();

export function VoidGate({ hd = false, seed = "void-gate" }: { hd?: boolean; seed?: string }) {
  const time = useMemo(() => ({ value: 0 }), []);
  const pointScale = useMemo(() => ({ value: 300 }), []);

  const model = useMemo(() => {
    // One seed for the layout and the motion, the same in Normal and HD; HD's extra detail takes its own rng
    const rng = mulberry32(hashString(seed));
    const hdRng = mulberry32(hashString(`${seed}:hd`));
    const blocks = buildBlocks(rng);

    // Footing: broken obsidian stones under each leg and rubble shed round the feet (still, casting shadows)
    const footing: Array<{ p: THREE.Vector3; s: THREE.Vector3; ry: number; rz: number }> = [];
    for (const sx of [-1, 1]) {
      footing.push({ p: new THREE.Vector3(sx * HALF, 0.2, 0), s: new THREE.Vector3(1.05, 0.4, 1.25), ry: range(rng, -0.12, 0.12), rz: 0 });
      footing.push({ p: new THREE.Vector3(sx * HALF + sx * 0.05, 0.5, range(rng, -0.08, 0.08)), s: new THREE.Vector3(0.8, 0.22, 1.0), ry: range(rng, -0.25, 0.25), rz: 0 });
    }
    for (let i = 0; i < 7; i++) {
      const sx = i % 2 ? 1 : -1;
      const sz = rng() < 0.5 ? 1 : -1;
      const w = range(rng, 0.18, 0.38);
      footing.push({
        p: new THREE.Vector3(sx * range(rng, 1.1, 3.1), w * 0.35, sz * range(rng, 0.7, 1.6)),
        s: new THREE.Vector3(w, w * 0.7, w * range(rng, 0.8, 1.3)),
        ry: rng() * Math.PI,
        rz: range(rng, -0.35, 0.35)
      });
    }

    // Void shards: big ones on wide tilted orbits round the gate
    const shards = Array.from({ length: 8 }, (_, i) => ({
      R: range(rng, 3.0, 3.7),
      squash: range(rng, 0.72, 0.9),
      y: VORTEX_C + range(rng, -0.6, 1.4),
      amp: range(rng, 0.5, 1.3),
      phase: (i / 8) * Math.PI * 2 + range(rng, -0.25, 0.25),
      speed: range(rng, 0.22, 0.38),
      spin: range(rng, 0.4, 1.1),
      size: range(rng, 0.75, 1.15),
      tilt: range(rng, -0.5, 0.5)
    }));
    // The vortex's tempo and the clock's offset: the same in both renderings
    const vortexSpeed = range(rng, 0.85, 1.1);
    const clock0 = rng() * 50;
    // Chips torn off the rim and drawn down the funnel (on both faces): Normal's five, and HD's more after them
    const chip = (r: Rng, i: number) => ({
      a0: r() * Math.PI * 2,
      period: range(r, 3.2, 6.0),
      phase: r(),
      side: i % 2 ? 1 : -1,
      turns: range(r, 3.5, 6.5),
      size: range(r, 0.7, 1.2)
    });
    const chips = Array.from({ length: hd ? 14 : 5 }, (_, i) => chip(i < 5 ? rng : hdRng, i));
    // HD: flakes peeling off the arch's outer face, circling close round their block
    const flakes = hd
      ? blocks
          .map((b, k) => ({ b, k }))
          .filter(({ b, k }) => !b.broken && k % 2 === 0)
          .map(({ k }) => ({ k, phase: hdRng() * Math.PI * 2, speed: range(hdRng, 0.6, 1.2), r: range(hdRng, 0.18, 0.3), size: range(hdRng, 0.35, 0.6) }))
      : [];

    // Embers rising off the arch, sparks drawn into the vortex
    const emberCount = hd ? 150 : 56;
    const ePos: number[] = [];
    const eA: number[] = [];
    const eB: number[] = [];
    for (let i = 0; i < emberCount; i++) {
      // Normal's embers first, the same in HD; HD's extra ones from its own rng
      const eRng = i < 56 ? rng : hdRng;
      const drawn = i % 3 === 0;
      if (drawn) {
        const a = eRng() * Math.PI * 2;
        const R = rimDistance(Math.cos(a), Math.sin(a)) * range(eRng, 0.92, 1.02);
        ePos.push(Math.cos(a) * R, VORTEX_C + Math.sin(a) * R, 0);
        eA.push(eRng() < 0.5 ? 1 : -1, range(eRng, 2.5, 5.0), 0, range(eRng, 2.2, 3.6));
        eB.push(eRng(), 1, range(eRng, 0.09, 0.16), eRng());
      } else {
        const b = blocks[Math.floor(eRng() * blocks.length)];
        const p = b.p.clone().addScaledVector(b.n, range(eRng, -0.3, 0.4));
        ePos.push(p.x, p.y, p.z + range(eRng, -0.45, 0.45));
        eA.push(b.n.x * 0.12 + range(eRng, -0.08, 0.08), range(eRng, 0.35, 0.75), range(eRng, -0.08, 0.08), range(eRng, 2.6, 4.6));
        eB.push(eRng(), 0, range(eRng, 0.08, 0.15), eRng() < 0.55 ? -1 : eRng());
      }
    }
    const embers = new THREE.BufferGeometry();
    embers.setAttribute("position", new THREE.Float32BufferAttribute(ePos, 3));
    embers.setAttribute("aA", new THREE.Float32BufferAttribute(eA, 4));
    embers.setAttribute("aB", new THREE.Float32BufferAttribute(eB, 4));
    embers.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3.5, 0), 7);

    // Crackling arcs: the first always bridges the broken crown, the rest jump along the inner face
    const arcCount = hd ? 5 : 3;
    const arcSegs = hd ? 9 : 7;
    const forkSegs = hd ? 4 : 0;
    const arcs: Arc[] = Array.from({ length: arcCount }, (_, ai) => ({
      rng: mulberry32(hashString(`${seed}:arc:${ai}`)),
      forkRng: mulberry32(hashString(`${seed}:fork:${ai}`)),
      until: 0,
      next: ai * 0.27,
      reroll: 0,
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      color: new THREE.Color(),
      forkAt: 0,
      forkDir: new THREE.Vector3()
    }));

    return {
      blocks,
      footing,
      shards,
      chips,
      flakes,
      embers,
      arcs,
      arcSegs,
      forkSegs,
      vortexSpeed,
      clock0
    };
  }, [seed, hd]);

  // Geometries (each with its per-instance seeds: the veins' pattern and beat, the strip's place along the arch) and
  // materials, disposed on unmount
  const nShards = model.shards.length + model.chips.length + model.flakes.length;
  const nArcs = model.arcs.length * (model.arcSegs + model.forkSegs);
  const geo = useMemo(() => {
    const seeded = <G extends THREE.BufferGeometry>(g: G, n: number, f: (i: number) => number): G => {
      g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: n }, (_, i) => f(i))), 1));
      return g;
    };
    const blockGeo = () => (hd ? new RoundedBoxGeometry(1, 1, 1, 2, 0.07) : new THREE.BoxGeometry(1, 1, 1));
    return {
      foot: seeded(blockGeo(), model.footing.length, (i) => (i * 0.377) % 1),
      block: seeded(blockGeo(), BLOCKS, (i) => model.blocks[i].phase / 6.2832),
      trim: seeded(new THREE.BoxGeometry(1, 1, 1), BLOCKS * 2, (i) => model.blocks[i >> 1].u),
      shard: seeded(new THREE.OctahedronGeometry(0.5, 0), nShards, (i) => (i * 0.618) % 1),
      arc: new THREE.BoxGeometry(1, 1, 1),
      vortex: vortexGeometry(hd)
    };
  }, [hd, model, nShards]);
  const mats = useMemo(
    () => ({
      block: obsidianMaterial(hd, time),
      shard: obsidianMaterial(hd, time, true),
      trim: trimMaterial(time),
      vortex: vortexMaterial(hd, time, model.vortexSpeed),
      arc: new THREE.MeshBasicMaterial({ color: "#ffffff", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
      ember: emberMaterial(time, pointScale)
    }),
    [hd, time, pointScale, model.vortexSpeed]
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => () => model.embers.dispose(), [model]);

  const footRef = useRef<THREE.InstancedMesh>(null);
  const blockRef = useRef<THREE.InstancedMesh>(null);
  const trimRef = useRef<THREE.InstancedMesh>(null);
  const shardRef = useRef<THREE.InstancedMesh>(null);
  const arcRef = useRef<THREE.InstancedMesh>(null);

  // The still footing, and every arc segment hidden until it strikes
  useLayoutEffect(() => {
    const foot = footRef.current;
    if (foot) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      model.footing.forEach((f, i) => {
        q.setFromEuler(new THREE.Euler(0, f.ry, f.rz));
        foot.setMatrixAt(i, m.compose(f.p, q, f.s));
      });
      foot.instanceMatrix.needsUpdate = true;
      foot.computeBoundingSphere();
    }
    const arc = arcRef.current;
    if (arc) {
      const black = new THREE.Color(0, 0, 0);
      for (let i = 0; i < nArcs; i++) {
        arc.setMatrixAt(i, ZERO);
        arc.setColorAt(i, black);
      }
      arc.instanceMatrix.needsUpdate = true;
      if (arc.instanceColor) arc.instanceColor.needsUpdate = true;
    }
  }, [model, geo, nShards, nArcs]);

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), m2: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), e: new THREE.Euler(), v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color() }),
    []
  );
  /** Where each block's inner face sits this frame (arcs leap from them) */
  const inner = useMemo(() => model.blocks.map(() => new THREE.Vector3()), [model]);

  useFrame((state) => {
    const t = state.clock.elapsedTime + model.clock0;
    time.value = t;
    // Pixels per world unit at distance 1: a point of size k is k world units across
    const fov = (state.camera as THREE.PerspectiveCamera).fov ?? 40;
    pointScale.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan((fov * Math.PI) / 360));
    const { m, m2, q, p, s, e, v, w, c } = tmp;
    const blocks = blockRef.current;
    const trims = trimRef.current;
    if (blocks && trims) {
      model.blocks.forEach((b, k) => {
        const ph = b.phase;
        const w1 = t * b.rate;
        // Each stone hangs a hair off its neighbours and breathes in and out with the vortex; the broken pair drift and tumble
        const out = b.broken ? 0.75 + 0.18 * Math.sin(w1 * 0.6 + ph) : 0.06 + 0.04 * Math.sin(w1 + ph);
        p.copy(b.p).addScaledVector(b.n, out);
        p.z += b.broken ? 0.25 * Math.sin(w1 * 0.4 + ph) : 0.03 * Math.sin(w1 * 0.7 + ph * 2);
        if (b.broken) p.y += 0.35 + 0.12 * Math.sin(w1 * 0.5 + ph);
        const roll = Math.atan2(b.t.y, b.t.x);
        const tumble = b.broken ? t * 0.25 * (k % 2 ? 1 : -1) : 0;
        e.set(
          0.04 * Math.sin(w1 * 0.8 + ph) + (b.broken ? Math.sin(t * 0.3 + ph) * 0.6 : 0),
          0.05 * Math.sin(w1 * 0.6 + ph * 3) + tumble,
          roll + b.tilt + 0.025 * Math.sin(w1 * 0.9 + ph)
        );
        q.setFromEuler(e);
        // Local x along the arch, y across it (±n), z through the gate
        s.copy(b.size);
        blocks.setMatrixAt(k, m.compose(p, q, s));
        // The prismatic edge: a thin strip along the front and back edges of its inner face (the face looking into
        // the opening), 0.05 clear of the stone
        m.compose(p, q, ONE);
        w.set(b.size.x * 0.9, 0.05, 0.08);
        for (const sz of [-1, 1]) {
          v.set(0, b.inSign * (b.size.y / 2 + 0.075), sz * (b.size.z / 2 - 0.05));
          m2.compose(v, IDENTITY_Q, w);
          trims.setMatrixAt(k * 2 + (sz > 0 ? 1 : 0), m2.premultiply(m));
        }
        inner[k].copy(p).addScaledVector(b.n, -(b.size.y / 2 + 0.07));
      });
      blocks.instanceMatrix.needsUpdate = true;
      trims.instanceMatrix.needsUpdate = true;
    }

    const shards = shardRef.current;
    if (shards) {
      let i = 0;
      for (const sh of model.shards) {
        const a = sh.phase + t * sh.speed;
        p.set(Math.cos(a) * sh.R, sh.y + Math.sin(a * 1.0 + sh.tilt * 3) * sh.amp + Math.sin(t * 0.9 + sh.phase) * 0.12, Math.sin(a) * sh.R * sh.squash);
        e.set(sh.tilt + t * sh.spin * 0.3, t * sh.spin, sh.tilt * 0.6);
        q.setFromEuler(e);
        s.set(0.42, 1.0, 0.42).multiplyScalar(sh.size);
        shards.setMatrixAt(i++, m.compose(p, q, s));
      }
      for (const ch of model.chips) {
        const u = (t / ch.period + ch.phase) % 1;
        const R = rimDistance(Math.cos(ch.a0), Math.sin(ch.a0)) * 1.04;
        const shrink = Math.pow(Math.max(1 - u, 0), 1.3);
        const a = ch.a0 - u * ch.turns;
        p.set(Math.cos(a) * R * shrink, VORTEX_C + Math.sin(a) * R * shrink, -ch.side * TUNNEL * u * u * 0.85 + ch.side * 0.12);
        e.set(t * 2.1 + ch.phase * 6, t * 1.7, a);
        q.setFromEuler(e);
        s.set(0.16, 0.3, 0.16).multiplyScalar(ch.size * (0.25 + 0.75 * (1 - u)));
        shards.setMatrixAt(i++, m.compose(p, q, s));
      }
      for (const f of model.flakes) {
        const b = model.blocks[f.k];
        const a = f.phase + t * f.speed;
        // Round the block's outer face, in the plane of the arch's normal and the gate's depth
        p.copy(b.p).addScaledVector(b.n, b.size.y / 2 + 0.28 + Math.cos(a) * f.r * 0.5);
        p.z += Math.sin(a) * (b.size.z / 2 + f.r);
        p.addScaledVector(b.t, Math.sin(a * 0.7) * 0.12);
        e.set(t * 1.3 + f.phase, t * 0.9, f.phase);
        q.setFromEuler(e);
        s.set(0.16, 0.26, 0.1).multiplyScalar(f.size);
        shards.setMatrixAt(i++, m.compose(p, q, s));
      }
      shards.instanceMatrix.needsUpdate = true;
    }

    // Arcs: lit for a flicker, dark for a while; while lit their jagged path is re-rolled ~16 times a second
    const arcMesh = arcRef.current;
    if (arcMesh) {
      const per = model.arcSegs + model.forkSegs;
      model.arcs.forEach((arc, ai) => {
        const base = ai * per;
        const r = arc.rng;
        if (t >= arc.next) {
          // Strike again: the first arc bridges the broken crown, the others leap between stones or into the rim
          arc.until = t + range(r, 0.16, 0.42);
          arc.next = arc.until + range(r, 0.25, ai === 0 ? 0.9 : 1.6);
          arc.reroll = 0;
          if (ai === 0) {
            arc.a.copy(inner[12]);
            arc.b.copy(inner[15]);
          } else {
            const k = Math.floor(r() * BLOCKS);
            const from = model.blocks[k].broken ? KEYSTONE : k;
            arc.a.copy(inner[from]);
            if (r() < 0.5) {
              const to = Math.min(BLOCKS - 1, Math.max(0, from + (r() < 0.5 ? -1 : 1) * (2 + Math.floor(r() * 3))));
              arc.b.copy(inner[model.blocks[to].broken ? KEYSTONE : to]);
            } else {
              // Down into the vortex's lip
              v.set(arc.a.x, arc.a.y - VORTEX_C, 0).normalize();
              const R = rimDistance(v.x, v.y) * range(r, 0.55, 0.85);
              arc.b.set(v.x * R, VORTEX_C + v.y * R, range(r, -0.2, 0.2));
            }
          }
          arc.color.set(r() < 0.5 ? "#ff5a7a" : "#c4a5ff");
          const fr = arc.forkRng;
          arc.forkAt = 2 + Math.floor(fr() * (model.arcSegs - 3));
          arc.forkDir.set(range(fr, -1, 1), range(fr, -1, 1), range(fr, -1, 1)).normalize();
        }
        const lit = t < arc.until;
        if (lit && t >= arc.reroll) {
          arc.reroll = t + 0.06;
          const n = model.arcSegs;
          const dir = w.copy(arc.b).sub(arc.a);
          const len = dir.length();
          let prev = arc.a.clone();
          const pts: THREE.Vector3[] = [prev.clone()];
          for (let j = 1; j <= n; j++) {
            const k = j / n;
            const pt = arc.a.clone().addScaledVector(dir, k);
            if (j < n) {
              const env = Math.sin(Math.PI * k) * len * 0.16;
              pt.x += range(r, -1, 1) * env;
              pt.y += range(r, -1, 1) * env;
              pt.z += range(r, -1, 1) * env;
            }
            pts.push(pt);
          }
          const flick = range(r, 0.7, 1.25);
          const put = (idx: number, a: THREE.Vector3, b: THREE.Vector3, th: number, bright: number) => {
            const d = v.copy(b).sub(a);
            const l = d.length();
            if (l < 1e-4) {
              arcMesh.setMatrixAt(idx, ZERO);
              return;
            }
            q.setFromUnitVectors(Y_UP, d.divideScalar(l));
            p.copy(a).add(b).multiplyScalar(0.5);
            s.set(th, l + th, th);
            arcMesh.setMatrixAt(idx, m.compose(p, q, s));
            arcMesh.setColorAt(idx, c.copy(arc.color).multiplyScalar(bright));
          };
          const th = hd ? 0.035 : 0.05;
          for (let j = 0; j < n; j++) put(base + j, pts[j], pts[j + 1], th, 1.4 * flick);
          // HD: a fork crackling off one joint
          if (model.forkSegs) {
            prev = pts[arc.forkAt].clone();
            for (let j = 0; j < model.forkSegs; j++) {
              const fr = arc.forkRng;
              const nxt = prev.clone().addScaledVector(arc.forkDir, len * 0.09).add(new THREE.Vector3(range(fr, -1, 1), range(fr, -1, 1), range(fr, -1, 1)).multiplyScalar(len * 0.04));
              put(base + n + j, prev, nxt, th * 0.7, 0.9 * flick * (1 - j / model.forkSegs));
              prev = nxt;
            }
          }
          arcMesh.instanceMatrix.needsUpdate = true;
          if (arcMesh.instanceColor) arcMesh.instanceColor.needsUpdate = true;
        } else if (!lit && arc.reroll !== -1) {
          arc.reroll = -1;
          for (let j = 0; j < per; j++) arcMesh.setMatrixAt(base + j, ZERO);
          arcMesh.instanceMatrix.needsUpdate = true;
        }
      });
    }
  });

  return (
    <group>
      <instancedMesh ref={footRef} args={[geo.foot, mats.block, model.footing.length]} castShadow receiveShadow />
      <instancedMesh ref={blockRef} args={[geo.block, mats.block, BLOCKS]} frustumCulled={false} />
      <instancedMesh ref={trimRef} args={[geo.trim, mats.trim, BLOCKS * 2]} frustumCulled={false} />
      <instancedMesh ref={shardRef} args={[geo.shard, mats.shard, nShards]} frustumCulled={false} />
      <mesh geometry={geo.vortex} material={mats.vortex} />
      <instancedMesh ref={arcRef} args={[geo.arc, mats.arc, nArcs]} frustumCulled={false} />
      <points geometry={model.embers} material={mats.ember} />
    </group>
  );
}
