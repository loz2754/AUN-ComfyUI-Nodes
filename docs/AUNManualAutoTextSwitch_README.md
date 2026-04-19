# AUNManualAutoTextSwitch — Manual/Auto Text Switch

Purpose: Choose between an automatically generated filename and a manually entered name, while also outputting the chosen mode as a boolean for downstream switching.

Category: `AUN Nodes/Text`

## Inputs

### Required

- `Filename` (STRING): The automatically generated filename to use when manual mode is off.
- `ManualName` (STRING): The manually specified name to use when manual mode is on.
- `name_mode` (BOOLEAN): Toggle between Auto and Manual mode. Off uses `Filename`; on uses `ManualName`.

## Outputs

- `Filename` (STRING): The selected name based on `name_mode`.
- `Name Mode` (BOOLEAN): The current mode value, useful for driving matching switches in other nodes.

## Common uses

- Override an auto-generated filename only when needed, without rewiring the rest of the workflow.
- Keep save-path logic synchronized by passing the returned boolean into other manual/auto switches.
- Quickly test manual naming conventions while preserving an automatic fallback.

## Notes

- When `name_mode` is off, the node returns the `Filename` input unchanged.
- When `name_mode` is on, the node returns `ManualName` exactly as provided.
- This node only switches text values; it does not build or validate paths by itself.
