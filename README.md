# AUN Nodes Collection

A comprehensive collection of custom nodes for ComfyUI designed to enhance workflow efficiency, organization, and control.

## 🎯 Node Categories

AUN nodes appear in ComfyUI under `AUN Nodes/...` menu categories.

<!-- BEGIN: AUN_NODES_AUTO -->

### ComfyUI Menu Categories:

---

#### Node Control - Command the Flow

_Node controllers orchestrate bypass, mute, and collapse states so you can keep complex setups lean and responsive:_

- AUN Node Controller (`AUNMultiUniversal`) is a universal bypass/mute/collapse controller (1–20 slots). Nodes are chosen by ID or titles. It can take on the role of any of the more specific Node Control nodes.
- AUN Group Controller (`AUNMultiGroupUniversal`) targets ComfyUI Groups (by group name) rather than individual nodes, with various filtering options.
- Bypass By Title (`AUNSetBypassByTitle`) sets bypass state for nodes whose titles match any of the provided titles (one per line)
- Mute By Title (`AUNSetMuteByTitle`) same as Bypass By Title but mute instead of bypass.
- Group Bypasser (Multi) (`AUNSetBypassStateGroup`) set the bypass state of all nodes in groups selected from the graph.
- Group Muter (Multi) (`AUNSetMuteStateGroup`) same as Group Bypasser but mute instead of bypass.
- Multi Bypass Index (`AUNMultiBypassIndex`) control bypass state of multiple nodes by IDs using an index. Select an index to activate one set of nodes while bypassing others.
- Multi Mute Index (`AUNMultiMuteIndex`) same Multi Bypass Index but mute instead of bypass.
- Node Collapser & Bypasser Advanced (`AUNSetCollapseAndBypassStateAdvanced`) set collapse and bypass or mute state for multiple nodes. Has a combined override or separate toggles.
- Node State Controller (`AUNNodeStateController`) control collapse + bypass or mute for nodes by ID, group, or title.

##### Workflow image showing the many uses of the AUN Node/Group Controllers - (drop image into Comfyui to load the workflow)

[![Node controllers workflow diagram showing AUN Node Controller, AUN Group Controller, Bypass By Title, Group Bypasser Multi, Group Muter Multi, and Multi Bypass Index nodes connected with blue lines in a ComfyUI canvas. The diagram illustrates how to orchestrate bypass, mute, and collapse states across multiple nodes and groups within a workflow. Showing labeled node groups containing input/output sockets and configuration options, demonstrating practical control patterns for complex ComfyUI setups.](docs/images/node-controllers-workflow.png)](docs/images/node-controllers-workflow.png)

#### 🔁 Toggle & Emoji Conventions

To provide a fast, visually consistent understanding of node states, AUN nodes use standardized text+emoji labels for BOOLEAN inputs:

| Context                                   | label_on      | label_off                     | Meaning                                                                   |
| ----------------------------------------- | ------------- | ----------------------------- | ------------------------------------------------------------------------- |
| Bypass switches (per group / per title)   | `Active 🟢`   | `Bypass 🔴`                   | Active = node(s) participate; Bypass = skipped/disabled path              |
| Mute switches (per group / per title)     | `Active 🟢`   | `Mute 🔇`                     | Active = node(s) process; Mute = silenced (no processing / effect)        |
| Global (AllSwitch) for Bypass/Mute groups | `All 🟢`      | `Individual`                  | ON forces every listed group active; OFF defers to each individual switch |
| Model / generic on/off (where applicable) | `Active 🟢`   | `Off 🔴` (or domain specific) | Pattern reused when no special semantics                                  |
| Collapse / Expand (per node or group)     | `Collapsed ▶` | `Expanded ▼`                  | Collapsed hides node body (compact); Expanded shows full contents         |

---

#### File Management

- Main Folder Manual Name (`MainFolderManualName`) switch between a manual name and an automatic filename for the output path. Also returns the MainFolder, useful if you want to use the MainFolder in another node, and a boolean which can be used to switch other nodes.

- Path Filename (`AUNPathFilename`) generates a file path and filename from various components and placeholders. Ideal for creating dynamic and organized output structures for saved images. Mainly for use with AUN Save Image.

- Path Filename Video (`AUNPathFilenameVideo`) build a folder path and a tokenized filename for AUN Save Video.

---

#### Image

- Empty Latent (`AUNEmptyLatent`) generates an empty latent image with specified dimensions. It offers options for predefined aspect ratios, random dimension swapping, and batching, making it a flexible starting point for your image generation workflows.
- Image Loader (`AUNImgLoader`) loads an image and returns the image data, a mask, the original filename, and a cleaned filename. The cleaned filename is useful for prompts or file outputs in other nodes.
- Image Preview With Title (`AUNTitleImagePreview`) optional text input is mirrored to the node's title.
- Img2Img (`AUNImg2Img`) provides a comprehensive Img2Img node, allowing you to switch between txt2img and img2img modes. It handles image loading, resizing, and encoding into the latent space, providing essential outputs for further processing.
- Load & Resize Image (`AUNImageLoadResize`) load images with optional automatic resizing. Supports FramePack nearest-bucket sizing, maintains aspect ratio, and provides filename information for workflow organization.
- Load Image Single/Batch 3 (`AUNImageSingleBatch3`) load a single uploaded image or cycle through a batch of images from a folder with multiple selection modes, including increment, random, range and search filtering by filename patterns.
- Resize Image (`AUNImageResize`) resize an input image using the same strategies as AUN Load & Resize Image, including FramePack buckets and fill/crop anchoring.
- Save Image (`AUNSaveImage`) is a versatile image saver with advanced filename customization and metadata embedding.

---

#### Video

- Save Video (`AUNSaveVideo`)

---

#### KSampler

- KSampler Inputs (`KSamplerInputs`) provides a convenient way to set the KSampler inputs (sampler, scheduler, CFG, and steps) in one place. This is useful for organizing your workflow and making it easier to manage these common parameters.
- KSampler Plus (`AUNKSamplerPlusv3`) a progressive two-pass sampler with latent-upscale, pixel-space upscale and optional final refinement. Also outputs a string of the selected upscale methods for use in filenames.

---

#### Loaders

- Ckpt Load With Clip Skip (`AUNCheckpointLoaderWithClipSkip`) speaks for itself.

---

#### Loaders+Inputs

- Inputs (`AUNInputs`) a comprehensive 'all-in-one' node for setting up a generation pipeline. It loads a checkpoint, creates a latent image, and prepares various parameters for sampling and saving, all in one place.
- Inputs Hybrid (`AUNInputsHybrid`) loads a standard checkpoint (UNet+CLIP+VAE), or a diffusion UNet model with separate CLIP and VAE files, but essentially the same as AUN Inputs.

---

#### Logic

- Boolean (`AUNBoolean`) a Boolean switch with a third option: True, False, or Randomize. Outputs the resolved boolean and an optional label "True/False".

---

#### Text

- Add-To-Prompt (`AUNAddToPrompt`)
- Name Crop (`AUNNameCrop`)
- Negative Prompt Selector (`AUNMultiNegPrompt`)
- Show Text With Title (`AUNShowTextWithTitle`)
- Single Label Switch (`AUNSingleLabelSwitch`)
- Strip (`AUNStrip`)
- Text Index Switch (`AUNTextIndexSwitch`)
- Text Index Switch 3 (`AUNTextIndexSwitch3`)
- Text Switch 2 Input With Text Output (`TextSwitch2InputWithTextOutput`)

---

#### Utility

- Any (`AUNAny`)
- AUN Bookmark (`AUNBookmark`)
- AUNGraphScraper (`AUNGraphScraper`)
- CFG Selector (`AUNCFG`)
- Extract Model Name (`AUNExtractModelName`)
- Extract Power LoRAs (`AUNExtractPowerLoras`)
- Extract Widget Value (`AUNExtractWidgetValue`)
- Get Active Node Title (`AUNGetActiveNodeTitle`)
- Get Connected Node Titles (`AUNGetConnectedNodeTitles`)
- Model Name Pass (`AUNModelNamePass`)
- Model Name Shorten (`AUNModelShorten`)
- Random Any Switch (`AUNRandomAnySwitch`)
- Random Number (`AUNRandomNumber`)
- Random Text Index Switch (`AUNRandomTextIndexSwitch`)
- Random/Select INT (`AUNRandomIndexSwitch`)
- Switch Float (`AUNSwitchFloat`)

## <!-- END: AUN_NODES_AUTO -->

---

### Notes

## 🚀 **Getting Started**

### Installation

Install into your ComfyUI `custom_nodes` directory, then restart ComfyUI.

#### Option A: ComfyUI-Manager (recommended)

- Use ComfyUI-Manager to install/update this repo:
  - Repo URL: `https://github.com/loz2754/AUN-ComfyUI-Nodes`

#### Option B: Manual (git clone)

From your ComfyUI folder:

- `cd custom_nodes`
- `git clone https://github.com/loz2754/AUN-ComfyUI-Nodes AUN`

### ComfyUI-Manager

- AUN is compatible with ComfyUI-Manager installs.
- Runtime Python dependencies are declared in [requirements.txt](requirements.txt) (and [install.py](install.py) for Manager compatibility).
- If you install manually from git and see missing-module errors (e.g. `piexif`, `cv2`), install deps with:
  - `pip install -r custom_nodes/AUN/requirements.txt`

### Basic Usage

1. Start simple: begin with AUNBoolean or AUNSaveImage
2. Explore categories to find nodes that match your needs
3. Read tooltips: hover inputs for guidance and expected values
4. Check documentation: refer to individual node READMEs for complex nodes

### Best Practices

- Organize workflows using collapse/bypass/mute group nodes
- Document settings with labels and descriptions
- Save frequently while configuring complex setups
- Test incrementally before chaining many nodes

## 🙏 Acknowledgements

AUN Nodes draws inspiration and code patterns from several excellent ComfyUI node projects. Special thanks to:

- **rgthree** (Power Lora Loader and related nodes)
- **WAS Node Suite** (was-nodes)
- **Impact Pack** (comfyui-impact-pack)
- **Video Helper Suite** (comfyui-videohelpersuite)

Their work has helped shape features, design, and best practices in this collection. Please check out their repositories for more great nodes and ideas!

## 💡 Example Workflows

### How to Randomly Select a Prompt

Use `AUN Random/Select INT` with `AUN Text Index Switch` to randomly select a prompt.

1. Add nodes: `AUN Random/Select INT` (`AUNRandomIndexSwitch`) and `AUN Text Index Switch`.
2. Connect index: wire `INT` output to `index` input.
3. Set to Random: on `AUNRandomIndexSwitch`, toggle to Random.
4. Define range: set `minimum`/`maximum` to match the number of text inputs used.
5. Add prompts: fill `text1`, `text2`, `text3`, ... on the text switch node.
6. Use output: connect `text` to your CLIP Text Encode node.

Your setup: `AUN Random/Select INT` -> `AUN Text Index Switch` -> `CLIP Text Encode`

## 📚 **Documentation**

### Individual Documentation

Complex nodes include detailed READMEs with examples and troubleshooting.

- Path Filename: [docs/AUNPathFilename_README.md](docs/AUNPathFilename_README.md)
- Path Filename Video: [docs/SaveVideoPathNode_README.md](docs/SaveVideoPathNode_README.md)
- Path Filename Video (Resolved): [docs/AUNPathFilenameVideoResolved_README.md](docs/AUNPathFilenameVideoResolved_README.md)
- Load Image Single/Batch 3: [docs/AUNImageSingleBatch3_README.md](docs/AUNImageSingleBatch3_README.md)
- Random Text Index Switch: [docs/AUNRandomTextIndexSwitch_README.md](docs/AUNRandomTextIndexSwitch_README.md)
- Extract Model Name: [docs/AUNExtractModelName_README.md](docs/AUNExtractModelName_README.md)
- Extract Power LoRAs: [docs/AUNExtractPowerLoras_README.md](docs/AUNExtractPowerLoras_README.md)
- Extract Widget Value: [docs/AUNExtractWidgetValue_README.md](docs/AUNExtractWidgetValue_README.md)
- Show Text With Title: [docs/AUNShowTextWithTitle_README.md](docs/AUNShowTextWithTitle_README.md)
- Group Bypasser (Multi): [docs/AUNSetBypassStateGroup_README.md](docs/AUNSetBypassStateGroup_README.md)
- Group Muter (Multi): [docs/AUNSetMuteStateGroup_README.md](docs/AUNSetMuteStateGroup_README.md)

### Tooltip System

All nodes include tooltips explaining parameters, expected values, and usage tips.

### Support

- Check node READMEs for details
- Use tooltips for quick reference
- See [CHANGELOG.md](CHANGELOG.md) for updates
- Maintainers: see `DOCUMENTATION_STRATEGY.md` for authoring guidelines

## ❓ FAQ / Troubleshooting

- `ModuleNotFoundError: piexif` / `ModuleNotFoundError: cv2`
  - Install dependencies: `pip install -r custom_nodes/AUN/requirements.txt` (or use ComfyUI-Manager’s dependency install).
- ffmpeg not found / some video outputs disabled - Install ffmpeg and ensure it’s on PATH, or install `imageio-ffmpeg` via [requirements.txt](requirements.txt).

- Windows long path / filename issues
  - Prefer shorter `MainFolder`/subfolder names and a compact filename format.

## 🔄 **Updates & Maintenance**

The AUN nodes collection is actively maintained with:

- Regular improvements and new nodes
- Documentation updates alongside changes
- Compatibility updates for ComfyUI

## 🤝 **Contributing**

Contributions are welcome! Please follow the documentation standards in `DOCUMENTATION_STRATEGY.md`, include tooltips for all parameters, and add READMEs for complex nodes.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the practical workflow.

## 📄 License

Released under the MIT License. See [LICENSE](LICENSE).
