import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rngFor } from "@/utils/random";
import { Kit } from "./heroKit";
import { BONE_TEX_W, BUCKET_OF, HERO_BUCKETS, SPARK, Sparks, heroGhostMaterial, heroMaterials, sparkMaterial } from "./heroMaterials";
import { HeroAura, HeroAuraSite } from "./HeroAura";
import { HeroSite, auraAt } from "./HeroBatch";
import { BossActionId, BossLive, Cine, RigBuilder, RigPlayer } from "./heroRig";
import { riggedHero } from "./heroBosses";
import { BOSS_CRIES } from "./bossCries";

/*
 * Every world boss in high graphics, all drawn together: their parts merged into one mesh per shared hero material (each
 * vertex riding its bone), one `Points` for their sparks, one for their bursts and their legendary auras, so draws do
 * not grow with the bosses or their bones. Every frame each boss is posed on the CPU (`heroRig.ts`) and its bones are
 * written into one float texture. A slumbering boss is drawn by the ghost material only. Nothing here casts shadows: the
 * map's shadows are drawn once, and these move.
 */

const _v = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _view = new THREE.Matrix4();

/** A slumbering boss's column of light: cyan, wide, as the Normal phantom's */
const SLUMBER_AURA: Omit<HeroAuraSite, "x" | "y" | "z"> = {
  beam: { y: 0, height: 11, radius: 1.3 },
  embers: { inner: 0.6, outer: 2.4, height: 7, count: 70 },
  color: "#0e6f86",
  hot: "#5fd8ee"
};

// Bursts of spray, sand or venom flung out of an impact: each spark reads its boss's facing slot (where the boss stands and
// faces now, and how long since the impact) from the bone texture
const BURST_VERT = `
  uniform highp sampler2D uBones;
  uniform float uViewH;
  attribute float aBone;
  attribute vec4 aSeed;
  attribute vec3 aVel;
  attribute vec3 aCol;
  varying float vAlpha;
  varying vec3 vCol;
  vec4 bt(int b, int k) {
    int i = b * 4 + k;
    return texelFetch(uBones, ivec2(i % ${BONE_TEX_W}, i / ${BONE_TEX_W}), 0);
  }
  void main() {
    int b = int(aBone + 0.5);
    float age = bt(b, 3).z * aSeed.y;
    float life = aSeed.z;
    vCol = aCol;
    if (age > life) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }
    vec4 p = vec4(position + aVel * age + vec3(0.0, -aSeed.w * age * age, 0.0), 1.0);
    vec3 w = vec3(dot(bt(b, 0), p), dot(bt(b, 1), p), dot(bt(b, 2), p));
    float k = age / life;
    vAlpha = (1.0 - k) * smoothstep(0.0, 0.04, age);
    vec4 mv = modelViewMatrix * vec4(w, 1.0);
    gl_PointSize = clamp(aSeed.x * (0.7 + k * 0.8) * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.01), 1.0, 48.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const BURST_FRAG = `
  varying float vAlpha;
  varying vec3 vCol;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = exp(-d * d * 3.0) * vAlpha;
    gl_FragColor = vec4(vCol * a * 1.5, a * 0.5);
  }
`;

/** Where a moving site stands this frame (world), and which way it faces */
export interface SitePlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Every bone row of a site's slots turned by `at.yaw` about the origin and carried to `at` (its rows are world 3×4 matrices) */
function carrySlots(data: Float32Array, base: number, slots: number, at: SitePlacement) {
  const c = Math.cos(at.yaw);
  const s = Math.sin(at.yaw);
  for (let b = base; b < base + slots; b++) {
    const o = b * 16;
    for (let k = 0; k < 4; k++) {
      const r0 = data[o + k];
      const r2 = data[o + 8 + k];
      data[o + k] = c * r0 + s * r2;
      data[o + 8 + k] = -s * r0 + c * r2;
    }
    data[o + 3] += at.x;
    data[o + 7] += at.y;
    data[o + 11] += at.z;
  }
}

/** A site with nowhere to stand this frame: its bones collapse to nothing (no vertex of it reaches the screen) */
function hideSlots(data: Float32Array, base: number, slots: number) {
  for (let b = base; b < base + slots; b++) data.fill(0, b * 16, b * 16 + 12);
}

/** Every boss at its site; the map says what each is doing (`live`), the Codex plays one action (`action`) */
export function BossBatch({
  sites,
  live,
  action,
  onCine,
  place
}: {
  sites: HeroSite[];
  live?: Record<string, BossLive>;
  action?: BossActionId;
  /** The Codex: the impacts' screen effects */
  onCine?: (c: Cine) => void;
  /**
   * Sites that move (a mercenary band on the march): built at the origin, each frame every bone of a site is carried to
   * where this puts it (turned about its feet), so a copy costs a CPU pose and its vertices, never a draw. Their sparks
   * and auras are left out (they are fixed in the world); null hides the site this frame
   */
  place?: (siteId: string) => SitePlacement | null;
}) {
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);

  const built = useMemo(() => {
    const time = { value: 0 };
    const k = new Kit(true, true, true);
    const players: Array<{ site: HeroSite; player: RigPlayer }> = [];
    const awake: Sparks[] = [];
    const sleep: Sparks[] = [];
    const burst: { pos: number[]; bone: number[]; seed: number[]; vel: number[]; col: number[] } = { pos: [], bone: [], seed: [], vel: [], col: [] };
    let base = 0;
    for (const s of sites) {
      const def = riggedHero(s.type);
      if (!def) continue;
      const rng = rngFor(`hero:${s.type}`);
      const sp = new Sparks(rngFor(`hero-sparks:${s.type}`));
      const zz = new Sparks(rngFor(`hero-slumber:${s.type}`));
      const sc = s.scale ?? 1;
      const rb = new RigBuilder(k, base);
      k.bone = base;
      const burstFrom = burst.bone.length;
      k.frame([s.x, s.y, s.z], [0, 0, 0], sc, () =>
        rb.bone("root", [0, 0, 0], () => {
          const spark: Parameters<typeof def.build>[0]["spark"] = (kind, at, n, o) => sp.add(kind, k.point(at), n, { ...o, size: o.size * sc });
          def.build({ k, rng, spark, bone: rb.bone });
          def.sparks?.({ k, rng, spark });
          // Where it slumbers: smoke curling up the column of light, wisps circling
          zz.add(SPARK.smoke, k.point([0, 0.6, 0]), 16, { color: "#4c1d95", size: 1.6 * sc, speed: 0.09, rise: 7 * sc, reach: 1.4 * sc, spread: 2.4 * sc });
          zz.add(SPARK.wisp, k.point([0, 2.2, 0]), 14, { color: "#a5f3fc", size: 0.22 * sc, speed: 0.12, rise: 1.4 * sc, reach: 1.6 * sc, spread: 0.6 * sc });
          const b = def.burst;
          if (b) {
            const at = k.point(b.at);
            const c = new THREE.Color(b.color);
            const r = rngFor(`hero-burst:${s.type}`);
            for (let i = 0; i < b.count; i++) {
              const a = r() * Math.PI * 2;
              const out = (0.35 + r() * 0.65) * b.speed * sc;
              burst.pos.push(at[0] + (r() - 0.5) * b.spread * sc, at[1], at[2] + (r() - 0.5) * b.spread * sc);
              burst.bone.push(0);
              burst.seed.push(b.size * sc * (0.6 + r() * 0.8), 0.75 + r() * 0.5, 0.6 + r() * 0.7, (b.gravity ?? 6) * sc);
              burst.vel.push(Math.cos(a) * out, (0.6 + r() * 0.9) * b.speed * sc, Math.sin(a) * out);
              const cc = c.clone().multiplyScalar(0.75 + r() * 0.5);
              burst.col.push(cc.r, cc.g, cc.b);
            }
          }
        })
      );
      const player = new RigPlayer(def, rb.bones, base, rngFor(`boss:${s.id}`)());
      // Bursts ride the slot past the bones: where the boss faces (its root, the ground, never turns)
      for (let i = burstFrom; i < burst.bone.length; i++) burst.bone[i] = base + rb.bones.length;
      players.push({ site: s, player });
      awake.push(sp);
      sleep.push(zz);
      base += player.slots;
    }
    // Builders name what a part is made of; fold those into the four shared materials
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
    // Where each boss can reach: its parts at rest, grown for its swings, flights and springs (the map poses only those in view)
    const reach = players.map(() => new THREE.Box3());
    for (const g of Object.values(geos)) {
      const pos = g.attributes.position as THREE.BufferAttribute;
      const bone = g.attributes.aBone as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const b = bone.getX(i);
        const p = players.findIndex((q, j) => b >= q.player.base && (j === players.length - 1 || b < players[j + 1].player.base));
        if (p >= 0) reach[p].expandByPoint(_v.fromBufferAttribute(pos, i));
      }
    }
    const bounds = reach.map((b, i) => (b.isEmpty() ? new THREE.Sphere(new THREE.Vector3(players[i].site.x, players[i].site.y, players[i].site.z), 12) : b.getBoundingSphere(new THREE.Sphere())));
    bounds.forEach((b, i) => (b.radius = b.radius * 1.5 + 2 * (players[i].site.scale ?? 1)));
    // Four texels a bone (and a facing slot each), every bone of every boss
    const rows = Math.max(1, Math.ceil((base * 4) / BONE_TEX_W));
    const data = new Float32Array(BONE_TEX_W * rows * 4);
    for (let b = 0; b < base; b++) data.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 99, 0], b * 16);
    const tex = new THREE.DataTexture(data, BONE_TEX_W, rows, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    const bones = { value: tex as THREE.Texture | null };
    const mats = heroMaterials(time, { bones });
    const ghost = heroGhostMaterial(time, bones);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.Float32BufferAttribute(burst.pos, 3));
    bg.setAttribute("aBone", new THREE.Float32BufferAttribute(burst.bone, 1));
    bg.setAttribute("aSeed", new THREE.Float32BufferAttribute(burst.seed, 4));
    bg.setAttribute("aVel", new THREE.Float32BufferAttribute(burst.vel, 3));
    bg.setAttribute("aCol", new THREE.Float32BufferAttribute(burst.col, 3));
    const burstMat = new THREE.ShaderMaterial({
      vertexShader: BURST_VERT,
      fragmentShader: BURST_FRAG,
      uniforms: { uBones: bones, uViewH: { value: 800 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor
    });
    const burstPoints = new THREE.Points(bg, burstMat);
    burstPoints.frustumCulled = false;
    burstPoints.renderOrder = 3;
    return { time, geos, mats, ghost, tex, data, players, bounds, paused: players.map(() => 0), awake, sleep, burstPoints, sparkMat: sparkMaterial(time) };
  }, [sites]);

  // Which bosses slumber: their sparks, ghost pass and column of light change with it (rarely)
  const slumberKey = sites.map((s) => (action ? action === "slumber" : live?.[s.id]?.slumbering) ? 1 : 0).join("");
  const anySlumber = slumberKey.includes("1");
  const moving = Boolean(place);
  const fx = useMemo(() => {
    const all = new Sparks(() => 0);
    built.players.forEach((p, i) => {
      if (moving) return;
      const src = slumberKey[i] === "1" ? built.sleep[i] : built.awake[i];
      all.pos.push(...src.pos);
      all.seed.push(...src.seed);
      all.col.push(...src.col);
      all.reach.push(...src.reach);
    });
    const points = new THREE.Points(all.geometry(), built.sparkMat);
    points.frustumCulled = false;
    points.renderOrder = 3;
    const auras = built.players.flatMap((p, i) => {
      const a = slumberKey[i] === "1" ? SLUMBER_AURA : riggedHero(p.site.type)!.aura;
      return a && !moving ? [auraAt(p.site, a)] : [];
    });
    return { points, auras };
  }, [built, slumberKey, moving]);

  useEffect(
    () => () => {
      Object.values(built.geos).forEach((g) => g.dispose());
      Object.values(built.mats).forEach((m) => m.dispose());
      built.ghost.dispose();
      built.tex.dispose();
      built.sparkMat.dispose();
      built.burstPoints.geometry.dispose();
      (built.burstPoints.material as THREE.Material).dispose();
    },
    [built]
  );
  useEffect(() => () => fx.points.geometry.dispose(), [fx]);

  const liveRef = useRef(live);
  liveRef.current = live;
  const actionRef = useRef(action);
  actionRef.current = action;
  const cineRef = useRef(onCine);
  cineRef.current = onCine;
  const placeRef = useRef(place);
  placeRef.current = place;
  const moved = useMemo(() => new THREE.Sphere(), []);
  const still: BossLive = { fightYaw: null, slumbering: false };

  const bodies = useRef<THREE.Group>(null);

  useFrame(({ clock, camera }, delta) => {
    built.time.value = clock.elapsedTime;
    const viewH = size.height * gl.getPixelRatio();
    built.sparkMat.uniforms.uViewH.value = viewH;
    (built.burstPoints.material as THREE.ShaderMaterial).uniforms.uViewH.value = viewH;
    // The Codex plays one boss, always in view. On the map a boss out of view keeps its pose until it comes back, and with
    // none in view the bodies are neither drawn nor their bones uploaded
    const map = !actionRef.current;
    if (map) {
      camera.updateMatrixWorld();
      _frustum.setFromProjectionMatrix(_view.multiplyMatrices(camera.projectionMatrix, _view.copy(camera.matrixWorld).invert()));
    }
    let shown = false;
    built.players.forEach(({ site, player }, i) => {
      const known = liveRef.current?.[site.id] ?? still;
      const cry = BOSS_CRIES.get(site.id);
      const l = cry !== undefined ? { ...known, cryAt: cry } : known;
      const live = actionRef.current ? { ...l, action: actionRef.current } : l;
      // A moving site: its bounds go where it stands now (it was built at the origin)
      const at = placeRef.current ? placeRef.current(site.id) : undefined;
      if (at === null) {
        hideSlots(built.data, player.base, player.slots);
        built.paused[i] += delta;
        return;
      }
      const bounds = at ? moved.set(built.bounds[i].center, built.bounds[i].radius).translate(_v.set(at.x, at.y, at.z)) : built.bounds[i];
      if (map && !_frustum.intersectsSphere(bounds)) {
        built.paused[i] += delta;
        return;
      }
      // Back in view: it plays its last moments first, so a blend or a spring it was in the middle of settles out of view
      for (let k = Math.min(8, Math.ceil(built.paused[i] / 0.05)); k > 0; k--) player.update(0.05, live, built.data);
      built.paused[i] = 0;
      player.update(delta, live, built.data, cineRef.current);
      if (at) carrySlots(built.data, player.base, player.slots, at);
      shown = true;
    });
    if (shown) built.tex.needsUpdate = true;
    if (bodies.current) bodies.current.visible = shown;
  });

  return (
    <group>
      <group ref={bodies}>
        {HERO_BUCKETS.map(
          (b) =>
            built.geos[b] && (
              <group key={b}>
                <mesh geometry={built.geos[b]} material={built.mats[b]} frustumCulled={false} receiveShadow={b !== "glow"} />
                {anySlumber && <mesh geometry={built.geos[b]} material={built.ghost} frustumCulled={false} renderOrder={2} />}
              </group>
            )
        )}
      </group>
      {/* Moving sites leave their sparks out: no layer to draw */}
      {!moving && <primitive object={fx.points} />}
      <primitive object={built.burstPoints} />
      <HeroAura sites={fx.auras} />
    </group>
  );
}

/* ------------------------------ the Codex: one boss, its actions and the cinematic layer ------------------------------ */

// Tinted flashes with a ring racing out, speed lines bursting from the boss, a vignette closing in: one full-screen quad,
// drawn last, premultiplied, only while something shows
const CINE_VERT = `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const CINE_FRAG = `
  uniform vec2 uCenter;
  uniform float uAspect;
  uniform float uTime;
  uniform float uFlash;
  uniform vec3 uFlashCol;
  uniform float uLines;
  uniform float uVig;
  uniform vec3 uVigCol;
  varying vec2 vNdc;
  float ch(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float cn(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = ch(vec2(mod(i.x, period), i.y));
    float b = ch(vec2(mod(i.x + 1.0, period), i.y));
    float c = ch(vec2(mod(i.x, period), i.y + 1.0));
    float d = ch(vec2(mod(i.x + 1.0, period), i.y + 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  void main() {
    vec2 d = vNdc - uCenter;
    d.x *= uAspect;
    float r = length(d);
    float ang = atan(d.y, d.x) / 6.28318 + 0.5;
    float ringR = (1.0 - uFlash) * 2.0;
    float ring = exp(-pow(abs((r - ringR) * 9.0), 2.0)) * uFlash;
    vec3 flash = mix(uFlashCol, vec3(1.0), exp(-r * 1.8)) * (uFlash * (0.45 + 0.4 * exp(-r * 1.2)) + ring * 1.2);
    float flashA = clamp(uFlash * 0.5 + ring * 0.45, 0.0, 1.0);
    float lineN = cn(vec2(ang * 140.0, floor(uTime * 24.0)), 140.0);
    float lines = pow(max(lineN, 0.0), 10.0) * smoothstep(0.18, 0.95, r) * uLines * 2.2;
    vec2 sv = vNdc;
    sv.x *= mix(1.0, uAspect, 0.5);
    float vr = length(sv);
    float vig = smoothstep(0.45, 1.45, vr) * uVig;
    float vigEdge = exp(-pow(abs((vr - 0.9) * 3.0), 2.0)) * uVig;
    vec3 light = flash + mix(uFlashCol, vec3(1.0), 0.6) * lines + uVigCol * vigEdge * 0.4;
    float a = max(vig * 0.75, flashA);
    if (a < 0.002 && dot(light, vec3(1.0)) < 0.002) discard;
    gl_FragColor = vec4(light, a);
  }
`;

/** One boss in the Codex playing an action, with the cinematic layer over the panel */
export function BossShowcase({ type, action, band = 1, spread = 1.5 }: { type: string; action: BossActionId; band?: number; spread?: number }) {
  // A mercenary band (or a pack) walks in ranks of five, each copy its own seed (so none moves in step), the first rank in front
  const sites = useMemo(
    () =>
      Array.from({ length: band }, (_, i) => {
        const rank = Math.floor(i / 5);
        const inRank = Math.min(5, band - rank * 5);
        const k = spread / 1.5;
        return { id: band > 1 ? `codex-${i}` : "codex", type, x: (((i % 5) - (inRank - 1) / 2) * 1.5 + (rank % 2) * 0.35) * k, y: 0, z: -rank * 1.7 * k };
      }),
    [type, band, spread]
  );
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const fx = useMemo(() => ({ flash: 0, flashCol: new THREE.Color(), lines: 0, vig: 0, vigCol: new THREE.Color() }), []);
  const quad = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      vertexShader: CINE_VERT,
      fragmentShader: CINE_FRAG,
      uniforms: {
        uCenter: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uFlashCol: { value: new THREE.Color() },
        uLines: { value: 0 },
        uVig: { value: 0 },
        uVigCol: { value: new THREE.Color() }
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 999;
    mesh.visible = false;
    return mesh;
  }, []);
  useEffect(
    () => () => {
      quad.geometry.dispose();
      (quad.material as THREE.Material).dispose();
    },
    [quad]
  );
  // A new action starts clean
  useEffect(() => {
    fx.flash = fx.lines = fx.vig = 0;
  }, [action, fx]);

  const onCine = (c: Cine) => {
    if (c.flash && c.flash >= fx.flash) {
      fx.flash = c.flash;
      fx.flashCol.set(c.flashCol ?? "#ffffff");
    }
    if (c.lines) fx.lines = Math.max(fx.lines, c.lines);
    if (c.vig && c.vig >= fx.vig) {
      fx.vig = c.vig;
      fx.vigCol.set(c.vigCol ?? "#0f172a");
    }
  };

  const centre = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }, delta) => {
    // Transients fade on the wall clock
    const dt = Math.min(0.05, delta);
    fx.flash = Math.max(0, fx.flash - dt * 2.4);
    fx.lines = Math.max(0, fx.lines - dt * 1.8);
    fx.vig = Math.max(0, fx.vig - dt * 0.9);
    const u = (quad.material as THREE.ShaderMaterial).uniforms;
    // Radial effects centre on the boss's chest
    centre.set(0, (riggedHero(type)?.frame[2] ?? 2) * 1.0, 0).project(camera);
    u.uCenter.value.set(centre.x, centre.y);
    u.uAspect.value = size.width / Math.max(1, size.height);
    u.uTime.value = clock.elapsedTime;
    u.uFlash.value = fx.flash;
    u.uFlashCol.value.copy(fx.flashCol);
    u.uLines.value = fx.lines;
    u.uVig.value = fx.vig;
    u.uVigCol.value.copy(fx.vigCol);
    quad.visible = fx.flash > 0.002 || fx.lines > 0.002 || fx.vig > 0.002;
  });

  return (
    <>
      <BossBatch sites={sites} action={action} onCine={onCine} />
      <primitive object={quad} />
    </>
  );
}
