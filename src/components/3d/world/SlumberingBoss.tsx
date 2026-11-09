import { ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

/*
 * Where a world boss fell, the next boss of the zone's pool rises until it wakes: its model turns into a
 * translucent spectral phantom with a bright cyan rim glow (one shared material, so no extra draw calls) drifting
 * slowly up and down, under a "👻 <name> rises in …" badge that counts down. Its column of light and smoke are
 * the boss model's own effects (marked `fx`, left alone here).
 */

/** One phantom material for every slumbering boss; its glow pulses once per frame */
const GHOST = new THREE.MeshStandardMaterial({
  color: "#155e75",
  emissive: "#6d28d9",
  emissiveIntensity: 0.5,
  roughness: 0.35,
  transparent: true,
  opacity: 0.6,
  depthWrite: false
});
GHOST.onBeforeCompile = (shader) => {
  // Fresnel rim: edges facing away from the camera glow cyan
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    `#include <emissivemap_fragment>
    float ghostRim = 1.0 - abs(dot(normalize(vViewPosition), normal));
    totalEmissiveRadiance += vec3(0.35, 0.9, 1.0) * pow(ghostRim, 2.2) * 3.2;`
  );
};

let pulsedAt = -1;

/** Wraps a boss model: while `active`, every mesh wears the phantom material and casts no shadow */
export function Spectral({ active, children }: { active: boolean; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    const swapped: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; castShadow: boolean }> = [];
    if (active) {
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Invisible hit targets stay invisible
        if (!Array.isArray(mesh.material) && mesh.material.visible === false) return;
        // The boss's own aura, light column and smoke keep their shaders
        if (mesh.userData.fx) return;
        swapped.push({ mesh, material: mesh.material, castShadow: mesh.castShadow });
        mesh.material = GHOST;
        mesh.castShadow = false;
      });
    }
    return () => {
      for (const s of swapped) {
        s.mesh.material = s.material;
        s.mesh.castShadow = s.castShadow;
      }
    };
  }, [active]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    if (!active) {
      if (g.position.y !== 0) g.position.y = 0;
      return;
    }
    const t = clock.elapsedTime;
    g.position.y = 0.35 + Math.sin(t * 0.8) * 0.25;
    // Shared material: pulse once per frame, however many bosses slumber
    if (pulsedAt !== clock.elapsedTime) {
      pulsedAt = clock.elapsedTime;
      GHOST.opacity = 0.6 + Math.sin(t * 1.6) * 0.1;
      GHOST.emissiveIntensity = 0.5 + Math.sin(t * 1.6) * 0.2;
    }
  });

  return <group ref={group}>{children}</group>;
}

/** "1:04:09" / "4:09" */
function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Floating badge over the rising boss; the countdown is written straight into the DOM once a second */
export function SlumberBadge({ until, y, name }: { until: number; y: number; name: string }) {
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      if (text.current) text.current.textContent = countdown(until - Date.now());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);
  return (
    <Html zIndexRange={[30, 16]} position={[0, y, 0]} center distanceFactor={45} style={{ pointerEvents: "none" }}>
      <div className="px-2.5 py-1 rounded-lg border border-cyan-400/60 bg-slate-950/90 text-cyan-200 text-[11px] font-mono font-bold whitespace-nowrap shadow-lg shadow-cyan-950/50 select-none">
        👻 {name} rises in <span ref={text} className="text-cyan-100 tabular-nums" />
      </div>
    </Html>
  );
}
