import { useSyncExternalStore } from "react";

/*
 * Graphics quality: "normal" draws the realm as it always has; "hd" turns on the high-graphics layer everywhere
 * (bloom, studio reflections, the HD rarity effects, detailed castle stone, hand-built HD hero models, textured ground
 * with swaying grass, waves that catch the light, textured trees, rocks and stonework swaying with the wind, every
 * creature and site drawn through the HD model kit, and the townsfolk, animals and soldiers in their HD versions).
 * Each HD feature can be switched on its own (for measuring what it costs); all are on in HD but antialiasing, which
 * the player turns on in Game Settings (it is the dearest one: ~5–6 ms a frame on a laptop GPU).
 */

export type GraphicsQuality = "normal" | "hd";
export type HdFeature = "bloom" | "reflections" | "tierFx" | "castles" | "heroes" | "terrain" | "water" | "scatter" | "models" | "actors" | "antialias";

export interface GraphicsState {
  quality: GraphicsQuality;
  features: Record<HdFeature, boolean>;
}

const KEY = "graphics-quality";
/** HD features the player can switch off in Game Settings, each saved under `graphics-<feature>` */
export const PLAYER_FEATURES: HdFeature[] = ["terrain", "water", "antialias"];
/** What HD draws until the player chooses otherwise */
const DEFAULTS: Record<HdFeature, boolean> = { bloom: true, reflections: true, tierFx: true, castles: true, heroes: true, terrain: true, water: true, scatter: true, models: true, actors: true, antialias: false };

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window: keep it for this visit only */
  }
}

/** The defaults, with the player's own choices on top */
function features(): Record<HdFeature, boolean> {
  const out = { ...DEFAULTS };
  for (const f of PLAYER_FEATURES) {
    const v = stored(`graphics-${f}`);
    if (v === "on" || v === "off") out[f] = v === "on";
  }
  return out;
}

let state: GraphicsState = { quality: stored(KEY) === "hd" ? "hd" : "normal", features: features() };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const graphics = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setQuality(quality: GraphicsQuality) {
    store(KEY, quality);
    state = { quality, features: features() };
    emit();
  },
  /** Switch one HD feature (saved when it is a player setting; the rest last until the quality changes, for measuring) */
  setFeature(feature: HdFeature, on: boolean) {
    if (PLAYER_FEATURES.includes(feature)) store(`graphics-${feature}`, on ? "on" : "off");
    state = { ...state, features: { ...state.features, [feature]: on } };
    emit();
  },
  /** Whether an HD feature is drawn right now */
  hd(feature: HdFeature) {
    return state.quality === "hd" && state.features[feature];
  },
  /** The quality the player saved, or null when they never chose one */
  saved(): GraphicsQuality | null {
    const v = stored(KEY);
    return v === "hd" || v === "normal" ? v : null;
  },
  /** Draw in this quality for now without saving it (the login flyover); null goes back to the saved one */
  preview(quality: GraphicsQuality | null) {
    state = { quality: quality ?? (stored(KEY) === "hd" ? "hd" : "normal"), features: features() };
    emit();
  }
};

export function useGraphics(): GraphicsState {
  return useSyncExternalStore(graphics.subscribe, graphics.get, graphics.get);
}

/** Whether an HD feature is drawn right now (re-renders when the setting changes) */
export function useHd(feature: HdFeature): boolean {
  const g = useGraphics();
  return g.quality === "hd" && g.features[feature];
}

// Dev handle for measuring: __graphics.setQuality("hd"), __graphics.setFeature("bloom", false)
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __graphics: typeof graphics }).__graphics = graphics;
}
