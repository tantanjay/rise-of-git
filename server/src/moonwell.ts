import { db, getAwayCivilians, getDeployedSoldiers, getWoundedSoldiers, recordPopulationLedger, spendGems, spendResources } from "./db.js";
import { CivilizationType } from "./types.js";
import { hastenCostFor, woundedOf, woundedShareOf } from "./warConfig.js";

/**
 * 🌙 Moonwell Healers (GAME_GUIDE §13): the elves' trait. A share of the soldiers an elf army loses in a battle are
 * carried home wounded instead of dying. They wait in the `wounded_soldiers` ward (one row per army per battle) and keep
 * their place in the population (db.ts counts them with the soldiers away), then rejoin the home garrison a few at every
 * harvest (db.ts `healWoundedAtHarvest`), or all at once when the ruler pays to hasten them.
 */

/** An army's running tally in a battle: its losses so far, and how many of them were settled as dead and wounded */
export interface WoundTally {
  totalLosses: number;
  dead?: number;
  wounded?: number;
}

/** True when `civ`'s battle losses go through the Moonwell */
export const hasMoonwell = (civ: CivilizationType) => woundedShareOf(civ) > 0;

/**
 * Settle an elf army's losses after a round: of its `totalLosses` so far, `woundedOf` are wounded (their ward row is set to that
 * count) and the rest are dead. The new dead leave the population; an Art
 * that brought fallen back can give some back. Returns this round's change in dead and wounded.
 */
export function settleWounds(p: { userId: string; civ: CivilizationType; rowId: string; place: string; tally: WoundTally; now: number }): { died: number; wounded: number } {
  const total = Math.max(0, p.tally.totalLosses);
  const wounded = woundedOf(p.civ, total);
  const dead = total - wounded;
  const died = dead - (p.tally.dead ?? 0);
  const woundedDelta = wounded - (p.tally.wounded ?? 0);
  p.tally.dead = dead;
  p.tally.wounded = wounded;
  if (woundedDelta !== 0) {
    if (wounded <= 0) db.prepare(`DELETE FROM wounded_soldiers WHERE id = ?`).run(p.rowId);
    else
      db.prepare(
        `INSERT INTO wounded_soldiers (id, user_id, count, place, wounded_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET count = excluded.count`
      ).run(p.rowId, p.userId, wounded, p.place, p.now);
  }
  if (died > 0) db.prepare(`UPDATE users SET population = MAX(0, COALESCE(population, 0) - ?) WHERE id = ?`).run(died, p.userId);
  else if (died < 0) db.prepare(`UPDATE users SET population = COALESCE(population, 0) + ? WHERE id = ?`).run(-died, p.userId);
  return { died, wounded: woundedDelta };
}

/** Ledger line for a settled round: "12 soldiers fell, 12 carried home wounded" */
export function woundsText(r: { died: number; wounded: number }): string {
  return `${Math.max(0, r.died)} soldiers fell${r.wounded > 0 ? `, ${r.wounded} carried home wounded` : ""}`;
}

/** Wounded rejoin the home garrison (never more than the people at home who aren't soldiers already) */
function rejoin(userId: string, count: number, type: string, reason: string) {
  const u = db.prepare(`SELECT population, soldiers FROM users WHERE id = ?`).get(userId) as { population: number | null; soldiers: number | null } | undefined;
  if (!u || count <= 0) return;
  const pop = u.population ?? 0;
  const soldiers = u.soldiers ?? 0;
  // The rows are already gone: what is left at home besides soldiers away, civilians away and the other wounded
  const room = Math.max(0, pop - soldiers - getDeployedSoldiers(userId) - getAwayCivilians(userId) - getWoundedSoldiers(userId));
  const back = Math.min(count, room);
  db.prepare(`UPDATE users SET soldiers = ? WHERE id = ?`).run(soldiers + back, userId);
  recordPopulationLedger({
    userId,
    type,
    soldiersDelta: back,
    populationBalance: pop,
    soldiersBalance: soldiers + back + getDeployedSoldiers(userId),
    reason
  });
}

/** What hastening every wounded soldier of a ruler costs now (null with none) */
export function hastenQuote(userId: string): { count: number; cost: ReturnType<typeof hastenCostFor> } | null {
  const count = getWoundedSoldiers(userId);
  return count > 0 ? { count, cost: hastenCostFor(count) } : null;
}

/** 🌙 The ruler pays to hasten every wounded soldier home now (food + gold per soldier, and Sylvan Emeralds) */
export const hastenWounded = db.transaction((userId: string): { healed: number; cost: ReturnType<typeof hastenCostFor> } => {
  const quote = hastenQuote(userId);
  if (!quote) throw new Error("No wounded soldiers are healing at the Moonwell.");
  const { count, cost } = quote;
  const gemText = Object.entries(cost.gems).map(([k, v]) => `${v} ${k}`).join(", ");
  const reason = `🌙 Hastened ${count} wounded soldiers home from the Moonwell`;
  spendResources(userId, { food: cost.food, gold: cost.gold }, "moonwell_hasten", `${reason} (${cost.food} food, ${cost.gold} gold${gemText ? `, ${gemText}` : ""})`);
  spendGems(userId, cost.gems, "moonwell_hasten", reason);
  db.prepare(`DELETE FROM wounded_soldiers WHERE user_id = ?`).run(userId);
  rejoin(userId, count, "healed", reason);
  return { healed: count, cost };
});

/** A ruler leaving the elves (Voidrift ascension, a civilization swap): every wounded soldier rejoins the garrison first */
export function healAllWounded(userId: string, reason: string) {
  const count = getWoundedSoldiers(userId);
  if (count <= 0) return;
  db.prepare(`DELETE FROM wounded_soldiers WHERE user_id = ?`).run(userId);
  rejoin(userId, count, "healed", `🌙 ${count} wounded soldiers rejoined the garrison: ${reason}`);
}
