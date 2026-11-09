import * as THREE from "three";
import { MOVE, TAU, V3, craggy, dirXZ, rubble } from "./heroKit";
import { SPARK, STRATA, cloth, grainRound, scalesRound, scalesTorus } from "./heroMaterials";
import { BossCtx, BossHeroDef, BonePose, IdleCtx, Pose } from "./heroRig";
import { blob, chainBones, chainLag, chainPose, chainSprings, hook, membrane, merge, onBlob, pathBones, plate, seaPool, seg, spike, stud, toward } from "./bossParts";

/* ------------------------------------------------------------------------- */
/* World bosses of the sea: the Kraken, the Leviathan, the Siren             */
/* ------------------------------------------------------------------------- */

/*
 * Each builder adds its boss round the kit's origin at the size of its Normal rig, facing +z, every part inside a bone
 * (`c.bone`). The rest of each def is its motion: a relaxed rest pose, a layered idle with seeded events, and its roar
 * and attack as keyed poses (offsets from rest) with holds where the body settles and an impact mid-swing.
 */

// No beam over a world boss: embers and its own sparks only
const aura = (color: string, hot: string, radius: number): BossHeroDef["aura"] => ({
  embers: { inner: Math.max(0.4, radius - 1.2), outer: radius + 0.3, height: 6.5, count: 90 },
  color,
  hot
});

/* ================================================================== */
/* The Leviathan Kraken Lord                                           */
/* ================================================================== */

const KR = {
  skin: "#5a2283",
  skin2: "#4a1a6b",
  dark: "#2e0f45",
  wart: "#73309a",
  under: "#f0b6cf",
  spot: "#e879f9",
  eye: "#fbbf24",
  beak: "#1c1917",
  barnacle: "#a8a29e",
  gold: "#d4a017",
  wood: "#5b3a1e",
  sail: "#c9b896",
  water: "#0c3550",
  foam: "#8fbfd0"
};

/** The arms: angle round the body (0 = front), and whether it is a hunting arm */
const KR_ARMS: Array<{ a: number; hunt: boolean }> = [
  { a: 0.33, hunt: true },
  { a: -0.33, hunt: true },
  { a: 0.98, hunt: false },
  { a: -0.98, hunt: false },
  { a: 1.75, hunt: false },
  { a: -1.75, hunt: false },
  { a: 2.5, hunt: false },
  { a: -2.5, hunt: false }
];
const KR_SEGS = { hunt: 8, arm: 7 };
const segsOf = (i: number) => (KR_ARMS[i].hunt ? KR_SEGS.hunt : KR_SEGS.arm);

/** The mantle: a great sac leaning back over the head */
const MANTLE = { at: [0, 2.55, -0.78] as V3, radii: [1.05, 1.55, 1.08] as V3, rot: [-0.62, 0, 0] as V3 };

function krakenArm(c: BossCtx, i: number) {
  const { a, hunt } = KR_ARMS[i];
  const r = c.rng;
  const [x, z] = [Math.sin(a) * 0.82, Math.cos(a) * 0.82];
  const n = hunt ? KR_SEGS.hunt : KR_SEGS.arm;
  const k = 0.9 + r() * 0.2;
  const lens = hunt ? [0.48, 0.46, 0.44, 0.42, 0.4, 0.38, 0.36, 0.34].map((l) => l * 0.95) : [0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3].map((l) => l * k);
  // Down into the water, along it, then the tip curling up; the hunting arms arch up and hang their clubs forward
  const pitch = hunt ? [0.25, -0.3, -0.48, -0.22, 0.25, 0.55, 0.72, 0.92] : [0.6, 0.38, 0.06, -0.12, -0.38, -0.78 - r() * 0.3, -1.25 - r() * 0.4];
  const radii = hunt ? [0.27, 0.23, 0.2, 0.17, 0.14, 0.12, 0.15, 0.13, 0.06] : [0.3, 0.26, 0.22, 0.18, 0.14, 0.11, 0.08, 0.04];
  const yaw = Array.from({ length: n }, () => (r() - 0.5) * 0.16);
  c.k.at([x, 0.78, z], a, () => {
    chainBones(
      c,
      `arm${i}_`,
      [0, 0, 0],
      lens,
      pitch,
      radii,
      { bucket: "skin", color: i % 2 ? KR.skin : KR.skin2, seg: 10, yaw },
      (j, from, to, r0, r1, dir) => {
        const mid: V3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
        // Under the arm: suckers; on top, a glowing spot every other segment
        const down: V3 = [0, -dir[2], dir[1]];
        const rr = (r0 + r1) / 2;
        const club = hunt && j >= n - 2;
        const count = j === 0 ? 0 : club ? 3 : 1;
        for (let s = 0; s < count; s++) {
          const f = count === 1 ? 0.5 : 0.2 + s * 0.3;
          const p: V3 = [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, from[2] + (to[2] - from[2]) * f];
          const side = club ? (s - 1) * 0.45 : 0;
          stud(c, "skin", [p[0] + side * rr + down[0] * rr * 0.86, p[1] + down[1] * rr * 0.86, p[2] + down[2] * rr * 0.86], down, rr * (club ? 0.42 : 0.5), rr * 0.2, { color: KR.under });
        }
        if (club)
          for (const s of [-1, 1]) hook(c, "gloss", [mid[0] + s * rr * 0.8, mid[1] + down[1] * rr * 0.4, mid[2] + down[2] * rr * 0.4], [s, -0.4, 0.2], [0, -0.25, 0.25], rr * 0.22, rr * 1.4, 3, { color: KR.beak });
        if (j % 2 === 1)
          c.k.move({ kind: MOVE.pulse, amp: 0.55, speed: 2.2, phase: i * 0.9 - j * 0.7 }, () =>
            stud(c, "glow", [mid[0] - down[0] * rr * 0.9, mid[1] - down[1] * rr * 0.9, mid[2] - down[2] * rr * 0.9], [-down[0], -down[1], -down[2]], rr * 0.28, rr * 0.12, { color: KR.spot, bright: 1.5 })
          );
      },
      (at, dir, rr) => {
        if (hunt) spike(c, "gloss", at, dir, rr * 1.2, rr * 4, { color: KR.beak });
      }
    );
  });
}

function kraken(c: BossCtx) {
  const r = c.rng;
  // The pool, rocks and the wreck it dragged down (root: they never move with the boss)
  seaPool(c, 2.95, KR.water, KR.foam, [
    [-2.25, -1.55, 0.42],
    [2.45, 0.85, 0.32],
    [-2.55, 0.95, 0.24]
  ]);
  // A galleon's broken mast, its yard and torn sail, hull ribs and planks
  c.k.add("matte", new THREE.CylinderGeometry(0.07, 0.1, 2.7, 8), [1.5, 1.28, -2.05], [-0.12, 0, 0.2], { color: KR.wood, surf: grainRound(0.08) });
  c.k.along("matte", [0.6, 2.35, -2.25], [2.0, 2.15, -1.95], 0.05, { color: KR.wood });
  c.k.add("matte", new THREE.SphereGeometry(0.11, 8, 6), [1.25, 2.52, -2.2], undefined, { color: KR.wood });
  c.k.at([1.3, 2.25, -2.1], -0.2, () =>
    c.k.move({ kind: MOVE.flutter, pivot: [0, 0, 0], axis: [0, 0, 1], amp: 0.05, speed: 2.4 }, () =>
      c.k.add("cloth", new THREE.PlaneGeometry(1.2, 1.25, 6, 6), [0, -0.66, 0.06], [0.08, 0, 0], { color: KR.sail, surf: cloth(1.2, 1.25, true) })
    )
  );
  for (let i = 0; i < 4; i++) {
    const a = 0.5 + i * 0.32;
    c.k.add("matte", new THREE.TorusGeometry(0.62 - i * 0.05, 0.05, 5, 10, Math.PI * 0.85), [2.2 - i * 0.18, 0.08, -0.9 - i * 0.32], [0, a, Math.PI * 0.08], { color: KR.wood });
  }
  for (const [x, z, a] of [
    [-1.6, 1.9, 0.6],
    [2.25, -0.25, -0.4],
    [-2.35, 0.25, 1.4]
  ] as V3[])
    c.k.move({ kind: MOVE.bob, amp: 0.03, speed: 1.3, phase: x + z }, () => c.k.add("matte", new THREE.BoxGeometry(0.75, 0.07, 0.17), [x, 0.17, z], [0, a, 0.06], { color: KR.wood, surf: grainRound(0.1) }));

  c.bone("body", [0, 0.9, 0], () => {
    // The web where the arms join, the head mass, the siphon
    blob(c, "skin", [0, 0.78, 0.04], [1.12, 0.42, 1.08], { color: KR.dark, wd: 18, hd: 8 });
    blob(c, "skin", [0, 1.3, 0.14], [1.1, 0.78, 1.0], { color: KR.skin, wd: 20, hd: 12 });
    seg(c, "skin", [-0.92, 1.1, 0.18], [-1.26, 0.96, 0.5], 0.15, 0.12, { color: KR.skin2, cap: false });
    c.k.add("skin", new THREE.TorusGeometry(0.12, 0.035, 5, 12), [-1.26, 0.96, 0.5], undefined, { color: KR.dark, quat: toward([-0.6, -0.3, 0.7]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))) });
    // Eyes on bulges: amber, a black bar of a pupil, a heavy brow slanting down to the middle, a lid that blinks
    for (const s of [1, -1]) {
      const name = s > 0 ? "R" : "L";
      c.k.at([s * 0.64, 1.46, 0.76], s * 0.62, () => {
        blob(c, "skin", [0, -0.02, -0.08], [0.3, 0.27, 0.24], { color: KR.skin2, wd: 14, hd: 10 });
        c.k.add("glow", new THREE.SphereGeometry(0.17, 14, 10), [0, 0, 0.04], undefined, { color: KR.eye, bright: 1.8 });
        c.k.add("matte", new THREE.BoxGeometry(0.2, 0.045, 0.05), [0, 0, 0.2], undefined, { color: "#0a0a0a" });
        c.k.add("skin", new THREE.TorusGeometry(0.22, 0.07, 6, 12, Math.PI), [0, 0.02, 0.0], [0, 0, s * 0.32], { color: KR.dark });
        c.k.frame([0, 0, 0.04], [0, 0, s * 0.3], 1, () =>
          c.bone(`lid${name}`, [0, 0, 0], () => c.k.add("skin", new THREE.SphereGeometry(0.19, 14, 6, 0, TAU, 0, Math.PI / 2), [0, 0, 0], undefined, { color: KR.skin2 }))
        );
        // Photophores under the eye
        for (let i = 0; i < 3; i++)
          c.k.move({ kind: MOVE.pulse, amp: 0.6, speed: 1.7, phase: i * 0.9 + s }, () => stud(c, "glow", [(i - 1) * 0.11, -0.27 - (i % 2) * 0.05, 0.07], [0, -0.3, 1], 0.035, 0.02, { color: KR.spot, bright: 1.6 }));
      });
    }
    // The beak under the head: two dark hooked mandibles
    c.bone("beak", [0, 0.92, 0.82], () => {
      hook(c, "gloss", [0, 0.98, 0.84], [0, -0.55, 1], [0, -0.35, -0.05], 0.15, 0.42, 3, { color: KR.beak });
      c.bone("jaw", [0, 0.86, 0.8], () => hook(c, "gloss", [0, 0.86, 0.8], [0, -0.9, 0.55], [0, -0.1, -0.35], 0.12, 0.32, 3, { color: KR.beak }));
    });
    // Warts over the head
    for (let i = 0; i < 16; i++) {
      const d: V3 = [(r() - 0.5) * 2, 0.3 + r() * 0.7, -0.2 + r() * 0.9];
      const { p, n } = onBlob([0, 1.3, 0.14], [1.1, 0.78, 1.0], [0, 0, 0], d);
      const rr = 0.035 + r() * 0.035;
      stud(c, "skin", p, n, rr, rr * 0.7, { color: KR.wart });
    }
    // The mantle: a great sac leaning back, ridged, warty, barnacled, glowing veins running up it, a sunken crown on its crest
    c.bone("mantle", [0, 1.7, -0.25], () => {
      const m = MANTLE;
      blob(c, "skin", m.at, m.radii, { color: KR.skin, rot: m.rot, wd: 22, hd: 16 });
      // Ridge of knobs down its back
      for (let i = 0; i < 6; i++) {
        const ph = 0.2 + i * 0.27;
        const { p, n } = onBlob(m.at, m.radii, m.rot, [0, Math.cos(ph), -Math.sin(ph)]);
        spike(c, "skin", p, n, 0.12 - i * 0.008, 0.3 - i * 0.02, { color: KR.dark });
      }
      for (let i = 0; i < 26; i++) {
        const d: V3 = [(r() - 0.5) * 2, -0.4 + r() * 1.4, (r() - 0.4) * 2];
        const { p, n } = onBlob(m.at, m.radii, m.rot, d);
        const rr = 0.035 + r() * 0.04;
        stud(c, "skin", p, n, rr, rr * 0.7, { color: KR.wart });
      }
      for (let i = 0; i < 10; i++) {
        const d: V3 = [(r() - 0.5) * 1.6, 0.1 + r() * 0.9, -0.3 - r() * 0.7];
        const { p, n } = onBlob(m.at, m.radii, m.rot, d);
        const rr = 0.05 + r() * 0.04;
        c.k.add("matte", new THREE.CylinderGeometry(rr * 0.55, rr, rr * 1.1, 7, 1, true), p, undefined, { color: KR.barnacle, quat: toward(n) });
      }
      // Veins of light up each flank, the glow running up them
      for (const s of [1, -1])
        for (let v = 0; v < 3; v++) {
          const lon = 0.38 + v * 0.3;
          const pts: V3[] = [];
          for (let i = 0; i < 7; i++) {
            const lat = -0.55 + i * 0.22;
            const wob = Math.sin(i * 1.7 + v * 2.3) * 0.08;
            const d: V3 = [s * Math.cos(lat) * Math.sin(lon + wob), Math.sin(lat), Math.cos(lat) * Math.cos(lon + wob)];
            const { p, n } = onBlob(m.at, m.radii, m.rot, d);
            pts.push([p[0] + n[0] * 0.012, p[1] + n[1] * 0.012, p[2] + n[2] * 0.012]);
          }
          for (let i = 0; i < pts.length - 1; i++)
            c.k.move({ kind: MOVE.pulse, amp: 0.65, speed: 2.3, phase: -i * 0.75 - v * 1.3 }, () =>
              c.k.along("glow", pts[i], pts[i + 1], 0, { geo: new THREE.CylinderGeometry(0.022 - i * 0.002, 0.026 - i * 0.002, 1, 5, 1, true), color: KR.spot, bright: 1.5 })
            );
        }
      // The sunken crown, slipped askew on the crest
      const top = onBlob(m.at, m.radii, m.rot, [0.12, 0.93, 0.3]);
      const q = toward(top.n).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.4, 0.22)));
      const e = new THREE.Euler().setFromQuaternion(q);
      c.k.frame(top.p, [e.x, e.y, e.z], 1, () => {
        c.k.add("gold", new THREE.CylinderGeometry(0.4, 0.36, 0.22, 18, 1, true), [0, 0.06, 0], undefined, { color: KR.gold });
        c.k.add("gold", new THREE.TorusGeometry(0.4, 0.04, 5, 18), [0, 0.17, 0], [Math.PI / 2, 0, 0], { color: KR.gold });
        for (let i = 0; i < 6; i++) {
          const [cx, cz] = dirXZ((i / 6) * TAU, 0.4);
          c.k.add("gold", new THREE.ConeGeometry(0.07, 0.26, 4), [cx, 0.3, cz], undefined, { color: KR.gold });
          if (i % 2 === 0) stud(c, "glow", [cx * 1.08, 0.06, cz * 1.08], [cx, 0, cz], 0.05, 0.04, { color: "#dc2626", bright: 1.6 });
        }
        c.k.add("matte", new THREE.CylinderGeometry(0.04, 0.07, 0.07, 6, 1, true), [0.3, 0.05, 0.27], [0.3, 0, -0.5], { color: KR.barnacle });
      });
    });
    // The eight arms
    KR_ARMS.forEach((_, i) => krakenArm(c, i));
  });
}

const krakenArms = (f: (i: number, j: number, n: number, hunt: boolean) => BonePose | null): Pose =>
  merge(...KR_ARMS.map((arm, i) => chainPose(`arm${i}_`, segsOf(i), (j) => f(i, j, segsOf(i), arm.hunt))));

function krakenIdle(c: IdleCtx) {
  // The mantle breathes and leans, the head glances round, the eyes blink
  const breath = c.sin(1.25);
  c.add("body", [0.02 * c.drift(0.4), 0.12 * c.glance(1, 5.5, 0.5), 0.02 * c.drift(0.33, 2)], [0, 0.04 * breath, 0], 0.012 * breath);
  c.add("mantle", [0.05 * c.drift(0.5, 1), 0.04 * c.drift(0.37, 3), 0.05 * c.drift(0.41)], null, 0.035 * c.sin(1.25, 0.5));
  const blink = c.event(2, 4.2, 0.22).e;
  c.add("lidL", [1.15 * blink, 0, 0]);
  c.add("lidR", [1.15 * blink, 0, 0]);
  c.add("jaw", [0.12 * Math.max(0, c.sin(0.9)), 0, 0]);
  // The arms undulate, each to its own tempo, a wave running down to the tip; now and then one tip curls tight
  KR_ARMS.forEach((arm, i) => {
    const n = segsOf(i);
    const f = 0.9 + ((i * 0.37) % 0.6);
    const curl = c.event(10 + i, 6 + i * 0.7, 1.6);
    for (let j = 0; j < n; j++) {
      const w = j / (n - 1);
      const amp = arm.hunt ? 0.04 + 0.05 * w : 0.06 + 0.1 * w;
      c.add(`arm${i}_${j}`, [amp * Math.sin(c.t * f - j * 0.75 + i * 1.9) - (j >= n - 3 ? curl.e * 0.45 : 0), (arm.hunt ? 0.03 : 0.07) * Math.sin(c.t * f * 0.71 - j * 0.5 + i * 2.7), 0]);
    }
  });
}

const KR_DEF: BossHeroDef = {
  build: kraken,
  // Never mirrored: one hunting arm carried higher than the other, the mantle rolled a little, the head turned
  rest: merge({ body: { r: [0, 0.05, 0.02] }, mantle: { r: [0.03, -0.04, 0.05] }, lidL: { r: [-0.25, 0, 0] }, lidR: { r: [-0.35, 0, 0] } }, { arm0_1: { r: [-0.08, 0.05, 0] }, arm1_2: { r: [0.07, -0.04, 0] }, arm1_4: { r: [0.06, 0, 0] } }),
  idle: krakenIdle,
  roar: {
    len: 3.0,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      // Draws in low, arms tucking
      { t: 0.22, hold: true, pose: merge({ body: { r: [0.14, 0, 0], p: [0, -0.12, 0] }, mantle: { r: [0.12, 0, 0], s: -0.04 } }, krakenArms((_, j) => ({ r: [j < 3 ? 0.22 : -0.2, 0, 0] }))) },
      // Rears up, mantle swelling and blazing, beak gaping, every arm arched up and out, tips curling back
      {
        t: 0.42,
        pose: merge(
          { body: { r: [-0.24, 0, 0], p: [0, 0.16, -0.1], g: 0.9 }, mantle: { r: [-0.26, 0, 0], s: 0.09, g: 1.2 }, beak: { r: [-0.35, 0, 0] }, jaw: { r: [0.85, 0, 0] }, lidL: { r: [-0.4, 0, 0] }, lidR: { r: [-0.35, 0, 0] } },
          krakenArms((_, j, n, hunt) => ({ r: [hunt ? [-0.42, -0.3, -0.1, 0.05, 0.1, 0, -0.2, -0.3][j] : j === 0 ? -0.42 : j === 1 ? -0.12 : j >= n - 2 ? -0.5 : 0.08, 0, 0] }))
        )
      },
      {
        t: 0.72,
        hold: true,
        pose: merge(
          { body: { r: [-0.2, 0, 0.04], p: [0, 0.13, -0.08], g: 0.7 }, mantle: { r: [-0.22, 0.05, 0], s: 0.07, g: 0.9 }, beak: { r: [-0.3, 0, 0] }, jaw: { r: [0.75, 0, 0] } },
          krakenArms((_, j, n, hunt) => ({ r: [hunt ? [-0.36, -0.26, -0.08, 0.05, 0.1, 0, -0.16, -0.25][j] : j === 0 ? -0.36 : j === 1 ? -0.1 : j >= n - 2 ? -0.42 : 0.06, 0, 0] }))
        )
      },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.1, vig: 0.55, vigCol: "#3b0764", lines: 0.75, flash: 0.22, flashCol: "#e879f9" } }]
  },
  attack: {
    len: 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Coil: the hunting arms rear high, clubs drawn back, the body leaning away
      { t: 0.3, pose: merge({ body: { r: [-0.16, 0, 0], p: [0, 0.16, -0.12] }, mantle: { r: [-0.08, 0, 0] } }, krakenArms((_, j, n, hunt) => (hunt ? { r: [j < 3 ? -0.5 : j >= n - 2 ? -0.55 : -0.2, 0, 0] } : { r: [j < 2 ? -0.18 : 0, 0, 0] }))) },
      // The hang at the top of the wind-up
      { t: 0.42, hold: true, pose: merge({ body: { r: [-0.2, 0, 0], p: [0, 0.2, -0.15], g: 0.3 }, mantle: { r: [-0.1, 0, 0] } }, krakenArms((_, j, n, hunt) => (hunt ? { r: [j < 3 ? -0.6 : j >= n - 2 ? -0.62 : -0.24, 0, 0] } : { r: [j < 2 ? -0.22 : 0, 0, 0] }))) },
      // Slam: the arms whip down onto the water ahead, the body lunging after them (the impact mid-swing)
      { t: 0.55, pose: merge({ body: { r: [0.2, 0, 0], p: [0, -0.08, 0.32], g: 0.5 }, mantle: { r: [0.14, 0, 0] }, jaw: { r: [0.5, 0, 0] } }, krakenArms((_, j, n, hunt) => (hunt ? { r: [j < 3 ? 0.38 : 0.32, 0, 0] } : { r: [j < 2 ? -0.32 : 0.1, 0.0, 0] }))) },
      // Follow-through past the target
      { t: 0.66, pose: merge({ body: { r: [0.26, 0, 0], p: [0, -0.12, 0.38] }, mantle: { r: [0.2, 0, 0] } }, krakenArms((_, j, n, hunt) => (hunt ? { r: [0.46, 0, 0] } : { r: [j < 2 ? -0.2 : 0.14, 0, 0] }))) },
      { t: 0.84, hold: true, pose: merge({ body: { r: [0.06, 0, 0], p: [0, 0, 0.12] } }, krakenArms((_, j, n, hunt) => (hunt ? { r: [0.12, 0, 0] } : null))) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.55, burst: true, cine: { quake: 0.22, stop: 0.08, flash: 0.45, flashCol: "#a5f3fc", lines: 0.85, vig: 0.3, vigCol: "#0c4a6e" } }]
  },
  lag: Object.assign({}, ...KR_ARMS.map((arm, i) => chainLag(`arm${i}_`, segsOf(i), arm.hunt ? 0.035 : 0.05, 0.02))),
  // The outer arm segments follow through loosely
  springs: Object.assign({}, ...KR_ARMS.map((_, i) => chainSprings(`arm${i}_`, segsOf(i), 70, 3))),
  burst: { at: [0, 0.3, 3.0], color: "#bfe9ff", count: 80, speed: 3.2, spread: 1.6, size: 0.22, gravity: 7 },
  aura: aura("#c026d3", "#fbe7ff", 2.9),
  height: 5,
  frame: [13, 6, 2.2],
  sparks: (c) => {
    // Spray and mist off the churning water, bubbles rising round the arms
    c.spark(SPARK.smoke, [0, 0.25, 0], 14, { color: "#9fc4d6", size: 1.0, speed: 0.12, rise: 1.6, reach: 1.8, spread: 4.2 });
    c.spark(SPARK.mote, [0, 0.5, 0], 26, { color: "#d8f3ff", size: 0.08, speed: 0.4, rise: 0.4, reach: 2.2, spread: 3.6 });
    c.spark(SPARK.wisp, [0, 2.6, -0.3], 12, { color: "#f0abfc", size: 0.12, speed: 0.08, rise: 0.8, reach: 1.7, spread: 0.4 });
  }
};
/* ================================================================== */
/* Dagon, the Tsunami Sovereign                                        */
/* ================================================================== */

const LV = {
  body: "#0f4c6b",
  body2: "#0b3b56",
  belly: "#8fd9c8",
  fin: "#138a9c",
  glow: "#22d3ee",
  bone: "#e3f1ee",
  coral: "#f2735e",
  pearl: "#eef2f6",
  dark: "#06202f",
  water: "#0b3550",
  foam: "#8fbfd0"
};

const LV_NECK = 8;
/** Up out of the water, leaning forward at the top */
const LV_PITCH = [-1.5, -1.5, -1.42, -1.3, -1.12, -0.88, -0.6, -0.32];

/** A spined fin along a run of points: spines standing off `up`, a membrane between them */
function dorsal(c: BossCtx, pts: V3[], ups: V3[], h: (i: number) => number, color: string) {
  const tips = pts.map((p, i): V3 => [p[0] + ups[i][0] * h(i), p[1] + ups[i][1] * h(i), p[2] + ups[i][2] * h(i)]);
  pts.forEach((p, i) => spike(c, "matte", p, ups[i], 0.035, h(i) * 1.08, { color: LV.bone, seg: 5 }));
  c.k.move({ kind: MOVE.flutter, pivot: pts[0], axis: [1, 0, 0], amp: 0.025, speed: 2.6 }, () => membrane(c, "cloth", pts, tips, { color, surf: cloth(1, 1, true), rows: 2 }));
}

/** One arch of the coils breaking the water: half a ring of scaled body, spines and a fin along its crest */
function coil(c: BossCtx, name: string, at: V3, rotY: number, R: number, r: number) {
  c.bone(name, at, () =>
    c.k.at(at, rotY, () => {
      c.k.add("scales", new THREE.TorusGeometry(R, r, 10, 20, Math.PI), [0, 0, 0], undefined, { color: LV.body, surf: scalesTorus(R, r, 0.14) });
      // The pale belly along its inner side
      c.k.add("skin", new THREE.TorusGeometry(R - r * 0.42, r * 0.62, 6, 18, Math.PI), [0, 0, 0], undefined, { color: LV.belly });
      const pts: V3[] = [];
      const ups: V3[] = [];
      for (let i = 0; i <= 6; i++) {
        const a = 0.25 + (i / 6) * (Math.PI - 0.5);
        pts.push([Math.cos(a) * (R + r * 0.92), Math.sin(a) * (R + r * 0.92), 0]);
        ups.push([Math.cos(a), Math.sin(a), 0]);
      }
      dorsal(c, pts, ups, (i) => r * (0.9 + Math.sin((i / 6) * Math.PI) * 0.6), LV.fin);
      // Glowing scales down its flank
      for (let i = 0; i < 5; i++) {
        const a = 0.45 + i * 0.55;
        c.k.move({ kind: MOVE.pulse, amp: 0.6, speed: 1.9, phase: i * 0.8 + rotY }, () =>
          stud(c, "glow", [Math.cos(a) * R, Math.sin(a) * R, r * 0.96], [0, 0, 1], r * 0.12, r * 0.05, { color: LV.glow, bright: 1.4 })
        );
      }
    })
  );
}

function leviathanHead(c: BossCtx, T: V3) {
  const at = (x: number, y: number, z: number): V3 => [T[0] + x, T[1] + y, T[2] + z];
  c.bone("head", T, () => {
    // Cranium and long snout, brow ridges, nostrils
    blob(c, "scales", at(0, 0.12, 0.2), [0.42, 0.33, 0.5], { color: LV.body, surf: scalesRound(0.4, 0.12) });
    blob(c, "scales", at(0, 0.03, 0.72), [0.27, 0.19, 0.46], { color: LV.body2, surf: scalesRound(0.27, 0.1) });
    for (const s of [1, -1]) {
      blob(c, "skin", at(s * 0.24, 0.27, 0.46), [0.14, 0.07, 0.26], { color: LV.dark, rot: [0.15, s * 0.25, s * -0.3] });
      stud(c, "matte", at(s * 0.1, 0.17, 1.08), [s * 0.3, 0.6, 0.7], 0.035, 0.02, { color: "#020617" });
      // The eye: cyan, a dark slit
      c.k.add("glow", new THREE.SphereGeometry(0.075, 10, 8), at(s * 0.28, 0.17, 0.52), undefined, { color: LV.glow, bright: 1.9 });
      c.k.add("matte", new THREE.BoxGeometry(0.018, 0.1, 0.02), at(s * 0.33, 0.17, 0.55), [0, s * 0.9, 0], { color: "#020617" });
      // Upper fangs along the snout
      for (let i = 0; i < 6; i++) spike(c, "matte", at(s * (0.2 - i * 0.012), -0.1, 0.42 + i * 0.11), [0, -1, 0.15], 0.025 + (i === 1 ? 0.012 : 0), 0.13 + (i === 1 ? 0.1 : 0), { color: LV.bone, seg: 5 });
      // Horns swept back, and a lesser pair
      hook(c, "matte", at(s * 0.2, 0.36, 0.08), [s * 0.35, 0.55, -1], [0, -0.06, 0.02], 0.08, 0.95, 5, { color: LV.bone });
      hook(c, "matte", at(s * 0.33, 0.2, -0.05), [s * 0.8, 0.15, -1], [0, 0.04, 0], 0.045, 0.5, 4, { color: LV.bone });
      // Frills: a fan of spines with a web between, flaring when it roars
      c.bone(s > 0 ? "frillR" : "frillL", at(s * 0.38, 0.08, 0.15), () => {
        const root = at(s * 0.38, 0.08, 0.15);
        const roots: V3[] = [];
        const tips: V3[] = [];
        for (let i = 0; i < 5; i++) {
          const a = -0.7 + i * 0.38;
          const d: V3 = [s * 0.7, Math.sin(a), -Math.cos(a) * 0.7];
          const len = 0.55 + Math.sin((i / 4) * Math.PI) * 0.25;
          const tip: V3 = [root[0] + d[0] * len, root[1] + d[1] * len, root[2] + d[2] * len];
          seg(c, "matte", root, tip, 0.03, 0.012, { color: LV.bone, seg: 5, cap: false });
          roots.push([root[0] + d[0] * 0.05, root[1] + d[1] * 0.05, root[2] + d[2] * 0.05]);
          tips.push(tip);
        }
        c.k.move({ kind: MOVE.flutter, pivot: root, axis: [s, 0, 0], amp: 0.04, speed: 3.1, phase: s }, () => membrane(c, "cloth", roots, tips, { color: LV.fin, surf: cloth(1, 1, true), rows: 3 }));
      });
    }
    // The coral crown between the horns, pearls set in it
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.09;
      const base = at(x, 0.4 - Math.abs(i - 2) * 0.03, 0.12 + Math.abs(i - 2) * 0.03);
      const top: V3 = [base[0] + x * 0.6, base[1] + 0.22 + (i % 2) * 0.08, base[2] - 0.04];
      seg(c, "matte", base, top, 0.035, 0.022, { color: LV.coral, seg: 6 });
      seg(c, "matte", top, [top[0] + (i % 2 ? 0.07 : -0.07), top[1] + 0.1, top[2]], 0.022, 0.012, { color: LV.coral, seg: 5 });
      if (i % 2 === 0) c.k.add("gloss", new THREE.SphereGeometry(0.04, 8, 6), [top[0], top[1] + 0.02, top[2] + 0.03], undefined, { color: LV.pearl });
    }
    c.k.add("glow", new THREE.OctahedronGeometry(0.06), at(0, 0.62, 0.1), undefined, { color: LV.glow, bright: 1.8 });
    // The jaw: lower fangs, a glowing throat that shows when it gapes
    c.bone("jaw", at(0, -0.08, 0.14), () => {
      blob(c, "scales", at(0, -0.2, 0.62), [0.25, 0.1, 0.48], { color: LV.body2, surf: scalesRound(0.25, 0.1) });
      blob(c, "skin", at(0, -0.15, 0.55), [0.18, 0.06, 0.38], { color: LV.belly });
      for (const s of [1, -1]) for (let i = 0; i < 5; i++) spike(c, "matte", at(s * (0.17 - i * 0.012), -0.12, 0.5 + i * 0.11), [0, 1, 0.1], 0.02, 0.1 + (i === 0 ? 0.06 : 0), { color: LV.bone, seg: 5 });
      c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 2.6 }, () => blob(c, "glow", at(0, -0.09, 0.4), [0.14, 0.04, 0.3], { color: LV.glow, bright: 1.3 }));
    });
  });
}

function leviathan(c: BossCtx) {
  seaPool(c, 2.95, LV.water, LV.foam, [
    [2.35, 1.2, 0.36],
    [-2.5, 0.5, 0.3],
    [0.9, -2.5, 0.26]
  ]);
  // The coils arching out of the water behind it, and its tail fluke breaking the surface
  coil(c, "coilA", [-1.35, 0.06, -0.95], 0.95, 0.82, 0.38);
  coil(c, "coilB", [1.25, 0.06, -1.35], -0.6, 0.66, 0.33);
  coil(c, "coilC", [0.05, 0.06, -2.15], 0.15, 0.42, 0.22);
  c.bone("fluke", [2.05, 0.15, -0.35], () => {
    const root: V3 = [2.05, 0.15, -0.35];
    const roots: V3[] = [];
    const tips: V3[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -0.95 + i * 0.38;
      const d: V3 = [Math.sin(a) * 0.5, Math.cos(a), 0.35];
      const len = 0.75 + Math.abs(i - 2.5) * 0.12;
      const tip: V3 = [root[0] + d[0] * len, root[1] + d[1] * len, root[2] + d[2] * len];
      seg(c, "matte", root, tip, 0.03, 0.012, { color: LV.bone, seg: 5, cap: false });
      roots.push(root);
      tips.push(tip);
    }
    c.k.move({ kind: MOVE.flutter, pivot: root, axis: [0, 0, 1], amp: 0.05, speed: 2.2 }, () => membrane(c, "cloth", roots, tips, { color: LV.fin, surf: cloth(1, 1, true), rows: 3 }));
    c.k.add("scales", new THREE.CylinderGeometry(0.12, 0.2, 0.35, 10), [2.05, 0.1, -0.35], undefined, { color: LV.body, surf: scalesRound(0.16, 0.1) });
  });
  // Foam where the neck breaks the water
  c.k.move({ kind: MOVE.beat, amp: 0.08, speed: 1.3, pivot: [0, 0.17, 0] }, () => c.k.add("matte", new THREE.TorusGeometry(0.68, 0.06, 4, 24), [0, 0.17, 0], [Math.PI / 2, 0, 0], { color: LV.foam, scale: [1, 1, 0.5] }));
  // The neck rising out of the water in a long S, belly plates glowing, a fin down its back; the head on top
  const lens = Array.from({ length: LV_NECK }, () => 0.48);
  const radii = [0.5, 0.48, 0.45, 0.42, 0.39, 0.36, 0.33, 0.31, 0.3];
  chainBones(
    c,
    "neck",
    [0, -0.15, -0.1],
    lens,
    LV_PITCH,
    radii,
    { bucket: "scales", color: LV.body, seg: 12, surf: scalesRound(0.45, 0.14) },
    (j, from, to, r0, r1, dir) => {
      const belly: V3 = [0, -dir[2], dir[1]];
      const mid: V3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
      const rr = (r0 + r1) / 2;
      plate(c, "skin", [mid[0] + belly[0] * rr * 0.72, mid[1] + belly[1] * rr * 0.72, mid[2] + belly[2] * rr * 0.72], belly, dir, rr * 0.86, rr * 0.34, 0.33, { color: LV.belly });
      c.k.move({ kind: MOVE.pulse, amp: 0.7, speed: 2.4, phase: -j * 0.7 }, () =>
        stud(c, "glow", [mid[0] + belly[0] * rr * 1.04, mid[1] + belly[1] * rr * 1.04, mid[2] + belly[2] * rr * 1.04], belly, rr * 0.14, rr * 0.06, { color: LV.glow, bright: 1.5 })
      );
      const back: V3 = [0, dir[2], -dir[1]];
      const fp: V3[] = [0.15, 0.5, 0.85].map((f): V3 => [from[0] + (to[0] - from[0]) * f + back[0] * rr * 0.9, from[1] + (to[1] - from[1]) * f + back[1] * rr * 0.9, from[2] + (to[2] - from[2]) * f + back[2] * rr * 0.9]);
      dorsal(c, fp, [back, back, back], () => 0.32 - j * 0.02, LV.fin);
    },
    (tip) => leviathanHead(c, tip)
  );
}

const lvNeck = (f: (j: number) => BonePose | null): Pose => chainPose("neck", LV_NECK, f);

function leviathanIdle(c: IdleCtx) {
  // The neck sways in an S (a wave running up it), the head held steady against it and glancing round
  let yawSum = 0;
  let pitchSum = 0;
  for (let j = 0; j < LV_NECK; j++) {
    const ry = 0.055 * Math.sin(c.t * 0.8 - j * 0.55 + c.seed * 5);
    const rx = 0.03 * Math.sin(c.t * 0.63 - j * 0.45 + 1.3);
    yawSum += ry;
    pitchSum += rx;
    c.add(`neck${j}`, [rx, ry, 0.02 * Math.sin(c.t * 0.5 - j * 0.4)], null, j < 2 ? 0.015 * c.sin(1.1) : 0);
  }
  c.add("head", [-pitchSum * 0.75 + 0.04 * c.drift(0.7), -yawSum * 0.8 + 0.32 * c.glance(1, 4.8, 0.35), 0.06 * c.drift(0.45, 2)]);
  c.add("jaw", [0.1 + 0.08 * Math.max(0, c.sin(1.05)) + 0.35 * c.event(3, 9, 0.9).e, 0, 0]);
  const flare = 0.12 * c.sin(1.6);
  c.add("frillL", [0, -flare, 0]);
  c.add("frillR", [0, flare, 0]);
  // The coils ripple through the water one after another; the fluke sways
  c.add("coilA", null, [0, 0.07 * c.sin(1.1), 0]);
  c.add("coilB", null, [0, 0.07 * c.sin(1.1, -1.4), 0]);
  c.add("coilC", null, [0, 0.05 * c.sin(1.1, -2.8), 0]);
  c.add("fluke", [0.1 * c.sin(1.3), 0.25 * c.drift(0.9), 0.12 * c.sin(1.3, 1)]);
}

const LV_DEF: BossHeroDef = {
  build: leviathan,
  rest: { neck0: { r: [0.04, 0.05, 0] }, neck3: { r: [-0.03, -0.06, 0] }, head: { r: [0.12, 0.08, 0.04] }, jaw: { r: [0.05, 0, 0] }, frillL: { r: [0, 0.06, 0] } },
  idle: leviathanIdle,
  roar: {
    len: 3.2,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      // Sinks and draws its head in
      { t: 0.2, hold: true, pose: merge(lvNeck((j) => ({ r: [j < 4 ? 0.05 : 0.1, 0, 0] })), { head: { r: [0.3, 0, 0] }, jaw: { r: [0, 0, 0] } }) },
      // Rears high and back, jaws gaping, frills flared, the belly blazing
      { t: 0.42, pose: merge(lvNeck(() => ({ r: [-0.1, 0, 0], g: 1.2 })), { head: { r: [-0.55, 0, 0] }, jaw: { r: [0.95, 0, 0] }, frillL: { r: [0, -0.6, 0.1] }, frillR: { r: [0, 0.6, -0.1] } }) },
      { t: 0.74, hold: true, pose: merge(lvNeck((j) => ({ r: [-0.09, 0, 0.012 * (j - 3)], g: 0.9 })), { head: { r: [-0.48, 0.08, 0] }, jaw: { r: [0.85, 0, 0] }, frillL: { r: [0, -0.5, 0.1] }, frillR: { r: [0, 0.5, -0.1] } }) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.1, vig: 0.5, vigCol: "#083344", lines: 0.7, flash: 0.22, flashCol: "#67e8f9" } }]
  },
  attack: {
    len: 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Coils back into an S, head cocked to aim, jaws parting
      { t: 0.3, pose: merge(lvNeck((j) => ({ r: [j < 4 ? -0.12 : 0.05, 0, 0] })), { head: { r: [0.25, 0, 0] }, jaw: { r: [0.5, 0, 0] } }) },
      { t: 0.42, hold: true, pose: merge(lvNeck((j) => ({ r: [j < 4 ? -0.15 : 0.08, 0, 0] })), { head: { r: [0.3, 0, 0] }, jaw: { r: [0.9, 0, 0] } }) },
      // Lunges down and forward; the jaws snap shut on the impact
      { t: 0.55, pose: merge(lvNeck((j) => ({ r: [0.095, 0, 0], g: 0.6 })), { head: { r: [0.12, 0, 0] }, jaw: { r: [-0.05, 0, 0] } }) },
      { t: 0.66, pose: merge(lvNeck((j) => ({ r: [0.108, 0, 0] })), { head: { r: [0.16, 0, 0] }, jaw: { r: [0, 0, 0] } }) },
      { t: 0.85, hold: true, pose: merge(lvNeck(() => ({ r: [0.025, 0, 0] })), { head: { r: [0.05, 0, 0] } }) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.55, burst: true, cine: { quake: 0.2, stop: 0.08, flash: 0.42, flashCol: "#a5f3fc", lines: 0.8, vig: 0.3, vigCol: "#083344" } }]
  },
  lag: { ...chainLag("neck", LV_NECK, 0.03), head: 0.27, jaw: 0.29, frillL: 0.32, frillR: 0.32 },
  springs: { frillL: 90, frillR: 90, fluke: 60 },
  burst: { at: [0, 0.3, 2.6], color: "#bfe9ff", count: 80, speed: 3.0, spread: 1.4, size: 0.22, gravity: 7 },
  aura: aura("#0891b2", "#cffafe", 2.9),
  height: 5,
  frame: [13, 6, 2.2],
  sparks: (c) => {
    c.spark(SPARK.smoke, [0, 0.25, 0], 14, { color: "#9fc4d6", size: 1.0, speed: 0.12, rise: 1.6, reach: 1.8, spread: 4.2 });
    c.spark(SPARK.mote, [0, 0.5, 0], 26, { color: "#d8f3ff", size: 0.08, speed: 0.4, rise: 0.4, reach: 2.2, spread: 3.6 });
    c.spark(SPARK.wisp, [0, 2.4, 0.6], 12, { color: "#67e8f9", size: 0.12, speed: 0.08, rise: 1.2, reach: 1.4, spread: 0.6 });
  }
};

/* ================================================================== */
/* The Siren Broodmother                                               */
/* ================================================================== */

const SR = {
  skin: "#a7bcc2",
  skin2: "#8ea5ad",
  shadow: "#5d727a",
  tail: "#0f5e57",
  tail2: "#0b4a44",
  fin: "#16a394",
  scale: "#2dd4bf",
  hair: "#10302a",
  bone: "#e8e0cc",
  spine: "#9db7ae",
  claw: "#e5e7eb",
  eye: "#a3e635",
  pearl: "#eef2f6",
  coral: "#f2735e",
  rock: "#3a3f47",
  rock2: "#4b515a",
  kelp: "#2f5d32",
  water: "#0b3550",
  foam: "#8fbfd0"
};

/** Where her tail winds down and round the rock into the water */
const SR_TAIL: V3[] = [
  [0, 1.9, 0.1],
  [0.38, 1.6, 0.55],
  [0.86, 1.3, 0.78],
  [1.28, 1.0, 0.5],
  [1.48, 0.72, -0.08],
  [1.45, 0.45, -0.72],
  [0.98, 0.24, -1.32],
  [0.25, 0.12, -1.78]
];
const SR_HAIR = 7;

function sirenArm(c: BossCtx, s: number) {
  const side = s > 0 ? "R" : "L";
  const sh: V3 = [s * 0.44, 3.1, 0.08];
  const el: V3 = [s * 0.74, 2.72, 0.32];
  const wr: V3 = [s * 0.88, 2.44, 0.72];
  c.bone(`shoulder${side}`, sh, () => {
    blob(c, "skin", sh, [0.13, 0.12, 0.12], { color: SR.skin2 });
    seg(c, "skin", sh, el, 0.085, 0.065, { color: SR.skin, seg: 8 });
    c.bone(`elbow${side}`, el, () => {
      seg(c, "skin", el, wr, 0.065, 0.05, { color: SR.skin, seg: 8 });
      // A fin down the back of the forearm
      membrane(c, "cloth", [el, [(el[0] + wr[0]) / 2, (el[1] + wr[1]) / 2, (el[2] + wr[2]) / 2], wr], [[el[0] + s * 0.06, el[1] - 0.04, el[2] - 0.05], [(el[0] + wr[0]) / 2 + s * 0.13, (el[1] + wr[1]) / 2 - 0.12, (el[2] + wr[2]) / 2 - 0.08], [wr[0] + s * 0.03, wr[1] - 0.02, wr[2] - 0.02]], { color: SR.fin, rows: 1 });
      c.bone(`wrist${side}`, wr, () => {
        blob(c, "skin", [wr[0], wr[1] - 0.03, wr[2] + 0.07], [0.07, 0.05, 0.1], { color: SR.skin2 });
        // Four long hooked claws, half curled
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * 0.035 * s;
          hook(c, "matte", [wr[0] + x, wr[1] - 0.04, wr[2] + 0.14], [x * 2, -0.35, 1], [0, -0.22, -0.06], 0.022, 0.32 - Math.abs(i - 1.5) * 0.04, 4, { color: SR.claw });
        }
        hook(c, "matte", [wr[0] - s * 0.06, wr[1] - 0.02, wr[2] + 0.06], [-s * 0.6, -0.4, 0.6], [0, -0.15, 0], 0.02, 0.18, 3, { color: SR.claw });
      });
    });
  });
}

function siren(c: BossCtx) {
  const r = c.rng;
  seaPool(c, 2.85, SR.water, SR.foam, [
    [-2.2, 1.35, 0.34],
    [2.35, 1.1, 0.24]
  ]);
  // Her rock: wet, in strata, crusted with shells, coral and the bones of sailors; kelp swaying off it
  c.k.add("rock", craggy(new THREE.CylinderGeometry(0.95, 1.75, 1.55, 14, 4), 0.14, 7, 0.775), [0, 0.775, 0], undefined, { color: SR.rock, surf: STRATA });
  c.k.add("rock", rubble(0.62, 3), [-1.25, 0.35, -0.75], [0, 0.6, 0], { color: SR.rock2 });
  c.k.add("rock", rubble(0.45, 5), [-0.55, 0.3, 1.25], [0, 1.6, 0], { color: SR.rock2 });
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU;
    const y = 0.35 + r() * 1.05;
    const rad = 1.75 - (0.8 * y) / 1.55;
    const [x, z] = [Math.sin(a) * rad, Math.cos(a) * rad];
    if (i % 3 === 0) {
      // A fan shell
      const n: V3 = [Math.sin(a), 0.2, Math.cos(a)];
      for (let f = 0; f < 5; f++) spike(c, "matte", [x, y, z], [n[0] + (f - 2) * 0.25 * Math.cos(a), 0.6, n[2] - (f - 2) * 0.25 * Math.sin(a)], 0.03, 0.17, { color: f % 2 ? "#f5e6d3" : "#e9cfb3", seg: 4 });
    } else if (i % 3 === 1) {
      // Coral
      const base: V3 = [x, y, z];
      for (let b = 0; b < 3; b++) seg(c, "matte", base, [x + Math.sin(a + b - 1) * 0.16, y + 0.2 + b * 0.04, z + Math.cos(a + b - 1) * 0.16], 0.03, 0.015, { color: SR.coral, seg: 5 });
    } else c.k.add("gloss", new THREE.SphereGeometry(0.05, 8, 6), [x, y, z], undefined, { color: SR.pearl });
  }
  // A sailor's skull and ribs on the ledge, a broken oar
  c.k.add("matte", new THREE.SphereGeometry(0.15, 10, 8), [-0.75, 1.62, 0.32], undefined, { color: SR.bone, scale: [1, 0.9, 1.1] });
  for (const sx of [1, -1]) stud(c, "matte", [-0.75 + sx * 0.06, 1.63, 0.46], [sx * 0.3, 0, 1], 0.035, 0.012, { color: "#1c1917" });
  for (let i = 0; i < 3; i++) c.k.add("matte", new THREE.TorusGeometry(0.16 - i * 0.02, 0.018, 4, 10, Math.PI), [-0.45 + i * 0.1, 1.56, -0.42], [0, 1.3, 0], { color: SR.bone });
  c.k.along("matte", [0.55, 1.55, -0.5], [1.2, 0.35, -1.65], 0.04, { color: "#6b4426" });
  for (let i = 0; i < 4; i++) {
    const a = 0.7 + i * 1.5;
    const base: V3 = [Math.sin(a) * 1.68, 0.12, Math.cos(a) * 1.68];
    c.k.move({ kind: MOVE.sway, pivot: base, amp: 0.12, speed: 1.1, phase: i * 1.7 }, () => seg(c, "leaf", base, [base[0] * 1.08, 0.75 + (i % 2) * 0.3, base[2] * 1.08], 0.05, 0.02, { color: SR.kelp, seg: 5 }));
  }
  // The tail, scaled, winding down and round the rock; its fluke rising out of the water behind
  pathBones(
    c,
    "tail",
    SR_TAIL,
    [0.36, 0.33, 0.3, 0.26, 0.23, 0.2, 0.16, 0.12],
    { bucket: "scales", color: SR.tail, seg: 10, surf: scalesRound(0.3, 0.1) },
    (j, from, to, r0) => {
      if (j % 2 === 0) spike(c, "cloth", [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + r0 * 0.8, (from[2] + to[2]) / 2], [0, 1, -0.3], r0 * 0.25, r0 * 0.9, { color: SR.fin, seg: 3 });
    },
    (at) => {
      c.bone("fluke", at, () => {
        for (const s of [1, -1]) {
          const roots: V3[] = [];
          const tips: V3[] = [];
          for (let i = 0; i < 4; i++) {
            const a = 0.15 + i * 0.32;
            const d: V3 = [s * Math.sin(a) * 0.8, 0.55 + Math.cos(a) * 0.4, -0.6];
            const tip: V3 = [at[0] + d[0], at[1] + d[1], at[2] + d[2]];
            seg(c, "matte", at, tip, 0.025, 0.01, { color: SR.bone, seg: 4, cap: false });
            roots.push(at);
            tips.push(tip);
          }
          c.k.move({ kind: MOVE.flutter, pivot: at, axis: [1, 0, 0], amp: 0.05, speed: 2.4, phase: s }, () => membrane(c, "cloth", roots, tips, { color: SR.fin, surf: cloth(1, 1, true), rows: 3 }));
        }
      });
    }
  );
  c.bone("waist", [0, 1.9, 0.1], () => {
    // Hips in scales, the narrow waist
    blob(c, "scales", [0, 1.95, 0.1], [0.42, 0.3, 0.34], { color: SR.tail, surf: scalesRound(0.4, 0.1) });
    seg(c, "skin", [0, 2.02, 0.1], [0, 2.58, 0.12], 0.31, 0.27, { color: SR.skin, seg: 12 });
    c.bone("chest", [0, 2.55, 0.12], () => {
      // A gaunt ribbed chest under a bodice of shell scales, collarbones, a necklace of pearls with a glowing stone
      const CH: [V3, V3] = [[0, 2.86, 0.08], [0.35, 0.37, 0.23]];
      blob(c, "skin", CH[0], CH[1], { color: SR.skin, wd: 16, hd: 12 });
      for (const s of [1, -1]) blob(c, "skin", [s * 0.3, 3.06, 0.06], [0.16, 0.12, 0.15], { color: SR.skin2 });
      for (const s of [1, -1]) {
        for (let i = 0; i < 4; i++) c.k.add("skin", new THREE.TorusGeometry(0.31 - i * 0.015, 0.026, 4, 10, 1.1), [s * 0.04, 2.6 + i * 0.09, 0.05], [0, s > 0 ? -0.15 : Math.PI + 0.15, s * -0.25], { color: SR.skin2 });
        seg(c, "skin", [s * 0.06, 3.14, 0.24], [s * 0.38, 3.12, 0.12], 0.028, 0.024, { color: SR.skin2, seg: 6 });
      }
      // A bodice of overlapping shell scales over the breast
      for (let row = 0; row < 3; row++)
        for (let k = -3; k <= 3; k++) {
          const { p, n } = onBlob(CH[0], CH[1], [0, 0, 0], [k * 0.22 + (row % 2) * 0.11, 0.42 - row * 0.2, 0.92]);
          if (Math.abs(k) === 3 && row === 2) continue;
          stud(c, "scales", [p[0] + n[0] * 0.01, p[1] + n[1] * 0.01, p[2] + n[2] * 0.01], [n[0], n[1] + 0.35, n[2]], 0.075, 0.028, { color: row === 1 ? SR.scale : "#22b8a5", wd: 8 });
        }
      for (let i = 0; i < 9; i++) {
        const a = -0.9 + (i / 8) * 1.8;
        const p: V3 = [Math.sin(a) * 0.27, 3.08 - Math.cos(a) * 0.1, 0.2 + Math.cos(a) * 0.14];
        c.k.add("gloss", new THREE.SphereGeometry(0.03, 7, 5), p, undefined, { color: SR.pearl });
      }
      c.k.move({ kind: MOVE.pulse, amp: 0.5, speed: 2 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.06), [0, 2.95, 0.36], undefined, { color: SR.eye, bright: 1.7, scale: [1, 1.5, 0.6] }));
      // The fin-wings on her back: long spines with a torn web between, flaring when she screams
      for (const s of [1, -1]) {
        const root: V3 = [s * 0.24, 3.0, -0.16];
        c.bone(s > 0 ? "wingR" : "wingL", root, () => {
          const roots: V3[] = [];
          const tips: V3[] = [];
          for (let i = 0; i < 5; i++) {
            const a = 0.2 + i * 0.3;
            const len = 1.55 + Math.sin((i / 4) * Math.PI) * 0.55;
            const d = new THREE.Vector3(s * Math.cos(a) * 0.85, Math.sin(a) * 0.95 - 0.1, -0.55).normalize();
            const tip: V3 = [root[0] + d.x * len, root[1] + d.y * len, root[2] + d.z * len];
            hook(c, "matte", root, d.toArray() as V3, [0, -0.04, 0], 0.028, len, 3, { color: SR.spine });
            roots.push([root[0] + d.x * 0.12, root[1] + d.y * 0.12, root[2] + d.z * 0.12]);
            tips.push(tip);
          }
          c.k.move({ kind: MOVE.flutter, pivot: root, axis: [0, 0, 1], amp: 0.04, speed: 1.9, phase: s * 1.3 }, () => membrane(c, "cloth", roots, tips, { color: SR.fin, surf: cloth(1, 1, true), rows: 4 }));
        });
      }
      sirenArm(c, 1);
      sirenArm(c, -1);
      c.bone("neck", [0, 3.18, 0.1], () => {
        seg(c, "skin", [0, 3.14, 0.1], [0, 3.48, 0.14], 0.11, 0.095, { color: SR.skin2, seg: 8 });
        c.bone("head", [0, 3.46, 0.13], () => {
          // A gaunt face: hollow cheeks, burning eyes in dark sockets
          blob(c, "skin", [0, 3.73, 0.08], [0.23, 0.28, 0.26], { color: SR.skin, wd: 16, hd: 12 });
          // Hair over the crown and back of the head, a lock either side of the face
          blob(c, "matte", [0, 3.84, 0.0], [0.26, 0.25, 0.28], { color: SR.hair, wd: 14, hd: 10 });
          for (const s of [1, -1])
            c.k.at([s * 0.19, 3.8, 0.12], s * 0.35, () => chainBones(c, `lock${s > 0 ? "R" : "L"}`, [0, 0, 0], [0.28, 0.3, 0.3], [1.25, 1.35, 1.2], [0.05, 0.042, 0.03, 0.01], { bucket: "matte", color: SR.hair, seg: 6 }));
          c.k.add("matte", new THREE.BoxGeometry(0.11, 0.012, 0.02), [0, 3.6, 0.305], undefined, { color: "#1f2a30" });
          for (const s of [1, -1]) {
            blob(c, "skin", [s * 0.12, 3.66, 0.22], [0.075, 0.05, 0.07], { color: SR.skin });
            blob(c, "skin", [s * 0.1, 3.58, 0.2], [0.05, 0.05, 0.05], { color: SR.shadow });
            blob(c, "skin", [s * 0.09, 3.79, 0.27], [0.075, 0.022, 0.035], { color: SR.shadow, rot: [0, 0, s * 0.25] });
            blob(c, "skin", [s * 0.085, 3.74, 0.26], [0.06, 0.045, 0.04], { color: "#1f2a30" });
            c.k.add("glow", new THREE.SphereGeometry(0.032, 8, 6), [s * 0.085, 3.74, 0.29], undefined, { color: SR.eye, bright: 2 });
            // Fin ears
            membrane(c, "cloth", [[s * 0.21, 3.78, 0.05], [s * 0.22, 3.68, 0.02]], [[s * 0.38, 3.92, -0.06], [s * 0.34, 3.66, -0.08]], { color: SR.fin, rows: 1 });
          }
          spike(c, "skin", [0, 3.7, 0.3], [0, -0.3, 1], 0.03, 0.07, { color: SR.skin2, seg: 5 });
          c.k.move({ kind: MOVE.pulse, amp: 0.45, speed: 3.1 }, () => blob(c, "glow", [0, 3.6, 0.22], [0.08, 0.04, 0.05], { color: SR.eye, bright: 1.3 }));
          for (let i = 0; i < 6; i++) spike(c, "matte", [(i - 2.5) * 0.026, 3.62, 0.27], [0, -1, 0.1], 0.008, 0.04, { color: SR.claw, seg: 4 });
          c.bone("jaw", [0, 3.62, 0.12], () => {
            blob(c, "skin", [0, 3.53, 0.2], [0.12, 0.07, 0.12], { color: SR.skin2 });
            for (let i = 0; i < 5; i++) spike(c, "matte", [(i - 2) * 0.028, 3.57, 0.27], [0, 1, 0.1], 0.008, 0.035, { color: SR.claw, seg: 4 });
          });
          // A crown of bone spikes, coral and pearls
          for (let i = 0; i < 7; i++) {
            const a = -1.2 + (i / 6) * 2.4;
            const base: V3 = [Math.sin(a) * 0.19, 3.92 + Math.cos(a) * 0.03, 0.05 + Math.cos(a) * 0.1];
            spike(c, "matte", base, [Math.sin(a) * 0.4, 1, -0.15], 0.025, 0.2 + (i === 3 ? 0.14 : 0) + (i % 2) * 0.05, { color: i % 2 ? SR.coral : SR.bone, seg: 5 });
            if (i % 2 === 0) c.k.add("gloss", new THREE.SphereGeometry(0.028, 7, 5), [base[0], base[1] + 0.02, base[2] + 0.03], undefined, { color: SR.pearl });
          }
          // Long dark hair streaming down her back
          for (let h = 0; h < SR_HAIR; h++) {
            const a = (h - (SR_HAIR - 1) / 2) * 0.32;
            c.k.at([Math.sin(a) * 0.18, 3.86, -0.05 - Math.cos(a) * 0.06], Math.PI + a * 0.8, () =>
              chainBones(c, `hair${h}_`, [0, 0, 0], [0.34, 0.34, 0.32, 0.3], [0.6 + r() * 0.3, 0.95, 1.15, 1.25], [0.05, 0.045, 0.035, 0.022, 0.008], { bucket: "matte", color: SR.hair, seg: 6 })
            );
          }
        });
      });
    });
  });
}

const srHair = (f: (h: number, j: number) => BonePose | null): Pose => merge(...Array.from({ length: SR_HAIR }, (_, h) => chainPose(`hair${h}_`, 4, (j) => f(h, j))));

function sirenIdle(c: IdleCtx) {
  // She breathes, sways on her tail, tilts her head, flexes her claws; her wings fan, her hair drifts
  const breath = c.sin(1.15);
  c.add("chest", [0.03 * c.drift(0.45), 0.08 * c.drift(0.31, 1), 0.04 * c.drift(0.37, 2)], [0, 0.02 * breath, 0], 0.02 * breath);
  c.add("waist", [0.02 * c.drift(0.3), 0.05 * c.drift(0.22, 4), 0]);
  c.add("head", [0.08 * c.drift(0.5, 1) + 0.12 * c.event(4, 7, 1.4).e, 0.35 * c.glance(1, 4.2, 0.4), 0.18 * c.drift(0.35, 2)]);
  c.add("jaw", [0.12 * Math.max(0, c.sin(0.8)), 0, 0]);
  c.add("shoulderL", [0.1 * c.drift(0.6, 1), 0, 0.06 * c.drift(0.5)]);
  c.add("shoulderR", [0.08 * c.drift(0.53, 3), 0, -0.07 * c.drift(0.44, 1)]);
  const flex = c.event(5, 5.5, 0.8);
  c.add("wristL", [0.25 * flex.e, 0, 0]);
  c.add("wristR", [0.18 * c.drift(0.9), 0, 0.1 * c.drift(0.7)]);
  const fan = c.sin(0.9);
  c.add("wingL", [0.05 * fan, -0.12 * fan, 0.05 * c.drift(0.6)]);
  c.add("wingR", [0.05 * c.sin(0.9, 0.4), 0.12 * c.sin(0.9, 0.4), -0.05 * c.drift(0.6, 2)]);
  for (let h = 0; h < SR_HAIR; h++) for (let j = 0; j < 4; j++) c.add(`hair${h}_${j}`, [0.05 * Math.sin(c.t * 1.1 - j * 0.8 + h), 0.06 * Math.sin(c.t * 0.8 - j * 0.6 + h * 1.7), 0]);
  for (const side of ["L", "R"]) for (let j = 0; j < 3; j++) c.add(`lock${side}${j}`, [0.04 * Math.sin(c.t * 1.2 - j * 0.8 + (side === "L" ? 0 : 2)), 0.05 * Math.sin(c.t * 0.9 - j * 0.6), 0]);
  for (let j = 3; j < SR_TAIL.length - 1; j++) c.add(`tail${j}`, [0, 0.03 * Math.sin(c.t * 1.2 - j * 0.7), 0]);
  c.add("fluke", [0.12 * c.sin(1.4), 0.2 * c.drift(0.8), 0]);
}

const SR_DEF: BossHeroDef = {
  build: siren,
  // Head tipped, one shoulder dropped, claws carried at different heights: never a mirrored pose
  rest: { head: { r: [0.1, 0.12, -0.1] }, chest: { r: [0.04, -0.06, 0.03] }, shoulderL: { r: [0.15, 0, 0.12] }, shoulderR: { r: [-0.05, 0, -0.08] }, elbowL: { r: [0.25, 0, 0] }, elbowR: { r: [0.1, 0.05, 0] }, wristL: { r: [0.2, 0, 0.1] }, wristR: { r: [0.05, 0, -0.15] } },
  idle: sirenIdle,
  roar: {
    len: 3.0,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      // Draws in, hunched, wings folding
      { t: 0.22, hold: true, pose: { chest: { r: [0.22, 0, 0] }, head: { r: [0.2, 0, 0] }, shoulderL: { r: [0.3, 0, -0.2] }, shoulderR: { r: [0.3, 0, 0.2] }, wingL: { r: [0, 0.2, 0] }, wingR: { r: [0, -0.2, 0] } } },
      // The screech: back arched, head thrown back, jaw dropped, arms and wings flung wide
      {
        t: 0.42,
        pose: merge(
          { waist: { r: [-0.1, 0, 0] }, chest: { r: [-0.3, 0, 0], g: 1 }, head: { r: [-0.45, 0, 0], g: 1.5 }, jaw: { r: [0.75, 0, 0] }, shoulderL: { r: [-0.5, 0, -0.9] }, shoulderR: { r: [-0.5, 0, 0.9] }, elbowL: { r: [-0.4, 0, 0] }, elbowR: { r: [-0.4, 0, 0] }, wingL: { r: [0, 0.35, -0.3] }, wingR: { r: [0, -0.35, 0.3] } },
          srHair((h, j) => ({ r: [-0.25, 0, 0] }))
        )
      },
      { t: 0.74, hold: true, pose: merge({ waist: { r: [-0.08, 0, 0] }, chest: { r: [-0.26, 0, 0.03], g: 0.8 }, head: { r: [-0.4, 0.06, 0], g: 1.2 }, jaw: { r: [0.7, 0, 0] }, shoulderL: { r: [-0.45, 0, -0.8] }, shoulderR: { r: [-0.45, 0, 0.8] }, elbowL: { r: [-0.35, 0, 0] }, elbowR: { r: [-0.35, 0, 0] }, wingL: { r: [0, 0.3, -0.26] }, wingR: { r: [0, -0.3, 0.26] } }, srHair(() => ({ r: [-0.2, 0, 0] }))) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.08, vig: 0.6, vigCol: "#1a2e05", lines: 0.9, flash: 0.25, flashCol: "#bef264" } }]
  },
  attack: {
    len: 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Rears back, both clawed hands raised high
      { t: 0.3, pose: { waist: { r: [-0.08, 0, 0] }, chest: { r: [-0.22, 0, 0] }, head: { r: [0.1, 0, 0] }, jaw: { r: [0.4, 0, 0] }, shoulderL: { r: [-1.3, 0, -0.35] }, shoulderR: { r: [-1.25, 0, 0.35] }, elbowL: { r: [-0.6, 0, 0] }, elbowR: { r: [-0.55, 0, 0] }, wristL: { r: [-0.4, 0, 0] }, wristR: { r: [-0.4, 0, 0] }, wingL: { r: [0, -0.25, 0] }, wingR: { r: [0, 0.25, 0] } } },
      { t: 0.42, hold: true, pose: { waist: { r: [-0.1, 0, 0] }, chest: { r: [-0.26, 0, 0] }, head: { r: [0.12, 0, 0] }, jaw: { r: [0.55, 0, 0] }, shoulderL: { r: [-1.45, 0, -0.35] }, shoulderR: { r: [-1.4, 0, 0.35] }, elbowL: { r: [-0.7, 0, 0] }, elbowR: { r: [-0.65, 0, 0] }, wristL: { r: [-0.5, 0, 0] }, wristR: { r: [-0.5, 0, 0] }, wingL: { r: [0, -0.3, 0] }, wingR: { r: [0, 0.3, 0] } } },
      // The rake: both claws tear down and across, her body lunging after them
      { t: 0.55, pose: { waist: { r: [0.12, 0, 0] }, chest: { r: [0.35, 0, 0], g: 0.6 }, head: { r: [0.15, 0, 0] }, jaw: { r: [0.6, 0, 0] }, shoulderL: { r: [0.35, 0, 0.25] }, shoulderR: { r: [0.4, 0, -0.25] }, elbowL: { r: [0.3, 0, 0] }, elbowR: { r: [0.3, 0, 0] }, wristL: { r: [0.5, 0, 0] }, wristR: { r: [0.5, 0, 0] } } },
      { t: 0.66, pose: { waist: { r: [0.15, 0, 0] }, chest: { r: [0.42, 0, 0] }, head: { r: [0.2, 0, 0] }, shoulderL: { r: [0.6, 0, 0.35] }, shoulderR: { r: [0.65, 0, -0.35] }, elbowL: { r: [0.35, 0, 0] }, elbowR: { r: [0.35, 0, 0] }, wristL: { r: [0.6, 0, 0] }, wristR: { r: [0.6, 0, 0] } } },
      { t: 0.85, hold: true, pose: { chest: { r: [0.1, 0, 0] }, shoulderL: { r: [0.15, 0, 0.1] }, shoulderR: { r: [0.15, 0, -0.1] } } },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.55, burst: true, cine: { quake: 0.16, stop: 0.07, flash: 0.4, flashCol: "#d9f99d", lines: 0.85, vig: 0.3, vigCol: "#1a2e05" } }]
  },
  lag: { elbowL: 0.04, elbowR: 0.05, wristL: 0.08, wristR: 0.09, head: 0.05, ...Object.assign({}, ...Array.from({ length: SR_HAIR }, (_, h) => chainLag(`hair${h}_`, 4, 0.05, 0.06))) },
  springs: { ...Object.assign({}, ...Array.from({ length: SR_HAIR }, (_, h) => chainSprings(`hair${h}_`, 4, 45))), ...chainSprings("lockL", 3, 50), ...chainSprings("lockR", 3, 50), wingL: 70, wingR: 70, fluke: 60 },
  burst: { at: [0, 0.4, 2.1], color: "#d9f99d", count: 70, speed: 2.8, spread: 1.4, size: 0.2, gravity: 7 },
  aura: aura("#65a30d", "#ecfccb", 2.8),
  height: 5,
  frame: [13, 6, 2.6],
  sparks: (c) => {
    c.spark(SPARK.smoke, [0, 0.25, 0], 12, { color: "#9fc4d6", size: 1.0, speed: 0.12, rise: 1.6, reach: 1.8, spread: 4.0 });
    c.spark(SPARK.mote, [0, 0.5, 0], 22, { color: "#d8f3ff", size: 0.08, speed: 0.4, rise: 0.4, reach: 2.2, spread: 3.4 });
    c.spark(SPARK.wisp, [0, 3.2, 0.1], 14, { color: "#bef264", size: 0.11, speed: 0.07, rise: 1.0, reach: 1.3, spread: 0.5 });
  }
};

export const SEA_BOSSES: Record<string, BossHeroDef> = {
  "boss-kraken": KR_DEF,
  "boss-leviathan": LV_DEF,
  "boss-siren": SR_DEF
};

