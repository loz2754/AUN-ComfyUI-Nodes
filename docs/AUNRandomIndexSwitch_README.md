# AUNRandomIndexSwitch — Select/Increment/Random INT

Purpose: Output an integer using one of three modes: fixed selection, incremental cycling, or random within a range.

Category: `AUN Nodes/Utility`

## Inputs

### Required

- `minimum` (INT): Minimum value (inclusive) used by `Random` and `Increment`.
- `maximum` (INT): Maximum value (inclusive) used by `Random` and `Increment`.
- `mode` (Select | Increment | Random):
  - `Select`: output the `select` value.
  - `Increment`: cycle from `minimum` → `maximum` across executions.
  - `Random`: choose a random value between `minimum` and `maximum`.
- `select` (INT): The value to output when `mode = Select`.

## Outputs

- (INT): The chosen integer.

## Notes

- In `Increment` mode, the node keeps internal state and advances the number each time it executes.
- The node forces re-execution for `Random` and `Increment` modes (via `IS_CHANGED`), so it updates even if inputs don’t change.
- If `minimum > maximum`, the implementation falls back to `minimum = 0` for `Random`.

## Common uses

- Drive an index input on an index-switch node.
- Cycle through a small set of configurations across runs using `Increment`.
