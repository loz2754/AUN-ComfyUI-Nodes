# AUNPathFilenameVideo — Video Path + Filename Builder

Purpose: Legacy video path + filename builder for existing workflows that still use separate outputs with `AUN Save Video`.

- Inputs:
  - Path: `MainFolder`, `Date_Subfolder`, `SubfolderA`, `SubfolderB`
  - Name selection: `manual_name`, `name_mode` (Manual/Auto), optional `auto_name`
  - Auto name cropping: `max_num_words` where `0` means no limit
  - Free-text: `prefix_1`, `prefix_2`, `suffix_1`, `suffix_2`
  - Token toggles: `Model`, `Sampler`, `Scheduler`, `Steps`, `Cfg`, `Seed`
  - `delimiter` (STRING)
- Outputs:
  - `path`, `filename`, `path_filename`
- Tips:
  - In Auto mode, `max_num_words` trims `auto_name` to the first N words.
  - `0` disables cropping.

## Token placeholders

When enabled, this node inserts placeholders that downstream logic can replace:

- `%model_short%`, `%sampler_name%`, `%scheduler%`
- `%steps%`, `%cfg%`, `%seed%`

## Notes

- Canonical token spelling uses `%token%`.
- `AUNSaveVideo` still accepts legacy `%token` placeholders for backward compatibility.
- This builder leaves `%steps%`, `%cfg%`, and `%seed%` bare so `AUNSaveVideo` can format them as `steps-<v>`, `cfg-<v>`, and `seed-<v>`.
