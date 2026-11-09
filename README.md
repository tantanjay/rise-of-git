# 🌍 Rise of Git — 3D Planetary World & 5 Civilizations

An ambient, zero-maintenance **3D Planet & Kingdom Realm** connected directly to **Git** with persistent **SQLite storage**, **15-minute background processing**, **weighted round-robin resource allocation**, and **functional district building scaling**.

---

## 🌟 Key Features

### 1. 🗄️ SQLite Persistence & Background Processing
* **Embedded SQLite Database (`server/data/realm.db`)**: WAL mode, storing users and emails, repositories, commits, pull requests and reviews, treasuries and ledgers, populations and census, Voidrift slots, marches, battle reports and civ-swap proposals.
* **Zero UI Credentials**: the server reads credentials from `.env` (`GIT_URL` and `GIT_TOKEN`).
* **Two independent clocks**:
  1. **Git refresh** every `GIT_SYNC_INTERVAL_HOURS` (default 1 h) and on start: developers, repositories, commits, PRs and reviews are re-read and upserted into SQLite. It never pays resources.
  2. **Harvest** every `SYNC_INTERVAL_MINUTES` (default 15 min): the resource pool, building yields, population growth and garrison upkeep, written to the ledger.
* **Commit attribution**: commits are matched by Git account, then any known email, then name (in either "First Last" / "Last, First" order); unmatched commits stay unassigned. Admins can **🔄 Re-check Commits & Repos** from a developer's profile after the developer adds a missing email in Git.

### 2. ⚖️ Weighted Round-Robin Harvest
* Every harvest shares a fixed pool — 🪙 Gold 1,000 · ⚙️ Iron 25,000 · 🪨 Stone 50,000 · 🪵 Lumber 100,000 · 🌾 Food 250,000 — plus one random scarce gem drop.
* Each kingdom gets a guaranteed minimum; the rest is split by **weight = 2 × past-week contribution XP + 1**; rounding leftovers go round-robin so 100% of the pool is paid out.
* On top: every building yields by its level, **🔥 Active Surge** repos (commit or merged PR in the last 48 h) yield double and double the kingdom's gem chance, and civilians add their civilization's yield. Details in [GAME_GUIDE.md §7](GAME_GUIDE.md).

### 3. 🏛️ 4 Functional District Types (35% / 25% / 25% / 15%)
Repositories are no longer tied to a resource. Instead, they occupy the city courtyard across 4 functional medieval districts:
* 🏡 **Houses for People (Residential & Commercial)** — **35% Occupancy**: Townhouses, guildhalls, merchant stalls, artisan shops.
* 🐑 **Animal Field** — **25% Occupancy**: Fenced pastures, timber barns, haystacks, and grazing sheep/cattle.
* 🌾 **Food & Grain Field** — **25% Occupancy**: Golden wheat rows, terraced rice paddies, granaries, and spinning windmills.
* 🛡️ **Soldier Buildings** — **15% Occupancy**: Stone barracks, watchtowers, archery target ranges, and training dummies.

### 4. 📈 Building Levels (1 – 25) Grow Structure by Structure
* **Level comes from contribution XP** (commits with diminishing returns, merged PRs, reviews): Lv2 = 6 XP, Lv5 = 18, Lv10 = 70, Lv15 = 162, Lv20 = 294, Lv25 = 466.
* **Buildings never just get bigger — the plot fills up**: Lv1–3 = 1–3 huts, Lv4 = a house, Lv5 = house + hut … Lv12 = a manor, Lv20 = a great hall (keep / windmill / ranch per district). The land itself expands with level and unlocks fences (Lv8), paths (Lv9), a well (Lv11), gardens (Lv13), lamps (Lv16), a statue (Lv19), stone walls (Lv20) and corner towers (Lv22/24).
* **Beyond Lv25 → prestige effects**: every 200 extra XP adds banners, a golden plot glow, sparkles, and finally a light beam (max 4 tiers).
* **Activity drives life, fixed per repo**: people = commits this week, animals = level, flowers vs. weeds = how recently you committed, props (crates, carts, barrels) = lines of code. Positions are seeded from the repo id, so a town looks identical every render.
* **Districts cluster**: houses front-left, barracks by the gate, farms back-right, pastures back-left. The city plan is saved; new repos join the district furthest below quota. Use **Rebuild kingdom** in the City Directory to re-rank everything (biggest repos become houses again).
* **Big kingdoms (70+ repos)**: idle repos (90+ days) become a weathered Old Quarter, subscribed repos you never committed to are listed but not built, everything is GPU-instanced and labels show on hover.

### 5. 🗺️ One Continuous Continent
* **Connected land**: the 5 provinces blend into each other through the buffer biomes (Whispering Deepwood, Dragonspine Peaks, Scorchwind Expanse) on a single heightmapped continent with an irregular coastline.
* **Real water**: the Sunken Fjord is an inlet open to the northern ocean, a river runs through the Valorian Heartlands, and the elven glades are islets in shallow lagoons — all with beaches where land meets sea.

### 6. ⚔️ 5 Distinct 3D Civilizations (Sword & Magic)
* **👑 Human (Valoria)**: Classic medieval dressed-stone masonry, twin royal watchtowers, high bell keeps, and timber windmills.
* **🌸 Elf (Sylvandale)**: Ancient silverwood tree citadels, glowing bioluminescent canopies, and floating lotus crystals.
* **⚒️ Dwarf (Ironforge)**: Heavy volcanic basalt bastions, giant warhammers, molten fire vents, and forge chimneys.
* **⚔️ Orc (Drak'mar)**: Spiked war palisades, massive curved mammoth tusks, blood banners, and roaring signal braziers.
* **🔮 Arcane (Nethergarde)**: Ethereal upper spires floating in mid-air over glowing teleportation rings, levitating obsidian monoliths, and orbiting mana shards.

### 7. 👥 Population, Armies & War
* **Living population**: every kingdom grows on an S-curve each harvest — births slow as it fills up, deaths rise with crowding. Orcs rebuild fastest after a war, elves barely move, Nethergarde never breeds but **summons** constructs with resources and gets its fallen back through the **Void Well**.
* **Workforce vs army**: civilians work (each civ has its own yield — humans farm, dwarves quarry, elves gather mana and gems); soldiers cost iron and food to arm and eat every harvest, and a famine makes them desert.
* **War on the Voidrift**: mortal kingdoms march armies across the world map on Nethergarde. Open Voidrift slots are held by **NPC void kingdoms** whose garrison takes a mid-level developer ~10–20 assaults to break; whoever breaks it ascends to Nethergarde. Usurping a Nethergarde developer swaps your civilizations.
* **Live battles**: armies walk the map in real time, clash, then cheer or fall back before the battle report opens; the **⚔️ War Room** lists every march and battle.
* **Buffs & debuffs** per civilization (and per matchup), and a **peaceful civ swap** between mortal rulers who agree to it.
* Rules: [GAME_GUIDE.md §13](GAME_GUIDE.md). Balance: `npm run sim:balance` (below).

### 8. 🧭 Panels at a Glance
* **👤 Developer profile** — Git only: repositories, commits, PRs, code volume, activity score and a contribution calendar.
* **👥 Kingdom** — game info: treasury & gems, civilization doctrine and soldier stats with buffs/debuffs, population & garrison, summoning (Nethergarde), census ledger.
* **Castle panel** (click a castle on the map) — enter the city, siege a Voidrift citadel, send a resource caravan, propose a civilization swap.
* **⚔️ War Room** — armies on the march, battle chronicle (yours / whole realm), diplomacy (swap offers).

---

## 🛠️ Tech Stack & Architecture

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons
* **3D Graphics Engine**: Three.js, React Three Fiber (`@react-three/fiber`), Drei (`@react-three/drei`)
* **Backend**: Node.js, Express, TSX, SQLite (`better-sqlite3` with WAL mode)
* **Directory Structure** (full layout, tables and routes in [ARCHITECTURE.md](ARCHITECTURE.md)):
  ```text
  git-castle/
  ├── server/src/        # Express API, Git sync, SQLite, harvest, demographics, war engine, diplomacy
  ├── src/
  │   ├── components/3d/ # World map (castles, NPCs, armies) and city view (districts, blueprints, actors)
  │   ├── components/ui/ # HUD, panels and modals (War Room, Kingdom, Developer profile, …)
  │   ├── hooks/         # useGameState (API + polling), useSound
  │   └── utils/         # Shared client helpers (civ profiles, war timings, castle stages, seeded RNG)
  ├── scripts/           # check:models, sim:balance, sim:population, sim:war
  ├── GAME_GUIDE.md      # Game rules
  └── ARCHITECTURE.md    # Code structure
  ```

---

## 🚀 How to Run

1. Create your `.env` from the template and fill in at least `GIT_URL` and `GIT_TOKEN` (every variable is explained in [`.env.example`](.env.example); game settings are also in GAME_GUIDE §12). Never commit `.env` — it is git-ignored.
   ```bash
   cp .env.example .env
   ```

2. Install dependencies and start the server:
   ```bash
   npm install
   npm start          # production: API + built client (run `npm run build` first)
   npm run dev        # development: API in watch mode + Vite on http://localhost:5173
   ```

3. Open your browser:
   👉 **`http://localhost:3000`** with `npm start`, or **`http://localhost:5173`** with `npm run dev`

> [!WARNING]
> **HTTPS certificate checks are off by default.** The game was built against a Git server whose certificate chain Node can't verify, so unless `NODE_TLS_REJECT_UNAUTHORIZED` is already set, the server sets it to `0`. That turns off certificate verification for all of the server's outgoing HTTPS requests, which include your `GIT_TOKEN` and sign-in traffic. If your Git server has a valid certificate, add `NODE_TLS_REJECT_UNAUTHORIZED=1` to your `.env`.

## 🧮 Balance Simulations

Three scripts print balance tables straight from the server's game rules (no server, Git or database needed — run them after `npm install`):

```bash
npm run sim:balance      # full stat sheet + fair battles → ⚖️ BALANCED / ⚠️ UNBALANCED
npm run sim:population   # population growth per civilization
npm run sim:war          # assaults needed to break an NPC void kingdom
```

**`npm run sim:balance`** (`scripts/sim-balance.ts`) is the one to use when tweaking combat. It prints:

1. **Base stats** of every civilization (population multiplier, HP / ATK / DEF, march speed, trait), their **traits**, every **buff & debuff** (with its `vs` civs and `when` attacking/defending) and the **effective stats in each matchup**.
2. **Voidrift** table — assaults needed to break an NPC void kingdom per civ and City Hall level.
3. **Duels** — 100 vs 100 soldiers in the open (raw per-soldier strength, info only).
4. **PvP** — every mortal-vs-mortal matchup at equal City Hall, compared with the design matchup chart (GAME_GUIDE §13).
5. **Checks** and a verdict: **⚖️ BALANCED** or **⚠️ UNBALANCED** (exit code 1, so it can run in CI). It's balanced when every mortal civ needs 10–20 assaults at City Hall 10, elves are the fastest Voidrift attackers, every PvP matchup is a win / even / loss as the chart says, and the client's copy of the buff list matches the server's.

To experiment, fill in the `TWEAKS` block at the top of `scripts/sim-balance.ts` (unit stats, population multipliers, buffs/debuffs, NPC level) and run it again — the game itself doesn't change. When it says BALANCED, copy the values into the files named in the `TWEAKS` comments (`server/src/demographics.ts`, `server/src/warConfig.ts`, and the client mirror `src/utils/civDemographics.ts` for buffs/debuffs). The targets (mid level, assault band, PvP fairness band) are constants just below `TWEAKS`.

**`npm run sim:population`** (`scripts/sim-population.ts`) runs the 15-minute harvest demographics (births, deaths, Void Well) for every civilization at City Hall 10, with no soldiers and plenty of food, and shows the population after 1 h, 2 h, 4 h, 6 h, 1 day, 3 days and 7 days:

* **From genesis** — a new kingdom starting at 10% of capacity.
* **After a war** — only 50 survivors left. Orcs should bounce back fastest, elves barely move, and Nethergarde doesn't breed at all (it summons and uses the Void Well).

To try other numbers, edit `LEVEL` / `SURVIVORS` at the top of the script, or the civ profiles in `server/src/demographics.ts` (birth factor, lifespan factor) and run it again. `BASE_LIFESPAN_HOURS` and `SYNC_INTERVAL_MINUTES` from `.env` are respected.

**`npm run sim:war`** (`scripts/sim-war.ts`) answers "how many assaults does a developer need to take an open Voidrift slot?" for each civilization and City Hall level, using the real combat simulation and the NPC settings in `server/src/warConfig.ts` (`VOID_NPC`). Each assault sends 50% of a full population; the target for a mid-level developer is about 10–20 assaults.

The full rules behind both tables are in [GAME_GUIDE.md §13](GAME_GUIDE.md).

---

## 📝 Private Working Notes

[CLAUDE.md](CLAUDE.md) mentions an audit log (`docs/AUDIT.md`) and planning docs (`PLAN*.md`). Those are the maintainer's working notes and aren't in the public repository, so those references have no file behind them.

## 📄 License

Rise of Git is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). You can use, change and host it. If you distribute a modified version, or let people use one over a network, you must offer them its source code under the same license.
