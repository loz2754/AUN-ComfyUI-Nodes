# AUN Custom Nodes Changelog

## [Unreleased]

### Added

### Changed

### Fixed

### Notes

## [2.1.3] - 2026-04-22

### Added

### Changed

### Fixed

### Notes
## [2.1.2] - 2026-04-22

### Added

### Changed

### Fixed

### Notes
## [2.1.1] - 2026-04-22

### Added

- New `AUNInputsRefineBasic` node for the lighter `Inputs Basic` workflow with an optional separate refine checkpoint output.
- New `AUNManualAutoTextSwitch` node for switching between an automatically generated filename and a manually entered name, while also outputting the current mode as a boolean for downstream workflow control.

### Changed

- Added published documentation for `AUNManualAutoTextSwitch` in the main README and docs index.
## [2.0.1] - 2026-04-18

### Fixed

- Cleaned up published package metadata so `dependencies` contains only valid Python package requirements.
- Removed the duplicate Comfy registry publish workflow to avoid repeated publish attempts from the same `pyproject.toml` change.

## [2.0.0] - 2026-04-18

## [1.1.0] - 2026-04-16

### Added

- New recommended V2 file-management and save workflow nodes:
  - `AUNPathFilenameV2`
  - `AUNPathFilenameVideoV2`
  - `AUNSaveImageV2`
  - `AUNSaveVideoV2`
- New preview/compatibility helper nodes for resolver-based workflows:
  - `AUNFilenameResolverPreviewV2`
- New `AUNInputsBasic` node.
- New shared `aun_path_filename_shared.py` helpers for combined path/filename building, token resolution, and name cropping.
- New README pages for the V2 builder, resolver, saver, and path/filename nodes.

### Changed

- File-management and save nodes are now labeled `Legacy` or `Recommended` in node search to make migration paths clearer.
- README and node docs now describe the V2 migration path, with `path_filename` as the primary end-to-end contract.
- Canonical placeholder syntax is now documented and supported as `%token%` across the newer builder flow, while older `%token` forms remain accepted for compatibility.
- `AUNPathFilename` and `AUNPathFilenameVideo` are now explicitly documented and presented as legacy builders for existing workflows.
- `AUNPathFilenameV2` now covers the richer image naming workflow directly, including manual/auto naming and `max_num_words`, so the preview builder is no longer needed for standard image workflows.
- `AUNPathFilenameVideoResolved` documentation was updated to reflect its resolved output contract and current sidecar schema.

### Fixed

- Restored backward compatibility for legacy image/video save and path nodes where widget ordering, older placeholder forms, or older workflow contracts could break saved graphs.
- Fixed image and video saver handling for `%date%`, `%time%`, and explicit `%date:<format>%` / `%time:<format>%` style placeholders.
- Fixed sidecar timestamp formatting so ComfyUI-style date patterns such as `yyyy-MM-dd` resolve correctly.
- Fixed video preview metadata so saved mp4/webm outputs return the correct preview format and normalized subfolder paths.
- Fixed the inline browser preview extension so `AUNSaveVideoV2` previews render the same way as the legacy video saver.
- Fixed sidecar output/schema inconsistencies so filename data stays in `filename` and redundant standalone `extension` fields are no longer emitted in the updated preview/V2 flow.
- Fixed `AUNSaveImage` and `AUNSaveVideo` token replacement so both canonical `%token%` and legacy `%token` placeholders resolve correctly.

### Notes

- Legacy nodes remain available for older workflows.
- The V2 family is the recommended non-breaking migration path for new workflows.

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

_For changes prior to this changelog, see individual node comments and commit history._
