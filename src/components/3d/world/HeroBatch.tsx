import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rngFor } from "@/utils/random";
import { Kit } from "./heroKit";
import { BUCKET_OF, HERO_BUCKETS, SHADOW_BUCKETS, Sparks, heroDepthMaterial, heroMaterials, sparkMaterial } from "./heroMaterials";
import { HeroAura, HeroAuraSite } from "./HeroAura";
import { BATCHED_HEROES } from "./heroes";

/** Where a batched hero stands: its NPC type, the ground under it and its size there (1 when omitted) */
export interface HeroSite {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  scale?: number;
}

/** A hero's aura at its site, grown with it */
export function auraAt(s: HeroSite, a: Omit<HeroAuraSite, "x" | "y" | "z">): HeroAuraSite {
  const k = s.scale ?? 1;
  if (k === 1) return { x: s.x, y: s.y, z: s.z, ...a };
  return {
    ...a,
    x: s.x,
    y: s.y,
    z: s.z,
    beam: a.beam && { y: a.beam.y * k, height: a.beam.height, radius: a.beam.radius * k },
    curtain: a.curtain && { radius: a.curtain.radius * k, height: a.curtain.height * k, y: a.curtain.y === undefined ? undefined : a.curtain.y * k },
    embers: { ...a.embers, inner: a.embers.inner * k, outer: a.embers.outer * k, height: a.embers.height * k }
  };
}

const _frustum = new THREE.Frustum();
const _view = new THREE.Matrix4();

/**
 * Every batched hero at its site, all drawn together: one merged mesh per shared material (their parts' motion runs on
 * the GPU), one `Points` for their flames, smoke, embers and wisps, and their legendary auras (4 draws). Draws do not
 * grow with the number of heroes. Shadows come from static parts only.
 */
export function HeroBatch({ sites }: { sites: HeroSite[] }) {
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);

  const built = useMemo(() => {
    const time = { value: 0 };
    // Indexed, so a corner shared by several triangles is shaded once: on the map the heroes are bound by their vertices
    const k = new Kit(true, true);
    const sparks = new Sparks(rngFor("hero-sparks"));
    const auras: HeroAuraSite[] = [];
    // Where each hero stands and reaches (its parts at rest, grown for their motion): with none in view nothing is drawn
    const bounds: THREE.Sphere[] = [];
    for (const s of sites) {
      const def = BATCHED_HEROES[s.type];
      if (!def) continue;
      // Each hero its own seeded randomness, the same wherever it stands
      const rng = rngFor(`hero:${s.type}`);
      const sc = s.scale ?? 1;
      // Sparks grow with the model too
      const grown = (o: Parameters<Sparks["add"]>[3]) => (sc === 1 ? o : { ...o, size: o.size * sc, rise: o.rise === undefined ? undefined : o.rise * sc, reach: o.reach === undefined ? undefined : o.reach * sc, spread: o.spread === undefined ? undefined : o.spread * sc });
      const before = new Map([...k.buckets].map(([name, list]) => [name, list.length]));
      k.frame([s.x, s.y, s.z], [0, 0, 0], sc, () => def.build({ k, rng, spark: (kind, at, n, o) => sparks.add(kind, k.point(at), n, grown(o)) }));
      auras.push(auraAt(s, def.aura));
      const box = new THREE.Box3();
      for (const [name, list] of k.buckets)
        for (const g of list.slice(before.get(name) ?? 0)) {
          g.computeBoundingBox();
          box.union(g.boundingBox!);
        }
      const sphere = box.isEmpty() ? new THREE.Sphere(new THREE.Vector3(s.x, s.y, s.z), 14 * sc) : box.getBoundingSphere(new THREE.Sphere());
      sphere.radius = sphere.radius * 1.25 + 2 * sc;
      bounds.push(sphere);
    }
    // Builders name what a part is made of; fold those into the four shared materials (a kind marks iron, glaze, leaves)
    const folded = new Map<string, THREE.BufferGeometry[]>();
    for (const [name, list] of k.buckets) {
      const to = BUCKET_OF[name];
      if (to.kind !== undefined)
        for (const g of list) {
          const surf = g.attributes.aSurf as THREE.BufferAttribute;
          for (let i = 0; i < surf.count; i++) surf.setZ(i, to.kind);
        }
      folded.set(to.bucket, [...(folded.get(to.bucket) ?? []), ...list]);
    }
    k.buckets = folded;
    const geos = k.bake();
    const mats = heroMaterials(time);
    const points = new THREE.Points(sparks.geometry(), sparkMaterial(time));
    points.frustumCulled = false;
    points.renderOrder = 3;
    return { time, geos, mats, depth: heroDepthMaterial(time), points, auras, bounds };
  }, [sites]);

  useEffect(
    () => () => {
      Object.values(built.geos).forEach((g) => g.dispose());
      Object.values(built.mats).forEach((m) => m.dispose());
      built.depth.dispose();
      built.points.geometry.dispose();
      (built.points.material as THREE.Material).dispose();
    },
    [built]
  );

  // With no hero in view their meshes draw nothing (an empty draw range), but the shadow map, drawn once, gets them all
  const shown = useRef(true);
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  useEffect(() => {
    // A new batch draws everything until the next frame says otherwise
    shown.current = true;
    const all = () => Object.values(built.geos).forEach((g) => g.setDrawRange(0, Infinity));
    const now = () => Object.values(built.geos).forEach((g) => g.setDrawRange(0, shown.current ? Infinity : 0));
    meshes.current.forEach((m) => {
      if (!m) return;
      m.onBeforeShadow = all;
      m.onAfterShadow = now;
    });
  }, [built]);

  useFrame(({ clock, camera }) => {
    built.time.value = clock.elapsedTime;
    (built.points.material as THREE.ShaderMaterial).uniforms.uViewH.value = size.height * gl.getPixelRatio();
    camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_view.multiplyMatrices(camera.projectionMatrix, _view.copy(camera.matrixWorld).invert()));
    const inView = built.bounds.some((b) => _frustum.intersectsSphere(b));
    if (inView === shown.current) return;
    shown.current = inView;
    Object.values(built.geos).forEach((g) => g.setDrawRange(0, inView ? Infinity : 0));
  });

  return (
    <group>
      {HERO_BUCKETS.map(
        (b, i) =>
          built.geos[b] && (
            <mesh
              key={b}
              ref={(el) => {
                meshes.current[i] = el;
              }}
              geometry={built.geos[b]}
              material={built.mats[b]}
              customDepthMaterial={built.depth}
              castShadow={SHADOW_BUCKETS.has(b)}
              receiveShadow={b !== "glow"}
            />
          )
      )}
      <primitive object={built.points} />
      <HeroAura sites={built.auras} />
    </group>
  );
}
