import { useEffect, useState } from "react";
import { fogRange, fogText } from "@/utils/fog";
import { Modal } from "./Modal";
import { NethergardeSpire, DeveloperKingdom, AuthUser, ActiveMarch, MarchPreview, SCARCE_RESOURCES, MapNPC, ScoutReport, NodeStatus, BossStatus, NpcKingdomStatus } from "@/types";
import { CIV_DEMOGRAPHICS, realmHoardText, WALL_TIER_NAMES, wallDefMultForTier, wallDamageCutText, marchSlotsForLevel, marchCapacityFor } from "@/utils/civDemographics";
import { bossHideMult, CIV_BOSS_DAMAGE, CIV_EMBLEM, formatDuration, GATE_DUTY_TEXT, NPC_GATE_CIV, SCOUT_MAX_SOLDIERS, SCOUT_MOUNT } from "@/utils/war";
import { formatCompact } from "@/utils/format";
import { BAND_BOSS_DAMAGE } from "@/utils/mercenaries";
import { sound } from "@/hooks/useSound";
import type { MarchTargetParam } from "@/hooks/useGameState";
import { FogNotice, NodeStatusLine, ScoutIntel } from "./ScoutIntel";
import { Swords, Compass, AlertTriangle, Sparkles, Shield, Flame, Eye, Pickaxe, ShieldCheck } from "lucide-react";
import { ARMORY_TARGET_SHARE } from "@/utils/armory";
import { MusterPanel, useMuster, type MusterLaunchResult } from "./MusterPanel";
import type { MusterMarch } from "@/types";

export type ComposerKind = "attack" | "scout" | "gather" | "rally" | "reinforce";

/** Rally lobby wait times (mirror of server RALLY_WINDOWS_MS) */
const RALLY_WAITS_MS = [120_000, 300_000, 600_000];

interface AttackModalProps {
  spire?: NethergardeSpire | null;
  targetKingdom?: DeveloperKingdom | null;
  /** A world NPC (mob / bandit to attack; anything to scout) */
  npcTarget?: MapNPC | null;
  /** Which kind of march the form opens with */
  initialKind?: ComposerKind;
  /** The viewer's latest scout report of the target */
  report?: ScoutReport | null;
  /** Resource node / chest: who is gathering it, what's left */
  nodeStatus?: NodeStatus | null;
  /** World boss: shared HP, skills */
  bossStatus?: BossStatus | null;
  /** NPC kingdom: level, donor civ, fogged garrison */
  npcKingdomStatus?: NpcKingdomStatus | null;
  attackerKingdom: DeveloperKingdom | null;
  me: AuthUser | null;
  activeMarches?: ActiveMarch[];
  onClose: () => void;
  onPreviewMarch: (params: { attackerId: string; targetType: MarchTargetParam; targetId: string; kind?: ComposerKind }) => Promise<MarchPreview | null>;
  onDispatchMarch: (params: { attackerId: string; targetType: MarchTargetParam; targetId: string; soldiers: number; kind?: ComposerKind; bandId?: string; loadout?: string; champion?: boolean }) => Promise<{ success: boolean; error?: string; march?: ActiveMarch }>;
  /** Open a rally on the target: the army waits in the lobby while allies join */
  onStartRally?: (params: { leaderId: string; targetType: MarchTargetParam; targetId: string; waitMs: number; soldiers: number; loadout?: string; champion?: boolean }) => Promise<{ success: boolean; error?: string }>;
  /** ⚔️ Launch a muster: several attack marches at once (or a rally led with several armies), all or none */
  onDispatchMuster?: (params: { attackerId: string; targetType: MarchTargetParam; targetId: string; kind: "attack" | "rally"; waitMs?: number; marches: MusterMarch[] }) => Promise<MusterLaunchResult>;
}

/** Quick picks for the army size: fixed counts and shares of the sendable maximum */
const ARMY_PRESETS: Array<{ label: string; pick: (available: number) => number }> = [
  { label: "10", pick: () => 10 },
  { label: "25%", pick: (n) => Math.round(n * 0.25) },
  { label: "50%", pick: (n) => Math.round(n * 0.5) },
  { label: "Max", pick: (n) => n }
];

/** World NPC categories an army can attack (the rest can only be scouted) */
const ATTACKABLE_NPC = new Set(["mob", "bandit", "boss", "kingdom"]);

export function AttackModal({ spire, targetKingdom, npcTarget, initialKind = "attack", report, nodeStatus, bossStatus, npcKingdomStatus, attackerKingdom, me, activeMarches = [], onClose, onPreviewMarch, onDispatchMarch, onStartRally, onDispatchMuster }: AttackModalProps) {
  const [kind, setKind] = useState<ComposerKind>(initialKind);
  const [waitMs, setWaitMs] = useState(RALLY_WAITS_MS[1]);
  const [soldiers, setSoldiers] = useState(0);
  const [preview, setPreview] = useState<MarchPreview | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const targetType: MarchTargetParam = spire ? "spire" : npcTarget ? "npc" : "dev";
  const targetId = spire?.id ?? npcTarget?.id ?? targetKingdom?.id ?? "";
  const attackerId = attackerKingdom?.id ?? "";
  const isNode = npcTarget?.category === "resource" || npcTarget?.category === "treasure";
  const isChest = npcTarget?.category === "treasure";
  const gatherer = nodeStatus?.gatherer ?? null;
  // A node can be attacked only to strike its gatherers: another civ's, outside their safe territory
  const canAttack =
    (!npcTarget || ATTACKABLE_NPC.has(npcTarget.category ?? "") || Boolean(isNode && gatherer && gatherer.exposed && !gatherer.mine && gatherer.civ !== attackerKingdom?.civilization)) &&
    !bossStatus?.dead &&
    !npcKingdomStatus?.burning;
  // A castle of your own civilization can only be reinforced; everything you can attack can also be rallied on,
  // except an open Voidrift slot (one ruler claims it alone)
  // …and so can your own civilization's frontier gate (its rulers can never attack it)
  const ownGate = Boolean(npcTarget && attackerKingdom && NPC_GATE_CIV[npcTarget.id] === attackerKingdom.civilization);
  const ownCiv = ownGate || Boolean(targetKingdom && attackerKingdom && targetKingdom.civilization === attackerKingdom.civilization);
  const canRally = Boolean(onStartRally) && canAttack && !isNode && !ownCiv && !spire;
  const scouting = kind === "scout";
  const gathering = kind === "gather";
  const rallying = kind === "rally";
  const reinforcing = kind === "reinforce";
  // The server previews a rally as the leader's attack
  const previewKind = rallying ? "attack" : kind;

  // A new target opens with the kind it was asked for
  useEffect(() => {
    setKind(ownCiv ? "reinforce" : initialKind);
    setStatus(null);
  }, [initialKind, targetId, ownCiv]);

  // Scouts, and a gather march in your own safe territory, are civilians instead of soldiers
  const civilianWorkers = (scouting || gathering) && Boolean(preview?.civilianWorkers);
  const homeSoldiers = civilianWorkers || scouting ? preview?.availableSoldiers ?? 0 : attackerKingdom?.soldiers ?? 0;
  // Scouts heading for a kingdom dress as its people; they ride their own civilization's mount
  const disguiseCiv = targetKingdom?.civilization ?? (spire ? "arcane" : npcTarget ? (npcKingdomStatus?.civ ?? NPC_GATE_CIV[npcTarget.id]) : undefined);
  const mount = attackerKingdom ? SCOUT_MOUNT[attackerKingdom.civilization] : null;
  const marchCap =
    preview?.marchCapacity ??
    attackerKingdom?.marchCapacity ??
    (attackerKingdom ? marchCapacityFor(attackerKingdom.maxPopulation ?? 100, attackerKingdom.civilization) : homeSoldiers);
  const kindCap = preview?.maxSoldiers ?? (scouting ? Math.min(SCOUT_MAX_SOLDIERS, marchCap) : marchCap);
  const maxSend = Math.max(0, Math.min(homeSoldiers, kindCap));

  const marchSlots =
    preview?.marchSlots ??
    attackerKingdom?.marchSlots ??
    (attackerKingdom ? marchSlotsForLevel(attackerKingdom.cityHallLevel || 1) : 1);
  const myActiveCount =
    preview?.activeMarchesCount ??
    activeMarches.filter((m) => m.attackerId === attackerId && m.phase !== "done" && m.status !== "resolved").length;

  // Another target or kind of march starts from nothing
  useEffect(() => {
    setStatus((s) => (s?.type === "success" ? s : null));
    setPreview(null);
  }, [attackerId, targetType, targetId, previewKind]);

  // Costs come from the server so they always match what the dispatch will charge. A march starting or ending anywhere
  // in the realm re-reads them in place: blanking the preview here would wipe the Muster's ticks and loadouts
  useEffect(() => {
    if (!attackerId || !targetId) return;
    let live = true;
    onPreviewMarch({ attackerId, targetType, targetId, kind: previewKind }).then((p) => {
      if (live && p) setPreview(p);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackerId, targetType, targetId, previewKind, activeMarches.length]);

  useEffect(() => {
    setSoldiers((s) => (scouting ? Math.min(Math.max(1, s), maxSend) : Math.min(Math.max(s, Math.min(10, maxSend)), maxSend)));
  }, [maxSend, scouting]);

  // ⚔️ Attacks and rallies go out through the Muster: bands and boxes of soldiers, each with its loadout and maybe the champion
  const musterMode = (kind === "attack" || rallying) && Boolean(onDispatchMuster);
  const refreshPreview = async () => {
    const p = await onPreviewMarch({ attackerId, targetType, targetId, kind: previewKind });
    if (p) setPreview(p);
  };
  const muster = useMuster({
    preview: musterMode ? preview : null,
    resetKey: `${targetId}:${kind}`,
    attacker: attackerKingdom,
    rallying,
    onRefresh: refreshPreview,
    onLaunch: (marches) => onDispatchMuster!({ attackerId, targetType, targetId, kind: rallying ? "rally" : "attack", ...(rallying ? { waitMs } : {}), marches })
  });

  if (!spire && !targetKingdom && !npcTarget) return null;

  const foodCost = Math.ceil(soldiers * (preview?.foodPerSoldier ?? 0));
  const food = attackerKingdom?.resources.food ?? 0;
  const hasFood = food >= foodCost;
  const blocked = !me ? "Sign in with Git to lead an army." : preview?.blockedReason ?? null;
  const canLaunch = musterMode
    ? !blocked && muster.canLaunch && !isDispatching
    : !blocked && preview !== null && soldiers > 0 && soldiers <= maxSend && hasFood && !isDispatching;

  const unit = attackerKingdom ? CIV_DEMOGRAPHICS[attackerKingdom.civilization]?.soldierUnit : null;
  const name = spire ? spire.npcName ?? `Voidrift Slot ${spire.slotIndex}` : npcTarget ? npcTarget.name : targetKingdom!.name;

  const launch = async () => {
    if (!attackerKingdom || !canLaunch) return;
    setIsDispatching(true);
    setStatus(null);
    try {
      if (musterMode) {
        const n = muster.ticked;
        const ok = await muster.launch();
        if (ok) {
          setStatus({
            type: "success",
            text: rallying
              ? `Rally raised with ${n} arm${n === 1 ? "y" : "ies"}! They wait at your castle for ${Math.round(waitMs / 60_000)} min while rulers of your civilization join (March Queue → Open rallies).`
              : `${n} march${n === 1 ? "" : "es"} set off on ${name} together: they arrive in the same moment and all fight from round 1. Watch them on the map and in the March Queue.`
          });
        }
        return;
      }
      const res =
        rallying && onStartRally
          ? await onStartRally({ leaderId: attackerId, targetType, targetId, waitMs, soldiers })
          : await onDispatchMarch({ attackerId, targetType, targetId, soldiers, kind });
      if (res.success) {
        setStatus({
          type: "success",
          text: rallying
            ? `Rally raised! Your army waits at your castle for ${Math.round(waitMs / 60_000)} min while rulers of your civilization join (March Queue → Open rallies).`
            : reinforcing
              ? `Your soldiers are on their way to guard ${name}. They stay until you recall them or ${name} sends them home.`
              : scouting
            ? `Scouts are riding to ${name}. Their report reaches you when they get home (War Room → Scout reports).`
            : gathering
              ? `Your workers are heading to ${name}. The first to arrive takes it; the haul is yours when they get home.`
              : `Your army is marching on ${name}. Watch it on the map — the March Queue and War Room track it too.`
        });
        sound.playLevelUp();
      } else {
        setStatus({ type: "error", text: res.error || "Failed to dispatch expedition." });
      }
    } catch (err: any) {
      setStatus({ type: "error", text: err.message || "Network error" });
    } finally {
      setIsDispatching(false);
    }
  };

  const npcTheme = npcTarget ? (npcTarget.category === "mob" || npcTarget.category === "bandit" ? "rose" : npcTarget.category === "boss" || npcTarget.category === "kingdom" ? "orange" : "sky") : null;
  const isArcane = !npcTarget && (spire || targetKingdom?.civilization === "arcane");
  const accent = isArcane ? "purple" : npcTheme ?? "rose";
  const ACCENTS: Record<string, { border: string; header: string; badge: string; box: string }> = {
    purple: { border: "border-purple-500/60", header: "from-purple-950", badge: "bg-purple-950/80 text-purple-300 border-purple-600/60", box: "border-purple-500/40 bg-purple-950/20" },
    rose: { border: "border-rose-500/60", header: "from-rose-950", badge: "bg-rose-950/80 text-rose-300 border-rose-600/60", box: "border-rose-500/40 bg-rose-950/20" },
    orange: { border: "border-orange-500/60", header: "from-orange-950", badge: "bg-orange-950/80 text-orange-300 border-orange-600/60", box: "border-orange-500/40 bg-orange-950/20" },
    sky: { border: "border-sky-500/60", header: "from-sky-950", badge: "bg-sky-950/80 text-sky-300 border-sky-600/60", box: "border-sky-500/40 bg-sky-950/20" }
  };
  const theme = ACCENTS[accent];
  const intel = (
    <TargetIntel spire={spire} targetKingdom={targetKingdom} npcTarget={npcTarget} report={report} preview={preview} boxClass={theme.box} nodeStatus={nodeStatus} bossStatus={bossStatus} npcKingdomStatus={npcKingdomStatus} attackerLevel={attackerKingdom?.cityHallLevel ?? 1} attackerCiv={attackerKingdom?.civilization} bandName={muster.tickedBandNames[0]} />
  );

  return (
    <Modal
      open
      onClose={onClose}
      size={musterMode && me && attackerKingdom ? "lg" : "md"}
      accentBorder={theme.border}
      headerClassName={`bg-linear-to-b ${theme.header} via-slate-900 to-slate-950`}
      header={
        <div className="flex items-center gap-3">
          <span className={`text-3xl w-12 h-12 shrink-0 rounded-xl border flex items-center justify-center shadow-lg bg-slate-950/70 ${theme.border}`}>
            {spire ? "🔮" : npcTarget ? npcTarget.emblem : CIV_EMBLEM[targetKingdom!.civilization]}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold font-medieval text-amber-100 tracking-wide">{name}</h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold ${theme.badge}`}>
                {spire
                  ? `NPC void kingdom · slot ${spire.slotIndex}`
                  : npcTarget
                    ? `${npcTarget.category ?? "encounter"}${npcTarget.rarity ? ` · ${npcTarget.rarity}` : ""}`
                    : targetKingdom!.civilization === "arcane"
                      ? "Voidrift citadel"
                      : `${CIV_DEMOGRAPHICS[targetKingdom!.civilization].name}`}
              </span>
            </div>
            <p className="text-xs text-slate-300/80 font-mono mt-0.5">
              {spire ? `City Hall ${spire.npcLevel ?? "?"}` : npcTarget ? `${npcTarget.region} · [${npcTarget.x}, ${npcTarget.z}]` : `@${targetKingdom!.username} · City Hall ${targetKingdom!.cityHallLevel}`}
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <span className={`text-xs text-slate-400 font-mono ${musterMode && me ? "hidden sm:inline" : ""}`}>
            {attackerKingdom && me ? (
              <>
                {civilianWorkers ? "Free civilians" : "Home"}: <strong className="text-amber-300">{homeSoldiers.toLocaleString()}</strong> · Slots:{" "}
                <strong className={myActiveCount >= marchSlots ? "text-rose-400" : "text-sky-300"}>
                  {myActiveCount}/{marchSlots}
                </strong>{" "}
                · <strong className="text-lime-400">{food.toLocaleString()}</strong> food
              </>
            ) : (
              <span className="text-red-400">Sign in with Git to dispatch troops</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 text-xs font-medium">
              Close
            </button>
            <button
              onClick={launch}
              disabled={!canLaunch}
              className={`px-4 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 whitespace-nowrap text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                reinforcing
                  ? "bg-linear-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500"
                  : scouting
                  ? "bg-linear-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500"
                  : gathering
                    ? "bg-linear-to-r from-emerald-600 to-lime-600 hover:from-emerald-500 hover:to-lime-500"
                    : "bg-linear-to-r from-red-600 via-rose-600 to-purple-600 hover:from-red-500 hover:to-purple-500"
              }`}
            >
              {scouting ? <Eye className="w-4 h-4" /> : gathering ? <Pickaxe className="w-4 h-4" /> : <Swords className="w-4 h-4" />}
              {isDispatching
                ? "Dispatching…"
                : musterMode
                  ? muster.ticked > 0
                    ? `${rallying ? "Raise rally" : "Launch"} · ${muster.ticked} march${muster.ticked === 1 ? "" : "es"}`
                    : rallying
                      ? "Raise rally"
                      : "Launch"
                  : rallying
                  ? `Raise rally with ${soldiers.toLocaleString()}`
                  : reinforcing
                    ? `Reinforce with ${soldiers.toLocaleString()}`
                    : scouting
                  ? `Send ${soldiers} scout${soldiers === 1 ? "" : "s"}`
                  : gathering
                    ? `${isChest ? "Claim" : "Gather"} with ${soldiers.toLocaleString()}`
                    : `March with ${soldiers.toLocaleString()}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="p-4 space-y-3 text-sm font-mono">
        {/* Kind switcher */}
        <div className="flex gap-1.5 text-xs flex-wrap">
          {(
            [
              { k: "attack", label: "⚔️ Attack", show: !ownCiv, enabled: canAttack, tip: isNode ? "Only exposed gatherers of another civilization can be attacked here" : bossStatus?.dead ? "It has fallen — it returns when it respawns" : npcKingdomStatus?.burning ? "Burning — protected until its walls repair" : "This can only be scouted", on: "bg-rose-900/60 border-rose-500/60 text-rose-100" },
              { k: "rally", label: "🚩 Rally", show: canRally, enabled: true, tip: "", on: "bg-amber-900/60 border-amber-500/60 text-amber-100" },
              { k: "scout", label: "👁️ Scout", show: !ownCiv, enabled: true, tip: "", on: "bg-sky-900/60 border-sky-500/60 text-sky-100" },
              { k: "gather", label: isChest ? "💎 Claim" : "⛏️ Gather", show: isNode, enabled: true, tip: "", on: "bg-emerald-900/60 border-emerald-500/60 text-emerald-100" },
              { k: "reinforce", label: "🛡️ Reinforce", show: ownCiv, enabled: true, tip: "", on: "bg-indigo-900/60 border-indigo-500/60 text-indigo-100" }
            ] as Array<{ k: ComposerKind; label: string; show: boolean; enabled: boolean; tip: string; on: string }>
          )
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.k}
                type="button"
                disabled={!t.enabled}
                onClick={() => setKind(t.k)}
                title={t.enabled ? undefined : t.tip}
                className={`flex-1 px-3 py-1.5 rounded-lg border font-bold flex items-center justify-center gap-1.5 disabled:opacity-35 disabled:cursor-not-allowed ${
                  kind === t.k ? t.on : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
        </div>

        {rallying && (
          <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/15 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300">🚩 Rally lobby</span>
              <span className="flex gap-1">
                {RALLY_WAITS_MS.map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => setWaitMs(ms)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${waitMs === ms ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
                  >
                    {ms / 60_000} min
                  </button>
                ))}
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              Your armies wait at your castle (each soldier box of the Muster below is its own army); rulers of your civilization can join until it sets off ({rallyCapText(attackerKingdom?.cityHallLevel ?? 1)}). Everyone marches together at the slowest member's speed and every army gets <strong className="text-amber-200">+5% ATK per joiner</strong> (up to +25%). Each member's survivors carry their own plunder home.
            </p>
          </div>
        )}
        {reinforcing && ownGate && npcTarget && (
          <div className="p-3 rounded-xl border border-indigo-500/30 bg-indigo-950/15 text-[11px] text-slate-300">
            🚧 Your soldiers go on gate duty at {npcTarget.name}: they fight beside its garrison in every attack on it, with your civilization's stats and its walls, and while it
            stands no other civilization can attack your province's cities. Gate duty costs{" "}
            <strong className="text-amber-200">{GATE_DUTY_TEXT} per soldier every harvest</strong> (timber, stone and iron keep the gate and its wall in shape), on top of their
            normal food upkeep. If your treasury can't pay, the newest troops walk home.
            {preview?.reinforceRoom !== undefined && (
              <div className="mt-1.5">
                Room at the gate: <strong className="text-indigo-200">{preview.reinforceRoom.toLocaleString()}</strong> more soldiers (garrison and troops on duty never exceed its cap).
              </div>
            )}
          </div>
        )}
        {scouting && !blocked && preview?.scoutOdds && <ScoutOddsPanel odds={preview.scoutOdds} scouts={soldiers} />}
        {reinforcing && targetKingdom && (
          <div className="p-3 rounded-xl border border-indigo-500/30 bg-indigo-950/15 text-[11px] text-slate-300">
            🛡️ Your soldiers will stand on {targetKingdom.name}'s walls and fight in every defence of that castle with your civilization's stats and its walls. They keep eating from your own granary every harvest, use one march slot until they're home, and come home when you recall them or {targetKingdom.name} sends them home.
            {preview?.reinforceRoom !== undefined && (
              <div className="mt-1.5">
                Room on the walls: <strong className="text-indigo-200">{preview.reinforceRoom.toLocaleString()}</strong> more soldiers. A castle holds allies only up to its max population minus its own soldiers; if it arms more, the newest allies walk home.
              </div>
            )}
          </div>
        )}

        {/* The Muster leads an attack or a rally; what is known of the target follows it */}
        {!(musterMode && me && attackerKingdom && !blocked) && intel}

        {gathering && me && attackerKingdom && !blocked && preview?.gatherPreview && <GatherEstimate gp={preview.gatherPreview} soldiers={soldiers} />}

        {/* ⚔️ The Muster: every attack and rally */}
        {me && attackerKingdom && !blocked && musterMode && <MusterPanel m={muster} />}
        {me && attackerKingdom && !blocked && musterMode && npcTarget?.category === "boss" && ARMORY_TARGET_SHARE.boss && (
          <p className="text-[10px] text-slate-400">
            {ARMORY_TARGET_SHARE.boss.emblem} {ARMORY_TARGET_SHARE.boss.name}: {ARMORY_TARGET_SHARE.boss.description}.
          </p>
        )}
        {me && attackerKingdom && !blocked && musterMode && npcTarget && NPC_GATE_CIV[npcTarget.id] && ARMORY_TARGET_SHARE.gate && (
          <p className="text-[10px] text-slate-400">
            {ARMORY_TARGET_SHARE.gate.emblem} {ARMORY_TARGET_SHARE.gate.name}: {ARMORY_TARGET_SHARE.gate.description}.
          </p>
        )}
        {musterMode && me && attackerKingdom && !blocked && intel}

        {/* Army & logistics */}
        {me && attackerKingdom && !blocked && !musterMode && (
          <div className={`p-3 rounded-xl border space-y-2.5 text-xs ${scouting ? "border-sky-500/30 bg-sky-950/15" : "border-amber-500/30 bg-amber-950/15"}`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold flex items-center gap-1.5 ${scouting ? "text-sky-300" : "text-amber-300"}`}>
                {scouting ? <Eye className="w-4 h-4" /> : civilianWorkers ? <Pickaxe className="w-4 h-4" /> : <Swords className="w-4 h-4" />}{" "}
                {scouting ? "Scouting party · civilians" : civilianWorkers ? "👷 Civilians (safe territory)" : `Army${unit ? ` · ${unit.name}s` : ""}`}
              </span>
              <span className="text-slate-300">
                <strong className="text-rose-300">{soldiers.toLocaleString()}</strong> / {maxSend.toLocaleString()} max ({kindCap.toLocaleString()} cap)
              </span>
            </div>
            {homeSoldiers <= 0 ? (
              <p className="text-amber-200/90 text-[11px]">
                {scouting
                  ? "No civilians free to scout: everyone is in the garrison or away."
                  : civilianWorkers
                  ? "No civilians free to work: everyone is in the garrison, away or already gathering."
                  : "No soldiers at home. Assign civilians to the garrison from the 👥 Kingdom panel in the header first."}
              </p>
            ) : (
              <>
                <input type="range" min={1} max={Math.max(1, maxSend)} value={Math.max(1, soldiers)} onChange={(e) => setSoldiers(Number(e.target.value))} className="w-full accent-amber-400" />
                {!scouting && (
                  <div className="flex gap-1.5">
                    {ARMY_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setSoldiers(Math.max(1, Math.min(maxSend, p.pick(maxSend))))}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-slate-800">
              <div>
                <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                  <Compass className="w-3 h-3" /> Distance
                </div>
                <div className="font-bold text-sky-300">{preview ? `${preview.distance} leagues` : "…"}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">One-way ETA</div>
                <div className="font-bold text-emerald-300">{preview ? formatDuration(preview.durationMs) : "…"}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400" title="Round-trip rations paid up front; no refund on recall">
                  Round-trip rations
                </div>
                <div className={`font-bold ${hasFood ? "text-lime-300" : "text-red-400"}`}>{foodCost.toLocaleString()} food</div>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              {scouting
                ? `Scouts are civilians (your garrison stays home) riding ${mount ? `${mount.name}s` : "your own mounts"} 3× faster${
                    disguiseCiv ? `, dressed as ${CIV_DEMOGRAPHICS[disguiseCiv].name} to blend in` : ""
                  }. They never fight and use one march slot until they're home. Their report arrives with them.`
                : gathering
                  ? "Workers use one march slot until they're home; recall them any time to bring home what they have so far. Rations aren't refunded."
                  : "Round-trip rations (outbound + return) are paid on dispatch and are not refunded if recalled early. Survivors walk home with any plunder."}
            </p>
            {!hasFood && (
              <p className="text-red-300 text-[11px] flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Not enough food in the granary for this many soldiers.
              </p>
            )}
          </div>
        )}

        {!blocked && preview?.breaksOwnShield && (
          <div className="p-2.5 rounded-lg bg-sky-950/60 border border-sky-500/50 text-sky-100 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-sky-300 shrink-0" /> 🛡️ Marching on a ruler shatters your Royal Shield.
          </div>
        )}

        {blocked && (
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700 text-slate-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> {blocked}
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

/** What the attacker knows about the target: exact for own-civ / scouted, bands otherwise (fog of war) */
function TargetIntel({
  spire,
  targetKingdom,
  npcTarget,
  report,
  preview,
  boxClass,
  nodeStatus,
  bossStatus,
  npcKingdomStatus,
  attackerLevel = 1,
  attackerCiv,
  bandName
}: {
  spire?: NethergardeSpire | null;
  targetKingdom?: DeveloperKingdom | null;
  npcTarget?: MapNPC | null;
  report?: ScoutReport | null;
  preview: MarchPreview | null;
  boxClass: string;
  nodeStatus?: NodeStatus | null;
  bossStatus?: BossStatus | null;
  npcKingdomStatus?: NpcKingdomStatus | null;
  /** The marching ruler's City Hall (world bosses' Colossus Hide) */
  attackerLevel?: number;
  /** The marching ruler's civilization (its own world-boss share) */
  attackerCiv?: DeveloperKingdom["civilization"];
  /** The band marching instead of soldiers, if one is picked (the Sellsword's Oath) */
  bandName?: string;
}) {
  if (npcTarget) {
    const pack = npcTarget.pack;
    return (
      <div className="space-y-2">
        {nodeStatus && <NodeStatusLine status={nodeStatus} />}
        {pack && !report && (
          <FogNotice
            lines={[
              ["Pack", `${pack.band} ${pack.unitName}s${pack.wounded ? " (wounded)" : ""}`],
              ["HP left", `${Math.round(pack.health * 100)}%`],
              ["Tier", npcTarget.rarity ?? "common"],
              ["Gear", "? (scout it: some packs are armed or war-geared)"]
            ]}
            scoutedAt={pack.scoutedAt}
          />
        )}
        {npcTarget.chest && !report && <FogNotice lines={[["Chest", npcTarget.chest.band === "hoard" ? "a great hoard" : `a ${npcTarget.chest.band} chest`]]} scoutedAt={npcTarget.chest.scoutedAt} />}
        {bossStatus && (
          // A boss's HP is shared and public (no fog)
          <div className="p-2.5 rounded-xl border border-red-500/30 bg-red-950/15 text-[11px] font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Shared HP</span>
              <span className="text-red-200 font-bold">
                {bossStatus.dead ? "fallen" : `${bossStatus.hp.toLocaleString()} / ${bossStatus.maxHp.toLocaleString()} (${Math.round((bossStatus.hp / bossStatus.maxHp) * 100)}%)`}
              </span>
            </div>
            {bossStatus.skills.map((sk) => (
              <div key={sk} className="text-red-200/80">
                ✴️ {sk}
              </div>
            ))}
            <div className={bossHideMult(attackerLevel) < 1 ? "text-amber-300" : "text-emerald-300"}>
              🪨 Colossus Hide: your City Hall {attackerLevel} troops land {Math.round(bossHideMult(attackerLevel) * 100)}% of their blows
            </div>
            {attackerCiv && CIV_BOSS_DAMAGE[attackerCiv] && (
              <div className={CIV_BOSS_DAMAGE[attackerCiv]!.mult < 1 ? "text-amber-300" : "text-emerald-300"}>
                {CIV_BOSS_DAMAGE[attackerCiv]!.emblem} {CIV_BOSS_DAMAGE[attackerCiv]!.name}: your troops land {Math.round(CIV_BOSS_DAMAGE[attackerCiv]!.mult * 100)}% of that
              </div>
            )}
            {bandName && <div className="text-amber-300">🪙 The Sellsword&apos;s Oath: {bandName} land {Math.round(BAND_BOSS_DAMAGE * 100)}% of that on a colossus</div>}
          </div>
        )}
        {npcKingdomStatus && !report && (
          <FogNotice
            lines={[
              ["Kingdom", `City Hall ${npcKingdomStatus.level} · ${CIV_DEMOGRAPHICS[npcKingdomStatus.civ].soldierUnit.name}s`],
              ["Garrison", "?"],
              ["Walls", `tier ${npcKingdomStatus.wallTier} · ${npcKingdomStatus.wall}`],
              ["Treasury", "?"]
            ]}
            scoutedAt={npcKingdomStatus.scoutedAt}
          />
        )}
        {report && <ScoutIntel report={report} compact />}
        {npcKingdomStatus?.hoard && (
          // 👑 A free realm's conquest hoard is public: whether it is there to win today
          <div className={`p-2 rounded-xl border text-[11px] font-mono ${npcKingdomStatus.hoard.readyAt ? "border-slate-700 bg-slate-900/60 text-slate-400" : "border-amber-500/40 bg-amber-950/20 text-amber-200"}`}>
            👑 Conquest hoard ({npcKingdomStatus.hoard.tier}): {realmHoardText(npcKingdomStatus.hoard.tier)}
            {npcKingdomStatus.hoard.readyAt ? ` · won today, back at ${new Date(npcKingdomStatus.hoard.readyAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : " · waiting for whoever breaks the garrison"}
          </div>
        )}
        {npcTarget.category === "boss" && (
          <p className="text-[11px] text-slate-400 font-sans">
            Every battle wears its shared HP down for good — a rally does it fastest. The army that lands the killing blow carries the hoard home by load; everyone who wounded it
            this life shares the bounty by damage dealt.
          </p>
        )}
        {npcTarget.category === "kingdom" && (
          <p className="text-[11px] text-slate-400 font-sans">
            Its garrison fights behind walls with its civilization's soldiers. Break it and your survivors plunder what lies above the vault, and its conquest hoard (once a day) is paid into the conquerors' treasuries by damage dealt; it regrows by births and is never destroyed.
          </p>
        )}
        {(npcTarget.category === "mob" || npcTarget.category === "bandit") && (
          <p className="text-[11px] text-slate-400 font-sans">
            {npcTarget.category === "bandit"
              ? "Win and your survivors carry off the bandits' stash, as much as they can load. "
              : "Clear the pack and your survivors bring its spoils home. "}
            First to win takes it — every other army heading there turns back. Packs keep their losses for the next challenger.
          </p>
        )}
      </div>
    );
  }

  const fog = spire ? spire.fog : targetKingdom?.fog;
  const civ = spire ? "arcane" : targetKingdom!.civilization;
  const defUnit = CIV_DEMOGRAPHICS[civ]?.soldierUnit ?? CIV_DEMOGRAPHICS.arcane.soldierUnit;
  const garrison = spire ? spire.garrison : targetKingdom?.soldiers;
  const garrisonMax = spire ? spire.maxGarrison : undefined;
  const regenAt = spire?.besieged && spire.regenResumesAt ? new Date(spire.regenResumesAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const wallTier = preview?.targetWallTier ?? (spire ? spire.wallTier ?? 3 : targetKingdom?.wallTier ?? targetKingdom?.upgrades?.walls ?? 0);
  const wallDefMult = preview?.targetWallDefMult ?? wallDefMultForTier(wallTier);
  const wallHp = preview?.targetWallHp ?? (spire ? spire.wallHp : targetKingdom?.wallHp);
  const wallMaxHp = preview?.targetWallMaxHp ?? (spire ? spire.wallMaxHp : targetKingdom?.wallMaxHp);
  const burning = preview?.targetBurning ?? (spire ? spire.burning : targetKingdom?.burning) ?? false;
  const isArcane = civ === "arcane";
  const shownReport = report ?? fog?.report ?? null;

  return (
    <div className="space-y-2">
      <div className={`p-3 rounded-xl border space-y-2 text-xs ${boxClass}`}>
        <div className="flex items-center justify-between">
          <span className="text-slate-300">
            Garrison · {defUnit.name}s ({defUnit.hp} HP · {defUnit.atk} ATK · {defUnit.def} DEF)
          </span>
          <span className="text-amber-300 font-bold">
            {garrison !== undefined ? garrison.toLocaleString() : fogText(fogRange(shownReport, "garrison"))}
            {spire && garrison !== undefined && garrisonMax ? ` / ${garrisonMax.toLocaleString()}` : ""}
          </span>
        </div>
        {spire && garrison !== undefined && garrisonMax ? (
          <div className="h-2.5 rounded-full bg-slate-900 border border-purple-800/60 overflow-hidden">
            <div className="h-full bg-linear-to-r from-purple-600 to-fuchsia-400" style={{ width: `${(garrison / garrisonMax) * 100}%` }} />
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
          <span className="text-slate-300 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            {WALL_TIER_NAMES[wallTier] ?? "Unwalled"} (Tier {wallTier}) · <strong className="text-sky-300">×{wallDefMult.toFixed(2)} DEF{wallDamageCutText(wallTier)}</strong>
          </span>
          {wallHp !== undefined && wallMaxHp ? (
            <span className={`font-bold flex items-center gap-1 ${burning ? "text-orange-400" : "text-emerald-300"}`}>
              {burning && <Flame className="w-3.5 h-3.5 text-orange-400" />}
              {wallHp.toLocaleString()} / {wallMaxHp.toLocaleString()} HP
            </span>
          ) : fog ? (
            <span className={`font-bold ${burning ? "text-orange-400" : "text-slate-300"}`}>{burning ? "🔥 burning" : fog.wall}</span>
          ) : null}
        </div>
        {wallHp !== undefined && wallMaxHp ? (
          <div className="h-1.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
            <div
              className={`h-full ${burning ? "bg-linear-to-r from-red-600 to-orange-400" : "bg-linear-to-r from-emerald-500 to-sky-400"}`}
              style={{ width: `${Math.min(100, Math.max(0, (wallHp / wallMaxHp) * 100))}%` }}
            />
          </div>
        ) : null}

        <div className="flex items-start gap-1.5 text-[11px] text-slate-300/90">
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>{defUnit.trait}:</strong> {defUnit.traitDesc}{" "}
            {spire
              ? regenAt
                ? `Besieged: the Void Well stays sealed until ${regenAt}.`
                : "The Void Well re-manifests fallen constructs every harvest while no one attacks."
              : isArcane
                ? "Break the garrison to usurp this Nethergarde slot — the defender becomes your civilization."
                : "Battles tick live every 10s. Break the garrison to plunder resources above the protected vault up to surviving troop load."}
          </span>
        </div>
        {spire?.loot && (
          <div className="text-[11px] text-amber-200/90">
            Conquest: Nethergarde ascension + 🪙 {formatCompact(spire.loot.gold ?? 0)} · ⚙️ {formatCompact(spire.loot.iron ?? 0)} · 🪨 {formatCompact(spire.loot.stone ?? 0)}
            {Object.entries(spire.loot.scarce ?? {}).map(([k, v]) => {
              const def = SCARCE_RESOURCES.find((r) => r.key === k);
              return ` · ${def?.emblem ?? "💎"} ${v} ${def?.name ?? k}`;
            })}
          </div>
        )}
      </div>
      {fog && !shownReport && (
        <FogNotice
          lines={[["Garrison", "?"], ...(spire ? [] : ([["Population", "?"], ["Treasury", "?"]] as Array<[string, string]>))]}
        />
      )}
      {shownReport && <ScoutIntel report={shownReport} compact />}
    </div>
  );
}

/** What a gather / claim march would bring home, how long the work takes and whether it's exposed */
function GatherEstimate({ gp, soldiers }: { gp: NonNullable<MarchPreview["gatherPreview"]>; soldiers: number }) {
  const load = Math.floor(soldiers * gp.loadPerSoldier);
  const amount = gp.treasure ? 1 : Math.min(load, gp.remaining ?? load);
  const ms = gp.treasure ? gp.claimMs : (amount / Math.max(0.1, gp.rate)) * 1000;
  const share = gp.treasure ? 1 : amount / Math.max(1, gp.nodeTotal);
  const bulk = ["gold", "iron", "stone", "lumber", "food"];
  const EMOJI: Record<string, string> = { gold: "🪙", iron: "⚙️", stone: "🪨", lumber: "🪵", food: "🌾" };
  const haul = Object.entries(gp.yieldMix)
    .filter(([k]) => bulk.includes(k))
    .map(([k, v]) => [k, Math.floor(v * share)] as const)
    .filter(([, v]) => v > 0);
  const gems = Object.entries(gp.yieldMix).filter(([k, v]) => !bulk.includes(k) && v > 0);
  return (
    <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/15 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-emerald-300 flex items-center gap-1.5">
          <Pickaxe className="w-4 h-4" /> {gp.treasure ? "Claim" : "Expected haul"}
        </span>
        <span className="text-slate-300">
          {gp.treasure ? "claiming" : "gathering"} {formatDuration(ms)}
        </span>
      </div>
      <div className="text-amber-200 flex flex-wrap gap-x-3">
        {haul.map(([k, v]) => (
          <span key={k}>
            {EMOJI[k]} {gp.remaining === null && !gp.treasure ? "≤ " : ""}
            {v.toLocaleString()}
          </span>
        ))}
        {gems.map(([k, v]) => {
          const def = SCARCE_RESOURCES.find((r) => r.key === k);
          return (
            <span key={k} title={gp.treasure ? undefined : "Gems ride along in proportion; whoever empties the node takes the rest"}>
              {def?.emblem ?? "💎"} {gp.treasure ? v : `~${Math.floor(v * share)}`}
            </span>
          );
        })}
      </div>
      {!gp.treasure && (
        <p className="text-[10px] text-slate-500">
          Load {load.toLocaleString()} ({Math.round(gp.loadPerSoldier * 10) / 10}/soldier) · {gp.rate.toFixed(1)}/s · node {gp.remaining !== null ? `${gp.remaining.toLocaleString()} left` : `about ${gp.remainingBand} left`}
        </p>
      )}
      <div className={`flex items-start gap-1.5 text-[11px] ${gp.exposed ? "text-rose-300" : "text-emerald-300"}`}>
        {gp.exposed ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
        <span>
          {gp.exposed
            ? "Exposed: outside your safe territory, other civilizations can attack your workers here and take what they've gathered."
            : "Safe territory: nobody can attack your workers here, so civilians do the work and your garrison stays home. They don't work in the city while they're away."}
        </span>
      </div>
    </div>
  );
}

/** "3 joiners" etc. by the leader's City Hall (mirror of server RALLY_JOINER_CAP) */
function rallyCapText(cityHallLevel: number): string {
  const n = cityHallLevel <= 15 ? 3 : cityHallLevel <= 24 ? 4 : 5;
  return `up to ${n} joiners at City Hall ${cityHallLevel}`;
}

/** Spies & Counterspies: what can go wrong with this many scouts (odds from the server, by party size) */
function ScoutOddsPanel({ odds, scouts }: { odds: NonNullable<MarchPreview["scoutOdds"]>; scouts: number }) {
  const o = odds.bySize[Math.max(0, Math.min(odds.bySize.length - 1, scouts - 1))];
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-500/50 text-zinc-100 text-xs space-y-1.5">
      <div className="flex items-center gap-2 font-bold">
        <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" /> 🕵️ Spies &amp; Counterspies
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <span className="rounded bg-emerald-950/60 border border-emerald-700/50 py-1">✅ True report <strong className="block text-emerald-300">{pct(o.success)}</strong></span>
        <span className="rounded bg-rose-950/60 border border-rose-700/50 py-1">💀 Caught <strong className="block text-rose-300">{pct(o.caught)}</strong></span>
        <span className="rounded bg-amber-950/60 border border-amber-700/50 py-1">🎭 Deceived <strong className="block text-amber-300">{pct(o.deceived)}</strong></span>
      </div>
      <p className="text-[11px] text-zinc-300">
        Caught scouts die and bring nothing back; deceived ones bring home a false report (garrison, people and treasury off by 30–60%). More scouts, 🏮 Lantern Streets and a 🦉 Spymaster&apos;s Tower
        improve your odds.
        {odds.gateCatch > 0 && (
          <>
            {" "}
            🚧 Watched Borders: this city lies behind its standing frontier gate, whose watch adds <strong>{pct(odds.gateCatch)}</strong> to the catch chance (more as the gate fills up; nothing while it burns).
          </>
        )}
      </p>
    </div>
  );
}
