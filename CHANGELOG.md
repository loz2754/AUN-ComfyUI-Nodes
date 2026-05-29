# AUN Custom Nodes Changelog

## [2.2.13] - 2026-05-25

### Fixed

- Fixed `AUNAddToPromptMulti` compact overlay flickering and vanishing issues by optimizing DOM updates and ensuring correct element references during repositioning.

## [Unreleased]

### Added

- Added `AUNPromptCycler` node — cycles through an infinite number of prompts with support for sequential, random, manual, range (e.g. `1,2,4-8,11`), and search modes. Supports custom titles via `Title: Prompt text` format. Emits `AUN_prompt_cycler_selected` WebSocket events for downstream compact-mode overlays.

### Changed

- Moved `AUNAddToPromptMulti` category from `AUN/Prompt Modifiers` to `AUN Nodes/Text` for consistency.
- Removed unused `labels` output from `AUNRandomLoraModelOnlyMulti` along with internal label-tracking logic, simplifying the return tuple and reducing overhead.
- Added new model short names to `model_utils.py`: `damnIllustriousPony_v50Noobai`, `eventHorizonNexusNSFW_illustrious1DMD2`, `fucktasticRealCheckpointPony_10`, `novaAnimeXL_ilV190`.

### Fixed

- Fixed `AUNTextIndexSwitch3` compact overlay not hiding when another node visually covers it — now performs AABB overlap detection using z-order (`order` property) to determine occlusion.
- Fixed `AUNTextIndexSwitch3` width preservation by simplifying logic to always preserve the user's current width instead of relying on a separately tracked manual width value.
- Fixed `AUNAddToPromptMulti` overlay occlusion detection using `order` (drawing z-order) instead of `index` (execution order), preventing incorrect hide/show behavior.
- Fixed `AUNRandomLoraModelOnlyMulti` compact overlay not displaying labels from upstream `AUNPromptCycler` nodes — now reads `prompt_title` output and listens for `AUN_prompt_cycler_selected` WebSocket events.
- Fixed `AUNRandomLoraModelOnlyMulti` label slot index check (`!= null` → `>= 0`) to correctly handle slot index `0`.

### Notes

## [2.2.14] - 2026-05-26

### Fixed

- Fixed `AUNAddToPromptMulti` not re-executing when an addon is in `random` mode by adding an `IS_CHANGED` method that returns a unique timestamp for random-mode configurations, ensuring random decisions are re-evaluated on every queue.
- Simplified `AUNAddToPromptMulti` compact overlay row management by replacing indirect rowData objects with direct element references, reducing DOM update complexity and improving maintainability.

### Added

- Added shared JavaScript utility modules (`constants.js`, `event-bus.js`, `graph-traversal.js`, `group-state.js`, `index.js`, `utils.js`, `widgets.js`) as a single source of truth for magic numbers, property keys, graph traversal, widget helpers, and compact-mode utilities.
- Added optional `label` input/output to `AUNRandomLoraModelOnlyMulti` so an upstream node (e.g., TextIndexSwitch4) can supply a display label.
- Added documentation for `AUNRandomLoraModelOnlyMulti` (`docs/AUNRandomLoraModelOnlyMulti_README.md`).
- Added documentation for `AUNTextIndexSwitch4` (`docs/AUNTextIndexSwitch4_README.md`).

### Changed

- Refactored all compact-mode overlay frontend extensions to import shared utilities from the new module index instead of duplicating helpers inline. Affected files: bypass, mute, collapse state, set-bypass-state-group, set-mute-state-group, LoRA stackers, universal controllers, and add-to-prompt-multi.
- Replaced broken `DOMMatrix`-based coordinate transformation (`buildCanvasMatrix`) with a simple `graphToScreen` formula across all overlay-positioning code, fixing device pixel ratio issues, wrong offset properties, and double-counting that caused compact overlays to not appear when the canvas was panned or zoomed.
- Updated documentation for `AUNRandomLoraModelOnly`, `AUNLoraStackWithTriggersModelClip`, `AUNAddToPromptMulti`, and `AUNMultiUniversal` to reflect recent feature additions (CLIP input, footer toggles, right-click menus, INT socket exposure).
- Added 5 missing entries (`AUNAddToPromptMulti`, `AUNRandomLoraModelOnlyMulti`, `AUNTextIndexSwitch4`, `AUNRandomTextIndexSwitchV2`, `AUNWildcardAddToPrompt`) to `docs/INDEX.md`.

### Fixed

- Fixed `AUNRandomLoraModelOnly` returning the composed prompt instead of the raw `base_prompt` in its early-return path when no LoRA is selected.
- Fixed missing space in `__init__.py` import (`from.` → `from .`) for `AUNKSamplerPlusv4`.

### Notes
## [2.2.11] - 2026-05-17

### Fixed

- Fixed unwanted optional input slots appearing on `AUNTextIndexSwitch4` when changing slot count. Root cause was `AUN_text_index_switch_labels.js` creating duplicate inputs via `node.addInput()` — resolved by removing `AUNTextIndexSwitch4` from the labels file `NODE_CONFIG` as it doesn't require label management.

## [2.2.10] - 2026-05-17

### Added

- Added `selected_LoRAs` passthrough input/output to `AUNLoraStackWithTriggersModelClip` and `AUNRandomLoraModelOnly` — upstream `<lora:...>` tags are concatenated with locally generated tags, enabling chained LoRA stacks.
- Added compact mode to `AUNWildcardAddToPrompt` via double-click node header toggle, hiding configuration widgets and showing only `mode` and `populated_text`.
- Added per-addon mode selectors (`on`/`off`/`random`) to `AUNAddToPromptMulti` compact overlay, replacing simple checkboxes with dropdowns for probabilistic addon control.
- Added `AUNAddToPromptMulti` documentation (`docs/AUNAddToPromptMulti_README.md`).

### Changed

- `AUNAddToPromptMulti` compact overlay rows now use mode dropdowns instead of checkboxes, with color-coded backgrounds (green=on, gray=off, brown=random).
- `AUNAddToPromptMulti` overlay z-index reduced from 11 to 1 to avoid overlapping UI elements incorrectly.
- `AUNMultiUniversal` and `AUNMultiGroupUniversal` backends now send explicit `state_changes` arrays with each update message, defining exactly which node states (mute, bypass, collapse) to modify. Frontend falls back to deriving state changes from `mode` for backward compatibility.
- `AUNMultiUniversal` and `AUNMultiGroupUniversal` compact mode overlay inputs preserve connected links — hidden inputs are only disabled (greyed out) when unconnected, preventing accidental disconnection when toggling compact mode.
- `AUNTextIndexSwitch3` now preserves manual node width across workflow loads and auto-resize operations.
- `AUNTextIndexSwitch3` hidden input slots are now visually hidden on the canvas (drawn over with background-colored circles).
- `AUNRandomLoraModelOnly` output names updated: `selected_lora` → `selected LoRAs`, `index` → `index`, `prefixed_label` → `labels`, `trigger_words` → `trigger_words`, `prefixed_trigger_prompt` → `trigger + prompt`.

### Fixed

- Fixed `AUNRandomLoraModelOnlyMulti` drag-to-swap causing overlay destruction — added guard flag to prevent LoRA widget callbacks from triggering `applyCompact()` mid-swap.
- Fixed `AUNAddToPromptMulti` compact overlay not hiding when node is collapsed.

### Notes
## [2.2.9] - 2026-05-15

### Fixed

- Fixed `AUNTextIndexSwitch3` compact overlay not updating in dynamic modes (Increment/Random/Range) — now reads the last executed index from WebSocket events instead of the static widget value.
- Fixed `AUNTextIndexSwitch4` displaying the slot highlighter (blue strip + arrow) from `AUN_index_selected_indicator.js` — separated visual highlighter from index tracking so only Random Text Index Switch nodes receive the highlight.
- Fixed compact label popup appearing far from the node when the canvas is panned — now correctly accounts for canvas offset (`ds.offset`) in screen coordinate conversion.

### Changed

## [2.2.7] - 2026-05-15

### Added

- Added JavaScript frontend for `AUNAddToPromptMulti` with dynamic addon visibility (hides inactive addon slots based on `num_addons`).
- Added compact mode to `AUNAddToPromptMulti` via double-click or right-click menu, with overlay checkboxes for enabled toggles and Before/After order selectors.
- Added minimum height enforcement on `AUNAddToPromptMulti` to prevent manual resize below usable thresholds.

### Changed

- Enhanced `AUNAddToPromptMulti` node description to document compact mode and order controls.
## [2.2.6] - 2026-05-14

### Added

- New node: Text Index Switch 4 (`AUNTextIndexSwitch4`) with built-in mode selection (Select, Increment, Random, Range). Combines index generation and text switching in a single node, supporting up to 20 text slots with compact mode support.

### Changed

- Enhanced `AUNTextIndexSwitch3` frontend with improved compact mode overlay handling and widget visibility management.
- Enhanced `AUNStrip` with improved string cleaning capabilities.
- Enhanced `AUNTextIndexSwitch3` Python backend with improved slot management.
- Updated model utilities with enhanced functionality.

### Fixed

## [2.2.3] - 2026-05-08

### Fixed

- Fixed overlay widget duplication glitch in compact mode LoRA nodes (AUNRandomLoraModelOnlyMulti, AUNLoraStackWithTriggersModelClip) by properly managing DOM element lifecycle and preventing element accumulation.
- Fixed overlay widgets persisting on screen when dragging nodes or switching tabs by implementing global drag monitoring and visibility change detection.
- Fixed overlay widget visibility detection to properly track when nodes are being dragged (drag-to-reorder vs canvas drag) and when window loses focus.

## [2.2.2] - 2026-05-08

### Fixed

- Fixed drag-to-adjust numeric values on strength inputs in compact mode by making only LoRA labels draggable instead of entire row (AUNLoraStackWithTriggersModelClip, AUNRandomLoraModelOnlyMulti).

## [2.2.1] - 2026-05-08

### Added

- Added footer display in compact mode for LoRA nodes showing trigger words with smart text wrapping (AUNRandomLoraModelOnly, AUNRandomLoraModelOnlyMulti, AUNLoraStackWithTriggersModelClip).
- Added node property toggle to show/hide footer in LoRA nodes, allowing users to control footer visibility via right-click menu.
- Added drag-to-reorder support for LoRA slots in compact mode overlays (AUNLoraStackWithTriggersModelClip, AUNRandomLoraModelOnlyMulti, AUNLoraStackWithTriggers).
- Added `selected_lora` input to AUNSaveImage for LoRA metadata tracking from output nodes (e.g., AUNRandomLoraModelOnly).
- New experimental node: Random Multi-LoRA Model Loader (AUNRandomLoraModelOnlyMulti) supporting up to 20 prompts with 3 LoRA slots per prompt.

### Changed

- Enhanced AUNRandomLoraModelOnly with CLIP support: now accepts optional CLIP input for per-slot clip strength control.
- Made "Hide clip strength" setting apply globally in both full and compact modes for all LoRA nodes.
- Improved compact mode height calculation in LoRA nodes to shrink to minimum when footer is hidden.
- Updated node descriptions to document double-click toggles, right-click menu options, and property controls.
- Enhanced AUNRandomLoraModelOnly compact mode to show apply_lora switch visibility in Select mode.
- Improved select mode handling in AUNRandomLoraModelOnly to better track execution index vs widget value.
- **DEPRECATION**: AUNLoraStackWithTriggers is now marked for removal in favor of AUNLoraStackWithTriggersModelClip, which provides superior CLIP support, compact mode with overlay UI, drag-to-reorder, and footer display.

### Fixed

- Fixed footer text truncation in LoRA nodes by removing canvas clipping rect during rendering.
- Fixed footer height calculation to account for text wrapping and ensure proper descender space.
- Fixed node height adjustment when toggling footer visibility to properly resize to minimum.
- Fixed LoRA stack compact mode initialization to properly set COMPACT_LABEL_HEIGHT constant.
- Fixed clip strength synchronization to maintain value parity when hidden across all LoRA nodes.

## [2.1.11] - 2026-05-06

### Added

### Changed

- `AUNRandomLoraModelOnly` now exposes `base_prompt` as an optional external input instead of a required inline widget, matching the LoRA stack nodes more closely.
- `AUNMultiUniversal` and `AUNMultiGroupUniversal` now switch cleanly between `manual` and `index-driven` control, with the frontend promoting the correct mode-specific control socket at runtime.

### Fixed

- Fixed the compact-mode `AUNRandomLoraModelOnly` UI so the hidden `base_prompt` no longer leaves a stray connection target outside the node body.
- Fixed `AUNMultiUniversal` and `AUNMultiGroupUniversal` compact/widget-backed input handling so connected converted inputs stay aligned correctly in compact mode instead of jumping to the top-left or exposing unrelated hidden slot widgets.
- Fixed `AUNMultiUniversal` and `AUNMultiGroupUniversal` mode switching so the `Index` control exposes as an `INT`, accepts external links correctly in `index-driven` mode, and forcibly disconnects when switching back to `manual`.

### Notes

## [2.1.10] - 2026-05-05

### Added

- Added LoRA info lookup support with a backend metadata endpoint and shared frontend dialog that can show local sidecar metadata, previews, trained words, and live Civitai hash matches.
- Added compact-mode LoRA info buttons for `AUNRandomLoraModelOnly`, `AUNLoraStackWithTriggers`, and `AUNLoraStackWithTriggersModelClip`, including one-click insertion of trained words into trigger fields.

### Changed

- Renamed the trigger-related outputs on the LoRA loader/stack nodes to cleaner UI labels such as `trigger words`, `trigger + prompt`, and `prompt`.
- Updated the stack compact UIs so model strength editing, row sizing, and compact layout restoration behave more reliably after load and resize events.

### Fixed

- Fixed compact LoRA stack controls so collapsed nodes hide overlay rows correctly and hidden clip-strength behavior stays in sync.
- Fixed random LoRA compact state tracking so the frontend keeps the selected LoRA value available for runtime status and info lookup.

### Notes

## [2.1.9] - 2026-05-05

### Added

- Added `AUNLoraStackWithTriggers` and `AUNLoraStackWithTriggersModelClip` for stacking multiple LoRAs with per-slot triggers, adjustable visible slot count, and compact frontend controls.
- Added dedicated docs for the new LoRA stack nodes and shared LoRA-extraction helpers for downstream metadata/saver integrations.

### Changed

- Updated LoRA metadata extraction and saver integrations to recognize the new stack nodes and emit cleaner stack-derived LoRA sidecar text.
- Improved Random LoRA compact runtime label updates and normalized node-id handling for frontend execution events.

### Fixed

- Fixed the `AUNLoraStackWithTriggers` and `AUNLoraStackWithTriggersModelClip` frontend extensions so their load-time compact/layout restore logic only runs on their own node types, preventing unrelated node widget glitches and saved-size resets.

### Notes

## [2.1.8] - 2026-05-05

### Added

### Changed

### Fixed

- Fixed the `AUNLoraStackWithTriggers` and `AUNLoraStackWithTriggersModelClip` frontend extensions so their load-time compact/layout restore logic only runs on their own node types, preventing unrelated node widget glitches and saved-size resets.

### Notes

## [2.1.7] - 2026-05-04

### Added

- Added `AUNRandomModelBundleSwitch` as `Model and Text Selector`, with a compact UI, slot-status footer, and an `index` output that can drive other control nodes.
- Added `AUNRandomLoraModelOnly`, a compact LoRA slot selector/loader with runtime footer updates and optional inline LoRA info display.
- Added `AUNLoraLoaderModelOnlyFromString` for workflows that need to load a LoRA from a string path/name instead of a combo widget.
- Added `AUNKSamplerPlusV2` for progressive two-pass sampling with latent/image upscale and optional final refinement.
- `AUNRandomTextIndexSwitch` and `AUNRandomTextIndexSwitchV2` now display a blue row highlight and **▶** arrow on the selected text input slot after each workflow run, making it easy to see which input was active at a glance.
- Added dedicated docs for the Model and Text Selector, Random LoRA Model Loader, and Random Text Index Switch V2.
- `AUNMultiUniversal` and `AUNMultiGroupUniversal` now support `index-driven` control mode so an external `INT` can select the active slot directly.
- Added `AUNInputsDiffusersBasic` and `AUNInputsDiffusersRefineBasic` for lighter diffusion-model loading flows, including optional refine-model output for diffusion-only setups.
- Added a `prefixed_label` output to `AUNRandomTextIndexSwitchV2` so workflows can use the combined slot prefix and connected title, such as `1-Beach`.

### Changed

- Renamed `AUNRandomModelBundleSwitch` in the UI to `Model and Text Selector` and updated docs/readme coverage for the new naming and control patterns.
- Standardized compact-mode menu wording across the updated compact-capable nodes.
- Added contributor guidance for safer randomness patterns and release/update workflow expectations.
- `AUNMultiUniversal` and `AUNMultiGroupUniversal` now pair naturally with `AUNRandomModelBundleSwitch.index` when you want one selector to drive bypass/mute/collapse dashboards.
- `AUNInputsRefine` and `AUNInputsRefineBasic` now use a dedicated `speed_lora_full_both` toggle instead of overloading `speed_lora_ratio`, so the ratio remains available for normal main/refine strength splitting.
- `AUNExtractWidgetValue` can now optionally concatenate the widget name with the resolved value.

### Fixed

- Restored compatibility for existing `AUNMultiUniversal` and `AUNMultiGroupUniversal` workflows by preserving the original serialized widget order while adding `control_mode` and `Index`.
- Replaced several global `random.*` calls and global seeding patterns with local or system RNG usage so unrelated nodes do not interfere with each other.
- Improved `AUNGraphScraper` resolution inside subgraphs by scoping prompt-node matching with `UNIQUE_ID` namespace data.
- Fixed compact UI/runtime state issues across the new selector nodes, including persisted compact mode restore and reliable runtime-selected footer updates.
- `AUNRandomTextIndexSwitchV2` now keeps the plain `label` output unprefixed while exposing prefixed self-naming input labels like `4-Volcanoes` in the UI and through the new `prefixed_label` output.

### Notes

- Existing workflows that use `AUNInputsRefine` or `AUNInputsRefineBasic` may need their SpeedLoRA-related widgets checked or adjusted after loading because the input set changed.

## [2.1.5] - 2026-04-29

### Added

### Changed

- `AUNMultiNegPrompt` now supports up to 20 manually entered negative prompts with a `visible_inputs` control so the node can stay compact while still matching the larger text-switch range.
- `AUNMultiNegPrompt` can sync its visible negative count from an upstream selector connected to `which_negative`, keeping paired positive/negative selector setups aligned.

### Fixed

- Restored safer workflow compatibility for `AUNMultiNegPrompt` by preserving the legacy serialized widget order while expanding the node to 20 prompt slots.
- Fixed `AUNMultiNegPrompt` frontend layout and visibility handling so hidden prompt fields collapse correctly and the last visible multiline field no longer overlaps the `which_negative` control.

### Notes

- `AUNMultiNegPrompt` is now intended for manual negative-prompt entry that follows the selected index from `AUNRandomTextIndexSwitch` or similar selector nodes.

## [2.1.4] - 2026-04-26

### Added

- New `AUNWildcardAddToPrompt` node for adding randomized wildcard-driven text into prompts.
- New local `wildcards` starter library and selector workflow so users can begin with bundled wildcard files and customize them in-place.

### Changed

- Added a dedicated wildcard selector UI for `AUNWildcardAddToPrompt` and simplified the node so it randomizes on each execution without exposing seed controls.
- Scoped wildcard discovery to the local `aun-comfyui-nodes/wildcards` folder so the node behaves as a self-contained AUN feature.

### Notes

- The bundled wildcard files are intended as starter content for new users and can be edited or removed without changing the node code.

## [2.1.3] - 2026-04-25

### Added

- New `AUNManualAutoImageSwitch` node to replace the older manual/auto image subgraph with one direct node that switches filename selection and image output together.

### Changed

- Added compact-mode overlay controls and inline color-picker UI for `AUNManualAutoImageSwitch`, including a node description hint for showing hidden overlay options.
- Published documentation for `AUNManualAutoImageSwitch` in the main README, docs index, and a dedicated node README.

### Fixed

- Worked around promoted subgraph widget issues by moving the manual/auto image behavior into a dedicated node instead of relying on a subgraph toggle.

### Notes

- `AUNManualAutoImageSwitch` is intended as the more reliable replacement for workflows that previously used a manual/auto image subgraph, especially when promoted widgets are involved.

## [2.1.2] - 2026-04-22

### Added

- Added release automation tooling for the repository:
  - `tools/release.ps1` for local version bump, changelog promotion, commit, and tag creation.
  - `RELEASE_CHECKLIST.md` to document the dev, release, and validation workflow.
  - A tag-triggered GitHub release workflow.

### Changed

- Updated `AUNManualAutoTextSwitch` to expose `ManualName` as a separate output and align the output contract with the selected/manual naming flow.

### Fixed

- Corrected `AUNManualAutoTextSwitch` input handling so `Filename` is treated as a required input instead of falling back to `None`.

### Notes

- This release introduced the first pass of the repository release automation used for GitHub and registry publishing.

## [2.1.1] - 2026-04-22

### Added

- New `AUNInputsRefineBasic` node for the lighter `Inputs Basic` workflow with an optional separate refine checkpoint output.
- New `AUNManualAutoTextSwitch` node for switching between an automatically generated filename and a manually entered name, while also outputting the current mode as a boolean for downstream workflow control.

### Changed

- Added published documentation for `AUNManualAutoTextSwitch` in the main README and docs index.

## [2.0.1] - 2026-04-18

### Fixed

- Cleaned up published package metadata so `dependencies` contains only valid Python package requirements.
- Removed the duplicate Comfy registry publish workflow to avoid repeated publish attempts from the same `pyproject.toml` change.

## [2.0.0] - 2026-04-18

## [1.1.0] - 2026-04-16

### Added

- New recommended V2 file-management and save workflow nodes:
  - `AUNPathFilenameV2`
  - `AUNPathFilenameVideoV2`
  - `AUNSaveImageV2`
  - `AUNSaveVideoV2`
- New preview/compatibility helper nodes for resolver-based workflows:
  - `AUNFilenameResolverPreviewV2`
- New `AUNInputsBasic` node.
- New shared `aun_path_filename_shared.py` helpers for combined path/filename building, token resolution, and name cropping.
- New README pages for the V2 builder, resolver, saver, and path/filename nodes.

### Changed

- File-management and save nodes are now labeled `Legacy` or `Recommended` in node search to make migration paths clearer.
- README and node docs now describe the V2 migration path, with `path_filename` as the primary end-to-end contract.
- Canonical placeholder syntax is now documented and supported as `%token%` across the newer builder flow, while older `%token` forms remain accepted for compatibility.
- `AUNPathFilename` and `AUNPathFilenameVideo` are now explicitly documented and presented as legacy builders for existing workflows.
- `AUNPathFilenameV2` now covers the richer image naming workflow directly, including manual/auto naming and `max_num_words`, so the preview builder is no longer needed for standard image workflows.
- `AUNPathFilenameVideoResolved` documentation was updated to reflect its resolved output contract and current sidecar schema.

### Fixed

- Restored backward compatibility for legacy image/video save and path nodes where widget ordering, older placeholder forms, or older workflow contracts could break saved graphs.
- Fixed image and video saver handling for `%date%`, `%time%`, and explicit `%date:<format>%` / `%time:<format>%` style placeholders.
- Fixed sidecar timestamp formatting so ComfyUI-style date patterns such as `yyyy-MM-dd` resolve correctly.
- Fixed video preview metadata so saved mp4/webm outputs return the correct preview format and normalized subfolder paths.
- Fixed the inline browser preview extension so `AUNSaveVideoV2` previews render the same way as the legacy video saver.
- Fixed sidecar output/schema inconsistencies so filename data stays in `filename` and redundant standalone `extension` fields are no longer emitted in the updated preview/V2 flow.
- Fixed `AUNSaveImage` and `AUNSaveVideo` token replacement so both canonical `%token%` and legacy `%token` placeholders resolve correctly.

### Notes

- Legacy nodes remain available for older workflows.
- The V2 family is the recommended non-breaking migration path for new workflows.

## [0.1.0] - 2026-01-12

### Added

- Dependency support for easier installs:
  - `requirements.txt` (runtime deps like `piexif`, `opencv-python-headless`, `imageio-ffmpeg`)
  - `install.py` (ComfyUI-Manager friendly dependency installer)
- README documentation for VHS `Video Combine` integration via `vhs_patch.py`
- **AUNRandomTextIndexSwitch**: New combined node that merges `AUNRandomIndexSwitch` and `AUNTextIndexSwitch` functionality
  - Generates index via Select/Increment/Random modes
  - Selects from up to 20 text inputs (with `visible_inputs` to reduce socket clutter)
  - Outputs selected text, label, and generated index
  - Includes JavaScript extension for automatic input labeling based on connected node titles
  - Executes on workflow queue for proper timing

### Updated

- `AUNSaveVideo`: optional-import handling for `cv2`/`piexif` and safer ffmpeg fallback
- `AUNSaveImage`: `piexif` is now optional (non-PNG still saves without EXIF insertion)
- `KSamplerInputs`: removed unused heavy imports to reduce dependency surface
- **README.md**: Added documentation for the new `AUNRandomTextIndexSwitch` node
- **docs/AUNRandomTextIndexSwitch_README.md**: Comprehensive documentation for the new node
- **AUN_text_index_switch_labels.js**: Extended to support the new combined node for automatic input labeling

### Technical Changes

- Node registration updated in `__init__.py`
- JavaScript extensions enhanced for broader node support
- Improved input widget handling for labeling functionality

## Previous Versions

_For changes prior to this changelog, see individual node comments and commit history._
