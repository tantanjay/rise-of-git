import { useCallback, useEffect, useState } from "react";
import { marchForceText } from "@/utils/mercenaries";
import { UniqueTraitCard } from "./UniqueTraitCard";
import { ArmoryPanel } from "./ArmoryPanel";
import { ChampionPanel } from "./ChampionPanel";
import { MoonwellWard } from "./MoonwellWard";
import { MercenaryBandsPanel } from "./MercenaryCampModal";
import { traitModifiers } from "@/utils/civLore";
import { Modal } from "./Modal";
import { FogNotice, ScoutIntel } from "./ScoutIntel";
import { DeveloperKingdom, AuthUser, PopulationLedgerEntry, SCARCE_RESOURCES, CivPlacesResponse, ActiveMarch } from "@/types";
import {
  CIV_DEMOGRAPHICS,
  CIV_MODIFIERS,
  CIV_SOLDIER_SHARE,
  WALL_TIER_NAMES,
  effectiveUnit,
  MOBILIZATION_COST,
  SOLDIER_FOOD_UPKEEP,
  SUMMON_COST,
  estimateNaturalBirths,
  estimateNaturalDeaths,
  estimateVoidWellRespawn,
  maxSoldiersFor,
  marchSlotsForLevel,
  marchCapacityFor,
  wallDefMultForTier
} from "@/utils/civDemographics";
import { castleStage } from "@/utils/castle";
import { CIV_EMBLEM, stationedAt } from "@/utils/war";
import { DecreeChips } from "./DecreeChips";
import { formatCompact } from "@/utils/format";
import { sound } from "@/hooks/useSound";
import { API_BASE } from "@/config";
import { Landmark, Users, History, ShieldCheck, Swords, RefreshCw, Sparkles, Shield, Flame, ArrowLeftRight, Hammer, Tent, Crown } from "lucide-react";

export type KingdomTab = "overview" | "army" | "armory" | "mercenaries" | "champion" | "census";

interface KingdomModalProps {
  open: boolean;
  onClose: () => void;
  kingdom: DeveloperKingdom | null;
  me: AuthUser | null;
  initialTab?: KingdomTab;
  onMobilize?: (kingdomId: string, soldiers: number) => Promise<{ success: boolean; error?: string }>;
  /** Nethergarde only: summon void constructs with resources */
  onSummon?: (kingdomId: string, count: number) => Promise<{ success: boolean; error?: string }>;
  onFetchPopLedger?: (userId: string) => Promise<PopulationLedgerEntry[]>;
  onChangeCivilization?: (kingdomId: string, civilization: DeveloperKingdom["civilization"]) => Promise<{ success: boolean; error?: string }>;
  /** Marches on the map, for the Defence section (reinforcements here / own troops stationed elsewhere) */
  activeMarches?: ActiveMarch[];
  onSendHome?: (marchId: string) => Promise<{ success: boolean; error?: string }>;
  onRecall?: (marchId: string) => Promise<{ success: boolean; error?: string }>;
  /** 🌙 Elves: pay to hasten every wounded soldier home from the Moonwell */
  onHastenWounded?: (kingdomId: string) => Promise<{ success: boolean; error?: string }>;
}

const TABS: Array<{ id: KingdomTab; label: string; icon: typeof Landmark }> = [
  { id: "overview", label: "Realm", icon: Landmark },
  { id: "army", label: "Population & Army", icon: Users },
  { id: "armory", label: "Armory", icon: Hammer },
  { id: "mercenaries", label: "Mercenaries", icon: Tent },
  { id: "champion", label: "Champion", icon: Crown },
  { id: "census", label: "Census", icon: History }
];
/** Tabs only a kingdom's own ruler sees (what they forge, hire and lead) */
const OWNER_TABS = new Set<KingdomTab>(["armory", "mercenaries", "champion"]);

/** Share presets for the garrison slider (of the soldiers that can be at home) */
const GARRISON_PRESETS = [0, 0.25, 0.5, 0.75, 1];
/** Shares of the free room offered as summon sizes */
const SUMMON_PRESETS = [0.1, 0.25, 0.5, 1];

type Cost = Partial<Record<"gold" | "iron" | "stone" | "lumber" | "food", number>>;
const COST_ICON: Record<string, string> = { gold: "🪙", iron: "⚙️", stone: "🪨", lumber: "🪵", food: "🌾" };
const costFor = (unit: Cost, n: number) => Object.entries(unit).map(([k, v]) => [k, (v ?? 0) * n] as const);
const formatCost = (unit: Cost, n: number) => costFor(unit, n).map(([k, v]) => `${COST_ICON[k]} ${v.toLocaleString()}`).join(" · ");
const affordable = (unit: Cost, res: DeveloperKingdom["resources"] | undefined) =>
  Math.min(...Object.entries(unit).map(([k, v]) => Math.floor(((res?.[k as keyof Cost] as number | undefined) ?? 0) / Math.max(1, v ?? 1))));

const LEDGER_BADGE: Record<string, { label: string; cls: string }> = {
  genesis: { label: "Genesis", cls: "bg-blue-950 text-blue-300 border-blue-800" },
  harvest_growth: { label: "Harvest", cls: "bg-emerald-950 text-emerald-300 border-emerald-800" },
  mobilization: { label: "Mobilize", cls: "bg-amber-950 text-amber-300 border-amber-800" },
  demobilization: { label: "Demobilize", cls: "bg-slate-800 text-slate-300 border-slate-700" },
  settlers: { label: "Settlers", cls: "bg-lime-950 text-lime-300 border-lime-800" },
  battle: { label: "Battle", cls: "bg-red-950 text-red-300 border-red-800" },
  civ_swap: { label: "Civ swap", cls: "bg-purple-950 text-purple-300 border-purple-800" },
  healed: { label: "Healed", cls: "bg-indigo-950 text-indigo-300 border-indigo-800" }
};

const Stat = ({ label, value, sub, color = "text-slate-100" }: { label: string; value: string; sub?: string; color?: string }) => (
  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
    <div className="text-[10px] text-slate-400 uppercase">{label}</div>
    <div className={`text-sm font-bold ${color}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
  </div>
);

/** Game information about a kingdom (the developer's Git activity lives in DevProfileModal) */
export function KingdomModal({ open, onClose, kingdom, me, initialTab = "army", onMobilize, onSummon, onFetchPopLedger, onChangeCivilization, activeMarches = [], onSendHome, onRecall, onHastenWounded }: KingdomModalProps) {
  const [tab, setTab] = useState<KingdomTab>(initialTab);
  const [assigned, setAssigned] = useState(kingdom?.soldiers ?? 0);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [ledger, setLedger] = useState<PopulationLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [summonCount, setSummonCount] = useState(0);
  const [civPlaces, setCivPlaces] = useState<CivPlacesResponse | null>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    setAssigned(kingdom?.soldiers ?? 0);
    setStatus(null);
  }, [kingdom?.id, kingdom?.soldiers]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`${API_BASE}/civ-places`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setCivPlaces(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, kingdom?.civilization]);

  const kingdomId = kingdom?.id;
  const loadLedger = useCallback(async () => {
    if (!kingdomId || !onFetchPopLedger) return;
    setLedgerLoading(true);
    try {
      setLedger(await onFetchPopLedger(kingdomId));
    } finally {
      setLedgerLoading(false);
    }
  }, [kingdomId, onFetchPopLedger]);

  // Another civilization's census is hidden by the fog of war
  const fogged = Boolean(kingdom?.fog);
  useEffect(() => {
    if (open && tab === "census" && !fogged) loadLedger();
  }, [open, tab, fogged, loadLedger]);

  if (!open || !kingdom) return null;

  const isOwner = Boolean(me && me.id === kingdom.id);
  const civ = CIV_DEMOGRAPHICS[kingdom.civilization] ?? CIV_DEMOGRAPHICS.human;
  const pop = kingdom.population ?? 0;
  const maxPop = Math.max(1, kingdom.maxPopulation ?? pop);
  const away = kingdom.deployedSoldiers ?? 0;
  // 🌙 Elves healing at the Moonwell: soldiers who keep their place, but neither work nor fight until healed
  const wounded = kingdom.wounded?.count ?? 0;
  // Civilians out gathering in safe territory: not soldiers, but they don't work (or die of age) until home
  const gathering = kingdom.civiliansAway ?? 0;
  const maxTotalSoldiers = kingdom.maxSoldiers ?? maxSoldiersFor(pop, kingdom.civilization);
  // Never below the garrison already home: after a battle an elf's wounded can leave it above the cap (it can't grow, only shrink)
  const maxHome = Math.max(kingdom.soldiers ?? 0, Math.min(pop - away - wounded - gathering, maxTotalSoldiers - away - wounded));
  const home = Math.min(maxHome, isOwner ? assigned : kingdom.soldiers ?? 0);
  const civilians = Math.max(0, pop - home - away - wounded - gathering);
  const saturation = Math.min(1, pop / maxPop);
  const births = Math.min(Math.max(0, maxPop - pop), estimateNaturalBirths(pop, kingdom.civilization, saturation));
  const respawns = estimateVoidWellRespawn(kingdom.voidWell ?? 0, maxPop - pop - births);
  const deaths = estimateNaturalDeaths(pop, kingdom.civilization, saturation, civilians);
  const isArcane = kingdom.civilization === "arcane";
  const room = Math.max(0, maxPop - pop);
  const maxSummon = Math.min(room, affordable(SUMMON_COST, kingdom.resources));
  const newRecruits = Math.max(0, home - (kingdom.soldiers ?? 0));
  const canArm = newRecruits <= affordable(MOBILIZATION_COST, kingdom.resources);
  const upkeep = home * SOLDIER_FOOD_UPKEEP;
  const food = kingdom.resources?.food ?? 0;

  const wallTier = kingdom.wallTier ?? kingdom.upgrades?.walls ?? 0;
  const wallDefMult = kingdom.wallDefMult ?? wallDefMultForTier(wallTier);
  const wallHp = kingdom.wallHp ?? 0;
  const wallMaxHp = kingdom.wallMaxHp ?? 1000;
  const isBurning = Boolean(kingdom.burning);
  const marchSlots = kingdom.marchSlots ?? marchSlotsForLevel(kingdom.cityHallLevel || 1);
  const marchCap = kingdom.marchCapacity ?? marchCapacityFor(maxPop, kingdom.civilization);
  const soldierSharePct = Math.round((CIV_SOLDIER_SHARE[kingdom.civilization] ?? 0.65) * 100);

  const summon = async () => {
    if (!onSummon || summonCount <= 0) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const res = await onSummon(kingdom.id, summonCount);
      if (res.success) {
        setStatus({ type: "success", text: `The ritual answers: ${summonCount.toLocaleString()} void constructs join your people.` });
        setSummonCount(0);
        sound.playLevelUp();
      } else {
        setStatus({ type: "error", text: res.error || "The ritual failed." });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const apply = async () => {
    if (!onMobilize) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const res = await onMobilize(kingdom.id, home);
      if (res.success) {
        setStatus({ type: "success", text: `Home garrison set to ${home.toLocaleString()} soldiers.` });
        sound.playLevelUp();
      } else {
        setStatus({ type: "error", text: res.error || "Failed to update the garrison." });
      }
    } catch (err: any) {
      setStatus({ type: "error", text: err.message || "Network error" });
    } finally {
      setIsSaving(false);
    }
  };

  const realignCiv = async (newCiv: DeveloperKingdom["civilization"]) => {
    if (!onChangeCivilization || newCiv === kingdom.civilization) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const res = await onChangeCivilization(kingdom.id, newCiv);
      if (res.success) {
        setStatus({ type: "success", text: `Your realm has realigned to ${CIV_DEMOGRAPHICS[newCiv].name}.` });
        sound.playLevelUp();
      } else {
        setStatus({ type: "error", text: res.error || "Realignment blocked." });
      }
    } catch (err: any) {
      setStatus({ type: "error", text: err.message || "Network error" });
    } finally {
      setIsSaving(false);
    }
  };

  const res = kingdom.resources;
  const gems = Object.entries(res?.scarce ?? {}).filter(([, v]) => v > 0);

  return (
    <Modal
      open
      onClose={onClose}
      accentBorder="border-amber-500/60"
      headerClassName="bg-linear-to-b from-amber-950 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <span className="text-3xl w-12 h-12 shrink-0 rounded-xl bg-amber-950/80 border border-amber-500/60 flex items-center justify-center">{CIV_EMBLEM[kingdom.civilization]}</span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold font-medieval text-amber-200 tracking-wide truncate">{kingdom.kingdomTitle}</h3>
            <p className="text-xs text-slate-400 font-mono truncate">
              {kingdom.name} · {civ.name} · {civ.archetype}
            </p>
            <DecreeChips kingdom={kingdom} className="mt-1" />
          </div>
        </div>
      }
      footer={
        tab === "army" && isOwner ? (
          <div className="flex items-center justify-between gap-3 w-full">
            <span className="text-xs text-slate-400 font-mono">
              {civilians.toLocaleString()} civilians · {home.toLocaleString()} home{away ? ` · ${away.toLocaleString()} marching` : ""}{gathering ? ` · ${gathering.toLocaleString()} gathering or scouting` : ""}{wounded ? ` · ${wounded.toLocaleString()} wounded` : ""}
            </span>
            <button
              onClick={apply}
              disabled={isSaving || home === (kingdom.soldiers ?? 0) || !canArm}
              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 disabled:opacity-40"
            >
              <ShieldCheck className="w-4 h-4" />
              {isSaving ? "Saving…" : "Apply garrison"}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="sticky top-0 z-10 flex gap-4 px-4 pt-2.5 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-xs font-mono overflow-x-auto whitespace-nowrap">
        {TABS.filter((t) => (!kingdom.fog || t.id === "overview") && (isOwner || !OWNER_TABS.has(t.id))).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-2 flex items-center gap-1.5 font-bold border-b-2 transition ${tab === t.id ? "border-amber-400 text-amber-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3 text-xs font-mono">
        {/* Another civilization: population, army and treasury are unknown until scouted (fog of war) */}
        {kingdom.fog && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="City Hall" value={`Level ${kingdom.cityHallLevel}`} sub={`${castleStage(kingdom.cityHallLevel).name} castle`} color="text-amber-300" />
              <Stat label="City Walls" value={`Tier ${wallTier} (×${wallDefMult.toFixed(2)})`} sub={isBurning ? "🔥 burning" : `walls ${kingdom.fog.wall}`} color={isBurning ? "text-orange-400" : "text-sky-300"} />
            </div>
            {kingdom.fog.report ? (
              <ScoutIntel report={kingdom.fog.report} />
            ) : (
              <FogNotice
                lines={[
                  ["Population", "?"],
                  ["Garrison", "?"],
                  ["Treasury", "?"]
                ]}
              />
            )}
          </>
        )}
        {!kingdom.fog && tab === "overview" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="City Hall" value={`Level ${kingdom.cityHallLevel}`} sub={`${castleStage(kingdom.cityHallLevel).name} castle`} color="text-amber-300" />
              <Stat label="City Walls" value={`Tier ${wallTier} (×${wallDefMult.toFixed(2)})`} sub={`${WALL_TIER_NAMES[wallTier] ?? "Unwalled"}`} color={isBurning ? "text-orange-400" : "text-sky-300"} />
              <Stat label="Population" value={`${formatCompact(pop)} / ${formatCompact(maxPop)}`} sub={`${(saturation * 100).toFixed(0)}% of capacity`} color="text-emerald-300" />
              <Stat label="Marches" value={`${marchSlots} slots · ${formatCompact(marchCap)}`} sub={`max ${soldierSharePct}% soldiers`} color="text-rose-300" />
            </div>

            {/* Wall Health & Vault */}
            <div className={`p-3 rounded-xl border space-y-1.5 ${isBurning ? "bg-orange-950/25 border-orange-500/40" : "bg-slate-950/70 border-slate-800"}`}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  {isBurning ? <Flame className="w-3.5 h-3.5 text-orange-400" /> : <Shield className="w-3.5 h-3.5 text-sky-400" />}
                  Wall Integrity {isBurning ? "· 🔥 BURNING (≤25% HP — Protected from attacks)" : ""}
                </span>
                <span className={isBurning ? "text-orange-300 font-bold" : "text-emerald-300 font-bold"}>
                  {wallHp.toLocaleString()} / {wallMaxHp.toLocaleString()} HP
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                <div
                  className={`h-full ${isBurning ? "bg-linear-to-r from-red-600 to-orange-400" : "bg-linear-to-r from-emerald-500 to-sky-400"}`}
                  style={{ width: `${Math.min(100, Math.max(0, (wallHp / Math.max(1, wallMaxHp)) * 100))}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500">
                Protected vault: <strong className="text-slate-300">{((kingdom.cityHallLevel || 1) * 1500).toLocaleString()}</strong> of each basic resource cannot be plundered.
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="text-[11px] text-slate-400 uppercase font-bold">Treasury</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ["🪙", "Gold", res?.gold],
                  ["⚙️", "Iron", res?.iron],
                  ["🪨", "Stone", res?.stone],
                  ["🪵", "Lumber", res?.lumber],
                  ["🌾", "Food", res?.food]
                ].map(([icon, label, v]) => (
                  <span key={label as string} className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-200" title={`${label}: ${(v as number | undefined ?? 0).toLocaleString()}`}>
                    {icon} {formatCompact((v as number | undefined) ?? 0)}
                  </span>
                ))}
                {gems.map(([k, v]) => {
                  const def = SCARCE_RESOURCES.find((r) => r.key === k);
                  return (
                    <span key={k} className="px-2 py-1 rounded-lg bg-purple-950/60 border border-purple-700/50 text-purple-200" title={def?.description}>
                      {def?.emblem ?? "💎"} {v} {def?.name ?? k}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300">
                  {civ.name} · {civ.archetype}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Lifespan</span>
                  <span className="text-slate-200 text-right">{civ.lifespanDescription}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Birth factor</span>
                  <span className="text-emerald-300">{(civ.birthFactor * 100).toFixed(1)}% / harvest</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">March speed</span>
                  <span className="text-slate-200">{civ.marchSpeedDesc}</span>
                </div>
                <div className="text-slate-400">{civ.civilianYieldDesc}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5 text-rose-400" /> {civ.soldierUnit.name}
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  {(["hp", "atk", "def"] as const).map((key) => {
                    const base = civ.soldierUnit[key];
                    const eff = effectiveUnit(kingdom.civilization)[key];
                    const color = eff > base ? "text-emerald-300" : eff < base ? "text-rose-300" : "text-slate-100";
                    return <Stat key={key} label={key.toUpperCase()} value={`${eff}`} sub={eff !== base ? `base ${base}` : undefined} color={color} />;
                  })}
                </div>
                <div className="flex items-start gap-1.5 text-slate-300">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-amber-200">{civ.soldierUnit.trait}:</strong> {civ.soldierUnit.traitDesc}
                  </span>
                </div>
                {/* The civ's Unique Trait: the legend behind its standing buffs and debuffs */}
                <UniqueTraitCard civ={kingdom.civilization} compact />
                <div className="flex flex-wrap gap-1.5">
                  {CIV_MODIFIERS[kingdom.civilization].length === 0 && <span className="text-[10px] text-slate-500">No standing buffs or debuffs.</span>}
                  {traitModifiers(kingdom.civilization).map((m) => (
                    <span
                      key={m.id}
                      title={m.lore ? `${m.description}
${m.lore}` : m.description}
                      className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                        m.kind === "buff" ? "bg-emerald-950/70 border-emerald-600/60 text-emerald-300" : "bg-rose-950/70 border-rose-600/60 text-rose-300"
                      }`}
                    >
                      {m.kind === "buff" ? "▲" : "▼"} {m.name} · {m.description}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Unilateral Civilization Realignment into Open Places */}
            {isOwner && !isArcane && civPlaces && onChangeCivilization && (
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-300 uppercase font-bold flex items-center gap-1.5">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" /> Province Places & Realignment
                  </span>
                  <span className="text-[10px] text-slate-500">Unilateral move requires an open place & no War Frenzy</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.values(civPlaces.places)
                    .filter((p) => p.civ !== "arcane")
                    .map((p) => {
                      const isCurrent = p.civ === kingdom.civilization;
                      const inFrenzy = civPlaces.frenzyPairs.some(
                        (f) => (f.civA === kingdom.civilization && f.civB === p.civ) || (f.civB === kingdom.civilization && f.civA === p.civ)
                      );
                      const canMove = !isCurrent && p.open > 0 && !inFrenzy && !isBurning && away === 0 && !isSaving;
                      return (
                        <button
                          key={p.civ}
                          type="button"
                          disabled={!canMove}
                          onClick={() => realignCiv(p.civ)}
                          className={`p-2 rounded-lg border text-left transition ${
                            isCurrent
                              ? "border-amber-500/60 bg-amber-950/30"
                              : canMove
                                ? "border-sky-500/50 bg-sky-950/20 hover:bg-sky-900/30"
                                : "border-slate-800 bg-slate-900/50 opacity-60 cursor-not-allowed"
                          }`}
                        >
                          <div className="font-bold text-slate-200 flex items-center justify-between">
                            <span>
                              {CIV_EMBLEM[p.civ]} {CIV_DEMOGRAPHICS[p.civ].name.split(" ")[0]}
                            </span>
                            {isCurrent && <span className="text-[9px] text-amber-300">YOU</span>}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {p.occupied}/{p.places} occupied · <strong className={p.open > 0 ? "text-emerald-300" : "text-slate-500"}>{p.open} open</strong>
                          </div>
                          {inFrenzy && <div className="text-[9px] text-rose-400 font-bold mt-0.5">⚔️ War Frenzy</div>}
                        </button>
                      );
                    })}
                </div>
                {status && (
                  <div className={`p-2 rounded-lg border text-[11px] ${status.type === "success" ? "bg-emerald-950/80 text-emerald-300 border-emerald-800" : "bg-red-950/80 text-red-300 border-red-800"}`}>
                    {status.text}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!kingdom.fog && tab === "army" && (
          <>
            <DefenceSection kingdom={kingdom} isOwner={isOwner} viewerId={me?.id} marches={activeMarches} onSendHome={onSendHome} onRecall={onRecall} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Population" value={`${pop.toLocaleString()} / ${maxPop.toLocaleString()}`} color="text-slate-100" />
              <Stat
                label="Next harvest"
                value={isArcane ? `+${respawns} returning` : `+${births} / −${deaths}`}
                sub={isArcane ? `${(kingdom.voidWell ?? 0).toLocaleString()} in the Void Well` : "births / deaths"}
                color={births + respawns >= deaths ? "text-emerald-300" : "text-rose-300"}
              />
              <Stat label="Soldier Cap" value={`${maxTotalSoldiers.toLocaleString()} max`} sub={`${soldierSharePct}% of population`} color="text-sky-300" />
              <Stat label="Garrison upkeep" value={`−${upkeep.toLocaleString()} 🌾`} sub={`${SOLDIER_FOOD_UPKEEP} food / soldier at home`} color={food >= upkeep ? "text-amber-300" : "text-rose-400"} />
            </div>

            {/* Who is who: civilians, home garrison, soldiers away */}
            <div className="space-y-1">
              <div className="h-3 rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex" title="Civilians · home garrison · marching · empty room">
                <div className="h-full bg-amber-400/80" style={{ width: `${(civilians / maxPop) * 100}%` }} />
                <div className="h-full bg-rose-500" style={{ width: `${(home / maxPop) * 100}%` }} />
                <div className="h-full bg-rose-300/70" style={{ width: `${(away / maxPop) * 100}%` }} />
                <div className="h-full bg-emerald-400/70" style={{ width: `${(gathering / maxPop) * 100}%` }} />
                <div className="h-full bg-indigo-400/70" style={{ width: `${(wounded / maxPop) * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-3 text-[10px] text-slate-400">
                <span>
                  <span className="text-amber-300">■</span> {civilians.toLocaleString()} civilians
                </span>
                <span>
                  <span className="text-rose-500">■</span> {home.toLocaleString()} home garrison
                </span>
                {away > 0 && (
                  <span>
                    <span className="text-rose-300">■</span> {away.toLocaleString()} marching
                  </span>
                )}
                {gathering > 0 && (
                  <span title="Civilians gathering in your safe territory or out scouting: they don't work at home until they return">
                    <span className="text-emerald-400">■</span> 👷 {gathering.toLocaleString()} gathering or scouting
                  </span>
                )}
                {wounded > 0 && (
                  <span title="Soldiers healing at the Moonwell: they keep their place and rejoin the garrison when healed">
                    <span className="text-indigo-400">■</span> 🌙 {wounded.toLocaleString()} wounded
                  </span>
                )}
                <span className="ml-auto">{Math.max(0, maxPop - pop).toLocaleString()} room to grow</span>
              </div>
            </div>

            <MoonwellWard kingdom={kingdom} isOwner={isOwner} onHasten={onHastenWounded} />

            {away > 0 && (
              <p className="p-2 rounded-lg bg-red-950/40 border border-red-500/40 text-red-200">
                {away.toLocaleString()} soldiers are away on a march. They can't be reassigned until they return (the dead never do).
              </p>
            )}

            {isOwner ? (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/15 space-y-2">
                <div className="flex justify-between">
                  <span className="font-bold text-amber-300">Home garrison</span>
                  <span className="text-slate-300">
                    <strong className="text-rose-300">{home.toLocaleString()}</strong> of {maxHome.toLocaleString()} max at home ({soldierSharePct}% civ cap)
                  </span>
                </div>
                <input type="range" min={0} max={maxHome} value={home} onChange={(e) => setAssigned(Number(e.target.value))} className="w-full accent-amber-400" disabled={maxHome === 0} />
                <div className="flex gap-1.5 flex-wrap">
                  {GARRISON_PRESETS.map((share) => (
                    <button
                      key={share}
                      type="button"
                      onClick={() => setAssigned(Math.round(maxHome * share))}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold"
                    >
                      {share === 0 ? "All civilians" : share === 1 ? "Max soldiers" : `${share * 100}%`}
                    </button>
                  ))}
                </div>
                {newRecruits > 0 && (
                  <p className={`text-[11px] ${canArm ? "text-amber-200" : "text-rose-300"}`}>
                    Arming {newRecruits.toLocaleString()} recruits costs {formatCost(MOBILIZATION_COST, newRecruits)}
                    {!canArm && " — not enough in the treasury"}
                  </p>
                )}
                <p className="text-[10px] text-slate-500">
                  Arming a civilian costs {formatCost(MOBILIZATION_COST, 1)}; sending soldiers home is free. Civilians work and die of age; soldiers eat {SOLDIER_FOOD_UPKEEP} food per harvest, guard
                  the walls and march to war. A famine makes 10% desert each harvest and halves the garrison's armor.
                </p>
              </div>
            ) : null}


            {/* Nethergarde doesn't breed: it summons */}
            {isOwner && isArcane ? (
              <div className="p-3 rounded-xl border border-purple-500/40 bg-purple-950/20 space-y-2">
                <div className="flex justify-between">
                  <span className="font-bold text-purple-300">🔮 Void ritual</span>
                  <span className="text-slate-300">
                    {room.toLocaleString()} room · {formatCost(SUMMON_COST, 1)} each
                  </span>
                </div>
                <input type="range" min={0} max={maxSummon} value={Math.min(summonCount, maxSummon)} onChange={(e) => setSummonCount(Number(e.target.value))} className="w-full accent-purple-400" disabled={maxSummon === 0} />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {SUMMON_PRESETS.map((share) => (
                    <button
                      key={share}
                      type="button"
                      onClick={() => setSummonCount(Math.min(maxSummon, Math.round(room * share)))}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold"
                    >
                      {share === 1 ? "Fill" : `${share * 100}% of room`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={summon}
                    disabled={isSaving || summonCount <= 0}
                    className="ml-auto px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold disabled:opacity-40"
                  >
                    Summon {summonCount.toLocaleString()} {summonCount > 0 && `(${formatCost(SUMMON_COST, summonCount)})`}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Constructs never die of age. Soldiers that fall defending your citadel sink into the Void Well and about 10% of them return every harvest.
                </p>
              </div>
            ) : null}
            {!isOwner && (
              <p className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-400">Only the ruler of this kingdom can change its garrison.</p>
            )}

            {status && (
              <div className={`p-2.5 rounded-lg border ${status.type === "success" ? "bg-emerald-950/80 text-emerald-300 border-emerald-800" : "bg-red-950/80 text-red-300 border-red-800"}`}>
                {status.text}
              </div>
            )}
          </>
        )}

        {/* 🗡️ The Armory: forged sets for the marches and the garrison */}
        {!kingdom.fog && isOwner && tab === "armory" && <ArmoryPanel kingdom={kingdom} />}

        {/* 🪙 The ruler's mercenary bands */}
        {!kingdom.fog && isOwner && tab === "mercenaries" && <MercenaryBandsPanel />}

        {/* 🦸 The kingdom's champion: how it looks, its level, kit, wounds and Renown */}
        {!kingdom.fog && isOwner && tab === "champion" && <ChampionPanel kingdom={kingdom} portrait />}

        {!kingdom.fog && tab === "census" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Births, deaths, mobilizations, battles and civilization swaps</span>
              <button onClick={loadLedger} disabled={ledgerLoading} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]">
                <RefreshCw className={`w-3 h-3 ${ledgerLoading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
            {ledger.length === 0 ? (
              <p className="p-6 text-center text-slate-500 bg-slate-900/40 rounded-lg border border-slate-800">{ledgerLoading ? "Loading…" : "No census entries yet — they are written every harvest."}</p>
            ) : (
              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-slate-900">
                    <tr className="text-slate-400 text-[10px]">
                      <th className="py-1.5 px-2">Time</th>
                      <th className="py-1.5 px-2">Event</th>
                      <th className="py-1.5 px-2">Reason</th>
                      <th className="py-1.5 px-2 text-right">Pop Δ</th>
                      <th className="py-1.5 px-2 text-right">Soldiers Δ</th>
                      <th className="py-1.5 px-2 text-right">Pop</th>
                      <th className="py-1.5 px-2 text-right">Soldiers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {ledger.map((e) => {
                      const badge = LEDGER_BADGE[e.type] ?? { label: e.type, cls: "bg-slate-800 text-slate-300 border-slate-700" };
                      const delta = (n: number, pos: string) => (n > 0 ? <span className={pos}>+{n}</span> : n < 0 ? <span className="text-red-400">{n}</span> : <span className="text-slate-600">0</span>);
                      return (
                        <tr key={e.id} className="hover:bg-slate-900/50">
                          <td className="py-1.5 px-2 text-slate-400 whitespace-nowrap">{new Date(e.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="py-1.5 px-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${badge.cls}`}>{badge.label}</span>
                          </td>
                          <td className="py-1.5 px-2 text-slate-300 max-w-xs truncate" title={e.reason}>
                            {e.reason}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold">{delta(e.populationDelta, "text-emerald-400")}</td>
                          <td className="py-1.5 px-2 text-right font-bold">{delta(e.soldiersDelta, "text-sky-400")}</td>
                          <td className="py-1.5 px-2 text-right text-slate-200">{e.populationBalance.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-right text-rose-300">{e.soldiersBalance.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Defence: allies' troops on these walls, and this kingdom's troops on allies' walls */
function DefenceSection({
  kingdom,
  isOwner,
  viewerId,
  marches,
  onSendHome,
  onRecall
}: {
  kingdom: DeveloperKingdom;
  isOwner: boolean;
  viewerId?: string | null;
  marches: ActiveMarch[];
  onSendHome?: (marchId: string) => Promise<{ success: boolean; error?: string }>;
  onRecall?: (marchId: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stationed = (m: ActiveMarch) => m.kind === "reinforce" && m.phase === "stationed" && m.status === "marching" && !m.fogged;
  const here = marches.filter((m) => stationed(m) && m.targetId === kingdom.id);
  const away = marches.filter((m) => stationed(m) && m.attackerId === kingdom.id);
  if (here.length === 0 && away.length === 0) return null;
  const act = async (id: string, fn?: (id: string) => Promise<{ success: boolean; error?: string }>) => {
    if (!fn) return;
    setBusy(id);
    setError(null);
    const res = await fn(id);
    if (!res.success) setError(res.error || "Failed");
    setBusy(null);
  };
  const s = stationedAt(marches, kingdom.id, viewerId);
  const split = s.yours > 0 && s.allies > 0 ? ` — yours ${s.yours.toLocaleString()}, allies ${s.allies.toLocaleString()}` : s.yours > 0 ? " — all yours" : "";
  return (
    <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-950/20 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap font-bold text-indigo-200">
        <span>🛡️ Defence</span>
        {here.length > 0 && (
          <span className="text-[11px] font-mono text-indigo-300">
            Reinforcements: {s.total.toLocaleString()}
            {split}
          </span>
        )}
      </div>
      {here.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-200 truncate">
            {CIV_EMBLEM[m.attackerCiv]} {m.attackerId === viewerId ? `${m.attackerName} (you)` : m.attackerName} · {m.soldiersCount.toLocaleString()} {CIV_DEMOGRAPHICS[m.attackerCiv].soldierUnit.name}s
          </span>
          {isOwner && onSendHome && (
            <button
              type="button"
              disabled={busy === m.id}
              onClick={() => act(m.id, onSendHome)}
              className="shrink-0 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold disabled:opacity-40"
            >
              Send home
            </button>
          )}
        </div>
      ))}
      {away.length > 0 && <div className="text-[10px] uppercase tracking-wider text-slate-400 pt-1">Your troops guarding allies</div>}
      {away.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-200 truncate">
            {marchForceText(m)} at {m.targetName}
          </span>
          {isOwner && onRecall && (
            <button
              type="button"
              disabled={busy === m.id}
              onClick={() => act(m.id, onRecall)}
              className="shrink-0 px-2 py-0.5 rounded bg-rose-900/60 hover:bg-rose-800 border border-rose-500/50 text-rose-100 font-bold disabled:opacity-40"
            >
              Recall
            </button>
          )}
        </div>
      ))}
      <p className="text-[10px] text-slate-500">Allied troops fight in every defence of this castle with their own civilization's stats and these walls, and eat from their own ruler's granary.</p>
      {error && <p className="text-[10px] text-rose-300">{error}</p>}
    </div>
  );
}
