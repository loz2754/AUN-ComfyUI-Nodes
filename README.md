# AUN Nodes Collection

A comprehensive collection of custom nodes for ComfyUI designed to enhance workflow efficiency, organization, and control.

## 🎯 Node Categories

AUN nodes appear in ComfyUI under `AUN Nodes/...` menu categories. The list below is the authoritative set of nodes currently registered by `AUN/__init__.py`.

Maintainers: the node list below is auto-synced from the registry. See [CONTRIBUTING.md](CONTRIBUTING.md) for update steps.

<!-- BEGIN: AUN_NODES_AUTO -->

### ComfyUI Menu Categories (synced from registered nodes)

#### AUN Nodes/File Management

- Main Folder Manual Name (`MainFolderManualName`)
- Path Filename (`AUNPathFilename`)
- Path Filename Video (`AUNPathFilenameVideo`)

#### AUN Nodes/Image

- Empty Latent (`AUNEmptyLatent`)
- Image Loader (`AUNImgLoader`)
- Image Preview With Title (`AUNTitleImagePreview`)
- Img2Img (`AUNImg2Img`)
- Load & Resize Image (`AUNImageLoadResize`)
- Load Image Single/Batch 3 (`AUNImageSingleBatch3`)
- Resize Image (`AUNImageResize`)
- Save Image (`AUNSaveImage`)

#### AUN Nodes/KSampler

- KSampler Inputs (`KSamplerInputs`)
- KSampler Plus (`AUNKSamplerPlusv3`)

#### AUN Nodes/Loaders

- Ckpt Load With Clip Skip (`AUNCheckpointLoaderWithClipSkip`)

#### AUN Nodes/Loaders+Inputs

- Inputs (`AUNInputs`)
- Inputs Hybrid (`AUNInputsHybrid`)

#### AUN Nodes/Logic

- Boolean (`AUNBoolean`)

#### AUN Nodes/Node Control

- AUN Group Controller (`AUNMultiGroupUniversal`)
- AUN Node Controller (`AUNMultiUniversal`)
- Bypass By Title (`AUNSetBypassByTitle`)
- Group Bypasser (Multi) (`AUNSetBypassStateGroup`)
- Group Muter (Multi) (`AUNSetMuteStateGroup`)
- Multi Bypass Index (`AUNMultiBypassIndex`)
- Multi Mute Index (`AUNMultiMuteIndex`)
- Mute By Title (`AUNSetMuteByTitle`)
- Node Collapser & Bypasser Advanced (`AUNSetCollapseAndBypassStateAdvanced`)
- Node State Controller (`AUNNodeStateController`)

#### AUN Nodes/Text

- Add-To-Prompt (`AUNAddToPrompt`)
- Name Crop (`AUNNameCrop`)
- Negative Prompt Selector (`AUNMultiNegPrompt`)
- Show Text With Title (`AUNShowTextWithTitle`)
- Single Label Switch (`AUNSingleLabelSwitch`)
- Strip (`AUNStrip`)
- Text Index Switch (`AUNTextIndexSwitch`)
- Text Index Switch 3 (`AUNTextIndexSwitch3`)
- Text Switch 2 Input With Text Output (`TextSwitch2InputWithTextOutput`)

#### AUN Nodes/Utility

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

#### AUN Nodes/Video

- Save Video (`AUNSaveVideo`)

<!-- END: AUN_NODES_AUTO -->

### Doc shortcuts

- Path Filename: [docs/AUNPathFilename_README.md](docs/AUNPathFilename_README.md)
- Path Filename Video: [docs/SaveVideoPathNode_README.md](docs/SaveVideoPathNode_README.md)
- Load Image Single/Batch 3: [docs/AUNImageSingleBatch3_README.md](docs/AUNImageSingleBatch3_README.md)
- Random Text Index Switch: [docs/AUNRandomTextIndexSwitch_README.md](docs/AUNRandomTextIndexSwitch_README.md)
- Extract Model Name: [docs/AUNExtractModelName_README.md](docs/AUNExtractModelName_README.md)
- Extract Power LoRAs: [docs/AUNExtractPowerLoras_README.md](docs/AUNExtractPowerLoras_README.md)
- Extract Widget Value: [docs/AUNExtractWidgetValue_README.md](docs/AUNExtractWidgetValue_README.md)
- Show Text With Title: [docs/AUNShowTextWithTitle_README.md](docs/AUNShowTextWithTitle_README.md)
- Group Bypasser (Multi): [docs/AUNSetBypassStateGroup_README.md](docs/AUNSetBypassStateGroup_README.md)
- Group Muter (Multi): [docs/AUNSetMuteStateGroup_README.md](docs/AUNSetMuteStateGroup_README.md)

### Notes

- `AUN Node Controller` (`AUNMultiUniversal`) is the universal bypass/mute/collapse controller (1–20 slots). It complements the more specific Node Control nodes.
- `AUN Group Controller` (`AUNMultiGroupUniversal`) targets ComfyUI Groups (by group name) rather than individual nodes.
- `KSampler Plus` (`AUNKSamplerPlusv3`) is the recommended sampler variant for new workflows.
- If you add new node files, ensure they’re imported and included in `AUN/__init__.py` so they actually appear in ComfyUI.

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

### Tooltip System
All nodes include tooltips explaining parameters, expected values, and usage tips.

### Individual Documentation
Complex nodes include detailed READMEs with examples and troubleshooting.

### Support
- Check node READMEs for details
- Use tooltips for quick reference
- See [CHANGELOG.md](CHANGELOG.md) for updates
- Maintainers: see `DOCUMENTATION_STRATEGY.md` for authoring guidelines

## ❓ FAQ / Troubleshooting

- `ModuleNotFoundError: piexif` / `ModuleNotFoundError: cv2`
	- Install dependencies: `pip install -r custom_nodes/AUN/requirements.txt` (or use ComfyUI-Manager’s dependency install).
- ffmpeg not found / some video outputs disabled
	- Install ffmpeg and ensure it’s on PATH, or install `imageio-ffmpeg` via [requirements.txt](requirements.txt).
- VHS `Video Combine` doesn’t show the AUN patch inputs / `sidecar_text`
	- Restart ComfyUI and check the console for: `AUN VHS patch installed successfully.`
	- The patch only targets `videohelpersuite.nodes` from the standard `comfyui-videohelpersuite` layout.
- Windows long path / filename issues
	- Avoid `%loras%` in filename templates if you hit path-length limits.
	- Prefer shorter `MainFolder`/subfolder names and a compact filename format.

Maintainers: release/registry notes live in [CONTRIBUTING.md](CONTRIBUTING.md).

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

---

*For detailed documentation on specific nodes, see individual README files in the `docs/` directory.*

## 🔁 Toggle & Emoji Conventions

To provide a fast, visually consistent understanding of node states, AUN nodes use standardized text+emoji labels for BOOLEAN inputs:

| Context | label_on | label_off | Meaning |
|---------|----------|-----------|---------|
| Bypass switches (per group / per title) | `Active 🟢` | `Bypass 🔴` | Active = node(s) participate; Bypass = skipped/disabled path |
| Mute switches (per group / per title) | `Active 🟢` | `Mute 🔇` | Active = node(s) process; Mute = silenced (no processing / effect) |
| Global (AllSwitch) for Bypass/Mute groups | `All 🟢` | `Individual` | ON forces every listed group active; OFF defers to each individual switch |
| Model / generic on/off (where applicable) | `Active 🟢` | `Off 🔴` (or domain specific) | Pattern reused when no special semantics |
| Collapse / Expand (per node or group) | `Collapsed ▶` | `Expanded ▼` | Collapsed hides node body (compact); Expanded shows full contents |

Principles:
1. Always pair text + emoji (never emoji alone) for accessibility and clarity.
2. 🟢 (green) always maps to the logically "enabled / participates" state.
3. 🔴 (red) is reserved for bypass / disable; 🔇 (mute) specifically indicates a silenced pathway distinct from bypass when semantics differ.
4. `All 🟢 / Individual` communicates scope control rather than a binary enable/disable of a single group.
5. Tooltips follow a consistent pattern: `ON = all ... active (🟢). OFF = use individual ... switches.`

Why not only emojis? Mixed text+emoji improves searchability (e.g., searching for "Bypass" in workflows) and helps color‑blind users or environments where emoji rendering is degraded.

If you add new nodes:
- Reuse these labels where semantics match.
- For tri-state or advanced toggles, document each state clearly in the tooltip.
- Keep labels short (< 16 chars) to avoid UI truncation.

Feel free to adapt for localization by swapping the text portion while keeping the emoji for rapid scanning.

## 📝 Video Sidecar Modes (AUNSaveVideo)

AUNSaveVideo mirrors the image saver’s sidecar behavior. You always receive a sidecar string in the node’s second output; the option controls format and whether a file is also written next to the video.

- Output only (text): returns a human-readable key: value list (no file written)
- Output only (json): returns JSON text (no file written)
- Save to file (text): returns text output and writes a .txt sidecar file
- Save to file (json): returns JSON output and writes a .json sidecar file

Notes:
- Field ordering and formatting match AUNSaveImage (e.g., cfg uses one decimal place).
- Video-specific fields are included: frame_rate, loop_count, quality, width, height, count.

## 🎞️ VHS “Video Combine” Integration (via vhs_patch.py)

If you have VideoHelperSuite (often referred to as “VHS”) installed, AUN will automatically patch VHS’s `Video Combine` node at import time to add:

- Path + filename overrides (so you can drive naming from AUNPathFilenameVideo)
- Optional AUN token replacement (same tokens as AUNSaveVideo: `%seed%`, `%steps%`, `%cfg%`, `%model%`, `%model_short%`, `%sampler_name%`, `%scheduler%`, `%loras%`)
- Optional sidecar metadata output/file writing (text or JSON)

This is implemented in [vhs_patch.py](vhs_patch.py) and is activated by `from . import vhs_patch` in [__init__.py](__init__.py).

### What changes in the VHS node

Once patched, VHS `Video Combine`:

- Has extra *optional inputs*:
	- `path_override` (string): absolute path, or relative to ComfyUI’s output folder (socket-only)
	- `filename_override` (string): literal filename stem (no extension) (socket-only)
  - `save_png` (bool): keep/delete the workflow PNG that VHS writes
  - `apply_aun_tokens` (bool): apply token replacement when renaming
	- `seed_value`, `steps_value`, `cfg_value`, `model_name`, `sampler_name_value`, `scheduler_value`, `short_manual_model_name`
  - `sidecar_format`: output-only vs save-to-file, text vs JSON
- Adds a second output: `sidecar_text` (STRING)

Under the hood, the patch lets VHS render the video normally, then post-processes the output files:

- Optionally removes the workflow PNG (`save_png = false`)
- Optionally moves/renames the produced files into `path_override` / `filename_override`
- Ensures uniqueness (adds `_001`, `_002`, … suffixes if needed)
- Optionally writes a `.txt` or `.json` next to the final video

### How to wire AUNPathFilenameVideo → VHS Video Combine

Quick recipe (common setup):

- `AUN Path Filename Video`
	- `MainFolder`: `Videos`
	- `Date_Subfolder`: On
	- `name_mode`: Auto (feed `auto_name` from your prompt/name source)
	- Suggested filename parts: include `%model_short%` and `%seed%` (optionally `%steps%`/`%cfg%`)
- `VHS Video Combine`
	- Connect `path` → `path_override`
	- Connect `filename` → `filename_override`
	- Set `apply_aun_tokens = true`
	- Fill `seed_value` (and `steps_value` / `cfg_value` if you included those tokens)
	- Optional: set `sidecar_format = Save to file (json)` to write a `.json` next to the video

Recommended wiring (most explicit and least confusing):

1. Add `AUN Path Filename Video`.
2. Configure it to produce:
	- `path`: something like `Videos/2026-01-10/ProjectA/...`
	- `filename`: a stem that may contain tokens like `%model_short%` / `%seed%`
3. Add `VHS Video Combine` and enable the optional sockets (right-click the node → add/enable optional inputs if they’re hidden).
4. Connect:
	- `AUNPathFilenameVideo.path` → `VHS Video Combine.path_override`
	- `AUNPathFilenameVideo.filename` → `VHS Video Combine.filename_override`
5. If your filename contains tokens:
	- set `apply_aun_tokens = true`
	- provide the matching `seed_value` / `steps_value` / `cfg_value` / `model_name` / `sampler_name_value` / `scheduler_value`

Notes:

- If `path_override` is relative (e.g. `Videos/...`), it is resolved under ComfyUI’s output directory when `save_output = true`.
- `filename_override` can also include an extra subfolder (e.g. `subdir/my_name`) and it will be appended under `path_override`.
- `%loras%` is computed automatically from the workflow metadata (when `apply_aun_tokens = true`).
- When `%loras%` is used, the delimiter is fixed to `;` (to avoid extra UI clutter).

Tip: most of the additional inputs are intentionally “socket-only” (no free-text widget) to avoid ComfyUI showing transient `undefined` widget values when loading older workflows. If you want to type values manually, use a `String` / `Int` / `Float` primitive node and connect it.

### Sidecar output

The patched VHS node returns `sidecar_text` and can optionally write a sidecar file next to the video.

The sidecar record includes (when available):

- Prompts: `positive_prompt`, `negative_prompt`
- Video: `frame_rate`, `loop_count`, `width`, `height`, `count`
- Sampler context: `cfg`, `seed`, `steps`, `model`, `model_short`, `sampler_name`, `scheduler`
- Output: `filename`, `extension`, `timestamp`, and a LoRA block (`loras`)

### Troubleshooting

- If you don’t see the new optional inputs/`sidecar_text` output on `VHS Video Combine`, check the ComfyUI console log for: `AUN VHS patch installed successfully.`
- The patch only targets the canonical VideoHelperSuite module: `videohelpersuite.nodes` located at `.../comfyui-videohelpersuite/nodes.py`. If you’re using a fork/rename, the patch may not match.
- If you installed VHS after AUN, just restart ComfyUI (nodes are discovered at startup).

