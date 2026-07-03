# AUN Custom Nodes Changelog


## [Unreleased]

### Added

### Changed

### Fixed

### Notes

## [2.5.0] - 2026-07-04

### Added

- New node: `AUNAnyIndexSwitch` — dynamic input labeling with "Node Title" / "Slot Label" modes; auto-label updates on connection/disconnection and title-change polling.
- New shared module: `AUNResolutionHelper` — centralized aspect ratio resolution with ratio-based presets (1:1, 16:9, etc.), megapixels targeting, and multiple-of rounding.
- New shared module: `web/aun_lora_dropdown_shared.js` — clickable LoRA label dropdowns with tree/folder browser in compact overlays.
- `AUNGetConnectedNodeTitles`: `visible_inputs` widget (1-10) to control displayed input sockets with dynamic socket management and connected-link confirmation dialog.
- All Inputs nodes (`AUNInputs`, `AUNInputsBasic`, `AUNInputsDiffusers`, `AUNInputsDiffusersBasic`, `AUNInputsDiffusersRefineBasic`, `AUNInputsHybrid`, `AUNInputsRefine`, `AUNInputsRefineBasic`): `megapixels` and `multiple` widgets for ratio-based resolution calculation.
- `AUNLoraStackWithTriggers`: `selected_LoRAs` passthrough input/output that generates `<lora:filename:strength>` tags.
- `AUNImageLoadResize`: `OUTPUT_NODE = True` with `width`/`height` instance attributes exposed.
- `AUNGetConnectedNodeTitles` Python backend: lazy evaluation support on optional inputs.

### Changed

- All 8 Inputs nodes: refactored to use shared `AUNResolutionHelper` instead of duplicated preset maps and inline dimension logic; aspect ratio options now include ratio modes (1:1, 16:9, etc.) alongside fixed presets.
- Resolution overlay (`web/AUN_inputs_resolution_overlay.js`): extended to cover all 8 Inputs nodes (was `AUNInputsBasic` only); now reads resolved width/height from `app.nodeOutputs` post-execution for accurate display with `api.status` listener.
- `AUNGetConnectedNodeTitles` frontend: complete rewrite with dynamic socket count (1-10), auto-label updates, title-change polling, and `selected_title` output preservation on socket changes.
- `AUNLoraStackWithTriggers`: return types reordered — `selected LoRAs` added between MODEL and labels; `prompt` output removed.
- LoRA stack compact overlays (`AUNLoraStackWithTriggers`, `AUNLoraStackWithTriggersModelClip`, `AUNRandomLoraModelOnlyMulti`): LoRA labels now clickable with dropdown tree browser via `makeLoraLabelClickable`.
- `AUN_add_to_prompt_multi` compact mode: footer rendering uses `x0`/`x1` bounds for consistent padding; font size normalized to 12px; background changed to semi-transparent black.
- `AUN_wildcard_add_to_prompt`: increased compact mode padding (bottom padding 30→68) and maxHeight (42→60px) for better text display.

### Fixed

- `AUNLoraStackWithTriggers` / `AUNLoraStackWithTriggersModelClip`: LoRA basename extraction regex corrected (`.[^.]+# AUN Custom Nodes Changelog


 → `\.[^.]+# AUN Custom Nodes Changelog


) to properly strip file extensions.
- Resolution overlay linked value read: uses `origin_slot` instead of hardcoded index 0; `parseFloat` instead of `Number` for numeric conversion.
- `AUNLoraStackWithTriggers` / `AUNLoraStackWithTriggersModelClip`: empty lora value string (`""`) now correctly treated as "None".
- `AUNGetConnectedNodeTitles` `IS_CHANGED` now always returns `time.time()` to force re-execution.

### Notes
## [2.4.3] - 2026-06-27

### Added

- `AUNAddToPromptMulti`: `forceInput` on `master_prompt` widget, tooltip text, resolved prompt footer in compact mode showing addon-only output text via `onDrawForeground`
- `AUNTextIndexSwitch3`: capped minimum/maximum widgets for `AUNTextIndexSwitch4`

### Changed

- `AUNAddToPromptMulti`: `master_prompt` parameter defaults to `None` instead of `""`; output returns UI dict with `addon_only` prompt alongside `result` tuple; final prompt separator changed from `", "` to `" "`; `IS_CHANGED` always returns `time.time()` to force re-execution on every queue (avoids stale cache on mode changes)
- `AUNWildcardAddToPrompt`: `populated_text` hidden/cleared when mode is `off`, restored when switching to `on`/`random`

### Fixed

- `AUNTextIndexSwitch3`: preserve existing widget options object when updating index `max`/`min` (avoid replacing shared reference that could break other node type options)
- `AUNLoraStackWithTriggers` / `AUNLoraStackWithTriggersModelClip`: drag-drop reorder no longer clears trigger words mid-swap via `__AUN_stackSwapping` guard flag
- All LoRA nodes (`AUNRandomLoraModelOnly`, `AUNRandomLoraModelOnlyMulti`, `AUNLoraStackWithTriggers`, `AUNLoraStackWithTriggersModelClip`): changing a LoRA selection now clears associated trigger words from that slot
- `AUNLoraStackWithTriggersModelClip`: `resolveStackTriggersForDisplay` returns `null` when `apply_stack` is off, hiding trigger words from overlay footer
- `AUNRandomLoraModelOnly` / `AUNRandomLoraModelOnlyMulti`: `resolveTriggersForDisplay` returns `null` when `apply_lora` is off

### Notes
## [2.4.2] - 2026-06-19

### Added

- New `docs/example_workflows/` folder with embedded workflow PNG and standalone JSON demonstrating PromptCycler + Random Multi-LoRA.
- New `#### LoRA` sub-section in README between File Management and Image; moved Extract Power LoRAs, Random LoRA Model Loader, Random Multi-LoRA Model Loader, and LoRA Stack With Triggers Model Clip out of Utility.

### Changed

- README grammar/spelling fixes and subject-verb agreement corrections.
- Added "Prompt Cycling with Multi-LoRA Selection" example workflow section.
- Removed "(Experimental)" tag from Random Multi-LoRA Model Loader in README.

### Fixed

- `AUNTextIndexSwitch3` compact mode text edit popup now positions near the node instead of centered on the screen.

### Notes

## [2.4.1] - 2026-06-17

### Added

- Registered `AudioInputOptions` node in `__init__.py` (was defined in `AUNSaveVideo.py` but never exposed to the node registry).

### Changed

- Moved LoRA nodes (`AUNLoraLoaderModelOnlyFromString`, `AUNLoraStackWithTriggers`, `AUNLoraStackWithTriggersModelClip`, `AUNRandomLoraModelOnly`, `AUNRandomLoraModelOnlyMulti`, `AUNRandomModelBundleSwitch`) from `AUN Nodes/Utility` to `AUN Nodes/Loras` for better menu organization.
- Moved `AUNKSamplerPlusV2` from `AUN Nodes/Sampling` to `AUN Nodes/Deprecated/KSampler`.
- Moved `AUNSaveImage` from `AUN Nodes/Image` to `AUN Nodes/Deprecated/Image`.
- Moved `AUNSaveVideo` and `AUNSaveVideoV2` from `AUN Nodes/Video` to `AUN Nodes/Deprecated/Video`.
- `AUNSaveImage` display name: "(Legacy)" → "(Deprecated)".
- `AUNSaveVideo` display name: "(Legacy)" → "(Deprecated)".
- `AUNSaveVideoV2` display name: "(Recommended)" → "(Deprecated)".
- `AUNSaveImageV2` display name: removed "(Recommended)" tag.
- `AUNBoolean` display name: "Boolean" → "Random Boolean".
- `AUNKSamplerPlusV2` display name: now tagged "(Deprecated)".
- `AUNKSamplerPlusv4` display name: "KSampler Plus V4" → "AUN KSampler 2-Model".
- `AUNRandomLoraModelOnlyMulti` display name: removed "(Experimental)" tag.
- `JoinVideosInDirectory` display name: now tagged "(Deprecated)".
- Updated descriptions on `AUNKSamplerPlusv3`, `AUNKSamplerPlusv4`, and `AUNRandomLoraModelOnlyMulti`.
- Major README.md rewrite with friendlier language, better explanations, and deprecation callouts.

### Fixed

- `AudioInputOptions` category set to `AUN Nodes/Deprecated/Video` (was missing a category).

### Notes

## [2.4.0] - 2026-06-14

### Added

- **LoRA Info dialog**: Per-image CivitAI metadata (seed, steps, CFG, sampler, model, prompts) shown on previews.
- **LoRA Info dialog**: Trained words show source indicators — `[C]` for CivitAI and `[M]` for metadata with color-coded badges.
- **LoRA Info dialog**: Editable user fields section with Strength Min, Strength Max, and Additional Notes; values persist to `{lora}.aun-info.json` sidecar via Save/Cancel buttons.
- **LoRA Info dialog**: Video preview support with `preload="metadata"` and `playsinline`.
- **LoRA Info dialog**: Cancel button alongside Save edits during inline editing.

### Changed

- **LoRA Info dialog**: Local + remote previews merge (deduped by `src`, up to 6 total) instead of OR replacement.
- **LoRA Info dialog**: Previews displayed in a 2-column grid, positioned below user fields section.
- **LoRA Info dialog**: Metadata section starts collapsed with matching button text ("▾ Less..." / "▸ More...").
- **LoRA Info dialog**: Larger fonts, more padding, wider cards for metadata pills.
- **AUNMultiGroupUniversal / AUNMultiUniversal**: `show_AllSwitch` now hides the "All Groups" master toggle in compact groups mode (individual per-group toggles remain visible).

### Fixed

- **LoRA Info dialog**: Name field no longer skipped when title equals filename stem.
- **LoRA Info dialog**: Strength Min/Max fields always appear even without CivitAI data.
- **LoRA Info dialog**: Saving cleared Name/Notes values now persists correctly (empty string stored instead of `null`).
## [2.3.0] - 2026-06-14

### Added

- New node: **AUNStringListBuilder** — compile up to 20 multiline strings into an `AUN_STRING_LIST` with dynamic input visibility; node auto-resizes based on `num_inputs`.
- New node: **AUNStringListIndex** — select a string from an `AUN_STRING_LIST` by 1-based index.
- Added `"Mute+Collapse"` mode to **AUNMultiUniversal** and **AUNMultiGroupUniversal** — mutes then bypasses target nodes, bypassing collapse for a clean canvas.
- Added `show_AllSwitch` toggle widget to **AUNMultiUniversal** and **AUNMultiGroupUniversal** — keeps the AllSwitch visible even in compact mode.
- Added `slot_count` widget to **AUNMultiBypassIndex** and **AUNMultiMuteIndex** — control how many of the 20 node ID sets are active; unused slots are hidden.
- Expanded **AUNMultiMuteIndex** from 10 to 20 node ID sets, matching AUNMultiBypassIndex.

### Changed

- **AUNMultiBypassIndex** now clears mute state before applying bypass, ensuring nodes don't remain muted after being bypassed.
- **AUNMultiMuteIndex** now clears bypass state before applying mute, ensuring nodes don't remain bypassed after being muted.
- Simplified canvas transform monitor in LoRA stack JS extensions — removed unstable-frame detection in favor of direct event listeners on the DOM canvas.
- Added scrollable footer styling to **AUNLoraStackWithTriggersModelClip** compact overlay.
- Deleted legacy JS files (`AUNMultiBypassIndex.js`, `AUN_multi_bypass_index_instant.js`) — functionality consolidated into backend.

### Fixed

### Notes
## [2.2.22] - 2026-06-10

### Fixed
- Fixed `AUNRandomLoraModelOnlyMulti` compact mode label overlay not updating during Random/Increment/Range execution — `traceLinkValue` now respects `__AUN_lastExecutedIndex` from the execution event rather than the stale widget value.

### Notes

## [2.2.21] - 2026-06-10

### Added
- Added per-slot enable/disable toggles to `AUNRandomLoraModelOnlyMulti` compact mode — disabled slots are skipped during execution and their trigger words are excluded from the combined output.

### Changed
- Reordered label resolution in `AUNRandomLoraModelOnly` compact mode Select mode to prefer the widget value over the execution index, ensuring the displayed label matches what the user sees selected.
- Reordered upstream label lookup in `AUNRandomLoraModelOnlyMulti` to check switch/index widget values before falling back to cached execution outputs.

### Fixed
- Fixed trigger de-duplication in `_combine_trigger_and_base` across all four LoRA nodes (`AUNLoraStackWithTriggers`, `AUNLoraStackWithTriggersModelClip`, `AUNRandomLoraModelOnly`, `AUNRandomLoraModelOnlyMulti`) — now deduplicates across both trigger words and base prompt together instead of only within trigger words.
- Fixed `AUNTextIndexSwitch3` compact mode index widget update so `AUNTextIndexSwitch4` nodes in compact mode now correctly update their index widget visual state.

### Notes
## [2.2.20] - 2026-06-09

### Added

### Changed

- **Completely rewrote `AUNAddToPromptMulti` compact mode overlay** from a DOM-based approach (HTML elements injected into the page) to a native canvas-based rendering system using `onDrawForeground`. This eliminates DOM overlay positioning issues, flickering, and synchronization problems with canvas pan/zoom operations. The new implementation draws mode badges, addon labels, and order badges directly on the node canvas with proper hit-area detection via `onMouseDown`.

### Fixed

### Notes

## [2.2.19] - 2026-06-07

### Added

- Added `hide_preview` toggle to `AUNImageSingleBatch3` — when enabled, suppresses the image preview in the ComfyUI UI while still returning the image tensor for downstream nodes.
- Added frontend extension `web/AUN_image_single_batch_hide_preview.js` to handle preview hiding and display the loaded filename in a styled text widget with ellipsis truncation.

### Changed

- Refactored `AUNImageSingleBatch3` to inherit from `PreviewImage`, enabling native ComfyUI image preview infrastructure and consistent output behavior via `OUTPUT_NODE = True`.
- Updated `AUNImageSingleBatch3` to always return structured UI/result payloads (consistent with ComfyUI output-node conventions), replacing the previous bare-tuple return path.

### Fixed

### Notes

## [2.2.18] - 2026-06-06

### Added

### Changed

- Updated `AUNPromptCycler` to use `"manual"` as the default cycle mode.
- Refactored `AUNTextIndexSwitch4` to use a dictionary (`_node_states`) for persistent state management (index and range index) per node instance, replacing class-level variables.
- Improved `AUNTextIndexSwitch3` compact overlay by using the widget's native `inputEl` in the edit popup, ensuring dynamic prompt features like autocomplete work correctly.
- Updated model short names in `model_utils.py`, updated `"fucktasticRealCheckpointPony_10"` to `"FcktasticRealPny1"`, and added `"fucktasticRealCheckpointPony_52"` as `"FcktasticRealPny52"`.

### Fixed

### Notes

## [2.2.16] - 2026-05-30

### Added

### Changed

### Fixed

- Fixed `AUNTextIndexSwitch3` compact overlay hiding incorrectly — `isNodeCovered` now uses full-node AABB overlap with z-order (`index`) matching the proven approach in `AUNRandomLoraModelOnlyMulti`, and skips collapsed nodes so they no longer occlude the overlay.

### Notes
## [2.2.15] - 2026-05-29

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

## [2.2.13] - 2026-05-25

### Fixed

- Fixed `AUNAddToPromptMulti` compact overlay flickering and vanishing issues by optimizing DOM updates and ensuring correct element references during repositioning.

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
