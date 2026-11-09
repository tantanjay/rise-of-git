import type { CivilizationType } from "@/types";
import { BossBone, BossRig, G, P, fan, sym } from "./bossRigs";
import type { MercenaryDef } from "./mercenaryRigs";
import { armOf, hand, legOf, person } from "./mercRigKit";

/*
 * Valoria's, Sylvandale's, Ironforge's and Drak'mar's mercenaries as Normal rigs (drawn by `BossModel`, checked by
 * `npm run check:models`), one per rarity, each on its own rung of the ladder: common matte with no accent, uncommon one
 * accent colour and a small prop, rare metal trim and one looping effect, epic bigger and glowing with bits circling,
 * legendary the civilization's Hero Monument statue come to life. All of them breathe, strike and march (`mercRigKit.ts`).
 */

const PI = Math.PI;

const ring = (y: number, R: number, n: number, color: (i: number) => string, size: [number, number, number], shape: "oct" | "sph" | "blade" = "oct", glow = true) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * PI * 2;
    const at: [number, number, number] = [Math.sin(a) * R, y + (i % 2) * 0.25, Math.cos(a) * R];
    return glow ? G(shape, at, size, color(i), { r: [0, a, 0.4] }) : P(shape, at, size, color(i), { r: [0, a, 0.4] });
  });

/** A ring of bits circling the figure */
const orbit = (y: number, spin: number, parts: ReturnType<typeof ring>): BossBone => ({ at: [0, y, 0], spin, parts, idle: { p: [0, 0.12, 0], f: 1.1 } });

/* ================================ Valoria ================================ */

const H_SKIN = "#e0ac83";
const H_BLUE = "#2f5bc0";
const H_GOLD = "#fbbf24";
const H_STEEL = "#b8bec8";

/** Common: a farm lad of the levy in a padded jerkin and a straw hat, an ash spear in hand */
function villageLevy(): BossRig {
  const jerkin = "#b39a72";
  return person({
    aura: "#94a3b8",
    ember: "#e7e5e4",
    leg: legOf(1, 1, "#7a6a52", "#4a3b2c"),
    torso: [P("box", [0, 0.14, 0], [0.46, 0.34, 0.38], "#8a7556"), P("box", [0, 0.55, 0], [0.66, 0.62, 0.46], jerkin), P("box", [0, 0.31, 0], [0.76, 0.08, 0.56], "#5b4636")],
    head: {
      parts: [
        P("sph", [0, 0.2, 0], [0.4, 0.44, 0.42], H_SKIN),
        P("cyl", [0, 0.4, 0], [0.84, 0.05, 0.84], "#d6b25e"),
        P("cone", [0, 0.58, 0], [0.44, 0.32, 0.44], "#c9a04a")
      ],
      eyes: sym(P("sph", [0.08, 0.22, 0.19], [0.06, 0.05, 0.04], "#2b1d14"))
    },
    armR: {
      parts: [...armOf(1, 1, jerkin, H_SKIN), P("cyl", [0.02, -0.1, 0.08], [0.06, 2.3, 0.06], "#8b5a2b"), P("spike", [0.02, 1.14, 0.08], [0.1, 0.28, 0.1], "#8a8f98")],
      atk: { r: [-1.1, 0, 0.1] },
      swing: 0.4
    },
    armL: { parts: armOf(1, 1, jerkin, H_SKIN) },
    torsoAtk: { r: [0.25, -0.2, 0] }
  });
}

/** Uncommon: a kettle-helmed shieldbearer of the Dawn Banner, the blue tabard and sun shield, a pennant on his back */
function dawnShieldbearer(): BossRig {
  const mail = "#8d939c";
  return person({
    aura: "#22c55e",
    ember: "#bfdbfe",
    leg: legOf(1, 1, "#4b5563", "#3a2d24"),
    torso: [P("box", [0, 0.5, 0], [0.68, 0.84, 0.46], mail), P("box", [0, 0.36, 0.1], [0.5, 0.9, 0.52], H_BLUE), P("box", [0, 0.3, 0], [0.76, 0.08, 0.56], "#3a2d24"), P("box", [0, 0.6, 0.39], [0.18, 0.18, 0.04], "#efe6d2")],
    head: {
      parts: [P("sph", [0, 0.2, 0], [0.4, 0.44, 0.42], H_SKIN), P("sph", [0, 0.32, 0], [0.44, 0.34, 0.44], mail), P("cyl", [0, 0.3, 0], [0.74, 0.05, 0.74], "#7a808a")],
      eyes: sym(P("sph", [0.08, 0.2, 0.19], [0.06, 0.05, 0.04], "#2b1d14"))
    },
    armR: {
      parts: [...armOf(1, 1, mail, "#5a4636"), P("box", [0.02, -0.25, 0.14], [0.08, 0.7, 0.03], "#a3a8b0", { r: [0.35, 0, 0] }), P("box", [0.02, -0.56, 0.12], [0.24, 0.05, 0.08], "#6b5a46")],
      atk: { r: [1.0, 0, 0.15] }
    },
    armL: {
      parts: [...armOf(1, 1, mail, "#5a4636"), P("box", [-0.08, -0.45, 0.3], [0.52, 0.72, 0.06], H_BLUE), P("box", [-0.08, -0.42, 0.36], [0.2, 0.2, 0.04], "#efe6d2")],
      atk: { r: [-0.35, 0, 0], d: 0.05 },
      swing: 0.2
    },
    kids: [
      {
        at: [0.12, 0.6, -0.3],
        parts: [P("cyl", [0, 0.5, 0], [0.04, 1.3, 0.04], "#6b4423"), P("box", [0.17, 0.95, 0], [0.32, 0.22, 0.02], H_BLUE)],
        idle: { r: [0, 0.2, 0.05], f: 2.2 }
      }
    ],
    torsoAtk: { r: [0.25, -0.2, 0] }
  });
}

/** Rare: a hooded friar swinging a steel-bound censer of warm light, a little steel-cornered prayer book in his other hand */
function lanternFriar(): BossRig {
  const robe = "#6b4f3a";
  return person({
    aura: "#3b82f6",
    ember: "#fde68a",
    glide: true,
    leg: [P("box", [0, -0.82, 0.05], [0.24, 0.14, 0.4], "#3b2f26")],
    torso: [
      P("cone", [0, 0.1, 0], [0.98, 1.7, 0.9], robe),
      P("cyl", [0, 0.32, 0], [0.5, 0.07, 0.48], "#d6c7a8"),
      P("box", [0, 0.58, 0], [0.6, 0.6, 0.44], robe),
      P("sph", [0, 0.86, -0.02], [0.66, 0.3, 0.52], "#5a4130")
    ],
    head: {
      parts: [P("sph", [0, 0.18, 0.03], [0.38, 0.4, 0.38], "#e8c49c"), P("sph", [0, 0.24, -0.06], [0.48, 0.5, 0.46], "#5a4130"), P("cyl", [0, 0.52, 0.02], [0.3, 0.04, 0.3], H_STEEL)],
      eyes: sym(P("sph", [0.08, 0.2, 0.2], [0.06, 0.04, 0.04], "#2b1d14"))
    },
    armR: {
      parts: [...armOf(1, 1, robe, "#e8c49c", { cuff: "#5a4130" })],
      kids: [
        // The censer on its chain, swinging, its light breathing
        {
          at: hand(),
          parts: [P("cyl", [0, -0.25, 0.02], [0.03, 0.5, 0.03], H_STEEL), P("sph", [0, -0.56, 0.02], [0.24, 0.22, 0.24], "#8a8f98"), P("tor", [0, -0.56, 0.02], [0.3, 0.3, 0.5], H_STEEL, { r: [PI / 2, 0, 0], t: 0.06 }), G("sph", [0, -0.56, 0.02], [0.17, 0.17, 0.17], "#fbbf24")],
          idle: { r: [0.45, 0, 0.12], f: 2.0, s: 0.04 },
          atk: { r: [-1.2, 0, 0] }
        }
      ],
      atk: { r: [-0.8, 0, 0] },
      swing: 0.3
    },
    armL: {
      parts: [...armOf(1, 1, robe, "#e8c49c", { cuff: "#5a4130" }), P("box", [0.05, -0.62, 0.2], [0.22, 0.06, 0.3], "#7f1d1d", { r: [0.4, 0, 0] }), ...sym(P("box", [0.11, -0.62, 0.32], [0.05, 0.07, 0.05], H_STEEL, { r: [0.4, 0, 0] }))],
      r: [-0.5, 0, 0],
      swing: 0.1
    }
  });
}

/** Epic: a winged-helm paladin in white steel and gold, a two-handed runed greatsword, sun motes circling him */
function dawnbreakerPaladin(): BossRig {
  const h = 1.12;
  const w = 1.12;
  const plate = "#d4d8de";
  return person({
    aura: "#a855f7",
    ember: "#fde68a",
    auraSize: 1.8,
    h,
    w,
    leg: [...legOf(h, w, plate, "#9aa1ab"), P("box", [0, -0.44 * h, 0.2], [0.2, 0.14, 0.06], H_GOLD)],
    torso: [
      P("box", [0, 0.58 * h, 0], [0.74 * w, 0.8 * h, 0.5], plate),
      P("box", [0, 0.3 * h, 0.06], [0.5 * w, 0.95 * h, 0.5], H_BLUE),
      P("box", [0, 0.3 * h, 0], [0.84 * w, 0.1, 0.7], H_GOLD),
      G("oct", [0, 0.74 * h, 0.3], [0.22, 0.28, 0.1], "#fde68a"),
      ...sym(P("sph", [0.44 * w, 0.82 * h, 0], [0.42, 0.34, 0.44], plate), P("tor", [0.46 * w, 0.82 * h, 0], [0.44, 0.44, 0.5], H_GOLD, { r: [PI / 2, 0, 0.4], t: 0.08 }))
    ],
    head: {
      parts: [P("sph", [0, 0.22, 0], [0.46, 0.5, 0.48], plate), P("box", [0, 0.2, 0.22], [0.3, 0.06, 0.06], "#1f2937"), ...sym(P("blade", [0.3, 0.4, -0.05], [0.12, 0.5, 0.04], H_GOLD, { r: [0, 0, -0.7] })), G("oct", [0, 0.5, 0.18], [0.08, 0.12, 0.04], "#fde68a")],
      eyes: sym(G("sph", [0.08, 0.2, 0.24], [0.06, 0.04, 0.04], "#fde68a"))
    },
    armR: {
      parts: [...armOf(h, w, plate, "#9aa1ab"), P("box", [0.02, -0.66 * h, 0.1], [0.36, 0.06, 0.1], H_GOLD), P("cyl", [0.02, -0.72 * h, 0.1], [0.06, 0.3, 0.06], "#3a2d24"), P("box", [0.02, 0.05 * h, 0.1], [0.12, 1.3, 0.04], "#e5e7eb"), G("box", [0.02, 0.05 * h, 0.13], [0.04, 1.1, 0.02], "#fde68a")],
      // Both hands meet on the greatsword's grip before him, and move together
      r: [-0.55, 0, -0.42],
      atk: { r: [1.1, 0, 0] },
      idle: { r: [0.04, 0, 0], f: 1.05 },
      swing: 0
    },
    armL: { parts: armOf(h, w, plate, "#9aa1ab"), r: [-0.55, 0, 0.42], atk: { r: [1.1, 0, 0] }, idle: { r: [0.04, 0, 0], f: 1.05 }, swing: 0 },
    kids: [{ at: [0, 0.9 * h, -0.28], parts: fan([0, 0, 0], 0.18, [PI - 0.24, PI, PI + 0.24], 1.6 * h, 0.5, [H_BLUE, "#1e40af"]), idle: { r: [0.06, 0, 0.03], f: 0.9 } }],
    around: [orbit(1.3 * h, 0.8, ring(0, 1.15, 6, (i) => (i % 2 ? "#fde68a" : H_GOLD), [0.14, 0.22, 0.14]))],
    torsoAtk: { r: [0.3, -0.25, 0] }
  });
}

/** Legendary: Ser Aldric, the gilded knight of the Hero Monument come to life: gold plate, sword and sunburst shield, a blue cape */
function serAldric(): BossRig {
  const h = 1.25;
  const w = 1.2;
  const gold = "#e8b84a";
  const pale = "#fde68a";
  return person({
    aura: "#f59e0b",
    ember: "#fde68a",
    auraSize: 2.3,
    h,
    w,
    leg: [...legOf(h, w, gold, "#c9922e"), P("sph", [0, -0.45 * h, 0.12], [0.22, 0.2, 0.14], pale)],
    torso: [
      P("box", [0, 0.6 * h, 0], [0.8 * w, 0.84 * h, 0.54], gold),
      P("box", [0, 0.28 * h, 0.07], [0.5 * w, 0.9 * h, 0.52], H_BLUE),
      P("box", [0, 0.3 * h, 0], [0.9 * w, 0.1, 0.76], pale),
      G("oct", [0, 0.78 * h, 0.33], [0.26, 0.34, 0.12], "#fef3c7"),
      ...sym(P("sph", [0.47 * w, 0.86 * h, 0], [0.48, 0.38, 0.5], gold), P("spike", [0.52 * w, 1.0 * h, 0], [0.1, 0.3, 0.1], pale, { r: [0, 0, -0.5] }))
    ],
    head: {
      parts: [
        P("sph", [0, 0.24, 0], [0.5, 0.54, 0.52], gold),
        P("box", [0, 0.22, 0.25], [0.32, 0.07, 0.06], "#3a2208"),
        P("cyl", [0, 0.5, 0], [0.44, 0.12, 0.44], pale),
        ...Array.from({ length: 5 }, (_, i) => P("spike", [Math.sin((i - 2) * 0.5) * 0.2, 0.64, Math.cos((i - 2) * 0.5) * 0.2], [0.08, 0.2, 0.08], gold)),
        P("cone", [0, 0.7, -0.22], [0.16, 0.6, 0.16], "#dc2626", { r: [-1.0, 0, 0] })
      ],
      eyes: sym(G("sph", [0.09, 0.22, 0.26], [0.07, 0.04, 0.04], pale)),
      kids: [
        // Sun-rays behind the helm
        {
          at: [0, 0.35, -0.36],
          parts: [G("tor", [0, 0, 0], [1.0, 1.0, 0.5], "#fde047", { t: 0.03 }), ...Array.from({ length: 12 }, (_, i) => G("spike", [Math.sin((i / 12) * PI * 2) * 0.64, Math.cos((i / 12) * PI * 2) * 0.64, 0], [0.06, i % 2 ? 0.16 : 0.28, 0.06], pale, { r: [0, 0, -(i / 12) * PI * 2] }))],
          idle: { s: 0.06, f: 1.5 }
        }
      ]
    },
    armR: {
      parts: [...armOf(h, w, gold, gold), P("box", [0.02, -0.66 * h, 0.1], [0.42, 0.07, 0.12], pale), P("box", [0.02, 0.0, 0.1], [0.14, 1.4, 0.05], "#f5f5f4"), G("box", [0.02, 0.0, 0.14], [0.05, 1.2, 0.02], pale)],
      r: [-0.5, 0, 0.1],
      atk: { r: [1.3, 0, 0.2] },
      swing: 0.3
    },
    armL: {
      parts: [...armOf(h, w, gold, gold), P("cyl", [-0.12, -0.52 * h, 0.26], [0.9, 0.08, 0.9], H_BLUE, { r: [PI / 2, 0, 0] }), P("tor", [-0.12, -0.52 * h, 0.26], [0.96, 0.96, 0.5], gold, { t: 0.06 }), G("sph", [-0.12, -0.52 * h, 0.33], [0.26, 0.26, 0.1], "#fef3c7")],
      atk: { r: [-0.4, 0, 0], d: 0.05 },
      swing: 0.2
    },
    kids: [{ at: [0, 0.94 * h, -0.3], parts: fan([0, 0, 0], 0.2, [PI - 0.3, PI - 0.1, PI + 0.1, PI + 0.3], 1.9 * h, 0.5, [H_BLUE, "#1e40af"]), idle: { r: [0.07, 0, 0.03], f: 0.8 } }],
    around: [orbit(1.5 * h, 0.7, ring(0, 1.45, 8, (i) => (i % 2 ? pale : "#fef3c7"), [0.16, 0.26, 0.16])), orbit(0.6 * h, -0.5, ring(0, 1.25, 6, () => H_GOLD, [0.12, 0.18, 0.12]))],
    torsoAtk: { r: [0.3, -0.25, 0] }
  });
}

/* ================================ Sylvandale ================================ */

const E_SKIN = "#f3dccb";
const E_TEAL = "#1f9e8f";
const E_CYAN = "#67e8f9";
const E_SILVER = "#d1d9e0";

const elfHead = (hood: string | null, hair: string, o: { circlet?: string; glowEyes?: string } = {}) => ({
  parts: [
    P("sph", [0, 0.2, 0], [0.36, 0.44, 0.38], E_SKIN),
    ...sym(P("spike", [0.2, 0.24, -0.02], [0.06, 0.26, 0.06], E_SKIN, { r: [0, 0, -1.0] })),
    ...(hood ? [P("sph", [0, 0.26, -0.06], [0.46, 0.5, 0.44], hood), P("cone", [0, 0.5, -0.12], [0.26, 0.3, 0.26], hood, { r: [-0.5, 0, 0] })] : [P("sph", [0, 0.28, -0.06], [0.4, 0.42, 0.38], hair), P("box", [0, -0.05, -0.3], [0.3, 0.6, 0.06], hair)]),
    ...(o.circlet ? [P("tor", [0, 0.34, 0.01], [0.42, 0.42, 0.5], o.circlet, { r: [PI / 2 - 0.15, 0, 0], t: 0.06 })] : [])
  ],
  eyes: o.glowEyes ? sym(G("sph", [0.07, 0.21, 0.18], [0.06, 0.04, 0.04], o.glowEyes)) : sym(P("sph", [0.07, 0.21, 0.18], [0.06, 0.04, 0.04], "#14532d"))
});

/** Common: a slim novice of the grove in a plain green hood, leaning on a sapling staff */
function groveInitiate(): BossRig {
  const h = 1.06;
  const w = 0.85;
  const robe = "#3f6b45";
  return person({
    aura: "#94a3b8",
    ember: "#d9f99d",
    h,
    w,
    glide: true,
    leg: [P("box", [0, -0.88 * h, 0.05], [0.2, 0.1, 0.34], "#5a4a2e")],
    torso: [P("cone", [0, 0.1, 0], [0.86, 1.72, 0.8], robe), P("box", [0, 0.6 * h, 0], [0.52, 0.62, 0.38], robe), P("cyl", [0, 0.34 * h, 0], [0.46, 0.06, 0.44], "#6b5a3e")],
    head: elfHead("#2f5434", "#d9b36c"),
    armR: {
      parts: [...armOf(h, w, robe, E_SKIN), P("cyl", [0.02, -0.1, 0.08], [0.06, 2.3, 0.06], "#7a6346"), P("box", [0.1, 1.08, 0.08], [0.14, 0.04, 0.08], "#4d7c3a", { r: [0, 0, 0.5] }), P("box", [-0.07, 1.16, 0.08], [0.12, 0.04, 0.07], "#4d7c3a", { r: [0, 0, -0.5] })],
      atk: { r: [-0.9, 0, 0.1] },
      swing: 0.2
    },
    armL: { parts: armOf(h, w, robe, E_SKIN) }
  });
}

/** Uncommon: a warden in a teal cloak with a leaf-bladed glaive and a bark shield, a firefly lantern at the hip */
function leafwardWarden(): BossRig {
  const h = 1.06;
  const w = 0.9;
  const leather = "#5a4a2e";
  return person({
    aura: "#22c55e",
    ember: "#bbf7d0",
    h,
    w,
    leg: legOf(h, w, "#3f6212", leather),
    torso: [P("box", [0, 0.52 * h, 0], [0.6, 0.86, 0.42], "#365314"), P("box", [0, 0.3 * h, 0], [0.7, 0.08, 0.52], leather), P("box", [0.4, 0.16 * h, 0.2], [0.12, 0.16, 0.12], "#d9f99d")],
    head: elfHead(E_TEAL, "#e5e7eb"),
    armR: {
      parts: [...armOf(h, w, "#365314", E_SKIN), P("cyl", [0.02, -0.05, 0.08], [0.06, 2.1, 0.06], "#6b5a3e"), P("blade", [0.02, 1.2, 0.08], [0.16, 0.5, 0.04], "#a3a8b0")],
      atk: { r: [-1.1, 0, 0.1] },
      swing: 0.4
    },
    armL: {
      parts: [...armOf(h, w, "#365314", E_SKIN), P("cyl", [-0.1, -0.52 * h, 0.24], [0.62, 0.07, 0.62], "#6b4f2e", { r: [PI / 2, 0, 0] }), P("sph", [-0.1, -0.52 * h, 0.29], [0.16, 0.16, 0.08], "#4a3523")],
      swing: 0.2
    },
    kids: [{ at: [0, 0.86 * h, -0.24], parts: fan([0, 0, 0], 0.16, [PI - 0.22, PI, PI + 0.22], 1.4 * h, 0.42, [E_TEAL, "#17806f"]), idle: { r: [0.06, 0, 0.03], f: 0.9 } }]
  });
}

/** Rare: a moonwell oracle in white with a silver circlet, holding up a scrying bowl of moonlit water, moon-motes circling */
function moonwellOracle(): BossRig {
  const h = 1.08;
  const w = 0.85;
  const robe = "#e7efe9";
  return person({
    aura: "#3b82f6",
    ember: "#cffafe",
    h,
    w,
    glide: true,
    leg: [P("box", [0, -0.88 * h, 0.05], [0.2, 0.1, 0.34], "#c3cfc9")],
    torso: [P("cone", [0, 0.1, 0], [0.9, 1.76, 0.84], robe), P("box", [0, 0.6 * h, 0], [0.52, 0.62, 0.38], robe), P("tor", [0, 0.85 * h, 0], [0.56, 0.56, 0.5], E_SILVER, { r: [PI / 2, 0, 0], t: 0.07 })],
    head: elfHead(null, "#f8fafc", { circlet: E_SILVER }),
    armR: { parts: armOf(h, w, robe, E_SKIN), r: [-0.6, 0, -0.3], atk: { r: [-0.7, 0, 0] }, swing: 0 },
    armL: { parts: armOf(h, w, robe, E_SKIN), r: [-0.6, 0, 0.3], atk: { r: [-0.7, 0, 0] }, swing: 0 },
    around: [
      // The bowl held up before her, the water glowing
      {
        at: [0, 1.32 * h, 0.5],
        parts: [P("cyl", [0, 0, 0], [0.5, 0.14, 0.5], E_SILVER, { t: 0.6 }), G("cyl", [0, 0.09, 0], [0.4, 0.05, 0.4], E_CYAN)],
        idle: { p: [0, 0.04, 0], f: 1.5 },
        atk: { p: [0, 0.3, 0.15] }
      },
      orbit(1.4 * h, 0.9, ring(0, 0.85, 5, (i) => (i % 2 ? "#e0f2fe" : E_CYAN), [0.12, 0.12, 0.12], "sph"))
    ]
  });
}

/** Epic: a tall bladesinger of a thousand years, twin moon-blades edged in light, a ring of cyan leaves circling him */
function bladesinger(): BossRig {
  const h = 1.15;
  const w = 0.95;
  const garb = "#0f766e";
  return person({
    aura: "#a855f7",
    ember: "#a5f3fc",
    auraSize: 1.8,
    h,
    w,
    leg: legOf(h, w, "#14532d", "#3f3a2a"),
    torso: [P("box", [0, 0.54 * h, 0], [0.62, 0.88, 0.42], garb), P("box", [0, 0.3 * h, 0], [0.72, 0.08, 0.52], E_SILVER), G("box", [0.1, 0.62 * h, 0.23], [0.14, 0.36, 0.03], E_CYAN, { r: [0, 0, 0.3] }), ...sym(P("sph", [0.38 * w, 0.82 * h, 0], [0.3, 0.24, 0.32], E_SILVER))],
    head: elfHead(null, "#f8fafc", { circlet: E_SILVER, glowEyes: E_CYAN }),
    armR: { parts: [...armOf(h, w, garb, E_SKIN), P("box", [0.02, -0.68 * h, 0.1], [0.24, 0.05, 0.08], E_SILVER), G("blade", [0.02, -0.1, 0.12], [0.16, 1.1, 0.04], "#cffafe", { r: [0.25, 0, 0] })], r: [-0.3, 0, 0.2], atk: { r: [1.1, 0, 0.4] }, swing: 0.4 },
    armL: { parts: [...armOf(h, w, garb, E_SKIN), P("box", [-0.02, -0.68 * h, 0.1], [0.24, 0.05, 0.08], E_SILVER), G("blade", [-0.02, -0.1, 0.12], [0.16, 1.1, 0.04], "#cffafe", { r: [0.25, 0, 0] })], r: [-0.3, 0, -0.2], atk: { r: [1.1, 0, -0.4], d: 0.08 }, swing: 0.4 },
    kids: [{ at: [0, 0.9 * h, -0.24], parts: fan([0, 0, 0], 0.16, [PI - 0.22, PI, PI + 0.22], 1.5 * h, 0.4, [garb, "#115e59"]), idle: { r: [0.07, 0, 0.03], f: 0.9 } }],
    around: [orbit(1.3 * h, 1.0, ring(0, 1.1, 7, (i) => (i % 2 ? "#cffafe" : E_CYAN), [0.12, 0.3, 0.04], "blade"))],
    torsoAtk: { r: [0.2, -0.5, 0] }
  });
}

/** Legendary: the White Archer of the Hero Monument come to life: white stone and gilt, an antlered circlet, a great bow of light */
function whiteArcher(): BossRig {
  const h = 1.25;
  const w = 1.0;
  const white = "#eef2f7";
  const gold = "#e8b84a";
  return person({
    aura: "#f59e0b",
    ember: "#cffafe",
    auraSize: 2.3,
    h,
    w,
    leg: [...legOf(h, w, white, gold), P("sph", [0, -0.45 * h, 0.12], [0.18, 0.18, 0.12], gold)],
    torso: [
      P("box", [0, 0.56 * h, 0], [0.66, 0.9 * h, 0.46], gold),
      P("box", [0, 0.16 * h, 0.06], [0.5, 0.6, 0.5], white),
      P("box", [0, 0.3 * h, 0], [0.76, 0.1, 0.56], gold),
      G("oct", [0, 0.76 * h, 0.27], [0.2, 0.28, 0.1], E_CYAN),
      ...sym(P("sph", [0.4 * w, 0.88 * h, 0], [0.36, 0.28, 0.38], gold)),
      // Quiver on the back
      P("cyl", [0.16, 0.7 * h, -0.3], [0.2, 0.9, 0.2], gold, { r: [0, 0, -0.3] }),
      ...[0, 1, 2].map((i) => G("cone", [0.3 + i * 0.05, 1.18 * h, -0.3], [0.06, 0.24, 0.06], "#cffafe"))
    ],
    head: {
      ...elfHead(null, "#f8fafc", { circlet: gold, glowEyes: E_CYAN }),
      kids: [
        {
          at: [0, 0.42, 0],
          parts: [...sym(P("cyl", [0.16, 0.2, -0.04], [0.05, 0.45, 0.05], gold, { r: [0, 0, -0.5] }), P("cyl", [0.3, 0.42, -0.04], [0.04, 0.3, 0.04], gold, { r: [0, 0, -1.1] }), P("cyl", [0.22, 0.48, -0.04], [0.04, 0.22, 0.04], gold, { r: [0, 0, 0.2] })), G("oct", [0, 0.06, 0.18], [0.08, 0.12, 0.04], E_CYAN)],
          idle: { s: 0.02, f: 1.2 }
        },
        // A halo of golden leaves turning behind her head
        {
          at: [0, 0.3, -0.36],
          spin: 0.2,
          parts: [G("tor", [0, 0, 0], [1.0, 1.0, 0.5], "#cffafe", { t: 0.03 }), ...Array.from({ length: 12 }, (_, i) => P("blade", [Math.sin((i / 12) * PI * 2) * 0.62, Math.cos((i / 12) * PI * 2) * 0.62, 0], [0.12, i % 2 ? 0.18 : 0.3, 0.04], i % 2 ? "#fde68a" : gold, { r: [0, 0, -(i / 12) * PI * 2] }))]
        }
      ]
    },
    armR: { parts: armOf(h, w, white, E_SKIN, { cuff: gold }), r: [-0.3, 0, 0.1], atk: { r: [-0.9, 0, -0.6] }, swing: 0.3 },
    armL: {
      parts: [...armOf(h, w, white, E_SKIN), G("arc", [-0.02, hand(h, w)[1], 0.1], [1.9, 1.9, 0.5], "#cffafe", { r: [0, PI / 2, PI / 2], t: 0.03 }), P("box", [-0.02, hand(h, w)[1], 0.1], [0.1, 0.26, 0.1], gold)],
      r: [-0.2, 0, -0.1],
      atk: { r: [-1.3, 0, 0] },
      swing: 0.2
    },
    kids: [
      { at: [0, 0.94 * h, -0.28], parts: fan([0, 0, 0], 0.2, [PI - 0.3, PI - 0.1, PI + 0.1, PI + 0.3], 1.9 * h, 0.46, [E_TEAL, "#17806f"]), idle: { r: [0.07, 0, 0.03], f: 0.8 } },
      // Golden leaf-wings sweeping up and out behind her shoulders, breathing open and shut
      { at: [0.12, 0.86 * h, -0.34], parts: fan([0, 0, 0], -0.3, [-0.45, -0.8, -1.15, -1.45], 1.2, 0.3, [gold, "#c9922e"]), idle: { r: [0, -0.1, -0.06], f: 0.9 } },
      { at: [-0.12, 0.86 * h, -0.34], parts: fan([0, 0, 0], -0.3, [0.45, 0.8, 1.15, 1.45], 1.2, 0.3, [gold, "#c9922e"]), idle: { r: [0, 0.1, 0.06], f: 0.9 } }
    ],
    around: [orbit(1.5 * h, 0.7, ring(0, 1.45, 8, (i) => (i % 2 ? "#cffafe" : E_CYAN), [0.12, 0.3, 0.04], "blade")), orbit(0.7 * h, -0.5, ring(0, 1.25, 6, () => gold, [0.12, 0.18, 0.12]))]
  });
}

/* ================================ Ironforge ================================ */

const D_SKIN = "#d9a07a";
const D_ORANGE = "#f97316";
const D_STEEL = "#9ca3af";
const D_BRONZE = "#b45309";
const D_H = 0.8;
const D_W = 1.35;

const dwarfHead = (beardColor: string, cap: ReturnType<typeof P>[], o: { eyes?: string; glow?: boolean } = {}) => ({
  parts: [P("sph", [0, 0.2, 0.02], [0.44, 0.44, 0.44], D_SKIN), P("cone", [0, -0.12, 0.18], [0.4, 0.62, 0.24], beardColor, { r: [PI + 0.2, 0, 0] }), P("sph", [0, 0.12, 0.2], [0.24, 0.12, 0.12], beardColor), ...cap],
  eyes: o.glow ? sym(G("sph", [0.09, 0.24, 0.21], [0.06, 0.04, 0.04], o.eyes ?? "#fdba74")) : sym(P("sph", [0.09, 0.24, 0.21], [0.06, 0.04, 0.04], o.eyes ?? "#2b1d14"))
});

/** Common: a stocky tunnel delver in a leather apron and cap, braided beard, a miner's pick */
function tunnelDelver(): BossRig {
  const apron = "#6b4a2e";
  return person({
    aura: "#94a3b8",
    ember: "#e7e5e4",
    h: D_H,
    w: D_W,
    leg: legOf(D_H, D_W, "#4b5563", "#3f2a1a", { bootH: 0.2 }),
    torso: [P("box", [0, 0.55 * D_H, 0], [0.84, 0.74, 0.56], "#7c5a3a"), P("box", [0, 0.38 * D_H, 0.14], [0.64, 0.8, 0.44], apron), P("box", [0, 0.3 * D_H, 0], [0.94, 0.08, 0.66], "#3f2a1a")],
    head: dwarfHead("#a0522d", [P("sph", [0, 0.34, -0.02], [0.48, 0.3, 0.48], "#5b3b22")]),
    armR: {
      parts: [...armOf(D_H, D_W, "#7c5a3a", D_SKIN, { thick: 1.1 }), P("cyl", [0.02, -0.2, 0.1], [0.07, 1.3, 0.07], "#6b4423"), P("box", [0.02, 0.42, 0.1], [0.08, 0.1, 0.7], "#6b7280", { r: [0.1, 0, 0] })],
      atk: { r: [-1.8, 0, 0] },
      swing: 0.5
    },
    armL: { parts: armOf(D_H, D_W, "#7c5a3a", D_SKIN, { thick: 1.1 }) },
    torsoAtk: { r: [0.35, 0, 0] }
  });
}

/** Uncommon: a hearthguard behind a tower shield banded in clan orange, a short hammer, a war horn at his belt */
function hearthguard(): BossRig {
  const mail = "#6b7280";
  return person({
    aura: "#22c55e",
    ember: "#fed7aa",
    h: D_H,
    w: D_W,
    leg: legOf(D_H, D_W, "#52525b", "#3f2a1a", { bootH: 0.2 }),
    torso: [P("box", [0, 0.52 * D_H, 0], [0.86, 0.8, 0.58], mail), P("box", [0, 0.6 * D_H, 0.06], [0.2, 0.86, 0.6], D_ORANGE, { r: [0, 0, 0.6] }), P("box", [0, 0.3 * D_H, 0], [0.96, 0.08, 0.68], "#3f2a1a"), P("cone", [-0.42, 0.22 * D_H, 0.2], [0.12, 0.34, 0.12], "#e7e5e4", { r: [0, 0, 1.2] })],
    head: dwarfHead("#7c2d12", [P("sph", [0, 0.34, -0.02], [0.5, 0.34, 0.5], D_STEEL), P("box", [0, 0.26, 0.24], [0.06, 0.24, 0.04], D_STEEL)]),
    armR: {
      parts: [...armOf(D_H, D_W, mail, "#5b3b22", { thick: 1.1 }), P("cyl", [0.02, -0.4, 0.14], [0.06, 0.6, 0.06], "#5b3b22", { r: [0.8, 0, 0] }), P("box", [0.02, -0.2, 0.42], [0.2, 0.2, 0.28], "#6b7280", { r: [0.8, 0, 0] })],
      atk: { r: [1.0, 0, 0] }
    },
    armL: {
      parts: [...armOf(D_H, D_W, mail, "#5b3b22", { thick: 1.1 }), P("box", [-0.06, -0.4, 0.3], [0.7, 1.0, 0.08], "#57534e"), P("box", [-0.06, -0.4, 0.36], [0.72, 0.14, 0.06], D_ORANGE)],
      r: [-0.3, 0, 0],
      atk: { r: [-0.5, 0, 0], d: 0.05 },
      swing: 0
    },
    torsoAtk: { r: [0.25, -0.1, 0] }
  });
}

/** Rare: a runesmith whose steel-trimmed hammer's runes pulse, forge sparks looping off its anvil head */
function runesmith(): BossRig {
  const apron = "#5b3b22";
  return person({
    aura: "#3b82f6",
    ember: "#fdba74",
    h: D_H,
    w: D_W,
    leg: legOf(D_H, D_W, "#4b5563", "#3f2a1a", { bootH: 0.2 }),
    torso: [P("box", [0, 0.55 * D_H, 0], [0.86, 0.76, 0.58], "#1e3a8a"), P("box", [0, 0.38 * D_H, 0.16], [0.66, 0.82, 0.44], apron), P("box", [0, 0.3 * D_H, 0], [0.96, 0.08, 0.68], D_STEEL), ...sym(P("sph", [0.48, 0.8 * D_H, 0], [0.36, 0.26, 0.38], D_STEEL))],
    head: dwarfHead("#d97706", [P("sph", [0, 0.34, -0.02], [0.48, 0.3, 0.48], "#7c2d12"), P("tor", [0, 0.3, -0.02], [0.5, 0.5, 0.5], D_STEEL, { r: [PI / 2, 0, 0], t: 0.06 })]),
    armR: {
      parts: [...armOf(D_H, D_W, "#1e3a8a", D_SKIN, { thick: 1.1, cuff: D_STEEL }), P("cyl", [0.02, -0.2, 0.1], [0.07, 1.1, 0.07], "#5b3b22")],
      atk: { r: [-1.9, 0, 0] },
      kids: [
        {
          at: [0.02, 0.36, 0.1],
          parts: [P("box", [0, 0, 0], [0.5, 0.26, 0.26], "#57534e"), P("box", [0, 0, 0], [0.62, 0.08, 0.36], D_STEEL), G("box", [0, 0.05, 0.15], [0.3, 0.05, 0.02], D_ORANGE)],
          idle: { s: 0.03, f: 2.4 }
        },
        orbit(0.36, 2.2, ring(0, 0.4, 4, () => "#fdba74", [0.06, 0.06, 0.06]))
      ],
      swing: 0.5
    },
    armL: { parts: armOf(D_H, D_W, "#1e3a8a", D_SKIN, { thick: 1.1, cuff: D_STEEL }) },
    torsoAtk: { r: [0.35, 0, 0] }
  });
}

/** Epic: an ironbreaker in steam plate, massive, a furnace glowing in his chest, vents breathing, embers circling */
function ironbreaker(): BossRig {
  const h = 0.92;
  const w = 1.6;
  const plate = "#57534e";
  return person({
    aura: "#a855f7",
    ember: "#fdba74",
    auraSize: 1.9,
    h,
    w,
    leg: legOf(h, w, plate, "#44403c", { bootH: 0.22, thick: 1.15 }),
    torso: [
      P("box", [0, 0.55 * h, 0], [0.98, 0.86, 0.66], plate),
      P("box", [0, 0.3 * h, 0], [1.06, 0.1, 0.74], D_BRONZE),
      G("cyl", [0, 0.6 * h, 0.34], [0.36, 0.05, 0.36], D_ORANGE, { r: [PI / 2, 0, 0] }),
      P("tor", [0, 0.6 * h, 0.36], [0.44, 0.44, 0.5], D_BRONZE, { t: 0.08 }),
      ...sym(P("sph", [0.56, 0.86 * h, 0], [0.5, 0.4, 0.52], plate), P("cyl", [0.3, 1.1 * h, -0.28], [0.12, 0.36, 0.12], "#44403c"), G("cyl", [0.3, 1.3 * h, -0.28], [0.08, 0.06, 0.08], "#fdba74"))
    ],
    head: dwarfHead("#9ca3af", [P("sph", [0, 0.34, -0.02], [0.52, 0.4, 0.52], plate), P("box", [0, 0.22, 0.25], [0.3, 0.06, 0.04], "#1c1917")], { eyes: "#fdba74", glow: true }),
    armR: {
      parts: [...armOf(h, w, plate, "#44403c", { thick: 1.3 }), P("cyl", [0.02, -0.2, 0.1], [0.08, 1.3, 0.08], "#3f2a1a"), P("box", [0.02, 0.5, 0.1], [0.5, 0.36, 0.36], "#44403c"), G("box", [0.02, 0.5, 0.32], [0.3, 0.12, 0.02], D_ORANGE)],
      atk: { r: [-1.9, 0, 0] },
      swing: 0.4
    },
    armL: { parts: [...armOf(h, w, plate, "#44403c", { thick: 1.3 }), G("sph", [0.02, -0.55, 0.12], [0.12, 0.12, 0.12], D_ORANGE)] },
    around: [orbit(1.1 * h, 0.9, ring(0, 1.15, 6, (i) => (i % 2 ? "#fdba74" : D_ORANGE), [0.1, 0.16, 0.1]))],
    torsoAtk: { r: [0.35, 0, 0] }
  });
}

/** Legendary: the Bronze Hold-King of the Hero Monument come to life, his molten hammer raised high, crowned, ringed beard, rust cape */
function holdKing(): BossRig {
  const h = 0.98;
  const w = 1.55;
  const bronze = "#c2772a";
  const gold = "#e8b84a";
  return person({
    aura: "#f59e0b",
    ember: "#fdba74",
    auraSize: 2.3,
    h,
    w,
    leg: legOf(h, w, bronze, "#7c3f12", { bootH: 0.22, thick: 1.1 }),
    torso: [
      P("box", [0, 0.56 * h, 0], [0.96, 0.86, 0.66], bronze),
      P("box", [0, 0.3 * h, 0], [1.04, 0.1, 0.74], gold),
      G("oct", [0, 0.66 * h, 0.36], [0.24, 0.3, 0.1], "#fed7aa"),
      ...sym(P("sph", [0.56, 0.88 * h, 0], [0.5, 0.4, 0.52], bronze), P("spike", [0.62, 1.04 * h, 0], [0.12, 0.3, 0.12], gold, { r: [0, 0, -0.5] }))
    ],
    head: {
      ...dwarfHead("#e5e7eb", [P("cyl", [0, 0.42, 0], [0.5, 0.16, 0.5], gold), ...Array.from({ length: 5 }, (_, i) => P("spike", [Math.sin((i - 2) * 0.55) * 0.22, 0.58, Math.cos((i - 2) * 0.55) * 0.22], [0.09, 0.2, 0.09], gold))], { eyes: "#fed7aa", glow: true }),
      kids: [{ at: [0, -0.3, 0.26], parts: [P("tor", [0, 0, 0], [0.2, 0.2, 0.5], gold, { r: [PI / 2, 0, 0], t: 0.2 }), P("tor", [0, -0.2, -0.02], [0.16, 0.16, 0.5], gold, { r: [PI / 2, 0, 0], t: 0.2 })], idle: { r: [0.05, 0, 0.04], f: 1.0 } }]
    },
    // The hammer raised high, as the statue holds it
    armR: {
      parts: [...armOf(h, w, bronze, bronze, { thick: 1.25 }), P("cyl", [0.02, -0.2, 0.1], [0.08, 1.4, 0.08], "#78350f")],
      r: [PI - 0.35, 0, -0.15],
      atk: { r: [-2.2, 0, 0] },
      swing: 0,
      kids: [
        {
          at: [0.02, 0.5, 0.1],
          parts: [P("box", [0, 0, 0], [0.7, 0.4, 0.4], bronze), G("box", [0, 0, 0], [0.74, 0.18, 0.44], "#fb923c"), G("box", [0.38, 0, 0], [0.04, 0.3, 0.3], "#fed7aa")],
          idle: { s: 0.04, f: 2.0 }
        },
        orbit(0.5, 2.0, ring(0, 0.55, 6, (i) => (i % 2 ? "#fed7aa" : D_ORANGE), [0.08, 0.08, 0.08]))
      ]
    },
    armL: { parts: armOf(h, w, bronze, bronze, { thick: 1.25 }), r: [-0.4, 0, -0.2] },
    kids: [{ at: [0, 0.92 * h, -0.36], parts: fan([0, 0, 0], 0.16, [PI - 0.3, PI - 0.1, PI + 0.1, PI + 0.3], 1.4, 0.56, ["#a3472a", "#7c2d12"]), idle: { r: [0.07, 0, 0.03], f: 0.8 } }],
    around: [orbit(1.3 * h, 0.7, ring(0, 1.45, 8, (i) => (i % 2 ? "#fed7aa" : gold), [0.14, 0.22, 0.14])), orbit(0.5, -0.6, ring(0, 1.25, 6, () => D_ORANGE, [0.1, 0.14, 0.1]))],
    torsoAtk: { r: [0.35, 0, 0] }
  });
}

/* ================================ Drak'mar ================================ */

const O_SKIN = "#6b8e23";
const O_SKIN2 = "#556b2f";
const O_RED = "#b91c1c";
const O_BONE = "#f3ead7";
const O_H = 1.1;
const O_W = 1.3;

const orcHead = (o: { helm?: ReturnType<typeof P>[]; eyes?: string; glow?: boolean; paint?: string } = {}) => ({
  parts: [
    P("sph", [0, 0.16, 0.04], [0.46, 0.44, 0.48], O_SKIN),
    P("box", [0, 0.04, 0.2], [0.34, 0.16, 0.2], O_SKIN2),
    ...sym(P("spike", [0.1, 0.16, 0.3], [0.05, 0.16, 0.05], O_BONE), P("spike", [0.26, 0.24, -0.02], [0.08, 0.24, 0.08], O_SKIN, { r: [0, 0, -1.2] })),
    ...(o.paint ? [P("box", [0, 0.26, 0.26], [0.36, 0.05, 0.04], o.paint)] : []),
    ...(o.helm ?? [])
  ],
  eyes: o.glow ? sym(G("sph", [0.1, 0.24, 0.24], [0.07, 0.04, 0.04], o.eyes ?? "#ef4444")) : sym(P("sph", [0.1, 0.24, 0.24], [0.07, 0.04, 0.04], o.eyes ?? "#1c1917"))
});

/** Common: a hunched grunt in hides with a crude wooden club */
function gruntRaider(): BossRig {
  return person({
    aura: "#94a3b8",
    ember: "#e7e5e4",
    h: O_H,
    w: O_W,
    leg: legOf(O_H, O_W, O_SKIN2, "#5a3520", { bootH: 0.12 }),
    torso: [P("box", [0, 0.5 * O_H, 0.04], [0.8, 0.82, 0.54], O_SKIN), P("box", [0, 0.16 * O_H, 0], [0.74, 0.3, 0.56], "#8a6a3d"), P("box", [0, 0.92 * O_H, -0.08], [0.9, 0.24, 0.5], "#7c5a3a")],
    torsoIdle: { r: [0.04, 0.06, 0.02], f: 1.2 },
    head: orcHead(),
    armR: { parts: [...armOf(O_H, O_W, O_SKIN, O_SKIN2, { thick: 1.2 }), P("cone", [0.02, 0.0, 0.12], [0.24, 1.0, 0.24], "#5c4030", { r: [PI + 0.3, 0, 0] })], atk: { r: [1.2, 0, 0.1] }, swing: 0.6 },
    armL: { parts: armOf(O_H, O_W, O_SKIN, O_SKIN2, { thick: 1.2 }) },
    torsoAtk: { r: [0.3, -0.2, 0] }
  });
}

/** Uncommon: a brute behind a shield of lashed bone, red war paint on his face and chest, a skull totem on his back */
function bonewallBrute(): BossRig {
  return person({
    aura: "#22c55e",
    ember: "#fecaca",
    h: O_H,
    w: O_W,
    leg: legOf(O_H, O_W, "#5a3520", "#3f2a1a", { bootH: 0.14 }),
    torso: [P("box", [0, 0.5 * O_H, 0.04], [0.82, 0.84, 0.56], O_SKIN), P("box", [0, 0.6 * O_H, 0.36], [0.12, 0.5, 0.04], O_RED), P("box", [0, 0.16 * O_H, 0], [0.76, 0.3, 0.58], "#7c4a2d"), P("box", [0, 0.94 * O_H, -0.08], [0.92, 0.24, 0.52], "#5a3520")],
    head: orcHead({ paint: O_RED }),
    armR: { parts: [...armOf(O_H, O_W, O_SKIN, O_SKIN2, { thick: 1.2 }), P("cyl", [0.02, -0.1, 0.12], [0.08, 1.1, 0.08], "#5c4030"), P("sph", [0.02, 0.46, 0.12], [0.24, 0.24, 0.24], O_BONE)], atk: { r: [1.1, 0, 0.1] } },
    armL: {
      parts: [...armOf(O_H, O_W, O_SKIN, O_SKIN2, { thick: 1.2 }), P("cyl", [-0.12, -0.6, 0.26], [0.86, 0.08, 0.86], "#a1784a", { r: [PI / 2, 0, 0] }), ...[-0.24, 0, 0.24].map((x) => P("box", [-0.12 + x, -0.6, 0.32], [0.08, 0.76, 0.06], O_BONE))],
      atk: { r: [-0.6, 0, 0], d: 0.05 },
      swing: 0.2
    },
    kids: [{ at: [0.2, 0.7 * O_H, -0.3], parts: [P("cyl", [0, 0.45, 0], [0.06, 1.2, 0.06], "#4a2a16"), P("sph", [0, 1.1, 0], [0.26, 0.26, 0.24], O_BONE), P("box", [0, 0.86, 0], [0.4, 0.04, 0.04], "#4a2a16")], idle: { r: [0.05, 0, 0.05], f: 1.6 } }],
    torsoAtk: { r: [0.3, -0.2, 0] }
  });
}

/** Rare: a blood shaman in a bone mask and iron rings, a spirit drum on his totem staff, blood-red wisps circling */
function bloodShaman(): BossRig {
  const robe = "#57534e";
  return person({
    aura: "#3b82f6",
    ember: "#fca5a5",
    h: O_H,
    w: O_W * 0.95,
    leg: legOf(O_H, O_W * 0.95, "#44403c", "#3f2a1a", { bootH: 0.12 }),
    torso: [P("box", [0, 0.5 * O_H, 0.02], [0.78, 0.84, 0.54], robe), P("cone", [0, 0.12 * O_H, 0], [0.92, 0.6, 0.72], "#7f1d1d"), ...[0.2, 0.4, 0.6].map((y) => P("tor", [0.36, y * O_H + 0.3, 0.1], [0.14, 0.14, 0.5], "#a3a8b0", { t: 0.25 }))],
    head: orcHead({ helm: [P("box", [0, 0.2, 0.34], [0.4, 0.42, 0.06], O_BONE), P("cone", [0, 0.5, 0], [0.5, 0.3, 0.5], "#44403c")] }),
    armR: {
      parts: [...armOf(O_H, O_W, robe, O_SKIN2, { cuff: "#a3a8b0" }), P("cyl", [0.02, 0.0, 0.1], [0.06, 2.3, 0.06], "#4a2a16"), P("cyl", [0.02, 0.95, 0.1], [0.42, 0.22, 0.42], "#a1784a"), P("tor", [0.02, 0.95, 0.1], [0.46, 0.46, 0.5], "#a3a8b0", { r: [PI / 2, 0, 0], t: 0.05 }), P("sph", [0.02, 1.2, 0.1], [0.2, 0.2, 0.2], O_BONE)],
      atk: { r: [-1.0, 0, 0] },
      swing: 0.3
    },
    armL: { parts: [...armOf(O_H, O_W, robe, O_SKIN2, { cuff: "#a3a8b0" }), G("sph", [0.02, -0.6, 0.12], [0.12, 0.12, 0.12], "#ef4444")], r: [-0.5, 0, -0.1], atk: { r: [-0.9, 0, 0] } },
    around: [orbit(1.4 * O_H, 1.1, ring(0, 0.9, 5, (i) => (i % 2 ? "#fca5a5" : "#ef4444"), [0.1, 0.18, 0.1]))],
    torsoAtk: { r: [0.25, 0, 0] }
  });
}

/** Epic: a huge ravager with twin cleavers, his eyes burning, a rage aura round him and embers circling */
function ravager(): BossRig {
  const h = 1.2;
  const w = 1.5;
  return person({
    aura: "#a855f7",
    ember: "#fca5a5",
    auraSize: 1.9,
    h,
    w,
    leg: legOf(h, w, "#3f2a1a", "#292524", { bootH: 0.14, thick: 1.15 }),
    torso: [
      P("box", [0, 0.5 * h, 0.04], [0.92, 0.9, 0.6], O_SKIN),
      ...[0.35, 0.55, 0.75].map((y, i) => G("box", [(i - 1) * 0.12, y * h, 0.35], [0.06, 0.24, 0.03], "#ef4444", { r: [0, 0, 0.4] })),
      P("box", [0, 0.16 * h, 0], [0.86, 0.3, 0.62], "#57534e"),
      ...sym(P("sph", [0.5, 0.92 * h, 0], [0.46, 0.36, 0.48], "#44403c"), P("spike", [0.56, 1.12 * h, 0], [0.12, 0.4, 0.12], O_BONE, { r: [0, 0, -0.5] }))
    ],
    head: orcHead({ glow: true, helm: [...sym(P("cone", [0.2, 0.46, -0.02], [0.12, 0.42, 0.12], O_BONE, { r: [0.3, 0, -0.6] }))] }),
    armR: { parts: [...armOf(h, w, O_SKIN, O_SKIN2, { thick: 1.3 }), P("cyl", [0.02, -0.66 * h, 0.1], [0.07, 0.36, 0.07], "#3f2a1a"), P("box", [0.12, -0.3, 0.12], [0.36, 0.7, 0.05], "#78716c"), G("box", [0.29, -0.3, 0.12], [0.03, 0.66, 0.06], "#ef4444")], r: [-0.2, 0, 0.2], atk: { r: [1.2, 0, 0.3] }, swing: 0.5 },
    armL: { parts: [...armOf(h, w, O_SKIN, O_SKIN2, { thick: 1.3 }), P("cyl", [-0.02, -0.66 * h, 0.1], [0.07, 0.36, 0.07], "#3f2a1a"), P("box", [-0.12, -0.3, 0.12], [0.36, 0.7, 0.05], "#78716c"), G("box", [-0.29, -0.3, 0.12], [0.03, 0.66, 0.06], "#ef4444")], r: [-0.2, 0, -0.2], atk: { r: [1.2, 0, -0.3], d: 0.08 }, swing: 0.5 },
    around: [orbit(1.2 * h, 1.0, ring(0, 1.2, 7, (i) => (i % 2 ? "#fca5a5" : "#ef4444"), [0.1, 0.16, 0.1]))],
    torsoAtk: { r: [0.3, -0.4, 0] }
  });
}

/** Legendary: the Warlord of Drak'mar from the Hero Monument come to life: dark stone and gold, bone horns, the great axe, a blood-red cape */
function warlord(): BossRig {
  const h = 1.3;
  const w = 1.45;
  const stone = "#44403c";
  const gold = "#d4a017";
  return person({
    aura: "#f59e0b",
    ember: "#fca5a5",
    auraSize: 2.3,
    h,
    w,
    leg: [...legOf(h, w, stone, "#292524", { bootH: 0.14, thick: 1.15 }), P("sph", [0, -0.45 * h, 0.13], [0.22, 0.2, 0.14], gold)],
    torso: [
      P("box", [0, 0.52 * h, 0.03], [0.96, 0.9, 0.62], stone),
      P("box", [0, 0.3 * h, 0], [1.04, 0.1, 0.8], gold),
      G("oct", [0, 0.7 * h, 0.36], [0.26, 0.32, 0.1], "#ef4444"),
      ...sym(P("sph", [0.52, 0.94 * h, 0], [0.56, 0.44, 0.56], gold), P("spike", [0.6, 1.16 * h, 0], [0.14, 0.5, 0.14], O_BONE, { r: [0, 0, -0.5] }), P("tor", [0.52, 0.94 * h, 0], [0.56, 0.56, 0.5], stone, { r: [PI / 2, 0, 0.4], t: 0.08 })),
      ...sym(P("box", [0.2, 0.62 * h, 0.33], [0.24, 0.05, 0.04], gold, { r: [0, 0, 0.25] }), P("box", [0.2, 0.74 * h, 0.33], [0.24, 0.05, 0.04], gold, { r: [0, 0, 0.25] }))
    ],
    head: orcHead({ glow: true, helm: [P("sph", [0, 0.32, 0], [0.52, 0.34, 0.52], gold), P("cyl", [0, 0.24, 0], [0.56, 0.08, 0.56], "#a87a10"), ...sym(P("cone", [0.28, 0.56, -0.02], [0.14, 0.6, 0.14], O_BONE, { r: [0.2, 0, -0.75] })), P("spike", [0, 0.6, 0.04], [0.08, 0.26, 0.08], "#fde68a")] }),
    armR: {
      parts: [...armOf(h, w, stone, O_SKIN2, { thick: 1.3, cuff: gold }), P("cyl", [0.02, 0.0, 0.1], [0.08, 2.4, 0.08], "#3f2a1a"), P("blade", [0.4, 1.0, 0.1], [0.4, 0.8, 0.06], "#a8a29e", { r: [0, 0, -PI / 2] }), G("blade", [0.48, 1.0, 0.1], [0.06, 0.8, 0.08], "#ef4444", { r: [0, 0, -PI / 2] }), P("tor", [0.02, 1.0, 0.1], [0.22, 0.22, 0.5], gold, { r: [PI / 2, 0, 0], t: 0.2 })],
      r: [-0.2, 0, 0.15],
      atk: { r: [-1.9, 0, 0] },
      swing: 0.3
    },
    armL: { parts: armOf(h, w, stone, O_SKIN2, { thick: 1.3, cuff: gold }), r: [-0.3, 0, -0.2], atk: { r: [-1.7, 0, 0] } },
    kids: [
      { at: [0, 0.94 * h, -0.34], parts: fan([0, 0, 0], 0.2, [PI - 0.3, PI - 0.1, PI + 0.1, PI + 0.3], 1.9 * h, 0.56, ["#991b1b", "#7f1d1d"]), idle: { r: [0.07, 0, 0.03], f: 0.8 } },
      // The war banner of Drak'mar on a pole at his back: a bone crossbar, the blood-red banner with a gold skull, a horned skull on top
      {
        at: [0, 0.5 * h, -0.46],
        parts: [
          P("cyl", [0, 1.0, 0], [0.07, 2.4, 0.07], "#3f2a1a"),
          P("cyl", [0, 1.9, 0], [0.9, 0.06, 0.06], O_BONE, { r: [0, 0, PI / 2] }),
          P("box", [0, 1.36, -0.03], [0.82, 1.0, 0.03], "#991b1b"),
          P("sph", [0, 1.45, -0.08], [0.26, 0.24, 0.06], gold),
          ...sym(G("sph", [0.05, 1.47, -0.12], [0.06, 0.06, 0.04], "#ef4444")),
          P("sph", [0, 2.3, 0], [0.24, 0.22, 0.24], O_BONE),
          ...sym(P("cone", [0.16, 2.44, 0], [0.07, 0.3, 0.07], gold, { r: [0, 0, -0.7] }))
        ],
        idle: { r: [0.04, 0.06, 0.04], f: 1.3 }
      }
    ],
    around: [orbit(1.5 * h, 0.7, ring(0, 1.5, 8, (i) => (i % 2 ? "#fca5a5" : gold), [0.14, 0.22, 0.14])), orbit(0.6 * h, -0.5, ring(0, 1.3, 6, () => "#ef4444", [0.12, 0.18, 0.12]))],
    torsoAtk: { r: [0.4, 0, 0] }
  });
}

export const CIV_MERCENARY_RIGS: Record<string, BossRig> = {
  "merc-human-levy": villageLevy(),
  "merc-human-shieldbearer": dawnShieldbearer(),
  "merc-human-friar": lanternFriar(),
  "merc-human-paladin": dawnbreakerPaladin(),
  "merc-human-champion": serAldric(),
  "merc-elf-initiate": groveInitiate(),
  "merc-elf-warden": leafwardWarden(),
  "merc-elf-oracle": moonwellOracle(),
  "merc-elf-bladesinger": bladesinger(),
  "merc-elf-archer": whiteArcher(),
  "merc-dwarf-delver": tunnelDelver(),
  "merc-dwarf-hearthguard": hearthguard(),
  "merc-dwarf-runesmith": runesmith(),
  "merc-dwarf-ironbreaker": ironbreaker(),
  "merc-dwarf-holdking": holdKing(),
  "merc-orc-raider": gruntRaider(),
  "merc-orc-brute": bonewallBrute(),
  "merc-orc-shaman": bloodShaman(),
  "merc-orc-berserker": ravager(),
  "merc-orc-warlord": warlord()
};

/** Each of the four civilizations' pools, common → legendary, slot for slot with Nethergarde's */
export const CIV_MERCENARY_POOLS: Partial<Record<CivilizationType, MercenaryDef[]>> = {
  human: [
    { type: "merc-human-levy", name: "Village Levy", title: "Sons of the Dawn Banner", rarity: "common", role: "Spearman", emblem: "🌾", description: "A farm lad called up with his village, in a padded jerkin and a straw hat, an ash spear in his fist. Humans win by being many, and the levy is the many." },
    { type: "merc-human-shieldbearer", name: "Dawn Banner Shieldbearer", title: "Wall of the Many Hands", rarity: "uncommon", role: "Defender", emblem: "🛡️", description: "A kettle-helmed soldier in mail and a blue tabard, with a kite shield painted with the dawn sun and an arming sword, the Dawn Banner's pennant on a pole at his back." },
    { type: "merc-human-friar", name: "Lantern Friar", title: "Keeper of the Long Night", rarity: "rare", role: "Healer", emblem: "🏮", description: "A hooded friar who walks with the hosts, swinging a steel-bound censer whose warm light never goes out, his little prayer book bound in steel at the corners." },
    { type: "merc-human-paladin", name: "Dawnbreaker Paladin", title: "Sword of the Morning", rarity: "epic", role: "Slayer", emblem: "☀️", description: "A paladin in white steel trimmed with gold under a winged helm, a greatsword held before him in both hands, its runes burning like sunrise, motes of sunlight circling him." },
    { type: "merc-human-champion", name: "Ser Aldric, Champion of the Dawn Banner", title: "The Gilded Knight", rarity: "legendary", role: "Champion", emblem: "👑", description: "The gilded knight who stands on every Valoria Hero Monument, come to life: crowned and plumed in gold plate, his sword in one hand and the sunburst shield in the other, a blue cape at his back and a ring of sun-rays behind his helm." }
  ],
  elf: [
    { type: "merc-elf-initiate", name: "Grove Initiate", title: "Novice of the Glades", rarity: "common", role: "Caster", emblem: "🌿", description: "A slim novice in a plain green hood, leaning on a staff cut from a sapling that still puts out leaves. Even the youngest elf has seen a century of wars." },
    { type: "merc-elf-warden", name: "Leafward Warden", title: "Shield of the Old Paths", rarity: "uncommon", role: "Defender", emblem: "🍃", description: "A warden of the glade roads in a teal cloak, with a leaf-bladed glaive and a shield of living bark, a firefly lantern at the hip." },
    { type: "merc-elf-oracle", name: "Moonwell Oracle", title: "Eyes of the Moonwell", rarity: "rare", role: "Seer", emblem: "🌙", description: "A silver-haired oracle in white with a silver circlet, holding up a scrying bowl of moonlit water as moon-motes drift round her." },
    { type: "merc-elf-bladesinger", name: "Thousand-Year Bladesinger", title: "The Dance That Never Ends", rarity: "epic", role: "Slayer", emblem: "🌀", description: "A tall bladesinger who has fought for a thousand years, with twin moon-blades edged in light, a leaf tattoo glowing on his chest and a ring of cyan leaves circling him." },
    { type: "merc-elf-archer", name: "The White Archer", title: "First Arrow of Sylvandale", rarity: "legendary", role: "Champion", emblem: "🏹", description: "The white-stone archer of every Sylvandale Hero Monument, come to life in gold: a gilt breastplate over white, wings of golden leaves spread behind her and a halo of golden leaves turning behind her antlered circlet, a great gilt bow strung with light, a quiver of shining arrows and a teal cape, leaves of light circling her." }
  ],
  dwarf: [
    { type: "merc-dwarf-delver", name: "Tunnel Delver", title: "Hand of the Deep Shafts", rarity: "common", role: "Miner", emblem: "⛏️", description: "A stocky miner in a leather apron and cap, his beard braided, a miner's pick in his fist. Every clan's war band is dug from its mines." },
    { type: "merc-dwarf-hearthguard", name: "Hearthguard", title: "Oath of the Gate", rarity: "uncommon", role: "Defender", emblem: "🛡️", description: "A hearthguard behind a tower shield banded in clan orange, with a short war hammer in hand and a war horn at the belt. A thousand years of orc raids taught them to hold a gate." },
    { type: "merc-dwarf-runesmith", name: "Runesmith", title: "Voice of the Anvil", rarity: "rare", role: "Runecaster", emblem: "⚒️", description: "A rune-priest of the forge whose steel-trimmed hammer carries runes that pulse like embers, forge sparks circling its anvil head." },
    { type: "merc-dwarf-ironbreaker", name: "Ironbreaker in Steam Plate", title: "The Walking Furnace", rarity: "epic", role: "Slayer", emblem: "🔥", description: "A massive ironbreaker sealed in steam plate, a furnace glowing in his chest and vents breathing on his back, a great maul in his gauntlet and embers circling him." },
    { type: "merc-dwarf-holdking", name: "The Bronze Hold-King", title: "Hammer of the Mountain", rarity: "legendary", role: "Champion", emblem: "🔨", description: "The bronze dwarf of every Ironforge Hero Monument, come to life: his hammer raised high with its head molten, a gold crown, a white beard in gold rings and a rust-red cape, sparks showering round him." }
  ],
  orc: [
    { type: "merc-orc-raider", name: "Grunt Raider", title: "Teeth of the Warband", rarity: "common", role: "Raider", emblem: "🪵", description: "A hunched orc in hides with a crude wooden club. There are always more of them." },
    { type: "merc-orc-brute", name: "Bonewall Brute", title: "The Wall of Bones", rarity: "uncommon", role: "Defender", emblem: "🦴", description: "A brute behind a shield of lashed bones, red war paint on his face and chest, a skull totem on a pole at his back." },
    { type: "merc-orc-shaman", name: "Blood Shaman", title: "Drummer of the Fury", rarity: "rare", role: "Shaman", emblem: "🩸", description: "A shaman in a bone mask and iron rings, beating a spirit drum lashed to his totem staff, blood-red wisps circling him." },
    { type: "merc-orc-berserker", name: "Ravager Berserker", title: "Rage Unchained", rarity: "epic", role: "Slayer", emblem: "💢", description: "A huge berserker with a cleaver in each fist, his eyes burning and his scars glowing red, embers circling him in a haze of rage." },
    { type: "merc-orc-warlord", name: "Warlord of Drak'mar", title: "The Horned Fury", rarity: "legendary", role: "Champion", emblem: "🪓", description: "The dark-stone warlord of every Drak'mar Hero Monument, come to life: bone horns and a gold helm crowned with spikes, dark stone armour under great gold pauldrons and gold ribs, the great axe with its blood-red edge, a blood-red cape and the war banner of Drak'mar raised on his back, embers storming round him." }
  ]
};
