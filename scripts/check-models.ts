/**
 * npm run check:models
 *
 * Fails (exit 1) when a 3D model has z-fighting: two differently coloured parts with a face pointing the same
 * way at (almost) the same place, which flickers on screen. See "Z-fighting" in docs/RENDERING.md.
 *
 * 1. Builder models: every NPC type is built through `buildNPCModel` (exactly what the map renders, after the
 *    `separateCoplanar` guard) and every pair of overlapping parts is compared, in Normal and in HD (the HD model kit's
 *    HD-only parts and HD shapes).
 * 2. Hand-written JSX models in `world/NPCModel.tsx` (none left today; any new one is picked up): unrotated <mesh> boxes and
 *    cylinders are read from the source and compared the same way.
 * 3. Rigs (`world/bossRigs.ts`: world bosses and legendary sites): every unrotated box/cylinder of a rig in its rest pose (bones without a
 *    rest rotation), compared the same way.
 * 4. Actors' HD models (`city/actorHd.ts`: townsfolk, lights, animals, moving parts), in their own frame, compared the
 *    same way (a colour slot counts as its own colour).
 * 5. World-map castles (`world/castleParts.ts` + `castleHd.ts`): each civilization at every stage, Normal and HD, its
 *    unrotated boxes and cylinders (moving parts and rippling cloth left out).
 * 6. Battlefield remains (`world/battleRemains.ts`): each civilization at every stage, a light and a heavy rout, Normal
 *    and HD, on flat ground.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Part } from "@/components/3d/city/parts";
import type { MapNPC } from "@/types";
import { NPC_KINDS, SPAWN_MODEL_TYPES, buildNPCModel } from "@/components/3d/world/npcs";
import { EPIC_LANDMARK_TYPES, LANDMARK_MODEL_TYPES } from "@/components/3d/world/landmarks";
import { REALM_MODEL_TYPES } from "@/components/3d/world/realmTypes";
import { GATE_MODEL_TYPES } from "@/components/3d/world/gates";
import { LANDMARK_STEPS } from "@/components/3d/world/landmarkStages";
import { MODEL_RIGS, BossBone } from "@/components/3d/world/bossRigs";
import { MERCENARY_RIGS } from "@/components/3d/world/mercenaryRigs";
import { VOID_RIGS } from "@/components/3d/world/voidRigs";
import { ACTOR_KINDS } from "@/components/3d/city/actorTemplates";
import { actorHdModel } from "@/components/3d/city/actorHd";
import { CASTLE_PARTS, CastlePart } from "@/components/3d/world/castleParts";
import { buildRemains } from "@/components/3d/world/battleRemains";
import type { CivilizationType } from "@/types";

/** Same-direction faces closer than this flicker (keep ≥ 0.05 apart, see docs/RENDERING.md) */
const EPS = 0.025;
/** Overlap needed before two faces can actually fight */
const MIN_OVERLAP = 0.02;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spans = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > MIN_OVERLAP;

/** Axis-aligned box used for the comparison (center + half extents) */
interface Box {
  label: string;
  color: string;
  glow: boolean;
  /** Box faces can be compared on all sides; cylinders only by their flat top */
  kind: "box" | "cyl";
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}

function findCoplanar(boxes: Box[]): string[] {
  const hits: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.color === b.color && a.glow === b.glow) continue; // same material: invisible even if coplanar
      const ox = spans(a.x - a.hx, a.x + a.hx, b.x - b.hx, b.x + b.hx);
      const oy = spans(a.y - a.hy, a.y + a.hy, b.y - b.hy, b.y + b.hy);
      const oz = spans(a.z - a.hz, a.z + a.hz, b.z - b.hz, b.z + b.hz);
      const pair = `${a.label} ${a.color} / ${b.label} ${b.color}`;
      if (ox && oz && Math.abs(a.y + a.hy - (b.y + b.hy)) < EPS) {
        hits.push(`top faces at y≈${(a.y + a.hy).toFixed(2)}: ${pair}`);
        continue;
      }
      if (a.kind === "box" && b.kind === "box" && oy) {
        const sameX = (Math.abs(a.x - a.hx - (b.x - b.hx)) < EPS || Math.abs(a.x + a.hx - (b.x + b.hx)) < EPS) && oz;
        const sameZ = (Math.abs(a.z - a.hz - (b.z - b.hz)) < EPS || Math.abs(a.z + a.hz - (b.z + b.hz)) < EPS) && ox;
        if (sameX) hits.push(`x side faces: ${pair}`);
        if (sameZ) hits.push(`z side faces: ${pair}`);
      }
    }
  }
  return hits;
}

/* ------------------------------ builder models ------------------------------ */

/** Only unrotated boxes/cylinders (or boxes turned in quarter steps) have faces we can compare exactly */
function partToBox(p: Part, index: number): Box | null {
  if (p.rx || p.rz) return null;
  if (p.shape !== "box" && p.shape !== "cyl") return null;
  const ry = p.ry ?? 0;
  const quarter = Math.abs(ry % (Math.PI / 2)) < 1e-6;
  if (p.shape === "box" && !quarter) return null;
  const swap = p.shape === "box" && Math.abs(ry % Math.PI) > 1e-6;
  const [hx, hz] = p.shape === "cyl" ? [p.w / 2, p.d / 2] : swap ? [p.d / 2, p.w / 2] : [p.w / 2, p.d / 2];
  return { label: `#${index} ${p.shape}`, color: p.color, glow: !!p.glow, kind: p.shape, x: p.x, y: p.y, z: p.z, hx, hy: p.h / 2, hz };
}

const builderTypes = [...new Set([...NPC_KINDS.map((k) => k.type as string), ...SPAWN_MODEL_TYPES, ...LANDMARK_MODEL_TYPES])];
const failures: string[] = [];

/**
 * A model as drawn in each graphics quality: Normal (no HD-only parts) and HD (no Normal-only parts, each part in its
 * HD shape; a part turned by its HD rest pose is rotated, so it can't be compared exactly)
 */
const qualities = (parts: Part[]): Array<[string, Part[]]> => [
  ["", parts.filter((p) => p.hd !== true)],
  [" (HD)", parts.filter((p) => p.hd !== false).map((p) => ({ ...p, shape: p.hdShape ?? p.shape, rx: p.pose ? 1 : p.rx }))]
];

for (const type of builderTypes) {
  for (const [label, parts] of qualities(buildNPCModel({ id: "check", type, x: 0, z: 0 } as MapNPC))) {
    const boxes = parts.map(partToBox).filter((b): b is Box => b !== null);
    for (const hit of findCoplanar(boxes)) failures.push(`${type}${label}: ${hit}`);
  }
}

// A frontier gate whose walls burn lies broken open: its own model (checked where the map stands each gate)
for (const type of GATE_MODEL_TYPES) {
  for (const [x, z] of [[-24, 24], [24, 24], [-24, -24], [24, -24]]) {
    for (const [label, parts] of qualities(buildNPCModel({ id: `check-${x}-${z}`, type, x, z } as MapNPC, { ruined: true }))) {
      const boxes = parts.map(partToBox).filter((b): b is Box => b !== null);
      for (const hit of findCoplanar(boxes)) failures.push(`${type}${label} (broken open at ${x},${z}): ${hit}`);
    }
  }
}

// Epic landmarks also stand rising and crumbling on a rotation day: every step of both states is its own model
let stagedModels = 0;
for (const type of EPIC_LANDMARK_TYPES) {
  for (const phase of ["rising", "crumbling"] as const) {
    for (let step = 0; step < LANDMARK_STEPS; step++) {
      const npc = { id: "check", type, x: 0, z: 0, landmarkState: { phase, from: 0, until: 1 }, landmarkStep: step } as MapNPC;
      for (const [label, parts] of qualities(buildNPCModel(npc))) {
        const boxes = parts.map(partToBox).filter((b): b is Box => b !== null);
        for (const hit of findCoplanar(boxes)) failures.push(`${type}${label} (${phase}, step ${step + 1}/${LANDMARK_STEPS}): ${hit}`);
      }
      stagedModels++;
    }
  }
}

// Buffer realms grow through four stages (common → epic), each built up on its first day and the last crumbling away
for (const type of REALM_MODEL_TYPES) {
  for (let stage = 0; stage < 4; stage++) {
    const realm = { stage, day: 1, level: 1, building: false, stageEndsAt: 0 };
    const states: Array<MapNPC["landmarkState"]> = [undefined, { phase: "rising", from: 0, until: 1 }, ...(stage === 3 ? [{ phase: "crumbling" as const, from: 0, until: 1 }] : [])];
    for (const state of states) {
      for (let step = 0; step < (state ? LANDMARK_STEPS : 1); step++) {
        const npc = { id: "check", type, x: 0, z: 0, realm, landmarkState: state, landmarkStep: step } as MapNPC;
        for (const [label, parts] of qualities(buildNPCModel(npc))) {
          const boxes = parts.map(partToBox).filter((b): b is Box => b !== null);
          for (const hit of findCoplanar(boxes)) failures.push(`${type}${label} (stage ${stage}${state ? `, ${state.phase} step ${step + 1}` : ""}): ${hit}`);
        }
        stagedModels++;
      }
    }
  }
}

/* ------------------------------ JSX models ------------------------------ */

const jsxFile = path.join(root, "src/components/3d/world/NPCModel.tsx");
const jsx = fs.readFileSync(jsxFile, "utf8").replace(/\r\n/g, "\n");
const blocks = [...jsx.matchAll(/\{npc\.type === "([^"]+)" && \(\n([\s\S]*?)\n {6}\)\}/g)];
const nums = (s: string) => s.split(",").map((v) => Number(v.trim()));

for (const [, type, body] of blocks) {
  const group = /<group position=\{\[([^\]]+)\]\}/.exec(body);
  const [gx, gy, gz] = group ? nums(group[1]) : [0, 0, 0];
  const boxes: Box[] = [];
  let index = 0;
  for (const m of body.matchAll(/<mesh([^>]*)>\s*<(boxGeometry|cylinderGeometry) args=\{\[([^\]]+)\]\} \/>\s*<meshStandardMaterial color="([^"]+)"/g)) {
    index++;
    if (/rotation=/.test(m[1])) continue;
    const pos = /position=\{\[([^\]]+)\]\}/.exec(m[1]);
    const [px, py, pz] = pos ? nums(pos[1]) : [0, 0, 0];
    const a = nums(m[3]);
    const box = m[2] === "boxGeometry";
    // cylinderGeometry args: radiusTop, radiusBottom, height
    const r = box ? 0 : Math.max(a[0], a[1]);
    boxes.push({
      label: `mesh ${index} ${box ? "box" : "cyl"}`,
      color: m[4],
      glow: false,
      kind: box ? "box" : "cyl",
      x: gx + px,
      y: gy + py,
      z: gz + pz,
      hx: box ? a[0] / 2 : r,
      hy: (box ? a[1] : a[2]) / 2,
      hz: box ? a[2] / 2 : r
    });
  }
  for (const hit of findCoplanar(boxes)) failures.push(`${type} (NPCModel.tsx): ${hit}`);
}

/* ------------------------------ boss rigs ------------------------------ */

const ALL_RIGS = { ...MODEL_RIGS, ...MERCENARY_RIGS, ...VOID_RIGS };
for (const [type, rig] of Object.entries(ALL_RIGS)) {
  const boxes: Box[] = [];
  let index = 0;
  const walk = (bone: BossBone, ox: number, oy: number, oz: number, label: string) => {
    // Parts under a rotated bone are turned: their faces can't be compared exactly
    if (bone.r && bone.r.some((v) => v !== 0)) return;
    const x = ox + bone.at[0];
    const y = oy + bone.at[1];
    const z = oz + bone.at[2];
    for (const p of bone.parts) {
      index++;
      if (p.r && p.r.some((v) => v !== 0)) continue;
      if (p.s !== "box" && p.s !== "cyl") continue;
      const box = p.s === "box";
      const rx = box ? p.z[0] / 2 : (p.z[0] / 2) * Math.max(1, p.t ?? 1);
      const rz = box ? p.z[2] / 2 : (p.z[2] / 2) * Math.max(1, p.t ?? 1);
      boxes.push({ label: `${label} part ${index} ${p.s}`, color: p.c, glow: !!p.glow, kind: box ? "box" : "cyl", x: x + p.p[0], y: y + p.p[1], z: z + p.p[2], hx: rx, hy: p.z[1] / 2, hz: rz });
    }
    bone.kids?.forEach((k, i) => walk(k, x, y, z, `${label}.${i}`));
  };
  walk(rig.root, 0, 0, 0, "bone");
  for (const hit of findCoplanar(boxes)) failures.push(`${type} (bossRigs.ts): ${hit}`);
}

/* ------------------------------ actors (HD) ------------------------------ */

for (const kind of ACTOR_KINDS) {
  const parts = actorHdModel(kind).parts.map((p) => ({ ...p, shape: p.hdShape ?? p.shape, rx: p.pose ? 1 : p.rx }));
  const boxes = parts.map(partToBox).filter((b): b is Box => b !== null);
  for (const hit of findCoplanar(boxes)) failures.push(`${kind} (actor HD): ${hit}`);
}

/* ------------------------------ battlefield remains ------------------------------ */

for (const civ of ["human", "elf", "dwarf", "orc", "arcane"] as CivilizationType[]) {
  for (const fallen of [3, 5000]) {
    for (const stage of [0, 1, 2] as const) {
      const site = { id: `check-${civ}-${fallen}`, x: 0, y: 0, z: 0, civ, fallen };
      for (const [label, parts] of qualities(buildRemains(site, stage))) {
        const boxes = parts.map(partToBox).filter((b): b is Box => b !== null);
        for (const hit of findCoplanar(boxes)) failures.push(`remains ${civ} (${fallen} fallen, stage ${stage})${label}: ${hit}`);
      }
    }
  }
}

/* ------------------------------ castles ------------------------------ */

/** A castle part's box, when it stands unturned (or turned in quarter steps about y); moving parts are left out (a pulsing glow stands still) */
function castleBox(p: CastlePart, index: number): Box | null {
  if (p.anim || (p.wave && p.wave.kind !== "pulse")) return null;
  const [kind, argStr] = p.geo.split(":");
  const a = argStr.split(",");
  const s = p.scale ?? 1;
  let shape: "box" | "cyl";
  let size: [number, number, number];
  if (kind === "kit") {
    if (a[0] !== "box" && a[0] !== "cyl" && a[0] !== "block") return null;
    const [x, y, z, w] = p.quat ?? [0, 0, 0, 1];
    const ry = 2 * Math.atan2(y, w);
    if (Math.abs(x) > 1e-6 || Math.abs(z) > 1e-6 || Math.abs(ry % (Math.PI / 2)) > 1e-6) return null;
    shape = a[0] === "cyl" ? "cyl" : "box";
    const swap = shape === "box" && Math.abs(ry % Math.PI) > 1e-6;
    size = swap ? [p.size![2], p.size![1], p.size![0]] : p.size!;
  } else {
    if (p.rot?.some((v) => v !== 0)) return null;
    const n = a.map(Number);
    if (kind === "box") [shape, size] = ["box", [n[0] * s, n[1] * s, n[2] * s]];
    else if (kind === "cyl") [shape, size] = ["cyl", [Math.max(n[0], n[1]) * 2 * s, n[2] * s, Math.max(n[0], n[1]) * 2 * s]];
    else return null;
  }
  const glow = !!p.mat?.emissive;
  return { label: `${p.geo} at (${p.pos.map((v) => v.toFixed(2)).join(", ")})`, color: p.color, glow, kind: shape, x: p.pos[0], y: p.pos[1], z: p.pos[2], hx: size[0] / 2, hy: size[1] / 2, hz: size[2] / 2 };
}

let castleModels = 0;
for (const [civ, parts] of Object.entries(CASTLE_PARTS)) {
  for (let stage = 0; stage <= 4; stage++) {
    for (const [label, hd] of [["", false], [" (HD)", true]] as const) {
      const shown = parts.filter((p) => p.hd !== !hd && (p.minStage ?? 0) <= stage && ((hd ? p.hdMaxStage : undefined) ?? p.maxStage ?? 5) >= stage);
      const boxes = shown.map(castleBox).filter((b): b is Box => b !== null);
      for (const hit of findCoplanar(boxes)) failures.push(`castle ${civ} stage ${stage}${label}: ${hit}`);
      castleModels++;
    }
  }
}

/* ------------------------------ report ------------------------------ */

const checked = `${builderTypes.length} builder models (+ ${stagedModels} rising / crumbling landmark and realm stages) + ${blocks.length} JSX models + ${Object.keys(ALL_RIGS).length} rigs (bosses, legendary sites, mercenaries and the Void Gate's creatures) + ${ACTOR_KINDS.length} actor HD models + ${castleModels} castle stages + 30 battlefield remains`;
if (failures.length) {
  console.error(`✖ z-fighting: ${failures.length} coplanar face pair(s) in ${checked}\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("\nKeep same-direction faces of differently coloured parts ≥ 0.05 apart (see \"Z-fighting\" in docs/RENDERING.md).");
  process.exit(1);
}
console.log(`✓ No z-fighting in ${checked}`);
