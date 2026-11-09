import { BuildingType } from "@/types";
import { range } from "@/utils/random";
import { IDLE_KIND } from "./parts";
import { DOOR, animal, cropPatch, pen, person } from "./blueprints";
import { CIV_ANIMALS } from "./palette";
import { along, arc, lanternFrame } from "@/components/3d/world/kitParts";
import { Drawer, IRON, Trim, bale as baleOf, chimney as chimneyOf, circling, door, hd, lampPost, vane, win } from "./structureKit";

/*
 * Human (Valoria) structures on the visual rarity ladder (see docs/MODEL_STYLE.md and structureKit.ts), one per tier and district:
 * - tier 0, common: plain and matte; shuttered windows, nothing glowing;
 * - tier 1, uncommon: the realm's gold as the one accent, and a small prop (a hanging sign, a lantern, a weapon rack);
 * - tier 2, rare: slate, iron and copper trim, lit windows, and one looping effect (chimney smoke, a turning vane,
 *   a fluttering banner);
 * - tier 3, epic: a bigger silhouette, lit and gilded details, and birds circling it.
 * Each drawer fits its tier's footprint (`UNIT_SIZE` in blueprints.ts) and faces +z.
 * HD: plaster, timber, thatch, slate and blue tiles, dressed stone; frames, ridges, quoins, braces and props by tier.
 */

const SLATE = "#475569";
const COPPER = "#b87333";
const GOLD = "#d4a017";
const BLUE = "#1d4ed8";
const STONE_TRIM: Trim = { color: "#8d929a", mat: "masonry" };

/* ------------------------------ Homes & shops ------------------------------ */

/** Common: a small thatched cottage, shutters closed, a woodpile at its side */
const cottage: Drawer = (b, { pal }) => {
  const w = 1.3;
  const d = 1.15;
  const h = 0.9;
  b.add("box", 0, 0, 0, w, h, d, pal.wall, { mat: "plain" });
  b.add("box", 0, h - 0.24, 0, w + 0.1, 0.1, d + 0.1, pal.wood, { mat: "wood" }); // timber band
  b.add("prism", 0, h, 0, w + 0.3, 0.78, d + 0.3, pal.thatch, { mat: "fur" });
  door(b, 0, 0, d / 2, 0.32, 0.6, DOOR);
  for (const x of [-0.4, 0.4]) win(b, x, 0.3, d / 2, "shut", 0.24, 0.26);
  b.add("box", w / 2 + 0.22, 0, -0.1, 0.3, 0.32, 0.6, pal.wood, { hd: false }); // woodpile
  // HD: a bound ridge along the thatch, corner posts, the woodpile as split logs
  b.add("box", 0, h + 0.7, 0, w + 0.36, 0.12, 0.14, "#b8913f", hd("fur"));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("box", (sx * w) / 2, 0, (sz * d) / 2, 0.1, h - 0.24, 0.1, pal.wood, hd("wood"));
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3 - (i === 2 ? 1 : 0); k++) b.add("cyl", w / 2 + 0.12 + k * 0.1 + i * 0.05, 0.05 + i * 0.09 - 0.3, -0.1, 0.1, 0.6, 0.1, pal.wood, hd("wood", { rx: Math.PI / 2 }));
};

/** Uncommon: a half-timbered house with a jettied upper floor, gold window boxes and a gold hanging sign */
const townhouse: Drawer = (b, ctx) => {
  const { pal } = ctx;
  const w = 2.0;
  const d = 1.6;
  b.add("box", 0, 0, 0, w + 0.12, 0.22, d + 0.12, pal.stone, { mat: "masonry" });
  b.add("box", 0, 0.22, 0, w, 1.2, d, pal.wall, { mat: "plain" });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("box", (sx * w) / 2, 0.22, (sz * d) / 2, 0.12, 1.2, 0.12, pal.wood, { mat: "wood" });
  b.add("box", 0, 1.42, 0, w + 0.2, 0.9, d + 0.2, "#e9dcc0", { mat: "plain" }); // jettied upper floor
  b.add("box", 0, 1.42, 0, w + 0.3, 0.1, d + 0.3, pal.wood, { mat: "wood" });
  b.add("prism", 0, 2.32, 0, w + 0.5, 1.0, d + 0.5, pal.roof, { mat: "tiles" });
  chimneyOf(b, ctx.pal.stone, w / 2 - 0.4, 2.2, -d / 4, 1.0);
  door(b, 0, 0.22, d / 2, 0.42, 0.75, DOOR);
  for (const x of [-0.62, 0.62]) {
    win(b, x, 0.6, d / 2, "glass");
    win(b, x, 1.75, d / 2 + 0.1, "glass");
    b.add("box", x, 1.66, d / 2 + 0.18, 0.4, 0.1, 0.14, pal.accent, { mat: "wood" }); // window box
    // HD: flowers in it
    for (let k = 0; k < 4; k++) b.add("sphere", x - 0.15 + k * 0.1, 1.74, d / 2 + 0.18, 0.09, 0.08, 0.09, k % 2 ? "#dc2626" : "#f9a8d4", hd("leaf"));
  }
  b.add("box", w / 2 + 0.22, 1.25, d / 2 - 0.1, 0.48, 0.05, 0.05, pal.wood, { mat: "wood" }); // sign bracket…
  b.add("box", w / 2 + 0.38, 0.95, d / 2 - 0.1, 0.05, 0.3, 0.36, pal.accent, { mat: "gold" }); // …and its gold sign
  // HD: the sign on two rings, joist ends under the jetty, the timber frame's rail and braces on the front
  for (const s of [-1, 1]) b.add("cyl", w / 2 + 0.38, 1.13, d / 2 - 0.1 + s * 0.12, 0.02, 0.13, 0.02, "#3f3f46", hd("dull"));
  for (let k = 0; k < 7; k++) b.add("box", -0.9 + k * 0.3, 1.34, d / 2 + 0.05, 0.08, 0.08, 0.16, pal.wood, hd("wood"));
  b.add("box", 0, 1.0, d / 2 + 0.04, w, 0.08, 0.08, pal.wood, hd("wood"));
  for (const s of [-1, 1]) along(b.add.bind(b), "box", [s * 0.98, 0.3, d / 2 + 0.04], [s * 0.87, 0.98, d / 2 + 0.04], 0.07, 0.07, pal.wood, hd("wood"));
};

/** Rare: a two-storey stone manor under slate, lit windows, iron lanterns by the porch, smoke from its chimney */
const manor: Drawer = (b, ctx) => {
  const { pal } = ctx;
  const w = 2.8;
  const d = 1.8;
  const z = -0.35;
  b.add("box", 0, 0, z, w + 0.12, 0.25, d + 0.12, pal.stone, { mat: "masonry" });
  b.add("box", 0, 0.25, z, w, 2.2, d, pal.wall, { mat: "plain" });
  b.add("box", 0, 1.2, z, w + 0.1, 0.12, d + 0.1, pal.stone, { mat: "masonry" }); // string course
  b.add("prism", 0, 2.45, z, w + 0.3, 1.1, d + 0.3, SLATE, { mat: "tiles" });
  const front = z + d / 2;
  b.add("box", 0, 0.25, front + 0.25, 1.0, 1.55, 0.5, pal.wall, { mat: "plain" }); // porch
  b.add("prism", 0, 1.8, front + 0.25, 1.25, 0.55, 0.75, SLATE, { mat: "tiles" });
  door(b, 0, 0.25, front + 0.5, 0.5, 0.95, DOOR, STONE_TRIM, "iron");
  b.add("box", 0, 0.95, front + 0.5 + 0.08, 0.56, 0.08, 0.08, IRON, { mat: "iron", hd: false }); // iron door band
  for (const sx of [-1, 1]) {
    b.add("box", sx * 0.42, 1.1, front + 0.56, 0.08, 0.08, 0.14, IRON, { mat: "iron" }); // lantern brackets…
    b.add("box", sx * 0.42, 0.88, front + 0.6, 0.14, 0.2, 0.14, "#fcd34d", { glow: true }); // …and lanterns
    lanternFrame(b.add.bind(b), sx * 0.42, 0.88, front + 0.6, 0.14, 0.2, IRON, { mat: "iron" });
    // HD: dressed quoins up the corners
    for (let k = 0; k < 4; k++) b.add("box", sx * (w / 2 - 0.05 + (k % 2) * 0.04), 0.32 + k * 0.52, front + 0.03, 0.22 - (k % 2) * 0.08, 0.2, 0.1, pal.stone, hd("masonry"));
  }
  for (const x of [-1.05, -0.65, 0.65, 1.05]) win(b, x, 0.6, front, "lit", 0.26, 0.4, undefined, undefined, STONE_TRIM);
  for (const x of [-1.05, -0.35, 0.35, 1.05]) win(b, x, 1.55, front, "lit", 0.26, 0.4, undefined, undefined, STONE_TRIM);
  chimneyOf(b, ctx.pal.stone, -1.0, 2.6, z - 0.3, 1.2, true);
  chimneyOf(b, ctx.pal.stone, 1.0, 2.6, z - 0.3, 1.2);
  // HD: a stone step to the porch, a ridge along the slate
  b.add("box", 0, 0, front + 0.72, 0.8, 0.12, 0.3, pal.stone, hd("masonry"));
  b.add("box", 0, 3.5, z, w + 0.36, 0.08, 0.12, "#334155", hd("iron"));
};

/** Epic: a great hall with a gilded dome on its gate tower, round towers, tall lit windows, banners, doves circling */
const greatHall: Drawer = (b, ctx) => {
  const { pal } = ctx;
  const add = b.add.bind(b);
  b.add("box", 0, 0, -0.4, 4.4, 0.3, 3.0, pal.stone, { mat: "masonry" });
  b.add("box", 0, 0.3, -0.4, 3.8, 2.6, 2.4, pal.wall, { mat: "plain" });
  b.add("prism", 0, 2.9, -0.4, 4.1, 1.4, 2.7, pal.roof, { mat: "tiles" });
  for (const x of [-1.25, -0.9, 0.9, 1.25]) win(b, x, 1.0, 0.8, "lit", 0.24, 1.0, undefined, undefined, STONE_TRIM);
  // The gate tower and its gilded dome
  b.add("box", 0, 0.3, 0.95, 1.3, 4.2, 1.3, pal.stone, { mat: "masonry" });
  b.add("sphere", 0, 4.0, 0.95, 1.35, 1.2, 1.35, GOLD, { mat: "gold" });
  b.add("cone", 0, 5.1, 0.95, 0.22, 0.55, 0.22, "#fde047", { glow: true }); // finial
  b.add("sphere", 0, 2.55, 1.62, 0.62, 0.62, 0.12, "#fde68a", { glow: true }); // rose window
  door(b, 0, 0.3, 1.6, 0.7, 1.4, DOOR, STONE_TRIM, "gold");
  b.add("box", 0, 0, 1.95, 1.5, 0.15, 0.5, pal.stone, { mat: "masonry" }); // steps
  for (const sx of [-1, 1]) {
    b.add("box", sx * 0.48, 1.9, 1.64, 0.3, 0.9, 0.04, BLUE, { idle: IDLE_KIND.flutter, mat: "cloth" }); // banners
    b.add("box", sx * 0.48, 2.78, 1.64, 0.34, 0.08, 0.06, GOLD, { glow: true }); // gilded rods
    b.add("cyl", sx * 2.05, 0.3, 0.4, 1.0, 3.4, 1.0, pal.stone, { mat: "masonry" }); // round towers
    b.add("cone", sx * 2.05, 3.7, 0.4, 1.3, 1.3, 1.3, pal.roof, { mat: "tiles" });
    win(b, sx * 2.05, 2.2, 0.9, "lit", 0.22, 0.4, undefined, undefined, STONE_TRIM);
    lampPost(b, sx * 0.95, 2.05);
    // HD: a gilt cornice and finial on each round tower
    b.add("cyl", sx * 2.05, 3.5, 0.4, 1.16, 0.14, 1.16, GOLD, hd("gold"));
    b.add("sphere", sx * 2.05, 4.94, 0.4, 0.16, 0.16, 0.16, GOLD, hd("gold"));
  }
  // HD: gilt ribs over the dome, a gold ring round the rose window
  for (const u of [[1, 0, 0], [0, 0, 1]] as Array<[number, number, number]>) arc(add, [0, 4.6, 0.95], u, [0, 1, 0], [0.7, 0.62], 0.08, Math.PI - 0.08, 9, 0.06, "#b8860b", hd("gold"), "cyl");
  arc(add, [0, 2.86, 1.63], [1, 0, 0], [0, 1, 0], 0.33, 0, Math.PI * 2, 14, 0.06, GOLD, hd("gold"), "cyl");
  circling(b, 0, 0.95, 5.6, 1.8);
};

/* ---------------------------------- Farms ---------------------------------- */

/** Common: a plain crop patch */
const patch: Drawer = (b, ctx) => cropPatch(b, ctx, 1.9, 1.9);

/** Uncommon: a fenced field with a gold-scarfed scarecrow */
const field: Drawer = (b, ctx) => {
  const { pal } = ctx;
  cropPatch(b, ctx, 3.0, 2.5);
  const x = 1.1;
  const z = 0.95;
  b.add("cyl", x, 0, z, 0.07, 1.2, 0.07, pal.wood, { mat: "wood" });
  b.add("box", x, 0.78, z, 0.8, 0.06, 0.06, pal.wood, { mat: "wood" });
  b.add("box", x, 0.6, z, 0.36, 0.42, 0.22, pal.canvas, { mat: "cloth" }); // straw body
  b.add("sphere", x, 1.02, z, 0.24, 0.24, 0.24, pal.canvas, { mat: "cloth" });
  b.add("cone", x, 1.16, z, 0.36, 0.22, 0.36, pal.thatch, { mat: "fur" });
  b.add("box", x, 0.9, z, 0.3, 0.08, 0.3, pal.accent, { mat: "cloth" }); // gold scarf
  for (const fx of [-1.45, -0.95, -0.45, 0.05, 0.55]) b.add("box", fx, 0, -1.3, 0.08, 0.5, 0.08, pal.wood, { mat: "wood" }); // fence along the back
  b.add("box", -0.45, 0.32, -1.3, 2.1, 0.06, 0.06, pal.wood, { mat: "wood" });
  // HD: straw tufts out of its sleeves and from under its hat, a patched brim, stitched eyes
  for (const s of [-1, 1]) b.add("cone", x + s * 0.46, 0.75, z, 0.08, 0.14, 0.08, pal.thatch, hd("fur", { rz: s * Math.PI / 2 }));
  b.add("cyl", x, 1.13, z, 0.5, 0.04, 0.5, pal.thatch, hd("fur"));
  for (const s of [-1, 1]) b.add("box", x + s * 0.06, 1.06, z + 0.12, 0.04, 0.04, 0.02, "#292524", hd("cloth"));
  b.add("box", -0.45, 0.12, -1.3, 2.1, 0.06, 0.06, pal.wood, hd("wood"));
};

/** Rare: a red barn on a stone footing with iron hinges and a lit loft, a stone silo with a copper dome and a turning vane */
const granary: Drawer = (b, ctx) => {
  const { pal } = ctx;
  const x = -0.45;
  const w = 1.9;
  const d = 1.9;
  b.add("box", x, 0, 0, w + 0.1, 0.2, d + 0.1, pal.stone, { mat: "masonry" });
  b.add("box", x, 0.2, 0, w, 1.5, d, pal.barn, { mat: "wood" });
  b.add("prism", x, 1.7, 0, w + 0.3, 1.0, d + 0.3, SLATE, { mat: "tiles" });
  b.add("box", x, 0.2, d / 2 + 0.03, 0.9, 1.05, 0.08, pal.wood, { mat: "wood" });
  b.add("box", x, 0.2, d / 2 + 0.08, 0.9, 0.08, 0.08, pal.bone, { mat: "plain" }); // white trim
  b.add("box", x, 1.17, d / 2 + 0.08, 0.9, 0.08, 0.08, pal.bone, { mat: "plain" });
  for (const sx of [-1, 1]) b.add("box", x + sx * 0.38, 0.55, d / 2 + 0.1, 0.1, 0.06, 0.06, IRON, { mat: "iron" }); // iron hinges
  win(b, x, 1.35, d / 2, "lit", 0.3, 0.26);
  b.add("cyl", 1.1, 0, -0.45, 0.85, 2.4, 0.85, pal.stone, { mat: "masonry" });
  b.add("cyl", 1.1, 1.6, -0.45, 0.95, 0.1, 0.95, IRON, { mat: "iron" }); // iron hoop
  b.add("sphere", 1.1, 2.15, -0.45, 0.85, 0.6, 0.85, COPPER, { mat: "gold" });
  vane(b, 1.1, 2.7, -0.45);
  baleOf(b, ctx.pal.thatch, 0.95, 0.8);
  // HD: a white X across the barn door, white trim at its corners, a second hoop on the silo
  barnBrace(b, x, 0.28, d / 2 + 0.1, 0.9, 0.89, pal.bone);
  for (const s of [-1, 1]) b.add("box", x + s * (w / 2), 0.2, d / 2, 0.1, 1.5, 0.1, pal.bone, hd("plain"));
  b.add("cyl", 1.1, 0.7, -0.45, 0.95, 0.1, 0.95, IRON, hd("iron"));
};

/** HD: the white X brace across a barn door (its front at z) */
function barnBrace(b: Parameters<Drawer>[0], x: number, y0: number, z: number, w: number, h: number, color: string) {
  for (const s of [-1, 1]) along(b.add.bind(b), "box", [x - s * (w / 2 - 0.06), y0, z], [x + s * (w / 2 - 0.06), y0 + h, z], 0.07, 0.06, color, hd("plain"));
}

/** Epic: a tall stone windmill with a lantern-lit gallery, a gilded finial and doves circling its sails */
const windmill: Drawer = (b, ctx) => {
  const { pal, rng } = ctx;
  b.add("cyl", 0, 0, 0, 2.0, 1.0, 2.0, pal.stone, { mat: "masonry" });
  b.add("cyl", 0, 1.0, 0, 1.6, 3.0, 1.6, pal.wall, { mat: "plain" });
  b.add("cyl", 0, 2.4, 0, 2.3, 0.1, 2.3, pal.wood, { mat: "wood" }); // gallery
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.add("box", Math.cos(a) * 1.05, 2.5, Math.sin(a) * 1.05, 0.12, 0.22, 0.12, "#fcd34d", { glow: true }); // gallery lanterns
    lanternFrame(b.add.bind(b), Math.cos(a) * 1.05, 2.5, Math.sin(a) * 1.05, 0.12, 0.22, GOLD, { mat: "gold" });
  }
  b.add("cone", 0, 4.0, 0, 2.0, 1.3, 2.0, pal.roof, { mat: "tiles" });
  b.add("cone", 0, 5.3, 0, 0.16, 0.45, 0.16, "#fde047", { glow: true }); // gilded finial
  door(b, 0, 0, 1.0, 0.5, 0.85, DOOR, STONE_TRIM, "iron");
  win(b, 0, 1.6, 0.8, "lit");
  win(b, 0, 3.0, 0.8, "lit");
  b.actor({ kind: "sails", x: 0, y: 3.4, z: 0.95, yaw: 0, motion: "spin", speed: 0.9, phase: rng() * 6, colors: ["#fef3c7"] });
  circling(b, 0, 0, 5.4, 1.6, 3);
  b.add("box", 1.2, 0, 1.2, 0.8, 0.6, 0.7, pal.wood, { mat: "wood" }); // mill shed
  b.add("prism", 1.2, 0.6, 1.2, 0.95, 0.4, 0.85, pal.thatch, { mat: "fur" });
  // HD: a railing round the gallery, a gilt band under the cap, sacks of flour by the shed
  arc(b.add.bind(b), [0, 2.82, 0], [1, 0, 0], [0, 0, 1], 1.12, 0, Math.PI * 2, 16, 0.04, pal.wood, hd("wood"), "cyl");
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add("cyl", Math.cos(a) * 1.12, 2.5, Math.sin(a) * 1.12, 0.04, 0.32, 0.04, pal.wood, hd("wood"));
  }
  b.add("cyl", 0, 3.88, 0, 1.68, 0.12, 1.68, GOLD, hd("gold"));
  for (const [sx, sz, sy] of [[-0.8, 1.0, 0], [-1.05, 0.75, 0], [-0.92, 0.88, 0.28]]) b.add("egg", sx, sy, sz, 0.26, 0.32, 0.24, "#f5f0dc", hd("cloth"));
};

/* --------------------------------- Animals --------------------------------- */

/** Common: a plain fenced pen */
const animalPen: Drawer = (b, ctx) => pen(b, ctx);

/** Uncommon: a wooden stable with half-doors, a gold horseshoe over them, a lantern on its hook and hay */
const stable: Drawer = (b, ctx) => {
  const { pal, rng } = ctx;
  const w = 2.0;
  const d = 1.4;
  b.add("box", -0.3, 0, -0.3, w, 1.2, d, pal.wood, { mat: "wood" });
  b.add("prism", -0.3, 1.2, -0.3, w + 0.3, 0.75, d + 0.3, pal.roof, { mat: "tiles" });
  for (const x of [-0.9, -0.3, 0.3]) {
    door(b, x, 0, -0.3 + d / 2, 0.45, 0.7, DOOR);
    // HD: a half-door: its rail across the middle
    b.add("box", x, 0.36, -0.3 + d / 2 + 0.09, 0.45, 0.06, 0.06, pal.wood, hd("wood"));
  }
  b.add("box", -0.3, 0.9, -0.3 + d / 2 + 0.03, 0.3, 0.22, 0.06, pal.accent, { mat: "gold", hd: false }); // gold horseshoe sign
  b.add("box", 0.85, 0.8, -0.3 + d / 2 + 0.06, 0.06, 0.06, 0.16, IRON, { mat: "dull" }); // lantern hook…
  b.add("box", 0.85, 0.55, -0.3 + d / 2 + 0.14, 0.14, 0.2, 0.14, "#78716c", { mat: "gem" }); // …its lantern, unlit by day
  lanternFrame(b.add.bind(b), 0.85, 0.55, -0.3 + d / 2 + 0.14, 0.14, 0.2, IRON, { mat: "dull" });
  baleOf(b, ctx.pal.thatch, 1.05, 0.6);
  baleOf(b, ctx.pal.thatch, 1.1, -0.3);
  for (let i = 0; i < 3; i++) animal(b, ctx, CIV_ANIMALS[ctx.civ].small, range(rng, -1.2, 1.2), range(rng, 0.7, 1.1));
  // HD: a real horseshoe in gold over the doors, on a plank
  b.add("box", -0.3, 0.88, -0.3 + d / 2 + 0.03, 0.34, 0.26, 0.06, pal.wood, hd("wood"));
  arc(b.add.bind(b), [-0.3, 1.02, -0.3 + d / 2 + 0.09], [1, 0, 0], [0, 1, 0], 0.08, Math.PI / 2 + 0.55, Math.PI * 2.5 - 0.55, 7, 0.035, pal.accent, hd("gold"), "cyl");
};

/** Rare: a big red barn with white trim, iron hinges, a lit loft and a cupola with a turning vane */
const bigBarn: Drawer = (b, ctx) => {
  const { pal } = ctx;
  const x = -0.2;
  const w = 2.6;
  const d = 2.2;
  b.add("box", x, 0, -0.2, w + 0.1, 0.2, d + 0.1, pal.stone, { mat: "masonry" });
  b.add("box", x, 0.2, -0.2, w, 1.7, d, pal.barn, { mat: "wood" });
  b.add("prism", x, 1.9, -0.2, w + 0.3, 1.2, d + 0.3, SLATE, { mat: "tiles" });
  const front = -0.2 + d / 2;
  b.add("box", x, 0.2, front + 0.03, 1.1, 1.2, 0.08, pal.wood, { mat: "wood" });
  for (const y of [0.2, 1.32]) b.add("box", x, y, front + 0.08, 1.1, 0.08, 0.08, pal.bone, { mat: "plain" });
  for (const sx of [-1, 1]) b.add("box", x + sx * 0.46, 0.65, front + 0.1, 0.12, 0.06, 0.06, IRON, { mat: "iron" });
  win(b, x, 1.55, front, "lit", 0.34, 0.28);
  b.add("box", x, 2.9, -0.2, 0.5, 0.4, 0.5, pal.wood, { mat: "wood" }); // cupola…
  b.add("pyramid", x, 3.3, -0.2, 0.6, 0.35, 0.6, SLATE, { mat: "tiles" });
  vane(b, x, 3.65, -0.2);
  b.add("box", 1.35, 0, 0.9, 0.9, 0.3, 0.35, pal.wood, { mat: "wood" }); // trough
  baleOf(b, ctx.pal.thatch, 1.4, -0.6, 0.5);
  // HD: a white X across the door, white corner boards, louvres in the cupola, water in the trough
  barnBrace(b, x, 0.28, front + 0.1, 1.1, 1.04, pal.bone);
  for (const s of [-1, 1]) b.add("box", x + s * (w / 2), 0.2, front, 0.1, 1.7, 0.1, pal.bone, hd("plain"));
  for (let k = 0; k < 3; k++) b.add("box", x, 2.98 + k * 0.1, -0.2 + 0.26, 0.36, 0.03, 0.05, "#3f2a1a", hd("wood", { rx: -0.5 }));
  b.add("box", 1.35, 0.22, 0.9, 0.8, 0.05, 0.25, pal.water, hd("gel"));
};

/** Epic: a ranch: farmhouse, barn, a stone silo under a gilded dome, lantern posts, a pen of animals, doves circling */
const ranch: Drawer = (b, ctx) => {
  const { pal } = ctx;
  townhouse(b.child(-1.3, -1.05), ctx);
  b.add("box", 1.2, 0, -1.1, 2.0, 1.3, 1.4, pal.barn, { mat: "wood" });
  b.add("prism", 1.2, 1.3, -1.1, 2.3, 0.85, 1.7, SLATE, { mat: "tiles" });
  win(b, 1.2, 0.8, -0.4, "lit", 0.34, 0.28);
  b.add("cyl", 2.05, 0, 1.25, 0.9, 2.8, 0.9, pal.stone, { mat: "masonry" });
  b.add("sphere", 2.05, 2.55, 1.25, 0.9, 0.62, 0.9, GOLD, { mat: "gold" });
  b.add("cone", 2.05, 3.15, 1.25, 0.12, 0.35, 0.12, "#fde047", { glow: true });
  pen(b.child(0.1, 1.1), ctx, 2.0, 3);
  for (const x of [-1.55, 1.2]) lampPost(b, x, 0.4);
  circling(b, 2.05, 1.25, 4.0, 1.2, 3);
  // HD: the barn door with its X, gilt hoops on the silo
  b.add("box", 1.2, 0, -0.4 + 0.03, 0.8, 0.62, 0.08, pal.wood, hd("wood"));
  barnBrace(b, 1.2, 0.04, -0.4 + 0.1, 0.8, 0.54, pal.bone);
  for (const y of [0.8, 1.7]) b.add("cyl", 2.05, y, 1.25, 1.0, 0.1, 1.0, GOLD, hd("gold"));
};

/* --------------------------------- Soldiers -------------------------------- */

/** Common: a plain canvas ridge tent */
const tent: Drawer = (b, { pal }) => {
  b.add("prism", 0, 0, 0, 1.4, 1.05, 1.5, pal.canvas, { ry: Math.PI / 2, mat: "cloth" });
  b.add("box", 0, 0, 0.72 + 0.03, 0.4, 0.6, 0.06, "#a8a29e", { mat: "cloth" }); // tent flap
  b.add("box", 0, 1.0, 0, 0.06, 0.1, 1.6, pal.wood, { mat: "wood" }); // ridge pole
  // HD: its poles at both ends, guy ropes to pegs, the flap tied back
  for (const s of [-1, 1]) {
    b.add("cyl", 0, 0, s * 0.74, 0.06, 1.05, 0.06, pal.wood, hd("wood"));
    along(b.add.bind(b), "cyl", [0, 1.04, s * 0.8], [0, 0.02, s * 0.84], 0.015, 0.015, "#a8a29e", hd("cloth"));
    b.add("cone", 0, 0, s * 0.84, 0.05, 0.1, 0.05, pal.wood, hd("wood"));
  }
  b.add("cyl", 0.16, 0.26, 0.79, 0.12, 0.05, 0.12, "#78716c", hd("cloth"));
};

/** Uncommon: a timber barracks with gold shields on its wall and a weapon rack beside it */
const barracks: Drawer = (b, ctx) => {
  const { pal } = ctx;
  const w = 2.3;
  const d = 1.4;
  b.add("box", -0.2, 0, 0, w + 0.12, 0.2, d + 0.12, pal.stone, { mat: "masonry" });
  b.add("box", -0.2, 0.2, 0, w, 1.2, d, pal.wall, { mat: "plain" });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("box", -0.2 + (sx * w) / 2, 0.2, (sz * d) / 2, 0.12, 1.2, 0.12, pal.wood, { mat: "wood" });
  b.add("prism", -0.2, 1.4, 0, w + 0.3, 0.85, d + 0.3, pal.roof, { mat: "tiles" });
  door(b, -0.2, 0.2, d / 2, 0.5, 0.75, DOOR);
  for (const sx of [-0.85, 0.45]) {
    b.add("box", sx, 0.6, d / 2 + 0.05, 0.36, 0.42, 0.1, pal.accent, { hd: false }); // gold shields
    // HD: round shields, gold with a dull iron boss and rim
    b.add("cyl", sx, 0.81 - 0.03, d / 2 + 0.06, 0.42, 0.06, 0.42, pal.accent, hd("gold", { rx: Math.PI / 2 }));
    b.add("sphere", sx, 0.76, d / 2 + 0.08, 0.1, 0.1, 0.1, "#3f3f46", hd("dull"));
  }
  // Weapon rack
  b.add("box", 1.25, 0, 0.1, 0.08, 1.0, 0.08, pal.wood, { mat: "wood" });
  b.add("box", 1.25, 0, 0.75, 0.08, 1.0, 0.08, pal.wood, { mat: "wood" });
  b.add("box", 1.25, 0.85, 0.42, 0.08, 0.08, 0.75, pal.wood, { mat: "wood" });
  for (const z of [0.25, 0.45, 0.65]) {
    b.add("cyl", 1.33, 0, z, 0.04, 1.3, 0.04, "#9ca3af", { hd: false });
    // HD: spears, wooden shafts with dull iron heads
    b.add("cyl", 1.33, 0, z, 0.04, 1.14, 0.04, pal.wood, hd("wood"));
    b.add("blade", 1.33, 1.12, z, 0.02, 0.2, 0.06, "#9ca3af", hd("dull"));
  }
};

/** Rare: a round stone watchtower with an iron brazier on top, lit arrow slits and a banner streaming over it */
const watchtower: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("cyl", 0, 0, 0, 1.6, 3.3, 1.6, pal.stone, { mat: "masonry" });
  b.add("cyl", 0, 2.95, 0, 1.9, 0.35, 1.9, pal.stone, { mat: "masonry" });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add("box", Math.cos(a) * 0.82, 3.3, Math.sin(a) * 0.82, 0.26, 0.3, 0.26, pal.stone, { mat: "masonry" });
    // HD: corbels under the crown
    b.add("box", Math.cos(a + 0.39) * 0.85, 2.75, Math.sin(a + 0.39) * 0.85, 0.16, 0.2, 0.16, pal.stone, hd("masonry", { ry: -a }));
  }
  door(b, 0, 0, 0.8, 0.42, 0.75, DOOR, STONE_TRIM);
  b.add("box", 0, 0.4, 0.8 + 0.08, 0.46, 0.06, 0.06, IRON, { mat: "iron" });
  for (const y of [1.3, 2.2]) win(b, 0, y, 0.8, "lit", 0.14, 0.36, undefined, undefined, STONE_TRIM);
  b.add("cyl", -0.35, 3.3, -0.35, 0.36, 0.3, 0.36, IRON, { mat: "iron" }); // brazier
  b.add("cone", -0.35, 3.6, -0.35, 0.28, 0.36, 0.28, "#f97316", { glow: true });
  b.add("cyl", 0.35, 3.3, 0.2, 0.05, 1.3, 0.05, pal.wood, { mat: "wood" });
  b.add("box", 0.62, 4.15, 0.2, 0.5, 0.36, 0.03, BLUE, { idle: IDLE_KIND.flutter, mat: "cloth" }); // banner
  // HD: the brazier's rim and coals, the banner's crossbar and an iron finial
  b.add("cyl", -0.35, 3.54, -0.35, 0.42, 0.05, 0.42, IRON, hd("iron"));
  b.add("sphere", -0.35, 3.52, -0.35, 0.3, 0.12, 0.3, "#7f1d1d", hd("lava"));
  b.add("box", 0.62, 4.51, 0.2, 0.56, 0.03, 0.03, pal.wood, hd("wood"));
  b.add("sphere", 0.35, 4.6, 0.2, 0.1, 0.1, 0.1, IRON, hd("iron"));
  if (ctx.budget.people > 0) {
    ctx.budget.people--;
    person(b, ctx, "soldier", 0.35, 1.0, "idle");
  }
};

/** Epic: a stone keep behind a gatehouse between blue-capped towers, torch-lit gate, banners, hawks circling */
const keep: Drawer = (b, ctx) => {
  const { pal } = ctx;
  b.add("box", 0, 0, -0.6, 3.2, 3.4, 2.4, pal.stone, { mat: "masonry" });
  for (let i = 0; i < 7; i++) {
    const x = -1.5 + i * 0.5;
    for (const z of [0.55, -1.75]) b.add("box", x, 3.4, z, 0.28, 0.32, 0.22, pal.stone, { mat: "masonry" });
  }
  for (const x of [-0.9, 0, 0.9]) win(b, x, 2.2, 0.6, "lit", 0.18, 0.5, undefined, undefined, STONE_TRIM);
  for (const sx of [-1, 1]) {
    b.add("cyl", sx * 1.9, 0, 1.0, 1.4, 4.0, 1.4, pal.stone, { mat: "masonry" });
    b.add("cone", sx * 1.9, 4.0, 1.0, 1.75, 1.4, 1.75, pal.roof, { mat: "tiles" });
    b.add("cone", sx * 1.9, 5.4, 1.0, 0.14, 0.35, 0.14, "#fde047", { glow: true });
    win(b, sx * 1.9, 2.6, 1.7, "lit", 0.18, 0.44, undefined, undefined, STONE_TRIM);
    b.add("box", sx * 0.75, 1.9, 1.24, 0.34, 1.1, 0.04, BLUE, { idle: IDLE_KIND.flutter, mat: "cloth" });
    b.add("box", sx * 0.55, 0.9, 1.26, 0.1, 0.3, 0.1, "#f97316", { glow: true }); // gate torches
    // HD: gilt cornices under the tower roofs, the banners' gold rods, iron torch brackets
    b.add("cyl", sx * 1.9, 3.82, 1.0, 1.56, 0.12, 1.56, GOLD, hd("gold"));
    b.add("box", sx * 0.75, 3.0, 1.26, 0.4, 0.05, 0.05, GOLD, hd("gold"));
    b.add("box", sx * 0.55, 0.8, 1.26, 0.14, 0.1, 0.14, IRON, hd("iron"));
    b.add("box", sx * 0.55, 0.84, 1.22 - 0.03, 0.05, 0.05, 0.1, IRON, hd("iron"));
  }
  b.add("box", 0, 0, 1.0, 2.4, 1.9, 0.4, pal.stone, { mat: "masonry" }); // gatehouse
  b.add("box", 0, 0, 1.2 + 0.03, 0.9, 1.3, 0.08, IRON, { mat: "iron", hd: false }); // portcullis
  // HD: the portcullis as an iron grid with spikes, an arch over it, merlons on the gatehouse
  b.add("box", 0, 0, 1.2 + 0.02, 0.9, 1.3, 0.04, "#1c1917", hd("plain"));
  for (let k = 0; k < 5; k++) {
    b.add("box", -0.36 + k * 0.18, 0.08, 1.27, 0.05, 1.22, 0.05, IRON, hd("iron"));
    b.add("cone", -0.36 + k * 0.18, 0, 1.27, 0.06, 0.1, 0.06, IRON, hd("iron", { rx: Math.PI }));
  }
  for (const y of [0.4, 0.85]) b.add("box", 0, y, 1.27, 0.86, 0.05, 0.05, IRON, hd("iron"));
  arc(b.add.bind(b), [0, 1.3, 1.24], [1, 0, 0], [0, 1, 0], 0.5, 0, Math.PI, 7, 0.1, pal.stone, hd("masonry"), "box");
  for (let k = 0; k < 5; k++) b.add("box", -1.0 + k * 0.5, 1.9, 1.08, 0.24, 0.26, 0.2, pal.stone, hd("masonry"));
  circling(b, 0, -0.6, 5.3, 2.0, 3, "#44403c");
};

/** Human structures per district, tier 0 (common) → tier 3 (epic) */
export const HUMAN_DRAWERS: Record<BuildingType, Drawer[]> = {
  residential_commercial: [cottage, townhouse, manor, greatHall],
  food_field: [patch, field, granary, windmill],
  animal_field: [animalPen, stable, bigBarn, ranch],
  soldier_building: [tent, barracks, watchtower, keep]
};
