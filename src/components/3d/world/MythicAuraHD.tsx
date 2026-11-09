import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ------------------------------ mythic aura (high graphics): beams, curtain and rising embers ------------------------------ */

// Shared GLSL: a value noise that wraps round the cylinder (period P cells on x), and the prismatic edge colour
const AURA_COMMON = `
  float auraHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float auraNoise(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = auraHash(vec2(mod(i.x, period), i.y));
    float b = auraHash(vec2(mod(i.x + 1.0, period), i.y));
    float c = auraHash(vec2(mod(i.x, period), i.y + 1.0));
    float d = auraHash(vec2(mod(i.x + 1.0, period), i.y + 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float auraFbm(vec2 p, float period) {
    float s = 0.0;
    float amp = 0.55;
    for (int k = 0; k < 4; k++) {
      s += auraNoise(p, period) * amp;
      p *= 2.0;
      period *= 2.0;
      amp *= 0.5;
    }
    return s;
  }
  vec3 prism(float h) {
    return 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
  }
`;

const AURA_VERT = `
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    // 1 where the surface faces the camera (the middle of the column), 0 at its silhouette: a soft volumetric falloff
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

// The mythic beam: a crimson column of flowing light with a white-hot heart and a prismatic shimmer at its edge
const AURA_BEAM_FRAG = `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uCore;
  uniform float uFadeTop;
  varying vec2 vUv;
  varying float vFacing;
  ${AURA_COMMON}
  void main() {
    float y = clamp(vUv.y, 0.0, 1.0); // MSAA shades a hair past the mesh: keep uv in range (a rim of exp(-y * k) flashes)
    float flow = auraFbm(vec2(vUv.x * 10.0, y * 14.0 - uTime * 1.6), 10.0);
    float streak = auraFbm(vec2(vUv.x * 24.0, y * 3.0 - uTime * 0.9), 24.0);
    float body = pow(max(vFacing, 0.0), mix(2.6, 7.0, uCore));
    float vfade = smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(uFadeTop, 1.0, y));
    float pulse = 0.85 + 0.15 * sin(uTime * 2.3 - y * 9.0);
    float b = body * (0.45 + flow * 0.75 + pow(streak, 3.0) * 0.9) * vfade * pulse * uIntensity;
    vec3 crimson = vec3(0.86, 0.06, 0.16);
    vec3 hot = vec3(1.0, 0.82, 0.9);
    vec3 edge = prism(vUv.x * 2.0 + y * 1.5 - uTime * 0.12) * vec3(1.0, 0.7, 1.0);
    vec3 col = mix(edge, crimson, smoothstep(0.15, 0.6, vFacing));
    col = mix(col, hot, smoothstep(0.75, 1.0, vFacing) * (0.4 + uCore * 0.6));
    gl_FragColor = vec4(col * b * 1.8, 1.0);
  }
`;

// The curtain of light round the model: ribbons of crimson light rising and fading, with prismatic glints
const AURA_CURTAIN_FRAG = `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying float vFacing;
  ${AURA_COMMON}
  void main() {
    float y = clamp(vUv.y, 0.0, 1.0); // MSAA shades a hair past the mesh: keep uv in range (a rim of exp(-y * k) flashes)
    float sway = auraNoise(vec2(vUv.x * 12.0, uTime * 0.35), 12.0) * 1.4;
    float ribbons = pow(auraFbm(vec2(vUv.x * 36.0 + sway, y * 1.6 - uTime * 0.55), 36.0), 2.2) * 2.2;
    float sparks = pow(auraNoise(vec2(vUv.x * 90.0, y * 9.0 - uTime * 2.4), 90.0), 14.0) * 3.0;
    float rise = pow(max(1.0 - y, 0.0), 2.2) * smoothstep(0.0, 0.04, y);
    float rim = exp(-y * 24.0) * 0.8;
    // Soften the face that lies flat to the camera so the curtain reads as a ring, brighter at its sides
    float side = mix(0.45, 1.0, 1.0 - vFacing);
    float b = (ribbons * rise + rim + sparks * rise) * side * uIntensity;
    vec3 col = mix(vec3(0.7, 0.04, 0.14), vec3(0.95, 0.3, 0.62), ribbons * 0.5);
    col = mix(col, prism(vUv.x * 3.0 - uTime * 0.08), clamp(sparks, 0.0, 1.0) * 0.8);
    gl_FragColor = vec4(col * b, 1.0);
  }
`;

// Embers rising through the curtain and the beam: soft round motes, crimson to prismatic, twinkling as they climb
const AURA_EMBER_VERT = `
  attribute vec4 aSeed; // x: radius, y: angle, z: speed, w: hue
  uniform float uTime;
  uniform float uHeight;
  varying float vAlpha;
  varying float vHue;
  varying float vHot;
  void main() {
    float life = fract(uTime * aSeed.z + aSeed.w * 7.31);
    float ang = aSeed.y + life * (1.6 / max(0.6, aSeed.x)) + sin(uTime * 0.7 + aSeed.w * 20.0) * 0.12;
    float r = aSeed.x * (1.0 - life * 0.18);
    vec3 pos = vec3(cos(ang) * r, life * uHeight, sin(ang) * r);
    vAlpha = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.55, 1.0, life)) * (0.65 + 0.35 * sin(uTime * 9.0 + aSeed.w * 60.0));
    vHue = aSeed.w;
    vHot = step(0.86, fract(aSeed.w * 13.7));
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((mix(0.09, 0.15, vHot) * 260.0) / max(1.0, -mv.z), 1.5, 18.0);
  }
`;

const AURA_EMBER_FRAG = `
  uniform float uIntensity;
  varying float vAlpha;
  varying float vHue;
  varying float vHot;
  ${AURA_COMMON}
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float core = exp(-r * r * 18.0);
    float halo = exp(-r * 4.0) * 0.5;
    vec3 base = mix(vec3(0.95, 0.1, 0.2), prism(vHue * 3.0) * vec3(1.0, 0.75, 1.0), vHot * 0.85 + step(0.7, vHue) * 0.35);
    vec3 col = mix(base, vec3(1.0, 0.94, 0.96), core * 0.7);
    gl_FragColor = vec4(col * (core * 1.6 + halo) * vAlpha * uIntensity * 1.6, 1.0);
  }
`;

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function makeEmberGeo(count: number, inner: number, outer: number, beamRadius: number, height: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // A third climb fast inside the beam, the rest drift up through the curtain
    const inBeam = i % 3 === 0;
    const r = inBeam ? 0.15 + hash01(i * 4.1 + 0.3) * beamRadius * 0.7 : inner + Math.pow(hash01(i * 1.7 + 0.9), 0.7) * (outer - inner);
    seeds[i * 4 + 0] = r;
    seeds[i * 4 + 1] = hash01(i * 2.9 + 1.3) * Math.PI * 2;
    seeds[i * 4 + 2] = inBeam ? 0.16 + hash01(i * 3.3 + 2.1) * 0.14 : 0.05 + hash01(i * 5.9 + 0.7) * 0.07;
    seeds[i * 4 + 3] = hash01(i * 7.7 + 3.1);
  }
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  // The embers move on the GPU from a point at the origin: give them a bound that covers their whole climb
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), Math.max(outer, height / 2) + 1);
  return g;
}

/** One column of light: where it starts, how tall and how wide */
export interface AuraBeam {
  y: number;
  height: number;
  radius: number;
}

export interface MythicAuraProps {
  /** Columns of light (the first is the main beam) */
  beams?: AuraBeam[];
  curtainRadius?: number;
  curtainHeight?: number;
  /** Embers drift up between these radii (plus a third inside the main beam) */
  emberRadii?: [number, number];
  emberHeight?: number;
  embers?: number;
  /** Brightness over time (1 = normal), e.g. to gutter out on a death */
  gain?: (t: number) => number;
}

const DEFAULT_BEAMS: AuraBeam[] = [{ y: 0, height: 26, radius: 1.35 }];

/**
 * The mythic aura in high graphics: flowing crimson beams with a prismatic edge, a curtain of light ribbons round the model
 * and embers rising through both. 2 draw calls per beam + 2.
 */
export function MythicAura({
  beams = DEFAULT_BEAMS,
  curtainRadius = 5.6,
  curtainHeight = 4.2,
  emberRadii = [2.2, 5.4],
  emberHeight = 9,
  embers = 260,
  gain
}: MythicAuraProps) {
  const key = JSON.stringify([beams, curtainRadius, curtainHeight, emberRadii, emberHeight, embers]);
  const built = useMemo(() => {
    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } as const;
    const time = { value: 0 };
    const beamParts = beams.map((b) => {
      const fadeTop = b.height > 8 ? 0.35 : 0.5;
      return {
        b,
        outer: new THREE.CylinderGeometry(b.radius, b.radius * 0.82, b.height, 48, 1, true),
        core: new THREE.CylinderGeometry(b.radius * 0.31, b.radius * 0.25, b.height, 32, 1, true),
        outerMat: new THREE.ShaderMaterial({ vertexShader: AURA_VERT, fragmentShader: AURA_BEAM_FRAG, uniforms: { uTime: time, uIntensity: { value: 0.55 }, uCore: { value: 0 }, uFadeTop: { value: fadeTop } }, ...additive }),
        coreMat: new THREE.ShaderMaterial({ vertexShader: AURA_VERT, fragmentShader: AURA_BEAM_FRAG, uniforms: { uTime: time, uIntensity: { value: 0.9 }, uCore: { value: 1 }, uFadeTop: { value: fadeTop } }, ...additive })
      };
    });
    const curtainMat = new THREE.ShaderMaterial({ vertexShader: AURA_VERT, fragmentShader: AURA_CURTAIN_FRAG, uniforms: { uTime: time, uIntensity: { value: 0.42 } }, ...additive });
    const emberMat = new THREE.ShaderMaterial({
      vertexShader: AURA_EMBER_VERT,
      fragmentShader: AURA_EMBER_FRAG,
      uniforms: { uTime: time, uIntensity: { value: 1 }, uHeight: { value: emberHeight } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    return {
      time,
      beamParts,
      curtain: new THREE.CylinderGeometry(curtainRadius, curtainRadius * 1.05, curtainHeight, 96, 1, true),
      curtainMat,
      emberGeo: makeEmberGeo(embers, emberRadii[0], emberRadii[1], beams[0]?.radius ?? 1, emberHeight),
      emberMat
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Made here, so freed here (r3f disposes only what JSX creates): every map ↔ city trip leaked them
  useEffect(
    () => () => {
      for (const p of built.beamParts) [p.outer, p.core, p.outerMat, p.coreMat].forEach((x) => x.dispose());
      [built.curtain, built.curtainMat, built.emberGeo, built.emberMat].forEach((x) => x.dispose());
    },
    [built]
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = gain ? gain(t) : 1;
    built.time.value = t;
    for (const p of built.beamParts) {
      p.outerMat.uniforms.uIntensity.value = 0.55 * k;
      p.coreMat.uniforms.uIntensity.value = 0.9 * k;
    }
    built.curtainMat.uniforms.uIntensity.value = 0.42 * k;
    built.emberMat.uniforms.uIntensity.value = k;
  });

  return (
    <group>
      {built.beamParts.map((p, i) => (
        <group key={i} position={[0, p.b.y + p.b.height / 2, 0]}>
          <mesh geometry={p.outer} material={p.outerMat} renderOrder={2} />
          <mesh geometry={p.core} material={p.coreMat} renderOrder={2} />
        </group>
      ))}
      <mesh geometry={built.curtain} material={built.curtainMat} position={[0, curtainHeight / 2, 0]} renderOrder={2} />
      <points geometry={built.emberGeo} material={built.emberMat} renderOrder={3} />
    </group>
  );
}
