import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rngFor } from "@/utils/random";
import { MythicAura } from "./MythicAuraHD";
import { Kit, Surf, TAU, V3, craggy, dirXZ, facing, gableGeo, glowTexture, hash3, lancetFrameGeo, lancetGeo, rubble, thetaOf, useStudioReflections } from "./heroKit";

/* ------------------------------------------------------------------------- */
/* The Archon's Empyrean in high graphics (the hero model: Codex, map, city)  */
/* ------------------------------------------------------------------------- */

/** Height the citadel floats at over its rock (as `EMPYREAN_PARTS` on the map) */
const FLOAT_Y = 3.0;
/** The four great towers stand on the curtain at the diagonals; the gate faces +z */
const TOWER_ANGLES = [0, 1, 2, 3].map((i) => (i / 4) * Math.PI * 2 + Math.PI / 4);
/** Each tower its own height (front pair lower), so the crown never reads as mirrored */
const TOWER_H = [1.9, 2.1, 2.45, 2.25];
const GATE = Math.PI / 2;
/** Turrets on the curtain between the towers (the gate has its own pair) */
const TURRETS = [0, Math.PI, Math.PI * 1.5];
/** Where water pours off the lower terrace's rim */
const FALLS = [0.12, Math.PI - 0.1, Math.PI * 1.5 + 0.08];
/** Seraph statues on the lower terrace, two by the gate and two at the back */
const SERAPHS = [GATE - 0.55, GATE + 0.55, Math.PI * 1.5 - 0.6, Math.PI * 1.5 + 0.6];
const BRAZIERS = [GATE - 0.26, GATE + 0.26];

/** Lower terrace (on the spur), the curtain wall's ring, the upper terrace the cathedral stands on */
const T1_R = 2.05;
const T1_H = 0.38;
const WALL_R = 1.6;
const WALL_H = 0.5;
const T2_R = 1.38;
const Y0 = 0.63; // top of the upper terrace
const DRUM_TOP = 2.25;
const NEEDLE_BASE = 3.02;
const NEEDLE_H = 1.1;
const STAR_Y = 4.38;

/** Chains: four, each from an obelisk on the rock to an eye bolt under the lower terrace's rim */
const CHAIN_LINKS = 26;
const CHAIN_BASE_R = 1.75;
const CHAIN_BASE_Y = 1.17;
const CHAIN_TOP_R = 2.09;
const CHAIN_TOP_Y = 0.07;
/** Lumps of rubble drifting under the spur */
const FLOATERS = 6;
/** How far the castle reaches from its foot (its own units, before its scale), for the view test */
const REACH = 7;
const _frustum = new THREE.Frustum();
const _view = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _at = new THREE.Vector3();
const _scale = new THREE.Vector3();

/** Dressed stone: a block's length and a course's height; roof tiles' width and row */
const BLOCK = 0.16;
const TILE_W = 0.085;
const TILE_ROW = 0.065;

const MARBLE = "#ffffff";
const MARBLE2 = "#ebe4d8";
const STATUE = "#fffaf0";
const CRIMSON = "#9b111e";
const DEEP = "#6d0b18";
const DOOR = "#4c0812";

/* ------------------------------ surfaces ------------------------------ */

/** Dressed stone on a round part (block length along its circumference); courses come from the height */
const ashlarRound = (r: number): Surf => {
  const count = Math.max(4, Math.round((TAU * r) / BLOCK));
  return { fn: (p) => [(thetaOf(p.x, p.z) / TAU) * count, 0, 1], period: count };
};
/** Dressed stone on a box or a flat face: blocks along whichever horizontal axis the face runs */
const ASHLAR: Surf = { fn: (p, n) => [(Math.abs(n.x) > Math.abs(n.z) ? p.z : p.x) / BLOCK, 0, 1] };
/** Overlapping roof tiles round a cone, rows climbing from the eave */
const tilesRound = (r: number, h: number, count: number): Surf => {
  const slant = Math.hypot(h, r) / h;
  return { fn: (p) => [(thetaOf(p.x, p.z) / TAU) * count, ((p.y + h / 2) * slant) / TILE_ROW, 1], period: count };
};
/** Tiles on one slope of a gable roof (a slab `sl` long down the slope; `side` says which end is the eave) */
const tilesSlab = (sl: number, side: number): Surf => ({ fn: (p) => [p.z / TILE_W, (side > 0 ? sl / 2 - p.x : p.x + sl / 2) / TILE_ROW, 1] });
/** Stained glass: a lancet's leaded quarries (pane space), or a rose window (polar, worked out in the shader) */
const pane = (w: number, h: number): Surf => ({ fn: (p) => [p.x / w + 0.5, p.y / h, 1] });
const rose = (r: number): Surf => ({ fn: (p) => [p.x / r, p.y / r, 2] });

/* ------------------------------ materials ------------------------------ */

const SURF_VERT = (sh: THREE.WebGLProgramParametersWithUniforms) => {
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec3 aSurf;\nvarying vec3 vSurf;\nvarying vec3 vObjPos;\nvarying vec3 vObjN;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSurf = aSurf;\nvObjPos = position;\nvObjN = normal;");
};
const SURF_PARS = `
  varying vec3 vSurf;
  varying vec3 vObjPos;
  varying vec3 vObjN;
  float empHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

/**
 * Polished marble in dressed courses: blocks staggered course by course round every wall and tower (flagstones on the
 * terraces), each block its own tone, joints sunk in; faded out when a block gets too small on screen to read.
 */
function marbleMaterial(map: THREE.Texture): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color: "#e9e3d9", map, vertexColors: true, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.4 });
  m.onBeforeCompile = (sh) => {
    SURF_VERT(sh);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${SURF_PARS}`).replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        vec3 on = normalize(vObjN);
        float up = step(0.7, abs(on.y));
        vec2 side = vec2(vSurf.x, vObjPos.y / 0.075);
        vec2 top = vObjPos.xz / vec2(0.22, 0.16);
        vec2 p = mix(side, top, up);
        float row = floor(p.y);
        p.x += mod(row, 2.0) * 0.5;
        vec2 f = fract(p);
        vec2 cell = vec2(floor(p.x), row);
        float fw = length(fwidth(p));
        float fade = (1.0 - smoothstep(0.22, 0.55, fw)) * step(0.5, vSurf.z);
        float ex = min(f.x, 1.0 - f.x) / mix(0.045, 0.03, up);
        float ey = min(f.y, 1.0 - f.y) / mix(0.09, 0.04, up);
        float joint = 1.0 - smoothstep(0.6, 1.0, min(ex, ey));
        float tone = 0.93 + empHash(cell + floor(vObjPos.y * 0.5) * 7.0) * 0.12;
        diffuseColor.rgb *= mix(1.0, tone * (1.0 - joint * 0.32), fade);
      }`
    );
  };
  return m;
}

/**
 * Lacquered crimson: plain on doors and trim, overlapping fish-scale tiles on the roofs (rows from the eave, each tile
 * lit at its lip and shaded under the row above, its own tone).
 */
function crimsonMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.38, metalness: 0.15, clearcoat: 0.55, clearcoatRoughness: 0.25, envMapIntensity: 0.9, emissive: "#3b0208", emissiveIntensity: 0.35 });
  m.onBeforeCompile = (sh) => {
    SURF_VERT(sh);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${SURF_PARS}`).replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        vec2 tp = vSurf.xy;
        float row = floor(tp.y);
        float x = fract(tp.x + mod(row, 2.0) * 0.5) - 0.5;
        float fy = fract(tp.y);
        float edge = 1.4 * x * x;
        float d = fy - edge;
        float s = d < 0.0 ? d + 1.0 : d;
        float cellRow = d < 0.0 ? row - 1.0 : row;
        float cellCol = floor(tp.x + mod(cellRow, 2.0) * 0.5);
        float fw = length(fwidth(tp));
        float fade = (1.0 - smoothstep(0.25, 0.6, fw)) * step(0.5, vSurf.z);
        float shade = (0.58 + 0.52 * (1.0 - s)) * mix(0.3, 1.0, smoothstep(0.0, 0.09, s));
        float tone = 0.84 + empHash(vec2(cellCol, cellRow)) * 0.26;
        diffuseColor.rgb *= mix(1.0, shade * tone, fade);
      }`
    );
  };
  return m;
}

/**
 * Stained glass lit from inside: leaded diamond quarries in crimson, gold, azure and violet up a lancet, petals and
 * rings in a rose window, all breathing slowly as if the fire behind them flickered.
 */
function glassMaterial(time: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: "#14080b", roughness: 0.15, metalness: 0, emissive: "#ffffff", toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    SURF_VERT(sh);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nuniform float uTime;\n${SURF_PARS}`).replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        bool isRose = vSurf.z > 1.5;
        vec2 g = vec2(vSurf.x * 3.2, vSurf.y * 7.0);
        vec2 dq = vec2(g.x + g.y, g.x - g.y) * 0.5;
        float r = length(vSurf.xy);
        float ang = atan(vSurf.y, vSurf.x + 1e-4) / 6.28318 + 0.5;
        float ring = r < 0.32 ? 0.0 : (r < 0.68 ? 1.0 : 2.0);
        vec2 dr = vec2(ang * (ring < 0.5 ? 1.0 : ring < 1.5 ? 8.0 : 16.0), r / 0.34);
        vec2 q = isRose ? dr : dq;
        vec2 f = fract(q);
        vec2 cell = floor(q);
        float fw = length(fwidth(q));
        float leadW = isRose ? 0.07 : 0.09;
        float lead = smoothstep(0.0, leadW, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
        lead = mix(1.0, lead, 1.0 - smoothstep(0.25, 0.6, fw));
        float h = empHash(cell + (isRose ? vec2(ring * 17.0, 3.0) : vec2(0.0)));
        vec3 col = h < 0.34 ? vec3(1.0, 0.14, 0.12) : h < 0.6 ? vec3(1.0, 0.68, 0.18) : h < 0.82 ? vec3(0.32, 0.5, 1.0) : vec3(0.72, 0.36, 1.0);
        if (isRose && ring < 0.5) col = vec3(1.0, 0.8, 0.35);
        float pulse = 0.82 + 0.18 * sin(uTime * 0.9 + vObjPos.y * 3.0 + h * 6.0);
        totalEmissiveRadiance = col * lead * pulse * 1.9;
      }`
    );
  };
  return m;
}

/** Basalt with molten veins that throb (the rock base and the spur under the citadel) */
function lavaRock(time: { value: number }, color: string, veinScale: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.05, flatShading: true, envMapIntensity: 0.35 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRockPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRockPos = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        varying vec3 vRockPos;
        float rh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float rn(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(rh(i), rh(i + vec3(1.0, 0.0, 0.0)), f.x), mix(rh(i + vec3(0.0, 1.0, 0.0)), rh(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
            mix(mix(rh(i + vec3(0.0, 0.0, 1.0)), rh(i + vec3(1.0, 0.0, 1.0)), f.x), mix(rh(i + vec3(0.0, 1.0, 1.0)), rh(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
            f.z);
        }`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec3 rp = vRockPos * ${veinScale.toFixed(2)};
        float n1 = rn(rp) * 0.65 + rn(rp * 2.1) * 0.35;
        float ridge = 1.0 - abs(n1 * 2.0 - 1.0);
        float vein = smoothstep(0.945, 0.99, ridge);
        float throb = 0.7 + 0.3 * sin(uTime * 1.8 + vRockPos.y * 2.5 + n1 * 6.0);
        totalEmissiveRadiance += mix(vec3(0.85, 0.08, 0.04), vec3(1.0, 0.55, 0.18), vein) * vein * 1.8 * throb;`
      );
  };
  return m;
}

// Water pouring off the terrace: streaks rushing down, thinning out into the mist below
const WATER_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const WATER_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  float wh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wn(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wh(i), wh(i + vec2(1.0, 0.0)), f.x), mix(wh(i + vec2(0.0, 1.0)), wh(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float n = wn(vec2(vUv.x * 7.0, vUv.y * 9.0 - uTime * 3.4)) * 0.6 + wn(vec2(vUv.x * 17.0, vUv.y * 21.0 - uTime * 5.2)) * 0.4;
    float streak = smoothstep(0.4, 0.85, n);
    float edge = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 3.0);
    float fade = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.45, 0.92, vUv.y));
    vec3 col = mix(vec3(0.62, 0.8, 0.96), vec3(1.0), streak);
    gl_FragColor = vec4(col, (0.5 + streak * 0.5) * edge * fade);
  }
`;

// Puffs of mist where the water dissolves (premultiplied, drawn over) and flame tongues in the braziers (added): one draw
const PUFF_VERT = `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uViewH;
  varying float vAlpha;
  varying float vKind;
  varying vec3 vCol;
  void main() {
    float life = fract(uTime * aSeed.y + aSeed.x);
    vec3 p = position;
    float size;
    if (aSeed.w < 0.5) {
      float a = aSeed.x * 40.0;
      p += vec3(sin(a), 0.0, cos(a)) * life * 0.32 + vec3(0.0, -0.3 * life, 0.0);
      vAlpha = sin(life * 3.14159) * 0.36;
      size = aSeed.z * (0.55 + life * 0.9);
      vCol = vec3(0.93, 0.95, 1.0);
    } else {
      p += vec3(sin(aSeed.x * 30.0 + uTime * 3.0) * 0.012, life * 0.13, cos(aSeed.x * 17.0 + uTime * 2.3) * 0.012);
      vAlpha = (1.0 - life) * 0.95;
      size = aSeed.z * (1.0 - life * 0.55);
      vCol = mix(vec3(1.0, 0.86, 0.45), vec3(1.0, 0.24, 0.05), life);
    }
    vKind = aSeed.w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float scale = length(modelMatrix[0].xyz);
    gl_PointSize = size * scale * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.01);
    gl_Position = projectionMatrix * mv;
  }
`;
const PUFF_FRAG = `
  varying float vAlpha;
  varying float vKind;
  varying vec3 vCol;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-d * d * 3.0) * (1.0 - step(1.0, d)) * vAlpha;
    gl_FragColor = vKind < 0.5 ? vec4(vCol * a, a) : vec4(vCol * a * 1.7, 0.0);
  }
`;

/** White marble with grey and gilded veins */
function marbleTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d")!;
  const rng = rngFor("empyrean-hd-marble");
  x.fillStyle = "#f2eee7";
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) {
    const px = rng() * 512;
    const py = rng() * 512;
    const r = 30 + rng() * 90;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(${190 + rng() * 30},${180 + rng() * 25},${170 + rng() * 25},0.12)`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let v = 0; v < 16; v++) {
    let px = rng() * 512;
    let py = rng() * 512;
    let ang = rng() * Math.PI * 2;
    const gold = v % 4 === 0;
    x.strokeStyle = gold ? "rgba(214,158,36,0.8)" : `rgba(110,100,96,${0.18 + rng() * 0.25})`;
    x.lineWidth = gold ? 1.8 : 0.6 + rng() * 1.3;
    x.beginPath();
    x.moveTo(px, py);
    for (let s = 0; s < 70; s++) {
      ang += (rng() - 0.5) * 0.55;
      px += Math.cos(ang) * 8;
      py += Math.sin(ang) * 8;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A crimson swallowtail banner with a gold border and the Archon's star */
function bannerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const x = c.getContext("2d")!;
  const shape = () => {
    x.beginPath();
    x.moveTo(6, 4);
    x.lineTo(122, 4);
    x.lineTo(122, 250);
    x.lineTo(64, 206);
    x.lineTo(6, 250);
    x.closePath();
  };
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#b4142b");
  g.addColorStop(1, "#5c0612");
  shape();
  x.fillStyle = g;
  x.fill();
  x.lineWidth = 7;
  x.strokeStyle = "#f2b33d";
  x.stroke();
  // The eight-pointed star of the Archon
  x.save();
  x.translate(64, 92);
  x.fillStyle = "#fbd168";
  x.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 11 : 30;
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
  x.fill();
  x.restore();
  x.fillStyle = "#f2b33d";
  x.fillRect(22, 150, 84, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// The halo's band of turning gold runes
const RUNE_VERT = `
  varying float vAng;
  varying float vRad;
  void main() {
    vAng = atan(position.y, position.x);
    vRad = length(position.xy);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const RUNE_FRAG = `
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  varying float vAng;
  varying float vRad;
  float h1(float n) { return fract(sin(n * 91.345) * 47453.53); }
  void main() {
    float a = vAng / 6.28318 + 0.5;
    float cells = 48.0;
    float cell = floor(a * cells);
    float u = fract(a * cells);
    float t = (vRad - uInner) / (uOuter - uInner);
    float inCell = step(0.16, u) * step(u, 0.84) * step(0.22, t) * step(t, 0.78);
    float bar = step(abs(u - 0.5), 0.06);
    float cross = step(abs(t - 0.5), 0.06);
    float diag = step(abs((u - 0.5) - (t - 0.5) * 0.9), 0.07);
    float hv = h1(cell);
    float glyph = hv < 0.33 ? max(bar, cross) : hv < 0.66 ? max(bar, diag) : max(cross, diag);
    glyph *= inCell;
    float border = exp(-pow(abs((t - 0.06) / 0.035), 2.0)) + exp(-pow(abs((t - 0.94) / 0.035), 2.0));
    float flicker = 0.65 + 0.35 * sin(uTime * 3.0 + cell * 1.7);
    vec3 gold = vec3(1.0, 0.74, 0.26);
    vec3 col = mix(gold, vec3(1.0, 0.25, 0.3), h1(cell + 3.0) * 0.45);
    float b = glyph * flicker * 1.6 + border * 0.8;
    gl_FragColor = vec4(col * b, 1.0);
  }
`;

/* ------------------------------ the architecture ------------------------------ */

/** A lancet window lit with stained glass in a marble frame, on a wall facing direction `a` (bottom centre at `at`) */
function lancet(k: Kit, at: V3, rotY: number, w: number, h: number) {
  k.at(at, rotY, () => {
    k.add("glass", lancetGeo(w, h, 0.04), [0, 0, 0], undefined, { surf: pane(w, h) });
    k.add("marble", lancetFrameGeo(w, h, 0.025, 0.075), [0, 0, 0], undefined, { color: MARBLE2 });
  });
}

/** A rose window: glass, gold tracery (a ring, spokes, a boss) and a marble surround, facing +z of the current frame */
function roseWindow(k: Kit, x: number, y: number, z: number, r: number) {
  k.add("glass", new THREE.CircleGeometry(r, 32), [x, y, z + 0.045], undefined, { surf: rose(r) });
  k.add("gold", new THREE.TorusGeometry(r * 0.98, 0.012, 6, 32), [x, y, z + 0.08]);
  k.add("gold", new THREE.TorusGeometry(r * 0.5, 0.008, 6, 24), [x, y, z + 0.08]);
  for (let i = 0; i < 8; i++) k.add("gold", new THREE.BoxGeometry(0.01, r * 2, 0.012), [x, y, z + 0.08], [0, 0, (i / 8) * Math.PI]);
  k.add("gold", new THREE.SphereGeometry(0.02, 10, 8), [x, y, z + 0.085]);
  k.add("marble", new THREE.TorusGeometry(r + 0.022, 0.022, 6, 32), [x, y, z + 0.03], undefined, { color: MARBLE2 });
}

/** A pinnacle: a slim marble spike with a gold tip, standing at (x, y, z) */
function pinnacle(k: Kit, x: number, y: number, z: number, r = 0.045, h = 0.18) {
  k.add("marble", new THREE.ConeGeometry(r, h, 6), [x, y + h / 2, z], undefined, { color: MARBLE });
  k.add("gold", new THREE.OctahedronGeometry(r * 0.5), [x, y + h + 0.01, z], undefined, { scale: [1, 1.6, 1] });
}

/**
 * One arm of the cathedral, running from the crossing tower toward direction `a`: walls in courses, lancets down both
 * sides between buttresses with flying buttresses and pinnacles, a gable roof in tiles with gold cresting, and its end
 * (the nave's portal and rose, a transept's rose over twin lancets, or the choir's apse).
 */
function cathedralArm(k: Kit, a: number, len: number, w: number, wallH: number, roofH: number, end: "portal" | "rose" | "apse", windows: number[], piers: number[]) {
  k.at([0, 0, 0], facing(a), () => {
    const z0 = 0.3;
    const top = Y0 + wallH;
    const L = len - z0;
    k.add("marble", new THREE.BoxGeometry(w, wallH, L), [0, Y0 + wallH / 2, z0 + L / 2], undefined, { surf: ASHLAR });
    // The roof, its tiles climbing from both eaves, gilt cresting along the ridge
    const hw = w / 2 + 0.05;
    const sl = Math.hypot(hw, roofH);
    const phi = Math.atan2(roofH, hw);
    const RL = L + (end === "apse" ? 0 : 0.06);
    for (const s of [-1, 1]) k.add("crimson", new THREE.BoxGeometry(sl, 0.035, RL), [(s * hw) / 2, top + roofH / 2 + 0.012, z0 + RL / 2], [0, 0, -s * phi], { surf: tilesSlab(sl, s), color: CRIMSON });
    k.add("gold", new THREE.BoxGeometry(0.03, 0.03, RL), [0, top + roofH + 0.03, z0 + RL / 2]);
    for (let z = z0 + 0.25; z < z0 + RL - 0.05; z += 0.2) k.add("gold", new THREE.OctahedronGeometry(0.022), [0, top + roofH + 0.065, z], undefined, { scale: [1, 1.7, 1] });
    // Side windows and the buttresses between them
    for (const z of windows) for (const s of [-1, 1]) lancet(k, [s * (w / 2), Y0 + 0.17, z], (s * Math.PI) / 2, 0.095, wallH - 0.3);
    for (const z of piers) {
      for (const s of [-1, 1]) {
        const ph = wallH * 0.82;
        const px = s * (w / 2 + 0.2);
        k.add("marble", new THREE.BoxGeometry(0.08, ph, 0.09), [px, Y0 + ph / 2, z], undefined, { surf: ASHLAR, color: MARBLE2 });
        pinnacle(k, px, Y0 + ph, z);
        k.along("marble", [s * (w / 2 + 0.17), Y0 + ph - 0.03, z], [s * (w / 2 - 0.01), Y0 + wallH * 0.96, z], 0.04, { color: MARBLE2 });
      }
    }
    if (end === "apse") {
      const r = w / 2;
      k.add("marble", new THREE.CylinderGeometry(r, r, wallH, 14, 1, true, -Math.PI / 2, Math.PI), [0, Y0 + wallH / 2, len], undefined, { surf: ashlarRound(r) });
      k.add("crimson", new THREE.ConeGeometry(hw, roofH, 14, 1, true, -Math.PI / 2, Math.PI), [0, top + roofH / 2, len], undefined, { surf: tilesRound(hw, roofH, 12), color: CRIMSON });
      for (const th of [-0.75, 0, 0.75]) lancet(k, [Math.sin(th) * r, Y0 + 0.17, len + Math.cos(th) * r], th, 0.085, wallH - 0.3);
      return;
    }
    // A gable over the end wall, a gold star on its apex
    k.add("marble", gableGeo(w, roofH, 0.06), [0, top, len - 0.06], undefined, { surf: ASHLAR });
    k.add("gold", new THREE.OctahedronGeometry(0.04), [0, top + roofH + 0.07, len - 0.03], undefined, { scale: [1, 1.5, 1] });
    for (const s of [-1, 1]) pinnacle(k, s * (w / 2 + 0.02), top - 0.02, len - 0.02, 0.04, 0.2);
    if (end === "portal") {
      // The great door: crimson leaves under a gilt pointed arch, the rose window above
      k.add("crimson", lancetGeo(0.22, 0.42, 0.04), [0, Y0, len], undefined, { color: DOOR });
      k.add("gold", lancetFrameGeo(0.22, 0.42, 0.03, 0.075), [0, Y0, len]);
      roseWindow(k, 0, top + 0.12, len, 0.1);
    } else {
      for (const s of [-1, 1]) lancet(k, [s * 0.1, Y0 + 0.15, len], 0, 0.075, wallH - 0.27);
      roseWindow(k, 0, top + 0.1, len, 0.085);
    }
  });
}

/** A great tower on the curtain: plinth, shaft in courses, gold band, a balcony, lancets, corbelled parapet, tiled roof with dormers */
function greatTower(k: Kit, a: number, H: number, side: number) {
  const [x, z] = dirXZ(a, WALL_R);
  const base = T1_H;
  const top = base + H;
  k.at([x, 0, z], facing(a), () => {
    k.add("marble", new THREE.CylinderGeometry(0.33, 0.35, 0.14, 18), [0, base + 0.07, 0], undefined, { surf: ashlarRound(0.34), color: MARBLE2 });
    k.add("marble", new THREE.CylinderGeometry(0.23, 0.27, H, 18), [0, base + H / 2, 0], undefined, { surf: ashlarRound(0.25) });
    const rAt = (y: number) => 0.27 - 0.04 * ((y - base) / H);
    k.add("gold", new THREE.TorusGeometry(rAt(base + H * 0.42) + 0.006, 0.02, 8, 36), [0, base + H * 0.42, 0], [Math.PI / 2, 0, 0]);
    k.add("gold", new THREE.TorusGeometry(0.345, 0.018, 8, 36), [0, base + 0.14, 0], [Math.PI / 2, 0, 0]);
    // Lancets: one low facing out, three high round the shaft
    lancet(k, [0, base + H * 0.2, rAt(base + H * 0.2) + 0.005], 0, 0.08, 0.2);
    for (const th of [0, 2.1, -2.1]) {
      const r = rAt(base + H * 0.76) + 0.005;
      lancet(k, [Math.sin(th) * r, base + H * 0.76, Math.cos(th) * r], th, 0.075, 0.19);
    }
    // A balcony on corbels facing out, a gilt rail round it, a lit doorway behind
    const by = base + H * 0.52;
    const br = rAt(by);
    k.add("marble", new THREE.CylinderGeometry(0.15, 0.11, 0.05, 16), [0, by, br + 0.06], undefined, { color: MARBLE2 });
    for (const cx of [-0.08, 0, 0.08]) k.along("marble", [cx * 0.6, by - 0.13, br - 0.01], [cx, by - 0.02, br + 0.12], [0.035, 0.04], { color: MARBLE2 });
    k.add("gold", new THREE.TorusGeometry(0.14, 0.01, 6, 24, Math.PI * 1.2), [0, by + 0.12, br + 0.06], [Math.PI / 2, 0, -Math.PI * 0.1]);
    for (const th of [-0.9, -0.3, 0.3, 0.9]) k.add("gold", new THREE.CylinderGeometry(0.008, 0.008, 0.1, 5), [Math.sin(th) * 0.135, by + 0.075, br + 0.06 + Math.cos(th) * 0.135]);
    lancet(k, [0, by + 0.025, br - 0.005], 0, 0.085, 0.22);
    // Corbels under a crenellated parapet
    for (let i = 0; i < 12; i++) {
      const th = (i / 12) * TAU;
      k.add("marble", new THREE.BoxGeometry(0.05, 0.08, 0.07), [Math.sin(th) * 0.25, top - 0.04, Math.cos(th) * 0.25], [0, th, 0], { color: MARBLE2 });
    }
    k.add("marble", new THREE.CylinderGeometry(0.33, 0.3, 0.13, 18), [0, top + 0.065, 0], undefined, { surf: ashlarRound(0.32) });
    for (let i = 0; i < 9; i++) {
      const th = (i / 9) * TAU + 0.2;
      k.add("marble", new THREE.BoxGeometry(0.075, 0.08, 0.06), [Math.sin(th) * 0.3, top + 0.17, Math.cos(th) * 0.3], [0, th, 0], { surf: ASHLAR });
    }
    // The tiled roof rising inside the parapet, four dormers, a gilt finial
    const rh = 0.85 + (H - 2) * 0.35;
    const rb = top + 0.1;
    k.add("crimson", new THREE.ConeGeometry(0.27, rh, 20, 1, true), [0, rb + rh / 2, 0], undefined, { surf: tilesRound(0.27, rh, 14), color: DEEP });
    for (let i = 0; i < 4; i++) {
      const th = (i / 4) * TAU + Math.PI / 4;
      const dy = rb + rh * 0.24;
      const dr = 0.27 * (1 - 0.24) - 0.01;
      k.at([Math.sin(th) * dr, 0, Math.cos(th) * dr], th, () => {
        k.add("marble", new THREE.BoxGeometry(0.065, 0.075, 0.08), [0, dy + 0.0375, 0], undefined, { color: MARBLE2 });
        k.add("glass", new THREE.BoxGeometry(0.035, 0.045, 0.04), [0, dy + 0.035, 0.06], undefined, { surf: pane(0.035, 0.09) });
        k.add("crimson", new THREE.ConeGeometry(0.058, 0.06, 4), [0, dy + 0.105, 0], [0, Math.PI / 4, 0], { color: DEEP });
      });
    }
    k.add("gold", new THREE.SphereGeometry(0.035, 12, 8), [0, rb + rh, 0]);
    k.add("gold", new THREE.ConeGeometry(0.014, 0.16, 6), [0, rb + rh + 0.11, 0]);
    k.add("gold", new THREE.OctahedronGeometry(0.05), [0, rb + rh + 0.21, 0], undefined, { scale: [1, 1.5, 1] });
    // A gilt arm off the tower's side flying a banner over the curtain
    const ay = base + H * 0.72;
    k.add("gold", new THREE.BoxGeometry(0.42, 0.035, 0.035), [side * (0.25 + 0.21), ay, 0]);
    k.add("gold", new THREE.SphereGeometry(0.04, 10, 8), [side * (0.25 + 0.43), ay, 0]);
    k.add("banners", new THREE.PlaneGeometry(0.3, 0.62, 6, 14), [side * (0.25 + 0.22), ay - 0.33, 0]);
  });
}

/** A seraph on a plinth by the terrace's edge, facing out: robes, spread wings tipped in gold, a halo, a sword held upright */
function seraph(k: Kit, a: number) {
  const [x, z] = dirXZ(a, 1.84);
  k.at([x, T1_H, z], facing(a), () => {
    k.add("marble", new THREE.BoxGeometry(0.16, 0.12, 0.16), [0, 0.06, 0], undefined, { surf: ASHLAR, color: MARBLE2 });
    k.add("marble", new THREE.BoxGeometry(0.19, 0.03, 0.19), [0, 0.135, 0], undefined, { color: MARBLE2 });
    k.add("marble", new THREE.CylinderGeometry(0.035, 0.08, 0.27, 12), [0, 0.15 + 0.135, 0], undefined, { color: STATUE });
    k.add("marble", new THREE.CylinderGeometry(0.042, 0.036, 0.1, 10), [0, 0.47, 0], undefined, { color: STATUE });
    k.add("marble", new THREE.SphereGeometry(0.034, 12, 10), [0, 0.555, 0.004], undefined, { color: STATUE });
    k.add("gold", new THREE.TorusGeometry(0.045, 0.006, 6, 20), [0, 0.585, -0.03], [0.25, 0, 0]);
    for (const s of [-1, 1]) {
      k.along("marble", [s * 0.045, 0.5, 0], [s * 0.012, 0.4, 0.06], 0.02, { color: STATUE });
      // A raised wing: its bone climbs from the shoulder to the wrist, overlapping flight feathers hang from it,
      // longest at the wrist (a gold tip on the outermost), shortest by the body
      const shoulder: V3 = [s * 0.04, 0.5, -0.035];
      const wrist: V3 = [s * 0.22, 0.76, -0.1];
      k.along("marble", shoulder, wrist, [0.035, 0.03], { color: STATUE });
      for (let f = 0; f < 7; f++) {
        const u = f / 6;
        const root: V3 = [shoulder[0] + (wrist[0] - shoulder[0]) * u, shoulder[1] + (wrist[1] - shoulder[1]) * u, shoulder[2] + (wrist[2] - shoulder[2]) * u - 0.006 * f];
        const L = 0.12 + 0.2 * u;
        const tip: V3 = [root[0] + s * L * (0.15 + 0.55 * u), root[1] - L * (1 - 0.35 * u), root[2] - 0.03];
        k.along("marble", root, tip, [0.042, 0.01], { color: STATUE });
        if (f === 6) k.add("gold", new THREE.OctahedronGeometry(0.016), tip, undefined, { scale: [1, 1.8, 1] });
      }
    }
    k.along("gold", [0, 0.37, 0.07], [0, 0.66, 0.07], 0.014);
    k.add("gold", new THREE.BoxGeometry(0.075, 0.012, 0.016), [0, 0.39, 0.07]);
    k.add("gold", new THREE.SphereGeometry(0.012, 8, 6), [0, 0.355, 0.07]);
  });
}

/** Builds every static part of the castle: the rock (`base`) and the floating citadel (`city`), each one draw per material */
function buildCastle() {
  const base = new Kit();
  const city = new Kit();

  /* ---------------- the rock base, with obelisks the chains are made fast to ---------------- */
  base.add("rock", craggy(new THREE.CylinderGeometry(1.45, 2.05, 1.0, 14, 3), 0.16, 1, 0.5), [0, 0.5, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (Math.floor(i / 2) * Math.PI) / 2 + (i % 2 ? 0.27 : -0.27);
    const h = 1.1 + hash3(i, 0, 0, 3) * 0.7;
    const [x, z] = dirXZ(a, 1.85);
    base.add("rock", craggy(new THREE.ConeGeometry(0.34 + hash3(i, 1, 0, 3) * 0.12, h, 6, 3), 0.07, 10 + i), [x, h / 2 - 0.05, z], [Math.sin(a) * 0.35, a, -Math.cos(a) * 0.35]);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.9;
    const r = 2.2 + hash3(i, 2, 0, 5) * 0.6;
    base.add("rock", rubble(0.14 + hash3(i, 3, 0, 5) * 0.14, 30 + i), [Math.cos(a) * r, 0.08, Math.sin(a) * r]);
  }
  // Broken marble columns of an older temple standing on the rock's top
  [0.9, 2.6, 4.4].forEach((a, i) => {
    const h = 0.45 + i * 0.18;
    base.add("marble", new THREE.CylinderGeometry(0.09, 0.1, h, 12), [Math.cos(a) * 1.15, 1.0 + h / 2, Math.sin(a) * 1.15], [0.06 * (i - 1), 0, 0.05]);
    base.add("marble", new THREE.BoxGeometry(0.26, 0.08, 0.26), [Math.cos(a) * 1.15, 1.04, Math.sin(a) * 1.15], [0, a, 0], { color: MARBLE2 });
  });
  for (const a of TOWER_ANGLES) {
    const [x, z] = dirXZ(a, CHAIN_BASE_R);
    base.add("marble", new THREE.CylinderGeometry(0.075, 0.12, 0.74, 4), [x, 0.4 + 0.37, z], [0, a, 0], { surf: ashlarRound(0.1), color: MARBLE2 });
    base.add("gold", new THREE.ConeGeometry(0.085, 0.12, 4), [x, 1.2 - 0.0, z], [0, a, 0]);
    base.add("gold", new THREE.TorusGeometry(0.06, 0.013, 6, 16), [x, CHAIN_BASE_Y - 0.04, z], [0, facing(a) + Math.PI / 2, 0]);
  }

  /* ---------------- the floating citadel (local to the float group) ---------------- */
  // The spur under it: craggy rock hanging in crags, crimson crystals breaking out of it
  city.add("spur", craggy(new THREE.ConeGeometry(1.95, 1.65, 11, 4), 0.12, 2, -0.825), [0, -0.825, 0], [Math.PI, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const a = 0.4 + (i * Math.PI) / 2;
    const [x, z] = dirXZ(a, 1.15);
    city.add("spur", craggy(new THREE.ConeGeometry(0.33, 0.9, 6, 3), 0.06, 20 + i, -0.45), [x, -0.3 - 0.45, z], [Math.PI, 0, 0]);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.7;
    const y = -0.3 - hash3(i, 4, 0, 9) * 0.7;
    const r = 1.95 * (1 + y / 1.65) - 0.04;
    const [x, z] = dirXZ(a, r);
    city.add("crystal", new THREE.OctahedronGeometry(0.08 + hash3(i, 5, 0, 9) * 0.06), [x, y, z], [Math.sin(a) * 0.9, a, -Math.cos(a) * 0.9], { scale: [1, 2.4, 1] });
  }

  // The lower terrace: courses round its side, a gilt rim, corbels under its lip, a balustrade round its edge
  city.add("marble", new THREE.CylinderGeometry(T1_R, 1.95, T1_H, 48), [0, T1_H / 2, 0], undefined, { surf: ashlarRound(2.0), color: MARBLE2 });
  city.add("gold", new THREE.TorusGeometry(T1_R + 0.01, 0.045, 10, 96), [0, T1_H - 0.01, 0], [Math.PI / 2, 0, 0]);
  city.add("gold", new THREE.TorusGeometry(1.96, 0.035, 10, 96), [0, 0.01, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    const [x, z] = dirXZ(a, 1.97);
    city.add("marble", new THREE.BoxGeometry(0.07, 0.11, 0.1), [x, -0.045, z], [0, facing(a), 0], { color: MARBLE2 });
  }
  const gap = (a: number, list: number[], w: number) => list.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < w);
  const rail: number[] = [];
  for (let i = 0; i < 110; i++) {
    const a = (i / 110) * TAU;
    if (gap(a, FALLS, 0.12) || gap(a, [GATE], 0.11)) continue;
    rail.push(a);
    const [x, z] = dirXZ(a, 1.99);
    city.add("marble", new THREE.CylinderGeometry(0.012, 0.017, 0.12, 6), [x, T1_H + 0.06, z], undefined, { color: MARBLE });
  }
  // The rail runs over the balusters in arcs, broken at the falls and the landing
  {
    let start = rail[0];
    for (let i = 1; i <= rail.length; i++) {
      const prev = rail[i - 1];
      const cur = rail[i];
      if (cur === undefined || cur - prev > (TAU / 110) * 1.5) {
        const arc = prev - start + 0.03;
        city.add("marble", new THREE.TorusGeometry(1.99, 0.016, 6, Math.max(4, Math.round(arc * 40)), arc), [0, T1_H + 0.13, 0], [Math.PI / 2, 0, start - 0.015], { color: MARBLE });
        start = cur;
      }
    }
  }

  // The curtain wall round the upper terrace, merlons on its walk, broken by the towers and the gate
  const segs = 44;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * TAU;
    if (gap(a, TOWER_ANGLES, 0.17) || gap(a, [GATE], 0.15)) continue;
    const [x, z] = dirXZ(a, WALL_R);
    city.add("marble", new THREE.BoxGeometry(((TAU * WALL_R) / segs) * 1.05, WALL_H, 0.14), [x, T1_H + WALL_H / 2, z], [0, facing(a), 0], { surf: ASHLAR });
    city.add("marble", new THREE.BoxGeometry(0.1, 0.08, 0.16), [x, T1_H + WALL_H + 0.04, z], [0, facing(a), 0], { surf: ASHLAR });
  }
  city.add("gold", new THREE.TorusGeometry(WALL_R + 0.07, 0.016, 6, 96), [0, T1_H + WALL_H - 0.04, 0], [Math.PI / 2, 0, 0]);
  // Turrets on the wall, corbelled, under tiled caps
  for (const a of TURRETS) {
    const [x, z] = dirXZ(a, WALL_R);
    const h = 0.82;
    city.add("marble", new THREE.CylinderGeometry(0.12, 0.14, h, 14), [x, T1_H + h / 2, z], undefined, { surf: ashlarRound(0.13) });
    city.add("marble", new THREE.CylinderGeometry(0.17, 0.13, 0.1, 14), [x, T1_H + h + 0.05, z], undefined, { color: MARBLE2 });
    city.add("crimson", new THREE.ConeGeometry(0.16, 0.42, 14, 1, true), [x, T1_H + h + 0.1 + 0.21, z], undefined, { surf: tilesRound(0.16, 0.42, 9), color: DEEP });
    pinnacle(city, x, T1_H + h + 0.52, z, 0.02, 0.1);
    lancet(city, [x + Math.cos(a) * 0.125, T1_H + 0.45, z + Math.sin(a) * 0.125], facing(a), 0.06, 0.16);
  }
  // The gatehouse: two turrets, an arch with the Archon's star, crimson doors in a gilt frame, steps up to the cathedral
  for (const s of [-1, 1]) {
    const [x, z] = dirXZ(GATE + s * 0.17, WALL_R);
    city.add("marble", new THREE.CylinderGeometry(0.13, 0.15, 0.92, 14), [x, T1_H + 0.46, z], undefined, { surf: ashlarRound(0.14) });
    city.add("marble", new THREE.CylinderGeometry(0.18, 0.14, 0.1, 14), [x, T1_H + 0.97, z], undefined, { color: MARBLE2 });
    city.add("crimson", new THREE.ConeGeometry(0.17, 0.46, 14, 1, true), [x, T1_H + 1.02 + 0.23, z], undefined, { surf: tilesRound(0.17, 0.46, 9), color: DEEP });
    pinnacle(city, x, T1_H + 1.48, z, 0.022, 0.12);
  }
  city.at([0, 0, WALL_R], 0, () => {
    city.add("marble", new THREE.BoxGeometry(0.34, 0.2, 0.2), [0, T1_H + 0.56, 0], undefined, { surf: ASHLAR });
    for (const x of [-0.11, 0, 0.11]) city.add("marble", new THREE.BoxGeometry(0.07, 0.07, 0.2), [x, T1_H + 0.695, 0], undefined, { surf: ASHLAR });
    city.add("gold", new THREE.OctahedronGeometry(0.05), [0, T1_H + 0.57, 0.12], undefined, { scale: [1, 1.4, 0.5] });
    city.add("crimson", lancetGeo(0.2, 0.44, 0.06), [0, T1_H, -0.04], undefined, { color: DOOR });
    city.add("gold", lancetFrameGeo(0.2, 0.44, 0.025, 0.11), [0, T1_H, -0.04]);
  });
  for (let k = 0; k < 3; k++) {
    const h = (k + 1) * ((Y0 - T1_H) / 3);
    city.add("marble", new THREE.BoxGeometry(0.3, h, 0.07), [0, T1_H + h / 2, WALL_R - 0.11 - k * 0.07], undefined, { surf: ASHLAR, color: MARBLE2 });
  }
  for (const a of BRAZIERS) {
    const [x, z] = dirXZ(a, 1.86);
    for (let l = 0; l < 3; l++) {
      const la = (l / 3) * TAU;
      city.along("gold", [x + Math.cos(la) * 0.06, T1_H, z + Math.sin(la) * 0.06], [x, T1_H + 0.2, z], 0.012);
    }
    city.add("gold", new THREE.CylinderGeometry(0.07, 0.035, 0.05, 14), [x, T1_H + 0.22, z]);
  }
  SERAPHS.forEach((a) => seraph(city, a));

  // The upper terrace, its gilt edge
  city.add("marble", new THREE.CylinderGeometry(T2_R, T2_R + 0.04, Y0 - T1_H, 40), [0, (T1_H + Y0) / 2, 0], undefined, { surf: ashlarRound(T2_R), color: MARBLE2 });
  city.add("gold", new THREE.TorusGeometry(T2_R + 0.005, 0.022, 8, 80), [0, Y0 - 0.01, 0], [Math.PI / 2, 0, 0]);

  // The cathedral: nave to the gate, transepts, the choir with its apse, the crossing tower in the middle
  cathedralArm(city, GATE, 1.22, 0.62, 0.72, 0.36, "portal", [0.62, 0.86, 1.1], [0.74, 0.98]);
  cathedralArm(city, 0, 1.02, 0.56, 0.66, 0.33, "rose", [0.62, 0.86], [0.74]);
  cathedralArm(city, Math.PI, 1.02, 0.56, 0.66, 0.33, "rose", [0.62, 0.86], [0.74]);
  cathedralArm(city, -Math.PI / 2, 0.82, 0.56, 0.66, 0.33, "apse", [0.6], []);

  // The crossing tower: an octagon in courses, a lancet on each face above the roofs, pinnacles at its corners
  const drumR = 0.62;
  const apothem = drumR * Math.cos(Math.PI / 8);
  city.add("marble", new THREE.CylinderGeometry(drumR, drumR, DRUM_TOP - Y0, 8), [0, (Y0 + DRUM_TOP) / 2, 0], [0, Math.PI / 8, 0], { surf: ashlarRound(0.58) });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    lancet(city, [Math.cos(a) * apothem, 1.8, Math.sin(a) * apothem], facing(a), 0.1, 0.36);
    const c = a + Math.PI / 8;
    pinnacle(city, Math.cos(c) * (drumR + 0.02), DRUM_TOP + 0.06, Math.sin(c) * (drumR + 0.02), 0.045, 0.24);
  }
  city.add("marble", new THREE.CylinderGeometry(0.68, 0.64, 0.07, 8), [0, DRUM_TOP + 0.035, 0], [0, Math.PI / 8, 0], { color: MARBLE2 });
  city.add("gold", new THREE.TorusGeometry(0.665, 0.018, 6, 48), [0, DRUM_TOP, 0], [Math.PI / 2, 0, 0]);
  // The gallery: a core with lit lancets behind eight columns under a gilt entablature
  const gTop = 2.62;
  city.add("marble", new THREE.CylinderGeometry(0.44, 0.44, gTop - DRUM_TOP - 0.07, 8), [0, (DRUM_TOP + 0.07 + gTop) / 2, 0], [0, Math.PI / 8, 0], { surf: ashlarRound(0.42) });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    lancet(city, [Math.cos(a) * 0.44 * Math.cos(Math.PI / 8), DRUM_TOP + 0.1, Math.sin(a) * 0.44 * Math.cos(Math.PI / 8)], facing(a), 0.075, 0.2);
    const c = a + Math.PI / 8;
    const [cx, cz] = dirXZ(c, 0.56);
    city.add("marble", new THREE.CylinderGeometry(0.026, 0.03, gTop - DRUM_TOP - 0.1, 10), [cx, (DRUM_TOP + 0.07 + gTop - 0.03) / 2, cz], undefined, { color: MARBLE });
    city.add("gold", new THREE.BoxGeometry(0.075, 0.035, 0.075), [cx, gTop - 0.035, cz], [0, -c, 0]);
  }
  city.add("marble", new THREE.CylinderGeometry(0.63, 0.61, 0.06, 8), [0, gTop + 0.03, 0], [0, Math.PI / 8, 0], { surf: ashlarRound(0.62), color: MARBLE2 });
  city.add("gold", new THREE.TorusGeometry(0.615, 0.014, 6, 48), [0, gTop + 0.03, 0], [Math.PI / 2, 0, 0]);
  // The lantern: tall lit lancets all round, a gilt band
  city.add("marble", new THREE.CylinderGeometry(0.36, 0.36, NEEDLE_BASE - gTop - 0.1, 8), [0, (gTop + 0.06 + NEEDLE_BASE - 0.04) / 2, 0], [0, Math.PI / 8, 0], { surf: ashlarRound(0.34) });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    lancet(city, [Math.cos(a) * 0.36 * Math.cos(Math.PI / 8), gTop + 0.1, Math.sin(a) * 0.36 * Math.cos(Math.PI / 8)], facing(a), 0.07, 0.22);
  }
  city.add("gold", new THREE.CylinderGeometry(0.4, 0.38, 0.05, 8), [0, NEEDLE_BASE - 0.025, 0], [0, Math.PI / 8, 0]);
  // The needle: tiles, gold ribs up its edges with crockets, gold rings
  const needleR = 0.38;
  city.add("crimson", new THREE.ConeGeometry(needleR, NEEDLE_H, 24, 1, true), [0, NEEDLE_BASE + NEEDLE_H / 2, 0], undefined, { surf: tilesRound(needleR, NEEDLE_H, 16), color: CRIMSON });
  const apex: V3 = [0, NEEDLE_BASE + NEEDLE_H - 0.05, 0];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const foot: V3 = [Math.cos(a) * (needleR + 0.01), NEEDLE_BASE + 0.01, Math.sin(a) * (needleR + 0.01)];
    city.along("gold", foot, apex, 0.022);
    for (let c = 1; c <= 5; c++) {
      const t = c / 6.5;
      const p: V3 = [foot[0] + (apex[0] - foot[0]) * t, foot[1] + (apex[1] - foot[1]) * t, foot[2] + (apex[2] - foot[2]) * t];
      const tip: V3 = [p[0] + Math.cos(a) * 0.05, p[1] + 0.035, p[2] + Math.sin(a) * 0.05];
      city.along("gold", p, tip, 0, { geo: new THREE.ConeGeometry(0.014, 1, 5) });
    }
  }
  for (const t of [0.22, 0.5, 0.76]) {
    const y = NEEDLE_BASE + NEEDLE_H * t;
    city.add("gold", new THREE.TorusGeometry(needleR * (1 - t) + 0.012, 0.018, 8, 40), [0, y, 0], [Math.PI / 2, 0, 0]);
  }

  // The great towers on the curtain, each its own height, banners over the wall
  TOWER_ANGLES.forEach((a, i) => greatTower(city, a, TOWER_H[i], i % 2 ? 1 : -1));

  // Spouts at the terrace's edge where the water pours over
  for (const a of FALLS) {
    const [x, z] = dirXZ(a, T1_R + 0.04);
    city.add("gold", new THREE.BoxGeometry(0.12, 0.04, 0.2), [x, T1_H - 0.1, z], [0, facing(a), 0]);
    const [cx, cz] = dirXZ(a, 1.82);
    city.add("water", new THREE.BoxGeometry(0.08, 0.03, 0.42), [cx, T1_H + 0.04, cz], [0, facing(a), 0]);
  }
  // Eye bolts under the rim, the chains' top ends
  for (const a of TOWER_ANGLES) {
    const [x, z] = dirXZ(a, CHAIN_TOP_R);
    const [bx, bz] = dirXZ(a, 2.0);
    city.add("gold", new THREE.BoxGeometry(0.06, 0.1, 0.12), [bx, CHAIN_TOP_Y + 0.07, bz], [0, facing(a), 0]);
    city.add("gold", new THREE.TorusGeometry(0.045, 0.012, 6, 14), [x, CHAIN_TOP_Y, z], [0, facing(a) + Math.PI / 2, 0]);
  }

  return { base: base.bake(), city: city.bake() };
}

/** The water ribbons: each leaves its spout outward, bends down and thins into mist */
function waterfallGeometry(): THREE.BufferGeometry {
  const steps = 18;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  FALLS.forEach((a, f) => {
    const o = f * (steps + 1) * 2;
    const tx = -Math.sin(a);
    const tz = Math.cos(a);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = T1_R + 0.12 + 0.42 * t;
      const y = T1_H - 0.1 - 2.2 * Math.pow(t, 1.5);
      const w = 0.1 + 0.3 * t;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      pos.push(cx - tx * w, y, cz - tz * w, cx + tx * w, y, cz + tz * w);
      uv.push(0, t, 1, t);
      if (i < steps) {
        const k = o + i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Mist puffs at the foot of each fall and flame tongues in the braziers (kind in `aSeed.w`) */
function puffGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const seed: number[] = [];
  const rng = rngFor("empyrean-hd-puffs");
  for (const a of FALLS) {
    for (let i = 0; i < 16; i++) {
      const t = 0.6 + rng() * 0.35;
      const r = T1_R + 0.12 + 0.42 * t + (rng() - 0.5) * 0.15;
      pos.push(Math.cos(a) * r + (rng() - 0.5) * 0.2, T1_H - 0.1 - 2.2 * Math.pow(t, 1.5), Math.sin(a) * r + (rng() - 0.5) * 0.2);
      seed.push(rng(), 0.12 + rng() * 0.1, 0.3 + rng() * 0.25, 0);
    }
  }
  for (const a of BRAZIERS) {
    const [x, z] = dirXZ(a, 1.86);
    for (let i = 0; i < 9; i++) {
      pos.push(x + (rng() - 0.5) * 0.06, T1_H + 0.25, z + (rng() - 0.5) * 0.06);
      seed.push(rng(), 0.9 + rng() * 0.8, 0.06 + rng() * 0.05, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
  return g;
}

/**
 * The Empyrean (castle Lv26–30, the Archon of the Realm only) in high graphics, the hero model shown in the Royal Codex, on
 * the world map and as the Archon's town hall. A floating holy city held to its rock by four gold chains: a cathedral
 * (nave, transepts, an apse, flying buttresses, stained-glass lancets and rose windows) under a crossing tower whose
 * gallery, lantern and gold-ribbed needle carry the Archon's star; a crenellated curtain with four great towers of
 * different heights, turrets and a gatehouse; seraph statues, braziers and a balustrade round the lower terrace; water
 * pouring off its edge into mist; under it the spur with crimson crystals and rubble drifting. Marble in dressed
 * courses, crimson roof tiles, mirror gold, molten-veined rock; a turning halo, three orbiting shards, fluttering banners
 * and the mythic beam, curtain and embers.
 */
export function HighGraphicsEmpyrean({ lights = true, studio = true }: { lights?: boolean; studio?: boolean } = {}) {
  // On the world map and in the city the view's own HD reflections light it, and it brings no lights of its own
  // (a point light there would recompile and slow every material in the scene)
  useStudioReflections(0.35, studio);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);

  const rootRef = useRef<THREE.Group>(null);
  const floatRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Group>(null);
  const starRef = useRef<THREE.Group>(null);
  const shardsRef = useRef<THREE.Group>(null);
  const shardRefs = useRef<Array<THREE.Group | null>>([]);
  const ventRef = useRef<THREE.MeshStandardMaterial>(null);

  const built = useMemo(() => {
    const time = { value: 0 };
    const marbleMap = marbleTexture();
    marbleMap.repeat.set(2, 1);
    const banner = bannerTexture();
    const glow = glowTexture();

    const mats = {
      marble: marbleMaterial(marbleMap),
      gold: new THREE.MeshStandardMaterial({ color: "#f2b33d", metalness: 1, roughness: 0.2, envMapIntensity: 1.6, emissive: "#7a4a06", emissiveIntensity: 0.25 }),
      goldGlow: new THREE.MeshStandardMaterial({ color: "#ffd77a", metalness: 0.6, roughness: 0.25, emissive: "#f59e0b", emissiveIntensity: 2.2, toneMapped: false }),
      crimson: crimsonMaterial(),
      glass: glassMaterial(time),
      rock: lavaRock(time, "#2a2522", 2.6),
      spur: lavaRock(time, "#34303a", 3.0),
      water: new THREE.MeshPhysicalMaterial({ color: "#9fd4f0", roughness: 0.05, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.8, emissive: "#3a7ca8", emissiveIntensity: 0.25 }),
      fall: new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: { uTime: time }, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      puffs: new THREE.ShaderMaterial({
        vertexShader: PUFF_VERT,
        fragmentShader: PUFF_FRAG,
        uniforms: { uTime: time, uViewH: { value: 800 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor
      }),
      banner: new THREE.MeshStandardMaterial({ map: banner, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.75, envMapIntensity: 0.3 }),
      crystal: new THREE.MeshPhysicalMaterial({ color: "#ef4444", emissive: "#dc2626", emissiveIntensity: 0.9, roughness: 0.08, metalness: 0.1, clearcoat: 1, flatShading: true, toneMapped: false }),
      shardRed: new THREE.MeshPhysicalMaterial({ color: "#ef4444", emissive: "#dc2626", emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.1, clearcoat: 1, flatShading: true, toneMapped: false }),
      shardGold: new THREE.MeshPhysicalMaterial({ color: "#fcd34d", emissive: "#f59e0b", emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.4, clearcoat: 1, flatShading: true, toneMapped: false }),
      runes: new THREE.ShaderMaterial({
        vertexShader: RUNE_VERT,
        fragmentShader: RUNE_FRAG,
        uniforms: { uTime: time, uInner: { value: 1.04 }, uOuter: { value: 1.22 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      }),
      glowGold: new THREE.SpriteMaterial({ map: glow, color: "#ffcf6e", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
      glowRed: new THREE.SpriteMaterial({ map: glow, color: "#ff3b4e", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
      glowVent: new THREE.SpriteMaterial({ map: glow, color: "#ff6a2a", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    };

    // Banners flutter from their arms: the free (bottom) edge swings most
    mats.banner.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float hang = 1.0 - uv.y;
        float ph = position.x * 3.7 + position.z * 2.9;
        transformed += objectNormal * (sin(uTime * 3.1 + ph + hang * 5.0) * 0.07 + sin(uTime * 5.3 + ph * 1.7 + hang * 9.0) * 0.02) * hang;`
      );
    };

    const { base, city } = buildCastle();

    // Gold beads riding the halo
    const beadGeo = new THREE.SphereGeometry(0.05, 12, 8);
    const beads = new THREE.InstancedMesh(beadGeo, mats.goldGlow, 20);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      beads.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * 1.42, Math.sin(a) * 1.42, 0));
    }
    // The chains' links, laid out every frame between the obelisks and the drifting citadel
    const linkGeo = new THREE.TorusGeometry(0.03, 0.009, 6, 12);
    const chains = new THREE.InstancedMesh(linkGeo, mats.gold, CHAIN_LINKS * TOWER_ANGLES.length);
    chains.frustumCulled = false;

    const puffs = new THREE.Points(puffGeometry(), mats.puffs);
    puffs.frustumCulled = false;
    puffs.renderOrder = 3;

    const geos = {
      fall: waterfallGeometry(),
      vent: new THREE.CylinderGeometry(0.48, 0.55, 0.14, 24),
      halo: new THREE.TorusGeometry(1.3, 0.06, 12, 96),
      haloInner: new THREE.TorusGeometry(1.0, 0.02, 8, 96),
      runes: new THREE.RingGeometry(1.04, 1.22, 128, 1),
      star: new THREE.OctahedronGeometry(0.26),
      starRing: new THREE.TorusGeometry(0.42, 0.018, 8, 48),
      shard: new THREE.OctahedronGeometry(0.3)
    };
    // Rubble drifting under the spur: one lump, each copy turned and sized its own way (one draw)
    const floaters = new THREE.InstancedMesh(rubble(0.18, 60), mats.spur, FLOATERS);
    floaters.frustumCulled = false;
    return { time, mats, geos, floaters, base, city, beads, chains, puffs, textures: [marbleMap, banner, glow] };
  }, []);

  useEffect(
    () => () => {
      [...Object.values(built.geos), ...Object.values(built.base), ...Object.values(built.city), built.floaters.geometry].forEach((g) => g.dispose());
      built.floaters.dispose();
      Object.values(built.mats).forEach((m) => m.dispose());
      built.textures.forEach((t) => t.dispose());
      // InstancedMesh.dispose frees only its instance buffers, not the geometry
      built.beads.geometry.dispose();
      built.beads.dispose();
      built.chains.geometry.dispose();
      built.chains.dispose();
      built.puffs.geometry.dispose();
    },
    [built]
  );

  // Scratch for laying out the chains
  const scratch = useMemo(
    () => ({ e: new THREE.Euler(), sc: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Vector3(), d: new THREE.Vector3(), quat: new THREE.Quaternion(), twist: new THREE.Quaternion(), m: new THREE.Matrix4(), s: new THREE.Vector3(1, 1.55, 1), up: new THREE.Vector3(0, 1, 0) }),
    []
  );

  useFrame(({ clock, camera }, rawDelta) => {
    const dt = Math.min(0.05, rawDelta);
    const t = clock.elapsedTime;
    built.time.value = t;
    built.mats.puffs.uniforms.uViewH.value = size.height * gl.getPixelRatio();
    // The chains and the drifting rubble are laid out from the clock alone: out of view (on the map) they wait
    let inView = true;
    const root = rootRef.current;
    if (root) {
      camera.updateMatrixWorld();
      _frustum.setFromProjectionMatrix(_view.multiplyMatrices(camera.projectionMatrix, _view.copy(camera.matrixWorld).invert()));
      const k = root.getWorldScale(_scale).x;
      inView = _frustum.intersectsSphere(_sphere.set(root.getWorldPosition(_at).setY(_at.y + (REACH / 2) * k), REACH * k));
    }
    const fl = floatRef.current;
    if (fl) {
      fl.position.y = FLOAT_Y + Math.sin(t * 0.9) * 0.12;
      fl.rotation.x = Math.sin(t * 0.6) * 0.012;
      fl.rotation.z = Math.cos(t * 0.5) * 0.012;
      fl.updateMatrix();
    }
    if (fl && inView) {
      // Each chain runs taut from its obelisk to its eye bolt, sagging a hair and swaying with the citadel
      const { a, b, p, q, d, quat, twist, m, s, up } = scratch;
      TOWER_ANGLES.forEach((ang, c) => {
        a.set(Math.cos(ang) * CHAIN_BASE_R, CHAIN_BASE_Y, Math.sin(ang) * CHAIN_BASE_R);
        b.set(Math.cos(ang) * CHAIN_TOP_R, CHAIN_TOP_Y, Math.sin(ang) * CHAIN_TOP_R).applyMatrix4(fl.matrix);
        const sway = Math.sin(t * 0.7 + c * 1.9) * 0.025;
        for (let i = 0; i < CHAIN_LINKS; i++) {
          const u = (i + 0.5) / CHAIN_LINKS;
          const sag = 4 * u * (1 - u);
          p.lerpVectors(a, b, u);
          p.x += Math.cos(ang) * (sag * 0.05 + sway * sag);
          p.y -= sag * 0.04;
          p.z += Math.sin(ang) * (sag * 0.05) + sway * sag * 0.5;
          const u2 = Math.min(1, u + 0.02);
          const sag2 = 4 * u2 * (1 - u2);
          q.lerpVectors(a, b, u2);
          q.x += Math.cos(ang) * (sag2 * 0.05 + sway * sag2);
          q.y -= sag2 * 0.04;
          q.z += Math.sin(ang) * (sag2 * 0.05) + sway * sag2 * 0.5;
          d.subVectors(q, p).normalize();
          quat.setFromUnitVectors(up, d);
          twist.setFromAxisAngle(up, i % 2 ? Math.PI / 2 : 0);
          quat.multiply(twist);
          built.chains.setMatrixAt(c * CHAIN_LINKS + i, m.compose(p, quat, s));
        }
      });
      built.chains.instanceMatrix.needsUpdate = true;
    }
    if (haloRef.current) haloRef.current.rotation.z += dt * 0.45;
    if (starRef.current) {
      starRef.current.rotation.y += dt * 1.2;
      starRef.current.position.y = STAR_Y + Math.sin(t * 1.7) * 0.05;
    }
    if (shardsRef.current) shardsRef.current.rotation.y += dt * 0.35;
    shardRefs.current.forEach((s, i) => {
      if (!s) return;
      s.rotation.y += dt * (1.1 + i * 0.3);
      s.position.y = (i - 1) * 0.35 + Math.sin(t * 1.3 + i * 2.1) * 0.12;
    });
    if (inView) {
      const { p, quat, m, e, sc } = scratch;
      for (let i = 0; i < FLOATERS; i++) {
        const a = (i / FLOATERS) * TAU - t * 0.22;
        const r = 0.8 + (i % 2) * 0.5;
        p.set(Math.cos(a) * r, -1.75 - (i % 3) * 0.25 + Math.sin(t * 0.8 + i * 1.3) * 0.1, Math.sin(a) * r);
        quat.setFromEuler(e.set(t * (0.3 + i * 0.05), i * 1.7, i * 0.9));
        const k = 0.7 + hash3(i, 9, 0, 8) * 0.65;
        sc.set(k * (0.8 + hash3(i, 1, 2, 8) * 0.4), k, k * (0.8 + hash3(i, 3, 4, 8) * 0.4));
        built.floaters.setMatrixAt(i, m.compose(p, quat, sc));
      }
      built.floaters.instanceMatrix.needsUpdate = true;
    }
    if (ventRef.current) ventRef.current.emissiveIntensity = 2.2 + Math.sin(t * 2.4) * 0.6;
  });

  const { mats, geos, base, city } = built;
  const cityMat: Record<string, THREE.Material> = {
    spur: mats.spur,
    crystal: mats.crystal,
    marble: mats.marble,
    gold: mats.gold,
    crimson: mats.crimson,
    glass: mats.glass,
    water: mats.water,
    banners: mats.banner
  };
  return (
    <group ref={rootRef} scale={1.3}>
      {/* Crimson light from the vent under the citadel, gold from the crown, a cool rim behind */}
      {lights && (
        <>
          <pointLight position={[0, 1.6, 0]} color="#ff3b30" intensity={9} distance={7} />
          <pointLight position={[0, 7.6, 0.6]} color="#ffc56b" intensity={7} distance={9} />
          <pointLight position={[-4, 6, -3.5]} color="#a5b4fc" intensity={4} distance={14} />
          <pointLight position={[3.5, 3.5, 4]} color="#fb7185" intensity={3} distance={12} />
        </>
      )}

      {/* Rock base with molten veins, its spikes and rubble, broken temple columns, the chains' obelisks */}
      <mesh geometry={base.rock} material={mats.rock} castShadow receiveShadow />
      <mesh geometry={base.marble} material={mats.marble} castShadow />
      <mesh geometry={base.gold} material={mats.gold} />
      <mesh geometry={geos.vent} position={[0, 1.0, 0]}>
        <meshStandardMaterial ref={ventRef} color="#ff8a3d" emissive="#ea580c" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      <sprite material={mats.glowVent} position={[0, 1.2, 0]} scale={[1.8, 1.8, 1]} />
      <primitive object={built.chains} />

      {/* The floating citadel */}
      <group ref={floatRef} position={[0, FLOAT_Y, 0]}>
        {Object.entries(cityMat).map(([k, m]) => city[k] && <mesh key={k} geometry={city[k]} material={m} />)}
        <mesh geometry={geos.fall} material={mats.fall} renderOrder={2} />
        <primitive object={built.puffs} />

        {/* The gold star over the great spire */}
        <group ref={starRef} position={[0, STAR_Y, 0]}>
          <mesh geometry={geos.star} material={mats.goldGlow} scale={[1, 1.35, 1]} />
          <mesh geometry={geos.starRing} material={mats.goldGlow} rotation={[Math.PI / 2 - 0.3, 0, 0]} />
          <sprite material={mats.glowGold} scale={[2.0, 2.0, 1]} />
        </group>

        {/* The halo turning over the crown, with its band of runes and riding beads */}
        <group position={[0, 3.45, 0]} rotation={[Math.PI / 2 - 0.22, 0, 0]}>
          <group ref={haloRef}>
            <mesh geometry={geos.halo} material={mats.goldGlow} />
            <mesh geometry={geos.haloInner} material={mats.gold} />
            <mesh geometry={geos.runes} material={mats.runes} renderOrder={2} />
            <primitive object={built.beads} />
          </group>
        </group>

        {/* Rubble drifting under the spur */}
        <primitive object={built.floaters} />
      </group>

      {/* Three shards orbiting the citadel */}
      <group ref={shardsRef} position={[0, 4.2, 0]}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <group key={i} position={[Math.cos(a) * 2.5, (i - 1) * 0.35, Math.sin(a) * 2.5]} ref={(el) => {
                shardRefs.current[i] = el;
              }}>
              <mesh geometry={geos.shard} material={i === 1 ? mats.shardGold : mats.shardRed} scale={[1, 1.8, 1]} />
              <sprite material={i === 1 ? mats.glowGold : mats.glowRed} scale={[1.3, 1.3, 1]} />
            </group>
          );
        })}
      </group>

      {/* Mythic aura: the beam rising from the star, a short beam from the vent into the spur, the curtain round the rock */}
      <MythicAura
        beams={[
          { y: FLOAT_Y + 3.95, height: 22, radius: 0.8 },
          { y: 0.95, height: 1.5, radius: 0.5 }
        ]}
        curtainRadius={3.0}
        curtainHeight={3.2}
        emberRadii={[2.3, 3.6]}
        emberHeight={9}
        embers={220}
      />
    </group>
  );
}
