import * as THREE from "three";
import { MOVE, TAU, V3, dirXZ, facing, rubble } from "./heroKit";
import { SPARK, runeBand, runeColumn } from "./heroMaterials";
import type { HeroCtx } from "./heroLandmarks";

/* ------------------------------------------------------------------------- */
/* The Nethergarde Core as a hand-built hero (high graphics)                   */
/* ------------------------------------------------------------------------- */

const OBSIDIAN = "#15121c";
const OBSIDIAN2 = "#221d2c";
const SILVER = "#d9dee8";
const VIOLET = "#c084fc";
/** How high the risen Eye floats over the Archon's citadel (as its rig on the map) */
export const ASCENDED_FLOAT = 11.5;
/** The heart's height over the Core's base */
const HEART_Y = 2.7;

/**
 * The Eye itself, centred on its heart at `y`: the beating void crystal in its cage of black spikes, three silver rings
 * with beads turning on their own tilted axes, obsidian rocks with crystal veins and motes wheeling round it
 */
function eye(c: HeroCtx, y: number) {
  const { k, rng } = c;
  // The heart: a faceted crystal beating, a white-hot core in it, the cage of black spikes round it
  k.move({ kind: MOVE.beat, pivot: [0, y, 0], amp: 0.12, speed: 1.8 }, () => {
    k.add("glow", new THREE.OctahedronGeometry(0.7, 0), [0, y, 0], undefined, { color: "#c026d3", bright: 1.5, scale: [1, 1.45, 1] });
    k.add("glow", new THREE.OctahedronGeometry(0.32, 0), [0, y, 0], [0, 0.4, 0], { color: "#fbe8ff", bright: 2.2, scale: [1, 1.4, 1] });
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const [x, z] = dirXZ(a, 0.95);
    k.along("gloss", [x * 0.55, y, z * 0.55], [x * 1.45, y + (i % 2 ? 0.25 : -0.25), z * 1.45], 0, { geo: new THREE.ConeGeometry(0.13, 1, 4), color: "#0c0a0f" });
  }
  for (const s of [-1, 1]) k.along("gloss", [0, y + s * 0.95, 0], [0, y + s * 2.0, 0], 0, { geo: new THREE.ConeGeometry(0.17, 1, 4), color: "#0c0a0f" });
  k.add("gold", new THREE.TorusGeometry(0.62, 0.035, 6, 24), [0, y, 0], [Math.PI / 2, 0, 0], { color: SILVER });

  // Three silver rings turning about their own tilted axes, glowing beads riding them
  const rings: Array<{ r: number; tilt: V3; speed: number; bead: string }> = [
    { r: 1.5, tilt: [0.6, 0, 0.2], speed: 0.8, bead: "#a78bfa" },
    { r: 1.2, tilt: [-0.4, 0.3, 0.7], speed: -0.6, bead: "#67e8f9" },
    { r: 0.95, tilt: [1.2, 0, -0.3], speed: 1.1, bead: "#f0abfc" }
  ];
  for (const ring of rings) {
    k.frame([0, y, 0], [ring.tilt[0] + Math.PI / 2, ring.tilt[1], ring.tilt[2]], 1, () => {
      k.move({ kind: MOVE.spin, pivot: [0, 0, 0], axis: [0, 0, 1], speed: ring.speed }, () => {
        k.add("gold", new THREE.TorusGeometry(ring.r, 0.045, 8, 64), [0, 0, 0], undefined, { color: SILVER });
        k.add("gold", new THREE.TorusGeometry(ring.r, 0.07, 6, 64, 0.5), [0, 0, 0], [0, 0, 1.0], { color: "#b8bfcc" });
        for (let b = 0; b < 6; b++) {
          const a = (b / 6) * TAU;
          k.add("glow", new THREE.OctahedronGeometry(0.07), [Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0], undefined, { color: ring.bead, bright: 1.6 });
        }
      });
    });
  }

  // Obsidian rocks with crystal veins wheeling round the Eye, bobbing as they go
  k.move({ kind: MOVE.spin, pivot: [0, 0, 0], axis: [0, 1, 0], speed: -0.3, amp: 0.3 }, () => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const [x, z] = dirXZ(a, 2.9);
      const ry = y - 0.7 + (i % 2) * 0.9;
      k.add("gloss", rubble(0.34, 90 + i), [x, ry, z], [rng(), rng(), rng()], { color: i % 2 ? OBSIDIAN : OBSIDIAN2 });
      for (let s = 0; s < 3; s++) k.add("glow", new THREE.OctahedronGeometry(0.06 + rng() * 0.04), [x + (rng() - 0.5) * 0.5, ry + 0.12 + rng() * 0.2, z + (rng() - 0.5) * 0.5], [rng(), rng(), 0], { color: VIOLET, bright: 1.4, scale: [1, 2.2, 1] });
    }
  });
  // Motes wheeling close round the heart
  k.move({ kind: MOVE.spin, pivot: [0, 0, 0], axis: [0, 1, 0], speed: 0.5 }, () => {
    for (let i = 0; i < 6; i++) {
      const [x, z] = dirXZ((i / 6) * TAU, 1.85);
      k.add("glow", new THREE.OctahedronGeometry(0.1), [x, y + (i % 2 ? 0.5 : -0.5), z], undefined, { color: "#e9d5ff", bright: 1.4, scale: [1, 1.8, 1] });
    }
  });
  c.spark(SPARK.wisp, [0, y, 0], 10, { color: "#d8b4fe", size: 0.2, speed: 0.07, reach: 2.2, rise: 0.8 });
}

/** The Nethergarde Core: an obsidian dais in steps, six monoliths with violet runes, the Eye beating over its pool of night */
function netherCore(c: HeroCtx) {
  const { k } = c;
  // The dais: three octagonal steps of polished obsidian, silver inlay at their lips, runes lit on the middle step
  [2.6, 2.15, 1.7].forEach((r, i) => {
    k.add("gloss", new THREE.CylinderGeometry(r, r + 0.05, 0.2, 8), [0, 0.1 + i * 0.2, 0], [0, Math.PI / 8, 0], { color: i % 2 ? OBSIDIAN2 : OBSIDIAN });
    k.add("gold", new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.04, 8, 1, true), [0, 0.18 + i * 0.2, 0], [0, Math.PI / 8, 0], { color: SILVER });
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const ap = 2.15 * Math.cos(Math.PI / 8);
    const [x, z] = dirXZ(a, ap + 0.06);
    k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.3, phase: i * 0.8 }, () => {
      k.add("glow", new THREE.PlaneGeometry(1.0, 0.12), [x, 0.3, z], [0, facing(a), 0], { color: VIOLET, surf: runeBand(1.0, 0.12, 5), bright: 1.4 });
    });
  }
  // The pool of night on top, a faint violet sheen on it
  k.add("gloss", new THREE.CircleGeometry(1.45, 32), [0, 0.62, 0], [-Math.PI / 2, 0, 0], { color: "#07050c" });
  c.spark(SPARK.mote, [0, 0.8, 0], 14, { color: "#a78bfa", size: 0.06, speed: 1, reach: 1.2, rise: 0.25, spread: 2 });

  // Six monoliths of faceted obsidian leaning out, violet runes up their inner faces, silver caps
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const [x, z] = dirXZ(a, 2.35);
    const h = 2.5 + (i % 3) * 0.3;
    k.at([x, 0.2, z], facing(a) + Math.PI, () => {
      k.frame([0, 0, 0], [-0.12, 0, 0], 1, () => {
        k.add("gloss", new THREE.CylinderGeometry(0.14, 0.3, h, 5), [0, h / 2, 0], undefined, { color: i % 2 ? OBSIDIAN : OBSIDIAN2 });
        k.add("gold", new THREE.OctahedronGeometry(0.13), [0, h + 0.1, 0], undefined, { color: SILVER, scale: [1, 1.8, 1] });
        k.add("gold", new THREE.CylinderGeometry(0.27, 0.28, 0.06, 5), [0, h * 0.3, 0], undefined, { color: SILVER });
        k.move({ kind: MOVE.pulse, amp: 0.3, speed: 1.1, phase: i * 1.2 }, () => {
          k.add("glow", new THREE.PlaneGeometry(0.16, h * 0.55), [0, h * 0.62, 0.27], [-0.05, 0, 0], { color: VIOLET, surf: runeColumn(0.16, h * 0.55, 5), bright: 1.5 });
        });
      });
    });
  }
  eye(c, HEART_Y);
}

/**
 * The Core with the Archon seated beneath it: the Eye risen over the Empyrean citadel (floating, bobbing), a beam of
 * light running from it down into the citadel's crown, its monoliths wheeling wide below it, points down
 */
function netherCoreAscended(c: HeroCtx) {
  const { k } = c;
  k.float = 0.18;
  const y = ASCENDED_FLOAT + HEART_Y;
  eye(c, y);
  k.move({ kind: MOVE.pulse, amp: 0.25, speed: 2.0 }, () => {
    k.add("glow", new THREE.CylinderGeometry(0.06, 0.12, y - 9.3, 10, 1, true), [0, (y + 9.3) / 2 - 0.9, 0], undefined, { color: "#f5d0fe", bright: 1.6 });
  });
  k.move({ kind: MOVE.spin, pivot: [0, 0, 0], axis: [0, 1, 0], speed: 0.16, amp: 0.35 }, () => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const [x, z] = dirXZ(a, 4.2);
      const top = ASCENDED_FLOAT - 1.2 + (i % 2) * 1.1 + 1.2;
      k.add("gloss", new THREE.CylinderGeometry(0.28, 0.02, 2.4, 5), [x, top - 1.2, z], undefined, { color: i % 2 ? OBSIDIAN : OBSIDIAN2 });
      k.add("gold", new THREE.CylinderGeometry(0.3, 0.3, 0.06, 5), [x, top - 0.25, z], undefined, { color: SILVER });
      k.add("glow", new THREE.OctahedronGeometry(0.12), [x, top + 0.3, z], undefined, { color: VIOLET, bright: 1.6, scale: [1, 1.6, 1] });
    }
  });
  k.float = 0;
}

export const HERO_CORE_BUILDERS: Record<string, (c: HeroCtx) => void> = {
  ruins: netherCore,
  "ruins-ascended": netherCoreAscended
};
