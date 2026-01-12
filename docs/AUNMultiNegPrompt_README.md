# AUNMultiNegPrompt — Negative Prompt Selector

Purpose: Store up to 10 negative prompts and select one by index.

Category: `AUN Nodes/Text`

## Inputs

### Required

- `negative1` … `negative10` (STRING, multiline): The 10 negative prompt options.
- `which_negative` (INT, 1–10): Which negative prompt to output.

## Outputs

- `negative` (STRING): The selected negative prompt.

## Notes

- If an invalid index is provided, it falls back to `negative1`.
