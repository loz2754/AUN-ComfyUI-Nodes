# AUNMultiBypassIndex — Multi Bypass Index

Purpose: Control bypass state for multiple node groups by selecting one active group index.

Category: `AUN Nodes/Node Control`

## Inputs

### Required

- `Index` (INT, 1–10): The group index to activate.
- `node_ids_1` … `node_ids_10` (STRING): Comma-separated node IDs for each group (e.g. `5,12,23`).

## Outputs

- `Selected Index` (INT): The chosen index (pass-through).

## Behavior

- Nodes in the selected group are set active (not bypassed).
- Nodes in other groups are bypassed.
- The node sends a single batched sync event (`AUN_node_bypass_state`) with updates for all referenced node IDs.

## Notes

- Enable node ID badges in ComfyUI settings to find node IDs.
- If the same node ID appears in multiple groups, “active” (True) wins over bypass.
