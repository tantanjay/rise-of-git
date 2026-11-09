import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rngFor } from "@/utils/random";

/*
 * 🎉 Festival fireworks (GAME_GUIDE §13), shared by the world map and the city: rockets climb from a kingdom and burst
 * over it, a few shells in the air at once. Every spark is one instance of a single quad, and its whole life (rise,
 * burst, fall, fade) is worked out in the vertex shader from one clock, so any number of festivals costs one draw call
 * and no per-frame CPU work. Each site is seeded from its id (same shells for every viewer, never two in step).
 *
 * Normal: round sparks bursting in a sphere. HD: more sparks, each a streak stretched along its flight, a rocket trail,
 * ring and willow shells beside the round ones, and a crackle as the sparks die.
 */

export interface FireworkSite {
  id: string;
  /** Where the rockets leave from (ground) */
  x: number;
  y: number;
  z: number;
  /** World scale of the shells (radius, spark size and rise all grow with it) */
  scale: number;
  /** Burst height above y, in scale units (default 6) */
  height?: number;
}

/** Shells in flight per site at once, and sparks per shell */
const SHELLS = 3;
const SPARKS = { normal: 36, hd: 64 } as const;

/** Festive colours: gold, rose, sky, lime, violet, white */
const PALETTE = ["#fcd34d", "#fb7185", "#7dd3fc", "#bef264", "#c4b5fd", "#fff7ed"].map((c) => new THREE.Color(c));

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uHd;
  uniform float uSparks;
  uniform vec3 uPal[6];
  attribute vec4 aSite;   // x, y, z, scale
  attribute vec4 aSpark;  // shell slot, spark fraction 0..1, height, site seed
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vAlpha;

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  void main() {
    vUv = position.xy + 0.5;
    float seed = aSpark.w;
    float slot = aSpark.x;
    float sc = aSite.w;
    // Each slot fires one shell after another; a new shell gets a fresh launch spot, colour and kind
    float period = 3.4 + 1.8 * hash(seed + slot * 7.3);
    float tt = uTime + hash(seed * 3.1 + slot) * period;
    float cycle = floor(tt / period);
    float u = fract(tt / period);
    float shell = seed * 13.7 + slot * 31.1 + cycle * 7.77;
    vec3 launch = aSite.xyz + vec3((hash(shell) - 0.5) * 2.4, 0.0, (hash(shell + 1.3) - 0.5) * 2.4) * sc;
    vec3 top = launch + vec3((hash(shell + 2.1) - 0.5) * 1.6 * sc, aSpark.z * sc * (0.85 + 0.3 * hash(shell + 4.2)), (hash(shell + 3.7) - 0.5) * 1.6 * sc);
    // Shell kind: 0 sphere, 1 ring, 2 willow (HD only)
    float kind = uHd > 0.5 ? floor(hash(shell + 5.9) * 3.0) : 0.0;
    vec3 col = uPal[int(mod(floor(hash(shell + 6.6) * 6.0), 6.0))];
    if (kind > 1.5) col = mix(uPal[0], vec3(1.0, 0.75, 0.35), 0.5);

    float f = aSpark.y;
    float rise = 0.26;
    vec3 pos;
    vec3 vel;
    float size;
    float alpha;
    if (u < rise) {
      // The rocket climbs (easing out); in HD the first sparks trail behind it as its tail
      float k = u / rise;
      float idx = floor(f * uSparks + 0.5);
      float trail = idx < (uHd > 0.5 ? 8.0 : 1.0) ? idx : 99.0;
      float kt = max(k - trail * 0.012, 0.0);
      float e = 1.0 - (1.0 - kt) * (1.0 - kt);
      pos = mix(launch, top, e);
      vel = (top - launch) * (1.0 - kt);
      size = 0.22 * sc * (1.0 - trail * 0.1);
      alpha = trail > 8.0 ? 0.0 : (1.0 - trail * 0.12) * smoothstep(0.0, 0.08, k);
      col = vec3(1.0, 0.85, 0.6);
    } else {
      float k = (u - rise) / (1.0 - rise);
      // Spark direction: a seeded spread over the sphere (a flat band for a ring)
      float a = f * 6.2831853 * 1.618034 * 9.0 + hash(shell + f * 91.0) * 0.4;
      float cy = kind > 0.5 && kind < 1.5 ? (hash(shell + f * 17.0) - 0.5) * 0.18 : 1.0 - 2.0 * fract(f * 0.618034 * 13.0 + hash(shell) * 0.3);
      float r = sqrt(max(1.0 - cy * cy, 0.0));
      vec3 dir = vec3(cos(a) * r, cy, sin(a) * r);
      if (kind > 0.5 && kind < 1.5) {
        // Rings burst tilted, each its own way
        float tx = (hash(shell + 8.1) - 0.5) * 1.4;
        dir = vec3(dir.x, dir.y * cos(tx) - dir.z * sin(tx), dir.y * sin(tx) + dir.z * cos(tx));
      }
      float radius = (kind > 1.5 ? 2.2 : 2.8) * sc * (0.85 + 0.3 * hash(shell + 9.4));
      float out1 = 1.0 - pow(max(1.0 - k, 0.0), 3.0);
      float drop = (kind > 1.5 ? 3.2 : 1.4) * sc * k * k;
      pos = top + dir * radius * out1 - vec3(0.0, drop, 0.0);
      vel = dir * radius * 3.0 * (1.0 - k) * (1.0 - k) - vec3(0.0, 2.0 * drop, 0.0);
      size = 0.3 * sc * (1.0 - 0.55 * k);
      alpha = pow(max(1.0 - k, 0.0), kind > 1.5 ? 0.9 : 1.6);
      // HD: the dying sparks crackle
      if (uHd > 0.5 && k > 0.55) alpha *= 0.55 + 0.45 * step(0.5, hash(floor(uTime * 14.0) + f * 53.0 + shell));
      col = mix(col, vec3(1.0), 0.25 * (1.0 - k));
    }

    vec4 mv = viewMatrix * vec4(pos, 1.0);
    // HD sparks are streaks laid along their flight on screen; Normal ones are round
    vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
    float speed = length(vv.xy);
    vec2 ax = speed > 0.0001 ? vv.xy / speed : vec2(0.0, 1.0);
    // (side, ax) keeps the quad's winding: it faces the camera whichever way the spark flies
    vec2 side = vec2(ax.y, -ax.x);
    // A climbing rocket stays a short spark, never a pillar of light
    float stretch = uHd > 0.5 ? 1.0 + min(speed * 0.3 / max(sc, 0.0001), u < rise ? 0.6 : 3.0) : 1.0;
    // Streaks are thinner than they are long
    float thin = uHd > 0.5 && u >= rise ? 0.6 : 1.0;
    mv.xy += side * position.x * size * thin + ax * position.y * size * stretch;
    gl_Position = projectionMatrix * mv;
    vCol = col;
    vAlpha = alpha;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vAlpha;
  void main() {
    vec2 d = vUv * 2.0 - 1.0;
    float r2 = dot(d, d);
    float glow = 0.75 * exp(-r2 * 3.2) + 0.8 * exp(-r2 * 20.0);
    float a = glow * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol * a, a);
  }
`;

/** Fireworks over every kingdom holding a Festival (one draw call for all of them) */
export function Fireworks({ sites, hd = false }: { sites: FireworkSite[]; hd?: boolean }) {
  const sparks = hd ? SPARKS.hd : SPARKS.normal;
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uTime: { value: 0 }, uHd: { value: 0 }, uSparks: { value: SPARKS.normal }, uPal: { value: PALETTE } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        // Premultiplied additive: sparks brighten what is behind them
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor
      }),
    []
  );
  material.uniforms.uHd.value = hd ? 1 : 0;
  material.uniforms.uSparks.value = sparks;

  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    const n = sites.length * SHELLS * sparks;
    const site = new Float32Array(n * 4);
    const spark = new Float32Array(n * 4);
    let i = 0;
    for (const s of sites) {
      const seed = rngFor(`fireworks:${s.id}`)() * 100;
      for (let slot = 0; slot < SHELLS; slot++) {
        for (let k = 0; k < sparks; k++, i++) {
          site.set([s.x, s.y, s.z, s.scale], i * 4);
          spark.set([slot, k / sparks, s.height ?? 6, seed], i * 4);
        }
      }
    }
    g.setAttribute("aSite", new THREE.InstancedBufferAttribute(site, 4));
    g.setAttribute("aSpark", new THREE.InstancedBufferAttribute(spark, 4));
    g.instanceCount = n;
    quad.dispose();
    return g;
  }, [sites, sparks]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  if (!sites.length) return null;
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}
