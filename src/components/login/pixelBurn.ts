/* ------------------------------------------------------------------------- */
/* The login screen's pixel-fire reveal: the black burns away from the       */
/* centre in jagged veins. Square pixels at any screen shape; ahead of the   */
/* front the black chars and heats from steel to cyan, the front itself is   */
/* white-hot, and behind it the pixels cool through cyan to violet and fall  */
/* apart one by one. A soft glow bleeds from the front into the black, a     */
/* pixel shockwave runs out ahead of it at the start, and sparks with trails */
/* fly off the edge. Painted into a small buffer (a few sub-pixels a cell)   */
/* and scaled up crisp, so a frame is one image, not thousands of rects.     */
/* ------------------------------------------------------------------------- */

/** Screen pixels a cell, roughly (the grid fits the screen with square cells) */
const CELL = 12;
/** Sub-pixels a cell in the paint buffer: the gaps between pixels and shrinking embers are drawn in these */
const SUB = 4;
const MAX_SPARKS = 260;

interface Cell {
  c: number;
  r: number;
  nx: number;
  ny: number;
  /** Distance from the centre, 0.57 at the corners whatever the screen's shape */
  dist: number;
  threshold: number;
  phase: number;
  /** When it drops out as an ember (0–1) */
  crumble: number;
}

interface Spark {
  x: number;
  y: number;
  /** Where it was the last two frames (its trail) */
  tx: [number, number, number, number];
  vx: number;
  vy: number;
  /** In sub-pixels */
  size: number;
  life: number;
  decay: number;
}

/** 0xAABBGGRR, as a little-endian Uint32 over RGBA bytes */
const pack = (r: number, g: number, b: number, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** A colour ramp through the given stops, `n` steps */
function ramp(stops: string[], n: number): Array<[number, number, number]> {
  const cs = stops.map(hex);
  return Array.from({ length: n }, (_, i) => {
    const u = (i / (n - 1)) * (cs.length - 1);
    const k = Math.min(cs.length - 2, Math.floor(u));
    const f = u - k;
    return [0, 1, 2].map((j) => Math.round(cs[k][j] + (cs[k + 1][j] - cs[k][j]) * f)) as [number, number, number];
  });
}

const BLACK = pack(0, 0, 0);
const CHAR = [pack(...hex("#070b18")), pack(...hex("#0c1428"))];
/** Ahead of the front: charred navy heating through steel to cyan */
const HEAT = ramp(["#111a33", "#334155", "#38bdf8", "#bae6fd"], 16);
/** Behind the front: cooling from pale cyan through cyan to violet (the white is the front's alone) */
const EMBER = ramp(["#a5f3fc", "#22d3ee", "#a78bfa", "#7e22ce"], 16);
const HOT = [pack(255, 255, 255), pack(...hex("#e0f2fe"))];
const RING = hex("#a5f3fc");

const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

export class PixelBurn {
  private cols = 0;
  private rows = 0;
  private cells: Cell[] = [];
  private sparks: Spark[] = [];
  private buf = document.createElement("canvas");
  private glow = document.createElement("canvas");
  private img: ImageData | null = null;
  private px = new Uint32Array(0);
  private glowImg: ImageData | null = null;
  private glowPx = new Uint32Array(0);
  private lastT = -1;

  /** No sparks left in the air (once fully burnt, nothing more to paint) */
  get idle() {
    return this.sparks.length === 0;
  }

  /** Fits the grid to the screen (square cells, about CELL pixels) and deals fresh veins */
  resize(w: number, h: number) {
    // A hidden window has no size, so no grid can fit it: the next resize deals one
    if (w <= 0 || h <= 0) return;
    this.cols =Math.max(24, Math.min(200, Math.round(w / CELL)));
    this.rows = Math.max(24, Math.min(200, Math.round((h / w) * this.cols)));
    this.buf.width = this.cols * SUB;
    this.buf.height = this.rows * SUB;
    this.glow.width = this.cols;
    this.glow.height = this.rows;
    const bctx = this.buf.getContext("2d");
    const gctx = this.glow.getContext("2d");
    this.img = bctx ? bctx.createImageData(this.buf.width, this.buf.height) : null;
    this.px = this.img ? new Uint32Array(this.img.data.buffer) : new Uint32Array(0);
    this.glowImg = gctx ? gctx.createImageData(this.cols, this.rows) : null;
    this.glowPx = this.glowImg ? new Uint32Array(this.glowImg.data.buffer) : new Uint32Array(0);
    this.reseed();
  }

  /** New veins for the next reveal: each cell burns at its distance plus noise */
  reseed() {
    const { cols, rows } = this;
    const aspect = rows / cols;
    // Half the screen's diagonal maps to 0.57, as on a 16:9 screen, so the reveal takes as long on any shape
    const norm = 0.57 / Math.hypot(0.5, 0.5 * aspect);
    const cells: Cell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nx = (c + 0.5) / cols - 0.5;
        const ny = ((r + 0.5) / rows - 0.5) * aspect;
        const dist = Math.hypot(nx, ny) * norm;
        const angle = Math.atan2(ny, nx);
        const noise =
          Math.sin(angle * 7) * 0.045 +
          Math.cos(angle * 13 + dist * 18) * 0.035 +
          Math.sin(nx * 54) * Math.cos(ny * 54) * 0.065 +
          Math.sin(nx * 156 - ny * 133) * 0.03 +
          (Math.random() - 0.5) * 0.04;
        cells.push({ c, r, nx, ny, dist, threshold: Math.max(0.005, dist + noise), phase: Math.random() * Math.PI * 2, crumble: Math.random() });
      }
    }
    this.cells = cells;
  }

  /** Fills a cell's block in the buffer, `inset` sub-pixels in from its left and top and `gap` short of its right and bottom */
  private block(c: number, r: number, color: number, inset = 0, gap = 1) {
    const W = this.cols * SUB;
    const x0 = c * SUB + inset;
    const x1 = c * SUB + SUB - Math.max(gap, inset);
    for (let y = r * SUB + inset; y < r * SUB + SUB - Math.max(gap, inset); y++) this.px.fill(color, y * W + x0, y * W + x1);
  }

  /**
   * Paints the mask for `burn` (0 all black … ~1 all clear) and `black` (a black fade over everything) at loop time `t`
   */
  draw(ctx: CanvasRenderingContext2D, burn: number, black: number, t: number) {
    const { width: w, height: h } = ctx.canvas;
    if (!this.cols || this.buf.width !== this.cols * SUB) this.resize(w, h);
    const dt = this.lastT < 0 || t < this.lastT ? 1 / 60 : Math.min(0.05, t - this.lastT);
    this.lastT = t;
    ctx.clearRect(0, 0, w, h);
    if (black >= 0.99) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      this.sparks.length = 0;
      return;
    }
    const cw = w / this.cols;
    const ch = h / this.rows;

    // The first light: a cold flash where the black first breaks
    if (burn > 0 && burn < 0.35) {
      const a = (1 - burn / 0.35) * 0.95;
      const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, Math.max(w, h) * 0.32);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.4, `rgba(186,230,253,${a * 0.8})`);
      g.addColorStop(0.75, `rgba(167,139,250,${a * 0.3})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    if (burn < 0.95 && this.img && this.glowImg) {
      this.px.fill(0);
      this.glowPx.fill(0);
      // A pixel shockwave running out ahead of the front while it is young
      const ringR = 0.06 + burn * 1.3;
      const ringA = burn < 0.6 ? 1 - burn / 0.6 : 0;
      for (const cell of this.cells) {
        const diff = burn + Math.sin(t * 28 + cell.phase) * 0.008 - cell.threshold;
        const gi = cell.r * this.cols + cell.c;
        const odd = (cell.c + cell.r) & 1;
        if (diff < -0.06) {
          const ring = ringA > 0 ? Math.max(0, 1 - Math.abs(cell.dist - ringR) / 0.012) * ringA : 0;
          if (ring > 0.15) {
            const k = Math.min(1, ring);
            this.block(cell.c, cell.r, BLACK, 0, 0);
            this.block(cell.c, cell.r, pack(RING[0], RING[1], RING[2], Math.round(255 * k)), 0, 1);
            this.glowPx[gi] = pack(RING[0], RING[1], RING[2], Math.round(150 * k));
          } else this.block(cell.c, cell.r, BLACK, 0, 0);
        } else if (diff < -0.032) {
          // Charred: dark navy, dithered
          this.block(cell.c, cell.r, CHAR[odd], 0, 0);
        } else if (diff < -0.008) {
          // Heating towards the front
          const k = clamp01((diff + 0.032) / 0.024);
          const [r, g, b] = HEAT[Math.min(15, Math.round(k * 15 - odd * 2 + 1))] ?? HEAT[0];
          this.block(cell.c, cell.r, BLACK, 0, 0);
          this.block(cell.c, cell.r, pack(r, g, b), 0, 1);
          this.glowPx[gi] = pack(56, 189, 248, Math.round(90 * k));
        } else if (diff < 0.022) {
          // The white-hot front
          this.block(cell.c, cell.r, HOT[cell.phase > 3 ? 0 : 1], 0, 1);
          this.glowPx[gi] = pack(224, 242, 254, 235);
          if (Math.random() < 0.024 && this.sparks.length < MAX_SPARKS) this.spark(cell, cw, ch);
        } else if (diff < 0.12) {
          // Embers cooling behind it, each falling apart at its own moment
          const k = (diff - 0.022) / 0.098;
          if (cell.crumble < k * 1.25) continue;
          const [r, g, b] = EMBER[Math.min(15, Math.round(k * 15))];
          const inset = k < 0.35 ? 0 : 1;
          this.block(cell.c, cell.r, pack(r, g, b, Math.round(255 * (1 - k * 0.55))), inset, 1);
          this.glowPx[gi] = pack(r, g, b, Math.round(120 * (1 - k)));
        }
      }
      this.buf.getContext("2d")!.putImageData(this.img, 0, 0);
      this.glow.getContext("2d")!.putImageData(this.glowImg, 0, 0);
      // Crisp pixels…
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.buf, 0, 0, w, h);
      // …under a soft glow bleeding from the front into the black (scaled up smooth, blurred where the browser can)
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = "lighter";
      const blur = "filter" in ctx;
      if (blur) ctx.filter = `blur(${Math.round(Math.max(cw, ch) * 0.9)}px)`;
      ctx.drawImage(this.glow, 0, 0, w, h);
      if (blur) ctx.filter = "none";
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.glow, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    this.drawSparks(ctx, dt, cw / SUB, ch / SUB);
    ctx.globalCompositeOperation = "source-over";
    if (black > 0) {
      ctx.fillStyle = `rgba(0,0,0,${black})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** A spark off the front, flying outward (and a little up), snapped to the pixel grid as it flies */
  private spark(cell: Cell, cw: number, ch: number) {
    const x = (cell.c + 0.5) * cw;
    const y = (cell.r + 0.5) * ch;
    const len = Math.hypot(cell.nx, cell.ny) || 1;
    const speed = 180 + Math.random() * 260;
    this.sparks.push({
      x,
      y,
      tx: [x, y, x, y],
      vx: (cell.nx / len) * speed + (Math.random() - 0.5) * 90,
      vy: (cell.ny / len) * speed - 40 - Math.random() * 90,
      size: Math.random() < 0.18 ? 3 : 1 + Math.round(Math.random()),
      life: 1,
      decay: 1.1 + Math.random() * 1.2
    });
  }

  private drawSparks(ctx: CanvasRenderingContext2D, dt: number, sx: number, sy: number) {
    ctx.globalCompositeOperation = "lighter";
    const snap = (v: number, s: number) => Math.round(v / s) * s;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.tx = [s.x, s.y, s.tx[0], s.tx[1]];
      s.vx *= 1 - dt * 1.4;
      s.vy = s.vy * (1 - dt * 1.4) + 60 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= s.decay * dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      // White-hot, then cyan, then violet as it dies
      ctx.fillStyle = s.life > 0.65 ? "#ffffff" : s.life > 0.35 ? "#67e8f9" : "#a78bfa";
      const pw = Math.max(2, s.size * sx);
      const ph = Math.max(2, s.size * sy);
      const pts: Array<[number, number, number]> = [
        [s.tx[2], s.tx[3], 0.25],
        [s.tx[0], s.tx[1], 0.5],
        [s.x, s.y, 1]
      ];
      for (const [x, y, a] of pts) {
        ctx.globalAlpha = Math.min(1, s.life * 1.4) * a;
        ctx.fillRect(snap(x - pw / 2, sx), snap(y - ph / 2, sy), pw, ph);
      }
    }
    ctx.globalAlpha = 1;
  }
}
