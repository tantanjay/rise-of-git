import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { API_BASE } from "@/config";
import { CivilizationType, DeveloperKingdom, FlatWorldMapData, NethergardeSpire } from "@/types";
import { FlatWorldMap3D } from "@/components/3d/FlatWorldMap3D";
import { RealmSky } from "@/components/3d/RealmSky";
import { SeasonWeather } from "@/components/3d/SeasonWeather";
import { HdPost } from "@/components/3d/HdPost";
import { loadHdModels } from "@/components/3d/world/hdModelsLoader";
import type { SingularityAction } from "@/components/3d/world/HighGraphicsSingularity";
import { graphics } from "@/utils/graphics";
import { WORLD_SCALE } from "@/utils/worldGeometry";

/* ------------------------------------------------------------------------- */
/* The login screen's HD flyover: a drone flight over the realm as it stands  */
/* (no names: GET /login/realm), round the four provinces and in to the      */
/* Voidrift, where Xal'Vorath casts its Void Self-Destruct; the void swallows */
/* the screen and the flight starts over. Always in HD (graphics.preview),   */
/* whatever the visitor's own setting.                                       */
/* ------------------------------------------------------------------------- */

/**
 * Act boundaries (seconds into the loop): the reveal, the rift tears open as the drone comes in (Emerge), the drone
 * settles in front of it, the cast, the black
 */
export const FT = { reveal: 3.5, emerge: 16.5, arrive: 17, cast: 23.2, end: 28.5 } as const;
/** Reduced motion: the drone holds still over the provinces at this second of the tour */
const STILL_T = 7;

export interface FrameInfo {
  /** Seconds into the loop */
  t: number;
  /** Seconds since the last frame */
  dt: number;
}

/** The realm as the login screen sees it: castles by civilization and level only */
interface LoginRealm {
  map: FlatWorldMapData;
  castles: Array<{ id: string; civilization: CivilizationType; cityHallLevel: number; isArchon: boolean }>;
  spires: Array<Pick<NethergardeSpire, "id" | "slotIndex" | "coordinates" | "npcLevel">>;
}

export interface FlyoverParts {
  realm: LoginRealm;
  Singularity: typeof import("@/components/3d/world/HighGraphicsSingularity").HighGraphicsSingularity;
}

/** Fetches the realm and every chunk the flyover needs (the HD hero models, Xal'Vorath) */
export async function loadFlyover(): Promise<FlyoverParts> {
  const [realm, singularity] = await Promise.all([
    fetch(`${API_BASE}/login/realm`).then((r) => (r.ok ? (r.json() as Promise<LoginRealm>) : Promise.reject(new Error(`HTTP ${r.status}`)))),
    import("@/components/3d/world/HighGraphicsSingularity"),
    loadHdModels()
  ]);
  return { realm, Singularity: singularity.HighGraphicsSingularity };
}

/**
 * Where Xal'Vorath tears its way into the world: over the Voidrift's south side, clear of the orbiting shards and the
 * castles, with the Archon's seat behind it (world units; its feet, once out)
 */
const TITAN_AT = new THREE.Vector3(0, 10, 17);
const TITAN_SCALE = 2.6;
/** Where the drone frames it: its chest (the core stands 3.3 up at the Codex's 0.86 scale) */
const TITAN_FOCUS = new THREE.Vector3(TITAN_AT.x, TITAN_AT.y + 3.3 * 0.86 * TITAN_SCALE, TITAN_AT.z);
/** Out of sight, deep under the map, until the rift opens (its idle still runs there) */
const TITAN_DEPTH = -40;
/** Its stage lights come up as the claws come through the rift (Emerge's seconds), so they read against the night */
const LIGHT_IN: [number, number] = [0.6, 2.4];

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** A point over the provinces, spread out with the realm (WORLD_SCALE) */
const w = (x: number, y: number, z: number) => v(x * WORLD_SCALE, y, z * WORLD_SCALE);
/** The drone's flight from the sky, round the four provinces (human, elf, dwarf, orc) and in from the south */
const FLIGHT = new THREE.CatmullRomCurve3(
  [v(0, 165, 175), w(-72, 62, 98), w(-92, 32, 18), w(-62, 28, -78), w(6, 34, -98), w(82, 30, -62), w(98, 32, 14), w(66, 30, 88), v(16, 26, 72), v(0, 23, 57)],
  false,
  "centripetal"
);
/** Where it looks along the way (the province it passes, then the Voidrift) */
const GAZE = new THREE.CatmullRomCurve3(
  [v(0, 0, 0), w(-44, 0, 44), w(-50, 2, 0), w(-44, 2, -44), w(0, 2, -52), w(44, 2, -44), w(50, 2, 0), w(44, 2, 44), v(8, 8, 22), TITAN_FOCUS],
  false,
  "centripetal"
);
/** Where the drone ends up, and holds (drifting in and round a little) while the titan casts */
const HOLD = FLIGHT.points[FLIGHT.points.length - 1];
/** How close the drone holds (share of its arrival distance) by seconds into Emerge, then through the cast */
const PUSH: Array<[number, number]> = [
  [0.5, 1],
  [2.4, 0.74],
  [3.85, 0.66],
  [4.15, 0.84],
  [5.5, 0.8],
  [FT.end - FT.emerge, 0.86]
];
function pushIn(s: number): number {
  if (s <= PUSH[0][0]) return PUSH[0][1];
  for (let i = 1; i < PUSH.length; i++) {
    if (s > PUSH[i][0]) continue;
    const [t0, v0] = PUSH[i - 1];
    const [t1, v1] = PUSH[i];
    return v0 + (v1 - v0) * smooth((s - t0) / (t1 - t0));
  }
  return PUSH[PUSH.length - 1][1];
}
const smooth = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

/** Runs the loop: the drone's flight, the titan's idle and its cast; reports the loop time to the overlays */
function Director({ ready, still, Singularity, onFrame }: { ready: RefObject<boolean>; still: boolean; Singularity: FlyoverParts["Singularity"]; onFrame: (f: FrameInfo) => void }) {
  const camera = useThree((s) => s.camera);
  const titan = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const [action, setAction] = useState<SingularityAction>("idle");
  const acting = useRef<SingularityAction>("idle");
  const look = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  // The titan's stage lights (its rim, key, underlight and core), scaled up with it and faded in as it comes through, so
  // they never light the realm during the tour
  const lights = useRef<Array<{ light: THREE.Light; base: number }> | null>(null);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    // Dev handle: `__flyover.seek(19.5)` jumps the loop to that second (with __login's frameloop "never" and advance)
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __flyover?: { seek: (t: number) => void } };
    w.__flyover = { seek: (t) => void (start.current = clock.elapsedTime - t) };
    return () => {
      delete w.__flyover;
    };
  }, [clock]);

  useFrame((state, dt) => {
    if (!ready.current) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    if (!lights.current && titan.current) {
      const found: Array<{ light: THREE.Light; base: number }> = [];
      titan.current.traverse((o) => {
        if (!(o instanceof THREE.Light)) return;
        // A point light reaches as far, and as bright, on the bigger model (its falloff goes with distance squared)
        if (o instanceof THREE.PointLight) {
          o.distance *= TITAN_SCALE;
          found.push({ light: o, base: o.intensity * TITAN_SCALE * TITAN_SCALE });
        } else found.push({ light: o, base: o.intensity });
      });
      lights.current = found;
    }
    const t = still ? STILL_T : (state.clock.elapsedTime - start.current) % FT.end;
    onFrame({ t, dt });

    // Idle through the flight; the cast starts as the drone settles in front of it (an action change restarts it)
    const want: SingularityAction = t >= FT.cast ? "casting" : t >= FT.emerge ? "emerging" : "idle";
    if (want !== acting.current) {
      acting.current = want;
      setAction(want);
    }

    // In place once Emerge has begun (a beat later than the switch, so its idle never shows there), its light growing as
    // the rift is wrenched open
    const here = t >= FT.emerge + 0.1;
    titan.current?.position.set(TITAN_AT.x, here ? TITAN_AT.y : TITAN_DEPTH, TITAN_AT.z);
    const light = here ? smooth(clamp01((t - FT.emerge - LIGHT_IN[0]) / (LIGHT_IN[1] - LIGHT_IN[0]))) : 0;
    for (const l of lights.current ?? []) l.light.intensity = l.base * light;

    if (t < FT.arrive) {
      // Fast out of the sky, steady over the provinces, easing in to the Voidrift
      const u = t / FT.arrive;
      const k = u < 0.12 ? smooth(u / 0.12) * 0.12 : u > 0.85 ? 0.85 + smooth((u - 0.85) / 0.15) * 0.15 : u;
      FLIGHT.getPoint(k, pos);
      GAZE.getPoint(k, look);
    } else {
      // Hold in front of it, drifting round to one side: pushing in on the claws as they pry the rift open, knocked back
      // by the break, easing out for the cast
      const u = (t - FT.arrive) / (FT.end - FT.arrive);
      const a = u * 0.2;
      const r = (HOLD.z - TITAN_AT.z) * pushIn(t - FT.emerge);
      pos.set(TITAN_AT.x + Math.sin(a) * r, HOLD.y - u * 1.5, TITAN_AT.z + Math.cos(a) * r);
      look.copy(TITAN_FOCUS);
    }
    camera.position.copy(pos);
    camera.lookAt(look);
  });

  return (
    <group ref={titan} position={[TITAN_AT.x, TITAN_DEPTH, TITAN_AT.z]} scale={TITAN_SCALE}>
      {/* The map brings its own HD reflections (shiny surfaces only) */}
      <Singularity action={action} reflections={false} screenFx={action !== "idle"} />
    </group>
  );
}

export function LoginFlyover({ parts, still = false, onFrame }: { parts: FlyoverParts; /** Reduced motion: a calm view over the provinces, no flight and no cast */ still?: boolean; onFrame: (f: FrameInfo) => void }) {
  const { realm, Singularity } = parts;
  // HD while it plays (the login screen also switches just before mounting it, so the first frame is HD already); back
  // to the visitor's own quality when it ends (signed in, or looking around)
  useEffect(() => {
    graphics.preview("hd");
    return () => graphics.preview(null);
  }, []);
  const kingdoms = useMemo(
    // Only what the map draws a castle from; the map's names and badges are hidden (hideTooltips)
    () => realm.castles.map((c) => ({ ...c, name: "", buildings: [] }) as unknown as DeveloperKingdom),
    [realm]
  );
  const spires = useMemo(() => realm.spires.map((s) => ({ ...s, occupiedByDevId: null }) as NethergardeSpire), [realm]);
  const ready = useRef(false);
  const onLoadingChange = useCallback((loading: boolean) => void (ready.current = !loading), []);

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 165, 175], fov: 48, near: 0.5, far: 600 }}
      gl={{ powerPreference: "high-performance" }}
      // Dev handle for checking the acts and measuring (as __r3f / __codex)
      onCreated={(state) => {
        if (import.meta.env.DEV) (window as unknown as { __login: typeof state }).__login = state;
      }}
    >
      <RealmSky />
      <SeasonWeather view="world_map" enabled />
      <HdPost />
      <FlatWorldMap3D kingdoms={kingdoms} worldMap={realm.map} spires={spires} hideTooltips onEnterKingdom={() => {}} onLoadingChange={onLoadingChange} />
      <Director ready={ready} still={still} Singularity={Singularity} onFrame={onFrame} />
    </Canvas>
  );
}
