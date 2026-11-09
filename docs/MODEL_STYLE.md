# Model style: the rarity ladder and living models

How special every model looks (the ladder) and how it moves (living models). Read before adding or changing any model, tier or effect, in Normal or HD.

## Visual rarity ladder

Every model and effect in the game (NPCs, spawns, resource nodes, landmarks, mercenaries, buildings, castles, bosses) is styled on one shared ladder, so "how special is this?" reads the same everywhere. Use it when adding or polishing any model or tier.

| Tier | Feel | Look |
|---|---|---|
| Common | *mmmm* — plain | matte, small, no accent |
| Uncommon | *ok* | one accent colour, a small prop (banner, lantern) |
| Rare | *good* | metal or glow accents, one small looping effect |
| Epic | *better* | bigger silhouette, emissive details, an aura or orbiting bits |
| — gap — | | legendary is **two steps above epic**, not one: the jump must be obvious at map distance |
| Legendary | *grand* | the top class: a beam of light, particles, layered animation, a curtain of light round it, a much bigger and richer silhouette |
| Mythic | *grandier* | beyond legendary (black-crimson with a prismatic edge); reserved for the very top (Xal'Vorath, the Archon) |

- Progression levels map onto the same ladder: **castle Lv21–25 (Wonder) is legendary-class** and must look as grand as legendary NPCs and landmarks in both the world and city views; the Archon's Lv26–30 (Empyrean, Celestial structures) is mythic-class.
- Buildings keep their own district designs, and their structure tiers sit on the ladder: tier 0 common, 1 uncommon, 2 rare, 3 epic (each civilization's in `city/<civ>Structures.ts`, built from `city/structureKit.ts`; a new structure follows the same tier rules). **Lv25 is the grand structure**; past it the plot climbs through prestige effects: ★1–★3 add effects step by step, ★★★★ is the epic aura, and **red ★ (5th star and up) gets the grand, legendary-class effects** — the top class for a repo.
- **No pillars of light over building plots.** A plot's curtain stands round its edge (`PLOT_AURA`) and plot items pass `beam: 0`; only the town hall (and map NPCs/landmarks) keep a beam. A maxed city must read as glowing plots, not a forest of pillars.
- Castle stages: Keep common, Castle uncommon, Citadel rare, Palace epic, Wonder legendary, Empyrean mythic, in both views (`hallFxItem`, the world map's castle tier items, the Codex preview).
- Improvements climb the same ladder by tier: 1 common (nothing lit), 2 uncommon, 3 rare (one looping effect), 4 epic (something circling), 5 legendary.
- No ground discs or rotating rune rings at an object's feet (they read as clutter, and a ground ring marks your own kingdom). Glow stands *round* a structure (a curtain of light, like the column over a reviving boss), and only where it makes sense: creatures get sparkles, not a curtain.
- Roving monsters and bandits live in `world/spawnModels.ts`: build new ones with its `figure` / `beast` kits (walkers, a bigger leader per band) and style them on the ladder by their spawn rarity (common matte with no glow, uncommon one accent + prop, rare trim + one looping effect, epic bigger + emissive + `orbit`).
- Legendary and mythic must stay rare on screen to stay special — don't hand their effects to lower tiers to make those look better; polish within the tier instead.
- Tier effects come from the shared kit `TierFx` (`src/components/3d/TierFx.tsx`: ≤3 instanced draw calls for any number of items), never per-object meshes. Put new things on the ladder by giving them a `TierFxItem` (`fxTierOf(rarity)` for NPCs), not by adding new glow meshes. Particles shrink with distance, so far away only the aura and beam read.

## Living models

Every model in the realm is alive — nothing stands frozen, on the world map or in its Royal Codex preview.

- Everything gets an idle: birds and bats fly around their roost or node, resource nodes work (wheels turn, smoke rises, crops sway), mobs breathe, shift and look around, treasure glints, landmarks pulse and shed motes.
- **Structures don't breathe.** Only living things breathe or move as a whole. A building, cave, tent, fence, tower or stone circle stands still and lives through its parts (smoke, flags, glowing parts that pulse, orbiting motes). A creature standing in a site breathes on its own: build it on `b.child(…).alive()` (`quadruped` does it for itself), and only its parts breathe, about its own feet (`wholeModelIdles`).
- **The main figure moves too.** A group's centre model (a mob leader, a pack's alpha) must be as alive as the companions around it. Keep the companions; don't leave the centre still while only they move.
- **No two copies move the same.** Seed each instance's animation (phase, speed, amplitude, path, pauses) from its id with `src/utils/random.ts`, so two nodes of the same type never move in lockstep. Same seed → same motion every load (deterministic).
- **Creatures walk, not sway.** Each creature in a model is built with `b.walker(x, z, rot, gait, radius, { y, pace, biped })` (gait `walk` / `hop` / `slither` / `fly` / `hover`; `biped` for anything on two legs, so it carries itself upright and its pauses play a person's events (looks down, stretches, shifts its weight) instead of a beast's (sniffs, shakes itself like a dog); `humanoid` / `quadruped` take a `walk` option); its legs get `{ leg: 1 | -1 }` (same sign steps together) and its wings `{ flap: rate }` (laid level from the shoulder, beating about it). Flyers need wings that beat and a path that is no perfect circle; actor birds (`crow`) flap through the `flap` sub-parts in `actorTemplates.ts`. It wanders a small loop on the GPU, pausing 3–5 s (seeded) to look round; props of the camp stay still, and the whole-model idle is skipped for a model with walkers (`hasWalkers`).
- **Walk with weight (the motion kit).** A walker's body dips on each footfall, sways over the supporting leg, leans into the walk and rocks back as it brakes, then settles; in its pauses it breathes, shifts its weight, glances round in snaps and plays one seeded event (look round, sniff, shake, scratch). A flyer heaves on each power stroke, glides and banks. Give each part of a creature its role so it rides that motion instead of standing stiff on the body:
  - `{ arm: -1 | 1 }` arms (and with `pivot` on the arm, what the hand holds): swing against the leg on their side, close to the body and a beat behind;
  - `{ head: { y, z } }` everything on the head (eyes, ears, hats, snout, a glowing crown): it turns about the neck at local (0, y, z), held steady while the body bobs and twists, and does the glancing and sniffing;
  - `{ torso: true }` the upper body, turning against the hips;
  - `{ trail: { lag, damp, root } }` tails, ears, manes, cloaks: they trail the body's turns and sways from `root`, `lag` seconds behind (give each segment of a chain a longer lag so it whips); off a walker they sway.
  A part takes one motion: a part on the head with its own `idle` (a pulsing eye) stays behind when the head turns, so put it on the head instead. The `figure` and `beast` kits in `spawnModels.ts` set the roles themselves, and give what a caller adds a role by where it sits (`auto`): on a figure a part from 0.95 up rides the head, 0.7–0.95 the chest.
- **General idles are shared; unique models are hand-tuned.** Creatures that idle as a whole (mobs prowl, flyers float, bandits and the living things of a site breathe, treasure bobs, all with seeded events) use one GPU cycle, `wholeModelIdles` in `npcs.ts`, the same in the map's batch and in `NPCModel` (the Codex): new humanoids, beasts and flyers reuse it, never a copy. Models unlike any other (the kraken, the sandworm, nests, portals) keep a hand-tuned idle in `NPCModel` (`HAND_TUNED`).
- Builder models move their parts with `{ idle: IDLE_KIND.sway | spin | pulse | smoke | flutter }` (`pivot` makes a spin orbit, `phase` staggers puffs or spreads motes); `buildNPCModel` re-seeds them per NPC and pulses glowing parts of structures on its own.
- Movement follows the rendering rules ([RENDERING.md](RENDERING.md)): animate in `useFrame` through refs / instance matrices, mark moving parts `DYNAMIC`, no shadows from moving things.

