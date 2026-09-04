# New Node Checklist — idea to shippable in ~5 minutes

For full conventions see `AGENTS.md`; for what-links-to-what see
`ARCHITECTURE.md`. This is just the order of operations.

## 1. Backend — `AUN<Name>.py`

- [ ] Class defines `CATEGORY`, `FUNCTION`, `RETURN_TYPES`, `RETURN_NAMES`, `INPUT_TYPES()`, `DESCRIPTION`.
- [ ] Every `INPUT_TYPES` entry has a `tooltip` string.
- [ ] Wildcard types via `AlwaysEqualProxy("*")`, never bare `"*"`.
- [ ] `OUTPUT_NODE = True` if returning a `ui` dict.
- [ ] Randomness: local `random.Random(seed)` / instance-local `SystemRandom()`; never global `seed()`.
- [ ] Reuse a shared helper instead of new logic — pick from `ARCHITECTURE.md`:
      resolution → `AUNResolutionHelper`, filenames → `aun_path_filename_shared` + `model_utils`,
      LoRA → `aun_lora_extraction_shared`, logging → `logger`.
- [ ] Coerce `kwargs` strings defensively (`str(... or "")`); never assume a widget value is a string (see `docs/frontend-widget-serialization-issue.md`).

## 2. Register — `__init__.py`

- [ ] Import (alphabetical order), `NODE_CLASS_MAPPINGS`, `NODE_DISPLAY_NAME_MAPPINGS`.
- [ ] Key = workflow ID: permanent. Never rename/remove without migration.

## 3. Frontend — `web/` (only if the node needs UI behavior)

- [ ] One file named `AUN_<node>[_<aspect>].js`, registered via `app.registerExtension({ name: "AUNNodes.NodeType", ... })`.
- [ ] Import from `./index.js` — never redefine `getWidget`, `isCompact`/`setCompact`, `forceRedraw`, `findNodeById`, `getAllGraphs`, `parsePositiveInt`, `matchesTarget`. If yours genuinely differs, keep it with a `NOTE: local <name> kept intentionally` comment.
- [ ] Compact-mode widgets: `ensureHiddenAware` + `applyWidgetHiddenState`; persist height via `_aunSavedHeight`.
- [ ] Collapse behavior of its own → add class to `SKIP_CLASSES` in `AUN_global_collapse_connections.js`.
- [ ] `node --check web/AUN_<file>.js` passes.

## 4. Docs

- [ ] New page `docs/<Node>_README.md` (copy the structure of an existing one) + link in `docs/INDEX.md`.
- [ ] README entry between `<!-- BEGIN: AUN_NODES_AUTO -->` and `<!-- END: AUN_NODES_AUTO -->` if the generator asks.
- [ ] `CHANGELOG.md` `[Unreleased]` entry (Added/Fixed).

## 5. Verify + commit

- [ ] `python tools/generate_readme_nodes.py`
- [ ] `python tools/audit_node_docs.py --fail-on-missing`
- [ ] `python tools/audit_js_utils.py --fail-on-missing` (if JS touched)
- [ ] Restart dev ComfyUI, load the node, exercise it. JS has no automated tests — the running instance is the test.
- [ ] Commit (one node per commit; keep it re-runnable for bisection).
