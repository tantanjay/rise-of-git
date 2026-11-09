import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/*
 * Keeps the view's drei <Html> labels sharp after a zoom.
 *
 * Every label sits on its own compositor layer (`will-change: transform`, .scene-labels in index.css), so a camera
 * move is a cheap transform instead of a page repaint. But Chrome rasterises such a layer once and keeps that raster
 * while its scale changes: drei scales a label by distance (distanceFactor), so after zooming in the label is the old
 * small raster stretched up, blurry until something re-creates its layer (hovering it did). Repainting its content
 * doesn't help; dropping `will-change` for one frame does.
 *
 * So once the camera has been still for SETTLE_MS, each label on screen that has grown past GROW × the scale it was
 * last rasterised at gets `will-change: auto` for one frame and its layer back the next, which rasterises it at its
 * new scale. A dropped label is painted into the page for that frame, so a few go per frame (BATCH, biggest first):
 * the whole set at the overview costs ~100 ms in one frame, a batch a few ms. Zooming out needs nothing (a bigger
 * raster drawn smaller stays sharp), and labels off screen wait until they are on screen after a later stop.
 */

const SETTLE_MS = 150;
/** Camera matrix change that counts as a move (OrbitControls damping creeps on in ever tinier steps) */
const STILL = 1e-4;
const GROW = 1.1;
const BATCH = 6;
const SCALE_RE = /scale\(([\d.e+-]+)\)/;

const scaleOf = (el: HTMLElement) => {
  const m = SCALE_RE.exec(el.style.transform);
  return m ? parseFloat(m[1]) : 1;
};

export function CrispLabels() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const st = useRef({
    view: new Float64Array(16),
    w: 0,
    h: 0,
    zoom: 1,
    movedAt: -1,
    /** Scale each label was last rasterised at by us (unknown for a new label: it is redrawn at the first stop) */
    raster: new WeakMap<HTMLElement, number>(),
    queue: [] as HTMLElement[],
    dropped: [] as HTMLElement[],
  });

  useFrame(() => {
    const s = st.current;
    const now = performance.now();

    // Labels dropped last frame get their layer back, now rasterised at their current scale
    for (const el of s.dropped) {
      el.style.willChange = "";
      s.raster.set(el, scaleOf(el));
    }
    s.dropped.length = 0;

    // Has the camera (or the canvas size) changed since last frame?
    const e = camera.matrixWorld.elements;
    let moved = s.w !== size.width || s.h !== size.height || s.zoom !== camera.zoom;
    for (let i = 0; i < 16 && !moved; i++) moved = Math.abs(s.view[i] - e[i]) > STILL;
    if (moved) {
      s.view.set(e);
      s.w = size.width;
      s.h = size.height;
      s.zoom = camera.zoom;
      s.movedAt = now;
      s.queue.length = 0; // moving again: whatever was waiting is measured afresh at the next stop
      return;
    }

    if (s.movedAt >= 0 && now - s.movedAt >= SETTLE_MS) {
      s.movedAt = -1;
      const root = gl.domElement.closest(".scene-labels");
      if (!root) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const grown: [HTMLElement, number][] = [];
      // Every child after the canvas's own wrapper is a drei label
      for (let el = root.firstElementChild?.nextElementSibling as HTMLElement | null; el; el = el.nextElementSibling as HTMLElement | null) {
        if (el.style.display === "none") continue;
        const scale = scaleOf(el);
        const was = s.raster.get(el);
        if (was !== undefined && scale <= was * GROW) continue;
        // drei's wrapper is 0×0 (the label overflows it): measure what it holds
        const r = (el.firstElementChild ?? el).getBoundingClientRect();
        if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh || r.width === 0) continue;
        grown.push([el, scale]);
      }
      grown.sort((a, b) => b[1] - a[1]);
      s.queue = grown.map(([el]) => el);
    }

    // Drop a batch of grown labels off their layers for this one frame
    for (let i = 0; i < BATCH && s.queue.length; i++) {
      const el = s.queue.shift()!;
      if (!el.isConnected) continue;
      el.style.willChange = "auto";
      s.dropped.push(el);
    }
  });

  return null;
}
