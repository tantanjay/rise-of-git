const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** 11374 → "11.4K" (keeps small numbers exact) */
export function formatCompact(n: number): string {
  return Math.abs(n) < 10_000 ? n.toLocaleString() : compact.format(n);
}

/** Timestamp → "Today" / "Yesterday" / "Mon, Oct 12" */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Milliseconds left → "3d 4h" / "5h 10m" / "12m" */
export function timeLeftLabel(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}
