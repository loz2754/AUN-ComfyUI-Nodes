import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "AUNRandomModelBundleSwitch";
const PROP_KEY = "_AUN_compactMode";
const LEVEL_KEY = "_AUN_compactLevel";
const MAX_SLOTS = 10;
const SLOT_PREFIXES = ["model", "text", "label"];
const COMPACT_LABEL_HEIGHT = 28;

function getWidget(node, name) {
  return node?.widgets?.find((w) => w?.name === name) ?? null;
}

function ensureHiddenAwareWidget(widget) {
  if (!widget || widget.__AUN_hiddenAware) return;
  const originalCompute =
    typeof widget.computeSize === "function" ? widget.computeSize : null;
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
      if (Array.isArray(result)) return result;
      if (Array.isArray(firstArg)) return firstArg;
      if (Number.isFinite(result)) return [resolveWidth(), Number(result)];
    }

    return [resolveWidth(), globalThis.LiteGraph?.NODE_WIDGET_HEIGHT ?? 24];
  };
}

function applyWidgetHiddenState(widget, hidden) {
  if (!widget) return;
  widget.hidden = hidden;
  widget.__AUN_visible = !hidden;
}

function clampSlotCount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 3;
  return Math.max(1, Math.min(MAX_SLOTS, Math.floor(num)));
}

function clampCompactLevel(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(2, Math.floor(num)));
}

function getCompactLevel(node) {
  const level = clampCompactLevel(node?.properties?.[LEVEL_KEY]);
  if (node?.properties && typeof node.properties[LEVEL_KEY] === "number") {
    return level;
  }
  return node?.properties?.[PROP_KEY] ? 1 : 0;
}

function setCompactLevel(node, level) {
  if (!node) return;
  const next = clampCompactLevel(level);
  node.properties = node.properties || {};
  node.properties[LEVEL_KEY] = next;
  node.properties[PROP_KEY] = next > 0;
}

function parsePositiveInt(value) {
  const num = parseInt(value, 10);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function extractExecutedIndex(message) {
  if (!message || typeof message !== "object") return null;

  const readCandidate = (candidate) => {
    if (candidate == null) return null;
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const parsed = readCandidate(item);
        if (parsed != null) return parsed;
      }
      return null;
    }
    return parsePositiveInt(candidate);
  };

  const named = readCandidate(message.index);
  if (named != null) return named;

  const positional = readCandidate(message[2]);
  if (positional != null) return positional;

  return null;
}

function capIntWidgetBySlotCount(node, widgetName, slotCount) {
  const widget = getWidget(node, widgetName);
  if (!widget) return;

  const safeMax = clampSlotCount(slotCount);
  widget.options = {
    ...(widget.options || {}),
    max: safeMax,
  };

  const current = Number(widget.value);
  const clamped = Number.isFinite(current)
    ? Math.max(1, Math.min(safeMax, Math.floor(current)))
    : 1;
  if (widget.value !== clamped) {
    widget.value = clamped;
  }
}

function parseDynamicSlotInputName(name) {
  const match = /^(model|text|label)_(\d+)$/.exec(String(name || ""));
  if (!match) return null;
  return { prefix: match[1], slot: Number(match[2]) };
}

function hasLinkedInputsAbove(node, slotCount) {
  const inputs = node?.inputs ?? [];
  for (const input of inputs) {
    if (!input || input.link == null) continue;
    const parsed = parseDynamicSlotInputName(input.name);
    if (!parsed) continue;
    if (parsed.slot > slotCount) return true;
  }
  return false;
}

function ensureSlotInputs(node, slotCount) {
  if (!node || node.comfyClass !== NODE_TYPE) return false;

  let changed = false;
  const inputs = node.inputs ?? [];

  // Remove all dynamic inputs above active slot count.
  for (let i = inputs.length - 1; i >= 0; i--) {
    const input = inputs[i];
    const parsed = parseDynamicSlotInputName(input?.name);
    if (!parsed) continue;
    if (parsed.slot > slotCount) {
      node.removeInput(i);
      changed = true;
    }
  }

  // Ensure dynamic inputs exist for all active slots.
  for (let slot = 1; slot <= slotCount; slot++) {
    for (const prefix of SLOT_PREFIXES) {
      const name = `${prefix}_${slot}`;
      const exists = node.inputs?.some((input) => input?.name === name);
      if (exists) continue;
      const type = prefix === "model" ? "MODEL" : "STRING";
      node.addInput(name, type);
      changed = true;
    }
  }

  return changed;
}

function pruneUnlinkedDynamicInputs(node) {
  if (!node?.inputs?.length) return false;
  let changed = false;
  for (let i = node.inputs.length - 1; i >= 0; i--) {
    const input = node.inputs[i];
    const parsed = parseDynamicSlotInputName(input?.name);
    if (!parsed) continue;
    if (input?.link != null) continue;
    node.removeInput(i);
    changed = true;
  }
  return changed;
}

function applyDynamicSocketLabelMode(node, micro) {
  if (!node?.inputs?.length) return;
  for (const input of node.inputs) {
    const parsed = parseDynamicSlotInputName(input?.name);
    if (!parsed) continue;
    if (input.__AUN_origLabel === undefined) {
      input.__AUN_origLabel = input.label;
    }
    input.label = micro ? "" : input.__AUN_origLabel;
  }
}

function resolveSlotLabel(node, slotIndex) {
  for (const prefix of ["label", "model"]) {
    const inputName = `${prefix}_${slotIndex}`;
    const input = node.inputs?.find((i) => i?.name === inputName);
    if (input?.link != null) {
      const link = app.graph?.links?.[input.link];
      if (link) {
        const srcNode = app.graph.getNodeById(link.origin_id);
        if (srcNode?.title) return srcNode.title;
      }
    }
  }
  return `slot ${slotIndex}`;
}

function updateAutoHeight(node) {
  if (!node) return;
  const currentWidth = node.size?.[0] ?? 200;
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
    } else {
      computed = node.computeSize(computeTarget);
    }
  }

  const height = Number.isFinite(computed?.[1])
    ? computed[1]
    : (node.size?.[1] ?? globalThis.LiteGraph?.NODE_TITLE_HEIGHT ?? 60);

  if (!Number.isFinite(height)) return;

  const level = getCompactLevel(node);
  const compact = level > 0;
  const modeWidget = getWidget(node, "mode");
  const mode = modeWidget?.value ?? "";
  const needsLabelRow =
    compact &&
    ["None", "Select", "Increment", "Random", "Range"].includes(mode);
  const finalHeight = height + (needsLabelRow ? COMPACT_LABEL_HEIGHT : 0);

  if (typeof node.setSize === "function") {
    node.__AUN_internalResize = true;
    node.setSize([currentWidth, finalHeight]);
    node.__AUN_internalResize = false;
  } else {
    node.size = Array.isArray(node.size)
      ? node.size
      : [currentWidth, finalHeight];
    node.size[0] = currentWidth;
    node.size[1] = finalHeight;
  }
}

function scheduleAutoHeightUpdate(node, attempts = 3, delay = 0) {
  if (!node) return;
  if (node.__AUN_bundleHeightTimer) {
    clearTimeout(node.__AUN_bundleHeightTimer);
    node.__AUN_bundleHeightTimer = null;
  }
  node.__AUN_bundleHeightTimer = setTimeout(() => {
    node.__AUN_bundleHeightTimer = null;
    updateAutoHeight(node);
    if (attempts > 1) scheduleAutoHeightUpdate(node, attempts - 1, 50);
  }, delay);
}

function applyVisibility(node) {
  const compactLevel = getCompactLevel(node);
  const compact = compactLevel > 0;
  const micro = compactLevel >= 2;
  const slotCountWidget = getWidget(node, "slot_count");
  const slotCount = clampSlotCount(slotCountWidget?.value ?? 3);

  if (slotCountWidget && slotCountWidget.value !== slotCount) {
    slotCountWidget.value = slotCount;
  }
  node.__AUN_bundleLastSlotCount = slotCount;

  // Keep index-bound widgets aligned with active slot_count.
  capIntWidgetBySlotCount(node, "select", slotCount);
  capIntWidgetBySlotCount(node, "maximum", slotCount);

  let resizedInputs = ensureSlotInputs(node, slotCount);
  if (micro) {
    resizedInputs = pruneUnlinkedDynamicInputs(node) || resizedInputs;
  }

  const modeValue = String(getWidget(node, "mode")?.value ?? "");
  const alwaysVisibleInCompact = new Set(
    micro
      ? modeValue === "Select"
        ? ["mode", "select"]
        : ["mode"]
      : ["mode", "select"],
  );
  const baseWidgetNames = [
    "mode",
    "slot_count",
    "select",
    "minimum",
    "maximum",
    "range",
    "base_model",
  ];

  for (const name of baseWidgetNames) {
    const widget = getWidget(node, name);
    if (!widget) continue;
    ensureHiddenAwareWidget(widget);
    const shouldHideBase = compact && !alwaysVisibleInCompact.has(name);
    applyWidgetHiddenState(widget, shouldHideBase);
  }

  for (let i = 1; i <= MAX_SLOTS; i++) {
    const names = [`model_${i}`, `text_${i}`, `label_${i}`];
    const shouldHide = i > slotCount;
    for (const name of names) {
      const widget = getWidget(node, name);
      if (!widget) continue;
      ensureHiddenAwareWidget(widget);
      applyWidgetHiddenState(widget, shouldHide);
    }
  }

  applyDynamicSocketLabelMode(node, micro);

  updateAutoHeight(node);
  scheduleAutoHeightUpdate(node);
  if (resizedInputs) {
    node.setDirtyCanvas?.(true, true);
  } else {
    node.setDirtyCanvas?.(true, true);
  }
}

function toggleCompactMode(node, { force = false } = {}) {
  if (node.__AUN_bundleToggleInProgress) return;

  const activeEl = document.activeElement;
  if (
    !force &&
    activeEl &&
    (activeEl.tagName === "INPUT" ||
      activeEl.tagName === "TEXTAREA" ||
      activeEl.classList?.contains("litegraph") ||
      activeEl.id?.includes("widget"))
  ) {
    return;
  }

  const canvas = app.canvas;
  if (!force && (canvas?.interacting_widget || canvas?.active_widget)) return;

  node.__AUN_bundleToggleInProgress = true;
  try {
    const current = getCompactLevel(node);
    const next = current > 0 ? 0 : 1;
    setCompactLevel(node, next);
    applyVisibility(node);
  } finally {
    setTimeout(() => {
      node.__AUN_bundleToggleInProgress = false;
    }, 50);
  }
}

function hookWidgetCallbacks(node) {
  const widgetNames = [
    "slot_count",
    "mode",
    "select",
    "minimum",
    "maximum",
    "range",
  ];
  for (const name of widgetNames) {
    const widget = getWidget(node, name);
    if (!widget || widget.__AUN_bundleHooked) continue;
    const original = widget.callback;
    widget.callback = function callback(value) {
      if (name === "slot_count") {
        const target = clampSlotCount(value);
        const current = clampSlotCount(
          node.__AUN_bundleLastSlotCount ?? widget.value ?? target,
        );
        if (target < current && hasLinkedInputsAbove(node, target)) {
          const proceed = window.confirm(
            `Reducing slot count to ${target} will disconnect inputs above slot ${target}. Continue?`,
          );
          if (!proceed) {
            widget.value = current;
            (node.graph ?? app.graph)?.setDirtyCanvas?.(true, true);
            return;
          }
        }
      }

      if (original) original.call(widget, value);
      applyVisibility(node);
    };
    widget.__AUN_bundleHooked = true;
  }
}

function setupNode(node) {
  if (!node || node.comfyClass !== NODE_TYPE || node.__AUN_bundleCompactInit)
    return;
  node.__AUN_bundleCompactInit = true;

  node.properties = node.properties || {};
  if (typeof node.properties[LEVEL_KEY] !== "number") {
    setCompactLevel(node, node.properties[PROP_KEY] ? 1 : 1);
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
    const level = getCompactLevel(this);
    const compactContent =
      level === 0
        ? "AUN: Compact mode"
        : level === 1
          ? "AUN: Micro mode"
          : "AUN: Show all controls";
    options.push({
      content: compactContent,
      callback: () => {
        const next = (getCompactLevel(this) + 1) % 3;
        setCompactLevel(this, next);
        applyVisibility(this);
      },
    });

    options.push({
      content: "AUN: Toggle compact (dbl-click behavior)",
      callback: () => toggleCompactMode(this, { force: true }),
    });
  };

  const originalOnExecuted = node.onExecuted;
  node.onExecuted = function onExecuted(message) {
    originalOnExecuted?.apply(this, arguments);
    const parsedIndex = extractExecutedIndex(message);
    if (parsedIndex != null) {
      this.__AUN_bundleLastExecIndex = clampSlotCount(parsedIndex);
      this.setDirtyCanvas?.(true, true);
    }
  };

  const originalDrawFg = node.onDrawForeground;
  node.onDrawForeground = function onDrawForeground(ctx) {
    originalDrawFg?.apply(this, arguments);
    if (getCompactLevel(this) <= 0) return;
    const modeW = getWidget(this, "mode");
    const mode = modeW?.value ?? "";
    let labelText = null;
    if (mode === "None") {
      labelText = "\u2014 passthrough \u2014";
    } else if (mode === "Select") {
      const selectW = getWidget(this, "select");
      const slotIdx = Number(selectW?.value) || 1;
      labelText = `Current ${slotIdx}: ${resolveSlotLabel(this, slotIdx)}`;
    } else if (["Increment", "Random", "Range"].includes(mode)) {
      const slotIdx = parsePositiveInt(this.__AUN_bundleLastExecIndex);
      if (slotIdx != null) {
        labelText = `Current ${slotIdx}: ${resolveSlotLabel(this, slotIdx)}`;
      } else {
        labelText = "Current: pending execute";
      }
    }
    if (!labelText) return;
    const w = this.size[0];
    const h = this.size[1];
    const y0 = h - COMPACT_LABEL_HEIGHT + 3;
    const y1 = h - 3;
    const x0 = 8;
    const x1 = w - 8;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(x0 + 4, y0, x1 - x0 - 8, y1 - y0);
    ctx.clip();
    ctx.fillStyle = "rgba(220,220,220,0.9)";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, w / 2, (y0 + y1) / 2);
    ctx.restore();
  };

  hookWidgetCallbacks(node);
  applyVisibility(node);
}

app.registerExtension({
  name: "AUN.RandomModelBundleSwitch.Compact",

  async setup() {
    api.addEventListener("AUN_random_model_bundle_selected", ({ detail }) => {
      if (!detail || !app?.graph) return;
      const nodeId = detail.node_id;
      const parsedIndex = parsePositiveInt(detail.index);
      if (nodeId == null || parsedIndex == null) return;

      const node =
        app.graph.getNodeById(Number(nodeId)) || app.graph.getNodeById(nodeId);
      if (!node || node.comfyClass !== NODE_TYPE) return;

      node.__AUN_bundleLastExecIndex = clampSlotCount(parsedIndex);
      if (detail.mode != null) {
        node.__AUN_bundleLastExecMode = String(detail.mode);
      }
      app.graph.setDirtyCanvas(true, true);
    });
  },

  nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;
    setupNode(node);
  },

  loadedGraphNode(node) {
    if (node.comfyClass !== NODE_TYPE && node.type !== NODE_TYPE) return;
    // setupNode wires hooks; but nodeCreated already ran before properties were
    // restored, so we must always re-apply visibility with the now-correct level.
    setupNode(node);
    applyVisibility(node);
  },
});
