import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ActiveMarch } from "@/types";
import { BATTLE_OUTCOME_MS, CIV_WAR_COLOR } from "@/utils/war";
import { Terrain } from "./terrain";
import { CastlePlacement } from "./WorldCastles";

/*
 * Teleport flashes on the world map. A castle that changes civilization (Voidrift conquest, being cast
 * out, a peaceful swap, stepping into an open place) moves to its new province: a pillar of light and a
 * shockwave ring burst where it stood, then where it lands. An army that conquered a Voidrift slot is
 * pulled through the rift with its castle, so it vanishes in a flash at the battle site.
 * Two InstancedMeshes (pillar, ring) shared by every flash, hidden while none play; nothing casts shadows.
 */

const FLASH_MS = 2600;
/** The landing flash starts this long after the departure flash */
const ARRIVE_DELAY_MS = 550;
/** A castle that moved further than this teleported (placements never drift otherwise) */
const MOVED_MIN = 3;
const CAPACITY = 16;
const PILLAR_HEIGHT = 46;

interface Flash {
  x: number;
  y: number;
  z: number;
  scale: number;
  color: THREE.Color;
  /** Wall-clock start (ms) */
  at: number;
}

/** Open unit-radius cylinder whose vertex alpha fades from the base to 0 at the top */
function fadingPillar(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.75, 1, PILLAR_HEIGHT, 20, 10, true).translate(0, PILLAR_HEIGHT / 2, 0);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) colors.set([1, 1, 1, 0.85 * Math.pow(1 - pos.getY(i) / PILLAR_HEIGHT, 1.4)], i * 4);
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  return g;
}

const PILLAR = fadingPillar();
const RING = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
const glow = { transparent: true, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true } as const;

const WHITE = new THREE.Color("#ffffff");
const flashColor = (hex: string) => new THREE.Color(hex).lerp(WHITE, 0.25);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function TeleportFlashes({ castles, marches, terrain }: { castles: CastlePlacement[]; marches: ActiveMarch[]; terrain: Terrain }) {
  const flashes = useRef<Flash[]>([]);
  const lastSpot = useRef(new Map<string, { x: number; z: number; civ: CastlePlacement["civilization"] }>());
  const flashedMarches = useRef(new Set<string>());
  const pillars = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);

  // Castles that jumped to another province since the last layout
  useEffect(() => {
    const now = Date.now();
    const seen = lastSpot.current;
    for (const c of castles) {
      const prev = seen.get(c.id);
      if (prev && Math.hypot(prev.x - c.x, prev.z - c.z) > MOVED_MIN) {
        const scale = c.scale;
        flashes.current.push(
          { x: prev.x, y: terrain.height(prev.x, prev.z), z: prev.z, scale, color: flashColor(CIV_WAR_COLOR[prev.civ]), at: now },
          { x: c.x, y: c.y, z: c.z, scale, color: flashColor(CIV_WAR_COLOR[c.civilization]), at: now + ARRIVE_DELAY_MS }
        );
      }
      seen.set(c.id, { x: c.x, z: c.z, civ: c.civilization });
    }
  }, [castles, terrain]);

  // Armies that won a Voidrift slot go home with their castle (the server ends their march where it stands):
  // they vanish in a flash once their victory banner has been shown
  useEffect(() => {
    const now = Date.now();
    for (const m of marches) {
      if (flashedMarches.current.has(m.id)) continue;
      if (!m.battleResult?.civilizationSwapped || m.startX !== m.targetX || m.startZ !== m.targetZ) continue;
      flashedMarches.current.add(m.id);
      const at = (m.returnTime ?? m.actUntil ?? m.arrivalTime) + BATTLE_OUTCOME_MS - 600;
      if (at < now - FLASH_MS) continue; // long over (e.g. on page load)
      flashes.current.push({ x: m.targetX, y: terrain.height(m.targetX, m.targetZ), z: m.targetZ, scale: 0.7, color: flashColor(CIV_WAR_COLOR.arcane), at });
    }
  }, [marches, terrain]);

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), c: new THREE.Color() }), []);

  useFrame(() => {
    const pm = pillars.current;
    const rm = rings.current;
    if (!pm || !rm) return;
    const now = Date.now();
    flashes.current = flashes.current.filter((f) => now - f.at < FLASH_MS);
    let n = 0;
    for (const f of flashes.current) {
      if (n >= CAPACITY) break;
      const t = (now - f.at) / FLASH_MS;
      if (t < 0) continue;
      const fade = Math.min(1, t / 0.08) * Math.pow(1 - t, 1.3);

      // Pillar: shoots up at once, then narrows to a thread as it fades
      const w = f.scale * 2.6 * Math.pow(1 - t, 0.6) + 0.05;
      tmp.p.set(f.x, f.y, f.z);
      tmp.s.set(w, Math.min(1, t / 0.12), w);
      pm.setMatrixAt(n, tmp.m.compose(tmp.p, tmp.q, tmp.s));
      pm.setColorAt(n, tmp.c.copy(f.color).multiplyScalar(fade));

      // Shockwave ring rolling out over the ground (0.3 above it, clear of the terrain)
      const r = f.scale * (1 + 7 * easeOut(t));
      tmp.p.set(f.x, f.y + 0.3, f.z);
      tmp.s.set(r, 1, r);
      rm.setMatrixAt(n, tmp.m.compose(tmp.p, tmp.q, tmp.s));
      rm.setColorAt(n, tmp.c.copy(f.color).multiplyScalar(Math.pow(1 - t, 1.6)));
      n++;
    }
    for (const mesh of [pm, rm]) {
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  // Allocate the colour buffers up front so setColorAt never has to create them mid-flash
  useEffect(() => {
    for (const mesh of [pillars.current, rings.current]) {
      if (!mesh) continue;
      for (let i = 0; i < CAPACITY; i++) mesh.setColorAt(i, WHITE);
      mesh.count = 0;
      mesh.visible = false;
    }
  }, []);

  return (
    <group>
      <instancedMesh ref={pillars} args={[PILLAR, undefined, CAPACITY]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial vertexColors {...glow} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[RING, undefined, CAPACITY]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial {...glow} />
      </instancedMesh>
    </group>
  );
}
