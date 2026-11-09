import { useEffect, useMemo, useRef, useState } from "react";
import { marchForceText, sideLossText } from "@/utils/mercenaries";
import { Modal } from "./Modal";
import { ActiveMarch, AuthUser, BattleReport, Broadcast, CivPlacesResponse, CivSwapProposal, DeveloperKingdom, Rally, ScoutReport } from "@/types";
import { RallyList } from "./RallyList";
import { ChronicleText } from "./ChronicleStoryView";
import { CIV_EMBLEM, formatDuration, formatAgo, MARCH_KIND_ICON } from "@/utils/war";
import { CIV_DEMOGRAPHICS } from "@/utils/civDemographics";
import { sound } from "@/hooks/useSound";
import { API_BASE } from "@/config";
import { WaxSeal } from "./HeraldModal";
import { Swords, ScrollText, Compass, ArrowLeftRight, Undo2, Flame, Eye, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Brush } from "lucide-react";

interface WarRoomModalProps {
  open: boolean;
  /** Preserves pagination, filter, and scroll state when covered by a detail report */
  hidden?: boolean;
  onClose: () => void;
  me: AuthUser | null;
  activeMarches: ActiveMarch[];
  reports: BattleReport[];
  /** Report ids the player has already opened (unread ones are highlighted) */
  readIds: Set<string>;
  onOpenReport: (report: BattleReport) => void;
  /** Broom: marks every report as read */
  onMarkAllRead?: () => void;
  onOpenScoutReport?: (report: ScoutReport) => void;
  kingdoms?: DeveloperKingdom[];
  /** Peaceful civ-swap proposals involving the player */
  swapProposals?: CivSwapProposal[];
  onAnswerSwap?: (proposalId: string, action: "accept" | "decline" | "cancel") => Promise<{ success: boolean; error?: string }>;
  onRefreshMarches?: () => void;
  /** The player's scout reports, newest first */
  scoutReports?: ScoutReport[];
  /** Open rallies of the player's civilization */
  rallies?: Rally[];
  myKingdom?: DeveloperKingdom | null;
  onJoinRally?: (rallyId: string, soldiers: number, loadout?: string) => Promise<{ success: boolean; error?: string }>;
  onCancelRally?: (rallyId: string) => Promise<{ success: boolean; error?: string }>;
  /** Unread herald notices: the 📯 Notices list reloads when this changes */
  unreadNotices?: number;
  /** Opening a notice in the list closes it for the herald too */
  onReadNotice?: (id: number) => void;
}

type Filter = "mine" | "realm";

const BATTLES_PER_PAGE = 5;
const SCOUTS_PER_PAGE = 5;
const NOTICES_SHOWN = 3;

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Countdown that rewrites its own text once a second (no re-render of the list) */
function Countdown({ to, fallback = "clashing…" }: { to: number; fallback?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      if (ref.current) ref.current.textContent = to > Date.now() ? formatDuration(to - Date.now()) : fallback;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [to, fallback]);
  return <span ref={ref} className="tabular-nums" />;
}

/** Announcements pinned by royal decree stay at the top of 📯 Notices until then */
const isPinned = (b: Broadcast) => Boolean(b.pinnedUntil && Date.parse(b.pinnedUntil) > Date.now());

export function WarRoomModal({
  open,
  hidden = false,
  onClose,
  me,
  activeMarches,
  reports,
  readIds,
  onOpenReport,
  onMarkAllRead,
  onOpenScoutReport,
  kingdoms = [],
  swapProposals = [],
  onAnswerSwap,
  onRefreshMarches,
  scoutReports = [],
  rallies = [],
  myKingdom = null,
  onJoinRally,
  onCancelRally,
  unreadNotices = 0,
  onReadNotice
}: WarRoomModalProps) {
  const [battlePage, setBattlePage] = useState(1);
  const [scoutPage, setScoutPage] = useState(1);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const [civPlaces, setCivPlaces] = useState<CivPlacesResponse | null>(null);
  const [filter, setFilter] = useState<Filter>(me ? "mine" : "realm");
  // Progress bars advance once a second while the room is open
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`${API_BASE}/civ-places`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setCivPlaces(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, reports.length]);

  // 📯 Notices of the last 30 days (newest first)
  const [notices, setNotices] = useState<Broadcast[] | null>(null);
  const [openNoticeId, setOpenNoticeId] = useState<number | null>(null);
  const [showAllNotices, setShowAllNotices] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`${API_BASE}/broadcasts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setNotices(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, unreadNotices]);

  const involves = (id: string) => Boolean(me && id === me.id);
  const isMine = (r: BattleReport) => involves(r.attackerId) || involves(r.defenderId) || Boolean(me && r.participants?.includes(me.id));
  const unreadCount = reports.filter((r) => isMine(r) && !readIds.has(r.id)).length;

  const marches = useMemo(() => activeMarches.filter((m) => m.phase !== "done" && m.status !== "resolved"), [activeMarches]);
  const shown = useMemo(
    () => (filter === "mine" ? reports.filter(isMine) : reports),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, filter, me]
  );

  const handleFilterChange = (next: Filter) => {
    setFilter(next);
    setBattlePage(1);
  };

  const totalBattlePages = Math.max(1, Math.ceil(shown.length / BATTLES_PER_PAGE));
  const currentBattlePage = Math.min(battlePage, totalBattlePages);
  const pagedBattles = useMemo(() => {
    const start = (currentBattlePage - 1) * BATTLES_PER_PAGE;
    return shown.slice(start, start + BATTLES_PER_PAGE);
  }, [shown, currentBattlePage]);

  const totalScoutPages = Math.max(1, Math.ceil(scoutReports.length / SCOUTS_PER_PAGE));
  const currentScoutPage = Math.min(scoutPage, totalScoutPages);
  const pagedScouts = useMemo(() => {
    const start = (currentScoutPage - 1) * SCOUTS_PER_PAGE;
    return scoutReports.slice(start, start + SCOUTS_PER_PAGE);
  }, [scoutReports, currentScoutPage]);

  const handleRecall = async (marchId: string) => {
    setRecallingId(marchId);
    try {
      const res = await fetch(`${API_BASE}/marches/${encodeURIComponent(marchId)}/recall`, { method: "POST" });
      if (res.ok) {
        sound.playClick();
        onRefreshMarches?.();
      }
    } finally {
      setRecallingId(null);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      hidden={hidden}
      onClose={onClose}
      accentBorder="border-rose-500/50"
      headerClassName="bg-linear-to-b from-rose-950 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <span className="text-2xl w-11 h-11 shrink-0 rounded-xl bg-rose-950/80 border border-rose-500/50 flex items-center justify-center">⚔️</span>
          <div>
            <h3 className="text-lg font-bold font-medieval text-rose-100 tracking-wide">War Room</h3>
            <p className="text-xs text-slate-400 font-mono">Armies on the march, War Frenzy & the chronicle of every battle</p>
          </div>
        </div>
      }
    >
      <div className="p-4 space-y-4 text-xs font-mono">
        {/* Herald notices */}
        {notices && notices.length > 0 && (
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-bold">📯 Notices · last 30 days ({notices.length})</h4>
            <ul className="space-y-1.5">
              {(showAllNotices ? notices : notices.slice(0, NOTICES_SHOWN)).map((n) => {
                const expanded = openNoticeId === n.id;
                // Signed out, reads are only kept in the browser: no unread marks
                const unread = Boolean(me) && !n.read;
                return (
                  <li key={n.id} className={`rounded-lg border ${unread ? "border-amber-500/50 bg-amber-950/20" : "border-slate-800 bg-slate-900/60"}`}>
                    <button
                      onClick={() => {
                        sound.playClick();
                        setOpenNoticeId(expanded ? null : n.id);
                        if (unread) {
                          onReadNotice?.(n.id);
                          setNotices((list) => list && list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                        }
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/70 transition"
                      aria-expanded={expanded}
                    >
                      <WaxSeal notice={n} size={22} />
                      {isPinned(n) && (
                        <span className="shrink-0" title="Pinned by royal decree">📌</span>
                      )}
                      <span className="truncate font-bold text-slate-200">{n.title}</span>
                      {unread && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" title="Unread" />}
                      <span className="ml-auto text-[10px] text-slate-500 shrink-0">{timeAgo(n.createdAt)}</span>
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                    </button>
                    {expanded && (
                      <div className="px-3 pb-2.5 pl-10 space-y-0.5 text-slate-300 font-sans">
                        {n.kind === "chronicle" ? (
                          <div className="rounded-lg px-3 pt-3 pb-1 bg-[#FDF6E3]">
                            <ChronicleText body={n.body} compact />
                          </div>
                        ) : (
                          n.body.split("\n").map((line, i) => (line.trim() ? <p key={i}>{line}</p> : <div key={i} className="h-1.5" />))
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {notices.length > NOTICES_SHOWN && (
              <button onClick={() => setShowAllNotices((v) => !v)} className="px-1 text-[11px] text-amber-300 hover:text-amber-200 font-bold">
                {showAllNotices ? "Show fewer" : `Show all ${notices.length}`}
              </button>
            )}
          </section>
        )}

        {/* War Frenzy & Province Places */}
        {civPlaces && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                <Flame className="w-3.5 h-3.5 text-orange-400" /> Realm Balance & War Frenzy (Week {civPlaces.weekKey})
              </h4>
              {civPlaces.frenzyPairs.length > 0 && (
                <span className="text-[10px] text-rose-300 font-bold">
                  {civPlaces.frenzyPairs.map((f) => `${CIV_EMBLEM[f.civA]}⚔️${CIV_EMBLEM[f.civB]}`).join(" · ")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1.5 text-center">
              {Object.values(civPlaces.places).map((p) => (
                <div key={p.civ} className="p-1.5 rounded-lg bg-slate-900/70 border border-slate-800">
                  <div className="font-bold text-slate-200">
                    {CIV_EMBLEM[p.civ]} {CIV_DEMOGRAPHICS[p.civ].name.split(" ")[0]}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {p.occupied}/{p.places} · <span className={p.open > 0 ? "text-emerald-300 font-bold" : "text-slate-500"}>{p.open} open</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Diplomacy: peaceful civilization swaps */}
        {me && swapProposals.length > 0 && (
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
              <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" /> Diplomacy
            </h4>
            <ul className="space-y-1.5">
              {swapProposals.map((p) => {
                const incoming = p.toId === me.id;
                const other = kingdoms.find((k) => k.id === (incoming ? p.fromId : p.toId));
                const answer = async (action: "accept" | "decline" | "cancel") => {
                  setSwapError(null);
                  const res = await onAnswerSwap?.(p.id, action);
                  if (res && !res.success) setSwapError(res.error || "Failed");
                };
                return (
                  <li key={p.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${p.status === "pending" ? "border-sky-500/50 bg-sky-950/30" : "border-slate-800 bg-slate-900/60 opacity-70"}`}>
                    <span>{CIV_EMBLEM[incoming ? p.toCiv : p.fromCiv]}</span>
                    <span className="text-slate-500">⇄</span>
                    <span>{CIV_EMBLEM[incoming ? p.fromCiv : p.toCiv]}</span>
                    <span className="min-w-0 truncate text-slate-200">
                      {incoming ? `${other?.name ?? p.fromId} offers to swap civilizations` : `Swap offered to ${other?.name ?? p.toId}`}
                    </span>
                    {p.status === "pending" ? (
                      <span className="ml-auto flex gap-1.5 shrink-0">
                        {incoming ? (
                          <>
                            <button onClick={() => answer("decline")} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold">
                              Decline
                            </button>
                            <button onClick={() => answer("accept")} className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold">
                              Accept
                            </button>
                          </>
                        ) : (
                          <button onClick={() => answer("cancel")} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold">
                            Withdraw
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="ml-auto shrink-0 text-[10px] uppercase text-slate-500">{p.status}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {swapError && <p className="text-rose-300">{swapError}</p>}
          </section>
        )}

        {/* Rallies of the player's civilization */}
        {me && (
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-bold">🚩 Open rallies ({rallies.length})</h4>
            <RallyList rallies={rallies} myKingdom={myKingdom} onJoin={onJoinRally} onCancel={onCancelRally} />
          </section>
        )}

        {/* Armies on the road */}
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
            <Compass className="w-3.5 h-3.5 text-amber-400" /> Active Marches ({marches.length})
          </h4>
          {marches.length === 0 ? (
            <p className="px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-500">No army is on the road.</p>
          ) : (
            <ul className="space-y-1.5">
              {marches.map((m) => {
                const mine = involves(m.attackerId);
                const phase = m.phase ?? "outbound";
                const canRecall = mine && (phase === "outbound" || phase === "acting");
                const startT = phase === "returning" ? m.arrivalTime : m.departTime;
                const endT = phase === "returning" ? (m.returnTime ?? m.arrivalTime + 1000) : m.arrivalTime;
                const progress = phase === "acting" ? 1 : Math.min(1, Math.max(0, (now - startT) / Math.max(1, endT - startT)));
                return (
                  <li key={m.id} className={`px-3 py-2 rounded-lg border ${mine ? "border-rose-500/50 bg-rose-950/30" : "border-slate-800 bg-slate-900/60"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{CIV_EMBLEM[m.attackerCiv]}</span>
                      <span className="font-bold text-slate-100 truncate">{m.attackerName}</span>
                      {mine && <span className="px-1 rounded bg-emerald-900/70 text-emerald-300 text-[9px] font-bold">YOU</span>}
                      <span className="text-slate-500">{phase === "returning" ? "↩" : "→"}</span>
                      <span className="text-amber-200 truncate">{m.targetName}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] uppercase text-slate-300">{phase}</span>
                      <span className="ml-auto shrink-0 text-rose-300 font-bold flex items-center gap-2">
                        <span>
                          {m.band ? m.band.emblem : MARCH_KIND_ICON[m.kind ?? "attack"] ?? "⚔️"} {marchForceText(m)} ·{" "}
                          {phase === "acting" && m.gather ? (
                            <span className="text-emerald-300">{m.gather.pausedAt ? "Fighting off an attack" : <Countdown to={m.actUntil ?? now} fallback="done…" />}</span>
                          ) : phase === "acting" ? (
                            <span className="text-orange-300">
                              In combat (R{m.currentBattleRound ?? 1})
                              {m.lastBattleRound && (
                                <span className="ml-1 text-[10px] font-normal tabular-nums" title={`Round ${m.lastBattleRound.round}: attackers lost ${m.lastBattleRound.attackerLosses.toLocaleString()}, defenders lost ${m.lastBattleRound.defenderLosses.toLocaleString()}`}>
                                  −{m.lastBattleRound.attackerLosses.toLocaleString()} / −{m.lastBattleRound.defenderLosses.toLocaleString()}
                                </span>
                              )}
                            </span>
                          ) : (
                            <Countdown to={endT} fallback={phase === "returning" ? "arriving home…" : "clashing…"} />
                          )}
                        </span>
                        {canRecall && (
                          <button
                            onClick={() => handleRecall(m.id)}
                            disabled={recallingId === m.id}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 text-[10px] font-bold flex items-center gap-1 disabled:opacity-40"
                            title="Recall army (no ration refund)"
                          >
                            <Undo2 className="w-3 h-3" /> Recall
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full ${phase === "returning" ? "bg-linear-to-r from-sky-500 to-emerald-400" : "bg-linear-to-r from-rose-500 to-amber-400"}`}
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Scout reports (delivered once the scouts are home) */}
        {me && (
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
              <Eye className="w-3.5 h-3.5 text-sky-400" /> Scout reports ({scoutReports.length})
            </h4>
            {scoutReports.length === 0 ? (
              <p className="px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-500">
                No reports yet. Click a rival kingdom, a Voidrift citadel or anything on the map and send 👁️ scouts.
              </p>
            ) : (
              <div className="space-y-2">
                <ul className="space-y-1.5">
                  {pagedScouts.map((r) =>
                    r.caught ? (
                      <li key={r.id} className="rounded-lg border border-rose-800/70 bg-rose-950/40 flex items-center gap-2 px-3 py-2" title={`Caught by ${r.caught.by}`}>
                        <span className="w-5 text-center">💀</span>
                        <span className="truncate font-bold text-rose-200">{r.targetName}</span>
                        <span className="text-[10px] text-rose-300/90 truncate">
                          {r.caught.scouts} {r.caught.scouts === 1 ? "scout" : "scouts"} caught · no report
                        </span>
                        <span className="ml-auto text-[10px] text-rose-300/70 shrink-0">{formatAgo(r.takenAt)}</span>
                      </li>
                    ) : (
                    <li key={r.id} className={`rounded-lg border bg-slate-900/60 ${r.details.doubtful ? "border-amber-500/70" : "border-slate-800"}`}>
                      <button
                        onClick={() => {
                          sound.playClick();
                          onOpenScoutReport?.(r);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/70 transition"
                      >
                        <span className="w-5 text-center">{r.details.emblem ?? (r.details.civilization ? CIV_EMBLEM[r.details.civilization] : "👁️")}</span>
                        <span className="truncate font-bold text-slate-200">{r.targetName}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] uppercase text-slate-300">{r.targetKind.replace("_", " ")}</span>
                        <span className="ml-auto text-[10px] text-slate-500 shrink-0">{formatAgo(r.takenAt)}</span>
                        {r.details.doubtful && <span title="This intel feels doubtful">⚠️</span>}
                        <Eye className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-1" />
                      </button>
                    </li>
                    )
                  )}
                </ul>
                {totalScoutPages > 1 && (
                  <div className="flex items-center justify-between px-1 text-slate-400 text-[11px]">
                    <span>
                      {(currentScoutPage - 1) * SCOUTS_PER_PAGE + 1}–{Math.min(currentScoutPage * SCOUTS_PER_PAGE, scoutReports.length)} of {scoutReports.length} reports
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setScoutPage((p) => Math.max(1, p - 1))}
                        disabled={currentScoutPage <= 1}
                        className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 font-bold transition flex items-center gap-1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> Prev
                      </button>
                      <span className="px-2 text-slate-300 font-bold tabular-nums">
                        {currentScoutPage} / {totalScoutPages}
                      </span>
                      <button
                        onClick={() => setScoutPage((p) => Math.min(totalScoutPages, p + 1))}
                        disabled={currentScoutPage >= totalScoutPages}
                        className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 font-bold transition flex items-center gap-1"
                      >
                        Next <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Battle chronicle */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
              <ScrollText className="w-3.5 h-3.5 text-amber-400" /> Battle reports ({shown.length})
            </h4>
            <div className="flex items-center gap-1.5">
            {onMarkAllRead && unreadCount > 0 && (
              <button
                onClick={() => {
                  sound.playClick();
                  onMarkAllRead();
                }}
                title={`Mark all as read (${unreadCount} unread)`}
                aria-label="Mark all as read"
                className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-amber-300 hover:bg-slate-800 hover:text-amber-200 transition"
              >
                <Brush className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-[11px]">
              {(["mine", "realm"] as Filter[]).map((f) => (
                <button
                  key={f}
                  disabled={f === "mine" && !me}
                  onClick={() => handleFilterChange(f)}
                  className={`px-2.5 py-1 font-bold transition disabled:opacity-40 ${filter === f ? "bg-amber-500 text-slate-950" : "bg-slate-900 text-slate-300 hover:bg-slate-800"}`}
                >
                  {f === "mine" ? "My battles" : "Whole realm"}
                </button>
              ))}
            </div>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="px-3 py-6 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-500 text-center">
              {filter === "mine" ? "You haven't fought a battle yet. Click a rival kingdom or Voidrift citadel on the map to march on it." : "No battles fought yet."}
            </p>
          ) : (
            <div className="space-y-2">
              <ul className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-900/50">
                {pagedBattles.map((r) => {
                  const iAttacked = involves(r.attackerId);
                  const iDefended = involves(r.defenderId);
                  const won = (iAttacked && r.attackerWon) || (iDefended && !r.attackerWon);
                  const lost = (iAttacked && !r.attackerWon) || (iDefended && r.attackerWon);
                  const unread = isMine(r) && !readIds.has(r.id);
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => {
                          sound.playClick();
                          onOpenReport(r);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-800/70 transition"
                      >
                        <span className="text-base w-6 text-center shrink-0">{r.usurpedSlot ? "👑" : r.attackerWon ? "🏆" : "🛡️"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-slate-200">
                            <span className="truncate font-bold">{r.attackerName}</span>
                            <span className="text-slate-500 shrink-0">vs</span>
                            <span className="truncate text-amber-200">{r.defenderName}</span>
                            {unread && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" title="Unread" />}
                          </span>
                          <span className="block text-[10px] text-slate-500">
                            {r.usurpedSlot ? "Voidrift slot taken" : r.attackerWon ? "Attacker won" : "Assault repelled"} · losses{" "}
                            <span className="text-rose-300">{sideLossText(r.armies?.filter((a) => a.side === "attacker") ?? [], r.attackerInitialSoldiers, r.attackerCasualties)}{r.attackerWounded ? ` (${r.attackerWounded.toLocaleString()} wounded)` : ""}</span> /{" "}
                            <span className="text-rose-300">{sideLossText(r.armies?.filter((a) => a.side === "defender") ?? [], r.defenderInitialSoldiers, r.defenderCasualties)}{r.defenderWounded ? ` (${r.defenderWounded.toLocaleString()} wounded)` : ""}</span> · {timeAgo(r.timestamp)}
                          </span>
                        </span>
                        {(won || lost) && (
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              won ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/60" : "bg-rose-950/80 text-rose-300 border-rose-700/60"
                            }`}
                          >
                            {won ? "WON" : "LOST"}
                          </span>
                        )}
                        <Swords className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {totalBattlePages > 1 && (
                <div className="flex items-center justify-between px-1 text-slate-400 text-[11px]">
                  <span>
                    {(currentBattlePage - 1) * BATTLES_PER_PAGE + 1}–{Math.min(currentBattlePage * BATTLES_PER_PAGE, shown.length)} of {shown.length} battles
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setBattlePage((p) => Math.max(1, p - 1))}
                      disabled={currentBattlePage <= 1}
                      className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 font-bold transition flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Prev
                    </button>
                    <span className="px-2 text-slate-300 font-bold tabular-nums">
                      {currentBattlePage} / {totalBattlePages}
                    </span>
                    <button
                      onClick={() => setBattlePage((p) => Math.min(totalBattlePages, p + 1))}
                      disabled={currentBattlePage >= totalBattlePages}
                      className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 font-bold transition flex items-center gap-1"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

