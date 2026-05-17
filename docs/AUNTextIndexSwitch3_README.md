# AUNTextIndexSwitch3 — AUN Text Index Switch 3

Purpose: Simple 10-slot text switch. Selects one of `text1`…`text10` by index and outputs a label.

## Inputs

### Required

- `index` (INT 1–10): Which text to output.
- `text1` … `text10` (STRING, multiline): Candidate texts.

## Outputs

- `text` (STRING): Selected text.
- `label` (STRING): Label for the selected input.

## Notes

- The node attempts to resolve the label from workflow metadata (connected node title), otherwise it falls back to `textN`.
- This variant has fixed 10 inputs (no `visible_inputs`).
- Manual node width is preserved across workflow loads and auto-resize operations — resizing the node wider will stick even after queueing or reloading.
- Hidden input slots are visually hidden on the canvas (drawn over with background-colored circles), so disconnected slots don't show colored connection dots.
