# AUNInputs — AUN Inputs

Purpose: An all-in-one “setup” node that loads a checkpoint (MODEL/CLIP/VAE), picks sampler/scheduler/settings, creates an empty latent, and produces consistent naming outputs for downstream savers.

## Inputs

### Required

- `ckpt_name` (checkpoint file): Checkpoint to load.
- `speed_lora` (BOOLEAN): Enable SpeedLoRA.
- `speed_lora_model` (lora file): SpeedLoRA file to apply when enabled.
- `speed_lora_strength` (FLOAT): Strength for SpeedLoRA.
- `clip_skip` (INT, negative): CLIP layer skip (default -1).
- `sampler` (sampler list): Sampler algorithm.
- `scheduler` (scheduler list): Scheduler/noise schedule.
- `cfg` (FLOAT): CFG scale.
- `steps` (INT): Steps.
- `width` / `height` (INT): Used when `aspect_ratio = custom`.
- `aspect_ratio` (dropdown): Preset sizes or `custom`.
- `aspect_mode` (Random / Swap / Original):
  - `Random`: 50/50 swap width/height
  - `Swap`: always swap
  - `Original`: keep as chosen
- `batch_size` (INT): Batch size for the empty latent.
- `seed` (INT): Seed.
- `MainFolder` (STRING): Output folder label for downstream use.
- `ManualName` (STRING): Manual name when `name_mode = Manual`.
- `name_mode` (BOOLEAN: Auto/Manual): Auto uses `auto_name` input; Manual uses `ManualName`.
- `prefix` (STRING): Optional prefix for filenames.
- `date_format` (dropdown): Date/time formatting string.
- `crop` (BOOLEAN): Enable word cropping for the chosen name.
- `words` (INT): Number of words to keep when `crop` is enabled.

### Optional

- `auto_name` (STRING, input): Name used when `name_mode` is Auto (commonly fed from a prompt/title node).

## Outputs

This node outputs a lot of pins for convenience:

- `MODEL`, `CLIP`, `VAE`
- `ckpt name` (STRING): checkpoint base name (no extension)
- `sampler`, `scheduler`, `cfg`, `steps`
- `latent` (LATENT): Empty latent with shape `[batch_size, 4, height/8, width/8]`
- `width`, `height`, `seed`
- `MainFolder`, `Filename`, `prefix`, `date format`, `batch size`, `name mode`

## Notes

- `sampler` and `scheduler` outputs are typed to be broadly connectable (wildcard-like) to reduce friction when wiring graphs.
- `clip_skip` is applied to the loaded CLIP model via `clip.clip_layer(clip_skip)`.
- SpeedLoRA is optional; when enabled it loads the selected LoRA weights and applies them to MODEL/CLIP.

## Common setups

- Feed `MODEL/CLIP/VAE/latent` into your sampler stack.
- Feed `Filename`, `MainFolder`, `seed`, `steps`, `cfg`, `sampler`, `scheduler`, and `ckpt name` into AUN savers (or Path/Filename nodes) for consistent naming.
