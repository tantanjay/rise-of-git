/**
 * Client mirror of server/src/disasterRules.ts (GAME_GUIDE §10 *World Disasters*): the five disasters, their effects
 * and the civilizations that cope or suffer, for the top-bar chip, the Guide Book and the 3D weather. The server sends
 * the disaster in force (or the next one, once warned of) with /status → `disaster`; a tiny store outside React holds
 * it so the sky and weather read it every frame without re-rendering.
 */
import { useEffect, useState } from "react";
import type { CivilizationType, DisasterKind, DisasterStatus } from "@/types";

export const DISASTER_KINDS: DisasterKind[] = ["blight", "tempest", "blood_moon", "plague", "barren"];

/** Mirrors DISASTER_SCHEDULE */
export const DISASTER_SCHEDULE = {
  DURATION_H: 4,
  WARNING_H: 1,
  BASE_CHANCE: 0.35,
  MISS_STEP: 0.15,
  AFTER_HIT: 0.5,
  MAX_PER_WEEK: 3,
  START_FROM: 6,
  START_TO: 22,
  MORNING_TO: 12,
  MORNING_SHARE: 0.6
} as const;

/** Mirrors DISASTER_EFFECTS */
export const DISASTER_EFFECTS = {
  BLIGHT_POOL: 0,
  BLIGHT_SUFFER_BUILDINGS: 0.5,
  TEMPEST_LOSS: [0.03, 0.08] as [number, number],
  BLOOD_MOON_NPC: 0.3,
  BLOOD_MOON_ATK: { orc: 0.1, elf: -0.1 } as Partial<Record<CivilizationType, number>>,
  PLAGUE_RATE: 0.01,
  BARREN_BIRTHS: 0.5,
  BARREN_VOID_WELL: 0.5,
  COPE: 0.5,
  SUFFER: 2
} as const;

export interface DisasterInfo {
  kind: DisasterKind;
  name: string;
  emblem: string;
  effect: string;
  copes: CivilizationType;
  suffers: CivilizationType;
  copeText: string;
  sufferText: string;
  omen: string;
  /** What players see while it lasts */
  look: string;
  /** The chip's and the panel's accent */
  color: string;
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const E = DISASTER_EFFECTS;

/** Mirrors DISASTERS (plus how each looks) */
export const DISASTERS: Record<DisasterKind, DisasterInfo> = {
  blight: {
    kind: "blight",
    name: "Great Blight",
    emblem: "🌾",
    effect: "The fields wilt: no harvest pool payouts (buildings, the workforce and the gem drop still pay).",
    copes: "dwarf",
    suffers: "human",
    copeText: `Dwarves live off mushroom caverns and stone granaries: they still get ${pct(1 - (1 - E.BLIGHT_POOL) * E.COPE)} of their pool share.`,
    sufferText: `Humans feed grain-fed hosts: no pool share, and their buildings pay only ${pct(1 - E.BLIGHT_SUFFER_BUILDINGS)}.`,
    omen: "A grey rot creeps along the furrows, and the wheat bows its heads.",
    look: "The green land turns brown-grey, crops wilt and grey spores drift on the air.",
    color: "#a3a35a"
  },
  tempest: {
    kind: "tempest",
    name: "Tempest Roads",
    emblem: "🌪️",
    effect: `Gales scour the roads: every army that sets off loses ${pct(E.TEMPEST_LOSS[0])}–${pct(E.TEMPEST_LOSS[1])} of its marchers on the way.`,
    copes: "elf",
    suffers: "dwarf",
    copeText: `Elven rangers are sure-footed: they lose only ${pct(E.TEMPEST_LOSS[0] * E.COPE)}–${pct(E.TEMPEST_LOSS[1] * E.COPE)}.`,
    sufferText: `Dwarves march in heavy armour on mud roads: they lose ${pct(E.TEMPEST_LOSS[0] * E.SUFFER)}–${pct(E.TEMPEST_LOSS[1] * E.SUFFER)}.`,
    omen: "The wind howls down from the passes and the roads turn to dust and mud.",
    look: "Wind streaks whip across the land, dust blows over the roads and the light dims.",
    color: "#c8a46a"
  },
  blood_moon: {
    kind: "blood_moon",
    name: "Blood Moon",
    emblem: "🩸",
    effect: `A red moon maddens the wilds: mobs, bandits and bosses fight with +${pct(E.BLOOD_MOON_NPC)} HP, ATK and DEF (every battle round fought under it).`,
    copes: "orc",
    suffers: "elf",
    copeText: `Orcs love a Blood Moon: their soldiers fight with +${pct(E.BLOOD_MOON_ATK.orc ?? 0)} ATK under it.`,
    sufferText: `The glades fear it: Elven soldiers fight with −${pct(Math.abs(E.BLOOD_MOON_ATK.elf ?? 0))} ATK under it.`,
    omen: "The moon rises the colour of rust, and the wolves will not stop howling.",
    look: "A huge red moon hangs in the sky and the night turns red; by day the light is tinged rust.",
    color: "#e11d48"
  },
  plague: {
    kind: "plague",
    name: "Wasting Plague",
    emblem: "☠️",
    effect: `A green miasma hangs over the cities: ${pct(E.PLAGUE_RATE)} of every kingdom's civilians die at each harvest.`,
    copes: "arcane",
    suffers: "orc",
    copeText: "Nethergarde's constructs are immune.",
    sufferText: `Orc war camps are crowded: ${pct(E.PLAGUE_RATE * E.SUFFER)} of their civilians die at each harvest.`,
    omen: "A sickly green haze rises from the gutters of the crowded cities.",
    look: "A sickly green miasma creeps low over the land and the cities.",
    color: "#84cc16"
  },
  barren: {
    kind: "barren",
    name: "Barren Spell",
    emblem: "🥀",
    effect: `The flowers grey and the streets empty: births ×${E.BARREN_BIRTHS}.`,
    copes: "human",
    suffers: "arcane",
    copeText: `The Dawn Banner's blessing: Human births are only ×${1 - (1 - E.BARREN_BIRTHS) * E.COPE}.`,
    sufferText: `The Void Well returns only ${pct(E.BARREN_VOID_WELL)} of Nethergarde's fallen.`,
    omen: "The blossoms turn ash-grey on the branch, and no cradle rocks tonight.",
    look: "The colour drains from the realm, grey petals drift down and the streets empty.",
    color: "#a8a29e"
  }
};

export function disasterSide(kind: DisasterKind, civ: CivilizationType | null | undefined): "copes" | "suffers" | null {
  const d = DISASTERS[kind];
  return civ === d.copes ? "copes" : civ === d.suffers ? "suffers" : null;
}

/* ------------------------------------------------------------------------- */
/* The store (fed by /status)                                                 */
/* ------------------------------------------------------------------------- */

let current: DisasterStatus | null = null;
/** Dev tools: pin a disaster's look without the server (window.realmDisaster in dev) */
let pinned: DisasterKind | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Called with each /status: the disaster, its times moved onto this browser's clock */
export function setRealmDisaster(d: DisasterStatus | null | undefined, serverNow?: number) {
  const skew = serverNow ? serverNow - Date.now() : 0;
  const next = d ? { ...d, startsAt: d.startsAt - skew, endsAt: d.endsAt - skew } : null;
  const changed = (next?.id ?? null) !== (current?.id ?? null) || next?.active !== current?.active || Math.abs((next?.endsAt ?? 0) - (current?.endsAt ?? 0)) > 2000;
  current = next;
  if (changed) notify();
}

/** The disaster for the top bar: in force, or warned of (null: none) */
export function readRealmDisaster(now = Date.now()): DisasterStatus | null {
  if (pinned) return { id: -1, kind: pinned, startsAt: now - 60_000, endsAt: now + DISASTER_SCHEDULE.DURATION_H * 3_600_000, active: true };
  if (!current || now >= current.endsAt) return null;
  return { ...current, active: now >= current.startsAt };
}

/** The disaster whose look is on the land right now (only one in force) */
export function activeDisasterKind(now = Date.now()): DisasterKind | null {
  const d = readRealmDisaster(now);
  return d?.active ? d.kind : null;
}

/** The disaster for the UI, re-read when it changes and every few seconds (warned → in force → over) */
export function useRealmDisaster(): DisasterStatus | null {
  const [d, setD] = useState(() => readRealmDisaster());
  useEffect(() => {
    const tick = () =>
      setD((prev) => {
        const next = readRealmDisaster();
        return next?.id === prev?.id && next?.active === prev?.active && next?.kind === prev?.kind ? prev : next;
      });
    listeners.add(tick);
    const id = setInterval(tick, 5_000);
    return () => {
      listeners.delete(tick);
      clearInterval(id);
    };
  }, []);
  return d;
}

/** Only the kind of disaster on the land (re-renders when one strikes or passes) */
export function useActiveDisasterKind(): DisasterKind | null {
  const d = useRealmDisaster();
  return d?.active ? d.kind : null;
}

if (typeof window !== "undefined" && import.meta.env?.DEV) {
  (window as unknown as { realmDisaster: unknown }).realmDisaster = {
    /** realmDisaster.pin("blood_moon") — show a disaster's look here only (null to follow the server) */
    pin(kind: DisasterKind | null) {
      if (kind !== null && !DISASTER_KINDS.includes(kind)) return `Unknown disaster "${kind}": use ${DISASTER_KINDS.map((k) => `"${k}"`).join(", ")} or null`;
      pinned = kind;
      notify();
      return kind ? `Pinned: ${DISASTERS[kind].emblem} ${DISASTERS[kind].name} (this browser only)` : "Following the server's disasters again";
    },
    read: () => readRealmDisaster()
  };
}
