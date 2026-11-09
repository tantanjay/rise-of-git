/**
 * When each world boss last cried out (its Finale cast, its Enrage waking), by NPC id, in epoch ms. The war parties
 * write it as a round's casts come in; the boss models read it every frame and rear up in a roar (`BossModel` in Normal,
 * the rigged hero's roar action in HD), so no React state is touched.
 */
export const BOSS_CRIES = new Map<string, number>();

/** How long a battle cry plays, ms */
export const BOSS_CRY_MS = 2600;
