import { app } from "../../scripts/app.js";

const NODE_TYPE = "AUNLoraStackWithTriggers";
const PROP_KEY = "_AUN_compactMode";
const BASE_PROMPT_MIN_HEIGHT = 96;
const MAX_SLOTS = 10;

const STATIC_WIDGETS = [
  "num_slots",
  "apply_stack",
  "trigger_joiner",
  "dedupe_triggers",
];

const SLOT_WIDGET_ORDER = ["lora", "strength_model", "enabled", "trigger"];

function getWidget(node, name) {
  return node?.widgets?.find((w) => w?.name === name) ?? null;
}

function isTargetNode(node) {
  return !!node && (node.comfyClass === NODE_TYPE || node.type === NODE_TYPE);
}

function isCompact(node) {
  return !!node?.properties?.[PROP_KEY];
}

function setCompact(node, compact) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_KEY] = !!compact;
}

function isRestoringLayout(node) {
  return !!node?.__AUN_restoreLayoutPending;
}

function forceRedraw(node) {
  node?.setDirtyCanvas?.(true, true);
  if (isRestoringLayout(node)) return;
  app?.graph?.setDirtyCanvas?.(true, true);
  app?.canvas?.setDirty?.(true, true);
}

function setNodeSize(node, width, height) {
  if (!node || !Number.isFinite(width) || !Number.isFinite(height)) return;
  const currentWidth = Number(node.size?.[0]);
  const currentHeight = Number(node.size?.[1]);
  if (
    Math.abs(currentWidth - width) < 0.5 &&
    Math.abs(currentHeight - height) < 0.5
  ) {
    return;
  }
  if (typeof node.setSize === "function" && !isRestoringLayout(node)) {
    node.setSize([width, height]);
    return;
  }
  node.size = [width, height];
}

function loraBasename(value) {
  if (!value || typeof value !== "string") return null;
  const stripped = value.replace(/\\/g, "/").split("/").pop() ?? value;
  return stripped.replace(/\.[^.]+$/, "");
}

function normalizeLoraWidgetValue(widget) {
  if (!widget || widget.value == null) return;
  if (typeof widget.value === "object" && "value" in widget.value) {
    widget.value = widget.value.value;
  }
}

function getNumSlots(node) {
  const raw = Number(getWidget(node, "num_slots")?.value);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(MAX_SLOTS, Math.floor(raw)));
}

function getCompactFooterHeight(node) {
  return 0;
}

function ensureHiddenAwareWidget(widget) {
  if (!widget || widget.__AUN_hiddenAware) return;
  const originalCompute =
    typeof widget.computeSize === "function" ? widget.computeSize : null;
  const isBasePrompt = widget.name === "base_prompt";
  widget.__AUN_hiddenAware = true;
  widget.computeSize = function computeSizeProxy(...args) {
    const firstArg = args.length ? args[0] : undefined;
    const resolveWidth = () => {
      if (Array.isArray(firstArg) && Number.isFinite(firstArg[0])) {
        return firstArg[0];
      }
      if (Number.isFinite(firstArg)) return firstArg;
      return globalThis.LiteGraph?.NODE_WIDTH ?? 200;
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
        if (isBasePrompt) {
          return [result[0], Math.max(BASE_PROMPT_MIN_HEIGHT, result[1] || 0)];
        }
        return result;
      }
    }
    const fallback = isBasePrompt
      ? BASE_PROMPT_MIN_HEIGHT
      : (globalThis.LiteGraph?.NODE_WIDGET_HEIGHT ?? 24);
    return [resolveWidth(), fallback];
  };
}

function applyWidgetHiddenState(widget, hidden) {
  if (!widget) return;
  widget.hidden = hidden;
}

function reorderWidgets(node) {
  if (!node?.widgets?.length) return;

  const widgetMap = new Map();
  for (const widget of node.widgets) {
    if (widget?.name) {
      widgetMap.set(widget.name, widget);
    }
  }

  const ordered = [];
  const seen = new Set();
  const pushWidget = (name) => {
    const widget = widgetMap.get(name);
    if (!widget || seen.has(widget)) return;
    ordered.push(widget);
    seen.add(widget);
  };

  for (const name of STATIC_WIDGETS) {
    pushWidget(name);
  }

  for (let i = 1; i <= MAX_SLOTS; i += 1) {
    for (const prefix of SLOT_WIDGET_ORDER) {
      pushWidget(`${prefix}_${i}`);
    }
  }

  for (const widget of node.widgets) {
    if (!seen.has(widget)) {
      ordered.push(widget);
    }
  }

  node.widgets = ordered;
}

function updateAutoHeight(node) {
  if (!isTargetNode(node)) return;
  const currentWidth = node.size?.[0] ?? 240;
  const computeTarget = [currentWidth, 0];
  let computed = null;
  if (typeof node.computeSize === "function") {
    const allWidgets = node.widgets;
    if (Array.isArray(allWidgets) && allWidgets.length) {
      const visible = allWidgets.filter((w) => !w?.hidden);
      if (visible.length !== allWidgets.length) {
        node.widgets = visible;
        try {
          computed = node.computeSize(computeTarget);
        } finally {
          node.widgets = allWidgets;
        }
      } else {
        computed = node.computeSize(computeTarget);
      }
    }
  }
  const height = Number.isFinite(computed?.[1])
    ? computed[1]
    : (node.size?.[1] ?? globalThis.LiteGraph?.NODE_TITLE_HEIGHT ?? 60);
  const finalHeight = height + getCompactFooterHeight(node);
  setNodeSize(node, currentWidth, finalHeight);
}

function scheduleLoadedLayoutSync(node, delay = 50) {
  if (!isTargetNode(node)) return;
  if (node.__AUN_restoreLayoutTimer) {
    clearTimeout(node.__AUN_restoreLayoutTimer);
    node.__AUN_restoreLayoutTimer = null;
  }
  node.__AUN_restoreLayoutPending = true;
  node.__AUN_restoreLayoutTimer = setTimeout(() => {
    node.__AUN_restoreLayoutTimer = null;
    if (!node || node.type === undefined) return;
    applyCompact(node);
    node.__AUN_restoreLayoutPending = false;
    forceRedraw(node);
  }, delay);
}

function applyCompact(node) {
  if (!isTargetNode(node)) return;
  reorderWidgets(node);
  const compact = isCompact(node);
  const numSlots = getNumSlots(node);

  for (const name of STATIC_WIDGETS) {
    const widget = getWidget(node, name);
    if (!widget) continue;
    ensureHiddenAwareWidget(widget);
    applyWidgetHiddenState(widget, compact && name !== "apply_stack");
  }

  for (let i = 1; i <= MAX_SLOTS; i += 1) {
    const isActiveSlot = i <= numSlots;
    const enabledWidget = getWidget(node, `enabled_${i}`);
    const loraWidget = getWidget(node, `lora_${i}`);
    const strengthWidget = getWidget(node, `strength_model_${i}`);
    const triggerWidget = getWidget(node, `trigger_${i}`);

    for (const widget of [
      enabledWidget,
      loraWidget,
      strengthWidget,
      triggerWidget,
    ]) {
      if (!widget) continue;
      ensureHiddenAwareWidget(widget);
    }

    normalizeLoraWidgetValue(loraWidget);

    applyWidgetHiddenState(enabledWidget, !isActiveSlot);
    applyWidgetHiddenState(loraWidget, !isActiveSlot);
    applyWidgetHiddenState(strengthWidget, !isActiveSlot);
    applyWidgetHiddenState(triggerWidget, !isActiveSlot || compact);
  }

  updateAutoHeight(node);
  forceRedraw(node);
}

function hookWidgetRedraw(node, widgetName, extraAction) {
  const widget = getWidget(node, widgetName);
  if (!widget || widget.__AUN_stackHooked) return;
  const original = widget.callback;
  widget.callback = function callback(value) {
    original?.call(widget, value);
    extraAction?.(value);
    forceRedraw(node);
  };
  widget.__AUN_stackHooked = true;
}

function startLiveMonitor(node) {
  if (!node || node.__AUN_stackMonitorId) return;
  let lastSignature = "";
  const readSignature = () => {
    const parts = [
      String(getWidget(node, "num_slots")?.value ?? ""),
      String(getWidget(node, "apply_stack")?.value ?? ""),
    ];
    for (let i = 1; i <= MAX_SLOTS; i += 1) {
      parts.push(String(getWidget(node, `enabled_${i}`)?.value ?? ""));
      parts.push(String(getWidget(node, `lora_${i}`)?.value ?? ""));
    }
    return parts.join("|");
  };
  const check = () => {
    if (!node || node.type === undefined) {
      if (node?.__AUN_stackMonitorId) {
        clearInterval(node.__AUN_stackMonitorId);
        node.__AUN_stackMonitorId = null;
      }
      return;
    }
    const signature = readSignature();
    if (signature !== lastSignature) {
      lastSignature = signature;
      applyCompact(node);
    }
  };
  node.__AUN_stackMonitorId = setInterval(check, 200);
  setTimeout(check, 50);
  const originalOnRemoved = node.onRemoved;
  node.onRemoved = function onRemoved() {
    if (node.__AUN_restoreLayoutTimer) {
      clearTimeout(node.__AUN_restoreLayoutTimer);
      node.__AUN_restoreLayoutTimer = null;
    }
    node.__AUN_restoreLayoutPending = false;
    if (node.__AUN_stackMonitorId) {
      clearInterval(node.__AUN_stackMonitorId);
      node.__AUN_stackMonitorId = null;
    }
    return originalOnRemoved?.apply(this, arguments);
  };
}

function toggleCompactMode(node) {
  setCompact(node, !isCompact(node));
  applyCompact(node);
}

function setupNode(node) {
  if (!isTargetNode(node) || node.__AUN_stackInit) return;
  node.__AUN_stackInit = true;
  reorderWidgets(node);
  node.properties = node.properties || {};
  if (typeof node.properties[PROP_KEY] !== "boolean") {
    setCompact(node, true);
  }

  const originalDblClick = node.onDblClick;
  node.onDblClick = function onDblClick(event, pos) {
    originalDblClick?.apply(this, arguments);
    if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) {
      return;
    }
    toggleCompactMode(this);
  };

  const originalMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function getExtraMenuOptions(
    graphcanvas,
    options,
  ) {
    originalMenu?.apply(this, arguments);
    options.push({
      content: isCompact(this) ? "AUN: Show all controls" : "AUN: Compact mode",
      callback: () => toggleCompactMode(this),
    });
  };

  hookWidgetRedraw(node, "num_slots", () => applyCompact(node));
  hookWidgetRedraw(node, "apply_stack");
  for (let i = 1; i <= MAX_SLOTS; i += 1) {
    hookWidgetRedraw(node, `enabled_${i}`);
    hookWidgetRedraw(node, `lora_${i}`);
    hookWidgetRedraw(node, `strength_model_${i}`);
    hookWidgetRedraw(node, `trigger_${i}`);
  }
  startLiveMonitor(node);
  applyCompact(node);
}

app.registerExtension({
  name: "AUN.LoraStackWithTriggers",
  nodeCreated(node) {
    setupNode(node);
  },
  loadedGraphNode(node) {
    if (!isTargetNode(node)) return;
    setupNode(node);
    scheduleLoadedLayoutSync(node);
  },
});
