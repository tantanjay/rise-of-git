import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { CompileGate } from "./CompileGate";
import * as THREE from "three";
import { DeveloperKingdom, RepoBuilding } from "@/types";
import { sound } from "@/hooks/useSound";
import { computeCityLayout, PlotPlacement } from "./city/layout";
import { buildCityScene, cityFestival, cityFire, cityNightActors, barrenActors, cityWallFootprint } from "./city/blueprints";
import { Fireworks, FireworkSite } from "./FestivalFx";
import { festivalLeft, useNow } from "@/components/ui/RoyalProclamations";
import { useHd } from "@/utils/graphics";
import { FireFx } from "./FireFx";
import { InstancedParts } from "./city/InstancedParts";
import { PlotLegendFx } from "./city/PlotLegendFx";
import { Actors } from "./city/Actors";
import { TownHall3D, hallFxItem } from "./city/TownHall3D";
import { castleStage, castleTopY, EMPYREAN_STAGE } from "@/utils/castle";
import { rngFor } from "@/utils/random";
import { useStaticShadows } from "./useStaticShadows";
import { PrestigeStars } from "@/components/ui/PrestigeStars";
import { PALETTES } from "./city/palette";
import { ShieldAura, StormClouds, useStormLighting, CloudSpec } from "./RoyalDecreeFx";
import { activePunishment, activeShield } from "@/components/ui/DecreeChips";
import { useRealmNight, useRealmSeason } from "@/utils/realmTime";
import { useActiveDisasterKind } from "@/utils/disasters";
import { seasonGround, seasonParts } from "@/utils/seasonTint";

interface CityView3DProps {
  kingdom: DeveloperKingdom;
  hideTooltips?: boolean;
  focusRequest?: { id: string; nonce: number } | null;
  onSelectBuilding: (b: RepoBuilding) => void;
  onOpenDevProfile?: () => void;
  /** Called once the city has drawn its first frames (Scene3D shows a loader until then) */
  onReady?: () => void;
}

interface OrbitControlsLike extends THREE.EventDispatcher<{ start: object }> {
  target: THREE.Vector3;
  maxDistance: number;
  update: () => void;
}

export const BUILDING_TYPE_META: Record<RepoBuilding["buildingType"], { label: string; icon: string; color: string }> = {
  residential_commercial: { label: "Homes & Shops", icon: "🏡", color: "text-amber-300" },
  animal_field: { label: "Pasture", icon: "🐑", color: "text-emerald-300" },
  food_field: { label: "Farmland", icon: "🌾", color: "text-lime-300" },
  soldier_building: { label: "Barracks", icon: "🛡️", color: "text-sky-300" }
};

function PlotLabel({ plot }: { plot: PlotPlacement }) {
  const b = plot.building!;
  const meta = BUILDING_TYPE_META[b.buildingType];
  const progress =
    b.nextLevelXp === null ? 100 : Math.round(((b.xp - b.levelXp) / Math.max(1, b.nextLevelXp - b.levelXp)) * 100);

  return (
    <Html zIndexRange={[15, 0]} position={[plot.x, 5.5, plot.z]} center distanceFactor={22} style={{ pointerEvents: "none" }}>
      <div className="bg-slate-950/95 border border-amber-400/80 px-3 py-2 rounded-xl shadow-2xl backdrop-blur-md text-center whitespace-nowrap select-none min-w-[180px]">
        <div className="flex items-center justify-center gap-1.5 text-xs font-bold font-mono text-slate-100">
          <span>{meta.icon}</span>
          <span>{b.name}</span>
          <span className="text-[10px] px-1.5 rounded bg-amber-950 border border-amber-500/50 text-amber-300">Lv.{b.level}</span>
          <PrestigeStars building={b} className="text-[10px]" />
        </div>
        <div className="text-[10px] mt-0.5 flex items-center justify-center gap-1.5">
          <span className={meta.color}>{meta.label}</span>
          <span className="text-slate-500">•</span>
          <span className="text-amber-400 font-mono">{b.commitsPastWeek} commits this week</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-linear-to-r from-amber-500 to-yellow-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-[9px] text-slate-400 font-mono mt-0.5">
          {b.nextLevelXp === null ? `Max level • ${b.xp} XP` : `${b.xp} / ${b.nextLevelXp} XP to Lv.${b.level + 1}`}
        </div>
        {b.condition === "idle" ? (
          <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">💤 Dormant — no commits for 90+ days</div>
        ) : (
          <div className="text-[9px] text-amber-300 font-semibold uppercase tracking-wider mt-0.5">🚩 Active — banner raised</div>
        )}
      </div>
    </Html>
  );
}

function PlotHighlight({ plot }: { plot: PlotPlacement }) {
  const h = plot.size / 2;
  return (
    <group position={[plot.x, 0.2, plot.z]}>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, 0, s * h]}>
            <boxGeometry args={[plot.size + 0.2, 0.08, 0.16]} />
            <meshBasicMaterial color="#fbbf24" toneMapped={false} />
          </mesh>
          <mesh position={[s * h, 0, 0]}>
            <boxGeometry args={[0.16, 0.08, plot.size + 0.2]} />
            <meshBasicMaterial color="#fbbf24" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Mounts the city behind a loader: creating its meshes, merging the town hall and compiling shaders
 * blocks the page for a moment (longer on slow machines), so the loader is painted first.
 * Keyed by kingdom id in Scene3D, so each kingdom switch goes through this once.
 */
export function CityView3D(props: CityView3DProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Give the browser a moment to paint the loader before the blocking build
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);
  return ready ? <CityContent {...props} /> : null;
}

function CityContent({ kingdom, hideTooltips = false, focusRequest, onSelectBuilding, onOpenDevProfile, onReady }: CityView3DProps) {
  const civ = kingdom.civilization;
  const castle = castleStage(kingdom.cityHallLevel);
  const pal = PALETTES[civ];
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredTownHall, setHoveredTownHall] = useState(false);
  const flyTo = useRef<{ target: THREE.Vector3; cam: THREE.Vector3 } | null>(null);

  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsLike | null;
  const sceneFog = useThree((s) => s.scene.fog);

  const layout = useMemo(() => computeCityLayout(kingdom.buildings || [], kingdom.vacantPlots || []), [kingdom]);
  const builtScene = useMemo(() => buildCityScene(kingdom, layout), [kingdom, layout]);
  // The season colours the grass and the trees (the Voidrift stands outside the seasons)
  const realmSeason = useRealmSeason();
  const season = civ === "arcane" ? null : realmSeason;
  const scene = useMemo(() => {
    if (!season) return builtScene;
    const ground = new Set([pal.grass, pal.yard].map((c) => c.toLowerCase()));
    const foliage = new Set([pal.foliage, pal.foliage2].map((c) => c.toLowerCase()));
    return { ...builtScene, parts: seasonParts(builtScene.parts, season, ground, foliage), detail: seasonParts(builtScene.detail, season, ground, foliage) };
  }, [builtScene, season, pal]);
  // After dark most townsfolk go indoors, children sleep, and the night watch walks the roads with lights
  const night = useRealmNight();
  // 🎉 Festival: bunting and lanterns over the plaza, dancers round the fountain, fireworks over the castle
  // (re-checked every minute, so it all goes when the Festival ends)
  const now = useNow(60_000);
  const festive = festivalLeft(kingdom, now) > 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when the festival, the civ or the fountain changes
  const festival = useMemo(() => (festive ? cityFestival(kingdom) : null), [festive, kingdom.id, kingdom.civilization, kingdom.upgrades?.plaza]);
  // The shells grow with the city, so they read from the camera that frames it
  const fireworks = useMemo<FireworkSite[]>(
    () => (festive ? [{ id: `city:${kingdom.id}`, x: 0, y: 0, z: 4, scale: Math.max(1.6, layout.half * 0.12), height: 5 }] : []),
    [festive, kingdom.id, layout.half]
  );
  const hdModels = useHd("models");
  // 🥀 Under the Barren Spell the streets empty
  const barren = useActiveDisasterKind() === "barren";
  const actors = useMemo(() => {
    const day = night ? cityNightActors(kingdom, layout, scene.actors) : scene.actors;
    const base = barren ? barrenActors(day) : day;
    return festival ? [...base, ...festival.actors] : base;
  }, [night, barren, kingdom, layout, scene.actors, festival]);
  const grass = useMemo(() => (season ? seasonGround(pal.grass, season) : pal.grass), [season, pal]);
  // The town hall stands at (0, 0.06, -3): its Wonder / Empyrean kit joins the plots' batch
  // Burning walls: fire along the walls, on a share of the houses and the town hall (each house in fire-light)
  const burning = Boolean(kingdom.burning);
  const fire = useMemo(() => (burning ? cityFire(kingdom, layout, castleTopY(kingdom.cityHallLevel)) : null), [burning, kingdom, layout]);
  // In HD the Archon's hall is the Empyrean's hero model, which brings its own mythic aura
  const heroHall = useHd("castles") && castleStage(kingdom.cityHallLevel).index === EMPYREAN_STAGE;
  const hallFx = useMemo(() => {
    const it = heroHall ? null : hallFxItem(kingdom.cityHallLevel, 0, 0.06, -3);
    return [...(it ? [it] : []), ...(fire?.glow ?? [])];
  }, [kingdom.cityHallLevel, fire, heroHall]);

  // Buildings never move (townsfolk cast no shadows), so the shadow map is drawn once per layout
  useStaticShadows([scene, civ, kingdom.cityHallLevel, kingdom.cityHallPrestige, heroHall]);

  const outerGround = useMemo(() => `#${new THREE.Color(grass).multiplyScalar(0.7).getHexString()}`, [grass]);

  // Let the camera zoom out far enough to see big cities (and keep the fog behind them)
  useEffect(() => {
    if (controls) controls.maxDistance = Math.max(45, layout.half * 3.2);
    if (sceneFog instanceof THREE.Fog) {
      sceneFog.near = Math.max(80, layout.half * 2.5);
      sceneFog.far = Math.max(260, layout.half * 6);
    }
  }, [controls, layout.half, sceneFog]);

  // Frame the whole city when entering a kingdom
  useEffect(() => {
    if (!controls) return;
    flyTo.current = null;
    controls.target.set(0, 0, 2);
    camera.position.set(0, Math.max(22, layout.half * 1.5), Math.max(26, layout.half * 1.7));
    controls.update();
    setFocusedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kingdom.id, controls]);

  // Fly to a building picked from the city directory
  useEffect(() => {
    if (!focusRequest) return;
    const plot = layout.plots.find((p) => p.building?.id === focusRequest.id);
    if (!plot) return;
    setFocusedId(focusRequest.id);
    flyTo.current = {
      target: new THREE.Vector3(plot.x, 0, plot.z),
      cam: new THREE.Vector3(plot.x, 10 + plot.size * 0.7, plot.z + 10 + plot.size * 0.7)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // Dragging the camera cancels any fly-to in progress
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      flyTo.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame(() => {
    const f = flyTo.current;
    if (!f || !controls) return;
    controls.target.lerp(f.target, 0.08);
    camera.position.lerp(f.cam, 0.08);
    if (camera.position.distanceTo(f.cam) < 0.15) flyTo.current = null;
  });

  // 🛡️ Royal Shield: an energy curtain rising round the outer walls, tracing their outline; ⛈️ punishment: a ring of storm clouds, rain and lightning,
  // with the sky darkened (the lights dim; lightning brightens the ambient light for a moment)
  const shielded = Boolean(activeShield(kingdom));
  const punishment = activePunishment(kingdom);
  const shieldOutline = useMemo(() => (shielded ? cityWallFootprint(kingdom, layout) : null), [shielded, kingdom, layout]);
  const cityStorm = useMemo<CloudSpec[]>(() => {
    if (!punishment) return [];
    // Storm clouds scattered over the countryside round the city (seeded per kingdom): some huddle close to the walls,
    // some hang far out, at uneven heights and sizes with uneven gaps, so they never line up in a ring.
    // An overcast above the camera rains on the streets.
    const r = rngFor(`storm-banks:${kingdom.id}`);
    const banks: CloudSpec[] = [];
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2;
      const d = layout.half * (1.1 + r() * 1.1) + 4;
      banks.push({ x: Math.cos(a) * d, y: 11 + r() * 12, z: Math.sin(a) * d, r: 3.5 + r() * 5.5, groundY: 0, drops: 70, stretch: 1.2 + r() * 1.4 });
    }
    return [...banks, { x: 0, y: 34, z: 2, r: layout.half * 1.05, groundY: 0, hidden: true, drops: 2600 }];
  }, [punishment, layout.half, kingdom.id]);
  const onFlash = useStormLighting(Boolean(punishment));

  const highlighted = layout.plots.find((p) => p.building && (p.building.id === hoveredId || p.building.id === focusedId));

  // The loader goes once the city's shaders are compiled and its first frames are on screen
  return (
    <CompileGate onReady={onReady}>
      {/* Ground: city land + surrounding countryside */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[layout.half * 6, layout.half * 6]} />
        <meshStandardMaterial color={outerGround} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[layout.half * 2, layout.half * 2]} />
        <meshStandardMaterial color={grass} roughness={0.95} />
      </mesh>

      {/* Roads, plots, buildings, trees */}
      {/* HD: the improvements, the forest ring and every plot (pads, structures, dressing) through the model kit.
          Flowers and props ride the same batches, hidden when zoomed far out. Zoomed in, the heaviest HD batches draw
          only their chunks in view */}
      <InstancedParts parts={scene.parts} detail={scene.detail} detailDistance={90} kit={hdModels ? "tagged" : false} chunk={24} />

      {/* People and animals — hidden when zoomed far out */}
      <Actors actors={actors} lodDistance={90} />

      {/* Beams over ★★★★ buildings; the rarity kit for red-star and Celestial plots and a Wonder / Empyrean hall (instanced) */}
      <PlotLegendFx fx={scene.fx} extra={hallFx} />

      {fire && <FireFx sites={fire.sites} />}

      {festival && <InstancedParts parts={festival.parts} shadows={false} kit={hdModels} />}
      <Fireworks sites={fireworks} hd={hdModels} />

      {shieldOutline && <ShieldAura outline={shieldOutline} height={Math.min(28, Math.max(12, layout.half * 0.42))} hd={hdModels} seed={kingdom.id} />}
      <StormClouds clouds={cityStorm} onFlash={onFlash} />

      {/* Town hall */}
      <group
        position={[0, 0.06, -3]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoveredTownHall(true);
        }}
        onPointerOut={() => setHoveredTownHall(false)}
        onClick={(e) => {
          e.stopPropagation();
          sound.playClick();
          if (onOpenDevProfile) onOpenDevProfile();
        }}
        scale={hoveredTownHall ? 1.02 : 1.0}
      >
        <TownHall3D civ={civ} level={kingdom.cityHallLevel} prestige={kingdom.cityHallPrestige ?? 0} tierFx={false} />
        {!hideTooltips && hoveredTownHall && (
          <Html zIndexRange={[15, 0]} position={[0, castleTopY(kingdom.cityHallLevel) + 2, 0]} center distanceFactor={26} style={{ pointerEvents: "none" }}>
            <div className="px-3.5 py-2 rounded-xl border backdrop-blur-md shadow-2xl select-none whitespace-nowrap text-center bg-amber-950/95 border-amber-400 text-amber-200 ring-2 ring-amber-400/40">
              <div className="flex items-center justify-center gap-1.5 font-bold font-medieval text-xs">
                <span>🏛️</span>
                <span>
                  {kingdom.name}'s {castle.name} · Lv {kingdom.cityHallLevel}
                  {(kingdom.cityHallPrestige ?? 0) > 0 && ` · ★${kingdom.cityHallPrestige}`}
                </span>
              </div>
              <div className="text-[10px] text-amber-300/80 mt-0.5">
                {castle.nextStageLevel ? `Becomes a ${castle.nextStageName} at Lv ${castle.nextStageLevel}` : "Max stage — growth beyond Lv 25 adds effects"}
              </div>
              <div className="text-[9px] text-emerald-400 font-mono mt-0.5 tracking-wider uppercase font-semibold">
                Click to view developer profile & git activity
              </div>
            </div>
          </Html>
        )}
      </group>

      {/* Invisible hit areas per plot (cheap hover/click without per-mesh handlers) */}
      {layout.plots.map(
        (plot) =>
          plot.building && (
            <mesh
              key={plot.key}
              position={[plot.x, 1.5, plot.z]}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredId(plot.building!.id);
              }}
              onPointerOut={() => setHoveredId((id) => (id === plot.building!.id ? null : id))}
              onClick={(e) => {
                e.stopPropagation();
                sound.playClick();
                onSelectBuilding(plot.building!);
              }}
            >
              <boxGeometry args={[plot.size, 3, plot.size]} />
              {/* Never rendered (no draw call); pointer events still hit it */}
              <meshBasicMaterial visible={false} />
            </mesh>
          )
      )}

      {highlighted && <PlotHighlight plot={highlighted} />}
      {highlighted && !hideTooltips && <PlotLabel plot={highlighted} />}

      {(!kingdom.buildings || kingdom.buildings.length === 0) && !hideTooltips && (
        <Html zIndexRange={[15, 0]} position={[0, 1.2, 12]} center distanceFactor={20} style={{ pointerEvents: "none" }}>
          <div className="bg-slate-900/90 border border-slate-700/80 px-4 py-2 rounded-xl text-slate-300 text-xs font-mono shadow-xl text-center backdrop-blur select-none whitespace-nowrap">
            ⛺ Peaceful realm • No repositories yet (commits will construct buildings)
          </div>
        </Html>
      )}
    </CompileGate>
  );
}
