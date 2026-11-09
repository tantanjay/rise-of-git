import { useEffect, useMemo, useState } from "react";
import { Mail, Search, X, CheckCircle2, AlertTriangle, Link2, Users, ChevronRight, FolderGit2 } from "lucide-react";
import { Modal } from "./Modal";
import { Combobox, ComboOption } from "./Combobox";
import { useDialog } from "./Dialog";
import { sound } from "@/hooks/useSound";
import { API_BASE } from "@/config";
import { DevEmail, DeveloperKingdom, UnmatchedCommitEmail } from "@/types";
import { fetchUnmatchedEmails } from "@/utils/unmatchedEmails";

type EmailResult = Promise<{ message: string; emails: DevEmail[] }>;
/** With repoIds, only the email's commits in those repos */
type EmailAssign = (devId: string, email: string, repoIds?: string[]) => EmailResult;
/** With repoId, only that per-repo match */
type EmailUnassign = (devId: string, email: string, repoId?: string) => EmailResult;

interface DevEmailsModalProps {
  open: boolean;
  onClose: () => void;
  kingdoms: DeveloperKingdom[];
  onAssign: EmailAssign;
  onUnassign: EmailUnassign;
  /** Called with the unmatched count whenever the list is re-read (the admin card's badge) */
  onUnmatchedCount?: (count: number) => void;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

const smallBtn = "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

function Result({ ok, error }: { ok: string | null; error: string | null }) {
  if (ok)
    return (
      <div className="p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <p className="font-semibold">{ok}</p>
      </div>
    );
  if (error)
    return (
      <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
        <span>{error}</span>
      </div>
    );
  return null;
}

/** Runs one change at a time and keeps its outcome for the Result line */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ message: string }>) => {
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      sound.playClick();
      setOk((await fn()).message);
      return true;
    } catch (err: any) {
      setError(err.message || "That didn't work");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, ok, error, run };
}

const dayOf = (iso: string) => (iso ? iso.slice(0, 10) : "");

/** Every commit email no developer owns: pick the developer on each row and Match (the whole email, or only the ticked repos) */
function UnmatchedTab({ unmatched, devOptions, onAssign, reload }: { unmatched: UnmatchedCommitEmail[] | null; devOptions: ComboOption[]; onAssign: EmailAssign; reload: () => Promise<void> }) {
  const act = useAction();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Record<string, string>>({});
  const [matching, setMatching] = useState<string | null>(null);
  // Ticked repo ids per email: Match then covers only those repos
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const pick = (email: string, repoId: string, on: boolean) =>
    setPicked((p) => {
      const rest = (p[email] ?? []).filter((r) => r !== repoId);
      return { ...p, [email]: on ? [...rest, repoId] : rest };
    });
  // Rows whose repo list is open (all closed at first)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (email: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = unmatched ?? [];
  const shown = list.filter((u) => words.every((w) => `${u.email} ${u.names ?? ""} ${u.repos.map((r) => r.repo).join(" ")}`.toLowerCase().includes(w)));
  const total = list.reduce((sum, u) => sum + u.commits, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 leading-relaxed">
        Commit emails no developer owns yet ({list.length} emails, {total} commits): a laptop's default email, a personal address, a GitHub <span className="font-mono">noreply</span>. Pick who made them and press <span className="text-slate-200 font-semibold">Match</span>: every commit under the email becomes theirs at once, and every future sync keeps it.
        A shared email (several people's commits under one address): open its repos, tick the ones that are this developer's, and Match gives them only those; the other repos stay here.
      </p>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emails, author names or repos…"
          aria-label="Search unmatched emails"
          className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
        />
      </div>
      <Result ok={act.ok} error={act.error} />
      <div className="space-y-1">
        {unmatched === null && <div className="text-[11px] text-slate-500">Loading…</div>}
        {unmatched !== null && list.length === 0 && <div className="text-[11px] text-emerald-300">Every commit email is matched to a developer.</div>}
        {shown.slice(0, 300).map((u) => {
          // Only ticks on repos still listed count (a repo matched since drops out)
          const ticked = (picked[u.email] ?? []).filter((id) => u.repos.some((r) => r.repoId === id));
          return (
          <div key={u.email} className="rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 px-2.5 py-1.5">
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-mono text-slate-200 truncate">{u.email}</span>
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500 min-w-0">
                  <button
                    onClick={() => toggle(u.email)}
                    aria-expanded={expanded.has(u.email)}
                    aria-label={`${expanded.has(u.email) ? "Hide" : "Show"} repos of ${u.email}`}
                    className="inline-flex items-center gap-0.5 shrink-0 text-sky-300/80 hover:text-sky-200 cursor-pointer"
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform ${expanded.has(u.email) ? "rotate-90" : ""}`} />
                    {u.repos.length} {u.repos.length === 1 ? "repo" : "repos"}
                  </button>
                  <span className="truncate">
                    · {u.commits} commits{u.names ? ` · by ${u.names.split(",").join(", ")}` : ""}
                    {u.lastCommit ? ` · last ${dayOf(u.lastCommit)}` : ""}
                  </span>
                </span>
              </span>
              <div className="flex gap-1.5 sm:w-80 shrink-0">
                <div className="flex-1 min-w-0">
                  <Combobox
                    searchable
                    size="sm"
                    options={devOptions}
                    value={target[u.email] || null}
                    onChange={(v) => setTarget((t) => ({ ...t, [u.email]: v }))}
                    placeholder="Match to developer…"
                    searchPlaceholder="Search developers…"
                    ariaLabel={`Developer for ${u.email}`}
                  />
                </div>
                <button
                  className={`${smallBtn} bg-sky-600 hover:bg-sky-500 border-sky-400/50 text-white`}
                  disabled={!target[u.email] || act.busy}
                  title={ticked.length ? `Match only the ${ticked.length} ticked ${ticked.length === 1 ? "repo" : "repos"}` : "Match every commit under this email"}
                  onClick={async () => {
                    setMatching(u.email);
                    if (await act.run(() => onAssign(target[u.email], u.email, ticked.length ? ticked : undefined))) {
                      setPicked((p) => ({ ...p, [u.email]: [] }));
                      await reload();
                    }
                    setMatching(null);
                  }}
                >
                  <Link2 className={`w-3.5 h-3.5 ${matching === u.email ? "animate-pulse" : ""}`} />{" "}
                  {matching === u.email ? "Matching…" : ticked.length ? `Match ${ticked.length} ${ticked.length === 1 ? "repo" : "repos"}` : "Match"}
                </button>
              </div>
            </div>
            {expanded.has(u.email) && (
              <ul className="px-2.5 pb-2 pt-1 ml-5 space-y-0.5 border-t border-slate-800/80">
                {u.repos.map((r) => (
                  <li key={r.repoId}>
                    <label className="flex items-center gap-1.5 text-[11px] min-w-0 py-0.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ticked.includes(r.repoId)}
                        onChange={(e) => pick(u.email, r.repoId, e.target.checked)}
                        aria-label={`Match only ${u.email} in ${r.repo}`}
                        className="accent-sky-500 shrink-0"
                      />
                      <FolderGit2 className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="font-mono text-slate-300 truncate min-w-0">{r.repo}</span>
                      <span className="ml-auto shrink-0 font-mono text-slate-500">
                        {r.commits} commits{r.lastCommit && <span className="hidden sm:inline"> · last {dayOf(r.lastCommit)}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          );
        })}
        {shown.length > 300 && <div className="text-[11px] text-slate-500">…and {shown.length - 300} more: search to narrow it down.</div>}
        {list.length > 0 && shown.length === 0 && <div className="text-[11px] text-slate-500">No unmatched email matches.</div>}
      </div>
    </div>
  );
}

/** One developer's linked emails: unassign a wrong one with ✕ */
function DeveloperTab({ devOptions, kingdoms, onUnassign, reload }: { devOptions: ComboOption[]; kingdoms: DeveloperKingdom[]; onUnassign: EmailUnassign; reload: () => void }) {
  const act = useAction();
  const dialog = useDialog();
  const [devId, setDevId] = useState("");
  const [emails, setEmails] = useState<DevEmail[] | null>(null);
  const dev = kingdoms.find((k) => k.id === devId);

  useEffect(() => {
    setEmails(null);
    if (!devId) return;
    let live = true;
    get<{ emails: DevEmail[] }>(`/admin/dev/${encodeURIComponent(devId)}/emails`)
      .then((d) => live && setEmails(d.emails))
      .catch(() => live && setEmails([]));
    return () => {
      live = false;
    };
  }, [devId]);

  const unassign = async (e: DevEmail) => {
    if (!dev) return;
    const ok = await dialog.confirm({
      tone: "danger",
      title: e.repoId ? `Unassign ${e.email} in ${e.repo} from ${dev.name}?` : `Unassign ${e.email} from ${dev.name}?`,
      message: e.repoId
        ? `${e.commits} commits under this email in ${e.repo} go back to unmatched and stop counting for ${dev.name}.`
        : `${e.commits} commits under this email go back to unmatched and stop counting for ${dev.name}. A sync links it again if Git ties the email to their account.`,
      confirmLabel: "Unassign"
    });
    if (!ok) return;
    await act.run(async () => {
      const res = await onUnassign(dev.id, e.email, e.repoId);
      setEmails(res.emails);
      reload();
      return res;
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 leading-relaxed">Every email linked to a developer and the commits it carries; a shared email matched per repo shows the repo. The Git account's own email stays; any other can be unassigned, and its commits go back to Unmatched.</p>
      <div className="sm:w-72">
        <Combobox searchable size="sm" options={devOptions} value={devId || null} onChange={setDevId} placeholder="Choose a developer…" searchPlaceholder="Search developers…" ariaLabel="Developer" />
      </div>
      <Result ok={act.ok} error={act.error} />
      {dev && (
        <div className="space-y-1">
          {emails === null && <div className="text-[11px] text-slate-500">Loading…</div>}
          {emails?.length === 0 && <div className="text-[11px] text-slate-500">No emails linked yet.</div>}
          {emails?.map((e) => (
            <div key={`${e.email}|${e.repoId ?? ""}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
              <Mail className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="min-w-0 flex-1 sm:flex-initial">
                <span className="block font-mono text-slate-200 truncate">{e.email}</span>
                {e.repo && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-500 min-w-0" title="Only this email's commits in this repo">
                    <FolderGit2 className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="font-mono truncate">only in {e.repo}</span>
                  </span>
                )}
              </span>
              {e.primary && <span className="text-[10px] font-mono px-1.5 rounded bg-slate-800 text-slate-400 border border-slate-600 shrink-0">GIT</span>}
              <span className="ml-auto font-mono text-slate-400 shrink-0">{e.commits} commits</span>
              {!e.primary && (
                <button
                  onClick={() => unassign(e)}
                  disabled={act.busy}
                  title={e.repo ? `Unassign this email in ${e.repo}` : "Unassign this email"}
                  aria-label={e.repo ? `Unassign ${e.email} in ${e.repo}` : `Unassign ${e.email}`}
                  className="p-1 rounded text-slate-500 hover:text-red-300 hover:bg-red-950/40 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Admin → Developer Emails: a commit counts for a developer only when its author email is linked to them.
 * Unmatched lists the strays to match one by one; By developer shows (and unassigns) what each one has.
 */
export function DevEmailsModal({ open, onClose, kingdoms, onAssign, onUnassign, onUnmatchedCount }: DevEmailsModalProps) {
  const [tab, setTab] = useState<"unmatched" | "developer">("unmatched");
  const [unmatched, setUnmatched] = useState<UnmatchedCommitEmail[] | null>(null);

  const reload = () =>
    fetchUnmatchedEmails()
      .then((list) => {
        setUnmatched(list);
        onUnmatchedCount?.(list.length);
      })
      .catch(() => setUnmatched([]));

  useEffect(() => {
    if (open) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const devOptions = useMemo<ComboOption[]>(
    () =>
      [...kingdoms]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((k) => ({ value: k.id, label: k.name, sublabel: `@${k.username}`, search: `${k.name} ${k.username}` })),
    [kingdoms]
  );

  const tabBtn = (id: typeof tab, label: string, Icon: typeof Mail, count?: number) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
        tab === id ? "bg-sky-900/50 border-sky-500/60 text-sky-100" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
      {count !== undefined && <span className="font-mono px-1.5 rounded-full bg-sky-500/20 border border-sky-500/40">{count}</span>}
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      accentBorder="border-sky-500/60"
      headerClassName="bg-linear-to-b from-sky-950/80 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-950 border border-sky-500/60 flex items-center justify-center shadow-lg shadow-sky-950/50">
            <Mail className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Developer Emails</h2>
            <p className="text-xs text-slate-400">Match stray commit emails to the developers who made them</p>
          </div>
        </div>
      }
      subHeader={
        <div className="px-4 sm:px-6 py-2 flex gap-2 border-b border-slate-800">
          {tabBtn("unmatched", "Unmatched", Mail, unmatched?.length)}
          {tabBtn("developer", "By developer", Users)}
        </div>
      }
    >
      <div className="p-4 sm:p-6">
        {tab === "unmatched" ? (
          <UnmatchedTab unmatched={unmatched} devOptions={devOptions} onAssign={onAssign} reload={reload} />
        ) : (
          <DeveloperTab devOptions={devOptions} kingdoms={kingdoms} onUnassign={onUnassign} reload={reload} />
        )}
      </div>
    </Modal>
  );
}
