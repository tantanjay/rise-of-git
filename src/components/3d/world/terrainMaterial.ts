import * as THREE from "three";
import { SEA_LEVEL } from "./terrain";
import { skyWeather } from "@/components/3d/skyState";

/*
 * The continent's material. Normal quality: smooth-shaded vertex colours (fields, meadows, scree and moss are baked
 * into the colours by terrain.ts). HD adds a procedural ground texture in world space, read from what the ground is made
 * of (the aSurf / aSurf2 attributes): grass speckle and clumps with dirt patches, crop rows along each field, rock with
 * strata and cracks on steep slopes, sand ripples, a wet band lapping at every shore, snow sparkle on the peaks, scorched
 * and cracked badlands with embers, and void glitter and veins in the rift. Every layer fades out by its size on screen
 * (fwidth), so the zoomed-out map stays clean and nothing shimmers. One draw call either way.
 */

const VERTEX_PARS = /* glsl */ `
#include <common>
attribute vec4 aSurf;
attribute vec4 aSurf2;
varying vec4 vSurf;
varying vec4 vSurf2;
varying vec3 vTW;
varying vec3 vTN;`;

const VERTEX_MAIN = /* glsl */ `
#include <project_vertex>
vSurf = aSurf;
vSurf2 = aSurf2;
vTW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTN = normalize(mat3(modelMatrix) * objectNormal);`;

const FRAGMENT_PARS = /* glsl */ `
#include <common>
uniform float uTerrainTime;
varying vec4 vSurf;
varying vec4 vSurf2;
varying vec3 vTW;
varying vec3 vTN;
float tHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float tNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
/* Distance to the nearest cell edge of a jittered grid (0 on a crack) */
float tCrack(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); float d1 = 8.0; float d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + vec2(tHash(i + g), tHash(i + g + 17.3)) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
vec3 tBump(vec3 surfPos, vec3 n, vec2 dHdxy, float faceDir) {
  vec3 sx = normalize(dFdx(surfPos)); vec3 sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * faceDir;
  return normalize(abs(det) * n - sign(det) * (dHdxy.x * r1 + dHdxy.y * r2));
}`;

const FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
float tHgt = 0.0;
float tRough = 1.0;
{
  vec2 p = vTW.xz;
  float y = vTW.y;
  float t = uTerrainTime;
  // World units per pixel: each layer shows only while it is a few pixels big
  float px = max(length(fwidth(p)), 1e-4);
  float fine = smoothstep(0.085, 0.03, px);   // ~0.15 units: blades, grains, sparkles
  float mid = smoothstep(0.24, 0.08, px);     // ~0.6 units: clumps, rows, ripples, cracks
  float grass = vSurf.x, sand = vSurf.y, orc = vSurf.z, rift = vSurf.w, stone = vSurf2.x;
  float slope = 1.0 - clamp(vTN.y, 0.0, 1.0);
  vec3 col = diffuseColor.rgb;
  float above = smoothstep(${(SEA_LEVEL - 0.15).toFixed(2)}, ${(SEA_LEVEL + 0.05).toFixed(2)}, y);

  // Large patches everywhere (big enough to read at any zoom)
  float big = tNoise(p * 0.32) * 0.6 + tNoise(p * 0.85 + 7.0) * 0.4;
  col *= 0.93 + 0.14 * big;

  // Grass: bare dirt patches; up close darker clumps, speckled blades
  if (grass > 0.01) {
    float dirt = smoothstep(0.72, 0.84, tNoise(p * 0.42 + 11.0) * 0.7 + tNoise(p * 1.7 + 5.0) * 0.3 + 0.15) * 0.5;
    vec3 g = mix(col, vec3(0.42, 0.33, 0.21), dirt);
    if (mid > 0.0) {
      float clump = tNoise(p * 1.6 + 3.0);
      g *= mix(1.0, 0.86 + 0.26 * clump, mid);
      tHgt += grass * clump * mid * 0.05;
      if (fine > 0.0) {
        float blades = tNoise(p * vec2(9.0, 3.2) + tNoise(p * 1.3) * 3.0) * 0.6 + tNoise(p * 7.0) * 0.4;
        g *= mix(1.0, 0.8 + 0.42 * blades, fine);
        tHgt += grass * blades * fine * 0.04;
      }
    }
    col = mix(col, g, grass * above);
  }

  // Crop rows along each field's own direction, furrows darker, a little stubble
  float rowFade = smoothstep(0.12, 0.05, px) * vSurf2.z;
  if (rowFade > 0.01) {
    float a = vSurf2.y;
    // Rows bend gently with the lie of the land instead of running ruler-straight
    float r = dot(p, vec2(cos(a), sin(a))) / 0.36 + tNoise(p * 0.12 + 5.0) * 3.0;
    float furrow = 0.5 + 0.5 * sin(r * 6.2832 + tNoise(p * 2.0) * 0.5);
    float stubble = fine > 0.0 ? tNoise(p * 8.0) * fine : 0.0;
    col *= mix(1.0, 0.84 + 0.2 * furrow * (0.85 + 0.3 * stubble), rowFade);
    tHgt += furrow * rowFade * 0.04;
  }

  // Highland ground: gravel and pebbles everywhere, flat stones with mossy gaps only in scattered outcrops
  float s = stone * above * mid * (1.0 - grass);
  if (s > 0.01) {
    float pebbles = tNoise(p * 3.1 + 2.0) * 0.6 + tNoise(p * 7.3) * 0.4;
    col *= mix(1.0, 0.84 + 0.3 * pebbles, s);
    float outcrop = smoothstep(0.55, 0.7, tNoise(p * 0.16 + 21.0) * 0.8 + tNoise(p * 0.7) * 0.2);
    if (outcrop > 0.0) {
      float flag = smoothstep(0.0, 0.1, tCrack(p * 1.4 + tNoise(p * 0.8) * 0.8 + 13.0));
      col *= mix(1.0, 0.72 + 0.28 * flag, s * outcrop);
      col = mix(col, col * vec3(0.82, 1.04, 0.76), (1.0 - flag) * s * outcrop * 0.5);
      tHgt += flag * s * outcrop * 0.06;
    }
    if (fine > 0.0) col *= mix(1.0, 0.9 + 0.2 * tNoise(p * 12.0), stone * fine);
    tHgt += pebbles * s * 0.04;
  }

  // Rock on steep slopes: grey-brown stone; up close strata and cracks
  float rock = smoothstep(0.3, 0.55, slope) * above * (1.0 - rift);
  if (rock > 0.01) {
    vec3 rc = mix(col * 0.72, vec3(0.43, 0.41, 0.39), 0.35 + 0.35 * stone);
    rc = mix(rc, vec3(0.6, 0.33, 0.2), orc * 0.5);
    if (mid > 0.0) {
      float strata = tNoise(vec2(y * 4.0 + tNoise(p * 0.6) * 1.5, (p.x + p.y) * 0.15));
      float crack = smoothstep(0.0, 0.06, tCrack(p * 1.2 + vec2(0.0, y * 0.8)));
      rc *= mix(1.0, (0.82 + 0.3 * strata) * (0.55 + 0.45 * crack), mid);
      if (fine > 0.0) rc *= mix(1.0, 0.85 + 0.3 * tNoise(p * 9.0 + y), fine);
      tHgt += rock * mid * (strata * 0.08 + crack * 0.06);
    }
    col = mix(col, rc, rock);
    tRough = mix(tRough, 0.8, rock);
  }

  // Desert: soft windswept dune shading at any zoom; up close fine ripples in drifts (not one even pattern), grains
  float dune = sand * (1.0 - rock);
  if (dune > 0.01) {
    vec2 wd = vec2(0.8, 0.6); // the prevailing wind
    float form = tNoise(vec2(dot(p, wd) * 0.12, dot(p, vec2(-wd.y, wd.x)) * 0.35) + 3.0);
    col *= mix(1.0, 0.93 + 0.13 * form, dune);
    float near = smoothstep(0.09, 0.035, px) * dune;
    if (near > 0.01) {
      float ang = (tNoise(p * 0.04) - 0.5) * 0.8;
      vec2 dir = vec2(cos(ang) * wd.x - sin(ang) * wd.y, sin(ang) * wd.x + cos(ang) * wd.y);
      float crest = pow(0.5 + 0.5 * sin(dot(p, dir) * 19.6 + tNoise(p * 0.9) * 1.2), 2.5);
      float drift = smoothstep(0.35, 0.7, tNoise(p * 0.35 + 4.0));
      col *= mix(1.0, 0.95 + 0.08 * crest, near * drift);
      tHgt += crest * near * drift * 0.012;
    }
  }
  // Sand grains on dunes and beaches
  float grains = max(sand, vSurf2.w) * fine;
  if (grains > 0.01) col *= mix(1.0, 0.92 + 0.16 * tHash(floor(p * 14.0)), grains);

  // Every shore: wet, darker, glossier ground with a line that laps up and back with the waves
  float lap = ${(SEA_LEVEL + 0.12).toFixed(2)} + 0.07 * sin(t * 1.1 + p.x * 0.3 + p.y * 0.2);
  float wet = smoothstep(lap + 0.1, lap - 0.04, y) * (1.0 - smoothstep(0.4, 0.7, rift));
  col *= mix(1.0, 0.68, wet);
  tRough = mix(tRough, 0.35, wet);

  // Snow on the peaks: soft drifts and glittering crystals
  float snow = smoothstep(6.0, 7.0, y) * mid;
  if (snow > 0.01) {
    col *= mix(1.0, 0.93 + 0.07 * tNoise(p * 1.4), snow);
    vec2 sc = p * 9.0;
    float h = tHash(floor(sc));
    float glint = step(0.965, h) * smoothstep(0.22, 0.0, length(fract(sc) - 0.5)) * (0.5 + 0.5 * sin(t * 3.0 + h * 90.0));
    totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * glint * snow * fine * 0.6;
  }

  // Badlands: soot-black scorch marks; up close cracked mud pans with embers glowing in the burnt cracks
  if (orc > 0.01) {
    float soot = smoothstep(0.58, 0.72, tNoise(p * 0.55 + 9.0));
    col *= mix(1.0, 0.5, soot * 0.75 * orc);
    if (mid > 0.0) {
      // Cracked mud only in the dry pans, not as one even pattern over the whole land
      float pan = smoothstep(0.45, 0.62, tNoise(p * 0.21 - 3.0) * 0.75 + tNoise(p * 0.9) * 0.25) * mid;
      if (pan > 0.0) {
        float line = (1.0 - smoothstep(0.0, 0.05, tCrack(p * 1.6 + 4.0))) * pan;
        col *= mix(1.0, 0.62, line * orc * above) * mix(1.0, 1.08, pan * orc);
        float ember = line * soot * orc * above * (0.6 + 0.4 * sin(t * 1.7 + tHash(floor(p * 1.1 + 4.0)) * 6.28));
        totalEmissiveRadiance += vec3(1.0, 0.35, 0.08) * ember * 0.45;
        tHgt -= line * orc * 0.05;
      }
    }
  }

  // The rift: void glitter twinkling in the dark ground, veins of pale violet light
  if (rift * mid > 0.01) {
    float vein = (1.0 - smoothstep(0.0, 0.025, abs(tNoise(p * 0.45 + 2.0) - 0.5))) * smoothstep(0.5, 0.7, tNoise(p * 0.12 + 8.0));
    totalEmissiveRadiance += rift * vec3(0.5, 0.3, 0.95) * vein * mid * (0.18 + 0.12 * sin(t * 0.9 + p.x * 0.2));
    if (fine > 0.0) {
      vec2 gc = p * 5.0;
      float h = tHash(floor(gc));
      float glit = step(0.93, h) * smoothstep(0.2, 0.0, length(fract(gc) - 0.5)) * (0.5 + 0.5 * sin(t * (1.5 + h * 3.0) + h * 70.0));
      totalEmissiveRadiance += rift * mix(vec3(0.55, 0.3, 1.0), vec3(0.3, 0.85, 1.0), h) * glit * fine * 0.8;
      col *= mix(1.0, 0.85 + 0.25 * tNoise(p * 6.0), rift * fine);
    }
  }

  diffuseColor.rgb = col;
  // Bump: slope of the detail per world unit, so it reads the same at every zoom it is drawn at
  tHgt /= px;
}`;

const FRAGMENT_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor *= tRough;`;

const FRAGMENT_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
normal = tBump(-vViewPosition, normal, vec2(dFdx(tHgt), dFdy(tHgt)) * 0.6, faceDirection);`;

/*
 * A world disaster on the land (GAME_GUIDE §10 *World Disasters*), in both qualities: the 🌾 Great Blight browns and
 * greys the green (fields, meadows, forest floor) and the 🥀 Barren Spell drains the colour from everything. Both
 * are 0 when the realm is calm, and a mix by 0 leaves the colour exactly as it was.
 */
const DISASTER_PARS = /* glsl */ `
uniform float uBlight;
uniform float uGrey;`;

const DISASTER_COLOR = /* glsl */ `
{
  vec3 dc = diffuseColor.rgb;
  float dl = dot(dc, vec3(0.299, 0.587, 0.114));
  float green = clamp((dc.g - max(dc.r, dc.b)) * 6.0, 0.0, 1.0);
  dc = mix(dc, vec3(dl * 1.12, dl * 0.98, dl * 0.7), uBlight * (0.3 + 0.55 * green));
  dc = mix(dc, vec3(dl), uGrey * 0.7);
  diffuseColor.rgb = dc;
}`;

/** The terrain material for a graphics quality; `tick(t)` drives the HD shader's lapping shore, glints and embers, and the disaster tint */
export function terrainMaterial(hd: boolean): { material: THREE.MeshStandardMaterial; tick: (t: number) => void } {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const uniforms = { uTerrainTime: { value: 0 }, uBlight: { value: 0 }, uGrey: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (!hd) {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>${DISASTER_PARS}`)
        .replace("#include <color_fragment>", `#include <color_fragment>${DISASTER_COLOR}`);
      return;
    }
    shader.vertexShader = shader.vertexShader.replace("#include <common>", VERTEX_PARS).replace("#include <project_vertex>", VERTEX_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `${FRAGMENT_PARS}${DISASTER_PARS}`)
      .replace("#include <color_fragment>", `${FRAGMENT_COLOR}${DISASTER_COLOR}`)
      .replace("#include <roughnessmap_fragment>", FRAGMENT_ROUGH)
      .replace("#include <normal_fragment_maps>", FRAGMENT_NORMAL);
  };
  material.customProgramCacheKey = () => (hd ? "terrain-hd" : "terrain-normal");
  return {
    material,
    tick: (t) => {
      uniforms.uTerrainTime.value = t;
      uniforms.uBlight.value = skyWeather.disaster.blight;
      uniforms.uGrey.value = skyWeather.disaster.barren;
    }
  };
}
