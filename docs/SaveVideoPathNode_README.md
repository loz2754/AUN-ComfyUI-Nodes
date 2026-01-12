# AUNPathFilenameVideo — Video Path + Filename Builder

Purpose: Build a path and tokenized filename specialized for `AUN Save Video`.

- Inputs:
  - Path: `MainFolder`, `Date_Subfolder`, `SubfolderA`, `SubfolderB`
  - Name selection: `manual_name`, `name_mode` (Manual/Auto), optional `auto_name`
  - Auto name cropping: `NameCrop`, `NameCropWords`
  - Free-text: `prefix_1`, `prefix_2`, `suffix_1`, `suffix_2`
  - Token toggles: `Model`, `Sampler`, `Scheduler`, `Steps`, `Cfg`, `Seed`, `Include_Loras`
  - `delimiter` (STRING)
- Outputs:
  - `path`, `filename`, `path_filename`
- Tips:
  - `Include_Loras` adds `%loras%` token; use with `AUNExtractPowerLoras`.
  - In Auto mode, `NameCrop`/`NameCropWords` trims `auto_name` to first N words.

## Token placeholders

When enabled, this node inserts placeholders that downstream logic can replace:

- `%model_short%`, `%sampler_name%`, `%scheduler%`
- `%steps%`, `%cfg%`, `%seed%`
- `%loras%`
