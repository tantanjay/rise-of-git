import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ------------------------------ the legendary aura (high graphics): beam, curtain and embers ------------------------------ */

/*
 * The legendary rung's effects round a hero: a column of flowing light with a bright heart, a curtain of rising light round
 * the model and embers climbing through both, each in the hero's own colours. Every site on the map is merged into the
 * same four draws (beam sheath, beam heart, curtain, embers). The mythic aura (`MythicAura`) keeps the crimson and the
 * prismatic edge to itself.
 */

const NOISE = `
  float lgHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float lgNoise(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = lgHash(vec2(mod(i.x, period), i.y));
    float b = lgHash(vec2(mod(i.x + 1.0, period), i.y));
    float c = lgHash(vec2(mod(i.x, period), i.y + 1.0));
    float d = lgHash(vec2(mod(i.x + 1.0, period), i.y + 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float lgFbm(vec2 p, float period) {
    float s = 0.0;
    float amp = 0.66;
    for (int k = 0; k < 2; k++) {
      s += lgNoise(p, period) * amp;
      p *= 2.0;
      period *= 2.0;
      amp *= 0.5;
    }
    return s;
  }
`;

const VERT = `
  attribute vec3 aCol;
  attribute vec3 aHot;
  varying vec2 vUv;
  varying float vFacing;
  varying vec3 vCol;
  varying vec3 vHot;
  void main() {
    vUv = uv;
    vCol = aCol;
    vHot = aHot;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

// The beam: light flowing up, bright where it faces the eye (the column's middle), soft at its silhouette
const BEAM_FRAG = `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uCore;
  varying vec2 vUv;
  varying float vFacing;
  varying vec3 vCol;
  varying vec3 vHot;
  ${NOISE}
  void main() {
    float y = clamp(vUv.y, 0.0, 1.0); // MSAA shades a hair past the mesh: keep uv in range (a rim of exp(-y * k) flashes)
    float body = pow(max(vFacing, 0.0), mix(2.4, 6.5, uCore));
    float vfade = smoothstep(0.0, 0.05, y) * (1.0 - smoothstep(0.32, 1.0, y));
    // The noise only where the column shows (its middle, below the fade)
    if (body * vfade < 0.004) discard;
    float flow = lgFbm(vec2(vUv.x * 10.0, y * 12.0 - uTime * 1.3), 10.0);
    float streak = lgNoise(vec2(vUv.x * 22.0, y * 2.5 - uTime * 0.7), 22.0);
    float pulse = 0.85 + 0.15 * sin(uTime * 1.9 - y * 8.0);
    float b = body * (0.45 + flow * 0.7 + streak * streak * streak * 0.8) * vfade * pulse * uIntensity;
    vec3 col = mix(vCol, vHot, smoothstep(0.7, 1.0, vFacing) * (0.3 + uCore * 0.7));
    gl_FragColor = vec4(col * b * 1.6, 1.0);
  }
`;

// The curtain: ribbons of light rising round the model and fading, brighter at its sides, a glint here and there
const CURTAIN_FRAG = `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying float vFacing;
  varying vec3 vCol;
  varying vec3 vHot;
  ${NOISE}
  void main() {
    float y = clamp(vUv.y, 0.0, 1.0); // MSAA shades a hair past the mesh: keep uv in range (a rim of exp(-y * k) flashes)
    float rise = pow(max(1.0 - y, 0.0), 2.0) * smoothstep(0.0, 0.04, y);
    float rim = exp(-y * 20.0) * 0.6;
    // The noise only where the curtain still shows (it fades out going up)
    if (rise + rim < 0.012) discard;
    // A slow sway round the ring (whole waves, so it closes)
    float sway = (sin(vUv.x * 75.398 + uTime * 0.55) * 0.5 + sin(vUv.x * 31.416 - uTime * 0.35) * 0.6) * 0.7;
    float ribbons = lgFbm(vec2(vUv.x * 32.0 + sway, y * 1.5 - uTime * 0.5), 32.0);
    ribbons = ribbons * ribbons * 2.4;
    float glint = 0.0;
    if (rise > 0.05) {
      glint = lgNoise(vec2(vUv.x * 80.0, y * 8.0 - uTime * 2.0), 80.0);
      glint *= glint;
      glint *= glint;
      glint = glint * glint * glint * 2.6;
    }
    float side = mix(0.45, 1.0, 1.0 - vFacing);
    float b = (ribbons * rise + rim + glint * rise) * side * uIntensity;
    vec3 col = mix(vCol, vHot, clamp(ribbons * 0.35 + glint, 0.0, 1.0));
    gl_FragColor = vec4(col * b, 1.0);
  }
`;

// Embers: soft motes climbing round the curtain (a third inside the beam), twinkling
const EMBER_VERT = `
  attribute vec4 aSeed; // x: radius, y: angle, z: speed, w: random
  attribute vec3 aCol;
  attribute float aHeight;
  uniform float uTime;
  varying float vAlpha;
  varying vec3 vCol;
  varying float vHot;
  void main() {
    float life = fract(uTime * aSeed.z + aSeed.w * 7.31);
    float ang = aSeed.y + life * (1.4 / max(0.6, aSeed.x)) + sin(uTime * 0.7 + aSeed.w * 20.0) * 0.12;
    float r = aSeed.x * (1.0 - life * 0.18);
    vec3 pos = position + vec3(cos(ang) * r, life * aHeight, sin(ang) * r);
    vAlpha = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.55, 1.0, life)) * (0.65 + 0.35 * sin(uTime * 9.0 + aSeed.w * 60.0));
    vCol = aCol;
    vHot = step(0.85, fract(aSeed.w * 13.7));
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((mix(0.09, 0.14, vHot) * 260.0) / max(1.0, -mv.z), 1.5, 16.0);
  }
`;
const EMBER_FRAG = `
  uniform float uIntensity;
  varying float vAlpha;
  varying vec3 vCol;
  varying float vHot;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float core = exp(-r * r * 18.0);
    float halo = exp(-r * 4.0) * 0.5;
    vec3 col = mix(vCol, vec3(1.0, 0.97, 0.9), core * (0.5 + vHot * 0.4));
    gl_FragColor = vec4(col * (core * 1.5 + halo) * vAlpha * uIntensity * 1.5, 1.0);
  }
`;

export interface HeroAuraSite {
  x: number;
  y: number;
  z: number;
  /** The beam: from this height, how tall, how wide; none over a world boss */
  beam?: { y: number; height: number; radius: number };
  /** The curtain round the model (from `y` up, the ground by default); none round a creature (it gets sparkles) */
  curtain?: { radius: number; height: number; y?: number };
  /** Embers drift up between these radii (plus a third in the beam) to this height */
  embers: { inner: number; outer: number; height: number; count: number };
  /** The light's colour, and its bright heart */
  color: string;
  hot: string;
}

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A geometry with `aCol` / `aHot` set to one colour pair all over, moved to (x, y, z) */
function tinted(g: THREE.BufferGeometry, x: number, y: number, z: number, col: THREE.Color, hot: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  const b = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a.set([col.r, col.g, col.b], i * 3);
    b.set([hot.r, hot.g, hot.b], i * 3);
  }
  g.setAttribute("aCol", new THREE.BufferAttribute(a, 3));
  g.setAttribute("aHot", new THREE.BufferAttribute(b, 3));
  g.translate(x, y, z);
  return g;
}

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } as const;

/** The legendary aura round every site given: 4 draw calls in all (fewer when no site has a curtain or a beam) */
export function HeroAura({ sites, gain = 1 }: { sites: HeroAuraSite[]; gain?: number }) {
  const built = useMemo(() => {
    const time = { value: 0 };
    const outer: THREE.BufferGeometry[] = [];
    const core: THREE.BufferGeometry[] = [];
    const curtain: THREE.BufferGeometry[] = [];
    const pos: number[] = [];
    const seed: number[] = [];
    const col: number[] = [];
    const height: number[] = [];
    sites.forEach((s, si) => {
      const c = new THREE.Color(s.color);
      const h = new THREE.Color(s.hot);
      const b = s.beam;
      if (b) {
        outer.push(tinted(new THREE.CylinderGeometry(b.radius, b.radius * 0.82, b.height, 40, 1, true), s.x, s.y + b.y + b.height / 2, s.z, c, h));
        core.push(tinted(new THREE.CylinderGeometry(b.radius * 0.3, b.radius * 0.24, b.height, 24, 1, true), s.x, s.y + b.y + b.height / 2, s.z, c, h));
      }
      if (s.curtain) curtain.push(tinted(new THREE.CylinderGeometry(s.curtain.radius, s.curtain.radius * 1.05, s.curtain.height, 80, 1, true), s.x, s.y + (s.curtain.y ?? 0) + s.curtain.height / 2, s.z, c, h));
      const e = s.embers;
      for (let i = 0; i < e.count; i++) {
        const k = si * 1000 + i;
        const inBeam = b && i % 3 === 0;
        pos.push(s.x, s.y + (inBeam ? b.y : s.curtain?.y ?? 0), s.z);
        seed.push(
          inBeam ? 0.1 + hash01(k * 4.1 + 0.3) * b.radius * 0.6 : e.inner + Math.pow(hash01(k * 1.7 + 0.9), 0.7) * (e.outer - e.inner),
          hash01(k * 2.9 + 1.3) * Math.PI * 2,
          inBeam ? 0.14 + hash01(k * 3.3 + 2.1) * 0.12 : 0.05 + hash01(k * 5.9 + 0.7) * 0.07,
          hash01(k * 7.7 + 3.1)
        );
        const mixHot = hash01(k * 9.1) * 0.6;
        const ec = c.clone().lerp(h, mixHot);
        col.push(ec.r, ec.g, ec.b);
        height.push(inBeam ? Math.min(b.height * 0.6, e.height * 1.6) : e.height);
      }
    });
    const embers = new THREE.BufferGeometry();
    embers.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    embers.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
    embers.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 3));
    embers.setAttribute("aHeight", new THREE.Float32BufferAttribute(height, 1));
    return {
      time,
      outer: outer.length ? mergeGeometries(outer, false)! : null,
      core: core.length ? mergeGeometries(core, false)! : null,
      curtain: curtain.length ? mergeGeometries(curtain, false)! : null,
      embers,
      outerMat: new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BEAM_FRAG, uniforms: { uTime: time, uIntensity: { value: 0.5 }, uCore: { value: 0 } }, ...additive }),
      coreMat: new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BEAM_FRAG, uniforms: { uTime: time, uIntensity: { value: 0.8 }, uCore: { value: 1 } }, ...additive }),
      curtainMat: new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: CURTAIN_FRAG, uniforms: { uTime: time, uIntensity: { value: 0.38 } }, ...additive }),
      emberMat: new THREE.ShaderMaterial({ vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, uniforms: { uTime: time, uIntensity: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    };
  }, [sites]);

  useEffect(
    () => () => {
      [built.outer, built.core, built.curtain, built.embers].forEach((g) => g?.dispose());
      [built.outerMat, built.coreMat, built.curtainMat, built.emberMat].forEach((m) => m.dispose());
    },
    [built]
  );

  useFrame(({ clock }) => {
    built.time.value = clock.elapsedTime;
    built.outerMat.uniforms.uIntensity.value = 0.5 * gain;
    built.coreMat.uniforms.uIntensity.value = 0.8 * gain;
    built.curtainMat.uniforms.uIntensity.value = 0.38 * gain;
    built.emberMat.uniforms.uIntensity.value = gain;
  });

  if (sites.length === 0) return null;
  return (
    <group>
      {built.outer && <mesh geometry={built.outer} material={built.outerMat} renderOrder={2} />}
      {built.core && <mesh geometry={built.core} material={built.coreMat} renderOrder={2} />}
      {built.curtain && <mesh geometry={built.curtain} material={built.curtainMat} renderOrder={2} />}
      {/* The embers move on the GPU from their sites: never culled */}
      <points geometry={built.embers} material={built.emberMat} renderOrder={3} frustumCulled={false} />
    </group>
  );
}
