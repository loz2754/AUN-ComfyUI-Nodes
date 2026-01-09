# AUN Group Bypasser

Purpose: Toggle bypass state (active vs bypassed) for every node contained in a ComfyUI group.

## Variants

- `AUNSetBypassStateGroupSingle` — one `group_title` input plus a single switch (`Active 🟢` vs `Bypass 🔴`). Perfect when you only need to flip one section from a button panel.
- `AUNSetBypassStateGroup` — multi-select UI with an "All Groups" toggle and one toggle per group title. The hidden `group_titles` field stores the active list but the UI handles selection for you.

## Behavior
- Toggling a group to OFF bypasses every node inside that group (nodes switch to mode 4).
- Toggling to ON re-activates the nodes.
- Multi variant keeps its toggle list synchronized with the actual canvas state so manual edits (collapsing/expanding nodes, changing modes elsewhere) reflect automatically.

## Tips
- Pair single and multi variants in dashboards (single for critical sections, multi for ad-hoc routing).
- Combine with `AUNSetBypassStateGroupAdvanced` when you need per-group presets or saved toggle sets.
- Works alongside single-node controllers like `AUNSetBypassState` for fine-grained adjustments.
