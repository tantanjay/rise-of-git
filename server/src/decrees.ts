import { db, SCARCE_RESOURCES, grantAdminGift, getActiveShield, getActivePunishment, isSpecialUserId, UpgradeRefund, getProclamationState, proclamationRuler } from "./db.js";
import { FESTIVAL } from "./warConfig.js";
import { UPGRADE_BY_ID } from "./upgrades.js";
import { announceFestival, createBroadcast, markBroadcastsRead, recordRealmEvent } from "./broadcasts.js";
import { CIVILIZATIONS } from "./kingdomUtils.js";
import { CivilizationType, DecreeAuditEntry, DeveloperKingdom, GiftAmounts } from "./types.js";

/**
 * Royal Decrees (GAME_GUIDE §15): what admins and Special Overseers can proclaim. Every decree writes a
 * `realm_events` row (kind `decree_*`), which is also the audit the Royal Decrees panel lists.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const DECREE_MIN_DAYS = 1;
export const DECREE_MAX_DAYS = 14;
/** Announcements can stay pinned in the War Room for up to this many days */
export const ANNOUNCE_MAX_PIN_DAYS = 30;
export const ANNOUNCE_MAX_TITLE = 80;
export const ANNOUNCE_MAX_BODY = 2000;
export const GIFT_MAX_MESSAGE = 120;
/** Sanity caps for one gift line (a typo shouldn't flood the economy) */
export const GIFT_MAX_BASE = 100_000_000;
export const GIFT_MAX_GEMS = 100_000;

const BASE_KEYS = ["gold", "iron", "stone", "lumber", "food"] as const;
export const GEM_KEYS = SCARCE_RESOURCES.map((r) => r.key);

const fmt = (n: number) => n.toLocaleString("en-US");

function nameOf(userId: string | null): string | null {
  if (!userId) return null;
  const row = db.prepare(`SELECT full_name, username FROM users WHERE id = ?`).get(userId) as { full_name?: string; username?: string } | undefined;
  return row ? row.full_name || row.username || userId : userId;
}

function wholeDays(days: unknown): number {
  const d = Math.floor(Number(days));
  if (!Number.isFinite(d) || d < DECREE_MIN_DAYS || d > DECREE_MAX_DAYS) throw new Error(`Pick ${DECREE_MIN_DAYS}–${DECREE_MAX_DAYS} days.`);
  return d;
}

const daysLabel = (d: number) => `${d} ${d === 1 ? "day" : "days"}`;

/** A target the decrees can touch: a real ruler of the realm */
function targetKingdom(kingdoms: DeveloperKingdom[], targetId: unknown): DeveloperKingdom {
  const k = kingdoms.find((x) => x.id === targetId);
  if (!k) throw new Error("Kingdom not found.");
  return k;
}

/* ------------------------------------------------------------------------- */
/* 📜 Announcement                                                            */
/* ------------------------------------------------------------------------- */

export function proclaimAnnouncement(params: {
  actorId: string;
  title: unknown;
  body: unknown;
  audience: unknown;
  recipients?: unknown;
  pinDays?: unknown;
  kingdoms: DeveloperKingdom[];
}) {
  const title = String(params.title ?? "").trim();
  const body = String(params.body ?? "").trim();
  if (!title) throw new Error("Give the announcement a title.");
  if (!body) throw new Error("Write the announcement's text.");
  if (title.length > ANNOUNCE_MAX_TITLE) throw new Error(`Keep the title under ${ANNOUNCE_MAX_TITLE} characters.`);
  if (body.length > ANNOUNCE_MAX_BODY) throw new Error(`Keep the text under ${ANNOUNCE_MAX_BODY} characters.`);

  let audience: "all" | `civ:${string}` | "users";
  let recipients: string[] = [];
  if (params.audience === "all") audience = "all";
  else if (typeof params.audience === "string" && params.audience.startsWith("civ:") && CIVILIZATIONS.includes(params.audience.slice(4) as CivilizationType)) {
    audience = params.audience as `civ:${string}`;
  } else if (params.audience === "users") {
    audience = "users";
    const ids = Array.isArray(params.recipients) ? params.recipients.map(String) : [];
    recipients = [...new Set(ids)].filter((id) => params.kingdoms.some((k) => k.id === id));
    if (recipients.length === 0) throw new Error("Pick at least one ruler to proclaim to.");
  } else throw new Error("Pick who hears the announcement.");

  const pin = params.pinDays === undefined || params.pinDays === null || params.pinDays === "" ? 0 : Math.floor(Number(params.pinDays));
  if (!Number.isFinite(pin) || pin < 0 || pin > ANNOUNCE_MAX_PIN_DAYS) throw new Error(`Pin it for 0–${ANNOUNCE_MAX_PIN_DAYS} days.`);

  const now = new Date();
  const eventId = recordRealmEvent("decree_announcement", params.actorId, null, { title, audience, recipients: recipients.length || undefined, pinDays: pin || undefined }, now);
  const id = createBroadcast({
    kind: "announcement",
    title,
    body,
    emblem: "📜",
    audience,
    recipients,
    createdBy: params.actorId,
    pinnedUntil: pin > 0 ? new Date(now.getTime() + pin * DAY_MS) : null,
    eventId,
    now
  });
  const heard = audience === "all" ? "the whole realm" : audience === "users" ? `${recipients.length} ${recipients.length === 1 ? "ruler" : "rulers"}` : `the ${audience.slice(4)} civilization`;
  return { id, message: `Proclaimed to ${heard}${pin > 0 ? `, pinned for ${daysLabel(pin)}` : ""}.` };
}

/* ------------------------------------------------------------------------- */
/* 🎁 Give resources (admin)                                                   */
/* ------------------------------------------------------------------------- */

export interface GiftPlanRow {
  users: string[];
  gold?: number;
  iron?: number;
  stone?: number;
  lumber?: number;
  food?: number;
  gems?: Record<string, number>;
}

export interface GiftPreview {
  message: string;
  /** What each ruler receives (rows naming the same ruler are added up) */
  grants: Array<{ userId: string; name: string; amounts: GiftAmounts }>;
  errors: string[];
}

/** `"*"` = every ruler who isn't a Special Overseer */
export const GIFT_EVERYONE = "*";

/**
 * Checks a gift plan (from the form or an imported JSON) and works out what each ruler gets.
 * Unknown logins, Special Overseers (their treasury resets every harvest), unknown gem keys and bad amounts are errors.
 */
export function previewGiftPlan(plan: unknown, kingdoms: DeveloperKingdom[]): GiftPreview {
  const errors: string[] = [];
  const p = (plan ?? {}) as { message?: unknown; gifts?: unknown };
  const message = String(p.message ?? "").trim();
  if (!message) errors.push("The gift needs a message.");
  if (message.length > GIFT_MAX_MESSAGE) errors.push(`Keep the message under ${GIFT_MAX_MESSAGE} characters.`);
  if (!Array.isArray(p.gifts) || p.gifts.length === 0) errors.push('"gifts" must be a list with at least one row.');

  const byLogin = new Map<string, DeveloperKingdom>();
  for (const k of kingdoms) {
    byLogin.set(k.id.toLowerCase(), k);
    if (k.username) byLogin.set(k.username.toLowerCase(), k);
  }
  const totals = new Map<string, GiftAmounts>();

  (Array.isArray(p.gifts) ? p.gifts : []).forEach((raw: any, i: number) => {
    const row = `Row ${i + 1}`;
    if (!raw || typeof raw !== "object") return errors.push(`${row}: not an object.`);
    const users: unknown[] = Array.isArray(raw.users) ? raw.users : [];
    if (users.length === 0) errors.push(`${row}: "users" must list at least one login (or "*").`);
    const amounts: GiftAmounts = {};
    for (const k of BASE_KEYS) {
      if (raw[k] === undefined) continue;
      const n = Number(raw[k]);
      if (!Number.isInteger(n) || n < 0 || n > GIFT_MAX_BASE) errors.push(`${row}: ${k} must be a whole number from 0 to ${fmt(GIFT_MAX_BASE)}.`);
      else if (n > 0) amounts[k] = n;
    }
    if (raw.gems !== undefined) {
      if (!raw.gems || typeof raw.gems !== "object" || Array.isArray(raw.gems)) errors.push(`${row}: "gems" must be an object like { "mana": 10 }.`);
      else
        for (const [g, v] of Object.entries(raw.gems)) {
          if (!GEM_KEYS.includes(g)) {
            errors.push(`${row}: unknown gem "${g}" (known: ${GEM_KEYS.join(", ")}).`);
            continue;
          }
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0 || n > GIFT_MAX_GEMS) errors.push(`${row}: ${g} must be a whole number from 0 to ${fmt(GIFT_MAX_GEMS)}.`);
          else if (n > 0) (amounts.gems ??= {})[g] = n;
        }
    }
    const known = new Set(Object.keys(raw));
    for (const k of known) if (k !== "users" && k !== "gems" && !(BASE_KEYS as readonly string[]).includes(k)) errors.push(`${row}: unknown field "${k}".`);
    if (!BASE_KEYS.some((k) => amounts[k]) && !Object.keys(amounts.gems ?? {}).length) errors.push(`${row}: gives nothing.`);

    const targets: DeveloperKingdom[] = [];
    for (const u of users) {
      const login = String(u).trim().toLowerCase();
      if (login === GIFT_EVERYONE) {
        targets.push(...kingdoms.filter((k) => !k.isSpecial));
        continue;
      }
      const k = byLogin.get(login);
      if (!k) errors.push(`${row}: unknown ruler "${String(u)}".`);
      else if (k.isSpecial) errors.push(`${row}: ${k.name} is a Special Overseer (their treasury resets every harvest).`);
      else targets.push(k);
    }
    for (const k of new Set(targets)) {
      const t = totals.get(k.id) ?? {};
      for (const key of BASE_KEYS) if (amounts[key]) t[key] = (t[key] ?? 0) + amounts[key]!;
      for (const [g, n] of Object.entries(amounts.gems ?? {})) (t.gems ??= {})[g] = (t.gems?.[g] ?? 0) + n;
      totals.set(k.id, t);
    }
  });

  const grants = [...totals].map(([userId, amounts]) => ({ userId, name: kingdoms.find((k) => k.id === userId)?.name ?? userId, amounts })).sort((a, b) => a.name.localeCompare(b.name));
  if (errors.length === 0 && grants.length === 0) errors.push("Nobody receives anything.");
  return { message, grants, errors };
}

/** What a gift holds, as one line ("5,000 gold · 10× 🔮 Arcane Mana") */
export function describeGift(a: GiftAmounts): string {
  const parts = BASE_KEYS.filter((k) => a[k]).map((k) => `${fmt(a[k]!)} ${k}`);
  for (const [g, n] of Object.entries(a.gems ?? {})) {
    const def = SCARCE_RESOURCES.find((r) => r.key === g);
    parts.push(`${fmt(n)}× ${def ? `${def.emblem} ${def.name}` : g}`);
  }
  return parts.join(" · ");
}

/** 🏗️ An admin reset a ruler's improvements: tell that ruler what came down and what went back into the treasury */
export function announceImprovementRefund(actorId: string, userId: string, refund: UpgradeRefund, now = new Date()) {
  const stripped = Object.entries(refund.stripped).filter(([, t]) => t > 0);
  if (!stripped.length) return;
  const eventId = recordRealmEvent("improvements_refunded", actorId, userId, refund, now);
  const tiers = stripped.reduce((sum, [, t]) => sum + t, 0);
  const lines = stripped.map(([id, t]) => {
    const def = UPGRADE_BY_ID.get(id);
    return `${def?.emblem ?? "🏗️"} ${def?.name ?? id}: tier ${t} → none`;
  });
  createBroadcast({
    kind: "refund",
    title: "Your improvements were reset",
    body: [
      `The Crown took down ${tiers} improvement ${tiers === 1 ? "tier" : "tiers"} in your city and refunded every coin and gem in full, so you can build again.`,
      ...lines,
      `💰 Returned to your treasury: ${describeGift({ ...refund.refundedBase, gems: refund.refundedGems })}`
    ].join("\n"),
    emblem: "🏗️",
    audience: "users",
    recipients: [userId],
    createdBy: actorId,
    eventId,
    now
  });
}

/** Grant a validated plan: ledger lines per ruler and a 🎁 notice (rulers who got the same gift share one) */
export function grantGiftPlan(actorId: string, plan: unknown, kingdoms: DeveloperKingdom[]) {
  const preview = previewGiftPlan(plan, kingdoms);
  if (preview.errors.length) throw new Error(`Nothing was granted: ${preview.errors.join(" ")}`);
  const now = new Date();
  const groups = new Map<string, { amounts: GiftAmounts; users: string[] }>();
  db.transaction(() => {
    for (const g of preview.grants) {
      grantAdminGift(g.userId, g.amounts, preview.message);
      const key = JSON.stringify(g.amounts);
      const group = groups.get(key) ?? { amounts: g.amounts, users: [] };
      group.users.push(g.userId);
      groups.set(key, group);
    }
  })();
  const eventId = recordRealmEvent(
    "decree_gift",
    actorId,
    preview.grants.length === 1 ? preview.grants[0].userId : null,
    { message: preview.message, grants: preview.grants.map((g) => ({ userId: g.userId, amounts: g.amounts })) },
    now
  );
  for (const { amounts, users } of groups.values()) {
    createBroadcast({
      kind: "gift",
      title: preview.message,
      body: `A royal gift reaches your treasury:\n🎁 ${describeGift(amounts)}`,
      emblem: "🎁",
      audience: "users",
      recipients: users,
      createdBy: actorId,
      eventId,
      now
    });
  }
  return { granted: preview.grants.length, message: `Granted "${preview.message}" to ${preview.grants.length} ${preview.grants.length === 1 ? "ruler" : "rulers"}.` };
}

/* ------------------------------------------------------------------------- */
/* 🛡️ Shield                                                                  */
/* ------------------------------------------------------------------------- */

export function grantShield(params: { actorId: string; targetId: unknown; days: unknown; breaksOnAttack?: unknown; kingdoms: DeveloperKingdom[] }) {
  const k = targetKingdom(params.kingdoms, params.targetId);
  if (k.isArchon) throw new Error("The Archon of the Realm is untouchable already; a Royal Shield adds nothing.");
  const days = wholeDays(params.days);
  const breaks = params.breaksOnAttack === undefined ? true : Boolean(params.breaksOnAttack);
  const now = Date.now();
  const endsAt = now + days * DAY_MS;
  db.prepare(`
    INSERT INTO kingdom_shields (user_id, starts_at, ends_at, breaks_on_attack, granted_by) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET starts_at = excluded.starts_at, ends_at = excluded.ends_at, breaks_on_attack = excluded.breaks_on_attack, granted_by = excluded.granted_by
  `).run(k.id, now, endsAt, breaks ? 1 : 0, params.actorId);
  const eventId = recordRealmEvent("decree_shield", params.actorId, k.id, { days, endsAt, breaksOnAttack: breaks });
  const publicId = createBroadcast({
    kind: "shield",
    title: `A Royal Shield rises over ${k.name}'s kingdom`,
    body: `By royal decree no army, rally or scout may touch ${k.name}'s kingdom for ${daysLabel(days)}.`,
    emblem: "🛡️",
    audience: "all",
    createdBy: params.actorId,
    eventId
  });
  createBroadcast({
    kind: "shield",
    title: "Your kingdom is under a Royal Shield",
    body: [
      `For ${daysLabel(days)} your kingdom can't be attacked, rallied on or scouted. Armies already on the road turn back when they arrive.`,
      breaks ? "⚠️ The shield shatters if you attack another ruler (their castle or their gatherers). Gathering, bosses, mobs and NPC kingdoms are fine." : "Your own marches never break it."
    ].join("\n"),
    emblem: "🛡️",
    audience: "users",
    recipients: [k.id],
    createdBy: params.actorId,
    eventId
  });
  markBroadcastsRead(k.id, [publicId]);
  return { message: `${k.name}'s kingdom is shielded for ${daysLabel(days)}.` };
}

export function liftShield(actorId: string, targetId: unknown, kingdoms: DeveloperKingdom[]) {
  const k = targetKingdom(kingdoms, targetId);
  if (!getActiveShield(k.id)) throw new Error(`${k.name} has no Royal Shield.`);
  db.prepare(`DELETE FROM kingdom_shields WHERE user_id = ?`).run(k.id);
  recordRealmEvent("decree_lift_shield", actorId, k.id, {});
  return { message: `${k.name}'s Royal Shield was lifted.` };
}

/** The holder of a breakable shield attacked a ruler: the shield shatters (called by the war engine) */
export function breakShieldOnAttack(attackerId: string, targetName: string) {
  const shield = getActiveShield(attackerId);
  if (!shield || !shield.breaksOnAttack) return;
  db.prepare(`DELETE FROM kingdom_shields WHERE user_id = ?`).run(attackerId);
  const name = nameOf(attackerId) ?? attackerId;
  const eventId = recordRealmEvent("shield_broken", attackerId, null, { targetName });
  createBroadcast({
    kind: "shield",
    title: `${name}'s Royal Shield shatters`,
    body: `${name} marched on ${targetName}, and the Royal Shield over their kingdom broke.`,
    emblem: "🛡️",
    audience: "all",
    eventId
  });
}

/* ------------------------------------------------------------------------- */
/* ⛈️ Punish                                                                  */
/* ------------------------------------------------------------------------- */

export function punishKingdom(params: { actorId: string; targetId: unknown; days: unknown; lowBirth?: unknown; highDeath?: unknown; wrath?: unknown; kingdoms: DeveloperKingdom[] }) {
  const k = targetKingdom(params.kingdoms, params.targetId);
  if (k.isArchon) throw new Error("The Archon of the Realm is above every decree.");
  if (isSpecialUserId(k.id)) throw new Error("Special Overseers take nothing from the harvest; there is nothing to punish.");
  if (params.wrath) throw new Error("Wrath (sending the mythical horror) is not in the game yet.");
  const days = wholeDays(params.days);
  const lowBirth = Boolean(params.lowBirth);
  const highDeath = Boolean(params.highDeath);
  const now = Date.now();
  const endsAt = now + days * DAY_MS;
  db.prepare(`
    INSERT INTO kingdom_punishments (user_id, starts_at, ends_at, low_birth, high_death, granted_by) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET starts_at = excluded.starts_at, ends_at = excluded.ends_at, low_birth = excluded.low_birth, high_death = excluded.high_death, granted_by = excluded.granted_by
  `).run(k.id, now, endsAt, lowBirth ? 1 : 0, highDeath ? 1 : 0, params.actorId);
  const eventId = recordRealmEvent("decree_punish", params.actorId, k.id, { days, endsAt, lowBirth, highDeath });
  const effects = ["🌧️ No harvest: nothing from the harvest pool, your buildings or your workforce", lowBirth ? "🥀 Low birth rate: births ×0.25" : null, highDeath ? "🪦 High death rate: civilian deaths ×3" : null].filter(Boolean);
  const publicId = createBroadcast({
    kind: "punishment",
    title: `Storm clouds gather over ${k.name}'s kingdom`,
    body: `By royal decree ${k.name}'s kingdom is punished for ${daysLabel(days)}.`,
    emblem: "⛈️",
    audience: "all",
    createdBy: params.actorId,
    eventId
  });
  createBroadcast({
    kind: "punishment",
    title: "Your kingdom is punished",
    body: [`For ${daysLabel(days)}:`, ...effects.map((e) => `• ${e}`), "Your soldiers still eat from the granary."].join("\n"),
    emblem: "⛈️",
    audience: "users",
    recipients: [k.id],
    createdBy: params.actorId,
    eventId
  });
  markBroadcastsRead(k.id, [publicId]);
  return { message: `${k.name}'s kingdom is punished for ${daysLabel(days)}.` };
}

export function liftPunishment(actorId: string, targetId: unknown, kingdoms: DeveloperKingdom[]) {
  const k = targetKingdom(kingdoms, targetId);
  if (!getActivePunishment(k.id)) throw new Error(`${k.name} is not punished.`);
  db.prepare(`DELETE FROM kingdom_punishments WHERE user_id = ?`).run(k.id);
  recordRealmEvent("decree_lift_punishment", actorId, k.id, {});
  createBroadcast({
    kind: "punishment",
    title: "The storm over your kingdom has lifted",
    body: "The punishment was lifted early. Your kingdom shares in the harvest again.",
    emblem: "🌤️",
    audience: "users",
    recipients: [k.id],
    createdBy: actorId
  });
  return { message: `${k.name}'s punishment was lifted.` };
}

/* ------------------------------------------------------------------------- */
/* 🎉 Proclamations: a Festival by decree                                      */
/* ------------------------------------------------------------------------- */

/**
 * Gives a kingdom a Festival now (GAME_GUIDE §15): free, for the usual day, apart from the ruler's own weekly
 * cooldown, and even while they are Called to Arms. Mortal kingdoms only, and never on top of one already under way.
 */
export function grantFestival(params: { actorId: string; targetId: unknown; kingdoms: DeveloperKingdom[] }) {
  const k = targetKingdom(params.kingdoms, params.targetId);
  proclamationRuler(k.id);
  const now = Date.now();
  const current = getProclamationState(k.id);
  if (current.festivalEndsAt > now) throw new Error(`${k.name} is holding a Festival already.`);
  const endsAt = now + FESTIVAL.DURATION_MS;
  db.prepare(`
    INSERT INTO royal_festivals (user_id, starts_at, ends_at, granted_by) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET starts_at = excluded.starts_at, ends_at = excluded.ends_at, granted_by = excluded.granted_by
  `).run(k.id, now, endsAt, params.actorId);
  const eventId = recordRealmEvent("decree_festival", params.actorId, k.id, { endsAt });
  announceFestival(k, endsAt, { eventId, createdBy: params.actorId });
  return { message: `${k.name}'s kingdom holds a Festival for the next ${Math.round(FESTIVAL.DURATION_MS / 3_600_000)} hours.` };
}

/* ------------------------------------------------------------------------- */
/* Audit                                                                      */
/* ------------------------------------------------------------------------- */

const AUDIT_KINDS = ["decree_announcement", "decree_gift", "decree_shield", "decree_lift_shield", "decree_punish", "decree_lift_punishment", "decree_festival", "decree_chronicle", "shield_broken"];

function summarize(kind: string, p: any, targetName: string | null): string {
  switch (kind) {
    case "decree_announcement":
      return `📜 Proclaimed "${p.title}" to ${p.audience === "all" ? "the realm" : p.audience === "users" ? `${p.recipients ?? 0} rulers` : `the ${String(p.audience).slice(4)} civilization`}${p.pinDays ? ` · pinned ${p.pinDays}d` : ""}`;
    case "decree_gift": {
      const n = Array.isArray(p.grants) ? p.grants.length : 0;
      return `🎁 "${p.message}" to ${n === 1 && targetName ? targetName : `${n} rulers`}`;
    }
    case "decree_shield":
      return `🛡️ Shielded ${targetName} for ${daysLabel(p.days)}${p.breaksOnAttack ? " (breaks on attack)" : ""}`;
    case "decree_lift_shield":
      return `🛡️ Lifted ${targetName}'s shield`;
    case "decree_punish":
      return `⛈️ Punished ${targetName} for ${daysLabel(p.days)}: no harvest${p.lowBirth ? " · low births" : ""}${p.highDeath ? " · high deaths" : ""}`;
    case "decree_lift_punishment":
      return `🌤️ Lifted ${targetName}'s punishment`;
    case "decree_festival":
      return `🎉 Gave ${targetName} a Festival`;
    case "decree_chronicle":
      return `📖 Published the Weekly Chronicle "${p.title}" (week of ${p.weekKey})`;
    case "shield_broken":
      return `💥 Shield shattered by attacking ${p.targetName}`;
    default:
      return kind;
  }
}

/** The latest decrees, newest first */
export function getDecreeAudit(limit = 50): DecreeAuditEntry[] {
  const rows = db
    .prepare(`SELECT * FROM realm_events WHERE kind IN (${AUDIT_KINDS.map(() => "?").join(",")}) ORDER BY id DESC LIMIT ?`)
    .all(...AUDIT_KINDS, limit) as Array<{ id: number; at: string; kind: string; actor_id: string | null; target_id: string | null; payload_json: string | null }>;
  return rows.map((r) => {
    const payload = r.payload_json ? JSON.parse(r.payload_json) : {};
    const targetName = nameOf(r.target_id);
    return { id: r.id, at: r.at, kind: r.kind, actorId: r.actor_id, actorName: nameOf(r.actor_id), targetId: r.target_id, targetName, summary: summarize(r.kind, payload, targetName) };
  });
}
