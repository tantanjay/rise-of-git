import { useMemo } from "react";
import { CivilizationType } from "@/types";
import { WorldCastles } from "./world/WorldCastles";

interface CivilizationWorldCastle3DProps {
  civilization: CivilizationType;
  hovered: boolean;
}

/** A single civilization castle. The world map draws all castles at once with `WorldCastles`. */
export function CivilizationWorldCastle3D({ civilization, hovered }: CivilizationWorldCastle3DProps) {
  const castles = useMemo(() => [{ id: "castle", civilization, x: 0, y: 0, z: 0, scale: 1 }], [civilization]);
  return <WorldCastles castles={castles} hoveredId={hovered ? "castle" : null} />;
}
