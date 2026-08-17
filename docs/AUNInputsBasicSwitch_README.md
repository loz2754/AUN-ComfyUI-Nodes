# AUNInputsBasicSwitch — Inputs Basic + Prompt Switch

Purpose

- All-in-one node that fuses a text index switch with `AUN Inputs Basic`: pick one of up to 20 text slots and load the checkpoint, latent, and sampler settings in a single node — no connection between the switch and the loader is needed at all.
- The selected text is scanned for `key=value` tokens (`model`, `sampler`, `scheduler`, `cfg`, `steps`, `seed`); present tokens override the matching loader widgets and are removed from the text output.

Inputs

- Index generation (same as `AUNTextIndexSwitch5`): `minimum`, `maximum`, `mode` (`Select`, `Increment`, `Random`, `Range`), `index`, `slot_count`, `range`
- Per-slot text: `text1` to `text20` (STRING, multiline). Inputs beyond `slot_count` are hidden.
- Model loading: `ckpt_name`, `speed_lora`, `speed_lora_model`, `speed_lora_strength`, `clip_skip`
- Sampling controls: `sampler`, `scheduler`, `cfg`, `steps`, `seed`
- Latent sizing: `width`, `height`, `aspect_ratio`, `aspect_mode`, `batch_size`, `megapixels`, `multiple`

Outputs

- `MODEL`, `CLIP`, `VAE`
- `ckpt name`
- `sampler`, `scheduler`, `cfg`, `steps`
- `latent`
- `width`, `height`, `seed`, `batch size`
- `text` (STRING): the selected text with known tokens removed
- `label` (STRING): the first line of the cleaned text (or the slot key when empty)
- `index` (INT): the resolved index value after mode processing

Token overrides

| Key | Value type | Effect |
|---|---|---|
| `model` | STRING | Overrides `ckpt_name` (resolved case-insensitively against installed checkpoints; falls back to the widget value if no match is found). |
| `sampler` | STRING | Overrides `sampler` when non-empty. |
| `scheduler` | STRING | Overrides `scheduler` when non-empty. |
| `cfg` | FLOAT | Overrides `cfg` when present. |
| `steps` | INT | Overrides `steps` when present. |
| `seed` | INT | Overrides `seed` when present. |

Any other `key=value` tokens are left untouched in the text output.

Modes

Identical to `AUNTextIndexSwitch5`: `Select`, `Increment`, `Random`, and `Range` behave the same way.

Example

- A single slot with:

  ```
  sdxl_base_v1.0.safetensors sampler=dpmpp_2m scheduler=karras cfg=4.5 steps=20 seed=42
  A masterpiece, highly detailed
  ```

  loads the checkpoint and sampler settings from the tokens, outputs the prompt text ("A masterpiece, highly detailed") with the label "A masterpiece...", and `index` = the selected slot.

Notes

- Compact mode (double-click or right-click → "AUN: Compact mode") hides the text slots and index controls while keeping the loader widgets and the resolution overlay.
- Existing workflows using `AUNTextIndexSwitch5`, `AUN Inputs Basic`, or the pipe pair are unaffected; this is an additional, self-contained option.
- The node re-executes when any text slot or loader widget changes in `Select` mode (dynamic modes re-execute every run, as in the base switch).
