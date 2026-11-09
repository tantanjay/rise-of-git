import { useEffect, useState } from "react";
import { graphics } from "@/utils/graphics";

/*
 * The HD hero models (hdModels.ts) live in their own chunk, fetched only when HD is on: at start when the realm opens
 * in HD, and behind "Applying graphics…" when the player switches to it. Until it is here (or if it fails to load) the
 * map keeps drawing their map kit.
 */

export type HdModels = typeof import("./hdModels");

let loaded: HdModels | null = null;
let pending: Promise<HdModels> | null = null;

export function loadHdModels(): Promise<HdModels> {
  pending ??= import("./hdModels").then(
    (m) => (loaded = m),
    (err) => {
      // Let the next call try again
      pending = null;
      throw err;
    }
  );
  return pending;
}

/** The HD hero models once loaded (null while they load, or when `enabled` is off) */
export function useHdModels(enabled: boolean): HdModels | null {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!enabled || loaded) return;
    let alive = true;
    loadHdModels().then(
      () => alive && rerender((n) => n + 1),
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? loaded : null;
}

const preload = () => {
  if (graphics.get().quality === "hd") loadHdModels().catch(() => {});
};
preload();
graphics.subscribe(preload);
