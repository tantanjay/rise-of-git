import { useState } from "react";
import { Modal } from "./Modal";
import { AdminValidationWarning, DuplicateRepoGroup, DuplicateRepoItem, IgnoredRepoCommitCheck, IgnoredRepoRecord } from "@/types";
import { Feather, AlertTriangle, Trash2, CheckCircle2, ShieldAlert, Copy, RefreshCw, Info, RotateCcw, Ban, SearchCheck, GitCommitHorizontal, CircleSlash, CloudOff, AlertCircle } from "lucide-react";
import { useDialog } from "./Dialog";
import { sound } from "@/hooks/useSound";

interface AdminWarningsModalProps {
  open: boolean;
  onClose: () => void;
  warnings: AdminValidationWarning[];
  ignoredRepos?: IgnoredRepoRecord[];
  onDeleteRepo: (repoId: string) => Promise<any>;
  onDeleteAllDuplicates?: (repoIds?: string[]) => Promise<any>;
  onRestoreRepo?: (repoId: string) => Promise<any>;
  /** Asks Git whether ignored repos have commits now (all when no ids given) */
  onCheckIgnoredCommits?: (repoIds?: string[]) => Promise<any>;
  onRefresh?: () => void;
  /** Opens the Scriptorium's Unsorted bucket (repos with no project) */
  onOpenUnsorted?: () => void;
  /** Opens the deeds awaiting a seal */
  onOpenDeedReview?: () => void;
}

export function AdminWarningsModal({
  open,
  onClose,
  warnings,
  ignoredRepos = [],
  onDeleteRepo,
  onDeleteAllDuplicates,
  onRestoreRepo,
  onCheckIgnoredCommits,
  onRefresh,
  onOpenUnsorted,
  onOpenDeedReview
}: AdminWarningsModalProps) {
  const [activeTab, setActiveTab] = useState<"warnings" | "ignored">("warnings");
  const [selectedCategory, setSelectedCategory] = useState<string>(() => warnings[0]?.category || "duplicate_repos");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [checkingCommits, setCheckingCommits] = useState(false);
  /** Repos still waiting in the current check run (their old tags are stale) */
  const [pendingCheckIds, setPendingCheckIds] = useState<Set<string>>(() => new Set());
  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number } | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const dialog = useDialog();

  const activeWarning = warnings.find((w) => w.category === selectedCategory) || warnings[0];

  const handleDelete = async (repo: DuplicateRepoItem) => {
    if (!repo.canDelete) return;

    const ok = await dialog.confirm({
      tone: "danger",
      title: `Delete duplicate "${repo.fullName}"?`,
      message: `This will permanently remove the Level 1 duplicate repository record (${repo.name}) from SQLite and add it to the sync ignore list. Background sync will not re-add it unless you restore it. The primary repository with all its commits will remain completely safe.`,
      confirmLabel: "Delete repository"
    });
    if (!ok) return;

    setDeletingId(repo.id);
    setActionError(null);
    setActionResult(null);

    try {
      sound.playClick();
      const res = await onDeleteRepo(repo.id);
      sound.playLevelUp();
      setActionResult(res.message || `Deleted duplicate repository ${repo.fullName} and added to sync ignore list.`);
      onRefresh?.();
    } catch (err: any) {
      setActionError(err.message || "Failed to delete repository");
    } finally {
      setDeletingId(null);
    }
  };

  const duplicateGroups: DuplicateRepoGroup[] = activeWarning?.details?.groups || [];
  const totalWarningCount = warnings.reduce((sum, w) => sum + (w.severity === "info" ? 0 : w.count), 0);
  const allDeletableRepos = duplicateGroups.flatMap((g) => g.repos.filter((r) => r.canDelete));

  const handleDeleteAll = async (targetRepos: DuplicateRepoItem[] = allDeletableRepos, actionId = "all") => {
    if (targetRepos.length === 0) return;

    const ok = await dialog.confirm({
      tone: "danger",
      title: actionId.startsWith("group:")
        ? `Delete ${targetRepos.length} duplicate${targetRepos.length === 1 ? "" : "s"} of "${actionId.slice(6)}"?`
        : `Delete all ${targetRepos.length} duplicate repositories?`,
      message: `This will permanently remove all ${targetRepos.length} Level 1 / 0-commit duplicate repositories from SQLite and add them to the sync exclusion list. Background sync will not re-add them unless you restore them. All primary repositories with active commits will remain completely safe.`,
      confirmLabel: `Delete all ${targetRepos.length} duplicates`
    });
    if (!ok) return;

    setDeletingId(actionId);
    setActionError(null);
    setActionResult(null);

    try {
      sound.playClick();
      const ids = targetRepos.map((r) => r.id);
      let res;
      if (onDeleteAllDuplicates) {
        res = await onDeleteAllDuplicates(ids);
      } else {
        for (const r of targetRepos) {
          await onDeleteRepo(r.id);
        }
        res = { message: `Deleted ${targetRepos.length} duplicate repositories successfully.` };
      }
      sound.playLevelUp();
      setActionResult(res.message || `Deleted ${targetRepos.length} duplicate repositories and added them to sync ignore list.`);
      onRefresh?.();
    } catch (err: any) {
      setActionError(err.message || "Failed to delete duplicate repositories");
    } finally {
      setDeletingId(null);
    }
  };

  // A few repos per request, so rows fill in as Git answers instead of after one long wait
  const handleCheckCommits = async () => {
    if (!onCheckIgnoredCommits) return;
    const ids = ignoredRepos.map((r) => r.id);
    const BATCH = 4;
    setCheckingCommits(true);
    setActionError(null);
    setActionResult(null);
    setPendingCheckIds(new Set(ids));
    setCheckProgress({ done: 0, total: ids.length });
    let withCommits = 0;
    let failed = 0;
    try {
      sound.playClick();
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const res = await onCheckIgnoredCommits(batch);
        withCommits += Number(res.withCommits || 0);
        failed += Number(res.failed || 0);
        setPendingCheckIds((prev) => {
          const next = new Set(prev);
          for (const id of batch) next.delete(id);
          return next;
        });
        setCheckProgress({ done: Math.min(i + BATCH, ids.length), total: ids.length });
      }
      const own = withCommits === 1 ? "has commits of its own" : "have commits of their own";
      setActionResult(`Checked ${ids.length} ignored repositories: ${withCommits} ${own} now${failed ? `, ${failed} could not be checked` : ""}.`);
    } catch (err: any) {
      setActionError(err.message || "Failed to check ignored repositories");
    } finally {
      setCheckingCommits(false);
      setPendingCheckIds(new Set());
      setCheckProgress(null);
    }
  };

  const checkedRepos = ignoredRepos.filter((r) => r.commitCheck);
  const reposWithCommits = ignoredRepos.filter((r) => r.commitCheck?.status === "has_commits" && !pendingCheckIds.has(r.id)).length;
  const lastCheckedAt = checkedRepos.reduce<string | null>((latest, r) => (!latest || r.commitCheck!.checkedAt > latest ? r.commitCheck!.checkedAt : latest), null);

  const handleRestore = async (repo: IgnoredRepoRecord) => {
    if (!onRestoreRepo) return;

    const ok = await dialog.confirm({
      tone: "info",
      title: `Restore "${repo.fullName}"?`,
      message: `This will remove "${repo.fullName}" from the sync ignore list. On the next Git sync cycle, it will be re-discovered and registered in the realm if it still exists in Git.`,
      confirmLabel: "Restore repository"
    });
    if (!ok) return;

    setRestoringId(repo.id);
    setActionError(null);
    setActionResult(null);

    try {
      sound.playClick();
      const res = await onRestoreRepo(repo.id);
      sound.playLevelUp();
      setActionResult(res.message || `Restored ${repo.fullName} successfully. It will sync on the next cycle.`);
      onRefresh?.();
    } catch (err: any) {
      setActionError(err.message || "Failed to restore repository");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      accentBorder="border-amber-500/60"
      headerClassName="bg-linear-to-b from-amber-950/80 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-500/60 flex items-center justify-center text-amber-300 shadow-lg shadow-amber-950/50">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Admin System Warnings & Validations
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-500/40">
                ADMIN
              </span>
            </h2>
            <p className="text-xs text-slate-400">Realm integrity diagnostics, duplicate repositories, and sync exclusions</p>
          </div>
        </div>
      }
    >
      <div className="p-4 sm:p-6 space-y-4 max-h-[80vh] flex flex-col overflow-hidden">
        {/* Navigation Tabs: Warnings vs Ignored Repositories */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab("warnings");
              setActionResult(null);
              setActionError(null);
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
              activeTab === "warnings"
                ? "bg-amber-500/20 text-amber-200 border border-amber-500/40"
                : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <span>⚠️ Validation Warnings</span>
            <span className="px-1.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
              {totalWarningCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("ignored");
              setActionResult(null);
              setActionError(null);
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
              activeTab === "ignored"
                ? "bg-purple-500/20 text-purple-200 border border-purple-500/40"
                : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Ban className="w-3.5 h-3.5 text-purple-300" />
            <span>Ignored / Deleted Repos</span>
            <span className="px-1.5 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold">
              {ignoredRepos.length}
            </span>
          </button>
        </div>

        {/* Sub-category selector within warnings if multiple categories exist */}
        {activeTab === "warnings" && warnings.length > 1 && (
          <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2.5 overflow-x-auto shrink-0">
            {warnings.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(w.category);
                  setActionResult(null);
                  setActionError(null);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer shrink-0 ${
                  selectedCategory === w.category
                    ? "bg-amber-500/30 text-amber-200 border border-amber-500/50"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                <span>{w.title}</span>
                <span className="text-[10px] opacity-80">({w.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Global Feedback Banners */}
        {actionResult && (
          <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="font-semibold">{actionResult}</p>
          </div>
        )}

        {actionError && (
          <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {activeTab === "warnings" ? (
            (!activeWarning || warnings.length === 0) ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="font-semibold text-slate-200">All system validation checks passed!</p>
                <p className="text-slate-500 mt-1">No duplicates or integrity anomalies detected across the realm.</p>
              </div>
            ) : activeWarning.category === "duplicate_repos" ? (
              <div className="space-y-4">
                {/* Informational Header Card */}
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/30 text-amber-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <Info className="w-4 h-4 shrink-0" />
                    <span>Duplicate Repository Detection & Deletion</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    These repository names exist across multiple namespaces (e.g. both inside an organization and as a personal repository). Because commit hashes are uniquely indexed in SQLite, all commits were permanently registered to whichever repository was synced first. The secondary copy has <strong>0 commits and remains at Level 1</strong>.
                  </p>
                  <p className="text-amber-300/80 font-mono text-[10px]">
                    🛡️ Safety Guard: Only fully backfilled Level 1 duplicates with 0 commits can be deleted, and the last copy of each name is always kept. Deleting adds the repository to the sync ignore table so Git will not re-add it until you restore it.
                  </p>
                  {allDeletableRepos.length > 0 && (
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-amber-500/20">
                      <span className="text-amber-200 text-[11px] font-mono">
                        ⚠️ Found <strong>{allDeletableRepos.length}</strong> deletable duplicate Level 1 repositories ready for cleanup.
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteAll(allDeletableRepos)}
                        disabled={deletingId !== null}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition shadow cursor-pointer shrink-0"
                        title={`Delete all ${allDeletableRepos.length} duplicate repositories across all groups`}
                      >
                        <Trash2 className={`w-3.5 h-3.5 ${deletingId === "all" ? "animate-spin" : ""}`} />
                        <span>Delete All ({allDeletableRepos.length}) Duplicates</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Duplicate Clusters List */}
                <div className="space-y-3">
                  {duplicateGroups.map((group) => (
                    <div
                      key={group.name}
                      className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/80 space-y-2.5 shadow-md"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <div className="flex items-center gap-2">
                          <Copy className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-mono font-bold text-slate-100 text-xs">{group.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {group.repos.length} copies
                          </span>
                        </div>
                        {group.hasDeletable && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-rose-300 bg-rose-950/60 border border-rose-500/30 px-2 py-0.5 rounded-md font-semibold">
                              DELETABLE DUPLICATE DETECTED
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteAll(group.repos.filter((r) => r.canDelete), `group:${group.name}`)}
                              disabled={deletingId !== null}
                              className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-[10px] font-mono transition shadow cursor-pointer shrink-0"
                              title={`Delete the ${group.repos.filter((r) => r.canDelete).length} empty duplicate(s) of "${group.name}"`}
                            >
                              <Trash2 className={`w-3 h-3 ${deletingId === `group:${group.name}` ? "animate-spin" : ""}`} />
                              <span>Delete Group ({group.repos.filter((r) => r.canDelete).length})</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {group.repos.map((repo) => (
                          <div
                            key={repo.id}
                            className={`p-3 rounded-lg border text-xs flex flex-col justify-between gap-2.5 transition ${
                              repo.canDelete
                                ? "border-rose-500/30 bg-rose-950/20 hover:border-rose-500/50"
                                : "border-slate-800 bg-slate-950/60"
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-semibold text-slate-200 truncate" title={repo.fullName}>
                                  {repo.fullName}
                                </span>
                                <span
                                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                    repo.canDelete
                                      ? "bg-rose-950/80 text-rose-300 border border-rose-500/40"
                                      : "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                                  }`}
                                >
                                  {repo.canDelete ? "DUPLICATE" : "ACTIVE"}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                                <span>Owner: <strong className="text-slate-300">{repo.ownerName || repo.ownerLogin}</strong></span>
                                <span className="text-amber-300 font-bold">
                                  Lv.{repo.level} · {repo.commitsCount} commits
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] font-mono">
                              <span className="text-slate-500 truncate">
                                ID: {repo.id}
                              </span>
                              {repo.canDelete ? (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(repo)}
                                  disabled={deletingId !== null}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold transition shadow cursor-pointer shrink-0"
                                  title="Delete this duplicate Level 1 repository"
                                >
                                  <Trash2 className={`w-3.5 h-3.5 ${deletingId === repo.id ? "animate-spin" : ""}`} />
                                  <span>{deletingId === repo.id ? "Deleting…" : "Delete Repo"}</span>
                                </button>
                              ) : (
                                <span className="text-slate-500 italic text-[11px]">
                                  Protected (Active)
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : activeWarning.category === "unsorted_repos" || activeWarning.category === "stale_deeds" ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-amber-700/40 bg-amber-950/20 text-xs space-y-2">
                  <div className="font-bold text-amber-200 flex items-center gap-1.5"><Feather className="w-4 h-4" /> {activeWarning.title}</div>
                  <p className="text-slate-300">{activeWarning.summary}</p>
                  {activeWarning.category === "unsorted_repos" ? (
                    <>
                      <p className="text-slate-500 text-[11px]">Listed here for the record; it doesn&apos;t count towards the warnings banner.</p>
                      {onOpenUnsorted && (
                        <button onClick={onOpenUnsorted} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs">
                          Open the Unsorted bucket
                        </button>
                      )}
                    </>
                  ) : (
                    onOpenDeedReview && (
                      <button onClick={onOpenDeedReview} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs">
                        Open the deeds to seal
                      </button>
                    )
                  )}
                </div>
                <div className="space-y-1">
                  {activeWarning.category === "unsorted_repos"
                    ? (activeWarning.details?.repos ?? []).slice(0, 100).map((r: { id: string; fullName: string }) => (
                        <div key={r.id} className="px-2.5 py-1 rounded bg-slate-900/70 border border-slate-800 font-mono text-[11px] text-slate-300 truncate">{r.fullName}</div>
                      ))
                    : (activeWarning.details?.deeds ?? []).map((d: { id: number; userName: string; title: string; day: string; xp: number }) => (
                        <div key={d.id} className="px-2.5 py-1 rounded bg-slate-900/70 border border-slate-800 text-[11px] text-slate-300 flex gap-2">
                          <span className="font-mono text-slate-500">{d.day}</span>
                          <span className="text-amber-200">{d.userName}</span>
                          <span className="truncate flex-1">{d.title}</span>
                          <span className="font-mono text-amber-300">+{d.xp.toFixed(1)}</span>
                        </div>
                      ))}
                  {activeWarning.category === "unsorted_repos" && (activeWarning.details?.repos?.length ?? 0) > 100 && (
                    <div className="text-[11px] text-slate-500">…and {activeWarning.details.repos.length - 100} more.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-300 text-xs">
                <h4 className="font-bold text-slate-100 mb-1">{activeWarning.title}</h4>
                <p className="text-slate-400 text-xs">{activeWarning.summary}</p>
              </div>
            )
          ) : (
            /* Ignored / Deleted Repositories View */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-950/20 text-purple-200 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-purple-300">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Ignored & Excluded Repositories</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  These repositories were deleted by an administrator and are permanently excluded from Git background sync. Git will not re-insert them into the kingdom or allocate city plots for them.
                </p>
                <p className="text-purple-300/80 font-mono text-[10px]">
                  ♻️ If you ever want Git to re-index a repository, click <strong>Restore</strong> and it will be picked up on the next sync cycle.
                </p>
              </div>

              {ignoredRepos.length > 0 && onCheckIgnoredCommits && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-900/60">
                  <div className="text-[11px] font-mono text-slate-400 min-w-0">
                    {checkProgress ? (
                      <div className="space-y-1.5">
                        <span className="text-slate-300">
                          Checking Git… {checkProgress.done} / {checkProgress.total}
                          {reposWithCommits > 0 ? <span className="text-emerald-300 font-bold"> · {reposWithCommits} with commits of their own so far</span> : null}
                        </span>
                        <div className="h-1 w-48 max-w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-400/80 transition-all duration-300"
                            style={{ width: `${Math.round((checkProgress.done / Math.max(1, checkProgress.total)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : lastCheckedAt ? (
                      <>
                        <span className={reposWithCommits > 0 ? "text-emerald-300 font-bold" : "text-slate-300"}>
                          {reposWithCommits} of {ignoredRepos.length} ha{reposWithCommits === 1 ? "s" : "ve"} commits of {reposWithCommits === 1 ? "its" : "their"} own now
                        </span>
                        <span className="text-slate-500"> · last checked {new Date(lastCheckedAt).toLocaleString()}</span>
                      </>
                    ) : (
                      <span>Not checked yet: ask Git whether any of these repos has commits the realm hasn't counted elsewhere.</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckCommits}
                    disabled={checkingCommits || restoringId !== null}
                    className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 text-slate-100 font-bold text-xs transition cursor-pointer"
                    title="Ask Git for each ignored repository's commits and compare them with the commits the realm already holds"
                  >
                    <SearchCheck className={`w-3.5 h-3.5 ${checkingCommits ? "animate-pulse" : ""}`} />
                    <span>{checkingCommits ? "Checking…" : "Check for commits"}</span>
                  </button>
                </div>
              )}

              {ignoredRepos.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs space-y-1">
                  <Ban className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold text-slate-400">No repositories are currently ignored.</p>
                  <p className="text-slate-500">Deleted duplicate repositories will be archived here to prevent background sync from re-adding them.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {ignoredRepos.map((repo) => (
                    <div
                      key={repo.id}
                      className={`p-3.5 rounded-xl border ${repo.commitCheck?.status === "has_commits" && !pendingCheckIds.has(repo.id) ? "border-emerald-500/40" : "border-slate-800"} bg-slate-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Ban className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span className="font-mono font-bold text-slate-200 text-xs truncate" title={repo.fullName}>
                            {repo.fullName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-500/30 shrink-0">
                            {repo.reason}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                          <span>Owner: <strong className="text-slate-300">{repo.ownerLogin}</strong></span>
                          <span>•</span>
                          <span>Excluded: {new Date(repo.deletedAt).toLocaleString()}</span>
                        </div>
                        {pendingCheckIds.has(repo.id) ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-slate-800/40 text-slate-500 border-slate-700 animate-pulse">
                            <SearchCheck className="w-3 h-3 shrink-0" />
                            <span>Waiting for Git…</span>
                          </span>
                        ) : (
                          repo.commitCheck && <CommitCheckBadge check={repo.commitCheck} />
                        )}
                      </div>

                      <div className="shrink-0 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => handleRestore(repo)}
                          disabled={restoringId !== null}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs transition shadow cursor-pointer"
                          title="Restore this repository to allow Git sync to fetch it"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${restoringId === repo.id ? "animate-spin" : ""}`} />
                          <span>{restoringId === repo.id ? "Restoring…" : "Restore Repo"}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-scan Realm</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** What the last commit check found for one ignored repo */
function CommitCheckBadge({ check }: { check: IgnoredRepoCommitCheck }) {
  const checked = `checked ${new Date(check.checkedAt).toLocaleString()}`;
  const base = "inline-flex items-center gap-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded border max-w-full";
  const date = check.latestCommitAt ? new Date(check.latestCommitAt).toLocaleDateString() : null;
  if (check.status === "has_commits") {
    const shared = check.commitCount - check.newCommitCount;
    return (
      <span
        className={`${base} bg-emerald-950/60 text-emerald-300 border-emerald-500/40`}
        title={`${check.newCommitCount} commit(s) no repo in the realm holds${shared > 0 ? `, ${shared} more already counted under ${check.sharedWith}` : ""} · ${checked}`}
      >
        <GitCommitHorizontal className="w-3 h-3 shrink-0" />
        <span className="truncate">
          Has new commits: {check.newCommitCount.toLocaleString()}
          {date ? ` · latest ${date}` : ""}
        </span>
      </span>
    );
  }
  if (check.status === "shared") {
    return (
      <span
        className={`${base} bg-slate-800/60 text-slate-400 border-slate-700`}
        title={`All ${check.commitCount} of its commits are already counted under ${check.sharedWith ?? "another repo"} · ${checked}`}
      >
        <Copy className="w-3 h-3 shrink-0" />
        <span className="truncate">No new commits · same history as {check.sharedWith ?? "another repo"}</span>
      </span>
    );
  }
  if (check.status === "empty") {
    return (
      <span className={`${base} bg-slate-800/60 text-slate-400 border-slate-700`} title={checked}>
        <CircleSlash className="w-3 h-3 shrink-0" />
        <span>Still 0 commits</span>
      </span>
    );
  }
  if (check.status === "missing") {
    return (
      <span className={`${base} bg-amber-950/50 text-amber-300 border-amber-500/30`} title={checked}>
        <CloudOff className="w-3 h-3 shrink-0" />
        <span>No longer in Git</span>
      </span>
    );
  }
  return (
    <span className={`${base} bg-red-950/50 text-red-300 border-red-500/30`} title={`${check.error || "Git did not answer"} · ${checked}`}>
      <AlertCircle className="w-3 h-3 shrink-0" />
      <span>Check failed</span>
    </span>
  );
}
