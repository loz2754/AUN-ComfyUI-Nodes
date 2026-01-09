# AUNExtractModelName — Model Name Extractor

Purpose: Extract a model name from a specific node (by numeric ID) for filenames and labels.

- Inputs:
  - `node_id` (INT): Numeric ID of the model loader node to inspect.
  - `manual_name` (STRING, optional): Manual override for short name.
  - `use_manual_name` (BOOLEAN): When ON, use `manual_name` as short/manual name.
- Outputs:
  - `full_model_name` (STRING): Extracted model basename (no path, no extension).
  - `short/manual name` (STRING): Auto-shortened or manual sanitized name for filenames.
- Notes:
  - Searches live graph and embedded workflow JSON to find model-like strings.
  - Includes a small internal map for common short names; otherwise auto-shortens.
