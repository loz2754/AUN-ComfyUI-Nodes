# AUNInputsDiffusersRefineBasic

Purpose

- Lightweight all-in-one setup node for a diffusion-only generation pipeline with optional refine-model output.
- Loads a standalone diffusion UNet, shared CLIP and VAE companions, applies optional SpeedLoRA, creates an empty latent batch, and exposes a separate refine diffusion model when needed.

Inputs

- Model loading: `diffusion_name`, `refine_diffusion_name`, `clip_name`, `clip_type`, `vae_name`
- SpeedLoRA: `speed_lora`, `speed_lora_model`, `speed_lora_strength`, `speed_lora_full_both`, `speed_lora_ratio`
- Sampling controls: `sampler`, `scheduler`, `cfg`, `steps`, `seed`
- Latent sizing: `width`, `height`, `aspect_ratio`, `aspect_mode`, `batch_size`

Outputs

- `MODEL`, `CLIP`, `VAE`, `MODEL REFINE`
- `model name`, `model name refine`
- `sampler`, `scheduler`, `cfg`, `steps`
- `latent`
- `width`, `height`, `seed`, `batch size`, `speed lora ratio`

Notes

- `refine_diffusion_name` loads a separate refinement diffusion model. When it is set to `None`, the node reuses the main model as the refine model.
- `clip_name` and `vae_name` are shared across the main and refine models, matching the existing refine-basic pattern of a single CLIP/VAE output pair.
- `speed_lora_ratio` splits the configured SpeedLoRA strength between the main and refine models.
- `speed_lora_full_both` overrides that split and applies the full SpeedLoRA strength to both models.
- The latent is passed through `fix_empty_latent_channels` when available so diffusion-only models with nonstandard latent channel counts still receive a compatible empty latent.
- `aspect_ratio` can override the manual `width` and `height` values.
- `aspect_mode` can keep dimensions as-is, swap them, or randomize the orientation.
