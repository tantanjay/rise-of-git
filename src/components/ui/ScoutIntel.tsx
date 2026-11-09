import { ScoutReport, NodeStatus, SCARCE_RESOURCES } from "@/types";
import { CIV_DEMOGRAPHICS, WALL_TIER_NAMES } from "@/utils/civDemographics";
import { CIV_EMBLEM, formatAgo } from "@/utils/war";
import { formatCompact } from "@/utils/format";
import { fogText, fogTreasury } from "@/utils/fog";
import { Eye, EyeOff } from "lucide-react";

const RES_EMOJI: Record<string, string> = { gold: "🪙", iron: "⚙️", stone: "🪨", lumber: "🪵", food: "🌾" };

/** Fogged view: what can be seen from outside (or a band for packs and nodes), with a hint to scout */
export function FogNotice({ lines, scoutedAt }: { lines: Array<[string, string]>; scoutedAt?: number | null }) {
  return (
    <div className="p-3 rounded-xl border border-slate-600/50 bg-slate-900/60 space-y-1.5 text-xs font-mono">
      <div className="flex items-center justify-between text-slate-300 font-bold">
        <span className="flex items-center gap-1.5">
          <EyeOff className="w-3.5 h-3.5 text-slate-400" /> Fog of war
        </span>
        <span className="text-[10px] text-slate-500 font-normal">{scoutedAt ? `scouted ${formatAgo(scoutedAt)}` : "not scouted"}</span>
      </div>
      {lines.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between">
          <span className="text-slate-400">{label}</span>
          <span className="text-slate-200">{value}</span>
        </div>
      ))}
      {!scoutedAt && <p className="text-[10px] text-slate-500">Send 👁️ scouts to find out.</p>}
    </div>
  );
}

/**
 * Everything a scout report says. Kingdoms' people, soldiers, walls and treasury show as `~scouted–estimate`:
 * the server projects them to now from the report alone (they read `~N` while nothing can have changed).
 */
export function ScoutIntel({ report, compact = false }: { report: ScoutReport; compact?: boolean }) {
  const d = report.details;
  const est = report.estimate;
  const rows: Array<[string, string]> = [];
  if (d.cityHallLevel !== undefined) rows.push(["City Hall", `Lv ${d.cityHallLevel}`]);
  if (d.garrison !== undefined) rows.push(["Garrison", `${est?.garrison ? fogText(est.garrison) : d.garrison.toLocaleString()}${d.maxGarrison ? ` / ${d.maxGarrison.toLocaleString()}` : ""}`]);
  if (d.population !== undefined) rows.push(["Population", `${est?.population ? fogText(est.population) : d.population.toLocaleString()}${d.maxPopulation ? ` / ${d.maxPopulation.toLocaleString()}` : ""}`]);
  if (d.soldiersAway) rows.push(["Soldiers away", d.soldiersAway.toLocaleString()]);
  if (d.packRemaining !== undefined) rows.push(["Pack", `${d.packRemaining.toLocaleString()}${d.packSize ? ` / ${d.packSize.toLocaleString()}` : ""}${d.unitName ? ` × ${d.unitName}` : ""}`]);
  if (d.packGear) rows.push(["Gear", `${d.packGear.emblem} ${d.packGear.name}${d.packGear.id === "ragged" ? "" : ` (${d.packGear.description})`}`]);
  if (d.unitStats) rows.push([d.unitName ?? "Unit", `${d.unitStats.hp} HP · ${d.unitStats.atk} ATK · ${d.unitStats.def} DEF`]);
  if (d.trait) rows.push(["Trait", d.trait]);
  if (d.wallTier !== undefined) rows.push(["Walls", `${WALL_TIER_NAMES[d.wallTier] ?? "Unwalled"} (T${d.wallTier})`]);
  if (d.wallHp !== undefined && d.wallMaxHp) rows.push(["Wall HP", `${est?.wallHp ? fogText(est.wallHp) : d.wallHp.toLocaleString()} / ${d.wallMaxHp.toLocaleString()}${d.burning ? " 🔥" : ""}`]);
  if (d.chest) rows.push(["Chest", d.chest === "hoard" ? "a great hoard" : `a ${d.chest} chest`]);
  if (d.civilization && d.civilization !== "arcane" && (report.targetKind === "kingdom" || report.targetKind === "npc_kingdom")) rows.push(["Civilization", CIV_DEMOGRAPHICS[d.civilization].name]);
  if (d.bossHp !== undefined && d.bossMaxHp) rows.push(["Shared HP", `${d.bossHp.toLocaleString()} / ${d.bossMaxHp.toLocaleString()} (${Math.round((d.bossHp / d.bossMaxHp) * 100)}%)`]);
  for (const sk of d.skills ?? []) rows.push(["Skill", sk]);
  if (d.grudgeStacks) rows.push(["Resolve", `×${d.grudgeStacks} (+${d.grudgeStacks * 20}% HP / ATK / DEF)`]);
  if (d.lastBattle) rows.push(["Last battle", `${d.lastBattle.attackerName} ${d.lastBattle.attackerWon ? "won" : "was repelled"} · ${formatAgo(Date.parse(d.lastBattle.at))}`]);

  const money = d.treasury ?? d.loot;
  return (
    <div className={`p-3 rounded-xl border space-y-1.5 text-xs font-mono ${d.doubtful ? "border-amber-500/70 bg-amber-950/15" : "border-sky-500/40 bg-sky-950/20"}`}>
      <div className="flex items-center justify-between text-sky-300 font-bold">
        <span className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" /> Scout report
        </span>
        <span className="text-[10px] text-slate-400 font-normal" title={est?.harvests ? `Projected over ${est.harvests} harvest${est.harvests === 1 ? "" : "s"} since` : undefined}>
          seen {formatAgo(report.takenAt)}
          {est?.harvests ? ` · ${est.harvests} harvest${est.harvests === 1 ? "" : "s"} ago` : ""}
        </span>
      </div>
      {d.doubtful && (
        <p className="px-2 py-1 rounded border border-amber-500/60 bg-amber-950/40 text-amber-200 font-sans text-[11px]">
          ⚠️ This intel feels doubtful: your spymasters think the scouts were fed lies. Scout again to be sure.
        </p>
      )}
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3">
          <span className="text-slate-400 shrink-0">{label}</span>
          <span className="text-slate-100 text-right">{value}</span>
        </div>
      ))}
      {money && (
        <div className="pt-1 border-t border-slate-800/80">
          <div className="text-slate-400">{d.treasury ? "Treasury" : "Spoils"}</div>
          <div className="text-amber-200 flex flex-wrap gap-x-2">
            {Object.entries(money)
              .filter(([k, v]) => typeof v === "number" && v > 0 && RES_EMOJI[k])
              .map(([k, v]) => (
                <span key={k}>
                  {RES_EMOJI[k]} {d.treasury && est?.treasury ? fogText(fogTreasury(report, k), true) : formatCompact(v as number)}
                </span>
              ))}
            {Object.entries(d.scarce ?? d.loot?.scarce ?? {})
              .filter(([, v]) => v > 0)
              .map(([k, v]) => {
                const def = SCARCE_RESOURCES.find((r) => r.key === k);
                return (
                  <span key={k}>
                    {def?.emblem ?? "💎"} {est?.scarce?.[k] ? fogText(est.scarce[k]) : v}
                  </span>
                );
              })}
          </div>
        </div>
      )}
      {d.resourceYield && (
        <div className="pt-1 border-t border-slate-800/80 text-emerald-200 flex flex-wrap gap-x-2">
          {Object.entries(d.resourceYield).map(([k, v]) => (
            <span key={k}>
              {RES_EMOJI[k] ?? "💎"} {formatCompact(v)} {k}
            </span>
          ))}
        </div>
      )}
      {!compact && d.modifiers && d.modifiers.length > 0 && (
        <ul className="pt-1 border-t border-slate-800/80 text-[10px] text-slate-300 space-y-0.5">
          {d.modifiers.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {!compact && d.bossRotation && d.bossRotation.length > 0 && (
        <div className="pt-1 border-t border-slate-800/80 text-[10px] text-slate-300">Rotation: {d.bossRotation.join(" · ")}</div>
      )}
      {!compact && d.lore && d.lore.length > 0 && (
        <div className="pt-1 border-t border-slate-800/80 text-[11px] text-slate-300 font-sans italic space-y-0.5">
          {d.lore.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Who is working a node and what's left of it */
export function NodeStatusLine({ status }: { status: NodeStatus }) {
  const g = status.gatherer;
  return (
    <div className="p-2.5 rounded-lg border border-emerald-700/40 bg-emerald-950/20 text-[11px] font-mono space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Left in the node</span>
        <span className="text-emerald-200 font-bold">
          {status.emptied ? "exhausted" : status.remaining !== null ? `${status.remaining.toLocaleString()} / ${status.total.toLocaleString()}` : status.remainingBand}
        </span>
      </div>
      {g && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-300">
            ⛏️ {g.mine ? "Your workers" : `${CIV_EMBLEM[g.civ]} ${g.name}'s workers`} ({g.band})
          </span>
          <span className={g.exposed ? "text-rose-300 font-bold" : "text-emerald-300"}>{g.exposed ? "⚠️ exposed" : "🛡️ safe"}</span>
        </div>
      )}
    </div>
  );
}
