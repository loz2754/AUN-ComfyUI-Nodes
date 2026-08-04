# AUN Example Workflows

Download a workflow PNG and drop it onto ComfyUI to load it. Each PNG has the workflow JSON embedded in its metadata. Standalone `.json` files are also available for direct import.

| Workflow | Description |
|----------|-------------|
| [PromptCycler + Random Multi-LoRA](AUNExampleWF-PromptCycler-LorasByIndex.png) · [JSON](AUNExampleWF-PromptCycler-LorasByIndex.json) | Cycle through prompts while dynamically applying different LoRA combinations per prompt using `AUN PromptCycler` and `AUN Random Multi-LoRA Model Loader`. |
| [Show Any / Passthrough Any Multi](AUNExampleWF-ShowAnyMulti.png) · [JSON](AUNExampleWF-ShowAnyMulti.json) | Illustrates `AUN Show Any Multi` and `AUN Passthrough Any Multi`: full display and collapsed modes, data-type badge toggle, inline image previews, and pass-through text representations of the input data. |
| [AUN Inputs Bundle](AUNExampleWF-Inputs.png) · [JSON](AUNExampleWF-Inputs.json) | Replace the checkpoint loader and KSampler settings with one `AUN Inputs` node: model, CLIP, VAE, latent, sampler, scheduler, CFG, steps, seed and more feeding a standard KSampler pipeline and `AUN Save Image V2`, with `AUN Show Any Multi` displaying the auto-generated filename and sidecar text live. |
| [File Saving Pipeline](AUNExampleWF-SavePipeline.png) · [JSON](AUNExampleWF-SavePipeline.json) | `AUN Inputs Basic` drives a standard KSampler pipeline, while automatic parameter-rich filenames from `AUN Path Filename V2` go straight into `AUN Save Image V2`, with `AUN Show Any Multi` displaying the saved filename and sidecar text live. |
| [AUN Image Slider Comparer](AUNExampleWF-ImageSliderComparer.png) · [JSON](AUNExampleWF-ImageSliderComparer.json) | Compare before/after images side by side with a draggable slider using `AUN Image Slider Comparer` (up to five pairs). |
| [AUN KSampler Plus v3](AUNExampleWF-KSamplerPlus.png) · [JSON](AUNExampleWF-KSamplerPlus.json) | The `AUN KSampler PlusV3` node in action: two-pass sampling with latent upscaling, outputting base, upscaled and refined images. |
| [Prompts Showcase](AUNExampleWF-Prompts.png) · [JSON](AUNExampleWF-Prompts.json) | Dynamic prompt selection with `AUN Text Index Switch 4`, negative selection via `AUN Multi Negative Prompt`, quality addons layered on with `AUN Add-To-Prompt (Multi)`, and the active index, label, prompt and negative shown together in `AUN Show Any Multi`. |
