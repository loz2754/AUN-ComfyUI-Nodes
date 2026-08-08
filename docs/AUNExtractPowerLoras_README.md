# AUNExtractPowerLoras — Power LoRAs Extractor

Purpose: Extract LoRA names (and strengths) from rgthree Power Lora Loader nodes to build descriptive lists and A1111-style prompts.

- Inputs:
  - `target_node_ids` (STRING): Comma-separated node IDs to extract LoRAs from. Leave empty to extract from all LoRA loaders in the graph.
- Outputs:
  - `loras_names` (STRING): Newline-separated descriptive entries, one per line (e.g. `lora_name (model strength 0.80, clip strength 1.20)`).
  - `loras_list` (STRING): Newline-separated A1111-style entries (e.g. `<lora:lora_name.safetensors:0.80:1.20>`).
- Notes:
  - Scans both live prompt graph and workflow JSON.
  - Supports rgthree Power LoRA Loader nodes and standard ComfyUI LoRA loaders.
  - Strengths always display 2 decimal places.
