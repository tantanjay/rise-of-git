import { useEffect, useMemo, useRef, useState } from "react";
import { marchForceText } from "@/utils/mercenaries";
import { createPortal } from "react-dom";
import { GameSettingsModal } from "./GameSettingsModal";
import { DeveloperKingdom, CivilizationType, SCARCE_RESOURCES, AuthUser, ActiveMarch } from "@/types";
import { formatDuration } from "@/utils/war";
import { sound } from "@/hooks/useSound";
import { formatCompact } from "@/utils/format";
import { RealmTimeButton } from "./RealmTimeButton";
import { DisasterChip } from "./DisasterChip";
import { fogHint, fogRange, fogText, fogTreasury } from "@/utils/fog";
import { OverseerMedal, OVERSEER_TITLE, ARCHON_TITLE } from "./OverseerMedal";
import { CivFrame, ArchonSeal } from "./CivFrame";
import { RenownLevel, RenownTitles, RenownHouse, placeIn, useRenownPodium } from "./RenownBadges";
import { proclamationsOf } from "./RoyalProclamations";
import type { RenownPodium } from "@/types";
import { Map, Castle, Settings, ChevronDown, Search, UserRound, ScrollText, LogIn, LogOut, Home, ShieldAlert, Library, Swords, Menu, Crown, Trophy, Skull, Feather, Sparkles, Telescope, Megaphone } from "lucide-react";

interface TopHUDProps {
  viewMode: "world_map" | "city_view";
  kingdoms: DeveloperKingdom[];
  currentKingdom: DeveloperKingdom | null;
  syncIntervalMinutes?: number;
  /** Local epoch ms of the next roving-encounter respawn (every SYNC_INTERVAL_MINUTES × 2) */
  nextRespawnAt?: number | null;
  /** Minutes between roving respawns (server: SYNC_INTERVAL_MINUTES × 2) */
  rovingWindowMinutes?: number;
  onToggleViewMode: () => void;
  onSelectKingdom: (id: string) => void;
  onOpenLedger?: () => void;
  onOpenDevProfile?: () => void;
  /** Kingdom (game) info: realm overview, population & army, census */
  onOpenKingdom?: () => void;
  onOpenCodex?: () => void;
  /** ☰ → What's New: every update notice */
  onOpenWhatsNew?: () => void;
  /** 🏆 Hall of Renown (leaderboards) */
  onOpenRenown?: () => void;
  activeMarches?: ActiveMarch[];
  /** Battle reports involving the signed-in player that haven't been opened yet */
  unreadBattleReports?: number;
  onOpenWarRoom?: () => void;
  me?: AuthUser | null;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  adminWarnings?: number;
  /** 👑 Royal Decrees (admins and Special Overseers) */
  onOpenDecrees?: () => void;
  /** 🪶 Scriptorium (everyone) and, for managers, the deeds waiting for a seal */
  onOpenScriptorium?: () => void;
  pendingDeeds?: number;
  onOpenDeedReview?: () => void;
  /** 🌠 Send an Omen (signed in) and, for admins, the unread omens */
  onSendOmen?: () => void;
  newOmens?: number;
  onOpenOmens?: () => void;
  /** 🔭 The Watchtower (Admins, Special Overseers, the Archon) */
  onOpenWatchtower?: () => void;
  authEnabled?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

export const CIV_META: Record<CivilizationType, { label: string; realm: string; icon: string; ring: string }> = {
  human: { label: "Human", realm: "Valoria", icon: "👑", ring: "ring-blue-500/50" },
  elf: { label: "Elf", realm: "Sylvandale", icon: "🌸", ring: "ring-teal-500/50" },
  dwarf: { label: "Dwarf", realm: "Ironforge", icon: "⚒️", ring: "ring-orange-500/50" },
  orc: { label: "Orc", realm: "Drak'mar", icon: "⚔️", ring: "ring-red-500/50" },
  arcane: { label: "Arcane", realm: "Nethergarde", icon: "🔮", ring: "ring-purple-500/50" }
};

const iconBtn =
  "shrink-0 flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-xl border border-slate-700/80 bg-slate-800/70 hover:bg-slate-700 hover:border-slate-600 text-slate-200 text-xs font-semibold transition active:scale-95";

/* ------------------------------------------------------------------------- */
/* Searchable developer picker                                               */
/* ------------------------------------------------------------------------- */

/** Sort key "Lastname, Firstname": names already written that way are kept, "First Last" is flipped */
function lastFirst(name: string): string {
  const n = name.trim();
  if (n.includes(",")) return n;
  const parts = n.split(/\s+/);
  return parts.length > 1 ? `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}` : n;
}

function KingdomPicker({
  kingdoms,
  current,
  meId,
  onSelect,
  podium,
  onOpen
}: {
  kingdoms: DeveloperKingdom[];
  current: DeveloperKingdom;
  meId?: string;
  onSelect: (id: string) => void;
  /** Hall of Renown top 3 per tab (badges and civ frames) */
  podium: RenownPodium | null;
  /** Called when the list opens (refreshes the podium) */
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    onOpen();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpen]);

  // A–Z by "Lastname, Firstname"; the signed-in developer always comes first
  const sorted = useMemo(
    () =>
      [...kingdoms].sort((a, b) => {
        if (a.id === meId) return -1;
        if (b.id === meId) return 1;
        return lastFirst(a.name).localeCompare(lastFirst(b.name), undefined, { sensitivity: "base" });
      }),
    [kingdoms, meId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((k) => !q || k.name.toLowerCase().includes(q) || k.username.toLowerCase().includes(q));
  }, [sorted, query]);

  const civ = CIV_META[current.civilization] || CIV_META.human;

  return (
    // It takes what its row has left (basis 0, up to a cap), its name truncating when the row is crowded, so the picker
    // gives way before any button wraps onto a new line; on phones too narrow for a name it shows only the civ badge
    // (container query)
    <div ref={rootRef} className="relative max-sm:@container min-w-[4.25rem] flex-1 basis-0 sm:max-w-[19rem] lg:max-w-[13rem]">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className="flex items-center gap-2 h-9 pl-1.5 pr-2.5 rounded-xl border border-slate-700/80 bg-slate-800/70 hover:bg-slate-700 transition min-w-0 w-full overflow-hidden"
        title={`${current.name} — ${current.kingdomTitle}`}
      >
        <span className={`shrink-0 w-7 h-7 rounded-lg bg-slate-900 ring-1 ${civ.ring} flex items-center justify-center text-sm`}>{civ.icon}</span>
        <span className="hidden @[7.5rem]:block sm:block flex-1 min-w-0 text-left leading-tight">
          <span className="block truncate text-xs font-semibold text-slate-100">{current.name}</span>
          <span className="block truncate text-[10px] text-amber-300/80 font-medieval">
            {civ.label} · {civ.realm}
          </span>
        </span>
        <ChevronDown className={`shrink-0 ml-auto w-4 h-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 overflow-hidden z-50 animate-fadeIn">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${kingdoms.length} developers…`}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered[0]) {
                  sound.playClick();
                  onSelect(filtered[0].id);
                  setOpen(false);
                }
              }}
            />
          </div>
          <ul className="max-h-[60vh] overflow-y-auto py-1.5">
            {filtered.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-500">No developer matches “{query}”.</li>}
            {filtered.map((k) => {
              const m = CIV_META[k.civilization] || CIV_META.human;
              const active = k.id === current.id;
              const count = k.buildings?.length ?? (k as DeveloperKingdom & { buildingCount?: number }).buildingCount ?? 0;
              const titles = k.earnedTitles ?? [];
              return (
                <li key={k.id}>
                  <button
                    onClick={() => {
                      sound.playClick();
                      onSelect(k.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition ${active ? "bg-amber-500/10" : "hover:bg-slate-800"}`}
                  >
                    <span className="shrink-0" title={`${m.label}${k.isArchon ? " · Archon of the Realm" : k.isSpecial ? " · Special Overseer" : ""}${placeIn(podium?.all, k.id) ? ` · Hall of Renown #${placeIn(podium?.all, k.id)} of all time` : ""}`}>
                      <CivFrame civ={k.civilization} overseer={Boolean(k.isSpecial)} archon={Boolean(k.isArchon)} renown={placeIn(podium?.all, k.id)} initial={k.name.charAt(0)} className="w-6 h-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-xs font-semibold ${active ? "text-amber-300" : "text-slate-200"}`}>
                        <span className="inline-block mr-1.5 align-[1px]">
                          <RenownLevel level={k.cityHallLevel} place={placeIn(podium?.week, k.id)} />
                        </span>
                        {k.name}
                        {k.id === meId && <span className="ml-1.5 px-1 rounded bg-emerald-900/70 text-emerald-300 text-[9px] font-bold">YOU</span>}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">{k.kingdomTitle}</span>
                    </span>
                    {k.isArchon ? (
                      <span className="shrink-0 drop-shadow-[0_0_6px_rgba(220,38,38,0.7)]">
                        <ArchonSeal className="w-5 h-5" title={`Archon's Seal · ${ARCHON_TITLE.name}`} />
                      </span>
                    ) : k.isSpecial ? (
                      <span className="shrink-0 drop-shadow-[0_0_6px_rgba(167,139,250,0.7)]" title={`Special Overseer · ${OVERSEER_TITLE.name}`}>
                        <OverseerMedal />
                      </span>
                    ) : (
                      (titles.length > 0 || placeIn(podium?.month, k.id)) && (
                        <span className="shrink-0">
                          <RenownTitles
                            count={titles.length}
                            place={placeIn(podium?.month, k.id)}
                            title={titles.length ? `Milestone titles: ${titles.map((t) => t.name).join(", ")}` : "No milestone titles yet"}
                          />
                        </span>
                      )
                    )}
                    <span className="shrink-0">
                      <RenownHouse count={count} place={placeIn(podium?.year, k.id)} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {podium && (podium.week.length > 0 || podium.month.length > 0 || podium.year.length > 0 || podium.all.length > 0) && (
            <div className="px-3 py-1.5 border-t border-slate-800 text-[9px] text-slate-500 flex flex-wrap gap-x-2">
              <span className="text-amber-300/80 font-semibold">🏆 Hall of Renown top 3:</span>
              <span>Lv pennant = last week</span>
              <span>medal = last month</span>
              <span>house = this fiscal year</span>
              <span>crowned frame = all time</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Menu: codex, admin, sound and account                                     */
/* ------------------------------------------------------------------------- */

function useDismiss(open: boolean, close: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return rootRef;
}

const menuItem = "w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800 text-slate-200 text-left";

function MainMenu({
  me,
  isAdmin,
  authEnabled,
  onOpenCodex,
  onOpenWhatsNew,
  onOpenAdmin,
  adminWarnings = 0,
  onOpenScriptorium,
  pendingDeeds = 0,
  onOpenDeedReview,
  onSendOmen,
  newOmens = 0,
  onOpenOmens,
  onOpenDecrees,
  myKingdom,
  renown = null,
  onMyKingdom,
  onSignIn,
  onSignOut
}: {
  me?: AuthUser | null;
  isAdmin: boolean;
  authEnabled: boolean;
  onOpenCodex?: () => void;
  onOpenWhatsNew?: () => void;
  onOpenAdmin?: () => void;
  adminWarnings?: number;
  onOpenScriptorium?: () => void;
  /** Managers: deeds waiting for a seal */
  pendingDeeds?: number;
  onOpenDeedReview?: () => void;
  onSendOmen?: () => void;
  newOmens?: number;
  onOpenOmens?: () => void;
  /** 👑 Royal Decrees (admins, Special Overseers, the Archon) */
  onOpenDecrees?: () => void;
  /** Signed-in ruler's kingdom: its civilization frames the avatar */
  myKingdom?: DeveloperKingdom | null;
  /** Hall of Renown All time place of the signed-in ruler: metal rim on the avatar frame */
  renown?: 1 | 2 | 3 | null;
  onMyKingdom: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rootRef = useDismiss(open, () => setOpen(false));
  const run = (fn?: () => void) => () => {
    setOpen(false);
    sound.playClick();
    fn?.();
  };

  return (
    <div ref={rootRef} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={iconBtn} title={me ? `Menu · signed in as ${me.name}${renown ? ` · Hall of Renown #${renown} of all time` : ""}` : "Menu"} aria-label="Menu">
        {me ? (
          <CivFrame civ={myKingdom?.civilization} overseer={Boolean(myKingdom?.isSpecial)} archon={Boolean(myKingdom?.isArchon || me.isArchon)} renown={renown} initial={me.name.charAt(0)} className="w-6 h-6" />
        ) : (
          <Menu className="w-4 h-4" />
        )}
        {isAdmin && <span className="w-1.5 h-1.5 rounded-full bg-purple-400" title="Administrator" />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 overflow-hidden z-50 animate-fadeIn text-xs">
          {me && (
            <div className="px-3 py-2 border-b border-slate-800">
              <div className="font-semibold text-slate-100 truncate">{me.name}</div>
              <div className="text-[10px] text-slate-500 font-mono">@{me.username} · signed in with Git</div>
            </div>
          )}
          {me && (
            <button onClick={run(onMyKingdom)} className={menuItem}>
              <Home className="w-3.5 h-3.5 text-amber-300" /> My kingdom
            </button>
          )}
          <button onClick={run(onOpenCodex)} className={menuItem}>
            <Library className="w-3.5 h-3.5 text-amber-300" /> Royal Codex
          </button>
          {onOpenWhatsNew && (
            <button onClick={run(onOpenWhatsNew)} className={menuItem}>
              <Megaphone className="w-3.5 h-3.5 text-amber-300" /> What's New
            </button>
          )}
          {pendingDeeds > 0 && (
            <button onClick={run(onOpenDeedReview)} className={menuItem}>
              <ScrollText className="w-3.5 h-3.5 text-amber-300" /> Deeds to seal
              <span className="ml-auto px-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">{pendingDeeds}</span>
            </button>
          )}
          {isAdmin && (
            <button onClick={run(onOpenAdmin)} className={menuItem}>
              <ShieldAlert className="w-3.5 h-3.5 text-purple-400" /> Admin controls
              {adminWarnings > 0 && (
                <span className="ml-auto px-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">{adminWarnings}</span>
              )}
            </button>
          )}
          {onSendOmen && (
            <button onClick={run(onSendOmen)} className={menuItem}>
              <Sparkles className="w-3.5 h-3.5 text-sky-300" /> Send an Omen
            </button>
          )}
          {isAdmin && newOmens > 0 && (
            <button onClick={run(onOpenOmens)} className={menuItem}>
              <Sparkles className="w-3.5 h-3.5 text-sky-300" /> New omens
              <span className="ml-auto px-1.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-500/40 text-[10px] font-bold">{newOmens}</span>
            </button>
          )}
          <button onClick={run(() => setSettingsOpen(true))} className={menuItem}>
            <Settings className="w-3.5 h-3.5 text-slate-300" /> Game settings
          </button>
          {authEnabled && !me && (
            <button onClick={run(onSignIn)} className={`${menuItem} border-t border-slate-800`}>
              <LogIn className="w-3.5 h-3.5 text-amber-300" /> Sign in with Git
            </button>
          )}
          {me && (
            <button onClick={run(onSignOut)} className={`${menuItem} border-t border-slate-800 text-slate-300`}>
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          )}
        </div>
      )}
      {settingsOpen && createPortal(<GameSettingsModal onClose={() => setSettingsOpen(false)} />, document.body)}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Clocks: harvest + roving respawn in one pill                              */
/* ------------------------------------------------------------------------- */

const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

function MiniRing({ frac, color, track }: { frac: number; color: string; track: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90 shrink-0">
      <circle cx="11" cy="11" r={RING_R} fill="none" stroke={track} strokeWidth="2.5" />
      <circle
        cx="11"
        cy="11"
        r={RING_R}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - Math.max(0, Math.min(1, frac)))}
        style={{ transition: "stroke-dashoffset 1s linear" }}
      />
    </svg>
  );
}

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** The encounter clock (the harvest clock is the ☀️ / 🌙 day & season button: day and night turn with each harvest) */
function Clocks({ respawnAt, respawnMinutes }: { respawnAt?: number | null; respawnMinutes: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!respawnAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [respawnAt]);
  const respawnSeconds = respawnAt ? Math.max(0, Math.round((respawnAt - now) / 1000)) : null;

  if (respawnSeconds === null) return null;
  return (
    <div
      className="flex items-center gap-1.5 h-9 px-2 rounded-xl border border-slate-700/80 bg-slate-900/80 text-[11px] font-semibold text-rose-300"
      title={`Encounters: mobs, bandits and treasure respawn in ${mmss(respawnSeconds)} (every ${respawnMinutes} minutes)`}
    >
      <MiniRing frac={respawnSeconds / (respawnMinutes * 60)} color="#fb7185" track="rgba(244,63,94,0.15)" />
      <Skull className="w-3.5 h-3.5 text-rose-300/90" aria-label="Encounters" />
      <span className="hidden min-[90rem]:inline font-mono font-bold tabular-nums">{mmss(respawnSeconds)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* War pill: own march countdown + unread battle reports                     */
/* ------------------------------------------------------------------------- */

/** ⚔️ Call to Arms: shown while the ruler is at war after attacking a ruler's city or a frontier gate; hover (or tap) for the time left */
function CallToArmsPill({ until }: { until: number }) {
  const [left, setLeft] = useState(() => until - Date.now());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const tick = () => {
      const ms = until - Date.now();
      setLeft(ms);
      if (ms <= 0) clearInterval(id);
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [until]);
  if (left <= 0) return null;
  const text = `Call to Arms: ${formatDuration(left)} left. You attacked a ruler's city or a frontier gate; no Festival until it ends.`;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="flex items-center gap-1 h-9 px-2 sm:px-2.5 rounded-xl border border-rose-500/60 bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 text-xs font-semibold transition"
        title={text}
        aria-label={text}
      >
        <Swords className="w-4 h-4 text-rose-400" />
        <span className="hidden 2xl:inline font-mono">{formatDuration(left)}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 px-3 py-2 rounded-lg border border-rose-500/50 bg-slate-950/95 text-[11px] text-rose-100 shadow-xl z-50">
          <div className="font-bold">⚔️ Call to Arms · {formatDuration(left)} left</div>
          <div className="text-rose-200/80 mt-0.5">You attacked a ruler's city or a frontier gate. No Festival until it ends.</div>
        </div>
      )}
    </div>
  );
}

function WarPill({ march, incoming, unread, onClick }: { march: ActiveMarch | null; incoming: boolean; unread: number; onClick?: () => void }) {
  const countdownRef = useRef<HTMLSpanElement>(null);
  // Ticks the countdown text directly; the header doesn't re-render every second
  useEffect(() => {
    if (!march) return;
    const tick = () => {
      const phase = march.phase ?? "outbound";
      if (phase === "acting") {
        if (countdownRef.current) countdownRef.current.textContent = `R${march.currentBattleRound ?? 1}⚔️`;
        return;
      }
      const targetTime = phase === "returning" ? (march.returnTime ?? march.arrivalTime) : march.arrivalTime;
      const left = targetTime - Date.now();
      if (countdownRef.current) countdownRef.current.textContent = left > 0 ? formatDuration(left) : phase === "returning" ? "home!" : "battle!";
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [march]);

  return (
    <button
      onClick={() => {
        sound.playClick();
        onClick?.();
      }}
      className={`relative flex items-center gap-1.5 h-9 px-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${incoming
        ? "border-red-400 bg-red-900/80 hover:bg-red-800 text-red-100 animate-pulse"
        : march
          ? "border-rose-500/60 bg-rose-950/70 hover:bg-rose-900/80 text-rose-200"
          : "border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 text-slate-300"
        }`}
      title={
        incoming && march
          ? `Incoming! ${march.attackerName} marches on your citadel with ${march.band ? march.band.name : `${march.soldiersCount.toLocaleString()} soldiers`}`
          : march
            ? `Your army (${marchForceText(march)}) · ${march.phase === "returning" ? `returning from ${march.targetName}` : march.targetName}`
            : "War Room: marches and battle reports"
      }
    >
      <Swords className={`w-4 h-4 ${march ? "text-rose-400" : "text-amber-400"}`} />
      {march ? (
        <>
          <span className="hidden 2xl:inline max-w-[90px] truncate text-amber-200">
            {incoming ? `⚠️ ${march.attackerName}` : march.phase === "returning" ? `↩ ${march.targetName}` : march.targetName}
          </span>
          <span ref={countdownRef} className="font-mono font-bold tabular-nums text-rose-300" />
        </>
      ) : (
        <span className="hidden min-[90rem]:inline">War Room</span>
      )}
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">{unread}</span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/* Header                                                                    */
/* ------------------------------------------------------------------------- */

export function TopHUD({
  viewMode,
  kingdoms,
  currentKingdom,
  syncIntervalMinutes = 15,
  nextRespawnAt,
  rovingWindowMinutes,
  onToggleViewMode,
  onSelectKingdom,
  onOpenLedger,
  onOpenCodex,
  onOpenWhatsNew,
  onOpenRenown,
  onOpenDevProfile,
  onOpenKingdom,
  activeMarches = [],
  unreadBattleReports = 0,
  onOpenWarRoom,
  me,
  isAdmin = false,
  onOpenAdmin,
  onOpenDecrees,
  adminWarnings = 0,
  onOpenScriptorium,
  pendingDeeds = 0,
  onOpenDeedReview,
  onSendOmen,
  newOmens = 0,
  onOpenOmens,
  onOpenWatchtower,
  authEnabled = false,
  onSignIn,
  onSignOut
}: TopHUDProps) {
  // An army marching on the signed-in player comes first (incoming alert), then their own march
  const { warMarch, incoming } = useMemo(() => {
    if (!me) return { warMarch: null, incoming: false };
    const onRoad = activeMarches.filter((m) => m.phase !== "done" && m.status !== "resolved");
    const against = onRoad.find((m) => m.targetType === "dev_kingdom" && m.targetId === me.id && m.kind !== "scout" && m.kind !== "reinforce" && m.kind !== "rally_join" && (m.phase ?? "outbound") !== "returning");
    return { warMarch: against ?? onRoad.find((m) => m.attackerId === me.id) ?? null, incoming: Boolean(against) };
  }, [activeMarches, me]);

  // Hall of Renown top 3: Weekly on the picker's level badges, Monthly on title counts, Year on building counts, All time on civ frames
  const { podium, load: loadPodium } = useRenownPodium();
  useEffect(() => {
    loadPodium();
  }, [loadPodium, me?.id]);

  if (!currentKingdom) return null;

  const res = currentKingdom.resources;
  const gems = Object.entries(res.scarce || {}).filter(([, v]) => v > 0);
  const gemTotal = gems.reduce((sum, [, v]) => sum + v, 0);
  const gemTitle = gems
    .map(([k, v]) => {
      const def = SCARCE_RESOURCES.find((r) => r.key === k);
      return `${def?.emblem ?? "💎"} ${def?.name ?? k}: ${v}`;
    })
    .join("\n");

  const resources = [
    { key: "gold", icon: "🪙", label: "Gold", value: res.gold || 0, color: "text-amber-300" },
    { key: "iron", icon: "⚙️", label: "Iron", value: res.iron || 0, color: "text-slate-200" },
    { key: "stone", icon: "🪨", label: "Stone", value: res.stone || 0, color: "text-stone-300" },
    { key: "lumber", icon: "🪵", label: "Lumber", value: res.lumber || 0, color: "text-orange-300" },
    { key: "food", icon: "🌾", label: "Food", value: res.food || 0, color: "text-lime-300" }
  ];

  const pop = currentKingdom.population ?? 0;
  const home = currentKingdom.soldiers ?? 0;
  const away = currentKingdom.deployedSoldiers ?? 0;
  // Another civilization's kingdom: numbers hidden by the fog of war
  const fog = currentKingdom.fog;
  const intel = fog?.report ?? null;

  return (
    <header className="absolute top-0 inset-x-0 z-40 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 shadow-xl select-none">
      {/* From lg one line (labels hide below 1440 px or 2xl, the kingdom picker gives way), so the bar never grows over the
          banners and notices below it */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 lg:gap-1.5 2xl:gap-2 px-3 sm:px-4 py-2">
        {/* View switch */}
        <button
          onClick={onToggleViewMode}
          className="shrink-0 flex items-center gap-2 h-9 px-3 rounded-xl bg-linear-to-b from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 text-xs font-bold shadow-lg shadow-amber-900/30 border border-amber-300/50 transition active:scale-95"
          title={viewMode === "world_map" ? "Enter this developer's kingdom" : "Back to the world map"}
        >
          {viewMode === "world_map" ? <Castle className="w-4 h-4" /> : <Map className="w-4 h-4" />}
          <span className="hidden min-[90rem]:inline">{viewMode === "world_map" ? "Enter Kingdom" : "World Map"}</span>
        </button>

        {/* Developer */}
        <KingdomPicker kingdoms={kingdoms} current={currentKingdom} meId={me?.id} onSelect={onSelectKingdom} podium={podium} onOpen={loadPodium} />
        <button
          onClick={() => {
            sound.playClick();
            onOpenDevProfile?.();
          }}
          className={iconBtn}
          title="Developer profile: commits, repositories & contribution activity"
          aria-label="Developer profile"
        >
          <UserRound className="w-4 h-4 text-amber-300" />
        </button>
        <button
          onClick={() => {
            sound.playClick();
            onOpenRenown?.();
          }}
          className={iconBtn}
          title="Hall of Renown: weekly, monthly, year and all-time fairness ranking"
          aria-label="Hall of Renown"
        >
          <Trophy className="w-4 h-4 text-amber-300" />
        </button>
        {onOpenScriptorium && (
          <button
            onClick={() => {
              sound.playClick();
              onOpenScriptorium();
            }}
            className={`${iconBtn} relative`}
            title={pendingDeeds > 0 ? `The Scriptorium: projects and deed reports · ${pendingDeeds} deeds await your seal` : "The Scriptorium: projects and deed reports"}
            aria-label="Scriptorium"
          >
            <Feather className="w-4 h-4 text-amber-300" />
            {pendingDeeds > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold leading-4 text-center">{pendingDeeds > 99 ? "99+" : pendingDeeds}</span>}
          </button>
        )}
        {onOpenDecrees && (isAdmin || me?.isSpecial) && (
          <button
            onClick={() => {
              sound.playClick();
              onOpenDecrees();
            }}
            className={iconBtn}
            title="Royal Decrees: announcements, gifts, shields and punishments"
            aria-label="Royal Decrees"
          >
            <Crown className="w-4 h-4 text-amber-300" />
          </button>
        )}
        {onOpenWatchtower && (
          <button
            onClick={() => {
              sound.playClick();
              onOpenWatchtower();
            }}
            className={iconBtn}
            title="The Watchtower: work analytics (who is quiet, commits vs deeds, projects, people, the game's effect)"
            aria-label="Watchtower"
          >
            <Telescope className="w-4 h-4 text-sky-300" />
          </button>
        )}
        {/* Phones: the first row is the view switch, the kingdom picker and the icon buttons; the pills start the next */}
        <div className="basis-full h-0 -mt-1.5 sm:hidden" aria-hidden />

        {/* Treasury — moves to its own row on narrow screens */}
        <button
          onClick={onOpenLedger}
          className="order-last lg:order-none basis-full lg:basis-auto min-w-0 lg:shrink-0 lg:ml-auto flex items-center justify-between lg:justify-start gap-1 h-9 px-2 rounded-xl border border-slate-700/80 bg-slate-900/80 hover:border-amber-500/50 hover:bg-slate-800/80 transition group"
          title="Open the treasury ledger"
        >
          <span className="flex items-center gap-0 sm:gap-1 min-w-0 overflow-hidden">
            {fog && !intel && (
              <span className="px-1.5 text-xs font-mono text-slate-400" title="Fog of war: send 👁️ scouts to see this kingdom's treasury">
                🌫️ Treasury <strong className="text-slate-200">?</strong>
              </span>
            )}
            {intel &&
              resources.map((r) => (
                <span key={r.key} className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 lg:px-1 2xl:px-1.5 py-0.5 rounded-lg hover:bg-slate-800" title={`${r.label}: ${fogText(fogTreasury(intel, r.key))}
${fogHint(intel)}`}>
                  <span className="text-sm leading-none">{r.icon}</span>
                  <span className={`text-xs font-bold font-mono tabular-nums ${r.color}`}>{fogText(fogTreasury(intel, r.key), true)}</span>
                </span>
              ))}
            {!fog && resources.map((r) => (
              <span key={r.key} className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 lg:px-1 2xl:px-1.5 py-0.5 rounded-lg hover:bg-slate-800" title={`${r.label}: ${r.value.toLocaleString()}`}>
                <span className="text-sm leading-none">{r.icon}</span>
                <span className={`text-xs font-bold font-mono tabular-nums ${r.color}`}>{formatCompact(r.value)}</span>
              </span>
            ))}
            {!fog && gemTotal > 0 && (
              <span className="flex items-center gap-0.5 sm:gap-1 ml-0.5 px-1 sm:px-1.5 py-0.5 rounded-lg bg-purple-950/70 border border-purple-500/30" title={`Rare gems & mana\n${gemTitle}`}>
                <span className="text-xs leading-none">💎</span>
                <span className="text-xs font-bold font-mono text-purple-200">{formatCompact(gemTotal)}</span>
              </span>
            )}
          </span>
          <ScrollText className="lg:max-2xl:hidden w-3.5 h-3.5 ml-1 text-slate-500 group-hover:text-amber-300 transition" />
        </button>

        {/* Kingdom: population & army */}
        <button
          onClick={() => {
            sound.playClick();
            onOpenKingdom?.();
          }}
          className="shrink-0 flex items-center gap-1.5 h-9 px-2.5 rounded-xl border border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 text-xs font-mono transition cursor-pointer"
          title={
            fog
              ? `Fog of war: ${fogText(fogRange(intel, "population"))} people · ${fogText(fogRange(intel, "garrison"))} soldiers
${fogHint(intel)}`
              : `Kingdom: ${pop.toLocaleString()} / ${(currentKingdom.maxPopulation ?? 0).toLocaleString()} people · ${home.toLocaleString()} soldiers at home${away ? ` · ${away.toLocaleString()} marching` : ""}`
          }
        >
          <span className="text-sm">👥</span>
          <span className="font-bold text-slate-200">
            {fog ? fogText(fogRange(intel, "population"), true) : formatCompact(pop)}
            {!fog && <span className="hidden 2xl:inline text-slate-500 font-normal">/{formatCompact(currentKingdom.maxPopulation ?? 0)}</span>}
          </span>
          <span className="flex items-center gap-1 pl-1.5 border-l border-slate-700 text-red-300 font-bold">
            <span>🛡️</span>
            <span>{fog ? fogText(fogRange(intel, "garrison"), true) : formatCompact(home)}</span>
            {!fog && away > 0 && <span className="text-rose-400/80 font-normal">+{formatCompact(away)}</span>}
          </span>
        </button>

        {/* Right cluster */}
        <div className="shrink-0 flex items-center gap-1 sm:gap-2 lg:gap-1.5 2xl:gap-2 ml-auto lg:ml-0">
          <DisasterChip myCiv={me ? kingdoms.find((k) => k.id === me.id)?.civilization : null} />
          <RealmTimeButton myCiv={me ? kingdoms.find((k) => k.id === me.id)?.civilization : null} />
          {me && <CallToArmsPill until={proclamationsOf(kingdoms.find((k) => k.id === me.id)).callToArmsUntil} />}
          <WarPill march={warMarch} incoming={incoming} unread={unreadBattleReports} onClick={onOpenWarRoom} />
          <Clocks respawnAt={nextRespawnAt} respawnMinutes={rovingWindowMinutes ?? syncIntervalMinutes} />
          <MainMenu
            me={me}
            isAdmin={isAdmin}
            authEnabled={authEnabled}
            onOpenCodex={onOpenCodex}
            onOpenWhatsNew={onOpenWhatsNew}
            onOpenAdmin={onOpenAdmin}
            adminWarnings={adminWarnings}
            pendingDeeds={pendingDeeds}
            onOpenDeedReview={onOpenDeedReview}
            onSendOmen={onSendOmen}
            newOmens={newOmens}
            onOpenOmens={onOpenOmens}
            myKingdom={me ? kingdoms.find((k) => k.id === me.id) ?? null : null}
            renown={me ? placeIn(podium?.all, me.id) : null}
            onMyKingdom={() => me && onSelectKingdom(me.id)}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
          />
        </div>
      </div>
    </header>
  );
}
