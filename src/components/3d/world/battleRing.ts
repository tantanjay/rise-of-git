import type { ActiveMarch } from "@/types";
import { returnStartOf } from "@/utils/war";

/*
 * The ring of a battle on the world map (GAME_GUIDE §13 *Focus Fire*): every army fighting one target stands at its own
 * place round it instead of piling up on the road it came by. The server gives each march its place in the battle
 * (`battleSlot`, the order the armies joined, the same for every viewer); the first army stays where it arrived, the others
 * walk round to theirs. Places are handed out so that the ring is even at 2, 4 and 8 armies and an army never moves when
 * another joins or falls. Places are kept here by march, because a finished battle stops sending them and the armies still
 * have to cheer, fall back and walk home from where they stood.
 */

/** How long an army takes to walk round to its place, and back to its road when the battle is over */
export const RING_WALK_MS = 3500;
/** Past the first eight armies a second rank starts, this much further out */
export const RING_RANK_GAP = 3.4;
/** Eighths of a turn from the first army's place, for each army in the order it joined */
const RING_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];
/** How far out `ringFacing` puts the point a target turns toward */
const FACING_REACH = 200;

export interface MarchFrame {
  dir: { x: number; z: number };
  right: { x: number; z: number };
  yaw: number;
}

export interface RingPlace {
  /** The way the army faces at its place: toward the target */
  frame: MarchFrame;
  rank: number;
  /** It stands somewhere other than the end of its own road, so it has a walk to make */
  moved: boolean;
}

interface Remembered {
  angle: number;
  rank: number;
}

/**
 * Marches that left together for one target (a Muster, or a rally's armies from one castle) would walk exactly on top of
 * each other, so they march as one host: each block its own place in a grid across the road, the size of the host showing
 * how many marches it is. A block keeps its place when another turns back.
 */
interface HostPlace {
  side: number;
  back: number;
}

/** Between the centres of two blocks in a host (a block of soldiers is about 3 wide and 2.5 deep) */
const HOST_SIDE = 3.4;
const HOST_BACK = 3.6;
/** A mercenary band's ranks are wider than soldiers' */
const HOST_BAND_WIDEN = 1.4;

const places = new Map<string, Remembered>();
const firstArmy = new Map<string, number>();
const hostPlaces = new Map<string, HostPlace>();
/** This poll's hosts: who carries the label and how many marches are in it */
const hostLeads = new Map<string, { lead: boolean; count: number }>();

function updateHosts(marches: ActiveMarch[]) {
  const hosts = new Map<string, ActiveMarch[]>();
  for (const m of marches) {
    if (m.kind === "scout") continue;
    const key = `${m.targetId}:${m.departTime}:${m.arrivalTime}:${Math.round(m.startX)}:${Math.round(m.startZ)}`;
    hosts.set(key, [...(hosts.get(key) ?? []), m]);
  }
  hostLeads.clear();
  for (const list of hosts.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((m, i) => hostLeads.set(m.id, { lead: i === 0, count: sorted.length }));
    const fresh = sorted.filter((m) => !hostPlaces.has(m.id));
    if (fresh.length === 0) continue;
    const cols = Math.ceil(Math.sqrt(fresh.length));
    const rows = Math.ceil(fresh.length / cols);
    const side = HOST_SIDE * (fresh.some((m) => m.band) ? HOST_BAND_WIDEN : 1);
    fresh.forEach((m, i) => {
      const row = Math.floor(i / cols);
      const inRow = row === rows - 1 ? fresh.length - row * cols : cols;
      hostPlaces.set(m.id, { side: ((i % cols) - (inRow - 1) / 2) * side, back: (row - (rows - 1) / 2) * HOST_BACK });
    });
  }
  const ids = new Set(marches.map((m) => m.id));
  for (const id of hostPlaces.keys()) if (!ids.has(id)) hostPlaces.delete(id);
}

/** How far a march's block stands from the middle of its road, in world units (zero for a march on its own) */
export function hostShift(m: ActiveMarch, f: Pick<MarchFrame, "dir" | "right">): { x: number; z: number } {
  const p = hostPlaces.get(m.id);
  return p ? { x: f.right.x * p.side - f.dir.x * p.back, z: f.right.z * p.side - f.dir.z * p.back } : { x: 0, z: 0 };
}

/** The host a march walks in: whether its label speaks for the host, and how many marches that is (null: it walks alone) */
export const hostOf = (m: ActiveMarch) => hostLeads.get(m.id) ?? null;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** The side of the target a march came from, as an angle (sin → x, cos → z) */
const approachOf = (m: ActiveMarch) => Math.atan2(m.startX - m.targetX, m.startZ - m.targetZ);

function frameAt(angle: number): MarchFrame {
  const dir = { x: -Math.sin(angle), z: -Math.cos(angle) };
  return { dir, right: { x: dir.z, z: -dir.x }, yaw: Math.atan2(dir.x, dir.z) };
}

/** Learn the places in this poll's marches and forget the marches that are gone (safe to call more than once) */
export function updateBattleRings(marches: ActiveMarch[]) {
  updateHosts(marches);
  const placed = marches.filter((m) => m.battleId && m.battleSlot != null).sort((a, b) => a.battleSlot! - b.battleSlot!);
  for (const m of placed) {
    const battle = m.battleId!;
    if (!firstArmy.has(battle)) firstArmy.set(battle, approachOf(m));
    if (places.has(m.id)) continue;
    const slot = m.battleSlot!;
    const eighths = RING_ORDER[slot % RING_ORDER.length];
    places.set(m.id, { angle: firstArmy.get(battle)! + (eighths / RING_ORDER.length) * Math.PI * 2, rank: Math.floor(slot / RING_ORDER.length) });
  }
  const ids = new Set(marches.map((m) => m.id));
  for (const id of places.keys()) if (!ids.has(id)) places.delete(id);
  const battles = new Set(marches.map((m) => m.battleId));
  for (const id of firstArmy.keys()) if (!battles.has(id)) firstArmy.delete(id);
}

/** Where a march stands in its battle's ring (the end of its own road until the server has placed it) */
export function ringPlace(m: ActiveMarch): RingPlace {
  const approach = approachOf(m);
  const p = places.get(m.id);
  // A block of a host stands off the middle of the road, so even at the end of its own road it has a few steps to make
  const inHost = hostPlaces.has(m.id);
  if (!p) return { frame: frameAt(approach), rank: 0, moved: inHost };
  return { frame: frameAt(p.angle), rank: p.rank, moved: inHost || p.rank > 0 || Math.abs(wrap(p.angle - approach)) > 0.02 };
}

/** A point far off in the direction of a march's place: a boss or a pack fighting it turns toward this */
export function ringFacing(m: ActiveMarch): { x: number; z: number } {
  const { dir } = ringPlace(m).frame;
  return { x: m.targetX - dir.x * FACING_REACH, z: m.targetZ - dir.z * FACING_REACH };
}

/** The march is still walking round to its place */
export const walkingToRing = (m: ActiveMarch, place: RingPlace, now: number) => place.moved && now >= m.arrivalTime && now < m.arrivalTime + RING_WALK_MS;

/** The next moment one of a march's walks round the ring ends (the figures then change what they are doing) */
export function nextRingChange(m: ActiveMarch, now: number): number | null {
  if (!ringPlace(m).moved) return null;
  const ends = [m.arrivalTime + RING_WALK_MS, returnStartOf(m) + RING_WALK_MS].filter((t) => t > now);
  return ends.length ? Math.min(...ends) : null;
}
