import { db } from "./db.js";
import { createBroadcast, recordRealmEvent } from "./broadcasts.js";
import { weekWindow } from "./worldNpcs.js";
import { ChronicleWeek, DETECTORS, realmLabour } from "./chronicleDetectors.js";
import { checkMarks, marksPrompt, tidyMarks } from "./chronicleMarks.js";
import { ChronicleDigest, ChronicleDraft, ChronicleHappening, ChronicleMarks, ChronicleStory, DeveloperKingdom } from "./types.js";

/*
 * The Weekly Chronicle (GAME_GUIDE §15): a digest of last week's happenings, a ready prompt for any LLM made of the
 * digest, the style rules and the saga so far, and the stories the Crown published (the Codex's Chronicles). A
 * published story goes to the whole realm as a herald notice and a banner.
 */

db.exec(`
  -- Published weekly stories, one per week (the Codex's Chronicles; past ones feed the next prompt)
  CREATE TABLE IF NOT EXISTS chronicle_stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    digest_json TEXT,
    published_by TEXT NOT NULL,
    published_at TEXT NOT NULL,
    event_id INTEGER,
    -- What the game adorns it with: its rulers' peoples and the strip of happenings (ChronicleMarks)
    marks_json TEXT
  );
`);
if (!(db.prepare(`PRAGMA table_info(chronicle_stories)`).all() as Array<{ name: string }>).some((c) => c.name === "marks_json")) {
  db.exec(`ALTER TABLE chronicle_stories ADD COLUMN marks_json TEXT`);
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
export const CHRONICLE_MAX_TITLE = 100;
export const CHRONICLE_MAX_BODY = 6000;
/** Past stories the prompt carries so the saga continues */
export const CHRONICLE_PROMPT_PAST = 3;
/** The banner shows a story for this long after it is published */
export const CHRONICLE_BANNER_DAYS = 7;
/** Weeks back the panel offers (besides the running one) */
const WEEKS_OFFERED = 4;
/** Most facts a digest lists */
const DIGEST_MAX = 24;
/** Happenings on a story's strip */
const STRIP_MAX = 7;

/** A quiet week's line */
export const QUIET_WEEK = "No great deeds; the realm rests and its heroes sharpen their blades.";

function weekOf(weekKey: string): ChronicleWeek {
  const from = Date.parse(`${weekKey}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey) || !Number.isFinite(from) || new Date(from).getUTCDay() !== 0) throw new Error("Pick a week (its Sunday, YYYY-MM-DD).");
  return { from, to: from + WEEK_MS, fromIso: new Date(from).toISOString(), toIso: new Date(from + WEEK_MS).toISOString() };
}

/** The last finished week's key (the one Monday's story tells) */
export const lastWeekKey = (now = Date.now()) => new Date(weekWindow(now).startsAt - WEEK_MS).toISOString().slice(0, 10);

/** Every detector over one week; a detector that fails is skipped, never the digest */
export function buildDigest(weekKey: string): ChronicleDigest {
  const w = weekOf(weekKey);
  const happenings: ChronicleHappening[] = [];
  for (const d of DETECTORS) {
    try {
      happenings.push(...d.detect(w));
    } catch (err: any) {
      console.error(`[Chronicle] Detector ${d.id} failed:`, err.message);
    }
  }
  happenings.sort((a, b) => b.weight - a.weight);
  let labour: string[] = [];
  try {
    labour = realmLabour(w);
  } catch (err: any) {
    console.error("[Chronicle] The labour count failed:", err.message);
  }
  return { weekKey, from: w.fromIso, to: new Date(w.to - 1).toISOString(), quiet: happenings.length === 0, happenings: happenings.slice(0, DIGEST_MAX), labour };
}

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const weekLabel = (d: Pick<ChronicleDigest, "from" | "to">) => `${dayLabel(d.from)} – ${dayLabel(d.to)}`;

function rowToStory(r: any): ChronicleStory {
  const who = db.prepare(`SELECT full_name, username FROM users WHERE id = ?`).get(r.published_by) as { full_name?: string; username?: string } | undefined;
  return {
    id: r.id,
    weekKey: r.week_key,
    title: r.title,
    body: r.body,
    publishedBy: r.published_by,
    publishedByName: who ? who.full_name || who.username || r.published_by : r.published_by === "admin" ? "the Crown" : r.published_by,
    publishedAt: r.published_at,
    marks: r.marks_json ? JSON.parse(r.marks_json) : null
  };
}

/** The Codex's Chronicles: every published story, newest week first */
export function listChronicles(limit = 100): ChronicleStory[] {
  return (db.prepare(`SELECT * FROM chronicle_stories ORDER BY week_key DESC LIMIT ?`).all(limit) as any[]).map(rowToStory);
}

/** /status → `chronicle`: the latest story while it is under CHRONICLE_BANNER_DAYS old */
export function latestChronicle(now = Date.now()): Pick<ChronicleStory, "id" | "title" | "weekKey" | "publishedAt"> | null {
  const r = db.prepare(`SELECT id, title, week_key, published_at FROM chronicle_stories WHERE published_at >= ? ORDER BY published_at DESC LIMIT 1`).get(new Date(now - CHRONICLE_BANNER_DAYS * DAY_MS).toISOString()) as
    | { id: number; title: string; week_key: string; published_at: string }
    | undefined;
  return r ? { id: r.id, title: r.title, weekKey: r.week_key, publishedAt: r.published_at } : null;
}

/** The prompt an admin copies into any LLM: style rules, the saga so far, and the week's digest */
export function buildPrompt(digest: ChronicleDigest, past: ChronicleStory[]): string {
  const lines = [
    "You are the Royal Chronicler of the Realm of Git, a land of five peoples: the Humans of Valoria, the Elves of Sylvandale, the Dwarves of Ironforge, the Orcs of Drak'mar and the sorcerers of Nethergarde, who hold the Voidrift at the heart of the world.",
    `Write this week's chapter of the realm's saga, about the week of ${weekLabel(digest)}.`,
    "",
    "STYLE RULES",
    "- Medieval and dramatic: a bard's tale told in the great hall, in the past tense. Battles, sieges, omens, triumphs and losses.",
    "- 250 to 450 words, in a few short paragraphs. No lists, no headings, no tables.",
    "- Use the rulers' names exactly as they are written below, and no other real names. Never invent new rulers; heroes of legend may be named only if clearly made up (as Ser Aldric or Jane Doe would be).",
    "- Never mention commits, lines, code, repositories, pull requests, programming or any real-world work. The realm's labour is forging, building and weaving, nothing more.",
    "- Keep the numbers the happenings give for battles and losses, but tell them as a chronicler would.",
    "- Never make anyone look foolish; the beaten fought bravely. Keep it kind enough to read aloud to the whole realm.",
    "- Open with the week's greatest happening (the first one listed below), then tell the rest.",
    "- If the saga so far is given, continue it: call back to earlier chapters where it fits, and do not retell them.",
    "",
    ...marksPrompt(),
    "",
    "REPLY FORMAT",
    "Plain text only: no markdown, no bold, no headings, no lists.",
    "First line: the chapter's title (at most 80 characters, no quotes, no marks, no \"Title:\"). Then a blank line. Then the story, beginning with its [insignia:key].",
    ""
  ];
  if (past.length) {
    lines.push("THE SAGA SO FAR (oldest first; keep their marks in mind, don't copy them)");
    for (const s of [...past].reverse()) lines.push("", `## ${s.title} (week of ${dayLabel(`${s.weekKey}T00:00:00Z`)})`, s.body.trim());
    lines.push("");
  } else {
    lines.push("THE SAGA SO FAR", "This is the first chapter.", "");
  }
  lines.push(`THIS WEEK'S HAPPENINGS (${weekLabel(digest)})`);
  if (digest.quiet) lines.push(`- ${QUIET_WEEK}`);
  for (const h of digest.happenings) lines.push(`- ${h.text}`);
  if (digest.labour.length) {
    lines.push("", "THE REALM'S LABOUR");
    for (const l of digest.labour) lines.push(`- ${l}`);
  }
  return lines.join("\n");
}

/** Weeks the panel offers: this week so far (a preview), then the last few finished ones */
function weeksOffered(now = Date.now()) {
  const current = weekWindow(now).startsAt;
  const published = new Set((db.prepare(`SELECT week_key FROM chronicle_stories`).all() as Array<{ week_key: string }>).map((r) => r.week_key));
  return Array.from({ length: WEEKS_OFFERED + 1 }, (_, i) => {
    const from = current - i * WEEK_MS;
    const weekKey = new Date(from).toISOString().slice(0, 10);
    const label = i === 0 ? "This week so far" : i === 1 ? "Last week" : `${i} weeks ago`;
    return { weekKey, label: `${label} (${weekLabel({ from: new Date(from).toISOString(), to: new Date(from + WEEK_MS - 1).toISOString() })})`, finished: i > 0, published: published.has(weekKey) };
  });
}

/** GET /decrees/chronicle: the digest and the ready prompt for a week (default: last week) */
export function getChronicleDraft(weekKey?: unknown, now = Date.now()): ChronicleDraft {
  const key = typeof weekKey === "string" && weekKey ? weekKey : lastWeekKey(now);
  const digest = buildDigest(key);
  const row = db.prepare(`SELECT * FROM chronicle_stories WHERE week_key = ?`).get(key);
  // The saga so far: the stories before this week, newest first
  const past = (db.prepare(`SELECT * FROM chronicle_stories WHERE week_key < ? ORDER BY week_key DESC LIMIT ?`).all(key, CHRONICLE_PROMPT_PAST) as any[]).map(rowToStory);
  return { digest, prompt: buildPrompt(digest, past), published: row ? rowToStory(row) : null, weeks: weeksOffered(now) };
}

/** The rulers a story names (longest names first, so a name inside another is not matched twice) and the week's strip */
function marksOf(body: string, digest: ChronicleDigest, kingdoms: DeveloperKingdom[]): ChronicleMarks {
  const rulers = kingdoms
    .filter((k) => k.name && body.includes(k.name))
    .map((k) => ({ name: k.name, civ: k.civilization }))
    .sort((a, b) => b.name.length - a.name.length);
  const seen = new Set<string>();
  const happenings = digest.happenings
    .filter((h) => !seen.has(h.kind) && seen.add(h.kind))
    .slice(0, STRIP_MAX)
    .map((h) => ({ kind: h.kind, emblem: h.emblem, label: h.label }));
  return { rulers, happenings };
}

/** POST /decrees/chronicle/check: the story with its marks tidied, their problems and how it will be adorned, for the panel's preview */
export function previewChronicle(weekKey: unknown, body: unknown, kingdoms: DeveloperKingdom[]) {
  const text = tidyMarks(String(body ?? ""));
  return { body: text, errors: checkMarks(text), marks: marksOf(text, buildDigest(String(weekKey ?? lastWeekKey())), kingdoms) };
}

/**
 * 📖 Publish a finished week's story: saved for the Codex's Chronicles, a herald notice to the whole realm (its
 * banner follows from /status), and a realm event for the decree audit
 */
export function publishChronicle(params: { actorId: string; weekKey: unknown; title: unknown; body: unknown; kingdoms: DeveloperKingdom[] }, now = new Date()) {
  const weekKey = String(params.weekKey ?? "");
  const w = weekOf(weekKey);
  if (w.to > now.getTime()) throw new Error("That week isn't over yet; its story is told once it has ended.");
  const title = String(params.title ?? "").trim();
  const body = tidyMarks(String(params.body ?? "")).trim();
  if (!title) throw new Error("Give the story a title.");
  if (!body) throw new Error("Paste or write the story first.");
  if (title.length > CHRONICLE_MAX_TITLE) throw new Error(`Keep the title under ${CHRONICLE_MAX_TITLE} characters.`);
  if (body.length > CHRONICLE_MAX_BODY) throw new Error(`Keep the story under ${CHRONICLE_MAX_BODY} characters.`);
  if (db.prepare(`SELECT 1 FROM chronicle_stories WHERE week_key = ?`).get(weekKey)) throw new Error("That week's story is published already.");
  if (/<[^>]*>|\[[a-z/-]+(?::[a-z-]+)?\]/.test(title)) throw new Error("The title can't hold marks.");
  const markErrors = checkMarks(body);
  if (markErrors.length) throw new Error(`Fix the story's marks first: ${markErrors.join(" ")}`);

  const digest = buildDigest(weekKey);
  const label = weekLabel(digest);
  const eventId = recordRealmEvent("decree_chronicle", params.actorId, null, { weekKey, title }, now);
  db.prepare(`INSERT INTO chronicle_stories (week_key, title, body, digest_json, published_by, published_at, event_id, marks_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    weekKey,
    title,
    body,
    JSON.stringify(digest),
    params.actorId,
    now.toISOString(),
    eventId,
    JSON.stringify(marksOf(body, digest, params.kingdoms))
  );
  createBroadcast({
    kind: "chronicle",
    title,
    body: `${body}\n\n📖 The Weekly Chronicle, the week of ${label}. Kept in the Royal Codex under Chronicles.`,
    emblem: "📖",
    audience: "all",
    createdBy: params.actorId,
    eventId,
    now
  });
  return { message: `"${title}" was published to the whole realm.` };
}
