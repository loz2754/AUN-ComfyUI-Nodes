# AUNImageLoadResize — AUN Load & Resize Image

Purpose: Load an image from the ComfyUI input folder and optionally resize it using several strategies (including FramePack-style nearest bucket sizing). Also outputs a mask and filename helpers.

## Inputs

### Required

- `image` (dropdown): File from the ComfyUI input directory (supports upload).
- `resize` (BOOLEAN): Enable resizing.
- `use_framepack_bucket` (BOOLEAN): If enabled (and `resize` is on), choose the nearest FramePack bucket based on aspect ratio.
- `base_resolution` (INT): Base resolution used when scaling buckets (default 640).
- `width` (INT): Target width (used when `use_framepack_bucket` is off).
- `height` (INT): Target height (used when `use_framepack_bucket` is off).
- `method`:
  - `stretch`: exact resize
  - `keep proportion`: fit inside target while preserving aspect
  - `fill / crop`: fill target then crop
  - `pad`: fit inside and pad to target
- `crop_position` (center/left/right/top/bottom): Anchor for `fill / crop`.
- `interpolation` (nearest/bilinear/bicubic/area/nearest-exact/lanczos): Resize filter.
- `max_num_words` (INT): Limits the number of words preserved in the `filename` and `cleaned filename` outputs (0 = unlimited).

## Outputs

- `IMAGE` (IMAGE): Loaded (and optionally resized) image.
- `MASK` (MASK): Alpha-derived mask if present; otherwise zeros.
- `filename` (STRING): Raw filename (no extension), optionally word-limited.
- `cleaned filename` (STRING): Filename cleaned for use in prompts/paths (symbols to spaces, whitespace normalized; optionally trims trailing numeric counter).
- `width` (INT): Final width.
- `height` (INT): Final height.

## Notes

- When `use_framepack_bucket` is enabled and `method = keep proportion`, the node switches to `pad` internally so the output hits the bucket dimensions exactly.
- Width/height may be snapped to be divisible (internal default is 8).
