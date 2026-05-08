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
  const footerHeight = getCompactFooterHeight(node);
  const padding = overlayHeight > 0 ? 8 : 0; // Padding between overlay and footer
  return visibleHeight + overlayHeight + padding + footerHeight;
}

function updateAutoHeight(node) {
  if (!node) return;
  const currentWidth = node.size?.[0] ?? 200;
  const height = computeVisibleNodeHeight(node, currentWidth);
  if (!Number.isFinite(height)) return;

  const overlayHeight = getCompactOverlayHeight(node);
  const footerHeight = getCompactFooterHeight(node);
  const padding = overlayHeight > 0 ? 8 : 0;
  const finalHeight = height + overlayHeight + padding + footerHeight;

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

  // Drag-to-reorder support
  row.draggable = true;
  row.addEventListener("dragstart", (event) => {
    stopCanvasEvent(event);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "text/plain",
      JSON.stringify({ promptIdx, slotIdx }),
    );
    row.classList.add("dragging");
    row.style.opacity = "0.5";
    row.style.cursor = "grabbing";
  });

  row.addEventListener("dragend", (event) => {
    stopCanvasEvent(event);
    row.classList.remove("dragging");
    row.style.opacity = "1";
    row.style.cursor = "grab";
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

          // Force immediate updates
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
      }
    } catch (err) {
      console.error("Error during LoRA reorder:", err);
    }
  });

  // Visual feedback on hover
  row.addEventListener("mouseenter", () => {
    if (!row.classList.contains("dragging")) {
      row.style.cursor = "grab";
      row.style.opacity = "0.85";
    }
  });

  row.addEventListener("mouseleave", () => {
    if (!row.classList.contains("dragging")) {
      row.style.opacity = "1";
      row.style.cursor = "default";
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

function positionCompactRows(node, ctx) {
  if (!isTargetNode(node)) return;
  const rows = ensureCompactRows(node);
  const compact = isCompact(node);
  const collapsed = isNodeCollapsed(node);
  const promptIdx = resolvePromptIndex(node);
  const numPrompts = getNumPrompts(node);
  const clipStrengthEnabled = showClipStrength(node);
  const currentWidth = node.size?.[0] ?? 200;

  if (!compact || collapsed || !ctx?.canvas) {
    for (const row of rows) {
      row.root.style.display = "none";
    }
    return;
  }

  const canvasRect = ctx.canvas.getBoundingClientRect();
  const matrix = new DOMMatrix()
    .scaleSelf(
      canvasRect.width / ctx.canvas.width,
      canvasRect.height / ctx.canvas.height,
    )
    .multiplySelf(ctx.getTransform());

  // Position rows below the last visible widget (base_prompt or apply_lora)
  const basePromptW = getWidget(node, "base_prompt");
  const applyLoraW = getWidget(node, "apply_lora");
  const runtimeRowY =
    getWidgetBottomY(basePromptW) ?? getWidgetBottomY(applyLoraW);
  const baseY = Number.isFinite(runtimeRowY) ? runtimeRowY + 8 : null;

  if (!Number.isFinite(baseY)) {
    // Cannot determine position, hide all rows
    for (const row of rows) {
      row.root.style.display = "none";
    }
    return;
  }

  // If baseY changed significantly, recalculate and update node height
  if (Math.abs((node.__AUN_compactFirstRowY ?? 0) - baseY) > 1) {
    node.__AUN_compactFirstRowY = baseY;
    scheduleAutoHeightUpdate(node, 1, 0);
  }

  const innerWidth = currentWidth - COMPACT_SIDE_PADDING * 2;

  for (const row of rows) {
    // Only show rows for active prompt
    if (row.promptIdx !== promptIdx) {
      row.root.style.display = "none";
      continue;
    }

    syncCompactRow(node, row, clipStrengthEnabled);

    // Skip positioning if row is hidden (no LoRA selected)
    if (row.root.style.display === "none") {
      continue;
    }

    const localTop =
      baseY + (row.slotIdx - 1) * (COMPACT_ROW_HEIGHT + COMPACT_ROW_GAP);
    const topLeft = new DOMPoint(
      COMPACT_SIDE_PADDING,
      localTop,
    ).matrixTransform(matrix);
    const bottomRight = new DOMPoint(
      COMPACT_SIDE_PADDING + innerWidth,
      localTop + COMPACT_ROW_HEIGHT,
    ).matrixTransform(matrix);

    Object.assign(row.root.style, {
      display: "grid",
      left: `${canvasRect.left + topLeft.x}px`,
      top: `${canvasRect.top + topLeft.y}px`,
      width: `${Math.max(80, bottomRight.x - topLeft.x)}px`,
      height: `${Math.max(22, bottomRight.y - topLeft.y)}px`,
    });
  }
}

function applyCompact(node) {
  const compact = isCompact(node);
  const promptIdx = resolvePromptIndex(node);
  const numPrompts = getNumPrompts(node);

  // In compact mode: ONLY show prompt_index, apply_lora, base_prompt
  // ALL LoRA widgets are hidden because overlay replaces them
  const alwaysVisible = new Set(
    !compact ? [] : ["prompt_index", "apply_lora", "base_prompt"],
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

  // Ensure base_prompt is properly sized
  const basePromptW = getWidget(node, "base_prompt");
  if (basePromptW) {
    ensureHiddenAwareWidget(basePromptW);
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
        applyCompact(node);
        forceRedraw(node);
        scheduleAutoHeightUpdate(node, 1, 50);
      };
      loraW.__AUN_multiHooked = true;
    }
  }
}

function startCompactLiveMonitor(node) {
  if (!node || node.__AUN_loraMultiMonitorId) return;
  let lastSignature = "";

  const readSignature = () => {
    const promptIdx = resolvePromptIndex(node);
    const parts = [String(promptIdx)];
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      const loraW = getWidget(node, `p${promptIdx}_lora${s}`);
      parts.push(String(loraW?.value ?? "None"));
    }
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

  const originalOnRemoved = node.onRemoved;
  node.onRemoved = function onRemoved() {
    if (node.__AUN_loraMultiMonitorId) {
      clearInterval(node.__AUN_loraMultiMonitorId);
      node.__AUN_loraMultiMonitorId = null;
    }
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

  // Hook setSize to enforce minimum height in compact mode
  const originalSetSize = node.setSize;
  node.setSize = function setSize(newSize) {
    if (
      this.__AUN_internalResize ||
      !isCompact(this) ||
      !Array.isArray(newSize)
    ) {
      return originalSetSize?.call(this, newSize);
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
      // Enforce minimum height - resize to minimum instead
      const constrainedSize = [currentWidth, minimumHeight];
      return originalSetSize?.call(this, constrainedSize);
    }

    return originalSetSize?.call(this, newSize);
  };

  // Draw compact status footer
  const originalDrawFg = node.onDrawForeground;
  node.onDrawForeground = function onDrawForeground(ctx) {
    // Enforce minimum height before drawing (catch direct size modifications)
    if (!this.__AUN_internalResize && isCompact(this)) {
      const currentWidth = Number(this.size?.[0]) || 200;
      const currentHeight = Number(this.size?.[1]);
      const minimumHeight = getMinimumCompactHeight(this, currentWidth);

      if (
        Number.isFinite(minimumHeight) &&
        Number.isFinite(currentHeight) &&
        currentHeight < minimumHeight
      ) {
        this.__AUN_internalResize = true;
        this.size[1] = minimumHeight;
        this.__AUN_internalResize = false;
      }
    }

    originalDrawFg?.apply(this, arguments);

    // Position compact overlay rows
    positionCompactRows(this, ctx);

    if (!isCompact(this) || isNodeCollapsed(this) || !showFooter(this)) return;

    const promptIdx = resolvePromptIndex(this);
    const triggers = resolveTriggersForDisplay(this);

    let headerText;
    let triggerText;
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

    // Wrap text helper
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

    // Draw header and triggers on same or wrapped lines
    if (triggerText) {
      const fullText = headerText + triggerText;
      const headerMetrics = ctx.measureText(headerText);

      if (
        headerMetrics.width + ctx.measureText(triggerText).width <=
        maxWidth
      ) {
        // Fits on one line
        ctx.fillText(fullText, startX, startY);
      } else {
        // Draw header on first line
        ctx.fillText(headerText, startX, startY);
        // Wrap trigger words starting on next line
        const wrappedTriggers = wrapText(triggerText);
        for (let i = 0; i < wrappedTriggers.length; i++) {
          ctx.fillText(
            wrappedTriggers[i],
            startX,
            startY + (i + 1) * lineHeight,
          );
        }
      }
    } else {
      // No triggers - just draw header
      ctx.fillText(headerText, startX, startY);
    }

    ctx.restore();
  };

  hookPromptIndexChange(node);
  hookNumPromptsChange(node);
  hookLoraChange(node);
  hookStrengthModelChange(node);
  startCompactLiveMonitor(node);

  applyCompact(node);
}

app.registerExtension({
  name: "AUN.RandomLoraMultiCompact",

  async setup() {
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
    if (!nodeData || nodeData.name !== NODE_TYPE) return;
    if (nodeType.prototype.__AUN_loraMultiProtoExecHooked) return;

    const originalOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function onExecuted(message) {
      originalOnExecuted?.apply(this, arguments);
      applyExecutionPayload(this, message);
    };
    nodeType.prototype.__AUN_loraMultiProtoExecHooked = true;
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
