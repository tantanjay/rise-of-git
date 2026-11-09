import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CivilizationType } from "@/types";
import { useHd } from "@/utils/graphics";
import { SURFACES, indexExact } from "@/components/3d/city/parts";
import { FLAT_KIT, HD_COURSES, HD_FRAGMENT_PARS, KIT_FRAGMENT_COLOR, KIT_FRAGMENT_PARS } from "@/components/3d/city/InstancedParts";
import { CASTLE_PARTS, EMPYREAN_PARTS, CastleAnim, CastlePart, castleGeometry } from "./castleParts";
import { WONDER_STAGE } from "@/utils/castle";

export interface CastlePlacement {
  id: string;
  civilization: CivilizationType;
  x: number;
  y: number;
  z: number;
  scale: number;
  stage?: number;
  level?: number;
  /** The Archon's Empyrean: drawn from its own part list instead of the civilization's */
  empyrean?: boolean;
}

/** Which part list a castle is drawn from */
export type CastleStyle = CivilizationType | "empyrean";
const styleOf = (c: CastlePlacement): CastleStyle => (c.empyrean ? "empyrean" : c.civilization);

/**
 * Parts of one castle style that share opacity, sidedness, shadow flags and animation, merged into one
 * geometry. Colour, hover colour, roughness, metalness, emissive and stage range travel per vertex, so
 * parts of different shapes and materials still draw as one InstancedMesh with one instance per castle.
 */
interface Batch {
  key: string;
  opacity: number;
  doubleSide: boolean;
  shadow: boolean;
  receive: boolean;
  anim?: CastleAnim;
  /** HD: parts only a Wonder shows, drawn on Wonders alone (other castles never run their vertices) */
  wonder: boolean;
  /** Every stage's parts (Normal: stages collapse in the vertex shader) */
  geometry: () => THREE.BufferGeometry;
  /** HD: only the parts a castle of this stage shows (null: none), so a castle never runs another stage's vertices */
  atStage: (stage: number) => THREE.BufferGeometry | null;
}

const _pm = new THREE.Matrix4();
const _pc = new THREE.Color();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _mid = new THREE.Vector3();

/** One value per vertex of a part */
function fill(n: number, values: number[]) {
  const a = new Float32Array(n * values.length);
  for (let i = 0; i < n; i++) a.set(values, i * values.length);
  return new THREE.BufferAttribute(a, values.length);
}

/** One part's geometry, placed within its castle (or anim pivot) and tagged with its look and stages */
function partGeometry(p: CastlePart): THREE.BufferGeometry {
  const src = castleGeometry(p.geo);
  const g = src.index ? src.toNonIndexed() : src.clone();
  g.deleteAttribute("uv");
  g.applyMatrix4(
    _pm.compose(
      new THREE.Vector3(...p.pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
      new THREE.Vector3().setScalar(p.scale ?? 1)
    )
  );
  const n = g.getAttribute("position").count;
  const m = p.mat ?? {};
  g.setAttribute("color", fill(n, _pc.set(p.color).toArray()));
  g.setAttribute("aHoverColor", fill(n, _pc.set(p.hoverColor ?? p.color).toArray()));
  g.setAttribute("aEmissive", fill(n, _pc.set(m.emissive ?? "#000000").multiplyScalar(m.emissiveIntensity ?? 1).toArray()));
  g.setAttribute("aPbr", fill(n, [m.roughness ?? 1, m.metalness ?? 0]));
  g.setAttribute("aStages", fill(n, [p.minStage ?? 0, p.maxStage ?? 5]));
  return g;
}

/** Faceted geometries (four- to six-sided roofs and towers, crystals, kit blocks) keep a facet's normal in HD */
function faceted(key: string): boolean {
  const [kind, argStr] = key.split(":");
  const a = argStr.split(",");
  if (kind === "kit") return FLAT_KIT.has(a[0] as never) || a[1] === "2";
  return kind === "octa" || (kind === "cone" && Number(a[2]) < 7) || (kind === "cyl" && Number(a[3]) < 8);
}

/** No ground under the part (it floats or moves: no contact shadow) */
const NO_BASE = -1e4;
const COURSES = { masonry: 1, tiles: 3 } as const;
const WAVES = { flutter: 1, smoke: 2, turn: 3, pulse: 4 } as const;

/**
 * HD: a part's HD twin (or kit shape), with what the model kit's shader needs per vertex: its material (surface id,
 * roughness, metalness, seed), its own space (`aLocal`, −0.5…0.5, and `aSize`) for the surface pattern, the ground for
 * soft AO, its courses (dressed stone, rows of tiles) and its cloth or smoke motion
 */
function hdPartGeometry(p: CastlePart): THREE.BufferGeometry {
  const src = castleGeometry(p.geo, true);
  const g = src.index ? src.toNonIndexed() : src.clone();
  g.deleteAttribute("uv");
  const pos = g.getAttribute("position");
  const n = pos.count;
  // Its own space before it is placed: a kit shape is already 1×1×1 about its centre
  _box.setFromBufferAttribute(pos as THREE.BufferAttribute);
  _box.getSize(_size).max(new THREE.Vector3(1e-4, 1e-4, 1e-4));
  _box.getCenter(_mid);
  const local = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    local[i * 4] = (pos.getX(i) - _mid.x) / _size.x;
    local[i * 4 + 1] = (pos.getY(i) - _mid.y) / _size.y;
    local[i * 4 + 2] = (pos.getZ(i) - _mid.z) / _size.z;
  }
  const kit = p.size !== undefined;
  const size = kit ? new THREE.Vector3(...p.size!) : _size.clone().multiplyScalar(p.scale ?? 1);
  g.applyMatrix4(
    _pm.compose(
      new THREE.Vector3(...p.pos),
      kit ? new THREE.Quaternion(...p.quat!) : new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
      kit ? size : new THREE.Vector3().setScalar(p.scale ?? 1)
    )
  );
  if (faceted(p.geo)) g.computeVertexNormals();
  const m = p.mat ?? {};
  const surf = p.surf ? SURFACES[p.surf] : undefined;
  const rough = surf?.rough ?? m.roughness ?? 1;
  const metal = surf?.metal ?? m.metalness ?? 0;
  const seed = Math.abs(Math.sin(p.pos[0] * 12.9898 + p.pos[1] * 37.719 + p.pos[2] * 78.233) * 43758.5453) % 1;
  const course = p.courses ? COURSES[p.courses] + (p.courses === "masonry" && /^(cyl|kit:cyl)/.test(p.geo) ? 1 : 0) : 0;
  // A vertex shader takes at most 16 attributes, so the kit's values are packed four to a slot
  const w = p.wave;
  // A turning part keeps its speed and bob where cloth keeps its facing
  const wn = w?.kind === "turn" ? [w.speed ?? 0.5, 0, w.bob ?? 0] : (w?.n ?? [0, 0, 1]);
  for (let i = 0; i < n; i++) local[i * 4 + 3] = wn[0];
  g.setAttribute("aLocal", new THREE.BufferAttribute(local, 4));
  g.setAttribute("color", fill(n, _pc.set(p.color).toArray()));
  g.setAttribute("aHoverColor", fill(n, _pc.set(p.hoverColor ?? p.color).toArray()));
  g.setAttribute("aEmissive", fill(n, _pc.set(m.emissive ?? "#000000").multiplyScalar(m.emissiveIntensity ?? 1).toArray()));
  g.setAttribute("aStages", fill(n, [p.minStage ?? 0, p.hdMaxStage ?? p.maxStage ?? 5, p.anim || w?.kind === "turn" ? NO_BASE : 0, course]));
  g.setAttribute("aPbr", fill(n, [rough, metal, surf?.id ?? 0, seed]));
  g.setAttribute("aSize", fill(n, [...size.toArray(), wn[2]]));
  // The wave's kind with its phase packed in the fraction, then the point it moves about
  const phase = (((w?.phase ?? 0) / (Math.PI * 2)) % 1 + 1) % 1;
  g.setAttribute("aWave", fill(n, w ? [WAVES[w.kind] + phase * 0.9, ...w.at] : [0, 0, 0, 0]));
  return g;
}

/**
 * HD: some vertex data in smaller types, since fetching it is most of an HD castle's cost: normals as 16-bit snorm,
 * colours as 16-bit unorm, emissive and stages as half floats (stages, ground and courses are whole numbers it holds
 * exactly). A frame differs from full floats by at most one step of 255. Positions, the material and its seed, the part's
 * own space and size (the surface patterns: half floats move block and tile edges) and the motion pivots stay full floats
 */
const HALF = ["aEmissive", "aStages"];
function packHd(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  g.setAttribute("normal", new THREE.BufferAttribute(Int16Array.from(n.array as Float32Array, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767)), 3, true));
  for (const name of ["color", "aHoverColor"]) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    g.setAttribute(name, new THREE.BufferAttribute(Uint16Array.from(a.array as Float32Array, (v) => Math.round(Math.max(0, Math.min(1, v)) * 65535)), a.itemSize, true));
  }
  for (const name of HALF) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    g.setAttribute(name, new THREE.Float16BufferAttribute(Uint16Array.from(a.array as Float32Array, (v) => THREE.DataUtils.toHalfFloat(v)), a.itemSize));
  }
  return g;
}

function batchesFor(parts: CastlePart[], hd: boolean): Batch[] {
  const groups = new Map<string, CastlePart[]>();
  for (const p of parts) {
    // HD-only parts (hd: true) and the Normal-only parts they replace (hd: false)
    if (p.hd === !hd) continue;
    const shadow = !!p.shadow && !p.anim; // moving parts cast no shadow (the shadow map is static)
    const wonder = hd && (p.minStage ?? 0) >= WONDER_STAGE;
    const key = [p.mat?.opacity ?? 1, p.mat?.doubleSide ? 1 : 0, shadow ? 1 : 0, p.receive ? 1 : 0, p.anim ? JSON.stringify(p.anim) : "", wonder ? "W" : ""].join("|");
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const p = list[0];
    let pieces: THREE.BufferGeometry[] | null = null;
    // Indexed: a vertex its part's triangles share runs the castle shader once (an HD batch was ~4x its vertices unindexed)
    const merge = (keep: (q: CastlePart) => boolean) => {
      pieces ??= list.map(hd ? hdPartGeometry : partGeometry);
      const chosen = pieces.filter((_, i) => keep(list[i]));
      if (chosen.length === 0) return null;
      const g = indexExact(mergeGeometries(chosen)!);
      g.computeBoundingSphere();
      return g;
    };
    let all: THREE.BufferGeometry | null = null;
    const stages = new Map<number, THREE.BufferGeometry | null>();
    return {
      key,
      opacity: p.mat?.opacity ?? 1,
      doubleSide: !!p.mat?.doubleSide,
      shadow: !!p.shadow && !p.anim,
      receive: !!p.receive,
      anim: p.anim,
      wonder: hd && (p.minStage ?? 0) >= WONDER_STAGE,
      geometry: () => (all ??= merge(() => true)!),
      atStage: (stage: number) => {
        if (!stages.has(stage)) {
          const g = merge((q) => stage >= (q.minStage ?? 0) && stage <= (q.hdMaxStage ?? q.maxStage ?? 5));
          stages.set(stage, g && packHd(g));
        }
        return stages.get(stage)!;
      }
    };
  });
}

const batchCache: Partial<Record<"normal" | "hd", Record<CastleStyle, Batch[]>>> = {};
function batchesOf(style: CastleStyle, hd: boolean): Batch[] {
  const q = hd ? "hd" : "normal";
  batchCache[q] ??= {
    ...Object.fromEntries((Object.keys(CASTLE_PARTS) as CivilizationType[]).map((civ) => [civ, batchesFor(CASTLE_PARTS[civ], hd)])),
    empyrean: batchesFor(EMPYREAN_PARTS, hd)
  } as Record<CastleStyle, Batch[]>;
  return batchCache[q][style];
}

/* -------------------------------- Materials -------------------------------- */

const STAGE_ATTRIBUTES = /* glsl */ `
attribute vec2 aStages;
attribute float aStage;
`;

/** Collapses a part's vertices on castles whose stage is outside the part's range */
const STAGE_CULL = /* glsl */ `
#include <begin_vertex>
if (aStage < aStages.x - 0.5 || aStage > aStages.y + 0.5) transformed = vec3(0.0);
`;

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** One clock for every HD castle's cloth and smoke */
const castleTime = { value: 0 };

/** HD: a vertex shader takes at most 16 attributes, so a castle's stage and hover flag share one (`aCastle`) */
const HD_STAGE_CULL = /* glsl */ `if (aCastle.x < aStages.x - 0.5 || aCastle.x > aStages.y + 0.5) transformed = vec3(0.0);
`;

/**
 * HD: cloth ripples away from its pole along its facing; a smoke puff (or a spark) rises, swells and fades, then starts
 * again; a turning part goes round the upright axis through its point (its speed and bob where cloth keeps its facing),
 * its normal with it; a pulsing glow swells and fades
 */
const HD_WAVE = /* glsl */ `
#include <begin_vertex>
if (aWave.x > 0.5) {
  vec3 rel = transformed - aWave.yzw;
  float waveKind = floor(aWave.x);
  float ph = fract(aWave.x) / 0.9 * 6.2832;
  if (waveKind < 1.5) {
    float reach = clamp(length(rel.xz), 0.0, 1.2);
    transformed += vec3(aLocal.w, 0.0, aSize.w) * 0.11 * reach * sin(uIdleTime * 4.6 + ph - (rel.x + rel.y + rel.z) * 4.5);
  } else if (waveKind < 2.5) {
    float u = fract(uIdleTime * 0.2 + ph * 0.159);
    rel *= (0.45 + u * 1.3) * (1.0 - smoothstep(0.6, 1.0, u));
    rel.y += u * 1.3;
    rel.x += u * u * 0.35 * sin(ph);
    rel.z += u * u * 0.35 * cos(ph);
    transformed = aWave.yzw + rel;
  } else if (waveKind < 3.5) {
    float ta = uIdleTime * aLocal.w + ph;
    float ca = cos(ta);
    float sa = sin(ta);
    transformed = aWave.yzw + vec3(ca * rel.x + sa * rel.z, rel.y + aSize.w * sin(uIdleTime * 1.3 + ph), ca * rel.z - sa * rel.x);
    objectNormal = vec3(ca * objectNormal.x + sa * objectNormal.z, objectNormal.y, ca * objectNormal.z - sa * objectNormal.x);
    #ifndef FLAT_SHADED
    vNormal = normalize(normalMatrix * (mat3(instanceMatrix) * objectNormal));
    #endif
  } else {
    vEmissive *= 0.4 + 0.6 * (0.5 + 0.5 * sin(uIdleTime * 1.9 + ph));
  }
}
${HD_STAGE_CULL}`;

/** HD: what the model kit's surfaces need, in world units (the castle's own scale included) */
const HD_VERTEX = /* glsl */ `
vSW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
vSN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
vSL = aLocal.xyz;
float castleScale = length(instanceMatrix[0].xyz);
vSize = aSize.xyz * castleScale;
vMat = vec3(aPbr.z, aPbr.x, aPbr.y);
vec3 castleAt = instanceMatrix[3].xyz;
vSeed = fract(aPbr.w + fract(sin(dot(castleAt.xz, vec2(12.9898, 78.233))) * 43758.5453));
vBase = castleAt.y + aStages.z * castleScale;
vCourse = aStages.w;
`;


/** Castle material, shared by every batch with the same opacity and sidedness (and graphics quality) */
function castleMaterial(opacity: number, doubleSide: boolean, hd = false): THREE.MeshStandardMaterial {
  const key = `${opacity}|${doubleSide}|${hd}`;
  let m = materials.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: opacity < 1,
    opacity,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide
  });
  if (hd) {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uIdleTime = castleTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute vec4 aStages; // min and max stage, the ground (soft AO), courses
attribute vec2 aCastle; // per castle: its stage, hovered
attribute vec3 aHoverColor;
attribute vec3 aEmissive;
attribute vec4 aPbr; // roughness, metalness, surface, seed
attribute vec4 aLocal; // the part's own space (−0.5…0.5), the cloth's facing x
attribute vec4 aSize; // its size, the cloth's facing z
attribute vec4 aWave; // cloth or smoke (its phase in the fraction), the point it moves about
uniform float uIdleTime;
varying vec3 vEmissive;
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
          "#include <color_vertex>",
          `#include <color_vertex>
vColor.rgb = mix(color, aHoverColor, aCastle.y);
vEmissive = aEmissive;`
        )
        .replace("#include <begin_vertex>", HD_WAVE + HD_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", `${HD_FRAGMENT_PARS}
${KIT_FRAGMENT_PARS}
varying vec3 vEmissive;
varying float vCourse;
void main() {`)
        .replace("#include <color_fragment>", KIT_FRAGMENT_COLOR + HD_COURSES)
        .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = vEmissive + kEmit;")
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = clamp(kRough, 0.04, 1.0);")
        .replace("#include <metalnessmap_fragment>", "float metalnessFactor = clamp(kMetal, 0.0, 1.0);")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = kBump(-vViewPosition, normal, kHeight);");
    };
    m.customProgramCacheKey = () => "world-castle-kit";
    materials.set(key, m);
    return m;
  }
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
${STAGE_ATTRIBUTES}
attribute vec3 aHoverColor;
attribute vec3 aEmissive;
attribute vec2 aPbr;
attribute float aHover;
varying vec3 vEmissive;
varying vec2 vPbr;`
      )
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
vColor.rgb = mix(color, aHoverColor, aHover);
vEmissive = aEmissive;
vPbr = aPbr;`
      )
      .replace("#include <begin_vertex>", STAGE_CULL);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vEmissive;\nvarying vec2 vPbr;")
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = vEmissive;")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = clamp(vPbr.x, 0.04, 1.0);")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vPbr.y;");
  };
  m.customProgramCacheKey = () => "world-castle";
  materials.set(key, m);
  return m;
}

/** Shadow depth pass with the same stage culling, so hidden parts cast no shadow */
const depthMaterials = new Map<boolean, THREE.MeshDepthMaterial>();
function castleDepthMaterial(hd = false): THREE.MeshDepthMaterial {
  let m = depthMaterials.get(hd);
  if (m) return m;
  m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
${hd ? "attribute vec4 aStages;\nattribute vec2 aCastle;" : STAGE_ATTRIBUTES}`)
      .replace("#include <begin_vertex>", hd ? `#include <begin_vertex>
${HD_STAGE_CULL}` : STAGE_CULL);
  };
  m.customProgramCacheKey = () => (hd ? "world-castle-depth-hd" : "world-castle-depth");
  depthMaterials.set(hd, m);
  return m;
}

/* -------------------------------- Instancing -------------------------------- */

const _castle = new THREE.Matrix4();
const _anim = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const IDENTITY = new THREE.Quaternion();

function castleMatrix(c: CastlePlacement, out: THREE.Matrix4) {
  return out.compose(_v.set(c.x, c.y, c.z), IDENTITY, _s.setScalar(c.scale));
}

/** Pivot transform of an animated part at time t (matches the original per-castle animations) */
function animMatrix(anim: CastleAnim, t: number, out: THREE.Matrix4) {
  if (anim.kind === "bob") {
    _q.setFromEuler(_e.set(0, t * 0.8, 0));
    return out.compose(_v.set(0, anim.baseY + Math.sin(t * 2.2) * 0.12, 0), _q, _s.setScalar(1));
  }
  if (anim.kind === "float") return out.compose(_v.set(0, anim.baseY + Math.sin(t * 0.9) * 0.1, 0), IDENTITY, _s.setScalar(1));
  if (anim.kind === "spin") {
    _q.setFromEuler(_e.set(0, t * anim.speed, 0));
    return out.compose(_v.set(...anim.pivot), _q, _s.setScalar(1));
  }
  _q.setFromEuler(anim.kind === "orbit" ? _e.set(0, t * 1.5, 0) : _e.set(0, 0, t * 1.8));
  return out.compose(_v.set(...anim.pivot), _q, _s.setScalar(1));
}

function CastleBatch({ batch, base, castles, hoveredId, hd }: { batch: Batch; base: THREE.BufferGeometry; castles: CastlePlacement[]; hoveredId: string | null; hd: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  // Per-castle stage and hover flag, read by the shader (in HD both in one attribute, `aCastle`)
  const { geometry, hover } = useMemo(() => {
    const geometry = base.clone();
    const stages = castles.map((c) => c.stage ?? 0);
    if (hd) {
      const castle = new THREE.InstancedBufferAttribute(new Float32Array(stages.flatMap((st) => [st, 0])), 2);
      geometry.setAttribute("aCastle", castle);
      return { geometry, hover: castle };
    }
    const hover = new THREE.InstancedBufferAttribute(new Float32Array(castles.length), 1);
    geometry.setAttribute("aStage", new THREE.InstancedBufferAttribute(new Float32Array(stages), 1));
    geometry.setAttribute("aHover", hover);
    return { geometry, hover };
  }, [base, castles, hd]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  const writeMatrices = useCallback(
    (t: number) => {
      const mesh = ref.current;
      if (!mesh) return;
      castles.forEach((c, ci) => {
        castleMatrix(c, _castle);
        if (batch.anim) _castle.multiply(animMatrix(batch.anim, t, _anim));
        mesh.setMatrixAt(ci, _castle);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    [castles, batch]
  );

  useLayoutEffect(() => {
    writeMatrices(0);
    ref.current?.computeBoundingSphere();
  }, [writeMatrices]);

  useLayoutEffect(() => {
    castles.forEach((c, ci) => (hd ? hover.setY(ci, c.id === hoveredId ? 1 : 0) : hover.setX(ci, c.id === hoveredId ? 1 : 0)));
    hover.needsUpdate = true;
  }, [castles, hover, hoveredId, hd]);

  useFrame((state) => {
    if (batch.anim) writeMatrices(state.clock.elapsedTime);
    if (hd) castleTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, castleMaterial(batch.opacity, batch.doubleSide, hd), castles.length]}
      customDepthMaterial={castleDepthMaterial(hd)}
      castShadow={batch.shadow}
      receiveShadow={batch.receive}
      frustumCulled={!batch.anim}
    />
  );
}

/**
 * Every world-map castle: per castle style, one InstancedMesh per merged part batch. In HD (the `castles` feature, or
 * `hd` for a Codex preview) each style is drawn from its HD batches: the same batches with the model kit's geometry,
 * materials and detail merged in, so HD costs vertices, not draw calls. The Wonder's HD detail sits in batches of its own
 * drawn only on the Wonders (a few draws per civilization that has one), so the other castles never run its vertices.
 */
export function WorldCastles({ castles, hoveredId, skipStyles, hd: hdView }: { castles: CastlePlacement[]; hoveredId: string | null; skipStyles?: CastleStyle[]; hd?: boolean }) {
  const hdSetting = useHd("castles");
  const hd = hdView ?? hdSetting;
  const byStyle = useMemo(() => {
    const map = new Map<CastleStyle, CastlePlacement[]>();
    for (const c of castles) {
      const style = styleOf(c);
      if (skipStyles?.includes(style)) continue;
      const list = map.get(style) ?? [];
      list.push(c);
      map.set(style, list);
    }
    return [...map.entries()];
  }, [castles, skipStyles]);

  return (
    <>
      {byStyle.flatMap(([style, list]) => {
        const wonders = list.filter((c) => (c.stage ?? 0) >= WONDER_STAGE);
        return batchesOf(style, hd).flatMap((batch) => {
          const shown = batch.wonder ? wonders : list;
          if (shown.length === 0) return [];
          // Instance count is fixed at creation, so remount when the number of castles changes
          if (!hd) return [<CastleBatch key={`${style}-${batch.key}-${shown.length}`} batch={batch} base={batch.geometry()} castles={shown} hoveredId={hoveredId} hd={false} />];
          // HD: one draw per stage the style's castles stand at, each with only that stage's parts
          const byStage = new Map<number, CastlePlacement[]>();
          for (const c of shown) byStage.set(c.stage ?? 0, [...(byStage.get(c.stage ?? 0) ?? []), c]);
          return [...byStage].flatMap(([stage, at]) => {
            const base = batch.atStage(stage);
            return base ? [<CastleBatch key={`${style}-${batch.key}-${stage}-${at.length}-hd`} batch={batch} base={base} castles={at} hoveredId={hoveredId} hd />] : [];
          });
        });
      })}
    </>
  );
}
