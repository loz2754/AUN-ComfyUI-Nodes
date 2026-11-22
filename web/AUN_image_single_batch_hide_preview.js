// Hide image preview on AUNImageSingleBatch3 when hide_preview widget is true.
// Displays the loaded filename in a text widget just above the image preview,
// updating live as the image combo selection changes (no run required).
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
  const maxWidth = (el.clientWidth || 0) - 16;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 12px monospace";
  if (maxWidth > 0 && ctx.measureText(displayText).width > maxWidth) {
    while (displayText.length > 1 && ctx.measureText(displayText + "...").width > maxWidth) {
      displayText = displayText.slice(0, -1);
    }
    displayText += "...";
  }
  el.textContent = displayText;
  widget.value = displayText;
  return displayText;
}

/**
 * Convert an image widget value into the same filename the node outputs:
 * basename only, extension stripped (matches os.path.splitext(os.path.basename(...))).
 */
function filenameFromImageValue(value) {
  if (typeof value !== "string") return "";
  const base = value.split(/[\\/]/).pop() || "";
  return base.replace(/\.[^./\\]+$/, "");
}

/**
 * Live-update the filename label while the user scrolls through the image combo,
 * without waiting for a queue/run.
 *
 * A shared requestAnimationFrame poll is used instead of node.onDrawForeground:
 * in Vue node mode (frontend 1.5x+) LGraphCanvas.drawNode() returns before calling
 * node.onDrawForeground, so draw hooks never fire there. Polling widget.value works
 * with the legacy combo, the Vue select widget, the <> arrows, and uploads.
 */
const watchedNodes = new Set();
let pollHandle = null;

function syncFilenameLabel(node) {
  if (!node?.widgets) {
    watchedNodes.delete(node);
    return;
  }

  const sourceMode = node.widgets?.find((w) => w.name === "source_mode")?.value;
  const imageWidget = node.widgets?.find((w) => w.name === "image_upload");
  if (!imageWidget) return;

  if (sourceMode !== "Single Image Upload") {
    // Clear the cache so switching back to single mode re-syncs the label
    // instead of leaving a batch filename on screen.
    node._aunLastImageValue = undefined;
    return;
  }

  const current = imageWidget.value;
  // Only handle plain filename strings; leave asset/object values to the executed handler.
  if (typeof current !== "string") return;
  const labelWidget = node.widgets?.find((w) => w.name === "_aun_filename_display");
  const labelEl = labelWidget?._aun_el;
  // Re-apply if the value changed OR if Vue re-rendered the DOM widget and wiped the text.
  if (current === node._aunLastImageValue && labelEl && labelEl.textContent === node._aunLastDisplay) {
    return;
  }

  node._aunLastImageValue = current;
  node._aunLastDisplay = updateFilenameWidget(node, filenameFromImageValue(current));
  node.setDirtyCanvas?.(true);
  node.graph?.setDirtyCanvas?.(true, true);
}

function startFilenamePoll() {
  if (pollHandle != null) return;
  const tick = () => {
    if (watchedNodes.size === 0) {
      pollHandle = null;
      return;
    }
    for (const node of watchedNodes) syncFilenameLabel(node);
    pollHandle = requestAnimationFrame(tick);
  };
  pollHandle = requestAnimationFrame(tick);
}

function attachFilenameWatcher(node) {
  if (node._aunFilenameWatcherAttached) return;
  node._aunFilenameWatcherAttached = true;

  watchedNodes.add(node);
  startFilenamePoll();

  // Immediate update on upload / legacy combo picks.
  const imageWidget = node.widgets?.find((w) => w.name === "image_upload");
  if (imageWidget) {
    const originalCallback = imageWidget.callback;
    imageWidget.callback = function () {
      const result = originalCallback?.apply(this, arguments);
      syncFilenameLabel(node);
      return result;
    };
  }

  const originalOnRemoved = node.onRemoved;
  node.onRemoved = function () {
    watchedNodes.delete(node);
    return originalOnRemoved?.apply(this, arguments);
  };
}

/**
 * Hook onNodeCreated to add the filename display widget.
 */
function hookNodeCreated(node) {
  getOrCreateFilenameWidget(node);
  attachFilenameWatcher(node);
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
