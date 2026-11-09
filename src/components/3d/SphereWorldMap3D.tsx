import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { KingdomPlotSphere3D } from "./KingdomPlotSphere3D";
import { NPCIslandsSphere3D, NPCIslandData, NPC_ISLANDS } from "./NPCIslandsSphere3D";
import { computeKingdomPlacements } from "@/utils/spherePlacement";
import { DeveloperKingdom } from "@/types";

interface SphereWorldMap3DProps {
  kingdoms: DeveloperKingdom[];
  hideTooltips?: boolean;
  onEnterKingdom: (id: string) => void;
  onSelectNPC?: (island: NPCIslandData) => void;
}

export function SphereWorldMap3D({
  kingdoms,
  hideTooltips = false,
  onEnterKingdom,
  onSelectNPC
}: SphereWorldMap3DProps) {
  const planetRef = useRef<THREE.Group>(null);
  const SPHERE_RADIUS = 16;

  // Slow ambient rotation of the planetary realm
  useFrame((_state, delta) => {
    if (planetRef.current) {
      planetRef.current.rotation.y += delta * 0.025;
    }
  });

  const npcCoords = useMemo(
    () => NPC_ISLANDS.map((n) => [n.lat, n.lon] as [number, number]),
    []
  );

  const placement = useMemo(
    () => computeKingdomPlacements(kingdoms.length, npcCoords),
    [kingdoms.length, npcCoords]
  );

  return (
    <group ref={planetRef}>
      {/* 1. Base Ocean Planet Sphere */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[SPHERE_RADIUS, 64, 64]} />
        <meshStandardMaterial
          color="#0284c7" // Deep sparkling azure ocean blue
          roughness={0.2}
          metalness={0.25}
        />
      </mesh>

      {/* 2. Soft Atmospheric Rim Glow */}
      <mesh>
        <sphereGeometry args={[SPHERE_RADIUS + 0.4, 32, 32]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.08}
          side={THREE.BackSide}
        />
      </mesh>

      {/* 3. NPC Wild Islands (Volcano Dragon Peak, Nomad Tribe, Sunken Ruins, Pirate Atoll) */}
      <NPCIslandsSphere3D
        sphereRadius={SPHERE_RADIUS}
        hideTooltips={hideTooltips}
        onSelectNPC={onSelectNPC}
      />

      {/* 4. Place Each Developer's Dedicated Kingdom Island on the Sphere */}
      {kingdoms.map((k, index) => {
        const [lat, lon] = placement.coords[index] || [0, 0];
        return (
          <KingdomPlotSphere3D
            key={k.id}
            kingdom={k}
            sphereRadius={SPHERE_RADIUS}
            lat={lat}
            lon={lon}
            scale={placement.scale}
            hideTooltips={hideTooltips}
            onEnter={onEnterKingdom}
          />
        );
      })}
    </group>
  );
}
