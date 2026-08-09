# AUN Scan And Show Widgets

Scan any node by ID or title, display all its widget values as overlay cards inside the node, and provide dynamic ANY-type output slots for wiring.

> **Note:** Run the workflow (Queue Prompt) to populate the output slots and show the card details. The node starts empty until executed.

## Inputs

| Input | Type | Description |
|-------|------|-------------|
| `node_identifier` | STRING | Numeric ID or Title of the node to scan |
| `basename_if_path` | BOOLEAN | If true, return only the basename for path-like values |
| `concat_widget_name` | COMBO | Prefix each widget value with its widget name and a separator (`space` = `" "`, `space-space` = `" - "`, `;` = `";"`, `;space` = `"; "`, `-` = `"-"`, `none` = off) |

> Hidden inputs kept in sync by the UI: `filter_include`, `filter_exclude_patterns`, and `widget_selection`.

## Outputs

Up to 350 ANY-type outputs (`value_1` through `value_350`), dynamically labeled with widget names from the scanned node.

## Features

- **Overlay cards**: Widget values are displayed inside the node as cards with type badges
- **Target title**: The scanned node's title is shown in this node's title bar
- **Filter (F button)**: Title bar button opens a modal with include/exclude wildcard patterns
- **Select Widgets**: Node-body button opens a searchable multi-select dropdown listing the scanned node's widgets
- **Collapse connections**: Right-click or double-click to toggle compact socket lines
- **Show/hide data types**: Right-click to toggle type badge visibility on overlay cards
- **Max value length**: Right-click to set the truncation limit for displayed values

## Select Widgets

Click the **Widgets** button on the node body to open a searchable dropdown of all widget names from the scanned node. Click to toggle each widget on (✔) or off, or use **Clear** to remove the selection.

- The list is populated live from the target node (resolved via `node_identifier`) and falls back to the widget names from the last execution; it refreshes each time the picker opens.
- A selection acts as a **whitelist**: only the selected widgets are shown and output. **Exclude** patterns still apply, and **Include** patterns are ignored while a selection is set.
- The selection clears automatically when `node_identifier` changes.

## Filter Modal

Click the **F** button in the title bar to open the filter modal:

- **Include**: Show only widgets matching these patterns (one per line, `*` = wildcard)
- **Exclude**: Hide widgets matching these patterns (one per line, `*` = wildcard)

If Include is empty, all widgets pass the include check. Entries must match ANY include pattern AND NOT match ANY exclude pattern to be shown.

### Examples

| Pattern | Effect |
|---------|--------|
| `lora_*` | Show only widgets starting with `lora_` |
| `*strength*` | Show widgets containing `strength` |
| `enabled_*` | Show only widgets starting with `enabled_` |

## Usage

1. Add the node and set `node_identifier` to the ID or title of the target node
2. Run the workflow (Queue Prompt) once — output slots and overlay cards populate only after execution
3. The overlay cards display all widget values from the target node
4. Connect the dynamic outputs to wire values into other nodes
5. Use the **Widgets** button to multi-select exactly which widgets to show, or the filter to narrow down with wildcards
