import { Builder, IDLE_KIND, Surface } from "@/components/3d/city/parts";
import { Add, AddOpts, V3, along, arc, lanternFrame, skull } from "./kitParts";
import { FigureLook, faceAt } from "./spawnModels";

/*
 * The four frontier gates, one on the road into each mortal province, each built in its civilization's style:
 * Valoria's Imperial High Gate (pale dressed stone, blue roofs), Drak'mar's Tusked War Pass (log palisade between
 * mammoth tusks), Sylvandale's Moonwood Arch (two living trees grown into an arch) and Ironforge's Anvilhold Deepgate
 * (a gate cut into a rune-carved rock face). All are alive: banners flutter, fires smoke, leaves sway, runes pulse.
 */

export const GATE_MODEL_TYPES = new Set(["gate-human", "gate-orc", "gate-elf", "gate-dwarf"]);

/* ------------------------------ the border walls ------------------------------ */

/** Heart of each mortal province (mirrors PROVINCE_CONFIG on the server) */
const PROVINCE_HEART: Record<string, [number, number]> = { human: [-44, 44], elf: [-44, -44], dwarf: [44, -44], orc: [44, 44] };
/** The wall runs this far (radians) either side of the gate, curving round the province's heart */
export const GATE_WALL_SPAN = 0.42;
/** Gap left in the wall for the gatehouse itself */
const GATE_GAP = 3.4;

/** Civilization a gate type belongs to ("gate-elf" → "elf") */
export const gateCiv = (type: string) => type.slice(5);

/**
 * The arc a gate's border wall follows: centred on its province's heart, through the gate. Server mirror:
 * `gateWallPoints` in worldMapGenerator.ts.
 */
export function gateWallArc(type: string, gx: number, gz: number) {
  const [cx, cz] = PROVINCE_HEART[gateCiv(type)] ?? [0, 0];
  return { cx, cz, r: Math.hypot(gx - cx, gz - cz), a0: Math.atan2(gz - cz, gx - cx) };
}

/** Points along a gate's wall (both wings, gatehouse gap left out), `step` apart: for keeping trees and NPCs off it */
export function gateWallPoints(type: string, gx: number, gz: number, step = 2): Array<{ x: number; z: number }> {
  const { cx, cz, r, a0 } = gateWallArc(type, gx, gz);
  const out: Array<{ x: number; z: number }> = [];
  const n = Math.ceil((r * GATE_WALL_SPAN) / step);
  for (let i = -n; i <= n; i++) {
    const a = a0 + (i / n) * GATE_WALL_SPAN;
    if (Math.abs((a - a0) * r) < GATE_GAP) continue;
    out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
  }
  return out;
}

/** Yaw that turns a gate's front (local +z) toward the Voidrift at the map's centre */
export const gateYaw = (gx: number, gz: number) => (gx === 0 && gz === 0 ? 0 : Math.atan2(-gx, -gz));

function smoke(b: Builder, x: number, y: number, z: number, s: number, color: string) {
  for (let i = 0; i < 3; i++) b.add("sphere", x, y, z, 0.32 * s, 0.3 * s, 0.32 * s, color, { idle: IDLE_KIND.smoke, phase: 0.01 + (i * Math.PI * 2) / 3 });
}

/*
 * HD (the model kit): the gates are rare, so on top of real materials (dressed stone, timber, bone, bark and leaves,
 * rock) they get real metal (iron portcullis and fittings, steel, gilt crests) and HD-only trim: voussoirs, corbels,
 * bars, lashings, a skull's jaw and horns, lantern cages, carved faces. A broken gate (`ruinGate` in landmarkStages.ts)
 * loses what stood in the passage and what fell, HD detail with it.
 */
const hdo = (mat: Surface, o: AddOpts = {}): AddOpts => ({ ...o, mat, hd: true });
const IRON = "#27272a";

/** HD: an iron brazier's three legs and rim round a bowl `w` across standing at (x, y0, z), `h` tall */
function brazierLegs(add: Add, x: number, y0: number, z: number, w: number, h: number) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    along(add, "cyl", [x + c * w * 0.38, y0 + h * 0.75, z + s * w * 0.38], [x + c * w * 0.62, y0, z + s * w * 0.62], 0.05, 0.05, IRON, hdo("iron"));
  }
  add("cyl", x, y0 + h - 0.06, z, w + 0.08, 0.06, w + 0.08, IRON, hdo("iron"));
}

/** Valoria: twin round towers of pale stone under blue cones, a crenellated arch, portcullis and the royal crest */
function humanGate(b: Builder) {
  const STONE = "#e7e2d6";
  const STONE_DARK = "#c9c1b0";
  const add = b.add.bind(b);
  b.add("box", 0, 0, 0, 6.2, 0.25, 2.2, "#a8a29e", { mat: "stone", hdShape: "block" }); // paved threshold
  for (const sx of [-1, 1]) {
    const x = sx * 1.9;
    b.add("cyl", x, 0.25, 0, 1.5, 3.6, 1.5, STONE, { mat: "plain" });
    b.add("cyl", x, 3.85, 0, 1.7, 0.3, 1.7, STONE_DARK, { mat: "stone" }); // corbelled ring
    b.add("cone", x, 4.15, 0, 1.8, 1.6, 1.8, "#1d4ed8", { mat: "stone" });
    b.add("cyl", x, 5.75, 0, 0.05, 0.6, 0.05, "#3f2a1a", { mat: "wood" });
    b.add("box", x + 0.25, 5.95, 0, 0.45, 0.3, 0.03, "#2563eb", { idle: IDLE_KIND.flutter, mat: "cloth" }); // pennant
    b.add("box", x, 2.2, 0.77, 0.24, 0.5, 0.06, "#fde68a", { glow: true }); // arrow-slit light
    b.add("box", x + sx * 0.45, 1.25, 0.72, 0.08, 0.3, 0.16, "#3f3f46", { mat: "iron" }); // wall torch bracket
    b.add("cone", x + sx * 0.45, 1.55, 0.86, 0.2, 0.3, 0.2, "#fb923c", { glow: true, idle: IDLE_KIND.pulse }); // its flame
    // HD: corbels under the ring, a string course, a sill under the slit, a gilt knob on the pennant pole, the torch's cup
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      add("box", x + Math.cos(a) * 0.78, 3.56, Math.sin(a) * 0.78, 0.14, 0.22, 0.14, STONE_DARK, hdo("stone", { ry: -a }));
    }
    add("cyl", x, 1.3, 0, 1.6, 0.1, 1.6, STONE_DARK, hdo("stone"));
    add("box", x, 2.12, 0.78, 0.36, 0.06, 0.14, STONE_DARK, hdo("stone"));
    add("sphere", x, 6.33, 0, 0.1, 0.1, 0.1, "#fbbf24", hdo("gold"));
    add("cyl", x + sx * 0.45, 1.5, 0.86, 0.16, 0.06, 0.16, IRON, hdo("iron"));
  }
  b.add("box", 0, 2.5, 0, 2.4, 1.2, 1.2, STONE, { mat: "plain", hdShape: "block" }); // arch span
  for (let i = 0; i < 4; i++) b.add("box", -0.9 + i * 0.6, 3.7, 0, 0.36, 0.35, 1.2, STONE_DARK, { mat: "stone", hdShape: "block" }); // merlons
  b.add("box", 0, 0.25, 0, 2.3, 2.25, 0.12, "#334155", { mat: "iron" }); // portcullis
  for (let i = 0; i < 4; i++) b.add("box", -0.75 + i * 0.5, 0.25, 0.1, 0.08, 2.15, 0.08, "#1e293b", { mat: "iron" }); // bars
  b.add("cyl", 0, 2.9, 0.65, 0.7, 0.12, 0.7, "#fbbf24", { rx: Math.PI / 2, mat: "gold" }); // royal crest
  b.add("box", 0, 2.85, 0.78, 0.18, 0.4, 0.06, "#1d4ed8", { mat: "cloth" });
  for (const sx of [-1, 1]) {
    b.add("box", sx * 1.25, 0.25, 0.9, 0.55, 2.1, 0.06, "#1d4ed8", { idle: IDLE_KIND.flutter, mat: "cloth" }); // hanging banners
    b.add("cyl", sx * 3.1, 0.25, 0.9, 0.3, 0.9, 0.3, "#57534e", { mat: "iron" }); // braziers
    b.add("cone", sx * 3.1, 1.15, 0.9, 0.35, 0.5, 0.35, "#f97316", { glow: true, idle: IDLE_KIND.pulse });
    // HD: the brazier's legs and rim, a gilt rod the banner hangs from
    brazierLegs(add, sx * 3.1, 0.25, 0.9, 0.3, 0.9);
    along(add, "cyl", [sx * 1.25 - 0.34, 2.38, 0.9], [sx * 1.25 + 0.34, 2.38, 0.9], 0.05, 0.05, "#d4a017", hdo("gold"));
  }
  // HD: voussoirs round the passage on both faces, cross bars and spikes on the portcullis, the crest's rim
  for (const z of [0.66, -0.66]) arc(add, [0, 1.55, z], [1, 0, 0], [0, 1, 0], 1.1, 0, Math.PI, 9, 0.2, STONE_DARK, hdo("stone"), "block");
  for (const y of [0.9, 1.7]) add("box", 0, y, 0.1, 2.2, 0.07, 0.08, "#1e293b", hdo("iron"));
  for (let i = 0; i < 4; i++) add("cone", -0.75 + i * 0.5, 0.13, 0.1, 0.1, 0.16, 0.1, "#1e293b", hdo("iron", { rx: Math.PI }));
  arc(add, [0, 3.25, 0.73], [1, 0, 0], [0, 1, 0], 0.37, 0, Math.PI * 2, 12, 0.05, "#d4a017", hdo("gold"));
}

/** Drak'mar: a sharpened log palisade between two great mammoth tusks, a skull over the gap, war fires smoking */
function orcGate(b: Builder) {
  const LOG = "#5b3b22";
  const TUSK = "#efe6cf";
  const ROPE = "#a8865a";
  const add = b.add.bind(b);
  b.add("box", 0, 0, 0, 6.4, 0.2, 2.2, "#7c2d12", { mat: "hide" }); // trampled red earth
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = sx * (1.5 + i * 0.42);
      const h = 2.6 + ((i * 7) % 3) * 0.35;
      b.add("cyl", x, 0.2, 0, 0.42, h, 0.42, i % 2 ? LOG : "#4a3322", { mat: "wood" });
      b.add("cone", x, 0.2 + h, 0, 0.42, 0.55, 0.42, "#3f2a1a", { mat: "wood" }); // sharpened tips
    }
    // A great tusk curving up and in over the gap
    b.add("cone", sx * 1.25, 0.2, 0.4, 0.55, 3.6, 0.55, TUSK, { rz: sx * 0.45, mat: "bone" });
    b.add("cone", sx * 0.75, 3.1, 0.4, 0.32, 1.4, 0.32, TUSK, { rz: sx * 1.1, mat: "bone" });
    b.add("box", sx * 1.3, 1.6, 0.42, 0.62, 0.18, 0.62, "#7f1d1d", { rz: sx * 0.45, mat: "leather" }); // lashed binding
    b.add("cyl", sx * 3.0, 0.2, 0.9, 0.06, 3.2, 0.06, "#3f2a1a", { mat: "wood" }); // war banner
    b.add("box", sx * 3.0 + 0.3, 2.6, 0.9, 0.55, 0.85, 0.04, "#b91c1c", { idle: IDLE_KIND.flutter, mat: "cloth", sync: sx < 0 ? 1 : 2 });
    b.add("cyl", sx * 2.0, 0.2, 0.7, 0.07, 2.2, 0.07, "#3f2a1a", { mat: "wood" }); // pitch torch on a stake
    b.add("cone", sx * 2.0, 2.4, 0.7, 0.26, 0.42, 0.26, "#f97316", { glow: true, idle: IDLE_KIND.pulse });
    // HD: rope lashings across the palisade, iron bands on the tusk, tatters under the banner (moving with it), a
    // skull on its pole, the torch's pitch-soaked wrap
    for (const y of [0.8, 2.1]) along(add, "capsule", [sx * 1.4, y, 0.24], [sx * 3.28, y, 0.24], 0.06, 0.06, ROPE, hdo("cloth"));
    const dir: V3 = [-Math.sin(sx * 0.45), Math.cos(sx * 0.45), 0];
    for (const [f, w] of [[0.22, 0.5], [0.42, 0.38]]) {
      const c: V3 = [sx * 1.25 + dir[0] * 3.6 * (f - 0.5), 2.0 + dir[1] * 3.6 * (f - 0.5), 0.4];
      along(add, "cyl", c, [c[0] + dir[0] * 0.07, c[1] + dir[1] * 0.07, 0.4], w, w, IRON, hdo("iron"));
    }
    for (const k of [-0.18, 0.04, 0.2]) add("box", sx * 3.0 + 0.3 + k, 2.36, 0.9, 0.11, 0.26, 0.04, "#b91c1c", hdo("cloth", { idle: IDLE_KIND.flutter, sync: sx < 0 ? 1 : 2 }));
    skull(add, sx * 3.0, 3.42, 0.92, 0.26, TUSK, 0, hdo("bone"));
    add("cyl", sx * 2.0, 2.12, 0.7, 0.13, 0.28, 0.13, "#1c1917", hdo("cloth"));
  }
  b.add("sphere", 0, 3.7, 0.45, 0.65, 0.6, 0.6, TUSK, { mat: "bone" }); // skull over the gap
  b.add("box", -0.15, 3.85, 0.73, 0.14, 0.14, 0.06, "#f97316", { glow: true, idle: IDLE_KIND.pulse }); // burning eyes
  b.add("box", 0.15, 3.85, 0.73, 0.14, 0.14, 0.06, "#f97316", { glow: true, idle: IDLE_KIND.pulse });
  b.add("box", 0, 0.2, -0.2, 2.2, 1.6, 0.25, "#4a3322", { mat: "wood" }); // lashed log gate
  for (const sx of [-1, 1]) {
    b.add("cone", sx * 2.4, 0.2, 1.4, 0.7, 0.6, 0.7, "#f97316", { glow: true, idle: IDLE_KIND.pulse }); // war fire
    smoke(b, sx * 2.4, 0.9, 1.4, 1.0, "#57534e");
    // HD: logs crossed under the fire and stones round it
    for (const k of [-1, 1]) along(add, "cyl", [sx * 2.4 - 0.32, 0.26, 1.4 - k * 0.2], [sx * 2.4 + 0.32, 0.26, 1.4 + k * 0.2], 0.1, 0.1, "#3b2414", hdo("wood"));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + sx;
      add("boulder", sx * 2.4 + Math.cos(a) * 0.45, 0.18, 1.4 + Math.sin(a) * 0.45, 0.16, 0.12, 0.16, "#44403c", hdo("stone", { ry: a }));
    }
  }
  // HD: the skull's brow, jaw, teeth and curling horns; battens, a brace and iron spikes on the log gate
  along(add, "capsule", [-0.22, 4.04, 0.71], [0.22, 4.04, 0.71], 0.07, 0.07, TUSK, hdo("bone"));
  add("egg", 0, 3.6, 0.56, 0.42, 0.18, 0.36, TUSK, hdo("bone"));
  add("box", 0, 3.72, 0.73, 0.3, 0.06, 0.06, "#e7e5e4", hdo("bone"));
  for (const sx of [-1, 1]) along(add, "horn", [sx * 0.26, 4.02, 0.4], [sx * 0.66, 4.42, 0.28], 0.16, 0.16, TUSK, hdo("bone"));
  for (const y of [0.5, 1.4]) add("box", 0, y, -0.04, 2.1, 0.12, 0.06, "#3b2414", hdo("wood"));
  along(add, "box", [-0.9, 0.62, -0.04], [0.9, 1.34, -0.04], 0.12, 0.06, "#3b2414", hdo("wood"));
  for (let i = 0; i < 5; i++) add("cone", -0.88 + i * 0.44, 1.8, -0.2, 0.09, 0.22, 0.09, IRON, hdo("iron"));
}

/** Sylvandale: two living trees grown into an arch, leaves swaying, moonstone lanterns and wisps drifting through */
function elfGate(b: Builder) {
  const BARK = "#6b5a46";
  const SILVER = "#e2e8f0";
  const add = b.add.bind(b);
  b.add("box", 0, 0, 0, 5.8, 0.15, 2.0, "#e7e5e4", { mat: "stone", hdShape: "block" }); // white stone path
  for (const sx of [-1, 1]) {
    b.add("cyl", sx * 1.8, 0.15, 0, 0.7, 2.6, 0.7, BARK, { mat: "wood", hdShape: "trunk" });
    b.add("cyl", sx * 1.25, 2.6, 0, 0.5, 1.6, 0.5, BARK, { rz: sx * 0.75, mat: "wood" }); // trunks bending toward each other
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + sx;
      b.add("cyl", sx * 1.8 + Math.cos(a) * 0.45, -0.1, Math.sin(a) * 0.45, 0.22, 0.8, 0.22, BARK, { rx: Math.sin(a) * 0.7, rz: -Math.cos(a) * 0.7, mat: "wood" }); // roots
    }
    b.add("sphere", sx * 1.7, 3.0, 0, 1.9, 1.6, 1.6, "#15803d", { idle: IDLE_KIND.sway, mat: "leaf", hdShape: "canopy" }); // crowns
    b.add("cyl", sx * 2.9, 0.15, 0.8, 0.06, 1.9, 0.06, SILVER, { mat: "steel" }); // silver pennant poles
    b.add("box", sx * 2.9 + 0.25, 1.55, 0.8, 0.45, 0.6, 0.03, "#0d9488", { idle: IDLE_KIND.flutter, mat: "cloth" });
    b.add("cyl", sx * 2.2, 0.15, 1.05, 0.06, 1.3, 0.06, SILVER, { mat: "steel" }); // moonstone lamp post by the path
    b.add("octa", sx * 2.2, 1.45, 1.05, 0.26, 0.36, 0.26, "#a5f3fc", { glow: true, idle: IDLE_KIND.pulse });
    // HD: a silver cage round the moonstone, a leaf-blade finial on the pennant pole, ivy up the trunk
    lanternFrame(add, sx * 2.2, 1.4, 1.05, 0.32, 0.44, SILVER, { mat: "steel" });
    along(add, "blade", [sx * 2.9, 2.03, 0.8], [sx * 2.9, 2.3, 0.8], 0.07, 0.03, SILVER, hdo("steel"));
    for (let i = 0; i < 6; i++) {
      const a = i * 1.9 + sx;
      add("egg", sx * 1.8 + Math.cos(a) * 0.36, 0.4 + i * 0.36, Math.sin(a) * 0.36, 0.16, 0.1, 0.1, i % 2 ? "#166534" : "#15803d", hdo("leaf", { ry: -a }));
    }
  }
  b.add("sphere", 0, 3.75, 0, 2.2, 1.4, 1.5, "#22a34a", { idle: IDLE_KIND.sway, mat: "leaf", hdShape: "canopy" }); // the joined crown over the arch
  for (const sx of [-0.7, 0, 0.7]) {
    b.add("cyl", sx, 2.7 - Math.abs(sx) * 0.3, 0.3, 0.03, 0.5, 0.03, "#a3a3a3", { mat: "steel" }); // lantern chains
    b.add("octa", sx, 2.35 - Math.abs(sx) * 0.3, 0.3, 0.22, 0.32, 0.22, "#a5f3fc", { glow: true, idle: IDLE_KIND.pulse }); // moonstones
    // HD: a silver ring holding each moonstone
    arc(add, [sx, 2.51 - Math.abs(sx) * 0.3, 0.3], [1, 0, 0], [0, 0, 1], 0.14, 0, Math.PI * 2, 6, 0.025, SILVER, hdo("steel"));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.add("sphere", Math.cos(a) * 1.4, 1.2 + (i % 2) * 0.7, Math.sin(a) * 0.8, 0.14, 0.14, 0.14, "#d9f99d", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i });
  }
  // HD: silver filigree arching from trunk to trunk on both faces, the moonstones hung through it
  for (const z of [0.42, -0.42]) arc(add, [0, 1.45, z], [1, 0, 0], [0, 1, 0], 1.5, 0.25, Math.PI - 0.25, 11, 0.05, SILVER, hdo("steel"));
}

/** Ironforge: a gate cut into a rune-carved rock face, guarded by two stone dwarves with hammers, braziers smoking */
function dwarfGate(b: Builder) {
  const ROCK = "#57534e";
  const STATUE = "#a8a29e";
  const add = b.add.bind(b);
  b.add("box", 0, 0, 0, 6.4, 0.3, 2.4, "#44403c", { mat: "stone", hdShape: "block" }); // flagstone apron
  b.add("box", 0, 0.3, -0.5, 6.0, 4.2, 1.4, ROCK, { mat: "hide" }); // the rock face
  b.add("pyramid", -1.8, 4.5, -0.5, 2.6, 1.4, 1.4, "#78716c", { mat: "hide" }); // crags
  b.add("pyramid", 1.6, 4.5, -0.5, 2.8, 1.8, 1.4, "#78716c", { mat: "hide" });
  b.add("box", 0, 0.3, 0.25, 2.4, 3.0, 0.12, "#292524", { mat: "iron" }); // the great door
  b.add("box", 0, 3.3, 0.25, 2.9, 0.45, 0.3, "#a16207", { mat: "gold" }); // gilded lintel
  for (let i = 0; i < 3; i++) b.add("box", -0.8 + i * 0.8, 1.2, 0.35, 0.3, 1.2, 0.06, "#f59e0b", { glow: true, idle: IDLE_KIND.pulse }); // rune panels
  // HD: dressed pilasters either side of the door, a keystone over the lintel, gilt studs and two rings on the door
  for (const sx of [-1, 1]) add("box", sx * 1.35, 0.3, 0.3, 0.22, 3.0, 0.2, "#6b645e", hdo("stone", { hdShape: "block" }));
  add("box", 0, 3.75, 0.3, 0.5, 0.45, 0.3, "#6b645e", hdo("stone", { hdShape: "block" }));
  for (const x of [-1.05, -0.42, 0.42, 1.05]) for (const y of [0.55, 2.75]) add("sphere", x, y, 0.33, 0.08, 0.08, 0.05, "#d4a017", hdo("gold"));
  for (const sx of [-1, 1]) arc(add, [sx * 0.42, 0.78, 0.35], [1, 0, 0], [0, 1, 0], 0.12, 0, Math.PI * 2, 8, 0.035, "#d4a017", hdo("gold"));
  for (const sx of [-1, 1]) {
    const g = b.child(sx * 2.1, 0.5, 0, 0.3); // stone guardian
    g.add("box", 0, 0, 0, 0.9, 0.5, 0.7, "#78716c", { mat: "stone", hdShape: "block" }); // plinth
    g.add("box", 0, 0.5, 0, 0.75, 1.0, 0.55, STATUE, { mat: "stone" }); // body
    g.add("sphere", 0, 1.5, 0, 0.5, 0.5, 0.5, STATUE, { mat: "stone", hdShape: "egg" }); // head
    g.add("cone", 0, 1.1, 0.25, 0.5, 0.6, 0.2, "#d6d3d1", { rx: Math.PI, mat: "stone" }); // beard
    g.add("cyl", sx * 0.5, 0.3, 0.1, 0.1, 1.6, 0.1, ROCK, { mat: "stone" }); // hammer haft
    g.add("box", sx * 0.5, 1.9, 0.1, 0.5, 0.35, 0.35, "#71717a", { mat: "stone", hdShape: "block" }); // hammer head
    b.add("cyl", sx * 3.0, 0.3, 1.0, 0.45, 1.1, 0.45, "#292524", { mat: "iron" }); // brazier
    b.add("cone", sx * 3.0, 1.4, 1.0, 0.45, 0.5, 0.45, "#f97316", { glow: true, idle: IDLE_KIND.pulse });
    smoke(b, sx * 3.0, 2.0, 1.0, 0.9, "#57534e");
    b.add("box", sx * 1.6, 2.1, 0.3, 0.06, 0.3, 0.2, "#292524", { mat: "iron" }); // iron lantern bracket on the rock face
    b.add("box", sx * 1.6, 2.45, 0.4, 0.26, 0.32, 0.26, "#fbbf24", { glow: true, idle: IDLE_KIND.pulse });
    // HD: the guardian's carved face, a helm with a nose guard, braids in the beard, arms to the haft, belt and boots;
    // bands on its hammer; the brazier's legs; an iron cage round the lantern
    const ga = g.add.bind(g);
    const carve: Add = (shape, x, y0, z, w, h, d, _c, o) => ga(shape, x, y0, z, w, h, d, STATUE, { ...o, mat: "stone" });
    const look: FigureLook = { skin: STATUE, tunic: STATUE, legs: STATUE, boots: STATUE, belt: STATUE, eyes: STATUE, sclera: STATUE };
    faceAt(carve, look, {}, 1.75, 0.02, 0.5 / 0.34);
    ga("sphere", 0, 1.8, -0.02, 0.56, 0.36, 0.56, "#8f8a84", hdo("stone"));
    ga("box", 0, 1.62, 0.26, 0.06, 0.2, 0.06, "#8f8a84", hdo("stone"));
    for (const k of [-1, 1]) along(ga, "capsule", [k * 0.1, 1.15, 0.3], [k * 0.13, 0.82, 0.3], 0.07, 0.07, "#d6d3d1", hdo("stone"));
    along(ga, "limb", [-sx * 0.38, 1.38, 0.05], [sx * 0.42, 1.05, 0.14], 0.16, 0.16, STATUE, hdo("stone"));
    along(ga, "limb", [sx * 0.4, 1.38, 0], [sx * 0.48, 0.95, 0.12], 0.16, 0.16, STATUE, hdo("stone"));
    ga("sphere", sx * 0.5, 0.98, 0.1, 0.15, 0.15, 0.15, STATUE, hdo("stone"));
    ga("box", 0, 0.82, 0, 0.82, 0.12, 0.62, "#8f8a84", hdo("stone"));
    for (const k of [-1, 1]) ga("box", k * 0.2, 0.5, 0.1, 0.28, 0.14, 0.46, "#8f8a84", hdo("stone"));
    for (const y of [1.96, 2.15]) ga("box", sx * 0.5, y, 0.1, 0.54, 0.06, 0.39, "#57534e", hdo("stone"));
    brazierLegs(add, sx * 3.0, 0.3, 1.0, 0.45, 1.1);
    lanternFrame(add, sx * 1.6, 2.43, 0.4, 0.3, 0.36, IRON, { mat: "iron" });
  }
}

export function buildGateModel(type: string, b: Builder): boolean {
  switch (type) {
    case "gate-human":
      humanGate(b);
      return true;
    case "gate-orc":
      orcGate(b);
      return true;
    case "gate-elf":
      elfGate(b);
      return true;
    case "gate-dwarf":
      dwarfGate(b);
      return true;
  }
  return false;
}
