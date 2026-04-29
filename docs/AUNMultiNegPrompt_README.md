# AUNMultiNegPrompt — Negative Prompt Selector

Purpose: Store up to 20 negative prompts entered directly in the node and select one by index.

Category: `AUN Nodes/Text`

## Inputs

### Required

- `which_negative` (INT, 1–20): Which negative prompt to output. This is intended to accept the `index` output from `AUNRandomTextIndexSwitch` or similar selector nodes.
- `visible_inputs` (INT, 2–20): How many negative prompt fields to show on the node.
- `negative1` … `negative20` (STRING, multiline): Negative prompt options entered directly in the selector node. Fields above `visible_inputs` are hidden.

## Outputs

- `negative` (STRING): The selected negative prompt.

## Notes

- If an index outside the visible range is provided, it is clamped to the nearest valid slot.
- Intended for manual negative-prompt entry while still allowing the selected positive prompt index to drive the matching negative prompt.
- `visible_inputs` can be driven manually on the node or synced automatically from an upstream selector connected to `which_negative` when that source node also exposes a `visible_inputs` widget.
- The backend keeps the older widget serialization order for compatibility with existing saved workflows: `negative1` to `negative10`, then the control widgets, then `negative11` to `negative20`.
