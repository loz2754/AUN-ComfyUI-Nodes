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
- `clip` (CLIP, optional): Optional CLIP input. When connected, each slot applies both model and clip strengths.
- `base_prompt` (STRING, optional external input): Optional text appended after trigger words. This is exposed as a force-input style connection so prompt chaining stays available without leaving an always-visible multiline widget in compact mode.
- `selected_LoRAs` (STRING, optional external input): Pass-through input that concatenates upstream `<lora:...>` tags with locally generated tags, enabling chained LoRA stacks.

### Per-slot inputs

For each slot `N`:

- `lora_N`: LoRA file for that slot.
- `trigger_N`: Optional trigger text for that slot.

## Outputs

- `MODEL`: Patched model.
- `selected LoRAs` (STRING): Generated `<lora:name:strength_model:strength_clip>` tags for active slots, concatenated with any upstream `selected_LoRAs` input. Passes through the upstream value unchanged when `apply_lora` is off or no LoRAs are selected.
- `index` (INT): Resolved slot/index.
- `labels` (STRING): LoRA labels joined with commas.
- `trigger_words` (STRING): Trigger text for the selected slot(s).
- `trigger + prompt` (STRING): Trigger text combined with `base_prompt`.

## Compact UI notes

- The node supports Normal and Compact display modes.
- Compact mode shows the current LoRA in a footer.
- A right-click option can enable extra LoRA info in the footer, showing strength and trigger words.
- Runtime footer updates for `Random`, `Increment`, and `Range` are driven by backend events, so the compact display follows the actually selected LoRA.
- Right-click menu options:
  - **Hide/Show clip strength**: Toggle visibility of clip strength inputs globally (applies in both full and compact modes).
  - **Hide/Show footer**: Toggle the trigger words footer; hiding it shrinks the node to minimum height.
- The optional `base_prompt` input no longer leaves a stray compact-mode connection target outside the node body.

## Common setups

- Use `selected LoRAs` or `labels` for filenames and audit trails.
- Use `trigger + prompt` to combine LoRA trigger words with your base prompt text.
- Enable the compact footer info option when you want an rgthree-style quick reference without reopening the node.
