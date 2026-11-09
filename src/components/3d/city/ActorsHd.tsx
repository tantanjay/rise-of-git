import { useEffect, useLayoutEffect, useMemo, useRef, MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Actor, ActorKind, IDLE_KIND, Part, SURFACES, Shape, getShapeGeometry, hdLo } from "./parts";
import { FLAT_KIT, HD_FRAGMENT_PARS, KIT_FRAGMENT_COLOR, KIT_FRAGMENT_PARS, ORGANIC } from "./InstancedParts";
import { HD_LO_SHAPES, limbGeometry, podGeometry, snoutGeometry, taperGeometry } from "./shapeKit";
import { Gait, gaitOf, pose, wingLift } from "./actorMotion";
import { actorHdModel, parseTint } from "./actorHd";
import type { FrameShared } from "./Actors";

/*
 * The HD version of the actors (graphics feature `actors`): each kind's HD model (`actorHd.ts`, built with the Builder
 * and the model kit: legs, arms with fists, faces, hats, tools, tails, wings) drawn with one instanced mesh per shape
 * kind for every kind together, never one per kind, part or agent.
 *
 * Each frame the CPU works out only where every agent on screen stands (the same `pose` as Normal) and what its limbs
 * are doing (`gaitOf`), and writes that into one small float texture shared by every kind: a row of AGENT_TEXELS
 * texels per agent (its matrix, its stride, its arms' action, its colour slots). Agents off screen are left out and the
 * rest packed to the front, kind after kind. A shape's mesh keeps its parts (of every kind that has the shape) in a
 * small part texture and draws `visible × parts` instances summed over the kinds on screen: each instance finds its
 * kind, agent and part from its index and a short per-frame list of those kinds' runs (`uSeg`), reads its agent's row
 * in the vertex shader and moves there: legs step, arms swing against them (or work, strike, cheer), the body dips, leans and
 * rolls over the supporting leg, the shoulders turn against the hips, the head holds steady and glances round in snaps
 * when it stops, tails, hair and cloaks trail, wings beat. The fragment shader is the model kit's (surfaces, AO, bump).
 */

/** Texels per agent: matrix rows ×3, motion, action (and biped), colour slots ×4 */
const AGENT_TEXELS = 9;
/** Width of an agent texture (agents run on along its rows) */
const AGENT_W = 1024;
/** Texels per part in a shape's part texture: its place in the agent (matrix rows ×3), role, pivot, tint, material */
const PART_TEXELS = 7;
const PART_W = 1024;
/** Kinds one shape mesh lists at most (a shape used by more kinds gets a second mesh) */
const MAX_SEGS = 48;

/**
 * Actors are small on screen and many, so a part's geometry follows its size (its middle size, actor units): from
 * ACTOR_FULL_TWIN up the full HD twin, from ACTOR_TINY up the light twin, and below that (fists, eyes, ears, buckles)
 * a coarse twin of a few dozen triangles
 */
const ACTOR_FULL_TWIN = 0.3;
const ACTOR_TINY = 0.1;
const middle = (p: { w: number; h: number; d: number }) => [p.w, p.h, p.d].sort((a, b) => a - b)[1];

function normalised(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  return g.translate(-c.x, -c.y, -c.z).scale(1 / size.x, 1 / size.y, 1 / size.z);
}
const tinyCache = new Map<Shape, THREE.BufferGeometry>();
/** The coarse twin of a tiny part's shape (undefined: it keeps its light twin) */
function tinyGeometry(shape: Shape): THREE.BufferGeometry | undefined {
  if (tinyCache.has(shape)) return tinyCache.get(shape);
  let g: THREE.BufferGeometry | undefined;
  if (shape === "sphere" || shape === "egg" || shape === "drop") g = new THREE.SphereGeometry(1, 7, 5);
  else if (shape === "capsule") g = new THREE.CapsuleGeometry(0.5, 1, 1, 6);
  else if (shape === "cone") g = new THREE.ConeGeometry(1, 1, 6, 1);
  else if (shape === "cyl") g = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
  else if (shape === "limb") g = limbGeometry(6);
  else if (shape === "taper") g = taperGeometry(6);
  else if (shape === "pod") g = podGeometry(6);
  else if (shape === "snout") g = snoutGeometry(6);
  if (g) normalised(g);
  tinyCache.set(shape, g!);
  return g;
}

/** Part roles in the shader: 0 rides the body, 1 leg, 2 arm (or what its hand holds), 3 head, 4 trail, 5 torso, 6 wing */
const ROLE = { body: 0, leg: 1, arm: 2, head: 3, trail: 4, torso: 5, wing: 6 } as const;

const ACTOR_VERTEX_PARS = `
uniform sampler2D uAgents;
uniform sampler2D uParts;
uniform float uIdleTime;
// Per kind on screen: (first instance, parts per agent, first agent row, first part)
uniform vec4 uSeg[${MAX_SEGS}];
uniform int uSegs;
// This instance's part, read from the part texture at the start of main
mat4 instanceMatrix;
vec4 aPart;
vec3 aPivot;
vec4 aTint;
vec3 aMat;
float aBiped;
varying vec3 vActorColor;
varying vec3 vSW;
varying vec3 vSL;
varying vec3 vSN;
varying float vSeed;
varying vec3 vMat;
varying float vBase;
varying vec3 vSize;

vec4 agentTexel(int row, int j) {
  int k = row * ${AGENT_TEXELS} + j;
  return texelFetch(uAgents, ivec2(k % ${AGENT_W}, k / ${AGENT_W}), 0);
}
vec4 partTexel(int part, int j) {
  int k = part * ${PART_TEXELS} + j;
  return texelFetch(uParts, ivec2(k % ${PART_W}, k / ${PART_W}), 0);
}
mat3 aRotX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 aRotY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 aRotZ(float a) { float c = cos(a); float s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
float aHash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

// Where this part of its agent moves (agent space, feet at the origin, facing +z): p' = R p + T.
// motion: stride (2π a stride), moving (0 standing … 1 walking), wing lift, seed; act: what the arms do, how far
void actorPart(vec4 motion, vec4 act, out mat3 R, out vec3 T) {
  float t = uIdleTime;
  float s = motion.x;
  float m = clamp(motion.y, 0.0, 1.0);
  float seed = motion.w;
  float still = 1.0 - m;
  float role = aPart.x;
  float side = aPart.y;
  // The body leans into the walk and rolls over the supporting leg; a biped's hips turn with the stride
  float lean = mix(0.02, 0.07, aBiped) * m;
  float roll = 0.035 * aBiped * sin(s) * m;
  float twist = 0.1 * aBiped * cos(s) * m;
  mat3 body = aRotX(lean) * aRotZ(roll);
  mat3 own = mat3(1.0);
  mat3 turn = mat3(1.0);
  if (role > 0.5 && role < 1.5) {
    // Leg: swings from the hip (legs with the same sign step together); a rider's sit astride the mount, out over its
    // flanks and a little forward
    own = act.x > 3.5 ? aRotZ(sign(aPivot.x) * 0.8) * aRotX(-0.45) : aRotX(-0.5 * side * cos(s) * m);
    turn = aRotY(twist);
  } else if (role > 1.5 && role < 2.5) {
    // Arm: swings against the leg on its side, close to the body and a beat behind; hangs with a little sway at rest.
    // Working, both come down as the body bows; fighting, the weapon arm strikes as it lunges, the other holds its
    // shield up; cheering, both go up
    float sw = 0.4 * side * cos(s - 0.45) * m + 0.05 * sin(t * 1.1 + seed * 6.283 + side) * still;
    float out_ = 0.0;
    float a = act.y;
    if (act.x > 3.5) {
      // Riding: both hands forward on the reins, nodding a little with the mount's stride
      sw = 0.7 + 0.06 * sin(2.0 * s);
    } else if (act.x > 2.5) {
      sw = mix(sw, 2.75 + 0.2 * sin(t * 7.0 + side * 1.3 + seed * 5.0), a);
      out_ = 0.35 * a;
    } else if (act.x > 1.5) {
      sw = side > 0.0 ? mix(2.4, 0.35, a) : 0.75;
    } else if (act.x > 0.5) {
      sw = mix(2.1, 0.65, a) + side * 0.08;
    }
    own = aRotZ(side * out_) * aRotX(-sw);
    turn = aRotY(-1.6 * twist);
  } else if (role > 2.5 && role < 3.5) {
    // Head: rides steady (undoes most of the body's lean and roll), glances round in snaps while it stands
    float u = t / 1.7 + seed * 5.0;
    float slot = floor(u);
    float target = (aHash(slot + seed * 13.0) - 0.5) * 1.3;
    float before = (aHash(slot - 1.0 + seed * 13.0) - 0.5) * 1.3;
    float look = mix(before, target, smoothstep(0.0, 0.12, fract(u))) * still * mix(0.6, 1.0, aBiped);
    own = aRotY(look) * aRotX(-0.8 * lean) * aRotZ(-0.8 * roll);
  } else if (role > 3.5 && role < 4.5) {
    // Trail (tails, hair, cloaks, manes): streams back as it walks and wags down its length (each segment a little
    // later), swaying idly while it stands; damping (side) 0 loose … 1 stiff
    float lag = aPart.z;
    float gain = 1.1 * (1.0 - side) + 0.15;
    float yaw = 0.14 * sin(s * 0.5 - lag * 9.0) * m + 0.1 * sin(t * 2.1 + seed * 9.0 - lag * 8.0) * still;
    float pitch = 0.2 * m + 0.05 * sin(t * 1.3 + seed * 4.0 - lag * 6.0) + 0.05 * abs(sin(s - lag * 9.0)) * m;
    own = aRotY(yaw * gain) * aRotX(pitch * gain);
  } else if (role > 4.5 && role < 5.5) {
    // Torso: the shoulders turn against the hips; breathes while it stands
    float breath = 1.0 + 0.03 * sin(t * 2.4 + seed * 6.283) * still;
    own = mat3(1.0, 0.0, 0.0, 0.0, breath, 0.0, 0.0, 0.0, 1.0);
    turn = aRotY(-1.6 * twist);
  } else if (role > 5.5) {
    // Wing: raised and beaten from its shoulder (lift worked out per agent, as in Normal); at rest it folds back
    // along the body instead of hanging down
    float fold = clamp(-motion.z / 1.1, 0.0, 1.0);
    own = aRotY(side * fold * 1.35) * aRotZ(side * mix(motion.z, -0.3, fold));
  }
  R = body * turn * own;
  T = body * turn * (aPivot - own * aPivot);
}
`;

const ACTOR_VERTEX_START = `
// The last run starting at or before this instance is its kind's (kinds with nobody on screen are left out)
vec4 seg = uSeg[0];
for (int k = 1; k < ${MAX_SEGS}; k++) {
  if (k >= uSegs) break;
  if (float(gl_InstanceID) + 0.5 > uSeg[k].x) seg = uSeg[k];
}
int aLocal = gl_InstanceID - int(seg.x + 0.5);
int aPer = int(seg.y + 0.5);
int aAgent = aLocal / aPer;
int aRow = int(seg.z + 0.5) + aAgent;
int aIdx = int(seg.w + 0.5) + aLocal - aAgent * aPer;
vec4 aP0 = partTexel(aIdx, 0);
vec4 aP1 = partTexel(aIdx, 1);
vec4 aP2 = partTexel(aIdx, 2);
instanceMatrix = mat4(aP0.x, aP1.x, aP2.x, 0.0, aP0.y, aP1.y, aP2.y, 0.0, aP0.z, aP1.z, aP2.z, 0.0, aP0.w, aP1.w, aP2.w, 1.0);
aPart = partTexel(aIdx, 3);
aPivot = partTexel(aIdx, 4).xyz;
aTint = partTexel(aIdx, 5);
aMat = partTexel(aIdx, 6).xyz;
vec4 aR0 = agentTexel(aRow, 0);
vec4 aR1 = agentTexel(aRow, 1);
vec4 aR2 = agentTexel(aRow, 2);
mat4 actorM = mat4(aR0.x, aR1.x, aR2.x, 0.0, aR0.y, aR1.y, aR2.y, 0.0, aR0.z, aR1.z, aR2.z, 0.0, aR0.w, aR1.w, aR2.w, 1.0);
vec4 actorMotion = agentTexel(aRow, 3);
mat3 actorR;
vec3 actorT;
vec4 actorAct = agentTexel(aRow, 4);
aBiped = actorAct.z;
actorPart(actorMotion, actorAct, actorR, actorT);
vActorColor = aTint.w < -0.5 ? aTint.rgb : agentTexel(aRow, 5 + int(aTint.w + 0.5)).rgb * aTint.rgb;
`;

const ACTOR_NORMAL = `
mat3 aIm = mat3(instanceMatrix);
vec3 actorN = objectNormal / vec3(dot(aIm[0], aIm[0]), dot(aIm[1], aIm[1]), dot(aIm[2], aIm[2]));
actorN = normalize(mat3(actorM) * (actorR * (aIm * actorN)));
vec3 transformedNormal = normalMatrix * actorN;
#ifdef FLIP_SIDED
transformedNormal = -transformedNormal;
#endif
`;

const ACTOR_ORGANIC = `#include <begin_vertex>
{
  // No two heads or bodies quite alike: a slight bulge seeded per part and per agent
  vec3 at = instanceMatrix[3].xyz;
  float sd = fract(sin(dot(at.xz, vec2(12.9898, 78.233)) + at.y * 3.1 + actorMotion.w * 17.0) * 43758.5453) * 6.2832;
  transformed += objectNormal * 0.035 * (sin(position.x * 5.1 + sd) * sin(position.y * 4.3 + sd * 1.7) + 0.6 * sin(position.z * 6.7 - sd));
}`;

const ACTOR_PROJECT = (kit: boolean) => `
vec3 actorLocal = actorR * (instanceMatrix * vec4(transformed, 1.0)).xyz + actorT;
vec4 actorWorld = actorM * vec4(actorLocal, 1.0);
vec4 mvPosition = modelViewMatrix * actorWorld;
gl_Position = projectionMatrix * mvPosition;
${
  kit
    ? `float aScale = length(actorM[0].xyz);
vSL = position;
vSN = normalize(mat3(modelMatrix) * actorN);
vSW = (modelMatrix * actorWorld).xyz;
vSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719)) + actorMotion.w * 91.7) * 43758.5453);
vMat = aMat;
vBase = (modelMatrix * actorM * vec4(0.0, 0.0, 0.0, 1.0)).y;
vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)) * aScale;`
    : ""
}`;

interface Shared {
  agents: { value: THREE.DataTexture };
  time: { value: number };
}

/** A shape mesh's own uniforms: its part texture and this frame's runs of kinds */
interface Own {
  parts: { value: THREE.DataTexture };
  seg: { value: THREE.Vector4[] };
  segs: { value: number };
}

function useActorMaterial(glow: boolean, shape: Shape, shared: Shared, own: Own) {
  const material = useMemo(() => {
    const flat = FLAT_KIT.has(shape);
    const organic = !glow && ORGANIC.has(shape);
    const m = glow ? new THREE.MeshBasicMaterial({ toneMapped: false }) : new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: flat });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uAgents = shared.agents;
      shader.uniforms.uIdleTime = shared.time;
      shader.uniforms.uParts = own.parts;
      shader.uniforms.uSeg = own.seg;
      shader.uniforms.uSegs = own.segs;
      let vs = shader.vertexShader.replace("void main() {", `${ACTOR_VERTEX_PARS}\nvoid main() {\n${ACTOR_VERTEX_START}`).replace("#include <project_vertex>", ACTOR_PROJECT(!glow));
      let fs = shader.fragmentShader;
      if (glow) {
        fs = fs.replace("void main() {", "varying vec3 vActorColor;\nvoid main() {").replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vActorColor;");
      } else {
        vs = vs.replace("#include <defaultnormal_vertex>", ACTOR_NORMAL);
        if (organic) vs = vs.replace("#include <begin_vertex>", ACTOR_ORGANIC);
        fs = fs
          .replace("void main() {", `${HD_FRAGMENT_PARS}\n${KIT_FRAGMENT_PARS}\nvarying vec3 vActorColor;\nvoid main() {`)
          .replace("#include <color_fragment>", KIT_FRAGMENT_COLOR.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vActorColor;"))
          .replace("#include <roughnessmap_fragment>", "float roughnessFactor = clamp(kRough, 0.04, 1.0);")
          .replace("#include <metalnessmap_fragment>", "float metalnessFactor = clamp(kMetal, 0.0, 1.0);")
          .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += kEmit;")
          .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = kBump(-vViewPosition, normal, kHeight);");
      }
      shader.vertexShader = vs;
      shader.fragmentShader = fs;
    };
    m.customProgramCacheKey = () => `actor-hd-${glow ? 1 : 0}-${flat ? 1 : 0}-${organic ? 1 : 0}`;
    return m;
  }, [glow, shape, shared, own]);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

/** A part's role and its pivot (agent space) from the Builder's walker cycles */
function roleOf(p: Part): { role: number; side: number; sub: number; pivot: [number, number, number] } {
  const c = p.idle;
  if (!c) return { role: ROLE.body, side: 0, sub: 0, pivot: [0, 0, 0] };
  const kind = Math.floor(c.kind + 0.5);
  const pivot: [number, number, number] = [c.x, c.y, c.z];
  if (kind === IDLE_KIND.leg) {
    const amp = c.amp ?? 1;
    return { role: Math.abs(amp) > 1.5 ? ROLE.arm : ROLE.leg, side: Math.sign(amp), sub: 0, pivot };
  }
  if (kind === IDLE_KIND.flap) return { role: ROLE.wing, side: Math.sign(c.amp ?? 1), sub: 0, pivot };
  if (kind === IDLE_KIND.head) return { role: ROLE.head, side: 0, sub: 0, pivot };
  if (kind === IDLE_KIND.trail) {
    // amp: the gait (+ 0.5 for a biped) + damping × 0.45
    const f = (c.amp ?? 0) - Math.floor(c.amp ?? 0);
    return { role: ROLE.trail, side: Math.min(1, (f % 0.5) / 0.45), sub: c.sub ?? 0.15, pivot };
  }
  if (kind === IDLE_KIND.torso) return { role: ROLE.torso, side: 0, sub: 0, pivot: [0, c.y, 0] };
  return { role: ROLE.body, side: 0, sub: 0, pivot: [0, 0, 0] };
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _pq = new THREE.Quaternion();
const _pv = new THREE.Vector3();
const _c = new THREE.Color();
const _l = new THREE.Matrix4();

/** One kind's run in a shape mesh: which kind, its parts of this shape (n) and where they start in the part texture */
interface Segment {
  kind: number;
  n: number;
  first: number;
}

/** A float texture of `texels` RGBA texels, `width` wide */
function dataTexture(texels: number, width: number) {
  const rows = Math.max(1, Math.ceil(texels / width));
  const tex = new THREE.DataTexture(new Float32Array(width * rows * 4), width, rows, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * One shape kind (lit or unlit, full, light or coarse twin) for every actor kind that has it: `parts` laid out kind
 * after kind (`segments`), drawn `visible × n` instances per kind each frame
 */
function HdPartBatch({ shape, glow, lo, parts, segments, shared, register }: { shape: Shape; glow: boolean; lo: number; parts: Part[]; segments: Segment[]; shared: Shared; register: (mesh: THREE.Mesh, own: Own, segments: Segment[] | null) => void }) {
  // Each part's place in its agent (with its HD rest pose), role, pivot, tint and material
  const own = useMemo<Own>(() => {
    const tex = dataTexture(parts.length * PART_TEXELS, PART_W);
    const data = tex.image.data as Float32Array;
    parts.forEach((pt, i) => {
      _e.set(pt.rx || 0, pt.ry || 0, pt.rz || 0);
      _q.setFromEuler(_e);
      _p.set(pt.x, pt.y, pt.z);
      if (pt.pose) {
        const o = pt.pose;
        _pq.set(o.q[0], o.q[1], o.q[2], o.q[3]);
        _p.sub(_pv.set(o.x, o.y, o.z)).applyQuaternion(_pq).add(_pv);
        _q.premultiply(_pq);
      }
      const e = _l.compose(_p, _q, _s.set(pt.w, pt.h, pt.d)).elements;
      const r = roleOf(pt);
      const t = parseTint(pt.color);
      const m = SURFACES[pt.mat ?? "plain"];
      if (t.slot < 0) _c.set(t.color);
      data.set(
        [
          e[0], e[4], e[8], e[12],
          e[1], e[5], e[9], e[13],
          e[2], e[6], e[10], e[14],
          r.role, r.side, r.sub, 0,
          r.pivot[0], r.pivot[1], r.pivot[2], 0,
          ...(t.slot < 0 ? [_c.r, _c.g, _c.b, -1] : [t.f, t.f, t.f, t.slot]),
          m.id, m.rough, m.metal, 0
        ],
        i * PART_TEXELS * 4
      );
    });
    return { parts: { value: tex }, seg: { value: Array.from({ length: MAX_SEGS }, () => new THREE.Vector4()) }, segs: { value: 0 } };
  }, [parts]);
  useEffect(() => () => own.parts.value.dispose(), [own]);
  const material = useActorMaterial(glow, shape, shared, own);
  // lo: 0 the full HD twin, 1 the light twin, 2 the coarse twin of a tiny part; instanced by count, its data in textures
  const geometry = useMemo(() => {
    const base = lo === 2 ? tinyGeometry(shape)! : getShapeGeometry(shape, true, lo === 1);
    // Its own copy: disposing it must not free the shared shape's buffers
    const g = new THREE.InstancedBufferGeometry().copy(base as THREE.InstancedBufferGeometry);
    g.instanceCount = 0;
    return g;
  }, [shape, lo]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const ref = useRef<THREE.Mesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = false;
    register(mesh, own, segments);
    return () => register(mesh, own, null);
  }, [own, segments, geometry, material, register]);

  return <mesh ref={ref} args={[geometry, material]} frustumCulled={false} raycast={() => null} />;
}

const _base = new THREE.Matrix4();
const _bq = new THREE.Quaternion();
const _bp = new THREE.Vector3();
const _bs = new THREE.Vector3();
const _be = new THREE.Euler(0, 0, 0, "YXZ");
const _sphere = new THREE.Sphere(new THREE.Vector3(), 1.6);
const _hp = new THREE.Vector3();
const _hm = new THREE.Matrix4();
const _gait: Gait = { stride: 0, moving: 0, act: 0, amount: 0 };

/** Where an agent's instances point while it is off screen: every vertex at one point, so it draws no pixels (an
 * instance buffer starts out as identity matrices, which would draw each part as a unit shape at the origin) */
export const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Hides every instance of a mesh up to `n` */
export function hideAll(mesh: THREE.InstancedMesh, n = mesh.instanceMatrix.count) {
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, HIDDEN);
  mesh.instanceMatrix.needsUpdate = true;
}
/** A wading agent's foam ring this far above the surface (clear of the water's own lap) */
const WAKE_LIFT = 0.04;
const _wake = new THREE.Matrix4();
const _mark = new THREE.Matrix4();
const _wq = new THREE.Quaternion();
const _wp = new THREE.Vector3();
const _ws = new THREE.Vector3();

/**
 * The grounded agent's mark on what it stands on: its blob shadow, or wading (the ground under the water's surface) a
 * ring of foam on the surface that swells and settles with its stride, the blob hidden
 */
export function groundMark(s: FrameShared, slot: number, x: number, ground: number, z: number, t: number, phase: number, moving: number, scale: number, blobY: number) {
  const { blob, wake, waterLevel } = s;
  if (!blob) return;
  if (waterLevel !== undefined && wake && ground < waterLevel - 0.05 && s.wakes < wake.instanceMatrix.count) {
    blob.setMatrixAt(slot, HIDDEN);
    // Deeper water, a wider ring; walking, it pulses with the steps (seeded, so no two agents beat together)
    const depth = Math.min(1, (waterLevel - ground) / 0.5);
    const r = scale * (0.75 + depth * 0.35) * (1 + Math.sin(t * (moving ? 6.5 : 2.2) + phase * 6.28) * (moving ? 0.12 : 0.06));
    _wq.setFromAxisAngle(_ws.set(0, 1, 0), phase * 6.28 + t * 0.3);
    wake.setMatrixAt(s.wakes++, _wake.compose(_wp.set(x, waterLevel + WAKE_LIFT, z), _wq, _ws.set(r, 1, r)));
    wake.count = s.wakes;
    wake.instanceMatrix.needsUpdate = true;
    return;
  }
  blob.setMatrixAt(slot, _mark.makeTranslation(x, blobY, z));
}

const frac = (v: number) => v - Math.floor(v);

export interface HdHalo {
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
}

/** One kind of agent: `halo` a carried light's glow (camera-facing, additive), drawn as in Normal; `blobOffset` its
 * slice of the shared blob shadow */
export interface HdKind {
  kind: ActorKind;
  actors: Actor[];
  blobOffset: number;
  grounded: boolean;
  halo?: HdHalo;
}

/** Every agent of every kind in HD */
export function ActorsHd({
  kinds,
  shared: frame,
  haloGeometry,
  haloMaterial,
  blobY
}: {
  kinds: HdKind[];
  shared: MutableRefObject<FrameShared>;
  haloGeometry: THREE.BufferGeometry;
  haloMaterial: THREE.Material;
  blobY: number;
}) {
  const models = useMemo(() => kinds.map((k) => actorHdModel(k.kind)), [kinds]);
  const total = kinds.reduce((n, k) => n + k.actors.length, 0);
  const capacity = Math.max(8, 2 ** Math.ceil(Math.log2(Math.max(1, total))));
  const shared = useMemo<Shared>(() => ({ agents: { value: dataTexture(capacity * AGENT_TEXELS, AGENT_W) }, time: { value: 0 } }), [capacity]);
  useEffect(() => () => shared.agents.value.dispose(), [shared]);

  // Shape batches: one mesh per (shape, lit/unlit, light twin) for all kinds, each kind's parts of it in one run
  const batches = useMemo(() => {
    const map = new Map<string, { shape: Shape; glow: boolean; lo: number; byKind: Map<number, Part[]> }>();
    models.forEach((model, k) => {
      for (const p of model.parts) {
        const shape = p.hdShape ?? p.shape;
        // Their biggest parts keep the full HD twin, the rest take the light twin, the tiniest a coarse one
        const size = middle(p);
        const tiny = size < ACTOR_TINY && !!tinyGeometry(shape);
        const lo = tiny ? 2 : hdLo(shape, p) || (HD_LO_SHAPES.has(shape) && size < ACTOR_FULL_TWIN) ? 1 : 0;
        const key = `${shape}|${p.glow ? 1 : 0}|${lo}`;
        let b = map.get(key);
        if (!b) map.set(key, (b = { shape, glow: !!p.glow, lo, byKind: new Map() }));
        let list = b.byKind.get(k);
        if (!list) b.byKind.set(k, (list = []));
        list.push(p);
      }
    });
    // A shape used by more kinds than a mesh can list goes on in a second mesh
    const out: { key: string; shape: Shape; glow: boolean; lo: number; parts: Part[]; segments: Segment[] }[] = [];
    for (const [key, b] of map) {
      const runs = [...b.byKind.entries()];
      for (let c = 0; c < runs.length; c += MAX_SEGS) {
        const parts: Part[] = [];
        const segments: Segment[] = [];
        for (const [kind, list] of runs.slice(c, c + MAX_SEGS)) {
          segments.push({ kind, n: list.length, first: parts.length });
          parts.push(...list);
        }
        out.push({ key: `${key}|${c}`, shape: b.shape, glow: b.glow, lo: b.lo, parts, segments });
      }
    }
    return out;
  }, [models]);

  // The live shape meshes, so each frame sets which kinds they draw and how many instances
  const meshes = useRef(new Map<THREE.Mesh, { own: Own; segments: Segment[] }>());
  const register = useMemo(
    () => (mesh: THREE.Mesh, own: Own, segments: Segment[] | null) => {
      if (segments === null) meshes.current.delete(mesh);
      else meshes.current.set(mesh, { own, segments });
    },
    []
  );

  // Each agent's colour slots (linear), and a seed of its own
  const looks = useMemo(
    () =>
      kinds.map(({ actors }) => {
        const colors = new Float32Array(actors.length * 16);
        const seeds = new Float32Array(actors.length);
        actors.forEach((a, i) => {
          for (let k = 0; k < 4; k++) {
            _c.set(a.colors?.[k] ?? "#ffffff");
            colors.set([_c.r, _c.g, _c.b, 1], i * 16 + k * 4);
          }
          seeds[i] = frac(Math.sin(a.x * 12.9898 + a.z * 78.233 + a.phase * 3.7) * 43758.5453);
        });
        return { colors, seeds };
      }),
    [kinds]
  );

  const haloRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  useLayoutEffect(() => {
    kinds.forEach(({ actors, halo }, k) => {
      const h = haloRefs.current[k];
      if (!h || !halo) return;
      h.count = actors.length;
      _c.set(halo.color);
      for (let i = 0; i < actors.length; i++) h.setColorAt(i, _c);
      if (h.instanceColor) h.instanceColor.needsUpdate = true;
      hideAll(h, actors.length);
    });
  }, [kinds]);

  // Per kind this frame: its first agent row and how many of its agents are on screen
  const rows = useMemo(() => kinds.map(() => ({ start: 0, count: 0 })), [kinds]);
  // Which agents were on screen last frame: one leaving it takes its halo and blob with it
  const shown = useMemo(() => kinds.map(({ actors }) => new Uint8Array(actors.length)), [kinds]);

  useFrame((state) => {
    const { visible, frustum, blob, heightAt, paths } = frame.current;
    if (!visible || paths.length !== kinds.length) return;
    const t = state.clock.elapsedTime;
    shared.time.value = t;
    const tex = shared.agents.value;
    const data = tex.image.data as Float32Array;
    let v = 0;
    kinds.forEach(({ actors, grounded, blobOffset, halo }, k) => {
      const model = models[k];
      const look = looks[k];
      const haloMesh = halo ? haloRefs.current[k] : null;
      rows[k].start = v;
      const on = shown[k];
      const path = paths[k];
      for (let i = 0; i < actors.length; i++) {
        const a = actors[i];
        // Only what is on screen is drawn: per-frame cost scales with it (an agent whose whole path is out of view
        // isn't even posed)
        const p = frustum.intersectsBox(path[i].box) ? pose(a, t) : null;
        let ground = 0;
        const scale = a.scale ?? 1;
        if (p) {
          ground = heightAt ? (Number.isNaN(path[i].ground) ? heightAt(p.x, p.z) : path[i].ground) : 0;
          p.y += ground;
          _sphere.center.set(p.x, p.y, p.z);
          _sphere.radius = 1.6 * Math.max(1, scale);
        }
        if (!p || !frustum.intersectsSphere(_sphere)) {
          if (on[i]) {
            on[i] = 0;
            haloMesh?.setMatrixAt(i, HIDDEN);
            if (grounded && blob) blob.setMatrixAt(blobOffset + i, HIDDEN);
          }
          continue;
        }
        on[i] = 1;
        _be.set(p.pitch, p.yaw, p.roll);
        _base.compose(_bp.set(p.x, p.y, p.z), _bq.setFromEuler(_be), _bs.setScalar(scale));
        const e = _base.elements;
        const o = v * AGENT_TEXELS * 4;
        data[o] = e[0];
        data[o + 1] = e[4];
        data[o + 2] = e[8];
        data[o + 3] = e[12];
        data[o + 4] = e[1];
        data[o + 5] = e[5];
        data[o + 6] = e[9];
        data[o + 7] = e[13];
        data[o + 8] = e[2];
        data[o + 9] = e[6];
        data[o + 10] = e[10];
        data[o + 11] = e[14];
        gaitOf(a, t, _gait);
        data[o + 12] = _gait.stride;
        data[o + 13] = _gait.moving;
        data[o + 14] = model.winged ? wingLift(a, t) : 0;
        data[o + 15] = look.seeds[i];
        data[o + 16] = _gait.act;
        data[o + 17] = _gait.amount;
        data[o + 18] = model.biped ? 1 : 0;
        data.set(look.colors.subarray(i * 16, i * 16 + 16), o + 20);
        v++;
        if (halo && haloMesh) {
          const flicker = 1 + Math.sin(t * 9 + a.phase * 13) * 0.06 + Math.sin(t * 23 + a.phase * 5) * 0.04;
          _hp.set(halo.x, halo.y, halo.z).applyMatrix4(_base);
          haloMesh.setMatrixAt(i, _hm.compose(_hp, state.camera.quaternion, _bs.setScalar(halo.size * scale * flicker)));
        }
        const blobAt = heightAt ? ground : a.motion === "circle" && a.y > 0.5 ? 0 : a.y;
        // A rider's mount casts the blob (or, wading, leaves the wake)
        if (grounded && blob && !a.ride) groundMark(frame.current, blobOffset + i, p.x, ground, p.z, t, a.phase, _gait.moving, scale, blobAt + blobY);
      }
      rows[k].count = v - rows[k].start;
      if (haloMesh) haloMesh.instanceMatrix.needsUpdate = true;
    });
    // Upload only the rows the visible agents fill
    const used = Math.ceil((v * AGENT_TEXELS) / AGENT_W);
    for (let r = 0; r < used; r++) tex.addUpdateRange(r * AGENT_W * 4, AGENT_W * 4);
    if (used > 0) tex.needsUpdate = true;
    // Each shape mesh lists only the kinds with someone on screen; with nobody it issues no draw at all
    for (const [mesh, { own, segments }] of meshes.current) {
      let segs = 0;
      let count = 0;
      for (const sg of segments) {
        const r = rows[sg.kind];
        if (r.count === 0) continue;
        own.seg.value[segs++].set(count, sg.n, r.start, sg.first);
        count += r.count * sg.n;
      }
      own.segs.value = segs;
      (mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = count;
      mesh.visible = count > 0;
    }
  });

  return (
    <>
      {batches.map((b) => (
        <HdPartBatch key={`${b.key}-${b.parts.length}`} shape={b.shape} glow={b.glow} lo={b.lo} parts={b.parts} segments={b.segments} shared={shared} register={register} />
      ))}
      {kinds.map(({ kind, actors, halo }, k) =>
        halo ? (
          <instancedMesh
            key={`halo-${kind}-${actors.length}`}
            ref={(el) => {
              haloRefs.current[k] = el;
            }}
            args={[haloGeometry, haloMaterial, Math.max(1, actors.length)]}
            frustumCulled={false}
            renderOrder={4}
            raycast={() => null}
          />
        ) : null
      )}
    </>
  );
}
