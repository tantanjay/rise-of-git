import { ReactNode, useRef, useState } from "react";

/*
 * Small SVG charts for the 🔭 Watchtower, one look across them: thin marks (bars ≤ 16 px, 4 px rounded data ends,
 * 2 px lines), a 2 px surface gap between stacked segments, hairline grid, text in text colours (never the series
 * colour), a legend for two or more series and a hover tip on every mark. The game is dark only, so the palette is
 * the dark steps of the reference categorical order, validated on the panel's slate surface (#0f172a).
 */

export const SERIES = {
  commits: "#3987e5", // slot 1 blue
  prs: "#d95926", // slot 2 orange
  reviews: "#199e70", // slot 3 aqua
  deeds: "#c98500" // slot 4 yellow
} as const;
/** "Before the game" in the before / after comparison: a recessive neutral beside the blue "after" */
export const BEFORE = "#64748b";
/** Sequential blue, low → high on the dark surface (zero is the empty cell colour) */
const SEQ = ["#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#86b6ef"];
const EMPTY = "#1e293b";
const GRID = "#1e293b";
const SURFACE = "#0f172a";
const TEXT_MUTED = "#94a3b8";

export const compact = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 10_000 ? `${Math.round(n / 1000)}K` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n * 10) / 10}`);

/** A clean axis top: two even steps of 1 / 2 / 5 × 10ⁿ covering `max` */
function niceTop(max: number): number {
  const half = Math.max(max, 1e-9) / 2;
  const p = 10 ** Math.floor(Math.log10(half));
  const step = [1, 2, 5, 10].map((m) => m * p).find((x) => x >= half) ?? 10 * p;
  return step * 2;
}

/* Hover tip: one per chart, positioned in the chart's box */
interface Tip {
  x: number;
  y: number;
  body: ReactNode;
}
function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: React.PointerEvent | React.FocusEvent, body: ReactNode) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const t = e.currentTarget.getBoundingClientRect();
    const x = "clientX" in e ? e.clientX : t.left + t.width / 2;
    const y = "clientY" in e ? e.clientY : t.top;
    setTip({ x: x - r.left, y: y - r.top, body });
  };
  const view = tip && (
    <div
      className="pointer-events-none absolute z-10 px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-950/95 text-[11px] text-slate-200 shadow-xl whitespace-nowrap"
      style={{ left: tip.x, top: tip.y, transform: `translate(${tip.x > (box.current?.clientWidth ?? 0) / 2 ? "-105%" : "8px"}, -110%)` }}
    >
      {tip.body}
    </div>
  );
  return { box, show, hide: () => setTip(null), view };
}

/** Tooltip row: value first (strong), the series name after it, keyed by a short stroke of its colour */
export function TipRow({ color, value, name }: { color?: string; value: string; name: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {color && <span className="inline-block w-3 h-0.5 rounded" style={{ background: color }} />}
      <b className="text-slate-50 font-mono">{value}</b>
      <span className="text-slate-400">{name}</span>
    </div>
  );
}

export function Legend({ items, line = false }: { items: Array<{ name: string; color: string }>; line?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-1.5">
          <span className={line ? "inline-block w-3.5 h-0.5 rounded" : "inline-block w-2.5 h-2.5 rounded-sm"} style={{ background: it.color }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}

export function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 min-w-0">
      <div className="text-[11px] text-slate-400 truncate">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-0.5 ${tone === "warn" ? "text-amber-200" : "text-slate-50"}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

/** Horizontal stacked bars, one row per entity; total at the tip */
export function HBarStack({ rows, series, valueFmt = compact }: { rows: Array<{ id: string; label: string; values: number[] }>; series: Array<{ name: string; color: string }>; valueFmt?: (n: number) => string }) {
  const { box, show, hide, view } = useTip();
  const max = Math.max(1e-9, ...rows.map((r) => r.values.reduce((s, v) => s + v, 0)));
  return (
    <div ref={box} className="relative space-y-2">
      {series.length > 1 && <Legend items={series} />}
      <div className="space-y-1">
        {rows.map((r) => {
          const total = r.values.reduce((s, v) => s + v, 0);
          return (
            <div key={r.id} className="grid grid-cols-[8.5rem_1fr] sm:grid-cols-[11rem_1fr] items-center gap-2 text-[11px]">
              <span className="text-slate-300 truncate text-right" title={r.label}>
                {r.label}
              </span>
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="flex h-3.5 gap-[2px]" style={{ width: `${(total / max) * 85}%` }}>
                  {r.values.map((v, i) =>
                    v > 0 ? (
                      <div
                        key={i}
                        tabIndex={0}
                        className={`h-full hover:brightness-125 focus:brightness-125 outline-none ${i === r.values.length - 1 || r.values.slice(i + 1).every((x) => x <= 0) ? "rounded-r" : ""}`}
                        style={{ flex: v, background: series[i].color, minWidth: 2 }}
                        onPointerMove={(e) =>
                          show(
                            e,
                            <>
                              <div className="text-slate-400 mb-0.5">{r.label}</div>
                              {series.map((s, k) => (
                                <TipRow key={s.name} color={s.color} value={valueFmt(r.values[k])} name={s.name} />
                              ))}
                            </>
                          )
                        }
                        onFocus={(e) => show(e, <TipRow color={series[i].color} value={valueFmt(v)} name={`${series[i].name} · ${r.label}`} />)}
                        onPointerLeave={hide}
                        onBlur={hide}
                      />
                    ) : null
                  )}
                </div>
                <span className="font-mono text-slate-400 shrink-0">{valueFmt(total)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {view}
    </div>
  );
}

/** Rows × columns of cells on a sequential blue ramp (0 = empty) */
export function Heatmap({ rows, cols, colLabel, cellTip }: { rows: Array<{ id: string; label: string; values: number[] }>; cols: string[]; colLabel: (c: string, i: number) => string; cellTip: (row: string, col: string, v: number) => string }) {
  const { box, show, hide, view } = useTip();
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  const colour = (v: number) => (v <= 0 ? EMPTY : SEQ[Math.min(SEQ.length - 1, Math.floor((v / max) * (SEQ.length - 1e-9)))]);
  return (
    <div ref={box} className="relative overflow-x-auto">
      <div className="grid gap-[2px] text-[10px] min-w-full" style={{ gridTemplateColumns: `minmax(7rem, 10rem) repeat(${cols.length}, minmax(12px, ${cols.length > 14 ? "1fr" : "4rem"}))` }}>
        <span />
        {cols.map((c, i) => (
          <span key={c} className="text-slate-500 text-center font-mono leading-3">
            {colLabel(c, i)}
          </span>
        ))}
        {rows.map((r) => (
          <div key={r.id} className="contents">
            <span className="text-slate-300 truncate pr-1.5 text-right" title={r.label}>
              {r.label}
            </span>
            {r.values.map((v, i) => (
              <span
                key={i}
                tabIndex={0}
                className="h-3.5 rounded-[2px] outline-none hover:ring-1 hover:ring-slate-200 focus:ring-1 focus:ring-slate-200"
                style={{ background: colour(v) }}
                onPointerMove={(e) => show(e, cellTip(r.label, cols[i], v))}
                onFocus={(e) => show(e, cellTip(r.label, cols[i], v))}
                onPointerLeave={hide}
                onBlur={hide}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-500">
        <span>Less</span>
        {[EMPTY, ...SEQ.filter((_, i) => i % 2 === 1)].map((c) => (
          <span key={c} className="w-3 h-3 rounded-[2px]" style={{ background: c }} />
        ))}
        <span>More</span>
      </div>
      {view}
    </div>
  );
}

/** Vertical columns (one series, or stacked series), labels under every few columns */
export function Columns({
  labels,
  series,
  height = 120,
  every = 1,
  tipTitle,
  valueFmt = compact
}: {
  labels: string[];
  series: Array<{ name: string; color: string; values: number[] }>;
  height?: number;
  every?: number;
  tipTitle?: (i: number) => string;
  valueFmt?: (n: number) => string;
}) {
  const { box, show, hide, view } = useTip();
  const totals = labels.map((_, i) => series.reduce((s, sr) => s + (sr.values[i] || 0), 0));
  const max = niceTop(Math.max(...totals, 0) || 1);
  const W = Math.max(560, labels.length * 18);
  const H = height;
  const pad = { l: 30, r: 6, t: 8, b: 18 };
  const bw = Math.min(16, ((W - pad.l - pad.r) / labels.length) * 0.7);
  const xOf = (i: number) => pad.l + ((i + 0.5) * (W - pad.l - pad.r)) / labels.length;
  const yOf = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <div ref={box} className="relative">
      {series.length > 1 && (
        <div className="mb-1.5">
          <Legend items={series} />
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H + 20 }} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={yOf(t)} y2={yOf(t)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 4} y={yOf(t) + 3} textAnchor="end" fontSize={9} fill={TEXT_MUTED}>
              {compact(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          let base = 0;
          const tip = (
            <>
              <div className="text-slate-400 mb-0.5">{tipTitle ? tipTitle(i) : l}</div>
              {series.map((s) => (
                <TipRow key={s.name} color={series.length > 1 ? s.color : undefined} value={valueFmt(s.values[i] || 0)} name={s.name} />
              ))}
            </>
          );
          const visible = series.map((s, k) => ({ k, v: s.values[i] || 0 })).filter((x) => x.v > 0);
          return (
            <g key={i} onPointerMove={(e) => show(e, tip)} onPointerLeave={hide} tabIndex={0} onFocus={(e) => show(e, tip)} onBlur={hide} className="outline-none">
              <rect x={xOf(i) - (W - pad.l - pad.r) / labels.length / 2} y={pad.t} width={(W - pad.l - pad.r) / labels.length} height={H - pad.t - pad.b} fill="transparent" />
              {visible.map(({ k, v }, n) => {
                const y0 = yOf(base);
                base += v;
                const y1 = yOf(base);
                const top = n === visible.length - 1;
                const h = Math.max(0, y0 - y1 - (top ? 0 : 2));
                const r = top ? Math.min(4, h, bw / 2) : 0;
                const x = xOf(i) - bw / 2;
                const y = y1 + (top ? 0 : 2);
                // 4 px rounded data end, square at the baseline
                const d = `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + bw - r},${y} Q${x + bw},${y} ${x + bw},${y + r} L${x + bw},${y + h} Z`;
                return <path key={k} d={d} fill={series[k].color} />;
              })}
              {i % every === 0 && (
                <text x={xOf(i)} y={H - 5} textAnchor="middle" fontSize={9} fill={TEXT_MUTED}>
                  {l}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={yOf(0)} y2={yOf(0)} stroke="#334155" strokeWidth={1} />
      </svg>
      {view}
    </div>
  );
}

/** One series over time, with an optional vertical marker (e.g. the game's launch) and a snapping crosshair */
export function LineChart({ labels, values, color, name, markerIndex, markerLabel, height = 140, valueFmt = compact }: { labels: string[]; values: number[]; color: string; name: string; markerIndex?: number; markerLabel?: string; height?: number; valueFmt?: (n: number) => string }) {
  const { box, show, hide, view } = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = height;
  const pad = { l: 34, r: 10, t: 12, b: 18 };
  const max = niceTop(Math.max(...values, 0) || 1);
  const n = Math.max(1, labels.length - 1);
  const xOf = (i: number) => pad.l + (i / n) * (W - pad.l - pad.r);
  const yOf = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const path = values.map((v, i) => `${i ? "L" : "M"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const every = Math.max(1, Math.ceil(labels.length / 8));
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const i = Math.max(0, Math.min(labels.length - 1, Math.round(fx * n)));
    setHover(i);
    show(e, <TipRow color={color} value={valueFmt(values[i])} name={`${name} · ${labels[i]}`} />);
  };
  return (
    <div ref={box} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={yOf(t)} y2={yOf(t)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 4} y={yOf(t) + 3} textAnchor="end" fontSize={9} fill={TEXT_MUTED}>
              {valueFmt(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize={9} fill={TEXT_MUTED}>
              {l}
            </text>
          ) : null
        )}
        {markerIndex !== undefined && markerIndex >= 0 && (
          <g>
            <line x1={xOf(markerIndex)} x2={xOf(markerIndex)} y1={pad.t - 4} y2={H - pad.b} stroke="#e2e8f0" strokeWidth={1} />
            <text x={xOf(markerIndex) + 4} y={pad.t + 4} fontSize={9} fill="#e2e8f0">
              {markerLabel}
            </text>
          </g>
        )}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {values.length > 0 && <circle cx={xOf(values.length - 1)} cy={yOf(values[values.length - 1])} r={4} fill={color} stroke={SURFACE} strokeWidth={2} />}
        {hover !== null && (
          <g>
            <line x1={xOf(hover)} x2={xOf(hover)} y1={pad.t} y2={H - pad.b} stroke="#475569" strokeWidth={1} />
            <circle cx={xOf(hover)} cy={yOf(values[hover])} r={4} fill={color} stroke={SURFACE} strokeWidth={2} />
          </g>
        )}
        <rect x={pad.l} y={0} width={W - pad.l - pad.r} height={H} fill="transparent" onPointerMove={onMove} onPointerLeave={() => (setHover(null), hide())} />
      </svg>
      {view}
    </div>
  );
}
