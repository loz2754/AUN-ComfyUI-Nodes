# AUNInputsBasic

Purpose

- Lightweight all-in-one setup node for a basic generation pipeline.
- Loads a checkpoint, applies optional SpeedLoRA and clip skip, and creates an empty latent batch with common sampler settings.

Inputs

- Model loading: `ckpt_name`, `speed_lora`, `speed_lora_model`, `speed_lora_strength`, `clip_skip`
- Sampling controls: `sampler`, `scheduler`, `cfg`, `steps`, `seed`
- Latent sizing: `width`, `height`, `aspect_ratio`, `aspect_mode`, `batch_size`

Outputs

- `MODEL`, `CLIP`, `VAE`
- `ckpt name`
- `sampler`, `scheduler`, `cfg`, `steps`
- `latent`
- `width`, `height`, `seed`, `batch size`

Notes

- `aspect_ratio` can override the manual `width` and `height` values.
- `aspect_mode` can keep dimensions as-is, swap them, or randomize the orientation.
- This node is a simpler companion to `AUNInputs` when you want the common setup pieces without the broader workflow packaging.
