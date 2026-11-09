import { db } from "./db.js";
import { config } from "./env.js";
import { createBroadcast, recordRealmEvent } from "./broadcasts.js";
import {
  DISASTERS,
  DISASTER_SCHEDULE,
  DisasterKind,
  DisasterSpan,
  dateKeyIn,
  disasterAt,
  rollDisasterSchedule,
  setDisasterCalendar,
  setDisasterTallyHook
} from "./disasterRules.js";
import type { CivilizationType, DisasterStatus } from "./types.js";

/**
 * World disasters (GAME_GUIDE §10 *World Disasters*): the `world_disasters` table, the herald's warning (an hour
 * before), start and end notices with their realm events, and the admin's way to call one now. The rules and the
 * seeded schedule are in disasterRules.ts; this module writes the rolled schedule into the table a day or two ahead,
 * and hands the calendar back to disasterRules so the harvest, marches and battles read it without the database.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

db.exec(`
  -- 🌪️ World disasters: the seeded schedule written a day or two ahead (day_key), and any an admin called (day_key NULL)
  CREATE TABLE IF NOT EXISTS world_disasters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    -- The herald notices raised so far (1 = done)
    warned INTEGER NOT NULL DEFAULT 0,
    started INTEGER NOT NULL DEFAULT 0,
    ended INTEGER NOT NULL DEFAULT 0,
    day_key TEXT UNIQUE,
    called_by TEXT,
    -- What it did, by civilization: { "<civ>": { "<what>": n } }
    tally_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_world_disasters_ends ON world_disasters(ends_at);
`);

interface DisasterRow {
  id: number;
  kind: DisasterKind;
  starts_at: number;
  ends_at: number;
  warned: number;
  started: number;
  ended: number;
  day_key: string | null;
  called_by: string | null;
  tally_json: string | null;
}

type Tally = Partial<Record<CivilizationType, Record<string, number>>>;

const rowSpan = (r: DisasterRow): DisasterSpan => ({ id: r.id, kind: r.kind, startsAt: r.starts_at, endsAt: r.ends_at });

/** Reload the calendar disasterRules reads: everything not yet over (plus the last hour, for late battle rounds) */
function refreshCalendar(now = Date.now()) {
  const rows = db.prepare(`SELECT * FROM world_disasters WHERE ends_at > ? ORDER BY starts_at`).all(now - HOUR_MS) as DisasterRow[];
  setDisasterCalendar(rows.map(rowSpan));
}

setDisasterTallyHook((id, civ, key, n) => {
  const row = db.prepare(`SELECT tally_json FROM world_disasters WHERE id = ?`).get(id) as { tally_json: string | null } | undefined;
  if (!row) return;
  const tally: Tally = row.tally_json ? JSON.parse(row.tally_json) : {};
  const forCiv = (tally[civ] ??= {});
  forCiv[key] = (forCiv[key] ?? 0) + n;
  db.prepare(`UPDATE world_disasters SET tally_json = ? WHERE id = ?`).run(JSON.stringify(tally), id);
});

/** Write the rolled schedule into the table from yesterday to two days ahead (never over a disaster already there) */
function writeSchedule(now: number) {
  const tz = config.realmTimezone;
  const scheduled = rollDisasterSchedule(dateKeyIn(now + 2 * DAY_MS, tz), tz).filter((d) => d.endsAt > now - DAY_MS);
  const overlaps = db.prepare(`SELECT 1 FROM world_disasters WHERE starts_at < ? AND ends_at > ? AND (day_key IS NULL OR day_key != ?) LIMIT 1`);
  const insert = db.prepare(`INSERT OR IGNORE INTO world_disasters (kind, starts_at, ends_at, day_key) VALUES (?, ?, ?, ?)`);
  for (const d of scheduled) {
    if (overlaps.get(d.endsAt, d.startsAt, d.day)) continue;
    // One already past when first written (the server was down) is written as done, with no notices
    const done = d.endsAt <= now ? 1 : 0;
    const r = insert.run(d.kind, d.startsAt, d.endsAt, d.day);
    if (r.changes && done) db.prepare(`UPDATE world_disasters SET warned = 1, started = 1, ended = 1 WHERE id = ?`).run(r.lastInsertRowid);
  }
}

const CIV_NAMES: Record<CivilizationType, string> = { human: "👑 Humans", elf: "🏹 Elves", dwarf: "⚒️ Dwarves", orc: "🛡️ Orcs", arcane: "🌀 Nethergarde" };

/** What a disaster did, as lines for its closing notice */
const TALLY_LINES: Record<string, (n: number) => string> = {
  road: (n) => `${n.toLocaleString()} marchers lost on the roads`,
  plague: (n) => `${n.toLocaleString()} civilians taken by the plague`,
  births: (n) => `${n.toLocaleString()} fewer births`,
  void_well: (n) => `${n.toLocaleString()} fallen held back in the Void Well`,
  withheld: (n) => `${n.toLocaleString()} resources the blighted pool never paid`,
  rounds: (n) => `${n.toLocaleString()} battle rounds fought under the red moon`,
  fallen: (n) => `${n.toLocaleString()} soldiers fell in them`
};

function tallyLines(tally: Tally): string[] {
  return (Object.keys(tally) as CivilizationType[]).flatMap((civ) => {
    const parts = Object.entries(tally[civ] ?? {})
      .filter(([k, n]) => n > 0 && TALLY_LINES[k])
      .map(([k, n]) => TALLY_LINES[k](n));
    return parts.length ? [`${CIV_NAMES[civ]}: ${parts.join(", ")}.`] : [];
  });
}

const sideLines = (kind: DisasterKind) => {
  const d = DISASTERS[kind];
  return [`▲ ${CIV_NAMES[d.copes]} cope: ${d.copeText}`, `▼ ${CIV_NAMES[d.suffers]} suffer: ${d.sufferText}`];
};

const realmClock = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: config.realmTimezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));

function eventPayload(r: DisasterRow, extra: Record<string, unknown> = {}) {
  const d = DISASTERS[r.kind];
  return { kind: r.kind, name: d.name, startsAt: r.starts_at, endsAt: r.ends_at, copes: d.copes, suffers: d.suffers, calledBy: r.called_by, ...extra };
}

/** ⚠️ An hour before: dark clouds gather */
function warn(r: DisasterRow, now: number) {
  const d = DISASTERS[r.kind];
  const eventId = recordRealmEvent("disaster_warning", null, String(r.id), eventPayload(r), new Date(now));
  createBroadcast({
    kind: "disaster",
    title: `Dark clouds gather over the realm: ${d.name} strikes within the hour`,
    body: [d.omen, "", `${d.emblem} ${d.name} from ${realmClock(r.starts_at)} to ${realmClock(r.ends_at)} (realm time). ${d.effect}`, "", ...sideLines(r.kind)].join("\n"),
    emblem: "⛈️",
    audience: "all",
    expiresAt: new Date(r.ends_at),
    eventId,
    now: new Date(now)
  });
}

function start(r: DisasterRow, now: number) {
  const d = DISASTERS[r.kind];
  const eventId = recordRealmEvent("disaster_start", null, String(r.id), eventPayload(r), new Date(now));
  createBroadcast({
    kind: "disaster",
    title: `${r.called_by ? "By the realm's will, disaster" : "Disaster"} strikes: the ${d.name}`,
    body: [d.omen, "", `${d.effect} It lasts until ${realmClock(r.ends_at)} (realm time).`, "", ...sideLines(r.kind)].join("\n"),
    emblem: d.emblem,
    audience: "all",
    expiresAt: new Date(r.ends_at),
    eventId,
    now: new Date(now)
  });
}

function end(r: DisasterRow, now: number) {
  const d = DISASTERS[r.kind];
  const tally: Tally = r.tally_json ? JSON.parse(r.tally_json) : {};
  const lines = tallyLines(tally);
  const eventId = recordRealmEvent(
    "disaster_end",
    null,
    String(r.id),
    eventPayload(r, { endedAt: now, coped: d.copes, suffered: d.suffers, tally }),
    new Date(now)
  );
  createBroadcast({
    kind: "disaster",
    title: `The realm weathers the ${d.name}`,
    body: [
      `The skies clear and the realm counts its losses.`,
      ...(lines.length ? ["", ...lines] : ["", "The realm weathered it without a scratch."]),
      "",
      `${CIV_NAMES[d.copes]} coped best; ${CIV_NAMES[d.suffers]} suffered most.`
    ].join("\n"),
    emblem: d.emblem,
    audience: "all",
    expiresAt: new Date(now + 2 * DAY_MS),
    eventId,
    now: new Date(now)
  });
}

/**
 * The disaster clock (every minute, and once on start): write the schedule ahead, raise the warning, start and end
 * notices that are due, and reload the calendar. Each notice is raised once (flags in the row), so a restart never
 * repeats one
 */
export function tickDisasters(now = Date.now()) {
  writeSchedule(now);
  const rows = db.prepare(`SELECT * FROM world_disasters WHERE ended = 0 ORDER BY starts_at`).all() as DisasterRow[];
  for (const r of rows) {
    if (now >= r.ends_at) {
      // Over: the end notice, if it ever started (one the server slept through ends quietly)
      if (r.started) end(r, now);
      db.prepare(`UPDATE world_disasters SET warned = 1, started = 1, ended = 1 WHERE id = ?`).run(r.id);
      continue;
    }
    if (!r.warned && now >= r.starts_at - DISASTER_SCHEDULE.WARNING_MS && now < r.starts_at) {
      warn(r, now);
      db.prepare(`UPDATE world_disasters SET warned = 1 WHERE id = ?`).run(r.id);
    }
    if (!r.started && now >= r.starts_at) {
      start(r, now);
      db.prepare(`UPDATE world_disasters SET warned = 1, started = 1 WHERE id = ?`).run(r.id);
    }
  }
  refreshCalendar(now);
}

/**
 * What /status carries: the disaster in force, or the next one once the herald has warned of it (an hour ahead);
 * the schedule further out stays hidden
 */
export function disasterStatus(now = Date.now()): DisasterStatus | null {
  const active = disasterAt(now);
  const row = active
    ? (db.prepare(`SELECT * FROM world_disasters WHERE id = ?`).get(active.id) as DisasterRow | undefined)
    : (db
        .prepare(`SELECT * FROM world_disasters WHERE ended = 0 AND starts_at > ? AND starts_at <= ? ORDER BY starts_at LIMIT 1`)
        .get(now, now + DISASTER_SCHEDULE.WARNING_MS) as DisasterRow | undefined);
  if (!row) return null;
  return { id: row.id, kind: row.kind, startsAt: row.starts_at, endsAt: row.ends_at, active: now >= row.starts_at && now < row.ends_at };
}

/**
 * Admin (and the dev script): call a disaster now, or in `inMinutes` (≤ 60, so its warning shows first). A disaster in
 * force or due in the meantime is ended / dropped so two never overlap. Returns the new row's status
 */
export function callDisaster(kind: DisasterKind, calledBy: string, inMinutes = 0, now = Date.now(), opts: { tick?: boolean } = {}): DisasterStatus | null {
  if (!DISASTERS[kind]) throw new Error(`Unknown disaster "${kind}".`);
  const startsAt = now + Math.max(0, Math.min(60, Math.round(inMinutes))) * 60 * 1000;
  const endsAt = startsAt + DISASTER_SCHEDULE.DURATION_MS;
  db.transaction(() => {
    // One in force ends now; ones that would overlap are called off (their row stays, so the schedule won't rewrite them)
    db.prepare(`UPDATE world_disasters SET ends_at = ? WHERE starts_at <= ? AND ends_at > ? AND ended = 0`).run(now, now, now);
    db.prepare(`UPDATE world_disasters SET ends_at = starts_at, warned = 1, started = 1, ended = 1 WHERE starts_at > ? AND starts_at < ? AND ended = 0`).run(now, endsAt);
    db.prepare(`INSERT INTO world_disasters (kind, starts_at, ends_at, called_by) VALUES (?, ?, ?, ?)`).run(kind, startsAt, endsAt, calledBy);
  })();
  // The dev script leaves the notices to the running server's clock (so its clients hear of them)
  if (opts.tick === false) return null;
  tickDisasters(now);
  return disasterStatus(now);
}

/** Admin: end the disaster in force now (its closing notice follows) */
export function endDisasterNow(now = Date.now(), opts: { tick?: boolean } = {}): boolean {
  const r = db.prepare(`UPDATE world_disasters SET ends_at = ? WHERE starts_at <= ? AND ends_at > ? AND ended = 0`).run(now, now, now);
  if (opts.tick !== false) tickDisasters(now);
  return r.changes > 0;
}

/** Admin panel: the disasters of the last week and the next two days, newest first */
export function listDisasters(now = Date.now()) {
  writeSchedule(now);
  const rows = db.prepare(`SELECT * FROM world_disasters WHERE ends_at > ? AND starts_at < ? ORDER BY starts_at DESC`).all(now - 7 * DAY_MS, now + 2 * DAY_MS) as DisasterRow[];
  return rows.map((r) => ({
    ...rowSpan(r),
    scheduled: Boolean(r.day_key),
    calledBy: r.called_by,
    tally: (r.tally_json ? JSON.parse(r.tally_json) : {}) as Tally
  }));
}
