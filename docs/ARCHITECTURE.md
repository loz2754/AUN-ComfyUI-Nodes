# AUN Pack Architecture — what links to what

100 nodes, flat layout, no build step. ComfyUI discovers nodes via
`NODE_CLASS_MAPPINGS` in `__init__.py`; `WEB_DIRECTORY = "./web"` serves the
frontend extensions. This page is the map: which shared code exists, who uses
it, and where to start when building something new.

## Python shared helpers → consumers

| Helper | Provides | Used by |
|---|---|---|
| `AUNResolutionHelper.py` | `resolve_dimensions`, `apply_aspect_mode`, `MEGAPIXELS_WIDGET`, `MULTIPLE_WIDGET`, aspect presets | All 9 `AUNInputs*.py` nodes |
| `model_utils.py` | `get_short_name`, sampler/scheduler short names, filename sanitize | `AUNSaveImage`, `AUNSaveVideo`, `AUNExtractModelName`, `AUNExtractPowerLoras`, `AUNModelShorten`, `AUNModelNamePass`, `AUNPathFilenameVideoResolved`, `AUNFilenameResolverPreviewV2` |
| `misc.py` (helpers only) | path helpers, `tensor2pil`, `get_sha256`, `AnyType` | `AUNSaveImage`, `AUNSaveVideo`, `AUNPathFilenameVideoResolved` |
| `aun_path_filename_shared.py` | `%token%` templates, `build_path`, `crop_name`, sidecar text | `AUNPathFilenameV2`, `AUNPathFilenameVideo(V2)`, `AUNSaveImageV2`, `AUNSaveVideoV2`, `AUNFilenameResolverPreviewV2` |
| `aun_lora_extraction_shared.py` | `extract_basic_loras_from_inputs` | `AUNSaveImage`, `AUNSaveVideo`, `AUNExtractPowerLoras` |
| `logger.py` | AUN logger, `log_exception` | `misc.py`, `AUNSaveVideo`, `AUNExtractPowerLoras` |
| `aun_rife_arch.py` | RIFE `IFNet` model | `AUNRIFE.py` (only) |
| `aun_lora_info_server.py`, `aun_lora_multi_setup_server.py` | PromptServer routes for LoRA dialogs | Imported once in `__init__.py`, consumed by LoRA frontend files |

Name traps: `KSamplerInputs.py` and `MainFolderManualName.py` look like
helpers but are standalone **nodes**. `misc.py` also contains node classes
(`StringLiteral`, `ModelInOut`, …) — a known junk-drawer to split one day.

## JS shared modules → importers

`web/index.js` re-exports the shared surface. Import from it (or the module
directly) — never copy the function into a node file.

| Module | Provides | Imported by |
|---|---|---|
| `utils.js` | `isCompact`, `setCompact`, `forceRedraw`, `injectStyles` | preset/keyword/preview nodes, `AUN_apply_preset_to_node`, … |
| `widgets.js` | `getWidget`, `ensureHiddenAware`, `applyWidgetHiddenState`, `chainWidgetCallback` | image/slider/preview nodes, `AUN_multi_index_instant`, `AUN_string_list_builder`, … |
| `graph-traversal.js` | `getAllGraphs`, `findNodeById`, `findNodeByIdentifier` | via `index.js` in ~10 extensions |
| `event-bus.js` | `EventBus` | via `index.js` |
| `tooltip.js` | `showTooltip`, `formatLoraTooltip` | `aun_lora_dropdown_shared.js` |
| `aun_persistence_shared.js` | `captureAunWidgetValues`, `restoreAunWidgetValues` | `AUN_universal_instant`, both `lora_stack` files, `AUN_random_lora_multi`, `AUN_random_lora_compact` |
| `aun_lora_dropdown_shared.js`, `aun_lora_info_shared.js` | clickable LoRA labels, info dialog | LoRA frontend files |

Known duplication (being worked through): `getWidget` redefined locally in
~10 files, `isCompact`/`setCompact` in ~7 — mostly the older large files
(`AUNTextIndexSwitch3`, `AUN_random_lora_multi`, `lora_stack` pair,
`AUN_universal_instant`). Fix a bug in the shared copy and check whether a
local copy still carries the old bug.

## Family clusters

- **Inputs** (`AUNInputs*.py` + `AUNResolutionHelper`) — resolution/aspect widgets.
- **Path/filename** (`AUNPathFilename*.py`, `Save*V2`, `FilenameResolver` + `aun_path_filename_shared`, `model_utils`).
- **Save image/video** (`AUNSaveImage.py`, `AUNSaveVideo.py` — the two mega-files, ~1.7k lines each) + LoRA extraction + sidecars.
- **Universal control** (`AUNMultiUniversal`, `AUNMultiGroupUniversal` + `web/AUN_universal_instant.js`).
- **Switches** (`AUNTextIndexSwitch*`, `AUNRandom*Switch*`, `AUNManualAuto*`).
- **LoRA stacks** (`AUNLoraStackWithTriggers*`, `AUNRandomLora*`, `AUNLoRAsByPromptIndex`) + LoRA shared JS + server routes.
- **Presets** (`AUNPresetManager`, `AUNApplyPresetToNode`).
- **Prompt text** (`AUNAddToPrompt*`, `AUNWildcardAddToPrompt`, `AUNMultiNegPrompt`, `AUNMultiPromptCycler`).

## Building something new — start here

- New resolution/inputs node → import from `AUNResolutionHelper`.
- New filename/path output → import from `aun_path_filename_shared` + `model_utils`.
- New LoRA node → `aun_lora_extraction_shared` (backend) + LoRA shared JS (frontend).
- New switch/toggle node → read `AUN_universal_instant.js` patterns; import JS utils from `web/index.js`.
- Always: wildcard types via `AlwaysEqualProxy("*")`, `tooltip` on every input, `OUTPUT_NODE = True` when returning `ui`, local `random.Random(seed)` (never global `seed()`), register alphabetically in `__init__.py`, docs + README markers, run both audit tools.

## Do-not-break list

- `NODE_CLASS_MAPPINGS` keys are workflow IDs — never rename/remove.
- `requirements.txt` must not include torch/numpy/Pillow; keep `install.py` in sync.
- New `docs/` page → add to `docs/INDEX.md` (and here if it's structural).
- New node with collapse behavior → check `SKIP_CLASSES` in `AUN_global_collapse_connections.js`.
