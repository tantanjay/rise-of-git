import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { InstancedParts } from "@/components/3d/city/InstancedParts";
import { useHd } from "@/utils/graphics";
import { REMAINS_STAGE_AT, RemainsSite, RemainsStage, buildRemains } from "./battleRemains";

/*
 * Battle effects on the world map, each drawn with a fixed number of instanced meshes however many battles run:
 *   ClashingSwords → crossed swords floating over every live battle, striking in rhythm with the 10 s rounds
 *                    (four blows per round, the heaviest on the round tick) with golden sparks and dust (5 draw calls)
 *   DefeatMarkers  → the remains of a routed army on its battlefield (battleRemains.ts): its snapped standard in its
 *                    colours, broken weapons and shields, a fire burning down to a wisp of smoke (a few draws in all,
 *                    however many battles; none when no army has been routed)
 * Nothing here casts shadows (the shadow map is static).
 */

export interface ClashSpot {
  id: string;
  x: number;
  /** Ground height at the clash point */
  y: number;
  z: number;
  /** Epoch ms of a round tick (rounds follow every roundMs from here) */
  roundAnchor: number;
  /** The round shown between the swords ("Round 2/6"); workers attacked at a node have none */
  round?: string;
}

export interface DefeatSpot extends RemainsSite {
  /** Epoch ms the battle ended and the remains appeared, and when they are gone */
  from: number;
  until: number;
}

export const SWORD_LIFT = 9;
const STRIKES_PER_ROUND = 4;
const SPARKS_PER_CLASH = 10;
const DUST_PER_CLASH = 4;
const SPARK_LIFE = 0.55;

// Sword parts in sword space: grip at the origin, blade pointing up (+y)
const BLADE = new THREE.BoxGeometry(0.22, 2.4, 0.07).translate(0, 1.55, 0);
const GUARD = new THREE.BoxGeometry(0.95, 0.16, 0.2).translate(0, 0.3, 0);
const GRIP = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8).translate(0, 0, 0);
const POMMEL = new THREE.SphereGeometry(0.13, 10, 8).translate(0, -0.3, 0);
const SPARK = new THREE.OctahedronGeometry(0.09, 0);

const cap = (n: number) => Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, n))));

const _base = new THREE.Matrix4();
const _sword = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function ClashingSwords({ clashes, roundMs }: { clashes: ClashSpot[]; roundMs: number }) {
  const blade = useRef<THREE.InstancedMesh>(null);
  const guard = useRef<THREE.InstancedMesh>(null);
  const grip = useRef<THREE.InstancedMesh>(null);
  const pommel = useRef<THREE.InstancedMesh>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const swordCap = cap(clashes.length * 2);
  const sparkCap = cap(clashes.length * (SPARKS_PER_CLASH + DUST_PER_CLASH));
  // Fixed random directions per spark so bursts look scattered but stay deterministic
  const sparkDirs = useMemo(
    () =>
      Array.from({ length: SPARKS_PER_CLASH + DUST_PER_CLASH }, (_, i) => {
        const a = (i / SPARKS_PER_CLASH) * Math.PI * 2 + i * 0.7;
        const up = i < SPARKS_PER_CLASH ? 0.6 + (i % 3) * 0.35 : -0.4;
        return new THREE.Vector3(Math.cos(a), up, Math.sin(a) * 0.6).normalize();
      }),
    []
  );

  useEffect(() => {
    // Sparks are gold, dust puffs sandy: colours are set once per capacity
    const mesh = sparks.current;
    if (!mesh) return;
    for (let i = 0; i < sparkCap; i++) mesh.setColorAt(i, _c.set(i % (SPARKS_PER_CLASH + DUST_PER_CLASH) < SPARKS_PER_CLASH ? "#fde68a" : "#d6c7a1"));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [sparkCap]);

  useFrame((state) => {
    const meshes = [blade.current, guard.current, grip.current, pommel.current];
    if (meshes.some((m) => !m) || !sparks.current) return;
    const now = Date.now();
    const cam = state.camera.position;
    const strikeMs = roundMs / STRIKES_PER_ROUND;
    let si = 0;
    let pi = 0;
    clashes.forEach((c) => {
      const since = (((now - c.roundAnchor) % roundMs) + roundMs) % roundMs;
      const strike = since / strikeMs;
      const u = strike % 1; // 0..1 within one blow
      const heavy = Math.floor(strike) === 0; // the blow that lands on the round tick
      // Wind up (apart) then snap together; impact at u = 0
      const swing = u < 0.75 ? Math.sin((u / 0.75) * Math.PI * 0.5) * 0.55 : 0.55 * (1 - (u - 0.75) / 0.25) ** 2;
      // Stay readable from high above: grow with camera distance
      const dist = cam.distanceTo(_v.set(c.x, c.y, c.z));
      const scale = Math.min(3.2, Math.max(1.4, dist / 45)) * (heavy && u < 0.08 ? 1.12 : 1);
      const yaw = Math.atan2(cam.x - c.x, cam.z - c.z);
      _base.compose(_v.set(c.x, c.y + SWORD_LIFT, c.z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(scale, scale, scale));
      for (const side of [-1, 1]) {
        // Grips apart at the bottom, blades crossing above; swing tilts them away from each other
        const tilt = side * (0.62 + swing);
        _sword.compose(_v.set(side * 0.95, 0, 0), _q.setFromEuler(_e.set(0, 0, tilt)), _s.set(1, 1, 1));
        _m.multiplyMatrices(_base, _sword);
        for (const mesh of meshes) mesh!.setMatrixAt(si, _m);
        si++;
      }
      // Sparks and dust fly out of the crossing point for SPARK_LIFE after each blow
      const age = (u * strikeMs) / 1000;
      const alive = age < SPARK_LIFE;
      const k = alive ? age / SPARK_LIFE : 1;
      sparkDirs.forEach((d, j) => {
        const isSpark = j < SPARKS_PER_CLASH;
        const reach = (isSpark ? 1.6 : 0.9) * (heavy ? 1.6 : 1) * k;
        const size = alive ? (isSpark ? (1 - k) * (heavy ? 1.6 : 1.1) : (0.6 + k * 1.4) * (1 - k)) : 0;
        _v.set(d.x * reach, 2.0 + d.y * reach - (isSpark ? k * k * 0.8 : 0), d.z * reach);
        _m.compose(_v, _q.identity(), _s.set(size, size, size));
        sparks.current!.setMatrixAt(pi++, _m.premultiply(_base));
      });
    });
    for (const mesh of meshes) {
      mesh!.count = si;
      mesh!.instanceMatrix.needsUpdate = true;
    }
    sparks.current.count = pi;
    sparks.current.instanceMatrix.needsUpdate = true;
  });

  const visible = clashes.length > 0;
  return (
    <group visible={visible}>
      <instancedMesh ref={blade} args={[BLADE, undefined, swordCap]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial color="#e2e8f0" metalness={0.7} roughness={0.25} emissive="#94a3b8" emissiveIntensity={0.35} />
      </instancedMesh>
      <instancedMesh ref={guard} args={[GUARD, undefined, swordCap]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.35} emissive="#b45309" emissiveIntensity={0.3} />
      </instancedMesh>
      <instancedMesh ref={grip} args={[GRIP, undefined, swordCap]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial color="#5b3a1e" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={pommel} args={[POMMEL, undefined, swordCap]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial color="#fbbf24" metalness={0.6} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={sparks} args={[SPARK, undefined, sparkCap]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** How far the remains have burnt down at `now`: burning, smouldering, cold */
function stageAt(d: DefeatSpot, now: number): RemainsStage {
  const u = (now - d.from) / Math.max(1, d.until - d.from);
  return u >= REMAINS_STAGE_AT[2] ? 2 : u >= REMAINS_STAGE_AT[1] ? 1 : 0;
}

/**
 * Every routed army's remains in one instanced part list (through the model kit in HD). React rebuilds it only when
 * remains appear or go and when one burns down to its next stage; flames, embers, smoke and banners move on the GPU.
 */
export function DefeatMarkers({ markers, heightAt }: { markers: DefeatSpot[]; heightAt: (x: number, z: number) => number }) {
  const hd = useHd("models");
  const [now, setNow] = useState(() => Date.now());
  const stages = markers.map((d) => stageAt(d, now)).join("");
  useEffect(() => {
    // Wake up when the next one burns down
    const t = Date.now();
    const next = markers.flatMap((d) => REMAINS_STAGE_AT.map((f) => d.from + f * (d.until - d.from))).filter((at) => at > t);
    if (next.length === 0) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(...next) - t + 20);
    return () => clearTimeout(id);
  }, [markers, now]);
  const parts = useMemo(() => markers.flatMap((d, i) => buildRemains(d, Number(stages[i]) as RemainsStage, heightAt)), [markers, stages, heightAt]);
  if (parts.length === 0) return null;
  return <InstancedParts parts={parts} shadows={false} kit={hd} />;
}
