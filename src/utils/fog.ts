import { FogRange, ScoutEstimate, ScoutReport } from "@/types";
import { formatCompact } from "./format";
import { formatAgo } from "./war";

type EstimateKey = "garrison" | "population" | "wallHp";

/**
 * A fogged number from the viewer's scout report: the server's projection to now, or the scouted value
 * itself when there is no projection. Undefined = not scouted (unknown).
 */
export function fogRange(report: ScoutReport | null | undefined, key: EstimateKey): FogRange | undefined {
  if (!report) return undefined;
  const est = report.estimate?.[key];
  if (est) return est;
  const seen = report.details[key];
  return seen === undefined ? undefined : { lo: seen, hi: seen };
}

/** A treasury line (bulk resource or gem) from the report, projected to now */
export function fogTreasury(report: ScoutReport | null | undefined, key: string): FogRange | undefined {
  if (!report) return undefined;
  const est: ScoutEstimate | undefined = report.estimate;
  const projected = (est?.treasury as Record<string, FogRange> | undefined)?.[key] ?? est?.scarce?.[key];
  if (projected) return projected;
  const seen = (report.details.treasury as Record<string, number> | undefined)?.[key] ?? report.details.scarce?.[key];
  return seen === undefined ? undefined : { lo: seen, hi: seen };
}

/** "~1,240" while still exact, "~1,240–1,610" once it may have changed since the scouts looked, "?" when unknown */
export function fogText(r: FogRange | undefined, compact = false): string {
  if (!r) return "?";
  const f = compact ? formatCompact : (n: number) => n.toLocaleString();
  return r.lo === r.hi ? `~${f(r.lo)}` : `~${f(r.lo)}–${f(r.hi)}`;
}

/** Tooltip line explaining a fogged figure */
export function fogHint(report: ScoutReport | null | undefined): string {
  if (!report) return "Unknown: send 👁️ scouts to see it";
  const h = report.estimate?.harvests ?? 0;
  return `Scouted ${formatAgo(report.takenAt)}${h ? `, projected over ${h} harvest${h === 1 ? "" : "s"} since` : ""}`;
}
