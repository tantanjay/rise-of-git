import * as THREE from "three";
import { CivilizationType } from "@/types";
import { Builder, IDLE_KIND, Shape, emptyScene, hdLo } from "@/components/3d/city/parts";
import { HD_LO_SHAPES } from "@/components/3d/city/shapeKit";
import { Add, AddOpts, V3, along, arc, lanternFrame, skull } from "./kitParts";
import { bird, dwarfFace, rune } from "./landmarks";
import type { CastleAnim, CastlePart } from "./castleParts";

/*
 * The HD versions of the world-map castles (the model kit, drawn by `WorldCastles` in HD): per civilization, detail
 * parts merged into the castle's batches, climbing the rarity ladder with its stages. Keep (common): dressed stone,
 * timber, slate and dull iron, nothing lit. Castle (uncommon): the civilization's accent in real cloth, a few finer props.
 * Citadel (rare): real metal fittings and trim. Palace (epic): the richest detail, glowing parts, cloth that streams.
 * A detail that a higher stage replaces with a finer one ends at `maxStage`.
 */

export interface HdOpts {
  minStage?: number;
  maxStage?: number;
  /** Rides this animation (its parts are placed in the anim's pivot frame) */
  anim?: CastleAnim;
  /** Casts a shadow (default true; never while it moves) */
  shadow?: boolean;
  /** Dressed-stone courses or roof tiles on every part of the call */
  courses?: CastlePart["courses"];
  /** Below 1: see-through (smoke) */
  opacity?: number;
  /** Cloth hangs from its top (a banner on a wall) instead of streaming from a pole */
  hang?: boolean;
  /** Parts with `idle: spin` turn round the upright axis through their pivot this many radians a second (default 0.5) */
  turn?: number;
  /** …bobbing up and down this far as they go */
  bob?: number;
}

/** Glowing kit parts shine this bright */
const KIT_GLOW = 1.4;
const _hq = new THREE.Quaternion();
const _he = new THREE.Euler(0, 0, 0, "YXZ");

/** Shapes whose Normal geometry is lighter than their light HD twin (a tiny part takes it) */
const PLAIN_WHEN_TINY = new Set<Shape>(["box", "block", "cyl", "cone", "sphere"]);

/**
 * Which geometry a detail part takes: 0 its full HD twin, 1 its lighter twin, 3 the Normal shape (a box or block for
 * anything small, a plain cylinder, cone or sphere for anything tiny). A castle is seen far smaller than a creature in
 * the Codex, and every castle on the map draws all its stages' parts, so its detail is kept light.
 */
function twinOf(shape: Shape, p: { w: number; h: number; d: number }): number {
  const [a, b] = [p.w, p.h, p.d].sort((x, y) => x - y);
  const small = b < 0.3 || a < 0.08;
  const tiny = b < 0.15 || a < 0.04;
  if ((shape === "box" || shape === "block") && small) return 3;
  if (tiny && PLAIN_WHEN_TINY.has(shape)) return 3;
  return small && (HD_LO_SHAPES.has(shape) || hdLo(shape, p)) ? 1 : 0;
}

/**
 * HD-only castle parts built with the Builder kit (`along`, `arc`, lantern frames…) in the castle's frame (or its anim
 * pivot's): each becomes a castle part drawn with its kit shape, material and glow, from `minStage` to `maxStage`.
 * A part with `idle: flutter` ripples like cloth from its pole (`pivot`); `idle: smoke` rises as a puff (a glowing one as a
 * spark); `idle: spin` turns round the upright axis through its pivot (`turn`, `bob`); `idle: pulse` glows and fades.
 */
export function hdParts(o: HdOpts, build: (b: Builder) => void): CastlePart[] {
  const out = emptyScene();
  build(new Builder(out));
  return [...out.parts, ...out.detail].map((p): CastlePart => {
    const shape = p.hdShape ?? p.shape;
    _hq.setFromEuler(_he.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0));
    const idle = p.idle;
    const wave: CastlePart["wave"] =
      idle?.kind === IDLE_KIND.flutter
        ? {
            kind: "flutter",
            // A hanging banner moves about its top edge
            at: [idle.x, o.hang ? p.y + p.h / 2 : idle.y, idle.z],
            n: new THREE.Vector3(0, 0, 1).applyQuaternion(_hq).toArray() as V3,
            phase: idle.phase
          }
        : idle?.kind === IDLE_KIND.smoke
          ? { kind: "smoke", at: [idle.x, idle.y, idle.z], phase: idle.phase }
          : idle?.kind === IDLE_KIND.spin
            ? // Every part of one call turns together (a ring stays whole)
              { kind: "turn", at: [idle.x, idle.y, idle.z], phase: 0, speed: o.turn ?? 0.5, bob: o.bob ?? 0 }
            : idle?.kind === IDLE_KIND.pulse
              ? { kind: "pulse", at: [idle.x, idle.y, idle.z], phase: idle.phase }
              : undefined;
    return {
      // Smoke keeps the soft faceted puff of the Normal kit (a smooth ball reads as a stone in the air)
      geo: `kit:${shape},${wave?.kind === "smoke" ? 2 : twinOf(shape, p)}`,
      color: p.color,
      pos: [p.x, p.y, p.z],
      size: [p.w, p.h, p.d],
      quat: [_hq.x, _hq.y, _hq.z, _hq.w],
      surf: p.mat ?? "plain",
      mat: p.glow || o.opacity ? { ...(p.glow && { emissive: p.color, emissiveIntensity: KIT_GLOW }), ...(o.opacity && { opacity: o.opacity }) } : undefined,
      // A pulsing glow stands still, so it may cast a shadow
      shadow: (o.shadow ?? true) && (!wave || wave.kind === "pulse") && !o.opacity,
      anim: o.anim,
      minStage: o.minStage,
      maxStage: o.maxStage,
      hd: true,
      ...(o.courses && { courses: o.courses }),
      ...(wave && { wave })
    };
  });
}

/* --------------------------------- Kit --------------------------------- */

/** Adds a part by its centre (the Builder adds by its foot) */
const centred =
  (b: Builder): Add =>
  (shape, x, y, z, w, h, d, color, o = {}) =>
    b.add(shape, x, y - h / 2, z, w, h, d, color, o);

const DULL = "#5b5f66";
const IRON = "#3a3e45";
const GOLD = "#e9b949";
const WOOD = "#5b3a1e";
const DARK_WOOD = "#3b2615";
const SLIT = "#151821";
const LAMP = "#fde68a";

/** Merlons standing on a rectangle's top edge (outer half-widths hx × hz) at height y0, `n` per side */
function merlonsRect(b: Builder, hx: number, hz: number, y0: number, n: number, size: number, h: number, color: string, o: AddOpts = {}) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -1 + (2 * i) / (n - 1);
    for (const s of [-1, 1]) {
      b.add("box", t * (hx - size / 2), y0, s * (hz - size / 2), size, h, size, color, o);
      if (i > 0 && i < n - 1) b.add("box", s * (hx - size / 2), y0, t * (hz - size / 2), size, h, size, color, o);
    }
  }
}

/** Merlons round a round tower's top (radius r, outer edge) at height y0 */
function merlonsRound(b: Builder, x: number, z: number, r: number, y0: number, n: number, size: number, h: number, color: string, o: AddOpts = {}) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.add("box", x + Math.sin(a) * (r - size / 2), y0, z + Math.cos(a) * (r - size / 2), size, h, size * 0.8, color, { ...o, ry: a });
  }
}

/** A dark arrow slit on a round tower's face, `r` out from its axis at angle `a` (0 faces +z) */
function slit(b: Builder, x: number, z: number, r: number, a: number, y0: number, h = 0.18) {
  b.add("box", x + Math.sin(a) * r, y0, z + Math.cos(a) * r, 0.045, h, 0.05, SLIT, { ry: a, mat: "stone" });
}

/** A ring round a tower (cornice, band, collar): `r` its radius, standing from y0 */
function ring(b: Builder, x: number, z: number, r: number, y0: number, h: number, color: string, o: AddOpts = {}) {
  b.add("cyl", x, y0, z, r * 2, h, r * 2, color, o);
}

/** Cloth streaming from a pole at (px, pz): `w` long along the builder's +x, its top at `top` */
function pennant(b: Builder, px: number, pz: number, top: number, w: number, h: number, color: string, ry = 0, o: AddOpts = {}) {
  const [dx, dz] = [Math.cos(ry), -Math.sin(ry)];
  b.add("box", px + (dx * w) / 2 + dx * 0.02, top - h, pz + (dz * w) / 2 + dz * 0.02, w, h, 0.025, color, { ...o, ry, mat: "cloth", idle: IDLE_KIND.flutter, pivot: [px, pz] });
}

/** A round-headed door on a face looking along +z at `z` (its foot at y0): planks, an arch of voussoirs */
function archedDoor(b: Builder, x: number, y0: number, z: number, w: number, h: number, stone: string, door = WOOD, bands = DULL, bandMat: AddOpts["mat"] = "dull") {
  const c = centred(b);
      const add = b.add.bind(b);
  const r = w / 2;
  b.add("box", x, y0, z, w, h - r, 0.06, door, { mat: "wood" });
  c("cyl", x, y0 + h - r, z, w, 0.06, w, door, { rx: Math.PI / 2, mat: "wood" });
  for (const y of [0.3, 0.68]) b.add("box", x, y0 + (h - r) * y, z + 0.065, w * 0.92, 0.025, 0.03, bands, { mat: bandMat });
  arc(add, [x, y0 + h - r, z + 0.01], [1, 0, 0], [0, 1, 0], r + 0.045, 0, Math.PI, 5, 0.065, stone, { mat: "plain" }, "box");
}

/** Wide steps down from a terrace at height `top`, in front of z0 (they run toward +z) */
function steps(b: Builder, x: number, z0: number, top: number, w: number, n: number, color: string) {
  for (let i = 0; i < n; i++) {
    const h = (top * (n - i)) / (n + 0.4);
    b.add("box", x, 0, z0 + 0.07 + i * 0.13, w, h, 0.14, color, { mat: "plain" });
  }
}

/** A small lantern hung from a bracket on a wall facing +z (unlit, or lit from the Citadel on) */
function wallLantern(b: Builder, x: number, y: number, z: number, iron: string, mat: AddOpts["mat"], lit: boolean) {
  b.add("box", x, y + 0.13, z + 0.04, 0.02, 0.02, 0.09, iron, { mat });
  b.add("box", x, y + 0.01, z + 0.08, 0.04, 0.07, 0.04, lit ? LAMP : "#44403c", { glow: lit, mat: "plain" });
  lanternFrame(b.add.bind(b), x, y, z + 0.08, 0.06, 0.09, iron, { mat });
}

/** A barrel standing on the ground: staves and two hoops */
function barrel(b: Builder, x: number, z: number, hoop: string, hoopMat: AddOpts["mat"]) {
  b.add("cyl", x, 0, z, 0.16, 0.2, 0.16, "#7c5a3a", { mat: "wood" });
  for (const y of [0.04, 0.14]) b.add("cyl", x, y, z, 0.172, 0.025, 0.172, hoop, { mat: hoopMat });
}

/* ------------------------------- Valoria -------------------------------- */

const H_WHITE = "#f8fafc";
const H_PALE = "#e2e8f0";
const H_BLUE = "#1d4ed8";
const H_CORNERS: Array<[number, number, number]> = [
  [-1.2, 1.2, 0],
  [1.2, 1.2, 0],
  [-1.2, -1.2, 1],
  [1.2, -1.2, 1]
];

function humanHd(): CastlePart[] {
  const out: CastlePart[] = [];
  // Keep (common): a battered plinth, a parapet round the keep, a hipped slate roof inside it, a door up a flight of
  // steps, arrow slits and corbelled cornices on the towers, a timber cottage with its chimney smoking, barrels
  out.push(
    ...hdParts({ courses: "masonry" }, (b) => {
      b.add("box", 0, -0.02, 0, 2.94, 0.24, 2.94, "#55606e", { mat: "plain" }); // plinth under the foundation
      b.add("box", 0, 1.62, 0, 1.8, 0.07, 1.8, H_PALE, { mat: "plain" }); // string course under the parapet
    }),
    ...hdParts({}, (b) => {
      merlonsRect(b, 0.86, 0.86, 1.75, 6, 0.15, 0.15, H_WHITE);
      archedDoor(b, 0, 0.7, 0.87, 0.3, 0.4, H_PALE);
      steps(b, 0, 1.4, 0.68, 0.56, 3, H_PALE);
      for (const [x, z] of H_CORNERS) {
        const a = Math.atan2(x, z);
        slit(b, x, z, 0.3, a, 0.82);
        slit(b, x, z, 0.29, a + 1.2, 0.9);
      }
      // The cottage: a gable roof, its door and window, a chimney and corner posts
      b.add("prism", 1.6, 0.57, 1.2, 0.74, 0.32, 0.62, "#7c2d12", { mat: "wood" });
      b.add("box", 1.925, 0.2, 1.22, 0.05, 0.24, 0.14, DARK_WOOD, { mat: "wood" });
      b.add("box", 1.74, 0.36, 1.475, 0.12, 0.1, 0.05, "#273244", { mat: "plain" });
      for (const z of [0.95, 1.45]) b.add("box", 1.91, 0.2, z, 0.04, 0.4, 0.04, DARK_WOOD, { mat: "wood" });
      b.add("box", 1.78, 0.6, 1.0, 0.1, 0.3, 0.1, "#78716c", { mat: "stone" });
      barrel(b, 2.02, 1.62, DULL, "dull");
      barrel(b, 2.2, 1.45, DULL, "dull");
    }),
    ...hdParts({ courses: "tiles" }, (b) => b.add("pyramid", 0, 1.72, 0, 1.44, 0.92, 1.44, H_BLUE, { mat: "plain" })),
    // Smoke from the cottage chimney
    ...hdParts({}, (b) => {
      for (let k = 0; k < 3; k++) b.add("sphere", 1.78, 0.9, 1.0, 0.11, 0.1, 0.11, "#cbd5e1", { idle: IDLE_KIND.smoke, phase: 0.01 + (k * Math.PI * 2) / 3 });
    })
  );
  // Corbelled cornices and finials on each corner tower (the back pair rise with the Castle)
  for (const [x, z, st] of H_CORNERS) {
    out.push(
      ...hdParts({ minStage: st }, (b) => ring(b, x, z, 0.335, 1.17, 0.07, H_PALE)),
      ...hdParts({ minStage: st, maxStage: 3 }, (b) => b.add("sphere", x, 1.72, z, 0.07, 0.07, 0.07, DULL, { mat: "dull" }))
    );
  }
  // Castle (uncommon): the royal flag of blue cloth with a pale cross, banners on the keep, lanterns at the door
  out.push(
    ...hdParts({ minStage: 1 }, (b) => {
      pennant(b, 1.1, -1.1, 3.05, 0.9, 0.5, H_BLUE);
      b.add("box", 1.55, 2.6, -1.1, 0.07, 0.4, 0.09, "#fde68a", { mat: "cloth", idle: IDLE_KIND.flutter, pivot: [1.1, -1.1] });
      b.add("box", 1.55, 2.79, -1.1, 0.5, 0.07, 0.09, "#fde68a", { mat: "cloth", idle: IDLE_KIND.flutter, pivot: [1.1, -1.1] });
    }),
    ...hdParts({ minStage: 1, maxStage: 1 }, (b) => b.add("sphere", 1.1, 3.2, -1.1, 0.07, 0.07, 0.07, DULL, { mat: "dull" })),
    ...hdParts({ minStage: 1, hang: true }, (b) => {
      for (const x of [-0.6, 0.6]) {
        b.add("box", x, 1.18, 0.89, 0.2, 0.42, 0.025, H_BLUE, { mat: "cloth", idle: IDLE_KIND.flutter, pivot: [x, 0.89] });
        b.add("box", x, 1.13, 0.89, 0.2, 0.06, 0.03, "#fde68a", { mat: "cloth", idle: IDLE_KIND.flutter, pivot: [x, 0.89] });
      }
    }),
    ...hdParts({ minStage: 1, maxStage: 1 }, (b) => {
      for (const x of [-0.26, 0.26]) wallLantern(b, x, 0.9, 0.85, DULL, "dull", false);
    })
  );
  // Citadel (rare): arched windows lit behind stone sills, iron fittings and gilt finials, gold bands on the roofs,
  // a clock face on the bell tower
  out.push(
    ...hdParts({ minStage: 2 }, (b) => {
      const c = centred(b);
      const add = b.add.bind(b);
      for (const x of [-0.3, 0, 0.3]) {
        b.add("box", x, 1.12, 0.87, 0.16, 0.18, 0.05, LAMP, { glow: true });
        c("cyl", x, 1.3, 0.87, 0.16, 0.05, 0.16, LAMP, { glow: true, rx: Math.PI / 2 });
        b.add("box", x, 1.08, 0.885, 0.22, 0.04, 0.07, H_PALE);
        arc(add, [x, 1.3, 0.885], [1, 0, 0], [0, 1, 0], 0.1, 0, Math.PI, 4, 0.04, H_PALE, { mat: "plain" }, "box");
      }
      for (const s of [-1, 1])
        for (const z of [-0.3, 0.3]) {
          b.add("box", s * 0.87, 1.14, z, 0.05, 0.2, 0.14, LAMP, { glow: true });
          b.add("box", s * 0.885, 1.1, z, 0.07, 0.04, 0.2, H_PALE);
        }
      for (const x of [-0.26, 0.26]) wallLantern(b, x, 0.9, 0.85, IRON, "iron", true);
      for (const [x, z] of H_CORNERS) ring(b, x, z, 0.415, 1.23, 0.04, GOLD, { mat: "gold" });
      b.add("sphere", 1.1, 3.2, -1.1, 0.08, 0.08, 0.08, GOLD, { mat: "gold" });
      b.add("sphere", 0, 2.6, 0, 0.09, 0.09, 0.09, GOLD, { mat: "gold" });
      // Bell tower: a gold band under its roof and a clock face
      ring(b, 0.4, 0.4, 0.23, 2.5, 0.05, GOLD, { mat: "gold" });
      c("cyl", 0.4, 2.3, 0.64, 0.16, 0.03, 0.16, "#fef3c7", { rx: Math.PI / 2, mat: "plain" });
      c("cyl", 0.4, 2.3, 0.66, 0.18, 0.02, 0.18, GOLD, { rx: Math.PI / 2, mat: "gold" });
      along(add, "box", [0.4, 2.3, 0.675], [0.4, 2.36, 0.675], 0.012, 0.012, "#1f2937");
      along(add, "box", [0.4, 2.3, 0.675], [0.445, 2.3, 0.675], 0.012, 0.012, "#1f2937");
      // Iron bands and studs on the door
      for (const y of [0.82, 0.96]) b.add("box", 0, y, 0.91, 0.28, 0.025, 0.03, IRON, { mat: "iron" });
    }),
    ...hdParts({ minStage: 2, maxStage: 3 }, (b) => {
      for (const [x, z] of H_CORNERS) b.add("sphere", x, 1.72, z, 0.08, 0.08, 0.08, GOLD, { mat: "gold" });
    })
  );
  // Palace (epic): lancet windows glowing up the spire, gold bands and a pennant streaming from its tip; pennants on
  // every tower; doves with wings in place of the flat ones; the windmill's sails as lattice with cloth, a door and window
  out.push(
    ...hdParts({ minStage: 3 }, (b) => {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
        for (const y of [2.55, 3.15]) b.add("box", Math.sin(a) * 0.33, y, Math.cos(a) * 0.33, 0.07, 0.3, 0.05, LAMP, { glow: true, ry: a });
      }
      for (const y of [2.35, 2.95, 3.55]) ring(b, 0, 0, 0.36 - (y - 2.35) * 0.05, y, 0.05, GOLD, { mat: "gold" });
      b.add("cyl", 0, 4.55, 0, 0.03, 0.55, 0.03, GOLD, { mat: "gold" });
      b.add("sphere", 0, 4.55, 0, 0.1, 0.1, 0.1, GOLD, { mat: "gold" });
      pennant(b, 0, 0, 5.08, 0.7, 0.16, H_BLUE);
      // The windmill: door, window and a cap on its roof
      b.add("box", -2.0, 0.2, 1.2, 0.06, 0.26, 0.15, DARK_WOOD, { mat: "wood", ry: 0 });
      b.add("box", -1.7, 0.72, 0.9, 0.1, 0.12, 0.05, LAMP, { glow: true });
      b.add("sphere", -1.7, 1.38, 1.2, 0.06, 0.06, 0.06, GOLD, { mat: "gold" });
    }),
    ...hdParts({ minStage: 3, maxStage: 3 }, (b) => {
      for (const [x, z] of H_CORNERS) {
        b.add("cyl", x, 1.76, z, 0.02, 0.32, 0.02, GOLD, { mat: "gold" });
        pennant(b, x, z, 2.07, 0.3, 0.1, H_BLUE, x > 0 ? 0 : Math.PI);
      }
    }),
    ...hdParts({ minStage: 3, anim: { kind: "windmill", pivot: [-1.7, 1.0, 1.5] } }, (b) => {
      const c = centred(b);
      c("cyl", 0, 0, 0.02, 0.1, 0.08, 0.1, DARK_WOOD, { rx: Math.PI / 2, mat: "wood" });
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        const [dx, dy] = [Math.cos(a), Math.sin(a)];
        c("box", dx * 0.32, dy * 0.32, 0, 0.035, 0.6, 0.03, "#8b6b45", { rz: a - Math.PI / 2, mat: "wood" });
        c("box", dx * 0.36 - dy * 0.09, dy * 0.36 + dx * 0.09, -0.01, 0.15, 0.46, 0.012, H_WHITE, { rz: a - Math.PI / 2, mat: "cloth" });
      }
    }),
    ...[0, Math.PI].flatMap((a) =>
      hdParts({ minStage: 3, anim: { kind: "orbit", pivot: [0, 3.9, 0] }, shadow: false }, (b) => {
        // The orbit turns them toward −z where they start on +x
        const [x, z] = [Math.cos(a) * 1.3, Math.sin(a) * 1.3];
        const t = new Builder(b.out, x, 0, z, a === 0 ? Math.PI : 0);
        bird(t.add.bind(t), 0, 0, 0, 0.6, "#f8fafc", "#e2e8f0", "#f59e0b", { mat: "plain" });
      })
    )
  );
  return out;
}

/* ------------------------------- Sylvandale ------------------------------- */

const E_SILVER = "#d6d3d1";
const E_LEAF = "#059669";
const E_BARK = "#6b645e";

function elfHd(): CastlePart[] {
  const out: CastlePart[] = [];
  // Keep (common): roots flaring from the silverwood trunk and bark ridges up it, a door under a pointed arch, ferns at
  // its foot, leafy clumps along the canopy's rim, the flowering tree's crown of blossom
  out.push(
    ...hdParts({}, (b) => {
      const add = b.add.bind(b);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.25;
        if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0) continue; // keep the door clear
        along(add, "taper", [Math.sin(a) * 1.4, 0.42, Math.cos(a) * 1.4], [Math.sin(a) * 1.95, -0.02, Math.cos(a) * 1.95], 0.26, 0.2, E_BARK, { mat: "wood" });
      }
      b.add("box", 0, 0.15, 1.54, 0.32, 0.36, 0.06, DARK_WOOD, { mat: "wood" });
      along(add, "capsule", [-0.19, 0.5, 1.58], [0.0, 0.74, 1.58], 0.05, 0.05, E_SILVER, { mat: "plain" });
      along(add, "capsule", [0.19, 0.5, 1.58], [0.0, 0.74, 1.58], 0.05, 0.05, E_SILVER, { mat: "plain" });
      for (const s of [-1, 1]) b.add("box", s * 0.19, 0.15, 1.57, 0.05, 0.36, 0.05, E_SILVER, { mat: "plain" });
      // Bark ridges running up the trunk (clear of the door)
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + 0.17;
        if (Math.abs(Math.sin(a)) < 0.2 && Math.cos(a) > 0) continue;
        along(add, "box", [Math.sin(a) * 1.6, 0.17, Math.cos(a) * 1.6], [Math.sin(a) * 1.31, 0.93, Math.cos(a) * 1.31], 0.09, 0.07, "#57534e", { mat: "wood" });
      }
      // Leafy clumps between the spires along the canopy's rim, and ferns round the trunk
      // Leafy clumps all along the canopy's rim (clear of the spires), so it reads as foliage, not a cone
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + 0.17;
        if (Math.cos(3 * a) > 0.3) continue;
        const r = 1.42 + (k % 2) * 0.1;
        b.add("canopy", Math.cos(a) * r, 1.05 + (k % 3) * 0.04, Math.sin(a) * r, 0.62, 0.36, 0.62, k % 2 ? "#047857" : "#059669", { mat: "leaf", ry: a });
      }
      for (const [x, z] of [[1.0, 1.4], [-1.3, 1.1], [1.6, 0.2], [-0.6, -1.7]]) b.add("canopy", x, 0, z, 0.42, 0.24, 0.42, "#15803d", { mat: "leaf" });
      // The flowering tree: roots and a crown of blossom in place of the ball
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        along(add, "taper", [1.6 + Math.sin(a) * 0.07, 0.3, -0.9 + Math.cos(a) * 0.07], [1.6 + Math.sin(a) * 0.25, -0.02, -0.9 + Math.cos(a) * 0.25], 0.08, 0.07, "#78350f", { mat: "wood" });
      }
      b.add("canopy", 1.6, 0.72, -0.9, 1.0, 0.82, 1.0, "#f472b6", { mat: "leaf" });
      b.add("canopy", 1.45, 1.2, -0.8, 0.55, 0.42, 0.55, "#f9a8d4", { mat: "leaf" });
    })
  );
  // Castle (uncommon): emerald pennants hanging from the canopy, silver lanterns (unlit) by the door, stones and lily
  // pads round the moonwell, the upper trunk's bark, vines hanging from the canopy
  out.push(
    ...hdParts({ minStage: 1, hang: true }, (b) => {
      for (const a of [0.55, -0.55, Math.PI - 0.5]) {
        const [x, z] = [Math.sin(a) * 1.5, Math.cos(a) * 1.5];
        b.add("box", x, 0.68, z, 0.16, 0.5, 0.025, E_LEAF, { mat: "cloth", ry: a, idle: IDLE_KIND.flutter, pivot: [x, z] });
        b.add("box", x, 0.62, z, 0.16, 0.06, 0.03, E_SILVER, { mat: "cloth", ry: a, idle: IDLE_KIND.flutter, pivot: [x, z] });
      }
    }),
    ...hdParts({ minStage: 1 }, (b) => {
      const c = centred(b);
      const add = b.add.bind(b);
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        b.add("boulder", -1.7 + Math.sin(a) * 0.6, 0.1, 0.8 + Math.cos(a) * 0.6, 0.16, 0.12, 0.14, "#e7e5e4", { mat: "plain", ry: a });
      }
      for (const [x, z] of [[-1.85, 0.7], [-1.55, 0.95]]) c("cyl", x, 0.35, z, 0.16, 0.012, 0.16, "#16a34a", { mat: "leaf" });
      b.add("sphere", -1.85, 0.355, 0.7, 0.06, 0.05, 0.06, "#fbcfe8", { mat: "plain" });
    }),
    ...hdParts({ minStage: 1, maxStage: 1 }, (b) => {
      for (const x of [-0.32, 0.32]) wallLantern(b, x, 0.42, 1.5, "#9ca3af", "dull", false);
    }),
    // The upper trunk's bark, and vines hanging from the canopy's rim with leaves along them
    ...hdParts({ minStage: 1 }, (b) => {
      const add = b.add.bind(b);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + 0.3;
        along(add, "box", [Math.sin(a) * 1.12, 0.85, Math.cos(a) * 1.12], [Math.sin(a) * 0.68, 2.18, Math.cos(a) * 0.68], 0.08, 0.06, "#78716c", { mat: "wood" });
      }
      // Leafy clumps round the upper canopy's rim
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        b.add("canopy", Math.cos(a) * 1.0, 2.18 + (k % 2) * 0.04, Math.sin(a) * 1.0, 0.48, 0.3, 0.48, k % 2 ? "#10b981" : "#059669", { mat: "leaf", ry: a });
      }
      // Vines hanging from the canopy's rim, leaves along them
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.9;
        const len = 0.32 + (k % 3) * 0.1;
        along(add, "capsule", [Math.sin(a) * 1.56, 1.22, Math.cos(a) * 1.56], [Math.sin(a) * 1.6, 1.22 - len, Math.cos(a) * 1.6], 0.025, 0.025, "#166534", { mat: "leaf" });
        for (const f of [0.35, 0.7, 1]) b.add("octa", Math.sin(a) * 1.6, 1.2 - len * f, Math.cos(a) * 1.6, 0.1, 0.12, 0.04, "#16a34a", { mat: "leaf", ry: a });
      }
    })
  );
  // Citadel (rare): silver bands and filigree on the spires, silver lanterns lit at the door, a silver moonwell rim, round
  // windows lit in the trunks
  out.push(
    ...hdParts({ minStage: 2, maxStage: 3 }, (b) => {
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * Math.PI) / 3;
        ring(b, Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0.36, 1.18, 0.04, "#e5e7eb", { mat: "steel" });
      }
    }),
    ...hdParts({ minStage: 2 }, (b) => {
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * Math.PI) / 3;
        const [x, z] = [Math.cos(a) * 1.35, Math.sin(a) * 1.35];
        for (const y of [0.35, 0.95]) ring(b, x, z, 0.24 - y * 0.05, y, 0.04, "#e5e7eb", { mat: "steel" });
        b.add("box", x + Math.sin(a + Math.PI / 2) * 0.0, 0.55, z, 0.04, 0.3, 0.04, "#e5e7eb", { mat: "steel", ry: a });
      }
      for (const x of [-0.32, 0.32]) wallLantern(b, x, 0.42, 1.5, "#e5e7eb", "steel", true);
      arc(b.add.bind(b), [-1.7, 0.335, 0.8], [1, 0, 0], [0, 0, 1], 0.58, 0, Math.PI * 2, 16, 0.045, "#e5e7eb", { mat: "steel" }, "box");
      // Round windows lit in both trunks, each in a silver ring
      for (const [a, y, r] of [[1.35, 0.6, 1.45], [3.6, 0.6, 1.45], [4.9, 0.6, 1.45], [0.5, 1.9, 0.76], [2.6, 1.9, 0.76], [4.7, 1.9, 0.76]]) {
        const t = new Builder(b.out, Math.sin(a) * r, 0, Math.cos(a) * r, a);
        const tc = centred(t);
        tc("cyl", 0, y, 0.02, 0.17, 0.05, 0.17, "#cffafe", { rx: Math.PI / 2, glow: true });
        tc("cyl", 0, y, 0.0, 0.23, 0.05, 0.23, "#e5e7eb", { rx: Math.PI / 2, mat: "steel" });
      }
    })
  );
  // Palace (epic): runes glowing round the trunk, motes of light circling with the wisp, petals drifting off the blossom
  out.push(
    ...hdParts({ minStage: 3 }, (b) => {
      // Runes glowing round the trunk under the canopy, between its windows
      for (const [k, a] of [0.95, 2.05, 3.05, 4.25, 5.45].entries()) {
        const t = new Builder(b.out, Math.sin(a) * 1.47, 0, Math.cos(a) * 1.47, a);
        rune(t.add.bind(t), k, 0, 0.55, 0.0, 0.32, "#67e8f9");
      }
      for (let k = 0; k < 4; k++) b.add("octa", 1.6 + (k - 1.5) * 0.25, 0.25 + k * 0.12, -0.6 + (k % 2) * 0.3, 0.07, 0.03, 0.07, "#fbcfe8", { mat: "leaf", idle: IDLE_KIND.smoke, phase: 0.01 + k * 1.6 });
    }),
    ...hdParts({ minStage: 3, anim: { kind: "orbit", pivot: [0, 2.2, 0] }, shadow: false }, (b) => {
      for (const [x, y, z] of [[-1.6, 0.2, 0], [0, -0.25, 1.6], [0, 0.3, -1.6]] as V3[]) b.add("sphere", x, y, z, 0.07, 0.07, 0.07, "#e0f2fe", { glow: true });
    })
  );
  return out;
}

/* ------------------------------- Ironforge ------------------------------- */

const D_BRASS = "#b08d57";
const D_COPPER = "#b45309";

function dwarfHd(): CastlePart[] {
  const out: CastlePart[] = [];
  // Keep (common): buttresses at the bastion's corners, a stone gate with a heavy lintel up broad steps, a plinth, an ore
  // cart on wheels with lumps of ore, a copper roof of sheets
  out.push(
    ...hdParts({ courses: "masonry" }, (b) => {
      b.add("box", 0, -0.02, 0, 3.12, 0.2, 3.12, "#111827", { mat: "plain" });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("block", sx * 0.97, 0.6, sz * 0.97, 0.34, 1.0, 0.34, "#3b4658", { mat: "plain" });
    }),
    ...hdParts({}, (b) => {
      const c = centred(b);
      const add = b.add.bind(b);
      b.add("box", 0, 0.65, 0.97, 0.5, 0.48, 0.06, "#2b2118", { mat: "wood" });
      for (const s of [-1, 1]) b.add("block", s * 0.33, 0.65, 1.0, 0.16, 0.56, 0.14, "#475569", { mat: "stone" });
      b.add("block", 0, 1.17, 1.0, 0.84, 0.16, 0.16, "#475569", { mat: "stone" });
      steps(b, 0, 1.5, 0.63, 0.9, 3, "#475569");
      // The ore cart: plank sides, iron wheels, lumps of ore
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          c("cyl", -1.7 + sx * 0.18, 0.13, 0.5 + sz * 0.19, 0.26, 0.035, 0.26, "#4a3220", { mat: "wood", rx: Math.PI / 2 });
          c("cyl", -1.7 + sx * 0.18, 0.13, 0.5 + sz * 0.215, 0.07, 0.03, 0.07, DULL, { mat: "dull", rx: Math.PI / 2 });
        }
      for (const y of [0.22, 0.38]) b.add("box", -1.7, y, 0.5, 0.6, 0.03, 0.45, DULL, { mat: "dull" });
      for (let k = 0; k < 4; k++) b.add("boulder", -1.82 + k * 0.08, 0.44, 0.45 + (k % 2) * 0.1, 0.12, 0.1, 0.11, k % 2 ? "#78716c" : "#f59e0b", { mat: k % 2 ? "stone" : "gold" });
      // Rails the cart runs on
      for (const dz of [-0.13, 0.13]) b.add("box", -1.7 + 0.0, 0.0, 0.5 + dz, 1.1, 0.03, 0.03, DULL, { mat: "dull", ry: 0 });
    }),
    ...hdParts({ courses: "tiles" }, (b) => b.add("pyramid", 0, 1.62, 0, 1.74, 0.76, 1.74, D_COPPER, { mat: "iron" })),
    // Dull iron bands on the gate, brass from the Citadel on
    ...hdParts({ maxStage: 1 }, (b) => {
      for (const y of [0.77, 0.97]) b.add("box", 0, y, 1.045, 0.48, 0.035, 0.09, DULL, { mat: "dull" });
    })
  );
  // Castle (uncommon): bronze banners hanging either side of the gate, smoke rising from the forge chimneys, iron caps
  out.push(
    ...hdParts({ minStage: 1, hang: true }, (b) => {
      for (const x of [-0.62, 0.62]) {
        b.add("box", x, 0.82, 0.97, 0.26, 0.6, 0.025, D_COPPER, { mat: "cloth", idle: IDLE_KIND.flutter, pivot: [x, 0.97] });
        b.add("box", x, 1.08, 0.975, 0.09, 0.14, 0.035, "#fbbf24", { mat: "cloth", idle: IDLE_KIND.flutter, pivot: [x, 0.97] });
      }
    }),
    ...hdParts({ minStage: 1 }, (b) => {
      for (const x of [-0.6, 0.6]) ring(b, x, -0.6, 0.12, 2.1, 0.05, "#1f2937", { mat: "iron" });
    }),
    ...hdParts({ minStage: 1, opacity: 0.6 }, (b) => {
      for (const x of [-0.6, 0.6]) for (let k = 0; k < 3; k++) b.add("sphere", x, 2.12, -0.6, 0.2, 0.18, 0.2, "#64748b", { idle: IDLE_KIND.smoke, phase: 0.01 + (k * Math.PI * 2) / 3 + x });
    })
  );
  // Citadel (rare): brass bands on the gate and buttresses, a channel of stone round the lava sluice, the gear's teeth
  out.push(
    ...hdParts({ minStage: 2 }, (b) => {
      for (const y of [0.77, 0.97]) b.add("box", 0, y, 1.045, 0.5, 0.04, 0.1, D_BRASS, { mat: "gold" });
      for (const x of [-0.15, 0.15]) b.add("sphere", x, 0.86, 1.1, 0.05, 0.05, 0.05, D_BRASS, { mat: "gold" });
      // The lava sluice runs in a stone channel in front of the steps
      for (const s of [-1, 1]) b.add("block", s * 0.88, 0.0, 2.12, 0.14, 0.14, 0.36, "#475569", { mat: "stone" });
      b.add("box", 0, 0.0, 2.12, 1.62, 0.1, 0.25, "#ea580c", { mat: "lava" });
    }),
    // Brass caps on the buttresses (the Palace's battlements cover them)
    ...hdParts({ minStage: 2, maxStage: 2 }, (b) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("box", sx * 0.97, 1.42, sz * 0.97, 0.44, 0.06, 0.44, D_BRASS, { mat: "gold" });
    }),
    ...hdParts({ minStage: 2, anim: { kind: "windmill", pivot: [0.55, 1.15, 0.98] } }, (b) => {
      const c = centred(b);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        c("box", Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0, 0.07, 0.06, 0.06, D_BRASS, { rz: a, mat: "gold" });
      }
      c("cyl", 0, 0, 0.02, 0.12, 0.06, 0.12, D_BRASS, { rx: Math.PI / 2, mat: "gold" });
    })
  );
  // Palace (epic): a carved guardian's face over the gate with its eyes burning, merlons and corbels on the battlements,
  // runes glowing along them, forge-lit slits in the bastion's sides
  out.push(
    ...hdParts({ minStage: 3 }, (b) => {
      const add = b.add.bind(b);
      // The guardian looks out from the battlements' front, over the gate
      dwarfFace(add, 1.6, 1.1, "#64748b");
      for (const s of [-1, 1]) b.add("sphere", s * 0.06, 1.607, 1.255, 0.036, 0.032, 0.03, "#fb923c", { glow: true });
      merlonsRect(b, 1.2, 1.2, 1.8, 7, 0.2, 0.18, "#475569");
      for (let i = 0; i < 6; i++) {
        const t = -1 + (2 * i) / 5;
        for (const s of [-1, 1]) {
          b.add("block", t * 1.0, 1.3, s * 1.1, 0.12, 0.1, 0.2, "#475569", { mat: "stone" });
          b.add("block", s * 1.1, 1.3, t * 1.0, 0.2, 0.1, 0.12, "#475569", { mat: "stone" });
        }
      }
      for (const [k, x] of [-0.85, -0.45, 0.45, 0.85].entries()) rune(add, k, x, 1.6, 1.21, 0.3, "#fb923c");
      for (const s of [-1, 1]) for (const z of [-0.35, 0.35]) b.add("box", s * 0.96, 0.95, z, 0.05, 0.3, 0.06, "#f97316", { glow: true });
    })
  );
  return out;
}

/* -------------------------------- Drak'mar -------------------------------- */

const O_RED = "#991b1b";
const O_BONE = "#f3ead7";

function orcHd(): CastlePart[] {
  const out: CastlePart[] = [];
  // Keep (common): a hide-roofed war hall with horns at its eaves, a log gate under a skull, sharpened stakes along the
  // front, the tent's poles, flap and ropes, spikes on the barrier, bones in the dirt
  out.push(
    ...hdParts({ courses: "masonry" }, (b) => {
      b.add("box", 0, -0.02, 0, 2.92, 0.2, 2.92, "#111827", { mat: "plain" });
    }),
    ...hdParts({}, (b) => {
      const add = b.add.bind(b);
      b.add("pyramid", 0, 1.78, 0, 1.56, 0.86, 1.56, "#7f1d1d", { mat: "hide" });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) along(add, "horn", [sx * 0.74, 1.82, sz * 0.74], [sx * 1.05, 2.05, sz * 1.05], 0.08, 0.08, O_BONE, { mat: "bone" });
      // Log gate, banded, under a skull
      for (let k = 0; k < 4; k++) b.add("cyl", -0.18 + k * 0.12, 0.75, 0.88, 0.11, 0.5, 0.11, "#4a2f1a", { mat: "wood" });
      // Stakes along the front of the foundation, leaning out
      for (const x of [-1.0, -0.75, -0.5, 0.5, 0.75, 1.0]) {
        along(add, "cyl", [x, 0.6, 1.33], [x, 1.02, 1.5], 0.07, 0.07, "#5b3a1e", { mat: "wood" });
        along(add, "cone", [x, 1.02, 1.5], [x, 1.14, 1.55], 0.07, 0.07, "#a8a29e", { mat: "wood" });
      }
      // The war tent: poles out of its top, a flap, ropes and stakes
      for (const a of [0, 1.3, 2.6]) along(add, "cyl", [-1.7, 0.6, -0.5], [-1.7 + Math.sin(a) * 0.12, 0.98, -0.5 + Math.cos(a) * 0.12], 0.03, 0.03, "#4a2f1a", { mat: "wood" });
      b.add("box", -1.7, 0.02, -0.03, 0.22, 0.32, 0.03, "#3f2a17", { mat: "hide", rx: -0.5 });
      for (const a of [0.8, 2.4, 4.0, 5.5]) along(add, "cyl", [-1.7 + Math.sin(a) * 0.32, 0.38, -0.5 + Math.cos(a) * 0.32], [-1.7 + Math.sin(a) * 0.7, 0.0, -0.5 + Math.cos(a) * 0.7], 0.012, 0.012, "#a8a29e", { mat: "cloth" });
      // Sharpened stakes on the barrier and bones in the dirt
      for (let k = 0; k < 5; k++) {
        const t = -0.5 + k * 0.25;
        const [x, z] = [1.7 + Math.cos(0.4) * t, 0.2 - Math.sin(0.4) * t];
        along(add, "cone", [x, 0.48, z], [x + 0.05, 0.72, z + 0.12], 0.06, 0.06, "#a8a29e", { mat: "wood" });
      }
      along(add, "capsule", [-0.9, 0.04, 1.75], [-0.6, 0.04, 1.85], 0.04, 0.04, O_BONE, { mat: "bone" });
      skull(add, -1.35, 0.08, 1.7, 0.16, O_BONE, 0.7, { mat: "bone" });
    })
  );
  out.push(...hdParts({ maxStage: 3 }, (b) => skull(b.add.bind(b), 0, 1.38, 0.93, 0.22, O_BONE, 0, { mat: "bone" })));
  // Dull iron bands on the gate, iron from the Citadel on
  out.push(...hdParts({ maxStage: 1 }, (b) => {
    for (const y of [0.86, 1.1]) b.add("box", 0, y, 0.95, 0.5, 0.04, 0.03, DULL, { mat: "dull" });
  }));
  // Castle (uncommon): tattered red war banners on the back towers, a war drum by the gate
  out.push(
    ...hdParts({ minStage: 1 }, (b) => {
      for (const x of [-1.2, 1.2]) {
        b.add("cyl", x, 1.6, -1.2, 0.03, 0.7, 0.03, "#4a2f1a", { mat: "wood" });
        pennant(b, x, -1.2, 2.25, 0.42, 0.32, O_RED, x > 0 ? 0 : Math.PI);
        for (const k of [0.1, 0.25, 0.38]) {
          const sx = x > 0 ? 1 : -1;
          b.add("box", x + sx * (0.02 + k), 1.84, -1.2, 0.08, 0.1, 0.025, O_RED, { mat: "cloth", ry: x > 0 ? 0 : Math.PI, idle: IDLE_KIND.flutter, pivot: [x, -1.2] });
        }
      }
      b.add("cyl", 0.62, 0.75, 1.15, 0.3, 0.26, 0.3, "#7c2d12", { mat: "wood" });
      b.add("cyl", 0.62, 1.0, 1.15, 0.32, 0.06, 0.32, "#d6c4a8", { mat: "hide" });
    })
  );
  // Citadel (rare): iron spikes on the towers, iron bands on the gate, the braziers on legs with coals, the skull totem a
  // real skull
  out.push(
    ...hdParts({ minStage: 2 }, (b) => {
      const add = b.add.bind(b);
      for (const [x, z] of [[-1.2, 1.2], [1.2, 1.2], [-1.2, -1.2], [1.2, -1.2]]) {
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          along(add, "cone", [x + Math.sin(a) * 0.27, 1.05, z + Math.cos(a) * 0.27], [x + Math.sin(a) * 0.48, 1.12, z + Math.cos(a) * 0.48], 0.05, 0.05, IRON, { mat: "iron" });
        }
      }
      for (const y of [0.86, 1.1]) b.add("box", 0, y, 0.96, 0.52, 0.05, 0.04, IRON, { mat: "iron" });
      for (const x of [-0.8, 0.8]) {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          along(add, "cyl", [x + Math.sin(a) * 0.07, 0.36, 1.5 + Math.cos(a) * 0.07], [x + Math.sin(a) * 0.16, 0.0, 1.5 + Math.cos(a) * 0.16], 0.025, 0.025, IRON, { mat: "iron" });
        }
        for (let k = 0; k < 4; k++) b.add("cone", x + (k - 1.5) * 0.04, 0.66, 1.5 + (k % 2 ? 0.03 : -0.03), 0.09, 0.22 - k * 0.02, 0.09, k % 2 ? "#fbbf24" : "#f97316", { glow: true });
      }
    }),
    ...hdParts({ minStage: 2, anim: { kind: "spin", pivot: [0, 2.55, 0], speed: 0.8 } }, (b) => {
      skull(b.add.bind(b), 0, 0, 0, 0.3, O_BONE, 0, { mat: "bone" });
    })
  );
  // Palace (epic): bone and iron spikes round the battlements, war runes burning red on the hall, a crow with wings
  out.push(
    ...hdParts({ minStage: 3 }, (b) => {
      const add = b.add.bind(b);
      for (let i = 0; i < 6; i++) {
        const t = -0.85 + i * 0.34;
        for (const s of [-1, 1]) {
          along(add, "cone", [t, 2.0, s * 0.92], [t, 2.24, s * 1.02], 0.07, 0.07, i % 2 ? O_BONE : IRON, { mat: i % 2 ? "bone" : "iron" });
          along(add, "cone", [s * 0.92, 2.0, t], [s * 1.02, 2.24, t], 0.07, 0.07, i % 2 ? O_BONE : IRON, { mat: i % 2 ? "bone" : "iron" });
        }
      }
      for (let k = 0; k < 3; k++) rune(b.add.bind(b), k + 1, -0.5 + k * 0.5, 1.55, 0.86, 0.38, "#ef4444");
    }),
    ...hdParts({ minStage: 3, anim: { kind: "orbit", pivot: [0, 2.9, 0] }, shadow: false }, (b) => {
      const t = new Builder(b.out, 1.4, 0, 0, Math.PI);
      bird(t.add.bind(t), 0, 0, 0, 0.55, "#1c1917", "#292524", "#57534e", { mat: "plain" });
    })
  );
  return out;
}

/* ------------------------------- Nethergarde ------------------------------- */

const A_OBSIDIAN = "#2e1065";
const A_VIOLET = "#7e22ce";
const A_GLOW = "#c084fc";

function arcaneHd(): CastlePart[] {
  const out: CastlePart[] = [];
  // Keep (common): a stepped obsidian footing, shards of black glass leaning out round the edge, the pedestal's
  // carved collars
  out.push(
    ...hdParts({}, (b) => {
      b.add("cyl", 0, -0.02, 0, 3.9, 0.16, 3.9, "#1e1b2e", { mat: "stone" });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const add = b.add.bind(b);
        along(add, "octa", [Math.sin(a) * 1.72, 0.0, Math.cos(a) * 1.72], [Math.sin(a) * 1.92, 0.55 + (k % 3) * 0.12, Math.cos(a) * 1.92], 0.16, 0.16, A_OBSIDIAN, { mat: "gem" });
      }
      // Carved collars round the pedestal's foot and its neck
      ring(b, 0, 0, 0.72, 0.56, 0.06, "#3b0764", { mat: "stone" });
      ring(b, 0, 0, 0.56, 0.95, 0.05, "#3b0764", { mat: "stone" });
    })
  );
  // Castle (uncommon): violet banners on two obsidian posts at the front, runes carved round the ring
  out.push(
    ...hdParts({ minStage: 1 }, (b) => {
      for (const x of [-1.15, 1.15]) {
        b.add("box", x, 0.0, 1.35, 0.12, 1.3, 0.12, "#1e1b2e", { mat: "stone" });
        b.add("octa", x, 1.3, 1.35, 0.14, 0.24, 0.14, A_GLOW, { mat: "gem" });
        pennant(b, x, 1.35, 1.2, 0.36, 0.52, A_VIOLET, x > 0 ? 0 : Math.PI);
      }
    })
  );
  // Citadel (rare): two more crystals turning with the first round the light column, silver bands on the pedestal
  out.push(
    ...hdParts({ minStage: 2 }, (b) => {
      ring(b, 0, 0, 0.73, 0.63, 0.035, "#e5e7eb", { mat: "steel" });
      ring(b, 0, 0, 0.64, 0.8, 0.035, "#e5e7eb", { mat: "steel" });
    }),
    ...hdParts({ minStage: 2, anim: { kind: "spin", pivot: [0, 1.6, 0], speed: 1.5 } }, (b) => {
      for (const a of [(2 * Math.PI) / 3, (4 * Math.PI) / 3]) b.add("octa", Math.cos(a) * 0.45, -0.07, Math.sin(a) * 0.45, 0.12, 0.16, 0.12, "#e879f9", { mat: "gem", glow: true });
    })
  );
  // Palace (epic): the hovering citadel ringed in silver with broken rock hanging under it, stone sockets under the
  // obelisks, more shards orbiting
  out.push(
    ...hdParts({ minStage: 3, anim: { kind: "bob", baseY: 2.4 } }, (b) => {
      const add = b.add.bind(b);
      arc(add, [0, 0, 0], [1, 0, 0], [0, 0, 1], 0.95, 0, Math.PI * 2, 16, 0.06, "#e5e7eb", { mat: "steel" });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        b.add("boulder", Math.sin(a) * 0.25, -1.05 - (k % 2) * 0.12, Math.cos(a) * 0.25, 0.22, 0.18, 0.2, "#1e1b2e", { mat: "stone", ry: a });
      }
    }),
    ...hdParts({ minStage: 3 }, (b) => {
      for (const x of [-1.6, 1.6]) b.add("cyl", x, 0.0, -0.6, 0.4, 0.55, 0.4, "#1e1b2e", { mat: "stone" });
    }),
    ...hdParts({ minStage: 3, anim: { kind: "orbit", pivot: [0, 2.4, 0] }, shadow: false }, (b) => {
      for (const a of [2.1, 4.2]) b.add("octa", Math.cos(a) * 1.8, (a > 3 ? 0.3 : -0.25), Math.sin(a) * 1.8, 0.11, 0.18, 0.11, "#e9d5ff", { mat: "gem", glow: true });
    })
  );
  return out;
}

/* -------------------------------- Wonders -------------------------------- */

/*
 * The Wonder (Lv21–25) is legendary-class: two steps above the Palace, so its HD version changes the silhouette (towers
 * rise, new structures stand round the keep), takes the civilization's richest materials and moves in layers (parts
 * turning, glows pulsing, sparks and motes rising) before the legendary curtain and beam finish it. Every part here sits
 * in a batch the castle already has (no new draws per civilization); the motion runs in the castle shader.
 */
const WONDER = 4;

/** Sparks (or motes) rising from round a point and fading, `n` of them spread over the cycle */
function sparks(b: Builder, x: number, y: number, z: number, r: number, n: number, size: number, colors: string[], seed = 0) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed;
    b.add("octa", x + Math.sin(a) * r, y, z + Math.cos(a) * r, size, size * 1.3, size, colors[k % colors.length], { glow: true, idle: IDLE_KIND.smoke, phase: 0.01 + (k / n) * Math.PI * 2 + seed });
  }
}

/** Flames in a bowl: a few cones of fire pulsing, the tallest in the middle */
function flames(b: Builder, x: number, y0: number, z: number, w: number, h: number, colors = ["#f97316", "#fbbf24", "#ea580c"]) {
  const pulse = { glow: true, idle: IDLE_KIND.pulse } as const;
  b.add("cone", x, y0, z, w, h, w, colors[0], pulse);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    b.add("cone", x + Math.sin(a) * w * 0.28, y0, z + Math.cos(a) * w * 0.28, w * 0.55, h * 0.62, w * 0.55, colors[(k + 1) % colors.length], pulse);
  }
}

/**
 * Valoria's Wonder, the royal cathedral-palace: the four corner towers rise a storey (lit drums, gold bands, tall tiled
 * spires, gilt finials and pennants), a crenellated curtain links them, the keep wears a gilt moulding, gilt cresting on
 * its roof and royal banners down its sides, the great spire gold ribs and crockets and a rose window, a gilt crown turns
 * round its tip and sparks rise round it; gilt lamp standards burn either side of the steps
 */
function humanWonder(): CastlePart[] {
  return [
    ...hdParts({ minStage: WONDER, courses: "masonry" }, (b) => {
      for (const [x, z] of H_CORNERS) b.add("cyl", x, 1.24, z, 0.5, 0.56, 0.5, H_WHITE, { mat: "plain" });
      // The curtain: sides and back between the towers, and either side of the steps
      for (const s of [-1, 1]) {
        b.add("slab", s * 1.2, 0.7, 0, 0.12, 0.34, 1.84, H_PALE, { mat: "plain" });
        b.add("slab", s * 0.62, 0.7, 1.2, 0.6, 0.34, 0.12, H_PALE, { mat: "plain" });
      }
      b.add("slab", 0, 0.7, -1.2, 1.84, 0.34, 0.12, H_PALE, { mat: "plain" });
    }),
    ...hdParts({ minStage: WONDER, courses: "tiles" }, (b) => {
      for (const [x, z] of H_CORNERS) b.add("cone", x, 1.8, z, 0.62, 0.95, 0.62, H_BLUE, { mat: "plain" });
    }),
    ...hdParts({ minStage: WONDER }, (b) => {
      const c = centred(b);
      const add = b.add.bind(b);
      for (const [x, z] of H_CORNERS) {
        ring(b, x, z, 0.29, 1.48, 0.035, GOLD, { mat: "gold" });
        ring(b, x, z, 0.3, 1.72, 0.05, GOLD, { mat: "gold" });
        for (let k = 0; k < 4; k++) {
          const a = Math.PI / 4 + (k * Math.PI) / 2;
          b.add("box", x + Math.sin(a) * 0.255, 1.54, z + Math.cos(a) * 0.255, 0.05, 0.15, 0.04, LAMP, { glow: true, ry: a });
        }
        b.add("sphere", x, 2.7, z, 0.08, 0.08, 0.08, GOLD, { mat: "gold" });
        b.add("cyl", x, 2.74, z, 0.02, 0.32, 0.02, GOLD, { mat: "gold" });
        pennant(b, x, z, 3.04, 0.34, 0.1, H_BLUE, x > 0 ? 0 : Math.PI);
      }
      // Merlons along the curtain
      for (const s of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const t = -0.75 + i * 0.3;
          b.add("box", s * 1.2, 1.04, t, 0.12, 0.09, 0.1, H_PALE, { mat: "plain" });
          if (s > 0) b.add("box", t, 1.04, -1.2, 0.1, 0.09, 0.12, H_PALE, { mat: "plain" });
        }
        for (const x of [0.42, 0.62, 0.82]) b.add("box", s * x, 1.04, 1.2, 0.1, 0.09, 0.12, H_PALE, { mat: "plain" });
      }
      // A gilt moulding round the keep under its parapet, gilt cresting up the roof's hips
      b.add("box", 0, 1.55, 0, 1.9, 0.04, 1.9, GOLD, { mat: "gold" });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) along(add, "capsule", [sx * 0.7, 1.77, sz * 0.7], [sx * 0.33, 2.25, sz * 0.33], 0.035, 0.035, GOLD, { mat: "gold" });
      // The great spire: gold ribs and crockets up its roof, a rose window on its face
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const [sx, sz] = [Math.sin(a), Math.cos(a)];
        along(add, "capsule", [sx * 0.44, 3.81, sz * 0.44], [sx * 0.05, 4.57, sz * 0.05], 0.03, 0.03, GOLD, { mat: "gold" });
        for (const t of [0.3, 0.62]) b.add("octa", sx * (0.44 * (1 - t) + 0.04), 3.81 + 0.76 * t, sz * (0.44 * (1 - t) + 0.04), 0.05, 0.08, 0.05, GOLD, { mat: "gold" });
      }
      c("cyl", 0, 2.85, 0.345, 0.34, 0.02, 0.34, GOLD, { rx: Math.PI / 2, mat: "gold" });
      c("cyl", 0, 2.85, 0.38, 0.26, 0.05, 0.26, "#fbbf24", { rx: Math.PI / 2, glow: true });
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 4;
        along(add, "box", [Math.cos(a) * -0.13, 2.85 + Math.sin(a) * -0.13, 0.435], [Math.cos(a) * 0.13, 2.85 + Math.sin(a) * 0.13, 0.435], 0.022, 0.03, GOLD, { mat: "gold" });
      }
      // Gilt lamp standards either side of the steps
      for (const s of [-1, 1]) {
        b.add("cyl", s * 0.45, 0, 1.72, 0.05, 0.56, 0.05, IRON, { mat: "iron" });
        b.add("cyl", s * 0.45, 0.6, 1.72, 0.09, 0.04, 0.09, GOLD, { mat: "gold" });
        b.add("cone", s * 0.45, 0.78, 1.72, 0.12, 0.1, 0.12, GOLD, { mat: "gold" });
      }
    }),
    // The lamps' flames pulse slowly
    ...hdParts({ minStage: WONDER }, (b) => {
      for (const s of [-1, 1]) b.add("sphere", s * 0.45, 0.64, 1.72, 0.1, 0.13, 0.1, LAMP, { glow: true, idle: IDLE_KIND.pulse });
    }),
    // Royal banners hanging down the keep's sides and back: blue, a gold hem, a gold sun
    ...hdParts({ minStage: WONDER, hang: true }, (b) => {
      for (const [x, z, ry] of [[0.9, 0, Math.PI / 2], [-0.9, 0, -Math.PI / 2], [0, -0.9, Math.PI]] as V3[]) {
        const o = { mat: "cloth" as const, ry, idle: IDLE_KIND.flutter, pivot: [x, z] as [number, number] };
        b.add("box", x, 1.0, z, 0.32, 0.56, 0.025, H_BLUE, o);
        b.add("box", x, 0.98, z, 0.33, 0.05, 0.03, GOLD, o);
        b.add("box", x, 1.24, z, 0.12, 0.12, 0.035, GOLD, o);
      }
    }),
    // A gilt crown turning round the spire's tip: a circlet with points and lit jewels
    ...hdParts({ minStage: WONDER, turn: 0.35, bob: 0.03, shadow: false }, (b) => {
      const o = { mat: "gold" as const, idle: IDLE_KIND.spin, pivot: [0, 0] as [number, number] };
      arc(b.add.bind(b), [0, 4.22, 0], [1, 0, 0], [0, 0, 1], 0.44, 0, Math.PI * 2, 16, 0.035, GOLD, o, "box");
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.add("cone", Math.sin(a) * 0.44, 4.24, Math.cos(a) * 0.44, 0.05, 0.13, 0.05, GOLD, o);
        b.add("octa", Math.sin(a + 0.39) * 0.44, 4.2, Math.cos(a + 0.39) * 0.44, 0.045, 0.06, 0.045, k % 2 ? "#60a5fa" : "#fde68a", { ...o, mat: "gem", glow: true });
      }
    }),
    ...hdParts({ minStage: WONDER }, (b) => sparks(b, 0, 2.9, 0, 0.55, 6, 0.06, ["#fde68a", "#fbbf24"]))
  ];
}

const E_CYAN = "#06b6d4";
const E_MOON = "#e0f2fe";
/** The Wonder's mana crystal bobs and turns on this (the same animation as the Normal crystal it replaces) */
const ELF_CRYSTAL: CastleAnim = { kind: "bob", baseY: 2.8 };

/**
 * Sylvandale's Wonder, the great tree in bloom: a third crown of leaves over the canopy with blossom glowing in it and
 * lantern-fruit hanging from the rim, the silver spires a storey taller under crescent moons with silver bridges arching
 * to the trunk, the mana crystal risen over the crown in a silver cradle, a ring of leaves and motes turning round the
 * tree and motes drifting up
 */
function elfWonder(): CastlePart[] {
  const spires = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((a) => [a, Math.cos(a) * 1.35, Math.sin(a) * 1.35]);
  return [
    ...hdParts({ minStage: WONDER, courses: "masonry" }, (b) => {
      for (const [, x, z] of spires) b.add("cyl", x, 1.25, z, 0.32, 0.7, 0.32, "#e2e8f0", { mat: "plain" });
    }),
    ...hdParts({ minStage: WONDER }, (b) => {
      const add = b.add.bind(b);
      for (const [a, x, z] of spires) {
        ring(b, x, z, 0.21, 1.96, 0.04, "#e5e7eb", { mat: "steel" });
        ring(b, x, z, 0.19, 1.55, 0.03, "#e5e7eb", { mat: "steel" });
        b.add("cone", x, 1.97, z, 0.44, 0.9, 0.44, E_CYAN, { mat: "gem" });
        b.add("cyl", x, 2.82, z, 0.025, 0.1, 0.025, "#e5e7eb", { mat: "steel" });
        // A silver bridge arching from the spire to the trunk, a rail above it
        const [dx, dz] = [Math.cos(a), Math.sin(a)];
        along(add, "capsule", [dx * 1.18, 1.72, dz * 1.18], [dx * 0.98, 1.84, dz * 0.98], 0.06, 0.06, "#e5e7eb", { mat: "steel" });
        along(add, "capsule", [dx * 0.98, 1.84, dz * 0.98], [dx * 0.78, 1.88, dz * 0.78], 0.06, 0.06, "#e5e7eb", { mat: "steel" });
        along(add, "capsule", [dx * 1.18, 1.84, dz * 1.18], [dx * 0.8, 1.98, dz * 0.8], 0.02, 0.02, "#e5e7eb", { mat: "steel" });
      }
      // The third crown of leaves over the upper canopy
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.2;
        b.add("canopy", Math.cos(a) * 0.62, 2.6 + (k % 2) * 0.05, Math.sin(a) * 0.62, 0.55, 0.36, 0.55, k % 2 ? "#10b981" : "#059669", { mat: "leaf", ry: a });
      }
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.7;
        b.add("canopy", Math.cos(a) * 0.28, 2.85, Math.sin(a) * 0.28, 0.45, 0.28, 0.45, "#34d399", { mat: "leaf" });
      }
      b.add("canopy", 0, 3.0, 0, 0.32, 0.25, 0.32, "#6ee7b7", { mat: "leaf" });
      along(add, "taper", [0, 3.15, 0], [0, 3.5, 0], 0.07, 0.07, "#e5e7eb", { mat: "steel" });
      // Silver threads the lantern-fruit hang on from the canopy's rim
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.35;
        const [x, z] = [Math.sin(a) * 1.52, Math.cos(a) * 1.52];
        along(add, "cyl", [x, 1.24, z], [x, 0.98, z], 0.012, 0.012, "#e5e7eb", { mat: "steel" });
        b.add("sphere", x, 0.97, z, 0.05, 0.04, 0.05, "#e5e7eb", { mat: "steel" });
      }
    }),
    // Blossom glowing in the crowns, lantern-fruit and crescent moons pulsing
    ...hdParts({ minStage: WONDER }, (b) => {
      const bloom: V3[] = [];
      for (let k = 0; k < 7; k++) bloom.push([(k / 7) * Math.PI * 2 + 0.65, 0.84, 2.82 + (k % 2) * 0.06]);
      for (let k = 0; k < 6; k++) bloom.push([(k / 6) * Math.PI * 2 + 0.1, 1.08, 2.36]);
      for (const [k, [a, r, y]] of bloom.entries()) b.add("octa", Math.cos(a) * r, y, Math.sin(a) * r, 0.11, 0.1, 0.11, k % 3 ? "#fdf2f8" : "#fbcfe8", { glow: true, idle: IDLE_KIND.pulse, ry: k });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.35;
        b.add("sphere", Math.sin(a) * 1.52, 0.86, Math.cos(a) * 1.52, 0.1, 0.12, 0.1, "#fde68a", { glow: true, idle: IDLE_KIND.pulse });
      }
      // Crescent moons over the spires, opening away from the tree
      for (const [a, x, z] of spires) arc(b.add.bind(b), [x, 2.98, z], [Math.cos(a), 0, Math.sin(a)], [0, 1, 0], 0.1, 0.7, Math.PI * 2 - 0.7, 7, 0.03, E_MOON, { glow: true, idle: IDLE_KIND.pulse }, "box");
    }),
    // The mana crystal risen over the crown, in a silver cradle (it bobs and turns with the Normal crystal's motion)
    ...hdParts({ minStage: WONDER, anim: ELF_CRYSTAL }, (b) => {
      const add = b.add.bind(b);
      b.add("octa", 0, 0.62, 0, 0.5, 0.95, 0.5, "#38bdf8", { mat: "gem", glow: true });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const at = (r: number, y: number): V3 => [Math.sin(a) * r, y, Math.cos(a) * r];
        along(add, "capsule", at(0.08, 0.5), at(0.26, 0.86), 0.03, 0.03, "#e5e7eb", { mat: "steel" });
        along(add, "capsule", at(0.26, 0.86), at(0.17, 1.24), 0.03, 0.03, "#e5e7eb", { mat: "steel" });
        b.add("octa", ...at(0.14, 0.5), 0.12, 0.03, 0.07, E_LEAF, { mat: "leaf", ry: a });
      }
      b.add("sphere", 0, 0.46, 0, 0.12, 0.08, 0.12, "#e5e7eb", { mat: "steel" });
    }),
    // A ring of leaves and motes turning round the tree over the canopy (in place of the Palace's flat ring of light)
    ...hdParts({ minStage: WONDER, turn: 0.45, bob: 0.05, shadow: false }, (b) => {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const r = 1.66 + (k % 3) * 0.07;
        const y = 2.3 + Math.sin(k * 1.7) * 0.07;
        const o = { idle: IDLE_KIND.spin, pivot: [0, 0] as [number, number], ry: a };
        if (k % 3 === 0) b.add("octa", Math.sin(a) * r, y, Math.cos(a) * r, 0.08, 0.08, 0.08, "#a5f3fc", { ...o, glow: true });
        else b.add("octa", Math.sin(a) * r, y, Math.cos(a) * r, 0.14, 0.03, 0.08, k % 2 ? "#a3e635" : "#34d399", { ...o, mat: "leaf" });
      }
    }),
    ...hdParts({ minStage: WONDER }, (b) => sparks(b, 0, 2.4, 0, 1.0, 6, 0.05, ["#a5f3fc", "#fdf2f8"], 0.3))
  ];
}

/** Adds a part by its centre (the Builder adds by its foot) */
function c3(b: Builder, shape: Shape, x: number, y: number, z: number, w: number, h: number, d: number, color: string, o: AddOpts = {}) {
  b.add(shape, x, y - h / 2, z, w, h, d, color, o);
}

/**
 * Ironforge's Wonder, the great forge-hall: four square bastions at the corners with brass braziers burning, a great
 * forge stack rising from the copper roof (glowing vents, a brass band and cap, smoke and embers), lava pouring from the
 * battlements either side of the gate, gold runes pulsing round them, the masterwork anvil on its own plinth (horn,
 * waist and feet, glowing metal on its face, a hammer leaning on it, sparks flying)
 */
function dwarfWonder(): CastlePart[] {
  const corners: Array<[number, number]> = [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]];
  const pulse = { glow: true, idle: IDLE_KIND.pulse } as const;
  return [
    ...hdParts({ minStage: WONDER, courses: "masonry" }, (b) => {
      for (const [x, z] of corners) b.add("block", x, 0.62, z, 0.5, 1.4, 0.5, "#3b4658", { mat: "plain" });
      b.add("block", 0, 1.95, 0, 0.62, 0.9, 0.62, "#334155", { mat: "plain" });
      b.add("block", 0, 2.93, 0, 0.46, 0.47, 0.46, "#334155", { mat: "plain" });
    }),
    ...hdParts({ minStage: WONDER }, (b) => {
      const add = b.add.bind(b);
      for (const [x, z] of corners) {
        b.add("block", x, 1.98, z, 0.62, 0.08, 0.62, "#475569", { mat: "stone" });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add("block", x + sx * 0.22, 2.06, z + sz * 0.22, 0.14, 0.14, 0.14, "#475569", { mat: "stone" });
        b.add("cyl", x, 2.06, z, 0.26, 0.1, 0.26, D_BRASS, { mat: "gold" });
      }
      // The forge stack: a cornice, a brass band and cap
      b.add("block", 0, 2.85, 0, 0.74, 0.08, 0.74, "#475569", { mat: "stone" });
      b.add("box", 0, 2.42, 0, 0.68, 0.05, 0.68, D_BRASS, { mat: "gold" });
      b.add("box", 0, 3.4, 0, 0.56, 0.06, 0.56, D_BRASS, { mat: "gold" });
      // Stone channels the lava runs in, from the battlements either side of the gate
      for (const s of [-1, 1]) {
        for (const e of [-1, 1]) b.add("block", s * 0.72 + e * 0.1, 0.65, 1.38, 0.05, 0.08, 0.3, "#475569", { mat: "stone" });
        b.add("block", s * 0.72, 1.36, 1.25, 0.24, 0.07, 0.1, "#475569", { mat: "stone" });
      }
      // A gold band across the battlements' front
      b.add("box", 0, 1.42, 1.22, 2.5, 0.04, 0.04, "#fbbf24", { mat: "gold" });
      // The masterwork anvil on its plinth, a hammer leaning on it
      b.add("block", 1.25, 0, 1.85, 0.5, 0.32, 0.42, "#475569", { mat: "stone" });
      b.add("box", 1.25, 0.32, 1.85, 0.3, 0.07, 0.22, IRON, { mat: "iron" });
      b.add("box", 1.25, 0.39, 1.85, 0.15, 0.12, 0.12, IRON, { mat: "iron" });
      b.add("box", 1.23, 0.51, 1.85, 0.4, 0.1, 0.2, "#64748b", { mat: "steel" });
      along(add, "cone", [1.43, 0.57, 1.85], [1.62, 0.57, 1.85], 0.1, 0.09, "#64748b", { mat: "steel" });
      along(add, "cyl", [1.0, 0.02, 2.06], [1.08, 0.6, 1.98], 0.035, 0.035, "#4a3220", { mat: "wood" });
      c3(b, "box", 1.08, 0.64, 1.98, 0.17, 0.1, 0.1, D_BRASS, { mat: "gold", ry: 0.6 });
    }),
    ...hdParts({ minStage: WONDER }, (b) => {
      for (const [x, z] of corners) {
        flames(b, x, 2.16, z, 0.16, 0.34);
        // Forge-lit slits on the bastions' outer faces
        b.add("box", x + Math.sign(x) * 0.255, 1.1, z, 0.04, 0.3, 0.06, "#f97316", pulse);
        b.add("box", x, 1.1, z + Math.sign(z) * 0.255, 0.06, 0.3, 0.04, "#f97316", pulse);
      }
      // Vents glowing in the forge stack
      for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        b.add("box", sx * 0.33, 2.1, sz * 0.33, sx ? 0.04 : 0.2, 0.26, sz ? 0.04 : 0.2, "#fb923c", pulse);
        b.add("box", sx * 0.25, 3.02, sz * 0.25, sx ? 0.04 : 0.12, 0.14, sz ? 0.04 : 0.12, "#fb923c", pulse);
      }
      // The lava falls (off the battlement, along the foundation and down its face)
      for (const s of [-1, 1]) {
        b.add("box", s * 0.72, 0.66, 1.27, 0.14, 0.72, 0.04, "#ea580c", { mat: "lava" });
        b.add("box", s * 0.72, 0.65, 1.39, 0.14, 0.03, 0.26, "#ea580c", { mat: "lava" });
        b.add("box", s * 0.72, 0.18, 1.53, 0.14, 0.48, 0.04, "#ea580c", { mat: "lava" });
      }
      // Gold runes on the battlements' sides
      for (const s of [-1, 1]) {
        const t = new Builder(b.out, s * 1.21, 0, 0, (s * Math.PI) / 2);
        for (const [k, x] of [-0.6, 0, 0.6].entries()) rune(t.add.bind(t), k + 2, x, 1.6, 0, 0.26, "#fbbf24", { idle: IDLE_KIND.pulse });
      }
      // The anvil's face glowing hot
      b.add("box", 1.2, 0.62, 1.85, 0.16, 0.025, 0.1, "#fb923c", pulse);
    }),
    ...hdParts({ minStage: WONDER, opacity: 0.6 }, (b) => {
      for (let k = 0; k < 3; k++) b.add("sphere", 0, 3.48, 0, 0.26, 0.22, 0.26, "#64748b", { idle: IDLE_KIND.smoke, phase: 0.01 + (k * Math.PI * 2) / 3 + 0.5 });
    }),
    ...hdParts({ minStage: WONDER }, (b) => {
      sparks(b, 0, 3.5, 0, 0.12, 4, 0.05, ["#fb923c", "#fbbf24"]);
      for (const [x, z] of corners) sparks(b, x, 2.4, z, 0.05, 2, 0.045, ["#fbbf24", "#f97316"], x + z);
      sparks(b, 1.22, 0.66, 1.85, 0.04, 4, 0.035, ["#fde68a", "#fb923c"], 1.1);
    })
  ];
}

/** A Normal tusk of the Drak'mar Wonder (`castleParts.ts`): where a point `y` along it (−0.75 foot … 0.75 tip) lies */
function tuskPoint(side: number, y: number): V3 {
  const d = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(0.2, 0, -side * 0.3));
  return [side * 0.8 + d.x * y, 0.8 + d.y * y, 1.4 + d.z * y];
}

/**
 * Drak'mar's Wonder, the bloodfire war-throne: a mammoth skull over the gate between the iron-banded tusks, totems of
 * stacked skulls at the back corners, tall tattered war banners at the front, a palisade of bone and iron spikes round
 * the foundation, and a bonfire burning in an iron cauldron raised over the roof, smoke and embers rising
 */
function orcWonder(): CastlePart[] {
  return [
    ...hdParts({ minStage: WONDER }, (b) => {
      const add = b.add.bind(b);
      const c = centred(b);
      // Iron bands round the tusks, an iron cap on each tip
      for (const side of [-1, 1]) {
        for (const [y, r] of [[-0.45, 0.12], [-0.12, 0.088]]) {
          const [x, py, z] = tuskPoint(side, y);
          c("cyl", x, py, z, r * 2 + 0.03, 0.05, r * 2 + 0.03, IRON, { mat: "iron", rx: 0.2, rz: -side * 0.3 });
        }
        along(add, "cone", tuskPoint(side, 0.52), tuskPoint(side, 0.8), 0.07, 0.07, IRON, { mat: "iron" });
      }
      // The mammoth skull over the gate: a domed cranium, deep sockets, the trunk's hollow, short tusk roots, an iron brow band
      b.add("egg", 0, 1.38, 1.05, 0.66, 0.56, 0.44, O_BONE, { mat: "bone" });
      b.add("sphere", 0, 1.7, 1.0, 0.5, 0.34, 0.4, O_BONE, { mat: "bone" });
      for (const s of [-1, 1]) {
        b.add("sphere", s * 0.17, 1.56, 1.24, 0.13, 0.11, 0.08, "#1c1917", { mat: "plain" });
        along(add, "horn", [s * 0.16, 1.48, 1.18], [s * 0.3, 1.24, 1.4], 0.09, 0.09, O_BONE, { mat: "bone" });
      }
      b.add("drop", 0, 1.4, 1.26, 0.11, 0.16, 0.06, "#1c1917", { mat: "plain", rx: Math.PI });
      along(add, "box", [-0.28, 1.74, 1.17], [0.28, 1.74, 1.17], 0.05, 0.04, IRON, { mat: "iron" });
      // Totems of stacked skulls at the back corners, horns on top
      for (const s of [-1, 1]) {
        const x = s * 1.62;
        b.add("cyl", x, 0, -1.62, 0.09, 2.15, 0.09, "#4a2f1a", { mat: "wood" });
        for (const [k, y] of [1.3, 1.62].entries()) skull(add, x, y, -1.58, 0.26 - k * 0.03, O_BONE, 0, { mat: "bone" });
        for (const e of [-1, 1]) along(add, "horn", [x, 2.05, -1.62], [x + e * 0.24, 2.32, -1.6], 0.08, 0.08, O_BONE, { mat: "bone" });
      }
      // Poles of the tall war banners at the front corners
      for (const s of [-1, 1]) {
        b.add("cyl", s * 1.62, 0, 1.3, 0.06, 2.65, 0.06, "#4a2f1a", { mat: "wood" });
        b.add("cone", s * 1.62, 2.65, 1.3, 0.08, 0.16, 0.08, IRON, { mat: "iron" });
      }
      // The palisade of bone and iron spikes round the foundation's edge
      const spike = (x: number, z: number, ox: number, oz: number, k: number) =>
        along(add, "cone", [x, 0.72, z], [x + ox * 0.1, 1.06, z + oz * 0.1], 0.07, 0.07, k % 2 ? IRON : O_BONE, { mat: k % 2 ? "iron" : "bone" });
      for (let i = 0; i < 9; i++) spike(-1.0 + i * 0.25, -1.47, 0, -1, i);
      for (const [i, z] of [0.45, 0.7, 0.95, 1.2].entries()) spike(-1.47, z, -1, 0, i);
      for (const [i, z] of [0.75, 1.0, 1.2, -1.2, -0.95, -0.7].entries()) spike(1.47, z, 1, 0, i + 1);
      // The bonfire's iron cauldron on three legs over the roof
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        along(add, "cyl", [Math.sin(a) * 0.36, 2.24, Math.cos(a) * 0.36], [Math.sin(a) * 0.2, 2.86, Math.cos(a) * 0.2], 0.04, 0.04, IRON, { mat: "iron" });
      }
      b.add("cyl", 0, 2.82, 0, 0.5, 0.15, 0.5, IRON, { mat: "iron" });
      b.add("cyl", 0, 2.95, 0, 0.56, 0.05, 0.56, "#57534e", { mat: "iron" });
    }),
    // Tattered war banners streaming from the tall poles
    ...hdParts({ minStage: WONDER }, (b) => {
      for (const s of [-1, 1]) {
        const x = s * 1.62;
        const ry = s > 0 ? 0 : Math.PI;
        pennant(b, x, 1.3, 2.55, 0.5, 0.55, O_RED, ry);
        for (const k of [0.12, 0.3, 0.46]) b.add("box", x + s * (0.02 + k), 1.88, 1.3, 0.09, 0.12, 0.025, O_RED, { mat: "cloth", ry, idle: IDLE_KIND.flutter, pivot: [x, 1.3] });
      }
    }),
    ...hdParts({ minStage: WONDER }, (b) => {
      flames(b, 0, 2.98, 0, 0.42, 0.62, ["#ef4444", "#f97316", "#fbbf24"]);
      flames(b, 0.08, 2.98, -0.06, 0.26, 0.82, ["#f97316", "#fbbf24", "#ef4444"]);
      for (let k = 0; k < 3; k++) b.add("sphere", 0, 3.4, 0, 0.24, 0.2, 0.24, "#44403c", { idle: IDLE_KIND.smoke, phase: 0.01 + (k * Math.PI * 2) / 3 });
      sparks(b, 0, 3.3, 0, 0.15, 5, 0.05, ["#f97316", "#fbbf24", "#ef4444"]);
      // The eye sockets smoulder
      for (const s of [-1, 1]) b.add("sphere", s * 0.17, 1.555, 1.26, 0.05, 0.045, 0.04, "#ef4444", { glow: true, idle: IDLE_KIND.pulse });
    })
  ];
}

const A_SILVER = "#e5e7eb";
/** The hovering citadel's bob (the same animation as its Normal parts) */
const ARCANE_CITADEL: CastleAnim = { kind: "bob", baseY: 2.4 };

/**
 * Nethergarde's Wonder, the void spire: a ring of tall obsidian monoliths round the castle with violet runes pulsing on
 * their inner faces and crystals on top, a crystal spire with silver bands rising from the hovering citadel to a void orb
 * in a ring of light, two great silver rings turning round the citadel (one tilted, so they read as a gyroscope) with
 * beads of light on them, motes rising round the light column
 */
function arcaneWonder(): CastlePart[] {
  const stones = [0, 1, 2, 3, 4, 5].map((k) => Math.PI / 6 + (k * Math.PI) / 3);
  const tilt = 0.42;
  return [
    ...hdParts({ minStage: WONDER }, (b) => {
      for (const a of stones) {
        const t = new Builder(b.out, Math.sin(a) * 2.2, 0, Math.cos(a) * 2.2, a + Math.PI);
        t.add("block", 0, -0.02, 0, 0.42, 0.14, 0.32, "#1e1b2e", { mat: "stone" });
        t.add("taper", 0, 0.1, 0, 0.32, 1.55, 0.22, "#18122b", { mat: "stone" });
      }
    }),
    ...hdParts({ minStage: WONDER }, (b) => {
      for (const [i, a] of stones.entries()) {
        const t = new Builder(b.out, Math.sin(a) * 2.2, 0, Math.cos(a) * 2.2, a + Math.PI);
        t.add("octa", 0, 1.62, 0, 0.16, 0.3, 0.16, A_GLOW, { mat: "gem", glow: true, idle: IDLE_KIND.pulse });
        rune(t.add.bind(t), i, 0, 0.75, 0.115, 0.3, A_GLOW, { idle: IDLE_KIND.pulse });
      }
    }),
    // The crystal spire on the hovering citadel, a void orb in a ring of light at its tip
    ...hdParts({ minStage: WONDER, anim: ARCANE_CITADEL }, (b) => {
      b.add("taper", 0, 1.2, 0, 0.32, 1.25, 0.32, "#a855f7", { mat: "gem" });
      for (const y of [1.42, 1.86]) ring(b, 0, 0, 0.16 - (y - 1.42) * 0.1, y, 0.035, A_SILVER, { mat: "steel" });
      b.add("sphere", 0, 2.42, 0, 0.32, 0.32, 0.32, "#0c0a1d", { mat: "gem" });
      arc(b.add.bind(b), [0, 2.58, 0], [1, 0, 0], [0, 1, 0], 0.24, 0, Math.PI * 2, 12, 0.035, "#e9d5ff", { glow: true }, "box");
    }),
    // Two great silver rings turning round the citadel, one tilted, beads of light on them
    ...hdParts({ minStage: WONDER, turn: 0.3, shadow: false }, (b) => {
      const o = { mat: "steel" as const, idle: IDLE_KIND.spin, pivot: [0, 0] as [number, number] };
      arc(b.add.bind(b), [0, 2.4, 0], [1, 0, 0], [0, 0, 1], 1.35, 0, Math.PI * 2, 24, 0.045, A_SILVER, o, "box");
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        b.add("octa", Math.sin(a) * 1.35, 2.35, Math.cos(a) * 1.35, 0.09, 0.12, 0.09, A_GLOW, { ...o, mat: "gem", glow: true });
      }
    }),
    ...hdParts({ minStage: WONDER, turn: -0.22, bob: 0.06, shadow: false }, (b) => {
      const o = { mat: "steel" as const, idle: IDLE_KIND.spin, pivot: [0, 0] as [number, number] };
      arc(b.add.bind(b), [0, 2.4, 0], [1, 0, 0], [0, Math.sin(tilt), Math.cos(tilt)], 1.6, 0, Math.PI * 2, 28, 0.04, A_SILVER, o, "box");
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        b.add("octa", Math.cos(a) * 1.6, 2.4 + Math.sin(a) * Math.sin(tilt) * 1.6 - 0.06, Math.sin(a) * Math.cos(tilt) * 1.6, 0.1, 0.13, 0.1, "#38bdf8", { ...o, mat: "gem", glow: true });
      }
    }),
    ...hdParts({ minStage: WONDER }, (b) => sparks(b, 0, 1.1, 0, 0.45, 6, 0.05, ["#e9d5ff", A_GLOW, "#38bdf8"], 0.2))
  ];
}

/** Every civilization's HD-only castle detail, merged after its parts (`CASTLE_PARTS`) */
export const CASTLE_HD_PARTS: Record<CivilizationType, CastlePart[]> = {
  human: [...humanHd(), ...humanWonder()],
  elf: [...elfHd(), ...elfWonder()],
  dwarf: [...dwarfHd(), ...dwarfWonder()],
  orc: [...orcHd(), ...orcWonder()],
  arcane: [...arcaneHd(), ...arcaneWonder()]
};
