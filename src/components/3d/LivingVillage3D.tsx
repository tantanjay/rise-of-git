import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function LivingVillage3D() {
  const windmillRef = useRef<THREE.Group>(null);
  const sheepGroupRef = useRef<THREE.Group>(null);
  const chickensRef = useRef<THREE.Group>(null);
  const farmersRef = useRef<THREE.Group>(null);
  const workersRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // 1. Rotate Windmill Sails
    if (windmillRef.current) {
      windmillRef.current.rotation.z -= 0.02;
    }

    // 2. Animate Sheep Grazing & Wandering
    if (sheepGroupRef.current) {
      sheepGroupRef.current.children.forEach((sheep, i) => {
        // Bobbing head down to chew grass
        sheep.position.y = 0.25 + Math.sin(t * 2 + i * 1.5) * 0.03;
        sheep.rotation.y = Math.sin(t * 0.3 + i) * 0.4;
      });
    }

    // 3. Animate Chickens Pecking
    if (chickensRef.current) {
      chickensRef.current.children.forEach((chk, i) => {
        // Rapid pecking motion
        chk.rotation.x = Math.max(0, Math.sin(t * 8 + i * 2)) * 0.4;
      });
    }

    // 4. Animate Farmers Harvesting Rice / Wheat
    if (farmersRef.current) {
      farmersRef.current.children.forEach((farmer, i) => {
        // Sickle swinging / bowing
        farmer.rotation.x = Math.sin(t * 3 + i) * 0.25;
      });
    }

    // 5. Walking Villagers carrying resources
    if (workersRef.current) {
      workersRef.current.children.forEach((w, i) => {
        const offset = i * Math.PI;
        w.position.x = Math.sin(t * 0.8 + offset) * 3;
        w.rotation.y = (Math.cos(t * 0.8 + offset) > 0) ? 0 : Math.PI;
        // Walking bob
        w.position.y = 0.4 + Math.abs(Math.sin(t * 4)) * 0.08;
      });
    }
  });

  return (
    <group>
      {/* ==================================================== */}
      {/* 1. RICE & WHEAT FARMLAND (East Area)                */}
      {/* ==================================================== */}
      <group position={[11, 0, 4]}>
        {/* Soil Plot */}
        <mesh position={[0, 0.02, 0]} receiveShadow>
          <boxGeometry args={[8, 0.08, 9]} />
          <meshStandardMaterial color="#713f12" roughness={0.9} />
        </mesh>

        {/* Crops / Rice & Golden Wheat Rows */}
        {[-3, -1.8, -0.6, 0.6, 1.8, 3].map((cx, idx) => (
          <mesh key={idx} position={[cx, 0.3, 0]} castShadow>
            <boxGeometry args={[0.5, 0.45, 8]} />
            <meshStandardMaterial color={idx % 2 === 0 ? "#eab308" : "#84cc16"} roughness={0.7} />
          </mesh>
        ))}

        {/* 2 Animated Farmers Harvesting Crops */}
        <group ref={farmersRef}>
          {/* Farmer 1 */}
          <group position={[-1.2, 0.3, -1]}>
            <mesh position={[0, 0.25, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.2, 0.5, 8]} />
              <meshStandardMaterial color="#0284c7" />
            </mesh>
            {/* Straw Hat */}
            <mesh position={[0, 0.55, 0]}>
              <coneGeometry args={[0.35, 0.15, 8]} />
              <meshStandardMaterial color="#fef08a" />
            </mesh>
          </group>

          {/* Farmer 2 */}
          <group position={[1.2, 0.3, 1.5]}>
            <mesh position={[0, 0.25, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.2, 0.5, 8]} />
              <meshStandardMaterial color="#d97706" />
            </mesh>
            {/* Straw Hat */}
            <mesh position={[0, 0.55, 0]}>
              <coneGeometry args={[0.35, 0.15, 8]} />
              <meshStandardMaterial color="#fef08a" />
            </mesh>
          </group>
        </group>
      </group>

      {/* ==================================================== */}
      {/* 2. SHEEP & CHICKEN PASTURE (West Area)              */}
      {/* ==================================================== */}
      <group position={[-11, 0, 4]}>
        {/* Pasture Grass */}
        <mesh position={[0, 0.03, 0]} receiveShadow>
          <boxGeometry args={[8, 0.08, 9]} />
          <meshStandardMaterial color="#15803d" roughness={0.9} />
        </mesh>

        {/* Wooden Fence Around Pasture */}
        {[-3.8, 3.8].map((fx, i) => (
          <mesh key={i} position={[fx, 0.3, 0]} castShadow>
            <boxGeometry args={[0.12, 0.45, 8.8]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
        ))}
        {[-4.2, 4.2].map((fz, i) => (
          <mesh key={i} position={[0, 0.3, fz]} castShadow>
            <boxGeometry args={[7.8, 0.45, 0.12]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
        ))}

        {/* 4 Animated Fluffy Sheep */}
        <group ref={sheepGroupRef}>
          {[
            [-1.8, 1],
            [1.5, -1.2],
            [-0.8, -2],
            [1.2, 2]
          ].map(([sx, sz], sIdx) => (
            <group key={sIdx} position={[sx, 0.25, sz]}>
              {/* Fluffy Wool Body */}
              <mesh castShadow>
                <sphereGeometry args={[0.26, 10, 10]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.9} />
              </mesh>
              {/* Black Sheep Head */}
              <mesh position={[0.24, 0.1, 0]}>
                <sphereGeometry args={[0.12, 8, 8]} />
                <meshStandardMaterial color="#1e293b" />
              </mesh>
              {/* Tiny Legs */}
              {[-0.1, 0.1].map((lx, li) => (
                <mesh key={li} position={[lx, -0.2, 0]}>
                  <cylinderGeometry args={[0.04, 0.04, 0.16, 6]} />
                  <meshStandardMaterial color="#1e293b" />
                </mesh>
              ))}
            </group>
          ))}
        </group>

        {/* Wooden Chicken Coop */}
        <group position={[2.4, 0, -2.6]}>
          <mesh position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[1.2, 0.7, 1.2]} />
            <meshStandardMaterial color="#854d0e" />
          </mesh>
          <mesh position={[0, 0.85, 0]} castShadow>
            <coneGeometry args={[0.9, 0.4, 4]} />
            <meshStandardMaterial color="#b91c1c" />
          </mesh>
        </group>

        {/* 3 Animated Chickens */}
        <group ref={chickensRef} position={[1.4, 0.12, -2]}>
          {[
            [0, 0],
            [-0.4, 0.3],
            [0.3, 0.4]
          ].map(([cx, cz], ci) => (
            <group key={ci} position={[cx, 0, cz]}>
              {/* Chicken body */}
              <mesh>
                <sphereGeometry args={[0.08, 6, 6]} />
                <meshStandardMaterial color={ci === 1 ? "#d97706" : "#ffffff"} />
              </mesh>
              {/* Red Crest */}
              <mesh position={[0.02, 0.08, 0]}>
                <boxGeometry args={[0.02, 0.04, 0.04]} />
                <meshStandardMaterial color="#ef4444" />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      {/* ==================================================== */}
      {/* 3. WORKING WINDMILL (North-East Plaza)               */}
      {/* ==================================================== */}
      <group position={[9, 0, -7]}>
        {/* Tower Base */}
        <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.1, 1.6, 3.6, 12]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.7} />
        </mesh>
        {/* Conical Roof */}
        <mesh position={[0, 4, 0]} castShadow>
          <coneGeometry args={[1.4, 1.2, 12]} />
          <meshStandardMaterial color="#b45309" roughness={0.6} />
        </mesh>
        {/* Spinning Windmill Sails */}
        <group ref={windmillRef} position={[0, 3.2, 1.15]}>
          <mesh>
            <cylinderGeometry args={[0.15, 0.15, 0.2, 8]} />
            <meshStandardMaterial color="#78350f" />
          </mesh>
          {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, ai) => (
            <mesh key={ai} rotation={[0, 0, angle]} position={[Math.sin(angle) * 1.2, Math.cos(angle) * 1.2, 0]}>
              <boxGeometry args={[0.3, 2.2, 0.02]} />
              <meshStandardMaterial color="#fef08a" />
            </mesh>
          ))}
        </group>
      </group>

      {/* ==================================================== */}
      {/* 4. VILLAGERS CARRYING RESOURCES ON PATHWAY          */}
      {/* ==================================================== */}
      <group ref={workersRef} position={[0, 0, 7]}>
        {/* Villager 1 */}
        <group position={[-1.5, 0.4, 0]}>
          {/* Tunic */}
          <mesh position={[0, 0.25, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.22, 0.5, 8]} />
            <meshStandardMaterial color="#16a34a" />
          </mesh>
          {/* Head */}
          <mesh position={[0, 0.58, 0]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial color="#fde047" />
          </mesh>
          {/* Resource Basket on back */}
          <mesh position={[0, 0.35, -0.2]}>
            <boxGeometry args={[0.26, 0.3, 0.2]} />
            <meshStandardMaterial color="#92400e" />
          </mesh>
        </group>

        {/* Villager 2 */}
        <group position={[1.5, 0.4, 0]}>
          <mesh position={[0, 0.25, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.22, 0.5, 8]} />
            <meshStandardMaterial color="#d97706" />
          </mesh>
          <mesh position={[0, 0.58, 0]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial color="#fde047" />
          </mesh>
          {/* Bread / Food Sack */}
          <mesh position={[0, 0.35, -0.2]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial color="#fde68a" />
          </mesh>
        </group>
      </group>
    </group>
  );
}
