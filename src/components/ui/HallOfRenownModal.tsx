import { useEffect, useRef, useState, type Ref } from "react";
import { Trophy, Info, RefreshCw } from "lucide-react";
import { Modal } from "./Modal";
import { CivFrame } from "./CivFrame";
import { CIV_META } from "./TopHUD";
import { API_BASE } from "@/config";
import { sound } from "@/hooks/useSound";
import { DeveloperKingdom, Leaderboard, LeaderboardEntry, LeaderboardPeriod } from "@/types";

const TABS: Array<{ id: LeaderboardPeriod; label: string; hint: string }> = [
  { id: "week", label: "Weekly", hint: "Last full week (Mon–Sun)" },
  { id: "month", label: "Monthly", hint: "Last full calendar month" },
  { id: "year", label: "Year", hint: "This fiscal year so far" },
  { id: "all", label: "All time", hint: "From each developer's first commit" }
];

const AXES = [
  { key: "activeness", label: "Activeness", short: "Active", color: "bg-emerald-400", weight: "40%" },
  { key: "repoActivity", label: "Repo activeness", short: "Repos", color: "bg-sky-400", weight: "30%" },
  { key: "quality", label: "Repo quality", short: "Quality", color: "bg-amber-400", weight: "30%" }
] as const;

const PODIUM = [
  { place: 2, height: "h-14", ring: "from-slate-300 to-slate-500", medal: "🥈" },
  { place: 1, height: "h-20", ring: "from-amber-300 to-amber-600", medal: "🥇" },
  { place: 3, height: "h-10", ring: "from-orange-400 to-orange-700", medal: "🥉" }
];

function axisTitle(e: LeaderboardEntry, axis: (typeof AXES)[number]): string {
  const a = e[axis.key];
  const detail =
    axis.key === "activeness"
      ? `${e.activeDays} active days / ${e.workdays} working days (${Math.round(a.value * 100)}%)`
      : axis.key === "repoActivity"
        ? `Σ √(XP per repo) = ${a.value} over ${e.repos} repo${e.repos === 1 ? "" : "s"}`
        : `${a.value} from ${e.qualityRepos} repo${e.qualityRepos === 1 ? "" : "s"} at Lv3+`;
  return `${axis.label} (${axis.weight}): rank #${a.rank} · percentile ${Math.round(a.pct)}\n${detail}`;
}

function Change({ change, since }: { change: number | null; since: string }) {
  if (change === null) return <span className="text-[10px] font-bold text-sky-300" title={`Not ranked ${since}`}>NEW</span>;
  if (change === 0) return <span className="text-[10px] text-slate-600" title={`Same place as ${since}`}>–</span>;
  const up = change > 0;
  return (
    <span className={`text-[10px] font-bold tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`} title={`${up ? "Up" : "Down"} ${Math.abs(change)} since ${since}`}>
      {up ? "▲" : "▼"}
      {Math.abs(change)}
    </span>
  );
}

function Row({
  e,
  kingdom,
  me,
  since,
  onSelect,
  rowRef,
  pinned = false,
  allTime = false
}: {
  e: LeaderboardEntry;
  kingdom?: DeveloperKingdom;
  me: boolean;
  since: string;
  onSelect: (id: string) => void;
  rowRef?: Ref<HTMLButtonElement>;
  pinned?: boolean;
  /** All time tab: the top 3 wear the metal civ frame */
  allTime?: boolean;
}) {
  const civ = kingdom?.civilization ?? e.civilization;
  const meta = CIV_META[civ] ?? CIV_META.human;
  const name = kingdom?.name ?? e.name;
  return (
    <button
      ref={rowRef}
      onClick={() => onSelect(e.userId)}
      className={`w-full grid grid-cols-[2.25rem_minmax(0,1fr)_3rem_minmax(5.5rem,8rem)_2rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_3.5rem_minmax(7rem,11rem)_2.5rem] items-center gap-2 px-3 py-1.5 text-left transition ${
        pinned ? "bg-emerald-950/95 border-t border-emerald-700/60" : me ? "bg-emerald-950/40 hover:bg-emerald-900/40" : "hover:bg-slate-800/70"
      }`}
      title={`${name} · ${meta.label} — open this kingdom`}
    >
      <span className="font-mono font-bold tabular-nums text-slate-400 text-xs text-right pr-1">#{e.rank}</span>
      <span className="flex items-center gap-2 min-w-0">
        <CivFrame civ={civ} renown={allTime && e.rank <= 3 ? (e.rank as 1 | 2 | 3) : null} initial={name.charAt(0)} className="w-6 h-6 shrink-0" />
        <span className="min-w-0">
          <span className={`block truncate text-xs font-semibold ${me ? "text-emerald-300" : "text-slate-200"}`}>
            <span className="inline-block mr-1.5 px-1 rounded bg-slate-800 border border-amber-700/50 text-amber-300 text-[9px] font-mono font-bold tabular-nums align-[1px]">
              Lv{kingdom?.cityHallLevel ?? e.castleLevel}
            </span>
            {name}
            {me && <span className="ml-1.5 px-1 rounded bg-emerald-900/70 text-emerald-300 text-[9px] font-bold">YOU</span>}
          </span>
          <span className="block truncate text-[10px] text-slate-500">
            {meta.icon} {meta.realm}
          </span>
        </span>
      </span>
      <span className="font-mono font-bold tabular-nums text-amber-200 text-sm text-right">{e.score.toFixed(1)}</span>
      <span className="flex flex-col gap-0.5">
        {AXES.map((axis) => (
          <span key={axis.key} className="flex items-center gap-1" title={axisTitle(e, axis)}>
            <span className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
              <span className={`block h-full rounded-full ${axis.color}`} style={{ width: `${Math.max(3, e[axis.key].pct)}%` }} />
            </span>
            <span className="w-5 text-right text-[9px] font-mono tabular-nums text-slate-500">#{e[axis.key].rank}</span>
          </span>
        ))}
      </span>
      <span className="text-center">
        <Change change={e.change} since={since} />
      </span>
    </button>
  );
}

function Podium({
  entries,
  byId,
  meId,
  onSelect,
  allTime
}: {
  entries: LeaderboardEntry[];
  byId: Map<string, DeveloperKingdom>;
  meId?: string;
  onSelect: (id: string) => void;
  allTime: boolean;
}) {
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6 px-4 pt-5 pb-1">
      {PODIUM.map((p) => {
        const e = entries[p.place - 1];
        if (!e) return <div key={p.place} className="w-24 sm:w-32" />;
        const k = byId.get(e.userId);
        const name = k?.name ?? e.name;
        const civ = k?.civilization ?? e.civilization;
        return (
          <button key={p.place} onClick={() => onSelect(e.userId)} className="w-24 sm:w-32 flex flex-col items-center group" title={`${name} — open this kingdom`}>
            {/* All time: the crowned frame already shows the place */}
            {allTime ? <span className="h-4" /> : <span className="text-xl leading-none mb-1">{p.medal}</span>}
            <span className={`rounded-full p-0.5 bg-linear-to-b ${p.ring} shadow-lg ${p.place === 1 ? "shadow-amber-500/30" : "shadow-black/40"}`}>
              <CivFrame civ={civ} renown={allTime ? (p.place as 1 | 2 | 3) : null} initial={name.charAt(0)} className={p.place === 1 ? "w-14 h-14" : "w-11 h-11"} />
            </span>
            <span className={`mt-1.5 w-full truncate text-center text-xs font-semibold group-hover:text-amber-200 ${e.userId === meId ? "text-emerald-300" : "text-slate-100"}`}>{name}</span>
            <span className="font-mono font-bold text-amber-300 text-sm tabular-nums">{e.score.toFixed(1)}</span>
            <span className={`mt-1 w-full ${p.height} rounded-t-lg border border-b-0 border-amber-800/40 bg-linear-to-b from-amber-900/50 to-slate-900 flex items-start justify-center pt-1 font-medieval font-bold text-amber-200/80`}>
              {p.place}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Explainer() {
  return (
    <div className="mx-4 mt-3 rounded-xl border border-slate-700/70 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-300 space-y-1.5">
      <p>
        The Hall of Renown ranks <strong>pace and quality, not totals</strong>, so a developer with one year can rank with one who has three. Each ruler is placed on three
        axes, each axis becomes a percentile (0–100) among everyone ranked, and the <strong>fairness score</strong> is their weighted average.
      </p>
      <ul className="space-y-1">
        <li>
          <span className="text-emerald-300 font-semibold">Activeness 40%</span> — days with a meaningful commit ÷ working days (Mon–Fri). All time uses your own tenure; very
          short tenures are pulled toward the realm average.
        </li>
        <li>
          <span className="text-sky-300 font-semibold">Repo activeness 30%</span> — Σ √(XP earned in each repo). Real work spread over repos counts; hammering one repo flattens
          out. All time: per year of tenure.
        </li>
        <li>
          <span className="text-amber-300 font-semibold">Repo quality 30%</span> — every repo you worked on at <strong>Lv3+</strong> is worth 1 + ln(level ÷ 3): Lv3 = 1.0,
          Lv5 = 1.5, Lv10 = 2.2, Lv25 = 3.1. Levels at the end of the period; all time divides by √(tenure years).
        </li>
      </ul>
      <p className="text-slate-500">Ties go to higher activeness. Overseers and the Archon aren't ranked; rulers without a commit in the period aren't listed.</p>
    </div>
  );
}

export function HallOfRenownModal({
  open,
  onClose,
  kingdoms,
  meId,
  onSelectKingdom
}: {
  open: boolean;
  onClose: () => void;
  kingdoms: DeveloperKingdom[];
  meId?: string;
  onSelectKingdom: (id: string) => void;
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [boards, setBoards] = useState<Partial<Record<LeaderboardPeriod, Leaderboard>>>({});
  const [errors, setErrors] = useState<Partial<Record<LeaderboardPeriod, string>>>({});
  const [showInfo, setShowInfo] = useState(false);
  const [meVisible, setMeVisible] = useState(true);
  const meRowRef = useRef<HTMLButtonElement>(null);
  const board = boards[period];
  const error = board ? null : errors[period] ?? null;

  useEffect(() => {
    if (!open) return;
    const cached = boards[period];
    if (cached && Date.now() < cached.nextRefreshAt) return;
    let cancelled = false;
    fetch(`${API_BASE}/leaderboard?period=${period}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        return data as Leaderboard;
      })
      .then((data) => !cancelled && setBoards((b) => ({ ...b, [period]: data })))
      .catch((err) => !cancelled && setErrors((e) => ({ ...e, [period]: err.message })));
    return () => {
      cancelled = true;
    };
  }, [open, period, boards]);

  // Pin the ruler's own row at the bottom while it's scrolled out of view
  const myEntry = board?.entries.find((e) => e.userId === meId);
  useEffect(() => {
    const el = meRowRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setMeVisible(entry.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [board, myEntry]);

  const byId = new Map(kingdoms.map((k) => [k.id, k]));
  const select = (id: string) => {
    sound.playClick();
    onSelectKingdom(id);
    onClose();
  };

  const header = (
    <div className="flex items-center gap-3">
      <span className="w-10 h-10 shrink-0 rounded-xl bg-linear-to-b from-amber-400 to-amber-700 border border-amber-300/50 flex items-center justify-center shadow-lg shadow-amber-900/40">
        <Trophy className="w-5 h-5 text-slate-950" />
      </span>
      <div className="min-w-0">
        <h2 className="font-medieval text-lg font-bold text-amber-200 leading-tight">Hall of Renown</h2>
        <p className="text-[11px] text-slate-400 truncate">Fairness ranking: pace and quality, not totals</p>
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} header={header} size="lg" accentBorder="border-amber-700/50" headerClassName="bg-linear-to-b from-amber-950/60 to-slate-950">
      <div className="sticky top-0 z-10 bg-slate-900/95 border-b border-slate-800 px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <div className="flex flex-1 gap-1 rounded-xl bg-slate-950/70 p-1 border border-slate-800">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  sound.playClick();
                  setPeriod(t.id);
                }}
                title={t.hint}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${period === t.id ? "bg-amber-500 text-slate-950 shadow" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowInfo((s) => !s)}
            className={`h-9 w-9 shrink-0 rounded-xl border flex items-center justify-center transition ${showInfo ? "border-amber-500/60 bg-amber-500/15 text-amber-300" : "border-slate-700 bg-slate-800/70 text-slate-400 hover:text-slate-100"}`}
            title="How the fairness score works"
            aria-label="How the fairness score works"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
        {board && (
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-[10px] text-slate-500">
            <span>
              <span className="text-slate-300 font-semibold">{board.label}</span>
              {board.period === "year" && <> · {board.workdays} working day{board.workdays === 1 ? "" : "s"} so far</>}
              {board.period !== "year" && board.period !== "all" && <> · {board.workdays} working days</>}
              {" · "}
              {board.entries.length} ranked
            </span>
            <span>
              ▲▼ since {board.changeSince} · {board.period === "week" || board.period === "month" ? "final" : "updates daily"}
            </span>
          </div>
        )}
      </div>

      {showInfo && <Explainer />}

      {error && <div className="m-4 rounded-xl border border-rose-700/60 bg-rose-950/40 p-3 text-xs text-rose-200">⚠️ Couldn't load the ranking: {error}</div>}

      {!board && !error && (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin" /> Gathering the heralds' tallies…
        </div>
      )}

      {board && board.entries.length === 0 && (
        <div className="py-16 text-center text-sm text-slate-500">
          <div className="text-4xl mb-2">🕯️</div>
          No deeds recorded yet for this period.
        </div>
      )}

      {board && board.entries.length > 0 && (
        <>
          <Podium entries={board.entries} byId={byId} meId={meId} onSelect={select} allTime={board.period === "all"} />
          <div className="border-t border-slate-800">
            <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_3rem_minmax(5.5rem,8rem)_2rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_3.5rem_minmax(7rem,11rem)_2.5rem] gap-2 px-3 py-1.5 text-[9px] uppercase tracking-wider text-slate-500 font-semibold bg-slate-950/50">
              <span className="text-right pr-1">Rank</span>
              <span>Ruler</span>
              <span className="text-right">Score</span>
              <span className="flex gap-2">
                {AXES.map((a) => (
                  <span key={a.key} className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${a.color}`} />
                    {a.short}
                  </span>
                ))}
              </span>
              <span className="text-center">±</span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {board.entries.map((e) => (
                <Row
                  key={e.userId}
                  e={e}
                  kingdom={byId.get(e.userId)}
                  me={e.userId === meId}
                  since={board.changeSince}
                  onSelect={select}
                  rowRef={e.userId === meId ? meRowRef : undefined}
                  allTime={board.period === "all"}
                />
              ))}
            </div>
          </div>
          {myEntry && !meVisible && (
            <div className="sticky bottom-0 z-10 shadow-[0_-8px_16px_rgba(0,0,0,0.4)]">
              <Row e={myEntry} kingdom={byId.get(myEntry.userId)} me since={board.changeSince} onSelect={select} pinned allTime={board.period === "all"} />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
