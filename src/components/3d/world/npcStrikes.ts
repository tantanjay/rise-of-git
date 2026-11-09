import { hashString } from "@/utils/random";

/**
 * Mobs and bandits in a live battle on the map strike at the armies on each round and rear back as they cast an Art
 * (GAME_GUIDE §13 *Battle Arts*). The war parties write each round's moment here as it comes in, by NPC id; the map's
 * NPC batch reads it every frame through one small uniform list (`FIGHT_SLOTS` battles at once) and moves the pack's
 * parts in its vertex shader, in Normal and HD alike, so a strike costs no draw call and touches no React state. Each
 * creature of a pack takes its own beat, reach and lean from its place and the round (seeded), so no two strike alike.
 */

/** Battles whose packs strike at once (the oldest beyond this wait for the next round) */
export const FIGHT_SLOTS = 8;
/** vec4s per slot in the uniform: (key, strike age, cast age, round), (x, z, toward x, toward z), (reach, how far it has turned to face its target, facing x, facing z) */
export const FIGHT_VEC4S = 3;
/** A pack keeps fighting this long after its last round's strike (rounds come every 10 s; a late poll must not make it look away) */
const HOLD_S = 13;
/** How long a pack takes to turn to its target at the start and to turn back at the end, s */
const TURN_IN_S = 0.6;
/** How fast it turns to a new target when the one in front falls (a share of the angle left, per second; as the bosses) */
const TURN_RATE = 2.5;

export interface NpcStrike {
  /** The NPC's place and the unit direction toward the armies fighting it */
  x: number;
  z: number;
  toward: { x: number; z: number };
  /** When the round's strike lands and when the pack's cast starts (epoch ms; no cast: -Infinity) */
  strikeAt: number;
  castAt: number;
  round: number;
  /** How far the pack lunges (its tier's scale) */
  reach: number;
  /** When the battle's first strike came (epoch ms), and the way the pack faces now (kept from round to round) */
  fightFrom?: number;
  faceYaw?: number;
}

/** The latest round's strike of every pack fighting on the map, by NPC id */
export const NPC_STRIKES = new Map<string, NpcStrike>();

/** A pack's key in the batch (an instance attribute on each of its parts; 0 = never fights) */
export const npcFightKey = (id: string) => 1 + (hashString(`${id}:fight`) % 1_048_575);

/** The uniform list the NPC batch's shader reads (`uFight`), written once a frame by `writeFightUniform` */
export const FIGHT_UNIFORM = new Float32Array(FIGHT_SLOTS * FIGHT_VEC4S * 4);

let writtenAt = -1;
let lastWrite = 0;
const smooth = (u: number) => {
  const k = Math.min(1, Math.max(0, u));
  return k * k * (3 - 2 * k);
};
/** Fill the uniform with the strikes playing now (called by every fighting batch's frame; the first call of a frame writes) */
export function writeFightUniform(frame: number, now = Date.now()) {
  if (frame === writtenAt) return;
  writtenAt = frame;
  const dt = Math.min(0.1, Math.max(0, (now - lastWrite) / 1000));
  lastWrite = now;
  FIGHT_UNIFORM.fill(0);
  let slot = 0;
  const live = [...NPC_STRIKES.entries()].sort((a, b) => b[1].strikeAt - a[1].strikeAt);
  for (const [id, s] of live) {
    const strike = (now - s.strikeAt) / 1000;
    const cast = Number.isFinite(s.castAt) ? (now - s.castAt) / 1000 : -99;
    if (strike > HOLD_S) {
      // No round has come for a while: the battle is over
      NPC_STRIKES.delete(id);
      continue;
    }
    // Turns to face its target the shortest way, so a fallen front army hands over to the next one smoothly
    const want = Math.atan2(s.toward.x, s.toward.z);
    const yaw = s.faceYaw ?? want;
    s.faceYaw = yaw + Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * Math.min(1, dt * TURN_RATE);
    if (slot >= FIGHT_SLOTS) continue;
    const face = smooth((now - (s.fightFrom ?? s.strikeAt)) / (TURN_IN_S * 1000)) * (1 - smooth((strike - (HOLD_S - TURN_IN_S)) / TURN_IN_S));
    FIGHT_UNIFORM.set([npcFightKey(id), strike, cast, s.round, s.x, s.z, s.toward.x, s.toward.z, s.reach, face, Math.sin(s.faceYaw), Math.cos(s.faceYaw)], slot * FIGHT_VEC4S * 4);
    slot++;
  }
}
