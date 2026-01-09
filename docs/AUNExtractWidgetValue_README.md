# AUNExtractWidgetValue — Widget Value Extractor

Purpose: Read an input/widget value from a node by numeric ID and widget name.

- Inputs:
  - `node_id` (INT): Target node numeric ID.
  - `widget_name` (STRING): Name of the widget/input (case-insensitive).
  - Optional: `fallback` (STRING), `basename_if_path` (BOOLEAN)
- Outputs:
  - `value` (STRING): Stringified value (can be JSON for non-strings).
  - `value_float` (FLOAT), `value_int` (INT): Parsed numeric versions when applicable.
- Notes:
  - Looks in both live prompt graph and embedded workflow JSON.
  - When `basename_if_path` is ON, returns only the filename for path-like values.
