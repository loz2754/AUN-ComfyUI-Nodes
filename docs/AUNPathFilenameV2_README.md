# AUNPathFilenameV2

Purpose

- Recommended path/filename builder for new image workflows using a single combined `path_filename` socket.
- Provides a compatibility-safe migration path away from separate `path` and `filename` outputs.
- Covers the richer builder use case directly, including manual/auto naming and `max_num_words`.

Inputs

- Keeps the familiar image path/filename controls such as `MainFolder`, `Date_Subfolder`, `Subfolder_A`, `Subfolder_B`, token toggles, labels, suffixes, and `batch_size`.
- Uses `manual_name`, `name_mode`, optional `auto_name`, and `max_num_words` for the richer naming workflow that previously required the preview builder.
- Adds `date_format` for controlling the dated subfolder when `Date_Subfolder` is enabled.

Outputs

- `path_filename` (STRING): combined relative path and filename template.
- `date_format` (STRING): selected date format for downstream `AUNSaveImageV2` nodes.

Notes

- This node preserves the existing image filename token order and formatting, including `seed_%seed%`, `steps_%steps%`, and `CFG_%cfg%`.
- `date_format` accepts both Python-style formats such as `%Y-%m-%d` and ComfyUI-style formats such as `yyyy-dd-MM` for the date subfolder.
- `date_format` is also returned so image saver nodes can use the same value for `%date%` and `%time%` resolution.
- It exists to standardize new workflows without breaking older ones that still use separate outputs.
- In most new image workflows, this node replaces the need for `AUNPathFilenameBuilderPreviewV2`.
