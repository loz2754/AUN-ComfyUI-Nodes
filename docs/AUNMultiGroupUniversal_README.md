# AUNMultiGroupUniversal — AUN Group Controller

Purpose: One “control panel” node for ComfyUI Groups. Lets you bypass, mute, collapse, or bypass+collapse groups using multiple configurable slots.

## Inputs

- `mode` (Bypass / Mute / Collapse / Bypass+Collapse): What action to apply to *inactive* groups.
- `slot_count` (INT, 1–20): How many control slots are used.
- `toggle_restriction` (default / max one / always one / iterate / random): Optional rules for which slots can be active.
  - `iterate`: cycles the active slot on each run.
  - `random`: picks a random active slot on each run.
- `use_all_groups` (BOOLEAN): When ON, the UI can show toggles for every group in the graph instead of manual slots.
- `show_outputs` (BOOLEAN): When ON, exposes boolean output pins for each slot.

### Per-slot controls (up to 20)

For each slot `i` (1–20):

- `group_name_i` (STRING): Group title(s) for this slot.
  - You can provide multiple names separated by newline, comma, or semicolon.
  - Prefix a name with `!` or `-` to exclude (e.g. `image, !load`).
- `switch_i` (BOOLEAN): Slot toggle.
  - ON = Active 🟢
  - OFF = controlled by `mode`

- `AllSwitch` (BOOLEAN):
  - ON = force all slots Active 🟢
  - OFF = use individual `switch_i`

## Outputs

- `Active Groups` (STRING): A convenience string of active group names.
- `Switch 1` … `Switch 20` (BOOLEAN): Slot states (useful for downstream routing).

## Behavior notes

- When a group appears in multiple slots, **Active wins** over inactive.
- `toggle_restriction` can override your switches at run-time for iterate/random use cases.
- This node drives updates through ComfyUI’s frontend so changes are applied immediately to the canvas.

## Tips

- Use `mode = Bypass+Collapse` for “turn off and tidy” dashboards.
- If you need per-node targeting (IDs or titles), use the `AUN Node State Controller` instead.
