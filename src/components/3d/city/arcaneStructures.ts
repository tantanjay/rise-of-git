import { BuildingType } from "@/types";
import { range } from "@/utils/random";
import { Builder, IDLE_KIND } from "./parts";
import { Ctx, DOOR, animal, cropPatch, pen, person } from "./blueprints";
import { CIV_ANIMALS } from "./palette";
import { arc, lanternFrame } from "@/components/3d/world/kitParts";
import { Drawer, Trim, bale, door, hd, lampPost, motes, win } from "./structureKit";

/*
 * Nethergarde (Voidrift) structures on the visual rarity ladder (see docs/MODEL_STYLE.md and structureKit.ts): obsidian and
 * void-violet stone, pyramid roofs, crystals. Tier 0 is dull stone with its crystals dark, tier 1 takes the realm's
 * violet as its one accent with a small prop (a dark crystal lantern, a ward stone), tier 2 adds silver trim, lit rune
 * windows and one turning crystal, tier 3 is a tall obsidian spire with glowing rune bands and shards orbiting it.
 * HD: dressed obsidian courses, violet tiles, crystals that catch the light, obsidian frames below tier 2, silver
 * frames, bands, cradles and caps from it.
 */

const SILVER = "#a5b4fc";
const DARK_CRYSTAL = "#4c1d95";
const RUNE = "#e879f9";
const OBSIDIAN = "#1e1b3a";
const OBSIDIAN_TRIM: Trim = { color: OBSIDIAN, mat: "stone" };
const SILVER_TRIM: Trim = { color: SILVER, mat: "steel" };

/** A floating crystal turning over (x, y, z) (the rare tier's looping effect) */
function turningCrystal(b: Builder, x: number, y: number, z: number, color: string, s = 1) {
  b.add("octa", x, y, z, 0.4 * s, 0.7 * s, 0.4 * s, color, { glow: true, idle: IDLE_KIND.spin });
}

/** HD: a silver cradle (a collar on three prongs) standing at (x, y0, z) under a crystal floating above it */
function cradle(b: Builder, x: number, y0: number, z: number, r: number) {
  b.add("cyl", x, y0, z, r * 2, 0.08, r * 2, SILVER, hd("steel"));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    b.add("cone", x + Math.cos(a) * r, y0 + 0.06, z + Math.sin(a) * r, 0.06, 0.24, 0.06, SILVER, hd("steel", { rz: -Math.cos(a) * 0.3, rx: Math.sin(a) * 0.3 }));
  }
}

/* ------------------------------ Homes & shops ------------------------------ */

/** Common: a dull obsidian hut under a pyramid roof, its crystal dark */
const shard: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", 0, 0, 0, 1.25, 0.9, 1.1, pal.wall, { mat: "masonry" });
  b.add("pyramid", 0, 0.9, 0, 1.45, 0.95, 1.3, pal.roof, { mat: "tiles" });
  b.add("octa", 0, 1.95, 0, 0.22, 0.3, 0.22, DARK_CRYSTAL, { mat: "gem" });
  door(b, 0, 0, 0.55, 0.32, 0.6, DOOR, OBSIDIAN_TRIM);
  // HD: a stone socket for the crystal, a step to the door
  b.add("cyl", 0, 1.8, 0, 0.2, 0.16, 0.2, pal.stone, hd("stone"));
  b.add("box", 0, 0, 0.72, 0.5, 0.08, 0.2, pal.stone, hd("masonry"));
};

/** Uncommon: a two-storey obsidian house, a violet banner and an unlit crystal lantern on a dark post */
const voidHouse: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.2, 0, -0.15, 2.0, 0.22, 1.6, pal.stone, { mat: "masonry" });
  b.add("box", -0.2, 0.22, -0.15, 1.8, 1.3, 1.4, pal.wall, { mat: "masonry" });
  b.add("box", -0.2, 1.52, -0.15, 1.5, 0.8, 1.2, pal.wall, { mat: "masonry" });
  b.add("pyramid", -0.2, 2.32, -0.15, 1.8, 1.1, 1.5, pal.roof, { mat: "tiles" });
  door(b, -0.2, 0.22, 0.55, 0.42, 0.75, DOOR, OBSIDIAN_TRIM);
  for (const x of [-0.75, 0.35]) win(b, x, 0.65, 0.55, "glass", 0.24, 0.32, "#6d6aa8", undefined, OBSIDIAN_TRIM);
  b.add("box", -0.2, 1.7, 0.45 + 0.06, 0.32, 0.55, 0.04, pal.accent, { mat: "cloth" }); // violet banner
  b.add("cyl", 1.05, 0, 0.55, 0.06, 1.2, 0.06, pal.trunk, { mat: "stone" });
  b.add("octa", 1.05, 1.2, 0.55, 0.2, 0.3, 0.2, DARK_CRYSTAL, { mat: "gem" }); // unlit crystal lantern
  // HD: a ledge between the storeys, the banner's rod, an obsidian frame round the crystal
  b.add("box", -0.2, 1.52, -0.15, 1.9, 0.08, 1.5, pal.stone, hd("masonry"));
  b.add("box", -0.2, 2.25, 0.51, 0.38, 0.04, 0.04, OBSIDIAN, hd("stone"));
  lanternFrame(b.add.bind(b), 1.05, 1.2, 0.55, 0.2, 0.3, OBSIDIAN, { mat: "stone" });
};

/** Rare: a rune manor: silver-trimmed obsidian, glowing rune windows, a crystal turning over its roof */
const runeManor: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", 0, 0, -0.35, 2.9, 0.25, 1.95, pal.stone, { mat: "masonry" });
  b.add("box", 0, 0.25, -0.35, 2.7, 2.1, 1.75, pal.wall, { mat: "masonry" });
  b.add("box", 0, 1.2, -0.35, 2.8, 0.1, 1.85, SILVER, { mat: "steel" });
  b.add("pyramid", 0, 2.35, -0.35, 2.9, 1.3, 2.0, pal.roof, { mat: "tiles" });
  door(b, 0, 0.25, 0.53, 0.5, 0.95, DOOR, SILVER_TRIM, "steel");
  for (const x of [-1.0, -0.6, 0.6, 1.0]) win(b, x, 0.65, 0.53, "lit", 0.2, 0.4, pal.window, undefined, SILVER_TRIM);
  for (const x of [-0.8, 0, 0.8]) win(b, x, 1.55, 0.53, "lit", 0.2, 0.4, RUNE, undefined, SILVER_TRIM);
  turningCrystal(b, 0, 3.9, -0.35, pal.accent);
  // HD: a silver cradle on the roof's peak, under the crystal
  cradle(b, 0, 3.55, -0.35, 0.14);
};

/** Epic: an obsidian spire hall with glowing rune bands, a great crystal crowning it, shards orbiting */
const spireHall: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", 0, 0, -0.5, 4.0, 0.3, 2.8, pal.stone, { mat: "masonry" });
  b.add("box", 0, 0.3, -0.5, 3.4, 2.4, 2.4, pal.wall, { mat: "masonry" });
  b.add("pyramid", 0, 2.7, -0.5, 3.7, 1.4, 2.7, pal.roof, { mat: "tiles" });
  b.add("cyl", 0, 0.3, 0.9, 1.4, 4.4, 1.4, pal.stone, { mat: "masonry" }); // the spire
  for (const y of [1.6, 3.2]) b.add("cyl", 0, y, 0.9, 1.52, 0.12, 1.52, RUNE, { glow: true }); // rune bands
  b.add("cone", 0, 4.7, 0.9, 1.6, 1.4, 1.6, pal.roof, { mat: "tiles" });
  b.add("octa", 0, 6.4, 0.9, 0.6, 1.1, 0.6, pal.accent, { glow: true, idle: IDLE_KIND.spin }); // great crystal
  door(b, 0, 0.3, 1.6, 0.6, 1.3, DOOR, SILVER_TRIM, "steel");
  for (const sx of [-1, 1]) {
    b.add("octa", sx * 2.0, 0, 0.6, 0.5, 2.8, 0.5, pal.stone, { mat: "stone" }); // obelisks
    b.add("octa", sx * 2.0, 2.9, 0.6, 0.24, 0.38, 0.24, pal.accent, { glow: true });
    win(b, sx * 1.15, 1.0, 0.7, "lit", 0.26, 0.8, pal.window, undefined, SILVER_TRIM);
    lampPost(b, sx * 0.95, 1.95, 1.3, pal.trunk, pal.accent, "stone");
    // HD: a silver collar on each obelisk
    b.add("cyl", sx * 2.0, 2.3, 0.6, 0.36, 0.08, 0.36, SILVER, hd("steel"));
  }
  motes(b, 0, 0.9, 5.4, 2.0, 5, RUNE, 0.2);
  // HD: a silver cornice under the spire's roof, a cradle under the great crystal, a footing under the spire, a step
  b.add("cyl", 0, 4.5, 0.9, 1.6, 0.14, 1.6, SILVER, hd("steel"));
  cradle(b, 0, 6.0, 0.9, 0.22);
  b.add("cyl", 0, 0, 0.9, 1.4, 0.3, 1.4, pal.stone, hd("masonry"));
  b.add("box", 0, 0, 1.72, 0.9, 0.15, 0.24, pal.stone, hd("masonry"));
};

/* ---------------------------------- Farms ---------------------------------- */

/** Common: a plain patch of dark crystals or lotus (unlit) */
const patch: Drawer = (b, ctx) => cropPatch(b, ctx, 1.9, 1.9);

/** Uncommon: a field ringed by low ward stones, one carved with a violet rune */
const field: Drawer = (b, ctx) => {
  const { pal } = ctx;
  cropPatch(b, ctx, 3.0, 2.5);
  for (const x of [-1.3, -0.4, 0.5]) b.add("box", x, 0, -1.35, 0.3, 0.5, 0.25, pal.stone, { mat: "stone" });
  b.add("box", 1.2, 0, 1.0, 0.4, 0.9, 0.3, pal.stone, { mat: "stone" }); // ward stone…
  b.add("box", 1.2, 0.4, 1.0 + 0.2, 0.2, 0.3, 0.06, pal.accent, { mat: "gem" }); // …and its violet rune
  // HD: pointed caps on the ward stones
  for (const x of [-1.3, -0.4, 0.5]) b.add("pyramid", x, 0.5, -1.35, 0.3, 0.16, 0.25, pal.stone, hd("stone"));
  b.add("pyramid", 1.2, 0.9, 1.0, 0.4, 0.24, 0.3, pal.stone, hd("stone"));
};

/** Rare: a domed crystal vault with a silver ring and a lit rune, a crystal silo with its crystal turning */
const vault: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("cyl", -0.45, 0, 0, 1.9, 1.3, 1.9, pal.wall, { mat: "masonry" });
  b.add("cyl", -0.45, 0.65, 0, 2.0, 0.1, 2.0, SILVER, { mat: "steel" });
  b.add("sphere", -0.45, 0.85, 0, 1.9, 1.2, 1.9, pal.roof, { mat: "tiles" });
  door(b, -0.45, 0, 0.95, 0.7, 0.9, DOOR, SILVER_TRIM, "steel");
  win(b, -0.45, 1.0, 0.82, "lit", 0.24, 0.24, RUNE, undefined, SILVER_TRIM);
  b.add("cyl", 1.15, 0, -0.45, 0.8, 0.6, 0.8, pal.stone, { mat: "masonry" });
  turningCrystal(b, 1.15, 0.65, -0.45, pal.accent, 1.2);
  bale(b, pal.thatch, 1.0, 0.75);
  // HD: silver ribs over the dome, a silver rim round the silo
  for (const u of [[1, 0, 0], [0, 0, 1]] as Array<[number, number, number]>) arc(b.add.bind(b), [-0.45, 1.45, 0], u, [0, 1, 0], [0.97, 0.62], 0.25, Math.PI - 0.25, 8, 0.05, SILVER, hd("steel"), "cyl");
  b.add("cyl", 1.15, 0.54, -0.45, 0.9, 0.08, 0.9, SILVER, hd("steel"));
};

/** Epic: a crystal tower ringed by turning rings, rune-lit windows, shards orbiting its crown */
const crystalTower: Drawer = (b, ctx) => {
  const { pal, rng } = ctx;
  b.add("cyl", 0, 0, 0, 1.7, 3.6, 1.5, pal.wall, { mat: "masonry" });
  b.add("cyl", 0, 1.8, 0, 1.82, 0.12, 1.62, RUNE, { glow: true });
  b.add("cone", 0, 3.6, 0, 1.9, 1.5, 1.9, pal.roof, { mat: "tiles" });
  b.add("octa", 0, 5.2, 0, 0.45, 0.8, 0.45, pal.accent, { glow: true, idle: IDLE_KIND.spin });
  door(b, 0, 0, 0.75, 0.5, 0.85, DOOR, SILVER_TRIM, "steel");
  win(b, 0, 2.4, 0.72, "lit", 0.3, 0.3, pal.window, undefined, SILVER_TRIM);
  b.actor({ kind: "rings", x: 0, y: 2.6, z: 1.0, yaw: 0, motion: "spin", speed: 0.6, phase: rng() * 6, colors: [pal.accent] });
  motes(b, 0, 0, 5.0, 1.5, 4, RUNE, 0.18);
  b.add("box", 1.2, 0, 1.2, 0.8, 0.6, 0.7, pal.wall, { mat: "masonry" });
  b.add("pyramid", 1.2, 0.6, 1.2, 0.95, 0.5, 0.85, pal.roof, { mat: "tiles" });
  // HD: a silver cornice under the roof, a cradle under the crystal, a footing
  b.add("cyl", 0, 3.4, 0, 1.86, 0.14, 1.66, SILVER, hd("steel"));
  cradle(b, 0, 5.0, 0, 0.16);
  b.add("cyl", 0, 0, 0, 1.9, 0.2, 1.7, pal.stone, hd("masonry"));
};

/* --------------------------------- Animals --------------------------------- */

/** Common: a plain fenced pen */
const animalPen: Drawer = (b, ctx) => pen(b, ctx);

/** Uncommon: an obsidian stable with violet-banded doors and an unlit crystal lantern */
const stable: Drawer = (b, ctx) => {
  const { pal, rng } = ctx;
  b.add("box", -0.3, 0, -0.3, 2.0, 1.15, 1.4, pal.wall, { mat: "masonry" });
  b.add("pyramid", -0.3, 1.15, -0.3, 2.3, 0.85, 1.7, pal.roof, { mat: "tiles" });
  for (const x of [-0.9, -0.3, 0.3]) {
    door(b, x, 0, 0.4, 0.45, 0.7, DOOR, OBSIDIAN_TRIM);
    b.add("box", x, 0.45, 0.4 + 0.08, 0.47, 0.08, 0.06, pal.accent, { mat: "plain" });
  }
  b.add("cyl", 0.95, 0, 0.6, 0.06, 1.1, 0.06, pal.trunk, { mat: "stone" });
  b.add("octa", 0.95, 1.1, 0.6, 0.18, 0.28, 0.18, DARK_CRYSTAL, { mat: "gem" });
  for (let i = 0; i < 3; i++) animal(b, ctx, CIV_ANIMALS[ctx.civ].small, range(rng, -1.2, 1.2), range(rng, 0.7, 1.1));
  // HD: an obsidian frame round the crystal lantern
  lanternFrame(b.add.bind(b), 0.95, 1.1, 0.6, 0.18, 0.28, OBSIDIAN, { mat: "stone" });
};

/** Rare: a rune barn: silver-banded obsidian, a lit rune loft, a crystal turning over its roof */
const runeBarn: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.2, 0, -0.2, 2.6, 1.7, 2.2, pal.barn, { mat: "masonry" });
  b.add("box", -0.2, 0.85, -0.2, 2.7, 0.1, 2.3, SILVER, { mat: "steel" });
  b.add("pyramid", -0.2, 1.7, -0.2, 2.8, 1.2, 2.4, pal.roof, { mat: "tiles" });
  door(b, -0.2, 0, 0.9, 1.1, 1.2, DOOR, SILVER_TRIM, "steel");
  win(b, -0.2, 1.4, 0.9, "lit", 0.34, 0.26, RUNE, undefined, SILVER_TRIM);
  turningCrystal(b, -0.2, 3.1, -0.2, pal.accent, 0.8);
  // HD: a cradle on the roof's peak, obsidian pilasters at its front corners
  cradle(b, -0.2, 2.82, -0.2, 0.12);
  for (const s of [-1, 1]) b.add("box", -0.2 + s * 1.15, 0, 0.92, 0.22, 1.7, 0.08, OBSIDIAN, hd("stone"));
};

/** Epic: a star ranch: a void house, a barn, a crystal obelisk, a pen of star-stags, shards orbiting */
const starRanch: Drawer = (b, ctx) => {
  const { pal } = ctx;
  voidHouse(b.child(-1.3, -1.05), ctx);
  b.add("box", 1.2, 0, -1.1, 2.0, 1.3, 1.4, pal.barn, { mat: "masonry" });
  b.add("pyramid", 1.2, 1.3, -1.1, 2.2, 0.9, 1.6, pal.roof, { mat: "tiles" });
  win(b, 1.2, 0.7, -0.4, "lit", 0.34, 0.28, RUNE, undefined, SILVER_TRIM);
  b.add("octa", 2.05, 0, 1.25, 0.6, 3.0, 0.6, pal.stone, { mat: "stone" });
  b.add("octa", 2.05, 3.1, 1.25, 0.3, 0.5, 0.3, pal.accent, { glow: true, idle: IDLE_KIND.spin });
  pen(b.child(0.1, 1.1), ctx, 2.0, 3);
  for (const x of [-1.55, 1.2]) lampPost(b, x, 0.4, 1.3, pal.trunk, pal.accent, "stone");
  motes(b, 2.05, 1.25, 4.0, 1.0, 3, RUNE, 0.16);
  // HD: silver collars on the obelisk
  for (const y of [0.9, 2.1]) b.add("cyl", 2.05, y, 1.25, 0.46, 0.08, 0.46, SILVER, hd("steel"));
};

/* --------------------------------- Soldiers -------------------------------- */

/** Common: a plain canopy on two dark posts */
const canopy: Drawer = (b, ctx) => {
  const { pal } = ctx;
  for (const sx of [-0.55, 0.55]) b.add("octa", sx, 0, 0, 0.18, 0.9, 0.18, pal.stone, { mat: "stone" });
  b.add("pyramid", 0, 0.9, 0, 1.4, 0.6, 1.4, pal.roof, { mat: "tiles" });
  // HD: stone feet under the posts, a flagstone floor
  for (const sx of [-0.55, 0.55]) b.add("box", sx, 0, 0, 0.26, 0.1, 0.26, pal.stone, hd("stone"));
  b.add("box", 0, 0, 0, 1.0, 0.05, 0.9, pal.stone, hd("masonry"));
};

/** Uncommon: an obsidian barracks with violet ward shields and a rack of glaives */
const barracks: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.2, 0, 0, 2.4, 0.2, 1.5, pal.stone, { mat: "masonry" });
  b.add("box", -0.2, 0.2, 0, 2.3, 1.15, 1.4, pal.wall, { mat: "masonry" });
  b.add("pyramid", -0.2, 1.35, 0, 2.6, 0.85, 1.7, pal.roof, { mat: "tiles" });
  door(b, -0.2, 0.2, 0.7, 0.5, 0.75, DOOR, OBSIDIAN_TRIM);
  for (const x of [-0.85, 0.45]) {
    b.add("box", x, 0.6, 0.7 + 0.05, 0.34, 0.42, 0.1, pal.accent, { hd: false });
    // HD: kite-shaped ward shields in violet crystal
    b.add("drop", x, 0.6, 0.7 + 0.05, 0.34, 0.46, 0.08, pal.accent, hd("gem", { rz: Math.PI }));
  }
  b.add("box", 1.25, 0, 0.1, 0.08, 1.0, 0.08, pal.trunk, { mat: "stone" });
  b.add("box", 1.25, 0, 0.75, 0.08, 1.0, 0.08, pal.trunk, { mat: "stone" });
  b.add("box", 1.25, 0.85, 0.42, 0.08, 0.08, 0.75, pal.trunk, { mat: "stone" });
  for (const z of [0.25, 0.6]) {
    b.add("cyl", 1.33, 0, z, 0.04, 1.4, 0.04, "#a8a29e", { mat: "dull" });
    // HD: the glaives' curved blades
    b.add("blade", 1.33, 1.36, z + 0.03, 0.02, 0.3, 0.1, "#a8a29e", hd("dull", { rx: 0.25 }));
  }
};

/** Rare: an obsidian watch spire, a silver band, a lit rune slit and a crystal turning on its tip */
const watchSpire: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("octa", 0, 0, 0, 1.2, 3.8, 1.2, pal.stone, { mat: "gem" });
  b.add("cyl", 0, 2.6, 0, 1.3, 0.1, 1.3, SILVER, { mat: "steel" });
  win(b, 0, 1.4, 0.38, "lit", 0.14, 0.4, RUNE, undefined, SILVER_TRIM);
  turningCrystal(b, 0, 3.9, 0, pal.accent, 0.7);
  // HD: a second silver band, a cradle on the spire's tip
  b.add("cyl", 0, 1.0, 0, 1.08, 0.08, 1.08, SILVER, hd("steel"));
  cradle(b, 0, 3.7, 0, 0.1);
  if (ctx.budget.people > 0) {
    ctx.budget.people--;
    person(b, ctx, "soldier", 0.45, 0.9, "idle");
  }
};

/** Epic: a void citadel: an obsidian tower crowned by a great floating crystal, rune bands, shards orbiting */
const voidCitadel: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("cyl", 0, 0, -0.4, 2.6, 4.4, 2.6, pal.stone, { mat: "masonry" });
  for (const y of [1.4, 3.0]) b.add("cyl", 0, y, -0.4, 2.72, 0.12, 2.72, RUNE, { glow: true });
  b.add("cyl", 0, 4.4, -0.4, 2.9, 0.3, 2.9, pal.wall, { mat: "masonry" });
  b.add("octa", 0, 5.4, -0.4, 1.2, 2.0, 1.2, pal.accent, { glow: true, idle: IDLE_KIND.spin });
  door(b, 0, 0, 0.9, 0.8, 1.3, DOOR, SILVER_TRIM, "steel", 0.06);
  for (const sx of [-1, 1]) {
    b.add("octa", sx * 2.0, 0, 0.9, 0.5, 2.6, 0.5, pal.wall, { mat: "stone" });
    b.add("octa", sx * 2.0, 2.7, 0.9, 0.22, 0.32, 0.22, pal.accent, { glow: true });
    b.add("cyl", sx * 2.0, 2.0, 0.9, 0.36, 0.08, 0.36, SILVER, hd("steel")); // HD: silver collars
  }
  motes(b, 0, -0.4, 6.0, 2.0, 5, RUNE, 0.22);
  // HD: merlons round the crown, a silver rim under them, a silver cradle for the great crystal
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    b.add("box", Math.cos(a) * 1.3, 4.7, -0.4 + Math.sin(a) * 1.3, 0.34, 0.3, 0.26, pal.wall, hd("masonry", { ry: -a }));
  }
  b.add("cyl", 0, 4.32, -0.4, 3.0, 0.08, 3.0, SILVER, hd("steel"));
  cradle(b, 0, 4.72, -0.4, 0.4);
};

/** Nethergarde structures per district, tier 0 (common) → tier 3 (epic) */
export const ARCANE_DRAWERS: Record<BuildingType, Drawer[]> = {
  residential_commercial: [shard, voidHouse, runeManor, spireHall],
  food_field: [patch, field, vault, crystalTower],
  animal_field: [animalPen, stable, runeBarn, starRanch],
  soldier_building: [canopy, barracks, watchSpire, voidCitadel]
};
