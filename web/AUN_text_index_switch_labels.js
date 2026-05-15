import { app } from "../../scripts/app.js";

const MAX_INPUTS = 20;
const MIN_INPUTS = 2;
const SLOT_LABEL_MAX_CHARS = 26;
const NODE_CONFIG = {
  AUNTextIndexSwitch: {
    prefix: "text",
    boundedWidgets: ["index"],
  },
  AUNRandomTextIndexSwitch: {
    prefix: "text",
    boundedWidgets: ["minimum", "maximum", "select"],
  },
  AUNRandomTextIndexSwitchV2: {
    prefix: "text",
    boundedWidgets: ["minimum", "maximum", "select", "range"],
  },
};
const TEXT_SWITCH_CLASSES = new Set(Object.keys(NODE_CONFIG));
const trackedTextNodes = new Set();

function getNodeConfig(node) {
  return NODE_CONFIG[node?.comfyClass];
}

function getValuePrefix(node) {
  return getNodeConfig(node)?.prefix ?? "text";
}

function normalizeDisplayTitle(rawTitle) {
  const title = String(rawTitle || "").trim();
  if (!title) {
    return "";
  }

  // Keep node labels compact by collapsing paths and common LoRA extensions.
  const basename = title.split(/[\\/]/).pop() || title;
  return basename.replace(/\.(safetensors|ckpt|pt|bin)$/i, "").trim();
}

function truncateLabelText(value, maxLen) {
  const text = String(value || "").trim();
  if (!text || text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLen - 3))}...`;
}

function buildSlotLabel(index, title, valuePrefix) {
  const cleanTitle =
    typeof title === "string" && title.trim() ? title.trim() : null;
  if (!cleanTitle) {
    return `${valuePrefix}${index}`;
  }

  const normalized = normalizeDisplayTitle(cleanTitle) || cleanTitle;
  const indexPrefix = `${index}-`;
  const maxTitleLen = Math.max(8, SLOT_LABEL_MAX_CHARS - indexPrefix.length);
  return `${indexPrefix}${truncateLabelText(normalized, maxTitleLen)}`;
}

function clampInputCount(value) {
  if (Number.isFinite(value)) {
    return Math.min(MAX_INPUTS, Math.max(MIN_INPUTS, Math.floor(value)));
  }
  return MIN_INPUTS;
}

function getVisibleWidget(node) {
  // Look for either visible_inputs (older nodes) or slot_count (newer nodes like AUNTextIndexSwitch4)
  return node.widgets?.find((w) => w.name === "visible_inputs" || w.name === "slot_count");
}

function getWidgetByName(node, name) {
  return node.widgets?.find((w) => w.name === name);
}

function ensureWidgetHook(node) {
  const widget = getVisibleWidget(node);
  if (!widget || widget.__aun_hooked) {
    return;
  }

  const originalCallback =
    typeof widget.callback === "function" ? widget.callback : null;
  widget.__aun_last_confirmed = clampInputCount(widget.value ?? MIN_INPUTS);
  widget.callback = (value) => {
    if (widget.__aun_block) {
      return;
    }
    const target = clampInputCount(value);
    const current =
      node.__aun_visible_inputs ?? widget.__aun_last_confirmed ?? target;
    if (target < current && hasLinkedTextInputsAbove(node, target)) {
      const proceed = window.confirm(
        `Reducing visible inputs to ${target} will disconnect slots above ${target}. Continue?`,
      );
      if (!proceed) {
        widget.__aun_block = true;
        widget.value = current;
        widget.__aun_block = false;
        (node.graph ?? app.graph)?.setDirtyCanvas(true, true);
        return;
      }
    }
    widget.__aun_last_confirmed = target;
    if (originalCallback) {
      originalCallback.call(widget, target);
    }
    scheduleTextNodeUpdate(node, target);
    syncBoundedWidgets(node, target);
  };
  widget.__aun_hooked = true;
}

function scheduleTextNodeUpdate(node, nextValue) {
  if (!node) {
    return;
  }
  if (Number.isFinite(nextValue)) {
    node.__aun_pending_visible = clampInputCount(nextValue);
  }
  trackedTextNodes.add(node);
}

function resizeNode(node) {
  if (typeof node?.computeSize === "function") {
    try {
      const newSize = node.computeSize();
      if (
        node.size &&
        typeof node.size.length === "number" &&
        node.size.length >= 2
      ) {
        node.size[0] = newSize[0];
        node.size[1] = newSize[1];
      } else {
        node.size = newSize;
      }
    } catch (err) {
      console.warn("AUNTextIndexSwitch: computeSize failed", err);
    }
  }
  // Also call setSize if available to ensure ComfyUI picks up the change
  if (typeof node?.setSize === "function") {
    try {
      node.setSize(node.size);
    } catch (err) {
      // ignore
    }
  }
  const graph = node.graph ?? app.graph;
  if (graph) {
    if (typeof graph._needs_size_update !== "undefined") {
      graph._needs_size_update = true;
    }
    graph.setDirtyCanvas(true, true);
  }
}

function applyVisibleInputs(node, desiredInputs) {
  if (!node || !TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
    return;
  }

  const target = clampInputCount(desiredInputs);
  const valuePrefix = getValuePrefix(node);
  const inputs = node.inputs ?? [];
  let changed = false;

  for (let i = inputs.length - 1; i >= 0; i--) {
    const input = inputs[i];
    if (!input || typeof input.name !== "string") {
      continue;
    }
    if (!input.name.startsWith(valuePrefix)) {
      continue;
    }
    const suffix = parseInt(input.name.substring(valuePrefix.length), 10);
    if (Number.isFinite(suffix) && suffix > target) {
      node.removeInput(i);
      changed = true;
    }
  }

  for (let i = 1; i <= target; i++) {
    const name = `${valuePrefix}${i}`;
    if (!node.inputs?.some((input) => input?.name === name)) {
      node.addInput(name, "STRING");
      changed = true;
    }
  }

  if (changed) {
    updateInputLabels(node);
    resizeNode(node);
  }
}

function updateTrackedTextNodes() {
  for (const node of Array.from(trackedTextNodes)) {
    if (!node || node.type === undefined) {
      trackedTextNodes.delete(node);
      continue;
    }

    const widget = getVisibleWidget(node);
    const widgetValue = widget ? clampInputCount(widget.value) : MIN_INPUTS;
    const pendingValue = node.__aun_pending_visible;
    const desired = clampInputCount(pendingValue ?? widgetValue);

    if (node.__aun_visible_inputs !== desired) {
      node.__aun_visible_inputs = desired;
      applyVisibleInputs(node, desired);
      syncBoundedWidgets(node, desired);
      protectNonTextWidgets(node);
      cleanupUnwantedInputs(node);
    }

    node.__aun_pending_visible = undefined;
  }

  // Also check for nodes that have slot_count but haven't been tracked yet
  if (app?.graph?.getNodes) {
    for (const node of app.graph.getNodes()) {
      if (!node || !TEXT_SWITCH_CLASSES.has(node.comfyClass)) continue;
      if (trackedTextNodes.has(node)) continue;
      
      const widget = getVisibleWidget(node);
      if (widget) {
        trackedTextNodes.add(node);
        const desired = clampInputCount(widget.value);
        node.__aun_visible_inputs = desired;
        syncBoundedWidgets(node, desired);
      }
    }
  }

  requestAnimationFrame(updateTrackedTextNodes);
}

function syncBoundedWidgets(node, maxVisible) {
  const widgetNames = getNodeConfig(node)?.boundedWidgets;
  if (!widgetNames || !node?.widgets) {
    return;
  }

  const clampValue = (value, min = 1, max = maxVisible) => {
    const numeric = Number.isFinite(value) ? value : min;
    return Math.min(Math.max(numeric, min), max);
  };

  if (
    node.comfyClass === "AUNRandomTextIndexSwitch" ||
    node.comfyClass === "AUNRandomTextIndexSwitchV2" ||
    node.comfyClass === "AUNTextIndexSwitch4"
  ) {
    const minWidget = getWidgetByName(node, "minimum");
    const maxWidget = getWidgetByName(node, "maximum");
    const indexWidget = getWidgetByName(node, "index");

    const minVal = clampValue(minWidget?.value ?? 1);
    const maxValRaw = clampValue(maxWidget?.value ?? maxVisible, minVal);
    const maxVal = Math.max(minVal, maxValRaw);

    updateWidget(minWidget, minVal, maxVisible);
    updateWidget(maxWidget, maxVal, maxVisible);

    if (node.comfyClass === "AUNTextIndexSwitch4") {
      // For AUNTextIndexSwitch4, also update index widget to match slot_count
      const indexVal = clampValue(indexWidget?.value ?? 1, 1, maxVisible);
      updateWidget(indexWidget, indexVal, maxVisible, 1);
    } else if (node.comfyClass === "AUNRandomTextIndexSwitchV2") {
      const selectWidget = getWidgetByName(node, "select");
      const selectVal = clampValue(selectWidget?.value ?? 1, 1, maxVisible);
      updateWidget(selectWidget, selectVal, maxVisible, 1);
    } else {
      const selectWidget = getWidgetByName(node, "select");
      const selectVal = clampValue(
        selectWidget?.value ?? minVal,
        minVal,
        maxVal,
      );
      updateWidget(selectWidget, selectVal, maxVisible, minVal);
    }
    return;
  }

  for (const name of widgetNames) {
    const widget = getWidgetByName(node, name);
    if (!widget) {
      continue;
    }
    const value = clampValue(widget.value ?? 1);
    updateWidget(widget, value, maxVisible);
  }
}

function updateWidget(widget, value, maxVisible, minValue = 1) {
  if (!widget) {
    return;
  }
  // Mutate existing options object instead of replacing it
  // Replacing widget.options can break ComfyUI internal references
  if (!widget.options || typeof widget.options !== "object") {
    widget.options = {};
  }
  const options = widget.options;
  options.max = maxVisible;
  if (options.min == null || options.min < minValue) {
    options.min = minValue;
  }
  
  // Update the HTML input element's max/min attributes if it exists
  if (widget.inputEl) {
    if (typeof widget.inputEl.max !== "undefined") {
      widget.inputEl.max = maxVisible;
    }
    if (typeof widget.inputEl.min !== "undefined") {
      widget.inputEl.min = minValue;
    }
    if (typeof widget.inputEl.setAttribute === "function") {
      widget.inputEl.setAttribute("max", maxVisible);
      widget.inputEl.setAttribute("min", minValue);
    }
  }
  
  if (widget.value !== value) {
    widget.value = value;
    if (widget.inputEl && typeof widget.inputEl.value !== "undefined") {
      widget.inputEl.value = value;
    }
    if (typeof widget.callback === "function") {
      widget.callback.call(widget, value);
    }
  }
}

function hasLinkedTextInputsAbove(node, target) {
  const valuePrefix = getValuePrefix(node);
  const inputs = node.inputs ?? [];
  for (const input of inputs) {
    if (!input || typeof input.name !== "string" || input.link == null) {
      continue;
    }
    if (!input.name.startsWith(valuePrefix)) {
      continue;
    }
    const suffix = parseInt(input.name.substring(valuePrefix.length), 10);
    if (Number.isFinite(suffix) && suffix > target) {
      return true;
    }
  }
  return false;
}

function protectNonTextWidgets(node) {
  if (!node || !node.widgets) return;

  const widgetsToProtect = ["index", "slot_count", "minimum", "maximum", "mode", "range", "visible_inputs"];
  for (const name of widgetsToProtect) {
    const w = getWidgetByName(node, name);
    if (w) {
      // Use getter that always returns false - prevents widget-to-input conversion UI
      try {
        Object.defineProperty(w, "convertableToInput", {
          get: () => false,
          set: () => {},
          configurable: true,
          enumerable: true
        });
      } catch (e) {
        w.convertableToInput = false;
      }
      delete w.linkType;
    }
  }
}

function cleanupUnwantedInputs(node) {
  if (!node || !node.inputs) return;

  const widget = getVisibleWidget(node);
  const slotCount = widget ? clampInputCount(widget.value) : MIN_INPUTS;
  const valuePrefix = getValuePrefix(node);

  const validInputs = new Set();
  for (let i = 1; i <= slotCount; i++) {
    validInputs.add(`${valuePrefix}${i}`);
  }

  for (let i = node.inputs.length - 1; i >= 0; i--) {
    const input = node.inputs[i];
    if (input && input.name && !validInputs.has(input.name)) {
      node.removeInput(i);
    }
  }
}

function setupTextSwitch(node) {
  if (!node || !TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
    return;
  }
  ensureWidgetHook(node);
  protectNonTextWidgets(node);
  cleanupUnwantedInputs(node);
  node.__aun_visible_inputs = undefined;
  const widgetValue = clampInputCount(
    getVisibleWidget(node)?.value ?? MIN_INPUTS,
  );
  // Apply inputs immediately so the node renders at the correct height
  // on first load, rather than waiting for requestAnimationFrame.
  node.__aun_visible_inputs = widgetValue;
  applyVisibleInputs(node, widgetValue);
  syncBoundedWidgets(node, widgetValue);
  // Always resize on initial setup to ensure correct height,
  // even if no inputs changed (workflow may have saved with all inputs).
  resizeNode(node);
  // Still schedule for the tracking loop in case widget values change later.
  scheduleTextNodeUpdate(node, widgetValue);
}

function updateInputLabels(node) {
  if (!node || !TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
    return;
  }
  const valuePrefix = getValuePrefix(node);
  const graph = node.graph || app.graph;

  for (let i = 1; i <= MAX_INPUTS; i++) {
    const inputSlot = node.inputs?.find(
      (slot) => slot.name === `${valuePrefix}${i}`,
    );
    if (!inputSlot) {
      continue;
    }

    if (inputSlot.link != null) {
      const link = graph.links[inputSlot.link];
      if (link) {
        const originNode = graph.getNodeById(link.origin_id);
        if (originNode) {
          inputSlot.label = buildSlotLabel(
            i,
            originNode.title || originNode.type,
            valuePrefix,
          );
        }
      }
    } else {
      inputSlot.label = `${valuePrefix}${i}`;
    }
  }
  app.canvas.setDirty(true);
  app.canvas.draw(true, true);
}

app.registerExtension({
  name: "AUN.TextIndexSwitch.Labels",
  nodeCreated(node) {
    if (TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
      setupTextSwitch(node);
    }
    updateInputLabels(node);
  },
  nodeInputConnected(node, inputSlot, linkInfo) {
    updateInputLabels(node);
  },
  nodeInputDisconnected(node, inputSlot) {
    updateInputLabels(node);
  },
  loadedGraphNode(node) {
    if (TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
      setupTextSwitch(node);
      protectNonTextWidgets(node);
      cleanupUnwantedInputs(node);
    }
    updateInputLabels(node);
  },
});

let lastTitles = {};
function pollTitles() {
  if (app && app.graph && app.graph._nodes) {
    for (const node of app.graph._nodes) {
      if (node.title !== lastTitles[node.id]) {
        lastTitles[node.id] = node.title;
        for (const n of app.graph._nodes) {
          if (TEXT_SWITCH_CLASSES.has(n.comfyClass)) {
            updateInputLabels(n);
          }
        }
        app.canvas.setDirty(true, true);
        app.canvas.draw(true, true);
      }
    }
  }
  requestAnimationFrame(pollTitles);
}
pollTitles();

updateTrackedTextNodes();
