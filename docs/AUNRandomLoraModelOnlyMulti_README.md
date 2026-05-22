# AUNRandomLoraModelOnlyMulti — Random Multi-LoRA Model Loader

Purpose: Experimental multi-prompt LoRA loader where a `prompt_index` determines which 1–3 LoRAs to apply. Each prompt can have different LoRAs with independent strengths and trigger words, all applied sequentially to the same model+clip.

## Inputs

### Required (global)

- `model` (MODEL): Base model to patch.
- `prompt_index` (INT 1–20): Which prompt's LoRA set to apply.
- `num_prompts` (INT 1–20): Number of prompts to configure and display.
- `apply_lora` (BOOLEAN): When disabled, returns the input model unchanged but still resolves metadata.

### Optional inputs

- `clip` (CLIP): Optional CLIP input for per-slot clip strength control.
- `base_prompt` (STRING, force-input): Optional prompt text appended after trigger words.
- `selected_LoRAs` (STRING, force-input): Pass-through that concatenates upstream `<lora:...>` tags with locally generated tags, enabling chained LoRA stacks.
- `label` (STRING, force-input): Optional label displayed on the node (e.g., from a TextIndexSwitch4 label output).

### Per-prompt inputs (1–20)

Each prompt has 3 LoRA slots. For prompt `P`, slot `S`:

- `p{P}_lora{S}`: LoRA file for that slot (`None` = empty).
- `p{P}_strength_model{S}` (FLOAT): Model strength for that LoRA (-20 to 20).
- `p{P}_strength_clip{S}` (FLOAT): Clip strength for that LoRA when CLIP is connected.
- `p{P}_trigger{S}` (STRING): Trigger words for that LoRA slot.

## Outputs

- `MODEL`: Patched model after all active LoRAs for the selected prompt are applied sequentially.
- `CLIP`: Patched CLIP when connected, otherwise passthrough.
- `selected LoRAs` (STRING): Generated `<lora:name:strength_model:strength_clip>` tags for active slots in the selected prompt, concatenated with any upstream `selected_LoRAs`. Passes through unchanged when `apply_lora` is off.
- `index` (INT): The resolved prompt index.
- `labels` (STRING): LoRA labels joined with commas.
- `trigger words` (STRING): Trigger text from all active slots in the selected prompt.
- `trigger + prompt` (STRING): Trigger text combined with `base_prompt`.

## Compact UI notes

- Double-click the node header to toggle between Normal and Compact modes.
- Compact mode shows only the active prompt's LoRA slots with model strength, clip strength, and trigger words.
- **Drag-to-swap**: Drag a LoRA label onto another slot's label to swap their values (LoRA selection, strengths, and triggers). This provides quick reordering without manually editing each field.
- Footer displays trigger words for the selected prompt with smart text wrapping.
- Right-click menu options:
  - **Hide/Show clip strength**: Toggle visibility of clip strength inputs globally (applies in both full and compact modes).
  - **Hide/Show footer**: Toggle the footer display; hiding it shrinks the node to minimum height.

## Common setups

- Connect `AUNTextIndexSwitch4.index` to `prompt_index` so a text selector drives which LoRA set is active.
- Use `selected_LoRAs` chaining when you want multiple nodes to contribute LoRA tags (e.g., base stack + conditional overrides).
- Combine with `AUNMultiUniversal` for dashboard-style control of which prompt/LoRA sets are active.

## Notes

- This node is experimental and may have API changes in future releases.
- Each prompt's LoRAs are applied sequentially (slot 1 → slot 2 → slot 3) to the same model+clip chain.
- Empty slots (`None`) within a prompt are skipped — only non-empty LoRA slots contribute tags or patches.
