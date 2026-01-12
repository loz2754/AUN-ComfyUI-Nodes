# AUNSetBypassStateGroup — Group Bypasser (Multi)

Purpose: Toggle bypass state (active vs bypassed / node mode 4) for all nodes contained in one or more ComfyUI Groups.

## Inputs

- `group_titles` (STRING): Hidden storage for selected group titles (comma-separated). Use the node UI toggles to edit.

## Behavior

- Toggle ON (🟢): nodes in the group are set to Active (`mode = 0`).
- Toggle OFF (🔴): nodes in the group are set to Bypassed (`mode = 4`).
- The UI shows an "All Groups" toggle plus one toggle per group title, and stays synchronized with the canvas.

## Notes

- Core behavior is applied instantly in the frontend JavaScript; the Python node remains for workflow serialization/compatibility.
