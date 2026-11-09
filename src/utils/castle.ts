/** Mortal castles top out at Lv25 (Wonder); only the Archon of the Realm's Empyrean goes on to Lv30 */
export const MAX_CASTLE_LEVEL = 30;

export const CASTLE_STAGES = [
  { name: "Keep", from: 1 },
  { name: "Castle", from: 6 },
  { name: "Citadel", from: 11 },
  { name: "Palace", from: 16 },
  { name: "Wonder", from: 21 },
  { name: "Empyrean", from: 26 }
] as const;

/** Stage index of the Empyrean (Lv26–30), the Archon's floating citadel */
export const EMPYREAN_STAGE = 5;
/** From this many prestige stars a building shows one red ★ and gets the grand, legendary-class effects */
export const RED_STAR_FROM = 5;
/** Wonder (castle Lv21–25): the top mortal stage, legendary-class on the rarity ladder */
export const WONDER_STAGE = 4;
/** The Citadel (rare-class on the rarity ladder) and the Palace (epic-class), the stages below the Wonder */
export const CITADEL_STAGE = 2;
export const PALACE_STAGE = 3;

export interface CastleStage {
  /** 0 = Keep … 4 = Wonder, 5 = Empyrean (the Archon only) */
  index: number;
  name: string;
  /** 1–5: progress through the current stage (adds a little height each level) */
  step: number;
  /** Level the next stage starts at, or null once at Wonder (mortals) or Empyrean */
  nextStageLevel: number | null;
  nextStageName: string | null;
}

/** Castle stage for a castle level: every 5 levels the castle is rebuilt bigger */
export function castleStage(level: number): CastleStage {
  const lv = Math.max(1, Math.min(MAX_CASTLE_LEVEL, Math.floor(level)));
  const index = Math.min(CASTLE_STAGES.length - 1, Math.floor((lv - 1) / 5));
  // Mortals never see the Empyrean as their next stage
  const next = index < EMPYREAN_STAGE - 1 ? CASTLE_STAGES[index + 1] : undefined;
  return {
    index,
    name: CASTLE_STAGES[index].name,
    step: lv - CASTLE_STAGES[index].from + 1,
    nextStageLevel: next ? next.from : null,
    nextStageName: next ? next.name : null
  };
}

/** Height of each stage's highest point at its first level */
export const CASTLE_TOP_Y = [7.2, 8.4, 11, 13, 16.5, 21.5];

/** Approximate height of the castle's highest point, used to place labels above it */
export function castleTopY(level: number): number {
  const { index, step } = castleStage(level);
  const grow = 1 + (step - 1) * 0.05;
  return CASTLE_TOP_Y[index] * grow;
}

export interface SortableBuilding {
  name: string;
  level: number;
  condition?: string;
  prestige?: number;
}

/**
 * Sort buildings:
 * 1. Active first, then inactive ('idle').
 * 2. Higher level first.
 * 3. Higher prestige first (stars above Lv.25).
 * 4. Alphabetical tie-breaker by name.
 */
export function compareBuildings(a: SortableBuilding, b: SortableBuilding): number {
  const aActive = a.condition !== "idle" ? 1 : 0;
  const bActive = b.condition !== "idle" ? 1 : 0;
  if (aActive !== bActive) return bActive - aActive;
  if (b.level !== a.level) return b.level - a.level;
  if ((b.prestige ?? 0) !== (a.prestige ?? 0)) return (b.prestige ?? 0) - (a.prestige ?? 0);
  return a.name.localeCompare(b.name);
}

