import { Shield } from "lucide-react";
import { ActiveMarch } from "@/types";
import { CIV_DEMOGRAPHICS } from "@/utils/civDemographics";
import { CIV_EMBLEM, stationedAt } from "@/utils/war";

/**
 * Reinforcements stationed at a castle or frontier gate: the total, the viewer's own and their allies', and each
 * sender. Only rendered for viewers of the host's civilization (enemies see these numbers only through the fog).
 */
export function StationedTroops({
  marches,
  hostId,
  viewerId,
  cap,
  className = ""
}: {
  marches: ActiveMarch[];
  hostId: string;
  viewerId?: string | null;
  /** Frontier gates: garrison + troops on duty never exceed this */
  cap?: number;
  className?: string;
}) {
  const s = stationedAt(marches, hostId, viewerId);
  const split = s.yours > 0 && s.allies > 0 ? ` — yours ${s.yours.toLocaleString()}, allies ${s.allies.toLocaleString()}` : s.yours > 0 ? " — all yours" : "";
  return (
    <div className={`p-2 rounded-lg border border-indigo-500/40 bg-indigo-950/30 text-[11px] text-indigo-100 space-y-1 ${className}`}>
      <div className="flex items-center gap-1.5 font-bold font-mono flex-wrap">
        <Shield className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
        <span>
          Reinforcements: {s.total.toLocaleString()}
          <span className="font-normal text-indigo-300">{split}</span>
        </span>
        {cap !== undefined && <span className="ml-auto font-normal text-slate-400">holds {cap.toLocaleString()} with its garrison</span>}
      </div>
      {s.groups.map((g) => (
        <div key={g.ownerId} className="flex items-center justify-between gap-2 font-mono">
          <span className="truncate text-slate-200">
            {CIV_EMBLEM[g.civ]} {g.ownerId === viewerId ? `${g.ownerName} (you)` : g.ownerName}
          </span>
          <span className="shrink-0 text-slate-300">
            {g.count.toLocaleString()}× {CIV_DEMOGRAPHICS[g.civ].soldierUnit.name}
          </span>
        </div>
      ))}
      {s.total === 0 && <div className="text-slate-400">No troops stationed here.</div>}
      {s.onTheWay > 0 && <div className="text-slate-400">+{s.onTheWay.toLocaleString()} more on the way</div>}
    </div>
  );
}
