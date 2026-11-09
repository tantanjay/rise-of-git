import { useEffect, useRef, useState } from "react";
import { DeveloperKingdom, Rally } from "@/types";
import { CIV_EMBLEM, formatDuration } from "@/utils/war";
import { marchCapacityFor, getMaxPopulation } from "@/utils/civDemographics";
import { Combobox } from "./Combobox";
import { useArmory } from "./ArmoryPanel";
import { useChampion } from "./ChampionPanel";

/** Ticks a "launches in" countdown through a DOM ref (no React re-render per second) */
function LaunchCountdown({ at }: { at: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      if (ref.current) ref.current.textContent = at > Date.now() ? formatDuration(at - Date.now()) : "setting off…";
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [at]);
  return <span ref={ref} className="tabular-nums" />;
}

interface RallyListProps {
  rallies: Rally[];
  myKingdom: DeveloperKingdom | null;
  onJoin?: (rallyId: string, soldiers: number, loadout?: string, champion?: boolean) => Promise<{ success: boolean; error?: string }>;
  onCancel?: (rallyId: string) => Promise<{ success: boolean; error?: string }>;
  compact?: boolean;
}

/** Open rallies of the viewer's civilization: members, countdown, bonus, Join / Call off */
export function RallyList({ rallies, myKingdom, onJoin, onCancel, compact = false }: RallyListProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  /** 🗡️ The Armory set each joining army wears ("standard" when unset) */
  const [loadouts, setLoadouts] = useState<Record<string, string>>({});
  const joinable = Boolean(myKingdom && onJoin && rallies.some((r) => r.leaderId !== myKingdom.id && !r.members.some((m) => m.userId === myKingdom.id)));
  const { armory } = useArmory(joinable);
  // 🦸 A joiner's champion may lead the army it sends (off by default)
  const { champion } = useChampion(joinable);
  const [leads, setLeads] = useState<Record<string, boolean>>({});
  const championFree = Boolean(champion && champion.status === "home");

  if (rallies.length === 0) {
    return compact ? null : <p className="px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-500 text-xs">No open rallies in your civilization. Raise one from any target's march form (🚩 Rally).</p>;
  }

  const cap = myKingdom ? myKingdom.marchCapacity ?? marchCapacityFor(myKingdom.maxPopulation ?? getMaxPopulation(myKingdom.cityHallLevel, myKingdom.civilization), myKingdom.civilization) : 0;
  const maxJoin = Math.max(0, Math.min(cap, myKingdom?.soldiers ?? 0));

  const act = async (id: string, fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(id);
    setError(null);
    const res = await fn();
    if (!res.success) setError(res.error || "Failed");
    setBusy(null);
  };

  return (
    <div className="space-y-1.5">
      {rallies.map((r) => {
        const joiners = r.members.filter((m) => !m.leader);
        const troops = r.members.reduce((sum, m) => sum + m.soldiers, 0);
        const isLeader = myKingdom?.id === r.leaderId;
        const isMember = r.members.some((m) => m.userId === myKingdom?.id);
        const full = joiners.length >= r.joinerCap;
        const amount = Math.min(maxJoin, amounts[r.id] ?? maxJoin);
        const loadout = loadouts[r.id] ?? "standard";
        const set = armory?.sets.find((x) => x.rarity === loadout) ?? null;
        const short = set ? Math.max(0, amount - set.home) : 0;
        return (
          <div key={r.id} className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-2 text-[11px] font-mono space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-amber-100 truncate">
                🚩 {CIV_EMBLEM[r.civilization]} {r.leaderName} → {r.targetName}
              </span>
              <span className="text-amber-300 font-bold shrink-0">
                <LaunchCountdown at={r.launchAt} />
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>
                {joiners.length}/{r.joinerCap} joiners · {troops.toLocaleString()} troops
              </span>
              <span className="text-amber-200">+{joiners.length * 5}% ATK</span>
            </div>
            {!compact && (
              <ul className="text-[10px] text-slate-300 space-y-0.5">
                {r.members.map((m) => (
                  <li key={m.marchId} className="flex justify-between">
                    <span className="truncate">
                      {m.leader ? "👑" : "•"} {m.name} · {m.soldiers.toLocaleString()}
                    </span>
                    <span className={m.arrived ? "text-emerald-300" : "text-slate-500"}>{m.arrived ? "in the lobby" : `arrives ${formatDuration(m.arrivesAt - Date.now())}`}</span>
                  </li>
                ))}
              </ul>
            )}
            {myKingdom && isLeader && onCancel && (
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => act(r.id, () => onCancel(r.id))}
                className="w-full px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold disabled:opacity-40"
              >
                Call the rally off
              </button>
            )}
            {myKingdom && !isLeader && !isMember && onJoin && (
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={maxJoin}
                  value={amount}
                  onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: Math.max(1, Math.min(maxJoin, Math.floor(Number(e.target.value) || 0))) }))}
                  className="w-20 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200"
                  disabled={full || maxJoin <= 0}
                />
                {armory && armory.sets.some((x) => x.home > 0) && (
                  <Combobox
                    ariaLabel="Loadout"
                    size="sm"
                    className="w-36"
                    value={loadout}
                    onChange={(v) => setLoadouts((l) => ({ ...l, [r.id]: v }))}
                    options={[
                      { value: "standard", label: "Standard gear" },
                      ...armory.sets.map((x) => ({ value: x.rarity, label: `${x.emblem} ${x.name}`, sublabel: `${x.rarity} · ${x.home.toLocaleString()} at home`, disabled: x.home <= 0 }))
                    ]}
                  />
                )}
                {champion && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(leads[r.id] && championFree)}
                    disabled={!championFree}
                    onClick={() => setLeads((l) => ({ ...l, [r.id]: !l[r.id] }))}
                    title={championFree ? `Lead with your champion: ${champion.name}, level ${champion.level}` : champion.status === "away" ? `${champion.name} already leads another march` : `${champion.name} is wounded`}
                    className={`px-2 py-0.5 rounded border font-bold disabled:opacity-40 ${leads[r.id] && championFree ? "bg-amber-500 text-slate-950 border-amber-300" : "bg-slate-900 text-amber-200 border-slate-600"}`}
                  >
                    🦸 Champion
                  </button>
                )}
                <button
                  type="button"
                  disabled={full || maxJoin <= 0 || busy === r.id || short > 0}
                  onClick={() => act(r.id, () => onJoin(r.id, amount, set ? set.rarity : undefined, Boolean(leads[r.id] && championFree)))}
                  className="flex-1 px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-40"
                  title={full ? "The rally is full" : maxJoin <= 0 ? "No soldiers at home" : short > 0 ? `${short.toLocaleString()} more sets needed (forge them in the Armory)` : "March to the leader's castle and join the lobby"}
                >
                  {full ? "Full" : "Join"}
                </button>
              </div>
            )}
            {isMember && !isLeader && <div className="text-emerald-300 text-[10px]">✓ You're in this rally</div>}
          </div>
        );
      })}
      {error && <div className="rounded border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-[10px] text-rose-200">{error}</div>}
    </div>
  );
}
