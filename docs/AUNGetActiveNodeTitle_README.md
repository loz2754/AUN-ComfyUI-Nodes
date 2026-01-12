# AUNGetActiveNodeTitle — AUN Get Active Node Title

Purpose: Given a comma-separated list of titles, output the first one that is currently **active** (not bypassed) in the workflow.

## Inputs

### Required

- `node_titles` (STRING): Comma-separated list of titles to check, in priority order.

## Output

- `active_title` (STRING): The first matching active title; otherwise an empty string.

## Behavior notes

- Checks both:
  - **Node titles** (including subgraph name resolution when present)
  - **Group titles**: a group is considered “active” if it contains at least one active node within its bounding box.

## Notes

- This node always re-executes because the active/bypass state can change without changing inputs.
