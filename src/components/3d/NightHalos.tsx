import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { skyWeather } from "./skyState";

/**
 * Soft glows that come out after dark (GAME_GUIDE §7 *Day, night & seasons*): gate braziers and torches, the
 * Voidrift's orbiting shards. One instanced draw call for any number of points: camera-facing quads with a radial
 * falloff, added on top of the scene, faded in by the sky (`skyWeather.night`) and flickering a little per point.
 * Never casts shadows, never picked. Points are in the parent's space, so a moving parent carries them along.
 */

export interface HaloPoint {
  x: number;
  y: number;
  z: number;
  /** Diameter in world units */
  size: number;
  color: string;
}

const VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aSeed;
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying float vFlicker;
void main() {
  vUv = uv;
  vColor = aColor;
  vFlicker = 0.88 + 0.08 * sin(uTime * 7.0 + aSeed * 31.0) + 0.04 * sin(uTime * 19.0 + aSeed * 7.0);
  vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float size = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
  centre.xy += position.xy * size * vFlicker;
  gl_Position = projectionMatrix * centre;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uStrength;
varying vec2 vUv;
varying vec3 vColor;
varying float vFlicker;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.0, 1.0, d));
  a = a * a * uStrength * vFlicker;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * a, a);
}
`;

const QUAD = new THREE.PlaneGeometry(1, 1);
const noRaycast = () => null;
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export function NightHalos({ points, day = 0, night = 1 }: { points: HaloPoint[]; /** Strength by day (0 = only at night) */ day?: number; /** Strength at night */ night?: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uStrength: { value: 0 } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  const mesh = useMemo(() => {
    if (points.length === 0) return null;
    const g = QUAD.clone();
    const color = new Float32Array(points.length * 3);
    const seed = new Float32Array(points.length);
    points.forEach((p, i) => {
      _c.set(p.color);
      color.set([_c.r, _c.g, _c.b], i * 3);
      seed[i] = (Math.sin(p.x * 12.9898 + p.z * 78.233 + i) * 43758.5453) % 1;
    });
    g.setAttribute("aColor", new THREE.InstancedBufferAttribute(color, 3));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
    const m = new THREE.InstancedMesh(g, material, points.length);
    points.forEach((p, i) => m.setMatrixAt(i, _m.makeScale(p.size, p.size, p.size).setPosition(p.x, p.y, p.z)));
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    m.raycast = noRaycast;
    m.renderOrder = 4;
    return m;
  }, [points, material]);
  useEffect(() => () => mesh?.geometry.dispose(), [mesh]);

  useFrame((state) => {
    if (!mesh) return;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    const k = day + (night - day) * skyWeather.night;
    material.uniforms.uStrength.value = k;
    mesh.visible = k > 0.01;
  });

  return mesh ? <primitive object={mesh} /> : null;
}
