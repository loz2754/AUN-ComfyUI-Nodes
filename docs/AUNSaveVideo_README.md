# AUNSaveVideo — AUN Save Video

Purpose: Combine an image batch (frames) into an animated image (GIF/APNG/WebP) or a video format, with tokenized filenames, optional audio, and optional sidecar (text/JSON).

## Inputs

### Required

- `images` (IMAGE): Frames to encode (expects a batch).
- `frame_rate` (INT): Frames per second.
- `loop_count` (INT): Animated images only (GIF/APNG/WebP). `0` loops forever; `N` loops `N` times.
- `filename_format` (STRING): Output name template (no extension).
- `output_format` (dropdown):
  - Animated images: `image/gif`, `image/webp`, `image/apng`
  - Videos: `video/<name>` entries loaded from the format JSONs shipped with the pack.
- `save_to_output_dir` (BOOLEAN):
  - `True`: Save into ComfyUI output directory.
  - `False`: Save into ComfyUI temp directory.
- `quality` (INT 0–100): Quality setting mapped per encoder/format.
- `save_metadata` (BOOLEAN): Embed metadata into the output (format-dependent).
- `save_workflow` (BOOLEAN): Include workflow JSON in embedded metadata (when metadata is enabled).
- `batch_size` (INT): Video outputs only. Frames per segment before concat (lower uses less memory; higher can be faster).

### Optional

- `audio_options` (AUDIO_INPUT_OPTIONS): Add an audio track (video outputs only).
- `seed_value` (INT): Used for `%seed%`.
- `steps_value` (INT): Used for `%steps%`.
- `cfg_value` (FLOAT): Used for `%cfg%`.
- `model_name` (STRING): Used for `%model%`.
- `short_manual_model_name` (STRING): Used for `%model_short%` (leave empty for auto-shortening).
- `sampler_name_value` (STRING): Used for `%sampler_name%`.
- `scheduler_value` (STRING): Used for `%scheduler%`.
- `loras_delimiter` (STRING): Delimiter for `%loras%`. Allowed characters: `+ - _ . space , ;`.
- `sidecar_format`:
  - `Output only (text)` / `Output only (json)`: Return sidecar via node output only.
  - `Save to file (text)` / `Save to file (json)`: Also write a `.txt` / `.json` next to the saved file.

## Tokens (filename_format)

`filename_format` supports these tokens (missing values become empty):

- `%seed%`, `%steps%`, `%cfg%`
- `%model%`, `%model_short%`
- `%sampler_name%`, `%scheduler%`
- `%loras%`

Example:

- `Comfy_%model_short%_s%steps%_c%cfg%_seed%seed%_%loras%`

## Outputs

- `images` (IMAGE): Pass-through frames for convenience/preview.
- `sidecar_text` (STRING): Sidecar content in the selected format (text/JSON).

## Notes

- Many `video/*` formats require `ffmpeg`. If `ffmpeg` is not on PATH, the node attempts to use `imageio-ffmpeg`. If neither is available, video outputs that require ffmpeg may be disabled.
- `loop_count` is ignored for video formats.

## Common setups

### 1) Quick GIF preview

- `output_format`: `image/gif`
- `frame_rate`: 8–12
- `loop_count`: 0
- `quality`: 80–95
- `save_to_output_dir`: `False` (keeps it in temp while iterating)

### 2) WebP animation (smaller than GIF)

- `output_format`: `image/webp`
- `frame_rate`: 8–12
- `quality`: 85–98
- `save_metadata`: `True` if you want reproducibility

### 3) Tokenized names that match your stills

Example `filename_format`:

- `Anim_%model_short%_%sampler_name%_%scheduler%_s%steps%_c%cfg%_seed%seed%_%loras%`

If you don’t want empty underscores when a value is missing, remove the surrounding separators in the template (since missing tokens become empty).

### 4) Video + sidecar for archiving

- `sidecar_format`: `Save to file (json)`
- `save_metadata`: `True`
- `save_workflow`: `True`

### 5) Long videos / big batches (memory-friendly)

- Prefer a smaller `batch_size` (e.g. 64) if you hit memory limits.
- Increase `batch_size` if you want fewer segments / faster concat and you have headroom.
