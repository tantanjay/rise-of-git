import { db, getKingdomResources, spendGems, spendResources } from "./db.js";
import { createBroadcast, recordRealmEvent } from "./broadcasts.js";
import { kitLines } from "./battleArts.js";
import { EPIC_GEM } from "./armoryRules.js";
import { dateKeyIn } from "./disasterRules.js";
import { config } from "./env.js";
import {
  CHAMPION_ART_SHARE,
  CHAMPION_MAX_LEVEL,
  ChampionArts,
  ChampionCost,
  ChampionXpReason,
  DAILY_RENOWN,
  KIT_SLOTS,
  KIT_SLOT_NAMES,
  KitSlot,
  RETRAIN_COST,
  battleRenown,
  championDurationText,
  championKit,
  championLevelOf,
  championStats,
  diminished,
  hastenCost,
  healMsFor,
  kitEntry,
  kitSlotId,
  kitSlotLevel,
  poolFor,
  rerollCost,
  retrainBlock,
  retrained,
  rollArts,
  rollLooks,
  rollName
} from "./championRules.js";
import type { ChampionInBattle } from "./combat.js";
import type { UnitKit } from "./battleArts.js";
import type { ChampionLedgerEntry, ChampionLooks, ChampionView, CivilizationType, DeveloperKingdom, MarchChampion } from "./types.js";

/**
 * 🦸 Champions (GAME_GUIDE §13 *Champions*): each kingdom's hero, its Renown ledger, its wounds and what a ruler can do
 * with it (hasten its healing, re-roll its looks, retrain an Art). The rules and numbers are in championRules.ts; the
 * war engine (warEngine.ts) puts a champion at the head of a march or the home garrison and calls back here when the
 * battle is over.
 *
 * Where it is comes from the march it leads: `march_id` points at an active march while it is away, and a march that
 * came home (or was lost) frees it without anything else to update.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS kingdom_champions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    looks_json TEXT NOT NULL,
    arts_json TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    march_id TEXT,
    wounded_until INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS champion_xp_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    champion_id TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    battle_id TEXT,
    detail TEXT,
    level_before INTEGER NOT NULL,
    level_after INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_champion_xp_ledger_user ON champion_xp_ledger(user_id, created_at);
`);

{
  const cols = (db.prepare(`PRAGMA table_info(active_marches)`).all() as Array<{ name: string }>).map((c) => c.name);
  // This module loads before warEngine creates the table: on a brand-new database its CREATE brings the column
  if (cols.length > 0 && !cols.includes("champion_json")) db.exec(`ALTER TABLE active_marches ADD COLUMN champion_json TEXT`);
}

interface ChampionRow {
  id: string;
  user_id: string;
  name: string;
  looks_json: string;
  arts_json: string;
  xp: number;
  march_id: string | null;
  wounded_until: number | null;
  created_at: number;
}

/** Levels the realm hears about (the weekly story tells them) */
export const CHAMPION_MILESTONES = [10, 20, 30];

const owner = (userId: string) =>
  db.prepare(`SELECT id, full_name, username, civilization, city_hall_level FROM users WHERE id = ?`).get(userId) as
    | { id: string; full_name: string | null; username: string; civilization: CivilizationType; city_hall_level: number | null }
    | undefined;
const cityHallOf = (userId: string) => owner(userId)?.city_hall_level ?? 1;
const civOf = (userId: string): CivilizationType => owner(userId)?.civilization ?? "human";
const gemOf = (civ: CivilizationType) => (EPIC_GEM[civ] ?? EPIC_GEM.human).key;
const looksOf = (r: ChampionRow) => JSON.parse(r.looks_json) as ChampionLooks;
const artsOf = (r: ChampionRow) => JSON.parse(r.arts_json) as ChampionArts;
const rowOf = (userId: string) => db.prepare(`SELECT * FROM kingdom_champions WHERE user_id = ?`).get(userId) as ChampionRow | undefined;

/**
 * A ruler's champion, rolled the first time anyone asks (seeded by the ruler, so it is always the same hero): its name
 * from its civilization at birth, its looks and its Arts. Returns undefined for a user who isn't in the realm
 */
export function ensureChampion(userId: string, now = Date.now()): ChampionRow | undefined {
  const have = rowOf(userId);
  if (have) return have;
  const u = owner(userId);
  if (!u) return undefined;
  const seed = `champion:${userId}`;
  db.prepare(`INSERT OR IGNORE INTO kingdom_champions (id, user_id, name, looks_json, arts_json, xp, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`).run(
    `champ_${userId}`,
    userId,
    rollName(seed, u.civilization),
    JSON.stringify(rollLooks(seed)),
    JSON.stringify(rollArts(seed)),
    now
  );
  return rowOf(userId);
}

/** Is the march a champion points at still out (on the road, fighting, in a rally lobby or coming home)? */
const marchOut = (marchId: string | null) =>
  Boolean(marchId && db.prepare(`SELECT 1 FROM active_marches WHERE id = ? AND status = 'marching' AND COALESCE(phase, 'outbound') != 'done'`).get(marchId));

/** Where a champion is now */
export function championStatus(r: ChampionRow, now = Date.now()): "home" | "away" | "wounded" {
  if (r.wounded_until && r.wounded_until > now) return "wounded";
  if (r.march_id && marchOut(r.march_id)) return "away";
  return "home";
}

/** Why the ruler's champion can't lead a march now (null = it can) */
export function championLeadBlock(userId: string, now = Date.now()): string | null {
  const r = ensureChampion(userId, now);
  if (!r) return "You have no champion.";
  const s = championStatus(r, now);
  if (s === "away") return `${r.name} already leads another march.`;
  if (s === "wounded") return `${r.name} is wounded: whole again in ${championDurationText((r.wounded_until ?? now) - now)}.`;
  return null;
}

/** A champion's level now (its Renown, capped by its kingdom's City Hall) */
export const championLevel = (r: ChampionRow, cityHallLevel = cityHallOf(r.user_id)) => championLevelOf(r.xp, cityHallLevel).level;

/** The champion sets off at the head of `marchId` (inside the march's transaction): what the march records */
export function takeChampion(userId: string, marchId: string, now = Date.now()): MarchChampion {
  const block = championLeadBlock(userId, now);
  if (block) throw new Error(block);
  const r = rowOf(userId)!;
  db.prepare(`UPDATE kingdom_champions SET march_id = ? WHERE id = ?`).run(marchId, r.id);
  db.prepare(`UPDATE active_marches SET champion_json = ? WHERE id = ?`).run(JSON.stringify(marchChampionOf(r)), marchId);
  return marchChampionOf(r);
}

export const marchChampionOf = (r: ChampionRow): MarchChampion => ({ id: r.id, name: r.name, level: championLevel(r), looks: looksOf(r) });

/** The fields a stack (or the home garrison) led by this champion fights with: its kit at its level, its art share, its stats */
export function championBattleFields(userId: string, share = 1): { kit: UnitKit; artShare: number; champion: ChampionInBattle } | null {
  const r = ensureChampion(userId);
  if (!r) return null;
  const level = championLevel(r);
  const st = championStats(level);
  return {
    kit: championKit(r.name, artsOf(r), level),
    artShare: CHAMPION_ART_SHARE * share,
    champion: { id: r.id, userId, name: r.name, level, hp: st.hp * share, atk: st.atk * share, def: st.def * share }
  };
}

/** Is the ruler's champion at home and fit (it leads the home garrison's defence)? */
export function championHome(userId: string, now = Date.now()): boolean {
  const r = ensureChampion(userId, now);
  return Boolean(r && championStatus(r, now) === "home");
}

/**
 * The army a champion led was wiped out: it falls, wounded, and is carried home (it heals by itself). `marchId` is the
 * march it fell with (null: the home garrison). A champion out at the head of another march wasn't there and doesn't fall
 */
export function woundChampion(userId: string, place: string, marchId: string | null, now = Date.now()) {
  const r = rowOf(userId);
  if (!r || (r.wounded_until && r.wounded_until > now)) return;
  if (r.march_id && r.march_id !== marchId && marchOut(r.march_id)) return;
  const level = championLevel(r);
  const ms = healMsFor(level);
  db.prepare(`UPDATE kingdom_champions SET march_id = NULL, wounded_until = ? WHERE id = ?`).run(now + ms, r.id);
  const eventId = recordRealmEvent("champion_fell", userId, null, { name: r.name, level, place }, new Date(now));
  createBroadcast({
    kind: "champion",
    title: `${r.name} fell at ${place}`,
    emblem: "🦸",
    body: `The army ${r.name} led was broken at ${place}. Your champion is carried home wounded and will be whole again in ${championDurationText(ms)} (hasten it from the Champion's card).`,
    audience: "users",
    recipients: [userId],
    eventId,
    now: new Date(now)
  });
}

/** Renown the champion earned today (realm day), raw: the day's diminishing reads it */
function rawToday(championId: string, now: number): number {
  const day = dateKeyIn(now, config.realmTimezone);
  const rows = db
    .prepare(`SELECT delta, reason, created_at FROM champion_xp_ledger WHERE champion_id = ? AND created_at > ? AND reason NOT IN ('daily_diminish', 'admin_adjust', 'capped_by_city_hall')`)
    .all(championId, now - 26 * 3_600_000) as Array<{ delta: number; created_at: number }>;
  return rows.filter((x) => dateKeyIn(x.created_at, config.realmTimezone) === day).reduce((a, x) => a + x.delta, 0);
}

const ledgerInsert = (r: ChampionRow, delta: number, reason: ChampionXpReason, battleId: string | null, detail: string | null, before: number, after: number, now: number) =>
  db
    .prepare(`INSERT INTO champion_xp_ledger (user_id, champion_id, delta, reason, battle_id, detail, level_before, level_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(r.user_id, r.id, delta, reason, battleId, detail, before, after, now);

/**
 * A battle the champion led is over: its Renown, line by line into the ledger, the day's diminishing as its own line, and
 * a note when it earns at its City Hall's cap. Returns what counted and its level after (null without a champion)
 */
export function awardRenown(
  userId: string,
  battleId: string,
  o: Parameters<typeof battleRenown>[0],
  place: string,
  now = Date.now()
): { renown: number; levelAfter: number; name: string } | null {
  const r = ensureChampion(userId, now);
  if (!r) return null;
  const lines = battleRenown(o);
  const raw = lines.reduce((a, l) => a + l.delta, 0);
  if (raw <= 0) return { renown: 0, levelAfter: championLevel(r), name: r.name };
  const cityHall = cityHallOf(userId);
  const counted = diminished(rawToday(r.id, now), raw);
  const before = championLevelOf(r.xp, cityHall).level;
  const after = championLevelOf(r.xp + counted, cityHall);
  db.transaction(() => {
    for (const l of lines) ledgerInsert(r, l.delta, l.reason, battleId, place, before, before, now);
    if (counted < raw) ledgerInsert(r, counted - raw, "daily_diminish", battleId, `Renown thins after ${DAILY_RENOWN.full} a day (half to ${DAILY_RENOWN.half}, then a quarter)`, before, after.level, now);
    if (after.need === null && after.level < CHAMPION_MAX_LEVEL) ledgerInsert(r, 0, "capped_by_city_hall", battleId, `🏦 ${after.banked.toLocaleString()} Renown banked: it counts once the City Hall passes ${cityHall}`, after.level, after.level, now);
    db.prepare(`UPDATE kingdom_champions SET xp = xp + ? WHERE id = ?`).run(counted, r.id);
  })();
  if (after.level > before) announceLevel(r, before, after.level, now);
  return { renown: counted, levelAfter: after.level, name: r.name };
}

function announceLevel(r: ChampionRow, before: number, after: number, now: number) {
  const unlocked = KIT_SLOTS.filter((s) => kitSlotLevel(s) > before && kitSlotLevel(s) <= after).map((s) => `${KIT_SLOT_NAMES[s]}: ${kitEntry(kitSlotId(artsOf(r), s))?.name ?? "?"}`);
  const milestone = CHAMPION_MILESTONES.filter((m) => m > before && m <= after).pop();
  const eventId = milestone ? recordRealmEvent("champion_level", r.user_id, null, { name: r.name, level: milestone }, new Date(now)) : null;
  createBroadcast({
    kind: "champion",
    title: `${r.name} reaches level ${after}`,
    emblem: "🦸",
    body: `Your champion grows in renown: level ${after}, and the army it leads fights with +${Math.round(championStats(after).hp * 1000) / 10}% HP, ATK and DEF.${unlocked.length ? ` New in its kit: ${unlocked.join(", ")}.` : ""}`,
    audience: "users",
    recipients: [r.user_id],
    eventId,
    now: new Date(now)
  });
}

/** A Finale of a champion broke enemy armies (the weekly story tells it) */
export function recordChampionFinale(userId: string, name: string, finale: string, broke: string[], place: string, now = Date.now()) {
  recordRealmEvent("champion_finale", userId, null, { name, finale, broke, place }, new Date(now));
}

/* ------------------------------------------------------------------------- */
/* What a ruler does with their champion                                     */
/* ------------------------------------------------------------------------- */

const costText = (c: ChampionCost, gems: Record<string, number> = {}) =>
  [...Object.entries(c), ...Object.entries(gems)]
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${(v as number).toLocaleString("en-US")} ${k.replace(/_/g, " ")}`)
    .join(", ");

function pay(userId: string, cost: ChampionCost, gems: Record<string, number>, type: string, reason: string) {
  const res = getKingdomResources(userId);
  const missing = [
    ...Object.entries(cost).filter(([k, v]) => ((res[k as keyof typeof res] as number) ?? 0) < (v ?? 0)).map(([k, v]) => `${((v ?? 0) - ((res[k as keyof typeof res] as number) ?? 0)).toLocaleString()} ${k}`),
    ...Object.entries(gems).filter(([k, v]) => ((res.scarce ?? {})[k] ?? 0) < v).map(([k, v]) => `${(v - ((res.scarce ?? {})[k] ?? 0)).toLocaleString()} ${k.replace(/_/g, " ")}`)
  ];
  if (missing.length) throw new Error(`Still need ${missing.join(", ")}.`);
  if (Object.keys(cost).length) spendResources(userId, cost, type, reason);
  if (Object.keys(gems).length) spendGems(userId, gems, type, reason);
}

/** Heal a wounded champion at once (gold and food by the hours left, a gem from level 20) */
export const hastenChampion = db.transaction((userId: string, now = Date.now()) => {
  const r = ensureChampion(userId, now);
  if (!r || !r.wounded_until || r.wounded_until <= now) throw new Error("Your champion isn't wounded.");
  const level = championLevel(r);
  const { cost, gems } = hastenCost(level, r.wounded_until - now, gemOf(civOf(userId)));
  pay(userId, cost, gems, "champion_hasten", `🦸 Hastened ${r.name}'s healing: ${costText(cost, gems)}`);
  db.prepare(`UPDATE kingdom_champions SET wounded_until = NULL WHERE id = ?`).run(r.id);
});

/** Roll new looks (its name, Arts and level stay) for one of its civilization's gems */
export const rerollChampion = db.transaction((userId: string, now = Date.now()) => {
  const r = ensureChampion(userId, now);
  if (!r) throw new Error("You have no champion.");
  const gems = rerollCost(gemOf(civOf(userId)));
  pay(userId, {}, gems, "champion_reroll", `🦸 Re-rolled ${r.name}'s looks: ${costText({}, gems)}`);
  db.prepare(`UPDATE kingdom_champions SET looks_json = ? WHERE id = ?`).run(JSON.stringify(rollLooks(`champion:${userId}:${now}`)), r.id);
});

/** Retrain one slot of its kit to another Art from that slot's pool (a locked slot may be retrained ahead of its level) */
export const retrainChampion = db.transaction((userId: string, slot: KitSlot, id: string, now = Date.now()) => {
  const r = ensureChampion(userId, now);
  if (!r) throw new Error("You have no champion.");
  if (!KIT_SLOTS.includes(slot)) throw new Error("Pick a slot of its kit.");
  if (championStatus(r, now) === "away") throw new Error(`${r.name} is away at the head of a march: retrain it at home.`);
  const arts = artsOf(r);
  const block = retrainBlock(arts, slot, id);
  if (block) throw new Error(block);
  pay(userId, RETRAIN_COST, {}, "champion_retrain", `🦸 Retrained ${r.name}'s ${KIT_SLOT_NAMES[slot]}: ${kitEntry(kitSlotId(arts, slot))?.name} → ${kitEntry(id)?.name} (${costText(RETRAIN_COST)})`);
  db.prepare(`UPDATE kingdom_champions SET arts_json = ? WHERE id = ?`).run(JSON.stringify(retrained(arts, slot, id)), r.id);
});

/** An admin's Renown adjustment (a ledger line of its own; never part of a ledger reset) */
export function adjustChampionXp(userId: string, delta: number, note: string, now = Date.now()) {
  const r = ensureChampion(userId, now);
  if (!r) throw new Error("No such ruler.");
  const ch = cityHallOf(userId);
  const before = championLevelOf(r.xp, ch).level;
  const d = Math.max(-r.xp, Math.round(delta));
  const after = championLevelOf(r.xp + d, ch).level;
  ledgerInsert(r, d, "admin_adjust", null, note || null, before, after, now);
  db.prepare(`UPDATE kingdom_champions SET xp = xp + ? WHERE id = ?`).run(d, r.id);
}

/** Every champion's Renown back to nothing (an admin's reset, only when asked for: the treasury reset leaves it alone) */
export function resetChampionRenown() {
  db.transaction(() => {
    db.prepare(`DELETE FROM champion_xp_ledger`).run();
    db.prepare(`UPDATE kingdom_champions SET xp = 0`).run();
  })();
}

/** The champion's card: who it is, where it is, its level and Renown, its kit slot by slot, its ledger */
export function championView(k: Pick<DeveloperKingdom, "id" | "civilization" | "cityHallLevel">, now = Date.now()): ChampionView | null {
  const r = ensureChampion(k.id, now);
  if (!r) return null;
  const lv = championLevelOf(r.xp, k.cityHallLevel);
  const status = championStatus(r, now);
  const arts = artsOf(r);
  const gem = gemOf(k.civilization);
  const ledger = (
    db.prepare(`SELECT * FROM champion_xp_ledger WHERE champion_id = ? ORDER BY id DESC LIMIT 60`).all(r.id) as Array<{
      id: number;
      delta: number;
      reason: string;
      battle_id: string | null;
      detail: string | null;
      level_before: number;
      level_after: number;
      created_at: number;
    }>
  ).map(
    (x): ChampionLedgerEntry => ({ id: x.id, delta: x.delta, reason: x.reason, battleId: x.battle_id, detail: x.detail, levelBefore: x.level_before, levelAfter: x.level_after, createdAt: x.created_at })
  );
  const entry = (id: string) => {
    const e = kitEntry(id);
    return { id, name: e?.name ?? id, emblem: e?.emblem ?? "", text: e?.description ?? "" };
  };
  return {
    id: r.id,
    name: r.name,
    civ: k.civilization,
    looks: looksOf(r),
    level: lv.level,
    xp: r.xp,
    into: lv.into,
    need: lv.need,
    banked: lv.banked,
    maxLevel: CHAMPION_MAX_LEVEL,
    cityHallLevel: k.cityHallLevel,
    status,
    marchId: status === "away" ? r.march_id : null,
    woundedUntil: status === "wounded" ? r.wounded_until : null,
    hasten: status === "wounded" ? hastenCost(lv.level, (r.wounded_until ?? now) - now, gem) : null,
    rerollGems: rerollCost(gem),
    retrainCost: RETRAIN_COST,
    stats: championStats(lv.level),
    kit: KIT_SLOTS.map((slot) => ({
      slot,
      label: KIT_SLOT_NAMES[slot],
      unlockLevel: kitSlotLevel(slot),
      unlocked: lv.level >= kitSlotLevel(slot),
      ...entry(kitSlotId(arts, slot)),
      pool: poolFor(slot).map(entry)
    })),
    kitLines: kitLines(championKit(r.name, arts, lv.level)),
    today: { raw: rawToday(r.id, now), full: DAILY_RENOWN.full, half: DAILY_RENOWN.half },
    ledger
  };
}

/** The champion a march's row records (null when it marched without one) */
export const marchChampionFromJson = (json: string | null | undefined): MarchChampion | null => (json ? (JSON.parse(json) as MarchChampion) : null);
