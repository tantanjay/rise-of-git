import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RIVER_FROM_Z, SEA_LEVEL, Terrain, WORLD_SIZE, riverX } from "./terrain";
import { PROVINCE_OFFSET, WORLD_SCALE } from "@/utils/worldGeometry";

/** Valoria's river centre line in GLSL (p.y is world z): the same curve as `riverX` */
const RIVER_GLSL = `${(-PROVINCE_OFFSET).toFixed(3)} + sin(p.y * ${(0.12 / WORLD_SCALE).toFixed(5)}) * ${(4 * WORLD_SCALE).toFixed(4)}`;

/*
 * The world's water, alive: one plane, one draw call. A depth map baked from the terrain lets the shader tint shallows
 * turquoise and deeps blue, roll foam waves onto every shore, run a current down Valoria's river (streaks flowing
 * south along its bed) and scatter twinkling glints, all from one time uniform. Lighting stays MeshStandardMaterial's.
 *
 * HD adds a moving surface: waves drawn as per-pixel normals in world space (a long swell out at sea, choppier in the
 * fjord, ripples running with the river's current), so the sun glints across them and the sky shows in them more at
 * grazing angles (fresnel). The shallows turn clear enough to see the seabed, foam breaks up into lace round every
 * shore and islet, white water runs where the river is shallow, and the river's silt fans out into the sea at its mouth.
 * Every wave layer fades out by its size on screen (fwidth), so the zoomed-out map stays calm and never shimmers.
 */

const DEPTH_RES = 196;
/** Depth (sea level − ground) that maps to 1 in the depth map */
const DEPTH_SCALE = 3;

/** The depth samples per terrain: the map's terrain is cached across city visits, so its ~38,000 samples are taken once */
const depthData = new WeakMap<Terrain, Uint8Array>();

function depthTexture(terrain: Terrain): THREE.DataTexture {
  let data = depthData.get(terrain);
  if (!data) {
    data = new Uint8Array(DEPTH_RES * DEPTH_RES * 4);
    for (let j = 0; j < DEPTH_RES; j++) {
      for (let i = 0; i < DEPTH_RES; i++) {
        const x = (i / (DEPTH_RES - 1) - 0.5) * WORLD_SIZE;
        const z = (j / (DEPTH_RES - 1) - 0.5) * WORLD_SIZE;
        const d = Math.min(1, Math.max(0, (SEA_LEVEL - terrain.height(x, z)) / DEPTH_SCALE));
        data[(j * DEPTH_RES + i) * 4] = Math.round(d * 255);
        data[(j * DEPTH_RES + i) * 4 + 3] = 255;
      }
    }
    depthData.set(terrain, data);
  }
  const tex = new THREE.DataTexture(data, DEPTH_RES, DEPTH_RES, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Where Valoria's river reaches the sea: the first point down its course with open water on both banks */
function riverMouth(terrain: Terrain): number {
  for (let z = RIVER_FROM_Z + 10; z < WORLD_SIZE / 2; z += 0.5) {
    const x = riverX(z);
    if (terrain.height(x - 3.5, z) < SEA_LEVEL && terrain.height(x + 3.5, z) < SEA_LEVEL) return z;
  }
  return WORLD_SIZE / 2;
}

const VERTEX_HEAD = `
varying vec3 vWaterPos;
void main() {`;
const VERTEX_WORLD = `
#include <project_vertex>
vWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

const FRAGMENT_HEAD = `
uniform float uWaterTime;
uniform sampler2D uDepth;
uniform float uSize;
uniform float uRiverFrom;
uniform float uMouth;
uniform vec3 uSky;
varying vec3 vWaterPos;
float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {`;

const FRAGMENT_COLOR = `
#include <color_fragment>
{
  vec2 p = vWaterPos.xz;
  float t = uWaterTime;
  float depth = texture2D(uDepth, p / uSize + 0.5).r;
  // Shallows turquoise, deeps blue
  vec3 col = mix(vec3(0.17, 0.62, 0.70), vec3(0.06, 0.29, 0.55), smoothstep(0.02, 0.55, depth));
  // Drifting ripples
  float rip = sin(p.x * 0.9 + t * 1.1 + sin(p.y * 0.6 + t * 0.7) * 1.5) * sin(p.y * 0.8 - t * 0.9 + sin(p.x * 0.4) * 1.2);
  col += 0.035 * rip;
  // Foam waves rolling onto the shore
  float shore = 1.0 - smoothstep(0.0, 0.14, depth);
  float wave = smoothstep(0.55, 1.0, sin(depth * 70.0 - t * 2.2 + sin(p.x * 0.3 + p.y * 0.2) * 2.0));
  col = mix(col, vec3(0.93, 0.98, 1.0), shore * (0.25 + 0.55 * wave) * step(0.004, depth));
  // Valoria's river: a current of streaks flowing south along its bed
  float riverX = ${RIVER_GLSL};
  float inRiver = smoothstep(2.2, 0.9, abs(p.x - riverX)) * smoothstep(uRiverFrom, uRiverFrom + 5.0, p.y);
  float lane = floor((p.x - riverX) * 2.5);
  float flow = sin((p.y - t * 2.4) * 1.6 + waterHash(vec2(lane, 1.0)) * 6.28);
  col = mix(col, vec3(0.24, 0.68, 0.80), inRiver * 0.5);
  col += inRiver * smoothstep(0.86, 1.0, flow) * 0.32;
  // Twinkling glints
  vec2 cell = floor(p * 1.3);
  float g = waterHash(cell);
  float tw = smoothstep(0.92, 1.0, sin(t * (1.5 + g * 2.0) + g * 40.0)) * step(0.82, g);
  tw *= smoothstep(0.16, 0.04, length(fract(p * 1.3) - 0.5)); // a small round sparkle, not the whole cell
  col += tw * 0.45 * (1.0 - shore);
  diffuseColor.rgb = col;
}`;

/* ------------------------------------------------------------------------- */
/* HD                                                                        */
/* ------------------------------------------------------------------------- */

const FRAGMENT_HEAD_HD = `${FRAGMENT_HEAD.replace("void main() {", "")}
float wHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
/* Value noise and its gradient (x: value, yz: d/dp) */
vec3 wNoised(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f); vec2 du = 6.0 * f * (1.0 - f);
  float a = wHash(i); float b = wHash(i + vec2(1.0, 0.0)); float c = wHash(i + vec2(0.0, 1.0)); float d = wHash(i + vec2(1.0, 1.0));
  float k1 = b - a; float k2 = c - a; float k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
/* Distance to the nearest cell edge of a drifting jittered grid (0 on an edge): foam lace */
float wLace(vec2 p, float t) {
  vec2 i = floor(p); vec2 f = fract(p); float d1 = 8.0; float d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 gc = vec2(float(x), float(y));
    vec2 h = vec2(wHash(i + gc), wHash(i + gc + 17.3));
    vec2 r = gc + 0.5 + 0.4 * sin(t * 0.7 + h * 6.2832) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(max(d2, 0.0)) - sqrt(max(d1, 0.0));
}
/* One travelling swell: adds its slope to grad and its height to h */
void wSwell(vec2 p, vec2 dir, float len, float amp, float t, float ph, inout vec2 grad, inout float h) {
  float k = 6.2832 / len;
  float a = k * dot(dir, p) - sqrt(9.8 * k) * 0.45 * t + ph;
  h += amp * sin(a);
  grad += amp * k * dir * cos(a);
}
void main() {`;

const FRAGMENT_COLOR_HD = `
#include <color_fragment>
vec3 wN = vec3(0.0, 1.0, 0.0);
float wRough = 1.0;
{
  vec2 p = vWaterPos.xz;
  float t = uWaterTime;
  float depth = texture2D(uDepth, p / uSize + 0.5).r;
  // World units per pixel: each wave layer shows only while it is a few pixels big
  float px = max(length(fwidth(p)), 1e-4);
  float mid = smoothstep(0.3, 0.1, px);

  // Valoria's river, and its silt fanning out past the mouth
  float riverX = ${RIVER_GLSL};
  float across = p.x - riverX;
  float past = max(p.y - uMouth, 0.0);
  // Past the mouth the fresh water fans out and wanders, fading into the sea
  float wander = past > 0.0 ? (wNoised(p * 0.18 + vec2(0.0, -t * 0.05)).x - 0.5) * past * 0.5 : 0.0;
  float width = 2.2 + past * 0.3;
  float inRiver = smoothstep(width, width * 0.3, abs(across + wander)) * smoothstep(uRiverFrom, uRiverFrom + 5.0, p.y);
  float plume = inRiver * smoothstep(0.0, 2.0, past) * (1.0 - smoothstep(3.0, 11.0, past));
  if (plume > 0.0) plume *= 0.5 + 0.5 * wNoised(p * 0.5 + vec2(0.0, -t * 0.3)).x;
  float river = inRiver * (1.0 - smoothstep(0.0, 3.0, past));

  // The sea's surface: a long swell rolling in from the open ocean (calmer in the shallows), wind chop over it,
  // choppier in the northern fjord
  float open = smoothstep(0.04, 0.5, depth);
  float fjord = 1.0 - smoothstep(6.0, 16.0, length((p - vec2(0.0, -57.0)) * vec2(1.0, 0.6)));
  vec2 grad = vec2(0.0);
  float crest = 0.0;
  float swell = mix(0.35, 1.0, open);
  wSwell(p, vec2(0.80, 0.60), 13.0, 0.10 * swell, t, 0.0, grad, crest);
  wSwell(p, vec2(0.28, 0.96), 8.5, 0.06 * swell, t, 1.7, grad, crest);
  wSwell(p, vec2(-0.62, 0.78), 6.1, 0.04 * swell, t, 4.1, grad, crest);
  wSwell(p, vec2(0.96, -0.28), 4.3, 0.025 * swell, t, 2.3, grad, crest);
  float chop = mid * (0.55 + 0.45 * open + 0.8 * fjord);
  if (chop > 0.0) {
    vec3 n1 = wNoised(p * 1.3 + vec2(t * 0.34, t * 0.2));
    vec3 n2 = wNoised(mat2(0.8, -0.6, 0.6, 0.8) * p * 2.9 - vec2(t * 0.27, -t * 0.4));
    grad += (n1.yz * 1.3 * 0.075 + n2.yz * 2.9 * 0.035) * chop;
  }
  // The river: ripples stretched along the current, running south with it, faster in the middle
  if (river > 0.01) {
    float speed = 1.6 * (1.0 - 0.5 * smoothstep(0.4, 1.0, abs(across) / 2.2));
    vec3 r1 = wNoised(vec2(across * 2.6, (p.y - t * speed) * 0.9));
    vec3 r2 = wNoised(vec2(across * 4.1 + 7.0, (p.y - t * speed * 1.4) * 1.7));
    vec2 rg = vec2(r1.y * 2.6, r1.z * 0.9) * 0.07 + vec2(r2.y * 4.1, r2.z * 1.7) * 0.03 * mid;
    grad = mix(grad, rg * mid + grad * 0.2, river);
  }
  wN = normalize(vec3(-grad.x, 1.0, -grad.y));

  // Colour by depth; the shallows warmer where sunlit sand shows through
  vec3 col = mix(vec3(0.16, 0.6, 0.64), vec3(0.04, 0.24, 0.48), smoothstep(0.02, 0.6, depth));
  col = mix(col, vec3(0.32, 0.62, 0.55), (1.0 - smoothstep(0.0, 0.12, depth)) * 0.5);
  col *= 1.0 + 0.6 * clamp(crest, -0.15, 0.15); // crests a touch lighter, troughs darker
  col = mix(col, vec3(0.2, 0.55, 0.66), river * 0.4);
  col = mix(col, vec3(0.36, 0.55, 0.46), plume * 0.3);

  // Foam: breakers rolling onto every shore and islet, broken into patches; lace up close
  float shore = 1.0 - smoothstep(0.0, 0.14, depth);
  float surf = 1.0 - smoothstep(0.0, 0.09, depth);
  float breaker = smoothstep(0.6, 1.0, sin(depth * 70.0 - t * 2.2 + sin(p.x * 0.3 + p.y * 0.2) * 2.0));
  float patches = surf > 0.0 ? smoothstep(0.25, 0.65, wNoised(p * 0.6 + vec2(t * 0.08, 0.0)).x) : 0.0;
  float foam = surf * surf * (0.18 + 0.7 * breaker * mix(1.0, patches, 0.5));
  foam = max(foam, smoothstep(0.035, 0.0, depth) * 0.85); // the wet edge itself
  // Lace on the shore's foam, only where there is foam: the lace is the costliest layer
  if (mid > 0.0 && foam > 0.01) {
    float lace = 1.0 - smoothstep(0.02, 0.14, wLace(p * 2.6, t));
    foam *= mix(1.0, 0.3 + 0.9 * lace, mid * smoothstep(0.0, 0.25, foam) * (1.0 - river));
  }
  // The river: soft streaks of foam drawn out along the current (no lanes or cells, so nothing reads as tiles), white
  // water where it runs shallowest, both thinning out as it spreads into the sea
  if (river > 0.0) {
    float streak = smoothstep(0.6, 0.9, wNoised(vec2(across * 3.2, (p.y - t * 2.2) * 0.45)).x);
    float rapids = (1.0 - smoothstep(0.03, 0.1, depth)) * smoothstep(0.35, 0.8, wNoised(vec2(across * 2.4, (p.y - t * 2.0) * 0.8)).x);
    foam = max(foam, river * (streak * 0.22 + rapids * 0.5));
  }
  foam = clamp(foam, 0.0, 1.0) * step(0.004, depth);
  col = mix(col, vec3(0.92, 0.97, 1.0), foam);

  // The sky in the water, strongest at grazing angles (fresnel)
  vec3 view = normalize(cameraPosition - vWaterPos);
  float ndv = clamp(dot(wN, view), 0.0, 1.0);
  float fres = 0.04 + 0.6 * pow(max(1.0 - ndv, 0.0), 3.0);
  fres *= 1.0 - foam;
  col *= 1.0 - fres * 0.5;
  totalEmissiveRadiance += uSky * fres * 0.55;

  // A few glints twinkle far out, where the waves are too small to catch the sun on their own (none up close)
  if (mid < 1.0) {
    vec2 cell = floor(p * 1.3);
    float g = wHash(cell);
    float tw = smoothstep(0.92, 1.0, sin(t * (1.5 + g * 2.0) + g * 40.0)) * step(0.85, g);
    tw *= smoothstep(0.16, 0.04, length(fract(p * 1.3) - 0.5));
    col += tw * 0.3 * (1.0 - shore) * (1.0 - mid);
  }

  diffuseColor.rgb = col;
  // Clear in the shallows (the seabed shows), deeper water and grazing views turn opaque
  float alpha = mix(0.55, 0.9, smoothstep(0.02, 0.45, depth));
  alpha = mix(alpha, 0.97, fres);
  alpha = max(alpha, river * 0.86); // a river runs too fast and stirred-up to see its bed
  diffuseColor.a = max(alpha, foam);
  // Glossy water up close; far away a little rougher so the waves' glints never sparkle
  wRough = mix(1.0, 3.5, smoothstep(0.04, 0.22, px)) * (1.0 + foam * 5.0);
}`;

const FRAGMENT_ROUGH_HD = `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * wRough, 0.04, 1.0);`;

const FRAGMENT_NORMAL_HD = `
#include <normal_fragment_maps>
normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`;

export function Water({ terrain, hd = false }: { terrain: Terrain; hd?: boolean }) {
  const depth = useMemo(() => depthTexture(terrain), [terrain]);
  const mouth = useMemo(() => riverMouth(terrain), [terrain]);
  const material = useMemo(() => {
    const m = hd
      ? new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 1, roughness: 0.17, metalness: 0.1 })
      : new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.84, roughness: 0.15, metalness: 0.25 });
    const uniforms = {
      uWaterTime: { value: 0 },
      uDepth: { value: depth },
      uSize: { value: WORLD_SIZE },
      uRiverFrom: { value: RIVER_FROM_Z },
      uMouth: { value: mouth },
      uSky: { value: new THREE.Color("#9cc8ee") }
    };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace("void main() {", VERTEX_HEAD).replace("#include <project_vertex>", VERTEX_WORLD);
      if (hd) {
        shader.fragmentShader = shader.fragmentShader
          .replace("void main() {", FRAGMENT_HEAD_HD)
          .replace("#include <color_fragment>", FRAGMENT_COLOR_HD)
          .replace("#include <roughnessmap_fragment>", FRAGMENT_ROUGH_HD)
          .replace("#include <normal_fragment_maps>", FRAGMENT_NORMAL_HD);
      } else {
        shader.fragmentShader = shader.fragmentShader.replace("void main() {", FRAGMENT_HEAD).replace("#include <color_fragment>", FRAGMENT_COLOR);
      }
    };
    m.customProgramCacheKey = () => (hd ? "living-water-hd" : "living-water");
    m.userData.uniforms = uniforms;
    return m;
  }, [depth, mouth, hd]);
  useEffect(
    () => () => {
      material.dispose();
    },
    [material]
  );
  useEffect(() => () => depth.dispose(), [depth]);
  useFrame(({ clock, scene }) => {
    const u = material.userData.uniforms;
    u.uWaterTime.value = clock.elapsedTime;
    // The sky the water reflects follows the hour (RealmSky sets the background)
    if (hd && scene.background instanceof THREE.Color) u.uSky.value.copy(scene.background);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_LEVEL, 0]} receiveShadow material={material}>
      <planeGeometry args={[WORLD_SIZE + 2, WORLD_SIZE + 2]} />
    </mesh>
  );
}
