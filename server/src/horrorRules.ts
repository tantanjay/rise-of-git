import { dateKeyIn } from "./disasterRules.js";
import { HORROR_LEVELS, type HorrorStats } from "./warConfig.js";
import { FOOTPRINT, FOOTPRINT_MARGIN, VOIDRIFT_BAND, ws } from "./worldGeometry.js";

export { HORROR_LEVELS };

/**
 * Xal'Vorath, the Overseers' Wrath (GAME_GUIDE §15 *Wrath*, §13 *The Horror*): the numbers and pure rules of the mythical
 * horror. No database, so `npm run sim:balance` runs them too; horror.ts keeps its state and raises its notices. The client
 * mirror is src/utils/horror.ts.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const HORROR = {
  /** A horror's map NPC id starts with this */
  NPC_PREFIX: "horror-",
  /** The walk from the rift to the gates */
  APPROACH_MS: 3 * DAY_MS,
  /** How long it waits at the gates before it burns the kingdom */
  SIEGE_MS: HOUR_MS,
  /** Realm-time days of work that drive it back */
  DAYS: 3,
  /** XP the target must earn on each of those days */
  XP_PER_DAY: 3,
  /** Sent at or after this realm-time hour, the first of the three days is tomorrow, so no day is cut short */
  LATE_SEND_HOUR: 12,
  MIN_LEVEL: 1,
  MAX_LEVEL: 5,
  /**
   * Kingdoms one Wrath may name, and horrors out in the realm at once: each is drawn on its own (Normal rig +25 draws, HD
   * model +11), so three is what the map's draw budget has room for
   */
  MAX_TARGETS: 3,
  /** The Voidrift's heart: it comes out of the rift's edge facing its target, and marches away from here (world units) */
  HEART: { x: 0, z: 0 },
  /** How far from the heart it tears in, nearest first: in the rift's open outer band, beyond the ring of Voidrift citadels */
  START_RADII: [8, 11, 14, 17].map((out) => Math.round((VOIDRIFT_BAND.outer + out) * 10) / 10),
  /** How far to either side of the straight line to the castle it may start, degrees */
  START_ARC: 40,
  /** How far round the Voidrift side of the castle it may stop, degrees */
  GATE_ARC: 60,
  /** The ground its model covers: nothing else should stand this close to the middle of it (the map's footprint table) */
  FOOTPRINT: FOOTPRINT.horror,
  /** How far from the castle it stops, on the side it came from */
  GATE_STANDOFF: ws(9),
  /** …and these much farther out, in turn, when its neighbours leave no clear ground on the nearest ring */
  GATE_STANDOFF_STEPS: [0, 3, 6],
  /** Share of the treasury above the vault floor it devours when it burns a kingdom */
  TREASURY_DEVOURED: 0.5,
  /** Its place on the map moves on in steps this long (it covers a fraction of a unit in one) */
  MOVE_STEP_MS: 15 * 60 * 1000,
  /** The mythical gem a slain horror drops (a key of SCARCE_RESOURCES in db.ts) */
  GEM: "void_heart"
} as const;

export const isHorrorId = (npcId: string) => npcId.startsWith(HORROR.NPC_PREFIX);

/** A Level that can be sent: a whole number from MIN_LEVEL to MAX_LEVEL */
export function validHorrorLevel(level: unknown): number {
  const n = Number(level);
  if (!Number.isInteger(n) || n < HORROR.MIN_LEVEL || n > HORROR.MAX_LEVEL) throw new Error(`Pick a Level from ${HORROR.MIN_LEVEL} to ${HORROR.MAX_LEVEL}.`);
  return n;
}

/** Its stats at a Level, sent at `targets` kingdoms at once: each gets its own horror at the stats ÷ the number of targets */
export function horrorStatsFor(level: number, targets: number): HorrorStats {
  const base = HORROR_LEVELS[level];
  const split = Math.max(1, targets);
  return { hp: Math.round(base.hp / split), atk: Math.round(base.atk / split), def: Math.round(base.def / split) };
}

/** What a slain horror's hoard and bounty are worth, × a world boss's: by its Level, shared out as its stats were */
export const horrorRewardMult = (level: number, targets: number) => Math.max(1, level / Math.max(1, targets));

/** `YYYY-MM-DD` + `n` days (the key is a calendar date, so no clock or time zone comes into it) */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function realmHour(ms: number, tz: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));
}

/**
 * The three realm-time days that can drive it back. Sent before noon: that day and the next two. Sent from noon on: the
 * next three, the last of them ending at its arrival, so each day gives the kingdom at least 12 hours to work
 */
export function horrorDaysFor(sentAt: number, tz: string): string[] {
  const first = realmHour(sentAt, tz) >= HORROR.LATE_SEND_HOUR ? 1 : 0;
  const today = dateKeyIn(sentAt, tz);
  return Array.from({ length: HORROR.DAYS }, (_, i) => addDays(today, first + i));
}

export interface MapSpot {
  x: number;
  z: number;
  /** The ground it covers */
  r: number;
}

type Point = { x: number; z: number };

/** The first spot where the titan stands clear of everything, or else the one with the most room */
export function clearestSpot(candidates: Point[], blockers: MapSpot[]): Point {
  const room = (p: Point) => Math.min(Infinity, ...blockers.map((b) => Math.hypot(p.x - b.x, p.z - b.z) - b.r - HORROR.FOOTPRINT - FOOTPRINT_MARGIN));
  let best = candidates[0];
  let bestRoom = -Infinity;
  for (const c of candidates) {
    const r = room(c);
    if (r >= 0) return c;
    if (r > bestRoom) {
      best = c;
      bestRoom = r;
    }
  }
  return best;
}

/** Points round a centre, at a distance, spreading out from an angle: straight along it first, then a little further to each side */
const arc = (centre: Point, toward: number, radius: number, degrees: number[]): Point[] =>
  degrees.map((d) => {
    const a = toward + (d * Math.PI) / 180;
    return { x: centre.x + Math.cos(a) * radius, z: centre.z + Math.sin(a) * radius };
  });

const spread = (step: number, most: number) => {
  const out = [0];
  for (let d = step; d <= most; d += step) out.push(d, -d);
  return out;
};

/** Where it may tear in for this castle: on the edge of the Voidrift that looks toward it, never round the far side */
export function horrorStartSpots(castle: Point): Point[] {
  const toward = Math.atan2(castle.z - HORROR.HEART.z, castle.x - HORROR.HEART.x);
  return HORROR.START_RADII.flatMap((radius) => arc(HORROR.HEART, toward, radius, spread(10, HORROR.START_ARC)));
}

/**
 * Where it may stop: GATE_STANDOFF from the castle (or a little farther out when the city's neighbours crowd that ring),
 * on the side that looks back at the Voidrift, never behind the city
 */
export function horrorGateSpots(castle: Point): Point[] {
  const toward = Math.atan2(HORROR.HEART.z - castle.z, HORROR.HEART.x - castle.x);
  return HORROR.GATE_STANDOFF_STEPS.flatMap((extra) => arc(castle, toward, HORROR.GATE_STANDOFF + extra, spread(15, HORROR.GATE_ARC)));
}

/** A number from 0 to 1 that a horror's id always gives the same */
function seeded(id: number, salt: number): number {
  const v = Math.sin(id * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Its place on the road at `now`, in MOVE_STEP_MS steps, and which way it faces. However long the road, it arrives on
 * time: a longer one is walked faster. `seed` (its id) gives each its own march: a slight drift either side of the
 * straight line, and when it surges and when it drags. Ends exactly at both ends
 */
function roadPoint(from: Point, to: Point, u: number, seed: number | undefined): Point {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (seed === undefined) return { x: from.x + dx * u, z: from.z + dz * u };
  const length = Math.max(0.001, Math.hypot(dx, dz));
  // Surges and drags: |pace| < 1 keeps it always going forward
  const pace = (seeded(seed, 1) - 0.5) * 1.5;
  const v = u + (pace * Math.sin(u * Math.PI * 2)) / (Math.PI * 2);
  const bends = 1 + Math.floor(seeded(seed, 2) * 2);
  const side = seeded(seed, 3) < 0.5 ? -1 : 1;
  const stray = Math.min(1 + seeded(seed, 4) * 2.5, length * 0.06) * side * Math.sin(v * Math.PI * bends) * Math.sin(v * Math.PI);
  return { x: from.x + dx * v - (dz / length) * stray, z: from.z + dz * v + (dx / length) * stray };
}

export function horrorPosition(from: Point, to: Point, startedAt: number, arrivesAt: number, now: number, seed?: number): Point & { heading: number } {
  const span = Math.max(1, arrivesAt - startedAt);
  const walked = Math.floor((now - startedAt) / HORROR.MOVE_STEP_MS) * HORROR.MOVE_STEP_MS;
  const u = now >= arrivesAt ? 1 : Math.min(1, Math.max(0, walked / span));
  const at = roadPoint(from, to, u, seed);
  // Which way the road runs from here (at the very end, the way it came in)
  const a = u < 1 ? at : roadPoint(from, to, 0.995, seed);
  const b = u < 1 ? roadPoint(from, to, Math.min(1, u + 0.005), seed) : at;
  return { x: at.x, z: at.z, heading: Math.atan2(b.x - a.x, b.z - a.z) };
}
