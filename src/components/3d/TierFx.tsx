import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { NPCRarity } from "@/types";
import { mulberry32, hashString } from "@/utils/random";
import { useHd } from "@/utils/graphics";

/*
 * The shared rarity effect kit (docs/MODEL_STYLE.md "Visual rarity ladder"). One list of shining things in, at most three draw
 * calls out, however many there are:
 *   rare      — a few glints twinkling round it
 *   epic      — a low, faint curtain of light round it and motes orbiting it
 *   legendary — (two steps above epic) a tall bright curtain of rising light round it, a beam of light, rising
 *               embers and orbiting motes
 *   mythical  — the legendary kit in crimson with a prismatic shimmer, a crimson beam, twice the embers, orbiting shards
 * The curtain stands round the structure (like the column over a reviving boss), never as a disc on the ground, and only
 * where it makes sense: creatures (`shell: false`) get the particles and beam alone.
 * All motion runs in shaders from one clock, each item with its own seeded phase and tempo so no two shine in step.
 * Nothing casts shadows or takes the pointer. Particles shrink with distance, so far away only the curtain and beam read.
 * In HD graphics the same three draws switch to richer shaders (an `HD` define): the curtain becomes flowing ribbons of
 * light with sparks, the beam a soft volumetric column with a hot core, the particles round glowing motes.
 */

// Value noise that wraps round a cylinder (period cells on x), for the HD curtain and beam
const HD_NOISE = `
  float fxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fxNoise(vec2 p, float period) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    float a = fxHash(vec2(mod(i.x, period), i.y)); float b = fxHash(vec2(mod(i.x + 1.0, period), i.y));
    float c = fxHash(vec2(mod(i.x, period), i.y + 1.0)); float d = fxHash(vec2(mod(i.x + 1.0, period), i.y + 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fxFbm(vec2 p, float period) {
    return fxNoise(p, period) * 0.55 + fxNoise(p * 2.0, period * 2.0) * 0.3 + fxNoise(p * 4.0, period * 4.0) * 0.15;
  }`;

export type FxTier = "rare" | "epic" | "legendary" | "mythical";

export interface TierFxItem {
  /** Seeds the item's phase and tempo */
  id: string;
  /** Ground point */
  x: number;
  y: number;
  z: number;
  /** Radius of the thing it surrounds */
  size: number;
  tier: FxTier;
  /** Main colour (aura, beam, embers); defaults per tier */
  color?: string;
  /** Second colour (sigil, motes); defaults per tier */
  accent?: string;
  /** Beam height (legendary and up); default 5× size; 0 for none (building plots: no pillars in a city) */
  beam?: number;
  /** Lift for things standing in water or on a plinth (curtain base above y) */
  lift?: number;
  /** Curtain of light round it (default true; creatures go without) */
  shell?: boolean;
  /** Curtain height; default by tier from size */
  height?: number;
}

const TIER_COLORS: Record<FxTier, [string, string]> = {
  rare: ["#93c5fd", "#e0f2fe"],
  epic: ["#a855f7", "#e9d5ff"],
  legendary: ["#f59e0b", "#fde68a"],
  mythical: ["#dc2626", "#f0abfc"]
};

const FX_RANK: Record<string, number> = { rare: 1, epic: 2, legendary: 3, mythical: 4 };

/** The kit's tier for a rarity: common and uncommon get none */
export const fxTierOf = (rarity: NPCRarity | string | undefined): FxTier | null =>
  rarity && FX_RANK[rarity] ? (rarity as FxTier) : null;

const shared = { value: 0 };

/* ------------------------------ curtain of light ------------------------------ */

/** Unit open cylinder standing on y = 0 (radius 1, height 1), scaled per item */
const SHELL = new THREE.CylinderGeometry(1, 1.06, 1, 40, 1, true).translate(0, 0.5, 0);

const AURA_VERTEX = `
  attribute vec4 aFx; attribute vec3 aAccent; attribute vec3 aTint;
  varying vec2 vUv; varying vec4 vFx; varying vec3 vColor; varying vec3 vAccent; varying float vFacing;
  void main() {
    vUv = uv; vFx = aFx; vColor = aTint; vAccent = aAccent;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vFacing = abs(dot(normalize(normalMatrix * mat3(instanceMatrix) * normal), normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;

const AURA_FRAGMENT = `
  uniform float uTime;
  varying vec2 vUv; varying vec4 vFx; varying vec3 vColor; varying vec3 vAccent; varying float vFacing;
  vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
  ${HD_NOISE}
  void main() {
    float t = uTime * vFx.y + vFx.x;
    float tier = vFx.z;
    float y = clamp(vUv.y, 0.0, 1.0); // MSAA shades a hair past the mesh: keep uv in range (a rim of exp(-y * k) flashes)
  #ifdef HD
    // Ribbons of light rising and swaying, sparks racing up them (legendary and up), a bright hem at the foot;
    // brighter at the curtain's sides so it reads as a ring
    float sway = fxNoise(vec2(vUv.x * 12.0, t * 0.35), 12.0) * 1.4;
    float ribbons = pow(fxFbm(vec2(vUv.x * 36.0 + sway, y * 1.6 - t * 0.55), 36.0), 2.2) * 2.4;
    float sparks = pow(fxNoise(vec2(vUv.x * 90.0, y * 9.0 - t * 2.4), 90.0), 14.0) * 3.0 * step(2.5, tier);
    float riseHd = pow(max(1.0 - y, 0.0), 2.0) * smoothstep(0.0, 0.04, y);
    float hem = exp(-y * 22.0) * 0.6;
    float side = mix(0.5, 1.0, 1.0 - vFacing);
    vec3 colHd = mix(vColor, vAccent, ribbons * 0.35);
    if (tier > 3.5) colHd = mix(colHd, hue(vUv.x * 3.0 + y * 0.4 + t * 0.06), clamp(sparks, 0.0, 1.0) * 0.6 + 0.15);
    gl_FragColor = vec4(colHd * (ribbons * riseHd + hem + sparks * riseHd) * side * 1.1 * vFx.w, 1.0);
    return;
  #endif
    // Brightest at the foot, fading out as it rises
    float fade = pow(max(1.0 - y, 0.0), 1.8) * smoothstep(0.0, 0.05, y);
    // Bands of light rising, and slow vertical streaks drifting round
    float rise = 0.55 + 0.45 * sin(y * 16.0 - t * 2.2 + sin(vUv.x * 25.13 + t * 0.6) * 0.8);
    float streak = 0.45 + 0.55 * pow(abs(sin(vUv.x * 3.14159 * 9.0 + t * 0.35)), 4.0);
    float pulse = 0.8 + 0.2 * sin(t * 1.7);
    vec3 col = mix(vColor, vAccent, smoothstep(0.35, 0.0, y) * 0.35);
    if (tier > 3.5) col = mix(col, hue(vUv.x + y * 0.4 + t * 0.06), 0.3 * (1.0 - y)); // prismatic shimmer
    gl_FragColor = vec4(col * fade * rise * streak * pulse * 1.15 * vFx.w, 1.0);
  }`;

/* ------------------------------------- beam ------------------------------------- */

const COLUMN = new THREE.CylinderGeometry(1, 1.25, 1, 20, 1, true).translate(0, 0.5, 0);

const BEAM_VERTEX = `
  attribute vec4 aFx; attribute vec3 aTint;
  varying vec2 vUv; varying vec4 vFx; varying vec3 vColor; varying float vFacing;
  void main() {
    vUv = uv; vFx = aFx; vColor = aTint;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vFacing = abs(dot(normalize(normalMatrix * mat3(instanceMatrix) * normal), normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;

const BEAM_FRAGMENT = `
  uniform float uTime;
  varying vec2 vUv; varying vec4 vFx; varying vec3 vColor; varying float vFacing;
  ${HD_NOISE}
  void main() {
    float t = uTime * vFx.y + vFx.x;
    float fade = pow(max(1.0 - vUv.y, 0.0), 1.5) * smoothstep(0.0, 0.06, vUv.y);
  #ifdef HD
    // A soft volumetric column: light flowing up it, brightest through its middle, with a white-hot heart
    // (and a prismatic edge for mythic)
    float flow = fxFbm(vec2(vUv.x * 10.0, vUv.y * 14.0 - t * 1.6), 10.0);
    float streakHd = fxFbm(vec2(vUv.x * 24.0, vUv.y * 3.0 - t * 0.9), 24.0);
    float body = pow(max(vFacing, 0.0), 2.6);
    float heart = pow(max(vFacing, 0.0), 9.0);
    vec3 colHd = mix(vColor, vec3(1.0, 0.92, 0.88), heart * 0.7);
    if (vFx.z > 3.5) colHd = mix(colHd, 0.55 + 0.45 * cos(6.28318 * (vUv.x * 2.0 + vUv.y - t * 0.12 + vec3(0.0, 0.33, 0.67))), (1.0 - smoothstep(0.15, 0.6, vFacing)) * 0.6);
    gl_FragColor = vec4(colHd * body * (0.4 + flow * 0.8 + pow(streakHd, 3.0) * 0.9) * fade * 0.85, 1.0);
    return;
  #endif
    float bands = 0.5 + 0.5 * sin(vUv.y * 22.0 - t * 2.6 + sin(vUv.x * 18.85 + t) * 1.2);
    float edge = 0.4 + 0.6 * pow(abs(sin(vUv.x * 3.14159 * 5.0 + t * 0.5)), 3.0);
    gl_FragColor = vec4(vColor * fade * (0.35 + 0.65 * bands) * edge * 0.5, 1.0);
  }`;

/* ---------------------------------- particles ---------------------------------- */

// Modes: 0 rising ember, 1 orbiting mote, 2 twinkling glint
const POINTS_VERTEX = `
  uniform float uTime;
  attribute vec4 aSeed; attribute vec4 aShape; attribute vec3 aColor;
  varying float vAlpha; varying vec3 vColor;
  void main() {
    float t = uTime * aShape.y;
    float mode = aShape.x;
    float r = aShape.z;
    vec3 p = position;
    float alpha = 1.0;
    float size = aShape.w;
    if (mode < 0.5) {
      float life = fract(t * 0.2 + aSeed.x);
      float ang = aSeed.y * 6.2832 + life * 2.2;
      float rr = r * aSeed.z * (1.0 + life * 0.3);
      p += vec3(cos(ang) * rr, life * aSeed.w, sin(ang) * rr);
      alpha = sin(life * 3.14159);
    } else if (mode < 1.5) {
      float ang = aSeed.y * 6.2832 + t * (0.5 + aSeed.z * 0.4) * (aSeed.x < 0.5 ? -1.0 : 1.0);
      float rr = r * (0.75 + aSeed.z * 0.35);
      p += vec3(cos(ang) * rr, aSeed.w + sin(t * 1.3 + aSeed.y * 9.0) * r * 0.12, sin(ang) * rr);
      alpha = 0.75 + 0.25 * sin(t * 3.0 + aSeed.x * 20.0);
    } else {
      float w = fract(t * 0.35 + aSeed.x);
      float ang = aSeed.y * 6.2832 + floor(t * 0.35 + aSeed.x) * 2.4;
      float rr = r * (0.4 + aSeed.z * 0.6);
      p += vec3(cos(ang) * rr, aSeed.w * (0.3 + aSeed.z * 0.7), sin(ang) * rr);
      alpha = smoothstep(0.0, 0.15, w) * smoothstep(0.45, 0.2, w);
      size *= 0.6 + alpha * 0.8;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * (320.0 / -mv.z);
    vAlpha = alpha; vColor = aColor;
  }`;

const POINTS_FRAGMENT = `
  varying float vAlpha; varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
  #ifdef HD
    // A round glowing mote: a white-hot core in a soft halo of its colour
    float rr = d * 2.0;
    float core = exp(-rr * rr * 18.0);
    float haloHd = exp(-rr * 4.0) * 0.55;
    vec3 colHd = mix(vColor, vec3(1.0, 0.95, 0.92), core * 0.7);
    gl_FragColor = vec4(colHd * (core * 1.6 + haloHd) * vAlpha, (core + haloHd) * vAlpha);
    return;
  #endif
    // Four-point star core with a soft halo
    float star = smoothstep(0.08, 0.0, abs(c.x) * abs(c.y) * 9.0) * smoothstep(0.5, 0.1, d);
    float halo = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (halo + star), (halo * 0.8 + star) * vAlpha);
  }`;

/** How many of each particle an item gets */
const PARTICLES: Record<FxTier, { embers: number; motes: number; glints: number }> = {
  rare: { embers: 0, motes: 0, glints: 4 },
  epic: { embers: 0, motes: 7, glints: 3 },
  legendary: { embers: 26, motes: 9, glints: 4 },
  mythical: { embers: 44, motes: 14, glints: 6 }
};

const _m = new THREE.Matrix4();

interface Seeded {
  item: TierFxItem;
  rank: number;
  color: THREE.Color;
  accent: THREE.Color;
  phase: number;
  tempo: number;
}

function seedItems(items: TierFxItem[]): Seeded[] {
  return items.map((item) => {
    const r = mulberry32(hashString(item.id));
    const [c, a] = TIER_COLORS[item.tier];
    return {
      item,
      rank: FX_RANK[item.tier],
      color: new THREE.Color(item.color ?? c),
      accent: new THREE.Color(item.accent ?? a),
      phase: r() * 100,
      tempo: 0.8 + r() * 0.4
    };
  });
}

function buildPoints(seeded: Seeded[]): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const seed: number[] = [];
  const shape: number[] = [];
  const color: number[] = [];
  for (const s of seeded) {
    const { item } = s;
    const n = PARTICLES[item.tier];
    const r = mulberry32(hashString(`${item.id}:p`));
    const lift = item.lift ?? 0;
    const push = (mode: number, c: THREE.Color, size: number, height: number, radius: number) => {
      pos.push(item.x, item.y + lift, item.z);
      seed.push(r(), r(), 0.3 + r() * 0.7, height * (0.6 + r() * 0.4));
      shape.push(mode, s.tempo * (0.8 + r() * 0.4), radius, size);
      color.push(c.r, c.g, c.b);
    };
    const sz = Math.max(0.6, item.size);
    for (let i = 0; i < n.embers; i++) push(0, i % 3 === 2 ? s.accent : s.color, 0.16 + sz * 0.05, sz * 2.4, sz * 0.9);
    for (let i = 0; i < n.motes; i++) push(1, i % 2 ? s.accent : s.color, (item.tier === "mythical" ? 0.3 : 0.2) + sz * 0.05, sz * 0.9, sz * 1.15);
    for (let i = 0; i < n.glints; i++) push(2, s.accent, 0.22 + sz * 0.06, sz * 1.4, sz * 0.9);
  }
  if (pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
  g.setAttribute("aShape", new THREE.Float32BufferAttribute(shape, 4));
  g.setAttribute("aColor", new THREE.Float32BufferAttribute(color, 3));
  return g;
}

/** Instanced disc or column with per-instance colour (aTint), accent and (phase, tempo, tier, strength) */
function useInstanced(list: Seeded[], geometry: THREE.BufferGeometry, place: (s: Seeded, m: THREE.Matrix4) => void) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    if (list.length === 0) return null;
    const g = geometry.clone();
    const fx = new Float32Array(list.length * 4);
    const accent = new Float32Array(list.length * 3);
    const tint = new Float32Array(list.length * 3);
    list.forEach((s, i) => {
      fx.set([s.phase, s.tempo, s.rank, s.rank >= 4 ? 1.1 : s.rank >= 3 ? 1 : 0.6], i * 4);
      accent.set([s.accent.r, s.accent.g, s.accent.b], i * 3);
      tint.set([s.color.r, s.color.g, s.color.b], i * 3);
    });
    g.setAttribute("aFx", new THREE.InstancedBufferAttribute(fx, 4));
    g.setAttribute("aAccent", new THREE.InstancedBufferAttribute(accent, 3));
    g.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
    return g;
  }, [list, geometry]);
  useEffect(() => () => geo?.dispose(), [geo]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    list.forEach((s, i) => {
      place(s, _m);
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list, place, geo]);
  return { ref, geo };
}

/** The curtain: just outside the structure, low for epic, tall for legendary and up */
export const shellHeight = (item: TierFxItem) => item.height ?? item.size * (item.tier === "mythical" ? 2.2 : item.tier === "legendary" ? 1.8 : 0.8);
const placeAura = (s: Seeded, m: THREE.Matrix4) => {
  const r = s.item.size * 1.1;
  m.makeScale(r, shellHeight(s.item), r).setPosition(s.item.x, s.item.y + (s.item.lift ?? 0), s.item.z);
};
const placeBeam = (s: Seeded, m: THREE.Matrix4) => {
  const w = Math.max(0.35, s.item.size * (s.rank >= 4 ? 0.3 : 0.24));
  m.makeScale(w, s.item.beam ?? s.item.size * 5, w).setPosition(s.item.x, s.item.y + (s.item.lift ?? 0), s.item.z);
};

const noRaycast = () => null;

/** Draws the rarity effects for every item: curtain of light, beam and particles, one draw call each */
export function TierFx({ items }: { items: TierFxItem[] }) {
  const seeded = useMemo(() => seedItems(items), [items]);
  const auras = useMemo(() => seeded.filter((s) => s.rank >= 2 && s.item.shell !== false), [seeded]);
  const beams = useMemo(() => seeded.filter((s) => s.rank >= 3 && s.item.beam !== 0), [seeded]);
  const points = useMemo(() => buildPoints(seeded), [seeded]);
  useEffect(() => () => points?.dispose(), [points]);

  const hd = useHd("tierFx");
  const mats = useMemo(() => {
    const defines: Record<string, string> = hd ? { HD: "" } : {};
    return {
      aura: new THREE.ShaderMaterial({
        defines,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: shared },
        vertexShader: AURA_VERTEX,
        fragmentShader: AURA_FRAGMENT
      }),
      beam: new THREE.ShaderMaterial({
        defines,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: shared },
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT
      }),
      points: new THREE.ShaderMaterial({
        defines,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: shared },
        vertexShader: POINTS_VERTEX,
        fragmentShader: POINTS_FRAGMENT
      })
    };
  }, [hd]);
  useEffect(
    () => () => {
      mats.aura.dispose();
      mats.beam.dispose();
      mats.points.dispose();
    },
    [mats]
  );

  const aura = useInstanced(auras, SHELL, placeAura);
  const beam = useInstanced(beams, COLUMN, placeBeam);

  useFrame(({ clock }) => {
    shared.value = clock.elapsedTime;
  });

  // Instance counts are fixed per mesh: remount when they change
  return (
    <>
      {aura.geo && (
        <instancedMesh key={`a${auras.length}${hd ? "hd" : ""}`} ref={aura.ref} args={[aura.geo, mats.aura, auras.length]} raycast={noRaycast} renderOrder={1} />
      )}
      {beam.geo && (
        <instancedMesh key={`b${beams.length}${hd ? "hd" : ""}`} ref={beam.ref} args={[beam.geo, mats.beam, beams.length]} raycast={noRaycast} renderOrder={2} />
      )}
      {points && <points geometry={points} material={mats.points} raycast={noRaycast} frustumCulled={false} renderOrder={2} />}
    </>
  );
}
