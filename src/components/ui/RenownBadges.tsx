import { useCallback, useState } from "react";
import { API_BASE } from "@/config";
import { RenownPodium } from "@/types";

/**
 * Hall of Renown top-3 marks in the kingdom picker, kept discreet: the castle level badge turns into a metal
 * pennant (Weekly), the 🏅 becomes a gold / silver / bronze medal (Monthly) and the 🏠 a metal house (Year).
 * The All time place is worn on the civ frame (CivFrame `renown`), which is the grand one.
 */

export type RenownPlace = 1 | 2 | 3;

/** Light → dark metal tones plus a text colour that reads on dark rows */
export const RENOWN_METAL: Record<RenownPlace, { light: string; mid: string; dark: string; text: string; medal: string; name: string }> = {
  1: { light: "#fef9c3", mid: "#fbbf24", dark: "#92400e", text: "#fde68a", medal: "🥇", name: "Gold" },
  2: { light: "#ffffff", mid: "#cbd5e1", dark: "#475569", text: "#e2e8f0", medal: "🥈", name: "Silver" },
  3: { light: "#fed7aa", mid: "#fb923c", dark: "#7c2d12", text: "#fdba74", medal: "🥉", name: "Bronze" }
};

export const RENOWN_TAB_LABEL = { week: "last week", month: "last month", year: "this fiscal year", all: "of all time" } as const;

/** Place (1–3) of a ruler in one tab's podium, or null */
export function placeIn(ids: string[] | undefined, userId: string): RenownPlace | null {
  const i = ids?.indexOf(userId) ?? -1;
  return i >= 0 && i < 3 ? ((i + 1) as RenownPlace) : null;
}

const renownLine = (place: RenownPlace, tab: keyof typeof RENOWN_TAB_LABEL) => `${RENOWN_METAL[place].medal} Hall of Renown #${place} ${RENOWN_TAB_LABEL[tab]}`;

/** Castle level: the usual chip, or a small metal pennant with a notched tail for the Weekly top 3 */
export function RenownLevel({ level, place }: { level: number; place: RenownPlace | null }) {
  const title = `Castle level ${level}`;
  if (!place) {
    return (
      <span className="inline-block px-1 rounded bg-slate-800 border border-amber-700/50 text-amber-300 text-[9px] font-mono font-bold tabular-nums" title={title}>
        Lv{level}
      </span>
    );
  }
  const m = RENOWN_METAL[place];
  return (
    <span
      className="inline-block pl-1 pr-2 text-[9px] font-mono font-bold tabular-nums [clip-path:polygon(0_0,100%_0,calc(100%-4px)_50%,100%_100%,0_100%)]"
      style={{ background: `linear-gradient(90deg, ${m.dark}cc, ${m.dark}55)`, color: m.text, boxShadow: `inset 2px 0 0 ${m.mid}` }}
      title={`${title}\n${renownLine(place, "week")}`}
    >
      Lv{level}
    </span>
  );
}

/** A small medal (ribbon + disc) in the place's metal */
function MedalIcon({ place }: { place: RenownPlace }) {
  const m = RENOWN_METAL[place];
  const id = `renown-medal-${place}`;
  return (
    <svg viewBox="0 0 12 14" className="w-3.5 h-4 -my-1 shrink-0 drop-shadow-[0_0_2px_rgba(0,0,0,0.6)]" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={m.light} />
          <stop offset="0.5" stopColor={m.mid} />
          <stop offset="1" stopColor={m.dark} />
        </linearGradient>
      </defs>
      <path d="M3 0 h2.4 l1.6 4.4 -1.4 1.4 Z" fill="#1d4ed8" />
      <path d="M9 0 h-2.4 l-1.6 4.4 1.4 1.4 Z" fill="#b91c1c" />
      <circle cx="6" cy="9" r="4.3" fill={`url(#${id})`} stroke={m.dark} strokeWidth="0.6" />
      <text x="6" y="9.3" textAnchor="middle" dominantBaseline="central" fontSize="5" fontWeight="900" fill={m.dark}>
        {place}
      </text>
    </svg>
  );
}

/** Milestone title count: 🏅 n, or a metal medal for the Monthly top 3 */
export function RenownTitles({ count, place, title }: { count: number; place: RenownPlace | null; title: string }) {
  if (!place) {
    return (
      <span className="px-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-[10px] font-bold text-amber-300" title={title}>
        🏅 {count}
      </span>
    );
  }
  const m = RENOWN_METAL[place];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 rounded-full bg-amber-500/10 border text-[10px] font-bold"
      style={{ borderColor: `${m.mid}66`, color: m.text }}
      title={`${title}\n${renownLine(place, "month")}`}
    >
      <MedalIcon place={place} />
      {count}
    </span>
  );
}

/** A small house with a metal roof and a lit window */
function HouseIcon({ place }: { place: RenownPlace }) {
  const m = RENOWN_METAL[place];
  const id = `renown-house-${place}`;
  return (
    <svg viewBox="0 0 12 12" className="w-3 h-3 shrink-0" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.light} />
          <stop offset="1" stopColor={m.mid} />
        </linearGradient>
      </defs>
      <path d="M2 6 V11 H10 V6" fill="#334155" stroke={m.dark} strokeWidth="0.5" />
      <path d="M0.6 6.4 L6 1.2 L11.4 6.4 Z" fill={`url(#${id})`} stroke={m.dark} strokeWidth="0.5" strokeLinejoin="round" />
      <rect x="4.9" y="7.4" width="2.2" height="3.6" fill={m.mid} />
      <circle cx="6" cy="1.3" r="0.8" fill={m.light} />
    </svg>
  );
}

/** Building count: 🏠 n, or a metal-roofed house for the Year top 3 */
export function RenownHouse({ count, place }: { count: number; place: RenownPlace | null }) {
  if (!place) {
    return (
      <span className="text-[10px] font-mono text-slate-400" title="Buildings">
        🏠 {count}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-bold" style={{ color: RENOWN_METAL[place].text }} title={`Buildings\n${renownLine(place, "year")}`}>
      <HouseIcon place={place} />
      {count}
    </span>
  );
}

/** Loads the podium on demand (on mount and when the picker opens; the server caches it) */
export function useRenownPodium() {
  const [podium, setPodium] = useState<RenownPodium | null>(null);
  const load = useCallback(() => {
    fetch(`${API_BASE}/leaderboard/podium`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RenownPodium | null) => data && setPodium(data))
      .catch(() => {
        // Badges are decoration; the picker works without them
      });
  }, []);
  return { podium, load };
}
