# AUN Custom Nodes Changelog

## [Unreleased]

### Added
- **AUNRandomTextIndexSwitch**: New combined node that merges `AUNRandomIndexSwitch` and `AUNTextIndexSwitch` functionality
  - Generates index via Select/Increment/Random modes
  - Selects from up to 10 text inputs with automatic labeling
  - Outputs selected text, label, and generated index
  - Includes JavaScript extension for automatic input labeling based on connected node titles
  - Executes on workflow queue for proper timing

### Updated
- **README.md**: Added documentation for the new `AUNRandomTextIndexSwitch` node
- **docs/AUNRandomTextIndexSwitch_README.md**: Comprehensive documentation for the new node
- **AUN_text_index_switch_labels.js**: Extended to support the new combined node for automatic input labeling

### Technical Changes
- Node registration updated in `__init__.py`
- JavaScript extensions enhanced for broader node support
- Improved input widget handling for labeling functionality

## Previous Versions

*For changes prior to this changelog, see individual node comments and commit history.*