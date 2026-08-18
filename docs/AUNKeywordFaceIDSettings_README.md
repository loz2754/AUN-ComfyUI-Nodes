# AUNKeywordFaceIDSettings — Keyword FaceID Settings

Purpose: Select FaceID/IPAdapter settings based on keyword matching in a reference phrase. Keywords are matched as substrings (case-insensitive by default); first match wins (top-to-bottom order). Outputs are **typed** so they can be wired straight into the exposed inputs of an `IPAdapterUnifiedLoader + IPAdapterSimple + IPAdapterUnifiedLoaderFaceID + IPAdapterFaceID` combination (e.g. a `FaceIDPreset` subgraph).

## Inputs

### Required (global)

- `visible_inputs` (INT 2–6): How many keyword/settings presets are active. Row `N` uses `keywordN` + its settings.
- `case_sensitive` (BOOLEAN): When enabled, keyword matching is case-sensitive.

### Optional inputs

- `reference_phrase` (STRING, force-input): Text to scan for keywords (substring match).

### Defaults (used when no keyword matches)

- `preset_default` (COMBO): `IPAdapterUnifiedLoader` preset.
- `weight_default` (FLOAT -1..3): `IPAdapterSimple` weight.
- `weight_type_default` (COMBO): `IPAdapterSimple` weight_type (`standard`, `prompt is more important`, `style transfer`).
- `preset_faceid_default` (COMBO): `IPAdapterUnifiedLoaderFaceID` preset.
- `lora_strength_default` (FLOAT 0..1): FaceID LoRA strength.
- `weight_faceid_default` (FLOAT -1..3): `IPAdapterFaceID` weight.
- `weight_faceidv2_default` (FLOAT -1..5): `IPAdapterFaceID` weight_faceidv2.
- `weight_type_faceid_default` (COMBO): `IPAdapterFaceID` weight_type (full `WEIGHT_TYPES` list).

### Per-preset inputs (1–6)

Each preset row `N` has a `keywordN` (STRING) plus the same 8 setting widgets as the defaults block: `presetN`, `weightN`, `weight_typeN`, `preset_faceidN`, `lora_strengthN`, `weight_faceidN`, `weight_faceidv2N`, `weight_type_faceidN`. Combo dropdowns use the exact option lists and FLOAT ranges of the target IPAdapter nodes, so wired values always pass validation.

## Outputs

- `preset` (STRING), `weight` (FLOAT), `weight_type` (STRING)
- `preset_faceid` (STRING), `lora_strength` (FLOAT)
- `weight_faceid` (FLOAT), `weight_faceidv2` (FLOAT), `weight_type_faceid` (STRING)
- `matched_keyword` (STRING): The matched keyword (empty when nothing matches).
- `matched_index` (INT): The matched preset row (0 when nothing matches).
- `settings_text` (STRING): The matched settings rendered as a Python-style tuple, e.g. `('PLUS FACE (portraits)', 0.3, 'prompt is more important', 'FACEID PLUS V2', 0.5, 0.8, 1.8, 'linear')` — handy for file naming.

## Behavior

- Substring matching against `reference_phrase`, first match wins (top-to-bottom).
- Falls back to the `*_default` settings when no keyword matches.
- Re-executes on every run (`IS_CHANGED` → `nan`) so a changed phrase re-evaluates the settings.
- Emits `AUN_keyword_faceid_settings_executed` WebSocket events carrying the resolved settings; the compact-mode footer consumes them.

## Compact UI notes

- Double-click the node header (or right-click → **AUN: Compact mode**) to toggle compact mode.
- In compact mode only `visible_inputs`, `case_sensitive`, `reference_phrase`, and the 8 default widgets are hidden; the node shrinks to a title + footer.
- The footer at the node's foot shows the matched row's settings (e.g. `#3 keyword | preset=PLUS FACE w=0.3 wt=... | preset=FACEID PLUS V2 ls=0.5 ...`), or a dimmed `no keyword match`. It is always visible in compact mode and is fed by the node's own execution results.
- Right-click menu: **AUN: Compact mode / Show all widgets**, **AUN: Hide/Show match box**.