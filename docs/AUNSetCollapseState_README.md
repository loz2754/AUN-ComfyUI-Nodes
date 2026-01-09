# AUNSetCollapseState — Node Collapser

Purpose: Collapse or expand specific nodes by ID.

- Inputs:
  - `node_ids` (STRING): Comma-separated node IDs to affect.
  - `Switch` (BOOLEAN): Collapsed (On) vs Expanded (Off).
- Behavior:
  - Sends collapse/expand events to each target node.
- Tips:
  - Use with ID badges enabled to see node IDs.
