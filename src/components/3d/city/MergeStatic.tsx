import { useLayoutEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SURFACES, indexExact, type Surface } from "./parts";
import { HD_COURSES, HD_FRAGMENT_PARS, KIT_FRAGMENT_COLOR, KIT_FRAGMENT_PARS } from "./InstancedParts";

/** Put `userData={DYNAMIC}` on a group or mesh that animates; MergeStatic leaves it (and its children) alone */
export const DYNAMIC = { dynamic: true };

/**
 * HD: what a mesh is made of, set on its material's `userData.kit` (an untagged mesh is plain). `course`: dressed-stone
 * courses on a flat wall (1) or round a tower (2), rows of roof tiles (3); `flat` keeps a faceted shape's facets.
 */
export interface KitTag {
  surf?: Surface;
  course?: number;
  flat?: boolean;
}

interface Bucket {
  source: THREE.MeshStandardMaterial;
  castShadow: boolean;
  receiveShadow: boolean;
  geometries: THREE.BufferGeometry[];
}

const _rel = new THREE.Matrix4();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _min = new THREE.Vector3(1e-4, 1e-4, 1e-4);

/** One value per vertex */
function fill(n: number, values: number[]) {
  const a = new Float32Array(n * values.length);
  for (let i = 0; i < n; i++) a.set(values, i * values.length);
  return new THREE.BufferAttribute(a, values.length);
}

/**
 * HD: the model kit's per-vertex data, taken before the mesh is placed: its own −0.5…0.5 space from its geometry's
 * bounding box (its course in `.w`), its size in the root's units (a seed in `.w`), roughness, metalness and surface id
 */
function kitAttributes(g: THREE.BufferGeometry, mesh: THREE.Mesh, rel: THREE.Matrix4) {
  const m = mesh.material as THREE.MeshStandardMaterial;
  const tag: KitTag = m.userData.kit ?? {};
  const pos = g.getAttribute("position");
  const n = pos.count;
  _box.setFromBufferAttribute(pos as THREE.BufferAttribute);
  _box.getSize(_size).max(_min);
  _box.getCenter(_mid);
  const local = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    local[i * 4] = (pos.getX(i) - _mid.x) / _size.x;
    local[i * 4 + 1] = (pos.getY(i) - _mid.y) / _size.y;
    local[i * 4 + 2] = (pos.getZ(i) - _mid.z) / _size.z;
    local[i * 4 + 3] = tag.course ?? 0;
  }
  rel.decompose(_pos, _q, _scale);
  _size.multiply(_scale);
  const seed = Math.abs(Math.sin(_pos.x * 12.9898 + _pos.y * 37.719 + _pos.z * 78.233) * 43758.5453) % 1;
  const surf = tag.surf ? SURFACES[tag.surf] : undefined;
  g.setAttribute("aLocal", new THREE.BufferAttribute(local, 4));
  g.setAttribute("aSize", fill(n, [Math.abs(_size.x), Math.abs(_size.y), Math.abs(_size.z), seed]));
  g.setAttribute("aPbr", fill(n, [surf?.rough ?? m.roughness, surf?.metal ?? m.metalness, surf?.id ?? 0]));
}

/** Position + normal + per-vertex colour only, so every part can be merged into one buffer */
function bakedGeometry(mesh: THREE.Mesh, toRoot: THREE.Matrix4, color: THREE.Color, hd = false): THREE.BufferGeometry {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", src.getAttribute("position").clone());
  g.setAttribute("normal", src.getAttribute("normal").clone());
  _rel.multiplyMatrices(toRoot, mesh.matrixWorld);
  if (hd) kitAttributes(g, mesh, _rel);
  g.applyMatrix4(_rel);
  if (hd && (mesh.material as THREE.Material).userData.kit?.flat) g.computeVertexNormals();
  const n = g.getAttribute("position").count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (src !== mesh.geometry) src.dispose();
  return g;
}

/** HD: the model kit's shader on a merged mesh (surfaces, soft AO above `ground`, courses and roof tiles) */
function kitMaterial(source: THREE.MeshStandardMaterial, ground: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    emissive: source.emissive,
    emissiveIntensity: source.emissiveIntensity,
    side: source.side,
    flatShading: source.flatShading
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uIdleTime = { value: 0 };
    shader.uniforms.uGround = { value: ground };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 aLocal; // the part's own space (−0.5…0.5), its courses
attribute vec4 aSize; // its size, a seed
attribute vec3 aPbr; // roughness, metalness, surface
uniform float uGround;
varying vec3 vSW;
varying vec3 vSL;
varying vec3 vSN;
varying float vSeed;
varying vec3 vMat;
varying float vBase;
varying vec3 vSize;
varying float vCourse;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vSW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSN = normalize(mat3(modelMatrix) * objectNormal);
vSL = aLocal.xyz;
vSize = aSize.xyz * length(modelMatrix[0].xyz);
vSeed = aSize.w;
vMat = vec3(aPbr.z, aPbr.x, aPbr.y);
vBase = (modelMatrix * vec4(0.0, uGround, 0.0, 1.0)).y;
vCourse = aLocal.w;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `${HD_FRAGMENT_PARS}
${KIT_FRAGMENT_PARS}
varying float vCourse;
void main() {`
      )
      .replace("#include <color_fragment>", KIT_FRAGMENT_COLOR + HD_COURSES)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += kEmit;")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = clamp(kRough, 0.04, 1.0);")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = clamp(kMetal, 0.0, 1.0);")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = kBump(-vViewPosition, normal, kHeight);");
  };
  m.customProgramCacheKey = () => "merge-static-kit";
  return m;
}

/**
 * Renders its children, then merges every static opaque MeshStandardMaterial mesh into one mesh
 * per material type (colour moves into vertex colours). A castle of ~150 parts becomes a handful
 * of draw calls. The originals stay in the scene, hidden, so pointer events still hit them.
 * Re-merges whenever `deps` change; parts marked with DYNAMIC keep animating as normal meshes.
 * `hd`: the merged meshes take the model kit (roughness, metalness and surface travel per vertex, so buckets split only
 * on emissive, sidedness, flat shading and shadows); `ground` is where its soft AO darkens, in the root's units.
 */
export function MergeStatic({ children, deps, hd = false, ground = 0 }: { children: ReactNode; deps: unknown[]; hd?: boolean; ground?: number }) {
  const group = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const root = group.current;
    if (!root) return;
    root.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map<string, Bucket>();
    const hidden: THREE.Mesh[] = [];

    const visit = (obj: THREE.Object3D) => {
      if (obj.userData.merged) return;
      if (obj.userData.dynamic) {
        // Animated parts can't cast into a draw-once shadow map without leaving a frozen shadow
        obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = false;
        });
        return;
      }
      const mesh = obj as THREE.Mesh;
      const m = mesh.material;
      if (mesh.isMesh && mesh.visible && m instanceof THREE.MeshStandardMaterial && !m.transparent) {
        const key = hd
          ? [m.emissive.getHexString(), m.emissiveIntensity, m.side, m.flatShading, mesh.castShadow, mesh.receiveShadow].join("|")
          : [m.roughness, m.metalness, m.emissive.getHexString(), m.emissiveIntensity, m.side, m.flatShading, mesh.castShadow, mesh.receiveShadow].join("|");
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { source: m, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, geometries: [] };
          buckets.set(key, bucket);
        }
        bucket.geometries.push(bakedGeometry(mesh, toRoot, m.color, hd));
        hidden.push(mesh);
      }
      obj.children.forEach(visit);
    };
    root.children.forEach(visit);

    const merged: THREE.Mesh[] = [];
    for (const b of buckets.values()) {
      const flat = mergeGeometries(b.geometries);
      b.geometries.forEach((g) => g.dispose());
      if (!flat) continue;
      // Corners shared bit for bit run the vertex shader once (a merged hall: about a sixth of its vertices)
      const geometry = indexExact(flat);
      if (geometry !== flat) flat.dispose();
      const material = hd
        ? kitMaterial(b.source, ground)
        : new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: b.source.roughness,
            metalness: b.source.metalness,
            emissive: b.source.emissive,
            emissiveIntensity: b.source.emissiveIntensity,
            side: b.source.side,
            flatShading: b.source.flatShading
          });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = b.castShadow;
      mesh.receiveShadow = b.receiveShadow;
      mesh.userData.merged = true;
      mesh.raycast = () => {}; // picking goes through the hidden originals
      root.add(mesh);
      merged.push(mesh);
    }
    hidden.forEach((h) => (h.visible = false));

    return () => {
      for (const mesh of merged) {
        root.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      hidden.forEach((h) => (h.visible = true));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, hd, ground]);

  return <group ref={group}>{children}</group>;
}
