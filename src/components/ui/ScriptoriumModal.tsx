import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ExternalLink, CheckCircle2, ChevronsDownUp, ChevronsUpDown, Hourglass, ListTree, ChevronDown, ChevronRight, ChevronsRightLeft, FolderGit2, Pencil, Plus, Search, Settings2, Trash2, X } from "lucide-react";
import { Modal } from "./Modal";
import { Combobox, ComboOption } from "./Combobox";
import { DeedIcon, HeaderTile, ScriptoriumIcon, TreeIcon } from "./realmIcons";
import { useDialog } from "./Dialog";
import type { Deed, ScriptoriumProject, ScriptoriumRepo } from "@/types";
import { DEED_STATUS, repoUrl, scriptorium, ScriptoriumData, xpText } from "@/utils/scriptoriumApi";
import { sound } from "@/hooks/useSound";

/*
 * 🪶 The Scriptorium (GAME_GUIDE §17): the tree of what the company builds (Division → Client → Project → repos) and
 * deed reports, work logged against a repo that isn't a commit. Everything is checked on the server.
 */

type Tab = "deeds" | "tree";
type Sel = { kind: "division" | "client" | "project"; id: number } | { kind: "unsorted" } | null;

const label = "block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1";
const input = "w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100";
const smallBtn = "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed";

function Result({ ok, error }: { ok: string | null; error: string | null }) {
  if (ok)
    return (
      <div className="p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="font-semibold">{ok}</span>
      </div>
    );
  if (error)
    return (
      <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
        <span>{error}</span>
      </div>
    );
  return null;
}

/** Runs one action and keeps its outcome line */
function useAction() {
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<{ message: string } | void>) => {
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      const r = await fn();
      if (r && r.message) setOk(r.message);
      sound.playClick();
      return true;
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { ok, error, busy, run, clear: () => (setOk(null), setError(null)) };
}

/** "Today · Wed 21 Oct" (the deed's UTC day, in short) */
const dayName = (day: string, days: string[]) => {
  const short = new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return day === days[0] ? `Today · ${short}` : day === days[1] ? `Yesterday · ${short}` : short;
};

/* ------------------------------------------------------------------------- */
/* One deed                                                                    */
/* ------------------------------------------------------------------------- */

export function DeedCard({ deed, canEdit, canRevoke, showAuthor, onChanged }: { deed: Deed; canEdit?: boolean; canRevoke?: boolean; showAuthor?: boolean; onChanged?: () => void }) {
  const dialog = useDialog();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(deed.title);
  const [body, setBody] = useState(deed.body);
  const act = useAction();
  const st = DEED_STATUS[deed.status];

  const revoke = async () => {
    const yes = await dialog.confirm({
      title: "Revoke this sealed deed?",
      message: `${deed.userName} loses ${xpText(deed.xp)} on ${deed.repoName} and gets a herald notice.`,
      tone: "danger",
      confirmLabel: "Revoke"
    });
    if (yes && (await act.run(() => scriptorium.revoke(deed.id)))) onChanged?.();
  };

  return (
    <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${st.cls}`}>{st.label}{deed.auto && deed.status === "sealed" ? " · auto" : ""}</span>
        <span className="font-mono text-amber-300 font-bold">+{xpText(deed.xp)}</span>
        <span className="font-mono text-slate-400 truncate" title={deed.repoId}>
          <FolderGit2 className="w-3 h-3 inline -mt-0.5" /> {deed.repoName}
        </span>
        {deed.projectName && <span className="text-slate-500 truncate">· {deed.projectName}</span>}
        <span className="ml-auto text-[10px] font-mono text-slate-500">{deed.day}</span>
      </div>
      {editing ? (
        <div className="space-y-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={input} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} className={input} />
          <div className="flex gap-1.5">
            <button
              className={`${smallBtn} bg-amber-600 border-amber-400/50 text-white`}
              disabled={act.busy}
              onClick={async () => {
                if (await act.run(() => scriptorium.editDeed(deed.id, { title, body }))) {
                  setEditing(false);
                  onChanged?.();
                }
              }}
            >
              Save
            </button>
            <button className={`${smallBtn} bg-slate-800 border-slate-700 text-slate-300`} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="font-semibold text-slate-100">{deed.title}</div>
          <div className="text-slate-300 whitespace-pre-line break-words">{deed.body}</div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
        {showAuthor && <span className="text-slate-300">{deed.userName}</span>}
        {deed.reviewedByName && deed.reviewedBy !== "realm" && (
          <span>
            {deed.status === "sealed" ? "Sealed" : deed.status === "rejected" ? "Rejected" : "Revoked"} by {deed.reviewedByName}
          </span>
        )}
        {deed.reviewNote && <span className="italic text-slate-400">“{deed.reviewNote}”</span>}
        <span className="ml-auto flex gap-1.5">
          {canEdit && deed.status === "pending" && !editing && (
            <button className={`${smallBtn} bg-slate-800 border-slate-700 text-slate-300`} onClick={() => setEditing(true)}>
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          {canRevoke && deed.status === "sealed" && (
            <button className={`${smallBtn} bg-rose-950/60 border-rose-500/40 text-rose-300`} disabled={act.busy} onClick={revoke}>
              Revoke
            </button>
          )}
        </span>
      </div>
      <Result ok={null} error={act.error} />
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* 📜 My deeds                                                                 */
/* ------------------------------------------------------------------------- */

function AllowanceBar({ a, rules }: { a: ScriptoriumData["allowance"][number]; rules: ScriptoriumData["rules"] }) {
  const w = (v: number) => `${(v / rules.dailyCap) * 100}%`;
  return (
    <div className="flex-1 min-w-40 p-2.5 rounded-xl border border-slate-800 bg-slate-950/60">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400 font-mono">{a.day}</span>
        <span className="font-mono font-bold text-amber-200">
          {a.used.toFixed(1)} / {rules.dailyCap} XP
        </span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-slate-800 overflow-hidden flex">
        <div className="h-full bg-emerald-500" style={{ width: w(a.sealed) }} title={`Sealed ${a.sealed}`} />
        <div className="h-full bg-amber-500" style={{ width: w(a.pending) }} title={`Awaiting a seal ${a.pending}`} />
        <div className="h-full bg-rose-500/70" style={{ width: w(Math.max(0, a.used - a.sealed - a.pending)) }} title="Revoked" />
        <div className="absolute top-0 bottom-0 border-l border-slate-200/70" style={{ left: w(rules.autoSeal) }} title={`The first ${rules.autoSeal} XP seal at once`} />
      </div>
      <div className="mt-1 text-[10px] text-slate-500">
        <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 align-middle" /> sealed {a.sealed.toFixed(1)} · <span className="inline-block w-2 h-2 rounded-sm bg-amber-500 align-middle" /> awaiting {a.pending.toFixed(1)}
      </div>
    </div>
  );
}

function MyDeedsTab({ data, onXpChanged, reload }: { data: ScriptoriumData; onXpChanged: () => void; reload: () => void }) {
  const days = data.allowance.map((a) => a.day);
  const myRepos = useMemo(() => data.repos.filter((r) => data.deedRepoIds.includes(r.id)), [data]);
  const myRepoOptions = useMemo(() => repoOptions(data, myRepos), [data, myRepos]);
  const [deeds, setDeeds] = useState<Deed[] | null>(null);
  const [repoId, setRepoId] = useState("");
  const [day, setDay] = useState(days[0] ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [xp, setXp] = useState<number | null>(null);
  const act = useAction();

  const loadDeeds = useCallback(() => {
    scriptorium.deeds("mine").then(setDeeds).catch(() => setDeeds([]));
  }, []);
  useEffect(loadDeeds, [loadDeeds]);

  // The days on offer roll over at midnight UTC (and arrive with the first load): keep the pick on one of them
  useEffect(() => {
    if (days.length && !days.includes(day)) setDay(days[0]);
  }, [days, day]);
  const allowance = data.allowance.find((a) => a.day === day);
  const full = !allowance || allowance.choices.length === 0;
  useEffect(() => {
    if (xp !== null && allowance && !allowance.choices.includes(xp)) setXp(null);
  }, [allowance, xp]);
  const willWait = allowance && xp !== null && allowance.used + xp > data.rules.autoSeal + 1e-9; // sealed + pending + revoked, as the server counts it

  if (!data.role.signedIn) return <div className="py-10 text-center text-sm text-slate-400">Sign in with Git to write deed reports.</div>;

  const submit = async () => {
    if (xp === null) return;
    const ok = await act.run(() => scriptorium.writeDeed({ repoId, day, title, body, xp }));
    if (ok) {
      setTitle("");
      setBody("");
      setXp(null);
      loadDeeds();
      reload();
      onXpChanged();
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-400 leading-relaxed">
        Log work that isn&apos;t a commit (a meeting, research, support, a deployment, a review outside Git) against one of your repos. Up to{" "}
        <b className="text-slate-200">{data.rules.dailyCap} XP a day</b>, today or yesterday. The first <b className="text-slate-200">{data.rules.autoSeal} XP</b> of a day seal at once and land on the
        building; past that an Admin, Special Overseer or the Archon seals it.
      </div>
      <div className="flex flex-wrap gap-2">
        {data.allowance.map((a) => (
          <AllowanceBar key={a.day} a={a} rules={data.rules} />
        ))}
      </div>

      <div className="p-3.5 rounded-2xl border border-amber-700/40 bg-amber-950/10 space-y-3">
        <div className="font-medieval text-amber-200 text-sm flex items-center gap-1.5"><ScriptoriumIcon className="w-4 h-4" /> New deed</div>
        {myRepos.length === 0 ? (
          <div className="text-xs text-slate-400">You have no repos yet: deeds are logged on a repo you own or have committed to.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_13rem] gap-3">
              <div>
                <span className={label}>Repository</span>
                <Combobox searchable options={myRepoOptions} value={repoId || null} onChange={setRepoId} placeholder="Pick one of your repos…" searchPlaceholder="Search your repos by name…" emptyText="None of your repos matches." />
              </div>
              <div>
                <span className={label}>Day</span>
                <Combobox options={days.map((d) => ({ value: d, label: dayName(d, days) }))} value={day} onChange={setDay} ariaLabel="Day" />
              </div>
            </div>
            <div>
              <span className={label}>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={data.rules.maxTitle} placeholder="What was done" className={input} />
            </div>
            <div>
              <span className={label}>
                Report <span className="normal-case font-normal text-slate-500">({body.length} / {data.rules.maxBody})</span>
              </span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={data.rules.maxBody} rows={4} placeholder="Plain text and emoji" className={input} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={label + " mb-0"}>XP</span>
              {data.rules.choices.map((c) => {
                const allowed = allowance?.choices.includes(c) ?? false;
                return (
                  <button
                    key={c}
                    disabled={!allowed}
                    onClick={() => setXp(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition disabled:opacity-30 disabled:cursor-not-allowed ${
                      xp === c ? "bg-amber-500/25 border-amber-400 text-amber-100" : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                    }`}
                  >
                    {c.toFixed(1)}
                  </button>
                );
              })}
              {willWait && <span className="text-[11px] text-amber-300 inline-flex items-center gap-1"><Hourglass className="w-3 h-3" /> Past {data.rules.autoSeal} XP today: this one waits for a seal.</span>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={submit}
                disabled={act.busy || full || !repoId || !title.trim() || !body.trim() || xp === null}
                title={full ? `That day's deeds are full (${data.rules.dailyCap} / ${data.rules.dailyCap} XP)` : undefined}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 border border-amber-300/40 text-white text-xs font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" /> Write the deed
              </button>
              {full && (
                <span className="text-[11px] text-slate-400">
                  {dayName(day, days)}&apos;s deeds are full ({data.rules.dailyCap} / {data.rules.dailyCap} XP)
                </span>
              )}
            </div>
            <Result ok={act.ok} error={act.error} />
          </>
        )}
      </div>

      <div>
        <div className="font-medieval text-slate-200 text-sm mb-2">Your deeds</div>
        {deeds === null ? (
          <div className="text-xs text-slate-500">Reading the scrolls…</div>
        ) : deeds.length === 0 ? (
          <div className="text-xs text-slate-500">No deeds yet.</div>
        ) : (
          <div className="space-y-2">
            {deeds.map((d) => (
              <DeedCard key={d.id} deed={d} canEdit onChanged={loadDeeds} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* 🌳 The tree                                                                 */
/* ------------------------------------------------------------------------- */

function TreeRow({ depth, open, onToggle, active, onClick, kind, name, count }: { depth: number; open?: boolean; onToggle?: () => void; active: boolean; onClick: () => void; kind: "division" | "client" | "project" | "unsorted"; name: string; count?: number }) {
  return (
    <div className={`flex items-center gap-1 rounded-md text-xs ${active ? "bg-amber-500/15 text-amber-100" : "text-slate-300 hover:bg-slate-800/60"}`} style={{ paddingLeft: 2 + depth * 13 }}>
      {onToggle ? (
        <button onClick={onToggle} className="p-0.5 text-slate-500 hover:text-slate-200" aria-label={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      ) : (
        <span className="w-4.5" />
      )}
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-1.5 py-1 pr-1.5 text-left">
        <TreeIcon kind={kind} />
        <span className="truncate">{name}</span>
        {count !== undefined && <span className="ml-auto text-[10px] font-mono text-slate-500">{count}</span>}
      </button>
    </div>
  );
}

/** A repo's name, linking to its page on Git (new tab) */
function RepoName({ fullName, gitUrl, className = "" }: { fullName: string; gitUrl: string; className?: string }) {
  return (
    <a
      href={repoUrl(gitUrl, fullName)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${fullName} on Git`}
      className={`group/repo inline-flex items-center gap-1 min-w-0 font-mono text-slate-200 hover:text-sky-200 hover:underline underline-offset-2 ${className}`}
    >
      <span className="truncate">{fullName}</span>
      <ExternalLink className="w-3 h-3 shrink-0 text-slate-500 group-hover/repo:text-sky-300" />
    </a>
  );
}

function RepoLine({ repo, gitUrl, onRemove, busy }: { repo: ScriptoriumRepo; gitUrl: string; onRemove?: () => void; busy?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
      <FolderGit2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span className="flex-1 min-w-0 flex">
        <RepoName fullName={repo.fullName} gitUrl={gitUrl} />
      </span>
      {onRemove && (
        <button onClick={onRemove} disabled={busy} className="p-1 rounded text-slate-500 hover:text-rose-300 hover:bg-rose-950/40" title="Take it out of the project">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** Projects the viewer may put repos into */
const assignableProjects = (data: ScriptoriumData) => data.projects.filter((p) => data.role.manager || p.createdBy === data.role.viewerId);

/** "Division › Client" of a project's Client */
function clientPath(data: ScriptoriumData, clientId: number): string {
  const c = data.clients.find((x) => x.id === clientId);
  const d = data.divisions.find((x) => x.id === c?.divisionId);
  return `${d?.name ?? "?"} › ${c?.name ?? "?"}`;
}

/** Tree order (the server sends every level A–Z) so the group headers read top to bottom like the tree */
function treeRank(data: ScriptoriumData, clientId: number): number {
  const c = data.clients.find((x) => x.id === clientId);
  const di = data.divisions.findIndex((x) => x.id === c?.divisionId);
  return di * 10_000 + data.clients.findIndex((x) => x.id === clientId);
}

/** Projects as combobox options, grouped under "Division › Client" (two projects may share a name under different Clients) */
function projectOptions(data: ScriptoriumData, projects: ScriptoriumProject[]): ComboOption[] {
  return [...projects]
    .sort((a, b) => treeRank(data, a.clientId) - treeRank(data, b.clientId) || a.name.localeCompare(b.name))
    .map((p) => {
      const path = clientPath(data, p.clientId);
      return { value: String(p.id), label: p.name, group: path, selectedLabel: `${path} › ${p.name}`, hint: `${p.repoIds.length} ${p.repoIds.length === 1 ? "repo" : "repos"}`, icon: <TreeIcon kind="project" /> };
    });
}

/** Clients as options, grouped under their Division */
function clientOptions(data: ScriptoriumData, exclude?: number): ComboOption[] {
  return data.divisions.flatMap((d) =>
    data.clients
      .filter((c) => c.divisionId === d.id && c.id !== exclude)
      .map((c) => ({ value: String(c.id), label: c.name, group: d.name, selectedLabel: `${d.name} › ${c.name}`, icon: <TreeIcon kind="client" /> }))
  );
}

/**
 * Repos as options. Managers search by repo name, owner, and the name or username of anyone who worked on it;
 * developers by the repo's name only. The sublabel says where the repo sits in the tree.
 */
function repoOptions(data: ScriptoriumData, repos: ScriptoriumRepo[]): ComboOption[] {
  const projectOf = new Map(data.projects.map((p) => [p.id, p]));
  return repos.map((r) => {
    const p = r.projectId !== null ? projectOf.get(r.projectId) : undefined;
    return {
      value: r.id,
      label: r.fullName,
      sublabel: p ? `in ${clientPath(data, p.clientId)} › ${p.name}` : "Unsorted",
      search: data.role.manager ? `${r.fullName} ${r.people ?? ""}` : r.name,
      icon: <FolderGit2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
    };
  });
}

const repoSearchHint = (data: ScriptoriumData) => (data.role.manager ? "Search by repo, developer name or username…" : "Search by repo name…");

function ProjectDetail({ data, project, reload, onXpChanged }: { data: ScriptoriumData; project: ScriptoriumProject; reload: () => void; onXpChanged: () => void }) {
  const dialog = useDialog();
  const act = useAction();
  const mayEdit = data.role.manager || project.createdBy === data.role.viewerId;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [desc, setDesc] = useState(project.description);
  const [clientId, setClientId] = useState(project.clientId);
  const [addRepo, setAddRepo] = useState("");
  const [deeds, setDeeds] = useState<Deed[] | null>(null);
  const repoOf = useMemo(() => new Map(data.repos.map((r) => [r.id, r])), [data.repos]);
  const loadDeeds = useCallback(() => {
    if (!data.role.signedIn) return setDeeds([]);
    scriptorium.deeds("project", project.id).then(setDeeds).catch(() => setDeeds([]));
  }, [project.id, data.role.signedIn]);
  useEffect(loadDeeds, [loadDeeds]);
  useEffect(() => {
    setName(project.name);
    setDesc(project.description);
    setClientId(project.clientId);
    setEditing(false);
  }, [project]);

  // Repos the viewer can add here: theirs (any for managers) not in this project; a developer can't take one from someone else's project
  const ownerOf = new Map(data.projects.map((p) => [p.id, p.createdBy]));
  const candidates = data.repos.filter(
    (r) => data.myRepoIds.includes(r.id) && r.projectId !== project.id && (data.role.manager || r.projectId === null || ownerOf.get(r.projectId) === data.role.viewerId)
  );
  const client = data.clients.find((c) => c.id === project.clientId);
  const division = data.divisions.find((d) => d.id === client?.divisionId);

  const remove = async () => {
    const yes = await dialog.confirm({
      title: `Delete ${project.name}?`,
      message: `Its ${project.repoIds.length} ${project.repoIds.length === 1 ? "repo goes" : "repos go"} back to Unsorted. Deeds keep their repo and stay valid.`,
      tone: "danger",
      confirmLabel: "Delete project"
    });
    if (yes && (await act.run(() => scriptorium.deleteProject(project.id)))) reload();
  };

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-slate-500 font-mono">
        {division?.name} › {client?.name}
      </div>
      {editing ? (
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={input} />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={2} className={input} placeholder="What the project is" />
          <Combobox searchable options={clientOptions(data)} value={String(clientId)} onChange={(v) => setClientId(Number(v))} searchPlaceholder="Search Clients…" />
          <div className="flex gap-1.5">
            <button
              className={`${smallBtn} bg-amber-600 border-amber-400/50 text-white`}
              disabled={act.busy}
              onClick={async () => {
                if (await act.run(() => scriptorium.updateProject(project.id, { name, description: desc, clientId }))) {
                  setEditing(false);
                  reload();
                }
              }}
            >
              Save
            </button>
            <button className={`${smallBtn} bg-slate-800 border-slate-700 text-slate-300`} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-start gap-2">
            <h3 className="font-medieval text-lg text-amber-100 flex-1 flex items-center gap-2"><TreeIcon kind="project" size="w-5 h-5" /> {project.name}</h3>
            {mayEdit && (
              <>
                <button className={`${smallBtn} bg-slate-800 border-slate-700 text-slate-300`} onClick={() => setEditing(true)}>
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button className={`${smallBtn} bg-rose-950/60 border-rose-500/40 text-rose-300`} onClick={remove} disabled={act.busy}>
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </>
            )}
          </div>
          {project.description && <p className="text-xs text-slate-300 mt-1 whitespace-pre-line">{project.description}</p>}
          <p className="text-[10px] text-slate-500 mt-1">Created by {project.createdByName}</p>
        </div>
      )}

      <div>
        <div className={label}>Repos ({project.repoIds.length})</div>
        <div className="space-y-1">
          {project.repoIds.length === 0 && <div className="text-xs text-slate-500">No repos yet.</div>}
          {project.repoIds.map((id) => {
            const r = repoOf.get(id) ?? { id, name: id, fullName: id.replace(/^repo-/, ""), ownerLogin: "", projectId: project.id };
            const mayRemove = data.role.manager || (project.createdBy === data.role.viewerId && data.myRepoIds.includes(id));
            return <RepoLine key={id} repo={r} gitUrl={data.gitUrl} busy={act.busy} onRemove={mayRemove ? () => act.run(() => scriptorium.unassignRepo(id)).then((ok) => ok && reload()) : undefined} />;
          })}
        </div>
        {mayEdit && data.role.signedIn && (
          <div className="flex gap-1.5 mt-2">
            <div className="flex-1 min-w-0">
              <Combobox searchable
                options={repoOptions(data, candidates)}
                value={addRepo || null}
                onChange={setAddRepo}
                disabled={candidates.length === 0}
                placeholder={candidates.length ? "Add a repo…" : data.role.manager ? "No repo to add" : "No repo of yours to add"}
                searchPlaceholder={repoSearchHint(data)}
              />
            </div>
            <button
              className={`${smallBtn} bg-amber-600 border-amber-400/50 text-white shrink-0`}
              disabled={!addRepo || act.busy}
              onClick={async () => {
                if (await act.run(() => scriptorium.assignRepo(project.id, addRepo))) {
                  setAddRepo("");
                  reload();
                }
              }}
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        )}
      </div>
      <Result ok={act.ok} error={act.error} />

      <div>
        <div className={label}>Deeds in this project</div>
        {deeds === null ? (
          <div className="text-xs text-slate-500">Reading the scrolls…</div>
        ) : deeds.length === 0 ? (
          <div className="text-xs text-slate-500">No deeds logged here yet.</div>
        ) : (
          <div className="space-y-2">
            {deeds.map((d) => (
              <DeedCard
                key={d.id}
                deed={d}
                showAuthor
                canEdit={d.userId === data.role.viewerId}
                canRevoke={data.role.manager && d.userId !== data.role.viewerId}
                onChanged={() => {
                  loadDeeds();
                  onXpChanged();
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewProjectForm({ clientId, reload, onCreated }: { clientId: number; reload: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const act = useAction();
  return (
    <div className="p-3 rounded-xl border border-slate-700 bg-slate-950/60 space-y-2">
      <div className={label}>New project</div>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Project name" className={input} />
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={2} placeholder="What it is (optional)" className={input} />
      <button
        className={`${smallBtn} bg-amber-600 border-amber-400/50 text-white`}
        disabled={!name.trim() || act.busy}
        onClick={async () => {
          let id = 0;
          const ok = await act.run(async () => {
            const r = await scriptorium.createProject({ clientId, name, description: desc });
            id = r.id;
            return r;
          });
          if (ok) {
            setName("");
            setDesc("");
            reload();
            onCreated(id);
          }
        }}
      >
        <Plus className="w-3 h-3" /> Create project
      </button>
      <Result ok={act.ok} error={act.error} />
    </div>
  );
}

function UnsortedDetail({ data, reload }: { data: ScriptoriumData; reload: () => void }) {
  const act = useAction();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Record<string, number>>({});
  const projects = assignableProjects(data);
  const projectOpts = useMemo(() => projectOptions(data, projects), [data, projects]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const unsorted = data.repos.filter((r) => r.projectId === null && (data.role.manager || data.myRepoIds.includes(r.id)));
  // Managers find repos by developer too; developers by repo name
  const shown = unsorted.filter((r) => {
    const hay = (data.role.manager ? `${r.fullName} ${r.people ?? ""}` : r.name).toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return (
    <div className="space-y-3">
      <h3 className="font-medieval text-lg text-amber-100 flex items-center gap-2"><TreeIcon kind="unsorted" size="w-5 h-5" /> Unsorted ({unsorted.length})</h3>
      <p className="text-xs text-slate-400">{data.role.manager ? "Every repo with work in it that sits in no project yet." : "Your repos that sit in no project yet. Put them in a project you created."}</p>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={repoSearchHint(data)} className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200" />
      </div>
      <Result ok={act.ok} error={act.error} />
      <div className="space-y-1">
        {shown.slice(0, 300).map((r) => (
          <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 min-w-0">
                <FolderGit2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <RepoName fullName={r.fullName} gitUrl={data.gitUrl} />
              </span>
              {data.role.manager && r.people && <span className="block text-[10px] text-slate-500 truncate">{r.people}</span>}
            </span>
            {projects.length > 0 && data.role.signedIn && (
              <div className="flex gap-1.5 sm:w-80 shrink-0">
                <div className="flex-1 min-w-0">
                  <Combobox searchable size="sm" options={projectOpts} value={target[r.id] ? String(target[r.id]) : null} onChange={(v) => setTarget((t) => ({ ...t, [r.id]: Number(v) }))} placeholder="Move to project…" searchPlaceholder="Search projects, Clients, Divisions…" />
                </div>
                <button
                  className={`${smallBtn} bg-amber-600 border-amber-400/50 text-white`}
                  disabled={!target[r.id] || act.busy}
                  onClick={async () => {
                    if (await act.run(() => scriptorium.assignRepo(target[r.id], r.id))) reload();
                  }}
                >
                  Move
                </button>
              </div>
            )}
          </div>
        ))}
        {shown.length > 300 && <div className="text-[11px] text-slate-500">…and {shown.length - 300} more: search to narrow it down.</div>}
        {projects.length === 0 && data.role.signedIn && <div className="text-[11px] text-slate-500">Create a project under a Client first.</div>}
      </div>
    </div>
  );
}

function TreeTab({ data, reload, onXpChanged, onManage, initialSel }: { data: ScriptoriumData; reload: () => void; onXpChanged: () => void; onManage: () => void; initialSel: Sel }) {
  const [sel, setSel] = useState<Sel>(initialSel);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setClosed((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    return n;
  });
  const unsortedCount = data.repos.filter((r) => r.projectId === null && (data.role.manager || data.myRepoIds.includes(r.id))).length;
  const project = sel?.kind === "project" ? data.projects.find((p) => p.id === sel.id) : undefined;
  const client = sel?.kind === "client" ? data.clients.find((c) => c.id === sel.id) : undefined;
  const division = sel?.kind === "division" ? data.divisions.find((d) => d.id === sel.id) : undefined;

  // Filter: a node stays when its name matches or something under it does (and then shows open)
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const hit = (name: string) => !q || name.toLowerCase().includes(q);
  const projectsOf = (clientId: number) => data.projects.filter((p) => p.clientId === clientId);
  const clientShown = (c: (typeof data.clients)[number]) => hit(c.name) || projectsOf(c.id).some((p) => hit(p.name));
  const shownDivisions = data.divisions.filter((d) => hit(d.name) || data.clients.some((c) => c.divisionId === d.id && clientShown(c)));
  const isOpen = (key: string) => Boolean(q) || !closed.has(key);
  const allKeys = [...data.divisions.map((d) => `d${d.id}`), ...data.clients.map((c) => `c${c.id}`)];

  return (
    <div className="grid grid-cols-1 md:grid-cols-[17rem_1fr] gap-4 md:items-start">
      {/* The tree: sticky beside the details, as tall as the window allows; only its list scrolls */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-2 flex flex-col max-h-[50vh] md:sticky md:top-0 md:max-h-[calc(88vh-11rem)]">
        <div className="flex items-center gap-1 px-1 pb-1.5 border-b border-slate-800">
          <span className={label + " mb-0 flex-1"}>Divisions</span>
          <button className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800" onClick={() => setClosed(new Set())} title="Expand all">
            <ChevronsUpDown className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800" onClick={() => setClosed(new Set(allKeys))} title="Collapse all">
            <ChevronsDownUp className="w-3.5 h-3.5" />
          </button>
          {data.role.manager && (
            <button className={`${smallBtn} bg-slate-800 border-slate-700 text-slate-300`} onClick={onManage}>
              <Settings2 className="w-3 h-3" /> Manage
            </button>
          )}
        </div>
        {/* Unsorted first, so it is never at the bottom of a long tree */}
        <div className="py-1 border-b border-slate-800">
          <TreeRow depth={0} active={sel?.kind === "unsorted"} onClick={() => setSel({ kind: "unsorted" })} kind="unsorted" name="Unsorted" count={unsortedCount} />
        </div>
        <div className="relative my-1.5 shrink-0">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter the tree…" className="w-full pl-6 pr-2 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] text-slate-200 outline-none focus:border-sky-500/60" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto -mx-0.5 px-0.5">
          {data.divisions.length === 0 && <div className="p-2 text-[11px] text-slate-500">{data.role.admin ? "No Divisions yet: add one with Manage." : "An administrator hasn't set up the Divisions yet."}</div>}
          {q && shownDivisions.length === 0 && <div className="p-2 text-[11px] text-slate-500">Nothing matches.</div>}
          {shownDivisions.map((d) => {
            const dk = `d${d.id}`;
            const clients = data.clients.filter((c) => c.divisionId === d.id);
            const shownClients = q && !hit(d.name) ? clients.filter(clientShown) : clients;
            return (
              <div key={d.id}>
                <TreeRow depth={0} open={isOpen(dk)} onToggle={() => toggle(dk)} active={sel?.kind === "division" && sel.id === d.id} onClick={() => setSel({ kind: "division", id: d.id })} kind="division" name={d.name} count={clients.length} />
                {isOpen(dk) &&
                  shownClients.map((c) => {
                    const ck = `c${c.id}`;
                    const projects = projectsOf(c.id);
                    const shownProjects = q && !hit(c.name) && !hit(d.name) ? projects.filter((p) => hit(p.name)) : projects;
                    return (
                      <div key={c.id}>
                        <TreeRow depth={1} open={isOpen(ck)} onToggle={projects.length ? () => toggle(ck) : undefined} active={sel?.kind === "client" && sel.id === c.id} onClick={() => setSel({ kind: "client", id: c.id })} kind="client" name={c.name} count={projects.length} />
                        {isOpen(ck) &&
                          shownProjects.map((p) => (
                            <TreeRow key={p.id} depth={2} active={sel?.kind === "project" && sel.id === p.id} onClick={() => setSel({ kind: "project", id: p.id })} kind="project" name={p.name} count={p.repoIds.length} />
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-w-0">
        {!sel && <div className="py-10 text-center text-sm text-slate-500">Pick a Division, Client or project in the tree.</div>}
        {division && (
          <div className="space-y-2">
            <h3 className="font-medieval text-lg text-amber-100 flex items-center gap-2"><TreeIcon kind="division" size="w-5 h-5" /> {division.name}</h3>
            <div className={label}>Clients</div>
            {data.clients.filter((c) => c.divisionId === division.id).map((c) => (
              <button key={c.id} onClick={() => setSel({ kind: "client", id: c.id })} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-left hover:border-amber-500/40">
                <TreeIcon kind="client" /> <span className="flex-1 text-slate-200">{c.name}</span>
                <span className="text-[10px] font-mono text-slate-500">{data.projects.filter((p) => p.clientId === c.id).length} projects</span>
              </button>
            ))}
            {data.clients.every((c) => c.divisionId !== division.id) && <div className="text-xs text-slate-500">No Clients yet.</div>}
          </div>
        )}
        {client && (
          <div className="space-y-3">
            <div className="text-[11px] text-slate-500 font-mono">{data.divisions.find((d) => d.id === client.divisionId)?.name}</div>
            <h3 className="font-medieval text-lg text-amber-100 flex items-center gap-2"><TreeIcon kind="client" size="w-5 h-5" /> {client.name}</h3>
            <div className={label}>Projects</div>
            <div className="space-y-1">
              {data.projects.filter((p) => p.clientId === client.id).map((p) => (
                <button key={p.id} onClick={() => setSel({ kind: "project", id: p.id })} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-left hover:border-amber-500/40">
                  <TreeIcon kind="project" /> <span className="flex-1 text-slate-200 truncate">{p.name}</span>
                  <span className="text-[10px] text-slate-500 truncate">{p.createdByName}</span>
                  <span className="text-[10px] font-mono text-slate-500">{p.repoIds.length} repos</span>
                </button>
              ))}
              {data.projects.every((p) => p.clientId !== client.id) && <div className="text-xs text-slate-500">No projects yet.</div>}
            </div>
            {data.role.signedIn && <NewProjectForm clientId={client.id} reload={reload} onCreated={(id) => setSel({ kind: "project", id })} />}
          </div>
        )}
        {project && <ProjectDetail data={data} project={project} reload={reload} onXpChanged={onXpChanged} />}
        {sel?.kind === "unsorted" && <UnsortedDetail data={data} reload={reload} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* ⚙ Manage tree (Divisions: admins · Clients: managers)                      */
/* ------------------------------------------------------------------------- */

/** A name shown as text; ✎ turns it into an input (Enter saves, Esc cancels) */
function InlineName({ name, editable, busy, onSave, className = "" }: { name: string; editable: boolean; busy: boolean; onSave: (n: string) => Promise<boolean>; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const save = async () => {
    if (!value.trim() || value.trim() === name) return setEditing(false);
    if (await onSave(value.trim())) setEditing(false);
  };
  if (editing)
    return (
      <span className="flex-1 min-w-0 flex items-center gap-1">
        <input
          autoFocus
          value={value}
          maxLength={60}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              setValue(name);
              setEditing(false);
            }
          }}
          className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-slate-950 border border-sky-500/60 text-xs text-slate-100 outline-none"
        />
        <button className="p-1 rounded text-emerald-300 hover:bg-emerald-950/50" disabled={busy} onClick={save} title="Save (Enter)">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 rounded text-slate-400 hover:bg-slate-800" onClick={() => (setValue(name), setEditing(false))} title="Cancel (Esc)">
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  return (
    <span className={`flex-1 min-w-0 flex items-center gap-1 group/name ${className}`}>
      <span className="truncate">{name}</span>
      {editable && (
        <button className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 opacity-60 group-hover/name:opacity-100" onClick={() => setEditing(true)} title="Rename">
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/** Asks where a non-empty Division's Clients (or Client's projects) go before it is deleted */
function MoveThenDelete({ what, count, options, busy, onCancel, onConfirm }: { what: string; count: number; options: ComboOption[]; busy: boolean; onCancel: () => void; onConfirm: (target: number) => void }) {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <div className="mt-1.5 p-2.5 rounded-xl border border-rose-500/40 bg-rose-950/20 space-y-2 text-xs">
      <div className="text-rose-200">
        It still holds {count} {count === 1 ? what.replace(/s$/, "") : what}: pick where they go, then it is deleted.
      </div>
      {options.length === 0 ? (
        <div className="text-slate-400">There is nowhere to move them: add another one first, or empty it.</div>
      ) : (
        <Combobox searchable size="sm" options={options} value={target} onChange={setTarget} placeholder={`Move its ${what} to…`} />
      )}
      <div className="flex gap-1.5">
        <button className={`${smallBtn} bg-rose-700 border-rose-400/50 text-white`} disabled={!target || busy} onClick={() => target && onConfirm(Number(target))}>
          <Trash2 className="w-3 h-3" /> Move and delete
        </button>
        <button className={`${smallBtn} bg-slate-800 border-slate-700 text-slate-300`} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** An input row that adds a child and stays open for the next one (Enter adds, Esc closes) */
function AddRow({ placeholder, busy, onAdd, onClose }: { placeholder: string; busy: boolean; onAdd: (name: string) => Promise<boolean>; onClose: () => void }) {
  const [value, setValue] = useState("");
  const add = async () => {
    if (value.trim() && (await onAdd(value.trim()))) setValue("");
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        maxLength={60}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onClose();
          }
        }}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-sky-500/50 text-xs text-slate-100 outline-none"
      />
      <button className={`${smallBtn} bg-amber-600 border-amber-400/50 text-white`} disabled={!value.trim() || busy} onClick={add}>
        <Plus className="w-3 h-3" /> Add
      </button>
      <button className="p-1 rounded text-slate-400 hover:bg-slate-800" onClick={onClose} title="Done (Esc)">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ManageTreeDialog({ data, onClose, reload }: { data: ScriptoriumData; onClose: () => void; reload: () => void }) {
  const dialog = useDialog();
  const act = useAction();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [addingClientTo, setAddingClientTo] = useState<number | null>(null);
  const [addingDivision, setAddingDivision] = useState(false);
  const [deleting, setDeleting] = useState<{ kind: "division" | "client"; id: number } | null>(null);
  const [movingClient, setMovingClient] = useState<number | null>(null);
  const run = async (fn: () => Promise<{ message: string }>) => {
    const ok = await act.run(fn);
    if (ok) reload();
    return ok;
  };
  const toggle = (id: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const askDelete = async (kind: "division" | "client", id: number, name: string, children: number) => {
    if (children > 0) return setDeleting({ kind, id });
    const yes = await dialog.confirm({ title: `Delete ${name}?`, message: `The ${kind === "division" ? "Division" : "Client"} is empty.`, tone: "danger", confirmLabel: "Delete" });
    if (yes) run(() => (kind === "division" ? scriptorium.deleteDivision(id) : scriptorium.deleteClient(id)));
  };
  const divisionOptions = (exclude: number): ComboOption[] => data.divisions.filter((d) => d.id !== exclude).map((d) => ({ value: String(d.id), label: d.name, icon: <TreeIcon kind="division" /> }));
  const iconBtn = "p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30";

  return createPortal(
    <Modal
      open
      onClose={onClose}
      size="lg"
      accentBorder="border-amber-700/60"
      headerClassName="bg-linear-to-b from-amber-950/60 to-slate-950"
      header={
        <div>
          <h2 className="font-medieval text-base text-slate-100 flex items-center gap-2"><Settings2 className="w-4 h-4 text-amber-300" /> Manage the tree</h2>
          <p className="text-xs text-slate-400">
            {data.role.admin ? "Divisions (admins) and their Clients (managers)." : "Clients of each Division (Divisions are set by administrators)."} Click the pencil to rename, Enter to save. Every level is kept A–Z.
          </p>
        </div>
      }
      footer={
        data.role.admin ? (
          addingDivision ? (
            <AddRow placeholder="New Division name" busy={act.busy} onAdd={(n) => run(() => scriptorium.createDivision(n))} onClose={() => setAddingDivision(false)} />
          ) : (
            <button className={`${smallBtn} bg-amber-600 border-amber-400/50 text-white`} onClick={() => setAddingDivision(true)}>
              <Plus className="w-3 h-3" /> New Division
            </button>
          )
        ) : undefined
      }
    >
      <div className="p-4 sm:p-5 space-y-2.5">
        <Result ok={act.ok} error={act.error} />
        {data.divisions.length === 0 && <div className="py-6 text-center text-xs text-slate-500">No Divisions yet.</div>}
        {data.divisions.map((d, di) => {
          const clients = data.clients.filter((c) => c.divisionId === d.id);
          const open = !collapsed.has(d.id);
          return (
            <div key={d.id} className="rounded-xl border border-slate-800 bg-slate-950/50">
              <div className="flex items-center gap-1.5 px-2.5 py-2">
                <button onClick={() => toggle(d.id)} className="p-0.5 text-slate-500 hover:text-slate-200" aria-label={open ? "Collapse" : "Expand"}>
                  {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <TreeIcon kind="division" size="w-4 h-4" />
                <InlineName name={d.name} editable={data.role.admin} busy={act.busy} onSave={(n) => run(() => scriptorium.updateDivision(d.id, { name: n }))} className="text-sm font-semibold text-slate-100" />
                <span className="text-[10px] font-mono text-slate-500 shrink-0">{clients.length} clients</span>
                <button
                  className={`${smallBtn} bg-slate-800 border-slate-700 text-slate-200 shrink-0`}
                  onClick={() => {
                    setCollapsed((s) => {
                      const n = new Set(s);
                      n.delete(d.id);
                      return n;
                    });
                    setAddingClientTo(d.id);
                  }}
                >
                  <Plus className="w-3 h-3" /> Client
                </button>
                {data.role.admin && (
                  <>
                    <button className={`${iconBtn} hover:text-rose-300`} disabled={act.busy} onClick={() => askDelete("division", d.id, d.name, clients.length)} title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
              {deleting?.kind === "division" && deleting.id === d.id && (
                <div className="px-2.5 pb-2.5">
                  <MoveThenDelete
                    what="Clients"
                    count={clients.length}
                    options={divisionOptions(d.id)}
                    busy={act.busy}
                    onCancel={() => setDeleting(null)}
                    onConfirm={async (target) => {
                      if (await run(() => scriptorium.deleteDivision(d.id, target))) setDeleting(null);
                    }}
                  />
                </div>
              )}
              {open && (
                <div className="border-t border-slate-800/80 px-2.5 py-1.5 space-y-0.5">
                  {clients.length === 0 && addingClientTo !== d.id && <div className="pl-7 py-1 text-[11px] text-slate-500">No Clients yet.</div>}
                  {clients.map((c, ci) => {
                    const projects = data.projects.filter((p) => p.clientId === c.id).length;
                    return (
                      <div key={c.id}>
                        <div className="flex items-center gap-1.5 pl-6 pr-0.5 py-1 rounded-lg hover:bg-slate-900/70">
                          <TreeIcon kind="client" />
                          <InlineName name={c.name} editable busy={act.busy} onSave={(n) => run(() => scriptorium.updateClient(c.id, { name: n }))} className="text-xs text-slate-200" />
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">{projects} projects</span>
                          <button className={iconBtn} disabled={act.busy || data.divisions.length < 2} onClick={() => setMovingClient(movingClient === c.id ? null : c.id)} title="Move to another Division">
                            <ChevronsRightLeft className="w-3.5 h-3.5" />
                          </button>
                          <button className={`${iconBtn} hover:text-rose-300`} disabled={act.busy} onClick={() => askDelete("client", c.id, c.name, projects)} title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {movingClient === c.id && (
                          <div className="pl-12 pr-1 pb-1.5 flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-400 shrink-0">Move to</span>
                            <div className="flex-1 min-w-0">
                              <Combobox searchable
                                size="sm"
                                options={divisionOptions(d.id)}
                                value={null}
                                onChange={async (v) => {
                                  if (await run(() => scriptorium.updateClient(c.id, { divisionId: Number(v) }))) setMovingClient(null);
                                }}
                                placeholder="Pick a Division…"
                              />
                            </div>
                            <button className="p-1 rounded text-slate-400 hover:bg-slate-800" onClick={() => setMovingClient(null)}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {deleting?.kind === "client" && deleting.id === c.id && (
                          <div className="pl-12 pr-1 pb-1.5">
                            <MoveThenDelete
                              what="projects"
                              count={projects}
                              options={clientOptions(data, c.id)}
                              busy={act.busy}
                              onCancel={() => setDeleting(null)}
                              onConfirm={async (target) => {
                                if (await run(() => scriptorium.deleteClient(c.id, target))) setDeleting(null);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {addingClientTo === d.id && (
                    <div className="pl-6 py-1">
                      <AddRow placeholder="New Client, tenant or app" busy={act.busy} onAdd={(n) => run(() => scriptorium.createClient(d.id, n))} onClose={() => setAddingClientTo(null)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>,
    document.body
  );
}


/* ------------------------------------------------------------------------- */
/* Panel                                                                       */
/* ------------------------------------------------------------------------- */

export function ScriptoriumModal({ open, onClose, onXpChanged, initialTab = "deeds", initialSel = null }: { open: boolean; onClose: () => void; onXpChanged: () => void; initialTab?: Tab; initialSel?: Sel }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<ScriptoriumData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const reload = useCallback(() => {
    scriptorium
      .tree()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    reload();
  }, [open, initialTab, reload]);

  const tabs: Array<{ id: Tab; label: string; Icon: typeof ListTree }> = [
    { id: "deeds", label: "Deed reports", Icon: DeedIcon },
    { id: "tree", label: "Project tree", Icon: ListTree }
  ];

  return (
    <Modal
      open={open}
      hidden={manage}
      onClose={onClose}
      size="xl"
      accentBorder="border-amber-700/60"
      headerClassName="bg-linear-to-b from-amber-950/70 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <HeaderTile Icon={ScriptoriumIcon} tone="amber" />
          <div>
            <h2 className="text-base font-bold text-slate-100 font-medieval">The Scriptorium</h2>
            <p className="text-xs text-slate-400">Where the realm&apos;s scribes write down what was done: projects and deed reports.</p>
          </div>
        </div>
      }
      subHeader={
        <div className="px-4 sm:px-6 pt-3 flex gap-1.5 overflow-x-auto border-b border-slate-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                sound.playClick();
                setTab(t.id);
              }}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold border-b-2 transition ${tab === t.id ? "border-amber-400 text-amber-200 bg-amber-500/10" : "border-transparent text-slate-400 hover:text-slate-200"}`}
            >
              <t.Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="p-4 sm:p-6">
        {error && <Result ok={null} error={error} />}
        {!data && !error && <div className="py-10 text-center text-sm text-slate-500">Unrolling the scrolls…</div>}
        {data && tab === "deeds" && <MyDeedsTab data={data} reload={reload} onXpChanged={onXpChanged} />}
        {data && tab === "tree" && <TreeTab data={data} reload={reload} onXpChanged={onXpChanged} onManage={() => setManage(true)} initialSel={initialSel} />}
      </div>
      {manage && data && <ManageTreeDialog data={data} onClose={() => setManage(false)} reload={reload} />}
    </Modal>
  );
}
