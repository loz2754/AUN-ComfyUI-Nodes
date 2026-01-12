# AUNRandomNumber — Random Number

Purpose: Generate a random integer in a given inclusive range.

Category: `AUN Nodes/Utility`

## Inputs

### Required

- `minimum` (INT): Minimum value (inclusive).
- `maximum` (INT): Maximum value (inclusive).

## Outputs

- (INT): A random integer between `minimum` and `maximum`.

## Notes

- If `minimum > maximum`, the implementation falls back to `minimum = 0`.
- Intended for workflow randomization (e.g., picking an index, varying a parameter, etc.).

## Example

- Use the output as an index into a switch node, or as an integer parameter elsewhere in your graph.
