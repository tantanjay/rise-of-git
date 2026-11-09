import * as THREE from "three";
import { MOVE, TAU, V3, rubble, thetaOf } from "./heroKit";
import { SPARK, STRATA, SURF, cloth, grainRound } from "./heroMaterials";
import { BossAction, BossCtx, BossHeroDef, BonePose, IdleCtx, Pose } from "./heroRig";
import { blob, chainBones, chainLag, chainPose, chainSprings, hook, membrane, merge, onBlob, plate, seg, spike, stud } from "./bossParts";
import { coin, crown, gem } from "./heroSites";

/* ------------------------------------------------------------------------- */
/* Legendary creatures: Vargo the Bandit King and the Archmage of the Voidrift */
/* ------------------------------------------------------------------------- */

/*
 * Rigged heroes on the world bosses' framework (`heroRig.ts`, drawn by `BossBatch`): every part inside a bone, posed on
 * the CPU each frame, every copy of every one in the same handful of draws. Each builder adds its creature round the
 * kit's origin at its Normal rig's size, facing +z. Neither slumbers (they are not world bosses), so each names its own
 * action buttons: its roar (a war cry, an invocation) and its attack.
 */

export const mid = (a: V3, b: V3, f = 0.5): V3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3, f = 1): V3 => [a[0] + b[0] * f, a[1] + b[1] * f, a[2] + b[2] * f];
export const norm = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const sideOf = (s: number) => (s > 0 ? "R" : "L");
const Z = new THREE.Vector3(0, 0, 1);
/** A turn that lays a torus (round z) across `dir` (a cuff, a ring round a limb) */
export const across = (dir: V3) => new THREE.Quaternion().setFromUnitVectors(Z, new THREE.Vector3(...dir).normalize());

// No beam over a creature: embers and its own sparks only
export const aura = (color: string, hot: string, inner: number, outer: number, height: number): BossHeroDef["aura"] => ({
  embers: { inner, outer, height, count: 70 },
  color,
  hot
});

/**
 * A floating figure's march (the Seer, the Archmage): no steps, the body glides, leaning into the way it goes and bobbing
 * on a slow swell, its hem and cape trailing, the arms drifting against each other. A cycle on a loop in place.
 */
export function glide(o: { body?: string; hem?: string; cape?: string; capeBands?: number; len?: number; swingR?: number; swingL?: number } = {}): BossAction {
  const body = o.body ?? "fly";
  const bands = o.capeBands ?? 3;
  const trail = (k: number): Pose => ({
    ...(o.hem ? { [o.hem]: { r: [-0.16 - 0.04 * k, 0, 0] } } : {}),
    ...(o.cape ? chainPose(o.cape, bands, (j) => ({ r: [-0.12 - j * 0.05 - 0.03 * k, 0, 0] })) : {})
  });
  const step = (sg: number, k: number): Pose => ({
    [body]: { r: [0.1, 0.06 * sg, -0.03 * sg], p: [0.02 * sg, 0.05 * k, 0] },
    chest: { r: [0.02, -0.06 * sg, 0] },
    armR: { r: [0.18 * sg * (o.swingR ?? 1), 0, 0] },
    armL: { r: [-0.18 * sg * (o.swingL ?? 1), 0, 0] },
    ...trail(k)
  });
  return {
    len: o.len ?? 2.2,
    idle: 0.3,
    keys: [
      { t: 0, pose: step(1, -1) },
      { t: 0.25, pose: step(0, 1) },
      { t: 0.5, pose: step(-1, -1) },
      { t: 0.75, pose: step(0, 1) },
      { t: 1, pose: step(1, -1) }
    ]
  };
}

/**
 * A cloak or cape hanging down the back in bands, one bone a band (`${name}${j}`, each under the last), so it trails and
 * swings: `rows` gives each band edge's height, half-width `R` and centre depth `zc` (the cloth wraps round the back
 * from one side to the other). The last band's free edge is ragged when `tattered`.
 */
export function cloak(c: BossCtx, name: string, rows: Array<{ y: number; R: number; zc: number }>, color: string, tattered: boolean, span = 1.5, n = 9) {
  const row = (r: (typeof rows)[number]): V3[] =>
    Array.from({ length: n }, (_, i) => {
      const a = -span + (2 * span * i) / (n - 1);
      return [Math.sin(a) * r.R, r.y, r.zc - Math.cos(a) * r.R * 0.75];
    });
  const step = (j: number) => {
    const r = rows[j];
    c.bone(`${name}${j}`, [0, r.y, r.zc - r.R * 0.75], () => {
      membrane(c, "cloth", row(r), row(rows[j + 1]), { color, surf: cloth(1, 1, tattered && j === rows.length - 2), rows: 2 });
      if (j + 2 < rows.length) step(j + 1);
    });
  };
  step(0);
}

/* ================================================================== */
/* Vargo Blackfang, the Bandit King                                    */
/* ================================================================== */

const VG = {
  earth: "#5b3d22",
  earth2: "#3f2a17",
  leather: "#2a211c",
  leather2: "#3d2e24",
  trousers: "#231c18",
  cloak: "#7f1d1d",
  fur: "#4a3a2e",
  gold: "#e0a93a",
  gold2: "#f2c14e",
  iron: "#55565e",
  steel: "#6b6e78",
  bone: "#e7dcc6",
  bone2: "#c9b994",
  dark: "#120d0b",
  eye: "#ef4444",
  edge: "#f43f5e",
  wood: "#4a2c17",
  chest: "#5a3418",
  velvet: "#7f1d1d",
  skin: "#b98a63",
  hound: "#2f2f35",
  hound2: "#1f1f24",
  crow: "#16161a"
};
/** The heap's height at distance `r` from its middle */
const heapY = (r: number) => 0.5 * Math.sqrt(Math.max(0, 1 - (r / 1.4) ** 2));

/** A saber gripped in a fist at `at`: the grip through the fist along `g`, a gold guard and pommel, a curved steel blade with a crimson-lit edge, `up` the spine's side */
function saber(c: BossCtx, at: V3, g: V3, up: V3) {
  const d = norm(g);
  const u0 = new THREE.Vector3(...up);
  const dv = new THREE.Vector3(...d);
  const uv = norm(u0.sub(dv.clone().multiplyScalar(u0.dot(dv))).toArray() as V3);
  const side = norm(cross(d, uv));
  seg(c, "matte", add(at, d, -0.12), add(at, d, 0.1), 0.022, 0.022, { color: VG.leather2, seg: 6, cap: false });
  blob(c, "gold", add(at, d, -0.14), [0.034, 0.034, 0.034], { color: VG.gold, wd: 8, hd: 6 });
  seg(c, "gold", add(add(at, d, 0.11), side, -0.1), add(add(at, d, 0.11), side, 0.1), 0.018, 0.018, { color: VG.gold, seg: 6 });
  for (const s of [-1, 1]) blob(c, "gold", add(add(at, d, 0.13), side, s * 0.1), [0.026, 0.026, 0.026], { color: VG.gold, wd: 6, hd: 4 });
  // The blade: one curved profile (x along the blade, y toward the spine) rising to a clipped point, laid flat in the
  // plane of the grip and the spine; the crimson edge a strip just below its cutting edge
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...d), new THREE.Vector3(...uv), new THREE.Vector3(...side)));
  const L = 1.05;
  const N = 10;
  const spine = (t: number) => 0.14 * t * t + 0.036 * (1 - t * 0.5);
  const edge = (t: number) => 0.14 * t * t - 0.04 * (1 - t * 0.3);
  const blade = new THREE.Shape();
  blade.moveTo(0, edge(0));
  for (let i = 1; i <= N; i++) blade.lineTo(L * (i / N), edge(i / N));
  blade.lineTo(L + 0.09, 0.14 + 0.03);
  for (let i = N; i >= 0; i--) blade.lineTo(L * (i / N), spine(i / N));
  const glint = new THREE.Shape();
  glint.moveTo(0, edge(0));
  for (let i = 1; i <= N; i++) glint.lineTo(L * (i / N), edge(i / N));
  glint.lineTo(L + 0.09, 0.14 + 0.03);
  for (let i = N; i >= 0; i--) glint.lineTo(L * (i / N), edge(i / N) - 0.016 * (1 - i / (N + 2)));
  const at0 = add(at, d, 0.12);
  const slab = (s: THREE.Shape, depth: number) => new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -depth / 2);
  c.k.add("iron", slab(blade, 0.018), at0, undefined, { color: VG.steel, quat: q });
  c.k.add("glow", slab(glint, 0.012), at0, undefined, { color: VG.edge, bright: 1.9, quat: q });
}

/** The heap of plunder under him: earth and coin, chests, a goblet, gems, a rival's skull, a sword driven in */
function plunder(c: BossCtx) {
  const rng = c.rng;
  c.k.add("matte", new THREE.SphereGeometry(1, 28, 6, 0, TAU, 0, Math.PI / 2), [0, 0, 0], undefined, { color: VG.earth, scale: [1.4, 0.5, 1.3], surf: STRATA });
  // Heaps of coin poured over it
  const heaps: Array<[number, number, number]> = [
    [0.62, 0.55, 0.38],
    [-0.5, 0.72, 0.32],
    [0.35, -0.9, 0.34],
    [-1.0, -0.25, 0.3],
    [1.05, -0.15, 0.26]
  ];
  for (const [x, z, r] of heaps) c.k.add("gold", new THREE.SphereGeometry(1, 12, 4, 0, TAU, 0, Math.PI / 2), [x, heapY(Math.hypot(x, z)) - 0.07, z], [0, x * 3, 0], { color: VG.gold, scale: [r, r * 0.42, r * 0.85] });
  for (let i = 0; i < 34; i++) {
    const a = rng() * TAU;
    const r = 0.55 + rng() * 0.8;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    coin(c, [x, heapY(r) + 0.012, z], (rng() - 0.5) * 0.5, rng() * TAU, i % 3 ? VG.gold : VG.gold2);
  }
  // Two iron-bound chests half sunk in the heap; the nearer open, spilling gold
  const chestAt = (x: number, z: number, ry: number, open: boolean) =>
    c.k.at([x, heapY(Math.hypot(x, z)) - 0.1, z], ry, () => {
      c.k.add("matte", new THREE.BoxGeometry(0.62, 0.36, 0.42), [0, 0.18, 0], undefined, { color: VG.chest, surf: { fn: (p) => [p.x / 0.5, p.y / 0.5, SURF.grain] } });
      for (const s of [-1, 1]) c.k.add("iron", new THREE.BoxGeometry(0.06, 0.46, 0.52), [s * 0.2, 0.18, 0], undefined, { color: VG.iron });
      c.k.add("gold", new THREE.BoxGeometry(0.1, 0.12, 0.05), [0, 0.28, 0.24], undefined, { color: VG.gold });
      c.k.frame([0, 0.36, -0.21], [open ? -1.9 : 0, 0, 0], 1, () => {
        c.k.add("matte", new THREE.CylinderGeometry(0.21, 0.21, 0.62, 12, 1, false, 0, Math.PI), [0, 0, 0.21], [0, 0, Math.PI / 2], { color: VG.chest });
        for (const s of [-1, 1]) c.k.add("iron", new THREE.TorusGeometry(0.215, 0.022, 4, 10, Math.PI), [s * 0.2, 0, 0.21], [0, Math.PI / 2, 0], { color: VG.iron });
      });
      if (open) {
        c.k.add("gold", new THREE.SphereGeometry(0.28, 12, 4, 0, TAU, 0, Math.PI / 2), [0, 0.34, 0], undefined, { color: VG.gold2, scale: [1, 0.45, 0.7] });
        gem(c, [0.1, 0.44, 0.05], 0.05, "#2563eb", [0.3, 0.4, 0]);
        gem(c, [-0.12, 0.42, -0.04], 0.045, "#16a34a", [0.2, 1, 0.4]);
      }
    });
  chestAt(0.88, 0.22, -0.55, true);
  chestAt(-0.82, -0.42, 0.5, false);
  // A goblet tipped over, gems lying loose, an unlucky rival's skull
  c.k.frame([-0.58, heapY(0.95) + 0.07, 0.76], [0.3, 0.5, Math.PI / 2 - 0.2], 1, () => {
    const cup = [0.08, 0.08, 0.02, 0.016, 0.016, 0.05, 0.08, 0.085].map((r, j) => new THREE.Vector2(r, [0, 0.02, 0.04, 0.09, 0.15, 0.18, 0.25, 0.3][j]));
    c.k.add("gold", new THREE.LatheGeometry(cup, 10), [0, -0.15, 0], undefined, { color: VG.gold });
  });
  gem(c, [1.1, heapY(1.12) + 0.04, -0.55], 0.06, "#dc2626", [0.4, 0, 0.2]);
  gem(c, [-1.12, heapY(1.18) + 0.04, 0.2], 0.055, "#7c3aed", [0.2, 0.6, 0.5]);
  gem(c, [0.15, heapY(1.0) + 0.04, -1.0], 0.05, "#0ea5e9", [0.1, 1.2, 0.3]);
  c.k.at([0.36, heapY(1.0) + 0.1, 0.94], 0.5, () => {
    blob(c, "matte", [0, 0.02, 0], [0.12, 0.11, 0.13], { color: VG.bone, wd: 10, hd: 7 });
    blob(c, "matte", [0, -0.06, 0.07], [0.08, 0.04, 0.06], { color: VG.bone2, wd: 8, hd: 5 });
    for (const s of [-1, 1]) blob(c, "matte", [s * 0.045, 0.03, 0.105], [0.032, 0.03, 0.02], { color: VG.dark, wd: 6, hd: 4 });
  });
  // A sword driven into the heap
  c.k.frame([-0.3, heapY(1.0), -0.98], [0.25, 0.4, -0.15], 1, () => {
    c.k.add("iron", new THREE.BoxGeometry(0.06, 0.75, 0.015), [0, 0.2, 0], undefined, { color: VG.steel });
    c.k.add("gold", new THREE.BoxGeometry(0.26, 0.035, 0.035), [0, 0.6, 0], undefined, { color: VG.gold });
    seg(c, "matte", [0, 0.62, 0], [0, 0.8, 0], 0.02, 0.02, { color: VG.leather2, seg: 6, cap: false });
    blob(c, "gold", [0, 0.82, 0], [0.03, 0.03, 0.03], { color: VG.gold, wd: 6, hd: 4 });
  });
  // Rocks at its foot
  c.k.add("rock", rubble(0.18, 5), [1.25, 0.08, 0.75], undefined, { color: "#57534e" });
  c.k.add("rock", rubble(0.15, 7), [-1.3, 0.07, 0.62], undefined, { color: "#44403c" });
}

/** His war banner: a pole with a crossbar, a tattered crimson banner with a skull, a horned skull on top */
function warBanner(c: BossCtx) {
  const x = -0.85;
  const z = -0.75;
  const top = 3.9;
  c.k.add("matte", new THREE.CylinderGeometry(0.045, 0.055, top - 0.2, 8), [x, (top + 0.2) / 2, z], undefined, { color: VG.wood, surf: grainRound(0.05) });
  c.k.add("matte", new THREE.CylinderGeometry(0.03, 0.03, 1.15, 6), [x - 0.45, 3.55, z], [0, 0, Math.PI / 2], { color: VG.wood, surf: grainRound(0.03) });
  for (const s of [-1, 1]) c.k.add("iron", new THREE.ConeGeometry(0.04, 0.12, 6), [x - 0.45 + s * 0.62, 3.55, z], [0, 0, -s * Math.PI / 2], { color: VG.iron });
  const w = 0.92;
  const h = 1.3;
  const bx = x - 0.47;
  c.k.move({ kind: MOVE.flutter, pivot: [bx, 3.52, z], axis: [0, 0, 1], amp: 0.05, speed: 2.1 }, () => {
    c.k.add("cloth", new THREE.PlaneGeometry(w, h, 4, 8), [bx, 3.52 - h / 2, z], undefined, { color: VG.cloak, surf: cloth(w, h, true) });
    // A skull painted in bone on it, both faces
    for (const s of [-1, 1]) {
      c.k.add("matte", new THREE.CircleGeometry(0.17, 12), [bx, 3.05, z + s * 0.05], [0, s > 0 ? 0 : Math.PI, 0], { color: VG.bone, scale: [1, 1.1, 1] });
      c.k.add("matte", new THREE.PlaneGeometry(0.16, 0.1), [bx, 2.86, z + s * 0.05], [0, s > 0 ? 0 : Math.PI, 0], { color: VG.bone });
      for (const e of [-1, 1]) c.k.add("matte", new THREE.CircleGeometry(0.045, 8), [bx + e * 0.06, 3.05, z + s * 0.1], [0, s > 0 ? 0 : Math.PI, 0], { color: VG.dark });
    }
  });
  // A horned skull crowning the pole
  blob(c, "matte", [x, top + 0.1, z], [0.13, 0.12, 0.14], { color: VG.bone, wd: 10, hd: 7 });
  blob(c, "matte", [x, top + 0.02, z + 0.08], [0.08, 0.05, 0.07], { color: VG.bone2, wd: 8, hd: 5 });
  for (const s of [-1, 1]) {
    blob(c, "matte", [x + s * 0.05, top + 0.12, z + 0.11], [0.035, 0.032, 0.025], { color: VG.dark, wd: 6, hd: 4 });
    hook(c, "matte", [x + s * 0.1, top + 0.18, z], [s, 0.5, 0], [0, 0.3, 0.05], 0.04, 0.32, 4, { color: VG.bone2 });
  }
}

/** A henchman of his warband: hooded, cloaked, a weapon in his right fist. Bones: `${n}` (his body from the hips), `${n}h`, `${n}a` */
type HenchWeapon = "axe" | "spear" | "torch" | "crossbow";
function henchman(c: BossCtx, n: string, at: V3, ry: number, cloakColor: string, weapon: HenchWeapon) {
  c.k.at(at, ry, () => {
    for (const s of [1, -1]) {
      seg(c, "matte", [s * 0.1, 0.74, 0], [s * 0.11, 0.13, 0.02], 0.075, 0.06, { color: VG.trousers, seg: 7 });
      blob(c, "matte", [s * 0.11, 0.07, 0.06], [0.065, 0.06, 0.11], { color: VG.leather2, wd: 8, hd: 5 });
    }
    c.bone(n, [0, 0.74, 0], () => {
      blob(c, "matte", [0, 0.8, 0], [0.17, 0.12, 0.13], { color: VG.leather, wd: 10, hd: 6 });
      blob(c, "matte", [0, 1.04, 0], [0.2, 0.25, 0.15], { color: VG.leather, wd: 10, hd: 7 });
      c.k.add("matte", new THREE.TorusGeometry(0.17, 0.03, 4, 14), [0, 0.86, 0], [Math.PI / 2, 0, 0], { color: VG.leather2 });
      c.k.add("gold", new THREE.BoxGeometry(0.07, 0.06, 0.03), [0, 0.86, 0.19], undefined, { color: VG.gold });
      // A cloak hanging from the shoulders, open at the front, ragged at its hem
      c.k.add("cloth", new THREE.CylinderGeometry(0.22, 0.31, 0.85, 12, 1, true, 0.7, TAU - 1.4), [0, 0.86, -0.01], undefined, {
        color: cloakColor,
        surf: { fn: (p) => [thetaOf(p.x, p.z) * 2, p.y / 0.85 + 0.5, SURF.tatters] }
      });
      // The left arm hanging in the cloak
      seg(c, "matte", [-0.2, 1.2, 0], [-0.24, 0.97, 0.03], 0.055, 0.048, { color: VG.leather2, seg: 6 });
      seg(c, "matte", [-0.24, 0.97, 0.03], [-0.22, 0.8, 0.12], 0.048, 0.04, { color: VG.leather2, seg: 6 });
      blob(c, "matte", [-0.22, 0.78, 0.13], [0.045, 0.05, 0.05], { color: VG.skin, wd: 6, hd: 5 });
      c.bone(`${n}h`, [0, 1.3, 0], () => {
        blob(c, "matte", [0, 1.42, 0.01], [0.12, 0.13, 0.12], { color: VG.skin, wd: 10, hd: 8 });
        c.k.add("cloth", new THREE.SphereGeometry(1, 12, 7, Math.PI / 2 + 0.8, TAU - 1.6, 0, Math.PI * 0.62), [0, 1.44, -0.005], undefined, { color: cloakColor, scale: [0.155, 0.17, 0.16] });
        c.k.add("cloth", new THREE.ConeGeometry(0.06, 0.16, 6), [0, 1.6, -0.1], [-0.7, 0, 0], { color: cloakColor });
        blob(c, "matte", [0, 1.365, 0.08], [0.11, 0.05, 0.06], { color: VG.dark, wd: 8, hd: 5 });
        for (const s of [1, -1]) c.k.add("glow", new THREE.SphereGeometry(0.018, 6, 4), [s * 0.04, 1.445, 0.118], undefined, { color: VG.eye, bright: 2, scale: [1.3, 0.7, 0.7] });
      });
      const sh: V3 = [0.2, 1.2, 0];
      const el: V3 = [0.25, 0.98, 0.05];
      const wr: V3 = [0.26, 0.9, 0.25];
      c.bone(`${n}a`, sh, () => {
        seg(c, "matte", sh, el, 0.055, 0.048, { color: VG.leather2, seg: 6 });
        seg(c, "matte", el, wr, 0.048, 0.04, { color: VG.leather2, seg: 6 });
        blob(c, "matte", wr, [0.048, 0.052, 0.055], { color: VG.skin, wd: 7, hd: 5 });
        if (weapon === "axe") {
          seg(c, "matte", add(wr, [0, -0.22, -0.02]), add(wr, [0, 0.55, 0.12]), 0.022, 0.02, { color: VG.wood, seg: 6, cap: false });
          c.k.frame(add(wr, [0, 0.48, 0.11]), [0.15, 0, 0], 1, () => {
            c.k.add("iron", new THREE.BoxGeometry(0.03, 0.08, 0.14), [0, 0, 0.07], undefined, { color: VG.iron });
            c.k.add("iron", new THREE.CylinderGeometry(0.14, 0.14, 0.02, 10, 1, false, Math.PI / 2 - 0.9, 1.8), [0, 0, 0.12], [0, 0, Math.PI / 2], { color: VG.steel });
          });
        } else if (weapon === "spear") {
          seg(c, "matte", add(wr, [0, -0.82, -0.04]), add(wr, [0, 1.15, 0.06]), 0.02, 0.018, { color: VG.wood, seg: 6, cap: false });
          c.k.add("iron", new THREE.OctahedronGeometry(0.06), add(wr, [0, 1.27, 0.065]), undefined, { color: VG.steel, scale: [0.6, 2.4, 0.25] });
          c.k.add("matte", new THREE.TorusGeometry(0.03, 0.012, 4, 8), add(wr, [0, 1.12, 0.058]), [Math.PI / 2, 0, 0], { color: VG.cloak });
        } else if (weapon === "torch") {
          const tip = add(wr, [0, 0.42, 0.05]);
          seg(c, "matte", add(wr, [0, -0.14, -0.01]), tip, 0.024, 0.03, { color: VG.wood, seg: 6, cap: false });
          c.k.add("iron", new THREE.CylinderGeometry(0.055, 0.035, 0.08, 8, 1, true), add(tip, [0, 0.02, 0]), undefined, { color: VG.iron });
          c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 7, pivot: tip }, () => {
            c.k.add("glow", new THREE.ConeGeometry(0.06, 0.24, 7), add(tip, [0, 0.15, 0]), undefined, { color: "#f97316", bright: 1.8 });
            c.k.add("glow", new THREE.ConeGeometry(0.035, 0.15, 6), add(tip, [0, 0.12, 0.0]), undefined, { color: "#fde047", bright: 2.2 });
          });
          c.spark(SPARK.flame, add(tip, [0, 0.08, 0]), 8, { color: "#fb923c", size: 0.16, speed: 1.3, rise: 0.35, reach: 0.04 });
          c.spark(SPARK.smoke, add(tip, [0, 0.35, 0]), 6, { color: "#3f3f46", size: 0.35, speed: 0.12, rise: 1.4, reach: 0.4 });
        } else {
          // A crossbow at the hip: stock, bow, string and a bolt laid in it
          c.k.add("matte", new THREE.BoxGeometry(0.06, 0.06, 0.52), add(wr, [0, 0.02, 0.18]), undefined, { color: VG.wood });
          c.k.add("iron", new THREE.TorusGeometry(0.24, 0.016, 4, 12, Math.PI * 0.8), add(wr, [0, 0.05, 0.38]), [Math.PI / 2, 0, Math.PI * 1.1], { color: VG.iron });
          seg(c, "matte", add(wr, [-0.23, 0.05, 0.31]), add(wr, [0.23, 0.05, 0.31]), 0.006, 0.006, { color: VG.bone2, seg: 4, cap: false });
          seg(c, "matte", add(wr, [0, 0.07, 0.04]), add(wr, [0, 0.07, 0.48]), 0.008, 0.008, { color: VG.wood, seg: 4, cap: false });
          c.k.add("iron", new THREE.ConeGeometry(0.02, 0.06, 4), add(wr, [0, 0.07, 0.51]), [Math.PI / 2, 0, 0], { color: VG.steel });
        }
      });
    });
  });
}

/** His war hound: a scarred black mastiff in a spiked collar. Bones: `hound`, its legs, `hneck`, `hhead`, `hjaw`, `htail0…3` */
const HT = 4;
function warHound(c: BossCtx, at: V3, ry: number) {
  const fur = { color: VG.hound, surf: { fn: () => [0, 0, SURF.fur] as V3 } };
  c.k.at(at, ry, () => {
    c.bone("hound", [0, 0.58, 0], () => {
      blob(c, "fur", [0, 0.6, 0.02], [0.2, 0.2, 0.42], { color: VG.hound, wd: 12, hd: 8 });
      blob(c, "fur", [0, 0.62, 0.3], [0.22, 0.24, 0.2], { color: VG.hound, wd: 12, hd: 8 });
      blob(c, "fur", [0, 0.6, -0.3], [0.19, 0.19, 0.18], { color: VG.hound2, wd: 10, hd: 7 });
      // Its legs: shoulder to paw in front, hip to hock to paw behind
      const legs: Array<{ n: string; pts: V3[] }> = [
        { n: "hlFR", pts: [[0.12, 0.55, 0.34], [0.13, 0.28, 0.36], [0.13, 0.05, 0.38]] },
        { n: "hlFL", pts: [[-0.12, 0.55, 0.34], [-0.13, 0.28, 0.33], [-0.13, 0.05, 0.36]] },
        { n: "hlHR", pts: [[0.12, 0.56, -0.32], [0.14, 0.3, -0.44], [0.13, 0.05, -0.38]] },
        { n: "hlHL", pts: [[-0.12, 0.56, -0.32], [-0.14, 0.3, -0.42], [-0.13, 0.05, -0.36]] }
      ];
      for (const l of legs) {
        c.bone(l.n, l.pts[0], () => {
          seg(c, "fur", l.pts[0], l.pts[1], 0.08, 0.05, { ...fur, seg: 7 });
          seg(c, "fur", l.pts[1], l.pts[2], 0.05, 0.04, { ...fur, seg: 6 });
          blob(c, "fur", add(l.pts[2], [0, -0.01, 0.04]), [0.055, 0.035, 0.075], { color: VG.hound2, wd: 7, hd: 4 });
        });
      }
      c.bone("hneck", [0, 0.7, 0.42], () => {
        seg(c, "fur", [0, 0.7, 0.42], [0, 0.84, 0.58], 0.14, 0.1, { ...fur, seg: 9 });
        // A spiked iron collar
        c.k.add("iron", new THREE.TorusGeometry(0.13, 0.024, 4, 14), [0, 0.76, 0.48], [0.7, 0, 0], { color: VG.iron });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          const d: V3 = [Math.sin(a), Math.cos(a) * Math.cos(0.7), -Math.cos(a) * Math.sin(0.7)];
          spike(c, "iron", add([0, 0.76, 0.48], d, 0.14), d, 0.018, 0.07, { color: VG.steel, seg: 4 });
        }
        c.bone("hhead", [0, 0.84, 0.58], () => {
          blob(c, "fur", [0, 0.88, 0.64], [0.13, 0.12, 0.15], { color: VG.hound, wd: 12, hd: 8 });
          blob(c, "fur", [0, 0.84, 0.79], [0.075, 0.07, 0.13], { color: VG.hound2, wd: 10, hd: 6 });
          blob(c, "gloss", [0, 0.87, 0.915], [0.03, 0.022, 0.02], { color: "#0a0a0a", wd: 6, hd: 4 });
          for (const s of [1, -1]) {
            c.k.add("glow", new THREE.SphereGeometry(0.018, 6, 4), [s * 0.065, 0.92, 0.75], undefined, { color: VG.eye, bright: 2.2 });
            c.k.add("fur", new THREE.ConeGeometry(0.045, 0.13, 5), [s * 0.085, 0.99, 0.6], [-0.5, 0, -s * 0.35], { color: VG.hound2, scale: [1, 1, 0.5] });
          }
          c.bone("hjaw", [0, 0.81, 0.68], () => {
            blob(c, "fur", [0, 0.79, 0.79], [0.06, 0.03, 0.12], { color: VG.hound2, wd: 8, hd: 5 });
            for (const s of [1, -1]) spike(c, "matte", [s * 0.035, 0.8, 0.87], [0, 1, 0.1], 0.01, 0.04, { color: VG.bone, seg: 4 });
          });
        });
      });
      c.k.at([0, 0.66, -0.46], Math.PI, () =>
        chainBones(c, "htail", [0, 0, 0], [0.13, 0.13, 0.12, 0.1], [-0.7, -0.35, 0.05, 0.3], [0.05, 0.045, 0.038, 0.03, 0.012], { bucket: "fur", ...fur, seg: 6 })
      );
    });
  });
}

/** A crow circling him (bones `crow${i}`, `crow${i}L` / `R`), built at the middle of its circle, facing +z */
const CROWS = 3;
const CROW_Y = 4.25;
function crow(c: BossCtx, i: number) {
  const o: V3 = [0, CROW_Y, 0];
  c.bone(`crow${i}`, o, () => {
    blob(c, "matte", o, [0.065, 0.065, 0.15], { color: VG.crow, wd: 8, hd: 6 });
    blob(c, "matte", add(o, [0, 0.03, 0.15]), [0.05, 0.05, 0.055], { color: VG.crow, wd: 8, hd: 5 });
    spike(c, "matte", add(o, [0, 0.025, 0.19]), [0, -0.15, 1], 0.018, 0.07, { color: "#3f3f46", seg: 4 });
    for (const s of [1, -1]) c.k.add("glow", new THREE.SphereGeometry(0.008, 4, 3), add(o, [s * 0.03, 0.045, 0.18]), undefined, { color: "#fbbf24", bright: 1.6 });
    plate(c, "matte", add(o, [0, 0.0, -0.2]), [0, 1, 0], [0, 0, -1], 0.06, 0.01, 0.1, { color: VG.crow, wd: 6 });
    for (const s of [1, -1]) {
      c.bone(`crow${i}${sideOf(s)}`, add(o, [s * 0.05, 0.02, 0.02]), () => {
        plate(c, "matte", add(o, [s * 0.2, 0.02, 0.0]), [0, 1, 0], [s, 0, -0.25], 0.07, 0.008, 0.17, { color: VG.crow, wd: 6 });
        for (let f = 0; f < 3; f++) plate(c, "matte", add(o, [s * (0.34 + f * 0.015), 0.02, -0.05 - f * 0.04]), [0, 1, 0], [s, 0, -0.5 - f * 0.25], 0.025, 0.006, 0.09, { color: "#222228", wd: 5 });
      });
    }
  });
}

const VG_SH = 0.42;
function vargoArm(c: BossCtx, s: number) {
  const S = sideOf(s);
  const sh: V3 = [s * VG_SH, 2.6, 0.0];
  const el: V3 = [s * 0.54, 2.17, 0.1];
  const wr: V3 = [s * 0.6, 1.82, 0.32];
  c.bone(`arm${S}`, sh, () => {
    seg(c, "matte", sh, el, 0.1, 0.088, { color: VG.leather2, seg: 9 });
    blob(c, "iron", el, [0.095, 0.08, 0.095], { color: VG.iron, wd: 8, hd: 6 });
    c.bone(`fore${S}`, el, () => {
      seg(c, "matte", el, wr, 0.085, 0.07, { color: VG.leather2, seg: 9 });
      c.k.add("iron", new THREE.CylinderGeometry(0.095, 0.105, 0.22, 10), mid(el, wr, 0.6), undefined, { color: VG.iron, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...sub(wr, el)).normalize()) });
      c.bone(`hand${S}`, wr, () => {
        blob(c, "matte", wr, [0.075, 0.08, 0.085], { color: VG.leather, wd: 9, hd: 7 });
        saber(c, wr, [s * 0.12, -0.15, 1], [0, 1, 0]);
      });
    });
  });
}

function vargoHead(c: BossCtx) {
  c.bone("head", [0, 2.72, 0.02], () => {
    seg(c, "matte", [0, 2.66, 0.0], [0, 2.84, 0.02], 0.1, 0.09, { color: VG.dark, seg: 8 });
    // The face inside the hood is shadow; over it, a bone mask: a skull's brow and sockets with red eyes burning, teeth, two black fangs
    blob(c, "matte", [0, 2.97, 0.0], [0.17, 0.2, 0.18], { color: VG.dark, wd: 12, hd: 8 });
    blob(c, "matte", [0, 2.97, 0.13], [0.15, 0.18, 0.1], { color: VG.bone, wd: 14, hd: 10 });
    blob(c, "matte", [0, 3.05, 0.2], [0.13, 0.035, 0.05], { color: VG.bone2, wd: 10, hd: 5 });
    for (const s of [1, -1]) {
      blob(c, "matte", [s * 0.062, 3.0, 0.205], [0.045, 0.04, 0.03], { color: VG.dark, wd: 8, hd: 5 });
      c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 2.1, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.022, 6, 4), [s * 0.062, 3.0, 0.225], undefined, { color: VG.eye, bright: 2.6, scale: [1.3, 0.8, 0.6] }));
      blob(c, "matte", [s * 0.1, 2.92, 0.17], [0.04, 0.03, 0.05], { color: VG.bone2, wd: 6, hd: 4 });
      hook(c, "gloss", [s * 0.055, 2.86, 0.2], [s * 0.2, -1, 0.3], [0, 0.15, 0.1], 0.018, 0.11, 3, { color: VG.dark });
    }
    spike(c, "matte", [0, 2.94, 0.225], [0, -1, 0.3], 0.02, 0.04, { color: VG.dark, seg: 4 });
    for (let i = 0; i < 6; i++) c.k.add("matte", new THREE.BoxGeometry(0.018, 0.03, 0.02), [(i - 2.5) * 0.022, 2.865, 0.2 - Math.abs(i - 2.5) * 0.006], undefined, { color: VG.bone });
    // His hood, open at the face, and a stolen crown worn askew on it
    c.k.add("cloth", new THREE.SphereGeometry(1, 14, 9, Math.PI / 2 + 0.8, TAU - 1.6, 0, Math.PI * 0.64), [0, 2.98, -0.01], undefined, { color: VG.cloak, scale: [0.25, 0.29, 0.26] });
    c.k.frame([0.03, 3.19, -0.01], [0.1, 0, 0.22], 1, () => crown(c, [0, 0, 0], 0.6, VG.gold, VG.velvet));
  });
}

function vargo(c: BossCtx) {
  plunder(c);
  warBanner(c);
  // His legs, planted apart on the heap (left foot forward), each from hip to knee to boot
  for (const s of [1, -1]) {
    const S = sideOf(s);
    const fz = s > 0 ? -0.06 : 0.14;
    const hip: V3 = [s * 0.17, 1.72, 0];
    const knee: V3 = [s * 0.22, 1.12, 0.05 + fz * 0.5];
    const ankle: V3 = [s * 0.25, 0.6, fz];
    c.bone(`thigh${S}`, hip, () => {
      seg(c, "matte", hip, knee, 0.12, 0.1, { color: VG.trousers, seg: 9 });
      c.bone(`shin${S}`, knee, () => {
        blob(c, "iron", add(knee, [0, 0.01, 0.06]), [0.075, 0.07, 0.05], { color: VG.iron, wd: 8, hd: 6 });
        seg(c, "matte", knee, ankle, 0.1, 0.085, { color: VG.leather2, seg: 9 });
        c.k.add("matte", new THREE.TorusGeometry(0.11, 0.03, 5, 12), add(knee, [0, -0.12, 0]), [Math.PI / 2, 0, 0], { color: VG.leather });
        blob(c, "matte", [ankle[0], 0.55, ankle[2] + 0.08], [0.1, 0.075, 0.19], { color: VG.leather2, wd: 10, hd: 6 });
      });
    });
  }
  c.bone("hips", [0, 1.72, 0], () => {
    blob(c, "matte", [0, 1.73, 0], [0.31, 0.2, 0.24], { color: VG.leather, wd: 12, hd: 7 });
    c.k.add("matte", new THREE.TorusGeometry(0.3, 0.045, 5, 18), [0, 1.85, 0], [Math.PI / 2, 0, 0], { color: VG.leather2, scale: [1, 0.86, 1] });
    c.k.add("gold", new THREE.BoxGeometry(0.12, 0.1, 0.03), [0, 1.85, 0.3], undefined, { color: VG.gold });
    // Tassets of studded leather, and a second stolen crown hung at his belt
    for (const a of [-0.75, 0, 0.75]) {
      const o: V3 = [Math.sin(a), 0.1, Math.cos(a)];
      const at: V3 = [Math.sin(a) * 0.31, 1.55, Math.cos(a) * 0.26];
      plate(c, "matte", at, o, [0, -1, 0.05], 0.13, 0.025, 0.19, { color: VG.leather2 });
      stud(c, "gold", add(at, o, 0.03), o, 0.022, 0.012, { color: VG.gold });
    }
    seg(c, "iron", [-0.3, 1.82, 0.12], [-0.36, 1.58, 0.17], 0.01, 0.01, { color: VG.iron, seg: 4, cap: false });
    c.k.frame([-0.38, 1.44, 0.18], [0.3, 0.4, 0.5], 1, () => crown(c, [0, 0, 0], 0.32, VG.gold, VG.velvet));
    // Two empty scabbards at his hips
    for (const s of [1, -1]) c.k.along("matte", [s * 0.3, 1.8, -0.12], [s * 0.42, 1.0, -0.5], [0.05, 0.1], { color: VG.leather });
    c.bone("chest", [0, 1.9, 0], () => {
      seg(c, "matte", [0, 1.84, 0], [0, 2.18, 0.02], 0.27, 0.31, { color: VG.leather, seg: 12, cap: false });
      blob(c, "matte", [0, 2.32, 0.02], [0.37, 0.36, 0.27], { color: VG.leather, wd: 14, hd: 10 });
      // Brigandine: rows of gold studs over the chest
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 5; k++) {
          const { p, n } = onBlob([0, 2.32, 0.02], [0.37, 0.36, 0.27], [0, 0, 0], [(k - 2) * 0.32, 0.35 - r * 0.32, 1]);
          stud(c, "gold", p, n, 0.022, 0.012, { color: VG.gold });
        }
      // A fur mantle round his shoulders, spiked iron pauldrons over it
      c.k.add("fur", new THREE.TorusGeometry(0.3, 0.12, 6, 18), [0, 2.6, -0.02], [Math.PI / 2, 0, 0], { color: VG.fur, scale: [1.3, 1.05, 1.3] });
      for (const s of [1, -1]) {
        blob(c, "iron", [s * 0.43, 2.65, 0.0], [0.17, 0.12, 0.19], { color: VG.iron, wd: 10, hd: 7 });
        spike(c, "iron", [s * 0.5, 2.73, 0.0], [s * 0.45, 1, 0], 0.045, 0.24, { color: VG.steel, seg: 6 });
      }
      cloak(
        c,
        "cloak",
        [
          { y: 2.62, R: 0.42, zc: 0.02 },
          { y: 2.0, R: 0.5, zc: -0.05 },
          { y: 1.3, R: 0.56, zc: -0.12 },
          { y: 0.6, R: 0.62, zc: -0.22 }
        ],
        VG.cloak,
        true
      );
      vargoArm(c, 1);
      vargoArm(c, -1);
      vargoHead(c);
    });
  });
  henchman(c, "h0", [1.95, 0, 0.85], 0.35, "#7f1d1d", "axe");
  henchman(c, "h1", [-1.95, 0, 0.85], -0.35, "#3f1d0b", "spear");
  henchman(c, "h2", [1.75, 0, -1.15], 0.9, "#3f1d0b", "torch");
  henchman(c, "h3", [-1.7, 0, -1.2], -0.9, "#7f1d1d", "crossbow");
  warHound(c, [0.5, 0, 1.85], 0.1);
  for (let i = 0; i < CROWS; i++) crow(c, i);
}

const VG_HENCH = ["h0", "h1", "h2", "h3"];
const henchPose = (body: BonePose, head: BonePose, arm: BonePose): Pose => merge(...VG_HENCH.map((n) => ({ [n]: body, [`${n}h`]: head, [`${n}a`]: arm })));
const houndTail = (f: (j: number) => BonePose | null): Pose => chainPose("htail", HT, f);

function vargoIdle(c: IdleCtx) {
  // He breathes, shifts his weight from foot to foot, glances round; sabers loose in his fists
  const breath = c.sin(1.1);
  const shift = c.drift(0.32);
  c.add("hips", [0.02 * c.drift(0.25, 1), 0.05 * c.drift(0.2, 2), -0.04 * shift], [0.035 * shift, 0.01 * breath, 0]);
  for (const S of ["L", "R"]) {
    c.add(`thigh${S}`, [0, 0, 0.035 * shift]);
    c.add(`shin${S}`, [0, 0, -0.035 * shift]);
  }
  c.add("chest", [0.02 * breath + 0.03 * c.drift(0.3, 2), 0.08 * c.drift(0.22, 3), 0.045 * shift], null, 0.012 * breath);
  c.add("head", [0.05 * c.drift(0.4), 0.35 * c.glance(1, 4.2, 0.3), 0.06 * c.drift(0.3, 1)]);
  c.add("armR", [0.05 * c.drift(0.45, 1), 0, 0.03 * c.drift(0.37)]);
  c.add("armL", [0.06 * c.drift(0.4, 3), 0, -0.04 * c.drift(0.33, 2)]);
  c.add("handR", [0.1 * c.drift(0.6, 2), 0, 0.08 * c.drift(0.5)]);
  c.add("handL", [0.1 * c.drift(0.55, 4), 0, 0.06 * c.drift(0.45, 1)]);
  // Now and then he flourishes his right saber, or rests the left on his shoulder
  const flourish = c.event(2, 9, 1.6).e;
  c.add("armR", [-0.35 * flourish, 0, 0.15 * flourish]);
  c.add("foreR", [-0.6 * flourish, 0, 0]);
  c.add("handR", [-1.3 * flourish, 0, 0.4 * flourish]);
  const rest = c.event(3, 12, 3).e;
  c.add("armL", [-0.9 * rest, 0, 0.25 * rest]);
  c.add("foreL", [-1.5 * rest, 0, 0]);
  c.add("handL", [-1.1 * rest, 0, 0]);
  // The cloak stirs in the wind
  for (let j = 0; j < 3; j++) c.add(`cloak${j}`, [0.05 * Math.sin(c.t * 1.3 - j * 0.9) + 0.03 * c.drift(0.6, j) - 0.03 * (j + 1), 0, 0.04 * Math.sin(c.t * 0.9 - j * 0.7 + 1)]);
  // The warband shifts on its feet and looks round, each on its own
  VG_HENCH.forEach((n, i) => {
    c.add(n, [0.03 * c.drift(0.5, i), 0.07 * c.drift(0.3, i * 2), 0.025 * c.drift(0.4, i + 3)], null, 0.015 * c.sin(1.4, i));
    c.add(`${n}h`, [0.06 * c.drift(0.45, i), 0.45 * c.glance(10 + i, 3.6 + i * 0.7, 0.3), 0]);
    c.add(`${n}a`, [0.08 * c.drift(0.5, i + 1), 0, 0.04 * c.drift(0.4, i)]);
  });
  // The hound pants, sniffs the ground, looks round, wags
  c.add("hound", [0.02 * c.drift(0.4), 0.05 * c.drift(0.25, 1), 0], [0, 0.01 * c.sin(4.5), 0], 0.02 * c.sin(4.5));
  const sniff = c.event(5, 7, 2).e;
  c.add("hneck", [0.5 * sniff + 0.04 * c.drift(0.5), 0.15 * c.glance(6, 3.2, 0.25), 0]);
  c.add("hhead", [0.25 * sniff, 0.35 * c.glance(7, 2.8, 0.2), 0.08 * c.drift(0.6)]);
  c.add("hjaw", [0.12 + 0.06 * c.sin(4.5), 0, 0]);
  const wag = 0.4 + 0.6 * c.event(8, 6, 2.5).e;
  for (let j = 0; j < HT; j++) c.add(`htail${j}`, [0, wag * 0.35 * Math.sin(c.t * 6 - j * 0.8), 0]);
  crowFlight(c);
}

/** The crows circle him on drifting paths, beating and gliding; while he acts they wheel wider */
function crowFlight(c: IdleCtx) {
  for (let i = 0; i < CROWS; i++) {
    const R = 1.5 + 0.25 * Math.sin(c.t * 0.31 + i * 2) + 0.7 * c.busy;
    const sp = 0.55 + i * 0.13;
    const at = (t: number) => {
      const a = t * sp + i * 2.1 + c.seed * 3;
      return { x: R * Math.sin(a) + 0.25 * Math.sin(2.3 * a + i), z: R * Math.cos(a) * 0.85, y: 0.28 * Math.sin(a * 1.7 + i) + i * 0.22 + 0.4 * c.busy };
    };
    const dt = 0.08;
    const p0 = at(c.t - dt);
    const p1 = at(c.t);
    const p2 = at(c.t + dt);
    const h = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.atan2(b.x - a.x, b.z - a.z);
    let turn = h(p1, p2) - h(p0, p1);
    turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / dt;
    c.carry(`crow${i}`, [-(p2.y - p0.y) * 0.8, h(p0, p2), -0.35 * turn], [p1.x, p1.y, p1.z]);
    const glide = c.event(20 + i, 5, 2).e;
    const w = Math.sin(c.t * (9 + i) + i * 2) * (1 - 0.85 * glide);
    c.carry(`crow${i}R`, [0, 0, 0.65 * w + 0.05 * glide]);
    c.carry(`crow${i}L`, [0, 0, -0.65 * w - 0.05 * glide]);
  }
}

const VG_DEF: BossHeroDef = {
  build: vargo,
  // Turned a little off true, the right saber low and loose, the left carried higher: never mirrored
  rest: {
    hips: { r: [0, 0.1, 0] },
    chest: { r: [0.04, -0.12, 0.02] },
    head: { r: [0.08, 0.1, -0.05] },
    armR: { r: [-0.1, 0, 0.12] },
    foreR: { r: [-0.35, 0, 0] },
    handR: { r: [0.55, 0, 0.1] },
    armL: { r: [-0.2, 0, -0.18] },
    foreL: { r: [-0.5, 0, 0] },
    handL: { r: [0.3, 0, -0.15] },
    thighL: { r: [-0.08, 0, 0] },
    shinL: { r: [0.1, 0, 0] },
    hneck: { r: [0.1, 0, 0] }
  },
  idle: vargoIdle,
  roar: {
    len: 3.0,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // A crouch, gathering breath, blades low
      {
        t: 0.22,
        hold: true,
        pose: merge(
          { hips: { p: [0, -0.1, 0] }, thighL: { r: [-0.25, 0, 0] }, shinL: { r: [0.35, 0, 0] }, thighR: { r: [-0.2, 0, 0] }, shinR: { r: [0.3, 0, 0] }, chest: { r: [0.25, 0, 0] }, head: { r: [0.25, 0, 0] }, armR: { r: [0.2, 0, 0.25] }, armL: { r: [0.2, 0, -0.25] } },
          henchPose({ r: [0.1, 0, 0] }, { r: [0.15, 0, 0] }, { r: [0.2, 0, 0] }),
          { hneck: { r: [0.3, 0, 0] } }
        )
      },
      // The war cry: both sabers flung up high, head back, eyes blazing; the warband raises its weapons, the hound howls
      {
        t: 0.42,
        pose: merge(
          { hips: { p: [0, 0.04, 0] }, chest: { r: [-0.25, 0, 0] }, head: { r: [-0.45, 0, 0], g: 1.6 }, armR: { r: [-2.95, 0, 0.2] }, foreR: { r: [0.3, 0, 0] }, handR: { r: [0.35, 0, 0] }, armL: { r: [-2.9, 0, -0.24] }, foreL: { r: [0.45, 0, 0] }, handL: { r: [0.45, 0, 0] } },
          henchPose({ r: [-0.12, 0, 0] }, { r: [-0.35, 0, 0] }, { r: [-2.1, 0, 0.2] }),
          { hneck: { r: [-0.7, 0, 0] }, hhead: { r: [-0.45, 0, 0] }, hjaw: { r: [0.5, 0, 0] } },
          houndTail(() => ({ r: [-0.25, 0, 0] }))
        )
      },
      {
        t: 0.74,
        hold: true,
        pose: merge(
          { hips: { p: [0, 0.03, 0] }, chest: { r: [-0.22, 0.04, 0] }, head: { r: [-0.4, 0.05, 0], g: 1.2 }, armR: { r: [-2.9, 0, 0.18] }, foreR: { r: [0.25, 0, 0] }, handR: { r: [0.3, 0, 0] }, armL: { r: [-2.85, 0, -0.22] }, foreL: { r: [0.4, 0, 0] }, handL: { r: [0.4, 0, 0] } },
          henchPose({ r: [-0.1, 0, 0] }, { r: [-0.3, 0, 0] }, { r: [-2.0, 0, 0.2] }),
          { hneck: { r: [-0.65, 0, 0] }, hhead: { r: [-0.4, 0, 0] }, hjaw: { r: [0.45, 0, 0] } }
        )
      },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.07, vig: 0.65, vigCol: "#450a0a", lines: 0.85, flash: 0.25, flashCol: "#fecaca" } }]
  },
  attack: {
    len: 2.6,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Weight back on the rear foot, both sabers drawn up behind his head
      {
        t: 0.3,
        pose: merge(
          { hips: { p: [0, -0.06, -0.12], r: [0, 0.12, 0] }, thighR: { r: [-0.15, 0, 0] }, shinR: { r: [0.3, 0, 0] }, chest: { r: [-0.18, 0.1, 0] }, head: { r: [0.12, -0.1, 0] }, armR: { r: [-2.85, 0, 0.25] }, foreR: { r: [-0.9, 0, 0] }, handR: { r: [-0.5, 0, 0] }, armL: { r: [-2.75, 0, -0.28] }, foreL: { r: [-0.9, 0, 0] }, handL: { r: [-0.5, 0, 0] } },
          henchPose({ r: [-0.08, 0, 0] }, {}, { r: [0.35, 0, 0] }),
          { hound: { p: [0, -0.1, -0.1], r: [0.1, 0, 0] }, hneck: { r: [0.25, 0, 0] }, hjaw: { r: [0.35, 0, 0] } }
        )
      },
      {
        t: 0.44,
        hold: true,
        pose: merge(
          { hips: { p: [0, -0.08, -0.15], r: [0, 0.15, 0] }, thighR: { r: [-0.18, 0, 0] }, shinR: { r: [0.35, 0, 0] }, chest: { r: [-0.22, 0.12, 0] }, head: { r: [0.15, -0.12, 0] }, armR: { r: [-3.0, 0, 0.28] }, foreR: { r: [-1.0, 0, 0] }, handR: { r: [-0.6, 0, 0] }, armL: { r: [-2.9, 0, -0.3] }, foreL: { r: [-1.0, 0, 0] }, handL: { r: [-0.6, 0, 0] } },
          henchPose({ r: [-0.1, 0, 0] }, {}, { r: [0.45, 0, 0] }),
          { hound: { p: [0, -0.12, -0.12], r: [0.12, 0, 0] }, hneck: { r: [0.3, 0, 0] }, hjaw: { r: [0.4, 0, 0] } }
        )
      },
      // He steps in and both blades cross down through an X; the warband lunges, the hound leaps
      {
        t: 0.56,
        pose: merge(
          { hips: { p: [0, -0.1, 0.24], r: [0, -0.05, 0] }, thighL: { r: [-0.55, 0, 0] }, shinL: { r: [0.45, 0, 0] }, thighR: { r: [0.3, 0, 0] }, shinR: { r: [0.15, 0, 0] }, chest: { r: [0.35, -0.05, 0], g: 0.5 }, head: { r: [-0.1, 0.05, 0] }, armR: { r: [-0.75, 0, -0.5] }, foreR: { r: [-0.15, 0, 0] }, handR: { r: [0.85, 0, 0] }, armL: { r: [-0.8, 0, 0.55] }, foreL: { r: [-0.15, 0, 0] }, handL: { r: [0.85, 0, 0] } },
          henchPose({ r: [0.3, 0, 0], p: [0, 0, 0.12] }, { r: [-0.1, 0, 0] }, { r: [-1.6, 0, 0] }),
          { hound: { p: [0, 0.32, 0.5], r: [-0.25, 0, 0] }, hlFR: { r: [-0.7, 0, 0] }, hlFL: { r: [-0.6, 0, 0] }, hlHR: { r: [0.6, 0, 0] }, hlHL: { r: [0.55, 0, 0] }, hneck: { r: [-0.15, 0, 0] }, hjaw: { r: [0.55, 0, 0] } }
        )
      },
      {
        t: 0.68,
        pose: merge(
          { hips: { p: [0, -0.12, 0.26], r: [0, -0.08, 0] }, thighL: { r: [-0.58, 0, 0] }, shinL: { r: [0.5, 0, 0] }, thighR: { r: [0.32, 0, 0] }, shinR: { r: [0.18, 0, 0] }, chest: { r: [0.45, -0.08, 0] }, head: { r: [-0.15, 0.05, 0] }, armR: { r: [-0.35, 0, -0.75] }, foreR: { r: [-0.1, 0, 0] }, handR: { r: [1.15, 0, 0] }, armL: { r: [-0.4, 0, 0.8] }, foreL: { r: [-0.1, 0, 0] }, handL: { r: [1.15, 0, 0] } },
          henchPose({ r: [0.35, 0, 0], p: [0, 0, 0.14] }, { r: [-0.1, 0, 0] }, { r: [-1.2, 0, 0] }),
          { hound: { p: [0, 0.05, 0.62], r: [0.08, 0, 0] }, hlFR: { r: [-0.2, 0, 0] }, hlFL: { r: [-0.15, 0, 0] }, hjaw: { r: [0.1, 0, 0] } }
        )
      },
      {
        t: 0.86,
        hold: true,
        pose: merge({ hips: { p: [0, -0.03, 0.06] }, thighL: { r: [-0.15, 0, 0] }, shinL: { r: [0.12, 0, 0] }, chest: { r: [0.1, 0, 0] }, armR: { r: [-0.2, 0, -0.1] }, handR: { r: [0.3, 0, 0] }, armL: { r: [-0.2, 0, 0.1] }, handL: { r: [0.3, 0, 0] } }, { hound: { p: [0, 0, 0.3] } })
      },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.56, burst: true, cine: { quake: 0.18, stop: 0.08, flash: 0.45, flashCol: "#fecdd3", lines: 0.9, vig: 0.35, vigCol: "#450a0a" } }]
  },
  lag: {
    hips: 0.02,
    chest: 0.04,
    armR: 0.05,
    armL: 0.06,
    foreR: 0.05,
    foreL: 0.06,
    handR: 0.065,
    handL: 0.075,
    head: 0.07,
    ...chainLag("cloak", 3, 0.06, 0.06),
    ...Object.fromEntries(VG_HENCH.flatMap((n, i) => [[n, 0.06 + i * 0.03], [`${n}a`, 0.1 + i * 0.03]])),
    hound: 0.02,
    ...chainLag("htail", HT, 0.04, 0.05)
  },
  springs: { ...chainSprings("cloak", 3, 50), ...chainSprings("htail", HT, 70, 1) },
  burst: { at: [0, 1.0, 1.25], color: "#fda4af", count: 80, speed: 2.6, spread: 0.9, size: 0.16, gravity: 5 },
  aura: aura("#b91c1c", "#fde68a", 1.4, 2.6, 5.5),
  height: 4.6,
  frame: [10, 4.4, 1.9],
  sparks: (c) => {
    // Gold glinting on the heap, dust kicked up round it, a crow's feather drifting down now and then
    c.spark(SPARK.mote, [0, 0.55, 0], 18, { color: "#fde68a", size: 0.05, speed: 0.4, rise: 0.25, reach: 1.1, spread: 2.0 });
    c.spark(SPARK.smoke, [0, 0.2, 0], 8, { color: "#78716c", size: 0.6, speed: 0.08, rise: 0.8, reach: 1.8, spread: 4.0 });
    c.spark(SPARK.ember, [0, 4.6, 0], 6, { color: "#27272a", size: 0.07, speed: 0.12, rise: -3.6, reach: 1.4, spread: 2.4 });
  },
  actions: [
    { id: "idle", label: "Idle" },
    { id: "roar", label: "War cry" },
    { id: "attack", label: "Attack" }
  ]
};

/* ================================================================== */
/* Archmage of the Voidrift                                            */
/* ================================================================== */

const AM = {
  gold: "#e8b84a",
  gold2: "#c9922e",
  pale: "#fde68a",
  robe: "#d7a640",
  under: "#efe6cf",
  void: "#e879f9",
  pink: "#f0abfc",
  violet: "#a855f7",
  cape: "#3b0764",
  stole: "#4c1d95",
  beard: "#f3f1ec",
  dark: "#3a2208"
};
/** The over-robe's radius at height `y` (a cone from his waist to his hem) */
const robeR = (y: number) => 0.29 + (0.31 * (1.35 - y)) / 0.95;
const AM_BEARD = 3;
const AM_SHARDS = 5;

function archmageArm(c: BossCtx, s: number) {
  const S = sideOf(s);
  const sh: V3 = [s * 0.33, 1.84, 0];
  const el: V3 = [s * 0.5, 1.51, 0.07];
  const wr: V3 = [s * 0.54, 1.33, 0.33];
  c.bone(`arm${S}`, sh, () => {
    seg(c, "cloth", sh, el, 0.095, 0.085, { color: AM.robe, seg: 9 });
    c.bone(`fore${S}`, el, () => {
      // A bell sleeve flaring to a gold cuff
      c.k.along("cloth", el, wr, 0, { geo: new THREE.CylinderGeometry(0.15, 0.085, 1, 12, 1, true), color: AM.under });
      c.k.add("gold", new THREE.TorusGeometry(0.15, 0.02, 4, 14), wr, undefined, { color: AM.pale, quat: across(sub(wr, el)) });
      c.bone(`hand${S}`, wr, () => {
        if (s > 0) {
          // His fist round the crescent staff of ringed crystal
          blob(c, "gold", add(wr, [0, -0.02, 0.04]), [0.06, 0.07, 0.065], { color: AM.gold, wd: 9, hd: 7 });
          const bottom = add(wr, [0.03, -1.2, 0.02]);
          const top = add(wr, [-0.03, 1.55, -0.04]);
          seg(c, "gold", bottom, top, 0.026, 0.03, { color: AM.gold2, seg: 8, cap: false });
          for (let i = 0; i < 4; i++) c.k.add("gold", new THREE.TorusGeometry(0.038, 0.012, 4, 10), mid(bottom, top, 0.55 + i * 0.12), [Math.PI / 2, 0, 0], { color: AM.pale });
          c.k.add("gold", new THREE.ConeGeometry(0.035, 0.12, 6), add(bottom, [0, -0.04, 0]), [Math.PI, 0, 0], { color: AM.gold2 });
          // The crescent, its horns up round a floating void crystal ringed in gold
          c.k.add("gold", new THREE.TorusGeometry(0.22, 0.032, 6, 18, Math.PI * 1.25), add(top, [0, 0.19, 0]), [0, 0, -Math.PI * 1.125], { color: AM.gold });
          const cr = add(top, [0, 0.27, 0]);
          c.k.move({ kind: MOVE.bob, axis: [0, 1, 0], amp: 0.03, speed: 1.6 }, () => {
            c.k.add("glow", new THREE.OctahedronGeometry(0.075), cr, undefined, { color: AM.void, bright: 2, scale: [1, 1.9, 1] });
          });
          c.k.move({ kind: MOVE.spin, pivot: cr, axis: [0, 1, 0], speed: 1.4 }, () => {
            c.k.add("gold", new THREE.TorusGeometry(0.13, 0.01, 4, 16), cr, [Math.PI / 2 + 0.3, 0, 0], { color: AM.pale });
            c.k.add("gold", new THREE.TorusGeometry(0.1, 0.009, 4, 14), cr, [Math.PI / 2 - 0.4, 0.6, 0], { color: AM.pale });
          });
        } else {
          // His open palm, fingers half curled, the void orb floating over it
          blob(c, "gold", add(wr, [0, -0.01, 0.05]), [0.06, 0.03, 0.075], { color: AM.gold, wd: 9, hd: 6 });
          for (let i = 0; i < 4; i++) {
            const x = (i - 1.5) * 0.026;
            hook(c, "gold", add(wr, [x, 0.0, 0.11]), [x * 2, 0.35, 1], [0, 0.35, -0.1], 0.013, 0.1 - Math.abs(i - 1.5) * 0.012, 3, { color: AM.gold });
          }
          hook(c, "gold", add(wr, [0.055, 0.0, 0.05]), [0.8, 0.4, 0.4], [-0.2, 0.2, 0], 0.014, 0.08, 2, { color: AM.gold });
          const o = add(wr, [0, 0.21, 0.07]);
          c.bone("orb", o, () => {
            c.k.add("glow", new THREE.IcosahedronGeometry(0.12, 2), o, undefined, { color: AM.violet, bright: 1.5 });
            c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 2.6 }, () => c.k.add("glow", new THREE.IcosahedronGeometry(0.06, 1), add(o, [0, 0, 0.075]), undefined, { color: AM.pink, bright: 2.4 }));
            c.k.add("gold", new THREE.TorusGeometry(0.16, 0.01, 4, 20), o, [Math.PI / 2 - 0.35, 0, 0.2], { color: AM.pale });
            c.k.move({ kind: MOVE.spin, pivot: o, axis: [0.3, 1, 0.1], speed: 2.4 }, () => {
              for (let i = 0; i < 4; i++) c.k.add("glow", new THREE.OctahedronGeometry(0.022), add(o, [Math.cos((i * TAU) / 4) * 0.22, 0, Math.sin((i * TAU) / 4) * 0.22]), undefined, { color: AM.pink, bright: 2 });
            });
          });
        }
      });
    });
  });
}

function archmageHead(c: BossCtx) {
  c.bone("head", [0, 1.95, 0.0], () => {
    seg(c, "gold", [0, 1.9, 0], [0, 2.02, 0.01], 0.07, 0.065, { color: AM.gold2, seg: 8 });
    // A face of living gold: a brow, eyes burning violet, a nose, a long white beard in locks
    blob(c, "gold", [0, 2.1, 0.02], [0.14, 0.16, 0.14], { color: AM.gold, wd: 14, hd: 10 });
    blob(c, "gold", [0, 2.16, 0.12], [0.11, 0.025, 0.04], { color: AM.gold2, wd: 10, hd: 5 });
    for (const s of [1, -1]) {
      blob(c, "matte", [s * 0.048, 2.125, 0.135], [0.034, 0.026, 0.022], { color: AM.dark, wd: 8, hd: 5 });
      c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.9, phase: s }, () => c.k.add("glow", new THREE.SphereGeometry(0.022, 8, 5), [s * 0.048, 2.125, 0.162], undefined, { color: AM.pink, bright: 2.8, scale: [1.3, 0.75, 0.55] }));
      blob(c, "gold", [s * 0.14, 2.1, 0.0], [0.025, 0.05, 0.035], { color: AM.gold2, wd: 6, hd: 5 });
      blob(c, "matte", [s * 0.045, 2.035, 0.135], [0.055, 0.02, 0.03], { color: AM.beard, wd: 8, hd: 5, rot: [0, 0, s * 0.35] });
    }
    spike(c, "gold", [0, 2.11, 0.15], [0, -0.6, 1], 0.022, 0.06, { color: AM.gold, seg: 5 });
    c.k.frame([0, 1.98, 0.11], [0, 0, 0], 1, () =>
      chainBones(c, "beard", [0, 0, 0], [0.16, 0.16, 0.15], [1.2, 1.32, 1.4], [0.07, 0.07, 0.052, 0.018], { bucket: "matte", color: AM.beard, seg: 8 })
    );
    // The wide-brimmed hat: a brim, a band of gold with a void gem, a ring of violet light, the crown's tip drooping back
    c.k.add("cloth", new THREE.CylinderGeometry(0.5, 0.5, 0.03, 28), [0, 2.27, 0], [-0.06, 0, 0.04], { color: AM.gold2 });
    c.k.add("cloth", new THREE.ConeGeometry(0.21, 0.55, 16, 1, true), [0, 2.555, 0], undefined, { color: AM.robe });
    c.k.add("gold", new THREE.TorusGeometry(0.2, 0.03, 5, 18), [0, 2.33, 0], [Math.PI / 2, 0, 0], { color: AM.pale });
    c.k.add("glow", new THREE.OctahedronGeometry(0.04), [0, 2.34, 0.23], undefined, { color: AM.void, bright: 2, scale: [1, 1.3, 0.6] });
    c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.4 }, () => c.k.add("glow", new THREE.TorusGeometry(0.175, 0.014, 4, 18), [0, 2.42, 0], [Math.PI / 2, 0, 0], { color: AM.violet, bright: 1.6 }));
    c.bone("hatTip", [0, 2.76, 0], () => {
      seg(c, "cloth", [0, 2.76, 0], [0, 2.93, -0.15], 0.06, 0.012, { color: AM.robe, seg: 8 });
      c.k.add("glow", new THREE.OctahedronGeometry(0.035), [0, 2.95, -0.17], undefined, { color: "#fef9c3", bright: 1.8 });
    });
  });
}

function archmage(c: BossCtx) {
  // Shards of void crystal circling him, each on its own tilted path (built at the middle; the idle carries them round)
  for (let i = 0; i < AM_SHARDS; i++) {
    c.bone(`shard${i}`, [0, 1.5, 0], () => {
      c.k.add("glow", new THREE.OctahedronGeometry(0.07), [0, 1.5, 0], undefined, { color: i % 2 ? AM.violet : AM.void, bright: 1.7, scale: [0.9, 2.6, 0.9] });
      c.k.add("gloss", new THREE.OctahedronGeometry(0.05), [0.06, 1.42, 0.02], [0.4, 0.3, 0.5], { color: "#2e1065", scale: [0.8, 2, 0.8] });
    });
  }
  c.bone("fly", [0, 1.3, 0], () => {
    // His robes: a cream underskirt, the gilded over-robe open at the front, a band of violet runes and a gold hem
    c.bone("hem", [0, 1.32, 0], () => {
      c.k.add("cloth", new THREE.CylinderGeometry(0.27, 0.56, 1.0, 20, 2, true), [0, 0.8, 0], undefined, { color: AM.under });
      const gap = 0.45;
      const cone = (y0: number, y1: number, r0: number, r1: number, bucket: string, color: string, o: { bright?: number; runes?: boolean } = {}) =>
        c.k.add(bucket, new THREE.CylinderGeometry(r1, r0, y1 - y0, 24, 1, true, gap, TAU - gap * 2), [0, (y0 + y1) / 2, 0], undefined, {
          color,
          bright: o.bright,
          surf: o.runes ? { fn: (p) => [(thetaOf(p.x, p.z) / TAU) * 22, p.y / (y1 - y0) + 0.5, SURF.runes] } : undefined
        });
      cone(0.53, 1.35, robeR(0.53), robeR(1.35), "cloth", AM.robe);
      c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.2 }, () => cone(0.465, 0.53, robeR(0.465), robeR(0.53), "glow", AM.violet, { bright: 1.5, runes: true }));
      cone(0.4, 0.465, robeR(0.4), robeR(0.465), "gold", AM.pale);
      // Gilt studs down the over-robe's open edges
      for (const th of [gap, TAU - gap])
        for (let i = 0; i < 8; i++) {
          const y = 0.6 + i * 0.095;
          const r = robeR(y) + 0.02;
          c.k.add("gold", new THREE.OctahedronGeometry(0.022), [Math.sin(th) * r, y, Math.cos(th) * r], [0, th, 0], { color: AM.pale, scale: [1, 1.3, 0.6] });
        }
      // A violet stole down his front, gold-fringed
      for (const s of [1, -1]) {
        c.k.along("cloth", [s * 0.1, 1.86, 0.2], [s * 0.11, 1.35, 0.34], [0.1, 0.02], { color: AM.stole });
        c.k.along("cloth", [s * 0.11, 1.35, 0.34], [s * 0.12, 0.66, robeR(0.66) + 0.05], [0.1, 0.02], { color: AM.stole });
        c.k.add("gold", new THREE.BoxGeometry(0.11, 0.04, 0.03), [s * 0.12, 0.64, robeR(0.66) + 0.06], [-0.3, 0, 0], { color: AM.pale });
      }
    });
    c.k.add("gold", new THREE.TorusGeometry(0.29, 0.04, 5, 20), [0, 1.33, 0], [Math.PI / 2, 0, 0], { color: AM.gold });
    c.k.add("glow", new THREE.OctahedronGeometry(0.05), [0, 1.33, 0.33], undefined, { color: AM.void, bright: 1.9, scale: [1, 1.4, 0.6] });
    // The sash's knotted tails hanging at his left hip, stirring
    for (const [x, len, ph] of [
      [-0.2, 0.55, 0],
      [-0.27, 0.45, 1.3]
    ]) {
      const top: V3 = [x, 1.3, robeR(1.3) * 0.75 + 0.06];
      c.k.move({ kind: MOVE.flutter, pivot: top, axis: [0, 0, 1], amp: 0.04, speed: 2.2, phase: ph }, () => {
        c.k.add("cloth", new THREE.PlaneGeometry(0.08, len, 1, 4), [x - 0.02, 1.3 - len / 2, top[2] + len * 0.1], [-0.2, 0, -0.08], { color: AM.pale, surf: cloth(0.08, len) });
        c.k.add("glow", new THREE.OctahedronGeometry(0.02), [x - 0.04, 1.3 - len - 0.01, top[2] + len * 0.2], undefined, { color: AM.void, bright: 1.6 });
      });
    }
    blob(c, "gold", [-0.22, 1.32, robeR(1.3) * 0.75 + 0.05], [0.05, 0.05, 0.04], { color: AM.gold, wd: 8, hd: 6 });
    c.bone("chest", [0, 1.36, 0], () => {
      blob(c, "cloth", [0, 1.62, 0], [0.27, 0.33, 0.21], { color: AM.robe, wd: 14, hd: 10 });
      c.k.add("gold", new THREE.CylinderGeometry(0.17, 0.21, 0.16, 16, 1, true), [0, 1.93, 0], undefined, { color: AM.gold });
      // A capelet over his shoulders, its hem trimmed in pale gold
      c.k.add("cloth", new THREE.CylinderGeometry(0.22, 0.44, 0.24, 20, 1, true), [0, 1.78, 0], undefined, { color: AM.gold2 });
      c.k.add("gold", new THREE.TorusGeometry(0.44, 0.018, 4, 28), [0, 1.66, 0], [Math.PI / 2, 0, 0], { color: AM.pale });
      for (const s of [1, -1]) {
        blob(c, "gold", [s * 0.3, 1.88, 0], [0.16, 0.09, 0.17], { color: AM.gold, wd: 10, hd: 7, rot: [0, 0, -s * 0.3] });
        c.k.add("glow", new THREE.OctahedronGeometry(0.035), [s * 0.36, 1.98, 0], undefined, { color: AM.void, bright: 1.8, scale: [1, 1.5, 1] });
      }
      // The rayed halo behind his head, turning slowly
      c.bone("halo", [0, 2.42, -0.56], () => {
        const o: V3 = [0, 2.42, -0.56];
        c.k.add("gold", new THREE.TorusGeometry(0.5, 0.024, 5, 40), o, undefined, { color: AM.pale });
        c.k.add("glow", new THREE.TorusGeometry(0.44, 0.012, 4, 36), o, undefined, { color: "#fde047", bright: 1.5 });
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU;
          spike(c, "gold", add(o, [Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0]), [Math.cos(a), Math.sin(a), 0], 0.022, i % 2 ? 0.13 : 0.24, { color: AM.gold, seg: 4 });
        }
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + TAU / 8;
          c.k.add("glow", new THREE.OctahedronGeometry(0.035), add(o, [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.03]), undefined, { color: AM.void, bright: 2 });
        }
      });
      cloak(
        c,
        "cape",
        [
          { y: 1.88, R: 0.37, zc: 0.02 },
          { y: 1.3, R: 0.44, zc: -0.02 },
          { y: 0.75, R: 0.6, zc: -0.1 },
          { y: 0.25, R: 0.66, zc: -0.16 }
        ],
        AM.cape,
        false
      );
      archmageArm(c, 1);
      archmageArm(c, -1);
      archmageHead(c);
    });
  });
}

const amBeard = (f: (j: number) => BonePose | null): Pose => chainPose("beard", AM_BEARD, f);

function archmageIdle(c: IdleCtx) {
  // He hovers, drifting a little and breathing; the hem sways under him; he glances round; the orb rolls over his palm
  c.carry("fly", [0.03 * c.drift(0.3, 1) * (1 - c.busy), 0.12 * c.drift(0.2, 2) * (1 - c.busy), 0.03 * c.drift(0.25)], [0.07 * c.drift(0.22) * (1 - c.busy), 0.08 * Math.sin(c.t * 1.3 + c.seed * 5), 0.05 * c.drift(0.18, 3) * (1 - c.busy)]);
  const breath = c.sin(1.0);
  c.add("chest", [0.02 * breath, 0.05 * c.drift(0.25, 4), 0.02 * c.drift(0.3)], null, 0.012 * breath);
  c.add("hem", [0.05 * c.drift(0.6, 1) - 0.03, 0, 0.05 * c.drift(0.5)]);
  c.add("head", [0.06 * c.drift(0.4, 2), 0.3 * c.glance(1, 4.6, 0.4), 0.06 * c.drift(0.3, 1)]);
  c.add("hatTip", [0.08 * c.drift(0.7), 0, 0.1 * c.drift(0.6, 1)]);
  for (let j = 0; j < AM_BEARD; j++) c.add(`beard${j}`, [0.04 * Math.sin(c.t * 1.1 - j * 0.7), 0.05 * Math.sin(c.t * 0.8 - j * 0.6 + 1), 0]);
  for (let j = 0; j < 3; j++) c.add(`cape${j}`, [0.04 * Math.sin(c.t * 1.0 - j * 0.8) - 0.05 * (j + 1) * 0.5, 0, 0.04 * Math.sin(c.t * 0.7 - j * 0.6)]);
  c.add("armL", [0.05 * c.drift(0.45, 1), 0, -0.04 * c.drift(0.38)]);
  c.add("armR", [0.04 * c.drift(0.4, 3), 0, 0.03 * c.drift(0.33, 2)]);
  c.add("handR", [0.06 * c.drift(0.5), 0, 0.05 * c.drift(0.4, 1)]);
  // Now and then he weighs the orb, lifting it to his eyes
  const weigh = c.event(4, 10, 2.6).e;
  c.add("armL", [-0.5 * weigh, 0, 0.1 * weigh]);
  c.add("foreL", [-0.45 * weigh, 0, 0]);
  c.add("head", [0.15 * weigh, -0.25 * weigh, 0]);
  c.carry("orb", [c.t * 0.7, c.t * 1.1, 0], [0, 0.04 * Math.sin(c.t * 1.7), 0]);
  // The halo turns; the shards circle on their own tilted paths, racing wider while he acts
  c.carry("halo", [0, 0, c.t * 0.25]);
  for (let i = 0; i < AM_SHARDS; i++) {
    const a = c.t * (0.55 + i * 0.07) + (i * TAU) / AM_SHARDS + c.seed * 2;
    const R = 1.0 + 0.12 * Math.sin(c.t * 0.4 + i) + 0.4 * c.busy;
    const tilt = 0.35 * Math.sin(i * 2.3 + 0.5);
    c.carry(`shard${i}`, [c.t * 1.3 + i, c.t * 0.9 + i * 2, 0], [Math.cos(a) * R, Math.sin(a) * R * tilt + 0.3 * Math.sin(a * 2 + i) + 0.3 * c.busy, Math.sin(a) * R]);
  }
}

const AM_DEF: BossHeroDef = {
  build: archmage,
  // The staff hand forward, the orb hand raised and turned in, the head tipped: never mirrored
  rest: {
    head: { r: [0.06, 0.08, -0.05] },
    armR: { r: [-0.15, 0, 0.08] },
    foreR: { r: [-0.15, 0, 0] },
    armL: { r: [-0.25, 0, -0.12] },
    foreL: { r: [-0.35, 0, 0] },
    handL: { r: [0.1, 0, 0.1] },
    ...amBeard(() => ({ r: [0.05, 0, 0] }))
  },
  idle: archmageIdle,
  roar: {
    len: 3.0,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // He draws in, head bowed, staff and orb gathered close
      { t: 0.22, hold: true, pose: { fly: { p: [0, -0.08, 0] }, chest: { r: [0.15, 0, 0] }, head: { r: [0.2, 0, 0] }, armR: { r: [0.15, 0, -0.05] }, armL: { r: [0.1, 0, 0.15] }, foreL: { r: [-0.3, 0, 0] } } },
      // The invocation: rising, staff raised high, orb lifted, the halo flaring
      {
        t: 0.42,
        pose: merge(
          { fly: { p: [0, 0.35, 0], g: 0.6 }, chest: { r: [-0.22, 0, 0] }, head: { r: [-0.3, 0, 0], g: 1.4 }, armR: { r: [-2.3, 0, 0.2] }, foreR: { r: [-0.15, 0, 0] }, handR: { r: [0.35, 0, 0], g: 1.5 }, armL: { r: [-1.5, 0, -0.7] }, foreL: { r: [-0.2, 0, 0] }, orb: { p: [0, 0.22, 0], s: 0.4, g: 2 }, halo: { g: 2.2, s: 0.12 }, hatTip: { r: [-0.3, 0, 0] } },
          amBeard(() => ({ r: [-0.1, 0, 0] })),
          chainPose("cape", 3, () => ({ r: [-0.25, 0, 0] }))
        )
      },
      {
        t: 0.74,
        hold: true,
        pose: merge(
          { fly: { p: [0, 0.3, 0], g: 0.4 }, chest: { r: [-0.18, 0.04, 0] }, head: { r: [-0.25, 0.05, 0], g: 1.1 }, armR: { r: [-2.2, 0, 0.18] }, foreR: { r: [-0.18, 0, 0] }, handR: { r: [0.3, 0, 0], g: 1.2 }, armL: { r: [-1.4, 0, -0.65] }, foreL: { r: [-0.25, 0, 0] }, orb: { p: [0, 0.18, 0], s: 0.3, g: 1.6 }, halo: { g: 1.6, s: 0.08 } },
          chainPose("cape", 3, () => ({ r: [-0.2, 0, 0] }))
        )
      },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.05, vig: 0.6, vigCol: "#2e1065", lines: 0.85, flash: 0.35, flashCol: "#fef3c7" } }]
  },
  attack: {
    len: 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // The orb drawn back to his shoulder, the staff swung behind, twisting away
      { t: 0.3, pose: { fly: { p: [0, 0.08, -0.12], r: [0, 0.3, 0] }, chest: { r: [-0.12, 0.35, 0] }, head: { r: [0.1, -0.3, 0] }, armL: { r: [0.35, 0, -0.55] }, foreL: { r: [-1.3, 0, 0] }, handL: { r: [-0.3, 0, 0] }, orb: { s: 0.3, g: 1 }, armR: { r: [0.55, 0, 0.3] }, foreR: { r: [-0.3, 0, 0] } } },
      { t: 0.42, hold: true, pose: { fly: { p: [0, 0.1, -0.15], r: [0, 0.36, 0] }, chest: { r: [-0.15, 0.42, 0] }, head: { r: [0.12, -0.35, 0] }, armL: { r: [0.4, 0, -0.6] }, foreL: { r: [-1.4, 0, 0] }, handL: { r: [-0.35, 0, 0] }, orb: { s: 0.5, g: 1.8 }, armR: { r: [0.65, 0, 0.35] }, foreR: { r: [-0.35, 0, 0] } } },
      // Both thrust out at his foe: the orb flung forward, the staff sweeping over, void light bursting ahead
      {
        t: 0.54,
        pose: merge(
          { fly: { p: [0, -0.04, 0.28], r: [0.1, -0.25, 0], g: 0.6 }, chest: { r: [0.25, -0.3, 0] }, head: { r: [0.12, 0.2, 0], g: 1 }, armL: { r: [-1.5, 0, 0.1] }, foreL: { r: [0.05, 0, 0] }, handL: { r: [-0.5, 0, 0] }, orb: { p: [0, 0.05, 0.35], s: 0.6, g: 2.5 }, armR: { r: [-1.25, 0, -0.25] }, foreR: { r: [0.15, 0, 0] }, handR: { r: [0.6, 0, 0], g: 1.2 } },
          chainPose("cape", 3, () => ({ r: [-0.2, 0, 0] }))
        )
      },
      { t: 0.66, pose: { fly: { p: [0, -0.05, 0.32], r: [0.12, -0.3, 0] }, chest: { r: [0.28, -0.35, 0] }, head: { r: [0.15, 0.22, 0] }, armL: { r: [-1.55, 0, 0.15] }, foreL: { r: [0.08, 0, 0] }, handL: { r: [-0.55, 0, 0] }, orb: { p: [0, 0.03, 0.3], s: 0.2 }, armR: { r: [-1.0, 0, -0.35] }, foreR: { r: [0.2, 0, 0] }, handR: { r: [0.75, 0, 0] } } },
      { t: 0.86, hold: true, pose: { fly: { p: [0, 0, 0.08] }, chest: { r: [0.06, -0.05, 0] }, armL: { r: [-0.4, 0, 0] }, armR: { r: [-0.25, 0, 0] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.54, burst: true, cine: { quake: 0.1, stop: 0.07, flash: 0.5, flashCol: "#f5d0fe", lines: 0.9, vig: 0.3, vigCol: "#2e1065" } }]
  },
  lag: { chest: 0.03, foreL: 0.05, foreR: 0.05, handL: 0.08, handR: 0.08, orb: 0.12, head: 0.06, hem: 0.08, ...chainLag("beard", AM_BEARD, 0.05, 0.06), ...chainLag("cape", 3, 0.06, 0.05) },
  springs: { ...chainSprings("beard", AM_BEARD, 60), ...chainSprings("cape", 3, 45), hatTip: 55, hem: 80 },
  burst: { at: [0, 1.5, 1.4], color: "#f0abfc", count: 70, speed: 2.4, spread: 0.6, size: 0.14, gravity: 1.5 },
  aura: aura("#a855f7", "#fde68a", 0.5, 1.6, 4.2),
  height: 3.4,
  frame: [6.6, 3.2, 1.6],
  sparks: (c) => {
    // Gold dust drifting off his robes, wisps of void round the orb, motes rising round him
    c.spark(SPARK.mote, [0, 1.0, 0], 18, { color: "#fde68a", size: 0.05, speed: 0.35, rise: 0.8, reach: 0.9, spread: 1.2 });
    c.spark(SPARK.wisp, [-0.55, 1.75, 0.4], 8, { color: "#f0abfc", size: 0.08, speed: 0.15, rise: 0.4, reach: 0.25, spread: 0.2 });
    c.spark(SPARK.ember, [0, 0.4, 0], 10, { color: "#c084fc", size: 0.05, speed: 0.25, rise: 2.6, reach: 1.0, spread: 1.4 });
  },
  walk: glide({ hem: "hem", cape: "cape", swingR: 0.3 }),
  actions: [
    { id: "idle", label: "Idle" },
    { id: "walk", label: "March" },
    { id: "roar", label: "Invoke" },
    { id: "attack", label: "Cast" }
  ]
};

/** Legendary creatures that stand on the map as rigged heroes, by NPC type */
export const LEGENDARY_CREATURES: Record<string, BossHeroDef> = { "bandit-kingpin": VG_DEF };

/** Legendary mercenaries as rigged heroes, by mercenary type (many copies still draw in the same batch) */
export const MERC_HEROES: Record<string, BossHeroDef> = { "merc-void-archmage": AM_DEF };
