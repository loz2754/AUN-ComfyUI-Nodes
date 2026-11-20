# AUN Preset Manager

## Purpose

`AUN Preset Manager` stores named or keyword-triggered preset rows of widget values for other nodes and writes the selected row into those nodes **at queue time**, before validation and caching. It can:

- apply a fixed preset row;
- cycle rows sequentially (or randomly) across queued runs;
- hold each row for `runs_per_row` runs and drive a 1..N index into another node (for example a text index switch), so every prompt runs before the checkpoint changes;
- expose the selected row as JSON and as up to 12 typed value outputs for manual wiring.

The manager does **not** need to be wired to the target node. Keep it in the graph and avoid bypassing it.

## Quick start

1. Add `AUN Preset Manager`.
2. Set `node_identifier` to the target node's numeric ID or title (comma-separated for several targets). Node ID badges can be enabled in ComfyUI settings.
3. Click **Setup** in the node title (or right-click → *AUN: Setup presets...*), pick the widgets to include, and create the preset rows.
4. Choose `manual_preset`:
   - a row name or number for a fixed row;
   - **Sequential** to advance one row per queued run (or per `runs_per_row` runs);
   - **Random** to pick a random row each time (held for `runs_per_row` runs).
5. Set `visible_rows` to the number of active rows. `match_keywords` should be **No** for a pure sweep.
6. Queue the workflow. The row is applied before validation, so the target really executes with those values, including on cached re-runs.

## Why values are applied at queue time

ComfyUI evaluates `IS_CHANGED` and caches node outputs after validation. If a widget were changed only during execution, the target could reuse a cached result from the previous preset. The manager therefore registers an on-prompt handler that rewrites the submitted prompt **before validation**, exactly like editing the widget in the UI would.

- Linked inputs are never overwritten. Convert a target widget back to a widget if you want the manager to control it.
- Values are coerced to the target input type. Invalid combo choices (for example a checkpoint filename that is not installed) are skipped, and the reason appears in the node footer/notes.
- Because the values are in the prompt before caching, switching checkpoints correctly invalidates the model cache.

## Inputs

| Input | Type | Notes |
| --- | --- | --- |
| `node_identifier` | STRING | Target node ID or title. Comma-separated for multiple targets, e.g. `17, 31`. |
| `manual_preset` | STRING (UI combo) | Row name/number for a fixed row, or **Sequential** to cycle rows. |
| `match_keywords` | Yes / No | `Yes` matches keywords from `reference_phrase` first; the first matching row wins, falling back to the manual/cycled row. Use `No` for sweeps. |
| `manual_index` | INT (input socket) | When connected and > 0, selects a row directly. Cycling (`manual_preset = Sequential`) takes precedence when active. |
| `visible_rows` | INT 1..20 | Number of active preset rows. Rows beyond this are ignored. |
| `case_sensitive` | BOOLEAN | Case sensitivity for keyword matching. |
| `reference_phrase` | STRING (input socket) | Text scanned for row keywords (substring matching). |
| `preset_data` | STRING (hidden) | JSON row data edited by the Setup dialog. Do not edit unless you know the format. |
| `reset_token` | INT (hidden) | Bumped by the Reset title-bar button; a changed value restarts the cycle at row 1 / run 1 on the next queued prompt. |
| `runs_per_row` | INT 1..10000 | How many queued runs stay on each row before advancing. `1` restores the old one-row-per-run behaviour. |
| `counter_target` | STRING | Optional node ID/title whose widget receives the current run-in-row index (`1..runs_per_row`) on every queued run. Comma-separated for multiple targets. |
| `counter_widget` | STRING | Widget name on `counter_target` that receives the run index. Default `index`. |

`preset_data` and `reset_token` are hidden from the canvas; the other widgets are visible and are hidden in compact mode.

## Outputs

| Output | Type | Notes |
| --- | --- | --- |
| `selected_values` | STRING | The selected row's values as a JSON object. Feed `AUNApplyPresetToNode` if you prefer explicit application. |
| `matched_keyword` | STRING | The keyword that selected the row, if any. |
| `matched_index` | INT | The selected row number (1-based). |
| `value_1` … `value_12` | ANY | The included widgets' values in the order stored in `preset_data.widgets`, for direct wiring into converted inputs or nodes such as `AUNSaveImageV2`. |

The queue-time row/run is stored on the prompt, so if the manager node executes, its outputs and footer match the values that were actually applied.

## Setup dialog

Open it from the **Setup** title button or the node menu.

- **Rows** stepper sets `visible_rows`.
- **Widgets:** chips include or exclude individual widgets from the rows. Include only the widgets you want to sweep. Usually exclude `seed` so ComfyUI can randomise it per queued prompt.
- **Row fields** are typed per widget. Use `Capture` to read the target's current widget values into a row.
- **Copy / Paste** duplicate a row inside the dialog.
- **Delete** removes a row and shifts the rows below up.
- **Import JSON / Export JSON** move row sets between workflows.

Import format:

```json
{
  "target_id": "17",
  "widgets": ["ckpt_name"],
  "rows": [
    { "name": "Row 1", "keyword": "", "values": { "ckpt_name": "modelA.safetensors" } }
  ]
}
```

`target_id` is informational; the node's `node_identifier` decides where values are written. With multiple targets, shared widget names are stored per target (`values["<id>"] = {...}`), while unique names are also stored flat. The backend handles both shapes.

## Cycling, Reset and runs per row

- **Sequential**: advances one row per `runs_per_row` queued runs (one per run when `runs_per_row = 1`) and wraps at `visible_rows`. Running the full set returns to row 1 automatically.
- **Random**: picks a random row each time. With `runs_per_row > 1`, a random row is held for N runs before rolling again.
- **Reset** (title-bar button or *AUN: Restart cycle at row 1*) restarts the next queued prompt at row 1 / run 1. It is one-shot: the rest of that batch continues from row 1/run 1. This is useful after stopping mid-sweep, which otherwise continues from the stopped row.
- **runs_per_row** holds the row and increments an internal run index. **counter_target** writes that index at queue time, so another node (typically a text index switch in **Select** mode) sees the right index before validation/caching.
- A full sweep normally queues `rows × runs_per_row` prompts (batch count). `batch_size` multiplies images per prompt; it does not advance the row faster.
- The footer preview shows the selected row/name and, when `runs_per_row > 1`, `run x/N`.

## Recipes

### 1. Prompt sweep with one row per prompt

- Target the positive `CLIP Text Encode` node.
- Include `text` in the rows; store one prompt per row.
- `manual_preset = Sequential`, `match_keywords = No`, `visible_rows` = prompt count.
- Queue that many runs.

### 2. Checkpoint sweep: every prompt before the next checkpoint

This is the `runs_per_row` + `counter_target` pattern. See the ready-made example: [Checkpoint sweep workflow](./example_workflows/Image/AUNExampleWF-PresetSweep-RunsPerRow.json).

1. Text switch (`AUNTextIndexSwitch4`):
   - `mode = Select`;
   - put each prompt in a slot, **first line = label/title, second line = the actual prompt**;
   - set `slot_count` to the prompt count;
   - leave `index` unlinked.
2. Preset Manager:
   - `node_identifier` = the loader node (for example `AUN Inputs Basic`);
   - `runs_per_row` = prompt count;
   - `counter_target` = the text switch node ID;
   - `counter_widget` = `index`;
   - `visible_rows` = number of checkpoints;
   - `manual_preset = Sequential`, `match_keywords = No`.
3. Setup: create one row per checkpoint, containing `ckpt_name` (or your model widget).
4. Queue `checkpoints × runs_per_row` runs.

The checkpoint stays for all prompts, the switch index steps 1..N, and then the next checkpoint starts at prompt 1. Both values are fixed at queue time, so stopping/cancelling cannot desynchronise them.

### 3. Multiple targets

Put several IDs/titles in `node_identifier` (for example a checkpoint loader and a text encoder, or high-noise and low-noise UNET loaders). Setup scans all of them; a row stores each target's values. Linked inputs are skipped, so only unlinked widgets are controlled.

### 4. Keyword-selected presets

- `match_keywords = Yes`.
- Give rows comma-separated keywords.
- Connect a prompt or text output to `reference_phrase`.
- The first row whose keyword appears in the phrase wins; otherwise the manual/cycled row is used.

## Relationship to Apply Preset To Node

The manager can apply rows itself (the normal path) or output `selected_values` to `AUNApplyPresetToNode`. The Apply node is useful for:

- fan-out with `only_widgets` filters;
- renaming values with `aliases`;
- keeping application explicit in the graph.

Both paths apply at queue time, before validation and caching. See [Applying values that only exist during execution](./preset-manager-execution-ordering.md) for the ordering details.

## Limits and caveats

- Maximum 20 preset rows per manager. Use `runs_per_row`/`counter_target` instead of duplicating rows for prompts.
- `runs_per_row` counts queued prompts, not images.
- The most common index switches expose up to 20 slots; `counter_target` indices must fit the switch.
- The counter target's widget must be unlinked, and a text switch must be in **Select** mode. In **Increment** mode the switch advances itself and ignores the written index.
- All `counter_target` nodes share the same `counter_widget` name.
- A checkpoint change reloads the model; identical consecutive rows reuse the loaded model.
- Cycling state is held in memory per ComfyUI process. A restart starts at row 1 / run 1. The Reset token survives in the workflow, but the cycle state does not.
- Bypassing the manager removes it from the prompt, so no presets are applied.
- In compact mode the configuration widgets are hidden; double-click or use the node menu to restore them.
- `seed` included in a row means the same seed for every run on that row. Exclude it unless you want that.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Presets are not applied | `node_identifier` matches the node ID/title; the manager is not bypassed; the target widget is not linked; the value is valid for a combo (check the footer notes). |
| Canvas widget does not change | Updates are deferred to the start of each run. Run once, check the footer; hard-refresh after updating the extension. |
| Sweep starts on the wrong row | Click **Reset**; remember a restart clears the cycle state. Check `visible_rows` and `runs_per_row`. |
| Checkpoint changes too early | `runs_per_row` is lower than the prompt count; the text switch is in Increment instead of Select; `counter_target`/`counter_widget` is wrong. |
| Prompt text is empty | The **first line** of a text switch slot is the label and is removed from the text output. Put the actual prompt on the second line. |
| Same image every run | `seed` is included in the preset row. Exclude it and let the seed control randomise. |
| Filenames collide | Include the model and/or the prompt label in the filename (for example the text switch's `label` output). |
| More than 20 rows needed | Use one row per checkpoint plus `runs_per_row`/`counter_target`, or split the sweep across managers. |
| Values do not apply on cached runs | If you wired values manually instead of letting the manager apply them, ensure `AUNApplyPresetToNode` is used; the manager's own path already applies before caching. |

## Related

- [Checkpoint sweep example](./example_workflows/Image/AUNExampleWF-PresetSweep-RunsPerRow.json)
- [Applying values that only exist during execution](./preset-manager-execution-ordering.md)
- [Pack architecture: what links to what](./ARCHITECTURE.md)
