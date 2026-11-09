import * as THREE from "three";
import { Kit, V3 } from "./heroKit";
import { HeroCtx } from "./heroLandmarks";
import type { HeroAuraSite } from "./HeroAura";

/* ------------------------------------------------------------------------- */
/* Rigged heroes: one-of-a-kind creatures (world bosses) posed on the CPU     */
/* ------------------------------------------------------------------------- */

/*
 * A rigged hero is hand-built on the hero kit like the batched heroes, but every part rides a bone. The model is built at
 * its rest pose; each bone is a pivot (and the frame it was made in, which its pose turns in) under a parent. Every
 * frame the CPU poses each boss (its relaxed rest pose, a layered idle with seeded events, keyed actions through a
 * Hermite spline with holds, per-bone lag so chains whip, springs that follow through) and writes one matrix a bone into
 * the batch's bone texture; the hero materials move each vertex by its bone (`heroMaterials.ts`). So a boss costs no
 * draw of its own: every boss on the map shares the same handful of draws however many bones they have.
 */

/** A bone's pose: turn (yaw, pitch, roll in its own frame, order YXZ), shift, swell (1 + s) and glow (1 + g) */
export interface BonePose {
  r?: V3;
  p?: V3;
  s?: number;
  g?: number;
}
export type Pose = Record<string, BonePose>;

/** Channels a bone carries: r (3), p (3), s, g */
const CH = 8;

export interface RigBone {
  name: string;
  parent: number;
  pivot: THREE.Vector3;
  /** The frame the bone was made in (its pose turns in it) and that frame's size (its shifts grow with it) */
  quat: THREE.Quaternion;
  scale: number;
}

/** A builder's context: the hero kit's, plus bones */
export interface BossCtx extends HeroCtx {
  /** A bone pivoting at `pivot` (in the kit's current frame) under the current one; everything `body` adds rides it */
  bone: (name: string, pivot: V3, body: () => void) => void;
}

/** Collects a rigged hero's bones while its parts are added; bone indices start at `base` (several heroes share a texture) */
export class RigBuilder {
  bones: RigBone[] = [];
  private cur = -1;
  constructor(
    readonly k: Kit,
    readonly base: number
  ) {}

  bone = (name: string, pivot: V3, body: () => void) => {
    const m = this.k.current();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    m.decompose(pos, quat, sc);
    const i = this.bones.length;
    this.bones.push({ name, parent: this.cur, pivot: new THREE.Vector3(...pivot).applyMatrix4(m), quat, scale: sc.x });
    const prev = this.cur;
    const prevBone = this.k.bone;
    this.cur = i;
    this.k.bone = this.base + i;
    body();
    this.cur = prev;
    this.k.bone = prevBone;
  };
}

/* ------------------------------ actions, idle, effects ------------------------------ */

/** Screen effects for an impact (Codex only): quake, a tinted flash, speed lines, a vignette, hit-stop (seconds) */
export interface Cine {
  quake?: number;
  flash?: number;
  flashCol?: string;
  lines?: number;
  vig?: number;
  vigCol?: string;
  stop?: number;
}

export interface PoseKey {
  t: number;
  pose: Pose;
  /** The motion settles here (zero velocity) instead of carrying through */
  hold?: boolean;
}

export interface BossAction {
  /** Seconds */
  len: number;
  /** Keyed poses over u 0–1, as offsets from the rest pose (the first and last usually `{}`) */
  keys: PoseKey[];
  /** Impacts: at `u` the cinematic layer fires and (with `burst`) the boss's burst of spray, sand or venom bursts */
  hits?: Array<{ u: number; cine: Cine; burst?: boolean }>;
  /** How much of the idle stays on through it (default 0.35) */
  idle?: number;
}

export type BossActionId = "idle" | "roar" | "attack" | "slumber" | "walk";
export const BOSS_ACTIONS: Array<{ id: BossActionId; label: string }> = [
  { id: "idle", label: "Idle" },
  { id: "roar", label: "Roar" },
  { id: "attack", label: "Attack" },
  { id: "slumber", label: "Slumbering" }
];

/** The idle's tools: layered sines, seeded events and glances, all from the boss's own seed */
export class IdleCtx {
  t = 0;
  /** How much of the idle is on (it fades under an action) */
  w = 1;
  /** How much an action is on, eased over about a second (a flyer settles to hover over its roost as one takes over) */
  busy = 0;
  /** It slumbers (a phantom rising) */
  asleep = false;
  /**
   * The action playing and how far through it (0–1), for a hero whose actions are paths rather than poses (the Oathbound's
   * koi swim a braid on the march and a figure of eight in battle): it carries those bones itself, at full weight
   */
  action: BossActionId = "idle";
  u = 0;
  constructor(
    private player: RigPlayer,
    readonly seed: number
  ) {}

  /** Adds to a bone's pose (scaled by the idle's weight) */
  add(bone: string, r: V3 | null, p?: V3 | null, s = 0, g = 0) {
    this.player.addTo(bone, this.w, r, p, s, g);
  }

  /**
   * Adds to a bone's pose at full weight whatever action is on: what the actions play on top of (a flyer's path, its
   * heading and bank), eased out by the idle itself through `busy`
   */
  carry(bone: string, r: V3 | null, p?: V3 | null) {
    this.player.addTo(bone, 1, r, p);
  }

  /** A sine at `f` rad/s with this boss's own phase for `ph` */
  sin(f: number, ph = 0) {
    return Math.sin(this.t * f + ph + this.seed * 6.13);
  }

  /** Two incommensurate sines (a motion that never quite repeats) */
  drift(f: number, ph = 0) {
    return Math.sin(this.t * f + ph + this.seed * 4.7) * 0.65 + Math.sin(this.t * f * 2.37 + ph * 1.7 + this.seed * 9.1) * 0.35;
  }

  /**
   * A seeded event once in every slot of `gap` seconds, lasting `dur`: its envelope (eased in and out) and a value 0–1 for
   * this occurrence (which way, how big). The same every load.
   */
  event(key: number, gap: number, dur: number): { e: number; k: number } {
    const t = this.t + this.seed * 37 + key * 11.3;
    const slot = Math.floor(t / gap);
    const start = hash01(slot * 7.31 + key * 3.7 + this.seed) * Math.max(0, gap - dur);
    const x = (t - slot * gap - start) / dur;
    const e = x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2;
    return { e, k: hash01(slot * 2.17 + key * 5.3 + this.seed * 1.9) };
  }

  /** A glance: a value in −1–1 that snaps to a new seeded target every `gap` or so (a head looking round) */
  glance(key: number, gap: number, snap = 0.3): number {
    const t = this.t + this.seed * 29 + key * 7.7;
    const slot = Math.floor(t / gap);
    const at = (i: number) => hash01(i * 4.13 + key * 9.1 + this.seed * 2.3) * 2 - 1;
    const turn = hash01(slot * 1.7 + key) * gap * 0.6;
    const local = t - slot * gap;
    if (local < turn) return at(slot - 1);
    return at(slot - 1) + (at(slot) - at(slot - 1)) * smooth((local - turn) / snap);
  }
}

/** One world boss (a rigged hero) */
export interface BossHeroDef {
  build: (c: BossCtx) => void;
  /** Its relaxed rest pose, offsets on the built model (elbows bent, sides never mirrored) */
  rest?: Pose;
  /** Its layered idle */
  idle: (c: IdleCtx) => void;
  roar: BossAction;
  attack: BossAction;
  /** Its march, a cycle of two steps played on a loop in place (a mercenary band walking); none for a boss that never walks */
  walk?: BossAction;
  /** Bones that trail in an action (seconds behind), so chains drag and whip */
  lag?: Record<string, number>;
  /** Bones that follow through on a spring (stiffness; lower is looser) and drag against their parent's turn */
  springs?: Record<string, number>;
  /** Where its burst of spray, sand or venom bursts (rest model space) and what it is */
  burst?: { at: V3; color: string; count: number; speed: number; spread: number; size: number; gravity?: number };
  /** Its legendary embers (no beam and no curtain over a boss: creatures get sparkles); none below rare (the ladder) */
  aura?: Omit<HeroAuraSite, "x" | "y" | "z">;
  /** How tall it stands on the map (the hover/click target) */
  height: number;
  /** How the Codex frames it: camera distance, camera height, look-at height */
  frame: [number, number, number];
  /** Ambient sparks round it while it is awake (spray, mist, sand, embers) */
  sparks?: (c: HeroCtx) => void;
  /** The Codex's action buttons, when not a world boss's four (a creature that never slumbers names its roar and attack) */
  actions?: Array<{ id: BossActionId; label: string }>;
}

/* ------------------------------ the player: poses a boss every frame ------------------------------ */

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};

/** Cubic Hermite through the keys (Catmull-Rom tangents, zero at a hold), channel range [lo, hi) at u, into `out` */
function hermite(u: number, keys: Array<{ t: number; v: Float32Array; hold?: boolean }>, cyclic: boolean, lo: number, hi: number, out: Float32Array) {
  const n = keys.length;
  let i = 0;
  while (i < n - 2 && u > keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const h = Math.max(0.0001, k1.t - k0.t);
  const s = clamp01((u - k0.t) / h);
  const nb = (j: number) => {
    if (j < 0) return cyclic ? { t: keys[n - 2].t - 1, v: keys[n - 2].v } : keys[0];
    if (j >= n) return cyclic ? { t: keys[1].t + 1, v: keys[1].v } : keys[n - 1];
    return keys[j];
  };
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const a0 = nb(i - 1);
  const b0 = nb(i + 1);
  const a1 = nb(i);
  const b1 = nb(i + 2);
  const sp0 = Math.max(0.0001, b0.t - a0.t);
  const sp1 = Math.max(0.0001, b1.t - a1.t);
  for (let d = lo; d < hi; d++) {
    const m0 = k0.hold ? 0 : (b0.v[d] - a0.v[d]) / sp0;
    const m1 = k1.hold ? 0 : (b1.v[d] - a1.v[d]) / sp1;
    out[d] = h00 * k0.v[d] + h01 * k1.v[d] + h10 * h * m0 + h11 * h * m1;
  }
}

interface FlatAction {
  def: BossAction;
  keys: Array<{ t: number; v: Float32Array; hold?: boolean }>;
}

/** What the map (or the Codex) asks of a boss this frame */
export interface BossLive {
  /** Armies are fighting it from this direction (yaw): it faces them and attacks on a loop */
  fightYaw: number | null;
  /** A phantom rising where the last boss fell */
  slumbering: boolean;
  /** The Codex: play this action on a loop */
  action?: BossActionId;
  /** On the march: it walks (when it has a walk) */
  marching?: boolean;
  /** Faces this way (in its own frame) instead of glancing round: a mercenary on the march looks where it goes */
  face?: number;
  /** Epoch ms of its last battle cry (a Finale, Enrage waking): it breaks off to roar once */
  cryAt?: number;
}

const ROAR_GAP = 12;
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _v = new THREE.Vector3();

/** Poses one boss every frame and writes its bones into the batch's bone texture */
export class RigPlayer {
  readonly n: number;
  /** Texture slots it writes from `base`: its bones, then its facing */
  readonly slots: number;
  private index = new Map<string, number>();
  private vals: Float32Array;
  private prev: Float32Array;
  private tmp: Float32Array;
  private restV: Float32Array;
  private lagOf: Float32Array;
  private springK: Float32Array;
  private springX: Float32Array;
  private springVel: Float32Array;
  private parentLast: Float32Array;
  private world: THREE.Matrix4[];
  /** The root turned to where the creature faces: what the root's child bones hang from */
  private facing = new THREE.Matrix4();
  private acts: { roar: FlatAction; attack: FlatAction; walk?: FlatAction };
  private idleCtx: IdleCtx;
  private action: BossActionId = "idle";
  private local = 0;
  private blendFrom = 0;
  private hitStop = 0;
  private lastHit = -1;
  private yaw = 0;
  private quake = 0;
  private quakeT = 0;
  private hitAge = 99;
  private idleT = 0;
  private roarAt: number;
  private cryAt = 0;
  private crying = false;

  constructor(
    readonly def: BossHeroDef,
    readonly bones: RigBone[],
    readonly base: number,
    readonly seed: number
  ) {
    this.n = bones.length;
    this.slots = this.n + 1;
    bones.forEach((b, i) => this.index.set(b.name, i));
    const size = this.n * CH;
    this.vals = new Float32Array(size);
    this.prev = new Float32Array(size);
    this.tmp = new Float32Array(size);
    this.restV = this.flatten(def.rest ?? {});
    this.lagOf = new Float32Array(this.n);
    this.springK = new Float32Array(this.n);
    for (const [name, lag] of Object.entries(def.lag ?? {})) {
      const i = this.index.get(name);
      if (i !== undefined) this.lagOf[i] = lag;
    }
    for (const [name, k] of Object.entries(def.springs ?? {})) {
      const i = this.index.get(name);
      if (i !== undefined) this.springK[i] = k;
    }
    this.springX = new Float32Array(this.n * 3);
    this.springVel = new Float32Array(this.n * 3);
    this.parentLast = new Float32Array(this.n * 3);
    this.world = bones.map(() => new THREE.Matrix4());
    const flat = (a: BossAction): FlatAction => ({ def: a, keys: a.keys.map((k) => ({ t: k.t, hold: k.hold, v: this.flatten(k.pose) })) });
    this.acts = { roar: flat(def.roar), attack: flat(def.attack), walk: def.walk && flat(def.walk) };
    this.idleCtx = new IdleCtx(this, seed);
    this.roarAt = ROAR_GAP * (0.5 + seed);
  }

  /** A pose as channel values (unknown bones are left out) */
  private flatten(p: Pose): Float32Array {
    const v = new Float32Array(this.n * CH);
    for (const [name, bp] of Object.entries(p)) {
      const i = this.index.get(name);
      if (i === undefined) continue;
      const o = i * CH;
      if (bp.r) v.set(bp.r, o);
      if (bp.p) v.set(bp.p, o + 3);
      v[o + 6] = bp.s ?? 0;
      v[o + 7] = bp.g ?? 0;
    }
    return v;
  }

  addTo(name: string, w: number, r: V3 | null, p?: V3 | null, s = 0, g = 0) {
    const i = this.index.get(name);
    if (i === undefined) return;
    const o = i * CH;
    if (r) {
      this.vals[o] += r[0] * w;
      this.vals[o + 1] += r[1] * w;
      this.vals[o + 2] += r[2] * w;
    }
    if (p) {
      this.vals[o + 3] += p[0] * w;
      this.vals[o + 4] += p[1] * w;
      this.vals[o + 5] += p[2] * w;
    }
    this.vals[o + 6] += s * w;
    this.vals[o + 7] += g * w;
  }

  /**
   * One frame: picks the action (the Codex's, or attack while fought, a roar now and then, slumbering), poses every bone
   * and writes the bones into `tex` (four texels each). `cine` gets the impacts' screen effects (the Codex).
   */
  update(rawDt: number, live: BossLive, tex: Float32Array, cine?: (c: Cine) => void) {
    const dt = Math.min(0.05, rawDt) * (this.hitStop > 0 ? 0.06 : 1);
    this.hitStop = Math.max(0, this.hitStop - Math.min(0.05, rawDt));
    this.hitAge += Math.min(0.05, rawDt);
    const slumbering = live.action ? live.action === "slumber" : live.slumbering;
    // The idle clock runs slow while it slumbers
    this.idleT += dt * (slumbering ? 0.5 : 1);

    // Which action
    let want: BossActionId = live.action ?? (slumbering ? "slumber" : live.fightYaw !== null ? "attack" : live.marching ? "walk" : "idle");
    // Only a creature with a march walks
    if (want === "walk" && !this.acts.walk) want = "idle";
    if (!live.action && want === "idle") {
      // On the map a boss roars now and then (as the Normal one rears up)
      if (this.action === "roar" && this.local < this.acts.roar.def.len) want = "roar";
      else if (this.idleT > this.roarAt) {
        this.roarAt = this.idleT + ROAR_GAP + hash01(this.idleT * 0.37 + this.seed) * 6;
        want = "roar";
      }
    }
    // A battle cry breaks into the fight: one roar from the start, then back to it
    if (!live.action && !slumbering && live.cryAt && live.cryAt !== this.cryAt) {
      this.cryAt = live.cryAt;
      this.crying = true;
      if (this.action === "roar") this.action = "idle";
    }
    if (this.crying) {
      if (this.action === "roar" && this.local >= this.acts.roar.def.len) this.crying = false;
      else want = "roar";
    }
    if (want !== this.action) {
      this.prev.set(this.vals);
      this.blendFrom = 1;
      this.action = want;
      this.local = 0;
      this.lastHit = -1;
    }
    this.local += dt;
    this.blendFrom = Math.max(0, this.blendFrom - dt / 0.35);

    // Rest, then the idle, then the action
    this.vals.set(this.restV);
    const act = this.action === "roar" || this.action === "attack" || this.action === "walk" ? this.acts[this.action] ?? null : null;
    // An attack and a march loop
    const looping = this.action === "attack" || this.action === "walk";
    let u = 0;
    if (act) {
      const len = act.def.len;
      // The Codex replays a roar after a breath
      const span = this.action === "roar" && live.action === "roar" ? len + 1.6 : len;
      u = looping ? (this.local % len) / len : Math.min(1, (this.local % span) / len);
    }
    const ic = this.idleCtx;
    ic.t = this.idleT;
    ic.w = act ? act.def.idle ?? 0.35 : 1;
    ic.busy += ((act ? 1 : 0) - ic.busy) * Math.min(1, dt * 1.8);
    ic.asleep = slumbering;
    ic.action = act ? this.action : "idle";
    ic.u = u;
    this.def.idle(ic);
    if (act) {
      const cyclic = looping;
      for (let b = 0; b < this.n; b++) {
        const lag = this.lagOf[b] / act.def.len;
        const ub = cyclic ? (((u - lag) % 1) + 1) % 1 : clamp01(u - lag);
        hermite(ub, act.keys, cyclic, b * CH, b * CH + CH, this.tmp);
        for (let d = b * CH; d < b * CH + CH; d++) this.vals[d] += this.tmp[d];
      }
      // Impacts
      const hits = act.def.hits ?? [];
      let idx = -1;
      hits.forEach((h, i) => {
        if (u >= h.u) idx = i;
      });
      if (idx !== this.lastHit) {
        if (idx >= 0) {
          const h = hits[idx];
          if (cine) {
            cine(h.cine);
            if (h.cine.stop) this.hitStop = Math.max(this.hitStop, h.cine.stop);
            if (h.cine.quake) {
              this.quake = Math.max(this.quake, h.cine.quake);
              this.quakeT = 0;
            }
          }
          if (h.burst) this.hitAge = 0;
        }
        this.lastHit = idx;
      }
    }
    // Cross-fade from where it was when the action changed
    if (this.blendFrom > 0) {
      const w = smooth(this.blendFrom);
      for (let d = 0; d < this.vals.length; d++) this.vals[d] += (this.prev[d] - this.vals[d]) * w;
    }

    // Springs: the bone follows its target on a spring, dragged back against its parent's turn
    const rdt = Math.max(0.001, Math.min(0.05, rawDt));
    for (let b = 0; b < this.n; b++) {
      const k = this.springK[b];
      if (!k) continue;
      const par = this.bones[b].parent;
      for (let a = 0; a < 3; a++) {
        const parentNow = par >= 0 ? this.vals[par * CH + a] : 0;
        const pv = (parentNow - this.parentLast[b * 3 + a]) / rdt;
        this.parentLast[b * 3 + a] = parentNow;
        const target = this.vals[b * CH + a] - Math.max(-2, Math.min(2, pv)) * 0.06;
        const x = this.springX[b * 3 + a];
        const v = this.springVel[b * 3 + a] + (k * (target - x) - 2 * Math.sqrt(k) * 0.55 * this.springVel[b * 3 + a]) * rdt;
        this.springVel[b * 3 + a] = v;
        this.springX[b * 3 + a] = x + v * rdt;
        this.vals[b * CH + a] = this.springX[b * 3 + a];
      }
    }

    // Face the attackers (or glance slowly round), the shortest way, the yaw kept within ±π. The turn, the phantom's drift
    // and the quake are applied to the bones below, never written into the pose: the pose is what a cross-fade blends
    // from, so a turn kept in it would be added twice while a new action fades in (a fought boss spun right round)
    const target = live.fightYaw ?? live.face ?? (slumbering || live.action ? 0 : Math.sin(this.idleT * 0.17 + this.seed * 10) * 0.45);
    const dy = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    const yaw = this.yaw + dy * Math.min(1, Math.min(0.05, rawDt) * 2.5);
    this.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    let ox = 0;
    const oy = slumbering ? 0.35 + Math.sin(this.idleT * 1.6) * 0.25 : 0;
    let oz = 0;
    if (this.quake > 0.001) {
      this.quakeT += Math.min(0.05, rawDt);
      const q = this.quake * Math.exp(-this.quakeT * 9);
      ox += Math.sin(this.quakeT * 71) * q;
      oz += Math.sin(this.quakeT * 53 + 1.3) * q;
      if (q < 0.001) this.quake = 0;
    }

    // Bones: parent × (pivot, frame, turn, swell, frame⁻¹, −pivot), in order (parents come first). The root holds the
    // ground the boss stands on (a pool, sand, rocks, a lair): it drifts and quakes with the boss but never turns; the
    // bones hanging off it (the creature) turn about the root's pivot, in `facing`
    for (let b = 0; b < this.n; b++) {
      const bone = this.bones[b];
      const o = b * CH;
      _q.copy(bone.quat);
      _qi.copy(bone.quat).invert();
      _v.set(this.vals[o + 3], this.vals[o + 4], this.vals[o + 5]);
      if (b === 0) {
        _v.x += ox;
        _v.y += oy;
        _v.z += oz;
      }
      _v.multiplyScalar(bone.scale).applyQuaternion(bone.quat).add(bone.pivot);
      _m.makeTranslation(_v.x, _v.y, _v.z);
      _m.multiply(_t.makeRotationFromQuaternion(_q));
      _e.set(this.vals[o], this.vals[o + 1], this.vals[o + 2]);
      _m.multiply(_t.makeRotationFromEuler(_e));
      const sw = Math.max(0.01, 1 + this.vals[o + 6]);
      _m.multiply(_t.makeScale(sw, sw, sw));
      _m.multiply(_t.makeRotationFromQuaternion(_qi));
      _m.multiply(_t.makeTranslation(-bone.pivot.x, -bone.pivot.y, -bone.pivot.z));
      const w = this.world[b];
      if (bone.parent === 0) w.multiplyMatrices(this.facing, _m);
      else if (bone.parent >= 0) w.multiplyMatrices(this.world[bone.parent], _m);
      else {
        w.copy(_m);
        // Where the creature faces: the root turned by the yaw about its pivot, in its frame
        this.facing
          .makeTranslation(bone.pivot.x, bone.pivot.y, bone.pivot.z)
          .multiply(_t.makeRotationFromQuaternion(_q))
          .multiply(_t.makeRotationY(this.yaw))
          .multiply(_t.makeRotationFromQuaternion(_qi))
          .multiply(_t.makeTranslation(-bone.pivot.x, -bone.pivot.y, -bone.pivot.z))
          .premultiply(w);
      }
      writeBone(tex, this.base + b, w, slumbering ? 1 : 0, Math.max(0, 1 + this.vals[o + 7]), 0);
    }
    // One slot past the bones: the facing, with how long since its last burst (the burst sparks ride it)
    writeBone(tex, this.base + this.n, this.facing, slumbering ? 1 : 0, 1, this.hitAge);
  }
}

/** A bone's matrix (three rows), then ghost, glow and burst age, at texture slot `slot` */
function writeBone(tex: Float32Array, slot: number, w: THREE.Matrix4, ghost: number, glow: number, age: number) {
  const e = w.elements;
  const at = slot * 16;
  tex[at] = e[0];
  tex[at + 1] = e[4];
  tex[at + 2] = e[8];
  tex[at + 3] = e[12];
  tex[at + 4] = e[1];
  tex[at + 5] = e[5];
  tex[at + 6] = e[9];
  tex[at + 7] = e[13];
  tex[at + 8] = e[2];
  tex[at + 9] = e[6];
  tex[at + 10] = e[10];
  tex[at + 11] = e[14];
  tex[at + 12] = ghost;
  tex[at + 13] = glow;
  tex[at + 14] = age;
  tex[at + 15] = 0;
}
