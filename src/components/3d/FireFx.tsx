import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rngFor } from "@/utils/random";

/*
 * Fire for burning walls (castles, buffer realms, frontier gates, a city's own walls): one list of burning sites in,
 * three draw calls out however many burn:
 *   flames — licking tongues of fire round and on the structure (camera-facing, flicker and sway in the shader)
 *   smoke  — dark columns rising and drifting off with the wind, lit orange at the foot
 *   embers — sparks streaming up out of the flames
 * Epic on the rarity ladder: callers add the orange curtain of light round the site through TierFx.
 * Every site moves on its own seeded phase and tempo (from its id), so no two fires burn in step.
 * All motion runs in shaders from one clock; nothing casts shadows or takes the pointer.
 */

export interface FireSite {
  /** Seeds where the flames stand and how they move */
  id: string;
  /** Ground point */
  x: number;
  y: number;
  z: number;
  /** Radius of what burns: flames stand round and inside it */
  r: number;
  /** Its height: some flames climb its walls and roofs */
  h: number;
  /** Flame tongues (default from r) */
  flames?: number;
  /** Smoke columns rising from it (default 1) */
  plumes?: number;
  /** Size of one tongue (default from r) */
  size?: number;
}

const FLAME_VERTEX = `
  uniform float uTime;
  attribute vec2 aFx;
  varying vec2 vUv; varying float vT;
  void main() {
    vUv = uv;
    float t = uTime * aFx.y + aFx.x;
    vT = t;
    float s = length(instanceMatrix[0].xyz);
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float flick = 1.0 + 0.2 * sin(t * 9.0) + 0.12 * sin(t * 15.3 + 1.7);
    vec2 q = position.xy;
    q.x *= s * (0.75 + 0.08 * sin(t * 7.0));
    q.y *= s * 1.7 * flick;
    q.x += sin(t * 3.1 + position.y * 3.0) * 0.14 * s * position.y;
    mv.xy += q;
    gl_Position = projectionMatrix * mv;
  }`;

const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

const FLAME_FRAGMENT = `
  varying vec2 vUv; varying float vT;
  ${NOISE}
  void main() {
    float x = (vUv.x - 0.5) * 2.0;
    float y = vUv.y;
    float turb = noise(vec2(x * 2.5, y * 4.0 - vT * 3.0)) * 0.6 + noise(vec2(x * 5.0, y * 8.0 - vT * 5.5)) * 0.3;
    // A tongue of fire: round at the foot, licking to a ragged tip
    float width = (1.0 - y) * smoothstep(0.0, 0.22, y + 0.06);
    float shape = width - abs(x) * 0.85 + (turb - 0.45) * 0.6 * y;
    float body = smoothstep(0.0, 0.22, shape);
    float core = smoothstep(0.22, 0.55, shape);
    vec3 col = mix(vec3(0.75, 0.08, 0.01), vec3(1.0, 0.5, 0.06), body);
    col = mix(col, vec3(1.0, 0.9, 0.5), core);
    gl_FragColor = vec4(col * body * smoothstep(1.0, 0.5, y) * 1.5, 1.0);
  }`;

const SMOKE_VERTEX = `
  uniform float uTime;
  attribute vec4 aSmoke;
  varying vec2 vUv; varying float vLife; varying float vSeed;
  void main() {
    vUv = uv;
    float life = fract(uTime * aSmoke.y + aSmoke.x);
    vLife = life; vSeed = aSmoke.x;
    float s = length(instanceMatrix[0].xyz);
    vec4 c = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // Rising, swelling, and leaning off with the wind
    c.y += life * aSmoke.z;
    c.x += sin(life * 3.0 + aSmoke.x * 20.0) * s * 0.3 + life * life * aSmoke.z * 0.35;
    c.z += cos(life * 2.3 + aSmoke.x * 13.0) * s * 0.25;
    vec4 mv = modelViewMatrix * c;
    mv.xy += position.xy * s * (0.6 + life * aSmoke.w);
    gl_Position = projectionMatrix * mv;
  }`;

const SMOKE_FRAGMENT = `
  varying vec2 vUv; varying float vLife; varying float vSeed;
  ${NOISE}
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float nz = noise(vUv * 3.0 + vSeed * 10.0 + vLife * 1.5);
    float a = smoothstep(1.0, 0.25, d + (nz - 0.5) * 0.6);
    a *= smoothstep(0.0, 0.12, vLife) * (1.0 - vLife) * 0.75;
    vec3 col = mix(vec3(0.3, 0.26, 0.23), vec3(0.11, 0.1, 0.1), smoothstep(0.0, 0.6, vLife));
    col += vec3(0.55, 0.2, 0.03) * (1.0 - smoothstep(0.0, 0.28, vLife)); // lit by the fire below
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }`;

const EMBER_VERTEX = `
  uniform float uTime;
  attribute vec4 aSeed; attribute vec2 aShape;
  varying float vAlpha; varying float vHot;
  void main() {
    float life = fract(uTime * aShape.x + aSeed.x);
    float ang = aSeed.y * 6.2832 + life * 4.0;
    float rr = aShape.y * (0.2 + life * 0.6) * aSeed.z;
    vec3 p = position + vec3(cos(ang) * rr + life * life * aSeed.w * 0.3, life * aSeed.w, sin(ang) * rr);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.14 + aShape.y * 0.06) * (1.0 - life * 0.5) * (320.0 / -mv.z);
    vAlpha = smoothstep(0.0, 0.08, life) * (1.0 - life);
    vHot = aSeed.z;
  }`;

const EMBER_FRAGMENT = `
  varying float vAlpha; varying float vHot;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    vec3 col = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.4), vHot);
    gl_FragColor = vec4(col * smoothstep(0.5, 0.0, d) * 1.6, vAlpha);
  }`;

/** Quad standing on its foot (flames) and a centred quad (smoke puffs) */
const FLAME_QUAD = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const SMOKE_QUAD = new THREE.PlaneGeometry(1, 1);
const PUFFS_PER_PLUME = 7;

const shared = { value: 0 };
const noRaycast = () => null;

interface Built {
  flames: THREE.InstancedMesh | null;
  smoke: THREE.InstancedMesh | null;
  embers: THREE.BufferGeometry | null;
}

function buildFire(sites: FireSite[], mats: { flame: THREE.Material; smoke: THREE.Material }): Built {
  const flames: Array<{ x: number; y: number; z: number; s: number; ph: number; tp: number }> = [];
  const puffs: Array<{ x: number; y: number; z: number; s: number; seed: number; tempo: number; rise: number; grow: number }> = [];
  const ember = { pos: [] as number[], seed: [] as number[], shape: [] as number[] };
  for (const site of sites) {
    const r = rngFor(`${site.id}:fire`);
    const n = site.flames ?? Math.max(3, Math.min(14, Math.round(site.r * 3)));
    const size = site.size ?? Math.max(0.55, site.r * 0.42);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.8;
      // A share of the tongues climbs the walls and roofs; the rest burn round its foot
      const high = site.h > 0.5 && r() < 0.4;
      const rr = site.r * (high ? 0.35 + r() * 0.4 : 0.6 + r() * 0.45);
      const fx = site.x + Math.cos(a) * rr;
      const fz = site.z + Math.sin(a) * rr;
      const fy = site.y + (high ? site.h * (0.45 + r() * 0.5) : r() * 0.2);
      const s = size * (0.6 + r() * 0.6) * (high ? 0.8 : 1);
      flames.push({ x: fx, y: fy, z: fz, s, ph: r() * 100, tp: 0.8 + r() * 0.5 });
      for (let k = 0; k < 2; k++) {
        ember.pos.push(fx, fy + s * 0.4, fz);
        ember.seed.push(r(), r(), r(), (site.h + site.r * 2 + 2) * (0.5 + r() * 0.5));
        ember.shape.push(0.25 + r() * 0.3, s);
      }
    }
    const plumes = site.plumes ?? 1;
    for (let p = 0; p < plumes; p++) {
      const a = r() * Math.PI * 2;
      const px = site.x + Math.cos(a) * site.r * 0.3 * p;
      const pz = site.z + Math.sin(a) * site.r * 0.3 * p;
      const tempo = 0.07 + r() * 0.03;
      for (let k = 0; k < PUFFS_PER_PLUME; k++) {
        puffs.push({
          x: px,
          y: site.y + site.h * 0.8 + 0.3,
          z: pz,
          s: Math.max(1.1, site.r * 0.9),
          seed: (k + r() * 0.5) / PUFFS_PER_PLUME,
          tempo,
          rise: 5 + site.r * 3 + site.h,
          grow: 1.6 + r() * 0.6
        });
      }
    }
  }

  const m = new THREE.Matrix4();
  let flameMesh: THREE.InstancedMesh | null = null;
  if (flames.length) {
    const g = FLAME_QUAD.clone();
    const fx = new Float32Array(flames.length * 2);
    flames.forEach((f, i) => fx.set([f.ph, f.tp], i * 2));
    g.setAttribute("aFx", new THREE.InstancedBufferAttribute(fx, 2));
    flameMesh = new THREE.InstancedMesh(g, mats.flame, flames.length);
    flames.forEach((f, i) => flameMesh!.setMatrixAt(i, m.makeScale(f.s, f.s, f.s).setPosition(f.x, f.y, f.z)));
  }
  let smokeMesh: THREE.InstancedMesh | null = null;
  if (puffs.length) {
    const g = SMOKE_QUAD.clone();
    const a = new Float32Array(puffs.length * 4);
    puffs.forEach((p, i) => a.set([p.seed, p.tempo, p.rise, p.grow], i * 4));
    g.setAttribute("aSmoke", new THREE.InstancedBufferAttribute(a, 4));
    smokeMesh = new THREE.InstancedMesh(g, mats.smoke, puffs.length);
    puffs.forEach((p, i) => smokeMesh!.setMatrixAt(i, m.makeScale(p.s, p.s, p.s).setPosition(p.x, p.y, p.z)));
  }
  for (const mesh of [flameMesh, smokeMesh]) {
    if (!mesh) continue;
    mesh.frustumCulled = false; // the shader moves them off their instance points
    mesh.raycast = noRaycast;
    mesh.instanceMatrix.needsUpdate = true;
  }
  if (flameMesh) flameMesh.renderOrder = 2;
  if (smokeMesh) smokeMesh.renderOrder = 3;

  let embers: THREE.BufferGeometry | null = null;
  if (ember.pos.length) {
    embers = new THREE.BufferGeometry();
    embers.setAttribute("position", new THREE.Float32BufferAttribute(ember.pos, 3));
    embers.setAttribute("aSeed", new THREE.Float32BufferAttribute(ember.seed, 4));
    embers.setAttribute("aShape", new THREE.Float32BufferAttribute(ember.shape, 2));
  }
  return { flames: flameMesh, smoke: smokeMesh, embers };
}

/** Draws every burning site: flames, smoke and embers, one draw call each */
export function FireFx({ sites }: { sites: FireSite[] }) {
  const mats = useMemo(
    () => ({
      flame: new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: shared },
        vertexShader: FLAME_VERTEX,
        fragmentShader: FLAME_FRAGMENT
      }),
      smoke: new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: shared },
        vertexShader: SMOKE_VERTEX,
        fragmentShader: SMOKE_FRAGMENT
      }),
      embers: new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: shared },
        vertexShader: EMBER_VERTEX,
        fragmentShader: EMBER_FRAGMENT
      })
    }),
    []
  );
  useEffect(
    () => () => {
      mats.flame.dispose();
      mats.smoke.dispose();
      mats.embers.dispose();
    },
    [mats]
  );

  const built = useMemo(() => buildFire(sites, mats), [sites, mats]);
  useEffect(
    () => () => {
      built.flames?.geometry.dispose();
      built.smoke?.geometry.dispose();
      built.embers?.dispose();
    },
    [built]
  );

  useFrame(({ clock }) => {
    shared.value = clock.elapsedTime;
  });

  return (
    <>
      {built.flames && <primitive object={built.flames} />}
      {built.smoke && <primitive object={built.smoke} />}
      {built.embers && <points geometry={built.embers} material={mats.embers} raycast={noRaycast} frustumCulled={false} renderOrder={2} />}
    </>
  );
}

/** Orange curtain of fire-light for TierFx round a burning site (epic class) */
export const FIRE_GLOW = { tier: "epic" as const, color: "#f97316", accent: "#fde68a" };
