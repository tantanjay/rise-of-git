import { useState } from "react";
import { RepoBuilding, BuildingType } from "@/types";
import { GitCommit, GitPullRequest, TrendingUp, ArrowRightLeft } from "lucide-react";
import { Modal } from "./Modal";
import { Combobox } from "./Combobox";
import { formatCompact } from "@/utils/format";
import { PrestigeStars } from "./PrestigeStars";
import { compareBuildings } from "@/utils/castle";

interface BuildingModalProps {
  building: RepoBuilding | null;
  /** Every building in the kingdom, to pick a swap partner from */
  others: RepoBuilding[];
  onClose: () => void;
  /** Signed-in owner of this kingdom — only they can swap plots */
  isOwner: boolean;
  /** Swaps the plots of two buildings. Returns an error message or null. */
  onSwap: (buildingId: string, withBuildingId: string) => Promise<string | null>;
}

const DISTRICT_ORDER: BuildingType[] = ["residential_commercial", "soldier_building", "food_field", "animal_field"];

const TYPE_DETAILS: Record<RepoBuilding["buildingType"], { title: string; icon: string; share: string; badge: string; description: string }> = {
  residential_commercial: {
    title: "Homes & Shops",
    icon: "🏡",
    share: "35% of the city",
    badge: "bg-amber-950 text-amber-300 border-amber-600/40",
    description: "Townhouses, artisan workshops and market stalls where citizens live and trade."
  },
  animal_field: {
    title: "Pasture",
    icon: "🐑",
    share: "25% of the city",
    badge: "bg-emerald-950 text-emerald-300 border-emerald-600/40",
    description: "Fenced pens, barns and grazing livestock that feed the realm."
  },
  food_field: {
    title: "Farmland",
    icon: "🌾",
    share: "25% of the city",
    badge: "bg-lime-950 text-lime-300 border-lime-600/40",
    description: "Crop fields, granaries and windmills that keep the storehouses full."
  },
  soldier_building: {
    title: "Barracks",
    icon: "🛡️",
    share: "15% of the city",
    badge: "bg-sky-950 text-sky-300 border-sky-600/40",
    description: "Tents, barracks, watchtowers and keeps guarding the city gate."
  }
};

function Stat({ label, value, color = "text-slate-100" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

export function BuildingModal({ building, others, onClose, isOwner, onSwap }: BuildingModalProps) {
  const [swapWith, setSwapWith] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  if (!building) return null;

  const partner = others.find((b) => b.id === swapWith);
  const handleSwap = async () => {
    if (!partner || swapping) return;
    setSwapping(true);
    setSwapError(null);
    try {
      const error = await onSwap(building.id, partner.id);
      setSwapError(error);
      if (!error) setSwapWith("");
    } finally {
      setSwapping(false);
    }
  };

  const type = TYPE_DETAILS[building.buildingType] || TYPE_DETAILS.residential_commercial;
  const toNext = building.nextLevelXp === null ? 0 : Math.max(0, Math.round((building.nextLevelXp - building.xp) * 10) / 10);
  const progress =
    building.nextLevelXp === null
      ? 100
      : Math.round(((building.xp - building.levelXp) / Math.max(1, building.nextLevelXp - building.levelXp)) * 100);

  return (
    <Modal
      open
      onClose={onClose}
      header={
        <div className="flex items-center gap-3">
          <span className="text-2xl w-11 h-11 shrink-0 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">{type.icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-base font-bold text-slate-100 font-mono truncate">{building.name}</h2>
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 font-bold font-mono">
                Lv.{building.level}
              </span>
              <PrestigeStars building={building} className="shrink-0 text-xs" />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${type.badge}`}>{type.title}</span>
              <span className="font-mono truncate">{building.branch}</span>
            </div>
          </div>
        </div>
      }
    >
      <div className="p-5 space-y-4">
        {/* Level progress */}
        <section className="rounded-xl border border-emerald-600/30 bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="flex items-center gap-1.5 font-semibold text-emerald-300">
              <TrendingUp className="w-4 h-4" />
              Level {building.level} of 25
            </span>
            <span className="font-mono text-slate-400" title={`${building.totalCommits.toLocaleString()} commits`}>
              {building.xp.toLocaleString()} XP
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-900 overflow-hidden">
            <div className="h-full rounded-full bg-linear-to-r from-emerald-500 to-lime-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {building.nextLevelXp === null
              ? `Max level — every 200 XP more earns a prestige star${(building.stars ?? building.prestige) ? ` (${building.stars ?? building.prestige} so far; effects grow up to the 4th, and from the 5th, the red ★, the plot is top class)` : ""}.`
              : `${toNext} more XP to reach Lv.${building.level + 1}.`}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">
            XP: a solid commit ≈ 1 (tiny ones less, merges 0, only the first 5 a day count fully) · merged PR +3 · review on a teammate's PR +1.5
          </p>
          {building.condition === "idle" ? (
            <p className="text-xs text-slate-400 mt-2">💤 Dormant — no commits for 90+ days. One new commit raises its banner again.</p>
          ) : (
            <p className="text-xs text-amber-300/90 mt-2">🚩 Active — committed within the last 90 days, so it flies a banner with lit gate lanterns.</p>
          )}
          {building.surging && (
            <p className="text-xs text-orange-300 mt-1.5">🔥 Active Surge — a commit or merged PR in the last 48 h: this building harvests double and your kingdom's gem roll is doubled.</p>
          )}
        </section>

        {/* This week */}
        <section>
          <h3 className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 mb-2">Past 7 days</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Commits" value={String(building.commitsPastWeek)} color="text-sky-300" />
            <Stat label="PRs opened" value={String(building.prsPastWeek)} color="text-purple-300" />
            <Stat label="Lines +/-" value={`+${formatCompact(building.linesAddedPastWeek)} / -${formatCompact(building.linesDeletedPastWeek)}`} color="text-emerald-300" />
            <Stat label="Code size" value={`${formatCompact(building.totalLines || 0)} lines`} />
          </div>
        </section>

        {/* Recent commits */}
        <section>
          <h3 className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
            <GitCommit className="w-3.5 h-3.5" /> Recent commits
          </h3>
          {building.recentCommits?.length ? (
            <ul className="rounded-xl border border-slate-800 divide-y divide-slate-800/80 overflow-hidden">
              {building.recentCommits.map((c, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2 text-xs bg-slate-950/40">
                  <span className="font-mono text-sky-400 shrink-0">{c.hash}</span>
                  <span className="flex-1 min-w-0 truncate text-slate-300" title={c.message}>
                    {c.message}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-emerald-400">{c.lines}</span>
                  <span className="shrink-0 hidden sm:inline text-[11px] text-slate-500">{c.time}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">No commits recorded yet.</p>
          )}
        </section>

        {building.recentPRs?.length > 0 && (
          <section>
            <h3 className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
              <GitPullRequest className="w-3.5 h-3.5" /> Pull requests
            </h3>
            <ul className="rounded-xl border border-slate-800 divide-y divide-slate-800/80 overflow-hidden">
              {building.recentPRs.map((pr) => (
                <li key={pr.id} className="flex items-center gap-3 px-3 py-2 text-xs bg-slate-950/40">
                  <span className="font-mono text-slate-500 shrink-0">{pr.number}</span>
                  <span className="flex-1 min-w-0 truncate text-slate-300">{pr.title}</span>
                  <span
                    className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${
                      pr.status === "merged"
                        ? "bg-purple-950 text-purple-300 border-purple-700/60"
                        : pr.status === "closed"
                          ? "bg-slate-800 text-slate-400 border-slate-700"
                          : "bg-emerald-950 text-emerald-300 border-emerald-700/60"
                    }`}
                  >
                    {pr.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isOwner && (
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
              Swap plot with…
            </h3>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <Combobox searchable
                  size="sm"
                  options={DISTRICT_ORDER.flatMap((t) =>
                    others
                      .filter((b) => b.buildingType === t && b.id !== building.id)
                      .sort(compareBuildings)
                      .map((b) => ({ value: b.id, label: b.name, hint: `Lv.${b.level}`, group: `${TYPE_DETAILS[t].icon} ${TYPE_DETAILS[t].title}` }))
                  )}
                  value={swapWith || null}
                  onChange={setSwapWith}
                  disabled={swapping}
                  placeholder="Choose a building…"
                  searchPlaceholder="Search buildings…"
                  ariaLabel="Building to swap with"
                />
              </div>
              <button
                onClick={handleSwap}
                disabled={!partner || swapping}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 text-xs font-bold transition"
              >
                {swapping ? "Swapping…" : "Swap"}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {partner
                ? `${building.name} becomes ${TYPE_DETAILS[partner.buildingType].title} and ${partner.name} becomes ${type.title}. Both keep their level and XP and are rebuilt in their new district's style.`
                : "The two buildings trade plots and districts. Both keep their level and XP — handy for giving a high-level repo a grander barracks, farm or pasture."}
            </p>
            {swapError && <p className="text-xs text-red-400 mt-1">{swapError}</p>}
          </section>
        )}

        <p className="text-[11px] text-slate-500">
          {type.icon} {type.description} <span className="text-slate-600">({type.share})</span>
        </p>
      </div>
    </Modal>
  );
}
