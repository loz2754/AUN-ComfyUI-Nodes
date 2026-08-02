# AUNRIFE — RIFE Frame Interpolation
Generates intermediate frames between input frames using RIFE (Real-Time Intermediate Flow Estimation, v4.7 architecture), for smooth slow-motion or higher frame-rate video. Model weights are downloaded from HuggingFace on first use.

## Inputs

### Required

- `images` (IMAGE): The source frame sequence as a batched tensor (`B, H, W, C`). Needs at least 2 frames; with fewer, the input is returned unchanged.
- `ckpt_name` (combo): Which RIFE checkpoint to use (`rife47` / `rife49`). Both use the v4.7 architecture. Weights are downloaded to `ComfyUI/models/rife` on first use.
- `multiplier` (INT, 2–10): Number of frames to generate between each pair of input frames. `2` produces 2x the frames, `10` produces 10x.
- `ensemble` (BOOLEAN): When enabled, the model runs twice per intermediate frame and averages the results for better quality (slower).

## Outputs

- IMAGE: The interpolated frame sequence (`B, H, W, C`), `multiplier` x the input frame count.

## Notes

- Extracted and adapted from the ComfyUI_Fill-Nodes pack (original author: filliptm — github.com/filliptm/ComfyUI_Fill-Nodes). Architecture credit also to https://github.com/hzwer/Practical-RIFE.
- Model files are stored in `ComfyUI/models/rife` so they are shared with other ComfyUI installs and do not live inside the node pack.
- Frame pairs are processed sequentially with a ComfyUI progress bar; large batches and high multipliers take longer.
- If inference fails for a pair (e.g. out of memory), the node falls back to linear interpolation for that step instead of aborting.
