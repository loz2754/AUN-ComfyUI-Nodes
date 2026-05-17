# AUNWildcardAddToPrompt — AUN Wildcard Add-To-Prompt

Purpose: Randomize local wildcard syntax on every execution, then conditionally append or prepend the populated text to an existing prompt string.

## Inputs

### Required

- `text_to_add` (STRING, multiline): Wildcard template text. Used directly in `populate` mode.
- `wildcard_selector` (COMBO): Quick selector that inserts an available wildcard token into `text_to_add` in the node UI.
- `delimiter` (STRING): Separator used when both sides are non-empty.
- `order` (`prompt_first` / `text_first`): Whether the base prompt comes before or after the processed text.
- `mode` (`on` / `off` / `random`): Whether the processed text is applied.

### Optional

- `prompt` (STRING, input): Base prompt to modify. If not connected, treated as empty.

## Outputs

- `prompt` (STRING): The combined prompt string.
- `populated_text` (STRING): The processed wildcard result before concatenation.

## Notes

- This node no longer imports runtime code from Impact Pack.
- Wildcard values are loaded only from your local [wildcards/README.md](n:/ComfyUI_windows_portable_dev/ComfyUI/custom_nodes/aun-comfyui-nodes/wildcards/README.md) folder.
- The selector dropdown is populated from discovered wildcard files and appends the chosen token into `text_to_add` for convenience.
- Supported prompt syntax includes `__wildcard__`, quantified wildcard expansion like `2#__wildcard__`, and option groups like `{red|blue|2::green}`.
- The node randomizes wildcard choices again on each execution and forces reevaluation so repeated generations do not stay cached.

## Compact mode

- Double-click the node header to toggle between Normal and Compact modes.
- Compact mode hides configuration widgets (`wildcards`, `wildcard_selector`, `delimiter`, `order`) and shows only `mode` and `populated_text`.
- Auto-height adjusts automatically to fit only the visible widgets.
- Manual width is preserved — resizing the node wider will stick across mode toggles and workflow reloads.
