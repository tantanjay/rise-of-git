import { BuildingType } from "@/types";
import { range } from "@/utils/random";
import { Builder, IDLE_KIND } from "./parts";
import { Ctx, animal, cropPatch, pen, person } from "./blueprints";
import { CIV_ANIMALS } from "./palette";
import { along, arc } from "@/components/3d/world/kitParts";
import { Drawer, IRON, Trim, bale, chimney, door, hd, motes, smoke, vane, win } from "./structureKit";

/*
 * Dwarf (Ironforge) structures on the visual rarity ladder (see docs/MODEL_STYLE.md and structureKit.ts): squat dressed stone,
 * square towers, rust roofs. Tier 0 is plain stone and turf, tier 1 takes forge orange as its one accent with a small
 * prop (an anvil, a keg, a rack of axes), tier 2 adds iron bands, forge-lit windows and a smoking chimney, tier 3 is a
 * bastion with a glowing forge gate and molten channels, embers circling it.
 * HD: dressed-stone courses, rust tiles, turf, iron doors in stone frames, hooped kegs, brass from tier 3.
 */

const BRASS = "#b08d57";
const EMBER = "#fb923c";
const IRON_DOOR = "#3f3f46";
const DARK_STONE: Trim = { color: "#4b5160", mat: "masonry" };

/** A square stone tower with a crenellated cap. HD: a string course under the crenels, an arrow slit on its side */
function squareTower(b: Builder, ctx: Ctx, x: number, z: number, s: number, h: number) {
  b.add("box", x, 0, z, s, h, s, ctx.pal.stone, { mat: "masonry" });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("box", x + (sx * s) / 3, h, z + (sz * s) / 3, s * 0.26, 0.3, s * 0.26, ctx.pal.stone, { mat: "masonry" });
  b.add("box", x, h - 0.3, z, s + 0.1, 0.14, s + 0.1, ctx.pal.stone, hd("masonry"));
  b.add("box", x + s / 2 + 0.02, h * 0.45, z, 0.1, 0.42, 0.1, "#1c1917", hd("stone"));
}

/** An anvil on a stump. HD: its horn and waist, a hammer resting on it */
function anvil(b: Builder, ctx: Ctx, x: number, z: number) {
  b.add("cyl", x, 0, z, 0.36, 0.35, 0.36, ctx.pal.wood, { mat: "wood", hdShape: "trunk" });
  b.add("box", x, 0.35, z, 0.42, 0.18, 0.22, IRON, { mat: "dull" });
  b.add("cone", x + 0.29, 0.53 - 0.08 - 0.08, z, 0.1, 0.16, 0.1, IRON, hd("dull", { rz: -Math.PI / 2 }));
  b.add("box", x, 0.3, z, 0.24, 0.08, 0.16, IRON, hd("dull"));
  along(b.add.bind(b), "cyl", [x - 0.18, 0.55, z + 0.04], [x + 0.06, 0.55, z + 0.12], 0.03, 0.03, ctx.pal.wood, hd("wood"));
  b.add("box", x - 0.2, 0.53, z + 0.035, 0.08, 0.08, 0.12, IRON, hd("dull", { ry: -0.32 }));
}

/** HD: iron hoops round a keg standing at (x, y0, z), d across and h tall */
function hoops(b: Builder, x: number, y0: number, z: number, d: number, h: number) {
  for (const k of [0.15, 0.78]) b.add("cyl", x, y0 + h * k, z, d + 0.06, 0.05, d + 0.06, IRON, hd("dull"));
}

/* ------------------------------ Homes & shops ------------------------------ */

/** Common: a stone dugout in a turf mound */
const dugout: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("sphere", 0, -0.45, -0.1, 1.6, 1.5, 1.6, pal.grass, { mat: "leaf" });
  b.add("box", 0, 0, 0.62, 0.7, 0.75, 0.2, pal.stone, { mat: "masonry" });
  door(b, 0, 0, 0.72, 0.42, 0.58, IRON_DOOR, DARK_STONE, undefined, 0.06, "dull");
  b.add("box", 0.45, 0.65, -0.3, 0.2, 0.5, 0.2, pal.stone, { mat: "masonry" });
  // HD: a stone lintel, a cap on the flue, stones at the mound's foot
  b.add("box", 0, 0.75, 0.66, 0.84, 0.12, 0.28, pal.stone, hd("masonry"));
  b.add("box", 0.45, 1.15, -0.3, 0.28, 0.06, 0.28, pal.stone, hd("masonry"));
  for (const [x, z, s] of [[-0.62, 0.36, 0.26], [0.58, 0.4, 0.2], [-0.7, -0.3, 0.22]]) b.add("boulder", x, 0, z, s, s * 0.7, s * 0.9, pal.stone, hd("hide"));
};

/** Uncommon: a squat stone house under a rust roof, an orange-banded door and an anvil out front */
const stoneHouse: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.2, 0, -0.15, 2.0, 1.4, 1.6, pal.wall, { mat: "masonry" });
  b.add("box", -0.2, 1.4, -0.15, 2.3, 0.2, 1.9, pal.stone, { mat: "masonry" });
  b.add("pyramid", -0.2, 1.6, -0.15, 1.8, 0.7, 1.4, pal.roof, { mat: "tiles" });
  door(b, -0.2, 0, 0.65, 0.55, 0.85, IRON_DOOR, DARK_STONE, undefined, 0.08, "dull");
  b.add("box", -0.2, 0.86, 0.65 + 0.08, 0.6, 0.1, 0.06, pal.accent, { mat: "plain" }); // orange door band
  for (const x of [-0.85, 0.45]) win(b, x, 0.6, 0.65, "shut", 0.26, 0.26, undefined, pal.wood, DARK_STONE);
  chimney(b, pal.stone, 0.45, 1.6, -0.5, 0.8);
  anvil(b, ctx, 1.05, 0.6);
  // HD: a step to the door, corbels under the cornice
  b.add("box", -0.2, 0, 0.82, 0.75, 0.1, 0.24, pal.stone, hd("masonry"));
  for (let k = 0; k < 5; k++) b.add("box", -1.0 + k * 0.4, 1.3, 0.68, 0.14, 0.1, 0.1, pal.stone, hd("masonry"));
};

/** Rare: an iron-banded stone hall, forge-lit windows, a forge chimney smoking */
const forgeHall: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", 0, 0, -0.35, 3.0, 0.25, 2.0, pal.stone, { mat: "masonry" });
  b.add("box", 0, 0.25, -0.35, 2.8, 1.9, 1.8, pal.wall, { mat: "masonry" });
  for (const y of [0.7, 1.6]) b.add("box", 0, y, -0.35, 2.9, 0.1, 1.9, IRON, { mat: "iron" }); // iron bands
  b.add("box", 0, 2.15, -0.35, 3.1, 0.22, 2.1, pal.stone, { mat: "masonry" });
  b.add("pyramid", 0, 2.37, -0.35, 2.6, 0.9, 1.7, pal.roof, { mat: "tiles" });
  door(b, 0, 0.25, 0.55, 0.7, 1.0, IRON_DOOR, DARK_STONE, "iron", 0.08, "iron");
  for (const x of [-0.95, 0.95]) {
    win(b, x, 0.85, 0.55, "lit", 0.3, 0.32, pal.window, undefined, DARK_STONE);
    win(b, x, 1.75, 0.55, "lit", 0.3, 0.3, pal.window, undefined, DARK_STONE);
  }
  chimney(b, pal.stone, -1.0, 2.37, -0.8, 1.2, true);
  squareTower(b, ctx, 1.25, -1.0, 0.8, 2.9);
  // HD: rivets along the iron bands
  for (const y of [0.75, 1.65]) for (const x of [-1.35, -0.6, 0.6, 1.35]) b.add("sphere", x, y - 0.03, 0.62, 0.05, 0.05, 0.04, IRON, hd("iron"));
};

/** Epic: a bastion hall between square towers, its forge gate glowing, molten channels, embers circling it */
const bastionHall: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", 0, 0, -0.5, 3.8, 0.3, 2.8, pal.stone, { mat: "masonry" });
  b.add("box", 0, 0.3, -0.5, 3.4, 2.8, 2.4, pal.wall, { mat: "masonry" });
  b.add("box", 0, 3.1, -0.5, 3.6, 0.3, 2.6, pal.stone, { mat: "masonry" });
  b.add("pyramid", 0, 3.4, -0.5, 3.0, 1.4, 2.0, pal.roof, { mat: "tiles" });
  b.add("box", 0, 1.6, 0.7, 3.5, 0.12, 0.06, BRASS, { mat: "gold" }); // brass band across the front
  door(b, 0, 0.3, 0.7, 1.2, 1.6, IRON_DOOR, DARK_STONE, "gold", 0.08, "iron");
  b.add("box", 0, 0.42, 0.7 + 0.08, 1.0, 0.4, 0.04, pal.accent, { glow: true, idle: IDLE_KIND.pulse }); // forge-lit gate
  for (const x of [-1.1, 1.1]) win(b, x, 2.1, 0.7, "lit", 0.34, 0.5, pal.window, undefined, DARK_STONE);
  for (const sx of [-1, 1]) {
    squareTower(b, ctx, sx * 1.9, 1.0, 1.1, 3.9);
    b.add("box", sx * 1.9, 3.9, 1.0, 0.4, 0.14, 0.4, pal.accent, { glow: true });
    b.add("box", sx * 1.1, 0.02, 1.6, 0.35, 0.05, 1.0, EMBER, { glow: true }); // molten channels
    // HD: the channels in stone kerbs, brass bands round the towers
    for (const s of [-1, 1]) b.add("box", sx * 1.1 + s * 0.24, 0, 1.6, 0.12, 0.12, 1.0, pal.stone, hd("masonry"));
    b.add("box", sx * 1.9, 2.2, 1.0, 1.18, 0.1, 1.18, BRASS, hd("gold"));
  }
  chimney(b, pal.stone, 0, 4.8, -0.9, 1.0, true);
  motes(b, 0, -0.3, 5.6, 2.0, 5, EMBER, 0.12);
  // HD: a stone arch round the gate, brass studs along the band
  arc(b.add.bind(b), [0, 1.9, 0.75], [1, 0, 0], [0, 1, 0], 0.72, 0, Math.PI, 9, 0.14, "#4b5160", hd("masonry"), "box");
  for (const x of [-1.6, -1.2, -0.8, 0.8, 1.2, 1.6]) b.add("sphere", x, 1.63, 0.74, 0.06, 0.06, 0.04, BRASS, hd("gold"));
};

/* ---------------------------------- Farms ---------------------------------- */

/** Common: a plain mushroom, potato or hops patch */
const patch: Drawer = (b, ctx) => cropPatch(b, ctx, 1.9, 1.9);

/** Uncommon: a field walled in dry stone, an orange-banded keg by the gate */
const field: Drawer = (b, ctx) => {
  const { pal } = ctx;
  cropPatch(b, ctx, 3.0, 2.5);
  b.add("box", -0.3, 0, -1.35, 2.4, 0.5, 0.3, pal.stone, { mat: "masonry" });
  b.add("cyl", 1.25, 0, 1.0, 0.5, 0.6, 0.5, pal.wood, { mat: "wood" }); // keg…
  b.add("cyl", 1.25, 0.25, 1.0, 0.56, 0.1, 0.56, pal.accent, { mat: "plain" }); // …with an orange hoop
  // HD: capstones along the wall, iron hoops and a tap on the keg
  for (let k = 0; k < 6; k++) b.add("boulder", -1.3 + k * 0.4, 0.5, -1.35, 0.36, 0.14, 0.3, pal.stone, hd("stone", { ry: k * 0.7 }));
  hoops(b, 1.25, 0, 1.0, 0.5, 0.6);
  b.add("cyl", 1.25, 0.12, 1.27, 0.05, 0.1, 0.05, pal.wood, hd("wood", { rx: Math.PI / 2 }));
};

/** Rare: a stone storehouse with an iron door, a lit window and a turning iron vane, a stack of kegs */
const storehouse: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.45, 0, 0, 2.0, 1.5, 1.9, pal.stone, { mat: "masonry" });
  b.add("box", -0.45, 0.7, 0, 2.1, 0.1, 2.0, IRON, { mat: "iron" });
  b.add("pyramid", -0.45, 1.5, 0, 2.2, 0.9, 2.1, pal.roof, { mat: "tiles" });
  door(b, -0.45, 0, 0.95, 0.9, 1.0, IRON_DOOR, DARK_STONE, "iron", 0.08, "iron");
  win(b, -0.45, 1.15, 0.95, "lit", 0.3, 0.24, pal.window, undefined, DARK_STONE);
  vane(b, -0.45, 2.4, 0);
  for (const [x, y] of [
    [0.95, 0],
    [1.5, 0],
    [1.22, 0.62]
  ]) {
    b.add("cyl", x, y, -0.7, 0.55, 0.6, 0.55, "#7c4a24", { mat: "wood" });
    hoops(b, x, y, -0.7, 0.55, 0.6);
  }
};

/** Epic: a forge mill: a stone mill house with twin glowing chimneys, a turning gear, embers circling */
const forgeMill: Drawer = (b, ctx) => {
  const { pal, rng } = ctx;
  b.add("box", 0, 0, 0, 2.8, 2.2, 2.2, pal.stone, { mat: "masonry" });
  b.add("box", 0, 1.1, 0, 2.9, 0.12, 2.3, IRON, { mat: "iron" });
  b.add("pyramid", 0, 2.2, 0, 2.9, 0.8, 2.3, pal.roof, { mat: "tiles" });
  for (const sx of [-0.8, 0.8]) {
    b.add("box", sx, 2.2, -0.5, 0.45, 2.2, 0.45, pal.stone, { mat: "masonry" });
    b.add("box", sx, 4.4, -0.5, 0.35, 0.12, 0.35, pal.accent, { glow: true });
    smoke(b, sx, 4.52, -0.5, "#a8a29e");
    // HD: a brass collar under each glowing mouth
    b.add("box", sx, 4.24, -0.5, 0.55, 0.12, 0.55, BRASS, hd("gold"));
  }
  door(b, -0.6, 0, 1.1, 0.6, 1.0, IRON_DOOR, DARK_STONE, "gold", 0.08, "iron");
  b.add("box", 0.7, 0.5, 1.1 + 0.03, 0.6, 0.4, 0.06, pal.accent, { glow: true, idle: IDLE_KIND.pulse });
  b.actor({ kind: "gear", x: 0.4, y: 1.5, z: 1.18, yaw: 0, motion: "spin", speed: 0.5, phase: rng() * 6 });
  motes(b, 0, -0.5, 5.2, 1.4, 4, EMBER, 0.12);
  // HD: a brass frame round the forge mouth, its grate bars
  for (const s of [-1, 1]) b.add("box", 0.7 + s * 0.34, 0.46, 1.17, 0.08, 0.5, 0.08, BRASS, hd("gold"));
  b.add("box", 0.7, 0.9, 1.17, 0.76, 0.08, 0.08, BRASS, hd("gold"));
  for (let k = 0; k < 4; k++) b.add("box", 0.48 + k * 0.15, 0.5, 1.18, 0.03, 0.4, 0.03, IRON, hd("iron"));
};

/* --------------------------------- Animals --------------------------------- */

/** Common: a plain fenced pen */
const animalPen: Drawer = (b, ctx) => pen(b, ctx);

/** Uncommon: a stone stable with orange-banded stall doors, hay and a keg */
const stable: Drawer = (b, ctx) => {
  const { pal, rng } = ctx;
  b.add("box", -0.3, 0, -0.3, 2.0, 1.1, 1.4, pal.stone, { mat: "masonry" });
  b.add("pyramid", -0.3, 1.1, -0.3, 2.2, 0.6, 1.6, pal.roof, { mat: "tiles" });
  for (const x of [-0.9, -0.3, 0.3]) {
    door(b, x, 0, 0.4, 0.45, 0.7, pal.wood, DARK_STONE);
    b.add("box", x, 0.45, 0.4 + 0.08, 0.47, 0.08, 0.06, pal.accent, { mat: "plain" });
  }
  bale(b, pal.thatch, 1.05, 0.6);
  b.add("cyl", 1.1, 0, -0.35, 0.5, 0.6, 0.5, "#7c4a24", { mat: "wood" });
  hoops(b, 1.1, 0, -0.35, 0.5, 0.6);
  for (let i = 0; i < 3; i++) animal(b, ctx, CIV_ANIMALS[ctx.civ].small, range(rng, -1.2, 1.2), range(rng, 0.7, 1.1));
};

/** Rare: a stone barn with iron bands and doors, a lit loft and a forge chimney smoking */
const stoneBarn: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.2, 0, -0.2, 2.6, 1.7, 2.2, pal.stone, { mat: "masonry" });
  b.add("box", -0.2, 0.85, -0.2, 2.7, 0.12, 2.3, IRON, { mat: "iron" });
  b.add("pyramid", -0.2, 1.7, -0.2, 2.8, 1.0, 2.4, pal.roof, { mat: "tiles" });
  door(b, -0.2, 0, 0.9, 1.1, 1.2, IRON_DOOR, DARK_STONE, "iron", 0.08, "iron");
  win(b, -0.2, 1.4, 0.9, "lit", 0.34, 0.26, pal.window, undefined, DARK_STONE);
  chimney(b, pal.stone, -1.2, 1.7, -0.9, 1.2, true);
  bale(b, pal.thatch, 1.4, -0.6, 0.5);
  // HD: buttresses at the front corners
  for (const s of [-1, 1]) b.add("box", -0.2 + s * 1.1, 0, 0.92, 0.26, 1.2, 0.2, pal.stone, hd("masonry"));
};

/** Epic: a hold ranch: a stone house, a barn, a square watch tower with a glowing cap, a pen, embers circling */
const holdRanch: Drawer = (b, ctx) => {
  const { pal } = ctx;
  stoneHouse(b.child(-1.3, -1.05), ctx);
  b.add("box", 1.2, 0, -1.1, 2.0, 1.3, 1.4, pal.stone, { mat: "masonry" });
  b.add("pyramid", 1.2, 1.3, -1.1, 2.2, 0.8, 1.6, pal.roof, { mat: "tiles" });
  win(b, 1.2, 0.7, -0.4, "lit", 0.34, 0.28, pal.window, undefined, DARK_STONE);
  squareTower(b, ctx, 2.05, 1.25, 0.9, 2.8);
  b.add("box", 2.05, 2.8, 1.25, 0.34, 0.16, 0.34, pal.accent, { glow: true });
  pen(b.child(0.1, 1.1), ctx, 2.0, 3);
  motes(b, 2.05, 1.25, 3.8, 1.0, 3, EMBER, 0.12);
  // HD: brass bands round the watch tower, a door in the barn
  for (const y of [0.9, 1.9]) b.add("box", 2.05, y, 1.25, 0.98, 0.08, 0.98, BRASS, hd("gold"));
  b.add("box", 1.2, 0, -0.37, 0.7, 0.6, 0.06, IRON_DOOR, hd("iron"));
  for (const y of [0.12, 0.42]) b.add("box", 1.2, y, -0.32, 0.66, 0.05, 0.05, BRASS, hd("gold"));
};

/* --------------------------------- Soldiers -------------------------------- */

/** Common: a plain stone dugout guard post */
const guardPost: Drawer = (b, ctx) => dugout(b, ctx);

/** Uncommon: a half-buried bunker with an orange lintel and a rack of axes */
const bunker: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("sphere", -0.2, -0.5, -0.4, 2.8, 1.9, 1.6, pal.grass, { mat: "leaf" });
  b.add("box", -0.2, 0, 0.2, 2.4, 1.0, 1.0, pal.stone, { mat: "masonry" });
  for (let i = 0; i < 5; i++) b.add("box", -1.2 + i * 0.5, 1.0, 0.62, 0.26, 0.24, 0.16, pal.stone, { mat: "masonry" });
  door(b, -0.2, 0, 0.7, 0.8, 0.8, IRON_DOOR, DARK_STONE, undefined, 0.06, "dull");
  b.add("box", -0.2, 0.8, 0.7 + 0.06, 0.9, 0.08, 0.06, pal.accent, { mat: "plain" });
  b.add("box", 1.25, 0, 0.3, 0.08, 1.0, 0.08, pal.wood, { mat: "wood" }); // axe rack
  b.add("box", 1.25, 0.85, 0.3, 0.08, 0.08, 0.7, pal.wood, { mat: "wood" });
  for (const z of [0.1, 0.45]) {
    b.add("box", 1.33, 0.4, z, 0.04, 0.24, 0.2, "#9ca3af", { mat: "dull" });
    // HD: the axes' hafts
    b.add("cyl", 1.33, 0.05, z - 0.08, 0.04, 0.82, 0.04, pal.wood, hd("wood"));
  }
};

/** Rare: an iron-banded square stone tower, a lit slit, a brazier burning on top and a banner streaming from it */
const stoneTower: Drawer = (b, ctx) => {
  const { pal } = ctx;
  squareTower(b, ctx, 0, 0, 1.5, 3.0);
  b.add("box", 0, 1.5, 0, 1.6, 0.12, 1.6, IRON, { mat: "iron" });
  door(b, 0, 0, 0.75, 0.42, 0.8, IRON_DOOR, DARK_STONE, "iron", 0.08, "iron");
  win(b, 0, 1.8, 0.75, "lit", 0.22, 0.4, pal.window, undefined, DARK_STONE);
  b.add("cyl", -0.3, 3.0, -0.3, 0.36, 0.3, 0.36, IRON, { mat: "iron" });
  b.add("cone", -0.3, 3.3, -0.3, 0.28, 0.36, 0.28, EMBER, { glow: true });
  b.add("cyl", 0.4, 3.0, 0.4, 0.05, 1.2, 0.05, pal.wood, { mat: "wood" });
  b.add("box", 0.67, 3.8, 0.4, 0.5, 0.36, 0.03, pal.accent, { idle: IDLE_KIND.flutter, mat: "cloth" });
  // HD: the brazier's rim and coals, the banner's crossbar and finial
  b.add("cyl", -0.3, 3.27, -0.3, 0.42, 0.05, 0.42, IRON, hd("iron"));
  b.add("sphere", -0.3, 3.2, -0.3, 0.3, 0.12, 0.3, "#7f1d1d", hd("lava"));
  b.add("box", 0.67, 4.16, 0.4, 0.56, 0.03, 0.03, pal.wood, hd("wood"));
  b.add("sphere", 0.4, 4.2, 0.4, 0.1, 0.1, 0.1, IRON, hd("iron"));
  if (ctx.budget.people > 0) {
    ctx.budget.people--;
    person(b, ctx, "soldier", 0.35, 1.0, "idle");
  }
};

/** Epic: a bastion: a great stone keep between square towers, a glowing forge gate, a hammer crest, embers circling */
const bastion: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", 0, 0, -0.4, 3.6, 2.6, 2.8, pal.stone, { mat: "masonry" });
  b.add("box", 0, 2.6, -0.4, 2.4, 1.0, 1.8, pal.wall, { mat: "masonry" });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      squareTower(b, ctx, sx * 1.75, -0.4 + sz * 1.35, 1.1, 3.4);
      b.add("box", sx * 1.75, 3.4, -0.4 + sz * 1.35, 0.36, 0.14, 0.36, pal.accent, { glow: true });
    }
  door(b, 0, 0, 1.0, 1.1, 1.5, IRON_DOOR, DARK_STONE, "gold", 0.06, "iron");
  b.add("box", 0, 0.1, 1.0 + 0.08, 0.9, 0.4, 0.04, pal.accent, { glow: true, idle: IDLE_KIND.pulse });
  b.add("box", 0, 3.7, -0.4, 1.2, 0.4, 0.4, BRASS, { mat: "gold" }); // hammer crest
  b.add("cyl", 0, 3.1, -0.4, 0.12, 0.6, 0.12, pal.wood, { mat: "wood" });
  for (const x of [-0.8, 0.8]) win(b, x, 1.6, 1.0, "lit", 0.24, 0.42, pal.window, undefined, DARK_STONE);
  motes(b, 0, -0.4, 4.9, 2.1, 5, EMBER, 0.12);
  // HD: a leather grip on the hammer's haft and brass faces on its head, crenels on the keep
  b.add("cyl", 0, 3.2, -0.4, 0.15, 0.3, 0.15, "#5b3b22", hd("leather"));
  for (const s of [-1, 1]) b.add("box", s * 0.63, 3.66, -0.4, 0.06, 0.48, 0.48, "#d4a017", hd("gold"));
  for (let k = 0; k < 5; k++) b.add("box", -0.96 + k * 0.48, 3.6, 0.42, 0.26, 0.24, 0.16, pal.wall, hd("masonry"));
};

/** Dwarf structures per district, tier 0 (common) → tier 3 (epic) */
export const DWARF_DRAWERS: Record<BuildingType, Drawer[]> = {
  residential_commercial: [dugout, stoneHouse, forgeHall, bastionHall],
  food_field: [patch, field, storehouse, forgeMill],
  animal_field: [animalPen, stable, stoneBarn, holdRanch],
  soldier_building: [guardPost, bunker, stoneTower, bastion]
};
