import { LandmarkState } from "@/types";
import { mulberry32, rngFor } from "@/utils/random";
import { Builder, IDLE_KIND, Part, emptyScene } from "@/components/3d/city/parts";
import { MAGICAL_LANDMARK_TYPES } from "./landmarks";

/**
 * Rotation day for the epic landmarks: the arriving one rises and the leaving one crumbles. Neither state is
 * modelled by hand: both are generated from the finished model's part list, so every design gets them for free.
 *
 * - Rising: only the parts below a cut that climbs through the day stand (parts crossing it are cut off flat),
 *   inside scaffolding with a slewing crane, stone blocks and lumber piles. Magical sites are shaped instead: the
 *   missing stones float round the site with a shimmer, waiting to drift into place.
 * - Crumbling: parts tilt, sink and fade toward stone grey, the high ones fall first and lie as rubble, lights go
 *   out, orbiting stones drop to the ground, and dust rises.
 *
 * Both advance in LANDMARK_STEPS steps over the day (the step is part of the model, so shadows redraw only then).
 */

/** Steps a rotation day is cut into: the model changes this many times, never per frame */
export const LANDMARK_STEPS = 10;

/** Which step of its rotation day a rising / crumbling landmark is on at `now` (0 … LANDMARK_STEPS − 1) */
export function landmarkStepOf(state: LandmarkState, now: number): number {
  const t = (now - state.from) / Math.max(1, state.until - state.from);
  return Math.max(0, Math.min(LANDMARK_STEPS - 1, Math.floor(t * LANDMARK_STEPS)));
}

/** The line a rising / crumbling landmark shows on its hover card and panel */
export function landmarkStateLabel(state: LandmarkState, now: number, realm = false): string {
  const hours = Math.ceil((state.until - now) / 3_600_000);
  const left = hours <= 1 ? "within the hour" : `in ${hours} h`;
  // A buffer realm being built up is shielded; one crumbling away is leaving the realm
  if (realm) return state.phase === "rising" ? `🛡️ Building up, shielded — ready ${left}` : `🏚️ Leaving the realm — gone ${left}`;
  return state.phase === "rising" ? `🏗️ Rising — complete ${left}` : `🏚️ Falling to ruin — gone ${left}`;
}

/** Share of the way (never 0 or 1: a rising site always shows something, a crumbling one something left) */
const progressOf = (step: number) => (step + 1) / (LANDMARK_STEPS + 1);

const WOOD = "#a16207";
const DARK_WOOD = "#78350f";
const STONE_BLOCK = "#d6d3d1";
const RUBBLE = ["#78716c", "#57534e", "#a8a29e"];
const DUST = "#c8b8a0";

const bottomOf = (p: Part) => p.y - p.h / 2;
const topOf = (p: Part) => p.y + p.h / 2;
/** Discs, pads and water the model stands on: never cut, never fall */
const isGround = (p: Part) => topOf(p) <= 0.4 && Math.max(p.w, p.d) >= 2.4;
const unrotated = (p: Part) => !p.rx && !p.rz;
/** Drawn in Normal (an HD-only part never moves, cuts or seeds anything Normal shows) */
const inNormal = (p: Part) => p.hd !== true;

/**
 * Seeds for a model's parts: each Normal part by its place among the Normal parts and each HD-only part by its place
 * among those, from a salt of its own, so HD detail never changes how the Normal model rises, crumbles or breaks
 */
function partSeeds(parts: Part[], salt: number): Array<() => number> {
  let n = 0;
  let h = 0;
  return parts.map((q) => (inNormal(q) ? mulberry32(n++ * 2654435761 + salt) : mulberry32(h++ * 2654435761 + (salt ^ 0x5bd1e995))));
}

/** How far the model reaches from its centre on the ground (scaffolding and rubble go round it) */
function reachOf(parts: Part[]): number {
  let r = 0;
  for (const p of parts) if (!isGround(p) && inNormal(p)) r = Math.max(r, Math.hypot(p.x, p.z) + Math.max(p.w, p.d) / 2);
  return Math.min(3.4, Math.max(1.6, r));
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/**
 * The model as it stands on this step of its rotation day. Rising, the first `finished` parts already stand (a buffer
 * realm's earlier stage) and only the rest is built up.
 */
export function stageLandmark(id: string, type: string, parts: Part[], state: LandmarkState, step: number, finished = 0): Part[] {
  return state.phase === "rising" ? rising(id, type, parts, progressOf(step), finished) : crumbling(id, parts, progressOf(step));
}

function rising(id: string, type: string, parts: Part[], p: number, finished = 0): Part[] {
  const fresh = parts.slice(finished);
  const top = Math.max(1, ...fresh.filter((q) => !isGround(q) && inNormal(q)).map(topOf));
  const cut = Math.max(0.35, top * p);
  const magical = MAGICAL_LANDMARK_TYPES.has(type);
  const kept: Part[] = parts.slice(0, finished);
  const missing: Part[] = [];
  for (const q of fresh) {
    if (isGround(q)) {
      kept.push(q);
      continue;
    }
    // Nothing works yet: no smoke from the chimneys, no lights (magic sites keep their glow)
    const part: Part = { ...q, glow: magical ? q.glow : false, idle: q.idle?.kind === IDLE_KIND.smoke || q.idle?.kind === IDLE_KIND.spin ? undefined : q.idle };
    if (q.idle?.kind === IDLE_KIND.smoke) continue;
    if (bottomOf(q) >= cut) {
      if (inNormal(q)) missing.push(q);
      continue;
    }
    if (topOf(q) <= cut) {
      kept.push(part);
    } else if ((q.shape === "box" || q.shape === "cyl" || q.shape === "block" || q.shape === "trunk") && unrotated(q)) {
      // Cut off flat at today's height: the course of stone being laid
      const h = cut - bottomOf(q);
      kept.push({ ...part, h, y: bottomOf(q) + h / 2 });
    } else if (q.y < cut) {
      kept.push(part);
    } else if (inNormal(q)) missing.push(q);
  }

  const out = emptyScene();
  out.parts = kept;
  const b = new Builder(out);
  const rng = rngFor(`${id}:rise`);
  const r = reachOf(parts);

  if (magical) {
    // The missing stones float round the site, waiting to drift into place, with motes of shimmer between them
    const floating = missing.filter((q) => !q.glow).slice(0, 8);
    floating.forEach((q, i) => {
      const a = (i / Math.max(1, floating.length)) * Math.PI * 2;
      const s = Math.min(1, 1.1 / Math.max(q.w, q.h, q.d));
      b.add(q.shape, Math.cos(a) * r * 0.95, cut + 0.5 + (i % 3) * 0.55, Math.sin(a) * r * 0.95, q.w * s, q.h * s, q.d * s, q.color, {
        ry: rng() * Math.PI,
        idle: IDLE_KIND.spin,
        pivot: [0, 0],
        phase: 0.01
      });
    });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      b.add("octa", Math.cos(a) * r * 0.7, cut + 0.2 + rng() * 1.6, Math.sin(a) * r * 0.7, 0.16, 0.24, 0.16, "#e0e7ff", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i });
    }
    return out.parts;
  }

  // Scaffolding round the rising walls: poles up past today's course, plank decks every metre
  const poles = 6;
  const height = cut + 0.7;
  const ring = r * 0.92;
  for (let i = 0; i < poles; i++) {
    const a = (i / poles) * Math.PI * 2 + 0.3;
    b.add("cyl", Math.cos(a) * ring, 0, Math.sin(a) * ring, 0.09, height, 0.09, WOOD);
  }
  for (let y = 0.9; y < height - 0.15; y += 1.0) {
    for (let i = 0; i < poles; i++) {
      const a0 = (i / poles) * Math.PI * 2 + 0.3;
      const a1 = ((i + 1) / poles) * Math.PI * 2 + 0.3;
      const [x0, z0, x1, z1] = [Math.cos(a0) * ring, Math.sin(a0) * ring, Math.cos(a1) * ring, Math.sin(a1) * ring];
      b.add("box", (x0 + x1) / 2, y, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0), 0.06, 0.32, DARK_WOOD, { ry: -Math.atan2(z1 - z0, x1 - x0) });
    }
  }
  // A crane beside it slews round, a stone block swinging from its arm
  const cx = r + 0.9;
  const craneH = top + 1.2;
  b.add("cyl", cx, 0, 0, 0.16, craneH, 0.16, DARK_WOOD);
  b.add("box", cx - 1.3, craneH, 0, 2.8, 0.14, 0.14, WOOD, { idle: IDLE_KIND.spin, pivot: [cx, 0], phase: 0.01 });
  b.add("cyl", cx - 2.4, craneH - 1.1, 0, 0.03, 1.1, 0.03, "#44403c", { idle: IDLE_KIND.spin, pivot: [cx, 0], phase: 0.01 });
  b.add("box", cx - 2.4, craneH - 1.45, 0, 0.4, 0.35, 0.4, STONE_BLOCK, { idle: IDLE_KIND.spin, pivot: [cx, 0], phase: 0.01 });
  // Stone blocks and lumber waiting at the edge of the site
  const yard = mulberry32(Math.floor(rng() * 1e9));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 0.75 + i * 0.35;
    const x = Math.cos(a) * (r + 0.7);
    const z = Math.sin(a) * (r + 0.7);
    if (i % 2) {
      for (let k = 0; k < 3; k++) b.add("cyl", x, 0.08 + k * 0.11 - 0.45, z + (k - 1) * 0.12, 0.16, 0.9, 0.16, DARK_WOOD, { rz: Math.PI / 2, ry: a }); // lumber, lying stacked
    } else {
      b.add("box", x, 0, z, 0.45, 0.35, 0.45, STONE_BLOCK, { ry: yard() * 1.5 });
      b.add("box", x + 0.1, 0.35, z, 0.4, 0.3, 0.4, STONE_BLOCK, { ry: yard() * 1.5 });
    }
  }
  return out.parts;
}

function crumbling(id: string, parts: Part[], d: number): Part[] {
  const top = Math.max(1, ...parts.filter((q) => !isGround(q) && inNormal(q)).map(topOf));
  const out = emptyScene();
  const b = new Builder(out);
  const r = reachOf(parts);
  const fallen: Part[] = [];
  const seeds = partSeeds(parts, Math.floor(rngFor(`${id}:ruin`)() * 1e9));
  parts.forEach((q, i) => {
    if (isGround(q)) {
      out.parts.push(q);
      return;
    }
    // Each part has its own moment to fall (fixed per site, so the ruin only ever gets worse); high parts go first
    const rand = seeds[i];
    const fallAt = 0.2 + rand() * 0.9 - 0.45 * (bottomOf(q) / top);
    if (q.idle?.kind === IDLE_KIND.smoke) return; // the fires are out
    if (d > fallAt && bottomOf(q) > 0.05) {
      // HD detail that falls is simply gone (the rubble comes from the Normal parts)
      if (inNormal(q)) fallen.push(q);
      return;
    }
    const tilt = d * 0.45;
    const tall = q.h > 0.5;
    const sink = tall ? d * 0.25 * rand() * q.h : 0;
    // Orbiting stones and runes drop out of the air to the ground (HD detail riding them, a bird's wings, a lantern's
    // frame, is simply gone)
    const dropped = q.idle?.kind === IDLE_KIND.spin;
    if (dropped && !inNormal(q)) return;
    const lightsOut = q.glow && rand() < d;
    out.parts.push({
      ...q,
      y: dropped ? q.h / 2 : q.y - sink,
      rx: (q.rx ?? 0) + (tall ? (rand() - 0.5) * tilt : 0),
      rz: (q.rz ?? 0) + (tall ? (rand() - 0.5) * tilt : 0),
      color: lightsOut ? "#3f3f46" : q.glow ? q.color : mix(q.color, "#6b6259", 0.45 * d),
      glow: q.glow && !lightsOut,
      // What still glows flickers
      idle: dropped ? undefined : q.glow && !lightsOut ? { x: q.x, y: q.y, z: q.z, kind: IDLE_KIND.pulse, phase: rand() * 6 } : q.idle
    });
  });
  // Rubble where the fallen parts came down, and more of it as the day goes on
  const rng = rngFor(`${id}:rubble`);
  const heaps = Math.min(10, 2 + fallen.length);
  for (let i = 0; i < heaps; i++) {
    const src = fallen[i % Math.max(1, fallen.length)];
    const a = rng() * Math.PI * 2;
    const dist = src ? Math.min(r, Math.hypot(src.x, src.z) + 0.6) : r * rng();
    const x = src && i < fallen.length ? src.x + Math.cos(a) * 0.6 : Math.cos(a) * dist;
    const z = src && i < fallen.length ? src.z + Math.sin(a) * 0.6 : Math.sin(a) * dist;
    const s = 0.4 + rng() * 0.5;
    b.add("sphere", x, -0.1, z, s * 1.4, s * 0.6, s * 1.2, src && i < fallen.length ? mix(src.glow ? "#57534e" : src.color, "#6b6259", 0.5) : RUBBLE[i % RUBBLE.length]);
    b.add("box", x + 0.3, 0, z - 0.2, s * 0.5, s * 0.35, s * 0.4, RUBBLE[(i + 1) % RUBBLE.length], { ry: rng() * 3, rz: 0.3 });
  }
  // Broken pillars of the fallen: a stump where a tall part stood
  for (const q of fallen.slice(0, 4)) {
    if (q.shape !== "cyl" && q.shape !== "box") continue;
    if (q.h < 0.8 || bottomOf(q) > 0.6) continue;
    const h = q.h * 0.3;
    out.parts.push({ ...q, glow: false, idle: undefined, h, y: bottomOf(q) + h / 2, color: mix(q.color, "#6b6259", 0.5) });
  }
  // Dust rising off the ruin
  for (let i = 0; i < 2; i++) {
    const a = rng() * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      b.add("sphere", Math.cos(a) * r * 0.5, 0.2, Math.sin(a) * r * 0.5, 0.7, 0.6, 0.7, DUST, { idle: IDLE_KIND.smoke, phase: 0.01 + i * 1.3 + (k * Math.PI * 2) / 3 });
    }
  }
  return out.parts;
}

/** Half-width of the passage through a gatehouse (local x, before the gate is turned to face the Voidrift) */
const GATE_PASSAGE = 1.25;
const CHAR = "#2a211c";

/** Stumps left of a broken structure stand at most this high over the ground */
const STUMP_MIN = 0.35;
const STUMP_MAX = 1.1;

/**
 * Knocks a structure down to charred stumps: everything resting high up (merlons, roofs, crowns, skulls, tower tops)
 * has fallen and lies as rubble at its foot, every wall, tower and post is snapped off at a seeded height just over
 * the ground, tall leaning or round parts are gone, banners have burnt away and the lights are out (a few glow on as
 * embers). `floorAt` is the ground under a part. Fixed per id, so the ruin looks the same on every load.
 */
export function breakDown(id: string, parts: Part[], floorAt: (p: Part) => number): Part[] {
  const out = emptyScene();
  const b = new Builder(out);
  const seeds = partSeeds(parts, Math.floor(rngFor(`${id}:down`)() * 1e9));
  let heaps = 0;
  parts.forEach((q, i) => {
    if (isGround(q)) {
      out.parts.push(q);
      return;
    }
    const rand = seeds[i];
    const floor = floorAt(q);
    const rubble = () => {
      // Fallen HD detail is simply gone (the rubble comes from the Normal parts)
      if (!inNormal(q) || heaps++ >= 14 || rand() < 0.4) return;
      const s = Math.min(1.1, 0.35 + Math.max(q.w, q.d) * 0.3);
      b.add("sphere", q.x + (rand() - 0.5) * 0.8, floor - 0.12, q.z + (rand() - 0.5) * 0.8, s * 1.3, s * 0.5, s * 1.1, mix(q.glow ? "#57534e" : q.color, CHAR, 0.6));
    };
    // Smoke (FireFx brings its own), flags and pennants: burnt away
    if (q.idle?.kind === IDLE_KIND.smoke || q.idle?.kind === IDLE_KIND.flutter) return;
    // Resting high up: fallen
    if (bottomOf(q) - floor > 0.8) return rubble();
    const cap = floor + STUMP_MIN + rand() * (STUMP_MAX - STUMP_MIN);
    let part: Part = q;
    if (topOf(q) > cap) {
      if ((q.shape === "box" || q.shape === "cyl" || q.shape === "block" || q.shape === "trunk") && unrotated(q)) {
        // Snapped off, a little askew
        const h = cap - bottomOf(q);
        part = { ...q, h, y: bottomOf(q) + h / 2, rx: (rand() - 0.5) * 0.12, rz: (rand() - 0.5) * 0.12 };
      } else return rubble();
    }
    const ember = part.glow && rand() < 0.3;
    out.parts.push({
      ...part,
      color: ember ? "#f97316" : part.glow ? "#3f3f46" : mix(part.color, CHAR, 0.6),
      glow: ember,
      idle: ember ? { x: part.x, y: part.y, z: part.z, kind: IDLE_KIND.pulse, phase: rand() * 6 } : undefined
    });
  });
  return out.parts;
}

/**
 * A frontier gate whose walls burn: broken open so the road lies free. Built from the standing gate's part list
 * (unturned, front +z), so every gate design gets it: whatever filled the passage (door, portcullis, arch, skull,
 * the joined crown) is gone, a wide rock face or wall is split round the gap, the rest is knocked down to charred
 * stumps and rubble (`breakDown`), and the smashed door lies in pieces on the road.
 */
export function ruinGate(id: string, parts: Part[]): Part[] {
  const open: Part[] = [];
  for (const q of parts) {
    if (isGround(q)) {
      open.push(q);
      continue;
    }
    const left = q.x - q.w / 2;
    const right = q.x + q.w / 2;
    const inGap = Math.abs(q.x) < GATE_PASSAGE || (left < 0 && right > 0);
    if (!inGap) {
      open.push(q);
      continue;
    }
    // A wide face spanning the passage is split: what stands either side of the breach stays
    if (q.shape === "box" && unrotated(q) && q.w > GATE_PASSAGE * 3) {
      const lw = -GATE_PASSAGE - left;
      const rw = right - GATE_PASSAGE;
      if (lw > 0.3) open.push({ ...q, x: left + lw / 2, w: lw });
      if (rw > 0.3) open.push({ ...q, x: GATE_PASSAGE + rw / 2, w: rw });
    }
  }
  const floor = Math.max(0, ...parts.filter((q) => isGround(q) && inNormal(q)).map(topOf));
  const out = emptyScene();
  out.parts = breakDown(`${id}:gate`, open, () => floor);
  const b = new Builder(out);
  const rng = rngFor(`${id}:breach`);
  // The smashed door: planks and slabs flung across the road, charred
  for (let i = 0; i < 5; i++) {
    const x = (rng() - 0.5) * GATE_PASSAGE * 1.6;
    const z = 0.6 + rng() * 1.6;
    b.add("box", x, floor, z, 0.35 + rng() * 0.6, 0.12, 0.9 + rng() * 0.8, i % 2 ? "#3b2a1e" : CHAR, { ry: rng() * Math.PI, rz: (rng() - 0.5) * 0.4 });
  }
  b.add("box", -0.2, floor + 0.02, 1.4, 1.6, 0.16, 1.1, "#3b2a1e", { ry: 0.5, rx: 0.15 }); // the door leaf, thrown down
  for (let i = 0; i < 3; i++) b.add("sphere", (rng() - 0.5) * 2.6, floor - 0.1, -0.6 + rng() * 0.5, 0.6 + rng() * 0.4, 0.35, 0.5, RUBBLE[i % RUBBLE.length]);
  // Embers still glowing in the wreck
  for (let i = 0; i < 4; i++) b.add("box", (rng() - 0.5) * 2.2, floor, 0.4 + rng() * 1.6, 0.22, 0.1, 0.22, "#f97316", { glow: true, idle: IDLE_KIND.pulse, phase: 0.01 + i });
  return out.parts;
}
