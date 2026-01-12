# AUNPathFilename — Path + Filename Builder

Purpose: Build a folder path and a tokenized filename for saving images/videos.

## Inputs

- `MainFolder` (STRING): Top-level output folder.
- `Date_Subfolder` (BOOLEAN): Add a `YYYY-MM-DD` subfolder beneath `MainFolder`.
- `Subfolder_A` / `Subfolder_B` (STRING): Optional subfolders.
- `name` (STRING): Base name.
- Optional free-text parts: `prefix_1`, `prefix_2`, `Labels`, `suffix_1`, `suffix_2`.
- Toggles:
  - `Date` adds `%date`
  - `Model` adds `%model_short`
  - `Sampler` adds `%sampler_name`
  - `Scheduler` adds `%scheduler`
  - `Seed` adds `seed_%seed`
  - `Steps` adds `steps_%steps`
  - `CFG` adds `CFG_%cfg`
- `delimiter` (STRING): String used to join filename parts.
- Optional: `batch_size` (INT): when > 1, appends `batch_%batch_num`.

## Outputs

- `path` (STRING): Directory path.
- `filename` (STRING): Filename template containing tokens.

## Notes

- This node builds the template; token replacement happens in saver/rename nodes.
- Token spelling here uses `%...` (not always `%...%`). Keep templates consistent with the saver you target.
