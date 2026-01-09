# AUN Group Muter

Purpose: Toggle mute state (active vs muted / mode 2) for nodes contained in one or more groups.

## Variants

- `AUNSetMuteStateGroupSingle` — supply a `group_title` and use the switch (`Active 🟢` / `Mute 🔇`) to silence that slice of the graph.
- `AUNSetMuteStateGroup` — multi-toggle UI with an "All Groups" toggle plus one toggle per group. The UI keeps its state aligned with the canvas so you'll always see which groups are currently muted.

## Behavior
- When a toggle is OFF, nodes inside the group are muted (mode 2) but connections remain for fast re-activation.
- When ON, nodes return to normal execution mode.
- Multi variant writes the selected titles into the hidden `group_titles` field for serialization; use the UI to edit selections.

## Tips
- Use muting when you want to keep graph wiring intact without rerouting (e.g., alternate samplers or pre/post chains).
- Pair with the multi bypass/collapser nodes to build control panels that manage visibility and execution together.
- For advanced batch operations, see `AUNSetMuteStateGroupAdvanced`.
