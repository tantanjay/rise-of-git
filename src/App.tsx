import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useGameState } from "./hooks/useGameState";
import { Scene3D } from "./components/3d/Scene3D";
import type { WorldFocusRequest } from "./components/3d/FlatWorldMap3D";
import { TopHUD } from "./components/ui/TopHUD";
import { BottomTicker } from "./components/ui/BottomTicker";
import { BuildingModal } from "./components/ui/BuildingModal";
import { NPCModal } from "./components/ui/NPCModal";
import { MercenaryCampModal } from "./components/ui/MercenaryCampModal";
import { isOwnCamp } from "./utils/mercenaries";
import { HeraldModal } from "./components/ui/HeraldModal";
import { WhatsNewModal } from "./components/ui/WhatsNewModal";
import { unseenNotices, type UpdateNotice } from "./components/ui/updateNotices";
import { CityDirectory } from "./components/ui/CityDirectory";
import { MarchQueue } from "./components/ui/MarchQueue";
import { AdminWarningBanner } from "./components/ui/AdminWarningBanner";
import { QueueBanner } from "./components/ui/QueueBanner";
import { ChronicleBanner } from "./components/ui/ChronicleBanner";
import { DeedIcon, OmenIcon } from "./components/ui/realmIcons";
import type { KingdomTab } from "./components/ui/KingdomModal";
import type { ComposerKind } from "./components/ui/AttackModal";
import { deferred } from "./components/ui/deferred";
import { fetchUnmatchedEmails } from "./utils/unmatchedEmails";
// Windows opened on demand: fetched the first time they open, so they stay out of the first download
const KingdomModal = deferred(() => import("./components/ui/KingdomModal"), "KingdomModal", (p) => p.open);
const WarRoomModal = deferred(() => import("./components/ui/WarRoomModal"), "WarRoomModal", (p) => p.open);
const AttackModal = deferred(() => import("./components/ui/AttackModal"), "AttackModal", (p) => Boolean(p.spire || p.targetKingdom || p.npcTarget));
const BattleReportModal = deferred(() => import("./components/ui/BattleReportModal"), "BattleReportModal", (p) => Boolean(p.report));
const ScoutReportModal = deferred(() => import("./components/ui/ScoutReportModal"), "ScoutReportModal", (p) => Boolean(p.report));
const KingdomActionModal = deferred(() => import("./components/ui/KingdomActionModal"), "KingdomActionModal", (p) => Boolean(p.kingdom));
const LedgerModal = deferred(() => import("./components/ui/LedgerModal"), "LedgerModal", (p) => p.isOpen);
const DevProfileModal = deferred(() => import("./components/ui/DevProfileModal"), "DevProfileModal", (p) => Boolean(p.kingdom));
const ImprovementsModal = deferred(() => import("./components/ui/ImprovementsModal"), "ImprovementsModal", (p) => p.open);
const AdminModal = deferred(() => import("./components/ui/AdminModal"), "AdminModal", (p) => p.open);
const AdminWarningsModal = deferred(() => import("./components/ui/AdminWarningsModal"), "AdminWarningsModal", (p) => p.open);
const DevEmailsModal = deferred(() => import("./components/ui/DevEmailsModal"), "DevEmailsModal", (p) => p.open);
const RoyalDecreesModal = deferred(() => import("./components/ui/RoyalDecreesModal"), "RoyalDecreesModal", (p) => p.open);
const HallOfRenownModal = deferred(() => import("./components/ui/HallOfRenownModal"), "HallOfRenownModal", (p) => p.open);
const ScriptoriumModal = deferred(() => import("./components/ui/ScriptoriumModal"), "ScriptoriumModal", (p) => p.open);
const DeedReviewModal = deferred(() => import("./components/ui/DeedReviewModal"), "DeedReviewModal", (p) => p.open);
const WatchtowerModal = deferred(() => import("./components/ui/WatchtowerModal"), "WatchtowerModal", (p) => p.open);
const OmensModal = deferred(() => import("./components/ui/OmensModal"), "OmensModal", (p) => p.open);
const SendOmenModal = deferred(() => import("./components/ui/OmensModal"), "SendOmenModal", (p) => p.open);
// The Royal Codex (guide, catalog, 3D previews, soundtracks) loads on first open
const CodexModal = lazy(() => import("./components/ui/CodexModal").then((m) => ({ default: m.CodexModal })));
import { MapNPC, DeveloperKingdom, NethergardeSpire, ScoutReport } from "./types";
import { combatAt, interpolateMarchPosition } from "./utils/war";

export function App() {
  const [selectedNPC, setSelectedNPC] = useState<MapNPC | null>(null);
  // March composer (attack / scout) and its target: a Voidrift NPC kingdom, a kingdom or a map NPC
  const [marchTarget, setMarchTarget] = useState<{ spire?: NethergardeSpire; kingdom?: DeveloperKingdom; npc?: MapNPC; kind: ComposerKind } | null>(null);
  const [selectedKingdomAction, setSelectedKingdomAction] = useState<DeveloperKingdom | null>(null);
  // Kingdom (game) info panel: which kingdom and which tab
  const [kingdomInfo, setKingdomInfo] = useState<{ id: string; tab: KingdomTab } | null>(null);
  const [isWarRoomOpen, setIsWarRoomOpen] = useState(false);
  // A report opened from the War Room gets a "back" button
  const [reportFromWarRoom, setReportFromWarRoom] = useState(false);
  const [activeScoutReport, setActiveScoutReport] = useState<ScoutReport | null>(null);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [devProfileKingdom, setDevProfileKingdom] = useState<DeveloperKingdom | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [worldFocusRequest, setWorldFocusRequest] = useState<WorldFocusRequest | null>(null);
  const [improvementsOpen, setImprovementsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAdminWarningsModalOpen, setIsAdminWarningsModalOpen] = useState(false);
  const [isDevEmailsOpen, setIsDevEmailsOpen] = useState(false);
  const [unmatchedEmails, setUnmatchedEmails] = useState<number | null>(null);
  const [isCodexOpen, setIsCodexOpen] = useState(false);
  /** The Codex's top tab to open on (the weekly story's banner opens the Chronicles) */
  const [codexSection, setCodexSection] = useState<string | undefined>(undefined);
  const [codexChapter, setCodexChapter] = useState<string | undefined>(undefined);
  /** 📣 What's New: shown once a visit while a notice isn't dismissed ("auto"), or reopened from the ☰ menu ("all") */
  const [whatsNew, setWhatsNew] = useState<{ mode: "auto" | "all"; notices: UpdateNotice[] } | null>(null);
  const whatsNewChecked = useRef(false);
  const [isDecreesOpen, setIsDecreesOpen] = useState(false);
  const [isRenownOpen, setIsRenownOpen] = useState(false);
  // 🪶 Scriptorium (tab + tree selection it opens on) and the managers' deed review list
  const [scriptorium, setScriptorium] = useState<{ tab: "deeds" | "tree"; unsorted?: boolean } | null>(null);
  const [isDeedReviewOpen, setIsDeedReviewOpen] = useState(false);
  const [isWatchtowerOpen, setIsWatchtowerOpen] = useState(false);
  // 🌠 Omens: send one (everyone signed in), read them (admins)
  const [isSendOmenOpen, setIsSendOmenOpen] = useState(false);
  const [isOmensOpen, setIsOmensOpen] = useState(false);

  const {
    kingdoms,
    currentKingdom,
    selectedBuilding,
    setSelectedBuilding,
    worldMap,
    rovingNPCs,
    nodeStatuses,
    bossStatuses,
    realmShift,
    npcKingdomStatuses,
    nextRespawnAt,
    respawnEncounters,
    resetLandmarks,
    moveRealms,
    viewMode,
    status,
    loading,
    kingdomSwitching,
    enterCity: enterKingdomCity,
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
    resyncDevCommits,
    assignDevEmail,
    unassignDevEmail,
    resetKingdomUpgrades,
    resetAllKingdomUpgrades,
    resetBackfill,
    refetchKingdoms,
    authEnabled,
    signIn,
    signOut,
    spires,
    activeMarches,
    fetchMarches,
    battleReports,
    activeBattleReport,
    openBattleReport,
    markAllReportsRead,
    scoutReports,
    rallies,
    startRally,
    joinRally,
    cancelRally,
    recallMarch,
    sendReinforcementHome,
    readReportIds,
    unreadBattleReports,
    chronicleAlert,
    dismissChronicleAlert,
    notices,
    markNoticesRead,
    mobilize,
    dispatchMarch,
    dispatchMuster,
    previewMarch,
    summon,
    hastenWounded,
    swapProposals,
    proposeSwap,
    answerSwap,
    incomingSwapCount,
    sendResources,
    fetchPopLedger,
    adminWarnings,
    totalAdminWarnings,
    ignoredRepos,
    fetchAdminValidations,
    deleteAdminRepository,
    deleteAllAdminDuplicates,
    restoreAdminRepository,
    checkIgnoredRepoCommits,
    refreshStatus
  } = useGameState();
  const isManager = Boolean(isAdmin || me?.isSpecial);
  const pendingDeeds = isManager ? status?.pendingDeeds ?? 0 : 0;
  const newOmens = isAdmin ? status?.newOmens ?? 0 : 0;

  // Our civilization changed (Voidrift ascension or fall, swap): the castle moved province, so the map glides to it
  useEffect(() => {
    if (!realmShift) return;
    const pos = worldMap?.kingdomPlacements?.[realmShift.kingdomId];
    if (pos) setWorldFocusRequest({ x: pos.x, z: pos.z, nonce: realmShift.nonce });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realmShift]);

  // Entering a city drops any pending world-map focus, so coming back shows the whole realm again
  const enterCity = (id: string) => {
    setWorldFocusRequest(null);
    enterKingdomCity(id);
  };

  // Kingdom picker: on the world map the camera glides to that castle (and it becomes the current
  // kingdom) without leaving the map; in a city it switches to that developer's city
  const pickKingdom = (id: string) => {
    if (viewMode !== "world_map") return enterCity(id);
    inspectKingdom(id);
    const pos = worldMap?.kingdomPlacements?.[id];
    if (pos) setWorldFocusRequest({ x: pos.x, z: pos.z, nonce: Date.now(), kingdomId: id });
  };

  // A castle picked in the kingdom picker shows an Enter hint: the Enter key steps into that city,
  // any click (not a drag of the map) dismisses it
  const inspectedKingdomId = viewMode === "world_map" ? worldFocusRequest?.kingdomId ?? null : null;
  /** Admin: re-check and open System Validations (from the warnings banner or the Admin Panel) */
  const openValidations = () => {
    fetchAdminValidations();
    setIsAdminWarningsModalOpen(true);
  };
  // Any window or panel over the map (also hides the map labels)
  const panelOpen = Boolean(selectedKingdomAction || marchTarget || selectedBuilding || selectedNPC || kingdomInfo || isWarRoomOpen || isLedgerOpen || devProfileKingdom || improvementsOpen || isAdminOpen || isCodexOpen || activeBattleReport || isAdminWarningsModalOpen || isDevEmailsOpen || isDecreesOpen || isRenownOpen || scriptorium || isDeedReviewOpen || isWatchtowerOpen || isSendOmenOpen || isOmensOpen);
  // Admin card badge: commit emails nobody owns, re-read whenever the admin window opens
  useEffect(() => {
    if (!isAdminOpen || !isAdmin) return;
    fetchUnmatchedEmails()
      .then((list) => setUnmatchedEmails(list.length))
      .catch(() => setUnmatchedEmails(null));
  }, [isAdminOpen, isAdmin]);
  const enterCityRef = useRef(enterCity);
  enterCityRef.current = enterCity;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  useEffect(() => {
    if (!inspectedKingdomId) return;
    const dismiss = () => setWorldFocusRequest((r) => (r?.kingdomId ? { ...r, kingdomId: undefined } : r));
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) dismiss();
      down = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (panelOpenRef.current) return;
      e.preventDefault();
      enterCityRef.current(inspectedKingdomId);
    };
    // Capture phase: runs before the click that may pick another kingdom
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [inspectedKingdomId]);

  const isOwner = Boolean(me && currentKingdom && me.id === currentKingdom.id);
  const myKingdom = kingdoms.find((k) => me && k.id === me.id) || (isOwner ? currentKingdom : null);

  const reportFor = (targetId: string | undefined) => (targetId ? scoutReports.find((r) => r.targetId === targetId && !r.caught) ?? null : null);
  // A kingdom or Voidrift NPC opened from a list may be stale: show the latest copy (fresh fog / scout report)
  const marchKingdom = marchTarget?.kingdom ? kingdoms.find((k) => k.id === marchTarget.kingdom!.id) ?? marchTarget.kingdom : null;
  const marchSpire = marchTarget?.spire ? spires.find((sp) => sp.id === marchTarget.spire!.id) ?? marchTarget.spire : null;
  const marchNpc = marchTarget?.npc ? rovingNPCs.find((n) => n.id === marchTarget.npc!.id) ?? marchTarget.npc : null;

  // 📣 What's New: once per visit, as soon as the realm is in, if any notice is not dismissed for good
  useEffect(() => {
    if (whatsNewChecked.current || loading || !currentKingdom) return;
    whatsNewChecked.current = true;
    const unseen = unseenNotices();
    if (unseen.length) setWhatsNew({ mode: "auto", notices: unseen });
  }, [loading, currentKingdom]);

  // First Git sync can take a while on big servers — show progress instead of an empty globe
  if (!currentKingdom && (loading || status?.syncing || kingdoms.length === 0)) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 font-medieval text-xl gap-4 text-center px-6">
        <div className="text-6xl animate-bounce">🌍</div>
        <p>
          Summoning live kingdoms from Git — reading users, repositories & commits…
        </p>
        {status?.lastError && <p className="text-sm font-mono text-red-400">⚠️ {status.lastError}</p>}
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      <TopHUD
        viewMode={viewMode}
        kingdoms={kingdoms}
        currentKingdom={currentKingdom}
        syncIntervalMinutes={status?.syncIntervalMinutes ?? 15}
        rovingWindowMinutes={status?.rovingWindowMinutes}
        nextRespawnAt={nextRespawnAt}
        onToggleViewMode={() => {
          if (viewMode === "world_map") {
            if (currentKingdom) enterCity(currentKingdom.id);
          } else {
            returnToWorldMap();
          }
        }}
        onSelectKingdom={pickKingdom}
        onOpenLedger={() => setIsLedgerOpen(true)}
        onOpenCodex={() => {
          setCodexSection(undefined);
          setCodexChapter(undefined);
          setIsCodexOpen(true);
        }}
        onOpenWhatsNew={() => setWhatsNew({ mode: "all", notices: [] })}
        onOpenRenown={() => setIsRenownOpen(true)}
        onOpenDevProfile={() => setDevProfileKingdom(currentKingdom)}
        onOpenKingdom={() => currentKingdom && setKingdomInfo({ id: currentKingdom.id, tab: "army" })}
        activeMarches={activeMarches}
        unreadBattleReports={unreadBattleReports + incomingSwapCount}
        onOpenWarRoom={() => setIsWarRoomOpen(true)}
        me={me}
        isAdmin={isAdmin}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenDecrees={() => setIsDecreesOpen(true)}
        adminWarnings={totalAdminWarnings}
        onOpenScriptorium={() => setScriptorium({ tab: "deeds" })}
        pendingDeeds={pendingDeeds}
        onOpenDeedReview={() => setIsDeedReviewOpen(true)}
        onSendOmen={me ? () => setIsSendOmenOpen(true) : undefined}
        newOmens={newOmens}
        onOpenOmens={() => setIsOmensOpen(true)}
        onOpenWatchtower={isManager ? () => setIsWatchtowerOpen(true) : undefined}
        authEnabled={authEnabled}
        onSignIn={signIn}
        onSignOut={signOut}
      />

      {/* 3D Scene: Flat 5-Province World Map or Inside City View */}
      <Scene3D
        viewMode={viewMode}
        kingdoms={kingdoms}
        currentKingdom={currentKingdom}
        kingdomLoading={kingdomSwitching}
        worldMap={worldMap}
        rovingNPCs={rovingNPCs}
        nodeStatuses={nodeStatuses}
        bossStatuses={bossStatuses}
        npcKingdomStatuses={npcKingdomStatuses}
        spires={spires}
        activeMarches={activeMarches}
        hideTooltips={panelOpen}
        focusRequest={focusRequest}
        worldFocusRequest={worldFocusRequest}
        homeKingdomId={myKingdom?.id ?? null}
        onEnterKingdom={(id) => enterCity(id)}
        onSelectKingdom={(k) => setSelectedKingdomAction(k)}
        onSelectBuilding={(b) => setSelectedBuilding(b)}
        onSelectNPC={(npc) => setSelectedNPC(npc)}
        onSelectSpire={(spire) => setMarchTarget({ spire, kind: "attack" })}
        onOpenDevProfile={(k) => setDevProfileKingdom(k)}
      />

      {/* Top-Left Stack: Admin Warning Banner + Active View Banner (MarchQueue or CityDirectory) */}
      <div className="absolute top-[6.75rem] lg:top-[4.5rem] left-3 sm:left-4 z-20 w-72 max-w-[calc(100vw-1.5rem)] flex flex-col gap-2 pointer-events-none">
        {isAdmin && totalAdminWarnings > 0 && (
          <div className="pointer-events-auto">
            <AdminWarningBanner
              warningsCount={totalAdminWarnings}
              onClick={() => setIsAdminWarningsModalOpen(true)}
            />
          </div>
        )}

        {pendingDeeds > 0 && (
          <div className="pointer-events-auto">
            <QueueBanner
              count={pendingDeeds}
              Icon={DeedIcon}
              label={`${pendingDeeds} ${pendingDeeds === 1 ? "deed awaits" : "deeds await"} your seal`}
              title="Deed reports past the first 3 XP of a day, waiting for an Admin, Special Overseer or the Archon"
              onClick={() => setIsDeedReviewOpen(true)}
            />
          </div>
        )}

        {newOmens > 0 && (
          <div className="pointer-events-auto">
            <QueueBanner count={newOmens} Icon={OmenIcon} tone="star" label={`${newOmens} new ${newOmens === 1 ? "omen" : "omens"}`} title="Feedback sent by the realm's developers" onClick={() => setIsOmensOpen(true)} />
          </div>
        )}

        {status?.chronicle && (
          <div className="pointer-events-auto">
            <ChronicleBanner
              chronicle={status.chronicle}
              onRead={() => {
                setCodexSection("chronicles");
                setCodexChapter(undefined);
                setIsCodexOpen(true);
              }}
            />
          </div>
        )}

        {viewMode === "world_map" && (
          <div className="pointer-events-auto">
            <MarchQueue
              marches={activeMarches}
              myKingdom={myKingdom}
              onRefresh={fetchMarches}
              onOpenWarRoom={() => setIsWarRoomOpen(true)}
              rallies={rallies}
              onJoinRally={joinRally}
              onCancelRally={cancelRally}
              onFocusMarch={(m) => {
                const { x, z } = interpolateMarchPosition(m, Date.now());
                setWorldFocusRequest({ x, z, nonce: Date.now() });
              }}
            />
          </div>
        )}

        {viewMode === "city_view" && currentKingdom && (
          <div className="pointer-events-auto">
            <CityDirectory
              key={currentKingdom.id}
              kingdom={currentKingdom}
              onFocusBuilding={(id) => setFocusRequest({ id, nonce: Date.now() })}
              onOpenImprovements={() => setImprovementsOpen(true)}
              isOwner={isOwner}
              marches={activeMarches}
              myKingdom={myKingdom}
              onRefreshMarches={fetchMarches}
              onOpenWarRoom={() => setIsWarRoomOpen(true)}
              rallies={rallies}
              onJoinRally={joinRally}
              onCancelRally={cancelRally}
            />
          </div>
        )}
      </div>

      {currentKingdom && (
        <ImprovementsModal
          open={improvementsOpen}
          onClose={() => setImprovementsOpen(false)}
          kingdom={currentKingdom}
          catalog={upgradeCatalog}
          isOwner={isOwner}
          authEnabled={authEnabled}
          signedIn={Boolean(me)}
          onSignIn={signIn}
          onBuy={buyUpgrade}
          onProclaim={proclaim}
          isAdmin={isAdmin}
          onAdminReset={resetKingdomUpgrades}
        />
      )}

      <BottomTicker status={status} viewMode={viewMode} alert={chronicleAlert} onDismissAlert={dismissChronicleAlert} />

      <BuildingModal
        building={selectedBuilding}
        others={currentKingdom?.buildings ?? []}
        onClose={() => setSelectedBuilding(null)}
        isOwner={isOwner}
        onSwap={swapBuildings}
      />

      {/* 🪙 Your own civilization's legendary landmark holds your Mercenary Camp: clicking it opens the camp (any other is scouted) */}
      <MercenaryCampModal
        landmark={selectedNPC && isOwnCamp(selectedNPC.id, myKingdom?.civilization) ? selectedNPC : null}
        signedIn={Boolean(me)}
        onClose={() => setSelectedNPC(null)}
        onChanged={() => {
          refetchKingdoms();
          fetchMarches();
        }}
      />

      <NPCModal
        island={selectedNPC && !isOwnCamp(selectedNPC.id, myKingdom?.civilization) ? selectedNPC : null}
        report={reportFor(selectedNPC?.id)}
        nodeStatus={selectedNPC ? nodeStatuses[selectedNPC.id] ?? null : null}
        bossStatus={selectedNPC ? bossStatuses[selectedNPC.id] ?? null : null}
        npcKingdomStatus={selectedNPC ? npcKingdomStatuses[selectedNPC.id] ?? null : null}
        combat={combatAt(selectedNPC?.id, activeMarches)}
        myCiv={myKingdom?.civilization ?? null}
        myId={me?.id ?? null}
        activeMarches={activeMarches}
        onClose={() => setSelectedNPC(null)}
        onMarch={(npc, kind) => setMarchTarget({ npc, kind })}
      />

      <LedgerModal
        isOpen={isLedgerOpen}
        onClose={() => setIsLedgerOpen(false)}
        currentKingdom={currentKingdom}
        me={me}
        isAdmin={isAdmin}
        myKingdom={myKingdom}
        kingdoms={kingdoms}
        scoutReport={reportFor(currentKingdom?.id)}
      />

      <DevProfileModal
        kingdom={devProfileKingdom}
        currentKingdom={currentKingdom}
        me={me}
        onClose={() => setDevProfileKingdom(null)}
        onSelectBuilding={(b) => setSelectedBuilding(b)}
        isAdmin={isAdmin}
        onResyncCommits={resyncDevCommits}
        onKingdomUpdated={(updated) => {
          setDevProfileKingdom(updated);
          refetchKingdoms();
        }}
      />

      <KingdomActionModal
        kingdom={selectedKingdomAction}
        combat={combatAt(selectedKingdomAction?.id, activeMarches)}
        activeMarches={activeMarches}
        currentKingdom={kingdoms.find((k) => me && k.id === me.id) || currentKingdom}
        me={me}
        onClose={() => setSelectedKingdomAction(null)}
        onEnterCity={(id) => {
          setSelectedKingdomAction(null);
          enterCity(id);
        }}
        onOpenDevProfile={(k) => {
          setSelectedKingdomAction(null);
          setDevProfileKingdom(k);
        }}
        onOpenKingdomInfo={(k) => {
          setSelectedKingdomAction(null);
          setKingdomInfo({ id: k.id, tab: "overview" });
        }}
        onAttack={(k) => {
          setSelectedKingdomAction(null);
          setMarchTarget({ kingdom: k, kind: "attack" });
        }}
        onScout={(k) => {
          setSelectedKingdomAction(null);
          setMarchTarget({ kingdom: k, kind: "scout" });
        }}
        onReinforce={(k) => {
          setSelectedKingdomAction(null);
          setMarchTarget({ kingdom: k, kind: "reinforce" });
        }}
        onSendResources={sendResources}
        swapProposals={swapProposals}
        onProposeSwap={proposeSwap}
        onAnswerSwap={answerSwap}
      />

      <AttackModal
        spire={marchSpire}
        targetKingdom={marchKingdom}
        npcTarget={marchNpc}
        initialKind={marchTarget?.kind}
        report={reportFor(marchSpire?.id ?? marchKingdom?.id ?? marchNpc?.id)}
        nodeStatus={marchNpc ? nodeStatuses[marchNpc.id] ?? null : null}
        bossStatus={marchNpc ? bossStatuses[marchNpc.id] ?? null : null}
        npcKingdomStatus={marchNpc ? npcKingdomStatuses[marchNpc.id] ?? null : null}
        attackerKingdom={kingdoms.find((k) => me && k.id === me.id) || currentKingdom}
        me={me}
        activeMarches={activeMarches}
        onClose={() => setMarchTarget(null)}
        onPreviewMarch={previewMarch}
        onDispatchMarch={dispatchMarch}
        onDispatchMuster={dispatchMuster}
        onStartRally={startRally}
      />

      <KingdomModal
        open={Boolean(kingdomInfo)}
        onClose={() => setKingdomInfo(null)}
        kingdom={kingdomInfo ? (kingdomInfo.id === currentKingdom?.id ? currentKingdom : kingdoms.find((k) => k.id === kingdomInfo.id) ?? null) : null}
        initialTab={kingdomInfo?.tab}
        me={me}
        onMobilize={mobilize}
        onSummon={summon}
        onHastenWounded={hastenWounded}
        onFetchPopLedger={fetchPopLedger}
        onChangeCivilization={changeCivilization}
        activeMarches={activeMarches}
        onSendHome={sendReinforcementHome}
        onRecall={recallMarch}
      />

      <WarRoomModal
        open={isWarRoomOpen}
        hidden={Boolean(activeBattleReport || activeScoutReport)}
        onClose={() => setIsWarRoomOpen(false)}
        me={me}
        activeMarches={activeMarches}
        reports={battleReports}
        readIds={readReportIds}
        onMarkAllRead={markAllReportsRead}
        kingdoms={kingdoms}
        swapProposals={swapProposals}
        onAnswerSwap={answerSwap}
        onRefreshMarches={fetchMarches}
        scoutReports={scoutReports}
        rallies={rallies}
        myKingdom={myKingdom}
        onJoinRally={joinRally}
        onCancelRally={cancelRally}
        unreadNotices={notices.length}
        onReadNotice={(id) => markNoticesRead([id])}
        onOpenReport={(r) => {
          setReportFromWarRoom(true);
          openBattleReport(r);
        }}
        onOpenScoutReport={(r) => {
          setReportFromWarRoom(true);
          setActiveScoutReport(r);
        }}
      />

      <BattleReportModal
        report={activeBattleReport}
        me={me}
        onBack={
          reportFromWarRoom
            ? () => {
                openBattleReport(null);
                setReportFromWarRoom(false);
              }
            : undefined
        }
        onClose={() => {
          openBattleReport(null);
          setReportFromWarRoom(false);
        }}
      />

      <ScoutReportModal
        report={activeScoutReport}
        onBack={
          reportFromWarRoom
            ? () => {
                setActiveScoutReport(null);
                setReportFromWarRoom(false);
              }
            : undefined
        }
        onClose={() => {
          setActiveScoutReport(null);
          setReportFromWarRoom(false);
        }}
      />

      {!loading && !activeBattleReport && <HeraldModal notices={notices} onRead={markNoticesRead} />}

      {/* What's New waits for the herald's notices and any open report, so the two never stack */}
      {whatsNew && (whatsNew.mode === "all" || (!activeBattleReport && notices.length === 0)) && (
        <WhatsNewModal
          mode={whatsNew.mode}
          notices={whatsNew.notices}
          onClose={() => setWhatsNew(null)}
          onReadGuide={(chapter) => {
            setWhatsNew(null);
            setCodexSection("guide");
            setCodexChapter(chapter);
            setIsCodexOpen(true);
          }}
        />
      )}

      {isCodexOpen && (
        <Suspense fallback={null}>
          <CodexModal open initialSection={codexSection} initialChapter={codexChapter} onClose={() => setIsCodexOpen(false)} />
        </Suspense>
      )}

      <AdminModal
        open={isAdminOpen}
        hidden={isAdminWarningsModalOpen || isDevEmailsOpen}
        onRespawnEncounters={respawnEncounters}
        onResetLandmarks={resetLandmarks}
        onMoveRealms={moveRealms}
        onClose={() => setIsAdminOpen(false)}
        onResetWorld={resetWorld}
        onRelayoutKingdoms={relayoutKingdoms}
        onResetLedger={resetLedger}
        onTriggerHarvest={triggerHarvest}
        onResetBackfill={resetBackfill}
        backfillStatus={status?.backfill}
        rovingWindowMinutes={status?.rovingWindowMinutes ?? status?.syncIntervalMinutes ?? 15}
        kingdoms={kingdoms}
        onResetKingdomUpgrades={resetKingdomUpgrades}
        onResetAllKingdomUpgrades={resetAllKingdomUpgrades}
        onOpenValidations={openValidations}
        validationWarnings={totalAdminWarnings}
        pendingDeeds={pendingDeeds}
        onOpenDeedReview={() => setIsDeedReviewOpen(true)}
        newOmens={newOmens}
        onOpenOmens={() => setIsOmensOpen(true)}
        unmatchedEmails={unmatchedEmails}
        onOpenDevEmails={() => setIsDevEmailsOpen(true)}
      />

      {isAdmin && (
        <DevEmailsModal
          open={isDevEmailsOpen}
          onClose={() => setIsDevEmailsOpen(false)}
          kingdoms={kingdoms}
          onAssign={assignDevEmail}
          onUnassign={unassignDevEmail}
          onUnmatchedCount={setUnmatchedEmails}
        />
      )}

      <ScriptoriumModal
        open={Boolean(scriptorium)}
        onClose={() => setScriptorium(null)}
        initialTab={scriptorium?.tab}
        initialSel={scriptorium?.unsorted ? { kind: "unsorted" } : null}
        onXpChanged={() => {
          refetchKingdoms();
          refreshStatus();
        }}
      />

      {isManager && (
        <DeedReviewModal
          open={isDeedReviewOpen}
          onClose={() => setIsDeedReviewOpen(false)}
          meId={me?.id ?? null}
          onChanged={() => {
            refetchKingdoms();
            refreshStatus();
          }}
        />
      )}

      <HallOfRenownModal open={isRenownOpen} onClose={() => setIsRenownOpen(false)} kingdoms={kingdoms} meId={me?.id} onSelectKingdom={pickKingdom} />

      {(isAdmin || me?.isSpecial) && (
        <RoyalDecreesModal open={isDecreesOpen} onClose={() => setIsDecreesOpen(false)} kingdoms={kingdoms} isAdmin={isAdmin} onChanged={refetchKingdoms} onOpenWatchtower={() => {
          setIsDecreesOpen(false);
          setIsWatchtowerOpen(true);
        }} />
      )}
      <SendOmenModal open={isSendOmenOpen} onClose={() => setIsSendOmenOpen(false)} />
      {isAdmin && <OmensModal open={isOmensOpen} onClose={() => setIsOmensOpen(false)} onChanged={refreshStatus} />}
      {isManager && <WatchtowerModal open={isWatchtowerOpen} onClose={() => setIsWatchtowerOpen(false)} />}

      {isAdmin && (
        <AdminWarningsModal
          open={isAdminWarningsModalOpen}
          onClose={() => setIsAdminWarningsModalOpen(false)}
          warnings={adminWarnings}
          ignoredRepos={ignoredRepos}
          onDeleteRepo={deleteAdminRepository}
          onDeleteAllDuplicates={deleteAllAdminDuplicates}
          onRestoreRepo={restoreAdminRepository}
          onCheckIgnoredCommits={checkIgnoredRepoCommits}
          onRefresh={fetchAdminValidations}
          onOpenUnsorted={() => {
            setIsAdminWarningsModalOpen(false);
            setScriptorium({ tab: "tree", unsorted: true });
          }}
          onOpenDeedReview={() => {
            setIsAdminWarningsModalOpen(false);
            setIsDeedReviewOpen(true);
          }}
        />
      )}
    </div>
  );
}

export default App;
