import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { sunHour, useRealmClock } from "@/utils/realmTime";
import { setGlowLevel, skyWeather } from "./skyState";
import type { DisasterKind } from "@/types";

/**
 * The realm's sky over both views (GAME_GUIDE §7 *Day, night & seasons*): background, fog and every light follow the
 * sun through dawn, early morning, day, late afternoon, dusk, nightfall, deep night and the small hours. The keyframes
 * are on the sun's clock (sunrise 05:00, sunset 19:00); the season's sunrise and sunset stretch it onto the realm
 * clock (sunHour), so summer days and winter nights are long. The sun crosses from east to west by day and the moon
 * by night; windows and lamps light up after dusk.
 *
 * The light moves in half-hour steps of the realm day (a day or night window is one harvest long): each step sets new targets (and redraws the static shadow map once, since the
 * sun moved); the colours glide to them over a few seconds. Storms and showers (skyWeather) dim it on top, and a world
 * disaster tints it (DISASTER_LIGHT): the Blood Moon turns the night red.
 */

interface SkyKey {
  h: number;
  /** Background and fog */
  sky: string;
  amb: string;
  ambI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  /** The shadow-casting light: the sun (05:00–19:00), the moon otherwise */
  sun: string;
  sunI: number;
  /** The cool fill light from the other side */
  fill: string;
  fillI: number;
  /** Unlit windows and lamps: colour scale */
  glow: number;
}

const NIGHT: Omit<SkyKey, "h"> = {
  sky: "#03050f", amb: "#6478b8", ambI: 0.36, hemiSky: "#1e3a8a", hemiGround: "#0a1410", hemiI: 0.36,
  sun: "#a5b4fc", sunI: 0.6, fill: "#312e81", fillI: 0.3, glow: 1.45
};
const DAY: Omit<SkyKey, "h"> = {
  sky: "#0a1428", amb: "#e0f2fe", ambI: 0.9, hemiSky: "#38bdf8", hemiGround: "#15803d", hemiI: 0.7,
  sun: "#fffbeb", sunI: 1.9, fill: "#93c5fd", fillI: 0.65, glow: 0.82
};

/** Keyframes over the 24 h of the sun's clock; between them everything is blended */
const KEYS: SkyKey[] = [
  { h: 0, ...NIGHT },
  { h: 4.4, ...NIGHT },
  // The moon sets as the sky pales: the shadow light switches over at 05:00 while it is faint
  { h: 5, ...NIGHT, sky: "#110d24", ambI: 0.34, sunI: 0.12, glow: 1.35 },
  // 🌄 Dawn: rose and violet
  { h: 5.6, sky: "#2a1838", amb: "#c9a9d6", ambI: 0.5, hemiSky: "#f0abfc", hemiGround: "#1c2e22", hemiI: 0.42, sun: "#fda4af", sunI: 0.7, fill: "#6366f1", fillI: 0.38, glow: 1.2 },
  // 🌅 Early morning: low golden sun
  { h: 6.6, sky: "#2a2340", amb: "#fde4c8", ambI: 0.72, hemiSky: "#fdba74", hemiGround: "#14532d", hemiI: 0.55, sun: "#ffd29a", sunI: 1.45, fill: "#93c5fd", fillI: 0.5, glow: 1.0 },
  { h: 8.6, sky: "#101a32", amb: "#ecf3fb", ambI: 0.85, hemiSky: "#7dd3fc", hemiGround: "#15803d", hemiI: 0.66, sun: "#fff3d6", sunI: 1.8, fill: "#93c5fd", fillI: 0.6, glow: 0.86 },
  // ☀️ Day
  { h: 10, ...DAY },
  { h: 14.6, ...DAY },
  // 🌇 Late afternoon: amber light, longer shadows
  { h: 16.4, sky: "#1d1830", amb: "#fde7c7", ambI: 0.8, hemiSky: "#fbbf24", hemiGround: "#3f6212", hemiI: 0.6, sun: "#ffc68a", sunI: 1.68, fill: "#a5b4fc", fillI: 0.55, glow: 0.95 },
  // 🌆 Sunset and dusk: orange, then violet
  { h: 17.8, sky: "#33182a", amb: "#f2d2c2", ambI: 0.68, hemiSky: "#fdba74", hemiGround: "#2a2422", hemiI: 0.44, sun: "#ffa774", sunI: 1.2, fill: "#818cf8", fillI: 0.45, glow: 1.12 },
  { h: 18.6, sky: "#1c1232", amb: "#a9a2dc", ambI: 0.46, hemiSky: "#7c6fd6", hemiGround: "#101614", hemiI: 0.38, sun: "#f9a8d4", sunI: 0.35, fill: "#4338ca", fillI: 0.34, glow: 1.3 },
  { h: 19, ...NIGHT, sky: "#0d0b22", ambI: 0.34, sunI: 0.12, glow: 1.38 },
  { h: 19.8, ...NIGHT },
  { h: 24, ...NIGHT }
];

const _a = new THREE.Color();
const _b = new THREE.Color();
const _t = new THREE.Color();

/**
 * How each world disaster tints the light at full strength (GAME_GUIDE §10 *World Disasters*), blended in by how strongly
 * it shows (skyWeather.disaster): `mix` of the way to these colours, plus `night` more after dark; lights × `dim`
 */
const DISASTER_LIGHT: Record<DisasterKind, { sky: string; amb: string; hemiSky: string; hemiGround: string; sun: string; mix: number; night: number; dim: number }> = {
  blight: { sky: "#2a2416", amb: "#d9c9a0", hemiSky: "#c9b98a", hemiGround: "#5c4a2c", sun: "#f2dfb0", mix: 0.35, night: 0, dim: 0.95 },
  tempest: { sky: "#3a3024", amb: "#d8c8a8", hemiSky: "#b8a888", hemiGround: "#4a3c2a", sun: "#e8d8b8", mix: 0.4, night: 0, dim: 0.82 },
  // Rust by day, red at night; never brighter than the hour's own light (no glare under bloom)
  blood_moon: { sky: "#2c0507", amb: "#b86a64", hemiSky: "#7a2424", hemiGround: "#1c0808", sun: "#d8605a", mix: 0.14, night: 0.36, dim: 1 },
  plague: { sky: "#14200c", amb: "#bfe08a", hemiSky: "#8fb860", hemiGround: "#2e4a14", sun: "#d8f0a8", mix: 0.32, night: 0, dim: 0.9 },
  barren: { sky: "#18181c", amb: "#c8c8c8", hemiSky: "#a0a4aa", hemiGround: "#3a3a3a", sun: "#e0e0e0", mix: 0.45, night: 0, dim: 0.92 }
};

function skyAt(hour: number) {
  const i = Math.max(0, KEYS.findIndex((k, j) => hour >= k.h && hour < (KEYS[j + 1]?.h ?? 25)));
  const a = KEYS[i];
  const b = KEYS[Math.min(KEYS.length - 1, i + 1)];
  const t = b.h > a.h ? (hour - a.h) / (b.h - a.h) : 0;
  const col = (x: string, y: string) => new THREE.Color().copy(_a.set(x)).lerp(_b.set(y), t);
  const num = (x: number, y: number) => x + (y - x) * t;
  return {
    sky: col(a.sky, b.sky),
    amb: col(a.amb, b.amb),
    ambI: num(a.ambI, b.ambI),
    hemiSky: col(a.hemiSky, b.hemiSky),
    hemiGround: col(a.hemiGround, b.hemiGround),
    hemiI: num(a.hemiI, b.hemiI),
    sun: col(a.sun, b.sun),
    sunI: num(a.sunI, b.sunI),
    fill: col(a.fill, b.fill),
    fillI: num(a.fillI, b.fillI),
    glow: num(a.glow, b.glow)
  };
}

/** Where the shadow light stands at a sun hour: the sun arcs east → west from 05:00 to 19:00, the moon from 19:00 to 05:00 */
function lightPosition(hour: number, out: THREE.Vector3) {
  const sunUp = hour >= 5 && hour < 19;
  const t = sunUp ? (hour - 5) / 14 : (((hour - 19 + 24) % 24) / 10);
  const a = t * Math.PI;
  // Never quite on the horizon, so shadows stay long but never endless
  const elevation = Math.max(0.55, Math.sin(a)) * (sunUp ? 1 : 0.9);
  return out.set(Math.cos(a) * 75, elevation * 110, 45);
}

export function RealmSky() {
  const clock = useRealmClock();
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const amb = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);

  // Targets for this half-hour step (the step's middle hour, on the sun's clock)
  const seasonKey = clock.season.key;
  const stepSun = sunHour((clock.step + 0.5) / 2, seasonKey);
  const target = useMemo(() => skyAt(stepSun), [stepSun]);
  const current = useRef<ReturnType<typeof skyAt> | null>(null);
  const shadowFrames = useRef(0);
  const settle = useRef(false);

  useEffect(() => {
    // Dev handle: `__sky.settle()` jumps the light to the hour's targets on the next frame, as on the first frame, instead
    // of gliding there over the wall clock, so frames taken at the same advance(t) compare exactly between page loads
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __sky?: { settle: () => void } };
    w.__sky = { settle: () => (settle.current = true) };
    return () => {
      delete w.__sky;
    };
  }, []);

  useEffect(() => {
    if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color(target.sky);
    // The sun moved: redraw the static shadow map (useStaticShadows draws it only when something changes)
    if (sun.current) lightPosition(stepSun, sun.current.position);
    shadowFrames.current = 3;
  }, [stepSun, scene, target]);

  useFrame((_, dt) => {
    // First frame: jump straight to the hour; afterwards glide (≈ 3 s) so a step never pops
    const settled = settle.current;
    if (settled) {
      settle.current = false;
      current.current = null;
    }
    const cur = (current.current ??= {
      ...target,
      sky: target.sky.clone(), amb: target.amb.clone(), hemiSky: target.hemiSky.clone(), hemiGround: target.hemiGround.clone(), sun: target.sun.clone(), fill: target.fill.clone()
    });
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 1.2);
    cur.sky.lerp(target.sky, k);
    cur.amb.lerp(target.amb, k);
    cur.hemiSky.lerp(target.hemiSky, k);
    cur.hemiGround.lerp(target.hemiGround, k);
    cur.sun.lerp(target.sun, k);
    cur.fill.lerp(target.fill, k);
    cur.ambI += (target.ambI - cur.ambI) * k;
    cur.hemiI += (target.hemiI - cur.hemiI) * k;
    cur.sunI += (target.sunI - cur.sunI) * k;
    cur.fillI += (target.fillI - cur.fillI) * k;
    cur.glow += (target.glow - cur.glow) * k;

    // A world disaster in the sky: how far to tint each light, and how much it dims them
    const nightNow = THREE.MathUtils.clamp((cur.glow - 0.95) / 0.45, 0, 1);
    let tintKind: DisasterKind | null = null;
    let tint = 0;
    for (const k of Object.keys(DISASTER_LIGHT) as DisasterKind[]) {
      if (skyWeather.disaster[k] > tint) {
        tint = skyWeather.disaster[k];
        tintKind = k;
      }
    }
    const tl = tintKind ? DISASTER_LIGHT[tintKind] : null;
    const w = tl ? Math.min(1, tint * (tl.mix + tl.night * nightNow)) : 0;
    const tintInto = (c: THREE.Color, to: string) => (w > 0 ? c.lerp(_t.set(to), w) : c);

    const dim = skyWeather.stormDim * skyWeather.showerDim * (tl ? 1 - (1 - tl.dim) * tint : 1);
    if (scene.background instanceof THREE.Color) tintInto(scene.background.copy(cur.sky), tl?.sky ?? "#000").multiplyScalar(0.6 + 0.4 * dim);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(scene.background as THREE.Color);
    if (amb.current) {
      tintInto(amb.current.color.copy(cur.amb), tl?.amb ?? "#000");
      // Only the ambient fill flashes with lightning: the shadow-casting light stays steady
      amb.current.intensity = cur.ambI * dim + skyWeather.flash * 0.9;
    }
    if (hemi.current) {
      tintInto(hemi.current.color.copy(cur.hemiSky), tl?.hemiSky ?? "#000");
      tintInto(hemi.current.groundColor.copy(cur.hemiGround), tl?.hemiGround ?? "#000");
      hemi.current.intensity = cur.hemiI * dim;
    }
    if (sun.current) {
      tintInto(sun.current.color.copy(cur.sun), tl?.sun ?? "#000");
      sun.current.intensity = cur.sunI * dim;
    }
    if (fill.current) {
      fill.current.color.copy(cur.fill);
      fill.current.intensity = cur.fillI * dim;
    }
    setGlowLevel(cur.glow, settled);
    // What lights the weather: the ambient and sky light together, dimmed by storms and showers
    tintInto(skyWeather.light.copy(cur.amb), tl?.amb ?? "#000").multiplyScalar(Math.min(1.05, (cur.ambI * 0.75 + cur.hemiI * 0.45) * dim));
    skyWeather.night = nightNow;
    if (shadowFrames.current > 0) {
      shadowFrames.current--;
      gl.shadowMap.needsUpdate = true;
    }
  });

  return (
    <>
      <fog attach="fog" args={["#070d1e", 80, 260]} />
      <ambientLight ref={amb} />
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        position={[60, 90, 50]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-108}
        shadow-camera-right={108}
        shadow-camera-top={108}
        shadow-camera-bottom={-108}
        shadow-camera-far={360}
        shadow-bias={-0.0005}
      />
      <directionalLight ref={fill} position={[-50, 40, -50]} />
    </>
  );
}
