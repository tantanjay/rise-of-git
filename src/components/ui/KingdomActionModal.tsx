import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { DeveloperKingdom, AuthUser, CivSwapProposal, CivPlacesResponse, ActiveMarch } from "@/types";
import { API_BASE } from "@/config";
import { timeLeftLabel } from "@/utils/format";
import { useNow } from "./RoyalProclamations";
import { CIV_DEMOGRAPHICS, getMaxPopulation } from "@/utils/civDemographics";
import { castleStage } from "@/utils/castle";
import { CIV_EMBLEM } from "@/utils/war";
import { formatCompact } from "@/utils/format";
import { fogHint, fogRange, fogText, fogTreasury } from "@/utils/fog";
import { sound } from "@/hooks/useSound";
import { CombatBanner } from "./CombatBanner";
import { StationedTroops } from "./StationedTroops";
import { DecreeChips, activeShield } from "./DecreeChips";
import { ArchonSeal } from "./CivFrame";
import { Swords, Truck, ArrowLeftRight, Castle, User, Shield, Crown, Flame, Send, Landmark, Eye } from "lucide-react";

type CaravanKey = "food" | "wood" | "stone" | "iron" | "gold";

interface KingdomActionModalProps {
  kingdom: DeveloperKingdom | null;
  currentKingdom: DeveloperKingdom | null;
  me: AuthUser | null;
  onClose: () => void;
  onEnterCity: (id: string) => void;
  onOpenDevProfile: (k: DeveloperKingdom) => void;
  /** Kingdom (game) info: overview, population & army, census */
  onOpenKingdomInfo: (k: DeveloperKingdom) => void;
  onAttack: (k: DeveloperKingdom) => void;
  /** Send scouts (other civilizations only: own civ is never fogged) */
  onScout?: (k: DeveloperKingdom) => void;
  /** Station troops in an ally's castle (own civilization only) */
  onReinforce?: (k: DeveloperKingdom) => void;
  onSendResources?: (params: { senderId: string; recipientId: string } & Partial<Record<CaravanKey, number>>) => Promise<{ success: boolean; error?: string }>;
  /** Peaceful civilization swaps (mortal kingdoms only) */
  swapProposals?: CivSwapProposal[];
  onProposeSwap?: (fromId: string, targetId: string) => Promise<{ success: boolean; error?: string }>;
  onAnswerSwap?: (proposalId: string, action: "accept" | "decline" | "cancel") => Promise<{ success: boolean; error?: string }>;
  /** A battle is being fought at this kingdom right now */
  combat?: { round: number; maxRounds: number } | null;
  /** Marches on the map: reinforcements stationed here (shown to its own civilization only) */
  activeMarches?: ActiveMarch[];
}

const civProfileName = (civ: DeveloperKingdom["civilization"]) => (CIV_DEMOGRAPHICS[civ] ?? CIV_DEMOGRAPHICS.human).name;

/** Population after a peaceful swap at the same fill ratio (mirrors convertPopulationOnSwap with `peaceful`: no floor, no casualties) */
function convertedPopulation(k: DeveloperKingdom, newCiv: DeveloperKingdom["civilization"]): number {
  const level = k.cityHallLevel || 1;
  const fill = Math.min(1, Math.max(0, (k.population ?? 0) / Math.max(1, getMaxPopulation(level, k.civilization))));
  const newMax = getMaxPopulation(level, newCiv);
  return Math.min(newMax, Math.floor(fill * newMax));
}

/** Caravan rows: request key, sender balance key and display */
const CARAVAN_ROWS: Array<{ key: CaravanKey; resource: "food" | "lumber" | "stone" | "iron" | "gold"; icon: string; label: string; color: string }> = [
  { key: "food", resource: "food", icon: "🌾", label: "Food", color: "text-lime-300" },
  { key: "wood", resource: "lumber", icon: "🪵", label: "Lumber", color: "text-orange-300" },
  { key: "stone", resource: "stone", icon: "🪨", label: "Stone", color: "text-stone-300" },
  { key: "iron", resource: "iron", icon: "⚙️", label: "Iron", color: "text-slate-200" },
  { key: "gold", resource: "gold", icon: "🪙", label: "Gold", color: "text-amber-300" }
];
const CARAVAN_SHARES = [0.25, 0.5, 1] as const;
const EMPTY_CARAVAN: Record<CaravanKey, number> = { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 };

const THEME: Record<DeveloperKingdom["civilization"], { border: string; header: string; tag: string; badge: string }> = {
  human: { border: "border-amber-500/60", header: "from-amber-950", tag: "bg-amber-950/80 text-amber-300 border-amber-600/60", badge: "Human Imperium" },
  elf: { border: "border-emerald-500/60", header: "from-emerald-950", tag: "bg-emerald-950/80 text-emerald-300 border-emerald-600/60", badge: "Elven Sanctuary" },
  dwarf: { border: "border-orange-500/60", header: "from-orange-950", tag: "bg-orange-950/80 text-orange-300 border-orange-600/60", badge: "Dwarven Bastion" },
  orc: { border: "border-red-500/60", header: "from-red-950", tag: "bg-red-950/80 text-red-300 border-red-600/60", badge: "Orcish War Camp" },
  arcane: { border: "border-purple-500/60", header: "from-purple-950", tag: "bg-purple-950/80 text-purple-300 border-purple-600/60", badge: "Voidrift Citadel" }
};

const actionBtn = "flex-1 min-w-[7rem] py-2 px-3 rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5";
const disabledBtn = `${actionBtn} bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed`;

export function KingdomActionModal({
  kingdom,
  currentKingdom,
  me,
  onClose,
  onEnterCity,
  onOpenDevProfile,
  onOpenKingdomInfo,
  onAttack,
  onScout,
  onReinforce,
  onSendResources,
  swapProposals = [],
  onProposeSwap,
  onAnswerSwap,
  combat,
  activeMarches
}: KingdomActionModalProps) {
  const [caravanOpen, setCaravanOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [amounts, setAmounts] = useState<Record<CaravanKey, number>>(EMPTY_CARAVAN);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // A different kingdom: start from a clean form
  useEffect(() => {
    setCaravanOpen(false);
    setSwapOpen(false);
    setAmounts(EMPTY_CARAVAN);
    setStatus(null);
  }, [kingdom?.id]);

  // ⚔️ War Frenzy between the viewer's civilization and this kingdom's (this week's battles)
  const [civPlaces, setCivPlaces] = useState<CivPlacesResponse | null>(null);
  const now = useNow(30_000);
  const myCiv = me && currentKingdom?.id === me.id ? currentKingdom.civilization : null;
  const otherCiv = kingdom && myCiv && kingdom.civilization !== myCiv;
  useEffect(() => {
    if (!otherCiv) return;
    let live = true;
    fetch(`${API_BASE}/civ-places`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setCivPlaces(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [otherCiv, kingdom?.id]);

  if (!kingdom) return null;

  // Peaceful swap: both mortal, different civs, the player's own kingdom on one side
  const mine = me && currentKingdom?.id === me.id ? currentKingdom : null;
  const pendingSwap = mine ? swapProposals.find((p) => p.status === "pending" && ((p.fromId === mine.id && p.toId === kingdom.id) || (p.fromId === kingdom.id && p.toId === mine.id))) : undefined;
  const swapBlocked = !me
    ? "Sign in to propose a swap"
    : !mine || kingdom.id === mine.id
      ? "Your realm"
      : kingdom.civilization === "arcane" || mine.civilization === "arcane"
        ? "Nethergarde can't swap — it's won and lost in war only"
        : kingdom.civilization === mine.civilization
          ? `You are both ${mine.civilization}`
          : null;

  const runSwap = async (fn: () => Promise<{ success: boolean; error?: string }>, ok: string) => {
    setStatus(null);
    const res = await fn();
    setStatus(res.success ? { type: "success", text: ok } : { type: "error", text: res.error || "Failed" });
  };

  const isOwnKingdom = Boolean(me && kingdom.id === me.id);
  const frenzy =
    otherCiv && myCiv
      ? (civPlaces?.frenzyPairs.find((f) => (f.civA === myCiv && f.civB === kingdom.civilization) || (f.civB === myCiv && f.civA === kingdom.civilization)) ?? null)
      : null;
  const isArcane = kingdom.civilization === "arcane";
  const sameCiv = Boolean(currentKingdom && kingdom.civilization === currentKingdom.civilization);
  const isBurning = Boolean(kingdom.burning);
  const myBurning = Boolean(currentKingdom?.burning);
  // 🛡️ Royal Shield: no attacks, rallies or scouts
  const shielded = Boolean(activeShield(kingdom));
  // The Archon of the Realm is untouchable
  const archon = Boolean(kingdom.isArchon);
  // Special Overseers are a loot area for mortals; Nethergarde can't raid its own
  const canAttack = Boolean(me && !isOwnKingdom && currentKingdom && !sameCiv && !isBurning && !myBurning && !shielded && !archon);
  const grudge = kingdom.isSpecial ? kingdom.grudgeStacks ?? 0 : 0;
  const attackDisabledReason = !me
    ? "Sign in to siege"
    : isOwnKingdom
      ? "Your realm"
      : archon
        ? "Untouchable"
        : sameCiv
          ? "Same civilization"
          : shielded
            ? "🛡️ Royal Shield"
            : isBurning
            ? "Burning (protected)"
            : myBurning
              ? "Your city is burning"
              : "Unavailable";

  // Scouting works while burning; own civ and Special Overseers are never fogged
  const canScout = Boolean(me && onScout && !isOwnKingdom && currentKingdom && !sameCiv && !kingdom.isSpecial && !shielded);

  // Reinforcements go to an ally of your civilization; burning castles can't send or receive them
  const canReinforce = Boolean(me && onReinforce && !isOwnKingdom && currentKingdom && sameCiv && !kingdom.isSpecial && !isBurning && !myBurning);

  const canCaravan = Boolean(me && !isOwnKingdom && currentKingdom && sameCiv && !currentKingdom.isSpecial);
  const caravanDisabledReason = !me ? "Sign in to trade" : isOwnKingdom ? "Your treasury" : currentKingdom?.isSpecial ? "Overseers send none" : "Same civ only";

  const theme = THEME[kingdom.civilization] ?? THEME.human;
  const civProfile = CIV_DEMOGRAPHICS[kingdom.civilization] ?? CIV_DEMOGRAPHICS.human;
  const buildingsCount = kingdom.buildings?.length ?? (kingdom as DeveloperKingdom & { buildingCount?: number }).buildingCount ?? 0;
  // Fog of war: other civilizations' numbers are unknown, or projected from the viewer's scout report
  const fog = kingdom.fog;
  const report = fog?.report ?? null;
  const pop = kingdom.population ?? 0;
  const soldiers = kingdom.soldiers ?? 0;
  const away = kingdom.deployedSoldiers ?? 0;
  const wallTier = kingdom.wallTier ?? kingdom.upgrades?.walls ?? 0;
  const wallHp = kingdom.wallHp;
  const wallMaxHp = kingdom.wallMaxHp;

  const senderRes = currentKingdom?.resources;
  const available = (r: (typeof CARAVAN_ROWS)[number]) => senderRes?.[r.resource] ?? 0;
  const total = Object.values(amounts).reduce((a, b) => a + b, 0);
  const setAmount = (key: CaravanKey, value: number, max: number) => setAmounts((a) => ({ ...a, [key]: Math.max(0, Math.min(max, Math.floor(value) || 0)) }));

  const sendCaravan = async () => {
    if (!currentKingdom || !onSendResources || total <= 0) return;
    setIsSending(true);
    setStatus(null);
    try {
      const res = await onSendResources({ senderId: currentKingdom.id, recipientId: kingdom.id, ...amounts });
      if (res.success) {
        setStatus({ type: "success", text: `Caravan of ${total.toLocaleString()} resources is on its way to ${kingdom.name}.` });
        sound.playLevelUp();
        setAmounts(EMPTY_CARAVAN);
      } else {
        setStatus({ type: "error", text: res.error || "Caravan dispatch failed" });
      }
    } catch (err: any) {
      setStatus({ type: "error", text: err.message || "Network error" });
    } finally {
      setIsSending(false);
    }
  };

  const stats: Array<{ label: string; value: string; color: string }> = [
    { label: "🏛️ City Hall", value: `Lv ${kingdom.cityHallLevel || 1} · ${castleStage(kingdom.cityHallLevel || 1).name}`, color: "text-amber-300" },
    {
      label: "🧱 Walls",
      value: `Tier ${wallTier}${fog ? ` · ${fog.wall}` : wallHp !== undefined && wallMaxHp ? ` · ${Math.round((wallHp / wallMaxHp) * 100)}% HP` : ` · ${buildingsCount} structs`}`,
      color: isBurning ? "text-orange-400" : "text-sky-300"
    },
    {
      label: "👥 Population",
      value: fog ? fogText(fogRange(report, "population"), true) : `${formatCompact(pop)} / ${formatCompact(kingdom.maxPopulation ?? 0)}`,
      color: "text-emerald-300"
    },
    {
      label: "🛡️ Army",
      value: fog ? fogText(fogRange(report, "garrison"), true) : `${formatCompact(soldiers)}${away ? ` (+${formatCompact(away)} away)` : ""}`,
      color: "text-rose-300"
    }
  ];

  return (
    <Modal
      open
      onClose={onClose}
      accentBorder={theme.border}
      headerClassName={`bg-linear-to-b ${theme.header} via-slate-900 to-slate-950`}
      header={
        <div className="flex items-center gap-3">
          <span className="text-3xl w-12 h-12 shrink-0 rounded-xl bg-slate-900/90 border border-slate-700 flex items-center justify-center shadow-lg">{CIV_EMBLEM[kingdom.civilization]}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold font-medieval text-slate-100 tracking-wide">{kingdom.name}</h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold ${theme.tag}`}>{theme.badge}</span>
              {archon && (
                <span className="text-[10px] font-mono pl-1 pr-2 py-0.5 rounded-full border uppercase font-bold bg-red-950/80 text-amber-200 border-red-500/60 flex items-center gap-1">
                  <ArchonSeal className="w-3.5 h-3.5" /> Archon of the Realm
                </span>
              )}
              {isBurning && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold bg-orange-950/80 text-orange-300 border-orange-500/60">
                  🔥 Burning
                </span>
              )}
              {frenzy && myCiv && civPlaces && (
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold bg-rose-950/80 text-rose-200 border-rose-500/60"
                  title={`War Frenzy: ${CIV_DEMOGRAPHICS[myCiv].name} and ${civProfileName(kingdom.civilization)} fought this week. No civilization swaps or moves between them until Sunday 00:00 UTC (${timeLeftLabel(civPlaces.weekResetsAt - now)} left). Attacks are not affected.`}
                >
                  ⚔️ War Frenzy · {timeLeftLabel(civPlaces.weekResetsAt - now)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">
              @{kingdom.username} · {kingdom.kingdomTitle}
            </p>
            <DecreeChips kingdom={kingdom} className="mt-1" />
          </div>
        </div>
      }
      footer={
        <div className="flex items-center gap-2 w-full flex-wrap">
          <button onClick={() => onEnterCity(kingdom.id)} className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5">
            <Castle className="w-3.5 h-3.5" /> Enter City
          </button>
          <button onClick={() => onOpenKingdomInfo(kingdom)} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold border border-slate-600 flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5" /> Kingdom
          </button>
          <button onClick={() => onOpenDevProfile(kingdom)} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> Developer
          </button>
          <button onClick={onClose} className="ml-auto px-4 py-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-medium">
            Close
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-3 text-sm font-mono">
        <CombatBanner combat={combat} siege />
        {/* Dossier */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {stats.map((s) => (
            <div key={s.label} className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">{s.label}</div>
              <div className={`text-[13px] font-bold mt-0.5 truncate ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {!fog && !kingdom.isSpecial && activeMarches && <StationedTroops marches={activeMarches} hostId={kingdom.id} viewerId={me?.id} />}

        {fog && (
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            {report
              ? `${fogHint(report)}. Treasury: 🪙 ${fogText(fogTreasury(report, "gold"), true)} · ⚙️ ${fogText(fogTreasury(report, "iron"), true)} · 🪨 ${fogText(fogTreasury(report, "stone"), true)}`
              : "Fog of war: their people, army and treasury are unknown. Send 👁️ scouts to find out."}
          </div>
        )}

        <div
          className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
            isOwnKingdom
              ? "bg-amber-950/30 border-amber-600/40 text-amber-200"
              : isBurning
                ? "bg-orange-950/40 border-orange-500/50 text-orange-200"
                : isArcane
                  ? "bg-purple-950/40 border-purple-600/50 text-purple-200"
                  : sameCiv
                    ? "bg-emerald-950/30 border-emerald-600/40 text-emerald-200"
                    : "bg-rose-950/30 border-rose-600/40 text-rose-200"
          }`}
        >
          {isOwnKingdom ? (
            <Crown className="w-4 h-4 text-amber-400 shrink-0" />
          ) : isBurning ? (
            <Flame className="w-4 h-4 text-orange-400 shrink-0" />
          ) : isArcane ? (
            <Flame className="w-4 h-4 text-purple-400 shrink-0" />
          ) : sameCiv ? (
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Swords className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>
            {isOwnKingdom
              ? "Your sovereign capital."
              : isBurning
                ? "Walls are burning (≤25% HP) — protected from new attacks until repaired above 25%."
                : archon
                  ? "Archon of the Realm — untouchable: their Empyrean citadel can't be attacked, rallied on or scouted."
                  : kingdom.isSpecial
                  ? `Special Overseer — a loot area: treasury, people and garrison respawn every harvest. Each defeat this week adds a Resolve stack (+20% HP, ATK and DEF), reset Sunday 00:00 UTC — now ×${grudge} (+${grudge * 20}%).`
                  : isArcane
                  ? "Voidrift citadel — open to siege by other civilizations. Break its garrison to usurp its Nethergarde slot."
                  : sameCiv
                    ? "Kindred civilization — protected by your shared banner. You can send resource caravans here."
                    : "Rival civilization — open to siege. Break the garrison to plunder resources above the vault."}{" "}
            <span className="text-slate-500">
              {civProfile.archetype} · {civProfile.soldierUnit.name}
            </span>
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {canAttack ? (
            <button onClick={() => onAttack(kingdom)} className={`${actionBtn} bg-linear-to-r from-red-600 via-rose-600 to-purple-600 hover:from-red-500 hover:to-purple-500 text-white shadow-lg`}>
              <Swords className="w-3.5 h-3.5" /> Launch siege
            </button>
          ) : (
            <button disabled className={disabledBtn} title={attackDisabledReason}>
              <Swords className="w-3.5 h-3.5" /> {attackDisabledReason}
            </button>
          )}
          {canReinforce && (
            <button onClick={() => onReinforce!(kingdom)} className={`${actionBtn} bg-linear-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white`}>
              <Shield className="w-3.5 h-3.5" /> Reinforce
            </button>
          )}
          {canScout && (
            <button onClick={() => onScout!(kingdom)} className={`${actionBtn} bg-linear-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white`}>
              <Eye className="w-3.5 h-3.5" /> Scout
            </button>
          )}
          {canCaravan ? (
            <button
              onClick={() => setCaravanOpen((o) => !o)}
              className={`${actionBtn} ${caravanOpen ? "bg-emerald-500 text-slate-950" : "bg-emerald-700 hover:bg-emerald-600 text-white"}`}
            >
              <Truck className="w-3.5 h-3.5" /> {caravanOpen ? "Hide caravan" : "Send caravan"}
            </button>
          ) : (
            <button disabled className={disabledBtn} title={caravanDisabledReason}>
              <Truck className="w-3.5 h-3.5" /> {caravanDisabledReason}
            </button>
          )}
          {swapBlocked ? (
            <button disabled className={disabledBtn} title={swapBlocked}>
              <ArrowLeftRight className="w-3.5 h-3.5" /> {swapBlocked === "Your realm" ? "Swap" : "Can't swap"}
            </button>
          ) : (
            <button
              onClick={() => setSwapOpen((o) => !o)}
              className={`${actionBtn} ${swapOpen ? "bg-sky-500 text-slate-950" : "bg-sky-700 hover:bg-sky-600 text-white"}`}
              title="Peacefully swap civilizations with this kingdom (both rulers must agree)"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" /> {pendingSwap ? "Swap pending" : "Swap civs"}
            </button>
          )}
        </div>

        {/* Peaceful civilization swap */}
        {swapOpen && !swapBlocked && mine && (
          <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-3 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: mine, to: kingdom.civilization, label: "You become" },
                { k: kingdom, to: mine.civilization, label: `${kingdom.name} becomes` }
              ].map(({ k, to, label }) => (
                <div key={k.id} className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase truncate">{label}</div>
                  <div className="font-bold text-sky-200">
                    {CIV_EMBLEM[to]} {CIV_DEMOGRAPHICS[to].name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {k.population === undefined ? "👥 hidden by fog (same fill ratio)" : `👥 ${formatCompact(k.population)} → ${formatCompact(convertedPopulation(k, to))} (same fill ratio)`}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">
              No casualties: each side keeps how full its kingdom is. Castles move to their new provinces; buildings and levels stay. Proposals lapse after 24 h.
            </p>
            <div className="flex justify-end gap-2">
              {!pendingSwap && (
                <button
                  onClick={() => onProposeSwap && runSwap(() => onProposeSwap(mine.id, kingdom.id), `Swap proposed to ${kingdom.name}. They'll see it in their War Room.`)}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold"
                >
                  Propose swap
                </button>
              )}
              {pendingSwap && pendingSwap.fromId === mine.id && (
                <>
                  <span className="mr-auto self-center text-sky-300">Waiting for {kingdom.name} to answer…</span>
                  <button onClick={() => onAnswerSwap && runSwap(() => onAnswerSwap(pendingSwap.id, "cancel"), "Proposal withdrawn.")} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold">
                    Withdraw
                  </button>
                </>
              )}
              {pendingSwap && pendingSwap.toId === mine.id && (
                <>
                  <span className="mr-auto self-center text-sky-300">{kingdom.name} proposed this swap.</span>
                  <button onClick={() => onAnswerSwap && runSwap(() => onAnswerSwap(pendingSwap.id, "decline"), "Swap declined.")} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold">
                    Decline
                  </button>
                  <button onClick={() => onAnswerSwap && runSwap(() => onAnswerSwap(pendingSwap.id, "accept"), "Swap accepted — your civilizations have changed.")} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold">
                    Accept swap
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Caravan: one compact row per resource */}
        {caravanOpen && !isOwnKingdom && me && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-xs">
            <div className="divide-y divide-emerald-900/40">
              {CARAVAN_ROWS.map((r) => {
                const max = available(r);
                return (
                  <div key={r.key} className="flex items-center gap-2 px-3 py-1.5">
                    <span className={`w-20 shrink-0 font-bold ${r.color}`}>
                      {r.icon} {r.label}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={max}
                      value={amounts[r.key] || ""}
                      placeholder="0"
                      onChange={(e) => setAmount(r.key, Number(e.target.value), max)}
                      className="w-24 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                    />
                    <span className="hidden sm:inline text-[10px] text-slate-500 truncate">of {formatCompact(max)}</span>
                    <span className="ml-auto flex gap-1">
                      {CARAVAN_SHARES.map((share) => (
                        <button
                          key={share}
                          type="button"
                          disabled={max <= 0}
                          onClick={() => setAmount(r.key, max * share, max)}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold disabled:opacity-40"
                        >
                          {share === 1 ? "Max" : `${share * 100}%`}
                        </button>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-emerald-800/50">
              <button type="button" onClick={() => setAmounts(EMPTY_CARAVAN)} className="text-[11px] text-slate-400 hover:text-slate-200">
                Clear
              </button>
              <button
                type="button"
                onClick={sendCaravan}
                disabled={isSending || total <= 0}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
                {isSending ? "Dispatching…" : `Send ${total.toLocaleString()}`}
              </button>
            </div>
          </div>
        )}

        {status && (
          <div className={`p-2.5 rounded-lg text-xs border ${status.type === "success" ? "bg-emerald-950/80 text-emerald-300 border-emerald-800" : "bg-red-950/80 text-red-300 border-red-800"}`}>
            {status.text}
          </div>
        )}
      </div>
    </Modal>
  );
}
