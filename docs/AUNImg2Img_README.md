# AUNImg2Img — AUN Img2Img

Purpose: A convenience switch node for running either txt2img (pass-through empty latent) or img2img (load+resize+VAE-encode an input image into latent space).

## Inputs

### Required

- `img2img` (BOOLEAN): Enable img2img mode.
- `denoise_strength` (FLOAT 0–1): Used when `img2img = On`.
- `new_width` / `new_height` (INT): Target bounds used when `img2img = On` (resizes preserving aspect ratio).
- `latent_width` / `latent_height` (INT, input): Latent dimensions from your latent-size source.
- `image` (dropdown): Input image file (supports upload).
- `max_num_words` (INT): Limits filename outputs (0 = unlimited).
- `vae` (VAE): VAE used to encode the image when in img2img mode.
- `empty_latent` (LATENT): Used when `img2img = Off`.

## Outputs

- `boolean` (BOOLEAN): Echoes `img2img`.
- `IMAGE` (IMAGE): Loaded (and resized, if img2img) image.
- `MASK` (MASK): Alpha-derived mask if present; otherwise zeros.
- `latent` (LATENT):
  - If img2img: encoded image latent
  - If txt2img: passes through `empty_latent`
- `filename` (STRING): Raw filename (no extension), optionally word-limited.
- `cleaned filename` (STRING): Cleaned filename.
- `width` / `height` (INT): Output dimensions (img2img uses computed resized dims; txt2img uses latent dims).
- `denoise strength` (FLOAT): In txt2img mode this is forced to `1.00`.

## Notes

- In img2img mode, the image is resized to fit within `new_width`×`new_height` while preserving aspect ratio.
