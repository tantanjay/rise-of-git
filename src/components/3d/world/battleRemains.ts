import { CivilizationType } from "@/types";
import { CIV_WAR_COLOR } from "@/utils/war";
import { Rng, hashString, mulberry32, range } from "@/utils/random";
import { Builder, IDLE_KIND, Part, emptyScene } from "@/components/3d/city/parts";
import { Add, AddOpts, V3, along, arc, bone, skull, wheel } from "./kitParts";

/*
 * What a routed army leaves on the battlefield, as one Builder part list (drawn instanced by `DefeatMarkers`, and in
 * the Royal Codex): its standard snapped and still hanging in the civilization's colours, a second banner trampled
 * into the mud, shields, helmets and skulls, its broken weapons (each civilization its own: Valoria's swords and kite
 * shields, Sylvandale's bows and leaf shields, Ironforge's axes, Drak'mar's cleavers, Nethergarde's crystal staves), a
 * spear with a torn pennon, and a fire of broken shafts. The more soldiers fell, the more is strewn round it.
 *
 * It fades over its lifetime in three stages: burning (flames, bright embers, a column of dark smoke), smouldering
 * (red embers, grey smoke) and cold (a last wisp; a staff's crystal has gone dark). Only the stage changes the parts.
 * HD draws the same parts through the model kit, plus HD-only detail (rims and bosses, crests, tassels, a scorched
 * shield in the fire, real skulls and bones, arrows stuck all over the field, a shattered cart wheel).
 */

/** Burning, smouldering, cold */
export type RemainsStage = 0 | 1 | 2;
/** Where each stage starts, as a fraction of the remains' lifetime */
export const REMAINS_STAGE_AT = [0, 0.35, 0.7] as const;

export interface RemainsSite {
  id: string;
  /** The ground point at the middle of the battlefield */
  x: number;
  y: number;
  z: number;
  /** The routed army's civilization: its colours and its weapons */
  civ: CivilizationType;
  /** Soldiers lost: how much is strewn round the standard */
  fallen: number;
}

/** The whole model is drawn this many times larger than authored (one authored unit is about a soldier's height) */
const SCALE = 1.8;

type Weapon = "sword" | "bow" | "axe" | "cleaver" | "staff";
type ShieldShape = "round" | "kite" | "leaf";

const LOOK: Record<CivilizationType, { trim: string; metal: string; shield: ShieldShape; weapon: Weapon }> = {
  human: { trim: "#facc15", metal: "#cbd5e1", shield: "kite", weapon: "sword" },
  elf: { trim: "#d1fae5", metal: "#e2e8f0", shield: "leaf", weapon: "bow" },
  dwarf: { trim: "#44403c", metal: "#a8a29e", shield: "round", weapon: "axe" },
  orc: { trim: "#e7e5e4", metal: "#78716c", shield: "round", weapon: "cleaver" },
  arcane: { trim: "#f0abfc", metal: "#a5b4fc", shield: "kite", weapon: "staff" }
};

const WOOD = "#5b3a1e";
const WOOD_LIGHT = "#8a6a43";
const CHAR = "#292524";
const BONE = "#e7e5e4";
const IRON = "#57534e";
const CRYSTAL = "#c084fc";

const STAGE_EMBERS = [7, 4, 0];
const STAGE_EMBER_COLOR = ["#fbbf24", "#b91c1c", "#b91c1c"];
const STAGE_SMOKE = [
  { puffs: 5, size: 0.22, color: "#78716c" },
  { puffs: 4, size: 0.15, color: "#a8a29e" },
  { puffs: 3, size: 0.09, color: "#d6d3d1" }
];

/** How many things lie strewn round the standard: 5 for a handful of losses, up to 11 for a slaughter */
export const strewnCount = (fallen: number) => 5 + Math.min(6, Math.floor(Math.log2(1 + Math.max(0, fallen)) * 0.75));

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const plus = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
/** A unit direction tipped `tilt` from upright toward the heading `yaw` */
const tipped = (tilt: number, yaw: number): V3 => [Math.sin(tilt) * Math.sin(yaw), Math.cos(tilt), Math.sin(tilt) * Math.cos(yaw)];

/**
 * The remains of one battle at `stage`, in world space. `ground` gives the terrain height under each piece, so every
 * shield and blade rests on the slope it lies on.
 */
export function buildRemains(site: RemainsSite, stage: RemainsStage, ground: (x: number, z: number) => number = () => site.y): Part[] {
  const out = emptyScene();
  const look = LOOK[site.civ];
  const banner = CIV_WAR_COLOR[site.civ];
  // The layout is the same in every stage and both qualities; HD-only detail draws from its own rng
  const rng = mulberry32(hashString(`${site.id}:remains`));
  const hdRng = mulberry32(hashString(`${site.id}:remains-hd`));
  const root = new Builder(out, site.x, site.y, site.z, rng() * Math.PI * 2);

  /** A piece of the remains standing at local (x, z), turned by `rot`, on the ground under it, in authored units */
  const piece = (x: number, z: number, rot = 0): Add => {
    const [wx, wz] = root.world(x * SCALE, z * SCALE);
    const b = root.child(x * SCALE, z * SCALE, rot, ground(wx, wz) - site.y);
    return (shape, px, y0, pz, w, h, d, color, o: AddOpts = {}) =>
      b.add(shape, px * SCALE, y0 * SCALE, pz * SCALE, w * SCALE, h * SCALE, d * SCALE, color, o.pivot ? { ...o, pivot: [o.pivot[0] * SCALE, o.pivot[1] * SCALE] } : o);
  };

  standard(piece(0, 0, range(rng, -0.4, 0.4)), banner, look.trim);
  fire(piece(-0.5, -0.4, rng() * Math.PI), stage, look);

  // Strewn round the standard on a ragged ring, the trampled banner and the spear always among them
  const n = strewnCount(site.fallen);
  const kinds: Array<"trampled" | "spear" | "shield" | "weapon" | "helm" | "skull"> = ["trampled", "shield", "weapon", "spear", "skull", "helm", "shield", "weapon", "skull", "shield", "helm"];
  const start = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2 + range(rng, -0.25, 0.25);
    const r = range(rng, 1.05, 1.75) + (i % 2) * 0.25;
    const add = piece(Math.cos(a) * r, Math.sin(a) * r, rng() * Math.PI * 2);
    const flip = rng() < 0.5;
    switch (kinds[i]) {
      case "trampled":
        trampled(add, banner, look.trim, hdRng);
        break;
      case "spear":
        spear(add, look, flip);
        break;
      case "shield":
        // Round shields may stand propped on their rims; kites and leaves lie flat
        shield(add, banner, look, flip || look.shield !== "round" ? 0 : range(rng, 0.9, 1.15), hdRng);
        break;
      case "weapon":
        weapon(add, look, stage, flip);
        break;
      case "helm":
        helm(add, look, site.civ);
        break;
      case "skull":
        bones(add, rng() * Math.PI * 2, hdRng);
        break;
    }
  }

  // HD: arrows stuck all over the field, and a cart wheel smashed by the fire
  const arrows = 6 + Math.min(6, Math.floor(site.fallen / 20));
  for (let i = 0; i < arrows; i++) {
    const a = hdRng() * Math.PI * 2;
    const r = 0.5 + Math.sqrt(hdRng()) * 1.7;
    arrow(piece(Math.cos(a) * r, Math.sin(a) * r), hdRng);
  }
  const cart = piece(-1.7, 0.75, rng() * Math.PI);
  const tilt = 0.35;
  const u: V3 = [1, 0, 0];
  const v: V3 = [0, Math.cos(tilt), -Math.sin(tilt)];
  // Leaning back on its broken rim: the lowest point of the rim just touches the ground
  wheel(cart, [0, 0.32 * Math.cos(tilt), 0], u, v, 0.32, 0.05, WOOD, { hd: true, mat: "wood" }, 6, 0.4, Math.PI * 1.6);

  return withSync(out.parts);
}

/** Parts of a `sync` group move exactly with its first part (its anchor, phase and tempo) */
function withSync(parts: Part[]): Part[] {
  const leads = new Map<number, Part["idle"]>();
  return parts.map((p) => {
    if (p.sync === undefined || !p.idle) return p;
    const lead = leads.get(p.sync);
    if (!lead) {
      leads.set(p.sync, p.idle);
      return p;
    }
    return { ...p, idle: lead };
  });
}

/** The army's standard: the pole snapped and leaning, its banner torn but still hanging from the crossbar, fluttering */
function standard(add: Add, color: string, trim: string) {
  const foot: V3 = [0, -0.05, 0];
  const top: V3 = [0.28, 1.55, 0.05];
  const at = (y: number): V3 => {
    const f = (y - foot[1]) / (top[1] - foot[1]);
    return [foot[0] + (top[0] - foot[0]) * f, y, foot[2] + (top[2] - foot[2]) * f];
  };
  along(add, "cyl", foot, top, 0.1, 0.1, WOOD, { mat: "wood" });
  // HD: the snapped end in splinters, an iron shoe at its foot
  along(add, "blade", top, plus(top, [0.03, 0.16, 0]), 0.09, 0.05, WOOD_LIGHT, { hd: true, mat: "wood" });
  along(add, "blade", plus(top, [-0.02, -0.04, 0.02]), plus(top, [-0.05, 0.1, 0.03]), 0.05, 0.03, WOOD_LIGHT, { hd: true, mat: "wood" });
  along(add, "cyl", at(0.02), at(0.14), 0.13, 0.13, IRON, { hd: true, mat: "dull" });
  // The crossbar sags where it was struck
  const bar0 = at(1.38);
  const bar1: V3 = [0.98, 1.3, 0.05];
  along(add, "cyl", bar0, bar1, 0.06, 0.06, WOOD, { mat: "wood" });
  add("sphere", bar1[0] + 0.02, bar1[1] - 0.05, bar1[2], 0.1, 0.1, 0.1, IRON, { hd: true, mat: "dull" });
  add("cyl", bar0[0] + 0.08, bar0[1] - 0.06, bar0[2], 0.1, 0.12, 0.1, "#78350f", { hd: true, mat: "leather" }); // lashing
  // The banner hangs from the crossbar; one tongue of it is torn away, the other hangs on below
  const flutter = (o: AddOpts = {}): AddOpts => ({ mat: "cloth", idle: IDLE_KIND.flutter, pivot: [bar0[0], bar0[2]], sync: 1, ...o });
  add("box", 0.62, 0.52, 0.05, 0.62, 0.76, 0.03, color, flutter({ rz: -0.1 }));
  add("box", 0.45, 0.26, 0.05, 0.26, 0.3, 0.03, color, flutter({ rz: -0.06 }));
  // A lozenge of the civilization's trim on both faces
  add("box", 0.63, 0.82, 0.05, 0.2, 0.2, 0.13, trim, flutter({ rz: Math.PI / 4 }));
  // HD: tassels along the hem that is left, a trim band under the crossbar
  for (let k = 0; k < 4; k++) add("capsule", 0.68 + k * 0.07, 0.4 - (k % 2) * 0.03, 0.05, 0.03, 0.13, 0.03, trim, flutter({ hd: true }));
  add("box", 0.62, 1.2, 0.05, 0.6, 0.06, 0.13, trim, flutter({ hd: true, rz: -0.1 }));
}

/** A second banner, torn from its pole and trampled flat into the mud */
function trampled(add: Add, color: string, trim: string, hdRng: Rng) {
  along(add, "cyl", [-0.75, 0.04, -0.1], [0.55, 0.04, 0.05], 0.08, 0.08, WOOD, { mat: "wood" });
  along(add, "cyl", [0.62, 0.04, 0.08], [0.95, 0.06, 0.2], 0.07, 0.07, WOOD_LIGHT, { mat: "wood" }); // its broken end
  add("box", 0.05, 0.02, 0.32, 0.62, 0.035, 0.46, color, { mat: "cloth", ry: 0.08, rx: 0.04 });
  add("box", 0.48, 0.02, 0.48, 0.32, 0.035, 0.26, color, { mat: "cloth", ry: -0.3, rz: 0.05 });
  add("box", 0.05, 0.065, 0.32, 0.16, 0.05, 0.16, trim, { mat: "cloth", ry: 0.08 + Math.PI / 4 });
  // HD: mud on the cloth, tassels along its edge
  for (let k = 0; k < 3; k++) add("sphere", -0.15 + hdRng() * 0.4, 0.04, 0.2 + hdRng() * 0.25, 0.14, 0.04, 0.1, "#57412b", { hd: true, mat: "hide" });
  for (let k = 0; k < 5; k++) add("capsule", -0.22 + k * 0.13, 0.025, 0.58, 0.03, 0.03, 0.12, trim, { hd: true, mat: "cloth", rx: Math.PI / 2 });
}

/** A spear driven into the ground at a slant, its shaft snapped short, a torn pennon still fluttering from it */
function spear(add: Add, look: (typeof LOOK)[CivilizationType], lean: boolean) {
  const dir = tipped(lean ? 0.45 : 0.3, 0.6);
  const foot: V3 = [0, -0.1, 0];
  const top = plus(foot, dir, 1.05);
  along(add, "cyl", foot, top, 0.055, 0.055, WOOD_LIGHT, { mat: "wood" });
  along(add, "blade", top, plus(top, dir, 0.1), 0.05, 0.03, WOOD_LIGHT, { hd: true, mat: "wood" });
  // The pennon, just under the break
  const p = plus(foot, dir, 0.85);
  add("box", p[0] + 0.18, p[1] - 0.14, p[2], 0.34, 0.14, 0.02, look.trim, { mat: "cloth", idle: IDLE_KIND.flutter, pivot: [p[0], p[2]], sync: 2 });
  add("box", p[0] + 0.12, p[1] - 0.2, p[2], 0.22, 0.06, 0.02, look.trim, { mat: "cloth", idle: IDLE_KIND.flutter, pivot: [p[0], p[2]], sync: 2 });
  // The rest of the shaft and its iron head lie beside it
  along(add, "cyl", [0.35, 0.03, 0.25], [0.95, 0.03, 0.4], 0.05, 0.05, WOOD_LIGHT, { mat: "wood" });
  along(add, "octa", [0.95, 0.04, 0.4], [1.19, 0.04, 0.46], 0.03, 0.09, look.metal, { mat: "iron", hdShape: "blade" });
}

/**
 * A shield: lying flat (`tilt` 0) or propped up on its rim, leaning back at `tilt`, in the army's colour with a metal
 * boss; HD adds the iron rim, a quartering of the trim and a crack where the blow landed
 */
function shield(add: Add, color: string, look: (typeof LOOK)[CivilizationType], tilt: number, hdRng: Rng) {
  const t = 0.05;
  // Its face's normal and the two axes across it (x stays level)
  const n: V3 = [0, Math.cos(tilt), Math.sin(tilt)];
  const v: V3 = [0, -Math.sin(tilt), Math.cos(tilt)];
  const r = look.shield === "round" ? 0.28 : 0.3;
  const c: V3 = tilt ? [0, r * Math.sin(tilt) + t, -r * Math.cos(tilt) * 0.2] : [0, t / 2, 0];
  const o = (extra: AddOpts = {}): AddOpts => ({ rx: tilt, ...extra });
  const centre = (p: V3, h: number): [number, number, number] => [p[0], p[1] - h / 2, p[2]];
  if (look.shield === "round") {
    add("cyl", ...centre(c, t), 0.56, t, 0.56, color, o({ mat: "wood" }));
  } else if (look.shield === "leaf") {
    add("sphere", ...centre(c, t), 0.4, t, 0.64, color, o({ mat: "wood" }));
  } else {
    // A kite: a broad top tapering to a point
    const top = plus(c, v, 0.08);
    add("box", ...centre(top, t), 0.44, t, 0.4, color, o({ mat: "wood" }));
    const point = plus(c, v, -0.16);
    add("box", ...centre(point, t), 0.3, t, 0.3, color, o({ mat: "wood", ry: Math.PI / 4 }));
  }
  const boss = plus(c, n, t / 2 + 0.02);
  add("sphere", ...centre(boss, 0.1), 0.15, 0.1, 0.15, look.metal, o({ mat: "iron" }));
  // HD: the rim (round shields), a band of the trim across it, a crack, an arrow in it
  if (look.shield === "round") arc(add, plus(c, n, 0.005), [1, 0, 0], v, 0.28, 0, Math.PI * 2, 12, 0.04, IRON, { hd: true, mat: "dull" });
  along(add, "box", plus(plus(c, v, -0.22), n, t / 2 + 0.005), plus(plus(c, v, 0.22), n, t / 2 + 0.005), 0.07, 0.02, look.trim, { hd: true, mat: "cloth" });
  const crack = plus(c, n, t / 2 + 0.01);
  along(add, "box", plus(crack, [0.08, 0, 0]), plus(plus(crack, [0.2, 0, 0]), v, 0.14), 0.02, 0.012, CHAR, { hd: true });
  if (hdRng() < 0.6) {
    const at = plus(plus(c, [-0.12, 0, 0]), v, 0.08);
    arrowShaft(add, at, plus(n, [0.3, 0, 0.2]), hdRng);
  }
}

/** The civilization's weapon, broken: a sword snapped in two, a broken bow, an axe and a cleaver in the mud, a cracked staff */
function weapon(add: Add, look: (typeof LOOK)[CivilizationType], stage: RemainsStage, upright: boolean) {
  const metal = look.metal;
  switch (look.weapon) {
    case "sword": {
      if (upright) {
        // Driven into the ground, its hilt slanting up
        const d = tipped(0.25, 1.2);
        const hilt = plus([0, 0, 0], d, 0.62);
        along(add, "box", hilt, [0, -0.15, 0], 0.09, 0.025, metal, { mat: "iron", hdShape: "blade" });
        sword(add, hilt, d, look);
      } else {
        // Snapped: the hilt and half the blade, the point lying apart
        const hilt: V3 = [0, 0.05, 0];
        const d: V3 = [1, 0, 0];
        // Lying flat: along a level line the part's w stands upright, so the blade's width is its d
        along(add, "box", plus(hilt, d, -0.05), plus(hilt, d, -0.5), 0.025, 0.09, metal, { mat: "iron" });
        sword(add, hilt, [-1, 0, 0], look);
        along(add, "box", [-0.62, 0.02, 0.18], [-0.95, 0.02, 0.3], 0.025, 0.09, metal, { mat: "iron", hdShape: "blade" });
      }
      return;
    }
    case "bow": {
      // A bow snapped at the grip, its two limbs lying apart; HD keeps a length of its string
      arc(add, [0, 0.03, 0], [1, 0, 0], [0, 0, 1], [0.5, 0.18], 0.15, Math.PI * 0.48, 4, 0.04, WOOD_LIGHT, { mat: "wood" }, "cyl");
      arc(add, [0.1, 0.03, 0.12], [1, 0, 0], [0, 0, 1], [0.5, 0.18], Math.PI * 0.56, Math.PI * 0.88, 3, 0.04, WOOD_LIGHT, { mat: "wood" }, "cyl");
      along(add, "cyl", [0.49, 0.025, 0.08], [0.1, 0.025, -0.2], 0.008, 0.008, "#e7e5e4", { hd: true });
      // Its quiver, spilled
      along(add, "cyl", [-0.35, 0.07, -0.35], [0.05, 0.07, -0.55], 0.14, 0.14, "#7c2d12", { mat: "leather" });
      for (let k = 0; k < 3; k++) along(add, "cyl", [0.06 + k * 0.03, 0.05, -0.53 - k * 0.05], [0.38 + k * 0.04, 0.03, -0.7 - k * 0.07], 0.018, 0.018, WOOD_LIGHT, { hd: true, mat: "wood" });
      return;
    }
    case "axe": {
      // An axe buried head-first in the ground, its haft slanting up
      const d = tipped(upright ? 0.5 : 0.75, -0.8);
      const head: V3 = [0, 0.06, 0];
      along(add, "cyl", head, plus(head, d, 0.85), 0.06, 0.06, WOOD, { mat: "wood" });
      along(add, "box", plus(head, d, -0.08), plus(head, d, 0.14), 0.3, 0.08, metal, { mat: "iron" });
      along(add, "cyl", plus(head, d, 0.6), plus(head, d, 0.72), 0.08, 0.08, "#78350f", { hd: true, mat: "leather" }); // grip wrap
      along(add, "blade", plus(head, d, 0.85), plus(head, d, 0.95), 0.07, 0.07, metal, { hd: true, mat: "iron" }); // butt spike
      return;
    }
    case "cleaver": {
      // A broad cleaver driven into the mud, notched
      const d = tipped(upright ? 0.2 : 0.55, 2.1);
      const hilt = plus([0, 0, 0], d, 0.48);
      along(add, "box", hilt, [0, -0.1, 0], 0.22, 0.04, metal, { mat: "iron" });
      along(add, "cyl", hilt, plus(hilt, d, 0.3), 0.06, 0.06, "#422006", { mat: "leather" });
      along(add, "box", plus(hilt, d, -0.02), plus(hilt, d, 0.05), 0.3, 0.07, IRON, { mat: "dull" });
      const pommel = plus(hilt, d, 0.3);
      add("sphere", pommel[0], pommel[1] - 0.05, pommel[2], 0.1, 0.1, 0.1, BONE, { hd: true, mat: "bone" }); // bone pommel
      return;
    }
    case "staff": {
      // A staff broken across its middle, its crystal cracked: still lit while the fire burns, dark once it is cold
      along(add, "cyl", [-0.7, 0.04, 0], [0.05, 0.04, 0.1], 0.06, 0.06, "#3b0764", { mat: "wood" });
      along(add, "cyl", [0.2, 0.05, 0.22], [0.8, 0.05, 0.05], 0.06, 0.06, "#3b0764", { mat: "wood" });
      const lit = stage < 2;
      add("octa", 0.92, 0.04, 0.02, 0.2, 0.3, 0.2, lit ? CRYSTAL : "#4c1d95", { glow: lit, mat: "gem", rz: Math.PI / 2.4, ...(lit && { idle: IDLE_KIND.pulse }) });
      along(add, "cyl", [0.78, 0.05, 0.06], [0.83, 0.05, 0.04], 0.1, 0.1, look.metal, { hd: true, mat: "iron" }); // its collar
      for (let k = 0; k < 2; k++) add("octa", 1.1 + k * 0.12, 0, 0.1 - k * 0.2, 0.07, 0.08, 0.07, lit ? CRYSTAL : "#4c1d95", { hd: true, glow: lit, mat: "gem" }); // shards
      return;
    }
  }
}

/** A sword's guard, grip and pommel at `hilt`, the grip running along `d` */
function sword(add: Add, hilt: V3, d: V3, look: (typeof LOOK)[CivilizationType]) {
  const side = cross(d, [0, 1, 0]);
  const s: V3 = Math.hypot(...side) < 0.1 ? [0, 0, 1] : side;
  const l = Math.hypot(...s);
  const u: V3 = [s[0] / l, s[1] / l, s[2] / l];
  along(add, "box", plus(hilt, u, -0.17), plus(hilt, u, 0.17), 0.05, 0.07, look.trim === "#facc15" ? "#ca8a04" : look.metal, { mat: "iron" });
  along(add, "cyl", plus(hilt, d, 0.02), plus(hilt, d, 0.2), 0.045, 0.045, "#422006", { mat: "leather" });
  const p = plus(hilt, d, 0.25);
  add("sphere", p[0], p[1] - 0.04, p[2], 0.08, 0.08, 0.08, look.trim === "#facc15" ? "#ca8a04" : look.metal, { mat: "iron" });
}

/** A helmet, knocked off and lying in the mud; HD adds its nose guard and crest (an orc's has horns) */
function helm(add: Add, look: (typeof LOOK)[CivilizationType], civ: CivilizationType) {
  add("sphere", 0, -0.06, 0, 0.32, 0.3, 0.34, look.metal, { mat: "iron" });
  add("cyl", 0, -0.01, 0, 0.36, 0.05, 0.38, look.metal, { mat: "iron" });
  add("box", 0, -0.02, 0.17, 0.05, 0.16, 0.04, look.metal, { hd: true, mat: "iron" }); // nose guard
  if (civ === "orc") {
    for (const sx of [-1, 1]) along(add, "horn", [sx * 0.13, 0.05, 0], [sx * 0.3, 0.25, -0.04], 0.08, 0.08, BONE, { hd: true, mat: "bone" });
  } else {
    along(add, "capsule", [0, 0.1, 0.12], [0, 0.11, -0.16], 0.05, 0.07, look.trim, { hd: true, mat: civ === "dwarf" ? "iron" : "cloth" });
  }
}

/** A skull in the grass; HD draws it as a real skull with bones scattered round it */
function bones(add: Add, ry: number, hdRng: Rng) {
  const dir: V3 = [Math.sin(ry), 0, Math.cos(ry)];
  add("sphere", 0, 0, 0, 0.28, 0.25, 0.28, BONE, { hd: false });
  add("box", dir[0] * 0.05, 0, dir[2] * 0.05, 0.17, 0.08, 0.13, "#d6d3d1", { hd: false, ry });
  for (const k of [-1, 1]) add("sphere", dir[0] * 0.12 + dir[2] * k * 0.06, 0.11, dir[2] * 0.12 - dir[0] * k * 0.06, 0.07, 0.07, 0.07, "#1c1917", { hd: false });
  skull(add, 0, 0.02, 0, 0.26, BONE, ry, { hd: true, mat: "bone" });
  const a = hdRng() * Math.PI;
  bone(add, [0.22, 0.02, -0.05], [0.22 + Math.cos(a) * 0.35, 0.02, -0.05 + Math.sin(a) * 0.35], 0.035, BONE, { hd: true, mat: "bone" });
  bone(add, [-0.2, 0.02, 0.15], [-0.42, 0.02, 0.3], 0.03, BONE, { hd: true, mat: "bone" });
}

/** The fire: broken shafts heaped and charred, flames while it burns, embers dying down, smoke thinning to a wisp */
function fire(add: Add, stage: RemainsStage, look: (typeof LOOK)[CivilizationType]) {
  along(add, "cyl", [-0.4, 0.05, -0.1], [0.4, 0.07, 0.12], 0.08, 0.08, CHAR, { mat: "wood" });
  along(add, "cyl", [-0.1, 0.05, -0.38], [0.15, 0.12, 0.35], 0.07, 0.07, "#3f2a1d", { mat: "wood" });
  along(add, "cyl", [0.3, 0.04, -0.3], [-0.3, 0.13, 0.25], 0.07, 0.07, CHAR, { mat: "wood" });
  // HD: a scorched shield in the heap and charcoal round it
  add("cyl", 0.3, 0.0, 0.25, 0.3, 0.03, 0.3, CHAR, { hd: true, mat: "wood", rx: 0.2 });
  add("sphere", 0.3, 0.06, 0.25, 0.08, 0.05, 0.08, look.metal, { hd: true, mat: "iron", rx: 0.2 });
  for (let k = 0; k < 5; k++) add("sphere", -0.3 + k * 0.15, -0.01, -0.25 + ((k * 7) % 5) * 0.12, 0.08, 0.05, 0.07, "#1c1917", { hd: true, mat: "stone" });
  if (stage === 0) {
    add("octa", -0.05, 0.06, 0.0, 0.2, 0.46, 0.2, "#f97316", { glow: true, idle: IDLE_KIND.pulse });
    add("octa", 0.12, 0.06, 0.1, 0.13, 0.3, 0.13, "#fbbf24", { glow: true, idle: IDLE_KIND.pulse, phase: 2.1 });
  }
  for (let k = 0; k < STAGE_EMBERS[stage]; k++) {
    const a = k * 2.4;
    const r = 0.12 + (k % 3) * 0.1;
    add("octa", Math.cos(a) * r, 0.04 + (k % 2) * 0.04, Math.sin(a) * r, 0.08, 0.08, 0.08, STAGE_EMBER_COLOR[stage], { glow: true, idle: IDLE_KIND.pulse, phase: 0.7 * k + 0.3 });
  }
  const smoke = STAGE_SMOKE[stage];
  for (let k = 0; k < smoke.puffs; k++) add("sphere", 0, 0.15, 0, smoke.size, smoke.size * 0.9, smoke.size, smoke.color, { idle: IDLE_KIND.smoke, phase: 0.01 + (k * Math.PI * 2) / smoke.puffs });
}

/** HD: an arrow stuck in the ground at a slant */
function arrow(add: Add, hdRng: Rng) {
  const d = tipped(0.2 + hdRng() * 0.5, hdRng() * Math.PI * 2);
  arrowShaft(add, [0, -0.05, 0], d, hdRng);
}

function arrowShaft(add: Add, foot: V3, dir: V3, hdRng: Rng) {
  const l = Math.hypot(...dir);
  const d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  const len = 0.36 + hdRng() * 0.08;
  const end = plus(foot, d, len);
  along(add, "cyl", foot, end, 0.018, 0.018, WOOD_LIGHT, { hd: true, mat: "wood" });
  along(add, "box", plus(end, d, -0.09), plus(end, d, -0.01), 0.06, 0.006, "#f5f5f4", { hd: true, mat: "cloth" });
}
