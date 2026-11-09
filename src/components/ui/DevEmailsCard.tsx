import { Mail } from "lucide-react";
import { sound } from "@/hooks/useSound";

/** Admin → Developer Emails: how many commit emails nobody owns, and the button to the matching window */
export function DevEmailsCard({ unmatched, onOpen }: { unmatched: number | null; onOpen: () => void }) {
  return (
    <div className="p-4 rounded-xl border border-slate-700/80 bg-slate-900/80 flex items-start gap-3">
      <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 shrink-0 mt-0.5">
        <Mail className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 flex-wrap">
          Developer Emails
          {unmatched !== null && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                unmatched > 0 ? "bg-amber-950/80 text-amber-300 border-amber-500/40" : "bg-emerald-950/80 text-emerald-300 border-emerald-500/30"
              }`}
            >
              {unmatched > 0 ? `${unmatched} UNMATCHED` : "ALL MATCHED"}
            </span>
          )}
        </h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          A commit counts for a developer only when its author email is linked to them. Commits made with a laptop's default email or a personal address stay unmatched: open the list and match each email to the developer who made it.
        </p>
      </div>
      <button
        onClick={() => {
          sound.playClick();
          onOpen();
        }}
        className="self-center shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-b from-sky-500 to-sky-700 hover:from-sky-400 hover:to-sky-600 text-white text-xs font-bold shadow-lg shadow-sky-950/50 border border-sky-400/40 transition active:scale-95 cursor-pointer"
      >
        <Mail className="w-4 h-4" /> Open
      </button>
    </div>
  );
}
