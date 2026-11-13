import { useSyncExternalStore } from "react";

/**
 * The loading screen's progress: which step of opening a view the game is on, and how far into it. The steps are the
 * real work, reported by the code doing it (the realm's data, the world build, the 3D mount, the shader compile, the
 * first frames), so the bar moves with what is actually happening.
 */
export type LoadStage = "realm" | "land" | "castles" | "forge" | "torches";

/** Each step's share of the bar, from its start to its end (0–1) */
export const LOAD_SPANS: Record<LoadStage, readonly [number, number]> = {
  realm: [0, 0.15],
  land: [0.15, 0.45],
  castles: [0.45, 0.65],
  forge: [0.65, 0.95],
  torches: [0.95, 1]
};

const ORDER: LoadStage[] = ["realm", "land", "castles", "forge", "torches"];

export interface LoadState {
  stage: LoadStage;
  /** How far into the step (0–1); steps that cannot count their work leave it at 0 and the bar creeps instead */
  frac: number;
}

let state: LoadState = { stage: "realm", frac: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Report a step (and how far into it). A step never goes back while a load runs (a later step reporting first wins),
 * except to start a new load with `restart`.
 */
export function setLoadStage(stage: LoadStage, frac = 0, restart = false) {
  const f = Math.max(0, Math.min(1, frac));
  if (!restart) {
    const cur = ORDER.indexOf(state.stage);
    const next = ORDER.indexOf(stage);
    if (next < cur || (next === cur && f <= state.frac)) return;
  }
  if (state.stage === stage && state.frac === f) return;
  state = { stage, frac: f };
  emit();
}

/** Where the bar stands, 0–1 */
export const loadProgress = (s: LoadState) => {
  const [a, b] = LOAD_SPANS[s.stage];
  return a + (b - a) * s.frac;
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;

export function useLoadState(): LoadState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Two frames: the browser paints what was just set (the loading screen's step) before the next heavy piece runs */
export const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/* The realm shown: set once the loading screen has first faded out (and the realm has settled a moment) */

let realmShown = false;
const waiting = new Map<string, () => void>();

/**
 * Run `fn` once the realm is on screen (at once if it already is). Sounds and popups that arrive with the first data
 * (the herald's fanfare, a battle report) wait for it, so none plays while the page is busy building the view. A
 * `key` keeps one waiting call per kind: a later one replaces it.
 */
export function whenRealmShown(key: string, fn: () => void) {
  if (realmShown) fn();
  else waiting.set(key, fn);
}

/** The loading screen has gone for the first time: run what waited */
export function markRealmShown() {
  if (realmShown) return;
  realmShown = true;
  const calls = [...waiting.values()];
  waiting.clear();
  calls.forEach((fn) => fn());
}
