import { useEffect, useRef, useState } from "react";
import { Broadcast, BroadcastKind } from "@/types";
import { sound } from "@/hooks/useSound";
import { ChronicleText } from "./ChronicleStoryView";

/** Wax seal colours by kind of notice (the sender's colour) */
export const NOTICE_SEAL: Record<BroadcastKind, { wax: string; rim: string; label: string }> = {
  boss_slain: { wax: "#b91c1c", rim: "#f59e0b", label: "Boss slain" },
  while_away: { wax: "#9f1239", rim: "#fda4af", label: "While you were away" },
  gift: { wax: "#047857", rim: "#6ee7b7", label: "Royal gift" },
  announcement: { wax: "#1d4ed8", rim: "#fcd34d", label: "Announcement" },
  punishment: { wax: "#334155", rim: "#94a3b8", label: "Punishment" },
  shield: { wax: "#0369a1", rim: "#7dd3fc", label: "Royal Shield" },
  gate_fallen: { wax: "#c2410c", rim: "#fdba74", label: "A border falls" },
  scouts_caught: { wax: "#3f3f46", rim: "#a1a1aa", label: "Scouts caught" },
  scouts_deceived: { wax: "#1e3a8a", rim: "#93c5fd", label: "False intel" },
  gate_duty: { wax: "#78350f", rim: "#fcd34d", label: "Gate duty" },
  refund: { wax: "#a16207", rim: "#fde68a", label: "Improvements refunded" },
  season_change: { wax: "#15803d", rim: "#fde047", label: "The season turns" },
  festival: { wax: "#c2410c", rim: "#fde68a", label: "A Festival" },
  deed: { wax: "#6b4f2a", rim: "#e7d3a8", label: "Deed report" },
  omen: { wax: "#312e81", rim: "#bae6fd", label: "Omen heeded" },
  disaster: { wax: "#7f1d1d", rim: "#a8a29e", label: "World disaster" },
  chronicle: { wax: "#5b21b6", rim: "#fcd34d", label: "The Weekly Chronicle" },
  mercenary: { wax: "#92400e", rim: "#fbbf24", label: "Mercenaries" },
  armory: { wax: "#44403c", rim: "#a8a29e", label: "The Armory" },
  champion: { wax: "#7c2d12", rim: "#fde68a", label: "Your Champion" }
};

const sealOf = (kind: string) => NOTICE_SEAL[kind as BroadcastKind] ?? NOTICE_SEAL.announcement;

export function WaxSeal({ notice, size = 56 }: { notice: Pick<Broadcast, "kind" | "emblem">; size?: number }) {
  const seal = sealOf(notice.kind);
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${seal.wax} 60%, white), ${seal.wax} 55%, color-mix(in srgb, ${seal.wax} 60%, black))`,
        boxShadow: `0 0 0 ${Math.max(2, size / 18)}px ${seal.rim}55, 0 4px 10px rgba(0,0,0,0.45), inset 0 -3px 6px rgba(0,0,0,0.35)`
      }}
      aria-hidden
    >
      <span style={{ fontSize: size * 0.45, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))" }}>{notice.emblem}</span>
    </span>
  );
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

interface HeraldModalProps {
  /** Unread notices, oldest first; the first one is shown */
  notices: Broadcast[];
  onRead: (ids: number[] | "all") => void;
}

/**
 * The herald: unread notices unrolled one at a time on a parchment scroll, sealed in the sender's colour.
 * Next closes the current one for good; Dismiss all closes the rest.
 */
export function HeraldModal({ notices, onRead }: HeraldModalProps) {
  // Notices closed since the herald opened, so the counter reads "2 of 3" rather than restarting
  const [seen, setSeen] = useState(0);
  const notice = notices[0];
  useEffect(() => {
    if (notices.length === 0) setSeen(0);
  }, [notices.length]);

  const next = () => {
    if (!notice) return;
    sound.playClick();
    setSeen((n) => n + 1);
    onRead([notice.id]);
  };
  const nextRef = useRef(next);
  nextRef.current = next;

  useEffect(() => {
    if (!notice) return;
    // Capture phase + stopImmediatePropagation: the key closes only this notice, never a panel underneath
    // (a confirm dialog above the herald keeps its own keys)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      if (document.querySelector('[role="alertdialog"]')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      nextRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [notice]);

  if (!notice) return null;
  const total = seen + notices.length;
  const last = notices.length === 1;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn" role="presentation">
      <div role="dialog" aria-modal aria-labelledby="herald-title" className="relative w-full max-w-md">
        {/* Top roll */}
        <div className="relative z-10 mx-1 h-5 rounded-full bg-linear-to-b from-amber-700 via-amber-500 to-amber-800 shadow-lg border border-amber-900/60" />
        <div
          className="relative -my-2.5 px-6 pt-7 pb-12 text-amber-950 shadow-2xl"
          style={{
            background: "radial-gradient(ellipse at 50% 0%, #fdf6e3 0%, #f3e2b8 55%, #e3c88d 100%)",
            boxShadow: "inset 0 0 40px rgba(120, 72, 20, 0.35), 0 20px 40px rgba(0,0,0,0.5)"
          }}
        >
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-amber-900/70 font-bold">
            <span>📯 Hear ye · {sealOf(notice.kind).label}</span>
            {total > 1 && (
              <span className="tabular-nums">
                {seen + 1} of {total}
              </span>
            )}
          </div>
          <h2 id="herald-title" className="mt-3 text-center text-2xl font-medieval leading-tight text-amber-950">
            {notice.title}
          </h2>
          <div className="mx-auto mt-2 mb-3 h-px w-2/3 bg-linear-to-r from-transparent via-amber-800/50 to-transparent" />
          <div className="max-h-[45vh] overflow-y-auto space-y-1 text-sm leading-relaxed text-amber-950/90">
            {notice.kind === "chronicle" ? (
              <ChronicleText body={notice.body} compact />
            ) : (
              notice.body.split("\n").map((line, i) => (line.trim() ? <p key={i}>{line}</p> : <div key={i} className="h-2" />))
            )}
          </div>
          <p className="mt-4 text-center text-[10px] italic text-amber-900/60">{fmtDate(notice.createdAt)}</p>

          <div className="absolute left-1/2 -bottom-7 -translate-x-1/2 z-20">
            <WaxSeal notice={notice} size={60} />
          </div>
        </div>
        {/* Bottom roll */}
        <div className="relative z-10 mx-1 h-5 rounded-full bg-linear-to-b from-amber-700 via-amber-500 to-amber-800 shadow-lg border border-amber-900/60" />

        <div className="mt-10 flex items-center justify-center gap-2">
          {!last && (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onRead("all");
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold transition"
            >
              Dismiss all
            </button>
          )}
          <button
            type="button"
            onClick={next}
            autoFocus
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-950/40 transition"
          >
            {last ? "So be it" : "Next ›"}
          </button>
        </div>
      </div>
    </div>
  );
}
