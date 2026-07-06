import { app } from "../../scripts/app.js";
import { openLoraInfoDialog } from "./aun_lora_info_shared.js";
import { makeLoraLabelClickable } from "./aun_lora_dropdown_shared.js";

const NODE_TYPE = "AUNLoraStackWithTriggersModelClip";
const PROP_KEY = "_AUN_compactMode";
const PROP_SHOW_CLIP_STRENGTH = "_AUN_showClipStrengthInCompact";
const PROP_SHOW_FOOTER = "_AUN_showFooter";
const BASE_PROMPT_MIN_HEIGHT = 96;
const COMPACT_LABEL_HEIGHT = 28;
const MAX_SLOTS = 10;
const COMPACT_ROW_HEIGHT = 24;
const COMPACT_ROW_GAP = 3;
const COMPACT_SIDE_PADDING = 10;

const STATIC_WIDGETS = [
  "num_slots",
  "apply_stack",
  "trigger_joiner",
  "dedupe_triggers",
];

const SLOT_WIDGET_ORDER = [
  "lora",
  "strength_model",
  "strength_clip",
  "enabled",
  "trigger",
];

function getWidget(node, name) {
  return node?.widgets?.find((w) => w?.name === name) ?? null;
}

function isTargetNode(node) {
  return !!node && (node.comfyClass === NODE_TYPE || node.type === NODE_TYPE);
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

function showClipStrengthInCompact(node) {
  return node?.properties?.[PROP_SHOW_CLIP_STRENGTH] !== false;
}

function setShowClipStrengthInCompact(node, show) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_SHOW_CLIP_STRENGTH] = !!show;
}

function showFooter(node) {
  return node?.properties?.[PROP_SHOW_FOOTER] !== false;
}

function setShowFooter(node, show) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_SHOW_FOOTER] = !!show;
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
    node.__AUN_internalResize = true;
    node.setSize([width, height]);
    node.__AUN_internalResize = false;
    return;
  }
  node.size = [width, height];
}

function ensureCompactRowStyles() {
  if (window.__AUNLoraStackCompactRowStyle) return;
  const style = document.createElement("style");
  style.textContent = `
    .AUN-lora-stack-row {
      position: absolute;
      z-index: 12;
      display: none;
      grid-template-columns: minmax(0, 1fr) 64px 64px 34px;
      gap: 4px;
      align-items: center;
      padding: 1px 0;
      border-radius: 0;
      background: transparent;
      border: none;
      box-shadow: none;
      box-sizing: border-box;
      pointer-events: auto;
      overflow: hidden;
    }
    .AUN-lora-stack-row[data-hide-clip="true"] {
      grid-template-columns: minmax(0, 1fr) 64px 34px;
    }
    .AUN-lora-stack-row .AUN-lora-label {
      width: 100%;
      min-width: 0;
      height: 20px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 16px;
      align-items: center;
      gap: 4px;
      padding: 0 6px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 5px;
      background: #242424;
      color: #d8d8d8;
      box-sizing: border-box;
      font: 11px sans-serif;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .AUN-lora-stack-row .AUN-lora-label-text {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      cursor: pointer;
    }
    .AUN-lora-stack-row .AUN-lora-label-text:hover {
      color: #fff;
    }
    .AUN-lora-stack-row .AUN-lora-info-btn {
      width: 16px;
      height: 16px;
      padding: 0;
      border: 1px solid rgba(150, 200, 255, 0.28);
      border-radius: 999px;
      background: rgba(110, 170, 240, 0.16);
      color: #edf6ff;
      font: 10px/1 sans-serif;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
    }
    .AUN-lora-stack-row .AUN-lora-info-btn:hover {
      background: rgba(110, 170, 240, 0.24);
      border-color: rgba(181, 218, 255, 0.38);
      transform: translateY(-1px);
    }
    .AUN-lora-stack-row .AUN-lora-info-btn:focus-visible {
      outline: 1px solid rgba(188, 220, 255, 0.9);
      outline-offset: 1px;
    }
    .AUN-lora-stack-row .AUN-strength-control {
      width: 100%;
      min-width: 0;
      height: 20px;
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .AUN-lora-stack-row .AUN-strength-btn {
      width: 12px;
      min-width: 12px;
      height: 20px;
      padding: 0;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px;
      background: #242424;
      color: #d8d8d8;
      box-sizing: border-box;
      font: 9px sans-serif;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }
    .AUN-lora-stack-row .AUN-strength-btn:active {
      background: #2d2d2d;
    }
    .AUN-lora-stack-row .AUN-model-input,
    .AUN-lora-stack-row .AUN-clip-input,
    .AUN-lora-stack-row select,
    .AUN-lora-stack-row input[type="number"] {
      width: 100%;
      min-width: 0;
      height: 20px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 5px;
      background: #242424;
      color: #d8d8d8;
      padding: 0 4px;
      box-sizing: border-box;
      font: 11px sans-serif;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }
    .AUN-lora-stack-row input[type="number"] {
      appearance: textfield;
      -moz-appearance: textfield;
    }
    .AUN-lora-stack-row input[type="number"]::-webkit-outer-spin-button,
    .AUN-lora-stack-row input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .AUN-lora-stack-row input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 26px;
      height: 14px;
      margin: 0;
      justify-self: start;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      background: #242424;
      box-sizing: border-box;
      position: relative;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .AUN-lora-stack-row input[type="checkbox"]::before {
      content: "";
      position: absolute;
      top: 1px;
      left: 1px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #b7b7b7;
      box-shadow: 0 1px 2px rgba(0,0,0,0.35);
      transition: transform 120ms ease, background 120ms ease;
    }
    .AUN-lora-stack-row input[type="checkbox"]:checked {
      background: #4a5860;
      border-color: rgba(255,255,255,0.2);
    }
    .AUN-lora-stack-row input[type="checkbox"]:checked::before {
      transform: translateX(12px);
      background: #d8d8d8;
    }
    .AUN-lora-stack-row input[type="checkbox"]:focus-visible {
      outline: 1px solid rgba(180, 210, 255, 0.8);
      outline-offset: 1px;
    }
    .AUN-lora-stack-row select {
      text-overflow: ellipsis;
    }
    .AUN-lora-stack-row .AUN-clip-input {
      display: block;
    }
    .AUN-lora-stack-row[data-hide-clip="true"] .AUN-clip-input,
    .AUN-lora-stack-row[data-hide-clip="true"] .AUN-clip-control {
      display: none;
    }
    .AUN-lora-stack-row {
      transition: opacity 80ms ease, background-color 100ms ease;
    }
    .AUN-lora-stack-row.dragging {
      background-color: rgba(100, 170, 255, 0.08);
    }
    .AUN-lora-stack-row[draggable="true"] .AUN-lora-label {
      cursor: grab;
    }
    .AUN-lora-stack-row[draggable="true"] .AUN-lora-label:active {
      cursor: grabbing;
    }
    .AUN-lora-stack-footer {
      position: absolute;
      z-index: 12;
      display: none;
      overflow-y: auto;
      box-sizing: border-box;
      pointer-events: auto;
      font: 11px sans-serif;
      color: rgba(220,220,220,0.9);
      padding: 2px 6px;
      background: transparent;
      white-space: normal;
      word-break: break-word;
      border-radius: 0;
      border: none;
    }
    .AUN-lora-stack-footer::-webkit-scrollbar {
      width: 5px;
    }
    .AUN-lora-stack-footer::-webkit-scrollbar-track {
      background: transparent;
    }
    .AUN-lora-stack-footer::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
    }
    .AUN-lora-stack-footer::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.35);
    }
    .AUN-lora-stack-footer b {
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
  window.__AUNLoraStackCompactRowStyle = style;
}

function setWidgetValue(widget, value) {
  if (!widget) return;
  widget.value = value;
  widget.callback?.call(widget, value);
}

function appendTriggerWord(node, slotIndex, word) {
  const widget = getWidget(node, `trigger_${slotIndex}`);
  const text = String(word || "").trim();
  if (!widget || !text) {
    throw new Error("No trigger field available for this LoRA slot.");
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

function syncHiddenClipStrengths(node) {
  if (!isTargetNode(node) || showClipStrengthInCompact(node)) return;
  for (let i = 1; i <= MAX_SLOTS; i += 1) {
    const modelWidget = getWidget(node, `strength_model_${i}`);
    const clipWidget = getWidget(node, `strength_clip_${i}`);
    if (!modelWidget || !clipWidget) continue;
    const nextValue = Number(modelWidget.value);
    if (!Number.isFinite(nextValue)) continue;
    if (Number(clipWidget.value) === nextValue) continue;
    setWidgetValue(clipWidget, nextValue);
  }
}

function formatCompactLoraLabel(value) {
  const base = loraBasename(value) ?? String(value ?? "").trim();
  if (!base) return "";
  if (base === "None") return "None";
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function stopCanvasEvent(event) {
  event?.stopPropagation?.();
}

function clampNumber(value, min, max) {
  let next = value;
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  return next;
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

function buildCompactRow(node, slotIndex) {
  ensureCompactRowStyles();
  const row = document.createElement("div");
  row.className = "AUN-lora-stack-row";
  row.dataset.slot = String(slotIndex);

  const loraLabel = document.createElement("div");
  loraLabel.className = "AUN-lora-label";

  const loraLabelText = document.createElement("span");
  loraLabelText.className = "AUN-lora-label-text";

  makeLoraLabelClickable(node, `lora_${slotIndex}`, loraLabel, loraLabelText, {
    formatLabel: formatCompactLoraLabel,
    onChanged: (n) => { applyCompact(n); forceRedraw(n); },
  });

  const infoButton = document.createElement("button");
  infoButton.type = "button";
  infoButton.className = "AUN-lora-info-btn";
  infoButton.textContent = "i";
  infoButton.title = `Show LoRA info ${slotIndex}`;

  loraLabel.append(loraLabelText, infoButton);

  const strengthModelControl = document.createElement("div");
  strengthModelControl.className = "AUN-strength-control";

  const strengthModelDec = document.createElement("button");
  strengthModelDec.type = "button";
  strengthModelDec.className = "AUN-strength-btn";
  strengthModelDec.textContent = "-";
  strengthModelDec.title = `Decrease model strength ${slotIndex}`;

  const strengthModel = document.createElement("input");
  strengthModel.type = "text";
  strengthModel.inputMode = "decimal";
  strengthModel.pattern = "^\\d*(\\.\\d{0,2})?$";
  strengthModel.className = "AUN-model-input";
  strengthModel.title = `Model strength ${slotIndex}`;

  const strengthModelInc = document.createElement("button");
  strengthModelInc.type = "button";
  strengthModelInc.className = "AUN-strength-btn";
  strengthModelInc.textContent = "+";
  strengthModelInc.title = `Increase model strength ${slotIndex}`;

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
  strengthClip.title = `Clip strength ${slotIndex}`;

  const strengthClipDec = document.createElement("button");
  strengthClipDec.type = "button";
  strengthClipDec.className = "AUN-strength-btn";
  strengthClipDec.textContent = "-";
  strengthClipDec.title = `Decrease clip strength ${slotIndex}`;

  const strengthClipInc = document.createElement("button");
  strengthClipInc.type = "button";
  strengthClipInc.className = "AUN-strength-btn";
  strengthClipInc.textContent = "+";
  strengthClipInc.title = `Increase clip strength ${slotIndex}`;

  strengthClipControl.append(strengthClipDec, strengthClip, strengthClipInc);
  strengthClipControl.classList.add("AUN-clip-control");

  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.title = `Enable slot ${slotIndex}`;

  row.append(loraLabel, strengthModelControl, strengthClipControl, enabled);
  document.body.appendChild(row);

  // Only block pointer/mouse events on the row, not the input fields
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

  const openInfo = async (event) => {
    stopCanvasEvent(event);
    event?.preventDefault?.();
    const loraValue = String(
      getWidget(node, `lora_${slotIndex}`)?.value ?? "None",
    );
    if (!loraValue || loraValue === "None") return;
    await openLoraInfoDialog(loraValue, {
      insertWord: (word) => appendTriggerWord(node, slotIndex, word),
    });
  };

  infoButton.addEventListener("pointerdown", (event) => {
    stopCanvasEvent(event);
    event.preventDefault?.();
  });
  infoButton.addEventListener("click", openInfo);

  const bindNumberInput = (inputEl, widgetName) => {
    // Format value to always show two decimals
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
      // Accept only valid float input (allow leading/trailing dot, but parse as float)
      let parsed = parseFloat(rawValue);
      const step = Number(widget?.options?.step ?? 0.01);
      const min = Number(widget?.options?.min);
      const max = Number(widget?.options?.max);
      const fallback = Number(widget?.value ?? 0);
      // Truncate to two decimals instead of rounding
      let nextValue = Number.isFinite(parsed)
        ? clampNumber(truncateToDecimals(parsed, 2), min, max)
        : fallback;
      setWidgetValue(widget, nextValue);
      inputEl.value = formatValue(nextValue);
    };

    inputEl.addEventListener("input", () => {
      // Allow any valid float input, including partials (".", ".5", etc.)
      const val = inputEl.value;
      // Only sanitize if truly invalid (multiple dots, letters, etc.)
      if (/^\d*\.?\d*$/.test(val)) {
        // Let user type freely; do not commit yet
      } else {
        // Remove invalid chars except first dot
        let sanitized = val.replace(/[^\d.]/g, "");
        // Only allow one dot
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
      // Allow all other keys (digits, decimal, arrows, backspace, etc.)
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
      const step = Number(widget?.options?.step ?? inputEl.step ?? 0.01);
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

  enabled.addEventListener("change", () => {
    setWidgetValue(getWidget(node, `enabled_${slotIndex}`), !!enabled.checked);
    applyCompact(node);
  });

  const modelBinding = bindNumberInput(
    strengthModel,
    `strength_model_${slotIndex}`,
  );
  const clipBinding = bindNumberInput(
    strengthClip,
    `strength_clip_${slotIndex}`,
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
    event.dataTransfer.setData("text/plain", JSON.stringify({ slotIndex }));
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
      if (draggedData.slotIndex !== slotIndex) {
        // Guard flag: prevent lora widget callbacks from clearing trigger words mid-swap
        node.__AUN_stackSwapping = true;
        // Swap LoRA values between slots
        const fields = [
          "lora",
          "strength_model",
          "strength_clip",
          "trigger",
          "enabled",
        ];
        let swapped = false;

        for (const field of fields) {
          const fromWidgetName = `${field}_${draggedData.slotIndex}`;
          const toWidgetName = `${field}_${slotIndex}`;
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
          applyCompact(node);
          const rows = node.__AUN_compactRows;
          if (rows && Array.isArray(rows)) {
            for (const r of rows) {
              syncCompactRow(node, r);
            }
          }
          forceRedraw(node);
          updateAutoHeight(node);
        }
        node.__AUN_stackSwapping = false;
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
    slotIndex,
    root: row,
    loraLabel,
    loraLabelText,
    infoButton,
    strengthModel,
    strengthClip,
    enabled,
  };
}

function ensureCompactRows(node) {
  if (Array.isArray(node.__AUN_compactRows)) return node.__AUN_compactRows;
  node.__AUN_compactRows = [];
  for (let i = 1; i <= MAX_SLOTS; i += 1) {
    node.__AUN_compactRows.push(buildCompactRow(node, i));
  }
  return node.__AUN_compactRows;
}

function ensureCompactFooter(node) {
  if (node.__AUN_compactFooter) return node.__AUN_compactFooter;
  const el = document.createElement("div");
  el.className = "AUN-lora-stack-footer";
  document.body.appendChild(el);
  node.__AUN_compactFooter = el;
  return el;
}

function disposeCompactRows(node) {
  for (const row of node.__AUN_compactRows ?? []) {
    row.root?.remove?.();
  }
  node.__AUN_compactRows = null;
  node.__AUN_compactFooter?.remove?.();
  node.__AUN_compactFooter = null;
}

function syncCompactRow(node, row, showClipStrength) {
  const slotIndex = row.slotIndex;
  const loraWidget = getWidget(node, `lora_${slotIndex}`);
  const strengthModelWidget = getWidget(node, `strength_model_${slotIndex}`);
  const strengthClipWidget = getWidget(node, `strength_clip_${slotIndex}`);
  const enabledWidget = getWidget(node, `enabled_${slotIndex}`);
  const loraValue = String(loraWidget?.value ?? "None") || "None";
  const hasLora = !!loraValue && loraValue !== "None";

  row.root.dataset.hideClip = showClipStrength ? "false" : "true";
  row.loraLabelText.textContent = formatCompactLoraLabel(loraValue);
  row.infoButton.title = hasLora
    ? `Show LoRA info for ${loraValue}`
    : "No LoRA selected";
  row.infoButton.style.visibility = hasLora ? "visible" : "hidden";
  // Only update value if input is not focused (prevents overwriting user typing)
  if (document.activeElement !== row.strengthModel) {
    row.strengthModel.value = Number(strengthModelWidget?.value ?? 1).toFixed(
      2,
    );
  }
  if (document.activeElement !== row.strengthClip) {
    row.strengthClip.value = Number(strengthClipWidget?.value ?? 1).toFixed(2);
  }
  row.enabled.checked = !!enabledWidget?.value;
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

function positionCompactRowsCore(node, canvasRect, scale, offsetX, offsetY, numSlots, showClipStrength, occluded) {
  const rows = ensureCompactRows(node);
  const currentWidth = node.size?.[0] ?? 360;
  const runtimeRowY = getWidgetBottomY(getWidget(node, "apply_stack"));
  const baseY = Number.isFinite(runtimeRowY)
    ? runtimeRowY + 8
    : getCompactLayoutMetrics(node).firstCompactRowY;
  if (
    Number.isFinite(baseY) &&
    Math.abs((node.__AUN_compactFirstRowY ?? 0) - baseY) > 1
  ) {
    node.__AUN_compactFirstRowY = baseY;
    updateAutoHeight(node);
    scheduleCompactHeightRefresh(node);
  }
  const innerWidth = currentWidth - COMPACT_SIDE_PADDING * 2;
  const nodeX = node.pos?.[0] ?? 0;
  const nodeY = node.pos?.[1] ?? 0;
  let anyShown = false;
  for (const row of rows) {
    if (row.slotIndex > numSlots || occluded) {
      row.root.style.display = "none";
      continue;
    }
    syncCompactRow(node, row, showClipStrength);
    const localTop =
      baseY + (row.slotIndex - 1) * (COMPACT_ROW_HEIGHT + COMPACT_ROW_GAP);
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

  // Position footer overlay
  const footerEl = ensureCompactFooter(node);
  if (showFooter(node) && !occluded) {
    const footerHeight = getCompactFooterHeight(node);
    const h = node.size?.[1] ?? 240;
    const y0 = h - footerHeight + 3;
    const y1 = h - 6;
    const graphLeft = nodeX + 8;
    const graphTop = nodeY + y0;
    const graphRight = nodeX + currentWidth - 8;
    const graphBottom = nodeY + y1;

    const screenTL = graphToScreen(canvasRect, graphLeft, graphTop, scale, offsetX, offsetY);
    const screenBR = graphToScreen(canvasRect, graphRight, graphBottom, scale, offsetX, offsetY);

    // Populate content (only on change — avoids resetting scroll position)
    const triggers = resolveStackTriggersForDisplay(node);
    const newText = triggers ? triggers.join(", ") : null;
    const cache = footerEl.__AUN_footerCache;
    if (cache !== newText) {
      footerEl.__AUN_footerCache = newText;
      if (newText) {
        footerEl.textContent = "";
        const b = document.createElement("b");
        b.textContent = "Stack trigger words: ";
        footerEl.appendChild(b);
        footerEl.appendChild(document.createTextNode(newText));
      } else {
        footerEl.textContent = "Stack trigger words (none)";
      }
    }

    Object.assign(footerEl.style, {
      display: "block",
      left: `${screenTL.x}px`,
      top: `${screenTL.y}px`,
      width: `${Math.max(20, screenBR.x - screenTL.x)}px`,
      height: `${Math.max(20, screenBR.y - screenTL.y)}px`,
    });

    footerEl.style.pointerEvents = "auto";
  } else {
    footerEl.style.display = "none";
  }

  return anyShown;
}

function positionCompactRows(node, ctx) {
  if (!isTargetNode(node)) return;
  const rows = ensureCompactRows(node);
  const compact = isCompact(node);
  const collapsed = isNodeCollapsed(node);

  // Hide all rows if: not compact, collapsed, no canvas, or node being dragged
  const nodeDragging = node.__AUN_nodeBeingDragged;

  if (!compact || collapsed || !ctx?.canvas || nodeDragging) {
    for (const row of rows) {
      row.root.style.display = "none";
    }
    if (node.__AUN_compactFooter) node.__AUN_compactFooter.style.display = "none";
    return;
  }

  const canvasRect = ctx.canvas.getBoundingClientRect();
  const ds = app?.canvas?.ds;
  if (!ds) {
    for (const row of rows) {
      row.root.style.display = "none";
    }
    if (node.__AUN_compactFooter) node.__AUN_compactFooter.style.display = "none";
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
    if (node.__AUN_compactFooter) node.__AUN_compactFooter.style.display = "none";
    return;
  }

  const numSlots = getNumSlots(node);
  const showClipStrength = showClipStrengthInCompact(node);
  positionCompactRowsCore(node, canvasRect, scale, offsetX, offsetY, numSlots, showClipStrength, isNodeOccluded(node, canvasRect, scale, offsetX, offsetY));
}

function positionCompactRowsFromCanvas(node) {
  if (!isTargetNode(node)) return;
  const rows = ensureCompactRows(node);
  const compact = isCompact(node);
  const collapsed = isNodeCollapsed(node);
  if (!compact || collapsed) {
    for (const row of rows) row.root.style.display = "none";
    if (node.__AUN_compactFooter) node.__AUN_compactFooter.style.display = "none";
    return;
  }
  const canvas = app?.canvas;
  if (!canvas || !canvas.canvas || !canvas.ds) {
    for (const row of rows) row.root.style.display = "none";
    if (node.__AUN_compactFooter) node.__AUN_compactFooter.style.display = "none";
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
    if (node.__AUN_compactFooter) node.__AUN_compactFooter.style.display = "none";
    return;
  }
  const numSlots = getNumSlots(node);
  const showClipStrength = showClipStrengthInCompact(node);
  positionCompactRowsCore(node, canvasRect, scale, offsetX, offsetY, numSlots, showClipStrength, isNodeOccluded(node, canvasRect, scale, offsetX, offsetY));
}

let compactRowsRAF = null;
function hasCompactLoraNodes() {
  if (!app?.graph) return false;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  return nodes.some((n) => isTargetNode(n) && isCompact(n));
}

function startCompactRowsRAF() {
  if (compactRowsRAF) return;
  function rafLoop() {
    compactRowsRAF = requestAnimationFrame(rafLoop);
    if (!app?.graph) return;
    const nodes = app.graph._nodes || app.graph.nodes || [];
    for (const n of nodes) {
      if (isTargetNode(n) && isCompact(n)) {
        positionCompactRowsFromCanvas(n);
      }
    }
    if (!hasCompactLoraNodes()) {
      cancelAnimationFrame(compactRowsRAF);
      compactRowsRAF = null;
    }
  }
  rafLoop();
}

function stopCompactRowsRAF() {
  if (compactRowsRAF) {
    cancelAnimationFrame(compactRowsRAF);
    compactRowsRAF = null;
  }
}

function scheduleCompactRowsUpdate() {
  if (!compactRowsRAF) {
    startCompactRowsRAF();
  }
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

function resolveStackTriggersForDisplay(node) {
  // When apply_stack is off, hide trigger words (same as per-slot disable behavior)
  const applyStackW = getWidget(node, "apply_stack");
  if (!applyStackW?.value) return null;

  const numSlots = getNumSlots(node);
  const triggers = [];
  for (let i = 1; i <= numSlots; i++) {
    const enabledWidget = getWidget(node, `enabled_${i}`);
    const triggerWidget = getWidget(node, `trigger_${i}`);
    if (!enabledWidget?.value || !triggerWidget) continue;
    const triggerValue = String(triggerWidget.value ?? "").trim();
    if (triggerValue) {
      triggers.push(triggerValue);
    }
  }
  return triggers.length > 0 ? triggers : null;
}

function getCompactFooterHeight(node) {
  if (!isCompact(node) || isNodeCollapsed(node) || !showFooter(node)) return 0;
  return 42;
}

function getWidgetBottomY(widget) {
  const widgetY = Number(widget?.last_y ?? widget?.y);
  if (!Number.isFinite(widgetY)) return null;
  const widgetHeight = globalThis.LiteGraph?.NODE_WIDGET_HEIGHT ?? 24;
  return widgetY + widgetHeight;
}

function getEstimatedCompactRowY(node) {
  const titleHeight = globalThis.LiteGraph?.NODE_TITLE_HEIGHT ?? 30;
  const slotHeight = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  const widgetHeight = globalThis.LiteGraph?.NODE_WIDGET_HEIGHT ?? 24;
  const socketRows = Math.max(
    node.inputs?.length || 0,
    node.outputs?.length || 0,
    1,
  );
  const socketAreaHeight = socketRows * slotHeight;
  const firstWidgetY = titleHeight + socketAreaHeight + 6;
  return firstWidgetY + widgetHeight + 8;
}

function getCompactLayoutMetrics(node) {
  const storedRowY = Number(node?.__AUN_compactFirstRowY);
  const firstCompactRowY = Number.isFinite(storedRowY)
    ? storedRowY
    : getEstimatedCompactRowY(node);
  return {
    firstCompactRowY,
  };
}

function getMinimumCompactHeight(node) {
  const firstCompactRowY = getCompactLayoutMetrics(node).firstCompactRowY;
  const numSlots = getNumSlots(node);
  const footerHeight = getCompactFooterHeight(node);
  return (
    firstCompactRowY +
    numSlots * COMPACT_ROW_HEIGHT +
    Math.max(0, numSlots - 1) * COMPACT_ROW_GAP +
    footerHeight +
    10
  );
}

function scheduleCompactHeightRefresh(node, delay = 0) {
  if (!isTargetNode(node)) return;
  if (node.__AUN_compactHeightTimer) {
    clearTimeout(node.__AUN_compactHeightTimer);
    node.__AUN_compactHeightTimer = null;
  }
  node.__AUN_compactHeightTimer = setTimeout(() => {
    node.__AUN_compactHeightTimer = null;
    if (!node || !isCompact(node)) return;
    updateAutoHeight(node);
    forceRedraw(node);
  }, delay);
}

function scheduleCompactLoadStabilization(node, attempts = 3, delay = 0) {
  if (!isTargetNode(node)) return;
  if (node.__AUN_compactLoadTimer) {
    clearTimeout(node.__AUN_compactLoadTimer);
    node.__AUN_compactLoadTimer = null;
  }
  node.__AUN_compactLoadTimer = setTimeout(() => {
    node.__AUN_compactLoadTimer = null;
    if (!node || node.type === undefined || !isCompact(node)) return;
    node.__AUN_manualCompactHeight = null;
    node.__AUN_manualCompactSlots = null;
    updateAutoHeight(node);
    forceRedraw(node);
    if (attempts > 1) {
      scheduleCompactLoadStabilization(node, attempts - 1, 50);
    } else {
      node.__AUN_restoreLayoutPending = false;
      forceRedraw(node);
    }
  }, delay);
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
    if (widget?.name) widgetMap.set(widget.name, widget);
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
    if (!seen.has(widget)) ordered.push(widget);
  }
  node.widgets = ordered;
}

function updateAutoHeight(node) {
  if (!isTargetNode(node)) return;
  const compact = isCompact(node);
  const currentWidth = node.size?.[0] ?? 240;

  if (compact) {
    const numSlots = getNumSlots(node);
    const minimumCompactHeight = getMinimumCompactHeight(node);
    const hasManualCompactHeight =
      Number.isFinite(node.__AUN_manualCompactHeight) &&
      node.__AUN_manualCompactSlots === numSlots;
    const compactHeight = hasManualCompactHeight
      ? Math.max(node.__AUN_manualCompactHeight, minimumCompactHeight)
      : minimumCompactHeight;
    setNodeSize(node, currentWidth, compactHeight);
    node.__AUN_lastAutoCompactHeight = minimumCompactHeight;
    return;
  }

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

function applyCompact(node) {
  if (!isTargetNode(node)) return;
  reorderWidgets(node);
  const compact = isCompact(node);
  const numSlots = getNumSlots(node);
  const showClipStrength = showClipStrengthInCompact(node);

  syncHiddenClipStrengths(node);

  for (const name of STATIC_WIDGETS) {
    const widget = getWidget(node, name);
    if (!widget) continue;
    ensureHiddenAwareWidget(widget);
    applyWidgetHiddenState(widget, compact && name !== "apply_stack");
  }

  for (let i = 1; i <= MAX_SLOTS; i += 1) {
    const isActiveSlot = i <= numSlots;
    const loraWidget = getWidget(node, `lora_${i}`);
    const strengthModelWidget = getWidget(node, `strength_model_${i}`);
    const strengthClipWidget = getWidget(node, `strength_clip_${i}`);
    const enabledWidget = getWidget(node, `enabled_${i}`);
    const triggerWidget = getWidget(node, `trigger_${i}`);

    for (const widget of [
      loraWidget,
      strengthModelWidget,
      strengthClipWidget,
      enabledWidget,
      triggerWidget,
    ]) {
      if (!widget) continue;
      ensureHiddenAwareWidget(widget);
    }

    normalizeLoraWidgetValue(loraWidget);

    applyWidgetHiddenState(loraWidget, !isActiveSlot || compact);
    applyWidgetHiddenState(strengthModelWidget, !isActiveSlot || compact);
    applyWidgetHiddenState(
      strengthClipWidget,
      !isActiveSlot || compact || !showClipStrength,
    );
    applyWidgetHiddenState(enabledWidget, !isActiveSlot || compact);
    applyWidgetHiddenState(triggerWidget, !isActiveSlot || compact);
  }

  updateAutoHeight(node);
  if (compact) {
    scheduleCompactHeightRefresh(node);
    scheduleCompactRowsUpdate();
  }
  forceRedraw(node);
}

function hookWidgetRedraw(node, widgetName, extraAction) {
  const widget = getWidget(node, widgetName);
  if (!widget || widget.__AUN_stackHooked) return;
  const original = widget.callback;
  widget.callback = function callback(value) {
    original?.call(widget, value);
    extraAction?.(value);
    // Clear associated trigger words when LoRA is changed or removed
    if (!node.__AUN_stackSwapping) {
      const match = widgetName.match(/^lora_(\d+)$/);
      if (match) {
        const triggerW = getWidget(node, `trigger_${match[1]}`);
        if (triggerW) {
          triggerW.value = "";
          triggerW.callback?.call(triggerW, "");
        }
      }
    }
    forceRedraw(node);
  };
  widget.__AUN_stackHooked = true;
}

function setupCanvasTransformMonitor() {
  const canvas = app?.canvas;
  if (!canvas || canvas.__AUN_transformMonitorSetup) return;
  canvas.__AUN_transformMonitorSetup = true;

  // Ensure the RAF loop runs during canvas interactions (pan/zoom)
  // so overlay positions stay in sync.
  const domCanvas = canvas.canvas;
  if (domCanvas) {
    domCanvas.addEventListener("mousedown", () => {
      scheduleCompactRowsUpdate();
    });
    domCanvas.addEventListener("wheel", () => {
      scheduleCompactRowsUpdate();
    }, { passive: true });
  }
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
      parts.push(String(getWidget(node, `strength_clip_${i}`)?.value ?? ""));
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

  const hideAllRows = () => {
    if (node?.__AUN_compactRows) {
      for (const row of node.__AUN_compactRows) {
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
    disposeCompactRows(node);
    if (node.__AUN_compactHeightTimer) {
      clearTimeout(node.__AUN_compactHeightTimer);
      node.__AUN_compactHeightTimer = null;
    }
    if (node.__AUN_compactLoadTimer) {
      clearTimeout(node.__AUN_compactLoadTimer);
      node.__AUN_compactLoadTimer = null;
    }
    node.__AUN_restoreLayoutPending = false;
    if (node.__AUN_stackMonitorId) {
      clearInterval(node.__AUN_stackMonitorId);
      node.__AUN_stackMonitorId = null;
    }
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    hideAllRows();
    return originalOnRemoved?.apply(this, arguments);
  };
}

function toggleCompactMode(node) {
  setCompact(node, !isCompact(node));
  applyCompact(node);
}

function toggleCompactClipStrength(node) {
  setShowClipStrengthInCompact(node, !showClipStrengthInCompact(node));
  applyCompact(node);
}

function resetCompactRuntimeState(node) {
  if (!isTargetNode(node)) return;
  node.__AUN_compactFirstRowY = null;
  node.__AUN_manualCompactHeight = null;
  node.__AUN_manualCompactSlots = null;
  node.__AUN_lastAutoCompactHeight = null;
  if (node.__AUN_compactHeightTimer) {
    clearTimeout(node.__AUN_compactHeightTimer);
    node.__AUN_compactHeightTimer = null;
  }
  if (node.__AUN_compactLoadTimer) {
    clearTimeout(node.__AUN_compactLoadTimer);
    node.__AUN_compactLoadTimer = null;
  }
}

function setupNode(node) {
  if (!isTargetNode(node) || node.__AUN_stackInit) return;
  node.__AUN_stackInit = true;
  reorderWidgets(node);
  node.properties = node.properties || {};
  if (typeof node.properties[PROP_KEY] !== "boolean") {
    setCompact(node, true);
  }
  if (typeof node.properties[PROP_SHOW_CLIP_STRENGTH] !== "boolean") {
    setShowClipStrengthInCompact(node, true);
  }
  ensureCompactRows(node);
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

  // Instance-level handlers (onDblClick, getExtraMenuOptions, onResize, onDrawBackground, onDrawForeground)
  // are now set on the prototype in beforeRegisterNodeDef — no need to duplicate here.

  hookWidgetRedraw(node, "num_slots", () => applyCompact(node));
  hookWidgetRedraw(node, "apply_stack");
  for (let i = 1; i <= MAX_SLOTS; i += 1) {
    hookWidgetRedraw(node, `lora_${i}`);
    hookWidgetRedraw(node, `strength_model_${i}`);
    hookWidgetRedraw(node, `strength_clip_${i}`);
    hookWidgetRedraw(node, `enabled_${i}`);
    hookWidgetRedraw(node, `trigger_${i}`);
  }
  startLiveMonitor(node);
  applyCompact(node);
}

function initExistingNodes() {
  if (!app?.graph) return;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  let initialized = false;
  for (const node of nodes) {
    if (isTargetNode(node) && !node.__AUN_stackInit) {
      setupNode(node);
      resetCompactRuntimeState(node);
      node.__AUN_restoreLayoutPending = true;
      applyCompact(node);
      scheduleCompactLoadStabilization(node, 4, 50);
      initialized = true;
    }
  }
  return initialized;
}

// Persistent global scanner: catches nodes created after initial load
// (e.g., via context menu reload, graph paste, dynamic node creation)
let __AUN_stackScanTimer = null;
function startStackScanner() {
  if (__AUN_stackScanTimer) return;
  __AUN_stackScanTimer = setInterval(() => {
    initExistingNodes();
  }, 2000);
}

app.registerExtension({
  name: "AUN.LoraStackWithTriggersModelClip",
  async setup() {
    initExistingNodes();
    startStackScanner();
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
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
      options.push({
        content: isCompact(this) ? "AUN: Show all controls" : "AUN: Compact mode",
        callback: () => toggleCompactMode(this),
      });
      options.push({
        content: showClipStrengthInCompact(this)
          ? "AUN: Hide clip strength"
          : "AUN: Show clip strength",
        callback: () => toggleCompactClipStrength(this),
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
      const currentWidth = Number(this.size?.[0]) || 240;
      const currentHeight = Number(this.size?.[1]);
      const minimumCompactHeight = getMinimumCompactHeight(this);
      const clampedHeight = Number.isFinite(currentHeight)
        ? Math.max(currentHeight, minimumCompactHeight)
        : minimumCompactHeight;
      if (clampedHeight !== currentHeight) {
        this.__AUN_internalResize = true;
        if (typeof this.setSize === "function") {
          this.setSize([currentWidth, clampedHeight]);
        } else {
          this.size = Array.isArray(this.size)
            ? this.size
            : [currentWidth, clampedHeight];
          this.size[0] = currentWidth;
          this.size[1] = clampedHeight;
        }
        this.__AUN_internalResize = false;
      }
      if (Number.isFinite(clampedHeight)) {
        this.__AUN_manualCompactHeight = clampedHeight;
        this.__AUN_manualCompactSlots = getNumSlots(this);
      }
      return result;
    };

    // onDrawBackground
    const protoOrigDrawBg = nodeType.prototype.onDrawBackground;
    nodeType.prototype.onDrawBackground = function onDrawBackground(ctx) {
      protoOrigDrawBg?.apply(this, arguments);
      positionCompactRows(this, ctx);
    };

    // onDrawForeground
    const protoOrigDrawFg = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function onDrawForeground(ctx) {
      protoOrigDrawFg?.apply(this, arguments);

      if (!isCompact(this) || isNodeCollapsed(this) || !showFooter(this)) return;

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
      ctx.restore();
    };
  },

  nodeCreated(node) {
    setupNode(node);
  },
  loadedGraphNode(node) {
    if (!isTargetNode(node)) return;
    setupNode(node);
    resetCompactRuntimeState(node);
    node.__AUN_restoreLayoutPending = true;
    applyCompact(node);
    scheduleCompactLoadStabilization(node, 4, 50);
  },
});
