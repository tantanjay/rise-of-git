import { BATCHED_HEROES, isBatchedHero } from "./heroes";
import { BOSS_HEROES, isBossHero } from "./heroBosses";

/*
 * The HD hero models, as one lazily loaded chunk (`world-hd`): Normal never downloads them. Load it through
 * `loadHdModels` / `useHdModels` (hdModelsLoader.ts), never import this file statically.
 */
export { HeroMount } from "./HeroMount";
export { BandMarches } from "./BandMarches";
export { HighGraphicsEmpyrean } from "./HighGraphicsEmpyrean";
export { isBatchedHero, isBossHero };

/** How tall a hero model stands (for its click target), or undefined when the type has none */
export const heroHeight = (type: string): number | undefined => BATCHED_HEROES[type]?.height ?? BOSS_HEROES[type]?.height;
