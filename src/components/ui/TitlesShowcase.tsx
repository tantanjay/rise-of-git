import { useEffect, useState } from "react";
import { API_BASE } from "@/config";
import { CivilizationType, DeveloperKingdom, EarnedTitle, TitleBuffType, TitleCategory } from "@/types";
import { OverseerMedal, OVERSEER_TITLE, ARCHON_TITLE } from "./OverseerMedal";
import { ArchonSeal } from "./CivFrame";
import { Modal } from "./Modal";

/** Shape of GET /kingdoms/:id/titles (ladder comes from server/src/titles.ts) */
interface TitleLadderResponse {
  progress: Record<TitleCategory, number> | null;
  ladder: Array<{
    category: TitleCategory;
    label: string;
    buffType: TitleBuffType;
    tiers: Array<{ threshold: number; name: string; emblem: string; buffPct: number }>;
  }>;
  /** Rulers holding each tier now, earliest first */
  holders?: Partial<Record<TitleCategory, Record<number, TitleHolder[]>>>;
}

interface TitleHolder {
  id: string;
  name: string;
  civilization: CivilizationType;
  unlockedAt: string;
}

const CIV_ICON: Record<CivilizationType, string> = { human: "👑", elf: "🌸", dwarf: "⚒️", orc: "⚔️", arcane: "🔮" };

const BUFF_LABEL: Record<TitleBuffType, string> = { hp: "HP", atk: "ATK", def: "DEF", all: "All Stats", harvest: "Harvest" };
const BUFF_COLOR: Record<TitleBuffType, string> = {
  hp: "text-emerald-300",
  atk: "text-rose-300",
  def: "text-sky-300",
  all: "text-amber-300",
  harvest: "text-lime-300"
};
const TIER_NUMERAL = ["", "I", "II", "III"];

const pct = (n: number) => `+${Math.round(n * 1000) / 10}%`;
const compact = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : n >= 10_000 ? `${Math.round(n / 100) / 10}k` : Math.floor(n).toLocaleString());

/** Overseer's Resolve per stack (server: OVERSEER_GRUDGE_PER_DEFEAT in warConfig.ts) */
const RESOLVE_PER_STACK = 0.2;

/** Special Overseers hold one fixed title instead of the milestone ladder, plus their Overseer's Resolve */
function OverseerTitle({ kingdom }: { kingdom: DeveloperKingdom }) {
  const stacks = kingdom.grudgeStacks ?? 0;
  const bonus = stacks * RESOLVE_PER_STACK;
  return (
    <div className="px-6 py-3.5 bg-slate-950/50 border-b border-slate-800 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
        <div className="flex items-center gap-2 font-mono text-slate-300 font-semibold">
          <span aria-hidden>🎖️</span>
          <span>Sovereign Titles (1)</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <span className="px-2 py-0.5 rounded-md bg-emerald-950/50 border border-emerald-700/40 text-emerald-300">{pct(bonus)} HP</span>
          <span className="px-2 py-0.5 rounded-md bg-rose-950/50 border border-rose-700/40 text-rose-300">{pct(bonus)} ATK</span>
          <span className="px-2 py-0.5 rounded-md bg-sky-950/50 border border-sky-700/40 text-sky-300">{pct(bonus)} DEF</span>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 rounded-xl border border-violet-500/50 bg-linear-to-r from-violet-950/70 via-fuchsia-950/40 to-violet-950/70 shadow-[0_0_18px_rgba(139,92,246,0.25)]">
        <OverseerMedal className="w-11 h-14 shrink-0 drop-shadow-[0_0_8px_rgba(167,139,250,0.7)]" />
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-violet-300">Special Overseer</div>
          <div className="font-medieval text-base font-bold text-violet-100">{OVERSEER_TITLE.name}</div>
          <div className="text-[11px] text-slate-400">{OVERSEER_TITLE.description}</div>
        </div>
      </div>
      <div className="p-2.5 rounded-xl border border-violet-600/35 bg-violet-950/30 text-[11px] font-mono flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 uppercase">
          <span>Overseer's Resolve</span>
          <span className="text-amber-300">All Stats</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base leading-none" aria-hidden>
            🔱
          </span>
          <span className="text-violet-100 font-semibold">×{stacks} stacks</span>
          <span className="ml-auto shrink-0 text-violet-300">{pct(bonus)} HP / ATK / DEF</span>
        </div>
        <div className="text-[10px] text-slate-500">
          Each defeat this week adds a stack ({pct(RESOLVE_PER_STACK)} HP, ATK and DEF for the garrison); resets Sunday 00:00 UTC.
        </div>
      </div>
    </div>
  );
}

/** The Archon holds one fixed title; untouchable, so no Resolve either */
function ArchonTitle() {
  return (
    <div className="px-6 py-3.5 bg-slate-950/50 border-b border-slate-800 flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-xs font-mono text-slate-300 font-semibold">
        <span aria-hidden>🎖️</span>
        <span>Sovereign Titles (1)</span>
      </div>
      <div className="flex items-center gap-3 p-3 rounded-xl border border-red-500/50 bg-linear-to-r from-red-950/70 via-amber-950/40 to-red-950/70 shadow-[0_0_18px_rgba(220,38,38,0.25)]">
        <ArchonSeal className="w-12 h-12 shrink-0 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-red-300">Archon of the Realm</div>
          <div className="font-medieval text-base font-bold text-amber-100">{ARCHON_TITLE.name}</div>
          <div className="text-[11px] text-slate-400">{ARCHON_TITLE.description}</div>
        </div>
      </div>
    </div>
  );
}

/** Milestone ladder and the ruler's progress (GET /kingdoms/:id/titles); refetched when their titles change */
function useTitleLadder(kingdom: DeveloperKingdom, enabled = true) {
  const [data, setData] = useState<TitleLadderResponse | null>(null);
  const titlesKey = (kingdom.earnedTitles ?? []).map((t) => `${t.category}${t.tier}`).join(",");
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`${API_BASE}/kingdoms/${encodeURIComponent(kingdom.id)}/titles`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [kingdom.id, titlesKey, enabled]);
  return data;
}

/** Number of title categories while the ladder is still loading */
const CATEGORY_COUNT = 10;

/** Summed buffs of a ruler's titles as chips */
function BuffChips({ kingdom }: { kingdom: DeveloperKingdom }) {
  const buffs = kingdom.titleBuffs ?? { hpBonus: 0, atkBonus: 0, defBonus: 0 };
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono flex-wrap">
      <span className="px-2 py-0.5 rounded-md bg-emerald-950/50 border border-emerald-700/40 text-emerald-300">{pct(buffs.hpBonus)} HP</span>
      <span className="px-2 py-0.5 rounded-md bg-rose-950/50 border border-rose-700/40 text-rose-300">{pct(buffs.atkBonus)} ATK</span>
      <span className="px-2 py-0.5 rounded-md bg-sky-950/50 border border-sky-700/40 text-sky-300">{pct(buffs.defBonus)} DEF</span>
      {(buffs.harvestBonus ?? 0) > 0 && (
        <span className="px-2 py-0.5 rounded-md bg-lime-950/50 border border-lime-700/40 text-lime-300">{pct(buffs.harvestBonus ?? 0)} Harvest</span>
      )}
    </div>
  );
}

/** Profile section: the titles a ruler holds and their summed buffs (Special Overseers: their fixed title) */
export function TitlesShowcase({ kingdom, onViewAll }: { kingdom: DeveloperKingdom; onViewAll?: () => void }) {
  if (kingdom.isArchon) return <ArchonTitle />;
  return kingdom.isSpecial ? <OverseerTitle kingdom={kingdom} /> : <EarnedTitles kingdom={kingdom} onViewAll={onViewAll} />;
}

/** Only the titles the ruler holds, with a button to the whole ladder */
function EarnedTitles({ kingdom, onViewAll }: { kingdom: DeveloperKingdom; onViewAll?: () => void }) {
  const data = useTitleLadder(kingdom);
  const titles = kingdom.earnedTitles ?? [];
  const order = new Map((data?.ladder ?? []).map((c, i) => [c.category, i]));
  const labelOf = new Map((data?.ladder ?? []).map((c) => [c.category, c.label]));
  const sorted = [...titles].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99));

  return (
    <div className="px-6 py-3.5 bg-slate-950/50 border-b border-slate-800 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
        <div className="flex items-center gap-2 font-mono text-slate-300 font-semibold">
          <span aria-hidden>🎖️</span>
          <span>
            Sovereign Titles ({titles.length} of {data?.ladder.length ?? CATEGORY_COUNT})
          </span>
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="ml-1 px-2 py-0.5 rounded-md border border-amber-600/50 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 text-[10px] font-bold transition"
            >
              View all titles →
            </button>
          )}
        </div>
        <BuffChips kingdom={kingdom} />
      </div>

      {sorted.length === 0 ? (
        <div className="text-[11px] font-mono text-slate-500">No titles earned yet. Open “View all titles” to see what earns them.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {sorted.map((t) => (
            <div key={t.category} className="p-2.5 rounded-xl border bg-amber-950/25 border-amber-600/35 text-[11px] font-mono flex items-center gap-2 min-w-0">
              <span className="text-lg leading-none" aria-hidden>
                {t.emblem}
              </span>
              <div className="min-w-0">
                <div className="text-amber-200 font-semibold truncate">{t.name}</div>
                <div className="text-[10px] text-slate-500 truncate">
                  {labelOf.get(t.category) ?? t.category} · Tier {TIER_NUMERAL[t.tier]}
                </div>
              </div>
              <span className={`ml-auto shrink-0 ${BUFF_COLOR[t.buffType]}`}>
                {pct(t.buffPct)} {BUFF_LABEL[t.buffType]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Window with every title category: the tier held, progress to the next tier and the whole ladder */
export function AllTitlesModal({ kingdom, open, onClose }: { kingdom: DeveloperKingdom; open: boolean; onClose: () => void }) {
  const data = useTitleLadder(kingdom, open);
  const titles = kingdom.earnedTitles ?? [];
  const earnedBy = new Map<TitleCategory, EarnedTitle>(titles.map((t) => [t.category, t]));
  // Holder list of one tier, opened over this window; closing it comes back here
  const [holderView, setHolderView] = useState<{ category: TitleCategory; tier: number } | null>(null);
  const viewCat = holderView ? data?.ladder.find((c) => c.category === holderView.category) : undefined;
  const viewTier = viewCat && holderView ? viewCat.tiers[holderView.tier - 1] : undefined;
  const viewHolders = holderView ? data?.holders?.[holderView.category]?.[holderView.tier] ?? [] : [];

  return (
    <>
    <Modal
      open={open}
      hidden={Boolean(holderView)}
      onClose={onClose}
      size="lg"
      header={
        <div className="flex flex-col gap-1">
          <div className="font-medieval text-lg text-amber-200">🎖️ Sovereign Titles</div>
          <div className="text-xs text-slate-400">
            {kingdom.name} · {titles.length} of {data?.ladder.length ?? CATEGORY_COUNT} earned
          </div>
        </div>
      }
    >
      <div className="p-5 flex flex-col gap-3">
        <BuffChips kingdom={kingdom} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(data?.ladder ?? []).map((cat) => {
            const earned = earnedBy.get(cat.category);
            const value = data?.progress?.[cat.category] ?? 0;
            const next = cat.tiers[earned?.tier ?? 0];
            const prevThreshold = earned ? cat.tiers[earned.tier - 1].threshold : 0;
            const frac = next ? Math.min(1, Math.max(0, (value - prevThreshold) / (next.threshold - prevThreshold))) : 1;
            return (
              <div
                key={cat.category}
                className={`p-2.5 rounded-xl border text-[11px] font-mono flex flex-col gap-1.5 ${
                  earned ? "bg-amber-950/25 border-amber-600/35" : "bg-slate-900/70 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 uppercase">
                  <span className="truncate">{cat.label}</span>
                  <span className={BUFF_COLOR[cat.buffType]}>{BUFF_LABEL[cat.buffType]}</span>
                </div>
                {earned ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-base leading-none" aria-hidden>
                      {earned.emblem}
                    </span>
                    <span className="text-amber-200 font-semibold truncate">{earned.name}</span>
                    <span className="ml-auto shrink-0 text-amber-400/90">
                      {TIER_NUMERAL[earned.tier]} · {pct(earned.buffPct)}
                    </span>
                  </div>
                ) : (
                  <div className="text-slate-500 truncate">Not yet earned</div>
                )}
                <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full ${earned ? "bg-amber-400" : "bg-slate-500"}`} style={{ width: `${Math.round(frac * 100)}%` }} />
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {next ? `${compact(value)} / ${compact(next.threshold)} → ${next.emblem} ${next.name}` : `${compact(value)} · highest tier reached`}
                </div>
                {/* The whole ladder of this category */}
                <div className="flex flex-col gap-0.5 pt-1 border-t border-slate-800/80">
                  {cat.tiers.map((t, i) => {
                    const held = (earned?.tier ?? 0) >= i + 1;
                    const count = data?.holders?.[cat.category]?.[i + 1]?.length ?? 0;
                    return (
                      <div key={t.name} className={`flex items-center gap-1.5 text-[10px] ${held ? "text-amber-300" : "text-slate-500"}`}>
                        <span className="w-4 text-center">{TIER_NUMERAL[i + 1]}</span>
                        <span aria-hidden>{t.emblem}</span>
                        <span className="truncate">{t.name}</span>
                        <span className="ml-auto shrink-0">
                          {compact(t.threshold)} · {pct(t.buffPct)} {BUFF_LABEL[cat.buffType]}
                        </span>
                        <button
                          type="button"
                          disabled={count === 0}
                          onClick={() => setHolderView({ category: cat.category, tier: i + 1 })}
                          className={`shrink-0 w-11 text-right px-1 rounded transition ${
                            count > 0 ? "text-sky-300 hover:bg-sky-900/40 hover:text-sky-200 cursor-pointer" : "text-slate-600 cursor-default"
                          }`}
                          title={count > 0 ? `${count} ruler${count === 1 ? "" : "s"} hold this title. Click to see who` : "Nobody holds this title yet"}
                        >
                          👥 {count}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!data && <div className="text-xs text-slate-500 font-mono">Loading titles…</div>}
        </div>
      </div>
    </Modal>
    <Modal
      open={open && Boolean(holderView)}
      onClose={() => setHolderView(null)}
      size="md"
      header={
        <div className="flex flex-col gap-1">
          <div className="font-medieval text-lg text-amber-200">
            {viewTier?.emblem} {viewTier?.name}
          </div>
          <div className="text-xs text-slate-400">
            {viewCat?.label} · Tier {TIER_NUMERAL[holderView?.tier ?? 0]} · {viewHolders.length} holder{viewHolders.length === 1 ? "" : "s"}
          </div>
        </div>
      }
    >
      <ul className="p-3 flex flex-col gap-1">
        {viewHolders.map((h) => (
          <li
            key={h.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
              h.id === kingdom.id ? "bg-amber-950/30 border-amber-600/40" : "bg-slate-900/70 border-slate-800"
            }`}
          >
            <span aria-hidden>{CIV_ICON[h.civilization] ?? "🏰"}</span>
            <span className="font-semibold text-slate-100 truncate">{h.name}</span>
            <span className="ml-auto shrink-0 text-[10px] font-mono text-slate-500">since {h.unlockedAt.slice(0, 10)}</span>
          </li>
        ))}
        {viewHolders.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-500">Nobody holds this title yet.</li>}
      </ul>
    </Modal>
    </>
  );
}
