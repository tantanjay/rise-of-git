import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CivilizationType } from "@/types";
import { sound } from "@/hooks/useSound";
import { CIV_EMBLEM } from "@/utils/war";
import { DISASTERS, DISASTER_KINDS, DISASTER_SCHEDULE, disasterSide, useRealmDisaster } from "@/utils/disasters";
import { Modal } from "./Modal";

/*
 * ⛈️ World disaster (GAME_GUIDE §10 *World Disasters*): a top-bar chip from the herald's warning (an hour before) to the
 * disaster's end, counting down to when it strikes, then to when it passes. It opens a panel with what the disaster
 * does, who copes and who suffers, and how it looks. Nothing shows while the realm is calm.
 */

const CIV_NAME: Record<CivilizationType, string> = { human: "Humans", elf: "Elves", dwarf: "Dwarves", orc: "Orcs", arcane: "Nethergarde" };

const hms = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Countdown({ to }: { to: number }) {
  const now = useNow();
  return <>{hms(to - now)}</>;
}

export function DisasterChip({ myCiv }: { myCiv?: CivilizationType | null }) {
  const disaster = useRealmDisaster();
  const [open, setOpen] = useState(false);
  if (!disaster) return null;
  const d = DISASTERS[disaster.kind];
  const side = disasterSide(disaster.kind, myCiv);
  return (
    <>
      <button
        onClick={() => {
          sound.playClick();
          setOpen(true);
        }}
        className={`relative flex items-center gap-1.5 h-9 px-2 rounded-xl border-2 bg-slate-900/80 hover:bg-slate-800 text-[11px] font-semibold text-slate-200 transition cursor-pointer ${disaster.active ? "" : "border-dashed"}`}
        style={{ borderColor: d.color, boxShadow: `0 0 10px -4px ${d.color}` }}
        title={`${d.emblem} ${d.name} ${disaster.active ? "is upon the realm: it passes in the countdown" : "strikes in the countdown"}. Tap for what it does and who copes or suffers`}
        aria-label={`${d.name}, ${disaster.active ? "in force" : "coming"}: open the disaster panel`}
      >
        <span className="text-sm leading-none">{d.emblem}</span>
        <span className="hidden 2xl:inline">{disaster.active ? d.name : "Coming"}</span>
        <span className="font-mono font-bold tabular-nums text-slate-300">
          <Countdown to={disaster.active ? disaster.endsAt : disaster.startsAt} />
        </span>
        {side && (
          <span className={`absolute -bottom-1.5 -right-1 text-[9px] leading-none font-bold ${side === "copes" ? "text-emerald-400" : "text-rose-400"}`} aria-hidden>
            {side === "copes" ? "▲" : "▼"}
          </span>
        )}
      </button>
      {open && createPortal(<DisasterModal myCiv={myCiv} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function DisasterModal({ myCiv, onClose }: { myCiv?: CivilizationType | null; onClose: () => void }) {
  const disaster = useRealmDisaster();
  const now = useNow();
  if (!disaster) return null;
  const d = DISASTERS[disaster.kind];
  const S = DISASTER_SCHEDULE;

  const civRow = (civ: CivilizationType, kind: "up" | "down") => (
    <div
      key={civ}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${kind === "up" ? "border-emerald-600/50 bg-emerald-950/40" : "border-rose-600/50 bg-rose-950/40"} ${civ === myCiv ? "ring-2 ring-amber-400/70" : ""}`}
    >
      <span className="text-base">{CIV_EMBLEM[civ]}</span>
      <span className="font-semibold text-slate-100 shrink-0">{CIV_NAME[civ]}</span>
      {civ === myCiv && <span className="text-[10px] px-1.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">You</span>}
      <span className={`ml-auto text-right ${kind === "up" ? "text-emerald-300" : "text-rose-300"}`}>{kind === "up" ? d.copeText : d.sufferText}</span>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      accentBorder="border-rose-500/40"
      headerClassName="bg-linear-to-r from-slate-950 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">{d.emblem}</span>
          <div className="min-w-0">
            <h2 className="font-medieval text-lg text-amber-200 leading-tight">{d.name}</h2>
            <p className="text-[11px] text-slate-400">
              {disaster.active ? "Upon the realm · passes in " : "Dark clouds gather · strikes in "}
              <span className="font-mono tabular-nums text-slate-200">{hms((disaster.active ? disaster.endsAt : disaster.startsAt) - now)}</span>
            </p>
          </div>
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-5 text-sm" style={{ borderTop: `3px solid ${d.color}` }}>
        <section className="space-y-2">
          <p className="text-xs text-slate-300 italic">{d.omen}</p>
          <p className="text-sm text-slate-100">{d.effect}</p>
          <p className="text-xs text-slate-400">{d.look}</p>
        </section>
        <section className="space-y-1.5">
          <div className="text-[11px] font-bold text-emerald-400">▲ Copes</div>
          {civRow(d.copes, "up")}
          <div className="text-[11px] font-bold text-rose-400 pt-1">▼ Suffers</div>
          {civRow(d.suffers, "down")}
          <p className="text-[11px] text-slate-500 pt-1">Every other civilization bears it as written above.</p>
        </section>
        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-wider font-bold text-slate-400">World disasters</h3>
          <p className="text-xs text-slate-400">
            {`1–${S.MAX_PER_WEEK} strike the realm each week, never two on one day, each for ${S.DURATION_H} hours, starting between ${String(S.START_FROM).padStart(2, "0")}:00 and ${S.START_TO}:00 realm time (mostly in the morning). The herald warns an hour before. Every civilization copes with one and suffers from another.`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {DISASTER_KINDS.map((k) => {
              const x = DISASTERS[k];
              return (
                <div key={k} className="rounded-lg border px-2 py-1.5 text-xs bg-slate-800/40" style={{ borderColor: k === disaster.kind ? x.color : "rgb(51 65 85 / 0.6)" }}>
                  <div className="font-semibold text-slate-100">
                    {x.emblem} {x.name}
                  </div>
                  <div className="text-emerald-300">
                    ▲ {CIV_EMBLEM[x.copes]} {CIV_NAME[x.copes]} <span className="text-rose-300 pl-2">▼ {CIV_EMBLEM[x.suffers]} {CIV_NAME[x.suffers]}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Modal>
  );
}
