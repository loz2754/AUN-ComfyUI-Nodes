# AUNTitleImagePreview — AUN Title Image Preview

Purpose: Show an IMAGE preview inside the node while also mirroring an input string into the node title (useful for “slot” dashboards and batched preview grids).

## Inputs

### Required

- `image` (IMAGE, input): Image to preview.

### Optional

- `title` (STRING, input): Title text. If empty/not provided, defaults to `AUN Image Preview`.

## Outputs

- None (preview/UI-only output).

## Notes

- This node is based on ComfyUI’s `PreviewImage` behavior but adds a frontend sync event to update the node title.
- It’s a minimal companion for `AUNImageSingleBatch3` when you want the preview tile to carry a meaningful label.
