import { db } from "./db.js";
import { seasonAt, SEASON_MODS } from "./realmTime.js";
import { FESTIVAL } from "./warConfig.js";
import { ActivityEvent, BattleLoot, BattleReport, Broadcast, BroadcastKind } from "./types.js";

/**
 * The Broadcaster (GAME_GUIDE §14): an append-only log of realm events and the herald notices raised from them.
 * A notice opens once per kingdom — reads are kept here, not in the browser — and stays in the War Room's
 * 📯 Notices for NOTICE_KEEP_DAYS.
 */

db.exec(`
  -- Append-only log of what happened in the realm (boss kills, notices raised…)
  CREATE TABLE IF NOT EXISTS realm_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    actor_id TEXT,
    target_id TEXT,
    payload_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_realm_events_at ON realm_events(at);

  -- Herald notices; audience = 'all' | 'civ:<civ>' | 'users' (then broadcast_recipients lists them)
  CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    emblem TEXT NOT NULL DEFAULT '📯',
    audience TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    event_id INTEGER,
    -- Announcements pinned at the top of the War Room's Notices until then
    pinned_until TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON broadcasts(created_at);

  CREATE TABLE IF NOT EXISTS broadcast_recipients (
    broadcast_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (broadcast_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_user ON broadcast_recipients(user_id);

  CREATE TABLE IF NOT EXISTS broadcast_reads (
    broadcast_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    read_at TEXT NOT NULL,
    PRIMARY KEY (broadcast_id, user_id)
  );
`);

const DAY_MS = 24 * 60 * 60 * 1000;
/** Notices stay in the War Room list this long (and expire then unless given another expiry) */
export const NOTICE_KEEP_DAYS = 30;
/** The herald only opens notices this recent; older unread ones are just listed */
export const NOTICE_HERALD_DAYS = 7;
/** A ruler counts as away after this long without polling the realm */
export const AWAY_AFTER_MS = 15 * 60 * 1000;
/** last_seen_at is written at most this often per ruler */
const SEEN_WRITE_MS = 60 * 1000;

let noticeLogger: ((text: string, type: ActivityEvent["type"]) => void) | null = null;
/** Public notices also land in the Chronicle ticker */
export function setNoticeLogger(fn: (text: string, type: ActivityEvent["type"]) => void) {
  noticeLogger = fn;
}

let latestBroadcastId = (db.prepare(`SELECT COALESCE(MAX(id), 0) AS id FROM broadcasts`).get() as { id: number }).id;
/** Changes whenever a notice is raised; clients refetch their unread notices when it does */
export const noticeKey = () => String(latestBroadcastId);

export function recordRealmEvent(kind: string, actorId: string | null, targetId: string | null, payload: unknown, at = new Date()): number {
  const r = db
    .prepare(`INSERT INTO realm_events (at, kind, actor_id, target_id, payload_json) VALUES (?, ?, ?, ?, ?)`)
    .run(at.toISOString(), kind, actorId, targetId, payload === undefined ? null : JSON.stringify(payload));
  return Number(r.lastInsertRowid);
}

export function createBroadcast(params: {
  kind: BroadcastKind;
  title: string;
  body: string;
  emblem?: string;
  audience: "all" | `civ:${string}` | "users";
  /** For audience 'users' */
  recipients?: string[];
  createdBy?: string;
  expiresAt?: Date;
  /** Kept at the top of the War Room's Notices until then (the notice lives at least that long) */
  pinnedUntil?: Date | null;
  eventId?: number | null;
  now?: Date;
}): number {
  const now = params.now ?? new Date();
  const pinned = params.pinnedUntil ?? null;
  const keep = params.expiresAt ?? new Date(now.getTime() + NOTICE_KEEP_DAYS * DAY_MS);
  const expires = pinned && pinned > keep ? pinned : keep;
  const id = db.transaction(() => {
    const r = db
      .prepare(`INSERT INTO broadcasts (kind, title, body, emblem, audience, created_by, created_at, expires_at, event_id, pinned_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        params.kind,
        params.title,
        params.body,
        params.emblem ?? "📯",
        params.audience,
        params.createdBy ?? "realm",
        now.toISOString(),
        expires.toISOString(),
        params.eventId ?? null,
        pinned ? pinned.toISOString() : null
      );
    const bid = Number(r.lastInsertRowid);
    if (params.audience === "users") {
      const add = db.prepare(`INSERT OR IGNORE INTO broadcast_recipients (broadcast_id, user_id) VALUES (?, ?)`);
      for (const u of new Set(params.recipients ?? [])) add.run(bid, u);
    }
    return bid;
  })();
  latestBroadcastId = Math.max(latestBroadcastId, id);
  if (params.audience === "all") noticeLogger?.(`📯 ${params.title}`, "notice");
  return id;
}

const rowToBroadcast = (r: any): Broadcast => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  emblem: r.emblem,
  audience: r.audience,
  createdBy: r.created_by,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  read: Boolean(r.read),
  pinnedUntil: r.pinned_until ?? null
});

/** Notices the viewer may see, created since `sinceIso` and not expired, newest first */
function visibleBroadcasts(viewerId: string | null, sinceIso: string, now: Date, onlyUnread: boolean): Broadcast[] {
  if (!viewerId) {
    // Signed-out visitors: public notices only, nothing stored
    return (
      db
        .prepare(`SELECT *, 0 AS read FROM broadcasts WHERE audience = 'all' AND (created_at >= @since OR (pinned_until IS NOT NULL AND pinned_until > @now)) AND expires_at > @now ORDER BY id DESC LIMIT 50`)
        .all({ since: sinceIso, now: now.toISOString() }) as any[]
    ).map(rowToBroadcast);
  }
  const civ = (db.prepare(`SELECT civilization FROM users WHERE id = ?`).get(viewerId) as { civilization?: string } | undefined)?.civilization ?? "";
  const rows = db
    .prepare(`
      SELECT b.*, (rd.broadcast_id IS NOT NULL) AS read
      FROM broadcasts b
      LEFT JOIN broadcast_reads rd ON rd.broadcast_id = b.id AND rd.user_id = @viewer
      WHERE (b.created_at >= @since OR (b.pinned_until IS NOT NULL AND b.pinned_until > @now)) AND b.expires_at > @now
        AND (b.audience = 'all' OR b.audience = @civAudience
          OR (b.audience = 'users' AND EXISTS (SELECT 1 FROM broadcast_recipients br WHERE br.broadcast_id = b.id AND br.user_id = @viewer)))
        ${onlyUnread ? "AND rd.broadcast_id IS NULL" : ""}
      ORDER BY b.id DESC
      LIMIT 100
    `)
    .all({ viewer: viewerId, since: sinceIso, now: now.toISOString(), civAudience: `civ:${civ}` }) as any[];
  return rows.map(rowToBroadcast);
}

/** Unread notices for the herald, oldest first so they open in the order they happened */
export function getUnreadBroadcasts(viewerId: string | null, now = new Date()): Broadcast[] {
  const since = new Date(now.getTime() - NOTICE_HERALD_DAYS * DAY_MS).toISOString();
  return visibleBroadcasts(viewerId, since, now, true).reverse();
}

/** The War Room's 📯 Notices: everything the viewer could see in the last NOTICE_KEEP_DAYS, pinned ones first, then newest first */
export function listBroadcasts(viewerId: string | null, now = new Date()): Broadcast[] {
  const since = new Date(now.getTime() - NOTICE_KEEP_DAYS * DAY_MS).toISOString();
  const nowIso = now.toISOString();
  const isPinned = (b: Broadcast) => Boolean(b.pinnedUntil && b.pinnedUntil > nowIso);
  return visibleBroadcasts(viewerId, since, now, false).sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || b.id - a.id);
}

/** Mark notices read for a ruler (only ones they can see); returns how many were newly read */
export function markBroadcastsRead(viewerId: string, ids: number[] | "all", now = new Date()): number {
  const visible = new Set(visibleBroadcasts(viewerId, new Date(now.getTime() - NOTICE_KEEP_DAYS * DAY_MS).toISOString(), now, true).map((b) => b.id));
  const targets = ids === "all" ? [...visible] : ids.filter((id) => visible.has(id));
  const add = db.prepare(`INSERT OR IGNORE INTO broadcast_reads (broadcast_id, user_id, read_at) VALUES (?, ?, ?)`);
  let n = 0;
  db.transaction(() => {
    for (const id of targets) n += add.run(id, viewerId, now.toISOString()).changes;
  })();
  return n;
}

/* ------------------------------------------------------------------------- */
/* Notices the realm raises on its own                                        */
/* ------------------------------------------------------------------------- */

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);
const MEDALS = ["🥇", "🥈", "🥉"];

/** 🐉 Boss slain: to the whole realm, with the top damage dealers of its life */
export function announceBossSlain(params: {
  bossId: string;
  bossName: string;
  emblem: string;
  killerId: string;
  killerName: string;
  /** More than one ruler's armies fought the killing battle */
  rally: boolean;
  dealers: Array<{ userId: string; name: string; damage: number }>;
  now?: Date;
}) {
  const { bossName, killerName, dealers } = params;
  const total = dealers.reduce((s, d) => s + d.damage, 0);
  const top = dealers.slice(0, 3);
  const lines = [`${bossName} has fallen to ${killerName}'s ${params.rally ? "rally" : "army"}.`];
  if (top.length) {
    lines.push("", "Its bane, by damage dealt this life:");
    top.forEach((d, i) => lines.push(`${MEDALS[i]} ${d.name} — ${d.damage.toLocaleString("en-US")} (${pct(d.damage, total)}%)`));
    if (dealers.length > top.length) lines.push(`…and ${dealers.length - top.length} more who wounded it.`);
  }
  const eventId = recordRealmEvent(
    "boss_slain",
    params.killerId,
    params.bossId,
    { bossName, killerName, rally: params.rally, dealers: dealers.slice(0, 10), totalDamage: total },
    params.now
  );
  createBroadcast({ kind: "boss_slain", title: `${bossName} has fallen`, body: lines.join("\n"), emblem: params.emblem || "🐉", audience: "all", eventId, now: params.now });
}

const LOOT_KEYS = ["gold", "iron", "stone", "lumber", "food"] as const;

/** ⚔️ While you were away: what struck the ruler's kingdom since they were last seen (null when nothing did) */
export function whileAwaySummary(userId: string, sinceIso: string): { title: string; body: string; payload: Record<string, unknown> } | null {
  const reports = (
    db
      .prepare(`SELECT details_json FROM battle_reports WHERE defender_id = ? AND attacker_id != ? AND timestamp > ? ORDER BY timestamp ASC`)
      .all(userId, userId, sinceIso) as Array<{ details_json: string }>
  ).map((r) => JSON.parse(r.details_json) as BattleReport);
  if (reports.length === 0) return null;

  const breached = reports.filter((r) => r.attackerWon).length;
  const repelled = reports.length - breached;
  let lost = 0;
  let theirLosses = 0;
  const plunder: BattleLoot = {};
  const gems: Record<string, number> = {};
  const raiders = new Map<string, number>();
  for (const r of reports) {
    const mine = r.armies?.filter((a) => a.side === "defender" && a.ownerId === userId);
    lost += mine?.length ? mine.reduce((s, a) => s + a.losses, 0) : r.defenderCasualties;
    theirLosses += r.attackerCasualties;
    raiders.set(r.attackerName, (raiders.get(r.attackerName) ?? 0) + 1);
    if (r.attackerWon && r.loot) {
      for (const k of LOOT_KEYS) if (r.loot[k]) plunder[k] = (plunder[k] ?? 0) + r.loot[k]!;
      for (const [g, n] of Object.entries(r.loot.scarce ?? {})) gems[g] = (gems[g] ?? 0) + n;
    }
  }
  const burning = Boolean(reports[reports.length - 1].defenderBurning);
  const n = reports.length;

  const lines = [
    `${n} ${n === 1 ? "attack" : "attacks"} struck your kingdom: ${repelled} repelled, ${breached} breached.`,
    `🗡️ ${[...raiders].map(([name, c]) => (c > 1 ? `${name} (×${c})` : name)).join(", ")}`,
    `💀 You lost ${lost.toLocaleString("en-US")} ${lost === 1 ? "soldier" : "soldiers"}; the attackers lost ${theirLosses.toLocaleString("en-US")}.`
  ];
  const plunderParts = [
    ...LOOT_KEYS.filter((k) => plunder[k]).map((k) => `${plunder[k]!.toLocaleString("en-US")} ${k}`),
    ...Object.entries(gems).map(([g, c]) => `${c}× ${g}`)
  ];
  if (plunderParts.length) lines.push(`💰 Plunder taken: ${plunderParts.join(" · ")}`);
  if (burning) lines.push("🔥 Your walls were left burning: no one can attack you until they are repaired.");

  return {
    title: breached === 0 ? "While you were away, your walls held" : "While you were away, your kingdom was attacked",
    body: lines.join("\n"),
    payload: { attacks: n, repelled, breached, lost, theirLosses, plunder, gems, burning, reportIds: reports.map((r) => r.id) }
  };
}

const lastSeenWrite = new Map<string, number>();

/**
 * The ruler's client polled the realm. Coming back after AWAY_AFTER_MS or more, they get a "While you were away"
 * notice for the attacks on their kingdom since they were last seen. Writes last_seen_at at most once a minute.
 */
export function noteRulerSeen(userId: string, now = new Date()) {
  const t = now.getTime();
  const wrote = lastSeenWrite.get(userId);
  if (wrote !== undefined && t - wrote < SEEN_WRITE_MS) return;
  lastSeenWrite.set(userId, t);

  const row = db.prepare(`SELECT last_seen_at FROM users WHERE id = ?`).get(userId) as { last_seen_at: string | null } | undefined;
  if (!row) return;
  const last = row.last_seen_at ? Date.parse(row.last_seen_at) : NaN;
  if (Number.isFinite(last) && t - last >= AWAY_AFTER_MS) {
    const summary = whileAwaySummary(userId, row.last_seen_at!);
    if (summary) {
      const eventId = recordRealmEvent("while_away", null, userId, { since: row.last_seen_at, ...summary.payload }, now);
      createBroadcast({ kind: "while_away", title: summary.title, body: summary.body, emblem: "⚔️", audience: "users", recipients: [userId], eventId, now });
    }
  }
  db.prepare(`UPDATE users SET last_seen_at = ? WHERE id = ?`).run(now.toISOString(), userId);
}

const CIV_NAMES: Record<string, string> = { human: "👑 Humans", elf: "🏹 Elves", dwarf: "⚒️ Dwarves", orc: "🛡️ Orcs" };

/**
 * 🍂 Season change: once per season week, to the whole realm (checked every minute; the first check after a
 * Sunday 00:00 UTC raises it). Idempotent through realm_events, so a restart never repeats it
 */
export function announceSeasonIfNew(now = new Date()) {
  const s = seasonAt(now.getTime());
  const seen = db.prepare(`SELECT 1 FROM realm_events WHERE kind = 'season_change' AND target_id = ? LIMIT 1`).get(String(s.week));
  if (seen) return;
  const pctOf = (v: number) => `${Math.round(v * 100)}%`;
  const body = [
    s.story,
    "",
    `▲ ${CIV_NAMES[s.buffed]} flourish: +${pctOf(SEASON_MODS.harvest)} harvest, +${pctOf(SEASON_MODS.births)} births, +${pctOf(SEASON_MODS.march)} march speed.`,
    `▼ ${CIV_NAMES[s.debuffed]} struggle: −${pctOf(SEASON_MODS.harvest)} harvest, −${pctOf(SEASON_MODS.births)} births, −${pctOf(SEASON_MODS.march)} march speed.`,
    "The other kingdoms go on as ever; the Voidrift stands outside the seasons.",
    "",
    `${s.next.emblem} ${s.next.name} (${s.next.title}) follows next Sunday.`
  ].join("\n");
  const eventId = recordRealmEvent("season_change", null, String(s.week), { season: s.key, buffed: s.buffed, debuffed: s.debuffed }, now);
  createBroadcast({
    kind: "season_change",
    title: `${s.name} — the Season of ${s.title}`,
    body,
    emblem: s.emblem,
    audience: "all",
    // Gone when the season is
    expiresAt: new Date(s.endsAt),
    eventId,
    now
  });
}

/**
 * 🎉 A ruler declared a Festival (or was given one by royal decree, which records its own event): their own
 * civilization hears of it, and the notice is gone when the Festival is
 */
export function announceFestival(k: { id: string; name: string; civilization: string }, endsAt: number, opts: { eventId?: number; createdBy?: string } = {}, now = new Date()) {
  const eventId = opts.eventId ?? recordRealmEvent("festival", k.id, k.id, { endsAt }, now);
  createBroadcast({
    kind: "festival",
    title: opts.createdBy ? `By royal decree, ${k.name} holds a Festival` : `${k.name} holds a Festival`,
    body: [
      `Lanterns are strung across ${k.name}'s plaza, the townsfolk dance round the fountain and fireworks burst over the castle.`,
      "",
      `For a day its births are doubled (×${FESTIVAL.BIRTH_MULT}) and its workforce brings in ${Math.round((FESTIVAL.YIELD_MULT - 1) * 100)}% more.`
    ].join("\n"),
    emblem: "🎉",
    audience: `civ:${k.civilization}`,
    createdBy: opts.createdBy,
    expiresAt: new Date(endsAt),
    eventId,
    now
  });
}

/** A ruler counts as online while their client has polled within this long (last_seen_at is written once a minute) */
export const ONLINE_WINDOW_MS = 2.5 * 60 * 1000;

/** Ids of the rulers online now: signed in, with the realm open (GAME_GUIDE §10 *Who is online*) */
export function onlineRulerIds(now = Date.now()): string[] {
  const since = new Date(now - ONLINE_WINDOW_MS).toISOString();
  return (db.prepare(`SELECT id FROM users WHERE last_seen_at >= ?`).all(since) as Array<{ id: string }>).map((r) => r.id);
}
