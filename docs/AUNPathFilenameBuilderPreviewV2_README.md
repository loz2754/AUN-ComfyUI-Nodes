# AUNPathFilenameBuilderPreviewV2

Purpose

- Compatibility wrapper for resolver-based workflows using one combined `path_filename_template` output.
- Delegates to `AUNPathFilenameV2` for image-style templates and `AUNPathFilenameVideoV2` for video-style templates.

Inputs

- `MainFolder`, `Date_Subfolder`, `SubfolderA`, `SubfolderB`
- `manual_name`, `name_mode`, optional `auto_name`, `max_num_words`
- `prefix_1`, `prefix_2`, `suffix_1`, `suffix_2`
- `Date`, `Model`, `Sampler`, `Scheduler`, `Steps`, `Cfg`, `Seed`
- `date_format`, `token_style`, `delimiter`

Outputs

- `path_filename_template` (STRING): combined relative path and filename template.
- `date_format` (STRING): selected date format value.

Notes

- This node is kept for compatibility and convenience when a workflow still wants a single builder that can switch between image and video styles.
- It is not the primary recommendation for new image workflows now that `AUNPathFilenameV2` includes the richer naming controls directly.
- New image workflows can usually use `AUNPathFilenameV2` directly.
- New video workflows can usually use `AUNPathFilenameVideoV2` directly.
- Use it with `AUNFilenameResolverPreviewV2` when you specifically want a resolver-based flow.
