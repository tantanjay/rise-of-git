import { useCallback, useEffect, useState } from "react";
import { Hammer, Trash2 } from "lucide-react";
import { API_BASE } from "@/config";
import { ArmoryView, DeveloperKingdom, SCARCE_RESOURCES } from "@/types";
import { ARMORY_RULES, ARMORY_TARGET_SHARE, armorySetFor, forgeCost, setText, type ArmoryCost, type ArmoryRarity } from "@/utils/armory";
import { sound } from "@/hooks/useSound";

const COST_ICON: Record<string, string> = { gold: "🪙", iron: "⚙️", stone: "🪨", lumber: "🪵", food: "🌾" };
const gemIcon = (key: string) => SCARCE_RESOURCES.find((g) => g.key === key)?.emblem ?? "💎";

/** "⚙️ 300 · 🪵 400 · 🪙 5 · 💎 1" */
export function costLine(cost: ArmoryCost, gems: Record<string, number> = {}): string {
  const bulk = Object.entries(cost)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${COST_ICON[k] ?? ""} ${(v as number).toLocaleString()}`);
  const scarce = Object.entries(gems)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${gemIcon(k)} ${v.toLocaleString()} ${k.replace(/_/g, " ")}`);
  return [...bulk, ...scarce].join(" · ") || "nothing";
}

const RARITY_STYLE: Record<ArmoryRarity, { chip: string; border: string }> = {
  uncommon: { chip: "bg-emerald-950 text-emerald-300 border-emerald-700", border: "border-emerald-700/40" },
  rare: { chip: "bg-sky-950 text-sky-300 border-sky-700", border: "border-sky-700/40" },
  epic: { chip: "bg-violet-950 text-violet-300 border-violet-700", border: "border-violet-700/50" }
};

/** The signed-in ruler's armory (GET /armory), and a way to refresh it */
export function useArmory(enabled: boolean) {
  const [armory, setArmory] = useState<ArmoryView | null>(null);
  const reload = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return fetch(`${API_BASE}/armory`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v: ArmoryView | null) => setArmory(v))
      .catch(() => undefined);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) {
      setArmory(null);
      return;
    }
    void reload();
  }, [enabled, reload]);
  return { armory, reload };
}

/** Forge sets: POST /armory/forge */
export async function forgeArmorySets(rarity: ArmoryRarity, count: number): Promise<{ success: boolean; error?: string; armory?: ArmoryView; kingdom?: DeveloperKingdom }> {
  try {
    const res = await fetch(`${API_BASE}/armory/forge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rarity, count }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.error || "Failed to forge" };
    sound.playLevelUp();
    return { success: true, armory: data.armory, kingdom: data.kingdom };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/** Scrap sets at home for good, nothing back: POST /armory/scrap */
export async function scrapArmorySets(rarity: ArmoryRarity, count: number): Promise<{ success: boolean; error?: string; armory?: ArmoryView }> {
  try {
    const res = await fetch(`${API_BASE}/armory/scrap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rarity, count }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.error || "Failed to scrap" };
    return { success: true, armory: data.armory };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * 🗡️ Kingdom → Armory tab: the ruler's civilization's three sets, how many hang at home and how many
 * are away, what they add, their upkeep, forging more and scrapping the ones at home
 */
export function ArmoryPanel({ kingdom }: { kingdom: DeveloperKingdom }) {
  const { armory, reload } = useArmory(true);
  const [counts, setCounts] = useState<Partial<Record<ArmoryRarity, number>>>({});
  const [busy, setBusy] = useState<ArmoryRarity | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  // The card whose Scrap form is open, and how many to scrap
  const [scrapping, setScrapping] = useState<{ rarity: ArmoryRarity; n: number } | null>(null);
  const civ = kingdom.civilization;
  const cap = kingdom.marchCapacity ?? 0;

  const forge = async (rarity: ArmoryRarity, n: number) => {
    setBusy(rarity);
    setStatus(null);
    const res = await forgeArmorySets(rarity, n);
    setBusy(null);
    if (res.success) {
      setStatus({ ok: true, text: `Forged ${n.toLocaleString()} ${armorySetFor(civ, rarity).name}.` });
      void reload();
    } else setStatus({ ok: false, text: res.error ?? "Failed to forge" });
  };

  const scrap = async (rarity: ArmoryRarity, n: number) => {
    setBusy(rarity);
    setStatus(null);
    const res = await scrapArmorySets(rarity, n);
    setBusy(null);
    if (res.success) {
      setScrapping(null);
      setStatus({ ok: true, text: `Scrapped ${n.toLocaleString()} ${armorySetFor(civ, rarity).name}: they cost no upkeep from the next harvest.` });
      void reload();
    } else setStatus({ ok: false, text: res.error ?? "Failed to scrap" });
  };

  return (
    <div className="p-3 rounded-xl border border-slate-700 bg-slate-950/60 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-slate-100 flex items-center gap-1.5">
          <Hammer className="w-4 h-4 text-amber-300" /> The Armory
        </span>
        <span className="text-[10px] text-slate-500">one set per soldier</span>
      </div>
      <p className="text-[10px] text-slate-400">
        Forge your civilization's sets here, then pick one under <strong>Loadout</strong> when you send an attack or lead or join a rally: every soldier of the march wears it. The sets still at home dress your
        home garrison when the castle is attacked, the best first. Soldiers who fall on a march lose theirs; every set you hold costs its upkeep each harvest, and what the treasury can't pay rusts back to the
        stock pile. Sets you no longer want can be <strong>scrapped</strong> at home: nothing comes back, and they cost no more upkeep.
      </p>
      {/* Cards wrap by their own width: this panel sits in narrow windows as well as wide ones */}
      <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
        {(armory?.sets ?? (["uncommon", "rare", "epic"] as ArmoryRarity[]).map((rarity) => ({ rarity, home: 0, away: 0, blocked: null as string | null, upkeepNow: {} as ArmoryCost }))).map((row) => {
          const rarity = row.rarity;
          const set = armorySetFor(civ, rarity);
          const n = Math.max(1, Math.floor(counts[rarity] ?? Math.max(1, cap || 100)));
          const plan = forgeCost(civ, rarity, n);
          const style = RARITY_STYLE[rarity];
          return (
            <div key={rarity} className={`rounded-lg border ${style.border} bg-slate-900/70 p-2 space-y-1.5 text-[11px]`}>
              <div className="flex items-start justify-between gap-1">
                <span className="font-bold text-slate-100 leading-tight">
                  {set.emblem} {set.name}
                </span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[9px] uppercase font-bold ${style.chip}`}>{rarity}</span>
              </div>
              <div className="text-amber-200">{setText(set)}</div>
              <div className="text-slate-500 italic text-[10px]">{set.story}</div>
              <div className="flex justify-between text-slate-300">
                <span>
                  <strong className="text-slate-100">{row.home.toLocaleString()}</strong> at home
                </span>
                {row.away > 0 && <span>{row.away.toLocaleString()} on marches</span>}
              </div>
              <div className="text-[10px] text-slate-500">Upkeep now: {costLine(row.upkeepNow ?? {})} a harvest</div>
              {row.home > 0 &&
                (scrapping?.rarity === rarity ? (
                  <div className="space-y-1 rounded border border-rose-800/60 bg-rose-950/30 p-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={row.home}
                        value={scrapping.n}
                        onChange={(e) => setScrapping({ rarity, n: Math.max(1, Math.min(row.home, Math.floor(Number(e.target.value) || 1))) })}
                        className="w-20 min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200"
                        aria-label={`Sets of ${set.name} to scrap`}
                      />
                      <button type="button" onClick={() => setScrapping({ rarity, n: row.home })} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold">
                        All
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => scrap(rarity, Math.min(row.home, scrapping.n))}
                        className="px-2 py-0.5 rounded bg-rose-700 hover:bg-rose-600 border border-rose-500 text-white font-bold disabled:opacity-40"
                      >
                        {busy === rarity ? "…" : "Scrap: nothing back"}
                      </button>
                      <button type="button" onClick={() => setScrapping(null)} className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold">
                        Keep
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setScrapping({ rarity, n: row.home })}
                    title="Break up sets at home for good: nothing comes back, and they cost no more upkeep"
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-bold flex items-center gap-1 disabled:opacity-40"
                  >
                    <Trash2 className="w-3 h-3" /> Scrap…
                  </button>
                ))}
              {row.blocked ? (
                <div className="text-[10px] text-rose-300">Can't forge: {row.blocked}</div>
              ) : (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      value={n}
                      onChange={(e) => setCounts((c) => ({ ...c, [rarity]: Math.max(1, Math.floor(Number(e.target.value) || 1)) }))}
                      className="w-20 min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200"
                      aria-label={`Sets of ${set.name} to forge`}
                    />
                    {cap > 0 && (
                      <button type="button" onClick={() => setCounts((c) => ({ ...c, [rarity]: cap }))} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold" title="A full march">
                        March
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => forge(rarity, n)}
                      className="ml-auto px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-40"
                    >
                      {busy === rarity ? "…" : "Forge"}
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-400">{costLine(plan.cost, plan.gems)}</div>
                </div>
              )}
              <div className="text-[9px] text-slate-600">
                100 sets: {costLine(ARMORY_RULES[rarity].forge, forgeCost(civ, rarity, 100).gems)} · upkeep {costLine(ARMORY_RULES[rarity].upkeep)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-500">
        {Object.values(ARMORY_TARGET_SHARE)
          .map((t) => `${t.emblem} ${t.name}: ${t.description}.`)
          .join(" ")}
      </p>
      {status && <div className={`px-2 py-1 rounded border text-[11px] ${status.ok ? "border-emerald-700 bg-emerald-950/60 text-emerald-300" : "border-rose-700 bg-rose-950/60 text-rose-300"}`}>{status.text}</div>}
    </div>
  );
}
