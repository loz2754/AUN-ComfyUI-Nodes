# AUNCFG — Cfg Selector

Purpose: A small helper node that outputs a single CFG (Classifier-Free Guidance) float with convenient range/step.

## Inputs

### Required

- `float` (FLOAT): CFG value (default 2.0, range -2.0 to 100.0, step 0.1).

## Output

- (FLOAT): The CFG value.

## Notes

- Useful as a reusable “knob” when wiring CFG into multiple samplers.
