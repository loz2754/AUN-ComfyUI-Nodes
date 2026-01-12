# AUNShowTextWithTitle — Display + Title Setter

Purpose: Display text inside the node and set the node's title at run-time.

- Inputs:
  - `text` (STRING): Content to show inside the node UI.
  - `title` (STRING, optional): New title to apply to the node.
- Output:
  - `text` (STRING): Passthrough of the displayed text.
- Tips:
  - Use to annotate sections or display computed info (e.g., chosen prompt).
  - Title update uses a frontend event; visible after execution.

- Notes:
  - This node uses list mode internally, so it can display multiple strings when upstream nodes emit lists.
  - If `title` is not provided, it uses a default title.
