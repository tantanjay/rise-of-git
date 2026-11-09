import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { BattleStatusKind } from "@/types";
import { AFTERMATH_LOOKS, INSTINCT_LOOKS, SPELL_LOOKS, SpellLook, SpellVoice, impactAt } from "@/utils/spellFx";
import { Rng, rngFor } from "@/utils/random";
import { useHd } from "@/utils/graphics";
import { sound } from "@/hooks/useSound";

/*
 * The spell-effects kit (docs/RENDERING.md): every Battle Arts cast, Finale, Instinct and status on screen in one batch of
 * GPU particles, one draw call however many casts are up and none when nothing is. A cast is written once into a ring of
 * particles (where it starts, where it goes, when, how it moves, its colour and shape) and the vertex shader moves each
 * from the clock alone, so React and the CPU do nothing per frame but advance one uniform.
 *
 * A look (`utils/spellFx.ts`) picks one option per stage: charge → core → trail → burst → reaction → aftermath; the
 * aftermath of a status loops on its army while the status holds. Nothing casts shadows or takes the pointer. Particles
 * glow additively; dust and blood also darken what is behind them (premultiplied alpha), all in the same draw.
 * In HD graphics (the effects kit's switch) every stage carries more particles and the motes get a white-hot core.
 */

/** Where an army stands for the kit: its ground point, how wide it is, and how high its caster's hand is */
export interface SpellSpot {
  x: number;
  y: number;
  z: number;
  /** Radius of the army (the unit the looks are sized by) */
  r: number;
  /** Height of the caster's hand / a boss's chest above the ground */
  h: number;
}

/** A reaction landing on a spot (the Sparring Grounds' stand-ins flash and jolt with it) */
export interface SpellHit {
  /** Store clock (s) */
  at: number;
  side: string;
  kind: "flinch" | "stagger" | "lift";
}

// Particle motions
const BALLISTIC = 0;
const TRAVEL = 1;
const SPIRAL = 2;
// Shapes (the fragment shader)
const GLOW = 0;
const SPARK = 1;
const RING = 2;
const SHARD = 3;
const FLAME = 4;
const SMOKE = 5;

/** Floats per particle: from 3, to 3, time 4, move 4, colour 4, shape 4 */
const STRIDE = 22;
/** One-shot particles (a ring: the oldest are written over), and the looping ones of the statuses after them */
const BURST_CAP = 6144;
const LOOP_CAP = 3072;
const CAP = BURST_CAP + LOOP_CAP;

const EPOCH = typeof performance !== "undefined" ? performance.now() : 0;
/** The kit's clock in seconds (every store shares it) */
export const spellNow = () => (performance.now() - EPOCH) / 1000;

/** The white flash of a flinch (soft: it adds onto the burst) */
const FLINCH = new THREE.Color("#cbd5e1");

interface Emit {
  from: [number, number, number];
  to: [number, number, number];
  start: number;
  life: number;
  mode: number;
  /** Mode parameters: ballistic (gravity, –, –), travel (arc, ease 0 linear · 1 out · 2 in, –), spiral (turn rate, start angle, –) */
  m1?: number;
  m2?: number;
  m3?: number;
  color: THREE.Color;
  /** 0 glows (additive) … 1 covers what is behind */
  occ?: number;
  size0: number;
  size1: number;
  shape: number;
  flicker?: number;
}

interface LoopGroup {
  until: number;
  slots: number[];
}

/** One view's casts: the map has MAP_SPELL_FX, the Sparring Grounds and the sound stages make their own */
export class SpellFxStore {
  readonly data = new Float32Array(CAP * STRIDE);
  /** Owner of each looping slot (a status group's key), so a group only stretches its own particles */
  private owner: Array<string | null> = new Array(LOOP_CAP).fill(null);
  private loops = new Map<string, LoopGroup>();
  private head = 0;
  private loopHead = 0;
  private dirtyLo = Infinity;
  private dirtyHi = -1;
  /** Store clock (s) when the last particle written dies */
  aliveUntil = -1;
  /** HD: more particles per stage */
  rich = 1;
  /** Sound cues waiting for their moment */
  cues: Array<{ at: number; kind: "cast" | "impact" | "finale"; voice: SpellVoice; x: number; y: number; z: number }> = [];
  /** Reactions on named spots */
  hits: SpellHit[] = [];

  /** Ranges written since the last upload (taken by the component) */
  takeDirty(): [number, number] | null {
    if (this.dirtyHi < 0) return null;
    const r: [number, number] = [this.dirtyLo, this.dirtyHi];
    this.dirtyLo = Infinity;
    this.dirtyHi = -1;
    return r;
  }

  private write(i: number, e: Emit, until = 0, phase = 0) {
    const o = i * STRIDE;
    const d = this.data;
    d[o] = e.from[0];
    d[o + 1] = e.from[1];
    d[o + 2] = e.from[2];
    d[o + 3] = e.to[0];
    d[o + 4] = e.to[1];
    d[o + 5] = e.to[2];
    d[o + 6] = e.start;
    d[o + 7] = e.life;
    d[o + 8] = until;
    d[o + 9] = phase;
    d[o + 10] = e.mode;
    d[o + 11] = e.m1 ?? 0;
    d[o + 12] = e.m2 ?? 0;
    d[o + 13] = e.m3 ?? 0;
    d[o + 14] = e.color.r;
    d[o + 15] = e.color.g;
    d[o + 16] = e.color.b;
    d[o + 17] = e.occ ?? 0;
    d[o + 18] = e.size0;
    d[o + 19] = e.size1;
    d[o + 20] = e.shape;
    d[o + 21] = e.flicker ?? 0;
    this.dirtyLo = Math.min(this.dirtyLo, i);
    this.dirtyHi = Math.max(this.dirtyHi, i);
  }

  emit(e: Emit) {
    this.write(this.head, e);
    this.head = (this.head + 1) % BURST_CAP;
    this.aliveUntil = Math.max(this.aliveUntil, e.start + e.life);
  }

  /** A looping particle of a status group, alive from e.start to `until` */
  private loop(key: string, group: LoopGroup, e: Emit, phase: number) {
    const slot = this.loopHead;
    this.loopHead = (this.loopHead + 1) % LOOP_CAP;
    const prev = this.owner[slot];
    if (prev && prev !== key) {
      const g = this.loops.get(prev);
      if (g) g.slots = g.slots.filter((s) => s !== slot);
    }
    this.owner[slot] = key;
    group.slots.push(slot);
    this.write(BURST_CAP + slot, e, group.until, phase);
  }

  /* ------------------------------ a cast, stage by stage ------------------------------ */

  /**
   * Plays a look from one army at another (or on its own, for `aim: "self"`), `delay` seconds from now. `hit` names the
   * spot the reaction lands on (the Sparring Grounds' stand-ins react to it). Returns the store time of the impact.
   */
  cast(look: SpellLook, from: SpellSpot, to: SpellSpot, opts: { delay?: number; seed: string; hit?: string; caster?: string; sound?: boolean } = { seed: "" }): number {
    const t0 = spellNow() + (opts.delay ?? 0);
    const rng = rngFor(`spell:${opts.seed}`);
    const big = look.finale ? 1.7 : 1;
    const col = new THREE.Color(look.color);
    const hot = new THREE.Color(look.hot);
    const n = (k: number) => Math.max(1, Math.round(k * this.rich));
    const wind = look.charge === "none" ? 0 : look.finale ? 0.9 : 0.6;
    const impact = t0 + impactAt(look);
    const self = look.aim === "self";
    const hand: [number, number, number] = [from.x, from.y + from.h, from.z];
    const target = self ? from : to;
    const aimAt: [number, number, number] = [target.x, target.y + Math.min(target.h, target.r) * 0.6, target.z];
    const r = from.r * big;

    // Charge
    if (look.charge === "gather") {
      for (let i = 0; i < n(18); i++) {
        const [dx, dy, dz] = sphere(rng, r * (1.2 + rng() * 0.8));
        const life = wind * (0.55 + rng() * 0.4);
        this.emit({ from: [hand[0] + dx, hand[1] + Math.abs(dy) * 0.6, hand[2] + dz], to: hand, start: t0 + rng() * (wind - life), life, mode: TRAVEL, m2: 2, color: i % 3 ? col : hot, size0: r * 0.22, size1: r * 0.08, shape: i % 2 ? SPARK : GLOW });
      }
    } else if (look.charge === "swirl") {
      for (let i = 0; i < n(22); i++) {
        this.emit({ from: [hand[0], hand[1] - r * 0.6, hand[2]], to: [r * (1.3 + rng() * 0.5), r * 0.1, r * 0.8], start: t0 + rng() * wind * 0.3, life: wind * (0.7 + rng() * 0.3), mode: SPIRAL, m1: 5 + rng() * 3, m2: rng() * 6.283, color: i % 3 ? col : hot, size0: r * 0.16, size1: r * 0.1, shape: SPARK });
      }
    } else if (look.charge === "rise") {
      for (let i = 0; i < n(22); i++) {
        const a = rng() * 6.283;
        const rr = from.r * (0.5 + rng() * 0.6);
        const life = wind * (0.6 + rng() * 0.4);
        this.emit({ from: [from.x + Math.cos(a) * rr, from.y + 0.1, from.z + Math.sin(a) * rr], to: [0, (from.h * 1.1 + r * 0.6) / life, 0], start: t0 + rng() * (wind - life), life, mode: BALLISTIC, color: i % 3 ? col : hot, size0: r * 0.2, size1: r * 0.06, shape: GLOW });
      }
    }

    // Core: swells in the hand, then flies (or blooms where it stands)
    const launch = t0 + wind;
    const travel = impact - launch;
    if (look.core !== "none") {
      const coreSize = look.core === "flare" ? r * 1.1 : look.core === "shard" ? r * 0.45 : look.core === "blade" ? r * 0.5 : r * 0.6;
      const shape = look.core === "shard" ? SHARD : look.core === "blade" ? SPARK : GLOW;
      const swell = Math.max(0.2, wind * 0.6);
      this.emit({ from: hand, to: [0, 0, 0], start: launch - swell, life: swell + (self ? 0.25 : 0.02), mode: BALLISTIC, color: col, size0: coreSize * 0.2, size1: coreSize, shape, flicker: 0.25 });
      this.emit({ from: hand, to: [0, 0, 0], start: launch - swell, life: swell + (self ? 0.2 : 0.02), mode: BALLISTIC, color: hot, size0: coreSize * 0.1, size1: coreSize * 0.5, shape: GLOW });
      if (look.core === "blade") {
        for (let i = 0; i < n(6); i++) {
          const a = -0.9 + (i / 5) * 1.8;
          this.emit({ from: [hand[0] + Math.sin(a) * r * 0.6, hand[1] + Math.cos(a) * r * 0.6, hand[2]], to: [0, 0, 0], start: launch - swell + i * 0.03, life: swell, mode: BALLISTIC, color: hot, size0: r * 0.2, size1: r * 0.12, shape: SPARK, flicker: 0.5 });
        }
      }
    }

    // The bolt in flight and its trail
    if (!self && look.trail !== "none") {
      const bolts = look.trail === "venom" ? 3 : 1;
      for (let b = 0; b < bolts; b++) {
        const off = bolts > 1 ? (b - 1) * to.r * 0.9 : 0;
        const end: [number, number, number] = [aimAt[0] + off * 0.6, aimAt[1], aimAt[2] + off];
        const arc = look.trail === "venom" ? r * 1.6 : look.trail === "streak" ? r * 0.2 : r * 0.7;
        const t1 = launch + b * 0.08;
        const coreShape = look.core === "shard" ? SHARD : GLOW;
        const coreSize = look.core === "shard" ? r * 0.45 : r * 0.55;
        this.emit({ from: hand, to: end, start: t1, life: travel, mode: TRAVEL, m1: arc, color: col, size0: coreSize, size1: coreSize, shape: coreShape, flicker: 0.2 });
        this.emit({ from: hand, to: end, start: t1, life: travel, mode: TRAVEL, m1: arc, color: hot, size0: coreSize * 0.45, size1: coreSize * 0.45, shape: GLOW });
        const count = n(look.trail === "streak" ? 14 : 22);
        for (let i = 0; i < count; i++) {
          const f = i / count;
          const p = arcPoint(hand, end, arc, f);
          const at = t1 + f * travel;
          if (look.trail === "flame") {
            this.emit({ from: p, to: [(rng() - 0.5) * r, r * (0.6 + rng()), (rng() - 0.5) * r], start: at, life: 0.35 + rng() * 0.25, mode: BALLISTIC, color: i % 3 ? col : hot, size0: r * 0.45, size1: r * 0.1, shape: FLAME });
          } else if (look.trail === "frost") {
            this.emit({ from: p, to: [(rng() - 0.5) * r * 0.5, -r * 0.4, (rng() - 0.5) * r * 0.5], start: at, life: 0.5 + rng() * 0.3, mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.22, size1: r * 0.05, shape: i % 2 ? SPARK : SHARD, flicker: 0.6 });
          } else if (look.trail === "venom") {
            this.emit({ from: p, to: [(rng() - 0.5) * r * 0.4, 0, (rng() - 0.5) * r * 0.4], start: at, life: 0.45, mode: BALLISTIC, m1: r * 3, color: col, occ: 0.4, size0: r * 0.18, size1: r * 0.12, shape: GLOW });
          } else {
            this.emit({ from: p, to: [0, 0, 0], start: at, life: 0.22, mode: BALLISTIC, color: hot, size0: r * 0.26, size1: r * 0.04, shape: SPARK });
          }
        }
      }
    }

    // Burst
    this.burst(look, from, target, aimAt, impact, rng, col, hot, big);

    // Reaction
    const rr = target.r * big;
    if (look.reaction === "flinch") {
      this.emit({ from: aimAt, to: [0, 0, 0], start: impact + 0.04, life: 0.22, mode: BALLISTIC, color: FLINCH, size0: rr * 1.3, size1: rr * 1.1, shape: GLOW });
    } else if (look.reaction === "stagger") {
      this.emit({ from: [target.x, target.y + 0.25, target.z], to: [0, 0, 0], start: impact + 0.04, life: 0.45, mode: BALLISTIC, color: hot, size0: rr * 0.3, size1: rr * 1.5, shape: RING });
    } else if (look.reaction === "lift") {
      for (let i = 0; i < n(14); i++) {
        const a = rng() * 6.283;
        const d = target.r * rng();
        this.emit({ from: [target.x + Math.cos(a) * d, target.y + 0.3, target.z + Math.sin(a) * d], to: [0, target.h + r * 1.5, 0], start: impact + rng() * 0.3, life: 0.7 + rng() * 0.3, mode: BALLISTIC, color: hot, size0: r * 0.18, size1: r * 0.04, shape: SPARK });
      }
    }
    if (opts.hit && look.reaction !== "none") {
      this.hits.push({ at: impact, side: look.reaction === "lift" ? opts.caster ?? opts.hit : opts.hit, kind: look.reaction });
      if (this.hits.length > 64) this.hits.splice(0, this.hits.length - 64);
    }
    if (opts.sound !== false) {
      this.cues.push({ at: t0, kind: look.finale ? "finale" : "cast", voice: look.voice, x: from.x, y: from.y, z: from.z });
      this.cues.push({ at: impact, kind: "impact", voice: look.voice, x: aimAt[0], y: aimAt[1], z: aimAt[2] });
    }
    return impact;
  }

  private burst(look: SpellLook, from: SpellSpot, target: SpellSpot, at: [number, number, number], t: number, rng: Rng, col: THREE.Color, hot: THREE.Color, big: number) {
    const n = (k: number) => Math.max(1, Math.round(k * this.rich * (look.finale ? 1.5 : 1)));
    const r = target.r * big;
    const ground: [number, number, number] = [target.x, target.y + 0.2, target.z];
    const flash = (p: [number, number, number], size: number, life = 0.32) => {
      this.emit({ from: p, to: [0, 0, 0], start: t, life, mode: BALLISTIC, color: hot, size0: size * 0.5, size1: size * 0.65, shape: GLOW });
      this.emit({ from: p, to: [0, 0, 0], start: t, life: life * 1.4, mode: BALLISTIC, color: col, size0: size * 0.4, size1: size * 0.8, shape: GLOW });
    };
    const sparks = (p: [number, number, number], count: number, speed: number, start = t, shape = SPARK, c = col) => {
      for (let i = 0; i < count; i++) {
        const [dx, dy, dz] = sphere(rng, speed * (0.5 + rng() * 0.7));
        this.emit({ from: p, to: [dx, Math.abs(dy) + speed * 0.3, dz], start, life: 0.5 + rng() * 0.4, mode: BALLISTIC, m1: speed * 0.9, color: i % 3 ? c : hot, size0: r * 0.16, size1: r * 0.03, shape, flicker: 0.3 });
      }
    };
    const spot = (spread: number): [number, number, number] => {
      const a = rng() * 6.283;
      const d = Math.sqrt(rng()) * spread;
      return [target.x + Math.cos(a) * d, target.y + 0.15, target.z + Math.sin(a) * d];
    };

    switch (look.burst) {
      case "flash":
        flash(at, r * 1.6);
        sparks(at, n(22), r * 3);
        break;
      case "shatter":
        flash(at, r * 1.4, 0.25);
        for (let i = 0; i < n(18); i++) {
          const [dx, dy, dz] = sphere(rng, r * (2 + rng() * 1.5));
          this.emit({ from: at, to: [dx, Math.abs(dy) * 0.8 + r, dz], start: t, life: 0.6 + rng() * 0.4, mode: BALLISTIC, m1: r * 3, color: i % 2 ? hot : col, size0: r * 0.35, size1: r * 0.12, shape: SHARD, flicker: 0.4 });
        }
        break;
      case "splash":
        for (let k = 0; k < 3; k++) {
          const p = spot(target.r * 1.1);
          const tk = t + k * 0.08;
          this.emit({ from: [p[0], p[1] + r * 0.4, p[2]], to: [0, r * 0.3, 0], start: tk, life: 0.9, mode: BALLISTIC, color: col, occ: 0.35, size0: r * 0.55, size1: r * 0.95, shape: SMOKE });
          for (let i = 0; i < n(10); i++) {
            const [dx, , dz] = sphere(rng, r * 1.4);
            this.emit({ from: p, to: [dx, r * (2 + rng() * 1.5), dz], start: tk, life: 0.6 + rng() * 0.3, mode: BALLISTIC, m1: r * 4, color: i % 3 ? col : hot, size0: r * 0.2, size1: r * 0.1, shape: GLOW });
          }
        }
        break;
      case "slash": {
        // A cut of light sweeping across the enemy line, side to side as seen from the caster
        const dx = target.x - from.x;
        const dz = target.z - from.z;
        const len = Math.hypot(dx, dz) || 1;
        const sx = -dz / len;
        const sz = dx / len;
        const count = n(16);
        for (let i = 0; i < count; i++) {
          const f = i / (count - 1) - 0.5;
          const p: [number, number, number] = [at[0] + sx * f * r * 2.6, at[1] + (0.5 - Math.abs(f)) * r * 0.6 - f * r * 0.5, at[2] + sz * f * r * 2.6];
          this.emit({ from: p, to: [0, 0, 0], start: t + (f + 0.5) * 0.12, life: 0.3, mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.5, size1: r * 0.08, shape: SPARK });
        }
        sparks(at, n(12), r * 2.4);
        break;
      }
      case "bolt": {
        // Two forks of lightning from the sky, each a jagged line of sparks lit at once
        for (let k = 0; k < 2; k++) {
          const p = spot(target.r * 0.9);
          const tk = t + k * 0.14;
          let x = p[0] + (rng() - 0.5) * r;
          let z = p[2] + (rng() - 0.5) * r;
          const top = p[1] + r * 9;
          const steps = n(16);
          for (let i = 0; i <= steps; i++) {
            const f = i / steps;
            x += (rng() - 0.5) * r * 0.45 + (p[0] - x) * 0.18;
            z += (rng() - 0.5) * r * 0.45 + (p[2] - z) * 0.18;
            this.emit({ from: [x, top + (p[1] - top) * f, z], to: [0, 0, 0], start: tk, life: 0.22, mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.45, size1: r * 0.3, shape: GLOW, flicker: 1 });
          }
          flash(p, r * 1.6, 0.25);
          sparks(p, n(10), r * 2.5, tk);
        }
        break;
      }
      case "dome": {
        // Shields close round the caster: motes fly out to a dome and hang there
        const count = n(30);
        for (let i = 0; i < count; i++) {
          const a = i * 2.39996;
          const up = 0.1 + 0.9 * ((i + 0.5) / count);
          const rad = Math.sqrt(1 - up * up);
          const R = r * 1.5;
          this.emit({ from: [target.x, target.y + target.h * 0.5, target.z], to: [target.x + Math.cos(a) * rad * R, target.y + up * R, target.z + Math.sin(a) * rad * R], start: t, life: 0.9, mode: TRAVEL, m2: 1, color: i % 2 ? hot : col, size0: r * 0.24, size1: r * 0.3, shape: SPARK, flicker: 0.3 });
        }
        this.emit({ from: [target.x, target.y + r * 0.7, target.z], to: [0, 0, 0], start: t, life: 0.8, mode: BALLISTIC, color: col, size0: r * 0.6, size1: r * 1.6, shape: RING });
        flash([target.x, target.y + r * 0.7, target.z], r * 1.5, 0.35);
        break;
      }
      case "nova": {
        const count = n(28);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * 6.283;
          const y = target.y + 0.4;
          this.emit({ from: [target.x + Math.cos(a) * r * 0.3, y, target.z + Math.sin(a) * r * 0.3], to: [target.x + Math.cos(a) * r * 2.4, y + r * 0.3, target.z + Math.sin(a) * r * 2.4], start: t, life: 0.7, mode: TRAVEL, m2: 1, color: i % 2 ? hot : col, size0: r * 0.35, size1: r * 0.08, shape: SPARK });
        }
        this.emit({ from: [target.x, target.y + r * 0.5, target.z], to: [0, 0, 0], start: t, life: 0.6, mode: BALLISTIC, color: col, size0: r * 0.3, size1: r * 2.1, shape: RING });
        flash([target.x, target.y + target.h, target.z], r * 1.4, 0.3);
        break;
      }
      case "sunburst": {
        // A sun rises over the caster and its rays sweep down over every enemy army
        const sun: [number, number, number] = [from.x, from.y + from.h + from.r * 2.4, from.z];
        this.emit({ from: sun, to: [0, 0, 0], start: t - 0.35, life: 1.4, mode: BALLISTIC, color: hot, size0: from.r * 0.7, size1: from.r * 2.3, shape: GLOW });
        this.emit({ from: sun, to: [0, 0, 0], start: t - 0.35, life: 1.6, mode: BALLISTIC, color: col, size0: from.r * 0.9, size1: from.r * 2.9, shape: RING });
        for (let i = 0; i < n(30); i++) {
          const p = spot(target.r * 1.5);
          this.emit({ from: sun, to: [p[0], p[1] + r * 0.3, p[2]], start: t + rng() * 0.25, life: 0.35, mode: TRAVEL, m2: 1, color: i % 2 ? hot : col, size0: r * 0.3, size1: r * 0.5, shape: SPARK });
        }
        flash(at, r * 2, 0.45);
        sparks(at, n(20), r * 3, t + 0.3);
        break;
      }
      case "rain": {
        // Burning stones from the sky, each with its trail and its own flash where it lands
        for (let k = 0; k < n(8); k++) {
          const p = spot(target.r * 1.4);
          const tk = t + k * 0.11;
          const fall = 0.55;
          const sky: [number, number, number] = [p[0] - r * 2.5, p[1] + r * 10, p[2] - r * 1.5];
          this.emit({ from: sky, to: p, start: tk - fall, life: fall, mode: TRAVEL, m2: 2, color: col, size0: r * 0.6, size1: r * 0.7, shape: GLOW, flicker: 0.3 });
          for (let i = 0; i < 6; i++) {
            const f = i / 6;
            const q: [number, number, number] = [sky[0] + (p[0] - sky[0]) * f * f, sky[1] + (p[1] - sky[1]) * f * f, sky[2] + (p[2] - sky[2]) * f * f];
            this.emit({ from: q, to: [0, r * 0.4, 0], start: tk - fall + f * fall, life: 0.4, mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.5, size1: r * 0.1, shape: FLAME });
          }
          this.emit({ from: p, to: [0, 0, 0], start: tk, life: 0.3, mode: BALLISTIC, color: hot, size0: r * 0.6, size1: r * 0.85, shape: GLOW });
          for (let i = 0; i < 5; i++) {
            const [dx, , dz] = sphere(rng, r * 2);
            this.emit({ from: p, to: [dx, r * 2.5, dz], start: tk, life: 0.6, mode: BALLISTIC, m1: r * 4, color: col, size0: r * 0.2, size1: r * 0.05, shape: SPARK });
          }
        }
        break;
      }
      case "vortex":
      case "dust": {
        // A whirlpool of water (or a wall of sand) spins round the enemy and closes on it
        const dust = look.burst === "dust";
        const count = n(dust ? 70 : 60);
        // Sand is mostly dark grit that hides what is behind it, a few grains catching the light
        const shade = col.clone().multiplyScalar(0.45);
        for (let i = 0; i < count; i++) {
          const life = 1.3 + rng() * 0.5;
          this.emit({ from: ground, to: [r * (2 + rng() * 0.8), r * (0.3 + rng() * 0.5), r * (1.5 + rng() * 1.5)], start: t - 0.2 + rng() * 0.3, life, mode: SPIRAL, m1: (dust ? 3.2 : 4.2) + rng() * 1.5, m2: rng() * 6.283, color: dust ? (i % 4 ? shade : col) : i % 4 ? col : hot, occ: dust ? 0.75 : 0.1, size0: r * (dust ? 0.32 : 0.3), size1: r * (dust ? 0.5 : 0.2), shape: dust ? SMOKE : i % 2 ? GLOW : SPARK });
        }
        if (!dust) sparks(ground, n(16), r * 2.2, t + 0.9, GLOW);
        break;
      }
      case "pack": {
        // Spectral wolves run in from behind the caster and through the enemy, in leaps
        const dx = target.x - from.x;
        const dz = target.z - from.z;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len;
        const uz = dz / len;
        for (let w = 0; w < n(5); w++) {
          const side = (w - 2) * target.r * 0.55;
          const startP: [number, number, number] = [from.x - ux * from.r - uz * side, from.y + 0.5, from.z - uz * from.r + ux * side];
          const endP: [number, number, number] = [target.x + ux * target.r * 1.5 - uz * side, target.y + 0.5, target.z + uz * target.r * 1.5 + ux * side];
          const tw = t - 0.45 + w * 0.09;
          // The body as a few motes, the eyes as two hot sparks
          for (let i = 0; i < 6; i++) {
            const o = (i - 2.5) * r * 0.16;
            this.emit({ from: [startP[0] - ux * o, startP[1] + (i % 2) * r * 0.15, startP[2] - uz * o], to: [endP[0] - ux * o, endP[1] + (i % 2) * r * 0.15, endP[2] - uz * o], start: tw, life: 0.7, mode: TRAVEL, m1: r * 0.5, color: col, size0: r * 0.42, size1: r * 0.3, shape: GLOW });
          }
          this.emit({ from: [startP[0] + ux * r * 0.45, startP[1] + r * 0.3, startP[2] + uz * r * 0.45], to: [endP[0] + ux * r * 0.45, endP[1] + r * 0.3, endP[2] + uz * r * 0.45], start: tw, life: 0.7, mode: TRAVEL, m1: r * 0.5, color: hot, size0: r * 0.2, size1: r * 0.2, shape: SPARK });
        }
        sparks(at, n(14), r * 2.2);
        break;
      }
      case "tentacles": {
        // Tentacles burst up through the enemy, sway at their height and sink back, dragging it down
        for (let k = 0; k < n(6); k++) {
          const base = spot(target.r * 1.2);
          const tk = t - 0.35 + k * 0.07;
          const lean = rng() * 6.283;
          const segs = n(9);
          for (let i = 0; i < segs; i++) {
            const f = i / (segs - 1);
            const sway = Math.sin(f * 2.4) * r * 0.7;
            const p: [number, number, number] = [base[0] + Math.cos(lean) * sway, base[1] + f * r * 3.2, base[2] + Math.sin(lean) * sway];
            this.emit({ from: p, to: [0, -r * 2.2, 0], start: tk + f * 0.18, life: 0.95, mode: BALLISTIC, color: i % 3 ? col : hot, size0: r * (0.55 - f * 0.3), size1: r * (0.35 - f * 0.2), shape: GLOW });
          }
          this.emit({ from: base, to: [0, 0, 0], start: tk, life: 0.7, mode: BALLISTIC, color: col, occ: 0.5, size0: r * 0.4, size1: r * 1.1, shape: SMOKE });
        }
        this.emit({ from: ground, to: [0, 0, 0], start: t, life: 0.7, mode: BALLISTIC, color: hot, size0: r * 0.5, size1: r * 2.6, shape: RING });
        break;
      }
      case "song": {
        // Rings of song roll out over the enemy, and notes drift from the caster through them
        for (let k = 0; k < 5; k++) {
          this.emit({ from: [target.x, target.y + r * (0.4 + k * 0.25), target.z], to: [0, 0, 0], start: t + k * 0.16, life: 0.75, mode: BALLISTIC, color: k % 2 ? hot : col, size0: r * 0.3, size1: r * 2.6, shape: RING });
        }
        for (let i = 0; i < n(18); i++) {
          const p = spot(target.r * 1.2);
          this.emit({ from: [from.x, from.y + from.h, from.z], to: [p[0], p[1] + r * (0.6 + rng()), p[2]], start: t - 0.5 + rng() * 0.5, life: 0.7, mode: TRAVEL, m1: r * (1 + rng()), color: i % 2 ? hot : col, size0: r * 0.28, size1: r * 0.18, shape: i % 3 ? GLOW : SPARK, flicker: 0.4 });
        }
        flash(at, r * 1.5, 0.4);
        break;
      }
      case "maw": {
        // The ground gapes under the enemy front: grit blows up, a ring of teeth closes round it
        this.emit({ from: ground, to: [0, r * 0.6, 0], start: t - 0.15, life: 1.1, mode: BALLISTIC, color: col.clone().multiplyScalar(0.4), occ: 0.8, size0: r * 1.2, size1: r * 2.6, shape: SMOKE });
        const teeth = n(14);
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * 6.283;
          const p: [number, number, number] = [target.x + Math.cos(a) * r * 1.5, target.y, target.z + Math.sin(a) * r * 1.5];
          this.emit({ from: p, to: [-Math.cos(a) * r * 1.2, r * 4.2, -Math.sin(a) * r * 1.2], start: t + rng() * 0.08, life: 0.75, mode: BALLISTIC, m1: r * 10, color: i % 2 ? hot : col, size0: r * 0.5, size1: r * 0.3, shape: SHARD });
        }
        for (let i = 0; i < n(20); i++) {
          const [dx, , dz] = sphere(rng, r * 2.5);
          this.emit({ from: ground, to: [dx, r * (3 + rng() * 2), dz], start: t, life: 0.8, mode: BALLISTIC, m1: r * 6, color: col.clone().multiplyScalar(0.6), occ: 0.6, size0: r * 0.25, size1: r * 0.15, shape: SHARD });
        }
        flash(at, r * 1.8, 0.35);
        break;
      }
      case "stingers": {
        // Stingers rain straight down over every enemy army, each splashing venom where it lands
        for (let k = 0; k < n(16); k++) {
          const p = spot(target.r * 1.4);
          const tk = t + rng() * 0.45;
          const fall = 0.45;
          this.emit({ from: [p[0], p[1] + r * 8, p[2]], to: p, start: tk - fall, life: fall, mode: TRAVEL, m2: 2, color: col, size0: r * 0.6, size1: r * 0.7, shape: SHARD });
          this.emit({ from: [p[0], p[1] + r * 8, p[2]], to: p, start: tk - fall, life: fall, mode: TRAVEL, m2: 2, color: hot, size0: r * 0.25, size1: r * 0.3, shape: GLOW });
          this.emit({ from: p, to: [0, r * 0.4, 0], start: tk, life: 0.5, mode: BALLISTIC, color: col, occ: 0.35, size0: r * 0.25, size1: r * 0.6, shape: SMOKE });
        }
        break;
      }
      case "roots": {
        // Roots race along the ground from the caster, and thorns spear up through the enemy
        for (let k = 0; k < n(5); k++) {
          const end = spot(target.r * 1.1);
          const steps = n(12);
          for (let i = 0; i < steps; i++) {
            const f = i / (steps - 1);
            const p: [number, number, number] = [from.x + (end[0] - from.x) * f + (rng() - 0.5) * r * 0.4, Math.min(from.y, end[1]) + 0.15, from.z + (end[2] - from.z) * f + (rng() - 0.5) * r * 0.4];
            this.emit({ from: p, to: [0, 0, 0], start: t - 0.5 + f * 0.5, life: 0.9, mode: BALLISTIC, color: col, occ: 0.4, size0: r * 0.3, size1: r * 0.2, shape: GLOW });
          }
          for (let i = 0; i < 4; i++) {
            const p = spot(target.r * 1.2);
            this.emit({ from: p, to: [(rng() - 0.5) * r, r * (3 + rng() * 2), (rng() - 0.5) * r], start: t + rng() * 0.25, life: 0.6, mode: BALLISTIC, m1: r * 7, color: i % 2 ? hot : col, size0: r * 0.45, size1: r * 0.2, shape: SHARD });
          }
        }
        break;
      }
      case "petals": {
        // A whirl of glowing petals wraps the enemy, then drifts down over it
        for (let i = 0; i < n(56); i++) {
          const life = 1.2 + rng() * 0.5;
          this.emit({ from: ground, to: [r * (1.6 + rng() * 0.8), r * (0.6 + rng() * 0.8), r * (1 + rng())], start: t - 0.3 + rng() * 0.3, life, mode: SPIRAL, m1: 3 + rng() * 2, m2: rng() * 6.283, color: i % 3 ? col : hot, size0: r * 0.22, size1: r * 0.14, shape: i % 2 ? SPARK : GLOW, flicker: 0.5 });
        }
        for (let i = 0; i < n(18); i++) {
          const p = spot(target.r * 1.4);
          this.emit({ from: [p[0], p[1] + r * 3, p[2]], to: [(rng() - 0.5) * r * 0.6, -r * 1.6, (rng() - 0.5) * r * 0.6], start: t + 0.6 + rng() * 0.6, life: 1.3, mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.2, size1: r * 0.12, shape: SPARK, flicker: 0.6 });
        }
        break;
      }
      case "avalanche": {
        // A slide of snow and ice pours down from beyond the enemy, across it, and settles in a white cloud
        const dx = target.x - from.x;
        const dz = target.z - from.z;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len;
        const uz = dz / len;
        for (let i = 0; i < n(46); i++) {
          const side = (rng() - 0.5) * target.r * 3;
          const top: [number, number, number] = [target.x + ux * r * 4 - uz * side, target.y + r * 3.5, target.z + uz * r * 4 + ux * side];
          const end: [number, number, number] = [target.x - ux * r * 1.2 - uz * side, target.y + 0.2, target.z - uz * r * 1.2 + ux * side];
          const chunk = i % 3 === 0;
          this.emit({ from: top, to: end, start: t - 0.55 + rng() * 0.45, life: 0.75, mode: TRAVEL, m1: r * 0.3, m2: 2, color: chunk ? hot : col, occ: chunk ? 0 : 0.8, size0: r * (chunk ? 0.35 : 0.5), size1: r * (chunk ? 0.3 : 0.9), shape: chunk ? SHARD : SMOKE });
        }
        this.emit({ from: ground, to: [0, r * 0.5, 0], start: t + 0.1, life: 1.2, mode: BALLISTIC, color: col, occ: 0.8, size0: r * 1.2, size1: r * 2.4, shape: SMOKE });
        break;
      }
      case "gaze": {
        // Twin beams from the caster's eyes, lit all along at once; the enemy crusts over in grey stone
        const eye: [number, number, number] = [from.x, from.y + from.h * 1.1, from.z];
        for (let b = 0; b < 2; b++) {
          const end = spot(target.r * 0.8);
          const steps = n(16);
          for (let i = 0; i <= steps; i++) {
            const f = i / steps;
            this.emit({ from: [eye[0] + (end[0] - eye[0]) * f, eye[1] + (end[1] + r * 0.4 - eye[1]) * f, eye[2] + (end[2] - eye[2]) * f + (b - 0.5) * r * 0.3], to: [0, 0, 0], start: t - 0.2 + b * 0.06, life: 0.45, mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.3, size1: r * 0.2, shape: GLOW, flicker: 0.6 });
          }
        }
        const stone = new THREE.Color("#78716c");
        for (let i = 0; i < n(18); i++) {
          const p = spot(target.r * 1.1);
          this.emit({ from: [p[0], p[1] + r * rng(), p[2]], to: [0, 0, 0], start: t + 0.05 + rng() * 0.3, life: 1.1, mode: BALLISTIC, color: stone, occ: 0.85, size0: r * 0.3, size1: r * 0.55, shape: SMOKE });
        }
        sparks(at, n(12), r * 2, t, SHARD);
        break;
      }
      case "breath": {
        // An Art: a short, narrow jet of fire. A Finale: a long cone poured over the whole enemy,
        // a second sweep, the ground left burning and embers climbing off it
        const mouth: [number, number, number] = [from.x, from.y + from.h, from.z];
        if (!look.finale) {
          for (let i = 0; i < n(22); i++) {
            const p = spot(target.r * 0.7);
            const tk = t - 0.25 + rng() * 0.4;
            this.emit({ from: mouth, to: [p[0], p[1] + rng() * r * 0.5, p[2]], start: tk, life: 0.45, mode: TRAVEL, m1: -r * 0.15, m2: 1, color: i % 3 ? col : hot, size0: r * 0.15, size1: r * 0.6, shape: FLAME });
          }
          flash(at, r * 0.9, 0.3);
          break;
        }
        for (let sweep = 0; sweep < 2; sweep++) {
          for (let i = 0; i < n(60); i++) {
            const p = spot(target.r * 1.6);
            const tk = t - 0.45 + sweep * 0.55 + rng() * 0.9;
            this.emit({ from: mouth, to: [p[0], p[1] + rng() * r, p[2]], start: tk, life: 0.6, mode: TRAVEL, m1: -r * 0.3, m2: 1, color: i % 3 ? col : hot, size0: r * 0.25, size1: r * 1.2, shape: FLAME });
          }
        }
        for (let i = 0; i < n(24); i++) {
          const p = spot(target.r * 1.6);
          this.emit({ from: p, to: [(rng() - 0.5) * r * 0.3, r * (0.8 + rng()), (rng() - 0.5) * r * 0.3], start: t + 0.2 + rng() * 1.2, life: 0.7, mode: BALLISTIC, color: i % 2 ? col : hot, size0: r * 0.6, size1: r * 0.15, shape: FLAME });
        }
        this.emit({ from: ground, to: [0, 0, 0], start: t, life: 1.4, mode: BALLISTIC, color: col, size0: r * 1, size1: r * 3.2, shape: RING });
        sparks(at, n(26), r * 2.8, t + 0.5);
        flash(at, r * 1.8, 0.6);
        break;
      }
    }
  }

  /* ------------------------------ aftermath ------------------------------ */

  /**
   * A status's look on an army from `start` (store clock) until `until`. Called again with the same key, the group only
   * stretches to the new end; a new key spawns its particles.
   */
  status(key: string, kind: BattleStatusKind, at: SpellSpot, start: number, until: number) {
    const g = this.loops.get(key);
    if (g) {
      if (until > g.until) {
        g.until = until;
        for (const s of g.slots) {
          this.data[(BURST_CAP + s) * STRIDE + 8] = until;
          this.dirtyLo = Math.min(this.dirtyLo, BURST_CAP + s);
          this.dirtyHi = Math.max(this.dirtyHi, BURST_CAP + s);
        }
      }
      this.aliveUntil = Math.max(this.aliveUntil, until);
      return;
    }
    for (const [k, old] of this.loops) if (old.until < spellNow() - 1) this.loops.delete(k);
    const group: LoopGroup = { until, slots: [] };
    this.loops.set(key, group);
    this.aliveUntil = Math.max(this.aliveUntil, until);
    const look = AFTERMATH_LOOKS[kind];
    const col = new THREE.Color(look.color);
    const hot = new THREE.Color(look.hot);
    const rng = rngFor(`status:${key}`);
    const n = (k: number) => Math.max(1, Math.round(k * this.rich));
    const r = at.r;
    const groundAt = (spread = 1): [number, number, number] => {
      const a = rng() * 6.283;
      const d = Math.sqrt(rng()) * r * spread;
      return [at.x + Math.cos(a) * d, at.y + 0.1, at.z + Math.sin(a) * d];
    };
    const add = (e: Omit<Emit, "start">) => this.loop(key, group, { ...e, start }, rng());

    switch (kind) {
      case "burn":
        for (let i = 0; i < n(26); i++) add({ from: groundAt(), to: [(rng() - 0.5) * r * 0.3, r * (0.9 + rng() * 0.6), (rng() - 0.5) * r * 0.3], life: 0.7 + rng() * 0.4, mode: BALLISTIC, color: i % 3 ? col : hot, size0: r * 0.5, size1: r * 0.12, shape: FLAME });
        for (let i = 0; i < n(12); i++) add({ from: groundAt(), to: [(rng() - 0.5) * r * 0.5, r * (1.6 + rng()), (rng() - 0.5) * r * 0.5], life: 1.4 + rng() * 0.6, mode: BALLISTIC, color: hot, size0: r * 0.1, size1: r * 0.03, shape: SPARK, flicker: 0.6 });
        break;
      case "poison":
        for (let i = 0; i < n(20); i++) add({ from: groundAt(), to: [0, r * (0.45 + rng() * 0.3), 0], life: 1.3 + rng() * 0.6, mode: BALLISTIC, color: i % 3 ? col : hot, size0: r * 0.1, size1: r * 0.24, shape: RING });
        for (let i = 0; i < n(5); i++) add({ from: groundAt(0.6), to: [0, r * 0.15, 0], life: 2.4, mode: BALLISTIC, color: col, occ: 0.25, size0: r * 0.6, size1: r * 0.85, shape: SMOKE });
        break;
      case "bleed":
        for (let i = 0; i < n(20); i++) {
          const p = groundAt();
          add({ from: [p[0], p[1] + r * (0.6 + rng() * 0.5), p[2]], to: [(rng() - 0.5) * r * 0.2, 0, (rng() - 0.5) * r * 0.2], life: 0.7 + rng() * 0.3, mode: BALLISTIC, m1: r * 1.6, color: i % 4 ? col : hot, occ: 0.6, size0: r * 0.12, size1: r * 0.08, shape: GLOW });
        }
        break;
      case "paralyze":
        for (let i = 0; i < n(18); i++) {
          const p = groundAt();
          add({ from: [p[0], p[1] + r * (0.2 + rng() * 0.6), p[2]], to: [0, 0, 0], life: 0.5 + rng() * 0.6, mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.35, size1: r * 0.05, shape: SPARK, flicker: 1 });
        }
        break;
      case "chill":
        for (let i = 0; i < n(22); i++) {
          const p = groundAt(1.1);
          add({ from: [p[0], p[1] + r * (1.2 + rng() * 0.6), p[2]], to: [(rng() - 0.5) * r * 0.4, -r * (0.7 + rng() * 0.3), (rng() - 0.5) * r * 0.4], life: 1.6 + rng() * 0.6, mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.14, size1: r * 0.1, shape: SPARK, flicker: 0.5 });
        }
        for (let i = 0; i < n(4); i++) add({ from: groundAt(0.5), to: [0, r * 0.05, 0], life: 3, mode: BALLISTIC, color: hot, occ: 0.15, size0: r * 0.7, size1: r * 0.9, shape: SMOKE });
        break;
      case "freeze":
        for (let i = 0; i < n(16); i++) {
          const a = (i / n(16)) * 6.283 + rng() * 0.3;
          add({ from: [at.x + Math.cos(a) * r * 0.9, at.y + r * (0.2 + rng() * 0.35), at.z + Math.sin(a) * r * 0.9], to: [0, 0, 0], life: 2.5 + rng(), mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.5, size1: r * 0.45, shape: SHARD, flicker: 0.4 });
        }
        add({ from: [at.x, at.y + r * 0.4, at.z], to: [0, 0, 0], life: 3, mode: BALLISTIC, color: col, size0: r * 1.1, size1: r * 1.2, shape: GLOW });
        break;
      case "ward": {
        const count = n(26);
        for (let i = 0; i < count; i++) {
          const a = i * 2.39996;
          const up = 0.12 + 0.85 * ((i + 0.5) / count);
          const rad = Math.sqrt(1 - up * up);
          const R = Math.max(r * 1.4, at.h * 0.8);
          add({ from: [at.x + Math.cos(a) * rad * R, at.y + up * R, at.z + Math.sin(a) * rad * R], to: [0, r * 0.08, 0], life: 1.4 + rng() * 0.6, mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.2, size1: r * 0.26, shape: SPARK, flicker: 0.3 });
        }
        break;
      }
      case "rally":
        for (let i = 0; i < n(20); i++) add({ from: groundAt(), to: [0, r * (2 + rng()), 0], life: 0.8 + rng() * 0.4, mode: BALLISTIC, color: i % 2 ? hot : col, size0: r * 0.18, size1: r * 0.05, shape: SPARK });
        break;
      case "sunder":
        for (let i = 0; i < n(18); i++) {
          const p = groundAt();
          add({ from: [p[0], p[1] + r * (0.8 + rng() * 0.4), p[2]], to: [(rng() - 0.5) * r * 0.6, r * 0.1, (rng() - 0.5) * r * 0.6], life: 1 + rng() * 0.4, mode: BALLISTIC, m1: r * 0.9, color: i % 2 ? hot : col, size0: r * 0.22, size1: r * 0.12, shape: SHARD, flicker: 0.2 });
        }
        break;
    }
  }

  /** How hard a reaction is showing on a named spot now: 0..1 flash and jolt (the Sparring Grounds' stand-ins) */
  reactionOf(side: string, now = spellNow()): { flash: number; jolt: number; lift: number } {
    let flash = 0;
    let jolt = 0;
    let lift = 0;
    for (const h of this.hits) {
      if (h.side !== side) continue;
      const a = now - h.at;
      if (a < 0 || a > 0.6) continue;
      const k = 1 - a / 0.6;
      if (h.kind === "flinch") flash = Math.max(flash, k * k);
      else if (h.kind === "stagger") jolt = Math.max(jolt, k);
      else lift = Math.max(lift, k);
    }
    return { flash, jolt, lift };
  }
}

/** The world map's casts */
export const MAP_SPELL_FX = new SpellFxStore();

// Dev handle for timing screenshots and measuring: __spellFx.store.cues, __spellFx.now(), __spellFx.looks (to cast any)
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __spellFx: unknown }).__spellFx = { store: MAP_SPELL_FX, now: spellNow, looks: { ...SPELL_LOOKS, ...INSTINCT_LOOKS } };

const sphere = (rng: Rng, len: number): [number, number, number] => {
  const u = rng() * 2 - 1;
  const a = rng() * 6.283;
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  return [Math.cos(a) * s * len, u * len, Math.sin(a) * s * len];
};

/** A point along a bolt's flight (the vertex shader's TRAVEL path, linear ease) */
const arcPoint = (a: [number, number, number], b: [number, number, number], arc: number, f: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f + arc * 4 * f * (1 - f),
  a[2] + (b[2] - a[2]) * f
];

/* ------------------------------ shaders ------------------------------ */

const VERT = `
  uniform float uTime;
  uniform float uViewH;
  uniform float uGrow;
  uniform vec4 uCalm;
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec4 aTime;
  attribute vec4 aMove;
  attribute vec4 aCol;
  attribute vec4 aShape;
  varying vec4 vCol;
  varying float vShape;
  varying float vOcc;
  void main() {
    float life = max(aTime.y, 0.001);
    float since = uTime - aTime.x;
    bool looping = aTime.z > 0.0;
    float age = looping ? mod(since + aTime.w * life, life) : since;
    if (since < 0.0 || (!looping && since > life) || (looping && uTime > aTime.z)) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vCol = vec4(0.0);
      vShape = 0.0;
      vOcc = 0.0;
      return;
    }
    float k = clamp(age / life, 0.0, 1.0);
    vec3 p;
    if (aMove.x < 0.5) {
      p = aFrom + aTo * age - vec3(0.0, aMove.y * age * age, 0.0);
    } else if (aMove.x < 1.5) {
      float e = aMove.z < 0.5 ? k : (aMove.z < 1.5 ? 1.0 - (1.0 - k) * (1.0 - k) : k * k);
      p = mix(aFrom, aTo, e);
      p.y += aMove.y * 4.0 * e * (1.0 - e);
    } else {
      float r = mix(aTo.x, aTo.y, k);
      float ang = aMove.z + aMove.y * age;
      p = aFrom + vec3(cos(ang) * r, aTo.z * k, sin(ang) * r);
    }
    // One-shots flare in and die out; loops fade in and out of each cycle, and the whole status fades at its ends
    float alpha = looping ? sin(k * 3.14159) : smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.55, 1.0, k));
    if (looping) alpha *= clamp(since / 0.4, 0.0, 1.0) * clamp((aTime.z - uTime) / 0.6, 0.0, 1.0);
    float flick = aShape.w > 0.0 ? 1.0 - aShape.w * 0.5 * (1.0 + sin(uTime * 37.0 + aTime.w * 61.0 + aFrom.x * 3.0)) : 1.0;
    vCol = vec4(aCol.rgb, alpha * max(flick, 0.0) * uCalm.x);
    vShape = aShape.z;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(-mv.z, 0.01);
    float grow = uGrow > 0.0 ? clamp(dist / uGrow, 1.0, uCalm.z) : 1.0;
    // Sizes are radii in world units; the point is their diameter on screen
    float size = mix(aShape.x, aShape.y, k) * grow * 2.2 * uCalm.y;
    gl_PointSize = clamp(size * projectionMatrix[1][1] * uViewH * 0.5 / dist, 0.0, uCalm.w);
    gl_Position = projectionMatrix * mv;
    vOcc = aCol.a;
  }
`;

const FRAG = `
  uniform float uPeak;
  varying vec4 vCol;
  varying float vShape;
  varying float vOcc;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float d = length(q);
    if (d > 1.0 || vCol.a <= 0.0) discard;
    float a;
    float core = exp(-d * d * 18.0);
    if (vShape < 0.5) {
      a = exp(-d * d * 4.0) * 0.75;
    } else if (vShape < 1.5) {
      float star = max(0.0, 1.0 - abs(q.x * q.y) * 28.0) * (1.0 - d);
      a = core * 1.4 + star * 0.7 + exp(-d * d * 7.0) * 0.25;
    } else if (vShape < 2.5) {
      float w = (d - 0.78) * 7.0;
      a = exp(-w * w) + exp(-d * d * 3.0) * 0.08;
    } else if (vShape < 3.5) {
      float m = abs(q.x) * 1.8 + abs(q.y);
      a = (1.0 - smoothstep(0.82, 1.0, m)) * (0.45 + 0.55 * max(1.0 - m, 0.0)) + core * 0.6;
    } else if (vShape < 4.5) {
      float y = clamp((q.y + 1.0) * 0.5, 0.0, 1.0);
      float w = mix(0.12, 0.7, y);
      float m = abs(q.x) / w;
      a = exp(-m * m * 2.5) * smoothstep(0.0, 0.25, y) * (1.0 - smoothstep(0.85, 1.0, y)) + core * 0.4;
    } else {
      a = (1.0 - smoothstep(0.2, 1.0, d)) * 0.7;
    }
  #ifdef HD
    vec3 col = mix(vCol.rgb, vec3(1.0, 0.97, 0.92), core * 0.6 * (1.0 - vOcc) * clamp(uPeak - 1.0, 0.0, 1.0));
  #else
    vec3 col = vCol.rgb;
  #endif
    a = clamp(a, 0.0, uPeak) * vCol.a;
    gl_FragColor = vec4(col * a, min(a, 1.0) * vOcc);
  }
`;

/**
 * How a view's spells are toned: alpha, size, how far they grow with distance, the largest point on screen (px), the
 * brightest a pixel may add, and the share of particles. On the world map the spells must leave the models readable (`calm`);
 * the Sparring Grounds and the sound stages, where the spell is the subject, keep them at full strength.
 */
const FULL_TONE = { alpha: 1, size: 1, grow: 2.6, maxPx: 480, peak: 2, density: 1 };
const CALM_TONE = { alpha: 0.5, size: 0.62, grow: 1.5, maxPx: 150, peak: 1, density: 0.6 };

/** Draws one store's casts: one draw call, none while nothing is up */
export function SpellFx({ store, grow = 0, calm = false }: { store: SpellFxStore; grow?: number; calm?: boolean }) {
  const hd = useHd("tierFx");
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const points = useRef<THREE.Points>(null);
  const heard = useRef<Record<string, number>>({});

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const buf = new THREE.InterleavedBuffer(store.data, STRIDE).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", new THREE.InterleavedBufferAttribute(buf, 3, 0));
    g.setAttribute("aFrom", new THREE.InterleavedBufferAttribute(buf, 3, 0));
    g.setAttribute("aTo", new THREE.InterleavedBufferAttribute(buf, 3, 3));
    g.setAttribute("aTime", new THREE.InterleavedBufferAttribute(buf, 4, 6));
    g.setAttribute("aMove", new THREE.InterleavedBufferAttribute(buf, 4, 10));
    g.setAttribute("aCol", new THREE.InterleavedBufferAttribute(buf, 4, 14));
    g.setAttribute("aShape", new THREE.InterleavedBufferAttribute(buf, 4, 18));
    // Every point is placed by the shader: the bounds never cull it
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    return { g, buf };
  }, [store]);
  useEffect(() => () => geo.g.dispose(), [geo]);

  const tone = calm ? CALM_TONE : FULL_TONE;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        defines: hd ? { HD: "" } : {},
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: { uTime: { value: 0 }, uViewH: { value: 600 }, uGrow: { value: grow }, uCalm: { value: new THREE.Vector4(tone.alpha, tone.size, tone.grow, tone.maxPx) }, uPeak: { value: tone.peak } },
        vertexShader: VERT,
        fragmentShader: FRAG
      }),
    [hd, grow, tone]
  );
  useEffect(() => () => mat.dispose(), [mat]);

  useFrame(({ camera }) => {
    const p = points.current;
    if (!p) return;
    store.rich = (hd ? 1.6 : 1) * tone.density;
    const now = spellNow();
    const dirty = store.takeDirty();
    if (dirty) {
      geo.buf.clearUpdateRanges();
      geo.buf.addUpdateRange(dirty[0] * STRIDE, (dirty[1] - dirty[0] + 1) * STRIDE);
      geo.buf.needsUpdate = true;
    }
    mat.uniforms.uTime.value = now;
    mat.uniforms.uViewH.value = size.height * gl.getPixelRatio();
    p.visible = now < store.aliveUntil + 0.1;
    // Sound cues as their moments come, for casts near enough to hear
    if (store.cues.length) {
      const due = store.cues.filter((c) => c.at <= now);
      if (due.length) {
        store.cues = store.cues.filter((c) => c.at > now);
        for (const c of due) {
          if (now - c.at > 0.5) continue;
          const d = camera.position.distanceTo(new THREE.Vector3(c.x, c.y, c.z));
          // Many casts at once sound as a few: at most one of a kind every SOUND_GAP_S
          if (d >= HEAR_DISTANCE || now - (heard.current[c.kind] ?? -1) < SOUND_GAP_S) continue;
          heard.current[c.kind] = now;
          sound.playSpell(c.kind, c.voice);
        }
      }
    }
  });

  return <points ref={points} geometry={geo.g} material={mat} frustumCulled={false} raycast={noRaycast} renderOrder={3} visible={false} />;
}

/** How far a cast can be heard from the camera (world units) */
const HEAR_DISTANCE = 140;
const SOUND_GAP_S = 0.15;
const noRaycast = () => null;
