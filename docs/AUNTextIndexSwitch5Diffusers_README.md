# AUNTextIndexSwitch5Diffusers — Text Index Switch 5 Diffusers

Purpose: Diffusers variant of Text Index Switch 5. Switches between up to 20 text inputs based on index number with built-in mode selection (Select, Increment, Random, Range), and scans the selected text for diffusers-specific `key=value` tokens (`diffusion_name`, `clip_name`, `vae_name`, `clip_type`) plus sampler settings, outputting each as a typed value. Those tokens are removed from the text output.

In compact mode the editor popup provides dropdown selectors for diffusion model, CLIP, VAE, and CLIP type files (fetched from the installed file lists), making it easy to insert the correct token values.

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

The following keys are recognized in the selected text. Tokens like `key=value` matching these keys are removed from the `text` output. Values may be a single space-free token or enclosed in quotes (`clip_type="stable_diffusion"`). Keys are matched case-insensitively.

| Key | Output type | Default when absent |
|---|---|---|
| `diffusion_name` | STRING | `""` |
| `clip_name` | STRING | `""` |
| `vae_name` | STRING | `""` |
| `clip_type` | STRING | `""` |
| `sampler` | STRING | `""` |
| `scheduler` | STRING | `""` |
| `cfg` | FLOAT | `2.0` |
| `steps` | INT | `10` |
| `seed` | INT | `0` |

Any other `key=value` tokens (keys outside the list above) are left untouched in the text output.

## Modes

Identical to `AUNTextIndexSwitch5`: `Select`, `Increment`, `Random`, and `Range` behave the same way.

## Compact mode

- Double-click the node header to toggle between Normal and Compact modes.
- Compact mode hides configuration widgets while keeping essential controls visible.
- The editor popup (double-click a text slot) provides dropdown selectors for diffusion model, CLIP, VAE, and CLIP type files, making it easy to insert the correct token values without typing them manually.

## Example

A single slot with:

```
diffusion_name=flux1-dev.safetensors clip_name=clip_l.safetensors vae_name=ae.safetensors clip_type=stable_diffusion
sampler=dpmpp_2m scheduler=karras cfg=4.5 steps=20 seed=42
A masterpiece, highly detailed
```

loads the diffusers parameters from the tokens, outputs the prompt text ("A masterpiece, highly detailed") with the label "A masterpiece...", and `diffusion_name`, `clip_name`, `vae_name`, `clip_type`, `sampler`, `scheduler`, `cfg`, `steps`, `seed` are emitted as typed outputs that can feed downstream nodes like `AUNInputsDiffusersBasic`.

## Notes

- This is the diffusers counterpart to `AUNTextIndexSwitch5` (which uses `model` for checkpoint names).
- Text inputs are optional — if an index points to a slot with no content, it outputs an empty string.
- Range validation ensures `minimum <= maximum`, and values are clamped to `slot_count`.
- The **range** field is only active in Range mode; it is ignored in other modes.
- A numeric value that fails to parse falls back to the key's default.
- Connect the `index` output to `AUNMultiUniversal.Index` or `AUNRandomLoraModelOnlyMulti.prompt_index` to drive other nodes from the same selection.
