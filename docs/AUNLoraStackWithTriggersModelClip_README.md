# AUNLoraStackWithTriggersModelClip — LoRA Stack With Triggers (Model+Clip)

Purpose: Apply multiple LoRAs in order with per-slot trigger words, separate model and clip strengths, and optional CLIP passthrough.

## Inputs

- `model` (MODEL): Base model to patch.
- `num_slots` (INT): Number of active and visible slots.
- `apply_stack` (BOOLEAN): If off, the node returns the input model unchanged and clears all LoRA-derived text outputs.
- `trigger_joiner` (STRING): Separator used between trigger entries.
- `dedupe_triggers` (BOOLEAN): Remove repeated trigger entries while preserving order.

### Optional inputs

- `clip` (CLIP): Optional CLIP input. When connected, each active slot applies both model and clip strengths.
- `base_prompt` (STRING): Optional text input appended after all active trigger words.

### Per-slot inputs

For each slot `N` up to the internal maximum:

- `lora_N`: LoRA file for that slot.
- `strength_model_N`: Model strength for that slot.
- `strength_clip_N`: Clip strength for that slot when `clip` is connected.
- `enabled_N`: Enable or disable the slot.
- `trigger_N`: Trigger words for that slot.

## Outputs

- `MODEL`: Patched model after all active LoRAs are applied in slot order.
- `CLIP`: Patched CLIP when connected, otherwise passthrough `None`.
- `labels` (STRING): Active LoRA labels joined with `+`. Blank when the stack is off or empty.
- `trigger_words` (STRING): Joined trigger text from active slots. Blank when the stack is off, empty, or no active slot has trigger text.
- `trigger_prompt` (STRING): Trigger text combined with `base_prompt`. When no active trigger words are present, this passes through `base_prompt` unchanged.
- `prompt_without_triggers` (STRING): Plain `base_prompt` passthrough, for cases like filenames where you want prompt text without injected trigger words.

## Compact UI notes

- The node supports Normal and Compact display modes.
- Compact mode shows only `apply_stack` plus each active slot's `lora`, `strength_model`, `strength_clip`, and `enabled` widgets.
- Slots above `num_slots` are hidden and ignored by the backend.
