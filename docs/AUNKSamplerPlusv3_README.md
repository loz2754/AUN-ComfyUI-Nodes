# AUNKSamplerPlusv3 — AUN KSampler Plus v3

Purpose: Progressive two-pass sampler with optional latent-space upscaling, optional pixel-space upscaling, and an optional final refinement pass.

## High-level flow

- **Base image**: First sampling pass at the input latent resolution.
- **Latent upscaled** *(if enabled)*: Latent is upscaled by `ratio` and sampled again.
- **Image upscaled** *(optional)*: Pixel-space upscale of the base image.
- **Both upscaled** *(when latent + image upscale are both enabled)*: Pixel-upscale the latent-upscaled decode, then resample using a mirrored second-pass schedule to reduce drift.
- **Refined image** *(optional)*: Re-encode and do a small finishing pass on the selected upscale source.

## Inputs

### Required (core sampling)

- `vae` (VAE): Used for encode/decode between pixels and latent.
- `model` (MODEL): Diffusion model.
- `seed` (INT, input): Seed for reproducibility.
- `positive` / `negative` (CONDITIONING): Prompt conditioning.
- `latent_image` (LATENT): Starting latent (use Empty Latent for txt2img).
- `denoise` (FLOAT): First pass denoise (1.0 for full generation; lower for img2img).

### Required (step scheduling)

- `steps_total` (INT): Total steps across both passes.
- `steps_first` (INT): Steps for the first pass.
- `start_step_second` (INT): Second pass start control:
  - `-1`: denoise-fraction mode (uses `upscaling_denoise`).
  - `0`: start from step 0.
  - `steps_first`: continue after pass 1.
- `sampler_name` / `scheduler`: Sampler + scheduler for both passes.
- `cfg` (FLOAT): CFG for the first pass.
- `cfg_latent_upscale` (FLOAT): CFG for the latent-upscale (second) pass.

### Required (latent upscaling)

- `latent_upscale` (BOOLEAN): Enable/disable progressive two-pass sampling.
- `upscale_method` (nearest-exact / bilinear / area / bicubic / bislerp): Method for latent upscaling.
- `ratio` (FLOAT): Latent upscale ratio between passes.
- `upscaling_denoise` (FLOAT): Second pass denoise amount (used when `start_step_second = -1`).

### Required (pixel-space upscaling)

- `image_upscale` (BOOLEAN): Enable pixel-space upscaling.
- `image_upscale_method` (includes lanczos): Resize method.
- `image_upscale_model` (upscale model name or `None`): Optional AI upscaler.
- `image_upscale_ratio` (FLOAT): Pixel-space upscale ratio.

### Required (final refine)

- `image_upscale_refine` (BOOLEAN): Enable final refinement pass.
- `img_refine_steps` (INT): Steps for refine.
- `img_refine_denoise` (FLOAT): Denoise for refine.

### Other

- `verbose` (BOOLEAN): Print detailed timing/logs.

## Outputs

- `Base image` (IMAGE)
- `Image upscaled` (IMAGE)
- `Latent upscaled` (IMAGE)
- `Both upscaled` (IMAGE)
- `Refined image` (IMAGE)
- `LATENT` (LATENT): Final latent.
- `Upscaled type` (STRING): One of `Both upscaled`, `Latent upscaled`, `Image upscaled`, `No upscale` (and appends ` Refined` when refine is enabled).

## Tips

- If you want a classic single-pass KSampler, set `latent_upscale = No`.
- Typical progressive settings: `ratio` around `1.5–2.0` and `upscaling_denoise` around `0.5–0.7`.
- If you use `start_step_second = -1`, tune `upscaling_denoise`; otherwise the schedule continues from the chosen start step.

## Common setups

### 1) Progressive “hi-res” in latent space (recommended starting point)

- `latent_upscale`: Yes
- `ratio`: 1.5–2.0
- `steps_total`: 25–40
- `steps_first`: 10–16
- `start_step_second`: `-1`
- `upscaling_denoise`: 0.55–0.70
- `cfg_latent_upscale`: often same as `cfg` (or slightly lower if it over-sharpens)

### 2) Pixel upscale only (no progressive second pass)

Useful when you want a single-pass sample but still want a bigger image.

- `latent_upscale`: No
- `image_upscale`: Yes
- `image_upscale_ratio`: 1.5–2.0
- `image_upscale_model`: pick an upscaler (or `None` for pure resize)

### 3) Both upscaled + small final refine

- `latent_upscale`: Yes
- `image_upscale`: Yes
- `image_upscale_refine`: Yes
- `img_refine_steps`: 3–8
- `img_refine_denoise`: 0.15–0.35

This is a good “final polish” recipe when the upscaled result looks slightly soft.

### 4) Img2img / partial denoise workflows

- Feed an encoded latent via `latent_image` (or use an img2img pipeline that produces a latent)
- Lower `denoise` (e.g. 0.3–0.7)
- Keep `upscaling_denoise` modest (e.g. 0.35–0.60) to preserve structure
