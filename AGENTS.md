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
- Node extensions use `app.registerExtension({ name: "AUNNodes.NodeType", ... })` with `beforeRegisterNodeDef` for prototype patching.
- Dynamic output slots: use `syncOutputs` pattern — create outputs on `onExecuted`, restore on `onConfigure`/`loadedGraphNode`.
- Overlay display pattern: fixed-position DOM elements positioned via RAF loop against canvas coordinates.
- Height persistence: save height in `onConfigure` → `_aunSavedHeight`, restore in `nodeCreated` via `requestAnimationFrame`.

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

## Architecture map

- `docs/ARCHITECTURE.md` — helper→consumer matrix (Python + JS), family clusters, "start here" pointers for new nodes. Never duplicate a utility that already exists there; import it.
