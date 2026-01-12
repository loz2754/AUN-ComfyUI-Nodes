# AUNSaveImage — AUN Save Image

Purpose: Save images with tokenized filename/path templates, embed useful metadata, and optionally emit a per-image sidecar (text or JSON).

## Inputs

### Required

- `images` (IMAGE): Images to save (single image or batch).
- `filename` (STRING): Filename pattern (no extension).
- `path` (STRING): Subfolder path within the ComfyUI output directory.
- `extension` (png / jpg / webp): File format.

### Optional (common metadata + tokens)

- `steps` (INT): Used for metadata and `%steps`.
- `cfg` (FLOAT): Used for metadata and `%cfg`.
- `modelname` (STRING): Used for `%model`, `%modelname`, `%basemodelname`, and the short-name variants.
- `sampler_name` (STRING): Used for metadata and `%sampler_name`.
- `scheduler` (STRING): Used for metadata and `%scheduler`.
- `seed_value` (INT): Used for metadata and `%seed`.
- `time_format` (STRING): Format string used by `%time`.

### Optional (preview / LoRAs / sidecar)

- `preview` (enabled / disabled): Controls whether ComfyUI shows image previews on the node.
- `loras_delimiter` (STRING): Delimiter for the `%loras` token. Allowed characters: `+ - _ . space , ;`.
- `sidecar_format`:
  - `Output text` / `Output json`: Return sidecar content via the node output only.
  - `Save to file - text` / `Save to file - json`: Also write `.txt` / `.json` files next to the saved image(s).
- `save_image` (BOOLEAN):
  - `True`: Save into the output directory.
  - `False`: Preview-only mode (writes to ComfyUI temp; does not write sidecar files).
- `positive_prompt` (STRING, input): Positive prompt text to embed in sidecar/metadata.
- `negative_prompt` (STRING, input): Negative prompt text to embed in sidecar/metadata.

## Tokens (filename + path)

The `filename` and `path` fields support placeholder tokens. Tokens are replaced when saving.

Supported tokens include:

- `%date` (YYYY-MM-DD)
- `%time` (uses `time_format`)
- `%seed`
- `%steps`
- `%cfg`
- `%sampler_name`
- `%scheduler`
- `%batch_num` (1-based index within the batch)
- `%model`, `%modelname`
- `%basemodelname`
- `%model_short`, `%modelname_short`
- `%basemodelshort`, `%basemodelname_short`
- `%loras` (grouped token, e.g. `(LORAS-NameA+NameB)`)
  - `%loras_group` is kept as an alias of `%loras` for compatibility.

## Outputs

- `filename` (STRING): The resolved filename prefix used for saving (before per-image batch numbering).
- `sidecar_text` (STRING): Sidecar content in the selected format (text/JSON).

## Notes

- LoRAs used for `%loras` and sidecar extraction are pulled from the workflow/prompt graph and formatted compactly. Text-based LoRA loaders are filtered so only LoRAs that actually appear in the final prompt text are included.
- In preview-only mode (`save_image = False`), images are written to the temp directory for UI display and sidecar files are suppressed.

## Common setups

### 1) Simple, tidy filenames (model + seed)

- `filename`: `%date_%model_short%_seed_%seed`
- `path`: `AUN/%date`

### 2) Include sampler/scheduler and settings

- `filename`: `%date_%time_%model_short%_%sampler_name%_%scheduler%_s%steps%_c%cfg%_seed%seed`
- `path`: `AUN/%model_short%`

### 3) Batch outputs with numbered files

Use `%batch_num` so each image in the batch gets a unique name.

- `filename`: `%date_%model_short%_seed%seed_%batch_num`

### 4) Sidecar for external tools (txt or json)

- If you only want the sidecar content to flow to downstream nodes: set `sidecar_format = Output text` or `Output json`.
- If you also want `.txt` / `.json` files next to each saved image: set `sidecar_format = Save to file - text` or `Save to file - json`.

### 5) Preview-only (don’t fill the output folder)

- Set `save_image = False` to write previews to the temp directory.
- Sidecar files are automatically disabled in this mode (even if you selected a “Save to file …” option).
