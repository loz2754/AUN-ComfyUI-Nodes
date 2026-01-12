# AUNSwitchFloat — Switch Float

Purpose: Select between two float values based on a boolean input.

Category: `AUN Nodes/Utility`

## Inputs

### Required

- `float_1` (FLOAT): Output when `boolean = True`.
- `float_2` (FLOAT): Output when `boolean = False`.
- `boolean` (BOOLEAN): Switch control.

## Outputs

- `float` (FLOAT): The selected float.

## Common uses

- Toggle between two CFG/denoise/strength values.
- A/B test parameter sets without rewiring.
