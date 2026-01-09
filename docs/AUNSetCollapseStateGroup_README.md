# AUN Group Collapser

Purpose: Collapse or expand nodes that belong to specific group titles so you can keep large graphs tidy without changing execution state.

## Variants

- `AUNSetCollapseStateGroup` — single group title + `Switch` (`Collapsed ▶` / `Expanded ▼`). Ideal for dashboard buttons that target one area at a time.
- `AUNSetCollapseStateGroupMulti` — UI-driven list identical to the Group Bypasser/Muter multi nodes. You get an "All Groups" toggle plus one toggle per group; inputs auto-refresh as groups are added/renamed.

## Behavior
- Collapsing hides node bodies (nodes remain active). Expanding restores their full layout.
- Multi variant keeps the toggle list synchronized with the actual canvas so manual collapses/expands outside the node are reflected back.
- The hidden `group_titles` input stores whichever groups are currently collapsed so workflows serialize cleanly.

## Tips
- Pair collapse + bypass/mute variants to build unified control surfaces (e.g., collapse + bypass a variant at the same time).
- Use the multi node's "All Groups" toggle for quick tidy/expand passes before saving screenshots.
