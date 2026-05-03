import { api } from "../../scripts/api.js";
import { app } from "../../scripts/app.js";

const NODE_TYPE = "AUNRandomLoraModelOnly";
const PROP_KEY = "_AUN_compactMode";
const INFO_PROP_KEY = "_AUN_showLoraInfo";
const BASE_PROMPT_MIN_HEIGHT = 96;
const COMPACT_LABEL_HEIGHT = 28;
const COMPACT_INFO_HEIGHT = 20;

const ALL_WIDGETS = [
  "mode",
  "select",
  "minimum",
  "maximum",
  "range",
  "apply_lora",
  "strength_model",
  "base_prompt",
  "lora_1",
  "lora_2",
  "lora_3",
  "lora_4",
  "lora_5",
  "lora_6",
  "lora_7",
  "lora_8",
  "lora_9",
  "lora_10",
  "trigger_1",
  "trigger_2",
  "trigger_3",
  "trigger_4",
  "trigger_5",
  "trigger_6",
  "trigger_7",
  "trigger_8",
  "trigger_9",
  "trigger_10",
];

function getWidget(node, name) {
  return node?.widgets?.find((w) => w?.name === name) ?? null;
}

function isCompact(node) {
  return !!node?.properties?.[PROP_KEY];
}

function setCompact(node, compact) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_KEY] = !!compact;
}

function isInfoEnabled(node) {
  return !!node?.properties?.[INFO_PROP_KEY];
}

function setInfoEnabled(node, enabled) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[INFO_PROP_KEY] = !!enabled;
}

function loraBasename(value) {
  if (!value || typeof value !== "string") return null;
  const stripped = value.replace(/\\/g, "/").split("/").pop() ?? value;
  return stripped.replace(/\.[^.]+$/, "");
}

function resolveLoraLabel(node) {
  const last = node.__AUN_loraLastExecName;
  if (last) return last;

  const mode = getWidget(node, "mode")?.value ?? "";
  if (mode === "Select") {
    const selectW = getWidget(node, "select");
    const idx = Number(selectW?.value) || 1;
    const loraW = getWidget(node, `lora_${idx}`);
    const base = loraBasename(loraW?.value);
    if (base) return base;
  }
  return null;
}

function resolveTriggerWords(node) {
  const last = String(node?.__AUN_loraLastExecTrigger ?? "").trim();
  if (last) return last;

  const mode = getWidget(node, "mode")?.value ?? "";
  if (mode === "Select") {
    const selectW = getWidget(node, "select");
    const idx = Number(selectW?.value) || 1;
    return String(getWidget(node, `trigger_${idx}`)?.value ?? "").trim();
  }
  return "";
}

function resolveStrengthValue(node) {
  const last = Number(node?.__AUN_loraLastExecStrength);
  if (Number.isFinite(last)) return last;
  const current = Number(getWidget(node, "strength_model")?.value);
  return Number.isFinite(current) ? current : null;
}

function resolveApplyEnabled(node) {
  if (typeof node?.__AUN_loraLastExecApplied === "boolean") {
    return node.__AUN_loraLastExecApplied;
  }
  const widgetValue = getWidget(node, "apply_lora")?.value;
  return typeof widgetValue === "boolean" ? widgetValue : true;
}

function formatStrength(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num.toFixed(2).replace(/\.0+$|(?<=\.[0-9])0+$/g, "");
}

function resolveInfoText(node) {
  if (!isInfoEnabled(node)) return null;

  const parts = [];
  const applyEnabled = resolveApplyEnabled(node);
  const strength = formatStrength(resolveStrengthValue(node));
  const triggerWords = resolveTriggerWords(node);

  if (!applyEnabled) {
    parts.push("disabled");
  } else if (strength) {
    parts.push(`strength ${strength}`);
  }

  if (triggerWords) {
    parts.push(triggerWords);
  }

  return parts.length ? parts.join(" • ") : null;
}

function getCompactFooterHeight(node) {
  if (!isCompact(node)) return 0;
  return (
    COMPACT_LABEL_HEIGHT + (resolveInfoText(node) ? COMPACT_INFO_HEIGHT : 0)
  );
}

// Make a widget return height 0 when hidden.
function ensureHiddenAwareWidget(widget) {
  if (!widget || widget.__AUN_hiddenAware) return;
  const originalCompute =
    typeof widget.computeSize === "function" ? widget.computeSize : null;
  const isBasePrompt = widget.name === "base_prompt";
  widget.__AUN_hiddenAware = true;
  widget.computeSize = function computeSizeProxy(...args) {
    const firstArg = args.length ? args[0] : undefined;
    const resolveWidth = () => {
      if (Array.isArray(firstArg) && Number.isFinite(firstArg[0]))
        return firstArg[0];
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
      if (Array.isArray(firstArg)) return firstArg;
      if (Number.isFinite(result)) {
        const height = isBasePrompt
          ? Math.max(BASE_PROMPT_MIN_HEIGHT, Number(result))
          : Number(result);
        return [resolveWidth(), height];
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
  widget.__AUN_visible = !hidden;
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

  const finalHeight = height + getCompactFooterHeight(node);

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
  if (node.__AUN_loraHeightTimer) {
    clearTimeout(node.__AUN_loraHeightTimer);
    node.__AUN_loraHeightTimer = null;
  }
  node.__AUN_loraHeightTimer = setTimeout(() => {
    node.__AUN_loraHeightTimer = null;
    updateAutoHeight(node);
    if (attempts > 1) scheduleAutoHeightUpdate(node, attempts - 1, 50);
  }, delay);
}

function applyCompact(node) {
  const compact = isCompact(node);
  const mode = getWidget(node, "mode")?.value ?? "";

  const alwaysVisible = new Set(
    !compact ? ALL_WIDGETS : mode === "Select" ? ["mode", "select"] : ["mode"],
  );

  for (const name of ALL_WIDGETS) {
    const widget = getWidget(node, name);
    if (!widget) continue;
    ensureHiddenAwareWidget(widget);
    applyWidgetHiddenState(widget, compact && !alwaysVisible.has(name));
  }

  updateAutoHeight(node);
  scheduleAutoHeightUpdate(node);
  node.setDirtyCanvas?.(true, true);
}

function toggleCompactMode(node, { force = false } = {}) {
  if (node.__AUN_loraToggleInProgress) return;

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

  node.__AUN_loraToggleInProgress = true;
  try {
    setCompact(node, !isCompact(node));
    applyCompact(node);
  } finally {
    setTimeout(() => {
      node.__AUN_loraToggleInProgress = false;
    }, 50);
  }
}

function setupNode(node) {
  if (node.__AUN_loraCompactInit) return;
  node.__AUN_loraCompactInit = true;

  node.properties = node.properties || {};
  if (typeof node.properties[PROP_KEY] !== "boolean") {
    setCompact(node, true);
  }
  if (typeof node.properties[INFO_PROP_KEY] !== "boolean") {
    setInfoEnabled(node, false);
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
    const compact = isCompact(this);
    options.push({
      content: compact ? "AUN: Show all controls" : "AUN: Compact mode",
      callback: () => {
        setCompact(this, !isCompact(this));
        applyCompact(this);
      },
    });
    options.push({
      content: isInfoEnabled(this)
        ? "AUN: Hide LoRA info"
        : "AUN: Show LoRA info",
      callback: () => {
        setInfoEnabled(this, !isInfoEnabled(this));
        applyCompact(this);
      },
    });
  };

  // Track last-executed LoRA name from execution payload.
  const originalOnExecuted = node.onExecuted;
  node.onExecuted = function onExecuted(message) {
    originalOnExecuted?.apply(this, arguments);
    const readFirst = (v) => {
      if (v == null) return null;
      if (Array.isArray(v)) return readFirst(v[0]);
      return String(v);
    };
    const rawName =
      readFirst(message?.selected_lora) ?? readFirst(message?.[1]);
    const base = loraBasename(rawName);
    if (base) {
      this.__AUN_loraLastExecName = base;
      this.setDirtyCanvas?.(true, true);
    }
  };

  // Draw compact status footer.
  const originalDrawFg = node.onDrawForeground;
  node.onDrawForeground = function onDrawForeground(ctx) {
    originalDrawFg?.apply(this, arguments);
    if (!isCompact(this)) return;

    const mode = getWidget(this, "mode")?.value ?? "";
    const label = resolveLoraLabel(this);
    let labelText;
    if (mode === "None") {
      labelText = "\u2014 passthrough \u2014";
    } else if (label) {
      if (!this.__AUN_loraLastExecName && mode === "Select") {
        const selectW = getWidget(this, "select");
        const idx = Number(selectW?.value) || 1;
        labelText = `${idx}: ${label}`;
      } else {
        labelText = label;
      }
    } else {
      labelText = "pending execute";
    }

    const infoText = resolveInfoText(this);
    const footerHeight = getCompactFooterHeight(this);
    const w = this.size[0];
    const h = this.size[1];
    const y0 = h - footerHeight + 3;
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
    if (infoText) {
      ctx.fillText(labelText, w / 2, y0 + 11);
      ctx.fillStyle = "rgba(210,210,210,0.82)";
      ctx.font = "11px sans-serif";
      ctx.fillText(infoText, w / 2, y0 + 27);
    } else {
      ctx.fillText(labelText, w / 2, (y0 + y1) / 2);
    }
    ctx.restore();
  };

  // Re-apply visibility when mode widget changes (for Select vs non-Select).
  const modeWidget = getWidget(node, "mode");
  if (modeWidget && !modeWidget.__AUN_loraHooked) {
    const origCb = modeWidget.callback;
    modeWidget.callback = function callback(value) {
      origCb?.call(modeWidget, value);
      applyCompact(node);
    };
    modeWidget.__AUN_loraHooked = true;
  }

  applyCompact(node);
}

app.registerExtension({
  name: "AUN.RandomLoraCompact",

  async setup() {
    api.addEventListener("AUN_random_lora_selected", ({ detail }) => {
      if (!detail || !app?.graph) return;

      const nodeId = detail.node_id;
      const node =
        app.graph.getNodeById(Number(nodeId)) || app.graph.getNodeById(nodeId);
      if (!node || node.comfyClass !== NODE_TYPE) return;

      node.__AUN_loraLastExecName = loraBasename(detail.selected_lora);
      node.__AUN_loraLastExecTrigger = String(
        detail.trigger_words ?? "",
      ).trim();
      const strength = Number(detail.strength_model);
      node.__AUN_loraLastExecStrength = Number.isFinite(strength)
        ? strength
        : null;
      node.__AUN_loraLastExecApplied = !!detail.apply_lora;
      if (detail.mode != null) {
        node.__AUN_loraLastExecMode = String(detail.mode);
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
    setupNode(node);
    applyCompact(node);
  },
});
