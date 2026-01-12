# AUNAddToPrompt — AUN Add-To-Prompt

Purpose: Conditionally append (or prepend) text to an existing prompt string.

## Inputs

### Required

- `text_to_add` (STRING, multiline): Text to insert. Supports dynamic prompts.
- `delimiter` (STRING): Separator used when both sides are non-empty (default `, `).
- `order` (prompt_first / text_first): Whether the base `prompt` comes before or after the new text.
- `mode` (COMBO: on / off / random):
  - `on`: always apply
  - `off`: never apply
  - `random`: 50/50 per execution

### Optional

- `prompt` (STRING, input): Base prompt to modify. If not connected, treated as empty.

## Output

- (STRING): The resulting prompt string.

## Notes

- If either side is empty, the node avoids inserting the delimiter and just concatenates the available text.
- In `random` mode, the decision is made each run.
