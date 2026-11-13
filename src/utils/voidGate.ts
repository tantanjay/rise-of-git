import { useSyncExternalStore } from "react";

/*
 * The Void Gate (GAME_GUIDE §10 *The Void Gate*): it stands on the map in the Nethergarde Voidrift, south of the Core
 * (`VOID_GATE` in worldGeometry.ts), but the climb is not in the game yet. Clicking it opens its teaser window
 * (VoidGateTeaser.tsx); this is the window's open / closed state, shared by the map and the app.
 */

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Show the Void Gate's teaser window */
export function openVoidGateTeaser() {
  open = true;
  emit();
}

export function closeVoidGateTeaser() {
  open = false;
  emit();
}

export function useVoidGateTeaser(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => open
  );
}

/** What the teaser promises: the climb as planned (numbers here are the teaser's, not rules in play) */
export const VOID_GATE_TEASER = {
  levels: 30,
  bossEvery: 5,
  opensAtCityHall: 6
} as const;
