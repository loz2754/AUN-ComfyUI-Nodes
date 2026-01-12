# AUNImgLoader — AUN Image Loader

Purpose: Load an image from the ComfyUI input directory and output image + mask, plus filename helpers.

## Inputs

### Required

- `image` (dropdown): File from the ComfyUI input directory (supports upload).
- `max_num_words` (INT): Limits the number of words preserved in both filename outputs (0 = unlimited).

## Outputs

- `IMAGE` (IMAGE): Loaded image (single or batch if multi-frame and consistent size).
- `MASK` (MASK): Alpha-derived mask if present; otherwise zeros.
- `image name` (STRING): Raw filename (no extension), optionally word-limited.
- `cleaned filename` (STRING): Cleaned for use in prompts/paths (symbols to spaces, whitespace normalized; optionally trims trailing numeric counter).

## Notes

- The cleaned filename logic matches other AUN loader nodes.
- Cache invalidation includes both the file contents and `max_num_words`.
