import { BossBone, BossPart, BossRig, Motion, P, Vec3, pair } from "./bossRigs";

/*
 * The Normal mercenary kit: a person as a rig (drawn by `BossModel`), the bones every band shares so they all breathe,
 * strike and march alike. Legs swing from the hips, the arms against them, the body dips on each footfall and turns its
 * shoulders against its hips. A band gives its own parts per bone; sizes follow a man of height `h` 1 (hips at 0.9, the
 * head at about 1.95), `w` 1 broad, standing on y = 0 facing +z.
 */

const PI = Math.PI;
/** Two steps take about 1.15 s, as the high-graphics march */
export const STRIDE = (2 * PI) / 1.15;

export interface PersonArm {
  /** Parts in the arm's space: the shoulder at the origin, hanging down -y, the hand at `hand(h, w)` */
  parts: BossPart[];
  r?: Vec3;
  idle?: Motion;
  atk?: Motion;
  /** How far it swings on the march (0: held still) */
  swing?: number;
  kids?: BossBone[];
}

export interface PersonRig {
  aura: string;
  ember: string;
  auraSize?: number;
  float?: number;
  h?: number;
  w?: number;
  /** One leg (+x side, mirrored), in the leg's space: the hip at the origin, the foot at -0.9h */
  leg: BossPart[];
  /** The body, round its pivot at the hips */
  torso: BossPart[];
  torsoIdle?: Motion;
  torsoAtk?: Motion;
  head: { parts: BossPart[]; eyes?: BossPart[]; idle?: Motion; atk?: Motion; kids?: BossBone[] };
  armR: PersonArm;
  armL: PersonArm;
  /** More bones on the body (a cape, a banner on the back) */
  kids?: BossBone[];
  /** Bones round the whole figure (orbiting bits, a floating tome) */
  around?: BossBone[];
  /** Legs barely move on the march (a robe that glides, a figure that floats) */
  glide?: boolean;
}

/** Where a hand is in its arm's space */
export const hand = (h = 1, w = 1): Vec3 => [0.02 * w, -0.6 * h, 0.08];

/** A plain leg: thigh to ankle and a boot */
export function legOf(h: number, w: number, leg: string, boot: string, o: { bootH?: number; thick?: number } = {}): BossPart[] {
  const t = o.thick ?? 1;
  const bh = o.bootH ?? 0.16;
  return [P("box", [0, -0.37 * h, 0], [0.24 * w * t, 0.74 * h, 0.26 * w * t], leg), P("box", [0, -0.82 * h, 0.05], [0.3 * w * t, bh * h, 0.44 * w], boot)];
}

/** A plain arm: upper and fore as one tapered sleeve, and a fist at `hand` */
export function armOf(h: number, w: number, sleeve: string, fistColor: string, o: { thick?: number; cuff?: string } = {}): BossPart[] {
  const t = o.thick ?? 1;
  return [
    P("cyl", [0.01 * w, -0.28 * h, 0.03], [0.19 * w * t, 0.56 * h, 0.19 * w * t], sleeve, { t: 0.85, r: [-0.12, 0, 0] }),
    ...(o.cuff ? [P("cyl", [0.02 * w, -0.5 * h, 0.06], [0.2 * w * t, 0.08 * h, 0.2 * w * t], o.cuff, { r: [-0.12, 0, 0] })] : []),
    P("sph", hand(h, w), [0.15 * w * t, 0.15 * w * t, 0.15 * w * t], fistColor)
  ];
}

/** A mercenary on the Normal rig: the shared bones and motion, the band's own parts */
export function person(o: PersonRig): BossRig {
  const h = o.h ?? 1;
  const w = o.w ?? 1;
  const hipY = 0.9 * h;
  const legSwing = o.glide ? 0.08 : 0.42;
  const leg: BossBone = { at: [0.16 * w, hipY, 0], parts: o.leg, walk: { r: [legSwing, 0, 0], f: STRIDE } };
  const armBone = (a: PersonArm, s: number): BossBone => ({
    at: [s * 0.42 * w, 0.76 * h, 0],
    r: a.r,
    parts: a.parts,
    idle: a.idle ?? { r: [0.04, 0, 0.03 * s], f: 1.05, ph: s > 0 ? 0 : 1.3 },
    atk: a.atk,
    // Each arm swings against the leg on its side
    walk: { r: [-0.34 * (a.swing ?? 1), 0, 0], f: STRIDE, ph: s > 0 ? 0 : PI },
    kids: a.kids
  });
  return {
    aura: o.aura,
    ember: o.ember,
    auraSize: o.auraSize ?? 1.6,
    float: o.float,
    root: {
      at: [0, 0, 0],
      parts: [],
      // The whole figure dips on each footfall (twice a stride)
      walk: { p: [0, o.glide ? 0.03 : 0.045 * h, 0], f: STRIDE * 2, ph: PI / 2 },
      kids: [
        ...pair(leg),
        {
          at: [0, hipY, 0],
          parts: o.torso,
          idle: o.torsoIdle ?? { r: [0.02, 0.05, 0.01], f: 1.1 },
          atk: o.torsoAtk,
          walk: { r: [0.03, 0.08, 0], f: STRIDE, ph: PI },
          kids: [
            {
              at: [0, 1.02 * h, 0],
              parts: o.head.parts,
              idle: o.head.idle ?? { r: [0.05, 0.22, 0.03], f: 0.55 },
              atk: o.head.atk,
              kids: [...(o.head.eyes ? [{ at: [0, 0, 0] as Vec3, eye: true, parts: o.head.eyes }] : []), ...(o.head.kids ?? [])]
            },
            armBone(o.armR, 1),
            armBone(o.armL, -1),
            ...(o.kids ?? [])
          ]
        },
        ...(o.around ?? [])
      ]
    }
  };
}
