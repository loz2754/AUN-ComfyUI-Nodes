# AUNMultiUniversal — AUN Node Controller

Purpose: A multi-slot “dashboard” that can Bypass, Mute, and/or Collapse sets of nodes, targeted by **node IDs** or **node titles**. The UI reacts instantly via a frontend extension; the node also returns boolean states per slot.

## Inputs

### Required (global)

- `mode`:
  - `Bypass`: disable targets by bypassing
  - `Mute`: disable targets by muting
  - `Collapse`: collapse/expand targets
  - `Bypass+Collapse`: apply both disable + collapse
- `slot_count` (INT 1–20): Number of active slots.
- `control_mode`:
  - `manual`: use the slot toggles directly
  - `index-driven`: activate the slot matching the external `Index` input
- `Index` (INT 0–20): Used when `control_mode = index-driven`. `0` means no slot is active.
- `toggle_restriction`:
  - `default`: no extra rules
  - `max one`: allow at most one active slot
  - `always one`: ensure at least one slot is active
  - `iterate`: cycles through slots each execution
  - `random`: randomly picks one slot each execution
- `show_outputs` (BOOLEAN): Controls whether output pins are shown (UI behavior).

### Per-slot controls (1–20)

Each slot has:

- `label_N` (STRING): Label for the slot.
- `targets_N` (STRING): Node IDs or Titles to control (comma / semicolon / newline separated). Tooltip also mentions `!` or `-` prefixes for exclusion; the frontend handles the targeting rules.
- `switch_N` (BOOLEAN): Slot state (active vs controlled by `mode`).
- `target_type_N` (ID / Title): Interpret `targets_N` as node IDs or node titles.

### Global switch

- `AllSwitch` (BOOLEAN): When ON, forces all slots active.

## Outputs

- `Labels` (STRING): Space-separated labels of active slots.
- `Switch 1` … `Switch 20` (BOOLEAN): Slot states.

## Notes

- Slot processing is limited to `slot_count`; higher-numbered slots are ignored and output `False`.
- In `iterate` and `random` modes, the node forces re-execution and also asks the frontend to update visible switches.
- In `index-driven` mode, the frontend mirrors the external `Index` value onto the visible slot toggles so it remains obvious which slot is active.
- `toggle_restriction` only matters in `manual` mode.
- `AllSwitch` is a manual-mode control; it is suppressed when `control_mode = index-driven`.
- If a target is included in multiple slots, “active” wins over “inactive” when resolving overlaps.

## Common setups

- Create 3–8 slots for major workflow regions (Loaders / Samplers / Refiners / Savers).
- Use `target_type = ID` for robustness when node titles change.
- Connect `AUNRandomModelBundleSwitch.index` to `Index` when you want the node to follow an external selector.
