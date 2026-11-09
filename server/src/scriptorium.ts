import { db, exportDevelopers, importDevelopers, type BackupDeveloper } from "./db.js";
import { createBroadcast, recordRealmEvent } from "./broadcasts.js";
import type { Deed, DeedAllowance, DeedStatus, ScriptoriumClient, ScriptoriumDivision, ScriptoriumProject, ScriptoriumRepo, ScriptoriumTree } from "./types.js";

/**
 * 🪶 The Scriptorium (GAME_GUIDE §17): the tree of what the company builds (Division → Client → Project → repos)
 * and deed reports, work that isn't a commit (meetings, research, support, deployments…) logged against one repo.
 *
 * Who may do what:
 * - Divisions: admins. Clients: admins, Special Overseers and the Archon ("managers"). Projects: any developer
 *   creates one and edits / deletes their own; managers edit any.
 * - A repo sits in at most one project. A developer assigns only their own repos (owned or committed to), only into a
 *   project they created, and can't take a repo out of someone else's project; managers assign any repo anywhere.
 * - Deeds: 5 XP a developer a day (UTC day, the commit quota's day), 0.5 / 1.0 / 1.5 each, for today or yesterday.
 *   The first 3 XP of the day seal at once; a deed that would take sealed + pending past 3 waits for a manager.
 *   Pending counts towards the cap, a rejected deed frees its XP. Nobody seals their own deed.
 * Tables live in db.ts (initDB); sealed deed XP is added to buildings by getAllKingdomsFromDB.
 */

export const DEED_RULES = {
  /** XP of deeds a developer may log per day (sealed + pending + revoked) */
  dailyCap: 5,
  /** The first this-many XP of a day seal themselves */
  autoSeal: 3,
  /** XP a deed may claim */
  choices: [0.5, 1, 1.5],
  maxTitle: 80,
  maxBody: 2000,
  maxNote: 300,
  /** A deed may be written for today or this many days back */
  backDays: 1,
  /** Pending this long, it raises a validation warning */
  staleDays: 3
} as const;

export const TREE_NAME_MAX = 60;
export const PROJECT_DESC_MAX = 500;
const DAY_MS = 86_400_000;

/** Who is asking: the signed-in ruler (null when browsing as a guest) and their powers */
export interface ScriptoriumViewer {
  id: string | null;
  admin: boolean;
  /** Admin, Special Overseer or the Archon */
  manager: boolean;
}

export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

function nameOf(userId: string | null): string {
  if (!userId) return "—";
  if (userId === "realm") return "The realm";
  const row = db.prepare(`SELECT full_name, username FROM users WHERE id = ?`).get(userId) as { full_name?: string; username?: string } | undefined;
  return row ? row.full_name || row.username || userId : userId;
}

function cleanName(v: unknown, what: string): string {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!s) throw new Error(`Give the ${what} a name.`);
  if (s.length > TREE_NAME_MAX) throw new Error(`Keep the ${what}'s name under ${TREE_NAME_MAX} characters.`);
  return s;
}

const uniqueHint = (err: any, what: string) => {
  if (String(err?.message ?? "").includes("UNIQUE")) throw new Error(`A ${what} with that name already exists there.`);
  throw err;
};

function requireSignedIn(v: ScriptoriumViewer): string {
  if (!v.id) throw new Error("Sign in with Git first.");
  return v.id;
}

/* ------------------------------------------------------------------------- */
/* Repos a developer may use                                                   */
/* ------------------------------------------------------------------------- */

/** Repos the developer owns or has a commit credited in (the same matching as their buildings) */
export function ownRepoIds(userId: string): Set<string> {
  const rows = db
    .prepare(`
      SELECT id FROM repositories WHERE owner_login = @id
      UNION
      SELECT DISTINCT c.repo_id FROM commits c JOIN repositories r ON r.id = c.repo_id
      WHERE c.author_login = @id
         OR c.author_email = (SELECT email FROM users WHERE id = @id)
         OR c.author_email IN (SELECT email FROM user_emails WHERE user_id = @id)
    `)
    .all({ id: userId }) as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

function repoRow(repoId: string) {
  return db.prepare(`SELECT id, name, full_name, owner_login FROM repositories WHERE id = ?`).get(repoId) as { id: string; name: string; full_name: string; owner_login: string } | undefined;
}

/**
 * Who worked on each repo (its owner and everyone with a commit credited in it), as "Full Name @login" lines: managers
 * search repos by developer. Rebuilt at most once a minute.
 */
let peopleCache: { at: number; map: Map<string, string> } | null = null;
function repoPeople(): Map<string, string> {
  if (peopleCache && Date.now() - peopleCache.at < 60_000) return peopleCache.map;
  const users = db.prepare(`SELECT id, username, full_name, email FROM users`).all() as Array<{ id: string; username: string; full_name?: string; email?: string }>;
  const byId = new Map(users.map((u) => [u.id, u]));
  const byEmail = new Map<string, string>();
  for (const u of users) if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
  for (const e of db.prepare(`SELECT email, user_id FROM user_emails`).all() as Array<{ email: string; user_id: string }>) byEmail.set(e.email.toLowerCase(), e.user_id);
  const sets = new Map<string, Set<string>>();
  const add = (repoId: string, userId: string | undefined) => {
    if (!userId || !byId.has(userId)) return;
    let set = sets.get(repoId);
    if (!set) sets.set(repoId, (set = new Set()));
    set.add(userId);
  };
  for (const r of db.prepare(`SELECT id, owner_login FROM repositories`).all() as Array<{ id: string; owner_login: string }>) add(r.id, r.owner_login.toLowerCase());
  for (const c of db.prepare(`SELECT DISTINCT repo_id, author_login, author_email FROM commits`).all() as Array<{ repo_id: string; author_login: string | null; author_email: string | null }>) {
    add(c.repo_id, c.author_login && byId.has(c.author_login) ? c.author_login : c.author_email ? byEmail.get(c.author_email.toLowerCase()) : undefined);
  }
  const map = new Map<string, string>();
  for (const [repoId, set] of sets) map.set(repoId, [...set].map((id) => `${byId.get(id)!.full_name ?? ""} @${byId.get(id)!.username}`).join(" · "));
  peopleCache = { at: Date.now(), map };
  return map;
}

/* ------------------------------------------------------------------------- */
/* The tree                                                                    */
/* ------------------------------------------------------------------------- */

interface ProjectRow {
  id: number;
  client_id: number;
  name: string;
  description: string;
  created_by: string;
}

function projectRow(id: unknown): ProjectRow {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(Number(id)) as ProjectRow | undefined;
  if (!row) throw new Error("Project not found.");
  return row;
}

/** A–Z, ignoring case and reading numbers as numbers ("Team 2" before "Team 10"): the tree's order at every level */
export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });

export function getTree(v: ScriptoriumViewer): ScriptoriumTree {
  const divisions = (db.prepare(`SELECT id, name, sort FROM divisions`).all() as ScriptoriumDivision[]).sort(byName);
  const clients = (db.prepare(`SELECT id, division_id, name, sort FROM clients`).all() as any[])
    .map((c): ScriptoriumClient => ({ id: c.id, divisionId: c.division_id, name: c.name, sort: c.sort }))
    .sort(byName);
  const repoRows = db.prepare(`SELECT repo_id, project_id FROM project_repos`).all() as Array<{ repo_id: string; project_id: number }>;
  const projectOf = new Map(repoRows.map((r) => [r.repo_id, r.project_id]));
  const reposByProject = new Map<number, string[]>();
  for (const r of repoRows) reposByProject.set(r.project_id, [...(reposByProject.get(r.project_id) ?? []), r.repo_id]);
  const projects = (db.prepare(`SELECT * FROM projects`).all() as ProjectRow[]).sort(byName).map(
    (p): ScriptoriumProject => ({
      id: p.id,
      clientId: p.client_id,
      name: p.name,
      description: p.description,
      createdBy: p.created_by,
      createdByName: nameOf(p.created_by),
      repoIds: reposByProject.get(p.id) ?? []
    })
  );

  const mine = v.id ? ownRepoIds(v.id) : new Set<string>();
  // Managers see every repo with work in it (the Unsorted bucket is theirs to clear); developers see their own and the tree's
  const worked = v.manager
    ? new Set((db.prepare(`SELECT id FROM repositories r WHERE EXISTS (SELECT 1 FROM commits c WHERE c.repo_id = r.id) OR EXISTS (SELECT 1 FROM deeds d WHERE d.repo_id = r.id)`).all() as Array<{ id: string }>).map((r) => r.id))
    : new Set<string>();
  const repoList = (db.prepare(`SELECT id, name, full_name, owner_login FROM repositories`).all() as any[]).filter((r) => mine.has(r.id) || projectOf.has(r.id) || worked.has(r.id));
  const people = v.manager ? repoPeople() : null;
  const repos = repoList
    .map((r): ScriptoriumRepo => ({ id: r.id, name: r.name, fullName: r.full_name, ownerLogin: r.owner_login, projectId: projectOf.get(r.id) ?? null, ...(people ? { people: people.get(r.id) ?? "" } : {}) }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const myRepoIds = v.manager ? repos.map((r) => r.id) : [...mine];
  return { divisions, clients, projects, repos, myRepoIds, deedRepoIds: [...mine], role: { signedIn: Boolean(v.id), manager: v.manager, admin: v.admin, viewerId: v.id } };
}

/** Swap a node with its neighbour in the sibling order (dir −1 up, +1 down) and renumber the siblings */
function shiftSort(table: "divisions" | "clients", id: number, dir: number) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as any;
  if (!row) throw new Error("Not found.");
  const siblings = (table === "clients"
    ? db.prepare(`SELECT id FROM clients WHERE division_id = ? ORDER BY sort, id`).all(row.division_id)
    : db.prepare(`SELECT id FROM divisions ORDER BY sort, id`).all()) as Array<{ id: number }>;
  const ids = siblings.map((s) => s.id);
  const i = ids.indexOf(id);
  const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const set = db.prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`);
  db.transaction(() => ids.forEach((x, k) => set.run(k, x)))();
}

const nextSort = (table: "divisions" | "clients", divisionId?: number) =>
  ((table === "clients"
    ? db.prepare(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM clients WHERE division_id = ?`).get(divisionId)
    : db.prepare(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM divisions`).get()) as { s: number }).s;

/* Divisions (admins) */

export function createDivision(v: ScriptoriumViewer, name: unknown) {
  if (!v.admin) throw new Error("Only administrators manage Divisions.");
  const n = cleanName(name, "Division");
  try {
    const r = db.prepare(`INSERT INTO divisions (name, sort, created_by, created_at) VALUES (?, ?, ?, ?)`).run(n, nextSort("divisions"), v.id ?? "admin", new Date().toISOString());
    return { id: Number(r.lastInsertRowid), message: `Division ${n} added.` };
  } catch (err) {
    return uniqueHint(err, "Division");
  }
}

export function updateDivision(v: ScriptoriumViewer, id: number, body: { name?: unknown; move?: unknown }) {
  if (!v.admin) throw new Error("Only administrators manage Divisions.");
  if (!db.prepare(`SELECT 1 FROM divisions WHERE id = ?`).get(id)) throw new Error("Division not found.");
  if (body.name !== undefined) {
    const n = cleanName(body.name, "Division");
    try {
      db.prepare(`UPDATE divisions SET name = ? WHERE id = ?`).run(n, id);
    } catch (err) {
      uniqueHint(err, "Division");
    }
  }
  if (body.move === "up" || body.move === "down") shiftSort("divisions", id, body.move === "up" ? -1 : 1);
  return { message: "Division saved." };
}

/** Deletes an empty Division, or first moves its Clients to `moveTo` */
export function deleteDivision(v: ScriptoriumViewer, id: number, moveTo?: unknown) {
  if (!v.admin) throw new Error("Only administrators manage Divisions.");
  const row = db.prepare(`SELECT name FROM divisions WHERE id = ?`).get(id) as { name: string } | undefined;
  if (!row) throw new Error("Division not found.");
  const children = (db.prepare(`SELECT COUNT(*) AS n FROM clients WHERE division_id = ?`).get(id) as { n: number }).n;
  db.transaction(() => {
    if (children > 0) {
      const target = Number(moveTo);
      if (!moveTo || target === id || !db.prepare(`SELECT 1 FROM divisions WHERE id = ?`).get(target)) {
        throw new Error(`${row.name} still holds ${children} ${children === 1 ? "Client" : "Clients"}: move them to another Division first.`);
      }
      const clash = db.prepare(`SELECT a.name FROM clients a JOIN clients b ON b.name = a.name COLLATE NOCASE WHERE a.division_id = ? AND b.division_id = ?`).get(id, target) as { name: string } | undefined;
      if (clash) throw new Error(`Both Divisions have a Client named ${clash.name}: rename one first.`);
      db.prepare(`UPDATE clients SET division_id = ?, sort = sort + 1000 WHERE division_id = ?`).run(target, id);
    }
    db.prepare(`DELETE FROM divisions WHERE id = ?`).run(id);
  })();
  return { message: `Division ${row.name} deleted.` };
}

/* Clients (managers) */

export function createClient(v: ScriptoriumViewer, divisionId: unknown, name: unknown) {
  if (!v.manager) throw new Error("Only administrators, Special Overseers and the Archon manage Clients.");
  const div = Number(divisionId);
  if (!db.prepare(`SELECT 1 FROM divisions WHERE id = ?`).get(div)) throw new Error("Pick the Division the Client belongs to.");
  const n = cleanName(name, "Client");
  try {
    const r = db.prepare(`INSERT INTO clients (division_id, name, sort, created_by, created_at) VALUES (?, ?, ?, ?, ?)`).run(div, n, nextSort("clients", div), v.id ?? "admin", new Date().toISOString());
    return { id: Number(r.lastInsertRowid), message: `Client ${n} added.` };
  } catch (err) {
    return uniqueHint(err, "Client");
  }
}

export function updateClient(v: ScriptoriumViewer, id: number, body: { name?: unknown; divisionId?: unknown; move?: unknown }) {
  if (!v.manager) throw new Error("Only administrators, Special Overseers and the Archon manage Clients.");
  if (!db.prepare(`SELECT 1 FROM clients WHERE id = ?`).get(id)) throw new Error("Client not found.");
  try {
    if (body.name !== undefined) db.prepare(`UPDATE clients SET name = ? WHERE id = ?`).run(cleanName(body.name, "Client"), id);
    if (body.divisionId !== undefined) {
      const div = Number(body.divisionId);
      if (!db.prepare(`SELECT 1 FROM divisions WHERE id = ?`).get(div)) throw new Error("Division not found.");
      db.prepare(`UPDATE clients SET division_id = ?, sort = ? WHERE id = ?`).run(div, nextSort("clients", div), id);
    }
  } catch (err) {
    uniqueHint(err, "Client");
  }
  if (body.move === "up" || body.move === "down") shiftSort("clients", id, body.move === "up" ? -1 : 1);
  return { message: "Client saved." };
}

/** Deletes an empty Client, or first moves its Projects to `moveTo` */
export function deleteClient(v: ScriptoriumViewer, id: number, moveTo?: unknown) {
  if (!v.manager) throw new Error("Only administrators, Special Overseers and the Archon manage Clients.");
  const row = db.prepare(`SELECT name FROM clients WHERE id = ?`).get(id) as { name: string } | undefined;
  if (!row) throw new Error("Client not found.");
  const children = (db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE client_id = ?`).get(id) as { n: number }).n;
  db.transaction(() => {
    if (children > 0) {
      const target = Number(moveTo);
      if (!moveTo || target === id || !db.prepare(`SELECT 1 FROM clients WHERE id = ?`).get(target)) {
        throw new Error(`${row.name} still holds ${children} ${children === 1 ? "Project" : "Projects"}: move them to another Client first.`);
      }
      const clash = db.prepare(`SELECT a.name FROM projects a JOIN projects b ON b.name = a.name COLLATE NOCASE WHERE a.client_id = ? AND b.client_id = ?`).get(id, target) as { name: string } | undefined;
      if (clash) throw new Error(`Both Clients have a Project named ${clash.name}: rename one first.`);
      db.prepare(`UPDATE projects SET client_id = ? WHERE client_id = ?`).run(target, id);
    }
    db.prepare(`DELETE FROM clients WHERE id = ?`).run(id);
  })();
  return { message: `Client ${row.name} deleted.` };
}

/* Projects (anyone signed in; their own, or any for managers) */

function canEditProject(v: ScriptoriumViewer, p: ProjectRow) {
  return v.manager || (v.id !== null && p.created_by === v.id);
}

function cleanDesc(v: unknown): string {
  const s = String(v ?? "").trim();
  if (s.length > PROJECT_DESC_MAX) throw new Error(`Keep the description under ${PROJECT_DESC_MAX} characters.`);
  return s;
}

export function createProject(v: ScriptoriumViewer, body: { clientId?: unknown; name?: unknown; description?: unknown }) {
  const me = requireSignedIn(v);
  const client = Number(body.clientId);
  if (!db.prepare(`SELECT 1 FROM clients WHERE id = ?`).get(client)) throw new Error("Pick the Client the project belongs to.");
  const n = cleanName(body.name, "project");
  const now = new Date().toISOString();
  try {
    const r = db.prepare(`INSERT INTO projects (client_id, name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(client, n, cleanDesc(body.description), me, now, now);
    return { id: Number(r.lastInsertRowid), message: `Project ${n} created.` };
  } catch (err) {
    return uniqueHint(err, "project");
  }
}

export function updateProject(v: ScriptoriumViewer, id: number, body: { clientId?: unknown; name?: unknown; description?: unknown }) {
  requireSignedIn(v);
  const p = projectRow(id);
  if (!canEditProject(v, p)) throw new Error("Only the project's creator or a manager can change it.");
  try {
    if (body.name !== undefined) db.prepare(`UPDATE projects SET name = ? WHERE id = ?`).run(cleanName(body.name, "project"), id);
    if (body.description !== undefined) db.prepare(`UPDATE projects SET description = ? WHERE id = ?`).run(cleanDesc(body.description), id);
    if (body.clientId !== undefined) {
      const client = Number(body.clientId);
      if (!db.prepare(`SELECT 1 FROM clients WHERE id = ?`).get(client)) throw new Error("Client not found.");
      db.prepare(`UPDATE projects SET client_id = ? WHERE id = ?`).run(client, id);
    }
  } catch (err) {
    uniqueHint(err, "project");
  }
  db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  return { message: "Project saved." };
}

/** Deleting a project leaves its repos unassigned; deeds keep their repo and stay valid */
export function deleteProject(v: ScriptoriumViewer, id: number) {
  requireSignedIn(v);
  const p = projectRow(id);
  if (!canEditProject(v, p)) throw new Error("Only the project's creator or a manager can delete it.");
  db.transaction(() => {
    db.prepare(`DELETE FROM project_repos WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  })();
  return { message: `Project ${p.name} deleted; its repos are unsorted again.` };
}

export function assignRepo(v: ScriptoriumViewer, projectId: number, repoId: unknown) {
  const me = requireSignedIn(v);
  const p = projectRow(projectId);
  const repo = repoRow(String(repoId ?? ""));
  if (!repo) throw new Error("Repository not found.");
  const current = db.prepare(`SELECT pr.project_id, p.created_by, p.name FROM project_repos pr JOIN projects p ON p.id = pr.project_id WHERE pr.repo_id = ?`).get(repo.id) as
    | { project_id: number; created_by: string; name: string }
    | undefined;
  if (current?.project_id === p.id) return { message: `${repo.name} is already in ${p.name}.` };
  if (!v.manager) {
    if (p.created_by !== me) throw new Error("You can only add repos to a project you created.");
    if (!ownRepoIds(me).has(repo.id)) throw new Error("You can only add repos you own or have committed to.");
    if (current && current.created_by !== me) throw new Error(`${repo.name} is in ${current.name}: moving it out of someone else's project needs a manager.`);
  }
  db.prepare(`INSERT INTO project_repos (repo_id, project_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?) ON CONFLICT(repo_id) DO UPDATE SET project_id = excluded.project_id, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at`).run(
    repo.id,
    p.id,
    me,
    new Date().toISOString()
  );
  return { message: current ? `${repo.name} moved from ${current.name} to ${p.name}.` : `${repo.name} added to ${p.name}.` };
}

export function unassignRepo(v: ScriptoriumViewer, repoId: string) {
  const me = requireSignedIn(v);
  const current = db.prepare(`SELECT pr.project_id, p.created_by, p.name FROM project_repos pr JOIN projects p ON p.id = pr.project_id WHERE pr.repo_id = ?`).get(repoId) as
    | { project_id: number; created_by: string; name: string }
    | undefined;
  if (!current) return { message: "That repo is in no project." };
  if (!v.manager && (current.created_by !== me || !ownRepoIds(me).has(repoId))) throw new Error("Only a manager can take that repo out of its project.");
  db.prepare(`DELETE FROM project_repos WHERE repo_id = ?`).run(repoId);
  return { message: `Taken out of ${current.name}.` };
}

/* ------------------------------------------------------------------------- */
/* Deeds                                                                       */
/* ------------------------------------------------------------------------- */

interface DeedRow {
  id: number;
  user_id: string;
  repo_id: string;
  day: string;
  title: string;
  body: string;
  xp: number;
  status: DeedStatus;
  auto: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

const DEED_SELECT = `
  SELECT d.*, r.name AS repo_name, p.name AS project_name
  FROM deeds d
  LEFT JOIN repositories r ON r.id = d.repo_id
  LEFT JOIN project_repos pr ON pr.repo_id = d.repo_id
  LEFT JOIN projects p ON p.id = pr.project_id
`;

const toDeed = (r: DeedRow & { repo_name?: string; project_name?: string | null }): Deed => ({
  id: r.id,
  userId: r.user_id,
  userName: nameOf(r.user_id),
  repoId: r.repo_id,
  repoName: r.repo_name ?? r.repo_id.replace(/^repo-/, ""),
  projectName: r.project_name ?? null,
  day: r.day,
  title: r.title,
  body: r.body,
  xp: r.xp,
  status: r.status,
  auto: Boolean(r.auto),
  reviewedBy: r.reviewed_by,
  reviewedByName: r.reviewed_by ? nameOf(r.reviewed_by) : null,
  reviewedAt: r.reviewed_at,
  reviewNote: r.review_note,
  createdAt: r.created_at
});

/** A developer's deed XP on one day, by status */
function dayTotals(userId: string, day: string) {
  const rows = db.prepare(`SELECT status, SUM(xp) AS xp FROM deeds WHERE user_id = ? AND day = ? GROUP BY status`).all(userId, day) as Array<{ status: DeedStatus; xp: number }>;
  const by = (s: DeedStatus) => rows.find((r) => r.status === s)?.xp ?? 0;
  return { sealed: by("sealed"), pending: by("pending"), revoked: by("revoked") };
}

const fits = (a: number, b: number) => a <= b + 1e-9;

export function deedAllowance(userId: string, day: string): DeedAllowance {
  const t = dayTotals(userId, day);
  const used = t.sealed + t.pending + t.revoked;
  return {
    day,
    used,
    sealed: t.sealed,
    pending: t.pending,
    cap: DEED_RULES.dailyCap,
    autoSeal: DEED_RULES.autoSeal,
    choices: DEED_RULES.choices.filter((c) => fits(used + c, DEED_RULES.dailyCap))
  };
}

/** Today and yesterday (the days a deed may be written for), newest first */
export function deedDays(now = Date.now()): string[] {
  return Array.from({ length: DEED_RULES.backDays + 1 }, (_, i) => utcDay(now - i * DAY_MS));
}

function cleanText(v: unknown, what: string, max: number): string {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Write the deed's ${what}.`);
  if (s.length > max) throw new Error(`Keep the ${what} under ${max} characters.`);
  return s;
}

export function writeDeed(v: ScriptoriumViewer, body: { repoId?: unknown; day?: unknown; title?: unknown; body?: unknown; xp?: unknown }, now = Date.now()) {
  const me = requireSignedIn(v);
  const days = deedDays(now);
  const day = String(body.day ?? days[0]);
  if (!days.includes(day)) throw new Error("Deeds can only be written for today or yesterday.");
  const repo = repoRow(String(body.repoId ?? ""));
  if (!repo) throw new Error("Pick the repository the work was for.");
  if (!ownRepoIds(me).has(repo.id)) throw new Error("You can only log deeds on repos you own or have committed to.");
  const title = cleanText(body.title, "title", DEED_RULES.maxTitle);
  const text = cleanText(body.body, "text", DEED_RULES.maxBody);
  const xp = Number(body.xp);
  if (!DEED_RULES.choices.some((c) => c === xp)) throw new Error(`A deed claims ${DEED_RULES.choices.join(", ")} XP.`);

  return db.transaction(() => {
    const t = dayTotals(me, day);
    const used = t.sealed + t.pending + t.revoked;
    if (!fits(used + xp, DEED_RULES.dailyCap)) {
      throw new Error(used >= DEED_RULES.dailyCap ? `That day's deeds are full (${DEED_RULES.dailyCap} / ${DEED_RULES.dailyCap} XP).` : `Only ${DEED_RULES.dailyCap - used} XP of deeds is left that day.`);
    }
    // The first 3 XP of the day seal at once; a deed that would take sealed + pending past it waits, whole
    const auto = fits(t.sealed + t.pending + xp, DEED_RULES.autoSeal);
    const at = new Date(now).toISOString();
    const r = db
      .prepare(`INSERT INTO deeds (user_id, repo_id, day, title, body, xp, status, auto, reviewed_by, reviewed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(me, repo.id, day, title, text, xp, auto ? "sealed" : "pending", auto ? 1 : 0, auto ? "realm" : null, auto ? at : null, at, at);
    return {
      id: Number(r.lastInsertRowid),
      status: (auto ? "sealed" : "pending") as DeedStatus,
      message: auto ? `Sealed: +${xp} XP on ${repo.name}.` : `Sent for a seal: +${xp} XP on ${repo.name} once an Admin, Special Overseer or the Archon seals it.`
    };
  })();
}

function deedRow(id: unknown): DeedRow {
  const row = db.prepare(`SELECT * FROM deeds WHERE id = ?`).get(Number(id)) as DeedRow | undefined;
  if (!row) throw new Error("Deed not found.");
  return row;
}

export function editDeed(v: ScriptoriumViewer, id: number, body: { title?: unknown; body?: unknown }) {
  const me = requireSignedIn(v);
  const d = deedRow(id);
  if (d.user_id !== me) throw new Error("Only the deed's author can edit it.");
  if (d.status !== "pending") throw new Error("Only a pending deed can be edited.");
  const title = body.title === undefined ? d.title : cleanText(body.title, "title", DEED_RULES.maxTitle);
  const text = body.body === undefined ? d.body : cleanText(body.body, "text", DEED_RULES.maxBody);
  db.prepare(`UPDATE deeds SET title = ?, body = ?, updated_at = ? WHERE id = ?`).run(title, text, new Date().toISOString(), id);
  return { message: "Deed saved." };
}

function cleanNote(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (s.length > DEED_RULES.maxNote) throw new Error(`Keep the note under ${DEED_RULES.maxNote} characters.`);
  return s || null;
}

const repoNameOf = (repoId: string) => repoRow(repoId)?.name ?? repoId.replace(/^repo-/, "");
const xpLabel = (xp: number) => `${Number.isInteger(xp) ? xp.toFixed(1) : xp} XP`;

function notifyAuthor(d: DeedRow, action: "sealed" | "rejected" | "revoked", actorId: string, note: string | null, now: Date) {
  const repo = repoNameOf(d.repo_id);
  const by = nameOf(actorId);
  const noteLine = note ? `\n\n“${note}”` : "";
  const text =
    action === "sealed"
      ? { title: "Your deed was sealed", body: `${by} sealed your deed “${d.title}”: +${xpLabel(d.xp)} on ${repo}.${noteLine}` }
      : action === "rejected"
      ? { title: "Your deed was rejected", body: `${by} rejected your deed “${d.title}” (${xpLabel(d.xp)} on ${repo}, ${d.day}). Its XP is free again for that day.${noteLine}` }
      : { title: "A sealed deed was revoked", body: `${by} revoked your deed “${d.title}”: ${xpLabel(d.xp)} was taken back from ${repo}.${noteLine}` };
  const eventId = recordRealmEvent(`deed_${action}`, actorId, d.user_id, { deedId: d.id, xp: d.xp, repoId: d.repo_id, note: note ?? undefined }, now);
  createBroadcast({ kind: "deed", title: text.title, body: text.body, emblem: action === "sealed" ? "🪶" : action === "rejected" ? "✖️" : "🩸", audience: "users", recipients: [d.user_id], createdBy: actorId, eventId, now });
}

function requireReviewer(v: ScriptoriumViewer): string {
  if (!v.manager) throw new Error("Only Admins, Special Overseers and the Archon seal deeds.");
  return v.id ?? "admin";
}

/** Seal or reject a pending deed (never one's own) */
export function reviewDeed(v: ScriptoriumViewer, id: number, action: "seal" | "reject", noteRaw?: unknown, now = new Date()) {
  const actor = requireReviewer(v);
  const d = deedRow(id);
  if (d.status !== "pending") throw new Error("That deed is no longer waiting for a seal.");
  if (d.user_id === actor) throw new Error("Nobody seals their own deed: ask another manager.");
  const note = cleanNote(noteRaw);
  const status: DeedStatus = action === "seal" ? "sealed" : "rejected";
  db.prepare(`UPDATE deeds SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`).run(status, actor, now.toISOString(), note, id);
  notifyAuthor(d, action === "seal" ? "sealed" : "rejected", actor, note, now);
  return { message: action === "seal" ? `Sealed: +${xpLabel(d.xp)} for ${nameOf(d.user_id)}.` : `Rejected ${nameOf(d.user_id)}'s deed.` };
}

/** Take a sealed deed's XP back (managers; never one's own) */
export function revokeDeed(v: ScriptoriumViewer, id: number, noteRaw?: unknown, now = new Date()) {
  const actor = requireReviewer(v);
  const d = deedRow(id);
  if (d.status !== "sealed") throw new Error("Only a sealed deed can be revoked.");
  if (d.user_id === actor) throw new Error("Ask another manager to revoke your own deed.");
  const note = cleanNote(noteRaw);
  db.prepare(`UPDATE deeds SET status = 'revoked', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`).run(actor, now.toISOString(), note, id);
  notifyAuthor(d, "revoked", actor, note, now);
  return { message: `Revoked: −${xpLabel(d.xp)} from ${nameOf(d.user_id)}.` };
}

/** Seal every pending deed (or the listed ones) the viewer may seal; one notice per deed */
export function sealAllDeeds(v: ScriptoriumViewer, ids?: unknown, now = new Date()) {
  const actor = requireReviewer(v);
  const wanted = Array.isArray(ids) ? new Set(ids.map(Number)) : null;
  const rows = (db.prepare(`SELECT * FROM deeds WHERE status = 'pending' ORDER BY created_at`).all() as DeedRow[]).filter((d) => d.user_id !== actor && (!wanted || wanted.has(d.id)));
  db.transaction(() => {
    for (const d of rows) {
      db.prepare(`UPDATE deeds SET status = 'sealed', reviewed_by = ?, reviewed_at = ? WHERE id = ?`).run(actor, now.toISOString(), d.id);
      notifyAuthor(d, "sealed", actor, null, now);
    }
  })();
  return { sealed: rows.length, message: rows.length ? `Sealed ${rows.length} ${rows.length === 1 ? "deed" : "deeds"}.` : "Nothing to seal." };
}

export type DeedScope = "mine" | "pending" | "project" | "repo" | "user";

/**
 * Deeds for a list. Sealed deeds are visible to every signed-in ruler (a project's work log); pending, rejected and
 * revoked ones only to their author and managers. `pending` (managers) is oldest first with the author's day total.
 */
export function listDeeds(v: ScriptoriumViewer, scope: DeedScope, id?: string, limit = 100): Deed[] {
  const lim = Math.max(1, Math.min(300, limit));
  if (scope === "pending") {
    if (!v.manager) return [];
    return (db.prepare(`${DEED_SELECT} WHERE d.status = 'pending' ORDER BY d.created_at LIMIT ?`).all(lim) as any[]).map((r) => {
      const t = dayTotals(r.user_id, r.day);
      return { ...toDeed(r), dayTotal: { sealed: t.sealed, pending: t.pending } };
    });
  }
  if (!v.id) return [];
  let rows: any[];
  if (scope === "mine") rows = db.prepare(`${DEED_SELECT} WHERE d.user_id = ? ORDER BY d.day DESC, d.created_at DESC LIMIT ?`).all(v.id, lim) as any[];
  else if (scope === "repo") rows = db.prepare(`${DEED_SELECT} WHERE d.repo_id = ? ORDER BY d.day DESC, d.created_at DESC LIMIT ?`).all(String(id ?? ""), lim) as any[];
  else if (scope === "project") rows = db.prepare(`${DEED_SELECT} WHERE pr.project_id = ? ORDER BY d.day DESC, d.created_at DESC LIMIT ?`).all(Number(id), lim) as any[];
  else rows = db.prepare(`${DEED_SELECT} WHERE d.user_id = ? ORDER BY d.day DESC, d.created_at DESC LIMIT ?`).all(String(id ?? ""), lim) as any[];
  return rows.filter((r) => r.status === "sealed" || v.manager || r.user_id === v.id).map(toDeed);
}

export const pendingDeedCount = () => (db.prepare(`SELECT COUNT(*) AS n FROM deeds WHERE status = 'pending'`).get() as { n: number }).n;

/* ------------------------------------------------------------------------- */
/* System validations (Admin Panel)                                            */
/* ------------------------------------------------------------------------- */

export function scriptoriumValidationWarnings(now = Date.now()) {
  const warnings: Array<{ id: string; category: string; title: string; count: number; severity: "warning" | "info"; summary: string; details: any }> = [];
  const unsorted = db
    .prepare(`SELECT r.id, r.name, r.full_name, r.owner_login FROM repositories r WHERE EXISTS (SELECT 1 FROM commits c WHERE c.repo_id = r.id) AND NOT EXISTS (SELECT 1 FROM project_repos p WHERE p.repo_id = r.id) ORDER BY r.full_name`)
    .all() as Array<{ id: string; name: string; full_name: string; owner_login: string }>;
  if (unsorted.length > 0) {
    warnings.push({
      id: "unsorted_repos",
      category: "unsorted_repos",
      title: "Repos with no project",
      count: unsorted.length,
      severity: "info",
      summary: `${unsorted.length} ${unsorted.length === 1 ? "repository with commits is" : "repositories with commits are"} in no Scriptorium project (the Unsorted bucket).`,
      details: { repos: unsorted.map((r) => ({ id: r.id, name: r.name, fullName: r.full_name, ownerLogin: r.owner_login })) }
    });
  }
  const before = new Date(now - DEED_RULES.staleDays * DAY_MS).toISOString();
  const stale = db.prepare(`${DEED_SELECT} WHERE d.status = 'pending' AND d.created_at < ? ORDER BY d.created_at`).all(before) as any[];
  if (stale.length > 0) {
    warnings.push({
      id: "stale_deeds",
      category: "stale_deeds",
      title: "Deeds waiting too long",
      count: stale.length,
      severity: "warning",
      summary: `${stale.length} ${stale.length === 1 ? "deed has" : "deeds have"} waited more than ${DEED_RULES.staleDays} days for a seal.`,
      details: { deeds: stale.map(toDeed) }
    });
  }
  return warnings;
}

/* ------------------------------------------------------------------------- */
/* Realm Backup (Admin Panel): export developers, emails, the tree and deeds   */
/* ------------------------------------------------------------------------- */

/*
 * The backup names everything instead of using row ids: developers by user id (their Git login) with their linked
 * commit emails, divisions, clients and projects by their names down the tree, repos by full name ("owner/name").
 * Those are what a fresh harvest recreates, so a backup taken before a wipe restores onto the new database.
 * Version 1 files (kind "rise-of-git-tea/scriptorium", no developers) still import.
 */
export const REALM_BACKUP_KIND = "rise-of-git-tea/realm";
export const REALM_BACKUP_VERSION = 2;
const LEGACY_SCRIPTORIUM_BACKUP_KIND = "rise-of-git-tea/scriptorium";

interface BackupRepo {
  fullName: string;
  assignedBy: string;
  assignedAt: string;
}
interface BackupProject {
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
  repos: BackupRepo[];
}
interface BackupClient {
  name: string;
  createdBy: string;
  createdAt: string;
  projects: BackupProject[];
}
interface BackupDivision {
  name: string;
  createdBy: string;
  createdAt: string;
  clients: BackupClient[];
}
interface BackupDeed {
  userId: string;
  repo: string;
  day: string;
  title: string;
  body: string;
  xp: number;
  status: DeedStatus;
  auto: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string | null;
}
export interface RealmBackup {
  kind: typeof REALM_BACKUP_KIND;
  version: number;
  exportedAt: string;
  counts: { developers: number; emails: number; repoEmails: number; divisions: number; clients: number; projects: number; repos: number; deeds: number };
  developers: BackupDeveloper[];
  divisions: BackupDivision[];
  deeds: BackupDeed[];
}

const repoFullName = (repoId: string) => repoId.replace(/^repo-/, "");

export function exportRealmBackup(now = new Date()): RealmBackup {
  const developers = exportDevelopers();
  const divisions = db.prepare(`SELECT * FROM divisions`).all() as any[];
  const clients = db.prepare(`SELECT * FROM clients`).all() as any[];
  const projects = db.prepare(`SELECT * FROM projects`).all() as any[];
  const links = db.prepare(`SELECT * FROM project_repos ORDER BY repo_id`).all() as any[];
  const deeds = db.prepare(`SELECT * FROM deeds ORDER BY day, created_at, id`).all() as any[];
  const tree = divisions.sort(byName).map(
    (d): BackupDivision => ({
      name: d.name,
      createdBy: d.created_by,
      createdAt: d.created_at,
      clients: clients
        .filter((c) => c.division_id === d.id)
        .sort(byName)
        .map((c) => ({
          name: c.name,
          createdBy: c.created_by,
          createdAt: c.created_at,
          projects: projects
            .filter((p) => p.client_id === c.id)
            .sort(byName)
            .map((p) => ({
              name: p.name,
              description: p.description,
              createdBy: p.created_by,
              createdAt: p.created_at,
              updatedAt: p.updated_at ?? null,
              repos: links.filter((l) => l.project_id === p.id).map((l) => ({ fullName: repoFullName(l.repo_id), assignedBy: l.assigned_by, assignedAt: l.assigned_at }))
            }))
        }))
    })
  );
  return {
    kind: REALM_BACKUP_KIND,
    version: REALM_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    counts: {
      developers: developers.length,
      emails: developers.reduce((n, d) => n + d.emails.length, 0),
      repoEmails: developers.reduce((n, d) => n + (d.repoEmails?.length ?? 0), 0),
      divisions: divisions.length, clients: clients.length, projects: projects.length, repos: links.length, deeds: deeds.length
    },
    developers,
    divisions: tree,
    deeds: deeds.map((r) => ({
      userId: r.user_id,
      repo: repoFullName(r.repo_id),
      day: r.day,
      title: r.title,
      body: r.body,
      xp: r.xp,
      status: r.status,
      auto: Boolean(r.auto),
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      reviewNote: r.review_note,
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? null
    }))
  };
}

const DEED_STATUSES: DeedStatus[] = ["pending", "sealed", "rejected", "revoked"];
const str = (v: unknown, fallback = "") => (typeof v === "string" && v ? v : fallback);
const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);
const listOf = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/**
 * Restores a backup by merging it into what is here. Developers and their emails go first (importDevelopers: missing
 * developers added, listed emails linked to their developer, then their per-repo matches). A division, client or project that already exists (same name in
 * the same parent) is reused, a missing one is created with its first author and date. A repo listed in the backup goes
 * to the backup's project, even if it sits elsewhere now. A deed already here (same person, repo, day, title and time
 * written) is skipped, so importing the same file twice changes nothing. All or nothing: one bad name stops it all.
 */
export function importRealmBackup(v: ScriptoriumViewer, raw: unknown) {
  if (!v.admin) throw new Error("Only an administrator can import a Realm Backup.");
  const data = raw as Partial<RealmBackup> | null;
  const legacy = data?.kind === (LEGACY_SCRIPTORIUM_BACKUP_KIND as string);
  if (!data || typeof data !== "object" || (data.kind !== REALM_BACKUP_KIND && !legacy)) throw new Error("That file isn't a Realm Backup.");
  if (!Number.isFinite(Number(data.version)) || Number(data.version) > (legacy ? 1 : REALM_BACKUP_VERSION)) throw new Error("That backup comes from a newer version of the game.");
  for (const key of ["divisions", "deeds"] as const) if (data[key] !== undefined && !Array.isArray(data[key])) throw new Error(`The backup's ${key} list is unreadable.`);
  const actor = v.id ?? "admin";
  const at = new Date().toISOString();
  const added = { divisions: 0, clients: 0, projects: 0, repos: 0, moved: 0, deeds: 0, skippedDeeds: 0 };

  const findDivision = db.prepare(`SELECT id FROM divisions WHERE name = ?`);
  const insDivision = db.prepare(`INSERT INTO divisions (name, sort, created_by, created_at) VALUES (?, 0, ?, ?)`);
  const findClient = db.prepare(`SELECT id FROM clients WHERE division_id = ? AND name = ?`);
  const insClient = db.prepare(`INSERT INTO clients (division_id, name, sort, created_by, created_at) VALUES (?, ?, 0, ?, ?)`);
  const findProject = db.prepare(`SELECT id FROM projects WHERE client_id = ? AND name = ?`);
  const insProject = db.prepare(`INSERT INTO projects (client_id, name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
  const currentProject = db.prepare(`SELECT project_id FROM project_repos WHERE repo_id = ?`);
  const putRepo = db.prepare(`INSERT OR REPLACE INTO project_repos (repo_id, project_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)`);
  const findDeed = db.prepare(`SELECT 1 FROM deeds WHERE user_id = ? AND repo_id = ? AND day = ? AND title = ? AND created_at = ?`);
  const insDeed = db.prepare(
    `INSERT INTO deeds (user_id, repo_id, day, title, body, xp, status, auto, reviewed_by, reviewed_at, review_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  /** The row's id, inserting it first when it isn't here */
  const idOf = (row: unknown, insert: () => number | bigint) => ((row as { id: number } | undefined)?.id ?? Number(insert()));

  let people: ReturnType<typeof importDevelopers> | undefined;
  db.transaction(() => {
    people = importDevelopers(data.developers);
    for (const d of listOf(data.divisions)) {
      const dName = cleanName(d?.name, "division");
      const divisionId = idOf(findDivision.get(dName), () => (added.divisions++, insDivision.run(dName, str(d.createdBy, actor), str(d.createdAt, at)).lastInsertRowid));
      for (const c of listOf(d.clients)) {
        const cName = cleanName(c?.name, "client");
        const clientId = idOf(findClient.get(divisionId, cName), () => (added.clients++, insClient.run(divisionId, cName, str(c.createdBy, actor), str(c.createdAt, at)).lastInsertRowid));
        for (const p of listOf(c.projects)) {
          const pName = cleanName(p?.name, "project");
          const projectId = idOf(
            findProject.get(clientId, pName),
            () => (added.projects++, insProject.run(clientId, pName, cleanDesc(p.description), str(p.createdBy, actor), str(p.createdAt, at), strOrNull(p.updatedAt)).lastInsertRowid)
          );
          for (const r of listOf(p.repos)) {
            const fullName = str(r?.fullName).trim();
            if (!fullName.includes("/")) continue;
            const repoId = `repo-${fullName}`;
            const was = currentProject.get(repoId) as { project_id: number } | undefined;
            if (was?.project_id === projectId) continue;
            if (was) added.moved++;
            else added.repos++;
            putRepo.run(repoId, projectId, str(r.assignedBy, actor), str(r.assignedAt, at));
          }
        }
      }
    }
    for (const d of listOf(data.deeds)) {
      const userId = str(d?.userId).trim();
      const repo = str(d?.repo).trim();
      const day = str(d?.day);
      const title = str(d?.title).trim();
      const xp = Number(d?.xp);
      const status = DEED_STATUSES.includes(d?.status) ? (d.status as DeedStatus) : null;
      if (!userId || !repo.includes("/") || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !title || !Number.isFinite(xp) || xp <= 0 || !status) {
        added.skippedDeeds++;
        continue;
      }
      const repoId = `repo-${repo}`;
      const createdAt = str(d.createdAt, at);
      if (findDeed.get(userId, repoId, day, title, createdAt)) {
        added.skippedDeeds++;
        continue;
      }
      insDeed.run(userId, repoId, day, title, str(d.body), xp, status, d.auto ? 1 : 0, strOrNull(d.reviewedBy), strOrNull(d.reviewedAt), strOrNull(d.reviewNote), createdAt, strOrNull(d.updatedAt));
      added.deeds++;
    }
  })();
  peopleCache = null;

  const dev = people!;
  const parts = [
    dev.developers && `${dev.developers} developers`,
    dev.updatedDevelopers && `${dev.updatedDevelopers} developers filled in`,
    dev.emails && `${dev.emails} emails linked`,
    dev.movedEmails && `${dev.movedEmails} emails moved`,
    dev.repoEmails && `${dev.repoEmails} per-repo matches`,
    dev.movedRepoEmails && `${dev.movedRepoEmails} per-repo matches moved`,
    dev.reattributedCommits && `${dev.reattributedCommits} commits re-attributed`,
    added.divisions && `${added.divisions} divisions`,
    added.clients && `${added.clients} clients`,
    added.projects && `${added.projects} projects`,
    added.repos && `${added.repos} repos placed`,
    added.moved && `${added.moved} repos moved`,
    added.deeds && `${added.deeds} deeds`
  ].filter(Boolean);
  const skipped = [
    added.skippedDeeds && `${added.skippedDeeds} deeds were already here or unreadable`,
    dev.skippedDevelopers && `${dev.skippedDevelopers} developers had no readable login`,
    dev.skippedEmails && `${dev.skippedEmails} emails were unreadable, another developer's Git email or matched per repo`,
    dev.skippedRepoEmails && `${dev.skippedRepoEmails} per-repo matches were unreadable or their email is linked as a whole`
  ].filter(Boolean);
  const skippedText = skipped.length ? ` Skipped: ${skipped.join("; ")}.` : "";
  return {
    ...added,
    ...dev,
    message: parts.length ? `Imported ${parts.join(", ")}.${skippedText}` : `Nothing new: the realm already holds everything in that backup.${skippedText}`
  };
}
