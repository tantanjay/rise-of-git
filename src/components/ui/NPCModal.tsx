import { useEffect, useState } from "react";
import { ActiveMarch, BattleLoot, BossStatus, CivilizationType, SCARCE_RESOURCES, MapNPC, NodeStatus, NpcKingdomStatus, NPCCategory, NPCRarity, RealmCycle, ScoutReport } from "@/types";
import { CIV_DEMOGRAPHICS } from "@/utils/civDemographics";
import { CIV_EMBLEM, GATE_DUTY_TEXT, GATE_REINFORCE_CAP, NPC_GATE_CIV, formatLongDuration } from "@/utils/war";
import { NPCIslandData } from "@/components/3d/NPCIslandsSphere3D";
import { HOSTILE_NPC_TYPES } from "@/components/3d/world/npcs";
import { landmarkStateLabel } from "@/components/3d/world/landmarkStages";
import { REALM_STAGES, REALM_STAGE_LEVELS, realmStageLabel } from "@/components/3d/world/realmTypes";
import { Modal } from "./Modal";
import { FogNotice, ScoutIntel } from "./ScoutIntel";
import type { ComposerKind } from "./AttackModal";
import { NodeStatusLine } from "./ScoutIntel";
import { CombatBanner } from "./CombatBanner";
import { StationedTroops } from "./StationedTroops";
import { HorrorDays } from "./HorrorChip";
import { HORROR, horrorWait, useRealmHorrors } from "@/utils/horror";
import { ShieldAlert, Sparkles, MapPin, Clock, Coins, Swords, Compass, Landmark, Flame } from "lucide-react";

export type ModalNPCData = MapNPC | NPCIslandData;

interface NPCModalProps {
  island: ModalNPCData | null;
  onClose: () => void;
  /** Open the march composer on this NPC (attack a mob / bandit, scout anything) */
  onMarch?: (npc: MapNPC, kind: ComposerKind) => void;
  /** The viewer's latest scout report of this NPC */
  report?: ScoutReport | null;
  /** Resource node / chest status: what's left, who is gathering it */
  nodeStatus?: NodeStatus | null;
  /** The viewer's civilization (to tell whether gatherers there can be attacked) */
  myCiv?: CivilizationType | null;
  /** World boss: shared HP, skills, respawn */
  bossStatus?: BossStatus | null;
  /** NPC kingdom: level, donor civ, fogged garrison and walls */
  npcKingdomStatus?: NpcKingdomStatus | null;
  /** A battle is being fought here right now */
  combat?: { round: number; maxRounds: number } | null;
  /** The viewer's kingdom id (their own troops on gate duty) */
  myId?: string | null;
  /** Marches on the map: troops on duty at the viewer's own frontier gate */
  activeMarches?: ActiveMarch[];
}

/** Target panel actions by NPC category; `soon` = shown but not available yet */
type PanelAction = { kind: ComposerKind; label: string; icon: string; soon?: string };
const ACTIONS: Record<NPCCategory, PanelAction[]> = {
  mob: [
    { kind: "attack", label: "Attack", icon: "⚔️" },
    { kind: "scout", label: "Scout", icon: "👁️" }
  ],
  bandit: [
    { kind: "attack", label: "Attack", icon: "⚔️" },
    { kind: "scout", label: "Scout", icon: "👁️" }
  ],
  boss: [
    { kind: "attack", label: "Attack", icon: "⚔️" },
    { kind: "rally", label: "Rally", icon: "🚩" },
    { kind: "scout", label: "Scout", icon: "👁️" }
  ],
  kingdom: [
    { kind: "attack", label: "Attack", icon: "⚔️" },
    { kind: "rally", label: "Rally", icon: "🚩" },
    { kind: "scout", label: "Scout", icon: "👁️" }
  ],
  resource: [
    { kind: "gather", label: "Gather", icon: "⛏️" },
    { kind: "scout", label: "Scout", icon: "👁️" }
  ],
  treasure: [
    { kind: "gather", label: "Claim", icon: "💎" },
    { kind: "scout", label: "Scout", icon: "👁️" }
  ],
  terrain: [{ kind: "scout", label: "Scout (lore)", icon: "👁️" }]
};

const RARITY_STYLES: Record<NPCRarity, { badge: string; text: string; border: string }> = {
  common: { badge: "bg-slate-800 text-slate-300 border-slate-600/50", text: "text-slate-300", border: "border-slate-600/40" },
  uncommon: { badge: "bg-emerald-950 text-emerald-300 border-emerald-500/50", text: "text-emerald-400", border: "border-emerald-500/40" },
  rare: { badge: "bg-blue-950 text-blue-300 border-blue-500/50", text: "text-blue-400", border: "border-blue-500/40" },
  epic: { badge: "bg-purple-950 text-purple-300 border-purple-500/50", text: "text-purple-400", border: "border-purple-500/40" },
  legendary: { badge: "bg-amber-950 text-amber-300 border-amber-500/60 shadow-sm shadow-amber-950", text: "text-amber-400", border: "border-amber-500/50" },
  mythical: { badge: "bg-linear-to-r from-rose-950 via-black to-purple-950 text-rose-200 border-rose-500/70 shadow-sm shadow-rose-900", text: "text-rose-400", border: "border-rose-500/60" }
};

const CATEGORY_INFO: Record<NPCCategory, { label: string; icon: any; headerBg: string; border: string; btn: string }> = {
  boss: {
    label: "BUFFER SOVEREIGN BOSS",
    icon: Flame,
    headerBg: "from-red-950 via-purple-950 to-slate-950",
    border: "border-red-500/60",
    btn: "bg-linear-to-r from-red-600 via-rose-600 to-purple-600 hover:from-red-500 hover:to-purple-500 text-white"
  },
  kingdom: {
    label: "BUFFER REALM",
    icon: Landmark,
    headerBg: "from-indigo-950 via-blue-950 to-slate-950",
    border: "border-indigo-500/60",
    btn: "bg-linear-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white"
  },
  terrain: {
    label: "LANDMARK WONDER",
    icon: Compass,
    headerBg: "from-cyan-950 via-teal-950 to-slate-950",
    border: "border-cyan-500/60",
    btn: "bg-linear-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white"
  },
  resource: {
    label: "HARVEST NODE",
    icon: Coins,
    headerBg: "from-emerald-950 via-teal-950 to-slate-950",
    border: "border-emerald-500/60",
    btn: "bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white"
  },
  mob: {
    label: "ROVING WILD MOB",
    icon: Swords,
    headerBg: "from-orange-950 via-amber-950 to-slate-950",
    border: "border-orange-500/60",
    btn: "bg-linear-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white"
  },
  bandit: {
    label: "BANDIT WARBAND",
    icon: ShieldAlert,
    headerBg: "from-red-950 via-amber-950 to-slate-950",
    border: "border-red-500/60",
    btn: "bg-linear-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white"
  },
  treasure: {
    label: "UNCLAIMED TREASURE",
    icon: Sparkles,
    headerBg: "from-amber-950 via-yellow-950 to-slate-950",
    border: "border-amber-500/60",
    btn: "bg-linear-to-r from-amber-600 via-yellow-600 to-amber-500 hover:from-amber-500 hover:to-yellow-400 text-white"
  }
};

export function NPCModal({ island, onClose, onMarch, report, nodeStatus, myCiv, bossStatus, npcKingdomStatus, combat, myId, activeMarches }: NPCModalProps) {
  // Timers are read once per open (the panel re-renders with every status refresh anyway)
  const [now] = useState(() => Date.now());
  if (!island) return null;

  const category = ("category" in island && island.category ? island.category : null) as NPCCategory | null;
  const rarity = ("rarity" in island && island.rarity ? island.rarity : "common") as NPCRarity;
  const catTheme = category ? CATEGORY_INFO[category] : null;
  const rarTheme = RARITY_STYLES[rarity] || RARITY_STYLES.common;

  const hostile =
    category === "boss" || category === "kingdom" || category === "mob" || category === "bandit" || HOSTILE_NPC_TYPES.has(island.type as string);

  const location =
    "x" in island && island.x !== undefined
      ? `${island.region || "The Wilds"} · [${island.x}, ${island.z}]`
      : "lat" in island && island.lat !== undefined
        ? `${Math.abs(island.lat)}°${island.lat > 0 ? "N" : "S"}, ${Math.abs(island.lon)}°${island.lon > 0 ? "E" : "W"}`
        : "Unknown realm";

  const resourceYield = "resourceYield" in island ? island.resourceYield : null;
  const bossRotationPool = "bossRotationPool" in island ? island.bossRotationPool : null;
  const expiresAt = "expiresAt" in island ? island.expiresAt : null;
  // Globe islands (NPCIslandData) have no category: info only
  const mapNpc = "category" in island && island.category && "x" in island ? (island as MapNPC) : null;
  const pack = mapNpc?.pack;
  const chest = mapNpc?.chest;
  // Workers of another civilization outside their safe territory can be attacked
  const g = nodeStatus?.gatherer;
  const attackGatherers = Boolean(g && g.exposed && !g.mine && g.civ !== myCiv);
  // A frontier gate of the viewer's own civilization guards their border: never attacked by them, only reinforced
  const ownGate = Boolean(mapNpc && myCiv && NPC_GATE_CIV[mapNpc.id] === myCiv);
  const actions: PanelAction[] = category
    ? [
        ...(attackGatherers ? [{ kind: "attack" as const, label: "Attack workers", icon: "⚔️" }] : []),
        ...ACTIONS[category].map((a) =>
          a.kind === "gather" && g
            ? { ...a, soon: g.mine ? "Your workers are already there" : "Someone is working it — wait until they leave" }
            : (a.kind === "attack" || a.kind === "rally") && category === "kingdom" && mapNpc?.landmarkState
              ? { ...a, soon: mapNpc.landmarkState.phase === "rising" ? "Being built up — shielded until the scaffolding comes down" : "Leaving the realm — nothing left to fight for" }
            : (a.kind === "attack" || a.kind === "rally") && ownGate
              ? { ...a, soon: "Your own civilization's border gate — it can't be attacked or rallied on" }
              : (a.kind === "attack" || a.kind === "rally") && mapNpc?.horrorPhase === "approach"
              ? { ...a, soon: "Still on the road: it can be fought once it reaches the gates" }
              : (a.kind === "attack" || a.kind === "rally") && bossStatus?.dead
              ? { ...a, soon: "It has fallen — the next boss wakes here soon" }
              : (a.kind === "attack" || a.kind === "rally") && npcKingdomStatus?.burning
                ? { ...a, soon: "Burning — protected until its walls repair above 25%" }
                : a
        ),
        ...(ownGate
          ? [
              {
                kind: "reinforce" as const,
                label: "Reinforce",
                icon: "🛡️",
                soon: npcKingdomStatus?.burning ? "Burning — it takes no reinforcements until its walls repair above 25%" : undefined
              }
            ]
          : [])
      ]
    : [];

  return (
    <Modal
      open
      onClose={onClose}
      accentBorder={catTheme?.border || rarTheme.border}
      headerClassName={`bg-linear-to-b ${catTheme?.headerBg || "from-slate-900 to-slate-950"}`}
      header={
        <div className="flex items-center gap-3">
          <span className="text-3xl w-12 h-12 shrink-0 rounded-xl bg-slate-900/80 border border-slate-700/60 flex items-center justify-center shadow-lg">
            {island.emblem}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold font-medieval text-slate-100 tracking-wide truncate">{island.name}</h3>
              {category && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-200 border border-slate-600/50 uppercase font-semibold">
                  {mapNpc?.horrorPhase ? "The Overseers' Horror" : catTheme?.label}
                </span>
              )}
              {rarity && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold ${rarTheme.badge}`}>
                  {rarity}
                </span>
              )}
            </div>
            <p className={`text-xs ${rarTheme.text} font-medium truncate mt-0.5`}>{island.subtitle}</p>
            {"landmarkState" in island && island.landmarkState && (
              <p className="text-[11px] text-amber-200 font-semibold truncate">{landmarkStateLabel(island.landmarkState, now, category === "kingdom")}</p>
            )}
            {"fallenName" in island && island.fallenName && (
              <p className="text-[11px] text-cyan-300 font-medium truncate">👻 Rising where {island.fallenName} fell</p>
            )}
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 text-xs font-medium transition cursor-pointer">
            Close
          </button>
          {mapNpc &&
            actions.map((a) => (
              <button
                key={a.kind}
                disabled={Boolean(a.soon) || !onMarch}
                title={a.soon}
                onClick={() => {
                  if (a.soon || !onMarch) return;
                  onMarch(mapNpc, a.kind);
                  onClose();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  a.kind === "scout"
                    ? "bg-linear-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white"
                    : a.kind === "attack" && attackGatherers
                      ? "bg-linear-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white"
                      : catTheme?.btn || "bg-amber-600 hover:bg-amber-500 text-white"
                }`}
              >
                <span>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
        </div>
      }
    >
      <div className="p-5 space-y-4 text-sm">
        <CombatBanner combat={combat} />
        {/* Meta badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300 font-mono flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>{location}</span>
          </span>

          {(expiresAt || mapNpc?.heldOver) && (
            <span className="px-2 py-1 rounded-lg bg-amber-950/60 border border-amber-600/50 text-amber-300 font-mono flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{mapNpc?.heldOver ? "Staying until the match here ends" : category === "resource" ? "Wave Node · gone at the next respawn" : "Roving Spawn"}</span>
            </span>
          )}

          {hostile ? (
            <span className="px-2 py-1 rounded-lg bg-red-950/60 border border-red-700/50 text-red-300 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Hostile threat
            </span>
          ) : (
            <span className="px-2 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Peaceful discovery
            </span>
          )}
        </div>

        {nodeStatus && <NodeStatusLine status={nodeStatus} />}

        {/* Intel: exact from the viewer's scout report, bands otherwise */}
        {report ? (
          <ScoutIntel report={report} />
        ) : pack ? (
          <FogNotice lines={[["Pack", `${pack.band} ${pack.unitName}s${pack.wounded ? " (wounded)" : ""}`], ["HP left", `${Math.round(pack.health * 100)}%`], ["Tier", rarity]]} scoutedAt={pack.scoutedAt} />
        ) : chest ? (
          <FogNotice lines={[["Chest", chest.band === "hoard" ? "a great hoard" : `a ${chest.band} chest`]]} scoutedAt={chest.scoutedAt} />
        ) : null}

        {category === "boss" && bossStatus && <BossPanel boss={bossStatus} now={now} horror={Boolean(mapNpc?.horrorPhase)} />}
        {mapNpc?.horrorPhase && <HorrorPanel npcId={mapNpc.id} now={now} />}
        {category === "kingdom" && npcKingdomStatus && <NpcKingdomPanel k={npcKingdomStatus} realm={mapNpc?.realm} scouted={Boolean(report)} now={now} ownGate={ownGate} />}
        {/* Troops on duty: only the gate's own civilization sees them (others only through the fog) */}
        {ownGate && mapNpc && activeMarches && <StationedTroops marches={activeMarches} hostId={mapNpc.id} viewerId={myId} cap={GATE_REINFORCE_CAP[myCiv!]} />}

        {/* Description */}
        <p className="text-slate-300 leading-relaxed">{island.description}</p>

        {/* Resource Yield Box */}
        {resourceYield && (
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 space-y-2">
            <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
              <Coins className="w-4 h-4" />
              <span>Guaranteed Resource Yield</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {Object.entries(resourceYield).map(([resKey, amount]) => (
                <div key={resKey} className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-emerald-500/40 flex items-center gap-2">
                  <span className="text-sm">
                    {resKey === "gold" ? "🪙" : resKey === "iron" ? "⛏️" : resKey === "stone" ? "🪨" : resKey === "lumber" ? "🪵" : resKey === "food" ? "🌾" : "💎"}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-100">+{amount.toLocaleString()}</span>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">{resKey}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Boss Rotation Box */}
        {bossRotationPool && bossRotationPool.length > 0 && (
          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-950/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-red-300 uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-red-400" />
                <span>Zone Boss Rotation</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Active: {(bossStatus?.bossIndex ?? ("bossIndex" in island ? (island.bossIndex as number) : 0)) + 1} of {bossRotationPool.length}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Each buffer zone keeps 3 bosses; the next one wakes every Sunday 00:00 UTC whatever state the current one is in, and whenever the current one is felled (24 h after its fall):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {bossRotationPool.map((b, idx) => {
                const activeIdx = bossStatus?.bossIndex ?? bossRotationPool.findIndex((p) => p.name === island.name);
                const isActive = idx === activeIdx;
                // The next boss of the pool: it wakes where the current one fell, or at the weekly rotation
                const nextIdx = bossStatus?.dead && bossStatus.next ? bossStatus.next.bossIndex : (activeIdx + 1) % bossRotationPool.length;
                const isNext = idx === nextIdx && !isActive && bossRotationPool.length > 1;
                const slumbering = isActive && bossStatus?.dead;
                const wakesAt = bossStatus ? (bossStatus.dead ? bossStatus.next?.wakesAt ?? bossStatus.rotatesAt : bossStatus.rotatesAt) : null;
                const rotatesIn = wakesAt ? formatLongDuration(wakesAt - now) : null;
                return (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg border text-xs ${
                      slumbering
                        ? "border-cyan-500/50 bg-cyan-950/30 text-cyan-200"
                        : isActive
                          ? "border-red-500/60 bg-red-950/60 text-red-200"
                          : isNext
                            ? `border-amber-500/50 bg-amber-950/20 text-amber-200 ${bossStatus?.dead ? "ring-1 ring-amber-400/40" : ""}`
                            : "border-slate-800 bg-slate-900/40 text-slate-400 opacity-70"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <span>{b.emblem}</span>
                      <span className="truncate">{b.name}</span>
                    </div>
                    <div className="text-[10px] mt-0.5 truncate">
                      {slumbering ? "💀 FALLEN" : isActive ? "⚔️ CURRENT BOSS" : isNext ? (bossStatus?.dead ? "👻 RISING" : "⏭ NEXT BOSS") : "Dormant"}
                    </div>
                    {slumbering && <div className="text-[10px] truncate opacity-80">the next boss takes its place</div>}
                    {isNext && rotatesIn && (
                      <div className="text-[10px] truncate opacity-80">
                        wakes in {rotatesIn}
                        {bossStatus?.dead && bossStatus.next?.vengeance ? ` · 🔥 +${bossStatus.next.vengeance * 10}%` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

const LOOT_EMOJI: Record<string, string> = { gold: "🪙", iron: "⚙️", stone: "🪨", lumber: "🪵", food: "🌾" };

/** "🪙 4,000 · ⚙️ 8,000 · 🐉 2" */
function lootLine(loot: BattleLoot | null | undefined): string {
  if (!loot) return "nothing";
  const bulk = Object.entries(LOOT_EMOJI)
    .filter(([k]) => ((loot as Record<string, unknown>)[k] as number) > 0)
    .map(([k, e]) => `${e} ${((loot as Record<string, number>)[k]).toLocaleString()}`);
  const gems = Object.entries(loot.scarce ?? {}).map(([k, v]) => `${SCARCE_RESOURCES.find((r) => r.key === k)?.emblem ?? "💎"} ${v}`);
  return [...bulk, ...gems].join(" · ") || "nothing";
}

/** "1:04:09" / "4:09" */
function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** World boss: shared HP (public), skills, respawn and rotation timers, top damage dealers this life; while it slumbers, its last fall and who wakes next */
/** 🌑 Xal'Vorath: who it is coming for, how long it has left and the target's three days of work */
function HorrorPanel({ npcId, now }: { npcId: string; now: number }) {
  const h = useRealmHorrors().find((x) => x.npcId === npcId);
  if (!h) return null;
  const siege = h.phase === "siege";
  return (
    <div className="p-3 rounded-xl border border-violet-500/40 bg-violet-950/20 text-xs text-violet-100 space-y-2">
      <div className="font-bold text-violet-200">
        Level {h.level}
        {h.split > 1 ? ` · split among ${h.split} kingdoms` : ""} · {siege ? `burns ${h.targetName}'s kingdom in ${horrorWait(h.siegeEndsAt - now)}` : `at ${h.targetName}'s gates in ${horrorWait(h.arrivesAt - now)}`}
      </div>
      {siege ? (
        <p className="text-slate-300">{h.targetName} and the rulers of their civilization can march on it or raise a rally. It keeps its wounds from one battle to the next.</p>
      ) : (
        <>
          <p className="text-slate-300">If {h.targetName} earns {HORROR.XP_PER_DAY} XP on each of these days it is driven back on arrival:</p>
          <HorrorDays h={h} />
        </>
      )}
    </div>
  );
}

function BossPanel({ boss, now: openedAt, horror = false }: { boss: BossStatus; now: number; /** Xal'Vorath: no rotation, no Vengeance */ horror?: boolean }) {
  const pct = boss.maxHp ? Math.round((boss.hp / boss.maxHp) * 100) : 0;
  // A slumbering zone counts down to its next boss waking, live
  const [now, setNow] = useState(openedAt);
  useEffect(() => {
    if (!boss.dead) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [boss.dead]);
  const kill = boss.lastKill;
  return (
    <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/25 text-xs text-red-100 space-y-2">
      <div className="flex items-center justify-between font-mono">
        <span className="font-bold text-red-300 flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-red-400" /> {boss.dead ? "⏳ Slumbering" : "Shared HP"}
        </span>
        <span className={boss.dead ? "text-cyan-200 tabular-nums" : ""}>
          {boss.dead
            ? `${boss.next ? `${boss.next.emblem} ${boss.next.name} wakes` : "respawns"} in ${clock((boss.next?.wakesAt ?? boss.respawnAt ?? now) - now)}`
            : `${boss.hp.toLocaleString()} / ${boss.maxHp.toLocaleString()} (${pct}%)`}
        </span>
      </div>
      {boss.dead && kill && (
        <div className="p-2 rounded-lg border border-cyan-500/40 bg-cyan-950/20 text-[11px] text-cyan-100 space-y-1">
          <div className="font-bold text-cyan-300">
            🏆 {boss.emblem} {boss.name} felled by {kill.by}'s army · {formatLongDuration(now - kill.at)} ago
          </div>
          <div>
            <span className="text-slate-400">Hoard carried home:</span> {lootLine(kill.hoard)}
          </div>
          {kill.bounty.length > 0 && (
            <div className="font-mono space-y-0.5">
              <div className="text-slate-400 uppercase text-[10px] font-sans">Bounty, shared by damage dealt</div>
              {kill.bounty.map((b) => (
                <div key={b.name} className="flex justify-between gap-2">
                  <span className="truncate">
                    {b.name} <span className="text-slate-500">({b.damage.toLocaleString()} dmg)</span>
                  </span>
                  <span className="text-amber-200 shrink-0">{lootLine(b.loot)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!boss.dead && (
        <div className="h-2 rounded-full bg-slate-900 border border-red-900/60 overflow-hidden">
          <div className="h-full bg-linear-to-r from-red-600 to-orange-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      <ul className="text-[11px] text-red-200/90 space-y-0.5">
        <li>
          ⚔️ ATK {boss.stats.atk.toLocaleString()} · 🛡️ DEF {boss.stats.def} · one giant unit, fights in the open
        </li>
        {boss.skills.map((sk) => (
          <li key={sk}>✴️ {sk}</li>
        ))}
        <li>🪨 Colossus Hide: armies land (City Hall ÷ 25)² of their blows (City Hall 15: 36% · 20: 64% · 25: full)</li>
        {!horror && (
          <li className={boss.vengeance > 0 ? "text-orange-300 font-semibold" : ""}>
            🔥 Vengeance{boss.vengeance > 0 ? ` ×${boss.vengeance}: +${boss.vengeance * 10}% HP, ATK and DEF` : ": none yet"} · each kill this week makes the next boss here +10% stronger (resets Sunday)
            {boss.dead && boss.next && boss.next.vengeance > 0 ? ` · ${boss.next.name} wakes with +${boss.next.vengeance * 10}%` : ""}
          </li>
        )}
      </ul>
      <p className="text-[11px] text-slate-300">
        {horror ? "Its wounds stay for everyone, from one battle to the next." : <>Its wounds stay for everyone — no healing until it falls (then the next boss of the pool wakes here 24 h later) or the weekly rotation in {formatLongDuration(boss.rotatesAt - now)}.</>} The killing army or
        rally carries its hoard home by load; everyone who wounded it this life shares the bounty by damage dealt.{horror ? " The ruler who wounded it most takes the Heart of the Void." : ""}
      </p>
      {boss.topDamage.length > 0 && !(boss.dead && kill) && (
        <div className="text-[11px] font-mono text-slate-300">
          <div className="text-slate-400 uppercase text-[10px]">Wounded it this life</div>
          {boss.topDamage.map((d) => (
            <div key={d.userId} className="flex justify-between">
              <span className="truncate">{d.name}</span>
              <span>{d.damage.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** NPC kingdom: what anyone can see from outside (always fogged); numbers come only from a scout report */
function NpcKingdomPanel({ k, realm, scouted, now, ownGate }: { k: NpcKingdomStatus; realm?: RealmCycle; scouted: boolean; now: number; ownGate: boolean }) {
  const unit = CIV_DEMOGRAPHICS[k.civ].soldierUnit.name;
  return (
    <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-950/25 text-xs text-indigo-100 space-y-1.5">
      {k.gate && <GateSealLine k={k} now={now} ownGate={ownGate} />}
      {realm && <RealmCycleLine realm={realm} now={now} />}
      <div className="flex items-center justify-between gap-2 font-mono">
        <span className="font-bold text-indigo-300 flex items-center gap-1.5">
          <Landmark className="w-4 h-4" /> City Hall {k.level} · {CIV_EMBLEM[k.civ]} {unit}s
        </span>
        <span className={k.burning ? "text-orange-300" : "text-slate-300"}>
          Walls tier {k.wallTier} · {k.burning ? `burning ${k.burningEndsAt ? formatLongDuration(k.burningEndsAt - now) : ""}` : k.wall}
        </span>
      </div>
      {!scouted && (
        <div className="text-[11px] text-slate-300 font-mono">
          Garrison ? · people ? · treasury ? (send 👁️ scouts to find out)
        </div>
      )}
      {k.gate ? (
        <p className="text-[11px] text-slate-300">
          A frontier gate held by {unit}s of the {k.civ} civilization, with its own rulers' troops on gate duty beside them. Beat them to plunder what lies above its vault; set it
          burning (walls below 25%) to open its province. Its base garrison regrows every harvest; it is never destroyed.
        </p>
      ) : (
        <p className="text-[11px] text-slate-300">
          A simulated kingdom with the people and soldiers of the {k.civ} civilization: it takes real losses, regrows by births every harvest and refills its treasury. Beat
          its garrison to plunder what lies above its vault (by your survivors' load). It is never destroyed — a burning one is protected until its walls repair above 25%.
        </p>
      )}
    </div>
  );
}

/** A buffer realm's place in its 28-day cycle: stage, today's level, what comes next */
function RealmCycleLine({ realm, now }: { realm: RealmCycle; now: number }) {
  const [lo, hi] = REALM_STAGE_LEVELS[realm.stage] ?? [21, 25];
  const last = realm.stage >= REALM_STAGES.length - 1;
  const next = last ? "then it leaves the realm, and another rises somewhere in the region" : `then it is built up to ${REALM_STAGES[realm.stage + 1]}`;
  return (
    <div className="p-2 rounded-lg border border-indigo-400/40 bg-indigo-900/30 text-[11px]">
      <div className="font-bold font-mono">🚩 {realmStageLabel(realm)}</div>
      <div className="mt-0.5 text-slate-300">
        {realm.building
          ? "Being built up today: shielded, no attacks or rallies (scouts may look). "
          : `It gains a City Hall level a day (${lo}–${hi} this stage), refilled to full each time. `}
        Stage ends in {formatLongDuration(realm.stageEndsAt - now)}, {next}.
      </div>
    </div>
  );
}

/** A frontier gate's seal: sealed while it stands (its province's cities can't be attacked), open while it burns */
function GateSealLine({ k, now, ownGate }: { k: NpcKingdomStatus; now: number; ownGate: boolean }) {
  const sealed = k.gate?.sealed ?? !k.burning;
  return (
    <div className={`p-2 rounded-lg border text-[11px] ${sealed ? "border-amber-500/40 bg-amber-950/30 text-amber-100" : "border-orange-500/50 bg-orange-950/40 text-orange-100"}`}>
      <div className="font-bold font-mono">
        {sealed ? "🚧 Province sealed" : `🔥 Province open${k.burningEndsAt ? ` · ${formatLongDuration(k.burningEndsAt - now)} left` : ""}`}
      </div>
      <div className="mt-0.5 text-slate-300">
        {sealed
          ? ownGate
            ? `While it stands, no other civilization can attack your province's cities. Reinforce it to keep it standing: each soldier on gate duty costs ${GATE_DUTY_TEXT} per harvest.`
            : `While it stands, its province's cities can't be attacked. Burn it first. Its watch adds ${Math.round((k.gate?.catchChance ?? 0) * 100)}% to the chance that scouts heading in are caught.`
          : "Its walls burn: the province's cities can be attacked and the border is unwatched until the walls repair above 25%."}
      </div>
    </div>
  );
}
