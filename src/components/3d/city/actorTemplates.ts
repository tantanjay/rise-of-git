import { CivilizationType } from "@/types";
import { ActorKind, ArmedRole, PersonRole, Shape } from "./parts";
import { isMercKind, mercTemplate } from "@/components/3d/world/mercActors";

/** A sub-mesh of an actor; `color` is either a fixed colour or an index into the actor's colour slots */
export interface SubPart {
  shape: Shape;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  rx?: number;
  /** Yaw (order YXZ, as `rx` / `rz`); only baked templates (a mercenary rig, `mercActors.ts`) turn parts about y */
  ry?: number;
  rz?: number;
  color: string | number;
  glow?: boolean;
  /** A wing on this side (-1 left, 1 right), hinged at its inner edge: it beats in flight and folds at rest (Actors) */
  flap?: -1 | 1;
}

const P = (shape: Shape, x: number, y: number, z: number, w: number, h: number, d: number, color: string | number, o: Partial<SubPart> = {}): SubPart => ({
  shape,
  x,
  y,
  z,
  w,
  h,
  d,
  color,
  ...o
});

const scaled = (tpl: SubPart[], s: number): SubPart[] => tpl.map((p) => ({ ...p, x: p.x * s, y: p.y * s, z: p.z * s, w: p.w * s, h: p.h * s, d: p.d * s }));

/*
 * People. Every actor faces local +Z. Colour slots:
 * 0 = clothes / armour, 1 = skin, 2 = hair / hat / hood, 3 = accent (shield, beard, staff orb)
 */
const PEOPLE: Record<CivilizationType, Record<PersonRole, SubPart[]>> = {
  human: {
    villager: [
      P("box", 0, 0.1, 0, 0.2, 0.2, 0.12, "#3f2a1a"),
      P("cyl", 0, 0.36, 0, 0.28, 0.32, 0.24, 0),
      P("sphere", 0, 0.62, 0, 0.2, 0.2, 0.2, 1),
      P("sphere", 0, 0.7, -0.02, 0.21, 0.11, 0.21, 2)
    ],
    farmer: [
      P("box", 0, 0.1, 0, 0.2, 0.2, 0.12, "#3f2a1a"),
      P("cyl", 0, 0.36, 0, 0.28, 0.32, 0.24, 0),
      P("sphere", 0, 0.62, 0, 0.2, 0.2, 0.2, 1),
      P("cone", 0, 0.74, 0, 0.44, 0.14, 0.44, 2)
    ],
    // Knight: steel helm, spear and a heraldic round shield
    soldier: [
      P("box", 0, 0.1, 0, 0.2, 0.2, 0.12, "#27272a"),
      P("cyl", 0, 0.36, 0, 0.3, 0.32, 0.26, 0),
      P("sphere", 0, 0.62, 0, 0.2, 0.2, 0.2, 1),
      P("cyl", 0, 0.7, 0, 0.23, 0.15, 0.23, "#9ca3af"),
      P("cone", 0, 0.81, 0, 0.12, 0.09, 0.12, "#9ca3af"),
      P("cyl", 0.2, 0.5, 0.04, 0.035, 1.0, 0.035, "#a8a29e"),
      P("cone", 0.2, 1.06, 0.04, 0.07, 0.13, 0.07, "#d4d4d8"),
      P("cyl", -0.18, 0.38, 0.02, 0.3, 0.04, 0.3, 3, { rz: Math.PI / 2 })
    ]
  },
  elf: {
    // Tall and slim, long hair, pointed ears, leaf robes
    villager: [
      P("box", 0, 0.1, 0, 0.15, 0.2, 0.1, "#6b5a3e"),
      P("cone", 0, 0.4, 0, 0.3, 0.5, 0.26, 0),
      P("sphere", 0, 0.73, 0, 0.18, 0.2, 0.18, 1),
      P("sphere", 0, 0.72, -0.05, 0.2, 0.3, 0.16, 2),
      P("cone", 0.1, 0.76, 0, 0.04, 0.13, 0.04, 1, { rz: -1.2 }),
      P("cone", -0.1, 0.76, 0, 0.04, 0.13, 0.04, 1, { rz: 1.2 })
    ],
    farmer: [
      P("box", 0, 0.1, 0, 0.15, 0.2, 0.1, "#6b5a3e"),
      P("cone", 0, 0.4, 0, 0.3, 0.5, 0.26, 0),
      P("sphere", 0, 0.73, 0, 0.18, 0.2, 0.18, 1),
      P("sphere", 0, 0.72, -0.05, 0.2, 0.3, 0.16, 2),
      P("cone", 0.1, 0.76, 0, 0.04, 0.13, 0.04, 1, { rz: -1.2 }),
      P("cone", -0.1, 0.76, 0, 0.04, 0.13, 0.04, 1, { rz: 1.2 }),
      P("cyl", 0, 0.84, 0, 0.21, 0.03, 0.21, "#4ade80"),
      P("sphere", 0.06, 0.86, 0.08, 0.07, 0.07, 0.07, 3)
    ],
    // Hooded archer with a longbow and quiver
    soldier: [
      P("box", 0, 0.1, 0, 0.15, 0.2, 0.1, "#3f3a2a"),
      P("cone", 0, 0.4, 0, 0.3, 0.5, 0.26, 0),
      P("sphere", 0, 0.73, 0, 0.18, 0.2, 0.18, 1),
      P("cone", 0, 0.8, -0.02, 0.23, 0.25, 0.23, 2),
      P("box", 0.2, 0.52, 0.05, 0.03, 0.8, 0.04, "#a16207", { rz: 0.08 }),
      P("box", 0.235, 0.52, 0.05, 0.008, 0.74, 0.008, "#f5f5f4", { rz: 0.08 }),
      P("cyl", -0.05, 0.55, -0.13, 0.08, 0.32, 0.08, "#78350f", { rx: -0.3 }),
      P("cone", -0.05, 0.74, -0.18, 0.05, 0.08, 0.05, 3, { rx: -0.3 })
    ]
  },
  dwarf: {
    // Short and wide with a big beard
    villager: [
      P("box", 0, 0.07, 0, 0.24, 0.14, 0.14, "#3f2a1a"),
      P("cyl", 0, 0.27, 0, 0.36, 0.28, 0.3, 0),
      P("cyl", 0, 0.24, 0, 0.37, 0.04, 0.31, "#78350f"),
      P("sphere", 0, 0.5, 0, 0.2, 0.2, 0.2, 1),
      P("cone", 0, 0.37, 0.08, 0.2, 0.25, 0.12, 3, { rx: Math.PI }),
      P("sphere", 0, 0.58, -0.02, 0.21, 0.1, 0.21, 2)
    ],
    farmer: [
      P("box", 0, 0.07, 0, 0.24, 0.14, 0.14, "#3f2a1a"),
      P("cyl", 0, 0.27, 0, 0.36, 0.28, 0.3, 0),
      P("cyl", 0, 0.24, 0, 0.37, 0.04, 0.31, "#78350f"),
      P("sphere", 0, 0.5, 0, 0.2, 0.2, 0.2, 1),
      P("cone", 0, 0.37, 0.08, 0.2, 0.25, 0.12, 3, { rx: Math.PI }),
      P("cyl", 0, 0.6, 0, 0.23, 0.1, 0.23, 2),
      P("sphere", 0, 0.6, 0.11, 0.07, 0.07, 0.05, "#fde047", { glow: true })
    ],
    // Horned helm and a battle axe
    soldier: [
      P("box", 0, 0.07, 0, 0.24, 0.14, 0.14, "#27272a"),
      P("cyl", 0, 0.27, 0, 0.38, 0.28, 0.32, 0),
      P("cyl", 0, 0.24, 0, 0.39, 0.04, 0.33, "#78350f"),
      P("sphere", 0, 0.5, 0, 0.2, 0.2, 0.2, 1),
      P("cone", 0, 0.37, 0.08, 0.2, 0.25, 0.12, 3, { rx: Math.PI }),
      P("sphere", 0, 0.59, 0, 0.24, 0.16, 0.24, "#9ca3af"),
      P("cone", 0.15, 0.66, 0, 0.05, 0.17, 0.05, "#f5ecd6", { rz: -0.9 }),
      P("cone", -0.15, 0.66, 0, 0.05, 0.17, 0.05, "#f5ecd6", { rz: 0.9 }),
      P("cyl", 0.24, 0.35, 0.04, 0.035, 0.62, 0.035, "#78350f"),
      P("box", 0.24, 0.6, 0.1, 0.03, 0.18, 0.15, "#d4d4d8")
    ]
  },
  orc: {
    // Big, green-skinned, tusks and a topknot
    villager: [
      P("box", 0, 0.12, 0, 0.26, 0.24, 0.15, "#292524"),
      P("box", 0, 0.44, 0, 0.4, 0.4, 0.28, 0),
      P("sphere", 0, 0.74, 0.02, 0.24, 0.22, 0.24, 1),
      P("cone", 0.06, 0.71, 0.14, 0.03, 0.07, 0.03, "#f5ecd6"),
      P("cone", -0.06, 0.71, 0.14, 0.03, 0.07, 0.03, "#f5ecd6"),
      P("sphere", 0, 0.88, -0.03, 0.1, 0.12, 0.1, 2)
    ],
    farmer: [
      P("box", 0, 0.12, 0, 0.26, 0.24, 0.15, "#292524"),
      P("box", 0, 0.44, 0, 0.4, 0.4, 0.28, 0),
      P("sphere", 0, 0.74, 0.02, 0.24, 0.22, 0.24, 1),
      P("cone", 0.06, 0.71, 0.14, 0.03, 0.07, 0.03, "#f5ecd6"),
      P("cone", -0.06, 0.71, 0.14, 0.03, 0.07, 0.03, "#f5ecd6"),
      P("cyl", 0, 0.8, 0.02, 0.25, 0.04, 0.25, "#f5ecd6"),
      P("sphere", 0, 0.88, -0.03, 0.1, 0.12, 0.1, 2)
    ],
    // Spiked helm, cleaver and a spiked hide shield
    soldier: [
      P("box", 0, 0.12, 0, 0.28, 0.24, 0.16, "#1c1917"),
      P("box", 0, 0.44, 0, 0.42, 0.4, 0.3, 0),
      P("cone", 0.21, 0.66, 0, 0.08, 0.15, 0.08, "#d6d3d1"),
      P("cone", -0.21, 0.66, 0, 0.08, 0.15, 0.08, "#d6d3d1"),
      P("sphere", 0, 0.74, 0.02, 0.24, 0.22, 0.24, 1),
      P("cone", 0.06, 0.71, 0.14, 0.03, 0.07, 0.03, "#f5ecd6"),
      P("cone", -0.06, 0.71, 0.14, 0.03, 0.07, 0.03, "#f5ecd6"),
      P("cone", 0, 0.89, 0.01, 0.25, 0.22, 0.25, "#44403c"),
      P("cyl", 0.25, 0.42, 0.05, 0.035, 0.36, 0.035, "#3f2a1a"),
      P("box", 0.25, 0.68, 0.08, 0.04, 0.26, 0.16, "#a8a29e"),
      P("cyl", -0.25, 0.44, 0.02, 0.36, 0.05, 0.36, 3, { rz: Math.PI / 2 }),
      P("cone", -0.29, 0.44, 0.02, 0.06, 0.1, 0.06, "#d6d3d1", { rz: Math.PI / 2 })
    ]
  },
  arcane: {
    // Long robes and hoods
    villager: [
      P("cone", 0, 0.33, 0, 0.32, 0.62, 0.28, 0),
      P("sphere", 0, 0.7, 0, 0.18, 0.18, 0.18, 1),
      P("sphere", 0, 0.74, -0.02, 0.21, 0.17, 0.21, 2)
    ],
    farmer: [
      P("cone", 0, 0.33, 0, 0.32, 0.62, 0.28, 0),
      P("sphere", 0, 0.7, 0, 0.18, 0.18, 0.18, 1),
      P("cone", 0, 0.8, -0.01, 0.23, 0.24, 0.23, 2),
      P("cyl", 0.17, 0.3, 0.07, 0.015, 0.16, 0.015, "#27272a"),
      P("sphere", 0.17, 0.2, 0.07, 0.08, 0.08, 0.08, 3, { glow: true })
    ],
    // Battle-mage: tall pointed hat and a staff with a glowing orb
    soldier: [
      P("cone", 0, 0.33, 0, 0.34, 0.62, 0.3, 0),
      P("sphere", 0, 0.7, 0, 0.18, 0.18, 0.18, 1),
      P("cyl", 0, 0.77, 0, 0.36, 0.03, 0.36, 2),
      P("cone", 0, 0.95, -0.02, 0.21, 0.36, 0.21, 2, { rx: -0.12 }),
      P("cyl", 0.21, 0.52, 0.04, 0.035, 1.02, 0.035, "#2e1065"),
      P("sphere", 0.21, 1.08, 0.04, 0.12, 0.12, 0.12, 3, { glow: true })
    ]
  }
};

/* Animals. Colour slots: 0 = body, 1 = legs / accents, 2 = special (glowing antlers) */

const deer = (antlerColor: string | number, glow = false): SubPart[] => [
  P("box", 0, 0.5, 0, 0.22, 0.24, 0.5, 0),
  P("box", 0, 0.68, 0.22, 0.1, 0.26, 0.1, 0, { rx: -0.4 }),
  P("box", 0, 0.82, 0.31, 0.12, 0.12, 0.2, 0),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => P("box", sx * 0.07, 0.19, sz * 0.17, 0.05, 0.38, 0.05, 1))),
  P("cone", 0.06, 1.0, 0.27, 0.03, 0.22, 0.03, antlerColor, { rz: -0.4, glow }),
  P("cone", -0.06, 1.0, 0.27, 0.03, 0.22, 0.03, antlerColor, { rz: 0.4, glow }),
  P("cone", 0.12, 1.02, 0.25, 0.02, 0.12, 0.02, antlerColor, { rz: -1.0, glow }),
  P("cone", -0.12, 1.02, 0.25, 0.02, 0.12, 0.02, antlerColor, { rz: 1.0, glow }),
  P("sphere", 0, 0.57, -0.26, 0.07, 0.07, 0.05, "#ffffff")
];

const horse: SubPart[] = [
  P("box", 0, 0.62, 0, 0.3, 0.32, 0.75, 0),
  P("box", 0, 0.86, 0.34, 0.14, 0.36, 0.16, 0, { rx: -0.5 }),
  P("box", 0, 1.02, 0.49, 0.13, 0.14, 0.3, 0),
  P("box", 0, 0.92, 0.3, 0.04, 0.34, 0.18, 1, { rx: -0.5 }),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => P("box", sx * 0.1, 0.23, sz * 0.27, 0.07, 0.46, 0.07, 0))),
  P("box", 0, 0.58, -0.42, 0.05, 0.36, 0.06, 1, { rx: 0.4 })
];

const swan: SubPart[] = [
  P("sphere", 0, 0.13, 0, 0.2, 0.16, 0.32, 0),
  P("cyl", 0, 0.32, 0.11, 0.04, 0.28, 0.04, 0, { rx: -0.25 }),
  P("sphere", 0, 0.46, 0.15, 0.07, 0.07, 0.09, 0),
  P("cone", 0, 0.45, 0.21, 0.03, 0.06, 0.03, 1, { rx: Math.PI / 2 }),
  P("cone", 0, 0.17, -0.17, 0.1, 0.1, 0.06, 0, { rx: -1.2 })
];

const ANIMALS: Record<string, SubPart[]> = {
  sheep: [
    P("sphere", 0, 0.28, 0, 0.36, 0.3, 0.46, 0),
    P("sphere", 0, 0.36, 0.27, 0.17, 0.17, 0.19, 1),
    P("box", 0, 0.07, 0.12, 0.24, 0.14, 0.06, 1),
    P("box", 0, 0.07, -0.12, 0.24, 0.14, 0.06, 1)
  ],
  cow: [
    P("box", 0, 0.45, 0, 0.42, 0.36, 0.72, 0),
    P("box", 0, 0.6, 0.44, 0.26, 0.26, 0.3, 1),
    P("box", 0, 0.14, 0.25, 0.38, 0.28, 0.1, 1),
    P("box", 0, 0.14, -0.25, 0.38, 0.28, 0.1, 1)
  ],
  pig: [
    P("sphere", 0, 0.24, 0, 0.38, 0.3, 0.5, 0),
    P("cyl", 0, 0.26, 0.27, 0.14, 0.1, 0.14, 1, { rx: Math.PI / 2 }),
    P("box", 0, 0.05, 0.14, 0.3, 0.1, 0.06, 1),
    P("box", 0, 0.05, -0.14, 0.3, 0.1, 0.06, 1)
  ],
  chicken: [
    P("sphere", 0, 0.12, 0, 0.17, 0.16, 0.2, 0),
    P("sphere", 0, 0.22, 0.08, 0.1, 0.1, 0.1, 0),
    P("box", 0, 0.28, 0.08, 0.03, 0.05, 0.06, 1),
    P("cone", 0, 0.22, 0.14, 0.04, 0.06, 0.04, "#f59e0b", { rx: Math.PI / 2 })
  ],
  deer: deer("#e7d7b5"),
  stag: deer(2, true),
  horse,
  pony: scaled(horse, 0.72),
  rabbit: [
    P("sphere", 0, 0.12, 0, 0.16, 0.15, 0.22, 0),
    P("sphere", 0, 0.2, 0.1, 0.11, 0.11, 0.11, 0),
    P("box", 0.03, 0.31, 0.08, 0.03, 0.14, 0.02, 0),
    P("box", -0.03, 0.31, 0.08, 0.03, 0.14, 0.02, 0),
    P("sphere", 0, 0.13, -0.11, 0.06, 0.06, 0.06, "#ffffff")
  ],
  swan,
  goose: scaled(swan, 0.8),
  goat: [
    P("box", 0, 0.32, 0, 0.2, 0.2, 0.38, 0),
    P("box", 0, 0.45, 0.22, 0.1, 0.12, 0.14, 0),
    P("cone", 0, 0.35, 0.26, 0.04, 0.08, 0.04, 1, { rx: Math.PI }),
    P("cone", 0.04, 0.55, 0.18, 0.03, 0.13, 0.03, "#a8a29e", { rx: -0.6 }),
    P("cone", -0.04, 0.55, 0.18, 0.03, 0.13, 0.03, "#a8a29e", { rx: -0.6 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => P("box", sx * 0.06, 0.11, sz * 0.13, 0.04, 0.22, 0.04, 1)))
  ],
  boar: [
    P("sphere", 0, 0.25, 0, 0.36, 0.32, 0.55, 0),
    P("box", 0, 0.25, 0.28, 0.2, 0.18, 0.18, 0),
    P("cyl", 0, 0.23, 0.38, 0.1, 0.06, 0.1, 1, { rx: Math.PI / 2 }),
    P("cone", 0.07, 0.26, 0.38, 0.025, 0.1, 0.025, "#f5ecd6", { rx: -0.8 }),
    P("cone", -0.07, 0.26, 0.38, 0.025, 0.1, 0.025, "#f5ecd6", { rx: -0.8 }),
    P("box", 0, 0.42, 0, 0.06, 0.06, 0.42, 1),
    P("box", 0, 0.05, 0.14, 0.3, 0.1, 0.06, 1),
    P("box", 0, 0.05, -0.14, 0.3, 0.1, 0.06, 1)
  ],
  wolf: [
    P("box", 0, 0.3, 0, 0.2, 0.2, 0.5, 0),
    P("box", 0, 0.38, 0.3, 0.15, 0.14, 0.16, 0),
    P("box", 0, 0.35, 0.41, 0.08, 0.07, 0.1, 0),
    P("cone", 0.045, 0.48, 0.28, 0.04, 0.08, 0.03, 0),
    P("cone", -0.045, 0.48, 0.28, 0.04, 0.08, 0.03, 0),
    P("cyl", 0, 0.32, -0.32, 0.05, 0.26, 0.05, 0, { rx: -1.1 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => P("box", sx * 0.06, 0.1, sz * 0.17, 0.05, 0.2, 0.05, 1)))
  ],
  lizard: [
    P("box", 0, 0.12, 0, 0.18, 0.1, 0.45, 0),
    P("box", 0, 0.13, 0.28, 0.12, 0.08, 0.14, 0),
    P("cone", 0, 0.1, -0.38, 0.08, 0.35, 0.06, 0, { rx: -Math.PI / 2 }),
    ...[-0.12, 0, 0.12].map((z) => P("cone", 0, 0.2, z, 0.03, 0.08, 0.03, 1)),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => P("box", sx * 0.12, 0.04, sz * 0.12, 0.08, 0.08, 0.06, 0)))
  ],
  crow: [
    P("sphere", 0, 0.1, 0, 0.13, 0.12, 0.18, 0),
    P("sphere", 0, 0.19, 0.07, 0.08, 0.08, 0.08, 0),
    P("cone", 0, 0.19, 0.12, 0.025, 0.05, 0.025, "#3f3f46", { rx: Math.PI / 2 }),
    P("box", 0, 0.1, -0.1, 0.07, 0.02, 0.08, 0, { rx: 0.3 }),
    P("box", -0.13, 0.13, -0.01, 0.17, 0.015, 0.11, 0, { flap: -1 }),
    P("box", 0.13, 0.13, -0.01, 0.17, 0.015, 0.11, 0, { flap: 1 })
  ],
  cat: [
    P("box", 0, 0.12, 0, 0.12, 0.12, 0.26, 0),
    P("sphere", 0, 0.2, 0.14, 0.11, 0.1, 0.1, 0),
    P("cone", 0.03, 0.27, 0.14, 0.03, 0.05, 0.02, 0),
    P("cone", -0.03, 0.27, 0.14, 0.03, 0.05, 0.02, 0),
    P("cyl", 0, 0.22, -0.15, 0.03, 0.22, 0.03, 0, { rx: -0.4 }),
    P("box", 0, 0.21, 0.19, 0.07, 0.02, 0.01, "#a3e635", { glow: true })
  ],
  owl: [
    P("sphere", 0, 0.13, 0, 0.16, 0.22, 0.15, 0),
    P("sphere", 0, 0.28, 0, 0.15, 0.12, 0.14, 0),
    P("sphere", 0.035, 0.29, 0.065, 0.04, 0.04, 0.02, "#fde047", { glow: true }),
    P("sphere", -0.035, 0.29, 0.065, 0.04, 0.04, 0.02, "#fde047", { glow: true }),
    P("cone", 0.05, 0.36, 0, 0.03, 0.05, 0.03, 0),
    P("cone", -0.05, 0.36, 0, 0.03, 0.05, 0.03, 0)
  ]
};
// The Archon's griffins are the gilded bird in Normal (their own model only in HD)
ANIMALS.griffin = ANIMALS.crow;

/*
 * Scout mounts (GAME_GUIDE §13 Scouting): each civilization's riding beast, an animal above scaled up to carry a rider,
 * with its tack. Uncommon on the ladder: one accent (the saddle cloth, colour slot 2: the rider's civilization) and a
 * small prop (saddlebags). Colour slots as the animal's: 0 coat, 1 mane / legs, 2 saddle cloth.
 */
export interface MountSpec {
  /** The animal it is built on and how much bigger */
  base: "horse" | "deer" | "goat" | "wolf";
  scale: number;
  /** Top of its back and bottom of its belly (after scaling), and its half width */
  back: number;
  belly: number;
  half: number;
  /** Saddle leather (none: ridden bareback on the cloth) */
  saddle?: string;
}

export const MOUNTS: Record<CivilizationType, MountSpec> = {
  human: { base: "horse", scale: 1, back: 0.78, belly: 0.45, half: 0.15, saddle: "#5b3a1e" },
  elf: { base: "deer", scale: 1.4, back: 0.868, belly: 0.518, half: 0.154 },
  dwarf: { base: "goat", scale: 1.7, back: 0.714, belly: 0.357, half: 0.17, saddle: "#4a2a16" },
  orc: { base: "wolf", scale: 1.9, back: 0.76, belly: 0.36, half: 0.19, saddle: "#d6cfc0" },
  arcane: { base: "horse", scale: 1, back: 0.78, belly: 0.45, half: 0.15, saddle: "#1c1917" }
};

/** Where a rider sits on a civilization's mount: the height of the seat above the mount's feet (unscaled) */
export const mountSeat = (civ: CivilizationType) => MOUNTS[civ].back + (MOUNTS[civ].saddle ? 0.14 : 0.06);

/** A mount's coat and mane / legs (colour slots 0 and 1; slot 2, the saddle cloth, is the rider's civilization's) */
export const MOUNT_COATS: Record<CivilizationType, [string, string]> = {
  human: ["#7c4a1e", "#2a1a10"],
  elf: ["#e7dcc8", "#a8977a"],
  dwarf: ["#d6c7a8", "#57534e"],
  orc: ["#57534e", "#292524"],
  arcane: ["#1e1b2e", "#a855f7"]
};

/** Hip height of each civilization's people (their HD build): a rider's feet go this far below the seat */
const RIDER_HIP: Record<CivilizationType, number> = { human: 0.24, elf: 0.32, dwarf: 0.14, orc: 0.27, arcane: 0.22 };

/** How high a person of `rider`'s civilization stands (feet above the ground, unscaled) in the saddle of `mount`'s mount */
export const riderLift = (rider: CivilizationType, mount: CivilizationType) => mountSeat(mount) - RIDER_HIP[rider];

/** The saddle cloth over the back with a flap down each flank, a saddle with its cantle, and saddlebags behind (Normal) */
function tack(m: MountSpec): SubPart[] {
  const { back, half } = m;
  const out: SubPart[] = [P("box", 0, back + 0.03, -0.02, half * 2 + 0.08, 0.06, 0.36, 2)];
  for (const sx of [-1, 1]) out.push(P("box", sx * (half + 0.035), back - 0.085, -0.02, 0.03, 0.17, 0.34, 2));
  if (m.saddle) out.push(P("box", 0, back + 0.1, -0.02, 0.22, 0.08, 0.26, m.saddle), P("box", 0, back + 0.17, -0.13, 0.2, 0.06, 0.05, m.saddle));
  for (const sx of [-1, 1]) out.push(P("box", sx * (half + 0.1), back - 0.12, -0.2, 0.08, 0.13, 0.13, "#78350f"));
  return out;
}

const mount = (civ: CivilizationType): SubPart[] => {
  const m = MOUNTS[civ];
  const body = scaled(ANIMALS[m.base], m.scale);
  // The Voidmare's eyes burn violet
  const eyes = civ === "arcane" ? [-1, 1].map((sx) => P("sphere", sx * 0.07, 1.05, 0.56, 0.04, 0.04, 0.04, "#e879f9", { glow: true })) : [];
  return [...body, ...tack(m), ...eyes];
};
const MOUNT_PARTS = Object.fromEntries((Object.keys(MOUNTS) as CivilizationType[]).map((civ) => [civ, mount(civ)])) as Record<CivilizationType, SubPart[]>;

/* Moving building parts */
const MECHANISMS: Record<string, SubPart[]> = {
  // Windmill sails; slot 0 = sail cloth
  sails: [
    P("cyl", 0, 0, 0, 0.22, 0.18, 0.22, "#78350f", { rx: Math.PI / 2 }),
    P("box", 0, 0, 0.04, 0.06, 2.6, 0.06, "#5b3b22"),
    P("box", 0, 0, 0.04, 2.6, 0.06, 0.06, "#5b3b22"),
    P("box", 0.14, 0.75, 0.06, 0.26, 1.0, 0.03, 0),
    P("box", -0.14, -0.75, 0.06, 0.26, 1.0, 0.03, 0),
    P("box", -0.75, 0.14, 0.06, 1.0, 0.26, 0.03, 0),
    P("box", 0.75, -0.14, 0.06, 1.0, 0.26, 0.03, 0)
  ],
  // Arcane mill: a ring of crystals turning around a glowing core; slot 0 = crystal colour
  rings: [
    P("octa", 0, 0, 0, 0.32, 0.32, 0.32, 0, { glow: true }),
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return P("octa", Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0, 0.2, 0.32, 0.2, 0, { glow: true, rz: a });
    })
  ],
  // Dwarven forge gear
  gear: [
    P("cyl", 0, 0, 0, 1.3, 0.14, 1.3, "#b45309", { rx: Math.PI / 2 }),
    P("cyl", 0, 0, 0.06, 0.4, 0.1, 0.4, "#78350f", { rx: Math.PI / 2 }),
    ...Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return P("box", Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0, 0.22, 0.22, 0.14, "#b45309", { rz: a });
    })
  ],
  sparkle: [P("octa", 0, 0, 0, 0.16, 0.24, 0.16, 0, { glow: true })]
};

/*
 * 🗡️ Soldiers in an Armory set (GAME_GUIDE §13 *The Armory*): `soldier1_<civ>` (uncommon), `soldier2_<civ>` (rare) and
 * `soldier3_<civ>` (epic) are the civilization's soldier with the set's gear on, climbing the rarity ladder: uncommon
 * its accent colour on a tabard or sash and a small prop (pennant, plume, charm), rare metal trim (pauldrons and a
 * crest), epic a cape for a bigger silhouette and glowing details. Same shapes as the soldiers already use, so an armed
 * march costs no new draw.
 */
interface ArmsLook {
  accent: string;
  metal: string;
  glow: string;
  cape: string;
  /** Tabard on the chest (box centre and size), or a sash round a robe */
  chest: SubPart;
  /** The uncommon prop: a pennant, plume or charm */
  prop: SubPart;
  /** Pauldrons (one side; mirrored) */
  pauldron: SubPart;
  /** A crest on the helm or hat */
  crest: SubPart;
  /** The epic cape behind the back */
  back: SubPart;
  /** The epic glows (a weapon's head, a gem on the chest) */
  glows: SubPart[];
}

const ARMS_LOOKS: Record<CivilizationType, ArmsLook> = {
  // Valoria: the Dawn Banner's gold, steel plate, a sun on the shield boss
  human: {
    accent: "#eab308",
    metal: "#e5e7eb",
    glow: "#fde68a",
    cape: "#b91c1c",
    chest: P("box", 0, 0.37, 0.155, 0.16, 0.26, 0.03, 0),
    prop: P("box", 0.27, 0.97, 0.04, 0.12, 0.07, 0.01, 0),
    pauldron: P("sphere", 0.165, 0.5, 0, 0.13, 0.09, 0.15, 0),
    crest: P("sphere", 0, 0.87, -0.03, 0.07, 0.08, 0.11, 0),
    back: P("box", 0, 0.3, -0.15, 0.26, 0.4, 0.03, 0),
    glows: [P("sphere", -0.215, 0.38, 0.02, 0.06, 0.06, 0.06, 0), P("octa", 0.2, 1.14, 0.04, 0.04, 0.08, 0.04, 0)]
  },
  // Sylvandale: autumn gold on the green, moonsilver, a night-blue cloak, starlit arrows
  elf: {
    accent: "#fcd34d",
    metal: "#c7d2fe",
    glow: "#a5f3fc",
    cape: "#1e3a8a",
    chest: P("cyl", 0, 0.3, 0, 0.3, 0.04, 0.28, 0),
    prop: P("cone", 0.08, 0.86, -0.02, 0.04, 0.12, 0.04, 0, { rz: -0.5 }),
    pauldron: P("sphere", 0.12, 0.6, 0, 0.1, 0.07, 0.12, 0),
    crest: P("cone", 0, 0.95, -0.05, 0.05, 0.1, 0.05, 0, { rx: -0.4 }),
    back: P("box", 0, 0.4, -0.1, 0.22, 0.45, 0.03, 0),
    glows: [P("octa", -0.05, 0.8, -0.2, 0.06, 0.1, 0.06, 0), P("sphere", 0.23, 0.92, 0.05, 0.05, 0.05, 0.05, 0)]
  },
  // Ironforge: forge-bronze, polished steel, runes that glow like coals
  dwarf: {
    accent: "#b45309",
    metal: "#d1d5db",
    glow: "#fb923c",
    cape: "#7c2d12",
    chest: P("box", 0, 0.27, 0.175, 0.18, 0.2, 0.03, 0),
    prop: P("cone", 0, 0.72, 0, 0.05, 0.1, 0.05, 0),
    pauldron: P("sphere", 0.2, 0.38, 0, 0.13, 0.09, 0.15, 0),
    crest: P("box", 0, 0.68, 0, 0.03, 0.06, 0.2, 0),
    back: P("box", 0, 0.24, -0.175, 0.3, 0.3, 0.03, 0),
    glows: [P("octa", 0.27, 0.6, 0.1, 0.04, 0.08, 0.06, 0), P("sphere", 0, 0.3, 0.2, 0.05, 0.05, 0.03, 0)]
  },
  // Drak'mar: war red, blackiron, a cleaver's edge hot from the Bloodfire
  orc: {
    accent: "#dc2626",
    metal: "#52525b",
    glow: "#f97316",
    cape: "#450a0a",
    chest: P("box", 0, 0.42, 0.18, 0.2, 0.28, 0.03, 0),
    prop: P("cone", 0, 1.03, -0.03, 0.05, 0.12, 0.05, 0, { rx: -0.3 }),
    pauldron: P("sphere", 0.23, 0.6, 0, 0.15, 0.08, 0.17, 0),
    crest: P("box", 0, 0.98, -0.02, 0.03, 0.08, 0.16, 0),
    back: P("box", 0, 0.4, -0.18, 0.34, 0.44, 0.03, 0),
    glows: [P("box", 0.25, 0.68, 0.18, 0.02, 0.22, 0.02, 0), P("sphere", 0, 0.82, 0.12, 0.05, 0.03, 0.03, 0)]
  },
  // Nethergarde: the eclipse's prismatic cyan edge, riftglass shards, a black cloak, its violet light
  arcane: {
    accent: "#22d3ee",
    metal: "#c4b5fd",
    glow: "#e879f9",
    cape: "#0b0618",
    chest: P("cyl", 0, 0.3, 0, 0.34, 0.04, 0.3, 0),
    prop: P("octa", 0, 0.81, 0.13, 0.05, 0.06, 0.03, 0),
    pauldron: P("octa", 0.12, 0.56, 0, 0.1, 0.12, 0.1, 0),
    crest: P("octa", 0, 1.2, -0.12, 0.05, 0.08, 0.05, 0),
    back: P("box", 0, 0.4, -0.11, 0.24, 0.5, 0.03, 0),
    glows: [P("octa", 0.21, 1.2, 0.04, 0.04, 0.08, 0.04, 0), P("sphere", 0, 0.5, 0.11, 0.05, 0.05, 0.03, 0)]
  }
};

/** A set's colours on a civilization's soldiers (its HD gear uses the same) */
export const armsPalette = (civ: CivilizationType) => {
  const L = ARMS_LOOKS[civ] ?? ARMS_LOOKS.human;
  return { accent: L.accent, metal: L.metal, glow: L.glow, cape: L.cape };
};

const tint = (p: SubPart, color: string, o: Partial<SubPart> = {}): SubPart => ({ ...p, color, ...o });
const mirrorX = (p: SubPart): SubPart => ({ ...p, x: -p.x, rz: p.rz !== undefined ? -p.rz : undefined });

/** The gear a set adds to its civilization's soldier: tier 1 uncommon, 2 rare, 3 epic */
export function armsParts(civ: CivilizationType, tier: 1 | 2 | 3): SubPart[] {
  const L = ARMS_LOOKS[civ] ?? ARMS_LOOKS.human;
  const out: SubPart[] = [tint(L.chest, L.accent)];
  if (tier === 1) return [...out, tint(L.prop, L.accent)];
  out.push(tint(L.pauldron, L.metal), tint(mirrorX(L.pauldron), L.metal), tint(L.crest, L.metal));
  if (tier === 2) return out;
  return [...out, tint(L.back, L.cape), ...L.glows.map((g) => tint(g, L.glow, { glow: true }))];
}

/** `soldier1` … `soldier3`: a soldier in an Armory set (the tier its rarity climbs to) */
export const ARMED_ROLES: ArmedRole[] = ["soldier1", "soldier2", "soldier3"];
const armedTier = (role: string): 1 | 2 | 3 | 0 => (role === "soldier1" ? 1 : role === "soldier2" ? 2 : role === "soldier3" ? 3 : 0);

/** Every actor kind with a template (people per civilization and role, carried lights, scout mounts, animals, moving parts) */
export const ACTOR_KINDS: ActorKind[] = [
  ...(Object.keys(PEOPLE) as CivilizationType[]).flatMap((civ) => [
    ...(Object.keys(PEOPLE[civ]) as PersonRole[]).map((role) => `${role}_${civ}` as ActorKind),
    ...ARMED_ROLES.map((role) => `${role}_${civ}` as ActorKind),
    `light_${civ}` as ActorKind,
    `mount_${civ}` as ActorKind
  ]),
  ...(Object.keys(ANIMALS) as ActorKind[]),
  ...(Object.keys(MECHANISMS) as ActorKind[])
];

/** Sub-meshes for every actor kind */
/*
 * Lights carried after dark (GAME_GUIDE §7 *Day, night & seasons*), one per civilization. An actor of kind
 * `light_<civ>` copies its bearer's fields, so it takes the same pose and moves with them. Held in the left hand
 * (local -X, in front of a soldier's shield); the glowing part is unlit, everything else matte.
 */
const LIGHTS: Record<CivilizationType, SubPart[]> = {
  // A brass hand lantern with a warm candle
  human: [
    P("cyl", -0.26, 0.56, 0.15, 0.025, 0.12, 0.025, "#3f3f46"),
    P("cone", -0.26, 0.5, 0.15, 0.17, 0.07, 0.17, "#78350f"),
    P("box", -0.26, 0.39, 0.15, 0.14, 0.15, 0.14, "#fde68a", { glow: true }),
    P("box", -0.26, 0.3, 0.15, 0.16, 0.03, 0.16, "#78350f")
  ],
  // A floating moon-wisp over the shoulder
  elf: [
    P("sphere", -0.24, 0.9, 0.06, 0.2, 0.2, 0.2, "#a5f3fc", { glow: true }),
    P("sphere", -0.38, 1.04, -0.02, 0.08, 0.08, 0.08, "#ecfeff", { glow: true })
  ],
  // A miner's lamp on the brow and an iron lantern in hand
  dwarf: [
    P("box", 0, 0.66, 0.13, 0.1, 0.07, 0.04, "#fdba74", { glow: true }),
    P("cyl", -0.26, 0.54, 0.15, 0.025, 0.1, 0.025, "#27272a"),
    P("box", -0.26, 0.41, 0.15, 0.14, 0.15, 0.14, "#fb923c", { glow: true }),
    P("box", -0.26, 0.32, 0.15, 0.17, 0.03, 0.17, "#27272a")
  ],
  // A pitch torch: a stick with a flame
  orc: [
    P("cyl", -0.26, 0.36, 0.16, 0.045, 0.5, 0.045, "#4a2a16", { rz: 0.15 }),
    P("cone", -0.3, 0.68, 0.16, 0.2, 0.3, 0.2, "#f97316", { glow: true }),
    P("cone", -0.3, 0.72, 0.16, 0.11, 0.32, 0.11, "#fde047", { glow: true })
  ],
  // A void orb hovering at the hand, a spark circling it
  arcane: [
    P("sphere", -0.27, 0.52, 0.16, 0.2, 0.2, 0.2, "#c084fc", { glow: true }),
    P("sphere", -0.4, 0.66, 0.1, 0.07, 0.07, 0.07, "#f0abfc", { glow: true })
  ]
};

/** The soft glow round each carried light (drawn by Actors as one additive, camera-facing batch): centre and size */
export const LIGHT_HALOS: Record<CivilizationType, { x: number; y: number; z: number; size: number; color: string }> = {
  human: { x: -0.26, y: 0.39, z: 0.15, size: 1.0, color: "#fbbf24" },
  elf: { x: -0.24, y: 0.9, z: 0.06, size: 0.95, color: "#67e8f9" },
  dwarf: { x: -0.26, y: 0.41, z: 0.15, size: 1.0, color: "#fb923c" },
  orc: { x: -0.3, y: 0.72, z: 0.16, size: 1.15, color: "#f97316" },
  arcane: { x: -0.27, y: 0.52, z: 0.16, size: 1.0, color: "#c084fc" }
};

const armedCache = new Map<string, SubPart[]>();
/** A soldier in a set: the civilization's soldier with its gear on (built once) */
function armedTemplate(civ: CivilizationType, tier: 1 | 2 | 3): SubPart[] {
  const key = `${civ}${tier}`;
  let t = armedCache.get(key);
  if (!t) {
    t = [...(PEOPLE[civ] ?? PEOPLE.human).soldier, ...armsParts(civ, tier)];
    armedCache.set(key, t);
  }
  return t;
}

export function actorTemplate(kind: ActorKind): SubPart[] {
  // 🪙 A mercenary of a band on the march (Normal): its rig baked into parts
  if (isMercKind(kind)) return mercTemplate(kind);
  const sep = kind.indexOf("_");
  if (sep > 0 && kind.startsWith("light_")) return LIGHTS[kind.slice(sep + 1) as CivilizationType] ?? LIGHTS.human;
  if (sep > 0 && kind.startsWith("mount_")) return MOUNT_PARTS[kind.slice(sep + 1) as CivilizationType] ?? MOUNT_PARTS.human;
  if (sep > 0) {
    const role = kind.slice(0, sep) as PersonRole;
    const civ = kind.slice(sep + 1) as CivilizationType;
    const tier = armedTier(role);
    if (tier) return armedTemplate(civ, tier);
    return PEOPLE[civ]?.[role] ?? PEOPLE.human.villager;
  }
  return ANIMALS[kind] ?? MECHANISMS[kind] ?? MECHANISMS.sparkle;
}
