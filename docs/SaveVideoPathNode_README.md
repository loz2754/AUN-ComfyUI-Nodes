# SaveVideoPathNode — Video Path + Filename Builder

Purpose: Build a path and tokenized filename specialized for `AUN Save Video`.

- Inputs:
  - `MainFolder` (STRING), `Date_Subfolder` (BOOLEAN), `SubfolderA/B` (STRING)
  - Name selection: `manual_name`, `name_mode` (Manual/Auto), `auto_name`
  - Prefixes/Suffixes: `prefix_1/2` + toggles, `suffix_1/2` + toggles
  - Tokens toggles: `Model`, `Sampler`, `Scheduler`, `Steps`, `Cfg`, `Seed`, `Include_Loras`
  - `delimiter` (STRING)
- Outputs:
  - `path`, `filename`, `path_filename`
- Tips:
  - `Include_Loras` adds `%loras%` token; use with `AUNExtractPowerLoras`.
  - In Auto mode, `NameCrop`/`NameCropWords` trims `auto_name` to first N words.
