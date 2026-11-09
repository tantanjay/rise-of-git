import { useMemo } from "react";
import { PlotFx } from "./parts";
import { TierFx, TierFxItem } from "@/components/3d/TierFx";

/*
 * The city's rarity effects, instanced over the whole city (TierFx: curtain of light, particles): the epic aura of
 * ★★★★ buildings, the legendary kit of red-star plots, the mythic kit of the Archon's Celestial plots, and a Wonder
 * or Empyrean town hall (`extra`). Building plots never get a beam, so a maxed city reads as glowing plots, not a
 * forest of pillars; only the town hall keeps its beam. Nothing here casts shadows.
 */

/** Plot effects as kit items (seeded by position, so every viewer sees the same shimmer); no beam over a plot */
export const plotFxItems = (fx: PlotFx[]): TierFxItem[] =>
  fx.map((f) => ({ id: `plot-${f.x.toFixed(1)},${f.z.toFixed(1)}`, x: f.x, y: 0, z: f.z, size: f.size, tier: f.tier, color: f.color, accent: f.accent, beam: 0 }));

export function PlotLegendFx({ fx, extra }: { fx: PlotFx[]; extra?: TierFxItem[] }) {
  const items = useMemo(() => [...plotFxItems(fx), ...(extra ?? [])], [fx, extra]);
  return items.length > 0 ? <TierFx items={items} /> : null;
}
