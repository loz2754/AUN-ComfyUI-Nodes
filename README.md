# AUN Nodes Collection

A comprehensive collection of custom nodes for ComfyUI designed to enhance workflow efficiency, organization, and control.

## 🎯 Node Categories

### 🎛️ **Workflow Control**
Advanced nodes for managing workflow state and organization.

#### AUN Node Controller (Universal)
- AUN Multi Universal (AUN Node Controller): A single, powerful node that replaces all legacy bypass, mute, and collapse nodes. It supports up to 50 slots, dynamic labeling, and instant execution.
	- **Target by Title**: Control nodes or groups by their title string.
	- **Instant Execution**: Changes take effect immediately without needing to queue a prompt.
	- **Compact Mode**: Hides all inputs and labels for a clean, minimal UI.
	- **Smart UI**: Automatically hides the "AllSwitch" when only one slot is active.

#### Workflow Control (Legacy & Specific)
- AUNMultiBypassIndex / AUNMultiMuteIndex: Control bypass/mute states by index.
- AUNSetBypassByTitle / AUNSetMuteByTitle: Control bypass/mute state of specific nodes by title.
- AUNSetBypassState / AUNSetMuteState: Control bypass/mute state of specific nodes.
- AUNSetBypassStateGroup / AUNSetMuteStateGroup: Multi-toggle group bypassers/muters.
- AUNSetBypassStateGroupSingle / AUNSetMuteStateGroupSingle: Single-switch group bypassers/muters.
- AUNSetCollapseState / AUNSetCollapseStateGroup: Collapse/expand individual nodes or a single group.
- AUNSetCollapseAndBypassState / Advanced: Combined collapse + bypass control.
- AUNNodeStateController: Centralized state control utilities.
- AUNBookmark: Save and jump to specific canvas locations with high-precision zoom and shortcut keys.
- AUNShowTextWithTitle / AUNSingleLabelSwitch: Display helpers and quick label switching.

#### Additional Workflow Utilities
- AUNGetActiveNodeTitle / AUNGetConnectedNodeTitles / AUNGetNodeTitles: Introspection helpers.

### 🎨 **Sampling & Generation**

- AUNKSamplerPlusV3: Progressive two-pass sampler with pixel-space upscale and mirrored schedule for reduced drift; outputs Base/Latent/Both/Refined + LATENT + Upscaled type (mapping: 4=Refined, 3=Both, 2=One, 1=None). Legacy Plus/Progressive variants were retired—use PlusV3 for all new workflows.
- AUNEmptyLatent: Create empty latents with aspect/orientation helpers.
- AUNImg2Img: Image-to-image processing.

### 💾 **File Management**

- AUNSaveImage: Advanced image saving with placeholders and metadata embedding.
- AUNSaveVideo: Video output with custom naming.
- AUNPathFilename: Build dynamic paths and filenames. See: [docs/AUNPathFilename_README.md](docs/AUNPathFilename_README.md)
- MainFolderManualName: Choose manual vs. automatic filename.
- SaveVideoPathNode: Video-specific path utilities. See: [docs/SaveVideoPathNode_README.md](docs/SaveVideoPathNode_README.md)
- AUNImgLoader: Image loader with filename output.

### 🔧 **Utility & Logic**

- AUNBoolean / AUNBooleanTrigger: Simple boolean switching/triggering.
- AUNSwitchFloat: Switch between float values based on a boolean.
- AUNRandomNumber: Random integer generation.
- AUNRandomIndexSwitch: Random or selected integer with range control.
- AUNRandomAnySwitch: Randomly select any connected input value.
- AUNTextIndexSwitch / AUNTextIndexSwitch3: Select from multiple text inputs by index; outputs selected text and label.
- AUNRandomTextIndexSwitch: Combined random index generation and text selection. Generates an index via Select/Increment/Random modes and selects from up to 10 text inputs with automatic input labeling. Outputs the selected text, its label, and the generated index. See: [docs/AUNRandomTextIndexSwitch_README.md](docs/AUNRandomTextIndexSwitch_README.md)
- TextSwitch2InputWithTextOutput: Two-input text switch with passthrough output.
- AUNStrip: Simple data cleaning utilities.
- AUNShowTextWithTitle / AUNSingleLabelSwitch: Display helpers and quick label switching. See: [docs/AUNShowTextWithTitle_README.md](docs/AUNShowTextWithTitle_README.md)

### 🔗 **Data Flow & Inputs**

- AUNAny: Universal pass-through.
- AUNInputs: Group and route common parameters across nodes.
- AUNInputsHybrid: Same ergonomics as AUNInputs but can also load diffusion-only UNets alongside explicit CLIP/VAE pairs.
- KSamplerInputs: Inputs bundle for KSampler workflows.
- AUNSwitchImageOutput: Switch between image outputs.

### 🎨 **Image Processing**

- AUNImageSingleBatch3: Advanced image loader with batch processing and filename search filtering. Supports wildcard patterns, regex, and multiple selection modes. See: [docs/AUNImageSingleBatch3_README.md](docs/AUNImageSingleBatch3_README.md)
- AUNImageLoadResize: Load and resize images.
- AUNFaceIDLabelsSwitch: Manage FaceID label presets for downstream nodes.

### ⚙️ **Configuration & Extraction**

- AUNCheckpointLoaderWithClipSkip: Load checkpoints with CLIP skip.
- AUNExtractModelName / AUNExtractWidgetValue / AUNExtractPowerLoras: Utility extractors for filenames or logic.
	- See: [docs/AUNExtractModelName_README.md](docs/AUNExtractModelName_README.md), [docs/AUNExtractWidgetValue_README.md](docs/AUNExtractWidgetValue_README.md), [docs/AUNExtractPowerLoras_README.md](docs/AUNExtractPowerLoras_README.md)
- AUNGraphScraper: Scrape multiple values from any node in the graph using `{Node.Widget}` syntax. Supports recursive search inside subgraphs and components.
- AUNMultiNegPrompt: Manage multiple negative prompts with indexing.

### 📁 **Path Management**

- AUNPathFilename / MainFolderManualName / SaveVideoPathNode: File and folder organization for outputs.

## 🚀 **Getting Started**

### Installation
1. Clone or download the AUN nodes to your ComfyUI `custom_nodes` directory
2. Restart ComfyUI
3. Nodes will appear in the "AUN Nodes" category

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
- See `DOCUMENTATION_STRATEGY.md` for authoring guidelines

## 🔄 **Updates & Maintenance**

The AUN nodes collection is actively maintained with:
- Regular improvements and new nodes
- Documentation updates alongside changes
- Compatibility updates for ComfyUI

## 🤝 **Contributing**

Contributions are welcome! Please follow the documentation standards in `DOCUMENTATION_STRATEGY.md`, include tooltips for all parameters, and add READMEs for complex nodes.

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

