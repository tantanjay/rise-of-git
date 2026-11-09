import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { skyWeather } from "@/components/3d/skyState";
import type { SeasonKey } from "@/types";
import { SEA_LEVEL, WORLD_SIZE } from "./terrain";

/*
 * HD graphics: grass that lives, only near the camera. One draw call: a single tuft (five tapered blades and a flower
 * head) instanced on a grid that wraps round the camera's target, so each tuft keeps its own spot in the world and
 * reappears on the far side as the view moves (nothing is rebuilt on the CPU). The vertex shader places every tuft
 * from two textures baked off the terrain mesh: the exact ground height (the same triangles the terrain draws), where
 * grass grows, how dry it is, flowers or reeds, and the ground's season colour. Wind sway, size, lean, flowers and
 * reeds are seeded from the tuft's world cell, so the same spot always grows the same tuft. Moving things cast no
 * shadow (docs/RENDERING.md), so the grass only receives them.
 */

/** Tufts per side of the wrapping grid, and the spacing between them (world units) */
const GRID = 80;
const SPACING = 0.42;
const SPAN = GRID * SPACING;
/** Grass thins out towards this distance from the camera's target */
const RADIUS = SPAN * 0.48;
/** Hidden when the camera is farther than this from its target (the overview never draws it) */
const HIDE_FROM = 72;
const RES = WORLD_SIZE + 1;

/** One tuft: five tapered blades leaning outwards, plus a small crossed flower head on the first blade's tip */
function tuftGeometry(): THREE.InstancedBufferGeometry {
  const pos: number[] = [];
  const blade: number[] = [];
  const index: number[] = [];
  const BLADES = 5;
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + Math.sin(b * 12.9) * 0.5;
    const hb = 0.7 + ((b * 0.37) % 0.3);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const w = 0.035;
    const at = (t: number, side: number, width: number) => {
      const r = 0.05 + 0.28 * Math.pow(t, 1.6) * hb;
      pos.push(dx * r - dz * side * width, t * hb, dz * r + dx * side * width);
      blade.push(t, 0);
    };
    const o = pos.length / 3;
    at(0, -1, w);
    at(0, 1, w);
    at(0.55, -1, w * 0.6);
    at(0.55, 1, w * 0.6);
    at(1, 0, 0);
    index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2, o + 2, o + 3, o + 4);
  }
  // Flower head (or a reed's cattail) at the first blade's tip
  const tip = { x: 0.05 + 0.28 * 0.7, y: 0.7 };
  const s = 0.05;
  for (const rot of [0, Math.PI / 2]) {
    const cx = Math.cos(rot) * s;
    const cz = Math.sin(rot) * s;
    const o = pos.length / 3;
    pos.push(tip.x - cx, tip.y - s, -cz, tip.x + cx, tip.y - s, cz, tip.x + cx, tip.y + s, cz, tip.x - cx, tip.y + s, -cz);
    for (let k = 0; k < 4; k++) blade.push(1, 1);
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geom = new THREE.InstancedBufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("aBlade", new THREE.Float32BufferAttribute(blade, 2));
  // Lit like the ground under it (a normal attribute also keeps three from compiling it flat-shaded)
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geom.setIndex(index);
  const off = new Float32Array(GRID * GRID * 2);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) off.set([i * SPACING, j * SPACING], (j * GRID + i) * 2);
  geom.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 2));
  geom.instanceCount = GRID * GRID;
  return geom;
}

/** (height, density, dryness, flowers − reeds) per terrain vertex, one texel each */
function fieldTexture(terrain: THREE.BufferGeometry): THREE.DataTexture {
  const pos = terrain.getAttribute("position") as THREE.BufferAttribute;
  const flora = terrain.userData.flora as Float32Array;
  const data = new Uint16Array(RES * RES * 4);
  const half = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < pos.count; i++) {
    data[i * 4] = half(pos.getY(i));
    data[i * 4 + 1] = half(flora[i * 3]);
    data[i * 4 + 2] = half(flora[i * 3 + 1]);
    data[i * 4 + 3] = half(flora[i * 3 + 2]);
  }
  const tex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** The ground's colour (with the season) per terrain vertex, so the grass grows in the land's own green */
function colorTexture(terrain: THREE.BufferGeometry): THREE.DataTexture {
  const color = terrain.getAttribute("color") as THREE.BufferAttribute;
  const data = new Uint8Array(RES * RES * 4);
  for (let i = 0; i < color.count; i++) {
    data[i * 4] = Math.min(255, color.getX(i) * 255);
    data[i * 4 + 1] = Math.min(255, color.getY(i) * 255);
    data[i * 4 + 2] = Math.min(255, color.getZ(i) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const VERTEX_PARS = /* glsl */ `
#include <common>
uniform sampler2D uField;
uniform sampler2D uGround;
uniform vec2 uCenter;
uniform float uTime;
uniform float uShow;
uniform float uWinter;
uniform float uBlight;
uniform float uGrey;
attribute vec2 aOff;
attribute vec2 aBlade;
varying vec3 vGCol;
float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`;

const VERTEX_BEGIN = /* glsl */ `
const float SPAN = ${SPAN.toFixed(4)};
const float SPACING = ${SPACING.toFixed(4)};
const float RADIUS = ${RADIUS.toFixed(4)};
const float HALF = ${(WORLD_SIZE / 2).toFixed(1)};
const float RES = ${RES.toFixed(1)};
// The tuft's spot: the grid wraps round the camera's target, every tuft stays put in the world
vec2 base = mod(aOff - uCenter + 0.5 * SPAN, SPAN) + uCenter - 0.5 * SPAN;
vec2 cid = floor(base / SPACING + 0.5);
float h1 = gHash(cid), h2 = gHash(cid + 3.7), h3 = gHash(cid + 9.1), h4 = gHash(cid + 15.3), h5 = gHash(cid + 21.9);
vec2 wp = base + (vec2(h1, h2) - 0.5) * SPACING * 0.95;
// Ground height on the same triangles the terrain draws
vec2 g = clamp(wp + HALF, vec2(0.0), vec2(RES - 1.001));
vec2 gi = floor(g);
vec2 gf = g - gi;
ivec2 ii = ivec2(gi);
float ha = texelFetch(uField, ii, 0).r;
float hb = texelFetch(uField, ii + ivec2(0, 1), 0).r;
float hc = texelFetch(uField, ii + ivec2(1, 1), 0).r;
float hd = texelFetch(uField, ii + ivec2(1, 0), 0).r;
float ground = gf.x + gf.y < 1.0 ? ha + gf.x * (hd - ha) + gf.y * (hb - ha) : hc + (1.0 - gf.x) * (hb - hc) + (1.0 - gf.y) * (hd - hc);
vec2 uv = (g + 0.5) / RES;
vec4 f = texture(uField, uv);
float dens = f.g;
float dry = f.b;
float reed = step(f.a, -0.05) * step(h4, -f.a * 1.4);
float flowerChance = max(f.a, 0.0) * 0.55;
float ring = smoothstep(RADIUS, RADIUS * 0.55, length(wp - uCenter));
float keep = step(h3, dens * 0.95 + reed);
float size = keep * ring * uShow * mix(0.7, 1.0, dens) * (1.0 - 0.45 * uWinter);
float tall = mix(0.3, 0.52, h4) * (1.0 + reed * 1.7) * mix(1.0, 0.8, dry);
float head = aBlade.y > 0.5 ? (reed > 0.5 ? 1.0 : step(h5, flowerChance) * (1.0 - uWinter)) : 1.0;
vec3 lp = position;
lp.y *= tall;
lp.xz *= mix(0.85, 1.3, h1) * (reed > 0.5 ? 0.6 : 1.0);
if (aBlade.y > 0.5 && reed > 0.5) lp.y += (lp.y - 0.7 * tall) * 1.8; // a long cattail
float ang = h2 * 6.2832;
lp.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * lp.xz;
// Wind: a steady sway, slow gusts rolling across the field, a little flutter; each tuft on its own phase
float tt = aBlade.x * aBlade.x;
float sway = sin(uTime * (1.5 + h5 * 0.6) + dot(wp, vec2(0.37, 0.21)) + h5 * 6.28) * 0.5 + sin(uTime * 0.55 + wp.x * 0.07 + wp.y * 0.05) * 0.8 + 0.4;
vec2 wind = vec2(0.82, 0.57) * sway * 0.11 * tt * tall / 0.4;
wind += vec2(-0.57, 0.82) * sin(uTime * 3.1 + h1 * 20.0 + aBlade.x * 2.0) * 0.015 * aBlade.x;
lp.xz += wind;
lp.y -= dot(wind, wind) * 0.8;
// Nothing grows under the sea or the river (a tuft between a shore vertex and a wet one would stand in the water)
size *= step(${(SEA_LEVEL + 0.04).toFixed(2)}, ground);
vec3 transformed = vec3(wp.x, ground - 0.03, wp.y) + lp * size * head;
// Colour: the land's own green, darker at the root, lighter at the tip; dry straw on the steppe; reeds; flowers
vec3 land = texture(uGround, uv).rgb;
vec3 gc = mix(land * vec3(0.9, 1.08, 0.8), vec3(0.24, 0.48, 0.16), 0.35) * mix(0.8, 1.1, h1);
gc = mix(gc, vec3(0.72, 0.64, 0.38) * mix(0.85, 1.1, h5), dry * 0.8);
gc = mix(gc, vec3(0.42, 0.5, 0.25), reed);
gc = mix(gc, vec3(0.92, 0.95, 0.98), uWinter * 0.55);
gc *= mix(0.45, 1.05, aBlade.x);
vec3 petal = h4 < 0.2 ? vec3(0.96, 0.95, 0.9) : h4 < 0.4 ? vec3(1.0, 0.84, 0.25) : h4 < 0.6 ? vec3(0.96, 0.5, 0.7) : h4 < 0.8 ? vec3(0.68, 0.48, 0.96) : vec3(0.45, 0.62, 1.0);
vGCol = aBlade.y > 0.5 ? (reed > 0.5 ? vec3(0.33, 0.21, 0.12) : petal) : gc;
// A world disaster: the Great Blight wilts the blades brown-grey, the Barren Spell greys blades and flowers alike
float gLum = dot(vGCol, vec3(0.299, 0.587, 0.114));
vGCol = mix(vGCol, vec3(gLum * 1.12, gLum * 0.98, gLum * 0.7), uBlight * 0.8);
vGCol = mix(vGCol, vec3(gLum), uGrey * 0.75);`;

function grassMaterial(uniforms: Record<string, THREE.IUniform>): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", VERTEX_PARS)
      .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);")
      .replace("#include <begin_vertex>", VERTEX_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGCol;")
      .replace("#include <color_fragment>", "diffuseColor.rgb = vGCol;")
      // Both faces lit as the ground is (a blade's back must not go dark)
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize(vNormal);");
  };
  m.customProgramCacheKey = () => "world-grass";
  return m;
}

export function Grass({ terrain, season }: { terrain: THREE.BufferGeometry; season: SeasonKey }) {
  const geometry = useMemo(() => tuftGeometry(), []);
  const field = useMemo(() => fieldTexture(terrain), [terrain]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the season re-tints the terrain's colours in place
  const ground = useMemo(() => colorTexture(terrain), [terrain, season]);
  const uniforms = useMemo(
    () => ({
      uField: { value: null as THREE.Texture | null },
      uGround: { value: null as THREE.Texture | null },
      uCenter: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uShow: { value: 1 },
      uWinter: { value: 0 },
      uBlight: { value: 0 },
      uGrey: { value: 0 }
    }),
    []
  );
  const material = useMemo(() => grassMaterial(uniforms), [uniforms]);
  uniforms.uField.value = field;
  uniforms.uGround.value = ground;
  uniforms.uWinter.value = season === "winter" ? 1 : 0;
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => field.dispose(), [field]);
  useEffect(() => () => ground.dispose(), [ground]);
  useEffect(() => () => material.dispose(), [material]);

  const mesh = useRef<THREE.Mesh>(null);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  useFrame(({ camera, clock }) => {
    if (!mesh.current) return;
    const target = controls?.target;
    const dist = target ? camera.position.distanceTo(target) : Infinity;
    const show = 1 - THREE.MathUtils.smoothstep(dist, HIDE_FROM * 0.7, HIDE_FROM);
    mesh.current.visible = show > 0;
    if (!target || show <= 0) return;
    uniforms.uCenter.value.set(target.x, target.z);
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uShow.value = show;
    uniforms.uBlight.value = skyWeather.disaster.blight;
    uniforms.uGrey.value = skyWeather.disaster.barren;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} receiveShadow />;
}
