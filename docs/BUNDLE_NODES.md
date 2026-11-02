# Bundle Set Nodes and Split Bundle

Track of AUN nodes adapted to act as bundle setters (a `set` STRING input + a `bundle` `OBVPM_BUNDLE` output), and of the `Split Bundle` reader that turns a bundle back into fields. A bundle is a plain dict, so the wire type string is kept as an opaque compatibility token: AUN neither imports nor needs another node pack to produce or read one.

## Reading bundles

`AUNSplitBundle` ("Split Bundle") has one output pin per field:

- **wired**: a bundle output goes into its `bundle` input;
- **by name**: `get` on + `constant` set to another node's `set` name, resolved at prompt build across subgraphs with no wire. The `constant` picker is a drop-down (and is hidden while `get` is off);
- **pin order**: the **Fields…** button opens a dialog that lists the output pins for drag-to-reorder. The order is stored as field names in `properties.aun_split_order`; fields the saved order does not mention keep the bundle's own order after the ordered ones. **Reset order** restores the bundle's own order in the dialog (the bundle resolves its fields; the saved order only rearranges them). Reordering snapshots each field's wires before renaming the pins and re-homes them with `node.connect()`, so a wire follows its field to the new pin (a link with no target node, such as a subgraph output, has its origin slot retargeted directly).
- **hidden fields**: a tick box per row hides that field's output pin; the hidden names are stored in `properties.aun_split_hidden`, and **Show all** clears them. A connected pin cannot be hidden, and hiding removes pins only after the remaining wires have been re-homed.

Field names come from `aunBundleNames`; older AUN nodes still expose `obvpmBundleNames`, which is read as a fallback. OBVPM's Unbundle and KJ Get are optional readers if that pack is installed, not requirements.

## Pattern (applied to each setter node)

1. Python: import `BUNDLE` from `.aun_bundle_shared`; add optional `set` STRING input; add `BUNDLE` as last output named `bundle` containing a dict of the node's outputs; accept `set=""` in the function; return the bundle in every return path; update `DESCRIPTION`.
2. JS: create `web/AUN_<node>_obvpm_constant.js` setting `obvpmConstantWidget = "set"`, runtime `obvpmConstantOutput` (finds the `OBVPM_BUNDLE` slot), and `obvpmBundleNames` returning the field-name list. The shared resolver also accepts the AUN-native names (`aunConstantWidget`, `aunConstantOutput`, `aunBundleNames`).
3. `web/AUN_bundle_slot_fix.js`: add the node class to `AUN_INPUT_CLASSES` so OBVPM/KJ slot-0 assumptions are corrected if those readers are present.
4. Update node README + CHANGELOG entry.

## Completed (verified working)

- `AUNImageSingleBatch3` — bundle fields: `image`, `filename`, `cleaned_filename`
- `AUNImageLoadResize` — bundle fields: `image`, `mask`, `filename`, `cleaned_filename`, `width`, `height`
- `AUNImageResize` — bundle fields: `image`, `mask`, `width`, `height`
- `AUNImgLoader` — bundle fields: `image`, `mask`, `filename`, `cleaned_filename`
- `AUNManualAutoImageSwitch` — bundle fields: `filename`, `manual_name`, `name_mode`, `image`
- `AUNKSamplerPlusv3` — bundle fields: `base_image`, `image_upscaled`, `latent_upscaled`, `both_upscaled`, `refined_image`, `latent`, `upscaled_type`
- `AUNPromptCycler` — bundle fields: `prompt`, `prompt_title`, `index`
- `AUNMultiPromptCycler` — bundle fields: `prompt`, `prompt_title`
- `AUNWildcardAddToPrompt` — bundle fields: `prompt`, `populated_text`
- `AUNTextIndexSwitch` — bundle fields: `text`, `label`
- `AUNTextIndexSwitch3` — bundle fields: `text`, `label`, `index`
- `AUNTextIndexSwitch4` — bundle fields: `text`, `label`, `index`
- `AUNTextIndexSwitch5` — bundle fields: `text`, `label`, `index`, `model`, `sampler`, `scheduler`, `cfg`, `steps`, `seed`
- `AUNTextIndexSwitch5Diffusers` — bundle fields: `text`, `label`, `index`, `diffusion_name`, `clip_name`, `vae_name`, `clip_type`, `sampler`, `scheduler`, `cfg`, `steps`, `seed`
- `AUNRandomTextIndexSwitch` — bundle fields: `text`, `label`, `index`
- `AUNRandomTextIndexSwitchV2` — bundle fields: `text`, `label`, `index`, `prefixed_label`
- `AUNAnyIndexSwitch` — bundle fields: `output`, `label`
- `AUNCheckpointLoaderWithClipSkip` — bundle fields: `model`, `clip`, `vae`, `name`, `clip_skip`
- `AUNLoraLoaderModelOnlyFromString` — bundle fields: `model`, `resolved_lora`
- `AUNLoraStackWithTriggers` — bundle fields: `model`, `selected_loras`, `labels`, `trigger_words`, `trigger_prompt`
- `AUNLoraStackWithTriggersModelClip` — bundle fields: `model`, `clip`, `selected_loras`, `labels`, `trigger_words`, `trigger_prompt`
- `AUNLoRAsByPromptIndex` — bundle fields: `model`, `clip`, `selected_loras`, `index`, `trigger_words`, `trigger_prompt`. The `set` widget is kept invisible (zero-size + no canvas draw + DOM hidden) and edited via right-click → "AUN: Set OBVPM constant name…" because its overlay system clips a visible widget.
- `KSamplerInputs` — bundle fields: `sampler`, `scheduler`, `cfg`, `steps`
- `AUNKSamplerPlusV2` / `AUNKSamplerPlusv4` — bundle fields: `base_image`, `image_upscaled`, `latent_upscaled`, `both_upscaled`, `refined_image`, `latent`, `upscaled_type`
- `AUNEmptyLatent` — bundle fields: `latent`, `width`, `height`, `seed`
- `AUNWan22MoE` — bundle fields: `latent`, `image`
- `AUNInputsBasicSwitch` — bundle fields: `model`, `clip`, `vae`, `ckpt_name`, `sampler`, `scheduler`, `cfg`, `steps`, `latent`, `width`, `height`, `seed`, `batch_size`, `text`, `label`, `index`
- `AUNSplitBundle` — the reader: one output per field, wired or by constant name. No pack required.

## Next candidates (image family done; suggested next families)

- Image save / title preview nodes (`AUNSaveImage`, `AUNSaveImageV2`, `AUNTitleImagePreview`)
- Text/prompt nodes (high value for bundle passing)
- Latent / inputs-adjacent nodes
- Any multi-output node where get-by-name reduces wiring

## Notes

- Audits pass: `generate_readme_nodes.py`, `audit_node_docs.py --fail-on-missing`, `audit_js_utils.py --fail-on-missing`.
- Restart ComfyUI after changes.