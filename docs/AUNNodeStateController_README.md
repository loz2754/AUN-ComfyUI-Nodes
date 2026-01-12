# AUNNodeStateController — AUN Node State Controller

Purpose: Control collapse/expand plus bypass or mute for nodes, targeted by node IDs, group title, or node titles.

## Inputs

- `target_mode` (Node IDs / Group Title / Node Titles): How to pick targets.
- `node_ids` (STRING): Comma-separated node IDs (e.g. `5,12,23`) when `target_mode = Node IDs`.
- `group_title` (STRING): Group title to target when `target_mode = Group Title`.
- `group_exclude_titles` (STRING, multiline): *(Group Title mode only)* node titles to exclude (newline/comma/semicolon separated).
- `node_titles` (STRING, multiline): Node titles to target when `target_mode = Node Titles`.
- `combined` (BOOLEAN):
  - ON: force **Collapsed** + **Disabled** (ignores `active`).
  - OFF: apply `collapse` and `active` independently.
- `use_mute` (BOOLEAN):
  - ON: disables via Mute (`mode = 2`).
  - OFF: disables via Bypass (`mode = 4`).
- `collapse` (BOOLEAN): Collapsed ▶ vs Expanded ▼ (only when `combined` is OFF).
- `active` (BOOLEAN): Active vs Disabled (only when `combined` is OFF).

## Behavior notes

- **Node IDs mode**: sends per-node events for collapse + bypass/mute; when switching between bypass/mute it clears the other state to avoid stale disables.
- **Group Title mode**:
  - Collapsing is applied group-wide.
  - Disabling is best-effort; when excludes are provided and workflow metadata is available, it falls back to title-based operations.
- **Node Titles mode**: applies collapse + bypass/mute using title-based events.

## Tips

- Enable ComfyUI “Show Node IDs” when using Node IDs mode.
- For group dashboards with multiple slots and presets, prefer `AUN Group Controller` (`AUNMultiGroupUniversal`).
