import * as THREE from "three";
import type { SeasonKey } from "@/types";
import { IDLE_KIND, type Part } from "@/components/3d/city/parts";

/**
 * Season colours (GAME_GUIDE §7 *Day, night & seasons*): grass and leaves change with the week's season in both
 * views. Spring is lush, summer sun-yellowed, autumn gold and red, winter under snow. Only the colours of grass and
 * foliage change (picked by their exact palette colours), never buildings, and never in the Voidrift.
 * Deterministic: autumn's leaf colours are picked by each part's position.
 */

const _a = new THREE.Color();
const _b = new THREE.Color();
const mix = (hex: string, to: string, k: number) => `#${_a.set(hex).lerp(_b.set(to), k).getHexString()}`;

const AUTUMN_LEAVES = ["#c2410c", "#d97706", "#b45309", "#dc2626", "#ca8a04", "#ea580c"];

const frac = (v: number) => v - Math.floor(v);
const hashXZ = (x: number, z: number) => frac(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);

export function seasonGround(hex: string, season: SeasonKey): string {
  switch (season) {
    case "spring":
      return mix(hex, "#4ade80", 0.1);
    case "summer":
      return mix(hex, "#c8b45a", 0.22);
    case "autumn":
      return mix(hex, "#a3863b", 0.28);
    case "winter":
      return mix(hex, "#e6edf4", 0.62);
  }
}

/** `x, z`: where the leaves stand (autumn picks a colour per tree) */
export function seasonFoliage(hex: string, season: SeasonKey, x = 0, z = 0): string {
  switch (season) {
    case "spring":
      return mix(hex, "#4ade80", 0.14);
    case "summer":
      return mix(hex, "#6b8e23", 0.14);
    case "autumn": {
      const h = hashXZ(x, z);
      // Some trees hang on to a little green
      return mix(hex, AUTUMN_LEAVES[Math.floor(h * AUTUMN_LEAVES.length)], 0.5 + frac(h * 7.3) * 0.25);
    }
    case "winter":
      return mix(hex, "#e2e8f0", 0.45);
  }
}

/** Recolours the grass and foliage parts of a part list (anything else is returned as it is) */
export function seasonParts(parts: Part[], season: SeasonKey, ground: Set<string>, foliage: Set<string>): Part[] {
  const cache = new Map<string, string>();
  return parts.map((p) => {
    const c = p.color.toLowerCase();
    if (!p.glow && ground.has(c)) {
      let t = cache.get(c);
      if (!t) cache.set(c, (t = seasonGround(c, season)));
      return { ...p, color: t };
    }
    if (!p.glow && foliage.has(c)) {
      // Leaves of one tree share one colour: round the position to the tree (a swaying tree's anchor is its foot)
      const at = p.idle?.kind === IDLE_KIND.sway ? p.idle : p;
      // Conifers keep their needles through autumn (spring, summer and winter snow still show on them)
      if (p.shape === "pine" && season === "autumn") return { ...p, color: mix(c, "#556b2f", 0.12) };
      return { ...p, color: seasonFoliage(c, season, Math.round(at.x * 2) / 2, Math.round(at.z * 2) / 2) };
    }
    return p;
  });
}

/** World-map trees and bushes (scatter.ts colours) */
export const WORLD_FOLIAGE = new Set(["#1f5f2a", "#2d7a36", "#2fa37a", "#2f5d3a", "#3f6f45", "#3f8f3a", "#5a9e3c", "#5d8a3a"]);

/**
 * Recolours the world map's terrain for the season, in place (the plain colours are kept in `userData`, so any
 * season can be applied again). Water, the Voidrift and the deserts keep their colours; winter snow spares the sand.
 */
export function seasonTerrain(
  geometry: THREE.BufferGeometry,
  weights: (x: number, z: number) => Partial<Record<"arcane" | "desert" | "sea", number>>,
  seaLevel: number,
  season: SeasonKey
) {
  const color = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  if (!color) return;
  if (geometry.userData.season === season) return;
  const base: Float32Array = (geometry.userData.baseColors ??= new Float32Array(color.array as Float32Array));
  // How much of the season shows on each vertex (computed once)
  const land: Float32Array =
    geometry.userData.seasonLand ??
    (geometry.userData.seasonLand = (() => {
      const out = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const h = pos.getY(i);
        if (h < seaLevel + 0.1) continue;
        const w = weights(pos.getX(i), pos.getZ(i));
        out[i] = Math.max(0, 1 - (w.arcane ?? 0) * 1.6) * Math.max(0, 1 - (w.desert ?? 0) * 1.3) * Math.min(1, (h - seaLevel - 0.1) * 3);
      }
      return out;
    })());
  const target = new THREE.Color(
    season === "spring" ? "#4ade80" : season === "summer" ? "#c8b45a" : season === "autumn" ? "#a3863b" : "#e6edf4"
  );
  const amount = season === "spring" ? 0.1 : season === "summer" ? 0.2 : season === "autumn" ? 0.26 : 0.6;
  const arr = color.array as Float32Array;
  for (let i = 0; i < pos.count; i++) {
    const k = land[i] * amount;
    for (let c = 0; c < 3; c++) {
      const b = base[i * 3 + c];
      const t = c === 0 ? target.r : c === 1 ? target.g : target.b;
      arr[i * 3 + c] = b + (t - b) * k;
    }
  }
  color.needsUpdate = true;
  geometry.userData.season = season;
}
