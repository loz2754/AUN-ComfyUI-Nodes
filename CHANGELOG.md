# AUN Custom Nodes Changelog

## [Unreleased]

- No changes yet.

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
- `vhs_patch.py`: avoids ComfyUI "undefined" widget values by making most patch inputs socket-only; removed LoRA delimiter input and fixed delimiter to `;`
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