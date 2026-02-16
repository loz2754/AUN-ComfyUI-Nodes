# AUN Custom Nodes Changelog

## [Unreleased]

- 2026-01-20
  - Added `AUNPathFilenameVideoResolved` node
    - Returns resolved values instead of % tokens: `path`, `filename`, `path_filename`, and `sidecar_text`.
    - Sidecar contains a PowerLoraLoader-formatted LoRA block under the `loras` field (if LoRAs are present in the workflow).
    - The sidecar no longer includes the output `path` field (only `filename` and metadata).
    - LoRA-related filename tokens and short/parsed LoRA fields were removed; LoRAs are recorded only in the sidecar block.
    - Sidecar file writing: when `sidecar_format` save-to-file is selected, a `.txt` or `.json` is written next to the resolved output filename in ComfyUI's output tree.

  Notes:
  - LoRA detection uses the same extraction logic as `AUNSaveVideo` and mirrors its PowerLoraLoader formatting.
  - Filenames remain compact (short model/sampler/scheduler names); full model name is preserved in the sidecar `model` field.

## [0.1.0] - 2026-01-12

### Added
- Dependency support for easier installs:
  - `requirements.txt` (runtime deps like `piexif`, `opencv-python-headless`, `imageio-ffmpeg`)
  - `install.py` (ComfyUI-Manager friendly dependency installer)
- README documentation for VHS `Video Combine` integration via `vhs_patch.py`
- **AUNRandomTextIndexSwitch**: New combined node that merges `AUNRandomIndexSwitch` and `AUNTextIndexSwitch` functionality
  - Generates index via Select/Increment/Random modes
  - Selects from up to 20 text inputs (with `visible_inputs` to reduce socket clutter)
  - Outputs selected text, label, and generated index
  - Includes JavaScript extension for automatic input labeling based on connected node titles
  - Executes on workflow queue for proper timing

### Updated
- `AUNSaveVideo`: optional-import handling for `cv2`/`piexif` and safer ffmpeg fallback
- `AUNSaveImage`: `piexif` is now optional (non-PNG still saves without EXIF insertion)
- `KSamplerInputs`: removed unused heavy imports to reduce dependency surface
- **README.md**: Added documentation for the new `AUNRandomTextIndexSwitch` node
- **docs/AUNRandomTextIndexSwitch_README.md**: Comprehensive documentation for the new node
- **AUN_text_index_switch_labels.js**: Extended to support the new combined node for automatic input labeling

### Technical Changes
- Node registration updated in `__init__.py`
- JavaScript extensions enhanced for broader node support
- Improved input widget handling for labeling functionality

## Previous Versions

*For changes prior to this changelog, see individual node comments and commit history.*