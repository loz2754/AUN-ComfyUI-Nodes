# AUN Scan And Show Widgets

Scan any node by ID or title, display all its widget values as overlay cards inside the node, and provide dynamic ANY-type output slots for wiring.

## Inputs

| Input | Type | Description |
|-------|------|-------------|
| `node_identifier` | STRING | Numeric ID or Title of the node to scan |
| `basename_if_path` | BOOLEAN | If true, return only the basename for path-like values |
| `concat_widget_name` | BOOLEAN | If true, prefix each string value with its widget name |

## Outputs

Up to 350 ANY-type outputs (`value_1` through `value_350`), dynamically labeled with widget names from the scanned node.

## Features

- **Overlay cards**: Widget values are displayed inside the node as cards with type badges
- **Target title**: The scanned node's title is shown in this node's title bar
- **Filter (F button)**: Title bar button opens a modal with include/exclude wildcard patterns
- **Collapse connections**: Right-click or double-click to toggle compact socket lines
- **Show/hide data types**: Right-click to toggle type badge visibility on overlay cards
- **Max value length**: Right-click to set the truncation limit for displayed values

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
2. The overlay cards display all widget values from the target node
3. Connect the dynamic outputs to wire values into other nodes
4. Use the filter to narrow down which widgets are shown and output
