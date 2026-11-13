/**
 * npm run backup:db                                   backs up to server/data/backups/realm-<UTC time>.db
 * npm run backup:db -- --label before-backfill        adds a label: realm-<UTC time>-before-backfill.db
 * npm run backup:db -- D:/backups                     writes into another folder
 * npm run backup:db -- D:/backups/realm-copy.db       writes exactly that file
 *
 * A consistent copy of the realm database, safe to take while the server runs: `VACUUM INTO` writes the whole realm
 * as it stands at one moment (one read transaction, the write-ahead log included), never half a harvest, and the
 * server keeps writing meanwhile. The copy is one self-contained file (no -wal / -shm beside it), compacted. A bare
 * file copy of realm.db while the server runs is not safe: it misses what still sits in realm.db-wal.
 * The world map (server/data/world_map.json) is copied beside it. The copy is then opened and checked
 * (`PRAGMA quick_check`, row counts) before the script says it's done. An existing file is never overwritten.
 *
 * To restore: stop the server, copy the backup over server/data/realm.db, delete realm.db-wal and realm.db-shm next
 * to it (they belong to the database being replaced), put the world map back if needed, and start the server.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA = path.resolve("server/data");
const SOURCE = path.join(DATA, "realm.db");
const MAP = path.join(DATA, "world_map.json");

const args = process.argv.slice(2);
const labelAt = args.indexOf("--label");
const label = labelAt >= 0 ? (args[labelAt + 1] ?? "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") : "";
const target = args.find((a, i) => !a.startsWith("--") && !(labelAt >= 0 && i === labelAt + 1));

if (!fs.existsSync(SOURCE)) {
  console.error(`No database at ${SOURCE}. Run this from the project folder (where package.json is).`);
  process.exit(1);
}

// 2026-11-11T08-30-05Z: sorts by time and is a valid file name everywhere
const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
const base = `realm-${stamp}${label ? `-${label}` : ""}`;
const dest = target && target.toLowerCase().endsWith(".db") ? path.resolve(target) : path.join(path.resolve(target ?? path.join(DATA, "backups")), `${base}.db`);
const mapDest = dest.replace(/\.db$/i, "").replace(/realm(?=[^/\\]*$)/, "world_map") + ".json";

if (fs.existsSync(dest)) {
  console.error(`${dest} already exists; not overwriting it.`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const started = Date.now();
const source = new Database(SOURCE, { readonly: true, fileMustExist: true });
source.pragma("busy_timeout = 10000");
try {
  source.prepare("VACUUM INTO ?").run(dest);
} catch (err) {
  fs.rmSync(dest, { force: true });
  console.error(`Backup failed: ${(err as Error).message}`);
  process.exit(1);
} finally {
  source.close();
}

// Check the copy before calling it a backup. It keeps the source's WAL setting, which only matters once a server
// opens it; set back to a plain journal so the backup stays a single file
const copy = new Database(dest, { fileMustExist: true });
copy.pragma("journal_mode = DELETE");
const check = copy.pragma("quick_check", { simple: true });
const hasTable = (name: string) => Boolean(copy.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
const counts = ["users", "repositories", "commits", "kingdom_resources", "resource_ledger"]
  .filter(hasTable)
  .map((t) => `${t} ${(copy.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }).n.toLocaleString()}`);
copy.close();
if (check !== "ok") {
  console.error(`The copy at ${dest} failed its check (${String(check)}). Keep the server's database as it is and try again.`);
  process.exit(1);
}

let mapNote = "no world map to copy";
if (fs.existsSync(MAP)) {
  fs.copyFileSync(MAP, mapDest, fs.constants.COPYFILE_EXCL);
  mapNote = `world map → ${mapDest}`;
}

console.log(`✅ Backed up the realm in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`   database  → ${dest} (${mb(fs.statSync(dest).size)}, check ok)`);
console.log(`   ${mapNote}`);
console.log(`   ${counts.join(" · ")}`);
console.log("   To restore: stop the server, copy it over server/data/realm.db, delete realm.db-wal and realm.db-shm, start the server.");
