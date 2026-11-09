import { API_BASE } from "@/config";
import { useState, useEffect, useMemo, useCallback } from "react";
import { AuthUser, DeveloperKingdom, LedgerEntry, SCARCE_RESOURCES, ScoutReport } from "@/types";
import { BookOpen, RefreshCw, ChevronDown, ChevronRight, Eye } from "lucide-react";
import { Modal } from "./Modal";
import { formatCompact, dayLabel } from "@/utils/format";
import { ScoutIntel } from "./ScoutIntel";

interface LedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKingdom: DeveloperKingdom | null;
  me?: AuthUser | null;
  isAdmin?: boolean;
  myKingdom?: DeveloperKingdom | null;
  kingdoms?: DeveloperKingdom[];
  scoutReport?: ScoutReport | null;
}

const RESOURCES = [
  { key: "gold", icon: "🪙", label: "Gold", color: "text-amber-300" },
  { key: "iron", icon: "⚙️", label: "Iron", color: "text-slate-200" },
  { key: "stone", icon: "🪨", label: "Stone", color: "text-stone-300" },
  { key: "lumber", icon: "🪵", label: "Lumber", color: "text-orange-300" },
  { key: "food", icon: "🌾", label: "Food", color: "text-lime-300" }
] as const;

type ResKey = (typeof RESOURCES)[number]["key"];

const delta = (e: LedgerEntry, k: ResKey) => e[`${k}Delta` as const];
const balance = (e: LedgerEntry, k: ResKey) => e[`${k}Balance` as const] ?? 0;

function LedgerRow({
  entry,
  showUser,
  canSeeBalanceAfter = true
}: {
  entry: LedgerEntry;
  showUser: boolean;
  canSeeBalanceAfter?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const scarce = entry.scarceKey ? SCARCE_RESOURCES.find((r) => r.key === entry.scarceKey) : undefined;
  const gained = RESOURCES.filter((r) => delta(entry, r.key) !== 0);
  const signed = (n: number, compact = true) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${compact ? formatCompact(Math.abs(n)) : Math.abs(n).toLocaleString()}`;
  const spent = entry.type === "upgrade_purchase";

  return (
    <li className="border-b border-slate-800/70 last:border-0">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-800/40 transition">
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-slate-500 transition ${open ? "rotate-90" : ""}`} />
        <span className="shrink-0 w-14 text-[11px] font-mono text-slate-500 tabular-nums">
          {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="min-w-0 flex-1">
          {showUser && <span className="block text-[11px] font-semibold text-amber-300 truncate">{entry.userName || entry.userId}</span>}
          <span className="block text-xs text-slate-300 truncate">{entry.reason}</span>
        </span>
        <span className="shrink-0 hidden sm:flex items-center gap-2 text-[11px] font-mono font-bold">
          {gained.map((r) => (
            <span key={r.key} className={delta(entry, r.key) < 0 ? "text-red-300" : r.color}>
              {signed(delta(entry, r.key))}
              <span className="ml-0.5">{r.icon}</span>
            </span>
          ))}
          {scarce && (entry.scarceDelta ?? 0) !== 0 && (
            <span className={`px-1.5 rounded border ${spent ? "bg-red-950/60 text-red-200 border-red-700/40" : "bg-purple-950/80 text-purple-200 border-purple-500/40"}`}>
              {signed(entry.scarceDelta ?? 0)} {scarce.emblem}
            </span>
          )}
          {gained.length === 0 && !scarce && <span className="text-slate-600 font-normal">—</span>}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-3 pl-[4.75rem] space-y-2 text-[11px] font-mono">
          <p className="text-slate-300 font-sans text-xs whitespace-normal">{entry.reason}</p>
          <div className="sm:hidden flex flex-wrap gap-2 font-bold">
            {gained.map((r) => (
              <span key={r.key} className={delta(entry, r.key) < 0 ? "text-red-300" : r.color}>
                {signed(delta(entry, r.key), false)} {r.icon}
              </span>
            ))}
          </div>
          {canSeeBalanceAfter && entry.goldBalance !== undefined && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400">
              <span className="text-slate-500 uppercase tracking-wider text-[10px]">Balance after</span>
              {RESOURCES.map((r) => (
                <span key={r.key}>
                  {r.icon} <span className={r.color}>{balance(entry, r.key).toLocaleString()}</span>
                </span>
              ))}
              {scarce && (entry.scarceBalance ?? 0) >= 0 && entry.scarceKey && (
                <span>
                  {scarce.emblem} <span className="text-purple-200">{entry.scarceBalance}</span>
                </span>
              )}
            </div>
          )}
          <div className="text-slate-600 text-[10px]">
            TX #{entry.id} · {new Date(entry.timestamp).toLocaleString()}
          </div>
        </div>
      )}
    </li>
  );
}

export function LedgerModal({
  isOpen,
  onClose,
  currentKingdom,
  me = null,
  isAdmin = false,
  myKingdom = null,
  kingdoms = [],
  scoutReport = null
}: LedgerModalProps) {
  const [activeTab, setActiveTab] = useState<"kingdom" | "realm">("kingdom");
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [serverScoutReport, setServerScoutReport] = useState<ScoutReport | null>(null);

  const isSelf = Boolean(me && currentKingdom && me.id.toLowerCase() === currentKingdom.id.toLowerCase());
  const isSpecial = Boolean(me?.isSpecial || myKingdom?.isSpecial);
  const isAllied = Boolean(myKingdom && currentKingdom && myKingdom.civilization === currentKingdom.civilization);
  const canViewThisKingdom = Boolean(isAdmin || isSpecial || isSelf || isAllied);

  const fetchLedger = useCallback(async () => {
    if (activeTab === "kingdom" && !canViewThisKingdom) {
      setLoading(true);
      try {
        if (currentKingdom) {
          const url = `${API_BASE}/kingdoms/${encodeURIComponent(currentKingdom.id)}/ledger?limit=50`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data.scoutReport) setServerScoutReport(data.scoutReport);
          }
        }
      } catch (err) {
        console.error("Failed to check kingdom ledger:", err);
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const url =
        activeTab === "kingdom" && currentKingdom
          ? `${API_BASE}/kingdoms/${encodeURIComponent(currentKingdom.id)}/ledger?limit=50`
          : `${API_BASE}/ledger?limit=100`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.ledger || []);
        if (data.scoutReport) setServerScoutReport(data.scoutReport);
      }
    } catch (err) {
      console.error("Failed to fetch ledger:", err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, currentKingdom, canViewThisKingdom]);

  useEffect(() => {
    if (isOpen) fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, currentKingdom?.id, canViewThisKingdom]);

  const groups = useMemo(() => {
    const out: Array<{ day: string; items: LedgerEntry[] }> = [];
    for (const e of entries) {
      const day = dayLabel(e.timestamp);
      if (out.length === 0 || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [entries]);

  const canSeeBalanceAfterFor = useCallback(
    (entry: LedgerEntry): boolean => {
      if (isAdmin || isSpecial) return true;
      if (me && entry.userId.toLowerCase() === me.id.toLowerCase()) return true;
      const entryCiv = kingdoms.find((k) => k.id.toLowerCase() === entry.userId.toLowerCase())?.civilization;
      if (myKingdom?.civilization && entryCiv && myKingdom.civilization === entryCiv) return true;
      return false;
    },
    [isAdmin, isSpecial, me, kingdoms, myKingdom]
  );

  if (!currentKingdom) return null;

  const res = currentKingdom.resources;
  const ownedGems = SCARCE_RESOURCES.filter((g) => (res.scarce?.[g.key] || 0) > 0);
  const activeScout = scoutReport ?? currentKingdom.fog?.report ?? serverScoutReport;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      header={
        <div className="flex items-center gap-3">
          <span className="text-2xl w-11 h-11 shrink-0 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">📜</span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-100 font-medieval tracking-wide truncate">Treasury Ledger</h2>
            <p className="text-xs text-slate-400 truncate">{currentKingdom.name} · every harvest and payout, newest first</p>
          </div>
        </div>
      }
    >
      {/* Another civilization's treasury is unknown (fog of war) unless scouted */}
      {currentKingdom.fog && !canViewThisKingdom && (
        <p className="mx-5 mt-4 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/70 text-xs text-slate-300">
          🌫️ Fog of war: {currentKingdom.name}'s treasury is {activeScout ? "estimated from your scout report below" : <strong>unknown</strong>}
          {activeScout ? "" : ". Send 👁️ scouts to see it"}. Their ledger stays private.
        </p>
      )}
      {/* Balance */}
      <section className={`px-5 pt-4 pb-3 space-y-3 ${currentKingdom.fog && !canViewThisKingdom ? "hidden" : ""}`}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {RESOURCES.map((r) => (
            <div key={r.key} className="rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <span className="text-sm">{r.icon}</span>
                {r.label}
              </div>
              <div className={`mt-0.5 text-lg font-bold font-mono tabular-nums ${r.color}`} title={(res[r.key] || 0).toLocaleString()}>
                {formatCompact(res[r.key] || 0)}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-purple-900/50 bg-purple-950/20">
          <button onClick={() => setVaultOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-purple-300 shrink-0">💎 Rare vault</span>
            <span className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
              {ownedGems.length === 0 ? (
                <span className="text-xs text-slate-500">Nothing yet — one rare drop is shared out every harvest</span>
              ) : (
                ownedGems.map((g) => (
                  <span key={g.key} className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-900/80 border border-purple-700/40 text-xs" title={g.name}>
                    {g.emblem}
                    <span className="font-mono font-bold text-purple-100">{res.scarce?.[g.key]}</span>
                  </span>
                ))
              )}
            </span>
            <ChevronDown className={`w-4 h-4 shrink-0 text-purple-400 transition ${vaultOpen ? "rotate-180" : ""}`} />
          </button>
          {vaultOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 px-3 pb-3">
              {SCARCE_RESOURCES.map((g) => {
                const count = res.scarce?.[g.key] || 0;
                return (
                  <div
                    key={g.key}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs ${
                      count > 0 ? "bg-slate-900/80 border-purple-700/40" : "border-slate-800/60 opacity-50"
                    }`}
                    title={g.description}
                  >
                    <span className="text-base">{g.emblem}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-slate-200">{g.name}</span>
                      <span className="block text-[10px] text-slate-500 capitalize">
                        {g.rarity} · pool {g.pool.toLocaleString()}
                      </span>
                    </span>
                    <span className="font-mono font-bold text-purple-100">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Tabs */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-2 bg-slate-900/95 backdrop-blur border-y border-slate-800">
        <div className="inline-flex p-0.5 rounded-lg bg-slate-950 border border-slate-800">
          {(
            [
              ["kingdom", "This kingdom"],
              ["realm", isAdmin || isSpecial ? "Whole realm" : "Our civilization"]
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                activeTab === key ? "bg-amber-500 text-slate-950 shadow" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={fetchLedger}
          disabled={loading}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Refresh"
          aria-label="Refresh ledger"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Entries or Scout Intel */}
      {activeTab === "kingdom" && !canViewThisKingdom ? (
        activeScout ? (
          <div className="p-4 space-y-3">
            <div className="p-3 rounded-xl border border-sky-500/40 bg-sky-950/30 flex items-start gap-3">
              <Eye className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
              <div className="text-xs font-mono space-y-1">
                <div className="font-bold text-sky-200">
                  Classified Treasury · Scout Reconnaissance Intel
                </div>
                <p className="text-slate-300">
                  {currentKingdom.name} belongs to an opposing civilization. Their accounting ledger is confidential under the Fog of War. Displaying your scouts' latest intelligence report instead:
                </p>
              </div>
            </div>
            <ScoutIntel report={activeScout} />
          </div>
        ) : (
          <div className="py-14 px-6 text-center space-y-3 font-mono">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-2xl">
              🌫️
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold font-medieval text-slate-200">
                Classified Treasury: {currentKingdom.name}
              </h3>
              <p className="text-xs text-slate-400">
                Transaction ledgers of opposing civilizations are private under the Fog of War. Only allied civilizations and overseers can inspect accounting records.
              </p>
            </div>
            <p className="text-xs text-sky-400 flex items-center justify-center gap-1.5 pt-2">
              <Eye className="w-4 h-4" /> Send scouts to inspect their stockpiles, garrison, and defenses.
            </p>
          </div>
        )
      ) : entries.length === 0 ? (
        <div className="py-14 text-center text-slate-500 space-y-2">
          <BookOpen className="w-8 h-8 mx-auto text-slate-600" />
          <p className="text-sm">{loading ? "Reading the ledger…" : "No transactions recorded yet."}</p>
          {!loading && <p className="text-xs text-slate-600">The next harvest will write the first entry.</p>}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.day}>
            <h3 className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-widest font-semibold text-slate-500">{g.day}</h3>
            <ul>
              {g.items.map((e) => (
                <LedgerRow
                  key={e.id}
                  entry={e}
                  showUser={activeTab === "realm"}
                  canSeeBalanceAfter={canSeeBalanceAfterFor(e)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </Modal>
  );
}
