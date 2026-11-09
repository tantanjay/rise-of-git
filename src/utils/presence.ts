import { useEffect, useState } from "react";

/**
 * Who is online (GAME_GUIDE §10 *Who is online*): the ids of the rulers with the realm open, from /status
 * (`onlineIds`). A tiny store outside React, so the world map and the HUD read it without prop drilling.
 */
let online: ReadonlySet<string> = new Set();
let key = "";
const listeners = new Set<() => void>();
/** Dev tools: a pinned set that the server's list doesn't replace */
let pinned = false;

function apply(ids: string[]) {
  const next = [...ids].sort().join("|");
  if (next === key) return;
  key = next;
  online = new Set(ids);
  listeners.forEach((l) => l());
}

export function setOnlineIds(ids: string[] | undefined) {
  if (!ids || pinned) return;
  apply(ids);
}

/** The online rulers' ids (re-renders only when the set changes) */
export function useOnlineIds(): ReadonlySet<string> {
  const [ids, setIds] = useState(online);
  useEffect(() => {
    const update = () => setIds(online);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return ids;
}

if (typeof window !== "undefined" && import.meta.env?.DEV) {
  /** Dev tools: presence.pin(["ruler-id"]) shows rulers as online; presence.pin(null) follows the server again */
  (window as unknown as { presence: unknown }).presence = {
    pin(ids: string[] | null) {
      pinned = ids !== null;
      apply(ids ?? []);
      return ids === null ? "Following the server's online list again (next poll)" : `Pinned ${ids.length} ruler(s) as online: ${ids.join(", ")}`;
    },
    read: () => [...online]
  };
}
