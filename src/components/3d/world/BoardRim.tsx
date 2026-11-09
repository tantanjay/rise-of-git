import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WORLD_SIZE } from "./terrain";

/*
 * The table the realm is laid out on. Normal quality: the plain slate frame (a base slab and four side boards).
 * HD: a carved walnut frame with rounded, bevelled edges, a stepped plinth under it and a gilt inlay running round
 * its top, all one mesh (one draw call) with wood grain drawn along each side in the shader.
 */

const HALF = WORLD_SIZE / 2;

/** A square ring (outer half-size `outer`, inner `inner`) extruded upward from y0 to y1, its edges rounded off */
function ring(outer: number, inner: number, y0: number, y1: number, bevel: number, color: THREE.Color): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-outer, -outer);
  shape.lineTo(outer, -outer);
  shape.lineTo(outer, outer);
  shape.lineTo(-outer, outer);
  shape.lineTo(-outer, -outer);
  const hole = new THREE.Path();
  hole.moveTo(-inner, -inner);
  hole.lineTo(-inner, inner);
  hole.lineTo(inner, inner);
  hole.lineTo(inner, -inner);
  hole.lineTo(-inner, -inner);
  shape.holes.push(hole);
  const depth = Math.max(0.01, y1 - y0 - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 1 });
  // Extruded along +z: stand it up (z → y) and lift it to its place
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  g.deleteAttribute("uv");
  const colors = new Float32Array(g.getAttribute("position").count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function rimGeometry(): THREE.BufferGeometry {
  const walnut = new THREE.Color("#5a3a24");
  const dark = new THREE.Color("#3b2618");
  const gilt = new THREE.Color("#c9a24a");
  const parts = [
    ring(HALF + 4.2, HALF - 0.2, -3.3, 1.3, 0.5, walnut), // the frame
    ring(HALF + 4.9, HALF + 1.5, -3.9, -2.4, 0.3, dark), // the stepped plinth
    ring(HALF + 2.3, HALF + 1.9, 1.3, 1.36, 0, gilt) // the gilt inlay, standing proud of the top
  ];
  // The tabletop under the board
  const slab = new THREE.BoxGeometry(WORLD_SIZE + 8, 1, WORLD_SIZE + 8).translate(0, -3.4, 0);
  slab.deleteAttribute("uv");
  const c = new Float32Array(slab.getAttribute("position").count * 3);
  for (let i = 0; i < c.length; i += 3) dark.toArray(c, i);
  slab.setAttribute("color", new THREE.BufferAttribute(c, 3));
  parts.push(slab);
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  parts.forEach((g) => g.dispose());
  return merged;
}

const VERTEX_PARS = /* glsl */ `
#include <common>
varying vec3 vRimW;`;
const VERTEX_MAIN = /* glsl */ `
#include <project_vertex>
vRimW = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

const FRAGMENT_PARS = /* glsl */ `
#include <common>
varying vec3 vRimW;
float rHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), u.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

const FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
float rimGilt = step(0.5, diffuseColor.r - diffuseColor.b);
{
  // Grain runs along each side of the frame: along x on the north and south boards, along z on the east and west
  vec3 w = vRimW;
  bool ns = abs(w.z) > abs(w.x);
  float along = ns ? w.x : w.z;
  float across = (ns ? w.z : w.x) + w.y * 0.7;
  float px = max(length(fwidth(w)), 1e-4);
  float mid = smoothstep(0.3, 0.1, px);
  float wave = rNoise(vec2(along * 0.08, across * 0.6)) * 2.0;
  float grain = 0.5 + 0.5 * sin(across * 9.0 + wave * 3.0 + rNoise(vec2(along * 0.5, across * 2.0)) * 1.5);
  float figure = rNoise(vec2(along * 0.25, across * 1.2));
  vec3 wood = diffuseColor.rgb * mix(1.0, (0.78 + 0.3 * grain) * (0.88 + 0.24 * figure), mid);
  diffuseColor.rgb = mix(wood, diffuseColor.rgb * (0.9 + 0.2 * rNoise(vec2(along * 3.0, across * 3.0))), rimGilt);
}`;

const FRAGMENT_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.3, rimGilt);`;

const FRAGMENT_METAL = /* glsl */ `
#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.85, rimGilt);`;

function rimMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", VERTEX_PARS).replace("#include <project_vertex>", VERTEX_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", FRAGMENT_PARS)
      .replace("#include <color_fragment>", FRAGMENT_COLOR)
      .replace("#include <roughnessmap_fragment>", FRAGMENT_ROUGH)
      .replace("#include <metalnessmap_fragment>", FRAGMENT_METAL);
  };
  m.customProgramCacheKey = () => "board-rim-hd";
  return m;
}

/** The board's frame: plain slate boxes, or in HD the carved walnut table (one draw) */
export function BoardRim({ hd }: { hd: boolean }) {
  const carved = useMemo(() => (hd ? { geometry: rimGeometry(), material: rimMaterial() } : null), [hd]);
  useEffect(
    () => () => {
      carved?.geometry.dispose();
      carved?.material.dispose();
    },
    [carved]
  );
  if (carved) return <mesh geometry={carved.geometry} material={carved.material} receiveShadow />;
  return (
    <>
      <mesh position={[0, -3.4, 0]}>
        <boxGeometry args={[WORLD_SIZE + 8, 1, WORLD_SIZE + 8]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (WORLD_SIZE / 2 + 2), -1, 0]}>
            <boxGeometry args={[4, 4.6, WORLD_SIZE + 8]} />
            <meshStandardMaterial color="#1e293b" roughness={0.7} />
          </mesh>
          <mesh position={[0, -1, s * (WORLD_SIZE / 2 + 2)]}>
            <boxGeometry args={[WORLD_SIZE + 8, 4.6, 4]} />
            <meshStandardMaterial color="#1e293b" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </>
  );
}
