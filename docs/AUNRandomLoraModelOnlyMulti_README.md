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
  - **AUN: Setup prompts…**: Opens the full-screen prompt setup dialog (see below).
  - **Hide/Show clip strength**: Toggle visibility of clip strength inputs globally (applies in both full and compact modes).
  - **Hide/Show footer**: Toggle the footer display; hiding it shrinks the node to minimum height.

## Prompt Setup dialog

The node stays small; configure every prompt in a scrollable dialog instead. Open it via the **⚙ Setup** (gear icon) button in the node's title bar (top-right), or the right-click menu item **AUN: Setup prompts…**.

- Lists prompts `1..num_prompts`, each with its 3 LoRA slots (LoRA picker, model/clip strengths, trigger words, enable toggle) — no more flipping `prompt_index` to edit each prompt.
- **Per-prompt label**: give each prompt a name (e.g. `anime girl`) for easy identification; shown in the dialog and in the node footer.
- **Copy / Paste / Clear** buttons on each prompt duplicate or wipe a prompt's full 3-slot configuration.
- **Export JSON / Import JSON**: **Export JSON** saves the setup under the name you type in the **Set name** field (prefilled with the node title) and copies it to the clipboard. Saved sets live in the config folder (`ComfyUI/user/aun/<name>.json`); saving over an existing name asks for confirmation. **Import JSON** pastes a setup from the clipboard. Use the **Load saved…** dropdown to load a saved set from the config folder (✕ deletes the selected one); loading a set also fills the name field so a later export updates that set in place.
- The **Prompts +/−** stepper adjusts `num_prompts` directly from the dialog.
- All edits write straight to the node's existing widgets, so existing workflows and wiring are unaffected.

## Common setups

- Connect `AUNTextIndexSwitch4.index` to `prompt_index` so a text selector drives which LoRA set is active.
- Use `selected_LoRAs` chaining when you want multiple nodes to contribute LoRA tags (e.g., base stack + conditional overrides).
- Combine with `AUNMultiUniversal` for dashboard-style control of which prompt/LoRA sets are active.

## Notes

- This node is experimental and may have API changes in future releases.
- Each prompt's LoRAs are applied sequentially (slot 1 → slot 2 → slot 3) to the same model+clip chain.
- Empty slots (`None`) within a prompt are skipped — only non-empty LoRA slots contribute tags or patches.
