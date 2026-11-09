import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { DisasterKind } from "@/types";
import { useActiveDisasterKind } from "@/utils/disasters";
import { mulberry32 } from "@/utils/random";
import { skyWeather } from "./skyState";

/**
 * A world disaster's look over both views and the Guide Book (GAME_GUIDE §10 *World Disasters*):
 * 🌾 Great Blight: grey-brown spores drift low (the land itself browns through skyWeather.disaster in the terrain);
 * 🌪️ Tempest Roads: wind streaks whip across and dust blows along; 🩸 Blood Moon: a huge red moon in the sky and red
 * motes rising (the night turns red in RealmSky); ☠️ Wasting Plague: a green miasma creeps low over the land and the
 * cities; 🥀 Barren Spell: ash-grey petals fall (the colour drains from the land, and the city's streets empty).
 *
 * One instanced layer of particles (one draw call) in a box that follows the camera's target, as the season's weather
 * does, plus one billboard for the Blood Moon's moon: nothing when the realm is calm. It fades in and out over a few
 * seconds, and writes how strongly each disaster shows into skyWeather.disaster for the sky, terrain and grass. No
 * shadows, never picked by the pointer.
 */

const KIND_ID: Record<DisasterKind, number> = { blight: 0, tempest: 1, blood_moon: 2, plague: 3, barren: 4 };
type View = "world_map" | "city_view" | "codex";

interface ViewSize {
  box: [number, number, number];
  ground: number;
  scale: number;
  counts: Record<DisasterKind, number>;
  /** How far away the moon hangs (inside the camera's far plane, past everything on the board) */
  moonDistance: number;
  /**
   * ☠️ The Wasting Plague's miasma: its puffs' opacity, how high they drift (× scale) and their size (× scale), and how pale
   * they are (0: the land's own sickly green, 1: a pale yellow-green). Green over green grass, the map's thin low haze
   * reads by its size; the Guide's small stage needs it thicker, higher and paler to show at all
   */
  miasma: [number, number, number, number];
}

const VIEW: Record<View, ViewSize> = {
  world_map: { box: [170, 40, 170], ground: 0.8, scale: 2.3, moonDistance: 480, miasma: [0.42, 1.2, 2.6, 0], counts: { blight: 1100, tempest: 1500, blood_moon: 600, plague: 700, barren: 800 } },
  city_view: { box: [72, 24, 72], ground: 0, scale: 1, moonDistance: 380, miasma: [0.42, 1.2, 2.6, 0], counts: { blight: 650, tempest: 900, blood_moon: 360, plague: 360, barren: 480 } },
  codex: { box: [22, 9, 22], ground: 0, scale: 0.55, moonDistance: 90, miasma: [0.8, 4.5, 3.4, 0.55], counts: { blight: 220, tempest: 300, blood_moon: 130, plague: 170, barren: 170 } }
};

const VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uKind;
uniform float uScale;
uniform float uGround;
uniform vec4 uMiasma;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec2 uWind;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;

void main() {
  vUv = uv;
  vSeed = aSeed.w;
  vec3 p = aSeed.xyz * uBox;
  float t = uTime;
  vec2 corner = position.xy;
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec2 size;
  float low = 1.0;
  if (uKind < 0.5) {
    // Blight spores: slow, drifting low, bobbing
    p += vec3(uWind.x * 0.5, -0.25 * (0.5 + aSeed.w), uWind.y * 0.5) * t;
    p.xz += vec2(sin(t * 0.7 + aSeed.x * 40.0), cos(t * 0.6 + aSeed.z * 40.0)) * 0.5;
    size = vec2(0.12) * uScale * (0.6 + aSeed.y * 0.8);
    low = 0.45;
  } else if (uKind < 1.5) {
    vec3 w = normalize(vec3(uWind.x, 0.0, uWind.y));
    if (aSeed.w < 0.62) {
      // Wind streaks: long, fast, lying flat along the wind (so they read from above)
      p += w * (16.0 + aSeed.y * 10.0) * t;
      right = w;
      up = vec3(-w.z, 0.0, w.x);
      size = vec2(3.0 + aSeed.x * 3.0, 0.07) * uScale;
      low = 0.55;
    } else {
      // Dust: soft clouds rolling along the ground
      p += w * (7.0 + aSeed.y * 4.0) * t;
      p.y += sin(t * 0.8 + aSeed.x * 30.0) * 0.3;
      size = vec2(1.8 + aSeed.z * 1.6) * uScale;
      low = 0.08;
    }
  } else if (uKind < 2.5) {
    // Blood motes: rising slowly, wavering
    p += vec3(uWind.x * 0.15, 0.55 * (0.5 + aSeed.w), uWind.y * 0.15) * t;
    p.xz += vec2(sin(t * 1.1 + aSeed.x * 50.0), cos(t * 0.9 + aSeed.z * 50.0)) * 0.35;
    size = vec2(0.09) * uScale * (0.7 + aSeed.y * 0.6);
    low = 0.6;
  } else if (uKind < 3.5) {
    // Miasma: big soft puffs creeping over the ground
    p += vec3(uWind.x * 0.35, 0.0, uWind.y * 0.35) * t;
    p.xz += vec2(sin(t * 0.21 + aSeed.x * 20.0), cos(t * 0.17 + aSeed.z * 20.0)) * 2.0;
    size = vec2(uMiasma.z) * uScale * (0.6 + aSeed.y * 0.8);
    low = 0.0;
  } else {
    // Ash-grey petals: falling, fluttering and turning over
    p += vec3(uWind.x * 0.7, -1.1 * (0.6 + aSeed.w * 0.6), uWind.y * 0.7) * t;
    p.xz += vec2(sin(t * 1.5 + aSeed.x * 50.0), cos(t * 1.2 + aSeed.y * 50.0)) * 0.8;
    float a = t * (1.4 + aSeed.z * 2.0) + aSeed.x * 30.0;
    corner = mat2(cos(a), sin(a), -sin(a), cos(a)) * vec2(corner.x, corner.y * abs(cos(a * 0.7)));
    size = vec2(0.2, 0.14) * uScale * (0.7 + aSeed.y * 0.6);
  }
  // Wrap into the box round the camera's target; the low kinds keep to the lower part of it
  float top = max(uBox.y * low, 0.001);
  vec3 box = vec3(uBox.x, top, uBox.z);
  vec3 lo = vec3(uCenter.x - uBox.x * 0.5, uGround, uCenter.z - uBox.z * 0.5);
  p = lo + mod(p - lo, box);
  if (uKind > 2.5 && uKind < 3.5) p.y = uGround + 0.3 * uScale + aSeed.y * uMiasma.y * uScale;
  vec2 d = abs(p.xz - uCenter.xz) / uBox.xz;
  vAlpha = 1.0 - smoothstep(0.36, 0.5, max(d.x, d.y));
  // Fade at the top of the box so nothing pops when it wraps (the miasma never wraps up and down: it is set at its own
  // height above, and its box has no height, which would fade every puff out)
  if (uKind < 2.5 || uKind > 3.5) vAlpha *= 1.0 - smoothstep(0.85, 1.0, (p.y - uGround) / top);
  vec3 world = p + right * corner.x * size.x + up * corner.y * size.y;
  vec4 view = viewMatrix * vec4(world, 1.0);
  // Nothing smears across the lens: a particle fades out as it nears the camera
  vAlpha *= smoothstep(1.5 * uScale, 6.0 * uScale, -view.z);
  gl_Position = projectionMatrix * view;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uKind;
uniform float uAmount;
uniform float uTime;
uniform vec3 uLight;
uniform vec4 uMiasma;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;

void main() {
  vec2 c = vUv - 0.5;
  float r = length(c);
  vec3 col;
  float a;
  if (uKind < 0.5) {
    a = (1.0 - smoothstep(0.1, 0.5, r)) * 0.75;
    col = mix(vec3(0.55, 0.5, 0.36), vec3(0.42, 0.38, 0.3), vSeed) * min(vec3(1.0), uLight * 1.1);
  } else if (uKind < 1.5) {
    if (vSeed < 0.62) {
      a = (1.0 - smoothstep(0.0, 0.5, abs(c.x))) * (1.0 - smoothstep(0.1, 0.5, abs(c.y))) * 0.6;
      col = vec3(0.66, 0.55, 0.38) * min(vec3(1.0), uLight * 1.15);
    } else {
      a = (1.0 - smoothstep(0.0, 0.5, r)) * (1.0 - smoothstep(0.0, 0.5, r)) * 0.16;
      col = vec3(0.68, 0.55, 0.36) * min(vec3(1.0), uLight * 1.15);
    }
  } else if (uKind < 2.5) {
    // Additive: kept well under the bloom threshold, so they glint without glare
    a = (1.0 - smoothstep(0.0, 0.5, r)) * (0.55 + 0.45 * sin(uTime * (2.0 + vSeed * 3.0) + vSeed * 80.0));
    col = vec3(0.85, 0.16, 0.1);
  } else if (uKind < 3.5) {
    float m = 1.0 - smoothstep(0.0, 0.5, r);
    a = m * m * uMiasma.x;
    col = mix(mix(vec3(0.5, 0.7, 0.16), vec3(0.36, 0.56, 0.18), vSeed), vec3(0.8, 0.9, 0.42), uMiasma.w) * min(vec3(1.0), uLight * 1.2 + 0.1);
  } else {
    float e = length(c * vec2(1.0, 1.5 - abs(c.x) * 1.2));
    if (e > 0.42) discard;
    a = 0.9;
    col = mix(vec3(0.62, 0.6, 0.58), vec3(0.44, 0.42, 0.42), vSeed) * min(vec3(1.0), uLight * 1.1);
  }
  a *= vAlpha * uAmount;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}
`;

const MOON_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // A billboard: the quad faces the camera wherever it stands
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(modelMatrix[0].xyz);
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;
}
`;

const MOON_FRAGMENT = /* glsl */ `
uniform float uAmount;
varying vec2 vUv;
float mHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float mNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mHash(i), mHash(i + vec2(1.0, 0.0)), u.x), mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  // The disc fills the inner 0.36 of the quad; a soft red halo the rest
  vec2 c = (vUv - 0.5) * 2.0;
  float r = length(c);
  float disc = 1.0 - smoothstep(0.34, 0.36, r);
  vec2 q = c / 0.36;
  float limb = sqrt(max(1.0 - dot(q, q), 0.0));
  float maria = mNoise(q * 2.2 + 3.0) * 0.6 + mNoise(q * 5.0) * 0.4;
  vec3 face = mix(vec3(0.5, 0.08, 0.05), vec3(0.74, 0.2, 0.12), smoothstep(0.35, 0.75, maria)) * (0.55 + 0.45 * limb);
  float halo = (1.0 - smoothstep(0.34, 1.0, r)) * 0.32;
  halo *= halo * 3.0;
  vec3 col = face * disc + vec3(0.7, 0.08, 0.05) * halo * (1.0 - disc);
  float a = max(disc, halo) * uAmount;
  if (a < 0.005) discard;
  gl_FragColor = vec4(col, a);
}
`;

const quadGeometry = () => new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry);
const noRaycast = () => null;

/** How fast a disaster's look comes and goes (per second, exponential) */
const FADE = 0.6;

const _fwd = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function DisasterWeather({ view, kind: forced, enabled = true }: { view: View; kind?: DisasterKind | null; enabled?: boolean }) {
  const live = useActiveDisasterKind();
  const kind = forced === undefined ? live : forced;
  // The layer keeps the last disaster while its look fades out
  const shown = useRef<DisasterKind | null>(kind);
  if (kind) shown.current = kind;
  const layerKind = kind ?? shown.current;
  const size = VIEW[view];
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const amount = useRef(forced ? 1 : 0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uKind: { value: layerKind ? KIND_ID[layerKind] : 0 },
      uAmount: { value: 0 },
      uScale: { value: size.scale },
      uGround: { value: size.ground },
      uMiasma: { value: new THREE.Vector4(...size.miasma) },
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(...size.box) },
      uWind: { value: new THREE.Vector2(0.8, 0.3) },
      uLight: { value: new THREE.Color(1, 1, 1) }
    }),
    [layerKind, size]
  );

  const particles = useMemo(() => {
    if (!layerKind) return null;
    const n = size.counts[layerKind];
    const g = quadGeometry();
    const r = mulberry32(KIND_ID[layerKind] * 6151 + 29);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seed.set([r(), r(), r(), r()], i * 4);
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: layerKind === "blood_moon" ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.raycast = noRaycast;
    mesh.renderOrder = 4;
    mesh.visible = false;
    return mesh;
  }, [layerKind, size, uniforms]);

  const moonUniforms = useMemo(() => ({ uAmount: { value: 0 } }), []);
  const moon = useMemo(() => {
    if (layerKind !== "blood_moon") return null;
    const m = new THREE.ShaderMaterial({ uniforms: moonUniforms, vertexShader: MOON_VERTEX, fragmentShader: MOON_FRAGMENT, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.frustumCulled = false;
    mesh.raycast = noRaycast;
    mesh.renderOrder = -1;
    mesh.visible = false;
    return mesh;
  }, [layerKind, moonUniforms]);

  useEffect(
    () => () => {
      if (!particles) return;
      particles.geometry.dispose();
      (particles.material as THREE.Material).dispose();
    },
    [particles]
  );
  useEffect(
    () => () => {
      if (!moon) return;
      moon.geometry.dispose();
      (moon.material as THREE.Material).dispose();
    },
    [moon]
  );
  // The sky, terrain and grass go back to normal when the view goes (the Guide's preview never touches them)
  useEffect(() => {
    if (view === "codex") return;
    return () => {
      for (const k of Object.keys(skyWeather.disaster) as DisasterKind[]) skyWeather.disaster[k] = 0;
    };
  }, [view]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const on = enabled && Boolean(kind);
    amount.current += ((on ? 1 : 0) - amount.current) * (1 - Math.exp(-Math.min(dt, 0.1) * FADE));
    if (!on && amount.current < 0.002) amount.current = 0;
    const k = amount.current;
    if (view !== "codex") {
      for (const key of Object.keys(skyWeather.disaster) as DisasterKind[]) skyWeather.disaster[key] = key === layerKind ? k : 0;
    }

    if (particles) {
      particles.visible = k > 0.01;
      uniforms.uAmount.value = k;
      uniforms.uTime.value = t;
      if (controls?.target) uniforms.uCenter.value.copy(controls.target);
      uniforms.uLight.value.copy(skyWeather.light);
    }
    if (moon) {
      // Bright at night, a pale ghost by day
      const a = k * (view === "codex" ? 1 : 0.35 + 0.65 * skyWeather.night);
      moon.visible = a > 0.01;
      moonUniforms.uAmount.value = a;
      if (moon.visible) {
        // Always ahead of the camera, a little to the right, just under the top of the view when the sky is in it
        const cam = state.camera;
        cam.getWorldDirection(_fwd);
        const halfFov = cam instanceof THREE.PerspectiveCamera ? THREE.MathUtils.degToRad(cam.fov) / 2 : 0.4;
        const top = Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1)) + halfFov;
        _fwd.y = 0;
        if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
        _fwd.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, -0.35);
        const e = THREE.MathUtils.clamp(top - (view === "codex" ? 0.2 : 0.24), 0.07, 0.42);
        _dir.copy(_fwd).multiplyScalar(Math.cos(e)).addScaledVector(THREE.Object3D.DEFAULT_UP, Math.sin(e));
        moon.position.copy(cam.position).addScaledVector(_dir, size.moonDistance);
        moon.scale.setScalar(size.moonDistance * 0.34);
      }
    }
  });

  return (
    <>
      {particles && <primitive object={particles} />}
      {moon && <primitive object={moon} />}
    </>
  );
}
