import { ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { marchForceText } from "@/utils/mercenaries";
import type { BandMarchEntry } from "./BandMarches";
import { bandModelsStanding } from "./bandModels";
import { BAND_SCALE, MercKind } from "./mercActors";
import { useHd } from "@/utils/graphics";
import { bandLossText } from "@/utils/mercenaries";
import { useRealmNight } from "@/utils/realmTime";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { ActiveMarch, BattleRound, CivilizationType } from "@/types";
import { Actors } from "@/components/3d/city/Actors";
import { Actor, ActorKind } from "@/components/3d/city/parts";
import { MOUNT_COATS, riderLift } from "@/components/3d/city/actorTemplates";
import { SEA_LEVEL, Terrain } from "./terrain";
import { BATTLE_FIGHT_MS, BATTLE_OUTCOME_MS, CIV_EMBLEM, CIV_WAR_COLOR, DEFEAT_MARKER_MS, MARCH_KIND_ICON, MarchPhase, battleEndOf, formatDuration, marchLost, marchPhase, nextPhaseChange, returnStartOf } from "@/utils/war";
import { BATTLE_ROUND_MS } from "@/utils/civDemographics";
import { ClashingSwords, ClashSpot, DefeatMarkers, DefeatSpot, SWORD_LIFT } from "./BattleFx";
import { RING_RANK_GAP, RING_WALK_MS, hostOf, hostShift, nextRingChange, ringPlace, updateBattleRings, walkingToRing } from "./battleRing";
import { FLOAT_STYLE, FloatEntry, FloatingText, MAP_FLOATING_TEXT } from "@/components/3d/FloatingText";
import { MAP_SPELL_FX, SpellFx, SpellSpot, spellNow } from "@/components/3d/SpellFx";
import { lookOf } from "@/utils/spellFx";
import { BOSS_CRIES } from "./bossCries";
import { NPC_STRIKES } from "./npcStrikes";

/*
 * Armies on the world map. Each march is a small formation of instanced soldiers (through
 * `Actors`, so draw calls depend on the civs involved, not on the number of armies):
 *   marching  → walks outbound along the route on the wall clock
 *   fighting  → the armies walk round to their places in a ring about the target (`battleRing.ts`), then they and the
 *               garrison lunge at each other, sparks fly (live 10s rounds)
 *   victory   → attackers cheer over the fallen garrison, right after the battle
 *   defeat    → fallen attackers at the walls, survivors falling back, right after the battle
 *   returning → then survivors walk back home from target to origin (carrying plunder if victorious)
 * Live battles get crossed swords striking in round rhythm overhead, and after every round its numbers rise over both
 * sides: soldiers lost (red) and damage dealt (gold, smaller), through the shared floating-text kit (one draw call); a routed army leaves its remains on the
 * battlefield for DEFEAT_MARKER_MS, burning down as they go (both in BattleFx, a fixed number of draw calls).
 * Gatherers stand around their node working (fighting when attacked), with one shared instanced progress ring
 * for every gathering march (one draw call; progress is a per-instance attribute updated per frame).
 * Scouts are one or two riders: civilians on their own civilization's mount, dressed as the target kingdom's people when
 * they scout one (`disguiseCiv`), in their own civilization's clothes otherwise (instanced actors, so a mount adds draws only
 * by the shapes it brings, never by the number of scouts). Against a world NPC
 * (mob / bandit) the pack's own model is the defender: no garrison figures are added.
 * React only re-renders when a march changes phase; movement happens in useFrame.
 */

const SOLDIER_SCALE = 1.1;
/** Marching through the sea or a lagoon, figures wade at most this deep (about waist-high), never down to the seabed */
const WADE_DEPTH = 0.5;
/** Where a figure (and what marks its march: routes, rings, numbers) stands: the ground, or wading in the water */
const standOn = (terrain: Terrain, x: number, z: number) => Math.max(terrain.height(x, z), SEA_LEVEL - WADE_DEPTH);

/** An islet raised under a land NPC over water: its flat top at `y` out to `r`, sloping 0.6 down to 1.15 r */
export interface Islet {
  x: number;
  y: number;
  z: number;
  r: number;
}
const NO_ISLETS: Islet[] = [];

/** The terrain with the islets standing on it: figures over one stand on its top (or its slope), not in the sea round it */
function onIslets(land: Terrain, islets: Islet[]): Terrain {
  if (islets.length === 0) return land;
  return {
    ...land,
    height: (x, z) => {
      let h = land.height(x, z);
      for (const it of islets) {
        const dx = x - it.x;
        const dz = z - it.z;
        const edge = it.r * 1.15;
        if (Math.abs(dx) > edge || Math.abs(dz) > edge) continue;
        const d = Math.hypot(dx, dz);
        if (d < edge) h = Math.max(h, d <= it.r ? it.y : it.y - (0.6 * (d - it.r)) / (edge - it.r));
      }
      return h;
    }
  };
}
const MIN_FIGURES = 3;
const MAX_ATTACKER_FIGURES = 12;
const MAX_DEFENDER_FIGURES = 9;
const FORMATION_COLUMNS = 4;
/** A band's mercenaries stand bigger than soldiers: their ranks this much wider */
const BAND_SPREAD = 1.4;
const COLUMN_SPACING = 0.75;
const ROW_SPACING = 0.85;
const DEPART_OFFSET = 2.5;
const STANDOFF = 4.2;
const GARRISON_OFFSET = 2.6;
const RETREAT_DISTANCE = 7;
const SPARKS = 4;
const FIGHT_SPEED = 7;
const WAR_LOD_DISTANCE = 400;
const ROUTE_SEGMENTS = 24;
const ROUTE_LIFT = 0.3;
export const GATHER_RADIUS = 2.8;
const LOBBY_RADIUS = 5;
const STATIONED_RADIUS = 3.4;
const MAX_GATHER_FIGURES = 8;
const GATHER_RING_INNER = 3.3;
const GATHER_RING_OUTER = 3.6;
const GATHER_RING_LIFT = 0.15;

const SKIN: Record<CivilizationType, string> = { human: "#e0b48a", elf: "#f1d3b3", dwarf: "#d9a07a", orc: "#5f8a2e", arcane: "#c4b5fd" };
const HAIR: Record<CivilizationType, string> = { human: "#4a3222", elf: "#f5deb3", dwarf: "#9a3412", orc: "#1c1917", arcane: "#312e81" };
const ACCENT: Record<CivilizationType, string> = { human: "#eab308", elf: "#a7f3d0", dwarf: "#78716c", orc: "#7f1d1d", arcane: "#e879f9" };

const soldierKind = (civ: CivilizationType) => `soldier_${civ}` as ActorKind;
/** 🗡️ A march in an Armory set: its soldiers wear the set's gear (`soldier1` uncommon … `soldier3` epic) */
const ARMED_ROLE = { uncommon: "soldier1", rare: "soldier2", epic: "soldier3" } as const;
const marcherKind = (m: ActiveMarch) => (m.armory && !m.band ? (`${ARMED_ROLE[m.armory.rarity]}_${m.attackerCiv}` as ActorKind) : soldierKind(m.attackerCiv));
const colorsFor = (civ: CivilizationType) => [CIV_WAR_COLOR[civ], SKIN[civ], HAIR[civ], ACCENT[civ]];

/**
 * A scout and their mount (GAME_GUIDE §13 Scouting): a civilian in the target kingdom's clothes (or their own) sitting
 * the sender's mount, both on the same path and stride. The saddle cloth is the sender's colour
 */
function scoutRiders(m: ActiveMarch, i: number, path: Omit<Actor, "kind" | "y" | "speed" | "phase" | "colors" | "scale">): Actor[] {
  const look = m.disguiseCiv ?? m.attackerCiv;
  const phase = (i * 0.37) % 1;
  const [coat, mane] = MOUNT_COATS[m.attackerCiv];
  return [
    { ...path, kind: `mount_${m.attackerCiv}` as ActorKind, y: 0, speed: FIGHT_SPEED, phase, colors: [coat, mane, CIV_WAR_COLOR[m.attackerCiv]], scale: SOLDIER_SCALE },
    { ...path, kind: `villager_${look}` as ActorKind, y: riderLift(look, m.attackerCiv) * SOLDIER_SCALE, speed: FIGHT_SPEED, phase, colors: colorsFor(look), scale: SOLDIER_SCALE, ride: true }
  ];
}

const figuresFor = (soldiers: number, max: number) => Math.min(max, Math.max(MIN_FIGURES, Math.ceil(Math.sqrt(Math.max(1, soldiers)))));

function frame(m: ActiveMarch) {
  const dx = m.targetX - m.startX;
  const dz = m.targetZ - m.startZ;
  const len = Math.max(0.001, Math.hypot(dx, dz));
  const dir = { x: dx / len, z: dz / len };
  return { dir, right: { x: dir.z, z: -dir.x }, yaw: Math.atan2(dir.x, dir.z), len };
}

/** Figure `i` of `count` in ranks behind a point; `spread` widens the ranks for bigger figures (a band's mercenaries) */
function slot(i: number, count: number, f: Pick<ReturnType<typeof frame>, "dir" | "right">, cx: number, cz: number, facing = 1, spread = 1) {
  const cols = Math.min(FORMATION_COLUMNS, count);
  const col = i % cols;
  const row = Math.floor(i / cols);
  const lateral = ((col - (cols - 1) / 2) * COLUMN_SPACING + (row % 2) * 0.2) * spread;
  const back = row * ROW_SPACING * facing * spread;
  return { x: cx + f.right.x * lateral - f.dir.x * back, z: cz + f.right.z * lateral - f.dir.z * back };
}

/** A march's figures; `mercs` (Normal): a band walks as its own mercenaries (HD walks them in `BandMarches`) */
function buildActors(m: ActiveMarch, phase: MarchPhase, mercs = false, now = Date.now()): Actor[] {
  const f = frame(m);
  const out: Actor[] = [];
  const scouts = m.kind === "scout";
  // 🪙 A mercenary band marches as many figures as it has models standing (a legendary alone): in Normal its own
  // mercenaries (their rigs baked into actor templates, `mercActors.ts`), in wider ranks for their size
  const band = mercs && !scouts ? m.band : undefined;
  const spread = band ? BAND_SPREAD : 1;
  const attackers = scouts ? Math.min(2, Math.max(1, m.soldiersCount)) : m.band ? Math.min(MAX_ATTACKER_FIGURES, bandModelsStanding(m)) : figuresFor(m.soldiersCount, MAX_ATTACKER_FIGURES);
  const report = m.battleResult;
  const vsNpc = m.targetType === "npc";
  const defenders = vsNpc || scouts ? 0 : report ? (report.defenderInitialSoldiers > 0 ? figuresFor(report.defenderInitialSoldiers, MAX_DEFENDER_FIGURES) : 0) : Math.ceil(MAX_DEFENDER_FIGURES / 2);
  const defenderCiv: CivilizationType = report?.defenderCiv ?? "arcane";
  // Marches that left together walk side by side as one host
  const shift = hostShift(m, f);
  const startX = m.startX + f.dir.x * DEPART_OFFSET + shift.x;
  const startZ = m.startZ + f.dir.z * DEPART_OFFSET + shift.z;
  const lineX = m.targetX - f.dir.x * STANDOFF + shift.x;
  const lineZ = m.targetZ - f.dir.z * STANDOFF + shift.z;
  // Where it fights: its place in the ring round the target, the garrison turned to face it
  const place = ringPlace(m);
  const ring = place.frame;
  const ringAt = STANDOFF + place.rank * RING_RANK_GAP;
  const ringX = m.targetX - ring.dir.x * ringAt;
  const ringZ = m.targetZ - ring.dir.z * ringAt;
  const garrisonX = m.targetX - ring.dir.x * GARRISON_OFFSET;
  const garrisonZ = m.targetZ - ring.dir.z * GARRISON_OFFSET;
  const centre = { x: m.targetX, z: m.targetZ };
  const base = (i: number) => ({ kind: band ? (band.type as MercKind) : marcherKind(m), y: 0, speed: FIGHT_SPEED, phase: (i * 0.37) % 1, colors: colorsFor(m.attackerCiv), scale: band ? BAND_SCALE[band.rarity] : SOLDIER_SCALE });

  if (phase === "marching") {
    for (let i = 0; i < attackers; i++) {
      const from = slot(i, attackers, f, startX, startZ, 1, spread);
      const to = slot(i, attackers, f, lineX, lineZ, 1, spread);
      const path = { x: from.x, z: from.z, x2: to.x, z2: to.z, yaw: f.yaw, motion: "march" as const, t0: m.departTime, t1: m.arrivalTime };
      if (scouts) out.push(...scoutRiders(m, i, path));
      else out.push({ ...base(i), ...path });
    }
    return out;
  }

  if (phase === "rallying" || phase === "stationed") {
    // Lobby: each member's block stands at its own spot around the leader's castle; stationed troops stand by the host's gate
    const n = phase === "stationed" ? Math.min(4, figuresFor(m.soldiersCount, 4)) : figuresFor(m.soldiersCount, MAX_ATTACKER_FIGURES);
    let h = 0;
    for (const ch of m.attackerId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const a = ((h % 360) / 360) * Math.PI * 2;
    const r = phase === "stationed" ? STATIONED_RADIUS : LOBBY_RADIUS;
    const cx = m.targetX + Math.sin(a) * r;
    const cz = m.targetZ + Math.cos(a) * r;
    const face = { dir: { x: -Math.sin(a), z: -Math.cos(a) }, right: { x: -Math.cos(a), z: Math.sin(a) }, yaw: a + Math.PI, len: r };
    for (let i = 0; i < n; i++) {
      const p = slot(i, n, face, cx, cz);
      out.push({ ...base(i), x: p.x, z: p.z, yaw: face.yaw, motion: phase === "rallying" ? "cheer" : "idle", speed: 1 });
    }
    return out;
  }

  if (phase === "gathering") {
    // Workers in a circle around the node, bent over their work (swinging when attacked)
    const n = Math.min(MAX_GATHER_FIGURES, figuresFor(m.soldiersCount, MAX_GATHER_FIGURES));
    const attacked = Boolean(m.gather?.pausedAt);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = m.targetX + Math.sin(a) * GATHER_RADIUS;
      const z = m.targetZ + Math.cos(a) * GATHER_RADIUS;
      out.push({ ...base(i), x, z, yaw: a + Math.PI, motion: attacked ? "fight" : "work", speed: attacked ? FIGHT_SPEED : 1 });
    }
    return out;
  }

  if (phase === "returning") {
    const left = returnStartOf(m);
    // An army on the far side walks round the target first, then takes its road home
    const t0 = place.moved ? left + RING_WALK_MS : left;
    const t1 = m.returnTime ?? t0 + 30_000;
    if (now < t0) {
      for (let i = 0; i < attackers; i++) {
        const from = slot(i, attackers, ring, ringX, ringZ, -1, spread);
        const to = slot(i, attackers, f, lineX, lineZ, -1, spread);
        out.push({ ...base(i), x: from.x, z: from.z, x2: to.x, z2: to.z, arc: centre, yaw: 0, motion: "march", t0: left, t1: t0 });
      }
      return out;
    }
    // Caught scouts never come home
    const home = scouts && m.soldiersCount <= 0 ? 0 : attackers;
    for (let i = 0; i < home; i++) {
      const from = slot(i, attackers, f, lineX, lineZ, -1, spread);
      const to = slot(i, attackers, f, startX, startZ, -1, spread);
      const path = { x: from.x, z: from.z, x2: to.x, z2: to.z, yaw: f.yaw + Math.PI, motion: "march" as const, t0, t1 };
      if (scouts) out.push(...scoutRiders(m, i, path));
      else out.push({ ...base(i), ...path });
    }
    return out;
  }

  // At the walls: attackers on the line, the garrison facing them
  const fallenAttackers = phase === "defeat" && report ? Math.round((attackers * report.attackerCasualties) / Math.max(1, report.attackerInitialSoldiers)) : 0;
  // Survivors fall back once the battle is over (the server's act_until as it turns them home)
  const retreatAt = m.phase === "returning" || m.phase === "done" ? battleEndOf(m) : m.arrivalTime + BATTLE_FIGHT_MS;
  const walking = phase === "fighting" && walkingToRing(m, place, now);
  for (let i = 0; i < attackers; i++) {
    const p = slot(i, attackers, ring, ringX, ringZ, 1, spread);
    if (walking) {
      const from = slot(i, attackers, f, lineX, lineZ, 1, spread);
      out.push({ ...base(i), x: from.x, z: from.z, x2: p.x, z2: p.z, arc: centre, yaw: 0, motion: "march", t0: m.arrivalTime, t1: m.arrivalTime + RING_WALK_MS });
    } else if (phase === "fighting") out.push({ ...base(i), x: p.x, z: p.z, yaw: ring.yaw, motion: "fight" });
    else if (phase === "victory") out.push({ ...base(i), x: p.x, z: p.z, yaw: ring.yaw, motion: "cheer" });
    else if (i < fallenAttackers) out.push({ ...base(i), x: p.x, z: p.z, yaw: ring.yaw, motion: "fallen" });
    else {
      const back = { x: p.x - ring.dir.x * RETREAT_DISTANCE, z: p.z - ring.dir.z * RETREAT_DISTANCE };
      out.push({ ...base(i), x: p.x, z: p.z, x2: back.x, z2: back.z, yaw: ring.yaw + Math.PI, motion: "march", t0: retreatAt, t1: retreatAt + BATTLE_OUTCOME_MS });
    }
  }
  for (let i = 0; i < defenders; i++) {
    const p = slot(i, defenders, ring, garrisonX, garrisonZ, -1);
    const motion = phase === "fighting" ? "fight" : phase === "victory" ? "fallen" : "cheer";
    out.push({ kind: soldierKind(defenderCiv), x: p.x, y: 0, z: p.z, yaw: ring.yaw + Math.PI, motion, speed: FIGHT_SPEED, phase: (i * 0.53) % 1, colors: colorsFor(defenderCiv), scale: SOLDIER_SCALE });
  }
  if (phase === "fighting" && !walking) {
    const midX = (ringX + garrisonX) / 2;
    const midZ = (ringZ + garrisonZ) / 2;
    for (let i = 0; i < SPARKS; i++) {
      const lateral = (i - (SPARKS - 1) / 2) * COLUMN_SPACING;
      out.push({ kind: "sparkle", x: midX + ring.right.x * lateral, y: 0.6, z: midZ + ring.right.z * lateral, yaw: 0, motion: "float", speed: 2.5, phase: i / SPARKS, colors: ["#fde68a"] });
    }
  }
  return out;
}

/** Floating badge that follows an outbound or returning army (position updated per frame, countdown per second) */
function MarchLabel({ march, phase, terrain, hostSize = 1 }: { march: ActiveMarch; phase: "marching" | "returning"; terrain: Terrain; hostSize?: number }) {
  const group = useRef<THREE.Group>(null);
  const countdown = useRef<HTMLSpanElement>(null);
  const f = useMemo(() => frame(march), [march]);

  useFrame(() => {
    if (!group.current) return;
    if (phase === "returning") {
      const t0 = returnStartOf(march);
      const t1 = march.returnTime ?? t0 + 30_000;
      const t = Math.min(1, Math.max(0, (Date.now() - t0) / Math.max(1, t1 - t0)));
      const span = Math.max(0, f.len - DEPART_OFFSET - STANDOFF);
      const x = march.startX + f.dir.x * (DEPART_OFFSET + span * (1 - t));
      const z = march.startZ + f.dir.z * (DEPART_OFFSET + span * (1 - t));
      group.current.position.set(x, standOn(terrain, x, z) + 3, z);
    } else {
      const t = Math.min(1, Math.max(0, (Date.now() - march.departTime) / Math.max(1, march.arrivalTime - march.departTime)));
      const span = Math.max(0, f.len - DEPART_OFFSET - STANDOFF);
      const x = march.startX + f.dir.x * (DEPART_OFFSET + span * t);
      const z = march.startZ + f.dir.z * (DEPART_OFFSET + span * t);
      group.current.position.set(x, standOn(terrain, x, z) + 3, z);
    }
  });
  useEffect(() => {
    const targetEnd = phase === "returning" ? (march.returnTime ?? march.arrivalTime) : march.arrivalTime;
    const tick = () => {
      if (countdown.current) countdown.current.textContent = formatDuration(targetEnd - Date.now());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [march.arrivalTime, march.returnTime, phase]);

  const hasCarry = Boolean(march.carry && Object.values(march.carry).some((v) => typeof v === "number" && v > 0));

  return (
    <group ref={group}>
      <Html zIndexRange={[20, 0]} center distanceFactor={45} style={{ pointerEvents: "none" }}>
        <div className="px-2.5 py-1 rounded-lg border border-slate-700/80 bg-slate-900/90 text-slate-200 whitespace-nowrap select-none text-[11px] font-mono shadow-xl">
          <span className="font-bold font-medieval">
            {CIV_EMBLEM[march.attackerCiv]} {march.attackerName}
          </span>{" "}
          <span className={phase === "returning" ? "text-emerald-300" : "text-rose-300"}>
            {hostSize > 1 ? `${MARCH_KIND_ICON[march.kind ?? "attack"] ?? "⚔️"} ${hostSize} marches` : (
              <>
                {phase === "returning" ? "↩️" : march.band ? march.band.emblem : MARCH_KIND_ICON[march.kind ?? "attack"] ?? "⚔️"}
                {marchForceText(march)}
              </>
            )}
          </span>{" "}
          {hasCarry && <span className="text-amber-300">💰</span>}{" "}
          <span className="text-slate-500">{phase === "returning" ? "←" : "→"}</span>{" "}
          <span className="text-amber-300">{march.targetName}</span>{" "}
          <span ref={countdown} className="text-rose-300 font-bold tabular-nums" />
        </div>
      </Html>
    </group>
  );
}

const OUTCOME_LABEL: Partial<Record<MarchPhase, { text: string; cls: string }>> = {
  gathering: { text: "⛏️ Gathering", cls: "border-emerald-400/70 text-emerald-100 bg-slate-950/90" },
  rallying: { text: "🚩 Rally lobby", cls: "border-amber-400/80 text-amber-100 bg-amber-950/90" },
  victory: { text: "🏆 Victory!", cls: "border-amber-400 text-amber-100 bg-amber-950/90" },
  defeat: { text: "🛡️ Repelled", cls: "border-rose-400 text-rose-100 bg-rose-950/90" }
};

const GATHER_RING = new THREE.RingGeometry(GATHER_RING_INNER, GATHER_RING_OUTER, 48).rotateX(-Math.PI / 2);

/**
 * Progress ring around every node being gathered, in one draw call: a per-instance `progress` attribute
 * (0..1) cuts the ring at that angle in the fragment shader; it's refreshed each frame from the wall clock.
 */
function GatherRings({ marches, terrain }: { marches: ActiveMarch[]; terrain: Terrain }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const capacity = Math.max(8, 2 ** Math.ceil(Math.log2(Math.max(1, marches.length))));
  const geometry = useMemo(() => {
    const g = GATHER_RING.clone();
    g.setAttribute("progress", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    return g;
  }, [capacity]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: "#34d399", transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "attribute float progress;\nvarying float vProgress;\nvarying vec2 vLocal;\nvoid main() {\n  vProgress = progress;\n  vLocal = position.xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "varying float vProgress;\nvarying vec2 vLocal;\nvoid main() {\n  float ang = atan(vLocal.x, vLocal.y) / 6.2831853 + 0.5;\n  if (ang > vProgress) discard;");
    };
    m.customProgramCacheKey = () => "gather-rings";
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const mtx = new THREE.Matrix4();
    marches.forEach((m, i) => {
      let top = standOn(terrain, m.targetX, m.targetZ);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        top = Math.max(top, standOn(terrain, m.targetX + Math.cos(a) * GATHER_RING_OUTER, m.targetZ + Math.sin(a) * GATHER_RING_OUTER));
      }
      mesh.setMatrixAt(i, mtx.makeTranslation(m.targetX, top + GATHER_RING_LIFT, m.targetZ));
    });
    mesh.count = marches.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [marches, terrain]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || marches.length === 0) return;
    const attr = geometry.getAttribute("progress") as THREE.InstancedBufferAttribute;
    const now = Date.now();
    marches.forEach((m, i) => {
      const g = m.gather;
      // Just arrived, the server hasn't set the work going yet
      if (!g) return attr.setX(i, 0);
      const until = g?.pausedAt ?? now;
      const start = g?.startedAt ?? m.arrivalTime;
      const end = m.actUntil ?? until;
      attr.setX(i, Math.min(1, Math.max(0, (until - start) / Math.max(1, end - start))));
    });
    attr.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, capacity]} frustumCulled={false} raycast={() => null} visible={marches.length > 0} />;
}

/** One line-segments mesh for every route on the road (a single draw call) */
function Routes({ marches, terrain }: { marches: ActiveMarch[]; terrain: Terrain }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const c = new THREE.Color();
    for (const m of marches) {
      c.set(CIV_WAR_COLOR[m.attackerCiv]);
      for (let i = 0; i < ROUTE_SEGMENTS; i += 2) {
        for (const t of [i / ROUTE_SEGMENTS, (i + 1) / ROUTE_SEGMENTS]) {
          const x = m.startX + (m.targetX - m.startX) * t;
          const z = m.startZ + (m.targetZ - m.startZ) * t;
          positions.push(x, Math.max(terrain.height(x, z), SEA_LEVEL) + ROUTE_LIFT, z);
          colors.push(c.r, c.g, c.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [marches, terrain]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  if (marches.length === 0) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.85} toneMapped={false} />
    </lineSegments>
  );
}

/** Where two armies meet: between the attackers' line and the garrison, or on the node for gatherers */
function clashPoint(m: ActiveMarch): { x: number; z: number } {
  if (m.gather) return { x: m.targetX, z: m.targetZ };
  const f = frame(m);
  const back = (STANDOFF + GARRISON_OFFSET) / 2;
  return { x: m.targetX - f.dir.x * back, z: m.targetZ - f.dir.z * back };
}

/**
 * Defeat markers outlive the marches behind them (a wiped-out march leaves GET /marches after a few seconds),
 * so they are remembered here, by battle, until they expire; this also keeps them when the map remounts.
 */
const defeatMarkers = new Map<string, DefeatSpot & { until: number }>();

function rememberDefeats(marches: ActiveMarch[], terrain: Terrain, now: number) {
  for (const m of marches) {
    if (!marchLost(m)) continue;
    const key = m.battleResult?.id ?? m.id;
    const until = battleEndOf(m) + DEFEAT_MARKER_MS;
    if (until <= now || defeatMarkers.has(key)) continue;
    const p = clashPoint(m);
    const fallen = m.battleResult?.attackerCasualties ?? m.soldiersCount;
    defeatMarkers.set(key, { id: key, x: p.x, y: standOn(terrain, p.x, p.z), z: p.z, civ: m.attackerCiv, fallen, from: until - DEFEAT_MARKER_MS, until });
  }
  for (const [key, d] of defeatMarkers) if (d.until <= now) defeatMarkers.delete(key);
}

/** Numbers over a battle: how long after its round they may still appear (a late poll or a map just opened) */
const ROUND_NUMBERS_FRESH_MS = 6_000;
const NUMBERS_LIFT = 3.6;
const BOSS_NUMBERS_LIFT = 8;
/** Least gap on screen between the two sides' numbers, px */
const NUMBERS_APART_PX = 230;

/** Rounds whose numbers have been shown (by battle and round), kept across remounts so a return from a city never replays them */
const shownRounds = new Set<string>();

const compact = (n: number) => (n < 100_000 ? Math.round(n).toLocaleString("en-US") : n < 1e6 ? `${Math.round(n / 1e3)}k` : `${(n / 1e6).toFixed(1)}M`);

/** One side's numbers: soldiers lost, then the damage it dealt underneath (alone, it takes the top line) */
function sideNumbers(at: { x: number; y: number; z: number }, other: { x: number; y: number; z: number }, lost: number, dealt: number, bands?: BattleRound["bands"]): FloatEntry[] {
  const apart = { ...other, px: NUMBERS_APART_PX };
  const out: FloatEntry[] = [];
  // 🪙 Mercenary bands lose strength, not soldiers: each band's share of the round as −% of it, the soldiers' as a count
  const bandLost = bands?.reduce((a, b) => a + b.lost, 0) ?? 0;
  const soldiers = lost - bandLost;
  if (soldiers > 0) out.push({ ...at, ...FLOAT_STYLE.loss, text: `−${compact(soldiers)}`, apart });
  for (const [i, b] of (bands ?? []).filter((x) => x.lost > 0).entries()) {
    out.push({ ...at, ...FLOAT_STYLE.percent, text: bandLossText(b.lost, b.fullCount), apart, ...(soldiers > 0 || i > 0 ? { delay: 0.25 * (i + 1), dx: i % 2 ? 40 : -40 } : {}) });
  }
  if (dealt > 0) out.push({ ...at, ...FLOAT_STYLE.damage, text: `⚔ ${compact(dealt)}`, apart, ...(lost > 0 ? {} : { dy: 0 }) });
  return out;
}

/** Most Battle Arts lines floated over one side per round (the rest are in the report) */
const ARTS_PER_SIDE = 4;

/**
 * A round's Battle Arts over the two sides, after its numbers: casts, Finales and Instincts over the side that used them
 * (named, higher up), status ticks over the side they hurt (icon and losses), each a beat after the last
 */
function artsNumbers(round: BattleRound, attackers: { x: number; y: number; z: number }, defenders: { x: number; y: number; z: number }): FloatEntry[] {
  const out: FloatEntry[] = [];
  const count = { attacker: 0, defender: 0 };
  for (const e of round.arts ?? []) {
    const n = count[e.side]++;
    if (n >= ARTS_PER_SIDE) continue;
    const at = e.side === "attacker" ? attackers : defenders;
    const apart = { ...(e.side === "attacker" ? defenders : attackers), px: NUMBERS_APART_PX };
    const lost = e.losses ? ` −${compact(e.losses)}` : "";
    if (e.kind === "tick") {
      out.push({ ...at, ...FLOAT_STYLE.status, text: `${e.emblem}${lost || (e.damage ? ` ${compact(e.damage)}` : ` ${e.name}`)}`, apart, delay: 0.9 + n * 0.45, dy: -70, dx: n % 2 ? 46 : -46 });
    } else {
      const finale = e.kind === "finale";
      out.push({ ...at, ...FLOAT_STYLE.cast, ...(finale ? { color: "#fcd34d", size: 34, life: 3.2 } : {}), text: `${e.emblem} ${e.name}${e.kind === "instinct" ? lost : ""}`, apart, delay: 0.35 + n * 0.55, dy: 52 + n * 6 });
    }
  }
  return out;
}

/**
 * After each round of a live battle (and its last, once the report is in), float its numbers over both sides: the
 * attackers' line and the defenders (the garrison, or the pack / boss itself). Once per round, however many armies of
 * a rally fight it.
 */
function floatRoundNumbers(marches: ActiveMarch[], terrain: Terrain, now: number) {
  for (const m of marches) {
    if (m.kind === "scout") continue;
    const report = m.battleResult;
    const onAttack = report ? report.attackerId === m.attackerId || Boolean(report.participants?.includes(m.attackerId)) : false;
    const round = m.lastBattleRound ?? (onAttack ? report?.rounds?.[report.rounds.length - 1] : undefined);
    const battle = m.battleId ?? report?.id;
    if (!round || !battle) continue;
    const key = `${battle}:${round.round}`;
    if (shownRounds.has(key)) continue;
    shownRounds.add(key);
    if (shownRounds.size > 400) shownRounds.delete(shownRounds.values().next().value as string);
    const when = m.lastBattleRound ? m.lastRoundAt ?? now : battleEndOf(m);
    // A round seen late (a map just opened) is skipped; a fresh one plays in full from now, never back-dated by the poll's delay
    if (now - when > ROUND_NUMBERS_FRESH_MS) continue;

    // Over the army the defenders are striking
    const front = ringPlace(marches.find((x) => x.id === m.battleFrontId) ?? m);
    const f = front.frame;
    const ax = m.targetX - f.dir.x * (STANDOFF + 1.2 + front.rank * RING_RANK_GAP);
    const az = m.targetZ - f.dir.z * (STANDOFF + 1.2 + front.rank * RING_RANK_GAP);
    const npc = m.targetType === "npc";
    const back = npc ? 0 : GARRISON_OFFSET - 1.4;
    const dx = m.targetX - f.dir.x * back;
    const dz = m.targetZ - f.dir.z * back;
    const attackers = { x: ax, y: standOn(terrain, ax, az) + NUMBERS_LIFT, z: az };
    const defenders = { x: dx, y: standOn(terrain, dx, dz) + (m.targetKind === "boss" ? BOSS_NUMBERS_LIFT : NUMBERS_LIFT), z: dz };
    MAP_FLOATING_TEXT.add(
      ...sideNumbers(attackers, defenders, round.attackerLosses, round.attackerDamage, round.bands),
      ...sideNumbers(defenders, attackers, round.defenderLosses, round.defenderDamage),
      ...artsNumbers(round, attackers, defenders)
    );
    const boss = m.targetKind === "boss";
    const spots = {
      attacker: { x: ax, y: standOn(terrain, ax, az), z: az, r: SPELL_ARMY_R, h: SPELL_HAND },
      defender: { x: dx, y: standOn(terrain, dx, dz), z: dz, r: boss ? SPELL_BOSS_R : SPELL_ARMY_R, h: boss ? SPELL_BOSS_HAND : SPELL_HAND }
    };
    playRoundSpells(round, `${battle}`, spots, Boolean(m.lastBattleRound), boss ? m.targetId : null);
    if (m.targetKind === "mob" || m.targetKind === "bandit") strikeRound(m.targetId, round, { x: m.targetX, z: m.targetZ }, f.dir);
  }
}

/** How far a pack's creatures lunge at the armies, world units */
const STRIKE_REACH = 0.9;
/** A round's strike lands a beat after its numbers start to rise */
const STRIKE_DELAY_S = 0.1;

/**
 * A mob or bandit pack strikes at the armies on each round, and rears back as it casts (the pack's first cast, Finale
 * or Instinct of the round, timed as its name rises): the NPC batch plays it (`npcStrikes.ts`)
 */
function strikeRound(npcId: string, round: BattleRound, at: { x: number; z: number }, dir: { x: number; z: number }) {
  let n = 0;
  let castDelay = -1;
  for (const e of round.arts ?? []) {
    if (e.side !== "defender") continue;
    if (e.kind !== "tick" && castDelay < 0) castDelay = 0.35 + n * 0.55;
    n++;
  }
  const now = Date.now();
  const len = Math.hypot(dir.x, dir.z) || 1;
  const before = NPC_STRIKES.get(npcId);
  NPC_STRIKES.set(npcId, {
    fightFrom: before?.fightFrom ?? now,
    faceYaw: before?.faceYaw,
    x: at.x,
    z: at.z,
    toward: { x: -dir.x / len, z: -dir.z / len },
    strikeAt: now + STRIKE_DELAY_S * 1000,
    castAt: castDelay < 0 ? -Infinity : now + castDelay * 1000,
    round: round.round,
    reach: STRIKE_REACH
  });
}

/** The spell-effects kit's sizes on the map: an army's radius and its caster's hand, a boss's */
const SPELL_ARMY_R = 2.2;
const SPELL_HAND = 2.2;
const SPELL_BOSS_R = 3;
const SPELL_BOSS_HAND = 5;
/** A status's look outlasts its round by this much, so the next round's poll stretches it without a gap */
const STATUS_SLACK_S = 2.5;

/**
 * A round's Battle Arts as the spell-effects kit plays them, in step with their names rising (`artsNumbers`): every
 * cast, Finale and Instinct from its caster at its target, and every status that held as its aftermath on the army it
 * held on, until the next round (a status laid this round starts as its cast lands). A boss's Finale or Enrage is its
 * battle cry: it rears up in a roar.
 */
function playRoundSpells(round: BattleRound, battle: string, spots: Record<"attacker" | "defender", SpellSpot>, live: boolean, bossId: string | null) {
  const other = (s: "attacker" | "defender") => (s === "attacker" ? "defender" : "attacker");
  const laid = new Map<string, number>();
  const count = { attacker: 0, defender: 0 };
  for (const e of round.arts ?? []) {
    // Counted as artsNumbers counts, so each look starts with its name
    const n = count[e.side]++;
    if (e.kind === "tick") continue;
    const look = lookOf(e.fx, e.id);
    if (!look) continue;
    const delay = 0.35 + n * 0.55;
    const impact = MAP_SPELL_FX.cast(look, spots[e.side], spots[other(e.side)], { delay, seed: `${battle}:${round.round}:${e.side}:${n}` });
    if (look.aftermath) laid.set(`${look.aim === "self" ? e.side : other(e.side)}:${look.aftermath}`, impact);
    if (bossId && e.side === "defender" && (e.kind === "finale" || e.id === "enrage")) BOSS_CRIES.set(bossId, Date.now() + delay * 1000);
  }
  const now = spellNow();
  const until = now + (live ? BATTLE_ROUND_MS / 1000 + STATUS_SLACK_S : STATUS_SLACK_S + 2);
  for (const side of ["attacker", "defender"] as const) {
    for (const kind of round.statuses?.[side] ?? []) {
      MAP_SPELL_FX.status(`${battle}:${side}:${kind}`, kind, spots[side], laid.get(`${side}:${kind}`) ?? now, until);
    }
  }
}

export function WarParties({
  marches,
  terrain: land,
  islets = NO_ISLETS,
  hideTooltips = false,
  BandBatch
}: {
  marches: ActiveMarch[];
  terrain: Terrain;
  islets?: Islet[];
  hideTooltips?: boolean;
  /** HD: mercenary bands walk as their own models (`BandMarches`, from the HD chunk); without it they march as soldiers */
  BandBatch?: ComponentType<{ bands: BandMarchEntry[]; heightAt: (x: number, z: number) => number }>;
}) {
  const terrain = useMemo(() => onIslets(land, islets), [land, islets]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const current = Date.now();
    updateBattleRings(marches);
    const next = marches.flatMap((m) => [nextPhaseChange(m, current), nextRingChange(m, current)]).filter((t): t is number => t !== null);
    if (next.length === 0) return;
    const id = setTimeout(() => setNow(Date.now()), Math.max(16, Math.min(...next) - current + 20));
    return () => clearTimeout(id);
  }, [marches, now]);

  const phased = useMemo(() => {
    updateBattleRings(marches);
    return marches.map((m) => ({ march: m, phase: marchPhase(m, now) })).filter((p) => p.phase !== "done");
  }, [marches, now]);
  // After dark every soldier and gatherer on the map carries their civilization's light (lantern, wisp, miner's lamp, torch, void
  // orb), posed like its bearer: one batch per civ involved, however many armies
  const night = useRealmNight();
  // 🪙 HD: a band's march is its own models, walked by the band batch; Normal draws it as baked low-poly mercenaries
  // 🪙 Bands walk as their own models in HD; 🦸 so does a champion at the head of the soldiers it leads
  const bands = useMemo(
    () => (BandBatch ? phased.filter((p) => (p.march.band || p.march.champion) && p.march.kind !== "scout").map((p) => ({ ...p, circling: p.phase === "fighting" && walkingToRing(p.march, ringPlace(p.march), now) })) : []),
    [phased, BandBatch, now]
  );
  // Bands walk as baked mercenaries only where the actors draw Normal (the HD actors keep their soldiers)
  const hd = useHd("actors");
  const actors = useMemo(() => {
    const figures = phased.filter((p) => !(BandBatch && p.march.band)).flatMap((p) => buildActors(p.march, p.phase, !hd, now));
    if (!night) return figures;
    const lights = figures
      .filter((a) => /^(villager|farmer|soldier\d?)_/.test(a.kind) && a.motion !== "fallen")
      .map((a) => ({ ...a, kind: `light_${a.kind.slice(a.kind.indexOf("_") + 1)}` as ActorKind, colors: undefined }));
    return [...figures, ...lights];
  }, [phased, night, BandBatch, hd, now]);
  const onRoad = useMemo(() => phased.filter((p) => p.phase === "marching" || p.phase === "returning").map((p) => p.march), [phased]);
  // Figures wade through water, waist-deep at most (the Actors draw a wake round each one there)
  const heightAt = useMemo(() => (x: number, z: number) => standOn(terrain, x, z), [terrain]);
  const gathering = useMemo(() => phased.filter((p) => p.phase === "gathering").map((p) => p.march), [phased]);

  // Crossed swords over each live battle (one per battle even when a rally sends several armies)
  const clashes = useMemo<ClashSpot[]>(() => {
    const byBattle = new Map<string, ClashSpot>();
    for (const { march: m, phase } of phased) {
      const fighting = (phase === "fighting" && m.kind !== "scout") || (phase === "gathering" && Boolean(m.gather?.pausedAt));
      if (!fighting) continue;
      // Over the target's centre, one per target: the armies stand all round it
      const key = m.gather ? `${m.targetId}:${m.id}` : `${m.targetType}:${m.targetId}`;
      if (byBattle.has(key)) continue;
      const y = standOn(terrain, m.targetX, m.targetZ);
      // Round ticks: the server's next-round estimate (act_until) once rounds run, else the arrival
      const anchor = m.phase === "acting" && m.actUntil ? m.actUntil : m.gather?.pausedAt ?? m.arrivalTime;
      byBattle.set(key, { id: key, x: m.targetX, y, z: m.targetZ, roundAnchor: anchor, round: m.gather ? undefined : `Round ${m.currentBattleRound || 1}/${m.maxBattleRounds ?? 6}` });
    }
    return [...byBattle.values()];
  }, [phased, terrain]);

  // Each new round's numbers rise over the battle as soon as the poll brings it
  useEffect(() => floatRoundNumbers(marches, terrain, Date.now()), [marches, terrain]);

  // Routed armies: markers appear as soon as a lost battle shows up and disappear DEFEAT_MARKER_MS after it ended
  const markers = useMemo(() => {
    rememberDefeats(marches, terrain, now);
    return [...defeatMarkers.values()];
  }, [marches, terrain, now]);
  useEffect(() => {
    if (markers.length === 0) return;
    // Wake up when the next marker expires
    const next = Math.min(...markers.map((d) => d.until));
    const id = setTimeout(() => setNow(Date.now()), Math.max(50, next - Date.now() + 20));
    return () => clearTimeout(id);
  }, [markers]);

  // One outcome label per battle, however many armies stood in its ring
  const outcomeShown = new Set<string>();

  return (
    <group>
      <Routes marches={onRoad} terrain={terrain} />
      <GatherRings marches={gathering} terrain={terrain} />
      <ClashingSwords clashes={clashes} roundMs={BATTLE_ROUND_MS} />
      <DefeatMarkers markers={markers} heightAt={heightAt} />
      <FloatingText store={MAP_FLOATING_TEXT} />
      <SpellFx store={MAP_SPELL_FX} grow={45} calm />
      {actors.length > 0 && <Actors actors={actors} heightAt={heightAt} waterLevel={SEA_LEVEL} lodDistance={WAR_LOD_DISTANCE} />}
      {BandBatch && bands.length > 0 && <BandBatch bands={bands} heightAt={heightAt} />}
      {!hideTooltips &&
        clashes.map(
          (c) =>
            c.round && (
              <Html key={c.id} position={[c.x, c.y + SWORD_LIFT, c.z]} center distanceFactor={45} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
                <div className="px-2 py-0.5 rounded-md bg-slate-950/75 text-amber-200 font-medieval font-bold text-xs whitespace-nowrap select-none">{c.round}</div>
              </Html>
            )
        )}
      {!hideTooltips &&
        phased.map(({ march, phase }) => {
          if (phase === "marching" || phase === "returning") {
            // A host on the road carries one label; home-bound armies come back at their own times, so each keeps its own
            const host = phase === "marching" ? hostOf(march) : null;
            if (host && !host.lead) return null;
            return <MarchLabel key={march.id} march={march} phase={phase} terrain={terrain} hostSize={host?.count ?? 1} />;
          }
          const base = OUTCOME_LABEL[phase];
          // One lobby label per rally (the leader's), none for stationed troops: keep the <Html> count low
          if (!base || (phase === "rallying" && march.kind !== "rally")) return null;
          const label =
            phase === "gathering" && march.gather?.pausedAt
              ? { text: "⚔️ Workers attacked!", cls: "border-rose-400 text-rose-100 bg-rose-950/90" }
              : phase === "gathering" && march.gather?.treasure
                ? { ...base, text: "💎 Claiming" }
                : phase === "defeat" && march.kind === "gather"
                  ? { ...base, text: "🛡️ Driven off" }
                  : base;
          const atSpot = phase === "gathering" || phase === "rallying";
          if (phase === "victory" || phase === "defeat") {
            const battle = `${march.targetId}:${phase}`;
            if (outcomeShown.has(battle)) return null;
            outcomeShown.add(battle);
          }
          const { dir } = ringPlace(march).frame;
          const x = atSpot ? march.targetX : march.targetX - dir.x * STANDOFF;
          const z = atSpot ? march.targetZ : march.targetZ - dir.z * STANDOFF;
          return (
            <Html key={march.id} position={[x, standOn(terrain, x, z) + (atSpot ? 6 : 3.2), z]} center distanceFactor={45} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div className={`px-3 py-1 rounded-xl border-2 font-medieval font-bold text-sm whitespace-nowrap select-none shadow-2xl ${label.cls}`}>
                {label.text}
                <span className="block text-[10px] font-mono font-normal text-center opacity-80">{march.attackerName}</span>
              </div>
            </Html>
          );
        })}
    </group>
  );
}
