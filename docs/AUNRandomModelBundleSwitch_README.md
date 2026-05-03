# AUNRandomModelBundleSwitch — Model and Text Selector

Purpose: Select one model slot and its optional text/label metadata using `None`, `Select`, `Increment`, `Random`, or `Range` modes.

## Inputs

- `mode`:
  - `None`: output `base_model` unchanged when connected
  - `Select`: use the exact slot chosen by `select`
  - `Increment`: cycle through the active slot range
  - `Random`: pick a random slot in the active range
  - `Range`: cycle through the explicit indices listed in `range`
- `slot_count` (INT 1–10): Number of active slots.
- `select` (INT): Slot used in `Select` mode.
- `minimum` / `maximum` (INT): Inclusive bounds for `Increment` and `Random`.
- `range` (STRING): Comma-separated values or ranges such as `1,3,5-6`.
- `base_model` (optional MODEL): Used when `mode = None`.

### Per-slot optional inputs

For each slot `N`:

- `model_N` (MODEL): Model input for that slot.
- `text_N` (STRING): Optional text metadata paired with that slot.
- `label_N` (STRING): Optional label shown in the node outputs and compact UI.

## Outputs

- `MODEL`: Selected model output.
- `selected_text` (STRING): Text metadata from the chosen slot.
- `index` (INT): Resolved slot index. This is useful for driving `AUNMultiUniversal` or `AUNMultiGroupUniversal` in `index-driven` mode.
- `label` (STRING): Label for the selected slot, or a fallback label if no custom label is set.

## Compact UI notes

- The node supports Normal / Compact / Micro display modes in the frontend.
- Compact modes show a footer with the current slot and label.
- In Micro mode, unlinked slot inputs are pruned from the canvas for a smaller footprint.

## Common setups

- Feed `index` into `AUNMultiUniversal.Index` to collapse/bypass/mute node sets based on the selected model slot.
- Feed `index` into `AUNMultiGroupUniversal.Index` to drive group-level control from the same selection.
- Use `label_N` to make the compact footer more readable than raw slot numbers.
