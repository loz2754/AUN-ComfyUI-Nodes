# AUNManualAutoImageSwitch — Manual/Auto Image Switch

Purpose: Replace the old manual/auto subgraph with one node that keeps filename selection, manual naming, mode output, and image fallback behavior in sync.

Category: `AUN Nodes/Image`

## Inputs

### Required

- `image` (IMAGE): The image to pass through when `name_mode` is `Auto`.
- `Filename` (STRING): The automatically generated filename used in `Auto` mode.
- `width` (INT): Width of the fallback image returned in `Manual` mode.
- `height` (INT): Height of the fallback image returned in `Manual` mode.
- `ManualName` (STRING): The manual name used in `Manual` mode.
- `name_mode` (Auto / Manual): Select whether to use the incoming image and `Filename`, or switch to `ManualName` plus a generated placeholder image.
- `show_overlay` (BOOLEAN): Enable or disable the centered label on the placeholder image.
- `overlay_text` (STRING): Text displayed on the placeholder image when overlays are enabled.
- `background_color` (STRING): Placeholder background color stored as hex.
- `text_color` (STRING): Overlay text color stored as hex.
- `box_color` (STRING): Overlay label-box color stored as hex.

## Outputs

- `Filename` (STRING): The selected filename. Returns `Filename` in `Auto`, `ManualName` in `Manual`.
- `ManualName` (STRING): Always passes through the manual name unchanged.
- `Name Mode` (BOOLEAN): `False` for `Auto`, `True` for `Manual`.
- `image` (IMAGE): The original image in `Auto`, or a generated blank image in `Manual`.

## Common uses

- Replace a fragile promoted-widget subgraph with one direct node.
- Keep manual naming and image suppression synchronized with one mode control.
- Feed a save path or filename workflow while suppressing image output in manual naming mode.
- Display a clear placeholder image so downstream preview or save nodes show that no source image is being used.

## UI Notes

- The advanced overlay options can be hidden with compact mode.
- Double-click the node body, or use the right-click menu, to show or hide the advanced controls.
- The three color controls use inline color pickers on the right side of the row and intentionally do not show the raw hex value in the node body.

## Example workflow use

Use this node when you want one switch to control both naming and whether an incoming image should be used.

Most useful pattern:

`Image Loader` -> `AUNManualAutoImageSwitch` -> `AUNTitleImagePreview`

- Connect the source image into `image`.
- Connect an automatically generated filename into `Filename`.
- Enter a fallback manual name into `ManualName`.
- Connect the `image` output to `AUNTitleImagePreview` so the preview either shows the real image or the generated placeholder.
- Connect the selected `Filename` or `ManualName` output into the title/text input you want to preview alongside the image.
- Set `name_mode` to `Auto` when you want the real image and auto filename.
- Set `name_mode` to `Manual` when you want the manual name and a placeholder image instead.

This makes `AUNTitleImagePreview` especially useful, because the preview updates to reflect both the active image state and the active name mode in one place.

## Notes

- `Manual` mode returns a generated RGB placeholder image sized from `width` and `height`.
- The placeholder image can show a centered text overlay with configurable colors.
- The node forces reevaluation each run to avoid stale-cache behavior seen with promoted subgraph widgets.
- `name_mode` accepts both the current `Auto` / `Manual` selector values and legacy boolean-like values for compatibility.
