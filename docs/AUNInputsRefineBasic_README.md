# AUNInputsRefineBasic

Purpose

- Lightweight all-in-one setup node for a basic generation pipeline with optional refinement-model output.
- Loads a checkpoint, applies optional SpeedLoRA and clip skip, creates an empty latent batch, and exposes a separate refine model when needed.

Inputs

- Model loading: `ckpt_name`, `refine_ckpt`, `speed_lora`, `speed_lora_model`, `speed_lora_strength`, `clip_skip`
- Sampling controls: `sampler`, `scheduler`, `cfg`, `steps`, `seed`
- Latent sizing: `width`, `height`, `aspect_ratio`, `aspect_mode`, `batch_size`

Outputs

- `MODEL`, `CLIP`, `VAE`, `MODEL REFINE`
- `ckpt name`, `ckpt name refine`
- `sampler`, `scheduler`, `cfg`, `steps`
- `latent`
- `width`, `height`, `seed`, `batch size`

Notes

- `refine_ckpt` loads a separate checkpoint for refinement. When it is set to `None`, the node reuses the main model as the refine model.
- `aspect_ratio` can override the manual `width` and `height` values.
- `aspect_mode` can keep dimensions as-is, swap them, or randomize the orientation.
- This node is the lighter companion to `AUNInputsRefine` when you want refine-model support without the filename and saver-related outputs.
