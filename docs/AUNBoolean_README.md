# AUNBoolean — AUN Boolean

Purpose: Output a boolean from a single dropdown (True / False / Randomize), and optionally emit a label only when True.

## Inputs

### Required

- `state` (True / False / Randomize):
  - `Randomize` re-rolls each run.

### Optional

- `label` (STRING): Text label to output when `state` resolves to True.

## Outputs

- `Boolean` (BOOLEAN): The resolved boolean.
- `Label (when True)` (STRING): `label` when true, otherwise an empty string.

## Notes

- In `Randomize` mode, the node forces re-execution each run.
