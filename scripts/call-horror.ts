/**
 * Dev: send Xal'Vorath on the local realm (server/data/realm.db) without signing in, to see and test it
 * (GAME_GUIDE §15 *Wrath*). The running server's minute clock brings it to the gates, drives it back or burns the city.
 *
 *   npm run horror -- send jane.doe 3 2     Level 3 at that login, reaching the gates in 2 minutes (default: 3 days)
 *   npm run horror -- hurry                 brings every arrival, or the end of every hour at the gates, forward to now
 *   npm run horror -- end                   calls every horror back
 *   npm run horror -- list                  who it is coming for
 *
 * Signed in as an admin, a Special Overseer or the Archon, the same is in 👑 Royal Decrees → Wrath.
 */
import "../server/src/env.js";
import { getAllKingdomsFromDB } from "../server/src/db.js";
import { horrorStatuses, hurryHorror, launchHorrors, liftWrath } from "../server/src/horror.js";
import { validHorrorLevel } from "../server/src/horrorRules.js";

const [cmd, login, level, minutes] = process.argv.slice(2);
const at = (ms: number) => new Date(ms).toLocaleString();

if (cmd === "send") {
  const kingdoms = getAllKingdomsFromDB();
  const target = kingdoms.find((k) => k.id === login || k.username === login);
  if (!target) {
    console.error(`No ruler "${login}". Rulers: ${kingdoms.map((k) => k.username || k.id).join(", ")}`);
    process.exit(1);
  }
  const lvl = validHorrorLevel(Number(level) || 3);
  launchHorrors({ senderId: "dev", targets: [target], level: lvl, kingdoms, approachMs: minutes ? Number(minutes) * 60_000 : undefined });
  console.log(`🌑 Xal'Vorath, Level ${lvl}, turns toward ${target.name}.`);
} else if (cmd === "hurry") {
  console.log(`${hurryHorror()} horror(s) hurried: the server acts within a minute.`);
} else if (cmd === "end") {
  const out = horrorStatuses();
  for (const h of out) console.log(liftWrath("dev", h.id).message);
  if (!out.length) console.log("No horror is out in the realm.");
} else {
  const out = horrorStatuses();
  for (const h of out) console.log(`🌑 Level ${h.level} → ${h.targetName}: ${h.phase}, at the gates ${at(h.arrivesAt)}, burns ${at(h.siegeEndsAt)}, ${h.hp.toLocaleString()} HP`);
  if (!out.length) console.log("No horror is out in the realm.");
  if (cmd !== "list") console.log("\nUsage: npm run horror -- send <login> [level] [minutes] | hurry | end | list");
}
process.exit(0);
