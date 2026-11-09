import * as THREE from "three";
import { MOVE, TAU, V3, craggy, rubble } from "./heroKit";
import { SPARK, scalesRound, veins } from "./heroMaterials";
import { BossCtx, BossHeroDef, BonePose, IdleCtx, Pose } from "./heroRig";
import { blob, chainBones, chainLag, chainPose, chainSprings, hook, membrane, merge, plate, seg, spike } from "./bossParts";

/* ------------------------------------------------------------------------- */
/* World bosses of the sky: the Molten Greatwyrm and the Queen of the Fae Court */
/* ------------------------------------------------------------------------- */

/*
 * As the other bosses, but airborne: each flies over its roost. The idle carries the body bone along its own path
 * (`flight`: a figure of eight that drifts, so never a circle), heading along it, banking into its turns and pitching
 * with its climb, and beats the wings on an uneven stroke (a fast downstroke that heaves the body, a slower recovery)
 * with seeded glides; it carries these at full weight (`IdleCtx.carry`), so an action plays over a flyer that keeps
 * beating, and eases its path back to hover over the roost (`IdleCtx.busy`) while the action is on.
 */

// No beam over a world boss: embers and its own sparks only
const aura = (color: string, hot: string, radius: number): BossHeroDef["aura"] => ({
  embers: { inner: Math.max(0.4, radius - 1.2), outer: radius + 0.3, height: 7, count: 90 },
  color,
  hot
});

const mid = (a: V3, b: V3, f = 0.5): V3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sideOf = (s: number) => (s > 0 ? "R" : "L");

/** A turn (as Euler angles) that points +z along `dir` */
function eulerTo(dir: V3): V3 {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}

/**
 * A bone hinged along a line: it pivots at `at`, and its frame's z runs along `axis`, so its roll (`r[2]`) turns it
 * about that line (a wing about the edge it shares with the body, so the membranes between them stay joined).
 * `body` adds its parts in the model's own coordinates, as everywhere else.
 */
function hinge(c: BossCtx, name: string, at: V3, axis: V3, body: () => void) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const inv = new THREE.Matrix4().compose(new THREE.Vector3(...at), q, new THREE.Vector3(1, 1, 1)).invert();
  const ip = new THREE.Vector3();
  const iq = new THREE.Quaternion();
  inv.decompose(ip, iq, new THREE.Vector3());
  const ie = new THREE.Euler().setFromQuaternion(iq);
  c.k.frame(at, [e.x, e.y, e.z], 1, () => c.bone(name, [0, 0, 0], () => c.k.frame(ip.toArray() as V3, [ie.x, ie.y, ie.z], 1, body)));
}

/**
 * One wing stroke at `p` (0–1 through the beat): `w` the wing's height (1 up, −1 down), `heave` how hard it is pushing
 * the body up. The downstroke takes the first 40% and drives; the recovery is slower and lets the body sink a little.
 */
function stroke(p: number): { w: number; heave: number } {
  const q = ((p % 1) + 1) % 1;
  if (q < 0.4) return { w: Math.cos((Math.PI * q) / 0.4), heave: Math.sin((Math.PI * q) / 0.4) };
  const r = (q - 0.4) / 0.6;
  return { w: -Math.cos(Math.PI * r), heave: -0.35 * Math.sin(Math.PI * r) };
}

/**
 * A flyer's path over its roost, carried on `bone`: a figure of eight along x (`rx` across, `rz` deep) that drifts,
 * bobbing `bob`; it heads along it (`heading` 1: fully; less turns the body only partly into its travel), banks into its
 * turns and pitches with its climb. Eased out while an action is on, and slowed and shrunk while it slumbers.
 */
function flight(c: IdleCtx, bone: string, o: { rx: number; rz: number; bob: number; f: number; heading: number; bank: number }) {
  const free = (1 - c.busy) * (c.asleep ? 0.35 : 1);
  const at = (t: number) => {
    const a = t * o.f + c.seed * 7;
    const drift = 0.18 * Math.sin(t * o.f * 0.31 + c.seed * 3);
    const x = o.rx * (Math.sin(a) + drift);
    const z = o.rz * (0.5 * Math.sin(2 * a) + 0.12 * Math.sin(t * o.f * 0.53 + c.seed * 5));
    const y = o.bob * (Math.sin(a * 1.3 + 0.7) * 0.7 + Math.sin(t * o.f * 0.71 + c.seed) * 0.3);
    return { x, y, z };
  };
  const dt = 0.08;
  const p0 = at(c.t - dt);
  const p1 = at(c.t);
  const p2 = at(c.t + dt);
  // Heading measured from straight ahead's opposite, so a figure of eight (which never flies straight at +z) never wraps
  const head = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.atan2(-(b.x - a.x), -(b.z - a.z)) + Math.PI;
  const h1 = head(p0, p2);
  const turn = (head(p1, p2) - head(p0, p1)) / dt;
  const climb = (p2.y - p0.y) / (2 * dt);
  // Straight ahead is 0 or a full turn, whichever is nearer: ease toward it
  const ahead = h1 > Math.PI ? TAU : 0;
  const yaw = o.heading >= 1 ? ahead + (h1 - ahead) * free : Math.sin(h1) * -0.5 * o.heading * free;
  c.carry(bone, [-climb * 0.25 * free, yaw, -o.bank * turn * free], [p1.x * free, p1.y * free, p1.z * free]);
}

/* ================================================================== */
/* Ignis Molten Greatwyrm                                              */
/* ================================================================== */

const DR = {
  scale: "#7a1a14",
  scale2: "#4a0d0a",
  belly: "#c0701e",
  horn: "#18161a",
  membrane: "#5e1210",
  membrane2: "#7a1c14",
  fang: "#f3e8cf",
  eye: "#fde047",
  fire: "#f97316",
  fire2: "#fde047",
  lava: "#ff5a14",
  rock: "#2a2522",
  ash: "#3a3330",
  obsidian: "#141218"
};
/** Where the body hangs when it hovers over its roost */
const DR_B: V3 = [0, 4.0, 0];
const DR_NECK = 5;
const DR_TAIL = 7;

function dragonWing(c: BossCtx, s: number) {
  const S = sideOf(s);
  const sh: V3 = [s * 0.55, 4.42, 0.55];
  const hip: V3 = [s * 0.5, 4.0, -1.2];
  const el: V3 = [s * 1.95, 4.78, 0.22];
  const pin: V3 = [s * 1.95, 3.98, -1.3];
  const wr: V3 = [s * 3.25, 5.02, -0.18];
  const f1: V3 = [s * 5.3, 4.55, -0.65];
  const f2: V3 = [s * 4.65, 3.95, -1.65];
  const f3: V3 = [s * 3.6, 3.62, -2.25];
  hinge(c, `wing${S}`, sh, sub(hip, sh), () => {
    blob(c, "scales", sh, [0.26, 0.24, 0.3], { color: DR.scale, wd: 10, hd: 7 });
    seg(c, "scales", sh, el, 0.17, 0.12, { color: DR.scale, seg: 9, surf: scalesRound(0.15, 0.08) });
    membrane(c, "cloth", [sh, mid(sh, hip), hip], [el, mid(el, pin), pin], { color: DR.membrane, rows: 3 });
    hinge(c, `tip${S}`, el, sub(pin, el), () => {
      blob(c, "scales", el, [0.14, 0.14, 0.14], { color: DR.scale2, wd: 8, hd: 6 });
      seg(c, "scales", el, wr, 0.12, 0.09, { color: DR.scale, seg: 8, surf: scalesRound(0.1, 0.07) });
      for (const f of [f1, f2, f3]) seg(c, "gloss", wr, f, 0.075, 0.025, { color: DR.horn, seg: 6 });
      // The thumb claw at the wrist
      hook(c, "gloss", wr, [s * 0.2, 0.7, 0.7], [0, -0.15, 0.1], 0.06, 0.4, 3, { color: DR.horn });
      // The membranes: from the elbow's hinge out to the last finger, then between the fingers; leathery, veined dark
      membrane(c, "cloth", [el, mid(el, pin), pin], [wr, mid(wr, f3), f3], { color: DR.membrane, rows: 3 });
      membrane(c, "cloth", [wr, mid(wr, f3, 0.6), f3], [wr, mid(wr, f2, 0.6), f2], { color: DR.membrane2, rows: 3 });
      membrane(c, "cloth", [wr, mid(wr, f2, 0.6), f2], [wr, mid(wr, f1, 0.6), f1], { color: DR.membrane, rows: 3 });
    });
  });
}

function dragonHead(c: BossCtx, tip: V3, dir: V3) {
  c.bone("head", tip, () =>
    c.k.frame(tip, eulerTo(dir), 1, () => {
      // The skull, a long snout, heavy brows over burning eyes, swept horns, cheek spikes, glowing nostrils
      blob(c, "scales", [0, 0.06, 0.18], [0.34, 0.3, 0.44], { color: DR.scale, wd: 14, hd: 10 });
      seg(c, "scales", [0, 0.02, 0.4], [0, -0.04, 1.08], 0.23, 0.14, { color: DR.scale, seg: 10, surf: scalesRound(0.2, 0.07) });
      blob(c, "scales", [0, 0.14, 0.62], [0.12, 0.07, 0.4], { color: DR.scale2 });
      for (const sx of [1, -1]) {
        blob(c, "scales", [sx * 0.17, 0.22, 0.42], [0.12, 0.06, 0.16], { color: DR.scale2, rot: [0, 0, sx * 0.3] });
        c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 2.2, phase: sx }, () => c.k.add("glow", new THREE.SphereGeometry(0.055, 8, 6), [sx * 0.19, 0.15, 0.5], undefined, { color: DR.eye, bright: 2.4, scale: [1.2, 0.7, 0.8] }));
        hook(c, "gloss", [sx * 0.16, 0.26, 0.05], [sx * 0.25, 0.45, -1], [0, 0.12, 0.02], 0.09, 1.0, 5, { color: DR.horn });
        hook(c, "gloss", [sx * 0.26, 0.1, -0.02], [sx * 0.6, 0.15, -1], [0, 0.08, 0], 0.05, 0.5, 3, { color: DR.horn });
        for (let i = 0; i < 3; i++) spike(c, "gloss", [sx * 0.27, -0.05 - i * 0.05, 0.12 - i * 0.12], [sx * 0.8, -0.2, -0.6], 0.035, 0.22 - i * 0.04, { color: DR.horn, seg: 4 });
        c.k.add("glow", new THREE.SphereGeometry(0.03, 6, 4), [sx * 0.07, 0.05, 1.09], undefined, { color: DR.fire, bright: 1.8 });
        // Fangs along the upper jaw
        spike(c, "matte", [sx * 0.11, -0.1, 0.92], [0, -1, 0.15], 0.025, 0.15, { color: DR.fang, seg: 4 });
        for (let i = 0; i < 3; i++) spike(c, "matte", [sx * 0.15, -0.08, 0.45 + i * 0.13], [0, -1, 0], 0.016, 0.07, { color: DR.fang, seg: 4 });
      }
      // The throat swelling with fire
      c.k.move({ kind: MOVE.pulse, amp: 0.35, speed: 1.9 }, () => blob(c, "glow", [0, -0.12, 0.5], [0.13, 0.04, 0.38], { color: DR.fire, bright: 1.6 }));
      c.bone("jaw", [0, -0.08, 0.15], () => {
        seg(c, "scales", [0, -0.15, 0.2], [0, -0.2, 0.98], 0.15, 0.09, { color: DR.scale2, seg: 9 });
        for (const sx of [1, -1]) {
          spike(c, "matte", [sx * 0.08, -0.14, 0.88], [0, 1, 0.1], 0.02, 0.12, { color: DR.fang, seg: 4 });
          spike(c, "gloss", [sx * 0.12, -0.26, 0.3], [sx * 0.5, -0.6, -0.6], 0.035, 0.2, { color: DR.horn, seg: 4 });
        }
      });
      // Its breath of fire: a cone of flame roaring out of the jaws (from nothing at rest)
      c.bone("flame", [0, -0.08, 1.02], () => {
        // Each cone flares from a point at the jaws to its wide end far out, flickering
        const cone = (len: number, r: number, color: string, bright: number, tilt: number, speed: number, ph: number) => {
          const d = new THREE.Vector3(Math.sin(tilt) * 0.3, -0.12 + Math.cos(tilt * 2) * 0.05, 1).normalize();
          const far: V3 = [d.x * len, -0.08 + d.y * len, 1.02 + d.z * len];
          c.k.move({ kind: MOVE.beat, amp: 0.14, speed, phase: ph, pivot: [0, -0.08, 1.02] }, () => spike(c, "glow", far, [-d.x, -d.y, -d.z], r, len, { color, bright, seg: 9 }));
        };
        cone(3.6, 0.85, DR.fire, 1.6, 0, 11, 0);
        cone(3.0, 0.6, "#fb923c", 1.9, 0.6, 13, 1.3);
        cone(2.6, 0.45, DR.fire2, 2.3, -0.5, 9, 2.1);
      });
    })
  );
}

function dragon(c: BossCtx) {
  const rng = c.rng;
  // The roost: a crag of basalt with molten veins over a field of ash, a pool of lava in its crown, obsidian shards
  c.k.add("matte", new THREE.CylinderGeometry(2.9, 3.0, 0.12, 30), [0, 0.06, 0], undefined, { color: DR.ash, surf: veins(0.6) });
  c.k.add("rock", craggy(new THREE.CylinderGeometry(1.5, 2.25, 1.25, 14, 3), 0.16, 9, 0.625), [0, 0.68, 0], undefined, { color: DR.rock, surf: veins(1) });
  c.k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.3 }, () => c.k.add("glow", new THREE.CircleGeometry(0.95, 18), [0, 1.33, 0.1], [-Math.PI / 2, 0, 0], { color: DR.lava, bright: 1.6 }));
  c.k.add("rock", new THREE.TorusGeometry(1.0, 0.13, 5, 16), [0, 1.33, 0.1], [Math.PI / 2, 0, 0], { color: DR.rock, surf: veins(1) });
  for (const [x, z, h, lean] of [
    [1.8, -1.2, 1.7, -0.25],
    [-1.95, -0.5, 1.3, 0.3],
    [1.1, 1.75, 0.9, -0.2]
  ] as Array<[number, number, number, number]>)
    c.k.add("rock", craggy(new THREE.ConeGeometry(h * 0.28, h, 7, 2), 0.05, Math.round(h * 10)), [x, h * 0.45, z], [0.1, 0, lean], { color: DR.rock, surf: veins(1) });
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU;
    const d = 2.0 + rng() * 0.7;
    c.k.add("gloss", new THREE.ConeGeometry(0.1, 0.5 + rng() * 0.4, 4), [Math.sin(a) * d, 0.3, Math.cos(a) * d], [rng() - 0.5, a, rng() - 0.5], { color: DR.obsidian });
  }
  c.k.add("rock", rubble(0.35, 7), [-1.4, 0.25, 1.6], undefined, { color: DR.rock });
  c.bone("fly", DR_B, () => {
    // The body: a deep scaled chest, a long belly in pale plates, spines down the back, veins of fire in its flanks
    blob(c, "scales", [0, 4.0, -0.15], [0.82, 0.74, 1.5], { color: DR.scale, wd: 16, hd: 10 });
    blob(c, "scales", [0, 4.1, 0.95], [0.78, 0.72, 0.8], { color: DR.scale, wd: 14, hd: 10 });
    for (let i = 0; i < 8; i++) {
      const z = 1.3 - i * 0.36;
      const y = 3.42 + Math.abs(z - 0.2) * 0.12;
      plate(c, "scales", [0, y, z], [0, -1, 0.15], [0, 0, 1], 0.5 - Math.abs(i - 3) * 0.04, 0.08, 0.2, { color: DR.belly, wd: 8 });
    }
    for (let i = 0; i < 7; i++) spike(c, "gloss", [0, 4.66 - Math.abs(i - 1.5) * 0.05, 1.2 - i * 0.4], [0, 1, -0.45], 0.1 - i * 0.006, 0.5 - i * 0.03, { color: DR.horn, seg: 5 });
    for (const sx of [1, -1])
      for (let i = 0; i < 3; i++) {
        const a: V3 = [sx * 0.8, 4.05 + i * 0.08, 0.6 - i * 0.55];
        c.k.move({ kind: MOVE.pulse, amp: 0.55, speed: 1.7, phase: -i * 0.8 + sx }, () => c.k.along("glow", a, [a[0] + sx * 0.02, a[1] - 0.18, a[2] - 0.42], 0, { geo: new THREE.CylinderGeometry(0.025, 0.025, 1, 4, 1, true), color: DR.lava, bright: 1.7 }));
      }
    // Legs tucked up under it in flight: haunches, shins drawn back, clawed feet; small forelegs folded at the chest
    for (const sx of [1, -1]) {
      blob(c, "scales", [sx * 0.55, 3.75, -0.95], [0.34, 0.42, 0.5], { color: DR.scale2, wd: 10, hd: 8 });
      seg(c, "scales", [sx * 0.6, 3.5, -0.85], [sx * 0.55, 3.25, -1.5], 0.17, 0.11, { color: DR.scale2, seg: 8 });
      for (let i = 0; i < 3; i++) hook(c, "gloss", [sx * (0.5 + i * 0.07), 3.2, -1.55], [0, -0.3, -1], [0, -0.25, 0], 0.03, 0.22, 3, { color: DR.horn });
      seg(c, "scales", [sx * 0.45, 3.65, 1.15], [sx * 0.42, 3.35, 1.45], 0.11, 0.08, { color: DR.scale2, seg: 7 });
      for (let i = 0; i < 3; i++) hook(c, "gloss", [sx * (0.38 + i * 0.05), 3.32, 1.5], [0, -0.6, 0.6], [0, -0.2, -0.1], 0.022, 0.16, 3, { color: DR.horn });
    }
    dragonWing(c, 1);
    dragonWing(c, -1);
    // The long neck rising to the head
    chainBones(
      c,
      "neck",
      [0, 4.25, 1.45],
      [0.5, 0.48, 0.45, 0.42, 0.4],
      [-0.6, -0.45, -0.2, 0.1, 0.35],
      [0.48, 0.42, 0.37, 0.33, 0.3, 0.28],
      { bucket: "scales", color: DR.scale, seg: 10, surf: scalesRound(0.4, 0.08), endCap: false },
      (j, from, to, r0, r1, dir) => {
        const up: V3 = [0, dir[2], -dir[1]];
        const m = mid(from, to);
        const rr = (r0 + r1) / 2;
        plate(c, "scales", [m[0] - up[0] * rr * 0.75, m[1] - up[1] * rr * 0.75, m[2] - up[2] * rr * 0.75], [-up[0], -up[1], -up[2]], dir, rr * 0.62, rr * 0.22, 0.2, { color: DR.belly, wd: 8 });
        spike(c, "gloss", [m[0] + up[0] * rr * 0.85, m[1] + up[1] * rr * 0.85, m[2] + up[2] * rr * 0.85], [up[0] - dir[0] * 0.5, up[1] - dir[1] * 0.5, up[2] - dir[2] * 0.5], 0.07, 0.35 - j * 0.03, { color: DR.horn, seg: 5 });
      },
      (tip, dir) => dragonHead(c, tip, dir)
    );
    // The tail streaming behind, spined, to a spade of horn
    chainBones(
      c,
      "tail",
      [0, 3.98, -1.5],
      [0.55, 0.55, 0.52, 0.5, 0.48, 0.45, 0.42],
      [0.15, 0.18, 0.12, 0.02, -0.08, -0.12, -0.08],
      [0.42, 0.36, 0.3, 0.25, 0.2, 0.15, 0.11, 0.07],
      { bucket: "scales", color: DR.scale, seg: 9, surf: scalesRound(0.3, 0.08), yaw: Array.from({ length: DR_TAIL }, () => Math.PI) },
      (j, from, to, r0, r1, dir) => {
        const m = mid(from, to);
        spike(c, "gloss", [m[0], m[1] + r0 * 0.85, m[2]], [0, 1, dir[2] * 0.5], 0.06, 0.32 - j * 0.03, { color: DR.horn, seg: 4 });
      },
      (at, dir) => {
        for (const sx of [1, -1]) plate(c, "gloss", [at[0] + sx * 0.14, at[1], at[2] + dir[2] * 0.25], [0, 1, 0], [sx * 0.6, 0, dir[2]], 0.22, 0.04, 0.32, { color: DR.horn, wd: 6 });
      }
    );
  });
}

const drNeck = (f: (j: number) => BonePose | null): Pose => chainPose("neck", DR_NECK, f);
const drTail = (f: (j: number) => BonePose | null): Pose => chainPose("tail", DR_TAIL, f);
/** Both wings raised (+) or lowered (−) about their hinges, the tips by `tip` */
const drWings = (raise: number, tip = 0, sweep = 0): Pose => ({
  wingR: { r: [0, sweep, -raise] },
  wingL: { r: [0, -sweep, raise] },
  tipR: { r: [0, 0, -tip] },
  tipL: { r: [0, 0, tip] }
});

function dragonIdle(c: IdleCtx) {
  flight(c, "fly", { rx: 1.9, rz: 1.5, bob: 0.35, f: 0.32, heading: 1, bank: 0.45 });
  // The wings beat on, carried through every action: a driving downstroke that heaves the body up, a slower recovery
  // with the tips folding, now and then a long glide on spread wings that lets it sink
  const glide = c.event(7, 10, 3.6).e * (1 - c.busy) * (c.asleep ? 0 : 1);
  const amp = (0.5 + 0.12 * c.busy) * (1 - 0.88 * glide);
  const beat = c.t * 4.0 + c.seed * 3;
  const { w, heave } = stroke(beat / TAU);
  const tipStroke = stroke(beat / TAU - 0.09);
  const fold = tipStroke.w > 0 && tipStroke.heave < 0 ? 0.3 : 0;
  for (const s of [1, -1]) {
    const S = sideOf(s);
    c.carry(`wing${S}`, [0, s * 0.06 * w * amp, -s * (amp * w * 0.75 + 0.12 * glide)]);
    c.carry(`tip${S}`, [0, 0, -s * amp * (tipStroke.w * 0.4 - fold)]);
  }
  c.carry("fly", [-0.05 * heave * amp, 0, 0], [0, 0.16 * heave * amp - 0.18 * glide, 0]);
  // The neck sways while the head holds steady and glances round; the tail streams and lashes; the jaw works
  for (let j = 0; j < DR_NECK; j++) c.add(`neck${j}`, [0.04 * Math.sin(c.t * 0.8 - j * 0.6) - 0.02 * heave * amp, 0.06 * Math.sin(c.t * 0.55 - j * 0.5 + 1), 0]);
  c.add("head", [0.08 * c.drift(0.5) + 0.06 * heave * amp, 0.35 * c.glance(1, 4, 0.4), 0.06 * c.drift(0.4, 2)]);
  c.add("jaw", [0.05 + 0.1 * c.event(2, 5, 0.6).e, 0, 0]);
  const lash = c.event(3, 6, 0.9);
  for (let j = 0; j < DR_TAIL; j++) c.add(`tail${j}`, [0.05 * Math.sin(c.t * 1.1 - j * 0.6) + 0.03 * heave * amp, 0.08 * Math.sin(c.t * 0.7 - j * 0.55) + (j > 3 ? 0.25 * lash.e * (lash.k - 0.5) : 0), 0]);
}

const DR_DEF: BossHeroDef = {
  build: dragon,
  rest: merge({ head: { r: [0.05, 0.08, 0.04] }, jaw: { r: [0.06, 0, 0] }, flame: { s: -0.98 }, neck2: { r: [0, 0.04, 0] }, tail3: { r: [0, 0.06, 0] } }, { wingL: { r: [0, 0, 0.05] }, tipR: { r: [0, 0, 0.04] } }),
  idle: dragonIdle,
  roar: {
    len: 3.4,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      // Draws back in the air, neck coiling, wings gathering
      { t: 0.22, hold: true, pose: merge({ fly: { r: [-0.15, 0, 0], p: [0, -0.1, -0.2] }, head: { r: [0.3, 0, 0] } }, drNeck(() => ({ r: [0.12, 0, 0] })), drWings(-0.15, 0.2)) },
      // Rears up, wings flung high, the neck thrown up and the jaws wide on a blazing throat
      { t: 0.42, pose: merge({ fly: { r: [-0.5, 0, 0], p: [0, 0.35, -0.1], g: 0.8 }, head: { r: [-0.5, 0, 0], g: 1.6 }, jaw: { r: [0.7, 0, 0] } }, drNeck(() => ({ r: [-0.2, 0, 0] })), drTail(() => ({ r: [0.1, 0, 0] })), drWings(0.6, 0.35, -0.15)) },
      { t: 0.76, hold: true, pose: merge({ fly: { r: [-0.45, 0, 0.03], p: [0, 0.3, -0.1], g: 0.6 }, head: { r: [-0.45, 0.06, 0], g: 1.2 }, jaw: { r: [0.65, 0, 0] } }, drNeck(() => ({ r: [-0.18, 0, 0] })), drTail(() => ({ r: [0.08, 0, 0] })), drWings(0.5, 0.3, -0.12)) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.12, vig: 0.55, vigCol: "#3b0a05", lines: 0.85, flash: 0.28, flashCol: "#fdba74" } }]
  },
  attack: {
    len: 3.0,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Rears back, neck coiling, the throat swelling with fire
      { t: 0.28, pose: merge({ fly: { r: [-0.3, 0, 0], p: [0, 0.2, -0.3] }, head: { r: [0.25, 0, 0], g: 0.8 }, jaw: { r: [0.15, 0, 0] } }, drNeck(() => ({ r: [-0.1, 0, 0] })), drWings(0.25, 0.1)) },
      { t: 0.4, hold: true, pose: merge({ fly: { r: [-0.36, 0, 0], p: [0, 0.25, -0.35], g: 0.4 }, head: { r: [0.3, 0, 0], g: 1.4 }, jaw: { r: [0.25, 0, 0] } }, drNeck(() => ({ r: [-0.12, 0, 0] })), drWings(0.3, 0.12)) },
      // Lunges forward and down, the jaws gaping, and breathes a long cone of fire at its target
      { t: 0.5, pose: merge({ fly: { r: [0.1, 0, 0], p: [0, 0.05, 0.45] }, head: { r: [-0.25, 0, 0], g: 1.6 }, jaw: { r: [0.6, 0, 0] }, flame: { s: 0.9 } }, drNeck(() => ({ r: [0.03, 0, 0] })), drTail(() => ({ r: [-0.08, 0, 0] })), drWings(0.05, -0.1)) },
      { t: 0.7, pose: merge({ fly: { r: [0.1, 0, 0], p: [0, 0.05, 0.4] }, head: { r: [-0.2, 0.12, 0], g: 1.4 }, jaw: { r: [0.62, 0, 0] }, flame: { s: 1.05 } }, drNeck(() => ({ r: [0.04, 0.03, 0] })), drWings(0.1, -0.05)) },
      { t: 0.84, hold: true, pose: merge({ fly: { r: [0.05, 0, 0], p: [0, 0, 0.15] }, head: { r: [0.1, 0, 0] }, jaw: { r: [0.2, 0, 0] }, flame: { s: 0 } }, drNeck(() => ({ r: [0.03, 0, 0] }))) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.5, burst: true, cine: { quake: 0.2, stop: 0.06, flash: 0.5, flashCol: "#fed7aa", lines: 0.9, vig: 0.35, vigCol: "#3b0a05" } }]
  },
  lag: { ...chainLag("neck", DR_NECK, 0.03), head: 0.17, jaw: 0.19, flame: 0.12, ...chainLag("tail", DR_TAIL, 0.05, 0.05), tipL: 0.08, tipR: 0.08 },
  springs: { ...chainSprings("tail", DR_TAIL, 60, 2), head: 120 },
  burst: { at: [0, 0.6, 5.0], color: "#fb923c", count: 110, speed: 3.2, spread: 2.2, size: 0.26, gravity: 3 },
  aura: aura("#ea580c", "#fff1c4", 3.0),
  height: 6.5,
  frame: [17, 6.5, 3.6],
  sparks: (c) => {
    // Smoke off the lava, embers climbing out of the crag, ash drifting
    c.spark(SPARK.smoke, [0, 1.3, 0.1], 14, { color: "#3f2a22", size: 1.1, speed: 0.14, rise: 3.5, reach: 0.8, spread: 1.4 });
    c.spark(SPARK.ember, [0, 1.3, 0.1], 26, { color: "#fb923c", size: 0.07, speed: 0.4, rise: 4.5, reach: 1.2, spread: 1.8 });
    c.spark(SPARK.mote, [0, 0.4, 0], 16, { color: "#a8a29e", size: 0.06, speed: 0.25, rise: 0.8, reach: 2.4, spread: 4.0 });
  }
};

/* ================================================================== */
/* Queen of the Fae Court                                              */
/* ================================================================== */

const FA = {
  skin: "#ece6fb",
  skin2: "#d8cdf3",
  gown: "#3b1677",
  gown2: "#5b21b6",
  gown3: "#86198f",
  petalTip: "#c026d3",
  thorn: "#1e1b4b",
  hair: "#2a0f55",
  silver: "#c7c2e6",
  wing: "#e879f9",
  wing2: "#a78bfa",
  orb: "#f0abfc",
  eye: "#f5d0fe",
  earth: "#2a2338",
  moss: "#3e4f2c",
  shroom: "#e879f9",
  shroom2: "#a78bfa",
  stem: "#e9e3d7"
};
const FA_B: V3 = [0, 3.25, 0];
const FA_HAIR = 4;

function faeWing(c: BossCtx, name: string, s: number, root: V3, from: number, to: number, len: number, color: string) {
  c.bone(name, root, () => {
    const roots: V3[] = [];
    const tips: V3[] = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = from + ((to - from) * i) / (n - 1);
      const L = len * (0.45 + 0.55 * Math.sin((Math.PI * (i + 0.6)) / (n + 0.2)));
      const d = new THREE.Vector3(s * Math.cos(a) * 0.92, Math.sin(a) * 0.92 + 0.05, -0.42).normalize();
      roots.push([root[0] + d.x * 0.05, root[1] + d.y * 0.05, root[2] + d.z * 0.05]);
      tips.push([root[0] + d.x * L, root[1] + d.y * L, root[2] + d.z * L]);
    }
    // Lit from both faces (the glow is one-sided): the web twice, wound each way
    membrane(c, "wing", roots, tips, { color, bright: 1.15, rows: 4 });
    membrane(c, "wing", [...roots].reverse(), [...tips].reverse(), { color, bright: 1.15, rows: 4 });
    // A bright vein along the leading edge
    seg(c, "glow", root, tips[0], 0.018, 0.008, { color: FA.eye, bright: 1.6, seg: 4, cap: false });
  });
}

function faeArm(c: BossCtx, s: number) {
  const S = sideOf(s);
  const sh: V3 = [s * 0.25, 3.86, 0.0];
  const el: V3 = [s * 0.5, 3.5, 0.14];
  const wr: V3 = [s * 0.64, 3.2, 0.45];
  c.bone(`arm${S}`, sh, () => {
    blob(c, "matte", sh, [0.07, 0.07, 0.07], { color: FA.skin, wd: 8, hd: 6 });
    seg(c, "matte", sh, el, 0.055, 0.042, { color: FA.skin, seg: 7 });
    for (let i = 0; i < 2; i++) spike(c, "gloss", mid(sh, el, 0.3 + i * 0.35), [s * 0.5, 0.4, -0.6], 0.016, 0.1, { color: FA.thorn, seg: 4 });
    c.bone(`fore${S}`, el, () => {
      seg(c, "matte", el, wr, 0.042, 0.032, { color: FA.skin, seg: 7 });
      c.k.add("iron", new THREE.TorusGeometry(0.045, 0.01, 4, 10), mid(el, wr, 0.75), undefined, { color: FA.silver, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...sub(wr, el)).normalize()) });
      c.bone(`hand${S}`, wr, () => {
        blob(c, "matte", [wr[0], wr[1] - 0.02, wr[2] + 0.04], [0.045, 0.03, 0.06], { color: FA.skin2, wd: 8, hd: 5 });
        // Long thorn claws, half curled
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * 0.022;
          hook(c, "gloss", [wr[0] + x * s, wr[1] - 0.03, wr[2] + 0.09], [x * 3 * s, -0.35, 1], [0, -0.28, -0.06], 0.013, 0.24 - Math.abs(i - 1.5) * 0.03, 3, { color: FA.thorn });
        }
        if (s > 0) {
          // The orb of fae light in her right hand, motes circling it
          const o: V3 = [wr[0] + 0.02, wr[1] + 0.12, wr[2] + 0.14];
          c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 2.4 }, () => c.k.add("glow", new THREE.IcosahedronGeometry(0.13, 1), o, undefined, { color: FA.orb, bright: 2 }));
          c.k.move({ kind: MOVE.spin, speed: 2.2, pivot: o, axis: [0.3, 1, 0.2] }, () => {
            for (let i = 0; i < 3; i++) c.k.add("glow", new THREE.OctahedronGeometry(0.03), [o[0] + Math.cos((i * TAU) / 3) * 0.24, o[1], o[2] + Math.sin((i * TAU) / 3) * 0.24], undefined, { color: FA.eye, bright: 2 });
          });
        }
      });
    });
  });
}

function faeHead(c: BossCtx, rng: () => number) {
  c.bone("neck", [0, 3.94, 0.0], () => {
    seg(c, "matte", [0, 3.92, 0], [0, 4.1, 0.02], 0.055, 0.05, { color: FA.skin, seg: 7 });
    c.bone("head", [0, 4.08, 0.02], () => {
      blob(c, "matte", [0, 4.25, 0.04], [0.15, 0.19, 0.16], { color: FA.skin, wd: 14, hd: 10 });
      blob(c, "matte", [0, 4.14, 0.11], [0.08, 0.06, 0.07], { color: FA.skin });
      for (const sx of [1, -1]) {
        blob(c, "matte", [sx * 0.06, 4.28, 0.15], [0.045, 0.022, 0.025], { color: "#2e1065" });
        c.k.add("glow", new THREE.SphereGeometry(0.02, 6, 4), [sx * 0.06, 4.28, 0.17], undefined, { color: FA.eye, bright: 2.6, scale: [1.4, 0.8, 0.6] });
        blob(c, "matte", [sx * 0.065, 4.33, 0.15], [0.05, 0.012, 0.02], { color: FA.hair, rot: [0, 0, sx * 0.25] });
        // Long pointed ears swept back
        c.k.add("matte", new THREE.ConeGeometry(0.035, 0.24, 6), [sx * 0.19, 4.3, 0.0], [-0.6, 0, -sx * 1.1], { color: FA.skin2, scale: [1, 1, 0.5] });
      }
      blob(c, "matte", [0, 4.2, 0.19], [0.03, 0.012, 0.015], { color: "#9d174d" });
      // Dark hair over the crown, and strands streaming back
      blob(c, "matte", [0, 4.32, -0.03], [0.17, 0.17, 0.18], { color: FA.hair, wd: 12, hd: 8 });
      for (let h = 0; h < FA_HAIR; h++) {
        const a = (h - (FA_HAIR - 1) / 2) * 0.45;
        c.k.at([Math.sin(a) * 0.12, 4.32, -0.1 - Math.cos(a) * 0.05], Math.PI + a * 0.7, () =>
          chainBones(c, `hair${h}_`, [0, 0, 0], [0.24, 0.24, 0.22], [0.7 + rng() * 0.2, 1.0, 1.15], [0.045, 0.04, 0.03, 0.01], { bucket: "matte", color: FA.hair, seg: 6 })
        );
      }
      // A crown of thorns, twig antlers branching from it, a gem of fae light
      c.k.add("iron", new THREE.TorusGeometry(0.15, 0.015, 4, 16), [0, 4.39, 0.02], [Math.PI / 2 - 0.15, 0, 0], { color: FA.silver });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        spike(c, "gloss", [Math.sin(a) * 0.15, 4.4 + Math.cos(a) * 0.02, 0.02 + Math.cos(a) * 0.15], [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], 0.02, 0.13 + (i % 3 === 0 ? 0.1 : 0), { color: FA.thorn, seg: 4 });
      }
      for (const sx of [1, -1]) {
        hook(c, "gloss", [sx * 0.1, 4.45, -0.02], [sx * 0.5, 1, -0.3], [sx * 0.15, 0, -0.05], 0.025, 0.5, 4, { color: FA.thorn });
        hook(c, "gloss", [sx * 0.2, 4.68, -0.12], [sx * 0.8, 0.6, 0.2], [0, 0.1, 0], 0.014, 0.18, 2, { color: FA.thorn });
      }
      c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 2 }, () => c.k.add("glow", new THREE.OctahedronGeometry(0.04), [0, 4.43, 0.17], undefined, { color: FA.orb, bright: 2, scale: [1, 1.5, 0.6] }));
    });
  });
}

function fae(c: BossCtx) {
  const rng = c.rng;
  // Her knoll: a mound of moss inside a ring of brambles, glowing mushrooms in the grass, a fairy ring of lit stones
  c.k.add("matte", new THREE.SphereGeometry(1, 26, 5, 0, TAU, 0, Math.PI / 2), [0, 0, 0], undefined, { color: FA.earth, scale: [2.7, 0.35, 2.6] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rng() * 0.5;
    const d = 0.6 + rng() * 1.4;
    c.k.add("leaf", new THREE.SphereGeometry(1, 10, 4, 0, TAU, 0, Math.PI / 2), [Math.sin(a) * d, 0.3 * Math.sqrt(Math.max(0, 1 - (d / 2.7) ** 2)) - 0.04, Math.cos(a) * d], [0, a, 0], { color: FA.moss, scale: [0.5 + rng() * 0.3, 0.08, 0.35 + rng() * 0.3] });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const base: V3 = [Math.sin(a) * 2.25, 0.1, Math.cos(a) * 2.25];
    hook(c, "gloss", base, [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], [-Math.sin(a) * 0.12, -0.05, -Math.cos(a) * 0.12], 0.13, 1.05 + (i % 3) * 0.2, 4, { color: FA.thorn });
    for (let k = 0; k < 2; k++) spike(c, "gloss", [base[0] * (1.02 + k * 0.02), 0.45 + k * 0.3, base[2] * (1.02 + k * 0.02)], [Math.cos(a), 0.3, -Math.sin(a)], 0.025, 0.14, { color: FA.thorn, seg: 4 });
  }
  for (let i = 0; i < 7; i++) {
    const a = 0.4 + i * 0.9 + rng() * 0.3;
    const d = 1.0 + rng() * 1.0;
    const b: V3 = [Math.sin(a) * d, 0.2, Math.cos(a) * d];
    const h = 0.12 + rng() * 0.14;
    seg(c, "matte", b, [b[0], b[1] + h, b[2]], 0.025, 0.02, { color: FA.stem, seg: 5, cap: false });
    c.k.move({ kind: MOVE.pulse, amp: 0.4, speed: 1.4 + i * 0.2, phase: i }, () =>
      c.k.add("glow", new THREE.SphereGeometry(0.08 + h * 0.3, 8, 4, 0, TAU, 0, Math.PI / 2), [b[0], b[1] + h, b[2]], undefined, { color: i % 2 ? FA.shroom : FA.shroom2, bright: 1.3, scale: [1, 0.55, 1] })
    );
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    c.k.add("rock", new THREE.DodecahedronGeometry(0.08), [Math.sin(a) * 1.55, 0.25, Math.cos(a) * 1.55], [a, a * 2, 0], { color: "#57534e" });
    if (i % 2 === 0) c.k.add("glow", new THREE.SphereGeometry(0.03, 6, 4), [Math.sin(a) * 1.55, 0.34, Math.cos(a) * 1.55], undefined, { color: FA.eye, bright: 1.6 });
  }
  c.bone("fly", FA_B, () => {
    // A gown of layered petals falling from her waist, the lowest tier fluttering
    c.k.add("cloth", new THREE.CylinderGeometry(0.2, 0.72, 1.85, 16, 1, true), [0, 2.35, 0], undefined, { color: FA.gown });
    const tiers = [
      { n: 10, y: 3.25, r: 0.2, len: 0.75, w: 0.2, color: FA.gown2, out: 0.35 },
      { n: 11, y: 2.75, r: 0.34, len: 0.8, w: 0.22, color: FA.gown3, out: 0.45 },
      { n: 12, y: 2.2, r: 0.5, len: 0.85, w: 0.24, color: FA.gown2, out: 0.55 }
    ];
    tiers.forEach((t, k) => {
      for (let i = 0; i < t.n; i++) {
        const a = (i / t.n) * TAU + k * 0.3;
        const o: V3 = [Math.sin(a), 0, Math.cos(a)];
        const dir: V3 = [o[0] * t.out, -1, o[2] * t.out];
        const dl = Math.hypot(...dir);
        const top: V3 = [o[0] * t.r, t.y, o[2] * t.r];
        const ctr: V3 = [top[0] + (dir[0] / dl) * t.len * 0.5, top[1] + (dir[1] / dl) * t.len * 0.5, top[2] + (dir[2] / dl) * t.len * 0.5];
        const put = () => plate(c, "cloth", ctr, [o[0], t.out * 0.6, o[2]], [dir[0] / dl, dir[1] / dl, dir[2] / dl], t.w, 0.025, t.len * 0.5, { color: i % 3 === 0 ? FA.petalTip : t.color, wd: 8 });
        if (k === 2) c.k.move({ kind: MOVE.flutter, pivot: top, axis: o, amp: 0.05, speed: 2.6, phase: i * 1.3 }, put);
        else put();
      }
    });
    // A bodice of violet and silver, a collar of thorns, a necklace of light
    blob(c, "matte", [0, 3.55, 0], [0.22, 0.32, 0.17], { color: FA.gown2, wd: 12, hd: 8 });
    blob(c, "matte", [0, 3.82, 0.01], [0.24, 0.12, 0.15], { color: FA.skin, wd: 12, hd: 6 });
    c.k.add("iron", new THREE.TorusGeometry(0.2, 0.014, 4, 16), [0, 3.36, 0], [Math.PI / 2, 0, 0], { color: FA.silver });
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (i / 6) * 2.4;
      spike(c, "gloss", [Math.sin(a) * 0.22, 3.88, Math.cos(a) * 0.12 - 0.05], [Math.sin(a) * 0.7, 0.8, -0.4], 0.02, 0.18 + (i % 2) * 0.08, { color: FA.thorn, seg: 4 });
    }
    for (let i = 0; i < 5; i++) {
      const a = -0.7 + (i / 4) * 1.4;
      c.k.add("glow", new THREE.OctahedronGeometry(0.025), [Math.sin(a) * 0.14, 3.76 - Math.cos(a) * 0.04, 0.15], undefined, { color: FA.orb, bright: 1.8 });
    }
    faeArm(c, 1);
    faeArm(c, -1);
    faeHead(c, rng);
    // Two pairs of veined wings of light
    for (const s of [1, -1]) {
      const S = sideOf(s);
      faeWing(c, `wingU${S}`, s, [s * 0.08, 3.72, -0.17], 1.25, 0.15, 2.3, FA.wing);
      faeWing(c, `wingD${S}`, s, [s * 0.08, 3.52, -0.18], -0.05, -0.95, 1.55, FA.wing2);
    }
    // Motes of fae light circling her
    c.k.move({ kind: MOVE.spin, speed: 0.7, pivot: [0, 2.9, 0], amp: 0.2 }, () => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        c.k.add("glow", new THREE.OctahedronGeometry(0.09), [Math.sin(a) * 1.55, 2.9 + Math.sin(a * 2) * 0.25, Math.cos(a) * 1.55], [a, 0, a], { color: i % 2 ? FA.wing : FA.orb, bright: 1.8, scale: [0.6, 1.3, 0.6] });
      }
    });
  });
}

const faHair = (f: (h: number, j: number) => BonePose | null): Pose => merge(...Array.from({ length: FA_HAIR }, (_, h) => chainPose(`hair${h}_`, 3, (j) => f(h, j))));
/** All four wings swept (+ back) and raised (+) */
const faWings = (sweep: number, raise: number): Pose => ({
  wingUR: { r: [0, -sweep, -raise] },
  wingUL: { r: [0, sweep, raise] },
  wingDR: { r: [0, -sweep * 0.8, -raise * 0.6] },
  wingDL: { r: [0, sweep * 0.8, raise * 0.6] }
});

function faeIdle(c: IdleCtx) {
  flight(c, "fly", { rx: 0.6, rz: 0.55, bob: 0.22, f: 0.38, heading: 0.35, bank: 0.25 });
  // The wings thrum, the pairs out of step, now and then held spread as she drifts; a heave on every beat
  const glide = c.event(6, 7, 2.2).e * (1 - c.busy) * (c.asleep ? 0 : 1);
  const amp = (0.3 + 0.1 * c.busy) * (1 - 0.8 * glide);
  const beat = c.t * 15 + c.seed * 5;
  const { w, heave } = stroke(beat / TAU);
  const w2 = stroke(beat / TAU + 0.35).w;
  for (const s of [1, -1]) {
    const S = sideOf(s);
    c.carry(`wingU${S}`, [0, s * (amp * w * 0.6 - 0.1 * glide), -s * (amp * w * 0.25 + 0.1 * glide)]);
    c.carry(`wingD${S}`, [0, s * amp * w2 * 0.5, -s * amp * w2 * 0.2]);
  }
  c.carry("fly", null, [0, 0.025 * heave * amp, 0]);
  // She breathes, tilts her head, flexes her claws; her hair drifts
  const breath = c.sin(1.2);
  c.add("fly", [0.03 * c.drift(0.4), 0.05 * c.drift(0.3, 1), 0.03 * c.drift(0.35, 2)], null, 0.01 * breath);
  c.add("head", [0.08 * c.drift(0.5, 1), 0.3 * c.glance(1, 4.4, 0.4), 0.15 * c.drift(0.33, 2)]);
  c.add("armL", [0.1 * c.drift(0.55, 1), 0, -0.08 * c.drift(0.45)]);
  c.add("armR", [0.08 * c.drift(0.5, 3), 0, 0.06 * c.drift(0.42, 1)]);
  c.add("handL", [0.3 * c.event(3, 5, 0.8).e, 0, 0]);
  c.add("handR", [0.1 * c.drift(0.8), 0, 0]);
  for (let h = 0; h < FA_HAIR; h++) for (let j = 0; j < 3; j++) c.add(`hair${h}_${j}`, [0.06 * Math.sin(c.t * 1.2 - j * 0.8 + h), 0.07 * Math.sin(c.t * 0.9 - j * 0.6 + h * 1.7), 0]);
}

const FA_DEF: BossHeroDef = {
  build: fae,
  // Head tipped, the orb hand raised, the claw hand low: never a mirrored pose
  rest: { head: { r: [0.08, -0.12, 0.1] }, armR: { r: [-0.35, 0, 0.15] }, foreR: { r: [-0.6, 0, 0] }, handR: { r: [-0.2, 0, 0] }, armL: { r: [0.05, 0, -0.2] }, foreL: { r: [-0.2, 0, 0] }, handL: { r: [0.3, 0, 0] } },
  idle: faeIdle,
  roar: {
    len: 3.0,
    idle: 0.25,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, hold: true, pose: merge({ fly: { r: [0.15, 0, 0], p: [0, -0.1, 0] }, head: { r: [0.25, 0, 0] }, armL: { r: [0.3, 0, 0.3] }, armR: { r: [0.3, 0, -0.3] } }, faWings(0.3, -0.1)) },
      // Arches back, arms and wings flung wide, the crown and orb blazing
      { t: 0.42, pose: merge({ fly: { r: [-0.3, 0, 0], p: [0, 0.25, 0], g: 1 }, neck: { r: [-0.2, 0, 0] }, head: { r: [-0.4, 0, 0], g: 1.6 }, armL: { r: [-0.6, 0, -1.2] }, armR: { r: [-0.4, 0, 1.2] }, foreL: { r: [0.3, 0, 0] }, foreR: { r: [0.5, 0, 0] }, handR: { g: 1.5 } }, faWings(-0.35, 0.35), faHair(() => ({ r: [-0.3, 0, 0] }))) },
      { t: 0.74, hold: true, pose: merge({ fly: { r: [-0.27, 0, 0.03], p: [0, 0.22, 0], g: 0.8 }, neck: { r: [-0.18, 0, 0] }, head: { r: [-0.35, 0.06, 0], g: 1.2 }, armL: { r: [-0.55, 0, -1.1] }, armR: { r: [-0.35, 0, 1.1] }, foreL: { r: [0.25, 0, 0] }, foreR: { r: [0.45, 0, 0] }, handR: { g: 1.2 } }, faWings(-0.3, 0.3), faHair(() => ({ r: [-0.25, 0, 0] }))) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.42, cine: { quake: 0.06, vig: 0.6, vigCol: "#2e1065", lines: 0.9, flash: 0.3, flashCol: "#f5d0fe" } }]
  },
  attack: {
    len: 2.4,
    idle: 0.3,
    keys: [
      { t: 0, pose: {} },
      // Draws both hands back past her shoulder, twisting away, the orb swelling
      { t: 0.3, pose: merge({ fly: { r: [-0.1, 0.35, 0], p: [0, 0.1, -0.15] }, head: { r: [0.1, -0.3, 0] }, armR: { r: [0.6, 0, 0.6] }, foreR: { r: [-0.9, 0, 0] }, armL: { r: [0.4, 0, -0.2] }, foreL: { r: [-0.6, 0, 0] }, handR: { g: 0.8 } }, faWings(0.2, 0.1)) },
      { t: 0.42, hold: true, pose: merge({ fly: { r: [-0.12, 0.42, 0], p: [0, 0.12, -0.18] }, head: { r: [0.12, -0.35, 0] }, armR: { r: [0.7, 0, 0.7] }, foreR: { r: [-1.0, 0, 0] }, armL: { r: [0.45, 0, -0.25] }, foreL: { r: [-0.7, 0, 0] }, handR: { r: [-0.3, 0, 0], g: 1.4 } }, faWings(0.25, 0.15)) },
      // Flings it: both arms thrust out at her foe, claws spread, wings flaring, the bolt of light bursting ahead
      { t: 0.54, pose: merge({ fly: { r: [0.2, -0.25, 0], p: [0, -0.05, 0.3], g: 0.8 }, head: { r: [0.15, 0.15, 0] }, armR: { r: [-1.45, 0, -0.15] }, foreR: { r: [0.1, 0, 0] }, armL: { r: [-1.3, 0, 0.2] }, foreL: { r: [0.1, 0, 0] }, handR: { r: [-0.4, 0, 0], g: 2 }, handL: { r: [-0.6, 0, 0] } }, faWings(-0.3, 0.25)) },
      { t: 0.66, pose: merge({ fly: { r: [0.22, -0.3, 0], p: [0, -0.06, 0.35] }, head: { r: [0.18, 0.18, 0] }, armR: { r: [-1.5, 0, -0.2] }, foreR: { r: [0.12, 0, 0] }, armL: { r: [-1.35, 0, 0.25] }, foreL: { r: [0.12, 0, 0] }, handR: { r: [-0.45, 0, 0] }, handL: { r: [-0.65, 0, 0] } }, faWings(-0.25, 0.2)) },
      { t: 0.86, hold: true, pose: merge({ fly: { r: [0.05, -0.05, 0], p: [0, 0, 0.08] }, armR: { r: [-0.3, 0, 0] }, armL: { r: [-0.3, 0, 0] } }, faWings(-0.05, 0.05)) },
      { t: 1, pose: {} }
    ],
    hits: [{ u: 0.54, burst: true, cine: { quake: 0.12, stop: 0.07, flash: 0.5, flashCol: "#f5d0fe", lines: 0.9, vig: 0.3, vigCol: "#2e1065" } }]
  },
  lag: { foreL: 0.04, foreR: 0.05, handL: 0.08, handR: 0.09, head: 0.06, neck: 0.03, ...Object.assign({}, ...Array.from({ length: FA_HAIR }, (_, h) => chainLag(`hair${h}_`, 3, 0.05, 0.06))) },
  springs: { ...Object.assign({}, ...Array.from({ length: FA_HAIR }, (_, h) => chainSprings(`hair${h}_`, 3, 40))) },
  burst: { at: [0, 2.0, 3.4], color: "#f0abfc", count: 80, speed: 2.6, spread: 1.0, size: 0.2, gravity: 2 },
  aura: aura("#c026d3", "#fae8ff", 2.9),
  height: 5.2,
  frame: [13, 5.5, 3.0],
  sparks: (c) => {
    // Motes of light drifting up off the knoll, fireflies in the brambles, glitter shed by her wings
    c.spark(SPARK.mote, [0, 0.5, 0], 28, { color: "#f5d0fe", size: 0.07, speed: 0.3, rise: 0.8, reach: 2.4, spread: 4.0 });
    c.spark(SPARK.wisp, [0, 1.2, 0], 12, { color: "#e879f9", size: 0.1, speed: 0.12, rise: 0.8, reach: 2.0, spread: 1.0 });
    c.spark(SPARK.ember, [0, 3.4, -0.3], 14, { color: "#f0abfc", size: 0.05, speed: 0.25, rise: -0.8, reach: 1.0, spread: 1.4 });
  }
};

export const SKY_BOSSES: Record<string, BossHeroDef> = {
  "boss-dragon": DR_DEF,
  "boss-fae": FA_DEF
};
