import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HighGraphicsEmpyrean } from "./HighGraphicsEmpyrean";
import { HeroBatch, HeroSite } from "./HeroBatch";
import { BossBatch } from "./BossBatch";
import { HighGraphicsSingularity } from "./HighGraphicsSingularity";
import type { BossLive } from "./heroRig";
import type { HorrorPlacement } from "./realmTypes";
import { CastlePlacement } from "./WorldCastles";
import { hdSceneTarget } from "@/components/3d/HdPost";
import { useHd } from "@/utils/graphics";

/*
 * HD graphics on the world map: every hero model in one mount. The Archon's Empyrean is its own hand-built component
 * (its chains and halo move on the CPU); the batched heroes (the legendary landmarks, the Nethergarde Core) are drawn
 * together by `HeroBatch`, the world bosses (rigged heroes, posed on the CPU) by `BossBatch`. All of them are shown at every zoom (they cost no more than their map kit from afar). The
 * mount comes with the map, so it is built while the world loader (or the "Applying graphics…" switch) is up, and each
 * part stays hidden until its shaders have compiled in the background (`compileAsync`), so coming into view never
 * stalls a frame.
 */
/** Xal'Vorath's size on the map: it matches the Normal rig's at the mythical tier */
const HORROR_MAP_SCALE = 1.25;

export function HeroMount({
  castles,
  sites,
  bosses = [],
  bossLive,
  horrors = []
}: {
  castles: CastlePlacement[];
  sites: HeroSite[];
  bosses?: HeroSite[];
  bossLive?: Record<string, BossLive>;
  /** Xal'Vorath out in the realm: the hand-built titan, no lights or full-screen effects of its own */
  horrors?: HorrorPlacement[];
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const refs = useRef<Array<THREE.Group | null>>([]);
  const batchRef = useRef<THREE.Group>(null);
  const bossRef = useRef<THREE.Group>(null);
  const horrorRef = useRef<THREE.Group>(null);
  // Programs depend on the environment and on drawing to the screen or to bloom's buffer: compile again when they change
  const reflections = useHd("reflections");
  const bloom = useHd("bloom");

  // Compile a frame after mount, so the view's environment and lights are in place and the programs match what the
  // first real render asks for; textures are uploaded ahead too
  useEffect(() => {
    let alive = true;
    const groups = [...refs.current.slice(0, castles.length), batchRef.current, bossRef.current, horrorRef.current].filter((g): g is THREE.Group => Boolean(g));
    groups.forEach((g) => (g.visible = false));
    const raf = requestAnimationFrame(() => {
      for (const g of groups) {
        g.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
            const map = (m as THREE.MeshStandardMaterial).map;
            if (map) gl.initTexture(map);
          }
        });
      }
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(hdSceneTarget());
      const compiled = groups.map((g) => gl.compileAsync(g, camera, scene));
      gl.setRenderTarget(prev);
      Promise.all(compiled).then(() => {
        if (!alive) return;
        groups.forEach((g) => (g.visible = true));
        // The map's shadows are drawn once: draw them again with the heroes standing
        gl.shadowMap.needsUpdate = true;
      });
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [gl, scene, camera, castles.length, sites, bosses, horrors.length, reflections, bloom]);

  return (
    <>
      {castles.map((c, i) => (
        <group
          // Keyed by slot, so a new Archon only moves the model
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[c.x, c.y, c.z]}
          visible={false}
        >
          {/* No lights of its own on the map: a point light would recompile and slow every material in the realm */}
          <HighGraphicsEmpyrean lights={false} studio={false} />
        </group>
      ))}
      {sites.length > 0 && (
        <group ref={batchRef} visible={false}>
          <HeroBatch sites={sites} />
        </group>
      )}
      {bosses.length > 0 && (
        <group ref={bossRef} visible={false}>
          <BossBatch sites={bosses} live={bossLive} />
        </group>
      )}
      {horrors.length > 0 && (
        <group ref={horrorRef} visible={false}>
          {horrors.map((h) => (
            <group key={h.id} position={[h.x, h.y, h.z]} rotation={[0, h.yaw, 0]} scale={HORROR_MAP_SCALE}>
              <HighGraphicsSingularity action={h.action} reflections={false} screenFx={false} lights={false} timeOffset={h.offset} pace={h.pace} />
            </group>
          ))}
        </group>
      )}
    </>
  );
}
