# AUNTextIndexSwitch — AUN Text Index Switch

Purpose: Select one of up to 20 text inputs by index, and also output a human-friendly label for the selected input.

## Inputs

### Required

- `index` (INT 1–20): Which `textN` to output. Values above `visible_inputs` are clamped.
- `visible_inputs` (INT 2–20): How many `textN` sockets are shown on the node.

### Optional

- `text1` … `text20` (STRING, input, lazy): Candidate text inputs.

## Outputs

- `text` (STRING): Selected text.
- `label` (STRING): Label for the selected input.

## Label behavior

- If workflow metadata is available, the node tries to use the **connected node title** as the label for the selected slot.
- If it can’t resolve a connected node title, it falls back to the slot key (e.g. `text7`).

## Notes

- Useful for dynamic prompt selection while keeping UI readable.
