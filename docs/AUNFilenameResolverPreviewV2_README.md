# AUNFilenameResolverPreviewV2

Purpose

- Acts as a bridge between the AUN path/filename builder nodes and standard save image/video nodes when you are not using `AUNSaveImage` or `AUNSaveVideo` directly.
- Accepts a single combined `path_filename` input and returns a resolved combined path/filename value.

Inputs

- `path_filename` (STRING): combined relative path and filename template.
- Additional inputs: `delimiter`, `model_name`, `sampler_name`, `scheduler_name`, `steps_value`, `cfg_value`, `seed_value`, `output_type`, `sidecar_format`.
- Optional inputs: `pos_prompt`, `neg_prompt`, `date_format`, `frame_rate`, `loop_count`, `quality`, `width`, `height`, `count`, `batch_num`.

Outputs

- `path_filename` (STRING): resolved combined relative path and filename.
- `sidecar_text` (STRING): sidecar content.

Notes

- Accepts canonical `%token%` placeholders and legacy `%token` placeholders.
- The sidecar includes `filename` without an extension so it does not drift from the downstream saver's final output format.
- The sidecar does not include a separate `extension` field.
- When `Save to file` is selected, sidecars are written under ComfyUI's output directory alongside the resolved relative output path.
- Intended for workflows that want the V2 builder pattern but still need to hand the resolved result off to standard saver nodes.
