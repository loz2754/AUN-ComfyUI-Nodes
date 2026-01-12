# AUNGraphScraper — AUN Graph Scraper

Purpose: Build a string by scraping widget/input values from anywhere in the current workflow using a template.

## Inputs

### Required

- `template` (STRING, multiline): Text containing placeholders in the form:
  - `{NodeTitle.WidgetName}`
  - `{NodeID.WidgetName}`

Example:

- `Model: {1.ckpt_name} | Weight: {FaceID.weight}`

### Optional

- `basename_if_path` (BOOLEAN): If a scraped value looks like a filesystem path, only output the filename.

## Output

- `text` (STRING): The rendered template.

## Placeholder behavior

- Node lookup supports **live prompt graph** (preferred) and falls back to the **workflow graph** (including nested/subgraph nodes).
- `WidgetName` matching is case-insensitive.
- If a value is a link (e.g., a connected number node), the scraper follows the link a few steps to resolve the actual value.
- Missing node or widget produces a bracketed marker like `[<id> not found]` or `[<widget> not found]`.

## Common setups

- Add this node before a saver to stamp settings into filenames/sidecars.
- Use `{<nodeid>.<field>}` when titles are duplicated.
