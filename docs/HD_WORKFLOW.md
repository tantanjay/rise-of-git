# HD workflow: the quality bar, checking and measuring

How to build an HD model to the quality the realm has now, check that it really is that good, and measure what it costs. The **rules** live in [MODEL_STYLE.md](MODEL_STYLE.md) (the rarity ladder, living models), [HD_MODELS.md](HD_MODELS.md) (the HD model kit, the hero and boss rigs, HD motion) and [RENDERING.md](RENDERING.md) (the draw budget, shaders, cost); this guide holds the **bar, the recipes and the gotchas** that the HD work so far relied on. Read them and this guide before any HD work, on any tier.

---

## 1. The quality bar

**HD is the model itself, not effects.** Better shapes, real materials and above all natural movement (weight, momentum, overlap, springs) are what make a model read as HD. Effects are the finishing layer by tier: legendary needs them, epic a little, below that the model carries itself. Never fix "looks cheap" with glow.

**Every model has one definition and two renderings.** Normal is the cheap look and never changes. HD is the same model with richer shapes, surfaces and motion. How rich follows the rarity tier:

| Tier | How its HD is made | What HD adds |
|---|---|---|
| Common | The model kit on the same part list | Bevelled / rounded shapes, real surfaces (fur, bark, stone, leather), soft AO, a relaxed rest pose, weighted motion. Matte, no accent glow |
| Uncommon | The kit, plus HD-only parts | Finer props (banner cloth, lantern glass, buckles), the accent colour in a real material |
| Rare | The kit, more HD-only parts | Real metal (`iron` / `steel`) trim and fittings, plates, straps; its one looping effect |
| Epic | The richest kit version | A bigger, more detailed silhouette, emissive detail in the shader, secondary motion on many parts (cloaks, chains, manes), its aura |
| Legendary | Hand-built (a batched or rigged hero), or HD-only layers in an instanced pipeline when it scales with data | A bespoke model with its own materials and keyed actions; effects as the finishing layer |
| Mythic | Hand-built | The bar for everything else |

**Each step must read above the one below it, at map distance too.** Legendary is two steps above epic, not one. An HD common must still read as less special than a Normal epic. Polish within a tier; never borrow a higher tier's glow or metal.

**Compare before you build.** Open the Codex in HD and put the model next to:
- **the best HD model of its kind and tier** (a legendary boss next to the other bosses, a tier-5 improvement next to tier 4, a Wonder next to its civ's Palace), and say in writing what falls short;
- **the reference models**, which set the bar for the whole realm:
  - *Structures → Castles → The Empyrean*, ✨ HD. The bar for a built thing: marble in dressed courses with per-block tone, crimson fish-scale tiles, leaded stained glass lit from inside, mirror gold, chains that sway with the drift, waterfalls thinning into mist. Its craft is in shaders on baked per-vertex data (`HighGraphicsEmpyrean.tsx`), not in textures or glow.
  - *Creatures → Bosses → Xal'Vorath*, ✨ HD, every action. The bar for a living thing: layered basalt and obsidian surfaces, springs on every floating part, a relaxed rest pose, strikes with coil, hang, impact and follow-through.
  - *Creatures → Bosses*, any world boss in HD. The bar for a legendary creature (`heroBosses*.ts`).

**Work in this order:** silhouette, then materials, then rest pose and motion, then the tier's effects. Write the plan of the look down first (what is wrong today, the goal per model), then build it.

**What players see in HD at every tier:**
- Nothing stands frozen. Structures live through their parts (smoke, banners, glowing parts, orbiting motes); creatures breathe, shift, look round and walk with weight.
- No two copies move the same (seeded from the id).
- Small props count: a skull, a sign or a stone round a fire gets its real shape and material.
- Held things sit in the hand, through the fist.
- Bloom and reflections stay subtle: no glare, no haze over a model.
- No ground discs or rune rings, no pillars of light over plots, no beam over a creature (bosses and creatures get embers and sparks; a slumbering phantom keeps its column).

---

## 2. Checking a model

### Getting to the model

- Run `npm run dev` through `preview_start` (`.claude/launch.json`). In the app, click **Look around without signing in**; never try the Git sign-in.
- **Keep the Browser pane in front.** A hidden pane pauses `requestAnimationFrame`: nothing renders, `HeroMount` never finishes compiling, GPU timer queries never resolve, and the first screenshot after a camera move shows the old frame. If the pane must stay hidden, drive frames yourself (below) and take two screenshots.
- `resize_window` to 1400×1050 makes the Codex preview bigger. The emulation sometimes drops: check it before measuring, and after resizing the preview wait about 300 ms before the last frame or the canvas renders at the old size.
- The API server can die with a V8 `kMaxInt >= len` fatal a few minutes after its startup Git sync. Restart it with `preview_start` `api`.
- Herald notices and battle reports that pop up in dev may be closed.

### Dev handles

| Handle | What it is |
|---|---|
| `window.__r3f` | The map / city canvas's r3f state (`gl`, `scene`, `camera`). Use `__r3f.get()` for live values: `controls` (OrbitControls, `minDistance` 25 on the map) appears after creation |
| `window.__codex` | The Codex preview's r3f state. `__codex.get().camera`, `.controls`, `.gl`, `.clock`, `.advance()` |
| `window.__hdComposer` | The bloom composer while HD bloom is on |
| `window.__login`, `window.__flyover` | The login flyover's r3f state, and `seek(t)` (jump its loop to second `t`). Check its acts with a real-time contact sheet after a `seek` (see *Playing actions*), not by stepping `advance` |
| `window.__graphics` | `setQuality("hd" \| "normal")`, `setFeature(name, on)` |
| `window.realmClock` | `setHour(11)`, `setSeason("summer")`: pin the sky so shots compare |
| `window.__sky` | `settle()`: the sky's light, background and glow jump to the hour's targets on the next frame instead of gliding there on the wall clock (dev only) |

- **Framing:** set the camera and its target, then `controls.update()`. On previews that render on demand (Codex buildings), call `invalidate()` after moving. Set the Codex camera *after* switching action: an action change resets the frame.
- **Full-window Codex preview:** style the canvas's grandparent div `position: fixed; inset: 0; width: 100vw; height: 100vh` and dispatch a window `resize`.
- **Screenshots lag one call behind:** take a cheap screenshot at `scale: 0.3` first, then the real one or the `zoom`.
- **Helpers survive reloads** if you store them in `localStorage` and `eval(localStorage.getItem(...))` after each reload.

### Playing actions at their key moments

The action clock is capped at 0.05 s a frame, so on a slow pane wall-clock timing runs behind and a screenshot "at 0.6 s" lands early.

- **Never step with `advance(clock.elapsedTime + dt)`.** In r3f 9 `advance` runs `clock.getDelta()` (which adds the wall clock in ms to `elapsedTime`) before it applies your timestamp, so the delta comes out hugely negative. Springs and hit-stop timers explode (a body flung to 1e48, a hit-stop of thousands of seconds that crawls the action) and the effects go NaN; the state stays poisoned until a reload. With frameloop `"never"`, `advance(performance.now())` gives each step a small positive delta (capped at 0.05 s by the action clock), but not a fixed one.
- **Steps don't survive a screenshot:** between tool calls the pane can reset the action. Do the stepping and the capture in one call.
- **The reliable way: a real-time contact sheet.** Play the action in real time and grab frames in your own `requestAnimationFrame` (it runs after r3f's render in the same frame, so `canvas.toDataURL()` still holds the frame), at the times you want; then lay the images out in a fixed full-window grid of `<img>` with their times and take one screenshot. It shows the real timing, hit-stop included. Remove the grid after.

- Catch every action at its coil, hang, impact and follow-through, from the side as well as the front, plus the idle from front and side.
- **Re-clicking the action that is already playing does not restart it:** click Idle first.
- **Edits and reloads:** an edit to a model builder file (`heroBosses*.ts`, `heroMercs.ts`, `singularityModel.ts` and the like) makes Vite do a full reload, and a mounted showcase keeps its old definition. Reload and reopen the entry after each edit. An edit to a component hot-reloads and resets a full-window preview.
- Errors logged while HMR applied a half-finished edit stay in the console: compare the error count over a few seconds before chasing them.
- To read a rig's pose, bone matrices are in the burst `Points` material: `material.uniforms.uBones.value.image.data`, 16 floats a bone.

### Things the guest realm doesn't have

Legendary sites, most bosses, slumbering bosses, marches on a boss and the Bandit King are not in the guest realm. Put stand-ins on the map by patching the page's own data, not the code:

- Wrap `window.fetch` **before** clicking the guest login, and rewrite the responses: `/map/roving` (`bosses[...].type`; `dead` and `next` for a slumbering phantom; a roving band's type for a roving hero), `/marches` (a fake acting march), resource nodes and treasures for sites, the city's data for tier-5 improvements or red-star plots.
- A fake march's `attackerCiv` must be a real civ key such as `"human"`, or `ActorsHd` crashes.
- Say in the summary which checks used stand-ins.

### Normal must not change

Prove it, don't assume it: compare the Normal output of HEAD and the working copy.
- **Builder models and the city:** a throwaway script (run with `tsx`) that imports HEAD copies of the changed files and the working copy and builds the same inputs with both (every NPC type, every landmark stage, a few hundred generated cities). Strip the HD-only fields (`mat`, `kit`, `hd`, `hdShape`), drop `hd: true` parts, and compare part by part.
- **Hand-written JSX (`TownHall3D`, `BossModel`):** render HEAD's and the working copy's component into two `createRoot` canvases from a temporary module imported by the page (`await import(...)`), then hash every mesh's attribute buffers, material values, shadow flags and matrices.
- **Get HEAD's files with `git show HEAD:path`, and keep the copies outside `src/`** (the session scratchpad). A copy under `src/` is picked up by the editor's TypeScript server and the typecheck, and shows as stale errors after it is deleted. Delete every temporary file before committing.
- `check:models` checks Normal and HD separately, but it does not prove Normal is unchanged.

### Comparing frames between HEAD and a branch

`readPixels` at the same `advance(t)` in two tabs only matches when everything else matches too. Traps met so far:
- **The realm moves between page loads** (levels, castles, nodes after a sync). Record the API's GET responses once to files outside `src/` and replay them in both tabs (wrap `window.fetch` before the guest login).
- **The static shadow map is drawn at load time**, with whatever pose swaying parts had then. Set `gl.shadowMap.needsUpdate = true` before the frame you read.
- **The sky eases on the wall clock** (lights, background, fog and the window glow level, which also stops short of its target by up to 0.004): call `__sky.settle()` before the frame you read, about 1.5 s after the last `setHour` / `setSeason` (the hour takes a moment to reach every component). Then frames at the same `advance(t)` match across page loads, and a branch without `__sky` (older HEAD) needs a 20 s wait instead. The environment map is the same on every load: leave `scene.environment` on.
- **Hide with layers, not `visible`:** several pipelines set their own `visible` every frame (the weather, grass, halos, batches that cull), so a hidden one comes back inside `advance`. Set `layers.mask = 0` on what you leave out (the shadow camera skips it too) and restore the masks after.
- **Keep replay files where the dev server doesn't watch them,** or edit them before loading the page: Vite reloads every page it serves when a file under its root changes, and the reload logs the guest back in without the replay.
- **Rigs with springs** (`BossBatch`, the hand-tuned NPCs, the Empyrean) depend on their history, not on `t`: leave them out of a hash.
- Hash each pipeline on its own (everything else hidden, a plain `gl.render`), and check HEAD against itself first: a comparison only counts if HEAD reproduces its own hash. Expect single pixels off by one level between page loads of the same code (an edge pixel of the scatter or the NPC batch): count the pixels that differ and by how much rather than stopping at a hash.
- A change you can toggle at runtime (a culling switch) is best compared inside one page.
- **More pipelines that depend on their history, not on `t`:** the town hall's spinning halos and orbits (`TownHall3D` adds `delta` each frame), the Arcane Rift and the hand-tuned sights (`MapNPC3D`, springs). Leave them out (layers) and check each view reproduces itself before comparing.
- **Saving frames:** right after `advance(T)` (frameloop `"never"`), in the same task, `gl.domElement.toDataURL("image/png")` holds what players see (the composer's output in HD); `gl.render` first for a plain frame. A tiny local server outside the repo that stores the PNGs (and the recorded API snapshot) lets both tabs save and load them; diff them in the page through a 2D canvas, counting pixels and the largest step.

### By eye

- `npm run check:models` covers Builder models and castles; hand-built meshes, rotated parts and city blueprints are checked by eye (same-direction faces of different colours ≥0.05 apart; rotated parts not floating).
- Look at the model at the map overview and the closest zoom, by day and at night. Look at the edges of scattered props (shore, river, lava, pads).
- **Black frames:** sweep the camera round the model (36 angles is enough) in HD. To sweep without bloom hiding the cause: frameloop `"never"`, `advance`, then `readPixels` the drawing buffer and average it; a black frame averages near zero.

---

## 3. Measuring

Report draws, triangles and GPU time before and after any rendering change, against HEAD, at the default view and the closest zoom. Compare the numbers with the budget table in [RENDERING.md](RENDERING.md).

### Draw calls and triangles

Wrap `WebGL2RenderingContext.prototype.drawArrays` / `drawElements` / their instanced variants for a few seconds and divide by frames. **Count only the context you are measuring:** the map keeps rendering behind the Codex (about 190 draws a frame of its own), so in the Codex count only when `this === __codex.get().gl.getContext()`. Never `delete gl.render` after wrapping it: `WebGLRenderer.render` is an own property, so deleting it stops rendering until a reload.

Draw counts move with the realm's state (time of day, what is roving). Compare only A/B at the same moment, for example by hiding the new group (`visible = false`) instead of swapping code (a dynamic import of a changed module doesn't reach the running app).

### GPU time

```js
window.__bench2 = async (label, n = 30, warm = 40) => {
  await new Promise(r => setTimeout(r, 900));
  const { gl, scene, camera } = window.__r3f;
  const ctx = gl.getContext(); const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2');
  const render = () => window.__hdComposer ? window.__hdComposer.render(0.016) : gl.render(scene, camera);
  for (let i = 0; i < warm; i++) render();
  const qs = []; for (let i = 0; i < n; i++) { const q = ctx.createQuery(); ctx.beginQuery(ext.TIME_ELAPSED_EXT, q); render(); ctx.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); }
  ctx.flush();
  const res = [];
  for (let k = 0; k < 400 && res.length < n; k++) { await new Promise(r => setTimeout(r, 50)); for (const q of qs) if (!q.done && ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE)) { q.done = true; res.push(ctx.getQueryParameter(q, ctx.QUERY_RESULT) / 1e6); } }
  res.sort((a, b) => a - b); return { label, gpu: +res[n >> 1].toFixed(2) };
};
```

For the Codex, use `__codex.get()` in place of `__r3f`; with frameloop `"never"`, wrap `s.advance()` in the timer query instead of `render()`.

**Comparing setups: the interleaved bench `__ab`.** Separate runs swing by several ms while the GPU clocks up, so compare setups inside one run, frame by frame: every setup is rendered in turn, so all of them see the same GPU clock.

```js
// setups: [{ label, on }]. on() puts the scene in that setup cheaply: hide / show a group, flip a uniform.
// Not a material swap or a graphics feature switch (they recompile): compare those in separate blocks.
window.__ab = async (setups, { n = 30, warm = 40, runs = 2, store = window.__r3f } = {}) => {
  const s = store.get(); const ctx = s.gl.getContext();
  const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2');
  const render = () => (store === window.__r3f && window.__hdComposer) ? window.__hdComposer.render(0.016) : s.gl.render(s.scene, s.camera);
  const out = [];
  for (let r = 0; r < runs; r++) {
    for (const st of setups) { st.on(); for (let i = 0; i < warm; i++) render(); }
    const qs = setups.map(() => []);
    for (let i = 0; i < n; i++) setups.forEach((st, k) => {
      st.on(); const q = ctx.createQuery();
      ctx.beginQuery(ext.TIME_ELAPSED_EXT, q); render(); ctx.endQuery(ext.TIME_ELAPSED_EXT); qs[k].push(q);
    });
    ctx.flush();
    const ms = setups.map(() => []);
    for (let w = 0; w < 400 && ms.some((m, k) => m.length < qs[k].length); w++) {
      await new Promise(res => setTimeout(res, 50));
      qs.forEach((list, k) => list.forEach(q => {
        if (!q.done && ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE)) { q.done = true; ms[k].push(ctx.getQueryParameter(q, ctx.QUERY_RESULT) / 1e6); }
      }));
    }
    const row = { disjoint: !!ctx.getParameter(ext.GPU_DISJOINT_EXT) };   // true: the clock jumped, discard this run
    setups.forEach((st, k) => { const m = ms[k].sort((a, b) => a - b); row[st.label] = m.length ? +m[m.length >> 1].toFixed(2) : null; });
    out.push(row);
  }
  return out;
};
// e.g. one pipeline's cost: [{ label: 'all', on: () => (grp.visible = true) }, { label: 'without', on: () => (grp.visible = false) }]
// Run it in an async IIFE that stores the result on window (the tool call times out at 45 s), restore the scene afterwards.
```

Keep only runs that agree within about 10 % and aren't disjoint. To compare HEAD with a branch (code can't be toggled inside one page), open both dev servers in two tabs and alternate them over at least three rounds at the same view, the front tab only.

**CPU time.** With frameloop `"never"`, time `__r3f.get().advance(t)` with `performance.now()` around it (that is the JS of a frame: `useFrame` callbacks, matrix updates, uploads, plus the GL calls), and watch long tasks with `PerformanceObserver({ type: "longtask" })`. A frame is as slow as the slower of CPU and GPU: report both.

- **Alternate the setups over several rounds and take medians** (A, B, A, B…). Separate runs swing by several ms while the GPU clocks up, so one run each proves nothing.
- Render about 80 frames after switching a setting before measuring (compiles). **Never compare across a Normal → HD switch:** the first seconds after it read 2–3× slow. Measure an HD layer by toggling its feature (`__graphics.setFeature`) or hiding its group.
- The `javascript_tool` call times out at 45 s: start long runs in an async IIFE that stores its results on `window`, then read them in a later call.
- Stalls: `PerformanceObserver({ type: "longtask" })`; for a hero, also time its build and its first compile.
- Different laptops and different days read differently: always report HEAD's numbers from the same run.
- **Check the pane is really drawing** before trusting a number: `__vis2.watch(2, false)` should show ~60 fps. When the app window is out of view the pane drops to about one frame a second, and culling that waits on frames goes stale.
- **CPU by callback:** the median of `advance` swings by several ms between runs of the dev build; timing each `useFrame` subscriber over 80 frames (wrap `internal.subscribers[i].ref.current`) gives steadier numbers, and shows which callback grew.
- **Render submission includes waiting on the GPU.** `advance` called back to back stalls once the driver's queue is full, and so does `gl.render` in live frames while the view is GPU-bound: on the HD map either reads 8–20 ms, most of it waiting. The callbacks are the CPU's own share (~1 ms a frame at the HD overview: the boss pose ~0.5, the HD actors ~0.2, the rest tiny); the render call's own JS showed as ~3.7 ms in a run where the GPU kept up. Read a render time as an upper bound, and compare the callbacks per subscriber.
- **The poll:** watch long tasks over 30 s with the camera still (both tabs replaying one snapshot, which keeps `/status` firing). To find what a poll re-renders, make one response fail in the page (`fetch` wrapped to return a 404 for that path) and see which long tasks go.
- **Loads:** Chrome keeps compiled shaders between page loads, so the first load of a session reads seconds slower than the next: load both tabs once before comparing, then alternate them. Attribute a load with long-animation-frame entries (`PerformanceObserver({ type: "long-animation-frame" })`, their `scripts` name the entry point: React's scheduler, r3f's loop, a timer) and by timing `getProgramInfoLog` (wrap `WebGL2RenderingContext.prototype`): three calls it on a program's first use, which is where a synchronous link waits.
- **Leaks:** three listens for `dispose` on every geometry and texture it uploads, so patching `BufferGeometry.prototype.addEventListener` / `removeEventListener` (and `Texture`'s) gives the live set on the GPU. Note the scene objects using each (with `labelAll`'s labels) while they are on screen, switch views a few times, and list the live ones in no scene: those were never disposed. Render targets count as textures in `gl.info` without passing through this hook.

---

## 4. Shaders: gotchas met so far

- No NaN: clamp every `pow` base, `sqrt`, `log`, `normalize` and division ([RENDERING.md](RENDERING.md) *Shader math*).
- Gate every costly layer behind its mask ([RENDERING.md](RENDERING.md) *Shader cost*).
- `InstancedBufferGeometry` without a `normal` attribute compiles as flat-shaded in three r186.
- A material swap on an `InstancedMesh` rebuilds it: rewrite its instances when the material changes, or the instances vanish.
- A patched shader chunk applied at module load (as `HdPost.tsx` does) needs a page reload after editing; HMR won't re-patch it.
- Prism vertex normals bend at the eaves: masks that need the true face (roof tiles) come from the facet normal (screen derivatives).
- Clear water shows the bed's detail through it as "tiles": keep river alpha ≥ 0.86. Strong low-frequency chop reads as foam squiggles; fine, weak chop with roughness about 0.17 reads as glitter.
