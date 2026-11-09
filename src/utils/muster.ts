// Client copy of server/src/musterRules.ts (GAME_GUIDE §13 *Launching marches: the Muster*): `npm run sim:balance` checks
// the two match. The server checks and launches every muster; the window only builds its boxes and counts power with the
// numbers the march preview sends (the sets' worth, each band's power, the champion's worth).

/** The split chips: each soldier box carries this share of a full march (the ruler's march capacity) */
export const MUSTER_SPLITS = [0.1, 0.25, 0.5, 1] as const;

/**
 * The soldier boxes a split makes: as many boxes of `split` × `capacity` soldiers as the free march slots and the
 * soldiers at home allow, then one smaller box of whoever is left over while a free slot remains
 */
export function musterBoxes(split: number, home: number, capacity: number, freeSlots: number): number[] {
  const size = Math.max(1, Math.floor(Math.max(1, capacity) * split));
  if (home <= 0 || freeSlots <= 0) return [];
  const full = Math.min(freeSlots, Math.floor(home / size));
  const leftover = home - full * size;
  const boxes = Array.from({ length: full }, () => size);
  return full < freeSlots && leftover > 0 ? [...boxes, leftover] : boxes;
}

/** A soldier box's power: soldiers × its set's worth × the champion's worth when it leads */
export const boxPower = (soldiers: number, setPower: number, championPower: number | null) => Math.round(Math.max(0, soldiers) * setPower * (championPower ?? 1));

/** The muster's order: strongest first (ties keep the order they were picked in) */
export function strongestFirst<T extends { power: number }>(list: T[]): T[] {
  return list
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.power - a.m.power || a.i - b.i)
    .map((x) => x.m);
}
