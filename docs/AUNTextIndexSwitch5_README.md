# AUNTextIndexSwitch5 — Text Index Switch 5

Purpose: All-in-one text switch with built-in index generation (Select, Increment, Random, Range) that also extracts `key=value` settings from the selected text. Combines index selection and text switching in a single node, supporting up to 20 text slots with compact mode support.

In addition to the selected text, label, and index, it scans the selected slot's text for `key=value` tokens and exposes each as a typed output (e.g. `cfg=1.4` → `cfg` FLOAT output). Those tokens are removed from the text output so the prompt stays clean.

## Inputs

### Required

- `minimum` (INT): Minimum index for selection (inclusive).
- `maximum` (INT): Maximum index for selection (inclusive).
- `mode`: Index generation mode.
  - `Select`: use the fixed value from `index`.
  - `Increment`: cycle through the range sequentially on each execution.
  - `Random`: pick a random index within `[minimum, maximum]`.
  - `Range`: cycle through indices specified in the `range` field.
- `index` (INT): Current or target index (used as fixed value in Select mode; also serves as display/seed for other modes).
- `slot_count` (INT 1–20): Number of visible text slots on the node.
- `range` (STRING): Comma-separated list of indices or sub-ranges used in Range mode (e.g., `1,2,5-8,12`).

### Per-slot inputs

- `text1` to `text20` (STRING, multiline): Text inputs to select from. Inputs beyond `slot_count` are hidden.

## Outputs

- `text` (STRING): The selected text from the chosen input slot, with known `key=value` tokens removed.
- `label` (STRING): Descriptive label for the selected input — derived from connected node title, custom workflow label, or first line of the text content.
- `index` (INT): The resolved index value after mode processing.

### Extracted parameters

The following keys are recognized in the selected text. Tokens like `key=value` matching these keys are removed from the `text` output. Values may be a single space-free token or enclosed in quotes (`cfg="1.4"`). Keys are matched case-insensitively.

| Key | Output type | Default when absent |
|---|---|---|
| `model` | STRING | `""` |
| `sampler` | STRING | `""` |
| `scheduler` | STRING | `""` |
| `cfg` | FLOAT | `2.0` |
| `steps` | INT | `10` |
| `seed` | INT | `0` |

Any other `key=value` tokens (keys outside the list above) are left untouched in the text output.

## Modes

### Select
Uses the exact value in `index`. Deterministic and stable across executions.

### Increment
Cycles through `[minimum, maximum]` sequentially on each execution. Wraps back to `minimum` after reaching `maximum`. Each node maintains its own unique position in the cycle independently.

### Random
Picks a random index within `[minimum, maximum]` using `SystemRandom()` (not affected by global seed). Each execution produces an independent result.

### Range
Cycles through the indices specified in the `range` field on each execution. Supports individual values (`1,3,5`) and sub-ranges (`5-8`). Invalid indices are filtered out automatically.

## Label Selection

The **label** output is determined like this:

1. If the selected input slot has a custom label in the workflow UI, it uses that.
2. Otherwise, if the selected input is connected to another node, it uses that node's title (or type if no title).
3. If unconnected and the text has content, it uses the first line of the text as the label (and removes it from the output text). Known `key=value` tokens are stripped before this step, so a first line of only settings does not become the label.

## Compact mode

- Double-click the node header to toggle between Normal and Compact modes.
- Compact mode hides configuration widgets while keeping essential controls visible.
- Manual node width is preserved across mode toggles and workflow reloads.

## Common setups

- Use as a replacement for `AUNRandomTextIndexSwitch` + `AUNTextIndexSwitch3` chains — this single node handles both index generation and text switching.
- Put settings inline in a slot. When the slot is unconnected, the first line becomes the label and the remaining lines are the text output, e.g.:

  ```
  cinematic portrait
  cinematic lighting, portrait photo
  cfg=4.5 steps=20 seed=42
  model=sdxl_base_v1.0.safetensors sampler=dpmpp_2m scheduler=karras
  ```

  Here `cinematic portrait` is used as the label, the text output is `cinematic lighting, portrait photo` (settings removed), while `cfg`, `steps`, `seed`, `model`, `sampler`, and `scheduler` are emitted as typed outputs that can drive nodes like a sampler or a loader-from-string. When the slot is connected to another node, that node's title is used as the label and the full cleaned text is passed through.
- Connect the `index` output to `AUNMultiUniversal.Index` or `AUNRandomLoraModelOnlyMulti.prompt_index` to drive other nodes from the same selection.
- Use Range mode when you want to skip certain slots (e.g., `1,3,5-8` to exclude 2 and 4).

## Notes

- Text inputs are optional — if an index points to a slot with no content, it outputs an empty string.
- Range validation ensures `minimum <= maximum`, and values are clamped to `slot_count`.
- The **range** field is only active in Range mode; it is ignored in other modes.
- A numeric value that fails to parse falls back to the key's default.
- This node does not display a blue slot highlighter — the index output serves as the selection indicator instead.
