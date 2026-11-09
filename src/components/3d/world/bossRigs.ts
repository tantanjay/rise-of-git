/**
 * World boss models (and legendary sites) as rigs: a tree of bones, each a handful of primitive parts that move together.
 * Every model faces +z (toward the default camera). `BossModel` draws them (static parts of a bone merged into
 * one mesh per material) and animates the bones: an idle sine motion per bone (breathing, swaying heads, waving
 * tentacles, beating wings), plus the attack motion on the strike curve while armies fight the boss (and as a
 * rare roar while idle). The root bone's own parts are the ground the boss stands on (a base, rocks, sand, water,
 * statues): `BossModel` draws them apart so they never turn with it; every part of the creature goes in a child bone.
 * Plain data, so `npm run check:models` can check the parts for z-fighting.
 */

export type Vec3 = [number, number, number];
export type BossShape = "box" | "sph" | "cone" | "spike" | "blade" | "cyl" | "tor" | "arc" | "oct" | "dod" | "ico";

export interface BossPart {
  s: BossShape;
  /** Centre in bone space */
  p: Vec3;
  /** Size: box w/h/d; sphere/cone/cylinder diameters and height; torus outer size. A blade (3-sided cone) squashed flat is a wing or fin. */
  z: Vec3;
  r?: Vec3;
  c: string;
  /** Glows in its own colour (eyes, venom, lava) */
  glow?: boolean;
  /** Cylinder: top radius ÷ bottom radius. Torus/arc: tube radius (unit ring of radius 0.5) */
  t?: number;
}

/** A motion: rotation / position / scale amplitudes. Idle: a sine at `f` rad/s, phase `ph`. Attack: the strike curve, `d` late in the cycle. */
export interface Motion {
  r?: Vec3;
  p?: Vec3;
  s?: number;
  f?: number;
  ph?: number;
  d?: number;
}

export interface BossBone {
  /** Pivot in the parent bone's space */
  at: Vec3;
  /** Rest rotation (order YXZ: yaw, then pitch and roll in the yawed frame) */
  r?: Vec3;
  /** Rest scale (a breath of fire grows from almost nothing) */
  s0?: number;
  /** Turns round at this rate (rad/s), e.g. orbiting wisps */
  spin?: number;
  /** Holds the eyes: they blink */
  eye?: boolean;
  parts: BossPart[];
  kids?: BossBone[];
  idle?: Motion;
  atk?: Motion;
  /** On the march: a sine at the stride's rate `f` (rad/s), phase `ph` (legs and arms swing, the body dips) */
  walk?: Motion;
}

export interface BossRig {
  root: BossBone;
  /** Ground aura and its embers */
  aura: string;
  ember: string;
  /** Hovers this high above its base, bobbing */
  float?: number;
  /** A legendary site: a beam of light in this colour rises from it */
  beam?: string;
  /** Ground aura radius (default 3.6; small figures like mercenaries use less) */
  auraSize?: number;
  /** Doesn't look round (sites, not creatures) */
  still?: boolean;
}

/* ------------------------------ helpers ------------------------------ */

const PI = Math.PI;
export const P = (s: BossShape, p: Vec3, z: Vec3, c: string, o: Partial<BossPart> = {}): BossPart => ({ s, p, z, c, ...o });
export const G = (s: BossShape, p: Vec3, z: Vec3, c: string, o: Partial<BossPart> = {}): BossPart => ({ s, p, z, c, glow: true, ...o });

const mx = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
const mr = (r: Vec3): Vec3 => [r[0], -r[1], -r[2]];
const mirrorPart = (p: BossPart): BossPart => ({ ...p, p: mx(p.p), r: p.r && mr(p.r) });
const mirrorMotion = (m?: Motion): Motion | undefined => m && { ...m, r: m.r && mr(m.r), p: m.p && mx(m.p) };
/** The other side's step comes half a stride later */
const mirrorWalk = (m?: Motion): Motion | undefined => m && { ...mirrorMotion(m), ph: (m.ph ?? 0) + PI };
function mirrorBone(b: BossBone): BossBone {
  return {
    ...b,
    at: mx(b.at),
    r: b.r && mr(b.r),
    parts: b.parts.map(mirrorPart),
    kids: b.kids?.map(mirrorBone),
    idle: mirrorMotion(b.idle),
    atk: mirrorMotion(b.atk),
    walk: mirrorWalk(b.walk)
  };
}
/** Parts on the +x side plus their mirror image */
export const sym = (...parts: BossPart[]): BossPart[] => [...parts, ...parts.map(mirrorPart)];
/** A bone on the +x side plus its mirror image */
export const pair = (b: BossBone): BossBone[] => [b, mirrorBone(b)];

/** Where a part's local +y axis points for rotation [rx, 0, rz] (Euler XYZ) */
const axisOf = (rx: number, rz: number): Vec3 => [-Math.sin(rz), Math.cos(rz) * Math.cos(rx), Math.cos(rz) * Math.sin(rx)];
const along = (p: Vec3, dir: Vec3, d: number): Vec3 => [p[0] + dir[0] * d, p[1] + dir[1] * d, p[2] + dir[2] * d];

/**
 * A fan of flat blades from `base` (a bat wing, fin or feathers): blade i points along rotation [rx, 0, rzs[i]],
 * centred half its length out. rx = -π/2 lays the fan flat; rz turns each blade round (-π/2 = straight out to +x).
 */
export const fan = (base: Vec3, rx: number, rzs: number[], len: number, width: number, colors: string[]): BossPart[] =>
  rzs.map((rz, i) => P("blade", along(base, axisOf(rx, rz), len / 2), [width, len, 0.05], colors[i % colors.length], { r: [rx, 0, rz] }));

/* ------------------------------ the bosses ------------------------------ */

/** 13. Leviathan Kraken Lord: a bulbous mantle with burning eyes and eight tentacles that rear and slam */
function kraken(): BossRig {
  const skin = "#581c87";
  const tentacles: BossBone[] = Array.from({ length: 8 }, (_, i) => {
    const a = ((i + 0.5) / 8) * PI * 2;
    const front = Math.cos(a) > 0.8;
    return {
      at: [Math.sin(a) * 1.15, 0.55, Math.cos(a) * 1.15],
      r: [0, a, 0],
      parts: [
        P("cyl", [0, 0, 0.95], [0.75, 1.9, 0.75], skin, { r: [PI / 2, 0, 0], t: 0.6 }),
        P("cone", [0, 0.7, 2.05], [0.45, 1.8, 0.45], "#6b21a8", { r: [0.6, 0, 0] }),
        P("sph", [0, -0.32, 0.7], [0.28, 0.14, 0.28], "#f9a8d4"),
        P("sph", [0, -0.24, 1.35], [0.22, 0.12, 0.22], "#f9a8d4")
      ],
      idle: { r: [0.22, 0.14, 0.1], f: 1.3, ph: i * 0.8 },
      atk: front ? { r: [0.75, 0, 0] } : { r: [-0.5, 0.1, 0], d: i * 0.06 }
    };
  });
  return {
    aura: "#a21caf",
    ember: "#e879f9",
    root: {
      at: [0, 0, 0],
      parts: [P("cyl", [0, 0.08, 0], [5.8, 0.16, 5.8], "#0b1d3a")],
      kids: [
        ...tentacles,
        {
          at: [0, 1.2, 0],
          parts: [
            P("sph", [0, 1.7, -0.5], [2.6, 3.4, 2.6], "#3b0764", { r: [-0.35, 0, 0] }),
            P("sph", [0, 0.3, 0.2], [2.6, 1.8, 2.4], skin),
            P("cone", [0, -0.3, 1.3], [0.55, 0.9, 0.55], "#1c1917", { r: [2.2, 0, 0] }),
            P("spike", [0, 3.35, -1.2], [0.45, 1.0, 0.45], "#1e1b4b", { r: [-0.5, 0, 0] }),
            ...sym(
              P("spike", [0.75, 2.9, -1.0], [0.35, 0.8, 0.35], "#1e1b4b", { r: [-0.4, 0, -0.35] }),
              G("sph", [0.85, 2.0, 0.45], [0.3, 0.3, 0.3], "#c026d3")
            )
          ],
          idle: { s: 0.04, f: 1.4 },
          atk: { p: [0, 0.2, 0.5], r: [0.25, 0, 0] },
          kids: [
            {
              at: [0, 0.6, 1.05],
              eye: true,
              parts: sym(
                G("sph", [0.6, 0, 0], [0.62, 0.5, 0.4], "#facc15"),
                P("box", [0.6, 0, 0.24], [0.08, 0.42, 0.08], "#0a0a0a"),
                P("box", [0.6, 0.36, 0.05], [0.85, 0.18, 0.5], "#1e1b4b", { r: [0, 0, 0.35] })
              )
            }
          ]
        }
      ]
    }
  };
}

/** 14. Dagon Tsunami Sovereign: a sea serpent rearing out of its coils, fanged jaws snapping down */
function leviathan(): BossRig {
  const body = "#0c4a6e";
  const dark = "#082f49";
  const fin = "#0891b2";
  const bone = "#e0f2fe";
  return {
    aura: "#0891b2",
    ember: "#67e8f9",
    root: {
      at: [0, 0, 0],
      parts: [P("cyl", [0, 0.08, 0], [5.8, 0.16, 5.8], "#0b2540")],
      kids: [
        {
          at: [0, 0, 0],
          parts: [
            P("arc", [-1.25, 0.1, -1.2], [1.9, 1.9, 1.9], body, { r: [0, 0.8, 0], t: 0.2 }),
            P("arc", [1.3, 0.1, -1.5], [1.6, 1.6, 1.6], body, { r: [0, -0.6, 0], t: 0.2 }),
            P("spike", [-1.25, 1.35, -1.2], [0.25, 0.6, 0.25], fin),
            P("spike", [1.3, 1.2, -1.5], [0.25, 0.55, 0.25], fin)
          ],
          idle: { p: [0, 0.12, 0], f: 1.0 }
        },
        {
          at: [0, 0.2, 0.6],
          parts: [
            P("cyl", [0, 1.3, 0], [1.4, 2.6, 1.4], body, { t: 0.8 }),
            P("sph", [0, 1.2, 0.45], [0.9, 2.2, 0.6], "#5eead4"),
            P("spike", [0, 1.0, -0.7], [0.3, 0.8, 0.3], fin, { r: [-0.6, 0, 0] }),
            P("spike", [0, 2.0, -0.6], [0.3, 0.8, 0.3], fin, { r: [-0.6, 0, 0] })
          ],
          idle: { r: [0.05, 0.12, 0.06], f: 0.9 },
          atk: { r: [0.25, 0, 0] },
          kids: [
            {
              at: [0, 2.6, 0],
              parts: [
                P("cyl", [0, 0.9, 0.25], [1.1, 2.0, 1.1], body, { r: [0.3, 0, 0], t: 0.8 }),
                P("spike", [0, 1.1, -0.45], [0.3, 0.9, 0.3], fin, { r: [-0.7, 0, 0] })
              ],
              idle: { r: [0.08, 0.1, 0], f: 0.9, ph: 0.6 },
              atk: { r: [0.6, 0, 0], d: 0.03 },
              kids: [
                {
                  at: [0, 1.9, 0.55],
                  parts: [
                    P("box", [0, 0.15, 0.6], [1.3, 0.8, 1.9], body),
                    P("box", [0, 0.05, 1.7], [0.9, 0.55, 0.7], dark),
                    ...sym(
                      P("spike", [0.45, 0.6, -0.15], [0.22, 1.4, 0.22], bone, { r: [-1.0, 0, -0.3] }),
                      P("box", [0.78, 0.1, 0.2], [0.1, 0.9, 1.0], fin, { r: [0, 0, -0.5] }),
                      P("spike", [0.35, -0.38, 1.3], [0.12, 0.4, 0.12], bone, { r: [PI, 0, 0] }),
                      P("spike", [0.15, -0.38, 1.75], [0.1, 0.35, 0.1], bone, { r: [PI, 0, 0] })
                    )
                  ],
                  idle: { r: [0.12, 0.25, 0], f: 0.7 },
                  atk: { r: [0.3, 0, 0], p: [0, 0, 0.3], d: 0.05 },
                  kids: [
                    {
                      at: [0, 0.38, 1.12],
                      eye: true,
                      parts: sym(G("sph", [0.5, 0, 0], [0.32, 0.22, 0.3], "#22d3ee"), P("box", [0.48, 0.2, 0], [0.5, 0.12, 0.4], dark, { r: [0, 0, 0.4] }))
                    },
                    {
                      at: [0, -0.25, 0.2],
                      parts: [
                        P("box", [0, -0.12, 0.75], [1.1, 0.3, 1.7], dark),
                        G("box", [0, 0.1, 0.6], [0.6, 0.06, 1.0], "#38bdf8"),
                        ...sym(P("spike", [0.35, 0.15, 1.3], [0.12, 0.35, 0.12], bone), P("spike", [0.2, 0.15, 1.5], [0.1, 0.3, 0.1], bone))
                      ],
                      idle: { r: [0.08, 0, 0], f: 1.1 },
                      atk: { r: [0.7, 0, 0], d: 0.02 }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

/** 15. Siren Broodmother: a corpse-pale siren on her rock, clawed arms and fin wings flaring as she screams */
function siren(): BossRig {
  const skin = "#64748b";
  const tail = "#134e4a";
  const claws = "#e5e7eb";
  return {
    aura: "#65a30d",
    ember: "#bef264",
    root: {
      at: [0, 0, 0],
      s0: 1.1,
      parts: [
        P("cyl", [0, 0.6, 0], [4.4, 1.2, 4.0], "#1f2937", { t: 0.75 }),
        P("dod", [-1.4, 1.0, -0.8], [1.4, 1.4, 1.4], "#374151"),
        P("dod", [1.45, 0.8, 0.7], [1.0, 1.0, 1.0], "#374151"),
        P("tor", [0, 1.35, 0], [2.6, 2.6, 1.4], tail, { r: [PI / 2, 0, 0], t: 0.16 })
      ],
      kids: [
        {
          at: [0, 1.4, 0],
          parts: [
            P("cyl", [0, 0.6, 0], [1.1, 1.4, 1.0], tail, { t: 0.7 }),
            P("cyl", [0, 1.7, 0], [1.0, 1.2, 0.75], skin, { t: 1.35 }),
            P("box", [0, 1.45, 0.38], [0.7, 0.08, 0.1], "#334155"),
            P("box", [0, 1.65, 0.42], [0.75, 0.08, 0.1], "#334155"),
            P("box", [0, 1.85, 0.46], [0.8, 0.08, 0.1], "#334155")
          ],
          idle: { r: [0.05, 0.1, 0.04], s: 0.03, f: 1.1 },
          atk: { r: [-0.25, 0, 0], p: [0, 0.2, 0.2] },
          kids: [
            {
              at: [0, 2.55, 0.05],
              parts: [
                P("sph", [0, 0.35, 0], [0.75, 0.9, 0.75], skin),
                P("cone", [0, 0.3, -0.42], [0.3, 1.5, 0.3], "#052e2b", { r: [2.8, 0, 0] }),
                P("spike", [0, 0.92, 0.05], [0.14, 0.6, 0.14], "#a16207"),
                ...sym(
                  P("cone", [0.32, 0.3, -0.25], [0.25, 1.4, 0.25], "#052e2b", { r: [2.6, 0, -0.4] }),
                  P("cone", [0.2, 0.55, -0.3], [0.22, 1.2, 0.22], "#052e2b", { r: [2.4, 0, -0.2] }),
                  P("spike", [0.22, 0.85, 0], [0.12, 0.5, 0.12], "#a16207", { r: [0, 0, -0.3] })
                )
              ],
              idle: { r: [0.12, 0.3, 0.08], f: 0.6 },
              atk: { r: [-0.45, 0, 0], d: 0.02 },
              kids: [
                { at: [0, 0.45, 0.33], eye: true, parts: sym(G("sph", [0.15, 0, 0], [0.18, 0.12, 0.1], "#a3e635")) },
                {
                  at: [0, 0.12, 0.2],
                  parts: [
                    P("box", [0, -0.12, 0.08], [0.45, 0.18, 0.35], skin),
                    G("box", [0, 0.02, 0.08], [0.3, 0.06, 0.24], "#84cc16"),
                    ...sym(P("spike", [0.1, 0.06, 0.2], [0.05, 0.16, 0.05], claws, { r: [PI, 0, 0] }))
                  ],
                  idle: { r: [0.05, 0, 0], f: 1.6 },
                  atk: { r: [0.7, 0, 0] }
                }
              ]
            },
            ...pair({
              at: [0.6, 2.1, 0],
              parts: [
                P("cyl", [0.35, -0.3, 0.15], [0.25, 1.0, 0.25], skin, { r: [0.3, 0, 0.8] }),
                P("cyl", [0.75, -0.55, 0.65], [0.2, 1.0, 0.2], skin, { r: [1.2, 0, 0.3] }),
                P("spike", [0.78, -0.65, 1.2], [0.07, 0.45, 0.07], claws, { r: [1.4, 0, 0] }),
                P("spike", [0.88, -0.62, 1.22], [0.07, 0.45, 0.07], claws, { r: [1.4, 0, 0] }),
                P("spike", [0.98, -0.65, 1.18], [0.07, 0.45, 0.07], claws, { r: [1.4, 0, 0] })
              ],
              idle: { r: [0.15, 0, 0.15], f: 0.9 },
              atk: { r: [-1.1, 0, -0.3], d: 0.04 }
            }),
            ...pair({
              at: [0.35, 2.2, -0.3],
              parts: [
                ...fan([0.1, 0.2, -0.1], -0.35, [-0.5, -0.95, -1.4, -1.85], 2.0, 0.6, ["#14b8a6", tail])
              ],
              idle: { r: [0, 0.25, 0.12], f: 1.3 },
              atk: { r: [0, 0.6, 0.3] }
            })
          ]
        }
      ]
    }
  };
}

/** 16. Great Sandworm Ouroboros: a ringed worm bursting from the dunes, its lamprey maw lunging */
function sandworm(): BossRig {
  const body = "#78350f";
  const ring = "#451a03";
  const teeth = "#fef3c7";
  // The maw faces forward and a little up: its axis is the head part's +y turned by rx
  const rx = 1.25;
  const dir = axisOf(rx, 0);
  const v: Vec3 = [0, Math.sin(rx), -Math.cos(rx)];
  const mouth: Vec3 = [0, 0.3, 0.35];
  const ringAt = (d: number, rad: number, phi: number): Vec3 => {
    const c = along(mouth, dir, d);
    return [c[0] + Math.cos(phi) * rad, c[1] + Math.sin(phi) * rad * v[1], c[2] + Math.sin(phi) * rad * v[2]];
  };
  const teethRing = (n: number, rad: number, d: number, size: number) =>
    Array.from({ length: n }, (_, i) => P("spike", ringAt(d, rad, (i / n) * PI * 2), [size * 0.5, size, size * 0.5], teeth, { r: [rx, 0, 0] }));
  return {
    aura: "#ea580c",
    ember: "#fdba74",
    root: {
      at: [0, 0, 0],
      parts: [
        P("cone", [0, 0.5, 0], [6.0, 1.0, 6.0], "#c2903d"),
        P("dod", [1.9, 0.4, 1.0], [0.8, 0.8, 0.8], "#a16207"),
        P("dod", [-2.0, 0.4, -0.6], [0.9, 0.9, 0.9], "#a16207")
      ],
      kids: [
        {
          at: [0, 0.6, 0],
          parts: [
            P("cyl", [0, 0.9, 0], [2.0, 1.8, 2.0], body, { t: 0.9 }),
            P("tor", [0, 1.0, 0], [2.0, 2.0, 1.0], ring, { r: [PI / 2, 0, 0], t: 0.12 }),
            P("spike", [0, 1.4, -0.9], [0.35, 0.8, 0.35], "#92400e", { r: [-1.0, 0, 0] })
          ],
          idle: { r: [0.06, 0, 0.08], f: 0.8 },
          atk: { r: [0.25, 0, 0] },
          kids: [
            {
              at: [0, 1.8, 0],
              parts: [
                P("cyl", [0, 0.85, 0.15], [1.8, 1.7, 1.8], body, { r: [0.25, 0, 0], t: 0.92 }),
                P("tor", [0, 1.0, 0.25], [1.8, 1.8, 1.0], ring, { r: [PI / 2 + 0.25, 0, 0], t: 0.12 }),
                P("spike", [0, 1.0, -0.85], [0.3, 0.8, 0.3], "#92400e", { r: [-1.0, 0, 0] })
              ],
              idle: { r: [0.1, 0, -0.1], f: 0.8, ph: 0.7 },
              atk: { r: [0.45, 0, 0], d: 0.02 },
              kids: [
                {
                  at: [0, 1.65, 0.45],
                  parts: [
                    P("cyl", mouth, [2.1, 1.2, 2.1], body, { r: [rx, 0, 0], t: 1.15 }),
                    P("tor", along(mouth, dir, 0.64), [2.3, 2.3, 1.6], ring, { r: [rx - PI / 2, 0, 0], t: 0.1 }),
                    P("cyl", along(mouth, dir, 0.66), [2.0, 0.04, 2.0], "#1c0a00", { r: [rx, 0, 0] }),
                    G("sph", along(mouth, dir, 0.72), [0.55, 0.55, 0.55], "#f97316"),
                    ...teethRing(12, 0.8, 0.8, 0.42),
                    ...teethRing(8, 0.45, 0.76, 0.3)
                  ],
                  idle: { r: [0.15, 0.1, 0], f: 0.8, ph: 1.4 },
                  atk: { r: [0.7, 0, 0], p: [0, 0, 0.4], d: 0.04 },
                  kids: pair({
                    at: [0.95, 0.55, 0.9],
                    parts: [P("cone", [0.1, 0, 0.5], [0.4, 1.6, 0.4], teeth, { r: [1.3, 0, 0] })],
                    idle: { r: [0, 0.1, 0], f: 1.6 },
                    atk: { r: [0, -0.6, 0] }
                  })
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

/** 17. Sunken Sphinx: a stone lion with a gold death-mask face, wings raised, a paw that swipes */
function sphinx(): BossRig {
  const stone = "#7c4a1e";
  const dark = "#3b2412";
  const gold = "#d4a017";
  const nemes = "#134e4a";
  const claws = "#1c1917";
  return {
    aura: "#059669",
    ember: "#6ee7b7",
    root: {
      at: [0, 0, 0],
      parts: [P("box", [0, 0.25, 0], [4.4, 0.5, 5.2], "#57534e"), P("dod", [1.9, 0.6, -2.0], [0.7, 0.7, 0.7], "#57534e")],
      kids: [
        {
          at: [0, 0.5, -0.4],
          parts: [
            P("box", [0, 0.85, 0], [2.2, 1.6, 3.2], stone),
            P("box", [0, 1.15, 1.35], [1.8, 1.6, 0.9], stone),
            ...sym(P("box", [0.7, 0.6, -1.0], [1.0, 1.3, 1.4], dark)),
            P("spike", [0, 1.95, -1.0], [0.3, 0.7, 0.3], dark, { r: [-0.4, 0, 0] }),
            P("spike", [0, 1.95, -0.3], [0.3, 0.7, 0.3], dark, { r: [-0.4, 0, 0] }),
            P("spike", [0, 1.95, 0.4], [0.3, 0.7, 0.3], dark, { r: [-0.4, 0, 0] })
          ],
          idle: { s: 0.03, f: 1.2 },
          atk: { p: [0, 0.1, 0.35], r: [0.12, 0, 0] },
          kids: [
            ...pair({
              at: [0.75, 0.25, 1.4],
              parts: [
                P("box", [0, 0.2, 0.6], [0.7, 0.5, 1.5], stone),
                P("spike", [-0.2, 0.15, 1.45], [0.12, 0.5, 0.12], claws, { r: [1.6, 0, 0] }),
                P("spike", [0, 0.15, 1.45], [0.12, 0.5, 0.12], claws, { r: [1.6, 0, 0] }),
                P("spike", [0.2, 0.15, 1.45], [0.12, 0.5, 0.12], claws, { r: [1.6, 0, 0] })
              ],
              idle: { r: [0.06, 0, 0], f: 0.8 },
              atk: { r: [-0.9, 0, 0], p: [0, 0.3, 0.2] }
            }),
            {
              at: [0, 1.9, 1.3],
              parts: [
                P("box", [0, 0.65, -0.15], [1.6, 1.5, 1.2], nemes),
                P("box", [0, 1.1, 0], [1.7, 0.18, 1.3], gold),
                P("box", [0, 0.55, 0.6], [1.0, 1.1, 0.5], "#1c1917"),
                P("cone", [0, 1.4, 0.5], [0.22, 0.5, 0.22], gold),
                P("box", [0, -0.3, 0.85], [0.25, 0.6, 0.25], nemes),
                ...sym(P("box", [0.62, -0.1, 0.15], [0.36, 1.0, 0.5], nemes), P("box", [0.24, 0.7, 0.88], [0.34, 0.24, 0.06], "#450a0a"))
              ],
              idle: { r: [0.08, 0.25, 0], f: 0.5 },
              atk: { r: [-0.3, 0, 0], p: [0, 0.2, 0.3], d: 0.02 },
              kids: [
                { at: [0, 0.7, 0.93], eye: true, parts: sym(G("sph", [0.24, 0, 0], [0.26, 0.18, 0.1], "#10b981")) },
                {
                  at: [0, 0.12, 0.6],
                  parts: [P("box", [0, -0.15, 0.05], [0.9, 0.3, 0.45], "#1c1917"), ...sym(P("spike", [0.25, 0.05, 0.22], [0.1, 0.3, 0.1], "#fefce8"))],
                  idle: { r: [0.04, 0, 0], f: 1.3 },
                  atk: { r: [0.55, 0, 0] }
                }
              ]
            },
            ...pair({
              at: [0.9, 1.6, -0.3],
              parts: [
                ...fan([0.1, 0.2, 0], -0.55, [-0.15, -0.35, -0.55, -0.75, -0.95], 2.8, 0.55, [gold, "#92400e", stone])
              ],
              idle: { r: [0.08, 0.1, 0.15], f: 0.7 },
              atk: { r: [0, 0, 0.5] }
            }),
            {
              at: [0, 1.0, -1.6],
              parts: [P("cyl", [0, 0.6, -0.5], [0.25, 1.6, 0.25], stone, { r: [-0.7, 0, 0] }), P("spike", [0, 1.25, -1.05], [0.3, 0.6, 0.3], dark, { r: [-0.7, 0, 0] })],
              idle: { r: [0, 0.4, 0.1], f: 0.9 },
              atk: { r: [0, 0.6, 0] }
            }
          ]
        }
      ]
    }
  };
}

/** 18. Dune Colossus Scorpion: black armour, snapping pincers and a venom-lit stinger that strikes over its back */
function scorpion(): BossRig {
  const shell = "#0f172a";
  const shell2 = "#1e293b";
  const joint = "#020617";
  const legZ = [0.8, 0.25, -0.3, -0.85];
  return {
    aura: "#16a34a",
    ember: "#86efac",
    root: {
      at: [0, 0, 0],
      parts: [P("cyl", [0, 0.05, 0], [5.6, 0.1, 5.6], "#a16207")],
      kids: [
        ...pair({
          at: [0.9, 0.9, 0],
          parts: legZ.flatMap((z) => [
            P("cyl", [0.5, 0.32, z], [0.2, 1.2, 0.2], shell2, { r: [0, 0, -1.0] }),
            P("cyl", [1.22, -0.12, z], [0.15, 1.6, 0.15], shell, { r: [0, 0, 0.28] })
          ]),
          idle: { r: [0, 0.06, 0.06], f: 2.2 },
          atk: { r: [0, 0, 0.1] }
        }),
        {
          at: [0, 0.9, 0],
          parts: [
            P("box", [0, 0, 0.3], [1.9, 0.8, 2.2], shell),
            P("box", [0, 0.45, 0.3], [1.6, 0.15, 1.9], "#334155"),
            P("box", [0, 0.05, 1.65], [1.3, 0.6, 0.7], shell2),
            P("box", [0, 0.05, -1.2], [1.6, 0.6, 1.0], shell2),
            ...sym(P("spike", [0.25, -0.2, 2.05], [0.12, 0.5, 0.12], joint, { r: [1.7, 0, 0] }))
          ],
          idle: { s: 0.025, f: 1.5 },
          atk: { p: [0, 0, 0.3], r: [0.08, 0, 0] },
          kids: [
            { at: [0, 0.45, 1.8], eye: true, parts: sym(G("sph", [0.2, 0, 0], [0.16, 0.16, 0.16], "#ef4444"), G("sph", [0.42, -0.05, -0.1], [0.12, 0.12, 0.12], "#ef4444")) },
            ...pair({
              at: [0.75, 0, 1.8],
              parts: [
                P("cyl", [0.24, 0, 0.44], [0.3, 1.0, 0.3], shell2, { r: [PI / 2, 0, -0.5] }),
                P("sph", [0.55, 0, 1.2], [0.75, 0.55, 1.1], shell2),
                P("cone", [0.4, 0, 1.95], [0.25, 0.9, 0.25], joint, { r: [PI / 2, 0, 0.2] })
              ],
              idle: { r: [0.06, 0.15, 0], f: 1.0 },
              atk: { r: [-0.3, -0.5, 0], d: 0.1 },
              kids: [
                {
                  at: [0.75, 0, 1.5],
                  parts: [P("cone", [0, 0, 0.4], [0.25, 0.9, 0.25], joint, { r: [PI / 2, 0, -0.15] })],
                  idle: { r: [0, 0.1, 0], f: 2.5 },
                  atk: { r: [0, -0.5, 0] }
                }
              ]
            }),
            {
              at: [0, 0.2, -1.7],
              r: [-0.6, 0, 0],
              parts: [P("box", [0, 0.45, 0], [0.75, 0.9, 0.7], shell2)],
              idle: { r: [-0.06, 0.08, 0], f: 1.1 },
              atk: { r: [0.25, 0, 0] },
              kids: [
                {
                  at: [0, 0.9, 0],
                  r: [0.7, 0, 0],
                  parts: [P("box", [0, 0.4, 0], [0.6, 0.8, 0.6], shell)],
                  idle: { r: [0.05, 0.06, 0], f: 1.1, ph: 0.5 },
                  atk: { r: [0.3, 0, 0], d: 0.02 },
                  kids: [
                    {
                      at: [0, 0.8, 0],
                      r: [0.8, 0, 0],
                      parts: [P("box", [0, 0.38, 0], [0.5, 0.75, 0.5], shell2)],
                      idle: { r: [0.06, 0.05, 0], f: 1.1, ph: 1.0 },
                      atk: { r: [0.4, 0, 0], d: 0.04 },
                      kids: [
                        {
                          at: [0, 0.75, 0],
                          r: [0.9, 0, 0],
                          parts: [
                            P("sph", [0, 0.35, 0], [0.6, 0.6, 0.6], "#14532d"),
                            P("cone", [0, 0.85, 0], [0.18, 0.7, 0.18], joint),
                            G("sph", [0, 0.35, 0.22], [0.3, 0.3, 0.3], "#22c55e")
                          ],
                          idle: { r: [0.08, 0, 0], f: 1.1, ph: 1.5 },
                          atk: { r: [0.6, 0, 0], d: 0.06 }
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

/** 19. Elder Treant: a rotting tree giant with a burning hollow face and branch arms that smash */
function treant(): BossRig {
  const bark = "#3f2a1d";
  const bark2 = "#5b3b22";
  const thorns = "#1c1917";
  const dead = "#292524";
  return {
    aura: "#b45309",
    ember: "#fbbf24",
    root: {
      at: [0, 0, 0],
      s0: 1.2,
      parts: [
        ...sym(P("cyl", [0.95, 0.25, 0.5], [0.45, 1.6, 0.45], bark2, { r: [0.4, 0, -1.2], t: 0.4 })),
        P("cyl", [0.2, 0.25, -1.15], [0.45, 1.6, 0.45], bark2, { r: [-1.2, 0, 0], t: 0.4 }),
        P("cyl", [-0.3, 0.25, 1.2], [0.4, 1.4, 0.4], bark2, { r: [1.2, 0, 0], t: 0.4 }),
        G("sph", [1.6, 0.15, 1.3], [0.35, 0.2, 0.35], "#b91c1c"),
        G("sph", [-1.7, 0.15, -0.9], [0.3, 0.18, 0.3], "#b91c1c")
      ],
      kids: [
        {
          at: [0, 0.3, 0],
          parts: [
            P("cyl", [0, 1.9, 0], [2.0, 3.8, 1.8], bark, { t: 0.7 }),
            P("box", [0, 3.0, 0.75], [1.3, 0.25, 0.4], dead),
            P("box", [0, 2.2, 0.62], [0.9, 0.5, 0.4], "#0c0a09"),
            G("box", [0, 2.2, 0.68], [0.6, 0.3, 0.4], "#ea580c"),
            ...sym(P("spike", [0.3, 2.42, 0.82], [0.1, 0.2, 0.1], thorns, { r: [PI, 0, 0] }), P("sph", [0.75, 1.3, 0.6], [0.5, 0.4, 0.4], "#365314"))
          ],
          idle: { r: [0.03, 0, 0.04], s: 0.02, f: 0.7 },
          atk: { r: [0.2, 0, 0] },
          kids: [
            { at: [0, 2.68, 0.8], eye: true, parts: sym(G("sph", [0.32, 0, 0], [0.3, 0.2, 0.2], "#f59e0b")) },
            {
              at: [0, 3.7, 0],
              parts: [
                P("sph", [0, 1.0, -0.3], [3.6, 2.2, 3.0], "#14532d"),
                P("sph", [1.15, 0.6, 0.4], [1.8, 1.5, 1.6], "#166534"),
                P("sph", [-1.2, 0.8, 0.2], [1.9, 1.4, 1.6], "#166534"),
                P("spike", [0.6, 2.3, -0.2], [0.15, 1.4, 0.15], dead, { r: [0, 0, -0.4] }),
                P("spike", [-0.8, 2.1, -0.5], [0.15, 1.2, 0.15], dead, { r: [-0.2, 0, 0.6] }),
                P("spike", [0.1, 2.3, 0.6], [0.12, 1.0, 0.12], dead, { r: [0.4, 0, 0] })
              ],
              idle: { r: [0.05, 0, 0.06], f: 0.6, ph: 0.5 },
              atk: { r: [0.15, 0, 0] }
            },
            ...pair({
              at: [0.85, 3.0, 0],
              parts: [
                P("cyl", [0.3, -0.7, 0], [0.6, 1.6, 0.6], bark2, { r: [0, 0, 0.35], t: 0.75 }),
                P("cyl", [0.55, -1.9, 0.3], [0.45, 1.4, 0.45], bark2, { r: [0.25, 0, 0.1], t: 0.7 }),
                P("spike", [0.45, -2.75, 0.45], [0.12, 0.7, 0.12], thorns, { r: [PI - 0.2, 0, 0] }),
                P("spike", [0.65, -2.75, 0.45], [0.12, 0.7, 0.12], thorns, { r: [PI - 0.2, 0, 0] }),
                P("spike", [0.85, -2.7, 0.4], [0.12, 0.7, 0.12], thorns, { r: [PI - 0.2, 0, 0] }),
                G("sph", [0.45, -0.5, 0.28], [0.3, 0.15, 0.3], "#b91c1c")
              ],
              idle: { r: [0.08, 0, 0.1], f: 0.8 },
              atk: { r: [-1.3, 0, 0.2], d: 0.02 }
            })
          ]
        }
      ]
    }
  };
}

/** 20. Fenrir Shadow Wolf: a black dire wolf bristling with spines, red eyes and a glowing maw that lunges */
function wolf(): BossRig {
  const fur = "#18181b";
  const fur2 = "#27272a";
  const mane = "#09090b";
  const fangs = "#fafaf9";
  const leg = (z: number, ph: number): BossBone[] =>
    pair({
      at: [0.6, -0.4, z],
      parts: [
        P("cyl", [0, -0.55, 0], [0.5, 1.2, 0.5], fur, { t: 1.2 }),
        P("box", [0, -1.18, 0.15], [0.55, 0.25, 0.75], fur2),
        P("spike", [-0.15, -1.2, 0.55], [0.07, 0.25, 0.07], "#e7e5e4", { r: [1.6, 0, 0] }),
        P("spike", [0.15, -1.2, 0.55], [0.07, 0.25, 0.07], "#e7e5e4", { r: [1.6, 0, 0] })
      ],
      idle: { r: [0.05, 0, 0], f: 1.3, ph },
      atk: z > 0 ? { r: [-0.5, 0, 0] } : { r: [0.2, 0, 0] }
    });
  return {
    aura: "#b91c1c",
    ember: "#f87171",
    root: {
      at: [0, 0, 0],
      s0: 1.1,
      parts: [],
      kids: [
        {
          at: [0, 1.7, -0.2],
          parts: [
            P("box", [0, 0.2, 0], [1.7, 1.4, 3.0], fur),
            P("box", [0, 0.25, 1.2], [1.9, 1.6, 1.2], fur2),
            P("box", [0, 0.15, -1.1], [1.8, 1.3, 1.1], fur2),
            ...[1.3, 0.7, 0.1, -0.5, -1.1].map((z, i) => P("spike", [0, 1.15, z], [0.35, 1.0 - i * 0.1, 0.35], mane, { r: [-0.5, 0, 0] })),
            ...sym(P("spike", [0.8, 1.0, 1.3], [0.3, 0.8, 0.3], mane, { r: [-0.4, 0, -0.6] }), P("spike", [0.85, 0.9, 0.5], [0.25, 0.6, 0.25], mane, { r: [-0.4, 0, -0.7] }))
          ],
          idle: { s: 0.035, f: 1.3 },
          atk: { p: [0, -0.15, 0.6], r: [0.12, 0, 0] },
          kids: [
            ...leg(1.2, 0),
            ...leg(-1.1, 1.5),
            {
              at: [0, 0.55, 1.75],
              parts: [
                P("box", [0, 0.25, 0.35], [1.2, 0.95, 1.1], fur),
                P("box", [0, 0, 1.15], [0.65, 0.5, 0.9], fur2),
                P("box", [0, 0.12, 1.65], [0.3, 0.18, 0.12], mane),
                ...sym(
                  P("spike", [0.38, 0.95, 0.15], [0.3, 0.7, 0.25], fur, { r: [-0.25, 0, -0.15] }),
                  P("box", [0.3, 0.6, 0.88], [0.45, 0.14, 0.2], mane, { r: [0, 0, 0.35] }),
                  P("spike", [0.22, -0.32, 1.45], [0.1, 0.35, 0.1], fangs, { r: [PI, 0, 0] })
                )
              ],
              idle: { r: [0.08, 0.25, 0], f: 0.6 },
              atk: { r: [0.25, 0, 0], p: [0, 0, 0.25], d: 0.03 },
              kids: [
                { at: [0, 0.45, 0.93], eye: true, parts: sym(G("sph", [0.3, 0, 0], [0.22, 0.14, 0.1], "#ef4444")) },
                {
                  at: [0, -0.2, 0.6],
                  parts: [P("box", [0, -0.12, 0.45], [0.6, 0.25, 1.0], fur2), G("box", [0, 0.06, 0.5], [0.4, 0.06, 0.6], "#dc2626"), ...sym(P("spike", [0.2, 0.1, 0.85], [0.09, 0.3, 0.09], fangs))],
                  idle: { r: [0.06, 0, 0], f: 1.0 },
                  atk: { r: [0.65, 0, 0], d: 0.02 }
                }
              ]
            },
            {
              at: [0, 0.7, -1.6],
              r: [-1.6, 0, 0],
              parts: [P("sph", [0, 0.8, 0], [0.6, 1.8, 0.6], fur), P("spike", [0, 1.75, 0], [0.4, 0.8, 0.4], mane)],
              idle: { r: [0.1, 0.4, 0], f: 1.0 },
              atk: { r: [-0.3, 0, 0] }
            }
          ]
        }
      ]
    }
  };
}

/** 21. Queen of the Fae Court: a floating thorn-crowned queen, insect wings thrumming, claws reaching */
function fae(): BossRig {
  const skin = "#ddd6fe";
  const claws = "#1e1b4b";
  return {
    aura: "#c026d3",
    ember: "#f0abfc",
    float: 0.6,
    root: {
      at: [0, 0, 0],
      parts: Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * PI * 2;
        return P("spike", [Math.sin(a) * 2.3, 0.45, Math.cos(a) * 2.3], [0.28, 0.9, 0.28], "#1e1b4b", { r: [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3] });
      }),
      kids: [
        {
          at: [0, 0.8, 0],
          parts: [
            P("cone", [0, 0.9, 0], [2.0, 2.4, 2.0], "#2e1065"),
            P("cyl", [0, 2.3, 0], [0.65, 1.0, 0.5], "#4c1d95", { t: 1.4 }),
            ...Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * PI * 2;
              return P("spike", [Math.sin(a) * 0.85, -0.1, Math.cos(a) * 0.85], [0.3, 0.8, 0.3], "#4c1d95", { r: [PI, 0, 0] });
            })
          ],
          idle: { r: [0.04, 0.1, 0.03], f: 0.7 },
          atk: { p: [0, 0.2, 0.4], r: [0.12, 0, 0] },
          kids: [
            {
              at: [0, 2.9, 0],
              parts: [
                P("sph", [0, 0.3, 0], [0.55, 0.7, 0.55], skin),
                P("cone", [0, -0.2, -0.22], [0.7, 1.4, 0.5], "#1e1b4b", { r: [PI - 0.2, 0, 0] }),
                P("spike", [0, 0.78, 0.1], [0.08, 0.5, 0.08], claws),
                ...sym(
                  P("cyl", [0.3, 0.8, 0], [0.08, 0.9, 0.08], "#3b0764", { r: [0, 0, -0.6] }),
                  P("spike", [0.55, 1.15, 0.05], [0.08, 0.5, 0.08], "#3b0764", { r: [0, 0, -0.2] }),
                  P("spike", [0.4, 1.2, 0], [0.07, 0.45, 0.07], "#3b0764", { r: [0, 0, 0.3] }),
                  P("spike", [0.2, 0.75, -0.1], [0.1, 1.2, 0.1], claws, { r: [-0.5, 0, -0.3] })
                )
              ],
              idle: { r: [0.08, 0.3, 0.06], f: 0.5 },
              atk: { r: [-0.25, 0, 0] },
              kids: [{ at: [0, 0.35, 0.25], eye: true, parts: sym(G("sph", [0.11, 0, 0], [0.14, 0.07, 0.06], "#f5d0fe")) }]
            },
            ...pair({
              at: [0.4, 2.6, 0],
              parts: [
                P("cyl", [0.25, -0.4, 0], [0.15, 0.9, 0.15], skin, { r: [0, 0, 0.5] }),
                P("cyl", [0.5, -0.95, 0.25], [0.12, 0.9, 0.12], skin, { r: [0.6, 0, 0.2] }),
                P("spike", [0.5, -1.35, 0.6], [0.05, 0.6, 0.05], claws, { r: [2.4, 0, 0] }),
                P("spike", [0.6, -1.35, 0.6], [0.05, 0.6, 0.05], claws, { r: [2.4, 0, 0] }),
                G("sph", [0.6, -1.3, 0.45], [0.3, 0.3, 0.3], "#d946ef")
              ],
              idle: { r: [0.1, 0, 0.1], f: 0.9 },
              atk: { r: [-1.2, 0, -0.3] }
            }),
            ...pair({
              at: [0.15, 2.5, -0.3],
              parts: [
                ...fan([0.05, 0.1, -0.05], -0.3, [-0.55, -0.9], 2.4, 0.9, ["#f472b6", "#a21caf"]),
                ...fan([0.05, -0.1, -0.05], -0.3, [-2.1, -2.5], 1.7, 0.7, ["#a21caf", "#f472b6"])
              ],
              idle: { r: [0, 0.45, 0.12], f: 3.0 },
              atk: { r: [0, 0.6, 0.4] }
            }),
            {
              at: [0, 1.8, 0],
              spin: 0.8,
              parts: Array.from({ length: 5 }, (_, i) => {
                const a = (i / 5) * PI * 2;
                return G("oct", [Math.sin(a) * 1.9, Math.sin(a * 2) * 0.3, Math.cos(a) * 1.9], [0.25, 0.25, 0.25], "#e879f9");
              }),
              idle: { p: [0, 0.25, 0], f: 1.4 }
            }
          ]
        }
      ]
    }
  };
}

/** 22. Ignis Molten Greatwyrm: a horned dragon on obsidian, wings spread, breathing fire when it strikes */
function dragon(): BossRig {
  const scale = "#7f1d1d";
  const scale2 = "#450a0a";
  const horn = "#1c1917";
  const fangs = "#fef3c7";
  return {
    aura: "#ea580c",
    ember: "#fb923c",
    root: {
      at: [0, 0, 0],
      parts: [
        P("cyl", [0, 0.45, 0], [5.0, 0.9, 4.6], "#18181b", { t: 0.8 }),
        G("cyl", [1.1, 0.93, 1.0], [0.8, 0.06, 0.6], "#ea580c"),
        G("cyl", [-1.3, 0.93, -0.7], [0.7, 0.06, 0.6], "#ea580c")
      ],
      kids: [
        {
          at: [0, 2.65, -0.4],
          parts: [
            P("sph", [0, 0, 0], [2.2, 1.8, 3.2], scale),
            P("sph", [0, -0.25, 0.35], [1.8, 1.3, 2.5], "#b45309"),
            ...[0.9, 0.3, -0.3, -0.9].map((z) => P("spike", [0, 0.95, z], [0.3, 0.7, 0.3], horn, { r: [-0.4, 0, 0] }))
          ],
          idle: { s: 0.035, f: 1.1 },
          atk: { r: [-0.15, 0, 0], p: [0, 0.25, 0.3] },
          kids: [
            ...pair({
              at: [0.8, -0.5, 0.9],
              parts: [
                P("cyl", [0, -0.55, 0.1], [0.45, 1.2, 0.45], scale2, { t: 1.2 }),
                P("box", [0, -1.15, 0.2], [0.5, 0.2, 0.6], scale2),
                P("spike", [-0.15, -1.15, 0.6], [0.08, 0.3, 0.08], horn, { r: [1.6, 0, 0] }),
                P("spike", [0.15, -1.15, 0.6], [0.08, 0.3, 0.08], horn, { r: [1.6, 0, 0] })
              ],
              idle: { r: [0.05, 0, 0], f: 1.1 },
              atk: { r: [-0.6, 0, 0] }
            }),
            ...pair({
              at: [0.85, -0.4, -1.0],
              parts: [P("cyl", [0, -0.65, 0], [0.7, 1.4, 0.7], scale2, { t: 1.1 }), P("box", [0, -1.25, 0.2], [0.6, 0.2, 0.7], scale2)],
              idle: { r: [0.03, 0, 0], f: 1.1, ph: 1.2 }
            }),
            {
              at: [0, 0.5, 1.4],
              r: [0.5, 0, 0],
              parts: [P("cyl", [0, 0.8, 0], [0.9, 1.8, 0.9], scale, { t: 0.75 }), P("spike", [0, 0.8, -0.45], [0.25, 0.6, 0.25], horn, { r: [-0.5, 0, 0] })],
              idle: { r: [0.06, 0.12, 0], f: 0.8 },
              atk: { r: [0.5, 0, 0], d: 0.02 },
              kids: [
                {
                  at: [0, 1.7, 0],
                  r: [-0.5, 0, 0],
                  parts: [
                    P("box", [0, 0.2, 0.4], [1.0, 0.8, 1.3], scale),
                    P("box", [0, 0.05, 1.3], [0.75, 0.5, 0.9], scale2),
                    ...sym(
                      G("sph", [0.2, 0.25, 1.72], [0.12, 0.1, 0.1], "#f97316"),
                      P("cone", [0.35, 0.65, -0.1], [0.22, 1.5, 0.22], horn, { r: [-1.1, 0, -0.25] }),
                      P("cone", [0.5, 0.4, 0], [0.16, 0.9, 0.16], horn, { r: [-1.4, 0, -0.6] }),
                      P("spike", [0.25, -0.28, 1.55], [0.1, 0.35, 0.1], fangs, { r: [PI, 0, 0] }),
                      P("box", [0.32, 0.5, 0.95], [0.4, 0.12, 0.4], scale2, { r: [0, 0, 0.35] })
                    )
                  ],
                  idle: { r: [0.1, 0.25, 0], f: 0.6 },
                  atk: { r: [0.3, 0, 0], p: [0, 0, 0.3], d: 0.04 },
                  kids: [
                    { at: [0, 0.4, 1.06], eye: true, parts: sym(G("sph", [0.36, 0, 0], [0.2, 0.12, 0.12], "#fde047")) },
                    {
                      at: [0, -0.2, 0.5],
                      parts: [P("box", [0, -0.15, 0.6], [0.7, 0.25, 1.4], scale2), G("box", [0, 0.03, 0.5], [0.45, 0.06, 1.0], "#f97316"), ...sym(P("spike", [0.22, 0.05, 1.1], [0.09, 0.3, 0.09], fangs))],
                      idle: { r: [0.05, 0, 0], f: 1.2 },
                      atk: { r: [0.6, 0, 0], d: 0.03 },
                      kids: [
                        {
                          at: [0, 0.05, 1.3],
                          s0: 0.01,
                          parts: [G("cone", [0, 0, 1.2], [1.0, 2.4, 1.0], "#f97316", { r: [-PI / 2, 0, 0] }), G("cone", [0, 0, 0.9], [0.55, 1.8, 0.55], "#fde047", { r: [-PI / 2, 0, 0] })],
                          atk: { s: 1.0, d: 0.02 }
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            ...pair({
              at: [0.8, 0.7, 0.2],
              parts: [
                P("cyl", [0.9, 0.6, 0], [0.22, 2.2, 0.22], scale2, { r: [0, 0, -1.0] }),
                ...fan([0.3, 0.3, 0], -PI / 2 + 0.45, [-1.75, -1.35, -0.95, -0.6], 3.4, 1.0, ["#991b1b", scale]),
                P("spike", [1.85, 1.5, 0], [0.15, 0.6, 0.15], horn, { r: [0, 0, -1.0] })
              ],
              idle: { r: [0.05, 0.1, 0.25], f: 1.4 },
              atk: { r: [0, 0, 0.5] }
            }),
            {
              at: [0, -0.1, -1.6],
              r: [-1.8, 0, 0],
              parts: [P("cyl", [0, 0.9, 0], [0.7, 1.8, 0.7], scale, { t: 0.55 })],
              idle: { r: [0.06, 0.35, 0], f: 0.9 },
              atk: { r: [-0.4, 0.5, 0] },
              kids: [
                {
                  at: [0, 1.75, 0],
                  r: [0.3, 0, 0],
                  parts: [P("cyl", [0, 0.8, 0], [0.4, 1.6, 0.4], scale, { t: 0.4 }), P("spike", [0, 1.75, 0], [0.5, 0.7, 0.12], horn)],
                  idle: { r: [0.05, 0.4, 0], f: 0.9, ph: 0.8 }
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

/** 23. Frost Titan Yeti: a hunched white titan with ice-spiked shoulders, curled horns and fists that smash */
function yeti(): BossRig {
  const fur = "#e2e8f0";
  const fur2 = "#cbd5e1";
  const skin = "#475569";
  const ice = "#7dd3fc";
  return {
    aura: "#0284c7",
    ember: "#e0f2fe",
    root: {
      at: [0, 0, 0],
      parts: [
        P("cyl", [0, 0.3, 0], [5.0, 0.6, 4.6], "#f1f5f9", { t: 0.8 }),
        P("spike", [1.9, 0.9, -1.0], [0.5, 1.4, 0.5], ice, { r: [0, 0, -0.3] }),
        P("spike", [-1.95, 0.8, 0.6], [0.4, 1.2, 0.4], "#38bdf8", { r: [0.2, 0, 0.4] }),
        P("spike", [1.5, 0.7, 1.5], [0.3, 0.8, 0.3], ice, { r: [0.3, 0, -0.2] })
      ],
      kids: [
        {
          at: [0, 1.2, 0],
          parts: [
            P("box", [0, 0.5, -0.2], [2.0, 1.2, 1.6], fur2),
            P("box", [0, 1.8, 0.1], [2.8, 1.8, 2.0], fur, { r: [0.25, 0, 0] }),
            P("spike", [0, 3.0, -0.8], [0.4, 1.2, 0.4], ice, { r: [-0.6, 0, 0] }),
            ...sym(
              P("cyl", [0.6, -0.2, -0.2], [0.8, 1.2, 0.8], fur2, { t: 1.1 }),
              P("sph", [1.1, 2.6, 0], [1.4, 1.1, 1.4], fur),
              P("spike", [0.65, 2.85, -0.8], [0.35, 1.0, 0.35], "#38bdf8", { r: [-0.5, 0, -0.4] }),
              P("spike", [1.25, 3.15, -0.2], [0.3, 0.8, 0.3], ice, { r: [-0.2, 0, -0.5] })
            )
          ],
          idle: { s: 0.04, f: 1.0 },
          atk: { r: [0.25, 0, 0], p: [0, -0.1, 0.3] },
          kids: [
            {
              at: [0, 2.55, 1.0],
              parts: [
                P("sph", [0, 0.25, 0.15], [1.1, 1.0, 1.0], fur),
                P("box", [0, 0.15, 0.55], [0.75, 0.7, 0.3], skin),
                P("box", [0, 0.5, 0.72], [0.85, 0.16, 0.2], fur2),
                ...sym(
                  P("cone", [0.5, 0.5, 0], [0.25, 1.0, 0.25], "#78716c", { r: [0.4, 0, -1.3] }),
                  P("cone", [0.95, 0.75, 0.2], [0.18, 0.7, 0.18], "#78716c", { r: [-0.3, 0, -0.3] }),
                  P("spike", [0.22, -0.15, 0.8], [0.12, 0.45, 0.12], "#f8fafc", { r: [0.2, 0, 0] })
                )
              ],
              idle: { r: [0.08, 0.3, 0.04], f: 0.55 },
              atk: { r: [-0.3, 0, 0], p: [0, 0.15, 0.2], d: 0.02 },
              kids: [
                { at: [0, 0.3, 0.73], eye: true, parts: sym(G("sph", [0.18, 0, 0], [0.16, 0.1, 0.08], "#22d3ee")) },
                {
                  at: [0, -0.15, 0.5],
                  parts: [P("box", [0, -0.15, 0.1], [0.65, 0.3, 0.45], skin), G("box", [0, 0.03, 0.1], [0.4, 0.06, 0.3], "#38bdf8")],
                  idle: { r: [0.04, 0, 0], f: 1.0 },
                  atk: { r: [0.5, 0, 0] }
                }
              ]
            },
            ...pair({
              at: [1.5, 2.4, 0.3],
              parts: [
                P("cyl", [0.25, -0.8, 0], [0.9, 1.8, 0.9], fur, { r: [0, 0, 0.25], t: 1.15 }),
                P("cyl", [0.45, -2.0, 0.3], [0.85, 1.4, 0.85], fur2, { r: [0.25, 0, 0.05], t: 1.1 }),
                P("box", [0.5, -2.85, 0.5], [0.9, 0.7, 0.9], skin),
                P("spike", [0.25, -2.85, 0.98], [0.18, 0.4, 0.18], ice, { r: [PI / 2, 0, 0] }),
                P("spike", [0.5, -2.8, 1.0], [0.18, 0.45, 0.18], ice, { r: [PI / 2, 0, 0] }),
                P("spike", [0.75, -2.85, 0.98], [0.18, 0.4, 0.18], ice, { r: [PI / 2, 0, 0] })
              ],
              idle: { r: [0.08, 0, 0.06], f: 1.0 },
              atk: { r: [-1.5, 0, 0.25] }
            })
          ]
        }
      ]
    }
  };
}

/** 24. Gorgon Stonecrusher: a serpent queen with a crown of snakes and petrifying eyes, swinging a stone maul over her victims */
function gorgon(): BossRig {
  const serpent = "#1a2e05";
  const skin = "#78716c";
  const armor = "#44403c";
  const statue = "#a8a29e";
  const snakes = Array.from({ length: 7 }, (_, k) => {
    const phi = -1.2 + k * 0.4;
    const rx = -0.5 - Math.cos(phi) * 0.3;
    const rz = -phi * 0.9;
    const base: Vec3 = [Math.sin(phi) * 0.3, 0.05, -0.12];
    const dir = axisOf(rx, rz);
    return [
      P("cyl", along(base, dir, 0.4), [0.1, 0.8, 0.1], "#4d7c0f", { r: [rx, 0, rz], t: 0.7 }),
      P("sph", along(base, dir, 0.85), [0.18, 0.14, 0.22], "#365314"),
      G("sph", along(along(base, dir, 0.85), [0, 0, 1], 0.1), [0.06, 0.06, 0.06], "#facc15")
    ];
  }).flat();
  return {
    aura: "#4d7c0f",
    ember: "#bef264",
    root: {
      at: [0, 0, 0],
      s0: 1.25,
      parts: [
        P("cyl", [0, 0.1, 0], [4.4, 0.2, 4.4], armor),
        P("box", [1.6, 0.65, 1.1], [0.4, 0.9, 0.3], statue),
        P("sph", [1.6, 1.27, 1.1], [0.32, 0.34, 0.32], statue),
        P("cyl", [1.78, 1.3, 1.1], [0.1, 0.6, 0.1], statue, { r: [0, 0, -0.4] }),
        P("box", [-1.7, 0.45, -0.7], [0.45, 0.7, 0.35], statue),
        P("sph", [-1.7, 0.95, -0.62], [0.32, 0.34, 0.32], statue)
      ],
      kids: [
        {
          at: [0, 0.2, 0],
          parts: [
            P("tor", [0, 0.35, 0], [3.0, 3.0, 1.6], serpent, { r: [PI / 2, 0, 0], t: 0.18 }),
            P("tor", [0, 0.85, -0.1], [2.2, 2.2, 1.4], "#365314", { r: [PI / 2, 0, 0], t: 0.18 }),
            P("cone", [1.6, 0.3, -0.9], [0.3, 1.2, 0.3], serpent, { r: [0, 0, -1.4] })
          ],
          idle: { r: [0, 0.06, 0], s: 0.02, f: 0.8 }
        },
        {
          at: [0, 1.2, 0],
          parts: [
            P("cyl", [0, 0.6, 0], [1.2, 1.4, 1.0], serpent, { t: 0.8 }),
            P("cyl", [0, 1.75, 0.05], [1.2, 1.2, 0.8], skin, { t: 1.4 }),
            P("box", [0, 1.8, 0.4], [0.9, 0.7, 0.3], armor),
            ...sym(P("sph", [0.8, 2.3, 0], [0.7, 0.5, 0.7], armor), P("spike", [0.95, 2.6, 0], [0.15, 0.5, 0.15], "#1c1917", { r: [0, 0, -0.4] }))
          ],
          idle: { r: [0.04, 0.08, 0.03], s: 0.02, f: 0.9 },
          atk: { r: [-0.2, 0, 0], p: [0, 0.15, 0.25] },
          kids: [
            {
              at: [0, 2.55, 0.05],
              parts: [P("sph", [0, 0.35, 0], [0.7, 0.85, 0.7], skin), ...sym(P("spike", [0.08, 0.12, 0.33], [0.05, 0.16, 0.05], "#f5f5f4", { r: [PI, 0, 0] }))],
              idle: { r: [0.1, 0.3, 0.05], f: 0.55 },
              atk: { r: [-0.35, 0, 0], d: 0.02 },
              kids: [
                { at: [0, 0.42, 0.32], eye: true, parts: sym(G("sph", [0.14, 0, 0], [0.18, 0.1, 0.08], "#84cc16")) },
                { at: [0, 0.55, -0.05], parts: snakes, idle: { r: [0.12, 0.2, 0.1], f: 2.4 }, atk: { r: [-0.4, 0, 0] } }
              ]
            },
            {
              at: [0.75, 2.2, 0.1],
              parts: [
                P("cyl", [0.15, -0.5, 0.1], [0.32, 1.1, 0.32], skin, { r: [0.15, 0, 0.25] }),
                P("cyl", [0.3, -1.1, 0.55], [0.28, 0.9, 0.28], skin, { r: [1.2, 0, 0] }),
                P("cyl", [0.3, -0.6, 1.0], [0.16, 2.6, 0.16], "#292524"),
                P("box", [0.3, 0.9, 1.0], [0.9, 0.8, 1.3], "#57534e"),
                P("box", [0.3, 0.9, 1.0], [1.0, 0.9, 0.45], "#292524"),
                G("box", [0.3, 0.9, 1.69], [0.4, 0.4, 0.08], "#84cc16")
              ],
              idle: { r: [0.06, 0, 0.05], f: 0.9 },
              atk: { r: [1.4, 0, 0] }
            },
            {
              at: [-0.75, 2.2, 0.1],
              parts: [
                P("cyl", [-0.15, -0.5, 0.1], [0.32, 1.1, 0.32], skin, { r: [0.15, 0, -0.25] }),
                P("cyl", [-0.3, -1.1, 0.5], [0.28, 0.9, 0.28], skin, { r: [1.0, 0, 0] }),
                P("spike", [-0.42, -1.25, 1.0], [0.06, 0.4, 0.06], "#1c1917", { r: [1.4, 0, 0] }),
                P("spike", [-0.3, -1.22, 1.02], [0.06, 0.4, 0.06], "#1c1917", { r: [1.4, 0, 0] }),
                P("spike", [-0.18, -1.25, 1.0], [0.06, 0.4, 0.06], "#1c1917", { r: [1.4, 0, 0] })
              ],
              idle: { r: [0.06, 0, -0.05], f: 0.9, ph: 1.0 },
              atk: { r: [-1.0, 0, -0.3], d: 0.15 }
            }
          ]
        }
      ]
    }
  };
}

export const BOSS_RIGS: Record<string, BossRig> = {
  "boss-kraken": kraken(),
  "boss-leviathan": leviathan(),
  "boss-siren": siren(),
  "boss-sandworm": sandworm(),
  "boss-sphinx": sphinx(),
  "boss-scorpion": scorpion(),
  "boss-treant": treant(),
  "boss-wolf": wolf(),
  "boss-fae": fae(),
  "boss-dragon": dragon(),
  "boss-yeti": yeti(),
  "boss-gorgon": gorgon()
};

/* ------------------------------ legendary sites ------------------------------ */

const ring = (n: number, radius: number, y: (i: number) => number, make: (p: Vec3, i: number) => BossPart): BossPart[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * PI * 2;
    return make([Math.sin(a) * radius, y(i), Math.cos(a) * radius], i);
  });

/** Volcanic Dragonstone Core: a smoking vent with a beating dragonstone heart, orbiting shards and a dragon's skull on its slope */
function dragonstone(): BossRig {
  const rock = "#1c1917";
  const lava = "#f97316";
  const bone = "#e7e5e4";
  return {
    aura: "#ea580c",
    ember: "#fdba74",
    beam: "#f59e0b",
    still: true,
    root: {
      at: [0, 0, 0],
      parts: [
        P("cyl", [0, 0.9, 0], [4.6, 1.8, 4.6], rock, { t: 0.35 }),
        G("cyl", [0, 1.83, 0], [1.5, 0.06, 1.5], lava),
        G("tor", [0, 1.85, 0], [1.7, 1.7, 0.5], "#fbbf24", { r: [PI / 2, 0, 0], t: 0.08 }),
        G("box", [0, 0.9, 1.58], [0.22, 2.2, 0.08], lava, { r: [-0.69, 0, 0] }),
        G("box", [0, 0.9, -1.58], [0.2, 2.2, 0.08], lava, { r: [0.69, 0, 0] }),
        G("box", [1.58, 0.9, 0], [0.08, 2.2, 0.2], lava, { r: [0, 0, 0.69] }),
        G("box", [-1.58, 0.9, 0], [0.08, 2.2, 0.22], lava, { r: [0, 0, -0.69] }),
        P("dod", [1.95, 0.35, 0.9], [0.9, 0.9, 0.9], "#292524"),
        P("dod", [2.0, 0.3, -1.0], [0.7, 0.7, 0.7], "#292524"),
        // A dragon's skull half buried on the front slope, its sockets still burning
        P("sph", [-1.5, 0.55, 1.35], [0.9, 0.7, 1.1], bone),
        P("box", [-1.5, 0.4, 1.95], [0.55, 0.35, 0.7], "#d6d3d1"),
        P("cone", [-1.8, 0.95, 1.1], [0.15, 0.8, 0.15], "#a8a29e", { r: [-0.9, 0, 0.5] }),
        P("cone", [-1.2, 0.95, 1.1], [0.15, 0.8, 0.15], "#a8a29e", { r: [-0.9, 0, -0.5] }),
        G("sph", [-1.68, 0.62, 1.82], [0.15, 0.1, 0.1], lava),
        G("sph", [-1.32, 0.62, 1.82], [0.15, 0.1, 0.1], lava)
      ],
      kids: [
        {
          at: [0, 1.9, 0],
          parts: [
            G("oct", [0, 1.1, 0], [1.1, 2.4, 1.1], "#dc2626"),
            G("oct", [0.55, 0.7, 0.2], [0.6, 1.5, 0.6], "#b91c1c", { r: [0, 0, -0.4] }),
            G("oct", [-0.5, 0.6, -0.25], [0.55, 1.3, 0.55], "#ef4444", { r: [0.2, 0, 0.45] }),
            G("oct", [0.1, 0.5, 0.55], [0.45, 1.1, 0.45], lava, { r: [0.5, 0, 0] })
          ],
          // A slow heartbeat
          idle: { s: 0.06, f: 2.4 }
        },
        {
          at: [0, 2.6, 0],
          spin: 0.6,
          parts: ring(5, 1.9, (i) => (i % 2) * 0.6, (p) => G("oct", p, [0.3, 0.6, 0.3], "#f87171")),
          idle: { p: [0, 0.25, 0], f: 1.1 }
        }
      ]
    }
  };
}

/** King's Motherlode Treasury Mine: a gilded royal mine, gold veins in the rock, a rocking ore cart, orbiting coins and a crown */
function motherlode(): BossRig {
  const gold = "#fbbf24";
  const frame = "#d4a017";
  return {
    aura: "#f59e0b",
    ember: "#fde68a",
    beam: "#fbbf24",
    still: true,
    root: {
      at: [0, 0, 0],
      parts: [
        P("sph", [0, -0.6, -0.7], [4.6, 4.2, 3.6], "#57534e"),
        P("dod", [1.9, 0.5, 0.3], [1.0, 1.0, 1.0], "#44403c"),
        P("dod", [-2.0, 0.4, 0.6], [0.9, 0.9, 0.9], "#44403c"),
        P("box", [0, 0.85, 0.95], [1.5, 1.7, 0.3], "#0c0a09"),
        P("box", [-0.85, 0.95, 1.05], [0.22, 1.9, 0.3], frame),
        P("box", [0.85, 0.95, 1.05], [0.22, 1.9, 0.3], frame),
        P("box", [0, 1.95, 1.05], [2.1, 0.25, 0.3], frame),
        G("spike", [0, 2.35, 1.05], [0.5, 0.55, 0.3], gold),
        G("box", [1.15, 1.25, 0.45], [0.12, 1.3, 0.1], gold, { r: [0.3, 0, 0.6] }),
        G("box", [-1.2, 1.1, 0.4], [0.12, 1.1, 0.1], gold, { r: [0.3, 0, -0.5] }),
        G("box", [0.5, 2.0, -0.2], [0.1, 1.0, 0.1], gold, { r: [-0.4, 0, 0.9] }),
        G("oct", [1.4, 1.6, 0.2], [0.25, 0.4, 0.25], "#e0f2fe"),
        G("oct", [-1.0, 1.9, 0.0], [0.25, 0.4, 0.25], "#e0f2fe"),
        // Rails out of the mine
        P("box", [-0.35, 0.06, 2.0], [0.08, 0.06, 2.0], "#57534e"),
        P("box", [0.35, 0.06, 2.0], [0.08, 0.06, 2.0], "#57534e"),
        ...[1.3, 1.8, 2.3, 2.8].map((z) => P("box", [0, 0.02, z], [0.9, 0.04, 0.15], "#78350f")),
        // Heaps of coin either side
        ...sym(G("cyl", [1.4, 0.2, 1.7], [0.9, 0.4, 0.9], gold, { t: 0.6 }), G("cone", [1.4, 0.55, 1.7], [0.55, 0.3, 0.55], gold))
      ],
      kids: [
        {
          at: [0, 0.1, 2.2],
          parts: [
            P("box", [0, 0.4, 0], [0.9, 0.55, 1.0], "#44403c"),
            G("sph", [0, 0.72, 0], [0.8, 0.45, 0.9], gold),
            G("oct", [0.15, 0.95, 0.1], [0.2, 0.3, 0.2], "#e0f2fe"),
            ...sym(P("cyl", [0.48, 0.15, 0.3], [0.3, 0.08, 0.3], "#1c1917", { r: [0, 0, PI / 2] }), P("cyl", [0.48, 0.15, -0.3], [0.3, 0.08, 0.3], "#1c1917", { r: [0, 0, PI / 2] }))
          ],
          idle: { p: [0, 0, 0.12], f: 0.6 }
        },
        {
          at: [0, 2.9, 0.9],
          spin: 0.7,
          parts: [
            G("cyl", [0, 0, 0], [0.9, 0.4, 0.9], gold, { t: 1.15 }),
            ...ring(5, 0.46, () => 0.35, (p) => G("spike", p, [0.14, 0.35, 0.14], gold)),
            G("sph", [0, 0, 0.5], [0.16, 0.16, 0.1], "#ef4444"),
            G("sph", [0, 0, -0.5], [0.16, 0.16, 0.1], "#3b82f6")
          ],
          idle: { p: [0, 0.2, 0], f: 1.2 }
        },
        {
          at: [0, 1.2, 0.6],
          spin: 1.2,
          parts: ring(6, 1.6, (i) => (i % 3) * 0.35, (p) => G("cyl", p, [0.3, 0.05, 0.3], gold, { r: [PI / 2, 0, 0] })),
          idle: { p: [0, 0.2, 0], f: 1.5 }
        }
      ]
    }
  };
}

/** Ancient Nethergarde Relic Hoard: a void chest floating over a rune dais, its lid breathing open, void rings turning round it */
function relicHoard(): BossRig {
  const chest = "#1e1b4b";
  const gold = "#fbbf24";
  return {
    aura: "#9333ea",
    ember: "#e9d5ff",
    beam: "#c084fc",
    still: true,
    root: {
      at: [0, 0, 0],
      parts: [
        P("cyl", [0, 0.15, 0], [2.8, 0.3, 2.8], chest),
        P("cyl", [0, 0.45, 0], [1.8, 0.3, 1.8], "#312e81"),
        G("tor", [0, 0.33, 0], [2.4, 2.4, 0.5], "#c084fc", { r: [PI / 2, 0, 0], t: 0.04 }),
        ...ring(4, 1.25, () => 0.9, (p) => P("spike", p, [0.25, 1.2, 0.25], "#0f0a2e")),
        ...ring(4, 1.25, () => 1.6, (p) => G("sph", p, [0.18, 0.18, 0.18], "#e879f9"))
      ],
      kids: [
        {
          at: [0, 1.3, 0],
          parts: [
            P("box", [0, 0.3, 0], [1.1, 0.6, 0.75], chest),
            P("box", [0, 0.3, 0], [1.2, 0.7, 0.15], gold),
            P("box", [0.35, 0.3, 0], [0.15, 0.7, 0.85], gold),
            P("box", [-0.35, 0.3, 0], [0.15, 0.7, 0.85], gold),
            G("box", [0, 0.35, 0.42], [0.2, 0.25, 0.1], "#e879f9"),
            G("box", [0, 0.69, 0], [0.95, 0.04, 0.6], "#f0abfc"),
            G("sph", [0, 0.72, 0], [0.7, 0.3, 0.45], gold)
          ],
          idle: { p: [0, 0.18, 0], r: [0, 0.25, 0], f: 1.0 },
          kids: [
            {
              at: [0, 0.6, -0.375],
              // The lid breathes open, showing the glow inside
              r: [-0.35, 0, 0],
              parts: [P("box", [0, 0.12, 0.375], [1.1, 0.24, 0.75], "#312e81"), P("box", [0, 0.12, 0.375], [1.2, 0.3, 0.15], gold)],
              idle: { r: [-0.25, 0, 0], f: 1.6 }
            }
          ]
        },
        { at: [0, 1.6, 0], r: [0.5, 0, 0.3], spin: 0.9, parts: [G("tor", [0, 0, 0], [2.6, 2.6, 2.6], "#a855f7", { t: 0.025 })] },
        { at: [0, 1.6, 0], r: [-0.6, 0, -0.2], spin: -0.7, parts: [G("tor", [0, 0, 0], [2.2, 2.2, 2.2], "#22d3ee", { t: 0.025 })] },
        {
          at: [0, 1.5, 0],
          spin: 0.5,
          parts: ring(6, 1.7, (i) => (i % 2) * 0.5, (p) => G("oct", p, [0.25, 0.45, 0.25], "#a5f3fc")),
          idle: { p: [0, 0.2, 0], f: 1.3 }
        }
      ]
    }
  };
}

/** The Nethergarde Core: a void heart beating over a pool of night, ringed by obsidian monoliths, rings and rocks wheeling round it */
function netherCore(): BossRig {
  const obsidian = "#18181b";
  return {
    aura: "#7c3aed",
    ember: "#c4b5fd",
    beam: "#a855f7",
    still: true,
    root: {
      at: [0, 0, 0],
      parts: [
        P("cyl", [0, 0.2, 0], [4.4, 0.4, 4.4], "#0f0a1e"),
        G("cyl", [0, 0.43, 0], [3.6, 0.06, 3.6], "#4c1d95"),
        ...ring(6, 2.2, () => 1.5, (p, i) => P("spike", p, [0.5, 2.6, 0.5], obsidian, { r: [Math.cos((i / 6) * PI * 2) * 0.15, 0, -Math.sin((i / 6) * PI * 2) * 0.15] })),
        ...ring(6, 2.5, () => 1.2, (p) => G("box", p, [0.12, 0.5, 0.12], "#c084fc"))
      ],
      kids: [
        {
          at: [0, 2.7, 0],
          parts: [
            G("oct", [0, 0, 0], [1.4, 2.0, 1.4], "#c026d3"),
            ...ring(6, 0.75, () => 0, (p, i) => P("spike", p, [0.25, 1.0, 0.25], "#0c0a09", { r: [PI / 2, (i / 6) * PI * 2, 0] })),
            P("spike", [0, 1.1, 0], [0.3, 0.9, 0.3], "#0c0a09"),
            P("spike", [0, -1.1, 0], [0.3, 0.9, 0.3], "#0c0a09", { r: [PI, 0, 0] })
          ],
          // Heartbeat
          idle: { s: 0.08, f: 1.8 }
        },
        { at: [0, 2.7, 0], r: [0.6, 0, 0.2], spin: 0.8, parts: [G("tor", [0, 0, 0], [3.0, 3.0, 3.0], "#8b5cf6", { t: 0.03 })] },
        { at: [0, 2.7, 0], r: [-0.4, 0, 0.7], spin: -0.6, parts: [G("tor", [0, 0, 0], [2.4, 2.4, 2.4], "#22d3ee", { t: 0.03 })] },
        { at: [0, 2.7, 0], r: [1.2, 0, -0.3], spin: 1.1, parts: [G("tor", [0, 0, 0], [1.9, 1.9, 1.9], "#e879f9", { t: 0.03 })] },
        {
          at: [0, 2.0, 0],
          spin: -0.3,
          parts: ring(5, 2.9, (i) => (i % 2) * 0.9, (p) => P("dod", p, [0.55, 0.55, 0.55], "#27272a")),
          idle: { p: [0, 0.3, 0], f: 0.9 }
        },
        {
          at: [0, 2.7, 0],
          spin: 0.5,
          parts: ring(6, 1.6, (i) => (i % 2 ? 0.5 : -0.5), (p) => G("oct", p, [0.2, 0.4, 0.2], "#e9d5ff"))
        }
      ]
    }
  };
}

/** How high the ascended Eye floats over the Archon's citadel (the Empyrean's crown is ~9 units up on the map) */
const ASCENDED_EYE_FLOAT = 11.5;

/**
 * The Nethergarde Core with the Archon of the Realm seated beneath it: the Eye has risen off the ground and floats
 * over the Empyrean citadel like a lodestone, a beam of light running from it down into the citadel's crown and its
 * obsidian monoliths wheeling wide round both. The ground aura and embers stay round the citadel's base.
 */
function netherCoreAscended(): BossRig {
  const core = netherCore();
  return {
    ...core,
    float: ASCENDED_EYE_FLOAT,
    root: {
      at: [0, 0, 0],
      parts: [G("cyl", [0, -0.35, 0], [0.22, 4.1, 0.22], "#f5d0fe")],
      kids: [
        ...(core.root.kids ?? []),
        {
          at: [0, -1.2, 0],
          spin: 0.16,
          parts: [
            ...ring(6, 4.2, (i) => (i % 2) * 1.1, (p, i) => P("spike", p, [0.5, 2.4, 0.5], i % 2 ? "#18181b" : "#27272a", { r: [PI, 0, 0] })),
            ...ring(6, 4.2, (i) => (i % 2) * 1.1 + 1.45, (p) => G("oct", p, [0.2, 0.32, 0.2], "#c084fc"))
          ],
          idle: { p: [0, 0.35, 0], f: 0.6 }
        }
      ]
    }
  };
}

type Weapon = "axe" | "spear" | "torch" | "crossbow";

/** Weapon parts in a henchman's arm space (the hand is near [0.08, -0.35, 0.25]) */
function weaponParts(w: Weapon): BossPart[] {
  const wood = "#78350f";
  switch (w) {
    case "axe":
      return [P("cyl", [0.08, -0.1, 0.3], [0.06, 0.8, 0.06], wood, { r: [0.4, 0, 0] }), P("box", [0.08, 0.25, 0.45], [0.04, 0.25, 0.3], "#a8a29e", { r: [0.4, 0, 0] })];
    case "spear":
      return [P("cyl", [0.08, 0.2, 0.35], [0.05, 1.6, 0.05], wood, { r: [0.3, 0, 0] }), P("spike", [0.08, 1.0, 0.6], [0.08, 0.25, 0.08], "#d6d3d1", { r: [0.3, 0, 0] })];
    case "torch":
      return [P("cyl", [0.08, -0.05, 0.3], [0.06, 0.6, 0.06], wood), G("sph", [0.08, 0.32, 0.3], [0.18, 0.25, 0.18], "#f97316")];
    case "crossbow":
      return [P("box", [0.08, -0.3, 0.45], [0.1, 0.1, 0.55], wood), P("box", [0.08, -0.3, 0.7], [0.6, 0.05, 0.06], "#44403c")];
  }
}

/** One of the Bandit King's hooded henchmen, at ground level, turned `ry` */
function henchman(at: Vec3, ry: number, cloak: string, weapon: Weapon, ph: number): BossBone {
  const leather = "#292524";
  return {
    at,
    r: [0, ry, 0],
    parts: [
      ...sym(P("cyl", [0.12, 0.35, 0], [0.16, 0.7, 0.16], "#1c1917")),
      P("cone", [0, 0.85, -0.08], [0.6, 1.0, 0.45], cloak),
      P("cyl", [0, 0.95, 0], [0.45, 0.6, 0.32], leather, { t: 1.2 }),
      P("sph", [0, 1.42, 0.02], [0.3, 0.32, 0.3], "#c08a5b"),
      P("cone", [0, 1.56, -0.02], [0.4, 0.45, 0.38], cloak),
      P("box", [0, 1.38, 0.16], [0.26, 0.1, 0.04], "#0c0a09"),
      G("sph", [0.06, 1.46, 0.15], [0.05, 0.03, 0.03], "#ef4444"),
      G("sph", [-0.06, 1.46, 0.15], [0.05, 0.03, 0.03], "#ef4444")
    ],
    idle: { s: 0.03, f: 1.6, ph },
    atk: { p: [0, 0, 0.2], d: ph * 0.05 },
    kids: [
      {
        at: [0.25, 1.15, 0],
        parts: [P("cyl", [0.05, -0.2, 0.08], [0.1, 0.45, 0.1], leather, { r: [0.6, 0, 0.2] }), ...weaponParts(weapon)],
        idle: { r: [0.1, 0, 0], f: 1.2, ph },
        atk: { r: weapon === "crossbow" ? [-0.3, 0, 0] : [-1.2, 0, 0], d: 0.05 + ph * 0.05 }
      }
    ]
  };
}

/** The Bandit King's war hound */
function warHound(at: Vec3, ry: number): BossBone {
  const fur = "#3f3f46";
  return {
    at,
    r: [0, ry, 0],
    parts: [
      ...sym(P("cyl", [0.12, 0.2, 0.3], [0.1, 0.4, 0.1], fur), P("cyl", [0.12, 0.2, -0.3], [0.1, 0.4, 0.1], fur)),
      P("box", [0, 0.5, 0], [0.38, 0.36, 0.95], fur),
      P("spike", [0, 0.75, -0.1], [0.12, 0.25, 0.4], "#18181b", { r: [-0.6, 0, 0] }),
      P("cyl", [0, 0.55, -0.6], [0.08, 0.5, 0.08], fur, { r: [-0.9, 0, 0] })
    ],
    idle: { s: 0.04, f: 2.2 },
    atk: { p: [0, 0, 0.45] },
    kids: [
      {
        at: [0, 0.7, 0.5],
        parts: [
          P("box", [0, 0.05, 0.1], [0.32, 0.3, 0.35], fur),
          P("box", [0, -0.02, 0.36], [0.18, 0.16, 0.25], "#27272a"),
          ...sym(P("spike", [0.1, 0.25, 0.02], [0.08, 0.18, 0.06], fur), G("sph", [0.09, 0.1, 0.27], [0.05, 0.04, 0.03], "#ef4444"))
        ],
        idle: { r: [0.1, 0.3, 0], f: 0.9 },
        atk: { r: [0.3, 0, 0] }
      }
    ]
  };
}

/** Vargo Blackfang, the Bandit King (Codex teaser, not in the game yet): a bone-masked warlord on a mound of plunder with his warband, twin crimson sabers, crows circling */
function banditKing(): BossRig {
  const leather = "#292524";
  const cloak = "#7f1d1d";
  const gold = "#fbbf24";
  const blade = "#ef4444";
  return {
    aura: "#b91c1c",
    ember: "#fbbf24",
    beam: "#ef4444",
    root: {
      at: [0, 0, 0],
      parts: [
        // His plunder: a heap of loot, coin, chests and an unlucky rival's skull
        P("sph", [0, 0.1, 0], [2.6, 0.9, 2.4], "#78350f"),
        G("cyl", [0.6, 0.42, 0.55], [0.5, 0.2, 0.5], gold, { t: 0.7 }),
        G("cyl", [-0.45, 0.42, 0.7], [0.4, 0.18, 0.4], gold, { t: 0.7 }),
        P("box", [-0.8, 0.4, 0.2], [0.6, 0.4, 0.45], "#451a03", { r: [0, 0.4, 0] }),
        P("box", [0.85, 0.4, -0.4], [0.55, 0.4, 0.4], "#451a03", { r: [0, -0.5, 0] }),
        G("oct", [0.95, 0.65, 0.15], [0.18, 0.28, 0.18], "#60a5fa"),
        G("oct", [-0.95, 0.7, -0.2], [0.18, 0.28, 0.18], "#4ade80"),
        P("sph", [0.3, 0.5, 0.95], [0.26, 0.24, 0.26], "#e7e5e4"),
        // His war banner
        P("cyl", [-0.85, 1.8, -0.7], [0.08, 3.4, 0.08], "#1c1917")
      ],
      kids: [
        // His warband: four hooded henchmen and a war hound
        henchman([1.95, 0, 0.85], 0.35, "#7f1d1d", "axe", 0),
        henchman([-1.95, 0, 0.85], -0.35, "#3f1d0b", "spear", 1),
        henchman([1.75, 0, -1.15], 0.9, "#3f1d0b", "torch", 2),
        henchman([-1.7, 0, -1.2], -0.9, "#7f1d1d", "crossbow", 3),
        warHound([0.45, 0, 1.85], 0.1),
        {
          at: [-0.85, 3.3, -0.7],
          parts: [P("box", [0.55, -0.35, 0], [1.0, 0.75, 0.04], "#991b1b"), P("sph", [0.55, -0.35, 0.05], [0.28, 0.28, 0.06], "#e7e5e4")],
          idle: { r: [0, 0.3, 0.06], f: 2.2 }
        },
        {
          at: [0, 0.5, 0],
          parts: [
            ...sym(
              P("cyl", [0.3, 0.7, 0], [0.35, 1.4, 0.35], "#1c1917", { t: 0.9 }),
              P("box", [0.3, 0.08, 0.08], [0.4, 0.25, 0.55], leather),
              P("sph", [0.55, 2.4, 0], [0.5, 0.35, 0.5], "#3f3f46"),
              P("spike", [0.65, 2.65, 0], [0.12, 0.35, 0.12], "#a8a29e", { r: [0, 0, -0.4] })
            ),
            P("cone", [0, 1.5, -0.12], [1.7, 2.4, 1.3], cloak),
            P("cyl", [0, 1.9, 0.05], [0.9, 1.1, 0.6], leather, { t: 1.3 }),
            P("box", [0, 1.9, 0.33], [0.15, 1.2, 0.1], "#b91c1c", { r: [0, 0, 0.6] }),
            G("box", [0, 1.45, 0.36], [0.22, 0.18, 0.08], gold)
          ],
          idle: { s: 0.03, f: 1.3 },
          atk: { p: [0, 0, 0.3], r: [0.1, 0, 0] },
          kids: [
            {
              at: [0, 2.55, 0.05],
              parts: [
                P("cone", [0, 0.35, -0.05], [0.75, 1.0, 0.7], "#450a0a"),
                P("sph", [0, 0.25, 0.12], [0.45, 0.5, 0.4], "#e7e5e4"),
                P("box", [0, 0.1, 0.3], [0.42, 0.18, 0.06], "#0c0a09"),
                // A stolen crown, worn askew
                G("cyl", [0.05, 0.78, 0], [0.45, 0.18, 0.45], gold, { r: [0, 0, 0.2], t: 1.15 })
              ],
              idle: { r: [0.08, 0.3, 0], f: 0.6 },
              atk: { r: [0.15, 0, 0], d: 0.02 },
              kids: [{ at: [0, 0.32, 0.31], eye: true, parts: sym(G("sph", [0.09, 0, 0], [0.1, 0.06, 0.05], "#ef4444")) }]
            },
            ...pair({
              at: [0.6, 2.25, 0],
              parts: [
                P("cyl", [0.12, -0.4, 0.05], [0.25, 0.9, 0.25], leather, { r: [0.1, 0, 0.25] }),
                P("cyl", [0.2, -0.9, 0.35], [0.22, 0.8, 0.22], "#1c1917", { r: [1.0, 0, 0] }),
                G("box", [0.2, -1.1, 0.68], [0.35, 0.06, 0.1], gold, { r: [0.5, 0, 0] }),
                G("blade", [0.2, -0.45, 1.03], [0.18, 1.6, 0.04], blade, { r: [0.5, 0, 0] })
              ],
              idle: { r: [0.08, 0, 0.06], f: 1.0 },
              // Both sabers come down in a crossing slash
              atk: { r: [-1.3, 0, -0.5] }
            })
          ]
        },
        {
          at: [0, 4.4, 0],
          spin: 0.9,
          parts: Array.from({ length: 4 }, (_, i) => {
            const a = (i / 4) * PI * 2;
            return P("blade", [Math.sin(a) * 1.8, (i % 2) * 0.4, Math.cos(a) * 1.8], [0.55, 0.3, 0.05], "#0c0a09", { r: [PI / 2, 0, a] });
          }),
          idle: { p: [0, 0.3, 0], f: 1.4 }
        }
      ]
    }
  };
}

/** One loose rock plate of Xal'Vorath's body: a dark shard with a sand-lit face */
const plate = (p: Vec3, z: Vec3, r: Vec3, light = false): BossPart => P(light ? "oct" : "spike", p, z, light ? "#57534e" : "#27272a", { r });

/**
 * Xal'Vorath, the Devouring Singularity (Codex teaser, not in the game yet; mythical): a hollow titan of dark rock
 * plates held together by gravity round a black core with a blazing accretion ring. Shards of broken land and ruined
 * temples orbit it, and a gravity well of glowing rings swirls the dust on the ground beneath it.
 */
function singularity(): BossRig {
  const rock = "#27272a";
  const seam = "#a855f7";
  // Plates around the core, in the plane facing the camera, leaving a gap round the singularity
  const shell: BossPart[] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * PI * 2;
    const rad = 2.05 + (i % 2) * 0.35;
    // Each plate points outward from the core
    return plate([Math.sin(a) * rad, Math.cos(a) * rad, (i % 3) * 0.18 - 0.2], [0.75 + (i % 3) * 0.2, 1.3 + (i % 2) * 0.5, 0.6], [0, 0, -a], i % 3 === 1);
  });
  const seams: BossPart[] = Array.from({ length: 10 }, (_, i) => {
    const a = ((i + 0.5) / 10) * PI * 2;
    return G("oct", [Math.sin(a) * 1.75, Math.cos(a) * 1.75, -0.45], [0.22, 0.38, 0.22], seam, { r: [0, 0, -a] });
  });
  // A chain of floating rock chunks hanging from a shoulder: the arm, with gaps between the pieces
  const arm = (side: 1 | -1, ph: number): BossBone => ({
    at: [side * 2.9, 1.3, 0.1],
    r: [0, 0, side * 0.35],
    parts: [
      plate([side * 0.25, 0.35, 0], [1.3, 1.6, 0.9], [0, 0, side * -0.6], true),
      P("dod", [side * 0.55, -0.75, 0.1], [0.95, 1.05, 0.85], rock),
      G("oct", [side * 0.45, -0.2, 0.1], [0.2, 0.3, 0.2], seam),
      P("dod", [side * 0.8, -1.85, 0.25], [0.8, 0.95, 0.75], "#3f3f46"),
      G("oct", [side * 0.7, -1.3, 0.25], [0.18, 0.28, 0.18], seam),
      // The fist: a cluster of jagged shards
      plate([side * 1.0, -2.85, 0.45], [0.9, 1.2, 0.9], [PI, 0, side * 0.3]),
      plate([side * 0.7, -2.7, 0.75], [0.5, 0.8, 0.5], [PI, 0, side * -0.4], true)
    ],
    idle: { r: [0.1, 0, side * 0.08], p: [0, 0.15, 0], f: 0.7, ph },
    // Both fists slam down
    atk: { r: [-0.9, 0, side * -0.25] }
  });
  // An orbiting belt of broken land, tilted `tilt`, spinning at `spin`
  const belt = (radius: number, y: number, tilt: Vec3, spin: number, n: number, size: number, seed: number): BossBone => ({
    at: [0, y, 0],
    r: tilt,
    spin,
    parts: Array.from({ length: n }, (_, i) => {
      const a = (i / n) * PI * 2 + seed;
      const k = (i * 7 + seed * 3) % 5;
      const pos: Vec3 = [Math.sin(a) * (radius + (k - 2) * 0.18), ((i * 5) % 3) * 0.22 - 0.22, Math.cos(a) * (radius + (k - 2) * 0.18)];
      const sz = size * (0.55 + k * 0.18);
      return P(k % 2 ? "dod" : "oct", pos, [sz, sz * 0.8, sz], k === 4 ? "#78716c" : k % 2 ? "#3f3f46" : "#292524", { r: [a, a * 0.5, 0] });
    })
  });
  // A fallen temple fragment caught in orbit: a slab with two broken columns
  const ruin = (a: number, radius: number, y: number): BossPart[] => {
    const x = Math.sin(a) * radius;
    const z = Math.cos(a) * radius;
    return [
      P("box", [x, y, z], [0.9, 0.18, 0.7], "#a8a29e", { r: [0.3, a, 0.2] }),
      P("cyl", [x - 0.25, y + 0.42, z], [0.16, 0.65, 0.16], "#d6d3d1", { r: [0.3, a, 0.2] }),
      P("cyl", [x + 0.28, y + 0.3, z + 0.05], [0.16, 0.4, 0.16], "#d6d3d1", { r: [0.3, a, 0.2] })
    ];
  };

  return {
    aura: "#7c3aed",
    ember: "#d6b98c",
    root: {
      at: [0, 0, 0],
      // Authored big; scaled to stand among the other bosses
      s0: 0.72,
      parts: [
        // Cracked bedrock with violet fissures, rubble pulled toward the well
        P("cyl", [0, 0.06, 0], [8.4, 0.12, 8.4], "#1c1917"),
        ...ring(8, 2.9, () => 0.17, (p, i) => G("box", p, [0.08, 0.06, 1.5 + (i % 3) * 0.4], seam, { r: [0, (i / 8) * PI * 2, 0] })),
        ...ring(9, 3.7, (i) => 0.25 + (i % 2) * 0.05, (p, i) => P("dod", p, [0.35 + (i % 3) * 0.12, 0.28, 0.35], "#44403c"))
      ],
      kids: [
        // The gravity well: glowing dust rings swirling on the ground, each a little higher than the last
        { at: [0, 0.3, 0], r: [PI / 2, 0, 0], spin: 0.9, parts: [G("tor", [0, 0, 0], [2.3, 2.3, 0.6], "#fde68a", { t: 0.025 })] },
        { at: [0, 0.38, 0], r: [PI / 2, 0, 0], spin: 0.6, parts: [G("tor", [0, 0, 0], [3.6, 3.6, 0.6], "#a78bfa", { t: 0.018 })] },
        { at: [0, 0.46, 0], r: [PI / 2, 0, 0], spin: 0.4, parts: [G("tor", [0, 0, 0], [5.0, 5.0, 0.6], "#d6b98c", { t: 0.014 })] },
        // Pebbles spiralling in toward the well
        {
          at: [0, 0.55, 0],
          spin: 1.2,
          parts: ring(10, 2.6, (i) => (i % 3) * 0.12, (p, i) => P("dod", p, [0.18 + (i % 2) * 0.1, 0.16, 0.18], "#57534e")),
          idle: { p: [0, 0.15, 0], f: 1.1 }
        },
        // The titan, hovering over the well
        {
          at: [0, 4.6, 0],
          parts: [
            // The singularity: a black core with a white-hot photon ring facing the viewer
            P("sph", [0, 0, 0], [1.7, 1.7, 1.7], "#020005"),
            G("tor", [0, 0, 0.05], [1.95, 1.95, 1.95], "#fff7ed", { t: 0.025 }),
            G("tor", [0, 0, -0.05], [2.3, 2.3, 2.3], "#c084fc", { t: 0.015 }),
            ...shell,
            ...seams,
            // Head: a crown of upward shards above the ring
            plate([0, 3.15, -0.1], [0.8, 1.6, 0.7], [0, 0, 0], true),
            ...sym(plate([0.75, 2.9, 0], [0.6, 1.2, 0.55], [0, 0, -0.45]), plate([1.35, 2.5, 0.15], [0.5, 0.95, 0.5], [0, 0, -0.85], true)),
            // Shoulders
            ...sym(plate([2.6, 1.75, 0], [1.3, 1.5, 1.1], [0, 0, -1.2], true), P("dod", [2.25, 1.15, -0.35], [1.0, 0.9, 0.9], rock)),
            // The lower body: plates tapering to a point, held apart by the pull
            ...sym(plate([0.8, -2.6, 0.1], [0.9, 1.4, 0.8], [PI, 0, -0.35]), plate([0.45, -3.6, -0.1], [0.6, 1.1, 0.55], [PI, 0, -0.15], true)),
            plate([0, -4.3, 0], [0.55, 1.2, 0.5], [PI, 0, 0]),
            ...sym(G("oct", [0.55, -3.05, 0.1], [0.16, 0.26, 0.16], seam))
          ],
          // A slow, heavy hover and a breath of the whole shell
          idle: { p: [0, 0.3, 0], s: 0.025, f: 0.75 },
          atk: { p: [0, -0.35, 0.4], r: [0.12, 0, 0] },
          kids: [
            // The accretion disc, tilted across the core and turning fast
            // flattened so it reads as a disc of fire seen edge-on, not a hoop
            {
              at: [0, 0, 0],
              r: [1.25, 0, 0.32],
              spin: 1.6,
              parts: [
                G("tor", [0, 0, 0], [2.7, 2.7, 0.7], "#ea580c", { t: 0.1 }),
                G("tor", [0, 0, 0], [3.6, 3.6, 0.8], "#f97316", { t: 0.06 }),
                G("tor", [0, 0, 0], [4.6, 4.6, 0.9], "#fbbf24", { t: 0.03 })
              ]
            },
            { at: [0, 0, 0], r: [1.3, 0, 0.28], spin: -1.0, parts: [G("tor", [0, 0, 0], [5.0, 5.0, 1.0], "#a855f7", { t: 0.014 })] },
            // Two glowing eyes in the dark between the crown and the ring
            { at: [0, 2.25, 0.55], eye: true, parts: sym(G("sph", [0.32, 0, 0], [0.22, 0.12, 0.1], "#e879f9")) },
            arm(1, 0),
            arm(-1, 1.4)
          ]
        },
        // Belts of broken land orbiting the titan, and temple ruins caught in its pull
        belt(5.3, 4.8, [0.25, 0, 0.18], 0.35, 16, 0.55, 0.3),
        belt(6.6, 5.6, [-0.2, 0, -0.3], -0.22, 18, 0.45, 1.1),
        { at: [0, 3.6, 0], r: [0.15, 0, -0.12], spin: 0.28, parts: [...ruin(0.6, 6.0, 0), ...ruin(3.5, 5.6, 0.4)] },
        // Fine debris in a wide, slow spiral
        belt(7.6, 3.2, [0.1, 0, 0.06], 0.18, 22, 0.25, 2.2)
      ]
    }
  };
}

/** Legendary sites and creatures (not bosses): resource nodes, the relic chest, the Nethergarde Core and the Bandit King teaser */
export const LEGENDARY_RIGS: Record<string, BossRig> = {
  "res-dragonstone": dragonstone(),
  "res-motherlode": motherlode(),
  "treasure-relic": relicHoard(),
  ruins: netherCore(),
  "ruins-ascended": netherCoreAscended(),
  "bandit-kingpin": banditKing(),
  "mythic-singularity": singularity()
};

/** Every rigged model: world bosses and legendary sites */
export const MODEL_RIGS: Record<string, BossRig> = { ...BOSS_RIGS, ...LEGENDARY_RIGS };

/** Every bone of a rig with its parent's index (-1 for the root), depth first */
export function flattenRig(root: BossBone): Array<{ bone: BossBone; parent: number }> {
  const out: Array<{ bone: BossBone; parent: number }> = [];
  const walk = (b: BossBone, parent: number) => {
    const i = out.length;
    out.push({ bone: b, parent });
    b.kids?.forEach((k) => walk(k, i));
  };
  walk(root, -1);
  return out;
}

/** Attack curve over one cycle u ∈ [0,1): wind back, strike hard, ease back to rest */
export function strike(u: number): number {
  const w = ((u % 1) + 1) % 1;
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (w < 0.4) return -0.4 * ease(w / 0.4);
  if (w < 0.55) return -0.4 + 1.4 * ease((w - 0.4) / 0.15);
  return 1 - ease((w - 0.55) / 0.45);
}
