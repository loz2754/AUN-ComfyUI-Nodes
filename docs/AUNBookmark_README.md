# AUNBookmark — Bookmark

Purpose: Mark a spot in the canvas and allow jumping to it via a shortcut key, optionally applying a specific zoom.

Category: `AUN Nodes/Utility`

## Inputs

### Required

- `shortcut_key` (STRING): Single character key used to jump to this bookmark (e.g. `1`, `a`).
- `zoom` (FLOAT): Zoom level to apply when jumping (0.01–10.0).

## Outputs

- None.

## Notes

- This node is a UI/workflow helper; it does not modify images or conditioning.
- The node intentionally performs no computation (`do_nothing`).
