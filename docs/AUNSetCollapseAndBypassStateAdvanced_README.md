# AUNSetCollapseAndBypassStateAdvanced — Node Collapser & Bypass/Mute (Advanced)

Purpose: Control collapse/expand plus bypass or mute for multiple nodes by ID.

## Inputs

- `node_ids` (STRING): Comma-separated node IDs (e.g. `5,12,23`).
- `combined` (BOOLEAN):
  - ON: force **Collapsed** + **Disabled** (uses `use_mute` to decide mute vs bypass).
  - OFF: use the `collapse` and `active` toggles independently.
- `use_mute` (BOOLEAN): ON = disable via Mute (mode 2), OFF = disable via Bypass (mode 4).
- `collapse` (BOOLEAN): Collapsed ▶ vs Expanded ▼ (only when `combined` is OFF).
- `active` (BOOLEAN): Active vs Disabled (only when `combined` is OFF).

## Notes

- This node sends frontend events so changes apply instantly (including inside subgraphs).
- If you need to target by Group Title or Node Titles, use the `AUN Node State Controller` node.
