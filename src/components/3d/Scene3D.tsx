import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { FlatWorldMap3D, WorldFocusRequest } from "./FlatWorldMap3D";
import { CityView3D } from "./CityView3D";
import { RealmSky } from "./RealmSky";
import { SeasonWeather } from "./SeasonWeather";
import { DisasterWeather } from "./DisasterWeather";
import { HdPost } from "./HdPost";
import { CrispLabels } from "./CrispLabels";
import { setLoadStage } from "@/utils/loadingScreen";
import { DeveloperKingdom, RepoBuilding, FlatWorldMapData, MapNPC, NethergardeSpire, ActiveMarch, NodeStatus, BossStatus, NpcKingdomStatus } from "@/types";

interface Scene3DProps {
  viewMode: 'world_map' | 'city_view';
  kingdoms: DeveloperKingdom[];
  currentKingdom: DeveloperKingdom | null;
  /** A different kingdom's data is still being fetched */
  kingdomLoading?: boolean;
  worldMap: FlatWorldMapData | null;
  rovingNPCs?: MapNPC[];
  horrorNPCs?: MapNPC[];
  nodeStatuses?: Record<string, NodeStatus>;
  bossStatuses?: Record<string, BossStatus>;
  /** Buffer realms and frontier gates: a burning one is drawn on fire (a gate broken open) */
  npcKingdomStatuses?: Record<string, NpcKingdomStatus>;
  spires?: NethergardeSpire[];
  activeMarches?: ActiveMarch[];
  hideTooltips?: boolean;
  focusRequest?: { id: string; nonce: number } | null;
  worldFocusRequest?: WorldFocusRequest | null;
  /** The signed-in ruler's kingdom (golden beacon on the world map) */
  homeKingdomId?: string | null;
  onEnterKingdom: (id: string) => void;
  onSelectKingdom?: (kingdom: DeveloperKingdom) => void;
  onSelectBuilding: (b: RepoBuilding) => void;
  onSelectNPC?: (npc: MapNPC) => void;
  onSelectSpire?: (spire: NethergardeSpire) => void;
  onOpenDevProfile?: (kingdom: DeveloperKingdom) => void;
  /** Told whether the view is still building (the app's loading screen covers it meanwhile); a stable function */
  onLoaderChange?: (up: boolean) => void;
}

/** The view's callbacks: the canvas below reads the latest through a ref, so a parent re-render never reaches it */
type SceneCallbacks = Pick<Scene3DProps, "onEnterKingdom" | "onSelectKingdom" | "onSelectBuilding" | "onSelectNPC" | "onSelectSpire" | "onOpenDevProfile">;

export function Scene3D({
  onEnterKingdom,
  onSelectKingdom,
  onSelectBuilding,
  onSelectNPC,
  onSelectSpire,
  onOpenDevProfile,
  onLoaderChange,
  ...data
}: Scene3DProps) {
  const { viewMode, currentKingdom, kingdomLoading = false } = data;
  // World map: set while the continent builds. City: the loader stays up from the click until the
  // current kingdom's city has drawn its first frames (worked out during render, so it never flickers)
  const [sceneLoading, setSceneLoading] = useState(viewMode === "world_map");
  const [readyCityId, setReadyCityId] = useState<string | null>(null);
  useEffect(() => {
    if (viewMode !== "city_view") setReadyCityId(null);
  }, [viewMode]);
  const showLoader =
    viewMode === "world_map" ? sceneLoading : kingdomLoading || !currentKingdom || readyCityId !== currentKingdom.id;
  // The loading screen (in the app, over everything) follows the loader; each new load starts its bar over at the
  // step it begins with: the kingdom's data, the land, or straight to raising the city
  useLayoutEffect(() => {
    if (showLoader) setLoadStage(viewMode === "city_view" && kingdomLoading ? "realm" : viewMode === "world_map" ? "land" : "castles", 0, true);
    onLoaderChange?.(showLoader);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLoader]);

  // The app re-renders on every 3 s poll (the status line) with new inline callbacks; the whole 3D tree (hundreds of
  // components and every <Html> label) re-rendered with it. Callbacks go through a ref and stable wrappers, and the
  // canvas is memoised on its data, so only a real data change re-renders the view
  const cbs = useRef<SceneCallbacks>({ onEnterKingdom, onSelectKingdom, onSelectBuilding, onSelectNPC, onSelectSpire, onOpenDevProfile });
  useLayoutEffect(() => {
    cbs.current = { onEnterKingdom, onSelectKingdom, onSelectBuilding, onSelectNPC, onSelectSpire, onOpenDevProfile };
  });
  const stable = useMemo<Required<SceneCallbacks>>(
    () => ({
      onEnterKingdom: (id) => cbs.current.onEnterKingdom(id),
      onSelectKingdom: (k) => cbs.current.onSelectKingdom?.(k),
      onSelectBuilding: (b) => cbs.current.onSelectBuilding(b),
      onSelectNPC: (n) => cbs.current.onSelectNPC?.(n),
      onSelectSpire: (sp) => cbs.current.onSelectSpire?.(sp),
      onOpenDevProfile: (k) => cbs.current.onOpenDevProfile?.(k)
    }),
    []
  );
  // The map picks onSelectKingdom over onEnterKingdom only when one is given
  const hasSelectKingdom = Boolean(onSelectKingdom);

  return (
    <div className={`w-full h-full relative cursor-grab active:cursor-grabbing${showLoader ? " scene-loading" : ""}`}>
      <SceneCanvas
        {...data}
        {...stable}
        onSelectKingdom={hasSelectKingdom ? stable.onSelectKingdom : undefined}
        onMapLoading={setSceneLoading}
        onCityReady={setReadyCityId}
      />
    </div>
  );
}

type SceneCanvasProps = Omit<Scene3DProps, "onSelectKingdom"> &
  Required<Pick<Scene3DProps, "onSelectNPC" | "onSelectSpire" | "onOpenDevProfile">> & {
    onSelectKingdom?: Scene3DProps["onSelectKingdom"];
    onMapLoading: (loading: boolean) => void;
    onCityReady: (id: string) => void;
  };

/** The canvas and the view in it: re-renders only when the realm's data (or the view) changes, never on a poll alone */
const SceneCanvas = memo(function SceneCanvas({
  viewMode,
  kingdoms,
  currentKingdom,
  kingdomLoading = false,
  worldMap,
  rovingNPCs,
  horrorNPCs,
  nodeStatuses,
  bossStatuses,
  npcKingdomStatuses,
  spires,
  activeMarches,
  hideTooltips = false,
  focusRequest,
  worldFocusRequest,
  homeKingdomId,
  onEnterKingdom,
  onSelectKingdom,
  onSelectBuilding,
  onSelectNPC,
  onSelectSpire,
  onOpenDevProfile,
  onMapLoading,
  onCityReady
}: SceneCanvasProps) {
  const cityId = currentKingdom?.id;
  const cityReady = useCallback(() => cityId && onCityReady(cityId), [cityId, onCityReady]);
  const cityProfile = useCallback(() => currentKingdom && onOpenDevProfile(currentKingdom), [currentKingdom, onOpenDevProfile]);

  return (
    <Canvas
      // Its labels (drei <Html>) get their own compositor layers: see .scene-labels in index.css
      className="scene-labels"
      shadows
      // Cap the pixel ratio: full 2×+ on high-DPI screens costs ~4× the fill for little visible gain
      dpr={[1, 1.5]}
      // Dev handle for render benchmarks (renderer, scene, camera)
      onCreated={(state) => {
        if (import.meta.env.DEV) (window as unknown as { __r3f: typeof state }).__r3f = state;
      }}
      camera={
        viewMode === "world_map"
          ? { position: [0, 100, 112], fov: 48, near: 0.5, far: 600 }
          : { position: [0, 22, 26], fov: 45, near: 0.1, far: 450 }
      }
    >
      {/* The realm sky: background, fog and lights follow the realm hour (dawn, day, late afternoon, dusk, night) */}
      <RealmSky />
      {/* The season's weather: spring showers, summer fireflies, autumn leaves, winter snow, a few passing clouds.
          The Voidrift stands outside the seasons */}
      <SeasonWeather view={viewMode} enabled={viewMode === "world_map" || currentKingdom?.civilization !== "arcane"} />
      {/* A world disaster's look: spores, wind and dust, the Blood Moon, miasma or grey petals, and the tint they bring */}
      <DisasterWeather view={viewMode} />
      {/* HD graphics: bloom and studio reflections (nothing in normal quality) */}
      <HdPost />
      {/* Re-rasterises labels that grew during a zoom once the camera stops, so they stay sharp */}
      <CrispLabels />

      {/* Map-style controls: drag pans across the ground, Ctrl/Shift + drag (or right-drag) rotates */}
      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI / 2.15}
        minDistance={viewMode === "world_map" ? 25 : 10}
        maxDistance={viewMode === "world_map" ? 220 : 45}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
        screenSpacePanning={false}
        enableDamping
        dampingFactor={0.2}
      />

      {/* Switch between Flat 5-Province World Map and Inside City View */}
      {viewMode === "world_map" ? (
        <FlatWorldMap3D
          kingdoms={kingdoms}
          worldMap={worldMap}
          rovingNPCs={rovingNPCs}
          horrorNPCs={horrorNPCs}
          nodeStatuses={nodeStatuses}
          bossStatuses={bossStatuses}
          npcKingdomStatuses={npcKingdomStatuses}
          spires={spires}
          activeMarches={activeMarches}
          hideTooltips={hideTooltips}
          worldFocusRequest={worldFocusRequest}
          homeKingdomId={homeKingdomId}
          onEnterKingdom={onEnterKingdom}
          onSelectKingdom={onSelectKingdom}
          onSelectNPC={onSelectNPC}
          onSelectSpire={onSelectSpire}
          onOpenDevProfile={onOpenDevProfile}
          onLoadingChange={onMapLoading}
        />
      ) : (
        currentKingdom &&
        !kingdomLoading && (
          <CityView3D
            key={currentKingdom.id}
            kingdom={currentKingdom}
            onReady={cityReady}
            hideTooltips={hideTooltips}
            focusRequest={focusRequest}
            onSelectBuilding={onSelectBuilding}
            onOpenDevProfile={cityProfile}
          />
        )
      )}
    </Canvas>
  );
});
