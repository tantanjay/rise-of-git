import { Component, ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { BuildingType, CivilizationType, DeveloperKingdom, DisasterKind, NPCRarity, RepoBuilding } from "@/types";
import { DisasterWeather } from "@/components/3d/DisasterWeather";
import { NPCModel } from "@/components/3d/world/NPCModel";
import { Reflections } from "@/components/3d/HdPost";
import { hasRig, BossModel } from "@/components/3d/world/BossModel";
import { TierFx, TierFxItem, fxTierOf } from "@/components/3d/TierFx";
import { FireFx, FireSite, FIRE_GLOW } from "@/components/3d/FireFx";
import { RARITY_SCALE, npcFootprint, isCreatureNPC, hasNPCModel } from "@/components/3d/world/npcs";
import { REALM_STAGE_SCALE } from "@/components/3d/world/realmTypes";
import { WorldCastles } from "@/components/3d/world/WorldCastles";
import { TownHall3D } from "@/components/3d/city/TownHall3D";
import { InstancedParts } from "@/components/3d/city/InstancedParts";
import { Actors } from "@/components/3d/city/Actors";
import { PlotLegendFx } from "@/components/3d/city/PlotLegendFx";
import { Actor, AnimalKind } from "@/components/3d/city/parts";
import { FOLK } from "@/components/3d/city/palette";
import { MOUNT_COATS, riderLift } from "@/components/3d/city/actorTemplates";
import { CIV_WAR_COLOR } from "@/utils/war";
import { ANIMAL_COLORS, buildCityScene, cityFestival } from "@/components/3d/city/blueprints";
import { Fireworks } from "@/components/3d/FestivalFx";
import { mulberry32 } from "@/utils/random";
import { computeCityLayout, plotSizeForLevel } from "@/components/3d/city/layout";
import { CASTLE_STAGES, CASTLE_TOP_Y, CITADEL_STAGE, EMPYREAN_STAGE, PALACE_STAGE, WONDER_STAGE } from "@/utils/castle";
import { SoundCueId } from "@/utils/soundCues";
import { SoundStage } from "./SoundStage";
import { HighGraphicsSingularity, SingularityAction } from "@/components/3d/world/HighGraphicsSingularity";
import { HighGraphicsEmpyrean } from "@/components/3d/world/HighGraphicsEmpyrean";
import { HeroBatch } from "@/components/3d/world/HeroBatch";
import { BATCHED_HEROES } from "@/components/3d/world/heroes";
import { BossShowcase } from "@/components/3d/world/BossBatch";
import { riggedHero } from "@/components/3d/world/heroBosses";
import type { BossActionId } from "@/components/3d/world/heroRig";
import { RemainsStage, buildRemains } from "@/components/3d/world/battleRemains";
import { VoidGate, VOID_GATE_TYPE } from "@/components/3d/world/VoidGate";
import { BroodView, VoidBroodStage, voidBroodFrame } from "@/components/3d/world/VoidBroodStage";

/* ------------------------------------------------------------------------- */
/* The 3D preview pane shared by the Royal Codex and the Guide Book          */
/* ------------------------------------------------------------------------- */

export type Preview =
  | {
      kind: "npc";
      type: string;
      rarity: NPCRarity;
      scaled: boolean;
      boss: boolean;
      stage?: "rising" | "crumbling";
      step?: number;
      burning?: boolean;
      /** A buffer realm at this stage of its cycle (0 common … 3 epic): its model, size and tier */
      realmStage?: number;
      /** Its HD version (the HD model kit) */
      hd?: boolean;
    }
  | { kind: "singularity_hd"; action?: SingularityAction }
  | { kind: "empyrean_hd"; city?: boolean }
  /** A hand-built hero in HD (the legendary landmarks, the Nethergarde Core), as the map draws it */
  | { kind: "hero_hd"; type: string }
  | { kind: "boss_hd"; type: string; action?: BossActionId; band?: number }
  | { kind: "castle"; civ: CivilizationType; stage: number; hd?: boolean }
  | { kind: "improvement"; upgradeId: string; tier: number; hd?: boolean }
  | { kind: "mercenary"; type: string; rarity: NPCRarity }
  /** 🦸 A kingdom's champion (`champion:<civ>:<looks>`): drawn in high graphics only, its rig built from the part library */
  | { kind: "champion"; type: string; rarity: NPCRarity }
  | { kind: "building"; district: BuildingType; level: number; prestige?: number; hd?: boolean }
  | { kind: "soldiers"; civs: CivilizationType[] }
  /** A civilization's townsfolk (villager, farmer, soldier, a light bearer) or one animal, walking and at work */
  | { kind: "folk"; civ?: CivilizationType; animal?: AnimalKind; mount?: CivilizationType; hd?: boolean; arms?: 1 | 2 | 3 }
  | { kind: "sound"; cue: SoundCueId }
  /** 🎉 A Festival on the plaza: bunting, lanterns, dancers round the fountain and fireworks (its HD version through the kit) */
  | { kind: "festival"; hd?: boolean }
  /** 💀 What a routed army leaves on its battlefield, in the viewer's colours, burning down stage by stage */
  | { kind: "remains"; hd?: boolean }
  | { kind: "disaster"; disaster: DisasterKind }
  /** Blackfang's Raid (coming soon): his looters over the disasters' farm plot */
  | { kind: "raid" }
  /** The Void Gate's creatures (coming soon): a family's sizes side by side, one level's pack (`size`), or the Warden */
  | { kind: "void_brood"; brood: BroodView; size?: number; hd?: boolean; action?: BossActionId; pack?: boolean };

/** Codex entries with an HD version drawn by the HD model kit: every Builder model (rigged ones get theirs by hand) */
export const hasHdVersion = (type: string) => hasNPCModel(type) && !hasRig(type);

/** The Normal / ✨ HD switch over a Codex preview (top-left): the model as drawn in Normal graphics, or its HD version */
export function HdSwitch({ hd, onChange, title }: { hd: boolean; onChange: (hd: boolean) => void; title?: string }) {
  return (
    <>
      {([false, true] as const).map((on) => (
        <button
          key={String(on)}
          onClick={() => onChange(on)}
          title={on ? title ?? "High graphics" : "The model as drawn in Normal graphics"}
          className={`px-2 h-7 rounded-md text-[11px] font-semibold border ${hd === on ? "bg-amber-900/80 border-amber-500/60 text-amber-200" : "bg-slate-900/80 border-slate-700 text-slate-300"}`}
        >
          {on ? "✨ HD" : "Normal"}
        </button>
      ))}
    </>
  );
}

export const RARITY_STYLE: Record<NPCRarity, { text: string; chip: string; ring: string }> = {
  common: { text: "text-slate-300", chip: "bg-slate-800 border-slate-600 text-slate-300", ring: "#94a3b8" },
  uncommon: { text: "text-emerald-300", chip: "bg-emerald-950 border-emerald-600/60 text-emerald-300", ring: "#22c55e" },
  rare: { text: "text-sky-300", chip: "bg-sky-950 border-sky-600/60 text-sky-300", ring: "#3b82f6" },
  epic: { text: "text-purple-300", chip: "bg-purple-950 border-purple-500/60 text-purple-300", ring: "#a855f7" },
  legendary: { text: "text-amber-300", chip: "bg-amber-950 border-amber-500/60 text-amber-300", ring: "#f59e0b" },
  mythical: {
    text: "text-transparent bg-clip-text bg-linear-to-r from-rose-400 via-fuchsia-300 to-amber-300",
    chip: "bg-linear-to-r from-rose-950 via-black to-purple-950 border-rose-500/70 text-rose-200 shadow-sm shadow-rose-900",
    ring: "#e11d48"
  }
};

/* ------------------------------------------------------------------------- */
/* 3D preview                                                                */
/* ------------------------------------------------------------------------- */

/** Moves the camera to frame the current model whenever the selection changes */
function Frame({ distance, height, target, front = false }: { distance: number; height: number; target: number; front?: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    if (front) {
      camera.position.set(0, height, distance);
    } else {
      camera.position.set(distance * 0.75, height, distance * 0.75);
    }
    camera.lookAt(0, target, 0);
    if (controls) {
      controls.target.set(0, target, 0);
      controls.update();
    }
  }, [camera, controls, distance, height, target, front]);
  return null;
}

/** Camera distance for improvements that live on the plaza (others frame the whole city) */
const PLAZA_FOCUS: Record<string, number> = { plaza: 20, dragon_statue: 20, mana_spire: 26, market: 24, spymaster: 30 };

/** 🎉 A Festival on a village plaza, the fountain in the middle of the view */
function FestivalPreview({ civ, hd = false }: { civ: CivilizationType; hd?: boolean }) {
  const festival = useMemo(() => cityFestival({ id: "codex-festival", civilization: civ, upgrades: { plaza: 1 } } as unknown as DeveloperKingdom), [civ]);
  return (
    <group position={[0, 0, -8]}>
      <ImprovementPreview upgradeId="plaza" tier={1} civ={civ} hd={hd} />
      <InstancedParts parts={festival.parts} shadows={false} kit={hd} />
      <Actors actors={festival.actors} lodDistance={200} />
      <Fireworks sites={[{ id: "codex-festival", x: 0, y: 0, z: 6, scale: 1.4, height: 7 }]} hd={hd} />
    </group>
  );
}

function ImprovementPreview({ upgradeId, tier, civ, hd = false }: { upgradeId: string; tier: number; civ: CivilizationType; hd?: boolean }) {
  const scene = useMemo(() => {
    // Minimal empty city: only the fields buildCityScene reads
    const kingdom = {
      id: "codex",
      civilization: civ,
      streakDays: 0,
      activity: { pastWeekCommits: 0 },
      upgrades: { [upgradeId]: tier },
      buildings: [],
      vacantPlots: []
    } as unknown as DeveloperKingdom;
    return buildCityScene(kingdom, computeCityLayout([], []));
  }, [upgradeId, tier, civ]);
  return (
    <>
      {/* HD: the improvements (and the forest ring) through the model kit */}
      <InstancedParts parts={scene.parts} detail={scene.detail} kit={hd ? "tagged" : false} />
      {/* Tier 3–5 improvements on the rarity ladder */}
      <PlotLegendFx fx={scene.fx} />
      <group position={[0, 0.06, -3]}>
        <TownHall3D civ={civ} level={8} hd={hd} />
      </group>
    </>
  );
}

/** One building at a given level in an otherwise empty city, centred on its plot */
function BuildingPreview({ district, level, prestige, civ, hd = false }: { district: BuildingType; level: number; prestige: number; civ: CivilizationType; hd?: boolean }) {
  const { scene, plot } = useMemo(() => {
    // Only the fields buildCityScene reads for a plot
    const building = {
      id: "codex-building",
      buildingType: district,
      level,
      prestige,
      slot: 0,
      health: 100,
      condition: "active",
      commitsPastWeek: 8,
      totalLines: 6000
    } as unknown as RepoBuilding;
    const kingdom = {
      id: "codex",
      civilization: civ,
      streakDays: 0,
      activity: { pastWeekCommits: 0 },
      upgrades: {},
      buildings: [building],
      vacantPlots: []
    } as unknown as DeveloperKingdom;
    const layout = computeCityLayout([building], []);
    return { scene: buildCityScene(kingdom, layout), plot: layout.plots[0] };
  }, [district, level, prestige, civ]);
  return (
    <group position={[-plot.x, 0, -plot.z]}>
      {/* HD: the plot and its structures through the model kit */}
      <InstancedParts parts={scene.parts} detail={scene.detail} kit={hd ? "tagged" : false} />
      <Actors actors={scene.actors} lodDistance={200} hd={hd} />
      <PlotLegendFx fx={scene.fx} />
    </group>
  );
}

/** The rarity effect kit round a Codex model standing at the origin */
function CodexTierFx({ id, rarity, size, color, accent, beam, shell }: { id: string; rarity: string; size: number; color?: string; accent?: string; beam?: number; shell?: boolean }) {
  const items = useMemo<TierFxItem[]>(() => {
    const tier = fxTierOf(rarity);
    return tier ? [{ id: `codex-${id}`, x: 0, y: 0, z: 0, size, tier, color, accent, beam, shell }] : [];
  }, [id, rarity, size, color, accent, beam, shell]);
  return <TierFx items={items} />;
}

/** A burning structure as on the map: flames, smoke and embers in an epic curtain of fire-light */
function CodexFire({ id, size }: { id: string; size: number }) {
  const sites = useMemo<FireSite[]>(() => [{ id: `codex-${id}`, x: 0, y: 0, z: 0, r: size * 0.9, h: 1.2, flames: 13, plumes: 2 }], [id, size]);
  return (
    <>
      <CodexTierFx id={`${id}:fire`} rarity={FIRE_GLOW.tier} size={size} color={FIRE_GLOW.color} accent={FIRE_GLOW.accent} />
      <FireFx sites={sites} />
    </>
  );
}

/** A squad of each civilization's soldiers: two civilizations face off and fight, one stands at ease */
function SoldiersPreview({ civs }: { civs: CivilizationType[] }) {
  const actors = useMemo(() => {
    const out: Actor[] = [];
    const duel = civs.length === 2;
    civs.forEach((civ, c) => {
      const f = FOLK[civ];
      const colors = [f.armour[0], f.skins[0], f.helmOrHood[0], f.accents[0]];
      for (let i = 0; i < 3; i++) {
        if (duel) {
          const side = c === 0 ? -1 : 1;
          out.push({ kind: `soldier_${civ}`, x: side * 0.75, y: 0, z: (i - 1) * 0.9, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, motion: "fight", speed: 7, phase: (i * 0.37 + c * 0.5) % 1, colors, scale: 1.1 });
        } else {
          const x = (c - (civs.length - 1) / 2) * 1.5;
          out.push({ kind: `soldier_${civ}`, x: x + (i - 1) * 0.45, y: 0, z: (i % 2) * 0.5, yaw: 0.35, motion: "idle", speed: 1, phase: i * 0.3 + c, colors, scale: 1.1 });
        }
      }
    });
    return out;
  }, [civs]);
  return <Actors actors={actors} lodDistance={200} />;
}

/** Birds that fly in a ring above the ground (crows) and those that stand (owls stay put) */
const FOLK_FLYERS = new Set<AnimalKind>(["crow", "griffin"]);
const FOLK_PECKERS = new Set<AnimalKind>(["chicken", "swan", "goose"]);

/**
 * A civilization's townsfolk or one animal as they live in a city: a villager and a soldier walking up and down, a
 * farmer at work, a villager carrying the light they carry after dark; an animal grazing (or pecking) beside one
 * walking, a bird circling over one on the ground
 */
function FolkPreview({ civ, animal, mount, hd, arms }: { civ?: CivilizationType; animal?: AnimalKind; mount?: CivilizationType; hd?: boolean; arms?: 1 | 2 | 3 }) {
  const actors = useMemo(() => {
    const out: Actor[] = [];
    const S = 1.6;
    if (civ && arms) {
      // 🗡️ An Armory set: one of its soldiers walking up and down, one fighting, one standing guard; a soldier in standard gear at the back
      const f = FOLK[civ];
      const soldier = [f.armour[0], f.skins[0], f.helmOrHood[0], f.accents[0]];
      const kind = `soldier${arms}_${civ}` as Actor["kind"];
      out.push({ kind, x: -1.5, y: 0, z: 0.8, x2: 1.5, z2: 0.8, yaw: 0, motion: "walk", speed: 0.5, phase: 0.1, colors: soldier, scale: S });
      out.push({ kind, x: 0.9, y: 0, z: -0.2, yaw: -0.5, motion: "fight", speed: 6, phase: 0.4, colors: soldier, scale: S });
      out.push({ kind, x: -0.9, y: 0, z: -0.3, yaw: 0.4, motion: "idle", speed: 0.4, phase: 1.3, colors: [f.armour[1] ?? f.armour[0], f.skins[1] ?? f.skins[0], f.helmOrHood[1] ?? f.helmOrHood[0], f.accents[0]], scale: S });
      out.push({ kind: `soldier_${civ}`, x: 0, y: 0, z: -1.7, yaw: 0, motion: "idle", speed: 0.4, phase: 2.2, colors: soldier, scale: S });
    } else if (mount) {
      // A scout of its civilization riding up and down, and one standing, dressed as the people of another
      const [coat, mane] = MOUNT_COATS[mount];
      const colors = [coat, mane, CIV_WAR_COLOR[mount]];
      const civs = Object.keys(MOUNT_COATS) as CivilizationType[];
      const disguise = civs[(civs.indexOf(mount) + 1) % civs.length];
      const pair = (look: CivilizationType, a: Omit<Actor, "kind" | "y" | "colors" | "scale">) => {
        const f = FOLK[look];
        out.push({ ...a, kind: `mount_${mount}`, y: 0, colors, scale: S });
        out.push({ ...a, kind: `villager_${look}`, y: riderLift(look, mount) * S, colors: [f.clothes[0], f.skins[0], f.hair[0], f.accents[0]], scale: S, ride: true });
      };
      pair(mount, { x: -1.8, z: 0.8, x2: 1.8, z2: 0.8, yaw: 0, motion: "walk", speed: 0.55, phase: 0.1 });
      pair(disguise, { x: 0.3, z: -1.1, yaw: -0.5, motion: "idle", speed: 0.4, phase: 1.7 });
    } else if (civ) {
      const f = FOLK[civ];
      const folk = [f.clothes[0], f.skins[0], f.hair[0], f.accents[0]];
      const farmer = [f.clothes[1] ?? f.clothes[0], f.skins[1] ?? f.skins[0], f.farmerHats[0], f.accents[1] ?? f.accents[0]];
      const soldier = [f.armour[0], f.skins[0], f.helmOrHood[0], f.accents[0]];
      out.push({ kind: `villager_${civ}`, x: -1.4, y: 0, z: 0.7, x2: 1.4, z2: 0.7, yaw: 0, motion: "walk", speed: 0.6, phase: 0.1, colors: folk, scale: S });
      out.push({ kind: `soldier_${civ}`, x: 1.4, y: 0, z: -0.5, x2: -1.4, z2: -0.5, yaw: 0, motion: "walk", speed: 0.5, phase: 0.6, colors: soldier, scale: S });
      out.push({ kind: `farmer_${civ}`, x: -0.9, y: 0, z: -1.5, yaw: 0.5, motion: "work", speed: 1, phase: 0.3, colors: farmer, scale: S });
      const bearer: Actor = { kind: `villager_${civ}`, x: 0.9, y: 0, z: -1.5, yaw: -0.4, motion: "idle", speed: 0.4, phase: 2.1, colors: [f.clothes[2] ?? f.clothes[0], f.skins[2] ?? f.skins[0], f.hair[1] ?? f.hair[0], f.accents[0]], scale: S };
      out.push(bearer, { ...bearer, kind: `light_${civ}`, colors: undefined });
    } else if (animal) {
      const colors = ANIMAL_COLORS[animal](mulberry32(5), "human");
      const s = 1.8;
      if (FOLK_FLYERS.has(animal)) {
        out.push({ kind: animal, x: 1.6, y: 2.2, z: 0, x2: 0, z2: 0, yaw: 0, motion: "circle", speed: 1.4, phase: 0.4, colors, scale: s });
        out.push({ kind: animal, x: 0, y: 0, z: 0, yaw: 0.6, motion: "idle", speed: 0.4, phase: 1.3, colors, scale: s });
      } else {
        out.push({ kind: animal, x: -0.6, y: 0, z: -0.6, yaw: 0.4, motion: FOLK_PECKERS.has(animal) ? "peck" : animal === "owl" ? "idle" : "graze", speed: 0.45, phase: 0.7, colors, scale: s });
        out.push({ kind: animal, x: -1.6, y: 0, z: 0.8, x2: 1.6, z2: 0.8, yaw: 0, motion: "walk", speed: 0.5, phase: 0.2, colors: ANIMAL_COLORS[animal](mulberry32(12), "human"), scale: s });
      }
    }
    return out;
  }, [civ, animal, mount, arms]);
  return <Actors actors={actors} lodDistance={200} hd={!!hd} />;
}

/** How long the preview shows each stage of the remains (burning, smouldering, cold) before the next */
const REMAINS_PREVIEW_STAGE_MS = 5000;

/** A routed army's remains in `civ`'s colours, going round its three stages */
function RemainsPreview({ civ, hd = false }: { civ: CivilizationType; hd?: boolean }) {
  const [stage, setStage] = useState<RemainsStage>(0);
  useEffect(() => {
    const id = setInterval(() => setStage((s) => ((s + 1) % 3) as RemainsStage), REMAINS_PREVIEW_STAGE_MS);
    return () => clearInterval(id);
  }, []);
  const parts = useMemo(() => buildRemains({ id: `codex-remains-${civ}`, x: 0, y: 0, z: 0, civ, fallen: 120 }, stage), [civ, stage]);
  return <InstancedParts parts={parts} shadows={false} kit={hd} />;
}

/**
 * How each world disaster tints the preview's light (a smaller copy of the sky's DISASTER_LIGHT in RealmSky)
 */
const DISASTER_PREVIEW_LIGHT: Record<DisasterKind, { color: string; ground: string; intensity: number; sky: string }> = {
  blight: { color: "#c8a860", ground: "#5c4a2c", intensity: 1.6, sky: "#1e1a10" },
  tempest: { color: "#c0a878", ground: "#4a3c2a", intensity: 1.3, sky: "#2a2418" },
  blood_moon: { color: "#e0302a", ground: "#2a0808", intensity: 2.2, sky: "#1c0406" },
  plague: { color: "#a8d860", ground: "#2e4a14", intensity: 1.5, sky: "#0e1a08" },
  barren: { color: "#b8b8bc", ground: "#3a3a3a", intensity: 1.4, sky: "#141416" }
};

/** A world disaster over a farm plot: its weather, the moon for the Blood Moon, and its light */
function DisasterPreview({ disaster, civ }: { disaster: DisasterKind; civ: CivilizationType }) {
  const l = DISASTER_PREVIEW_LIGHT[disaster];
  return (
    <>
      {/* Pulls the stage's light toward the disaster's: a tinted fill over the studio light */}
      <color attach="background" args={[l.sky]} />
      <hemisphereLight args={[l.color, l.ground, l.intensity]} />
      <BuildingPreview district="food_field" level={12} prestige={0} civ={civ} />
      <DisasterWeather view="codex" kind={disaster} />
    </>
  );
}

/** Blackfang's Raid over the same farm plot: a torchlit dusk, and his looters running about it with what they stole */
function RaidPreview({ civ }: { civ: CivilizationType }) {
  return (
    <>
      <color attach="background" args={["#1c1008"]} />
      <hemisphereLight args={["#e08a4a", "#3a2414", 1.7]} />
      <BuildingPreview district="food_field" level={12} prestige={0} civ={civ} />
      <NPCModel npc={{ id: "codex-bandit-looters", type: "bandit-looters", x: 0, z: 0, rarity: "uncommon" }} showcase />
    </>
  );
}

function PreviewScene({ preview, civ, view, prestige }: { preview: Preview; civ: CivilizationType; view: "world" | "city"; prestige: number }) {
  if (preview.kind === "disaster" || preview.kind === "raid") {
    const size = plotSizeForLevel(12);
    return (
      <>
        <Frame distance={size * 1.9} height={size * 0.38} target={1.4} />
        {preview.kind === "raid" ? <RaidPreview civ={civ} /> : <DisasterPreview key={preview.disaster} disaster={preview.disaster} civ={civ} />}
      </>
    );
  }
  if (preview.kind === "npc" && preview.type === "ruins-ascended") {
    // The risen Eye floats high over the Archon's citadel: show both
    return (
      <>
        <Frame distance={27} height={13} target={8.5} />
        <WorldCastles castles={[{ id: "codex", civilization: "arcane", x: 0, y: 0, z: 0, scale: 1.3, stage: EMPYREAN_STAGE, level: 30, empyrean: true }]} hoveredId={null} />
        <NPCModel key={preview.type} npc={{ id: `codex-${preview.type}`, type: preview.type, x: 0, z: 0, rarity: preview.rarity }} showcase />
      </>
    );
  }
  if (preview.kind === "npc" && preview.type === VOID_GATE_TYPE) {
    // Coming soon: no ground ring or tier kit, the gate brings its own embers and sparks (Normal and HD alike)
    return (
      <>
        <Frame distance={15} height={5.2} target={3.3} />
        <VoidGate key={preview.hd ? "hd" : "normal"} hd={!!preview.hd} />
      </>
    );
  }
  if (preview.kind === "void_brood") {
    // No ground ring: the creatures bring their rarity's sparkles (and embers, no beam, at legendary and mythic)
    const [distance, height, target] = voidBroodFrame(preview.brood, preview.size, preview.pack);
    return (
      <>
        <Frame key={`${preview.size}:${preview.pack}`} distance={distance} height={height} target={target} front />
        <VoidBroodStage brood={preview.brood} size={preview.size} hd={!!preview.hd} action={preview.action} pack={preview.pack} />
      </>
    );
  }
  if (preview.kind === "hero_hd") {
    const [distance, height, target] = BATCHED_HEROES[preview.type]?.frame ?? [18, 8, 3];
    return (
      <>
        <Frame distance={distance} height={height} target={target} />
        <HeroBatch key={preview.type} sites={[{ id: "codex", type: preview.type, x: 0, y: 0, z: 0 }]} />
        {/* The risen Eye floats over the Archon's citadel: show both in HD */}
        {preview.type === "ruins-ascended" && <HighGraphicsEmpyrean studio={false} />}
      </>
    );
  }
  if (preview.kind === "boss_hd") {
    const [distance, height, target] = riggedHero(preview.type)?.frame ?? [13, 6, 2.2];
    // A whole mercenary band stands in ranks: pull back to take it all in
    const band = preview.band ?? 1;
    const far = band > 1 ? 1 + Math.min(4, band / 5) * 0.55 : 1;
    return (
      <>
        <Frame key={band} distance={distance * far} height={height * far} target={target} front />
        <BossShowcase key={`${preview.type}:${band}`} type={preview.type} action={preview.action ?? "idle"} band={band} />
      </>
    );
  }
  if (preview.kind === "singularity_hd") {
    return (
      <>
        <Frame distance={8.5} height={2.75} target={2.45} front />
        <HighGraphicsSingularity action={preview.action ?? "idle"} />
      </>
    );
  }
  if (preview.kind === "empyrean_hd") {
    // The same hero model as the Archon's town hall in the city, at the hall's size
    if (preview.city) {
      const top = CASTLE_TOP_Y[EMPYREAN_STAGE];
      return (
        <>
          <Frame distance={top * 2.8} height={top * 1.2} target={top * 0.6} />
          <TownHall3D civ="arcane" level={CASTLE_STAGES[EMPYREAN_STAGE].from + 4} hd showcase />
        </>
      );
    }
    return (
      <>
        <Frame distance={16.5} height={6.5} target={4.7} />
        <HighGraphicsEmpyrean />
      </>
    );
  }
  if (preview.kind === "npc") {
    const realmStage = preview.realmStage;
    const s = realmStage !== undefined ? REALM_STAGE_SCALE[realmStage] ?? 1 : preview.scaled ? RARITY_SCALE[preview.rarity] ?? 1 : 1;
    const ring = npcFootprint(preview.type, realmStage) * s + 0.2;
    return (
      <>
        {/* World bosses and the other rigged models stand tall: frame their whole body */}
        <Frame
          distance={ring * (preview.boss || hasRig(preview.type) ? 3.9 : 3.4)}
          height={ring * 2}
          // A realm's great tower (epic) stands tall: look higher up as it grows
          target={preview.boss ? 2.8 : hasRig(preview.type) ? 2.2 * s : realmStage !== undefined ? (1.2 + realmStage * 0.6) * s : 1.2 * s}
        />
        {/* Same rings as on the map: red + purple hazard rings for bosses, rarity colour otherwise */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[ring, ring + (preview.boss ? 0.45 : 0.4), 48]} />
          <meshBasicMaterial color={preview.boss ? "#ef4444" : RARITY_STYLE[preview.rarity].ring} side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
        {preview.boss && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <ringGeometry args={[ring + 0.6, ring + 0.78, 48]} />
            <meshBasicMaterial color="#a855f7" side={THREE.DoubleSide} transparent opacity={0.6} />
          </mesh>
        )}
        {/* The rarity kit, as on the map (bosses and other rigs bring their own aura) */}
        {preview.burning ? (
          // Walls burning: fire and its curtain of fire-light in place of the rarity kit
          <CodexFire id={preview.type} size={ring - 0.2} />
        ) : (
          !hasRig(preview.type) && <CodexTierFx id={preview.type} rarity={preview.rarity} size={ring - 0.2} shell={!isCreatureNPC(preview.type)} />
        )}
        <group scale={s}>
          <NPCModel
            key={`${preview.type}:${preview.stage ?? ""}:${preview.step ?? ""}:${preview.burning ? "fire" : ""}:${realmStage ?? ""}`}
            npc={{
              id: `codex-${preview.type}`,
              type: preview.type,
              x: 0,
              z: 0,
              rarity: preview.rarity,
              // An epic landmark as it looks on a rotation day
              ...(preview.stage ? { landmarkState: { phase: preview.stage, from: 0, until: 1 }, landmarkStep: preview.step ?? 4 } : {}),
              // A buffer realm at a stage of its cycle (on its building day when `stage` is rising)
              ...(realmStage !== undefined ? { realm: { stage: realmStage, day: preview.stage === "rising" ? 0 : 1, level: 0, building: preview.stage === "rising", stageEndsAt: 0 } } : {})
            }}
            showcase
            ruined={preview.burning}
            hd={preview.hd}
          />
        </group>
      </>
    );
  }
  if (preview.kind === "mercenary") {
    return (
      <>
        {/* The legendary stands taller, with a halo and a staff above his hat */}
        <Frame distance={preview.rarity === "legendary" ? 6.2 : 4.8} height={preview.rarity === "legendary" ? 3.4 : 2.7} target={preview.rarity === "legendary" ? 1.7 : 1.35} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[1.25, 1.5, 48]} />
          <meshBasicMaterial color={RARITY_STYLE[preview.rarity].ring} side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
        <CodexTierFx id={preview.type} rarity={preview.rarity} size={1.2} shell={false} />
        <BossModel key={preview.type} type={preview.type} showcase fx={false} />
      </>
    );
  }
  if (preview.kind === "castle") {
    const level = CASTLE_STAGES[preview.stage].from + 4;
    if (view === "world") {
      const empyrean = preview.stage === EMPYREAN_STAGE;
      const scale = empyrean ? 1.3 : 0.8 + preview.stage * 0.15;
      return (
        <>
          <Frame distance={(empyrean ? 15 : 10) * scale} height={(empyrean ? 7 : 6) * scale} target={(empyrean ? 3.6 : 2.2) * scale} />
          <WorldCastles castles={[{ id: "codex", civilization: preview.civ, x: 0, y: 0, z: 0, scale, stage: preview.stage, level, empyrean }]} hoveredId={null} hd={!!preview.hd} />
          {/* The same kit as on the map: Citadel rare-class, Palace epic-class, Wonder legendary-class, Empyrean mythic-class */}
          {empyrean && <CodexTierFx id="castle" rarity="mythical" size={4.2} color="#dc2626" accent="#fbbf24" beam={30} />}
          {preview.stage === WONDER_STAGE && <CodexTierFx id="castle" rarity="legendary" size={2.6 * scale} beam={18} />}
          {preview.stage === PALACE_STAGE && <CodexTierFx id="castle" rarity="epic" size={2.3 * scale} />}
          {preview.stage === CITADEL_STAGE && <CodexTierFx id="castle" rarity="rare" size={2.1 * scale} />}
        </>
      );
    }
    const top = CASTLE_TOP_Y[preview.stage];
    return (
      <>
        <Frame distance={top * 2.8} height={top * 1.2} target={top * 0.6} />
        <TownHall3D key={`${preview.civ}-${preview.stage}-${prestige}`} civ={preview.civ} level={level} prestige={preview.stage === 4 ? prestige : 0} hd={!!preview.hd} />
      </>
    );
  }
  if (preview.kind === "building") {
    const level = preview.level;
    const size = plotSizeForLevel(level);
    return (
      <>
        <Frame distance={size * 1.5} height={size * 0.9} target={0.8} />
        <BuildingPreview key={preview.hd ? "hd" : "normal"} district={preview.district} level={level} prestige={preview.prestige ?? 0} civ={civ} hd={!!preview.hd} />
      </>
    );
  }
  if (preview.kind === "sound") {
    const long = preview.cue === "step";
    return (
      <>
        <Frame distance={long ? 6 : 4.6} height={long ? 3 : 2.2} target={0.75} />
        <SoundStage key={preview.cue} cue={preview.cue} />
      </>
    );
  }
  if (preview.kind === "folk") {
    return (
      <>
        {preview.mount ? <Frame distance={7} height={3.2} target={1} /> : <Frame distance={5.2} height={2.6} target={0.6} />}
        <FolkPreview key={`${preview.mount ?? preview.civ ?? preview.animal}-${preview.arms ?? 0}-${preview.hd ? 1 : 0}`} civ={preview.civ} animal={preview.animal} mount={preview.mount} hd={preview.hd} arms={preview.arms} />
      </>
    );
  }
  if (preview.kind === "festival") {
    return (
      <>
        <Frame distance={22} height={11} target={4} />
        <FestivalPreview key={`${civ}-${preview.hd ? 1 : 0}`} civ={civ} hd={preview.hd} />
      </>
    );
  }
  if (preview.kind === "remains") {
    return (
      <>
        <Frame distance={9} height={5.5} target={0.6} />
        <RemainsPreview key={`${civ}-${preview.hd ? 1 : 0}`} civ={civ} hd={preview.hd} />
      </>
    );
  }
  if (preview.kind === "soldiers") {
    const wide = preview.civs.length > 2 ? preview.civs.length * 1.2 : 1;
    return (
      <>
        <Frame distance={3.4 * wide} height={1.6 * wide} target={0.55} />
        <SoldiersPreview civs={preview.civs} />
      </>
    );
  }
  // 🦸 A champion is drawn in high graphics only: its rig, standing at rest
  if (preview.kind === "champion") {
    const [distance, height, target] = riggedHero(preview.type)?.frame ?? [6.4, 3.1, 1.5];
    return (
      <>
        <Frame distance={distance} height={height} target={target} front />
        <BossShowcase key={preview.type} type={preview.type} action="idle" band={1} />
      </>
    );
  }
  // Plaza landmarks are small: frame the plaza instead of the whole city
  const close = PLAZA_FOCUS[preview.upgradeId];
  return (
    <>
      <Frame distance={close ?? 48} height={close ? close * 0.6 : 34} target={close ? 1.5 : 0} />
      <ImprovementPreview upgradeId={preview.upgradeId} tier={preview.tier} civ={civ} hd={!!preview.hd} />
    </>
  );
}

/** Keeps a failing preview from taking down the whole app */
class PreviewBoundary extends Component<{ resetKey: string; children: ReactNode }, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  render() {
    return this.state.failed ? (
      <div className="h-full flex items-center justify-center text-xs text-slate-500">Preview unavailable</div>
    ) : (
      this.props.children
    );
  }
}

export function ModelViewer({ preview, civ, view, prestige }: { preview: Preview; civ: CivilizationType; view: "world" | "city"; prestige: number }) {
  return (
    <PreviewBoundary resetKey={JSON.stringify(preview) + civ + view}>
      <ModelCanvas preview={preview} civ={civ} view={view} prestige={prestige} />
    </PreviewBoundary>
  );
}

function ModelCanvas({ preview, civ, view, prestige }: { preview: Preview; civ: CivilizationType; view: "world" | "city"; prestige: number }) {
  const ground = preview.kind === "improvement" || preview.kind === "building" ? 140 : 40;
  const isSingularityHd = preview.kind === "singularity_hd";
  /** The mythic showcases sit on a dark violet stage; HD kit models on a neutral dark one, so mythic stays apart */
  const mythic = isSingularityHd || preview.kind === "empyrean_hd" || (preview.kind === "npc" && preview.type === VOID_GATE_TYPE) || (preview.kind === "void_brood" && preview.brood === "warden");
  const kit = ((preview.kind === "npc" || preview.kind === "folk" || preview.kind === "castle" || preview.kind === "improvement" || preview.kind === "building" || preview.kind === "void_brood") && !!preview.hd) || preview.kind === "hero_hd" || preview.kind === "boss_hd";
  /** A family's line-up is read left to right: it holds still */
  const lineup = preview.kind === "void_brood" && preview.size === undefined && preview.brood !== "warden";
  return (
    <Canvas
      shadows
      camera={{ fov: 40, near: 0.1, far: 500, position: [10, 7, 10] }}
      dpr={[1, 1.75]}
      // Dev handle for framing and measuring a preview: __codex.camera, __codex.gl, __codex.controls
      onCreated={(state) => {
        if (import.meta.env.DEV) (window as unknown as { __codex: unknown }).__codex = state;
      }}
    >
      <color attach="background" args={[mythic ? "#06030d" : kit ? "#0f1115" : "#0b1220"]} />
      <hemisphereLight args={[mythic ? "#c084fc" : kit ? "#e7ebf2" : "#e0ecff", mythic ? "#090414" : kit ? "#1c1914" : "#3b3325", mythic ? 0.65 : kit ? 0.95 : 1.1]} />
      <directionalLight position={[12, 20, 8]} intensity={mythic ? 1.4 : 2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ground / 2, 48]} />
        <meshStandardMaterial color={mythic ? "#080510" : kit ? "#1b1d22" : "#3f6b3a"} roughness={1} />
      </mesh>
      {/* Metal on an HD kit model catches a soft studio reflection; matte parts are untouched */}
      {kit && <Reflections intensity={0.45} />}
      <Suspense fallback={null}>
        <PreviewScene preview={preview} civ={civ} view={view} prestige={prestige} />
      </Suspense>
      <OrbitControls makeDefault autoRotate={!isSingularityHd && preview.kind !== "boss_hd" && !lineup} autoRotateSpeed={0.8} enablePan={false} minDistance={4} maxDistance={140} maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
  );
}
