# TextSwitch2InputWithTextOutput — Text Switch 2 Input With Text Output

Purpose: Select between two text values (or output empty) by matching a `choose` string to one of two labels.

Category: `AUN Nodes/Text`

## Inputs

### Required

- `text_a` (STRING): First text option.
- `label_a` (STRING): Label that selects `text_a`.
- `text_b` (STRING): Second text option.
- `label_b` (STRING): Label that selects `text_b`.
- `choose` (STRING):
  - If equals `label_a` → output `text_a`
  - If equals `label_b` → output `text_b`
  - Otherwise → output empty string

## Outputs

- `text` (STRING): Selected text (or empty).

## Notes

- This is useful when you want a “dropdown-like” text selection but keep everything as strings.
