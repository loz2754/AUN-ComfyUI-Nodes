# AUN Nodes Documentation Implementation Summary

## ✅ Completed Documentation Enhancements

### 📋 Strategy & Planning
- ✅ Documentation strategy established (`DOCUMENTATION_STRATEGY.md`)
- ✅ Three-tier approach: tooltips, descriptions, detailed docs
- ✅ Consistent standards and templates in place

### 🏷️ Tooltips Added (Highlights)
Enhanced the following nodes with comprehensive parameter tooltips:

## AUN KSampler PlusV3 (Updated)
- Purpose: Progressive two-pass sampler with pixel-space upscale and optional final refinement, designed to maintain composition while increasing detail.
- Flow: Base (first pass) → Latent upscaled (second pass) → Both upscaled (pixel-upscale decoded latent, then resample mirroring second pass) → Refined image (optional).

- Key Inputs:
	- `steps_first` (INT): Steps for the first pass. When `latent_upscale` is Off, this is used for the single pass.
	- `steps_total` (INT): Total schedule length. Used to compute second pass in continue or fraction modes.
	- `start_step_second` (INT): -1 = fraction mode (uses `upscaling_denoise`), 0 = start at 0, `steps_first` = continue after pass 1. Both-upscaled mirrors this schedule.
	- `cfg`, `cfg_latent_upscale` (FLOAT): CFG for base and latent-upscale passes, respectively.
	- `latent_upscale` (BOOL): Enables latent upscale and second pass.
	- `ratio`, `upscale_method`: Latent upscale size and method.
	- `image_upscale` (BOOL), `image_upscale_ratio`, `image_upscale_method`, `image_upscale_model`: Pixel-space upscale controls.
	- `image_upscale_refine` (BOOL), `img_refine_steps`, `img_refine_denoise`: Controls for the optional final refinement.

- Outputs:
	- `Base image`: First pass decode.
	- `Latent upscaled`: Decode from second latent pass (or Base if `latent_upscale` is Off).
	- `Both upscaled`: If both upscales are enabled, pixel-upscale decoded latent → encode → resample mirroring second pass → decode. Fallbacks: Latent upscaled (if only latent), Image-upscaled from base (if only image), else Base.
	- `Refined image`: Refines `Both upscaled` when available, else `Image upscaled` (from base), else `Base`. If refinement is Off, equals the selected source.
	- `LATENT`: Latent output for downstream nodes (upscaled latent when enabled, else base samples).
	- `Upscaled type` (INT): Mapping → 4: Refined, 3: Both upscaled, 2: One upscaled (image or latent), 1: None.

- Usage notes:
	- `Upscaled type` helps routers/switches choose which image to use downstream without additional logic.
	- When integrating with older v2 graphs, this v3 maintains the same final two outputs: `LATENT` and `Upscaled type`.

- Tips:
	- To minimize change in Both-upscaled, prefer continue mode with a reasonable `start_step_second`, and align `cfg` with `cfg_latent_upscale`.
	- Large `upscaling_denoise` (fraction mode) or very large `ratio` will increase variation.
	- When `latent_upscale` is Off, use `steps_first` to control quality/time for single pass.

### Quick Examples
- Continue mode (mirrors schedule to reduce drift):
	- `latent_upscale = Yes`
	- `steps_total = 30`, `steps_first = 12`
	- `start_step_second = 12` (continue after pass 1)
	- `cfg = 7.5`, `cfg_latent_upscale = 7.5`
	- `ratio = 1.5`, `upscale_method = bicubic`
	- `image_upscale = Yes`, `image_upscale_ratio = 1.5`, `image_upscale_method = lanczos`
	- `image_upscale_refine = Optional`, `img_refine_steps = 4`, `img_refine_denoise = 0.25`

- Fraction mode (controlled variation at high res):
	- `latent_upscale = Yes`
	- `steps_total = 30`, `steps_first = 12`
	- `start_step_second = -1`, `upscaling_denoise = 0.5` (≈15 steps)
	- `cfg = 7.5`, `cfg_latent_upscale = 7.5`
	- `ratio = 1.5`, `upscale_method = bicubic`
	- `image_upscale = Yes`, `image_upscale_ratio = 1.5`, `image_upscale_method = lanczos`
	- `image_upscale_refine = Optional`, `img_refine_steps = 4`, `img_refine_denoise = 0.25`

---

## AUN MultiCollapse 3
- Purpose: Instantly collapse/expand up to three groups of nodes by ID, with optional toggle restriction like MultiBypass. AllSwitch is at the bottom and applies to all groups.

- Inputs:
	- `Switch1`, `Switch2`, `Switch3` (BOOLEAN): Per-group collapse toggles. On = Collapsed, Off = Expanded.
	- `node_ids_1`, `node_ids_2`, `node_ids_3` (STRING): Comma-separated node IDs per group, e.g., 5,12,23. 0 or empty is ignored.
	- `label_1`, `label_2`, `label_3` (STRING): Optional short notes to describe each ID line (render inline next to the toggle). Inputs hide automatically once filled; use the in-node "Show label & ID inputs" toggle to reveal/edit them.
	- `node_ids_1`, `node_ids_2`, `node_ids_3` (STRING): Comma-separated node IDs per group. These string fields also auto-hide after you enter anything other than `0`; toggle "Show label & ID inputs" to edit.
	- `AllSwitch` (BOOLEAN): Global collapse/expand for all configured IDs across all groups; ignores restrictions.
	- `toggleRestriction` (UI combo): Values `default`, `max one`, `always one`.
	  - `default`: No restriction.
	  - `max one`: Turning one On turns the others Off (last-clicked wins).
	  - `always one`: Ensures at least one switch stays On.

- Behavior:
	- Instant UI action: on toggle, nodes collapse/expand immediately in the canvas.
	- Backend sync: uses `AUN_set_collapse_state` with `{ node_id, collapse }` (handled by `AUN_set_collapse_state.js`).
	- No outputs: node returns nothing.

- Tips:
	- Enable ID badges to find node IDs quickly.
	- Use `AllSwitch` for global changes; restrictions apply only to `Switch1..3`.
	- For title-based group control, see `AUNSetCollapseStateGroup`.

---

## AUN MultiCollapse 6
- Purpose: Same instant behavior as MultiCollapse3, expanded to six switch + node ID pairs for larger control panels. Ideal when you want a single node to manage multiple thematic sections of a workflow.

- Inputs:
	- `Switch1` .. `Switch6` (BOOLEAN) control their respective `node_ids_1` .. `node_ids_6` (STRING) lists.
	- `label_1` .. `label_6` (STRING): Optional notes to annotate each line of IDs, rendered inline next to each toggle. Inputs auto-hide after you set text; flip the node’s "Show label & ID inputs" toggle to edit.
	- `node_ids_1` .. `node_ids_6` (STRING): Comma-separated node IDs per slot. These inputs hide once populated with non-zero values and reappear when you enable "Show label & ID inputs".
	- `AllSwitch` (BOOLEAN) globally collapses/expands all IDs; it always overrides restrictions.
	- `toggleRestriction` (UI combo): `default`, `max one`, `always one`. Defaults to `default` for this variant so slots act independently unless you opt in.

- Behavior:
	- Instant UI updates + backend sync via `AUN_set_collapse_state` events handled by `web/AUN_set_collapse_state.js`.
	- No outputs.

- Tips:
	- Use comma-separated ID lists to treat each switch as a logical bucket (e.g., "loaders", "preprocessors").
	- Pair with `AUNMultiBypass` or `AUNMultiMute` to keep state panels visually aligned (switch labels + AllSwitch conventions match).

---

- AUNRandomNumber
- AUNSwitchFloat
- AUNTextIndexSwitch / AUNTextIndexSwitch3
- AUNSaveImage
- AUNImageLoadResize
- AUNRandomIndexSwitch
- AUNRandomAnySwitch
- MainFolderManualName
- AUNPathFilename
- SaveVideoPathNode

### 📖 Node Descriptions Added (Highlights)
Added DESCRIPTION fields to key nodes:

- AUNKSamplerPlusv3 (legacy Plus/Progressive variants retired)
- AUNSaveImage / AUNSaveVideo
- AUNSetBypassState / AUNSetMuteState families
- AUNTextIndexSwitch series

### 🧰 New/Updated Control Nodes
- Added Mute suite: AUNSetMuteState, AUNSetMuteStateWithLabel, AUNSetMuteByTitle, AUNSetMuteStateGroup, AUNSetMuteStateGroupAdvanced
- Added MultiMute3 variant to mirror the three-slot MultiBypass3 layout for smaller mute panels
- Group controllers now include both single-switch and multi-toggle variants for bypass, mute, and collapse (plus the existing advanced presets)
- Collapse + Bypass combos available (standard + advanced)

## 📊 Coverage Status (Current)
- Nodes exported in `__init__.py`: 50+ (varies by branch)
- Tooltips coverage: in progress; high-use nodes covered
- Descriptions: many core nodes updated; ongoing for utilities
- Detailed READMEs: main overview complete; per-node docs for complex nodes pending

## 🔄 Next Steps
1. Expand tooltips for remaining utilities: extractors (model/widget/power loras), FaceIDLabelsSwitch
2. Add concise descriptions to: KSamplerInputs, AUNInputs, SwitchImageOutput, SingleLabelSwitch
3. Author short READMEs for complex control nodes (group bypass/mute advanced)
4. Periodically sync this summary when nodes are added/removed

## 🧹 Maintenance Notes
- Keep README categories in sync with `__init__.py`
- Remove references to removed nodes promptly
- Prefer accurate display names from `NODE_DISPLAY_NAME_MAPPINGS`

---

## AUN Boolean
- Purpose: Simple boolean switch for workflow control.
- Inputs:
	- `state` (STRING): Choices `True`, `False`, `Randomize`. Randomize re-evaluates each execution and may change between runs.
	- `label` (STRING, optional): Tag to identify the switch in your workflow.
- Outputs:
	- `Boolean` (BOOLEAN): Resolved boolean value.
	- `Label (when True)` (STRING): Outputs the label only if the boolean is True; otherwise outputs an empty string.
- Notes: When `state` is `Randomize`, the node signals it has changed on every run to avoid caching and produce a fresh random value.
