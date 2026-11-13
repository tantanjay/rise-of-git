/**
 * npm run sim:siege                       every scenario
 * npm run sim:siege -- champion-leaves    one scenario (names: see scripts/siege/scenarios.ts)
 * npm run sim:siege -- --keep             keep the sandbox folder afterwards (its path is printed)
 *
 * Sieges on the real war engine, end to end: marches set off, castles are attacked round by round, armies come home.
 * Unlike the other sim:* scripts, which run the battle rules alone, this one runs `warEngine.ts` and `db.ts` against
 * the realm's own kingdoms, so it never touches the real database: it copies `server/src` and a consistent backup of
 * `server/data/realm.db` (and the world map) into a sandbox folder in the system temp dir, with no `.env` (nothing calls
 * Git) and `fetch` stubbed out, and runs each scenario there on a fresh copy of that backup. The sandbox is deleted at
 * the end.
 *
 * Each scenario checks one rule that must always hold in a siege and fails (exit 1) when it doesn't:
 *   garrison-balance   a castle battle leaves the kingdom's soldiers equal to the battle's garrison, never below 0, and
 *                      its ruler can't change civilization while it lasts (GAME_GUIDE §9, §13)
 *   champion-leaves    a champion who led the garrison and then rode out at the head of a march doesn't fall with that
 *                      garrison, and still leads one march only (§13 Champions)
 *   armory-sets        an army in Armory sets brings home no more sets than survivors, and unpaid upkeep rusts the sets
 *                      at home first (§13 The Armory)
 *
 * Needs the realm database (run the server once, or restore a backup into server/data/realm.db).
 */
import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(".");
const DATA = path.join(ROOT, "server/data");
const SOURCE_DB = path.join(DATA, "realm.db");
const TSX = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
const SCENARIOS = ["garrison-balance", "champion-leaves", "armory-sets"];

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const picked = args.filter((a) => !a.startsWith("--"));
const unknown = picked.filter((p) => !SCENARIOS.includes(p));
if (unknown.length) {
  console.error(`Unknown scenario: ${unknown.join(", ")}. Scenarios: ${SCENARIOS.join(", ")}`);
  process.exit(2);
}
if (!fs.existsSync(SOURCE_DB)) {
  console.error(`No realm database at ${SOURCE_DB}: run the server once (npm run dev) or restore a backup there.`);
  process.exit(2);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "rise-of-git-siege-"));
const sbData = path.join(sandbox, "server/data");
const sbDb = path.join(sbData, "realm.db");
const sbBackup = path.join(sandbox, "realm.backup.db");
const sbModules = path.join(sandbox, "node_modules");

function cleanUp() {
  if (keep) {
    console.log(`\nSandbox kept at ${sandbox}`);
    return;
  }
  // The node_modules link goes first, on its own, so nothing is ever deleted through it
  try {
    fs.unlinkSync(sbModules);
  } catch {
    try {
      fs.rmdirSync(sbModules);
    } catch {
      // not made yet
    }
  }
  if (fs.existsSync(sbModules)) {
    console.error(`Could not remove the node_modules link in ${sandbox}: left the sandbox in place.`);
    return;
  }
  fs.rmSync(sandbox, { recursive: true, force: true });
}

let failed = false;
try {
  console.log(`🏰 Siege sandbox: ${sandbox}`);
  fs.cpSync(path.join(ROOT, "server/src"), path.join(sandbox, "server/src"), { recursive: true });
  fs.mkdirSync(sbData, { recursive: true });
  // A consistent copy of the live database (safe while the server runs), opened read-only
  const live = new Database(SOURCE_DB, { readonly: true, fileMustExist: true });
  await live.backup(sbBackup);
  live.close();
  // The world map and the other small state files beside the database (roving rerolls)
  for (const f of fs.readdirSync(DATA)) if (f.endsWith(".json")) fs.copyFileSync(path.join(DATA, f), path.join(sbData, f));
  fs.writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ type: "module", private: true }));
  fs.copyFileSync(path.join(ROOT, "scripts/siege/scenarios.ts"), path.join(sandbox, "scenarios.ts"));
  // The marker the scenarios check before they run: they refuse to start anywhere else
  fs.writeFileSync(path.join(sandbox, ".sim-siege-sandbox"), "");
  fs.symlinkSync(path.join(ROOT, "node_modules"), sbModules, "junction");

  // No Git credentials reach the sandbox
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(GIT_|GITHUB_|GITLAB_|OAUTH_|SESSION_)/.test(k)) delete env[k];
  env.SIM_SIEGE_SANDBOX = sandbox;

  for (const name of picked.length ? picked : SCENARIOS) {
    for (const f of [sbDb, `${sbDb}-wal`, `${sbDb}-shm`]) fs.rmSync(f, { force: true });
    fs.copyFileSync(sbBackup, sbDb);
    console.log(`\n── ${name} ──`);
    const run = spawnSync(process.execPath, [TSX, "scenarios.ts", name], { cwd: sandbox, env, stdio: "inherit" });
    if (run.status !== 0) failed = true;
  }
} finally {
  cleanUp();
}

console.log(failed ? "\n✗ A siege rule failed" : "\n⚖️ Every siege rule holds");
process.exit(failed ? 1 : 0);
