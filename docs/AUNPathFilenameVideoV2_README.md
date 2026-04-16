# AUNPathFilenameVideoV2

Purpose

- Recommended video path/filename builder for new workflows using a single combined `path_filename` socket.
- Provides a compatibility-safe migration path away from separate path and filename outputs.

Inputs

- Path: `MainFolder`, `Date_Subfolder`, `SubfolderA`, `SubfolderB`
- Name selection: `manual_name`, `name_mode`, optional `auto_name`
- Auto name cropping: `max_num_words` where `0` means no limit
- Free-text: `prefix_1`, `prefix_2`, `suffix_1`, `suffix_2`
- Token toggles: `Date`, `Model`, `Sampler`, `Scheduler`, `Steps`, `Cfg`, `Seed`
- `date_format`
- `delimiter`

Outputs

- `path_filename` (STRING): combined relative path and filename template.
- `date_format` (STRING): selected date format for downstream `AUNSaveVideoV2`.

Notes

- This node reuses the current `AUNPathFilenameVideo` placeholder behavior.
- `date_format` controls the dated subfolder format when `Date_Subfolder` is enabled.
- `Date` controls whether `%date%` is included in the filename template.
- Legacy-only compatibility controls such as `NameCrop`, `NameCropWords`, and `Include_Loras` are intentionally hidden from the V2 UI.
- `%steps%`, `%cfg%`, and `%seed%` remain bare placeholders so `AUNSaveVideo` / `AUNSaveVideoV2` can format them later.
