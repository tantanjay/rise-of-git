import * as THREE from "three";
import type { DisasterKind } from "@/types";

/**
 * Shared state between the realm sky (RealmSky) and what changes its light: a punishment storm dims the scene and
 * its lightning flashes the ambient light, a spring shower greys it a little, a world disaster tints it. RealmSky applies all of it each frame
 * on top of the hour's light, so none of them fight over the lights' intensities.
 */
export const skyWeather = {
  /** ⛈️ A punishment storm over the view: light × this (1 = none) */
  stormDim: 1,
  /** Lightning: added to the ambient light for a moment (0…1) */
  flash: 0,
  /** 🌧️ A season shower: light × this (1 = dry) */
  showerDim: 1,
  /** How bright the sky's light is right now (RealmSky writes it): clouds, rain and snow are lit by it */
  light: new THREE.Color(1, 1, 1),
  /** 0 by day … 1 at night (fireflies come out) */
  night: 0,
  /** How strongly a world disaster shows (0…1, DisasterWeather fades it): the sky, the terrain and the grass tint by it */
  disaster: { blight: 0, tempest: 0, blood_moon: 0, plague: 0, barren: 0 } as Record<DisasterKind, number>
};

/**
 * Unlit parts (windows, lamps, lanterns, crystals) are drawn with MeshBasicMaterial: their colour is scaled by the
 * hour, dimmer by day and brighter at night, so the streets light up after dusk. No extra draw calls.
 */
const glowMaterials = new Set<THREE.MeshBasicMaterial>();
let glowLevel = 1;

export function registerGlowMaterial(m: THREE.MeshBasicMaterial): () => void {
  glowMaterials.add(m);
  m.color.setScalar(glowLevel);
  return () => {
    glowMaterials.delete(m);
  };
}

/** `exact`: set it even when the change is too small to see (the dev `__sky.settle()`, so frames compare exactly) */
export function setGlowLevel(level: number, exact = false) {
  if (!exact && Math.abs(level - glowLevel) < 0.004) return;
  glowLevel = level;
  for (const m of glowMaterials) m.color.setScalar(level);
}
