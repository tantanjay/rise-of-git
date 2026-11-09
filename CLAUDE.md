# CLAUDE.md

Rise of Git — a 3D kingdom game generated from Git activity (React Three Fiber client, Express + SQLite server).

## Docs must stay aligned with the code

Two docs describe this project and **must be updated in the same change as the code they describe**:

- [GAME_GUIDE.md](GAME_GUIDE.md) — game rules as players see them: commit matching, XP, building/castle levels, prestige, districts, structure tiers, land features, health/idle, resources & harvest, scarce gems, improvements and costs, civilizations, config defaults, population & war, herald notices, royal decrees, the Scriptorium (project tree, deed reports), the Watchtower (analytics).
- [ARCHITECTURE.md](ARCHITECTURE.md) — code structure: stack, data flow, directory layout, SQLite tables, REST routes, key design decisions.

When you change any of the following, update the matching section before finishing:

| Change in | Update |
|---|---|
| `server/src/scoring.ts` (XP rules) | GAME_GUIDE §3 |
| `server/src/kingdomUtils.ts` (level curve, prestige, castle level, district quotas, civs) | GAME_GUIDE §4–6, §9 |
| `server/src/realmBuilder.ts`, `gitFetch.ts` (what is fetched, commit matching) | GAME_GUIDE §2 |
| `getAllKingdomsFromDB` / `resolveKingdomLayout` in `db.ts` (which repos become buildings, health, idle) | GAME_GUIDE §4–5 |
| `executeResourceAllocation`, `SCARCE_RESOURCES` in `db.ts`, `syncService.ts` | GAME_GUIDE §7 |
| `server/src/upgrades.ts` | GAME_GUIDE §8 |
| `src/components/3d/city/blueprints.ts`, `layout.ts` (tiers, features, prestige FX, plot size) | GAME_GUIDE §5 |
| `src/components/3d/city/TownHall3D.tsx` (castle stages, signatures, prestige FX) | GAME_GUIDE §6 |
| `server/src/env.ts` defaults | GAME_GUIDE §12 |
| `server/src/demographics.ts`, `warConfig.ts`, `combat.ts`, `warEngine.ts`, `diplomacy.ts` (population, marching, battles, buffs/debuffs, Voidrift slots, civ swaps) | GAME_GUIDE §13 (civ change rules also §9) |
| `server/src/titles.ts` (milestone titles, thresholds, buffs, kill attribution) | GAME_GUIDE §13 (Milestone Titles) |
| `server/src/armoryRules.ts`, `armory.ts` (Armory sets, power, forging, upkeep, rust, target shares) | GAME_GUIDE §13 (The Armory; notices §14), the client copy `src/utils/armory.ts` |
| `server/src/broadcasts.ts` (herald notices, who hears what, realm events) | GAME_GUIDE §14 |
| `server/src/decrees.ts`, decree hooks in `db.ts` / `warEngine.ts` (announcements, gifts, shields, punishments) | GAME_GUIDE §15 (notices also §14) |
| `server/src/omens.ts` (feedback, rate limit, heeded notices) | GAME_GUIDE §11 (notice §14) |
| `server/src/watchtower.ts` (analytics: roster, quiet, rollups, before / after) | GAME_GUIDE §18 |
| `server/src/scriptorium.ts`, deed XP in `getAllKingdomsFromDB` (project tree, deed reports, caps, seals) | GAME_GUIDE §17 (XP also §3, notices §14, validations §11) |
| New/removed/renamed files, routes, tables, dependencies | ARCHITECTURE.md |

If the code and a doc disagree, the code is the source of truth — fix the doc, and mention it in your summary.

## The in-game books must stay aligned too

Players read the rules in the game, not in GAME_GUIDE.md. Two in-game books (☰ menu → Royal Codex, one window with top tabs, `CodexModal.tsx`; the Guide Book is its *Game Guide* tab) must be updated in the **same change** as the code and GAME_GUIDE:

- **📖 Guide Book** — the rules in short chapters with 3D models: `src/components/ui/guideContent.ts` (chapters, facts), `src/utils/civLore.ts` (each civ's Unique Trait), shown by `GuideBook.tsx`.
- **📚 Royal Codex** — every model and sound in the realm: NPC entries from `getCodexCatalog()` in `server/src/worldMapGenerator.ts` (`GET /api/codex`), castles, mercenaries, improvements and sounds composed in `CodexModal.tsx`, sound cues in `src/utils/soundCues.ts` with their stages in `SoundStage.tsx`.

**Whenever you edit GAME_GUIDE.md, check whether a Guide Book chapter or Codex entry says the same thing, and update it to match.** Then also:

| Change | Update in the books |
|---|---|
| A rule or number the Guide Book quotes (XP, levels, castle, harvest, improvements, population, marches, battles, walls, scouting, gathering, rallies, bosses, titles) | The matching chapter in `guideContent.ts`. Prefer importing the number from a client mirror (`civDemographics.ts`, `castle.ts`, …) over typing it; add a mirror if the server value is needed and none exists |
| A new game system or a new GAME_GUIDE section players need to know | A new chapter (or section) in `guideContent.ts`, with a fitting model |
| `CIV_MODIFIERS` (a civ buff/debuff added, renamed or removed), civ profiles | `civLore.ts`: the trait story still covers it; add a `notes` line for a modifier that needs its own reason; the civ chapter in `guideContent.ts` |
| A sound cue added, removed or newly played somewhere in `useSound.ts` | `soundCues.ts` (`SOUND_CUES`, `PLAYERS`, `heard`) + a stage in `SoundStage.tsx`, and GAME_GUIDE §13 *Interactive Audio* |
| A soundtrack added, renamed or removed in `civSoundtracks.ts`, or a soundtrack newly played somewhere in the game | The track list in GAME_GUIDE §10 *Soundtracks* (and §13 *Interactive Audio* once the game plays it). The Soundtracks tab reads `SOUNDTRACKS` itself. Follow [docs/SOUNDTRACKS.md](docs/SOUNDTRACKS.md) |
| A new NPC, boss, spawn, resource node, landmark or treasure | Its Codex entry in `getCodexCatalog()` (rarity, where it spawns, chance, yield) |
| A new mercenary, castle stage, improvement or improvement tier | The Codex tab that lists it (`MERCENARY_POOLS`, `castleItems`, `UPGRADES` are read automatically — check the blurbs and facts still read right) |
| A new kind of thing players can see or hear that fits no tab | A new Codex tab (or Guide chapter) for it, and GAME_GUIDE §10 *Guide Book & Royal Codex* |

Open both books in the browser after changing them; a chapter's models must render.

## Conventions

- **Every major change or new game feature ships with an update notice**: add an entry (new stable `id`, the ship date, title, tagline, body, highlights, lucide icon, accent, a `banner` design, Guide Book chapter) at the top of `UPDATE_NOTICES` in `src/components/ui/updateNotices.ts` in the same change, with its numbers imported from the client mirrors, never typed. Its date puts it in that week's version (every Monday starts the next: v1.0 is the week of 12 Oct 2026); give a new week a name in `VERSION_TITLES`, and pick a `banner` its week's other notices don't use (add a new design to `BANNERS` in `WhatsNewModal.tsx` when none fits). Players see it in the What's New window (GAME_GUIDE §10 *What's New*).
- Client code imports across folders through the `@/` alias for `src/` (`@/utils/castle`, never `../../utils/castle`); only same-folder imports stay `./`. `scripts/` uses it too. `server/src` stays relative.
- Game rules are computed on the server; the client only renders the level/state it receives.
- Client types in `src/types/index.ts` mirror `server/src/types.ts` — change both together.
- **No emoji as UI icons.** The UI draws line icons (lucide, as the top bar). Emoji in element text become icons through `src/components/ui/glyphs.tsx` (the JSX runtime in `src/jsx` applies it everywhere): when new text uses an emoji the map lacks, add it there with the closest icon and a colour that says what it is. Use lucide icons directly for new buttons and headers, and the `Combobox` for every picker (never a native `<select>`).
- City visuals must stay deterministic (seeded RNG via `src/utils/random.ts`).
- **Top bar (`TopHUD.tsx`) changes must be checked on mobile.** Whenever a component in the top bar is added, changed or removed (a button, pill, badge, clock, menu item), open the app in the Browser pane at the mobile preset (375×812) as well as desktop, and check the bar still fits without overlapping or pushing things off screen, every button can be tapped, and any panel it opens works as a full-screen sheet. Hide labels behind `sm:` / `md:` breakpoints rather than letting the bar grow; a modal opened from the header goes through a portal (`createPortal` to `document.body`), since the header's `backdrop-blur` traps `fixed` children.
- Run with `npm run dev` (server on :3000 + Vite). After touching 3D models, run `npm run check:models` (z-fighting check).
- The app opens on a login screen. In dev the server runs with `GUEST_BROWSING=true`, so to look at the realm in the Browser pane (checking models, measuring draw calls) click **Look around without signing in** under the Git button. Never try the Git sign-in yourself. Herald notices and battle reports that pop up in dev may be dismissed or read to clear the view (closing one marks it read).
- **In a separate worktree, copy the main checkout's data before starting the server**, so the realm loads at once instead of waiting for a fresh Git sync (and guest browsing works): copy `.env` from the main checkout, then with the API stopped copy `server/data/realm.db` as a consistent SQLite backup (`node -e "const D=require('better-sqlite3');new D('<main>/server/data/realm.db',{readonly:true}).backup('server/data/realm.db')"`, not a bare file copy while the WAL is live) and `server/data/world_map.json`. Both are gitignored; never commit them.
- Planning docs (`PLAN*.md`) are working notes only: never reference them or their phases in code, comments, GAME_GUIDE.md, ARCHITECTURE.md or other repo files (no "see PLAN.md", "from Phase B", "comes in Phase C"). Describe the game as it is; for unbuilt parts say they are not in the game yet. Commit messages and branch names may mention the plan.
- Examples in docs, comments and log samples use dummy names (e.g. "Jane Doe", "Ser Aldric"), never real developers' names or Git usernames.

## Guides: read the one that covers your work first

The detailed rules live in `docs/`, one guide per topic, so this file stays short. **Before you start work of a kind below, read its guide in full**; when you learn a new rule, trick or trap, add it to the guide it belongs to (not here).

| Before you… | Read |
|---|---|
| add or change any 3D code: models, effects, shaders, views, the simulation | [docs/RENDERING.md](docs/RENDERING.md): the draw-call budget, draw calls, animation, bloom and reflections, shader math (no NaN) and cost, scattered props, shadows, rotated parts, z-fighting, labels, heavy setup work, measuring |
| add or change any model, tier or effect (Normal or HD) | [docs/MODEL_STYLE.md](docs/MODEL_STYLE.md): the visual rarity ladder and living models (idles, walkers, the motion kit, seeded motion) |
| do any HD work, on any tier | [docs/HD_MODELS.md](docs/HD_MODELS.md) (the HD model kit and every HD pipeline, the hand-built heroes, bosses and creatures) **and** [docs/HD_WORKFLOW.md](docs/HD_WORKFLOW.md) (the quality bar, checking a model, measuring, gotchas) |
| add or change a soundtrack or the soundtrack engine | [docs/SOUNDTRACKS.md](docs/SOUNDTRACKS.md) |
| run a bug and edge-case audit, fix a finding from one, or add a new source file | [docs/AUDIT.md](docs/AUDIT.md): the audit phases, how to run one, and each phase's findings and history (a fix records its commit on the finding; a new file joins a phase's Scope) |

## 3D rules that apply to every change

The short list; the reasons and details are in the guides above.

- **Normal never changes** when you work on HD: HD-only parts and paths are gated on HD, and you compare Normal against HEAD.
- **Draw calls grow with kinds of things, never with their number**: anything that repeats is emitted as data and drawn instanced; stay inside the budget table in RENDERING.md.
- **Animate in `useFrame`** through refs and instance matrices, never through React state; moving things cast no shadows.
- **No NaN in shaders**: clamp every `pow` base, `sqrt`, `log`, `normalize` and division (one NaN pixel is a black frame in HD).
- **Every model is styled on the rarity ladder** and is alive (seeded motion, no two copies alike); no ground discs, rune rings or pillars of light over plots.
- **Heavy setup runs behind the loader.**
- **Run `npm run check:models`** after touching any model, and look at it in the Royal Codex.
