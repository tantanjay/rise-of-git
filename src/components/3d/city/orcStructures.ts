import { BuildingType } from "@/types";
import { range } from "@/utils/random";
import { Builder, IDLE_KIND } from "./parts";
import { Ctx, DOOR, animal, cropPatch, pen, person } from "./blueprints";
import { CIV_ANIMALS } from "./palette";
import { along, skull } from "@/components/3d/world/kitParts";
import { Drawer, IRON, Trim, bale, circling, door, hd, smoke, win } from "./structureKit";

/*
 * Orc (Drak'mar) structures on the visual rarity ladder (see docs/MODEL_STYLE.md and structureKit.ts): hide, rough logs, bone and
 * spikes. Tier 0 is a plain hide shelter, tier 1 takes war-paint red as its one accent with a small prop (a skull
 * totem, a war drum, a weapon rack), tier 2 adds iron spikes and banding, firelit openings and a smoking fire pit,
 * tier 3 is a great spiked war hall with braziers blazing, crows circling over it.
 * HD: log walls, hide roofs and tents, rope lashings, real skulls on the totems, stones and logs in the fire pits,
 * braziers on legs, crossbars on the war banners.
 */

const SPIKE = "#57534e";
const FIRE = "#f97316";
const CROW = "#1c1917";
const ROPE = "#a1784a";
const LOG: Trim = { color: "#3f2a1a", mat: "wood" };

/** A crude ridge of bone tusks over a doorway (its front face at z) */
function tusks(b: Builder, ctx: Ctx, x: number, y0: number, z: number, s = 1) {
  b.add("cone", x - 0.28 * s, y0, z + 0.08, 0.07 * s, 0.45 * s, 0.07 * s, ctx.pal.bone, { rz: -0.5, mat: "bone" });
  b.add("cone", x + 0.28 * s, y0, z + 0.08, 0.07 * s, 0.45 * s, 0.07 * s, ctx.pal.bone, { rz: 0.5, mat: "bone" });
}

/** A skull on a stake. HD: a real skull, lashed on */
function skullTotem(b: Builder, ctx: Ctx, x: number, z: number, h = 1.2) {
  b.add("cyl", x, 0, z, 0.09, h, 0.09, ctx.pal.wood, { mat: "wood" });
  b.add("sphere", x, h - 0.05, z, 0.28, 0.26, 0.28, ctx.pal.bone, { hd: false });
  skull(b.add.bind(b), x, h, z, 0.3, ctx.pal.bone, 0, hd("bone"));
  b.add("cyl", x, h - 0.2, z, 0.13, 0.06, 0.13, ROPE, hd("cloth"));
}

/** A fire pit with a ring of stones; `lit` makes it glow and smoke (the rare tier's looping effect). HD: the stones, logs */
function firePit(b: Builder, ctx: Ctx, x: number, z: number, lit: boolean) {
  b.add("cyl", x, 0, z, 0.8, 0.16, 0.8, ctx.pal.stone, { mat: "stone" });
  b.add("cone", x, 0.16, z, 0.42, 0.5, 0.42, FIRE, { glow: lit, idle: lit ? IDLE_KIND.pulse : undefined });
  if (lit) smoke(b, x, 0.7, z, "#78716c", 0.9);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    b.add("boulder", x + Math.cos(a) * 0.4, 0, z + Math.sin(a) * 0.4, 0.2, 0.2, 0.17, ctx.pal.stone, hd("stone", { ry: a }));
  }
  for (const a of [0.3, 2.4, 4.4]) along(b.add.bind(b), "cyl", [x + Math.cos(a) * 0.32, 0.16, z + Math.sin(a) * 0.32], [x + Math.cos(a) * 0.04, 0.36, z + Math.sin(a) * 0.04], 0.07, 0.07, "#292524", hd("wood"));
}

/** HD: rope lashed round a post at (x, z), at the heights given */
function lash(b: Builder, x: number, z: number, w: number, ys: number[]) {
  for (const y of ys) b.add("cyl", x, y, z, w + 0.06, 0.05, w + 0.06, ROPE, hd("cloth"));
}

/** HD: log ends at the four corners of a log house (w × d about x, z, h tall) */
function logEnds(b: Builder, x: number, z: number, w: number, d: number, h: number, color: string) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("cyl", x + (sx * w) / 2, 0, z + (sz * d) / 2, 0.16, h, 0.16, color, hd("wood"));
}

/* ------------------------------ Homes & shops ------------------------------ */

/** Common: a plain hide yurt */
const yurt: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("cyl", 0, 0, 0, 1.4, 0.75, 1.4, pal.canvas, { mat: "hide" });
  b.add("cone", 0, 0.75, 0, 1.55, 0.7, 1.55, pal.thatch, { mat: "fur" });
  door(b, 0, 0, 0.7, 0.38, 0.55, DOOR, LOG, undefined, 0.06);
  // HD: ropes round its wall, a wooden smoke ring at its crown
  for (const y of [0.2, 0.55]) b.add("cyl", 0, y, 0, 1.46, 0.04, 1.46, ROPE, hd("cloth"));
  b.add("cyl", 0, 1.32, 0, 0.3, 0.1, 0.3, pal.wood, hd("wood"));
};

/** Uncommon: a log hut under a hide roof, a red war-paint hand on the door and a skull totem beside it */
const logHut: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.2, 0, -0.15, 2.0, 1.3, 1.5, pal.wall, { mat: "wood" });
  b.add("pyramid", -0.2, 1.3, -0.15, 2.4, 1.2, 1.9, pal.roof, { mat: "hide" });
  door(b, -0.2, 0, 0.6, 0.5, 0.85, DOOR, LOG);
  b.add("box", -0.2, 0.95, 0.6 + 0.03, 0.34, 0.3, 0.06, pal.accent, { mat: "plain" }); // war-paint hand
  tusks(b, ctx, -0.2, 0.55, 0.6);
  skullTotem(b, ctx, 1.05, 0.55);
  // HD: log ends at its corners
  logEnds(b, -0.2, -0.15, 2.0, 1.5, 1.3, pal.wood);
};

/** Rare: a longhouse with iron spikes along its roof and banding, firelit openings and a fire pit smoking */
const longhouse: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", 0, 0, -0.5, 3.0, 1.6, 1.8, pal.wall, { mat: "wood" });
  b.add("box", 0, 0.8, -0.5, 3.1, 0.12, 1.9, IRON, { mat: "iron" });
  b.add("pyramid", 0, 1.6, -0.5, 3.4, 1.3, 2.2, pal.roof, { mat: "hide" });
  for (let i = 0; i < 5; i++) b.add("cone", -1.2 + i * 0.6, 2.75, -0.5, 0.12, 0.45, 0.12, SPIKE, { mat: "iron" }); // roof spikes
  door(b, 0, 0, 0.4, 0.6, 1.0, DOOR, LOG, "iron");
  for (const x of [-1.0, 1.0]) win(b, x, 0.6, 0.4, "lit", 0.3, 0.3, "#fdba74", undefined, LOG);
  tusks(b, ctx, 0, 0.75, 0.4, 1.3);
  firePit(b, ctx, 0.9, 1.0, true);
  // HD: log ends, rivets along the band
  logEnds(b, 0, -0.5, 3.0, 1.8, 1.6, pal.wood);
  for (const x of [-1.3, -0.65, 0.65, 1.3]) b.add("sphere", x, 0.83, 0.46, 0.06, 0.06, 0.04, IRON, hd("iron"));
};

/** Epic: a great war hall bristling with iron spikes, a bone gate, braziers blazing either side, crows circling */
const warHall: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", 0, 0, -0.6, 3.8, 0.3, 2.8, pal.stone, { mat: "stone" });
  b.add("box", 0, 0.3, -0.6, 3.4, 2.4, 2.4, pal.wall, { mat: "wood" });
  b.add("box", 0, 1.4, -0.6, 3.5, 0.14, 2.5, IRON, { mat: "iron" });
  b.add("pyramid", 0, 2.7, -0.6, 3.9, 2.0, 2.9, pal.roof, { mat: "hide" });
  for (let i = 0; i < 6; i++) b.add("cone", -1.6 + i * 0.64, 2.7, 0.65, 0.14, 0.6, 0.14, SPIKE, { rx: 0.5, mat: "iron" }); // spiked eaves
  door(b, 0, 0.3, 0.6, 1.0, 1.5, DOOR, LOG, "iron");
  b.add("sphere", 0, 1.95, 0.7, 0.5, 0.45, 0.3, pal.bone, { mat: "bone" }); // great skull over the gate
  b.add("box", 0, 2.0, 0.85, 0.3, 0.1, 0.06, FIRE, { glow: true }); // its burning eyes
  tusks(b, ctx, 0, 0.6, 0.6, 2.2);
  for (const sx of [-1, 1]) {
    win(b, sx * 1.15, 1.0, 0.6, "lit", 0.34, 0.5, "#fdba74", undefined, LOG);
    b.add("cyl", sx * 1.85, 0, 1.4, 0.4, 1.0, 0.4, IRON, { mat: "iron" }); // braziers
    b.add("cone", sx * 1.85, 1.0, 1.4, 0.44, 0.6, 0.44, FIRE, { glow: true, idle: IDLE_KIND.pulse });
    b.add("cyl", sx * 1.85, 0, 0.0, 0.12, 4.2, 0.12, pal.wood, { mat: "wood" }); // war banners
    b.add("box", sx * 1.85 + sx * 0.32, 3.1, 0.0, 0.55, 0.9, 0.04, pal.accent, { idle: IDLE_KIND.flutter, mat: "cloth" });
    // HD: horns on the great skull, a rim on each brazier, the banners' crossbars and bone finials
    b.add("cone", sx * 0.26, 2.2, 0.7, 0.1, 0.36, 0.1, pal.bone, hd("bone", { hdShape: "horn", rz: -sx * 0.6 }));
    b.add("cyl", sx * 1.85, 0.94, 1.4, 0.48, 0.07, 0.48, IRON, hd("iron"));
    b.add("box", sx * 1.85 + sx * 0.32, 4.0, 0.0, 0.62, 0.04, 0.04, pal.wood, hd("wood"));
    b.add("cone", sx * 1.85, 4.2, 0.0, 0.1, 0.24, 0.1, pal.bone, hd("bone"));
  }
  // HD: teeth along the great skull's jaw, log ends
  for (let k = 0; k < 5; k++) b.add("cone", -0.16 + k * 0.08, 1.88, 0.83, 0.04, 0.08, 0.04, pal.bone, hd("bone", { rx: Math.PI }));
  logEnds(b, 0, -0.6, 3.4, 2.4, 2.7, pal.wood);
  circling(b, 0, -0.6, 5.6, 2.0, 4, CROW);
};

/* ---------------------------------- Farms ---------------------------------- */

/** Common: a plain gourd patch or drying rack (its cook fire unlit) */
const patch: Drawer = (b, ctx) => cropPatch(b, ctx, 1.9, 1.9);

/** Uncommon: a field fenced with stakes, a red-painted war drum and a skull totem */
const field: Drawer = (b, ctx) => {
  const { pal } = ctx;
  cropPatch(b, ctx, 3.0, 2.5);
  for (let i = 0; i < 6; i++) b.add("cone", -1.4 + i * 0.5, 0, -1.35, 0.14, 0.7, 0.14, pal.wood, { mat: "wood" });
  skullTotem(b, ctx, 1.15, 1.0);
  b.add("cyl", 1.25, 0, -0.95, 0.55, 0.55, 0.55, pal.accent, { mat: "leather" }); // war drum
  b.add("cyl", 1.25, 0.55, -0.95, 0.5, 0.06, 0.5, pal.canvas, { mat: "hide" });
  // HD: the stakes bound with a rope, the drum's lacing and two sticks on it
  b.add("box", -0.15, 0.3, -1.35, 2.6, 0.04, 0.04, ROPE, hd("cloth"));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    along(b.add.bind(b), "cyl", [1.25 + Math.cos(a) * 0.29, 0.06, -0.95 + Math.sin(a) * 0.29], [1.25 + Math.cos(a + 0.5) * 0.29, 0.54, -0.95 + Math.sin(a + 0.5) * 0.29], 0.02, 0.02, ROPE, hd("cloth"));
  }
  for (const s of [-1, 1]) along(b.add.bind(b), "cyl", [1.25 + s * 0.12, 0.62, -1.1], [1.25 + s * 0.05, 0.64, -0.75], 0.03, 0.03, pal.wood, hd("wood"));
};

/** Rare: a hide-covered store with iron banding, a firelit door and a smoking smokehouse chimney */
const smokehouse: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.45, 0, 0, 2.0, 1.4, 1.9, pal.wood, { mat: "wood" });
  b.add("box", -0.45, 0.9, 0, 2.1, 0.5, 2.0, pal.canvas, { mat: "hide" });
  b.add("box", -0.45, 0.4, 0, 2.06, 0.1, 1.96, IRON, { mat: "iron" });
  b.add("pyramid", -0.45, 1.4, 0, 2.3, 1.1, 2.2, pal.roof, { mat: "hide" });
  door(b, -0.45, 0, 0.95, 0.9, 1.05, DOOR, LOG, "iron");
  win(b, -0.45, 1.05, 0.95, "lit", 0.3, 0.24, "#fdba74", undefined, LOG);
  b.add("box", 1.15, 0, -0.5, 0.5, 2.0, 0.5, pal.stone, { mat: "stone" });
  smoke(b, 1.15, 2.0, -0.5, "#78716c");
  b.add("cyl", 1.15, 0, 0.7, 0.9, 1.0, 0.9, pal.thatch, { mat: "fur" }); // woven basket hut
  // HD: a woven lid on the basket hut, bands round it, a cap on the smoke stack
  b.add("cone", 1.15, 1.0, 0.7, 1.0, 0.4, 1.0, pal.thatch, hd("fur"));
  for (const y of [0.3, 0.7]) b.add("cyl", 1.15, y, 0.7, 0.96, 0.05, 0.96, ROPE, hd("cloth"));
  b.add("box", 1.15, 1.88, -0.5, 0.62, 0.12, 0.62, pal.stone, hd("stone"));
};

/** Epic: a war mill: a spiked log tower with hide sails, a blazing beacon on top and crows circling */
const warMill: Drawer = (b, ctx) => {
  const { pal, rng } = ctx;
  b.add("box", 0, 0, 0, 1.6, 3.4, 1.6, pal.wood, { mat: "wood" });
  b.add("box", 0, 1.7, 0, 1.7, 0.14, 1.7, IRON, { mat: "iron" });
  b.add("pyramid", 0, 3.4, 0, 2.1, 1.4, 2.1, pal.roof, { mat: "hide" });
  for (const sx of [-1, 1]) b.add("cone", sx * 0.85, 2.6, 0.85, 0.12, 0.7, 0.12, pal.bone, { rx: 0.6, rz: -sx * 0.6, mat: "bone" });
  b.add("cyl", 0, 4.8, 0, 0.5, 0.3, 0.5, IRON, { mat: "iron" });
  b.add("cone", 0, 5.1, 0, 0.42, 0.6, 0.42, FIRE, { glow: true, idle: IDLE_KIND.pulse }); // beacon
  door(b, 0, 0, 0.8, 0.5, 0.85, DOOR, LOG, "iron");
  win(b, 0, 2.0, 0.8, "lit", 0.26, 0.3, "#fdba74", undefined, LOG);
  b.actor({ kind: "sails", x: 0, y: 2.7, z: 0.95, yaw: 0, motion: "spin", speed: 0.9, phase: rng() * 6, colors: [pal.canvas] });
  circling(b, 0, 0, 6.2, 1.6, 3, CROW);
  b.add("box", 1.2, 0, 1.2, 0.8, 0.55, 0.7, pal.wood, { mat: "wood" });
  b.add("pyramid", 1.2, 0.55, 1.2, 1.0, 0.5, 0.9, pal.thatch, { mat: "fur" });
  // HD: log ends, a rim and spikes round the beacon, rivets on the band
  logEnds(b, 0, 0, 1.6, 1.6, 3.4, pal.wood);
  b.add("cyl", 0, 5.04, 0, 0.58, 0.06, 0.58, IRON, hd("iron"));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.add("cone", Math.cos(a) * 0.3, 5.06, Math.sin(a) * 0.3, 0.06, 0.18, 0.06, SPIKE, hd("iron"));
  }
};

/* --------------------------------- Animals --------------------------------- */

/** Common: a plain staked pen */
const animalPen: Drawer = (b, ctx) => pen(b, ctx);

/** Uncommon: a log stable with red-painted stall doors, a skull totem and hay */
const stable: Drawer = (b, ctx) => {
  const { pal, rng } = ctx;
  b.add("box", -0.3, 0, -0.3, 2.0, 1.15, 1.4, pal.wood, { mat: "wood" });
  b.add("pyramid", -0.3, 1.15, -0.3, 2.4, 0.9, 1.8, pal.roof, { mat: "hide" });
  for (const x of [-0.9, -0.3, 0.3]) door(b, x, 0, 0.4, 0.45, 0.7, pal.accent, LOG);
  skullTotem(b, ctx, 1.05, -0.4);
  bale(b, pal.thatch, 1.05, 0.6);
  for (let i = 0; i < 3; i++) animal(b, ctx, CIV_ANIMALS[ctx.civ].small, range(rng, -1.2, 1.2), range(rng, 0.7, 1.1));
  logEnds(b, -0.3, -0.3, 2.0, 1.4, 1.15, pal.wood);
};

/** Rare: a beast hall with iron-spiked roof and banding, a firelit loft, a fire pit smoking out front */
const beastHall: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.2, 0, -0.3, 2.6, 1.6, 2.0, pal.wood, { mat: "wood" });
  b.add("box", -0.2, 0.8, -0.3, 2.7, 0.12, 2.1, IRON, { mat: "iron" });
  b.add("pyramid", -0.2, 1.6, -0.3, 3.0, 1.3, 2.4, pal.roof, { mat: "hide" });
  for (let i = 0; i < 4; i++) b.add("cone", -1.1 + i * 0.6, 2.75, -0.3, 0.12, 0.4, 0.12, SPIKE, { mat: "iron" });
  door(b, -0.2, 0, 0.7, 1.0, 1.15, DOOR, LOG, "iron");
  win(b, -0.2, 1.3, 0.7, "lit", 0.34, 0.26, "#fdba74", undefined, LOG);
  firePit(b, ctx, 1.25, 1.0, true);
  // HD: log ends
  logEnds(b, -0.2, -0.3, 2.6, 2.0, 1.6, pal.wood);
};

/** Epic: a warg ranch: a log hut, a beast hall, a bone-crowned lookout with a beacon, a pen, crows circling */
const wargRanch: Drawer = (b, ctx) => {
  const { pal } = ctx;
  logHut(b.child(-1.3, -1.05), ctx);
  b.add("box", 1.2, 0, -1.1, 2.0, 1.3, 1.4, pal.wood, { mat: "wood" });
  b.add("pyramid", 1.2, 1.3, -1.1, 2.3, 1.0, 1.7, pal.roof, { mat: "hide" });
  win(b, 1.2, 0.7, -0.4, "lit", 0.34, 0.28, "#fdba74", undefined, LOG);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("box", 2.05 + sx * 0.32, 0, 1.25 + sz * 0.32, 0.12, 2.6, 0.12, pal.wood, { mat: "wood" });
  b.add("box", 2.05, 2.2, 1.25, 0.9, 0.14, 0.9, pal.wood, { mat: "wood" });
  b.add("cone", 2.05, 2.34, 1.25, 0.4, 0.55, 0.4, FIRE, { glow: true, idle: IDLE_KIND.pulse });
  pen(b.child(0.1, 1.1), ctx, 2.0, 3);
  circling(b, 2.05, 1.25, 4.0, 1.1, 3, CROW);
  // HD: the lookout's posts lashed, a ladder up its front, an iron bowl under the beacon, bones round its rim
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lash(b, 2.05 + sx * 0.32, 1.25 + sz * 0.32, 0.12, [0.8, 1.9]);
  for (const sx of [-1, 1]) b.add("box", 2.05 + sx * 0.14, 0, 1.25 + 0.46, 0.05, 2.2, 0.05, pal.wood, hd("wood"));
  for (let k = 0; k < 6; k++) b.add("box", 2.05, 0.3 + k * 0.32, 1.25 + 0.46, 0.3, 0.04, 0.04, pal.wood, hd("wood"));
  b.add("cyl", 2.05, 2.34, 1.25, 0.5, 0.12, 0.5, IRON, hd("iron"));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add("cone", 2.05 + sx * 0.4, 2.34, 1.25 + sz * 0.4, 0.06, 0.3, 0.06, pal.bone, hd("bone", { rx: sz * 0.4, rz: -sx * 0.4 }));
};

/* --------------------------------- Soldiers -------------------------------- */

/** Common: a plain hide war tent */
const warTent: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("cone", 0, 0, 0, 1.5, 1.3, 1.5, pal.canvas, { mat: "hide" });
  door(b, 0, 0, 0.62, 0.36, 0.55, DOOR, LOG, undefined, 0.06);
  // HD: its poles poking out of the top, bound with rope, stakes round its foot
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    along(b.add.bind(b), "cyl", [Math.cos(a) * 0.08, 1.1, Math.sin(a) * 0.08], [Math.cos(a) * 0.2, 1.55, Math.sin(a) * 0.2], 0.04, 0.04, pal.wood, hd("wood"));
  }
  b.add("cyl", 0, 1.16, 0, 0.16, 0.06, 0.16, ROPE, hd("cloth"));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 1.0;
    b.add("cone", Math.cos(a) * 0.76, 0, Math.sin(a) * 0.76, 0.05, 0.14, 0.05, pal.wood, hd("wood"));
  }
};

/** Uncommon: a longhouse behind sharpened stakes, a red war-paint shield and a rack of axes */
const barracks: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", -0.2, 0, -0.1, 2.4, 1.2, 1.4, pal.wood, { mat: "wood" });
  b.add("pyramid", -0.2, 1.2, -0.1, 2.7, 0.9, 1.7, pal.roof, { mat: "hide" });
  door(b, -0.2, 0, 0.6, 0.55, 0.8, DOOR, LOG);
  b.add("sphere", -0.2, 0.95, 0.68, 0.36, 0.36, 0.14, pal.accent, { mat: "leather" }); // red war shield
  for (const x of [-1.1, -0.75, 0.35, 0.7]) b.add("cone", x, 0, 0.85, 0.12, 0.6, 0.12, pal.wood, { rx: 0.35, mat: "wood" });
  b.add("box", 1.25, 0, 0.0, 0.08, 1.0, 0.08, pal.wood, { mat: "wood" }); // axe rack
  b.add("box", 1.25, 0.85, 0.0, 0.08, 0.08, 0.7, pal.wood, { mat: "wood" });
  for (const z of [-0.2, 0.15]) {
    b.add("box", 1.33, 0.4, z, 0.04, 0.26, 0.22, "#9ca3af", { mat: "dull" });
    b.add("cyl", 1.33, 0.05, z - 0.09, 0.04, 0.82, 0.04, pal.wood, hd("wood")); // HD: the axes' hafts
  }
  // HD: a bone boss on the shield, log ends
  b.add("sphere", -0.2, 1.08, 0.76, 0.1, 0.1, 0.06, pal.bone, hd("bone"));
  logEnds(b, -0.2, -0.1, 2.4, 1.4, 1.2, pal.wood);
};

/** Rare: a log watchtower with iron spikes, a firelit lookout and a red banner streaming over it */
const watchtower: Drawer = (b, ctx) => {
  const { pal } = ctx;
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.6, 0.6]) b.add("box", sx, 0, sz, 0.16, 2.7, 0.16, pal.wood, { mat: "wood" });
  b.add("box", 0, 1.3, 0, 1.4, 0.12, 1.4, IRON, { mat: "iron" });
  b.add("box", 0, 2.6, 0, 1.6, 0.16, 1.6, pal.wood, { mat: "wood" });
  for (const s of [-1, 1]) {
    b.add("box", 0, 2.76, s * 0.76, 1.6, 0.35, 0.06, pal.wood, { mat: "wood" });
    b.add("box", s * 0.76, 2.76, 0, 0.06, 0.35, 1.6, pal.wood, { mat: "wood" });
  }
  b.add("pyramid", 0, 3.3, 0, 1.8, 0.9, 1.8, pal.roof, { mat: "hide" });
  for (const sx of [-1, 1]) b.add("cone", sx * 0.95, 3.0, 0.95, 0.1, 0.5, 0.1, SPIKE, { rx: 0.7, rz: -sx * 0.7, mat: "iron" });
  b.add("box", 0, 2.95, 0.8 + 0.03, 0.4, 0.2, 0.06, FIRE, { glow: true });
  b.add("cyl", 0.45, 4.1, 0, 0.05, 0.9, 0.05, pal.wood, { mat: "wood" });
  b.add("box", 0.72, 4.55, 0, 0.5, 0.36, 0.03, pal.accent, { idle: IDLE_KIND.flutter, mat: "cloth" });
  // HD: braces between the legs, corner posts holding up the roof, the banner's crossbar
  for (const s of [-1, 1]) {
    along(b.add.bind(b), "box", [-0.6, 0.2, s * 0.6], [0.6, 1.3, s * 0.6], 0.07, 0.06, pal.wood, hd("wood"));
    along(b.add.bind(b), "box", [s * 0.6, 0.2, -0.6], [s * 0.6, 1.3, 0.6], 0.06, 0.07, pal.wood, hd("wood"));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("box", sx * 0.72, 2.76, sz * 0.72, 0.08, 0.6, 0.08, pal.wood, hd("wood"));
  b.add("box", 0.72, 4.91, 0, 0.56, 0.03, 0.03, pal.wood, hd("wood"));
  if (ctx.budget.people > 0) {
    ctx.budget.people--;
    person(b, ctx, "soldier", 0.35, 1.0, "idle");
  }
};

/** Epic: a war fort: a spiked war hall behind a log palisade, a bone gate, braziers blazing, crows circling */
const warFort: Drawer = (b, ctx) => {
  const { pal } = ctx;
  for (let i = 0; i < 13; i++) {
    const x = -2.4 + i * 0.4;
    if (Math.abs(x) < 0.6) continue;
    b.add("cyl", x, 0, 1.4, 0.36, 1.9, 0.36, pal.wood, { mat: "wood" });
    b.add("cone", x, 1.9, 1.4, 0.36, 0.45, 0.36, pal.wood, { mat: "wood" });
  }
  b.add("box", 0, 0, -0.6, 3.4, 2.6, 2.4, pal.wall, { mat: "wood" });
  b.add("box", 0, 1.3, -0.6, 3.5, 0.14, 2.5, IRON, { mat: "iron" });
  b.add("pyramid", 0, 2.6, -0.6, 3.8, 2.0, 2.8, pal.roof, { mat: "hide" });
  for (let i = 0; i < 5; i++) b.add("cone", -1.4 + i * 0.7, 4.0, -0.6, 0.14, 0.6, 0.14, SPIKE, { mat: "iron" });
  door(b, 0, 0, 0.6, 0.9, 1.4, DOOR, LOG, "iron");
  b.add("sphere", 0, 1.8, 0.7, 0.45, 0.42, 0.28, pal.bone, { mat: "bone" });
  b.add("box", 0, 1.85, 0.84, 0.28, 0.1, 0.06, FIRE, { glow: true });
  for (const sx of [-1, 1]) {
    b.add("cyl", sx * 0.85, 0, 1.75, 0.36, 0.9, 0.36, IRON, { mat: "iron" });
    b.add("cone", sx * 0.85, 0.9, 1.75, 0.4, 0.55, 0.4, FIRE, { glow: true, idle: IDLE_KIND.pulse });
    b.add("cyl", sx * 1.95, 0, -1.2, 0.12, 4.0, 0.12, pal.wood, { mat: "wood" });
    b.add("box", sx * 1.95 - sx * 0.3, 3.0, -1.2, 0.55, 0.9, 0.04, pal.accent, { idle: IDLE_KIND.flutter, mat: "cloth" });
    // HD: horns on the skull, rims on the braziers, the banners' crossbars and bone finials
    b.add("cone", sx * 0.24, 2.05, 0.7, 0.09, 0.32, 0.09, pal.bone, hd("bone", { hdShape: "horn", rz: -sx * 0.6 }));
    b.add("cyl", sx * 0.85, 0.84, 1.75, 0.44, 0.07, 0.44, IRON, hd("iron"));
    b.add("box", sx * 1.95 - sx * 0.3, 3.9, -1.2, 0.62, 0.04, 0.04, pal.wood, hd("wood"));
    b.add("cone", sx * 1.95, 4.0, -1.2, 0.1, 0.24, 0.1, pal.bone, hd("bone"));
  }
  // HD: rope binding the palisade, log ends on the hall
  for (const s of [-1, 1]) b.add("box", s * 1.5, 1.2, 1.4, 1.85, 0.05, 0.4, ROPE, hd("cloth"));
  logEnds(b, 0, -0.6, 3.4, 2.4, 2.6, pal.wall);
  circling(b, 0, -0.6, 5.8, 2.1, 4, CROW);
};

/** Orc structures per district, tier 0 (common) → tier 3 (epic) */
export const ORC_DRAWERS: Record<BuildingType, Drawer[]> = {
  residential_commercial: [yurt, logHut, longhouse, warHall],
  food_field: [patch, field, smokehouse, warMill],
  animal_field: [animalPen, stable, beastHall, wargRanch],
  soldier_building: [warTent, barracks, watchtower, warFort]
};
