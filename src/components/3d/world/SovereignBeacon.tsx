import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Terrain } from "./terrain";

/*
 * World-map markers for one castle each: the signed-in ruler's home beacon (a soft golden pillar of light as tall as a
 * Wonder's curtain, plus a pulsing ground crest) and the inspection ring around a castle picked from the kingdom picker.
 * A fixed number of meshes (4), animated in useFrame; nothing casts shadows.
 */

/** Pillar height at castle scale 1: about as tall as the curtain of light round a Wonder, not up to the sky */
const BEACON_HEIGHT = 8;

/** Open cylinder whose vertex alpha fades from `alpha` at the base to 0 at the top */
function fadingPillar(radius: number, alpha: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius * 0.8, radius, BEACON_HEIGHT, 24, 12, true).translate(0, BEACON_HEIGHT / 2, 0);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / BEACON_HEIGHT;
    colors.set([1, 1, 1, alpha * Math.pow(1 - t, 1.6)], i * 4);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  return g;
}

const PILLAR_CORE = fadingPillar(0.35, 0.5);
const PILLAR_GLOW = fadingPillar(1.1, 0.18);
/** Unit-radius rings in the XZ plane, scaled per castle */
const CREST_RING = new THREE.RingGeometry(0.86, 0.93, 64).rotateX(-Math.PI / 2);
const INSPECT_RING = new THREE.RingGeometry(1.2, 1.27, 64).rotateX(-Math.PI / 2);

/** Highest ground under a ring of the given radius, so the ring is never buried in a slope */
function groundTop(terrain: Terrain, x: number, z: number, r: number): number {
  let top = terrain.height(x, z);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    for (const f of [0.7, 1, 1.15]) top = Math.max(top, terrain.height(x + Math.cos(a) * r * f, z + Math.sin(a) * r * f));
  }
  return top;
}

// Additive glow does not depend on draw order, so double-sided faces can be drawn in a single pass
const glow = { transparent: true, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true } as const;

interface Spot {
  x: number;
  z: number;
  /** Castle scale on the world map */
  scale: number;
}

/** Soft golden pillar of light over the signed-in ruler's castle with a pulsing crest on the ground */
export function SovereignBeacon({ x, z, scale, terrain }: Spot & { terrain: Terrain }) {
  const r = 3.2 * scale;
  const y = useMemo(() => groundTop(terrain, x, z, r) + 0.1, [terrain, x, z, r]);
  const core = useRef<THREE.MeshBasicMaterial>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const crest = useRef<THREE.Mesh>(null);
  const crestMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    if (core.current) core.current.opacity = 0.6 + 0.2 * pulse;
    if (glowRef.current) glowRef.current.scale.set(scale * (1 + 0.08 * pulse), scale, scale * (1 + 0.08 * pulse));
    if (crest.current) crest.current.scale.setScalar(r * (1 + 0.05 * pulse));
    if (crestMat.current) crestMat.current.opacity = 0.55 + 0.45 * pulse;
  });

  return (
    <group position={[x, y, z]}>
      <mesh geometry={PILLAR_CORE} scale={[scale, scale, scale]} raycast={() => null}>
        <meshBasicMaterial ref={core} color="#fde68a" vertexColors {...glow} />
      </mesh>
      <mesh ref={glowRef} geometry={PILLAR_GLOW} raycast={() => null}>
        <meshBasicMaterial color="#f59e0b" vertexColors {...glow} />
      </mesh>
      <mesh ref={crest} geometry={CREST_RING} raycast={() => null}>
        <meshBasicMaterial ref={crestMat} color="#fbbf24" {...glow} />
      </mesh>
    </group>
  );
}

/** Breathing silver ring around the castle the camera was sent to from the kingdom picker */
export function InspectionRing({ x, z, scale, terrain }: Spot & { terrain: Terrain }) {
  const r = 3.2 * scale;
  // Outside the home crest (unit radius 0.93) and 0.06 higher, so the two never overlap
  const y = useMemo(() => groundTop(terrain, x, z, r * 1.27) + 0.16, [terrain, x, z, r]);
  const ring = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3);
    if (ring.current) ring.current.scale.setScalar(r * (1 + 0.06 * pulse));
    if (mat.current) mat.current.opacity = 0.5 + 0.5 * pulse;
  });

  return (
    <mesh ref={ring} geometry={INSPECT_RING} position={[x, y, z]} raycast={() => null}>
      <meshBasicMaterial ref={mat} color="#e0f2fe" {...glow} />
    </mesh>
  );
}
