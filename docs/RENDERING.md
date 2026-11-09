# 3D rendering, animation and simulation

The draw budget and the rules that keep the map and the city fast and correct. Read before any change to 3D code: models, effects, shaders, views or the simulation.

Draw-call budgets per frame (measured with bloom's passes in HD, at the default view):

| View | Measured today | Budget (allowance) | Ceiling (ask first) |
|---|---|---|---|
| World map, Normal | ~240 | 240–265 | 265 |
| World map, HD | ~240–275 (by what roves) | 300–320 | 335 |
| City, Normal | ~35 | 100–115 | 115 |
| City, HD | ~60–110 (a guest city ~60, the Archon's 50 Celestial plots ~110) | 125–140 | 155 |
| Login flyover, HD | ~225–240 (the map without labels or roving bands, Xal'Vorath) | the world map HD row's | 335 |

A change may use the allowance (the gap up to the top of the range) when it adds a new *kind* of thing; past the top, it must win the draws back elsewhere first. Keep new visuals and the coming kingdom simulation inside that budget by following these rules.

**HD work is the exception:** don't cut an HD version's look (its shapes, materials, detail) just to stay under the top of the HD rows. But a raise is the last step, not the first, and it never stacks without limit:
1. **Win back the draws nobody can see first.** Before raising, look for draws that change nothing on screen and remove them: batches split only by bookkeeping that could share one (a separate list, component or per-kind set drawing a shape kind another batch already draws), meshes with zero instances or off screen still drawn, a glow bucket that could reuse an emissive already there, an HD-only shape kind used by a handful of parts where a kind already in the batch reads the same at the closest zoom. The look stays; only the bookkeeping changes.
2. **Then raise, modestly.** If HD still goes past the top, raise that HD row's budget in the same change by a handful to ~15 draws, and say in the summary what the new draws buy and what was won back first.
3. **Never past the ceiling.** A change that would take an HD row past its ceiling, or raise a ceiling, needs the user's go-ahead first. Normal rows never move this way.

## Draw calls
- Never add one `<mesh>` per object for anything that repeats or scales with data (buildings, agents, props, castles). Emit parts as data and draw them instanced:
  - static city geometry → `Builder` in `city/parts.ts` → `InstancedParts` (one InstancedMesh per shape);
  - world-map castles → part lists in `world/castleParts.ts` → `WorldCastles` (parts merged per civ into one InstancedMesh per opacity/sidedness/shadow/animation, material values and stage range per vertex, shared by every castle of a civ; in HD one per stage in use, holding only that stage's parts);
  - one-off composite models made of many static JSX meshes (e.g. `TownHall3D`) → wrap in `<MergeStatic deps={[…]}>`, which merges static opaque parts into one indexed mesh per material type.
- Draw-call count must not grow with the number of agents or buildings — only with the number of distinct shapes/kinds.
- **Battle Arts effects go through the spell-effects kit** (`SpellFx.tsx`), never a mesh per cast: a new Art's or status's look is a new entry in `utils/spellFx.ts` built from the stage options, and a new kind of stage is a new branch in `SpellFxStore` writing particles. Every cast and status on screen is one `Points` draw (none when nothing is up; measured +1 with all 19 looks and 9 statuses up at once, Normal and HD). Its particles are written once into a ring and moved by the shader from one clock; per frame the CPU only advances a uniform (and uploads the range written since). The world map draws it `calm` (`CALM_TONE`: fewer, smaller, fainter particles, no white-hot core), because there the models must stay readable through a cast; the Sparring Grounds and sound stages, where the spell is the subject, keep `FULL_TONE`.
- Hover/click targets use `<meshBasicMaterial visible={false} />` (raycast still works, never drawn). Do not use `colorWrite={false}` — it still costs a draw call.

## Animation
- Never animate through React state. Animate in `useFrame` by writing to refs / instance matrices; React re-renders only for structural changes.
- **A batch's parts react to the game through a small uniform list, never a mesh or a re-upload.** A mob or bandit pack strikes and casts in its battles (`world/npcStrikes.ts`): `WarParties` writes the round's moment by NPC id, one `uFight` list of at most 8 battles goes to the NPC batch each frame, and the vertex shader moves the parts whose `aFight` key matches (a shear about the creature's feet, so it never pivots about a place it has walked from). Fill the slots from the first and stop the loop at the first empty one, so with no battle a vertex pays one read. Only walking parts take a key (they are already shadowless).
- Anything that moves must be marked so it stays out of static optimisations: inside `MergeStatic`, put `userData={DYNAMIC}` on the animated group/mesh.
- Repeated moving things (people, animals, mechanisms) go through `Actors` (`city/Actors.tsx`): instance buffers have power-of-two capacity and use `mesh.count`, so agents appearing/disappearing never remounts meshes; off-screen agents are skipped each frame (frustum test, and an agent whose whole path is out of view isn't even posed); the whole set hides beyond the LOD distance.
- **A slot nobody has posed must draw nothing.** An `InstancedMesh` starts with identity matrices: every unposed instance is a unit shape at the origin, and thousands of them stacked there all pass the depth test at the same depth. Normal `Actors` once drew ~5,800 never-seen agents that way, hidden inside the Archon's plaza at ~4 ms a frame (and in sight as a dark box before a dwarf hall's gate). Write a zero matrix into every slot at first, and again when its agent leaves the screen.
- Per-frame cost must scale with what is **on screen**, not with the total number of agents.

## Vertices and what is off screen
The map is bound by vertices on integrated GPUs, and an instanced or merged batch is drawn whole whenever any of it is in view.
- **Index merged geometry.** A shape or merged batch drawn unindexed runs the vertex shader once per triangle corner. `indexExact` (`city/parts.ts`) shares vertices that are equal in every attribute, bit for bit, so the triangles and pixels stay exactly as they were: the kit's shapes and the castle batches go through it (an HD castle batch is about a quarter of its unindexed vertices; the HD castles went from 5.4 to ~2 ms). Never merge with a tolerance (`mergeVertices`): two vertices a hair apart become one and pixels change.
- **Batches spread over the map cull by cells.** `InstancedParts cull` (the map's NPC batch and the scatter) puts each part in a cell of one shared 16-unit grid whose boxes hold all the parts there can reach (size, a walker's loop, smoke rising); when the cells in view change, a batch moves the instances in them to the front in their own order and draws only those. The rest stay behind them for the shadow map, which is drawn once and must keep every part. Draws don't grow: a batch with nothing in view draws no instances.
- **A merged mesh with nothing in view draws nothing.** `HeroBatch` gives its meshes an empty draw range when no hero's sphere is in view, and back the full range for the shadow pass (`onBeforeShadow` / `onAfterShadow`); `BossBatch` hides its bodies (they cast no shadows).
- **Skip per-frame CPU work off screen.** Work that is a function of the clock alone (the Empyrean's chains) waits until it is in view again. Work that carries state (a boss's springs and blends) pauses, and on coming back plays its last moments first (`BossBatch`: 8 steps of 0.05 s), so nothing jumps in view.
- **Don't re-upload instance data as the camera moves.** On an integrated GPU a buffer still in use stalls the upload: re-sending 3 MB of a city's instances took ~45 ms. Reordering instances (the map's `cull`) suits small batches; a city's heavy HD batches are split instead (`InstancedParts chunk`): each also exists as chunks of the ground, plain meshes made once, and while only a few chunks are in view those draw instead of the whole batch (so draws stay bounded). Chunks share the batch's material and its bounding sphere: three sorts meshes of one material by their bounds' centre, so the chunks always draw in the same order (the whole batch keeps its parts' order; zoomed in, a few pixels where two faces meet exactly may settle the other way, which no zoom shows). Collapsing culled instances in the vertex shader saves nothing: the cost is fetching the vertices, not shading them.
- **A shadow redraw must see every part.** Whatever hides meshes by view shows them all again on a frame that redraws the static shadow map (`InstancedParts` watches `gl.shadowMap.needsUpdate` for this).
- Test the view in `useFrame` from the camera's own matrices (`updateMatrixWorld()`, then the frustum), not `matrixWorldInverse`, which the renderer only updates when it draws.

## HD reflections and bloom stay subtle
Players look at the map for long stretches, and glare tires the eyes. In the world and city views, reflections (`HdPost.tsx`) touch only truly polished parts, softly, and bloom catches only real glows (threshold above sunlit white stone, low strength, tight radius), never hazing a whole model over.
- Keep the intensity low and the "glazed" mask narrow (only very smooth surfaces, at half strength); metal reflects by its metalness. Matte ground, stone, wood and grass get no environment light at all, so they look exactly as in Normal.
- Don't raise the reflection intensity or widen the mask to make something "pop": give that part more metalness or a lower roughness instead, and check the overview and closest zoom in the Browser pane for glare.
- **Post costs bandwidth, not shading.** On the dev laptop each full-resolution read or write of the half-float scene buffer is ~0.5 ms. `HdPost` therefore adds the bloom inside the output pass (no full-screen blend of its own) and skips clears before draws that overwrite every pixel. A new effect joins an existing full-screen pass instead of adding one; measure each pass with timer queries round `pass.render`.
- **HD antialiasing is a player setting** (Game Settings → *Antialiasing*, off at first): 2× MSAA on the composer's buffers, which the canvas's own MSAA doesn't reach. It is the dearest part of post, ~5.6 ms at 1400×1050 on the dev laptop (4× was +9.3 ms): keep it optional and at 2×.

## Shader math: no NaN (black frames)
One NaN or Inf pixel from any shader becomes a **fully black frame** in HD: bloom blurs it across the whole screen. It shows as quick black blinks at certain camera angles, and the plain render looks fine. On D3D through ANGLE (Chrome and Edge on Windows), `pow(x, y)` with `x < 0` is NaN **even for `y = 2.0`**. A `uv` sampled a hair past 0 or 1 at a mesh edge, or a `dot` of normalized vectors a hair above 1, is enough to hit it.
- Clamp every `pow` base that can go negative: `pow(max(1.0 - y, 0.0), k)`, never `pow(1.0 - y, k)`. For a square use `x * x` or `pow(abs(x), 2.0)` (e.g. `exp(-pow(abs(d), 2.0))`).
- The same goes for `sqrt` / `log` of something that can dip below 0, `normalize` of a vector that can be zero, and division by something that can reach 0.
- **MSAA runs shaders a hair outside the triangle** at its edges, so varyings go past their range there (a `vFacing` of `abs(dot(…))` dips below 0, a `uv` past 0 or 1). Guard every `pow` on a varying even when the vertex shader keeps it positive (`pow(max(vFacing, 0.0), k)`), and clamp a `uv` that feeds an `exp(-y * k)` rim (`clamp(vUv.y, 0.0, 1.0)`): just below the edge it grows a hundredfold and bloom turns it into flashes while the camera moves. The aura beams once blacked out the whole HD map this way the moment antialiasing was on. `HdPost` also drops NaN as it reads the scene (min / max, which return the other operand for NaN on D3D), as a backstop.
- Don't rely on `isnan` to find or guard it: ANGLE can compile it away. To find the culprit, render the black camera spot through the composer, then hide objects by group (`visible = false`) until the frame comes back.

## Shader cost: run a layer only where it shows
A fragment shader runs for every pixel of what it covers, and big surfaces (water, terrain) cover most of the screen. The HD water once cost +0.9 ms close up because it computed its foam lace (a 3×3 Voronoi loop) on every water pixel, foam or not.
- Gate every costly layer (Voronoi / cell loops, several octaves of noise, extra texture reads) behind the mask that uses it: `if (foam > 0.01) { … }`, `if (river > 0.0) { … }`, `if (mid > 0.0) { … }` (detail faded out by `fwidth`). Multiplying by a mask that is 0 still pays for the work.
- Measure a new HD layer on its own with the GPU bench in [HD_WORKFLOW.md](HD_WORKFLOW.md) §3: toggle the feature, never compare across a Normal → HD switch (the first seconds after it read 2–3× slow).

## Small scattered things know where they stand
Grass, flowers, reeds, trees, rocks, bushes and any other scattered prop must stay out of every place they don't belong: the sea and the river (including the shallow edge, and tufts interpolated between a shore vertex and a wet one), lava fissures and forge vents, castle and landmark build pads, walls, bridges and roads.
- Take the zones from one shared source (`SEA_LEVEL`, `riverX`, `LAVA_FISSURES` / `FORGE_VENTS` in `world/terrain.ts`, the pads, `gateWallPoints`), never a private copy of coordinates. A new hazard or structure on the map gets its zone added there, and both the grass mask (`flora` in `terrain.ts`, the height test in `Grass.tsx`) and the scatter (`scatter.ts` avoid lists) respect it.
- After adding a prop kind or a zone, look at its edges up close in the Browser pane (shore, river mouth, lava, pads): nothing may stand in water or fire.

## Shadows
- Both views use `useStaticShadows(deps)`: the shadow map is drawn once when the scene changes, not every frame. Therefore **moving objects must not cast shadows** (their shadow would freeze). Agents get the shared blob shadow in `Actors` instead.
- When adding static geometry that changes with data, include that data in the `useStaticShadows` deps so shadows redraw.

## Rotated parts float (Builder `y0`)
`Builder.add(shape, x, y0, z, w, h, d, …)` puts the centre at `y0 + h/2` using the **unrotated** height, then applies `rx`/`rz`. A cylinder or cone laid on its side (`rx`/`rz` ≈ ±π/2) therefore floats by about `h/2` above where it was meant to sit (logs, wheels, barrels, spines, tails, raft decks have all done this).
- For any part rotated away from upright, work out where its **centre** should be and write `y0` as `centre - h/2` (e.g. a 0.26-thick log 2.2 long on the ground: `0.13 - 1.1`). Lying flat, its vertical size is `w` (for `rz`) or `d` (for `rx`), not `h`.
- Tilted tails, horns and clubs: check where the base ends up (`centre ∓ h/2` along the rotated axis), not just the centre. A tail should come out of the body, not off the top of it.
- `check:models` does not catch this. Look at the model in the Royal Codex after adding or moving a rotated part.

## Z-fighting (flickering faces)
Models are stacks of overlapping primitives. When two parts of **different colours** have a face pointing the **same way** at (almost) the same place, the depth buffer can't pick one and the face shimmers, worst at map distance. This happened on the wolf pack's back, the Sphinx head, the Stonehenge leyline disc and the gate lintel.
- Faces that point the same way and are closer than **0.025** count as coplanar. Keep at least **0.05** between them: a detail on a surface (stripe, rune, eye, moss, disc on a base, trim band) must stick out ≥0.05 past the face it sits on, and a part resting inside another must end ≥0.05 short of the outer part's top/sides.
- Opposite-facing contact is fine (a torso's bottom resting on the legs' top, a cap sitting on a pillar).
- Builder models (`city/parts.ts` `Builder` → `buildNPCModel` in `world/npcs.ts`, which covers terrain NPCs, roving spawns, resources and `world/landmarks.ts`) pass through `separateCoplanar`. When a later part's top face or axis-aligned box side lines up with an earlier, differently coloured part, it nudges the later part out by 0.05 (up to 3 passes). Add new NPC models through `buildNPCModel` so they get this guard for free. Still author them with clear offsets; the guard only handles unrotated boxes/cylinders and axis-aligned box sides, not rotated or curved parts.
- Hand-written JSX models (`world/NPCModel.tsx` bosses, `ruins`, `TownHall3D`, and any new `<mesh>` model) are **not** covered. Check them by hand: for every pair of differently coloured meshes, compare tops (`y + h/2`) and box sides (`x ± w/2`, `z ± d/2`) and keep same-direction faces ≥0.05 apart.
- **Run `npm run check:models` after adding or editing any model** (`scripts/check-models.ts`). It builds every NPC type through `buildNPCModel` (what the map renders, after the guard), every world-map castle stage (Normal and HD) and parses the unrotated `<mesh>` boxes/cylinders in `world/NPCModel.tsx`. It exits 1 and lists each pair of differently coloured parts whose same-direction faces are within 0.025. It must print `✓ No z-fighting`. New model types are picked up automatically when they are registered in `NPC_KINDS`, `SPAWN_MODEL_TYPES` or `LANDMARK_MODEL_TYPES`. It does not cover rotated parts or `TownHall3D`/city blueprints: check those by eye.
- Thin flat glow decals (water, runes) need the same 0.05 clearance; never use `polygonOffset` hacks or `depthWrite={false}` on opaque parts to hide z-fighting.

## Labels (drei `<Html>`)
- Each label is a DOM element repositioned every frame the camera moves — keep the count low, no `backdrop-blur` on them, and prefer showing detail on hover. Today's ~50 map labels cost ~0.2 ms of JS a frame with the camera still and ~0.6 ms while it orbits (HD, dev build): cheap, as long as they don't re-render (below).
- Labels in a view's canvas wrapper (`.scene-labels`) sit on their own compositor layers, so a camera move is a cheap transform; `CrispLabels` (mounted in `Scene3D`) re-rasterises the ones that grew once the camera stops, so they stay sharp after a zoom. A new view's labels get both by rendering inside `Scene3D`'s canvas.
- **Pop-up text goes through the floating-text kit**, never an `<Html>` per number: `FloatingText.tsx` draws every rising number, tick or name in a view as one instanced quad per glyph (1 draw however many are up, 0 when none is in reach). It draws into its own transparent canvas stacked over the view, above the name cards (labels are DOM over the scene canvas, so anything drawn in the scene sits behind them); that canvas is a second WebGL context, made and freed in an effect (StrictMode remounts effects), and it costs the view's canvas no draw. Add entries to the view's store (`MAP_FLOATING_TEXT.add({ x, y, z, ...FLOAT_STYLE.loss, text })`); an emoji in the text becomes its lucide icon, `apart` keeps two spots' text from overlapping on screen. A new kind of entry is a new `FLOAT_STYLE`, never a new mesh.
- In dev, React StrictMode resets drei Html scale after mount; `useRefreshHtmlLabelsInDev` in `FlatWorldMap3D` works around it — reuse it if a new view shows oversized labels on first load.

## Heavy setup work
- Anything that blocks for more than ~50 ms on mount (terrain, scatter, scene building, creating many meshes, shader compiles) runs behind the loader: the loader paints first, the heavy mount happens ~60 ms later, and the loader hides once the view has drawn its first 3 frames. See `FlatWorldMap3D` (also caches the built world) and `CityView3D` + `Scene3D` (loader derived during render from `readyCityId`, so it never flickers). New views must follow the same pattern.
- **Compile ahead, in parallel.** Linking a shader program blocks the page until the driver is done, and a view drawn straight away links its programs one after another inside its first frames (the HD map's first two frames took 2–3 s each). A view's content sits inside `CompileGate`: it mounts hidden, `compileAsync` starts every program at once (KHR_parallel_shader_compile, into bloom's buffer in HD), the view shows once every program is linked, the static shadow map is drawn again with it standing, and `onReady` fires after its first 3 frames. Labels wait behind the loader too (`.scene-loading`). Shadow depth programs and variants first met on a frame are still linked on that frame (~0.5–1 s on a cold HD load).
- **Cache what a return would build again.** Coming back from a city remounts the map, so anything built from the cached world (or from data the app holds) is kept across the visit: the world itself, the NPC part lists (`remembered` in `FlatWorldMap3D`), the water's depth samples. Key the cache on what it is built from, by identity.

## Memory: free what you make
- r3f disposes only what JSX creates (`<ringGeometry>`, `<meshBasicMaterial>`). A geometry, material, texture or render target made in `useMemo` or a builder (`new THREE.…`) must be disposed in an effect cleanup: `useEffect(() => () => g.dispose(), [g])`.
- `InstancedMesh.dispose()` frees only its instance buffers, not its geometry or material; `EffectComposer.dispose()` frees only its own two buffers, not its passes' targets (bloom's 11); a `PMREMGenerator` can be disposed as soon as its map is made.
- Check after any change to a view: `gl.info.memory` (geometries, textures) and `gl.info.programs` must come back to the same numbers over 10 map ↔ city trips and 5 HD ↔ Normal trips ([HD_WORKFLOW.md](HD_WORKFLOW.md) §3 *Leaks*).

## The poll and React
- The app re-renders every 3 s (the status line's countdown): that must never reach the 3D. `Scene3D` memoises its canvas on the realm's data and passes callbacks through a ref, so a new prop on `Scene3D` must be a stable value (state, a memo), never an object or array made during `App`'s render, or the whole map re-renders on every poll (it did: 110–220 ms twice a poll in the dev build).
- `useGameState` sets polled state only when the response text changed, so unchanged data keeps its identity.

## Kingdom simulation (planned)
- Keep simulation state outside React (typed arrays / a plain store), step it at a fixed rate (e.g. 10 Hz) and interpolate positions per frame into the `Actors` instance buffers.
- Prefer event-driven movement (agent gets a new target/segment; the renderer interpolates) over per-agent per-frame logic. For thousands of agents or pathfinding, move the sim into a Web Worker.
- Spawning/despawning agents must reuse capacity (`mesh.count`), not change React keys.

## Measuring
- Before/after any rendering change, measure draw calls per frame (wrap `WebGL2RenderingContext.prototype.draw*` for a few seconds and divide by frames) and report the numbers. The Browser pane must be rendering (screenshots force it) or measurements read zero. Recipes for draws, GPU time, CPU time and stalls, and their traps: [HD_WORKFLOW.md](HD_WORKFLOW.md) §3.
