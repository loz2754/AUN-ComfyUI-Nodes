# AUNFilenameResolverPreviewV2

Purpose

- Recommended preview resolver for new workflows using a single combined `path_filename_template` input.
- Preserves the current preview sidecar behavior while standardizing the socket contract.

Inputs

- `path_filename_template` (STRING): combined relative path and filename template.
- Additional inputs: `delimiter`, `model_name`, `sampler_name`, `scheduler_name`, `steps_value`, `cfg_value`, `seed_value`, `output_type`, `sidecar_format`.
- Optional inputs: `positive_prompt`, `negative_prompt`, `date_format`, `frame_rate`, `loop_count`, `quality`, `width`, `height`, `count`, `batch_num`.

Outputs

- `path_filename` (STRING): resolved combined relative path and filename.
- `sidecar_text` (STRING): sidecar content.

Notes

- Accepts canonical `%token%` placeholders and legacy `%token` placeholders.
- The sidecar includes `filename` without an extension so it does not drift from the downstream saver's final output format.
- The sidecar does not include a separate `extension` field.
- When `Save to file` is selected, sidecars are written under ComfyUI's output directory alongside the resolved relative output path.
- Intended as the V2 resolver companion for the V2 builder nodes.
