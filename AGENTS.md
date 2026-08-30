# AGENTS.md — AUN ComfyUI Nodes

## What this is

ComfyUI custom node pack (Python + JS). Nodes are discovered at ComfyUI startup; no build step. Restart ComfyUI after any code change.

## Adding/changing a node

1. Create/update `AUN*.py` with class defining `CATEGORY`, `FUNCTION`, `RETURN_TYPES`, `RETURN_NAMES`, `INPUT_TYPES()`, `DESCRIPTION`.
2. Register in `__init__.py`:
   - Add import (alphabetical order)
   - Add to `NODE_CLASS_MAPPINGS`
   - Add to `NODE_DISPLAY_NAME_MAPPINGS`
3. Run audits (read-only, exits non-zero on failure):
   - `python tools/generate_readme_nodes.py` — checks every registered node is documented in README
   - `python tools/audit_node_docs.py --fail-on-missing` — checks `DESCRIPTION` and per-input tooltips
4. If `generate_readme_nodes.py` reports missing nodes, add them to README between `<!-- BEGIN: AUN_NODES_AUTO -->` and `<!-- END: AUN_NODES_AUTO -->`.

## Node class conventions

- All `INPUT_TYPES` entries must include a `tooltip` string. The audit tool flags missing tooltips.
- Use `AlwaysEqualProxy("*")` (from this repo) for wildcard types, not bare `"*"` strings.
- `OUTPUT_NODE = True` when the node returns `ui` dict data.
- `IS_CHANGED` returning `float("nan")` forces re-execution every time.

## Randomness rules

- Never call `random.seed()` globally — it mutates shared RNG state.
- Use local generator: `rng = random.Random(seed)`.
- For non-deterministic modes, use instance-local `random.SystemRandom()`.
- For dynamic re-execution, use `IS_CHANGED` with `time.time_ns()`.

## Web/JS patterns

- All JS lives in `web/`. `WEB_DIRECTORY = "./web"` in `__init__.py`.
- Shared utilities: import from `web/index.js` (constants, widgets, utils, graph-traversal, event-bus, group-state).
- Node extensions use `registerLegacyExtension({ name: "AUNNodes.NodeType", ... })` (from `web/aun-compat.js`) with `beforeRegisterNodeDef` for prototype patching. Never call `app.registerExtension` directly.
- Dynamic output slots: use `syncOutputs` pattern — create outputs on `onExecuted`, restore on `onConfigure`/`loadedGraphNode`.
- Overlay display pattern: fixed-position DOM elements positioned via RAF loop against canvas coordinates.
- Height persistence: save height in `onConfigure` → `_aunSavedHeight`, restore in `nodeCreated` via `requestAnimationFrame`.

## Vue frontend (Nodes 2.0) dual layer

- `web/vue/` hosts the Vue-frontend replacements for the legacy `web/*.js` extensions. Extensions there register via `registerVueExtension(def)` (from `web/vue/aun-vue.js`), which only activates when `isNewFrontend()` (from `web/aun-compat.js`) is true.
- Once a replacement ships in `web/vue/`, flip the legacy file's registration to `registerLegacyExtension(def, true)` so the new frontend runs only the Vue path.
- Vue-side widget helpers: `vueGetWidget()`, `vueGetWidgetByNames()`, `vueSetWidgetValue()`, `vueIsCompact()`, `vueSetCompact()` (from `web/vue/aun-vue.js`). Follow the new widget-store rules: unique stable widget names, per-node state in `node.properties`, never rename widgets after registration.
- Import-depth gotcha: `web/*.js` imports ComfyUI internals as `../../scripts/app.js`, but `web/vue/*.js` files are one level deeper and must use `../../../scripts/app.js` (relative imports are URL-resolved by both frontends' module loaders).
- Settings must go through `aunAddSetting` / `aunGetSettingValue` / `aunSetSettingValue` (from `web/aun-settings.js`), keeping setting IDs identical across frontends.
- Python node classes are frontend-agnostic — never rename classes or change `NODE_CLASS_MAPPINGS` keys for frontend reasons.

### Vue frontend 1.53.x findings (learned from the Text Switch 2 pilot — apply to every conversion)

- **Detection**: 1.53.3 has NO `comfy.comfyAPI`, NO `app.extensionManager.setting`, NO `registerSidebarTab`. Detection works via the DOM signal (`#vue-app`/`[data-v-app]`) because extension JS loads after the app mounts. Never gate on comfyAPI alone.
- **`widget.hidden` is NOT visually applied** for store-backed widgets — the Vue node component renders the presented widget view and ignores `hidden`. Physical removal (`node.removeWidget(w)`) is the reliable visual mechanism. The node-state-controller works with `hidden` + full redraw shotgun; when in doubt prefer removal.
- **Removed widgets are excluded from the prompt.** Values must be re-injected: register the node type in `AUN_NODE_TYPES` (in `web/AUN_fix_prompt_missing_inputs.js`) and keep every removed widget object in `node.__AUN_allWidgets`.
- **`serializeValue()` returns `{}` for removed store-backed widgets** on this frontend. `getWidgetValue()` in the fix_prompt patch falls back to `w.value` for empty objects — keep that behavior for any new injection code.
- **`removeWidget` detaches links.** Never remove a widget whose input has a link (`input.name === widget.name && input.link != null`). Links apply around configure on load — run a delayed "settle pass" (e.g. 600 ms `setTimeout`) after the initial compact application.
- **Compact saves misalign `widgets_values`.** Saving while widgets are removed writes fewer values; on reload they apply POSITIONALLY (choose's value lands on text_a etc.). Mitigations that work together:
  - stash removed values in `node.properties` (serialized) and restore BY NAME on load;
  - stash never-removed critical widgets too (e.g. `choose`);
  - patch `node.serialize` to emit the full def-order `widgets_values`.
- **Direct property/widget mutations are invisible to the Vue change tracker** — the autosave snapshot won't include them unless you call `triggerWorkflowCapture()` (Pinia `changeTracker.captureCanvasState`) after mutating. This is why `properties` written at toggle time didn't survive F5.
- **Re-render triggers that work**: `graph.onNodeAdded(node)` (re-extracts the node snapshot), `app.canvas.is_rendering = false` before `canvas.draw(true, true)`, plus the controller's shotgun: `computeSize`+`setSize`, `setDirtyCanvas`, `graph.setDirtyCanvas`, `graph.change()`, `onPropertyChanged("_force_refresh", Date.now())`, delayed redraws at [1,10,50] ms. **`graph.onNodeAdded` is vueNodesMode-only** — on canvas-drawn Nodes 2.0 (1.49.6) it duplicates the node's rendering ("ghost node"): gate it with a DOM probe for `[data-node-id]`.
- **`node.addWidget` re-creates widgets generically** (def-faithful rendering is lost — e.g. re-added STRING widgets render multiline). Never remove/re-add a widget whose rendering matters; keep such widgets alive (e.g. the `choose` combo). When re-adding is unavoidable, re-assert the value after `addWidget` (`w.value = value`) — the call binds to the widget store's retained value for the name (left empty by `removeWidget`), ignoring the passed value.
- **Never REASSIGN `node.widgets`** (`node.widgets = ordered` breaks the reactive getter). Reorder by in-place `sort` — rendering follows array order.
- **Double-click on nodes**: `node.onDblClick` patching and canvas hit-testing (`getNodeOnPos` does NOT exist on 1.53.3) fail — node bodies are DOM-rendered. But dblclick events DO reach a document-level capture listener, and the DOM identifies the node: the node container carries `data-node-id="<id>"`, widget rows carry `node-id`/`node-type`, the title area carries `data-testid=node-title` / `node-header-*`. Use `vueRegisterNodeDblClick(handler)` from `web/vue/aun-vue.js` — it resolves the node from the DOM chain, skips editable controls and the title area (frontend's rename gesture).
- **Node ids are STRINGS on 1.53.x** — a numeric `Number(getAttribute("data-node-id"))` will silently fail any strict `===` against `node.id`. Store as `String(...)` and compare via `String(node.id)`.
- **Legacy drag flags are never set by the Vue drag system** — `canvas.node_dragged` / `canvas.dragging_canvas` / `canvas.onNodeDragStart` don't fire on DOM-rendered frontends. Detect a drag yourself: capture-phase `pointerdown` → `document.elementFromPoint(x, y)?.closest("[data-node-id]")`, then track `pointermove`.
- **Overlays must move via `transform: translate3d` (not `left`/`top`)**: the node drags through a GPU-composited transform; `left`/`top` updates repaint on the main thread and visibly trail the node. Use `position:fixed; left:0; top:0; will-change:transform` and write only `transform`. Anchor overlay positions to the node's own DOM rect (`[data-node-id="<id>"]`.getBoundingClientRect()) on DOM-rendered frontends — the legacy canvas `ds` transform lags the Vue drag.
- **Zero-layout-read drag tracking**: during a drag, apply the pointer delta to stored row coordinates (`row.__AUN_x/__AUN_y += dx/dy`) instead of re-reading `getBoundingClientRect` per pointermove — per-frame layout reads cause jank. Skip the RAF repositioning loop for the dragged node while dragging (it fights the delta updates), and let it re-derive exact positions from the DOM rect on release.
- **Native collapse + delete cleanup for overlays**: hide overlays when `node.flags?.collapsed`; patch `node.onRemoved` (idempotent, guarded) to dispose overlay DOM, clear monitors/timers, and call the original — otherwise rows/footers linger after delete and the RAF loop never self-stops.
- **Diagnostics**: log state as `console.info("... " + JSON.stringify(obj))` — raw objects collapse when pasted from the console, line numbers identify the build under test. Restart + Ctrl+F5 between builds. Log only on change (snapshot-string compare), otherwise drag-time logs flood the console.
- **LoRA stack port patterns** (proven on `web/vue/AUN_lora_stack_vue.js`):
  - Widget registry `node.__AUN_allWidgets` must be maintained BY NAME (replace the entry, never append duplicates) — stale duplicate entries made `getWidget`/`getNumSlots` read old values after compact/expand cycles.
  - Never sync registry→live widget values: it reverts user edits made in expanded mode (the "slot count cannot be changed" bug). The live widget is the source of truth; the registry follows it at compact time.
  - Row overlay Y: measure at runtime — `widget.last_y` on canvas-drawn frontends, DOM measurement (`[data-node-id="<id>"] [aria-label="apply_stack"]` bounding rect → graph coords) on vueNodes; store in `__AUN_compactFirstRowY` and derive BOTH row positions and node height from it.
  - Continuous `requestAnimationFrame` loop repositions rows every frame while compact nodes exist (follows node movement, hides when expanded/off-screen, self-stops).
  - **Never use a pointer-delta fast-path to track rows during drags.** The old approach shifted rows by raw pointer deltas whenever `fastDragNodeId` was set, which permanently detached the overlays when the grab landed on a non-drag target (widget/socket) or a `pointerup` was missed (rows stopped being repositioned by the RAF). Let the RAF loop reposition rows from the node's live DOM rect every frame — the DOM node moves in lockstep with the drag, so no delta bookkeeping is needed. There must be NO early-return that skips the RAF while a node id is "being dragged" and NO mutation of `row.__AUN_x/y` from pointermove.
  - **Re-assert the compact node height even when `baseY` does not drift.** After `removeWidget`, the frontend re-renders and recomputes `node.size[1]` to the short natural height (title + inputs + `apply_stack`); `baseY` (node-top → `apply_stack`-bottom) stays constant, so a `Math.abs(stored-baseY) > 1` guard never fires and the body stays too short. Always `setNodeSize` to `computeCompactHeight(baseY, numSlots)` whenever `node.size[1]` is below it.
  - **Footer must reserve its measured content height**, not a fixed constant. Set the footer `width` + `height:auto`, read `offsetHeight`, cache it in `node.__AUN_footerMeasuredH`, then re-run `updateAutoHeight` so the body grows to fit; anchor the footer at `node.size[1] - footerHeight - 6`. Otherwise a multi-line footer overhangs the node bottom.
  - **Anchor overlays to the node's DOM rect, NOT the canvas `ds` transform** (`ds.offset`/`ds.scale` can be stale/wrong even at rest). When there are multiple `[data-node-id="<id>"]` elements (stale ghosts), pick the on-screen one with the largest area; never prefer a ds-projected position as the disambiguator.
  - **Do NOT auto-fill a slot's trigger with the LoRA filename on selection.** The trigger field holds the user's own trigger words; `lora_${i}`'s callback must not write `loraBasename(...)` into `trigger_${i}` and should not track `_AUN_prevValue` for that purpose.
  - Occlusion hides rows AND the trigger footer when ANY other node's bounding box overlaps this node's (collapsed nodes excepted) — bidirectional, no z-order filtering.
  - Native collapse hides rows/footer (`node.flags?.collapsed`); a guarded idempotent `node.onRemoved` patch disposes rows/footer and clears the monitor interval (`_AUN_loraMonitor`/`_AUN_mcMonitor`) + height timers so the RAF loop self-stops after delete.
  - Trust the Python def for widget ranges (`strength`: -20..20 step 0.01) — some frontends report different `options.step`.
  - Drag-reorder: dedicated grip handle (hit zones excluding label/buttons were unusable) + `.dragging`/`.drag-target` feedback classes.
  - Info modal: `openLoraInfoDialog(v, { insertWord: (w) => appendTriggerWord(node, i, w) })` — append with `", "`, dedupe case-insensitively, return the dialog's message strings.

### Dual-frontend QA setup

- Frontend version is per server instance, not per tab. Run two instances: default (Vue) + `--port 8189 --front-end-version comfyui-legacy-litegraph` (legacy), or use separate portables on different hosts.
- Verify which frontend a tab shows via the `[AUN] frontend detection:` console log (`newFrontend: true` = Nodes 2.0).
- The Nodes 2.0 toggle is the setting `Comfy.VueNodes.Enabled` (also try `Comfy.VueNodes` on older builds) — read via `app.ui.settings.getSettingValue`. Gate on the SETTING, not the DOM: 1.49.6's Nodes 2.0 is canvas-drawn (`vueNodesDOM: false`, `canvasDrawn: true` — no `data-node-id`), while 1.53.x's is DOM-rendered. A render-mode switch mid-session re-applies `widgets_values` positionally and keeps per-node initialization from the previous mode — F5 after switching modes; by-name stash restore in `onConfigure` protects values.
- Early-experiment reference (legacy, do not reuse directly): `../.disabled/AUN-ComfyUI-Nodes-Vue2/` — contains `COMFYUI_VUE_FRONTEND_NOTES.json` (frontend 1.40.8 findings: vueNodesMode snapshot rendering, `graph.onNodeAdded` re-render trick, graphToPrompt widget reinsertion) and `NODE_PORTING_TEMPLATE.py`.

**JS utilities (import from `web/index.js`):**
- `utils.js` — `isCompact()`, `setCompact()`, `forceRedraw()`
- `widgets.js` — `getWidget()`, `ensureHiddenAware()`, `applyWidgetHiddenState()`
- `graph-traversal.js` — `getAllGraphs()`, `findNodeById()`
- `event-bus.js` — `EventBus` (subscribe/unsubscribe events)
- `tooltip.js` — `showTooltip()`, `formatLoraTooltip()`
- `aun_lora_dropdown_shared.js` — `makeLoraLabelClickable()`
- `aun_lora_info_shared.js` — `openLoraInfoDialog()`

## Key gotchas

- `NODE_CLASS_MAPPINGS` keys are workflow identifiers — never rename/remove without migration.
- `requirements.txt` must NOT include torch/numpy/Pillow (ComfyUI bundles them).
- `install.py` exists for ComfyUI-Manager compatibility — keep it in sync with `requirements.txt`.
- After adding a new doc page under `docs/`, add it to `docs/INDEX.md`.
- The `Collapse Connections` global extension (`AUN_global_collapse_connections.js`) has a `SKIP_CLASSES` set — add new AUN node class names there if they have their own collapse behavior.
- **Show Any Multi collapse on Nodes 2.0 (vueNodesMode)**: `web/AUNShowAnyMulti.js` runs on both frontends. On the DOM frontend the link renderer does NOT consult `getInputPos`/`getOutputPos` live — it caches each link's curve and only rebuilds it on a full graph load, so connection-line convergence works on the **legacy** canvas frontend and on Nodes 2.0 only after a reload. Keep the live-working parts (socket dots stack via negative `marginTop` on `.lg-slot--input` rows; socket labels blank via `input.label` + `_force_refresh`) and the crash-safety rules: NEVER run a continuous `setInterval`/monitor that reads `getBoundingClientRect` or calls `draw` every tick (it crashes ComfyUI on zoom) — use the short bounded `scheduleConverge` setTimeout window and stop timers in `onRemoved`. Double-click collapse uses `vueRegisterNodeDblClick` (see line 66); never patch `node.onDblClick` for DOM frontends.
- **Load-safety rule for `aun_persistence_shared.js`**: `captureAunWidgetValues()` is a no-op while `node.__AUN_loadStabilizing` is true. Set the flag at the start of every load path (`loadedGraphNode`, `initExistingNodes`/scanner) and clear it after the stabilization window (~1.5–2 s). Never capture before the frontend applies saved `widgets_values` — a load-time capture poisons `properties._aun_values` with defaults, and later restores overwrite the real saved values (the "workflow opens with reset values" bug). Restore only from file-sourced maps; compact nodes must also emit full def-order `widgets_values` in their `serialize` patch (TS2 pattern) so saves stay positionally complete.
- `restoreAunWidgetValues` type-validates each restored value against the widget type (combo/number/toggle) and skips impossible values — files saved by the buggy builds carry positionally-misapplied garbage in `_aun_values`, and skipping it lets the correctly-applied `widgets_values` survive (self-heals poisoned saves).
- If a node's Python `INPUT_TYPES` order ever changes (e.g. `num_prompts` moved required→optional in the LoRAs-by-Prompt-Index family), old saves break positionally — add a `widgets_values` remapping in a prototype `onConfigure` patch (`migrateLegacyPromptIndexValues` in `AUN_random_lora_multi.js` is the reference implementation: detect the old order by value types, rebuild the array in the new order, and write a by-name `_aun_values` map). Compact saves made by the buggy builds carry a *permutation* of the original values in `_aun_values` (positional application + capture by name) — it is invertible: `recoverPermutedAunValues` in the same file rebuilds the originals and gate it on the signature (string at `num_prompts`, number at `apply_lora`).
- PowerShell gotcha: `Get-Content file | node --check` can silently swallow syntax errors (NativeCommandError). Write to a temp file and check `$LASTEXITCODE` instead.

## Token-saving rules

- NEVER search or scan the parent ComfyUI directory tree. All code lives in this repo only.
- When fixing a bug or editing a node, read only the specific file(s) involved — do NOT explore the full codebase.
- Use `grep` with narrow patterns (e.g. class name, function name) instead of broad glob searches.
- If you need to understand how a node works, read that node's file directly — don't scan `nodes/` or `web/` recursively.
- Do not read files you haven't been asked about or that aren't directly relevant to the change.
- When the user provides a file path or location hint, go directly there — do not search or browse around it.
- When making edits to any files, do not rewrite the whole file unless explicitly told to. Use targeted, minimal edits instead.
- Keep explanations and output minimal unless asked for detail.
- Do not narrate before acting — just do it.
- Batch related operations together instead of doing one at a time.
- Only use tools that are actually needed for the task.

## Shared utilities

**Python utilities:**
- `logger.py` — AUN logger, `log_exception()`
- `misc.py` — `AnyType`, `tensor2pil()`, path helpers, video/image constants
- `model_utils.py` — `MODEL_SHORT_NAMES`, `SAMPLER_SHORT_NAMES`, `get_short_name()`
- `aun_lora_extraction_shared.py` — `extract_basic_loras_from_inputs()` (supports multiple loader formats)
- `aun_path_filename_shared.py` — Placeholder tokens (`%model_short%`, `%sampler_name%`, etc.), `build_template_filename()`, `resolve_template()`

**Shared patterns:**
- Compact mode: `_AUN_compactMode` property, `isCompact()`/`setCompact()` in `utils.js`
- Filename templates: `%token%` style from `aun_path_filename_shared.py`
