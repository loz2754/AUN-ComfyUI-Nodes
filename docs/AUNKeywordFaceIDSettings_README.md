# AUNKeywordFaceIDSettings — Keyword FaceID Settings

Purpose: Select FaceID/IPAdapter settings based on keyword matching in a reference phrase. Keywords are matched as substrings (case-insensitive by default); first match wins (top-to-bottom order). Outputs are **typed** so they can be wired straight into the exposed inputs of an `IPAdapterUnifiedLoader + IPAdapter + IPAdapterUnifiedLoaderFaceID + IPAdapterFaceID` combination (e.g. a `FaceIDPreset` subgraph).

## Inputs

### Required (global)

- `visible_inputs` (INT 2–6): How many keyword/settings presets are active. Row `N` uses `keywordN` + its settings.
- `case_sensitive` (BOOLEAN): When enabled, keyword matching is case-sensitive.
- `manual_preset` (COMBO `1`–`6`): Which preset row is the active bundle. Always has a value — there is no separate default bundle. Selecting a row also works for rows outside `visible_inputs`, since all 6 rows' widgets always exist.
- `match_keywords` (COMBO `Yes`/`No`): `Yes` — keywords in `reference_phrase` are matched; the first matching row's settings are used, falling back to `manual_preset` when nothing matches. `No` — keywords are ignored; `manual_preset` is always used.

### Optional inputs

- `reference_phrase` (STRING, force-input): Text to scan for keywords (substring match).

### Per-preset inputs (1–6)

Each preset row `N` has a `keywordN` (STRING) plus the same 8 setting widgets: `presetN`, `weightN`, `weight_typeN`, `preset_faceidN`, `lora_strengthN`, `weight_faceidN`, `weight_faceidv2N`, `weight_type_faceidN`. Combo dropdowns use the exact option lists and FLOAT ranges of the target IPAdapter nodes, so wired values always pass validation.

`keywordN` is a **comma-separated list**: any one keyword matching the reference phrase activates the row (e.g. `alice, bob, carol` — three names sharing one preset). `matched_keyword` reports the specific keyword that matched.

## Outputs

- `preset` (COMBO), `weight` (FLOAT), `weight_type` (COMBO)
- `preset_faceid` (COMBO), `lora_strength` (FLOAT)
- `weight_faceid` (FLOAT), `weight_faceidv2` (FLOAT), `weight_type_faceid` (COMBO)

The four combo outputs (`preset`, `weight_type`, `preset_faceid`, `weight_type_faceid`) are typed as their option lists so they connect to `COMBO` widget inputs (such as a subgraph's exposed proxy widgets) and pass validation. They carry plain strings at runtime — the exact option text from the dropdowns.
- `matched_keyword` (STRING): The matched keyword (empty when no keyword matches or `match_keywords=No`).
- `matched_index` (INT): The preset row actually used (1–6). When `match_keywords=Yes` and a keyword matches, this is the matched row; otherwise it is the `manual_preset` value.
- `settings_text` (STRING): The active settings rendered as a Python-style tuple, e.g. `('PLUS FACE (portraits)', 0.3, 'prompt is more important', 'FACEID PLUS V2', 0.5, 0.8, 1.8, 'linear')` — handy for file naming.
- `preset_number` (STRING): The active preset as `"FaceIDPreset-1"` through `"FaceIDPreset-6"`.

## Behavior

- Substring matching against `reference_phrase`, first match wins (top-to-bottom). Each row's `keywordN` may be a comma-separated list; the row activates when any listed keyword matches, and `matched_keyword` is the specific keyword that matched.
- `match_keywords = Yes`: keywords are matched; the first matching row wins. When nothing matches, falls back to `manual_preset` row.
- `match_keywords = No`: keywords are ignored; `manual_preset` row is always used.
- Re-executes on every run (`IS_CHANGED` → `nan`) so a changed phrase re-evaluates the settings.
- Emits `AUN_keyword_faceid_settings_executed` WebSocket events carrying the resolved settings; the compact-mode footer consumes them.

## Compact UI notes

- Double-click the node header (or right-click → **AUN: Compact mode**) to toggle compact mode.
- In compact mode `manual_preset` and `reference_phrase` stay visible; all other widgets (`visible_inputs`, `case_sensitive`, `match_keywords`, per-row widgets) are hidden. All output slots are collapsed to a single point.
- The footer shows the active bundle: `#3 keyword ('PLUS FACE (portraits)', ...)` when a keyword matched, or `preset 3 ('...')` when using the manual preset (no keyword match or `match_keywords=No`).
- Right-click menu: **AUN: Compact mode / Show all widgets**, **AUN: Hide/Show match box**.