# AUNRandomTextIndexSwitch

A combined node that merges the functionality of `AUNRandomIndexSwitch` and `AUNTextIndexSwitch` into a single streamlined component for dynamic text selection with randomization.

## Overview

This node generates an index using one of three modes and uses that index to select from up to 20 text inputs. It outputs the selected text, its descriptive label, and the generated index.

## Features

- **Index Generation Modes**:
  - **Select**: Use a fixed index value
  - **Increment**: Cycle through the index range sequentially
  - **Random**: Generate a random index within the specified range

- **Label Output**: Emits a human-friendly label for the selected slot

- **Multiple Outputs**: Provides the selected text, a descriptive label, and the generated index for downstream use

## Inputs

- **minimum** (INT): Minimum index value (inclusive, default: 1)
- **maximum** (INT): Maximum index value (inclusive, default: 10)
- **mode** (Select/Increment/Random): Index generation mode
- **select** (INT): Fixed index value when in Select mode
- **visible_inputs** (INT): How many text input sockets to expose on the node (2–20). Range selection is clamped to this value.
- **text1** to **text20** (STRING, optional): Text inputs to select from

## Outputs

- **text** (STRING): The selected text from the chosen input
- **label** (STRING): Descriptive label for the selected input (automatically generated or from connected node title)
- **index** (INT): The generated index value

## Usage Examples

### Random Prompt Selection
1. Set **visible_inputs** to the number of slots you want (2–20)
2. Connect up to 20 text nodes containing different prompts to the text inputs
3. Set mode to "Random"
4. The node will randomly select one of the connected prompts on each execution
5. Use the text output for your generation workflow

### Sequential Prompt Cycling
1. Connect prompt nodes to text inputs
2. Set mode to "Increment"
3. The node will cycle through prompts in order on each execution
4. Useful for batch processing with varying prompts

### Fixed Prompt Selection
1. Connect prompt nodes to text inputs
2. Set mode to "Select" and choose the desired index
3. The node will consistently output the selected prompt

## Label Selection

The **label** output is determined like this:

1. If the selected input slot has a custom label in the workflow UI, it uses that.
2. Otherwise, if the selected input is connected, it uses the connected node's title/type.
3. If the selected input is unconnected, it falls back to `Text N`.

## Workflow Integration

- Connect the **text** output to text encoders or prompt inputs
- Use the **index** output to track which input was selected or for conditional logic
- The **label** output provides human-readable identification of the selected input

## Notes

- The node executes on workflow queue, ensuring the index is generated at the start of execution
- Text inputs are optional - if an index points to an unconnected input, it outputs an empty string
- Range validation ensures minimum ≤ maximum, and values are clamped to `visible_inputs`.