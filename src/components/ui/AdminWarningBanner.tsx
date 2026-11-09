import { AlertTriangle, ChevronRight } from "lucide-react";

interface AdminWarningBannerProps {
  warningsCount: number;
  onClick: () => void;
}

export function AdminWarningBanner({ warningsCount, onClick }: AdminWarningBannerProps) {
  if (warningsCount <= 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl border border-amber-500/60 bg-gradient-to-r from-amber-950/90 via-slate-900/90 to-amber-950/90 text-amber-200 text-xs font-semibold backdrop-blur-md shadow-2xl transition hover:border-amber-400 hover:brightness-110 active:scale-[0.99] cursor-pointer group"
      title="Click to review and resolve system validation warnings"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-amber-300" />
        </div>
        <span className="font-medieval tracking-wide text-amber-200 text-xs truncate">
          ⚠️ {warningsCount} warning{warningsCount > 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 group-hover:bg-amber-500/30 transition">
          REVIEW
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-amber-400/80 group-hover:translate-x-0.5 transition" />
      </div>
    </button>
  );
}
