import { useEffect, useState } from "react";
import { PartyPopper, Swords, Users } from "lucide-react";
import { DeveloperKingdom, ProclamationState } from "@/types";
import { CALL_TO_ARMS_MS, FESTIVAL, SETTLERS, festivalCostFor } from "@/utils/civDemographics";
import { formatCompact, timeLeftLabel } from "@/utils/format";

const NONE: ProclamationState = {
  settlersReadyAt: 0,
  festivalEndsAt: 0,
  festivalReadyAt: 0,
  callToArmsUntil: 0,
};

/** The kingdom's proclamation times (all 0 when it never held one) */
export const proclamationsOf = (k: Pick<DeveloperKingdom, "proclamations"> | null | undefined): ProclamationState => k?.proclamations ?? NONE;
/** ⚔️ Called to Arms right now: ms left, or 0 */
export const callToArmsLeft = (k: Pick<DeveloperKingdom, "proclamations"> | null | undefined, now = Date.now()) =>
  Math.max(0, proclamationsOf(k).callToArmsUntil - now);
/** 🎉 Festival under way: ms left, or 0 */
export const festivalLeft = (k: Pick<DeveloperKingdom, "proclamations"> | null | undefined, now = Date.now()) =>
  Math.max(0, proclamationsOf(k).festivalEndsAt - now);

/** Re-renders every `ms` so countdowns stay current */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const ICON = { food: "🌾", gold: "🪙" } as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;

interface Props {
  kingdom: DeveloperKingdom;
  isOwner: boolean;
  onProclaim?: (kind: "settlers" | "festival") => Promise<string | null>;
}

/** 📜 Royal Proclamations (Improvements modal tab): Paid Settlers and the Festival, with their cooldowns and locks */
export function RoyalProclamations({ kingdom, isOwner, onProclaim }: Props) {
  const now = useNow(15_000);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const st = proclamationsOf(kingdom);
  const res = kingdom.resources;

  const run = async (kind: "settlers" | "festival") => {
    if (!onProclaim) return;
    setBusy(kind);
    const error = await onProclaim(kind);
    setBusy(null);
    setErrors((e) => {
      const next = { ...e };
      if (error) next[kind] = error;
      else delete next[kind];
      return next;
    });
  };

  // Nethergarde summons and Special Overseers respawn to full: proclamations are for mortal kingdoms
  const closed =
    kingdom.civilization === "arcane"
      ? "Nethergarde doesn't hold Royal Proclamations: it grows by the void ritual (Kingdom → Population & Army)."
      : kingdom.isSpecial
        ? "Special Overseers' people return in full every harvest."
        : null;

  // 🏘️ Paid Settlers
  const pop = kingdom.population ?? 0;
  const maxPop = kingdom.maxPopulation ?? pop;
  const line = Math.floor(maxPop * SETTLERS.MAX_FILL);
  const room = Math.max(0, line - pop);
  const payFor = Math.min(Math.floor((res.food || 0) / SETTLERS.COST.food), Math.floor((res.gold || 0) / SETTLERS.COST.gold));
  const settlers = Math.min(room, payFor);
  const settlersWait = Math.max(0, st.settlersReadyAt - now);
  const settlersLock = closed
    ? "Mortal kingdoms only"
    : settlersWait > 0
      ? `Answer again in ${timeLeftLabel(settlersWait)}`
      : room <= 0
        ? `Population above ${pct(SETTLERS.MAX_FILL)}`
        : settlers <= 0
          ? "Not enough resources"
          : null;

  // 🎉 Festival
  const festCost = festivalCostFor(kingdom.cityHallLevel || 1);
  const festLeft = Math.max(0, st.festivalEndsAt - now);
  const armsLeft = Math.max(0, st.callToArmsUntil - now);
  const festWait = Math.max(0, st.festivalReadyAt - now);
  const festAffordable = (res.food || 0) >= festCost.food && (res.gold || 0) >= festCost.gold;
  const festLock = closed
    ? "Mortal kingdoms only"
    : festLeft > 0
      ? `Under way: ${timeLeftLabel(festLeft)} left`
      : armsLeft > 0
        ? `⚔️ Call to Arms: ${timeLeftLabel(armsLeft)}`
        : festWait > 0
          ? `Next Festival in ${timeLeftLabel(festWait)}`
          : !festAffordable
            ? "Not enough resources"
            : null;

  const chip = (key: "food" | "gold", need: number) => {
    const have = res[key] || 0;
    return (
      <span
        key={key}
        title={`${key === "food" ? "Food" : "Gold"}: have ${have.toLocaleString()}, need ${need.toLocaleString()}`}
        className={`px-1.5 py-0.5 rounded-md border text-[11px] font-mono font-bold ${
          have >= need ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200" : "border-red-800/50 bg-red-950/40 text-red-300"
        }`}
      >
        {ICON[key]} {formatCompact(need)}
      </span>
    );
  };

  const button = (kind: "settlers" | "festival", lock: string | null, label: string, Icon: typeof Users) => (
    <button
      onClick={() => run(kind)}
      disabled={!isOwner || Boolean(lock) || busy !== null}
      className={`mt-auto flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-bold transition ${
        isOwner && !lock ? "bg-amber-500 hover:bg-amber-400 text-slate-950" : "bg-slate-800 text-slate-500 cursor-not-allowed"
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${busy === kind ? "animate-bounce" : ""}`} />
      {busy === kind ? "Proclaiming…" : !isOwner ? "Owner only" : (lock ?? label)}
    </button>
  );

  return (
    <div className="p-5 space-y-4">
      <p className="text-xs text-slate-400">
        Proclamations are one-off royal orders with a cooldown, paid mostly in food. They change the kingdom for a while, not for good.
      </p>
      {closed && <p className="text-xs rounded-lg border border-purple-700/50 bg-purple-950/40 text-purple-200 px-3 py-2">{closed}</p>}
      {armsLeft > 0 && !closed && (
        <p className="flex items-center gap-1.5 text-xs rounded-lg border border-rose-700/50 bg-rose-950/40 text-rose-200 px-3 py-2">
          <Swords className="w-3.5 h-3.5 shrink-0" />
          Called to Arms for {timeLeftLabel(armsLeft)}: {isOwner ? "you" : "this ruler"} attacked a ruler's city or a frontier gate in the last{" "}
          {Math.round(CALL_TO_ARMS_MS / 60_000)} minutes. No Festival until it ends.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <article className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5 flex flex-col gap-2.5">
          <div className="flex items-start gap-3">
            <span className="text-2xl w-10 h-10 shrink-0 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">🏘️</span>
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-sm text-slate-100">Paid Settlers</h4>
              <p className="text-[11px] text-slate-500">
                Once a day · up to {pct(SETTLERS.MAX_FILL)} of capacity ({line.toLocaleString()} people)
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-300">
            Newcomers answer the crown's call to refill a kingdom gutted by war. Only while the population is below {pct(SETTLERS.MAX_FILL)} of capacity, and
            never past that line. {SETTLERS.COST.food} food + {SETTLERS.COST.gold} gold each.
          </p>
          {!closed && !kingdom.fog && (
            <p className="text-[11px] text-slate-400 font-mono">
              👥 {pop.toLocaleString()} / {maxPop.toLocaleString()} · room to the line: {room.toLocaleString()}
            </p>
          )}
          {!closed && settlers > 0 && (
            <div className="flex flex-wrap gap-1.5">{[chip("food", settlers * SETTLERS.COST.food), chip("gold", settlers * SETTLERS.COST.gold)]}</div>
          )}
          {errors.settlers && <p className="text-[11px] text-red-400">{errors.settlers}</p>}
          {button("settlers", settlersLock, `Call ${settlers.toLocaleString()} settlers`, Users)}
        </article>

        <article
          className={`rounded-xl border p-3.5 flex flex-col gap-2.5 ${festLeft > 0 ? "border-amber-600/50 bg-amber-950/20" : "border-slate-800 bg-slate-950/50"}`}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl w-10 h-10 shrink-0 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">🎉</span>
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-sm text-slate-100">Festival</h4>
              <p className="text-[11px] text-slate-500">Lasts {Math.round(FESTIVAL.DURATION_MS / 3_600_000)} h · once a week · not while Called to Arms</p>
            </div>
          </div>
          <p className="text-xs text-slate-300">
            Lanterns over the plaza, dancing round the fountain and fireworks over the castle. For a day births are ×{FESTIVAL.BIRTH_MULT} and the workforce
            brings in +{pct(FESTIVAL.YIELD_MULT - 1)}. An attack on the city doesn't end it.
          </p>
          {festLeft > 0 && <p className="text-[11px] font-semibold text-amber-300">🎉 Under way: {timeLeftLabel(festLeft)} left</p>}
          {!closed && festLeft <= 0 && <div className="flex flex-wrap gap-1.5">{[chip("food", festCost.food), chip("gold", festCost.gold)]}</div>}
          {errors.festival && <p className="text-[11px] text-red-400">{errors.festival}</p>}
          {button("festival", festLock, "Declare a Festival", PartyPopper)}
        </article>
      </div>
    </div>
  );
}
