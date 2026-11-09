import { useState } from "react";
import { BookOpen, ChevronRight, X } from "lucide-react";
import { RealmStatus } from "@/types";

const DISMISSED_KEY = "gitTea.chronicleBannerDismissed";

function dismissedId(): number | null {
  try {
    const v = window.localStorage.getItem(DISMISSED_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function rememberDismissed(id: number) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(id));
  } catch {
    // Private window or blocked storage: the banner just comes back on the next visit
  }
}

/**
 * 📖 The weekly story's banner (GAME_GUIDE §14): top left, for a week after the Crown publishes a story, until the
 * viewer reads it (it opens the Codex's Chronicles) or closes it. Remembered per browser.
 */
export function ChronicleBanner({ chronicle, onRead }: { chronicle: RealmStatus["chronicle"]; onRead: () => void }) {
  const [closed, setClosed] = useState<number | null>(dismissedId);
  if (!chronicle || closed === chronicle.id) return null;
  const close = () => {
    rememberDismissed(chronicle.id);
    setClosed(chronicle.id);
  };
  return (
    <div className="w-full flex items-stretch rounded-2xl border border-violet-400/50 bg-linear-to-r from-violet-950/90 via-slate-900/90 to-amber-950/90 text-amber-100 backdrop-blur-md shadow-2xl animate-fadeIn">
      <button
        type="button"
        onClick={() => {
          close();
          onRead();
        }}
        title="Read this week's story in the Royal Codex"
        className="flex-1 min-w-0 flex items-center gap-2 pl-3.5 pr-2 py-2.5 text-left hover:brightness-110 cursor-pointer group"
      >
        <span className="p-1 rounded-lg bg-white/10 shrink-0">
          <BookOpen className="w-4 h-4 text-amber-300" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] uppercase tracking-[0.2em] text-violet-200/80 font-bold">The Weekly Chronicle</span>
          <span className="block font-medieval tracking-wide text-xs font-semibold truncate">{chronicle.title}</span>
        </span>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:translate-x-0.5 transition" />
      </button>
      <button type="button" onClick={close} aria-label="Close the banner" className="px-2.5 border-l border-white/10 text-slate-400 hover:text-white">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
