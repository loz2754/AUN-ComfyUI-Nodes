# AUNModelShorten — Model Name Shorten

Purpose: Convert a full model name string into a shorter, filename-friendly name.

Category: `AUN Nodes/Utility`

## Inputs

### Required

- `full_model_name` (STRING): The full model name to shorten.

## Outputs

- `short_name` (STRING): A shortened version of the input.

## Notes

- Uses the same shortening logic as the “Extract Model Name” utilities (via `model_utils.get_short_name`).
- Intended for building clean filenames and labels (e.g., when saving images/videos).

## Example

- Feed a checkpoint/model name string into `full_model_name` → use `short_name` in a filename template or text display node.
