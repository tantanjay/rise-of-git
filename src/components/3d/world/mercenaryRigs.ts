import type { CivilizationType, NPCRarity } from "@/types";
import { BossBone, BossPart, BossRig, G, P, fan, pair, sym } from "./bossRigs";
import { CIV_MERCENARY_POOLS, CIV_MERCENARY_RIGS } from "./mercenaryRigsCivs";
import { STRIDE } from "./mercRigKit";

/**
 * Mercenary models as rigs (drawn and animated by `BossModel`, checked by `npm run check:models`). Each civilization
 * gets its own mercenary pool, one mercenary per rarity from common to legendary (Nethergarde Voidrift's here, the other four
 * civilizations' in `mercenaryRigsCivs.ts`). Mercenaries are not in the game yet: the Codex previews them. Every mercenary stands on y = 0 facing +z, about 2.5–3 tall.
 */

export interface MercenaryDef {
  /** Rig key in MERCENARY_RIGS */
  type: string;
  name: string;
  title: string;
  rarity: NPCRarity;
  role: string;
  emblem: string;
  description: string;
}

const PI = Math.PI;
const SKIN = "#c4b5fd";
const GOLD = "#fbbf24";
const PALE_GOLD = "#fde68a";

/* ------------------------------ Nethergarde Voidrift ------------------------------ */

/** Common: a hooded novice of the rift leaning on a plain staff tipped with a violet orb */
function riftAcolyte(): BossRig {
  const robe = "#57534e";
  const hood = "#44403c";
  const sash = "#7c3aed";
  return {
    aura: "#94a3b8",
    ember: "#c4b5fd",
    auraSize: 1.5,
    root: {
      at: [0, 0, 0],
      walk: { p: [0, 0.04, 0], f: STRIDE * 2, ph: PI / 2 },
      parts: sym(P("box", [0.17, 0.08, 0.08], [0.2, 0.16, 0.34], "#292524")),
      kids: [
        {
          at: [0, 0, 0],
          parts: [
            P("cone", [0, 0.95, 0], [1.0, 1.7, 0.9], robe),
            P("cyl", [0, 1.25, 0], [0.42, 0.1, 0.4], sash),
            P("sph", [0, 1.62, 0], [0.56, 0.42, 0.46], robe)
          ],
          idle: { r: [0.02, 0.05, 0.02], f: 1.0 },
          kids: [
            {
              at: [0, 1.85, 0],
              parts: [
                P("sph", [0, 0.12, 0.02], [0.34, 0.36, 0.34], SKIN),
                P("sph", [0, 0.15, -0.08], [0.46, 0.48, 0.42], hood),
                P("cone", [0, 0.42, -0.14], [0.3, 0.32, 0.3], hood, { r: [-0.4, 0, 0] })
              ],
              idle: { r: [0.06, 0.25, 0.04], f: 0.6 },
              atk: { r: [-0.2, 0, 0] },
              kids: [{ at: [0, 0.14, 0.18], eye: true, parts: sym(G("sph", [0.07, 0, 0], [0.07, 0.05, 0.04], "#a78bfa")) }]
            },
            // Staff hand: raises the staff when it casts
            {
              at: [0.32, 1.6, 0],
              walk: { r: [-0.3, 0, 0], f: STRIDE },
              parts: [
                P("cyl", [0.06, -0.28, 0.08], [0.17, 0.58, 0.17], robe, { r: [-0.3, 0, 0.1] }),
                P("sph", [0.12, -0.52, 0.22], [0.14, 0.14, 0.14], SKIN),
                P("cyl", [0.12, -0.55, 0.22], [0.07, 2.1, 0.07], "#78716c", { r: [0.001, 0, 0] }),
                G("sph", [0.12, 0.6, 0.22], [0.2, 0.2, 0.2], "#8b5cf6")
              ],
              idle: { r: [0.04, 0, 0.03], f: 1.0 },
              atk: { r: [-0.55, 0, 0.1], p: [0, 0.15, 0] }
            },
            {
              at: [-0.32, 1.6, 0],
              walk: { r: [-0.3, 0, 0], f: STRIDE, ph: PI },
              parts: [P("cyl", [-0.05, -0.3, 0.02], [0.17, 0.6, 0.17], robe, { r: [0, 0, -0.12] }), P("sph", [-0.1, -0.62, 0.05], [0.14, 0.14, 0.14], SKIN)],
              idle: { r: [0.05, 0, 0.04], f: 1.0, ph: 1.5 }
            }
          ]
        }
      ]
    }
  };
}

/** Uncommon: a void-plated sentinel with a rift-forged blade and a runed shield */
function riftguard(): BossRig {
  const plate = "#334155";
  const dark = "#1e1b2e";
  const trim = "#4c1d95";
  const glow = "#67e8f9";
  return {
    aura: "#22c55e",
    ember: "#a5f3fc",
    auraSize: 1.6,
    root: {
      at: [0, 0, 0],
      walk: { p: [0, 0.04, 0], f: STRIDE * 2, ph: PI / 2 },
      parts: [],
      kids: [
        ...pair({
          at: [0.16, 0.86, 0],
          walk: { r: [0.42, 0, 0], f: STRIDE },
          parts: [P("box", [0, -0.36, 0], [0.24, 0.72, 0.26], plate), P("box", [0, -0.78, 0.05], [0.36, 0.16, 0.48], dark)]
        }),
        {
          at: [0, 0.9, 0],
          parts: [
            P("box", [0, 0.12, 0], [0.6, 0.3, 0.42], trim),
            P("box", [0, 0.62, 0], [0.7, 0.72, 0.52], plate),
            P("box", [0, 0.36, 0], [0.8, 0.1, 0.62], "#7c3aed"),
            G("oct", [0, 0.7, 0.3], [0.2, 0.26, 0.1], glow),
            ...sym(P("sph", [0.42, 0.95, 0], [0.36, 0.3, 0.4], trim), P("spike", [0.47, 1.12, 0], [0.08, 0.25, 0.08], "#a78bfa", { r: [0, 0, -0.4] }))
          ],
          idle: { r: [0.02, 0.05, 0], f: 1.1 },
          kids: [
            {
              at: [0, 1.05, 0],
              parts: [
                P("sph", [0, 0.22, 0], [0.42, 0.46, 0.44], plate),
                P("box", [0, 0.5, -0.04], [0.06, 0.14, 0.36], "#7c3aed"),
                P("cone", [0, 0.52, -0.3], [0.12, 0.42, 0.12], "#c026d3", { r: [-1.2, 0, 0] })
              ],
              idle: { r: [0.04, 0.2, 0.02], f: 0.55 },
              kids: [{ at: [0, 0.22, 0.2], eye: true, parts: [G("box", [0, 0, 0], [0.26, 0.05, 0.06], glow)] }]
            },
            // Sword arm: the blade rests tilted forward and slashes down
            {
              at: [0.44, 0.82, 0],
              walk: { r: [-0.3, 0, 0], f: STRIDE },
              r: [0.35, 0, 0],
              parts: [
                P("cyl", [0.04, -0.25, 0], [0.18, 0.5, 0.18], plate),
                P("box", [0.06, -0.55, 0.06], [0.2, 0.2, 0.2], trim),
                P("cyl", [0.06, -0.5, 0.16], [0.06, 0.3, 0.06], dark),
                P("box", [0.06, -0.33, 0.16], [0.34, 0.06, 0.1], "#a78bfa"),
                G("box", [0.06, 0.2, 0.16], [0.12, 1.0, 0.04], glow),
                G("spike", [0.06, 0.78, 0.16], [0.12, 0.18, 0.04], glow)
              ],
              idle: { r: [0.04, 0, 0.02], f: 1.1 },
              atk: { r: [1.0, 0, 0.15] }
            },
            // Shield arm: raises the shield as the blade falls
            {
              at: [-0.44, 0.82, 0],
              walk: { r: [-0.3, 0, 0], f: STRIDE, ph: PI },
              parts: [
                P("cyl", [-0.04, -0.25, 0], [0.18, 0.5, 0.18], plate),
                P("box", [-0.06, -0.55, 0.06], [0.2, 0.2, 0.2], trim),
                P("cyl", [-0.14, -0.45, 0.24], [0.75, 0.08, 0.75], "#312e81", { r: [PI / 2, 0, 0] }),
                P("tor", [-0.14, -0.45, 0.24], [0.8, 0.8, 0.5], "#a78bfa", { t: 0.06 }),
                G("oct", [-0.14, -0.45, 0.31], [0.2, 0.28, 0.08], "#c084fc")
              ],
              idle: { r: [0.04, 0, 0.03], f: 1.1, ph: 1 },
              atk: { r: [-0.35, 0, 0], d: 0.05 }
            }
          ]
        }
      ]
    }
  };
}

/** Rare: a blindfolded seer drifting above the ground, a glowing tome before her and star-orbs circling */
function astralSeer(): BossRig {
  const robe = "#1e1b4b";
  const mantle = "#312e81";
  const star = "#38bdf8";
  return {
    aura: "#3b82f6",
    ember: "#bfdbfe",
    auraSize: 1.6,
    float: 0.35,
    root: {
      at: [0, 0, 0],
      walk: { p: [0, 0.04, 0], f: STRIDE * 2, ph: PI / 2 },
      parts: [],
      kids: [
        {
          at: [0, 0, 0],
          parts: [
            P("cyl", [0, 0.75, 0], [0.9, 1.5, 0.9], robe, { t: 0.45 }),
            G("cyl", [0, 0.11, 0], [1.0, 0.12, 1.0], star),
            ...Array.from({ length: 5 }, (_, i) => {
              const a = (i / 5) * PI * 2 + 0.3;
              return P("spike", [Math.sin(a) * 0.3, -0.15, Math.cos(a) * 0.3], [0.2, 0.4, 0.2], robe, { r: [PI, 0, 0] });
            }),
            P("sph", [0, 1.55, 0], [0.62, 0.42, 0.5], mantle),
            P("tor", [0, 1.64, 0], [0.62, 0.62, 0.5], GOLD, { r: [PI / 2, 0, 0], t: 0.08 })
          ],
          idle: { r: [0.03, 0.06, 0.03], f: 0.8 },
          kids: [
            {
              at: [0, 1.78, 0],
              parts: [
                P("sph", [0, 0.12, 0.05], [0.3, 0.32, 0.28], SKIN),
                P("cone", [0, 0.2, -0.05], [0.55, 0.75, 0.5], mantle),
                G("box", [0, 0.15, 0.18], [0.3, 0.06, 0.06], star),
                G("oct", [0, 0.31, 0.15], [0.08, 0.1, 0.04], PALE_GOLD)
              ],
              idle: { r: [0.06, 0.2, 0.05], f: 0.5 },
              atk: { r: [-0.3, 0, 0] }
            },
            ...pair({
              at: [0.3, 1.5, 0],
              walk: { r: [-0.2, 0, 0], f: STRIDE },
              parts: [P("cyl", [0.1, -0.25, 0.12], [0.2, 0.55, 0.2], mantle, { r: [-0.5, 0, 0.3], t: 0.6 }), P("sph", [0.2, -0.48, 0.3], [0.12, 0.12, 0.12], SKIN)],
              idle: { r: [0.1, 0, 0.05], f: 0.9 },
              atk: { r: [-0.9, 0, -0.3] }
            }),
            // The tome, bobbing before her
            {
              at: [0, 1.12, 0.55],
              r: [0.4, 0, 0],
              parts: [
                P("box", [0, 0, 0], [0.5, 0.08, 0.36], "#4c1d95"),
                P("box", [0, 0.08, 0], [0.4, 0.04, 0.26], "#fef3c7"),
                G("oct", [0, 0.16, 0], [0.12, 0.1, 0.12], star)
              ],
              idle: { p: [0, 0.06, 0], f: 1.6 },
              atk: { p: [0, 0.2, 0.1] }
            },
            {
              at: [0, 1.3, 0],
              spin: 0.9,
              parts: Array.from({ length: 6 }, (_, i) => {
                const a = (i / 6) * PI * 2;
                return i % 2 ? G("oct", [Math.sin(a) * 0.85, 0.15, Math.cos(a) * 0.85], [0.12, 0.16, 0.12], "#e0e7ff") : G("sph", [Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85], [0.18, 0.18, 0.18], "#93c5fd");
              }),
              idle: { p: [0, 0.12, 0], f: 1.2 }
            }
          ]
        }
      ]
    }
  };
}

/** Epic: a horned reaver of the eclipse in obsidian plate and a long cloak, a void scythe and a fistful of violet flame */
function eclipseReaver(): BossRig {
  const obsidian = "#18122b";
  const cloak = "#3b0764";
  const flame = "#d946ef";
  const bone = "#e9d5ff";
  return {
    aura: "#a855f7",
    ember: "#f0abfc",
    auraSize: 1.8,
    root: {
      at: [0, 0, 0],
      walk: { p: [0, 0.04, 0], f: STRIDE * 2, ph: PI / 2 },
      parts: [],
      kids: [
        ...pair({
          at: [0.17, 0.9, 0],
          walk: { r: [0.42, 0, 0], f: STRIDE },
          parts: [
            P("box", [0, -0.38, 0], [0.24, 0.76, 0.28], obsidian),
            P("box", [0, -0.82, 0.06], [0.34, 0.16, 0.5], "#2e1065"),
            P("spike", [0, -0.3, 0.2], [0.1, 0.25, 0.1], bone, { r: [0.8, 0, 0] })
          ]
        }),
        {
          at: [0, 0.92, 0],
          parts: [
            P("box", [0, 0.55, 0], [0.66, 0.7, 0.44], obsidian),
            P("box", [0, 0.1, 0], [0.5, 0.3, 0.34], "#2e1065"),
            G("oct", [0, 0.62, 0.27], [0.22, 0.3, 0.12], flame),
            ...sym(
              P("box", [0.18, 0.3, 0.25], [0.12, 0.06, 0.04], bone),
              P("box", [0.18, 0.42, 0.25], [0.12, 0.06, 0.04], bone),
              P("sph", [0.42, 0.85, 0], [0.4, 0.32, 0.42], "#2e1065"),
              P("spike", [0.5, 1.08, 0], [0.1, 0.4, 0.1], bone, { r: [0, 0, -0.5] }),
              G("cone", [0.38, 1.04, -0.08], [0.16, 0.35, 0.16], flame)
            )
          ],
          idle: { r: [0.03, 0.06, 0.02], f: 0.8 },
          kids: [
            // Long cape: curved panels hanging from the shoulders, flaring back to ragged ends; billows when he strikes
            {
              at: [0, 0.95, 0],
              parts: [
                ...[-2, -1, 0, 1, 2].flatMap((i) => {
                  const a = i * 0.4;
                  const x = Math.sin(a) * 0.45;
                  const z = -0.25 * Math.cos(a) - 0.09;
                  const c = i % 2 ? "#4c1d95" : cloak;
                  return [
                    P("box", [x, -0.75, z], [0.28, 1.55, 0.05], c, { r: [0.12, -a, 0] }),
                    P("spike", [x, -1.62, z - 0.1], [0.2, 0.26, 0.05], c, { r: [PI + 0.12, -a, 0] })
                  ];
                }),
                ...sym(P("spike", [0.2, 0.08, -0.14], [0.09, 0.32, 0.09], cloak, { r: [-0.3, 0, -0.3] }))
              ],
              idle: { r: [0.06, 0, 0.02], f: 0.9 },
              atk: { r: [0.25, 0, 0] }
            },
            {
              at: [0, 1.0, 0],
              parts: [
                P("sph", [0, 0.2, 0], [0.4, 0.44, 0.42], obsidian),
                P("box", [0, 0.12, 0.17], [0.26, 0.16, 0.12], bone),
                ...sym(P("cone", [0.2, 0.42, -0.02], [0.1, 0.45, 0.1], bone, { r: [0.3, 0, -0.6] })),
                G("cone", [0, 0.52, 0], [0.14, 0.35, 0.14], flame)
              ],
              idle: { r: [0.06, 0.2, 0.04], f: 0.6 },
              atk: { r: [0.2, 0, 0] },
              kids: [{ at: [0, 0.26, 0.2], eye: true, parts: sym(G("sph", [0.08, 0, 0], [0.09, 0.05, 0.05], "#f0abfc")) }]
            },
            // Scythe arm: sweeps the void blade across
            {
              at: [0.44, 0.72, 0],
              walk: { r: [-0.3, 0, 0], f: STRIDE },
              parts: [
                P("cyl", [0.04, -0.25, 0.04], [0.18, 0.5, 0.18], obsidian, { r: [0, 0, 0.12] }),
                P("sph", [0.08, -0.55, 0.12], [0.17, 0.17, 0.17], "#2e1065"),
                P("cyl", [0.08, -0.35, 0.12], [0.07, 2.4, 0.07], "#1c1917", { r: [0.001, 0, 0] }),
                P("sph", [0.08, 0.85, 0.12], [0.16, 0.16, 0.16], bone),
                G("blade", [-0.3, 0.8, 0.12], [0.2, 0.78, 0.05], flame, { r: [0, 0, PI / 2 + 0.3] })
              ],
              idle: { r: [0.05, 0, 0.04], f: 0.9 },
              atk: { r: [1.1, 0, -0.2] }
            },
            // Flame hand: thrusts the void flame forward
            {
              at: [-0.44, 0.72, 0],
              walk: { r: [-0.3, 0, 0], f: STRIDE, ph: PI },
              parts: [
                P("cyl", [-0.04, -0.25, 0.04], [0.18, 0.5, 0.18], obsidian, { r: [0, 0, -0.12] }),
                P("sph", [-0.08, -0.52, 0.12], [0.17, 0.17, 0.17], "#2e1065"),
                G("sph", [-0.12, -0.5, 0.32], [0.28, 0.28, 0.28], flame),
                G("tor", [-0.12, -0.5, 0.32], [0.46, 0.46, 0.5], "#f0abfc", { t: 0.05 })
              ],
              idle: { r: [0.05, 0, 0.04], f: 0.9, ph: 1.2 },
              atk: { r: [-1.0, 0, 0.2], d: 0.08 }
            }
          ]
        }
      ]
    }
  };
}

/**
 * Legendary: the gilded Archmage of the Hero Monument fountain come to life — the statue's wide-brimmed hat, golden
 * robe and crystal staff, now hovering over a turning rune circle with a rayed halo, a violet cape, a void orb in his
 * free hand and shards circling him
 */
function voidArchmage(): BossRig {
  const VOID = "#e879f9";
  const PINK = "#f0abfc";
  const cape = "#2e1065";
  return {
    aura: "#f59e0b",
    ember: "#fde68a",
    auraSize: 2.3,
    float: 0.2,
    root: {
      at: [0, 0, 0],
      walk: { p: [0, 0.04, 0], f: STRIDE * 2, ph: PI / 2 },
      parts: [],
      kids: [
        // Rune circle turning under his feet
        {
          at: [0, 0.02, 0],
          spin: 0.35,
          parts: [
            G("tor", [0, 0, 0], [2.7, 2.7, 0.5], GOLD, { r: [PI / 2, 0, 0], t: 0.02 }),
            G("tor", [0, 0, 0], [1.9, 1.9, 0.5], VOID, { r: [PI / 2, 0, 0], t: 0.025 }),
            ...Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * PI * 2;
              return G("oct", [Math.sin(a) * 1.15, 0.05, Math.cos(a) * 1.15], [0.14, 0.08, 0.2], i % 2 ? PALE_GOLD : PINK, { r: [0, a, 0] });
            })
          ]
        },
        {
          at: [0, 0, 0],
          parts: [
            P("cone", [0, 0.86, 0], [0.78, 1.73, 0.72], GOLD),
            G("tor", [0, 0.12, 0], [0.8, 0.8, 0.5], VOID, { r: [PI / 2, 0, 0], t: 0.06 }),
            G("tor", [0, 0.6, 0], [0.58, 0.58, 0.5], PALE_GOLD, { r: [PI / 2, 0, 0], t: 0.06 }),
            G("oct", [0, 0.95, 0.19], [0.12, 0.22, 0.06], VOID),
            P("sph", [0, 1.5, 0], [0.6, 0.4, 0.5], GOLD),
            P("tor", [0, 1.62, 0], [0.5, 0.5, 0.4], PALE_GOLD, { r: [PI / 2, 0, 0], t: 0.1 }),
            ...sym(P("sph", [0.3, 1.56, 0], [0.3, 0.22, 0.3], GOLD), G("oct", [0.33, 1.7, 0], [0.1, 0.18, 0.1], VOID))
          ],
          idle: { r: [0.02, 0.04, 0.02], f: 0.9 },
          kids: [
            // Violet cape flowing from the shoulders
            {
              at: [0, 1.58, -0.2],
              parts: fan([0, 0, 0], 0.22, [PI - 0.28, PI, PI + 0.28], 1.5, 0.55, [cape, "#581c87"]),
              idle: { r: [0.07, 0, 0.03], f: 0.8 }
            },
            {
              at: [0, 1.86, 0],
              parts: [
                P("sph", [0, 0, 0], [0.42, 0.42, 0.42], GOLD),
                P("cyl", [0, 0, 0], [0.87, 0.06, 0.87], GOLD),
                P("tor", [0, 0, 0], [0.92, 0.92, 0.4], PALE_GOLD, { r: [PI / 2, 0, 0], t: 0.04 }),
                P("cone", [0, 0.5, 0], [0.51, 0.93, 0.51], GOLD),
                G("tor", [0, 0.12, 0], [0.5, 0.5, 0.4], VOID, { r: [PI / 2, 0, 0], t: 0.06 }),
                G("oct", [0, 0.32, 0.2], [0.1, 0.14, 0.05], PALE_GOLD),
                G("oct", [0, 1.0, 0], [0.12, 0.16, 0.12], "#fef9c3"),
                P("cone", [0, -0.3, 0.1], [0.26, 0.5, 0.16], "#f5f5f4", { r: [PI - 0.15, 0, 0] })
              ],
              idle: { r: [0.05, 0.18, 0.04], f: 0.55 },
              atk: { r: [-0.25, 0, 0] },
              kids: [
                { at: [0, -0.06, 0.19], eye: true, parts: sym(G("sph", [0.07, 0, 0], [0.07, 0.04, 0.04], PINK)) },
                // Rayed halo behind the hat
                {
                  at: [0, 0.25, -0.32],
                  parts: [
                    G("tor", [0, 0, 0], [1.0, 1.0, 0.5], "#fde047", { t: 0.03 }),
                    ...Array.from({ length: 12 }, (_, i) => {
                      const a = (i / 12) * PI * 2;
                      return G("spike", [Math.sin(a) * 0.64, Math.cos(a) * 0.64, 0], [0.06, i % 2 ? 0.16 : 0.26, 0.06], PALE_GOLD, { r: [0, 0, -a] });
                    })
                  ],
                  idle: { s: 0.06, f: 1.5 }
                }
              ]
            },
            // Free hand raised, a void orb hovering over the palm
            {
              at: [-0.32, 1.52, 0],
              walk: { r: [-0.3, 0, 0], f: STRIDE, ph: PI },
              parts: [
                P("cyl", [-0.1, -0.02, 0.12], [0.13, 0.42, 0.13], GOLD, { r: [-0.9, 0, 0.4] }),
                P("sph", [-0.18, 0.1, 0.28], [0.13, 0.13, 0.13], GOLD),
                G("sph", [-0.18, 0.34, 0.3], [0.22, 0.22, 0.22], "#a855f7"),
                G("tor", [-0.18, 0.34, 0.3], [0.38, 0.38, 0.5], PINK, { r: [PI / 2, 0, 0], t: 0.05 })
              ],
              idle: { r: [0.06, 0, 0.04], f: 1.0, ph: 1.4 },
              atk: { r: [-0.6, 0, 0.2], d: 0.05 }
            }
          ]
        },
        // The staff and the hand holding it: lifts and flares when he casts
        {
          at: [0.57, 0, 0],
          parts: [
            P("cyl", [0, 1.24, 0], [0.09, 2.48, 0.09], PALE_GOLD),
            G("tor", [0, 1.2, 0], [0.16, 0.16, 0.4], VOID, { r: [PI / 2, 0, 0], t: 0.15 }),
            P("cyl", [-0.14, 1.5, 0], [0.14, 0.34, 0.14], GOLD, { r: [0, 0, 1.2] }),
            P("sph", [-0.03, 1.45, 0.03], [0.15, 0.15, 0.15], GOLD),
            // Crescent cradling the crystal, with two prongs
            P("arc", [0, 2.72, 0], [0.64, 0.64, 0.5], GOLD, { r: [0, 0, PI], t: 0.08 }),
            ...sym(P("spike", [0.32, 2.88, 0], [0.07, 0.32, 0.07], GOLD))
          ],
          idle: { r: [0.03, 0, 0.03], f: 0.9 },
          atk: { p: [0, 0.3, 0.1], r: [0.15, 0, 0] },
          kids: [
            {
              at: [0, 2.72, 0],
              spin: 1.2,
              parts: [G("oct", [0, 0, 0], [0.42, 0.6, 0.42], VOID), G("oct", [0, 0, 0], [0.2, 0.3, 0.2], "#fef9c3")],
              idle: { s: 0.12, f: 2.6 },
              atk: { s: 0.5 }
            },
            { at: [0, 2.72, 0], r: [0.6, 0, 0], spin: 2.0, parts: [G("tor", [0, 0, 0], [0.82, 0.82, 0.5], PINK, { r: [PI / 2, 0, 0], t: 0.025 })] },
            { at: [0, 2.72, 0], r: [-0.5, 0, 0.6], spin: -1.6, parts: [G("tor", [0, 0, 0], [0.95, 0.95, 0.5], PALE_GOLD, { r: [PI / 2, 0, 0], t: 0.02 })] }
          ]
        },
        // Void shards and gold motes circling the archmage on two tiers
        {
          at: [0, 1.4, 0],
          spin: 0.7,
          parts: Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * PI * 2;
            return G("oct", [Math.sin(a) * 1.25, (i % 2) * 0.45, Math.cos(a) * 1.25], i % 2 ? [0.14, 0.2, 0.14] : [0.18, 0.34, 0.18], i % 2 ? PALE_GOLD : PINK);
          }),
          idle: { p: [0, 0.15, 0], f: 1.1 }
        }
      ]
    }
  };
}

/* ------------------------------ the Void Gate ------------------------------ */

/**
 * The Warden's Oathbound as a yin-yang of two void koi, shared by its Normal rig and its HD hero so both draw the same
 * model: the fish lie in a disc (local x–z, its turning axis local +y) of radius `R`, each a teardrop comma of the
 * taijitu (its round head tucked into the inner half, its body sweeping round the outer rim to a butterfly tail), on a
 * chain of seven bones: five down the body, then the tail with the first half of its wake, then the wake's end.
 */
export const OATH_FISH = {
  /** Disc radius, its height over the ground, and its tilt towards the viewer (rad, about x) */
  R: 1.3,
  Y: 1.6,
  tilt: 0.96,
  /** Turns per second of the pair (rad/s) */
  spin: 0.6,
  /** Where along the body (0 head … 1 tail root) the five body bones start; bones 5 and 6 carry the tail and its wake */
  body: [0, 0.2, 0.42, 0.64, 0.84] as const,
  bones: 7,
  /** A point on fish `side` (1 the dark one, −1 the pale one) at s, in the disc's plane: [x, z] */
  at(s: number, side: number): [number, number] {
    const phi = Math.PI / 2 + Math.PI * 0.98 * s;
    const rho = this.R * (0.58 + 0.38 * Math.pow(Math.max(0, s), 0.8));
    return [side * rho * Math.cos(phi), side * rho * Math.sin(phi)];
  },
  /** The fish's tangent at s (unit [x, z], towards its tail) */
  dir(s: number, side: number): [number, number] {
    const [a, b] = this.at(Math.max(0, s - 0.01), side);
    const [c, d] = this.at(Math.min(1, s + 0.01), side);
    const l = Math.hypot(c - a, d - b) || 1;
    return [(c - a) / l, (d - b) / l];
  },
  /** Its wake: a streamer of light flowing on from the tail round the rim (k 0 … 1) */
  wake(k: number, side: number): [number, number] {
    const phi = Math.PI / 2 + Math.PI * 0.98 * (1.0 + 0.42 * k);
    const rho = this.R * (0.98 + 0.1 * k);
    return [side * rho * Math.cos(phi), side * rho * Math.sin(phi)];
  },
  /** Half-width in the plane at s: the comma, full at the head (filling its half of the yin-yang), tapering to the tail */
  width(s: number) {
    return this.R * (0.25 * Math.pow(Math.max(0, 1 - s), 0.85) + 0.032);
  },
  /** Half-thickness across the disc at s */
  thick(s: number) {
    return this.R * (0.13 * Math.pow(Math.max(0, 1 - s), 0.9) + 0.025);
  },
  /** The bone pivots in the disc's plane: the five body bones, the tail root, the wake's middle, then the wake's tip */
  joints(side: number): Array<[number, number]> {
    return [...this.body.map((s) => this.at(s, side)), this.at(1, side), this.wake(0.48, side), this.wake(1, side)];
  }
};

/** What each part of a koi is, for its colour: the same in Normal and HD */
export type KoiRole = "body" | "fin" | "seam" | "rim" | "eye" | "pupil" | "glow" | "wake";
export const KOI_LOOK: Record<1 | -1, Record<KoiRole, string>> = {
  1: { body: "#1c1326", fin: "#2e1f40", seam: "#e11d48", rim: "#e11d48", eye: "#f5f0ff", pupil: "#2e1065", glow: "#e11d48", wake: "#e11d48" },
  [-1]: { body: "#f7f3ff", fin: "#e4dcff", seam: "#a855f7", rim: "#e11d48", eye: "#1c1326", pupil: "#f5f0ff", glow: "#fde68a", wake: "#fde68a" }
};
/** Roles drawn glowing (the pale koi's eye is a dark pearl, not a light) */
export const koiGlows = (role: KoiRole, side: 1 | -1) => role === "seam" || role === "rim" || role === "glow" || role === "wake" || role === "pupil" || (role === "eye" && side > 0);

/**
 * One koi as a list of ellipsoids (the same list builds the Normal rig and the HD hero): each in the disc's rest
 * space (`at`: x, height over the disc, z), turned `yaw` about the disc's axis (its long side along `size[2]`), its full
 * size [across, up, along], what it is, and which bone (0 head … 6 wake's end) carries it
 */
export interface KoiPart {
  at: [number, number, number];
  yaw: number;
  size: [number, number, number];
  role: KoiRole;
  bone: number;
}

export function koiParts(side: 1 | -1): KoiPart[] {
  const F = OATH_FISH;
  const out: KoiPart[] = [];
  const boneOf = (s: number) => {
    let k = 0;
    for (let i = 0; i < F.body.length; i++) if (s >= F.body[i]) k = i;
    return k;
  };
  const frame = (s: number) => {
    const [x, z] = F.at(s, side);
    const [tx, tz] = F.dir(s, side);
    // n is the in-plane side of the body; u = ±1 picks which side
    return { x, z, tx, tz, nx: -tz, nz: tx, yaw: Math.atan2(tx, tz) };
  };
  const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);
  const add = (at: [number, number, number], yaw: number, size: [number, number, number], role: KoiRole, bone: number) => out.push({ at, yaw, size, role, bone });

  // The body: overlapping ovals laid along the comma, each stretched along it, so it reads smooth (never a string of beads)
  for (let i = 0; i <= 18; i++) {
    const s = i / 18;
    const f = frame(s);
    const w = F.width(s);
    // The round head is a near sphere; down the body each oval reaches well past the next
    const len = s < 0.1 ? w * 2.05 : Math.max(w * 2.3, 0.34);
    add([f.x, 0, f.z], f.yaw, [w * 2, F.thick(s) * 2, len], "body", boneOf(Math.min(s, 0.999)));
  }
  // The yin-yang's dot on both faces of the head: a lit rim, the dot in the other koi's colour, and its pupil
  {
    const f = frame(0);
    const t0 = F.thick(0);
    for (const u of [1, -1]) {
      add([f.x, u * (t0 + 0.005), f.z], 0, [0.23, 0.04, 0.23], "rim", 0);
      add([f.x, u * (t0 + 0.02), f.z], 0, [0.19, 0.05, 0.19], "eye", 0);
      add([f.x - f.tx * 0.04, u * (t0 + 0.045), f.z - f.tz * 0.04], 0, [0.07, 0.03, 0.07], "pupil", 0);
    }
    // Whiskers from the mouth, curving out and back; two small lit horns swept back over the brow (a dragon-koi)
    const w0 = F.width(0);
    for (const u of [1, -1]) {
      const dx = f.tx * 0.45 + f.nx * u * 0.9;
      const dz = f.tz * 0.45 + f.nz * u * 0.9;
      const l = Math.hypot(dx, dz);
      add([f.x - f.tx * w0 * 0.85 + (dx / l) * 0.2, -0.03, f.z - f.tz * w0 * 0.85 + (dz / l) * 0.2], yawOf(dx, dz), [0.03, 0.03, 0.4], "fin", 0);
      add([f.x + f.nx * u * w0 * 0.45 + f.tx * 0.1, t0 * 0.7 + 0.1, f.z + f.nz * u * w0 * 0.45 + f.tz * 0.1], f.yaw, [0.05, 0.2, 0.09], "glow", 0);
    }
  }
  // Pectoral fins: broad and soft, sweeping out and back from behind the head; pelvic fins smaller, further back
  for (const [s, len, wide, spread] of [
    [0.16, 0.5, 0.22, 1.1],
    [0.42, 0.3, 0.14, 0.9]
  ] as const) {
    const f = frame(s);
    const w = F.width(s);
    for (const u of [1, -1]) {
      const dx = f.tx * 0.7 + f.nx * u * spread;
      const dz = f.tz * 0.7 + f.nz * u * spread;
      const l = Math.hypot(dx, dz);
      add([f.x + f.nx * u * w * 0.8 + (dx / l) * len * 0.42, -F.thick(s) * 0.3, f.z + f.nz * u * w * 0.8 + (dz / l) * len * 0.42], yawOf(dx, dz), [wide, 0.03, len], "fin", boneOf(s));
    }
  }
  // The dorsal sail: soft fins standing along the back, tallest in front, one per front bone
  for (const [s, h, len] of [
    [0.12, 0.26, 0.5],
    [0.32, 0.22, 0.5],
    [0.52, 0.16, 0.44]
  ] as const) {
    const f = frame(s);
    add([f.x, F.thick(s) + h * 0.38, f.z], f.yaw, [0.035, h, len], "fin", boneOf(s));
  }
  // The butterfly tail: two broad lobes fanning from the root and a short one between, their tips lit (carried by bone 5)
  {
    const f = frame(1);
    for (const [u, len, wide] of [
      [1, 0.66, 0.3],
      [-1, 0.66, 0.3],
      [0, 0.36, 0.2]
    ] as const) {
      const a = Math.atan2(f.tx, f.tz) + u * 0.5;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      add([f.x + dx * len * 0.48, 0, f.z + dz * len * 0.48], a, [wide, 0.035, len], u ? "fin" : "body", 5);
      if (u) add([f.x + dx * len * 0.95, 0, f.z + dz * len * 0.95], a, [0.08, 0.05, 0.15], "glow", 5);
    }
  }
  // Its wake: a streamer of light flowing on from the tail round the rim, long ovals thinning as it fades (bones 5 and 6)
  for (let i = 0; i < 12; i++) {
    const k = (i / 11) * 0.96;
    const [x, z] = F.wake(k, side);
    const [x2, z2] = F.wake(k + 0.02, side);
    const r = 0.2 - i * 0.012;
    add([x, 0, z], yawOf(x2 - x, z2 - z), [r, r * 0.5, 0.42], "wake", k < 0.48 ? 5 : 6);
  }
  return out;
}

/**
 * Legendary, never hired: the Warden's Oathbound, the familiar of the Void Gate's Warden, sworn to the ruler who beats
 * the gate's last level (coming soon; the Codex previews it). A creature of the void, the same for every civilization:
 * two void koi, one obsidian and one pale as moonlit pearl, chasing each other round a yin-yang that floats at head
 * height and turns slowly, each koi's head carrying the yin-yang's dot in the other's colour, a taijitu pearl at its heart.
 */
function wardenOathbound(): BossRig {
  const F = OATH_FISH;
  const fish = (side: 1 | -1): BossBone => {
    const all = koiParts(side);
    const joints = F.joints(side);
    // Each bone holds its own parts, in its own space (its pivot on the chain)
    const bone = (k: number): BossBone => {
      const [px, pz] = joints[k];
      const parts: BossPart[] = all
        .filter((p) => p.bone === k)
        .map((p) => (koiGlows(p.role, side) ? G : P)("sph", [p.at[0] - px, p.at[1], p.at[2] - pz], p.size, KOI_LOOK[side][p.role], { r: [0, p.yaw, 0] }));
      const prev = k ? joints[k - 1] : [0, 0];
      return {
        at: k === 0 ? [px, 0, pz] : [px - prev[0], 0, pz - prev[1]],
        parts,
        // A slow swimming wave travels down the body and on through the wake
        idle: k === 0 ? { r: [0, 0.025, 0], f: 2.8 } : { r: [0, k < 5 ? 0.042 + k * 0.006 : 0.065, 0], f: 2.8, ph: -k * 0.85 },
        kids: k + 1 < F.bones ? [bone(k + 1)] : undefined
      };
    };
    return bone(0);
  };
  return {
    aura: "#be123c",
    ember: "#fda4af",
    auraSize: 2.4,
    root: {
      at: [0, 0, 0],
      parts: [],
      kids: [
        {
          at: [0, F.Y, 0],
          r: [F.tilt, 0, 0],
          idle: { r: [0.055, 0, 0.045], p: [0, 0.075, 0], f: 0.5 },
          parts: [],
          kids: [
            { at: [0, 0, 0], spin: F.spin, parts: [], kids: [fish(1), fish(-1)] },
            // The taijitu pearl at the ring's heart, turning the other way
            {
              at: [0, 0, 0],
              spin: -0.95,
              parts: [
                P("sph", [0.05, 0, 0.02], [0.36, 0.36, 0.36], "#1c1326"),
                P("sph", [-0.05, 0, -0.02], [0.34, 0.37, 0.34], "#f7f3ff"),
                G("sph", [0.06, 0.17, 0.02], [0.07, 0.04, 0.07], "#f5f1ff"),
                G("sph", [-0.06, 0.17, -0.02], [0.07, 0.04, 0.07], "#e11d48"),
                G("tor", [0, 0, 0], [0.5, 0.5, 0.5], "#fde68a", { r: [PI / 2, 0, 0], t: 0.03 })
              ]
            }
          ]
        },
        {
          at: [0, F.Y + 0.1, 0],
          spin: -0.35,
          parts: Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * PI * 2;
            const at: [number, number, number] = [Math.sin(a) * 2.0, (i % 2) * 0.35 - 0.1, Math.cos(a) * 2.0];
            return i % 2 ? G("oct", at, [0.11, 0.28, 0.11], i % 4 === 1 ? "#e11d48" : "#a855f7") : P("oct", at, [0.14, 0.36, 0.14], "#1c1326");
          }),
          idle: { p: [0, 0.12, 0], f: 0.8 }
        }
      ]
    }
  };
}

/** The Void Gate's legendary mercenary (coming soon): never in a camp's pool, every civilization gets the same one */
export const OATHBOUND: MercenaryDef = {
  type: "merc-void-oathbound",
  name: "The Warden's Oathbound",
  title: "Sworn at the Void Gate",
  rarity: "legendary",
  role: "Familiar",
  emblem: "☯️",
  description:
    "The familiar of the Void Gate's Warden, two creatures of the void that were never apart: a pair of koi, one obsidian marked with crimson and one pale as moonlit pearl with a red crown, chasing each other round a ring that floats at head height and turns slowly, each koi's eye the other's colour, their butterfly tails trailing streamers of crimson and gold light round a yin-yang pearl at the ring's heart, void shards circling them. When the Warden falls, they circle the ruler who beat it and follow them from then on. The same pair answers every civilization."
};

/* ------------------------------ pools ------------------------------ */

export const MERCENARY_RIGS: Record<string, BossRig> = {
  "merc-void-acolyte": riftAcolyte(),
  "merc-void-riftguard": riftguard(),
  "merc-void-seer": astralSeer(),
  "merc-void-reaver": eclipseReaver(),
  "merc-void-archmage": voidArchmage(),
  "merc-void-oathbound": wardenOathbound(),
  ...CIV_MERCENARY_RIGS
};

/** How many walk in a band of each rarity: a band is one whole march, the rarer the fewer (a legendary walks alone) */
export const MERCENARY_BAND_SIZE: Record<NPCRarity, number> = { common: 20, uncommon: 15, rare: 10, epic: 5, legendary: 1, mythical: 1 };

/** Each civilization's mercenary pool, common → legendary, slot for slot alike across the five */
export const MERCENARY_POOLS: Partial<Record<CivilizationType, MercenaryDef[]>> = {
  ...CIV_MERCENARY_POOLS,
  arcane: [
    {
      type: "merc-void-acolyte",
      name: "Rift Acolyte",
      title: "Novice of the Void Well",
      rarity: "common",
      role: "Caster",
      emblem: "🕯️",
      description: "A hooded novice who tends the Void Well, leaning on a plain staff tipped with a violet orb. Every Archmage began here."
    },
    {
      type: "merc-void-riftguard",
      name: "Riftguard Sentinel",
      title: "Shield of the Citadel",
      rarity: "uncommon",
      role: "Defender",
      emblem: "🛡️",
      description: "Void-plated guardian of the citadel gates, with a blade forged in the rift and a runed shield that drinks in blows."
    },
    {
      type: "merc-void-seer",
      name: "Astral Seer",
      title: "Eyes Beyond the Veil",
      rarity: "rare",
      role: "Seer",
      emblem: "🔭",
      description: "Blindfolded, she sees further than any scout. She drifts above the ground, reading the stars from a glowing tome as star-orbs circle her."
    },
    {
      type: "merc-void-reaver",
      name: "Eclipse Reaver",
      title: "Harvester of the Dark Moon",
      rarity: "epic",
      role: "Slayer",
      emblem: "🌑",
      description: "A horned reaver in obsidian plate and a long violet cloak. One hand sweeps a void scythe, the other hurls violet flame."
    },
    {
      type: "merc-void-archmage",
      name: "Archmage of the Voidrift",
      title: "The Gilded One",
      rarity: "legendary",
      role: "Archmage",
      emblem: "🧙",
      description: "The golden mage who crowns every Nethergarde Hero Monument, come to life. He hovers in his wide-brimmed hat and gilded robe (over a turning rune circle in Normal; high graphics keeps rings off the ground), crowned by a rayed halo, a violet cape at his back, a void orb in one hand and a crescent staff of ringed crystal in the other, with shards circling him."
    }
  ]
};
