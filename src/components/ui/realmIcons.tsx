import { Bug, Building2, Feather, Folder, HandHeart, Inbox, Landmark, Lightbulb, LucideIcon, Scale, ScrollText, Sparkles, Telescope } from "lucide-react";
import type { OmenKind, WatchTreeNode } from "@/types";

/*
 * The line icons of the Scriptorium, the Watchtower and Omens (lucide, as in the top bar), in one place so every
 * window draws a Division, a Client or a project the same way. Text still never wears a series colour; these sit
 * beside it in their own accent.
 */

export const TREE_ICON: Record<WatchTreeNode["kind"], { Icon: LucideIcon; cls: string }> = {
  division: { Icon: Landmark, cls: "text-amber-300" },
  client: { Icon: Building2, cls: "text-sky-300" },
  project: { Icon: Folder, cls: "text-amber-400" },
  unsorted: { Icon: Inbox, cls: "text-slate-400" }
};

/** A tree node's icon at a given size (Tailwind size class) */
export function TreeIcon({ kind, size = "w-3.5 h-3.5" }: { kind: WatchTreeNode["kind"]; size?: string }) {
  const { Icon, cls } = TREE_ICON[kind];
  return <Icon className={`${size} ${cls} shrink-0`} />;
}

export const OMEN_ICON: Record<OmenKind, LucideIcon> = { bug: Bug, idea: Lightbulb, balance: Scale, praise: HandHeart, other: Sparkles };

/** The rounded tile a window's header shows its icon in */
export function HeaderTile({ Icon, tone }: { Icon: LucideIcon; tone: "amber" | "sky" | "indigo" }) {
  const tones = {
    amber: "bg-amber-950 border-amber-600/60 text-amber-300 shadow-amber-950/50",
    sky: "bg-sky-950 border-sky-600/60 text-sky-300 shadow-sky-950/50",
    indigo: "bg-indigo-950 border-sky-500/50 text-sky-200 shadow-indigo-950/60"
  };
  return (
    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-lg shrink-0 ${tones[tone]}`}>
      <Icon className="w-5 h-5" />
    </div>
  );
}

export { Feather as ScriptoriumIcon, ScrollText as DeedIcon, Telescope as WatchtowerIcon, Sparkles as OmenIcon };
