# AUNExtractWidgetValue — Widget Value Extractor

Purpose: Read an input/widget value from a node by node ID or node title and widget name.

- Inputs:
  - `node_identifier` (STRING): Target node numeric ID or node title.
  - `widget_name` (STRING): Name of the widget/input (case-insensitive).
  - Optional: `fallback` (STRING), `basename_if_path` (BOOLEAN)
- Outputs:
  - `value` (STRING): Stringified value (can be JSON for non-strings).
  - `value_float` (FLOAT), `value_int` (INT): Parsed numeric versions when applicable.
- Notes:
  - Looks in both live prompt graph and embedded workflow JSON.
  - If the widget value is a connection/link, the node will try to resolve through simple value-like nodes.
  - When `basename_if_path` is ON, returns only the filename for path-like values.
