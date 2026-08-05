# AUNImageSliderComparer — AUN Image Slider Comparer
Compare two images side by side with a slider. Two interaction modes are available: Drag (click and drag to scrub) and Slide (slider follows the mouse without clicking). Switch between them via the right-click menu. Up to five named pairs of image inputs are supported; batched tensors and lists of frames are matched by index.

## Inputs

### Required

- `pair` (combo): Which named pair to display (`Pair 1` … `Pair 5`). The dropdown is dynamically labelled with the connected output-slot names, e.g. `Pair 1 — base image vs latent upscaled image`.
- `frame` (INT): Which frame (batch index) of the selected pair to view. Frame `i` of the left input is matched with frame `i` of the right input. Always visible; its maximum clamps to the shortest connected side after execution.
- `save_active` (BOOLEAN): When enabled, the currently displayed left/right frame of the active pair is saved into the output folder with the `prefix` below.
- `prefix` (STRING): Filename prefix used for the active-frame output save.

### Optional

- `pair1_left` / `pair1_right` (IMAGE, input)
- `pair2_left` / `pair2_right` (IMAGE, input)
- `pair3_left` / `pair3_right` (IMAGE, input)
- `pair4_left` / `pair4_right` (IMAGE, input)
- 'pair5_left' / 'pair5_right' (IMAGE, input)

Each input may be a batched tensor or a list of frames (e.g. from a node with `output_is_list` enabled). A single-frame side broadcasts to the other side's length; otherwise frames are matched by index and the `frame` selector is clamped to the shortest side.

## Outputs

- None (preview/UI-only output).

## Notes

- Each input socket is labelled with the name of the output slot it is connected to (the connected node's output `label`/`name`), so it is always obvious what each pair is. Or the slot can be renamed by right clicking the slot and selecting 'Rename Slot'.
- The node title shows the active pair, e.g. `AUN Image Slider Comparer — IMAGE vs IMAGE (Pair 1)`.
- In Drag mode, click and drag left/right over the preview to move the slider. In Slide mode, simply hover over the image area — the slider follows the mouse cursor without clicking, and resets to the left edge on mouse leave. Switch modes by right-clicking the node and selecting "Slider Mode".
- The comparison view is rendered inside the node via a DOM overlay widget; the selected pair and frame are sent to the node on every execution.
- Collapse Connections (double-click the title bar, or via the right-click menu) hides the input/output slots and the extra `save_active`/`prefix` widgets, leaving only the `pair` and `frame` selectors plus the image area visible.
- Right-click the node for context-menu actions: open or download the current left/right frame (uses the temp preview files, no re-run needed). Right-clicking directly on the image area opens a per-side menu — left of the slider targets the left image, right of it targets the right image.
- The header shows each side's image title and current frame dimensions (`W×H`).
- With `save_active` enabled, executing writes `<prefix>_L_<counter>.png` and `<prefix>_R_<counter>.png` to the output folder; the filenames flash in the header badge.
