import { Router, Request, Response } from "express";
import { syncService } from "./syncService.js";
import { git } from "./gitService.js";
import { buildRealmFromGit } from "./realmBuilder.js";
import { kingdomTitleFor, CIVILIZATIONS, hash } from "./kingdomUtils.js";
import { config } from "./env.js";
import { backfillService } from "./backfillService.js";
import { DeveloperKingdom, ActivityEvent, CivilizationType, MarchTargetType, MarchKind, LeaderboardPeriod, MusterMarch } from "./types.js";
import { getAllKingdomsFromDB, setCivilization, getUserLedger, getRealmLedger, getUserPopulationLedger, setKingdomSoldiers, summonConstructs, swapRepoPlots, purchaseUpgrade, getKingdomResources, getKingdomUpgrades, reassignAllCivilizations, resetAllKingdomLayouts, resetLedgerHistory, resyncDevCommits, listDevEmails, listUnmatchedCommitEmails, assignDevEmail, unassignDevEmail, assignDevRepoEmail, unassignDevRepoEmail, stmtGetUserById, transferKingdomResources, getAdminValidationWarnings, deleteAdminRepository, deleteAdminRepositories, getIgnoredRepositories, restoreIgnoredRepository, saveIgnoredRepoCheck, realmCommitOwners, IgnoredRepoCommitCheck, DuplicateRepoGroup, resetAndRefundKingdomUpgrades, resetAndRefundAllKingdomUpgrades, recordPlayerAction, callSettlers, holdFestival, getProclamationState, proclamationStatesByUser } from "./db.js";
import { syncNethergardeSpires, getActiveMarches, startMarch, launchMuster, MusterError, previewMarch, recallMarch, getCivPlaces, runWarTick, getRecentBattleReports, fogKingdomsFor, fogMarchesFor, fogSpiresFor, startRally, joinRally, cancelRally, getOpenRallies, sendReinforcementHome, viewerCivOf, voidNpcFor } from "./warEngine.js";
import { VOID_NPC, wallDefMultForTier } from "./warConfig.js";
import { getScoutReports, latestScoutReportsByTarget } from "./scouting.js";
import { announceFestival, announceSeasonIfNew, onlineRulerIds, getUnreadBroadcasts, listBroadcasts, markBroadcastsRead, noteRulerSeen, noticeKey, setNoticeLogger } from "./broadcasts.js";
import { realmNow } from "./realmTime.js";
import { callDisaster, disasterStatus, endDisasterNow, listDisasters, tickDisasters } from "./disasters.js";
import { DISASTER_KINDS, DisasterKind } from "./disasterRules.js";
import { getChronicleDraft, latestChronicle, listChronicles, previewChronicle, publishChronicle } from "./chronicle.js";
import { announceImprovementRefund, proclaimAnnouncement, previewGiftPlan, grantGiftPlan, grantShield, liftShield, punishKingdom, liftPunishment, grantFestival, getDecreeAudit } from "./decrees.js";
import { bossStatusesFor, getRovingSpawnsFor, getWorldStateVersion, nodeStatusesFor, npcKingdomStatusesFor, pruneNpcKingdoms, resetNpcKingdoms, withActiveBoss } from "./worldNpcs.js";
import { fetchAllAdminEmails, peekRepoCommits, mapPool } from "./gitFetch.js";
import { realignCivilization, proposeSwap, answerSwap, listSwapProposals } from "./diplomacy.js";
import { authRouter, sessionUser, authEnabled, isRequestAdmin, isRequestSpecialUser } from "./auth.js";
import { UPGRADES } from "./upgrades.js";
import { getLeaderboard, getRenownPodium, markDevDailyStatsStale } from "./leaderboard.js";
import { rebuildRealmWithTitles, getTitleProgress, TITLE_CATEGORIES } from "./titles.js";
import { getTree, createDivision, updateDivision, deleteDivision, createClient, updateClient, deleteClient, createProject, updateProject, deleteProject, assignRepo, unassignRepo, writeDeed, editDeed, reviewDeed, revokeDeed, sealAllDeeds, listDeeds, deedAllowance, deedDays, pendingDeedCount, scriptoriumValidationWarnings, exportRealmBackup, importRealmBackup, DEED_RULES, ScriptoriumViewer, DeedScope } from "./scriptorium.js";
import { sendOmen, listOmens, myOmens, omensLeftToday, markOmenRead, markAllOmensRead, unreadOmenCount, OMEN_KINDS, OMEN_RULES, DEFAULT_HEEDED_TITLE } from "./omens.js";
import { getGlance, getTreeStats, getPerson, getImpact, invalidateWatchtower } from "./watchtower.js";
import { runSparring, sparringRoster } from "./sparring.js";
import { campView, dismissBand, healBand, hireBand, listBands, stopHealing } from "./mercenaries.js";
import { armoryView, forgeSets, scrapSets } from "./armory.js";
import { hastenWounded } from "./moonwell.js";
import { championView, hastenChampion, rerollChampion, resetChampionRenown, retrainChampion } from "./champions.js";
import { KIT_SLOTS, type KitSlot } from "./championRules.js";
import { ARMORY_RARITIES, type ArmoryRarity } from "./armoryRules.js";
import { MERC_RARITIES, MercRarity, mercKitFor } from "./mercenaryRules.js";
import { kitLines } from "./battleArts.js";
import { getOrGenerateFlatWorldMap, regenerateFlatWorldMap, relayoutKingdomPlacements, getCodexCatalog, currentRovingWindow, rerollRovingSpawns, landmarkKey, resetLandmarks, moveRealms } from "./worldMapGenerator.js";

export const router = Router();

// Every successful game action by a signed-in ruler (march, rally, trade, upgrade, swap…) counts towards
// today's play day; admin tools, sign-in and reading notices don't
router.use((req: Request, res: Response, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.path.startsWith("/admin") || req.path.startsWith("/auth") || req.path.startsWith("/broadcasts") || req.path.startsWith("/decrees") || req.path.startsWith("/scriptorium") || req.path.startsWith("/omens")) return next();
  res.on("finish", () => {
    if (res.statusCode >= 400 || res.locals.noAction) return;
    try {
      const userId = sessionUser(req);
      if (!userId) return;
      recordPlayerAction(userId);
    } catch (err: any) {
      console.error("[Play] Failed to record a game action:", err.message);
    }
  });
  next();
});

/**
 * Key of the roving encounters as this viewer sees them: changes with the roving window, when a pack is
 * hit or killed (shared world) and when one of the viewer's scout reports comes home (fog lifts).
 */
function rovingKeyFor(viewerId: string | null): string {
  const reports = latestScoutReportsByTarget(viewerId);
  const latest = Math.max(0, ...Array.from(reports.values(), (r) => r.availableAt));
  return `${currentRovingWindow().key}-w${getWorldStateVersion()}-s${latest}`;
}
router.use("/auth", authRouter);

// The login screen's flyover: the realm as it stands, with nothing that names anyone. Castles get stand-in ids and
// only their civilization and castle level; the open Voidrift slots only where they stand. Public, like the login screen
router.get("/login/realm", (_req: Request, res: Response) => {
  try {
    const map = getOrGenerateFlatWorldMap(kingdoms);
    const ids = new Map(kingdoms.map((k, i) => [k.id, `castle-${i + 1}`]));
    const kingdomPlacements = Object.fromEntries(Object.entries(map.kingdomPlacements).flatMap(([id, at]) => (ids.has(id) ? [[ids.get(id)!, at]] : [])));
    res.json({
      map: { ...map, kingdomPlacements, npcs: map.npcs.map((n) => withActiveBoss(n)) },
      castles: kingdoms.map((k) => ({ id: ids.get(k.id)!, civilization: k.civilization, cityHallLevel: k.cityHallLevel, isArchon: Boolean(k.isArchon) })),
      spires: syncNethergardeSpires(kingdoms)
        .filter((s) => !s.occupiedByDevId)
        .map((s) => ({ id: s.id, slotIndex: s.slotIndex, coordinates: s.coordinates, npcLevel: s.npcLevel }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get the realm" });
  }
});

// Login is a must: past sign-in, every route needs a session unless GUEST_BROWSING=true (realm data names
// repos and developers). Registered before all data routes, so none can be reached without it
router.use((req: Request, res: Response, next) => {
  if (config.guestBrowsing || sessionUser(req)) return next();
  res.status(401).json({ error: "Sign in with Git first" });
});

/** A whole number from a `?limit=`, inside 1…max; anything else is the fallback */
const queryLimit = (value: unknown, fallback: number, max: number): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
};

/** Only the signed-in owner may change a kingdom. Sends the error response and returns false otherwise. */
function requireOwner(req: Request, res: Response, kingdomId: string): boolean {
  if (!authEnabled()) {
    res.status(503).json({ error: "Sign in with Git is not configured on this server" });
    return false;
  }
  const userId = sessionUser(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in with Git first" });
    return false;
  }
  if (userId !== kingdomId) {
    res.status(403).json({ error: "You can only manage your own kingdom" });
    return false;
  }
  return true;
}

// Load directly from SQLite on startup (no mock data); titles are re-evaluated first so the cache is fresh
// even before the first Git sync
const kingdoms: DeveloperKingdom[] = (() => {
  try {
    return rebuildRealmWithTitles().kingdoms;
  } catch (err: any) {
    console.error("[Titles] Startup recalculation failed:", err.message);
    return getAllKingdomsFromDB();
  }
})();

const realmState = {
  source: "git",
  syncing: false,
  lastGitSync: null as string | null,
  lastError: null as string | null
};

const activityLog: ActivityEvent[] = [
  { id: 1, text: "🗺️ The realm awakens on the planetary globe with SQLite persistence & audit ledger…", time: "Just now", type: "system" }
];

export function logActivity(text: string, type: ActivityEvent["type"] = "system") {
  activityLog.unshift({ id: Date.now() + Math.random(), text, time: "Just now", type });
  if (activityLog.length > 50) activityLog.pop();
}
setNoticeLogger(logActivity);

/** Realm fingerprint without the relative "3 hours ago" labels, which drift on their own between syncs */
const realmSignatureOf = (list: DeveloperKingdom[]) => JSON.stringify(list, (key, value) => (key === "time" ? undefined : value));

/** Snapshot of the last realm pushed to the UI; a sync that changes nothing must not make clients refetch */
let realmSignature = realmSignatureOf(kingdoms);

/** Swap in fresh kingdoms; bumps lastGitSync (the clients' refetch trigger) only when something changed */
function applyRealm(fresh: DeveloperKingdom[]) {
  const signature = realmSignatureOf(fresh);
  if (signature === realmSignature && realmState.lastGitSync) return;
  realmSignature = signature;
  kingdoms.splice(0, kingdoms.length, ...fresh);
  syncNethergardeSpires(kingdoms, true);
  realmState.lastGitSync = new Date().toISOString();
}

/** Reload in-memory kingdoms from SQLite so the UI updates immediately */
function refreshInMemoryRealm() {
  applyRealm(getAllKingdomsFromDB());
}

/** New history was stored (live sync / backfill progress): refresh kingdoms and let the Hall of Renown rebuild its daily stats */
function onHistoryStored() {
  markDevDailyStatsStale();
  refreshInMemoryRealm();
}

/** Pull users/repos/commits from Git, save to SQLite per-repo, and rebuild kingdoms incrementally */
async function refreshFromGit() {
  if (!git.hasToken || realmState.syncing) return;
  realmState.syncing = true;
  const started = Date.now();
  try {
    const { kingdoms: fresh, stats, titlePromotions } = await buildRealmFromGit(kingdoms, onHistoryStored);
    applyRealm(fresh);
    markDevDailyStatsStale();
    for (const p of titlePromotions) {
      const name = fresh.find((k) => k.id === p.userId)?.name ?? p.userId;
      logActivity(`🎖️ ${name} earns the title ${p.title.emblem} ${p.title.name}!`, "level");
    }
    realmState.lastError = null;
    // Harvests run only on the sync service clock — never as a side effect of refreshing data

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[Live Sync] 🟢 Synced latest ${config.liveSyncLookbackDays * 24}h activity: ${stats.commitsScanned} commits, ${stats.repos} repos (${stats.analysed} diffs) in ${secs}s`);
    logActivity(`[Live Sync] 🟢 ${stats.users} kingdoms • ${stats.repos} repos • ${stats.commitsScanned} recent commits`, "sync");

    // Start or resume background historical backfill worker for any unbackfilled repos
    backfillService.start(kingdoms, logActivity, onHistoryStored);
  } catch (err: any) {
    realmState.lastError = err.message;
    console.error("[Live Sync] ❌ Git sync failed:", err.message);
    logActivity(`⚠️ Live sync failed: ${err.message}`, "system");
  } finally {
    realmState.syncing = false;
  }
}

// Background only: resources harvest on the sync service clock (SYNC_INTERVAL_MINUTES);
// Git data is re-pulled every GIT_SYNC_INTERVAL_HOURS (min 1 hour) and once on startup
syncService.init(kingdoms, logActivity);
setInterval(refreshFromGit, config.gitSyncIntervalHours * 60 * 60 * 1000);
refreshFromGit();

// 🍂 The season turns on Sunday 00:00 UTC: the first check after it raises the herald notice (once per season)
const checkSeason = () => {
  try {
    announceSeasonIfNew();
  } catch (err: any) {
    console.error("[Herald] Failed to announce the season:", err.message);
  }
};
setTimeout(checkSeason, 5_000).unref();
setInterval(checkSeason, 60_000).unref();

// 🌪️ World disasters: the schedule is written ahead, warnings, start and end notices raised as they fall due
const checkDisasters = () => {
  try {
    tickDisasters();
  } catch (err: any) {
    console.error("[Disasters] Tick failed:", err.message);
  }
};
checkDisasters();
setInterval(checkDisasters, 60_000).unref();

router.get("/status", (req: Request, res: Response) => {
  const viewerId = sessionUser(req);
  const viewer = viewerId ? kingdoms.find((k) => k.id === viewerId) : undefined;
  if (viewerId) {
    try {
      noteRulerSeen(viewerId);
    } catch (err: any) {
      console.error("[Herald] Failed to note a ruler as seen:", err.message);
    }
  }
  res.json({
    status: "online",
    realmName: "The Realm of Git",
    totalKingdoms: kingdoms.length,
    ...syncService.getSyncStatus(),
    ...realmState,
    backfill: backfillService.status,
    // Clients refetch /map/roving when rovingKey changes (every SYNC_INTERVAL_MINUTES × 2 and on admin respawn)
    rovingKey: rovingKeyFor(sessionUser(req)),
    // Clients reload kingdoms, map placements and spires together when anyone's civilization changes
    civKey: hash(kingdoms.map((k) => `${k.id}:${k.civilization}`).join("|")).toString(36),
    nextRespawnAt: currentRovingWindow().nextRespawnAt,
    // Clients refetch /map when the landmarks change (the weekly rotation, its day ending, an admin reset)
    landmarkKey: hash(landmarkKey(kingdoms)).toString(36),
    // Clients refetch /broadcasts/unread when a herald notice is raised
    noticeKey: noticeKey(),
    // Roving encounters respawn every SYNC_INTERVAL_MINUTES × 2
    rovingWindowMinutes: currentRovingWindow().windowMinutes,
    serverNow: Date.now(),
    // Realm time: the harvest window (day / night, alternating each harvest) and the weekly season (GAME_GUIDE §7)
    realmTime: realmNow(syncService.currentWindow()),
    // The world disaster in force, or the next one within the hour of its warning (GAME_GUIDE §10 World Disasters)
    disaster: disasterStatus(),
    // The latest weekly story while it is under a week old: its banner (GAME_GUIDE §14)
    chronicle: latestChronicle(),
    // Rulers with the realm open right now (signed in, polled in the last 2.5 min): a white curtain of light on the map
    onlineIds: onlineRulerIds(),
    // The signed-in ruler's milestone titles and summed buffs (everyone's are on /kingdoms)
    // Admins, Special Overseers and the Archon: deeds waiting for their seal (the 📜 banner)
    pendingDeeds: isRequestAdmin(req) || isRequestSpecialUser(req) ? pendingDeedCount() : 0,
    // Admins: omens nobody has read yet (the 🌠 banner)
    newOmens: isRequestAdmin(req) ? unreadOmenCount() : 0,
    myTitles: viewer ? { earnedTitles: viewer.earnedTitles ?? [], titleBuffs: viewer.titleBuffs ?? { hpBonus: 0, atkBonus: 0, defBonus: 0 } } : null,
    recentEvents: activityLog.slice(0, 10)
  });
});

router.get("/git/status", async (req: Request, res: Response) => {
  const status: Record<string, unknown> = { ...(await git.status()) };
  // Which account the server reads Git with is for admins
  if (!isRequestAdmin(req)) {
    delete status.user;
    delete status.isAdmin;
  }
  res.json({ ...status, ...realmState, backfill: backfillService.status });
});

// The profile window links here, so the Git host stays a server setting (GIT_URL)
router.get("/git/profile/:username", (req: Request, res: Response) => {
  res.redirect(`${config.gitUrl}/${encodeURIComponent(String(req.params.username))}`);
});

// Bosses are served as this week's boss of their zone's rotation
router.get("/map", (_req: Request, res: Response) => {
  const mapData = getOrGenerateFlatWorldMap(kingdoms);
  res.json({ ...mapData, npcs: mapData.npcs.map((n) => withActiveBoss(n)) });
});

// Roving mobs / bandits / treasures of the current roving window (every SYNC_INTERVAL_MINUTES × 2)
// Dead packs are left out; mobs / bandits / treasure are fogged to bands unless the viewer scouted them
// `nodes`: resource nodes and chests someone touched — what's left, who gathers it, whether they're exposed
// `bosses`: each zone's boss this week with its shared HP (public); `npcKingdoms`: buffer realms and gates, fogged
router.get("/map/roving", (req: Request, res: Response) => {
  const viewerId = sessionUser(req);
  const reports = latestScoutReportsByTarget(viewerId);
  const roving = getRovingSpawnsFor(kingdoms, reports);
  const persistent = getOrGenerateFlatWorldMap(kingdoms).npcs;
  const nodes = nodeStatusesFor([...persistent, ...roving.npcs], viewerId, reports);
  res.json({ ...roving, nodes, bosses: bossStatusesFor(persistent), npcKingdoms: npcKingdomStatusesFor(persistent, reports), key: rovingKeyFor(viewerId) });
});

// Kingdoms of other civilizations are fogged for the viewer; not signed in = every mortal kingdom is fogged
/** Royal Proclamations change between realm builds (a Festival, a Call to Arms): read them fresh for every request */
function withFreshProclamations(list: DeveloperKingdom[]): DeveloperKingdom[] {
  const states = proclamationStatesByUser();
  for (const k of list) {
    const st = states.get(k.id);
    if (st) k.proclamations = st;
  }
  return list;
}

router.get("/kingdoms", (req: Request, res: Response) => {
  withFreshProclamations(kingdoms);
  const list = kingdoms.map(({ buildings, ...k }) => ({ ...k, buildings: [], buildingCount: buildings.length }));
  res.json(fogKingdomsFor(list, sessionUser(req)).map(({ buildings: _b, ...k }) => k));
});

router.get("/kingdoms/:id", (req: Request, res: Response) => {
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  withFreshProclamations([kingdom]);
  res.json(fogKingdomsFor([kingdom], sessionUser(req))[0]);
});

// Title ladder plus a ruler's raw totals behind it (progress towards the next tier)
router.get("/kingdoms/:id/titles", (req: Request, res: Response) => {
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  // Who holds each tier right now (a ruler holds only the highest tier reached per category)
  const holders: Record<string, Record<number, Array<{ id: string; name: string; civilization: CivilizationType; unlockedAt: string }>>> = {};
  for (const k of kingdoms) {
    for (const t of k.earnedTitles ?? []) {
      const byTier = (holders[t.category] ??= {});
      (byTier[t.tier] ??= []).push({ id: k.id, name: k.name, civilization: k.civilization, unlockedAt: t.unlockedAt });
    }
  }
  for (const byTier of Object.values(holders)) for (const list of Object.values(byTier)) list.sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt));
  res.json({
    earnedTitles: kingdom.earnedTitles ?? [],
    titleBuffs: kingdom.titleBuffs ?? { hpBonus: 0, atkBonus: 0, defBonus: 0 },
    progress: getTitleProgress(kingdom.id),
    ladder: TITLE_CATEGORIES,
    holders
  });
});

// The viewer's scout reports (delivered once the scouts are home), newest first
router.get("/scout-reports", (req: Request, res: Response) => {
  const viewerId = sessionUser(req);
  if (!viewerId) return res.json([]);
  const targetId = typeof req.query.targetId === "string" ? req.query.targetId : undefined;
  res.json(getScoutReports(viewerId, targetId));
});

// Accounting / Ledger endpoints
/** Can the viewer access this kingdom's internal ledger transactions? */
function canViewKingdomLedger(req: Request, kingdomId: string): boolean {
  if (isRequestAdmin(req)) return true;
  if (isRequestSpecialUser(req)) return true;
  const viewerId = sessionUser(req);
  if (viewerId && viewerId.toLowerCase() === kingdomId.toLowerCase()) return true;
  const target = kingdoms.find((k) => k.id.toLowerCase() === kingdomId.toLowerCase());
  if (!target) return false;
  const viewerCiv = viewerCivOf(viewerId);
  if (viewerCiv && target.civilization === viewerCiv) return true;
  return false;
}

router.get("/kingdoms/:id/ledger", (req: Request, res: Response) => {
  const limit = queryLimit(req.query.limit, 50, 100);
  const userId = String(req.params.id);
  if (!canViewKingdomLedger(req, userId)) {
    const viewerId = sessionUser(req);
    const reports = latestScoutReportsByTarget(viewerId);
    const scoutReport = reports.get(userId) ?? null;
    return res.json({ userId, count: 0, ledger: [], fogged: true, scoutReport });
  }
  const ledger = getUserLedger(userId, limit);
  res.json({ userId, count: ledger.length, ledger });
});

router.get("/ledger", (req: Request, res: Response) => {
  const limit = queryLimit(req.query.limit, 100, 200);
  if (isRequestAdmin(req) || isRequestSpecialUser(req)) {
    const ledger = getRealmLedger(limit);
    return res.json({ count: ledger.length, ledger });
  }
  // Other civilizations' ledgers are private under the fog (deltas and reasons give away troops and treasuries), so
  // everyone else reads their own civilization's entries; enough rows are scanned to fill the page from a mixed stream
  const viewerId = sessionUser(req)?.toLowerCase();
  const viewerCiv = viewerCivOf(viewerId ?? null);
  const civById = new Map(kingdoms.map((k) => [k.id.toLowerCase(), k.civilization]));
  const ledger = getRealmLedger(5000)
    .filter((e) => e.userId.toLowerCase() === viewerId || (viewerCiv && civById.get(e.userId.toLowerCase()) === viewerCiv))
    .slice(0, limit);
  res.json({ count: ledger.length, ledger });
});

// Population ledger history for a specific kingdom
router.get("/kingdoms/:id/population-ledger", (req: Request, res: Response) => {
  const limit = queryLimit(req.query.limit, 50, 200);
  const userId = String(req.params.id);
  if (!canViewKingdomLedger(req, userId)) return res.json({ userId, count: 0, ledger: [], fogged: true });
  const ledger = getUserPopulationLedger(userId, limit);
  res.json({ userId, count: ledger.length, ledger });
});

// Mobilize / Demobilize soldiers for a kingdom
router.post("/kingdoms/:id/mobilize", (req: Request, res: Response) => {
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;

  const { soldiers } = (req.body ?? {}) as { soldiers?: number };
  const requestedSoldiers = Math.max(0, Math.floor(Number(soldiers) || 0));

  try {
    const updated = setKingdomSoldiers(kingdom.id, requestedSoldiers);
    // Asking for the garrison you already have isn't a game action (play days, GAME_GUIDE §7)
    if (!updated.changed) res.locals.noAction = true;
    kingdom.resources = getKingdomResources(kingdom.id);
    kingdom.soldiers = updated.soldiers;
    kingdom.population = updated.population;
    kingdom.maxPopulation = updated.maxPopulation;

    logActivity(
      `🛡️ ${kingdom.name} mobilized army: ${updated.soldiers.toLocaleString()} soldiers garrisoned (${Math.max(0, updated.population - updated.soldiers - (kingdom.deployedSoldiers ?? 0)).toLocaleString()} civilian workforce).`,
      "system"
    );
    res.json({ success: true, kingdom });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to mobilize soldiers" });
  }
});

// 🌙 Moonwell Healers: an elf ruler pays to hasten every wounded soldier back to the garrison (GAME_GUIDE §13)
router.post("/kingdoms/:id/wounded/hasten", (req: Request, res: Response) => {
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;
  try {
    const { healed } = hastenWounded(kingdom.id);
    const fresh = getAllKingdomsFromDB().find((x) => x.id === kingdom.id);
    if (fresh) Object.assign(kingdom, { resources: fresh.resources, soldiers: fresh.soldiers, population: fresh.population, wounded: fresh.wounded });
    if (fresh && !fresh.wounded) delete kingdom.wounded;
    logActivity(`🌙 ${kingdom.name} hastened ${healed.toLocaleString()} wounded soldiers home from the Moonwell.`, "system");
    res.json({ success: true, kingdom });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to hasten the healing" });
  }
});

// Nethergarde summons void constructs with resources (it doesn't breed)
router.post("/kingdoms/:id/summon", (req: Request, res: Response) => {
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;

  try {
    const { summoned, population } = summonConstructs(kingdom.id, Number((req.body ?? {}).count) || 0);
    kingdom.population = population;
    kingdom.resources = getKingdomResources(kingdom.id);
    logActivity(`🔮 ${kingdom.name} performed a void ritual and summoned ${summoned.toLocaleString()} constructs.`, "system");
    res.json({ success: true, summoned, kingdom });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Summoning failed" });
  }
});

// 📜 Royal Proclamations (mortal kingdoms): 🏘️ Paid Settlers refill a kingdom below half its capacity, once a day
router.post("/kingdoms/:id/settlers", (req: Request, res: Response) => {
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;

  try {
    const { settlers, population } = callSettlers(kingdom.id);
    kingdom.population = population;
    kingdom.resources = getKingdomResources(kingdom.id);
    kingdom.proclamations = getProclamationState(kingdom.id);
    logActivity(`🏘️ ${kingdom.name} welcomed ${settlers.toLocaleString()} settlers into the kingdom.`, "system");
    res.json({ success: true, settlers, kingdom });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "The settlers didn't come" });
  }
});

// …and 🎉 a Festival: births ×2 and a livelier workforce for a day, once a week
router.post("/kingdoms/:id/festival", (req: Request, res: Response) => {
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;

  try {
    const { endsAt } = holdFestival(kingdom.id);
    kingdom.resources = getKingdomResources(kingdom.id);
    kingdom.proclamations = getProclamationState(kingdom.id);
    logActivity(`🎉 ${kingdom.name} declared a Festival: lanterns, music and fireworks for a day!`, "system");
    try {
      announceFestival(kingdom, endsAt);
    } catch (err: any) {
      console.error("[Herald] Failed to announce a Festival:", err.message);
    }
    res.json({ success: true, kingdom });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "The Festival couldn't be declared" });
  }
});

// Nethergarde Voidrift slots (open ones are held by NPC void kingdoms)
router.get("/spires", (req: Request, res: Response) => {
  try {
    res.json(fogSpiresFor(syncNethergardeSpires(kingdoms), sessionUser(req)));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get Nethergarde spires" });
  }
});

// Herald notices the viewer hasn't read yet, oldest first (signed-out visitors: recent public notices, nothing stored)
router.get("/broadcasts/unread", (req: Request, res: Response) => {
  try {
    res.json(getUnreadBroadcasts(sessionUser(req)));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get notices" });
  }
});

// The War Room's 📯 Notices: the last 30 days, newest first, with read flags
router.get("/broadcasts", (req: Request, res: Response) => {
  try {
    res.json(listBroadcasts(sessionUser(req)));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get notices" });
  }
});

// Mark every notice read ("Dismiss all")
router.post("/broadcasts/read-all", (req: Request, res: Response) => {
  const userId = sessionUser(req);
  if (!userId) return res.status(401).json({ error: "Sign in with Git first" });
  res.json({ success: true, read: markBroadcastsRead(userId, "all") });
});

// Mark one notice read: it never opens again for this kingdom, on any browser
router.post("/broadcasts/:id/read", (req: Request, res: Response) => {
  const userId = sessionUser(req);
  if (!userId) return res.status(401).json({ error: "Sign in with Git first" });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Unknown notice" });
  res.json({ success: true, read: markBroadcastsRead(userId, [id]) });
});

/* ------------------------------------------------------------------------- */
/* 👑 Royal Decrees (GAME_GUIDE §15): admins and Special Overseers            */
/* ------------------------------------------------------------------------- */

/** Admins and Special Overseers may proclaim, shield and punish. Sends 403 and returns null otherwise. */
function requireDecreeHolder(req: Request, res: Response): string | null {
  if (!isRequestAdmin(req) && !isRequestSpecialUser(req)) {
    res.status(403).json({ error: "Only administrators and Special Overseers can issue royal decrees" });
    return null;
  }
  // Dev mode without Git sign-in: the admin acts as "admin"
  return sessionUser(req) ?? "admin";
}

function decree(req: Request, res: Response, adminOnly: boolean, run: (actorId: string) => { message: string }, logLine?: (r: { message: string }) => string) {
  if (adminOnly && !isRequestAdmin(req)) return res.status(403).json({ error: "Administrator privileges required" });
  const actorId = requireDecreeHolder(req, res);
  if (!actorId) return;
  try {
    const result = run(actorId);
    refreshInMemoryRealm();
    if (logLine) logActivity(logLine(result), "system");
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "The decree failed" });
  }
}

// Who did what, newest first
router.get("/decrees/audit", (req: Request, res: Response) => {
  if (!requireDecreeHolder(req, res)) return;
  res.json(getDecreeAudit(queryLimit(req.query.limit, 50, 200)));
});

// 📜 Announcement to all, a civilization or picked rulers (optionally pinned in the War Room)
router.post("/decrees/announce", (req: Request, res: Response) => {
  const b = req.body ?? {};
  decree(req, res, false, (actorId) =>
    proclaimAnnouncement({ actorId, title: b.title, body: b.body, audience: b.audience, recipients: b.recipients, pinDays: b.pinDays, kingdoms })
  );
});

// 🎁 Gift (admin): check a plan without granting anything
router.post("/decrees/gift/preview", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) return res.status(403).json({ error: "Administrator privileges required" });
  res.json(previewGiftPlan(req.body, kingdoms));
});

// 🎁 Gift (admin): grant a plan; nothing is granted unless every row is valid
router.post("/decrees/gift", (req: Request, res: Response) => {
  decree(req, res, true, (actorId) => grantGiftPlan(actorId, req.body, kingdoms), (r) => `🎁 ${r.message}`);
});

// 🛡️ Shield a kingdom for 1–14 days
router.post("/decrees/shield", (req: Request, res: Response) => {
  const b = req.body ?? {};
  decree(req, res, false, (actorId) => grantShield({ actorId, targetId: b.targetId, days: b.days, breaksOnAttack: b.breaksOnAttack, kingdoms }));
});

router.post("/decrees/shield/:id/lift", (req: Request, res: Response) => {
  decree(req, res, false, (actorId) => liftShield(actorId, req.params.id, kingdoms));
});

// ⛈️ Punish a kingdom for 1–14 days (no harvest; optionally low births / high deaths)
router.post("/decrees/punish", (req: Request, res: Response) => {
  const b = req.body ?? {};
  decree(req, res, false, (actorId) => punishKingdom({ actorId, targetId: b.targetId, days: b.days, lowBirth: b.lowBirth, highDeath: b.highDeath, wrath: b.wrath, kingdoms }));
});

router.post("/decrees/punish/:id/lift", (req: Request, res: Response) => {
  decree(req, res, false, (actorId) => liftPunishment(actorId, req.params.id, kingdoms));
});

// 🎉 Proclamations: give a kingdom a Festival (free, apart from its own weekly cooldown)
router.post("/decrees/festival", (req: Request, res: Response) => {
  decree(req, res, false, (actorId) => grantFestival({ actorId, targetId: (req.body ?? {}).targetId, kingdoms }), (r) => `🎉 ${r.message}`);
});

// 📖 Weekly Chronicle: a week's digest and the ready prompt (default: last week)
router.get("/decrees/chronicle", (req: Request, res: Response) => {
  if (!requireDecreeHolder(req, res)) return;
  try {
    res.json(getChronicleDraft(req.query.week));
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Couldn't read that week" });
  }
});

// 📖 Weekly Chronicle: publish a finished week's story (saved, herald notice to all, banner, Codex)
router.post("/decrees/chronicle", (req: Request, res: Response) => {
  const b = req.body ?? {};
  decree(req, res, false, (actorId) => publishChronicle({ actorId, weekKey: b.weekKey, title: b.title, body: b.body, kingdoms }), (r) => `📖 ${r.message}`);
});

// 📖 Weekly Chronicle: check a story's marks and how it will be adorned (the panel's preview); saves nothing
router.post("/decrees/chronicle/check", (req: Request, res: Response) => {
  if (!requireDecreeHolder(req, res)) return;
  const b = req.body ?? {};
  try {
    res.json(previewChronicle(b.weekKey, b.body, kingdoms));
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Couldn't check the story" });
  }
});

// The Codex's Chronicles: published weekly stories, newest first (public)
router.get("/chronicle/stories", (_req: Request, res: Response) => {
  res.json(listChronicles());
});

/* ------------------------------------------------------------------------- */
/* 🪶 The Scriptorium (GAME_GUIDE §17): project tree and deed reports          */
/* ------------------------------------------------------------------------- */

const scribeOf = (req: Request): ScriptoriumViewer => {
  const admin = isRequestAdmin(req);
  return { id: sessionUser(req), admin, manager: admin || isRequestSpecialUser(req) };
};

/** Runs a Scriptorium change; `xp` changes refresh the realm so the building's level follows at once */
function scribe(req: Request, res: Response, run: (v: ScriptoriumViewer) => { message: string }, xp = false) {
  try {
    const result = run(scribeOf(req));
    invalidateWatchtower();
    if (xp) refreshInMemoryRealm();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "The Scriptorium refused that" });
  }
}

router.get("/scriptorium", (req: Request, res: Response) => {
  const v = scribeOf(req);
  const tree = getTree(v);
  // gitUrl: the client links each repo to its page on Git (GIT_URL/owner/name)
  res.json({ ...tree, gitUrl: config.gitUrl, rules: DEED_RULES, allowance: v.id ? deedDays().map((d) => deedAllowance(v.id!, d)) : [] });
});

router.post("/scriptorium/divisions", (req, res) => scribe(req, res, (v) => createDivision(v, req.body?.name)));
router.patch("/scriptorium/divisions/:id", (req, res) => scribe(req, res, (v) => updateDivision(v, Number(req.params.id), req.body ?? {})));
router.delete("/scriptorium/divisions/:id", (req, res) => scribe(req, res, (v) => deleteDivision(v, Number(req.params.id), req.query.moveTo)));
router.post("/scriptorium/clients", (req, res) => scribe(req, res, (v) => createClient(v, req.body?.divisionId, req.body?.name)));
router.patch("/scriptorium/clients/:id", (req, res) => scribe(req, res, (v) => updateClient(v, Number(req.params.id), req.body ?? {})));
router.delete("/scriptorium/clients/:id", (req, res) => scribe(req, res, (v) => deleteClient(v, Number(req.params.id), req.query.moveTo)));
router.post("/scriptorium/projects", (req, res) => scribe(req, res, (v) => createProject(v, req.body ?? {})));
router.patch("/scriptorium/projects/:id", (req, res) => scribe(req, res, (v) => updateProject(v, Number(req.params.id), req.body ?? {})));
router.delete("/scriptorium/projects/:id", (req, res) => scribe(req, res, (v) => deleteProject(v, Number(req.params.id))));
router.post("/scriptorium/projects/:id/repos", (req, res) => scribe(req, res, (v) => assignRepo(v, Number(req.params.id), req.body?.repoId)));
router.delete("/scriptorium/repos/:repoId/project", (req, res) => scribe(req, res, (v) => unassignRepo(v, req.params.repoId)));

// Deeds: ?scope=mine | pending | project | repo | user, &id= for project / repo / user
router.get("/scriptorium/deeds", (req: Request, res: Response) => {
  const scope = (["mine", "pending", "project", "repo", "user"].includes(String(req.query.scope)) ? req.query.scope : "mine") as DeedScope;
  res.json(listDeeds(scribeOf(req), scope, req.query.id ? String(req.query.id) : undefined, queryLimit(req.query.limit, 100, 300)));
});
router.post("/scriptorium/deeds", (req, res) => scribe(req, res, (v) => writeDeed(v, req.body ?? {}), true));
router.patch("/scriptorium/deeds/:id", (req, res) => scribe(req, res, (v) => editDeed(v, Number(req.params.id), req.body ?? {})));
router.post("/scriptorium/deeds/seal-all", (req, res) => scribe(req, res, (v) => sealAllDeeds(v, req.body?.ids), true));
router.post("/scriptorium/deeds/:id/seal", (req, res) => scribe(req, res, (v) => reviewDeed(v, Number(req.params.id), "seal", req.body?.note), true));
router.post("/scriptorium/deeds/:id/reject", (req, res) => scribe(req, res, (v) => reviewDeed(v, Number(req.params.id), "reject", req.body?.note)));
router.post("/scriptorium/deeds/:id/revoke", (req, res) => scribe(req, res, (v) => revokeDeed(v, Number(req.params.id), req.body?.note), true));

// Admin: the Realm Backup (developers and their emails, the Scriptorium tree and repo placements, every deed), restored after a wipe
router.get("/admin/backup/export", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) return res.status(403).json({ error: "Administrator privileges required" });
  const backup = exportRealmBackup();
  res.setHeader("Content-Disposition", `attachment; filename="realm-backup-${backup.exportedAt.slice(0, 10)}.json"`);
  res.json(backup);
});
router.post("/admin/backup/import", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) return res.status(403).json({ error: "Administrator privileges required" });
  scribe(req, res, (v) => {
    const result = importRealmBackup(v, req.body);
    logActivity(`⚡ [ADMIN] Realm backup imported: ${result.message}`, "system");
    return result;
  }, true);
});

/* ------------------------------------------------------------------------- */
/* 🔭 The Watchtower (GAME_GUIDE §18): analytics, managers only                */
/* ------------------------------------------------------------------------- */

function watch(req: Request, res: Response, run: (kind: "week" | "month", key?: string) => unknown) {
  if (!isRequestAdmin(req) && !isRequestSpecialUser(req)) return res.status(403).json({ error: "The Watchtower is for Admins, Special Overseers and the Archon" });
  try {
    const kind = req.query.period === "month" ? "month" : "week";
    res.json(run(kind, typeof req.query.key === "string" ? req.query.key : undefined));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "The Watchtower is clouded" });
  }
}

router.get("/watchtower/glance", (req, res) => watch(req, res, (kind, key) => getGlance(kind, key)));
router.get("/watchtower/tree", (req, res) => watch(req, res, (kind, key) => getTreeStats(kind, key)));
router.get("/watchtower/people/:id", (req, res) => watch(req, res, (kind, key) => getPerson(req.params.id, kind, key) ?? { error: "Unknown developer" }));
router.get("/watchtower/impact", (req, res) => watch(req, res, () => getImpact()));

/* ------------------------------------------------------------------------- */
/* 🌠 Omens (GAME_GUIDE §11): feedback to the admins, read receipts as notices */
/* ------------------------------------------------------------------------- */

// The sender's own omens and how many they may still send today; admins also get every omen
router.get("/omens", (req: Request, res: Response) => {
  const userId = sessionUser(req);
  res.json({
    kinds: OMEN_KINDS,
    rules: OMEN_RULES,
    defaultTitle: DEFAULT_HEEDED_TITLE,
    left: userId ? omensLeftToday(userId) : 0,
    mine: userId ? myOmens(userId) : [],
    all: isRequestAdmin(req) ? listOmens(req.query.filter === "unread" ? "unread" : "all") : undefined
  });
});

router.post("/omens", (req: Request, res: Response) => {
  try {
    res.json({ success: true, ...sendOmen(sessionUser(req), req.body ?? {}) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "The omen fizzled" });
  }
});

router.post("/omens/read-all", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) return res.status(403).json({ error: "Administrator privileges required" });
  res.json({ success: true, ...markAllOmensRead(sessionUser(req) ?? "admin") });
});

router.post("/omens/:id/read", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) return res.status(403).json({ error: "Administrator privileges required" });
  try {
    res.json({ success: true, ...markOmenRead(sessionUser(req) ?? "admin", Number(req.params.id), req.body ?? {}) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Could not heed the omen" });
  }
});

// Marches on the road, plus recently resolved ones (with their battle) so clients can animate the clash
router.get("/marches", (req: Request, res: Response) => {
  try {
    runWarTick(kingdoms, logActivity);
    res.json(fogMarchesFor(getActiveMarches(), sessionUser(req), isRequestAdmin(req) || isRequestSpecialUser(req)));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get active marches" });
  }
});

// Recent Battle Reports (optionally only those a kingdom fought)
router.get("/battle-reports", (req: Request, res: Response) => {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const limit = queryLimit(req.query.limit, 15, 100);
    res.json(getRecentBattleReports(limit, userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get battle reports" });
  }
});

const parseTargetType = (t: unknown): MarchTargetType | null =>
  t === "spire" ? "spire" : t === "dev" || t === "dev_kingdom" ? "dev_kingdom" : t === "npc" ? "npc" : null;
const parseKind = (k: unknown): MarchKind => (k === "scout" ? "scout" : k === "gather" ? "gather" : k === "reinforce" ? "reinforce" : "attack");

// Distance, travel time and rations of a march, computed with the same rules as the dispatch
router.get("/marches/preview", (req: Request, res: Response) => {
  const attacker = kingdoms.find((k) => k.id === req.query.attackerId);
  const targetType = parseTargetType(req.query.targetType);
  const targetId = typeof req.query.targetId === "string" ? req.query.targetId : "";
  if (!attacker || !targetType || !targetId) return res.status(400).json({ error: "attackerId, targetType and targetId are required" });
  // The preview shows the attacker's garrison, food, sets and champion: a ruler previews only their own marches
  if (sessionUser(req) !== attacker.id) return res.status(403).json({ error: "You can only preview your own marches" });
  res.json(previewMarch(attacker, targetType, targetId, kingdoms, parseKind(req.query.kind)));
});

// Dispatch Marching Army
router.post("/marches", (req: Request, res: Response) => {
  const { attackerId, targetType, targetId, soldiers, kind, bandId, loadout, champion } = (req.body ?? {}) as {
    attackerId?: string;
    targetType?: string;
    targetId?: string;
    soldiers?: number;
    kind?: string;
    /** 🪙 March this mercenary band instead of soldiers */
    bandId?: string;
    /** 🗡️ The Armory set the soldiers wear ("standard" or a rarity) */
    loadout?: string;
    /** 🦸 The kingdom's champion leads the march */
    champion?: boolean;
  };
  const type = parseTargetType(targetType);
  const marchKind = parseKind(kind);
  if (!attackerId || !type || !targetId) {
    return res.status(400).json({ error: "Missing required march parameters: attackerId, targetType, targetId" });
  }

  const kingdom = kingdoms.find((k) => k.id === attackerId);
  if (!kingdom) return res.status(404).json({ error: "Attacker kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;

  const band = typeof bandId === "string" && bandId ? bandId : undefined;
  const soldiersCount = Math.floor(Number(soldiers) || 0);
  if (soldiersCount <= 0 && !band) {
    return res.status(400).json({ error: "Soldier count must be at least 1 to march." });
  }

  try {
    const shieldedBefore = Boolean(kingdom.shield);
    const march = startMarch({ attackerKingdom: kingdom, targetType: type, targetId, soldiersCount, kind: marchKind, kingdoms, bandId: band, loadout: typeof loadout === "string" ? loadout : undefined, champion: champion === true });

    // Refresh the attacker's balances (food, home garrison, deployed troops) from SQLite
    const fresh = getAllKingdomsFromDB().find((k) => k.id === kingdom.id);
    if (fresh) Object.assign(kingdom, fresh);
    // Attacking a ruler shattered their own Royal Shield: everyone's map drops it
    if (shieldedBefore && !kingdom.shield) refreshInMemoryRealm();

    logActivity(
      marchKind === "scout"
        ? `👁️ ${kingdom.name} sent ${march.soldiersCount} scout${march.soldiersCount === 1 ? "" : "s"} toward ${march.targetName}.`
        : marchKind === "gather"
          ? `⛏️ ${kingdom.name} sent ${march.soldiersCount.toLocaleString()} workers to ${march.targetName}.`
          : marchKind === "reinforce"
            ? `🛡️ ${kingdom.name} sent ${march.soldiersCount.toLocaleString()} soldiers to reinforce ${march.targetName}.`
          : march.band
            ? `🪙 ${kingdom.name}'s ${march.band.name} march on ${march.targetName}!`
            : `⚔️ ${kingdom.name} dispatched an army of ${march.soldiersCount.toLocaleString()} marching on ${march.targetName}!`,
      "war"
    );
    res.json({ success: true, march, kingdom });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to dispatch march" });
  }
});

// ⚔️ The Muster: launch several attack marches at once (or raise a rally with several armies), all or none.
// They arrive in the same moment and fight from round 1, strongest first (GAME_GUIDE §13 *Launching marches: the Muster*)
router.post("/marches/muster", (req: Request, res: Response) => {
  const { attackerId, targetType, targetId, kind, waitMs, marches } = (req.body ?? {}) as {
    attackerId?: string;
    targetType?: string;
    targetId?: string;
    /** "attack" (default) or "rally" (the leader's armies wait in the lobby) */
    kind?: string;
    waitMs?: number;
    marches?: MusterMarch[];
  };
  const type = parseTargetType(targetType);
  if (!attackerId || !type || !targetId) return res.status(400).json({ error: "Missing required muster parameters: attackerId, targetType, targetId" });
  const kingdom = kingdoms.find((k) => k.id === attackerId);
  if (!kingdom) return res.status(404).json({ error: "Attacker kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;
  const list = Array.isArray(marches)
    ? marches.slice(0, 20).map((m) => ({
        ...(typeof m?.bandId === "string" && m.bandId ? { bandId: m.bandId } : { soldiers: Math.floor(Number(m?.soldiers) || 0) }),
        ...(typeof m?.loadout === "string" ? { loadout: m.loadout } : {}),
        ...(m?.champion === true ? { champion: true } : {})
      }))
    : [];
  try {
    const shieldedBefore = Boolean(kingdom.shield);
    const result = launchMuster({ attackerKingdom: kingdom, targetType: type, targetId, kingdoms, marches: list, ...(kind === "rally" ? { rally: { waitMs: Number(waitMs) } } : {}) });
    const fresh = getAllKingdomsFromDB().find((k) => k.id === kingdom.id);
    if (fresh) Object.assign(kingdom, fresh);
    if (shieldedBefore && !kingdom.shield) refreshInMemoryRealm();
    const target = result.marches[0]?.targetName ?? "the enemy";
    logActivity(
      result.rallyId
        ? `🚩 ${kingdom.name} raised a rally with ${result.marches.length} armies — ${kingdom.civilization} rulers may join!`
        : `⚔️ ${kingdom.name} mustered ${result.marches.length} march${result.marches.length === 1 ? "" : "es"} on ${target}!`,
      "war"
    );
    res.json({ success: true, ...result, kingdom });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to launch the muster", ...(err instanceof MusterError ? { problems: err.problems } : {}) });
  }
});

// Recall an outbound or fighting march (owner only; no ration refund)
router.post("/marches/:id/recall", (req: Request, res: Response) => {
  if (!authEnabled()) return res.status(503).json({ error: "Sign in with Git is not configured on this server" });
  const userId = sessionUser(req);
  if (!userId) return res.status(401).json({ error: "Sign in with Git first" });

  try {
    const march = recallMarch(String(req.params.id), userId);
    logActivity(`📯 ${march.attackerName} sounded the horn of recall for their army at ${march.targetName}.`, "war");
    res.json({ success: true, march });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to recall march" });
  }
});

// Host sends stationed reinforcements home
router.post("/marches/:id/send-home", (req: Request, res: Response) => {
  if (!authEnabled()) return res.status(503).json({ error: "Sign in with Git is not configured on this server" });
  const userId = sessionUser(req);
  if (!userId) return res.status(401).json({ error: "Sign in with Git first" });
  try {
    const march = sendReinforcementHome(String(req.params.id), userId);
    logActivity(`🏠 ${march.attackerName}'s reinforcements were thanked and sent home.`, "war");
    res.json({ success: true, march });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to send them home" });
  }
});

// Rallies: open rallies of the viewer's civilization
router.get("/rallies", (req: Request, res: Response) => {
  res.json(getOpenRallies(sessionUser(req)));
});

/* ------------------------------------------------------------------------- */
/* 🪙 Mercenaries (GAME_GUIDE §13 *Mercenaries*)                              */
/* ------------------------------------------------------------------------- */

/** The signed-in ruler's kingdom, or sends the error and returns null */
function signedInKingdom(req: Request, res: Response): DeveloperKingdom | null {
  if (!authEnabled()) {
    res.status(503).json({ error: "Sign in with Git is not configured on this server" });
    return null;
  }
  const userId = sessionUser(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in with Git first" });
    return null;
  }
  const k = kingdoms.find((x) => x.id === userId);
  if (!k) {
    res.status(404).json({ error: "You don't rule a kingdom yet" });
    return null;
  }
  return k;
}

// 🗡️ The signed-in ruler's armory: their civilization's sets, how many are at home and away, what forging and keeping them costs
router.get("/armory", (req: Request, res: Response) => {
  const userId = sessionUser(req);
  const k = userId ? kingdoms.find((x) => x.id === userId) : undefined;
  if (!k) return res.status(401).json({ error: "Sign in with Git first" });
  res.json(armoryView(k));
});

router.post("/armory/forge", (req: Request, res: Response) => {
  const k = signedInKingdom(req, res);
  if (!k) return;
  const { rarity, count } = (req.body ?? {}) as { rarity?: string; count?: number };
  if (!ARMORY_RARITIES.includes(rarity as ArmoryRarity)) return res.status(400).json({ error: "rarity is required (uncommon, rare or epic)" });
  try {
    const view = forgeSets(k, rarity as ArmoryRarity, Math.floor(Number(count) || 0));
    const set = view.sets.find((x) => x.rarity === rarity);
    logActivity(`🗡️ ${k.name} forged ${Math.floor(Number(count) || 0).toLocaleString()} ${set?.name ?? rarity}.`, "war");
    // The treasury paid: the realm everyone reads (and the Muster's "what you can afford") sees it at once
    const fresh = getAllKingdomsFromDB().find((x) => x.id === k.id);
    const live = kingdoms.find((x) => x.id === k.id);
    if (fresh && live) Object.assign(live, fresh);
    res.json({ success: true, armory: view, kingdom: fresh ?? k });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to forge" });
  }
});

// 🗡️ Scrap sets at home: gone for good, nothing back, no more upkeep for them
router.post("/armory/scrap", (req: Request, res: Response) => {
  const k = signedInKingdom(req, res);
  if (!k) return;
  const { rarity, count } = (req.body ?? {}) as { rarity?: string; count?: number };
  if (!ARMORY_RARITIES.includes(rarity as ArmoryRarity)) return res.status(400).json({ error: "rarity is required (uncommon, rare or epic)" });
  try {
    const view = scrapSets(k, rarity as ArmoryRarity, Math.floor(Number(count) || 0));
    const set = view.sets.find((x) => x.rarity === rarity);
    logActivity(`🗡️ ${k.name} scrapped ${Math.floor(Number(count) || 0).toLocaleString()} ${set?.name ?? rarity}.`, "war");
    res.json({ success: true, armory: view });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to scrap" });
  }
});

// 🦸 The signed-in ruler's champion: who it is, where it is, its level, kit and Renown ledger
router.get("/champion", (req: Request, res: Response) => {
  const userId = sessionUser(req);
  const k = userId ? kingdoms.find((x) => x.id === userId) : undefined;
  if (!k) return res.status(401).json({ error: "Sign in with Git first" });
  res.json(championView(k));
});

router.post("/champion/hasten", (req: Request, res: Response) => {
  const k = signedInKingdom(req, res);
  if (!k) return;
  try {
    hastenChampion(k.id);
    res.json({ success: true, champion: championView(k), kingdom: getAllKingdomsFromDB().find((x) => x.id === k.id) ?? k });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to hasten the healing" });
  }
});

router.post("/champion/reroll", (req: Request, res: Response) => {
  const k = signedInKingdom(req, res);
  if (!k) return;
  try {
    rerollChampion(k.id);
    res.json({ success: true, champion: championView(k), kingdom: getAllKingdomsFromDB().find((x) => x.id === k.id) ?? k });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to re-roll" });
  }
});

router.post("/champion/retrain", (req: Request, res: Response) => {
  const k = signedInKingdom(req, res);
  if (!k) return;
  const { slot, id } = (req.body ?? {}) as { slot?: string; id?: string };
  if (!KIT_SLOTS.includes(slot as KitSlot) || typeof id !== "string") return res.status(400).json({ error: "slot and id are required" });
  try {
    retrainChampion(k.id, slot as KitSlot, id);
    res.json({ success: true, champion: championView(k), kingdom: getAllKingdomsFromDB().find((x) => x.id === k.id) ?? k });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to retrain" });
  }
});

// A camp at a region's legendary landmark: its stock, and what the viewer may hire
router.get("/mercenaries/camps/:id", (req: Request, res: Response) => {
  try {
    const userId = sessionUser(req);
    const viewer = userId ? kingdoms.find((k) => k.id === userId) ?? null : null;
    res.json(campView(String(req.params.id), viewer));
  } catch (err: any) {
    res.status(404).json({ error: err.message || "No camp here" });
  }
});

// The signed-in ruler's bands
router.get("/mercenaries/mine", (req: Request, res: Response) => {
  const userId = sessionUser(req);
  res.json(userId ? listBands(userId) : []);
});

router.post("/mercenaries/hire", (req: Request, res: Response) => {
  const k = signedInKingdom(req, res);
  if (!k) return;
  const { campId, rarity } = (req.body ?? {}) as { campId?: string; rarity?: string };
  if (!campId || !MERC_RARITIES.includes(rarity as MercRarity)) return res.status(400).json({ error: "campId and rarity are required" });
  try {
    const band = hireBand(k, campId, rarity as MercRarity);
    logActivity(`🪙 ${k.name} hired ${band.name} (${band.rarity}).`, "war");
    res.json({ success: true, band, camp: campView(campId, k), kingdom: getAllKingdomsFromDB().find((x) => x.id === k.id) ?? k });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to hire" });
  }
});

for (const [path, act] of [
  ["heal", healBand],
  ["stop-heal", stopHealing]
] as const) {
  router.post(`/mercenaries/:id/${path}`, (req: Request, res: Response) => {
    const k = signedInKingdom(req, res);
    if (!k) return;
    try {
      const band = act(k.id, String(req.params.id));
      res.json({ success: true, band, kingdom: getAllKingdomsFromDB().find((x) => x.id === k.id) ?? k });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed" });
    }
  });
}

router.post("/mercenaries/:id/dismiss", (req: Request, res: Response) => {
  const k = signedInKingdom(req, res);
  if (!k) return;
  try {
    dismissBand(k.id, String(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to dismiss" });
  }
});

router.post("/rallies", (req: Request, res: Response) => {
  const { leaderId, targetType, targetId, waitMs, soldiers, loadout, champion } = (req.body ?? {}) as { leaderId?: string; targetType?: string; targetId?: string; waitMs?: number; soldiers?: number; loadout?: string; champion?: boolean };
  const type = parseTargetType(targetType);
  const kingdom = kingdoms.find((k) => k.id === leaderId);
  if (!kingdom || !type || !targetId) return res.status(400).json({ error: "leaderId, targetType and targetId are required" });
  if (!requireOwner(req, res, kingdom.id)) return;
  try {
    const shieldedBefore = Boolean(kingdom.shield);
    const rally = startRally({ leader: kingdom, targetType: type, targetId, waitMs: Number(waitMs), soldiers: Math.floor(Number(soldiers) || 0), kingdoms, loadout: typeof loadout === "string" ? loadout : undefined, champion: champion === true });
    const fresh = getAllKingdomsFromDB().find((k) => k.id === kingdom.id);
    if (fresh) Object.assign(kingdom, fresh);
    if (shieldedBefore && !kingdom.shield) refreshInMemoryRealm();
    logActivity(`🚩 ${kingdom.name} raised a rally against ${rally.targetName} — ${kingdom.civilization} rulers may join!`, "war");
    res.json({ success: true, rally, kingdom });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to start the rally" });
  }
});

router.post("/rallies/:id/join", (req: Request, res: Response) => {
  const userId = sessionUser(req);
  const kingdom = kingdoms.find((k) => k.id === userId);
  if (!kingdom) return res.status(401).json({ error: "Sign in with Git first" });
  if (!requireOwner(req, res, kingdom.id)) return;
  try {
    const shieldedBefore = Boolean(kingdom.shield);
    const march = joinRally({ rallyId: String(req.params.id), joiner: kingdom, soldiers: Math.floor(Number((req.body ?? {}).soldiers) || 0), kingdoms, loadout: typeof (req.body ?? {}).loadout === "string" ? req.body.loadout : undefined, champion: (req.body ?? {}).champion === true });
    const fresh = getAllKingdomsFromDB().find((k) => k.id === kingdom.id);
    if (fresh) Object.assign(kingdom, fresh);
    if (shieldedBefore && !kingdom.shield) refreshInMemoryRealm();
    logActivity(`🚩 ${kingdom.name} joined the rally with ${march.soldiersCount.toLocaleString()} soldiers.`, "war");
    res.json({ success: true, march, kingdom });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to join the rally" });
  }
});

router.post("/rallies/:id/cancel", (req: Request, res: Response) => {
  const userId = sessionUser(req);
  if (!userId) return res.status(401).json({ error: "Sign in with Git first" });
  try {
    cancelRally(String(req.params.id), userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to cancel the rally" });
  }
});

// Open places per civilization and active War Frenzy pairs
router.get("/civ-places", (_req: Request, res: Response) => {
  try {
    res.json(getCivPlaces(kingdoms));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get civilization places" });
  }
});

// Dispatch Resource Caravan (Diplomatic Aid / Trade)
router.post("/kingdoms/:id/send-resources", (req: Request, res: Response) => {
  const senderId = String(req.params.id || "");
  const kingdom = kingdoms.find((k) => k.id === senderId);
  if (!kingdom) return res.status(404).json({ error: "Sender kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;

  const { recipientId, food, wood, stone, iron, gold } = (req.body ?? {}) as {
    recipientId?: string;
    food?: number;
    wood?: number;
    stone?: number;
    iron?: number;
    gold?: number;
  };

  const recipId = String(recipientId || "");
  if (!recipId) return res.status(400).json({ error: "Missing recipientId" });
  const recipient = kingdoms.find((k) => k.id === recipId);
  if (!recipient) return res.status(404).json({ error: "Recipient kingdom not found" });

  try {
    transferKingdomResources(senderId, recipId, { food, wood, stone, iron, gold });
    // Update in-memory kingdoms
    kingdom.resources = getKingdomResources(senderId);
    recipient.resources = getKingdomResources(recipId);

    const items: string[] = [];
    if (food) items.push(`${food.toLocaleString()} Food`);
    if (wood) items.push(`${wood.toLocaleString()} Wood`);
    if (stone) items.push(`${stone.toLocaleString()} Stone`);
    if (iron) items.push(`${iron.toLocaleString()} Iron`);
    if (gold) items.push(`${gold.toLocaleString()} Gold`);

    logActivity(`🚚 ${kingdom.name} dispatched a resource caravan of ${items.join(", ")} to ${recipient.name}!`, "system");
    res.json({ success: true, senderKingdom: kingdom, recipientKingdom: recipient });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Caravan dispatch failed" });
  }
});

router.post("/kingdoms/:id/civilization", (req: Request, res: Response) => {
  const { civilization } = (req.body ?? {}) as { civilization: CivilizationType };
  if (!CIVILIZATIONS.includes(civilization)) return res.status(400).json({ error: "Unknown civilization" });
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;

  // Mortal ↔ mortal only when target civ has an open place and no War Frenzy
  try {
    realignCivilization(kingdom, civilization, kingdoms);
  } catch (err: any) {
    return res.status(409).json({ error: err.message });
  }
  refreshRealm();
  const fresh = kingdoms.find((k) => k.id === kingdom.id) ?? kingdom;
  logActivity(`🏛️ ${fresh.name} stepped into an open place in the ${civilization.toUpperCase()} civilization!`);
  res.json({ success: true, kingdom: fresh });
});

// Peaceful civilization swaps between two mortal kingdoms
router.get("/kingdoms/:id/swap-proposals", (req: Request, res: Response) => {
  // A ruler's swap offers are their own business
  res.json(sessionUser(req) === req.params.id ? listSwapProposals(String(req.params.id)) : []);
});

router.post("/kingdoms/:id/swap-proposals", (req: Request, res: Response) => {
  const from = kingdoms.find((k) => k.id === req.params.id);
  const to = kingdoms.find((k) => k.id === (req.body ?? {}).targetId);
  if (!from || !to) return res.status(404).json({ error: "Kingdom not found" });
  if (!requireOwner(req, res, from.id)) return;
  try {
    const proposal = proposeSwap(from, to);
    logActivity(`🤝 ${from.name} proposes to swap civilizations with ${to.name} (${from.civilization} ⇄ ${to.civilization}).`);
    res.json({ success: true, proposal });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/swap-proposals/:pid/:action", (req: Request, res: Response) => {
  const action = req.params.action;
  if (action !== "accept" && action !== "decline" && action !== "cancel") return res.status(404).json({ error: "Unknown action" });
  const userId = sessionUser(req);
  if (!authEnabled()) return res.status(503).json({ error: "Sign in with Git is not configured on this server" });
  if (!userId) return res.status(401).json({ error: "Sign in with Git first" });
  try {
    const proposal = answerSwap(String(req.params.pid), userId, action, kingdoms);
    if (proposal.status === "accepted") {
      refreshRealm();
      const a = kingdoms.find((k) => k.id === proposal.fromId);
      const b = kingdoms.find((k) => k.id === proposal.toId);
      logActivity(`🤝 ${a?.name} and ${b?.name} swapped civilizations in peace: ${a?.name} is now ${a?.civilization}, ${b?.name} is now ${b?.civilization}.`);
    }
    res.json({ success: true, proposal });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** Reload kingdoms from SQLite after a civilization change (castles move to their new province) */
function refreshRealm() {
  kingdoms.splice(0, kingdoms.length, ...getAllKingdomsFromDB());
  syncNethergardeSpires(kingdoms, true);
}

// Admin: lay every castle out afresh by the spacing rules; only positions change (civs, cities, landmarks stay)
router.post("/admin/relayout-kingdoms", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  try {
    const { moved, total } = relayoutKingdomPlacements(kingdoms);
    // The Voidrift's NPC kingdoms find free plots round the new castles
    syncNethergardeSpires(kingdoms, true);
    logActivity(`⚡ [ADMIN] Kingdom positions refreshed: ${moved} of ${total} castles moved to a clear spot.`, "system");
    res.json({ success: true, moved, total, message: `Kingdom positions refreshed: ${moved} of ${total} castles moved.` });
  } catch (err: any) {
    console.error("❌ Admin kingdom relayout failed:", err);
    res.status(500).json({ error: err.message || "Failed to refresh kingdom positions" });
  }
});

// Admin: 🗿 Reset Landmarks — every region (or one) rotates its epic landmarks now, with a rotation day or finished
router.post("/admin/reset-landmarks", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  const { zoneId, finished } = (req.body ?? {}) as { zoneId?: string; finished?: boolean };
  try {
    const regions = resetLandmarks(kingdoms, { zoneId: zoneId || undefined, finished: Boolean(finished) });
    const how = finished ? "stand finished" : "rise while the old ones crumble for the next 24 hours";
    logActivity(`⚡ [ADMIN] Landmarks reset in ${regions.length === 1 ? regions[0].region : "every region"}: the new ones ${how}.`, "system");
    res.json({ success: true, regions, message: `Landmarks rotated in ${regions.map((r) => r.region).join(", ")}: ${regions.map((r) => r.arriving.join(" & ")).join("; ")} ${finished ? "now stand" : "are rising"}.` });
  } catch (err: any) {
    console.error("❌ Admin landmark reset failed:", err);
    res.status(400).json({ error: err.message || "Failed to reset landmarks" });
  }
});

// Admin: the buffer realms move now (the old one is gone at once; another of its zone's pool stands at a fresh spot)
router.post("/admin/move-realms", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  const { zoneId } = (req.body ?? {}) as { zoneId?: string };
  try {
    const regions = moveRealms(kingdoms, zoneId || undefined);
    pruneNpcKingdoms(kingdoms);
    logActivity(`⚡ [ADMIN] Buffer realms moved in ${regions.length === 1 ? regions[0].region : "every region"}.`, "system");
    res.json({ success: true, regions, message: `Realms moved: ${regions.map((r) => `${r.region}: ${r.arriving}`).join("; ")}.` });
  } catch (err: any) {
    console.error("❌ Admin realm move failed:", err);
    res.status(400).json({ error: err.message || "Failed to move the realms" });
  }
});

// Admin: Reset & rebalance all user civilizations, clear building plot layouts, and regenerate world map
router.post("/admin/reset-world", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }

  try {
    const { assigned, total } = reassignAllCivilizations();
    resetAllKingdomLayouts();

    const fresh = getAllKingdomsFromDB();
    kingdoms.splice(0, kingdoms.length, ...fresh);

    const freshMap = regenerateFlatWorldMap(kingdoms);
    // NPC kingdoms roll a new level and donor civilization with the new world
    resetNpcKingdoms();
    syncNethergardeSpires(kingdoms, true);

    logActivity(`⚡ [ADMIN] World map reset: ${total} users reallocated across all 5 provinces & plot layouts refreshed.`, "system");

    res.json({
      success: true,
      message: `World map reset successfully. ${total} kingdoms reallocated.`,
      assigned,
      totalKingdoms: kingdoms.length,
      map: freshMap
    });
  } catch (err: any) {
    console.error("❌ Admin world reset failed:", err);
    res.status(500).json({ error: err.message || "Failed to reset world map" });
  }
});

// Admin: strip every ruler's improvements and refund 100% of their catalog cost (Special Overseers are skipped)
router.post("/admin/reset-upgrades", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  try {
    const { perKingdom, ...result } = resetAndRefundAllKingdomUpgrades();
    const actorId = sessionUser(req) ?? "realm";
    for (const { userId, refund } of perKingdom) announceImprovementRefund(actorId, userId, refund);
    refreshInMemoryRealm();
    if (result.tiers > 0) {
      logActivity(`⚡ [ADMIN] Every kingdom's improvements were reset: ${result.tiers} tiers across ${result.kingdoms} kingdoms refunded in full.`, "system");
    }
    res.json({
      success: true,
      message:
        result.tiers > 0
          ? `Reset ${result.tiers} improvement tiers across ${result.kingdoms} kingdoms; every resource and gem spent was returned, and each ruler was sent a herald notice.`
          : "No kingdom has improvements to reset.",
      ...result
    });
  } catch (err: any) {
    console.error("❌ Admin reset of all improvements failed:", err);
    res.status(500).json({ error: err.message || "Failed to reset improvements" });
  }
});

// Admin: strip every improvement of one kingdom and refund 100% of their catalog cost (resources and gems)
router.post("/admin/kingdoms/:id/reset-upgrades", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  if (kingdom.isSpecial) return res.status(400).json({ error: "Special Overseers' improvements are fixed at maximum and can't be reset." });

  try {
    const refund = resetAndRefundKingdomUpgrades(kingdom.id);
    const tiers = Object.values(refund.stripped).reduce((sum, t) => sum + t, 0);
    announceImprovementRefund(sessionUser(req) ?? "realm", kingdom.id, refund);
    refreshInMemoryRealm();
    const updated = kingdoms.find((k) => k.id === kingdom.id) ?? null;
    if (tiers > 0) {
      logActivity(`⚡ [ADMIN] ${kingdom.name}'s improvements were reset: ${tiers} tiers refunded in full.`, "system");
    }
    res.json({
      success: true,
      message: tiers > 0 ? `Reset ${tiers} improvement tiers for ${kingdom.name}; every resource and gem spent was returned, and ${kingdom.name} was sent a herald notice.` : `${kingdom.name} has no improvements to reset.`,
      ...refund,
      kingdom: updated
    });
  } catch (err: any) {
    console.error("❌ Admin improvement reset failed:", err);
    res.status(500).json({ error: err.message || "Failed to reset improvements" });
  }
});

// Admin: Reset treasury ledger and active developer balances to zero
router.post("/admin/reset-ledger", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }

  try {
    const { resetCount } = resetLedgerHistory();
    // 🦸 Champions' Renown is its own ledger: a treasury reset leaves it alone unless asked ({ champions: true })
    if ((req.body ?? {}).champions === true) resetChampionRenown();
    const fresh = getAllKingdomsFromDB();
    kingdoms.splice(0, kingdoms.length, ...fresh);

    logActivity(`⚡ [ADMIN] Treasury ledger cleared: ${resetCount} developer accounts reset to 0 with genesis ledger entry.`, "system");

    res.json({
      success: true,
      message: `Treasury ledger and balances cleanly reset for ${resetCount} kingdoms.`,
      resetCount
    });
  } catch (err: any) {
    console.error("❌ Admin ledger reset failed:", err);
    res.status(500).json({ error: err.message || "Failed to reset treasury ledger" });
  }
});

// Admin: Force execute 15-minute realm harvest allocation immediately
// Admin: roll a fresh set of roving encounters now; the regular respawns continue
router.post("/admin/respawn-encounters", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  rerollRovingSpawns();
  const viewerId = sessionUser(req);
  const roving = getRovingSpawnsFor(kingdoms, latestScoutReportsByTarget(viewerId));
  const nodes = roving.npcs.filter((n) => n.category === "resource").length;
  res.json({ success: true, message: `Spawned ${roving.npcs.length - nodes} fresh encounters across the frontier and ${nodes} resource nodes across the realm.`, ...roving, key: rovingKeyFor(viewerId) });
});

// Admin: the world disasters of the last week and the next two days
router.get("/admin/disasters", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  res.json({ disasters: listDisasters(), current: disasterStatus() });
});

// Admin: call a world disaster now (or in up to 60 minutes, so its warning shows first), or end the one in force
router.post("/admin/disasters", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  const { kind, inMinutes, end } = req.body ?? {};
  try {
    if (end) {
      const ended = endDisasterNow();
      return res.json({ success: ended, message: ended ? "The disaster in force has ended." : "No disaster is in force.", current: disasterStatus() });
    }
    if (!DISASTER_KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of ${DISASTER_KINDS.join(", ")}` });
    const status = callDisaster(kind as DisasterKind, sessionUser(req) ?? "admin", Number(inMinutes) || 0);
    logActivity(`⚡ [ADMIN] A world disaster was called: ${kind}`, "notice");
    res.json({ success: true, message: status?.active ? "The disaster falls on the realm now." : "The herald warns of it; it strikes soon.", current: status });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to call the disaster" });
  }
});

router.post("/admin/trigger-harvest", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }

  try {
    const result = syncService.executeHarvest();
    if (!result || !result.success) {
      return res.status(400).json({ error: "No kingdoms available for harvest distribution" });
    }

    // Refresh in-memory kingdoms with newly allocated resources
    const fresh = getAllKingdomsFromDB();
    kingdoms.splice(0, kingdoms.length, ...fresh);

    logActivity(`⚡ [ADMIN] Manual harvest triggered: Distributed standard pool + ${result.scarceDef?.name} drop!`, "harvest");

    res.json({
      success: true,
      message: `Manual realm harvest successfully distributed.`,
      harvest: result
    });
  } catch (err: any) {
    console.error("❌ Admin manual harvest failed:", err);
    res.status(500).json({ error: err.message || "Failed to execute manual harvest" });
  }
});

// Admin: Reset historical backfill checkpoints and re-index all repositories
router.post("/admin/backfill/reset", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }

  try {
    backfillService.reset();
    backfillService.start(kingdoms, logActivity, onHistoryStored);
    logActivity(`🔄 [ADMIN] Historical backfill checkpoints reset. Re-indexing all repos down to ${config.backfillStartYear}...`, "sync");
    res.json({
      success: true,
      message: `Historical backfill checkpoints reset. Re-indexing all repositories down to ${config.backfillStartYear}.`,
      status: backfillService.status
    });
  } catch (err: any) {
    console.error("❌ Admin backfill reset failed:", err);
    res.status(500).json({ error: err.message || "Failed to reset backfill checkpoints" });
  }
});

// Admin: Re-fetch emails from Git for a developer, re-scan and re-attribute their commits & repositories
router.post("/admin/dev/:id/resync-commits", async (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }

  const devId = String(req.params.id || "").toLowerCase();
  const user = stmtGetUserById.get(devId) as { id: string; username: string; full_name?: string } | undefined;
  if (!user) {
    return res.status(404).json({ error: `Developer "${req.params.id}" not found in database` });
  }

  try {
    // 1. Fetch freshly registered emails from Git
    const rawAdminEmails = await fetchAllAdminEmails();
    const gitEmails = rawAdminEmails
      .filter((ae) => ae.username && ae.username.toLowerCase() === user.username.toLowerCase())
      .map((ae) => ae.email.toLowerCase().trim());

    // 2. Re-attribute commits and link emails in SQLite
    const resyncResult = resyncDevCommits(user.id, gitEmails);
    markDevDailyStatsStale();
    // 3. Re-attribution can move commits between developers, so every ruler's titles are re-evaluated;
    //    then rebuild in-memory kingdoms so all buildings, levels, lines, and stats reflect the changes
    const fresh = rebuildRealmWithTitles().kingdoms;
    kingdoms.splice(0, kingdoms.length, ...fresh);

    const updatedKingdom = kingdoms.find((k) => k.id === devId) || null;

    logActivity(
      `⚡ [ADMIN] Re-checked commits for ${user.full_name || user.username}: linked ${resyncResult.linkedEmails.length} emails, re-attributed ${resyncResult.reattributedCommits} commits!`,
      "sync"
    );

    res.json({
      success: true,
      message: `Successfully re-checked! ${resyncResult.linkedEmails.length} emails linked and ${resyncResult.reattributedCommits} commits re-attributed (${resyncResult.totalUserCommits} total commits).`,
      result: resyncResult,
      kingdom: updatedKingdom
    });
  } catch (err: any) {
    console.error("❌ Admin resync commits failed:", err);
    res.status(500).json({ error: err.message || "Failed to re-check commits" });
  }
});

// Admin: commit emails no developer owns yet (most commits first), to pick from when assigning
router.get("/admin/emails/unmatched", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  res.json({ emails: listUnmatchedCommitEmails() });
});

// Admin: the emails linked to a developer
router.get("/admin/dev/:id/emails", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  try {
    res.json({ emails: listDevEmails(String(req.params.id || "")) });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

/** After commits change hands: stats, titles and every kingdom are rebuilt */
function rebuildAfterReattribution() {
  markDevDailyStatsStale();
  invalidateWatchtower();
  const fresh = rebuildRealmWithTitles().kingdoms;
  kingdoms.splice(0, kingdoms.length, ...fresh);
}

// Admin: assign an email to a developer; every commit made under it becomes theirs.
// With `repoIds`, only the email's commits in those repos (a shared email), and the match lasts across syncs.
router.post("/admin/dev/:id/emails", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  const devId = String(req.params.id || "").toLowerCase();
  const repoIds = Array.isArray(req.body?.repoIds) ? (req.body.repoIds as unknown[]).map(String).filter(Boolean) : [];
  if (repoIds.length > 0) {
    try {
      const result = assignDevRepoEmail(devId, String(req.body?.email || ""), repoIds);
      rebuildAfterReattribution();
      const where = result.repos.join(", ");
      logActivity(`📧 [ADMIN] Assigned an email in ${where} to ${devId}: ${result.reattributedCommits} commits re-attributed`, "sync");
      return res.json({
        success: true,
        message: `${result.email} in ${where} assigned to ${devId}. ${result.reattributedCommits} commits re-attributed.`,
        result,
        emails: listDevEmails(devId),
        kingdom: kingdoms.find((k) => k.id === devId) || null
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Failed to assign email" });
    }
  }
  try {
    const result = assignDevEmail(devId, String(req.body?.email || ""));
    rebuildAfterReattribution();
    const from = result.previousOwner ? ` (moved from ${result.previousOwner})` : "";
    logActivity(`📧 [ADMIN] Assigned an email to ${devId}${from}: ${result.reattributedCommits} commits re-attributed`, "sync");
    res.json({
      success: true,
      message: `${result.email} assigned to ${devId}${from}. ${result.reattributedCommits} commits re-attributed.`,
      result,
      emails: listDevEmails(devId),
      kingdom: kingdoms.find((k) => k.id === devId) || null
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to assign email" });
  }
});

// Admin: unassign an email from a developer; its commits go back to unmatched.
// With `?repo=<repoId>`, undo that one per-repo match instead.
router.delete("/admin/dev/:id/emails/:email", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  const devId = String(req.params.id || "").toLowerCase();
  const repoId = typeof req.query.repo === "string" ? req.query.repo : "";
  if (repoId) {
    try {
      const result = unassignDevRepoEmail(devId, String(req.params.email || ""), repoId);
      rebuildAfterReattribution();
      logActivity(`📧 [ADMIN] Unassigned an email in ${result.repo} from ${devId}: ${result.unlinkedCommits} commits unlinked`, "sync");
      return res.json({
        success: true,
        message: `${result.email} in ${result.repo} unassigned from ${devId}. ${result.unlinkedCommits} commits unlinked.`,
        result,
        emails: listDevEmails(devId),
        kingdom: kingdoms.find((k) => k.id === devId) || null
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Failed to unassign email" });
    }
  }
  try {
    const result = unassignDevEmail(devId, String(req.params.email || ""));
    rebuildAfterReattribution();
    logActivity(`📧 [ADMIN] Unassigned an email from ${devId}: ${result.unlinkedCommits} commits unlinked`, "sync");
    res.json({
      success: true,
      message: `${result.email} unassigned from ${devId}. ${result.unlinkedCommits} commits unlinked.`,
      result,
      emails: listDevEmails(devId),
      kingdom: kingdoms.find((k) => k.id === devId) || null
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to unassign email" });
  }
});

// Admin: Query extensible system validation warnings and ignored repositories list
router.get("/admin/validations", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }

  const warnings = [...getAdminValidationWarnings(), ...scriptoriumValidationWarnings()];
  // "info" checks (repos with no project) are listed in the panel but don't raise the banner
  const totalWarnings = warnings.reduce((sum, w) => sum + (w.severity === "info" ? 0 : w.count), 0);
  const ignoredRepos = getIgnoredRepositories();
  res.json({ warnings, totalWarnings, ignoredRepos });
});

// Admin: Delete a duplicate Level 1 repository
router.delete("/admin/repositories/:id", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }

  const repoId = String(req.params.id || "");
  try {
    const result = deleteAdminRepository(repoId);
    markDevDailyStatsStale();
    refreshInMemoryRealm();
    logActivity(`🗑️ [ADMIN] ${result.message}`, "system");
    res.json(result);
  } catch (err: any) {
    console.error("❌ Admin delete repository failed:", err);
    res.status(400).json({ error: err.message || "Failed to delete repository" });
  }
});

// Admin: Delete all or specified duplicate Level 1 repositories in bulk
router.post("/admin/repositories/delete-duplicates", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }

  const { repoIds } = (req.body || {}) as { repoIds?: unknown };
  if (repoIds !== undefined && (!Array.isArray(repoIds) || !repoIds.every((id) => typeof id === "string"))) {
    return res.status(400).json({ error: "repoIds must be an array of repository ids" });
  }
  try {
    let targetIds = repoIds as string[] | undefined;
    if (!targetIds || targetIds.length === 0) {
      const warnings = getAdminValidationWarnings();
      const dupWarning = warnings.find((w) => w.category === "duplicate_repos");
      const groups: DuplicateRepoGroup[] = dupWarning?.details?.groups || [];
      targetIds = groups.flatMap((g) => g.repos.filter((r) => r.canDelete).map((r) => r.id));
    }

    if (targetIds.length === 0) {
      return res.json({ success: true, deletedCount: 0, message: "No deletable duplicate repositories found." });
    }

    const result = deleteAdminRepositories(targetIds);
    markDevDailyStatsStale();
    refreshInMemoryRealm();
    logActivity(`🗑️ [ADMIN] ${result.message}`, "system");
    res.json(result);
  } catch (err: any) {
    console.error("❌ Admin bulk delete duplicates failed:", err);
    res.status(400).json({ error: err.message || "Failed to delete duplicate repositories" });
  }
});

// Newest commits of the kept copies an ignored repo shares history with, cached a few minutes: the admin panel
// checks ignored repos a few at a time, and copies of one repo all lean on the same kept copies
const keptCopyCommits = new Map<string, { at: number; shas: Promise<Set<string>> }>();
function keptCopyShas(fullName: string): Promise<Set<string>> {
  const hit = keptCopyCommits.get(fullName);
  if (hit && Date.now() - hit.at < 3 * 60_000) return hit.shas;
  const shas = peekRepoCommits(fullName, () => false, 50)
    .catch(() => peekRepoCommits(fullName, () => false, 50))
    .then((r) => new Set(r.commits.map((c) => c.sha)));
  // A failed read is not remembered (and fails the check): read as "no commits" it would flag every copy as new
  shas.catch(() => keptCopyCommits.delete(fullName));
  keptCopyCommits.set(fullName, { at: Date.now(), shas });
  return shas;
}

// Admin: ask Git whether ignored repos have commits of their own now (all of them, or body { repoIds }; the panel
// sends a few at a time to show progress). A commit doesn't count when the realm already holds it, or when a kept
// copy sharing the history has it in Git (not synced yet). Results are saved per repo.
router.post("/admin/ignored-repositories/check-commits", async (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }
  const { repoIds } = (req.body ?? {}) as { repoIds?: string[] };
  const wanted = Array.isArray(repoIds) ? new Set(repoIds.map(String)) : null;
  const targets = getIgnoredRepositories().filter((r) => !wanted || wanted.has(r.id));
  let withCommits = 0;
  let failed = 0;
  await mapPool(targets, 4, async (repo) => {
    const checkedAt = new Date().toISOString();
    let check: IgnoredRepoCommitCheck;
    try {
      // Newest first, a page at a time; copies differ only at the top, so stop once a page reaches history the realm holds
      const allUnknown = (page: Array<{ sha: string }>) => realmCommitOwners(page.map((c) => c.sha)).size === 0;
      // Git sometimes drops a connection under load: try twice
      const peek = await peekRepoCommits(repo.fullName, allUnknown).catch(() => peekRepoCommits(repo.fullName, allUnknown));
      const owners = realmCommitOwners(peek.commits.map((c) => c.sha));
      const holders = new Map<string, number>();
      for (const name of owners.values()) holders.set(name, (holders.get(name) ?? 0) + 1);
      const sharedWith = [...holders.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      let fresh = peek.commits.filter((c) => !owners.has(c.sha));
      for (const holder of holders.keys()) {
        if (fresh.length === 0) break;
        const kept = await keptCopyShas(holder);
        fresh = fresh.filter((c) => !kept.has(c.sha));
      }
      const status: IgnoredRepoCommitCheck["status"] = peek.missing ? "missing" : fresh.length > 0 ? "has_commits" : peek.total > 0 ? "shared" : "empty";
      if (status === "has_commits") withCommits++;
      check = {
        status,
        commitCount: peek.total,
        newCommitCount: fresh.length,
        latestCommitAt: (fresh[0] ?? peek.commits[0])?.date || null,
        sharedWith,
        checkedAt
      };
    } catch (err: any) {
      failed++;
      check = { status: "error", commitCount: 0, newCommitCount: 0, latestCommitAt: null, error: err.message || "Git did not answer", checkedAt };
    }
    saveIgnoredRepoCheck(repo.id, check);
  });
  const own = withCommits === 1 ? "has commits of its own" : "have commits of their own";
  const message = `Checked ${targets.length} ignored repositor${targets.length === 1 ? "y" : "ies"}: ${withCommits} ${own} now` + (failed ? `, ${failed} could not be checked.` : ".");
  res.json({ success: true, message, checked: targets.length, withCommits, failed, ignoredRepos: getIgnoredRepositories() });
});

// Admin: Restore an ignored repository so Git sync will fetch it again
router.post("/admin/repositories/:id/restore", (req: Request, res: Response) => {
  if (!isRequestAdmin(req)) {
    return res.status(403).json({ error: "Administrator privileges required" });
  }

  const repoId = String(req.params.id || "");
  try {
    const result = restoreIgnoredRepository(repoId);
    logActivity(`♻️ [ADMIN] ${result.message}`, "system");
    res.json(result);
  } catch (err: any) {
    console.error("❌ Admin restore repository failed:", err);
    res.status(400).json({ error: err.message || "Failed to restore repository" });
  }
});

// Swap the plots of two buildings (owner only), e.g. a big house trades places with a small barracks
router.post("/kingdoms/:id/buildings/:repoId/swap", (req: Request, res: Response) => {
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;

  const { withRepoId } = (req.body ?? {}) as { withRepoId?: string };
  const a = (kingdom.buildings || []).find((b) => b.id === req.params.repoId);
  const b = (kingdom.buildings || []).find((x) => x.id === withRepoId);
  if (!a || !b) return res.status(404).json({ error: "Building not found" });
  if (a.id === b.id) return res.status(400).json({ error: "Pick a different building to swap with" });

  if (!swapRepoPlots(kingdom.id, a.id, b.id)) return res.status(409).json({ error: "A building has no plot yet — try again after the next sync" });
  kingdoms.splice(0, kingdoms.length, ...getAllKingdomsFromDB());

  logActivity(`🔁 ${kingdom.name} swapped the plots of ${a.name} and ${b.name}`);
  res.json({ success: true, kingdom: kingdoms.find((k) => k.id === kingdom.id) });
});

// City improvements: catalog + purchase (resource sink)
router.get("/upgrades", (_req: Request, res: Response) => {
  res.json(UPGRADES);
});

// Hall of Renown: fairness ranking for the last full week / month, the fiscal year so far or all time
const LEADERBOARD_PERIODS: LeaderboardPeriod[] = ["week", "month", "year", "all"];
// Top 3 of every tab: the kingdom picker's marks (Weekly / Monthly / Year) and crowned civ frames (All time)
router.get("/leaderboard/podium", (_req: Request, res: Response) => {
  try {
    res.json(getRenownPodium());
  } catch (err: any) {
    console.error("[Renown] Podium failed:", err);
    res.status(500).json({ error: err.message });
  }
});
router.get("/leaderboard", (req: Request, res: Response) => {
  const period = String(req.query.period || "week") as LeaderboardPeriod;
  if (!LEADERBOARD_PERIODS.includes(period)) return res.status(400).json({ error: `period must be one of ${LEADERBOARD_PERIODS.join(", ")}` });
  try {
    res.json(getLeaderboard(period));
  } catch (err: any) {
    console.error("[Renown] Leaderboard failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Codex: every NPC, boss, landmark, spawn and resource node with its rarity and spawn chance, plus improvements
router.get("/codex", (_req: Request, res: Response) => {
  // The epic landmarks standing now (rising ones included) are marked
  const standing = getOrGenerateFlatWorldMap(kingdoms).npcs.filter((n) => n.category === "terrain" && n.landmarkState?.phase !== "crumbling");
  // The Warden of every Voidrift slot, as it holds the slot while no developer does
  const voidKingdoms = Array.from({ length: config.nethergardePlayerSlots }, (_, i) => ({ slot: i + 1, ...voidNpcFor(i + 1), wallDefMult: wallDefMultForTier(VOID_NPC.WALL_TIER) }));
  // 🪙 Each civilization's mercenary of each rarity: its Battle Arts as lines (the client holds the looks, prices and upkeep)
  const mercenaryKits = Object.fromEntries(CIVILIZATIONS.map((civ) => [civ, Object.fromEntries(MERC_RARITIES.map((r) => [r, kitLines(mercKitFor(civ, r))]))]));
  res.json({ ...getCodexCatalog(new Set(standing.map((n) => n.type))), upgrades: UPGRADES, voidKingdoms, mercenaryKits });
});

// 🤺 Sparring Grounds (Royal Codex): the units that may spar, and a 6-round fight between two of them on the real engine
router.get("/sparring/roster", (_req: Request, res: Response) => {
  res.json({ roster: sparringRoster().map(({ kit: _kit, traits: _traits, pack: _pack, ...u }) => u) });
});
router.get("/sparring/fight", (req: Request, res: Response) => {
  const result = runSparring(String(req.query.a ?? ""), String(req.query.b ?? ""), String(req.query.seed ?? "sparring").slice(0, 40));
  if (!result) return res.status(404).json({ error: "Unknown unit" });
  res.json(result);
});

router.post("/kingdoms/:id/upgrades", (req: Request, res: Response) => {
  const kingdom = kingdoms.find((k) => k.id === req.params.id);
  if (!kingdom) return res.status(404).json({ error: "Kingdom not found" });
  if (!requireOwner(req, res, kingdom.id)) return;

  const { upgradeId } = (req.body ?? {}) as { upgradeId?: string };
  try {
    const { tier } = purchaseUpgrade(kingdom.id, String(upgradeId || ""));
    kingdom.resources = getKingdomResources(kingdom.id);
    kingdom.upgrades = getKingdomUpgrades(kingdom.id);
    const def = UPGRADES.find((u) => u.id === upgradeId)!;
    logActivity(`🏗️ ${kingdom.name} built ${def.emblem} ${def.tiers[tier - 1].name}!`);
    res.json({ success: true, kingdom });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Purchase failed" });
  }
});
