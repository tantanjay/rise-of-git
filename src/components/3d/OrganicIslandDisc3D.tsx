import { useMemo } from "react";
import * as THREE from "three";

interface OrganicIslandDisc3DProps {
  seed: number;
  baseRadius?: number;
  sandColor?: string;
  grassColor?: string;
}

export function OrganicIslandDisc3D({
  seed,
  baseRadius = 3.2,
  sandColor = "#fef08a",
  grassColor = "#16a34a"
}: OrganicIslandDisc3DProps) {
  const { sandGeometry, grassGeometry, satellites } = useMemo(() => {
    const numPoints = 28;
    const sandShape = new THREE.Shape();
    const grassShape = new THREE.Shape();

    // Deterministic pseudo-random seed offsets
    const s1 = Math.sin(seed * 17.13) * 10;
    const s2 = Math.cos(seed * 43.19) * 10;
    const s3 = Math.sin(seed * 71.91) * 10;
    const s4 = Math.cos(seed * 97.37) * 10;

    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      // Layered harmonic waves create unique bays, capes, and peninsulas
      const wave = 1.0
        + 0.22 * Math.sin(angle * 2 + s1)
        + 0.18 * Math.cos(angle * 3 + s2)
        + 0.12 * Math.sin(angle * 5 + s3)
        + 0.08 * Math.cos(angle * 7 + s4);

      const rSand = (baseRadius * 1.15) * wave;
      const rGrass = (baseRadius * 0.95) * wave;

      const sx = Math.cos(angle) * rSand;
      const sy = Math.sin(angle) * rSand;
      const gx = Math.cos(angle) * rGrass;
      const gy = Math.sin(angle) * rGrass;

      if (i === 0) {
        sandShape.moveTo(sx, sy);
        grassShape.moveTo(gx, gy);
      } else {
        sandShape.lineTo(sx, sy);
        grassShape.lineTo(gx, gy);
      }
    }

    const sandGeom = new THREE.ExtrudeGeometry(sandShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.08,
      bevelThickness: 0.06
    });

    const grassGeom = new THREE.ExtrudeGeometry(grassShape, {
      depth: 0.20,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06
    });

    // 2-3 satellite islets / rocks scattered offshore
    const sats = [];
    for (let k = 0; k < 3; k++) {
      const satAngle = (k * 2.1) + s1;
      const satDist = baseRadius * 1.35 + (k * 0.25);
      sats.push({
        x: Math.cos(satAngle) * satDist,
        z: Math.sin(satAngle) * satDist,
        r: 0.25 + (k * 0.1)
      });
    }

    return { sandGeometry: sandGeom, grassGeometry: grassGeom, satellites: sats };
  }, [seed, baseRadius]);

  return (
    <group>
      {/* 1. Beach Sand Rim (Organic Extrusion) */}
      <mesh
        geometry={sandGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={sandColor} roughness={0.9} />
      </mesh>

      {/* 2. Elevated Grass Interior (Organic Extrusion) */}
      <mesh
        geometry={grassGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.14, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={grassColor} roughness={0.75} />
      </mesh>

      {/* 3. Offshore Satellite Islets / Rocks */}
      {satellites.map((sat, i) => (
        <mesh key={i} position={[sat.x, 0.04, sat.z]} receiveShadow>
          <cylinderGeometry args={[sat.r, sat.r + 0.1, 0.12, 6]} />
          <meshStandardMaterial color={sandColor} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
