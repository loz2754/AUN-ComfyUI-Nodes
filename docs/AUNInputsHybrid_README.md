# AUNInputsHybrid — Inputs Hybrid

Purpose: A combined “loader + common inputs” node.

It can either:
- Load a classic checkpoint bundle (UNet+CLIP+VAE), or
- Load a diffusion-only UNet and pair it with explicit CLIP + VAE files,

…and then emit the same downstream inputs you’d typically want for sampling (model/clip/vae, sampler, scheduler, cfg, steps, latent, size, seed, and filename helpers).

Category: `AUN Nodes/Loaders+Inputs`

## Inputs

### Optional

- `auto_name` (STRING, forceInput): Used when `name_mode` is Auto.

### Required (high level)

- `model_source` (Checkpoint | Diffusion model)
- `ckpt_name` (choice): Checkpoint file (used when `model_source=Checkpoint`).
- `diffusion_name` (choice): Diffusion model file (used when `model_source=Diffusion model`).
- `clip_name` (choice): CLIP file (diffusion-model mode).
- `clip_type` (choice): CLIP architecture/type to use (diffusion-model mode).
- `vae_name` (choice): VAE file (diffusion-model mode).
- `clip_skip` (INT): CLIP layer skip (negative values; applied in both modes).

### Sampling + latent

- `sampler` (choice)
- `scheduler` (choice)
- `cfg` (FLOAT)
- `steps` (INT)
- `width` / `height` (INT): Used when `aspect_ratio=custom`.
- `aspect_ratio` (choice): Presets override width/height.
- `aspect_mode` (Random | Swap | Original): May swap width/height.
- `batch_size` (INT)
- `seed` (INT)

### Naming/output helpers

- `MainFolder` (STRING)
- `ManualName` (STRING)
- `name_mode` (BOOLEAN): Manual vs Auto naming.
- `prefix` (STRING)
- `date_format` (choice)
- `crop` (BOOLEAN): Limit filename to first N words.
- `words` (INT)

### SpeedLoRA (optional feature)

- `speed_lora` (BOOLEAN)
- `speed_lora_model` (choice)
- `speed_lora_strength` (FLOAT)

## Outputs

- `MODEL`, `CLIP`, `VAE`
- `model name` (STRING)
- `sampler`, `scheduler`
- `cfg` (FLOAT), `steps` (INT)
- `latent` (LATENT)
- `width`, `height`, `seed` (INT)
- `MainFolder` (STRING)
- `Filename` (STRING)
- `prefix` (STRING)
- `date format` (STRING)
- `batch size` (INT)
- `name mode` (BOOLEAN)

## Notes

- In “Diffusion model” mode, the node requires `diffusion_name`, `clip_name`, and `vae_name` to be real choices (not the “<no … found>” placeholders).
- The node builds an empty latent and may attempt to match latent channel count to the loaded model.
