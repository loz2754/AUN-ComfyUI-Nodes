# AUNSaveVideoV2

Purpose

- Recommended video saver for new workflows using a single combined `path_filename` input.
- Reuses the current `AUNSaveVideo` behavior while standardizing the input contract.

Inputs

- Same inputs as `AUNSaveVideo`, except `filename_format` is renamed to `path_filename`, V2 omits the LoRA delimiter input, and V2 adds `date_format` for resolving `%date%` and `%time%` placeholders.
- V2 also exposes `sampler_name` and `manual_model_name` labels instead of the legacy internal names.

Outputs

- Same outputs as `AUNSaveVideo`.

Notes

- This node exists so the V2 path/filename family can use a single combined socket end-to-end.
- `date_format` accepts both Python-style formats such as `%Y-%m-%d` and ComfyUI-style formats such as `yyyy-MM-dd`.
- Explicit `%date:<format>%` and `%time:<format>%` placeholders override `date_format` per token.
- The sidecar `timestamp` also follows `date_format`; if the format does not include time tokens, `HH:MM:SS` is appended automatically.
- `%loras%` is ignored by V2 for filename generation.
- Detected LoRAs still appear in the sidecar output and sidecar files.
- It preserves the current sidecar behavior of `AUNSaveVideo`.
- The legacy `AUNSaveVideo` node is unchanged for backward compatibility.
