import { BuildingType } from "@/types";
import { range } from "@/utils/random";
import { Builder, IDLE_KIND } from "./parts";
import { Ctx, DOOR, animal, cropPatch, pen, person, tree } from "./blueprints";
import { CIV_ANIMALS } from "./palette";
import { along, arc, lanternFrame } from "@/components/3d/world/kitParts";
import { Drawer, Trim, bale, door, hd, lampPost, motes, pennant, win } from "./structureKit";

/*
 * Elf (Sylvandale) structures on the visual rarity ladder (see docs/MODEL_STYLE.md and structureKit.ts): white wood, round walls
 * under leaf roofs, living trees. Tier 0 is plain and unlit, tier 1 takes the realm's sea-glass cyan as its one
 * accent with a small prop, tier 2 adds silver trim, lit moonglass windows and a streaming pennant or swaying crown,
 * tier 3 is a taller white spire hall with glowing moonstones and wisps circling it.
 * HD: painted white walls, leaf roofs fringed with leafy clumps, silver bands and frames from tier 2, roots and railings.
 */

const SILVER = "#cbd5e1";
const MOON = "#e0f2fe";
const LEAF_DARK = "#1f7a5c";
const PALE: Trim = { color: "#b9ad8f", mat: "wood" };
const SILVER_TRIM: Trim = { color: SILVER, mat: "steel" };

/** HD: leafy clumps all round a leaf roof's eave (a cone of base diameter `d` from y) */
function leafEave(b: Builder, x: number, z: number, d: number, y: number, color: string) {
  const r = d / 2 - 0.06;
  const n = Math.max(6, Math.round(d * 4));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.3;
    b.add("canopy", x + Math.cos(a) * r, y - 0.08, z + Math.sin(a) * r, 0.34, 0.18, 0.26, color, hd("leaf", { ry: -a }));
  }
}

/** HD: roots flaring from a living trunk's foot (radius r) */
function roots(b: Builder, x: number, z: number, r: number, color: string) {
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 2.2; // none in front of a door (+z)
    along(b.add.bind(b), "taper", [x + Math.cos(a) * (r + 0.32), 0, z + Math.sin(a) * (r + 0.32)], [x + Math.cos(a) * (r - 0.08), 0.38, z + Math.sin(a) * (r - 0.08)], 0.16, 0.12, color, hd("wood"));
  }
}

/** A round white house under a leaf cone; front face at z = r */
function roundHouse(b: Builder, ctx: Ctx, x: number, z: number, r: number, h: number, roofH: number) {
  b.add("cyl", x, 0, z, r * 2, h, r * 2, ctx.pal.wall, { mat: "plain" });
  b.add("cone", x, h, z, r * 2.5, roofH, r * 2.5, ctx.pal.roof, { mat: "leaf" });
  leafEave(b, x, z, r * 2.5, h, ctx.pal.roof);
}

/* ------------------------------ Homes & shops ------------------------------ */

/** Common: a small round leaf hut, shutters closed */
const leafHut: Drawer = (b, ctx) => {
  roundHouse(b, ctx, 0, 0, 0.6, 0.85, 0.95);
  door(b, 0, 0, 0.6, 0.3, 0.58, DOOR, PALE);
  win(b, -0.38, 0.32, 0.47, "shut", 0.18, 0.22, undefined, ctx.pal.wood, PALE);
};

/** Uncommon: a two-storey round house, a cyan hanging banner and an unlit leaf lantern on a pale post */
const treeHome: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("cyl", -0.2, 0, -0.1, 1.9, 1.3, 1.9, pal.wall, { mat: "plain" });
  b.add("cyl", -0.2, 1.3, -0.1, 1.5, 0.9, 1.5, pal.wall, { mat: "plain" });
  b.add("cone", -0.2, 2.2, -0.1, 2.1, 1.3, 2.1, pal.roof, { mat: "leaf" });
  door(b, -0.2, 0, 0.85, 0.4, 0.75, DOOR, PALE);
  for (const x of [-0.75, 0.35]) win(b, x, 0.55, 0.6, "glass", 0.24, 0.32, undefined, undefined, PALE);
  b.add("box", -0.2, 1.45, 0.65 + 0.06, 0.34, 0.6, 0.04, pal.accent, { mat: "cloth" }); // cyan banner
  b.add("cyl", 1.05, 0, 0.55, 0.06, 1.3, 0.06, pal.trunk, { mat: "wood" }); // lantern post…
  b.add("sphere", 1.05, 1.0, 0.68, 0.2, 0.24, 0.2, LEAF_DARK, { mat: "leaf" }); // …its leaf lantern, unlit by day
  tree(b, ctx, 0.95, -0.7, 0.7);
  // HD: leaves round the eave, a ledge between the storeys, the banner's rod, the lantern's hook
  leafEave(b, -0.2, -0.1, 2.1, 2.2, pal.roof);
  b.add("cyl", -0.2, 1.24, -0.1, 2.02, 0.08, 2.02, pal.trunk, hd("wood"));
  b.add("box", -0.2, 2.05, 0.72, 0.42, 0.04, 0.04, pal.trunk, hd("wood"));
  b.add("box", 1.05, 1.26, 0.6, 0.04, 0.04, 0.2, pal.trunk, hd("wood"));
  b.add("cyl", 1.05, 1.22, 0.68, 0.015, 0.04, 0.015, "#71717a", hd("dull"));
};

/** Rare: a willow manor of two silver-ringed round towers, lit moonglass windows, a pennant streaming over it */
const willowManor: Drawer = (b, ctx) => {
  const { pal } = ctx;
  for (const [x, z, r, h] of [
    [-0.75, -0.3, 0.9, 2.2],
    [0.85, -0.45, 0.7, 1.8]
  ]) {
    roundHouse(b, ctx, x, z, r, h, 1.3);
    b.add("cyl", x, h * 0.55, z, r * 2 + 0.1, 0.1, r * 2 + 0.1, SILVER, { mat: "steel" });
    win(b, x, h * 0.25, z + r - 0.12, "lit", 0.24, 0.42, pal.window, undefined, SILVER_TRIM);
    win(b, x, h * 0.7, z + r - 0.12, "lit", 0.22, 0.36, pal.window, undefined, SILVER_TRIM);
    // HD: a silver finial on each roof
    b.add("sphere", x, h + 1.22, z, 0.12, 0.12, 0.12, SILVER, hd("steel"));
  }
  b.add("box", 0.1, 0, -0.35, 1.0, 1.4, 1.2, pal.wall, { mat: "plain" }); // the hall joining them
  door(b, 0.1, 0, 0.25, 0.42, 0.85, DOOR, SILVER_TRIM, "steel");
  pennant(b, -0.75, 3.3, -0.3, 0.9, SILVER, pal.accent, "steel");
  // HD: a leafy roof on the joining hall, a silver band at its eave
  b.add("box", 0.1, 1.4, -0.35, 1.1, 0.06, 1.3, SILVER, hd("steel"));
  for (let k = 0; k < 3; k++) b.add("canopy", -0.2 + k * 0.3, 1.46, -0.35 + (k % 2) * 0.2, 0.42, 0.22, 0.6, pal.roof, hd("leaf"));
};

/** Epic: a moon hall: a tall white spire between two lesser ones, glowing moonstones, lit windows, wisps circling */
const moonHall: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", 0, 0, -0.5, 4.0, 0.3, 2.8, pal.stone, { mat: "masonry" });
  b.add("cyl", 0, 0.3, -0.5, 3.4, 2.4, 2.4, pal.wall, { mat: "plain" });
  b.add("cone", 0, 2.7, -0.5, 4.0, 1.4, 3.0, pal.roof, { mat: "leaf" });
  b.add("cyl", 0, 0.3, 0.9, 1.3, 4.6, 1.3, pal.wall, { mat: "plain" }); // the great spire
  b.add("cone", 0, 4.9, 0.9, 1.6, 1.8, 1.6, pal.roof, { mat: "leaf" });
  b.add("octa", 0, 6.8, 0.9, 0.4, 0.6, 0.4, MOON, { glow: true, idle: IDLE_KIND.pulse }); // moonstone
  b.add("cyl", 0, 2.6, 0.9, 1.42, 0.12, 1.42, SILVER, { mat: "steel" });
  door(b, 0, 0.3, 1.55, 0.6, 1.3, DOOR, SILVER_TRIM, "steel");
  win(b, 0, 3.0, 1.55, "lit", 0.3, 0.6, pal.window, undefined, SILVER_TRIM);
  for (const sx of [-1, 1]) {
    b.add("cyl", sx * 1.95, 0.3, 0.3, 0.9, 3.6, 0.9, pal.wall, { mat: "plain" });
    b.add("cone", sx * 1.95, 3.9, 0.3, 1.2, 1.4, 1.2, pal.roof, { mat: "leaf" });
    b.add("octa", sx * 1.95, 5.35, 0.3, 0.22, 0.32, 0.22, pal.accent, { glow: true });
    win(b, sx * 1.95, 2.0, 0.75, "lit", 0.18, 0.44, pal.window, undefined, SILVER_TRIM);
    win(b, sx * 0.95, 1.0, 0.45, "lit", 0.24, 0.8, pal.window, undefined, SILVER_TRIM); // the oval hall's face at |x| = 0.95
    lampPost(b, sx * 0.95, 1.95, 1.3, pal.trunk, pal.accent, "wood");
    // HD: leaves round the lesser spires' eaves, silver bands up them
    leafEave(b, sx * 1.95, 0.3, 1.2, 3.9, pal.roof);
    for (const y of [1.4, 3.0]) b.add("cyl", sx * 1.95, y, 0.3, 1.0, 0.08, 1.0, SILVER, hd("steel"));
  }
  motes(b, 0, 0.9, 5.4, 1.9, 5, pal.accent);
  // HD: leaves round the eaves of the hall and the great spire, a silver arch over the window, silver bands, a footing
  // and a step under the spire
  leafEave(b, 0, -0.5, 3.6, 2.7, pal.roof);
  leafEave(b, 0, 0.9, 1.6, 4.9, pal.roof);
  arc(b.add.bind(b), [0, 3.6, 1.6], [1, 0, 0], [0, 1, 0], 0.2, 0, Math.PI, 6, 0.05, SILVER, hd("steel"), "cyl");
  for (const y of [1.6, 4.2]) b.add("cyl", 0, y, 0.9, 1.42, 0.08, 1.42, SILVER, hd("steel"));
  b.add("cyl", 0, 0, 0.9, 1.3, 0.3, 1.3, pal.stone, hd("masonry"));
  b.add("box", 0, 0, 1.66, 0.9, 0.15, 0.24, pal.stone, hd("masonry"));
};

/* ---------------------------------- Farms ---------------------------------- */

/** Common: a plain herb or berry patch (unlit) */
const patch: Drawer = (b, ctx) => cropPatch(b, ctx, 1.9, 1.9);

/** Uncommon: a field with a cyan-capped lantern post and a hedge along the back */
const field: Drawer = (b, ctx) => {
  const { pal } = ctx;
  cropPatch(b, ctx, 3.0, 2.5);
  b.add("cyl", 1.1, 0, 0.95, 0.06, 1.3, 0.06, pal.trunk, { mat: "wood" });
  b.add("box", 1.25, 1.2, 0.95, 0.3, 0.04, 0.04, pal.trunk, { mat: "wood" });
  b.add("sphere", 1.38, 0.95, 0.95, 0.18, 0.2, 0.18, pal.accent, { mat: "gem" }); // unlit lantern
  b.add("box", -0.4, 0, -1.3, 2.2, 0.55, 0.3, pal.foliage, { mat: "leaf" }); // hedge
  // HD: the lantern's pale frame on its chain, leafy clumps along the hedge
  lanternFrame(b.add.bind(b), 1.38, 0.95, 0.95, 0.2, 0.2, pal.trunk, { mat: "wood" });
  b.add("cyl", 1.38, 1.15, 0.95, 0.015, 0.06, 0.015, "#71717a", hd("dull"));
  for (let k = 0; k < 5; k++) b.add("canopy", -1.3 + k * 0.45, 0.42, -1.3 + (k % 2 ? 0.04 : -0.04), 0.5, 0.26, 0.38, pal.foliage, hd("leaf"));
};

/** Rare: a round leaf-roofed storehouse with a silver hoop and a lit window, a hollow-tree silo whose crown sways */
const storehouse: Drawer = (b, ctx) => {
  const { pal } = ctx;
  roundHouse(b, ctx, -0.5, 0, 0.9, 1.5, 1.0);
  b.add("cyl", -0.5, 0.75, 0, 1.9, 0.1, 1.9, SILVER, { mat: "steel" });
  door(b, -0.5, 0, 0.9, 0.6, 0.95, DOOR, SILVER_TRIM, "steel");
  win(b, -0.5, 1.15, 0.78, "lit", 0.26, 0.24, pal.window, undefined, SILVER_TRIM);
  b.add("cyl", 1.1, 0, -0.45, 0.75, 2.0, 0.75, pal.trunk, { mat: "wood", hdShape: "trunk" });
  b.add("cone", 1.1, 1.8, -0.45, 1.2, 1.3, 1.2, pal.foliage, { idle: IDLE_KIND.sway, mat: "leaf" });
  bale(b, pal.thatch, 1.0, 0.75);
  // HD: roots at the silo tree's foot, a hatch in its trunk
  roots(b, 1.1, -0.45, 0.3, pal.trunk);
  b.add("box", 1.1, 0.5, -0.45 + 0.4, 0.26, 0.4, 0.06, DOOR, hd("wood"));
};

/** Epic: a great tree mill with leaf sails, a glowing moonstone in its trunk and wisps circling its crown */
const treeMill: Drawer = (b, ctx) => {
  const { pal, rng } = ctx;
  b.add("cyl", 0, 0, 0, 1.8, 3.6, 1.8, pal.trunk, { mat: "wood" });
  b.add("cyl", 0, 2.2, 0, 2.2, 0.1, 2.2, SILVER, { mat: "steel" }); // gallery ring
  b.add("cone", 0, 3.3, 0, 2.7, 1.9, 2.7, pal.foliage, { mat: "leaf" });
  door(b, 0, 0, 0.88, 0.5, 0.9, DOOR, SILVER_TRIM, "steel");
  b.add("sphere", 0, 1.6, 0.92, 0.3, 0.3, 0.12, MOON, { glow: true, idle: IDLE_KIND.pulse });
  b.actor({ kind: "sails", x: 0, y: 2.8, z: 1.0, yaw: 0, motion: "spin", speed: 0.7, phase: rng() * 6, colors: ["#86efac"] });
  motes(b, 0, 0, 5.0, 1.5, 4, pal.accent);
  b.add("box", 1.2, 0, 1.2, 0.8, 0.55, 0.7, pal.wall, { mat: "plain" }); // seed store
  b.add("cone", 1.2, 0.55, 1.2, 1.0, 0.5, 1.0, pal.roof, { mat: "leaf" });
  // HD: roots, a silver railing round the gallery, leaves round the crown, a silver ring round the moonstone
  roots(b, 0, 0, 0.8, pal.trunk);
  arc(b.add.bind(b), [0, 2.55, 0], [1, 0, 0], [0, 0, 1], 1.05, 0, Math.PI * 2, 16, 0.035, SILVER, hd("steel"), "cyl");
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    b.add("cyl", Math.cos(a) * 1.05, 2.3, Math.sin(a) * 1.05, 0.035, 0.25, 0.035, SILVER, hd("steel"));
  }
  leafEave(b, 0, 0, 2.7, 3.3, pal.foliage);
  arc(b.add.bind(b), [0, 1.75, 0.95], [1, 0, 0], [0, 1, 0], 0.17, 0, Math.PI * 2, 10, 0.04, SILVER, hd("steel"), "cyl");
};

/* --------------------------------- Animals --------------------------------- */

/** Common: a plain fenced pen */
const animalPen: Drawer = (b, ctx) => pen(b, ctx);

/** Uncommon: a pale-wood stable under a teal roof, a cyan sign over its doors, hay and an unlit lantern */
const stable: Drawer = (b, ctx) => {
  const { pal, rng } = ctx;
  b.add("box", -0.3, 0, -0.3, 2.0, 1.15, 1.4, pal.trunk, { mat: "wood" });
  b.add("prism", -0.3, 1.15, -0.3, 2.3, 0.75, 1.7, pal.roof, { mat: "leaf" });
  for (const x of [-0.9, -0.3, 0.3]) {
    door(b, x, 0, 0.4, 0.45, 0.7, DOOR, PALE);
    b.add("box", x, 0.36, 0.4 + 0.09, 0.45, 0.06, 0.06, pal.trunk, hd("wood")); // HD: half-door rail
  }
  b.add("box", -0.3, 0.88, 0.4 + 0.03, 0.34, 0.2, 0.06, pal.accent, { mat: "gem" });
  b.add("sphere", 0.85, 0.75, 0.52, 0.16, 0.2, 0.16, LEAF_DARK, { mat: "leaf" }); // unlit lantern
  bale(b, pal.thatch, 1.05, 0.6);
  for (let i = 0; i < 3; i++) animal(b, ctx, CIV_ANIMALS[ctx.civ].small, range(rng, -1.2, 1.2), range(rng, 0.7, 1.1));
  // HD: a leafy ridge, the lantern's pale hook
  for (let k = 0; k < 4; k++) b.add("canopy", -1.1 + k * 0.53, 1.78, -0.3, 0.5, 0.2, 0.32, pal.roof, hd("leaf"));
  b.add("box", 0.85, 0.97, 0.47, 0.04, 0.04, 0.16, pal.trunk, hd("wood"));
};

/** Rare: a round barn under a leaf roof with a silver hoop, a lit window and a pennant streaming from it */
const roundBarn: Drawer = (b, ctx) => {
  const { pal } = ctx;
  roundHouse(b, ctx, -0.2, -0.2, 1.2, 1.7, 1.2);
  b.add("cyl", -0.2, 0.9, -0.2, 2.5, 0.1, 2.5, SILVER, { mat: "steel" });
  door(b, -0.2, 0, 1.0, 0.9, 1.1, DOOR, SILVER_TRIM, "steel");
  win(b, -0.2, 1.3, 0.88, "lit", 0.3, 0.26, pal.window, undefined, SILVER_TRIM);
  pennant(b, -0.2, 2.6, -0.2, 0.9, SILVER, pal.accent, "steel");
  bale(b, pal.thatch, 1.35, -0.7, 0.5);
};

/** Epic: a glade ranch: a tree home, a round barn, a silo tree, a pen of deer, pale lamp posts and wisps */
const gladeRanch: Drawer = (b, ctx) => {
  const { pal } = ctx;
  treeHome(b.child(-1.3, -1.05), ctx);
  roundHouse(b, ctx, 1.25, -1.1, 0.75, 1.3, 0.9);
  win(b, 1.25, 0.6, -0.47, "lit", 0.26, 0.3, pal.window, undefined, SILVER_TRIM);
  b.add("cyl", 2.05, 0, 1.25, 0.8, 2.6, 0.8, pal.trunk, { mat: "wood", hdShape: "trunk" });
  b.add("cone", 2.05, 2.3, 1.25, 1.3, 1.4, 1.3, pal.foliage, { mat: "leaf" });
  b.add("octa", 2.05, 3.8, 1.25, 0.24, 0.34, 0.24, MOON, { glow: true });
  pen(b.child(0.1, 1.1), ctx, 2.0, 3);
  for (const x of [-1.55, 1.2]) lampPost(b, x, 0.4, 1.3, pal.trunk, pal.accent, "wood");
  motes(b, 2.05, 1.25, 4.4, 1.0, 3, pal.accent);
  // HD: roots under the silo tree, leaves round its crown, a silver band on the round barn
  roots(b, 2.05, 1.25, 0.32, pal.trunk);
  leafEave(b, 2.05, 1.25, 1.3, 2.3, pal.foliage);
  b.add("cyl", 1.25, 0.7, -1.1, 1.6, 0.08, 1.6, SILVER, hd("steel"));
};

/* --------------------------------- Soldiers -------------------------------- */

/** Common: a plain leaf pavilion on pale posts */
const pavilion: Drawer = (b, ctx) => {
  const { pal } = ctx;
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.55, 0.55]) b.add("cyl", sx, 0, sz, 0.07, 0.95, 0.07, pal.trunk, { mat: "wood" });
  b.add("cone", 0, 0.85, 0, 1.7, 0.8, 1.7, pal.foliage, { mat: "leaf" });
  b.add("box", 0, 0, 0, 0.9, 0.08, 0.6, pal.canvas, { mat: "cloth" });
  // HD: leaves round its eave, a bedroll on the mat
  leafEave(b, 0, 0, 1.7, 0.85, pal.foliage);
  b.add("cyl", 0, 0, 0.12, 0.14, 0.3, 0.14, "#94a3b8", hd("cloth", { rz: Math.PI / 2 }));
};

/** Uncommon: a pale barracks under a teal roof, cyan shields on its wall and a rack of bows */
const barracks: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.2, 0, 0, 2.4, 0.2, 1.5, pal.stone, { mat: "masonry" });
  b.add("box", -0.2, 0.2, 0, 2.3, 1.15, 1.4, pal.wall, { mat: "plain" });
  b.add("prism", -0.2, 1.35, 0, 2.6, 0.85, 1.7, pal.roof, { mat: "leaf" });
  door(b, -0.2, 0.2, 0.7, 0.5, 0.75, DOOR, PALE);
  for (const x of [-0.85, 0.45]) {
    b.add("box", x, 0.6, 0.7 + 0.05, 0.34, 0.42, 0.1, pal.accent, { hd: false }); // shields
    // HD: leaf-shaped shields in sea-glass, a pale boss on each
    b.add("drop", x, 0.6, 0.7 + 0.05, 0.34, 0.46, 0.08, pal.accent, hd("gem", { rz: Math.PI }));
    b.add("sphere", x, 0.82, 0.7 + 0.1, 0.08, 0.08, 0.08, pal.trunk, hd("wood"));
  }
  b.add("box", 1.25, 0, 0.1, 0.08, 1.0, 0.08, pal.trunk, { mat: "wood" }); // bow rack
  b.add("box", 1.25, 0, 0.75, 0.08, 1.0, 0.08, pal.trunk, { mat: "wood" });
  b.add("box", 1.25, 0.85, 0.42, 0.08, 0.08, 0.75, pal.trunk, { mat: "wood" });
  for (const z of [0.25, 0.5]) {
    b.add("box", 1.33, 0.25, z, 0.04, 0.9, 0.12, pal.wood, { rx: 0.2, hd: false });
    // HD: real bows, curved staves with their strings
    arc(b.add.bind(b), [1.33, 0.7, z - 0.06], [0, 1, 0], [0, 0, 1], [0.44, 0.12], 0, Math.PI, 6, 0.035, pal.wood, hd("wood"), "cyl");
    b.add("cyl", 1.33, 0.26, z - 0.06, 0.012, 0.88, 0.012, "#e7e5e4", hd("cloth"));
  }
};

/** Rare: a slender white watch spire under a leaf roof, lit slits, a silver ring and a pennant streaming on top */
const watchSpire: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("cyl", 0, 0, 0, 1.3, 3.6, 1.3, pal.wall, { mat: "plain" });
  b.add("cyl", 0, 2.6, 0, 1.55, 0.12, 1.55, SILVER, { mat: "steel" });
  b.add("cone", 0, 3.6, 0, 1.7, 1.5, 1.7, pal.roof, { mat: "leaf" });
  door(b, 0, 0, 0.65, 0.4, 0.75, DOOR, SILVER_TRIM);
  for (const y of [1.3, 2.2]) win(b, 0, y, 0.6, "lit", 0.12, 0.38, pal.window, undefined, SILVER_TRIM);
  pennant(b, 0, 5.0, 0, 0.8, SILVER, pal.accent, "steel");
  // HD: leaves round its eave, a silver band at its foot
  leafEave(b, 0, 0, 1.7, 3.6, pal.roof);
  b.add("cyl", 0, 0.9, 0, 1.4, 0.07, 1.4, SILVER, hd("steel"));
  if (ctx.budget.people > 0) {
    ctx.budget.people--;
    person(b, ctx, "soldier", 0.35, 0.9, "idle");
  }
};

/** Epic: three white spires joined by a bridge, glowing moonstones on each, lit windows, wisps circling */
const spireKeep: Drawer = (b, ctx) => {
  const { pal } = ctx;
  for (const [x, z, h] of [
    [-1.6, 0.6, 3.9],
    [1.6, 0.6, 3.9],
    [0, -0.9, 5.2]
  ]) {
    b.add("cyl", x, 0, z, 1.05, h, 1.05, pal.wall, { mat: "plain" });
    b.add("cone", x, h, z, 1.35, h * 0.45, 1.35, pal.roof, { mat: "leaf" });
    b.add("octa", x, h + h * 0.45, z, 0.26, 0.38, 0.26, MOON, { glow: true, idle: IDLE_KIND.pulse });
    b.add("cyl", x, h * 0.55, z, 1.17, 0.1, 1.17, SILVER, { mat: "steel" });
    win(b, x, h * 0.62, z + 0.43, "lit", 0.2, 0.4, pal.window, undefined, SILVER_TRIM);
    // HD: leaves round each eave, a silver band under each
    leafEave(b, x, z, 1.35, h, pal.roof);
    b.add("cyl", x, h - 0.2, z, 1.15, 0.08, 1.15, SILVER, hd("steel"));
  }
  b.add("box", 0, 2.6, 0.6, 2.4, 0.22, 0.5, pal.wall, { mat: "plain" }); // bridge
  b.add("box", 0, 0, 0.6, 1.6, 1.6, 0.9, pal.wall, { mat: "plain" });
  door(b, 0, 0, 1.05, 0.7, 1.1, DOOR, SILVER_TRIM, "steel");
  motes(b, 0, -0.9, 6.2, 2.0, 5, pal.accent);
  // HD: silver railings along the bridge, a leaf roof on the gatehouse
  for (const s of [-1, 1]) {
    b.add("box", 0, 3.04, 0.6 + s * 0.22, 2.0, 0.04, 0.04, SILVER, hd("steel"));
    for (let k = 0; k < 5; k++) b.add("cyl", -0.8 + k * 0.4, 2.82, 0.6 + s * 0.22, 0.035, 0.22, 0.035, SILVER, hd("steel"));
  }
  b.add("prism", 0, 1.6, 0.6, 1.8, 0.4, 1.1, pal.roof, hd("leaf"));
};

/** Elf structures per district, tier 0 (common) → tier 3 (epic) */
export const ELF_DRAWERS: Record<BuildingType, Drawer[]> = {
  residential_commercial: [leafHut, treeHome, willowManor, moonHall],
  food_field: [patch, field, storehouse, treeMill],
  animal_field: [animalPen, stable, roundBarn, gladeRanch],
  soldier_building: [pavilion, barracks, watchSpire, spireKeep]
};
