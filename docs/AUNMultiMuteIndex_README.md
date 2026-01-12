# AUNMultiMuteIndex — Multi Mute Index

Purpose: Control mute state for multiple node groups by selecting one active group index.

Category: `AUN Nodes/Node Control`

## Inputs

### Required

- `Index` (INT, 1–10): The group index to keep active/unmuted.
- `node_ids_1` … `node_ids_10` (STRING): Comma-separated node IDs for each group.

## Outputs

- `Selected Index` (INT): The chosen index (pass-through).

## Behavior

- Nodes in the selected group remain active/unmuted.
- Nodes in other groups are muted.
- The node first clears bypass (sets bypass active=True) for all referenced nodes, then sends mute updates.
- Sync events sent:
  - `AUN_node_bypass_state`
  - `AUN-node-mute-state`

## Notes

- Enable node ID badges in ComfyUI settings to find node IDs.
- If the same node ID appears in multiple groups, “keep active” (True) wins.
