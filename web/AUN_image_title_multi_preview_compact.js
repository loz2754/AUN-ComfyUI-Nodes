import { app } from "../../scripts/app.js";
import { registerLegacyExtension } from "./aun-compat.js";
import { getWidget, ensureHiddenAware, applyWidgetHiddenState } from "./widgets.js";
import { isCompact, setCompact, forceRedraw } from "./utils.js";

const NODE_TYPE = "AUNImageTitleMultiPreview";
const OPTIONAL_WIDGETS = [
  "show_labels",
  "filenames",
  "label_position",
  "font_scale",
  "label_height_scale",
  "font_color",
  "bg_color",
  "text_align",
];

function applyCompact(node) {
  const compact = isCompact(node);
  for (const name of OPTIONAL_WIDGETS) {
    const w = getWidget(node, name);
    if (!w) continue;
    ensureHiddenAware(w);
    applyWidgetHiddenState(w, compact);
  }
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function setupNode(node) {
  if (node.__AUN_titlePreviewInit) return;
  node.__AUN_titlePreviewInit = true;

  node.properties = node.properties || {};
  if (typeof node.properties._AUN_compactMode !== "boolean") {
    setCompact(node, true);
  }

  const origDblClick = node.onDblClick;
  node.onDblClick = function (event, pos) {
    origDblClick?.apply(this, arguments);
    const next = !isCompact(this);
    setCompact(this, next);
    applyCompact(this);
  };

  const origMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (graphcanvas, options) {
    origMenu?.apply(this, arguments);
    options.push({
      content: isCompact(this) ? "AUN: Show all controls" : "AUN: Compact mode",
      callback: () => {
        const next = !isCompact(this);
        setCompact(this, next);
        applyCompact(this);
      },
    });
  };

  applyCompact(node);
}

registerLegacyExtension({
  name: "AUN.ImageTitleMultiPreviewCompact",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE_TYPE) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);
      setupNode(this);
    };
  },

  loadedGraphNode(node) {
    if (node.comfyClass !== NODE_TYPE && node.type !== NODE_TYPE) return;
    setupNode(node);
    applyCompact(node);
  },
});
