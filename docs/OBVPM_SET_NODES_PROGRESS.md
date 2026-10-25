# OBVPM Set-Node Conversion Progress

Track of AUN nodes adapted to act as OBVPM constants (via a `set` STRING input + a `bundle` OBVPM_BUNDLE output), so OBVPM Unbundle (get) / KJ Get can read their outputs by name and reduce node clutter.

## Pattern (applied to each node)

1. Python: import `BUNDLE` from `.aun_bundle_shared`; add optional `set` STRING input; add `BUNDLE` as last output named `bundle` containing a dict of the node's outputs; accept `set=""` in the function; return the bundle in every return path; update `DESCRIPTION`.
2. JS: create `web/AUN_<node>_obvpm_constant.js` setting `obvpmConstantWidget = "set"`, runtime `obvpmConstantOutput` (finds the OBVPM_BUNDLE slot), and `obvpmBundleNames` returning the field-name list.
3. `web/AUN_obvpm_slot_fix.js`: add the node class to `AUN_INPUT_CLASSES` so unpatched OBVPM's slot-0 assumption is corrected.
4. Update node README + CHANGELOG entry.

## Completed (verified working)

- `AUNImageSingleBatch3` — bundle fields: `image`, `filename`, `cleaned_filename`
- `AUNImageLoadResize` — bundle fields: `image`, `mask`, `filename`, `cleaned_filename`, `width`, `height`
- `AUNImageResize` — bundle fields: `image`, `mask`, `width`, `height`
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

## Next candidates (image family done; suggested next families)

- Image save / title preview nodes (`AUNSaveImage`, `AUNSaveImageV2`, `AUNTitleImagePreview`)
- Text/prompt nodes (high value for OBVPM bundle passing)
- Latent / inputs-adjacent nodes
- Any multi-output node where OBVPM get-by-name reduces wiring

## Notes

- Audits pass: `generate_readme_nodes.py`, `audit_node_docs.py --fail-on-missing`, `audit_js_utils.py --fail-on-missing`.
- Restart ComfyUI after changes.