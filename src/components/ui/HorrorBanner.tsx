import { Suspense, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { CivilizationType, DeveloperKingdom, HorrorStatus } from "@/types";
import { sound } from "@/hooks/useSound";
import { horrorRole, horrorWait, useRealmHorrors } from "@/utils/horror";
import { HorrorEventWindow } from "./HorrorChip";

/** The event windows already shown by themselves */
const SEEN_KEY = "gitTea.horrorEventSeen";
/** Stretches remembered: a horror has two (the road and the gates), and only a few are ever out */
const KEEP = 24;

function readList(key: string): string[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

function rememberList(key: string, list: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(-KEEP)));
  } catch {
    // Private window or blocked storage: the banner just comes back on the next visit
  }
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const keyOf = (h: HorrorStatus) => `${h.id}:${h.phase}`;

/**
 * 🌑 Xal'Vorath's banner (GAME_GUIDE §14): one, top left, for everyone, signed in or not, however many horrors are out.
 * It opens the one event window, which also opens by itself when a horror is sent or reaches the gates (`ready`: when
 * nothing else is in its way). The banner can't be closed or hidden: it stays while any horror is out and goes when the
 * last one is repelled, slain or done.
 */
export function HorrorBanners({ me, kingdoms, ready }: { me: { id: string; civ?: CivilizationType | null } | null; kingdoms: DeveloperKingdom[]; ready: boolean }) {
  const horrors = useRealmHorrors();
  const now = useNow();
  const [seen, setSeen] = useState<string[]>(() => readList(SEEN_KEY));
  const [open, setOpen] = useState(false);
  if (horrors.length === 0) return null;

  const roleOf = (h: HorrorStatus) => horrorRole(h, me, kingdoms);
  // What is most urgent first: at the gates, then the viewer's own trouble
  const rank = (h: HorrorStatus) => (h.phase === "siege" ? 0 : 2) + (roleOf(h) === "other" ? 1 : 0);
  const sorted = [...horrors].sort((a, b) => rank(a) - rank(b));
  // The banner tells the gravest stage: the horrors at the gates, or else all of them on the road
  const siege = sorted[0].phase === "siege";
  const told = sorted.filter((h) => h.phase === sorted[0].phase);
  const left = Math.min(...told.map((h) => (siege ? h.siegeEndsAt : h.arrivesAt))) - now;
  const who = told.length === 1 ? told[0].targetName : `${told.length} kingdoms`;

  const merge = (list: string[]) => [...list, ...horrors.map(keyOf).filter((k) => !list.includes(k))];
  // Opened by hand, or by itself when this browser has not yet seen one of them at this stage
  const showWindow = open || (ready && horrors.some((h) => !seen.includes(keyOf(h))));
  const closeWindow = () => {
    const next = merge(seen);
    rememberList(SEEN_KEY, next);
    setSeen(next);
    setOpen(false);
  };

  return (
    <>
      <div className={`pointer-events-auto w-full flex items-stretch rounded-2xl border bg-linear-to-r from-red-950/90 via-slate-950/90 to-violet-950/90 text-rose-100 backdrop-blur-md shadow-2xl ${siege ? "border-red-500/80 animate-pulse" : "border-rose-500/50"}`}>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setOpen(true);
            }}
            title={told.map((h) => h.targetName).join(" · ")}
            className="flex-1 min-w-0 flex items-center gap-2 pl-3.5 pr-2 py-2.5 text-left hover:brightness-110 cursor-pointer group"
          >
            <span className="p-1 rounded-lg bg-white/10 shrink-0 text-sm leading-none">🌑</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[9px] uppercase tracking-[0.15em] text-rose-200/80 font-bold">{siege ? "At the gates" : "The Overseers' Wrath"}</span>
                <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-rose-200">{horrorWait(left)}</span>
              </span>
              <span className="block font-medieval tracking-wide text-xs font-semibold truncate">{siege ? `Xal'Vorath besieges ${who}` : `Xal'Vorath hunts ${who}`}</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:translate-x-0.5 transition" />
          </button>
      </div>
      {showWindow && (
        <Suspense fallback={null}>
          <HorrorEventWindow horrors={sorted} roleOf={roleOf} onClose={closeWindow} />
        </Suspense>
      )}
    </>
  );
}
