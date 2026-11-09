import { useEffect } from "react";
import { RealmStatus } from "@/types";
import { ScrollText, Compass, RefreshCw, X } from "lucide-react";

interface BottomTickerProps {
  status: RealmStatus | null;
  viewMode: 'world_map' | 'city_view';
  /** A personal alert (e.g. one of your marches was repelled), shown in red until dismissed or for 30 s */
  alert?: { id: string; text: string } | null;
  onDismissAlert?: () => void;
}

const ALERT_MS = 30_000;

export function BottomTicker({ status, viewMode, alert, onDismissAlert }: BottomTickerProps) {
  useEffect(() => {
    if (!alert || !onDismissAlert) return;
    const id = setTimeout(onDismissAlert, ALERT_MS);
    return () => clearTimeout(id);
  }, [alert, onDismissAlert]);

  const latestEvent = status?.recentEvents?.[0]?.text || "The 3D Planetary Realm of Git turns peacefully under sovereign care.";
  const backfill = status?.backfill;

  return (
    <footer className="absolute bottom-0 inset-x-0 z-20 flex items-center justify-between gap-4 px-3 sm:px-4 py-2 bg-slate-950/85 backdrop-blur-md border-t border-slate-800/80 text-xs text-slate-300 select-none">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="flex items-center gap-1 font-bold text-amber-400 whitespace-nowrap">
          <ScrollText className="w-4 h-4" />
          <span className="hidden sm:inline">Chronicle</span>
        </span>
        {alert ? (
          <span className="flex items-center gap-1.5 min-w-0 px-2.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/70 text-rose-100 font-semibold shadow-lg shadow-rose-950/50 animate-pulse">
            <span className="truncate">{alert.text}</span>
            {onDismissAlert && (
              <button type="button" onClick={onDismissAlert} className="shrink-0 text-rose-300 hover:text-white" aria-label="Dismiss">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        ) : (
          <span className="truncate text-slate-200 font-medium">
            {latestEvent}
          </span>
        )}
      </div>

      {(status?.syncing || backfill?.isRunning) && (
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-700/60 text-[11px] text-emerald-300 font-medium shrink-0">
          <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
          {status?.syncing ? (
            <span>⚡ Live Syncing recent activity…</span>
          ) : backfill ? (
            <span>
              📦 Backfill: {backfill.backfilled}/{backfill.total} repos ({backfill.percent}%) • {backfill.totalCommits.toLocaleString()} commits
            </span>
          ) : null}
        </div>
      )}

      <div className="hidden lg:flex items-center gap-2 shrink-0 text-[11px] text-slate-400 font-medium">
        <Compass className="w-3.5 h-3.5 text-amber-400" />
        {viewMode === "world_map" ? (
          <span>
            🌍 <b>Drag</b> to move • <b>Ctrl + drag</b> to rotate • <b>Scroll</b> to zoom • <b>Click any castle</b> to enter
          </span>
        ) : (
          <span>
            🏰 <b>Drag</b> to move • <b>Ctrl + drag</b> to rotate • <b>Scroll</b> to zoom • <b>Click a building</b> for details
          </span>
        )}
      </div>
    </footer>
  );
}
