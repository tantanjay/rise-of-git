import { useMemo, useRef } from "react";
import type { ActiveMarch } from "@/types";
import { MarchPhase, battleEndOf, returnStartOf } from "@/utils/war";
import { BossBatch, SitePlacement } from "./BossBatch";
import type { HeroSite } from "./HeroBatch";
import type { BossLive } from "./heroRig";
import { bandModelsStanding } from "./bandModels";
import { BAND_SCALE } from "./mercActors";
import { championModelType } from "@/utils/champion";
import { RING_RANK_GAP, RING_WALK_MS, hostShift, ringPlace, walkingToRing } from "./battleRing";
import { arcStep } from "@/components/3d/city/actorMotion";

/*
 * 🪙 Mercenary bands on the march in high graphics (GAME_GUIDE §13 *Mercenaries*): every model of every band walking the
 * map is a site of one `BossBatch`, built at the origin and carried each frame on its root bone to where its march puts
 * it, so a copy costs its vertices and a CPU pose, never a draw (the batch draws once per shared hero material, and
 * nothing while no band is in view). A band shows as many of its models as its strength keeps standing (a legendary walks
 * alone until it falls). Their sparks and auras stay off: they are fixed in the world. Normal walks each band as low-poly copies of its
 * mercenaries (`mercActors.ts`), through the soldiers' `Actors`.
 *
 * 🦸 A champion leading a march of soldiers walks here too, one site a little ahead of its soldiers (who march as actors
 * as ever), its model built from its civilization and rolled look. Normal shows only the soldiers.
 */

/** Ranks of five, this far apart (world units) */
const RANK = 5;
const COL_SPACING = 0.95;
const ROW_SPACING = 1.05;
/** As the soldier formations: set off a little past the castle, stand this far short of the target */
const DEPART_OFFSET = 2.5;
const STANDOFF = 4.2;
const RETREAT_DISTANCE = 7;
const OUTCOME_MS = 6000;
/** A champion stands this far ahead of its soldiers' front, at a legendary mercenary's scale */
const CHAMPION_LEAD = 1.6;
const CHAMPION_SCALE = 0.68;
const CHAMP = "champ";
/** The sites a march brings: its band's standing models, or its champion */
const sitesOf = (m: ActiveMarch): HeroSite[] =>
  m.band
    ? Array.from({ length: bandModelsStanding(m) }, (_, i): HeroSite => ({ id: `${m.id}:${i}`, type: m.band!.type, x: 0, y: 0, z: 0, scale: BAND_SCALE[m.band!.rarity] }))
    : m.champion && m.soldiersCount > 0
      ? [{ id: `${m.id}:${CHAMP}`, type: championModelType(m.attackerCiv, m.champion.looks), x: 0, y: 0, z: 0, scale: CHAMPION_SCALE }]
      : [];

export interface BandMarchEntry {
  march: ActiveMarch;
  phase: MarchPhase;
  /** Still walking round to its place in the battle's ring */
  circling: boolean;
}


function frameOf(m: ActiveMarch) {
  const dx = m.targetX - m.startX;
  const dz = m.targetZ - m.startZ;
  const len = Math.max(0.001, Math.hypot(dx, dz));
  const dir = { x: dx / len, z: dz / len };
  return { dir, right: { x: dir.z, z: -dir.x }, yaw: Math.atan2(dir.x, dir.z) };
}

/** Model `i` of `n` in ranks of five behind a point, along a march's frame */
function rankSlot(i: number, n: number, f: ReturnType<typeof frameOf>, cx: number, cz: number, facing = 1) {
  const cols = Math.min(RANK, n);
  const row = Math.floor(i / cols);
  const lateral = ((i % cols) - (cols - 1) / 2) * COL_SPACING + (row % 2) * 0.3;
  const back = row * ROW_SPACING * facing;
  return { x: cx + f.right.x * lateral - f.dir.x * back, z: cz + f.right.z * lateral - f.dir.z * back };
}

export function BandMarches({ bands, heightAt }: { bands: BandMarchEntry[]; heightAt: (x: number, z: number) => number }) {
  // The sites only change when a band's standing models change (keyed, so polls that change nothing never rebuild)
  const siteKey = JSON.stringify(
    bands.flatMap(({ march }) => sitesOf(march))
  );
  const sites = useMemo<HeroSite[]>(() => JSON.parse(siteKey), [siteKey]);

  const byId = useRef(new Map<string, BandMarchEntry>());
  byId.current = new Map(bands.map((b) => [b.march.id, b]));
  const heightRef = useRef(heightAt);
  heightRef.current = heightAt;

  // What each model is doing: walking on the road, fighting at the walls, standing after it
  const live = useMemo(() => {
    const out: Record<string, BossLive> = {};
    for (const { march, phase, circling } of bands) {
      const walking = phase === "marching" || phase === "returning" || phase === "defeat" || circling;
      for (const s of sitesOf(march)) out[s.id] = { fightYaw: phase === "fighting" && !circling ? 0 : null, slumbering: false, marching: walking, face: 0 };
    }
    return out;
  }, [bands]);

  const place = useMemo(
    () =>
      (siteId: string): SitePlacement | null => {
        const cut = siteId.lastIndexOf(":");
        const entry = byId.current.get(siteId.slice(0, cut));
        if (!entry) return null;
        const { march: m, phase } = entry;
        const champ = siteId.slice(cut + 1) === CHAMP;
        const i = champ ? 0 : Number(siteId.slice(cut + 1));
        const n = champ ? 1 : bandModelsStanding(m);
        const f = frameOf(m);
        const now = Date.now();
        // Marches that left together walk side by side as one host
        const shift = hostShift(m, f);
        const startX = m.startX + f.dir.x * (DEPART_OFFSET + (champ ? CHAMPION_LEAD : 0)) + shift.x;
        const startZ = m.startZ + f.dir.z * (DEPART_OFFSET + (champ ? CHAMPION_LEAD : 0)) + shift.z;
        // A champion walks and fights a little ahead of its soldiers
        const lead = champ ? CHAMPION_LEAD : 0;
        const lineX = m.targetX - f.dir.x * (STANDOFF - lead) + shift.x;
        const lineZ = m.targetZ - f.dir.z * (STANDOFF - lead) + shift.z;
        // Where it fights: its place in the ring round the target
        const place = ringPlace(m);
        const ring = place.frame;
        const ringAt = STANDOFF - lead + place.rank * RING_RANK_GAP;
        const ringX = m.targetX - ring.dir.x * ringAt;
        const ringZ = m.targetZ - ring.dir.z * ringAt;
        let x: number;
        let z: number;
        let yaw = f.yaw;
        const along = (fromX: number, fromZ: number, toX: number, toZ: number, t0: number, t1: number) => {
          const t = Math.min(1, Math.max(0, (now - t0) / Math.max(1, t1 - t0)));
          return { x: fromX + (toX - fromX) * t, z: fromZ + (toZ - fromZ) * t };
        };
        if (phase === "marching") {
          const a = rankSlot(i, n, f, startX, startZ);
          const b = rankSlot(i, n, f, lineX, lineZ);
          ({ x, z } = along(a.x, a.z, b.x, b.z, m.departTime, m.arrivalTime));
        } else if (phase === "returning") {
          const a = rankSlot(i, n, f, lineX, lineZ, -1);
          const b = rankSlot(i, n, f, startX, startZ, -1);
          const left = returnStartOf(m);
          // An army on the far side walks round the target first, then takes its road home
          const t0 = place.moved ? left + RING_WALK_MS : left;
          if (now < t0) {
            const from = rankSlot(i, n, ring, ringX, ringZ, -1);
            ({ x, z, yaw } = arcStep(from.x, from.z, a.x, a.z, m.targetX, m.targetZ, Math.max(0, (now - left) / RING_WALK_MS)));
          } else {
            ({ x, z } = along(a.x, a.z, b.x, b.z, t0, m.returnTime ?? t0 + 30_000));
            yaw += Math.PI;
          }
        } else if (phase === "defeat") {
          // Falls back from the walls once the battle is over
          const p = rankSlot(i, n, ring, ringX, ringZ);
          const at = battleEndOf(m);
          ({ x, z } = along(p.x, p.z, p.x - ring.dir.x * RETREAT_DISTANCE, p.z - ring.dir.z * RETREAT_DISTANCE, at, at + OUTCOME_MS));
          yaw = ring.yaw + Math.PI;
        } else if (phase === "fighting" && walkingToRing(m, place, now)) {
          const from = rankSlot(i, n, f, lineX, lineZ);
          const to = rankSlot(i, n, ring, ringX, ringZ);
          ({ x, z, yaw } = arcStep(from.x, from.z, to.x, to.z, m.targetX, m.targetZ, (now - m.arrivalTime) / RING_WALK_MS));
        } else {
          ({ x, z } = rankSlot(i, n, ring, ringX, ringZ));
          yaw = ring.yaw;
        }
        return { x, y: heightRef.current(x, z), z, yaw };
      },
    []
  );

  if (sites.length === 0) return null;
  return <BossBatch sites={sites} live={live} place={place} />;
}
