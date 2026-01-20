# AUNPathFilenameVideoResolved

Purpose
- Build a relative output folder and compact filename using resolved runtime values (not % tokens).
- Provide a sidecar (text or JSON) containing metadata for reproducibility.

Outputs
- `path` (STRING): relative folder path (e.g., `Videos/2026-01-20/Wan22`).
- `filename` (STRING): compact filename without extension.
- `path_filename` (STRING): joined path and filename.
- `sidecar_text` (STRING): sidecar contents (text or JSON) matching `AUNSaveVideo` style.

Sidecar contents
- Fields included:
  - `filename`, `seed`, `steps`, `cfg`, `model`, `model_short`, `sampler_name`, `scheduler`, `loras` (PowerLoraLoader block), `timestamp`.
- The `path` field is intentionally omitted from the sidecar.
- If `sidecar_format` is a "Save to file" option, a `.txt` or `.json` sidecar is written next to the resolved output inside ComfyUI's output folder.

LoRA behavior
- LoRAs are auto-detected from the workflow using the same logic as `AUNSaveVideo` and are recorded only as a PowerLoraLoader-formatted block in the sidecar.
- The filename remains compact and does not include LoRA tokens.

Usage notes
- Use this node when you want resolved, human-readable metadata and a sidecar that captures full model names and LoRA details without lengthening filenames.
- Example sidecar format: set `sidecar_format` to `Output only (text)` or `Output only (json)` to preview the sidecar in-node; choose `Save to file` to also write the file.

File
- Node implementation: [custom_nodes/AUN/AUNPathFilenameVideoResolved.py](custom_nodes/AUN/AUNPathFilenameVideoResolved.py)

Feedback
- If you want the sidecar schema changed (fields added/removed), tell me which fields to add and whether they should be written to disk.