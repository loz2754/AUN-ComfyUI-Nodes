import { api } from "../../scripts/api.js";
import { app } from "../../scripts/app.js";
import { openLoraInfoDialog } from "./aun_lora_info_shared.js";

const NODE_TYPE = "AUNRandomLoraModelOnly";
const PROP_KEY = "_AUN_compactMode";
const INFO_PROP_KEY = "_AUN_showLoraInfo";
const BASE_PROMPT_MIN_HEIGHT = 96;
const COMPACT_LABEL_HEIGHT = 28;
const COMPACT_INFO_HEIGHT = 20;
const INFO_BUTTON_SIZE = 18;

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

function parsePositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isCompact(node) {
  return !!node?.properties?.[PROP_KEY];
}

function isNodeCollapsed(node) {
  return !!node?.flags?.collapsed;
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

function normalizeNodeId(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.length ? normalizeNodeId(raw[0]) : null;
  if (typeof raw === "object") {
    if (raw.node_id != null) return normalizeNodeId(raw.node_id);
    if (raw.id != null) return normalizeNodeId(raw.id);
  }

  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  return text;
}

function findGraphNodeByEventId(rawNodeId) {
  const graph = app?.graph;
  if (!graph) return null;

  const normalized = normalizeNodeId(rawNodeId);
  if (normalized == null) return null;

  const direct = graph.getNodeById(normalized);
  if (direct) return direct;

  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    const byNumeric = graph.getNodeById(numeric);
    if (byNumeric) return byNumeric;
  }

  const target = String(normalized);
  const nodes = Array.isArray(graph._nodes) ? graph._nodes : [];
  return nodes.find((n) => String(n?.id) === target) ?? null;
}

function forceRedraw(node) {
  node?.setDirtyCanvas?.(true, true);
  app?.graph?.setDirtyCanvas?.(true, true);
  app?.canvas?.setDirty?.(true, true);
}

function isTargetNode(node) {
  if (!node) return false;
  return node.comfyClass === NODE_TYPE || node.type === NODE_TYPE;
}

function applyExecutionPayload(node, message) {
  if (!isTargetNode(node) || !message) return;

  const readFirst = (v) => {
    if (v == null) return null;
    if (Array.isArray(v)) return readFirst(v[0]);
    return String(v);
  };

  const parsedIndex =
    parsePositiveInt(readFirst(message?.index)) ??
    parsePositiveInt(readFirst(message?.[2]));
  if (parsedIndex != null) {
    node.__AUN_loraLastExecIndex = parsedIndex;
  }

  const rawName =
    readFirst(message?.selected_lora) ??
    readFirst(message?.[1]) ??
    readFirst(message?.prefixed_label) ??
    readFirst(message?.[3]);
  const parsedName = loraBasename(rawName);
  if (parsedName) {
    node.__AUN_loraLastExecName = parsedName;
  }
  if (rawName) {
    node.__AUN_loraLastExecValue = rawName;
  }

  const triggerWords =
    readFirst(message?.trigger_words) ?? readFirst(message?.[4]);
  if (triggerWords != null) {
    node.__AUN_loraLastExecTrigger = String(triggerWords).trim();
  }

  forceRedraw(node);
}

function resolveLoraLabel(node) {
  const mode = getWidget(node, "mode")?.value ?? "";
  if (mode === "Select") {
    const selectW = getWidget(node, "select");
    const idx = Number(selectW?.value) || 1;
    const loraW = getWidget(node, `lora_${idx}`);
    const base = loraBasename(loraW?.value);
    if (base) return base;
  }

  const execIdx = parsePositiveInt(node?.__AUN_loraLastExecIndex);
  if (execIdx != null) {
    const loraW = getWidget(node, `lora_${execIdx}`);
    const base = loraBasename(loraW?.value);
    if (base) return base;
  }

  const last = node.__AUN_loraLastExecName;
  if (last) return last;
  return null;
}

function resolveSelectedLoraValue(node) {
  const mode = getWidget(node, "mode")?.value ?? "";
  if (mode === "Select") {
    const selectW = getWidget(node, "select");
    const idx = Number(selectW?.value) || 1;
    return String(getWidget(node, `lora_${idx}`)?.value ?? "None");
  }

  const execIdx = parsePositiveInt(node?.__AUN_loraLastExecIndex);
  if (execIdx != null) {
    const value = String(getWidget(node, `lora_${execIdx}`)?.value ?? "None");
    if (value && value !== "None") return value;
  }

  const last = String(node?.__AUN_loraLastExecValue ?? "").trim();
  return last || "None";
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
  if (!isCompact(node) || isNodeCollapsed(node)) return 0;
  return (
    COMPACT_LABEL_HEIGHT + (resolveInfoText(node) ? COMPACT_INFO_HEIGHT : 0)
  );
}

function setWidgetValue(widget, value) {
  if (!widget) return;
  widget.value = value;
  widget.callback?.call(widget, value);
}

function resolveSelectedTriggerWidget(node) {
  const mode = getWidget(node, "mode")?.value ?? "";
  if (mode === "Select") {
    const selectW = getWidget(node, "select");
    const idx = Number(selectW?.value) || 1;
    return getWidget(node, `trigger_${idx}`);
  }

  const execIdx = parsePositiveInt(node?.__AUN_loraLastExecIndex);
  if (execIdx != null) {
    const widget = getWidget(node, `trigger_${execIdx}`);
    if (widget) return widget;
  }
  return null;
}

function appendTriggerWord(node, word) {
  const widget = resolveSelectedTriggerWidget(node);
  const text = String(word || "").trim();
  if (!widget || !text) {
    throw new Error(
      "No trigger field is available for the current LoRA selection.",
    );
  }
  const current = String(widget.value ?? "").trim();
  const parts = current
    ? current
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
  if (parts.some((part) => part.toLowerCase() === text.toLowerCase())) {
    return `"${text}" is already in the trigger words.`;
  }
  const nextValue = parts.length ? `${current}, ${text}` : text;
  setWidgetValue(widget, nextValue);
  applyCompact(node);
  forceRedraw(node);
  return `Inserted "${text}" into trigger words.`;
}

function ensureInfoButtonStyles() {
  if (window.__AUNRandomLoraInfoButtonStyle) return;
  const style = document.createElement("style");
  style.textContent = `
    .AUN-random-lora-info-btn {
      position: absolute;
      z-index: 12;
      display: none;
      width: ${INFO_BUTTON_SIZE}px;
      height: ${INFO_BUTTON_SIZE}px;
      padding: 0;
      border: 1px solid rgba(150, 200, 255, 0.28);
      border-radius: 999px;
      background: rgba(110, 170, 240, 0.16);
      color: #edf6ff;
      font: 10px/1 sans-serif;
      font-weight: 700;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
    }
    .AUN-random-lora-info-btn:hover {
      background: rgba(110, 170, 240, 0.24);
      border-color: rgba(181, 218, 255, 0.38);
      transform: translateY(-1px);
    }
    .AUN-random-lora-info-btn:focus-visible {
      outline: 1px solid rgba(188, 220, 255, 0.9);
      outline-offset: 1px;
    }
  `;
  document.head.appendChild(style);
  window.__AUNRandomLoraInfoButtonStyle = style;
}

function ensureInfoButton(node) {
  ensureInfoButtonStyles();
  if (node.__AUN_randomLoraInfoButton) return node.__AUN_randomLoraInfoButton;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "AUN-random-lora-info-btn";
  button.textContent = "i";
  button.title = "Show LoRA info";

  const stopEvent = (event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
  };

  button.addEventListener("pointerdown", stopEvent);
  button.addEventListener("click", async (event) => {
    stopEvent(event);
    const value = resolveSelectedLoraValue(node);
    if (!value || value === "None") return;
    await openLoraInfoDialog(value, {
      insertWord: (word) => appendTriggerWord(node, word),
    });
  });

  document.body.appendChild(button);
  node.__AUN_randomLoraInfoButton = button;
  return button;
}

function positionInfoButton(node, ctx) {
  const button = ensureInfoButton(node);
  const compact = isCompact(node);
  const collapsed = isNodeCollapsed(node);
  const selectedLora = resolveSelectedLoraValue(node);
  const hasLora = !!selectedLora && selectedLora !== "None";
  if (!compact || collapsed || !ctx?.canvas || !hasLora) {
    button.style.display = "none";
    return;
  }

  const footerHeight = getCompactFooterHeight(node);
  if (!footerHeight) {
    button.style.display = "none";
    return;
  }

  const canvasRect = ctx.canvas.getBoundingClientRect();
  const matrix = new DOMMatrix()
    .scaleSelf(
      canvasRect.width / ctx.canvas.width,
      canvasRect.height / ctx.canvas.height,
    )
    .multiplySelf(ctx.getTransform());

  const localLeft = (node.size?.[0] ?? 220) - INFO_BUTTON_SIZE - 10;
  const localTop = (node.size?.[1] ?? 120) - footerHeight + 6;
  const topLeft = new DOMPoint(localLeft, localTop).matrixTransform(matrix);
  const bottomRight = new DOMPoint(
    localLeft + INFO_BUTTON_SIZE,
    localTop + INFO_BUTTON_SIZE,
  ).matrixTransform(matrix);

  button.title = `Show LoRA info for ${loraBasename(selectedLora) ?? selectedLora}`;
  Object.assign(button.style, {
    display: "flex",
    left: `${canvasRect.left + topLeft.x}px`,
    top: `${canvasRect.top + topLeft.y}px`,
    width: `${Math.max(INFO_BUTTON_SIZE, bottomRight.x - topLeft.x)}px`,
    height: `${Math.max(INFO_BUTTON_SIZE, bottomRight.y - topLeft.y)}px`,
  });
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

function hookWidgetRedraw(node, widgetName) {
  const widget = getWidget(node, widgetName);
  if (!widget || widget.__AUN_loraRedrawHooked) return;
  const original = widget.callback;
  widget.callback = function callback(value) {
    original?.call(widget, value);
    forceRedraw(node);
  };
  widget.__AUN_loraRedrawHooked = true;
}

function startSelectLiveMonitor(node) {
  if (!node || node.__AUN_loraSelectMonitorId) return;
  let lastSignature = "";

  const readSignature = () => {
    const mode = String(getWidget(node, "mode")?.value ?? "");
    const select = String(getWidget(node, "select")?.value ?? "");
    const idx = Number(select) || 1;
    const selectedLora = String(getWidget(node, `lora_${idx}`)?.value ?? "");
    return `${mode}|${select}|${selectedLora}`;
  };

  const check = () => {
    if (!node || node.type === undefined) {
      if (node?.__AUN_loraSelectMonitorId) {
        clearInterval(node.__AUN_loraSelectMonitorId);
        node.__AUN_loraSelectMonitorId = null;
      }
      return;
    }

    const signature = readSignature();
    if (signature !== lastSignature) {
      lastSignature = signature;
      forceRedraw(node);
    }
  };

  node.__AUN_loraSelectMonitorId = setInterval(check, 150);
  setTimeout(check, 0);

  const originalOnRemoved = node.onRemoved;
  node.onRemoved = function onRemoved() {
    if (node.__AUN_loraSelectMonitorId) {
      clearInterval(node.__AUN_loraSelectMonitorId);
      node.__AUN_loraSelectMonitorId = null;
    }
    node.__AUN_randomLoraInfoButton?.remove?.();
    node.__AUN_randomLoraInfoButton = null;
    return originalOnRemoved?.apply(this, arguments);
  };
}

function computeVisibleNodeHeight(node, width) {
  if (!node) return null;
  const targetWidth = Number.isFinite(width) ? width : (node.size?.[0] ?? 200);
  const computeTarget = [targetWidth, 0];

  if (typeof node.computeSize !== "function") {
    return null;
  }

  let computed = null;
  const allWidgets = node.widgets;
  if (Array.isArray(allWidgets) && allWidgets.length) {
    const visible = allWidgets.filter((widget) => !widget?.hidden);
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

  const height = Number.isFinite(computed?.[1])
    ? computed[1]
    : (node.size?.[1] ?? globalThis.LiteGraph?.NODE_TITLE_HEIGHT ?? 60);
  return Number.isFinite(height) ? height : null;
}

function getMinimumCompactHeight(node, width) {
  const visibleHeight = computeVisibleNodeHeight(node, width);
  if (!Number.isFinite(visibleHeight)) return null;
  return visibleHeight + getCompactFooterHeight(node);
}

function updateAutoHeight(node) {
  if (!node) return;
  const currentWidth = node.size?.[0] ?? 200;
  const height = computeVisibleNodeHeight(node, currentWidth);
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

  const originalOnResize = node.onResize;
  node.onResize = function onResize(...args) {
    const result = originalOnResize?.apply(this, args);
    if (this.__AUN_internalResize || !isCompact(this)) {
      return result;
    }

    const currentWidth = Number(this.size?.[0]) || 200;
    const currentHeight = Number(this.size?.[1]);
    const minimumHeight = getMinimumCompactHeight(this, currentWidth);
    if (!Number.isFinite(minimumHeight) || !Number.isFinite(currentHeight)) {
      return result;
    }

    if (currentHeight < minimumHeight) {
      this.__AUN_internalResize = true;
      if (typeof this.setSize === "function") {
        this.setSize([currentWidth, minimumHeight]);
      } else {
        this.size = Array.isArray(this.size)
          ? this.size
          : [currentWidth, minimumHeight];
        this.size[0] = currentWidth;
        this.size[1] = minimumHeight;
      }
      this.__AUN_internalResize = false;
    }

    return result;
  };

  // Draw compact status footer.
  const originalDrawFg = node.onDrawForeground;
  node.onDrawForeground = function onDrawForeground(ctx) {
    originalDrawFg?.apply(this, arguments);
    positionInfoButton(this, ctx);
    if (!isCompact(this) || isNodeCollapsed(this)) return;

    const mode = getWidget(this, "mode")?.value ?? "";
    const label = resolveLoraLabel(this);
    const execIdx = parsePositiveInt(this.__AUN_loraLastExecIndex);
    let labelText;
    if (mode === "None") {
      labelText = "\u2014 passthrough \u2014";
    } else if (label) {
      if (mode === "Select") {
        const selectW = getWidget(this, "select");
        const idx = Number(selectW?.value) || 1;
        labelText = `${idx}: ${label}`;
      } else if (execIdx != null) {
        labelText = `${execIdx}: ${label}`;
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

  hookWidgetRedraw(node, "select");
  for (let i = 1; i <= 10; i += 1) {
    hookWidgetRedraw(node, `lora_${i}`);
  }
  startSelectLiveMonitor(node);

  applyCompact(node);
}

app.registerExtension({
  name: "AUN.RandomLoraCompact",

  async setup() {
    api.addEventListener("AUN_random_lora_selected", ({ detail }) => {
      if (!detail || !app?.graph) return;

      const node = findGraphNodeByEventId(detail.node_id);
      if (!isTargetNode(node)) return;

      node.__AUN_loraLastExecName = loraBasename(detail.selected_lora);
      node.__AUN_loraLastExecValue = String(detail.selected_lora ?? "None");
      node.__AUN_loraLastExecTrigger = String(
        detail.trigger_words ?? "",
      ).trim();
      const strength = Number(detail.strength_model);
      node.__AUN_loraLastExecStrength = Number.isFinite(strength)
        ? strength
        : null;
      node.__AUN_loraLastExecApplied = !!detail.apply_lora;
      const detailIndex = parsePositiveInt(detail.index);
      if (detailIndex != null) {
        node.__AUN_loraLastExecIndex = detailIndex;
      }
      if (detail.mode != null) {
        node.__AUN_loraLastExecMode = String(detail.mode);
      }
      forceRedraw(node);
    });
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!nodeData || nodeData.name !== NODE_TYPE) return;
    if (nodeType.prototype.__AUN_loraProtoExecHooked) return;

    const originalOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function onExecuted(message) {
      originalOnExecuted?.apply(this, arguments);
      applyExecutionPayload(this, message);
    };
    nodeType.prototype.__AUN_loraProtoExecHooked = true;
  },

  nodeCreated(node) {
    if (!isTargetNode(node)) return;
    setupNode(node);
  },

  loadedGraphNode(node) {
    if (node.comfyClass !== NODE_TYPE && node.type !== NODE_TYPE) return;
    setupNode(node);
    applyCompact(node);
  },
});
