# AUNCheckpointLoaderWithClipSkip — AUN Ckpt Load With Clip Skip

Purpose: Load a checkpoint and apply a Clip Skip value, returning MODEL/CLIP/VAE plus some handy naming outputs.

## Inputs

### Required

- `ckpt_name` (checkpoint file): Checkpoint to load.
- `clip_skip` (INT, negative): CLIP layer skip value (default `-1`).

## Outputs

- `MODEL` (MODEL)
- `CLIP` (CLIP): With clip skip applied.
- `VAE` (VAE)
- `name` (STRING): Checkpoint base name (no extension).
- `clip skip` (INT): Echo of the chosen value.

## Notes

- Internally calls `clip.clip_layer(clip_skip)` after loading the checkpoint.
