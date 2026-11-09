import { db, getKingdomResources, spendGems, spendResources } from "./db.js";
import { createBroadcast } from "./broadcasts.js";
import {
  ARMORY_RARITIES,
  ARMORY_RULES,
  ArmoryCost,
  ArmoryRarity,
  MAX_FORGE,
  armorySetFor,
  forgeBlockReason,
  forgeCost,
  upkeepCost
} from "./armoryRules.js";
import type { ArmoryView, CivilizationType, DeveloperKingdom, MarchArmory } from "./types.js";

/**
 * 🗡️ The Armory (GAME_GUIDE §13 *The Armory*): a kingdom's forged sets, forging, equipping marches and the upkeep
 * every harvest. The rules and numbers are in armoryRules.ts; battles read a march's set from `active_marches.armory_json`
 * and the garrison's from the sets at home (warEngine.ts).
 *
 * Stock is kept by rarity, not by civilization: a set is its owner's civilization's set of that rarity, so a ruler who
 * changes civilization finds their sets reforged as the new civilization's ones.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS kingdom_armory (
    user_id TEXT NOT NULL,
    rarity TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, rarity)
  );
`);

{
  const cols = (db.prepare(`PRAGMA table_info(active_marches)`).all() as Array<{ name: string }>).map((c) => c.name);
  // This module loads before warEngine creates the table: on a brand-new database its CREATE brings the column
  if (cols.length > 0 && !cols.includes("armory_json")) db.exec(`ALTER TABLE active_marches ADD COLUMN armory_json TEXT`);
}

const costText = (c: ArmoryCost, gems: Record<string, number> = {}) =>
  [...Object.entries(c), ...Object.entries(gems)]
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${(v as number).toLocaleString("en-US")} ${k.replace(/_/g, " ")}`)
    .join(", ");

const canAfford = (userId: string, cost: ArmoryCost) => {
  const res = getKingdomResources(userId);
  return Object.entries(cost).every(([k, v]) => ((res[k as keyof typeof res] as number) ?? 0) >= (v ?? 0));
};

/** Sets at home in the armory, by rarity */
export function armoryStock(userId: string): Record<ArmoryRarity, number> {
  const out = { uncommon: 0, rare: 0, epic: 0 } as Record<ArmoryRarity, number>;
  for (const r of db.prepare(`SELECT rarity, stock FROM kingdom_armory WHERE user_id = ?`).all(userId) as Array<{ rarity: ArmoryRarity; stock: number }>) {
    if (r.rarity in out) out[r.rarity] = Math.max(0, r.stock);
  }
  return out;
}

const addStock = (userId: string, rarity: ArmoryRarity, n: number, now = Date.now()) => {
  db.prepare(
    `INSERT INTO kingdom_armory (user_id, rarity, stock, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, rarity) DO UPDATE SET stock = MAX(0, stock + excluded.stock), updated_at = excluded.updated_at`
  ).run(userId, rarity, n, now);
};

interface AwayRow {
  id: string;
  armory_json: string;
  soldiers_count: number;
}

/** Marches out with a set (outbound, fighting, in a rally lobby or on the way home) */
function marchesInSets(userId: string): Array<{ id: string; armory: MarchArmory }> {
  const rows = db
    .prepare(`SELECT id, armory_json, soldiers_count FROM active_marches WHERE attacker_id = ? AND status = 'marching' AND COALESCE(phase, 'outbound') != 'done' AND armory_json IS NOT NULL`)
    .all(userId) as AwayRow[];
  return rows.map((r) => ({ id: r.id, armory: JSON.parse(r.armory_json) as MarchArmory }));
}

/** Sets away on marches, by rarity: as many as the march still has soldiers to carry them (the fallen's are lost) */
export function setsAway(userId: string): Record<ArmoryRarity, number> {
  const out = { uncommon: 0, rare: 0, epic: 0 } as Record<ArmoryRarity, number>;
  const rows = db
    .prepare(`SELECT armory_json, soldiers_count FROM active_marches WHERE attacker_id = ? AND status = 'marching' AND COALESCE(phase, 'outbound') != 'done' AND armory_json IS NOT NULL`)
    .all(userId) as AwayRow[];
  for (const r of rows) {
    const a = JSON.parse(r.armory_json) as MarchArmory;
    if (a.rarity in out) out[a.rarity] += Math.min(a.count, Math.max(0, r.soldiers_count ?? 0));
  }
  return out;
}

/** What the Armory panel shows a ruler */
export function armoryView(k: DeveloperKingdom): ArmoryView {
  const home = armoryStock(k.id);
  const away = setsAway(k.id);
  const civ = k.civilization;
  return {
    civ,
    sets: ARMORY_RARITIES.map((rarity) => {
      const s = armorySetFor(civ, rarity);
      const per100 = forgeCost(civ, rarity, 100);
      return {
        rarity,
        name: s.name,
        emblem: s.emblem,
        home: home[rarity],
        away: away[rarity],
        forge: per100.cost,
        gems: per100.gems,
        upkeep: ARMORY_RULES[rarity].upkeep,
        upkeepNow: upkeepCost(rarity, home[rarity] + away[rarity]),
        blocked: forgeBlockReason(rarity, k.cityHallLevel)
      };
    })
  };
}

/** Forge `n` sets of a ruler's civilization's `rarity` into the armory (pays the bulk resources and, for epic, the gem) */
export const forgeSets = db.transaction((k: DeveloperKingdom, rarity: ArmoryRarity, n: number) => {
  if (!ARMORY_RARITIES.includes(rarity)) throw new Error("Pick a set to forge.");
  const count = Math.floor(n);
  if (!(count > 0)) throw new Error("Forge at least 1 set.");
  if (count > MAX_FORGE) throw new Error(`Forge at most ${MAX_FORGE.toLocaleString()} sets at a time.`);
  const block = forgeBlockReason(rarity, k.cityHallLevel);
  if (block) throw new Error(`${armorySetFor(k.civilization, rarity).name}: ${block}.`);
  const { cost, gems } = forgeCost(k.civilization, rarity, count);
  const res = getKingdomResources(k.id);
  const missing = [
    ...Object.entries(cost).filter(([key, v]) => ((res[key as keyof typeof res] as number) ?? 0) < (v ?? 0)).map(([key, v]) => `${((v ?? 0) - ((res[key as keyof typeof res] as number) ?? 0)).toLocaleString()} ${key}`),
    ...Object.entries(gems).filter(([key, v]) => ((res.scarce ?? {})[key] ?? 0) < v).map(([key, v]) => `${(v - ((res.scarce ?? {})[key] ?? 0)).toLocaleString()} ${key.replace(/_/g, " ")}`)
  ];
  if (missing.length) throw new Error(`Not enough to forge ${count.toLocaleString()} sets: still need ${missing.join(", ")}.`);
  const s = armorySetFor(k.civilization, rarity);
  const reason = `🗡️ Forged ${count.toLocaleString()} ${s.name} (${rarity}): ${costText(cost, gems)}`;
  if (Object.keys(cost).length) spendResources(k.id, cost, "armory_forge", reason);
  if (Object.keys(gems).length) spendGems(k.id, gems, "armory_forge", reason);
  addStock(k.id, rarity, count);
  return armoryView(k);
});

/**
 * 🗡️ Scrap sets at home (`POST /armory/scrap`): they are broken up for good and nothing comes back, so from the next
 * harvest they cost no upkeep. Sets away on a march can be scrapped once they are home
 */
export const scrapSets = db.transaction((k: DeveloperKingdom, rarity: ArmoryRarity, n: number) => {
  if (!ARMORY_RARITIES.includes(rarity)) throw new Error("Pick a set to scrap.");
  const count = Math.floor(n);
  if (!(count > 0)) throw new Error("Scrap at least 1 set.");
  const s = armorySetFor(k.civilization, rarity);
  const have = armoryStock(k.id)[rarity];
  if (have <= 0) throw new Error(`No ${s.name} at home to scrap.`);
  if (count > have) throw new Error(`Only ${have.toLocaleString()} ${s.name} at home: sets away on a march can be scrapped once they are home.`);
  addStock(k.id, rarity, -count);
  return armoryView(k);
});

/**
 * Take sets for a march setting off (inside its transaction): every soldier of it wears one. Returns what the march
 * records, or null for standard gear. Throws when the armory holds too few
 */
export function takeSets(k: Pick<DeveloperKingdom, "id" | "civilization">, loadout: string | null | undefined, soldiers: number): MarchArmory | null {
  if (!loadout || loadout === "standard") return null;
  const rarity = loadout as ArmoryRarity;
  if (!ARMORY_RARITIES.includes(rarity)) throw new Error("Unknown loadout.");
  const s = armorySetFor(k.civilization, rarity);
  const have = armoryStock(k.id)[rarity];
  if (have < soldiers) throw new Error(`Only ${have.toLocaleString()} ${s.name} at home for ${soldiers.toLocaleString()} soldiers: forge ${(soldiers - have).toLocaleString()} more in the Armory, or send fewer.`);
  addStock(k.id, rarity, -soldiers);
  return { rarity, civ: k.civilization, name: s.name, emblem: s.emblem, count: soldiers };
}

/** A march is home: its survivors bring their sets back (one each; the fallen's were lost on the field) */
export function setsHome(userId: string, armoryJson: string | null | undefined, survivors: number) {
  if (!armoryJson) return;
  const a = JSON.parse(armoryJson) as MarchArmory;
  const back = Math.min(a.count, Math.max(0, Math.floor(survivors)));
  if (back > 0) addStock(userId, a.rarity, back);
}

/* ------------------------------------------------------------------------- */
/* Upkeep (every harvest)                                                    */
/* ------------------------------------------------------------------------- */

/** The largest number of `rarity` sets whose upkeep the treasury can pay, up to `owned` */
function payableSets(userId: string, rarity: ArmoryRarity, owned: number): number {
  if (canAfford(userId, upkeepCost(rarity, owned))) return owned;
  let lo = 0;
  let hi = owned;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (canAfford(userId, upkeepCost(rarity, mid))) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Every harvest each kingdom pays its sets' upkeep (at home and on marches), epic first. What the treasury can't pay
 * rusts back to the stock pile at once: sets at home first, then whole marches' sets (the smallest first; that army
 * fights in standard gear from its next round). The owner gets a herald notice.
 */
export function chargeArmoryUpkeep(now = Date.now()) {
  const owners = new Set<string>([
    ...(db.prepare(`SELECT DISTINCT user_id FROM kingdom_armory WHERE stock > 0`).all() as Array<{ user_id: string }>).map((r) => r.user_id),
    ...(db.prepare(`SELECT DISTINCT attacker_id AS user_id FROM active_marches WHERE status = 'marching' AND armory_json IS NOT NULL`).all() as Array<{ user_id: string }>).map((r) => r.user_id)
  ]);
  for (const userId of owners) {
    const civ = ((db.prepare(`SELECT civilization FROM users WHERE id = ?`).get(userId) as { civilization?: CivilizationType } | undefined)?.civilization ?? "human") as CivilizationType;
    const home = armoryStock(userId);
    const away = setsAway(userId);
    const rusted: string[] = [];
    db.transaction(() => {
      for (const rarity of [...ARMORY_RARITIES].reverse()) {
        const owned = home[rarity] + away[rarity];
        if (owned <= 0) continue;
        const paid = payableSets(userId, rarity, owned);
        const cost = upkeepCost(rarity, paid);
        if (paid > 0 && Object.keys(cost).length) spendResources(userId, cost, "armory_upkeep", `🗡️ Upkeep of ${paid.toLocaleString()} ${armorySetFor(civ, rarity).name}: ${costText(cost)}`);
        let rust = owned - paid;
        if (rust <= 0) continue;
        const total = rust;
        const fromHome = Math.min(home[rarity], rust);
        if (fromHome > 0) addStock(userId, rarity, -fromHome, now);
        rust -= fromHome;
        // Then marches' sets, the smallest first, a whole march at a time
        const marches = marchesInSets(userId)
          .filter((m) => m.armory.rarity === rarity)
          .sort((a, b) => a.armory.count - b.armory.count);
        for (const m of marches) {
          if (rust <= 0) break;
          db.prepare(`UPDATE active_marches SET armory_json = NULL WHERE id = ?`).run(m.id);
          rust -= m.armory.count;
        }
        rusted.push(`${total.toLocaleString()} ${armorySetFor(civ, rarity).emblem} ${armorySetFor(civ, rarity).name}`);
      }
    })();
    if (rusted.length) {
      createBroadcast({
        kind: "armory",
        title: "Your sets are rusting",
        emblem: "🗡️",
        body: `Your treasury couldn't pay the Armory's upkeep this harvest, so ${rusted.join(" and ")} rusted back to the stock pile. Soldiers who wore them fight in standard gear.`,
        audience: "users",
        recipients: [userId],
        now: new Date(now)
      });
    }
  }
}
