# Applying values that only exist during execution (Preset Manager)

Date: 2026-11-08. Applies to `AUNPresetManager.py` / `AUNApplyPresetToNode.py`,
and is the pattern to reuse for any node whose downstream target has to be
updated with a value that is only known at run time.

## The symptom

`AUNPresetManager` with `manual_index` wired from an index switch in
**Random / Increment / Range** mode:

- the node's outputs and its canvas footer show the correct row (e.g. `preset 6`),
- the target nodes keep their previous widget values, so the run does not match
  what the node displays,
- with a **Select**-mode index everything worked, because the value is a widget
  and can be resolved at queue time.

## Why

Application is normally done by an `on_prompt` handler at **queue time**
(`_aun_apply_presets_on_prompt`), *before* validation and execution. That only
works when the selection can be resolved statically. A linked Random/Increment/
Range index only exists when the source node executes, and the targets do not
depend on the manager, so they run with stale inputs.

Executing the source at queue time to find out is not an option: it consumes
RNG/cycle state, so the real run would use a different value (and double-advance
Increment state).

## The pattern

Two phases.

### 1. Queue time — provisionally resolve, otherwise order

- Try static resolution first (`_resolve_manual_index` handles literals and
  index switches in Select mode). If it works, write the values immediately as
  before and do not reorder anything.
- If it cannot be resolved, inject a **harmless undeclared link** into each
  target node in the prompt:

  ```python
  target["inputs"]["__aun_pm_order_<source_id>"] = [source_id, 0]
  ```

  Verified against the local executor (`comfy_execution/graph.py`,
  `execution.py`):
  - `TopologicalSort.add_node` builds dependencies from **every** link in
    `inputs`, declared or not.
  - `validate_inputs` only iterates the node's declared inputs, so the extra
    key is ignored.
  - `get_input_data` only passes declared inputs to the node, so it never
    reaches the function.

  The target is now blocked until the source node finishes, without any change
  in inputs or behavior.
- Refuse the injection when it would close a cycle (`_depends_on`) — e.g. when
  the index source depends on the target. Warn and continue; those targets keep
  their existing values.

### 2. Execution time — write into the prompt

The source node receives the original prompt through the hidden `prompt`
(`"PROMPT"`) input. `DynamicPrompt.get_node()` returns the same dict that the
executor later reads, so a node can update other nodes' inputs before they run:

```python
_write_values_into_node(prompt[str(target_id)], values, notes)
```

`AUNPresetManager.select_preset()` does this after it resolves the real index,
and emits one `AUN_apply_preset_applied` event per target so the canvas widgets
match the run. `AUNApplyPresetToNode.apply()` already wrote at execution time —
it only needed the ordering step.

Caching follows automatically: the fake link makes the manager an ancestor of
the target, and the manager's `IS_CHANGED` is always-changed, so the target's
cache signature changes each run and cycling/random targets re-execute.

## Reusing it

1. At queue time, if a needed value is unresolvable, call
   `_order_targets_after(prompt, source_id, identifier)`.
2. At execution, write the resolved values into the target prompt entries with
   `_write_values_into_node`, and send `AUN_apply_preset_applied` so the
   frontend syncs.

Keep the fake key name unique per source (`__aun_pm_order_<id>`); never declare
it in `INPUT_TYPES`.

## Verified behavior

- Select-mode index: resolved and applied at queue time, no forced re-run.
- Random / Increment / Range: targets wait for the manager; both targets in a
  `"1,3"` identifier receive the run's values; canvas syncs per target.
- Cycle case: injection refused with a warning, no executor cycle.
- `AUNApplyPresetToNode` path with `preset_values` linked to an unresolvable
  manager: targets ordered after the Apply node, which applies at execution.
- Index clamping parity (`slot_count`, `MAX_INPUTS`) and multi-target nested
  value maps covered by the same test set.
