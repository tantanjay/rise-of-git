import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { LucideIcon } from "lucide-react";
import { glyphParts } from "@/components/ui/glyphs";

/*
 * Floating text: numbers and short words that pop up over a spot in the 3D world, rise and fade (battle losses and
 * damage today; any kind of tick, name or percentage on the same kit). Every glyph of every entry is one instance of a
 * single quad, drawn in ONE draw call however many entries are up:
 *   - a glyph atlas (one texture): a fixed set of characters, plus lucide icons added on first use; an emoji in an
 *     entry's text becomes its line icon through the shared map in `glyphs.tsx` (`"🔥 −40"`, `"❄️ Frost Lance"`);
 *   - the rise, pop and fade run on the GPU from each glyph's start time: adding an entry writes its glyphs once,
 *     nothing is touched per frame but the clock uniform;
 *   - glyphs keep a fixed size on screen and fade out with camera distance (`fade`), so text reads at near and mid
 *     zoom and is gone at overview; with nothing in reach the mesh is hidden (no draw);
 *   - an entry may keep apart from another spot on screen (`apart`), so the two sides of a battle never overlap
 *     from any angle.
 * The layer draws into its own transparent canvas stacked over the view, above the name cards (drei <Html>), so text
 * is never hidden behind a label; the view's own canvas gets no extra draw, and bloom never touches the text. No depth
 * test, no shadows, never raycast.
 */

export interface FloatEntry {
  /** World position the text rises from */
  x: number;
  y: number;
  z: number;
  /** Characters of the atlas; emoji become their line icons */
  text: string;
  /** Tint of the text (icons keep their own colour) */
  color?: string;
  /** Glyph height on screen, px */
  size?: number;
  /** Seconds on screen */
  life?: number;
  /** Seconds before it appears */
  delay?: number;
  /** px it rises over its life */
  rise?: number;
  /** px shift of its starting point on screen (+y up) */
  dx?: number;
  dy?: number;
  /** Keep at least `px` from this spot on screen (the other side of a fight), pushed away from it */
  apart?: { x: number; y: number; z: number; px: number };
  /** Epoch ms the event happened: an entry added late starts part-way through its life */
  at?: number;
}

/** Ready looks for the kinds of entries the realm shows; spread one into an entry and override what differs */
export const FLOAT_STYLE = {
  /** Soldiers lost: big, red */
  loss: { color: "#ff5468", size: 40, life: 4, rise: 72 },
  /** Damage dealt: smaller, gold, under the losses */
  damage: { color: "#fde68a", size: 23, life: 4, rise: 72, dy: -34 },
  /** A tick of a lasting effect (burning, poison): icon and number */
  status: { color: "#fdba74", size: 30, life: 2.2, rise: 48 },
  /** A named strike or spell */
  cast: { color: "#f8fafc", size: 28, life: 2.4, rise: 40 },
  /** Strength lost by a band, as a share */
  percent: { color: "#ff5468", size: 36, life: 4, rise: 68 }
} satisfies Record<string, Partial<FloatEntry>>;

/** Shown entries go here; each `FloatingText` layer drains its own store every frame */
export class FloatingTextStore {
  pending: FloatEntry[] = [];
  add(...entries: FloatEntry[]) {
    this.pending.push(...entries);
  }
}

/** The world map's layer (battle numbers and whatever else floats over the map) */
export const MAP_FLOATING_TEXT = new FloatingTextStore();

/* ------------------------------------------------------------------------- */
/* Glyph atlas                                                               */
/* ------------------------------------------------------------------------- */

const ATLAS_PX = 1024;
const CELL_PX = 64;
const COLS = ATLAS_PX / CELL_PX;
const CELLS = COLS * COLS;
const FONT_PX = 46;
const FONT = `bold ${FONT_PX}px Georgia, "Times New Roman", serif`;
const OUTLINE_PX = 9;
const ICON_PX = 44;
// Printable ASCII and the typographic minus, times and dots the numbers use
const CHARSET = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") + "−×·…";

// The class colours `glyphs.tsx` gives its icons
const ICON_COLOR: Record<string, string> = {
  "text-amber-300": "#fcd34d", "text-orange-400": "#fb923c", "text-slate-300": "#cbd5e1", "text-sky-300": "#7dd3fc",
  "text-violet-300": "#c4b5fd", "text-emerald-300": "#6ee7b7", "text-rose-400": "#fb7185", "text-stone-300": "#d6d3d1",
  "text-orange-300": "#fdba74", "text-lime-300": "#bef264", "text-pink-300": "#f9a8d4", "text-red-400": "#f87171",
  "text-yellow-300": "#fde047", "text-rose-300": "#fda4af"
};

type IconNode = Array<[string, Record<string, string | number>]>;

/** A lucide icon's shapes (its 24-unit SVG nodes), read from the component without rendering it */
function iconNodeOf(icon: LucideIcon): IconNode {
  try {
    const el = (icon as unknown as { render: (props: object, ref: null) => { props: { icon?: { node?: IconNode }; iconNode?: IconNode } } }).render({}, null);
    return el.props.icon?.node ?? el.props.iconNode ?? [];
  } catch {
    return [];
  }
}

function iconPath(node: IconNode): Path2D {
  const p = new Path2D();
  const n = (v: string | number | undefined) => Number(v ?? 0);
  const points = (s: string) => s.trim().split(/[\s,]+/).map(Number);
  for (const [tag, a] of node) {
    if (tag === "path") p.addPath(new Path2D(String(a.d)));
    else if (tag === "circle") {
      p.moveTo(n(a.cx) + n(a.r), n(a.cy));
      p.arc(n(a.cx), n(a.cy), n(a.r), 0, Math.PI * 2);
    } else if (tag === "ellipse") {
      p.moveTo(n(a.cx) + n(a.rx), n(a.cy));
      p.ellipse(n(a.cx), n(a.cy), n(a.rx), n(a.ry), 0, 0, Math.PI * 2);
    } else if (tag === "line") {
      p.moveTo(n(a.x1), n(a.y1));
      p.lineTo(n(a.x2), n(a.y2));
    } else if (tag === "rect") {
      const r = n(a.rx);
      if (r > 0) p.roundRect(n(a.x), n(a.y), n(a.width), n(a.height), r);
      else p.rect(n(a.x), n(a.y), n(a.width), n(a.height));
    } else if (tag === "polyline" || tag === "polygon") {
      const v = points(String(a.points));
      for (let i = 0; i + 1 < v.length; i += 2) (i === 0 ? p.moveTo : p.lineTo).call(p, v[i], v[i + 1]);
      if (tag === "polygon") p.closePath();
    }
  }
  return p;
}

interface Cell {
  u: number;
  v: number;
  /** Advance, in em (cell widths) */
  advance: number;
  /** Fixed colour (icons), else the entry's */
  color?: THREE.Color;
}

/**
 * The atlas texture holds coverage, not colour: red is the glyph's fill, green the fill with its dark outline round
 * it. The shader tints the fill and draws the outline dark, so any colour reads on any ground.
 */
class GlyphAtlas {
  readonly texture: THREE.DataTexture;
  private readonly data = new Uint8Array(ATLAS_PX * ATLAS_PX * 4);
  private readonly fill = document.createElement("canvas");
  private readonly edge = document.createElement("canvas");
  private readonly chars = new Map<string, Cell>();
  private readonly icons = new Map<LucideIcon, Cell>();
  private next = 0;

  constructor() {
    for (const c of [this.fill, this.edge]) c.width = c.height = CELL_PX;
    this.texture = new THREE.DataTexture(this.data, ATLAS_PX, ATLAS_PX, THREE.RGBAFormat);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.flipY = false;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    for (const ch of CHARSET) this.chars.set(ch, this.drawChar(ch));
    this.texture.needsUpdate = true;
  }

  private ctxs() {
    const f = this.fill.getContext("2d", { willReadFrequently: true })!;
    const e = this.edge.getContext("2d", { willReadFrequently: true })!;
    for (const c of [f, e]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, CELL_PX, CELL_PX);
      c.fillStyle = c.strokeStyle = "#fff";
      c.lineJoin = "round";
      c.lineCap = "round";
    }
    return [f, e] as const;
  }

  /** Copies the two scratch canvases into the next free cell */
  private commit(advance: number, color?: THREE.Color): Cell {
    const index = Math.min(this.next++, CELLS - 1);
    const cx = (index % COLS) * CELL_PX;
    const cy = Math.floor(index / COLS) * CELL_PX;
    const f = this.fill.getContext("2d")!.getImageData(0, 0, CELL_PX, CELL_PX).data;
    const e = this.edge.getContext("2d")!.getImageData(0, 0, CELL_PX, CELL_PX).data;
    for (let y = 0; y < CELL_PX; y++) {
      for (let x = 0; x < CELL_PX; x++) {
        const s = (y * CELL_PX + x) * 4 + 3;
        const d = ((cy + y) * ATLAS_PX + cx + x) * 4;
        this.data[d] = f[s];
        this.data[d + 1] = Math.max(f[s], e[s]);
        this.data[d + 2] = 0;
        this.data[d + 3] = 255;
      }
    }
    return { u: cx / ATLAS_PX, v: cy / ATLAS_PX, advance, color };
  }

  private drawChar(ch: string): Cell {
    const [f, e] = this.ctxs();
    for (const c of [f, e]) {
      c.font = FONT;
      c.textAlign = "center";
      c.textBaseline = "middle";
    }
    const mid = CELL_PX / 2;
    e.lineWidth = OUTLINE_PX;
    e.strokeText(ch, mid, mid + 2);
    f.fillText(ch, mid, mid + 2);
    const width = f.measureText(ch).width;
    return this.commit(ch === " " ? 0.32 : Math.min(1, (width + OUTLINE_PX * 0.55) / CELL_PX));
  }

  private drawIcon(icon: LucideIcon, color?: string): Cell {
    const [f, e] = this.ctxs();
    const path = iconPath(iconNodeOf(icon));
    const k = ICON_PX / 24;
    for (const c of [f, e]) c.setTransform(k, 0, 0, k, (CELL_PX - ICON_PX) / 2, (CELL_PX - ICON_PX) / 2);
    e.lineWidth = (OUTLINE_PX + 2.4 * k) / k;
    e.stroke(path);
    f.lineWidth = 2.4;
    f.stroke(path);
    return this.commit(0.86, new THREE.Color(ICON_COLOR[color ?? ""] ?? "#f8fafc"));
  }

  /** The cells of an entry's text in order; unknown characters are skipped */
  cellsOf(text: string): Cell[] {
    const out: Cell[] = [];
    let grew = false;
    for (const part of glyphParts(text)) {
      if (typeof part === "string") {
        for (const ch of part.replace(/️/g, "")) {
          const cell = this.chars.get(ch);
          if (cell) out.push(cell);
        }
        continue;
      }
      let cell = this.icons.get(part.icon);
      if (!cell) {
        cell = this.drawIcon(part.icon, part.color);
        this.icons.set(part.icon, cell);
        grew = true;
      }
      out.push(cell);
    }
    if (grew) this.texture.needsUpdate = true;
    return out;
  }

  dispose() {
    this.texture.dispose();
  }
}

/* ------------------------------------------------------------------------- */
/* The layer                                                                 */
/* ------------------------------------------------------------------------- */

const VERTEX = /* glsl */ `
attribute vec3 aAnchor;
attribute vec4 aGlyph;   // atlas u, v, the glyph's left edge (em from the entry's centre), size px
attribute vec3 aColor;
attribute vec4 aTime;    // start s, life s, rise px, spare
attribute vec2 aShift;   // px
attribute vec4 aApart;   // spot to keep apart from (xyz), min px (0: none)
uniform float uTime;
uniform vec2 uViewport;
uniform vec2 uFade;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

vec2 toPx(vec4 clip) {
  return clip.xy / max(clip.w, 0.0001) * 0.5 * uViewport;
}

void main() {
  vec4 view = modelViewMatrix * vec4(aAnchor, 1.0);
  float t = (uTime - aTime.x) / max(aTime.y, 0.001);
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, length(view.xyz));
  float alpha = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.7, 1.0, t)) * fade;
  vUv = vec2(0.0);
  vColor = vec3(0.0);
  vAlpha = 0.0;
  if (t < 0.0 || t > 1.0 || alpha <= 0.002 || view.z > -0.1) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float tc = clamp(t, 0.0, 1.0);
  float ease = 1.0 - (1.0 - tc) * (1.0 - tc);
  float pop = 1.0 + 0.4 * (1.0 - smoothstep(0.0, 0.12, tc));
  float size = aGlyph.w * pop;
  vec4 clip = projectionMatrix * view;
  vec2 px = (vec2(aGlyph.z, 0.0) + position.xy + vec2(0.5, 0.0)) * size + aShift + vec2(0.0, aTime.z * ease);
  if (aApart.w > 0.0) {
    vec4 other = projectionMatrix * modelViewMatrix * vec4(aApart.xyz, 1.0);
    vec2 d = toPx(clip) - toPx(other);
    float l = length(d);
    vec2 n = l > 0.5 ? d / max(l, 0.0001) : vec2(1.0, 0.0);
    px += n * max(aApart.w - l, 0.0) * 0.5;
  }
  clip.xy += px / (0.5 * uViewport) * clip.w;
  gl_Position = clip;
  vUv = aGlyph.xy + (position.xy * vec2(1.0, -1.0) + 0.5) * ${(CELL_PX / ATLAS_PX).toFixed(6)};
  vColor = aColor;
  vAlpha = alpha;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 s = texture2D(uAtlas, vUv);
  float a = clamp(s.g, 0.0, 1.0) * clamp(vAlpha, 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vec3(0.05, 0.035, 0.03), vColor, clamp(s.r, 0.0, 1.0)), a);
  #include <colorspace_fragment>
}
`;

const FLOATS = { aAnchor: 3, aGlyph: 4, aColor: 3, aTime: 4, aShift: 2, aApart: 4 } as const;
type AttrName = keyof typeof FLOATS;

function makeGeometry(capacity: number) {
  const g = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  g.index = quad.index;
  g.setAttribute("position", quad.getAttribute("position"));
  for (const [name, size] of Object.entries(FLOATS)) {
    g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(THREE.DynamicDrawUsage));
  }
  g.instanceCount = capacity;
  return g;
}

const _c = new THREE.Color();
const _v = new THREE.Vector3();

interface Live {
  x: number;
  y: number;
  z: number;
  end: number;
}

/**
 * Draws a store's entries. `fade` is the camera distance at which text starts to fade and where it is gone.
 * Mount one per view; anything in that view adds to its store.
 */
const DEFAULT_FADE: [number, number] = [140, 175];
/** The layers' clock starts here (seconds since, kept small for the shader's floats) */
const CLOCK0 = performance.now();

export function FloatingText({ store, fade = DEFAULT_FADE }: { store: FloatingTextStore; fade?: [number, number] }) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const atlas = useMemo(() => new GlyphAtlas(), []);
  useEffect(() => () => atlas.dispose(), [atlas]);
  const state = useRef({ capacity: 256, head: 0, ends: new Float32Array(256), live: [] as Live[], drawn: false });
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uAtlas: { value: atlas.texture },
          uTime: { value: 0 },
          uViewport: { value: new THREE.Vector2(1, 1) },
          uFade: { value: new THREE.Vector2(fade[0], fade[1]) }
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      }),
    [atlas] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => () => material.dispose(), [material]);
  const mesh = useMemo(() => {
    const m = new THREE.Mesh(makeGeometry(256), material);
    m.frustumCulled = false;
    m.raycast = () => null;
    return m;
  }, [material]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);

  // Its own transparent canvas over the view, stacked above the name cards (drei <Html>, up to z-index 30), so the
  // numbers are never hidden behind a label; it draws only this mesh, and never through bloom
  const overlay = useRef<{ canvas: HTMLCanvasElement; renderer: THREE.WebGLRenderer; scene: THREE.Scene } | null>(null);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:31";
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(mesh);
    gl.domElement.parentElement?.parentElement?.appendChild(canvas);
    overlay.current = { canvas, renderer, scene };
    return () => {
      overlay.current = null;
      scene.remove(mesh);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [gl, mesh]);
  useEffect(() => {
    material.uniforms.uFade.value.set(fade[0], fade[1]);
  }, [material, fade]);
  useEffect(() => {
    material.uniforms.uViewport.value.set(Math.max(1, size.width), Math.max(1, size.height));
    const o = overlay.current;
    if (!o) return;
    o.renderer.setPixelRatio(gl.getPixelRatio());
    o.renderer.setSize(Math.max(1, size.width), Math.max(1, size.height), false);
  }, [material, size, gl, mesh]);

  /** Bigger buffers (twice over) when entries still on screen would be overwritten; keeps what is there */
  const grow = (m: THREE.Mesh, need: number) => {
    const st = state.current;
    let cap = st.capacity;
    while (cap < need) cap *= 2;
    const g = makeGeometry(cap);
    const old = m.geometry as THREE.InstancedBufferGeometry;
    for (const name of Object.keys(FLOATS) as AttrName[]) {
      (g.getAttribute(name) as THREE.InstancedBufferAttribute).array.set((old.getAttribute(name) as THREE.InstancedBufferAttribute).array);
    }
    const ends = new Float32Array(cap);
    ends.set(st.ends);
    old.dispose();
    m.geometry = g;
    st.ends = ends;
    st.capacity = cap;
  };

  useFrame(({ camera }) => {
    const m = mesh;
    const st = state.current;
    const now = (performance.now() - CLOCK0) / 1000;
    material.uniforms.uTime.value = now;
    if (store.pending.length > 0) {
      const entries = store.pending.splice(0);
      const wall = Date.now();
      const laid = entries.map((e) => ({ e, cells: atlas.cellsOf(e.text) })).filter((l) => l.cells.length > 0);
      const glyphs = laid.reduce((n, l) => n + l.cells.length, 0);
      // Slots are a ring: the next ones must be free (their glyphs gone) or the buffers grow
      let busy = 0;
      for (let i = 0; i < Math.min(glyphs, st.capacity); i++) if (st.ends[(st.head + i) % st.capacity] > now) busy++;
      if (busy > 0 || glyphs > st.capacity) grow(m, Math.max(glyphs + st.capacity, st.capacity * 2));
      const g = m.geometry as THREE.InstancedBufferGeometry;
      const arr = Object.fromEntries((Object.keys(FLOATS) as AttrName[]).map((k) => [k, (g.getAttribute(k) as THREE.InstancedBufferAttribute).array as Float32Array])) as Record<AttrName, Float32Array>;
      for (const { e, cells } of laid) {
        const life = e.life ?? 2.6;
        const start = now + (e.delay ?? 0) - (e.at ? Math.max(0, (wall - e.at) / 1000) : 0);
        if (start + life <= now) continue;
        const px = e.size ?? 24;
        const tint = _c.set(e.color ?? "#f8fafc");
        const width = cells.reduce((w, c) => w + c.advance, 0);
        let pen = -width / 2;
        for (const cell of cells) {
          const i = st.head;
          st.head = (st.head + 1) % st.capacity;
          const col = cell.color ?? tint;
          // A glyph's quad is one em wide, centred on its advance
          arr.aAnchor.set([e.x, e.y, e.z], i * 3);
          arr.aGlyph.set([cell.u, cell.v, pen + cell.advance / 2 - 0.5, px], i * 4);
          arr.aColor.set([col.r, col.g, col.b], i * 3);
          arr.aTime.set([start, life, e.rise ?? 56, 0], i * 4);
          arr.aShift.set([e.dx ?? 0, e.dy ?? 0], i * 2);
          arr.aApart.set(e.apart ? [e.apart.x, e.apart.y, e.apart.z, e.apart.px] : [0, 0, 0, 0], i * 4);
          st.ends[i] = start + life;
          pen += cell.advance;
        }
        st.live.push({ x: e.x, y: e.y, z: e.z, end: start + life });
      }
      for (const k of Object.keys(FLOATS) as AttrName[]) (g.getAttribute(k) as THREE.InstancedBufferAttribute).needsUpdate = true;
    }

    // Draw only while something is up and within reach of the camera; clear once when the last one is gone
    st.live = st.live.filter((l) => l.end > now);
    const reach = fade[1];
    const show = st.live.some((l) => camera.position.distanceTo(_v.set(l.x, l.y, l.z)) < reach);
    const o = overlay.current;
    if (!o) return;
    if (show) {
      camera.updateMatrixWorld();
      o.renderer.render(o.scene, camera);
    } else if (st.drawn) {
      o.renderer.clear();
    }
    st.drawn = show;
  });

  return null;
}
