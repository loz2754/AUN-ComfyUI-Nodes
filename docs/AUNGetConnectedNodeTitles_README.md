# AUNGetConnectedNodeTitles — AUN Get Connected Node Titles

Purpose: Read the titles of up to 10 connected nodes and output them as strings. Unconnected slots output an empty string.

## Inputs

### Required

- `index` (INT 1–10): Which slot to also output as `selected_title`.

### Optional

- `node_1` … `node_10` (Any): Connect anything; the node reads the connected node’s title from workflow metadata.

## Outputs

- `label1_out` … `label10_out` (STRING): Connected node titles (or empty when unconnected).
- `selected_title` (STRING): The title for the chosen `index` (or empty).

## Notes

- This node always re-executes so it reflects current graph connections/titles.
- If a connected node has no title, it falls back to that node’s type.
