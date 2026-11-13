import { db, getDeployedSoldiers, recordPopulationLedger, setCivilization } from "./db.js";
import { healAllWounded } from "./moonwell.js";
import { config } from "./env.js";
import { CivilizationType, CivSwapProposal, DeveloperKingdom } from "./types.js";
import { calculateMaxPopulation, convertPopulationOnSwap } from "./demographics.js";
import { areCivsInWarFrenzy, countActiveMarchesForUser, getCivPlaces } from "./warEngine.js";

/**
 * Civilization changes outside of war (GAME_GUIDE §13):
 * - a peaceful swap two mortal rulers both agree to, and
 * - a ruler re-aligning their own kingdom into a mortal civilization that has an open place (`open(civ) > 0`).
 * Nethergarde is out of reach of both: it is entered by conquest and left by defeat only, and
 * Special Overseers never change.
 * Neither swaps nor realignments are allowed while either kingdom has a march away from home,
 * while burning, or between two civilizations locked in War Frenzy this week.
 */

/** A swap proposal not answered within this long lapses */
export const SWAP_PROPOSAL_TTL_HOURS = 24;
/** Recently settled proposals shown next to the open ones */
const SWAP_HISTORY_LIMIT = 10;

db.exec(`
  CREATE TABLE IF NOT EXISTS civ_swap_proposals (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    from_civ TEXT NOT NULL,
    to_civ TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    resolved_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_swaps_from ON civ_swap_proposals(from_id, status);
  CREATE INDEX IF NOT EXISTS idx_swaps_to ON civ_swap_proposals(to_id, status);
`);

const isSpecial = (k: { id: string; username?: string }) => {
  const special = new Set(config.specialUsers.map((s) => s.toLowerCase()));
  return special.has(k.id.toLowerCase()) || special.has((k.username ?? "").toLowerCase());
};

/** Why this kingdom can't change civilization peacefully right now (null when it can) */
function blockedReason(k: DeveloperKingdom): string | null {
  if (isSpecial(k)) return `${k.name} is a Special Overseer and never changes civilization.`;
  if (k.civilization === "arcane") return `${k.name} belongs to Nethergarde — the Voidrift is only left by defeat in battle.`;
  if (k.burning) return `${k.name}'s city walls are burning; wait until ceasefire recovery completes.`;
  if (getDeployedSoldiers(k.id) > 0 || countActiveMarchesForUser(k.id) > 0) {
    return `${k.name} has an army away from home; every march must return home before changing civilization.`;
  }
  // ⚔️ A castle under siege fights as the civilization it was when the battle began: no changing sides until it ends
  if (db.prepare(`SELECT 1 FROM battles WHERE target_type = 'dev_kingdom' AND target_id = ? AND status = 'fighting' LIMIT 1`).get(k.id)) {
    return `${k.name} is under siege; wait until the battle at its walls is over before changing civilization.`;
  }
  return null;
}

/** Re-align a kingdom with another civilization, converting its people at the same fill ratio */
function convertCivilization(userId: string, newCiv: CivilizationType, reason: string) {
  // 🌙 Leaving the elves: the Moonwell sends every wounded soldier home first
  healAllWounded(userId, `the Moonwell lets its wounded go as the kingdom leaves the elves`);
  const u = db.prepare(`SELECT civilization, population, soldiers, city_hall_level FROM users WHERE id = ?`).get(userId) as
    | { civilization: CivilizationType; population: number | null; soldiers: number | null; city_hall_level: number | null }
    | undefined;
  if (!u) throw new Error("Kingdom not found");
  const level = u.city_hall_level ?? 1;
  const converted = convertPopulationOnSwap({
    currentPop: u.population ?? 0,
    currentSoldiers: u.soldiers ?? 0,
    oldCiv: u.civilization,
    oldLevel: level,
    newCiv,
    newLevel: level,
    peaceful: true
  });
  setCivilization(userId, newCiv);
  db.prepare(`UPDATE users SET population = ?, soldiers = ?, max_population = ?, updated_at = datetime('now') WHERE id = ?`).run(
    converted.newPopulation,
    converted.newSoldiers,
    calculateMaxPopulation(level, newCiv),
    userId
  );
  recordPopulationLedger({
    userId,
    type: "civ_swap",
    populationBalance: converted.newPopulation,
    soldiersBalance: converted.newSoldiers,
    reason: `${reason} (${u.civilization} → ${newCiv})`
  });
}

/** A ruler re-aligns their own (mortal) kingdom into a mortal civilization that has an open place */
export const realignCivilization = db.transaction((k: DeveloperKingdom, newCiv: CivilizationType, allKingdoms?: DeveloperKingdom[]) => {
  if (newCiv === "arcane") throw new Error("Nethergarde can't be chosen — conquer a Voidrift slot to ascend.");
  const blocked = blockedReason(k);
  if (blocked) throw new Error(blocked);
  if (k.civilization === newCiv) throw new Error(`${k.name} already belongs to the ${newCiv} civilization.`);

  if (areCivsInWarFrenzy(k.civilization, newCiv)) {
    throw new Error(`War Frenzy is active between ${k.civilization} and ${newCiv} this week — no swaps or realignments until Sunday 00:00 UTC.`);
  }

  const civPlaces = getCivPlaces(allKingdoms);
  const targetInfo = civPlaces.places[newCiv];
  if (!targetInfo || targetInfo.open <= 0) {
    throw new Error(
      `No open places in ${newCiv} (${targetInfo?.occupied ?? 0}/${targetInfo?.places ?? 0} occupied). A place opens when a ${newCiv} ruler ascends into the Voidrift, or propose a 2-player swap instead.`
    );
  }

  convertCivilization(k.id, newCiv, "Stepped into an open civilization place");
});

const rowToProposal = (r: any): CivSwapProposal => ({
  id: r.id,
  fromId: r.from_id,
  toId: r.to_id,
  fromCiv: r.from_civ,
  toCiv: r.to_civ,
  status: r.status,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  resolvedAt: r.resolved_at ?? null
});

/** Mark lapsed proposals as expired */
function expireStale(now = Date.now()) {
  db.prepare(`UPDATE civ_swap_proposals SET status = 'expired', resolved_at = ? WHERE status = 'pending' AND expires_at <= ?`).run(now, now);
  // An offer names the two civilizations it trades: once either ruler belongs to another one, it lapses
  db.prepare(`
    UPDATE civ_swap_proposals SET status = 'expired', resolved_at = ?
    WHERE status = 'pending' AND (
      from_civ IS NOT (SELECT civilization FROM users WHERE id = civ_swap_proposals.from_id) OR
      to_civ IS NOT (SELECT civilization FROM users WHERE id = civ_swap_proposals.to_id)
    )
  `).run(now);
}

/** Open proposals involving a kingdom, plus its most recently settled ones */
export function listSwapProposals(userId: string): CivSwapProposal[] {
  expireStale();
  const open = db.prepare(`SELECT * FROM civ_swap_proposals WHERE status = 'pending' AND (from_id = ? OR to_id = ?) ORDER BY created_at DESC`).all(userId, userId);
  const settled = db
    .prepare(`SELECT * FROM civ_swap_proposals WHERE status != 'pending' AND (from_id = ? OR to_id = ?) ORDER BY resolved_at DESC LIMIT ?`)
    .all(userId, userId, SWAP_HISTORY_LIMIT);
  return [...open, ...settled].map(rowToProposal);
}

export function proposeSwap(from: DeveloperKingdom, to: DeveloperKingdom): CivSwapProposal {
  expireStale();
  if (from.id === to.id) throw new Error("You can't swap with yourself.");
  for (const k of [from, to]) {
    const blocked = blockedReason(k);
    if (blocked) throw new Error(blocked);
  }
  if (from.civilization === to.civilization) throw new Error(`You are both ${from.civilization} — there is nothing to swap.`);
  if (areCivsInWarFrenzy(from.civilization, to.civilization)) {
    throw new Error(`War Frenzy is active between ${from.civilization} and ${to.civilization} this week — peaceful swaps are suspended until Sunday 00:00 UTC.`);
  }
  const existing = db
    .prepare(`SELECT id FROM civ_swap_proposals WHERE status = 'pending' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`)
    .get(from.id, to.id, to.id, from.id);
  if (existing) throw new Error(`A swap between ${from.name} and ${to.name} is already waiting for an answer.`);

  const now = Date.now();
  const row = {
    id: `swap_${now}_${Math.random().toString(36).substring(2, 7)}`,
    from_id: from.id,
    to_id: to.id,
    from_civ: from.civilization,
    to_civ: to.civilization,
    status: "pending",
    created_at: now,
    expires_at: now + SWAP_PROPOSAL_TTL_HOURS * 3_600_000
  };
  db.prepare(
    `INSERT INTO civ_swap_proposals (id, from_id, to_id, from_civ, to_civ, status, created_at, expires_at) VALUES (@id, @from_id, @to_id, @from_civ, @to_civ, @status, @created_at, @expires_at)`
  ).run(row);
  return rowToProposal(row);
}

/**
 * The recipient accepts or declines, or the proposer withdraws. Accepting swaps both
 * civilizations at once (each side's people convert at its fill ratio, no casualties).
 */
export const answerSwap = db.transaction((proposalId: string, userId: string, action: "accept" | "decline" | "cancel", kingdoms: DeveloperKingdom[]): CivSwapProposal => {
  expireStale();
  const row = db.prepare(`SELECT * FROM civ_swap_proposals WHERE id = ?`).get(proposalId) as any;
  if (!row) throw new Error("Swap proposal not found.");
  if (row.status === "expired" && row.expires_at > Date.now()) {
    throw new Error(`This offer was for ${row.from_civ} ⇄ ${row.to_civ}, and one of you has changed civilization since, so it has lapsed.`);
  }
  if (row.status !== "pending") throw new Error(`This proposal is already ${row.status}.`);
  if (action === "cancel" ? row.from_id !== userId : row.to_id !== userId) throw new Error("This proposal isn't yours to answer.");

  const now = Date.now();
  if (action !== "accept") {
    const status = action === "cancel" ? "cancelled" : "declined";
    db.prepare(`UPDATE civ_swap_proposals SET status = ?, resolved_at = ? WHERE id = ?`).run(status, now, proposalId);
    return rowToProposal({ ...row, status, resolved_at: now });
  }

  const from = kingdoms.find((k) => k.id === row.from_id);
  const to = kingdoms.find((k) => k.id === row.to_id);
  if (!from || !to) throw new Error("One of the kingdoms no longer exists.");
  for (const k of [from, to]) {
    const blocked = blockedReason(k);
    if (blocked) throw new Error(blocked);
  }
  // The trade the offer named (expireStale has already lapsed any offer whose rulers changed civilization since)
  const [fromCiv, toCiv] = [row.from_civ as CivilizationType, row.to_civ as CivilizationType];
  if (fromCiv === toCiv) throw new Error(`You are both ${fromCiv} now — there is nothing to swap.`);
  if (areCivsInWarFrenzy(fromCiv, toCiv)) {
    throw new Error(`War Frenzy is active between ${fromCiv} and ${toCiv} this week — peaceful swaps are suspended until Sunday 00:00 UTC.`);
  }
  convertCivilization(from.id, toCiv, `Peaceful swap with ${to.name}`);
  convertCivilization(to.id, fromCiv, `Peaceful swap with ${from.name}`);
  db.prepare(`UPDATE civ_swap_proposals SET status = 'accepted', resolved_at = ? WHERE id = ?`).run(now, proposalId);
  return rowToProposal({ ...row, status: "accepted", resolved_at: now });
});
