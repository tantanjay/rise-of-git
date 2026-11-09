import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rngFor } from "@/utils/random";
import { skyWeather } from "./skyState";

/*
 * Royal Decree effects (GAME_GUIDE §15), shared by the world map and the city:
 * 🛡️ shield domes (world map), the shield aura round a city's walls (city) and ⛈️ storm clouds with rain,
 * lightning and circling crows.
 * Everything is instanced (one draw call per kind, however many kingdoms are shielded or punished),
 * animated in shaders from one clock (crows: instance matrices in useFrame), and nothing casts shadows.
 */

export interface DomeSpec {
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface CloudSpec {
  x: number;
  y: number;
  z: number;
  /** Cloud radius; rain falls within it */
  r: number;
  /** Ground height under the cloud (where the rain ends) */
  groundY: number;
  /** High death rate: crows circle the cloud */
  crows?: boolean;
  /** Overcast above the camera: only its rain and lightning show, not the cloud itself */
  hidden?: boolean;
  /** Raindrops under this cloud (default: the `dropsPerCloud` of StormClouds) */
  drops?: number;
  /** How long the cloud is along `axis` (×r, default 1.4): storm banks are long, not round */
  stretch?: number;
  /** Direction of its long side (radians, default seeded) */
  axis?: number;
}

const capacityFor = (n: number) => Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, n))));
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** Small deterministic hash → 0…1 (per crow, so every viewer sees the same flight) */
const rand = (i: number, k: number) => {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/* ------------------------------------------------------------------------- */
/* 🛡️ Shield domes                                                            */
/* ------------------------------------------------------------------------- */

/** Unit hemisphere; its hex pattern is drawn by the shader below */
const DOME = new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2);

/**
 * Translucent hex-grid dome: glowing hex edges on a faint tint, brighter towards the rim (fresnel), breathing over
 * time. One material per ShieldDomes, so the hex size can be set per view (the world map's castles; a city shows
 * `ShieldAura` instead).
 */
function hexDomeMaterial(hexScale: number) {
  const mat = new THREE.MeshBasicMaterial({ color: "#7dd3fc", transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const uniforms = { uTime: { value: 0 }, uHexScale: { value: hexScale } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vDomeObj;
        varying vec3 vDomeN;
        varying vec3 vDomeView;`
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vDomeObj = position;
        mat3 dm = mat3(modelViewMatrix);
        #ifdef USE_INSTANCING
          dm = dm * mat3(instanceMatrix);
        #endif
        vDomeN = normalize(dm * position);
        vDomeView = -mvPosition.xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uHexScale;
        varying vec3 vDomeObj;
        varying vec3 vDomeN;
        varying vec3 vDomeView;
        const vec2 HS = vec2(1.0, 1.7320508);
        // Distance from the centre of the nearest hexagon (0.5 on its edge)
        float hexEdge(vec2 uv) {
          vec4 hc = floor(vec4(uv, uv - vec2(0.5, 1.0)) / HS.xyxy) + 0.5;
          vec4 h = vec4(uv - hc.xy * HS, uv - (hc.zw + 0.5) * HS);
          vec2 p = abs(dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw);
          return max(dot(p, HS * 0.5), p.x);
        }`
      )
      .replace(
        "#include <opaque_fragment>",
        `vec3 o = normalize(vDomeObj);
        vec2 huv = vec2(atan(o.z, o.x) * 0.95, asin(clamp(o.y, 0.0, 1.0)) * 1.1) * uHexScale;
        float edge = smoothstep(0.43, 0.5, hexEdge(huv));
        float rim = pow(max(1.0 - abs(dot(normalize(vDomeN), normalize(vDomeView))), 0.0), 2.5);
        float breathe = 0.85 + 0.15 * sin(uTime * 1.6);
        diffuseColor.a = (0.035 + edge * 0.28 + rim * 0.3) * breathe;
        #include <opaque_fragment>`
      );
  };
  return { mat, uniforms };
}

export function ShieldDomes({ domes, hexScale = 5 }: { domes: DomeSpec[]; /** Hexagons around the dome (more = smaller hexes) */ hexScale?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { mat, uniforms } = useMemo(() => hexDomeMaterial(hexScale), [hexScale]);
  const capacity = capacityFor(domes.length);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    domes.forEach((d, i) => {
      _m.compose(_p.set(d.x, d.y, d.z), _q.identity(), _s.set(d.r, d.r * 0.85, d.r));
      m.setMatrixAt(i, _m);
    });
    m.count = domes.length;
    m.instanceMatrix.needsUpdate = true;
  }, [domes, capacity]);

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
  });

  if (domes.length === 0) return null;
  return <instancedMesh key={capacity} ref={mesh} args={[DOME, mat, capacity]} frustumCulled={false} renderOrder={2} />;
}

/* ------------------------------------------------------------------------- */
/* 🛡️ Shield aura (the city)                                                  */
/* ------------------------------------------------------------------------- */

/*
 * A curtain of energy rising round a city's outer walls, tracing their outline (`cityWallFootprint`): one flat facet
 * per side of the outline, a glowing seam where it meets the ground, faint hexagons that ripple upwards and flicker
 * cell by cell, brighter where the facets meet and at grazing angles, fading out towards the top (no roof: it is a
 * curtain, not a dome). One draw call; in HD the shader adds rising scan lines, cells that flare, a pulse running
 * along the seam and a violet cast up high, and a second draw lifts motes of light up the curtain.
 */

const SHIELD_HEX = `
  const vec2 HS = vec2(1.0, 1.7320508);
  // Nearest hexagon: xy the offset from its centre, zw its id
  vec4 hexCell(vec2 uv) {
    vec4 hc = floor(vec4(uv, uv - vec2(0.5, 1.0)) / HS.xyxy) + 0.5;
    vec4 h = vec4(uv - hc.xy * HS, uv - (hc.zw + 0.5) * HS);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + 0.5);
  }
  float hexDist(vec2 p) {
    vec2 a = abs(p);
    return max(dot(a, HS * 0.5), a.x);
  }
  float cellHash(vec2 c) {
    return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
  }`;

function shieldAuraMaterial(hd: boolean, height: number) {
  return new THREE.ShaderMaterial({
    defines: hd ? { HD: "" } : {},
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: height },
      uColor: { value: new THREE.Color("#38bdf8") },
      uEdge: { value: new THREE.Color("#bae6fd") },
      uTop: { value: new THREE.Color("#a78bfa") }
    },
    vertexShader: `
      attribute vec3 aSeg; // distance round the outline, along this side, length of this side
      uniform float uHeight;
      varying vec3 vSeg;
      varying float vY;
      varying vec3 vWorld;
      varying vec3 vN;
      void main() {
        vSeg = aSeg;
        vY = position.y / uHeight;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uHeight;
      uniform vec3 uColor;
      uniform vec3 uEdge;
      uniform vec3 uTop;
      varying vec3 vSeg;
      varying float vY;
      varying vec3 vWorld;
      varying vec3 vN;
      ${SHIELD_HEX}
      void main() {
        // MSAA shades a hair past the mesh: keep the height in range before it feeds pow / exp
        float y = clamp(vY, 0.0, 1.0);
        float h = y * uHeight;
        float s = vSeg.x;
        vec4 hc = hexCell(vec2(s, h) / 1.4);
        float edge = smoothstep(0.41, 0.5, hexDist(hc.xy));
        float r = cellHash(hc.zw);
        // Ripples rising from the ground, a little out of step round the outline
        float ripple = smoothstep(0.55, 1.0, sin(h * 0.85 - uTime * 1.7 + s * 0.11));
        float flick = 0.6 + 0.4 * sin(uTime * (0.7 + r * 1.5) + r * 6.2832);
        vec3 toCam = cameraPosition - vWorld;
        vec3 v = toCam / max(length(toCam), 1e-4);
        float rim = max(1.0 - abs(dot(vN, v)), 0.0);
        rim *= rim;
        // Where two facets meet: a bright crease running up the corner
        float corner = exp(-max(min(vSeg.y, vSeg.z - vSeg.y), 0.0) * 1.6);
        float fade = pow(max(1.0 - y, 0.0), 1.5);
        float seam = exp(-h * 2.4);
        // Soft streaks of light standing up the curtain, drifting sideways like an aurora
        float streak = 0.5 + 0.5 * sin(s * 0.45 + sin(s * 0.13 + uTime * 0.35) * 2.2 + uTime * 0.25);
        float glowA = edge * (0.1 + 0.3 * ripple) * flick + ripple * 0.035 + rim * 0.2 + corner * 0.22 * fade + streak * 0.05;
        vec3 col = mix(uColor, uEdge, clamp(edge * 0.5 + corner * 0.5, 0.0, 1.0));
        #ifdef HD
          // Fine scan lines climbing the curtain
          float scan = smoothstep(0.9, 1.0, sin(h * 5.0 - uTime * 2.6));
          // Now and then a cell flares: its face lit, its rim brighter
          float flare = step(0.965, cellHash(hc.zw + floor(uTime * 0.6 + r * 3.0)));
          float face = flare * max(1.0 - hexDist(hc.xy) * 1.6, 0.0);
          // (bloom brightens every line, so the grid itself is a little quieter than in Normal)
          glowA = glowA * 0.8 + scan * 0.05 + face * 0.3 + flare * edge * 0.3;
          col = mix(col, uTop, smoothstep(0.25, 0.9, y) * 0.55);
          // A pulse running round the seam
          seam *= 0.75 + 0.35 * sin(s * 0.7 - uTime * 2.8);
        #endif
        float a = (0.02 + glowA) * fade + seam * 0.85;
        col = mix(col, uEdge, clamp(seam, 0.0, 1.0));
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
}

/** One flat facet per side of the outline, standing from the ground to `height` */
function shieldAuraGeometry(outline: Array<[number, number]>, height: number) {
  const pos: number[] = [];
  const nor: number[] = [];
  const seg: number[] = [];
  const idx: number[] = [];
  let s = 0;
  outline.forEach(([x1, z1], i) => {
    const [x2, z2] = outline[(i + 1) % outline.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 1e-3) return;
    // Across the side (the shader takes |n·v|, so whichever way the outline goes round)
    const nx = (z2 - z1) / len;
    const nz = -(x2 - x1) / len;
    const base = pos.length / 3;
    for (const [x, z, along] of [
      [x1, z1, 0],
      [x2, z2, len]
    ]) {
      for (const y of [0, height]) {
        pos.push(x, y, z);
        nor.push(nx, 0, nz);
        seg.push(s + along, along, len);
      }
    }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    s += len;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("aSeg", new THREE.Float32BufferAttribute(seg, 3));
  g.setIndex(idx);
  return g;
}

/** HD: motes of light drifting up the curtain, seeded round the outline */
function shieldMotesGeometry(outline: Array<[number, number]>, seed: string) {
  const sides = outline.map(([x1, z1], i) => {
    const [x2, z2] = outline[(i + 1) % outline.length];
    return { x1, z1, x2, z2, len: Math.max(Math.hypot(x2 - x1, z2 - z1), 1e-3) };
  });
  const total = sides.reduce((t, sd) => t + sd.len, 0);
  const count = Math.min(480, Math.max(24, Math.round(total * 0.9)));
  const r = rngFor(`shield-motes:${seed}`);
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    let at = r() * total;
    const sd = sides.find((x) => (at -= x.len) < 0) ?? sides[sides.length - 1];
    const t = Math.min(1, Math.max(0, (at + sd.len) / sd.len));
    const off = (r() - 0.5) * 0.7;
    const x = sd.x1 + (sd.x2 - sd.x1) * t + ((sd.z2 - sd.z1) / sd.len) * off;
    const z = sd.z1 + (sd.z2 - sd.z1) * t - ((sd.x2 - sd.x1) / sd.len) * off;
    data.set([x, z, r(), 0.05 + r() * 0.07], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("aMote", new THREE.Float32BufferAttribute(data, 4));
  return g;
}

function shieldMoteMaterial(height: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeight: { value: height }, uPx: { value: 800 }, uColor: { value: new THREE.Color("#a5f3fc") } },
    vertexShader: `
      attribute vec4 aMote; // x, z, phase, rise speed
      uniform float uTime;
      uniform float uHeight;
      uniform float uPx;
      varying float vLife;
      void main() {
        float life = fract(aMote.z + uTime * aMote.w);
        vLife = life;
        float sway = sin(uTime * 1.3 + aMote.z * 40.0) * 0.18;
        vec4 mv = modelViewMatrix * vec4(aMote.x + sway, life * uHeight * 0.75 + 0.1, aMote.y + sway * 0.6, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(0.09 * projectionMatrix[1][1] * uPx / max(-mv.z, 0.1), 1.0, 14.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * sin(clamp(vLife, 0.0, 1.0) * 3.14159) * 0.75;
        gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

/** 🛡️ The Royal Shield over a city: an energy curtain rising along its outer walls' `outline` (1 draw; HD 2) */
export function ShieldAura({ outline, height, hd, seed }: { outline: Array<[number, number]>; height: number; hd: boolean; seed: string }) {
  const geo = useMemo(() => shieldAuraGeometry(outline, height), [outline, height]);
  const mat = useMemo(() => shieldAuraMaterial(hd, height), [hd, height]);
  const moteGeo = useMemo(() => (hd ? shieldMotesGeometry(outline, seed) : null), [hd, outline, seed]);
  const moteMat = useMemo(() => (hd ? shieldMoteMaterial(height) : null), [hd, height]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => moteGeo?.dispose(), [moteGeo]);
  useEffect(() => () => moteMat?.dispose(), [moteMat]);

  useFrame((state) => {
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    if (moteMat) {
      moteMat.uniforms.uTime.value = state.clock.elapsedTime;
      moteMat.uniforms.uPx.value = state.size.height * state.viewport.dpr;
    }
  });

  return (
    <>
      <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={2} raycast={() => null} />
      {moteGeo && moteMat && <points geometry={moteGeo} material={moteMat} frustumCulled={false} renderOrder={3} raycast={() => null} />}
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* ⛈️ Storm clouds                                                            */
/* ------------------------------------------------------------------------- */

/*
 * Epic on the rarity ladder, like burning walls: one list of storms in, at most five draw calls out however many
 * kingdoms are punished:
 *   clouds  — churning thunderheads of soft puffs (camera-facing, dark belly, bruised violet rim) slowly wheeling
 *             round their eye, lit from inside when lightning strikes and by flickers of sheet lightning
 *   bolts   — jagged forked lightning with a violet glow, re-striking down the same channel, and a flare where it lands
 *   rain    — wind-slanted streaks that brighten under their own cloud's strikes
 *   splash  — a small crown where each drop lands
 *   crows   — (high death) crows circling the cloud
 * Each storm keeps its own seeded churn and strike schedule (from where it stands), so no two storms move in step.
 * All motion except the crows runs in shaders from one clock; nothing casts shadows or takes the pointer.
 * World-map callers add the violet curtain of storm light round the castle through TierFx (STORM_GLOW).
 */

/** A crow seen from below: body and two swept wings */
const CROW = mergeGeometries([
  new THREE.BoxGeometry(0.14, 0.1, 0.42),
  new THREE.BoxGeometry(0.62, 0.03, 0.18).rotateY(0.25).translate(0.3, 0.02, -0.03),
  new THREE.BoxGeometry(0.62, 0.03, 0.18).rotateY(-0.25).translate(-0.3, 0.02, -0.03)
])!;
const CROWS_PER_CLOUD = 4;
/** How long one strike lights up (s); a second strike follows at STRIKE2 on some storms */
const STRIKE_S = 0.22;
const STRIKE2: [number, number] = [0.34, 0.46];
/** Segments of a lightning bolt (and of its fork) */
const BOLT_SEG = 12;
const FORK_SEG = 6;

/** Violet curtain of storm light for TierFx round a punished castle (epic class) */
export const STORM_GLOW = { tier: "epic" as const, color: "#6366f1", accent: "#c4b5fd" };

/** A storm's lightning schedule: a strike every `period` s, shifted by `offset`; `double` storms strike twice */
interface Strikes {
  period: number;
  offset: number;
  double: number;
  seed: number;
}

const strikesOf = (c: CloudSpec): Strikes => {
  const r = rngFor(`storm:${c.x.toFixed(1)}:${c.z.toFixed(1)}:${c.y.toFixed(1)}`);
  const period = 3 + r() * 6;
  return { period, offset: r() * period, double: r() < 0.5 ? 1 : 0, seed: r() };
};

/** How brightly a storm's lightning shines at time t (0…1); mirrors strikeAt() in the shaders */
function strikeAt(s: Strikes, t: number): number {
  const u = (((t + s.offset) % s.period) + s.period) % s.period;
  if (u < STRIKE_S) return 1 - u / STRIKE_S * 0.5;
  if (s.double && u > STRIKE2[0] && u < STRIKE2[1]) return 0.8;
  return 0;
}

const GLSL_COMMON = `
  uniform float uTime;
  float hash1(float n) { return fract(sin(n * 127.1 + 0.37) * 43758.5453); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // aStrike = (period, offset, double, seed)
  float strikeAt(vec4 s, float t) {
    float u = mod(t + s.y, s.x);
    if (u < ${STRIKE_S.toFixed(2)}) return 1.0 - u / ${STRIKE_S.toFixed(2)} * 0.5;
    if (s.z > 0.5 && u > ${STRIKE2[0].toFixed(2)} && u < ${STRIKE2[1].toFixed(2)}) return 0.8;
    return 0.0;
  }
  float strikeNo(vec4 s, float t) { return floor((t + s.y) / s.x) + s.w * 97.0; }`;

const CLOUD_VERTEX = `
  ${GLSL_COMMON}
  attribute vec4 aStrike;
  attribute vec4 aPuff; // offset from the cloud's centre (x, y, z), churn speed
  varying vec2 vUv; varying float vFlash; varying float vSeed;
  void main() {
    vUv = uv;
    float s = length(instanceMatrix[0].xyz);
    vec3 eye = instanceMatrix[3].xyz;
    float seed = fract(aPuff.x * 3.17 + aPuff.z * 7.31 + aStrike.w);
    vSeed = seed;
    // Each billow churns in a small loop round its own place, at its own pace, bobbing and swelling (the cloud
    // keeps its shape: nothing drifts away round the centre)
    float a = uTime * aPuff.w + seed * 6.2832;
    vec3 off = aPuff.xyz + vec3(cos(a), 0.0, sin(a)) * s * 0.1;
    off.y += sin(uTime * 0.7 + seed * 40.0) * s * 0.06;
    vec4 mv = modelViewMatrix * vec4(eye + off, 1.0);
    float swell = 1.0 + 0.07 * sin(uTime * 0.45 + seed * 23.0);
    float rot = seed * 6.2832 + uTime * 0.03 * (seed - 0.5);
    vec2 q = position.xy * s * swell;
    mv.xy += vec2(q.x * cos(rot) - q.y * sin(rot), q.x * sin(rot) + q.y * cos(rot));
    gl_Position = projectionMatrix * mv;
    vFlash = strikeAt(aStrike, uTime);
  }`;

const CLOUD_FRAGMENT = `
  ${GLSL_COMMON}
  varying vec2 vUv; varying float vFlash; varying float vSeed;
  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p) * 2.0;
    float n = noise(p * 3.2 + vSeed * 17.0 + uTime * 0.06) * 0.62 + noise(p * 7.5 - vSeed * 9.0 - uTime * 0.09) * 0.38;
    float a = smoothstep(1.0, 0.6, d + (n - 0.5) * 0.75);
    if (a < 0.02) discard;
    // Billowing: a lit crown over a dark, heavy belly, a bruised violet fringe
    float shade = clamp(0.5 + p.y * 1.3 + (n - 0.5) * 0.8, 0.0, 1.0);
    vec3 col = mix(vec3(0.05, 0.05, 0.085), vec3(0.3, 0.31, 0.41), shade);
    // A silver-violet rim on the upper edge of each billow, a bruised fringe on its belly
    col += vec3(0.13, 0.11, 0.2) * smoothstep(0.5, 0.85, d) * smoothstep(-0.1, 0.3, p.y);
    col += vec3(0.08, 0.02, 0.14) * smoothstep(0.5, 0.95, d) * (1.0 - shade);
    // Lightning inside the cloud, and stray flickers of sheet lightning between strikes
    float sheet = step(0.975, hash(vec2(floor(uTime * 9.0), vSeed * 91.0))) * 0.45;
    float glow = max(vFlash, sheet) * (1.0 - d * 0.55) * (0.55 + n * 0.9);
    col += vec3(0.62, 0.62, 1.0) * glow;
    gl_FragColor = vec4(col, a * 0.97);
  }`;

const BOLT_VERTEX = `
  ${GLSL_COMMON}
  attribute vec3 aB;      // main/fork: (t along it, side -1…1, kind 0/1); flare: (corner x, corner y, 2)
  attribute vec4 aStrike;
  attribute vec4 aSize;   // height, spread where it lands, core width, -
  varying vec2 vQ; varying float vKind; varying float vI;
  vec3 boltAt(float t, float n, vec3 o) {
    vec2 land = (vec2(hash1(n + 1.3), hash1(n + 7.1)) - 0.5) * aSize.y;
    float k = floor(t * ${BOLT_SEG.toFixed(1)}); float f = fract(t * ${BOLT_SEG.toFixed(1)});
    vec2 j0 = vec2(hash1(n * 3.1 + k), hash1(n * 5.7 + k)) - 0.5;
    vec2 j1 = vec2(hash1(n * 3.1 + k + 1.0), hash1(n * 5.7 + k + 1.0)) - 0.5;
    vec2 jit = mix(j0, j1, f) * aSize.x * 0.17 * sin(t * 3.14159);
    return o + vec3(land.x * t + jit.x, -aSize.x * t, land.y * t + jit.y);
  }
  vec3 forkAt(float s, float n, vec3 o) {
    float tb = 0.28 + hash1(n + 2.2) * 0.3;
    vec3 b = boltAt(tb, n, o);
    float ang = hash1(n + 4.4) * 6.2832;
    float k = floor(s * ${FORK_SEG.toFixed(1)}); float f = fract(s * ${FORK_SEG.toFixed(1)});
    float j = mix(hash1(n * 9.3 + k), hash1(n * 9.3 + k + 1.0), f) - 0.5;
    vec3 side = vec3(cos(ang), 0.0, sin(ang));
    vec3 across = vec3(-side.z, 0.0, side.x);
    return b + side * aSize.x * 0.32 * s + vec3(0.0, -aSize.x * 0.3 * s, 0.0) + across * j * aSize.x * 0.1 * s;
  }
  void main() {
    vec3 o = instanceMatrix[3].xyz;
    float I = strikeAt(aStrike, uTime);
    vI = I * (0.75 + 0.25 * step(0.5, fract(uTime * 23.0 + aStrike.w)));
    vKind = aB.z;
    if (I <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    // A double strike comes down the same channel
    float n = strikeNo(aStrike, uTime);
    vec4 mv;
    if (aB.z > 1.5) {
      // Flare where the bolt lands
      mv = modelViewMatrix * vec4(boltAt(1.0, n, o), 1.0);
      mv.xy += aB.xy * aSize.z * 14.0;
      vQ = aB.xy;
    } else {
      float t = aB.x;
      vec3 p0 = aB.z > 0.5 ? forkAt(t, n, o) : boltAt(t, n, o);
      vec3 p1 = aB.z > 0.5 ? forkAt(t + 0.01, n, o) : boltAt(t + 0.01, n, o);
      mv = modelViewMatrix * vec4(p0, 1.0);
      vec4 m1 = modelViewMatrix * vec4(p1, 1.0);
      vec2 d = normalize(m1.xy - mv.xy + vec2(0.0, -1e-5));
      // Core plus a wide halo in one ribbon; the fork is thinner and tapers out
      float w = aSize.z * 7.0 * (aB.z > 0.5 ? 0.6 * (1.0 - t * 0.8) : 1.0 - t * 0.35);
      mv.xy += vec2(-d.y, d.x) * aB.y * w;
      vQ = vec2(aB.y, t);
    }
    gl_Position = projectionMatrix * mv;
  }`;

const BOLT_FRAGMENT = `
  varying vec2 vQ; varying float vKind; varying float vI;
  void main() {
    if (vKind > 1.5) {
      float d = length(vQ);
      float core = smoothstep(0.3, 0.0, d);
      float halo = exp(-d * 3.2) * smoothstep(1.0, 0.6, d);
      gl_FragColor = vec4(mix(vec3(0.55, 0.45, 1.0), vec3(1.0), core), max(core, halo * 0.85) * vI);
      return;
    }
    float x = abs(vQ.x);
    float core = smoothstep(0.16, 0.04, x);
    float halo = exp(-x * 3.5) * smoothstep(1.0, 0.7, x);
    // Normal blending, so a white core with a violet glow still reads over snow and sand by day
    vec3 col = mix(vec3(0.5, 0.38, 1.0), vec3(1.0), core);
    float fade = vKind > 0.5 ? 1.0 - vQ.y * 0.7 : 1.0;
    gl_FragColor = vec4(col, max(core, halo * 0.8) * vI * fade);
  }`;

const RAIN_VERTEX = `
  ${GLSL_COMMON}
  attribute vec4 aRain;   // fall height, phase, speed, streak length
  attribute vec4 aStrike;
  varying vec2 vUv; varying float vA; varying float vLit;
  const vec3 WIND = vec3(0.2, -1.0, 0.07);
  void main() {
    vUv = uv;
    float w = length(instanceMatrix[0].xyz);
    float life = fract(uTime * aRain.z + aRain.y);
    vec3 p = instanceMatrix[3].xyz + WIND * life * aRain.x;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec2 dir = normalize((viewMatrix * vec4(WIND, 0.0)).xy + vec2(0.0, -1e-5));
    // A streak trailing up behind the falling drop
    mv.xy += vec2(-dir.y, dir.x) * position.x * w - dir * position.y * aRain.w;
    gl_Position = projectionMatrix * mv;
    vA = smoothstep(0.0, 0.08, life);
    vLit = strikeAt(aStrike, uTime);
  }`;

const RAIN_FRAGMENT = `
  varying vec2 vUv; varying float vA; varying float vLit;
  void main() {
    float x = abs(vUv.x - 0.5) * 2.0;
    float a = vA * (1.0 - vUv.y) * (1.0 - x * 0.6) * (0.7 + vLit * 0.3);
    // Pale core, slate edge: reads over dark grass and bright snow alike
    vec3 col = mix(vec3(0.3, 0.36, 0.5), vec3(0.82, 0.88, 1.0), smoothstep(0.9, 0.2, x));
    gl_FragColor = vec4(mix(col, vec3(0.95, 0.95, 1.0), vLit), a);
  }`;

const SPLASH_VERTEX = `
  ${GLSL_COMMON}
  attribute vec4 aRain;
  varying float vA;
  void main() {
    // The crown shows just after the drop lands (its life wraps to the top of the next fall)
    float life = fract(uTime * aRain.z + aRain.y);
    float s = life / 0.14;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = s < 1.0 ? aRain.w * (0.35 + s * 0.9) * (300.0 / -mv.z) : 0.0;
    vA = s < 1.0 ? (1.0 - s) * 0.55 : 0.0;
  }`;

const SPLASH_FRAGMENT = `
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(vec2(c.x, c.y * 2.2)) * 2.0;
    float ring = smoothstep(0.6, 0.85, d) * smoothstep(1.0, 0.86, d);
    if (ring < 0.02 || c.y < -0.05) discard;
    gl_FragColor = vec4(0.8, 0.86, 1.0, ring * vA);
  }`;

/** Puff quad, rain streak (foot at the drop) and the lightning ribbons + flare */
const PUFF_QUAD = new THREE.PlaneGeometry(1, 1);
const STREAK = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const BOLT = (() => {
  const b: number[] = [];
  const idx: number[] = [];
  const strip = (seg: number, kind: number) => {
    const base = b.length / 3;
    for (let k = 0; k <= seg; k++) b.push(k / seg, -1, kind, k / seg, 1, kind);
    for (let k = 0; k < seg; k++) {
      const v = base + k * 2;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  };
  strip(BOLT_SEG * 2, 0);
  strip(FORK_SEG * 2, 1);
  const f = b.length / 3;
  b.push(-1, -1, 2, 1, -1, 2, -1, 1, 2, 1, 1, 2);
  idx.push(f, f + 1, f + 2, f + 1, f + 3, f + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("aB", new THREE.Float32BufferAttribute(b, 3));
  // three.js needs a position attribute to count vertices; the shader places everything from aB
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(b.length), 3));
  g.setIndex(idx);
  return g;
})();

const sharedTime = { value: 0 };
const noRaycast = () => null;

interface BuiltStorm {
  clouds: THREE.InstancedMesh | null;
  bolts: THREE.InstancedMesh | null;
  rain: THREE.InstancedMesh | null;
  splash: THREE.BufferGeometry | null;
  strikes: Strikes[];
}

function buildStorm(clouds: CloudSpec[], dropsPerCloud: number, mats: Record<"cloud" | "bolt" | "rain", THREE.Material>): BuiltStorm {
  const strikes = clouds.map(strikesOf);
  const m = new THREE.Matrix4();
  const puffs: Array<{ x: number; y: number; z: number; s: number; off: [number, number, number, number]; k: number }> = [];
  const drops: Array<{ x: number; y: number; z: number; w: number; rain: [number, number, number, number]; k: number }> = [];
  clouds.forEach((c, k) => {
    const r = rngFor(`storm-shape:${c.x.toFixed(1)}:${c.z.toFixed(1)}:${c.y.toFixed(1)}`);
    if (!c.hidden) {
      // A storm bank: a few lumpy towers of billows strung along its long side, one towering over the rest, smaller
      // billows fraying off the edges, so its outline is ragged and never a round ball
      const n = Math.max(10, Math.min(30, Math.round(c.r * 3.4)));
      const axis = c.axis ?? r() * Math.PI * 2;
      const ax = Math.cos(axis);
      const az = Math.sin(axis);
      const half = c.r * (c.stretch ?? 1.4) * 0.75;
      const lobes = 3 + Math.floor(r() * 3);
      const tower = Math.floor(r() * lobes);
      const centres = Array.from({ length: lobes }, (_, l) => {
        const u = lobes === 1 ? 0 : (l / (lobes - 1)) * 2 - 1;
        const along = (u + (r() - 0.5) * 0.35) * half;
        const across = (r() - 0.5) * c.r * 0.7;
        const size = c.r * (l === tower ? 0.6 + r() * 0.2 : 0.35 + r() * 0.3);
        return { x: ax * along - az * across, z: az * along + ax * across, y: (l === tower ? 0.35 : r() * 0.18) * c.r, size };
      });
      for (let i = 0; i < n; i++) {
        const lobe = centres[i % lobes];
        const fray = i >= n - Math.round(n * 0.25);
        const a = r() * Math.PI * 2;
        const rr = Math.sqrt(r()) * lobe.size * (fray ? 1.5 : 0.9);
        const s = lobe.size * (fray ? 0.7 + r() * 0.4 : 1.1 + r() * 0.6) * 2;
        const y = lobe.y + (r() - 0.35) * lobe.size * 0.6 - (fray ? lobe.size * 0.25 : 0);
        puffs.push({ x: c.x, y: c.y, z: c.z, s, off: [lobe.x + Math.cos(a) * rr, y, lobe.z + Math.sin(a) * rr, 0.15 + r() * 0.25], k });
      }
    }
    const top = c.hidden ? c.y : c.y - c.r * 0.2;
    const h = Math.max(0.5, top - c.groundY);
    const len = Math.min(3, Math.max(0.35, h * 0.08));
    const count = c.drops ?? dropsPerCloud;
    for (let d = 0; d < count; d++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * c.r * 0.9;
      // Start upwind, so the slanted rain lands under the cloud
      drops.push({
        x: c.x + Math.cos(a) * rr - h * 0.1,
        y: top,
        z: c.z + Math.sin(a) * rr - h * 0.035,
        w: Math.max(0.06, len * 0.045),
        rain: [h, r(), 1.1 + r() * 0.5, len],
        k
      });
    }
  });

  const strikeAttr = (ks: number[]) => {
    const a = new Float32Array(ks.length * 4);
    ks.forEach((k, i) => a.set([strikes[k].period, strikes[k].offset, strikes[k].double, strikes[k].seed], i * 4));
    return new THREE.InstancedBufferAttribute(a, 4);
  };
  const finish = (mesh: THREE.InstancedMesh, order: number) => {
    mesh.frustumCulled = false; // the shaders move everything off its instance point
    mesh.raycast = noRaycast;
    mesh.renderOrder = order;
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  };

  let cloudMesh: THREE.InstancedMesh | null = null;
  if (puffs.length) {
    const g = PUFF_QUAD.clone();
    const off = new Float32Array(puffs.length * 4);
    puffs.forEach((p, i) => off.set(p.off, i * 4));
    g.setAttribute("aPuff", new THREE.InstancedBufferAttribute(off, 4));
    g.setAttribute("aStrike", strikeAttr(puffs.map((p) => p.k)));
    cloudMesh = finish(new THREE.InstancedMesh(g, mats.cloud, puffs.length), 4);
    puffs.forEach((p, i) => cloudMesh!.setMatrixAt(i, m.makeScale(p.s, p.s, p.s).setPosition(p.x, p.y, p.z)));
  }

  let boltMesh: THREE.InstancedMesh | null = null;
  if (clouds.length) {
    const g = BOLT.clone();
    g.setAttribute("aStrike", strikeAttr(clouds.map((_, k) => k)));
    const size = new Float32Array(clouds.length * 4);
    clouds.forEach((c, k) => {
      const top = c.hidden ? c.y : c.y - c.r * 0.2;
      const h = top - c.groundY;
      size.set([h, c.r * 1.1, Math.max(0.08, Math.min(0.2, h * 0.008)), 0], k * 4);
    });
    g.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 4));
    boltMesh = finish(new THREE.InstancedMesh(g, mats.bolt, clouds.length), 3);
    clouds.forEach((c, k) => boltMesh!.setMatrixAt(k, m.makeTranslation(c.x, c.hidden ? c.y : c.y - c.r * 0.2, c.z)));
  }

  let rainMesh: THREE.InstancedMesh | null = null;
  let splash: THREE.BufferGeometry | null = null;
  if (drops.length) {
    const g = STREAK.clone();
    const rain = new Float32Array(drops.length * 4);
    drops.forEach((d, i) => rain.set(d.rain, i * 4));
    g.setAttribute("aRain", new THREE.InstancedBufferAttribute(rain, 4));
    g.setAttribute("aStrike", strikeAttr(drops.map((d) => d.k)));
    rainMesh = finish(new THREE.InstancedMesh(g, mats.rain, drops.length), 2);
    drops.forEach((d, i) => rainMesh!.setMatrixAt(i, m.makeScale(d.w, d.w, d.w).setPosition(d.x, d.y, d.z)));
    // Where each drop lands (the wind carries it 0.2 × its fall downwind)
    splash = new THREE.BufferGeometry();
    const pos = new Float32Array(drops.length * 3);
    drops.forEach((d, i) => pos.set([d.x + d.rain[0] * 0.2, d.y - d.rain[0] + 0.05, d.z + d.rain[0] * 0.07], i * 3));
    splash.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    splash.setAttribute("aRain", new THREE.BufferAttribute(rain, 4));
  }
  return { clouds: cloudMesh, bolts: boltMesh, rain: rainMesh, splash, strikes };
}

export function StormClouds({
  clouds,
  dropsPerCloud = 110,
  onFlash
}: {
  clouds: CloudSpec[];
  dropsPerCloud?: number;
  /** Called every frame with how much lightning lights the scene (0…1), for views that brighten their lights */
  onFlash?: (amount: number) => void;
}) {
  const crowRef = useRef<THREE.InstancedMesh>(null);
  const mats = useMemo(() => {
    const shader = (vertexShader: string, fragmentShader: string, extra: THREE.ShaderMaterialParameters = {}) =>
      new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: sharedTime }, vertexShader, fragmentShader, ...extra });
    return {
      cloud: shader(CLOUD_VERTEX, CLOUD_FRAGMENT),
      bolt: shader(BOLT_VERTEX, BOLT_FRAGMENT),
      rain: shader(RAIN_VERTEX, RAIN_FRAGMENT),
      splash: shader(SPLASH_VERTEX, SPLASH_FRAGMENT),
      crow: new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.9, flatShading: true })
    };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const built = useMemo(() => buildStorm(clouds, dropsPerCloud, mats), [clouds, dropsPerCloud, mats]);
  useEffect(
    () => () => {
      built.clouds?.geometry.dispose();
      built.bolts?.geometry.dispose();
      built.rain?.geometry.dispose();
      built.splash?.dispose();
    },
    [built]
  );

  const crowClouds = useMemo(() => clouds.filter((c) => c.crows), [clouds]);
  const crowCap = capacityFor(crowClouds.length * CROWS_PER_CLOUD);
  const hasOvercast = useMemo(() => clouds.some((c) => c.hidden), [clouds]);

  useEffect(() => () => onFlash?.(0), [onFlash]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    sharedTime.value = t;
    if (onFlash) {
      // Only the overcast (or, without one, any cloud) lights up the whole scene, so the flashes stay rare
      let light = 0;
      clouds.forEach((c, i) => {
        if (!hasOvercast || c.hidden) light = Math.max(light, strikeAt(built.strikes[i], t));
      });
      onFlash(light);
    }
    const crows = crowRef.current;
    if (crows) {
      crowClouds.forEach((c, i) => {
        for (let j = 0; j < CROWS_PER_CLOUD; j++) {
          const k = i * CROWS_PER_CLOUD + j;
          const ang = t * (0.35 + rand(k, 8) * 0.2) + (j / CROWS_PER_CLOUD) * Math.PI * 2;
          const r = c.r * (1.05 + rand(k, 9) * 0.35);
          const flap = Math.sin(t * 7 + k) * 0.25;
          _m.compose(
            _p.set(c.x + Math.cos(ang) * r, c.y - c.r * 0.1 + Math.sin(t * 0.8 + k) * c.r * 0.08, c.z + Math.sin(ang) * r),
            _q.setFromEuler(_e.set(0, -ang, 0.35 + flap * 0.4, "YXZ")),
            _s.setScalar(Math.max(1, c.r * 0.45))
          );
          crows.setMatrixAt(k, _m);
        }
      });
      crows.count = crowClouds.length * CROWS_PER_CLOUD;
      crows.instanceMatrix.needsUpdate = true;
    }
  });

  if (clouds.length === 0) return null;
  return (
    <group>
      {built.rain && <primitive object={built.rain} />}
      {built.splash && <points geometry={built.splash} material={mats.splash} raycast={noRaycast} frustumCulled={false} renderOrder={2} />}
      {built.bolts && <primitive object={built.bolts} />}
      {built.clouds && <primitive object={built.clouds} />}
      {crowClouds.length > 0 && <instancedMesh key={`w${crowCap}`} ref={crowRef} args={[CROW, mats.crow, crowCap]} frustumCulled={false} raycast={noRaycast} />}
    </group>
  );
}

/**
 * Darkens the realm sky (RealmSky) while a storm hangs over the view and lets lightning brighten the ambient light
 * for a moment. Returns the `onFlash` callback for StormClouds. The sky is restored when the storm goes.
 */
export function useStormLighting(active: boolean, dim = 0.45): ((amount: number) => void) | undefined {
  useEffect(() => {
    if (!active) return;
    skyWeather.stormDim = dim;
    return () => {
      skyWeather.stormDim = 1;
      skyWeather.flash = 0;
    };
  }, [active, dim]);
  const onFlash = useMemo(
    () => (amount: number) => {
      skyWeather.flash = amount;
    },
    []
  );
  return active ? onFlash : undefined;
}
