# AUNInputsRefine

Purpose

Deprecation note: this full node is retained for compatibility, but new workflows should prefer `AUNInputsRefineBasic` (for checkpoint refine) or `AUNInputsDiffusersRefineBasic` (for diffusion refine) together with `AUN Save Image V2` for a simpler and more flexible UX.

- Full all-in-one setup node for a generation pipeline with optional refine-model output and filename preparation controls.
- Loads a checkpoint, applies optional SpeedLoRA and clip skip, creates an empty latent batch, and prepares naming-related outputs used by save flows.

Inputs

- Model loading: `ckpt_name`, `refine_ckpt`, `speed_lora`, `speed_lora_model`, `speed_lora_strength`, `speed_lora_full_both`, `speed_lora_ratio`, `clip_skip`
- Sampling controls: `sampler`, `scheduler`, `cfg`, `steps`, `seed`
- Latent sizing: `width`, `height`, `aspect_ratio`, `aspect_mode`, `batch_size`
- Naming and save prep: `MainFolder`, `ManualName`, `name_mode`, `prefix`, `date_format`, `crop`, `words`, optional `auto_name`

Outputs

- `MODEL`, `CLIP`, `VAE`, `MODEL REFINE`
- `ckpt name`, `ckpt name refine`
- `sampler`, `scheduler`, `cfg`, `steps`
- `latent`
- `width`, `height`, `seed`
- `MainFolder`, `Filename`, `prefix`, `date format`, `batch size`, `name mode`, `speed lora ratio`

Notes

- `refine_ckpt` loads a separate checkpoint for refinement. When it is set to `None`, the node reuses the main model as the refine model.
- `speed_lora_ratio` splits the configured SpeedLoRA strength between the main and refine models.
- `speed_lora_full_both` overrides that split and applies the full SpeedLoRA strength to both models.
- Existing workflows saved before this widget change may need the SpeedLoRA-related inputs checked or reconnected after loading.
- `aspect_ratio` can override the manual `width` and `height` values.
- `aspect_mode` can keep dimensions as-is, swap them, or randomize the orientation.
- `name_mode` chooses between `auto_name` and `ManualName` before optional word cropping is applied.
