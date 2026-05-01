import { app } from "../../scripts/app.js";

const MAX_INPUTS = 20;
const MIN_INPUTS = 2;
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

function buildSlotLabel(index, title, valuePrefix) {
  const cleanTitle =
    typeof title === "string" && title.trim() ? title.trim() : null;
  return cleanTitle ? `${index}-${cleanTitle}` : `${valuePrefix}${index}`;
}

function clampInputCount(value) {
  if (Number.isFinite(value)) {
    return Math.min(MAX_INPUTS, Math.max(MIN_INPUTS, Math.floor(value)));
  }
  return MIN_INPUTS;
}

function getVisibleWidget(node) {
  return node.widgets?.find((w) => w.name === "visible_inputs");
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
        node.size[1] = newSize[1];
      } else {
        node.size = newSize;
      }
    } catch (err) {
      console.warn("AUNTextIndexSwitch: computeSize failed", err);
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
    }

    node.__aun_pending_visible = undefined;
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
    node.comfyClass === "AUNRandomTextIndexSwitchV2"
  ) {
    const minWidget = getWidgetByName(node, "minimum");
    const maxWidget = getWidgetByName(node, "maximum");
    const selectWidget = getWidgetByName(node, "select");

    const minVal = clampValue(minWidget?.value ?? 1);
    const maxValRaw = clampValue(maxWidget?.value ?? maxVisible, minVal);
    const maxVal = Math.max(minVal, maxValRaw);

    updateWidget(minWidget, minVal, maxVisible);
    updateWidget(maxWidget, maxVal, maxVisible);

    if (node.comfyClass === "AUNRandomTextIndexSwitchV2") {
      const selectVal = clampValue(selectWidget?.value ?? 1, 1, maxVisible);
      updateWidget(selectWidget, selectVal, maxVisible, 1);
    } else {
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
  const options =
    typeof widget.options === "object" ? { ...widget.options } : {};
  options.max = maxVisible;
  if (options.min == null || options.min < minValue) {
    options.min = minValue;
  }
  widget.options = options;
  if (widget.value !== value) {
    widget.value = value;
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

function setupTextSwitch(node) {
  if (!node || !TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
    return;
  }
  ensureWidgetHook(node);
  node.__aun_visible_inputs = undefined;
  const widgetValue = clampInputCount(
    getVisibleWidget(node)?.value ?? MIN_INPUTS,
  );
  scheduleTextNodeUpdate(node, widgetValue);
  syncBoundedWidgets(node, widgetValue);
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
