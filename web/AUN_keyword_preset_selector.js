import { app } from "../../scripts/app.js";
import { applyWidgetHiddenState, ensureHiddenAware, getWidget } from "./widgets.js";

const NODE_CLASS = "AUNKeywordPresetSelector";
const MAX_SLOTS = 20;
const PROP_KEY = "_AUN_compactMode";

function getVisibleCount(node) {
  const w = getWidget(node, "visible_inputs");
  const val = w?.value;
  return Number.isFinite(val) ? Math.max(2, Math.min(MAX_SLOTS, Math.floor(val))) : 5;
}

function isCompact(node) {
  return !!node?.properties?.[PROP_KEY];
}

function setCompact(node, compact) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_KEY] = !!compact;
}

function toggleCompactMode(node) {
  if (!node) return;
  setCompact(node, !isCompact(node));
  updateVisibility(node);
}

function resizeNode(node) {
  if (typeof node?.computeSize === "function") {
    try {
      const newSize = node.computeSize();
      if (node.size && node.size.length >= 2) {
        node.size[1] = newSize[1];
      } else {
        node.size = newSize;
      }
    } catch (err) {
      console.warn("AUNKeywordPresetSelector: computeSize failed", err);
    }
  }
}

function updateVisibility(node) {
  const count = getVisibleCount(node);
  const compact = isCompact(node);

  // Hide/show configuration widgets in compact mode
  applyWidgetHiddenState(getWidget(node, "visible_inputs"), compact);
  applyWidgetHiddenState(getWidget(node, "case_sensitive"), compact);
  applyWidgetHiddenState(getWidget(node, "reference_phrase"), compact);

  // Hide/show keyword/preset pairs based on visible_inputs
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const show = i <= count && !compact;
    applyWidgetHiddenState(getWidget(node, "keyword" + i), !show);
    applyWidgetHiddenState(getWidget(node, "preset" + i), !show);
  }

  // Default preset follows compact mode
  applyWidgetHiddenState(getWidget(node, "preset_default"), compact);

  resizeNode(node);
  node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
  name: "AUN.KeywordPresetSelector",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_CLASS) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);
      requestAnimationFrame(() => updateVisibility(this));

      const vis = getWidget(this, "visible_inputs");
      if (vis && !vis.__aun_hooked) {
        vis.__aun_hooked = true;
        const orig = vis.callback;
        vis.callback = function (v) {
          if (orig) orig.call(this, v);
          requestAnimationFrame(() => updateVisibility(this.node));
        };
      }

      // Double-click to toggle compact mode
      const originalDblClick = this.onDblClick;
      this.onDblClick = function (event, pos) {
        originalDblClick?.apply(this, arguments);
        if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) return;
        toggleCompactMode(this);
      };
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      updateVisibility(this);
    };

    // Right-click menu for compact mode toggle
    const originalGetMenuOptions = nodeType.prototype.getMenuOptions;
    nodeType.prototype.getMenuOptions = function () {
      const options = originalGetMenuOptions
        ? originalGetMenuOptions.apply(this, arguments)
        : [];
      options.push({
        content: this.properties?.[PROP_KEY]
          ? "AUN: Show all widgets"
          : "AUN: Compact mode",
        callback: () => {
          setCompact(this, !this.properties?.[PROP_KEY]);
          updateVisibility(this);
        },
      });
      return options;
    };
  },

  nodeCreated(node) {
    if (node.comfyClass !== NODE_CLASS) return;
    requestAnimationFrame(() => updateVisibility(node));
  },

  loadedGraphNode(node) {
    if (node.comfyClass !== NODE_CLASS) return;
    requestAnimationFrame(() => updateVisibility(node));
  },
});