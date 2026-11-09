import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Modal } from "./Modal";
import { TitlesShowcase, AllTitlesModal } from "./TitlesShowcase";
import { ArchonSeal } from "./CivFrame";
import { DeveloperKingdom, RepoBuilding, AuthUser } from "@/types";
import { castleStage, compareBuildings } from "@/utils/castle";
import { sound } from "@/hooks/useSound";
import { API_BASE } from "@/config";
import { ExternalLink, Flame, GitCommit, GitPullRequest, FolderGit2, Calendar, Award, TrendingUp, RefreshCw, CheckCircle2, AlertTriangle, Gamepad2, Search, X, Eye, Feather } from "lucide-react";

interface DevProfileModalProps {
  kingdom: DeveloperKingdom | null;
  currentKingdom?: DeveloperKingdom | null;
  me?: AuthUser | null;
  onClose: () => void;
  onSelectBuilding?: (building: RepoBuilding) => void;
  isAdmin?: boolean;
  onResyncCommits?: (devId: string) => Promise<any>;
  onKingdomUpdated?: (updated: DeveloperKingdom) => void;
}

export function DevProfileModal({
  kingdom: initialKingdom,
  currentKingdom,
  me,
  onClose,
  onSelectBuilding,
  isAdmin,
  onResyncCommits,
  onKingdomUpdated
}: DevProfileModalProps) {
  const [kingdom, setKingdom] = useState<DeveloperKingdom | null>(initialKingdom);
  const [isResyncing, setIsResyncing] = useState(false);
  const [resyncStatus, setResyncStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<"projects" | "commits" | "activity">("projects");
  // Projects & Repositories: filter by name, branch or district
  const [repoQuery, setRepoQuery] = useState("");
  // The all-titles window opens over this profile; closing it brings the profile back
  const [allTitlesOpen, setAllTitlesOpen] = useState(false);

  useEffect(() => {
    setKingdom(initialKingdom);
    setResyncStatus(null);
  }, [initialKingdom]);

  const [containerWidth, setContainerWidth] = useState<number>(0);
  const roRef = useRef<ResizeObserver | null>(null);

  const heatmapContainerRef = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (el) {
      const measure = () => {
        const w = el.clientWidth;
        if (w > 0) setContainerWidth(w);
      };
      measure();

      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const w = entry.contentRect.width;
            if (w > 0) setContainerWidth(Math.floor(w));
          }
        });
        ro.observe(el);
        roRef.current = ro;
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
    };
  }, []);

  // Helper to format local date YYYY-MM-DD
  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Full-year & dynamic past-month contribution calendar (unconditionally declared before any early return)
  // Smartly detects available width to display more historical months back in time
  const hasKingdom = Boolean(kingdom);
  const kingdomDailyCommits = kingdom?.activity?.dailyCommits;
  const { weeks, monthLabels, totalPeriodCommits, totalMonths } = useMemo(() => {
    if (!hasKingdom) return { weeks: [], monthLabels: [], totalPeriodCommits: 0, totalMonths: 12 };
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    // Complete the current month (e.g. Oct 31) and extend to the Saturday ending that week
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const endDate = new Date(lastDayOfMonth);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    // Smartly compute how many weeks can fit in the measured container width
    // Left weekday label width + gap = 24px; each week column takes 13px (10px cell + 3px gap)
    const availableForColumns = containerWidth > 0 ? containerWidth - 28 : 700;
    const fitWeeks = Math.floor(availableForColumns / 13);
    // At least 52 weeks (1 full year), and more if there is available space
    const numWeeks = Math.max(52, fitWeeks);

    // Calculate start date by going back numWeeks
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (numWeeks * 7 - 1));

    const todayStr = formatYMD(now);
    const dailyCommits: Record<string, number> = { ...(kingdomDailyCommits || {}) };

    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const weeksArr: Array<Array<{ dateStr: string; date: Date; count: number; level: number; isFuture: boolean }>> = [];
    const labels: Array<{ weekIndex: number; name: string }> = [];

    let lastMonth = -1;
    const cur = new Date(startDate);
    let totalCommits = 0;

    for (let w = 0; w < numWeeks; w++) {
      const week: Array<{ dateStr: string; date: Date; count: number; level: number; isFuture: boolean }> = [];
      const m = cur.getMonth();
      if (m !== lastMonth) {
        if (labels.length === 0) {
          labels.push({ weekIndex: w, name: MONTH_NAMES[m] });
        } else {
          const prev = labels[labels.length - 1];
          if (prev.weekIndex === 0 && w < 3) {
            labels[labels.length - 1] = { weekIndex: w, name: MONTH_NAMES[m] };
          } else if (w - prev.weekIndex >= 3 && numWeeks - w >= 2) {
            labels.push({ weekIndex: w, name: MONTH_NAMES[m] });
          }
        }
        lastMonth = m;
      }

      for (let d = 0; d < 7; d++) {
        const date = new Date(cur);
        const dateStr = formatYMD(date);
        const isFuture = dateStr > todayStr;
        const count = dailyCommits[dateStr] || 0;
        if (!isFuture) totalCommits += count;

        let level = 0;
        if (isFuture) {
          level = -1; // Future day in month
        } else if (count >= 10) {
          level = 4;
        } else if (count >= 6) {
          level = 3;
        } else if (count >= 3) {
          level = 2;
        } else if (count >= 1) {
          level = 1;
        }

        week.push({ dateStr, date, count, level, isFuture });
        cur.setDate(cur.getDate() + 1);
      }
      weeksArr.push(week);
    }

    const calculatedMonths = Math.max(12, Math.round(numWeeks / 4.33));
    return { weeks: weeksArr, monthLabels: labels, totalPeriodCommits: totalCommits, totalMonths: calculatedMonths };
  }, [hasKingdom, kingdomDailyCommits, containerWidth]);

  if (!kingdom) return null;

  const handleResync = async () => {
    if (!onResyncCommits || !kingdom || isResyncing) return;
    setIsResyncing(true);
    setResyncStatus(null);
    try {
      sound.playClick();
      const res = await onResyncCommits(kingdom.id);
      sound.playLevelUp();
      setResyncStatus({
        type: "success",
        text: res.message || "Commits & repositories re-checked and updated successfully!"
      });
      if (res.kingdom) {
        setKingdom(res.kingdom);
        if (onKingdomUpdated) onKingdomUpdated(res.kingdom);
      }
    } catch (err: any) {
      setResyncStatus({
        type: "error",
        text: err.message || "Failed to re-check commits"
      });
    } finally {
      setIsResyncing(false);
    }
  };

  const civThemes = {
    human: {
      border: "border-blue-500/50",
      headerBg: "from-blue-950/80 via-slate-900 to-slate-950",
      accent: "text-blue-400",
      badge: "bg-blue-950 text-blue-300 border-blue-700/60",
      tag: "bg-blue-900/40 text-blue-300",
      emblem: "👑",
      citadelName: "Valorian Citadel"
    },
    elf: {
      border: "border-teal-500/50",
      headerBg: "from-teal-950/80 via-slate-900 to-slate-950",
      accent: "text-teal-400",
      badge: "bg-teal-950 text-teal-300 border-teal-700/60",
      tag: "bg-teal-900/40 text-teal-300",
      emblem: "🌸",
      citadelName: "Sylvandale Great Tree"
    },
    dwarf: {
      border: "border-orange-500/50",
      headerBg: "from-orange-950/80 via-slate-900 to-slate-950",
      accent: "text-orange-400",
      badge: "bg-orange-950 text-orange-300 border-orange-700/60",
      tag: "bg-orange-900/40 text-orange-300",
      emblem: "⚒️",
      citadelName: "Ironforge High Keep"
    },
    orc: {
      border: "border-red-500/50",
      headerBg: "from-red-950/80 via-slate-900 to-slate-950",
      accent: "text-red-400",
      badge: "bg-red-950 text-red-300 border-red-700/60",
      tag: "bg-red-900/40 text-red-300",
      emblem: "⚔️",
      citadelName: "Drak'mar Stronghold"
    },
    arcane: {
      border: "border-purple-500/50",
      headerBg: "from-purple-950/80 via-slate-900 to-slate-950",
      accent: "text-purple-400",
      badge: "bg-purple-950 text-purple-300 border-purple-700/60",
      tag: "bg-purple-900/40 text-purple-300",
      emblem: "🔮",
      citadelName: "Nethergarde Spire"
    }
  }[kingdom.civilization] || {
    border: "border-amber-500/50",
    headerBg: "from-amber-950/80 via-slate-900 to-slate-950",
    accent: "text-amber-400",
    badge: "bg-amber-950 text-amber-300 border-amber-700/60",
    tag: "bg-amber-900/40 text-amber-300",
    emblem: "👑",
    citadelName: "Central Citadel"
  };

  const buildings = [...(kingdom.buildings || [])].sort(compareBuildings);
  const repoNeedle = repoQuery.trim().toLowerCase();
  const shownBuildings = repoNeedle
    ? buildings.filter((b) => `${b.name} ${b.branch ?? ""} ${b.buildingType.replace("_", " ")}`.toLowerCase().includes(repoNeedle))
    : buildings;
  const allCommits = buildings.flatMap((b) =>
    (b.recentCommits || []).map((c) => ({ ...c, repoName: b.name, building: b }))
  );
  const allPRs = buildings.flatMap((b) =>
    (b.recentPRs || []).map((pr) => ({ ...pr, repoName: b.name }))
  );

  const totalLines = buildings.reduce((sum, b) => sum + (b.totalLines || 0), 0);

  const getHeatmapColor = (level: number) => {
    switch (level) {
      case 4: return "bg-emerald-400";
      case 3: return "bg-emerald-500";
      case 2: return "bg-emerald-700";
      case 1: return "bg-emerald-900";
      case -1: return "bg-slate-900/30 border border-slate-800/30 opacity-40";
      default: return "bg-slate-800/60";
    }
  };

  const gitUrl = `${API_BASE}/git/profile/${encodeURIComponent(kingdom.username)}`;

  return (
    <>
    <Modal
      open
      // Hidden (not closed) while the all-titles window is open, so closing that returns here
      hidden={allTitlesOpen}
      onClose={onClose}
      size="xl"
      accentBorder={civThemes.border}
      headerClassName={`bg-linear-to-b ${civThemes.headerBg}`}
      header={
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-3xl shadow-xl">
              {civThemes.emblem}
            </div>
            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-extrabold font-mono shadow">
              Lv.{kingdom.cityHallLevel}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              {kingdom.isArchon && <ArchonSeal className="w-6 h-6 self-center drop-shadow-[0_0_6px_rgba(220,38,38,0.7)]" />}
              <h2 className="text-xl sm:text-2xl font-bold font-medieval text-slate-100 tracking-wide">{kingdom.name}</h2>
              <span className="text-xs font-mono text-slate-400">@{kingdom.username}</span>
            </div>
            <p className={`text-sm ${civThemes.accent} font-medium mt-0.5 truncate`}>
              {kingdom.kingdomTitle} · {civThemes.citadelName} · {castleStage(kingdom.cityHallLevel).name} stage
            </p>
            <div className="flex items-center gap-2 mt-2 text-[11px] flex-wrap">
              <a
                href={gitUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition font-mono"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                Git profile
              </a>
              <span
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-600/30 text-amber-400 font-mono"
                title="Commit streak: days with a meaningful commit (up to 2 days off in a row are forgiven)"
              >
                <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
                {kingdom.streakDays}-day commit streak
              </span>
              {!kingdom.isSpecial && (
                <span
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-950/40 border border-violet-600/40 text-violet-300 font-mono"
                  title={`Play streak: days in a row with 5+ game actions. +2% activity score per day, up to +20% (now +${Math.round((kingdom.activity.playStreakBonus ?? 0) * 100)}%).`}
                >
                  <Gamepad2 className="w-3.5 h-3.5 text-violet-300" />
                  {kingdom.activity.playStreakDays ?? 0}-day play streak
                </span>
              )}
              {isAdmin && (
                <button
                  onClick={handleResync}
                  disabled={isResyncing}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 hover:text-amber-200 transition font-mono disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
                  title="Admin: Re-fetch emails from Git and re-attribute commits to this developer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isResyncing ? "animate-spin" : ""}`} />
                  <span>{isResyncing ? "Checking Git…" : "Re-check Commits & Repos"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      }
    >
        {resyncStatus && (
          <div className={`mx-4 mt-3 p-3 rounded-xl border text-xs font-mono flex items-start gap-2.5 transition animate-in fade-in ${
            resyncStatus.type === "success"
              ? "bg-emerald-950/50 border-emerald-600/50 text-emerald-300"
              : "bg-rose-950/50 border-rose-600/50 text-rose-300"
          }`}>
            {resyncStatus.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-semibold block">{resyncStatus.text}</span>
            </div>
            <button
              onClick={() => setResyncStatus(null)}
              className="text-slate-400 hover:text-slate-200 text-xs shrink-0 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
        {/* ========================================================= */}
        {/* 2. STATS OVERVIEW BAR (GITHUB STYLE)                      */}
        {/* ========================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-4 bg-slate-950/60 border-b border-slate-800/80 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">REPOSITORIES</span>
            <div className="text-lg font-bold text-slate-100 flex items-center gap-1.5 mt-0.5">
              <FolderGit2 className="w-4 h-4 text-amber-400" />
              <span>{buildings.length}</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">PAST WEEK COMMITS</span>
            <div className="text-lg font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
              <GitCommit className="w-4 h-4 text-emerald-400" />
              <span>{kingdom.activity.pastWeekCommits}</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">PAST WEEK PRs</span>
            <div className="text-lg font-bold text-purple-400 flex items-center gap-1.5 mt-0.5">
              <GitPullRequest className="w-4 h-4 text-purple-400" />
              <span>{kingdom.activity.pastWeekPRs}</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">TOTAL CODE VOLUME</span>
            <div className="text-lg font-bold text-sky-400 flex items-center gap-1.5 mt-0.5">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span>{totalLines.toLocaleString()} L</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">ACTIVITY SCORE</span>
            <div className="text-lg font-bold text-amber-300 flex items-center gap-1.5 mt-0.5">
              <Award className="w-4 h-4 text-amber-400" />
              <span>{kingdom.activity.weightedScore}</span>
            </div>
            {!kingdom.isSpecial && (
              <div
                className={`mt-0.5 text-[10px] font-mono ${(kingdom.activity.playStreakBonus ?? 0) > 0 ? "text-violet-300" : "text-slate-500"}`}
                title={`Play streak bonus: +2% per day in a row with 5+ game actions, up to +20%. Base score ${kingdom.activity.baseScore ?? kingdom.activity.weightedScore}.`}
              >
                🎮 +{Math.round((kingdom.activity.playStreakBonus ?? 0) * 100)}% play streak ({kingdom.activity.playStreakDays ?? 0}d)
              </div>
            )}
          </div>

        </div>

        {/* XP by where it came from (commits, PRs, reviews, 🪶 sealed deed reports) */}
        {kingdom.xpBySource && !kingdom.isSpecial && (
          <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400">
            <span className="text-slate-500 uppercase tracking-wider text-[10px]">XP by source</span>
            <span title="Commit XP across all repos (daily diminishing returns)" className="inline-flex items-center gap-1"><GitCommit className="w-3 h-3 text-emerald-400" /> Commits <b className="text-emerald-300">{kingdom.xpBySource.commits.toLocaleString()}</b></span>
            <span title="Merged and open pull requests" className="inline-flex items-center gap-1"><GitPullRequest className="w-3 h-3 text-purple-400" /> PRs <b className="text-purple-300">{kingdom.xpBySource.prs.toLocaleString()}</b></span>
            <span title="Reviews on others' pull requests" className="inline-flex items-center gap-1"><Eye className="w-3 h-3 text-sky-400" /> Reviews <b className="text-sky-300">{kingdom.xpBySource.reviews.toLocaleString()}</b></span>
            <span title="Sealed deed reports from the Scriptorium" className="inline-flex items-center gap-1"><Feather className="w-3 h-3 text-amber-400" /> Deeds <b className="text-amber-300">{kingdom.xpBySource.deeds.toLocaleString()}</b></span>
          </div>
        )}

        {/* ========================================================= */}
        {/* 2b. MILESTONE TITLES & BUFFS                              */}
        {/* ========================================================= */}
        <TitlesShowcase kingdom={kingdom} onViewAll={() => setAllTitlesOpen(true)} />

        {/* ========================================================= */}
        {/* 3. GITHUB-STYLE CONTRIBUTION HEATMAP (FULL YEAR)          */}
        {/* ========================================================= */}
        <div className="px-6 py-3.5 bg-slate-950/50 border-b border-slate-800 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-mono text-slate-300 font-semibold">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Contribution Activity ({totalPeriodCommits.toLocaleString()} Commits in Past {totalMonths === 12 ? 'Year' : `${totalMonths} Months`})</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
              <span>Less</span>
              <div className="w-2.5 h-2.5 rounded-[2px] bg-slate-800/60" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-900" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-700" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-emerald-400" />
              <span>More</span>
            </div>
          </div>

          <div ref={heatmapContainerRef} className="overflow-x-auto pb-1 pt-0.5 scrollbar-slim">
            <div className="min-w-fit flex flex-col gap-1">
              {/* Month Labels Header */}
              <div className="flex text-[10px] font-mono text-slate-400 pl-6 h-3.5 relative">
                {monthLabels.map((ml) => (
                  <span
                    key={ml.weekIndex + ml.name}
                    style={{ left: `${ml.weekIndex * 13 + 24}px` }}
                    className="absolute select-none pointer-events-none"
                  >
                    {ml.name}
                  </span>
                ))}
              </div>

              {/* Day Labels + Week Columns */}
              <div className="flex gap-2 items-center">
                {/* Weekday indicators */}
                <div className="grid grid-rows-7 gap-[3px] text-[9px] font-mono text-slate-500 w-4 text-right select-none leading-none">
                  <span className="h-2.5"></span>
                  <span className="h-2.5">Mon</span>
                  <span className="h-2.5"></span>
                  <span className="h-2.5">Wed</span>
                  <span className="h-2.5"></span>
                  <span className="h-2.5">Fri</span>
                  <span className="h-2.5"></span>
                </div>

                {/* Week Columns */}
                <div className="flex gap-[3px]">
                  {weeks.map((week, wIdx) => (
                    <div key={wIdx} className="grid grid-rows-7 gap-[3px]">
                      {week.map((d) => {
                        const dateFormatted = d.date.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric"
                        });
                        const title = d.isFuture
                          ? `${d.dateStr} (Upcoming in October)`
                          : d.count === 0
                          ? `No commits on ${dateFormatted}`
                          : `${d.count} commit${d.count === 1 ? "" : "s"} on ${dateFormatted}`;

                        return (
                          <div
                            key={d.dateStr}
                            className={`w-2.5 h-2.5 rounded-[2px] ${getHeatmapColor(d.level)} transition-colors hover:ring-1 hover:ring-amber-400 cursor-pointer`}
                            title={title}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 4. NAVIGATION TABS                                        */}
        {/* ========================================================= */}
        <div className="sticky top-0 z-10 flex items-center gap-4 px-5 pt-3 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-xs font-mono overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab("projects")}
            className={`pb-2.5 flex items-center gap-2 font-bold transition border-b-2 ${
              activeTab === "projects"
                ? "border-amber-400 text-amber-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FolderGit2 className="w-4 h-4" />
            <span>Projects & Repositories ({buildings.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("commits")}
            className={`pb-2.5 flex items-center gap-2 font-bold transition border-b-2 ${
              activeTab === "commits"
                ? "border-amber-400 text-amber-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <GitCommit className="w-4 h-4" />
            <span>Recent Commits ({allCommits.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("activity")}
            className={`pb-2.5 flex items-center gap-2 font-bold transition border-b-2 ${
              activeTab === "activity"
                ? "border-amber-400 text-amber-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <GitPullRequest className="w-4 h-4" />
            <span>Pull Requests ({allPRs.length})</span>
          </button>

        </div>

        {/* ========================================================= */}
        {/* 5. TAB CONTENT                                            */}
        {/* ========================================================= */}
        <div className="p-5 space-y-4">
          {/* TAB 1: REPOSITORIES / BUILDINGS */}
          {activeTab === "projects" && (
            <div className="space-y-3">
              {buildings.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="text-4xl mb-2">🏕️</div>
                  <h4 className="font-medieval text-base font-bold text-slate-200">
                    This realm has no repositories yet
                  </h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    When this developer pushes commits or creates repositories on Git,
                    they will automatically appear as functional guildhall buildings in this city!
                  </p>
                </div>
              ) : (
                <>
                <div className="flex items-center gap-2">
                  <label className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <input
                      type="search"
                      value={repoQuery}
                      onChange={(e) => setRepoQuery(e.target.value)}
                      placeholder={`Search ${buildings.length} repositories…`}
                      aria-label="Search repositories"
                      className="w-full h-9 pl-9 pr-8 rounded-lg bg-slate-950/70 border border-slate-700 focus:border-amber-500/70 focus:outline-none text-sm font-mono text-slate-200 placeholder:text-slate-500 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {repoQuery && (
                      <button
                        type="button"
                        onClick={() => setRepoQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-100"
                        aria-label="Clear the search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </label>
                  {repoNeedle && (
                    <span className="shrink-0 text-[11px] font-mono text-slate-400">
                      {shownBuildings.length} / {buildings.length}
                    </span>
                  )}
                </div>
                {shownBuildings.length === 0 && (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800">
                    No repository matches “{repoQuery.trim()}”.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {shownBuildings.map((b) => {
                    const typeLabel = {
                      residential_commercial: "Residential & Commercial House",
                      animal_field: "Animal Pasture & Barn",
                      food_field: "Agricultural Food & Crop Field",
                      soldier_building: "Military Barracks & Armory"
                    }[b.buildingType] || "Guildhall";

                    const typeIcon = {
                      residential_commercial: "🏠",
                      animal_field: "🐄",
                      food_field: "🌾",
                      soldier_building: "⚔️"
                    }[b.buildingType] || "🏛️";

                    return (
                      <div
                        key={b.id}
                        onClick={() => {
                          if (onSelectBuilding) {
                            onSelectBuilding(b);
                            onClose();
                          }
                        }}
                        className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-800/40 cursor-pointer transition group shadow-md"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl p-1.5 bg-slate-900 rounded-lg border border-slate-800">
                              {typeIcon}
                            </span>
                            <div>
                              <div className="font-bold font-mono text-sm text-slate-100 group-hover:text-amber-300 transition">
                                {b.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Branch: <span className="text-amber-400">{b.branch}</span> • {b.totalCommits} commits{b.condition === "idle" && <span className="text-slate-400"> • 💤 dormant</span>}
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                            Lv.{b.level}
                          </span>
                        </div>

                        <div className="text-xs text-slate-300 italic mt-2.5 line-clamp-1 border-l-2 border-slate-700 pl-2">
                          "{b.lastCommit}"
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                          <div>
                            <span className="block text-slate-500">Volume</span>
                            <span className="text-slate-200 font-bold">{b.totalLines.toLocaleString()} L</span>
                          </div>
                          <div>
                            <span className="block text-slate-500">Week Commits</span>
                            <span className="text-emerald-400 font-bold">+{b.commitsPastWeek}</span>
                          </div>
                          <div>
                            <span className="block text-slate-500">Last Active</span>
                            <span className="text-slate-200">{b.lastCommitDate}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: RECENT COMMITS */}
          {activeTab === "commits" && (
            <div className="space-y-2">
              {allCommits.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800 text-slate-400 text-xs">
                  No recent commits recorded across repositories.
                </div>
              ) : (
                allCommits.map((c, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <GitCommit className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-200 line-clamp-1">
                          {c.message}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Repo: <span className="text-amber-300">{c.repoName}</span> • By: {c.author}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-emerald-400 font-bold block">{c.lines}</span>
                      <span className="text-[9px] text-slate-500">{c.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: PULL REQUESTS */}
          {activeTab === "activity" && (
            <div className="space-y-2">
              {allPRs.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800 text-slate-400 text-xs">
                  No pull requests recorded for this developer.
                </div>
              ) : (
                allPRs.map((pr, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <GitPullRequest className={`w-4 h-4 ${pr.status === "merged" ? "text-purple-400" : "text-emerald-400"}`} />
                      <div>
                        <div className="font-semibold text-slate-200">
                          {pr.number} {pr.title}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Repo: <span className="text-amber-300">{pr.repoName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        pr.status === "merged"
                          ? "bg-purple-950 text-purple-300 border-purple-700/60"
                          : "bg-emerald-950 text-emerald-300 border-emerald-700/60"
                      }`}>
                        {pr.status.toUpperCase()}
                      </span>
                      <div className="text-[9px] text-slate-500 mt-1">{pr.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>

    </Modal>
    <AllTitlesModal kingdom={kingdom} open={allTitlesOpen} onClose={() => setAllTitlesOpen(false)} />
    </>
  );
}
