import { useMemo, useState } from "react";
import { Search, ChevronDown, ChevronUp, Landmark } from "lucide-react";
import { DeveloperKingdom, BuildingType, ActiveMarch, Rally } from "@/types";
import { BUILDING_TYPE_META } from "@/components/3d/CityView3D";
import { MarchQueue } from "./MarchQueue";
import { WALL_TIER_NAMES, wallDefMultForTier, wallDamageCutText, wallMaxHpFor, marchSlotsForLevel } from "@/utils/civDemographics";
import { PrestigeStars } from "./PrestigeStars";
import { compareBuildings } from "@/utils/castle";

interface CityDirectoryProps {
  kingdom: DeveloperKingdom;
  onFocusBuilding: (id: string) => void;
  onOpenImprovements: () => void;
  /** Signed-in owner of this kingdom — only they can buy improvements */
  isOwner: boolean;
  marches?: ActiveMarch[];
  myKingdom?: DeveloperKingdom | null;
  onRefreshMarches?: () => void;
  onOpenWarRoom?: () => void;
  rallies?: Rally[];
  onJoinRally?: (rallyId: string, soldiers: number, loadout?: string, champion?: boolean) => Promise<{ success: boolean; error?: string }>;
  onCancelRally?: (rallyId: string) => Promise<{ success: boolean; error?: string }>;
}

const DISTRICT_ORDER: BuildingType[] = ["residential_commercial", "soldier_building", "food_field", "animal_field"];

/** Searchable list of every building in the city + Marches tab when inside city view */
export function CityDirectory({
  kingdom,
  onFocusBuilding,
  onOpenImprovements,
  isOwner,
  marches = [],
  myKingdom = null,
  onRefreshMarches,
  onOpenWarRoom,
  rallies,
  onJoinRally,
  onCancelRally
}: CityDirectoryProps) {
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 640);
  const [tab, setTab] = useState<"buildings" | "marches">("buildings");
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (kingdom.buildings || []).filter((b) => !q || b.name.toLowerCase().includes(q));
    return DISTRICT_ORDER.map((type) => ({
      type,
      buildings: list.filter((b) => b.buildingType === type).sort(compareBuildings)
    })).filter((g) => g.buildings.length > 0);
  }, [kingdom, query]);

  const total = kingdom.buildings?.length ?? 0;
  const wallTier = kingdom.wallTier ?? (kingdom.upgrades?.walls ?? 0);
  const wallMaxHp = kingdom.wallMaxHp ?? wallMaxHpFor(kingdom.cityHallLevel, wallTier);
  const wallHp = kingdom.wallHp ?? wallMaxHp;
  const wallDefMult = kingdom.wallDefMult ?? wallDefMultForTier(wallTier);

  const activeMarchCount = useMemo(() => {
    const refK = myKingdom ?? kingdom;
    return marches.filter((m) => m.attackerId === refK.id && m.status === "marching" && (m.phase || "outbound") !== "done").length;
  }, [marches, myKingdom, kingdom]);
  const slots = (myKingdom ?? kingdom).marchSlots ?? marchSlotsForLevel((myKingdom ?? kingdom).cityHallLevel);

  return (
    <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md text-slate-200 select-none overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold font-medieval hover:bg-slate-800/60 transition"
      >
        <span className="flex items-center gap-1.5">
          <span>🗺️ City Directory • {total} buildings</span>
          {kingdom.burning && <span title="City walls are burning (≤25% HP)">🔥</span>}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div className="flex rounded-lg bg-slate-950/80 p-0.5 border border-slate-800 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setTab("buildings")}
              className={`flex-1 py-1 rounded-md transition ${
                tab === "buildings" ? "bg-slate-800 text-amber-300 shadow" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🏛️ Buildings ({total})
            </button>
            <button
              type="button"
              onClick={() => setTab("marches")}
              className={`flex-1 py-1 rounded-md transition ${
                tab === "marches" ? "bg-slate-800 text-amber-300 shadow" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🚩 Marches ({activeMarchCount}/{slots})
            </button>
          </div>

          {/* Wall defence & health strip */}
          <div
            className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-mono ${
              kingdom.burning ? "border-orange-500/50 bg-orange-950/40 text-orange-200" : "border-slate-800 bg-slate-950/60 text-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                🧱 {WALL_TIER_NAMES[wallTier] ?? "Walls"} (T{wallTier})
              </span>
              <span className="text-amber-300 font-bold">DEF ×{wallDefMult.toFixed(2)}{wallDamageCutText(wallTier)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-slate-400">
              <span>
                {kingdom.fog ? `Walls look ${kingdom.fog.wall} (fog of war)` : `HP ${wallHp.toLocaleString()} / ${wallMaxHp.toLocaleString()}`}
              </span>
              {kingdom.burning && <span className="text-orange-300 font-bold">🔥 BURNING</span>}
            </div>
          </div>

          {tab === "buildings" ? (
            <>
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-950/80 border border-slate-700 rounded-lg">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a repository…"
                  className="flex-1 bg-transparent text-xs font-mono outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="max-h-[34vh] overflow-y-auto space-y-2 pr-1">
                {groups.length === 0 && <div className="text-[11px] text-slate-500 text-center py-2">No buildings match.</div>}
                {groups.map((g) => {
                  const meta = BUILDING_TYPE_META[g.type];
                  return (
                    <div key={g.type}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${meta.color}`}>
                        {meta.icon} {meta.label} ({g.buildings.length})
                      </div>
                      {g.buildings.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => onFocusBuilding(b.id)}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-left text-[11px] font-mono hover:bg-slate-800 transition"
                        >
                          <span className={`truncate ${b.condition === "idle" ? "text-slate-500" : "text-slate-200"}`}>
                            {b.condition === "idle" && "💤 "}
                            {b.name}
                          </span>
                          <span className="shrink-0 text-amber-300">
                            Lv.{b.level}
                            {" "}<PrestigeStars building={b} />
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onOpenImprovements}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold transition"
                  title={isOwner ? "Spend resources on city improvements" : "See this city's improvements"}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  Improvements
                </button>
              </div>
            </>
          ) : (
            <div className="max-h-[40vh] overflow-y-auto -mx-2">
              <MarchQueue
                variant="embedded"
                myKingdom={myKingdom ?? kingdom}
                marches={marches}
                onRefresh={() => onRefreshMarches?.()}
                onOpenWarRoom={onOpenWarRoom}
                rallies={rallies}
                onJoinRally={onJoinRally}
                onCancelRally={onCancelRally}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
