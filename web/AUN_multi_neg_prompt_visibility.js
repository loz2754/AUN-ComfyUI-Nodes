import { app } from "../../scripts/app.js";

const MAX_INPUTS = 20;
const MIN_INPUTS = 2;
const NODE_CLASS = "AUNMultiNegPrompt";
const VALUE_PREFIX = "negative";
const MIN_WIDGET_HEIGHT = 48;
const WIDGET_VERTICAL_SPACING = 8;
const NODE_BOTTOM_PADDING = 10;
const trackedNodes = new Set();

function clampInputCount(value) {
  if (Number.isFinite(value)) {
    return Math.min(MAX_INPUTS, Math.max(MIN_INPUTS, Math.floor(value)));
  }
  return MIN_INPUTS;
}

function getVisibleWidget(node) {
  return node.widgets?.find((widget) => widget.name === "visible_inputs");
}

function getIndexWidget(node) {
  return node.widgets?.find((widget) => widget.name === "which_negative");
}

function getInputByName(node, name) {
  return node.inputs?.find((input) => input?.name === name);
}

function getNamedWidgets(node, name) {
  const matches = [];
  const seen = new Set();

  const add = (widget) => {
    if (!widget || seen.has(widget)) {
      return;
    }
    seen.add(widget);
    matches.push(widget);
  };

  for (const widget of node?.widgets ?? []) {
    if (widget?.name === name) {
      add(widget);
    }
  }

  for (const input of node?.inputs ?? []) {
    if (input?.name === name && input.widget) {
      add(input.widget);
    }
  }

  return matches;
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
    widget.__aun_last_confirmed = target;
    if (originalCallback) {
      originalCallback.call(widget, target);
    }
    scheduleUpdate(node, target);
    syncIndexWidget(node, target);
  };
  widget.__aun_hooked = true;
}

function scheduleUpdate(node, nextValue) {
  if (!node) {
    return;
  }
  if (Number.isFinite(nextValue)) {
    node.__aun_pending_visible = clampInputCount(nextValue);
  }
  trackedNodes.add(node);
}

function updateWidgetValue(widget, value) {
  if (!widget) {
    return;
  }
  if (typeof widget.options === "object") {
    widget.options = {
      ...widget.options,
      value,
    };
  }
  if (widget.value !== value) {
    widget.value = value;
    if (typeof widget.callback === "function") {
      widget.callback.call(widget, value);
    }
  }
}

function getConnectedSourceVisibleInputs(node) {
  const indexInput = getInputByName(node, "which_negative");
  if (!indexInput || indexInput.link == null) {
    return null;
  }
  const graph = node.graph ?? app.graph;
  const link = graph?.links?.[indexInput.link];
  if (!link) {
    return null;
  }
  const sourceNode = graph?.getNodeById?.(link.origin_id);
  if (!sourceNode) {
    return null;
  }
  const sourceVisibleWidget = getVisibleWidget(sourceNode);
  if (!sourceVisibleWidget) {
    return null;
  }
  return clampInputCount(sourceVisibleWidget.value);
}

function syncVisibleInputsFromSource(node) {
  const sourceVisibleInputs = getConnectedSourceVisibleInputs(node);
  if (!Number.isFinite(sourceVisibleInputs)) {
    return false;
  }
  const visibleWidget = getVisibleWidget(node);
  if (!visibleWidget) {
    return false;
  }
  updateWidgetValue(visibleWidget, sourceVisibleInputs);
  return true;
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
      console.warn("AUNMultiNegPrompt: computeSize failed", err);
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

function ensureNodeSizePadding(node) {
  if (!node || node.__aun_sizePaddingHooked) {
    return;
  }
  const originalComputeSize =
    typeof node.computeSize === "function" ? node.computeSize : null;
  if (!originalComputeSize) {
    return;
  }
  node.__aun_sizePaddingHooked = true;
  node.computeSize = function computeSizeWithPadding(...args) {
    const result = originalComputeSize.apply(this, args);
    if (Array.isArray(result) && result.length >= 2) {
      return [result[0], result[1] + NODE_BOTTOM_PADDING];
    }
    return result;
  };
}

function ensureHiddenAwareWidget(widget) {
  if (!widget || widget.__aun_hiddenAware) {
    return;
  }
  const originalCompute =
    typeof widget.computeSize === "function" ? widget.computeSize : null;
  widget.__aun_hiddenAware = true;
  widget.computeSize = function computeSizeProxy(...args) {
    const firstArg = args.length ? args[0] : undefined;
    const resolveWidth = () => {
      if (Array.isArray(firstArg) && Number.isFinite(firstArg[0])) {
        return firstArg[0];
      }
      if (Number.isFinite(firstArg)) {
        return firstArg;
      }
      return LiteGraph?.NODE_WIDTH ?? 200;
    };
    if (this.hidden) {
      if (Array.isArray(firstArg)) {
        firstArg[1] = 0;
        return firstArg;
      }
      return [resolveWidth(), 0];
    }
    if (originalCompute) {
      const result = originalCompute.apply(this, args);
      if (Array.isArray(result)) {
        if (Number.isFinite(this.__aun_minHeight)) {
          result[1] = Math.max(
            result[1],
            this.__aun_minHeight + WIDGET_VERTICAL_SPACING,
          );
        }
        return result;
      }
      if (Number.isFinite(result)) {
        const height = Number.isFinite(this.__aun_minHeight)
          ? Math.max(
              Number(result),
              this.__aun_minHeight + WIDGET_VERTICAL_SPACING,
            )
          : Number(result);
        return [resolveWidth(), height];
      }
    }
    const fallbackHeight = LiteGraph?.NODE_WIDGET_HEIGHT ?? 24;
    return [
      resolveWidth(),
      Number.isFinite(this.__aun_minHeight)
        ? Math.max(
            fallbackHeight,
            this.__aun_minHeight + WIDGET_VERTICAL_SPACING,
          )
        : fallbackHeight,
    ];
  };
}

function applyVisibleWidgets(node, desiredInputs) {
  const target = clampInputCount(desiredInputs);

  for (let i = 1; i <= MAX_INPUTS; i++) {
    const namedWidgets = getNamedWidgets(node, `${VALUE_PREFIX}${i}`);
    if (!namedWidgets.length) {
      continue;
    }
    const hidden = i > target;
    for (const widget of namedWidgets) {
      ensureHiddenAwareWidget(widget);
      widget.__aun_minHeight = MIN_WIDGET_HEIGHT;
      widget.hidden = hidden;
      widget.flags = widget.flags || {};
      widget.flags.hidden = hidden;
      widget.flags.collapsed = hidden;
      widget.options = typeof widget.options === "object" ? widget.options : {};
      widget.options.noDraw = hidden;
      if (widget.inputEl) {
        widget.inputEl.hidden = hidden;
        widget.inputEl.style.display = hidden ? "none" : "block";
        if (!hidden) {
          widget.inputEl.style.minHeight = `${MIN_WIDGET_HEIGHT}px`;
        }
      }
    }
  }

  node.widgets_dirty = true;
  resizeNode(node);
}

function syncIndexWidget(node, maxVisible) {
  const indexWidget = getIndexWidget(node);
  if (!indexWidget) {
    return;
  }
  const clampedValue = Math.min(indexWidget.value ?? 1, maxVisible);
  if (typeof indexWidget.options === "object") {
    indexWidget.options = {
      ...indexWidget.options,
      max: maxVisible,
    };
  } else {
    indexWidget.options = { max: maxVisible };
  }
  if (clampedValue !== indexWidget.value) {
    indexWidget.value = clampedValue;
    if (typeof indexWidget.callback === "function") {
      indexWidget.callback.call(indexWidget, clampedValue);
    }
  }
}

function updateTrackedNodes() {
  for (const node of Array.from(trackedNodes)) {
    if (!node || node.type === undefined) {
      trackedNodes.delete(node);
      continue;
    }

    syncVisibleInputsFromSource(node);

    const widget = getVisibleWidget(node);
    const widgetValue = widget ? clampInputCount(widget.value) : MIN_INPUTS;
    const pendingValue = node.__aun_pending_visible;
    const desired = clampInputCount(pendingValue ?? widgetValue);

    if (node.__aun_visible_inputs !== desired) {
      node.__aun_visible_inputs = desired;
      applyVisibleWidgets(node, desired);
      syncIndexWidget(node, desired);
    }

    node.__aun_pending_visible = undefined;
  }

  requestAnimationFrame(updateTrackedNodes);
}

function setupNode(node) {
  if (!node || node.comfyClass !== NODE_CLASS) {
    return;
  }
  ensureNodeSizePadding(node);
  ensureWidgetHook(node);
  node.__aun_visible_inputs = undefined;
  const widgetValue = clampInputCount(
    getVisibleWidget(node)?.value ?? MIN_INPUTS,
  );
  applyVisibleWidgets(node, widgetValue);
  scheduleUpdate(node, widgetValue);
  syncIndexWidget(node, widgetValue);
}

app.registerExtension({
  name: "AUN.MultiNegPrompt.Visibility",
  nodeCreated(node) {
    setupNode(node);
  },
  nodeInputConnected(node, inputSlot) {
    if (
      node?.comfyClass !== NODE_CLASS ||
      inputSlot?.name !== "which_negative"
    ) {
      return;
    }
    syncVisibleInputsFromSource(node);
    scheduleUpdate(node, getVisibleWidget(node)?.value ?? MIN_INPUTS);
  },
  nodeInputDisconnected(node, inputSlot) {
    if (
      node?.comfyClass !== NODE_CLASS ||
      inputSlot?.name !== "which_negative"
    ) {
      return;
    }
    scheduleUpdate(node, getVisibleWidget(node)?.value ?? MIN_INPUTS);
  },
  loadedGraphNode(node) {
    setupNode(node);
  },
});

updateTrackedNodes();
