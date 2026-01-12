# AUNModelNamePass — AUN Model Name Pass

Purpose: Pass-through for a MODEL that also extracts the model’s name (full and shortened), tracing back through the graph to find the original loader.

## Inputs

### Required

- `model` (MODEL): Model to pass through.

### Optional

- `manual_name` (STRING): Optional manual model name.
- `use_manual_name` (BOOLEAN): When true (and `manual_name` is non-empty), the short/manual output uses the sanitized manual name.

## Outputs

- `model` (MODEL): Pass-through.
- `full_model_name` (STRING): Derived from the loader filename (base name without extension), or `UnknownModel`.
- `short/manual name` (STRING): Short name derived automatically (or sanitized manual name).

## Notes

- This node forces re-execution (`IS_CHANGED` returns NaN) so name extraction stays up-to-date with graph changes.
- Works with nested/subgraph workflows by searching workflow metadata when needed.
