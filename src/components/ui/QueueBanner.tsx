import { ChevronRight, LucideIcon } from "lucide-react";

const TONES = {
  parchment: "border-amber-700/60 from-amber-950/90 via-slate-900/90 to-amber-950/90 text-amber-100 hover:border-amber-500",
  star: "border-sky-500/60 from-indigo-950/90 via-slate-900/90 to-indigo-950/90 text-sky-100 hover:border-sky-400"
} as const;

/**
 * A top-left banner for managers counting work that waits on them (📜 deeds to seal, 🌠 new omens), the same pattern
 * as the admin validations banner. Hidden at zero.
 */
export function QueueBanner({ count, Icon, label, tone = "parchment", onClick, title }: { count: number; Icon: LucideIcon; label: string; tone?: keyof typeof TONES; onClick: () => void; title?: string }) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl border bg-linear-to-r ${TONES[tone]} text-xs font-semibold backdrop-blur-md shadow-2xl transition hover:brightness-110 active:scale-[0.99] cursor-pointer group`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="p-1 rounded-lg bg-white/10 shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <span className="font-medieval tracking-wide truncate">{label}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 border border-white/20">{count}</span>
        <ChevronRight className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 transition" />
      </span>
    </button>
  );
}
