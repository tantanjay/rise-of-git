import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, TriangleAlert } from "lucide-react";
import { Modal } from "./Modal";
import { Combobox } from "./Combobox";
import { API_BASE } from "@/config";
import type { WatchGlance, WatchImpact, WatchImpactMetrics, WatchPeriodKind, WatchPerson, WatchTree, WatchTreeNode } from "@/types";
import { BEFORE, Columns, compact, HBarStack, Heatmap, Legend, LineChart, SERIES, StatTile } from "./watchtowerCharts";
import { sound } from "@/hooks/useSound";
import { HeaderTile, TreeIcon, WatchtowerIcon } from "./realmIcons";

/*
 * 🔭 The Watchtower (GAME_GUIDE §18): work analytics for Admins, Special Overseers and the Archon, opened from Royal
 * Decrees. Never shown to players. Every number is computed on the server (GET /api/watchtower/...).
 */

type Tab = "glance" | "tree" | "people" | "impact";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/watchtower${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || "The Watchtower is clouded");
  return data as T;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const card = "p-3.5 rounded-2xl border border-slate-800 bg-slate-950/40";
const h3 = "text-xs font-semibold text-slate-200 mb-2";
const shortDay = (d: string) => d.slice(8);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayTitle = (d: string) => `${WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d}`;

/* ------------------------------------------------------------------------- */
/* Period controls: Week / Month, ◀ ▶ and a picker                            */
/* ------------------------------------------------------------------------- */

function PeriodBar({ kind, setKind, keyValue, setKey, label, prevKey, nextKey }: { kind: WatchPeriodKind; setKind: (k: WatchPeriodKind) => void; keyValue?: string; setKey: (k?: string) => void; label?: string; prevKey?: string; nextKey?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
        {(["week", "month"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setKey(undefined);
            }}
            className={`px-3 py-1.5 font-semibold ${kind === k ? "bg-sky-900/60 text-sky-100" : "bg-slate-900 text-slate-400 hover:text-slate-200"}`}
          >
            {k === "week" ? "Week" : "Month"}
          </button>
        ))}
      </div>
      <button disabled={!prevKey} onClick={() => setKey(prevKey)} className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-30" aria-label="Previous period">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <input
        type={kind === "week" ? "week" : "month"}
        value={keyValue ?? ""}
        onChange={(e) => e.target.value && setKey(e.target.value)}
        className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 [color-scheme:dark]"
      />
      <button disabled={!nextKey} onClick={() => nextKey && setKey(nextKey)} className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-30" aria-label="Next period">
        <ChevronRight className="w-4 h-4" />
      </button>
      {label && <span className="text-xs text-slate-400">{label}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* 1. At a glance                                                              */
/* ------------------------------------------------------------------------- */

function Glance({ g, onPerson }: { g: WatchGlance; onPerson: (id: string) => void }) {
  // Folded by default: the count and the first names show in its header
  const [quietOpen, setQuietOpen] = useState(false);
  const k = g.kpis;
  const quiet = g.devs.filter((d) => d.quiet).sort((a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999));
  const active = g.devs.filter((d) => !d.quiet);
  const xpRows = [...active].sort((a, b) => b.gitXp + b.deedXp - (a.gitXp + a.deedXp)).map((d) => ({ id: d.userId, label: d.name, values: [d.gitXp, d.deedXp] }));
  const heatRows = [...g.devs].sort((a, b) => b.byDay.reduce((s, v) => s + v, 0) - a.byDay.reduce((s, v) => s + v, 0)).map((d) => ({ id: d.userId, label: d.name, values: d.byDay }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="Active devs" value={`${k.activeDevs}`} sub={`of ${k.roster} on the roster`} />
        <StatTile label="Quiet devs" value={`${k.quietDevs}`} sub="no commit, PR, review or deed" tone={k.quietDevs > 0 ? "warn" : undefined} />
        <StatTile label="Commits" value={compact(k.commits)} sub="meaningful ones" />
        <StatTile label="Meaningful lines" value={compact(k.lines)} />
        <StatTile label="Deeds sealed" value={`${k.deedsSealed}`} sub={`${k.deedXp} XP · ${k.deedsPending} awaiting`} />
        <StatTile label="PRs merged" value={`${k.prsMerged}`} />
        <StatTile label="Reviews" value={`${k.reviews}`} />
        <StatTile label="Deed share of XP" value={k.gitXp + k.deedXp > 0 ? pct(k.deedXp / (k.gitXp + k.deedXp)) : "—"} sub={`${k.gitXp} Git XP`} />
      </div>

      <div className={card}>
        <button onClick={() => setQuietOpen((o) => !o)} className="w-full flex items-center gap-2 text-left" aria-expanded={quietOpen}>
          {quietOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
          <span className="text-xs font-semibold text-slate-200">Who is quiet</span>
          <span className={`px-1.5 rounded-full text-[10px] font-mono border ${quiet.length ? "bg-amber-950/60 border-amber-700/40 text-amber-200" : "bg-slate-800 border-slate-700 text-slate-400"}`}>{quiet.length}</span>
          {!quietOpen && quiet.length > 0 && (
            <span className="text-[11px] text-slate-500 truncate">
              {quiet
                .slice(0, 3)
                .map((d) => d.name)
                .join(" · ")}
              {quiet.length > 3 ? ` · +${quiet.length - 3}` : ""}
            </span>
          )}
        </button>
        {!quietOpen ? null : quiet.length === 0 ? (
          <div className="mt-2 text-xs text-slate-500">Everyone on the roster did something this period.</div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="text-left py-1 pr-3 font-semibold">Developer</th>
                  <th className="text-right py-1 pr-3 font-semibold">Days since</th>
                  <th className="text-left py-1 font-semibold">Last thing they did</th>
                </tr>
              </thead>
              <tbody>
                {quiet.map((d) => (
                  <tr key={d.userId} className="border-t border-slate-800/80 hover:bg-slate-900/60 cursor-pointer" onClick={() => onPerson(d.userId)}>
                    <td className="py-1.5 pr-3 text-slate-200">{d.name}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-amber-200 tabular-nums">{d.daysSince ?? "—"}</td>
                    <td className="py-1.5 text-slate-400">
                      {d.lastActivity ?? "—"} {d.lastActivityAt && <span className="text-slate-600 font-mono">({d.lastActivityAt.slice(0, 10)})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={card}>
        <div className={h3}>Git XP vs deed XP per developer</div>
        <p className="text-[11px] text-slate-500 mb-2">Who works through Git (commits, PRs, reviews) and who through the Scriptorium&apos;s deed reports.</p>
        {xpRows.length ? (
          <HBarStack
            rows={xpRows}
            series={[
              { name: "Git XP", color: SERIES.commits },
              { name: "Deed XP", color: SERIES.deeds }
            ]}
          />
        ) : (
          <div className="text-xs text-slate-500">Nothing yet.</div>
        )}
      </div>

      <div className={card}>
        <div className={h3}>Daily activity</div>
        <p className="text-[11px] text-slate-500 mb-2">Commits, PRs, reviews and deeds per developer per day.</p>
        <Heatmap rows={heatRows} cols={g.days} colLabel={(c) => shortDay(c)} cellTip={(row, col, v) => `${v} on ${dayTitle(col)} · ${row}`} />
      </div>

      <div className={card}>
        <div className={h3}>Commits by hour</div>
        <p className="text-[11px] text-slate-500 mb-2">By the hour on the author&apos;s own clock (as Git recorded it).</p>
        <Columns labels={g.hours.map((_, i) => String(i))} series={[{ name: "commits", color: SERIES.commits, values: g.hours }]} every={3} tipTitle={(i) => `${String(i).padStart(2, "0")}:00–${String(i).padStart(2, "0")}:59`} />
      </div>

      <div className={card}>
        <div className={h3}>Every developer (table)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
              <tr>
                {["Developer", "Commits", "Lines", "PRs opened", "PRs merged", "Reviews", "Deeds", "Deed XP", "Git XP", "Active days"].map((h, i) => (
                  <th key={h} className={`py-1 pr-3 font-semibold ${i ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...g.devs].sort((a, b) => b.commits - a.commits).map((d) => (
                <tr key={d.userId} className="border-t border-slate-800/80 hover:bg-slate-900/60 cursor-pointer" onClick={() => onPerson(d.userId)}>
                  <td className="py-1 pr-3 text-slate-200 whitespace-nowrap">{d.name}</td>
                  {[d.commits, compact(d.lines), d.prsOpened, d.prsMerged, d.reviews, d.deedsSealed + (d.deedsPending ? ` (+${d.deedsPending})` : ""), d.deedXp, d.gitXp, d.activeDays].map((v, i) => (
                    <td key={i} className="py-1 pr-3 text-right font-mono text-slate-300">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* 2. Divisions & projects                                                     */
/* ------------------------------------------------------------------------- */

/** Change against the period before as a small neutral chip (more commits isn't "good" by itself, so no status colour) */
function Delta({ now, before }: { now: number; before: number }) {
  if (now === before) return null;
  return (
    <span className="inline-flex items-center px-1 rounded bg-slate-800/90 text-[10px] leading-4 text-slate-300 font-mono" title={`${before} the period before`}>
      {now > before ? `▲${now - before}` : `▼${before - now}`}
    </span>
  );
}

/** A number cell: a quiet dash for zero so busy rows stand out */
function Num({ v, fmt = (n: number) => `${n}` }: { v: number; fmt?: (n: number) => string }) {
  return <td className={`py-2 pr-3 text-right font-mono ${v ? "text-slate-200" : "text-slate-600"}`}>{v ? fmt(v) : "—"}</td>;
}

/** Commits with an inline bar (scaled to the busiest row) and the change chip */
function CommitsCell({ now, before, max }: { now: number; before: number; max: number }) {
  return (
    <td className="py-2 pr-3">
      <div className="flex items-center justify-end gap-2">
        <div className={`flex-1 h-1.5 rounded-full overflow-hidden max-w-24 ${now > 0 ? "bg-slate-800/70" : ""}`}>
          {now > 0 && <div className="h-full rounded-full" style={{ width: `${Math.max(4, (now / max) * 100)}%`, background: SERIES.commits }} />}
        </div>
        <span className={`font-mono w-9 text-right ${now ? "text-slate-100" : "text-slate-600"}`}>{now || "—"}</span>
        <span className="w-10 text-left">
          <Delta now={now} before={before} />
        </span>
      </div>
    </td>
  );
}

const INDENT = 18;

function TreeRows({ node, depth, max }: { node: WatchTreeNode; depth: number; max: number }) {
  const [open, setOpen] = useState(depth < 1 && node.kind !== "unsorted");
  const kids = node.children.length > 0 || (node.repoStats?.length ?? 0) > 0;
  const empty = node.repos === 0;
  const top = depth === 0;
  return (
    <>
      <tr className={`${node.kind === "unsorted" ? "border-t-2 border-slate-700" : "border-t border-slate-800/70"} ${top ? "bg-slate-900/40" : ""} hover:bg-slate-800/40`}>
        <td className="py-2 pr-3" style={{ paddingLeft: 6 + depth * INDENT }}>
          <button onClick={() => kids && setOpen((o) => !o)} className={`flex items-center gap-1.5 min-w-0 max-w-full text-left ${kids ? "cursor-pointer" : "cursor-default"}`}>
            <span className="w-3.5 shrink-0 text-slate-500">{kids && (open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}</span>
            <TreeIcon kind={node.kind} />
            <span className={`truncate ${empty ? "text-slate-500" : top ? "text-slate-100 font-semibold" : "text-slate-200"}`}>{node.name}</span>
            {node.kind === "unsorted" && <span className="text-[10px] text-slate-500 shrink-0">in no project</span>}
          </button>
        </td>
        <Num v={node.repos} />
        <CommitsCell now={node.commits} before={node.prevCommits} max={max} />
        <Num v={node.lines} fmt={compact} />
        <Num v={node.deedXp} />
        <Num v={node.prsMerged} />
        <Num v={node.devs} />
        <td className="py-2 pr-2 text-right">
          {node.staleRepos > 0 ? <span className="px-1.5 rounded bg-amber-950/60 border border-amber-700/40 text-amber-200 font-mono text-[10px]">{node.staleRepos}</span> : <span className="text-slate-600 font-mono">—</span>}
        </td>
      </tr>
      {open && node.children.map((c) => <TreeRows key={`${c.kind}${c.id}`} node={c} depth={depth + 1} max={max} />)}
      {open &&
        node.repoStats?.map((r) => {
          const stale = r.commits + r.deeds + r.prsMerged === 0;
          return (
            <tr key={r.repoId} className="border-t border-slate-800/40 text-[11px] hover:bg-slate-800/30">
              <td className="py-1.5 pr-3" style={{ paddingLeft: 6 + (depth + 1) * INDENT + 20 }}>
                <span className="block truncate font-mono text-slate-400" title={r.fullName}>
                  {r.fullName}
                </span>
              </td>
              <td />
              <CommitsCell now={r.commits} before={r.prevCommits} max={max} />
              <Num v={r.lines} fmt={compact} />
              <Num v={r.deedXp} />
              <Num v={r.prsMerged} />
              <Num v={r.devs} />
              <td className="py-1.5 pr-2 text-right">{stale && <span className="px-1.5 rounded bg-amber-950/60 border border-amber-700/40 text-amber-200 text-[10px]">stale</span>}</td>
            </tr>
          );
        })}
    </>
  );
}

function TreeView({ t }: { t: WatchTree }) {
  // Bars scale to the busiest node anywhere in the tree (divisions roll up, so they set it)
  const max = Math.max(1, ...t.roots.map((r) => r.commits));
  const label = t.period.kind === "week" ? "week" : "month";
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <div className={h3 + " mb-0"}>The Scriptorium tree, rolled up</div>
          <div className="text-[10px] text-slate-500">▲▼ commits against the {label} before · — nothing this {label} · stale = a repo in a project with no commit, merged PR or sealed deed</div>
        </div>
        {t.roots.length === 0 ? (
          <div className="text-xs text-slate-500">No Divisions yet: set the tree up in the Scriptorium.</div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[46rem] table-fixed text-xs tabular-nums">
              <colgroup>
                <col />
                <col className="w-16" />
                <col className="w-56" />
                <col className="w-20" />
                <col className="w-20" />
                <col className="w-16" />
                <col className="w-14" />
                <col className="w-16" />
              </colgroup>
              <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
                <tr>
                  {["Division › Client › Project", "Repos", "Commits", "Lines", "Deed XP", "PRs", "Devs", "Stale"].map((h, i) => (
                    <th key={i} className={`pb-1.5 font-semibold ${i ? "text-right pr-3" : "text-left pl-7"} ${i === 7 ? "pr-2" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.roots.map((r) => (
                  <TreeRows key={`${r.kind}${r.id}`} node={r} depth={0} max={max} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <div className={h3}>Top movers (commits vs the period before)</div>
          {t.movers.length === 0 && <div className="text-xs text-slate-500">No change.</div>}
          <div className="space-y-0.5 text-[11px] text-slate-400">
            {t.movers.map((m) => (
              <div key={m.repoId} className="flex gap-2">
                <span className="font-mono truncate flex-1 text-slate-300" title={m.fullName}>
                  {m.fullName}
                </span>
                <span className="font-mono tabular-nums">
                  {m.prevCommits} → {m.commits}
                </span>
                <span className="font-mono w-12 text-right">
                  <Delta now={m.commits} before={m.prevCommits} />
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className={card}>
          <div className={h3}>Stale repos ({t.staleCount})</div>
          <p className="text-[11px] text-slate-500 mb-2">In a project, with no commit, merged PR or sealed deed this period.</p>
          <div className="space-y-0.5 text-[11px] text-slate-300 max-h-64 overflow-y-auto">
            {t.stale.length === 0 && <div className="text-slate-500">None.</div>}
            {t.stale.map((s) => (
              <div key={s.repoId} className="flex gap-2">
                <span className="font-mono truncate flex-1">{s.fullName}</span>
                <span className="text-slate-500 font-mono">{s.prevCommits} before</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* 3. People                                                                   */
/* ------------------------------------------------------------------------- */

function PersonView({ p }: { p: WatchPerson }) {
  const deedTotal = p.deeds.sealed + p.deeds.rejected;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="Commits" value={`${p.commits}`} sub={`${p.activeDays} active days`} />
        <StatTile label="Median lines / commit" value={`${p.medianLines}`} />
        <StatTile label="Tiny commits" value={pct(p.tinyShare)} sub="under 10 lines" />
        <StatTile label="PRs" value={`${p.prsOpened} / ${p.prsMerged}`} sub="opened / merged" />
        <StatTile label="Reviews given" value={`${p.reviews}`} />
        <StatTile label="Deeds sealed" value={`${p.deeds.sealed}`} sub={deedTotal ? `${pct(p.deeds.sealed / deedTotal)} of reviewed · ${p.deeds.rejected} rejected` : `${p.deeds.pending} awaiting`} />
        <StatTile label="Weekend commits" value={pct(p.weekendShare)} />
        <StatTile label="Repos touched" value={`${p.repos.length}`} sub={`${p.projects.length} projects`} />
      </div>
      <div className={card}>
        <div className={h3}>XP over time by source</div>
        <Columns
          labels={p.xpSeries.map((s) => s.label)}
          series={[
            { name: "Commits", color: SERIES.commits, values: p.xpSeries.map((s) => s.commits) },
            { name: "PRs", color: SERIES.prs, values: p.xpSeries.map((s) => s.prs) },
            { name: "Reviews", color: SERIES.reviews, values: p.xpSeries.map((s) => s.reviews) },
            { name: "Deeds", color: SERIES.deeds, values: p.xpSeries.map((s) => s.deeds) }
          ]}
          height={150}
          valueFmt={(n) => `${Math.round(n * 10) / 10} XP`}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <div className={h3}>Commits per day</div>
          <Columns labels={p.commitsPerDay.map((d) => shortDay(d.day))} series={[{ name: "commits", color: SERIES.commits, values: p.commitsPerDay.map((d) => d.commits) }]} every={p.commitsPerDay.length > 10 ? 3 : 1} tipTitle={(i) => dayTitle(p.commitsPerDay[i].day)} />
        </div>
        <div className={card}>
          <div className={h3}>Active hours</div>
          <Columns labels={p.hours.map((_, i) => String(i))} series={[{ name: "commits", color: SERIES.commits, values: p.hours }]} every={3} tipTitle={(i) => `${String(i).padStart(2, "0")}:00–${String(i).padStart(2, "0")}:59`} />
        </div>
      </div>
      <div className={card}>
        <div className={h3}>Repos and projects</div>
        {p.projects.length > 0 && <div className="text-[11px] text-slate-400 mb-2">Projects: {p.projects.join(" · ")}</div>}
        <div className="space-y-0.5 text-[11px]">
          {p.repos.length === 0 && <div className="text-slate-500">Nothing this period.</div>}
          {p.repos.map((r) => (
            <div key={r.name} className="flex gap-2 text-slate-300">
              <span className="font-mono truncate flex-1">{r.name}</span>
              <span className="font-mono text-slate-400">{r.commits} commits</span>
              {r.deedXp > 0 && <span className="font-mono text-slate-400">{r.deedXp} deed XP</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* 4. Did the game change how we commit?                                       */
/* ------------------------------------------------------------------------- */

const METRICS: Array<{ key: keyof WatchImpactMetrics; label: string; fmt: (v: number) => string }> = [
  { key: "devs", label: "Developers committing", fmt: (v) => `${v}` },
  { key: "commitsPerDevDay", label: "Commits per dev per working day", fmt: (v) => v.toFixed(2) },
  { key: "medianLines", label: "Median lines per commit", fmt: (v) => `${v}` },
  { key: "tinyShare", label: "Tiny commits (under 10 lines)", fmt: pct },
  { key: "commitsPerActiveDay", label: "Commits per active day", fmt: (v) => v.toFixed(2) },
  { key: "prsPerDev", label: "PRs per dev", fmt: (v) => v.toFixed(2) },
  { key: "reviewsPerDev", label: "Reviews per dev", fmt: (v) => v.toFixed(2) }
];

function change(b: number, a: number) {
  if (!b) return a ? "new" : "—";
  const d = (a - b) / b;
  return `${d >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(d * 100))}%`;
}

function ImpactView({ i }: { i: WatchImpact }) {
  const launchIdx = i.trend.findIndex((t) => t.week >= i.launch.slice(0, 10)) - (i.trend.some((t) => t.week === i.launch) ? 0 : 1);
  const afterDays = Math.round((Date.parse(i.after.to) - Date.parse(i.after.from)) / 86_400_000);
  const flagged = i.devs.filter((d) => d.splitting);
  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-400 leading-relaxed">
        The game started on <b className="text-slate-200">{i.launch}</b> ({i.launchSource === "env" ? "GAME_LAUNCH_DATE" : i.launchSource === "first_harvest" ? "the realm's first harvest" : "today: no harvest yet"}). The{" "}
        <b className="text-slate-200">{i.windowDays} days before</b> are compared with the <b className="text-slate-200">{afterDays} days since</b>, per working day so the windows can differ in length. Diffs are only analysed for the
        last 30 days, so both sides count raw changed lines. The tell for gaming: <b className="text-slate-200">commits up while lines per commit fall</b> (work split into more commits for XP).
      </div>
      <div className={card}>
        <div className="flex items-center justify-between mb-2">
          <div className={h3 + " mb-0"}>The team</div>
          <Legend
            items={[
              { name: `Before (${i.before.from} – ${i.before.to})`, color: BEFORE },
              { name: `After (${i.after.from} – today)`, color: SERIES.commits }
            ]}
          />
        </div>
        <div className="space-y-2">
          {METRICS.map((m) => {
            const b = i.team.before[m.key];
            const a = i.team.after[m.key];
            const max = Math.max(1e-9, b, a);
            return (
              <div key={m.key} className="grid grid-cols-[10rem_1fr_4.5rem] sm:grid-cols-[14rem_1fr_5rem] items-center gap-2 text-[11px]">
                <span className="text-slate-300">{m.label}</span>
                <div className="space-y-[2px]">
                  {[
                    { v: b, c: BEFORE },
                    { v: a, c: SERIES.commits }
                  ].map((x, k) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <div className="h-2.5 rounded-r" style={{ width: `${(x.v / max) * 80}%`, minWidth: x.v > 0 ? 2 : 0, background: x.c }} />
                      <span className="font-mono text-slate-400">{m.fmt(x.v)}</span>
                    </div>
                  ))}
                </div>
                <span className="font-mono text-right text-slate-200">{change(b, a)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <div className={h3}>Commits per developer, week by week</div>
          <LineChart labels={i.trend.map((t) => t.week.slice(5))} values={i.trend.map((t) => t.commitsPerDev)} color={SERIES.commits} name="commits per dev" markerIndex={launchIdx} markerLabel="game starts" valueFmt={(v) => v.toFixed(1)} />
        </div>
        <div className={card}>
          <div className={h3}>Median lines per commit, week by week</div>
          <LineChart labels={i.trend.map((t) => t.week.slice(5))} values={i.trend.map((t) => t.medianLines)} color={SERIES.commits} name="median lines" markerIndex={launchIdx} markerLabel="game starts" />
        </div>
      </div>
      <div className={card}>
        <div className={h3}>Per developer ({i.devs.length} with 5+ commits on both sides)</div>
        {flagged.length > 0 && <p className="text-[11px] text-amber-200 mb-2 flex items-center gap-1.5"><TriangleAlert className="w-3.5 h-3.5 shrink-0" /> {flagged.length} split their work: commits per working day up 25%+ while median lines fell 25%+.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
              <tr>
                {["Developer", "Commits / working day", "Median lines", "Tiny share", ""].map((h, k) => (
                  <th key={k} className={`py-1 pr-3 font-semibold ${k ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {i.devs.map((d) => (
                <tr key={d.userId} className="border-t border-slate-800/80">
                  <td className="py-1 pr-3 text-slate-200 whitespace-nowrap">{d.name}</td>
                  <td className="py-1 pr-3 text-right font-mono text-slate-300">
                    {d.before.commitsPerDevDay.toFixed(2)} → {d.after.commitsPerDevDay.toFixed(2)} <span className="text-slate-500">{change(d.before.commitsPerDevDay, d.after.commitsPerDevDay)}</span>
                  </td>
                  <td className="py-1 pr-3 text-right font-mono text-slate-300">
                    {d.before.medianLines} → {d.after.medianLines} <span className="text-slate-500">{change(d.before.medianLines, d.after.medianLines)}</span>
                  </td>
                  <td className="py-1 pr-3 text-right font-mono text-slate-300">
                    {pct(d.before.tinyShare)} → {pct(d.after.tinyShare)}
                  </td>
                  <td className="py-1 text-right text-amber-200 whitespace-nowrap">{d.splitting && <span className="inline-flex items-center gap-1"><TriangleAlert className="w-3 h-3" /> splitting?</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Panel                                                                       */
/* ------------------------------------------------------------------------- */

export function WatchtowerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("glance");
  const [kind, setKind] = useState<WatchPeriodKind>("week");
  const [key, setKey] = useState<string | undefined>(undefined);
  const [personId, setPersonId] = useState<string | null>(null);
  const [glance, setGlance] = useState<WatchGlance | null>(null);
  const [tree, setTree] = useState<WatchTree | null>(null);
  const [person, setPerson] = useState<WatchPerson | null>(null);
  const [impact, setImpact] = useState<WatchImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const q = `?period=${kind}${key ? `&key=${encodeURIComponent(key)}` : ""}`;

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    setError(null);
    const done = () => live && setLoading(false);
    const fail = (e: Error) => live && setError(e.message);
    // The glance also feeds the People picker
    get<WatchGlance>(`/glance${q}`).then((g) => live && setGlance(g)).catch(fail).finally(done);
    if (tab === "tree") get<WatchTree>(`/tree${q}`).then((t) => live && setTree(t)).catch(fail);
    if (tab === "impact") get<WatchImpact>(`/impact`).then((i) => live && setImpact(i)).catch(fail);
    return () => {
      live = false;
    };
  }, [open, tab, q]);

  useEffect(() => {
    if (!open || tab !== "people" || !personId) return;
    let live = true;
    get<WatchPerson>(`/people/${encodeURIComponent(personId)}${q}`)
      .then((p) => live && setPerson(p))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [open, tab, personId, q]);

  const devOptions = useMemo(() => [...(glance?.devs ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [glance]);
  useEffect(() => {
    if (!personId && devOptions.length) setPersonId(devOptions.find((d) => !d.quiet)?.userId ?? devOptions[0].userId);
  }, [devOptions, personId]);

  const period = (tab === "tree" ? tree?.period : tab === "people" ? person?.period : glance?.period) ?? glance?.period;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "glance", label: "At a glance" },
    { id: "tree", label: "Divisions & projects" },
    { id: "people", label: "People" },
    { id: "impact", label: "Did the game change how we commit?" }
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      accentBorder="border-sky-700/60"
      headerClassName="bg-linear-to-b from-sky-950/70 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <HeaderTile Icon={WatchtowerIcon} tone="sky" />
          <div>
            <h2 className="text-base font-bold text-slate-100 font-medieval">The Watchtower</h2>
            <p className="text-xs text-slate-400">The whole realm&apos;s work, week by week and month by month. For Admins, Special Overseers and the Archon only.</p>
          </div>
        </div>
      }
      subHeader={
        <div className="px-4 sm:px-6 pt-3 border-b border-slate-800 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  sound.playClick();
                  setTab(t.id);
                }}
                className={`shrink-0 px-3 py-2 rounded-t-lg text-xs font-semibold border-b-2 transition ${tab === t.id ? "border-sky-400 text-sky-100 bg-sky-500/10" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab !== "impact" && (
            <div className="pb-2.5 flex flex-wrap items-center gap-3">
              <PeriodBar kind={kind} setKind={setKind} keyValue={period?.key} setKey={setKey} label={period?.label} prevKey={period?.prevKey} nextKey={period?.nextKey} />
              {tab === "people" && (
                <div className="w-60">
                  <Combobox searchable
                    size="sm"
                    options={devOptions.map((d) => ({ value: d.userId, label: d.name, hint: d.quiet ? "quiet" : undefined }))}
                    value={personId}
                    onChange={setPersonId}
                    searchPlaceholder="Search developers…"
                    ariaLabel="Developer"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      }
    >
      <div className={`p-4 sm:p-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
        {error && <div className="mb-3 p-2.5 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs">{error}</div>}
        {tab === "glance" && (glance ? <Glance g={glance} onPerson={(id) => (setPersonId(id), setTab("people"))} /> : <Loading />)}
        {tab === "tree" && (tree ? <TreeView t={tree} /> : <Loading />)}
        {tab === "people" && (person ? <PersonView p={person} /> : <Loading />)}
        {tab === "impact" && (impact ? <ImpactView i={impact} /> : <Loading />)}
      </div>
    </Modal>
  );
}

const Loading = () => <div className="py-12 text-center text-sm text-slate-500">The watchmen are looking…</div>;
