import { db } from "./db.js";
import { createBroadcast, recordRealmEvent } from "./broadcasts.js";
import type { Omen, OmenKind } from "./types.js";

/**
 * 🌠 Omens (GAME_GUIDE §11, notices §14): the developers are the gods of this realm (their commits raise its cities), so their
 * feedback comes down as omens. Any signed-in ruler sends one (a bug, an idea, a balance note, praise…); only admins
 * read them. Marking one read sends its sender a herald notice ("Your omen was heeded"), whose words the admin may change.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS omens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unread',
    read_by TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_omens_status ON omens(status);
  CREATE INDEX IF NOT EXISTS idx_omens_user ON omens(user_id, created_at);
`);

export const OMEN_KINDS: Record<OmenKind, { emblem: string; label: string }> = {
  bug: { emblem: "🐞", label: "Bug" },
  idea: { emblem: "💡", label: "Idea" },
  balance: { emblem: "⚖️", label: "Balance" },
  praise: { emblem: "🙌", label: "Praise" },
  other: { emblem: "🌠", label: "Other" }
};

export const OMEN_RULES = {
  /** Omens a ruler may send per UTC day */
  perDay: 5,
  maxTitle: 80,
  maxBody: 2000,
  noticeMaxTitle: 80,
  noticeMaxBody: 600
} as const;

export const DEFAULT_HEEDED_TITLE = "Your omen was heeded";
export const defaultHeededBody = (omenTitle: string) => `The stewards of the realm have read your omen: “${omenTitle}”.`;

function nameOf(userId: string | null): string | null {
  if (!userId) return null;
  const row = db.prepare(`SELECT full_name, username FROM users WHERE id = ?`).get(userId) as { full_name?: string; username?: string } | undefined;
  return row ? row.full_name || row.username || userId : userId;
}

const toOmen = (r: any): Omen => ({
  id: r.id,
  userId: r.user_id,
  userName: nameOf(r.user_id) ?? r.user_id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  status: r.status,
  readBy: r.read_by,
  readByName: nameOf(r.read_by),
  readAt: r.read_at,
  createdAt: r.created_at
});

const today = (now: Date) => now.toISOString().slice(0, 10);

export function omensLeftToday(userId: string, now = new Date()): number {
  const sent = (db.prepare(`SELECT COUNT(*) AS n FROM omens WHERE user_id = ? AND substr(created_at, 1, 10) = ?`).get(userId, today(now)) as { n: number }).n;
  return Math.max(0, OMEN_RULES.perDay - sent);
}

export function sendOmen(userId: string | null, body: { kind?: unknown; title?: unknown; body?: unknown }, now = new Date()) {
  if (!userId) throw new Error("Sign in with Git to send an omen.");
  const kind = String(body.kind ?? "other") as OmenKind;
  if (!(kind in OMEN_KINDS)) throw new Error("Pick what kind of omen it is.");
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!title) throw new Error("Give the omen a title.");
  if (!text) throw new Error("Write the omen's message.");
  if (title.length > OMEN_RULES.maxTitle) throw new Error(`Keep the title under ${OMEN_RULES.maxTitle} characters.`);
  if (text.length > OMEN_RULES.maxBody) throw new Error(`Keep the message under ${OMEN_RULES.maxBody} characters.`);
  if (omensLeftToday(userId, now) <= 0) throw new Error(`The heavens hold ${OMEN_RULES.perDay} omens a day: send it tomorrow.`);
  const r = db.prepare(`INSERT INTO omens (user_id, kind, title, body, status, created_at) VALUES (?, ?, ?, ?, 'unread', ?)`).run(userId, kind, title, text, now.toISOString());
  return { id: Number(r.lastInsertRowid), message: "Your omen streaks across the sky. The stewards will read it." };
}

/** Admins: every omen, unread first then newest */
export function listOmens(filter: "unread" | "all" = "all", limit = 200): Omen[] {
  const rows = db
    .prepare(`SELECT * FROM omens ${filter === "unread" ? "WHERE status = 'unread'" : ""} ORDER BY status = 'unread' DESC, created_at DESC LIMIT ?`)
    .all(Math.max(1, Math.min(500, limit))) as any[];
  return rows.map(toOmen);
}

/** The sender's own omens, newest first (to see which were heeded) */
export function myOmens(userId: string, limit = 30): Omen[] {
  return (db.prepare(`SELECT * FROM omens WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).all(userId, limit) as any[]).map(toOmen);
}

export const unreadOmenCount = () => (db.prepare(`SELECT COUNT(*) AS n FROM omens WHERE status = 'unread'`).get() as { n: number }).n;

function heed(o: any, actorId: string, title: string, body: string, now: Date) {
  db.prepare(`UPDATE omens SET status = 'read', read_by = ?, read_at = ? WHERE id = ?`).run(actorId, now.toISOString(), o.id);
  const eventId = recordRealmEvent("omen_heeded", actorId, o.user_id, { omenId: o.id }, now);
  createBroadcast({ kind: "omen", title, body, emblem: "🌠", audience: "users", recipients: [o.user_id], createdBy: actorId, eventId, now });
}

/** Mark one omen read and tell its sender; the admin may change the notice's words */
export function markOmenRead(actorId: string, id: number, notice: { title?: unknown; body?: unknown } = {}, now = new Date()) {
  const o = db.prepare(`SELECT * FROM omens WHERE id = ?`).get(id) as any;
  if (!o) throw new Error("Omen not found.");
  if (o.status === "read") throw new Error("That omen was already heeded.");
  const title = String(notice.title ?? "").trim() || DEFAULT_HEEDED_TITLE;
  const body = String(notice.body ?? "").trim() || defaultHeededBody(o.title);
  if (title.length > OMEN_RULES.noticeMaxTitle) throw new Error(`Keep the notice's title under ${OMEN_RULES.noticeMaxTitle} characters.`);
  if (body.length > OMEN_RULES.noticeMaxBody) throw new Error(`Keep the notice under ${OMEN_RULES.noticeMaxBody} characters.`);
  heed(o, actorId, title, body, now);
  return { message: `Heeded: ${nameOf(o.user_id)} has been told.` };
}

/** Mark every unread omen read, each sender getting the default notice */
export function markAllOmensRead(actorId: string, now = new Date()) {
  const rows = db.prepare(`SELECT * FROM omens WHERE status = 'unread'`).all() as any[];
  db.transaction(() => {
    for (const o of rows) heed(o, actorId, DEFAULT_HEEDED_TITLE, defaultHeededBody(o.title), now);
  })();
  return { read: rows.length, message: rows.length ? `Heeded ${rows.length} ${rows.length === 1 ? "omen" : "omens"}.` : "No unread omens." };
}
