/**
 * Dev: call a world disaster on the local realm (server/data/realm.db) without signing in, to see and test it
 * (GAME_GUIDE §10 *World Disasters*). The running server's minute clock picks it up and raises the notices.
 *
 *   npm run disaster -- blood_moon        strikes now (blight | tempest | blood_moon | plague | barren)
 *   npm run disaster -- plague 30         warned of now, strikes in 30 minutes
 *   npm run disaster -- end               ends the one in force (its closing notice follows)
 *   npm run disaster -- list              the last week and the next two days
 *
 * Signed in as an admin, the same is in ⚙️ Admin → World disasters (POST /api/admin/disasters).
 */
import "../server/src/env.js";
import { callDisaster, endDisasterNow, listDisasters } from "../server/src/disasters.js";
import { DISASTERS, DISASTER_KINDS, DisasterKind } from "../server/src/disasterRules.js";

const [arg, minutes] = process.argv.slice(2);
const at = (ms: number) => new Date(ms).toLocaleString();

if (arg === "end") {
  console.log(endDisasterNow(Date.now(), { tick: false }) ? "Ended the disaster in force: the server raises its closing notice within a minute." : "No disaster is in force.");
} else if (arg === "list" || !arg) {
  for (const d of listDisasters()) console.log(`${DISASTERS[d.kind].emblem} ${DISASTERS[d.kind].name.padEnd(14)} ${at(d.startsAt)} → ${at(d.endsAt)}${d.scheduled ? "" : `  (called by ${d.calledBy})`}`);
  if (!arg) console.log(`\nUsage: npm run disaster -- <${DISASTER_KINDS.join(" | ")}> [minutes] | end | list`);
} else if (DISASTER_KINDS.includes(arg as DisasterKind)) {
  callDisaster(arg as DisasterKind, "dev", Number(minutes) || 0, Date.now(), { tick: false });
  const d = DISASTERS[arg as DisasterKind];
  console.log(`${d.emblem} ${d.name} called${Number(minutes) ? ` for ${minutes} minutes from now` : ""}: the running server raises its notices within a minute.`);
} else {
  console.error(`Unknown disaster "${arg}". Use ${DISASTER_KINDS.join(", ")}, end or list.`);
  process.exit(1);
}
