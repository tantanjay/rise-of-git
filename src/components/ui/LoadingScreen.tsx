import { useEffect, useRef, useState } from "react";
import { Castle } from "lucide-react";
import { LOAD_SPANS, loadProgress, useLoadState, type LoadStage } from "@/utils/loadingScreen";

/** Hints shown while the realm loads, one at a time */
const TIPS = [
  "Every repository you commit to rises as a building in your city.",
  "A well-rounded city raises its castle faster than one giant repository.",
  "Drag to pan the map; Ctrl or Shift + drag (or a right-drag) turns it.",
  "Pick a kingdom from the picker to glide to its castle, then press Enter to step inside.",
  "On a slow laptop, ☰ → Game settings → Graphics: Normal runs on any machine.",
  "The Royal Codex in the ☰ menu holds every rule, model and sound of the realm.",
  "Night harvests favour the moon gems; day harvests the sun gems.",
  "Five civilizations share the realm, each with a Unique Trait of its own.",
  "Send scouts before you march: they tell you what a kingdom holds.",
  "Signed in, a golden beacon over your castle shows you home on the map."
];

/** How long a tip stays before the next */
const TIP_MS = 6500;
/** The fade out once the view is on screen: slow after the first load, quick on a trip between the map and a city */
const FADE_MS = 450;
const QUICK_FADE_MS = 150;
/** A step that cannot count its work creeps towards this share of itself */
const CREEP_SHARE = 0.85;

const STAGE_TEXT: Record<LoadStage, string> = {
  realm: "Reading the realm's chronicles…",
  land: "Charting the land…",
  castles: "Raising castles and banners…",
  forge: "Forging the colours of the realm…",
  torches: "Lighting the torches…"
};

/** Embers rising behind the emblem: fixed spots so every load looks the same */
const EMBERS = [8, 17, 26, 34, 43, 51, 60, 68, 77, 85, 92].map((left, i) => ({
  left,
  delay: (i * 0.73) % 4.2,
  duration: 5 + ((i * 1.7) % 3),
  size: 2 + (i % 3)
}));

/**
 * The full-screen loading screen: from signing in until the realm's first frames are on screen (and on every trip
 * between the map and a city). It covers the top bar and every window, so nothing half-built shows and no popup opens
 * while the page is busy. Its emblem, embers and bar are CSS transform animations, which the browser keeps moving on
 * its compositor even while the page is blocked building the view; the bar's target is the real step reported through
 * `setLoadStage` (src/utils/loadingScreen.ts).
 */
export function LoadingScreen({
  active,
  view,
  syncing = false,
  error,
  quick = false,
  onHidden
}: {
  active: boolean;
  view: "world_map" | "city_view";
  /** The first Git sync is still running on the server */
  syncing?: boolean;
  error?: string | null;
  /** Called once it has faded out */
  /** A trip between views rather than the first load: it fades out quickly */
  quick?: boolean;
  onHidden?: () => void;
}) {
  const load = useLoadState();
  const fadeMs = quick ? QUICK_FADE_MS : FADE_MS;
  // "shown" while active, "fading" for fadeMs after, then gone
  const [phase, setPhase] = useState<"shown" | "fading" | "gone">(active ? "shown" : "gone");
  const hiddenRef = useRef(onHidden);
  hiddenRef.current = onHidden;

  useEffect(() => {
    if (active) {
      setPhase("shown");
      return;
    }
    setPhase((p) => (p === "gone" ? p : "fading"));
    const t = setTimeout(() => {
      setPhase("gone");
      hiddenRef.current?.();
    }, fadeMs);
    return () => clearTimeout(t);
  }, [active, fadeMs]);

  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    if (phase === "gone") return;
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), TIP_MS);
    return () => clearInterval(t);
  }, [phase]);

  if (phase === "gone") return null;

  // The bar heads for the reported point (a piece of work reports where the bar stands once it is done, before it runs,
  // so the bar moves while it runs); a step that cannot count its work creeps on towards its end, slowing, so it keeps
  // moving while the page is blocked doing it
  const [a, b] = LOAD_SPANS[load.stage];
  const done = phase === "fading";
  const target = done ? 1 : load.frac > 0 ? loadProgress(load) : a + (b - a) * CREEP_SHARE;
  const ease = done ? "0.3s ease-out" : load.frac > 0 ? "1.2s cubic-bezier(0.2, 0.8, 0.3, 1)" : "3.5s cubic-bezier(0.15, 0.8, 0.3, 1)";
  const text = syncing
    ? "Summoning live kingdoms from Git — reading users, repositories and commits…"
    : load.stage === "castles" && view === "city_view"
      ? "Raising the kingdom…"
      : STAGE_TEXT[load.stage];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!done}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 text-center"
      style={{ opacity: done ? 0 : 1, transition: `opacity ${fadeMs}ms ease-in`, pointerEvents: done ? "none" : "auto" }}
    >
      {/* A warm glow behind the emblem */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(217,119,6,0.18), rgba(15,23,42,0) 55%)" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3">
        {EMBERS.map((e, i) => (
          <span
            key={i}
            className="loading-ember absolute bottom-0 rounded-full bg-amber-400"
            style={{ left: `${e.left}%`, width: e.size, height: e.size, animationDelay: `${e.delay}s`, animationDuration: `${e.duration}s` }}
          />
        ))}
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center gap-5">
        <div className="relative h-24 w-24">
          <div className="absolute inset-0 rounded-full border-2 border-amber-500/15" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-400 border-r-amber-400/40 [animation-duration:1.6s]" />
          <div className="absolute inset-3 animate-spin rounded-full border border-transparent border-b-amber-300/60 [animation-direction:reverse] [animation-duration:2.4s]" />
          <Castle className="absolute inset-0 m-auto h-10 w-10 text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" strokeWidth={1.5} />
        </div>

        <h1 className="font-medieval text-3xl tracking-wide text-amber-200 sm:text-4xl">Rise of Git</h1>

        <div className="w-full max-w-xs">
          <div className="h-2 w-full overflow-hidden rounded-full border border-amber-900/60 bg-slate-900">
            <div
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-200 will-change-transform"
              style={{ transform: `scaleX(${target})`, transition: `transform ${ease}` }}
            />
          </div>
          <p className="mt-3 min-h-[2.5rem] font-medieval text-sm tracking-wide text-amber-100/90">{text}</p>
        </div>

        {error && <p className="font-mono text-xs text-red-400">{error}</p>}

        <p key={tip} className="loading-tip max-w-xs text-xs leading-relaxed text-slate-400 sm:text-sm">
          <span className="font-semibold text-amber-300/80">Tip · </span>
          {TIPS[tip]}
        </p>
      </div>
    </div>
  );
}
