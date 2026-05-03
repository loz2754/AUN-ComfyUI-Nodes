# AUNRandomLoraModelOnly — Random LoRA Model Loader

Purpose: Pick one LoRA from up to 10 configured slots, apply it to the incoming model, and output the selected LoRA name plus trigger text.

## Inputs

- `model` (MODEL): Base model to patch.
- `mode`:
  - `Select`: use the exact slot chosen by `select`
  - `Increment`: cycle through the active slot range
  - `Random`: pick a random slot in the active range
  - `Range`: cycle through the explicit indices listed in `range`
- `select` (INT): Slot used in `Select` mode.
- `minimum` / `maximum` (INT): Inclusive bounds for `Increment` and `Random`.
- `range` (STRING): Comma-separated values or ranges such as `1,3,5-6`.
- `apply_lora` (BOOLEAN): If off, the node still resolves the slot and metadata but returns the input model unchanged.
- `strength_model` (FLOAT): LoRA strength applied to the model.
- `base_prompt` (STRING): Optional text appended after trigger words.

### Per-slot inputs

For each slot `N`:

- `lora_N`: LoRA file for that slot.
- `trigger_N`: Optional trigger text for that slot.

## Outputs

- `MODEL`: Patched model.
- `selected_lora` (STRING): Selected LoRA filename.
- `index` (INT): Resolved slot index.
- `prefixed_label` (STRING): Index plus shortened LoRA name.
- `trigger_words` (STRING): Trigger text for the selected slot.
- `prefixed_trigger_prompt` (STRING): Trigger text combined with `base_prompt`.

## Compact UI notes

- The node supports Normal and Compact display modes.
- Compact mode shows the current LoRA in a footer.
- A right-click option can enable extra LoRA info in the footer, showing strength and trigger words.
- Runtime footer updates for `Random`, `Increment`, and `Range` are driven by backend events, so the compact display follows the actually selected LoRA.

## Common setups

- Use `selected_lora` or `prefixed_label` for filenames and audit trails.
- Use `prefixed_trigger_prompt` to combine LoRA trigger words with your base prompt text.
- Enable the compact footer info option when you want an rgthree-style quick reference without reopening the node.
