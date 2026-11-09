import { Lock } from "lucide-react";

/**
 * "Coming soon": a Codex entry shown ahead of its feature (not in the realm yet), the same mark on every teaser.
 * `line` under its name in a list, `chip` beside its title, `ribbon` over its 3D preview's corner.
 */
export function SoonBadge({ variant = "chip", title = "Not in the realm yet" }: { variant?: "chip" | "ribbon" | "line"; title?: string }) {
  if (variant === "line")
    return (
      <span title={title} className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-rose-300">
        <Lock className="w-3 h-3" /> Coming soon
      </span>
    );
  if (variant === "ribbon")
    return (
      <div
        title={title}
        className="pointer-events-none absolute left-2 bottom-2 flex items-center gap-1.5 px-2.5 h-7 rounded-md border border-rose-500/60 bg-rose-950/85 text-rose-300 text-[11px] font-bold uppercase tracking-wider shadow-lg"
      >
        <Lock className="w-3.5 h-3.5" /> Coming soon · not in the realm yet
      </div>
    );
  return (
    <span title={title} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-rose-500/60 bg-rose-950 text-rose-300 text-[10px] font-bold uppercase tracking-wider">
      <Lock className="w-3 h-3" /> Coming soon
    </span>
  );
}
