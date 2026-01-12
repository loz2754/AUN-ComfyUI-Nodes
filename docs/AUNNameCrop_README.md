# AUNNameCrop — AUN Name Crop

Purpose: Crop a string to the first N words (simple filename/title helper).

## Inputs

### Required

- `name` (STRING, input): Input string.
- `crop` (BOOLEAN): Enable/disable cropping.
- `words` (INT): How many words to keep (1–10).

## Output

- `cropped_name` (STRING)

## Notes

- Splits on whitespace and joins the first N tokens.
