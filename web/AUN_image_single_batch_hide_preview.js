// Hide image preview on AUNImageSingleBatch3 when hide_preview widget is true.
// Displays the loaded filename in a text widget just above the image preview.
import { app } from "../../scripts/app.js";

const TARGET_NODE_TYPE = "AUNImageSingleBatch3";

/**
 * Create or find the filename display widget.
 */
function getOrCreateFilenameWidget(node) {
  let widget = node.widgets?.find((w) => w.name === "_aun_filename_display");
  if (widget) {
    return widget;
  }

  const container = document.createElement("div");
  container.style.cssText = "display: flex; flex-direction: column; width: 100%;";

  const el = document.createElement("div");
  el.style.cssText = `
    width: 100%;
    min-height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    font: bold 11px monospace;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    padding: 0 8px;
    box-sizing: border-box;
  `;
  el.textContent = "";

  container.appendChild(el);

  widget = node.addDOMWidget("_aun_filename_display", "AUN.filename_display", container, {
    serialize: false,
    computeSize: function (width) {
      if (this.hidden || !this.value) return [width || 300, 0];
      return [width || 300, 18];
    },
  });
  widget.value = "";
  widget._aun_el = el;
  widget._aun_container = container;

  // Trigger resize
  node.widgets_dirty = true;
  node.onResize?.(node.size);
  requestAnimationFrame(() => {
    node.widgets_dirty = true;
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
  });
  return widget;
}

/**
 * Update the filename display widget text.
 */
function updateFilenameWidget(node, filename) {
  const widget = getOrCreateFilenameWidget(node);
  const el = widget._aun_el;
  if (!el) return;

  let displayText = filename;
  const maxWidth = el.clientWidth - 16;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 12px monospace";
  if (ctx.measureText(displayText).width > maxWidth) {
    while (displayText.length > 1 && ctx.measureText(displayText + "...").width > maxWidth) {
      displayText = displayText.slice(0, -1);
    }
    displayText += "...";
  }
  el.textContent = displayText;
  widget.value = displayText;
}

/**
 * Hook onNodeCreated to add the filename display widget.
 */
function hookNodeCreated(node) {
  getOrCreateFilenameWidget(node);
}

/**
 * Handle the comfy_node_executed event.
 * - Update filename widget
 * - Hide preview if hide_preview widget is true
 */
function onNodeExecuted(event) {
  const detail = event.detail ?? {};
  const node_id = detail.node_id ?? detail.node ?? detail.display_node;
  const output = detail.output;

  if (!node_id || !output) return;

  const node = app.graph.getNodeById(node_id);
  if (!node || node.type !== TARGET_NODE_TYPE) return;

  // Update filename - ComfyUI serializes strings as character arrays
  let filename = output.filename ?? output?.result?.[1];
  if (Array.isArray(filename)) {
    filename = filename.join("");
  }

  if (filename) {
    updateFilenameWidget(node, filename);
    node.setDirtyCanvas(true);
  }

  // Hide preview if requested
  const hideWidget = node.widgets?.find((w) => w.name === "hide_preview");
  if (hideWidget?.value && output.images) {
    output.images = [];
  }
}

app.registerExtension({
  name: "AUN.ImageSingleBatch3HidePreview",
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData?.name !== TARGET_NODE_TYPE) return;

    // Hook into onNodeCreated to add filename display widget
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);
      hookNodeCreated(this);
    };
  },

  async init() {
    // Listen for WebSocket executed messages
    import("../../scripts/api.js").then(({ api }) => {
      api.addEventListener("executed", (event) => {
        onNodeExecuted(event);
      });
    });

    // Also listen for DOM events
    document.body.addEventListener("comfy_node_executed", onNodeExecuted);
  },
});
