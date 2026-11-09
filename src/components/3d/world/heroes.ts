import { HeroCtx, HERO_LANDMARK_BUILDERS } from "./heroLandmarks";
import { ASCENDED_FLOAT, HERO_CORE_BUILDERS } from "./heroCore";
import { HERO_SITE_BUILDERS } from "./heroSites";
import type { HeroAuraSite } from "./HeroAura";

/* ------------------------------------------------------------------------- */
/* The batched heroes: one-of-a-kind sights hand-built for high graphics       */
/* ------------------------------------------------------------------------- */

export interface HeroDef {
  build: (c: HeroCtx) => void;
  /** Its legendary aura (placed at the site) */
  aura: Omit<HeroAuraSite, "x" | "y" | "z">;
  /** How tall it stands on the map (the hover/click target, at its map scale) */
  height: number;
  /** How the Codex frames it: camera distance, camera height, look-at height */
  frame: [number, number, number];
}

const aura = (color: string, hot: string, beamY: number, curtainR: number, curtainH = 4.4, beamR = 0.75): HeroDef["aura"] => ({
  beam: { y: beamY, height: 18, radius: beamR },
  curtain: { radius: curtainR, height: curtainH },
  embers: { inner: Math.max(0.4, curtainR - 1.6), outer: curtainR + 0.2, height: 8, count: 110 },
  color,
  hot
});

/**
 * Every batched hero by NPC type. In HD they take the place of their Normal model on the map (all of them drawn
 * together by `HeroBatch`, one draw per material) and in the Codex.
 */
export const BATCHED_HEROES: Record<string, HeroDef> = {
  "lm-dawn-cathedral": { build: HERO_LANDMARK_BUILDERS["lm-dawn-cathedral"], aura: aura("#f6c453", "#fff4d6", 10.85, 5.15), height: 10.5, frame: [19, 9, 4.2] },
  "lm-heart-oak": { build: HERO_LANDMARK_BUILDERS["lm-heart-oak"], aura: aura("#93e46e", "#f4ffe0", 11.0, 5.05, 4.6), height: 11.5, frame: [21, 10.5, 5.8] },
  "lm-anvil-of-gods": { build: HERO_LANDMARK_BUILDERS["lm-anvil-of-gods"], aura: aura("#ffa040", "#fff1c4", 8.9, 5.15), height: 8.5, frame: [18, 8.5, 3.4] },
  "lm-bloodfire-throne": { build: HERO_LANDMARK_BUILDERS["lm-bloodfire-throne"], aura: aura("#ff5a2c", "#ffd6a6", 7.6, 5.15), height: 7.5, frame: [17, 8, 3.0] },
  ruins: { build: HERO_CORE_BUILDERS.ruins, aura: aura("#a855f7", "#f0d9ff", 4.9, 3.5, 4.0), height: 5, frame: [13, 6.5, 2.4] },
  // The risen Eye over the Archon's citadel: its curtain hangs round the Eye, its beam rises from it (the Empyrean below keeps its own aura)
  "ruins-ascended": {
    build: HERO_CORE_BUILDERS["ruins-ascended"],
    aura: { ...aura("#a855f7", "#f0d9ff", ASCENDED_FLOAT + 4.9, 4.6, 5.5), curtain: { radius: 4.6, height: 5.5, y: ASCENDED_FLOAT - 0.8 } },
    height: 5,
    frame: [27, 13, 8.5]
  },
  // The legendary sites, built at their rig's size (the map stands them at the legendary rarity scale, aura and all)
  "res-dragonstone": { build: HERO_SITE_BUILDERS["res-dragonstone"], aura: aura("#ff6a1a", "#fff1c4", 3.9, 2.75, 3.8, 0.55), height: 5.6, frame: [9, 4.6, 1.9] },
  "res-motherlode": { build: HERO_SITE_BUILDERS["res-motherlode"], aura: aura("#fbbf24", "#fff7d6", 3.3, 2.85, 3.6, 0.5), height: 4.8, frame: [8.5, 4.2, 1.5] },
  "treasure-relic": { build: HERO_SITE_BUILDERS["treasure-relic"], aura: aura("#c084fc", "#fbe8ff", 3.1, 1.95, 3.4, 0.45), height: 4.2, frame: [6, 3, 1.4] }
};

export const isBatchedHero = (type: string) => type in BATCHED_HEROES;
