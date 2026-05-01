# AUNInputsDiffusersBasic

Purpose

- Lightweight all-in-one setup node for diffusion-only model loading.
- Loads a standalone diffusion UNet plus explicit CLIP and VAE files, applies optional SpeedLoRA, and creates an empty latent batch for downstream samplers.

Inputs

- Model loading: `diffusion_name`, `clip_name`, `clip_type`, `vae_name`, `speed_lora`, `speed_lora_model`, `speed_lora_strength`
- Sampling controls: `sampler`, `scheduler`, `cfg`, `steps`, `seed`
- Latent sizing: `width`, `height`, `aspect_ratio`, `aspect_mode`, `batch_size`

Outputs

- `MODEL`, `CLIP`, `VAE`
- `model name`
- `sampler`, `scheduler`, `cfg`, `steps`
- `latent`
- `width`, `height`, `seed`, `batch size`

Notes

- This is the diffusion-only companion to `AUNInputsBasic`.
- Unlike `AUNInputsDiffusers`, it does not output filename, folder, prefix, or date-format values.
- The latent is passed through `fix_empty_latent_channels` when available so diffusion-only models with nonstandard latent channel counts still receive a compatible empty latent.
- `aspect_ratio` can override the manual `width` and `height` values.
- `aspect_mode` can keep dimensions as-is, swap them, or randomize the orientation.
