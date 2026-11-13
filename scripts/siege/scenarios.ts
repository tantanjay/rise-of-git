/**
 * The scenarios of `npm run sim:siege` (scripts/sim-siege.ts). Never run this file directly: sim-siege copies it into a
 * sandbox beside a copy of `server/src` and a backup of the realm database, and runs it there, one scenario per run on a
 * fresh copy. It refuses to start anywhere without the sandbox's marker file, so it can't touch the real realm.
 *
 * Kingdoms are picked from the realm's own (mortal rulers only, no Nethergarde, no shield, not burning); every frontier
 * gate is set burning on the copy so castles can be attacked. Output names kingdoms by civilization and City Hall only.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DeveloperKingdom } from "../../src/types";

if (!fs.existsSync(path.resolve(".sim-siege-sandbox")) || !process.env.SIM_SIEGE_SANDBOX || path.resolve(process.env.SIM_SIEGE_SANDBOX) !== path.resolve(".")) {
  console.error("scenarios.ts runs only inside the sim:siege sandbox: use `npm run sim:siege`.");
  process.exit(2);
}
// Nothing reaches Git or any other host from the sandbox
globalThis.fetch = (async () => {
  throw new Error("no network in the siege sandbox");
}) as typeof fetch;

const load = <T>(rel: string): Promise<T> => import(pathToFileURL(path.resolve(rel)).href) as Promise<T>;
const D = await load<typeof import("../../server/src/db")>("server/src/db.ts");
const W = await load<typeof import("../../server/src/warEngine")>("server/src/warEngine.ts");
const C = await load<typeof import("../../server/src/champions")>("server/src/champions.ts");
const A = await load<typeof import("../../server/src/armory")>("server/src/armory.ts");
const Dip = await load<typeof import("../../server/src/diplomacy")>("server/src/diplomacy.ts");
const AR = await load<typeof import("../../server/src/armoryRules")>("server/src/armoryRules.ts");
const WC = await load<typeof import("../../server/src/warConfig")>("server/src/warConfig.ts");
const { db } = D;

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures++;
};
const label = (k: DeveloperKingdom) => `${k.civilization} City Hall ${k.cityHallLevel}`;
const an = (s: string) => `${/^[aeiou]/i.test(s) ? "an" : "a"} ${s}`;

let kingdoms = D.getAllKingdomsFromDB();
const fresh = () => (kingdoms = D.getAllKingdomsFromDB());
const kOf = (id: string) => fresh().find((k) => k.id === id)!;
const tick = (now: number) => W.resolvePendingMarches(now, fresh()).reports;
const user = (id: string) => db.prepare(`SELECT population, soldiers FROM users WHERE id = ?`).get(id) as { population: number; soldiers: number };
const battleAt = (targetId: string) =>
  db.prepare(`SELECT id, round, status, defender_json FROM battles WHERE target_id = ? ORDER BY rowid DESC LIMIT 1`).get(targetId) as
    | { id: string; round: number; status: string; defender_json: string }
    | undefined;
const garrisonOf = (b: { defender_json: string }) => JSON.parse(b.defender_json) as { count: number; championLed?: { fell?: boolean; away?: boolean } };

// Every frontier gate burning, so every province's castles can be attacked on the copy
db.prepare(`UPDATE npc_kingdoms SET wall_hp = 0, wall_updated_at = ? WHERE npc_id LIKE 'npc-gate-%'`).run(Date.now());
fresh();
const mortals = kingdoms.filter((k) => k.civilization !== "arcane" && !k.isSpecial && !k.isArchon && !k.shield && !k.burning);

/**
 * An attacker of City Hall `minLevel`+ and a castle of another civilization it can march on (with `defenderSlots` march
 * slots), the attack already on the road: tries pairs until the engine accepts one
 */
function openSiege(o: { minLevel: number; defenderSlots: number; garrison: (d: DeveloperKingdom) => number; loadout?: string }) {
  const attackers = mortals.filter((k) => k.cityHallLevel >= o.minLevel).sort((a, b) => b.cityHallLevel - a.cityHallLevel);
  for (const att of attackers) {
    for (const def of mortals.filter((k) => k.id !== att.id && k.civilization !== att.civilization && (k.marchSlots ?? 1) >= o.defenderSlots)) {
      const cap = att.marchCapacity ?? 1;
      db.prepare(`UPDATE users SET soldiers = ? WHERE id = ?`).run(cap, att.id);
      db.prepare(`UPDATE users SET soldiers = ? WHERE id = ?`).run(o.garrison(def), def.id);
      try {
        if (o.loadout) A.forgeSets(kOf(att.id), o.loadout as "uncommon", cap);
        const march = W.startMarch({ attackerKingdom: kOf(att.id), targetType: "dev_kingdom", targetId: def.id, soldiersCount: cap, kingdoms: fresh(), loadout: o.loadout });
        return { att: kOf(att.id), def: kOf(def.id), march, sent: cap };
      } catch {
        // not a pair the engine allows today (same province rules, protection…): try the next
      }
    }
  }
  return null;
}

/** Fight the siege at `defId` round by round from `t` (one round per BATTLE_ROUND_MS); `each` runs after every round */
function fight(defId: string, t: number, each?: (round: number, now: number) => void) {
  for (let i = 0; i <= 40; i++) {
    const now = t + i * WC.BATTLE_ROUND_MS;
    tick(now);
    const b = battleAt(defId);
    if (b) each?.(b.round, now);
    if (!b || b.status !== "fighting") return now;
  }
  return t + 40 * WC.BATTLE_ROUND_MS;
}

const scenarios: Record<string, () => void> = {
  "garrison-balance"() {
    const s = openSiege({ minLevel: 1, defenderSlots: 1, garrison: (d) => WC.maxSoldiersFor(d.population ?? 0, d.civilization) });
    if (!s) return check(false, "found a pair of kingdoms that can fight a siege");
    console.log(`  ${label(s.att)} sends ${s.sent} at ${an(label(s.def))} castle (${user(s.def.id).soldiers} at home)`);
    const partner = mortals.find((k) => k.id !== s.att.id && k.id !== s.def.id && k.civilization !== s.def.civilization);
    let swapTried = false;
    let balanced = true;
    fight(s.def.id, s.march.arrivalTime, (round) => {
      const b = battleAt(s.def.id)!;
      const u = user(s.def.id);
      if (u.soldiers !== Math.max(0, garrisonOf(b).count) || u.soldiers < 0 || u.population < u.soldiers) balanced = false;
      if (round === 1 && b.status === "fighting" && partner && !swapTried) {
        swapTried = true;
        let refused = "";
        try {
          Dip.proposeSwap(kOf(s.def.id), kOf(partner.id));
        } catch (e: any) {
          refused = String(e.message);
        }
        check(/siege/i.test(refused), "a ruler under siege can't offer a civilization swap");
      }
    });
    check(balanced, "every round the kingdom's soldiers equal the battle's garrison (never below 0, never above the people)");
    check(battleAt(s.def.id)?.status === "done", "the battle ends");
  },

  "champion-leaves"() {
    const s = openSiege({ minLevel: 1, defenderSlots: 2, garrison: (d) => WC.maxSoldiersFor(d.population ?? 0, d.civilization) });
    if (!s) return check(false, "found a pair of kingdoms that can fight a siege");
    C.ensureChampion(s.def.id);
    console.log(`  ${label(s.att)} sends ${s.sent} at ${an(label(s.def))} castle; its champion leads the garrison`);
    let ledFirst = false;
    let sortie = null as { id: string } | null;
    fight(s.def.id, s.march.arrivalTime, (round) => {
      const b = battleAt(s.def.id)!;
      if (round !== 1 || b.status !== "fighting" || sortie) return;
      ledFirst = Boolean(garrisonOf(b).championLed);
      // The champion rides out at the head of most of the garrison…
      const home = user(s.def.id).soldiers;
      const send = Math.min(kOf(s.def.id).marchCapacity ?? 1, Math.max(1, home - 3));
      sortie = W.startMarch({ attackerKingdom: kOf(s.def.id), targetType: "dev_kingdom", targetId: s.att.id, soldiersCount: send, kingdoms: fresh(), champion: true });
      // …and the few left on the walls fall in the next round
      const left = user(s.def.id).soldiers;
      if (left > 3) {
        const g = JSON.parse(b.defender_json);
        g.count = 3;
        db.prepare(`UPDATE battles SET defender_json = ? WHERE id = ?`).run(JSON.stringify(g), b.id);
        db.prepare(`UPDATE users SET soldiers = 3 WHERE id = ?`).run(s.def.id);
      }
      console.log(`  after round 1 the champion leads ${send} out; ${Math.min(3, left)} stay on the walls`);
    });
    check(ledFirst, "the champion led the garrison in round 1");
    if (!sortie) return check(false, "the champion rode out mid-siege");
    const b = battleAt(s.def.id)!;
    const fell = garrisonOf(b).count <= 0;
    check(fell, "the garrison it left was wiped out");
    const told = (db.prepare(`SELECT log_json FROM battles WHERE id = ?`).get(b.id) as { log_json: string | null }).log_json ?? "";
    check(/rides out at the head of a march/.test(told), "the battle log tells the defender the champion rode out");
    const row = C.ensureChampion(s.def.id)!;
    const now = Date.now();
    check(!row.wounded_until || row.wounded_until <= now, "the champion isn't wounded by a fall it wasn't at");
    check(row.march_id === sortie.id && C.championStatus(row, now) === "away", "it still leads the march it rode out with");
    let second = "";
    try {
      db.prepare(`UPDATE users SET soldiers = soldiers + 10 WHERE id = ?`).run(s.def.id);
      W.startMarch({ attackerKingdom: kOf(s.def.id), targetType: "dev_kingdom", targetId: s.att.id, soldiersCount: 5, kingdoms: fresh(), champion: true });
    } catch (e: any) {
      second = String(e.message);
    }
    check(/already leads/i.test(second), "it can't lead a second march at the same time");
    const carried = (db.prepare(`SELECT COUNT(*) AS n FROM active_marches WHERE attacker_id = ? AND status = 'marching' AND champion_json IS NOT NULL`).get(s.def.id) as { n: number }).n;
    check(carried === 1, `one march carries the champion (${carried})`);
  },

  "armory-sets"() {
    const rich = { gold: 1_000_000, iron: 5_000_000, stone: 5_000_000, lumber: 5_000_000, food: 50_000_000 };
    const fill = db.prepare(`UPDATE kingdom_resources SET gold = @gold, iron = @iron, stone = @stone, lumber = @lumber, food = @food WHERE user_id = @id`);
    for (const k of mortals) fill.run({ ...rich, id: k.id });
    const s = openSiege({ minLevel: 6, defenderSlots: 1, garrison: (d) => Math.floor(WC.maxSoldiersFor(d.population ?? 0, d.civilization) / 2), loadout: "uncommon" });
    if (!s) return check(false, "found a City Hall 6+ ruler who can forge sets and attack a castle");
    const forged = s.sent;
    console.log(`  ${label(s.att)} forges ${forged} uncommon sets and sends ${s.sent} in them at ${an(label(s.def))} castle`);
    check(A.armoryStock(s.att.id).uncommon === 0, "every set rides out with the army (none left at home)");
    fight(s.def.id, s.march.arrivalTime);
    const m = db.prepare(`SELECT soldiers_count, return_time, phase FROM active_marches WHERE id = ?`).get(s.march.id) as { soldiers_count: number; return_time: number | null; phase: string };
    const survivors = Math.max(0, m.soldiers_count);
    if (m.return_time) tick(m.return_time + 1);
    const home = A.armoryStock(s.att.id).uncommon;
    console.log(`  ${survivors} of ${s.sent} came home; ${home} sets hang in the armory`);
    check(home === Math.min(forged, survivors), "the survivors bring home one set each, the fallen's are lost");
    check(home <= forged, "never more sets than were forged");
    if (home > 0) {
      const food = D.getKingdomResources(s.att.id).food;
      A.chargeArmoryUpkeep();
      const paid = food - D.getKingdomResources(s.att.id).food;
      const due = AR.upkeepCost("uncommon", home).food ?? 0;
      check(paid === due, `upkeep is paid in full while the treasury can (${paid} of ${due} food)`);
      db.prepare(`UPDATE kingdom_resources SET food = 0 WHERE user_id = ?`).run(s.att.id);
      A.chargeArmoryUpkeep();
      check(A.armoryStock(s.att.id).uncommon === 0, "an empty granary rusts the sets at home");
    }
  }
};

const name = process.argv[2];
const run = scenarios[name];
if (!run) {
  console.error(`Unknown scenario ${name}. Scenarios: ${Object.keys(scenarios).join(", ")}`);
  process.exit(2);
}
run();
process.exit(failures ? 1 : 0);
