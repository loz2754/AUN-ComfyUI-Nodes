# AUNAddToPromptMulti — AUN Add-To-Prompt Multi

Purpose: Conditionally append or prepend multiple addon text strings to a base prompt, with per-addon mode control (on/off/random) and configurable ordering.

## Inputs

### Required

- `base_text` (STRING, multiline): Base prompt text.
- `num_addons` (INT): Number of active addon slots (1–20).

### Optional

- `delimiter` (STRING): Separator used when appending addon text.

### Per-addon inputs (1–20)

For each addon slot `N`:

- `text_to_add_N_mode` (`on` / `off` / `random`): Mode for this addon.
  - `on`: always add the text.
  - `off`: never add the text.
  - `random`: 50/50 chance of adding the text on each execution.
- `text_to_add_N` (STRING): Text to add when the addon is active.
- `order_N` (`prompt_first` / `text_first`): Whether the base prompt comes before or after this addon's text.

## Outputs

- `text` (STRING): The combined prompt string with active addons applied.

## Compact mode

- Double-click the node header to toggle between Normal and Compact modes.
- Compact mode hides all addon text widgets and shows only a mode selector dropdown per active addon slot.
- Each addon row displays a dropdown with `on`/`off`/`rnd` choices, color-coded for quick visual reference:
  - Green (`on`): always active
  - Gray (`off`): never active
  - Brown (`rnd`): random 50/50
- Manual node width is preserved — resizing the node wider will stick across mode toggles and workflow reloads.
- Auto-height adjusts to fit the number of active addon slots.

## Common setups

- Use `random` mode for probabilistic prompt elements (e.g., occasionally adding style modifiers).
- Combine with `AUNWildcardAddToPrompt` for layered randomization.
- Use compact mode for a clean dashboard-style overview of all addon states.
