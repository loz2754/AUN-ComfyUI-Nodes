# AUNTextIndexSwitch4 — Text Index Switch 4

Purpose: All-in-one text switch with built-in index generation. Combines index selection (Select, Increment, Random, Range) and text switching in a single node, supporting up to 20 text slots with compact mode support.

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

- `text` (STRING): The selected text from the chosen input slot.
- `label` (STRING): Descriptive label for the selected input — derived from connected node title, custom workflow label, or first line of the text content.
- `index` (INT): The resolved index value after mode processing.

## Modes

### Select
Uses the exact value in `index`. Deterministic and stable across executions.

### Increment
Cycles through `[minimum, maximum]` sequentially on each execution. Wraps back to `minimum` after reaching `maximum`.

### Random
Picks a random index within `[minimum, maximum]` using `SystemRandom()` (not affected by global seed). Each execution produces an independent result.

### Range
Cycles through the indices specified in the `range` field on each execution. Supports individual values (`1,3,5`) and sub-ranges (`5-8`). Invalid indices are filtered out automatically.

## Label Selection

The **label** output is determined like this:

1. If the selected input slot has a custom label in the workflow UI, it uses that.
2. Otherwise, if the selected input is connected to another node, it uses that node's title (or type if no title).
3. If unconnected and the text has content, it uses the first line of the text as the label (and removes it from the output text).

## Compact mode

- Double-click the node header to toggle between Normal and Compact modes.
- Compact mode hides configuration widgets while keeping essential controls visible.
- Manual node width is preserved across mode toggles and workflow reloads.

## Common setups

- Use as a replacement for `AUNRandomTextIndexSwitch` + `AUNTextIndexSwitch3` chains — this single node handles both index generation and text switching.
- Connect the `index` output to `AUNMultiUniversal.Index` or `AUNRandomLoraModelOnlyMulti.prompt_index` to drive other nodes from the same selection.
- Use Range mode when you want to skip certain slots (e.g., `1,3,5-8` to exclude 2 and 4).

## Notes

- Text inputs are optional — if an index points to a slot with no content, it outputs an empty string.
- Range validation ensures `minimum <= maximum`, and values are clamped to `slot_count`.
- The **range** field is only active in Range mode; it is ignored in other modes.
- Unlike Text Index Switch 3, this node does not display a blue slot highlighter — the index output serves as the selection indicator instead.
