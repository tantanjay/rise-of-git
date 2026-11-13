import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { whenRealmShown } from "@/utils/loadingScreen";
import { DeveloperKingdom, RepoBuilding, RealmStatus, CivilizationType, FlatWorldMapData, AuthUser, UpgradeDef, MapNPC, NethergardeSpire, ActiveMarch, BattleReport, PopulationLedgerEntry, MarchPreview, CivSwapProposal, ScoutReport, MarchKind, NodeStatus, Rally, BossStatus, NpcKingdomStatus, AdminValidationWarning, IgnoredRepoRecord, Broadcast, DevEmail, MusterMarch, MusterResult } from "@/types";
import { BATTLE_SHOWCASE_MS } from "@/utils/war";
import { BATTLE_ROUND_MS } from "@/utils/civDemographics";
import { setGuest } from "@/utils/guest";
import { sound } from "./useSound";
import { useDialog } from "@/components/ui/Dialog";
import { API_BASE } from "@/config";
import { setRealmTime } from "@/utils/realmTime";
import { setRealmDisaster } from "@/utils/disasters";
import { setRealmHorrors } from "@/utils/horror";
import { setOnlineIds } from "@/utils/presence";

export type ViewMode = 'world_map' | 'city_view';

/** Target of a march as the REST API takes it */
export type MarchTargetParam = "dev" | "spire" | "npc";

// Remember the last kingdom and view across reloads (per browser; storage may be unavailable)
const STORAGE_KEY = "git-tea-castle:last-view";

function loadLastView(): { kingdomId: string | null; viewMode: ViewMode } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      kingdomId: typeof saved?.kingdomId === "string" ? saved.kingdomId : null,
      viewMode: saved?.viewMode === "city_view" ? "city_view" : "world_map"
    };
  } catch {
    return { kingdomId: null, viewMode: "world_map" };
  }
}

function saveLastView(kingdomId: string | null, viewMode: ViewMode) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ kingdomId, viewMode }));
  } catch {
    // Private mode / blocked storage: just don't remember
  }
}

const READ_REPORTS_KEY = "read_battle_report_ids";
const EMPTY_IDS = new Set<string>();

function loadReadIds(): Set<string> | null {
  try {
    const stored = localStorage.getItem(READ_REPORTS_KEY);
    return stored ? new Set<string>(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function persistReadIds(ids: Set<string>): Set<string> {
  try {
    // Only the newest ids matter: older reports have dropped out of the history anyway
    localStorage.setItem(READ_REPORTS_KEY, JSON.stringify([...ids].slice(-BATTLE_REPORT_HISTORY * 3)));
  } catch {
    // storage unavailable — read marks last for this visit only
  }
  return ids;
}

// Herald notices closed in this browser: the server keeps reads per kingdom, this only covers signed-out visitors
// (and hides a notice at once while its read is on the way)
const READ_NOTICES_KEY = "read_notice_ids";

function loadReadNoticeIds(): Set<number> {
  try {
    return new Set<number>(JSON.parse(localStorage.getItem(READ_NOTICES_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function persistReadNoticeIds(ids: Set<number>) {
  try {
    localStorage.setItem(READ_NOTICES_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // storage unavailable — closed notices stay closed for this visit only
  }
}

/**
 * The realm's data answered 401: the session is gone (signed out in another tab, or expired) and the server doesn't
 * let guests browse. Back to the login screen, as signing out does. True when it did.
 */
let leaving = false;
function sessionLost(res: Response): boolean {
  if (res.status !== 401) return false;
  if (!leaving) {
    leaving = true;
    setGuest(false);
    window.location.reload();
  }
  return true;
}

/** Battle reports kept for the War Room list */
const BATTLE_REPORT_HISTORY = 40;

export function useGameState() {
  const dialog = useDialog();
  const [kingdoms, setKingdoms] = useState<DeveloperKingdom[]>([]);
  const [currentKingdom, setCurrentKingdom] = useState<DeveloperKingdom | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<RepoBuilding | null>(null);
  const [worldMap, setWorldMap] = useState<FlatWorldMapData | null>(null);
  // Roving encounters live apart from the map so they can change without rebuilding the continent
  const [rovingNPCs, setRovingNPCs] = useState<MapNPC[]>([]);
  const [horrorNPCs, setHorrorNPCs] = useState<MapNPC[]>([]);
  // Resource nodes / chests someone touched: what's left, who gathers them
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  // World bosses (shared HP, weekly rotation) and NPC kingdoms (fogged)
  const [bossStatuses, setBossStatuses] = useState<Record<string, BossStatus>>({});
  const [npcKingdomStatuses, setNpcKingdomStatuses] = useState<Record<string, NpcKingdomStatus>>({});
  const [nextRespawnAt, setNextRespawnAt] = useState<number | null>(null);
  const rovingKeyRef = useRef<string | null>(null);
  const [lastView] = useState(loadLastView);
  const [viewMode, setViewMode] = useState<ViewMode>(lastView.viewMode);
  const [status, setStatus] = useState<RealmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const currentIdRef = useRef<string | null>(lastView.kingdomId);
  // Id of a kingdom being switched to (not a refresh of the current one); the city shows a loader meanwhile
  const [switchingKingdomId, setSwitchingKingdomId] = useState<string | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminWarnings, setAdminWarnings] = useState<AdminValidationWarning[]>([]);
  const [totalAdminWarnings, setTotalAdminWarnings] = useState<number>(0);
  const [ignoredRepos, setIgnoredRepos] = useState<IgnoredRepoRecord[]>([]);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [upgradeCatalog, setUpgradeCatalog] = useState<UpgradeDef[]>([]);
  const [spires, setSpires] = useState<NethergardeSpire[]>([]);
  const [activeMarches, setActiveMarches] = useState<ActiveMarch[]>([]);
  const [battleReports, setBattleReports] = useState<BattleReport[]>([]);
  const battleReportsRef = useRef<BattleReport[]>([]);
  const battleReportsJsonRef = useRef("");
  const [swapProposals, setSwapProposals] = useState<CivSwapProposal[]>([]);
  // The signed-in ruler's scout reports (delivered once the scouts are home)
  const [scoutReports, setScoutReports] = useState<ScoutReport[]>([]);
  const scoutJsonRef = useRef("");
  // Open rallies of the signed-in ruler's civilization
  const [rallies, setRallies] = useState<Rally[]>([]);
  const ralliesJsonRef = useRef("");
  const swapsJsonRef = useRef("");
  const [activeBattleReport, setActiveBattleReport] = useState<BattleReport | null>(null);
  const marchesRef = useRef<ActiveMarch[]>([]);
  const marchesJsonRef = useRef("");
  /** Set below once fetchKingdoms exists: reloads kingdoms when a march finishes (troops home, slot free) */
  const onMarchFinishedRef = useRef<() => void>(() => {});
  const spiresJsonRef = useRef("");
  // Reports the player has opened (popup or War Room); null until loaded, so old history isn't "unread"
  const [readReportIds, setReadReportIds] = useState<Set<string> | null>(loadReadIds);
  // Same set for the polling callback, plus reports whose popup is already scheduled
  const readIdsRef = useRef<Set<string> | null>(readReportIds);
  const popupScheduledRef = useRef<Set<string>>(new Set());
  const newestReportRef = useRef<string | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Red Chronicle alert when one of the signed-in ruler's own marches is repelled */
  const [chronicleAlert, setChronicleAlert] = useState<{ id: string; text: string } | null>(null);
  const dismissChronicleAlert = useCallback(() => setChronicleAlert(null), []);
  /** Herald notices not read yet, oldest first (the herald opens them one at a time) */
  const [notices, setNotices] = useState<Broadcast[]>([]);
  const noticesRef = useRef<Broadcast[]>([]);
  const noticeKeyRef = useRef<string | null>(null);
  const landmarkKeyRef = useRef<string | null>(null);
  const readNoticeIdsRef = useRef<Set<number>>(loadReadNoticeIds());
  const meRef = useRef<AuthUser | null>(null);
  const lastSyncRef = useRef<string | null>(null);
  // Last response bodies: a poll that brings nothing new must not replace state (no re-render, no blinking)
  const kingdomsJsonRef = useRef("");
  const kingdomJsonRef = useRef("");
  const worldMapJsonRef = useRef("");
  const rovingJsonRef = useRef("");
  const kingdomsRef = useRef<DeveloperKingdom[]>([]);
  // Anyone's civilization changed (Voidrift ascension or fall, swaps): kingdoms, map and spires reload together
  const civKeyRef = useRef<string | null>(null);
  /** Set when the signed-in ruler's own civilization changed: the map glides to their new castle */
  const [realmShift, setRealmShift] = useState<{ nonce: number; kingdomId: string } | null>(null);

  const currentKingdomId = currentKingdom?.id;
  useEffect(() => {
    if (currentKingdomId) saveLastView(currentKingdomId, viewMode);
  }, [currentKingdomId, viewMode]);

  const fetchKingdom = useCallback(async (id: string) => {
    const prev = currentIdRef.current;
    const switching = prev !== id;
    // The kingdom asked for last wins: refreshes follow it at once, and a slower answer for an earlier pick is dropped
    currentIdRef.current = id;
    if (switching) setSwitchingKingdomId(id);
    // A switch that fails leaves the kingdom shown where it was
    const giveUp = () => {
      if (switching && currentIdRef.current === id) currentIdRef.current = prev;
    };
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(id)}`);
      if (!res.ok) return giveUp();
      const text = await res.text();
      if (currentIdRef.current !== id) return;
      if (text === kingdomJsonRef.current) return;
      kingdomJsonRef.current = text;
      setCurrentKingdom(JSON.parse(text) as DeveloperKingdom);
    } catch (err) {
      giveUp();
      console.error("Failed to fetch kingdom:", err);
    } finally {
      if (switching) setSwitchingKingdomId((cur) => (cur === id ? null : cur));
    }
  }, []);

  const fetchWorldMap = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/map`);
      if (!res.ok) return;
      const text = await res.text();
      if (text === worldMapJsonRef.current) return;
      worldMapJsonRef.current = text;
      setWorldMap(JSON.parse(text) as FlatWorldMapData);
    } catch (err) {
      console.error("Failed to fetch world map:", err);
    }
  }, []);

  const fetchRoving = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/map/roving`);
      if (!res.ok) return;
      const text = await res.text();
      if (text === rovingJsonRef.current) return;
      rovingJsonRef.current = text;
      const data: { key: string; npcs: MapNPC[]; horrors?: MapNPC[]; nodes?: Record<string, NodeStatus>; bosses?: Record<string, BossStatus>; npcKingdoms?: Record<string, NpcKingdomStatus> } =
        JSON.parse(text);
      rovingKeyRef.current = data.key;
      setRovingNPCs(data.npcs);
      setHorrorNPCs(data.horrors ?? []);
      setNodeStatuses(data.nodes ?? {});
      setBossStatuses(data.bosses ?? {});
      setNpcKingdomStatuses(data.npcKingdoms ?? {});
    } catch (err) {
      console.error("Failed to fetch roving encounters:", err);
    }
  }, []);

  const fetchSpires = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spires`);
      if (!res.ok) return;
      // Polled every few seconds: only a real change may re-lay the castles (and redraw static shadows)
      const text = await res.text();
      if (text === spiresJsonRef.current) return;
      spiresJsonRef.current = text;
      setSpires(JSON.parse(text) as NethergardeSpire[]);
    } catch (err) {
      console.error("Failed to fetch spires:", err);
    }
  }, []);

  const fetchMarches = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/marches`);
      if (!res.ok) return;
      // Unchanged marches keep their identity so the armies on the map aren't rebuilt every poll
      const text = await res.text();
      if (text === marchesJsonRef.current) return;
      marchesJsonRef.current = text;
      const data: ActiveMarch[] = JSON.parse(text);
      // An army got home (or was wiped out): soldiers, treasury and march slots changed on the server
      const over = (m: ActiveMarch) => m.status === "resolved" || m.phase === "done";
      const finished = marchesRef.current.some((prev) => {
        if (over(prev)) return false;
        const next = data.find((m) => m.id === prev.id);
        return !next || over(next);
      });
      marchesRef.current = data;
      setActiveMarches(data);
      if (finished) onMarchFinishedRef.current();
    } catch (err) {
      console.error("Failed to fetch active marches:", err);
    }
  }, []);

  /** Load the kingdom list (and reload the current kingdom); select the most active one if nothing is selected yet. */
  const fetchKingdoms = useCallback(async (): Promise<DeveloperKingdom[]> => {
    try {
      const res = await fetch(`${API_BASE}/kingdoms`);
      if (sessionLost(res) || !res.ok) return kingdomsRef.current;
      const text = await res.text();
      const data: DeveloperKingdom[] = text === kingdomsJsonRef.current ? kingdomsRef.current : JSON.parse(text);
      if (!Array.isArray(data)) return kingdomsRef.current;
      if (text !== kingdomsJsonRef.current) {
        kingdomsJsonRef.current = text;
        kingdomsRef.current = data;
        setKingdoms(data);
      }
      const stillExists = data.some((k) => k.id === currentIdRef.current);
      const mine = meRef.current && data.some((k) => k.id === meRef.current!.id) ? meRef.current.id : null;
      const targetId = stillExists ? currentIdRef.current : mine ?? data[0]?.id;
      if (targetId) await fetchKingdom(targetId);
      return data;
    } catch (err) {
      console.error("Failed to fetch kingdoms:", err);
      return kingdomsRef.current;
    } finally {
      setLoading(false);
    }
  }, [fetchKingdom]);

  /** Someone's civilization changed: kingdoms, map placements and spires reload together; if it was ours, the map follows us */
  const reanchorRealm = useCallback(async () => {
    const myId = meRef.current?.id;
    const before = myId ? kingdomsRef.current.find((k) => k.id === myId)?.civilization : undefined;
    const [list] = await Promise.all([fetchKingdoms(), fetchWorldMap(), fetchSpires()]);
    const after = myId ? list.find((k) => k.id === myId)?.civilization : undefined;
    if (myId && before && after && before !== after) setRealmShift({ nonce: Date.now(), kingdomId: myId });
  }, [fetchKingdoms, fetchWorldMap, fetchSpires]);

  /** Show a battle report (null closes it) and mark it read */
  const openBattleReport = useCallback((report: BattleReport | null) => {
    setActiveBattleReport(report);
    if (!report) return;
    const next = persistReadIds(new Set([...(readIdsRef.current ?? []), report.id]));
    readIdsRef.current = next;
    setReadReportIds(next);
  }, []);

  /** War Room broom: every report in the chronicle counts as read */
  const markAllReportsRead = useCallback(() => {
    const next = persistReadIds(new Set([...(readIdsRef.current ?? []), ...battleReportsRef.current.map((r) => r.id)]));
    readIdsRef.current = next;
    setReadReportIds(next);
  }, []);

  const fetchBattleReports = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/battle-reports?limit=${BATTLE_REPORT_HISTORY}`);
      if (!res.ok) return;
      // Polled every few seconds: unchanged reports keep their identity (no re-render); the checks below still run
      const text = await res.text();
      const data: BattleReport[] = text === battleReportsJsonRef.current ? battleReportsRef.current : JSON.parse(text);
      if (text !== battleReportsJsonRef.current) {
        battleReportsJsonRef.current = text;
        battleReportsRef.current = data;
        setBattleReports(data);
      }
      // Any new battle (even between others) can swap civilizations: refresh the realm
      if (data[0] && data[0].id !== newestReportRef.current) {
        if (newestReportRef.current !== null) fetchKingdoms();
        newestReportRef.current = data[0].id;
      }
      // First visit: everything already in the chronicle counts as read (no popup for old battles)
      if (readIdsRef.current === null) {
        readIdsRef.current = persistReadIds(new Set(data.map((r) => r.id)));
        setReadReportIds(readIdsRef.current);
        return;
      }

      const myId = meRef.current?.id;
      const curId = currentIdRef.current;
      const relevant = data.find(
        (r) =>
          (myId && (r.attackerId === myId || r.defenderId === myId || r.participants?.includes(myId))) ||
          (curId && (r.attackerId === curId || r.defenderId === curId))
      );
      if (!relevant || readIdsRef.current.has(relevant.id) || popupScheduledRef.current.has(relevant.id)) return;
      popupScheduledRef.current.add(relevant.id);
      if (curId) fetchKingdom(curId);
      fetchKingdoms();
      fetchSpires();

      // Let the clash and victory/defeat play on the map before the report covers it
      const march = marchesRef.current.find((m) => m.id === relevant.marchId);
      const delay = march ? Math.max(0, march.arrivalTime + BATTLE_SHOWCASE_MS - Date.now()) : 0;
      if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
      // ...and never while the loading screen is up (the report and its sound wait for the realm to show)
      reportTimerRef.current = setTimeout(() => whenRealmShown("battle-report", () => {
        openBattleReport(relevant);
        // The viewer's own march (leader or rally member) was repelled: alert in the Chronicle
        const mine = relevant.armies?.filter((a) => a.side === "attacker" && a.ownerId === myId) ?? [];
        const ownAttack = Boolean(myId) && (relevant.attackerId === myId || mine.length > 0);
        if (ownAttack && !relevant.attackerWon) {
          const losses = mine.length > 0 ? mine.reduce((sum, a) => sum + a.losses, 0) : relevant.attackerCasualties;
          setChronicleAlert({ id: relevant.id, text: `⚔️ Defeat: Your march on ${relevant.defenderName} was repelled (Losses: -${losses.toLocaleString()} soldiers)` });
          sound.playDefeat();
        } else if (relevant.attackerWon === (relevant.attackerId === myId)) sound.playLevelUp();
        else sound.playClick();
      }), delay);
    } catch (err) {
      console.error("Failed to fetch battle reports:", err);
    }
  }, [fetchKingdom, fetchKingdoms, fetchSpires, openBattleReport]);

  /** Peaceful civ-swap proposals involving the signed-in player */
  const fetchSwapProposals = useCallback(async () => {
    const myId = meRef.current?.id;
    if (!myId) return;
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(myId)}/swap-proposals`);
      if (!res.ok) return;
      const text = await res.text();
      if (text === swapsJsonRef.current) return;
      // A swap of ours was just accepted: our civilization (and castle) changed
      const before: CivSwapProposal[] = swapsJsonRef.current ? JSON.parse(swapsJsonRef.current) : [];
      const next: CivSwapProposal[] = JSON.parse(text);
      const newlyAccepted = next.some((p) => p.status === "accepted" && before.some((b) => b.id === p.id && b.status === "pending"));
      swapsJsonRef.current = text;
      setSwapProposals(next);
      if (newlyAccepted) {
        fetchKingdoms();
        fetchWorldMap();
        if (currentIdRef.current) fetchKingdom(currentIdRef.current);
      }
    } catch (err) {
      console.error("Failed to fetch swap proposals:", err);
    }
  }, [fetchKingdoms, fetchWorldMap, fetchKingdom]);

  /** Scout reports of the signed-in ruler; a newly delivered one lifts the fog on kingdoms / Voidrift NPCs */
  const fetchScoutReports = useCallback(async () => {
    if (!meRef.current) return;
    try {
      const res = await fetch(`${API_BASE}/scout-reports`);
      if (!res.ok) return;
      const text = await res.text();
      if (text === scoutJsonRef.current) return;
      const first = scoutJsonRef.current === "";
      scoutJsonRef.current = text;
      setScoutReports(JSON.parse(text));
      if (!first) {
        fetchKingdoms();
        fetchSpires();
      }
    } catch (err) {
      console.error("Failed to fetch scout reports:", err);
    }
  }, [fetchKingdoms, fetchSpires]);

  const fetchRallies = useCallback(async () => {
    if (!meRef.current) return;
    try {
      const res = await fetch(`${API_BASE}/rallies`);
      if (!res.ok) return;
      const text = await res.text();
      if (text === ralliesJsonRef.current) return;
      ralliesJsonRef.current = text;
      setRallies(JSON.parse(text));
    } catch (err) {
      console.error("Failed to fetch rallies:", err);
    }
  }, []);

  const fetchNotices = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/broadcasts/unread`);
      if (!res.ok) return;
      const data: Broadcast[] = await res.json();
      const fresh = data.filter((b) => !readNoticeIdsRef.current.has(b.id));
      const prev = noticesRef.current;
      const isNew = fresh.some((b) => !prev.some((p) => p.id === b.id));
      if (!isNew && prev.length === fresh.length) return;
      // The fanfare waits until the realm is on screen (the herald opens then too)
      if (isNew) whenRealmShown("herald", () => sound.playHerald());
      noticesRef.current = fresh;
      setNotices(fresh);
    } catch (err) {
      console.error("Failed to fetch notices:", err);
    }
  }, []);

  /** Close notices for good: stored on the server for signed-in rulers, in this browser for everyone */
  const markNoticesRead = useCallback((ids: number[] | "all") => {
    const closing = ids === "all" ? noticesRef.current.map((b) => b.id) : ids;
    for (const id of closing) readNoticeIdsRef.current.add(id);
    persistReadNoticeIds(readNoticeIdsRef.current);
    noticesRef.current = noticesRef.current.filter((b) => !closing.includes(b.id));
    setNotices(noticesRef.current);
    if (!meRef.current) return;
    if (ids === "all") void fetch(`${API_BASE}/broadcasts/read-all`, { method: "POST" }).catch(() => {});
    else for (const id of ids) void fetch(`${API_BASE}/broadcasts/${id}/read`, { method: "POST" }).catch(() => {});
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (sessionLost(res) || !res.ok) return;
      const data: RealmStatus = await res.json();
      setStatus(data);
      setRealmTime(data.realmTime, data.serverNow);
      setRealmDisaster(data.disaster, data.serverNow);
      setRealmHorrors(data.horrors, data.serverNow);
      setOnlineIds(data.onlineIds);
      // Next regular respawn in local time (corrected for server clock skew)
      if (data.nextRespawnAt && data.serverNow) setNextRespawnAt(data.nextRespawnAt - (data.serverNow - Date.now()));
      // New roving window or an admin respawn -> pull the new encounters
      if (data.rovingKey && data.rovingKey !== rovingKeyRef.current) {
        rovingKeyRef.current = data.rovingKey;
        fetchRoving();
      }
      // A ruler ascended to or fell from the Voidrift (or swapped): re-anchor castles before anything else
      if (data.civKey && data.civKey !== civKeyRef.current) {
        const first = civKeyRef.current === null;
        civKeyRef.current = data.civKey;
        if (!first) reanchorRealm();
      }
      // The landmarks rotated (or their rotation day ended) -> pull the map again
      if (data.landmarkKey && data.landmarkKey !== landmarkKeyRef.current) {
        const first = landmarkKeyRef.current === null;
        landmarkKeyRef.current = data.landmarkKey;
        if (!first) fetchWorldMap();
      }
      // A herald notice was raised -> pull the unread ones
      if (data.noticeKey && data.noticeKey !== noticeKeyRef.current) {
        noticeKeyRef.current = data.noticeKey;
        fetchNotices();
      }
      // A background Git sync finished -> pull the fresh realm
      if (data.lastGitSync && data.lastGitSync !== lastSyncRef.current) {
        lastSyncRef.current = data.lastGitSync;
        fetchKingdoms();
        fetchWorldMap();
      }
      fetchSpires();
      fetchMarches();
      fetchBattleReports();
      fetchSwapProposals();
      fetchScoutReports();
      fetchRallies();
    } catch (err) {
      console.error("Failed to fetch status:", err);
    }
  }, [fetchKingdoms, fetchWorldMap, fetchRoving, fetchSpires, fetchMarches, fetchBattleReports, fetchSwapProposals, fetchScoutReports, fetchRallies, reanchorRealm, fetchNotices]);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`);
      if (!res.ok) return;
      const data: { enabled: boolean; user: AuthUser | null; isAdmin?: boolean } = await res.json();
      setAuthEnabled(data.enabled);
      setMe(data.user);
      meRef.current = data.user;
      setIsAdmin(Boolean(data.isAdmin || data.user?.isAdmin));
    } catch {
      // auth endpoint unavailable — stay signed out
    }
  }, []);

  useEffect(() => {
    // Git redirects back with ?signin_error=… when sign-in fails
    const params = new URLSearchParams(window.location.search);
    const signinError = params.get("signin_error");
    if (signinError) {
      window.history.replaceState(null, "", window.location.pathname);
      void dialog.alert({ tone: "danger", title: "Sign in with Git failed", message: signinError });
    }
    fetch(`${API_BASE}/upgrades`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setUpgradeCatalog)
      .catch(() => {});
    // Know who is signed in before picking the starting kingdom (and whose notices to open)
    fetchMe().finally(() => {
      fetchKingdoms();
      fetchNotices();
    });
    fetchStatus();
    fetchWorldMap();
    fetchSpires();
    fetchMarches();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchKingdoms, fetchStatus, fetchWorldMap, fetchMe, fetchSpires, fetchMarches, fetchNotices, dialog]);

  // A slumbering boss wakes at its respawn time: pull the bosses again right then (the roving key doesn't change)
  const nextBossWake = Math.min(Infinity, ...Object.values(bossStatuses).map((b) => (b.dead ? b.next?.wakesAt ?? b.respawnAt ?? Infinity : Infinity)));
  useEffect(() => {
    if (!Number.isFinite(nextBossWake)) return;
    // setTimeout caps at ~24.8 days; a boss sleeps 24 h at most
    const t = setTimeout(fetchRoving, Math.max(0, nextBossWake - Date.now()) + 1500);
    return () => clearTimeout(t);
  }, [nextBossWake, fetchRoving]);

  useEffect(() => {
    onMarchFinishedRef.current = () => {
      fetchKingdoms(); // also reloads the current kingdom
      fetchStatus();
    };
  }, [fetchKingdoms, fetchStatus]);

  // Poll right after the next army is due home (the server's war tick banks it within ~2 s), instead of
  // waiting for the regular poll
  useEffect(() => {
    const now = Date.now();
    const due = activeMarches.filter((m) => m.phase === "returning" && m.returnTime && m.returnTime > now).map((m) => m.returnTime!);
    if (due.length === 0) return;
    const id = setTimeout(fetchMarches, Math.min(...due) - now + 2200);
    return () => clearTimeout(id);
  }, [activeMarches, fetchMarches]);

  // Live battles: poll right when the next round is due (GET /marches steps it), so its numbers rise on the round's tick
  // instead of up to a poll later. Round 1 is fought on arrival, then one every BATTLE_ROUND_MS
  useEffect(() => {
    const now = Date.now();
    const due = activeMarches
      .filter((m) => m.phase === "acting" && m.battleId && !m.gather)
      .map((m) => (m.lastRoundAt ? m.lastRoundAt + BATTLE_ROUND_MS : m.arrivalTime))
      .filter((t) => t > now - 1000);
    if (due.length === 0) return;
    const id = setTimeout(fetchMarches, Math.max(0, Math.min(...due) - now) + 250);
    return () => clearTimeout(id);
  }, [activeMarches, fetchMarches]);

  const enterCity = (id: string) => {
    sound.playClick();
    fetchKingdom(id);
    setViewMode("city_view");
  };

  /** Make a kingdom the current one without leaving the world map (HUD and actions follow it) */
  const inspectKingdom = (id: string) => {
    sound.playClick();
    fetchKingdom(id);
  };

  const returnToWorldMap = () => {
    sound.playClick();
    setViewMode("world_map");
    fetchKingdoms();
  };

  const changeCivilization = async (
    kingdomIdOrCiv: string,
    maybeCiv?: CivilizationType
  ): Promise<{ success: boolean; error?: string }> => {
    const targetId = maybeCiv ? kingdomIdOrCiv : currentKingdom?.id;
    const civ = (maybeCiv ?? kingdomIdOrCiv) as CivilizationType;
    if (!targetId) return { success: false, error: "No kingdom selected" };
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(targetId)}/civilization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ civilization: civ })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!maybeCiv) {
          void dialog.alert({ tone: "danger", title: "Can't change civilization", message: data.error || "The change was refused." });
        }
        return { success: false, error: data.error || "The change was refused." };
      }
      sound.playLevelUp();
      if (currentKingdom?.id === targetId) {
        kingdomJsonRef.current = "";
        setCurrentKingdom(data.kingdom);
      }
      fetchKingdoms();
      fetchWorldMap();
      fetchStatus();
      return { success: true };
    } catch (err: any) {
      console.error("Failed to change civilization:", err);
      return { success: false, error: err.message || "Network error" };
    }
  };

  /** Swap the plots of two of the owner's buildings. Returns an error message or null. */
  const swapBuildings = async (buildingId: string, withBuildingId: string): Promise<string | null> => {
    if (!currentKingdom) return "No kingdom selected";
    try {
      const res = await fetch(
        `${API_BASE}/kingdoms/${encodeURIComponent(currentKingdom.id)}/buildings/${encodeURIComponent(buildingId)}/swap`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ withRepoId: withBuildingId }) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || "Swap failed";
      sound.playLevelUp();
      kingdomJsonRef.current = "";
      setCurrentKingdom(data.kingdom);
      setSelectedBuilding(data.kingdom?.buildings?.find((b: RepoBuilding) => b.id === buildingId) ?? null);
      fetchStatus();
      return null;
    } catch (err) {
      console.error("Failed to swap buildings:", err);
      return "Swap failed";
    }
  };

  /** Buy the next tier of a city improvement for the signed-in owner. Returns an error message or null. */
  const buyUpgrade = async (upgradeId: string): Promise<string | null> => {
    if (!currentKingdom) return "No kingdom selected";
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(currentKingdom.id)}/upgrades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upgradeId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || "Purchase failed";
      sound.playLevelUp();
      kingdomJsonRef.current = "";
      setCurrentKingdom(data.kingdom);
      fetchStatus();
      return null;
    } catch {
      return "Purchase failed";
    }
  };

  /** 📜 Royal Proclamations: call Paid Settlers or declare a Festival (null on success, else the reason) */
  const proclaim = async (kind: "settlers" | "festival"): Promise<string | null> => {
    if (!currentKingdom) return "No kingdom selected";
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(currentKingdom.id)}/${kind}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || "The proclamation failed";
      sound.playLevelUp();
      kingdomJsonRef.current = "";
      setCurrentKingdom(data.kingdom);
      fetchKingdoms();
      return null;
    } catch {
      return "The proclamation failed";
    }
  };

  const signIn = () => {
    window.location.href = `${API_BASE}/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
  };

  const signOut = async () => {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST" }).catch(() => {});
    // Back to the login screen (the realm's data needs a session unless the server allows guests)
    setGuest(false);
    window.location.reload();
  };

  const resetWorld = async () => {
    const res = await fetch(`${API_BASE}/admin/reset-world`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to reset world map");
    await Promise.all([fetchKingdoms(), fetchWorldMap(), fetchStatus()]);
    if (currentIdRef.current) {
      await fetchKingdom(currentIdRef.current);
    }
    return data;
  };

  const relayoutKingdoms = async () => {
    const res = await fetch(`${API_BASE}/admin/relayout-kingdoms`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to refresh kingdom positions");
    await Promise.all([fetchKingdoms(), fetchWorldMap(), fetchSpires(), fetchStatus()]);
    return data;
  };

  const resetLedger = async () => {
    const res = await fetch(`${API_BASE}/admin/reset-ledger`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to reset treasury ledger");
    await Promise.all([fetchKingdoms(), fetchStatus()]);
    if (currentIdRef.current) {
      await fetchKingdom(currentIdRef.current);
    }
    return data;
  };

  const respawnEncounters = async () => {
    const res = await fetch(`${API_BASE}/admin/respawn-encounters`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to respawn encounters");
    rovingKeyRef.current = data.key;
    rovingJsonRef.current = "";
    setRovingNPCs(data.npcs ?? []);
    return data;
  };

  /** Admin 🗿 Reset Landmarks: every region (or one) rotates its epic landmarks now */
  const resetLandmarks = async (zoneId: string | null, finished: boolean) => {
    const res = await fetch(`${API_BASE}/admin/reset-landmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zoneId: zoneId ?? undefined, finished })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to reset landmarks");
    await Promise.all([fetchWorldMap(), fetchStatus()]);
    return data as { message?: string };
  };

  /** Admin 🚩 Move Realms: the buffer realms of every region (or one) move now */
  const moveRealms = async (zoneId: string | null) => {
    const res = await fetch(`${API_BASE}/admin/move-realms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zoneId: zoneId ?? undefined })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to move the realms");
    await Promise.all([fetchWorldMap(), fetchStatus()]);
    return data as { message?: string };
  };

  const triggerHarvest = async () => {
    const res = await fetch(`${API_BASE}/admin/trigger-harvest`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to execute realm harvest");
    await Promise.all([fetchKingdoms(), fetchStatus()]);
    if (currentIdRef.current) {
      await fetchKingdom(currentIdRef.current);
    }
    return data;
  };

  const resyncDevCommits = async (devId: string) => {
    const res = await fetch(`${API_BASE}/admin/dev/${encodeURIComponent(devId)}/resync-commits`, {
      method: "POST"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to re-check developer commits");
    await Promise.all([fetchKingdoms(), fetchStatus()]);
    if (currentIdRef.current === devId) {
      await fetchKingdom(devId);
    }
    return data;
  };

  /**
   * Admin: link (POST) or unlink (DELETE) a commit email to a developer; the commits under it move with it.
   * With repos, only the email's commits in those repos (a shared email matched per repo).
   */
  const changeDevEmail = async (method: "POST" | "DELETE", devId: string, email: string, repoIds: string[] = []) => {
    const base = `${API_BASE}/admin/dev/${encodeURIComponent(devId)}/emails`;
    const repoQuery = method === "DELETE" && repoIds[0] ? `?repo=${encodeURIComponent(repoIds[0])}` : "";
    const res = await fetch(method === "POST" ? base : `${base}/${encodeURIComponent(email)}${repoQuery}`, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(repoIds.length ? { email, repoIds } : { email }) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to change the developer's emails");
    await Promise.all([fetchKingdoms(), fetchStatus()]);
    if (currentIdRef.current === devId) {
      await fetchKingdom(devId);
    }
    return data as { message: string; emails: DevEmail[] };
  };
  const assignDevEmail = (devId: string, email: string, repoIds?: string[]) => changeDevEmail("POST", devId, email, repoIds);
  const unassignDevEmail = (devId: string, email: string, repoId?: string) => changeDevEmail("DELETE", devId, email, repoId ? [repoId] : []);

  /** Admin: strip a kingdom's improvements and refund 100% of what they cost */
  const resetKingdomUpgrades = async (kingdomId: string) => {
    const res = await fetch(`${API_BASE}/admin/kingdoms/${encodeURIComponent(kingdomId)}/reset-upgrades`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to reset improvements");
    await Promise.all([fetchKingdoms(), fetchStatus()]);
    if (currentIdRef.current === kingdomId) {
      await fetchKingdom(kingdomId);
    }
    return data;
  };

  /** Admin: strip every ruler's improvements and refund 100% of what they cost */
  const resetAllKingdomUpgrades = async () => {
    const res = await fetch(`${API_BASE}/admin/reset-upgrades`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to reset improvements");
    await Promise.all([fetchKingdoms(), fetchStatus()]);
    if (currentIdRef.current) {
      await fetchKingdom(currentIdRef.current);
    }
    return data;
  };

  const resetBackfill = async () => {
    const res = await fetch(`${API_BASE}/admin/backfill/reset`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to reset backfill checkpoints");
    await Promise.all([fetchKingdoms(), fetchStatus()]);
    return data;
  };

  const fetchAdminValidations = useCallback(async () => {
    if (!isAdmin) {
      setAdminWarnings([]);
      setTotalAdminWarnings(0);
      setIgnoredRepos([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/admin/validations`);
      if (!res.ok) return;
      const data = await res.json();
      setAdminWarnings(data.warnings || []);
      setTotalAdminWarnings(Number(data.totalWarnings || 0));
      setIgnoredRepos(data.ignoredRepos || []);
    } catch {
      // ignore
    }
  }, [isAdmin]);

  // Re-check periodically so duplicates added by a later Git sync still raise the banner
  useEffect(() => {
    if (!isAdmin) return;
    fetchAdminValidations();
    const id = setInterval(fetchAdminValidations, 5 * 60_000);
    return () => clearInterval(id);
  }, [isAdmin, fetchAdminValidations]);

  const deleteAdminRepository = async (repoId: string) => {
    const res = await fetch(`${API_BASE}/admin/repositories/${encodeURIComponent(repoId)}`, {
      method: "DELETE"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to delete repository");
    await Promise.all([fetchKingdoms(), fetchAdminValidations()]);
    return data;
  };

  const deleteAllAdminDuplicates = async (repoIds?: string[]) => {
    const res = await fetch(`${API_BASE}/admin/repositories/delete-duplicates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoIds })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to delete duplicate repositories");
    await Promise.all([fetchKingdoms(), fetchAdminValidations()]);
    return data;
  };

  const restoreAdminRepository = async (repoId: string) => {
    const res = await fetch(`${API_BASE}/admin/repositories/${encodeURIComponent(repoId)}/restore`, {
      method: "POST"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to restore repository");
    await fetchAdminValidations();
    return data;
  };

  const checkIgnoredRepoCommits = async (repoIds?: string[]) => {
    const res = await fetch(`${API_BASE}/admin/ignored-repositories/check-commits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoIds })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to check ignored repositories");
    if (Array.isArray(data.ignoredRepos)) setIgnoredRepos(data.ignoredRepos);
    return data;
  };

  const mobilize = async (kingdomId: string, soldiers: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(kingdomId)}/mobilize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soldiers })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || "Mobilization failed" };
      sound.playClick();
      if (currentKingdom && currentKingdom.id === kingdomId) {
        kingdomJsonRef.current = "";
        setCurrentKingdom(data.kingdom);
      }
      fetchKingdoms();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };

  const summon = async (kingdomId: string, count: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(kingdomId)}/summon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || "Summoning failed" };
      if (currentKingdom && currentKingdom.id === kingdomId) {
        kingdomJsonRef.current = "";
        setCurrentKingdom(data.kingdom);
      }
      fetchKingdoms();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };

  /** 🌙 Elves: pay to hasten every wounded soldier home from the Moonwell */
  const hastenWounded = async (kingdomId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(kingdomId)}/wounded/hasten`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || "The Moonwell could not be hastened" };
      if (currentKingdom && currentKingdom.id === kingdomId) {
        kingdomJsonRef.current = "";
        setCurrentKingdom(data.kingdom);
      }
      fetchKingdoms();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };

  const proposeSwap = async (fromId: string, targetId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(fromId)}/swap-proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || "Proposal failed" };
      fetchSwapProposals();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };

  const answerSwap = async (proposalId: string, action: "accept" | "decline" | "cancel"): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/swap-proposals/${encodeURIComponent(proposalId)}/${action}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || "Failed" };
      if (action === "accept") {
        sound.playLevelUp();
        fetchKingdoms();
        fetchWorldMap();
        if (currentIdRef.current) fetchKingdom(currentIdRef.current);
      }
      fetchSwapProposals();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };

  const dispatchMarch = async (params: {
    attackerId: string;
    targetType: MarchTargetParam;
    targetId: string;
    soldiers: number;
    kind?: MarchKind;
    /** 🪙 March this mercenary band instead of soldiers */
    bandId?: string;
    /** 🗡️ The Armory set the soldiers wear ("standard" or a rarity) */
    loadout?: string;
    /** 🦸 The kingdom's champion leads the march */
    champion?: boolean;
  }): Promise<{ success: boolean; error?: string; march?: ActiveMarch }> => {
    try {
      const res = await fetch(`${API_BASE}/marches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || "March dispatch failed" };
      sound.playLevelUp();
      fetchMarches();
      fetchSpires();
      if (currentKingdom && currentKingdom.id === params.attackerId) {
        kingdomJsonRef.current = "";
        setCurrentKingdom(data.kingdom);
      }
      fetchKingdoms();
      return { success: true, march: data.march };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };

  /** ⚔️ The Muster: several marches at once, all or none (`POST /marches/muster`); `problems` lists every reason it can't */
  const dispatchMuster = async (params: {
    attackerId: string;
    targetType: MarchTargetParam;
    targetId: string;
    kind: "attack" | "rally";
    waitMs?: number;
    marches: MusterMarch[];
  }): Promise<{ success: boolean; error?: string; problems?: string[]; result?: MusterResult }> => {
    try {
      const res = await fetch(`${API_BASE}/marches/muster`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || "The muster could not set off", problems: Array.isArray(data.problems) ? data.problems : undefined };
      sound.playLevelUp();
      fetchMarches();
      fetchRallies();
      fetchSpires();
      if (currentKingdom && currentKingdom.id === params.attackerId && data.kingdom) {
        kingdomJsonRef.current = "";
        setCurrentKingdom(data.kingdom);
      }
      fetchKingdoms();
      return { success: true, result: { marches: data.marches ?? [], arrivalTime: data.arrivalTime, ...(data.rallyId ? { rallyId: data.rallyId } : {}) } };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };

  const previewMarch = async (params: { attackerId: string; targetType: MarchTargetParam; targetId: string; kind?: MarchKind }): Promise<MarchPreview | null> => {
    try {
      const qs = new URLSearchParams({ ...params, kind: params.kind ?? "attack" }).toString();
      const res = await fetch(`${API_BASE}/marches/preview?${qs}`);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };

  /** POST helper for the war actions below: refreshes marches, rallies and the realm on success */
  const warAction = async (url: string, body?: object): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {})
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || "Failed" };
      sound.playClick();
      fetchMarches();
      fetchRallies();
      fetchKingdoms();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };
  const startRally = (params: { leaderId: string; targetType: MarchTargetParam; targetId: string; waitMs: number; soldiers: number; loadout?: string; champion?: boolean }) => warAction(`/rallies`, params);
  const joinRally = (rallyId: string, soldiers: number, loadout?: string, champion?: boolean) => warAction(`/rallies/${encodeURIComponent(rallyId)}/join`, { soldiers, ...(loadout ? { loadout } : {}), ...(champion ? { champion: true } : {}) });
  const cancelRally = (rallyId: string) => warAction(`/rallies/${encodeURIComponent(rallyId)}/cancel`);
  const recallMarch = (marchId: string) => warAction(`/marches/${encodeURIComponent(marchId)}/recall`);
  const sendReinforcementHome = (marchId: string) => warAction(`/marches/${encodeURIComponent(marchId)}/send-home`);

  const sendResources = async (params: {
    senderId: string;
    recipientId: string;
    food?: number;
    wood?: number;
    stone?: number;
    iron?: number;
    gold?: number;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(params.senderId)}/send-resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || "Failed to dispatch resource caravan" };
      sound.playLevelUp();
      fetchKingdoms();
      if (currentKingdom && (currentKingdom.id === params.senderId || currentKingdom.id === params.recipientId)) {
        fetchKingdom(currentKingdom.id);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };

  const fetchPopLedger = async (userId: string): Promise<PopulationLedgerEntry[]> => {
    try {
      const res = await fetch(`${API_BASE}/kingdoms/${encodeURIComponent(userId)}/population-ledger`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.ledger || [];
    } catch (err) {
      console.error("Failed to fetch population ledger:", err);
      return [];
    }
  };

  // This week's boss of each zone (the rotation can change while the page is open); where a boss fell, the next
  // boss of the pool rises as a phantom until it wakes. Keyed on identity + alive only, so HP changes never rebuild the continent.
  const bossMapKey = Object.entries(bossStatuses)
    .map(([id, b]) => `${id}:${b.type}:${b.dead ? `${b.respawnAt ?? 1}>${b.next?.type ?? ""}` : 0}`)
    .join("|");
  const worldMapView = useMemo(() => {
    if (!worldMap || !bossMapKey) return worldMap;
    return {
      ...worldMap,
      npcs: worldMap.npcs.flatMap((n) => {
        const b = bossStatuses[n.id];
        if (!b) return [n];
        const live = { ...n, name: b.name, type: b.type, emblem: b.emblem, subtitle: b.subtitle, description: b.description, bossIndex: b.bossIndex };
        if (!b.dead) return [live];
        // Fallen: the next boss of the pool rises as a phantom where it fell, until it wakes
        const next = b.next;
        const slumberUntil = next?.wakesAt ?? b.respawnAt ?? undefined;
        return [next ? { ...live, name: next.name, type: next.type, emblem: next.emblem, bossIndex: next.bossIndex, slumberUntil, fallenName: b.name } : { ...live, slumberUntil }];
      })
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldMap, bossMapKey]);

  return {
    kingdoms,
    currentKingdom,
    selectedBuilding,
    setSelectedBuilding,
    worldMap: worldMapView,
    bossStatuses,
    realmShift,
    npcKingdomStatuses,
    rovingNPCs,
    horrorNPCs,
    nodeStatuses,
    nextRespawnAt,
    viewMode,
    setViewMode,
    status,
    loading,
    kingdomSwitching: switchingKingdomId !== null,
    enterCity,
    inspectKingdom,
    returnToWorldMap,
    changeCivilization,
    swapBuildings,
    buyUpgrade,
    proclaim,
    upgradeCatalog,
    me,
    isAdmin,
    resetWorld,
    relayoutKingdoms,
    resetLedger,
    triggerHarvest,
    respawnEncounters,
    resetLandmarks,
    moveRealms,
    resyncDevCommits,
    assignDevEmail,
    unassignDevEmail,
    resetKingdomUpgrades,
    resetAllKingdomUpgrades,
    resetBackfill,
    adminWarnings,
    totalAdminWarnings,
    ignoredRepos,
    fetchAdminValidations,
    deleteAdminRepository,
    deleteAllAdminDuplicates,
    restoreAdminRepository,
    checkIgnoredRepoCommits,
    refetchKingdoms: fetchKingdoms,
    authEnabled,
    signIn,
    signOut,
    refreshStatus: fetchStatus,
    spires,
    activeMarches,
    fetchSpires,
    fetchMarches,
    battleReports,
    activeBattleReport,
    openBattleReport,
    markAllReportsRead,
    readReportIds: readReportIds ?? EMPTY_IDS,
    chronicleAlert,
    dismissChronicleAlert,
    notices,
    markNoticesRead,
    unreadBattleReports:
      me && readReportIds ? battleReports.filter((r) => (r.attackerId === me.id || r.defenderId === me.id || r.participants?.includes(me.id)) && !readReportIds.has(r.id)).length : 0,
    fetchBattleReports,
    scoutReports,
    rallies,
    startRally,
    joinRally,
    cancelRally,
    recallMarch,
    sendReinforcementHome,
    mobilize,
    dispatchMarch,
    dispatchMuster,
    previewMarch,
    summon,
    hastenWounded,
    swapProposals,
    proposeSwap,
    answerSwap,
    incomingSwapCount: me ? swapProposals.filter((p) => p.status === "pending" && p.toId === me.id).length : 0,
    sendResources,
    fetchPopLedger
  };
}
