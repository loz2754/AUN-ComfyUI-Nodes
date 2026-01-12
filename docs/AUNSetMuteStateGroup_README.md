# AUNSetMuteStateGroup — Group Muter (Multi)

Purpose: Toggle mute state (active vs muted / node mode 2) for all nodes contained in one or more ComfyUI Groups.

## Inputs

- `group_titles` (STRING): Hidden storage for selected group titles (comma-separated). Use the node UI toggles to edit.

## Behavior

- Toggle ON (🟢): nodes in the group are set to Active (`mode = 0`).
- Toggle OFF (🔴): nodes in the group are set to Muted (`mode = 2`).
- The UI shows an "All Groups" toggle plus one toggle per group title, and auto-refreshes as groups are added/renamed.

## Notes

- Core behavior is applied instantly in the frontend JavaScript; the Python node remains for workflow serialization/compatibility.
