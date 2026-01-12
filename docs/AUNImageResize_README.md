# AUNImageResize — AUN Resize Image

Purpose: Resize an in-memory IMAGE tensor (and optional MASK) using the same strategies as AUNImageLoadResize, without file I/O.

## Inputs

### Required

- `image` (IMAGE, input): Image tensor to resize.
- `resize` (BOOLEAN): Enable resizing.
- `use_framepack_bucket` (BOOLEAN): If enabled (and `resize` is on), choose the nearest FramePack bucket based on aspect ratio.
- `base_resolution` (INT): Base resolution used when scaling buckets (default 640).
- `width` (INT): Target width (used when `use_framepack_bucket` is off).
- `height` (INT): Target height (used when `use_framepack_bucket` is off).
- `method` (stretch / keep proportion / fill / crop / pad): Resize strategy.
- `crop_position` (center/left/right/top/bottom): Anchor for `fill / crop`.
- `interpolation` (nearest/bilinear/bicubic/area/nearest-exact/lanczos): Resize filter.

### Optional

- `mask` (MASK, input): Mask resized alongside the image.

## Outputs

- `IMAGE` (IMAGE): Resized image.
- `MASK` (MASK): Resized mask.
- `width` (INT): Final width.
- `height` (INT): Final height.

## Notes

- When `use_framepack_bucket` is enabled and `method = keep proportion`, the node switches to `pad` internally so the output hits the bucket dimensions exactly.
- If no mask is provided, the node outputs an all-zero mask.
