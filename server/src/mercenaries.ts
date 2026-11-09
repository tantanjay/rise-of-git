import { db, getKingdomResources, spendResources } from "./db.js";
import { createBroadcast, recordRealmEvent } from "./broadcasts.js";
import { kitLines } from "./battleArts.js";
import { calculateMaxPopulation } from "./demographics.js";
import { marchSlotsForLevel } from "./warConfig.js";
import {
  MERC_CAMPS,
  MERC_RARITIES,
  MERC_RULES,
  MercCost,
  MercRarity,
  battlePayFor,
  bandCapForSlots,
  bandCountOnCivChange,
  bandFullCount,
  healPlan,
  fullMarchFor,
  hireBlockReason,
  mercDefFor,
  mercKitFor,
  stockNow
} from "./mercenaryRules.js";
import type { DefenderGroup } from "./combat.js";
import type { CivilizationType, DeveloperKingdom, MercBand, MercCamp } from "./types.js";

/**
 * 🪙 Mercenaries (GAME_GUIDE §13 *Mercenaries*): camps, hiring, upkeep, wounds, healing, desertion and death. The rules
 * and numbers are in mercenaryRules.ts; battles are fought by the war engine (warEngine.ts), which marches a band as a
 * stack of soldier-equivalents with its kit and writes its losses back here as strength.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS mercenary_stock (
    camp_id TEXT NOT NULL,
    rarity TEXT NOT NULL,
    available INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (camp_id, rarity)
  );

  CREATE TABLE IF NOT EXISTS kingdom_mercenaries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    rarity TEXT NOT NULL,
    civ TEXT NOT NULL,
    full_count INTEGER NOT NULL,
    strength REAL NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'home',
    march_id TEXT,
    heal_from REAL,
    heal_started_at INTEGER,
    heal_until INTEGER,
    camp_id TEXT NOT NULL,
    price_json TEXT NOT NULL,
    hired_at INTEGER NOT NULL,
    warned_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_kingdom_mercenaries_user ON kingdom_mercenaries(user_id);
`);

interface BandRow {
  id: string;
  user_id: string;
  rarity: MercRarity;
  /** The civilization it fights as (its owner's, carried over on a civ change) */
  civ: CivilizationType;
  full_count: number;
  strength: number;
  status: "home" | "marching" | "healing" | "defending";
  /** The march it is on, or (defending) the battle on its hirer's walls */
  march_id: string | null;
  heal_from: number | null;
  heal_started_at: number | null;
  heal_until: number | null;
  camp_id: string;
  price_json: string;
  hired_at: number;
  warned_at: number | null;
}

const ownerOf = (userId: string) =>
  db.prepare(`SELECT id, full_name, username, civilization, city_hall_level FROM users WHERE id = ?`).get(userId) as
    | { id: string; full_name: string | null; username: string; civilization: CivilizationType; city_hall_level: number | null }
    | undefined;

const costText = (c: MercCost) =>
  Object.entries(c)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${(v as number).toLocaleString("en-US")} ${k}`)
    .join(", ");

const canAfford = (userId: string, cost: MercCost) => {
  const res = getKingdomResources(userId);
  return Object.entries(cost).every(([k, v]) => (res[k as keyof typeof res] as number ?? 0) >= (v ?? 0));
};

/* ------------------------------------------------------------------------- */
/* Settling: heals that finished, civilization changes                       */
/* ------------------------------------------------------------------------- */

/**
 * Bring bands up to `now`: a heal that is done leaves its band whole and at home; a band at home whose owner changed
 * civilization becomes that civilization's counterpart (same rarity, strength and power). A marching band changes
 * when it is home again.
 */
export function settleBands(now = Date.now(), userId?: string) {
  const rows = (userId
    ? db.prepare(`SELECT * FROM kingdom_mercenaries WHERE user_id = ?`).all(userId)
    : db.prepare(`SELECT * FROM kingdom_mercenaries`).all()) as BandRow[];
  for (const b of rows) {
    if (b.status === "healing" && b.heal_until !== null && b.heal_until <= now) {
      db.prepare(`UPDATE kingdom_mercenaries SET status = 'home', strength = 1, heal_from = NULL, heal_started_at = NULL, heal_until = NULL WHERE id = ?`).run(b.id);
      b.status = "home";
    }
    // A band whose defence is over (the battle ended without letting it go) is back inside
    if (b.status === "defending" && !db.prepare(`SELECT 1 FROM battles WHERE id = ? AND status = 'fighting'`).get(b.march_id ?? "")) {
      db.prepare(`UPDATE kingdom_mercenaries SET status = 'home', march_id = NULL WHERE id = ?`).run(b.id);
      b.status = "home";
    }
    if (b.status === "marching" || b.status === "defending") continue;
    const owner = ownerOf(b.user_id);
    if (!owner) {
      db.prepare(`DELETE FROM kingdom_mercenaries WHERE id = ?`).run(b.id);
      continue;
    }
    if (owner.civilization !== b.civ) {
      const full = bandCountOnCivChange(b.full_count, b.rarity, b.civ, owner.civilization, owner.city_hall_level ?? 1);
      db.prepare(`UPDATE kingdom_mercenaries SET civ = ?, full_count = ? WHERE id = ?`).run(owner.civilization, full, b.id);
    }
  }
}

/** Strength of a healing band right now (it heals evenly from where it started to whole) */
function liveStrength(b: BandRow, now: number): number {
  if (b.status !== "healing" || b.heal_from === null || b.heal_started_at === null || b.heal_until === null) return b.strength;
  const t = Math.max(0, Math.min(1, (now - b.heal_started_at) / Math.max(1, b.heal_until - b.heal_started_at)));
  return b.heal_from + (1 - b.heal_from) * t;
}

function toBand(b: BandRow, now: number): MercBand {
  const owner = ownerOf(b.user_id);
  const civ = (owner?.civilization ?? b.civ) as CivilizationType;
  const d = mercDefFor(civ, b.rarity);
  const strength = liveStrength(b, now);
  return {
    id: b.id,
    rarity: b.rarity,
    type: d.type,
    name: d.name,
    emblem: d.emblem,
    civ,
    strength: Math.round(strength * 10_000) / 10_000,
    status: b.status,
    marchId: b.march_id,
    healFrom: b.heal_from,
    healStartedAt: b.heal_started_at,
    healUntil: b.heal_until,
    fullCount: b.full_count,
    hiredAt: b.hired_at,
    campId: b.camp_id,
    price: JSON.parse(b.price_json),
    upkeep: MERC_RULES[b.rarity].upkeep,
    warned: b.warned_at !== null,
    kitLines: kitLines(mercKitFor(civ, b.rarity)),
    heal: b.status === "home" && b.strength < 1 ? healPlan(b.rarity, b.strength) : null
  };
}

/** Every band a ruler holds, oldest first */
export function listBands(userId: string, now = Date.now()): MercBand[] {
  settleBands(now, userId);
  return (db.prepare(`SELECT * FROM kingdom_mercenaries WHERE user_id = ? ORDER BY hired_at ASC`).all(userId) as BandRow[]).map((b) => toBand(b, now));
}

const bandRow = (id: string) => db.prepare(`SELECT * FROM kingdom_mercenaries WHERE id = ?`).get(id) as BandRow | undefined;

/** Bands a ruler holds (home, marching, wounded or healing) */
export const bandsHeld = (userId: string) => (db.prepare(`SELECT COUNT(*) AS n FROM kingdom_mercenaries WHERE user_id = ?`).get(userId) as { n: number }).n;

/* ------------------------------------------------------------------------- */
/* Camps & hiring                                                            */
/* ------------------------------------------------------------------------- */

/** A camp's stock of one rarity now (refilled to the clock; a camp nobody has visited starts full) */
function stockOf(campId: string, rarity: MercRarity, now: number) {
  const row = db.prepare(`SELECT available, updated_at FROM mercenary_stock WHERE camp_id = ? AND rarity = ?`).get(campId, rarity) as { available: number; updated_at: number } | undefined;
  if (!row) return { available: MERC_RULES[rarity].maxStock, updatedAt: now, nextAt: null };
  return stockNow(rarity, row.available, row.updated_at, now);
}

const kingdomSlots = (k: DeveloperKingdom) => k.marchSlots ?? marchSlotsForLevel(k.cityHallLevel);
/** The ruler's full march now: what a band they hire fights as × its power (`fullMarchFor`) */
const kingdomFullMarch = (k: DeveloperKingdom) => fullMarchFor(k.maxPopulation ?? calculateMaxPopulation(k.cityHallLevel, k.civilization), k.civilization, kingdomSlots(k));

/** What a camp offers, as `viewer` sees it (their civilization's band of each rarity, and why they can't hire one) */
export function campView(campId: string, viewer: DeveloperKingdom | null, now = Date.now()): MercCamp {
  const camp = MERC_CAMPS[campId];
  if (!camp) throw new Error("There is no mercenary camp here.");
  // A ruler hires their own civilization's band of each rarity; a visitor sees the camp's region's
  const civ = viewer?.civilization ?? camp.civ;
  const slots = viewer ? kingdomSlots(viewer) : 0;
  const held = viewer ? bandsHeld(viewer.id) : 0;
  const cap = viewer ? kingdomFullMarch(viewer) : 0;
  return {
    id: campId,
    name: camp.name,
    region: camp.region,
    viewer: viewer ? { civ, held, cap: bandCapForSlots(slots), marchSlots: slots, fullMarch: cap } : null,
    slots: MERC_RARITIES.map((rarity) => {
      const r = MERC_RULES[rarity];
      const st = stockOf(campId, rarity, now);
      const d = mercDefFor(civ, rarity);
      const block = !viewer ? "Sign in to hire" : viewer.civilization !== camp.civ ? `Only rulers of ${camp.region} hire here` : hireBlockReason(rarity, slots, held);
      return {
        rarity,
        available: st.available,
        maxStock: r.maxStock,
        restockMs: r.restockMs,
        nextAt: st.nextAt,
        type: d.type,
        name: d.name,
        emblem: d.emblem,
        models: r.models,
        power: r.power,
        minSlots: r.minSlots,
        price: r.price,
        upkeep: r.upkeep,
        kitLines: kitLines(mercKitFor(civ, rarity)),
        fullCount: viewer ? bandFullCount(civ, rarity, cap) : null,
        blocked: block ?? (st.available <= 0 ? "None waiting: the next recruit comes in " + Math.max(1, Math.ceil(((st.nextAt ?? now) - now) / 60_000)) + "m" : null)
      };
    })
  };
}

/**
 * Hire a band at a camp (`POST /mercenaries/hire`): only at the hirer's own civilization's camp, first come first
 * served from its stock (shared by every ruler of that civilization). It arrives as their civilization's mercenary of
 * that rarity, whole, at home, with one full march of the hirer × its power.
 */
export const hireBand = db.transaction((k: DeveloperKingdom, campId: string, rarity: MercRarity, now = Date.now()): MercBand => {
  const camp = MERC_CAMPS[campId];
  if (!camp) throw new Error("There is no mercenary camp here.");
  if (!MERC_RULES[rarity]) throw new Error("No such mercenaries.");
  if (k.civilization !== camp.civ) throw new Error(`Only rulers of ${camp.region} hire at ${camp.name}: hire at your own civilization's legendary landmark.`);
  const slots = kingdomSlots(k);
  const block = hireBlockReason(rarity, slots, bandsHeld(k.id));
  if (block) throw new Error(block + ".");
  const st = stockOf(campId, rarity, now);
  if (st.available <= 0) throw new Error(`${camp.name} has no ${rarity} mercenaries waiting right now.`);
  const r = MERC_RULES[rarity];
  const d = mercDefFor(k.civilization, rarity);
  spendResources(k.id, r.price, "mercenary_hire", `🪙 Hired ${d.name} (${rarity}) at ${camp.name}: ${costText(r.price)}`);
  db.prepare(`INSERT INTO mercenary_stock (camp_id, rarity, available, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(camp_id, rarity) DO UPDATE SET available = excluded.available, updated_at = excluded.updated_at`).run(
    campId,
    rarity,
    st.available - 1,
    st.available >= r.maxStock ? now : st.updatedAt
  );
  const id = `merc_${now}_${Math.random().toString(36).substring(2, 7)}`;
  db.prepare(`
    INSERT INTO kingdom_mercenaries (id, user_id, rarity, civ, full_count, strength, status, camp_id, price_json, hired_at)
    VALUES (?, ?, ?, ?, ?, 1, 'home', ?, ?, ?)
  `).run(id, k.id, rarity, k.civilization, bandFullCount(k.civilization, rarity, kingdomFullMarch(k)), campId, JSON.stringify(r.price), now);
  const eventId = recordRealmEvent("mercenary_hire", k.id, campId, { bandId: id, rarity, name: d.name, emblem: d.emblem, civ: k.civilization, camp: camp.name, hirer: k.name });
  if (rarity === "legendary") {
    createBroadcast({
      kind: "mercenary",
      title: `${d.name} signs on with ${k.name}`,
      emblem: d.emblem,
      body: `At ${camp.name}, ${k.name} has hired ${d.name}, a legendary mercenary who marches alone and fights like ${r.power}× a full march. The camp will not see another for a day.`,
      audience: "all",
      eventId,
      now: new Date(now)
    });
  }
  return toBand(bandRow(id)!, now);
});

/** The owner's band or an error */
function ownBand(userId: string, bandId: string): BandRow {
  const b = bandRow(bandId);
  if (!b || b.user_id !== userId) throw new Error("That band doesn't serve you.");
  return b;
}

/** Start healing a wounded band at home (`POST /mercenaries/:id/heal`): share lost × half the hire price, share lost × its full-heal time */
export const healBand = db.transaction((userId: string, bandId: string, now = Date.now()): MercBand => {
  settleBands(now, userId);
  const b = ownBand(userId, bandId);
  if (b.status === "marching") throw new Error("The band is away on a march: heal it once it is home.");
  if (b.status === "defending") throw new Error("The band is on your walls: heal it once the battle is over.");
  if (b.status === "healing") throw new Error("The band is already healing.");
  if (b.strength >= 1) throw new Error("The band is whole.");
  const plan = healPlan(b.rarity, b.strength);
  const d = mercDefFor(b.civ, b.rarity);
  if (Object.keys(plan.cost).length) spendResources(userId, plan.cost, "mercenary_heal", `🪙 Healing ${d.name} from ${Math.round(b.strength * 100)}%: ${costText(plan.cost)}`);
  db.prepare(`UPDATE kingdom_mercenaries SET status = 'healing', heal_from = ?, heal_started_at = ?, heal_until = ? WHERE id = ?`).run(b.strength, now, now + plan.ms, b.id);
  return toBand(bandRow(b.id)!, now);
});

/** Stop a heal (`POST /mercenaries/:id/stop-heal`): it keeps what it healed so far, nothing is refunded */
export const stopHealing = db.transaction((userId: string, bandId: string, now = Date.now()): MercBand => {
  settleBands(now, userId);
  const b = ownBand(userId, bandId);
  if (b.status !== "healing") throw new Error("The band isn't healing.");
  const s = liveStrength(b, now);
  db.prepare(`UPDATE kingdom_mercenaries SET status = 'home', strength = ?, heal_from = NULL, heal_started_at = NULL, heal_until = NULL WHERE id = ?`).run(s, b.id);
  return toBand(bandRow(b.id)!, now);
});

/** Send a band away (`POST /mercenaries/:id/dismiss`): no refund, its place is free. Not while it marches */
export const dismissBand = db.transaction((userId: string, bandId: string, now = Date.now()) => {
  const b = ownBand(userId, bandId);
  if (b.status === "marching") throw new Error("The band is away on a march: dismiss it once it is home.");
  if (b.status === "defending") throw new Error("The band is on your walls: dismiss it once the battle is over.");
  db.prepare(`DELETE FROM kingdom_mercenaries WHERE id = ?`).run(b.id);
  const d = mercDefFor(b.civ, b.rarity);
  recordRealmEvent("mercenary_dismiss", userId, b.id, { rarity: b.rarity, name: d.name, civ: b.civ, strength: b.strength }, new Date(now));
});

/* ------------------------------------------------------------------------- */
/* Marching & fighting (called by the war engine)                            */
/* ------------------------------------------------------------------------- */

/** Why a ruler's band can't march right now (null = it can) */
export function bandMarchBlock(b: MercBand): string | null {
  if (b.status === "marching") return "Away on a march";
  if (b.status === "defending") return "Defending your walls";
  if (b.status === "healing") return "Healing: it can't march until it is whole (or you stop the heal)";
  if (b.strength <= 0) return "Dead";
  return null;
}

/** A band setting off: checked and marked away; returns what the march carries */
export function bandSetsOff(userId: string, bandId: string, marchId: string, now = Date.now()) {
  settleBands(now, userId);
  const b = ownBand(userId, bandId);
  const view = toBand(b, now);
  const block = bandMarchBlock(view);
  if (block) throw new Error(`${view.name}: ${block.toLowerCase()}.`);
  // 🪙 Battle pay, on the spot: a band won't march unpaid
  const pay = battlePayFor(b.rarity);
  if (!canAfford(userId, pay)) throw new Error(`${view.name} won't march unpaid: its battle pay is ${costText(pay)}.`);
  spendResources(userId, pay, "mercenary_battle_pay", `🪙 Battle pay of ${view.name} (${b.rarity}), marching out: ${costText(pay)}`);
  db.prepare(`UPDATE kingdom_mercenaries SET status = 'marching', march_id = ? WHERE id = ?`).run(marchId, b.id);
  return { band: view, count: Math.max(1, Math.round(b.full_count * b.strength)), civ: b.civ };
}

/**
 * 🪙 The ruler's castle is attacked (battle `battleId`): every band at home (whole or wounded, not healing) takes the
 * walls beside the garrison if the treasury pays its battle pay now, oldest band first; one it can't pay stays inside.
 * Returns the bands as defender groups (their soldier-equivalents with their kit, no titles or sets) and the log lines
 */
export function bandsTakeTheWalls(userId: string, ownerName: string, battleId: string, place: string, now = Date.now()): { groups: DefenderGroup[]; log: string[] } {
  settleBands(now, userId);
  const rows = db.prepare(`SELECT * FROM kingdom_mercenaries WHERE user_id = ? AND status = 'home' AND strength > 0 ORDER BY hired_at ASC`).all(userId) as BandRow[];
  const groups: DefenderGroup[] = [];
  const log: string[] = [];
  for (const b of rows) {
    const d = mercDefFor(b.civ, b.rarity);
    const pay = battlePayFor(b.rarity);
    if (!canAfford(userId, pay)) {
      log.push(`🪙 ${d.emblem} ${d.name} won't take the walls unpaid (battle pay ${costText(pay)}): the band stays inside.`);
      continue;
    }
    spendResources(userId, pay, "mercenary_battle_pay", `🪙 Battle pay of ${d.name} (${b.rarity}), defending ${place}: ${costText(pay)}`);
    db.prepare(`UPDATE kingdom_mercenaries SET status = 'defending', march_id = ? WHERE id = ?`).run(battleId, b.id);
    const count = Math.max(1, Math.round(b.full_count * b.strength));
    groups.push({
      marchId: `band:${b.id}`,
      ownerId: userId,
      ownerName: `${ownerName}'s ${d.name}`,
      civ: b.civ,
      count,
      initialCount: count,
      roundsFought: 0,
      carryDamageTaken: 0,
      totalLosses: 0,
      kit: mercKitFor(b.civ, b.rarity, d.name),
      band: { id: b.id, fullCount: b.full_count, rarity: b.rarity, emblem: d.emblem }
    });
    log.push(`🪙 ${d.emblem} ${d.name} (${b.rarity}, ${Math.round(b.strength * 100)}%) takes the walls beside the garrison, paid ${costText(pay)}.`);
  }
  return { groups, log };
}

/** True while the band still serves (it may desert mid-battle over unpaid upkeep) */
export const bandStillServes = (bandId: string) => Boolean(bandRow(bandId));

/** A defence is over: the bands that held the walls go back inside */
export function bandsLeaveTheWalls(battleId: string) {
  db.prepare(`UPDATE kingdom_mercenaries SET status = 'home', march_id = NULL WHERE status = 'defending' AND march_id = ?`).run(battleId);
}

/** A band's strength after a round, the road or an Art (count of its full count); 0 = dead */
export function setBandStrength(bandId: string, count: number, fullCount: number, at: { place: string; now?: number }) {
  const b = bandRow(bandId);
  if (!b) return;
  const strength = Math.max(0, Math.min(1, count / Math.max(1, fullCount)));
  if (strength > 0) {
    db.prepare(`UPDATE kingdom_mercenaries SET strength = ? WHERE id = ?`).run(strength, bandId);
    return;
  }
  bandDies(b, at.place, at.now ?? Date.now());
}

function bandDies(b: BandRow, place: string, now: number) {
  db.prepare(`DELETE FROM kingdom_mercenaries WHERE id = ?`).run(b.id);
  const owner = ownerOf(b.user_id);
  const d = mercDefFor(owner?.civilization ?? b.civ, b.rarity);
  const eventId = recordRealmEvent("mercenary_death", b.user_id, b.id, { rarity: b.rarity, name: d.name, emblem: d.emblem, civ: owner?.civilization ?? b.civ, place, owner: owner?.full_name || owner?.username || b.user_id }, new Date(now));
  createBroadcast({
    kind: "mercenary",
    title: `${d.name} fell at ${place}`,
    emblem: "💀",
    body: `Your ${b.rarity} band, ${d.name}, was wiped out at ${place}. Its place is free: another can be hired at your Mercenary Camp.`,
    audience: "users",
    recipients: [b.user_id],
    eventId,
    now: new Date(now)
  });
}

/** A band's march is home: it is at home with what is left of it */
export function bandHome(bandId: string, count: number, fullCount: number) {
  const strength = Math.max(0, Math.min(1, count / Math.max(1, fullCount)));
  db.prepare(`UPDATE kingdom_mercenaries SET status = 'home', march_id = NULL, strength = ? WHERE id = ?`).run(strength, bandId);
}

/* ------------------------------------------------------------------------- */
/* Upkeep (every harvest)                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Every harvest each band costs its upkeep (home, marching, defending, wounded or healing alike), oldest band first. A band whose
 * upkeep can't be paid is warned once; unpaid again at the next harvest, it deserts (a band on a march leaves the field).
 */
export function chargeMercUpkeep(now = Date.now()) {
  settleBands(now);
  const rows = db.prepare(`SELECT * FROM kingdom_mercenaries ORDER BY user_id, hired_at ASC`).all() as BandRow[];
  for (const b of rows) {
    const upkeep = MERC_RULES[b.rarity].upkeep;
    const d = mercDefFor(b.civ, b.rarity);
    if (canAfford(b.user_id, upkeep)) {
      spendResources(b.user_id, upkeep, "mercenary_upkeep", `🪙 Upkeep of ${d.name} (${b.rarity}): ${costText(upkeep)}`);
      if (b.warned_at !== null) db.prepare(`UPDATE kingdom_mercenaries SET warned_at = NULL WHERE id = ?`).run(b.id);
      continue;
    }
    if (b.warned_at === null) {
      db.prepare(`UPDATE kingdom_mercenaries SET warned_at = ? WHERE id = ?`).run(now, b.id);
      createBroadcast({
        kind: "mercenary",
        title: `${d.name} wants paying`,
        emblem: "🪙",
        body: `Your treasury couldn't pay ${d.name}'s upkeep this harvest (${costText(upkeep)}). Unpaid again at the next harvest, the band deserts.`,
        audience: "users",
        recipients: [b.user_id],
        now: new Date(now)
      });
      continue;
    }
    // Deserts: a band on a march leaves the field at once
    db.prepare(`DELETE FROM kingdom_mercenaries WHERE id = ?`).run(b.id);
    if (b.march_id) {
      db.prepare(`UPDATE active_marches SET soldiers_count = 0, phase = 'done', status = 'resolved', act_until = ?, return_time = ? WHERE id = ? AND status = 'marching'`).run(now, now, b.march_id);
    }
    const eventId = recordRealmEvent("mercenary_desert", b.user_id, b.id, { rarity: b.rarity, name: d.name, civ: b.civ }, new Date(now));
    createBroadcast({
      kind: "mercenary",
      title: `${d.name} deserted`,
      emblem: "🏃",
      body: `${d.name}'s upkeep went unpaid two harvests running, so the band has left your service. Its place is free.`,
      audience: "users",
      recipients: [b.user_id],
      eventId,
      now: new Date(now)
    });
  }
}
