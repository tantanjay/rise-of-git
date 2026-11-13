import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { sound } from "@/hooks/useSound";
import { Combobox } from "./Combobox";
import { BannerStyle, NoticeAccent, UPDATE_VERSIONS, UpdateNotice, dismissNotices, versionOf } from "./updateNotices";

/** Each accent's colours: the panel's glow, the medallion and the bullets */
const ACCENT: Record<NoticeAccent, { glow: string; deep: string }> = {
  gold: { glow: "#f59e0b", deep: "#78350f" },
  ember: { glow: "#f97316", deep: "#7c2d12" },
  steel: { glow: "#94a3b8", deep: "#1e293b" },
  royal: { glow: "#c084fc", deep: "#3b0764" },
  moon: { glow: "#818cf8", deep: "#1e1b4b" },
  blood: { glow: "#f43f5e", deep: "#4c0519" }
};

type Fx = "rays" | "embers" | "sparks" | "orbit" | "stars" | "claws" | "rain" | "sunrise" | "burst" | "gates";

/**
 * Every headline design: its lettering (a gradient through the title), its glow, how it enters (a CSS class in
 * index.css), the effect behind it and the banner's backdrop. Each update picks one, so no two read alike.
 */
const BANNERS: Record<BannerStyle, { text: string; glow: string; enter: string; fx: Fx; backdrop: (a: { glow: string; deep: string }) => string; tracking?: string; eyebrow: string }> = {
  gilded: {
    text: "linear-gradient(180deg, #fff7d6 0%, #fde68a 35%, #f59e0b 70%, #b45309 100%)",
    glow: "#f59e0b",
    enter: "wn-enter-pop",
    fx: "rays",
    backdrop: (a) => `radial-gradient(120% 90% at 50% 0%, #f59e0b55 0%, ${a.deep}cc 45%, #020617 100%)`,
    eyebrow: "text-amber-200/90"
  },
  inferno: {
    text: "linear-gradient(0deg, #7f1d1d 0%, #dc2626 25%, #f97316 55%, #fde047 85%, #fffbeb 100%)",
    glow: "#f97316",
    enter: "wn-enter-slam",
    fx: "embers",
    backdrop: () => "radial-gradient(130% 100% at 50% 110%, #ea580c88 0%, #7c2d12cc 40%, #0c0a09 85%)",
    eyebrow: "text-orange-200/90"
  },
  forge: {
    text: "linear-gradient(180deg, #ffffff 0%, #cbd5e1 40%, #64748b 55%, #e2e8f0 70%, #94a3b8 100%)",
    glow: "#cbd5e1",
    enter: "wn-enter-strike",
    fx: "sparks",
    backdrop: () => "repeating-linear-gradient(115deg, #ffffff06 0 2px, transparent 2px 7px), radial-gradient(110% 90% at 50% 20%, #47556999 0%, #1e293b 50%, #020617 100%)",
    tracking: "0.04em",
    eyebrow: "text-slate-200/90"
  },
  arcane: {
    text: "linear-gradient(180deg, #fdf4ff 0%, #f0abfc 35%, #c084fc 65%, #7c3aed 100%)",
    glow: "#c084fc",
    enter: "wn-enter-unveil",
    fx: "orbit",
    backdrop: () => "radial-gradient(90% 80% at 50% 35%, #a855f766 0%, #3b0764cc 45%, #0b0218 100%)",
    eyebrow: "text-fuchsia-200/90"
  },
  moonlit: {
    text: "linear-gradient(180deg, #ffffff 0%, #e0e7ff 40%, #a5b4fc 75%, #6366f1 100%)",
    glow: "#a5b4fc",
    enter: "wn-enter-drift",
    fx: "stars",
    backdrop: () => "radial-gradient(70% 60% at 78% 18%, #c7d2fe55 0%, transparent 60%), linear-gradient(180deg, #1e1b4b 0%, #0f0a2e 60%, #020617 100%)",
    eyebrow: "text-indigo-200/90"
  },
  savage: {
    text: "linear-gradient(180deg, #fff1f2 0%, #fecdd3 25%, #fb7185 55%, #9f1239 100%)",
    glow: "#f43f5e",
    enter: "wn-enter-shake",
    fx: "claws",
    backdrop: () => "radial-gradient(110% 90% at 50% 30%, #9f123966 0%, #4c0519cc 45%, #0c0306 100%)",
    tracking: "0.02em",
    eyebrow: "text-rose-200/90"
  },
  storm: {
    text: "linear-gradient(180deg, #ffffff 0%, #e0f2fe 35%, #7dd3fc 65%, #0369a1 100%)",
    glow: "#7dd3fc",
    enter: "wn-enter-flash",
    fx: "rain",
    backdrop: () => "linear-gradient(180deg, #1e293b 0%, #0f172a 55%, #020617 100%)",
    eyebrow: "text-sky-200/90"
  },
  dawn: {
    text: "linear-gradient(180deg, #fffbeb 0%, #fde68a 35%, #fb923c 70%, #e11d48 100%)",
    glow: "#fb923c",
    enter: "wn-enter-rise",
    fx: "sunrise",
    backdrop: () => "linear-gradient(180deg, #312e81 0%, #7c2d12 60%, #c2410c 100%)",
    eyebrow: "text-amber-100/90"
  },
  heroic: {
    text: "linear-gradient(180deg, #fffbeb 0%, #fde68a 40%, #f59e0b 60%, #a855f7 100%)",
    glow: "#fbbf24",
    enter: "wn-enter-zoom",
    fx: "burst",
    backdrop: () => "radial-gradient(80% 80% at 50% 45%, #fbbf2455 0%, #581c87cc 45%, #0b0218 100%)",
    tracking: "0.03em",
    eyebrow: "text-amber-200/90"
  },
  hearth: {
    text: "linear-gradient(180deg, #fffbeb 0%, #fef3c7 30%, #fcd34d 55%, #f59e0b 78%, #c2410c 100%)",
    glow: "#fbbf24",
    enter: "wn-enter-welcome",
    fx: "gates",
    backdrop: () => "radial-gradient(95% 75% at 50% 100%, #f59e0b70 0%, #9a3412b3 40%, #2a1306 75%, #120904 100%)",
    tracking: "0.02em",
    eyebrow: "text-amber-100/90"
  }
};

/** Lanterns hung across the hearth banner: [left %, rope sag px, swing delay s] */
const LANTERNS = [
  [10, 6, 0],
  [28, 14, 0.7],
  [50, 17, 0.3],
  [72, 14, 1.1],
  [90, 6, 0.5]
] as const;

/** Fixed spots for the effects (deterministic, so every open looks the same): [left %, top %, delay s] */
const SPOTS = [
  [8, 22, 0], [18, 70, 0.6], [30, 15, 1.2], [44, 80, 0.3], [58, 20, 0.9], [70, 72, 1.5], [82, 30, 0.45], [92, 64, 1.1], [24, 45, 1.8], [76, 50, 2.1], [52, 58, 2.6], [12, 88, 1.4]
] as const;

/** The effect behind a headline */
function BannerFx({ fx, glow }: { fx: Fx; glow: string }) {
  const dot = (i: number, cls: string, style: CSSProperties = {}) => {
    const [left, top, delay] = SPOTS[i % SPOTS.length];
    return <span key={i} className={`absolute pointer-events-none ${cls}`} style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s`, ...style }} aria-hidden />;
  };
  switch (fx) {
    case "rays":
      return (
        <>
          <div
            className="absolute left-1/2 top-[38%] w-[52rem] h-[52rem] -translate-x-1/2 -translate-y-1/2 pointer-events-none wn-spin"
            style={{ background: `repeating-conic-gradient(from 0deg, ${glow}26 0deg 6deg, transparent 6deg 18deg)` }}
            aria-hidden
          />
          {SPOTS.map((_, i) => dot(i, "w-1 h-1 rounded-full wn-twinkle", { background: "#fff7d6", boxShadow: `0 0 8px 2px ${glow}` }))}
        </>
      );
    case "embers":
      return <>{SPOTS.map((_, i) => dot(i, "w-1.5 h-1.5 rounded-full wn-ember", { top: "100%", background: i % 3 ? "#fdba74" : "#fde047", boxShadow: `0 0 10px 3px ${glow}`, animationDuration: `${2.6 + (i % 4) * 0.5}s` }))}</>;
    case "sparks":
      return (
        <>
          <div className="absolute inset-0 pointer-events-none wn-sheen" aria-hidden />
          {SPOTS.slice(0, 10).map((_, i) => dot(i, "w-3 h-0.5 rounded-full wn-spark", { left: "50%", top: "62%", background: "#fde68a", boxShadow: "0 0 6px 1px #f59e0b", ["--wn-angle" as string]: `${i * 36}deg` }))}
        </>
      );
    case "orbit":
      return (
        <>
          <div className="absolute left-1/2 top-[38%] w-[30rem] h-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none wn-spin" style={{ background: `conic-gradient(from 0deg, transparent, ${glow}33, transparent 30%, ${glow}22, transparent 70%)` }} aria-hidden />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="absolute left-1/2 top-[38%] w-0 h-0 pointer-events-none wn-orbit" style={{ animationDelay: `${-i * 1.5}s` }} aria-hidden>
              <span className="absolute w-2 h-2 rounded-full" style={{ left: `${120 + (i % 3) * 30}px`, background: "#f5d0fe", boxShadow: `0 0 12px 4px ${glow}` }} />
            </span>
          ))}
        </>
      );
    case "stars":
      return (
        <>
          <span className="absolute right-[12%] top-[10%] w-14 h-14 rounded-full pointer-events-none" style={{ boxShadow: "inset -10px 6px 0 0 #e0e7ff", filter: "drop-shadow(0 0 14px #a5b4fc)" }} aria-hidden />
          {SPOTS.map((_, i) => dot(i, "w-0.5 h-0.5 rounded-full wn-twinkle", { background: "#fff", boxShadow: "0 0 4px 1px #c7d2fe" }))}
          {[0, 1, 2].map((i) => dot(i * 4, "w-24 h-px wn-shooting", { background: "linear-gradient(90deg, transparent, #fff)", animationDelay: `${i * 2.3}s` }))}
        </>
      );
    case "claws":
      return (
        <div className="absolute inset-0 pointer-events-none wn-claws" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute h-1.5 rounded-full" style={{ left: "18%", top: `${28 + i * 14}%`, width: "64%", rotate: "-18deg", background: "linear-gradient(90deg, transparent, #fb7185 30%, #fff1f2 50%, #fb7185 70%, transparent)", boxShadow: `0 0 14px ${glow}` }} />
          ))}
        </div>
      );
    case "rain":
      return (
        <>
          <div className="absolute inset-0 pointer-events-none wn-rain" aria-hidden />
          <div className="absolute inset-0 pointer-events-none wn-lightning" style={{ background: "radial-gradient(70% 60% at 30% 0%, #e0f2feaa, transparent 70%)" }} aria-hidden />
        </>
      );
    case "sunrise":
      return (
        <>
          <div className="absolute left-1/2 bottom-[-12rem] w-72 h-72 -translate-x-1/2 rounded-full pointer-events-none wn-sun" style={{ background: "radial-gradient(circle, #fffbeb 0%, #fde68a 35%, #fb923c 60%, transparent 72%)" }} aria-hidden />
          <div
            className="absolute left-1/2 bottom-0 w-[60rem] h-[60rem] -translate-x-1/2 translate-y-1/2 pointer-events-none wn-spin"
            style={{ background: `repeating-conic-gradient(from 0deg, #fde68a1f 0deg 4deg, transparent 4deg 15deg)` }}
            aria-hidden
          />
        </>
      );
    case "gates":
      return (
        <>
          {/* Firelight through the open gates, breathing like a hearth */}
          <div className="absolute inset-x-0 bottom-0 h-3/4 pointer-events-none wn-hearth" style={{ background: "radial-gradient(60% 80% at 50% 100%, #fde68a66 0%, #f59e0b33 40%, transparent 75%)" }} aria-hidden />
          {/* The two gate leaves swing open, outwards, as the banner enters */}
          <div className="absolute inset-y-0 left-0 w-1/2 pointer-events-none wn-gate-left" style={{ background: "repeating-linear-gradient(90deg, #3b1d0a 0 22px, #2a1306 22px 24px)", boxShadow: "inset -6px 0 12px #00000080" }} aria-hidden />
          <div className="absolute inset-y-0 right-0 w-1/2 pointer-events-none wn-gate-right" style={{ background: "repeating-linear-gradient(90deg, #2a1306 0 2px, #3b1d0a 2px 24px)", boxShadow: "inset 6px 0 12px #00000080" }} aria-hidden />
          {/* A rope of lanterns across the top, each swinging gently */}
          <svg className="absolute inset-x-0 top-0 w-full h-6 pointer-events-none" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
            <path d="M0 2 Q 50 34 100 2" fill="none" stroke="#92400e" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          {LANTERNS.map(([left, sag, delay], i) => (
            <span key={i} className="absolute top-0 pointer-events-none wn-lantern" style={{ left: `${left}%`, paddingTop: sag, animationDelay: `${delay}s` }} aria-hidden>
              <span className="block mx-auto w-px h-2 bg-amber-800" />
              <span className="block w-3 h-4 rounded-[40%] wn-lantern-glow" style={{ background: "radial-gradient(circle at 50% 40%, #fffbeb, #fcd34d 45%, #ea580c 100%)", boxShadow: "0 0 14px 5px #f59e0b99", animationDelay: `${delay * 1.7}s` }} />
            </span>
          ))}
          {/* Warm motes drifting up from the hearth */}
          {SPOTS.map((_, i) => dot(i, "w-1 h-1 rounded-full wn-mote", { top: "100%", background: "#fef3c7", boxShadow: `0 0 8px 2px ${glow}`, animationDuration: `${4 + (i % 4) * 0.8}s` }))}
        </>
      );
    case "burst":
      return (
        <>
          <div className="absolute left-1/2 top-[40%] w-64 h-64 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none wn-shockwave" style={{ border: `3px solid ${glow}` }} aria-hidden />
          <div className="absolute left-1/2 top-[40%] w-64 h-64 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none wn-shockwave" style={{ border: "2px solid #c084fc", animationDelay: "1.2s" }} aria-hidden />
          {SPOTS.map((_, i) => dot(i, "w-1 h-1 rounded-full wn-twinkle", { background: "#fffbeb", boxShadow: `0 0 8px 2px ${glow}` }))}
        </>
      );
  }
}

const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, opts);

interface WhatsNewModalProps {
  /** "auto": the new notices not yet dismissed, with "Don't show again"; "all": every version, picked from a list (☰ menu) */
  mode: "auto" | "all";
  /** The notices to show in "auto" mode */
  notices?: UpdateNotice[];
  onClose: () => void;
  /** Opens a Guide Book chapter */
  onReadGuide?: (chapterId: string) => void;
}

/**
 * 📣 What's New: the realm's update notices, one page each, under a big headline whose design is the update's own.
 * "auto" shows the new ones once a visit until "Don't show again" (localStorage); "all" picks any weekly version.
 * Portalled to the body (it may open from the header).
 */
export function WhatsNewModal({ mode, notices = [], onClose, onReadGuide }: WhatsNewModalProps) {
  const [version, setVersion] = useState(UPDATE_VERSIONS[0]?.version ?? "v1.0");
  const picked = UPDATE_VERSIONS.find((v) => v.version === version) ?? UPDATE_VERSIONS[0];
  const list = mode === "auto" && notices.length ? notices : picked.notices;
  const [page, setPage] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const notice = list[Math.min(page, list.length - 1)];
  const accent = ACCENT[notice.accent];
  const banner = BANNERS[notice.banner] ?? BANNERS.gilded;
  const Icon = notice.icon;
  const last = page >= list.length - 1;

  const versionOptions = useMemo(
    () =>
      UPDATE_VERSIONS.map((v, i) => ({
        value: v.version,
        label: `${v.version}${v.title ? ` · ${v.title}` : ""}`,
        sublabel: `${fmtDate(v.from, { day: "numeric", month: "short" })} – ${fmtDate(v.to, { day: "numeric", month: "short", year: "numeric" })} · ${v.notices.length} update${v.notices.length === 1 ? "" : "s"}${i === 0 ? " · latest" : ""}`
      })),
    []
  );

  const close = () => {
    if (mode === "auto" && dontShow) dismissNotices(list.map((u) => u.id));
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  const go = (to: number) => {
    const next = Math.max(0, Math.min(list.length - 1, to));
    if (next === page) return;
    sound.playClick();
    setPage(next);
  };
  const stepRef = useRef((d: number) => go(page + d));
  stepRef.current = (d: number) => go(page + d);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === "ArrowRight") stepRef.current(1);
      else if (e.key === "ArrowLeft") stepRef.current(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the current page's pill in view in the picker (phones show two or three at a time)
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pickerRef.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [page, version]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-labelledby="whats-new-title"
        tabIndex={-1}
        className="relative w-full sm:max-w-2xl h-dvh sm:h-[min(46rem,90vh)] flex flex-col bg-slate-950 sm:rounded-2xl border-0 sm:border overflow-hidden text-slate-200 outline-none"
        style={{ borderColor: `${banner.glow}88`, boxShadow: `0 0 0 1px ${banner.glow}33, 0 0 60px ${banner.glow}55, 0 30px 80px rgba(0,0,0,0.6)` }}
      >
        {/* Banner: the update's own backdrop and effect behind the headline */}
        <div key={`banner-${notice.id}`} className="relative shrink-0 overflow-hidden px-5 pt-6 pb-5 sm:px-8 sm:pt-8 text-center" style={{ background: banner.backdrop(accent) }}>
          <BannerFx fx={banner.fx} glow={banner.glow} />
          <button
            onClick={close}
            className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-300 hover:text-white hover:bg-white/10 transition"
            title="Close (Esc)"
            aria-label="Close"
          >
            <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/20 bg-black/30 text-slate-300">Esc</kbd>
            <X className="w-5 h-5" />
          </button>

          <div className="relative">
            <div className={`flex items-center justify-center gap-2 text-[11px] sm:text-xs uppercase tracking-[0.3em] font-bold whatsnew-rise ${banner.eyebrow}`}>
              <Sparkles className="w-3.5 h-3.5" />
              What's New · {versionOf(notice.date)}
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div
              className="mx-auto mt-4 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center whatsnew-rise"
              style={{
                animationDelay: "0.08s",
                background: `radial-gradient(circle at 35% 30%, #fff7d6, ${banner.glow} 45%, ${accent.deep} 100%)`,
                boxShadow: `0 0 0 3px #fde68a99, 0 0 0 6px ${accent.deep}, 0 0 40px 8px ${banner.glow}aa`
              }}
            >
              <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-slate-950" strokeWidth={2.2} />
            </div>
            <h2
              id="whats-new-title"
              className={`mt-4 font-medieval text-4xl sm:text-6xl leading-[1.05] whatsnew-title ${banner.enter}`}
              style={{
                backgroundImage: banner.text,
                letterSpacing: banner.tracking,
                filter: `drop-shadow(0 0 18px ${banner.glow}aa) drop-shadow(0 3px 0 rgba(0,0,0,0.55))`
              }}
            >
              {notice.title}
            </h2>
            <p className="mt-3 text-sm sm:text-base font-semibold text-white/95 whatsnew-rise" style={{ animationDelay: "0.24s", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
              {notice.tagline}
            </p>
            <p className="mt-1 text-[11px] text-slate-200/75 whatsnew-rise" style={{ animationDelay: "0.28s" }}>
              {fmtDate(notice.date)}
              {list.length > 1 && ` · ${page + 1} of ${list.length}`}
            </p>
          </div>
        </div>

        {/* Version picker (☰ → What's New) */}
        {mode === "all" && UPDATE_VERSIONS.length > 1 && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-slate-800 bg-slate-900">
            <span className="text-[11px] font-semibold text-slate-400 shrink-0">Version</span>
            <Combobox
              options={versionOptions}
              value={version}
              onChange={(v) => {
                sound.playClick();
                setVersion(v);
                setPage(0);
              }}
              searchable={false}
              size="sm"
              className="flex-1 min-w-0"
              ariaLabel="Pick a version"
            />
          </div>
        )}

        {/* Page picker */}
        {list.length > 1 && (
          <div ref={pickerRef} className="shrink-0 flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-slim border-y border-slate-800 bg-slate-900/80">
            {list.map((u, i) => {
              const PageIcon = u.icon;
              const on = i === page;
              const glow = (BANNERS[u.banner] ?? BANNERS.gilded).glow;
              return (
                <button
                  key={u.id}
                  onClick={() => go(i)}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition ${on ? "text-slate-950" : "text-slate-300 border-slate-700 hover:border-slate-500 hover:text-white"}`}
                  style={on ? { background: glow, borderColor: glow } : undefined}
                  aria-current={on ? "page" : undefined}
                  title={u.title}
                >
                  <PageIcon className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">{u.title}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div key={`body-${notice.id}`} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 sm:px-8 sm:py-5 whatsnew-rise" style={{ animationDelay: "0.2s" }}>
          <p className="text-sm leading-relaxed text-slate-200">{notice.body}</p>
          {notice.highlights && notice.highlights.length > 0 && (
            <ul className="mt-4 space-y-2">
              {notice.highlights.map((h, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-slate-200">
                  <span className="mt-1.5 w-2 h-2 shrink-0 rotate-45 rounded-[2px]" style={{ background: banner.glow, boxShadow: `0 0 8px ${banner.glow}` }} aria-hidden />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}
          {notice.guideChapter && onReadGuide && (
            <button
              onClick={() => {
                sound.playClick();
                if (mode === "auto" && dontShow) dismissNotices(list.map((u) => u.id));
                onReadGuide(notice.guideChapter!);
              }}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200"
            >
              <BookOpen className="w-3.5 h-3.5" /> Read the whole chapter in the Guide Book
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 sm:px-8 border-t border-slate-800 bg-slate-900/90 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {mode === "auto" ? (
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none mr-auto">
              <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} className="w-4 h-4 accent-amber-500" />
              Don't show again
            </label>
          ) : (
            <span className="text-[11px] text-slate-500 mr-auto">
              {picked.version} · {list.length} update{list.length === 1 ? "" : "s"}
            </span>
          )}
          {list.length > 1 && (
            <button
              onClick={() => go(page - 1)}
              disabled={page === 0}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Previous notice"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
          <button
            onClick={() => (last ? close() : go(page + 1))}
            className="flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-bold text-slate-950 transition hover:brightness-110"
            style={{ background: "linear-gradient(180deg, #fde68a, #f59e0b)", boxShadow: `0 0 18px ${banner.glow}88` }}
          >
            {last ? "To the realm!" : "Next"}
            {!last && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
