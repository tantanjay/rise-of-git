import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { pinnedShower, useRealmSeason } from "@/utils/realmTime";
import { mulberry32 } from "@/utils/random";
import { skyWeather } from "./skyState";
import type { SeasonKey } from "@/types";

/**
 * The season's weather over both views (GAME_GUIDE §7 *Day, night & seasons*):
 * 🌸 spring: passing rain showers (a light rain, not a storm) under a few grey-white clouds;
 * ☀️ summer: a few white clouds, fireflies after dark; 🍂 autumn: leaves drifting down; ❄️ winter: snow.
 *
 * One instanced layer of particles (one draw call) in a box that follows the camera's target: each particle moves
 * in world space and wraps round the box, so the field looks endless while panning. Passing clouds are one more
 * instanced layer of soft puffs. All of it is lit by the realm sky (dark at night), casts no shadow and is never
 * picked by the pointer. Showers follow the wall clock, so every viewer sees the same rain.
 */

type Kind = "rain" | "snow" | "leaves" | "fireflies";
const KIND_ID: Record<Kind, number> = { rain: 0, snow: 1, leaves: 2, fireflies: 3 };

interface ViewSize {
  box: [number, number, number];
  ground: number;
  scale: number;
  cloudY: [number, number];
  cloudArea: number;
  cloudSize: number;
  counts: Record<Kind, number>;
}

const VIEW: Record<"world_map" | "city_view", ViewSize> = {
  world_map: {
    box: [170, 42, 170],
    ground: 0.8,
    scale: 2.3,
    cloudY: [44, 56],
    cloudArea: 300,
    cloudSize: 11,
    counts: { rain: 3200, snow: 2600, leaves: 700, fireflies: 420 }
  },
  city_view: {
    box: [72, 26, 72],
    ground: 0,
    scale: 1,
    cloudY: [20, 27],
    cloudArea: 150,
    cloudSize: 5,
    counts: { rain: 1900, snow: 1500, leaves: 460, fireflies: 260 }
  }
};

/** Clouds in the sky by season (few: the weather should be calm) */
const CLOUDS: Record<SeasonKey, number> = { spring: 7, summer: 4, autumn: 5, winter: 6 };
const PUFFS_PER_CLOUD = 7;

const SHOWER_CYCLE_MS = 30 * 60 * 1000;
const hash1 = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** 🌸 Spring showers: about half of each half-hour has rain, fading in and out over two minutes (0…1) */
export function showerAt(now: number): number {
  const cycle = Math.floor(now / SHOWER_CYCLE_MS);
  const r = hash1(cycle);
  if (r > 0.55) return 0;
  const start = 0.08 + hash1(cycle + 0.5) * 0.25;
  const end = Math.min(0.95, start + 0.35 + hash1(cycle + 0.25) * 0.35);
  const u = (now % SHOWER_CYCLE_MS) / SHOWER_CYCLE_MS;
  const ramp = 2 / 30;
  const k = Math.min(THREE.MathUtils.smoothstep(u, start, start + ramp), 1 - THREE.MathUtils.smoothstep(u, end - ramp, end));
  // Some showers are lighter than others
  return k * (0.55 + hash1(cycle + 0.75) * 0.45);
}

const PARTICLE_VERTEX = /* glsl */ `
attribute vec4 aSeed;
attribute vec3 aTint;
uniform float uTime;
uniform float uKind;
uniform float uAmount;
uniform float uScale;
uniform float uGround;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec2 uWind;
varying vec2 vUv;
varying vec3 vTint;
varying float vAlpha;

void main() {
  vUv = uv;
  vTint = aTint;
  float on = step(aSeed.w, uAmount);
  vec3 p = aSeed.xyz * uBox;
  float t = uTime;
  vec2 corner = position.xy;
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec2 size;
  if (uKind < 0.5) {
    // Rain: fast, a little slanted by the wind
    p += vec3(uWind.x * 2.0, -15.0 * (0.85 + aSeed.w * 0.3), uWind.y * 2.0) * t;
    up = normalize(vec3(uWind.x * 0.13, 1.0, uWind.y * 0.13));
    right = normalize(cross(up, vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])));
    size = vec2(0.11, 1.5) * uScale;
  } else if (uKind < 1.5) {
    // Snow: slow, swaying
    p += vec3(uWind.x * 0.35, -1.2 * (0.7 + aSeed.w * 0.6), uWind.y * 0.35) * t;
    p.xz += vec2(sin(t * 0.9 + aSeed.x * 40.0), cos(t * 0.7 + aSeed.z * 40.0)) * 0.6;
    size = vec2(0.15) * uScale * (0.7 + aSeed.y * 0.6);
  } else if (uKind < 2.5) {
    // Leaves: drifting on the wind, fluttering and turning over
    p += vec3(uWind.x * 0.9, -1.4 * (0.6 + aSeed.w * 0.6), uWind.y * 0.9) * t;
    p.xz += vec2(sin(t * 1.6 + aSeed.x * 50.0), cos(t * 1.25 + aSeed.y * 50.0)) * 0.9;
    float a = t * (1.5 + aSeed.z * 2.0) + aSeed.x * 30.0;
    corner = mat2(cos(a), sin(a), -sin(a), cos(a)) * vec2(corner.x, corner.y * abs(cos(a * 0.7)) + 0.0);
    size = vec2(0.26, 0.17) * uScale * (0.7 + aSeed.y * 0.6);
  } else {
    // Fireflies: low over the fields, wandering
    p.y = aSeed.y * 3.0;
    p += vec3(sin(t * 0.35 + aSeed.x * 30.0) * 2.5, sin(t * 0.9 + aSeed.z * 20.0) * 0.4, cos(t * 0.3 + aSeed.y * 30.0) * 2.5);
    size = vec2(0.16) * uScale;
  }
  // Wrap into the box round the camera's target (ground to top)
  vec3 lo = vec3(uCenter.x - uBox.x * 0.5, uGround, uCenter.z - uBox.z * 0.5);
  p = lo + mod(p - lo, uBox);
  if (uKind > 2.5) p.y = uGround + 0.4 + aSeed.y * 3.0 * (uScale * 0.6) + sin(t * 0.9 + aSeed.z * 20.0) * 0.4;
  vec2 d = abs(p.xz - uCenter.xz) / uBox.xz;
  vAlpha = on * (1.0 - smoothstep(0.36, 0.5, max(d.x, d.y)));
  if (uKind > 2.5) vAlpha *= 0.55 + 0.45 * sin(t * (1.5 + aSeed.w * 2.0) + aSeed.x * 60.0);
  vec3 world = p + right * corner.x * size.x + up * corner.y * size.y;
  gl_Position = on > 0.5 ? projectionMatrix * viewMatrix * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const PARTICLE_FRAGMENT = /* glsl */ `
uniform float uKind;
uniform vec3 uLight;
varying vec2 vUv;
varying vec3 vTint;
varying float vAlpha;

void main() {
  vec2 c = vUv - 0.5;
  vec3 col;
  float a;
  if (uKind < 0.5) {
    a = (1.0 - abs(c.x) * 2.0) * (1.0 - smoothstep(0.15, 0.5, abs(c.y))) * 0.45;
    col = vec3(0.86, 0.91, 1.0) * min(vec3(1.0), uLight * 1.1);
  } else if (uKind < 1.5) {
    a = (1.0 - smoothstep(0.12, 0.5, length(c))) * 0.9;
    col = vec3(1.0) * min(vec3(1.1), uLight * 1.15);
  } else if (uKind < 2.5) {
    // A leaf: pointed ellipse
    float e = length(c * vec2(1.0, 1.6 - abs(c.x) * 1.4));
    if (e > 0.42) discard;
    a = 1.0;
    col = vTint * uLight * (0.85 + 0.15 * step(abs(c.y), 0.03));
  } else {
    a = 1.0 - smoothstep(0.0, 0.5, length(c));
    col = vec3(1.0, 0.92, 0.45) * (0.6 + a);
  }
  a *= vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}
`;

const CLOUD_VERTEX = /* glsl */ `
attribute vec4 aCloud;
attribute vec4 aPuff;
uniform float uTime;
uniform vec3 uCenter;
uniform float uArea;
uniform vec2 uWind;
varying vec2 vUv;
varying float vShade;
varying float vEdge;

void main() {
  vUv = uv;
  vec3 c = vec3(aCloud.x, aCloud.z, aCloud.y) + vec3(uWind.x, 0.0, uWind.y) * uTime * 0.6;
  vec2 lo = uCenter.xz - uArea * 0.5;
  c.xz = lo + mod(c.xz - lo, uArea);
  vec2 d = abs(c.xz - uCenter.xz) / uArea;
  vEdge = 1.0 - smoothstep(0.32, 0.5, max(d.x, d.y));
  vec3 p = c + aPuff.xyz * aCloud.w;
  // Flat-bottomed and darker underneath
  vShade = clamp(0.75 + aPuff.y * 0.6, 0.6, 1.0);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float s = aCloud.w * aPuff.w;
  vec3 world = p + (right * position.x + up * position.y) * s;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uTint;
uniform float uOpacity;
varying vec2 vUv;
varying float vShade;
varying float vEdge;

void main() {
  float d = length(vUv - 0.5);
  float a = (1.0 - smoothstep(0.08, 0.5, d)) * uOpacity * vEdge;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uTint * uLight * vShade, a);
}
`;

/** A unit quad drawn once per instance (its own copy, so disposing it never touches another layer) */
const quadGeometry = () => new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry);
const noRaycast = () => null;

function particleTint(kind: Kind, r: () => number): [number, number, number] {
  if (kind !== "leaves") return [1, 1, 1];
  const leaves = ["#c2410c", "#d97706", "#b45309", "#dc2626", "#ca8a04", "#ea580c", "#a16207"];
  const c = new THREE.Color(leaves[Math.floor(r() * leaves.length)]);
  return [c.r, c.g, c.b];
}

export function SeasonWeather({ view, enabled = true }: { view: "world_map" | "city_view"; enabled?: boolean }) {
  const season = useRealmSeason();
  const size = VIEW[view];
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;

  // Which particles the season brings (summer: fireflies, shown only after dark)
  const kind: Kind = season === "spring" ? "rain" : season === "winter" ? "snow" : season === "autumn" ? "leaves" : "fireflies";

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uKind: { value: KIND_ID[kind] },
      uAmount: { value: 0 },
      uScale: { value: size.scale },
      uGround: { value: size.ground },
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(...size.box) },
      uWind: { value: new THREE.Vector2(0.7, 0.25) },
      uLight: { value: new THREE.Color(1, 1, 1) }
    }),
    [kind, size]
  );

  const particles = useMemo(() => {
    const n = size.counts[kind];
    const g = quadGeometry();
    const r = mulberry32(KIND_ID[kind] * 7919 + 17);
    const seed = new Float32Array(n * 4);
    const tint = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seed.set([r(), r(), r(), (i + r()) / n], i * 4);
      tint.set(particleTint(kind, r), i * 3);
    }
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
    g.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
    g.instanceCount = n;
    const additive = kind === "fireflies";
    const m = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.raycast = noRaycast;
    mesh.renderOrder = 3;
    return mesh;
  }, [kind, size, uniforms]);

  const cloudUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uArea: { value: size.cloudArea },
      uWind: { value: new THREE.Vector2(0.7, 0.25) },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uOpacity: { value: 0.4 }
    }),
    [size]
  );

  const clouds = useMemo(() => {
    const count = CLOUDS[season];
    const r = mulberry32(4241 + count * 13 + (view === "world_map" ? 1 : 2));
    const n = count * PUFFS_PER_CLOUD;
    const g = quadGeometry();
    const cloud = new Float32Array(n * 4);
    const puff = new Float32Array(n * 4);
    for (let c = 0; c < count; c++) {
      const x = (r() - 0.5) * size.cloudArea;
      const z = (r() - 0.5) * size.cloudArea;
      const y = size.cloudY[0] + r() * (size.cloudY[1] - size.cloudY[0]);
      const s = size.cloudSize * (0.7 + r() * 0.6);
      for (let p = 0; p < PUFFS_PER_CLOUD; p++) {
        const i = c * PUFFS_PER_CLOUD + p;
        cloud.set([x, z, y, s], i * 4);
        // A flat-bottomed heap, longer than it is wide
        puff.set([(r() - 0.5) * 2.2, r() * 0.45, (r() - 0.5) * 1.1, 1.1 + r() * 0.9], i * 4);
      }
    }
    g.setAttribute("aCloud", new THREE.InstancedBufferAttribute(cloud, 4));
    g.setAttribute("aPuff", new THREE.InstancedBufferAttribute(puff, 4));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.raycast = noRaycast;
    mesh.renderOrder = 5;
    return mesh;
  }, [season, size, view, cloudUniforms]);

  useEffect(
    () => () => {
      particles.geometry.dispose();
      (particles.material as THREE.Material).dispose();
    },
    [particles]
  );
  useEffect(
    () => () => {
      clouds.geometry.dispose();
      (clouds.material as THREE.Material).dispose();
    },
    [clouds]
  );
  useEffect(
    () => () => {
      skyWeather.showerDim = 1;
    },
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const target = controls?.target;
    uniforms.uTime.value = t;
    cloudUniforms.uTime.value = t;
    if (target) {
      uniforms.uCenter.value.copy(target);
      cloudUniforms.uCenter.value.copy(target);
    }
    uniforms.uLight.value.copy(skyWeather.light);
    cloudUniforms.uLight.value.copy(skyWeather.light);

    let amount: number;
    if (kind === "rain") {
      const shower = pinnedShower() ?? showerAt(Date.now());
      amount = shower;
      // A shower greys the light a little and the clouds a lot (never storm-dark)
      skyWeather.showerDim = 1 - 0.16 * shower;
      cloudUniforms.uTint.value.setScalar(1 - 0.2 * shower);
      cloudUniforms.uOpacity.value = 0.38 + 0.12 * shower;
    } else {
      skyWeather.showerDim = 1;
      cloudUniforms.uTint.value.setScalar(season === "winter" ? 0.92 : 1);
      cloudUniforms.uOpacity.value = season === "summer" ? 0.34 : 0.38;
      // Snow and leaves come in gusts; fireflies only after dark
      if (kind === "fireflies") amount = skyWeather.night;
      else amount = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.05));
    }
    uniforms.uAmount.value = enabled ? amount : 0;
    particles.visible = enabled && amount > 0.01;
    clouds.visible = enabled;
  });

  return (
    <>
      <primitive object={particles} />
      <primitive object={clouds} />
    </>
  );
}
