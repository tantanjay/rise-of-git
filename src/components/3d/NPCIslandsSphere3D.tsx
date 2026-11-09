import { useState, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { OrganicIslandDisc3D } from "./OrganicIslandDisc3D";

interface NPCIslandData {
  id: string;
  name: string;
  type: "volcano" | "tribe" | "ruins" | "pirate";
  emblem: string;
  subtitle: string;
  description: string;
  lat: number;
  lon: number;
}

// Well-spaced coordinates with minimum 55° great-circle separation from all kingdoms
export const NPC_ISLANDS: NPCIslandData[] = [
  {
    id: "npc-dragon-peak",
    name: "Mount Ignis",
    type: "volcano",
    emblem: "🌋",
    subtitle: "Dragon Roost & Volcano",
    description: "Towering volcanic peaks with glowing magma vents and ancient dragon roosts.",
    lat: -45,
    lon: -40
  },
  {
    id: "npc-nomad-tribe",
    name: "Kurast Tribe",
    type: "tribe",
    emblem: "🏕️",
    subtitle: "Wild Nomad Encampment",
    description: "An indigenous tribe living in straw huts around a perpetual sacred bonfire.",
    lat: 10,
    lon: -140
  },
  {
    id: "npc-titan-ruins",
    name: "Titan Ruins",
    type: "ruins",
    emblem: "🏛️",
    subtitle: "Sunken Arcane Sanctuary",
    description: "Weathered marble monoliths and a hovering runestone containing ancient git lore.",
    lat: 55,
    lon: 175
  },
  {
    id: "npc-smuggler-atoll",
    name: "Smuggler's Atoll",
    type: "pirate",
    emblem: "🏴‍☠️",
    subtitle: "Rogue Pirate Haven",
    description: "A secluded coral reef atoll with watchtowers and salvaged treasure caches.",
    lat: -45,
    lon: -130
  }
];

interface NPCIslandsSphere3DProps {
  sphereRadius: number;
  hideTooltips?: boolean;
  onSelectNPC?: (island: NPCIslandData) => void;
}

export function NPCIslandsSphere3D({ sphereRadius, hideTooltips = false, onSelectNPC }: NPCIslandsSphere3DProps) {
  return (
    <group>
      {NPC_ISLANDS.map((island) => (
        <SingleNPCIslandSphere
          key={island.id}
          island={island}
          sphereRadius={sphereRadius}
          hideTooltips={hideTooltips}
          onSelectNPC={onSelectNPC}
        />
      ))}
    </group>
  );
}

function SingleNPCIslandSphere({
  island,
  sphereRadius,
  hideTooltips,
  onSelectNPC
}: {
  island: NPCIslandData;
  sphereRadius: number;
  hideTooltips: boolean;
  onSelectNPC?: (island: NPCIslandData) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const animRef = useRef<THREE.Group>(null);

  // Position and surface normal on the sphere
  const { position, quaternion } = useMemo(() => {
    const phi = (90 - island.lat) * (Math.PI / 180);
    const theta = (island.lon + 180) * (Math.PI / 180);

    const x = -sphereRadius * Math.sin(phi) * Math.cos(theta);
    const z = sphereRadius * Math.sin(phi) * Math.sin(theta);
    const y = sphereRadius * Math.cos(phi);

    const pos = new THREE.Vector3(x, y, z);
    const up = new THREE.Vector3(0, 1, 0);
    const normal = pos.clone().normalize();

    const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
    return { position: pos, quaternion: quat };
  }, [sphereRadius, island.lat, island.lon]);

  // Subtle ambient floating animation for magical / smoke elements
  useFrame((state) => {
    if (animRef.current) {
      animRef.current.position.y = (island.type === "ruins" ? 1.6 : 3.2) + Math.sin(state.clock.elapsedTime * 2.5) * 0.12;
      if (island.type === "ruins") {
        animRef.current.rotation.y += 0.02;
      }
    }
  });

  const islandStyles = {
    volcano: { seed: 101, baseR: 2.8, sand: "#475569", grass: "#1e293b" },
    tribe: { seed: 202, baseR: 2.6, sand: "#fef08a", grass: "#65a30d" },
    ruins: { seed: 303, baseR: 2.7, sand: "#94a3b8", grass: "#0f766e" },
    pirate: { seed: 404, baseR: 2.9, sand: "#fed7aa", grass: "#06b6d4" }
  }[island.type];

  return (
    <group
      position={position}
      quaternion={quaternion}
      scale={hovered ? 1.15 : 1}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelectNPC) onSelectNPC(island);
      }}
    >
      {/* Non-Circular Organic Island Base Shape */}
      <OrganicIslandDisc3D
        seed={islandStyles.seed}
        baseRadius={islandStyles.baseR}
        sandColor={islandStyles.sand}
        grassColor={islandStyles.grass}
      />

      {/* 1. MOUNT IGNIS (VOLCANO & MOUNTAIN ISLAND) */}
      {island.type === "volcano" && (
        <group>
          {/* Main Volcano Cone */}
          <mesh position={[0, 1.3, 0]} castShadow>
            <coneGeometry args={[2.0, 2.3, 10, 1, true]} />
            <meshStandardMaterial color="#0f172a" roughness={0.9} />
          </mesh>

          {/* Surrounding Mountain Peaks */}
          {[[-1.4, 0.9], [1.5, 0.7], [-1.0, -1.2], [1.2, -1.1]].map(([mx, mz], i) => (
            <mesh key={i} position={[mx, 0.8, mz]} castShadow>
              <coneGeometry args={[0.8 + (i * 0.1), 1.4 + (i * 0.15), 5]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
          ))}

          {/* Glowing Molten Lava Caldera in Crater */}
          <mesh position={[0, 2.2, 0]}>
            <cylinderGeometry args={[0.7, 0.7, 0.1, 10]} />
            <meshStandardMaterial
              color="#ef4444"
              emissive="#ea580c"
              emissiveIntensity={2.0}
            />
          </mesh>

          {/* Floating Smoke Plume */}
          <group ref={animRef} position={[0, 3.2, 0]}>
            <mesh>
              <sphereGeometry args={[0.35, 8, 8]} />
              <meshStandardMaterial color="#64748b" transparent opacity={0.6} />
            </mesh>
            <mesh position={[0.15, 0.4, 0]}>
              <sphereGeometry args={[0.5, 8, 8]} />
              <meshStandardMaterial color="#475569" transparent opacity={0.45} />
            </mesh>
          </group>
        </group>
      )}

      {/* 2. KURAST TRIBE (NOMAD ENCAMPMENT & TENTS) */}
      {island.type === "tribe" && (
        <group>
          {/* 3 Straw Nomad Teepees / Huts */}
          {[
            { pos: [-0.9, 0.6, -0.5], scale: 0.9 },
            { pos: [1.0, 0.55, -0.3], scale: 0.8 },
            { pos: [0.1, 0.5, 1.0], scale: 0.75 }
          ].map((tent, ti) => (
            <group key={ti} position={tent.pos as [number, number, number]} scale={tent.scale}>
              <mesh castShadow>
                <coneGeometry args={[0.75, 1.1, 6]} />
                <meshStandardMaterial color="#d97706" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0.6, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.4, 4]} />
                <meshStandardMaterial color="#78350f" />
              </mesh>
            </group>
          ))}

          {/* Central Sacred Bonfire */}
          <group position={[0, 0.3, 0]}>
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.3, 0.35, 0.1, 8]} />
              <meshStandardMaterial color="#451a03" />
            </mesh>
            <mesh position={[0, 0.25, 0]}>
              <coneGeometry args={[0.2, 0.4, 6]} />
              <meshStandardMaterial
                color="#f97316"
                emissive="#f59e0b"
                emissiveIntensity={2.5}
              />
            </mesh>
          </group>

          {/* Tribal Totem Pole with Horns */}
          <group position={[-1.4, 0.5, 0.9]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.12, 0.15, 1.1, 6]} />
              <meshStandardMaterial color="#7c2d12" />
            </mesh>
            <mesh position={[0, 0.35, 0]}>
              <boxGeometry args={[0.65, 0.12, 0.12]} />
              <meshStandardMaterial color="#b45309" />
            </mesh>
            <mesh position={[0, 0.65, 0]}>
              <sphereGeometry args={[0.18, 6, 6]} />
              <meshStandardMaterial color="#fef3c7" />
            </mesh>
          </group>
        </group>
      )}

      {/* 3. SUNKEN TITAN RUINS (ANCIENT PILLARS & LEVITATING STONE) */}
      {island.type === "ruins" && (
        <group>
          {/* Ancient Rune Circle on Ground */}
          <mesh position={[0, 0.26, 0]}>
            <ringGeometry args={[0.9, 1.4, 20]} />
            <meshStandardMaterial
              color="#06b6d4"
              emissive="#0891b2"
              emissiveIntensity={1.4}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* 4 Weathered Monolith Pillars */}
          {[
            { pos: [-1.1, 0.8, -1.1], h: 1.5, rot: 0 },
            { pos: [1.1, 1.0, -1.1], h: 1.8, rot: 0 },
            { pos: [-1.1, 0.4, 1.1], h: 0.8, rot: 0.2 },
            { pos: [1.1, 0.6, 1.1], h: 1.1, rot: -0.15 }
          ].map((col, ci) => (
            <mesh
              key={ci}
              position={col.pos as [number, number, number]}
              rotation={[col.rot, 0, col.rot]}
              castShadow
            >
              <cylinderGeometry args={[0.2, 0.24, col.h, 7]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
            </mesh>
          ))}

          {/* Floating Rotating Arcane Runestone */}
          <group ref={animRef} position={[0, 1.6, 0]}>
            <mesh castShadow>
              <octahedronGeometry args={[0.45, 0]} />
              <meshStandardMaterial
                color="#38bdf8"
                emissive="#0284c7"
                emissiveIntensity={1.8}
              />
            </mesh>
          </group>
        </group>
      )}

      {/* 4. SMUGGLER'S ATOLL (PIRATE REEF & WATCHTOWER) */}
      {island.type === "pirate" && (
        <group>
          {/* Wooden Pirate Watchtower */}
          <group position={[-1.1, 0.8, -0.9]}>
            {[[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].map(([sx, sz], si) => (
              <mesh key={si} position={[sx, 0, sz]}>
                <cylinderGeometry args={[0.03, 0.04, 1.5, 5]} />
                <meshStandardMaterial color="#593a1c" />
              </mesh>
            ))}
            <mesh position={[0, 0.75, 0]}>
              <boxGeometry args={[0.7, 0.08, 0.7]} />
              <meshStandardMaterial color="#78350f" />
            </mesh>
            <mesh position={[0, 1.25, 0]}>
              <coneGeometry args={[0.55, 0.4, 4]} />
              <meshStandardMaterial color="#451a03" />
            </mesh>
            <mesh position={[0.3, 1.5, 0]}>
              <boxGeometry args={[0.35, 0.2, 0.02]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
          </group>

          {/* Tropical Palm Trees */}
          {[
            [1.2, 0.9],
            [0.9, -1.1]
          ].map(([px, pz], pi) => (
            <group key={pi} position={[px, 0.2, pz]}>
              <mesh position={[0, 0.5, 0]}>
                <cylinderGeometry args={[0.06, 0.08, 1.0, 5]} />
                <meshStandardMaterial color="#78350f" />
              </mesh>
              <mesh position={[0, 1.05, 0]}>
                <coneGeometry args={[0.55, 0.4, 5]} />
                <meshStandardMaterial color="#16a34a" />
              </mesh>
            </group>
          ))}

          {/* Golden Treasure Chest */}
          <mesh position={[0.3, 0.25, 0.9]} castShadow>
            <boxGeometry args={[0.4, 0.25, 0.3]} />
            <meshStandardMaterial color="#d97706" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* Floating 3D HTML Label */}
      {!hideTooltips && (
        <Html position={[0, 3.8, 0]} center distanceFactor={18}>
          <div className="pointer-events-none select-none flex flex-col items-center">
            <div
              onClick={() => onSelectNPC && onSelectNPC(island)}
              className={`pointer-events-auto cursor-pointer px-3 py-1.5 rounded-xl border shadow-2xl backdrop-blur-md transition-all flex items-center gap-2 ${
                hovered
                  ? "bg-slate-900 border-amber-400 scale-110 shadow-amber-500/30"
                  : "bg-slate-950/90 border-slate-700"
              }`}
            >
              <span className="text-lg">{island.emblem}</span>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-100 whitespace-nowrap flex items-center gap-1.5">
                  <span>{island.name}</span>
                  <span className="text-[9px] px-1 py-0.2 bg-amber-950 text-amber-300 border border-amber-700/50 rounded uppercase font-mono">
                    NPC
                  </span>
                </div>
                <div className="text-[10px] text-amber-300/80 font-mono">
                  {island.subtitle}
                </div>
              </div>
            </div>
            <div className="w-0.5 h-2 bg-slate-700"></div>
          </div>
        </Html>
      )}
    </group>
  );
}

export type { NPCIslandData };
