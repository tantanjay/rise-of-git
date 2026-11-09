import { API_BASE } from "@/config";
import type { Deed, DeedAllowance, ScriptoriumTree } from "@/types";

/* 🪶 The Scriptorium's REST calls (GAME_GUIDE §17). Every rule is checked on the server; these only carry it. */

export interface DeedRules {
  dailyCap: number;
  autoSeal: number;
  choices: number[];
  maxTitle: number;
  maxBody: number;
  maxNote: number;
  backDays: number;
  staleDays: number;
}

/** Client mirror of DEED_RULES in server/src/scriptorium.ts, for the Guide Book (the window reads the live ones) */
export const DEED_RULES: DeedRules = { dailyCap: 5, autoSeal: 3, choices: [0.5, 1, 1.5], maxTitle: 80, maxBody: 2000, maxNote: 300, backDays: 1, staleDays: 3 };

export type ScriptoriumData = ScriptoriumTree & { rules: DeedRules; allowance: DeedAllowance[]; gitUrl: string };

/** A repo's page on Git (its full name is "owner/name") */
export const repoUrl = (gitUrl: string, fullName: string) => `${gitUrl}/${fullName.split("/").map(encodeURIComponent).join("/")}`;

async function call<T = { message: string }>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/scriptorium${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "The Scriptorium refused that");
  return data as T;
}

export const scriptorium = {
  tree: () => call<ScriptoriumData>("GET", ""),
  deeds: (scope: "mine" | "pending" | "project" | "repo" | "user", id?: string | number) =>
    call<Deed[]>("GET", `/deeds?scope=${scope}${id !== undefined ? `&id=${encodeURIComponent(String(id))}` : ""}`),
  writeDeed: (b: { repoId: string; day: string; title: string; body: string; xp: number }) => call<{ message: string; status: string }>("POST", "/deeds", b),
  editDeed: (id: number, b: { title: string; body: string }) => call("PATCH", `/deeds/${id}`, b),
  seal: (id: number, note?: string) => call("POST", `/deeds/${id}/seal`, { note }),
  reject: (id: number, note?: string) => call("POST", `/deeds/${id}/reject`, { note }),
  revoke: (id: number, note?: string) => call("POST", `/deeds/${id}/revoke`, { note }),
  sealAll: (ids?: number[]) => call<{ message: string; sealed: number }>("POST", "/deeds/seal-all", { ids }),
  createDivision: (name: string) => call("POST", "/divisions", { name }),
  updateDivision: (id: number, b: { name?: string; move?: "up" | "down" }) => call("PATCH", `/divisions/${id}`, b),
  deleteDivision: (id: number, moveTo?: number) => call("DELETE", `/divisions/${id}${moveTo ? `?moveTo=${moveTo}` : ""}`),
  createClient: (divisionId: number, name: string) => call("POST", "/clients", { divisionId, name }),
  updateClient: (id: number, b: { name?: string; divisionId?: number; move?: "up" | "down" }) => call("PATCH", `/clients/${id}`, b),
  deleteClient: (id: number, moveTo?: number) => call("DELETE", `/clients/${id}${moveTo ? `?moveTo=${moveTo}` : ""}`),
  createProject: (b: { clientId: number; name: string; description: string }) => call<{ message: string; id: number }>("POST", "/projects", b),
  updateProject: (id: number, b: { name?: string; description?: string; clientId?: number }) => call("PATCH", `/projects/${id}`, b),
  deleteProject: (id: number) => call("DELETE", `/projects/${id}`),
  assignRepo: (projectId: number, repoId: string) => call("POST", `/projects/${projectId}/repos`, { repoId }),
  unassignRepo: (repoId: string) => call("DELETE", `/repos/${encodeURIComponent(repoId)}/project`)
};

/** Admin backup of the tree and every deed: the parsed file goes back in as it came out */
/** The admin Realm Backup: developers and their emails, the Scriptorium tree and deeds */
export const realmBackup = {
  export: async (): Promise<{ file: Blob; name: string }> => {
    const res = await fetch(`${API_BASE}/admin/backup/export`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Export failed");
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "realm-backup.json";
    return { file: new Blob([JSON.stringify(await res.json(), null, 2)], { type: "application/json" }), name };
  },
  import: async (backup: unknown) => {
    const res = await fetch(`${API_BASE}/admin/backup/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Import failed");
    return data as { message: string };
  }
};

export const xpText = (xp: number) => `${xp.toFixed(1)} XP`;

export const DEED_STATUS: Record<Deed["status"], { label: string; cls: string }> = {
  sealed: { label: "Sealed", cls: "bg-emerald-950/70 text-emerald-300 border-emerald-500/40" },
  pending: { label: "Awaiting seal", cls: "bg-amber-950/70 text-amber-300 border-amber-500/40" },
  rejected: { label: "Rejected", cls: "bg-slate-800 text-slate-400 border-slate-600" },
  revoked: { label: "Revoked", cls: "bg-rose-950/70 text-rose-300 border-rose-500/40" }
};
