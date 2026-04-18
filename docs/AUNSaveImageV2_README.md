# AUNSaveImageV2

Purpose

- Recommended image saver for new workflows.
- A versatile image saver with advanced filename customization and metadata embedding.
- Accepts a single combined `path_filename` input and pairs naturally with `AUNPathFilenameV2`.

Inputs

- `images` (IMAGE)
- `path_filename` (STRING): combined relative path and filename template.
- `extension` (png / jpg / webp)
- Remaining optional and hidden inputs match `AUNSaveImage`, except V2 omits the LoRA delimiter input.

Outputs

- `filename` (STRING)
- `sidecar_text` (STRING)

Notes

- Canonical `%token%` placeholders and legacy `%token` placeholders are both supported.
- `%loras%` and `%loras_group%` are ignored by V2 for filename generation.
- Detected LoRAs still appear in the sidecar output and sidecar files.
- `AUNPathFilenameV2` is the intended builder for generating the combined `path_filename` string.
- Internally this node splits `path_filename` and then reuses the current `AUNSaveImage` save logic.
