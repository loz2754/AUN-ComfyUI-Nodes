# AUNRandomTextIndexSwitch

A combined node that merges the functionality of `AUNRandomIndexSwitch` and `AUNTextIndexSwitch` into a single streamlined component for dynamic text selection with randomization.

## Overview

This node generates an index using one of three modes and uses that index to select from up to 10 text inputs. It provides automatic input labeling and outputs the selected text, its descriptive label, and the generated index.

## Features

- **Index Generation Modes**:
  - **Select**: Use a fixed index value
  - **Increment**: Cycle through the index range sequentially
  - **Random**: Generate a random index within the specified range

- **Automatic Input Labeling**: Input slots automatically display the titles of connected nodes for easy workflow organization

- **Multiple Outputs**: Provides the selected text, a descriptive label, and the generated index for downstream use

## Inputs

- **minimum** (INT): Minimum index value (inclusive, default: 1)
- **maximum** (INT): Maximum index value (inclusive, default: 10)
- **mode** (Select/Increment/Random): Index generation mode
- **select** (INT): Fixed index value when in Select mode
- **text1** to **text10** (STRING, optional): Text inputs to select from

## Outputs

- **text** (STRING): The selected text from the chosen input
- **label** (STRING): Descriptive label for the selected input (automatically generated or from connected node title)
- **index** (INT): The generated index value

## Usage Examples

### Random Prompt Selection
1. Connect up to 10 text nodes containing different prompts to the text inputs
2. Set mode to "Random"
3. The node will randomly select one of the connected prompts on each execution
4. Use the text output for your generation workflow

### Sequential Prompt Cycling
1. Connect prompt nodes to text inputs
2. Set mode to "Increment"
3. The node will cycle through prompts in order on each execution
4. Useful for batch processing with varying prompts

### Fixed Prompt Selection
1. Connect prompt nodes to text inputs
2. Set mode to "Select" and choose the desired index
3. The node will consistently output the selected prompt

## Automatic Labeling

When you connect nodes to the text inputs, the input labels will automatically update to show the titles of the connected nodes. This makes it easy to identify which prompt or text source is connected to each slot.

If no node is connected to a selected input, the label will show "Text N" where N is the index number.

## Workflow Integration

- Connect the **text** output to text encoders or prompt inputs
- Use the **index** output to track which input was selected or for conditional logic
- The **label** output provides human-readable identification of the selected input

## Notes

- The node executes on workflow queue, ensuring the index is generated at the start of execution
- Text inputs are optional - if an index points to an unconnected input, it outputs an empty string
- Range validation ensures minimum ≤ maximum, with fallback to 1-10 if invalid