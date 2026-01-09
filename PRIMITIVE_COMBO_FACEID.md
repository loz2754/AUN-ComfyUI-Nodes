# Using a Primitive (Combo) with AUN IPadapter Inputs

This short guide shows how to drive combo (dropdown) fields in `AUN IPadapter Inputs` using a Primitive node, with filtering and iteration controls. It focuses on the `faceID_weight_type` input, but the same approach applies to other combo inputs like `FaceID_preset`.

## What happens when you connect a Primitive to a combo

When a Primitive node (STRING) is connected to a combo input, its UI changes to three controls:

1) Selection dropdown
- Shows the currently allowed values (after filtering). Pick one when using "fixed" mode.

2) Control After Generate
- fixed: always use the selected item
- random: pick a random item from the filtered list each run
- increment: advance to the next item in the filtered list on each run (wraps around)
- decrement: move backward on each run (wraps around)

3) Filter field (supports lists and regex)
- Constrains which items appear in the dropdown and are considered by random/increment/decrement
- Accepts comma-separated terms and/or slash-delimited regex:
  - Include (contains): `portrait`
  - Exclude: `-SD1.5 only`
  - Regex include: `/pattern/` (use `/pattern/i` for case-insensitive)
  - Regex exclude: `-/pattern/`
  - Combine with commas: `portrait, -/SD1\.5 only/i`
- Use anchors for exact matches: `^...$`

## faceID_weight_type: allowed values

From `AUNIPadapterInputs.py`:

- linear
- ease in
- ease out
- ease in-out
- reverse in-out
- weak input
- weak output
- weak middle
- strong middle
- style transfer
- composition
- strong style transfer

## Cycle only "weak input" and "ease in"

- Connect a Primitive (STRING) to `faceID_weight_type` on `AUN IPadapter Inputs`.
- Filter (3rd control): `^(weak input|ease in)$` as regex, so enter:
  - `/^(weak input|ease in)$/`
- Control After Generate (2nd control): `increment` (this will toggle each Generate)
- Selection dropdown (1st control): pick your starting item (e.g., `weak input`)

Notes:
- Matching is exact. The regex above ensures only those two values are eligible.
- With two items and `increment`, it alternates on each run.
- Add `i` to ignore case if needed: `/^(weak input|ease in)$/i`

## More examples (filters)

- Portrait-only FaceID presets (contains): `/portrait/i`
- Include portraits but exclude SD1.5-only: `/portrait/i, -/SD1\.5 only/i`
- Exact two specific presets: `/^(FACEID|FACEID PLUS V2)$/i`
- Only SDXL-only preset (contains): `/SDXL only/i` or `/UNNORM/i`

## Tips and troubleshooting

- If the filtered list is empty, the dropdown will show no items. Loosen or fix your filter (often a missing escape like `SD1\.5`).
- When a combo is connected, the native dropdown on the target node may gray out—this is expected; the connected Primitive value takes precedence.
- You can still use a plain Primitive (STRING) with an exact label (no combo UI), but the combo-enabled Primitive gives you better iteration controls.

## Reference

- File: `AUN_nodes/AUNIPadapterInputs.py`
- Inputs covered here: `faceID_weight_type` (and similarly `FaceID_preset`)
