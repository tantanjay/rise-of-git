import * as THREE from "three";
import type { MercRarity } from "@/types";
import type { Shape } from "@/components/3d/city/parts";
import type { SubPart } from "@/components/3d/city/actorTemplates";
import { BossBone, BossShape } from "./bossRigs";
import { MERCENARY_RIGS } from "./mercenaryRigs";

/*
 * 🪙 Mercenary bands on the march in Normal graphics (GAME_GUIDE §13 *Mercenaries*): each band walks as its own
 * mercenaries, not as soldiers. A mercenary's Normal rig (the Codex model, `MERCENARY_RIGS`) is baked once at rest into
 * an actor template of its biggest parts, so a band is drawn by `Actors` like any other figure: one instanced mesh per
 * shape shared by every kind, and its parts take only shapes the soldiers already draw, so a band adds no draws.
 * The rings and halos of the rig (tori) stay out, as do its ground parts and its smallest bits; the figure moves whole
 * (the march's bob and lunge), as the soldiers do. High graphics walks the full rigged models (`BandMarches`).
 */

/** A band model's actor kind: its rig key (`merc-…`) */
export type MercKind = `merc-${string}`;
export const isMercKind = (kind: string): kind is MercKind => kind.startsWith("merc-");

/** Map scale of a mercenary model by rarity (they stand about 2.3–3.1 tall in the Codex; a soldier on the map is ~1.2) */
export const BAND_SCALE: Record<MercRarity, number> = { common: 0.48, uncommon: 0.5, rare: 0.52, epic: 0.56, legendary: 0.68 };

/** The most parts a baked mercenary keeps: enough to read its silhouette, weapon and colours at map distance */
const MAX_PARTS = 18;
/** Parts smaller than this every way (rig units, a man ~2 tall) are left out (rivets, fingers, eyes) */
const MIN_SIZE = 0.07;

/**
 * The nearest actor shape among those the soldiers already draw (`null`: left out), so a band adds no draws: spikes and
 * blades become cones, a cylinder tapering to a point a cone, a glowing rod a glowing box
 */
function shapeOf(s: BossShape, t?: number, glow?: boolean): Shape | null {
  switch (s) {
    case "box":
      return "box";
    case "sph":
    case "dod":
    case "ico":
      return "sphere";
    case "cone":
      return "cone";
    case "spike":
    case "blade":
      return "cone";
    case "cyl":
      return t !== undefined && t < 0.45 ? "cone" : glow ? "box" : "cyl";
    case "oct":
      return "octa";
    default:
      return null;
  }
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _local = new THREE.Matrix4();

/** Bake a rig at rest into actor parts (the root's own parts are its ground: left out) */
function bake(type: string): SubPart[] {
  const rig = MERCENARY_RIGS[type];
  if (!rig) return [];
  const out: Array<{ part: SubPart; score: number }> = [];
  const walk = (b: BossBone, parent: THREE.Matrix4, root: boolean) => {
    const r = b.r ?? [0, 0, 0];
    const m = parent.clone().multiply(_local.compose(_p.set(...b.at), _q.setFromEuler(_e.set(r[0], r[1], r[2], "XYZ")), _s.setScalar(b.s0 ?? 1)));
    if (!root) {
      for (const p of b.parts) {
        const shape = shapeOf(p.s, p.t, p.glow);
        if (!shape) continue;
        const pr = p.r ?? [0, 0, 0];
        _m.copy(m).multiply(_local.compose(_p.set(...p.p), _q.setFromEuler(_e.set(pr[0], pr[1], pr[2], "XYZ")), _s.set(...p.z)));
        _m.decompose(_p, _q, _s);
        if (Math.max(_s.x, _s.y, _s.z) < MIN_SIZE) continue;
        _e.setFromQuaternion(_q, "YXZ");
        // Bigger parts first (by their mean size, and their length, so a spear or a scythe's shaft stays); what glows is
        // the accent, so it counts for more
        const score = (0.6 * Math.cbrt(_s.x * _s.y * _s.z) + 0.25 * Math.max(_s.x, _s.y, _s.z)) * (p.glow ? 1.6 : 1);
        out.push({ part: { shape, x: _p.x, y: _p.y, z: _p.z, w: _s.x, h: _s.y, d: _s.z, rx: _e.x, ry: _e.y, rz: _e.z, color: p.c, glow: p.glow }, score });
      }
    }
    for (const k of b.kids ?? []) walk(k, m, false);
  };
  walk(rig.root, new THREE.Matrix4().makeTranslation(0, rig.float ?? 0, 0), true);
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PARTS)
    .map((o) => o.part);
}

const baked = new Map<string, SubPart[]>();

/** A mercenary's actor template (baked once per type) */
export function mercTemplate(kind: MercKind): SubPart[] {
  let t = baked.get(kind);
  if (!t) baked.set(kind, (t = bake(kind)));
  return t;
}
