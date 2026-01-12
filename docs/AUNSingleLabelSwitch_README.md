# AUNSingleLabelSwitch — Single Label Switch

Purpose: Toggle a single text label on/off using a boolean.

Category: `AUN Nodes/Text`

## Inputs

### Required

- `state` (BOOLEAN): Toggle.
- `label` (STRING): The text to output when `state` is on.

## Outputs

- `Label` (STRING): `label` when on, otherwise an empty string.

## Common uses

- Add the same optional text snippet to multiple places in a graph.
- Drive prompt fragments from a single toggle.
