# AUNRandomTextIndexSwitchV2

An extended version of `AUNRandomTextIndexSwitch` that adds a **Range** selection mode, allowing arbitrary sets of indices to be specified as a comma-separated list.

## Overview

This node generates an index using one of four modes and uses that index to select from up to 20 text inputs. It outputs the selected text, its descriptive label, and the generated index.

## Features

- **Index Generation Modes**:
  - **Select**: Use a fixed index value
  - **Increment**: Cycle through the index range sequentially
  - **Random**: Generate a random index within the specified range
  - **Range**: Randomly pick from a custom comma-separated list of indices/sub-ranges (e.g. `1,2,5-8,12`)

- **Label Output**: Emits a human-friendly label for the selected slot

- **Multiple Outputs**: Provides the selected text, a descriptive label, and the generated index for downstream use

## Inputs

- **minimum** (INT): Minimum index value (inclusive, default: 1). Used by Increment and Random modes.
- **maximum** (INT): Maximum index value (inclusive, default: 10). Used by Increment and Random modes.
- **mode** (Select/Increment/Random/Range): Index generation mode.
- **select** (INT): Fixed index value when in Select mode.
- **range** (STRING): Comma-separated indices or sub-ranges used in Range mode (e.g. `1,2,5-8,12`).
- **visible_inputs** (INT): How many text input sockets to expose on the node (2–20). Range/Increment/Random selection is clamped to this value.
- **text1** to **text20** (STRING, optional): Text inputs to select from.

## Outputs

- **text** (STRING): The selected text from the chosen input.
- **label** (STRING): Descriptive label for the selected input (automatically generated or from connected node title).
- **index** (INT): The generated index value.

## Usage Examples

### Random Prompt Selection

1. Set **visible_inputs** to the number of slots you want (2–20)
2. Connect text nodes containing different prompts to the text inputs
3. Set mode to **Random**
4. The node will randomly select one prompt on each execution

### Custom Range Selection

1. Connect prompt nodes to text inputs
2. Set mode to **Range** and enter a range string such as `1,3,5-8`
3. The node will randomly pick from only those specified indices

### Sequential Cycling

1. Connect prompt nodes to text inputs
2. Set mode to **Increment**
3. The node cycles through indices in order on each execution

### Fixed Selection

1. Connect prompt nodes to text inputs
2. Set mode to **Select** and choose the desired index

## Visual Indicator

After a workflow run, the node draws a subtle blue highlight and a **▶** arrow on the input row corresponding to the selected index. This makes it easy to see at a glance which text input was active without checking the index output.

## Label Selection

The **label** output is determined like this:

1. If the selected input slot has a custom label in the workflow UI, it uses that.
2. Otherwise, if the selected input is connected, it uses the connected node's title/type.
3. If the selected input is unconnected, it falls back to `Text N`.

## Notes

- The node executes on workflow queue, ensuring the index is generated at the start of execution
- Text inputs are optional — if an index points to an unconnected input, it outputs an empty string
- Range validation ensures minimum ≤ maximum, and values are clamped to `visible_inputs`
- The **range** field is only active in Range mode; it is ignored in other modes
- See `AUNRandomTextIndexSwitch` for the original version without Range mode
