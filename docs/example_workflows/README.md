# AUN Example Workflows

Download a workflow PNG and drop it onto ComfyUI to load it. Each PNG has the workflow JSON embedded in its metadata. Standalone `.json` files are also available for direct import.

## Image

| Workflow | Description |
|----------|-------------|
| [PromptCycler + Random Multi-LoRA](Image/AUNExampleWF-PromptCycler-LorasByIndex.png) · [JSON](Image/AUNExampleWF-PromptCycler-LorasByIndex.json) | Cycle through prompts while dynamically applying different LoRA combinations per prompt using `AUN PromptCycler` and `AUN Random Multi-LoRA Model Loader`. |
| [Show Any / Passthrough Any Multi](Image/AUNExampleWF-ShowAnyMulti.png) · [JSON](Image/AUNExampleWF-ShowAnyMulti.json) | Illustrates `AUN Show Any Multi` and `AUN Passthrough Any Multi`: full display and collapsed modes, data-type badge toggle, inline image previews, and pass-through text representations of the input data. |
| [AUN Inputs Bundle](Image/AUNExampleWF-Inputs.png) · [JSON](Image/AUNExampleWF-Inputs.json) | Replace the checkpoint loader and KSampler settings with one `AUN Inputs` node: model, CLIP, VAE, latent, sampler, scheduler, CFG, steps, seed and more feeding a standard KSampler pipeline and `AUN Save Image V2`, with `AUN Show Any Multi` displaying the auto-generated filename and sidecar text live. |
| [File Saving Pipeline](Image/AUNExampleWF-SavePipeline.png) · [JSON](Image/AUNExampleWF-SavePipeline.json) | `AUN Inputs Basic` drives a standard KSampler pipeline, while automatic parameter-rich filenames from `AUN Path Filename V2` go straight into `AUN Save Image V2`, with `AUN Show Any Multi` displaying the saved filename and sidecar text live. |
| [AUN Image Slider Comparer](Image/AUNExampleWF-ImageSliderComparer.png) · [JSON](Image/AUNExampleWF-ImageSliderComparer.json) | Compare before/after images side by side with a draggable slider using `AUN Image Slider Comparer` (up to five pairs). |
| [AUN KSampler Plus v3](Image/AUNExampleWF-KSamplerPlus.png) · [JSON](Image/AUNExampleWF-KSamplerPlus.json) | The `AUN KSampler PlusV3` node in action: two-pass sampling with latent upscaling, outputting base, upscaled and refined images. |
| [Prompts Showcase](Image/AUNExampleWF-Prompts.png) · [JSON](Image/AUNExampleWF-Prompts.json) | Dynamic prompt selection with `AUN Text Index Switch 4`, negative selection via `AUN Multi Negative Prompt`, quality addons layered on with `AUN Add-To-Prompt (Multi)`, and the active index, label, prompt and negative shown together in `AUN Show Any Multi`. |

## Video

| Workflow | Description |
|----------|-------------|
| [JSON](Video/AUNExampleWF-MiniMaxH3Basic.json) | `AUN Inputs MiniMaxH3 Basic` driving a MiniMax-H3 reference-to-video pipeline: UNET + minimax CLIP + video/audio VAEs + turbo LoRA in one node, feeding `MiniMaxH3ReferenceToVideo`, `KSampler`, video/audio `VAEDecode`, and `VHS Video Combine`. |
| [JSON](Video/AUNExampleWF-MiniMaxH3BasicT2V.json) | Text-to-video variant of the above: `MiniMaxH3ImageToVideo` with `AUN Clean VRAM` and `AUN RIFE` (multiplier + enable driven by the Inputs node) before `VHS Video Combine`. |
| [JSON](Video/AUNExampleWF-MinimaxH3-T2V-FastVideo.json) | Speed-focused MiniMax-H3 text-to-video: attention-backend nodes, sigma shift, and a resolved path filename alongside the standard sample → decode → RIFE → VHS chain. |
| [JSON](Video/AUNExampleWF-Wan22Basic-RIFE-T2V.json) | `AUN Inputs Wan2.2 Basic` driving a Wan2.2 text-to-video pipeline: dual diffusion experts into `AUN Wan2.2 MoE`, whose built-in decoded preview feeds `AUN RIFE` directly with no standalone decode node (multiplier + enable driven by the Inputs node), then `VHS Video Combine` at the post-interpolation frame rate. |
| [JSON](Video/AUNExampleWF-Wan22Basic-RIFE-I2V.json) | Same as above for image-to-video: start image via `AUN Image Loader`, CLIP Vision encoding, and `Wan Image To Video` with a 0.9 MoE boundary before sampling, then MoE-direct decode, RIFE, and VHS combine. |
