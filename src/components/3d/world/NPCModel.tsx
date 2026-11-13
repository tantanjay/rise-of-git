import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MapNPC } from "@/types";
import { InstancedParts } from "@/components/3d/city/InstancedParts";
import { HAND_TUNED_NPCS, buildNPCModel, hasNPCModel, wholeModelIdles } from "./npcs";
import { BossModel, hasRig } from "./BossModel";
import { rngFor } from "@/utils/random";

/*
 * Creatures and treasure that idle as a whole (mobs prowl, flyers float, bands breathe and look round, treasure bobs)
 * do it on the GPU through `wholeModelIdles`, exactly as in the map's batch; in a site only its living things breathe,
 * and the wreck rocks (`Part.model`, set by buildNPCModel). Only models unlike any other keep a
 * hand-tuned idle here (the kraken, the sandworm, nests, portals).
 */

const ACCENTS: Record<string, string> = {
  common: "#94a3b8",
  uncommon: "#22c55e",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f59e0b",
  mythical: "#e11d48"
};

/**
 * The 3D model of any map NPC (bosses, landmarks, buffer kingdoms, terrain NPCs, roving spawns,
 * resource nodes), with its idle animation. World bosses are rigged models (`BossModel`) that also strike. Shared by the world map and the Codex preview.
 * Rarity rings, hover and tooltips are the caller's job.
 */
export function NPCModel({
  npc,
  slumbering = false,
  fighting,
  showcase = false,
  ruined = false,
  hd = false
}: {
  npc: Pick<MapNPC, "horrorPhase" | "id" | "type" | "x" | "z" | "rarity" | "landmarkState" | "landmarkStep" | "realm">;
  /** World boss: the next boss rising as a phantom where the last one fell */
  slumbering?: boolean;
  /** World boss: armies attack it from here, so it turns on them and strikes */
  fighting?: { x: number; z: number };
  /** Codex preview: a boss shows its strike every few seconds */
  showcase?: boolean;
  /** A frontier gate whose walls burn: broken open */
  ruined?: boolean;
  /** Drawn through the HD model kit (its HD version) */
  hd?: boolean;
}) {
  const animRef = useRef<THREE.Group>(null);
  // Creatures that walk, hop, slither or fly about on their own move on the GPU (like on the map); the others idle as a
  // whole there too, about the model's ground point
  const parts = useMemo(() => {
    if (!hasNPCModel(npc.type)) return null;
    const model = buildNPCModel(npc as MapNPC, { ruined });
    const wholes = wholeModelIdles(npc, model);
    return model.map((p, i) => (wholes[i] ? { ...p, model: wholes[i] } : p));
  }, [npc, ruined]);
  const handTuned = HAND_TUNED_NPCS.has(npc.type);
  // Phase, tempo and size from the id, so two NPCs of a type never move in step
  const life = useMemo(() => {
    const r = rngFor(`${npc.id}:idle`);
    return { ph: r() * Math.PI * 2, sp: 0.8 + r() * 0.45, amp: 0.75 + r() * 0.55, turn: r() < 0.5 ? -1 : 1 };
  }, [npc.id]);
  const accent = ACCENTS[npc.rarity ?? "common"] ?? ACCENTS.common;

  useFrame((state, delta) => {
    const { ph, sp, amp, turn } = life;
    const t = state.clock.elapsedTime * sp + ph;
    const g = animRef.current;
    if (!g || !handTuned) return;
    if (npc.type === "kraken") {
      g.position.y = Math.sin(t * 1.0) * 0.25 * amp;
      g.rotation.y += delta * 0.2 * sp * turn;
    } else if (npc.type === "sandworm") {
      g.position.y = Math.sin(t * 0.8) * 0.35 * amp - 0.2;
      g.rotation.y += delta * 0.15 * sp * turn;
    } else if (npc.type === "dragon_nest" || npc.type === "mermaid_rock") {
      g.position.y = Math.sin(t * 1.4) * 0.08 * amp;
    } else if (npc.type === "portal" || npc.type === "fairy_ring") {
      g.rotation.y = Math.sin(t * 0.5) * 0.15 * amp;
    }
  });

  if (hasRig(npc.type)) {
    // Only bosses turn on their attackers
    const fightYaw = fighting && (npc.type.startsWith("boss-") || npc.horrorPhase) ? Math.atan2(fighting.x - npc.x, fighting.z - npc.z) : null;
    return <BossModel type={npc.type} slumbering={slumbering} fightYaw={fightYaw} showcase={showcase} cryId={showcase ? undefined : npc.id} seedId={npc.horrorPhase ? npc.id : undefined} />;
  }

  return (
    <group ref={animRef}>
      {parts && <InstancedParts parts={parts} kit={hd} />}

      {/* Fallback for types without a model of their own */}
      {!parts && (
          <group position={[0, 0.2, 0]}>
            <mesh position={[0, 0.4, 0]} castShadow>
              <cylinderGeometry args={[1.2, 1.6, 0.8, 8]} />
              <meshStandardMaterial color="#1e293b" roughness={0.8} />
            </mesh>
            <mesh position={[0, 1.4, 0]}>
              <octahedronGeometry args={[0.7, 0]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.0} />
            </mesh>
          </group>
        )}
    </group>
  );
}
