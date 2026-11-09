import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MergeStatic, DYNAMIC } from "@/components/3d/city/MergeStatic";
import { MODEL_RIGS, BossBone, BossPart, BossShape, flattenRig, strike } from "./bossRigs";
import { MERCENARY_RIGS } from "./mercenaryRigs";
import { VOID_RIGS } from "./voidRigs";
import { BOSS_CRIES, BOSS_CRY_MS } from "./bossCries";

/*
 * A world boss (or a legendary site), alive: its rig (bossRigs.ts) drawn with each bone's parts merged into one mesh per material, so a
 * boss costs about one draw call per bone. Bones breathe, sway, beat their wings and wave their tentacles; the boss
 * slowly looks round, now and then rears up in a roar, and while armies fight it, it turns on them and strikes on
 * a loop. A dark aura pulses under it with embers rising. A slumbering zone shows the next boss rising as a phantom
 * (Spectral swaps its materials) in a column of light with smoke curling up. Nothing here casts shadows: the
 * shadow map is drawn once, so moving parts would leave frozen shadows. Effects are one draw call each.
 */

const ATTACK_PERIOD = 2.4;
/** The Codex's cycle for a rig that walks: a strike, a breath, then a few steps in place */
const SHOWCASE_MARCH = 8.5;
const ZERO: [number, number, number] = [0, 0, 0];

/* ------------------------------ unit geometries ------------------------------ */

const geoCache = new Map<string, THREE.BufferGeometry>();
function unitGeometry(s: BossShape, t?: number): THREE.BufferGeometry {
  const key = `${s}:${t ?? ""}`;
  let g = geoCache.get(key);
  if (g) return g;
  switch (s) {
    case "box":
      g = new THREE.BoxGeometry(1, 1, 1);
      break;
    case "sph":
      g = new THREE.SphereGeometry(0.5, 10, 8);
      break;
    case "cone":
      g = new THREE.ConeGeometry(0.5, 1, 8);
      break;
    case "spike":
      g = new THREE.ConeGeometry(0.5, 1, 4);
      break;
    case "blade":
      g = new THREE.ConeGeometry(0.5, 1, 3);
      break;
    case "cyl":
      g = new THREE.CylinderGeometry(0.5 * (t ?? 1), 0.5, 1, 10);
      break;
    case "tor":
      g = new THREE.TorusGeometry(0.5, t ?? 0.12, 6, 20);
      break;
    case "arc":
      g = new THREE.TorusGeometry(0.5, t ?? 0.12, 6, 12, Math.PI);
      break;
    case "oct":
      g = new THREE.OctahedronGeometry(0.5);
      break;
    case "dod":
      g = new THREE.DodecahedronGeometry(0.5);
      break;
    case "ico":
      g = new THREE.IcosahedronGeometry(0.5);
      break;
  }
  geoCache.set(key, g);
  return g;
}

function PartMesh({ p }: { p: BossPart }) {
  return (
    <mesh geometry={unitGeometry(p.s, p.t)} position={p.p} scale={p.z} rotation={p.r ?? ZERO}>
      <meshStandardMaterial
        color={p.c}
        roughness={0.75}
        metalness={0.05}
        flatShading
        emissive={p.glow ? p.c : "#000000"}
        emissiveIntensity={p.glow ? 2.4 : 1}
      />
    </mesh>
  );
}

function BoneNode({
  bone,
  index,
  objs,
  bare = false
}: {
  bone: BossBone;
  index: Map<BossBone, number>;
  objs: React.MutableRefObject<Array<THREE.Group | null>>;
  /** Leave the bone's own parts out (the root: its parts are the ground, drawn apart so they never turn with the boss) */
  bare?: boolean;
}) {
  const i = index.get(bone)!;
  return (
    <group
      ref={(o) => {
        if (o) o.rotation.order = "YXZ";
        objs.current[i] = o;
      }}
      position={bone.at}
      userData={DYNAMIC}
    >
      {!bare && (
        <MergeStatic deps={[]}>
          {bone.parts.map((p, j) => (
            <PartMesh key={j} p={p} />
          ))}
        </MergeStatic>
      )}
      {bone.kids?.map((k, j) => (
        <BoneNode key={j} bone={k} index={index} objs={objs} />
      ))}
    </group>
  );
}

/* ------------------------------ effects ------------------------------ */

/** One clock for every boss effect material, written once per frame */
const FX_TIME = { value: 0 };

const AURA_GEOMETRY = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const COLUMN_GEOMETRY = new THREE.CylinderGeometry(1, 1.15, 1, 28, 1, true).translate(0, 0.5, 0);

function auraMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: FX_TIME, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vXY; void main() { vXY = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; varying vec2 vXY;
      void main() {
        float d = length(vXY);
        float a = atan(vXY.y, vXY.x);
        float blob = smoothstep(1.0, 0.15, d) * 0.55;
        float pulse = 0.55 + 0.45 * sin(uTime * 2.2 - d * 6.0);
        float rays = 0.5 + 0.5 * sin(a * 7.0 + uTime * 0.6);
        float glow = smoothstep(0.35, 0.8, d) * smoothstep(1.0, 0.8, d) * pulse * (0.6 + 0.4 * rays);
        gl_FragColor = vec4(uColor * glow * 1.6, max(blob, glow * 0.9));
      }`
  });
}

function columnMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: FX_TIME, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float fade = pow(max(1.0 - vUv.y, 0.0), 1.6) * smoothstep(0.0, 0.08, vUv.y);
        float bands = 0.45 + 0.55 * sin(vUv.y * 18.0 - uTime * 2.4 + sin(vUv.x * 18.85 + uTime) * 1.2);
        float edge = 0.35 + 0.65 * pow(abs(sin(vUv.x * 3.14159 * 6.0 + uTime * 0.4)), 4.0);
        gl_FragColor = vec4(uColor * fade * bands * edge * 0.38, 1.0);
      }`
  });
}

/** Rising sprites: embers (additive, fast) or smoke (soft, slow, swelling). All motion runs in the vertex shader. */
function particleMaterial(color: string, smoke: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: {
      uTime: FX_TIME,
      uColor: { value: new THREE.Color(color) },
      uRise: { value: smoke ? 7.5 : 6.0 },
      uSize: { value: smoke ? 2.6 : 0.35 },
      uGrow: { value: smoke ? 2.2 : 0.0 },
      uSpeed: { value: smoke ? 0.09 : 0.22 },
      uAlpha: { value: smoke ? 0.5 : 1.0 }
    },
    vertexShader: `
      uniform float uTime; uniform float uRise; uniform float uSize; uniform float uGrow; uniform float uSpeed;
      attribute vec3 aSeed; varying float vLife;
      void main() {
        float life = fract(uTime * uSpeed * (0.6 + aSeed.z) + aSeed.x);
        float ang = aSeed.x * 6.2831 + life * 2.0;
        float r = aSeed.y * (1.0 + life * 0.4);
        vec3 p = vec3(cos(ang) * r, life * uRise, sin(ang) * r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (1.0 + life * uGrow) * (320.0 / -mv.z);
        vLife = life;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uAlpha; varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * sin(vLife * 3.14159) * uAlpha);
      }`
  });
}

function particleGeometry(count: number, radius: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 3);
  let h = 1;
  const rnd = () => ((h = (h * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    seeds[i * 3] = rnd();
    seeds[i * 3 + 1] = radius * (0.25 + rnd() * 0.75);
    seeds[i * 3 + 2] = rnd();
  }
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
  return g;
}

const FX = { fx: true };
const noRaycast = () => null;

/** Aura and embers under a living boss; a column of light and curling smoke where the next one rises; a beam over a legendary site */
function BossFx({ aura, ember, beam, slumbering, size = 3.6 }: { aura: string; ember: string; beam?: string; slumbering: boolean; size?: number }) {
  const mats = useMemo(
    () => ({
      aura: auraMaterial(slumbering ? "#7c3aed" : aura),
      column: columnMaterial(slumbering ? "#67e8f9" : beam ?? "#67e8f9"),
      embers: particleMaterial(slumbering ? "#a5f3fc" : ember, false),
      smoke: particleMaterial("#4c1d95", true)
    }),
    [aura, ember, beam, slumbering]
  );
  const embers = useMemo(() => particleGeometry(36, size * 0.72), [size]);
  const smoke = useMemo(() => particleGeometry(22, 2.0), []);
  // Made here, so freed here (r3f disposes only what JSX creates): every map ↔ city trip leaked them
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => () => embers.dispose(), [embers]);
  useEffect(() => () => smoke.dispose(), [smoke]);
  return (
    <>
      <mesh geometry={AURA_GEOMETRY} material={mats.aura} position={[0, 0.25, 0]} scale={size} userData={FX} raycast={noRaycast} renderOrder={1} />
      <points geometry={embers} material={mats.embers} userData={FX} raycast={noRaycast} frustumCulled={false} />
      {slumbering && (
        <>
          <mesh geometry={COLUMN_GEOMETRY} material={mats.column} scale={[2.6, 10, 2.6]} userData={FX} raycast={noRaycast} />
          <points geometry={smoke} material={mats.smoke} userData={FX} raycast={noRaycast} frustumCulled={false} />
        </>
      )}
      {!slumbering && beam && <mesh geometry={COLUMN_GEOMETRY} material={mats.column} scale={[0.9, 16, 0.9]} userData={FX} raycast={noRaycast} />}
    </>
  );
}

/* ------------------------------ the boss ------------------------------ */

/** World bosses and legendary sites are rigged models */
export const hasRig = (type: string) => type in MODEL_RIGS;

export function BossModel({
  type,
  slumbering = false,
  fightYaw = null,
  showcase = false,
  fx = true,
  cryId,
  marching = false,
  seedId
}: {
  type: string;
  /** A phantom rising where the last boss fell: slow, no strikes */
  slumbering?: boolean;
  /** Armies are fighting it from this direction (yaw): it faces them and strikes on a loop */
  fightYaw?: number | null;
  /** Codex preview: strike every few seconds so the attack can be seen */
  showcase?: boolean;
  /** Draw the rig's own aura and sparks (mercenaries leave it to the rarity kit, so a common one doesn't glow) */
  fx?: boolean;
  /** NPC id on the map: its battle cries (`BOSS_CRIES`, a Finale or Enrage waking) rear it up in one long roar */
  cryId?: string;
  /** On the march: a rig with a walk (mercenaries) walks in place */
  marching?: boolean;
  /** Seeds its motion (a band's copies, each by its own id, never in step); the type's own seed otherwise */
  seedId?: string;
}) {
  // Mercenaries are Codex-only rigs, drawn the same way
  const rig = MODEL_RIGS[type] ?? MERCENARY_RIGS[type] ?? VOID_RIGS[type];
  const flat = useMemo(() => flattenRig(rig.root), [rig]);
  const index = useMemo(() => new Map(flat.map((f, i) => [f.bone, i])), [flat]);
  const objs = useRef<Array<THREE.Group | null>>([]);
  const body = useRef<THREE.Group>(null);
  const ground = useRef<THREE.Group>(null);
  /** A rig that walks (mercenaries): the Codex shows its march between strikes */
  const walks = useMemo(() => flat.some((f) => f.bone.walk), [flat]);
  const seed = useMemo(() => {
    let h = 0;
    for (const ch of seedId ?? type) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return (h % 1000) / 100;
  }, [type, seedId]);

  useFrame(({ clock }, delta) => {
    const t0 = clock.elapsedTime;
    FX_TIME.value = t0;
    const t = slumbering ? t0 * 0.5 : t0;
    // Strike cycle: on a loop while fought, a rare roar while idle, every few seconds in the Codex
    let u = 0;
    let amp = 0;
    if (!slumbering) {
      if (fightYaw !== null) {
        u = (t0 % ATTACK_PERIOD) / ATTACK_PERIOD;
        amp = 1;
      } else {
        const period = showcase ? (walks ? SHOWCASE_MARCH : 5) : 11 + (seed % 4);
        const w = (t0 + seed) % period;
        if (w < ATTACK_PERIOD) {
          u = w / ATTACK_PERIOD;
          amp = showcase ? 1 : 0.4;
        }
      }
    }
    // The march: on the map while it marches; in the Codex a few steps after each strike (eased in and out)
    let stride = 0;
    if (walks && !slumbering && fightYaw === null) {
      if (marching) stride = 1;
      else if (showcase) {
        const w = (t0 + seed) % SHOWCASE_MARCH;
        const k = Math.min(1, Math.max(0, (w - 3.2) / 0.5), Math.max(0, (SHOWCASE_MARCH - 0.6 - w) / 0.5));
        stride = w > 3.2 ? k * k * (3 - 2 * k) : 0;
      }
    }
    // A battle cry: one slow, heavy rear-up over the fight
    const cry = cryId ? BOSS_CRIES.get(cryId) : undefined;
    const cried = cry !== undefined ? (Date.now() - cry) / BOSS_CRY_MS : 1;
    if (!slumbering && cried >= 0 && cried < 1) {
      u = cried * 0.999;
      amp = 1.6;
    }
    const blink = (t0 * 0.23 + seed) % 1 < 0.035 ? 0.1 : 1;
    for (let i = 0; i < flat.length; i++) {
      const o = objs.current[i];
      if (!o) continue;
      const b = flat[i].bone;
      const id = b.idle;
      const ak = b.atk;
      const w = id ? Math.sin(t * (id.f ?? 1.2) + (id.ph ?? 0) + seed) : 0;
      const k = ak && amp ? strike(u - (ak.d ?? 0)) * amp : 0;
      const r = b.r ?? ZERO;
      const ir = id?.r ?? ZERO;
      const ar = ak?.r ?? ZERO;
      const wk = b.walk;
      const m = wk && stride ? Math.sin(t0 * (wk.f ?? 6) + (wk.ph ?? 0) + seed * 2.3) * stride : 0;
      const wr = wk?.r ?? ZERO;
      o.rotation.set(r[0] + ir[0] * w + ar[0] * k + wr[0] * m, r[1] + ir[1] * w + ar[1] * k + wr[1] * m + (b.spin ? b.spin * t : 0), r[2] + ir[2] * w + ar[2] * k + wr[2] * m);
      const ip = id?.p ?? ZERO;
      const ap = ak?.p ?? ZERO;
      const wp = wk?.p ?? ZERO;
      o.position.set(b.at[0] + ip[0] * w + ap[0] * k + wp[0] * m, b.at[1] + ip[1] * w + ap[1] * k + wp[1] * m, b.at[2] + ip[2] * w + ap[2] * k + wp[2] * m);
      const s = Math.max(0.01, (b.s0 ?? 1) + (id?.s ?? 0) * w + (ak?.s ?? 0) * Math.max(0, k));
      o.scale.set(s, b.eye ? s * blink : s, s);
    }
    // Face the attackers, otherwise look slowly round (the shortest way, the yaw kept within ±π)
    const g = body.current;
    if (g) {
      const target = fightYaw ?? (slumbering || rig.still ? 0 : Math.sin(t0 * 0.17 + seed) * 0.45);
      const d = Math.atan2(Math.sin(target - g.rotation.y), Math.cos(target - g.rotation.y));
      const y = g.rotation.y + d * Math.min(1, delta * 2.5);
      g.rotation.y = Math.atan2(Math.sin(y), Math.cos(y));
      g.position.y = rig.float ? rig.float + Math.sin(t * 1.3) * 0.18 : 0;
      // The ground it stands on (the root's own parts) holds the root's pose and height, but never turns with it
      const gr = ground.current;
      const o = objs.current[0];
      if (gr && o) {
        gr.position.set(o.position.x, o.position.y + g.position.y, o.position.z);
        gr.rotation.copy(o.rotation);
        gr.scale.copy(o.scale);
      }
    }
  });

  return (
    <group>
      <group ref={ground} userData={DYNAMIC}>
        <MergeStatic deps={[]}>
          {rig.root.parts.map((p, j) => (
            <PartMesh key={j} p={p} />
          ))}
        </MergeStatic>
      </group>
      <group ref={body}>
        <BoneNode bone={rig.root} index={index} objs={objs} bare />
      </group>
      {fx && <BossFx aura={rig.aura} ember={rig.ember} beam={rig.beam} slumbering={slumbering} size={rig.auraSize} />}
    </group>
  );
}
