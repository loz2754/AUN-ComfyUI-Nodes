# AUNSetBypassByTitle — AUN Bypass By Title

Purpose: Set **bypass** state on nodes whose titles match a provided list.

## Inputs

### Required

- `titles` (STRING, multiline): Titles separated by newline, comma, or semicolon.
- `Switch` (BOOLEAN):
  - ON = `Active 🟢`
  - OFF = `Bypass 🔴`

## Outputs

- None (control node).

## Notes

- Sends a frontend sync event `AUN_set_bypass_by_titles` with `{titles: [...], is_active: bool}`.
- Title matching, exclusions, and partial matching behavior are handled by the frontend extension.
