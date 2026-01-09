# AUNPathFilename — Path + Filename Builder

Purpose: Build a folder path and a tokenized filename for saving images/videos.

- Inputs:
  - `MainFolder` (STRING): Top-level output folder.
  - `Date_Subfolder` (BOOLEAN): Add a YYYY-MM-DD subfolder.
  - `Subfolder_A` / `Subfolder_B` (STRING): Optional subfolders.
  - `name` (STRING): Base name.
  - Toggles: `Date`, `Model`, `Smplr_schdlr`, `Seed`, `Steps_CFG`, `Include_LoRAs`.
  - `prefix_1`/`prefix_2`, `Labels`, `suffix_1`/`suffix_2`, `delimiter`.
  - Optional: `batch_size` (INT)
- Outputs:
  - `path` (STRING): Directory path.
  - `filename` (STRING): Tokenized file name (placeholders like %model_short, %sampler_name, etc.).
- Tips:
  - Pair with `AUNSaveImage` or `AUNSaveVideo` which replace the tokens.
  - Use `AUNExtractModelName` and `AUNExtractPowerLoras` to populate model/LoRA tokens.
