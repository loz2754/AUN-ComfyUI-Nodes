# MainFolderManualName — MainFolder ManualName

Purpose: Choose between an auto-generated filename and a manual name, while also passing through `MainFolder`.

Category: `AUN Nodes/File Management`

## Inputs

### Required

- `MainFolder` (STRING): Main folder component for output paths.
- `Filename` (STRING, forceInput): Auto-generated filename.
- `ManualName` (STRING): Manual name to use when `name_mode` is Manual.
- `name_mode` (BOOLEAN):
  - Auto (off): outputs `Filename`
  - Manual (on): outputs `ManualName`

## Outputs

- `MainFolder` (STRING)
- `Filename` (STRING): Selected name (auto or manual).
- `Name Mode` (BOOLEAN): Pass-through of `name_mode` (useful to drive other switches).

## Common uses

- Feed into path/filename nodes so you can toggle “manual override” without rewiring.
