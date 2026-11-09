import { useEffect, useState } from "react";
import { readRealmClock } from "@/utils/realmTime";
import { MoonStar, Hourglass } from "lucide-react";
import { DeveloperKingdom } from "@/types";
import { MOONWELL, MOONWELL_TRAIT, formatLongDuration, hastenCostFor } from "@/utils/war";

/**
 * 🌙 Moonwell Healers (GAME_GUIDE §13): an elf kingdom's wounded soldiers, how many rejoin the garrison at each harvest and when,
 * and (for its ruler) the Hasten button that pays to bring them all home now.
 */
export function MoonwellWard({ kingdom, isOwner, onHasten }: { kingdom: DeveloperKingdom; isOwner: boolean; onHasten?: (kingdomId: string) => Promise<{ success: boolean; error?: string }> }) {
  const ward = kingdom.wounded;
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ward) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [ward]);
  if (!MOONWELL.CIVS.includes(kingdom.civilization)) return null;

  if (!ward || ward.count <= 0) {
    return (
      <p className="p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-indigo-200/80 flex items-start gap-2">
        <MoonStar className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-300" />
        <span>
          <strong className="text-indigo-200">{MOONWELL_TRAIT.name}:</strong> {MOONWELL_TRAIT.description}. No one is healing now.
        </span>
      </p>
    );
  }

  const cost = hastenCostFor(ward.count);
  const res = kingdom.resources;
  const gem = Object.entries(cost.gems)[0];
  const short = [
    (res?.food ?? 0) < cost.food ? "food" : null,
    (res?.gold ?? 0) < cost.gold ? "gold" : null,
    gem && (res?.scarce?.[gem[0]] ?? 0) < gem[1] ? "emeralds" : null
  ].filter(Boolean);
  // A few rejoin at every harvest: the next one ends the running window, the last one `harvests − 1` windows after it
  const clock = readRealmClock(now);
  const harvests = Math.ceil(ward.count / Math.max(1, ward.perHarvest));
  const next = Math.max(0, clock.windowEndsAt - now);
  const all = next + (harvests - 1) * clock.windowMs;

  const hasten = async () => {
    if (!onHasten) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onHasten(kingdom.id);
      if (!r.success) setError(r.error || "The Moonwell could not be hastened.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-950/25 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-indigo-200 flex items-center gap-1.5">
          <MoonStar className="w-4 h-4 text-indigo-300" />
          Wounded
        </span>
        <span className="text-slate-300 text-right">
          <strong className="text-indigo-200">{ward.count.toLocaleString()}</strong> healing at the Moonwell
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
        <span className="flex items-center gap-1">
          <Hourglass className="w-3.5 h-3.5 text-indigo-300" />
          {harvests <= 1 ? "All back at the next harvest, in" : `+${ward.perHarvest.toLocaleString()} back at the next harvest, in`} <strong className="font-mono text-indigo-100">{formatLongDuration(next)}</strong>
        </span>
        {harvests > 1 && (
          <span>
            all back in <strong className="font-mono text-indigo-100">~{formatLongDuration(all)}</strong> ({harvests} harvests)
          </span>
        )}
      </div>
      {isOwner && onHasten && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={hasten}
            disabled={busy || short.length > 0}
            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold disabled:opacity-40"
          >
            {busy ? "Hastening…" : "Hasten"}
          </button>
          <span className={`text-[11px] ${short.length ? "text-rose-300" : "text-slate-300"}`}>
            🌾 {cost.food.toLocaleString()} · 🪙 {cost.gold.toLocaleString()}
            {gem ? ` · 🟢 ${gem[1]}` : ""}
            {short.length ? ` — not enough ${short.join(", ")}` : ""}
          </span>
        </div>
      )}
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
      <p className="text-[10px] text-slate-500">
        {MOONWELL.WOUNDED_SHARE * 100}% of the soldiers your armies lose in battle are carried home wounded instead of dying. They keep their place in your
        population (no recruit can take it); {ward.perHarvest.toLocaleString()} of them ({MOONWELL.HEAL_SHARE_PER_HARVEST * 100}% of your soldier cap at full
        population) rejoin the garrison at every harvest, the longest-wounded first. Losses on the road stay deaths.
      </p>
    </div>
  );
}
