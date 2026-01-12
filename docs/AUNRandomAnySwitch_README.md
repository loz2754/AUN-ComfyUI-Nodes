# AUNRandomAnySwitch — Random Any Switch

Purpose: Randomly select one of several connected inputs of any type and output it, along with the selected index.

Category: `AUN Nodes/Utility`

## Inputs

### Required

- `seed` (INT): Seed used for reproducible selection.

### Optional

- `input_1` … `input_5` (Any): Candidate inputs. Only connected (non-None) inputs are considered.

## Outputs

- `output` (Any): The selected input value.
- `selected_index` (INT): 1-based index of the selected input, or 0 if nothing was connected.

## Notes

- The node accepts any input types via a proxy “Any” type.
- If no inputs are connected, the node returns `(None, 0)`.
- The node forces re-execution via `IS_CHANGED` so changing `seed` (or re-queueing) can produce a different selection.
