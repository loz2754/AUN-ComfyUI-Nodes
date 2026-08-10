# AUNCollapseConnectionsController — Collapse Connections

Purpose: Hide the input/output slots of chosen nodes to reduce link lines between them. Each targeted node's connection lines collapse into a single point and can be expanded back anytime. Target nodes by Node ID using slot-based toggles, or use the `AllNodes` toggle to hide connections for every node in the graph with 2 or more connection slots.

## Prerequisite

The **⚠ EXPERIMENTAL — Global collapse connections** setting (Settings → AUN) must be **enabled** for this node to have any effect. The setting takes precedence: while it is off, the controller does nothing and the node displays a warning banner on its body. The banner clears as soon as the setting is enabled.

## Inputs

- `slot_count` (INT, 1–20): Number of control slots to show (default 3).
- Per slot `i` (1–20):
  - `label_i` (STRING): Descriptive label for the slot. Used as the switch's label (and is what the switch shows in compact mode).
  - `targets_i` (STRING): The node IDs this slot controls, separated by commas (e.g. `5, 12`).
  - `switch_i` (BOOLEAN):
    - `Collapsed ▶`: hide the target nodes' input/output slots so their link lines converge to a single point.
    - `Expanded ▼`: restore the target nodes' slots and link lines.
- `AllSwitch` (BOOLEAN): `All ▶` collapses all targeted nodes; `Individual` uses each slot's `switch_i`.
- `AllNodes` (BOOLEAN): `All Graph ▶` hides the input/output slots of every node in the graph with **2 or more connection slots** (nodes with 0–1 slots are skipped because collapsing them is visually invisible). `Slot only` returns to normal slot-based control. The user "extra node classes to skip" setting is always respected.

## All Graph toggle

`AllNodes` is a bulk switch for the whole graph. While it is **on**, every eligible node is collapsed (this overrides the slot switches). How it behaves when switched **off** is chosen in **Settings → AUN → "Collapse Connections Controller: 'All Graph' off behavior"**:

- **Return to slot control** (default): only the nodes All Graph had collapsed are re-expanded; nodes targeted by a slot continue to follow their slot switch.
- **Expand everything**: every node in the graph is re-expanded (full reset).

While All Graph is on, newly added nodes are collapsed automatically and manually expanded nodes are re-collapsed on the next refresh — turn All Graph off to expand individual nodes. The toggle itself is a directive and does not auto-sync to the graph state.

## Compact mode

The controller has its own compact mode (mirroring the AUN Node Controller):

- **Double-click** the node body (not the title bar) to toggle it.
- **Right-click → AUN: Compact mode** to toggle it.
- In compact mode the `slot_count`, `label_i`, and `targets_i` widgets are hidden; only the named slot switches remain (each labelled with its `label_i` value, or `Slot N` when empty), along with the `AllSwitch` and `AllNodes` toggles. The hidden widgets keep their values and are restored when you leave compact mode.

## Behavior notes

- Slot toggles apply **instantly** on the canvas — no need to queue the prompt — just like the double-click / right-click "Collapse Connections" toggle.
- When the workflow is run, the node re-sends the current slot states so the result stays deterministic.
- The collapse state is stored per-node in `properties.collapse_connections`, so it is saved with the workflow and restored on load (while the setting is enabled).
- The controller can also drive AUN nodes that ship their own collapse-connections renderer (e.g. the AUN Inputs nodes, AUN Multi Universal) — they read the same `properties.collapse_connections` property, so the controller toggles them too. Remote toggles mirror each node's own collapse behavior: nodes that keep their user-set height on their own toggle (e.g. AUNSaveImageV2, AUNShowAnyMulti) keep it when toggled remotely, and nodes that shrink/expand natively (AUN Inputs, AUN KSampler) still do.
- Any class listed in the "extra node classes to skip" setting is never touched.
- A node targeted by more than one slot follows the slot whose switch is ON (active wins).
- Slot switches stay in sync with the actual collapse state of their targets (e.g. collapsing a target via double-click updates the switch).
- There are no output sockets; this is a pure control node.

## Tips

- Enable ComfyUI "Show Node IDs" when targeting by Node ID.
- To quickly hide connection lines for the whole graph, use the `AllNodes` toggle instead of setting up slots node by node.
