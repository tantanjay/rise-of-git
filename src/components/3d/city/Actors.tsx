import { useLayoutEffect, useMemo, useRef, MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Actor, ActorKind, Shape, getShapeGeometry } from "./parts";
import { actorTemplate, LIGHT_HALOS } from "./actorTemplates";
import type { CivilizationType } from "@/types";
import { pose, poseBounds, staysPut, wingLift } from "./actorMotion";
import { ActorsHd, HIDDEN, groundMark, hideAll } from "./ActorsHd";
import { hdLightHalo } from "./actorHd";
import { useHd } from "@/utils/graphics";
import { viewDistance } from "./InstancedParts";

const _base = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _c = new THREE.Color();

/** Instance buffers are allocated in power-of-two capacities, so agents coming and going don't rebuild them */
const capacityFor = (n: number) => Math.max(8, 2 ** Math.ceil(Math.log2(Math.max(1, n))));

/** Kinds that stand on the ground and get a blob shadow (not windmill sails, gears, rings or sparkles) */
const GROUNDED = (kind: ActorKind) => !["sails", "rings", "gear", "sparkle"].includes(kind) && !kind.startsWith("light_");

export interface FrameShared {
  visible: boolean;
  frustum: THREE.Frustum;
  blob: THREE.InstancedMesh | null;
  /** Ground height under (x, z): actor y is then an offset above the ground (world map) */
  heightAt?: (x: number, z: number) => number;
  /** Per kind, per agent: where it can go (`AgentPath`) */
  paths: AgentPath[][];
  /** The water's surface (world map): an agent standing below it wades, a ring of foam round it instead of its blob */
  waterLevel?: number;
  wake: THREE.InstancedMesh | null;
  /** Wake rings written this frame */
  wakes: number;
}


/** An agent's whole path (with the ground under it), and the ground under it when it never moves (NaN if it does) */
export interface AgentPath {
  box: THREE.Box3;
  ground: number;
}

/** Where an agent can be at any time, so one whose path is out of view is skipped before its pose is worked out */
function agentPath(a: Actor, heightAt?: (x: number, z: number) => number): AgentPath {
  const b = poseBounds(a);
  let g0 = 0;
  let g1 = 0;
  if (heightAt) {
    // The ground over the path, sampled, with room for bumps between the samples
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    const n = span > 0 ? Math.min(5, 2 + Math.ceil(span / 3)) : 1;
    g0 = Infinity;
    g1 = -Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const h = heightAt(n > 1 ? b.x0 + ((b.x1 - b.x0) * i) / (n - 1) : b.x0, n > 1 ? b.z0 + ((b.z1 - b.z0) * j) / (n - 1) : b.z0);
        g0 = Math.min(g0, h);
        g1 = Math.max(g1, h);
      }
    }
    if (n > 1) {
      g0 -= 1 + 0.1 * span;
      g1 += 1 + 0.1 * span;
    }
  }
  // The sphere an agent is tested with
  const r = 1.6 * Math.max(1, a.scale ?? 1);
  const box = new THREE.Box3(new THREE.Vector3(b.x0 - r, b.y0 + g0 - r, b.z0 - r), new THREE.Vector3(b.x1 + r, b.y1 + g1 + r, b.z1 + r));
  return { box, ground: heightAt && staysPut(a) ? heightAt(a.x, a.z) : NaN };
}

const BLOB_Y = 0.03;

/** Soft radial glow for the halo round carried lights (white centre fading out; tinted per instance) */
const HALO_TEXTURE = (() => {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const HALO_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const HALO_MATERIAL = new THREE.MeshBasicMaterial({ map: HALO_TEXTURE, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.85 });
const _hp = new THREE.Vector3();
const noRaycast = () => null;
const _wing = new THREE.Matrix4();
const _rz = new THREE.Matrix4();
const _sphere = new THREE.Sphere(new THREE.Vector3(), 1.6);

interface NormalKind {
  kind: ActorKind;
  list: Actor[];
  blobOffset: number;
}

/**
 * Every kind in Normal: one instanced mesh per (shape, lit/unlit) for all kinds together. Each kind owns a run of slots
 * in a mesh (agents × its template parts of that shape), coloured once; each frame the on-screen agents' parts are posed
 * on the CPU into their slots (off-screen ones keep last frame's), so draws grow with shapes, not with kinds.
 */
function ActorsNormal({ kinds, shared }: { kinds: NormalKind[]; shared: MutableRefObject<FrameShared> }) {
  const layout = useMemo(() => {
    const meshes = new Map<string, { shape: Shape; glow: boolean; slots: number }>();
    const perKind = kinds.map(({ kind, list }) => {
      const tpl = actorTemplate(kind);
      // Each template part's mesh and its place among the kind's parts of that shape
      const count = new Map<string, number>();
      const parts = tpl.map((sp) => {
        const key = `${sp.shape}|${sp.glow ? 1 : 0}`;
        const r = count.get(key) ?? 0;
        count.set(key, r + 1);
        _e.set(sp.rx || 0, sp.ry || 0, sp.rz || 0);
        const local = new THREE.Matrix4().compose(new THREE.Vector3(sp.x, sp.y, sp.z), new THREE.Quaternion().setFromEuler(_e), new THREE.Vector3(sp.w, sp.h, sp.d));
        // Wings turn about their inner edge (the shoulder): to it, the beat, and back
        const hx = sp.flap ? sp.x - (sp.flap * sp.w) / 2 : 0;
        const hinge = sp.flap ? { side: sp.flap, to: new THREE.Matrix4().makeTranslation(hx, sp.y, sp.z), back: new THREE.Matrix4().makeTranslation(-hx, -sp.y, -sp.z) } : null;
        return { key, r, local, hinge, color: sp.color };
      });
      // The kind's run in each mesh it uses: where it starts and its parts per agent
      const runs = new Map<string, { offset: number; n: number }>();
      for (const [key, n] of count) {
        const [shape, glow] = key.split("|");
        let m = meshes.get(key);
        if (!m) meshes.set(key, (m = { shape: shape as Shape, glow: glow === "1", slots: 0 }));
        runs.set(key, { offset: m.slots, n });
        m.slots += list.length * n;
      }
      const halo = kind.startsWith("light_") ? LIGHT_HALOS[kind.slice(6) as CivilizationType] : undefined;
      return { parts, runs, winged: parts.some((pt) => pt.hinge), grounded: GROUNDED(kind), halo };
    });
    return { meshes: [...meshes.entries()], perKind };
  }, [kinds]);

  const refs = useRef(new Map<string, THREE.InstancedMesh>());
  const haloRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  // Which agents were posed last frame: one leaving the screen is hidden, not left standing where it was last seen
  const shown = useMemo(() => kinds.map(({ list }) => new Uint8Array(list.length)), [kinds]);

  useLayoutEffect(() => {
    for (const [key, m] of layout.meshes) {
      const mesh = refs.current.get(key);
      if (!mesh) continue;
      mesh.count = m.slots; // only the live agents are drawn; the rest of the capacity is spare
      // Nobody is posed until they are first on screen
      hideAll(mesh, m.slots);
    }
    shown.forEach((s) => s.fill(0));
    kinds.forEach(({ list }, k) => {
      const { parts, runs, halo } = layout.perKind[k];
      for (const pt of parts) {
        const mesh = refs.current.get(pt.key);
        const run = runs.get(pt.key)!;
        if (!mesh) continue;
        list.forEach((a, i) => {
          const color = typeof pt.color === "number" ? a.colors?.[pt.color] ?? "#ffffff" : pt.color;
          mesh.setColorAt(run.offset + i * run.n + pt.r, _c.set(color));
        });
      }
      const h = haloRefs.current[k];
      if (h && halo) {
        h.count = list.length;
        _c.set(halo.color);
        for (let i = 0; i < list.length; i++) h.setColorAt(i, _c);
        if (h.instanceColor) h.instanceColor.needsUpdate = true;
        hideAll(h, list.length);
      }
    });
    for (const mesh of refs.current.values()) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [kinds, layout, shown]);

  useFrame((state) => {
    const { visible, frustum, blob, heightAt, paths } = shared.current;
    if (!visible || paths.length !== kinds.length) return;
    const t = state.clock.elapsedTime;
    kinds.forEach(({ list, blobOffset }, k) => {
      const { parts, runs, winged, grounded, halo } = layout.perKind[k];
      const haloMesh = halo ? haloRefs.current[k] : null;
      const on = shown[k];
      const path = paths[k];
      list.forEach((a, i) => {
        // Off-screen agents are posed no more and hidden as they leave: per-frame cost scales with what is on screen
        // (one whose whole path is out of view isn't even posed)
        const p = frustum.intersectsBox(path[i].box) ? pose(a, t) : null;
        let ground = 0;
        if (p) {
          ground = heightAt ? (Number.isNaN(path[i].ground) ? heightAt(p.x, p.z) : path[i].ground) : 0;
          p.y += ground;
          _sphere.center.set(p.x, p.y, p.z);
          _sphere.radius = 1.6 * Math.max(1, a.scale ?? 1);
        }
        if (!p || !frustum.intersectsSphere(_sphere)) {
          if (on[i]) {
            on[i] = 0;
            for (const pt of parts) {
              const run = runs.get(pt.key)!;
              refs.current.get(pt.key)?.setMatrixAt(run.offset + i * run.n + pt.r, HIDDEN);
            }
            haloMesh?.setMatrixAt(i, HIDDEN);
            if (grounded && blob) blob.setMatrixAt(blobOffset + i, HIDDEN);
          }
          return;
        }
        on[i] = 1;
        _e.set(p.pitch, p.yaw, p.roll);
        _base.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e), _s.setScalar(a.scale ?? 1));
        const lift = winged ? wingLift(a, t) : 0;
        for (const pt of parts) {
          const mesh = refs.current.get(pt.key);
          if (!mesh) continue;
          const run = runs.get(pt.key)!;
          if (pt.hinge) {
            _wing.multiplyMatrices(_base, pt.hinge.to).multiply(_rz.makeRotationZ(pt.hinge.side * lift)).multiply(pt.hinge.back);
            _m.multiplyMatrices(_wing, pt.local);
          } else _m.multiplyMatrices(_base, pt.local);
          mesh.setMatrixAt(run.offset + i * run.n + pt.r, _m);
        }
        if (halo && haloMesh) {
          // Flicker a little (seeded per bearer), always facing the camera
          const flicker = 1 + Math.sin(t * 9 + a.phase * 13) * 0.06 + Math.sin(t * 23 + a.phase * 5) * 0.04;
          _hp.set(halo.x, halo.y, halo.z).applyMatrix4(_base);
          haloMesh.setMatrixAt(i, _m.compose(_hp, state.camera.quaternion, _s.setScalar(halo.size * (a.scale ?? 1) * flicker)));
        }
        // Birds circling overhead cast their blob on the ground below
        const blobY = heightAt ? ground : a.motion === "circle" && a.y > 0.5 ? 0 : a.y;
        // A rider's mount casts the blob (or, wading, leaves the wake)
        if (grounded && blob && !a.ride) groundMark(shared.current, blobOffset + i, p.x, ground, p.z, t, a.phase, a.motion === "walk" || a.motion === "fight" ? 1 : 0, a.scale ?? 1, blobY + BLOB_Y);
      });
      if (haloMesh) haloMesh.instanceMatrix.needsUpdate = true;
    });
    for (const mesh of refs.current.values()) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {layout.meshes.map(([key, m]) => (
        <instancedMesh
          key={`${key}-${capacityFor(m.slots)}`}
          ref={(el) => {
            if (el) refs.current.set(key, el);
            else refs.current.delete(key);
          }}
          args={[getShapeGeometry(m.shape), undefined, capacityFor(m.slots)]}
          frustumCulled={false}
        >
          {m.glow ? <meshBasicMaterial toneMapped={false} /> : <meshStandardMaterial roughness={0.8} flatShading />}
        </instancedMesh>
      ))}
      {kinds.map(({ kind, list }, k) =>
        layout.perKind[k].halo ? (
          <instancedMesh
            key={`halo-${kind}-${capacityFor(list.length)}`}
            ref={(el) => {
              haloRefs.current[k] = el;
            }}
            args={[HALO_GEOMETRY, HALO_MATERIAL, capacityFor(list.length)]}
            frustumCulled={false}
            renderOrder={4}
            raycast={noRaycast}
          />
        ) : null
      )}
    </>
  );
}

/** Soft dark disc used as every grounded agent's shadow (real shadows would redraw the shadow map each frame) */
const BLOB_GEOMETRY = new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2);
const BLOB_MATERIAL = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22, depthWrite: false });
/** Foam ring round a wading agent: a soft-edged band, whiter at its middle (one draw for every wader; none when nobody wades) */
const WAKE_GEOMETRY = (() => {
  const g = new THREE.RingGeometry(0.3, 0.52, 20, 2).rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i));
    // Bright at the band's middle ring, fading to nothing at both edges
    const k = d > 0.3 + 0.01 && d < 0.52 - 0.01 ? 1 : 0;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
})();
const WAKE_MATERIAL = new THREE.MeshBasicMaterial({ color: "#e0f2fe", vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const _projScreen = new THREE.Matrix4();

/**
 * All people, animals and moving props; hidden (and not animated) when zoomed far out.
 * With `heightAt` (world map) every actor stands on the terrain and its y is an offset above it.
 */
export function Actors({
  actors,
  lodDistance = 80,
  heightAt,
  waterLevel,
  hd: hdView
}: {
  actors: Actor[];
  lodDistance?: number;
  heightAt?: (x: number, z: number) => number;
  /** World map: agents whose ground lies under this wade, leaving a wake on the surface */
  waterLevel?: number;
  hd?: boolean;
}) {
  // HD (graphics feature `actors`, or the Codex's switch): every kind through its HD model
  const hdSetting = useHd("actors");
  const hd = hdView ?? hdSetting;
  const group = useRef<THREE.Group>(null);
  const blobRef = useRef<THREE.InstancedMesh>(null);
  const wakeRef = useRef<THREE.InstancedMesh>(null);
  const shared = useRef<FrameShared>({ visible: true, frustum: new THREE.Frustum(), blob: null, paths: [], wake: null, wakes: 0 });

  // Each kind gets a slice of the shared blob-shadow buffer
  const { byKind, blobCount } = useMemo(() => {
    const map = new Map<ActorKind, Actor[]>();
    for (const a of actors) {
      const list = map.get(a.kind) || [];
      list.push(a);
      map.set(a.kind, list);
    }
    let offset = 0;
    const kinds = [...map.entries()].map(([kind, list]) => {
      const start = offset;
      if (GROUNDED(kind)) offset += list.length;
      return { kind, list, blobOffset: start };
    });
    return { byKind: kinds, blobCount: offset };
  }, [actors]);
  const paths = useMemo(() => byKind.map(({ list }) => list.map((a) => agentPath(a, heightAt))), [byKind, heightAt]);
  useLayoutEffect(() => {
    shared.current.heightAt = heightAt;
    shared.current.paths = paths;
    shared.current.waterLevel = waterLevel;
  }, [heightAt, paths, waterLevel]);
  const blobCapacity = capacityFor(blobCount);
  const hdKinds = useMemo(
    () =>
      byKind.map(({ kind, list, blobOffset }) => ({
        kind,
        actors: list,
        blobOffset,
        grounded: GROUNDED(kind),
        halo: kind.startsWith("light_") ? hdLightHalo(kind.slice(6) as CivilizationType) : undefined
      })),
    [byKind]
  );

  useLayoutEffect(() => {
    const blob = blobRef.current;
    shared.current.blob = blob;
    if (!blob) return;
    blob.count = blobCount;
    // Only agents on screen get their blob
    hideAll(blob);
    shared.current.wake = wakeRef.current;
    if (wakeRef.current) wakeRef.current.count = 0;
  }, [blobCount, blobCapacity, byKind]);

  // LOD visibility and this frame's view frustum. Negative priority runs it before the batches'
  // callbacks (positive priorities would take over rendering)
  useFrame((state) => {
    const s = shared.current;
    s.visible = viewDistance(state) < lodDistance;
    if (group.current) group.current.visible = s.visible;
    // Only the rings written this frame are drawn (none, and no draw, while nobody wades)
    s.wakes = 0;
    if (s.wake) s.wake.count = 0;
    if (!s.visible) return;
    state.camera.updateMatrixWorld();
    s.frustum.setFromProjectionMatrix(_projScreen.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse));
  }, -1);
  useFrame(() => {
    if (shared.current.visible && blobRef.current) blobRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <instancedMesh key={blobCapacity} ref={blobRef} args={[BLOB_GEOMETRY, BLOB_MATERIAL, blobCapacity]} frustumCulled={false} renderOrder={-1} />
      {waterLevel !== undefined && <instancedMesh key={`wake-${blobCapacity}`} ref={wakeRef} args={[WAKE_GEOMETRY, WAKE_MATERIAL, blobCapacity]} frustumCulled={false} renderOrder={2} raycast={noRaycast} />}
      {hd ? (
        // HD: every kind together, one mesh per shape
        <ActorsHd kinds={hdKinds} shared={shared} haloGeometry={HALO_GEOMETRY} haloMaterial={HALO_MATERIAL} blobY={BLOB_Y} />
      ) : (
        <ActorsNormal kinds={byKind} shared={shared} />
      )}
    </group>
  );
}
