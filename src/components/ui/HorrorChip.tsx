import { lazy, Suspense, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { CivilizationType, DeveloperKingdom, HorrorStatus } from "@/types";
import { sound } from "@/hooks/useSound";
import { HORROR, horrorProgressLine, horrorRole, horrorWait, useRealmHorrors } from "@/utils/horror";

/** The event window brings the Codex's model viewer, so it loads when it first opens */
export const HorrorEventWindow = lazy(() => import("./HorrorEvent").then((m) => ({ default: m.HorrorEvent })));

/*
 * 🌑 Xal'Vorath in the top bar (GAME_GUIDE §15 *Wrath*): for the ruler it is coming for, the whole way (their work so far
 * and how long it has left), and for the rulers of their civilization during the hour at the gates. It opens the event
 * window (HorrorEvent.tsx). Nothing shows for anyone else.
 */

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** The horror this ruler should be watching: the one coming for them, or one at the gates of a kingdom of their civilization */
function horrorFor(list: HorrorStatus[], me: { id: string; civ?: CivilizationType | null } | null, kingdoms: DeveloperKingdom[]): HorrorStatus | null {
  if (!me) return null;
  const mine = list.find((h) => h.targetId === me.id);
  if (mine) return mine;
  return list.find((h) => h.phase === "siege" && kingdoms.find((k) => k.id === h.targetId)?.civilization === me.civ) ?? null;
}

export function HorrorChip({ me, kingdoms }: { me: { id: string; civ?: CivilizationType | null } | null; kingdoms: DeveloperKingdom[] }) {
  const horrors = useRealmHorrors();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const h = horrorFor(horrors, me, kingdoms);
  if (!h) return null;
  const siege = h.phase === "siege";
  const left = (siege ? h.siegeEndsAt : h.arrivesAt) - now;
  const line = horrorProgressLine(h);
  return (
    <>
      <button
        onClick={() => {
          sound.playClick();
          setOpen(true);
        }}
        className={`relative flex items-center gap-1.5 h-9 px-2 rounded-xl border-2 bg-slate-900/80 hover:bg-slate-800 text-[11px] font-semibold text-slate-200 transition cursor-pointer ${siege ? "border-red-500 animate-pulse" : "border-violet-500/70 border-dashed"}`}
        title={siege ? `Xal'Vorath stands at ${h.targetName}'s gates. Tap for what to do` : `Xal'Vorath is coming for your kingdom. ${line ?? ""} Tap for what to do`}
        aria-label={`Xal'Vorath, ${siege ? "at the gates" : "on the road"}: open its panel`}
      >
        <span className="text-sm leading-none">🌑</span>
        {!siege && line && <span className="hidden xl:inline text-slate-300">{line}</span>}
        {!siege && h.days[h.dayIndex] && <span className="xl:hidden font-mono text-slate-300">{h.dayIndex + 1}/{h.days.length}</span>}
        <span className="font-mono font-bold tabular-nums text-slate-300">{horrorWait(left)}</span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <HorrorEventWindow horrors={horrors} initialId={h.id} roleOf={(x) => horrorRole(x, me, kingdoms)} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

function DayRow({ h, index }: { h: HorrorStatus; index: number }) {
  const d = h.days[index];
  const past = index < h.dayIndex;
  const today = index === h.dayIndex;
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${today ? "border-violet-400/60 bg-violet-950/30" : "border-slate-800 bg-slate-950"}`}>
      {d.met ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : past ? <X className="w-3.5 h-3.5 text-rose-400" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-600" />}
      <span className="font-semibold text-slate-200">Day {index + 1}</span>
      <span className="text-slate-500 font-mono">{d.day}</span>
      {today && <span className="text-[10px] uppercase tracking-wider font-bold text-violet-300">today</span>}
      <span className={`ml-auto font-mono tabular-nums ${d.met ? "text-emerald-300" : past ? "text-rose-300" : "text-slate-300"}`}>
        {d.xp} / {HORROR.XP_PER_DAY} XP
      </span>
    </div>
  );
}

/** The three days of work, shared by the top bar's panel and the map's panel */
export function HorrorDays({ h }: { h: HorrorStatus }) {
  return (
    <div className="space-y-1">
      {h.days.map((d, i) => (
        <DayRow key={d.day} h={h} index={i} />
      ))}
    </div>
  );
}
