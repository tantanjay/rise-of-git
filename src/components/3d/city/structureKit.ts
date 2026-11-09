import { Builder, IDLE_KIND, Surface } from "./parts";
import type { Ctx } from "./blueprints";
import { lanternFrame, type AddOpts } from "@/components/3d/world/kitParts";

/*
 * Shared pieces for the civilizations' structures on the visual rarity ladder (see docs/MODEL_STYLE.md and the per-civ files
 * `humanStructures.ts`, `elfStructures.ts`, `dwarfStructures.ts`, `orcStructures.ts`, `arcaneStructures.ts`):
 * - tier 0, common: plain and matte, nothing glowing;
 * - tier 1, uncommon: the civilization's one accent colour and a small prop;
 * - tier 2, rare: metal or glowing trim, lit windows and one looping effect (`smoke`, `vane`, a fluttering banner);
 * - tier 3, epic: a bigger silhouette, emissive details and things circling it (`circling`, `motes`).
 * Each drawer fits its tier's footprint (`UNIT_SIZE` in blueprints.ts) and faces +z.
 *
 * HD (the model kit): every part says what it is made of (`mat`), and the pieces here add their HD-only detail
 * (`hd: true`): frames, sills and glazing bars round windows, door frames and bands, chimney caps and pots, a vane's
 * arrow and compass, birds with wings, twine on bales, lantern frames on lamp posts, a crossbar and finial on pennants.
 * HD parts never draw on `ctx.rng` (Normal must not change).
 */

/** Draws one structure at the builder's origin */
export type Drawer = (b: Builder, ctx: Ctx) => void;

export const IRON = "#374151";
export const GLASS = "#93a4b8";

/** Options for an HD-only part made of `mat` */
export const hd = (mat: Surface, o: AddOpts = {}): AddOpts => ({ ...o, mat, hd: true });

/** A seeded phase for something of an HD version that moves, from where it stands (never `ctx.rng`) */
export function seedPhase(b: Builder, x: number, z: number) {
  const [wx, wz] = b.world(x, z);
  const v = Math.sin(wx * 12.9898 + wz * 78.233 + b.oy * 37.719) * 43758.5453;
  return 0.01 + (v - Math.floor(v)) * Math.PI * 2;
}

/** What a window's or door's HD frame is made of */
export interface Trim {
  color: string;
  mat: Surface;
}
export const WOOD_TRIM: Trim = { color: "#4a3523", mat: "wood" };

/**
 * A window on a front face at z (sticks 0.07 out of it): lit, matte glass or closed shutters. HD: a frame standing
 * 0.05 proud of it with a sill under it, glazing bars across glass, battens across shutters
 */
export function win(b: Builder, x: number, y0: number, z: number, look: "lit" | "glass" | "shut", w = 0.3, h = 0.34, color?: string, shutter = "#6b4423", trim: Trim = WOOD_TRIM) {
  const c = look === "lit" ? (color ?? "#fde68a") : look === "glass" ? (color ?? GLASS) : shutter;
  b.add("box", x, y0, z + 0.03, w, h, 0.08, c, { glow: look === "lit", mat: look === "shut" ? "wood" : "gem" });
  const o = hd(trim.mat);
  for (const s of [-1, 1]) b.add("box", x + s * (w / 2 + 0.025), y0, z + 0.05, 0.05, h, 0.14, trim.color, o);
  b.add("box", x, y0 + h, z + 0.05, w + 0.1, 0.05, 0.14, trim.color, o);
  b.add("box", x, y0 - 0.05, z + 0.05, w + 0.1, 0.05, 0.14, trim.color, o);
  b.add("box", x, y0 - 0.1, z + 0.08, w + 0.22, 0.05, 0.2, trim.color, o); // sill
  if (look === "shut") {
    for (const k of [0.25, 0.7]) b.add("box", x, y0 + h * k, z + 0.08, w, 0.04, 0.08, shutter, hd("wood"));
  } else if (w >= 0.2) {
    b.add("box", x, y0, z + 0.08, 0.03, h, 0.08, trim.color, o);
    b.add("box", x, y0 + h * 0.55, z + 0.08, w, 0.03, 0.08, trim.color, o);
  }
}

/**
 * A door on a front face at z (its leaf `d` thick, 0.03 out of the face, made of `leaf`). HD: a frame of two posts and a lintel
 * standing 0.05 proud of it; with `metal`, two bands across it and a ring pull
 */
export function door(b: Builder, x: number, y0: number, z: number, w: number, h: number, color: string, trim: Trim = WOOD_TRIM, metal?: Surface, d = 0.08, leaf: Surface = "wood") {
  b.add("box", x, y0, z + 0.03, w, h, d, color, { mat: leaf });
  const front = z + 0.03 + d / 2;
  const o = hd(trim.mat);
  for (const s of [-1, 1]) b.add("box", x + s * (w / 2 + 0.04), y0, front - 0.01, 0.08, h + 0.02, 0.12, trim.color, o);
  b.add("box", x, y0 + h, front - 0.01, w + 0.16, 0.09, 0.12, trim.color, o);
  if (!metal) return;
  const iron = metal === "gold" ? "#d4a017" : "#3f3f46";
  for (const k of [0.22, 0.68]) b.add("box", x, y0 + h * k, front + 0.025, w - 0.04, 0.05, 0.05, iron, hd(metal));
  b.add("cyl", x + w * 0.28, y0 + h * 0.45 - 0.015, front + 0.02, 0.09, 0.03, 0.09, iron, hd(metal, { rx: Math.PI / 2 }));
}

/** Three puffs rising one after another from (x, y, z): a chimney's or a fire's smoke */
export function smoke(b: Builder, x: number, y: number, z: number, color = "#d6d3d1", s = 1) {
  for (let i = 0; i < 3; i++) b.add("sphere", x, y, z, 0.3 * s, 0.27 * s, 0.3 * s, color, { idle: IDLE_KIND.smoke, phase: 0.01 + (i * Math.PI * 2) / 3 });
}

/** A chimney; `smoking` puts its smoke on it (the rare tier's looping effect). HD: a cap, and a clay pot on a smoking one */
export function chimney(b: Builder, color: string, x: number, y0: number, z: number, h: number, smoking = false) {
  b.add("box", x, y0, z, 0.32, h, 0.32, color, { mat: "masonry" });
  b.add("box", x, y0 + h - 0.12, z, 0.42, 0.12, 0.42, color, hd("masonry"));
  if (smoking) {
    b.add("cyl", x, y0 + h, z, 0.16, 0.14, 0.16, "#9a4f32", hd("plain"));
    smoke(b, x, y0 + h, z);
  }
}

/** A weathervane on a rod, turning in the wind. HD: a thin arm with an arrowhead and a tail fin, a compass cross under it */
export function vane(b: Builder, x: number, y0: number, z: number, color = IRON) {
  b.add("cyl", x, y0, z, 0.04, 0.45, 0.04, color, { mat: "iron" });
  b.add("box", x, y0 + 0.4, z, 0.42, 0.05, 0.08, color, { idle: IDLE_KIND.spin, hd: false });
  b.add("cone", x + 0.22, y0 + 0.4, z, 0.08, 0.1, 0.08, color, { rz: -Math.PI / 2, idle: IDLE_KIND.spin, pivot: [x, z], hd: false });
  const turn = hd("iron", { idle: IDLE_KIND.spin, pivot: [x, z], phase: seedPhase(b, x, z) });
  b.add("box", x, y0 + 0.41, z, 0.46, 0.03, 0.03, color, turn);
  b.add("cone", x + 0.28, y0 + 0.37, z, 0.06, 0.1, 0.1, color, { ...turn, rz: -Math.PI / 2 });
  b.add("box", x - 0.21, y0 + 0.36, z, 0.12, 0.13, 0.015, color, turn);
  b.add("box", x, y0 + 0.24, z, 0.34, 0.025, 0.025, color, hd("iron"));
  b.add("box", x, y0 + 0.24, z, 0.025, 0.025, 0.34, color, hd("iron"));
  b.add("sphere", x, y0 + 0.45, z, 0.07, 0.07, 0.07, color, hd("iron"));
}

/**
 * Birds circling high over a structure (the epic tier's orbiting bits). HD: each a body with its head, beak, tail and
 * two wings held out in a glide, facing the way it flies
 */
export function circling(b: Builder, x: number, z: number, y: number, r: number, n = 4, color = "#f8fafc") {
  const dark = color.toLowerCase() < "#80";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const py = y + (i % 2) * 0.35;
    b.add("octa", px, py, pz, 0.34, 0.08, 0.16, color, { idle: IDLE_KIND.spin, pivot: [x, z], phase: 0.01 + a, hd: false });
    // The spin carries the orbit clockwise seen from above: the bird faces down its path
    const turn = Math.PI - a;
    const bird = b.child(px, pz, turn, py);
    const [dx, dz] = [x - px, z - pz];
    const pivot: [number, number] = [dx * Math.cos(turn) - dz * Math.sin(turn), dx * Math.sin(turn) + dz * Math.cos(turn)];
    const o = hd("fur", { idle: IDLE_KIND.spin, pivot, phase: 0.01 + a });
    bird.add("pod", 0, 0, 0, 0.08, 0.08, 0.22, color, o);
    bird.add("sphere", 0, 0.03, 0.12, 0.07, 0.07, 0.07, color, o);
    bird.add("cone", 0, 0.035, 0.18, 0.025, 0.06, 0.025, dark ? "#3f3f46" : "#f59e0b", { ...o, mat: "bone", rx: Math.PI / 2 });
    bird.add("box", 0, 0.01, -0.13, 0.09, 0.015, 0.1, color, o);
    for (const s of [-1, 1]) bird.add("box", s * 0.12, 0.01, 0, 0.19, 0.015, 0.09, color, { ...o, rz: s * 0.22 });
  }
}

/** Glowing motes, wisps or shards orbiting a point (the epic tier's orbiting bits, for magical civilizations) */
export function motes(b: Builder, x: number, z: number, y: number, r: number, n: number, color: string, size = 0.16) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.add("octa", x + Math.cos(a) * r, y + (i % 2) * 0.4, z + Math.sin(a) * r, size, size * 1.5, size, color, { glow: true, idle: IDLE_KIND.spin, pivot: [x, z], phase: 0.01 + a });
  }
}

/** A hay bale lying on its side: its centre at its radius, so y0 = s/2 - h/2 = 0 (h = s). HD: straw, two bands of twine */
export function bale(b: Builder, color: string, x: number, z: number, s = 0.45) {
  b.add("cyl", x, 0, z, s, s, s, color, { rz: Math.PI / 2, mat: "fur" });
  for (const k of [-0.22, 0.22]) b.add("cyl", x + k * s, s / 2 - 0.02, z, s + 0.1, 0.04, s + 0.1, "#8b6b3a", hd("cloth", { rz: Math.PI / 2 }));
}

/** A lamp post with a lit lantern. HD: a foot, and a frame of `mat` round the lantern */
export function lampPost(b: Builder, x: number, z: number, h = 1.3, post = IRON, light = "#fcd34d", mat: Surface = "iron") {
  b.add("box", x, 0, z, 0.1, h, 0.1, post, { mat });
  b.add("box", x, h, z, 0.22, 0.26, 0.22, light, { glow: true });
  b.add("box", x, 0, z, 0.2, 0.14, 0.2, post, hd(mat));
  lanternFrame(b.add.bind(b), x, h, z, 0.22, 0.26, post, { mat });
}

/** A banner streaming from a pole (the rare tier's looping effect). HD: a crossbar it hangs from and a finial */
export function pennant(b: Builder, x: number, y0: number, z: number, h: number, pole: string, cloth: string, poleMat: Surface = "wood") {
  b.add("cyl", x, y0, z, 0.05, h, 0.05, pole, { mat: poleMat });
  b.add("box", x + 0.27, y0 + h - 0.42, z, 0.5, 0.36, 0.03, cloth, { idle: IDLE_KIND.flutter, mat: "cloth" });
  b.add("box", x + 0.27, y0 + h - 0.06, z, 0.56, 0.03, 0.03, pole, hd(poleMat));
  b.add("sphere", x, y0 + h, z, 0.1, 0.1, 0.1, pole, hd(poleMat));
}
