import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, Flame, Hourglass, MapPin, Moon, Shield, Skull, Swords, Trophy, X } from "lucide-react";
import type { HorrorStatus } from "@/types";
import { sound } from "@/hooks/useSound";
import { useHd } from "@/utils/graphics";
import { HORROR, HORROR_LEVELS, focusHorror, horrorWait, openHorrorGuide, type HorrorRole } from "@/utils/horror";
import { ModelViewer, type Preview } from "./CodexPreview";

/*
 * 🌑 Xal'Vorath's event window (GAME_GUIDE §14): the realm's biggest moment gets the biggest window. It opens by itself
 * once when the horror is sent and again when it reaches the gates, and from its banner or chip any time. The titan
 * itself stands in the header, live, in the viewer's graphics quality; below it, what this viewer can do, the road or the
 * siege as it stands, and the three ways it ends. Lazy, because it brings the Codex's model viewer.
 */

/** Fixed spots for the embers: [left %, delay s, seconds] */
const EMBERS = [
  [6, 0, 3.1], [14, 1.2, 2.6], [23, 0.5, 3.6], [31, 2, 2.9], [40, 0.9, 3.3], [49, 1.7, 2.7], [57, 0.2, 3.8], [66, 1.4, 3], [74, 2.3, 2.5], [83, 0.7, 3.4], [91, 1.9, 2.8], [97, 0.4, 3.2]
] as const;

const copy = (h: HorrorStatus, role: HorrorRole): { title: string; line: string } => {
  if (h.phase === "siege") {
    if (role === "target") return { title: "It is at your gates", line: "March on it or raise a rally now, and call your civilization to arms. Every wound it takes stays." };
    if (role === "ally") return { title: "Your civilization is called to arms", line: `It stands at the gates of ${h.targetName}'s kingdom. March on it or join a rally before the city burns.` };
    return { title: "The realm watches", line: `Only ${h.targetName} and the rulers of their civilization can march on it. All anyone else can do is watch the fire or the fall.` };
  }
  if (role === "target") return { title: "It is coming for you", line: "No army can touch it on the road. Your work is what stops it." };
  if (role === "ally") return { title: "Your civilization stands with them", line: `It can't be fought on the road. If ${h.targetName}'s work falls short, you will have one hour to bring it down at the gates, so keep your armies home and ready.` };
  return { title: "The realm watches", line: `It can't be fought on the road, and only ${h.targetName}'s civilization can face it at the gates. Nothing is asked of you but to witness it.` };
};

/** Everyone it is coming for. Rulers' names hold commas ("Doe, Jane"), so several are set apart with dots */
function towardLine(list: HorrorStatus[], siege: boolean): string {
  const verb = siege ? "stands at the gates of" : "crawls toward";
  if (list.length === 1) return `${verb} ${list[0].targetName}'s kingdom`;
  return `${verb} the kingdoms of ${list.map((x) => x.targetName).join(" · ")}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-[0.25em] font-bold text-rose-300/80">{title}</h3>
      {children}
    </section>
  );
}

/** The road from the rift to the gates, with the titan on it */
function Road({ h, now }: { h: HorrorStatus; now: number }) {
  const u = Math.min(1, Math.max(0, (now - h.startedAt) / Math.max(1, h.arrivesAt - h.startedAt)));
  const pct = `${(u * 100).toFixed(2)}%`;
  return (
    <div className="pt-5">
      <div className="relative h-2 rounded-full bg-slate-800/80 border border-slate-700/60">
        <div className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-violet-700 via-rose-600 to-orange-400" style={{ width: pct }} />
        <span className="absolute top-1/2 w-7 h-7 rounded-full flex items-center justify-center bg-slate-950 border-2 border-rose-400 hv-marker" style={{ left: pct, translate: "-50% -50%" }}>
          <Moon className="w-3.5 h-3.5 text-rose-200" />
        </span>
      </div>
      <div className="flex justify-between gap-3 mt-3 text-[11px] text-slate-400">
        <span>The rift</span>
        <span className="truncate text-right">The gates of {h.targetName}'s kingdom</span>
      </div>
    </div>
  );
}

function DayTile({ h, i }: { h: HorrorStatus; i: number }) {
  const d = h.days[i];
  const past = i < h.dayIndex;
  const today = i === h.dayIndex;
  const fill = Math.min(100, (d.xp / HORROR.XP_PER_DAY) * 100);
  const tone = d.met ? "border-emerald-500/60 bg-emerald-950/30" : past ? "border-red-600/60 bg-red-950/30" : today ? "border-violet-400/70 bg-violet-950/40" : "border-slate-800 bg-slate-950/60";
  return (
    <div className={`p-2.5 rounded-xl border ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="font-medieval text-sm text-slate-100">Day {i + 1}</span>
        {d.met ? <Check className="w-4 h-4 text-emerald-400" /> : past ? <X className="w-4 h-4 text-red-400" /> : today ? <span className="text-[9px] uppercase tracking-wider font-bold text-violet-300">today</span> : null}
      </div>
      <div className="text-[10px] font-mono text-slate-500">{d.day}</div>
      <div className="mt-1.5 h-1 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full ${d.met ? "bg-emerald-400" : past ? "bg-red-500" : "bg-violet-400"}`} style={{ width: `${fill}%` }} />
      </div>
      <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-300">
        {d.xp} / {HORROR.XP_PER_DAY} XP
      </div>
    </div>
  );
}

function Ending({ icon, title, tone, children }: { icon: ReactNode; title: string; tone: string; children: ReactNode }) {
  return (
    <div className={`p-3 rounded-xl border bg-slate-950/60 ${tone}`}>
      <div className="flex items-center gap-2 font-medieval text-sm text-slate-100">
        {icon}
        {title}
      </div>
      <p className="mt-1 text-xs text-slate-400 leading-relaxed">{children}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 min-w-[4.5rem] px-2.5 py-2 rounded-lg bg-slate-950/70 border border-slate-800 text-center">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm font-bold text-rose-100 tabular-nums">{value}</div>
    </div>
  );
}

export function HorrorEvent({ horrors, initialId, roleOf, onClose }: { horrors: HorrorStatus[]; /** The kingdom shown first (default: the first) */ initialId?: number; roleOf: (h: HorrorStatus) => HorrorRole; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState(initialId ?? horrors[0].id);
  // One may end while the window is open
  const h = horrors.find((x) => x.id === picked) ?? horrors[0];
  const role = roleOf(h);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", key);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", key);
    };
  }, []);

  const hd = useHd("models");
  const siege = h.phase === "siege";
  // It tears its way in when it is sent, and taunts the city from the gates
  const preview = useMemo<Preview>(() => (hd ? { kind: "singularity_hd", action: siege ? "taunt" : "emerging" } : { kind: "npc", type: "mythic-singularity", rarity: "mythical", boss: true, scaled: false }), [hd, siege]);

  const say = copy(h, role);
  const canFight = siege && role !== "other";
  const stats = HORROR_LEVELS[h.level];
  const split = Math.max(1, h.split);
  const hpPct = h.maxHp ? (h.hp / h.maxHp) * 100 : 0;
  const hourPct = Math.min(100, Math.max(0, ((h.siegeEndsAt - now) / (HORROR.SIEGE_HOURS * 3_600_000)) * 100));
  const glow = siege ? "#ef4444" : "#a21caf";
  const titleStyle: CSSProperties = {
    backgroundImage: "linear-gradient(0deg, #7f1d1d 0%, #dc2626 28%, #fb7185 58%, #fff1f2 92%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    filter: `drop-shadow(0 0 22px ${glow})`
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 pointer-events-none hv-vignette" style={{ background: `radial-gradient(70% 70% at 50% 45%, transparent 40%, ${glow}55 100%)` }} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="horror-event-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-3xl h-dvh sm:h-[min(52rem,94vh)] flex flex-col overflow-hidden bg-[#06030d] sm:rounded-2xl border-0 sm:border text-slate-200"
        style={{ borderColor: `${glow}aa`, boxShadow: `0 0 0 1px ${glow}44, 0 0 90px ${glow}77, 0 30px 90px rgba(0,0,0,0.8)` }}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/50 border border-white/15 flex items-center justify-center text-slate-300 hover:text-white">
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* The titan itself */}
          <div className="relative h-[19rem] sm:h-[25rem] overflow-hidden">
            <div className="absolute inset-0">
              <ModelViewer preview={preview} civ="arcane" view="world" prestige={0} />
            </div>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, #06030dcc 0%, transparent 22%, transparent 48%, #06030df2 86%, #06030d 100%)" }} aria-hidden />
            <div className="absolute left-1/2 top-[42%] w-64 h-64 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none wn-shockwave" style={{ border: `2px solid ${glow}` }} aria-hidden />
            {EMBERS.map(([left, delay, secs], i) => (
              <span
                key={i}
                className="absolute w-1.5 h-1.5 rounded-full pointer-events-none wn-ember"
                style={{ left: `${left}%`, top: "100%", background: i % 3 ? "#fda4af" : "#fde68a", boxShadow: `0 0 10px 3px ${glow}`, animationDelay: `${delay}s`, animationDuration: `${secs}s` }}
                aria-hidden
              />
            ))}

            <div className="absolute inset-x-0 top-0 pt-4 px-12 text-center pointer-events-none">
              <div className="text-[10px] sm:text-xs uppercase tracking-[0.14em] sm:tracking-[0.3em] whitespace-nowrap font-bold text-rose-200/90">
                The Overseers' Wrath · Level {h.level}
                {split > 1 && <span className="hidden sm:inline">{` · split ÷ ${split}`}</span>}
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 px-5 pb-3 text-center pointer-events-none">
              <h2 id="horror-event-title" className="whatsnew-title wn-enter-slam font-medieval text-5xl sm:text-7xl leading-none tracking-wide" style={titleStyle}>
                Xal'Vorath
              </h2>
              <p className="mt-1.5 text-sm sm:text-base font-semibold text-rose-100">{towardLine(horrors.filter((x) => x.phase === h.phase), siege)}</p>
              <div className="mt-2 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border bg-black/60" style={{ borderColor: `${glow}aa` }}>
                {siege ? <Flame className="w-4 h-4 text-orange-400" /> : <Hourglass className="w-4 h-4 text-violet-300" />}
                <span className="text-[10px] uppercase tracking-wider text-slate-300">{siege ? "The city burns in" : "At the gates in"}</span>
                <span className="font-mono text-base sm:text-lg font-bold tabular-nums text-white">{horrorWait((siege ? h.siegeEndsAt : h.arrivesAt) - now)}</span>
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-7 py-5 space-y-5">
            {/* Each kingdom has its own road and its own three days */}
            {horrors.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Kingdoms it is coming for">
                {horrors.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="tab"
                    aria-selected={x.id === h.id}
                    onClick={() => {
                      sound.playClick();
                      setPicked(x.id);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-full border text-xs font-semibold transition max-w-full ${x.id === h.id ? "border-rose-400 bg-rose-950/60 text-rose-100" : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"}`}
                  >
                    {x.phase === "siege" && <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                    <span className="truncate">{x.targetName}</span>
                  </button>
                ))}
              </div>
            )}

            {/* What it means for this viewer */}
            <div className={`p-4 rounded-xl border ${role === "other" ? "border-slate-700 bg-slate-900/50" : "border-rose-500/60 bg-rose-950/30"}`}>
              <div className="font-medieval text-lg sm:text-xl text-rose-100">{say.title}</div>
              <p className="mt-1 text-sm text-slate-300 leading-relaxed">{say.line}</p>
            </div>

            {siege ? (
              <Section title="The siege">
                <div className="flex items-center justify-between text-xs font-mono text-red-200">
                  <span>Shared HP</span>
                  <span className="tabular-nums">
                    {h.hp.toLocaleString("en-US")} / {h.maxHp.toLocaleString("en-US")}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-900 border border-red-500/50 overflow-hidden">
                  <div className="h-full bg-linear-to-r from-red-800 via-red-500 to-rose-400 transition-[width] duration-500" style={{ width: `${hpPct}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs font-mono text-orange-200 pt-1">
                  <span>The hour</span>
                  <span className="tabular-nums">{horrorWait(h.siegeEndsAt - now)} left</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-900 overflow-hidden">
                  <div className="h-full bg-linear-to-r from-orange-600 to-amber-300" style={{ width: `${hourPct}%` }} />
                </div>
              </Section>
            ) : (
              <Section title="The road">
                <Road h={h} now={now} />
                <p className="text-xs text-slate-400 pt-2">
                  {h.targetName} must earn {HORROR.XP_PER_DAY} XP on each of these days to drive it back. Commits, pull requests, reviews and sealed deeds all count, once the realm has read them from Git.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {h.days.map((d, i) => (
                    <DayTile key={d.day} h={h} i={i} />
                  ))}
                </div>
              </Section>
            )}

            <Section title="How it ends">
              <div className="grid gap-2 sm:grid-cols-3">
                <Ending icon={<Shield className="w-4 h-4 text-emerald-400" />} title="Driven back" tone="border-emerald-700/50">
                  Three days of work, and it comes apart at the gates with no battle at all.
                </Ending>
                <Ending icon={<Trophy className="w-4 h-4 text-amber-300" />} title="Slain" tone="border-amber-700/50">
                  A bounty by damage dealt, and the Heart of the Void to whoever wounded it most.
                </Ending>
                <Ending icon={<Skull className="w-4 h-4 text-red-400" />} title="The city burns" tone="border-red-800/60">
                  Still standing after {HORROR.SIEGE_HOURS} hour: walls to nothing, and {Math.round(HORROR.TREASURY_DEVOURED * 100)}% of the treasury above the vault devoured.
                </Ending>
              </div>
            </Section>

            <div className="flex flex-wrap gap-2">
              <Stat label="Level" value={String(h.level)} />
              <Stat label="HP" value={h.maxHp.toLocaleString("en-US")} />
              <Stat label="ATK" value={Math.round(stats.atk / split).toLocaleString("en-US")} />
              <Stat label="DEF" value={String(Math.round(stats.def / split))} />
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-7 py-3 border-t border-white/10 bg-black/40">
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              openHorrorGuide();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3 h-10 rounded-lg text-xs font-semibold text-slate-300 hover:text-white"
          >
            <BookOpen className="w-4 h-4" /> Guide Book
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              focusHorror(h.npcId, canFight);
              onClose();
            }}
            className="inline-flex items-center gap-2 px-5 h-10 rounded-lg text-sm font-bold text-white bg-linear-to-r from-red-700 to-rose-500 hover:brightness-110 transition"
            style={{ boxShadow: `0 0 22px ${glow}99` }}
          >
            {canFight ? <Swords className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
            {canFight ? "Go fight it" : "Show it on the map"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
