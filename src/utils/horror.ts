/**
 * Client mirror of server/src/horrorRules.ts (GAME_GUIDE §15 *Wrath*, §13 *The Horror*): Xal'Vorath's numbers for the
 * books and panels (`npm run sim:balance` checks the copy), and a tiny store outside React with the horrors out in the
 * realm (/status → `horrors`), so the top bar and the map's cards read them without passing props through the 3D.
 */
import { useEffect, useState } from "react";
import type { CivilizationType, DeveloperKingdom, HorrorStatus } from "@/types";

export const HORROR = {
  APPROACH_DAYS: 3,
  SIEGE_HOURS: 1,
  DAYS: 3,
  XP_PER_DAY: 3,
  LATE_SEND_HOUR: 12,
  MIN_LEVEL: 1,
  MAX_LEVEL: 5,
  MAX_TARGETS: 3,
  TREASURY_DEVOURED: 0.5
} as const;

/** Mirrors HORROR_LEVELS */
export const HORROR_LEVELS: Record<number, { hp: number; atk: number; def: number }> = {
  1: { hp: 120_000, atk: 1_000, def: 10 },
  2: { hp: 180_000, atk: 1_100, def: 11 },
  3: { hp: 260_000, atk: 1_250, def: 12 },
  4: { hp: 380_000, atk: 1_400, def: 13 },
  5: { hp: 560_000, atk: 1_600, def: 14 }
};

/** The gem a slain horror drops (mirrors HORROR.GEM) */
export const HORROR_GEM = "void_heart";

/** A short wait: "2 d 4 h", "3 h 12 m", "4:09" */
export function horrorWait(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** A number from 0 to 1 that a horror's map id always gives the same: no two walk in step */
export function horrorSeed(npcId: string): number {
  let h = 7;
  for (const ch of npcId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const v = Math.sin(h * 91.7) * 43758.5453;
  return v - Math.floor(v);
}

let current: HorrorStatus[] = [];
let lastJson = "";
const listeners = new Set<() => void>();

/** Called with each /status: the horrors, their times moved onto this browser's clock */
export function setRealmHorrors(list: HorrorStatus[] | null | undefined, serverNow?: number) {
  const raw = list ?? [];
  const json = JSON.stringify(raw);
  if (json === lastJson) return;
  lastJson = json;
  const skew = serverNow ? serverNow - Date.now() : 0;
  current = raw.map((h) => ({ ...h, startedAt: h.startedAt - skew, arrivesAt: h.arrivesAt - skew, siegeEndsAt: h.siegeEndsAt - skew }));
  listeners.forEach((l) => l());
}

/** One horror by its map NPC id, as of the latest /status */
export const horrorByNpc = (npcId: string): HorrorStatus | undefined => current.find((h) => h.npcId === npcId);

export function useRealmHorrors(): HorrorStatus[] {
  const [list, setList] = useState(current);
  useEffect(() => {
    const on = () => setList(current);
    listeners.add(on);
    on();
    return () => void listeners.delete(on);
  }, []);
  return list;
}

/** What a horror is to this viewer: it came for them, for a kingdom of their civilization, or it is someone else's trouble */
export type HorrorRole = "target" | "ally" | "other";

export function horrorRole(h: HorrorStatus, me: { id: string; civ?: CivilizationType | null } | null, kingdoms: DeveloperKingdom[]): HorrorRole {
  if (me?.id === h.targetId) return "target";
  return me?.civ && kingdoms.find((k) => k.id === h.targetId)?.civilization === me.civ ? "ally" : "other";
}

/** Who answers a request to show a horror on the map (App.tsx, which holds the camera and the panels) */
let focusHandler: ((npcId: string, openPanel: boolean) => void) | null = null;

export function setHorrorFocusHandler(fn: typeof focusHandler) {
  focusHandler = fn;
}

let guideHandler: (() => void) | null = null;

export function setHorrorGuideHandler(fn: typeof guideHandler) {
  guideHandler = fn;
}

/** Open the Guide Book at its chapter */
export const openHorrorGuide = () => guideHandler?.();

/** Fly the map to a horror, and with `openPanel` open the panel it is attacked from */
export const focusHorror = (npcId: string, openPanel = false) => focusHandler?.(npcId, openPanel);

/** "Day 2/3 · 1.6 / 3 XP today": the target's work so far (null: none of its three days is today) */
export function horrorProgressLine(h: HorrorStatus): string | null {
  const today = h.days[h.dayIndex];
  return today ? `Day ${h.dayIndex + 1}/${h.days.length} · ${today.xp} / ${HORROR.XP_PER_DAY} XP today` : null;
}
