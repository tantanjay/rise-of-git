import { bandLossText } from "@/utils/mercenaries";
import { useEffect, useRef, useState } from "react";
import { ActiveMarch, DeveloperKingdom, Rally } from "@/types";
import { RallyList } from "./RallyList";
import { formatDuration, interpolateMarchPosition, MARCH_KIND_ICON, marchLost, returnStartOf } from "@/utils/war";
import { marchCapacityFor, marchSlotsForLevel, getMaxPopulation } from "@/utils/civDemographics";
import { API_BASE } from "@/config";

interface MarchRowProps {
  march: ActiveMarch;
  isIncoming?: boolean;
  canRecall: boolean;
  recallingId: string | null;
  onRecall: (marchId: string) => void;
  onFocus?: (x: number, z: number) => void;
}

function MarchQueueRow({ march, isIncoming = false, canRecall, recallingId, onRecall, onFocus }: MarchRowProps) {
  const etaRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const phase = march.phase || "outbound";
  // The ticker reads the latest march; it only restarts when a field it shows changes
  const marchRef = useRef(march);
  marchRef.current = march;

  useEffect(() => {
    const updateDom = () => {
      const march = marchRef.current;
      const now = Date.now();
      let progress: number;
      let label: string;

      if (phase === "outbound") {
        const total = Math.max(1, march.arrivalTime - march.departTime);
        progress = Math.min(100, Math.max(0, ((now - march.departTime) / total) * 100));
        label = formatDuration(march.arrivalTime - now);
      } else if (phase === "rallying") {
        // Waiting in a rally lobby until it sets off (act_until = launch time)
        const end = march.actUntil ?? now;
        progress = Math.min(100, Math.max(0, ((now - march.departTime) / Math.max(1, end - march.departTime)) * 100));
        label = end > now ? `sets off ${formatDuration(end - now)}` : "setting off…";
      } else if (phase === "stationed") {
        progress = 100;
        label = "On the walls";
      } else if (phase === "acting" && march.gather) {
        // Gathering / claiming: progress of the work; frozen while fighting off an attack
        const g = march.gather;
        const until = g.pausedAt ?? now;
        const end = march.actUntil ?? until;
        progress = Math.min(100, Math.max(0, ((until - g.startedAt) / Math.max(1, end - g.startedAt)) * 100));
        const got = g.treasure ? 0 : Math.min(g.amount, Math.floor((g.rate * Math.max(0, until - g.startedAt)) / 1000));
        label = g.pausedAt ? "Defending!" : `${g.treasure ? "" : `${got.toLocaleString()} · `}${formatDuration(end - now)}`;
      } else if (phase === "acting") {
        const round = march.currentBattleRound ?? 1;
        const maxR = march.maxBattleRounds ?? 6;
        progress = Math.min(100, Math.round((round / maxR) * 100));
        label = `Round ${round}/${maxR}`;
      } else if (phase === "returning") {
        const t0 = returnStartOf(march);
        const t1 = march.returnTime ?? t0 + 30_000;
        const total = Math.max(1, t1 - t0);
        progress = Math.min(100, Math.max(0, ((now - t0) / total) * 100));
        label = formatDuration(t1 - now);
      } else {
        progress = 100;
        label = "Done";
      }

      if (etaRef.current) etaRef.current.textContent = label;
      if (barRef.current) barRef.current.style.width = `${progress}%`;
    };

    updateDom();
    const id = setInterval(updateDom, 1000);
    return () => clearInterval(id);
  }, [march.departTime, march.arrivalTime, march.actUntil, march.returnTime, march.currentBattleRound, march.maxBattleRounds, march.gather, phase]);

  const kind = march.kind || "attack";
  // The round counter carries the last round's losses on both sides (seen from the viewer's side: an incoming army is the foe)
  const lastRound = phase === "acting" && !march.gather ? march.lastBattleRound ?? null : null;
  const ownLoss = lastRound ? (isIncoming ? lastRound.defenderLosses : lastRound.attackerLosses) : 0;
  const foeLoss = lastRound ? (isIncoming ? lastRound.attackerLosses : lastRound.defenderLosses) : 0;
  // 🪙 A mercenary band counts its losses as strength: this band's share of the round, as −% of the band
  const band = march.band ?? null;
  const bandRound = band && lastRound ? lastRound.bands?.find((b) => b.marchId === march.id) ?? null : null;
  const bandLoss = bandRound ? bandLossText(bandRound.lost, bandRound.fullCount) : null;
  const ownText = !isIncoming && bandRound ? bandLoss! : `−${ownLoss.toLocaleString()}`;
  const foeText = isIncoming && bandRound ? bandLoss! : `−${foeLoss.toLocaleString()}`;
  // Lost its battle: survivors limp home
  const defeated = phase === "returning" && marchLost(march);
  const lostSoldiers = Math.max(0, (march.initialSoldiers ?? march.soldiersCount) - march.soldiersCount);
  const icon = defeated ? "💀" : phase === "returning" ? "↩️" : MARCH_KIND_ICON[kind] || "⚔️";

  const carryEntries = march.carry
    ? (["gold", "iron", "stone", "lumber", "food"] as const)
        .filter((k) => (march.carry?.[k] ?? 0) > 0)
        .map((k) => `${march.carry![k]!.toLocaleString()} ${k}`)
    : [];

  return (
    <div
      onClick={() => {
        if (!onFocus) return;
        const pos = interpolateMarchPosition(march, Date.now());
        onFocus(pos.x, pos.z);
      }}
      className={`group rounded-lg border p-2 transition cursor-pointer ${
        isIncoming
          ? "border-rose-500/40 bg-rose-950/30 hover:bg-rose-950/50"
          : defeated
            ? "border-rose-500/50 bg-rose-950/25 hover:bg-rose-950/40"
            : phase === "returning"
            ? "border-emerald-500/30 bg-slate-900/70 hover:bg-slate-800/80"
            : phase === "acting"
              ? "border-amber-500/40 bg-amber-950/25 hover:bg-amber-950/40"
              : "border-slate-700/70 bg-slate-900/70 hover:bg-slate-800/80"
      }`}
      title="Click to focus camera on this army"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm leading-none">{icon}</span>
          <span className="font-semibold text-slate-100 truncate">
            {isIncoming ? `${march.attackerName} → You` : march.targetName}
          </span>
          {march.champion && (
            <span className="shrink-0 text-[10px] text-amber-300" title={`Led by ${march.champion.name}, level ${march.champion.level}`}>
              🦸 Lv{march.champion.level}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${
              isIncoming
                ? "bg-rose-500/20 text-rose-200 border border-rose-400/40"
                : defeated
                  ? "bg-rose-600/25 text-rose-200 border border-rose-400/60"
                  : phase === "acting"
                  ? "bg-amber-500/20 text-amber-200 border border-amber-400/40"
                  : phase === "returning"
                    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40"
                    : "bg-sky-500/20 text-sky-200 border border-sky-400/40"
            }`}
          >
            {isIncoming
              ? "Incoming"
              : defeated
                ? "💀 Defeated"
                : phase === "rallying"
                ? "Lobby"
                : phase === "stationed"
                  ? "Stationed"
                  : phase === "acting" && march.gather
                ? march.gather.pausedAt
                  ? "Attacked"
                  : march.gather.treasure
                    ? "Claiming"
                    : "Gathering"
                : phase === "acting"
                  ? "Fighting"
                  : phase === "returning"
                    ? "Returning"
                    : "Outbound"}
          </span>
          {canRecall && (phase === "outbound" || phase === "acting" || phase === "rallying" || phase === "stationed") && (
            <button
              type="button"
              disabled={recallingId === march.id}
              onClick={(e) => {
                e.stopPropagation();
                onRecall(march.id);
              }}
              title="Recall army home (food rations already paid are not refunded)"
              className="px-1.5 py-0.5 rounded bg-rose-900/60 hover:bg-rose-800 border border-rose-500/50 text-[10px] font-semibold text-rose-100 transition disabled:opacity-50"
            >
              {recallingId === march.id ? "…" : "Recall"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        {band ? (
          <span className="truncate" title={`${band.rarity} mercenary band: ${Math.round(band.strength * 100)}% strength (set off at ${Math.round(band.startStrength * 100)}%)`}>
            {band.emblem} {band.name} · <b className={band.strength >= 0.75 ? "text-emerald-300" : band.strength >= 0.4 ? "text-amber-300" : "text-rose-300"}>{Math.round(band.strength * 100)}%</b>
          </span>
        ) : (
          <span>
            {march.civilian && kind !== "scout" ? "👷" : MARCH_KIND_ICON[kind] ?? "⚔️"} {march.soldiersCount.toLocaleString()}
            {march.initialSoldiers && march.initialSoldiers > march.soldiersCount ? ` / ${march.initialSoldiers.toLocaleString()}` : ""} troops
          </span>
        )}
        <span className="flex items-center gap-1.5">
          {lastRound && (
            <span className="tabular-nums text-[10px]" title={`Round ${lastRound.round}: ${isIncoming ? "you" : "your army"} lost ${ownText.slice(1)}, the foe lost ${foeText.slice(1)}`}>
              <span className="text-rose-300">{ownText}</span>
              <span className="text-slate-500"> you · </span>
              <span className="text-emerald-300">{foeText}</span>
              <span className="text-slate-500"> foe</span>
            </span>
          )}
          <span ref={etaRef} className="text-amber-300 font-bold tabular-nums" />
        </span>
      </div>

      {defeated && (
        <div className="mt-1 text-[10px] text-rose-300 font-mono truncate">
          Repelled at {march.targetName}. Returning survivors
          {band && lostSoldiers > 0
            ? ` (${bandLossText(lostSoldiers, band.fullCount)} strength)`
            : lostSoldiers > 0
              ? ` (−${lostSoldiers.toLocaleString()} soldiers)`
              : ""}
        </div>
      )}

      {carryEntries.length > 0 && (
        <div className="mt-1 text-[10px] text-amber-300/90 font-mono truncate">
          💰 Carrying: {carryEntries.join(" • ")}
          {march.carry?.scarce ? ` • ${Object.entries(march.carry.scarce).map(([k, v]) => `${v} ${k}`).join(" • ")}` : ""}
        </div>
      )}

      <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          ref={barRef}
          className={`h-full transition-all duration-300 ${
            isIncoming
              ? "bg-gradient-to-r from-rose-500 to-orange-400"
              : defeated
                ? "bg-gradient-to-r from-rose-600 to-amber-500"
                : phase === "returning"
                ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                : phase === "acting"
                  ? "bg-gradient-to-r from-amber-500 to-red-500"
                  : "bg-gradient-to-r from-sky-500 to-amber-400"
          }`}
          style={{ width: "0%" }}
        />
      </div>
    </div>
  );
}

interface MarchQueueProps {
  myKingdom: DeveloperKingdom | null;
  marches: ActiveMarch[];
  onRefresh: () => void;
  onFocusPosition?: (x: number, z: number) => void;
  onFocusMarch?: (march: ActiveMarch) => void;
  onOpenWarRoom?: () => void;
  variant?: "floating" | "embedded";
  /** Open rallies of the viewer's civilization */
  rallies?: Rally[];
  onJoinRally?: (rallyId: string, soldiers: number, loadout?: string, champion?: boolean) => Promise<{ success: boolean; error?: string }>;
  onCancelRally?: (rallyId: string) => Promise<{ success: boolean; error?: string }>;
}

export function MarchQueue({
  myKingdom,
  marches,
  onRefresh,
  onFocusPosition,
  onFocusMarch,
  onOpenWarRoom,
  variant = "floating",
  rallies = [],
  onJoinRally,
  onCancelRally
}: MarchQueueProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!myKingdom) {
    if (variant === "embedded") {
      return (
        <div className="p-3 text-xs text-slate-400 text-center">
          Sign in with Git to command marches and view your march slots.
        </div>
      );
    }
    return null;
  }

  const isBurning = Boolean(myKingdom.burning);

  const myActiveMarches = marches.filter(
    (m) => m.attackerId === myKingdom.id && m.status !== "resolved" && (m.phase || "outbound") !== "done"
  );
  const incomingMarches = marches.filter(
    (m) =>
      m.targetType === "dev_kingdom" &&
      m.targetId === myKingdom.id &&
      m.kind !== "scout" &&
      m.kind !== "reinforce" &&
      m.kind !== "rally_join" &&
      m.status !== "resolved" &&
      (m.phase === "outbound" || m.phase === "acting" || !m.phase)
  );

  const slots = myKingdom.marchSlots ?? marchSlotsForLevel(myKingdom.cityHallLevel);
  const maxPop = myKingdom.maxPopulation ?? getMaxPopulation(myKingdom.cityHallLevel, myKingdom.civilization);
  const capacity = myKingdom.marchCapacity ?? marchCapacityFor(maxPop, myKingdom.civilization);

  const handleRecall = async (marchId: string) => {
    setRecallingId(marchId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/marches/${encodeURIComponent(marchId)}/recall`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to recall march");
      onRefresh();
    } catch (err: any) {
      setError(err.message || "Recall failed");
    } finally {
      setRecallingId(null);
    }
  };

  const focusFor = (m: ActiveMarch) => (x: number, z: number) => {
    onFocusPosition?.(x, z);
    onFocusMarch?.(m);
  };

  if (variant === "embedded") {
    return (
      <div className="p-2.5 space-y-2.5 text-xs">
        <div className="flex items-center justify-between px-1">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
              March Slots: {myActiveMarches.length} / {slots}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              Max {capacity.toLocaleString()} troops / march • CH Lv.{myKingdom.cityHallLevel}
            </div>
          </div>
          {onOpenWarRoom && (
            <button
              type="button"
              onClick={onOpenWarRoom}
              className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-[10px] font-semibold text-amber-200 transition"
            >
              ⚔️ War Room
            </button>
          )}
        </div>

        {isBurning && (
          <div className="rounded-lg border border-orange-500/50 bg-orange-950/40 px-2.5 py-1.5 text-[11px] text-orange-200">
            🔥 <strong>City Burning</strong> (Walls ≤ 25% HP): Protected from attacks, cannot launch offensive marches until walls repair above 25%.
          </div>
        )}

        {error && (
          <div className="rounded border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-[11px] text-rose-200">
            {error}
          </div>
        )}

        {rallies.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300 px-1">🚩 Open rallies ({rallies.length})</div>
            <RallyList rallies={rallies} myKingdom={myKingdom} onJoin={onJoinRally} onCancel={onCancelRally} />
          </div>
        )}

        {incomingMarches.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400 px-1">
              🚨 Incoming Hostiles ({incomingMarches.length})
            </div>
            {rallies.length > 0 && <RallyList rallies={rallies} myKingdom={myKingdom} onJoin={onJoinRally} onCancel={onCancelRally} compact />}

            {incomingMarches.map((m) => (
              <MarchQueueRow
                key={m.id}
                march={m}
                isIncoming
                canRecall={false}
                recallingId={recallingId}
                onRecall={handleRecall}
                onFocus={focusFor(m)}
              />
            ))}
          </div>
        )}

        {myActiveMarches.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-center text-[11px] text-slate-400">
            No active marches on the road ({myActiveMarches.length}/{slots} slots used).
          </div>
        ) : (
          <div className="space-y-1.5">
            {myActiveMarches.map((m) => (
              <MarchQueueRow
                key={m.id}
                march={m}
                canRecall
                recallingId={recallingId}
                onRecall={handleRecall}
                onFocus={focusFor(m)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full select-none pointer-events-auto">
      <div className="rounded-xl border border-amber-500/30 bg-slate-950/90 backdrop-blur-md shadow-2xl overflow-hidden">
        <div
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-slate-800/80 cursor-pointer hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🚩</span>
            <span className="font-medieval font-bold text-xs text-amber-200 tracking-wide">
              Marches {myActiveMarches.length} / {slots}
            </span>
            {incomingMarches.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-mono font-bold animate-pulse">
                ! {incomingMarches.length}
              </span>
            )}
            {isBurning && (
              <span title="Your city walls are burning (≤25% HP)" className="text-xs">
                🔥
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
            <span>Cap {capacity.toLocaleString()}</span>
            <span>{collapsed ? "▼" : "▲"}</span>
          </div>
        </div>

        {!collapsed && (
          <div className="p-2.5 space-y-2 max-h-80 overflow-y-auto">
            {isBurning && (
              <div className="rounded-lg border border-orange-500/50 bg-orange-950/40 px-2 py-1.5 text-[10px] text-orange-200">
                🔥 Walls burning ({myKingdom.wallHp?.toLocaleString()} / {myKingdom.wallMaxHp?.toLocaleString()} HP) — ceasefire active until &gt;25%.
              </div>
            )}

            {error && (
              <div className="rounded border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-[10px] text-rose-200">
                {error}
              </div>
            )}

            {incomingMarches.map((m) => (
              <MarchQueueRow
                key={m.id}
                march={m}
                isIncoming
                canRecall={false}
                recallingId={recallingId}
                onRecall={handleRecall}
                onFocus={focusFor(m)}
              />
            ))}

            {myActiveMarches.length === 0 && incomingMarches.length === 0 ? (
              <div className="py-2 text-center text-[11px] text-slate-400">
                All armies at home ({myKingdom.soldiers?.toLocaleString() ?? 0} garrisoned).
              </div>
            ) : (
              myActiveMarches.map((m) => (
                <MarchQueueRow
                  key={m.id}
                  march={m}
                  canRecall
                  recallingId={recallingId}
                  onRecall={handleRecall}
                  onFocus={focusFor(m)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
