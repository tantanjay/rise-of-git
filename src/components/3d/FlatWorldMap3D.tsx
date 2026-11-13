import { useState, useMemo, useRef, useEffect, useCallback, startTransition } from "react";
import { nextPaint, setLoadStage } from "@/utils/loadingScreen";
import { isOwnCamp } from "@/utils/mercenaries";
import { fogRange, fogText } from "@/utils/fog";
import { horrorByNpc, horrorSeed, horrorWait } from "@/utils/horror";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { CivilizationType, DeveloperKingdom, FlatWorldMapData, MapNPC, MapProvince, NethergardeSpire, ActiveMarch, NodeStatus, BossStatus, NpcKingdomStatus } from "@/types";
import { WorldCastles, CastlePlacement, CastleStyle } from "./world/WorldCastles";
import type { HeroSite } from "./world/HeroBatch";
import type { BossLive } from "./world/heroRig";
import { useHdModels } from "./world/hdModelsLoader";
import { useHd } from "@/utils/graphics";
import { useStaticShadows } from "./useStaticShadows";
import { CompileGate } from "./CompileGate";
import { CITADEL_STAGE, PALACE_STAGE, castleStage, WONDER_STAGE } from "@/utils/castle";
import { sound } from "@/hooks/useSound";
import { createTerrain, SEA_LEVEL, WORLD_SIZE, Terrain } from "./world/terrain";
import { buildWorldScatter } from "./world/scatter";
import { generateTerrainNPCs, isGeneratedNPC, npcBaseHeight, HOSTILE_NPC_TYPES, RARITY_SCALE, npcFootprint, buildNPCModel, hasWalkers, FLYING_SPAWNS, isCreatureNPC, wholeModelIdles, hasNPCModel, HAND_TUNED_NPCS } from "./world/npcs";
import { Part, IDLE_KIND, PART_IDLES, PartIdle, isWalkKind, walks } from "./city/parts";
import { npcFightKey } from "./world/npcStrikes";
import { ringFacing, updateBattleRings } from "./world/battleRing";
import { rngFor } from "@/utils/random";
import { NPCModel } from "./world/NPCModel";
import { hasRig } from "./world/BossModel";
import { TierFx, TierFxItem, fxTierOf } from "./TierFx";
import { FireFx, FireSite, FIRE_GLOW } from "./FireFx";
import { GATE_MODEL_TYPES, gateWallPoints } from "./world/gates";
import { ArchonSeal } from "@/components/ui/CivFrame";
import { LANDMARK_MODEL_TYPES, WATER_LANDMARK_TYPES } from "./world/landmarks";
import { REALM_STAGE_SCALE, WATER_REALM_TYPES, realmStageLabel, type HorrorPlacement } from "./world/realmTypes";
import { breakDown, landmarkStateLabel, landmarkStepOf } from "./world/landmarkStages";
import { InstancedParts } from "./city/InstancedParts";
import { GATHER_RADIUS, Islet, WarParties } from "./world/WarParties";
import { FootIcons, FootIcon, footIconKey } from "./world/FootIcons";
import { SovereignBeacon, InspectionRing } from "./world/SovereignBeacon";
import { TeleportFlashes } from "./world/TeleportFlashes";
import { NpcLife, buildNpcLife } from "./world/NpcLife";
import { Water } from "./world/Water";
import { BoardRim } from "./world/BoardRim";
import { Grass } from "./world/Grass";
import { terrainMaterial } from "./world/terrainMaterial";
import { Spectral, SlumberBadge } from "./world/SlumberingBoss";
import { ShieldDomes, StormClouds, DomeSpec, CloudSpec, STORM_GLOW } from "./RoyalDecreeFx";
import { Fireworks, FireworkSite } from "./FestivalFx";
import { festivalLeft } from "@/components/ui/RoyalProclamations";
import { timeLeftLabel } from "@/utils/format";
import { activePunishment, activeShield, punishmentLabel, shieldLabel } from "@/components/ui/DecreeChips";
import { useRealmSeason } from "@/utils/realmTime";
import { NightHalos, HaloPoint } from "./NightHalos";
import { useOnlineIds } from "@/utils/presence";

/** 🟢 A ruler online now: the storm light's curtain in white (GAME_GUIDE §10 *Who is online*) */
const ONLINE_GLOW = { tier: "epic" as const, color: "#f8fafc", accent: "#e0f2fe" };
import { skyWeather } from "./skyState";
import { seasonParts, seasonTerrain, WORLD_FOLIAGE } from "@/utils/seasonTint";
import { VOID_GATE, VOID_SCALE, WORLD_SCALE } from "@/utils/worldGeometry";
import { openVoidGateTeaser } from "@/utils/voidGate";
import { VoidGate } from "./world/VoidGate";

interface FlatWorldMap3DProps {
  kingdoms: DeveloperKingdom[];
  worldMap: FlatWorldMapData | null;
  /** Roving encounters of the current roving window; swapped in place without rebuilding the world */
  rovingNPCs?: MapNPC[];
  /** Xal'Vorath out in the realm: a boss that walks, kept apart so a step of its road never rebuilds the roving batch */
  horrorNPCs?: MapNPC[];
  /** Touched resource nodes / chests: emptied ones are hidden */
  nodeStatuses?: Record<string, NodeStatus>;
  /** World bosses' shared HP (hover badge); fallen ones carry `slumberUntil` on their MapNPC */
  bossStatuses?: Record<string, BossStatus>;
  /** Buffer realms and frontier gates (public): a burning one is drawn on fire, a gate broken open */
  npcKingdomStatuses?: Record<string, NpcKingdomStatus>;
  spires?: NethergardeSpire[];
  activeMarches?: ActiveMarch[];
  hideTooltips?: boolean;
  /** Glide the camera to a spot; with `kingdomId` that castle also gets the inspection ring */
  worldFocusRequest?: WorldFocusRequest | null;
  /** The signed-in ruler's kingdom: marked with the golden sovereign beacon */
  homeKingdomId?: string | null;
  onEnterKingdom: (id: string) => void;
  onSelectKingdom?: (kingdom: DeveloperKingdom) => void;
  onSelectNPC?: (npc: MapNPC) => void;
  onSelectSpire?: (spire: NethergardeSpire) => void;
  onOpenDevProfile?: (kingdom: DeveloperKingdom) => void;
  /** Called with true while the continent is being built, false once its first frames are drawn */
  onLoadingChange?: (loading: boolean) => void;
}

export interface WorldFocusRequest {
  x: number;
  z: number;
  nonce: number;
  kingdomId?: string;
}

/* ------------------------------------------------------------------------- */
/* Built world cache: building the continent takes a few hundred ms, so it   */
/* is done once per world map and reused when coming back from a city        */
/* ------------------------------------------------------------------------- */

interface BuiltWorld {
  worldMap: FlatWorldMapData | null;
  npcCount: number;
  terrain: Terrain;
  terrainGeometry: THREE.BufferGeometry;
  terrainNPCs: MapNPC[];
  scatter: ReturnType<typeof buildWorldScatter>;
}

let builtWorld: BuiltWorld | null = null;

const isWorldBuilt = (worldMap: FlatWorldMapData | null, npcCount: number) =>
  builtWorld !== null && builtWorld.worldMap === worldMap && builtWorld.npcCount === npcCount;

/** The longest the world build works before letting the page breathe (paint, input, the loading screen) */
const BUILD_SLICE_MS = 40;

/**
 * Builds the continent in pieces, with a paint between them, so the page is never blocked for the whole build at once
 * and the loading screen's bar moves on as each piece is done (each reports the point the bar reaches when it ends,
 * before it runs). Null if `alive()` turned false meanwhile (the map unmounted, or newer data came).
 */
async function buildWorld(worldMap: FlatWorldMapData | null, npcCount: number, alive: () => boolean): Promise<BuiltWorld | null> {
  if (builtWorld && isWorldBuilt(worldMap, npcCount)) return builtWorld;
  // One continuous continent: provinces blend into each other through the buffer biomes
  setLoadStage("land", 0.4);
  await nextPaint();
  if (!alive()) return null;
  const terrain = createTerrain(worldMap);
  // Extra NPC territories: one per four developers, each placed where its terrain fits
  setLoadStage("land", 0.6);
  await nextPaint();
  if (!alive()) return null;
  const terrainNPCs = generateTerrainNPCs(terrain, worldMap, npcCount);
  // The ground's mesh is the longest piece: built in slices of about a frame's work, the bar moving with it
  const steps = terrain.geometrySteps();
  let step = steps.next();
  let sliceStart = performance.now();
  while (!step.done) {
    if (performance.now() - sliceStart > BUILD_SLICE_MS) {
      setLoadStage("land", 0.6 + 0.3 * step.value);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!alive()) return null;
      sliceStart = performance.now();
    }
    step = steps.next();
  }
  const terrainGeometry = step.value;
  setLoadStage("land", 1);
  await nextPaint();
  if (!alive()) {
    terrainGeometry.dispose();
    return null;
  }
  const next: BuiltWorld = {
    worldMap,
    npcCount,
    terrain,
    terrainGeometry,
    terrainNPCs,
    scatter: buildWorldScatter(terrain, worldMap, terrainNPCs)
  };
  builtWorld?.terrainGeometry.dispose();
  builtWorld = next;
  return next;
}

/**
 * The last value built per slot and what it was built from (compared by identity): the NPC part lists take a few
 * hundred ms to build, and their inputs (the cached world, the roving set held by the app) are the same objects when
 * the map comes back from a city
 */
const rememberedValues = new Map<string, { deps: unknown[]; value: unknown }>();
function remembered<T>(slot: string, deps: unknown[], build: () => T): T {
  const hit = rememberedValues.get(slot);
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => Object.is(d, deps[i]))) return hit.value as T;
  const value = build();
  rememberedValues.set(slot, { deps, value });
  return value;
}

/** Bigger castle stages stand taller on the world map (Keep 0.8× … Wonder 1.4×); the Empyrean is a tall model of its own */
const castleScaleFor = (k: DeveloperKingdom) => (k.isArchon ? EMPYREAN_SCALE : 0.8 + Math.min(4, castleStage(k.cityHallLevel).index) * 0.15);
const EMPYREAN_SCALE = 1.3;
/** HD graphics: castle styles drawn by a hand-built HD hero model instead of the instanced kit */
const HERO_STYLES: CastleStyle[] = ["empyrean"];

/**
 * Wrapper classes for drei <Html> labels. drei writes each label's z-index inline, but only on frames where
 * the label moves on screen, and its mount effect can wipe that inline style (StrictMode in dev) — a fresh
 * hover panel then sat under the region names until the camera moved. An !important class can't be wiped,
 * so hover panels always draw above every other label. (drei only sets a non-empty className, hence the
 * neutral class when not hovered.)
 */
const HTML_HOVER_LAYER = "z-40!";
const HTML_BASE_LAYER = "world-label";

/** Hover/click target covering a castle at scale 1 */
const CASTLE_HIT_BOX = new THREE.BoxGeometry(3.4, 3.8, 3.4);

/**
 * Dev-only workaround: React's StrictMode re-runs drei <Html>'s mount effect, which resets each
 * label's style after drei has already scaled it. drei only rescales when the camera's position
 * or zoom changes, so labels would stay at full size until the map is moved. Nudging the zoom
 * value for one frame (without touching the projection) makes every label rescale.
 */
function useRefreshHtmlLabelsInDev() {
  const camera = useThree((s) => s.camera);
  const step = useRef(0); // 0 idle, 1 nudge on the next frame, 2 restore on the next frame
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const t = setTimeout(() => (step.current = 1), 400);
    return () => clearTimeout(t);
  }, []);
  useFrame(() => {
    if (step.current === 1) {
      camera.zoom += 0.002;
      step.current = 2;
    } else if (step.current === 2) {
      camera.zoom -= 0.002;
      step.current = 0;
    }
  });
}

/* ========================================================================= */
/* 1. ARCANE RIFT (floating islands above the crater in the continent)       */
/* ========================================================================= */

/** The Void Gate stands this many times its Codex size on the map */
const VOID_GATE_MAP_SCALE = 1.5;

/**
 * 🌀 The Void Gate on the map (GAME_GUIDE §10 *The Void Gate*): the mythic gate at its fixed spot in the Voidrift's open
 * outer band, south of the Core, facing the map camera. Its climb is not in the game yet: clicking it opens the
 * teaser window. 7 draws in Normal and HD (VoidGate.tsx), all motion on the GPU.
 */
function MapVoidGate({ terrain, hd, label }: { terrain: Terrain; hd: boolean; label: boolean }) {
  const y = terrain.height(VOID_GATE.x, VOID_GATE.z);
  return (
    <group
      position={[VOID_GATE.x, y - 0.05, VOID_GATE.z]}
      scale={VOID_GATE_MAP_SCALE}
      onClick={(e) => {
        e.stopPropagation();
        sound.playClick();
        openVoidGateTeaser();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <VoidGate key={hd ? "hd" : "normal"} hd={hd} seed="void-gate-map" />
      {/* What the pointer hits: the arch and its opening (the parts themselves are instanced and thin) */}
      <mesh position={[0, 3.6, 0]}>
        <boxGeometry args={[5.2, 7.4, 2.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {label && (
        <Html zIndexRange={[15, 0]} position={[0, 8.6, 0]} center distanceFactor={70} style={{ pointerEvents: "none" }}>
          <div className="select-none whitespace-nowrap flex flex-col items-center gap-0.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            <span className="font-medieval tracking-widest uppercase text-violet-200 text-lg">The Void Gate</span>
            <span className="px-2 py-0.5 rounded-full border border-violet-400/70 bg-violet-950/80 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-100">Coming soon</span>
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Arcane Province: glowing rift on the crater floor with obsidian shards orbiting high above. After dark the
 * obsidian smoulders violet from within and each shard wears a halo, so the ring reads against the night sky
 */
function ArcaneRift({ province, floorY }: { province: MapProvince; floorY: number }) {
  const shardsRef = useRef<THREE.Group>(null);
  const obsidian = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.5, metalness: 0.4, flatShading: true, emissive: new THREE.Color("#7e22ce"), emissiveIntensity: 0 }), []);
  useEffect(() => () => obsidian.dispose(), [obsidian]);

  useFrame((state, delta) => {
    obsidian.emissiveIntensity = 0.12 + skyWeather.night * (0.55 + Math.sin(state.clock.elapsedTime * 1.3) * 0.12);
    if (shardsRef.current) {
      shardsRef.current.rotation.y += delta * 0.08;
      shardsRef.current.position.y = floorY + 7.5 + Math.sin(state.clock.elapsedTime * 1.2) * 0.3;
    }
  });

  const shards = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const angle = (i / 7) * Math.PI * 2;
        // Round the wider rift: they circle over the castles' ring (VOID_SCALE)
        const radius = (12 + (i % 3) * 2) * WORLD_SCALE * VOID_SCALE;
        return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, y: (i % 2) * 1.6, size: (1.2 + (i % 3) * 0.5) * 1.3, rot: i * 0.9 };
      }),
    []
  );
  // A violet glow round each shard and a brighter one round its crystal (the crystal sits one shard-size out along the shard's turned axis)
  const halos = useMemo<HaloPoint[]>(
    () =>
      shards.flatMap((sh) => {
        const tip = new THREE.Vector3(0, sh.size, 0).applyEuler(new THREE.Euler(sh.rot, sh.rot * 2, 0));
        return [
          { x: sh.x, y: sh.y, z: sh.z, size: sh.size * 4.2, color: "#9333ea" },
          { x: sh.x + tip.x, y: sh.y + tip.y, z: sh.z + tip.z, size: sh.size * 2.2, color: "#e879f9" }
        ];
      }),
    [shards]
  );

  return (
    <group position={[province.centerX, 0, province.centerZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.06, 0]}>
        <ringGeometry args={[3.2, 6.2, 48]} />
        <meshBasicMaterial color="#a855f7" toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.85} />
      </mesh>
      <group ref={shardsRef}>
        {shards.map((sh, i) => (
          <group key={i} position={[sh.x, sh.y, sh.z]} rotation={[sh.rot, sh.rot * 2, 0]}>
            <mesh material={obsidian}>
              <icosahedronGeometry args={[sh.size, 0]} />
            </mesh>
            <mesh position={[0, sh.size, 0]}>
              <octahedronGeometry args={[sh.size * 0.4, 0]} />
              <meshBasicMaterial color="#c084fc" toneMapped={false} />
            </mesh>
          </group>
        ))}
        <NightHalos points={halos} day={0.15} night={1} />
      </group>
    </group>
  );
}

/* Nethergarde Voidrift is the sole province with a signature orbiting sky phenomenon */

/* ========================================================================= */
/* 2. INTERACTIVE 3D WORLD NPCS                                              */
/* ========================================================================= */

const SCALED_CATEGORIES = new Set<string>(["mob", "bandit", "treasure", "resource"]);

const RARITY_COLORS: Record<string, string> = {
  common: "#94a3b8",
  uncommon: "#22c55e",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f59e0b",
  mythical: "#e11d48"
};

/** Roving spawns and resource nodes grow with their tier, buffer realms with their stage; bosses/landmarks keep their own size */
const tierScaleOf = (npc: MapNPC) =>
  npc.realm ? REALM_STAGE_SCALE[npc.realm.stage] ?? 1 : npc.category && SCALED_CATEGORIES.has(npc.category) ? RARITY_SCALE[npc.rarity ?? ""] ?? 1 : 1;

/** Ground height an NPC model stands on */
function npcY(npc: MapNPC, terrain: Terrain): number {
  if (WATER_LANDMARK_TYPES.has(npc.type)) return Math.max(terrain.height(npc.x, npc.z) - 0.1, SEA_LEVEL - 0.05);
  if (isGeneratedNPC(npc.type)) return npcBaseHeight(npc, terrain);
  return Math.max(terrain.height(npc.x, npc.z) - 0.1, SEA_LEVEL + 0.05);
}

/** Gatherers work a node (or claim a treasure) standing in a circle round it: an islet under one holds them all */
const GATHERED = new Set(["resource", "treasure"]);

/** How far out an NPC needs dry ground: its model, or the work circle round a node or treasure */
const groundReach = (npc: MapNPC) => {
  const r = npcFootprint(npc.type, npc.realm?.stage) * tierScaleOf(npc) + 0.8;
  return GATHERED.has(npc.category ?? "") ? Math.max(r, GATHER_RADIUS + 0.7) : r;
};

/**
 * Land NPCs (not sea monsters or sea landmarks) placed over water get an islet to stand on: water under the centre, or
 * for a node or treasure mostly under its work circle (a build pad can lift the centre a hair above the sea while the
 * circle is open water)
 */
const needsIslet = (npc: MapNPC, terrain: Terrain) => {
  // Xal'Vorath hangs over its well of dust: it crosses the water without touching it
  if (WATER_LANDMARK_TYPES.has(npc.type) || isGeneratedNPC(npc.type) || npc.horrorPhase) return false;
  if (terrain.height(npc.x, npc.z) < SEA_LEVEL + 0.15) return true;
  // Only a node or treasure is judged by its work circle too (a sea boss rising from a pad keeps no islet)
  if (!GATHERED.has(npc.category ?? "")) return false;
  const r = groundReach(npc) - 0.4;
  let wet = 0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (terrain.height(npc.x + Math.cos(a) * r, npc.z + Math.sin(a) * r) < SEA_LEVEL) wet++;
  }
  // Mostly at sea (a node on the beach keeps its feet on the sand)
  return wet >= 5;
};

/** The islets under land NPCs over water: wide enough for the model, and for the work circle round a node or treasure */
function isletsOf(npcs: MapNPC[], terrain: Terrain): Islet[] {
  const out: Islet[] = [];
  for (const npc of npcs) if (needsIslet(npc, terrain)) out.push({ x: npc.x, y: npcY(npc, terrain), z: npc.z, r: groundReach(npc) });
  return out;
}

/* Ground rings: unit rings in the XZ plane, scaled per NPC. Three instanced meshes draw every ring on the map. */
const RARITY_RING = new THREE.RingGeometry(1, 1.14, 40).rotateX(-Math.PI / 2);
const BOSS_RING = new THREE.RingGeometry(1, 1.15, 48).rotateX(-Math.PI / 2);
const BOSS_OUTER_RING = new THREE.RingGeometry(1.2, 1.26, 48).rotateX(-Math.PI / 2);
/**
 * Boss and pack rings double as HP bars: per-instance `aFill` (HP left, 0–1) keeps that share of the ring lit,
 * clockwise from the back (12 o'clock from the default camera); the lost share shows as a dim track. Anyone can
 * see a wounded boss or pack, and whoever lands the last blow takes it. Resource node rings show the share left.
 */
function makeHpRingMaterial(color: string | undefined, opacity: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false });
  if (color) mat.color.set(color);
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFill;\nvarying float vFill;\nvarying vec2 vRingPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFill = aFill;\nvRingPos = position.xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFill;\nvarying vec2 vRingPos;")
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `vec4 diffuseColor = vec4( diffuse, opacity );
        float hpAt = fract(atan(vRingPos.x, -vRingPos.y) / 6.2831853 + 1.0);
        if (hpAt > vFill) diffuseColor = vec4(0.22, 0.24, 0.3, opacity * 0.5);`
      );
  };
  return mat;
}

/** A ring geometry with a per-instance HP fill attribute (all full) */
function hpRingGeometry(base: THREE.BufferGeometry, capacity: number): THREE.BufferGeometry {
  const g = base.clone();
  g.setAttribute("aFill", new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1));
  return g;
}

/** Unit islet: top face at y = 0, reaching down below the sea surface */
const ISLET = new THREE.CylinderGeometry(1, 1.15, 0.6, 20).translate(0, -0.3, 0);

/** Foot icon badge: on the front (+z, toward the default camera) of the ring, clear of the ring by ≥0.05 */
const FOOT_ICON_RADIUS = 0.8;
const FOOT_ICON_LIFT = 0.06;

/**
 * Every NPC ground ring (plus islets for land spawns over water) in four draw calls, and every foot icon in one. Each ring sits just outside its model footprint and
 * above the highest ground under it, so it is never hidden inside the model or under a sloping pad.
 */
function NPCRings({
  npcs,
  terrain,
  islets,
  bossStatuses,
  nodeStatuses
}: {
  npcs: MapNPC[];
  terrain: Terrain;
  islets: Islet[];
  bossStatuses: Record<string, BossStatus>;
  nodeStatuses: Record<string, NodeStatus>;
}) {
  const { rarity, boss, icons } = useMemo(() => {
    const rarity: Array<{ x: number; y: number; z: number; r: number; color: string; fill: number; id: string }> = [];
    const boss: Array<{ x: number; y: number; z: number; r: number; id: string }> = [];
    const icons: FootIcon[] = [];
    for (const npc of npcs) {
      const r = npcFootprint(npc.type, npc.realm?.stage) * tierScaleOf(npc) + 0.2;
      let top = npcY(npc, terrain);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        top = Math.max(top, terrain.height(npc.x + Math.cos(a) * (r + 0.3), npc.z + Math.sin(a) * (r + 0.3)));
      }
      const ring = { x: npc.x, y: top + 0.08, z: npc.z, r };
      if (npc.category === "boss") boss.push({ ...ring, id: npc.id });
      // Mob / bandit packs: the ring shows the pack's HP left (resource nodes: what is left to gather)
      else rarity.push({ ...ring, color: RARITY_COLORS[npc.rarity ?? "common"] ?? RARITY_COLORS.common, fill: npc.pack?.health ?? 1, id: npc.id });
      const key = footIconKey(npc);
      if (key) {
        const ix = npc.x;
        const iz = npc.z + r;
        icons.push({ key, x: ix, y: Math.max(ring.y, terrain.height(ix, iz)) + FOOT_ICON_LIFT, z: iz, r: FOOT_ICON_RADIUS });
      }
    }
    return { rarity, boss, icons };
  }, [npcs, terrain]);

  const rarityRef = useRef<THREE.InstancedMesh>(null);
  const bossRef = useRef<THREE.InstancedMesh>(null);
  const outerRef = useRef<THREE.InstancedMesh>(null);
  const isletRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const write = (mesh: THREE.InstancedMesh | null, rings: Array<{ x: number; y: number; z: number; r: number; color?: string }>) => {
      if (!mesh) return;
      rings.forEach((g, i) => {
        mesh.setMatrixAt(i, m.makeScale(g.r, 1, g.r).setPosition(g.x, g.y, g.z));
        if (g.color) mesh.setColorAt(i, c.set(g.color));
      });
      mesh.count = rings.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    write(rarityRef.current, rarity);
    write(bossRef.current, boss);
    write(outerRef.current, boss);
    write(isletRef.current, islets);
  }, [rarity, boss, islets]);

  // Capacity is fixed per mount (power of two), so spawns appearing/disappearing never remount the meshes
  const cap = (n: number) => Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, n))));
  const bossCap = cap(boss.length);
  const rarityCap = cap(rarity.length);
  const bossRing = useMemo(() => hpRingGeometry(BOSS_RING, bossCap), [bossCap]);
  const rarityRing = useMemo(() => hpRingGeometry(RARITY_RING, rarityCap), [rarityCap]);
  const bossRingMat = useMemo(() => makeHpRingMaterial("#ef4444", 0.85), []);
  const rarityRingMat = useMemo(() => makeHpRingMaterial(undefined, 0.8), []);
  // Made here, so freed here: r3f disposes only what JSX creates (each map ↔ city trip leaked both rings)
  useEffect(() => () => bossRing.dispose(), [bossRing]);
  useEffect(() => () => rarityRing.dispose(), [rarityRing]);
  useEffect(() => () => bossRingMat.dispose(), [bossRingMat]);
  useEffect(() => () => rarityRingMat.dispose(), [rarityRingMat]);
  useEffect(() => {
    const attr = rarityRing.getAttribute("aFill") as THREE.InstancedBufferAttribute;
    rarity.forEach((r, i) => attr.setX(i, Math.max(0, Math.min(1, nodeStatuses[r.id]?.left ?? r.fill))));
    attr.needsUpdate = true;
  }, [rarity, rarityRing, nodeStatuses]);
  // HP left of each boss: only the fill attribute changes, the rings never rebuild
  useEffect(() => {
    const attr = bossRing.getAttribute("aFill") as THREE.InstancedBufferAttribute;
    boss.forEach((b, i) => {
      const st = bossStatuses[b.id];
      attr.setX(i, !st ? 1 : st.dead ? 0 : st.maxHp ? Math.max(0, Math.min(1, st.hp / st.maxHp)) : 1);
    });
    attr.needsUpdate = true;
  }, [boss, bossStatuses, bossRing]);
  return (
    <>
      <instancedMesh ref={rarityRef} args={[rarityRing, rarityRingMat, rarityCap]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={bossRef} args={[bossRing, bossRingMat, bossCap]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={outerRef} args={[BOSS_OUTER_RING, undefined, cap(boss.length)]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial color="#a855f7" side={THREE.DoubleSide} transparent opacity={0.6} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={isletRef} args={[ISLET, undefined, cap(islets.length)]} frustumCulled={false} raycast={() => null} receiveShadow>
        <meshStandardMaterial color="#d6c08a" roughness={1} flatShading />
      </instancedMesh>
      <FootIcons icons={icons} />
    </>
  );
}


/**
 * Persistent map NPCs drawn by the shared batch instead of a model each: buffer realms, epic and legendary landmarks
 * and frontier gates (rigged models stay on their own)
 */
const isBatchedStatic = (n: MapNPC) => LANDMARK_MODEL_TYPES.has(n.type) && !hasRig(n.type);
/**
 * Resource nodes, treasure caches and wild sights drawn by the shared batch too (their own batch, which rebuilds only
 * when a node is emptied), so draw calls grow with their kinds, not their number; hand-tuned sights (the kraken, the
 * sandworm, nests, portals) keep a model each for their CPU idle
 */
const isBatchedSite = (n: MapNPC) => hasNPCModel(n.type) && !hasRig(n.type) && !LANDMARK_MODEL_TYPES.has(n.type) && !HAND_TUNED_NPCS.has(n.type);

/**
 * Models of many NPCs merged into one part list: draw calls stay flat however many there are (one instanced mesh per
 * shape); idles run on the GPU. Parts with a cycle of their own (a fluttering flag, a glinting gem) keep it, and the
 * whole model's cycle (a roving spawn's prowl, a herd's breath, the wreck's rocking) moves them with it.
 * Also returns each model's height for its hover/click target.
 */
function npcModelParts(npcs: MapNPC[], terrain: Terrain, opts: { roving?: boolean; sites?: boolean; ruined?: Set<string> } = {}): { parts: Part[]; heights: Map<string, number> } {
  const parts: Part[] = [];
  const heights = new Map<string, number>();
  for (const n of npcs) {
    // Legendary chests are rigged models of their own (drawn by MapNPC3D)
    if (hasRig(n.type)) continue;
    const s = tierScaleOf(n);
    const y = npcY(n, terrain);
    // A walker's loop grows with the model
    const place = (c: PartIdle): PartIdle => ({ ...c, x: n.x + c.x * s, y: y + c.y * s, z: n.z + c.z * s, amp: isWalkKind(c.kind) && c.amp !== undefined ? c.amp * s : c.amp });
    const model = buildNPCModel(n, { ruined: opts.ruined?.has(n.id) && GATE_MODEL_TYPES.has(n.type) });
    // Roving spawns idle as a whole (prowl, float, bob, breathe) unless their creatures walk about on their own (then
    // the camp around them stands still); so do treasure caches (bob); in a site only its living things breathe (herds,
    // the yeti, camels), as NPCModel does (a roving window's wave of resource nodes too); landmarks keep the cycle their
    // model brings (the wreck's rocking)
    const wholes = opts.roving || opts.sites ? wholeModelIdles(n, model, opts.roving && n.category !== "resource") : undefined;
    // A pack's creatures strike and cast in its battles (the camp around them stands still)
    const fight = opts.roving && (n.category === "mob" || n.category === "bandit") ? npcFightKey(n.id) : undefined;
    let top = 0;
    model.forEach((p, i) => {
      top = Math.max(top, p.y + p.h / 2);
      const own = p.idle && PART_IDLES.has(p.idle.kind) ? place(p.idle) : undefined;
      const life = wholes?.[i];
      const whole = life ? place(life) : p.model && place(p.model);
      const pose = p.pose && { ...p.pose, x: n.x + p.pose.x * s, y: y + p.pose.y * s, z: n.z + p.pose.z * s };
      const part: Part = { ...p, x: n.x + p.x * s, y: y + p.y * s, z: n.z + p.z * s, w: p.w * s, h: p.h * s, d: p.d * s, idle: own, model: whole, pose, base: y + (p.base ?? 0) * s };
      if (fight !== undefined && walks(part)) part.fight = fight;
      parts.push(part);
    });
    heights.set(n.id, top * s);
  }
  return { parts, heights };
}

const HIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0);

/** Hover/click target of the risen Eye: from just over the Empyrean's halo up past the Eye's crown (the castle's own target ends below) */
const ASCENDED_HIT_BOTTOM = 10.2;
const ASCENDED_HIT_HEIGHT = 7.5;
const ASCENDED_HIT_RADIUS = 4.6;

function MapNPC3D({
  npc,
  y,
  batched = false,
  hitHeight,
  boss,
  node,
  fighting,
  burning = false,
  hideTooltips,
  camp = false,
  onSelect
}: {
  npc: MapNPC;
  /** The viewer's own Mercenary Camp: the hover says so */
  camp?: boolean;
  /** A buffer realm or frontier gate whose walls burn (a gate lies broken open) */
  burning?: boolean;
  y: number;
  /** World boss status: shared HP for the hover badge */
  boss?: BossStatus;
  /** Resource node status: the share left (public) */
  node?: NodeStatus;
  /** Armies are fighting it right now, coming from here: a boss turns on them and strikes */
  fighting?: { x: number; z: number };
  /** Model is drawn by the shared NPC batch; this only provides the hover/click target and tooltip */
  batched?: boolean;
  /** Batched: how tall the hover/click target stands (default 2.6, a roving spawn) */
  hitHeight?: number;
  hideTooltips?: boolean;
  onSelect?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  // When the hover began: a rotation-day landmark's card counts its hours left from it
  const [hoverAt, setHoverAt] = useState(0);
  const tierScale = tierScaleOf(npc);
  const ringColor = RARITY_COLORS[npc.rarity ?? "common"] ?? RARITY_COLORS.common;
  const hostile = npc.category === "mob" || npc.category === "bandit" || HOSTILE_NPC_TYPES.has(npc.type);
  const slumbering = npc.category === "boss" && npc.slumberUntil !== undefined;
  const hpPct = boss && boss.maxHp ? Math.round((boss.hp / boss.maxHp) * 100) : 100;
  // Xal'Vorath's card counts down from when the hover began
  const horror = hovered && npc.horrorPhase ? horrorByNpc(npc.id) : undefined;
  const ascended = npc.type === "ruins-ascended";
  // A model drawn on its own (a hand-tuned wild sight) takes its HD version like the batch does
  const hdModels = useHd("models");

  return (
    <group
      position={[npc.x, y, npc.z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoverAt(Date.now());
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        sound.playClick();
        if (onSelect) onSelect();
      }}
    >
      {batched ? (
        // Invisible hover/click target (never drawn); the model itself lives in the shared NPC batch
        <mesh geometry={HIT_CYLINDER} scale={[npcFootprint(npc.type, npc.realm?.stage) * tierScale, hitHeight ?? 2.6 * tierScale, npcFootprint(npc.type, npc.realm?.stage) * tierScale]}>
          <meshBasicMaterial visible={false} />
        </mesh>
      ) : (
        // The risen Eye floats high: growing it about the ground would lift it out from under the cursor
        // Xal'Vorath faces the way it walks; in a fight its rig turns on its attackers by itself
        <group scale={(hovered && !ascended ? 1.2 : 1.0) * tierScale} rotation={[0, npc.horrorPhase && !fighting ? (npc.horrorHeading ?? 0) : 0, 0]}>
          <Spectral key={npc.type} active={slumbering}>
            <NPCModel npc={npc} slumbering={slumbering} fighting={fighting} ruined={burning && GATE_MODEL_TYPES.has(npc.type)} hd={hdModels} />
          </Spectral>
        </group>
      )}

      {/* The risen Eye: a generous invisible target round it (never drawn), above the Archon's castle target */}
      {ascended && (
        <mesh geometry={HIT_CYLINDER} position={[0, ASCENDED_HIT_BOTTOM, 0]} scale={[ASCENDED_HIT_RADIUS, ASCENDED_HIT_HEIGHT, ASCENDED_HIT_RADIUS]}>
          <meshBasicMaterial visible={false} />
        </mesh>
      )}

      {/* Where a boss fell, the next one rises as a phantom until it wakes */}
      {slumbering && !hideTooltips && !hovered && <SlumberBadge until={npc.slumberUntil!} y={10} name={npc.name} />}

      {/* Floating Hover Badge */}
      {!hideTooltips && hovered && (
        <Html zIndexRange={[30, 16]} wrapperClass={HTML_HOVER_LAYER} position={[0, npc.category === "boss" ? 7.5 : npc.type === "ruins-ascended" ? 16.5 : 4.4, 0]} center distanceFactor={45} style={{ pointerEvents: "none" }}>
          <div className={`px-3.5 py-2 rounded-xl shadow-2xl backdrop-blur-md text-center whitespace-nowrap animate-fadeIn select-none space-y-1 ${
            npc.category === "boss" ? "bg-slate-950/98 border border-red-500/80 shadow-red-950/60" : "bg-slate-950/95 border border-amber-500/70"
          }`}>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl">{npc.emblem}</span>
              <span className={`font-medieval text-sm font-bold ${npc.category === "boss" ? "text-red-300" : "text-amber-300"}`}>
                {npc.name}
              </span>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[10px]">
              {npc.category && (
                <span className={`px-1.5 py-0.2 rounded font-mono uppercase font-bold border ${
                  npc.category === "boss" ? "bg-red-950/80 text-red-300 border-red-600/60" : "bg-slate-800 text-slate-300 border-slate-700"
                }`}>
                  {npc.category === "boss" ? "💀 WORLD RAID BOSS" : npc.category}
                </span>
              )}
              {npc.rarity && (
                <span
                  className="px-1.5 py-0.2 rounded font-mono uppercase font-bold border"
                  style={{
                    color: ringColor,
                    borderColor: `${ringColor}60`,
                    backgroundColor: `${ringColor}20`
                  }}
                >
                  {npc.rarity}
                </span>
              )}
            </div>

            {/* Boss shared HP (public) */}
            {npc.category === "boss" && boss && !slumbering && (
              <div className="space-y-1 pt-0.5 w-44 mx-auto">
                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-red-500/50 p-0.5">
                  <div className="bg-linear-to-r from-red-600 via-rose-500 to-amber-500 h-full rounded-full animate-pulse" style={{ width: `${hpPct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono font-bold text-red-400">
                  <span>
                    ❤️ {boss.hp.toLocaleString()} / {boss.maxHp.toLocaleString()} HP
                  </span>
                  <span className="text-amber-300">{hpPct}%</span>
                </div>
                {boss.vengeance > 0 && <div className="text-[9px] font-mono font-bold text-orange-300">🔥 Vengeance ×{boss.vengeance}: +{boss.vengeance * 10}% all stats</div>}
                {horror && (
                  <div className="text-[9px] font-mono font-bold text-violet-300">
                    {horror.phase === "siege" ? `🔥 Burns ${horror.targetName}'s kingdom in ${horrorWait(horror.siegeEndsAt - hoverAt)}` : `🌑 At ${horror.targetName}'s gates in ${horrorWait(horror.arrivesAt - hoverAt)}`}
                  </div>
                )}
              </div>
            )}
            {slumbering && (
              <div className="text-[10px] font-mono font-bold text-cyan-300">👻 Rising{npc.fallenName ? ` where ${npc.fallenName} fell` : ""}: it wakes soon{boss?.next?.vengeance ? ` with 🔥 +${boss.next.vengeance * 10}%` : ""}</div>
            )}
            {/* Mob / bandit pack: its HP left is public, so anyone can finish off a wounded pack */}
            {npc.pack && (
              <div className={`text-[10px] font-mono font-bold ${npc.pack.wounded ? "text-orange-300" : "text-emerald-300"}`}>
                ❤️ {Math.round(npc.pack.health * 100)}% HP · {npc.pack.band} {npc.pack.unitName}s{npc.pack.wounded ? " · wounded" : ""}
              </div>
            )}

            {burning && (
              <div className="text-[10px] font-mono font-bold text-orange-300">
                🔥 {GATE_MODEL_TYPES.has(npc.type) ? "Gate broken and burning: the border is open" : "Walls burning: protected until they repair"}
              </div>
            )}
            <div className="text-[10px] text-slate-300 font-mono">{npc.subtitle}</div>
            <div className="text-[10px] text-slate-400 font-mono">{npc.region}</div>
            {npc.realm && <div className="text-[10px] font-mono font-bold text-indigo-200">{realmStageLabel(npc.realm)}</div>}
            {npc.landmarkState && <div className="text-[10px] font-mono font-bold text-amber-200">{landmarkStateLabel(npc.landmarkState, hoverAt, npc.category === "kingdom")}</div>}
            {npc.category === "resource" && (
              <div className="text-[10px] font-mono font-bold text-amber-200">⛏️ {Math.round((node?.left ?? 1) * 100)}% left</div>
            )}
            {npc.resourceYield && (
              <div className="text-[10px] text-emerald-400 font-mono font-bold">
                Yield: {Object.entries(npc.resourceYield).map(([k, v]) => `+${v.toLocaleString()} ${k}`).join(" • ")}
              </div>
            )}
            <div
              className={`text-[9px] font-semibold tracking-wider uppercase pt-0.5 ${
                npc.category === "boss" || hostile ? "text-red-400" : "text-amber-400"
              }`}
            >
              {slumbering
                ? "Click to see its last fall"
                : npc.category === "boss"
                ? "⚔️ Sovereign Boss - Click to Challenge"
                : npc.category === "resource"
                  ? "⛏️ Resource Node - Click to Gather"
                  : npc.category === "treasure"
                    ? "💎 Treasure Cache - Click to Claim"
                    : hostile
                      ? "Hostile - scout with caution"
                      : camp
                        ? "🪙 Mercenary Camp - Click to Hire"
                        : "Click to Scout & Explore"}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------------- */
/* 2b. NPC VOID KINGDOMS ON OPEN NETHERGARDE SLOTS                           */
/* ------------------------------------------------------------------------- */

/** Castle size of an NPC void kingdom (same rule as developer castles) */
const spireScale = (s: NethergardeSpire) => 0.8 + castleStage(s.npcLevel ?? 1).index * 0.15;

/** Click target + badge of an NPC void kingdom; the castle itself is drawn by WorldCastles */
function VoidNpcCitadel({ spire, y, hideTooltips, onSelect }: { spire: NethergardeSpire; y: number; hideTooltips?: boolean; onSelect?: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [x, z] = spire.coordinates;
  const scale = spireScale(spire);
  // Fogged for mortals: unknown, or projected from their scout report
  const fog = spire.fog;
  const seen = fogRange(fog?.report, "garrison");
  const garrison = spire.garrison ?? seen?.hi ?? 0;
  const max = Math.max(1, spire.maxGarrison ?? fog?.report?.details.maxGarrison ?? garrison);
  const besieged = Boolean(spire.besieged);
  const hidden = spire.garrison === undefined && seen === undefined;

  return (
    <group
      position={[x, y, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        sound.playClick();
        onSelect?.();
      }}
    >
      <mesh position={[0, 1.8 * scale, 0]} scale={scale} geometry={CASTLE_HIT_BOX}>
        <meshBasicMaterial visible={false} />
      </mesh>
      {!hideTooltips && (
        // Hovered: stack above region names and neighbouring badges (same band as other hover panels)
        <Html zIndexRange={hovered ? [30, 16] : [15, 0]} wrapperClass={hovered ? HTML_HOVER_LAYER : HTML_BASE_LAYER} position={[0, 4.4 * scale, 0]} center distanceFactor={48} style={{ pointerEvents: "none" }}>
          <div
            className={`px-3 py-1.5 rounded-xl border shadow-2xl transition-all duration-200 select-none whitespace-nowrap ${
              hovered ? "bg-purple-950/95 border-purple-300 text-purple-100 scale-110 ring-2 ring-purple-400/40" : "bg-slate-900/90 border-purple-700/70 text-slate-200"
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold font-medieval text-xs">
              <span>🔮</span>
              <span>{spire.npcName}</span>
              <span className="text-[9px] font-mono text-purple-300">NPC · Lv {spire.npcLevel}</span>
            </div>
            {!hidden && (
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-linear-to-r from-purple-600 to-fuchsia-400" style={{ width: `${(garrison / max) * 100}%` }} />
              </div>
            )}
            <div className="text-[9px] text-slate-400 font-mono text-center">
              🛡️ {hidden ? "? (fog)" : spire.garrison === undefined ? `${fogText(seen)} / ${max.toLocaleString()} 👁️` : `${garrison.toLocaleString()} / ${max.toLocaleString()}`} {besieged ? "· besieged" : ""}
              {hovered && <span className="text-amber-300"> · click to march</span>}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ========================================================================= */
/* 3. MAIN FLAT WORLD MAP 3D COMPONENT                                       */
/* ========================================================================= */

/**
 * Builds the continent behind the loading screen: the build runs in pieces with a paint between them, and the map
 * mounts in a transition once it is built. The current map stays on screen while a
 * new one (e.g. after a sync) is built, and a cached world is reused with no loader at all.
 */
export function FlatWorldMap3D(props: FlatWorldMap3DProps) {
  const { worldMap, onLoadingChange } = props;
  const npcCount = Math.ceil(props.kingdoms.length / 4);
  // Null at first even with the world cached (coming back from a city): the map then mounts in a transition too
  const [world, setWorld] = useState<BuiltWorld | null>(null);

  useEffect(() => {
    if (!worldMap) {
      onLoadingChange?.(true); // still waiting for the map data
      return;
    }
    if (world && world.worldMap === worldMap && world.npcCount === npcCount) return;
    onLoadingChange?.(true);
    if (isWorldBuilt(worldMap, npcCount)) {
      const cached = builtWorld;
      setLoadStage("castles");
      startTransition(() => setWorld(cached));
      return;
    }
    // The build runs in pieces behind the loading screen; the map's components then mount in a transition, which React
    // renders in small slices instead of one long block
    let alive = true;
    buildWorld(worldMap, npcCount, () => alive).then((built) => {
      if (!alive || !built) return;
      setLoadStage("castles");
      startTransition(() => setWorld(built));
    });
    return () => {
      alive = false;
    };
  }, [worldMap, npcCount, world, onLoadingChange]);

  // Never leave the loader up if the map unmounts mid-build (e.g. entering a city)
  useEffect(() => () => onLoadingChange?.(false), [onLoadingChange]);

  return world ? <WorldMapContent {...props} world={world} /> : null;
}

const NO_NPCS: MapNPC[] = [];
const NO_STATUSES: Record<string, NodeStatus> = {};
const NO_BOSSES: Record<string, BossStatus> = {};
const NO_NPC_KINGDOMS: Record<string, NpcKingdomStatus> = {};

/** A burning gate's border wall lies broken this far either side of it */
const GATE_BREACH = 12;

/** Fire on a burning castle of world-map scale `scale` */
const castleFire = (id: string, x: number, y: number, z: number, scale: number): FireSite => ({ id: `fire-${id}`, x, y, z, r: 2.0 * scale, h: 3.2 * scale, flames: 12, size: 1.1 * scale });

const noHero = (_type: string) => false;

/** How tall its hover and click target stands in HD */
const HORROR_HIT_HEIGHT = 9;

function WorldMapContent({
  kingdoms,
  world,
  rovingNPCs = NO_NPCS,
  horrorNPCs = NO_NPCS,
  nodeStatuses = NO_STATUSES,
  bossStatuses = NO_BOSSES,
  npcKingdomStatuses = NO_NPC_KINGDOMS,
  spires = [],
  activeMarches = [],
  hideTooltips = false,
  worldFocusRequest,
  homeKingdomId,
  onEnterKingdom,
  onSelectKingdom,
  onSelectNPC,
  onSelectSpire,
  onOpenDevProfile,
  onLoadingChange
}: FlatWorldMap3DProps & { world: BuiltWorld }) {
  // HD graphics: hero models (the Archon's Empyrean) take the place of their map kit, once their chunk has loaded
  const hdm = useHdModels(useHd("heroes"));
  const heroes = !!hdm;
  const isBatchedHero = hdm?.isBatchedHero ?? noHero;
  const isBossHero = hdm?.isBossHero ?? noHero;
  // HD graphics: textured ground and swaying grass near the camera (normal quality keeps the plain smooth ground)
  const hdTerrain = useHd("terrain");
  const hdWater = useHd("water");
  const hdScatter = useHd("scatter");
  const hdModels = useHd("models");
  const ground = useMemo(() => terrainMaterial(hdTerrain), [hdTerrain]);
  useEffect(() => () => ground.material.dispose(), [ground]);
  useFrame(({ clock }) => ground.tick(clock.elapsedTime));
  const [hoveredKingdomId, setHoveredKingdomId] = useState<string | null>(null);
  const inspectedKingdomId = worldFocusRequest?.kingdomId ?? null;
  const { worldMap, terrain, terrainGeometry, terrainNPCs, scatter } = world;
  const placements = useMemo(() => worldMap?.kingdomPlacements || {}, [worldMap]);
  const openSpires = useMemo(() => (spires || []).filter((sp) => !sp.occupiedByDevId), [spires]);

  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void; addEventListener?: (e: string, cb: () => void) => void; removeEventListener?: (e: string, cb: () => void) => void } | null;
  const flyTo = useRef<{ target: THREE.Vector3; cam: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!worldFocusRequest) return;
    const { x, z } = worldFocusRequest;
    const y = terrain.height(x, z);
    flyTo.current = {
      target: new THREE.Vector3(x, y, z),
      cam: new THREE.Vector3(x, y + 32, z + 36)
    };
  }, [worldFocusRequest, terrain]);

  useEffect(() => {
    if (!controls?.addEventListener) return;
    const cancel = () => {
      flyTo.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener?.("start", cancel);
  }, [controls]);

  // The loader goes once this world's shaders are compiled and its first frames are on screen (CompileGate)
  const shown = useCallback(() => onLoadingChange?.(false), [onLoadingChange]);
  // Coming back with the world cached, the loader still covers the mount and the compile
  useEffect(() => onLoadingChange?.(true), [onLoadingChange]);
  useFrame(() => {
    const f = flyTo.current;
    if (f && controls) {
      controls.target.lerp(f.target, 0.09);
      camera.position.lerp(f.cam, 0.09);
      if (camera.position.distanceTo(f.cam) < 0.3) flyTo.current = null;
    }
  });

  useRefreshHtmlLabelsInDev();

  // Rotation day: rising and crumbling landmarks move on in steps (LANDMARK_STEPS a day), checked once a minute; the
  // models (and the shadow map) are rebuilt only when a step changes
  const [landmarkClock, setLandmarkClock] = useState(() => Date.now());
  const rotating = (worldMap?.npcs ?? []).some((n) => n.landmarkState);
  useEffect(() => {
    if (!rotating) return;
    const id = setInterval(() => setLandmarkClock(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [rotating]);
  const landmarkSteps = (worldMap?.npcs ?? [])
    .filter((n) => n.landmarkState)
    .map((n) => landmarkStepOf(n.landmarkState!, landmarkClock))
    .join(",");

  const mapNPCs = useMemo(() => {
    const steps = landmarkSteps ? landmarkSteps.split(",").map(Number) : [];
    let i = 0;
    return (worldMap?.npcs ?? []).map((n) => (n.landmarkState ? { ...n, landmarkStep: steps[i++] } : n));
  }, [worldMap, landmarkSteps]);
  // An emptied resource node is gone for everyone until the next day's nodes
  const staticNPCs = useMemo(() => [...mapNPCs.filter((n) => !nodeStatuses[n.id]?.emptied), ...terrainNPCs, ...horrorNPCs], [mapNPCs, terrainNPCs, nodeStatuses, horrorNPCs]);
  const allNPCs = useMemo(() => [...staticNPCs, ...rovingNPCs], [staticNPCs, rovingNPCs]);
  // Islets under land NPCs over water: drawn with the rings, and stood on by armies working or fighting there
  const islets = useMemo(() => isletsOf(allNPCs, terrain), [allNPCs, terrain]);
  // Buffer realms, landmarks and gates never empty, so their batch only rebuilds with the map, a rotation step or a fire
  // HD: the legendary landmarks are hero models of their own (HeroMount) and leave the batch
  const batchedStatic = useMemo(() => mapNPCs.filter((n) => isBatchedStatic(n) && !(heroes && isBatchedHero(n.type))), [mapNPCs, heroes, isBatchedHero]);
  // Resource nodes, caches and wild sights: rebuilt when one is emptied (keyed so polls don't rebuild)
  const emptiedKey = mapNPCs
    .filter((n) => nodeStatuses[n.id]?.emptied)
    .map((n) => n.id)
    .sort()
    .join(",");
  const batchedSites = useMemo(() => {
    const emptied = new Set(emptiedKey ? emptiedKey.split(",") : []);
    return [...mapNPCs, ...terrainNPCs].filter((n) => isBatchedSite(n) && !emptied.has(n.id));
  }, [mapNPCs, terrainNPCs, emptiedKey]);
  // NPCs being fought over right now, with the side the attackers come from (keyed so polls don't rebuild)
  // Who each fought target faces: the army it is striking, and when that one falls, the next
  updateBattleRings(activeMarches);
  const combatKey = activeMarches
    .filter((m) => m.phase === "acting" && !m.gather && m.kind !== "scout" && (!m.battleFrontId || m.battleFrontId === m.id))
    .map((m) => {
      const p = ringFacing(m);
      return `${m.targetId}@${Math.round(p.x)},${Math.round(p.z)}`;
    })
    .sort()
    .join("|");
  const combat = useMemo(() => {
    const map = new Map<string, { x: number; z: number }>();
    for (const entry of combatKey ? combatKey.split("|") : []) {
      const [id, pos] = entry.split("@");
      const [x, z] = pos.split(",").map(Number);
      if (!map.has(id)) map.set(id, { x, z });
    }
    return map;
  }, [combatKey]);
  // Buffer realms and frontier gates whose walls burn (keyed so polls don't rebuild)
  const burningKey = Object.entries(npcKingdomStatuses)
    .filter(([, st]) => st.burning)
    .map(([id]) => id)
    .sort()
    .join(",");
  const burningNpcs = useMemo(() => new Set(burningKey ? burningKey.split(",") : []), [burningKey]);
  // Each NPC kingdom's donor civilization: its soldiers' look (keyed so polls don't rebuild the figures)
  const realmCivKey = Object.entries(npcKingdomStatuses)
    .map(([id, st]) => `${id}=${st.civ}`)
    .sort()
    .join(",");
  const realmCivs = useMemo(() => new Map(realmCivKey ? realmCivKey.split(",").map((e) => e.split("=") as [string, CivilizationType]) : []), [realmCivKey]);
  // Every Builder-modelled roving spawn and persistent site in one batch (one instanced mesh per shape)
  // Kept across a city visit (keyed by what they are built from), so coming back to the map doesn't build them again
  const staticModels = useMemo(
    () => remembered("static", [worldMap, landmarkSteps, heroes, terrain, burningKey], () => npcModelParts(batchedStatic, terrain, { ruined: burningNpcs })),
    [batchedStatic, terrain, burningNpcs, worldMap, landmarkSteps, heroes, burningKey]
  );
  const rovingParts = useMemo(() => remembered("roving", [rovingNPCs, terrain], () => npcModelParts(rovingNPCs, terrain, { roving: true }).parts), [rovingNPCs, terrain]);
  const siteModels = useMemo(
    () => remembered("sites", [worldMap, landmarkSteps, terrainNPCs, emptiedKey, terrain], () => npcModelParts(batchedSites, terrain, { sites: true })),
    [batchedSites, terrain, worldMap, landmarkSteps, terrainNPCs, emptiedKey]
  );
  const npcParts = useMemo(() => [...staticModels.parts, ...siteModels.parts, ...rovingParts], [staticModels, siteModels, rovingParts]);
  // Bandits, packs, herds, workers and villagers going about their business around the NPCs (fighting when attacked);
  // a broken gate's guards are gone
  const lifeActors = useMemo(
    () =>
      buildNpcLife(
        allNPCs.filter((n) => !(burningNpcs.has(n.id) && GATE_MODEL_TYPES.has(n.type))),
        (n) => npcFootprint(n.type, n.realm?.stage) * tierScaleOf(n),
        // A sea realm's soldiers walk its jetty
        (n) => !(n.realm && WATER_REALM_TYPES.has(n.type)) && (WATER_LANDMARK_TYPES.has(n.type) || needsIslet(n, terrain) || terrain.height(n.x, n.z) < SEA_LEVEL + 0.15),
        combat,
        (n) => realmCivs.get(n.id)
      ),
    [allNPCs, terrain, combat, burningNpcs, realmCivs]
  );

  // Roving spawns arrive after the scatter was built: hide the trees and rocks standing where they appear. A burning
  // gate's border wall lies broken either side of it: knocked down to charred stumps and rubble
  // The season colours the land and the trees (once a week; the Voidrift and the deserts keep theirs)
  const season = useRealmSeason();
  const seasonalScatter = useMemo(() => seasonParts(scatter.parts, season, new Set(), WORLD_FOLIAGE), [scatter, season]);
  useMemo(() => seasonTerrain(terrainGeometry, terrain.weights, SEA_LEVEL, season), [terrainGeometry, terrain, season]);
  const visibleScatter = useMemo(() => {
    let parts = seasonalScatter;
    if (rovingNPCs.length) {
      const clear = rovingNPCs.map((n) => ({ x: n.x, z: n.z, r: npcFootprint(n.type, n.realm?.stage) * tierScaleOf(n) + 0.8 }));
      parts = parts.filter((p) => clear.every((c) => Math.hypot(p.x - c.x, p.z - c.z) > c.r));
    }
    for (const g of staticNPCs) {
      if (!burningNpcs.has(g.id) || !GATE_MODEL_TYPES.has(g.type)) continue;
      const wall = gateWallPoints(g.type, g.x, g.z, 1).filter((p) => Math.hypot(p.x - g.x, p.z - g.z) < GATE_BREACH);
      const onWall = (p: { x: number; z: number }) => Math.hypot(p.x - g.x, p.z - g.z) < GATE_BREACH + 1 && wall.some((w) => Math.hypot(p.x - w.x, p.z - w.z) < 1.3);
      const broken = parts.filter(onWall);
      parts = [...parts.filter((p) => !onWall(p)), ...breakDown(`${g.id}:wall`, broken, (p) => terrain.height(p.x, p.z))];
    }
    return parts;
  }, [seasonalScatter, rovingNPCs, staticNPCs, burningNpcs, terrain]);

  // Frontier gates after dark: a glow round every brazier, torch and lantern (a burning gate has its own fire)
  const gateHalos = useMemo<HaloPoint[]>(() => {
    const out: HaloPoint[] = [];
    for (const g of staticNPCs) {
      if (!GATE_MODEL_TYPES.has(g.type) || burningNpcs.has(g.id)) continue;
      const s = tierScaleOf(g);
      const y = npcY(g, terrain);
      for (const p of buildNPCModel(g)) {
        // Lights that stay put (orbiting wisps fly off their spot)
        if (!p.glow || p.idle?.kind === IDLE_KIND.spin) continue;
        out.push({ x: g.x + p.x * s, y: y + p.y * s, z: g.z + p.z * s, size: Math.max(p.w, p.h) * s * 3.2, color: p.color });
      }
    }
    return out;
  }, [staticNPCs, burningNpcs, terrain]);

  const sceneFog = useThree((s) => s.scene.fog);

  // Coming back from a city: frame the whole realm again (cities may have pushed the fog back)
  useEffect(() => {
    if (sceneFog instanceof THREE.Fog) {
      sceneFog.near = 95;
      sceneFog.far = 315;
    }
    if (!controls) return;
    controls.target.set(0, 0, 0);
    camera.position.set(0, 100, 112);
    controls.update();
  }, [controls, camera, sceneFog]);

  const castles = useMemo<CastlePlacement[]>(
    () =>
      kingdoms.map((k) => {
        const pos = placements[k.id] || { x: 0, z: 0 };
        const st = castleStage(k.cityHallLevel);
        return {
          id: k.id,
          civilization: k.civilization,
          x: pos.x,
          y: terrain.height(pos.x, pos.z),
          z: pos.z,
          scale: castleScaleFor(k),
          stage: st.index,
          level: k.cityHallLevel,
          empyrean: Boolean(k.isArchon)
        };
      }),
    [kingdoms, placements, terrain]
  );
  const heroCastles = useMemo(() => castles.filter((c) => c.empyrean), [castles]);
  // HD: the batched heroes (legendary landmarks, the Nethergarde Core, the legendary sites and the Relic Hoard among the
  // roving treasure) standing on the map, at their map scale. Keyed, so a poll that changes nothing about them never
  // rebuilds their batch
  const heroSiteKey = useMemo(
    () =>
      heroes
        ? JSON.stringify(allNPCs.filter((n) => isBatchedHero(n.type)).map((n): HeroSite => ({ id: n.id, type: n.type, x: n.x, y: npcY(n, terrain), z: n.z, scale: tierScaleOf(n) })))
        : "[]",
    [heroes, allNPCs, terrain, isBatchedHero]
  );
  const heroSites = useMemo<HeroSite[]>(() => JSON.parse(heroSiteKey), [heroSiteKey]);
  // HD: the world bosses (and a legendary creature such as the Bandit King, fixed or roving) standing on the map, as
  // rigged heroes (keyed the same way)
  const bossSiteKey = useMemo(
    () => (heroes ? JSON.stringify(allNPCs.filter((n) => isBossHero(n.type)).map((n): HeroSite => ({ id: n.id, type: n.type, x: n.x, y: npcY(n, terrain), z: n.z }))) : "[]"),
    [heroes, allNPCs, terrain, isBossHero]
  );
  const bossSites = useMemo<HeroSite[]>(() => JSON.parse(bossSiteKey), [bossSiteKey]);
  // What each is doing: turned on the armies fighting it, or a phantom rising where the last one fell
  const bossLive = useMemo(() => {
    const live: Record<string, BossLive> = {};
    for (const n of allNPCs) {
      if (!isBossHero(n.type)) continue;
      const f = combat.get(n.id);
      live[n.id] = { fightYaw: f ? Math.atan2(f.x - n.x, f.z - n.z) : null, slumbering: n.category === "boss" && n.slumberUntil !== undefined };
    }
    return live;
  }, [allNPCs, combat, isBossHero]);
  // HD: Xal'Vorath as its hand-built model, every one out in the realm (the server allows HORROR.MAX_TARGETS at once).
  // Keyed, so a poll that changes nothing about them never touches it
  const heroHorrorKey = useMemo(
    () =>
      heroes
        ? JSON.stringify(
            horrorNPCs.map((n): HorrorPlacement => {
              const foe = combat.get(n.id);
              const seed = horrorSeed(n.id);
              return {
                id: n.id,
                x: n.x,
                y: npcY(n, terrain),
                z: n.z,
                action: foe ? "attacking" : n.horrorPhase === "siege" ? "idle" : "walking",
                yaw: foe ? Math.atan2(foe.x - n.x, foe.z - n.z) : (n.horrorHeading ?? 0),
                offset: seed * 40,
                pace: 0.85 + ((seed * 7) % 1) * 0.3
              };
            })
          )
        : "[]",
    [heroes, horrorNPCs, terrain, combat]
  );
  const heroHorrors = useMemo<HorrorPlacement[]>(() => JSON.parse(heroHorrorKey), [heroHorrorKey]);
  const heroHorrorIds = useMemo(() => new Set(heroHorrors.map((h) => h.id)), [heroHorrors]);
  // Developer castles plus the NPC void kingdoms holding open Voidrift slots
  const allCastles = useMemo<CastlePlacement[]>(
    () => [
      ...castles,
      ...openSpires.map((sp) => ({
        id: sp.id,
        civilization: "arcane" as const,
        x: sp.coordinates[0],
        y: terrain.height(sp.coordinates[0], sp.coordinates[1]),
        z: sp.coordinates[1],
        scale: spireScale(sp),
        stage: castleStage(sp.npcLevel ?? 1).index,
        level: sp.npcLevel
      }))
    ],
    [castles, openSpires, terrain]
  );
  const burningCastleKey = [...kingdoms.filter((k) => k.burning).map((k) => k.id), ...openSpires.filter((sp) => sp.burning).map((sp) => sp.id)].sort().join(",");
  const burningCastles = useMemo(() => new Set(burningCastleKey ? burningCastleKey.split(",") : []), [burningCastleKey]);

  // The rarity ladder: rare+ NPCs shine by tier (bosses and rigged treasure have their own aura), Wonder castles are
  // legendary-class and the Archon's Empyrean mythic-class
  const tierItems = useMemo<TierFxItem[]>(() => {
    const out: TierFxItem[] = [];
    for (const n of allNPCs) {
      // Burning walls: the curtain of fire-light (epic) in place of its own tier
      if (burningNpcs.has(n.id)) {
        const gate = GATE_MODEL_TYPES.has(n.type);
        out.push({ id: `${n.id}:fire`, x: n.x, y: npcY(n, terrain), z: n.z, size: gate ? 3.4 : npcFootprint(n.type, n.realm?.stage) * 1.1, ...FIRE_GLOW, height: gate ? 3.2 : undefined });
        continue;
      }
      const tier = fxTierOf(n.rarity);
      // A crumbling landmark has lost its glory: no aura while it falls
      // A hero model (HD) brings its own aura
      if (!tier || hasRig(n.type) || n.type === "ruins-ascended" || n.landmarkState?.phase === "crumbling" || (heroes && isBatchedHero(n.type))) continue;
      const water = WATER_LANDMARK_TYPES.has(n.type);
      // Creatures get no curtain of light round them: only sparkles (and a beam at legendary)
      out.push({ id: n.id, x: n.x, y: npcY(n, terrain), z: n.z, size: npcFootprint(n.type, n.realm?.stage) * tierScaleOf(n), tier, lift: water ? 0.15 : 0, shell: !isCreatureNPC(n.type) });
    }
    for (const c of castles) {
      // The HD Empyrean (HeroMount) brings its own mythic aura
      if (c.empyrean) {
        if (!heroes) out.push({ id: c.id, x: c.x, y: c.y, z: c.z, size: 4.2, tier: "mythical", color: "#dc2626", accent: "#fbbf24", beam: 30 });
      }
      else if ((c.stage ?? 0) >= WONDER_STAGE) out.push({ id: c.id, x: c.x, y: c.y, z: c.z, size: 2.6 * c.scale, tier: "legendary", beam: 18 });
      // Below the Wonder the castle climbs the ladder too: a Palace is epic-class, a Citadel rare-class
      else if (c.stage === PALACE_STAGE) out.push({ id: c.id, x: c.x, y: c.y, z: c.z, size: 2.3 * c.scale, tier: "epic" });
      else if (c.stage === CITADEL_STAGE) out.push({ id: c.id, x: c.x, y: c.y, z: c.z, size: 2.1 * c.scale, tier: "rare" });
    }
    // A burning castle stands in a curtain of fire-light (a Wonder or the Empyrean keeps its own, higher kit)
    for (const c of allCastles) {
      if (burningCastles.has(c.id) && !c.empyrean && (c.stage ?? 0) < WONDER_STAGE) out.push({ id: `${c.id}:fire`, x: c.x, y: c.y, z: c.z, size: 2.1 * c.scale, ...FIRE_GLOW, height: 3.2 * c.scale });
    }
    return out;
  }, [allNPCs, castles, allCastles, terrain, burningNpcs, burningCastles, heroes, isBatchedHero]);

  // Burning walls: fire on castles, Voidrift NPC kingdoms, buffer realms and frontier gates (a gate's border wall
  // burns either side of the breach)
  const fireSites = useMemo<FireSite[]>(() => {
    const out: FireSite[] = [];
    for (const c of allCastles) if (burningCastles.has(c.id)) out.push(castleFire(c.id, c.x, c.y, c.z, c.scale));
    for (const n of allNPCs) {
      if (!burningNpcs.has(n.id)) continue;
      const y = npcY(n, terrain);
      if (!GATE_MODEL_TYPES.has(n.type)) {
        out.push({ id: `fire-${n.id}`, x: n.x, y, z: n.z, r: npcFootprint(n.type, n.realm?.stage), h: 2.6, flames: 11 });
        continue;
      }
      out.push({ id: `fire-${n.id}`, x: n.x, y, z: n.z, r: 2.9, h: 1.2, flames: 13, plumes: 2 });
      const wall = gateWallPoints(n.type, n.x, n.z, 2.4)
        .map((p) => ({ ...p, d: Math.hypot(p.x - n.x, p.z - n.z) }))
        .filter((p) => p.d < GATE_BREACH)
        .sort((a, b) => a.d - b.d);
      wall.forEach((p, i) => out.push({ id: `fire-${n.id}-w${i}`, x: p.x, y: terrain.height(p.x, p.z), z: p.z, r: 0.9, h: 0.9, flames: 3, plumes: i < 2 ? 1 : 0 }));
    }
    return out;
  }, [allCastles, burningCastles, allNPCs, burningNpcs, terrain]);

  // Terrain and castles never move, so the shadow map is drawn once per layout instead of every frame
  // (a boss falling or waking changes staticNPCs: its phantom casts no shadow)
  useStaticShadows([terrain, allCastles, visibleScatter, rovingNPCs, staticNPCs, burningNpcs, hdModels, heroes]);

  // 🛡️ Royal Shield domes and ⛈️ punishment storms over castles (re-checked every minute so they vanish when they end)
  const [decreeClock, setDecreeClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setDecreeClock(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { domes, storms, stormGlow } = useMemo(() => {
    const domes: DomeSpec[] = [];
    const storms: CloudSpec[] = [];
    const stormGlow: TierFxItem[] = [];
    for (const c of castles) {
      const k = kingdoms.find((x) => x.id === c.id);
      if (!k) continue;
      if (activeShield(k, decreeClock)) domes.push({ x: c.x, y: c.y, z: c.z, r: 3.4 * c.scale });
      const p = activePunishment(k, decreeClock);
      if (!p) continue;
      storms.push({ x: c.x, y: c.y + 8.5 * c.scale, z: c.z, r: 3.2 * c.scale, groundY: c.y, crows: p.highDeath });
      // The castle stands in a curtain of storm light (a burning castle, a Wonder or the Empyrean keeps its own kit)
      if (!burningCastles.has(c.id) && !c.empyrean && (c.stage ?? 0) < WONDER_STAGE) stormGlow.push({ id: `${c.id}:storm`, x: c.x, y: c.y, z: c.z, size: 2.1 * c.scale, ...STORM_GLOW, height: 3.6 * c.scale });
    }
    return { domes, storms, stormGlow };
  }, [castles, kingdoms, decreeClock, burningCastles]);
  // 🎉 Festivals: fireworks over the castle (one draw call for every festival in the realm)
  const festivalKey = kingdoms
    .filter((k) => festivalLeft(k, decreeClock) > 0)
    .map((k) => k.id)
    .sort()
    .join(",");
  const fireworks = useMemo<FireworkSite[]>(() => {
    const ids = new Set(festivalKey ? festivalKey.split(",") : []);
    return castles.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z, scale: 1.6 * c.scale, height: 4.5 }));
  }, [castles, festivalKey]);
  // Who is online: the ruler's castle stands in a white curtain of light, like a boss rising (a punished castle keeps
  // its storm light, a burning one its fire, a Wonder or the Empyrean its own kit)
  const online = useOnlineIds();
  const onlineGlow = useMemo(() => {
    const out: TierFxItem[] = [];
    for (const c of castles) {
      if (!online.has(c.id) || burningCastles.has(c.id) || c.empyrean || (c.stage ?? 0) >= WONDER_STAGE) continue;
      const k = kingdoms.find((x) => x.id === c.id);
      if (k && activePunishment(k, decreeClock)) continue;
      out.push({ id: `${c.id}:online`, x: c.x, y: c.y, z: c.z, size: 2.1 * c.scale, ...ONLINE_GLOW, height: 3.6 * c.scale });
    }
    return out;
  }, [castles, kingdoms, online, decreeClock, burningCastles]);
  const allTierItems = useMemo(() => (stormGlow.length || onlineGlow.length ? [...tierItems, ...stormGlow, ...onlineGlow] : tierItems), [tierItems, stormGlow, onlineGlow]);

  const homeCastle = castles.find((c) => c.id === homeKingdomId);
  // 🪙 The signed-in ruler's civilization: its legendary landmark is their Mercenary Camp
  const homeCiv = kingdoms.find((k) => k.id === homeKingdomId)?.civilization ?? null;
  const inspectedCastle = castles.find((c) => c.id === inspectedKingdomId);

  const labels = useMemo(() => {
    if (!worldMap) return [];
    return [
      ...Object.values(worldMap.provinces).map((p) => ({ key: p.civilization, name: p.name, x: p.centerX, z: p.centerZ, major: true })),
      ...worldMap.bufferZones.map((bz) => ({ key: bz.id, name: bz.name, x: bz.x, z: bz.z, major: false }))
    ];
  }, [worldMap]);

  return (
    <CompileGate token={world} onReady={shown}>
      {/* ================================================================= */}
      {/* 1. TABLETOP RIM + OCEAN                                           */}
      {/* ================================================================= */}
      <BoardRim hd={hdScatter} />
      {/* The sea and Valoria's river: shallows, shore foam, the river's current and glints (one draw call) */}
      <Water terrain={terrain} hd={hdWater} />

      {/* ================================================================= */}
      {/* 2. THE CONTINENT                                                  */}
      {/* ================================================================= */}
      <mesh geometry={terrainGeometry} material={ground.material} receiveShadow castShadow />
      {hdTerrain && <Grass terrain={terrainGeometry} season={season} />}
      <InstancedParts parts={visibleScatter} hd={hdScatter} cull />
      <NightHalos points={gateHalos} />

      {worldMap && (
        <ArcaneRift province={worldMap.provinces.arcane} floorY={terrain.height(worldMap.provinces.arcane.centerX + 5, worldMap.provinces.arcane.centerZ)} />
      )}
      <MapVoidGate terrain={terrain} hd={hdModels} label={!hideTooltips} />

      {/* Region names */}
      {!hideTooltips &&
        labels.map((l) => (
          <Html zIndexRange={[15, 0]}
            key={l.key}
            position={[l.x, terrain.height(l.x, l.z) + (l.major ? 9 : 6), l.z]}
            center
            distanceFactor={l.major ? 90 : 70}
            style={{ pointerEvents: "none" }}
          >
            <div
              className={`select-none whitespace-nowrap font-medieval tracking-widest uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${
                l.major ? "text-amber-200/80 text-2xl" : "text-sky-100/60 text-lg italic"
              }`}
            >
              {l.name}
            </div>
          </Html>
        ))}

      {/* ================================================================= */}
      {/* 3. INTERACTIVE 3D WORLD NPCS                                      */}
      {/* ================================================================= */}
      <NPCRings npcs={allNPCs} terrain={terrain} islets={islets} bossStatuses={bossStatuses} nodeStatuses={nodeStatuses} />
      <NpcLife actors={lifeActors} terrain={terrain} />
      {/* All roving encounters, buffer realms, landmarks, gates, resource nodes, caches and wild sights in one batch (one instanced mesh per shape) */}
      <InstancedParts parts={npcParts} kit={hdModels} cull />
      {rovingNPCs.map((npc) => (
        <MapNPC3D
          key={npc.id}
          npc={npc}
          y={npcY(npc, terrain)}
          node={nodeStatuses[npc.id]}
          batched={!hasRig(npc.type) || (heroes && (isBatchedHero(npc.type) || isBossHero(npc.type)))}
          hitHeight={hdm?.heroHeight(npc.type)}
          hideTooltips={hideTooltips}
          onSelect={() => onSelectNPC && onSelectNPC(npc)}
        />
      ))}
      {staticNPCs.map((npc) => (
        <MapNPC3D
          key={npc.id}
          npc={npc}
          y={npcY(npc, terrain)}
          boss={bossStatuses[npc.id]}
          node={nodeStatuses[npc.id]}
          fighting={combat.get(npc.id)}
          burning={burningNpcs.has(npc.id)}
          camp={isOwnCamp(npc.id, homeCiv)}
          batched={staticModels.heights.has(npc.id) || siteModels.heights.has(npc.id) || (heroes && (isBatchedHero(npc.type) || isBossHero(npc.type))) || heroHorrorIds.has(npc.id)}
          hitHeight={staticModels.heights.get(npc.id) ?? siteModels.heights.get(npc.id) ?? (heroHorrorIds.has(npc.id) ? HORROR_HIT_HEIGHT : hdm?.heroHeight(npc.type))}
          hideTooltips={hideTooltips}
          onSelect={() => onSelectNPC && onSelectNPC(npc)}
        />
      ))}

      {/* ================================================================= */}
      {/* 3b. NPC VOID KINGDOMS + ARMIES ON THE MARCH                       */}
      {/* ================================================================= */}
      {openSpires.map((spire) => (
        <VoidNpcCitadel
          key={spire.id}
          spire={spire}
          y={terrain.height(spire.coordinates[0], spire.coordinates[1])}
          hideTooltips={hideTooltips}
          onSelect={() => onSelectSpire?.(spire)}
        />
      ))}
      <WarParties marches={activeMarches} terrain={terrain} islets={islets} hideTooltips={hideTooltips} BandBatch={hdm?.BandMarches} />
      {/* Castles changing civilization teleport to their new province */}
      <TeleportFlashes castles={castles} marches={activeMarches} terrain={terrain} />

      {/* ================================================================= */}
      {/* 4. DEVELOPER KINGDOM CASTLES                                      */}
      {/* ================================================================= */}
      {/* Every castle model, drawn with one instanced mesh per castle part */}
      <WorldCastles castles={allCastles} hoveredId={hoveredKingdomId} skipStyles={heroes ? HERO_STYLES : undefined} />
      {/* HD graphics: the Archon's Empyrean as its hand-built HD model (in place of its map kit) */}
      {hdm && (heroCastles.length > 0 || heroSites.length > 0 || bossSites.length > 0 || heroHorrors.length > 0) && <hdm.HeroMount castles={heroCastles} sites={heroSites} bosses={bossSites} bossLive={bossLive} horrors={heroHorrors} />}
      <ShieldDomes domes={domes} />
      <StormClouds clouds={storms} />
      <Fireworks sites={fireworks} hd={hdModels} />
      {/* Rarity effects for every shining NPC and top-class castle (one draw call per effect kind) */}
      <TierFx items={allTierItems} />
      {/* Burning walls: flames, smoke and embers (three draw calls for every fire on the map) */}
      <FireFx sites={fireSites} />
      {homeCastle && <SovereignBeacon x={homeCastle.x} z={homeCastle.z} scale={homeCastle.scale} terrain={terrain} />}
      {inspectedCastle && <InspectionRing x={inspectedCastle.x} z={inspectedCastle.z} scale={inspectedCastle.scale} terrain={terrain} />}

      {kingdoms.map((k) => {
        const pos = placements[k.id] || { x: 0, z: 0 };
        const isHovered = hoveredKingdomId === k.id;
        const isHome = homeKingdomId === k.id;
        const isInspected = inspectedKingdomId === k.id;
        const castleScale = castleScaleFor(k);

        return (
          <group
            key={k.id}
            position={[pos.x, terrain.height(pos.x, pos.z), pos.z]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredKingdomId(k.id);
            }}
            onPointerOut={() => setHoveredKingdomId(null)}
            onClick={(e) => {
              e.stopPropagation();
              sound.playClick();
              if (onSelectKingdom) {
                onSelectKingdom(k);
              } else {
                onEnterKingdom(k.id);
              }
            }}
          >
            {/* Invisible hit box over the castle for hover/click (never rendered) */}
            <mesh
              position={[0, 1.8 * castleScale * (k.isArchon ? 2 : 1), 0]}
              scale={[castleScale, castleScale * (k.isArchon ? 2 : 1), castleScale]}
              geometry={CASTLE_HIT_BOX}
            >
              <meshBasicMaterial visible={false} />
            </mesh>

            {/* Floating Kingdom Badge with User Info */}
            {!hideTooltips && (
              // A hovered or inspected badge stacks above region names and its neighbours, so its details are never covered
              <Html zIndexRange={isHovered || isInspected ? [30, 16] : [15, 0]}
                wrapperClass={isHovered || isInspected ? HTML_HOVER_LAYER : HTML_BASE_LAYER}
                position={[0, (k.isArchon ? 7.6 : 4.4) * castleScale, 0]}
                center
                distanceFactor={48}
                style={{ pointerEvents: "none" }}
              >
                <div
                  className={`relative px-3 py-1.5 rounded-xl border shadow-2xl transition-all duration-200 select-none whitespace-nowrap pointer-events-none ${
                    isHovered || isInspected
                      ? "bg-amber-950/95 border-amber-400 text-amber-200 scale-110 ring-2 ring-amber-400/40"
                      : k.burning
                        ? "bg-orange-950/90 border-orange-500/80 text-orange-100 ring-1 ring-orange-500/40"
                        : isHome
                          ? "bg-amber-950/90 border-amber-400/90 text-amber-100 ring-2 ring-amber-300/50"
                          : "bg-slate-900/90 border-slate-700/80 text-slate-200"
                  }`}
                >
                  {isInspected && (
                    // Picked in the kingdom picker: pressing Enter steps into this city
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex flex-col items-center">
                      <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-slate-950/95 border-2 border-amber-400 ring-4 ring-amber-400/25 shadow-2xl shadow-black/70">
                        <kbd className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-sm font-bold font-mono leading-none">⏎</kbd>
                        <span className="font-medieval text-2xl font-bold tracking-widest text-amber-300 leading-none">Enter</span>
                      </div>
                      <span className="text-3xl leading-none text-amber-400 animate-bounce drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">▼</span>
                    </div>
                  )}
                  {isHome && (
                    <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-300 text-center">👑 Home Sovereign</div>
                  )}
                  <div className="flex items-center gap-1.5 font-bold font-medieval text-xs">
                    <span>
                      {k.civilization === "human" && "👑"}
                      {k.civilization === "elf" && "🌸"}
                      {k.civilization === "dwarf" && "⚒️"}
                      {k.civilization === "orc" && "⚔️"}
                      {k.civilization === "arcane" && !k.isArchon && "🔮"}
                      {k.isArchon && <ArchonSeal className="w-4 h-4 inline-block align-[-3px]" />}
                    </span>
                    <span>{k.name}</span>
                    {online.has(k.id) && <span title="Online now" className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />}
                    {k.burning && <span title="Walls burning (≤25% HP)">🔥</span>}
                    {activeShield(k, decreeClock) && <span title={shieldLabel(activeShield(k, decreeClock)!)}>🛡️</span>}
                    {activePunishment(k, decreeClock) && <span title={punishmentLabel(activePunishment(k, decreeClock)!)}>⛈️</span>}
                    {festivalLeft(k, decreeClock) > 0 && <span title={`Festival: ${timeLeftLabel(festivalLeft(k, decreeClock))} left`}>🎉</span>}
                    <span className="text-[10px] text-amber-400 font-mono">
                      (🏰 {k.buildings?.length ?? (k as any).buildingCount ?? 0})
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono text-center">
                    {k.isArchon ? "Archon of the Realm · Empyrean" : k.kingdomTitle}
                  </div>
                  {(isHovered || isInspected) && online.has(k.id) && <div className="text-[9px] text-emerald-300 text-center font-semibold">🟢 Online now</div>}
                  {(isHovered || isInspected) && activeShield(k, decreeClock) && (
                    <div className="text-[9px] text-sky-300 text-center font-semibold">{shieldLabel(activeShield(k, decreeClock)!)}</div>
                  )}
                  {(isHovered || isInspected) && activePunishment(k, decreeClock) && (
                    <div className="text-[9px] text-slate-300 text-center font-semibold">{punishmentLabel(activePunishment(k, decreeClock)!)}</div>
                  )}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </CompileGate>
  );
}
