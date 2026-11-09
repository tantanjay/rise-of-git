import { useState, useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { DeveloperKingdom } from "@/types";
import { OrganicIslandDisc3D } from "./OrganicIslandDisc3D";
import { CivilizationWorldCastle3D } from "./CivilizationWorldCastle3D";

interface KingdomPlotSphere3DProps {
  kingdom: DeveloperKingdom;
  sphereRadius: number;
  lat: number;
  lon: number;
  scale?: number;
  hideTooltips?: boolean;
  onEnter: (id: string) => void;
}

export function KingdomPlotSphere3D({
  kingdom,
  sphereRadius,
  lat,
  lon,
  scale = 1,
  hideTooltips = false,
  onEnter
}: KingdomPlotSphere3DProps) {
  const [hovered, setHovered] = useState(false);

  // Position and surface normal on the sphere
  const { position, quaternion } = useMemo(() => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -sphereRadius * Math.sin(phi) * Math.cos(theta);
    const z = sphereRadius * Math.sin(phi) * Math.sin(theta);
    const y = sphereRadius * Math.cos(phi);

    const pos = new THREE.Vector3(x, y, z);
    const up = new THREE.Vector3(0, 1, 0);
    const normal = pos.clone().normalize();

    const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
    return { position: pos, quaternion: quat };
  }, [sphereRadius, lat, lon]);

  // Unique deterministic seed for organic island shape
  const islandSeed = useMemo(() => {
    return kingdom.id.split("").reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 7);
  }, [kingdom.id]);

  const civConfig = {
    human: {
      sand: "#fef08a",
      grass: "#16a34a",
      emblem: "👑",
      name: "Human",
      badgeColor: "text-blue-400"
    },
    elf: {
      sand: "#a7f3d0",
      grass: "#059669",
      emblem: "🌸",
      name: "Elf",
      badgeColor: "text-emerald-400"
    },
    dwarf: {
      sand: "#78716c",
      grass: "#334155",
      emblem: "⚒️",
      name: "Dwarf",
      badgeColor: "text-orange-400"
    },
    orc: {
      sand: "#d97706",
      grass: "#92400e",
      emblem: "⚔️",
      name: "Orc",
      badgeColor: "text-red-400"
    },
    arcane: {
      sand: "#475569",
      grass: "#581c87",
      emblem: "🔮",
      name: "Arcane",
      badgeColor: "text-purple-400"
    }
  }[kingdom.civilization] || {
    sand: "#fef08a",
    grass: "#16a34a",
    emblem: "👑",
    name: "Human",
    badgeColor: "text-blue-400"
  };

  return (
    <group
      position={position}
      quaternion={quaternion}
      scale={(hovered ? 1.12 : 1) * scale}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onEnter(kingdom.id); }}
    >
      {/* 1. Organic, Procedural Non-Circular Island Base */}
      <OrganicIslandDisc3D
        seed={islandSeed}
        baseRadius={3.3}
        sandColor={civConfig.sand}
        grassColor={civConfig.grass}
      />

      {/* 2. Distinct 3D World Castle & Environmental Props for this Civilization */}
      <CivilizationWorldCastle3D
        civilization={kingdom.civilization}
        hovered={hovered}
      />

      {/* 3. Floating 3D HTML Label */}
      {!hideTooltips && (
        <Html position={[0, 4.4, 0]} center distanceFactor={18}>
          <div className="pointer-events-none select-none flex flex-col items-center">
            <div
              onClick={() => onEnter(kingdom.id)}
              className={`pointer-events-auto cursor-pointer px-3.5 py-1.5 rounded-xl border shadow-2xl backdrop-blur-md transition-all flex items-center gap-2 ${
                hovered
                  ? "bg-slate-900 border-amber-400 scale-110 shadow-amber-500/30"
                  : "bg-slate-950/90 border-slate-700"
              }`}
            >
              <span className="text-base">{civConfig.emblem}</span>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-100 whitespace-nowrap flex items-center gap-1.5">
                  <span>{kingdom.name}</span>
                  <span className={`text-[9px] px-1 py-0.2 bg-slate-800 ${civConfig.badgeColor} rounded uppercase font-mono font-bold`}>
                    {civConfig.name}
                  </span>
                </div>
                <div className="text-[10px] text-emerald-400 font-mono font-bold">
                  🌾 {kingdom.activity.pastWeekCommits} commits this wk
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
