import { useRef, useState } from "react";
import { Modal } from "./Modal";
import { Combobox } from "./Combobox";
import { ShieldAlert, ShieldCheck, RefreshCw, MapPinned, CheckCircle2, AlertTriangle, Coins, RotateCcw, Sparkles, Swords, History, Hammer, Landmark, Flag, ScrollText, Download, Upload, DatabaseBackup } from "lucide-react";
import { DeveloperKingdom } from "@/types";
import { sound } from "@/hooks/useSound";
import { useDialog } from "./Dialog";
import { realmBackup } from "@/utils/scriptoriumApi";
import { DevEmailsCard } from "./DevEmailsCard";
import { DisasterAdminCard } from "./DisasterAdminCard";

interface AdminModalProps {
  open: boolean;
  /** Kept open but hidden while a panel opened from it (System Validations) is on top */
  hidden?: boolean;
  onClose: () => void;
  onResetWorld: () => Promise<any>;
  /** Lay every castle out afresh by the spacing rules; nothing else changes */
  onRelayoutKingdoms: () => Promise<{ message?: string; moved?: number; total?: number }>;
  onResetLedger: () => Promise<any>;
  onTriggerHarvest: () => Promise<any>;
  onRespawnEncounters: () => Promise<any>;
  /** 🗿 Reset Landmarks: every region (null) or one rotates its epic landmarks now; `finished` skips the rotation day */
  onResetLandmarks?: (zoneId: string | null, finished: boolean) => Promise<{ message?: string }>;
  onMoveRealms?: (zoneId: string | null) => Promise<{ message?: string }>;
  onResetBackfill?: () => Promise<any>;
  backfillStatus?: {
    enabled: boolean;
    isRunning: boolean;
    startYear: number;
    delayMs: number;
    total: number;
    backfilled: number;
    totalCommits: number;
    percent: number;
  };
  /** Minutes between regular roving respawns */
  rovingWindowMinutes?: number;
  kingdoms?: DeveloperKingdom[];
  onResetKingdomUpgrades?: (kingdomId: string) => Promise<{ message?: string }>;
  onResetAllKingdomUpgrades?: () => Promise<{ message?: string }>;
  /** Opens the System Validations panel (works with zero warnings too) */
  onOpenValidations?: () => void;
  validationWarnings?: number;
  /** 🪶 Deed reports waiting for a seal, and the review list */
  pendingDeeds?: number;
  onOpenDeedReview?: () => void;
  /** 🌠 Omens nobody has read, and their list */
  newOmens?: number;
  onOpenOmens?: () => void;
  /** 📧 Commit emails no developer owns (null while unknown), and the window that matches them */
  unmatchedEmails?: number | null;
  onOpenDevEmails?: () => void;
}

/** The four buffer regions whose epic landmarks rotate */
const LANDMARK_REGIONS: Array<[string, string]> = [
  ["buf-sea-fjord", "🌊 The Sunken Fjord"],
  ["buf-scorch-desert", "🏜️ The Scorchwind Expanse"],
  ["buf-whisper-woods", "🌲 The Whispering Deepwood"],
  ["buf-dragon-peaks", "🏔️ The Dragonspine Peaks"]
];

export function AdminModal({
  open,
  hidden = false,
  onClose,
  onResetWorld,
  onRelayoutKingdoms,
  onResetLedger,
  onTriggerHarvest,
  onRespawnEncounters,
  onResetLandmarks,
  onMoveRealms,
  onResetBackfill,
  backfillStatus,
  rovingWindowMinutes = 15,
  kingdoms = [],
  onResetKingdomUpgrades,
  onResetAllKingdomUpgrades,
  onOpenValidations,
  validationWarnings = 0,
  pendingDeeds = 0,
  onOpenDeedReview,
  newOmens = 0,
  onOpenOmens,
  unmatchedEmails = null,
  onOpenDevEmails
}: AdminModalProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [worldResult, setWorldResult] = useState<{ success: boolean; message: string; assigned?: Record<string, number> } | null>(null);
  const [worldError, setWorldError] = useState<string | null>(null);

  const [ledgerResult, setLedgerResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const [harvestResult, setHarvestResult] = useState<{ success: boolean; message: string; summary?: any } | null>(null);
  const [harvestError, setHarvestError] = useState<string | null>(null);
  const [respawnResult, setRespawnResult] = useState<string | null>(null);
  const [respawnError, setRespawnError] = useState<string | null>(null);

  const [landmarkRegion, setLandmarkRegion] = useState("");
  const [landmarksFinished, setLandmarksFinished] = useState(false);
  const [landmarkResult, setLandmarkResult] = useState<string | null>(null);
  const [landmarkError, setLandmarkError] = useState<string | null>(null);

  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const [upgradeTarget, setUpgradeTarget] = useState("");
  const [upgradeResult, setUpgradeResult] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [backupResult, setBackupResult] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const backupFile = useRef<HTMLInputElement>(null);

  const dialog = useDialog();

  // Rulers with at least one improvement tier (Special Overseers are fixed at maximum)
  const upgradedKingdoms = kingdoms
    .filter((k) => !k.isSpecial && Object.values(k.upgrades ?? {}).some((t) => t > 0))
    .sort((a, b) => a.name.localeCompare(b.name));
  const tiersOf = (k: DeveloperKingdom) => Object.values(k.upgrades ?? {}).reduce((sum, t) => sum + t, 0);

  const ALL = "__all__";
  const totalTiers = upgradedKingdoms.reduce((sum, k) => sum + tiersOf(k), 0);

  const handleResetUpgrades = async () => {
    if (upgradeTarget === ALL) {
      if (!onResetAllKingdomUpgrades) return;
      const ok = await dialog.confirm({
        tone: "danger",
        title: "Reset every kingdom's improvements?",
        message: `All ${totalTiers} improvement tiers across ${upgradedKingdoms.length} kingdoms will be stripped and 100% of the resources and gems spent on them will be deposited back into each ruler's treasury. Special Overseers are not affected.`,
        confirmLabel: "Reset & refund all"
      });
      if (!ok) return;
      setActiveAction("upgrades");
      setUpgradeError(null);
      setUpgradeResult(null);
      try {
        sound.playClick();
        const res = await onResetAllKingdomUpgrades();
        setUpgradeResult(res.message || "Every kingdom's improvements were reset and refunded.");
        setUpgradeTarget("");
      } catch (err: any) {
        setUpgradeError(err.message || "Failed to reset improvements");
      } finally {
        setActiveAction(null);
      }
      return;
    }
    const k = upgradedKingdoms.find((x) => x.id === upgradeTarget);
    if (!k || !onResetKingdomUpgrades) return;
    const ok = await dialog.confirm({
      tone: "danger",
      title: `Reset all improvements for ${k.name}?`,
      message: `All ${tiersOf(k)} improvement tiers will be stripped and 100% of the resources and gems spent on them will be deposited back into ${k.name}'s treasury.`,
      confirmLabel: "Reset & refund"
    });
    if (!ok) return;

    setActiveAction("upgrades");
    setUpgradeError(null);
    setUpgradeResult(null);
    try {
      sound.playClick();
      const res = await onResetKingdomUpgrades(k.id);
      setUpgradeResult(res.message || "Improvements reset and refunded.");
      setUpgradeTarget("");
    } catch (err: any) {
      setUpgradeError(err.message || "Failed to reset improvements");
    } finally {
      setActiveAction(null);
    }
  };

  const handleRespawn = async () => {
    const ok = await dialog.confirm({
      tone: "warning",
      title: "Respawn encounters now?",
      message: `Every roving mob, bandit and treasure on the map is replaced by a fresh roll. The regular respawn every ${rovingWindowMinutes} minutes still happens as usual.`,
      confirmLabel: "Respawn"
    });
    if (!ok) return;

    setActiveAction("respawn");
    setRespawnError(null);
    setRespawnResult(null);
    try {
      sound.playClick();
      const res = await onRespawnEncounters();
      setRespawnResult(res.message || "Fresh encounters spawned across the frontier!");
      sound.playLevelUp();
    } catch (err: any) {
      setRespawnError(err.message || "Failed to respawn encounters");
    } finally {
      setActiveAction(null);
    }
  };

  const handleResetLandmarks = async () => {
    if (!onResetLandmarks) return;
    const where = LANDMARK_REGIONS.find(([id]) => id === landmarkRegion)?.[1] ?? "every region";
    const ok = await dialog.confirm({
      tone: "warning",
      title: `Reset the landmarks in ${where}?`,
      message: landmarksFinished
        ? `The epic landmark standing in ${where} is replaced by another of the region's pool, standing finished right away. Kingdoms, bosses and castle positions stay; the weekly rotation still comes on Sunday.`
        : `The epic landmark standing in ${where} starts crumbling and another of the region's pool starts rising at a new spot; for 24 hours the map shows both, then only the new one stands. Kingdoms, bosses and castle positions stay; the weekly rotation still comes on Sunday.`,
      confirmLabel: "Reset landmarks"
    });
    if (!ok) return;
    setActiveAction("landmarks");
    setLandmarkError(null);
    setLandmarkResult(null);
    try {
      sound.playClick();
      const res = await onResetLandmarks(landmarkRegion || null, landmarksFinished);
      setLandmarkResult(res.message || "The landmarks were reset.");
      sound.playLevelUp();
    } catch (err: any) {
      setLandmarkError(err.message || "Failed to reset landmarks");
    } finally {
      setActiveAction(null);
    }
  };

  const handleMoveRealms = async () => {
    if (!onMoveRealms) return;
    const where = LANDMARK_REGIONS.find(([id]) => id === landmarkRegion)?.[1] ?? "every region";
    const ok = await dialog.confirm({
      tone: "warning",
      title: `Move the realm in ${where}?`,
      message: `The buffer realm standing in ${where} is taken off the map at once, and another of the region's pool stands at a fresh spot, full, at the stage its 28-day cycle is on. Marches on the old realm turn back.`,
      confirmLabel: "Move realms"
    });
    if (!ok) return;
    setActiveAction("realms");
    setLandmarkError(null);
    setLandmarkResult(null);
    try {
      sound.playClick();
      const res = await onMoveRealms(landmarkRegion || null);
      setLandmarkResult(res.message || "The realms moved.");
      sound.playLevelUp();
    } catch (err: any) {
      setLandmarkError(err.message || "Failed to move the realms");
    } finally {
      setActiveAction(null);
    }
  };

  const handleResetBackfill = async () => {
    const ok = await dialog.confirm({
      tone: "warning",
      title: "Reset historical backfill checkpoints?",
      message: `This clears all repository backfill checkpoints in SQLite. The background worker will resume walking all repositories and re-index historical commits down to ${backfillStatus?.startYear ?? 2020}. Existing commits are preserved.`,
      confirmLabel: "Reset backfill"
    });
    if (!ok) return;

    setActiveAction("backfill");
    setBackfillError(null);
    setBackfillResult(null);

    try {
      sound.playClick();
      const res = await onResetBackfill?.();
      setBackfillResult(res?.message || "Historical backfill checkpoints reset and re-indexing initiated!");
      sound.playLevelUp();
    } catch (err: any) {
      setBackfillError(err.message || "Failed to reset backfill checkpoints");
    } finally {
      setActiveAction(null);
    }
  };

  const handleResetWorld = async () => {
    const ok = await dialog.confirm({
      tone: "danger",
      title: "Reset the world map?",
      message: "This reassigns every developer to a civilization, resets all plot positions and districts, and regenerates the world map. It cannot be undone.",
      confirmLabel: "Reset world"
    });
    if (!ok) return;

    setActiveAction("world");
    setWorldError(null);
    setWorldResult(null);

    try {
      sound.playClick();
      const res = await onResetWorld();
      setWorldResult({
        success: true,
        message: res.message || "World map reset and kingdoms rebalanced successfully!",
        assigned: res.assigned
      });
      sound.playLevelUp();
    } catch (err: any) {
      setWorldError(err.message || "Failed to reset world map");
    } finally {
      setActiveAction(null);
    }
  };

  const handleRelayoutKingdoms = async () => {
    const ok = await dialog.confirm({
      tone: "warning",
      title: "Refresh kingdom positions?",
      message:
        "Every castle, and the Voidrift's NPC kingdoms, is laid out again on the world map so none overlap, hide behind the Archon's citadel or crowd the Voidrift's heart. Only positions change: civilizations, cities, buildings, treasuries, bosses and landmarks stay as they are. Armies already on the road finish their march to the old spot.",
      confirmLabel: "Refresh positions"
    });
    if (!ok) return;

    setActiveAction("positions");
    setWorldError(null);
    setWorldResult(null);
    try {
      sound.playClick();
      const res = await onRelayoutKingdoms();
      setWorldResult({ success: true, message: res.message || "Kingdom positions refreshed." });
      sound.playLevelUp();
    } catch (err: any) {
      setWorldError(err.message || "Failed to refresh kingdom positions");
    } finally {
      setActiveAction(null);
    }
  };

  const handleResetLedger = async () => {
    const ok = await dialog.confirm({
      tone: "danger",
      title: "Reset the treasury ledger?",
      message: "This clears all ledger history and allocation logs and resets developer balances. Special Overseer treasuries are kept. It cannot be undone.",
      confirmLabel: "Reset ledger"
    });
    if (!ok) return;

    setActiveAction("ledger");
    setLedgerError(null);
    setLedgerResult(null);

    try {
      sound.playClick();
      const res = await onResetLedger();
      setLedgerResult({
        success: true,
        message: res.message || "Treasury ledger and allocation logs cleared successfully!"
      });
      sound.playLevelUp();
    } catch (err: any) {
      setLedgerError(err.message || "Failed to reset treasury ledger");
    } finally {
      setActiveAction(null);
    }
  };

  const handleExportBackup = async () => {
    setActiveAction("backup-export");
    setBackupError(null);
    setBackupResult(null);
    try {
      sound.playClick();
      const { file, name } = await realmBackup.export();
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupResult(`Saved ${name}.`);
    } catch (err: any) {
      setBackupError(err.message || "Export failed");
    } finally {
      setActiveAction(null);
    }
  };

  const handleImportBackup = async (file: File) => {
    setBackupError(null);
    setBackupResult(null);
    let backup: any;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      setBackupError(`${file.name} isn't a JSON file.`);
      return;
    }
    const c = backup?.counts ?? {};
    const ok = await dialog.confirm({
      title: "Restore this Realm Backup?",
      message: `${file.name}${backup?.exportedAt ? `, saved ${new Date(backup.exportedAt).toLocaleString()}` : ""}: ${c.developers ?? 0} developers, ${c.emails ?? 0} linked emails, ${c.repoEmails ?? 0} per-repo matches, ${c.divisions ?? "?"} divisions, ${c.clients ?? "?"} clients, ${c.projects ?? "?"} projects, ${c.repos ?? "?"} repos placed, ${c.deeds ?? "?"} deeds. It merges into what is here and removes nothing: missing developers and branches are added, each listed email and per-repo match goes back to its developer with its commits, each listed repo goes to its project from the backup, and deeds already here are skipped. Sealed deeds count towards their buildings again.`,
      confirmLabel: "Restore"
    });
    if (!ok) return;
    setActiveAction("backup-import");
    try {
      sound.playClick();
      const res = await realmBackup.import(backup);
      setBackupResult(res.message);
      sound.playLevelUp();
    } catch (err: any) {
      setBackupError(err.message || "Import failed");
    } finally {
      setActiveAction(null);
    }
  };

  const handleTriggerHarvest = async () => {
    const ok = await dialog.confirm({
      tone: "warning",
      title: "Run a realm harvest now?",
      message: "This distributes Gold, Iron, Stone, Lumber and Food to every kingdom right away, based on current commits and pull requests.",
      confirmLabel: "Run harvest"
    });
    if (!ok) return;

    setActiveAction("harvest");
    setHarvestError(null);
    setHarvestResult(null);

    try {
      sound.playClick();
      const res = await onTriggerHarvest();
      setHarvestResult({
        success: true,
        message: res.message || "Realm resource harvest executed successfully!",
        summary: res.summary
      });
      sound.playLevelUp();
    } catch (err: any) {
      setHarvestError(err.message || "Failed to trigger realm harvest");
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <Modal
      open={open}
      hidden={hidden}
      onClose={onClose}
      size="lg"
      accentBorder="border-purple-500/60"
      headerClassName="bg-linear-to-b from-purple-950/80 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-500/60 flex items-center justify-center text-purple-300 shadow-lg shadow-purple-950/50">
            <ShieldAlert className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Realm Administration
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-500/40">
                ADMIN
              </span>
            </h2>
            <p className="text-xs text-slate-400">High-level realm orchestration, treasury ledger, and civilization controls</p>
          </div>
        </div>
      }
    >
      <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
        {/* System validations: always reachable, even when nothing is wrong */}
        {onOpenValidations && (
          <div className="p-4 rounded-xl border border-slate-700/80 bg-slate-900/80 flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                System Validations
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    validationWarnings > 0 ? "bg-amber-950/80 text-amber-300 border-amber-500/40" : "bg-emerald-950/80 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  {validationWarnings > 0 ? `${validationWarnings} WARNING${validationWarnings > 1 ? "S" : ""}` : "ALL CLEAR"}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Re-checks the realm (duplicate repositories, repos with no Scriptorium project, deeds waiting too long) and opens the review panel, including the ignore list of deleted duplicates you can restore.
              </p>
              {onOpenDeedReview && (
                <button
                  onClick={() => {
                    sound.playClick();
                    onOpenDeedReview();
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-700/50 bg-amber-950/40 text-amber-200 text-[11px] font-semibold hover:border-amber-500"
                >
                  <ScrollText className="w-3.5 h-3.5" /> Deeds to seal <span className="font-mono px-1.5 rounded-full bg-amber-500/20 border border-amber-500/40">{pendingDeeds}</span>
                </button>
              )}
              {onOpenOmens && (
                <button
                  onClick={() => {
                    sound.playClick();
                    onOpenOmens();
                  }}
                  className="mt-2 ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-sky-700/50 bg-indigo-950/40 text-sky-200 text-[11px] font-semibold hover:border-sky-500"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Omens <span className="font-mono px-1.5 rounded-full bg-sky-500/20 border border-sky-500/40">{newOmens}</span>
                </button>
              )}
            </div>
            <button
              onClick={() => {
                sound.playClick();
                onOpenValidations();
              }}
              className="self-center shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 border border-emerald-400/40 transition active:scale-95 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" /> Open
            </button>
          </div>
        )}

        {onOpenDevEmails && <DevEmailsCard unmatched={unmatchedEmails} onOpen={onOpenDevEmails} />}

        {/* Realm Backup: developers and their emails, the Scriptorium tree, repo placements and deeds, out to a file and back after a wipe */}
        <div className="p-4 rounded-xl border border-slate-700/80 bg-slate-900/80 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
              <DatabaseBackup className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                Realm Backup
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30">SAVE · RESTORE</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Saves the developers with their linked commit emails and per-repo matches (Developer Emails), the Scriptorium project tree (divisions, clients, projects), which repo sits in which project, and every deed report to a JSON file. Restore it after wiping the data to bring it all back: it names repos and people by their Git names, so it fits a fresh harvest, it only adds and never removes, and restoring the same file twice adds nothing. Older Scriptorium backups still restore.
              </p>
            </div>
          </div>

          {backupResult && (
            <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="font-semibold">{backupResult}</p>
            </div>
          )}

          {backupError && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{backupError}</span>
            </div>
          )}

          <input
            ref={backupFile}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleImportBackup(file);
            }}
          />
          <div className="pt-1 flex flex-wrap justify-end gap-2">
            <button
              onClick={() => backupFile.current?.click()}
              disabled={activeAction !== null}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-xs font-bold border border-slate-600 transition active:scale-95 cursor-pointer"
            >
              <Upload className={`w-4 h-4 ${activeAction === "backup-import" ? "animate-pulse" : ""}`} />
              <span>{activeAction === "backup-import" ? "Restoring…" : "Restore from file"}</span>
            </button>
            <button
              onClick={handleExportBackup}
              disabled={activeAction !== null}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-amber-950/50 border border-amber-400/40 transition active:scale-95 cursor-pointer"
            >
              <Download className={`w-4 h-4 ${activeAction === "backup-export" ? "animate-pulse" : ""}`} />
              <span>{activeAction === "backup-export" ? "Saving…" : "Download backup"}</span>
            </button>
          </div>
        </div>

        {/* Action 1: Harvest & Encounters (instant harvest, respawn roving encounters) */}
        <div className="p-4 rounded-xl border border-slate-700/80 bg-slate-900/80 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  Harvest & Encounters
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                    POOL · MOBS · TREASURE
                  </span>
                </h3>
              </div>
              <ul className="text-xs text-slate-400 list-disc list-inside mt-2 space-y-0.5">
                <li>
                  <span className="text-slate-300 font-medium">Execute Instant Harvest</span>: runs a harvest cycle now and shares the pool (<span className="text-amber-300 font-mono">1K Gold</span>, <span className="text-slate-300 font-mono">25K Iron</span>, <span className="text-cyan-300 font-mono">50K Stone</span>, <span className="text-emerald-300 font-mono">100K Lumber</span>, <span className="text-rose-300 font-mono">250K Food</span>) among all active developers by their commit & PR performance. Special Overseers are excluded.
                </li>
                <li>
                  <span className="text-slate-300 font-medium">Respawn Encounters Now</span>: rolls a fresh set of roving encounters: each of the four buffer zones gets a common, a likely second (common or uncommon) and a possible third, plus its own rare (50%) and epic (25%) chances (at least 4, about 12 on average). Everyone sees the new set within a few seconds; the regular respawn every <span className="text-rose-300 font-mono">{rovingWindowMinutes} min</span> (with every harvest) continues as usual.
                </li>
              </ul>
            </div>
          </div>

          {harvestResult && (
            <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{harvestResult.message}</p>
                {harvestResult.summary && (
                  <p className="text-emerald-300/80 font-mono text-[11px] mt-1">
                    Distributed: {harvestResult.summary.totalContributors ?? 0} contributors rewarded across all realms.
                  </p>
                )}
              </div>
            </div>
          )}

          {harvestError && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{harvestError}</span>
            </div>
          )}

          {respawnResult && (
            <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="font-semibold">{respawnResult}</p>
            </div>
          )}

          {respawnError && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{respawnError}</span>
            </div>
          )}

          <div className="pt-1 flex justify-end gap-2 flex-wrap">
            <button
              onClick={handleRespawn}
              disabled={activeAction !== null}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-rose-200 text-xs font-bold border border-rose-500/40 transition active:scale-95 cursor-pointer"
            >
              <Swords className={`w-4 h-4 ${activeAction === "respawn" ? "animate-pulse" : ""}`} />
              <span>{activeAction === "respawn" ? "Respawning…" : "Respawn Encounters Now"}</span>
            </button>
            <button
              onClick={handleTriggerHarvest}
              disabled={activeAction !== null}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 border border-emerald-400/40 transition active:scale-95 cursor-pointer"
            >
              <Sparkles className={`w-4 h-4 ${activeAction === "harvest" ? "animate-spin" : ""}`} />
              <span>{activeAction === "harvest" ? "Harvesting…" : "Execute Instant Harvest"}</span>
            </button>
          </div>
        </div>

        {/* World disasters: call one now (or warned of first), or end the one in force */}
        <DisasterAdminCard />

        {/* Action 2: Treasury & Improvements (refund improvements, reset the treasury ledger) */}
        <div className="p-4 rounded-xl border border-slate-700/80 bg-slate-900/80 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
              <Coins className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  Treasury & Improvements
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30">
                    REFUNDS & BALANCES
                  </span>
                </h3>
              </div>
              <ul className="text-xs text-slate-400 list-disc list-inside mt-2 space-y-0.5">
                {onResetKingdomUpgrades && (
                  <li>
                    <span className="text-slate-300 font-medium">Reset & Refund Improvements</span> <span className="text-[10px] font-mono text-red-300">100% REFUND</span>: strips every city improvement of one ruler, or of every ruler, and deposits the full price of every tier they own (base resources and rare gems) back into their treasury, with ledger entries they can see and a herald notice. Walls drop to the basic fence.
                  </li>
                )}
                <li>
                  <span className="text-slate-300 font-medium">Reset Treasury & Ledger</span>: clears every ledger entry and allocation log and sets each developer's resources back to their genesis values.
                </li>
                <li>
                  <span className="text-slate-300 font-medium">Special Overseers</span>: never affected; they keep their improvements at maximum and their sovereign stockpiles.
                </li>
              </ul>
            </div>
          </div>

          {upgradeResult && (
            <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="font-semibold">{upgradeResult}</p>
            </div>
          )}

          {upgradeError && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{upgradeError}</span>
            </div>
          )}

          {ledgerResult && (
            <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{ledgerResult.message}</p>
                <p className="text-emerald-300/80 text-[11px] mt-0.5">Fresh genesis records logged. Treasury ready for new accounting cycles.</p>
              </div>
            </div>
          )}

          {ledgerError && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{ledgerError}</span>
            </div>
          )}

          {onResetKingdomUpgrades && (
            <div className="pt-1 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end flex-wrap">
              <div className="min-w-0 sm:w-64">
                <Combobox searchable
                  size="sm"
                  options={[
                    ...(onResetAllKingdomUpgrades && upgradedKingdoms.length > 0 ? [{ value: ALL, label: `⚠️ All kingdoms`, hint: `${upgradedKingdoms.length} kingdoms · ${totalTiers} tiers` }] : []),
                    ...upgradedKingdoms.map((k) => ({ value: k.id, label: k.name, hint: `${tiersOf(k)} tiers` }))
                  ]}
                  value={upgradeTarget || null}
                  onChange={setUpgradeTarget}
                  disabled={upgradedKingdoms.length === 0}
                  placeholder={upgradedKingdoms.length ? "Choose a kingdom…" : "No kingdom has improvements"}
                  searchPlaceholder="Search kingdoms…"
                  ariaLabel="Kingdom to reset"
                />
              </div>
              <button
                onClick={handleResetUpgrades}
                disabled={activeAction !== null || !upgradeTarget}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-red-200 text-xs font-bold border border-red-500/40 transition active:scale-95 cursor-pointer"
              >
                <Hammer className={`w-4 h-4 ${activeAction === "upgrades" ? "animate-pulse" : ""}`} />
                <span>{activeAction === "upgrades" ? "Refunding…" : upgradeTarget === ALL ? "Reset & Refund All Kingdoms" : "Reset & Refund Improvements"}</span>
              </button>
            </div>
          )}

          <div className="pt-1 flex justify-end gap-2 flex-wrap">
            <button
              onClick={handleResetLedger}
              disabled={activeAction !== null}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-b from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-amber-950/50 border border-amber-400/40 transition active:scale-95 cursor-pointer"
            >
              <RotateCcw className={`w-4 h-4 ${activeAction === "ledger" ? "animate-spin" : ""}`} />
              <span>{activeAction === "ledger" ? "Resetting Ledger…" : "Reset Treasury & Ledger"}</span>
            </button>
          </div>
        </div>

        {/* Action 3: Refresh & Rebalance World Map */}
        <div className="p-4 rounded-xl border border-slate-700/80 bg-slate-900/80 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 shrink-0 mt-0.5">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  Refresh & Rebalance World Map
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-500/30">
                    REALM REGEN
                  </span>
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Rerenders and reassigns all users to kingdoms using the 4-normal + Nethergarde Voidrift formula, resets all building plot positioning and district selections, and regenerates the world map.
              </p>
              <ul className="text-xs text-slate-400 list-disc list-inside mt-2 space-y-0.5">
                <li><span className="text-slate-300 font-medium">Nethergarde Voidrift</span>: Receives all Special Users (managers/trackers at max level) + remainder developers.</li>
                <li><span className="text-slate-300 font-medium">Normal Civilizations</span>: Human, Elf, Dwarf, and Orc each receive an equal random allocation of developers.</li>
                <li><span className="text-slate-300 font-medium">City Plans</span>: Saved plot swaps and layouts are cleared so districts reset cleanly.</li>
              </ul>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                <span className="text-slate-300 font-medium">Refresh Kingdom Positions</span> only moves castles on the map so none overlap or hide behind the Archon's citadel; everything else stays.
              </p>
              {onResetLandmarks && (
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  <span className="text-slate-300 font-medium">🗿 Reset Landmarks</span> rotates the epic landmark now in every region (or one): the old one crumbles while a new one from the region's pool of 6 rises at a fresh spot for 24 hours, or tick <span className="text-slate-300">Skip to finished</span> to have it stand at once. Kingdoms, bosses, castles and the legendary landmarks stay; the weekly rotation still comes on Sunday.
                </p>
              )}
              {onMoveRealms && (
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  <span className="text-slate-300 font-medium">🚩 Move Realms</span> moves the buffer realm now in every region (or one): the old one crumbles for 24 hours and another of the region's 3 stands at a fresh spot, full, at the stage of its 28-day cycle.
                </p>
              )}
            </div>
          </div>

          {worldResult && (
            <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{worldResult.message}</p>
                {worldResult.assigned && (
                  <p className="text-emerald-300/80 font-mono text-[11px] mt-1">
                    Allocations — Human: {worldResult.assigned.human}, Elf: {worldResult.assigned.elf}, Dwarf: {worldResult.assigned.dwarf}, Orc: {worldResult.assigned.orc}, Nethergarde: {worldResult.assigned.arcane}
                  </p>
                )}
              </div>
            </div>
          )}

          {worldError && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{worldError}</span>
            </div>
          )}

          {landmarkResult && (
            <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="font-semibold">{landmarkResult}</p>
            </div>
          )}

          {landmarkError && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{landmarkError}</span>
            </div>
          )}

          {onResetLandmarks && (
            <div className="pt-1 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end flex-wrap">
              <div className="min-w-0 sm:w-56">
                <Combobox
                  size="sm"
                  options={[{ value: "", label: "Every region" }, ...LANDMARK_REGIONS.map(([id, name]) => ({ value: id, label: name }))]}
                  value={landmarkRegion}
                  onChange={setLandmarkRegion}
                  ariaLabel="Region to reset"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input type="checkbox" checked={landmarksFinished} onChange={(e) => setLandmarksFinished(e.target.checked)} className="accent-purple-500" />
                Skip to finished
              </label>
              <button
                onClick={handleResetLandmarks}
                disabled={activeAction !== null}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-purple-200 text-xs font-bold border border-purple-500/40 transition active:scale-95 cursor-pointer"
              >
                <Landmark className={`w-4 h-4 ${activeAction === "landmarks" ? "animate-pulse" : ""}`} />
                <span>{activeAction === "landmarks" ? "Rotating…" : "Reset Landmarks"}</span>
              </button>
              {onMoveRealms && (
                <button
                  onClick={handleMoveRealms}
                  disabled={activeAction !== null}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-purple-200 text-xs font-bold border border-purple-500/40 transition active:scale-95 cursor-pointer"
                >
                  <Flag className={`w-4 h-4 ${activeAction === "realms" ? "animate-pulse" : ""}`} />
                  <span>{activeAction === "realms" ? "Moving…" : "Move Realms"}</span>
                </button>
              )}
            </div>
          )}

          <div className="pt-1 flex justify-end gap-2 flex-wrap">
            <button
              onClick={handleRelayoutKingdoms}
              disabled={activeAction !== null}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-purple-200 text-xs font-bold border border-purple-500/40 transition active:scale-95 cursor-pointer"
            >
              <MapPinned className={`w-4 h-4 ${activeAction === "positions" ? "animate-pulse" : ""}`} />
              <span>{activeAction === "positions" ? "Refreshing Positions…" : "Refresh Kingdom Positions"}</span>
            </button>
            <button
              onClick={handleResetWorld}
              disabled={activeAction !== null}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-b from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-purple-950/50 border border-purple-400/40 transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${activeAction === "world" ? "animate-spin" : ""}`} />
              <span>{activeAction === "world" ? "Rebalancing World…" : "Execute Reset & Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Action: Reset Historical Backfill */}
        <div className="p-4 rounded-xl border border-slate-700/80 bg-slate-900/80 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0 mt-0.5">
              <History className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  Reset Historical Backfill
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                    COMMIT ARCHIVE
                  </span>
                </h3>
                {backfillStatus && (
                  <span
                    className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                      backfillStatus.isRunning
                        ? "bg-amber-950/60 text-amber-300 border-amber-500/40 animate-pulse"
                        : backfillStatus.percent >= 100
                          ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40"
                          : "bg-slate-800 text-slate-300 border-slate-600"
                    }`}
                  >
                    {backfillStatus.isRunning ? "SYNCING…" : `${backfillStatus.percent}% INDEXED`}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Clears all repository backfill checkpoints in SQLite. The background worker will resume walking all repositories and re-index historical commits down to{" "}
                <span className="text-cyan-300 font-mono">{backfillStatus?.startYear ?? 2020}</span> with a gentle pause between repos. Existing commits are preserved.
              </p>

              {backfillStatus && (
                <div className="mt-2.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-300">
                  <span>
                    Indexed: <span className="text-cyan-300 font-bold">{backfillStatus.backfilled}</span> / {backfillStatus.total} repos
                  </span>
                  <span>
                    Commits in DB: <span className="text-amber-300 font-bold">{backfillStatus.totalCommits.toLocaleString()}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {backfillResult && (
            <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="font-semibold">{backfillResult}</p>
            </div>
          )}

          {backfillError && (
            <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{backfillError}</span>
            </div>
          )}

          <div className="pt-1 flex justify-end">
            <button
              onClick={handleResetBackfill}
              disabled={activeAction !== null}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-b from-cyan-600 to-cyan-800 hover:from-cyan-500 hover:to-cyan-700 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-cyan-950/50 border border-cyan-400/40 transition active:scale-95 cursor-pointer"
            >
              <History className={`w-4 h-4 ${activeAction === "backfill" ? "animate-spin" : ""}`} />
              <span>{activeAction === "backfill" ? "Resetting Backfill…" : "Reset Historical Backfill"}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
