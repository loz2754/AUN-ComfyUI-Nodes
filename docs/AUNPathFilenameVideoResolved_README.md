# AUNPathFilenameVideoResolved

Purpose

- Build a relative output folder and compact filename using resolved runtime values (not % tokens).
- Provide a sidecar (text or JSON) containing metadata for reproducibility.

Inputs

- Path: `MainFolder`, `Date_Subfolder`, `SubfolderA`, `SubfolderB`
- Name selection: `manual_name`, `name_mode`, optional `auto_name`
- Auto name cropping: `max_num_words` where `0` means no limit
- Free-text: `prefix_1`, `prefix_2`, `suffix_1`, `suffix_2`
- Value inputs: `model_name`, `sampler_name`, `scheduler_name`, `steps_value`, `cfg_value`, `seed_value`
- Sidecar-related optional inputs: `extension`, forced-input `positive_prompt`, forced-input `negative_prompt`, `frame_rate`, `loop_count`, `quality`, `width`, `height`, `count`, `sidecar_format`

Outputs

- `path_filename` (STRING): joined relative path and filename without extension.
- `sidecar_text` (STRING): sidecar contents (text or JSON) matching `AUNSaveVideo` style.

Sidecar contents

- Fields included:
  - `seed`, `steps`, `cfg`, `model`, `model_short`, `sampler_name`, `scheduler`, `loras`, `positive_prompt`, `negative_prompt`, `frame_rate`, `loop_count`, `quality`, `width`, `height`, `count`, `timestamp`, `filename`.
- The `path` field is intentionally omitted from the sidecar.
- The sidecar does not include a separate `extension` field; the `filename` field includes the extension.
- If `sidecar_format` is a "Save to file" option, a `.txt` or `.json` sidecar is written next to the resolved output inside ComfyUI's output folder.

LoRA behavior

- LoRAs are auto-detected from the workflow using the same logic as `AUNSaveVideo` and are recorded only as a PowerLoraLoader-formatted block in the sidecar.
- The filename remains compact and does not include LoRA tokens.

Usage notes

- Use this node when you want resolved, human-readable metadata and a sidecar that captures full model names and LoRA details without lengthening filenames.
- `model_short` is derived automatically from `model_name` in the current UI. A legacy fallback remains in code for older workflows.
- Example sidecar format: set `sidecar_format` to `Output only (text)` or `Output only (json)` to preview the sidecar in-node; choose `Save to file` to also write the file.
