import * as THREE from "three";
import { Surf, TAU, thetaOf } from "./heroKit";

/* ------------------------------------------------------------------------- */
/* The shared materials of the batched heroes (legendary landmarks, the Core)  */
/* ------------------------------------------------------------------------- */

/*
 * Every batched hero is drawn with these materials, all of them heroes together: one draw per material however many
 * heroes stand on the map. Each vertex carries its colour, its surface (`aSurf`: u, v, kind) and its motion (`aMove`,
 * `aPivot`, `aAxis`, from `Kit` made with `motion`), so moving parts merge with the static ones and move on the GPU.
 */

/** Surface kinds the materials draw (`aSurf.z`) */
export const SURF = {
  plain: 0,
  /** Dressed stone: blocks along u, courses up the height; flagstones on faces turned up */
  ashlar: 1,
  /** Slates or tiles: rows from the eave (v), staggered along u */
  tiles: 2,
  /** Bark: furrows running up v, wavering round u */
  bark: 3,
  /** Rock or earth in strata: bands up the height */
  strata: 4,
  /** Wood grain along v (planks, hafts, drums) */
  grain: 5,
  /** Glow: leaded stained glass (u, v across the pane) */
  glass: 6,
  /** Glow: a band of carved runes (u along it, v across) */
  runes: 7,
  /** Cloth with a tattered free edge (v from 1 at the pole to 0 at the tail) */
  tatters: 8,
  /** Rock: strata and molten veins (u: how much) */
  veins: 9,
  /** Metal: dull iron (the metal bucket's default is polished gold) */
  iron: 10,
  /** Metal bucket: glossy obsidian, crystal, water (not metal) */
  glaze: 11,
  /** Leaves: masses of leaves, flecked */
  leaf: 12,
  /** Rock in strata laced with gold veins that catch the light (u: how much) */
  ore: 13,
  /** Metal bucket: a creature's wet skin, mottled and blotched (not metal) */
  skin: 14,
  /** Metal bucket: overlapping scales round a body (u round it, v along it), with a sheen */
  scales: 15,
  /** Metal bucket: glossy chitin in ridged bands along v, pitted */
  chitin: 16,
  /** Sand in wind ripples */
  sand: 17,
  /** Metal bucket: water, glinting as ripples run over it */
  water: 18,
  /** Metal bucket: stripes of gold and lapis along v (a pharaoh's headdress, a plaited beard) */
  nemes: 19,
  /** Fur: strands combed down the body, clumped into locks */
  fur: 20,
  /** Glow: an insect wing (u across it, v from 1 at the root to 0 at the tip): veins, cells and a slow iridescence */
  wing: 21
} as const;

/** A dressed block's length (courses are 0.16 high, worked out from the height in the shader) */
const BLOCK = 0.42;
const TILE_W = 0.2;
const TILE_ROW = 0.13;

/** Dressed stone round a round part (blocks along its circumference) */
export const ashlarRound = (r: number): Surf => {
  const count = Math.max(4, Math.round((TAU * r) / BLOCK));
  return { fn: (p) => [(thetaOf(p.x, p.z) / TAU) * count, 0, SURF.ashlar], period: count };
};
/** Dressed stone on a box or a flat face: blocks along whichever horizontal axis the face runs */
export const ASHLAR: Surf = { fn: (p, n) => [(Math.abs(n.x) > Math.abs(n.z) ? p.z : p.x) / BLOCK, 0, SURF.ashlar] };
/** Slates or tiles round a cone, rows climbing from the eave */
export const tilesRound = (r: number, h: number): Surf => {
  const count = Math.max(6, Math.round((TAU * r) / TILE_W));
  const slant = Math.hypot(h, r) / h;
  return { fn: (p) => [(thetaOf(p.x, p.z) / TAU) * count, ((p.y + h / 2) * slant) / TILE_ROW, SURF.tiles], period: count };
};
/** Slates on one slope of a gable roof (a slab `sl` long down the slope, its eave at +x when `side` > 0) */
export const tilesSlab = (sl: number, side: number): Surf => ({ fn: (p) => [p.z / TILE_W, (side > 0 ? sl / 2 - p.x : p.x + sl / 2) / TILE_ROW, SURF.tiles] });
/** Bark round a trunk or bough (furrows up its length) */
export const bark = (r: number): Surf => {
  const count = Math.max(5, Math.round((TAU * r) / 0.22));
  return { fn: (p) => [(thetaOf(p.x, p.z) / TAU) * count, p.y / 0.6, SURF.bark], period: count };
};
/** Wood grain round a round part (a haft, a drum, a pole) */
export const grainRound = (r: number): Surf => {
  const count = Math.max(4, Math.round((TAU * r) / 0.12));
  return { fn: (p) => [(thetaOf(p.x, p.z) / TAU) * count, p.y / 0.5, SURF.grain], period: count };
};
export const STRATA: Surf = { fn: () => [0, 0, SURF.strata] };
/** Rock with molten veins (`amount` 0–1) */
export const veins = (amount: number): Surf => ({ fn: () => [amount, 0, SURF.veins] });
/** Rock with gold veins (`amount` 0–1) */
export const ore = (amount: number): Surf => ({ fn: () => [amount, 0, SURF.ore] });
/** Stained glass across a pane `w` × `h` (its bottom centre at the origin) */
export const pane = (w: number, h: number): Surf => ({ fn: (p) => [p.x / w + 0.5, p.y / h, SURF.glass] });
/** A band of runes `len` long (along x, centred), `cells` glyphs, `h` high */
export const runeBand = (len: number, h: number, cells: number): Surf => ({ fn: (p) => [(p.x / len + 0.5) * cells, p.y / h + 0.5, SURF.runes] });
/** Runes up a face (along y), `cells` glyphs over its height `h`, `w` across */
export const runeColumn = (w: number, h: number, cells: number): Surf => ({ fn: (p) => [(p.y / h + 0.5) * cells, p.x / w + 0.5, SURF.runes] });
/** Scales round a round part `r` wide (rows along its length, `size` across) */
export const scalesRound = (r: number, size = 0.16): Surf => {
  const count = Math.max(5, Math.round((TAU * r) / size));
  return { fn: (p) => [(thetaOf(p.x, p.z) / TAU) * count, p.y / (size * 0.8), SURF.scales], period: count };
};
/** Scales round a torus `R` across with a tube `r` (an arching coil): rows along the arch */
export const scalesTorus = (R: number, r: number, size = 0.16): Surf => {
  const count = Math.max(5, Math.round((TAU * r) / size));
  return {
    fn: (p) => {
      const ring = Math.hypot(p.x, p.y);
      const tube = Math.atan2(p.z, ring - R);
      return [((tube < 0 ? tube + TAU : tube) / TAU) * count, (Math.atan2(p.y, p.x) * R) / (size * 0.8), SURF.scales];
    },
    period: count
  };
};
/** Gold and lapis stripes across a part, one pair every `band` up its height */
export const nemes = (band: number): Surf => ({ fn: (p) => [0, p.y / band, SURF.nemes] });
/** Chitin round a round part: ridged bands every `band` along its length */
export const chitinRound = (band: number): Surf => ({ fn: (p) => [thetaOf(p.x, p.z), p.y / band, SURF.chitin] });
/** Chitin on a plate (bands along z) */
export const chitinPlate = (band: number): Surf => ({ fn: (p) => [p.x, p.z / band, SURF.chitin] });
/** Cloth across a plane `w` × `h` (centred), its free bottom edge ragged when `tattered` */
export const cloth = (w: number, h: number, tattered = false): Surf => ({ fn: (p) => [p.x / w + 0.5, p.y / h + 0.5, tattered ? SURF.tatters : SURF.plain] });

// GPU motion (see MOVE in heroKit.ts): kind, speed, amp, phase; the pivot; the axis and how far the whole model floats
const MOVE_PARS = `
  attribute vec4 aMove;
  attribute vec3 aPivot;
  attribute vec4 aAxis;
  uniform float uTime;
  varying float vPulse;
  vec3 heroTurn(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  float heroAngle() {
    float t = uTime * aMove.y + aMove.w;
    if (aMove.x > 0.5 && aMove.x < 1.5) return t;
    if (aMove.x > 6.5 && aMove.x < 7.5) return aMove.z * sin(t);
    return 0.0;
  }
`;
const MOVE_NORMAL = `#include <beginnormal_vertex>
  {
    float heroA = heroAngle();
    if (heroA != 0.0) objectNormal = heroTurn(objectNormal, aAxis.xyz, heroA);
  }`;
const MOVE_VERTEX = `#include <begin_vertex>
  {
    float kind = aMove.x;
    float t = uTime * aMove.y + aMove.w;
    vec3 d = transformed - aPivot;
    vPulse = 1.0;
    if (kind > 0.5 && kind < 1.5) {
      transformed = aPivot + heroTurn(d, aAxis.xyz, t) + vec3(0.0, aMove.z * sin(uTime * 1.1 + aMove.w), 0.0);
    } else if (kind > 1.5 && kind < 2.5) {
      float w = abs(aMove.z) * max(aMove.z < 0.0 ? -d.y : d.y, 0.0);
      transformed += vec3(sin(t + aPivot.x * 0.37) + 0.35 * sin(t * 2.7 + aPivot.z), 0.0, cos(t * 0.83 + aPivot.z * 0.41)) * w;
    } else if (kind > 2.5 && kind < 3.5) {
      float w = length(d);
      transformed += aAxis.xyz * aMove.z * w * (sin(t - w * 4.0) + 0.3 * sin(t * 2.3 - w * 9.0));
    } else if (kind > 3.5 && kind < 4.5) {
      transformed += aAxis.xyz * aMove.z * sin(t);
    } else if (kind > 4.5 && kind < 5.5) {
      float b = max(sin(t), 0.0);
      transformed = aPivot + d * (1.0 + aMove.z * b * b * b * b);
    } else if (kind > 5.5 && kind < 6.5) {
      vPulse = 1.0 + aMove.z * sin(t);
    } else if (kind > 6.5 && kind < 7.5) {
      transformed = aPivot + heroTurn(d, aAxis.xyz, aMove.z * sin(t));
    }
    transformed.y += aAxis.w * sin(uTime * 1.3);
  }`;

/**
 * Bones (a rigged hero, `heroRig.ts`): each vertex rides its bone, whose matrix the CPU writes every frame into `uBones`
 * (four texels a bone: three rows of the matrix, then ghost and glow), after the kit's own motion. A ghost bone's
 * vertices are drawn only by the ghost material, the others only by the opaque ones.
 */
export const BONE_TEX_W = 1024;
const RIG_PARS = `
  uniform highp sampler2D uBones;
  attribute float aBone;
  float vGhost;
  vec4 heroBoneTexel(int b, int k) {
    int i = b * 4 + k;
    return texelFetch(uBones, ivec2(i % ${BONE_TEX_W}, i / ${BONE_TEX_W}), 0);
  }
`;
const RIG_NORMAL = `
  {
    int hb = int(aBone + 0.5);
    objectNormal = vec3(dot(heroBoneTexel(hb, 0).xyz, objectNormal), dot(heroBoneTexel(hb, 1).xyz, objectNormal), dot(heroBoneTexel(hb, 2).xyz, objectNormal));
  }`;
const RIG_VERTEX = `
  {
    int hb = int(aBone + 0.5);
    vec4 hp = vec4(transformed, 1.0);
    transformed = vec3(dot(heroBoneTexel(hb, 0), hp), dot(heroBoneTexel(hb, 1), hp), dot(heroBoneTexel(hb, 2), hp));
    vec4 hx = heroBoneTexel(hb, 3);
    vGhost = hx.x;
    vPulse *= hx.y;
  }`;

/** What a rigged hero's materials share: the bone texture, and whether this one draws the ghosts */
export interface HeroRigUniforms {
  bones: { value: THREE.Texture | null };
  ghost?: boolean;
}

/** Adds the GPU motion (and, rigged, the bones) to a material's vertex shader */
function withMotion(sh: THREE.WebGLProgramParametersWithUniforms, time: { value: number }, rig?: HeroRigUniforms) {
  sh.uniforms.uTime = time;
  if (rig) sh.uniforms.uBones = rig.bones;
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", `#include <common>\n${MOVE_PARS}\n${rig ? RIG_PARS : ""}\nattribute vec3 aSurf;\nvarying vec3 vSurf;\nvarying vec3 vHeroPos;\nvarying vec3 vHeroN;`)
    .replace("#include <beginnormal_vertex>", MOVE_NORMAL + (rig ? RIG_NORMAL : ""))
    .replace("#include <begin_vertex>", `${MOVE_VERTEX}${rig ? RIG_VERTEX : ""}\nvSurf = aSurf;\nvHeroPos = position;\nvHeroN = normal;`);
  // A ghost's vertices go to the ghost material only, the others never to it
  if (rig)
    sh.vertexShader = sh.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>\n      if ((vGhost > 0.5) != ${rig.ghost ? "true" : "false"}) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);`
    );
}

const FRAG_PARS = `
  uniform float uTime;
  varying vec3 vSurf;
  varying vec3 vHeroPos;
  varying vec3 vHeroN;
  varying float vPulse;
  float heroHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float heroNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(heroHash(i), heroHash(i + vec2(1.0, 0.0)), f.x), mix(heroHash(i + vec2(0.0, 1.0)), heroHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  bool heroKind(float k) { return abs(vSurf.z - k) < 0.5; }
`;

/**
 * Patches a material: GPU motion plus `surface` (GLSL run after the colour is read, may change `diffuseColor`), and on
 * a lit material `pbr` (after roughness and metalness are read) and `emissive` (after the emissive is)
 */
function patched<M extends THREE.Material>(m: M, time: { value: number }, name: string, surface: string, o: { emissive?: string; pbr?: string; rig?: HeroRigUniforms } = {}): M {
  const { emissive = "", pbr = "", rig } = o;
  m.onBeforeCompile = (sh) => {
    withMotion(sh, time, rig);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${FRAG_PARS}`).replace("#include <color_fragment>", `#include <color_fragment>\n{\n${surface}\n}`);
    if (pbr) sh.fragmentShader = sh.fragmentShader.replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>\n{\n${pbr}\n}`);
    if (emissive) sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n{\n${emissive}\n}`);
  };
  // Every hero material patches its shader differently from the same function: keep their programs apart
  m.customProgramCacheKey = () => `hero-${name}-${surface.length}-${emissive.length}-${pbr.length}${rig ? (rig.ghost ? "-ghost" : "-rig") : ""}`;
  return m;
}

// Dressed stone, slates, bark, strata and grain, faded out where a block gets too small on screen to read
const MATTE_SURFACE = `
  float fade = 1.0;
  if (heroKind(1.0)) {
    vec3 on = normalize(vHeroN);
    float up = step(0.7, abs(on.y));
    vec2 side = vec2(vSurf.x, vHeroPos.y / 0.16);
    vec2 top = vHeroPos.xz / vec2(0.42, 0.3);
    vec2 p = mix(side, top, up);
    float row = floor(p.y);
    p.x += mod(row, 2.0) * 0.5;
    vec2 f = fract(p);
    vec2 cell = vec2(floor(p.x), row);
    fade = 1.0 - smoothstep(0.22, 0.55, length(fwidth(p)));
    float ex = min(f.x, 1.0 - f.x) / mix(0.05, 0.035, up);
    float ey = min(f.y, 1.0 - f.y) / mix(0.1, 0.05, up);
    float joint = 1.0 - smoothstep(0.6, 1.0, min(ex, ey));
    float tone = 0.9 + heroHash(cell + floor(vHeroPos.y * 0.3) * 7.0) * 0.16;
    diffuseColor.rgb *= mix(1.0, tone * (1.0 - joint * 0.38), fade);
  } else if (heroKind(2.0)) {
    vec2 tp = vSurf.xy;
    float row = floor(tp.y);
    float x = fract(tp.x + mod(row, 2.0) * 0.5);
    float fy = fract(tp.y);
    fade = 1.0 - smoothstep(0.25, 0.6, length(fwidth(tp)));
    float lip = smoothstep(0.0, 0.12, fy);
    float gap = smoothstep(0.0, 0.08, min(x, 1.0 - x));
    float tone = 0.82 + heroHash(vec2(floor(tp.x + mod(row, 2.0) * 0.5), row)) * 0.3;
    diffuseColor.rgb *= mix(1.0, (0.55 + 0.45 * lip) * mix(0.6, 1.0, gap) * tone * (0.85 + 0.25 * fy), fade);
  } else if (heroKind(3.0)) {
    vec2 bp = vec2(vSurf.x + heroNoise(vec2(vSurf.x * 0.7, vSurf.y * 0.9)) * 0.9, vSurf.y);
    float ridge = abs(fract(bp.x) - 0.5) * 2.0;
    float knot = heroNoise(bp * vec2(2.0, 0.6));
    fade = 1.0 - smoothstep(0.3, 0.7, length(fwidth(bp)));
    diffuseColor.rgb *= mix(1.0, mix(0.42, 1.08, smoothstep(0.15, 0.75, ridge)) * (0.85 + knot * 0.3), fade);
  } else if (heroKind(4.0)) {
    float y = vHeroPos.y * 2.6 + heroNoise(vHeroPos.xz * 1.3) * 1.2;
    float band = heroNoise(vec2(floor(y) * 3.1, 0.5));
    float line = smoothstep(0.0, 0.12, min(fract(y), 1.0 - fract(y)));
    diffuseColor.rgb *= (0.78 + band * 0.32) * mix(0.72, 1.0, line);
  } else if (heroKind(5.0)) {
    float g = heroNoise(vec2(vSurf.x * 6.0, vSurf.y * 0.8));
    fade = 1.0 - smoothstep(0.3, 0.7, length(fwidth(vSurf.xy * 6.0)));
    diffuseColor.rgb *= mix(1.0, 0.82 + g * 0.3, fade);
  } else if (heroKind(9.0)) {
    // Rock in strata (its veins glow in the emissive)
    float y = vHeroPos.y * 3.0 + heroNoise(vHeroPos.xz * 1.6) * 1.5;
    diffuseColor.rgb *= 0.82 + heroNoise(vec2(floor(y) * 2.7, 0.3)) * 0.3;
  } else if (heroKind(13.0)) {
    // Rock in strata, gold veins running through it
    float y = vHeroPos.y * 3.0 + heroNoise(vHeroPos.xz * 1.6) * 1.5;
    diffuseColor.rgb *= 0.82 + heroNoise(vec2(floor(y) * 2.7, 0.3)) * 0.3;
    vec2 rp = vHeroPos.xz * 1.5 + vec2(vHeroPos.y * 1.1, -vHeroPos.y * 0.9);
    float n1 = heroNoise(rp) * 0.65 + heroNoise(rp * 2.1) * 0.35;
    float vein = smoothstep(0.92, 0.98, 1.0 - abs(n1 * 2.0 - 1.0)) * vSurf.x;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.6, 0.12), vein);
  } else if (heroKind(17.0)) {
    // Sand: ripples the wind has drawn across it, grains flecked
    vec2 sp = vHeroPos.xz * 2.2;
    float rip = sin(sp.x * 3.0 + sp.y * 1.3 + heroNoise(sp * 0.7) * 3.5);
    fade = 1.0 - smoothstep(0.4, 1.2, length(fwidth(sp * 3.0)));
    float grain = heroNoise(vHeroPos.xz * 31.0);
    diffuseColor.rgb *= mix(1.0, (0.9 + 0.12 * rip) * (0.93 + grain * 0.12), fade);
  } else if (heroKind(20.0)) {
    // Fur: strands combed down the flanks (along the body on its back), wavering, gathered into locks
    vec3 fn = normalize(vHeroN);
    vec3 fp = vHeroPos * 11.0;
    vec2 q = abs(fn.y) > 0.75 ? vec2(fp.x, fp.z * 0.16) : vec2(abs(fn.x) > abs(fn.z) ? fp.z : fp.x, fp.y * 0.16);
    q.x += heroNoise(q * vec2(0.35, 1.3)) * 1.6;
    fade = 1.0 - smoothstep(0.4, 1.0, length(fwidth(q)));
    float strand = heroNoise(vec2(q.x * 2.6, q.y * 2.0));
    float lock = heroNoise(q * vec2(0.45, 0.8) + 3.1);
    diffuseColor.rgb *= mix(0.96, (0.7 + strand * 0.45) * (0.82 + lock * 0.3), fade);
  } else if (heroKind(12.0)) {
    // Leaves: each clump a mass of leaves, flecked
    vec2 lp = vHeroPos.xz * 7.0 + vHeroPos.y * 5.0;
    float fleck = heroNoise(lp) * 0.6 + heroNoise(lp * 2.3) * 0.4;
    fade = 1.0 - smoothstep(0.4, 0.9, length(fwidth(lp)));
    diffuseColor.rgb *= mix(1.0, 0.7 + fleck * 0.55, fade);
  }
`;

// Unlit glow (the vertex colour, pulsing): stained glass lit from inside (leaded diamond quarries in blue, gold, white and crimson) or runes carved in a lit band
const GLOW_EMISSIVE = `
  vec3 glowCol = vColor.rgb;
  if (heroKind(6.0)) {
    vec2 g = vec2(vSurf.x * 3.0, vSurf.y * 6.0);
    vec2 q = vec2(g.x + g.y, g.x - g.y) * 0.5;
    vec2 f = fract(q);
    float lead = smoothstep(0.0, 0.1, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    lead = mix(1.0, lead, 1.0 - smoothstep(0.25, 0.6, length(fwidth(q))));
    float h = heroHash(floor(q));
    vec3 tint = h < 0.4 ? vec3(0.3, 0.5, 1.0) : h < 0.65 ? vec3(1.0, 0.75, 0.25) : h < 0.85 ? vec3(0.85, 0.9, 1.0) : vec3(1.0, 0.25, 0.2);
    glowCol = tint * lead * (0.85 + 0.15 * sin(uTime * 0.8 + vHeroPos.y * 2.0 + h * 6.0));
  } else if (heroKind(7.0)) {
    float cell = floor(vSurf.x);
    float u = fract(vSurf.x);
    float v = vSurf.y;
    float hv = heroHash(vec2(cell, 7.0));
    float bar = step(abs(u - 0.5), 0.09);
    float cross = step(abs(v - 0.5), 0.08);
    float diag = step(abs((u - 0.5) - (v - 0.5) * 0.8), 0.09);
    float glyph = (hv < 0.33 ? max(bar, cross) : hv < 0.66 ? max(bar, diag) : max(cross, diag)) * step(0.15, u) * step(u, 0.85) * step(0.12, v) * step(v, 0.88);
    float fw = length(fwidth(vSurf.xy));
    glyph = mix(glyph, 0.35, smoothstep(0.3, 0.8, fw));
    glowCol *= 0.18 + glyph * (0.8 + 0.2 * sin(uTime * 2.2 + cell * 1.7));
  } else if (heroKind(21.0)) {
    // An insect wing: veins fanning from the root, cross-veins between them, each cell of light shifting in hue
    vec2 wq = vec2(vSurf.x * 6.0, (1.0 - vSurf.y) * 4.0 + sin(vSurf.x * 8.0) * 0.35);
    vec2 wf = fract(wq);
    vec2 wd = min(wf, 1.0 - wf);
    float fw = length(fwidth(wq));
    float vein = 1.0 - smoothstep(0.0, 0.07 + fw * 0.5, min(wd.x, wd.y * 1.4));
    vein = mix(vein, 0.3, smoothstep(0.25, 0.7, fw));
    float iri = 0.5 + 0.5 * sin(vSurf.x * 5.0 + vSurf.y * 3.5 + uTime * 0.6 + heroHash(floor(wq)) * 3.0);
    vec3 cellCol = mix(glowCol, glowCol.gbr * 1.15 + 0.05, iri * 0.5);
    glowCol = cellCol * (0.3 + 0.35 * (1.0 - vSurf.y)) + glowCol * vein * 1.25;
  }
  diffuseColor.rgb = glowCol * vPulse;
`;

// Cloth: a weave, and a ragged free edge on tattered banners
const CLOTH_SURFACE = `
  if (heroKind(8.0)) {
    float rag = heroNoise(vec2(vSurf.x * 9.0, 1.3)) * 0.22 + heroNoise(vec2(vSurf.x * 23.0, 4.1)) * 0.1;
    if (vSurf.y < rag) discard;
    float hole = heroNoise(vSurf.xy * vec2(7.0, 9.0));
    if (hole > 0.86 && vSurf.y < 0.7) discard;
  }
  float weave = 0.93 + 0.07 * sin(vSurf.x * 140.0) * sin(vSurf.y * 140.0);
  diffuseColor.rgb *= mix(weave, 1.0, smoothstep(0.3, 0.9, length(fwidth(vSurf.xy * 140.0))));
`;

// Molten veins that throb in rock (and gold veins that glint), where `aSurf.x` asks for them
const MATTE_EMISSIVE = `
  if (heroKind(9.0)) {
    vec2 rp = vHeroPos.xz * 1.2 + vec2(vHeroPos.y * 1.3, -vHeroPos.y * 0.7);
    float n1 = heroNoise(rp) * 0.65 + heroNoise(rp * 2.1) * 0.35;
    float ridge = 1.0 - abs(n1 * 2.0 - 1.0);
    float vein = smoothstep(0.955, 0.99, ridge) * vSurf.x;
    float throb = 0.7 + 0.3 * sin(uTime * 1.8 + vHeroPos.y * 2.5 + n1 * 6.0);
    totalEmissiveRadiance += mix(vec3(0.9, 0.12, 0.03), vec3(1.0, 0.6, 0.2), vein) * vein * 2.2 * throb;
  } else if (heroKind(13.0)) {
    // Gold veins glint as the light moves over them (matte rock has no shine of its own)
    vec2 rp = vHeroPos.xz * 1.5 + vec2(vHeroPos.y * 1.1, -vHeroPos.y * 0.9);
    float n1 = heroNoise(rp) * 0.65 + heroNoise(rp * 2.1) * 0.35;
    float vein = smoothstep(0.92, 0.98, 1.0 - abs(n1 * 2.0 - 1.0)) * vSurf.x;
    totalEmissiveRadiance += vec3(0.9, 0.52, 0.08) * vein * (0.25 + 0.35 * max(sin(uTime * 1.7 + n1 * 23.0), 0.0));
  }
`;

// The metal bucket's creatures and water: wet skin mottled with blotches and spots, scales overlapping in rows, chitin in
// ridged bands, water with ripples running over it
const METAL_SURFACE = `
  if (heroKind(14.0)) {
    vec2 sp = vHeroPos.xz * 2.4 + vHeroPos.y * vec2(1.7, -1.3);
    float blot = heroNoise(sp) * 0.6 + heroNoise(sp * 2.3) * 0.4;
    float spot = smoothstep(0.78, 0.86, heroNoise(sp * 4.1 + 7.0));
    // Countershaded like a sea creature: darker on its back, paler underneath
    float under = 0.5 - 0.5 * normalize(vHeroN).y;
    diffuseColor.rgb *= (0.78 + blot * 0.38) * (1.0 - spot * 0.4) * (0.82 + under * 0.4);
  } else if (heroKind(15.0)) {
    vec2 q = vSurf.xy;
    float row = floor(q.y);
    float x = fract(q.x + mod(row, 2.0) * 0.5) - 0.5;
    float y = fract(q.y);
    float fade = 1.0 - smoothstep(0.3, 0.7, length(fwidth(q)));
    // Each scale a rounded tip over the row below: dark at its rim, lit at its crown
    float edge = smoothstep(0.0, 0.25, 1.0 - length(vec2(x * 1.6, (1.0 - y) * 1.1)));
    float tone = 0.85 + heroHash(vec2(floor(q.x + mod(row, 2.0) * 0.5), row)) * 0.25;
    diffuseColor.rgb *= mix(1.0, (0.5 + 0.5 * edge) * tone * (0.8 + 0.3 * y), fade);
  } else if (heroKind(16.0)) {
    float b = fract(vSurf.y);
    float fade = 1.0 - smoothstep(0.3, 0.8, fwidth(vSurf.y) * 2.0);
    float ridge = smoothstep(0.0, 0.1, b) * (0.75 + 0.25 * smoothstep(1.0, 0.6, b));
    float pit = heroNoise(vHeroPos.xz * 18.0 + vHeroPos.y * 11.0);
    diffuseColor.rgb *= mix(1.0, ridge * (0.9 + pit * 0.2), fade);
  } else if (heroKind(19.0)) {
    // Lapis between the gold stripes
    float st = step(0.5, fract(vSurf.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.16, 0.5), st);
  } else if (heroKind(18.0)) {
    vec2 wp = vHeroPos.xz * 1.6;
    float w = heroNoise(wp + vec2(uTime * 0.35, -uTime * 0.2)) * 0.6 + heroNoise(wp * 2.7 - vec2(uTime * 0.5, uTime * 0.3)) * 0.4;
    diffuseColor.rgb *= 0.8 + w * 0.45;
    diffuseColor.rgb += vec3(0.5, 0.75, 0.8) * smoothstep(0.78, 0.92, w) * 0.35;
  }
`;

// Metal: polished gold by default, dull iron or a glossy glaze (obsidian, crystal, water) by kind; only gold glints.
// Skin and water are wet (not metal), scales have a sheen, chitin is lacquer-glossy
const METAL_PBR = `
  if (heroKind(10.0)) {
    roughnessFactor = 0.55;
    metalnessFactor = 0.75;
  } else if (heroKind(11.0) || heroKind(18.0)) {
    roughnessFactor = 0.12;
    metalnessFactor = 0.1;
  } else if (heroKind(14.0)) {
    roughnessFactor = 0.4;
    metalnessFactor = 0.0;
  } else if (heroKind(15.0)) {
    roughnessFactor = 0.34;
    metalnessFactor = 0.25;
  } else if (heroKind(16.0)) {
    roughnessFactor = 0.24;
    metalnessFactor = 0.2;
  } else if (heroKind(19.0)) {
    float st = step(0.5, fract(vSurf.y));
    roughnessFactor = mix(0.26, 0.2, st);
    metalnessFactor = mix(1.0, 0.1, st);
  }
`;
const METAL_EMISSIVE = `
  if (vSurf.z > 9.5) totalEmissiveRadiance = vec3(0.0);
`;

/**
 * The materials of the batched heroes, sharing one clock: four draws on the map for every hero together. Stone, rock,
 * wood, bone and leaves share the matte one, gold, iron and the glossy parts the metal one (by surface kind); glows are
 * unlit (no lighting work for parts that only shine); cloth is two-sided.
 */
export function heroMaterials(time: { value: number }, rig?: HeroRigUniforms) {
  return {
    matte: patched(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }), time, "matte", MATTE_SURFACE, { emissive: MATTE_EMISSIVE, rig }),
    metal: patched(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 1, emissive: "#3a2203", emissiveIntensity: 0.4 }), time, "metal", METAL_SURFACE, { pbr: METAL_PBR, emissive: METAL_EMISSIVE, rig }),
    glow: patched(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), time, "glow", GLOW_EMISSIVE, { rig }),
    cloth: patched(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }), time, "cloth", CLOTH_SURFACE, { rig })
  };
}

// The phantom of a slumbering boss: translucent, a cyan rim where it turns away from the eye, a violet glow breathing
const GHOST_EMISSIVE = `
  float ghostRim = 1.0 - abs(dot(normalize(vViewPosition), normal));
  float breath = sin(uTime * 1.6);
  totalEmissiveRadiance = vec3(0.43, 0.16, 0.85) * (0.35 + breath * 0.12) + vec3(0.35, 0.9, 1.0) * pow(max(ghostRim, 0.0), 2.6) * 2.4;
  diffuseColor.a *= 1.0 + breath * 0.16;
`;

/** The ghost of a rigged hero (one material for every bucket): only ghost bones' vertices are drawn with it */
export function heroGhostMaterial(time: { value: number }, bones: HeroRigUniforms["bones"]): THREE.MeshStandardMaterial {
  return patched(new THREE.MeshStandardMaterial({ color: "#155e75", roughness: 0.35, transparent: true, opacity: 0.42, depthWrite: false }), time, "ghost", "", {
    emissive: GHOST_EMISSIVE,
    rig: { bones, ghost: true }
  });
}
export type HeroMaterials = ReturnType<typeof heroMaterials>;
export type HeroBucket = keyof HeroMaterials;
export const HERO_BUCKETS = ["matte", "metal", "glow", "cloth"] as const satisfies readonly HeroBucket[];
/** Buckets whose static parts cast shadows */
export const SHADOW_BUCKETS = new Set<HeroBucket>(["matte", "metal"]);
/**
 * The buckets builders name, folded into the four materials: rock and leaves are matte (rock keeps its own surface,
 * leaves take theirs), iron and gloss are metal of their own kind
 */
export const BUCKET_OF: Record<string, { bucket: HeroBucket; kind?: number }> = {
  matte: { bucket: "matte" },
  rock: { bucket: "matte" },
  leaf: { bucket: "matte", kind: SURF.leaf },
  gold: { bucket: "metal" },
  iron: { bucket: "metal", kind: SURF.iron },
  gloss: { bucket: "metal", kind: SURF.glaze },
  skin: { bucket: "metal", kind: SURF.skin },
  scales: { bucket: "metal", kind: SURF.scales },
  chitin: { bucket: "metal", kind: SURF.chitin },
  water: { bucket: "metal", kind: SURF.water },
  sand: { bucket: "matte", kind: SURF.sand },
  fur: { bucket: "matte", kind: SURF.fur },
  wing: { bucket: "glow", kind: SURF.wing },
  glow: { bucket: "glow" },
  cloth: { bucket: "cloth" }
};

/** Shadows from static parts only: a moving part (or a floating model) would leave a frozen shadow behind */
export function heroDepthMaterial(time: { value: number }): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    withMotion(sh, time);
    sh.vertexShader = sh.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      if ((aMove.x > 0.5 && (aMove.x < 5.5 || aMove.x > 6.5)) || aAxis.w != 0.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);`
    );
  };
  m.customProgramCacheKey = () => "hero-depth";
  return m;
}

/* ------------------------------ sparks: flames, smoke, embers, wisps ------------------------------ */

/** What a spark is (`aSeed.w`) */
export const SPARK = { smoke: 0, flame: 1, ember: 2, wisp: 3, mote: 4 } as const;

// Smoke drifts up and swells (drawn over, premultiplied); flames lick up; embers climb high; wisps circle their spot; motes hover
const SPARK_VERT = `
  attribute vec4 aSeed;
  attribute vec3 aCol;
  attribute vec2 aReach;
  uniform float uTime;
  uniform float uViewH;
  varying float vAlpha;
  varying float vKind;
  varying vec3 vCol;
  void main() {
    float life = fract(uTime * aSeed.y + aSeed.x);
    vec3 p = position;
    float size = aSeed.z;
    float kind = aSeed.w;
    vCol = aCol;
    if (kind < 0.5) {
      float a = aSeed.x * 40.0;
      p += vec3(sin(a) * life * aReach.x, life * aReach.y, cos(a) * life * aReach.x);
      vAlpha = sin(life * 3.14159) * 0.42;
      size *= 0.5 + life * 1.3;
      vCol *= 1.0 - life * 0.35;
    } else if (kind < 1.5) {
      p += vec3(sin(aSeed.x * 30.0 + uTime * 3.0) * 0.03, life * aReach.y, cos(aSeed.x * 17.0 + uTime * 2.3) * 0.03);
      vAlpha = (1.0 - life) * 0.95;
      size *= 1.0 - life * 0.55;
      vCol = mix(aCol, vec3(1.0, 0.22, 0.04), life);
    } else if (kind < 2.5) {
      float a = aSeed.x * 23.0 + life * 3.0;
      p += vec3(sin(a) * aReach.x * life, life * aReach.y, cos(a) * aReach.x * life);
      vAlpha = smoothstep(0.0, 0.1, life) * (1.0 - life) * (0.6 + 0.4 * sin(uTime * 11.0 + aSeed.x * 50.0));
    } else if (kind < 3.5) {
      float a = aSeed.x * 6.2831 + uTime * aSeed.y * 6.0;
      p += vec3(cos(a) * aReach.x, sin(uTime * 0.9 + aSeed.x * 9.0) * aReach.y, sin(a) * aReach.x);
      vAlpha = 0.7 + 0.3 * sin(uTime * 3.0 + aSeed.x * 30.0);
    } else {
      p += vec3(sin(uTime * 0.5 + aSeed.x * 20.0) * aReach.x, sin(uTime * 0.7 + aSeed.x * 13.0) * aReach.y, cos(uTime * 0.6 + aSeed.x * 17.0) * aReach.x);
      vAlpha = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed.x * 40.0);
    }
    vKind = kind;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(size * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.01), 1.0, 64.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const SPARK_FRAG = `
  varying float vAlpha;
  varying float vKind;
  varying vec3 vCol;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = exp(-d * d * 3.0) * vAlpha;
    gl_FragColor = vKind < 0.5 ? vec4(vCol * a, a) : vec4(vCol * a * 1.8, 0.0);
  }
`;

export function sparkMaterial(time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    uniforms: { uTime: time, uViewH: { value: 800 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor
  });
}

/** Collects sparks while a hero is built, then makes their one `Points` geometry */
export class Sparks {
  pos: number[] = [];
  seed: number[] = [];
  col: number[] = [];
  reach: number[] = [];
  private c = new THREE.Color();
  constructor(private rng: () => number) {}

  /** `n` sparks of a kind at `at`, spread `spread` round it; `rise` how far they climb, `reach` how far they drift */
  add(kind: (typeof SPARK)[keyof typeof SPARK], at: [number, number, number], n: number, o: { color: string; size: number; speed: number; rise?: number; reach?: number; spread?: number }) {
    this.c.set(o.color);
    for (let i = 0; i < n; i++) {
      const s = o.spread ?? 0;
      this.pos.push(at[0] + (this.rng() - 0.5) * s, at[1], at[2] + (this.rng() - 0.5) * s);
      this.seed.push(this.rng(), o.speed * (0.75 + this.rng() * 0.5), o.size * (0.8 + this.rng() * 0.4), kind);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.reach.push(o.reach ?? 0.3, o.rise ?? 1);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(this.seed, 4));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aReach", new THREE.Float32BufferAttribute(this.reach, 2));
    return g;
  }
}
