import { api } from "../../scripts/api.js";
import { app } from "../../scripts/app.js";
import { openLoraInfoDialog } from "./aun_lora_info_shared.js";

const NODE_TYPE = "AUNRandomLoraModelOnlyMulti";
const PROP_KEY = "_AUN_compactMode";
const CLIP_STRENGTH_PROP_KEY = "_AUN_showClipStrength";
const PROP_SHOW_FOOTER = "_AUN_showFooter";
const BASE_PROMPT_MIN_HEIGHT = 96;
const COMPACT_LABEL_HEIGHT = 28;
const COMPACT_INFO_HEIGHT = 20;
const MAX_PROMPTS = 20;
const LORAS_PER_PROMPT = 3;
const COMPACT_ROW_HEIGHT = 26;
const COMPACT_ROW_GAP = 4;
const COMPACT_SIDE_PADDING = 10;

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

function showClipStrength(node) {
  return node?.properties?.[CLIP_STRENGTH_PROP_KEY] !== false;
}

function setShowClipStrength(node, show) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[CLIP_STRENGTH_PROP_KEY] = !!show;
}

function showFooter(node) {
  return node?.properties?.[PROP_SHOW_FOOTER] !== false;
}

function setShowFooter(node, show) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_SHOW_FOOTER] = !!show;
}

function syncHiddenClipStrength(node) {
  if (!isTargetNode(node) || showClipStrength(node)) return;

  // Sync all strength_clip values to their corresponding strength_model values
  for (let p = 1; p <= MAX_PROMPTS; p++) {
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      const modelWidget = getWidget(node, `p${p}_strength_model${s}`);
      const clipWidget = getWidget(node, `p${p}_strength_clip${s}`);
      if (!modelWidget || !clipWidget) continue;

      const nextValue = Number(modelWidget.value);
      if (!Number.isFinite(nextValue)) continue;
      if (Number(clipWidget.value) === nextValue) continue;

      clipWidget.value = nextValue;
      clipWidget.callback?.call(clipWidget, nextValue);
    }
  }
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
  // Mark the node itself as dirty so onDrawForeground is called
  node?.setDirty?.(true, true);
  // Mark the canvas dirty and force a full redraw (foreground + background)
  app?.canvas?.setDirty?.(true, true);
  app?.graph?.setDirtyCanvas?.(true, true);
  // Force immediate redraw by directly invoking the canvas draw loop
  if (app?.canvas) {
    // Force a full redraw (foreground + background)
    app.canvas.draw(true, true);
  }
}

// Global redraw scheduler to batch multiple redraw requests
let __AUN_redrawScheduled = false;
function scheduleGlobalRedraw() {
  if (__AUN_redrawScheduled) return;
  __AUN_redrawScheduled = true;
  requestAnimationFrame(() => {
    __AUN_redrawScheduled = false;
    if (app?.canvas?.graph?._nodes) {
      for (const n of app.canvas.graph._nodes) {
        n.setDirty?.(true, true);
      }
    }
    app?.canvas?.setDirty?.(true, true);
    app?.graph?.setDirtyCanvas?.(true, true);
    // Draw twice to ensure foreground is rendered
    app?.canvas?.draw?.(true, true);
    requestAnimationFrame(() => {
      app?.canvas?.draw?.(true, true);
    });
  });
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

  const promptIdx = parsePositiveInt(
    readFirst(message?.prompt_index) ?? readFirst(message?.[1]),
  );
  if (promptIdx != null) {
    node.__AUN_loraMultiLastPromptIndex = promptIdx;
  }

  const selectedLoras = message?.selected_loras ?? message?.[0];
  if (Array.isArray(selectedLoras)) {
    node.__AUN_loraMultiLastSelectedLoras = selectedLoras.map((l) =>
      String(l || "").trim(),
    );
  }

  const loraLabels = message?.lora_labels ?? message?.[2];
  if (Array.isArray(loraLabels)) {
    node.__AUN_loraMultiLastLabels = loraLabels.map((l) =>
      String(l || "").trim(),
    );
  }

  const triggerList = message?.trigger_words_list ?? message?.[3];
  if (Array.isArray(triggerList)) {
    node.__AUN_loraMultiLastTriggers = triggerList.map((t) =>
      String(t || "").trim(),
    );
  }

  // Update label widget from execution payload
  const labelValue = readFirst(message?.label) ?? readFirst(message?.[7]);
  if (labelValue != null) {
    // Cache for downstream nodes to read in real-time
    node.__AUN_loraMultiLastLabel = labelValue;
    const labelW = getWidget(node, "label");
    if (labelW) {
      labelW.value = labelValue;
    }
  }

  // Force redraw all nodes in graph so downstream label overlays update
  if (app?.canvas?.graph?._nodes) {
    for (const n of app.canvas.graph._nodes) {
      n.setDirty(true, true);
    }
  }
  forceRedraw(node);
}
function getNumPrompts(node) {
  const raw = Number(getWidget(node, "num_prompts")?.value);
  if (!Number.isFinite(raw)) return 5;
  return Math.max(1, Math.min(MAX_PROMPTS, Math.floor(raw)));
}
function resolvePromptIndex(node) {
  const execIdx = parsePositiveInt(node?.__AUN_loraMultiLastPromptIndex);
  if (execIdx != null) return execIdx;

  const promptW = getWidget(node, "prompt_index");
  const idx = parsePositiveInt(promptW?.value);
  return idx ?? 1;
}

function buildLoraLabelsFromWidgets(node) {
  const promptIdx = resolvePromptIndex(node);
  const labels = [];

  for (let slotIdx = 1; slotIdx <= LORAS_PER_PROMPT; slotIdx++) {
    const loraWidget = getWidget(node, `p${promptIdx}_lora${slotIdx}`);
    const loraValue = String(loraWidget?.value ?? "None");
    if (loraValue && loraValue !== "None") {
      labels.push(formatCompactLoraLabel(loraValue));
    }
  }

  return labels.length > 0 ? labels : null;
}

function resolveLoraLabelsForDisplay(node) {
  // Try execution cache first
  const cachedLabels = node?.__AUN_loraMultiLastLabels;
  if (Array.isArray(cachedLabels) && cachedLabels.length > 0) {
    return cachedLabels.filter((l) => l && l !== "none").join(", ");
  }

  // Fall back to building from current widget values (for manual index changes)
  const builtLabels = buildLoraLabelsFromWidgets(node);
  if (builtLabels) {
    return builtLabels.join(", ");
  }

  return null;
}

function resolveTriggersForDisplay(node) {
  // Try execution cache first
  const cachedTriggers = node?.__AUN_loraMultiLastTriggers;
  if (Array.isArray(cachedTriggers) && cachedTriggers.length > 0) {
    return cachedTriggers.filter((t) => t && t !== "none");
  }

  // Fall back to building from current widget values (for manual index changes)
  const promptIdx = resolvePromptIndex(node);
  const triggers = [];

  for (let slotIdx = 1; slotIdx <= LORAS_PER_PROMPT; slotIdx++) {
    const triggerWidget = getWidget(node, `p${promptIdx}_trigger${slotIdx}`);
    const triggerValue = String(triggerWidget?.value ?? "").trim();
    if (triggerValue) {
      triggers.push(triggerValue);
    }
  }

  return triggers.length > 0 ? triggers : null;
}

function getCompactOverlayHeight(node) {
  if (!isCompact(node) || isNodeCollapsed(node)) return 0;

  // Calculate total height of overlay rows based on active prompt's selected LoRAs
  const promptIdx = resolvePromptIndex(node);
  let visibleCount = 0;

  for (let slotIdx = 1; slotIdx <= LORAS_PER_PROMPT; slotIdx++) {
    const loraWidget = getWidget(node, `p${promptIdx}_lora${slotIdx}`);
    const loraValue = String(loraWidget?.value ?? "None");
    if (loraValue && loraValue !== "None") {
      visibleCount++;
    }
  }

  if (visibleCount === 0) return 0;
  return (
    visibleCount * COMPACT_ROW_HEIGHT +
    Math.max(0, visibleCount - 1) * COMPACT_ROW_GAP
  );
}

function getCompactLabelOverlayHeight(node) {
  if (!isCompact(node) || isNodeCollapsed(node)) return 0;
  // Check if label has content
  const labelW = getWidget(node, "label");
  const labelInput = node.inputs?.find((inp) => inp.name === "label");
  const hasWidgetLabel = labelW && labelW.value && String(labelW.value).trim();
  const hasLinkedLabel = labelInput && !!labelInput.link;
  if (!hasWidgetLabel && !hasLinkedLabel) return 0;
  // 18px label height + 6px gap
  return 24;
}

function getCompactFooterHeight(node) {
  if (!isCompact(node) || isNodeCollapsed(node) || !showFooter(node)) return 0;
  const triggers = resolveTriggersForDisplay(node);
  if (!triggers || triggers.length === 0) {
    // Minimal height just for "Prompt X: (no triggers)"
    return COMPACT_LABEL_HEIGHT;
  }
  // Estimate wrapped lines for comma-separated triggers
  const triggersText = triggers.join(", ");
  const availableWidth = (node.size?.[0] ?? 200) - 20; // Account for padding
  const avgCharWidth = 6.5; // Rough estimate for 11px monospace font
  const estLineCount = Math.ceil(
    triggersText.length / (availableWidth / avgCharWidth),
  );
  // Add extra buffer for descenders and padding
  return Math.max(COMPACT_LABEL_HEIGHT, Math.max(1, estLineCount) * 16 + 28);
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
  const overlayHeight = getCompactOverlayHeight(node);
  const labelHeight = getCompactLabelOverlayHeight(node);
  const footerHeight = getCompactFooterHeight(node);
  const padding = overlayHeight > 0 ? 8 : 0; // Padding between overlay rows and label/footer
  return visibleHeight + overlayHeight + labelHeight + padding + footerHeight;
}

function updateAutoHeight(node) {
  if (!node) return;
  const currentWidth = node.size?.[0] ?? 200;
  const height = computeVisibleNodeHeight(node, currentWidth);
  if (!Number.isFinite(height)) return;

  const overlayHeight = getCompactOverlayHeight(node);
  const labelHeight = getCompactLabelOverlayHeight(node);
  const footerHeight = getCompactFooterHeight(node);
  const padding = overlayHeight > 0 ? 8 : 0;
  const finalHeight = height + overlayHeight + labelHeight + padding + footerHeight;

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
  if (node.__AUN_loraMultiHeightTimer) {
    clearTimeout(node.__AUN_loraMultiHeightTimer);
    node.__AUN_loraMultiHeightTimer = null;
  }
  node.__AUN_loraMultiHeightTimer = setTimeout(() => {
    node.__AUN_loraMultiHeightTimer = null;
    updateAutoHeight(node);
    if (attempts > 1) scheduleAutoHeightUpdate(node, attempts - 1, 50);
  }, delay);
}

// Overlay UI system - adapted from AUN_lora_stack_with_triggers_model_clip.js
function stopCanvasEvent(event) {
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return value;
  if (Number.isFinite(min)) value = Math.max(min, value);
  if (Number.isFinite(max)) value = Math.min(max, value);
  return value;
}

function truncateToDecimals(value, decimals) {
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, decimals);
  return Math.trunc(value * factor) / factor;
}

function roundToStep(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function formatCompactLoraLabel(value) {
  if (!value || value === "None") return "—";
  const name = value
    .replace(/\.[^.]+$/, "")
    .replace(/\\/g, "/")
    .split("/")
    .pop();
  return name.length > 20 ? name.substring(0, 17) + "…" : name;
}

function setWidgetValue(widget, value) {
  if (!widget) return;
  widget.value = value;
  widget.callback?.call(widget, value);
}

function ensureCompactRowStyles() {
  if (globalThis.__AUN_lora_multi_styles) return;
  globalThis.__AUN_lora_multi_styles = true;

  const style = document.createElement("style");
  style.textContent = `
    .AUN-lora-multi-row {
      position: fixed;
      z-index: 12;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 64px 64px;
      gap: 5px;
      align-items: center;
      padding: 2px 0;
      border-radius: 0;
      background: transparent;
      border: none;
      box-shadow: none;
      box-sizing: border-box;
      pointer-events: auto;
      overflow: visible;
    }
    .AUN-lora-multi-row[data-hide-clip="true"] {
      grid-template-columns: minmax(0, 1fr) 64px;
    }
    .AUN-lora-multi-row .AUN-lora-label {
      width: 100%;
      min-width: 0;
      height: 22px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 18px;
      align-items: center;
      gap: 5px;
      padding: 0 6px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 4px;
      background: rgba(30, 30, 30, 0.95);
      color: #e0e0e0;
      box-sizing: border-box;
      font: 11px sans-serif;
      font-weight: 500;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .AUN-lora-multi-row .AUN-lora-label-text {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      letter-spacing: 0.3px;
    }
    .AUN-lora-multi-row .AUN-lora-info-btn {
      width: 18px;
      height: 18px;
      padding: 0;
      border: 1.5px solid rgba(120, 200, 255, 0.5);
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(100, 170, 255, 0.25) 0%, rgba(80, 150, 240, 0.15) 100%);
      color: #a8d8ff;
      font: 11px/1 monospace;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      box-shadow: inset 0 1px 2px rgba(255,255,255,0.12), 0 2px 4px rgba(0,0,0,0.4);
      transition: all 120ms ease;
      flex-shrink: 0;
    }
    .AUN-lora-multi-row .AUN-lora-info-btn:hover {
      background: linear-gradient(135deg, rgba(100, 180, 255, 0.35) 0%, rgba(80, 160, 240, 0.25) 100%);
      border-color: rgba(150, 220, 255, 0.7);
      transform: scale(1.08);
      box-shadow: inset 0 1px 2px rgba(255,255,255,0.2), 0 2px 6px rgba(100, 170, 255, 0.3);
    }
    .AUN-lora-multi-row .AUN-strength-control {
      width: 100%;
      min-width: 0;
      height: 22px;
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .AUN-lora-multi-row .AUN-strength-btn {
      width: 14px;
      min-width: 14px;
      height: 22px;
      padding: 0;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 3px;
      background: rgba(30, 30, 30, 0.8);
      color: #d0d0d0;
      box-sizing: border-box;
      font: 9px sans-serif;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
      transition: all 80ms ease;
    }
    .AUN-lora-multi-row .AUN-strength-btn:hover {
      background: rgba(40, 40, 40, 0.9);
      border-color: rgba(255,255,255,0.25);
    }
    .AUN-lora-multi-row .AUN-strength-btn:active {
      background: rgba(50, 50, 50, 1);
      box-shadow: inset 0 2px 3px rgba(0,0,0,0.4);
    }
    .AUN-lora-multi-row .AUN-model-input,
    .AUN-lora-multi-row .AUN-clip-input,
    .AUN-lora-multi-row input[type="number"] {
      width: 100%;
      min-width: 0;
      height: 20px;
      padding: 2px 4px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 3px;
      background: rgba(20, 20, 20, 0.9);
      color: #e8e8e8;
      box-sizing: border-box;
      font: 10px monospace;
      font-weight: 500;
      text-align: center;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.4);
      transition: all 100ms ease;
    }
    .AUN-lora-multi-row .AUN-model-input:hover,
    .AUN-lora-multi-row .AUN-clip-input:hover,
    .AUN-lora-multi-row input[type="number"]:hover {
      background: rgba(25, 25, 25, 0.95);
      border-color: rgba(255,255,255,0.22);
    }
    .AUN-lora-multi-row .AUN-model-input:focus,
    .AUN-lora-multi-row .AUN-clip-input:focus,
    .AUN-lora-multi-row input[type="number"]:focus {
      outline: none;
      background: rgba(30, 30, 30, 1);
      border-color: rgba(100, 170, 255, 0.6);
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.4), 0 0 3px rgba(100, 170, 255, 0.3);
    }
    .AUN-lora-multi-row input[type="number"]::-webkit-outer-spin-button,
    .AUN-lora-multi-row input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .AUN-lora-multi-row input[type="number"] {
      -moz-appearance: textfield;
    }
    .AUN-lora-multi-row {
      transition: opacity 80ms ease, background-color 100ms ease;
    }
    .AUN-lora-multi-row.dragging {
      background-color: rgba(100, 170, 255, 0.08);
    }
    .AUN-lora-multi-row[draggable="true"] .AUN-lora-label {
      cursor: grab;
    }
    .AUN-lora-multi-row[draggable="true"] .AUN-lora-label:active {
      cursor: grabbing;
    }
  `;
  document.head.appendChild(style);
}

function buildCompactRow(node, promptIdx, slotIdx) {
  ensureCompactRowStyles();
  const row = document.createElement("div");
  row.className = "AUN-lora-multi-row";
  row.dataset.prompt = String(promptIdx);
  row.dataset.slot = String(slotIdx);

  const loraLabel = document.createElement("div");
  loraLabel.className = "AUN-lora-label";
  loraLabel.title = `Prompt ${promptIdx}, Slot ${slotIdx}`;

  const loraLabelText = document.createElement("span");
  loraLabelText.className = "AUN-lora-label-text";

  const infoButton = document.createElement("button");
  infoButton.type = "button";
  infoButton.className = "AUN-lora-info-btn";
  infoButton.textContent = "i";
  infoButton.title = `Show LoRA info for Prompt ${promptIdx}, Slot ${slotIdx}`;

  loraLabel.append(loraLabelText, infoButton);

  const strengthModelControl = document.createElement("div");
  strengthModelControl.className = "AUN-strength-control";

  const strengthModelDec = document.createElement("button");
  strengthModelDec.type = "button";
  strengthModelDec.className = "AUN-strength-btn";
  strengthModelDec.textContent = "-";
  strengthModelDec.title = `Decrease model strength`;

  const strengthModel = document.createElement("input");
  strengthModel.type = "text";
  strengthModel.inputMode = "decimal";
  strengthModel.pattern = "^\\d*(\\.\\d{0,2})?$";
  strengthModel.className = "AUN-model-input";
  strengthModel.title = `Model strength`;

  const strengthModelInc = document.createElement("button");
  strengthModelInc.type = "button";
  strengthModelInc.className = "AUN-strength-btn";
  strengthModelInc.textContent = "+";
  strengthModelInc.title = `Increase model strength`;

  strengthModelControl.append(
    strengthModelDec,
    strengthModel,
    strengthModelInc,
  );

  const strengthClipControl = document.createElement("div");
  strengthClipControl.className = "AUN-strength-control";

  const strengthClip = document.createElement("input");
  strengthClip.type = "text";
  strengthClip.inputMode = "decimal";
  strengthClip.pattern = "^\\d*(\\.\\d{0,2})?$";
  strengthClip.className = "AUN-clip-input";
  strengthClip.title = `Clip strength`;

  const strengthClipDec = document.createElement("button");
  strengthClipDec.type = "button";
  strengthClipDec.className = "AUN-strength-btn";
  strengthClipDec.textContent = "-";
  strengthClipDec.title = `Decrease clip strength`;

  const strengthClipInc = document.createElement("button");
  strengthClipInc.type = "button";
  strengthClipInc.className = "AUN-strength-btn";
  strengthClipInc.textContent = "+";
  strengthClipInc.title = `Increase clip strength`;

  strengthClipControl.append(strengthClipDec, strengthClip, strengthClipInc);
  strengthClipControl.classList.add("AUN-clip-control");

  row.append(loraLabel, strengthModelControl, strengthClipControl);
  document.body.appendChild(row);

  // Prevent canvas interaction on events
  for (const eventName of [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "contextmenu",
    "wheel",
  ]) {
    row.addEventListener(eventName, stopCanvasEvent);
  }

  // Info button handler
  const openInfo = async (event) => {
    stopCanvasEvent(event);
    event?.preventDefault?.();
    const loraValue = String(
      getWidget(node, `p${promptIdx}_lora${slotIdx}`)?.value ?? "None",
    );
    if (!loraValue || loraValue === "None") return;
    await openLoraInfoDialog(loraValue, {
      insertWord: (word) => {
        const triggerWidget = getWidget(
          node,
          `p${promptIdx}_trigger${slotIdx}`,
        );
        if (triggerWidget) {
          const current = String(triggerWidget.value || "").trim();
          const wordToAdd = String(word || "").trim();

          // Parse existing trigger words and check for duplicates
          const existingWords = current
            ? current.split(",").map((w) => w.trim().toLowerCase())
            : [];

          if (existingWords.includes(wordToAdd.toLowerCase())) {
            // Word already exists, don't add it
            return;
          }

          // Add the new word
          triggerWidget.value = current
            ? `${current}, ${wordToAdd}`
            : wordToAdd;
          triggerWidget.callback?.call(triggerWidget, triggerWidget.value);
          applyCompact(node);
          forceRedraw(node);
        }
      },
    });
  };

  infoButton.addEventListener("pointerdown", (event) => {
    stopCanvasEvent(event);
    event.preventDefault?.();
  });
  infoButton.addEventListener("click", openInfo);

  // Number input binding helper
  const bindNumberInput = (inputEl, widgetName) => {
    function formatValue(val) {
      const num = Number(val);
      return Number.isFinite(num) ? num.toFixed(2) : "";
    }

    const adjustValue = (direction) => {
      const widget = getWidget(node, widgetName);
      const step = 0.01;
      const min = Number(widget?.options?.min);
      const max = Number(widget?.options?.max);
      const currentValue = Number(widget?.value ?? inputEl.value ?? 0);
      const baseValue = Number.isFinite(currentValue) ? currentValue : 0;
      const nextValue = clampNumber(
        truncateToDecimals(baseValue + step * direction, 2),
        min,
        max,
      );
      setWidgetValue(widget, nextValue);
      inputEl.value = formatValue(nextValue);
      applyCompact(node);
    };

    const commitValue = (rawValue) => {
      const widget = getWidget(node, widgetName);
      let parsed = parseFloat(rawValue);
      const step = Number(widget?.options?.step ?? 0.01);
      const min = Number(widget?.options?.min);
      const max = Number(widget?.options?.max);
      const fallback = Number(widget?.value ?? 0);
      let nextValue = Number.isFinite(parsed)
        ? clampNumber(truncateToDecimals(parsed, 2), min, max)
        : fallback;
      setWidgetValue(widget, nextValue);
      inputEl.value = formatValue(nextValue);
    };

    inputEl.addEventListener("input", () => {
      const val = inputEl.value;
      if (!/^\d*\.?\d*$/.test(val)) {
        let sanitized = val.replace(/[^\d.]/g, "");
        const firstDot = sanitized.indexOf(".");
        if (firstDot !== -1) {
          sanitized =
            sanitized.slice(0, firstDot + 1) +
            sanitized.slice(firstDot + 1).replace(/\./g, "");
        }
        inputEl.value = sanitized;
      }
    });

    inputEl.addEventListener("change", () => {
      commitValue(inputEl.value);
      applyCompact(node);
    });

    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        stopCanvasEvent(event);
        commitValue(inputEl.value);
        applyCompact(node);
        inputEl.blur();
      }
    });

    inputEl.addEventListener("blur", () => {
      commitValue(inputEl.value);
    });

    inputEl.addEventListener("focus", () => {
      inputEl.select?.();
    });

    inputEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const widget = getWidget(node, widgetName);
      const step = Number(widget?.options?.step ?? 0.01);
      const min = Number(widget?.options?.min);
      const max = Number(widget?.options?.max);
      const startX = event.clientX;
      const startValue = Number(widget?.value ?? inputEl.value ?? 0);
      if (!Number.isFinite(startValue)) return;
      const pointerId = event.pointerId;
      let dragging = false;

      const finish = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("blur", onCancel);
        inputEl.removeEventListener("lostpointercapture", onCancel);
        if (inputEl.hasPointerCapture?.(pointerId)) {
          inputEl.releasePointerCapture(pointerId);
        }
      };

      const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        stopCanvasEvent(moveEvent);
        const deltaX = moveEvent.clientX - startX;
        if (!dragging && Math.abs(deltaX) < 4) return;
        moveEvent.preventDefault?.();
        dragging = true;
        const deltaSteps = Math.trunc(deltaX / 8);
        const nextValue = clampNumber(
          roundToStep(startValue + deltaSteps * step, step),
          min,
          max,
        );
        inputEl.value = String(nextValue);
        commitValue(nextValue);
      };

      const onUp = (upEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        stopCanvasEvent(upEvent);
        finish();
        if (dragging) {
          applyCompact(node);
          inputEl.blur();
        }
      };

      const onCancel = () => {
        finish();
      };

      inputEl.setPointerCapture?.(pointerId);
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
      window.addEventListener("blur", onCancel);
      inputEl.addEventListener("lostpointercapture", onCancel);
    });

    return { adjustValue };
  };

  const modelBinding = bindNumberInput(
    strengthModel,
    `p${promptIdx}_strength_model${slotIdx}`,
  );
  const clipBinding = bindNumberInput(
    strengthClip,
    `p${promptIdx}_strength_clip${slotIdx}`,
  );

  const bindStepButton = (button, handler) => {
    button.addEventListener("pointerdown", (event) => {
      stopCanvasEvent(event);
      event.preventDefault?.();
    });
    button.addEventListener("click", (event) => {
      stopCanvasEvent(event);
      event.preventDefault?.();
      handler();
    });
  };

  bindStepButton(strengthModelDec, () => modelBinding.adjustValue(-1));
  bindStepButton(strengthModelInc, () => modelBinding.adjustValue(1));
  bindStepButton(strengthClipDec, () => clipBinding.adjustValue(-1));
  bindStepButton(strengthClipInc, () => clipBinding.adjustValue(1));

  // Drag-to-reorder support: only label is draggable, not input fields
  loraLabel.draggable = true;
  loraLabel.addEventListener("dragstart", (event) => {
    stopCanvasEvent(event);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "text/plain",
      JSON.stringify({ promptIdx, slotIdx }),
    );
    row.classList.add("dragging");
    row.style.opacity = "0.5";
    loraLabel.style.cursor = "grabbing";
  });

  loraLabel.addEventListener("dragend", (event) => {
    stopCanvasEvent(event);
    row.classList.remove("dragging");
    row.style.opacity = "1";
    loraLabel.style.cursor = "grab";
  });

  row.addEventListener("dragover", (event) => {
    stopCanvasEvent(event);
    event.dataTransfer.dropEffect = "move";
    event.preventDefault?.();
    row.style.borderTop = "2px solid rgba(100,200,255,0.6)";
  });

  row.addEventListener("dragenter", (event) => {
    stopCanvasEvent(event);
    event.preventDefault?.();
  });

  row.addEventListener("dragleave", (event) => {
    stopCanvasEvent(event);
    row.style.borderTop = "none";
  });

  row.addEventListener("drop", (event) => {
    stopCanvasEvent(event);
    event.preventDefault?.();
    row.style.borderTop = "none";

    try {
      const draggedData = JSON.parse(event.dataTransfer.getData("text/plain"));
      if (
        draggedData.promptIdx === promptIdx &&
        draggedData.slotIdx !== slotIdx
      ) {
        // Swap LoRA values between slots
        const fields = ["lora", "strength_model", "strength_clip", "trigger"];
        let swapped = false;

        // Guard flag: prevent lora widget callbacks from calling applyCompact mid-swap
        node.__AUN_loraMultiSwapping = true;

        for (const field of fields) {
          const fromWidgetName = `p${promptIdx}_${field}${draggedData.slotIdx}`;
          const toWidgetName = `p${promptIdx}_${field}${slotIdx}`;
          const fromWidget = getWidget(node, fromWidgetName);
          const toWidget = getWidget(node, toWidgetName);

          if (fromWidget && toWidget) {
            const fromValue = fromWidget.value;
            const toValue = toWidget.value;

            // Perform the swap
            setWidgetValue(fromWidget, toValue);
            setWidgetValue(toWidget, fromValue);
            swapped = true;
          }
        }

        if (swapped) {
          // Clear execution cache to force re-evaluation
          node.__AUN_loraMultiLastPromptIndex = null;
          node.__AUN_loraMultiLastLabels = null;
          node.__AUN_loraMultiLastSelectedLoras = null;
          node.__AUN_loraMultiLastTriggers = null;

          // Force immediate updates (once, after all swaps are done)
          applyCompact(node);

          // Ensure overlay rows are synced with new widget values
          const rows = node.__AUN_loraMultiCompactRows;
          if (rows && Array.isArray(rows)) {
            for (const r of rows) {
              syncCompactRow(node, r, showClipStrength(node));
            }
          }

          forceRedraw(node);
          scheduleAutoHeightUpdate(node, 1, 0);
        }

        node.__AUN_loraMultiSwapping = false;
      }
    } catch (err) {
      console.error("Error during LoRA reorder:", err);
    }
  });

  // Visual feedback on hover
  loraLabel.addEventListener("mouseenter", () => {
    if (!row.classList.contains("dragging")) {
      loraLabel.style.cursor = "grab";
      loraLabel.style.opacity = "0.85";
    }
  });

  loraLabel.addEventListener("mouseleave", () => {
    if (!row.classList.contains("dragging")) {
      loraLabel.style.opacity = "1";
      loraLabel.style.cursor = "default";
    }
  });

  return {
    promptIdx,
    slotIdx,
    root: row,
    loraLabel,
    loraLabelText,
    infoButton,
    strengthModelControl,
    strengthModel,
    strengthClipControl,
    strengthClip,
  };
}

function disposeCompactRows(node) {
  const rows = node.__AUN_loraMultiCompactRows;
  if (!Array.isArray(rows)) return;

  // Remove all DOM elements from the document
  for (const row of rows) {
    if (row?.root?.parentNode) {
      row.root.remove();
    }
  }

  node.__AUN_loraMultiCompactRows = null;
}

function ensureCompactRows(node) {
  if (Array.isArray(node.__AUN_loraMultiCompactRows)) {
    return node.__AUN_loraMultiCompactRows;
  }

  const rows = [];
  for (let p = 1; p <= MAX_PROMPTS; p++) {
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      rows.push(buildCompactRow(node, p, s));
    }
  }
  node.__AUN_loraMultiCompactRows = rows;
  return rows;
}

function syncCompactRow(node, row, showClipStrength) {
  const { promptIdx, slotIdx } = row;
  const loraWidget = getWidget(node, `p${promptIdx}_lora${slotIdx}`);
  const strengthModelWidget = getWidget(
    node,
    `p${promptIdx}_strength_model${slotIdx}`,
  );
  const strengthClipWidget = getWidget(
    node,
    `p${promptIdx}_strength_clip${slotIdx}`,
  );
  const loraValue = String(loraWidget?.value ?? "None");
  const hasLora = !!loraValue && loraValue !== "None";

  // Hide entire row if no LoRA selected for this slot
  row.root.style.display = hasLora ? "grid" : "none";
  if (!hasLora) return;

  row.root.dataset.hideClip = showClipStrength ? "false" : "true";
  // Also physically hide the clip control when toggle is off
  if (row.strengthClipControl) {
    row.strengthClipControl.style.display = showClipStrength ? "flex" : "none";
  }

  row.loraLabelText.textContent = formatCompactLoraLabel(loraValue);
  row.loraLabel.title = loraValue;
  row.infoButton.title = `Show LoRA info: ${loraValue}`;
  row.infoButton.style.visibility = "visible";

  if (document.activeElement !== row.strengthModel) {
    row.strengthModel.value = Number(strengthModelWidget?.value ?? 1).toFixed(
      2,
    );
  }
  if (document.activeElement !== row.strengthClip) {
    row.strengthClip.value = Number(strengthClipWidget?.value ?? 1).toFixed(2);
  }
}

function getWidgetBottomY(widget) {
  const widgetY = Number(widget?.last_y ?? widget?.y);
  if (!Number.isFinite(widgetY)) return null;
  const widgetHeight = globalThis.LiteGraph?.NODE_WIDGET_HEIGHT ?? 24;
  return widgetY + widgetHeight;
}

function graphToScreen(canvasRect, graphX, graphY, scale, offsetX, offsetY) {
  return {
    x: canvasRect.left + (graphX + offsetX) * scale,
    y: canvasRect.top + (graphY + offsetY) * scale
  };
}

/**
 * Check if another node (with higher z-order / index) overlaps this node's bounding box.
 * Returns true if the node is occluded and overlay rows should be hidden.
 */
function isNodeOccluded(node, canvasRect, scale, offsetX, offsetY) {
  const nodes = app?.graph?._nodes;
  if (!nodes) return false;

  // Compute this node's screen-space bounding box
  const selfScreen = graphToScreen(canvasRect, node.pos[0], node.pos[1], scale, offsetX, offsetY);
  const selfRight = selfScreen.x + (node.size?.[0] ?? 300) * scale;
  const selfBottom = selfScreen.y + (node.size?.[1] ?? 100) * scale;

  for (const other of nodes) {
    if (!other || other === node) continue;
    // Only consider nodes drawn on top (higher index = higher z-order in ComfyUI)
    if ((other.index ?? -1) <= (node.index ?? -2)) continue;
    if (other.flags?.collapsed) continue;

    const otherScreen = graphToScreen(canvasRect, other.pos[0], other.pos[1], scale, offsetX, offsetY);
    const otherRight = otherScreen.x + (other.size?.[0] ?? 300) * scale;
    const otherBottom = otherScreen.y + (other.size?.[1] ?? 100) * scale;

    // AABB overlap check — if any node above overlaps, this node is occluded
    if (!(otherRight <= selfScreen.x ||
          otherScreen.x >= selfRight ||
          otherBottom <= selfScreen.y ||
          otherScreen.y >= selfBottom)) {
      return true;
    }
  }

  return false;
}

function positionCompactRowsCore(node, canvasRect, scale, offsetX, offsetY, occluded) {
  const rows = ensureCompactRows(node);
  const promptIdx = resolvePromptIndex(node);
  const clipStrengthEnabled = showClipStrength(node);
  const currentWidth = node.size?.[0] ?? 200;

  // Position rows below the last visible widget (apply_lora)
  const applyLoraW = getWidget(node, "apply_lora");
  const runtimeRowY = getWidgetBottomY(applyLoraW);
  const baseY = Number.isFinite(runtimeRowY) ? runtimeRowY + 4 : null;

  if (!Number.isFinite(baseY)) {
    for (const row of rows) row.root.style.display = "none";
    return false;
  }

  // If baseY changed significantly, recalculate and update node height
  if (Math.abs((node.__AUN_compactFirstRowY ?? 0) - baseY) > 1) {
    node.__AUN_compactFirstRowY = baseY;
    scheduleAutoHeightUpdate(node, 1, 0);
  }

  const innerWidth = currentWidth - COMPACT_SIDE_PADDING * 2;
  const nodeX = node.pos?.[0] ?? 0;
  const nodeY = node.pos?.[1] ?? 0;
  let anyShown = false;

  for (const row of rows) {
    // Only show rows for active prompt and when not occluded
    if (row.promptIdx !== promptIdx || occluded) {
      row.root.style.display = "none";
      continue;
    }

    syncCompactRow(node, row, clipStrengthEnabled);

    // Skip positioning if row is hidden (no LoRA selected)
    const loraW = getWidget(node, `p${promptIdx}_lora${row.slotIdx}`);
    const loraValue = String(loraW?.value ?? "None");
    if (!loraValue || loraValue === "None") {
      row.root.style.display = "none";
      continue;
    }

    const localTop = baseY + (row.slotIdx - 1) * (COMPACT_ROW_HEIGHT + COMPACT_ROW_GAP);
    const graphLeft = nodeX + COMPACT_SIDE_PADDING;
    const graphTop = nodeY + localTop;
    const screenPos = graphToScreen(canvasRect, graphLeft, graphTop, scale, offsetX, offsetY);
    const screenBottomRight = graphToScreen(
      canvasRect,
      graphLeft + innerWidth,
      graphTop + COMPACT_ROW_HEIGHT,
      scale,
      offsetX,
      offsetY
    );
    Object.assign(row.root.style, {
      display: "grid",
      left: `${screenPos.x}px`,
      top: `${screenPos.y}px`,
      width: `${Math.max(80, screenBottomRight.x - screenPos.x)}px`,
      height: `${Math.max(22, screenBottomRight.y - screenPos.y)}px`,
    });
    anyShown = true;
  }
  return anyShown;
}

function positionCompactRows(node, ctx) {
  if (!isTargetNode(node)) return;
  const rows = ensureCompactRows(node);
  const compact = isCompact(node);
  const collapsed = isNodeCollapsed(node);

  // Hide all rows if: not compact, collapsed, no canvas, node being dragged, graph inactive, or canvas unstable
  const nodeDragging = node.__AUN_nodeBeingDragged;
  const graphActive = app?.canvas?.canvas && document.hasFocus?.();
  const stableFrames = app?.canvas?.__AUN_stableFrameCount ?? 0;
  const canvasStable = stableFrames >= 3;

  if (!compact || collapsed || !ctx?.canvas || nodeDragging || !graphActive || !canvasStable) {
    for (const row of rows) {
      row.root.style.display = "none";
    }
    return;
  }

  const canvasRect = ctx.canvas.getBoundingClientRect();
  const ds = app?.canvas?.ds;
  if (!ds) {
    for (const row of rows) {
      row.root.style.display = "none";
    }
    return;
  }
  const scale = ds.scale || 1;
  const offsetX = ds.offset?.[0] ?? 0;
  const offsetY = ds.offset?.[1] ?? 0;

  // On-screen visibility check
  const nodeScreen = graphToScreen(canvasRect, node.pos[0], node.pos[1], scale, offsetX, offsetY);
  const nodeW = (node.size?.[0] ?? 300) * scale;
  const nodeH = (node.size?.[1] ?? 100) * scale;
  const padding = 20;
  const nodeOnScreen =
    nodeScreen.x + nodeW + padding > canvasRect.left &&
    nodeScreen.x - padding < canvasRect.right &&
    nodeScreen.y + nodeH + padding > canvasRect.top &&
    nodeScreen.y - padding < canvasRect.bottom;

  if (!nodeOnScreen) {
    for (const row of rows) {
      row.root.style.display = "none";
    }
    return;
  }

  positionCompactRowsCore(node, canvasRect, scale, offsetX, offsetY, isNodeOccluded(node, canvasRect, scale, offsetX, offsetY));
}

function positionCompactRowsFromCanvas(node) {
  if (!isTargetNode(node)) return;
  const rows = ensureCompactRows(node);
  const compact = isCompact(node);
  const collapsed = isNodeCollapsed(node);
  if (!compact || collapsed) {
    for (const row of rows) row.root.style.display = "none";
    return;
  }
  const canvas = app?.canvas;
  if (!canvas || !canvas.canvas || !canvas.ds) {
    for (const row of rows) row.root.style.display = "none";
    return;
  }
  const canvasRect = canvas.canvas.getBoundingClientRect();
  const scale = canvas.ds.scale || 1;
  const offsetX = canvas.ds.offset?.[0] ?? 0;
  const offsetY = canvas.ds.offset?.[1] ?? 0;
  const nodeScreen = graphToScreen(canvasRect, node.pos[0], node.pos[1], scale, offsetX, offsetY);
  const nodeW = (node.size?.[0] ?? 300) * scale;
  const nodeH = (node.size?.[1] ?? 100) * scale;
  const padding = 20;
  const nodeOnScreen =
    nodeScreen.x + nodeW + padding > canvasRect.left &&
    nodeScreen.x - padding < canvasRect.right &&
    nodeScreen.y + nodeH + padding > canvasRect.top &&
    nodeScreen.y - padding < canvasRect.bottom;
  if (!nodeOnScreen) {
    for (const row of rows) row.root.style.display = "none";
    return;
  }
  positionCompactRowsCore(node, canvasRect, scale, offsetX, offsetY, isNodeOccluded(node, canvasRect, scale, offsetX, offsetY));
}

let compactRowsRAF = null;
function hasCompactLoraMultiNodes() {
  if (!app?.graph) return false;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  return nodes.some((n) => isTargetNode(n) && isCompact(n));
}

function startCompactRowsRAF() {
  if (compactRowsRAF != null) return;
  const tick = () => {
    if (!hasCompactLoraMultiNodes()) {
      compactRowsRAF = null;
      return;
    }
    if (!app?.graph) {
      compactRowsRAF = null;
      return;
    }
    const nodes = app.graph._nodes || app.graph.nodes || [];
    for (const node of nodes) {
      if (isTargetNode(node) && isCompact(node)) {
        positionCompactRowsFromCanvas(node);
      }
    }
    compactRowsRAF = requestAnimationFrame(tick);
  };
  compactRowsRAF = requestAnimationFrame(tick);
}

function stopCompactRowsRAF() {
  if (compactRowsRAF != null) {
    cancelAnimationFrame(compactRowsRAF);
    compactRowsRAF = null;
  }
}

function scheduleCompactRowsUpdate() {
  if (!hasCompactLoraMultiNodes()) {
    stopCompactRowsRAF();
    return;
  }
  startCompactRowsRAF();
}

function setupCanvasTransformMonitor() {
  const canvas = app?.canvas;
  if (!canvas || canvas.__AUN_transformMonitorSetup) return;
  canvas.__AUN_transformMonitorSetup = true;

  // Frame-based stabilization: rows only appear after N consecutive stable frames.
  const STABLE_FRAMES_NEEDED = 3;
  canvas.__AUN_stableFrameCount = 0;

  // Hide ALL compact rows (both node types share this guard)
  const hideAllCompactRows = () => {
    const nodes = app?.graph?._nodes;
    if (!nodes) return;
    for (const n of nodes) {
      for (const row of n.__AUN_compactRows ?? []) {
        row.root.style.display = "none";
      }
      for (const row of n.__AUN_loraMultiCompactRows ?? []) {
        row.root.style.display = "none";
      }
    }
  };

  // Reset stable frame counter and hide rows immediately
  const markCanvasUnstable = () => {
    canvas.__AUN_stableFrameCount = 0;
    hideAllCompactRows();
  };

  // Use the actual DOM <canvas> element for event listeners (LGraphCanvas doesn't have addEventListener)
  const domCanvas = canvas.canvas;
  if (domCanvas) {
    // Proactively mark unstable when canvas interaction starts
    domCanvas.addEventListener("mousedown", (e) => {
      if (e.target === domCanvas || e.target === canvas) {
        markCanvasUnstable();
        scheduleCompactRowsUpdate();
      }
    });

    domCanvas.addEventListener("wheel", () => {
      markCanvasUnstable();
      scheduleCompactRowsUpdate();
    });
  }

  // Monitor transform changes on every draw cycle
  let lastTransform = null;
  const JUMP_THRESHOLD = 100;

  const originalDraw = canvas.draw;
  canvas.draw = function drawTransformMonitor() {
    const transform = this.getTransform?.();
    const current = transform
      ? `${transform.a.toFixed(2)},${transform.b.toFixed(2)},${transform.c.toFixed(2)},${transform.d.toFixed(2)},${transform.e.toFixed(2)},${transform.f.toFixed(2)}`
      : null;

    if (current && lastTransform) {
      const prev = lastTransform.split(",").map(Number);
      const curr = current.split(",").map(Number);
      const dx = Math.abs(curr[4] - prev[4]);
      const dy = Math.abs(curr[5] - prev[5]);
      const ds = Math.abs(curr[0] - prev[0]); // scale change

      if (dx > JUMP_THRESHOLD || dy > JUMP_THRESHOLD || ds > 0.01) {
        markCanvasUnstable();
        scheduleCompactRowsUpdate();
      } else {
        canvas.__AUN_stableFrameCount = (canvas.__AUN_stableFrameCount || 0) + 1;
      }
    } else {
      // First frame or no transform — mark unstable
      markCanvasUnstable();
    }

    lastTransform = current;

    // Draw — positionCompactRows checks canvas.__AUN_stableFrameCount to decide
    const result = originalDraw.apply(this, arguments);
    return result;
  };
}

function applyCompact(node) {
  const compact = isCompact(node);
  const promptIdx = resolvePromptIndex(node);
  const numPrompts = getNumPrompts(node);

  // In compact mode: ONLY show prompt_index and apply_lora
  // base_prompt is hidden (overlay replaces all LoRA widgets)
  const alwaysVisible = new Set(
    !compact ? [] : ["prompt_index", "apply_lora"],
  );

  // Apply visibility to all widgets
  for (let p = 1; p <= MAX_PROMPTS; p++) {
    const isActivePrompt = p <= numPrompts;
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      const loraW = getWidget(node, `p${p}_lora${s}`);
      const loraValue = String(loraW?.value ?? "None");
      const hasLora = loraValue && loraValue !== "None";

      // In compact mode, hide ALL LoRA widgets - overlay provides UI
      if (loraW) {
        ensureHiddenAwareWidget(loraW);
        applyWidgetHiddenState(loraW, !isActivePrompt || compact);
      }

      const smW = getWidget(node, `p${p}_strength_model${s}`);
      if (smW) {
        ensureHiddenAwareWidget(smW);
        applyWidgetHiddenState(smW, !isActivePrompt || !hasLora || compact);
      }

      const scW = getWidget(node, `p${p}_strength_clip${s}`);
      if (scW) {
        ensureHiddenAwareWidget(scW);
        applyWidgetHiddenState(
          scW,
          !isActivePrompt || !hasLora || !showClipStrength(node) || compact,
        );
      }

      const tW = getWidget(node, `p${p}_trigger${s}`);
      if (tW) {
        ensureHiddenAwareWidget(tW);
        applyWidgetHiddenState(tW, !isActivePrompt || !hasLora || compact);
      }
    }
  }

  // Ensure base_prompt is hidden in compact mode
  const basePromptW = getWidget(node, "base_prompt");
  if (basePromptW) {
    ensureHiddenAwareWidget(basePromptW);
    applyWidgetHiddenState(basePromptW, compact);
  }

  // Hide label widget in compact mode (canvas overlay replaces it)
  const labelW = getWidget(node, "label");
  if (labelW) {
    ensureHiddenAwareWidget(labelW);
    applyWidgetHiddenState(labelW, compact);
  }

  // Hide num_prompts in compact mode
  const numPromptsW = getWidget(node, "num_prompts");
  if (numPromptsW) {
    ensureHiddenAwareWidget(numPromptsW);
    applyWidgetHiddenState(numPromptsW, compact);
  }

  // Sync hidden clip strengths
  syncHiddenClipStrength(node);

  updateAutoHeight(node);
  scheduleAutoHeightUpdate(node);
  node.setDirtyCanvas?.(true, true);

  // Start RAF loop for continuous overlay repositioning during pan/zoom
  if (compact) {
    scheduleCompactRowsUpdate();
  } else {
    // Stop RAF if compact mode is off for this node (other nodes may still need it)
    scheduleCompactRowsUpdate();
  }
}

function toggleCompactMode(node, { force = false } = {}) {
  if (node.__AUN_loraMultiToggleInProgress) return;

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

  node.__AUN_loraMultiToggleInProgress = true;
  try {
    setCompact(node, !isCompact(node));
    applyCompact(node);
  } finally {
    setTimeout(() => {
      node.__AUN_loraMultiToggleInProgress = false;
    }, 50);
  }
}

function hookPromptIndexChange(node) {
  const promptW = getWidget(node, "prompt_index");
  if (!promptW || promptW.__AUN_multiHooked) return;

  const origCb = promptW.callback;
  promptW.callback = function callback(value) {
    origCb?.call(promptW, value);
    // Clear execution cache so widget value takes precedence
    node.__AUN_loraMultiLastPromptIndex = null;
    node.__AUN_loraMultiLastLabels = null;
    node.__AUN_loraMultiLastSelectedLoras = null;
    node.__AUN_loraMultiLastTriggers = null;
    applyCompact(node);
    forceRedraw(node);
    scheduleAutoHeightUpdate(node);
  };
  promptW.__AUN_multiHooked = true;
}

function hookNumPromptsChange(node) {
  const numW = getWidget(node, "num_prompts");
  if (!numW || numW.__AUN_multiHooked) return;

  const origCb = numW.callback;
  numW.callback = function callback(value) {
    origCb?.call(numW, value);
    applyCompact(node);
  };
  numW.__AUN_multiHooked = true;
}

function hookLoraChange(node) {
  for (let p = 1; p <= MAX_PROMPTS; p++) {
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      const loraW = getWidget(node, `p${p}_lora${s}`);
      if (!loraW || loraW.__AUN_multiHooked) continue;

      const origCb = loraW.callback;
      loraW.callback = function callback(value) {
        origCb?.call(loraW, value);
        // Skip if a swap is in progress (swap handler will call applyCompact once)
        if (node.__AUN_loraMultiSwapping) return;
        applyCompact(node);
        forceRedraw(node);
        scheduleAutoHeightUpdate(node, 1, 50);
      };
      loraW.__AUN_multiHooked = true;
    }
  }
}

function hookStrengthModelChange(node) {
  for (let p = 1; p <= MAX_PROMPTS; p++) {
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      const modelW = getWidget(node, `p${p}_strength_model${s}`);
      if (!modelW || modelW.__AUN_multiHooked) continue;

      const origCb = modelW.callback;
      modelW.callback = function callback(value) {
        origCb?.call(modelW, value);
        // Sync hidden clip strengths whenever model strength changes
        syncHiddenClipStrength(node);
      };
      modelW.__AUN_multiHooked = true;
    }
  }
}

function startCompactLiveMonitor(node) {
  if (!node || node.__AUN_loraMultiMonitorId) return;
  let lastSignature = "";

  // Helper: trace the label input value (same logic as onDrawForeground)
  const readLabelValue = () => {
    const labelInput = node.inputs?.find((inp) => inp.name === "label");
    if (!labelInput?.link) {
      const labelW = getWidget(node, "label");
      return String(labelW?.value ?? "");
    }
    // Simple one-level trace: follow the link and read cached output
    const link = app.graph.links?.get?.(labelInput.link);
    if (!link?.origin_id) return "";
    const srcNode = app.graph.getNodeById?.(link.origin_id);
    if (!srcNode) return "";
    if (srcNode.__AUN_lastOutput_label != null) return String(srcNode.__AUN_lastOutput_label);
    if (srcNode.__AUN_lastOutput_text != null) return String(srcNode.__AUN_lastOutput_text);
    const slotKey = `__AUN_lastOutput_${link.origin_slot}`;
    if (srcNode[slotKey] != null) return String(srcNode[slotKey]);
    if (srcNode.__AUN_lastOutput != null) return String(srcNode.__AUN_lastOutput);
    return "";
  };

  const readSignature = () => {
    const promptIdx = resolvePromptIndex(node);
    const parts = [String(promptIdx)];
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      const loraW = getWidget(node, `p${promptIdx}_lora${s}`);
      parts.push(String(loraW?.value ?? "None"));
    }
    // Include upstream label value so changes from Random/Increment/Range switches trigger redraw
    parts.push(readLabelValue());
    return parts.join("|");
  };

  const check = () => {
    if (!node || node.type === undefined) {
      if (node?.__AUN_loraMultiMonitorId) {
        clearInterval(node.__AUN_loraMultiMonitorId);
        node.__AUN_loraMultiMonitorId = null;
      }
      return;
    }

    const signature = readSignature();
    if (signature !== lastSignature) {
      lastSignature = signature;
      if (isCompact(node)) {
        applyCompact(node);
        forceRedraw(node);
        scheduleAutoHeightUpdate(node, 1, 0);
      }
    }
  };

  node.__AUN_loraMultiMonitorId = setInterval(check, 150);
  setTimeout(check, 0);

  const hideAllRows = () => {
    if (node?.__AUN_loraMultiCompactRows) {
      for (const row of node.__AUN_loraMultiCompactRows) {
        row.root.style.display = "none";
      }
    }
  };

  // Hide overlays when window loses focus (switching tabs)
  const onBlur = () => hideAllRows();
  window.addEventListener("blur", onBlur);

  // Hide overlays when visibility changes (minimizing window, switching tabs, etc.)
  const onVisibilityChange = () => {
    if (document.hidden) {
      hideAllRows();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  const originalOnRemoved = node.onRemoved;
  node.onRemoved = function onRemoved() {
    // Properly dispose DOM elements
    disposeCompactRows(node);
    if (node.__AUN_loraMultiMonitorId) {
      clearInterval(node.__AUN_loraMultiMonitorId);
      node.__AUN_loraMultiMonitorId = null;
    }
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    return originalOnRemoved?.apply(this, arguments);
  };
}

function setupNode(node) {
  if (node.__AUN_loraMultiCompactInit) return;
  node.__AUN_loraMultiCompactInit = true;

  node.properties = node.properties || {};
  if (typeof node.properties[PROP_KEY] !== "boolean") {
    setCompact(node, true);
  }
  if (typeof node.properties[CLIP_STRENGTH_PROP_KEY] !== "boolean") {
    setShowClipStrength(node, true);
  }

  // Set up canvas transform monitor (shared across node types)
  setupCanvasTransformMonitor();

  // Set up global drag monitoring (once per canvas)
  const canvas = app?.canvas;
  if (canvas && !canvas.__AUN_dragMonitorSetup) {
    canvas.__AUN_dragMonitorSetup = true;
    const origOnNodeDragStart = canvas.onNodeDragStart;
    canvas.onNodeDragStart = function onNodeDragStart(
      event,
      node_being_dragged,
    ) {
      if (node_being_dragged) {
        node_being_dragged.__AUN_nodeBeingDragged = true;
      }
      return origOnNodeDragStart?.apply(this, arguments);
    };

    const origOnNodeDragEnd = canvas.onNodeDragEnd;
    canvas.onNodeDragEnd = function onNodeDragEnd(event) {
      // Clear the flag for all nodes in the graph
      if (canvas.graph?._nodes) {
        for (const n of canvas.graph._nodes) {
          n.__AUN_nodeBeingDragged = false;
        }
      }
      return origOnNodeDragEnd?.apply(this, arguments);
    };
  }

  // Instance-level handlers (onDblClick, getExtraMenuOptions, onResize, setSize, onDrawForeground)
  // are now set on the prototype in beforeRegisterNodeDef — no need to duplicate here.

  hookPromptIndexChange(node);
  hookNumPromptsChange(node);
  hookLoraChange(node);
  hookStrengthModelChange(node);
  startCompactLiveMonitor(node);

  applyCompact(node);
}

function initExistingNodes() {
  if (!app?.graph) return;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  let initialized = false;
  for (const node of nodes) {
    if (isTargetNode(node) && !node.__AUN_loraMultiCompactInit) {
      setupNode(node);
      scheduleAutoHeightUpdate(node, 2, 0);
      initialized = true;
    }
  }
  return initialized;
}

// Persistent global scanner: catches nodes created after initial load
// (e.g., via context menu reload, graph paste, dynamic node creation)
let __AUN_loraMultiScanTimer = null;
function startLoraMultiScanner() {
  if (__AUN_loraMultiScanTimer) return;
  __AUN_loraMultiScanTimer = setInterval(() => {
    initExistingNodes();
  }, 2000);
}

app.registerExtension({
  name: "AUN.RandomLoraMultiCompact",

  async setup() {
    // Ensure all existing nodes are initialized (covers F5 refresh where loadedGraphNode may not fire)
    initExistingNodes();
    // Start persistent scanner for nodes created dynamically
    startLoraMultiScanner();

    // Listen for AUN_random_text_index_selected events from AUNTextIndexSwitch nodes
    // These fire when the switch executes in Random/Increment/Range mode
    api.addEventListener("AUN_random_text_index_selected", ({ detail }) => {
      console.log("[AUN] AUN_random_text_index_selected received:", detail);
      if (!detail || !app?.graph) return;
      const nodeId = detail?.node_id;
      if (!nodeId) return;

      // Find the switch node
      const switchNode = app.graph.getNodeById?.(nodeId) || app.graph.getNodeById?.(parseInt(nodeId, 10));
      if (!switchNode) {
        console.log("[AUN] AUN_random_text_index_selected: node", nodeId, "not found");
        return;
      }

      const idx = parseInt(detail?.index) || 1;
      const textN = switchNode.widgets?.find(w => w.name === `text${idx}`);
      if (textN && typeof textN.value === "string" && textN.value) {
        const labelValue = textN.value.split("\n")[0].trim();
        // Cache on the switch node so traceLinkValue can find it
        switchNode.__AUN_lastOutput_label = labelValue;
        switchNode.__AUN_lastOutput_text = textN.value;
        switchNode.__AUN_lastOutput = labelValue;
        console.log("[AUN] AUN_random_text_index_selected: node", nodeId, "index", idx, "label:", labelValue);
      }

      // Trigger redraw on all target nodes
      scheduleGlobalRedraw();
    });

    // Listen for "executed" events from the server for every node
    // Format: { node: nodeId, output: { key: value, ... } }
    // The keys in output are RETURN_NAMES, we need to map them to slot indices
    api.addEventListener("executed", ({ detail }) => {
      const nodeId = detail?.node;
      const output = detail?.output;
      if (!nodeId || !output) return;

      // Try both string and numeric node ID
      let node = app.graph.getNodeById?.(nodeId);
      if (!node) {
        const numericId = parseInt(nodeId, 10);
        if (!Number.isNaN(numericId)) {
          node = app.graph.getNodeById?.(numericId);
        }
      }
      if (!node) return;

      // Build name->slot mapping from node.outputs
      const nameToSlot = {};
      if (node.outputs) {
        for (let i = 0; i < node.outputs.length; i++) {
          if (node.outputs[i]?.name) {
            nameToSlot[node.outputs[i].name] = i;
          }
        }
      }

      for (const [key, val] of Object.entries(output)) {
        const slotIdx = nameToSlot[key];
        if (typeof val === "string" && val) {
          node[`__AUN_lastOutput_${key}`] = val;
          if (slotIdx != null) node[`__AUN_lastOutput_${slotIdx}`] = val;
          node.__AUN_lastOutput = val;
        } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string" && val[0]) {
          for (let i = 0; i < val.length; i++) {
            node[`__AUN_lastOutput_${key}_${i}`] = val[i];
          }
          if (slotIdx != null) node[`__AUN_lastOutput_${slotIdx}`] = val[0];
          node.__AUN_lastOutput = val[0];
        }
      }

      // Mark all nodes dirty so downstream label overlays (e.g. AUNRandomLoraModelOnlyMulti)
      // redraw with the newly traced value — critical when upstream switch nodes use
      // Random/Increment/Range modes where the widget index differs from the actual output.
      scheduleGlobalRedraw();
    });

    api.addEventListener("AUN_random_lora_multi_selected", ({ detail }) => {
      if (!detail || !app?.graph) return;

      const node = findGraphNodeByEventId(detail.node_id);
      if (!isTargetNode(node)) return;

      if (Number.isFinite(detail.prompt_index)) {
        node.__AUN_loraMultiLastPromptIndex = detail.prompt_index;
      }
      if (Array.isArray(detail.selected_loras)) {
        node.__AUN_loraMultiLastSelectedLoras = detail.selected_loras;
      }
      if (Array.isArray(detail.lora_labels)) {
        node.__AUN_loraMultiLastLabels = detail.lora_labels;
      }
      if (Array.isArray(detail.trigger_words_list)) {
        node.__AUN_loraMultiLastTriggers = detail.trigger_words_list;
      }

      forceRedraw(node);
    });
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    // Hook onExecuted for ALL node types to cache output for label tracing
    if (nodeType.prototype.__AUN_loraMultiProtoExecHooked) return;

    const originalOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function onExecuted(message) {
      originalOnExecuted?.apply(this, arguments);

      // Cache output on every node for downstream label tracing
      if (message) {
        for (const [key, val] of Object.entries(message)) {
          if (typeof val === "string" && val) {
            this[`__AUN_lastOutput_${key}`] = val;
            this.__AUN_lastOutput = val;
          } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string" && val[0]) {
            for (let i = 0; i < val.length; i++) {
              this[`__AUN_lastOutput_${key}_${i}`] = val[i];
            }
            this.__AUN_lastOutput = val[0];
          }
        }
      }

      // Also apply lora-specific payload if this is the target node
      if (nodeData?.name === NODE_TYPE) {
        applyExecutionPayload(this, message);
      }
    };
    nodeType.prototype.__AUN_loraMultiProtoExecHooked = true;

    // --- Prototype-level handlers for target node type ---
    // These persist across all instances, even when nodes are recreated via context menu reload.
    if (nodeData?.name !== NODE_TYPE) return;

    // onDblClick
    const protoOrigDblClick = nodeType.prototype.onDblClick;
    nodeType.prototype.onDblClick = function onDblClick(event, pos) {
      protoOrigDblClick?.apply(this, arguments);
      if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) {
        return;
      }
      toggleCompactMode(this);
    };

    // getExtraMenuOptions
    const protoOrigMenu = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function getExtraMenuOptions(
      graphcanvas,
      options,
    ) {
      protoOrigMenu?.apply(this, arguments);
      const compact = isCompact(this);
      options.push({
        content: compact ? "AUN: Show all prompts" : "AUN: Compact mode",
        callback: () => {
          setCompact(this, !isCompact(this));
          applyCompact(this);
        },
      });
      options.push({
        content: showClipStrength(this)
          ? "AUN: Hide clip strength"
          : "AUN: Show clip strength",
        callback: () => {
          setShowClipStrength(this, !showClipStrength(this));
          applyCompact(this);
        },
      });
      options.push({
        content: showFooter(this) ? "AUN: Hide footer" : "AUN: Show footer",
        callback: () => {
          setShowFooter(this, !showFooter(this));
          updateAutoHeight(this);
          forceRedraw(this);
        },
      });
    };

    // onResize
    const protoOrigOnResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function onResize(...args) {
      const result = protoOrigOnResize?.apply(this, args);
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

    // setSize
    const protoOrigSetSize = nodeType.prototype.setSize;
    nodeType.prototype.setSize = function setSize(newSize) {
      if (
        this.__AUN_internalResize ||
        !isCompact(this) ||
        !Array.isArray(newSize)
      ) {
        return protoOrigSetSize?.call(this, newSize);
      }
      const [width, height] = newSize;
      const currentWidth = Number.isFinite(width)
        ? width
        : (this.size?.[0] ?? 200);
      const minimumHeight = getMinimumCompactHeight(this, currentWidth);
      if (
        Number.isFinite(minimumHeight) &&
        Number.isFinite(height) &&
        height < minimumHeight
      ) {
        const constrainedSize = [currentWidth, minimumHeight];
        return protoOrigSetSize?.call(this, constrainedSize);
      }
      return protoOrigSetSize?.call(this, newSize);
    };

    // onDrawForeground
    const protoOrigDrawFg = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function onDrawForeground(ctx) {
      if (!this.__AUN_internalResize && isCompact(this)) {
        const currentWidth = Number(this.size?.[0]) || 200;
        const currentHeight = Number(this.size?.[1]);
        const targetHeight = getMinimumCompactHeight(this, currentWidth);
        if (
          Number.isFinite(targetHeight) &&
          Number.isFinite(currentHeight) &&
          Math.abs(currentHeight - targetHeight) > 1
        ) {
          this.__AUN_internalResize = true;
          this.size[1] = targetHeight;
          this.__AUN_internalResize = false;
        }
      }
      protoOrigDrawFg?.apply(this, arguments);
      positionCompactRows(this, ctx);
      if (!isCompact(this) || isNodeCollapsed(this)) return;

      // Draw label overlay
      let labelText = "";
      {
        const labelW = getWidget(this, "label");
        const labelInput = this.inputs?.find((inp) => inp.name === "label");
        const skipWidgetNames = new Set([
          "range", "minimum", "maximum", "mode", "index",
          "slot_count", "seed", "control_after_generate",
          "steps", "step", "count", "num"
        ]);
        function traceLinkValue(startLink, visited, depth) {
          depth = depth || 0;
          if (!startLink) return undefined;
          const link = app.graph.links?.get?.(startLink);
          if (!link?.origin_id) return undefined;
          const n = app.graph.getNodeById?.(link.origin_id);
          if (!n) return undefined;
          if (visited.has(n.id)) return undefined;
          visited.add(n.id);
          if (n.__AUN_lastOutput_label != null) return String(n.__AUN_lastOutput_label);
          if (n.__AUN_lastOutput_text != null) return String(n.__AUN_lastOutput_text);
          const labelSlotIdx = n.outputs?.findIndex(o => o.name === "label");
          const preferredSlot = labelSlotIdx != null ? labelSlotIdx : link.origin_slot;
          const slotKey = `__AUN_lastOutput_${preferredSlot}`;
          if (n[slotKey] != null) return String(n[slotKey]);
          const connectedSlotKey = `__AUN_lastOutput_${link.origin_slot}`;
          if (n[connectedSlotKey] != null) return String(n[connectedSlotKey]);
          if (n.__AUN_lastOutput != null) return String(n.__AUN_lastOutput);
          if (n.__AUN_loraMultiLastLabel != null) return String(n.__AUN_loraMultiLastLabel);
          const nodeType = (n.type || "").toUpperCase();
          if (nodeType.includes("SWITCH") || nodeType.includes("RANDOM")) {
            const idxW = n.widgets?.find(w => w.name === "index");
            if (idxW) {
              const idx = parseInt(idxW.value) || 1;
              const textN = n.widgets?.find(w => w.name === `text${idx}`);
              if (textN && typeof textN.value === "string" && textN.value) {
                return textN.value.split("\n")[0].trim();
              }
            }
          }
          const textWidget = n.widgets?.find((w) => {
            const name = (w.name || "").toLowerCase();
            if (skipWidgetNames.has(name)) return false;
            const type = (w.type || "").toUpperCase();
            return (
              type === "TEXT" || type === "STRING" || type === "CUSTOMTEXT" ||
              name === "value" || name === "text" || name === "label" ||
              name === "output_text" || name === "result"
            );
          });
          if (textWidget && typeof textWidget.value === "string" && textWidget.value) {
            const hasInputLinks = n.inputs?.some(inp => inp.link);
            if (!hasInputLinks) return textWidget.value;
          }
          const srcInput = n.inputs?.[link.origin_slot];
          if (srcInput?.link) return traceLinkValue(srcInput.link, visited, depth + 1);
          return undefined;
        }
        if (labelInput?.link) {
          labelText = traceLinkValue(labelInput.link, new Set()) ?? "";
        } else if (labelW) {
          labelText = labelW.value ?? "";
        }
      }

      if (labelText && typeof labelText === "string" && labelText.trim()) {
        const w = this.size[0];
        const x0 = 10;
        const x1 = w - 10;
        const applyLoraW = getWidget(this, "apply_lora");
        const applyLoraBottom = getWidgetBottomY(applyLoraW);
        const overlayTop = Number.isFinite(applyLoraBottom) ? applyLoraBottom + 4 : null;
        const promptIdx = resolvePromptIndex(this);
        let visibleRowCount = 0;
        for (let slotIdx = 1; slotIdx <= LORAS_PER_PROMPT; slotIdx++) {
          const loraWidget = getWidget(this, `p${promptIdx}_lora${slotIdx}`);
          const loraValue = String(loraWidget?.value ?? "None");
          if (loraValue && loraValue !== "None") visibleRowCount++;
        }
        const overlayBottom = Number.isFinite(overlayTop)
          ? overlayTop + visibleRowCount * COMPACT_ROW_HEIGHT + Math.max(0, visibleRowCount - 1) * COMPACT_ROW_GAP
          : null;
        const labelY = Number.isFinite(overlayBottom) ? overlayBottom + 6 : (LiteGraph.NODE_TITLE_HEIGHT + 4);
        const y0 = labelY;
        const y1 = y0 + 18;
        const maxWidth = x1 - x0;
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.beginPath();
        ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 4);
        ctx.fill();
        ctx.fillStyle = "rgba(220, 220, 220, 0.95)";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        let displayText = labelText.trim();
        const ellipsis = "\u2026";
        const fullMetrics = ctx.measureText(displayText);
        if (fullMetrics.width > maxWidth) {
          let truncated = displayText;
          while (ctx.measureText(truncated + ellipsis).width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
          }
          displayText = truncated + ellipsis;
        }
        ctx.fillText(displayText, x0 + 4, (y1 - y0) / 2 + y0);
        ctx.restore();
      }

      if (!showFooter(this)) return;
      const promptIdx = resolvePromptIndex(this);
      const triggers = resolveTriggersForDisplay(this);
      let headerText, triggerText;
      if (triggers && triggers.length > 0) {
        headerText = `Prompt ${promptIdx} trigger words: `;
        triggerText = triggers.join(", ");
      } else {
        headerText = `Prompt ${promptIdx} trigger words (none)`;
        triggerText = "";
      }
      const footerHeight = getCompactFooterHeight(this);
      const w = this.size[0];
      const h = this.size[1];
      const y0 = h - footerHeight + 3;
      const y1 = h - 6;
      const x0 = 8;
      const x1 = w - 8;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.beginPath();
      ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(220,220,220,0.9)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const lineHeight = 16;
      const startX = x0 + 6;
      const startY = y0 + 2;
      const maxWidth = x1 - x0 - 12;
      const wrapText = (text) => {
        const lines = [];
        let currentLine = "";
        const words = text.split(", ");
        for (const word of words) {
          const testLine = currentLine ? currentLine + ", " + word : word;
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
      };
      if (triggerText) {
        const fullText = headerText + triggerText;
        const headerMetrics = ctx.measureText(headerText);
        if (headerMetrics.width + ctx.measureText(triggerText).width <= maxWidth) {
          ctx.fillText(fullText, startX, startY);
        } else {
          ctx.fillText(headerText, startX, startY);
          const wrappedTriggers = wrapText(triggerText);
          for (let i = 0; i < wrappedTriggers.length; i++) {
            ctx.fillText(wrappedTriggers[i], startX, startY + (i + 1) * lineHeight);
          }
        }
      } else {
        ctx.fillText(headerText, startX, startY);
      }
      ctx.restore();
    };
  },

  nodeCreated(node) {
    if (!isTargetNode(node)) return;
    setupNode(node);
    scheduleAutoHeightUpdate(node, 2, 0);
  },

  loadedGraphNode(node) {
    if (node.comfyClass !== NODE_TYPE && node.type !== NODE_TYPE) return;
    setupNode(node);
    applyCompact(node);
    scheduleAutoHeightUpdate(node, 2, 50);
  },
});
