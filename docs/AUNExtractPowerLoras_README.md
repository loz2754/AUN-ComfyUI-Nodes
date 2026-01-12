# AUNExtractPowerLoras — Power LoRAs Extractor

Purpose: Extract LoRA names (and strengths) from rgthree Power Lora Loader nodes to build tokens and lists.

- Inputs:
  - `loras_delimiter` (STRING): Delimiter used between LoRA entries (default: `;`).
- Outputs:
  - `loras_token` (STRING): Grouped token string like `(LORAS-A+B)` safe for filenames.
  - `loras_names` (STRING): Delimiter-joined short names with optional strengths.
  - `loras_list` (STRING): Newline-separated base names with labeled strengths.
- Notes:
  - Scans both live prompt graph and workflow JSON.
  - Supports rgthree Power LoRA Loader nodes and standard ComfyUI LoRA loaders.
  - Delimiter is sanitized to filename-safe characters (`+-_. ,;`).
