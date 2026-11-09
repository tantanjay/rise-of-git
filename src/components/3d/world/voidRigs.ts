import { BossBone, BossPart, BossRig, BossShape, G, P, Vec3, pair, sym } from "./bossRigs";
import { armOf, legOf, person } from "./mercRigKit";
import { BROOD_SIZES, BroodId, VG_WARDEN_TYPE, vgType } from "./voidCreatures";

/*
 * The Void Gate's creatures in Normal graphics (coming soon): each size of each family a rig drawn by `BossModel`, as
 * the mercenaries are, the same design as its HD hero (`heroVoid*.ts`) in plain parts. Built at the HD hero's unit size
 * and grown to the size's height by the root's rest scale, so the two stand the same. Each walks (`walk` motions on its
 * legs, arms and root, at the HD march's rate), breathes and looks round (`idle`) and strikes (`atk`); no two copies
 * move alike (`BossModel` seeds them by id). Its tier on the ladder as in HD: common matte, uncommon one accent, rare a
 * glow that pulses, epic glowing bits circling it, legendary a crown and a burning core.
 */

const PI = Math.PI;
const VOID = "#a855f7";
const VOID_HOT = "#e9d5ff";
const VOID_MATTE = "#7e4fc4";

/** Rad/s of a march `len` seconds long (two steps) */
const rate = (len: number) => (2 * PI) / len;

/** The rotation (Euler XYZ, as parts take it) that turns a part's +y onto `d` */
function toward(d: Vec3): Vec3 {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  const x = d[0] / l;
  const y = d[1] / l;
  const z = d[2] / l;
  return [Math.atan2(z, y), 0, Math.asin(Math.max(-1, Math.min(1, -x)))];
}

/** A part laid from `a` to `b`, `w` thick (a limb), in its bone's space */
function limb(s: BossShape, a: Vec3, b: Vec3, w: number, c: string, o: Partial<BossPart> = {}): BossPart {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  return P(s, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [w, len * 1.1, w], c, { r: toward(d), ...o });
}

/** Moves parts made in one bone's space into a child's (subtracts its pivot) */
const local = (at: Vec3, parts: BossPart[]): BossPart[] => parts.map((p) => ({ ...p, p: [p.p[0] - at[0], p.p[1] - at[1], p.p[2] - at[2]] }));
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Glowing bits circling at radius `R`, height `y` (epic up): one spinning bone */
function circling(y: number, R: number, n: number, spin: number, part: (i: number, at: Vec3) => BossPart): BossBone {
  return { at: [0, y, 0], spin, parts: Array.from({ length: n }, (_, i) => part(i, [Math.cos((i / n) * 2 * PI) * R, 0.08 * Math.sin(i * 2.1), Math.sin((i / n) * 2 * PI) * R])) };
}

/** A crown of crystal points (legendary) round a head at `h0` */
const crystalCrown = (h0: Vec3, r: number, n: number, len: number): BossPart[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((i - (n - 1) / 2) / Math.max(1, n - 1)) * 2.4;
    const l = len * (i === Math.floor(n / 2) ? 1.3 : 0.85);
    return G("cone", [h0[0] + Math.sin(a) * r, h0[1] + l / 2, h0[2] + Math.cos(a) * r * 0.8], [l * 0.3, l, l * 0.3], i % 2 ? VOID_HOT : VOID, { r: [-0.1, 0, -Math.sin(a) * 0.35] });
  });

/* ================================================================== */
/* The Stone Giant's brood                                             */
/* ================================================================== */

const STONE = ["#b5adbf", "#aea6b9", "#a69eb1", "#9d95a9", "#938b9f"];
const STONE2 = ["#958d9f", "#8e8699", "#878092", "#7f788b", "#767083"];
const MOSS = "#56752f";

function stoneRig(size: number): BossRig {
  const t = size;
  const S = BROOD_SIZES.stone.height[size] / 1.75;
  const col = STONE[size];
  const col2 = STONE2[size];
  const f = rate(1.5 + size * 0.12);
  const hip: Vec3 = [0.22, 0.6, 0];
  const knee: Vec3 = [0.25, 0.34, 0.04];
  const ankle: Vec3 = [0.26, 0.11, 0.02];
  const leg: BossBone = {
    at: hip,
    parts: local(hip, [limb("dod", hip, knee, 0.36, col2), P("dod", [0.25, 0.34, 0.09], [0.26, 0.24, 0.24], col), limb("dod", knee, ankle, 0.32, col2), P("dod", [0.26, 0.07, 0.09], [0.38, 0.15, 0.46], col)]),
    walk: { r: [0.34, 0, 0], f }
  };
  const sh: Vec3 = [0.62, 1.3, 0];
  const el: Vec3 = [0.78, 0.94, 0.05];
  const wr: Vec3 = [0.83, 0.56, 0.18];
  const fist: Vec3 = [0.85, 0.36, 0.22];
  const arm = (s: number): BossBone => {
    const m = (v: Vec3): Vec3 => [s * v[0], v[1], v[2]];
    return {
      at: sub(m(sh), [0, 0.6, 0]),
      r: [s > 0 ? 0.06 : -0.06, 0, s * 0.1],
      parts: local(m(sh), [limb("dod", m(sh), m(el), 0.38, col2)]),
      idle: { r: [0.05, 0, 0.03 * s], f: 0.9, ph: s > 0 ? 0 : 1.4 },
      walk: { r: [-0.5, 0, 0], f, ph: s > 0 ? 0 : PI },
      atk: { r: [-1.3, 0, -0.1 * s] },
      kids: [
        {
          at: sub(m(el), m(sh)),
          r: [s > 0 ? -0.18 : -0.3, 0, 0],
          parts: local(m(el), [
            P("dod", m(el), [0.3, 0.28, 0.3], col),
            limb("dod", m(el), m(wr), 0.54, col),
            P("dod", m(fist), [0.6, 0.54, 0.6], col),
            ...[0, 1, 2, 3].map((i) => P("dod", [s * (fist[0] + (i - 1.5) * 0.11), fist[1] - 0.15, fist[2] + 0.18], [0.15, 0.13, 0.16], col2)),
            ...(t >= 1 ? [0, 1, 2].map((i) => (t >= 2 ? G : P)("dod", [s * (fist[0] + 0.15 - i * 0.13), fist[1] + 0.21, fist[2] + 0.08 - i * 0.06], [0.09, 0.08, 0.09], t >= 2 ? "#8b5cf6" : col2)) : [])
          ]),
          atk: { r: [-0.4, 0, 0], d: 0.05 }
        }
      ]
    };
  };
  const chest: BossPart[] = [
    P("dod", [0, 0.64, 0], [0.6, 0.34, 0.46], col2),
    P("dod", [0, 1.1, -0.02], [1.0, 0.76, 0.72], col),
    P("dod", [0, 0.84, 0.05], [0.56, 0.4, 0.46], col2),
    P("dod", [0, 1.33, -0.17], [0.8, 0.44, 0.52], col2),
    P("dod", [0.21, 1.17, 0.2], [0.48, 0.38, 0.32], col),
    P("dod", [-0.21, 1.17, 0.2], [0.48, 0.38, 0.32], col2),
    ...sym(P("dod", [0.53, 1.36, -0.03], [0.68, 0.58, 0.64], col, { r: [0, 0, 0.3] })),
    ...(t >= 2 ? [G("box", [0.01, 1.07, 0.36], [0.035, 0.38, 0.03], VOID, { r: [0, 0, 0.15] }), G("box", [0.24, 1.12, 0.33], [0.03, 0.24, 0.03], VOID, { r: [0, 0, -0.4] })] : []),
    ...(t >= 1 ? [(t >= 3 ? G : P)("cone", [0.12, 1.5, -0.36], [0.13, 0.34, 0.13], t >= 3 ? VOID : VOID_MATTE, { r: [-0.5, 0, -0.25] })] : []),
    ...(t >= 2 ? [(t >= 3 ? G : P)("cone", [-0.18, 1.42, -0.4], [0.1, 0.24, 0.1], t >= 3 ? VOID : VOID_MATTE, { r: [-0.55, 0, 0.4] })] : []),
    ...(t >= 3 ? [...sym(P("sph", [0.54, 1.62, -0.05], [0.48, 0.14, 0.48], MOSS)), ...sym(G("cone", [0.38, 1.66, -0.2], [0.1, 0.26, 0.1], VOID, { r: [-0.3, 0, -0.3] }))] : []),
    ...(t >= 4 ? [G("sph", [0, 1.04, 0.35], [0.26, 0.26, 0.12], VOID_HOT)] : [])
  ];
  const headAt: Vec3 = [0, 1.3, 0.12];
  return {
    aura: VOID,
    ember: VOID_HOT,
    auraSize: 1.2,
    root: {
      at: [0, 0, 0],
      s0: S,
      parts: [],
      walk: { p: [0, 0.05 * S, 0], f: f * 2, ph: PI / 2 },
      kids: [
        ...pair(leg),
        {
          at: [0, 0.6, 0],
          r: [0.24, -0.05, 0.02],
          parts: local([0, 0.6, 0], chest),
          idle: { r: [0.035, 0.04, 0.01], f: 0.75 },
          walk: { r: [0.04, 0.12, 0.05], f, ph: PI },
          atk: { r: [0.5, 0, 0] },
          kids: [
            {
              at: sub(headAt, [0, 0.6, 0]),
              r: [-0.22, 0.08, 0],
              parts: local(headAt, [P("dod", [0, 1.35, 0.2], [0.28, 0.24, 0.28], col), P("dod", [0, 1.41, 0.3], [0.26, 0.09, 0.12], col2), P("dod", [0, 1.27, 0.26], [0.2, 0.11, 0.18], col2), ...(t >= 4 ? crystalCrown([0, 1.44, 0.18], 0.12, 5, 0.22) : [])]),
              idle: { r: [0.04, 0.25, 0.02], f: 0.5 },
              kids: [{ at: [0, 0, 0], eye: true, parts: local(headAt, sym((t >= 2 ? G : P)("sph", [0.055, 1.365, 0.325], [0.05, 0.04, 0.03], t >= 2 ? VOID_HOT : "#0b0712"))) }]
            },
            arm(1),
            arm(-1)
          ]
        },
        ...(t >= 3 ? [circling(0.9, 1.15, 6, 0.5, (i, at) => (i % 2 ? G : P)("dod", at, [0.14, 0.12, 0.14], i % 2 ? VOID : col2))] : [])
      ]
    }
  };
}

/* ================================================================== */
/* The Void Lion's pride                                               */
/* ================================================================== */

const FUR = ["#b9a184", "#b09a80", "#a5917b", "#998777", "#8c7c74"];
const FUR2 = ["#9a8468", "#917d64", "#86745f", "#7a6a5b", "#6d5f59"];
const BELLY = ["#d8c6a8", "#d0bfa3", "#c6b59d", "#bbab96", "#ae9f90"];
const MANE = ["#4a3a3a", "#45343f", "#3f2f42", "#382a44", "#302446"];
const LION_LOOK = [
  { head: 1.4, leg: 0.8, mane: 0 },
  { head: 1.15, leg: 0.95, mane: 0.45 },
  { head: 1, leg: 1, mane: 1 },
  { head: 1, leg: 1, mane: 1.15 },
  { head: 1, leg: 1, mane: 1.3 }
];

function lionRig(size: number): BossRig {
  const t = size;
  const L = LION_LOOK[size];
  const S = BROOD_SIZES.lion.height[size] / 1.35;
  const fur = FUR[size];
  const fur2 = FUR2[size];
  const belly = BELLY[size];
  const mane = MANE[size];
  const lift = 1 - (1 - L.leg) * 0.55;
  const y = (v: number) => v * lift;
  const f = rate([0.75, 0.95, 1.1, 1.2, 1.4][size]);
  const B: Vec3 = [0, y(0.98), -0.05];
  const leg = (hip: Vec3, knee: Vec3, ankle: Vec3, thick: number, ph: number): BossBone => ({
    at: sub(hip, B),
    parts: local(hip, [P("sph", [hip[0], hip[1] - 0.15, hip[2] + 0.02], [thick * 1.3, thick * 2, thick * 1.4], fur), limb("cyl", hip, knee, thick, fur, { t: 0.8 }), limb("cyl", knee, ankle, thick * 0.72, fur), P("sph", [ankle[0], 0.06, ankle[2] + 0.05], [0.17 / Math.max(0.7, L.leg), 0.11, 0.22 / Math.max(0.7, L.leg)], fur2)]),
    walk: { r: [0.45, 0, 0], f, ph }
  });
  const neckAt: Vec3 = [0, y(1.15), 0.7];
  const headAt: Vec3 = [0, y(1.32), 0.92];
  const h0: Vec3 = [0, y(1.34), 1.0];
  const h = L.head;
  const hp = (v: Vec3): Vec3 => [h0[0] + v[0] * h, h0[1] + v[1] * h, h0[2] + v[2] * h];
  const maneParts: BossPart[] =
    L.mane > 0
      ? Array.from({ length: Math.round(8 + 6 * L.mane) }, (_, i) => {
          const ang = (i / Math.round(8 + 6 * L.mane)) * 2 * PI;
          const R = 0.2 + 0.08 * L.mane;
          const tipLit = t >= 3 && i % 2 === 0;
          const lit = tipLit && i % 4 === 0;
          return (lit ? G : P)("cone", [Math.sin(ang) * R, y(1.3) + Math.cos(ang) * R, 0.8], [0.16 + 0.05 * L.mane, (0.18 + 0.12 * L.mane) * (t >= 4 && lit ? 1.3 : 1), 0.16], lit ? VOID : t >= 1 && i % 2 === 0 && t < 3 ? VOID_MATTE : i % 3 ? mane : fur2, { r: [-0.6, 0, -ang] });
        })
      : [];
  if (L.mane > 0) maneParts.unshift(P("sph", [0, y(1.24), 0.8], [(0.26 + 0.08 * L.mane) * 2, (0.3 + 0.08 * L.mane) * 2, 0.5 + 0.1 * L.mane], mane));
  const eyes = sym((t >= 2 ? G : P)("sph", hp([0.072, 0.03, 0.172]), [0.05, 0.03, 0.03], t >= 2 ? VOID_HOT : "#1a1410"));
  return {
    aura: VOID,
    ember: VOID_HOT,
    auraSize: 1.2,
    root: {
      at: [0, 0, 0],
      s0: S,
      parts: [],
      walk: { p: [0, 0.03 * S, 0], f: f * 2, ph: PI / 2 },
      kids: [
        {
          at: B,
          parts: local(B, [
            P("sph", [0, y(1.0), 0.52], [0.6, 0.72, 0.76], fur),
            P("cyl", [0, y(1.035), -0.05], [0.56, 0.95, 0.56], fur, { r: [PI / 2, 0, 0], t: 1.05 }),
            P("sph", [0, y(1.04), -0.6], [0.58, 0.62, 0.64], fur),
            P("sph", [0, y(0.84), -0.02], [0.4, 0.26, 1.0], belly),
            ...(size === 0 ? Array.from({ length: 8 }, (_, i) => P("sph", [(i % 2 ? 1 : -1) * 0.26, y(1.08 - (i % 3) * 0.06), 0.42 - i * 0.12], [0.07, 0.09, 0.09], fur2)) : []),
            ...(t >= 2 ? [G("box", [0, y(1.31), -0.05], [0.04, 0.03, 1.0], VOID)] : []),
            ...(t >= 4 ? sym(G("box", [0.29, y(1.05), -0.05], [0.03, 0.05, 0.85], VOID_HOT)) : [])
          ]),
          idle: { r: [0.015, 0.02, 0.01], f: 1.4, p: [0, 0.01, 0] },
          walk: { r: [0.02, 0.04, 0.03], f, ph: PI },
          atk: { r: [-0.25, 0, 0], p: [0, 0.15, 0.4] },
          kids: [
            ...pair(leg([0.2, y(0.98), 0.58], [0.23, y(0.55), 0.6], [0.21, 0.08, 0.66], 0.27, 0)),
            ...pair(leg([0.2, y(1.0), -0.62], [0.24, y(0.6), -0.45], [0.21, 0.08, -0.66], 0.3, PI)),
            {
              at: sub(neckAt, B),
              parts: local(neckAt, [limb("cyl", [0, y(1.1), 0.66], [0, y(1.3), 0.9], 0.36, fur), ...maneParts]),
              idle: { r: [0.04, 0.18, 0], f: 0.5 },
              atk: { r: [0.3, 0, 0] },
              kids: [
                {
                  at: sub(headAt, neckAt),
                  parts: local(headAt, [
                    P("sph", h0, [0.36 * h, 0.34 * h, 0.38 * h], fur),
                    ...sym(P("sph", hp([0.1, -0.06, 0.1]), [0.2 * h, 0.18 * h, 0.2 * h], belly)),
                    P("sph", hp([0, -0.07, 0.18]), [0.2 * h, 0.17 * h, 0.24 * h], belly),
                    P("sph", hp([0, -0.03, 0.29]), [0.09 * h, 0.06 * h, 0.05 * h], "#2a1f24"),
                    ...sym(P("sph", [0.13 * h, y(1.34) + 0.17 * h, 0.95], [0.12 * h, 0.13 * h, 0.06 * h], fur2)),
                    ...(t >= 4 ? crystalCrown([0, y(1.34) + 0.15, 1.02], 0.13, 5, 0.24) : [])
                  ]),
                  idle: { r: [0.05, 0.1, 0.04], f: 0.7 },
                  atk: { r: [-0.25, 0, 0] },
                  kids: [
                    { at: [0, 0, 0], eye: true, parts: local(headAt, eyes) },
                    { at: sub(hp([0, -0.1, 0.02]), headAt), parts: local(hp([0, -0.1, 0.02]), [limb("cyl", hp([0, -0.12, 0.04]), hp([0, -0.13, 0.24]), 0.12 * h, belly)]), atk: { r: [0.5, 0, 0] }, idle: { r: [0.05, 0, 0], f: 1.4 } }
                  ]
                }
              ]
            },
            {
              at: sub([0, y(1.1), -0.88], B),
              r: [0.6, 0.15, 0],
              parts: [limb("cyl", [0, 0, 0], [0, -0.05, -0.45], 0.09, fur), P("sph", [0, -0.08, -0.5], [0.12, 0.12, 0.18], t >= 3 ? VOID : t >= 1 ? VOID_MATTE : mane, { glow: t >= 3 })],
              idle: { r: [0.06, 0.35, 0], f: 0.75 },
              walk: { r: [0, 0.25, 0], f, ph: 0 }
            }
          ]
        },
        ...(t >= 3 ? [circling(1.0, 0.95, 5, 0.55, (i, at) => G("oct", at, [0.07, 0.14, 0.07], i % 2 ? VOID : VOID_HOT))] : [])
      ]
    }
  };
}

/* ================================================================== */
/* The Obsidian Knight's brood                                         */
/* ================================================================== */

const OBS = ["#5c566e", "#555067", "#4e4860", "#474058", "#3e374f"];
const OBS2 = ["#4a4559", "#444054", "#3e394e", "#373146", "#2f293d"];
const TRIM = ["#6e687f", "#7a7390", "#a9afbb", "#b6bcc8", "#c4b5fd"];
const KCAPE = ["#2a2238", "#2a2238", "#2a2238", "#3b1d5e", "#4c1d75"];

/** People of the gate's order on the mercenary person rig (`person`): they march and strike as soldiers do */
function knightRig(size: number): BossRig {
  const t = size;
  const boss = size === 4;
  const S = BROOD_SIZES.knight.height[size] / 2.3;
  const h = 1.12;
  const w = 1.12;
  const pl = OBS[size];
  const pl2 = OBS2[size];
  const trim = TRIM[size];
  const ash = "#a69fb4";
  const helm: BossPart[] =
    size <= 1
      ? [P("sph", [0, 0.2, 0], [0.4, 0.44, 0.42], ash), P("sph", [0, 0.3, -0.01], [0.48, 0.34, 0.48], pl), P("tor", [0, 0.26, -0.01], [0.48, 0.48, 0.5], trim, { r: [PI / 2, 0, 0], t: 0.05 }), ...(size === 1 ? [P("box", [0, 0.2, 0.23], [0.04, 0.16, 0.03], trim)] : [])]
      : [
          P("sph", [0, 0.22, 0], [0.48, 0.54, 0.5], pl),
          G("box", [0, 0.2, 0.27], [0.3, 0.04, 0.05], VOID_HOT),
          P("box", [0, 0.28, 0.22], [0.03, 0.3, 0.04], trim),
          ...(t >= 3 ? sym(P("cone", [0.28, 0.44, -0.06], [0.08, 0.36, 0.08], pl2, { r: [-0.35, 0, -0.5] })) : []),
          ...(t >= 4 ? crystalCrown([0, 0.46, 0], 0.15, 5, 0.24) : [])
        ];
  const blade = (len: number): BossPart[] => [P("box", [0.02, -0.66 * h, 0.1], [0.3, 0.05, 0.08], trim), P("box", [0.02, -0.6 * h + len / 2, 0.24], [0.08, len, 0.025], size >= 2 ? "#cfd4dc" : "#8f8c9a", { r: [0.6, 0, 0] })];
  const rig = person({
    aura: VOID,
    ember: VOID_HOT,
    auraSize: 1.3,
    h,
    w,
    leg: [...legOf(h, w, pl, pl2), P("box", [0, -0.44 * h, 0.16], [0.4, 0.16, 0.08], trim)],
    torso: [
      P("box", [0, 0.58 * h, 0], [0.74 * w, 0.8 * h, 0.5], pl),
      P("cyl", [0, 0.12 * h, 0], [0.62 * w, 0.32 * h, 0.5], "#6b6878", { t: 0.9 }),
      P("box", [0, 0.28 * h, 0], [0.82 * w, 0.1, 0.6], pl2),
      P("box", [0, 0.62 * h, 0.26], [0.04, 0.6 * h, 0.03], trim),
      ...sym(P("sph", [0.44 * w, 0.84 * h, 0], [0.4 + 0.03 * size, 0.32, 0.42], pl)),
      ...(t >= 3 ? sym(G("box", [0.14, 0.62 * h, 0.27], [0.03, 0.4, 0.02], VOID, { r: [0, 0, 0.1] }), P("cone", [0.5 * w, 1.0 * h, -0.02], [0.08, 0.3, 0.08], pl2, { r: [0, 0, -0.4] })) : []),
      ...(boss ? [G("oct", [0, 0.74 * h, 0.3], [0.2, 0.26, 0.1], VOID_HOT)] : [])
    ],
    torsoAtk: { r: [0.3, boss ? 0 : -0.2, 0] },
    head: {
      parts: helm,
      eyes: size <= 1 ? sym(P("sph", [0.08, 0.2, 0.19], [0.06, 0.05, 0.04], "#2e1065")) : undefined
    },
    armR: boss
      ? {
          // The greatsword before him in both hands, its edge burning
          parts: [...armOf(h, w, pl, pl2), P("box", [0.02, -0.66 * h, 0.1], [0.42, 0.06, 0.1], trim), P("cyl", [0.02, -0.74 * h, 0.1], [0.06, 0.34, 0.06], "#1c1726"), P("box", [0.02, 0.08 * h, 0.1], [0.14, 1.45, 0.04], pl2), G("box", [0.02, 0.08 * h, 0.13], [0.04, 1.25, 0.02], VOID)],
          r: [-0.9, 0, -0.35],
          atk: { r: [1.2, 0, 0] },
          swing: 0
        }
      : { parts: [...armOf(h, w, pl, pl2), ...blade([0.55, 0.7, 0.85, 0.95][size])], r: [-0.25, 0, 0.06], atk: { r: [1.0, 0, 0.15] }, swing: 0.45 },
    armL: boss
      ? { parts: armOf(h, w, pl, pl2), r: [-0.9, 0, 0.35], atk: { r: [1.2, 0, 0] }, swing: 0 }
      : size === 0
        ? { parts: armOf(h, w, pl, pl2), r: [-0.1, 0, -0.05], swing: 0.8 }
        : { parts: [...armOf(h, w, pl, pl2), P("box", [-0.08, -0.45, 0.3], [0.5, 0.66, 0.06], "#5b2f9a"), P("box", [-0.08, -0.15, 0.33], [0.52, 0.05, 0.05], trim), ...(t >= 2 ? [G("oct", [-0.08, -0.4, 0.35], [0.1, 0.14, 0.04], VOID_HOT)] : [])], r: [-0.25, 0, -0.05], atk: { r: [-0.35, 0, 0], d: 0.05 }, swing: 0.15 },
    kids: [
      ...(size === 1 || size === 2 ? [<BossBone>{ at: [0.12, 0.6, -0.3], parts: [P("cyl", [0, 0.5, 0], [0.04, 1.3, 0.04], "#2a2433"), P("box", [0.17, 0.95, 0], [0.32, 0.22, 0.02], VOID_MATTE)], idle: { r: [0, 0.2, 0.05], f: 2.2 } }] : []),
      ...(size >= 3 ? [<BossBone>{ at: [0, 0.95 * h, -0.28], parts: [P("box", [0, -0.5 * h * (boss ? 1.15 : 1), -0.04], [0.8 * w, 1.0 * h * (boss ? 1.15 : 1), 0.04], KCAPE[size], { r: [0.12, 0, 0] })], idle: { r: [0.06, 0, 0.03], f: 1.1 }, walk: { r: [-0.12, 0, 0], f: 2 * (2 * PI) / 1.15 } }] : [])
    ],
    around: t >= 3 ? [circling(1.3 * h, 0.95, 5, 0.6, (i, at) => G("oct", at, [0.1, 0.2, 0.1], i % 2 ? VOID : VOID_HOT))] : []
  });
  rig.root.s0 = S;
  if (rig.root.walk?.p) rig.root.walk = { ...rig.root.walk, p: [0, rig.root.walk.p[1] * S, 0] };
  return rig;
}

/* ================================================================== */
/* The Hollow Wraith's brood                                           */
/* ================================================================== */

/** As in HD: a shroud of deep void-grey, its tattered edges pale as smoke */
const SMOKE = ["#5d5476", "#51486b", "#463c5f", "#3a3053", "#2d2445"];
const SMOKE2 = ["#d6cdee", "#cbc0e8", "#bfb2e2", "#b2a3da", "#a493d1"];

/** A floating shroud of smoke: hood, dark face, a tail of smoke, sleeves that grow hands */
function wraithRig(size: number): BossRig {
  const t = size;
  const S = BROOD_SIZES.wraith.height[size] / 2.0;
  const sm = SMOKE[size];
  const sm2 = SMOKE2[size];
  const k = [0.35, 0.65, 1, 1.1, 1.25][size];
  const B: Vec3 = [0, 0.9, 0];
  const arm = (s: number): BossBone => ({
    at: [s * 0.24, 0.58, 0],
    r: [s > 0 ? -0.6 : -0.4, 0, s * (s > 0 ? 0.32 : 0.42)],
    parts: [
      P("cyl", [s * 0.04 * k, -0.28 * k, 0.06], [0.16 + 0.04 * k, 0.6 * k, 0.16 + 0.04 * k], sm, { t: 0.45, r: [-0.2, 0, s * 0.1] }),
      P("box", [s * 0.06 * k, -0.62 * k, 0.08], [0.06, 0.22, 0.02], sm2, { r: [-0.1, 0, s * 0.2] }),
      P("sph", [s * 0.06 * k, -0.6 * k, 0.15], [0.1, 0.12, 0.1], t >= 2 ? "#e8e1d4" : "#2a2238"),
      ...(t >= 2 ? [0, 1, 2].map((i) => P("cone", [s * (0.03 + i * 0.03) * k, -0.72 * k, 0.2], [0.03, t >= 4 ? 0.34 : 0.2, 0.03], "#e8e1d4", { r: [PI - 0.4, 0, 0] })) : [])
    ],
    idle: { r: [0.12, 0, 0.05 * s], f: 0.9, ph: s > 0 ? 0 : 1.6 },
    walk: { r: [-0.25, 0, 0], f: rate(2.2), ph: s > 0 ? 0 : PI },
    atk: { r: [-1.4, 0, -0.1 * s] }
  });
  return {
    aura: VOID,
    ember: VOID_HOT,
    auraSize: 1.0,
    float: 0.3 * S,
    root: {
      at: [0, 0, 0],
      s0: S,
      parts: [],
      kids: [
        {
          at: B,
          // Hunched over, the shroud flaring from the shoulders and trailing away into a point
          r: [0.22, 0.06, 0],
          parts: local(B, [
            P("cone", [0, 0.6, -0.08], [0.8, 1.1, 0.66], sm, { r: [PI + 0.12, 0, 0] }),
            P("cyl", [0, 1.27, 0], [0.5 + 0.02 * size, 0.55, 0.46], sm, { t: 1.25 }),
            P("sph", [0, 1.52, -0.03], [0.62, 0.22, 0.44], sm),
            ...Array.from({ length: 11 }, (_, i) => {
              const a = (i / 11) * 2 * PI;
              const len = 0.32 + (i % 3) * 0.1;
              return P("box", [Math.sin(a) * 0.3, 0.62 - len / 2, Math.cos(a) * 0.3 - 0.05], [0.14, len, 0.02], i % 2 ? sm : sm2, { r: [0.18 * Math.cos(a), a, 0] });
            }),
            ...Array.from({ length: 7 }, (_, i) => {
              const a = ((i - 3) / 3) * 1.9;
              return P("box", [Math.sin(a) * 0.3, 1.36, Math.cos(a) * 0.2], [0.12, 0.26 + (i % 2) * 0.08, 0.02], i % 2 ? sm2 : sm, { r: [0.2, a, 0] });
            }),
            ...(t >= 1 ? [P("tor", [0, 0.82, 0], [0.56, 0.56, 0.5], VOID_MATTE, { r: [PI / 2 + 0.1, 0, 0], t: 0.06 }), P("cyl", [0.17, 0.66, 0.22], [0.08, 0.08, 0.08], "#8a7f6a", { t: 0.5 })] : []),
            ...(t >= 2 ? [G("sph", [0, 1.3, 0.17], [0.12, 0.14, 0.08], VOID_HOT)] : []),
            ...(t >= 3 ? [G("tor", [0, 0.42, 0], [0.6, 0.6, 0.5], VOID, { r: [PI / 2, 0, 0], t: 0.03 })] : []),
            ...(t >= 4 ? [G("sph", [0, 1.3, 0.13], [0.28, 0.36, 0.1], VOID), ...[0, 1, 2, 3].map((i) => P("box", [0, 1.42 - i * 0.07, 0.2], [0.3, 0.025, 0.03], "#e8e1d4"))] : [])
          ]),
          idle: { r: [0.04, 0.05, 0.03], f: 0.7, p: [0, 0.06, 0] },
          walk: { r: [0.12, 0.05, 0.04], f: rate(2.2) },
          atk: { r: [0.35, 0, 0], p: [0, 0, 0.35] },
          kids: [
            {
              at: [0, 0.65, 0.02],
              parts: local([0, 1.55, 0.02], [
                P("sph", [0, 1.67, 0], [0.46, 0.58, 0.48], sm),
                P("cone", [0, 1.93, -0.14], [0.22, 0.34, 0.13], sm, { r: [-0.95, 0, 0] }),
                P("tor", [0, 1.66, 0.18], [0.36, 0.42, 0.5], sm2, { t: 0.06 }),
                P("sph", [0, 1.63, 0.1], [0.28, 0.32, 0.2], "#07050c"),
                ...(t >= 4 ? crystalCrown([0, 1.82, 0.02], 0.15, 5, 0.26) : [])
              ]),
              idle: { r: [0.05, 0.25, 0.04], f: 0.5 },
              kids: [{ at: [0, 0, 0], eye: true, parts: local([0, 1.55, 0.02], sym((t >= 2 ? G : P)("sph", [0.05, 1.66, 0.17], [0.05, 0.07, 0.03], t >= 2 ? VOID_HOT : "#2a1f3a"))) }]
            },
            arm(1),
            arm(-1),
            { at: [0, -0.4, -0.02], r: [-2.6, 0, 0], parts: [P("cone", [0, 0.3, 0], [0.32, 0.6, 0.32], sm2)], idle: { r: [0.2, 0.3, 0], f: 1.1 }, walk: { r: [0.15, 0, 0], f: rate(2.2) } }
          ]
        },
        ...(t >= 3 ? [circling(1.2, 0.75, 4, 0.5, (i, at) => G("sph", at, [0.1, 0.15, 0.1], i % 2 ? VOID_HOT : "#a5f3fc"))] : [])
      ]
    }
  };
}

/* ================================================================== */
/* The Crystal Broodmother's brood                                     */
/* ================================================================== */

const CARAPACE = ["#857a96", "#7d7290", "#746988", "#6a5f80", "#5f5476"];
const CARAPACE2 = ["#655b74", "#5f556f", "#584e68", "#514761", "#493f59"];
const SPIDER_LEGS: Array<{ root: Vec3; knee: Vec3; foot: Vec3 }> = [
  { root: [0.12, 0.34, 0.16], knee: [0.38, 0.55, 0.42], foot: [0.48, 0.0, 0.62] },
  { root: [0.14, 0.34, 0.06], knee: [0.48, 0.55, 0.18], foot: [0.68, 0.0, 0.26] },
  { root: [0.14, 0.34, -0.04], knee: [0.48, 0.55, -0.12], foot: [0.68, 0.0, -0.2] },
  { root: [0.12, 0.34, -0.12], knee: [0.38, 0.55, -0.36], foot: [0.5, 0.0, -0.58] }
];

/** A shard spider: a body with eight legs, an abdomen crowned with crystal, fangs; it scuttles four legs at a time */
function spiderRig(size: number): BossRig {
  const t = size;
  const S = BROOD_SIZES.spider.height[size] / 0.6;
  const col = CARAPACE[size];
  const col2 = CARAPACE2[size];
  const reach = [1, 1, 1, 1.15, 1.1][size];
  const f = rate([0.45, 0.55, 0.65, 0.75, 1.0][size]);
  const B: Vec3 = [0, 0.34, 0];
  const leg = (i: number): BossBone => {
    const L = SPIDER_LEGS[i];
    const k = (v: Vec3, m = 1): Vec3 => [v[0] * m, v[1] * (m > 1 ? 1 + (m - 1) * 0.6 : 1), v[2] * m];
    const knee = k(L.knee, reach);
    const foot = k(L.foot, reach);
    return {
      at: sub(L.root, B),
      parts: local(L.root, [limb("cyl", L.root, knee, 0.07, i % 2 ? col : col2, { t: 0.85 }), limb("cyl", knee, foot, 0.05, i % 2 ? col : col2, { t: 0.4 }), ...(t >= 3 ? [G("cone", [(L.root[0] + knee[0]) / 2, (L.root[1] + knee[1]) / 2 + 0.04, (L.root[2] + knee[2]) / 2], [0.03, 0.1, 0.03], VOID)] : [])]),
      walk: { r: [0, 0.3 * (i < 2 ? 1 : 0.7), 0.2], f, ph: i % 2 ? PI : 0 },
      idle: { r: [0.03, 0, 0.03], f: 1.4, ph: i }
    };
  };
  const crystals: BossPart[] =
    size === 0
      ? [P("cone", [0, 0.27, -0.32], [0.07, 0.16, 0.07], "#9b95a6")]
      : Array.from({ length: [0, 3, 4, 6, 9][size] }, (_, i) => {
          const ang = (i / [0, 3, 4, 6, 9][size]) * 2 * PI;
          const len = 0.16 + 0.03 * size + (i % 3) * 0.04;
          return (t >= 2 ? G : P)("cone", [Math.sin(ang) * 0.1, 0.2 + len / 2, -0.22 + Math.cos(ang) * 0.12], [0.07 + 0.015 * size, len, 0.07 + 0.015 * size], t >= 2 ? (i % 2 ? VOID : VOID_HOT) : VOID_MATTE, { r: [Math.cos(ang) * 0.3 - 0.2, 0, -Math.sin(ang) * 0.4] });
        });
  return {
    aura: VOID,
    ember: VOID_HOT,
    auraSize: 1.0,
    root: {
      at: [0, 0, 0],
      s0: S,
      parts: [],
      kids: [
        {
          at: B,
          parts: local(B, [
            P("sph", [0, 0.34, 0.05], [0.32, 0.2, 0.36], col),
            P("sph", [0, 0.33, 0.22], [0.2, 0.16, 0.18], col2),
            ...sym((t >= 2 ? G : P)("sph", [0.03, 0.37, 0.29], [0.03, 0.03, 0.02], t >= 2 ? VOID_HOT : "#1a1424"), (t >= 2 ? G : P)("sph", [0.07, 0.39, 0.27], [0.025, 0.025, 0.02], t >= 2 ? VOID_HOT : "#1a1424"), P("cone", [0.03, 0.26, 0.31], [0.04, 0.1, 0.04], t >= 2 ? VOID_HOT : "#e9e3f1", { r: [PI, 0, 0] })),
            ...(t >= 4 ? crystalCrown([0, 0.42, 0.12], 0.1, 5, 0.18) : [])
          ]),
          idle: { r: [0.03, 0.06, 0.02], f: 0.8 },
          walk: { r: [0, 0.03, 0.02], f, p: [0, 0.01, 0] },
          atk: { r: [-0.45, 0, 0], p: [0, 0.08, 0.08] },
          kids: [
            ...[0, 1, 2, 3].flatMap((i) => pair(leg(i))),
            {
              at: [0, 0.02, -0.1],
              parts: local([0, 0.36, -0.1], [P("sph", [0, 0.42, -0.32], [0.44, 0.38, 0.52], col), P("sph", [0, 0.36, -0.32], [0.32, 0.24, 0.4], col2), ...crystals.map((p) => ({ ...p, p: [p.p[0], p.p[1] + 0.36, p.p[2] - 0.1] as Vec3 })), ...(t >= 4 ? [G("sph", [0, 0.44, -0.55], [0.24, 0.2, 0.1], VOID_HOT)] : []), ...(size === 1 ? [P("sph", [0, 0.62, -0.16], [0.12, 0.14, 0.12], "#b9a6d9")] : [])]),
              idle: { r: [0.06, 0.05, 0], f: 1.6, s: 0.02 },
              walk: { r: [0, 0.06, 0], f },
              atk: { r: [0.4, 0, 0] }
            }
          ]
        },
        ...(t >= 3 ? [circling(0.55, 0.7, 6, 0.6, (i, at) => G("oct", at, [0.06, 0.14, 0.06], i % 2 ? VOID : VOID_HOT))] : [])
      ]
    }
  };
}

/* ================================================================== */
/* The Gate Sentinels                                                  */
/* ================================================================== */

const SOBS = ["#6e6786", "#676080", "#605879", "#5a5173"];
const SOBS2 = ["#4c4560", "#463f5a", "#413a55", "#3c3450"];
const CRIMSON = "#e11d48";

/** Suits of plate with no one inside, floating, a halberd in the right gauntlet; crowned on the legendary levels */
function sentinelRig(size: number): BossRig {
  const legendary = size >= 2;
  const S = BROOD_SIZES.sentinel.height[size] / 2.9;
  const h = 1.25;
  const w = 1.3;
  const col = SOBS[size];
  const col2 = SOBS2[size];
  const gauntlet = (s: number): BossPart[] => [P("box", [0.02 * s, -0.42 * h, 0.06], [0.24, 0.34, 0.24], col2), P("sph", [0.02 * s, -0.6 * h, 0.08], [0.26, 0.26, 0.26], col)];
  const top = -0.6 * h + 1.25;
  const rig = person({
    aura: legendary ? CRIMSON : VOID,
    ember: VOID_HOT,
    auraSize: 1.5,
    float: 0.35,
    glide: true,
    h,
    w,
    leg: [],
    torso: [
      P("box", [0, 0.58 * h, 0], [0.8 * w, 0.82 * h, 0.56], col),
      P("cone", [0, -0.38 * h, 0], [0.72 * w, 0.95 * h, 0.62], col2, { r: [PI, 0, 0] }),
      P("cyl", [0, 0.12 * h, 0], [0.6 * w, 0.2, 0.5], col2),
      // Pauldrons floating off the shoulders over glowing orbs, runes down the plate, a ring of light at the waist
      ...sym(
        P("sph", [0.52 * w, 0.93 * h, 0], [0.56, 0.42, 0.56], col),
        G("sph", [0.4 * w, 0.82 * h, 0], [0.13, 0.13, 0.13], CRIMSON),
        P("cone", [0.64 * w, 1.18 * h, -0.02], [0.1, 0.44 + 0.1 * size, 0.1], col2, { r: [0, 0, -0.35] }),
        G("box", [0.13, 0.6 * h, 0.325], [0.08, 0.42, 0.02], legendary ? CRIMSON : VOID)
      ),
      G("tor", [0, 0.2 * h, 0], [0.66 * w, 0.66 * w, 0.5], CRIMSON, { r: [PI / 2, 0, 0], t: 0.04 }),
      G("oct", [0, 0.72 * h, 0.3], [0.14, 0.2, 0.08], CRIMSON),
      // A tattered crimson tabard front and back
      P("box", [0, -0.2 * h, 0.3], [0.38, 0.95, 0.02], "#5c0f24", { r: [-0.06, 0, 0] }),
      P("box", [0, -0.2 * h, -0.3], [0.38, 0.95, 0.02], "#5c0f24", { r: [0.06, 0, 0] }),
      // Wings of floating blades on the legendary levels
      ...(legendary
        ? sym(
            ...[0, 1, 2, 3, 4].map((i) => {
              const a = -0.1 + i * 0.32;
              const L = 0.9 + (2 - Math.abs(i - 2)) * 0.25 + 0.1 * size;
              const dx = Math.cos(a);
              const dy = Math.sin(a) + 0.2;
              return P("blade", [0.26 + dx * L * 0.5, 0.76 * h - i * 0.07 + dy * L * 0.5, -0.38], [0.12, L, 0.03], col2, { r: [0, 0, -Math.atan2(dx, dy)] });
            })
          )
        : [])
    ],
    head: {
      // The helm floats over a ring of light; a crest of plate; behind it a halo of blades
      parts: [
        G("tor", [0, 0.02, 0], [0.24, 0.24, 0.5], CRIMSON, { r: [PI / 2, 0, 0], t: 0.08 }),
        P("sph", [0, 0.3, 0], [0.5, 0.66, 0.54], col),
        P("box", [0, 0.58, -0.04], [0.04, 0.3, 0.36], col2),
        G("sph", [0, 0.3, 0.27], [0.14, 0.06, 0.05], CRIMSON),
        ...(legendary ? crystalCrown([0, 0.62, 0], 0.17, 5, 0.3 + 0.04 * size).map((p) => ({ ...p, c: p.c === VOID ? CRIMSON : p.c })) : [])
      ],
      kids: [
        {
          at: [0, 0.35, -0.32],
          spin: 0,
          parts: [G("tor", [0, 0, 0], [0.64, 0.64, 0.5], legendary ? CRIMSON : VOID, { t: 0.04 }), ...Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * 2 * PI;
            const L = 0.2 + (i % 2) * 0.1;
            return P("cone", [Math.cos(a) * (0.32 + L / 2), Math.sin(a) * (0.32 + L / 2), 0], [0.07, L, 0.07], col2, { r: [0, 0, a - PI / 2] });
          })],
          idle: { r: [0, 0, 0.6], f: 0.25 }
        }
      ]
    },
    armR: {
      parts: [
        ...gauntlet(1),
        P("cyl", [0.02, -0.6 * h + 0.28, 0.12], [0.07, 1.95, 0.07], "#2a2433", { r: [0.18, 0, 0] }),
        P("blade", [0.22, top, 0.3], [0.42, 0.52, 0.06], "#9aa1ad", { r: [0.18, 0, -PI / 2] }),
        P("cone", [0.02, top + 0.32, 0.36], [0.08, 0.36, 0.08], "#b9bfc9", { r: [0.18, 0, 0] }),
        ...(legendary ? [G("box", [0.42, top, 0.3], [0.03, 0.46, 0.04], VOID_HOT, { r: [0.18, 0, 0] })] : [])
      ],
      r: [-0.25, 0, 0.12],
      atk: { r: [1.1, 0, 0.2] },
      swing: 0.2
    },
    armL: { parts: gauntlet(-1), r: [-0.35, 0, -0.18], atk: { r: [-0.4, 0, 0], d: 0.05 }, swing: 0.4 },
    torsoAtk: { r: [0.3, -0.2, 0] },
    around: [circling(1.25 * h, 1.0, 6, 0.55, (i, at) => G("oct", at, [0.12, 0.26, 0.12], i % 2 ? VOID : CRIMSON))]
  });
  rig.root.s0 = S;
  if (rig.root.walk?.p) rig.root.walk = { ...rig.root.walk, p: [0, rig.root.walk.p[1] * S, 0] };
  return rig;
}

/* ================================================================== */
/* The Gate Warden                                                     */
/* ================================================================== */

const W_PLATE = "#3d3150";
const W_PLATE2 = "#271d35";
const W_CLOTH = "#2a1f38";
const W_CLOTH2 = "#1a1324";
const W_CRIMSON = "#be123c";
const W_GOLD = "#e3c27a";
const W_PRISM = ["#f0abfc", "#67e8f9", "#fde68a", "#fb7185", "#a5b4fc"];

/** A titan in black-crimson plate over a long robe, masked, a crown of shards over his head, the key-staff in his hand */
function wardenRig(): BossRig {
  const h = 2.95;
  const w = 2.7;
  const staffY = -0.6 * h;
  // The gate at his back: a ring of obsidian slabs round a disc of void, prismatic rims, spiral arms of light (turning)
  const gate: BossBone = {
    at: [0, 0.76 * h + 0.25, -1.15],
    spin: 0,
    parts: [
      P("cyl", [0, 0, -0.06], [3.3, 0.04, 3.3], "#05030a", { r: [PI / 2, 0, 0] }),
      ...Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * 2 * PI;
        return P("box", [Math.cos(a) * 1.95, Math.sin(a) * 1.95, 0], [0.46, 0.3, 0.22], i % 2 ? W_PLATE2 : "#120c1a", { r: [0, 0, a + PI / 2] });
      }),
      G("tor", [0, 0, 0.02], [3.5, 3.5, 0.5], W_CRIMSON, { t: 0.02 }),
      G("tor", [0, 0, 0.04], [4.3, 4.3, 0.5], W_PRISM[1], { t: 0.01 }),
      ...Array.from({ length: 4 }, (_, k) =>
        Array.from({ length: 6 }, (_, i) => {
          const r = 0.35 + i * 0.22;
          const a = (k / 4) * 2 * PI + i * 0.32;
          return G("box", [Math.cos(a) * r, Math.sin(a) * r, 0.02], [0.18, 0.05, 0.02], i % 2 ? W_CRIMSON : W_PRISM[(k + i) % W_PRISM.length], { r: [0, 0, a + 1.0] });
        })
      ).flat(),
      G("sph", [0, 0, 0.02], [0.3, 0.3, 0.12], "#fecdd3")
    ],
    idle: { r: [0, 0, 0.5], f: 0.12 }
  };
  return person({
    aura: W_CRIMSON,
    ember: "#fde68a",
    auraSize: 3.2,
    float: 0.35,
    h,
    w,
    leg: legOf(h, w, W_CLOTH2, W_PLATE),
    torso: [
      P("cyl", [0, -0.44 * h, 0], [1.0 * w, 0.86 * h, 0.9 * w], W_CLOTH, { t: 0.62 }),
      // A hem of crimson light, prismatic seams down the robe
      G("tor", [0, -0.86 * h, 0], [0.98 * w, 0.98 * w, 0.5], W_CRIMSON, { r: [PI / 2, 0, 0], t: 0.03 }),
      ...[0.55, -0.55, 0.25, -0.25].map((a, i) => G("box", [Math.sin(a) * 0.42 * w, -0.5 * h, Math.cos(a) * 0.42 * w], [0.05, 0.62 * h, 0.03], W_PRISM[i], { r: [0.12 * Math.cos(a), a, -0.12 * Math.sin(a)] })),
      P("cyl", [0, -0.12 * h, 0], [0.72 * w, 0.26 * h, 0.66 * w], W_PLATE, { t: 0.85 }),
      P("tor", [0, 0.08 * h, 0], [0.66 * w, 0.66 * w, 0.5], W_PLATE2, { r: [PI / 2, 0, 0], t: 0.06 }),
      G("oct", [0, 0.08 * h, 0.34 * w], [0.2, 0.28, 0.1], W_CRIMSON),
      P("box", [0, 0.55 * h, 0], [0.76 * w, 0.82 * h, 0.52 * w], W_PLATE),
      P("box", [0, 0.6 * h, 0.27 * w], [0.08, 0.6 * h, 0.04], W_GOLD),
      G("oct", [0, 0.68 * h, 0.28 * w], [0.3, 0.42, 0.14], W_CRIMSON),
      P("cyl", [0, 0.9 * h, -0.02], [1.6 * w * 0.6, 0.5, 1.4 * w * 0.6], W_CLOTH, { t: 0.55 }),
      ...sym(
        P("sph", [0.5 * w, 0.86 * h, 0], [0.62 * w, 0.46 * w, 0.62 * w], W_PLATE),
        P("cone", [0.72 * w, 1.07 * h, -0.05], [0.16, 0.7, 0.16], W_PLATE2, { r: [0, 0, -0.4] }),
        G("tor", [0.5 * w, 0.86 * h, 0], [0.8 * w * 0.6, 0.8 * w * 0.6, 0.5], W_PRISM[2], { r: [0, PI / 2, 0.35], t: 0.03 }),
        G("box", [0.13 * w, 0.6 * h, 0.27 * w], [0.05, 0.5 * h, 0.03], W_PRISM[1], { r: [0, 0, 0.08] })
      )
    ],
    head: {
      parts: [
        P("sph", [0, 0.3, 0.02], [0.9, 1.04, 0.95], W_PLATE),
        P("tor", [0, 0.4, 0.02], [0.92, 0.92, 0.5], W_GOLD, { r: [PI / 2, 0, 0], t: 0.04 }),
        G("box", [0, 0.32, 0.48], [0.42, 0.05, 0.06], W_CRIMSON),
        G("oct", [0, 0.52, 0.45], [0.1, 0.2, 0.06], W_PRISM[1]),
        P("cyl", [0, 0.06, -0.06], [1.1, 0.5, 1.0], W_CLOTH, { t: 1.2 }),
        ...sym(P("cone", [0.5, 0.75, -0.08], [0.12, 0.8, 0.12], "#120c1a", { r: [-0.15, 0, -0.4] }))
      ]
    },
    armR: {
      parts: [
        ...armOf(h, w, W_PLATE, W_PLATE2, { cuff: W_GOLD }),
        P("cyl", [0.02 * w, staffY + 0.15, 0.2], [0.12, 4.3, 0.12], W_GOLD),
        P("box", [0.17 + 0.02 * w, staffY - 1.75, 0.2], [0.28, 0.12, 0.06], W_GOLD),
        P("box", [0.17 + 0.02 * w, staffY - 1.55, 0.2], [0.28, 0.12, 0.06], W_GOLD),
        P("tor", [0.02 * w, staffY + 2.72, 0.2], [0.9, 0.9, 0.5], W_GOLD, { t: 0.07 }),
        G("oct", [0.02 * w, staffY + 2.72, 0.2], [0.4, 0.56, 0.4], W_CRIMSON)
      ],
      r: [-0.2, 0, 0.1],
      atk: { r: [-1.2, 0, 0.1] },
      swing: 0
    },
    armL: { parts: armOf(h, w, W_PLATE, W_PLATE2, { cuff: W_GOLD }), r: [-0.25, 0, -0.12], atk: { r: [-1.4, 0, -0.1], d: 0.05 }, swing: 0.35 },
    torsoAtk: { r: [0.2, 0, 0] },
    kids: [{ at: [0, 0.95 * h, -0.4 * w * 0.5], parts: [P("box", [0, -0.48 * h, -0.2], [1.9 * w * 0.5, 0.98 * h, 0.06], W_CLOTH2, { r: [0.12, 0, 0] })], idle: { r: [0.04, 0, 0.02], f: 0.9 } }, gate],
    around: [circling(1.92 * h + 0.8, 0.62, 9, 0.5, (i, at) => G("oct", at, [0.22, 0.56, 0.22], i % 3 === 0 ? W_CRIMSON : W_PRISM[i % W_PRISM.length]))]
  });
}

/* ================================================================== */
/* The Warden's guard: the Oathbound's koi circling his head           */
/* ================================================================== */

/** As the HD guard: each koi swims its own ring above the head (at the rig's height `KOI_Y`), half a lap apart */
const KOI_Y = 1.6;
const KOI_R = 1.7;
/** The Warden's guard: its own rig, the same type as its HD hero (`heroOathbound.ts`) */
export const WARDEN_KOI_TYPE = "vg-warden-koi";
function wardenKoiRig(): BossRig {
  const fish = (dark: boolean): BossBone => {
    const body = dark ? "#1c1326" : "#f5f1ff";
    const fin = dark ? "#3b2a52" : "#e9e3f7";
    const seam = dark ? "#e11d48" : "#fde68a";
    const at = (a: number, y = 0, r = KOI_R): Vec3 => [Math.cos(a) * r, KOI_Y + y, Math.sin(a) * r];
    const radii = [0.17, 0.19, 0.17, 0.14, 0.1, 0.07];
    const step = 0.17;
    const parts: BossPart[] = radii.flatMap((r, i) => {
      const a = -i * step;
      return [P("sph", at(a), [r * 1.6, r * 1.5, r * 2.6], body, { r: [0, -a, 0] }), ...(i < 5 ? [G("box", at(a, r * 0.72), [0.02, 0.02, r * 1.6], seam, { r: [0, -a, 0] })] : [])];
    });
    const tailA = -radii.length * step;
    parts.push(
      // A butterfly tail with lit tips, a dorsal sail, pectoral fins, eyes
      P("blade", at(tailA - 0.06, 0.08), [0.06, 0.42, 0.3], fin, { r: [0.6, -tailA, 0] }),
      P("blade", at(tailA - 0.06, -0.08), [0.06, 0.42, 0.3], fin, { r: [-0.6 + PI, -tailA, 0] }),
      G("sph", at(tailA - 0.14, 0), [0.1, 0.1, 0.1], seam),
      P("blade", at(-0.25, 0.22), [0.04, 0.28, 0.34], fin, { r: [0, -0.25, 0] }),
      ...[1, -1].map((s) => P("blade", at(-0.08, -0.08, KOI_R + s * 0.17), [0.03, 0.24, 0.16], fin, { r: [0, 0.08, s * 1.1] })),
      ...[1, -1].map((s) => G("sph", at(0.12, 0.05, KOI_R + s * 0.11), [0.06, 0.06, 0.06], dark ? "#f5f1ff" : "#e11d48"))
    );
    return { at: [0, 0, 0], r: [0, dark ? 0 : PI, 0], parts, kids: [] };
  };
  return {
    aura: "#be123c",
    ember: "#e9d5ff",
    auraSize: 1.4,
    root: {
      at: [0, 0, 0],
      parts: [],
      kids: [
        { at: [0, 0, 0], spin: -0.55, parts: [], kids: [fish(true), fish(false)], idle: { r: [0.04, 0, 0.04], f: 0.5 } },
        circling(KOI_Y + 0.1, 2.3, 7, 0.35, (i, a) => (i % 2 ? G : P)("oct", a, [0.1, 0.24, 0.1], i % 2 ? (i % 4 === 1 ? "#e11d48" : VOID) : "#1c1326"))
      ]
    }
  };
}

/* ------------------------------ every family ------------------------------ */

const FAMILY_RIGS: Partial<Record<BroodId, (size: number) => BossRig>> = {
  stone: stoneRig,
  wraith: wraithRig,
  spider: spiderRig,
  lion: lionRig,
  knight: knightRig,
  sentinel: sentinelRig
};

/** The families built so far */
export const BUILT_BROODS = new Set(Object.keys(FAMILY_RIGS) as BroodId[]);

/** Every void creature's Normal rig, by type */
export const VOID_RIGS: Record<string, BossRig> = {
  ...Object.fromEntries((Object.entries(FAMILY_RIGS) as Array<[BroodId, (size: number) => BossRig]>).flatMap(([id, rig]) => BROOD_SIZES[id].height.map((_, i) => [vgType(id, i), rig(i)]))),
  [VG_WARDEN_TYPE]: wardenRig(),
  [WARDEN_KOI_TYPE]: wardenKoiRig()
};
