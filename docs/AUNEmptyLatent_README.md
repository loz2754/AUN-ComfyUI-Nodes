# AUNEmptyLatent — AUN Empty Latent

Purpose: Create an empty LATENT of a chosen size (with optional aspect presets, random swapping, and batching).

## Inputs

### Required

- `width` (INT): Latent target width (used when `aspect_ratio = custom`).
- `height` (INT): Latent target height (used when `aspect_ratio = custom`).
- `aspect_ratio` (dropdown): Preset sizes or `custom`.
- `mode` (random / fixed):
  - `random`: 50% chance to swap width/height
  - `fixed`: use chosen dimensions
- `swap_dimensions` (Yes / No): Explicit swap (applies in `fixed` mode).
- `batch_size` (INT): Number of latent samples.
- `seed` (INT): Seed value (passed through; does not currently affect the latent tensor contents).

## Outputs

- `latent` (LATENT): Empty latent with shape `[batch, 4, height/8, width/8]`.
- `width` (INT): Final width.
- `height` (INT): Final height.
- `seed` (INT): Seed (pass-through).

## Notes

- This is a convenient alternative to ComfyUI’s built-in Empty Latent when you want presets + swap logic.
